/**
 * BusinessDay — "đang thao tác ở ngày làm việc nào".
 *
 * Đã xác nhận với chủ quán: **ngày làm việc đóng lại bằng thao tác "chốt ngày"
 * ở QUANLY sau khi kết ca**, không phải bằng một mốc giờ cố định. Vì vậy
 * `businessDate` là TRẠNG THÁI VẬN HÀNH, không phải phép tính từ đồng hồ.
 *
 * Hệ quả thiết kế:
 *   - Không hàm nào được tự suy ra businessDate từ timestamp. Ai cần biết hôm
 *     nay là ngày làm việc nào thì phải ĐỌC ngày đang mở.
 *   - Một đơn bán lúc 0h30 vẫn thuộc ngày làm việc chưa chốt, đúng như quán
 *     thật vận hành.
 *   - `status='CLOSED'` là gate chặn tạo Bill (FEATURE-TREE-V1.md §2 mục [5]).
 *
 * Đây là lý do `clock` chỉ còn `calendarDate()` — ngày trên tờ lịch — và cố ý
 * không có `businessDate()`.
 */
GIEO.define('store-context/business-day', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var STATUS = { OPEN: 'OPEN', CLOSED: 'CLOSED' };

  function businessDayId(storeId, dateKey) {
    return ids.deterministicId('shift', ['day', storeId, dateKey]);
  }

  /**
   * Mở ngày làm việc. `dateKey` do người mở chỉ định (thường là ngày lịch hiện
   * tại, nhưng không bắt buộc — quán mở muộn sau nửa đêm vẫn mở đúng ngày cũ).
   */
  function openDay(spec) {
    if (!spec) return R.err('VALIDATION', 'openDay cần spec');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'openDay cần storeId hợp lệ');
    if (!spec.clock || !spec.clock.isDateKey(spec.dateKey)) {
      return R.err('VALIDATION', 'openDay cần dateKey dạng YYYY-MM-DD');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'openDay cần actorId');
    if (typeof spec.at !== 'number') return R.err('VALIDATION', 'openDay cần thời điểm "at"');

    return R.ok({
      businessDayId: businessDayId(spec.storeId, spec.dateKey),
      storeId: spec.storeId,
      dateKey: spec.dateKey,
      status: STATUS.OPEN,
      openedAt: spec.at,
      openedBy: spec.actorId,
      closedAt: null,
      closedBy: null,
      closeOperationId: null
    });
  }

  /**
   * Chốt ngày. Chỉ QUANLY (nút chốt ngày nằm ở QUANLY — xác nhận trực tiếp).
   *
   * `blockers` là các lý do CHẶN đóng ngày do domain khác cung cấp (refill
   * checklist chưa xong, ca chưa kết...). FEATURE-TREE §2 mục [5] gọi đây là
   * `blockingClose`. Domain này không tự biết các lý do đó nên nhận vào, nhưng
   * BẮT BUỘC tôn trọng — không có tham số nào để bỏ qua.
   */
  function closeDay(day, spec) {
    if (!day) return R.err('VALIDATION', 'closeDay cần ngày làm việc');
    if (day.status === STATUS.CLOSED) {
      return R.err('PRECONDITION', 'ngày ' + day.dateKey + ' đã chốt lúc ' + day.closedAt);
    }
    if (!spec || !ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'closeDay cần actorId');
    if (!spec.operationId) return R.err('VALIDATION', 'closeDay cần operationId');
    if (typeof spec.at !== 'number') return R.err('VALIDATION', 'closeDay cần thời điểm "at"');

    var blockers = spec.blockers || [];
    if (blockers.length) {
      return R.err('PRECONDITION', 'chưa chốt được ngày ' + day.dateKey + ': ' + blockers.join('; '), {
        blockers: blockers.slice()
      });
    }

    return R.ok(Object.assign({}, day, {
      status: STATUS.CLOSED,
      closedAt: spec.at,
      closedBy: spec.actorId,
      closeOperationId: spec.operationId
    }));
  }

  /**
   * Gate: ngày đã chốt thì khoá bán (FEATURE-TREE §2 mục [5]).
   * Mọi command tạo/sửa dữ liệu vận hành phải đi qua đây.
   */
  function assertOperable(day, what) {
    if (!day) {
      return R.err('PRECONDITION', 'chưa mở ngày làm việc — không thực hiện được ' + (what || 'thao tác'));
    }
    if (day.status !== STATUS.OPEN) {
      return R.err('PRECONDITION',
        'ngày làm việc ' + day.dateKey + ' đã chốt — không thực hiện được ' + (what || 'thao tác') +
        '. Muốn sửa số liệu ngày đã chốt phải đi qua correction.');
    }
    return R.ok(day);
  }

  /** Ngày đang mở của 1 store. Nhiều ngày mở cùng lúc là sai trạng thái. */
  function findOpenDay(days, storeId) {
    var open = days.filter(function (d) { return d.storeId === storeId && d.status === STATUS.OPEN; });
    if (open.length === 0) return R.err('NOT_FOUND', 'không có ngày làm việc nào đang mở');
    if (open.length > 1) {
      return R.err('CONFLICT', 'có ' + open.length + ' ngày làm việc cùng mở: ' +
        open.map(function (d) { return d.dateKey; }).join(', ') + ' — phải chốt bớt trước');
    }
    return R.ok(open[0]);
  }

  return {
    STATUS: STATUS,
    businessDayId: businessDayId,
    openDay: openDay,
    closeDay: closeDay,
    assertOperable: assertOperable,
    findOpenDay: findOpenDay
  };
});
