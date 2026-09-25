/**
 * Mapper: schema CŨ → canonical model.
 *
 * Contract: LEGACY-FIREBASE-PATH-MAP-V1.md §1, §4.
 *
 * Nguyên tắc: path canonical KHÔNG copy tên field cũ 1:1. Domain core quyết
 * định field (FIFO-CORE-ARCHITECTURE-V2.md §1), adapter chỉ map.
 *
 * Mapper KHÔNG đoán. Dữ liệu cũ thiếu nghĩa thì đánh dấu `AMBIGUOUS` và trả
 * kèm cờ — invariant #12 ("không đoán legacy semantics khi ambiguous"). Phần
 * lớn giá trị của adapter này nằm ở chỗ nói ra được cái gì KHÔNG biết.
 */
GIEO.define('legacy-firebase-adapter/mappers', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var AMBIGUOUS = {
    NO_COST_BASIS: 'NO_COST_BASIS',
    NO_ACTOR: 'NO_ACTOR',
    NO_RECIPE_VERSION: 'NO_RECIPE_VERSION',
    NO_SUPPLIER: 'NO_SUPPLIER',
    NEGATIVE_UNIT_BASE: 'NEGATIVE_UNIT_BASE'
  };

  /* Legacy status → canonical lifecycle (FIFO-CORE-ARCHITECTURE-V2.md §2). */
  var STATUS_MAP = {
    sealed: 'SEALED',
    open: 'OPEN',
    finished: 'PHYSICALLY_FINISHED',
    used_up: 'PHYSICALLY_FINISHED',
    lost: 'LOST',
    voided: 'VOIDED'
  };

  function flag(list, code, detail) {
    list.push({ code: code, detail: detail || null });
  }

  /**
   * Unit — phải xử lý CẢ HAI nguồn và merge đúng như `_ueRecomputeCurrentStock`.
   *
   * `stock_containers_gieogieo` (Firestore) là nguồn thật cho sealed/finished;
   * `active_units_gieogieo` (RTDB) là phản chiếu real-time của unit ĐANG MỞ.
   * Hai nguồn có thể lệch nhau — legacy có biến `_ueRtStale` cho đúng chuyện
   * này. Merge phải nói ra khi lệch, không im lặng chọn một bên.
   *
   * @param spec.container  bản ghi Firestore
   * @param spec.rtUnit     bản ghi RTDB tương ứng (nếu có)
   */
  function mapUnit(spec) {
    var c = spec.container;
    if (!c || !c.code) return R.err('VALIDATION', 'bản ghi container thiếu code');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'mapUnit cần storeId hợp lệ');

    var ambiguous = [];
    var status = STATUS_MAP[c.status] || null;
    if (!status) {
      return R.err('AMBIGUOUS_LEGACY',
        'status legacy không nhận ra: "' + c.status + '" — không đoán, phải rà thủ công',
        { code: c.code });
    }

    /* Legacy KHÔNG lưu giá vốn trên container. Đây là gốc của gap "COGS actual
       chưa từng tồn tại" — Unit migrate sang không có costBasis thật, và phải
       NÓI RA thay vì bịa một con số. */
    var costBasis = null;
    if (typeof c.unitCost === 'number') {
      costBasis = { unitCost: c.unitCost, currency: 'VND', versionId: null, source: 'LEGACY' };
    } else {
      flag(ambiguous, AMBIGUOUS.NO_COST_BASIS,
        'container legacy không lưu giá vốn — COGS actual cho Unit này không tính được');
    }

    if (!c.supplierId && !c.receiveRefId) flag(ambiguous, AMBIGUOUS.NO_SUPPLIER);

    /* Merge 2 nguồn. RTDB thắng cho số dư của unit đang mở, đúng như legacy —
       nhưng lệch thì ghi nhận. */
    var remaining = typeof c.unitBase === 'number' ? c.unitBase : null;
    var rtRemaining = spec.rtUnit && typeof spec.rtUnit.unitBase === 'number'
      ? spec.rtUnit.unitBase : null;
    var drift = null;
    if (rtRemaining !== null && remaining !== null && rtRemaining !== remaining) {
      drift = { firestore: remaining, rtdb: rtRemaining, difference: rtRemaining - remaining };
    }
    if (rtRemaining !== null && (status === 'OPEN' || status === 'CONSUMING')) {
      remaining = rtRemaining;
    }

    /* Nợ FIFO ở legacy là unitBase ÂM, không có field debt. Chuyển thành field
       tường minh (§4) và đánh dấu để rà. */
    var debt = null;
    if (remaining !== null && remaining < 0) {
      debt = {
        amount: -remaining, incurredAt: null, incurredByOperationId: null,
        absorbedByUnitId: null, absorbedAt: null
      };
      flag(ambiguous, AMBIGUOUS.NEGATIVE_UNIT_BASE,
        'legacy biểu diễn nợ bằng số âm, không biết nợ phát sinh lúc nào / bởi thao tác nào');
    }

    return R.ok({
      unit: {
        unitId: ids.deterministicId('unit', ['legacy', c.code]),
        itemId: ids.deterministicId('item', ['legacy', c.itemId || 'unknown']),
        storeId: spec.storeId,
        itemKind: spec.itemKind || 'raw',
        receiptId: c.receiveRefId || null,
        supplierId: c.supplierId || null,
        receivedAt: c.createdAt || null,
        receivedBy: c.createdBy || null,
        initialQty: typeof c.baseQty === 'number' ? c.baseQty : null,
        remainingQty: remaining,
        costBasis: costBasis,
        status: status,
        openedAt: c.openedAt || null,
        openedBy: c.openedBy || null,
        /* Legacy không lưu mốc này — nó chỉ suy diễn tạm thời mỗi lần load. */
        systemExhaustedAt: null,
        finishedAt: c.finishedAt || null,
        finishedBy: c.finishedBy || null,
        finishReason: c.finishReason || null,
        wasteQty: typeof c.wasteBase === 'number' ? c.wasteBase : 0,
        debt: debt,
        lostAt: c.lostAt || null, lostBy: c.lostBy || null, lostReportId: c.lostReportId || null,
        foundAt: null, foundBy: null,
        needsReview: ambiguous.length > 0,
        needsReviewReasons: ambiguous.map(function (a) { return a.code; }),
        physicalReconciliations: (c.notEmptyChecks || []).map(function (n) {
          return {
            operationId: null, at: n.at || null, actorId: n.by || null,
            before: null, actual: n.qty, delta: null,
            method: 'weighing', reason: null
          };
        }),
        operationId: null,
        legacySource: { code: c.code, id: c.id || null }
      },
      ambiguous: ambiguous,
      /* Lệch 2 nguồn là thông tin cho shadow-compare, không phải lỗi map. */
      sourceDrift: drift
    });
  }

  /** Ledger — gộp stock_transactions và prep_transactions, phân biệt bằng domain. */
  function mapLedgerEntry(spec) {
    var t = spec.tx;
    if (!t) return R.err('VALIDATION', 'thiếu bản ghi giao dịch');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'mapLedgerEntry cần storeId');

    var ambiguous = [];
    if (!t.staffEmployeeId && !t.actorId) flag(ambiguous, AMBIGUOUS.NO_ACTOR);

    var unitId = t.containerCode
      ? ids.deterministicId('unit', ['legacy', t.containerCode])
      : null;
    var qtyDelta = typeof t.qtyDelta === 'number' ? t.qtyDelta : (t.qty || 0);

    return R.ok({
      entry: {
        entryId: ids.deterministicId('ledger', ['legacy', t.id || String(t.txId || Math.random())]),
        operationId: t.txId || null,
        domain: spec.domain || 'raw',
        type: (t.type || 'ADJUSTMENT').toUpperCase(),
        itemId: ids.deterministicId('item', ['legacy', t.itemId || 'unknown']),
        storeId: spec.storeId,
        unitId: unitId,
        qtyDelta: qtyDelta,
        /* Quy tắc §5 áp NGAY lúc map — dữ liệu cũ vào canonical cũng phải tuân
           đúng luật, không có ngoại lệ cho dữ liệu migrate. */
        untrackedPendingDelta: unitId ? 0 : qtyDelta,
        costBasisVersionId: null,
        unitCost: typeof t.unitCost === 'number' ? t.unitCost : null,
        businessDate: t.dateKey || null,
        actorId: t.staffEmployeeId || t.actorId || null,
        occurredAt: t.createdAt || null,
        /* Bug: field thật ghi bởi applyStockTransactionPOS/applyStockTransferPOS
           (xem posgieo.html) là `referenceId`, không phải `refId` — trước bản sửa
           này referenceId LUÔN null cho mọi entry legacy, kể cả những dòng
           CONSUMPTION có gắn orderId. `refType` thì legacy chưa từng ghi field nào
           tương ứng (không có write-site nào set nó) — giữ null là đúng thực tế,
           không phải bug. */
        referenceType: t.refType || null,
        referenceId: t.referenceId || null,
        reason: t.reason || null
      },
      ambiguous: ambiguous
    });
  }

  /**
   * Recipe — legacy KHÔNG có versioning, ghi đè trực tiếp.
   *
   * §4 yêu cầu tự tạo `versionId` giả từ `updatedAt` và đánh dấu
   * `versionSource: 'legacy-inferred'` để phân biệt với version thật tạo sau
   * cutover. Nói rõ: version này KHÔNG chứng minh được công thức tại thời điểm
   * bill cũ là gì — chỉ là ảnh chụp lúc migrate.
   */
  function mapRecipe(spec) {
    var r = spec.recipe;
    if (!r) return R.err('VALIDATION', 'thiếu bản ghi recipe');
    if (!spec.menuRefKey) return R.err('VALIDATION', 'mapRecipe cần menuRefKey');

    var ambiguous = [{
      code: AMBIGUOUS.NO_RECIPE_VERSION,
      detail: 'legacy ghi đè recipe trực tiếp — version này chỉ là ảnh chụp lúc migrate, ' +
        'KHÔNG chứng minh được công thức tại thời điểm các bill cũ'
    }];

    var rows = [];
    Object.keys(r).forEach(function (size) {
      if (!r[size] || typeof r[size] !== 'object') return;
      rows.push({
        size: size,
        components: Object.keys(r[size]).map(function (refId) {
          return { refType: 'item', refId: refId, qty: r[size][refId] };
        })
      });
    });

    return R.ok({
      recipeId: ids.deterministicId('recipe', ['legacy', spec.menuRefKey]),
      versionId: ids.deterministicId('version', ['legacy', spec.menuRefKey, String(r.updatedAt || 0)]),
      versionSource: 'legacy-inferred',
      effectiveFrom: r.updatedAt || null,
      components: rows.reduce(function (acc, x) { acc[x.size] = x.components; return acc; }, {}),
      ambiguous: ambiguous
    });
  }

  /** Bill — giữ nguyên chi tiết, KHÔNG aggregate. */
  function mapBill(spec) {
    var o = spec.order;
    if (!o) return R.err('VALIDATION', 'thiếu bản ghi order');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'mapBill cần storeId');

    var ambiguous = [];
    /* Ngoại lệ duy nhất của toàn hệ thống cũ: Bill không lưu ai bán (§4.7). */
    if (!o.soldBy && !o.staffEmployeeId) {
      flag(ambiguous, AMBIGUOUS.NO_ACTOR,
        'bill legacy không lưu người bán — chỉ có gate "có ai đó đang check-in"');
    }

    var lines = (o.itemsArray || []).map(function (l, i) {
      return {
        billLineId: ids.deterministicId('billLine', ['legacy', spec.billId, String(i)]),
        menuItemId: ids.deterministicId('item', ['legacy', l.id || l.name || 'unknown']),
        name: l.name || null,
        size: l.size || null,
        qty: l.qty || 1,
        /* Giá đã snapshot sẵn trong bill — phần legacy làm ĐÚNG, giữ nguyên. */
        price: typeof l.price === 'number' ? l.price : null,
        isFree: !!l.isFree
      };
    });

    var channelType = o.isAppSale ? 'APP' : (o.isToGo ? 'TO_GO' : 'DINE_IN');
    var total = typeof o.total === 'number' ? o.total : null;
    var feePct = channelType === 'APP' && typeof o.appFeePct === 'number' ? o.appFeePct : 0;
    var channelFee = total === null ? null : total * feePct / 100;

    return R.ok({
      bill: {
        billId: ids.deterministicId('bill', ['legacy', spec.billId]),
        storeId: spec.storeId,
        businessDate: spec.businessDate || null,
        occurredAt: o.createdAt || null,
        soldByActorId: o.soldBy || o.staffEmployeeId || null,
        /* Bug: field thật trên order legacy là `phone`, không phải `customerPhone`
           (xem posgieo.html — nơi order được ghi). Trước bản sửa này customerId
           LUÔN null cho mọi bill legacy. */
        customerId: o.phone
          ? ids.deterministicId('customer', [o.phone]) : null,
        channel: {
          type: channelType,
          appName: o.appName || null,
          /* appFeePct ĐÃ có trong legacy nhưng chưa bao giờ được đọc — map sang
             để đường ống P&L theo kênh dùng được ngay. */
          feePct: feePct
        },
        lines: lines,
        subtotal: typeof o.subtotal === 'number' ? o.subtotal : null,
        discountTotal: typeof o.discount === 'number' ? o.discount : 0,
        total: total,
        channelFee: channelFee,
        netRevenue: total === null ? null : total - channelFee,
        /* Không tự tính netRevenue nếu thiếu total — thà để null còn hơn số sai. */
        status: 'COMPLETED',
        /* billId là field canonical bắt buộc; phần còn lại là dữ liệu chỉ legacy mới
           có (không thuộc hợp đồng Bill xuyên nguồn) — gom ở đây để màn LỊCH SỬ BILL
           dựng lại đúng giao diện hoá đơn cũ (qlBillDetailHTML) mà không phải thêm
           field lạ vào top-level Bill. */
        legacySource: {
          billId: spec.billId,
          billCode: o.billCode || null,
          customerName: o.customerName || null,
          phone: o.phone || null,
          method: o.method || null,
          cashGiven: typeof o.cashGiven === 'number' ? o.cashGiven : null,
          cashChange: typeof o.cashChange === 'number' ? o.cashChange : null,
          bankOrderId: o.bankOrderId || null,
          voucherUsed: o.voucherUsed || null,
          isShip: !!o.isShip,
          splitGroups: o.splitGroups || null,
          addons: o.addons || null,
          time: o.time || null,
          date: o.date || null
        }
      },
      ambiguous: ambiguous
    });
  }

  /** Menu legacy → Catalog canonical. Category/recipe link được đánh dấu là suy ra. */
  function mapMenu(spec) {
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'mapMenu cần storeId');
    var raw = spec.items || {};
    var categories = [];
    var categoryByName = Object.create(null);
    var menuItems = [];
    var ambiguous = [];

    Object.keys(raw).forEach(function (key, index) {
      var item = raw[key] || {};
      if (!item.name) return;
      var categoryName = item.type || 'Khác';
      if (!categoryByName[categoryName]) {
        categoryByName[categoryName] = ids.deterministicId('item', ['legacy-category', categoryName]);
        categories.push({
          categoryId: categoryByName[categoryName], storeId: spec.storeId,
          name: categoryName, displayOrder: categories.length, archived: false,
          versionSource: 'legacy-inferred'
        });
      }
      var prices = {};
      if (typeof item.priceM === 'number') prices.M = item.priceM;
      if (typeof item.priceL === 'number') prices.L = item.priceL;
      if (!Object.keys(prices).length && typeof item.price === 'number') prices.M = item.price;
      var menuItemId = ids.deterministicId('item', ['legacy-menu', key]);
      menuItems.push({
        menuItemId: menuItemId, storeId: spec.storeId, name: item.name,
        categoryId: categoryByName[categoryName], prices: prices,
        recipeId: ids.deterministicId('recipe', ['legacy', (spec.recipePrefix || 'togo:') + key]),
        toppingIds: [], displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : index,
        color: item.color || null, archived: false, archivedAt: null,
        legacySource: { key: key, channel: spec.channel || 'TO_GO' }
      });
      ambiguous.push({
        code: AMBIGUOUS.NO_RECIPE_VERSION,
        detail: 'recipeId của món ' + key + ' được suy từ key legacy, chưa chứng minh recipe version lịch sử'
      });
    });
    return R.ok({ categories: categories, menuItems: menuItems, ambiguous: ambiguous });
  }

  return {
    AMBIGUOUS: AMBIGUOUS,
    STATUS_MAP: STATUS_MAP,
    mapUnit: mapUnit,
    mapLedgerEntry: mapLedgerEntry,
    mapRecipe: mapRecipe,
    mapBill: mapBill,
    mapMenu: mapMenu
  };
});
