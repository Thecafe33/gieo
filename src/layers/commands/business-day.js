/**
 * Command boundary cho vòng đời ngày vận hành.
 *
 * Domain truth vẫn nằm ở store-context/business-day. File này chỉ bọc hai
 * transition qua command pipeline để quyền, idempotency, audit và atomic commit
 * giống mọi mutation khác. UI không được gọi openDay/closeDay trực tiếp.
 */
GIEO.define('commands/business-day', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'store-context/business-day',
  'commands/pipeline',
  'commands/shift'
], function (ids, R, businessDay, pipeline, shift) {
  'use strict';

  function openOperationId(input) {
    return ids.deterministicId('operation', [
      'open-business-day', input.storeId, input.dateKey
    ]);
  }

  function closeOperationId(input) {
    return ids.deterministicId('operation', [
      'close-business-day', input.day.storeId, input.day.dateKey
    ]);
  }

  var OpenBusinessDay = pipeline.defineCommand({
    name: 'OpenBusinessDay',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],
    /* Mở ngày là transition tạo gate, nên bản thân nó không thể đòi ngày mở. */
    requiresOpenDay: false,
    operationId: openOperationId,
    validate: function (input) {
      if (!input || !ids.isId(input.storeId, 'store')) {
        return R.err('VALIDATION', 'OpenBusinessDay cần storeId hợp lệ');
      }
      if (!input.dateKey) return R.err('VALIDATION', 'OpenBusinessDay cần dateKey');
      if ((input.existingDays || []).some(function (day) {
        return day.storeId === input.storeId && day.status === businessDay.STATUS.OPEN;
      })) {
        return R.err('CONFLICT', 'cửa hàng đã có ngày làm việc đang mở');
      }
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var opened = businessDay.openDay({
        storeId: input.storeId,
        dateKey: input.dateKey,
        actorId: ctx.actor.actorId,
        at: ctx.clock.now(),
        clock: ctx.clock
      });
      if (R.isErr(opened)) return opened;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'businessDay', record: opened.value });
      plan.events.push({
        type: 'BusinessDayOpened',
        businessDayId: opened.value.businessDayId,
        storeId: opened.value.storeId,
        businessDate: opened.value.dateKey,
        openedBy: opened.value.openedBy
      });
      return R.ok(plan);
    }
  });

  var CloseBusinessDay = pipeline.defineCommand({
    name: 'CloseBusinessDay',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],
    operationId: closeOperationId,
    validate: function (input) {
      if (!input || !input.day) return R.err('VALIDATION', 'CloseBusinessDay cần day');
      if (!ids.isId(input.day.storeId, 'store')) {
        return R.err('VALIDATION', 'CloseBusinessDay cần day.storeId hợp lệ');
      }
      if (input.storeId && input.storeId !== input.day.storeId) {
        return R.err('VALIDATION', 'storeId khác store của ngày cần chốt');
      }
      return R.ok(true);
    },
    execute: function (input, ctx) {
      /* Không nhận `blockers` dựng sẵn từ UI. Command luôn tự tính từ canonical
         input đã được data source hydrate, nên caller không thể gửi [] để lách. */

      /* Ca THẬT SỰ treo (quá `DEFAULT_MAX_SHIFT_HOURS`, quên check-out) tự
         đóng TRƯỚC khi tính blockers — trước đây `autoCloseIfStale` không có
         caller nào, nên 1 ca quên check-out chặn đóng ngày vĩnh viễn cho tới
         khi sửa tay (VIỆC PHẢI LÀM #3, `NET-PAYROLL-V1.md`). Ca đang làm thật
         (chưa quá ngưỡng) vẫn tiếp tục chặn như cũ. */
      var staleResult = shift.autoCloseStaleShifts(input.openEmployeeShifts || [], ctx.clock.now());
      var blockers = shift.closeDayBlockers({
        segments: input.segments || [],
        openEmployeeShifts: staleResult.stillOpen,
        pendingChecklists: input.pendingChecklists || []
      });
      var operationId = closeOperationId(input);
      var closed = businessDay.closeDay(input.day, {
        actorId: ctx.actor.actorId,
        operationId: operationId,
        at: ctx.clock.now(),
        blockers: blockers
      });
      if (R.isErr(closed)) return closed;

      var plan = pipeline.emptyPlan();
      staleResult.closedShifts.forEach(function (sh) {
        plan.domainRecords.push({ type: 'employeeShift', record: sh });
        plan.events.push({
          type: 'EmployeeCheckedInStateChanged',
          employeeId: sh.employeeId,
          actorId: sh.actorId,
          storeId: sh.storeId,
          businessDate: sh.businessDate,
          checkedIn: false
        });
      });
      plan.domainRecords.push({ type: 'businessDay', record: closed.value });
      plan.events.push({
        type: 'BusinessDayClosed',
        businessDayId: closed.value.businessDayId,
        storeId: closed.value.storeId,
        businessDate: closed.value.dateKey,
        closedBy: closed.value.closedBy
      });
      return R.ok(plan);
    }
  });

  return {
    OpenBusinessDay: OpenBusinessDay,
    CloseBusinessDay: CloseBusinessDay
  };
});
