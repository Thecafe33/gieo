/**
 * Traceability graph — trace 2 chiều.
 *
 * Contract: GIEO-SYSTEM-REBUILD-PLAN.md §8 (Phase 4),
 * GIEO-NEW-CHAT-HANDOFF-FLAN-1.md §1.1 (bộ câu hỏi 1 Unit phải trả lời được).
 *
 * Forward:  supplier → receipt → unit → open → allocation → bill/BTP/waste/lost
 * Reverse:  bill/COGS/waste/lost/BTP → xuống tận Unit
 *
 * Đây là thứ biện minh cho câu "FIFO là traceability backbone, không phải một
 * feature của kho": nếu không trả lời được trọn bộ câu hỏi dưới đây thì Unit
 * chỉ là một con số tồn kho, không phải xương sống truy vết.
 */
GIEO.define('traceability/trace', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'fifo-core/unit'
], function (ids, R, unitLib) {
  /* eslint-disable no-unused-vars */
  'use strict';

  /**
   * Bộ câu hỏi bắt buộc. Khai thành dữ liệu để kiểm được là trace có trả lời
   * đủ hay không, thay vì tin là đủ.
   */
  var REQUIRED_ANSWERS = [
    'nhận từ đâu', 'supplier/receipt nào', 'số lượng ban đầu', 'cost basis nào',
    'mở lúc nào', 'ai mở', 'đã phân bổ cho những gì', 'dùng cho bill nào',
    'dùng cho BTP batch nào', 'recipe version nào', 'hệ thống báo hết lúc nào',
    'nhân viên báo hết lúc nào', 'waste/lost/adjustment/reversal nào liên quan'
  ];

  /** Forward trace cho 1 Unit. */
  function buildUnitTrace(spec) {
    var unit = spec.unit;
    if (!unit || !ids.isId(unit.unitId, 'unit')) {
      return R.err('VALIDATION', 'buildUnitTrace cần unit hợp lệ');
    }

    var entries = (spec.ledgerEntries || []).filter(function (e) { return e.unitId === unit.unitId; });
    var allocations = (spec.allocations || []).filter(function (a) { return a.unitId === unit.unitId; });

    var billIds = [];
    var prepBatchIds = [];
    var recipeVersionIds = [];
    allocations.forEach(function (a) {
      if (a.billId && billIds.indexOf(a.billId) === -1) billIds.push(a.billId);
      if (a.prepBatchId && prepBatchIds.indexOf(a.prepBatchId) === -1) prepBatchIds.push(a.prepBatchId);
      (a.recipeVersionIds || []).forEach(function (v) {
        if (recipeVersionIds.indexOf(v) === -1) recipeVersionIds.push(v);
      });
    });

    function byType(t) { return entries.filter(function (e) { return e.type === t; }); }

    return R.ok({
      unitId: unit.unitId,
      itemId: unit.itemId,
      storeId: unit.storeId,
      itemKind: unit.itemKind,

      origin: {
        receiptId: unit.receiptId,
        supplierId: unit.supplierId,
        receivedAt: unit.receivedAt,
        receivedBy: unit.receivedBy
      },
      initialQty: unit.initialQty,
      remainingQty: unit.remainingQty,
      costBasis: unit.costBasis,

      opened: { at: unit.openedAt, by: unit.openedBy },

      /* Từng lần bị trừ, đủ chi tiết để cộng lại ra số dư hiện tại. */
      allocations: allocations.map(function (a) {
        return {
          operationId: a.operationId, qty: a.qty,
          unitBaseBefore: a.unitBaseBefore, unitBaseAfter: a.unitBaseAfter,
          unitCost: a.unitCost, cost: a.cost,
          billId: a.billId || null, prepBatchId: a.prepBatchId || null
        };
      }),
      billIds: billIds,
      prepBatchIds: prepBatchIds,
      recipeVersionIds: recipeVersionIds,

      /* Hai mốc ĐỘC LẬP, không suy ra nhau (FIFO-CORE §2). Legacy chỉ suy diễn
         tạm thời mốc thứ nhất nên không trả lời được nó trong lịch sử. */
      systemExhaustedAt: unit.systemExhaustedAt,
      physicallyFinished: {
        at: unit.finishedAt, by: unit.finishedBy,
        reason: unit.finishReason, wasteQty: unit.wasteQty
      },

      debt: unit.debt,
      lost: unit.lostAt ? { at: unit.lostAt, by: unit.lostBy, reportId: unit.lostReportId } : null,
      found: unit.foundAt ? { at: unit.foundAt, by: unit.foundBy } : null,

      waste: byType('WASTE'),
      adjustments: byType('ADJUSTMENT'),
      reversals: byType('REVERSAL'),
      physicalReconciliations: unit.physicalReconciliations,

      needsReview: unit.needsReview,
      needsReviewReasons: unit.needsReviewReasons,
      currentState: unitLib.effectiveState(unit),

      /**
       * RANH GIỚI TRUY VẾT — phần quan trọng nhất của trace một lô tiếp nhận.
       *
       * Lô seed từ hệ cũ chỉ truy được TỪ mốc tiếp nhận trở đi. Nếu không nói ra,
       * màn truy vết sẽ hiện một lịch sử cụt trông y hệt một lịch sử đầy đủ, và
       * người đọc sẽ kết luận sai từ một khoảng trống mà họ không biết là trống.
       *
       * Đây KHÔNG phải dữ liệu bị mất do lỗi: đó là quyết định đã chốt — lấy
       * FIFO làm gốc cho tương lai, không bám vào quá khứ.
       */
      traceability: unit.origin === unitLib.ORIGIN.LEGACY_SEED
        ? {
            origin: unit.origin,
            completeFrom: unit.seededAt,
            legacyRef: unit.legacyRef,
            complete: false,
            note: 'Lô tiếp nhận từ hệ cũ tại ' + unit.seededAt +
              '. Truy vết đầy đủ từ mốc này trở đi; lịch sử trước đó thuộc hệ cũ và ' +
              'không được truy xuất — đây là ranh giới đã chốt, không phải dữ liệu thiếu.'
          }
        : { origin: unit.origin, completeFrom: unit.receivedAt, legacyRef: null, complete: true, note: null }
    });
  }

  /**
   * Kiểm trace có trả lời đủ bộ câu hỏi không.
   * Trả danh sách câu CHƯA trả lời được, thay vì true/false — để nói được
   * thiếu cái gì.
   */
  function unanswered(trace) {
    var missing = [];

    /* Lô seed: những câu hỏi về xuất xứ nằm NGOÀI ranh giới, nên không tính là
       "chưa trả lời được". Tính chúng vào sẽ biến một quyết định đã chốt thành
       một danh sách lỗi dài vĩnh viễn, và danh sách lỗi mà không ai sửa được
       thì chỉ dạy người ta bỏ qua danh sách lỗi. */
    var seeded = trace.traceability && trace.traceability.complete === false;
    if (!seeded) {
      if (!trace.origin.receiptId && !trace.origin.supplierId) missing.push('nhận từ đâu');
      if (!trace.origin.supplierId) missing.push('supplier/receipt nào');
      if (!trace.costBasis || typeof trace.costBasis.unitCost !== 'number') missing.push('cost basis nào');
      if (!trace.opened.at) missing.push('mở lúc nào');
      if (!trace.opened.by) missing.push('ai mở');
    }

    /* Những câu này phải trả lời được với MỌI lô, kể cả lô seed — vì chúng nói
       về quãng đời SAU mốc tiếp nhận, tức phần hệ mới chịu trách nhiệm. */
    if (typeof trace.initialQty !== 'number') missing.push('số lượng ban đầu');
    if (!trace.allocations) missing.push('đã phân bổ cho những gì');
    return missing;
  }

  /** Reverse trace: từ 1 bill xuống các Unit đã gánh nó. */
  function buildBillTrace(spec) {
    var billId = spec.billId;
    if (!ids.isId(billId, 'bill')) return R.err('VALIDATION', 'buildBillTrace cần billId hợp lệ');

    var allocations = (spec.allocations || []).filter(function (a) { return a.billId === billId; });
    var byUnit = Object.create(null);
    allocations.forEach(function (a) {
      if (!byUnit[a.unitId]) byUnit[a.unitId] = { unitId: a.unitId, itemId: a.itemId, qty: 0, cost: 0, allocations: [] };
      byUnit[a.unitId].qty += a.qty;
      byUnit[a.unitId].cost += a.cost;
      byUnit[a.unitId].allocations.push(a);
    });

    return R.ok({
      billId: billId,
      units: Object.keys(byUnit).map(function (k) { return byUnit[k]; }),
      totalActualCost: allocations.reduce(function (s, a) { return s + a.cost; }, 0),
      recipeVersionIds: (spec.bill && spec.bill.recipeVersionIds) || [],
      soldByActorId: (spec.bill && spec.bill.soldByActorId) || null
    });
  }

  /**
   * TRACE_DEPENDENCY registry (FIFO-COMPACTION-CONTRACT-V1.md §6).
   * Compact/purge đọc cái này để trả lời "còn ai cần raw không" — không suy
   * đoán, không "chắc là hết".
   */
  function createDependencyRegistry() {
    var deps = [];
    return {
      register: function (d) {
        deps.push({
          sourceType: d.sourceType, sourceId: d.sourceId,
          referencedBy: d.referencedBy || [], status: 'ACTIVE'
        });
        return R.ok(true);
      },
      resolveDep: function (sourceType, sourceId) {
        var found = false;
        deps = deps.map(function (d) {
          if (d.sourceType === sourceType && d.sourceId === sourceId) {
            found = true;
            return Object.assign({}, d, { status: 'RESOLVED' });
          }
          return d;
        });
        return found ? R.ok(true) : R.err('NOT_FOUND', 'không có dependency ' + sourceType + '/' + sourceId);
      },
      activeFor: function (sourceType, sourceId) {
        return deps.filter(function (d) {
          return d.sourceType === sourceType && d.sourceId === sourceId && d.status === 'ACTIVE';
        });
      },
      /** Chỉ được purge khi KHÔNG còn entry ACTIVE nào (invariant C6). */
      canPurge: function (sourceType, sourceId) {
        var active = deps.filter(function (d) {
          return d.sourceType === sourceType && d.sourceId === sourceId && d.status === 'ACTIVE';
        });
        return active.length === 0
          ? R.ok(true)
          : R.err('PRECONDITION', 'còn ' + active.length + ' tham chiếu đang hoạt động', { active: active });
      },
      all: function () { return deps.slice(); }
    };
  }

  return {
    REQUIRED_ANSWERS: REQUIRED_ANSWERS,
    buildUnitTrace: buildUnitTrace,
    unanswered: unanswered,
    buildBillTrace: buildBillTrace,
    createDependencyRegistry: createDependencyRegistry
  };
});
