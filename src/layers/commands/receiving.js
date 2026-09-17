/**
 * Lệnh nhận hàng — cửa vào của vòng đời Unit.
 *
 * Chuỗi thật: `NET-RAW-MATERIAL-V1.md` RM1 (🔴 GAP TOÀN PHẦN — hệ mới trước
 * đây không có `commands/receiving.js`, không có `ReceiveGoods`).
 *
 * Nguồn tham chiếu DUY NHẤT: `createContainersForReceipt` (`posgieo.html:5460-5543`).
 * Hai khác biệt CÓ CHỦ ĐÍCH so với legacy, cả hai đều theo §2.3a
 * (`BAN-GIAO-V1.md`: thiếu metadata → gap-flag, KHÔNG chặn, KHÔNG mất dữ liệu):
 *
 *   1. `trackingMode !== 'unit'|'batch'` (tức 'none') — legacy trả `[]`, KHÔNG
 *      tạo container nào, nên các mặt hàng này có ZERO truy vết theo lô. Ở
 *      đây LUÔN tạo đúng 1 Unit cho cả dòng nhận — cải thiện thật (🟢), không
 *      phải parity.
 *   2. `trackingMode === 'unit'` nhưng không tìm được quy cách đóng gói
 *      (`packagingUnits`/`countUnitName`) — legacy log cảnh báo rồi trả `[]`,
 *      ÂM THẦM BỎ CẢ DÒNG NHẬN HÀNG. Ở đây gộp thành 1 Unit duy nhất cho toàn
 *      bộ `qtyBase`, đánh dấu `gap: true` trên dòng — hàng vẫn vào kho, chỉ
 *      thiếu chi tiết tách lô, không thiếu cả lô.
 *   3. Legacy CŨNG bỏ phần dư khi `qtyBase` không chia hết cho `baseQty` quy
 *      cách (`Math.floor` không có nhánh xử lý phần dư) — phần dư biến mất
 *      hoàn toàn, không tem không sổ. Ở đây phần dư thành một Unit riêng,
 *      đánh dấu gap.
 *
 * KHÔNG mang theo trần "60 container" của legacy — đó là chặn tay bảo vệ UI
 * (tránh gõ nhầm số lượng), không phải bất biến nghiệp vụ, nên không tái lập.
 *
 * Idempotency: `unitId` của `unit.createUnit()` mặc định NGẪU NHIÊN
 * (`fifo-core/unit.js`), nên một dòng tách nhiều Unit phải tự đặt id xác định
 * theo chỉ số tách — mẫu này lấy nguyên `idPrefix` của legacy (comment gốc:
 * bug "nhận hàng cộng kho 2 lần khi retry"), xác nhận lại đúng mẫu ở
 * `commands/prep.js:114` (`ids.deterministicId('unit', ['prep', batchRef])`).
 */
