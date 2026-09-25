/**
 * [5] Shift / Cash — đối soát két và giao ca.
 * Nguồn: LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md §2.2, FEATURE-TREE-V1.md §2 mục [5].
 */

var _sh = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    S: GIEO.require('commands/shift'),
    STORE: ids.deterministicId('store', ['main']),
    A1: ids.deterministicId('actor', ['ca-sang']),
    A2: ids.deterministicId('actor', ['ca-chieu'])
  };
})();

function seg1(startCash) {
  return assertOk(_sh.S.openSegment({
    storeId: _sh.STORE, businessDate: '2026-03-10', seq: 1,
    startCash: startCash === undefined ? 500000 : startCash, actorId: _sh.A1, at: 1000
  }));
}

function withSales(s, amount) {
  return assertOk(_sh.S.recordCashMovement(s, { amount: amount, direction: 'IN' }));
}

function counted(s, cash, actorId) {
  return assertOk(_sh.S.addCount(s, { countedCash: cash, at: 2000, actorId: actorId || _sh.A1 }));
}

function closed(s, actorId) {
  return assertOk(_sh.S.closeSegment(s, {
    actorId: actorId || _sh.A1, at: 3000,
    operationId: _sh.ids.deterministicId('operation', ['closeseg', String(s.seq)])
  }));
}

describe('commands/shift — đoạn ca', function () {
  var S = _sh.S;

  test('segmentId xác định theo store+ngày+seq', function () {
    assert.strictEqual(seg1().segmentId, seg1().segmentId);
  });

  test('expected = start + thu - chi; variance = đếm thật - expected', function () {
    var s = closed(counted(withSales(seg1(500000), 2000000), 2500000));
    assert.strictEqual(s.expectedEndCash, 2500000);
    assert.strictEqual(s.variance, 0);
  });

  test('hụt két ra số âm', function () {
    var s = closed(counted(withSales(seg1(500000), 2000000), 2450000));
    assert.strictEqual(s.variance, -50000);
  });

  test('dư két ra số dương', function () {
    var s = closed(counted(withSales(seg1(500000), 2000000), 2530000));
    assert.strictEqual(s.variance, 30000);
  });

  test('chi tiền mặt trừ vào số kỳ vọng', function () {
    var s = withSales(seg1(500000), 2000000);
    s = assertOk(S.recordCashMovement(s, { amount: 300000, direction: 'OUT' }));
    assert.strictEqual(closed(counted(s, 2200000)).expectedEndCash, 2200000);
  });

  test('số tiền âm bị từ chối — chiều do direction quyết định', function () {
    assertErr(S.recordCashMovement(seg1(), { amount: -100, direction: 'IN' }), 'VALIDATION');
    assertErr(S.recordCashMovement(seg1(), { amount: 100, direction: 'SANG_NGANG' }), 'VALIDATION');
  });

  describe('đếm nhiều lần', function () {
    test('giữ ĐỦ các lần đếm, không chỉ lần cuối', function () {
      var s = counted(counted(withSales(seg1(500000), 2000000), 2450000), 2500000);
      assert.strictEqual(s.counts.length, 2);
      assert.strictEqual(s.counts[0].countedCash, 2450000);
      assert.strictEqual(s.counts[1].countedCash, 2500000);
    });

    test('chốt lấy lần đếm CUỐI, không trung bình các lần', function () {
      var s = closed(counted(counted(withSales(seg1(500000), 2000000), 2450000), 2500000));
      assert.strictEqual(s.actualEndCash, 2500000);
      assert.strictEqual(s.variance, 0);
    });

    test('chưa đếm lần nào thì KHÔNG chốt được', function () {
      assertErr(S.closeSegment(withSales(seg1(), 100), {
        actorId: _sh.A1, at: 3000, operationId: 'operation_x'
      }), 'PRECONDITION');
    });
  });

  test('đoạn đã chốt thì không ghi thêm/đếm thêm được', function () {
    var s = closed(counted(seg1(), 500000));
    assertErr(S.recordCashMovement(s, { amount: 100, direction: 'IN' }), 'PRECONDITION');
    assertErr(S.addCount(s, { countedCash: 1, at: 1, actorId: _sh.A1 }), 'PRECONDITION');
    assertErr(S.closeSegment(s, { actorId: _sh.A1, at: 1, operationId: 'operation_x' }), 'PRECONDITION');
  });
});

