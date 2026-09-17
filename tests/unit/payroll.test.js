/**
 * [6] Payroll.
 * Chuỗi thật: FIFO-CHAIN-TRACE-PAYROLL-V1.md. Gap: FEATURE-TREE-V1.md §4.6.
 * Chủ quán đã chốt: lương cứng TRỪ THEO LỊCH LÀM VIỆC.
 */

var _p = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    VI: GIEO.require('compaction/versioned-input'),
    E: GIEO.require('hr/employee'),
    S: GIEO.require('hr/shift'),
    WS: GIEO.require('hr/work-schedule'),
    P: GIEO.require('hr/payroll'),
    L: GIEO.require('hr/liability'),
    U: GIEO.require('fifo-core/unit'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    BOSS: ids.deterministicId('actor', ['boss'])
  };
})();

var CLOCK = _p.CLK.createClock();
var D = function (d, h) { return new Date(2026, 2, d, h || 0).getTime(); };
var FROM = D(1, 0);
var TO = D(31, 23);

function setup(terms) {
  var reg = _p.VI.createRegistry();
  var emp = assertOk(_p.E.createEmployee({ name: 'Linh', storeId: _p.STORE }));
  assertOk(_p.E.publishPayTerms(reg, {
    employeeId: emp.employeeId, storeId: _p.STORE, effectiveFrom: D(1, 0),
    publishedBy: _p.BOSS, terms: Object.assign({ rate: 30000, otRate: 45000, otThreshold: 8 }, terms || {})
  }));
  return { reg: reg, emp: emp };
}

function workDay(ctx, day, hours) {
  var sh = assertOk(_p.S.checkIn({
    employee: ctx.emp, versionRegistry: ctx.reg, at: D(day, 8),
    businessDate: '2026-03-' + (day < 10 ? '0' + day : day)
  }));
  return assertOk(_p.S.checkOut(sh, D(day, 8 + hours)));
}

function sched(ctx, days) {
  return days.map(function (d) {
    return assertOk(_p.WS.scheduleDay({
      employeeId: ctx.emp.employeeId, storeId: _p.STORE, clock: CLOCK,
      dateKey: '2026-03-' + (d < 10 ? '0' + d : d)
    }));
  });
}

describe('hr/work-schedule', function () {
  var WS = _p.WS;

  test('đối chiếu lịch với chấm công tách 4 nhóm rõ ràng', function () {
    var ctx = setup();
    var days = sched(ctx, [2, 3, 4]);
    var shifts = [workDay(ctx, 2, 8)];
    var r = assertOk(WS.reconcile({ scheduleDays: days, shifts: shifts }));
    assert.deepStrictEqual(r.worked, ['2026-03-02']);
    assert.deepStrictEqual(r.absent, ['2026-03-03', '2026-03-04']);
    assert.strictEqual(r.excusedAbsent.length, 0);
  });

  test('nghỉ CÓ PHÉP không tính là vắng mặt — legacy không phân biệt được', function () {
    var ctx = setup();
    var days = sched(ctx, [2, 3]);
    days[1] = assertOk(WS.markExcused(days[1], 'nghỉ ốm có đơn'));
    var r = assertOk(WS.reconcile({ scheduleDays: days, shifts: [workDay(ctx, 2, 8)] }));
    assert.strictEqual(r.absent.length, 0);
    assert.deepStrictEqual(r.excusedAbsent, ['2026-03-03']);
  });

  test('nghỉ phép phải ghi lý do', function () {
    var ctx = setup();
    assertErr(WS.markExcused(sched(ctx, [2])[0], null), 'VALIDATION');
  });

  test('đi làm ngoài lịch vẫn thấy được, không bị nuốt', function () {
    var ctx = setup();
    var r = assertOk(WS.reconcile({
      scheduleDays: sched(ctx, [2]), shifts: [workDay(ctx, 2, 8), workDay(ctx, 9, 8)]
    }));
    assert.deepStrictEqual(r.unscheduled, ['2026-03-09']);
  });
});

