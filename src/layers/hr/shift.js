/**
 * Employee shift — chấm công thật.
 *
 * Chuỗi thật khảo sát từ legacy: FIFO-CHAIN-TRACE-PAYROLL-V1.md.
 * Ba điều phải làm khác legacy:
 *
 * 1. `payTermsRef` là snapshot ĐỌC LẠI ĐƯỢC, không phải trường trang trí.
 *    Legacy ghi `payTerms` vào employee_shifts lúc check-in rồi KHÔNG BAO GIỜ
 *    đọc lại (grep 0 kết quả) — tính lương vẫn join bảng nhân viên hiện tại.
 *    Bug tưởng đã sửa nhưng thực ra chưa. Ở đây computeWage() chỉ nhận
 *    payTermsRef và KHÔNG có đường nào chạm tới Employee hiện tại.
 *
 * 2. Sửa ca phải phát domain event. Legacy sửa ca "hôm nay đang mở" làm tắt
 *    isEmployeeCheckedInToday() → khoá âm thầm 23 điểm requireCheckedIn() ở POS
 *    (kho, BTP, bill, checklist, giao ca). Side-effect chưa từng được tài liệu hoá.
 *
 * 3. Ca tự đóng phải bị gắn cờ. Giờ auto-close là SUY ĐOÁN, không phải giờ thật —
 *    lương không được im lặng tin nó.
 *
 * Layer này là domain thuần: trả về state mới + việc cần làm, không tự ghi.
 */