describe('giao ca — sai số KHÔNG cộng dồn (quyết định có chủ đích của legacy)', function () {
  var S = _sh.S;

  test('đoạn sau bắt đầu từ số ĐẾM ĐƯỢC, không phải số kỳ vọng', function () {
    /* Ca sáng hụt 50k. */
    var s1 = closed(counted(withSales(seg1(500000), 2000000), 2450000), _sh.A1);
    assert.strictEqual(s1.variance, -50000);

    var s2 = assertOk(S.nextSegment(s1, { actorId: _sh.A2, at: 4000 }));
    assert.strictEqual(s2.startCash, 2450000, 'đoạn sau nhận số kỳ vọng thay vì số đếm được');
    assert.strictEqual(s2.startCashSource, 'PREVIOUS_SEGMENT_ACTUAL');
  });

  test('ca chiều làm đúng thì variance = 0, KHÔNG gánh sai số ca sáng', function () {
    var s1 = closed(counted(withSales(seg1(500000), 2000000), 2450000), _sh.A1);
    var s2 = assertOk(S.nextSegment(s1, { actorId: _sh.A2, at: 4000 }));
    s2 = closed(counted(withSales(s2, 1000000), 3450000, _sh.A2), _sh.A2);
    assert.strictEqual(s2.variance, 0, 'sai số ca sáng trôi sang ca chiều — quy trách nhiệm sai người');
  });

  test('quy trách nhiệm được theo từng đoạn', function () {
    var s1 = closed(counted(withSales(seg1(500000), 2000000), 2450000), _sh.A1);
    var s2 = assertOk(S.nextSegment(s1, { actorId: _sh.A2, at: 4000 }));
    s2 = closed(counted(withSales(s2, 1000000), 3420000, _sh.A2), _sh.A2);

    var sum = assertOk(S.summarizeDay([s1, s2]));
    assert.strictEqual(sum.totalVariance, -80000);
    assert.strictEqual(sum.varianceBySegment.length, 2);
    assert.strictEqual(sum.varianceBySegment[0].variance, -50000);
    assert.strictEqual(sum.varianceBySegment[0].closedBy, _sh.A1);
    assert.strictEqual(sum.varianceBySegment[1].variance, -30000);
    assert.strictEqual(sum.varianceBySegment[1].closedBy, _sh.A2);
  });

  test('chưa chốt đoạn hiện tại thì không mở đoạn kế', function () {
    assertErr(S.nextSegment(seg1(), { actorId: _sh.A2, at: 4000 }), 'PRECONDITION');
  });

  test('đoạn 1 ghi rõ nguồn tiền đầu là quỹ mở ngày', function () {
    assert.strictEqual(seg1().startCashSource, 'OPENING_FLOAT');
  });
});

