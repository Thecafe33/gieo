/**
 * BTP (bán thành phẩm) — mẻ nấu, yield, actual vs theoretical.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-BTP-V1.md. Bốn vấn đề, đóng cả bốn:
 *
 * 1. [B3] KHÔNG CÓ actual-vs-theoretical cho BTP. Nguyên liệu thô có
 *    (`thDoiChieu`), BTP thì không — `thDoiChieu` có 0 tham chiếu tới
 *    `prep_items`/`prep_transactions`. Master Plan §1.6 coi actual-vs-theoretical
 *    là nguyên tắc TRUNG TÂM của FIFO, nên thiếu hẳn một domain là vi phạm
 *    trực tiếp North Star. Ở đây dùng CÙNG một cơ chế cho mọi itemKind.
 *
 * 2. [B2] Sửa yield làm trôi COGS/P&L lịch sử: `prepCostOn` đọc
 *    `yieldActualAvg` HIỆN TẠI cho MỌI dateKey quá khứ — code legacy tự thú
 *    nhận trong comment mà không có cảnh báo UI. Đây là instance #4 của lớp lỗi
 *    đã xác nhận 7 lần, nên yield đi qua ĐÚNG `VersionedInput` dùng chung.
 *
 * 3. [B4] Waste BTP không nhất quán field giữa 2 đường ghi — xem
 *    `commands/prep.RecordPrepWaste`.
 *
 * 4. [B5] Báo cáo ngày BTP tính đúng nhưng không bao giờ lên màn hình — xem
 *    `reporting/btp-report`.
 */