GIEO.define('hr/shift', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'hr/employee'
], function (ids, R, employeeLib) {
  'use strict';

  var STATUS = { OPEN: 'OPEN', CLOSED: 'CLOSED' };

  /* Quá ngưỡng này thì ca coi như bị treo (quên check-out), không phải làm thật. */
  var DEFAULT_MAX_SHIFT_HOURS = 16;

  var REVIEW = {
    AUTO_CLOSED: 'AUTO_CLOSED',
    REVISED: 'REVISED',
    NEGATIVE_DURATION: 'NEGATIVE_DURATION',
    /* PR1/§2.3a — nhân viên chưa có PayTerms hiệu lực lúc check-in. */
    MISSING_PAY_TERMS: 'MISSING_PAY_TERMS'
  };

  var HOUR = 3600 * 1000;

  function shiftId(employeeId, businessDate) {
    /* Id xác định: check-in 2 lần cùng ngày phải đụng cùng 1 bản ghi, không tạo
       ca thứ hai (nền của idempotency ở tầng command). */
    return ids.deterministicId('shift', [employeeId, businessDate]);
  }

  /**
   * Check-in. Snapshot PayTerms có hiệu lực TẠI THỜI ĐIỂM check-in.
   *
   * PR1/§2.3a: thiếu PayTerms KHÔNG chặn check-in — legacy chưa từng chặn ca
   * làm việc vì lý do lương, và check-in gate 23 điểm requireCheckedIn() ở
   * POS (kho, BTP, bill, checklist, giao ca), nên chặn ở đây là hard-block
   * MỚI ảnh hưởng trực tiếp vận hành sống mà hệ cũ không có. Ca vẫn mở với
   * `payTermsRef: null` + cờ `needsReview`/`MISSING_PAY_TERMS` — LƯƠNG của ca
   * này treo lại (computeWage() bên dưới vẫn từ chối tính khi thiếu
   * payTermsRef, đúng nguyên tắc không đoán lương), nhưng NHÂN VIÊN vào ca
   * được ngay.
   */
  function checkIn(spec) {
    var employee = spec && spec.employee;
    if (!employee || !ids.isId(employee.employeeId, 'employee')) {
      return R.err('VALIDATION', 'checkIn cần employee hợp lệ');
    }
    if (typeof spec.at !== 'number') return R.err('VALIDATION', 'checkIn cần thời điểm "at"');
    if (!spec.businessDate) return R.err('VALIDATION', 'checkIn cần businessDate');
    if (!employee.active) return R.err('PRECONDITION', 'nhân viên đã nghỉ việc, không check-in được');
    if (!employeeLib.isEmployedAt(employee, spec.at)) {
      return R.err('PRECONDITION', 'thời điểm check-in nằm ngoài thời gian làm việc của nhân viên');
    }
    if (!spec.versionRegistry) return R.err('VALIDATION', 'checkIn cần versionRegistry để snapshot payTerms');

    var termsR = employeeLib.resolvePayTermsAt(
      spec.versionRegistry, employee.employeeId, employee.storeId, spec.at
    );
    var payTermsRef = null;
    var needsReview = false;
    var needsReviewReasons = [];
    if (R.isErr(termsR)) {
      needsReview = true;
      needsReviewReasons = [REVIEW.MISSING_PAY_TERMS];
    } else {
      /* Snapshot bắt buộc khi có — V5 của FIFO-COMPACTION-CONTRACT-V1.md §1. */
      payTermsRef = spec.versionRegistry.snapshotRef(termsR.value);
    }

    return R.ok({
      shiftId: shiftId(employee.employeeId, spec.businessDate),
      employeeId: employee.employeeId,
      actorId: employee.actorId,
      storeId: employee.storeId,
      businessDate: spec.businessDate,
      checkedInAt: spec.at,
      checkedOutAt: null,
      status: STATUS.OPEN,
      payTermsRef: payTermsRef,
      autoClosed: false,
      needsReview: needsReview,
      needsReviewReasons: needsReviewReasons,
      revisions: [],
      operationId: spec.operationId || null
    });
  }

  function checkOut(shift, at) {
    if (shift.status !== STATUS.OPEN) return R.err('PRECONDITION', 'ca không ở trạng thái OPEN');
    if (typeof at !== 'number') return R.err('VALIDATION', 'checkOut cần thời điểm');
    if (at < shift.checkedInAt) {
      return R.err('VALIDATION', 'giờ check-out sớm hơn giờ check-in');
    }
    return R.ok(Object.assign({}, shift, {
      checkedOutAt: at,
      status: STATUS.CLOSED
    }));
  }

  /**
   * Lớp tự đóng ca treo qua ngày.
   *
   * Khác legacy ở chỗ: giờ đóng tự động được GẮN CỜ needsReview. Đây là số suy
   * đoán, và lương thì không được im lặng trả theo số suy đoán — phải có người
   * xác nhận hoặc sửa.
   */
  function autoCloseIfStale(shift, nowTs, opts) {
    opts = opts || {};
    var maxHours = opts.maxShiftHours || DEFAULT_MAX_SHIFT_HOURS;
    if (shift.status !== STATUS.OPEN) return R.ok(shift);

    var elapsed = nowTs - shift.checkedInAt;
    if (elapsed <= maxHours * HOUR) return R.ok(shift);

    var reasons = shift.needsReviewReasons.slice();
    if (reasons.indexOf(REVIEW.AUTO_CLOSED) === -1) reasons.push(REVIEW.AUTO_CLOSED);

    return R.ok(Object.assign({}, shift, {
      checkedOutAt: shift.checkedInAt + maxHours * HOUR,
      status: STATUS.CLOSED,
      autoClosed: true,
      needsReview: true,
      needsReviewReasons: reasons
    }));
  }

  /**
   * Sửa giờ chấm công.
   *
   * Trả về CẢ state mới lẫn danh sách event phải phát. Gọi được mà không phát
   * event là cách legacy âm thầm khoá 23 actor-gate ở POS — nên event nằm ngay
   * trong giá trị trả về, không phải việc caller tự nhớ.
   */
  function reviseShift(shift, changes, spec) {
    if (!spec || !ids.isId(spec.actorId, 'actor')) {
      return R.err('VALIDATION', 'sửa chấm công phải có actorId — legacy thiếu audit ở đúng chỗ này');
    }
    if (!spec.operationId) return R.err('VALIDATION', 'sửa chấm công phải có operationId');
    if (!spec.reason) return R.err('VALIDATION', 'sửa chấm công phải có lý do');
    if (!changes || (changes.checkedInAt === undefined && changes.checkedOutAt === undefined)) {
      return R.err('VALIDATION', 'reviseShift cần ít nhất 1 thay đổi giờ');
    }

    var nextIn = changes.checkedInAt === undefined ? shift.checkedInAt : changes.checkedInAt;
    var nextOut = changes.checkedOutAt === undefined ? shift.checkedOutAt : changes.checkedOutAt;
    if (typeof nextIn !== 'number') return R.err('VALIDATION', 'checkedInAt phải là timestamp');
    if (nextOut !== null && typeof nextOut !== 'number') return R.err('VALIDATION', 'checkedOutAt phải là timestamp hoặc null');
    if (nextOut !== null && nextOut < nextIn) return R.err('VALIDATION', 'giờ ra sớm hơn giờ vào');

    var reasons = shift.needsReviewReasons.slice();
    if (reasons.indexOf(REVIEW.REVISED) === -1) reasons.push(REVIEW.REVISED);

    var next = Object.assign({}, shift, {
      checkedInAt: nextIn,
      checkedOutAt: nextOut,
      status: nextOut === null ? STATUS.OPEN : STATUS.CLOSED,
      needsReview: true,
      needsReviewReasons: reasons,
      /* Append-only: giữ nguyên giá trị trước để trả lời "số nào từng đúng". */
      revisions: shift.revisions.concat([{
        operationId: spec.operationId,
        actorId: spec.actorId,
        at: spec.at || null,
        reason: String(spec.reason),
        before: { checkedInAt: shift.checkedInAt, checkedOutAt: shift.checkedOutAt, status: shift.status },
        after: { checkedInAt: nextIn, checkedOutAt: nextOut }
      }])
    });

    var events = [];
    var wasOpen = shift.status === STATUS.OPEN;
    var nowOpen = next.status === STATUS.OPEN;
    if (spec.isCurrentBusinessDate && wasOpen !== nowOpen) {
      /* Đây là side-effect legacy chưa từng tài liệu hoá. Phát event để mọi
         actor-gate (checklist, ký tên kho/BTP, tạo bill, giao ca) refresh đồng
         bộ, thay vì để nhân viên bị khoá quyền không rõ nguyên nhân. */
      events.push({
        type: 'EmployeeCheckedInStateChanged',
        employeeId: shift.employeeId,
        actorId: shift.actorId,
        storeId: shift.storeId,
        businessDate: shift.businessDate,
        checkedIn: nowOpen,
        causedByOperationId: spec.operationId
      });
    }

    return R.ok({ shift: next, events: events });
  }

  /**
   * Actor-gate: "nhân viên này đã check-in hôm nay chưa".
   * POS gọi ở 23 chỗ. Một hàm duy nhất, không suy diễn lại ở từng chỗ.
   */
  function isCheckedIn(shifts, employeeId, businessDate) {
    for (var i = 0; i < shifts.length; i++) {
      var s = shifts[i];
      if (s.employeeId === employeeId && s.businessDate === businessDate && s.status === STATUS.OPEN) {
        return true;
      }
    }
    return false;
  }

  /** Giờ công thực tế của 1 ca. Ca chưa đóng thì KHÔNG đoán. */
  function workedHours(shift) {
    if (shift.checkedOutAt === null) {
      return R.err('PRECONDITION', 'ca chưa check-out, không tính được giờ công');
    }
    var ms = shift.checkedOutAt - shift.checkedInAt;
    if (ms < 0) return R.err('VALIDATION', 'ca có giờ ra sớm hơn giờ vào');
    return R.ok(ms / HOUR);
  }

  /**
   * Tiền công 1 ca.
   *
   * CHỈ nhận `shift` và đọc `shift.payTermsRef`. Không có tham số nào cho
   * Employee hiện tại, nên KHÔNG CÓ ĐƯỜNG NÀO để lặp lại bug legacy "join bảng
   * nhân viên hiện tại" — chặn bằng chữ ký hàm, không bằng lời nhắc.
   */
  function computeWage(shift) {
    if (!shift.payTermsRef || !shift.payTermsRef.payload) {
      return R.err('PRECONDITION', 'ca thiếu payTermsRef — không được tính lương bằng PayTerms hiện tại');
    }
    var hoursR = workedHours(shift);
    if (R.isErr(hoursR)) return hoursR;

    var hours = hoursR.value;
    var t = shift.payTermsRef.payload;
    var normalHours = Math.min(hours, t.otThreshold);
    var otHours = Math.max(0, hours - t.otThreshold);

    return R.ok({
      hours: hours,
      normalHours: normalHours,
      otHours: otHours,
      amount: normalHours * t.rate + otHours * t.otRate,
      /* V4: kết quả mang theo versionId đã dùng, để đọc lại lịch sử không phải
         resolve lại. */
      payTermsVersionId: shift.payTermsRef.versionId,
      needsReview: shift.needsReview,
      needsReviewReasons: shift.needsReviewReasons.slice()
    });
  }

  return {
    STATUS: STATUS,
    REVIEW: REVIEW,
    DEFAULT_MAX_SHIFT_HOURS: DEFAULT_MAX_SHIFT_HOURS,
    shiftId: shiftId,
    checkIn: checkIn,
    checkOut: checkOut,
    autoCloseIfStale: autoCloseIfStale,
    reviseShift: reviseShift,
    isCheckedIn: isCheckedIn,
    workedHours: workedHours,
    computeWage: computeWage
  };
});