describe('hr/liability — khoản trừ trách nhiệm nhân viên (quyết định chủ quán, "FIFO phải truy xuất được")', function () {
  var L = _p.L;
  var ids = _p.ids;
  var SUA = ids.deterministicId('item', ['sua']);
  var EMP = ids.deterministicId('employee', ['linh']);
  var QL = ids.deterministicId('actor', ['ql']);

  function costedUnit() {
    return assertOk(_p.U.createUnit({
      itemId: SUA, storeId: _p.STORE, itemKind: 'raw', initialQty: 10,
      costBasis: { unitCost: 30000 }, operationId: ids.deterministicId('operation', ['seed1'])
    }));
  }

  function seededUnit() {
    return assertOk(_p.U.seedUnitFromLegacy({
      itemId: SUA, storeId: _p.STORE, itemKind: 'raw', initialQty: 5,
      operationId: ids.deterministicId('operation', ['seed2']), seededAt: '2026-01-01'
    }));
  }

  test('số tiền = costBasis.unitCost thật × remainingQty còn lại', function () {
    var r = assertOk(L.computeLiabilityAmount(costedUnit()));
    assert.strictEqual(r.amount, 10 * 30000);
    assert.strictEqual(r.gap, false);
  });

  test('lô không có costBasis (seed từ hệ cũ) thì KHÔNG đoán — gap=true, amount=null', function () {
    var r = assertOk(L.computeLiabilityAmount(seededUnit()));
    assert.strictEqual(r.amount, null);
    assert.strictEqual(r.gap, true);
  });

  test('tạo khoản trừ với đủ nhân viên + costBasis thì không gap', function () {
    var liab = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr1']),
      lostReportId: 'lostReport_1', unit: costedUnit(), reason: 'mất hũ'
    }));
    assert.strictEqual(liab.amount, 300000);
    assert.strictEqual(liab.employeeId, EMP);
    assert.strictEqual(liab.status, L.STATUS.PENDING);
    assert.strictEqual(liab.gap, false);
  });

  test('§2.3a: không xác định được nhân viên thì KHÔNG chặn tạo khoản — degrade, gắn cờ gap', function () {
    var liab = assertOk(L.createLiability({
      employeeId: null, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr2']),
      lostReportId: 'lostReport_2', unit: costedUnit(), reason: 'mất hũ'
    }));
    assert.strictEqual(liab.employeeId, null);
    assert.strictEqual(liab.gap, true);
    assert.deepStrictEqual(liab.gapReasons, ['NO_EMPLOYEE_MATCH']);
  });

  test('lô seed (không costBasis) VẪN tạo được khoản — chỉ gắn cờ gap, không chặn', function () {
    var liab = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr3']),
      lostReportId: 'lostReport_3', unit: seededUnit(), reason: 'mất hũ'
    }));
    assert.strictEqual(liab.amount, null);
    assert.strictEqual(liab.gap, true);
    assert.deepStrictEqual(liab.gapReasons, ['NO_COST_BASIS']);
  });

  test('miễn trừ rồi thì không miễn trừ lại được (đã đổi trạng thái)', function () {
    var liab = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr4']),
      lostReportId: 'lostReport_4', unit: costedUnit(), reason: 'mất hũ'
    }));
    var waived = assertOk(L.waiveLiability(liab, { actorId: QL, reason: 'nhân viên khó khăn' }));
    assert.strictEqual(waived.status, L.STATUS.WAIVED);
    assertErr(L.waiveLiability(waived, { actorId: QL, reason: 'x' }), 'PRECONDITION');
  });

  test('tìm lại container → hoàn khoản trừ (REVERSED)', function () {
    var liab = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr5']),
      lostReportId: 'lostReport_5', unit: costedUnit(), reason: 'mất hũ'
    }));
    var reversed = assertOk(L.reverseLiability(liab, {
      actorId: QL, operationId: ids.deterministicId('operation', ['found', 'u1'])
    }));
    assert.strictEqual(reversed.status, L.STATUS.REVERSED);
  });

  test('trừ vào lương → DEDUCTED, gắn payrollClosingId', function () {
    var liab = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr6']),
      lostReportId: 'lostReport_6', unit: costedUnit(), reason: 'mất hũ'
    }));
    var deducted = assertOk(L.markDeducted(liab, {
      at: 1000, payrollClosingId: ids.deterministicId('snapshot', ['payroll', _p.STORE, '2026-03'])
    }));
    assert.strictEqual(deducted.status, L.STATUS.DEDUCTED);
    assert.ok(deducted.payrollClosingId);
  });

  test('pendingFor tách phần trừ được (có số tiền) khỏi phần còn gap', function () {
    var applied = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr7']),
      lostReportId: 'lostReport_7', unit: costedUnit(), reason: 'x'
    }));
    var gapped = assertOk(L.createLiability({
      employeeId: EMP, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'lr8']),
      lostReportId: 'lostReport_8', unit: seededUnit(), reason: 'x'
    }));
    var p = L.pendingFor([applied, gapped], EMP);
    assert.strictEqual(p.deduction, 300000);
    assert.deepStrictEqual(p.appliedLiabilityIds, [applied.liabilityId]);
    assert.deepStrictEqual(p.gapLiabilityIds, [gapped.liabilityId]);
  });
});

