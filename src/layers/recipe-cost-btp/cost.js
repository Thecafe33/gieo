/**
 * CostBasis — giá vốn nguyên liệu, VERSIONED theo thời điểm.
 *
 * Instance #2 của lớp lỗi versioning: legacy `invalidateSalesCache()` xoá sạch
 * cache mỗi khi đổi giá, rồi tính lại COGS lịch sử bằng giá HIỆN TẠI.
 *
 * Phần ĐÚNG duy nhất của legacy cần giữ: `price_history_gieogieo` là append-only
 * — đúng mô hình versioning. Ở đây chỉ mở rộng nó ra toàn hệ thống qua
 * `VersionedInput` dùng chung, thay vì để nó là ngoại lệ đơn độc.
 *
 * Hai vai trò KHÁC NHAU của giá vốn, cố ý không trộn:
 *   - CostBasis (ở đây)      — giá THEO MẶT HÀNG theo thời điểm. Dùng cho
 *                              COGS THEORETICAL, và làm giá ghi lên Unit lúc nhận.
 *   - Unit.costBasis (fifo-core) — giá THEO TỪNG LÔ đã nhập. Dùng cho COGS ACTUAL.
 * Legacy chỉ có cái thứ nhất, và đặt tên biến `cogsActual` cho nó — đó là gốc
 * của gap nghiêm trọng nhất toàn bộ audit.
 */
GIEO.define('recipe-cost-btp/cost', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input'
], function (ids, R, VI) {
  'use strict';

  function publishCostBasis(registry, spec) {
    if (!spec) return R.err('VALIDATION', 'publishCostBasis cần spec');
    if (!ids.isId(spec.itemId, 'item')) return R.err('VALIDATION', 'cần itemId hợp lệ');
    if (typeof spec.unitCost !== 'number' || spec.unitCost < 0) {
      return R.err('VALIDATION', 'unitCost phải là số không âm');
    }

    return registry.publish({
      kind: VI.KINDS.cost,
      subjectId: spec.itemId,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: {
        unitCost: spec.unitCost,
        currency: spec.currency || 'VND',
        source: spec.source || 'MANUAL'
      }
    });
  }

  /** CẤM dùng giá hiện tại để tính lại lịch sử (invariant #14). */
  function resolveCostAt(registry, spec) {
    return registry.resolveAt(VI.KINDS.cost, spec.itemId, spec.storeId, spec.at);
  }

  /**
   * Giá vốn để GẮN LÊN UNIT lúc nhận hàng.
   *
   * Ưu tiên giá thực trả trên phiếu nhập; chỉ rơi về CostBasis theo thời điểm
   * khi phiếu không ghi giá. Đây là lý do `cogsActual` tồn tại được: Unit mang
   * giá của chính lô đó, không phải giá trung bình theo mặt hàng.
   */
  function costBasisForNewUnit(registry, spec) {
    if (typeof spec.paidUnitCost === 'number') {
      return R.ok({
        unitCost: spec.paidUnitCost,
        currency: spec.currency || 'VND',
        versionId: null,
        source: 'RECEIVING'
      });
    }
    var r = resolveCostAt(registry, { itemId: spec.itemId, storeId: spec.storeId, at: spec.at });
    if (R.isErr(r)) {
      return R.err('PRECONDITION',
        'không có giá vốn cho nguyên liệu tại thời điểm nhận, và phiếu nhập cũng không ghi giá — ' +
        'Unit không có costBasis thì COGS actual không tính được', { itemId: spec.itemId });
    }
    return R.ok({
      unitCost: r.value.payload.unitCost,
      currency: r.value.payload.currency,
      versionId: r.value.versionId,
      source: 'COST_BASIS'
    });
  }

  /**
   * Giá vốn LÝ THUYẾT cho một tập yêu cầu vật chất, resolve theo đúng thời điểm
   * sự kiện. Đây là vế "theoretical" của cặp actual/theoretical.
   *
   * Thiếu giá cho bất kỳ thành phần nào thì TỪ CHỐI cả cụm — không im lặng coi
   * phần thiếu là 0, vì như vậy giá vốn sẽ nhỏ đi và lãi trông đẹp lên một cách
   * giả tạo.
   */
  function computeTheoreticalCost(registry, spec) {
    var reqs = spec.requirements || [];
    var lines = [];
    var total = 0;

    for (var i = 0; i < reqs.length; i++) {
      var req = reqs[i];
      var r = resolveCostAt(registry, { itemId: req.itemId, storeId: spec.storeId, at: spec.at });
      if (R.isErr(r)) {
        return R.err('NOT_FOUND',
          'thiếu giá vốn cho "' + req.itemId + '" tại thời điểm tính — ' +
          'không được coi phần thiếu bằng 0', { itemId: req.itemId });
      }
      var unitCost = r.value.payload.unitCost;
      var amount = unitCost * req.qty;
      total += amount;
      lines.push({
        itemId: req.itemId,
        qty: req.qty,
        unitCost: unitCost,
        amount: amount,
        costBasisVersionId: r.value.versionId,
        source: req.source || null
      });
    }

    return R.ok({ total: total, lines: lines });
  }

  return {
    publishCostBasis: publishCostBasis,
    resolveCostAt: resolveCostAt,
    costBasisForNewUnit: costBasisForNewUnit,
    computeTheoreticalCost: computeTheoreticalCost
  };
});
