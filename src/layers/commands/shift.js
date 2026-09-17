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
  'store-context/business-day',
  'commands/pipeline',
  'hr/shift'
], function (ids, R, businessDay, pipeline, employeeShift) {
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
   * Tự đóng những ca THẬT SỰ TREO (quá `DEFAULT_MAX_SHIFT_HOURS`, quên
   * check-out) TRƯỚC khi tính blockers đóng ngày.
   *
   * `hr/shift.js#autoCloseIfStale` có sẵn logic (comment gốc: "Ca tự đóng
   * phải bị gắn cờ") nhưng trước đây KHÔNG có caller nào gọi tới — nghĩa là
   * 1 ca quên check-out sẽ chặn đóng ngày VĨNH VIỄN cho tới khi Quản lý tự
   * sửa tay từng ca bằng `ReviseAttendance` (VIỆC PHẢI LÀM #3,
   * `NET-PAYROLL-V1.md`). Ca THẬT SỰ đang mở (mới check-in, chưa quá
   * ngưỡng) vẫn tiếp tục CHẶN như cũ — đúng ý nghĩa "không đóng ngày khi còn
   * người đang làm việc thật". `needsReview`/`AUTO_CLOSED` đã có sẵn cơ chế
   * đọc lại ở `ClosePayroll` (không chốt lương khi còn gap chưa xác nhận),
   * nên không cần thêm loại alert mới cho việc này.
   */
  function autoCloseStaleShifts(openShifts, nowTs, opts) {
    var stillOpen = [];
    var closedShifts = [];
    (openShifts || []).forEach(function (sh) {
      var r = employeeShift.autoCloseIfStale(sh, nowTs, opts);
      if (R.isOk(r) && r.value.status === STATUS.CLOSED) closedShifts.push(r.value);
      else stillOpen.push(sh);
    });
    return { stillOpen: stillOpen, closedShifts: closedShifts };
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

  var OpenCashSegment = pipeline.defineCommand({
    name: 'OpenCashSegment',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS', 'QUANLY'],
    operationId: function (input) {
      return ids.deterministicId('operation', [
        'openseg', input.storeId, input.businessDate, String(input.seq)
      ]);
    },
    validate: function (input) {
      if (!input) return R.err('VALIDATION', 'OpenCashSegment cần input');
      if (!ids.isId(input.storeId, 'store')) return R.err('VALIDATION', 'cần storeId hợp lệ');
      if (!input.businessDate) return R.err('VALIDATION', 'cần businessDate');
      if (typeof input.seq !== 'number' || input.seq < 1) return R.err('VALIDATION', 'seq phải >= 1');
      if (typeof input.startCash !== 'number' || input.startCash < 0) {
        return R.err('VALIDATION', 'startCash phải là số không âm');
      }
      if (input.openSegment) return R.err('CONFLICT', 'đã có cash segment đang mở');
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var opened = openSegment({
        storeId: input.storeId,
        businessDate: input.businessDate,
        seq: input.seq,
        startCash: input.startCash,
        actorId: ctx.actor.actorId,
        at: ctx.clock.now()
      });
      if (R.isErr(opened)) return opened;
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'cashSegment', record: opened.value });
      return R.ok(plan);
    }
  });

  var CheckIn = pipeline.defineCommand({
    name: 'CheckIn',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS', 'QUANLY'],
    /* Check-in là sự kiện mở ngày gần sự thật nhất; không thể đòi ngày đã mở. */
    requiresOpenDay: false,
    operationId: function (input, ctx) {
      return ids.deterministicId('operation', [
        'checkin', input.employee.employeeId, input.businessDate
      ]);
    },
    validate: function (input) {
      if (!input || !input.employee || !ids.isId(input.employee.employeeId, 'employee')) {
        return R.err('VALIDATION', 'CheckIn cần employee hợp lệ');
      }
      if (!input.versionRegistry) return R.err('VALIDATION', 'CheckIn cần versionRegistry');
      if (!input.businessDate) return R.err('VALIDATION', 'CheckIn cần businessDate từ lịch/flow mở ca');
      if (input.openShift) return R.err('CONFLICT', 'nhân viên đã check-in');
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var operationId = ids.deterministicId('operation', [
        'checkin', input.employee.employeeId, input.businessDate
      ]);
      var day = input.businessDay || ctx.businessDay || null;
      var openedDay = null;
      if (!day) {
        var opened = businessDay.openDay({
          storeId: ctx.storeId,
          dateKey: input.businessDate,
          actorId: ctx.actor.actorId,
          at: ctx.clock.now(),
          clock: ctx.clock
        });
        if (R.isErr(opened)) return opened;
        day = opened.value;
        openedDay = opened.value;
      } else {
        if (day.dateKey !== input.businessDate) {
          return R.err('CONFLICT', 'ngày đang mở khác ngày của flow check-in');
        }
        var operable = businessDay.assertOperable(day, 'CheckIn');
        if (R.isErr(operable)) return operable;
      }
      var checkedIn = employeeShift.checkIn({
        employee: input.employee,
        versionRegistry: input.versionRegistry,
        at: ctx.clock.now(),
        businessDate: day.dateKey,
        operationId: operationId
      });
      if (R.isErr(checkedIn)) return checkedIn;
      var plan = pipeline.emptyPlan();
      if (openedDay) {
        plan.domainRecords.push({ type: 'businessDay', record: openedDay });
        plan.events.push({
          type: 'BusinessDayOpened', businessDayId: openedDay.businessDayId,
          storeId: openedDay.storeId, businessDate: openedDay.dateKey,
          openedBy: openedDay.openedBy
        });
      }
      plan.domainRecords.push({ type: 'employeeShift', record: checkedIn.value });
      plan.events.push({
        type: 'EmployeeCheckedInStateChanged',
        employeeId: checkedIn.value.employeeId,
        actorId: checkedIn.value.actorId,
        storeId: checkedIn.value.storeId,
        businessDate: checkedIn.value.businessDate,
        checkedIn: true
      });
      return R.ok(plan);
    }
  });

  var CheckOut = pipeline.defineCommand({
    name: 'CheckOut',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS', 'QUANLY'],
    operationId: function (input) {
      return ids.deterministicId('operation', ['checkout', input.shift.shiftId]);
    },
    validate: function (input) {
      if (!input || !input.shift || !ids.isId(input.shift.shiftId, 'shift')) {
        return R.err('VALIDATION', 'CheckOut cần shift hợp lệ');
      }
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var checkedOut = employeeShift.checkOut(input.shift, ctx.clock.now());
      if (R.isErr(checkedOut)) return checkedOut;
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'employeeShift', record: checkedOut.value });
      plan.events.push({
        type: 'EmployeeCheckedInStateChanged',
        employeeId: checkedOut.value.employeeId,
        actorId: checkedOut.value.actorId,
        storeId: checkedOut.value.storeId,
        businessDate: checkedOut.value.businessDate,
        checkedIn: false
      });
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
    autoCloseStaleShifts: autoCloseStaleShifts,
    closeDayBlockers: closeDayBlockers,
    OpenCashSegment: OpenCashSegment,
    CheckIn: CheckIn,
    CheckOut: CheckOut,
    CloseCashSegment: CloseCashSegment
  };
});
