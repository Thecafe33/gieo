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
