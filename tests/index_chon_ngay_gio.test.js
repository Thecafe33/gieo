// index.html (app khách The Cafe 33) — chip chọn ngày, thanh số giờ, vòng đếm ngược khi đang dùng bed (13/10/2026).
'use strict';
process.env.TZ = 'America/New_York';   // máy để múi giờ khác vẫn phải ra ngày VN
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const f = new Function(extract('index.html', ['_bdP2', '_bdMin', '_bdHm', '_bdDurLabel', '_bdMaxDur', '_bavTimeToMin', '_bavRingFrac'])
  + '\nreturn { _bdMin, _bdHm, _bdDurLabel, _bdMaxDur, _bavRingFrac };')();
eq([30, 60, 90, 150, 390].map(f._bdDurLabel), ['30 phút', '1 giờ', '1 giờ 30 phút', '2 giờ 30 phút', '6 giờ 30 phút'], 'Nhãn số giờ theo nấc 30 phút');
eq(f._bdDurLabel(130), '2 giờ 10 phút', 'Giờ lẻ nhập tay vẫn hiện đúng');
eq([f._bdMin('14:05'), f._bdMin(''), f._bdHm(14 * 60 + 150)], [845, null, '16:30'], 'Đổi giờ ↔ phút');
eq(f._bdMaxDur(14 * 60, 1250), 390, 'Bắt đầu 14:00, đóng nhận bed 20:50 → tối đa 6 giờ 30 (bội 30 phút)');
eq(f._bdMaxDur(20 * 60 + 30, 1250), 0, 'Bắt đầu 20:30 → không đủ 30 phút');
eq(f._bavRingFrac(60 * 60000, '14:00', '16:00'), 0.5, 'Vòng: còn 1 giờ / tổng 2 giờ = nửa vòng');
eq(f._bavRingFrac(-5 * 60000, '14:00', '16:00'), 0, 'Quá giờ → 0 (vòng đỏ đầy do isOver)');
eq(f._bavRingFrac(10 * 60000, '', '16:00'), 1, 'Thiếu giờ vào → không chia, coi như đầy');
// "Hôm nay" theo giờ VN, máy khách để múi giờ khác vẫn đúng
const g = new Function(extract('index.html', ['_vnTodayParts', '_vnTodayYmd']) + '\nreturn _vnTodayYmd;')();
eq(g(Date.UTC(2026, 9, 12, 18, 30)), '2026-10-13', '01:30 sáng 13/10 giờ VN (UTC vẫn 12/10) → hôm nay là 13/10');
eq(g(Date.UTC(2026, 9, 13, 16, 59)), '2026-10-13', '23:59 tối 13/10 giờ VN → vẫn 13/10');
eq(g(Date.UTC(2026, 11, 31, 17, 0)), '2027-01-01', 'Giao thừa: 00:00 1/1 giờ VN → sang năm mới');
console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
