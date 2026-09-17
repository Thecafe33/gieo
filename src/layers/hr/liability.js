/**
 * Liability — khoản trừ trách nhiệm nhân viên khi container báo mất được duyệt.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-RAW-MATERIAL-V1.md (ApproveLostContainer) +
 * quyết định chủ quán: "Hệ thống cũ chỉ ghi nhận, đến cuối tháng tôi tự tổng
 * hợp và làm việc với nhân viên, nhưng hệ thống mới cần quy trách nhiệm rõ
 * ràng, do FIFO phải truy xuất được."
 *
 * Legacy: mất container chỉ trừ kho, chủ quán tự nhớ và tự tính tay cuối
 * tháng — không có bản ghi, không ai tra lại được ai chịu, bao nhiêu, vì sao.
 * Ở đây khoản trừ là MỘT BẢN GHI THẬT, số tiền lấy từ costBasis.unitCost thật
 * của đúng lô đã mất (không đoán, không lấy giá gần nhất đắp vào).
 *
 * §2.3a: thiếu dữ liệu (không xác định được nhân viên nào, hoặc lô không có
 * costBasis vì seed từ hệ cũ) KHÔNG được chặn ApproveLostContainer — quyết
 * định "container đã mất" quan trọng hơn và phải đi qua được. Khoản trừ ở
 * đây degrade: amount=null/employeeId=null + gap=true, để chủ quán tự xử lý
 * tay phần đó, thay vì từ chối cả việc duyệt mất container.
 *
 * Bản ghi được tạo NGAY TRONG plan của ApproveLostContainer (commands/approval.js),
 * không đi qua event: L9 (event-dispatch layer) chưa tồn tại, và đây không
 * phải side-effect tuỳ chọn — nó LÀ nghiệp vụ chính của quyết định duyệt.
 */
