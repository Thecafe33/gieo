/**
 * Work schedule — lịch làm việc đã xếp.
 *
 * Ở legacy đây là dữ liệu CHỈ ĐỂ ĐỌC, dùng so sánh đi trễ, không nối vào tính
 * lương (`FIFO-CHAIN-TRACE-PAYROLL-V1.md` §6: lương cứng cộng đều mọi ngày,
 * KHÔNG kiểm tra work_schedules hay có chấm công hay không — nghỉ dài ngày
 * không tự trừ).
 *
 * Chủ quán đã chốt: **lương cứng trừ theo lịch làm việc**. Nên domain này từ
 * optional thành BẮT BUỘC cho payroll — không có lịch thì không biết ngày nào
 * là vắng mặt, và mọi phép trừ đều là đoán.
 */
GIEO.define('hr/work-schedule', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  function scheduleId(employeeId, dateKey) {
    return ids.deterministicId('shift', ['sched', employeeId, dateKey]);
  }

  /** Một ngày được xếp lịch cho một nhân viên. */
  function scheduleDay(spec) {
    if (!ids.isId(spec.employeeId, 'employee')) return R.err('VALIDATION', 'cần employeeId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'cần storeId hợp lệ');
    if (!spec.clock || !spec.clock.isDateKey(spec.dateKey)) {
      return R.err('VALIDATION', 'cần dateKey dạng YYYY-MM-DD');
    }
    return R.ok({
      scheduleId: scheduleId(spec.employeeId, spec.dateKey),
      employeeId: spec.employeeId,
      storeId: spec.storeId,
      dateKey: spec.dateKey,
      plannedHours: typeof spec.plannedHours === 'number' ? spec.plannedHours : null,
      /* Nghỉ có phép: vẫn nằm trong lịch nhưng KHÔNG bị tính là vắng mặt.
         Legacy không có khái niệm này nên không phân biệt được nghỉ phép với
         nghỉ không báo. */
      excused: !!spec.excused,
      excusedReason: spec.excusedReason || null
    });
  }

  function markExcused(day, reason) {
    if (!reason) return R.err('VALIDATION', 'nghỉ có phép phải ghi lý do');
    return R.ok(Object.assign({}, day, { excused: true, excusedReason: String(reason) }));
  }

  /**
   * Đối chiếu lịch với chấm công thật.
   *
   * Trả 3 nhóm tách bạch, vì chúng dẫn tới 3 xử lý khác nhau:
   *   worked         — có lịch, có đi làm
   *   absent         — có lịch, không đi làm, không phép  → CƠ SỞ TRỪ LƯƠNG CỨNG
   *   excusedAbsent  — có lịch, không đi làm, có phép     → không trừ
   *   unscheduled    — đi làm ngoài lịch                  → không cộng thêm, nhưng phải thấy được
   */
  function reconcile(spec) {
    var days = spec.scheduleDays || [];
    var shifts = spec.shifts || [];

    var workedKeys = Object.create(null);
    shifts.forEach(function (s) { workedKeys[s.businessDate] = true; });

    var scheduledKeys = Object.create(null);
    var worked = [];
    var absent = [];
    var excusedAbsent = [];

    days.forEach(function (d) {
      scheduledKeys[d.dateKey] = true;
      if (workedKeys[d.dateKey]) worked.push(d.dateKey);
      else if (d.excused) excusedAbsent.push(d.dateKey);
      else absent.push(d.dateKey);
    });

    var unscheduled = Object.keys(workedKeys).filter(function (k) { return !scheduledKeys[k]; });

    return R.ok({
      scheduledDays: days.length,
      worked: worked,
      absent: absent,
      excusedAbsent: excusedAbsent,
      unscheduled: unscheduled.sort()
    });
  }

  return {
    scheduleId: scheduleId,
    scheduleDay: scheduleDay,
    markExcused: markExcused,
    reconcile: reconcile
  };
});
