/**
 * Payroll — tính lương và chốt lương tháng.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-PAYROLL-V1.md.
 *
 * Ba gap đang đóng:
 *
 * 1. `payTerms` là WRITE CHẾT (§3). Legacy snapshot payTerms vào employee_shifts
 *    lúc check-in nhưng `computeActualLaborCostByDate` vẫn join bảng nhân viên
 *    HIỆN TẠI — grep 0 kết quả đọc lại snapshot. Bug tưởng đã sửa nhưng chưa.
 *    Ở đây lương giờ đọc từ `shift.payTermsRef` (hr/shift.computeWage chặn bằng
 *    chữ ký hàm), còn lương cứng resolve TỪNG NGÀY qua cơ chế versioning chung.
 *
 * 2. `PayrollClosing` CHƯA TỪNG TỒN TẠI (§4). `renderEntryLuong()` tính lại
 *    LIVE mỗi lần mở tab — không collection snapshot, không nút chốt, không
 *    phiếu lương. Hệ quả: xem lương tháng 8 hôm nay và xem lại sau khi sửa
 *    chấm công cho ra 2 số khác nhau, không ai biết số nào "đã trả". Ở đây
 *    PayrollClosing dùng ĐÚNG pattern của book_closing (đóng băng, correction
 *    giữ v1).
 *
 * 3. Lương cứng không trừ khi nghỉ (§6). Legacy cộng đều mọi ngày, không kiểm
 *    work_schedules. Chủ quán đã chốt: TRỪ THEO LỊCH LÀM VIỆC.
 */
