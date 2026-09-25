/**
 * Ca / Két tiền — đối soát tiền mặt và giao ca.
 *
 * Nguồn: LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md §2.2, FEATURE-TREE-V1.md §2 mục [5].
 *
 * Đây thuộc nhóm "OPERATIONAL RECORD" của FIFO-COMPACTION-CONTRACT-V1.md §0:
 * nó LÀ sự kiện đã xảy ra, được ĐỌC THẲNG chứ không tính lại — khác hẳn cache
 * (tính lại được) và snapshot P&L (đóng băng có chủ đích). Ba khái niệm này
 * legacy đã tách rất có chủ đích và thiết kế mới không gộp lại.
 *
 * QUYẾT ĐỊNH CỦA LEGACY CẦN GIỮ NGUYÊN — sai số KHÔNG cộng dồn giữa các đoạn ca.
 * Khi giao ca giữa ngày, đoạn sau bắt đầu từ số tiền ĐẾM ĐƯỢC THẬT của đoạn
 * trước, không phải từ số tiền LẼ RA PHẢI CÓ. Nhờ vậy sai số của đoạn trước
 * không trôi sang làm bẩn sai số đoạn sau, và mỗi đoạn quy trách nhiệm được cho
 * đúng người trực đoạn đó. Legacy giải thích điều này ngay trong comment; đây
 * là thiết kế đúng, không phải chỗ cần "sửa cho gọn".
 */
