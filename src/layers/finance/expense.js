/**
 * Expense — chi phí vận hành.
 *
 * FEATURE-TREE-V1.md §2 mục [7]: hard dep để POS ghi chi phí; phần còn lại của
 * domain optional.
 *
 * Điểm cần đúng ngay từ đầu: chi phí ƯỚC TÍNH và chi phí THẬT phải phân biệt
 * được. Chain-trace P&L cho thấy `chotSoThang()` chỉ cho chốt khi không còn
 * chi phí "ước tính chờ số thật" — tức là khái niệm này ĐÃ tồn tại trong
 * nghiệp vụ thật và là điều kiện chốt sổ, nên nó phải là field tường minh chứ
 * không phải quy ước ngầm trong ghi chú.
 */
GIEO.define('finance/expense', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var STATUS = {
    /* Số ước tính, chờ hoá đơn thật — CHẶN chốt sổ tháng. */
    ESTIMATED: 'ESTIMATED',
    ACTUAL: 'ACTUAL',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    REJECTED: 'REJECTED'
  };

  /* Chi phí cố định phân bổ đều theo tháng vs biến phí theo phát sinh —
     phân biệt vì P&L cần tách 2 loại. */
  var NATURE = { FIXED: 'FIXED', VARIABLE: 'VARIABLE' };

  function createExpense(spec) {
    if (!spec) return R.err('VALIDATION', 'expense cần spec');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'expense cần storeId hợp lệ');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'expense cần actorId — ai ghi khoản này');
    if (!spec.categoryId) return R.err('VALIDATION', 'expense cần categoryId');
    if (typeof spec.amount !== 'number' || !(spec.amount > 0)) {
      return R.err('VALIDATION', 'số tiền phải dương');
    }
    if (!spec.businessDate) return R.err('VALIDATION', 'expense cần businessDate');
    if (!STATUS[spec.status]) {
      return R.err('VALIDATION',
        'expense phải khai rõ status — ESTIMATED (chờ số thật) hay ACTUAL. ' +
        'Không phân biệt được thì không biết tháng đã đủ điều kiện chốt sổ chưa.');
    }
    if (!NATURE[spec.nature]) return R.err('VALIDATION', "nature phải là FIXED hoặc VARIABLE");
    if (!spec.operationId) return R.err('VALIDATION', 'expense cần operationId');

    return R.ok({
      expenseId: spec.expenseId || ids.newId('expense'),
      storeId: spec.storeId,
      categoryId: spec.categoryId,
      amount: spec.amount,
      nature: spec.nature,
      status: spec.status,
      businessDate: spec.businessDate,
      occurredAt: spec.occurredAt || null,
      actorId: spec.actorId,
      paymentMethodId: spec.paymentMethodId || null,
      note: spec.note || null,
      operationId: spec.operationId,
      revisions: []
    });
  }

  /**
   * Thay số ước tính bằng số thật.
   * Append-only: giữ giá trị cũ để trả lời "trước đây ước bao nhiêu".
   */
  function settleEstimate(expense, spec) {
    if (expense.status !== STATUS.ESTIMATED) {
      return R.err('PRECONDITION', 'chỉ chốt được khoản đang ở trạng thái ước tính');
    }
    if (typeof spec.actualAmount !== 'number' || !(spec.actualAmount > 0)) {
      return R.err('VALIDATION', 'số thật phải dương');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'chốt số thật cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'chốt số thật cần operationId');

    return R.ok(Object.assign({}, expense, {
      amount: spec.actualAmount,
      status: STATUS.ACTUAL,
      revisions: expense.revisions.concat([{
        operationId: spec.operationId,
        actorId: spec.actorId,
        at: spec.at || null,
        from: { amount: expense.amount, status: expense.status },
        to: { amount: spec.actualAmount, status: STATUS.ACTUAL },
        reason: spec.reason || 'có hoá đơn thật'
      }])
    }));
  }

  /**
   * Lý do CHẶN chốt sổ tháng — giữ nguyên điều kiện nghiệp vụ của legacy
   * ("chỉ cho chốt khi tháng đã kết thúc VÀ không còn chi phí ước tính chờ số
   * thật"), nhưng nêu rõ khoản nào thay vì chỉ báo không chốt được.
   */
  function closeBookBlockers(expenses) {
    var blockers = [];
    (expenses || []).forEach(function (e) {
      if (e.status === STATUS.ESTIMATED) {
        blockers.push('khoản "' + e.categoryId + '" (' + e.amount + ') còn là số ước tính, chờ hoá đơn thật');
      }
      if (e.status === STATUS.PENDING_APPROVAL) {
        blockers.push('khoản "' + e.categoryId + '" (' + e.amount + ') chưa được duyệt');
      }
    });
    return blockers;
  }

  /** Tổng theo loại — đầu vào của P&L. */
  function summarize(expenses) {
    var out = { fixed: 0, variable: 0, estimated: 0, actual: 0, total: 0, byCategory: {} };
    (expenses || []).forEach(function (e) {
      if (e.status === STATUS.REJECTED) return;
      if (e.nature === NATURE.FIXED) out.fixed += e.amount; else out.variable += e.amount;
      if (e.status === STATUS.ESTIMATED) out.estimated += e.amount; else out.actual += e.amount;
      out.total += e.amount;
      out.byCategory[e.categoryId] = (out.byCategory[e.categoryId] || 0) + e.amount;
    });
    return out;
  }

  return {
    STATUS: STATUS,
    NATURE: NATURE,
    createExpense: createExpense,
    settleEstimate: settleEstimate,
    closeBookBlockers: closeBookBlockers,
    summarize: summarize
  };
});
