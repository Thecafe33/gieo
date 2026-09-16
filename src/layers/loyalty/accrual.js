/**
 * Tích điểm / tích tem / đổi thưởng — luật nghiệp vụ.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-LOYALTY-V1.md §2, §3, §4, §5, §6.
 *
 * GIỮ NGUYÊN những gì legacy làm đúng (chuỗi này là một trong những chỗ cẩn
 * thận nhất của hệ thống cũ):
 *   - điểm tính trên tổng SAU giảm giá, nên tự nhiên không double-dip (§6)
 *   - ly "mua X tặng Y" KHÔNG được tính tem (fix đã có trong legacy)
 *   - ly free đổi tem vẫn đi qua FIFO/COGS như món thường — quà tặng vẫn
 *     tiêu tốn kho thật (§3), nên KHÔNG có nhánh riêng ở đây
 *
 * SỬA những gì sai:
 *   - kết quả là DÒNG SỔ, không phải cộng thẳng vào field số dư
 *   - addon phải tích điểm cho phần chênh lệch (§4 — legacy bỏ sót hoàn toàn)
 *   - huỷ bill phát event để hoàn điểm; giữ/không hoàn là CỜ TƯỜNG MINH, không
 *     phải im lặng bỏ qua rồi bảo "Quản lý xử lý tay" trong khi chưa từng có
 *     màn hình để xử lý tay (§5)
 */
