/**
 * Điều phối sự kiện domain — đóng gap L9 (`NET-LOYALTY-V1.md`).
 *
 * `commands/sales.js` (RecordSale, RecordAddon) và `commands/reversal.js`
 * (ReverseTransaction với `eventType`) đẩy sự kiện vào `plan.events`, nhưng
 * TRƯỚC module này không có gì đọc lại mảng đó — luật tích/hoàn điểm loyalty
 * viết xong (`loyalty/accrual.js`) mà không cách nào chạy thật. Đây LÀ tầng
 * "ai lắng nghe sự kiện nào, gọi command nào" mà audit L9 xác nhận CHƯA TỪNG
 * TỒN TẠI — `bootstrap/runtime.js` gọi `routeEvents()` sau mỗi command mutate
 * thành công, rồi tự chạy tiếp các command được route tới qua ĐÚNG cổng
 * `runtime.command()` (idempotent, có quyền, có audit — không phải ghi tắt).
 *
 * CỐ Ý không tự đọc dữ liệu (Firestore, versionRegistry...) — giữ đúng
 * nguyên tắc "denormalized command input" đã dùng xuyên toàn hệ: field nào
 * command tiếp theo cần thì phải đã có sẵn trên chính sự kiện. Caller gốc
 * (RecordSale/RecordAddon/ReverseTransaction) chịu trách nhiệm đính kèm khi
 * đẩy event; thiếu field không route được thì `toInput` trả null — route đó
 * bị bỏ qua thay vì gọi command với input rỗng gây lỗi khó hiểu. Field bắt
 * buộc mà `toInput` KHÔNG tự bịa (như `policy` của ReverseLoyaltyForVoidedBill)
 * vẫn được route đi để lộ ra thành lỗi validate — không phải bị nuốt im lặng.
 */
GIEO.define('bootstrap/domain-events', [], function () {
  'use strict';

  /**
   * Mỗi route: {command, toInput(event) => input | null}.
   *   null  = sự kiện không đủ dữ liệu để dịch, bỏ qua route này hẳn.
   */
  var ROUTES = {
    /* L2 — tích điểm/tem sau khi bill thanh toán xong. */
    SaleCompleted: {
      command: 'AccrueLoyaltyForSale',
      toInput: function (evt) {
        if (!evt.bill) return null;
        return {
          bill: evt.bill,
          customer: evt.customer || null,
          stampsEarnedToday: evt.stampsEarnedToday || 0
        };
      }
    },
    /* L4 — tích điểm cho phần chênh lệch addon. */
    SaleAmountIncreased: {
      command: 'AccrueLoyaltyForAddon',
      toInput: function (evt) {
        return {
          billId: evt.billId,
          addonSeq: evt.addonSeq,
          addedAmount: evt.addedAmount,
          customer: evt.customer || null,
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          occurredAt: evt.occurredAt,
          actorId: evt.actorId
        };
      }
    },
    /*
     * L5 — hoàn điểm/tem khi huỷ bill. `referenceId` của ReverseTransaction
     * chính là billId khi domain huỷ là bán hàng (caller khai eventType
     * 'OrderVoided' đúng cho tình huống này, không cho tình huống khác).
     * `policy` KHÔNG có mặc định ở đây (xem `commands/loyalty.js`) — chủ
     * quán chưa chốt REVERSE hay KEEP.
     */
    OrderVoided: {
      command: 'ReverseLoyaltyForVoidedBill',
      toInput: function (evt) {
        return {
          billId: evt.referenceId,
          policy: evt.loyaltyPolicy,
          entries: evt.loyaltyEntries || [],
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          occurredAt: evt.occurredAt,
          actorId: evt.reversedBy
        };
      }
    }
  };

  /** Dịch `plan.events` thành danh sách {command, input, sourceEvent} để chạy tiếp. */
  function routeEvents(events) {
    return (events || []).reduce(function (out, evt) {
      var route = evt && ROUTES[evt.type];
      if (!route) return out;
      var input = route.toInput(evt);
      if (input === null) return out;
      out.push({ command: route.command, input: input, sourceEvent: evt.type });
      return out;
    }, []);
  }

  return { ROUTES: ROUTES, routeEvents: routeEvents };
});
