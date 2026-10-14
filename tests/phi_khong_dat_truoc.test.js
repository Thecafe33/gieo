// Phí không đặt trước 10K (chủ dự án 14/10/2026): quán cần ~15 phút để nhận lịch, chuẩn bị nước, dọn bed.
// index.html: đặt < 15 phút trước giờ bắt đầu → không chặn, báo phí. pos.html: cộng phí khi nhận bed.
'use strict';
process.env.TZ = 'Asia/Ho_Chi_Minh';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

// ---- POS
const P = new Function("var _PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'; var NO_PREBOOK_MIN = 15;\n"
  + extract('pos.html', ['_parseDateKey', '_pushKeyTimeMs', '_bookingCreatedMs', '_bookingStartMs', '_noPrebookFeeReason'])
  + '\nreturn _noPrebookFeeReason;')();
const T = (h, m) => new Date(2026, 9, 14, h, m).getTime();
const iso = ms => new Date(ms).toISOString();
eq(!!P({ type: 'walk-in', date: '14/10/2026', start: '11:16' }, T(11, 11)), true, 'Lịch tạo ở quầy (walk-in) → luôn tính phí');
eq(!!P({ noPrebookFee: 10000, date: '14/10/2026', start: '11:40', createdAt: iso(T(11, 0)) }, T(11, 40)), true, 'App: khách đã đồng ý phí → tính');
eq(!!P({ date: '14/10/2026', start: '11:16', createdAt: iso(T(11, 11)) }, T(11, 16)), true, 'Đặt 11:11 cho 11:16 (5 phút) → tính');
eq(!!P({ date: '14/10/2026', start: '11:30', createdAt: iso(T(11, 14)) }, T(11, 18)), true, 'Đặt 11:14 cho 11:30 (16 phút) nhưng tới nhận bed 11:18 → tính');
eq(P({ date: '14/10/2026', start: '11:30', createdAt: iso(T(11, 0)) }, T(11, 25)), '', 'Đặt 11:00 cho 11:30, tới 11:25 → không tính');
eq(P({ date: '2026-10-14', start: '15:00', createdAt: iso(T(9, 0)) }, T(14, 50)), '', 'Đặt từ sáng cho buổi chiều → không tính');
eq(P({ date: '14/10/2026', start: '11:30' }, T(11, 25)), '', 'Không biết lúc đặt (không createdAt, không mã push) → không đoán, không tính');

// ---- App khách
const I = new Function(extract('index.html', ['_bdP2', '_bdMin', '_vnTodayParts', '_vnTodayYmd', '_noPrebookMinsLeft']) + '\nreturn _noPrebookMinsLeft;')();
const now = Date.UTC(2026, 9, 14, 4, 11); // 11:11 giờ VN
eq(I('2026-10-14', '11:16', now), 5, 'Bây giờ 11:11, đặt 11:16 → còn 5 phút (sẽ báo phí)');
eq(I('2026-10-14', '11:30', now), 19, 'Đặt 11:30 → còn 19 phút (không báo)');
eq(I('2026-10-15', '08:00', now), null, 'Ngày mai → không xét');
console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