GIEO.define('recipe-cost-btp/btp', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input'
], function (ids, R, VI) {
  'use strict';

  var BATCH_STATUS = { PLANNED: 'PLANNED', STARTED: 'STARTED', PRODUCED: 'PRODUCED', CANCELLED: 'CANCELLED' };

  /**
   * Công bố yield của một loại BTP.
   *
   * Legacy ghi `prep_items.yieldActualAvg` là giá trị "hiện tại" và sửa đè mỗi
   * lần có mẻ mới hoặc sửa yield. Ở đây mỗi lần đổi là một version có hiệu lực
   * từ thời điểm cụ thể.
   */
  function publishYield(registry, spec) {
    if (!ids.isId(spec.prepItemId, 'prepItem')) return R.err('VALIDATION', 'cần prepItemId hợp lệ');
    if (typeof spec.yieldPerBatch !== 'number' || !(spec.yieldPerBatch > 0)) {
      return R.err('VALIDATION', 'yieldPerBatch phải dương');
    }
    return registry.publish({
      kind: VI.KINDS.prepYield,
      subjectId: spec.prepItemId,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: {
        yieldPerBatch: spec.yieldPerBatch,
        sampleCount: spec.sampleCount || 1,
        source: spec.source || 'ACTUAL'
      }
    });
  }

  /** Yield có hiệu lực TẠI THỜI ĐIỂM SỰ KIỆN — không phải bản mới nhất. */
  function resolveYieldAt(registry, spec) {
    return registry.resolveAt(VI.KINDS.prepYield, spec.prepItemId, spec.storeId, spec.at);
  }

  /**
   * Ghi nhận một mẻ đã nấu xong.
   *
   * `rawCost` là tổng giá vốn THẬT của nguyên liệu đã bị FIFO trừ cho mẻ này
   * (từ `fifo-core/allocation`), nên giá vốn 1 đơn vị BTP là giá thật của chính
   * mẻ đó — không phải trung bình động như `prep_items.costPerUnit` của legacy.
   */
  function createBatch(spec) {
    if (!ids.isId(spec.prepItemId, 'prepItem')) return R.err('VALIDATION', 'cần prepItemId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'cần storeId hợp lệ');
    if (typeof spec.actualYield !== 'number' || !(spec.actualYield > 0)) {
      return R.err('VALIDATION', 'actualYield phải dương');
    }
    if (typeof spec.rawCost !== 'number' || spec.rawCost < 0) {
      return R.err('VALIDATION', 'rawCost phải là số không âm — mẻ không có giá vốn thì BTP không có cost basis');
    }
    if (!spec.operationId) return R.err('VALIDATION', 'mẻ cần operationId');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'mẻ cần actorId');

    var expected = typeof spec.expectedYield === 'number' ? spec.expectedYield : null;

    return R.ok({
      prepBatchId: spec.prepBatchId || ids.newId('prepBatch'),
      prepItemId: spec.prepItemId,
      storeId: spec.storeId,
      status: BATCH_STATUS.PRODUCED,
      /* BẤT BIẾN — sửa yield tạo bản ghi mới trong yieldEdits, không đè số này. */
      initialYield: spec.actualYield,
      actualYield: spec.actualYield,
      expectedYield: expected,
      yieldVariancePct: (expected && expected > 0)
        ? ((spec.actualYield - expected) / expected) * 100
        : null,
      yieldVersionId: spec.yieldVersionId || null,
      rawCost: spec.rawCost,
      /* Giá vốn 1 đơn vị BTP của CHÍNH mẻ này. */
      costPerUnit: spec.rawCost / spec.actualYield,
      recipeVersionId: spec.recipeVersionId || null,
      producedAt: spec.at,
      producedBy: spec.actorId,
      businessDate: spec.businessDate,
      expiresAt: spec.expiresAt || null,
      operationId: spec.operationId,
      yieldEdits: []
    });
  }

  /**
   * StartPrepBatch — nguyên liệu đã bị trừ, mẻ đang nấu, CHƯA có sản phẩm.
   *
   * Đóng gap `commands/prep` §15.7/15.3: `RecordPrepProduction` một bước trừ
   * nguyên liệu VÀ tạo Unit BTP trong cùng lệnh, nên không biểu diễn được "đang
   * nấu" hay "huỷ mẻ" — muốn huỷ phải bịa một giao dịch ngược tự chế. Ở đây
   * `allocationSnapshot` được lưu NGUYÊN VẸN trên chính bản ghi mẻ, để
   * `cancelBatch` hoàn tác đúng lô đã trừ (không chạy lại FIFO đoán lại — cùng
   * nguyên tắc với `fifo-core/reconciliation.reverseAllocations`).
   */
  function startBatch(spec) {
    if (!ids.isId(spec.prepItemId, 'prepItem')) return R.err('VALIDATION', 'cần prepItemId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'cần storeId hợp lệ');
    if (typeof spec.batchRatio !== 'number' || !(spec.batchRatio > 0)) {
      return R.err('VALIDATION', 'batchRatio phải dương');
    }
    if (typeof spec.rawCost !== 'number' || spec.rawCost < 0) {
      return R.err('VALIDATION', 'rawCost phải là số không âm — mẻ không có giá vốn thì BTP không có cost basis');
    }
    if (!Array.isArray(spec.allocationSnapshot) || spec.allocationSnapshot.length === 0) {
      return R.err('VALIDATION',
        'startBatch cần allocationSnapshot — không có nó thì cancelBatch không hoàn tác được đúng lô đã trừ');
    }
    if (!spec.operationId) return R.err('VALIDATION', 'mẻ cần operationId');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'mẻ cần actorId');

    return R.ok({
      prepBatchId: spec.prepBatchId || ids.newId('prepBatch'),
      prepItemId: spec.prepItemId,
      storeId: spec.storeId,
      status: BATCH_STATUS.STARTED,
      batchRatio: spec.batchRatio,
      quoteId: spec.quoteId || null,
      recipeVersionId: spec.recipeVersionId || null,
      /* Giá vốn nguyên liệu đã bị trừ THẬT, chốt tại lúc bắt đầu nấu — không
         đổi khi hoàn thành, vì hoàn thành không đụng lại vào allocation. */
      rawCost: spec.rawCost,
      costComplete: !!spec.costComplete,
      allocationSnapshot: spec.allocationSnapshot,
      /* Evidence quét mã nguyên liệu — chỉ lưu lại, KHÔNG phải căn cứ trừ kho;
         căn cứ trừ kho luôn là allocationSnapshot ở trên (§15.3 mục 4). */
      scanEvidence: spec.scanEvidence || [],
      initialYield: null,
      actualYield: null,
      expectedYield: typeof spec.expectedYield === 'number' ? spec.expectedYield : null,
      yieldVariancePct: null,
      yieldVersionId: spec.yieldVersionId || null,
      costPerUnit: null,
      recipeId: spec.recipeId || null,
      startedAt: spec.at,
      startedBy: spec.actorId,
      producedAt: null,
      producedBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      businessDate: spec.businessDate,
      expiresAt: spec.expiresAt || null,
      operationId: spec.operationId,
      yieldEdits: []
    });
  }

  /**
   * CompletePrepBatch — mẻ đã nấu xong, chốt yield thật.
   *
   * KHÔNG đụng lại nguyên liệu: `rawCost` đã chốt từ lúc `startBatch`. Đây
   * chính là điểm khác biệt với `RecordPrepProduction` một bước — completion
   * chỉ ghi nhận SẢN PHẨM, không phải một lần trừ kho thứ hai.
   */
  function completeBatch(batch, spec) {
    if (!batch || batch.status !== BATCH_STATUS.STARTED) {
      return R.err('PRECONDITION',
        'chỉ hoàn thành được mẻ đang ở trạng thái STARTED, hiện: ' + (batch ? batch.status : 'không có mẻ'));
    }
    if (typeof spec.actualYield !== 'number' || !(spec.actualYield > 0)) {
      return R.err('VALIDATION', 'actualYield phải dương');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'hoàn thành mẻ cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'hoàn thành mẻ cần operationId');

    var expected = batch.expectedYield;
    return R.ok(Object.assign({}, batch, {
      status: BATCH_STATUS.PRODUCED,
      initialYield: spec.actualYield,
      actualYield: spec.actualYield,
      yieldVariancePct: (expected && expected > 0)
        ? ((spec.actualYield - expected) / expected) * 100
        : null,
      costPerUnit: batch.rawCost / spec.actualYield,
      producedAt: spec.at,
      producedBy: spec.actorId,
      operationId: spec.operationId
    }));
  }

  /**
   * CancelPrepBatch — huỷ mẻ đang nấu, hoàn nguyên liệu về đúng lô đã trừ.
   *
   * Chỉ đổi TRẠNG THÁI của bản ghi mẻ; việc hoàn tác Unit/ledger là việc của
   * `fifo-core/reconciliation.reverseAllocations` ở tầng command (đúng
   * `allocationSnapshot` đã lưu từ `startBatch`, không chạy lại FIFO).
   */
  function cancelBatch(batch, spec) {
    if (!batch || batch.status !== BATCH_STATUS.STARTED) {
      return R.err('PRECONDITION',
        'chỉ huỷ được mẻ đang ở trạng thái STARTED, hiện: ' + (batch ? batch.status : 'không có mẻ'));
    }
    if (!spec.reason) return R.err('VALIDATION', 'huỷ mẻ phải có lý do');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'huỷ mẻ cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'huỷ mẻ cần operationId');

    return R.ok(Object.assign({}, batch, {
      status: BATCH_STATUS.CANCELLED,
      cancelledAt: spec.at,
      cancelledBy: spec.actorId,
      cancelReason: String(spec.reason),
      operationId: spec.operationId
    }));
  }

  /**
   * Sửa yield của mẻ đã nấu.
   *
   * Giữ nguyên phần legacy làm ĐÚNG: netting đúng phần đã bán, và audit trail
   * đầy đủ trong `yieldEdits[]`. Khác legacy ở chỗ giá vốn được tính lại theo
   * mẻ này chứ không đẩy sang một trung bình động làm trôi lịch sử.
   */
  function editYield(batch, spec) {
    if (batch.status !== BATCH_STATUS.PRODUCED) {
      return R.err('PRECONDITION', 'chỉ sửa yield được mẻ đã nấu xong');
    }
    if (typeof spec.newYield !== 'number' || !(spec.newYield > 0)) {
      return R.err('VALIDATION', 'yield mới phải dương');
    }
    if (!spec.reason) return R.err('VALIDATION', 'sửa yield phải có lý do');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'sửa yield cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'sửa yield cần operationId');

    var consumed = typeof spec.consumedQty === 'number' ? spec.consumedQty : 0;
    if (spec.newYield < consumed) {
      return R.err('VALIDATION',
        'yield mới (' + spec.newYield + ') nhỏ hơn lượng đã dùng (' + consumed + ') — ' +
        'sửa như vậy làm tồn âm mà không có nguyên nhân vật lý');
    }

    return R.ok(Object.assign({}, batch, {
      actualYield: spec.newYield,
      costPerUnit: batch.rawCost / spec.newYield,
      yieldVariancePct: (batch.expectedYield && batch.expectedYield > 0)
        ? ((spec.newYield - batch.expectedYield) / batch.expectedYield) * 100
        : null,
      yieldEdits: batch.yieldEdits.concat([{
        operationId: spec.operationId,
        actorId: spec.actorId,
        at: spec.at || null,
        reason: String(spec.reason),
        before: { actualYield: batch.actualYield, costPerUnit: batch.costPerUnit },
        after: { actualYield: spec.newYield, costPerUnit: batch.rawCost / spec.newYield },
        consumedQtyAtEdit: consumed
      }])
    }));
  }

  /**
   * ACTUAL vs THEORETICAL cho BTP — mắt xích CHƯA TỪNG TỒN TẠI.
   *
   *   theoretical = Σ(mẻ đã nấu) − Σ(đã bán theo recipe) − Σ(waste đã ghi)
   *   actual      = số đếm được thật
   *   variance    = actual − theoretical
   *
   * Cùng một công thức với nguyên liệu thô. Không tách 2 đường code như legacy.
   */
  function computeTheoretical(spec) {
    var batches = spec.batches || [];
    var produced = 0;
    for (var i = 0; i < batches.length; i++) {
      if (batches[i].status !== BATCH_STATUS.PRODUCED) continue;
      if (batches[i].prepItemId !== spec.prepItemId) continue;
      produced += batches[i].actualYield;
    }

    var soldQty = spec.soldQty || 0;
    var wasteQty = spec.wasteQty || 0;

    return R.ok({
      prepItemId: spec.prepItemId,
      producedQty: produced,
      soldQty: soldQty,
      wasteQty: wasteQty,
      theoreticalRemaining: produced - soldQty - wasteQty
    });
  }

  function computeVariance(spec) {
    var t = computeTheoretical(spec);
    if (R.isErr(t)) return t;
    var theo = t.value.theoreticalRemaining;

    if (typeof spec.countedQty !== 'number') {
      /* Chưa đếm thì KHÔNG có variance — nói rõ thay vì coi lệch bằng 0. */
      return R.ok(Object.assign({}, t.value, {
        countedQty: null, variance: null, variancePct: null,
        status: 'NOT_COUNTED'
      }));
    }

    var variance = spec.countedQty - theo;
    var tol = typeof spec.tolerance === 'number' ? spec.tolerance : 0;

    return R.ok(Object.assign({}, t.value, {
      countedQty: spec.countedQty,
      variance: variance,
      variancePct: theo === 0 ? null : (variance / theo) * 100,
      status: Math.abs(variance) <= tol ? 'OK' : (variance < 0 ? 'SHORT' : 'OVER')
    }));
  }

  /**
   * Giá vốn 1 đơn vị BTP tại thời điểm sự kiện.
   *
   * Ưu tiên giá của CHÍNH mẻ đã bị trừ (`batch.costPerUnit`) — đó là giá thật.
   * Không có mẻ cụ thể thì rơi về yield version có hiệu lực tại thời điểm đó,
   * KHÔNG phải yield hiện tại. Đây là điểm sửa trực tiếp `prepCostOn` của legacy.
   */
  function prepCostAt(spec) {
    if (spec.batch) {
      return R.ok({
        costPerUnit: spec.batch.costPerUnit,
        source: 'BATCH',
        prepBatchId: spec.batch.prepBatchId,
        yieldVersionId: spec.batch.yieldVersionId
      });
    }
    var y = resolveYieldAt(spec.registry, { prepItemId: spec.prepItemId, storeId: spec.storeId, at: spec.at });
    if (R.isErr(y)) {
      return R.err('NOT_FOUND',
        'không có yield hiệu lực cho BTP tại thời điểm đó, và cũng không biết mẻ nào đã bị trừ — ' +
        'không được lấy yield hiện tại để tính lịch sử');
    }
    if (typeof spec.batchRawCost !== 'number') {
      return R.err('PRECONDITION', 'thiếu giá vốn nguyên liệu của mẻ để quy ra giá 1 đơn vị BTP');
    }
    return R.ok({
      costPerUnit: spec.batchRawCost / y.value.payload.yieldPerBatch,
      source: 'YIELD_VERSION',
      yieldVersionId: y.value.versionId
    });
  }

  return {
    BATCH_STATUS: BATCH_STATUS,
    publishYield: publishYield,
    resolveYieldAt: resolveYieldAt,
    createBatch: createBatch,
    startBatch: startBatch,
    completeBatch: completeBatch,
    cancelBatch: cancelBatch,
    editYield: editYield,
    computeTheoretical: computeTheoretical,
    computeVariance: computeVariance,
    prepCostAt: prepCostAt
  };
});
