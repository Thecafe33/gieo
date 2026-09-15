/**
 * Unit — PHYSICAL TRUTH của hệ thống.
 *
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md §1 (data model), §2 (lifecycle), §4 (debt).
 *
 * Invariant #3: `currentStock` là PROJECTION, Unit mới là sự thật vật chất.
 * Không ai được sửa Unit ngoài fifo-core.
 *
 * Bốn quyết định khác legacy, mỗi cái đóng một lớp bug cụ thể:
 *
 * 1. `costBasis` gắn thẳng trên Unit lúc nhận hàng. Legacy KHÔNG lưu giá trên
 *    container nên phải tính lại qua PRICE_HISTORY mỗi lần cần — gốc của vi phạm
 *    invariant #14 lan sang cả BTP lẫn recipe. Quan trọng hơn: không có giá trên
 *    Unit thì "COGS actual" KHÔNG THỂ tồn tại, và đúng là nó chưa từng tồn tại
 *    (§10b.1 — `cogsActual` của legacy thực chất là theoretical bị đặt tên sai).
 *
 * 2. `initialQty` bất biến, tách khỏi `remainingQty`. Legacy dùng baseQty/unitBase
 *    nhưng không có ràng buộc nào chặn ghi nhầm vào baseQty.
 *
 * 3. `debt` là field tường minh, không phải remainingQty âm ẩn (§4). Tra được
 *    "unit nào đang nợ" mà không phải kiểm tra dấu.
 *
 * 4. `systemExhaustedAt` được LƯU. Legacy chỉ suy diễn tạm thời mỗi lần load nên
 *    không trả lời được "hệ thống phát hiện hết lúc nào" trong lịch sử.
 */
