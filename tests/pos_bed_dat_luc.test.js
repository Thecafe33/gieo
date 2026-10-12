// pos.html (The Cafe 33) — hiện "Đặt lúc" của lịch bed theo giờ Việt Nam (sửa 12/10/2026).
// index.html ghi createdAt dạng ISO UTC (đuôi Z); lịch tạo ở POS không có createdAt → đọc mốc từ mã push Firebase.
'use strict';
process.env.TZ = 'America/New_York';   // máy cài sai múi giờ vẫn phải ra giờ Việt Nam
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const src = "var _PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';\n" + extract('pos.html', ['_pushKeyTimeMs', 'bookingCreatedAtVN']);
const f = new Function(src + '\nreturn { _pushKeyTimeMs, bookingCreatedAtVN };')();
// Mã push giả lập đúng cách Firebase sinh: 8 ký tự đầu = mốc ms (cơ số 64), 12 ký tự sau ngẫu nhiên.
const C = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const pushId = ms => { let s = ''; for (let i = 0; i < 8; i++) { s = C.charAt(ms % 64) + s; ms = Math.floor(ms / 64); } return s + 'abcdefghijkl'; };

eq(f.bookingCreatedAtVN({ createdAt: '2026-10-12T03:15:00.000Z' }), '10:15 12/10/2026', 'App (index.html): createdAt UTC 03:15Z → 10:15 giờ Việt Nam');
eq(f.bookingCreatedAtVN({ createdAt: '2026-10-11T18:30:00.000Z' }), '01:30 12/10/2026', 'Qua nửa đêm UTC → sang ngày hôm sau ở Việt Nam');
const ms = Date.UTC(2026, 9, 12, 1, 5);
eq(f._pushKeyTimeMs(pushId(ms)), ms, 'Đọc đúng mốc ms từ mã push Firebase');
eq(f.bookingCreatedAtVN({ id: pushId(ms) }), '08:05 12/10/2026', 'Lịch tạo ở POS (không có createdAt): lấy giờ từ mã push');
eq(f.bookingCreatedAtVN({ id: 'abc', createdAt: '' }), '', 'Không có createdAt, mã không phải push → để trống, không đoán');
eq(f.bookingCreatedAtVN({ createdAt: Date.UTC(2026, 9, 12, 3, 15) }), '10:15 12/10/2026', 'createdAt dạng số ms vẫn đọc được');
console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