GIEO.define('hr/payroll', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input',
  'hr/shift',
  'hr/work-schedule'
], function (ids, R, VI, shiftLib, scheduleLib) {
  'use strict';

  /**
   * Tính lương 1 nhân viên cho 1 kỳ.
   *
   * @param spec.registry        VersionedInput registry
   * @param spec.employee
   * @param spec.shifts          ca đã chấm công trong kỳ (mang payTermsRef riêng)
   * @param spec.scheduleDays    lịch đã xếp trong kỳ — BẮT BUỘC nếu có lương cứng
   * @param spec.fromTs, spec.toTs
   */
  function computePayroll(spec) {
    var employee = spec.employee;
    if (!employee || !ids.isId(employee.employeeId, 'employee')) {
      return R.err('VALIDATION', 'computePayroll cần employee hợp lệ');
    }
    if (typeof spec.fromTs !== 'number' || typeof spec.toTs !== 'number') {
      return R.err('VALIDATION', 'computePayroll cần khoảng thời gian');
    }

    var shifts = spec.shifts || [];

    /* ── Lương giờ ────────────────────────────────────────────────────────
       Mỗi ca dùng payTerms ĐÃ SNAPSHOT của chính nó. Không có tham số nào
       cho PayTerms hiện tại, nên không tồn tại đường lặp lại bug §3. */
    var hourly = { hours: 0, amount: 0, lines: [], needsReview: [] };
    for (var i = 0; i < shifts.length; i++) {
      var sh = shifts[i];
      if (sh.employeeId !== employee.employeeId) continue;
      if (sh.status !== shiftLib.STATUS.CLOSED) {
        return R.err('PRECONDITION',
          'ca ngày ' + sh.businessDate + ' chưa check-out — không chốt lương khi còn ca mở');
      }
      var w = shiftLib.computeWage(sh);
      if (R.isErr(w)) return w;
      hourly.hours += w.value.hours;
      hourly.amount += w.value.amount;
      hourly.lines.push({
        businessDate: sh.businessDate,
        hours: w.value.hours,
        normalHours: w.value.normalHours,
        otHours: w.value.otHours,
        amount: w.value.amount,
        payTermsVersionId: w.value.payTermsVersionId,
        needsReview: w.value.needsReview
      });
      if (w.value.needsReview) {
        hourly.needsReview.push({ businessDate: sh.businessDate, reasons: w.value.needsReviewReasons });
      }
    }

    /* ── Lương cứng ───────────────────────────────────────────────────────
       Resolve TỪNG NGÀY (quy tắc V3) — đổi mức lương cứng giữa kỳ không được
       áp một mức cho cả kỳ. */
    var dailyR = spec.registry.resolveDaily(
      VI.KINDS.payTerms, employee.employeeId, employee.storeId, spec.fromTs, spec.toTs
    );
    if (R.isErr(dailyR)) return dailyR;
    var daily = dailyR.value;
    var dayKeys = Object.keys(daily).sort();

    var hasFixed = dayKeys.some(function (k) {
      return typeof daily[k].version.payload.fixedMonthlySalary === 'number';
    });

    var fixed = { amount: 0, scheduledDays: 0, absentDays: 0, excusedDays: 0, lines: [], deductions: [] };

    if (hasFixed) {
      var schedule = spec.scheduleDays;
      if (!Array.isArray(schedule) || schedule.length === 0) {
        /* Đã chốt: lương cứng trừ theo lịch làm việc. Không có lịch thì mọi
           phép trừ đều là đoán — từ chối thay vì đoán. */
        return R.err('PRECONDITION',
          'nhân viên có lương cứng nhưng kỳ này chưa xếp lịch làm việc — ' +
          'không trừ được ngày vắng nếu không biết ngày nào phải đi làm');
      }

      var rec = scheduleLib.reconcile({ scheduleDays: schedule, shifts: shifts });
      if (R.isErr(rec)) return rec;
      var r = rec.value;

      fixed.scheduledDays = r.scheduledDays;
      fixed.absentDays = r.absent.length;
      fixed.excusedDays = r.excusedAbsent.length;
      fixed.deductions = r.absent.slice();

      /* Mỗi ngày trong lịch gánh một phần lương cứng, theo mức có hiệu lực
         ĐÚNG NGÀY ĐÓ. Ngày vắng không phép thì phần đó không được cộng. */
      var perDayByKey = Object.create(null);
      schedule.forEach(function (d) {
        var entry = daily[d.dateKey];
        if (!entry) return;
        var monthly = entry.version.payload.fixedMonthlySalary;
        if (typeof monthly !== 'number') return;
        perDayByKey[d.dateKey] = {
          rate: monthly / r.scheduledDays,
          versionId: entry.version.versionId,
          multipleVersionsInDay: entry.multipleVersionsInDay
        };
      });

      var earnedKeys = r.worked.concat(r.excusedAbsent);
      earnedKeys.forEach(function (k) {
        var p = perDayByKey[k];
        if (!p) return;
        fixed.amount += p.rate;
        fixed.lines.push({
          dateKey: k,
          amount: p.rate,
          payTermsVersionId: p.versionId,
          reason: r.excusedAbsent.indexOf(k) !== -1 ? 'EXCUSED' : 'WORKED'
        });
      });
    }

    return R.ok({
      employeeId: employee.employeeId,
      storeId: employee.storeId,
      fromTs: spec.fromTs,
      toTs: spec.toTs,
      hourly: hourly,
      fixed: fixed,
      total: hourly.amount + fixed.amount,
      /* Ca tự đóng / đã sửa giờ đều chảy lên đây, không bị rơi mất. */
      needsReview: hourly.needsReview.length > 0,
      needsReviewDetail: hourly.needsReview,
      /* Version đã dùng — đọc lại kỳ này không phải resolve lại (V4). */
      payTermsVersionIds: hourly.lines.map(function (l) { return l.payTermsVersionId; })
        .concat(fixed.lines.map(function (l) { return l.payTermsVersionId; }))
        .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
    });
  }

  /**
   * PayrollClosing — snapshot lương tháng BẤT BIẾN.
   *
   * Chưa từng tồn tại ở legacy. Dùng đúng pattern `book_closing`
   * (FIFO-COMPACTION-CONTRACT-V1.md §3): đã chốt thì ĐỌC THẲNG, không tính lại.
   */
  function closePayroll(spec) {
    if (!spec.monthKey || !/^\d{4}-\d{2}$/.test(spec.monthKey)) {
      return R.err('VALIDATION', 'closePayroll cần monthKey dạng YYYY-MM');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'chốt lương cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'chốt lương cần operationId');

    var results = spec.results || [];
    if (results.length === 0) return R.err('VALIDATION', 'không có kết quả lương nào để chốt');

    var unresolved = results.filter(function (r) { return r.needsReview; });
    if (unresolved.length && !spec.acknowledgeReview) {
      /* Chốt lương khi còn ca cần rà là chốt số chưa chắc đúng. Cho phép, nhưng
         phải xác nhận tường minh — không lặng lẽ chốt. */
      return R.err('PRECONDITION',
        unresolved.length + ' nhân viên còn ca cần rà (ca tự đóng hoặc đã sửa giờ) — ' +
        'phải xác nhận trước khi chốt', {
          employees: unresolved.map(function (r) { return r.employeeId; })
        });
    }

    return R.ok({
      payrollClosingId: ids.deterministicId('snapshot', ['payroll', spec.storeId, spec.monthKey]),
      storeId: spec.storeId,
      monthKey: spec.monthKey,
      revisionNo: spec.revisionNo || 1,
      supersedesClosingId: spec.supersedesClosingId || null,
      closedAt: spec.at,
      closedBy: spec.actorId,
      operationId: spec.operationId,
      acknowledgedReview: !!spec.acknowledgeReview,
      /* Đóng băng đủ chi tiết để in phiếu lương và trả lời "số nào đã trả". */
      lines: results.map(function (r) {
        return {
          employeeId: r.employeeId,
          hourlyHours: r.hourly.hours,
          hourlyAmount: r.hourly.amount,
          fixedAmount: r.fixed.amount,
          fixedScheduledDays: r.fixed.scheduledDays,
          fixedAbsentDays: r.fixed.absentDays,
          total: r.total,
          payTermsVersionIds: r.payTermsVersionIds,
          needsReview: r.needsReview
        };
      }),
      total: results.reduce(function (s, r) { return s + r.total; }, 0)
    });
  }

  /**
   * Đọc lương tháng: đã chốt thì đọc thẳng số đóng băng.
   * Đây là thứ làm cho "xem lương tháng 8 hôm nay" và "xem lại sau khi sửa
   * chấm công" ra CÙNG một số.
   */
  function readPayrollForMonth(spec) {
    if (spec.closing) {
      return R.ok({ source: 'CLOSING', frozen: true, data: spec.closing });
    }
    return R.ok({ source: 'LIVE', frozen: false, data: spec.liveResults || [] });
  }

  /**
   * Phát hiện số sống đã trôi khỏi số đã chốt (§3.2 của compaction contract).
   * Không tự sửa snapshot — chỉ báo, để người có quyền quyết định.
   */
  function detectPayrollDrift(closing, liveResults) {
    var byId = Object.create(null);
    (liveResults || []).forEach(function (r) { byId[r.employeeId] = r; });

    var drift = [];
    closing.lines.forEach(function (l) {
      var live = byId[l.employeeId];
      if (!live) {
        drift.push({ employeeId: l.employeeId, reason: 'KHÔNG CÒN DỮ LIỆU SỐNG', frozen: l.total, live: null });
        return;
      }
      if (live.total !== l.total) {
        drift.push({
          employeeId: l.employeeId, reason: 'SỐ SỐNG KHÁC SỐ ĐÃ CHỐT',
          frozen: l.total, live: live.total, difference: live.total - l.total
        });
      }
    });

    return R.ok({ monthKey: closing.monthKey, clean: drift.length === 0, drift: drift });
  }

  return {
    computePayroll: computePayroll,
    closePayroll: closePayroll,
    readPayrollForMonth: readPayrollForMonth,
    detectPayrollDrift: detectPayrollDrift
  };
});
