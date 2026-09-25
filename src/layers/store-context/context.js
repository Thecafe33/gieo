/**
 * StoreContext — "đang thao tác ở store nào, ai thao tác, bằng quyền gì".
 *
 * Mọi command và mọi read đều nhận context này. Không có context = không biết
 * actor = không audit được (POS-QUANLY-PERMISSION-CONTRACT-V1.md §25).
 *
 * Gap đang đóng: legacy KHÔNG lưu actor trên Bill (`soldByActorId`) — ngoại lệ
 * duy nhất trong toàn hệ thống, tức là không trả lời được "ai bán đơn này"
 * (FEATURE-TREE-V1.md §4.7). Bắt buộc actor trong context chặn tận gốc khả năng
 * một mutation đi qua mà không có người chịu trách nhiệm.
 *
 * `businessDate` không được tự suy ra cho giao dịch. Context xác thực ban đầu
 * có thể chưa mang businessDay: nhân viên đăng nhập/check-in chính là sự kiện
 * mở ngày. Sau CheckIn, UI thay context bằng context mang ngày vừa mở. Mọi
 * command vận hành khác vẫn bị assertOperable chặn khi chưa có ngày.
 */
GIEO.define('store-context/context', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'shared-kernel/clock',
  'store-context/access',
  'store-context/business-day'
], function (ids, R, clockLib, access, businessDay) {
  'use strict';

  /**
   * @param spec.organizationId, spec.storeId
   * @param spec.actor        kết quả access.createActor()
   * @param spec.source       POS | QUANLY | SYSTEM
   * @param spec.deviceId, spec.appInstanceId   truy vết máy nào gây ra thao tác
   * @param spec.businessDay  ngày đang mở; được phép null ở phiên pre-check-in
   * @param spec.clock        tiêm được để test; mặc định clock thật
   * @param spec.featureFlags bật/tắt đường mới trong giai đoạn shadow
   */
  function createContext(spec) {
    if (!spec) return R.err('VALIDATION', 'context cần spec');
    if (!ids.isId(spec.organizationId, 'org')) return R.err('VALIDATION', 'context cần organizationId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'context cần storeId hợp lệ');
    if (!spec.actor || !ids.isId(spec.actor.actorId, 'actor')) {
      return R.err('VALIDATION', 'context cần actor hợp lệ — mọi mutation phải có actorId');
    }
    if (!access.SOURCE[spec.source]) return R.err('VALIDATION', 'context cần source hợp lệ');
    if (spec.actor.source !== spec.source) {
      return R.err('VALIDATION', 'actor.source (' + spec.actor.source + ') khác context.source (' + spec.source + ')');
    }

    /* Context chưa có ngày chỉ là phiên đã xác thực trước check-in. Nó không
       làm ngày giả; assertOperable bên dưới sẽ chặn mọi command vận hành. */
    var day = spec.businessDay;
    if (day && !day.dateKey) return R.err('VALIDATION', 'businessDay cần dateKey');
    if (day && day.storeId !== spec.storeId) {
      return R.err('VALIDATION', 'businessDay thuộc store khác với context');
    }

    var clock = spec.clock || clockLib.createClock();
    var flags = spec.featureFlags || {};

    var ctx = {
      organizationId: spec.organizationId,
      storeId: spec.storeId,
      actor: spec.actor,
      source: spec.source,
      deviceId: spec.deviceId || null,
      appInstanceId: spec.appInstanceId || null,
      clock: clock,
      businessDay: day,
      businessDate: day ? day.dateKey : null,
      featureFlags: flags,

      /** Cổng quyền cho command layer. Đường DUY NHẤT để hỏi "được làm không". */
      authorize: function (commandName, targetStoreId) {
        return access.authorize(spec.actor, commandName, targetStoreId || spec.storeId);
      },

      /**
       * Phần audit chung cho mọi mutation (§25). Command bổ sung
       * command/reason/before/calculation/mutation/after/status.
       */
      auditBase: function (operationId) {
        return {
          operationId: operationId,
          actorId: spec.actor.actorId,
          source: spec.source,
          organizationId: spec.organizationId,
          storeId: spec.storeId,
          deviceId: spec.deviceId || null,
          timestamp: clock.now(),
          businessDate: day ? day.dateKey : null
        };
      },

      /** Gate "ngày đã chốt thì khoá bán" — mọi command vận hành gọi trước khi ghi. */
      assertOperable: function (what) { return businessDay.assertOperable(day, what); },

      flag: function (name) { return !!flags[name]; }
    };

    return R.ok(ctx);
  }

  /**
   * Context hệ thống — cho tiến trình nền (compaction, purge, scheduled job).
   * §26: compaction là system process, POS/QUANLY không tự xoá raw FIFO.
   */
  function createSystemContext(spec) {
    var actorR = access.createActor({
      actorId: (spec && spec.actorId) || ids.deterministicId('actor', ['system']),
      role: 'SYSTEM_ADMIN',
      source: 'SYSTEM',
      stores: [spec && spec.storeId]
    });
    if (R.isErr(actorR)) return actorR;
    return createContext({
      organizationId: spec.organizationId,
      storeId: spec.storeId,
      actor: actorR.value,
      source: 'SYSTEM',
      businessDay: spec.businessDay,
      clock: spec.clock,
      featureFlags: spec.featureFlags
    });
  }

  return {
    createContext: createContext,
    createSystemContext: createSystemContext
  };
});
