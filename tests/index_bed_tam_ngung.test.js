// index.html (app khách The Cafe 33) — thông báo "Bed đang tạm ngưng" phải ghi rõ NGÀY mở lại (sửa 13/10/2026).
// POS lưu store_status.offUntil dạng ISO UTC; trước đây app khách chỉ hiện giờ ("quay lại sau 10:00").
'use strict';
process.env.TZ = 'America/New_York';   // máy khách cài múi giờ khác vẫn phải ra giờ Việt Nam
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const f = new Function(extract('index.html', ['_storeReopenTextVN']) + '\nreturn _storeReopenTextVN;')();
const now = new Date('2026-10-13T02:00:00Z');   // 09:00 Thứ Ba 13/10 giờ VN
eq(f(new Date('2026-10-13T08:30:00Z'), now), '15:30 · Thứ Ba, 13/10/2026 (hôm nay)', 'Mở lại trong ngày');
eq(f(new Date('2026-10-14T03:00:00Z'), now), '10:00 · Thứ Tư, 14/10/2026 (ngày mai)', 'Mở lại ngày mai');
eq(f(new Date('2026-10-13T17:30:00Z'), now), '00:30 · Thứ Tư, 14/10/2026 (ngày mai)', 'Qua nửa đêm UTC → đúng ngày giờ VN');
eq(f(new Date('2026-10-15T01:00:00Z'), now), '08:00 · Thứ Năm, 15/10/2026 (ngày kia)', 'Ngày kia');
eq(f(new Date('2026-10-20T01:00:00Z'), now), '08:00 · Thứ Ba, 20/10/2026 (còn 7 ngày)', 'Xa hơn → còn N ngày');
eq(f(new Date('2026-10-14T01:00:00Z'), new Date('2026-10-13T17:30:00Z')), '08:00 · Thứ Tư, 14/10/2026 (hôm nay)', 'Khách xem lúc 00:30 ngày 14 giờ VN (UTC vẫn ngày 13) → hôm nay');
console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
