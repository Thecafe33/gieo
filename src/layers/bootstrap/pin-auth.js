/** Xác thực PIN trước khi có business day; không đọc/ghi Firebase trực tiếp. */
GIEO.define('bootstrap/pin-auth', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'store-context/access',
  'store-context/context'
], function (ids, R, access, contextLib) {
  'use strict';

  function authenticate(spec) {
    spec = spec || {};
    var pin = String(spec.pin || '');
    if (!/^\d{4}$/.test(pin)) return R.err('VALIDATION', 'PIN phải gồm đúng 4 chữ số');
    if (!ids.isId(spec.organizationId, 'org')) return R.err('VALIDATION', 'cần organizationId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'cần storeId hợp lệ');
    if (!access.SOURCE[spec.source] || spec.source === access.SOURCE.SYSTEM) {
      return R.err('VALIDATION', 'đăng nhập PIN chỉ dành cho POS hoặc QUANLY');
    }

    var matched = (spec.employees || []).filter(function (employee) {
      return employee && employee.active !== false && String(employee.pin || '') === pin;
    });
    if (matched.length === 0) return R.err('FORBIDDEN', 'PIN không đúng hoặc nhân viên đã ngừng hoạt động');
    if (matched.length > 1) {
      return R.err('CONFLICT', 'PIN bị trùng giữa nhiều nhân viên — phải sửa dữ liệu trước khi đăng nhập');
    }

    var employee = matched[0];
    if (!ids.isId(employee.employeeId, 'employee')) return R.err('VALIDATION', 'nhân viên thiếu employeeId hợp lệ');
    if (!ids.isId(employee.actorId, 'actor')) return R.err('VALIDATION', 'nhân viên thiếu actorId hợp lệ');
    if (employee.storeId !== spec.storeId) return R.err('FORBIDDEN', 'nhân viên không thuộc cửa hàng này');
    if (!employee.role) return R.err('FORBIDDEN', 'nhân viên chưa được gán vai trò');

    var actor = access.createActor({
      actorId: employee.actorId,
      role: employee.role,
      source: spec.source,
      stores: [spec.storeId],
      allStoresRead: !!employee.allStoresRead
    });
    if (R.isErr(actor)) return actor;

    /* QUANLY không được mở bằng PIN của POS_OPERATOR. Dùng authority thật thay
       vì danh sách PIN đặc biệt trong UI. */
    if (spec.source === access.SOURCE.QUANLY &&
        !access.hasAuthority(actor.value, access.AUTHORITY.REVIEW_APPROVE_CORRECT)) {
      return R.err('FORBIDDEN', 'vai trò ' + employee.role + ' không có quyền vào QUANLY');
    }

    var context = contextLib.createContext({
      organizationId: spec.organizationId,
      storeId: spec.storeId,
      actor: actor.value,
      source: spec.source,
      businessDay: spec.businessDay || null,
      clock: spec.clock,
      deviceId: spec.deviceId,
      appInstanceId: spec.appInstanceId
    });
    if (R.isErr(context)) return context;
    return R.ok({ employee: employee, actor: actor.value, context: context.value });
  }

  return { authenticate: authenticate };
});
