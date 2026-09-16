/**
 * COGS — HAI con số tách biệt + variance.
 *
 * ĐÂY LÀ GAP NGHIÊM TRỌNG NHẤT CỦA TOÀN BỘ AUDIT.
 * Nguồn: FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md §3, FIFO-CORE-ARCHITECTURE-V2.md §10b.1.
 *
 * Sự thật về hệ thống cũ: **"COGS actual" chưa từng tồn tại.** Unit/tem không
 * lưu giá vốn (`createContainersForReceipt` không có field cost nào; allocation
 * trả về cũng không có cost). Biến `cogsActual` trong `aggregateOrders()` THỰC
 * CHẤT là recipe-theoretical (định mức × giá lịch sử) bị đặt tên sai.
 *
 * Hệ quả của việc chỉ có MỘT con số: nếu công thức khai sai, hoặc nhà cung cấp
 * tăng giá đột xuất giữa 2 lần cập nhật giá, hệ thống KHÔNG CÓ CƠ CHẾ NÀO phát
 * hiện — vì không có gì để so sánh với nó.
 *
 * Ở đây:
 *   cogsTheoretical — định mức × CostBasis lịch sử tại thời điểm bán
 *   cogsActual      — tổng THẬT từ `Unit.costBasis` của các lô đã FIFO cấp phát
 *   variance        — chênh lệch, chỉ số chính của báo cáo
 *
 * Quy tắc cứng (UNIFIED-READ-LAYER-CONTRACT-V1.md §3, invariant R8): CẤM tồn
 * tại field tên `cogsActual` mà nội dung là theoretical. Chưa đủ dữ liệu Unit
 * thì trả `null` kèm lý do, KHÔNG fallback sang theoretical rồi gọi nó là actual.
 */
GIEO.define('recipe-cost-btp/cogs', [
  'shared-kernel/result',
  'recipe-cost-btp/cost'
], function (R, costLib) {
  'use strict';

  /**
   * Vế ACTUAL — cộng chi phí thật của từng lô đã bị trừ.
   *
   * `allocations` là kết quả của fifo-core/allocation, mỗi phần tử mang `cost`
   * tính từ `Unit.costBasis.unitCost` của chính lô đó. Đây là thứ legacy không
   * có, nên vế này không thể tồn tại ở hệ thống cũ.
   */
  function computeActualCost(spec) {
    var plans = spec.allocationPlans || [];
    if (plans.length === 0) {
      return R.ok({
        total: null,
        complete: false,
        reason: 'NO_ALLOCATION',
        lines: []
      });
    }

    var lines = [];
    var total = 0;
    var incomplete = [];

    for (var i = 0; i < plans.length; i++) {
      var p = plans[i];
      if (!p.costComplete) {
        /* Thiếu hàng → phần thiếu KHÔNG có lô nào gánh → không có giá thật.
           Ghi nhận thay vì lấy giá lý thuyết bù vào. */
        incomplete.push({ itemId: p.itemId, shortfallQty: p.shortfallQty });
      }
      for (var j = 0; j < p.allocations.length; j++) {
        var a = p.allocations[j];
        total += a.cost;
        lines.push({
          unitId: a.unitId,
          itemId: a.itemId,
          qty: a.qty,
          unitCost: a.unitCost,
          amount: a.cost,
          costBasisVersionId: a.costBasisVersionId
        });
      }
    }

    if (incomplete.length) {
      return R.ok({
        /* Có số nhưng KHÔNG đủ — nói rõ, không để caller tưởng đây là tổng đầy đủ.
           Phân biệt "không cấp phát được gì" với "cấp phát được một phần": hai
           tình huống này cần xử lý khác nhau ở tầng trên (chặn bán vs rà lại). */
        total: total,
        complete: false,
        reason: lines.length === 0 ? 'NO_ALLOCATION' : 'SHORTFALL',
        incomplete: incomplete,
        lines: lines
      });
    }

    return R.ok({ total: total, complete: true, reason: null, lines: lines });
  }

  /**
   * Cả hai vế + variance.
   *
   * @param spec.requirements     yêu cầu vật chất từ recipe + packaging
   * @param spec.allocationPlans  kết quả FIFO cấp phát thật
   * @param spec.registry         VersionedInput registry
   * @param spec.storeId, spec.at thời điểm SỰ KIỆN (không phải hiện tại)
   */
  function computeCogs(spec) {
    var theo = costLib.computeTheoreticalCost(spec.registry, {
      requirements: spec.requirements || [],
      storeId: spec.storeId,
      at: spec.at
    });
    if (R.isErr(theo)) return theo;

    var actualR = computeActualCost({ allocationPlans: spec.allocationPlans });
    if (R.isErr(actualR)) return actualR;
    var actual = actualR.value;

    var cogsActual = actual.complete ? actual.total : null;

    return R.ok({
      cogsTheoretical: theo.value.total,
      /* null khi chưa đủ dữ liệu — KHÔNG BAO GIỜ rơi về theoretical (R8). */
      cogsActual: cogsActual,
      cogsActualPartial: actual.complete ? null : actual.total,
      cogsActualReason: actual.reason,
      variance: cogsActual === null ? null : cogsActual - theo.value.total,
      variancePct: (cogsActual === null || theo.value.total === 0)
        ? null
        : ((cogsActual - theo.value.total) / theo.value.total) * 100,
      basis: {
        costBasisVersionIds: theo.value.lines
          .map(function (l) { return l.costBasisVersionId; })
          .filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }),
        unitIds: actual.lines.map(function (l) { return l.unitId; })
      },
      theoreticalLines: theo.value.lines,
      actualLines: actual.lines
    });
  }

  /**
   * Diễn giải variance cho người đọc. Chênh lệch dương = tốn hơn định mức.
   *
   * Hai nguyên nhân gốc mà legacy không phân biệt được vì chỉ có 1 con số:
   *   - định mức khai sai (dùng nhiều/ít hơn công thức)
   *   - giá lô nhập lệch giá đang khai (NCC tăng giá đột xuất)
   */
  function explainVariance(cogs, tolerancePct) {
    var tol = typeof tolerancePct === 'number' ? tolerancePct : 5;
    if (cogs.cogsActual === null) {
      return {
        status: 'UNKNOWN',
        message: 'chưa đủ dữ liệu lô để tính giá vốn thật (' + cogs.cogsActualReason + ')'
      };
    }
    if (Math.abs(cogs.variancePct) <= tol) {
      return { status: 'OK', message: 'giá vốn thật khớp định mức trong ngưỡng ' + tol + '%' };
    }
    return {
      status: cogs.variance > 0 ? 'OVER' : 'UNDER',
      message: (cogs.variance > 0 ? 'tốn hơn' : 'ít hơn') + ' định mức ' +
        Math.abs(cogs.variancePct).toFixed(1) + '% — kiểm tra định mức khai sai hoặc giá nhập lệch'
    };
  }

  return {
    computeActualCost: computeActualCost,
    computeCogs: computeCogs,
    explainVariance: explainVariance
  };
});
