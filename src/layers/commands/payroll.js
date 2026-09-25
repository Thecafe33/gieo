/**
 * Lệnh Payroll — điểm nối còn thiếu.
 *
 * hr/payroll.js (closePayroll) và hr/shift.js (reviseShift) đúng nhưng KHÔNG
 * có defineCommand() nào gọi tới — 0 importer trong toàn bộ src/layers, nên
 * không cách nào chạm tới được dù logic đã viết sẵn. Quyết định chủ quán
 * ("tìm chỗ nối vào hợp lý"): nối theo ĐÚNG pattern commands/shift.js đã
 * dùng cho CheckIn/CheckOut, không phát minh cơ chế mới.
 */
GIEO.define('commands/payroll', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'hr/shift',
  'hr/payroll',
  'hr/liability'
], function (ids, R, pipeline, shiftLib, payrollLib, liabilityLib) {
  'use strict';

  /**
   * ReviseAttendance — nối hr/shift.reviseShift() vào command layer.
   * `revisionRef` là id xác định do caller cấp (cùng vai trò wasteRef/adjustRef
   * ở commands/inventory.js) — sửa chấm công không có input tự nhiên nào là
   * duy nhất, nên không có nó thì không dựng được operationId ổn định.
   */
  var ReviseAttendance = pipeline.defineCommand({
    name: 'ReviseAttendance',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['reviseattendance', input.shift.shiftId, input.revisionRef]);
    },

    validate: function (input) {
      if (!input || !input.shift || !ids.isId(input.shift.shiftId, 'shift')) {
        return R.err('VALIDATION', 'ReviseAttendance cần shift hợp lệ');
      }
      if (!input.revisionRef) return R.err('VALIDATION', 'ReviseAttendance cần revisionRef để id xác định');
      if (!input.reason) return R.err('VALIDATION', 'sửa chấm công phải có lý do');
      if (!input.changes || (input.changes.checkedInAt === undefined && input.changes.checkedOutAt === undefined)) {
        return R.err('VALIDATION', 'ReviseAttendance cần ít nhất 1 thay đổi giờ');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var opId = ids.deterministicId('operation', ['reviseattendance', input.shift.shiftId, input.revisionRef]);
      var revised = shiftLib.reviseShift(input.shift, input.changes, {
        actorId: ctx.actor.actorId,
        operationId: opId,
        reason: input.reason,
        at: ctx.clock.now(),
        isCurrentBusinessDate: input.shift.businessDate === ctx.businessDate
      });
      if (R.isErr(revised)) return revised;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'employeeShift', record: revised.value.shift });
      revised.value.events.forEach(function (e) { plan.events.push(e); });
      return R.ok(plan);
    }
  });

  /**
   * ClosePayroll — nối hr/payroll.closePayroll() vào command layer.
   *
   * `input.results` = computePayroll() đã chạy sẵn cho từng nhân viên trong
   * kỳ (đọc-tính rồi mới chốt, giống mọi report khác — closePayroll không tự
   * tính lại). Khoản trừ trách nhiệm nhân viên (input.liabilities, khớp qua
   * appliedLiabilityIds đã đóng băng trong từng dòng) được chuyển sang
   * DEDUCTED NGAY trong cùng mutation này — không đợi L9.
   */
  var ClosePayroll = pipeline.defineCommand({
    name: 'ClosePayroll',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation',
        ['closepayroll', input.storeId, input.monthKey, String(input.revisionNo || 1)]);
    },

    validate: function (input) {
      if (!input || !input.monthKey || !/^\d{4}-\d{2}$/.test(input.monthKey)) {
        return R.err('VALIDATION', 'ClosePayroll cần monthKey dạng YYYY-MM');
      }
      if (!ids.isId(input.storeId, 'store')) return R.err('VALIDATION', 'ClosePayroll cần storeId hợp lệ');
      if (!Array.isArray(input.results) || input.results.length === 0) {
        return R.err('VALIDATION', 'ClosePayroll cần results (computePayroll đã tính cho từng nhân viên)');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var opId = ids.deterministicId('operation',
        ['closepayroll', input.storeId, input.monthKey, String(input.revisionNo || 1)]);

      var closed = payrollLib.closePayroll({
        monthKey: input.monthKey,
        storeId: input.storeId,
        actorId: ctx.actor.actorId,
        operationId: opId,
        at: ctx.clock.now(),
        results: input.results,
        acknowledgeReview: input.acknowledgeReview,
        revisionNo: input.revisionNo,
        supersedesClosingId: input.supersedesClosingId
      });
      if (R.isErr(closed)) return closed;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'payrollClosing', record: closed.value });

      /* Khoản trừ đã đóng băng vào lương kỳ này → chuyển DEDUCTED. Dùng đúng
         appliedLiabilityIds đã đóng băng trong closing.lines — không tính lại
         "ai bị trừ", vì số đã chốt rồi. */
      var liabilitiesById = Object.create(null);
      (input.liabilities || []).forEach(function (l) { liabilitiesById[l.liabilityId] = l; });

      var deductError = null;
      closed.value.lines.forEach(function (line) {
        (line.appliedLiabilityIds || []).forEach(function (liabilityId) {
          if (deductError) return;
          var liability = liabilitiesById[liabilityId];
          if (!liability) return;
          var d = liabilityLib.markDeducted(liability, {
            at: ctx.clock.now(), payrollClosingId: closed.value.payrollClosingId
          });
          if (R.isErr(d)) { deductError = d; return; }
          plan.domainRecords.push({ type: 'liability', record: d.value });
        });
      });
      if (deductError) return deductError;

      return R.ok(plan);
    }
  });

  return {
    ReviseAttendance: ReviseAttendance,
    ClosePayroll: ClosePayroll
  };
});
