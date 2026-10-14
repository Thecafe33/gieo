// Chuông bed POS (chủ dự án 14/10/2026): lịch chờ nhận bed + bed đang dùng sắp hết giờ (≤ 10 phút) / quá giờ.
'use strict';
process.env.TZ = 'Asia/Ho_Chi_Minh';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

const F = new Function(extract('pos.html', ['_bellSt', '_bellIsWaiting', '_bellIsActive', '_bellMinsLeft'])
  + '\nreturn { w: _bellIsWaiting, a: _bellIsActive, left: _bellMinsLeft };')();
const T = (h, m, s) => new Date(2026, 9, 14, h, m, s || 0).getTime();

eq(F.w({ status: 'chờ xếp bed', bedId: '' }), true, 'Chưa có bed → chờ nhận');
eq(F.w({ status: 'chờ khách', bedId: 'WAITING' }), true, 'bedId WAITING → chờ nhận');
eq(F.w({ status: 'đã hủy' }), false, 'Đã huỷ → không');
eq(F.w({ status: 'active', bedId: 2 }), false, 'Đang dùng → không thuộc chờ nhận');
eq(F.a({ status: 'active', bedId: 2 }), true, 'active → đang dùng');
eq(F.a({ status: 'đã xong', bedId: 2 }), false, 'Đã xong → không');

eq(F.left({ start: '13:00', end: '14:00' }, T(13, 50)), 10, 'Còn đúng 10 phút → vào mốc báo');
eq(F.left({ start: '13:00', end: '14:00' }, T(13, 52, 30)), 7, 'Còn 7 phút 30 giây → 7');
eq(F.left({ start: '13:00', end: '14:00' }, T(14, 3, 30)), -3, 'Quá 3 phút 30 giây → -3');
eq(F.left({ checkInTime: '23:00', start: '23:00', end: '01:00' }, T(23, 30)), 90, 'Qua nửa đêm: 23:30, trả 01:00 → còn 90 phút');
eq(F.left({ start: '13:00', end: '--:--' }, T(13, 0)), null, 'Không có giờ trả → bỏ qua');
console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
