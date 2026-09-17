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
 *
 * Nối tiếp — AlertEngine (`NET-ALERTS-V1.md` "PHÁT HIỆN CHUNG"): domain thứ 5
 * xác nhận phụ thuộc gap này. `PrepYieldMismatch`/`LostContainerReported`/
 * `StockCountPartiallyApplied` giờ route tới `RaiseAlert` (`commands/alerts.js`).
 * `StockCountPartiallyApplied` mang NHIỀU dòng lỗi trong 1 sự kiện — `toInput`
 * ở đây được phép trả một MẢNG input (1 alert riêng cho từng dòng) thay vì 1
 * object; `routeEvents` xoè mảng đó ra thành nhiều route độc lập.
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
     * `policy` không truyền ở đây khi `evt.loyaltyPolicy` vắng — `commands/
     * loyalty.js` tự mặc định 'REVERSE' (chốt chủ quán 2026-09, L5: "Khi hủy
     * phải thu hồi điểm"), route này không cần lặp lại mặc định đó.
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
    },
    /* BTP B1 — lệch yield >ngưỡng lúc nấu mẻ (commands/prep.js). */
    PrepYieldMismatch: {
      command: 'RaiseAlert',
      toInput: function (evt) {
        return {
          type: 'PREP_YIELD_MISMATCH',
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          subjectKey: evt.prepBatchId,
          data: {
            prepBatchId: evt.prepBatchId,
            prepItemId: evt.prepItemId,
            variancePct: evt.variancePct
          }
        };
      }
    },
    /* Raw Material RM6 — báo mất hũ (commands/inventory.js ReportLostContainer)
       vào thẳng danh sách chờ duyệt của QUANLY (LOST_CONTAINER_PENDING đã có
       sẵn trong TYPES, khớp đúng chain-trace gốc "container mất không bao giờ
       đổi status"). */
    LostContainerReported: {
      command: 'RaiseAlert',
      toInput: function (evt) {
        if (!evt.lostReportId) return null;
        return {
          type: 'LOST_CONTAINER_PENDING',
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          subjectKey: evt.unitId,
          data: { unitId: evt.unitId, lostReportId: evt.lostReportId }
        };
      }
    },
    /* Stock Count SC3 — dòng kiểm kê không áp được lúc duyệt (commands/approval.js
       ApproveStockCount). 1 sự kiện có thể mang NHIỀU dòng lỗi — 1 alert / dòng,
       subjectKey theo (stockCountId, itemId) để 2 dòng lỗi khác món không trùng id. */
    StockCountPartiallyApplied: {
      command: 'RaiseAlert',
      toInput: function (evt) {
        return (evt.failedLines || []).map(function (line) {
          return {
            type: 'STOCK_COUNT_LINE_FAILED',
            storeId: evt.storeId,
            businessDate: evt.businessDate,
            subjectKey: evt.stockCountId + ':' + line.itemId,
            data: { stockCountId: evt.stockCountId, itemId: line.itemId, reason: line.reason }
          };
        });
      }
    },
    /* Sales N10 — bán món chưa khai định mức (commands/sales.js RecordSale,
       §2.3a: KHÔNG chặn bán, chỉ cảnh báo). MISSING_RECIPE đã có sẵn trong
       TYPES (AUTO_VERIFIABLE) — tự hết khi khai định mức xong, không cần
       consumer resolve tay. subjectKey theo menuItemId, KHÔNG theo billId —
       nhiều bill cùng bán món này chỉ cần 1 alert đang mở cho món đó. */
    MissingRecipeDetected: {
      command: 'RaiseAlert',
      toInput: function (evt) {
        return {
          type: 'MISSING_RECIPE',
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          subjectKey: evt.menuItemId,
          data: { menuItemId: evt.menuItemId }
        };
      }
    },
    /* Sales #5 / BTP B1 — hết nguyên liệu thật lúc bán/nấu (commands/sales.js
       RecordSale, commands/prep.js RecordPrepProduction; §2.3a: KHÔNG chặn,
       chỉ cảnh báo — quyết định chủ quán 2026-09). UNIT_NEEDS_REVIEW đã có
       sẵn trong TYPES, cùng lý do NEGATIVE_REMAINDER dùng khi `finish()` báo
       hết hũ còn âm. subjectKey theo unitId — Unit gánh nợ CHÍNH LÀ chủ thể
       cần rà, không phải bill/mẻ đã gây ra nó. */
    IngredientShortfallRecorded: {
      command: 'RaiseAlert',
      toInput: function (evt) {
        if (!evt.unitId) return null;
        return {
          type: 'UNIT_NEEDS_REVIEW',
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          subjectKey: evt.unitId,
          data: {
            unitId: evt.unitId,
            reasons: ['NEGATIVE_REMAINDER'],
            itemId: evt.itemId,
            shortfallQty: evt.shortfallQty,
            billId: evt.billId || null,
            prepBatchId: evt.prepBatchId || null
          }
        };
      }
    },
    /* Raw Material — phần hao hụt không truy được lô (commands/inventory.js
       RecordWaste; §2.3a: KHÔNG chặn ghi, chỉ cảnh báo — cùng quyết định chủ
       quán 2026-09 với shortfall bán hàng/BTP). UNTRACKED_CONSUMPTION đã có
       sẵn trong TYPES, chưa từng được raise ở đâu trước bản sửa này.
       subjectKey theo (wasteRef, itemId) — mỗi lần ghi hao hụt là một sự cố
       riêng, không gộp cảnh báo của 2 lần ghi khác nhau vào 1 chủ thể. */
    UntrackedConsumptionRecorded: {
      command: 'RaiseAlert',
      toInput: function (evt) {
        return {
          type: 'UNTRACKED_CONSUMPTION',
          storeId: evt.storeId,
          businessDate: evt.businessDate,
          subjectKey: evt.wasteRef + ':' + evt.itemId,
          data: { itemId: evt.itemId, qty: evt.qty, wasteRef: evt.wasteRef, domain: evt.domain }
        };
      }
    }
  };

  /**
   * Dịch `plan.events` thành danh sách {command, input, sourceEvent} để chạy
   * tiếp. `toInput` có thể trả 1 object, 1 mảng object (xoè ra nhiều route —
   * dùng khi 1 sự kiện mang nhiều "chủ thể" cần alert riêng), hoặc null/mảng
   * rỗng để bỏ qua.
   */
  function routeEvents(events) {
    return (events || []).reduce(function (out, evt) {
      var route = evt && ROUTES[evt.type];
      if (!route) return out;
      var input = route.toInput(evt);
      if (input === null || input === undefined) return out;
      var inputs = Array.isArray(input) ? input : [input];
      inputs.forEach(function (i) {
        if (i === null || i === undefined) return;
        out.push({ command: route.command, input: i, sourceEvent: evt.type });
      });
      return out;
    }, []);
  }

  /**
   * RP3 (NET-REPORTING-V1.md) — bill bị huỷ (OrderVoided) làm cache báo cáo
   * ngày đó SAI, cùng gap L9 nhưng KHÔNG đi qua `ROUTES`/`routeEvents()`:
   * `invalidateScope()` sống ở `read-layer/merge-canonical.js`, và
   * `src/layer-rules.json` cấm layer `commands` import `read-layer` ("read-layer
   * KHÔNG import commands (đọc không gọi ghi)" ngược lại cũng đúng theo bảng
   * canImport — commands không có read-layer trong danh sách). `bootstrap` là
   * layer DUY NHẤT thấy được cả hai, nên hàm này chỉ dịch event → scope thuần
   * (plain object), còn việc GỌI `invalidateScope()` thật nằm ở
   * `bootstrap/runtime.js#dispatchDomainEvents`.
   *
   * Chỉ `OrderVoided` kích hoạt — đúng khớp gap legacy đã ghi ở RP3
   * ("khi 1 bill CŨ bị xoá/sửa qua QUANLY... KHÔNG có lời gọi
   * invalidateSalesCache() nào"). `ReviseState`'s `StateRevised` không kích
   * hoạt: entityType của nó có thể là BTP yield/giờ công/kiểm kê — những thứ
   * không nuôi `dailySalesCache`, kích hoạt tràn lan sẽ xoá cache không liên
   * quan (vi phạm K3 "chỉ ngày bị ảnh hưởng mới bị bỏ").
   *
   * Phạm vi luôn đúng 1 ngày (from=to=businessDate của bill bị huỷ) — không
   * suy rộng ra cả kỳ, giữ đúng tinh thần K3 mà `invalidateScope()` đã sửa so
   * với legacy (`clearSalesCache()` xoá sạch toàn bộ).
   */
  function scopesToInvalidate(events) {
    return (events || []).reduce(function (out, evt) {
      if (evt && evt.type === 'OrderVoided' && evt.storeId && evt.businessDate) {
        out.push({ storeId: evt.storeId, fromDateKey: evt.businessDate, toDateKey: evt.businessDate });
      }
      return out;
    }, []);
  }

  return { ROUTES: ROUTES, routeEvents: routeEvents, scopesToInvalidate: scopesToInvalidate };
});
