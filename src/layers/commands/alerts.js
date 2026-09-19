/**
 * Lệnh cảnh báo — bọc `alerts/alert.js#raise()` thành command thật.
 *
 * `alerts/alert.js` có logic đúng (severity/audience/required field theo
 * TỪNG loại, xem header file đó) nhưng chưa từng được command nào gọi — mọi
 * event đã sẵn trong `plan.events` (`PrepYieldMismatch`, `LostContainerReported`,
 * `StockCountPartiallyApplied`...) không có consumer nào tạo alert thật.
 * `bootstrap/domain-events.js` dịch các event đó thành input cho `RaiseAlert`
 * ở đây, cùng cổng idempotency/quyền/audit với mọi command khác — không có
 * đường ghi tắt riêng cho "alert nội bộ do hệ thống tự tạo".
 *
 * `RaiseAlert` idempotent theo (type, storeId, subjectKey) — TRÙNG với cách
 * `alert.raise()` xác định `alertId`, nên gọi lại đúng operationId là replay
 * (không ghi lại), KHÔNG đè mất trạng thái `SEEN`/`RESOLVED` mà người dùng đã
 * đặt cho alert đó qua các command khác.
 *
 * `MarkAlertSeen`/`ResolveAlert` (AL6) — bọc `alerts/alert.js#markSeen()`/
 * `#resolve()`, cùng pattern denormalized-input: caller cấp thẳng bản ghi
 * `alert` hiện tại (đọc qua `GetAlerts`), không tự tra lại. `MarkAlertSeen`
 * mở cho CẢ HAI audience (POS lẫn QUANLY đều thấy alert audience BOTH/POS
 * theo đúng loại) — "đã xem" không tắt cảnh báo, chỉ ghi nhận ai đã thấy.
 * `ResolveAlert` chỉ REVIEW_APPROVE_CORRECT: mọi loại MANUAL_WITH_REFERENCE
 * (loại duy nhất `resolve()` lib cho đóng tay) đều audience QUANLY — không
 * loại nào trong số đó cần POS đóng. `alerts/alert.js#resolve()` tự chặn
 * AUTO_VERIFIABLE (không cho đóng tay) và đòi `referenceId` — validate ở
 * đây chỉ kiểm tra input tồn tại, phần logic domain vẫn ở lib.
 */
GIEO.define('commands/alerts', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'alerts/alert'
], function (ids, R, pipeline, alertLib) {
  'use strict';

  var RaiseAlert = pipeline.defineCommand({
    name: 'RaiseAlert',
    /*
     * Alert được HỆ THỐNG tự tạo, chạy NGAY SAU command gốc qua domain-events
     * dispatch — CÙNG actor/ctx với command gốc (dispatchDomainEvents không
     * đổi actor). Command gốc có thể là ReportLostContainer (POS, EXECUTE),
     * RecordPrepProduction (POS hoặc QUANLY, EXECUTE hoặc REVIEW_APPROVE_CORRECT)
     * hay ApproveStockCount (QUANLY, REVIEW_APPROVE_CORRECT) — RaiseAlert phải
     * chấp nhận CẢ HAI, nếu không actor đã đủ quyền chạy command gốc sẽ bị
     * FORBIDDEN ngay ở bước side-effect, một lỗi khó hiểu vì input hợp lệ.
     */
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation',
        ['raisealert', input.type, input.storeId, input.subjectKey || 'store']);
    },

    validate: function (input) {
      if (!input || !input.type) return R.err('VALIDATION', 'RaiseAlert cần type');
      if (!ids.isId(input.storeId, 'store')) return R.err('VALIDATION', 'RaiseAlert cần storeId hợp lệ');
      if (!input.businessDate) return R.err('VALIDATION', 'RaiseAlert cần businessDate');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation',
        ['raisealert', input.type, input.storeId, input.subjectKey || 'store']);
      var r = alertLib.raise({
        type: input.type,
        storeId: input.storeId,
        businessDate: input.businessDate,
        subjectKey: input.subjectKey,
        data: input.data,
        at: input.at || ctx.clock.now(),
        operationId: opId
      });
      if (R.isErr(r)) return r;
      plan.domainRecords.push({ type: 'alert', record: r.value });
      return R.ok(plan);
    }
  });

  var MarkAlertSeen = pipeline.defineCommand({
    name: 'MarkAlertSeen',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['markalertseen', input.alert && input.alert.alertId]);
    },

    validate: function (input) {
      if (!input || !input.alert || !ids.isId(input.alert.alertId, 'alert')) {
        return R.err('VALIDATION', 'MarkAlertSeen cần alert hợp lệ');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var r = alertLib.markSeen(input.alert, { actorId: ctx.actor.actorId, at: ctx.clock.now() });
      if (R.isErr(r)) return r;
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'alert', record: r.value });
      return R.ok(plan);
    }
  });

  var ResolveAlert = pipeline.defineCommand({
    name: 'ResolveAlert',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['resolvealert', input.alert && input.alert.alertId]);
    },

    validate: function (input) {
      if (!input || !input.alert || !ids.isId(input.alert.alertId, 'alert')) {
        return R.err('VALIDATION', 'ResolveAlert cần alert hợp lệ');
      }
      if (!input.referenceId) {
        return R.err('VALIDATION', 'ResolveAlert cần referenceId trỏ tới hành động đã sửa');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var r = alertLib.resolve(input.alert, {
        actorId: ctx.actor.actorId, at: ctx.clock.now(), referenceId: input.referenceId
      });
      if (R.isErr(r)) return r;
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'alert', record: r.value });
      return R.ok(plan);
    }
  });

  return { RaiseAlert: RaiseAlert, MarkAlertSeen: MarkAlertSeen, ResolveAlert: ResolveAlert };
});