describe('hr/payroll — lương giờ KHÔNG bao giờ dùng PayTerms hiện tại (fix §3)', function () {
  var P = _p.P;

  test('đổi lương cuối tháng KHÔNG làm trôi lương các ca đã chấm', function () {
    var ctx = setup({ rate: 30000 });
    var shifts = [workDay(ctx, 2, 8), workDay(ctx, 3, 8)];

    /* Chủ quán tăng lương SAU khi 2 ca đã diễn ra. */
    assertOk(_p.E.publishPayTerms(ctx.reg, {
      employeeId: ctx.emp.employeeId, storeId: _p.STORE, effectiveFrom: D(20, 0),
      publishedBy: _p.BOSS, terms: { rate: 99000, otRate: 99000, otThreshold: 8 }
    }));

    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: shifts, fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.hourly.amount, 16 * 30000, 'lương lịch sử trôi theo mức mới');
  });

  test('OT tính theo ngưỡng đã snapshot của từng ca', function () {
    var ctx = setup();
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 10)], fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.hourly.amount, 8 * 30000 + 2 * 45000);
    assert.strictEqual(r.hourly.lines[0].otHours, 2);
  });

  test('còn ca chưa check-out thì KHÔNG chốt lương', function () {
    var ctx = setup();
    var open = assertOk(_p.S.checkIn({
      employee: ctx.emp, versionRegistry: ctx.reg, at: D(2, 8), businessDate: '2026-03-02'
    }));
    assertErr(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [open], fromTs: FROM, toTs: TO
    }), 'PRECONDITION');
  });

  test('ca tự đóng chảy cờ needsReview lên kết quả lương, không bị rơi', function () {
    var ctx = setup();
    var sh = assertOk(_p.S.checkIn({
      employee: ctx.emp, versionRegistry: ctx.reg, at: D(2, 8), businessDate: '2026-03-02'
    }));
    sh = assertOk(_p.S.autoCloseIfStale(sh, D(3, 9)));
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [sh], fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.needsReview, true);
    assert.strictEqual(r.needsReviewDetail[0].businessDate, '2026-03-02');
  });

  test('kết quả mang payTermsVersionId để đọc lại (V4)', function () {
    var ctx = setup();
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)], fromTs: FROM, toTs: TO
    }));
    assert.ok(r.payTermsVersionIds.length > 0);
    assertOk(ctx.reg.getByVersionId(r.payTermsVersionIds[0]));
  });
});