GIEO.define('commands/receiving', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'fifo-core/unit',
  'recipe-cost-btp/cost'
], function (ids, R, pipeline, unitLib, costLib) {
  'use strict';

  /**
   * Phân loại tường minh theo `item.trackingMode` — KHÔNG suy luận từ field
   * `unit`. Đây là fix chung cho gap AMBIGUOUS đã ghi nhận cả ở RM1 lẫn SC1
   * (`NET-STOCK-COUNT-V1.md`): legacy để `mode` quyết định có tạo container
   * hay không, rồi lại dùng `item.unit === 'cái'` làm ngoại lệ ngầm bên trong
   * nhánh 'unit' — hai lớp suy luận chồng nhau trên CÙNG một khái niệm.
   */
  function classifyTrackingMode(item) {
    var mode = (item && item.trackingMode) || 'none';
    return mode === 'unit' || mode === 'batch' ? mode : 'none';
  }

  function isDiscreteUnit(item) {
    return String((item && item.unit) || '').trim().toLowerCase() === 'cái';
  }

  /** Quy cách đóng gói đang chọn (Chai/Khay/...), hoặc null nếu chưa khai. */
  function resolvePackagingBaseQty(item) {
    var pk = ((item && item.packagingUnits) || []).filter(function (p) {
      return p.name === item.countUnitName;
    })[0];
    if (pk && typeof pk.baseQty === 'number' && pk.baseQty > 0) return pk.baseQty;
    return null;
  }

  /**
   * Chia MỘT dòng nhận hàng thành các Unit sẽ tạo. Không bao giờ trả mảng
   * rỗng khi `qtyBase > 0` — đây chính là chỗ khác legacy (xem đầu file).
   */
  function splitReceivingLine(item, qtyBase) {
    var mode = classifyTrackingMode(item);

    if (mode === 'batch') {
      return [{ qty: qtyBase, gap: false, gapReason: null }];
    }
    if (mode === 'none') {
      return [{ qty: qtyBase, gap: false, gapReason: null }];
    }

    /* mode === 'unit' */
    var baseQty = isDiscreteUnit(item) ? 1 : resolvePackagingBaseQty(item);
    if (!baseQty) {
      return [{
        qty: qtyBase, gap: true,
        gapReason: 'thiếu quy cách đóng gói (packagingUnits/countUnitName chưa khớp) — ' +
          'gộp cả dòng thành 1 lô, không tách được theo đơn vị đếm'
      }];
    }

    var count = Math.floor(qtyBase / baseQty);
    var remainder = qtyBase - count * baseQty;
    var out = [];
    for (var i = 0; i < count; i++) out.push({ qty: baseQty, gap: false, gapReason: null });
    if (remainder > 0) {
      out.push({
        qty: remainder, gap: true,
        gapReason: 'phần dư sau khi chia theo quy cách đóng gói (' + baseQty + '/đơn vị đếm) — ' +
          'legacy bỏ phần này (Math.floor không xử lý dư), ở đây vẫn vào kho'
      });
    }
    return out;
  }

  /**
   * ReceiveGoods — nhận hàng, tạo Unit sealed với costBasis thật.
   *
   * Input đi theo mẫu "denormalized": `input.lines[].item` là bản ghi mặt
   * hàng đã tra sẵn (không tự tra catalog bên trong command).
   */
  var ReceiveGoods = pipeline.defineCommand({
    name: 'ReceiveGoods',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['receive', input.receiptRef]);
    },

    validate: function (input) {
      if (!input || !input.receiptRef) {
        return R.err('VALIDATION', 'ReceiveGoods cần receiptRef (idPrefix) để id xác định — ' +
          'thiếu nó là tái lập đúng bug "nhận hàng cộng kho 2 lần khi retry"');
      }
      if (!Array.isArray(input.lines) || input.lines.length === 0) {
        return R.err('VALIDATION', 'ReceiveGoods cần ít nhất 1 dòng nhận hàng');
      }
      for (var i = 0; i < input.lines.length; i++) {
        var line = input.lines[i];
        if (!line || !ids.isId(line.itemId, 'item')) {
          return R.err('VALIDATION', 'dòng ' + i + ' cần itemId hợp lệ');
        }
        if (typeof line.qtyBase !== 'number' || !(line.qtyBase > 0)) {
          return R.err('VALIDATION', 'dòng ' + i + ' cần qtyBase dương');
        }
        if (!line.item) {
          return R.err('VALIDATION', 'dòng ' + i + ' thiếu input.lines[].item (denormalized, không tự tra catalog)');
        }
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['receive', input.receiptRef]);
      var at = input.at || ctx.clock.now();
      var registry = input.deps && input.deps.versionRegistry;

      var lineRecords = [];
      var gaps = [];

      for (var li = 0; li < input.lines.length; li++) {
        var line = input.lines[li];
        var item = line.item;

        var costR = costLib.costBasisForNewUnit(registry, {
          itemId: line.itemId, storeId: ctx.storeId, at: at, paidUnitCost: line.paidUnitCost
        });
        if (R.isErr(costR)) return costR;
        var cost = costR.value;

        var splits = splitReceivingLine(item, line.qtyBase);
        var lineUnitIds = [];

        for (var si = 0; si < splits.length; si++) {
          var s = splits[si];
          var unitR = unitLib.createUnit({
            unitId: ids.deterministicId('unit', ['receive', input.receiptRef, line.itemId, String(si)]),
            itemId: line.itemId, storeId: ctx.storeId, itemKind: 'raw',
            initialQty: s.qty,
            costBasis: { unitCost: cost.unitCost, currency: cost.currency, versionId: cost.versionId, source: cost.source },
            receiptId: input.receiptRef,
            supplierId: line.supplierId || input.supplierId || null,
            receivedAt: at, receivedBy: ctx.actor.actorId,
            operationId: opId
          });
          if (R.isErr(unitR)) return unitR;

          plan.unitChanges.push(unitR.value);
          lineUnitIds.push(unitR.value.unitId);

          plan.ledgerEntries.push({
            domain: 'raw', type: 'RECEIVING', itemId: line.itemId, storeId: ctx.storeId,
            unitId: unitR.value.unitId, qtyDelta: s.qty,
            unitCost: cost.unitCost, costBasisVersionId: cost.versionId,
            businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
            occurredAt: at,
            referenceType: 'receiving', referenceId: input.receiptRef
          });

          if (s.gap) gaps.push({ itemId: line.itemId, unitId: unitR.value.unitId, reason: s.gapReason });
        }

        lineRecords.push({
          itemId: line.itemId, qtyBase: line.qtyBase,
          trackingMode: classifyTrackingMode(item),
          unitCost: cost.unitCost, costSource: cost.source,
          unitIds: lineUnitIds,
          supplierId: line.supplierId || input.supplierId || null
        });

        plan.projectionRecomputes.push({ itemId: line.itemId, storeId: ctx.storeId });
      }

      plan.domainRecords.push({
        type: 'receivingRecord',
        record: {
          receivingRecordId: ids.deterministicId('receipt', ['receive', input.receiptRef]),
          receiptRef: input.receiptRef,
          supplierId: input.supplierId || null,
          purchaseOrderRef: input.purchaseOrderRef || null,
          lines: lineRecords,
          gap: gaps.length > 0,
          gaps: gaps,
          actorId: ctx.actor.actorId,
          businessDate: ctx.businessDate,
          receivedAt: at
        }
      });

      return R.ok(plan);
    }
  });

  return {
    classifyTrackingMode: classifyTrackingMode,
    splitReceivingLine: splitReceivingLine,
    ReceiveGoods: ReceiveGoods
  };
});