GIEO.define('fifo-core/unit', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  /* Trạng thái được LƯU. SYSTEM_EXHAUSTED cố ý không có ở đây — nó là suy diễn,
     không phải hành động (§3.6), nên chỉ ghi systemExhaustedAt. */
  var STATUS = {
    RECEIVED: 'RECEIVED',
    SEALED: 'SEALED',
    OPEN: 'OPEN',
    CONSUMING: 'CONSUMING',
    PHYSICALLY_FINISHED: 'PHYSICALLY_FINISHED',
    COMPACTABLE: 'COMPACTABLE',
    LOST: 'LOST',
    VOIDED: 'VOIDED'
  };

  var TRANSITIONS = {
    RECEIVED: ['SEALED', 'VOIDED'],
    SEALED: ['OPEN', 'LOST', 'VOIDED'],
    OPEN: ['CONSUMING', 'PHYSICALLY_FINISHED', 'LOST', 'VOIDED'],
    CONSUMING: ['PHYSICALLY_FINISHED', 'LOST', 'VOIDED'],
    PHYSICALLY_FINISHED: ['COMPACTABLE', 'VOIDED'],
    /* LOST quay về được: RestoreFoundContainer (§8). */
    LOST: ['SEALED', 'OPEN', 'CONSUMING', 'VOIDED'],
    COMPACTABLE: [],
    VOIDED: []
  };

  var ITEM_KIND = { raw: 'raw', prep: 'prep' };

  var REVIEW = {
    FINISHED_WITH_REMAINDER: 'FINISHED_WITH_REMAINDER',
    NEGATIVE_REMAINDER: 'NEGATIVE_REMAINDER',
    RESTORED_FROM_LOST: 'RESTORED_FROM_LOST',
    PHYSICAL_RECONCILED: 'PHYSICAL_RECONCILED'
  };

  function isStatus(s) { return Object.prototype.hasOwnProperty.call(STATUS, s); }

  function canTransition(from, to) {
    return isStatus(from) && isStatus(to) && TRANSITIONS[from].indexOf(to) !== -1;
  }

  function addReview(unit, reason) {
    var reasons = unit.needsReviewReasons.slice();
    if (reasons.indexOf(reason) === -1) reasons.push(reason);
    return { needsReview: true, needsReviewReasons: reasons };
  }

  /**
   * Tạo Unit lúc nhận hàng.
   * `costBasis` BẮT BUỘC — không có đường nào tạo Unit mà thiếu giá vốn, vì
   * thiếu nó là tái lập đúng gap §10b.1.
   */
  function createUnit(spec) {
    if (!spec) return R.err('VALIDATION', 'createUnit cần spec');
    if (!ids.isId(spec.itemId, 'item')) return R.err('VALIDATION', 'createUnit cần itemId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'createUnit cần storeId hợp lệ');
    if (!ITEM_KIND[spec.itemKind]) return R.err('VALIDATION', "itemKind phải là 'raw' hoặc 'prep'");
    if (typeof spec.initialQty !== 'number' || !(spec.initialQty > 0)) {
      return R.err('VALIDATION', 'initialQty phải là số dương');
    }
    if (!spec.costBasis || typeof spec.costBasis.unitCost !== 'number') {
      return R.err('VALIDATION',
        'createUnit cần costBasis.unitCost — Unit không có giá vốn thì COGS actual không thể tồn tại (§10b.1)');
    }
    if (!spec.operationId) return R.err('VALIDATION', 'createUnit cần operationId (invariant #7)');

    return R.ok({
      unitId: spec.unitId || ids.newId('unit'),
      itemId: spec.itemId,
      storeId: spec.storeId,
      itemKind: spec.itemKind,

      receiptId: spec.receiptId || null,
      supplierId: spec.supplierId || null,
      receivedAt: spec.receivedAt || null,
      receivedBy: spec.receivedBy || null,

      /* BẤT BIẾN sau khi set. */
      initialQty: spec.initialQty,
      remainingQty: spec.initialQty,
      costBasis: {
        unitCost: spec.costBasis.unitCost,
        currency: spec.costBasis.currency || 'VND',
        /* versionId của CostBasis đã dùng — V4 của cơ chế versioning chung. */
        versionId: spec.costBasis.versionId || null,
        source: spec.costBasis.source || 'RECEIVING'
      },

      status: spec.status === STATUS.RECEIVED ? STATUS.RECEIVED : STATUS.SEALED,
      openedAt: null,
      openedBy: null,
      systemExhaustedAt: null,
      finishedAt: null,
      finishedBy: null,
      finishReason: null,
      wasteQty: 0,

      debt: null,
      lostAt: null, lostBy: null, lostReportId: null,
      foundAt: null, foundBy: null,

      needsReview: false,
      needsReviewReasons: [],
      physicalReconciliations: [],

      operationId: spec.operationId
    });
  }

  /**
   * Mở Unit. `openedAt` là khoá sắp xếp FIFO (§3.1) — đã chốt với chủ quán giữ
   * `openedAt` chứ không đổi sang `receivedAt`, vì đó là hành vi production đã
   * chạy nhiều năm và đổi sẽ làm lệch kết quả FIFO trên dữ liệu đang tồn.
   */
  function open(unit, spec) {
    if (!canTransition(unit.status, STATUS.OPEN)) {
      return R.err('PRECONDITION', 'không mở được Unit ở trạng thái ' + unit.status);
    }
    if (typeof spec.at !== 'number') return R.err('VALIDATION', 'open cần thời điểm "at"');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'open cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'open cần operationId');

    return R.ok(Object.assign({}, unit, {
      status: STATUS.OPEN,
      openedAt: spec.at,
      openedBy: spec.actorId,
      operationId: spec.operationId
    }));
  }

  /** OPEN -> CONSUMING: đã có allocation đầu tiên. Legacy gộp 2 state này. */
  function markConsuming(unit) {
    if (unit.status === STATUS.CONSUMING) return R.ok(unit);
    if (!canTransition(unit.status, STATUS.CONSUMING)) {
      return R.err('PRECONDITION', 'không chuyển sang CONSUMING từ ' + unit.status);
    }
    return R.ok(Object.assign({}, unit, { status: STATUS.CONSUMING }));
  }

  /**
   * §3.6 — hệ thống phát hiện hết: CHỈ ghi `systemExhaustedAt`, KHÔNG đổi status.
   * Đây là suy diễn, không phải hành động của người. Ghi lại để có audit trail
   * mà vẫn giữ đúng nguyên tắc.
   */
  function markSystemExhausted(unit, at) {
    if (unit.status !== STATUS.OPEN && unit.status !== STATUS.CONSUMING) return R.ok(unit);
    if (unit.remainingQty > 0) return R.ok(unit);
    if (unit.systemExhaustedAt !== null) return R.ok(unit);
    return R.ok(Object.assign({}, unit, { systemExhaustedAt: at }));
  }

  /**
   * Nhân viên báo hết hũ (§3.5).
   *
   * Giữ nguyên 2 quyết định đúng của legacy:
   *   - `waste = max(0, remainingQty)` — còn dư thì đó là hao hụt
   *   - remainingQty < 0 là NỢ, KHÔNG phải hao hụt, nên không tạo WASTE
   *   - không đọc `systemExhaustedAt` để quyết định cho phép: nhân viên được báo
   *     hết bất kỳ lúc nào miễn status hợp lệ (§2)
   *
   * Mới: cờ `needsReview` khi báo hết lúc còn nhiều.
   * Ngưỡng do QUANLY cấu hình (xác nhận trực tiếp với chủ quán), truyền vào qua
   * `spec.finishReviewRatio`. fifo-core cố ý KHÔNG tự đọc config — nó là domain
   * thuần, không được import compaction; tầng command resolve config rồi truyền
   * xuống. Không truyền thì không gắn cờ, chứ không tự bịa ngưỡng mặc định.
   */
  function finish(unit, spec) {
    if (!canTransition(unit.status, STATUS.PHYSICALLY_FINISHED)) {
      return R.err('PRECONDITION', 'không báo hết được Unit ở trạng thái ' + unit.status);
    }
    if (typeof spec.at !== 'number') return R.err('VALIDATION', 'finish cần thời điểm "at"');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'finish cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'finish cần operationId');

    var remaining = unit.remainingQty;
    var waste = Math.max(0, remaining);
    var patch = {
      status: STATUS.PHYSICALLY_FINISHED,
      finishedAt: spec.at,
      finishedBy: spec.actorId,
      finishReason: spec.reason || null,
      wasteQty: waste,
      remainingQty: 0,
      operationId: spec.operationId
    };

    var review = null;
    if (remaining < 0) {
      /* Nợ, không phải hao hụt — vẫn cần người nhìn lại. */
      review = addReview(unit, REVIEW.NEGATIVE_REMAINDER);
    } else if (typeof spec.finishReviewRatio === 'number' && unit.initialQty > 0) {
      if (remaining / unit.initialQty > spec.finishReviewRatio) {
        review = addReview(unit, REVIEW.FINISHED_WITH_REMAINDER);
      }
    }
    if (review) Object.assign(patch, review);

    return R.ok({
      unit: Object.assign({}, unit, patch),
      wasteQty: waste,
      /* Nợ được báo riêng để tầng trên cảnh báo, KHÔNG biến thành WASTE. */
      debtQty: remaining < 0 ? -remaining : 0,
      flaggedForReview: !!review
    });
  }

  /** §4 — nợ là field tường minh, không phải số âm ẩn. */
  function recordDebt(unit, spec) {
    if (typeof spec.amount !== 'number' || !(spec.amount > 0)) {
      return R.err('VALIDATION', 'debt.amount phải dương — nợ luôn ghi bằng số dương');
    }
    return R.ok(Object.assign({}, unit, {
      debt: {
        amount: spec.amount,
        incurredAt: spec.at,
        incurredByOperationId: spec.operationId,
        absorbedByUnitId: null,
        absorbedAt: null
      }
    }));
  }

  function absorbDebt(unit, spec) {
    if (!unit.debt) return R.err('PRECONDITION', 'Unit không có nợ để hấp thụ');
    if (unit.debt.absorbedByUnitId) return R.err('PRECONDITION', 'nợ đã được hấp thụ rồi');
    if (!ids.isId(spec.byUnitId, 'unit')) return R.err('VALIDATION', 'absorbDebt cần byUnitId hợp lệ');
    return R.ok(Object.assign({}, unit, {
      debt: Object.assign({}, unit.debt, {
        absorbedByUnitId: spec.byUnitId,
        absorbedAt: spec.at
      })
    }));
  }

  function markLost(unit, spec) {
    if (!canTransition(unit.status, STATUS.LOST)) {
      return R.err('PRECONDITION', 'không đánh dấu mất được Unit ở trạng thái ' + unit.status);
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'markLost cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'markLost cần operationId');
    return R.ok(Object.assign({}, unit, {
      status: STATUS.LOST,
      lostAt: spec.at,
      lostBy: spec.actorId,
      lostReportId: spec.lostReportId || null,
      /* Nhớ trạng thái trước khi mất để khôi phục đúng chỗ. */
      statusBeforeLost: unit.status,
      operationId: spec.operationId
    }));
  }

  /**
   * §8 — khôi phục container tìm lại được.
   * Giữ nguyên quyết định nghiệp vụ của legacy: unit "mới nguyên", KHÔNG suy
   * luận lại phần đã dùng trước khi mất. Nhưng gắn cờ cần rà, vì quãng thời
   * gian nó biến mất là quãng không ai biết chuyện gì đã xảy ra.
   */
  function restoreFound(unit, spec) {
    if (unit.status !== STATUS.LOST) return R.err('PRECONDITION', 'Unit không ở trạng thái LOST');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'restoreFound cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'restoreFound cần operationId');

    var back = unit.statusBeforeLost || STATUS.SEALED;
    if (!canTransition(STATUS.LOST, back)) back = STATUS.SEALED;
    var review = addReview(unit, REVIEW.RESTORED_FROM_LOST);

    return R.ok(Object.assign({}, unit, {
      status: back,
      foundAt: spec.at,
      foundBy: spec.actorId,
      operationId: spec.operationId
    }, review));
  }

  /**
   * Trạng thái HIỂN THỊ, gộp cả phần suy diễn.
   * Dùng cho UI/alert; state máy vẫn là `unit.status`.
   */
  function effectiveState(unit) {
    if (unit.debt && !unit.debt.absorbedByUnitId) return 'DEBT';
    if ((unit.status === STATUS.OPEN || unit.status === STATUS.CONSUMING) && unit.remainingQty <= 0) {
      return 'SYSTEM_EXHAUSTED';
    }
    return unit.status;
  }

  /**
   * Điều kiện CẦN để compact (FIFO-COMPACTION-CONTRACT-V1.md §2.2).
   * Trả về danh sách lý do CHẶN thay vì true/false, để chỗ gọi nói được vì sao.
   */
  function compactBlockers(unit) {
    var blockers = [];
    if (unit.status !== STATUS.PHYSICALLY_FINISHED && unit.status !== STATUS.VOIDED) {
      blockers.push('chưa kết thúc vòng đời (đang ' + unit.status + ')');
    }
    if (unit.debt && !unit.debt.absorbedByUnitId) {
      blockers.push('còn nợ ' + unit.debt.amount + ' chưa được hấp thụ');
    }
    if (unit.needsReview) {
      blockers.push('còn cờ cần rà: ' + unit.needsReviewReasons.join(', '));
    }
    return blockers;
  }

  return {
    STATUS: STATUS,
    TRANSITIONS: TRANSITIONS,
    ITEM_KIND: ITEM_KIND,
    REVIEW: REVIEW,
    isStatus: isStatus,
    canTransition: canTransition,
    createUnit: createUnit,
    open: open,
    markConsuming: markConsuming,
    markSystemExhausted: markSystemExhausted,
    finish: finish,
    recordDebt: recordDebt,
    absorbDebt: absorbDebt,
    markLost: markLost,
    restoreFound: restoreFound,
    effectiveState: effectiveState,
    compactBlockers: compactBlockers
  };
});