describe('lương cứng — TRỪ THEO LỊCH LÀM VIỆC (đã chốt với chủ quán, fix §6)', function () {
  var P = _p.P;

  function fixedCtx() { return setup({ rate: 0, fixedMonthlySalary: 6000000 }); }

  test('đi làm đủ lịch thì nhận đủ lương cứng', function () {
    var ctx = fixedCtx();
    var days = sched(ctx, [2, 3, 4, 5]);
    var shifts = [workDay(ctx, 2, 8), workDay(ctx, 3, 8), workDay(ctx, 4, 8), workDay(ctx, 5, 8)];
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: shifts, scheduleDays: days, fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.fixed.amount, 6000000);
    assert.strictEqual(r.fixed.absentDays, 0);
  });

  test('vắng không phép thì TRỪ đúng phần ngày đó — legacy cộng đều không trừ', function () {
    var ctx = fixedCtx();
    var days = sched(ctx, [2, 3, 4, 5]);
    var shifts = [workDay(ctx, 2, 8), workDay(ctx, 3, 8)];
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: shifts, scheduleDays: days, fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.fixed.amount, 3000000, 'nghỉ 2/4 ngày lịch mà vẫn nhận đủ lương');
    assert.strictEqual(r.fixed.absentDays, 2);
    assert.deepStrictEqual(r.fixed.deductions, ['2026-03-04', '2026-03-05']);
  });

  test('nghỉ CÓ PHÉP không bị trừ', function () {
    var ctx = fixedCtx();
    var days = sched(ctx, [2, 3, 4, 5]);
    days[3] = assertOk(_p.WS.markExcused(days[3], 'nghỉ phép năm'));
    var shifts = [workDay(ctx, 2, 8), workDay(ctx, 3, 8), workDay(ctx, 4, 8)];
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: shifts, scheduleDays: days, fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.fixed.amount, 6000000);
    assert.strictEqual(r.fixed.excusedDays, 1);
  });

  test('có lương cứng nhưng CHƯA XẾP LỊCH thì từ chối — không đoán ngày vắng', function () {
    var ctx = fixedCtx();
    var r = P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)], fromTs: FROM, toTs: TO
    });
    assertErr(r, 'PRECONDITION');
    assert.ok(/chưa xếp lịch làm việc/.test(r.error.message));
  });

  test('chỉ lương giờ thì không cần lịch', function () {
    var ctx = setup();
    assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)], fromTs: FROM, toTs: TO
    }));
  });

  test('đổi mức lương cứng giữa kỳ: mỗi ngày theo mức của ĐÚNG ngày đó (V3)', function () {
    var ctx = fixedCtx();
    assertOk(_p.E.publishPayTerms(ctx.reg, {
      employeeId: ctx.emp.employeeId, storeId: _p.STORE, effectiveFrom: D(4, 0),
      publishedBy: _p.BOSS, terms: { rate: 0, fixedMonthlySalary: 12000000 }
    }));
    var days = sched(ctx, [2, 3, 4, 5]);
    var shifts = [workDay(ctx, 2, 8), workDay(ctx, 3, 8), workDay(ctx, 4, 8), workDay(ctx, 5, 8)];
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: shifts, scheduleDays: days, fromTs: FROM, toTs: TO
    }));
    /* 2 ngày ở mức 6tr (1.5tr/ngày) + 2 ngày ở mức 12tr (3tr/ngày) */
    assert.strictEqual(r.fixed.amount, 1500000 * 2 + 3000000 * 2);
    assert.ok(r.fixed.lines.length === 4);
  });

  test('lương giờ và lương cứng cộng vào tổng', function () {
    var ctx = setup({ rate: 30000, fixedMonthlySalary: 1000000 });
    var days = sched(ctx, [2]);
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)],
      scheduleDays: days, fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.total, 8 * 30000 + 1000000);
  });
});

