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
 * `businessDate` phải được CẤP VÀO, không tự tính từ đồng hồ: đã xác nhận với
 * chủ quán rằng ngày làm việc đóng bằng thao tác "chốt ngày" ở QUANLY, nên
 * nguồn sự thật là ngày đang mở (store-context/business-day), không phải giờ
 * hiện tại. Tự suy ra ngày từ timestamp là cách đẩy doanh thu sang ngày khác
 * lúc 0h dù ca chưa kết.
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
   * @param spec.businessDay  ngày làm việc ĐANG MỞ (store-context/business-day)
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

    /* Ngày làm việc là trạng thái vận hành, không phải phép tính. Thiếu nó thì
       từ chối tạo context — thà hỏng ồn ào còn hơn ghi nhầm ngày cho số liệu. */
    var day = spec.businessDay;
    if (!day || !day.dateKey) {
      return R.err('VALIDATION',
        'context cần businessDay đang mở — businessDate không được suy ra từ đồng hồ ' +
        '(ngày làm việc chốt bằng thao tác ở QUANLY)');
    }
    if (day.storeId !== spec.storeId) {
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
      businessDate: day.dateKey,
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
          businessDate: day.dateKey
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
