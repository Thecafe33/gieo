/**
 * Loyalty — bọc `loyalty/accrual.js` thành command thật, đi qua ĐÚNG pipeline
 * chung (idempotency + quyền + audit) như mọi mutation khác.
 *
 * Đóng nửa sau của gap L9 (`NET-LOYALTY-V1.md`): luật tích/hoàn điểm đã viết
 * xong ở `loyalty/accrual.js` từ trước, nhưng chưa có command nào GỌI nó —
 * nên nó chưa bao giờ tạo ra domainRecord thật. `bootstrap/domain-events.js`
 * là tầng điều phối gọi các command này khi `SaleCompleted`/`SaleAmountIncreased`/
 * `OrderVoided` phát ra từ `commands/sales.js`/`commands/reversal.js`.
 *
 * Theo đúng nguyên tắc "denormalized command input" đã dùng xuyên toàn hệ:
 * command KHÔNG tự tra khách hàng hay sổ cũ — `customer`/`entries` phải do
 * caller mang tới sẵn. Thiếu khách hàng thì `accrual.js` tự trả `skipped`
 * tường minh (không đoán, không im lặng bỏ qua).
 */
GIEO.define('commands/loyalty', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'loyalty/accrual'
], function (ids, R, pipeline, accrual) {
  'use strict';

  function pushEntries(plan, entries) {
    (entries || []).forEach(function (e) {
      plan.domainRecords.push({ type: 'loyaltyLedgerEntry', record: e });
    });
  }

  /** L2 — tích điểm/tem cho 1 bill đã thanh toán (event SaleCompleted). */
  var AccrueLoyaltyForSale = pipeline.defineCommand({
    name: 'AccrueLoyaltyForSale',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['loyalty-accrue-sale', input.bill && input.bill.billId]);
    },

    validate: function (input) {
      if (!input || !input.bill) return R.err('VALIDATION', 'AccrueLoyaltyForSale cần bill');
      if (!ids.isId(input.bill.billId, 'bill')) return R.err('VALIDATION', 'bill thiếu billId hợp lệ');
      return R.ok(true);
    },

    execute: function (input) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['loyalty-accrue-sale', input.bill.billId]);
      var r = accrual.accrueForSale({
        bill: input.bill,
        customer: input.customer || null,
        stampsEarnedToday: input.stampsEarnedToday || 0,
        operationId: opId
      });
      if (R.isErr(r)) return r;
      pushEntries(plan, r.value.entries);
      return R.ok(plan);
    }
  });

  /** L4 — đóng gap addon không cộng điểm (event SaleAmountIncreased). */
  var AccrueLoyaltyForAddon = pipeline.defineCommand({
    name: 'AccrueLoyaltyForAddon',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['loyalty-accrue-addon', input.billId, String(input.addonSeq)]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.billId, 'bill')) return R.err('VALIDATION', 'AccrueLoyaltyForAddon cần billId');
      if (input.addonSeq === undefined || input.addonSeq === null) {
        return R.err('VALIDATION', 'AccrueLoyaltyForAddon cần addonSeq');
      }
      if (typeof input.addedAmount !== 'number' || input.addedAmount <= 0) {
        return R.err('VALIDATION', 'addon phải có số tiền tăng thêm dương');
      }
      return R.ok(true);
    },

    execute: function (input) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['loyalty-accrue-addon', input.billId, String(input.addonSeq)]);
      var r = accrual.accrueForAddon({
        customer: input.customer || null,
        operationId: opId,
        addedAmount: input.addedAmount,
        billId: input.billId,
        addonSeq: input.addonSeq,
        storeId: input.storeId,
        businessDate: input.businessDate,
        occurredAt: input.occurredAt,
        actorId: input.actorId
      });
      if (R.isErr(r)) return r;
      pushEntries(plan, r.value.entries);
      return R.ok(plan);
    }
  });

  /**
   * L5 — hoàn điểm/tem khi huỷ bill (event OrderVoided).
   *
   * `policy` mặc định `REVERSE` (chốt chủ quán 2026-09, `NET-LOYALTY-V1.md`
   * L5: "Khi hủy phải thu hồi điểm"). Trước đây bắt buộc caller khai rõ vì
   * chưa chốt REVERSE hay KEEP; giờ đã chốt nên mặc định áp dụng khi caller
   * không truyền — nhưng vẫn CHO PHÉP truyền `'KEEP'` tường minh cho ca đặc
   * biệt (không tự ý loại bỏ đường thoát, chỉ đổi mặc định). Giá trị khác
   * REVERSE/KEEP vẫn là lỗi validate, không âm thầm coi như REVERSE.
   */
  var ReverseLoyaltyForVoidedBill = pipeline.defineCommand({
    name: 'ReverseLoyaltyForVoidedBill',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['loyalty-reverse', input.billId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.billId, 'bill')) return R.err('VALIDATION', 'ReverseLoyaltyForVoidedBill cần billId');
      var policy = input.policy || 'REVERSE';
      if (policy !== 'REVERSE' && policy !== 'KEEP') {
        return R.err('VALIDATION',
          "policy phải là 'REVERSE' hoặc 'KEEP' nếu truyền — mặc định 'REVERSE' " +
          "khi không truyền (NET-LOYALTY-V1.md L5)");
      }
      return R.ok(true);
    },

    execute: function (input) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['loyalty-reverse', input.billId]);
      var r = accrual.reverseForVoidedBill({
        policy: input.policy || 'REVERSE',
        billId: input.billId,
        entries: input.entries || [],
        operationId: opId,
        businessDate: input.businessDate,
        occurredAt: input.occurredAt,
        actorId: input.actorId
      });
      if (R.isErr(r)) return r;
      pushEntries(plan, r.value.entries);
      return R.ok(plan);
    }
  });

  return {
    AccrueLoyaltyForSale: AccrueLoyaltyForSale,
    AccrueLoyaltyForAddon: AccrueLoyaltyForAddon,
    ReverseLoyaltyForVoidedBill: ReverseLoyaltyForVoidedBill
  };
});