GIEO.define('hr/liability', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var STATUS = {
    PENDING: 'PENDING',
    WAIVED: 'WAIVED',
    DEDUCTED: 'DEDUCTED',
    REVERSED: 'REVERSED'
  };

  var TRANSITIONS = {
    PENDING: [STATUS.WAIVED, STATUS.DEDUCTED, STATUS.REVERSED],
    WAIVED: [STATUS.REVERSED],
    DEDUCTED: [STATUS.REVERSED],
    REVERSED: []
  };

  function canTransition(from, to) {
    return (TRANSITIONS[from] || []).indexOf(to) !== -1;
  }

  /**
   * Số tiền = costBasis.unitCost thật × remainingQty còn lại lúc mất (phần
   * đã tiêu hợp lệ trước đó không tính vào). Lô không có costBasis (seed từ
   * hệ cũ, §10b.1) thì KHÔNG suy luận — trả gap=true thay vì đoán bằng giá
   * gần nhất.
   */
  function computeLiabilityAmount(unit) {
    if (!unit) return R.err('VALIDATION', 'computeLiabilityAmount cần unit');
    if (!unit.costBasis || typeof unit.costBasis.unitCost !== 'number') {
      return R.ok({ amount: null, currency: null, basis: null, gap: true });
    }
    return R.ok({
      amount: unit.costBasis.unitCost * unit.remainingQty,
      currency: unit.costBasis.currency || 'VND',
      basis: 'ACTUAL',
      gap: false
    });
  }

  /**
   * @param spec.employeeId  có thể null nếu chưa xác định được ai báo mất lô
   *        này khớp hồ sơ nhân viên nào — degrade, không chặn (§2.3a).
   * @param spec.actorId     người duyệt (QUANLY) — luôn bắt buộc, khác employeeId.
   */
  function createLiability(spec) {
    if (!spec) return R.err('VALIDATION', 'createLiability cần spec');
    if (spec.employeeId !== null && spec.employeeId !== undefined && !ids.isId(spec.employeeId, 'employee')) {
      return R.err('VALIDATION', 'employeeId phải hợp lệ hoặc để trống khi chưa xác định được ai chịu');
    }
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'createLiability cần storeId hợp lệ');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'createLiability cần actorId (người duyệt)');
    if (!spec.operationId) return R.err('VALIDATION', 'createLiability cần operationId');
    if (!spec.lostReportId) return R.err('VALIDATION', 'createLiability cần lostReportId');
    if (!spec.unit) return R.err('VALIDATION', 'createLiability cần unit');

    var amountR = computeLiabilityAmount(spec.unit);
    if (R.isErr(amountR)) return amountR;

    var employeeId = spec.employeeId || null;
    var gapReasons = [];
    if (amountR.value.gap) gapReasons.push('NO_COST_BASIS');
    if (!employeeId) gapReasons.push('NO_EMPLOYEE_MATCH');

    return R.ok({
      liabilityId: spec.liabilityId || ids.deterministicId('liability', ['lost', spec.lostReportId]),
      employeeId: employeeId,
      storeId: spec.storeId,
      unitId: spec.unit.unitId,
      itemId: spec.unit.itemId,
      lostReportId: spec.lostReportId,
      amount: amountR.value.amount,
      currency: amountR.value.currency,
      basis: amountR.value.basis,
      gap: gapReasons.length > 0,
      gapReasons: gapReasons,
      status: STATUS.PENDING,
      reason: spec.reason || null,
      createdAt: spec.at,
      approvedBy: spec.actorId,
      operationId: spec.operationId,
      waivedAt: null,
      waivedBy: null,
      waiveReason: null,
      deductedAt: null,
      payrollClosingId: null,
      reversedAt: null,
      reversedBy: null,
      reverseReason: null
    });
  }

  /** Chủ quán miễn trừ — bản ghi vẫn còn (không xoá), chỉ không đi vào lương. */
  function waiveLiability(liability, spec) {
    if (!canTransition(liability.status, STATUS.WAIVED)) {
      return R.err('PRECONDITION', 'không miễn trừ được khoản ở trạng thái ' + liability.status);
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'waiveLiability cần actorId');
    if (!spec.reason) return R.err('VALIDATION', 'waiveLiability cần lý do');
    return R.ok(Object.assign({}, liability, {
      status: STATUS.WAIVED,
      waivedAt: spec.at,
      waivedBy: spec.actorId,
      waiveReason: spec.reason
    }));
  }

  /**
   * Container tìm lại được (RestoreFoundContainer) → hoàn khoản trừ.
   * PENDING lẫn WAIVED đều hoàn được — dù đã miễn trừ, tìm lại vẫn phải đóng
   * bản ghi cho khớp, vì không còn gì để miễn trừ nữa.
   */
  function reverseLiability(liability, spec) {
    if (!canTransition(liability.status, STATUS.REVERSED)) {
      return R.err('PRECONDITION', 'không hoàn được khoản ở trạng thái ' + liability.status);
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'reverseLiability cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'reverseLiability cần operationId');
    return R.ok(Object.assign({}, liability, {
      status: STATUS.REVERSED,
      reversedAt: spec.at,
      reversedBy: spec.actorId,
      reverseReason: spec.reason || 'tìm lại được container đã báo mất',
      operationId: spec.operationId
    }));
  }

  /** Payroll đã trừ khoản này vào kỳ nào — gọi từ ClosePayroll khi áp dụng. */
  function markDeducted(liability, spec) {
    if (!canTransition(liability.status, STATUS.DEDUCTED)) {
      return R.err('PRECONDITION', 'không trừ lương được khoản ở trạng thái ' + liability.status);
    }
    if (!spec.payrollClosingId) return R.err('VALIDATION', 'markDeducted cần payrollClosingId');
    return R.ok(Object.assign({}, liability, {
      status: STATUS.DEDUCTED,
      deductedAt: spec.at,
      payrollClosingId: spec.payrollClosingId
    }));
  }

  /**
   * Khoản PENDING của 1 nhân viên trong kỳ, tách phần có số tiền thật với
   * phần còn gap (không có costBasis) — computePayroll() chỉ trừ phần thật,
   * phần gap chỉ hiển thị để chủ quán tự quyết, không đoán số mà trừ.
   */
  function pendingFor(liabilities, employeeId) {
    var mine = (liabilities || []).filter(function (l) {
      return l.employeeId === employeeId && l.status === STATUS.PENDING;
    });
    var applied = mine.filter(function (l) { return typeof l.amount === 'number'; });
    var gapped = mine.filter(function (l) { return typeof l.amount !== 'number'; });
    return {
      deduction: applied.reduce(function (s, l) { return s + l.amount; }, 0),
      appliedLiabilityIds: applied.map(function (l) { return l.liabilityId; }),
      gapLiabilityIds: gapped.map(function (l) { return l.liabilityId; })
    };
  }

  return {
    STATUS: STATUS,
    computeLiabilityAmount: computeLiabilityAmount,
    createLiability: createLiability,
    waiveLiability: waiveLiability,
    reverseLiability: reverseLiability,
    markDeducted: markDeducted,
    pendingFor: pendingFor
  };
});
