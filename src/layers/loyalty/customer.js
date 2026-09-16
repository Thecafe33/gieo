/**
 * Customer — định danh khách.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-LOYALTY-V1.md §1, §7.
 *
 * Giữ nguyên quyết định nghiệp vụ của legacy: khoá theo SĐT đã chuẩn hoá.
 * Đơn giản, khớp cách quán thật nhận diện khách (đọc số điện thoại tại quầy).
 *
 * Tier là CHỖ NỐI SẴN, không dựng ngay (§7 chain-trace: legacy chưa có tier,
 * chỉ có nhãn phân khúc thuần đọc-báo-cáo, không nối vào công thức tích điểm).
 * `accrualMultiplier` mặc định 1 có mặt ngay từ đầu, nên sau này bật tier lên
 * không phải sửa lại công thức tích điểm — đúng nguyên tắc "chừa vị trí nối
 * vào" của cây tính năng.
 */
GIEO.define('loyalty/customer', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  /**
   * Chuẩn hoá SĐT: 84xxx → 0xxx, bỏ khoảng trắng/dấu.
   * Giữ đúng quy ước legacy để dữ liệu khách cũ khớp được khi migrate.
   */
  function normalizePhone(raw) {
    if (typeof raw !== 'string') return null;
    var d = raw.replace(/[^0-9+]/g, '');
    if (d.indexOf('+84') === 0) d = '0' + d.slice(3);
    else if (d.indexOf('84') === 0 && d.length > 9) d = '0' + d.slice(2);
    if (!/^0\d{8,10}$/.test(d)) return null;
    return d;
  }

  function createCustomer(spec) {
    if (!spec) return R.err('VALIDATION', 'customer cần spec');
    var phone = normalizePhone(spec.phone);
    if (!phone) return R.err('VALIDATION', 'số điện thoại không hợp lệ: ' + spec.phone);
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'customer cần storeId hợp lệ');

    return R.ok({
      /* Id xác định theo SĐT: nhập lại cùng số luôn ra cùng khách, không tạo trùng. */
      customerId: ids.deterministicId('customer', [phone]),
      storeId: spec.storeId,
      phone: phone,
      name: spec.name || null,
      /* Chỗ nối cho tier — chưa dùng, nhưng có sẵn nên bật lên không phải sửa
         công thức tích điểm (§5 luồng chuẩn). */
      tier: spec.tier || 'STANDARD',
      accrualMultiplier: typeof spec.accrualMultiplier === 'number' ? spec.accrualMultiplier : 1,
      createdAt: spec.createdAt || null
    });
  }

  /** Hệ số tích điểm theo hạng. Mặc định 1 — không hạng nào thì không lợi gì. */
  function accrualMultiplierOf(customer) {
    if (!customer) return 1;
    var m = customer.accrualMultiplier;
    return typeof m === 'number' && m > 0 ? m : 1;
  }

  return {
    normalizePhone: normalizePhone,
    createCustomer: createCustomer,
    accrualMultiplierOf: accrualMultiplierOf
  };
});
