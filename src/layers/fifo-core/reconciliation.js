/**
 * §3.7 PhysicalReconciliation, §3.8 ReverseAllocation, §3.9 RebuildUnitState.
 *
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md.
 */
GIEO.define('fifo-core/reconciliation', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'fifo-core/unit'
], function (ids, R, unitLib) {
  'use strict';

  var S = unitLib.STATUS;

  /**
   * §3.7 — nhân viên cân/đếm thực tế rồi ghi nhận số thật.
   *
   * Giữ NGUYÊN TUYỆT ĐỐI nguyên tắc `_applyFifoNotEmpty` của legacy:
   *
   *     đọc fresh state → delta = actualQty - remainingQty
   *                     → remainingQty = actualQty   (GHI ĐÈ TUYỆT ĐỐI)
   *
   * Điểm mấu chốt là GHI ĐÈ, không phải cộng/trừ delta vào số đang có trong
   * cache. Cộng delta vào số cũ là cách sinh ra lỗi cộng đúp khi có 2 lần đọc
   * xen kẽ. `delta` chỉ để ghi sổ cho biết đã lệch bao nhiêu, không dùng để tính.
   *
   * Gap legacy đang đóng: `applyStockTransaction` (QUANLY) ghi thẳng currentStock
   * bỏ qua Unit Engine, nên điều chỉnh kiểm kê bị lần tính lại kế tiếp xoá âm
   * thầm. Ở đây chỉ có một đường, và nó đi qua Unit.
   */
  function physicalReconciliation(unit, spec) {
    if (unit.status !== S.OPEN && unit.status !== S.CONSUMING) {
      return R.err('PRECONDITION', 'chỉ đối chiếu vật lý được Unit đang mở, hiện: ' + unit.status);
    }
    if (typeof spec.actualQty !== 'number' || !isFinite(spec.actualQty)) {
      return R.err('VALIDATION', 'actualQty phải là số hữu hạn');
    }
    if (spec.actualQty < 0) return R.err('VALIDATION', 'actualQty không được âm');
    if (spec.actualQty > unit.initialQty) {
      return R.err('VALIDATION',
        'actualQty (' + spec.actualQty + ') vượt dung tích ban đầu (' + unit.initialQty + ')');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'cần operationId');

    var before = unit.remainingQty;
    var delta = spec.actualQty - before;

    var record = {
      operationId: spec.operationId,
      at: spec.at,
      actorId: spec.actorId,
      before: before,
      actual: spec.actualQty,
      delta: delta,
      method: spec.method || 'weighing',
      reason: spec.reason || null
    };

    var patch = {
      /* Ghi đè tuyệt đối. */
      remainingQty: spec.actualQty,
      physicalReconciliations: unit.physicalReconciliations.concat([record]),
      operationId: spec.operationId
    };

    if (delta !== 0) {
      var reasons = unit.needsReviewReasons.slice();
      if (reasons.indexOf(unitLib.REVIEW.PHYSICAL_RECONCILED) === -1) {
        reasons.push(unitLib.REVIEW.PHYSICAL_RECONCILED);
      }
      patch.needsReview = true;
      patch.needsReviewReasons = reasons;
    }

    return R.ok({
      unit: Object.assign({}, unit, patch),
      delta: delta,
      /* Ledger ADJUSTMENT phải dùng số MỚI này, không cộng dồn số cũ. */
      resultingStock: spec.actualQty,
      record: record
    });
  }

  /**
   * §3.8 — hoàn tác phân bổ.
   *
   * ĐÂY LÀ BÙ TRỪ, KHÔNG PHẢI CHẠY LẠI FIFO.
   * Hoàn đúng những allocation gốc đã ghi, không tính lại FIFO hiện tại để đoán
   * xem hồi đó đã trừ ở đâu. Chạy lại FIFO sẽ trả hàng về sai Unit khi đã có
   * thao tác khác xen vào sau đó.
   *
   * `coverage`:
   *   'full'      — có đủ allocation gốc, hoàn chính xác về từng Unit
   *   'untracked' — không có allocation gốc (dữ liệu legacy), chỉ hoàn được vào
   *                 phần untracked. Đánh dấu rõ thay vì đoán bừa (invariant #12).
   *
   * Fix Bug #17: đây là điểm gọi DUY NHẤT cho reversal. QUANLY không còn
   * `qlReverseStockForOrder` cộng thẳng currentStock.
   */
  function reverseAllocations(workingSet, spec) {
    if (!spec || !spec.referenceId) return R.err('VALIDATION', 'reverseAllocations cần referenceId');
    if (!spec.domain) return R.err('VALIDATION', 'reverseAllocations cần domain');
    if (!spec.operationId) return R.err('VALIDATION', 'reverseAllocations cần operationId');

    var original = spec.originalAllocations;
    if (!Array.isArray(original)) {
      return R.err('VALIDATION', 'reverseAllocations cần originalAllocations (mảng) — ' +
        'hoàn tác là bù trừ theo phân bổ gốc, không phải chạy lại FIFO');
    }

    if (original.length === 0) {
      return R.ok({
        coverage: 'untracked',
        reversals: [],
        touchedUnits: [],
        /* Nói rõ là không truy được, để tầng trên chuyển sang rà tay thay vì
           lặng lẽ coi như đã hoàn xong. */
        untrackedQty: typeof spec.fallbackQty === 'number' ? spec.fallbackQty : 0,
        needsManualReview: true
      });
    }

    var reversals = [];
    var touched = [];

    for (var i = 0; i < original.length; i++) {
      var a = original[i];
      var u = workingSet.get(a.unitId);
      if (!u) {
        return R.err('NOT_FOUND', 'không tìm thấy Unit ' + a.unitId + ' để hoàn tác — ' +
          'không được hoàn sang Unit khác thay thế');
      }
      if (u.status === S.COMPACTABLE || u.status === S.VOIDED) {
        /* Fail-closed: Unit đã ở trạng thái cuối thì không sửa số lượng nữa. */
        return R.err('PRECONDITION',
          'Unit ' + a.unitId + ' đã ở trạng thái cuối (' + u.status + '), không hoàn tác được');
      }

      /* Trả lại bằng delta DƯƠNG, giữ nguyên mọi thao tác xảy ra sau đó. */
      var next = Object.assign({}, u, { remainingQty: u.remainingQty + a.qty });
      workingSet.put(next);
      touched.push(next);

      reversals.push({
        unitId: a.unitId,
        itemId: a.itemId,
        qty: a.qty,
        unitCost: a.unitCost,
        cost: -(a.qty * a.unitCost),
        costBasisVersionId: a.costBasisVersionId,
        unitBaseBefore: u.remainingQty,
        unitBaseAfter: next.remainingQty,
        reversesOperationId: a.operationId,
        operationId: spec.operationId
      });
    }

    return R.ok({
      coverage: 'full',
      reversals: reversals,
      touchedUnits: touched,
      totalCostReversed: reversals.reduce(function (s, r) { return s + r.cost; }, 0),
      needsManualReview: false
    });
  }

  /**
   * Khoá hoàn tác cố định — §3.8 giữ nguyên quy ước legacy
   * `'reversal_' + referenceId + '_' + domain + '_' + itemId`.
   * Cùng input luôn ra cùng id, nên hoàn 2 lần là no-op chứ không cộng đúp.
   */
  function reversalOperationId(referenceId, domain, itemId) {
    return ids.deterministicId('operation', ['reversal', referenceId, domain, itemId]);
  }

  /**
   * §3.9 — dựng lại trạng thái Unit từ ledger. Hoàn toàn mới, legacy không có.
   *
   * Dùng cho 3 việc:
   *   - correction sau compaction (snapshot v1 → correction → rebuild → v2)
   *   - khôi phục khi phát hiện RT lệch Firestore (legacy chỉ dò/vá từng chỗ)
   *   - làm nguồn xác thực cho snapshot verifier (FIFO-COMPACTION-CONTRACT §4)
   */
  function rebuildUnitState(unit, entries) {
    var relevant = entries
      .filter(function (e) { return e.unitId === unit.unitId; })
      .slice()
      .sort(function (a, b) {
        if (a.occurredAt !== null && b.occurredAt !== null && a.occurredAt !== b.occurredAt) {
          return a.occurredAt - b.occurredAt;
        }
        return a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0;
      });

    var qty = unit.initialQty;
    var applied = [];
    for (var i = 0; i < relevant.length; i++) {
      var e = relevant[i];
      /* RECEIVING đã nằm trong initialQty, cộng lần nữa là tính đúp. */
      if (e.type === 'RECEIVING') continue;
      qty += e.qtyDelta;
      applied.push({ entryId: e.entryId, type: e.type, qtyDelta: e.qtyDelta, resultingQty: qty });
    }

    return R.ok({
      unitId: unit.unitId,
      rebuiltRemainingQty: qty,
      storedRemainingQty: unit.remainingQty,
      matches: qty === unit.remainingQty,
      drift: unit.remainingQty - qty,
      appliedEntries: applied
    });
  }

  /**
   * So sánh trạng thái đã lưu với trạng thái dựng lại, cho nhiều Unit.
   * Đây là phép kiểm tra mà legacy không có, nên lệch RT/Firestore chỉ được
   * phát hiện khi có người tình cờ nhìn thấy.
   */
  function detectDrift(units, entries) {
    var drifted = [];
    for (var i = 0; i < units.length; i++) {
      var r = rebuildUnitState(units[i], entries);
      if (R.isErr(r)) return r;
      if (!r.value.matches) drifted.push(r.value);
    }
    return R.ok({ checked: units.length, drifted: drifted, clean: drifted.length === 0 });
  }

  return {
    physicalReconciliation: physicalReconciliation,
    reverseAllocations: reverseAllocations,
    reversalOperationId: reversalOperationId,
    rebuildUnitState: rebuildUnitState,
    detectDrift: detectDrift
  };
});
