/**
 * Lệnh Chi phí — POS ghi tại quầy, QUANLY duyệt.
 *
 * Nguồn: `finance/expense.js` (domain thuần, đã có từ trước) chưa từng được
 * bọc thành command nên không app nào ghi được — đúng lớp gap "domain có sẵn
 * nhưng không app nào với tới" đã gặp ở P11 Reporting.
 *
 * Hành vi legacy cần giữ nguyên (đã xác nhận qua `expenses_gieogieo`):
 *   - Khoản POS ghi luôn vào trạng thái CHỜ DUYỆT (`status:'pending_review'`),
 *     không tự động thành số thật. `commands/approval.ApproveExpense` (đã có
 *     sẵn) là nơi DUY NHẤT chuyển CHỜ DUYỆT -> ACTUAL/REJECTED.
 *   - Chi bằng TIỀN MẶT phải trừ vào đúng quỹ đang mở NGAY LÚC GHI, không đợi
 *     duyệt — tiền đã rời tủ tiền là sự thật vật lý, duyệt chỉ là xác nhận sổ
 *     sách. Dùng lại ĐÚNG MỘT hàm `commands/shift.recordCashMovement` — không
 *     viết công thức trừ quỹ thứ hai ở đây.
 */
GIEO.define('commands/finance', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'commands/shift',
  'finance/expense'
], function (ids, R, pipeline, shiftLib, expenseLib) {
  'use strict';

  var RecordExpense = pipeline.defineCommand({
    name: 'RecordExpense',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['expense', input.expenseRef]);
    },

    validate: function (input) {
      if (!input || !input.expenseRef) {
        return R.err('VALIDATION', 'RecordExpense cần expenseRef để id xác định (chống ghi đúp khi mất mạng)');
      }
      if (!input.categoryId) return R.err('VALIDATION', 'RecordExpense cần categoryId');
      if (typeof input.amount !== 'number' || !(input.amount > 0)) {
        return R.err('VALIDATION', 'số tiền phải dương');
      }
      if (input.paymentMethod !== 'CASH' && input.paymentMethod !== 'BANK') {
        return R.err('VALIDATION', "paymentMethod phải là 'CASH' hoặc 'BANK'");
      }
      if (input.paymentMethod === 'CASH' && !input.cashSegment) {
        return R.err('PRECONDITION',
          'chi tiền mặt cần đoạn ca đang mở để trừ đúng quỹ — chưa mở ca thì không ghi được chi phí tiền mặt tại quầy');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var opId = ids.deterministicId('operation', ['expense', input.expenseRef]);

      /* Nguồn POS luôn CHỜ DUYỆT, kể cả actor có quyền REVIEW_APPROVE_CORRECT
         — status theo ĐÚNG kênh nhập liệu (ctx.source), không theo quyền của
         người bấm, để không có đường "tự ghi tự duyệt" lẫn vào lúc ghi. */
      var status = ctx.source === 'QUANLY' ? expenseLib.STATUS.ACTUAL : expenseLib.STATUS.PENDING_APPROVAL;
      var nature = input.nature === 'FIXED' ? expenseLib.NATURE.FIXED : expenseLib.NATURE.VARIABLE;

      var expenseR = expenseLib.createExpense({
        expenseId: ids.deterministicId('expense', [input.expenseRef]),
        storeId: ctx.storeId,
        actorId: ctx.actor.actorId,
        categoryId: input.categoryId,
        amount: input.amount,
        nature: nature,
        status: status,
        businessDate: ctx.businessDate,
        occurredAt: ctx.clock.now(),
        paymentMethodId: input.paymentMethod,
        note: input.note,
        operationId: opId
      });
      if (R.isErr(expenseR)) return expenseR;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'expense', record: expenseR.value });

      if (input.paymentMethod === 'CASH') {
        var movedR = shiftLib.recordCashMovement(input.cashSegment, {
          amount: input.amount, direction: 'OUT'
        });
        if (R.isErr(movedR)) return movedR;
        plan.domainRecords.push({ type: 'cashSegment', record: movedR.value });
      }

      return R.ok(plan);
    }
  });

  return {
    RecordExpense: RecordExpense
  };
});