describe('blockingClose — lý do chặn chốt ngày', function () {
  var S = _sh.S;

  test('đoạn ca chưa chốt thì chặn, nêu rõ đoạn nào', function () {
    var b = S.closeDayBlockers({ segments: [seg1()] });
    assert.strictEqual(b.length, 1);
    assert.ok(/đoạn ca #1 chưa chốt/.test(b[0]));
  });

  test('nhân viên chưa check-out thì chặn', function () {
    var b = S.closeDayBlockers({
      segments: [closed(counted(seg1(), 500000))],
      openEmployeeShifts: [{ employeeId: 'employee_linh' }]
    });
    assert.ok(/chưa check-out/.test(b[0]));
  });

  test('checklist blocking thì chặn, checklist thường thì không', function () {
    var base = { segments: [closed(counted(seg1(), 500000))] };
    assert.strictEqual(S.closeDayBlockers(Object.assign({}, base, {
      pendingChecklists: [{ name: 'dọn quầy', blocking: false }]
    })).length, 0);
    assert.strictEqual(S.closeDayBlockers(Object.assign({}, base, {
      pendingChecklists: [{ name: 'refill', blocking: true }]
    })).length, 1);
  });

  test('chưa có đoạn ca nào thì chặn', function () {
    assert.ok(/chưa có đoạn ca nào/.test(S.closeDayBlockers({ segments: [] })[0]));
  });

  test('mọi thứ xong thì không còn lý do chặn', function () {
    assert.strictEqual(S.closeDayBlockers({ segments: [closed(counted(seg1(), 500000))] }).length, 0);
  });

  test('blockers nối được thẳng vào closeDay của business-day', function () {
    var BD = GIEO.require('store-context/business-day');
    var CLK = GIEO.require('shared-kernel/clock');
    var day = assertOk(BD.openDay({
      storeId: _sh.STORE, dateKey: '2026-03-10', actorId: _sh.A1, at: 1000, clock: CLK.createClock()
    }));
    var r = BD.closeDay(day, {
      actorId: _sh.A1, operationId: _sh.ids.deterministicId('operation', ['close', 'd']), at: 9000,
      blockers: S.closeDayBlockers({ segments: [seg1()] })
    });
    assertErr(r, 'PRECONDITION');
    assert.ok(/đoạn ca #1 chưa chốt/.test(r.error.detail.blockers[0]));
  });
});

describe('autoCloseStaleShifts — ca treo không chặn chốt ngày vĩnh viễn (NET-PAYROLL-V1 #3)', function () {
  var S = _sh.S;
  var EMP = GIEO.require('hr/employee');
  var HRS = GIEO.require('hr/shift');
  var VI = GIEO.require('compaction/versioned-input');
  var STORE2 = _sh.ids.deterministicId('store', ['payroll-stale']);

  function rawShift(checkedInAt) {
    var reg = VI.createRegistry();
    var e = assertOk(EMP.createEmployee({ name: 'Trễ ca', storeId: STORE2 }));
    return assertOk(HRS.checkIn({
      employee: e, versionRegistry: reg, at: checkedInAt, businessDate: '2026-03-10'
    }));
  }

  test('ca quá 16h tự đóng, không còn nằm trong stillOpen', function () {
    var checkedInAt = new Date(2026, 2, 10, 8).getTime();
    var nowTs = new Date(2026, 2, 11, 9).getTime();
    var out = S.autoCloseStaleShifts([rawShift(checkedInAt)], nowTs);
    assert.strictEqual(out.stillOpen.length, 0);
    assert.strictEqual(out.closedShifts.length, 1);
    assert.strictEqual(out.closedShifts[0].status, 'CLOSED');
    assert.strictEqual(out.closedShifts[0].autoClosed, true);
  });

  test('ca còn trong ngưỡng vẫn ở stillOpen, tiếp tục chặn chốt ngày', function () {
    var checkedInAt = new Date(2026, 2, 10, 8).getTime();
    var nowTs = new Date(2026, 2, 10, 15).getTime();
    var out = S.autoCloseStaleShifts([rawShift(checkedInAt)], nowTs);
    assert.strictEqual(out.stillOpen.length, 1);
    assert.strictEqual(out.closedShifts.length, 0);

    var blockers = S.closeDayBlockers({
      segments: [closed(counted(seg1(), 500000))],
      openEmployeeShifts: out.stillOpen
    });
    assert.ok(/chưa check-out/.test(blockers[0]));
  });

  test('ca treo thật sự không còn xuất hiện trong danh sách chặn', function () {
    var checkedInAt = new Date(2026, 2, 10, 8).getTime();
    var nowTs = new Date(2026, 2, 11, 9).getTime();
    var out = S.autoCloseStaleShifts([rawShift(checkedInAt)], nowTs);
    var blockers = S.closeDayBlockers({
      segments: [closed(counted(seg1(), 500000))],
      openEmployeeShifts: out.stillOpen
    });
    assert.strictEqual(blockers.length, 0);
  });
});

describe('CloseBusinessDay — ca treo tự đóng trước khi tính blockers (NET-PAYROLL-V1 #3)', function () {
  var S = _sh.S;
  var PIPE = GIEO.require('commands/pipeline');
  var BIZ = GIEO.require('commands/business-day');
  var ACCESS = GIEO.require('store-context/access');
  var CTXL = GIEO.require('store-context/context');
  var BD = GIEO.require('store-context/business-day');
  var CLK = GIEO.require('shared-kernel/clock');
  var EMP = GIEO.require('hr/employee');
  var HRS = GIEO.require('hr/shift');
  var VI = GIEO.require('compaction/versioned-input');
  var ORG = _sh.ids.deterministicId('org', ['gieo-close-day']);
  var STORE3 = _sh.ids.deterministicId('store', ['close-day-stale']);
  var NOW = new Date(2026, 2, 11, 9).getTime();

  function ctxAt(now) {
    var clock = CLK.createClock({ now: function () { return now; } });
    var day = assertOk(BD.openDay({
      storeId: STORE3, dateKey: '2026-03-10', actorId: _sh.A1, at: now - 100000, clock: clock
    }));
    var actor = assertOk(ACCESS.createActor({
      actorId: _sh.A1, role: 'QUANLY_OPERATOR', source: 'QUANLY', stores: [STORE3]
    }));
    var context = assertOk(CTXL.createContext({
      organizationId: ORG, storeId: STORE3, actor: actor, source: 'QUANLY',
      businessDay: day, clock: clock
    }));
    return { day: day, context: context };
  }

  function closedSegment(operationId) {
    var seg = assertOk(S.openSegment({
      storeId: STORE3, businessDate: '2026-03-10', seq: 1, startCash: 0, actorId: _sh.A1, at: NOW - 100000
    }));
    seg = assertOk(S.addCount(seg, { countedCash: 0, at: NOW - 50000, actorId: _sh.A1 }));
    return assertOk(S.closeSegment(seg, { actorId: _sh.A1, at: NOW - 40000, operationId: operationId }));
  }

  test('ca quên check-out (>16h) tự đóng, ngày vẫn chốt được', function () {
    var setup = ctxAt(NOW);
    var reg = VI.createRegistry();
    var employee = assertOk(EMP.createEmployee({ name: 'Quên check-out', storeId: STORE3 }));
    var staleShift = assertOk(HRS.checkIn({
      employee: employee, versionRegistry: reg,
      at: new Date(2026, 2, 10, 8).getTime(), businessDate: '2026-03-10'
    }));

    var out = assertOk(PIPE.run(BIZ.CloseBusinessDay, {
      day: setup.day, segments: [closedSegment('operation_stale_seg')], openEmployeeShifts: [staleShift]
    }, setup.context, { operationStore: PIPE.createInMemoryOperationStore() }));

    var bdRecord = out.plan.domainRecords.filter(function (r) { return r.type === 'businessDay'; })[0];
    assert.strictEqual(bdRecord.record.status, 'CLOSED');

    var shiftRecord = out.plan.domainRecords.filter(function (r) { return r.type === 'employeeShift'; })[0];
    assert.strictEqual(shiftRecord.record.status, 'CLOSED');
    assert.strictEqual(shiftRecord.record.autoClosed, true);

    var evt = out.plan.events.filter(function (e) { return e.type === 'EmployeeCheckedInStateChanged'; })[0];
    assert.strictEqual(evt.checkedIn, false);
    assert.strictEqual(evt.employeeId, employee.employeeId);
  });

  test('ca còn trong ngưỡng (chưa treo) vẫn chặn chốt ngày như cũ', function () {
    var setup = ctxAt(NOW);
    var reg = VI.createRegistry();
    var employee = assertOk(EMP.createEmployee({ name: 'Đang làm', storeId: STORE3 }));
    var freshShift = assertOk(HRS.checkIn({
      employee: employee, versionRegistry: reg,
      at: NOW - 3600000, businessDate: '2026-03-10'
    }));

    var out = PIPE.run(BIZ.CloseBusinessDay, {
      day: setup.day, segments: [closedSegment('operation_fresh_seg')], openEmployeeShifts: [freshShift]
    }, setup.context, { operationStore: PIPE.createInMemoryOperationStore() });

    assertErr(out, 'PRECONDITION');
    assert.ok(/chưa check-out/.test(out.error.detail.blockers[0]));
  });
});

describe('CloseCashSegment qua pipeline', function () {
  var S = _sh.S;
  var PIPE = GIEO.require('commands/pipeline');
  var ACCESS = GIEO.require('store-context/access');
  var CTXL = GIEO.require('store-context/context');
  var BD = GIEO.require('store-context/business-day');
  var CLK = GIEO.require('shared-kernel/clock');
  var ORG = _sh.ids.deterministicId('org', ['gieo']);

  function ctx() {
    var day = assertOk(BD.openDay({
      storeId: _sh.STORE, dateKey: '2026-03-10', actorId: _sh.A1, at: 1000, clock: CLK.createClock()
    }));
    var actor = assertOk(ACCESS.createActor({
      actorId: _sh.A1, role: 'POS_OPERATOR', source: 'POS', stores: [_sh.STORE]
    }));
    return assertOk(CTXL.createContext({
      organizationId: ORG, storeId: _sh.STORE, actor: actor, source: 'POS', businessDay: day
    }));
  }

  test('lệch két PHÁT event — không để con số nằm im trong sổ', function () {
    var s = counted(withSales(seg1(500000), 2000000), 2450000);
    var out = assertOk(PIPE.run(S.CloseCashSegment, { segment: s }, ctx(), {
      operationStore: PIPE.createInMemoryOperationStore()
    }));
    assert.strictEqual(out.plan.events[0].type, 'CashVarianceDetected');
    assert.strictEqual(out.plan.events[0].variance, -50000);
  });

  test('khớp két thì không phát event thừa', function () {
    var s = counted(withSales(seg1(500000), 2000000), 2500000);
    var out = assertOk(PIPE.run(S.CloseCashSegment, { segment: s }, ctx(), {
      operationStore: PIPE.createInMemoryOperationStore()
    }));
    assert.strictEqual(out.plan.events.length, 0);
  });

  test('chốt đoạn 2 lần là no-op', function () {
    var store = PIPE.createInMemoryOperationStore();
    var c = ctx();
    var s = counted(withSales(seg1(500000), 2000000), 2500000);
    assertOk(PIPE.run(S.CloseCashSegment, { segment: s }, c, { operationStore: store }));
    var again = assertOk(PIPE.run(S.CloseCashSegment, { segment: s }, c, { operationStore: store }));
    assert.strictEqual(again.replayed, true);
  });
});

describe('command mở két và chấm công', function () {
  var S = _sh.S;
  var PIPE = GIEO.require('commands/pipeline');
  var ACCESS = GIEO.require('store-context/access');
  var CTXL = GIEO.require('store-context/context');
  var BD = GIEO.require('store-context/business-day');
  var CLK = GIEO.require('shared-kernel/clock');
  var EMP = GIEO.require('hr/employee');
  var VI = GIEO.require('compaction/versioned-input');
  var BOOT = GIEO.require('bootstrap/runtime');
  var ORG = _sh.ids.deterministicId('org', ['gieo-command']);
  var NOW = new Date(2026, 2, 10, 8).getTime();

  function commandCtx() {
    var clock = CLK.createClock({ now: function () { return NOW; } });
    var day = assertOk(BD.openDay({
      storeId: _sh.STORE, dateKey: '2026-03-10', actorId: _sh.A1, at: NOW - 1000, clock: clock
    }));
    var actor = assertOk(ACCESS.createActor({
      actorId: _sh.A1, role: 'POS_OPERATOR', source: 'POS', stores: [_sh.STORE]
    }));
    return assertOk(CTXL.createContext({
      organizationId: ORG, storeId: _sh.STORE, actor: actor, source: 'POS',
      businessDay: day, clock: clock
    }));
  }

  function runCommand(command, input, context, store) {
    return PIPE.run(command, input, context || commandCtx(), {
      operationStore: store || PIPE.createInMemoryOperationStore()
    });
  }

  test('runtime đăng ký đủ năm command blocker', function () {
    var names = BOOT.createRuntime({ mode: BOOT.MODE.READ_ONLY }).registeredCommands();
    ['OpenBusinessDay', 'CloseBusinessDay', 'OpenCashSegment', 'CheckIn', 'CheckOut']
      .forEach(function (name) { assert.ok(names.indexOf(name) !== -1, 'thiếu ' + name); });
  });

  test('OpenCashSegment gọi domain openSegment và chống replay', function () {
    var store = PIPE.createInMemoryOperationStore();
    var input = {
      storeId: _sh.STORE, businessDate: '2026-03-10', seq: 1, startCash: 500000
    };
    var first = assertOk(runCommand(S.OpenCashSegment, input, commandCtx(), store));
    assert.strictEqual(first.plan.domainRecords[0].record.startCash, 500000);
    var again = assertOk(runCommand(S.OpenCashSegment, input, commandCtx(), store));
    assert.strictEqual(again.replayed, true);
  });

  test('CheckIn snapshot PayTerms; CheckOut đóng đúng shift qua pipeline', function () {
    var reg = VI.createRegistry();
    var employee = assertOk(EMP.createEmployee({ name: 'Linh', storeId: _sh.STORE }));
    assertOk(EMP.publishPayTerms(reg, {
      employeeId: employee.employeeId, storeId: _sh.STORE, effectiveFrom: NOW - 10000,
      terms: { rate: 30000 }, publishedBy: _sh.A1
    }));
    var checkedIn = assertOk(runCommand(S.CheckIn, {
      employee: employee, versionRegistry: reg, businessDate: '2026-03-10'
    }));
    var shift = checkedIn.plan.domainRecords[0].record;
    assert.strictEqual(shift.status, 'OPEN');
    assert.strictEqual(shift.payTermsRef.payload.rate, 30000);

    var checkedOut = assertOk(runCommand(S.CheckOut, { shift: shift }));
    assert.strictEqual(checkedOut.plan.domainRecords[0].record.status, 'CLOSED');
    assert.strictEqual(checkedOut.plan.events[0].checkedIn, false);
  });

  test('check-in đầu tiên tự mở ngày trong cùng MutationPlan', function () {
    var clock = CLK.createClock({ now: function () { return NOW; } });
    var actor = assertOk(ACCESS.createActor({
      actorId: _sh.A1, role: 'POS_OPERATOR', source: 'POS', stores: [_sh.STORE]
    }));
    var preCheckIn = assertOk(CTXL.createContext({
      organizationId: ORG, storeId: _sh.STORE, actor: actor, source: 'POS',
      businessDay: null, clock: clock
    }));
    assertErr(preCheckIn.assertOperable('RecordSale'), 'PRECONDITION');

    var reg = VI.createRegistry();
    var employee = assertOk(EMP.createEmployee({ name: 'An', storeId: _sh.STORE }));
    assertOk(EMP.publishPayTerms(reg, {
      employeeId: employee.employeeId, storeId: _sh.STORE, effectiveFrom: NOW - 10000,
      terms: { rate: 30000 }, publishedBy: _sh.A1
    }));
    var result = assertOk(runCommand(S.CheckIn, {
      employee: employee, versionRegistry: reg, businessDate: '2026-03-10'
    }, preCheckIn));
    assert.strictEqual(result.plan.domainRecords[0].type, 'businessDay');
    assert.strictEqual(result.plan.domainRecords[1].type, 'employeeShift');
    assert.strictEqual(result.plan.events[0].type, 'BusinessDayOpened');
  });
});