describe('hr/payroll — khoản trừ trách nhiệm nhân viên chảy vào kỳ lương (quyết định chủ quán)', function () {
  var P = _p.P;
  var L = _p.L;
  var ids = _p.ids;
  var SUA = ids.deterministicId('item', ['sua']);
  var QL = ids.deterministicId('actor', ['ql']);

  function costedUnit(tag) {
    return assertOk(_p.U.createUnit({
      unitId: ids.deterministicId('unit', [tag]),
      itemId: SUA, storeId: _p.STORE, itemKind: 'raw', initialQty: 4,
      costBasis: { unitCost: 30000 }, operationId: ids.deterministicId('operation', ['s' + tag])
    }));
  }

  function seededUnit(tag) {
    return assertOk(_p.U.seedUnitFromLegacy({
      unitId: ids.deterministicId('unit', [tag]),
      itemId: SUA, storeId: _p.STORE, itemKind: 'raw', initialQty: 4,
      operationId: ids.deterministicId('operation', ['s' + tag]), seededAt: '2026-01-01'
    }));
  }

  function liabilityFor(ctx, tag, unit) {
    return assertOk(L.createLiability({
      employeeId: ctx.emp.employeeId, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', tag]),
      lostReportId: 'lostReport_' + tag, unit: unit, reason: 'mất hũ'
    }));
  }

  test('khoản PENDING có số tiền thật thì trừ thẳng vào total', function () {
    var ctx = setup({ rate: 30000 });
    var liab = liabilityFor(ctx, 'p1', costedUnit('p1'));
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)],
      liabilities: [liab], fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.liability.deduction, 4 * 30000);
    assert.strictEqual(r.total, 8 * 30000 - 4 * 30000);
    assert.deepStrictEqual(r.liability.appliedLiabilityIds, [liab.liabilityId]);
  });

  test('khoản còn gap (không costBasis) KHÔNG bị đoán số mà trừ — chỉ gắn cờ needsReview', function () {
    var ctx = setup({ rate: 30000 });
    var liab = liabilityFor(ctx, 'p2', seededUnit('p2'));
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)],
      liabilities: [liab], fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.liability.deduction, 0);
    assert.strictEqual(r.needsReview, true);
    assert.deepStrictEqual(r.liability.gapLiabilityIds, [liab.liabilityId]);
  });

  test('khoản của nhân viên KHÁC không lẫn vào kỳ lương người này', function () {
    var ctx = setup({ rate: 30000 });
    var otherEmployeeId = ids.deterministicId('employee', ['khac']);
    var liab = assertOk(L.createLiability({
      employeeId: otherEmployeeId, storeId: _p.STORE, actorId: QL,
      operationId: ids.deterministicId('operation', ['approvelost', 'p3']),
      lostReportId: 'lostReport_p3', unit: costedUnit('p3'), reason: 'x'
    }));
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)],
      liabilities: [liab], fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.liability.deduction, 0);
  });

  test('khoản đã DEDUCTED hoặc WAIVED không bị trừ lần hai', function () {
    var ctx = setup({ rate: 30000 });
    var liab = liabilityFor(ctx, 'p4', costedUnit('p4'));
    var waived = assertOk(L.waiveLiability(liab, { actorId: QL, reason: 'miễn' }));
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)],
      liabilities: [waived], fromTs: FROM, toTs: TO
    }));
    assert.strictEqual(r.liability.deduction, 0);
  });

  test('closePayroll đóng băng liabilityDeduction + appliedLiabilityIds vào từng dòng', function () {
    var ctx = setup({ rate: 30000 });
    var liab = liabilityFor(ctx, 'p5', costedUnit('p5'));
    var r = assertOk(P.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [workDay(ctx, 2, 8)],
      liabilities: [liab], fromTs: FROM, toTs: TO
    }));
    var closed = assertOk(P.closePayroll({
      storeId: _p.STORE, monthKey: '2026-03', results: [r],
      actorId: QL, operationId: ids.deterministicId('operation', ['payroll', '2026-03-p5'])
    }));
    assert.strictEqual(closed.lines[0].liabilityDeduction, 4 * 30000);
    assert.deepStrictEqual(closed.lines[0].appliedLiabilityIds, [liab.liabilityId]);
    assert.strictEqual(closed.total, r.total);
  });
});

