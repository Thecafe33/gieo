// [CK TC33 25/10] pos.html (The Cafe 33) chuyển khoản theo luồng posgieo: VietQR Cake (tài khoản Gieo)
// + bank_confirmations do webhook Cloud Run processCakePayment ghi. PayOS bỏ hẳn (chủ dự án 25/10).
const fs = require('fs'); const path = require('path');
const { extract } = require('./lib/extract');
const ROOT = path.resolve(__dirname, '..');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

const { genBankOrderId } = new Function(extract('pos.html', ['genBankOrderId']) + '\nreturn { genBankOrderId };')();
const id = genBankOrderId();
chk(/^TC33\d{10}$/.test(id), 'mã CK = TC33 + ddMMHHmmss (' + id + ')');

// Webhook nhận mã bằng /TTHD ([A-Z]{2}\d+)/ (docs/KE_HOACH_DA_CUA_HANG.md 4.1) → phải ra đúng nguyên mã.
const m = /TTHD ([A-Z]{2}\d+)/.exec('Chuyen tien TTHD ' + id + ' tu NGUYEN VAN A');
chk(m && m[1] === id, 'webhook đọc lại đúng nguyên mã từ nội dung CK');
chk(!/^GG/.test(id) && !/^DH/.test(id), 'không trùng tiền tố Gieo (GG) / XOFA (DH) — dọn dữ liệu quanlygieo (/^GG/) không đụng');

const src = fs.readFileSync(path.join(ROOT, 'pos.html'), 'utf8');
chk(!/payment_events|createPayment|PayOS/i.test(src.replace(/\/\/[^\n]*/g, '')), 'pos.html không còn gọi PayOS / payment_events');
chk(/img\.vietqr\.io\/image\/cake-\$\{CAKE_ACCOUNT_NO\}/.test(src), 'QR VietQR Cake');
const acc = s => (/const CAKE_ACCOUNT_NO = '(\d+)'/.exec(s) || [])[1];
chk(acc(src) && acc(src) === acc(fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8')), 'cùng số tài khoản với posgieo');
chk(/db\.ref\('bank_confirmations\/' \+ orderId\)\.remove\(\)/.test(src), 'xoá bank_confirmations sau khi dùng (như posgieo)');

console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
