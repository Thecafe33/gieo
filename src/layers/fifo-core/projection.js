/**
 * currentStock — PROJECTION, không phải sự thật vật chất.
 *
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md §3.10. Invariant #3 của
 * GIEO-SYSTEM-REBUILD-PLAN.md §1.2.
 *
 * Công thức:
 *   currentStock = untrackedBase
 *                + untrackedPendingDelta
 *                + Σ sealed.initialQty
 *                + Σ open.remainingQty
 *
 * Đây là hàm THUẦN DUY NHẤT được phép trả lời "tồn kho hiện tại là bao nhiêu".
 * Không package nào được tự tính lại công thức này theo cách riêng — đó chính
 * là lỗ hổng cấu trúc #3 của legacy (2 app, 2 công thức độc lập, lệch nhau âm
 * thầm), và §10b.5 (2 nguồn currentStock lệch nhau mà không ai biết vì không
 * có phép so sánh nào nối 2 bên).
 *
 * `untrackedBase` là phần tồn không có Unit đại diện — hàng cũ từ trước khi có
 * hệ thống tem, hoặc hàng nhập không sinh đủ tem. Nó tồn tại vì thực tế quán
 * như vậy, không phải vì thiết kế cho phép lỏng lẻo.
 */
GIEO.define('fifo-core/projection', [
  'shared-kernel/result',
  'fifo-core/unit',
  'fifo-core/ledger'
], function (R, unitLib, ledgerLib) {
  'use strict';

  var S = unitLib.STATUS;

  /* Unit nào được tính vào tồn kho. LOST/VOIDED/PHYSICALLY_FINISHED thì không:
     hàng mất hoặc đã dùng hết không còn là tồn. */
  function countsTowardStock(unit) {
    return unit.status === S.SEALED || unit.status === S.OPEN || unit.status === S.CONSUMING;
  }

  /**
   * @param spec.units          Unit của đúng itemId+storeId
   * @param spec.untrackedBase  tồn không có Unit đại diện
   * @param spec.ledgerEntries  entry chưa được Unit phản ánh (để lấy pending delta)
   */
  function computeCurrentStock(spec) {
    if (!spec) return R.err('VALIDATION', 'computeCurrentStock cần spec');
    var units = spec.units || [];
    var untrackedBase = spec.untrackedBase || 0;
    if (typeof untrackedBase !== 'number' || !isFinite(untrackedBase)) {
      return R.err('VALIDATION', 'untrackedBase phải là số hữu hạn');
    }

    var pending = spec.ledgerEntries
      ? ledgerLib.sumUntrackedPendingDelta(spec.ledgerEntries)
      : (typeof spec.untrackedPendingDelta === 'number' ? spec.untrackedPendingDelta : 0);

    var sealedQty = 0;
    var openQty = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!countsTowardStock(u)) continue;
      /* SEALED tính theo initialQty (chưa mở thì chưa tiêu hao);
         OPEN/CONSUMING tính theo remainingQty. */
      if (u.status === S.SEALED) sealedQty += u.initialQty;
      else openQty += u.remainingQty;
    }

    return R.ok({
      currentStock: untrackedBase + pending + sealedQty + openQty,
      breakdown: {
        untrackedBase: untrackedBase,
        untrackedPendingDelta: pending,
        sealedQty: sealedQty,
        openQty: openQty
      }
    });
  }

  /**
   * §10b.5 — phát hiện 2 nguồn lệch nhau.
   *
   * Legacy có `thDoiChieu` (đối chiếu định kỳ) đọc thẳng countedBase, "miễn
   * nhiễm" với lỗi ở applyStockTransaction — nhưng hệ quả là 2 nguồn lệch nhau
   * mà KHÔNG AI BIẾT, vì không có phép so sánh nào nối 2 bên. Đây là phép so
   * sánh đó.
   */
  function compareWithObserved(projected, observedQty, tolerance) {
    var tol = typeof tolerance === 'number' ? tolerance : 0;
    var diff = observedQty - projected;
    return R.ok({
      projected: projected,
      observed: observedQty,
      difference: diff,
      withinTolerance: Math.abs(diff) <= tol,
      /* Không tự sửa gì — chỉ báo. Sửa là việc của PhysicalReconciliation. */
      needsInvestigation: Math.abs(diff) > tol
    });
  }

  /** Unit đang nợ — tra trực tiếp, không suy từ dấu của số lượng (§4). */
  function unitsInDebt(units) {
    return units.filter(function (u) { return u.debt && !u.debt.absorbedByUnitId; });
  }

  /** Unit hệ thống coi là đã hết nhưng chưa ai báo — nguồn của FIFO alert. */
  function unitsSystemExhausted(units) {
    return units.filter(function (u) {
      return (u.status === S.OPEN || u.status === S.CONSUMING) && u.remainingQty <= 0;
    });
  }

  return {
    countsTowardStock: countsTowardStock,
    computeCurrentStock: computeCurrentStock,
    compareWithObserved: compareWithObserved,
    unitsInDebt: unitsInDebt,
    unitsSystemExhausted: unitsSystemExhausted
  };
});
