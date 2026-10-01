// Chức năng làm việc của nhân viên (pha chế/order): Quản lý lưu `roles` cố định trong hồ sơ,
// POS chụp bản sao vào employee_shifts lúc check-in (như payTerms) để sửa hồ sơ sau này không đổi lịch sử.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };

// ── POS: check-in ghi roles vào ca ──
const checkin = async emp => {
  const written = []; const cache = [];
  const src = extract('posgieo.html', ['_doCheckInImpl']);
  const names = ['resolveStaffPinField', '_employeeShiftsOf', 'toast', 'posDateKey', 'fstore', '_employeeShiftsTodayCache', 'document', 'renderCheckinBlock'];
  const fn = new Function(...names, src + '\nreturn _doCheckInImpl;');
  const run = fn(() => emp, () => [], () => {}, () => '2026-09-30',
    { collection: () => ({ add: async d => { written.push(d); return { id: 'S1' }; } }) }, cache,
    { getElementById: () => ({ value: '' }) }, () => {});
  await run();
  return { written, cache };
};
(async () => {
  let r = await checkin({ id: 'e1', fullName: 'An', roles: ['barista', 'order'], payType: 'fixed' });
  eq(r.written[0].roles, ['barista', 'order'], 'POS: ca ghi đủ chức năng của hồ sơ');
  eq(r.cache[0].roles, ['barista', 'order'], 'POS: cache ca trong RAM cũng có chức năng');
  r = await checkin({ id: 'e2', fullName: 'Bình' });
  eq(r.written[0].roles, [], 'POS: hồ sơ chưa khai chức năng → mảng rỗng, không lỗi');
  r = await checkin({ id: 'e3', fullName: 'Chi', roles: 'barista' });
  eq(r.written[0].roles, [], 'POS: roles sai kiểu → bỏ');
  r = await checkin({ id: 'e4', fullName: 'Dũng', roles: ['barista', '', 5] });
  eq(r.written[0].roles, ['barista'], 'POS: chỉ giữ chuỗi hợp lệ');

  // ── Quản lý: đọc/hiện chức năng ──
  const q = extract('quanlygieo.html', ['nvRolesOf', 'nvRolesLabel']);
  const { nvRolesOf, nvRolesLabel } = new Function(q.replace(/^/, "const NV_ROLES=[{key:'barista',label:'Pha chế'},{key:'order',label:'Order'}];\n") + '\nreturn {nvRolesOf,nvRolesLabel};')();
  eq([nvRolesOf(null), nvRolesOf({}), nvRolesOf({ roles: ['order', 'khac'] })], [[], [], ['order']], 'QL: roles thiếu/lạ → bỏ');
  eq([nvRolesLabel({ roles: ['barista', 'order'] }), nvRolesLabel({})], ['Pha chế + Order', 'chưa khai chức năng'], 'QL: nhãn hiển thị');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