GIEO.define('commands/shift', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline'
], function (ids, R, pipeline) {
  'use strict';

  var STATUS = { OPEN: 'OPEN', CLOSED: 'CLOSED' };

  function segmentId(storeId, businessDate, seq) {
    return ids.deterministicId('shift', ['seg', storeId, businessDate, String(seq)]);
  }

  /**
   * Mở một đoạn ca.
   * @param spec.startCash tiền mặt đầu đoạn — với đoạn > 1 đây phải là số ĐẾM
   *        ĐƯỢC của đoạn trước (xem closeSegment.actualEndCash), không phải số
   *        kỳ vọng.
   */
  function openSegment(spec) {
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'đoạn ca cần storeId hợp lệ');
    if (!spec.businessDate) return R.err('VALIDATION', 'đoạn ca cần businessDate');
    if (typeof spec.seq !== 'number' || spec.seq < 1) return R.err('VALIDATION', 'seq phải >= 1');
    if (typeof spec.startCash !== 'number' || spec.startCash < 0) {
      return R.err('VALIDATION', 'startCash phải là số không âm');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'đoạn ca cần actorId');

    return R.ok({
      segmentId: segmentId(spec.storeId, spec.businessDate, spec.seq),
      storeId: spec.storeId,
      businessDate: spec.businessDate,
      seq: spec.seq,
      status: STATUS.OPEN,
      startCash: spec.startCash,
      openedAt: spec.at,
      openedBy: spec.actorId,
      /* Nguồn của startCash — để đọc lại biết đoạn này nối từ đâu. */
      startCashSource: spec.seq === 1 ? 'OPENING_FLOAT' : 'PREVIOUS_SEGMENT_ACTUAL',
      counts: [],
      cashSales: 0,
      cashOut: 0,
      expectedEndCash: null,
      actualEndCash: null,
      variance: null,
      closedAt: null,
      closedBy: null
    });
  }

  /** Ghi nhận tiền mặt phát sinh trong đoạn. */
  function recordCashMovement(segment, spec) {
    if (segment.status !== STATUS.OPEN) return R.err('PRECONDITION', 'đoạn ca đã đóng');
    if (typeof spec.amount !== 'number' || spec.amount <= 0) {
      return R.err('VALIDATION', 'số tiền phải dương — chiều đi vào/ra do "direction" quyết định');
    }
    if (spec.direction !== 'IN' && spec.direction !== 'OUT') {
      return R.err('VALIDATION', "direction phải là 'IN' hoặc 'OUT'");
    }
    var patch = spec.direction === 'IN'
      ? { cashSales: segment.cashSales + spec.amount }
      : { cashOut: segment.cashOut + spec.amount };
    return R.ok(Object.assign({}, segment, patch));
  }

  /**
   * Thêm 1 lần đếm. Legacy cho đếm nhiều lần trước khi chốt — giữ nguyên, và
   * giữ ĐỦ các lần đếm thay vì chỉ lần cuối, vì chênh lệch giữa các lần đếm
   * chính là thông tin cần cho người rà soát.
   */
  function addCount(segment, spec) {
    if (segment.status !== STATUS.OPEN) return R.err('PRECONDITION', 'đoạn ca đã đóng');
    if (typeof spec.countedCash !== 'number' || spec.countedCash < 0) {
      return R.err('VALIDATION', 'countedCash phải là số không âm');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'lần đếm cần actorId');

    return R.ok(Object.assign({}, segment, {
      counts: segment.counts.concat([{
        seq: segment.counts.length + 1,
        countedCash: spec.countedCash,
        at: spec.at,
        actorId: spec.actorId,
        note: spec.note || null
      }])
    }));
  }

  /**
   * Chốt đoạn ca.
   *
   *   expectedEndCash = startCash + cashSales - cashOut
   *   variance        = actualEndCash - expectedEndCash
   *
   * `actualEndCash` lấy từ lần đếm CUỐI CÙNG — không trung bình các lần đếm,
   * vì đếm lại là để sửa lần trước, không phải để lấy mẫu.
   */
  function closeSegment(segment, spec) {
    if (segment.status !== STATUS.OPEN) return R.err('PRECONDITION', 'đoạn ca đã đóng');
    if (segment.counts.length === 0) {
      return R.err('PRECONDITION', 'phải đếm tiền ít nhất 1 lần trước khi chốt đoạn ca');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'chốt đoạn ca cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'chốt đoạn ca cần operationId');

    var actual = segment.counts[segment.counts.length - 1].countedCash;
    var expected = segment.startCash + segment.cashSales - segment.cashOut;

    return R.ok(Object.assign({}, segment, {
      status: STATUS.CLOSED,
      expectedEndCash: expected,
      actualEndCash: actual,
      variance: actual - expected,
      closedAt: spec.at,
      closedBy: spec.actorId,
      operationId: spec.operationId
    }));
  }

  /**
   * Đoạn kế tiếp — ĐÂY LÀ CHỖ QUYẾT ĐỊNH THIẾT KẾ QUAN TRỌNG.
   *
   * Bắt đầu từ `actualEndCash` (đếm được thật), KHÔNG phải `expectedEndCash`.
   * Nếu bắt đầu từ số kỳ vọng thì sai số của đoạn trước sẽ xuất hiện lại trong
   * sai số đoạn sau, và người trực đoạn sau bị quy trách nhiệm cho tiền hụt mà
   * họ không gây ra.
   */
  function nextSegment(closedSegment, spec) {
    if (closedSegment.status !== STATUS.CLOSED) {
      return R.err('PRECONDITION', 'phải chốt đoạn hiện tại trước khi mở đoạn kế');
    }
    return openSegment({
      storeId: closedSegment.storeId,
      businessDate: closedSegment.businessDate,
      seq: closedSegment.seq + 1,
      startCash: closedSegment.actualEndCash,
      actorId: spec.actorId,
      at: spec.at
    });
  }

  /**
   * Tổng hợp cả ngày. Sai số ngày = TỔNG sai số từng đoạn, và luôn nói được
   * đoạn nào của ai lệch bao nhiêu.
   */
  function summarizeDay(segments) {
    var closed = segments.filter(function (s) { return s.status === STATUS.CLOSED; });
    return R.ok({
      segmentCount: segments.length,
      closedCount: closed.length,
      allClosed: closed.length === segments.length && segments.length > 0,
      totalCashSales: segments.reduce(function (s, x) { return s + x.cashSales; }, 0),
      totalCashOut: segments.reduce(function (s, x) { return s + x.cashOut; }, 0),
      totalVariance: closed.reduce(function (s, x) { return s + x.variance; }, 0),
      /* Quy trách nhiệm theo đoạn — thứ mà cộng dồn sai số sẽ làm mất. */
      varianceBySegment: closed.map(function (s) {
        return { seq: s.seq, closedBy: s.closedBy, variance: s.variance };
      })
    });
  }

  /**
   * Lý do CHẶN chốt ngày. FEATURE-TREE §2 mục [5] gọi đây là `blockingClose`.
   * Trả danh sách để `store-context/business-day.closeDay` từ chối kèm lý do
   * cụ thể, thay vì chỉ báo "không chốt được".
   */
  function closeDayBlockers(spec) {
    var blockers = [];
    var segments = spec.segments || [];

    if (segments.length === 0) blockers.push('chưa có đoạn ca nào trong ngày');
    segments.forEach(function (s) {
      if (s.status === STATUS.OPEN) blockers.push('đoạn ca #' + s.seq + ' chưa chốt');
    });
    (spec.openEmployeeShifts || []).forEach(function (sh) {
      blockers.push('ca của nhân viên ' + sh.employeeId + ' chưa check-out');
    });
    (spec.pendingChecklists || []).forEach(function (c) {
      if (c.blocking) blockers.push('checklist "' + c.name + '" chưa hoàn tất');
    });
    return blockers;
  }

  var CloseCashSegment = pipeline.defineCommand({
    name: 'CloseCashSegment',
    /* Nhân viên kết ca, nhưng Quản lý cũng chốt hộ được khi cần. */
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],
    operationId: function (input) {
      return ids.deterministicId('operation', [
        'closeseg', input.segment.storeId, input.segment.businessDate, String(input.segment.seq)
      ]);
    },
    validate: function (input) {
      if (!input || !input.segment) return R.err('VALIDATION', 'cần segment');
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var r = closeSegment(input.segment, {
        actorId: ctx.actor.actorId,
        at: ctx.clock.now(),
        operationId: ids.deterministicId('operation', [
          'closeseg', input.segment.storeId, input.segment.businessDate, String(input.segment.seq)
        ])
      });
      if (R.isErr(r)) return r;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'cashSegment', record: r.value });
      if (r.value.variance !== 0) {
        /* Lệch két là việc cần người biết, không phải con số nằm im trong sổ. */
        plan.events.push({
          type: 'CashVarianceDetected',
          segmentId: r.value.segmentId,
          storeId: r.value.storeId,
          businessDate: r.value.businessDate,
          seq: r.value.seq,
          variance: r.value.variance,
          closedBy: r.value.closedBy
        });
      }
      return R.ok(plan);
    }
  });

  return {
    STATUS: STATUS,
    segmentId: segmentId,
    openSegment: openSegment,
    recordCashMovement: recordCashMovement,
    addCount: addCount,
    closeSegment: closeSegment,
    nextSegment: nextSegment,
    summarizeDay: summarizeDay,
    closeDayBlockers: closeDayBlockers,
    CloseCashSegment: CloseCashSegment
  };
});
