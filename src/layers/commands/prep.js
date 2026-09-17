/**
 * Lệnh BTP — nấu mẻ, sửa yield, đối chiếu cuối ca.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-BTP-V1.md.
 *
 * Mẻ BTP nấu xong tạo ra một `StockUnit` do FIFO sở hữu với `itemKind='prep'`,
 * nên BTP đi qua ĐÚNG một engine với nguyên liệu thô — không có đường kho song
 * song. Đây là điều kiện để actual-vs-theoretical áp được cho cả hai.
 *
 * Waste BTP dùng chung `commands/inventory.RecordWaste` (domain 'prep'), nên
 * `ingredientBreakdown` luôn có bất kể trigger từ đâu — đóng đứt chuỗi #2 của
 * chain-trace, nơi legacy có 2 code path ghi cùng `type:WASTE` với field khác
 * nhau và đường phổ biến nhất (hết hạn cuối ca) thì thiếu breakdown.
 *
 * Hết nguyên liệu thô KHÔNG chặn nấu mẻ (quyết định chủ quán 2026-09, cùng
 * quyết định với RecordSale — SOP cho phép thay nguyên liệu khi hết). Trước
 * đây trả `PRECONDITION` ngay khi `alloc.shortfalls.length`, không có cờ
 * thoát — CHẶT HƠN cả RecordSale/RecordWaste cùng thời điểm đó. Đã sửa: mỗi
 * shortfall đi qua `allocation.handleShortfall` (§3.3), Unit gánh nợ gắn
 * `needsReview`, phát `IngredientShortfallRecorded` để L9 tạo alert
 * `UNIT_NEEDS_REVIEW`.
 */