GIEO.define('loyalty/accrual', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'loyalty/ledger',
  'loyalty/customer'
], function (ids, R, ledger, customerLib) {
  'use strict';

  /* Luật của quán, giữ nguyên con số legacy. Đưa ra ngoài thành tham số để
     đổi luật không phải sửa code — nhưng mặc định khớp hành vi đang chạy. */
  var DEFAULT_RULES = {
    pointsPer100: 5,          // dine-in: 5 điểm / 100đ
    stampPerCup: 1,           // to-go: 1 tem / ly
    maxStampsPerDay: 2,       // tối đa 2 tem / khách / ngày
    stampsPerFreeDrink: 6     // 6 tem → 1 ly miễn phí
  };

  function rulesOf(spec) {
    return Object.assign({}, DEFAULT_RULES, spec && spec.rules ? spec.rules : {});
  }

  /**
   * Số ly được tính tem. Ly tặng (isFree) KHÔNG tính — giữ nguyên fix đã có
   * trong legacy cho bug "từng cho tem cả ly tặng".
   */
  function countableCups(bill) {
    return (bill.lines || []).reduce(function (s, l) {
      return s + (l.isFree ? 0 : l.qty);
    }, 0);
  }

  /**
   * Tích cho 1 bill đã thanh toán.
   *
   * @param spec.bill              bill đã hoàn tất (total đã SAU giảm giá)
   * @param spec.customer          khách đã định danh
   * @param spec.stampsEarnedToday số tem khách đã nhận trong ngày (cho trần/ngày)
   * @param spec.operationId
   */
  function accrueForSale(spec) {
    var bill = spec.bill;
    var customer = spec.customer;
    if (!customer) {
      /* Không có khách thì không tích — nhưng đây là QUYẾT ĐỊNH TƯỜNG MINH,
         không phải return 0 ngầm như legacy làm ở chỗ khác. */
      return R.ok({ entries: [], skipped: 'NO_CUSTOMER' });
    }
    if (!spec.operationId) return R.err('VALIDATION', 'accrueForSale cần operationId');

    var rules = rulesOf(spec);
    var mult = customerLib.accrualMultiplierOf(customer);
    var entries = [];

    function push(currency, delta, reason) {
      if (delta === 0) return null;
      var e = ledger.createEntry({
        customerId: customer.customerId,
        storeId: bill.storeId,
        currency: currency,
        delta: delta,
        reason: reason,
        referenceType: 'bill',
        referenceId: bill.billId,
        operationId: spec.operationId,
        businessDate: bill.businessDate,
        occurredAt: bill.occurredAt,
        actorId: bill.soldByActorId
      });
      if (R.isErr(e)) return e;
      entries.push(e.value);
      return null;
    }

    if (bill.channel && bill.channel.type === 'DINE_IN') {
      /* Trên total SAU giảm giá — nên không double-dip với khuyến mãi. */
      var pts = Math.floor((bill.total / 100) * rules.pointsPer100 * mult);
      var err = push(ledger.CURRENCY.POINTS, pts, ledger.REASON.EARN_SALE);
      if (err) return err;
    } else {
      var cups = countableCups(bill);
      var earned = cups * rules.stampPerCup * mult;
      /* Trần theo ngày — giữ nguyên luật legacy. */
      var room = Math.max(0, rules.maxStampsPerDay - (spec.stampsEarnedToday || 0));
      var stamps = Math.min(earned, room);
      var e2 = push(ledger.CURRENCY.STAMPS, stamps, ledger.REASON.EARN_SALE);
      if (e2) return e2;
    }

    return R.ok({ entries: entries, skipped: null });
  }

  /**
   * ĐÓNG GAP §4 — addon.
   *
   * Legacy `_submitAddonImpl` không có bất kỳ lời gọi tích điểm nào, nên khách
   * mua thêm mà không được cộng điểm cho phần tiền đó, dù cùng một khách đã
   * định danh từ đầu bill. Ở đây tích cho ĐÚNG phần chênh lệch.
   */
  function accrueForAddon(spec) {
    var customer = spec.customer;
    if (!customer) return R.ok({ entries: [], skipped: 'NO_CUSTOMER' });
    if (!spec.operationId) return R.err('VALIDATION', 'accrueForAddon cần operationId');
    if (typeof spec.addedAmount !== 'number' || spec.addedAmount <= 0) {
      return R.err('VALIDATION', 'addon phải có số tiền tăng thêm dương');
    }

    var rules = rulesOf(spec);
    var mult = customerLib.accrualMultiplierOf(customer);
    var pts = Math.floor((spec.addedAmount / 100) * rules.pointsPer100 * mult);
    if (pts === 0) return R.ok({ entries: [], skipped: 'BELOW_THRESHOLD' });

    var e = ledger.createEntry({
      customerId: customer.customerId,
      storeId: spec.storeId,
      currency: ledger.CURRENCY.POINTS,
      delta: pts,
      reason: ledger.REASON.EARN_ADDON,
      referenceType: 'billAddon',
      /* referenceId gồm cả seq nên 2 lần addon khác nhau là 2 dòng khác nhau,
         còn lặp cùng seq thì trùng entryId → không cộng đúp. */
      referenceId: spec.billId + '.' + spec.addonSeq,
      operationId: spec.operationId,
      businessDate: spec.businessDate,
      occurredAt: spec.occurredAt,
      actorId: spec.actorId
    });
    if (R.isErr(e)) return e;
    return R.ok({ entries: [e.value], skipped: null });
  }

  /** Đổi tem lấy ly miễn phí. Số dư kiểm từ SỔ, không từ field. */
  function redeemStamps(spec) {
    var rules = rulesOf(spec);
    var balance = ledger.computeBalance(spec.entries || [], spec.customerId);
    var need = rules.stampsPerFreeDrink;

    if (balance.STAMPS < need) {
      return R.err('PRECONDITION',
        'không đủ tem: có ' + balance.STAMPS + ', cần ' + need);
    }

    var spend = ledger.createEntry({
      customerId: spec.customerId, storeId: spec.storeId,
      currency: ledger.CURRENCY.STAMPS, delta: -need,
      reason: ledger.REASON.CONVERT_STAMPS,
      referenceType: 'bill', referenceId: spec.billId,
      operationId: spec.operationId, businessDate: spec.businessDate,
      occurredAt: spec.occurredAt, actorId: spec.actorId
    });
    if (R.isErr(spend)) return spend;

    var gain = ledger.createEntry({
      customerId: spec.customerId, storeId: spec.storeId,
      currency: ledger.CURRENCY.FREE_DRINKS, delta: 1,
      reason: ledger.REASON.CONVERT_STAMPS,
      referenceType: 'bill', referenceId: spec.billId,
      operationId: spec.operationId, businessDate: spec.businessDate,
      occurredAt: spec.occurredAt, actorId: spec.actorId
    });
    if (R.isErr(gain)) return gain;

    return R.ok({ entries: [spend.value, gain.value] });
  }

  /**
   * ĐÓNG GAP §5 — huỷ bill.
   *
   * Legacy: cả 2 app chỉ hoàn kho, KHÔNG hoàn điểm/tem. Gap này được ghi nhận
   * CÔNG KHAI (toast POS và cảnh báo QUANLY đều nói "Quản lý xử lý tay") —
   * nhưng QUANLY chưa bao giờ có màn hình nào để xử lý tay.
   *
   * Ở đây giữ/không hoàn là CỜ TƯỜNG MINH `policy`, và cả hai nhánh đều để lại
   * dấu vết: không hoàn thì trả lý do, không im lặng.
   */
  function reverseForVoidedBill(spec) {
    var policy = spec.policy || 'REVERSE';
    if (policy !== 'REVERSE' && policy !== 'KEEP') {
      return R.err('VALIDATION', "policy phải là 'REVERSE' hoặc 'KEEP'");
    }
    if (policy === 'KEEP') {
      return R.ok({
        entries: [],
        skipped: 'POLICY_KEEP',
        note: 'chủ quán chọn giữ điểm/tem khi huỷ bill — quyết định tường minh, không phải bỏ sót'
      });
    }

    var original = (spec.entries || []).filter(function (e) {
      return e.referenceId === spec.billId &&
        (e.reason === ledger.REASON.EARN_SALE || e.reason === ledger.REASON.EARN_ADDON);
    });
    if (original.length === 0) {
      return R.ok({ entries: [], skipped: 'NOTHING_TO_REVERSE' });
    }

    var out = [];
    for (var i = 0; i < original.length; i++) {
      var o = original[i];
      /* Bù trừ đúng dòng gốc — cùng nguyên tắc với reversal của FIFO:
         hoàn theo cái đã ghi, không tính lại theo luật hiện tại. */
      var e = ledger.createEntry({
        customerId: o.customerId, storeId: o.storeId,
        currency: o.currency, delta: -o.delta,
        reason: ledger.REASON.REVERSAL,
        referenceType: 'billVoid', referenceId: spec.billId + '.reversal.' + o.currency,
        operationId: spec.operationId, businessDate: spec.businessDate,
        occurredAt: spec.occurredAt, actorId: spec.actorId,
        note: 'hoàn do huỷ bill ' + spec.billId
      });
      if (R.isErr(e)) return e;
      out.push(e.value);
    }
    return R.ok({ entries: out, skipped: null });
  }

  return {
    DEFAULT_RULES: DEFAULT_RULES,
    countableCups: countableCups,
    accrueForSale: accrueForSale,
    accrueForAddon: accrueForAddon,
    redeemStamps: redeemStamps,
    reverseForVoidedBill: reverseForVoidedBill
  };
});
