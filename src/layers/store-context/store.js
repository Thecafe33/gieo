/**
 * Organization + Store — invariant #10 ("Store là first-class boundary").
 *
 * Đã chốt với chủ hệ thống: legacy 100% single-store (grep không ra storeId nào),
 * giai đoạn này CHỈ CHỪA CHỖ — `storeId` có mặt trong mọi entity/query nhưng chỉ
 * có 1 giá trị thật, và KHÔNG xây aggregation ALL_STORES.
 *
 * Lý do vẫn bắt buộc mang storeId ngay từ đầu thay vì thêm sau: thêm sau nghĩa là
 * sửa mọi query, mọi path, mọi ledger entry đã ghi — và dữ liệu cũ thì không có
 * gì để điền vào. Chừa chỗ rẻ, nhồi vào sau thì không.
 */
GIEO.define('store-context/store', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  function createOrganization(spec) {
    if (!spec || !spec.name) return R.err('VALIDATION', 'organization cần name');
    return R.ok({
      organizationId: spec.organizationId || ids.newId('org'),
      name: String(spec.name),
      createdAt: spec.createdAt || null
    });
  }

  function createStore(spec) {
    if (!spec || !spec.name) return R.err('VALIDATION', 'store cần name');
    if (!ids.isId(spec.organizationId, 'org')) {
      return R.err('VALIDATION', 'store cần organizationId hợp lệ');
    }
    return R.ok({
      storeId: spec.storeId || ids.newId('store'),
      organizationId: spec.organizationId,
      name: String(spec.name),
      /* Múi giờ ảnh hưởng businessDate; giữ trên Store để nhiều cửa hàng khác
         múi giờ không phải sửa lại clock sau này. */
      timezone: spec.timezone || 'Asia/Ho_Chi_Minh',
      createdAt: spec.createdAt || null
    });
  }

  return {
    createOrganization: createOrganization,
    createStore: createStore
  };
});