GIEO.define('commands/prep', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'fifo-core/unit',
  'fifo-core/allocation',
  'recipe-cost-btp/btp',
  'recipe-cost-btp/recipe'
], function (ids, R, pipeline, unitLib, allocation, btpLib, recipeLib) {
  'use strict';

  /**
   * RecordPrepProduction — nấu xong một mẻ.
   *
   * Trừ nguyên liệu thô qua FIFO (nên có giá vốn thật), rồi tạo một Unit BTP
   * mang giá vốn = tổng nguyên liệu / yield thật của chính mẻ đó.
   */
  var RecordPrepProduction = pipeline.defineCommand({
    name: 'RecordPrepProduction',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['prep', input.batchRef]);
    },

    validate: function (input) {
      if (!input || !input.batchRef) {
        return R.err('VALIDATION', 'RecordPrepProduction cần batchRef để id xác định (bug #22)');
      }
      if (!ids.isId(input.prepItemId, 'prepItem')) return R.err('VALIDATION', 'cần prepItemId hợp lệ');
      if (!ids.isId(input.prepStockItemId, 'item')) {
        return R.err('VALIDATION', 'cần prepStockItemId — BTP là một mặt hàng kho như mọi mặt hàng khác');
      }
      if (typeof input.actualYield !== 'number' || !(input.actualYield > 0)) {
        return R.err('VALIDATION', 'actualYield phải dương');
      }
      if (!input.deps || !input.deps.versionRegistry) {
        return R.err('VALIDATION', 'RecordPrepProduction cần versionRegistry');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['prep', input.batchRef]);
      var reg = input.deps.versionRegistry;

      /* Định mức mẻ resolve theo thời điểm nấu, không phải bản mới nhất. */
      var rv = recipeLib.resolveRecipeAt(reg, {
        recipeId: input.recipeId, storeId: ctx.storeId, at: input.at || ctx.clock.now()
      });
      if (R.isErr(rv)) return rv;
      var rr = recipeLib.toRequirements(rv.value, { size: input.size || 'BATCH', qty: input.batchCount || 1 });
      if (R.isErr(rr)) return rr;

      /* Trừ nguyên liệu thô qua CÙNG engine với bán hàng. */
      var ws = allocation.createWorkingSet(input.deps.units || []);
      var allocR = allocation.allocateMany(ws, rr.value.requirements, { operationId: opId });
      if (R.isErr(allocR)) return allocR;
      var alloc = allocR.value;

      /*
       * Hết nguyên liệu thật KHÔNG chặn nấu mẻ (chốt chủ quán 2026-09, cùng
       * quyết định với RecordSale — SOP cho phép thay nguyên liệu khi hết).
       * Phần thiếu thành NỢ tường minh trên Unit (§3.3 handleShortfall), gắn
       * needsReview, báo QUANLY qua alert thay vì chặn nhân viên bếp.
       */
      var prepBatchId = ids.deterministicId('prepBatch', [input.batchRef]);
      var shortfallEvents = [];
      for (var sfi = 0; sfi < alloc.shortfalls.length; sfi++) {
        var shortfall = alloc.shortfalls[sfi];
        var sfR = allocation.handleShortfall(ws, shortfall, {
          at: input.at || ctx.clock.now(),
          operationId: opId
        });
        if (R.isErr(sfR)) return sfR;
        if (sfR.value.debtUnit) {
          shortfallEvents.push({
            type: 'IngredientShortfallRecorded',
            unitId: sfR.value.debtUnit.unitId,
            itemId: shortfall.itemId,
            shortfallQty: shortfall.shortfallQty,
            prepBatchId: prepBatchId,
            storeId: ctx.storeId,
            businessDate: ctx.businessDate
          });
        }
      }

      /* Yield kỳ vọng để tính variance — lấy version có hiệu lực lúc nấu. */
      var expected = null;
      var yieldVersionId = null;
      var yv = btpLib.resolveYieldAt(reg, {
        prepItemId: input.prepItemId, storeId: ctx.storeId, at: input.at || ctx.clock.now()
      });
      if (R.isOk(yv)) {
        expected = yv.value.payload.yieldPerBatch * (input.batchCount || 1);
        yieldVersionId = yv.value.versionId;
      }

      var batchR = btpLib.createBatch({
        prepBatchId: prepBatchId,
        prepItemId: input.prepItemId,
        storeId: ctx.storeId,
        actualYield: input.actualYield,
        expectedYield: expected,
        yieldVersionId: yieldVersionId,
        rawCost: alloc.totalCost,
        recipeVersionId: rr.value.recipeVersionId,
        at: input.at || ctx.clock.now(),
        actorId: ctx.actor.actorId,
        businessDate: ctx.businessDate,
        expiresAt: input.expiresAt,
        operationId: opId
      });
      if (R.isErr(batchR)) return batchR;
      var batch = batchR.value;

      /* Sản phẩm của mẻ là một Unit FIFO thật, itemKind='prep'. */
      var outUnitR = unitLib.createUnit({
        unitId: ids.deterministicId('unit', ['prep', input.batchRef]),
        itemId: input.prepStockItemId,
        storeId: ctx.storeId,
        itemKind: 'prep',
        initialQty: input.actualYield,
        costBasis: {
          unitCost: batch.costPerUnit,
          versionId: yieldVersionId,
          source: 'BTP_PRODUCTION'
        },
        receiptId: batch.prepBatchId,
        receivedAt: input.at || ctx.clock.now(),
        receivedBy: ctx.actor.actorId,
        operationId: opId
      });
      if (R.isErr(outUnitR)) return outUnitR;

      /* ws.all() sau khi handleShortfall để bắt luôn Unit gánh nợ — touchedUnits
         của alloc.plans là ảnh chụp TRƯỚC handleShortfall, thiếu cờ needsReview
         và field debt vừa gắn. */
      plan.unitChanges = ws.all().filter(function (u) {
        var before = (input.deps.units || []).filter(function (o) { return o.unitId === u.unitId; })[0];
        return before && before.remainingQty !== u.remainingQty;
      }).concat([outUnitR.value]);

      alloc.plans.forEach(function (p) {
        p.allocations.forEach(function (a) {
          plan.ledgerEntries.push({
            domain: 'raw', type: 'CONSUMPTION', itemId: a.itemId, storeId: ctx.storeId,
            unitId: a.unitId, qtyDelta: -a.qty, unitCost: a.unitCost,
            costBasisVersionId: a.costBasisVersionId,
            businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
            occurredAt: input.at || ctx.clock.now(),
            referenceType: 'prepBatch', referenceId: batch.prepBatchId
          });
          /* Lineage: mẻ → nguyên liệu → Unit → UnitBase trước/sau. */
          plan.traceChanges.push({
            prepBatchId: batch.prepBatchId, unitId: a.unitId, itemId: a.itemId,
            qty: a.qty, unitBaseBefore: a.unitBaseBefore, unitBaseAfter: a.unitBaseAfter,
            recipeVersionIds: [rr.value.recipeVersionId]
          });
        });
      });

      plan.ledgerEntries.push({
        domain: 'prep', type: 'RECEIVING', itemId: input.prepStockItemId, storeId: ctx.storeId,
        unitId: outUnitR.value.unitId, qtyDelta: input.actualYield,
        unitCost: batch.costPerUnit,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: input.at || ctx.clock.now(),
        referenceType: 'prepBatch', referenceId: batch.prepBatchId
      });

      plan.domainRecords.push({ type: 'prepBatch', record: batch });

      /* Lệch yield nhiều thì báo — legacy có alert này, giữ nguyên. */
      if (batch.yieldVariancePct !== null && Math.abs(batch.yieldVariancePct) > (input.yieldAlertPct || 10)) {
        plan.events.push({
          type: 'PrepYieldMismatch',
          prepBatchId: batch.prepBatchId, prepItemId: input.prepItemId,
          expectedYield: expected, actualYield: input.actualYield,
          variancePct: batch.yieldVariancePct,
          storeId: ctx.storeId, businessDate: ctx.businessDate
        });
      }

      plan.projectionRecomputes.push({ itemId: input.prepStockItemId, storeId: ctx.storeId });
      shortfallEvents.forEach(function (evt) { plan.events.push(evt); });
      return R.ok(plan);
    }
  });

  /**
   * EditPrepYield — sửa yield mẻ đã nấu.
   *
   * Điểm khác legacy: sửa yield KHÔNG đẩy sang một trung bình động
   * (`prep_items.yieldActualAvg`) mà mọi ngày quá khứ đều đọc. Giá vốn được
   * tính lại cho CHÍNH mẻ này, nên COGS các ngày cũ không trôi.
   */
  var EditPrepYield = pipeline.defineCommand({
    name: 'EditPrepYield',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['yieldedit', input.prepBatchId, String(input.editSeq || 1)]);
    },

    validate: function (input) {
      if (!input || !input.prepBatchId) return R.err('VALIDATION', 'cần prepBatchId');
      if (!input.reason) return R.err('VALIDATION', 'sửa yield phải có lý do');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      if (!input.batch) return R.err('NOT_FOUND', 'không tìm thấy mẻ');
      var opId = ids.deterministicId('operation', ['yieldedit', input.prepBatchId, String(input.editSeq || 1)]);

      var r = btpLib.editYield(input.batch, {
        newYield: input.newYield,
        consumedQty: input.consumedQty,
        reason: input.reason,
        actorId: ctx.actor.actorId,
        at: ctx.clock.now(),
        operationId: opId
      });
      if (R.isErr(r)) return r;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'prepBatch', record: r.value });
      plan.ledgerEntries.push({
        domain: 'prep', type: 'ADJUSTMENT', itemId: input.prepStockItemId, storeId: ctx.storeId,
        unitId: input.prepUnitId || null,
        qtyDelta: r.value.actualYield - input.batch.actualYield,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: ctx.clock.now(),
        referenceType: 'prepBatch', referenceId: input.prepBatchId, reason: input.reason
      });
      plan.projectionRecomputes.push({ itemId: input.prepStockItemId, storeId: ctx.storeId });
      return R.ok(plan);
    }
  });

  return {
    RecordPrepProduction: RecordPrepProduction,
    EditPrepYield: EditPrepYield
  };
});
