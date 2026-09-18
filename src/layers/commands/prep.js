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
 */
GIEO.define('commands/prep', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'fifo-core/unit',
  'fifo-core/allocation',
  'fifo-core/reconciliation',
  'recipe-cost-btp/btp',
  'recipe-cost-btp/recipe'
], function (ids, R, pipeline, unitLib, allocation, reconciliation, btpLib, recipeLib) {
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

      if (alloc.shortfalls.length) {
        return R.err('PRECONDITION',
          'không đủ nguyên liệu để nấu mẻ này', { shortfalls: alloc.shortfalls });
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
        prepBatchId: ids.deterministicId('prepBatch', [input.batchRef]),
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

      plan.unitChanges = alloc.plans.reduce(function (acc, p) {
        return acc.concat(p.touchedUnits);
      }, []).concat([outUnitR.value]);

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
      return R.ok(plan);
    }
  });

  /**
   * StartPrepBatch — nấu mẻ HAI GIAI ĐOẠN, bước 1: khoá nguyên liệu.
   *
   * Đóng gap §15.7/15.3 của `POS_GieoGieo_Moi_THEO_DOI.md`: `RecordPrepProduction`
   * là một bước, nên không có cách biểu diễn an toàn "mẻ đang nấu" hay "huỷ mẻ
   * trước khi ra thành phẩm" — muốn giả lập phải tự chế giao dịch ngược, sai
   * đúng thời điểm trừ nguyên liệu. Ở đây trừ nguyên liệu và tạo Unit BTP là
   * HAI operationId khác nhau, mỗi cái idempotent riêng.
   *
   * `quoteId` bắt buộc: không nấu khi chưa có `GetPrepBatchQuote` hiệu lực —
   * POS không được tự nhân recipe (§15.3).
   */
  var StartPrepBatch = pipeline.defineCommand({
    name: 'StartPrepBatch',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['prepstart', input.batchRef]);
    },

    validate: function (input) {
      if (!input || !input.batchRef) {
        return R.err('VALIDATION', 'StartPrepBatch cần batchRef để id xác định (bug #22)');
      }
      if (!ids.isId(input.prepItemId, 'prepItem')) return R.err('VALIDATION', 'cần prepItemId hợp lệ');
      if (typeof input.batchRatio !== 'number' || !(input.batchRatio > 0)) {
        return R.err('VALIDATION', 'batchRatio phải dương');
      }
      if (!input.quoteId) {
        return R.err('VALIDATION', 'StartPrepBatch cần quoteId — không nấu khi chưa có GetPrepBatchQuote hiệu lực');
      }
      if (!input.deps || !input.deps.versionRegistry) {
        return R.err('VALIDATION', 'StartPrepBatch cần versionRegistry');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['prepstart', input.batchRef]);
      var reg = input.deps.versionRegistry;
      var at = input.at || ctx.clock.now();

      var rv = recipeLib.resolveRecipeAt(reg, { recipeId: input.recipeId, storeId: ctx.storeId, at: at });
      if (R.isErr(rv)) return rv;
      var rr = recipeLib.toRequirements(rv.value, { size: 'BATCH', qty: input.batchRatio });
      if (R.isErr(rr)) return rr;

      /* Trừ nguyên liệu thô qua CÙNG engine với bán hàng và RecordPrepProduction. */
      var ws = allocation.createWorkingSet(input.deps.units || []);
      var allocR = allocation.allocateMany(ws, rr.value.requirements, { operationId: opId });
      if (R.isErr(allocR)) return allocR;
      var alloc = allocR.value;

      if (alloc.shortfalls.length) {
        return R.err('PRECONDITION',
          'không đủ nguyên liệu để bắt đầu mẻ này', { shortfalls: alloc.shortfalls });
      }

      var expected = null;
      var yieldVersionId = null;
      var yv = btpLib.resolveYieldAt(reg, { prepItemId: input.prepItemId, storeId: ctx.storeId, at: at });
      if (R.isOk(yv)) {
        expected = yv.value.payload.yieldPerBatch * input.batchRatio;
        yieldVersionId = yv.value.versionId;
      }

      /* Snapshot NGUYÊN VẸN của phân bổ — CancelPrepBatch hoàn tác đúng theo
         đây, không chạy lại FIFO để đoán hồi đó đã trừ ở đâu. */
      var allocationSnapshot = [];
      alloc.plans.forEach(function (p) {
        p.allocations.forEach(function (a) { allocationSnapshot.push(a); });
      });

      var batchR = btpLib.startBatch({
        prepBatchId: ids.deterministicId('prepBatch', [input.batchRef]),
        prepItemId: input.prepItemId,
        storeId: ctx.storeId,
        batchRatio: input.batchRatio,
        quoteId: input.quoteId,
        recipeId: input.recipeId,
        recipeVersionId: rr.value.recipeVersionId,
        rawCost: alloc.totalCost,
        costComplete: alloc.costComplete,
        allocationSnapshot: allocationSnapshot,
        scanEvidence: input.scanEvidence || [],
        expectedYield: expected,
        yieldVersionId: yieldVersionId,
        at: at,
        actorId: ctx.actor.actorId,
        businessDate: ctx.businessDate,
        expiresAt: input.expiresAt,
        operationId: opId
      });
      if (R.isErr(batchR)) return batchR;
      var batch = batchR.value;

      plan.unitChanges = alloc.plans.reduce(function (acc, p) {
        return acc.concat(p.touchedUnits);
      }, []);

      alloc.plans.forEach(function (p) {
        p.allocations.forEach(function (a) {
          plan.ledgerEntries.push({
            domain: 'raw', type: 'CONSUMPTION', itemId: a.itemId, storeId: ctx.storeId,
            unitId: a.unitId, qtyDelta: -a.qty, unitCost: a.unitCost,
            costBasisVersionId: a.costBasisVersionId,
            businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
            occurredAt: at,
            referenceType: 'prepBatch', referenceId: batch.prepBatchId
          });
          plan.traceChanges.push({
            prepBatchId: batch.prepBatchId, unitId: a.unitId, itemId: a.itemId,
            qty: a.qty, unitBaseBefore: a.unitBaseBefore, unitBaseAfter: a.unitBaseAfter,
            recipeVersionIds: [rr.value.recipeVersionId]
          });
        });
      });

      plan.domainRecords.push({ type: 'prepBatch', record: batch });
      plan.projectionRecomputes = rr.value.requirements.map(function (r) {
        return { itemId: r.itemId, storeId: ctx.storeId };
      });
      return R.ok(plan);
    }
  });

  /**
   * CompletePrepBatch — bước 2: chốt yield thật, tạo Unit BTP.
   *
   * KHÔNG trừ lại nguyên liệu — đã trừ ở `StartPrepBatch`. `input.batch` phải
   * là bản ghi mẻ đang STARTED do tầng gọi (adapter/data-source) đọc lên; core
   * không tự tra cứu Firebase.
   */
  var CompletePrepBatch = pipeline.defineCommand({
    name: 'CompletePrepBatch',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['prepcomplete', input.prepBatchId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.prepBatchId, 'prepBatch')) return R.err('VALIDATION', 'cần prepBatchId hợp lệ');
      if (!input.batch) return R.err('NOT_FOUND', 'không tìm thấy mẻ đang nấu');
      if (typeof input.actualYield !== 'number' || !(input.actualYield > 0)) {
        return R.err('VALIDATION', 'actualYield phải dương');
      }
      if (!ids.isId(input.prepStockItemId, 'item')) {
        return R.err('VALIDATION', 'cần prepStockItemId — BTP là một mặt hàng kho như mọi mặt hàng khác');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['prepcomplete', input.prepBatchId]);
      var at = input.at || ctx.clock.now();

      var batchR = btpLib.completeBatch(input.batch, {
        actualYield: input.actualYield, at: at, actorId: ctx.actor.actorId, operationId: opId
      });
      if (R.isErr(batchR)) return batchR;
      var batch = batchR.value;

      /* Sản phẩm của mẻ là một Unit FIFO thật, itemKind='prep' — giống hệt
         đường một bước, chỉ khác rawCost đến từ batch đã chốt lúc bắt đầu. */
      var outUnitR = unitLib.createUnit({
        unitId: ids.deterministicId('unit', ['prep', input.prepBatchId]),
        itemId: input.prepStockItemId,
        storeId: ctx.storeId,
        itemKind: 'prep',
        initialQty: input.actualYield,
        costBasis: {
          unitCost: batch.costPerUnit,
          versionId: batch.yieldVersionId,
          source: 'BTP_PRODUCTION'
        },
        receiptId: batch.prepBatchId,
        receivedAt: at,
        receivedBy: ctx.actor.actorId,
        operationId: opId
      });
      if (R.isErr(outUnitR)) return outUnitR;

      plan.unitChanges = [outUnitR.value];
      plan.ledgerEntries.push({
        domain: 'prep', type: 'RECEIVING', itemId: input.prepStockItemId, storeId: ctx.storeId,
        unitId: outUnitR.value.unitId, qtyDelta: input.actualYield,
        unitCost: batch.costPerUnit,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: at,
        referenceType: 'prepBatch', referenceId: batch.prepBatchId
      });
      plan.domainRecords.push({ type: 'prepBatch', record: batch });

      if (batch.yieldVariancePct !== null && Math.abs(batch.yieldVariancePct) > (input.yieldAlertPct || 10)) {
        plan.events.push({
          type: 'PrepYieldMismatch',
          prepBatchId: batch.prepBatchId, prepItemId: batch.prepItemId,
          expectedYield: batch.expectedYield, actualYield: input.actualYield,
          variancePct: batch.yieldVariancePct,
          storeId: ctx.storeId, businessDate: ctx.businessDate
        });
      }

      plan.projectionRecomputes.push({ itemId: input.prepStockItemId, storeId: ctx.storeId });
      return R.ok(plan);
    }
  });

  /**
   * CancelPrepBatch — huỷ mẻ đang nấu, hoàn ĐÚNG lô nguyên liệu đã trừ.
   *
   * Dùng `fifo-core/reconciliation.reverseAllocations` với chính
   * `allocationSnapshot` đã ghi ở `StartPrepBatch` — bù trừ theo phân bổ gốc,
   * KHÔNG chạy lại FIFO để đoán lại đã trừ Unit nào (cùng nguyên tắc với
   * `commands/reversal.ReverseTransaction`).
   */
  var CancelPrepBatch = pipeline.defineCommand({
    name: 'CancelPrepBatch',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['prepcancel', input.prepBatchId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.prepBatchId, 'prepBatch')) return R.err('VALIDATION', 'cần prepBatchId hợp lệ');
      if (!input.batch) return R.err('NOT_FOUND', 'không tìm thấy mẻ đang nấu');
      if (!input.reason) return R.err('VALIDATION', 'huỷ mẻ phải có lý do');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['prepcancel', input.prepBatchId]);

      var batchR = btpLib.cancelBatch(input.batch, {
        reason: input.reason, at: ctx.clock.now(), actorId: ctx.actor.actorId, operationId: opId
      });
      if (R.isErr(batchR)) return batchR;
      var batch = batchR.value;

      var ws = allocation.createWorkingSet(input.units || []);
      var revR = reconciliation.reverseAllocations(ws, {
        referenceId: input.prepBatchId, domain: 'raw', operationId: opId,
        originalAllocations: input.batch.allocationSnapshot || []
      });
      if (R.isErr(revR)) return revR;
      var rev = revR.value;

      plan.unitChanges = rev.touchedUnits;
      rev.reversals.forEach(function (r) {
        plan.ledgerEntries.push({
          domain: 'raw', type: 'REVERSAL', itemId: r.itemId, storeId: ctx.storeId,
          unitId: r.unitId, qtyDelta: r.qty, unitCost: r.unitCost,
          costBasisVersionId: r.costBasisVersionId,
          businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now(),
          referenceType: 'prepBatch', referenceId: input.prepBatchId, reason: input.reason
        });
      });

      plan.domainRecords.push({ type: 'prepBatch', record: batch });
      plan.events.push({
        type: 'BatchCancelled', prepBatchId: input.prepBatchId,
        storeId: ctx.storeId, businessDate: ctx.businessDate, reason: input.reason
      });
      plan.projectionRecomputes = rev.reversals.map(function (r) {
        return { itemId: r.itemId, storeId: ctx.storeId };
      });
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
    StartPrepBatch: StartPrepBatch,
    CompletePrepBatch: CompletePrepBatch,
    CancelPrepBatch: CancelPrepBatch,
    EditPrepYield: EditPrepYield
  };
});
