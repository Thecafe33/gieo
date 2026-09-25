/**
 * LoyaltyLedger — SỔ CÁI, không phải field cộng dồn.
 *
 * Đây là phát hiện quan trọng nhất của chuỗi Loyalty
 * (FIFO-CHAIN-TRACE-LOYALTY-V1.md §8, FEATURE-TREE-V1.md §4.15).
 *
 * Nghịch lý của legacy: tích điểm là một trong những chuỗi được làm CẨN THẬN
 * NHẤT toàn hệ thống — idempotent qua marker theo billId, Firestore transaction,
 * hàng đợi retry tự phục hồi — nhưng LƯU TRỮ SAI GỐC:
 * `total_points`/`stamp_count`/`free_drink_available` là field cộng dồn trực
 * tiếp trên `customers/{phone}`, và comment tự gọi đó là "single source of truth".
 *
 * Vì sao nặng hơn cả `untrackedPendingDelta` của FIFO: FIFO còn có
 * `stock_transactions_gieogieo` nên về nguyên tắc dựng lại `currentStock` được.
 * Loyalty thì KHÔNG — `loyalty_bill_effects_gieogieo` chỉ là marker chống trùng
 * theo billId, không phải sổ cái. Nếu số dư trôi (ghi lỗi, sửa tay Firestore,
 * race hiếm ngoài phạm vi marker), KHÔNG CÓ CÁCH NÀO tính lại đúng — chỉ có
 * thể sửa tay mà không kiểm chứng được.
 *
 * Ở đây số dư là KẾT QUẢ CỘNG SỔ, không phải thứ được ghi thẳng. Không có hàm
 * nào set số dư.
 */
GIEO.define('loyalty/ledger', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  var CURRENCY = { POINTS: 'POINTS', STAMPS: 'STAMPS', FREE_DRINKS: 'FREE_DRINKS' };

  var REASON = {
    EARN_SALE: 'EARN_SALE',
    EARN_ADDON: 'EARN_ADDON',
    REDEEM: 'REDEEM',
    CONVERT_STAMPS: 'CONVERT_STAMPS',
    REVERSAL: 'REVERSAL',
    MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT'
  };

  function isCurrency(c) { return Object.prototype.hasOwnProperty.call(CURRENCY, c); }
  function isReason(r) { return Object.prototype.hasOwnProperty.call(REASON, r); }

  /**
   * Một dòng sổ BẤT BIẾN.
   * `entryId` xác định theo (customer, currency, reason, referenceId) nên ghi
   * lại cùng một sự kiện không sinh dòng thứ hai.
   */
  function createEntry(spec) {
    if (!spec) return R.err('VALIDATION', 'ledger entry cần spec');
    if (!ids.isId(spec.customerId, 'customer')) return R.err('VALIDATION', 'cần customerId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'cần storeId hợp lệ');
    if (!isCurrency(spec.currency)) return R.err('VALIDATION', 'currency không hợp lệ: ' + spec.currency);
    if (!isReason(spec.reason)) return R.err('VALIDATION', 'reason không hợp lệ: ' + spec.reason);
    if (typeof spec.delta !== 'number' || !isFinite(spec.delta) || spec.delta === 0) {
      return R.err('VALIDATION', 'delta phải là số khác 0');
    }
    if (!spec.operationId) return R.err('VALIDATION', 'ledger entry cần operationId');
    if (!spec.referenceId) {
      return R.err('VALIDATION', 'ledger entry cần referenceId (billId/lý do) — dòng sổ không nguồn gốc là dòng không kiểm chứng được');
    }
    if (!spec.businessDate) return R.err('VALIDATION', 'ledger entry cần businessDate');

    return R.ok({
      entryId: spec.entryId || ids.deterministicId('ledger', [
        'loyalty', spec.customerId, spec.currency, spec.reason, spec.referenceId
      ]),
      customerId: spec.customerId,
      storeId: spec.storeId,
      currency: spec.currency,
      delta: spec.delta,
      reason: spec.reason,
      referenceType: spec.referenceType || 'bill',
      referenceId: spec.referenceId,
      operationId: spec.operationId,
      businessDate: spec.businessDate,
      occurredAt: typeof spec.occurredAt === 'number' ? spec.occurredAt : null,
      actorId: spec.actorId || null,
      note: spec.note || null
    });
  }

  /**
   * Số dư = TỔNG SỔ. Không có hàm set số dư ở bất kỳ đâu, nên không tồn tại
   * đường làm số dư trôi khỏi lịch sử.
   */
  function computeBalance(entries, customerId) {
    var bal = { POINTS: 0, STAMPS: 0, FREE_DRINKS: 0 };
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (customerId && e.customerId !== customerId) continue;
      bal[e.currency] += e.delta;
    }
    return bal;
  }

  /**
   * Đối chiếu số dư đang hiển thị với số dư dựng lại từ sổ.
   *
   * Legacy không làm được phép này vì không có sổ. Đây là thứ biến "số dư trôi"
   * từ chuyện không phát hiện được thành chuyện phát hiện được.
   */
  function detectDrift(entries, customerId, storedBalance) {
    var rebuilt = computeBalance(entries, customerId);
    var drift = {};
    var clean = true;
    Object.keys(rebuilt).forEach(function (k) {
      var stored = (storedBalance && typeof storedBalance[k] === 'number') ? storedBalance[k] : rebuilt[k];
      if (stored !== rebuilt[k]) {
        clean = false;
        drift[k] = { stored: stored, rebuilt: rebuilt[k], difference: stored - rebuilt[k] };
      }
    });
    return R.ok({ customerId: customerId, rebuilt: rebuilt, clean: clean, drift: drift });
  }

  /**
   * Sửa tay số dư — vẫn phải đi qua sổ, có lý do và người chịu trách nhiệm.
   * Legacy không có màn hình nào để "xử lý tay" dù toast bảo Quản lý xử lý tay;
   * ở đây đường sửa tay tồn tại, nhưng nó là 1 dòng sổ chứ không phải ghi đè.
   */
  function adjust(spec) {
    if (!spec.reasonText) {
      return R.err('VALIDATION', 'sửa tay số dư phải có lý do — sửa không lý do là sửa không kiểm chứng được');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'sửa tay phải có actorId');
    return createEntry({
      customerId: spec.customerId,
      storeId: spec.storeId,
      currency: spec.currency,
      delta: spec.delta,
      reason: REASON.MANUAL_ADJUSTMENT,
      referenceType: 'manual',
      referenceId: spec.operationId,
      operationId: spec.operationId,
      businessDate: spec.businessDate,
      occurredAt: spec.occurredAt,
      actorId: spec.actorId,
      note: spec.reasonText
    });
  }

  return {
    CURRENCY: CURRENCY,
    REASON: REASON,
    createEntry: createEntry,
    computeBalance: computeBalance,
    detectDrift: detectDrift,
    adjust: adjust
  };
});