describe('PayrollClosing — snapshot tháng, CHƯA TỪNG TỒN TẠI ở legacy (fix §4)', function () {
  var P = _p.P;

  function results(needsReview) {
    return [{
      employeeId: _p.ids.deterministicId('employee', ['linh']),
      hourly: { hours: 160, amount: 4800000 },
      fixed: { amount: 0, scheduledDays: 20, absentDays: 0 },
      total: 4800000, payTermsVersionIds: ['version_pt1'], needsReview: !!needsReview
    }];
  }

  function close(over) {
    return P.closePayroll(Object.assign({
      storeId: _p.STORE, monthKey: '2026-03', results: results(),
      actorId: _p.BOSS, operationId: _p.ids.deterministicId('operation', ['payroll', '2026-03']),
      at: D(31, 20)
    }, over || {}));
  }

  test('chốt lương đóng băng đủ chi tiết để in phiếu lương', function () {
    var c = assertOk(close());
    assert.strictEqual(c.monthKey, '2026-03');
    assert.strictEqual(c.total, 4800000);
    assert.strictEqual(c.lines[0].hourlyHours, 160);
    assert.strictEqual(c.revisionNo, 1);
  });

  test('id xác định theo store+tháng — chốt 2 lần không tạo 2 snapshot', function () {
    assert.strictEqual(assertOk(close()).payrollClosingId, assertOk(close()).payrollClosingId);
  });

  test('còn ca cần rà thì KHÔNG lặng lẽ chốt', function () {
    var r = close({ results: results(true) });
    assertErr(r, 'PRECONDITION');
    assert.ok(/phải xác nhận trước khi chốt/.test(r.error.message));
  });

  test('xác nhận tường minh rồi thì chốt được, và ghi lại là đã xác nhận', function () {
    var c = assertOk(close({ results: results(true), acknowledgeReview: true }));
    assert.strictEqual(c.acknowledgedReview, true);
  });

  test('monthKey sai định dạng bị từ chối', function () {
    assertErr(close({ monthKey: '03/2026' }), 'VALIDATION');
  });

  test('đã chốt thì ĐỌC THẲNG số đóng băng, không tính lại', function () {
    var c = assertOk(close());
    var read = assertOk(P.readPayrollForMonth({ closing: c }));
    assert.strictEqual(read.frozen, true);
    assert.strictEqual(read.source, 'CLOSING');
    assert.strictEqual(read.data.total, 4800000);
  });

  test('chưa chốt thì đọc số sống và nói rõ là chưa đóng băng', function () {
    var read = assertOk(P.readPayrollForMonth({ liveResults: results() }));
    assert.strictEqual(read.frozen, false);
    assert.strictEqual(read.source, 'LIVE');
  });

  test('sửa chấm công sau khi chốt → PHÁT HIỆN drift, không tự sửa snapshot', function () {
    var c = assertOk(close());
    var live = results();
    live[0].total = 5000000;
    var d = assertOk(P.detectPayrollDrift(c, live));
    assert.strictEqual(d.clean, false);
    assert.strictEqual(d.drift[0].frozen, 4800000);
    assert.strictEqual(d.drift[0].live, 5000000);
    assert.strictEqual(d.drift[0].difference, 200000);
  });

  test('không trôi thì báo sạch', function () {
    assert.strictEqual(assertOk(P.detectPayrollDrift(assertOk(close()), results())).clean, true);
  });

  test('correction giữ v1: v2 trỏ về v1, không xoá', function () {
    var v1 = assertOk(close());
    var v2 = assertOk(close({ revisionNo: 2, supersedesClosingId: v1.payrollClosingId }));
    assert.strictEqual(v2.revisionNo, 2);
    assert.strictEqual(v2.supersedesClosingId, v1.payrollClosingId);
    assert.strictEqual(v1.total, 4800000, 'v1 bị đụng vào');
  });

  test('chốt lương phải có actor và operationId', function () {
    assertErr(close({ actorId: null }), 'VALIDATION');
    assertErr(close({ operationId: null }), 'VALIDATION');
  });
});
