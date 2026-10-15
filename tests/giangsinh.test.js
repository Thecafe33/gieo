// Bản Giáng sinh (index_giangsinh.html) phải sinh từ index.html HIỆN TẠI bằng tools/tao_ban_giangsinh.js
// → sửa index.html mà quên sinh lại thì test này báo (tới mùa bật lên không bị thành app cũ thiếu tính năng).
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { taoGiangSinh } = require('../tools/tao_ban_giangsinh.js');
const goc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const moi = taoGiangSinh(goc);
const co = fs.existsSync(path.join(ROOT, 'index_giangsinh.html')) ? fs.readFileSync(path.join(ROOT, 'index_giangsinh.html'), 'utf8') : null;
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
chk(co === moi, 'index_giangsinh.html khớp index.html hiện tại (lệch → chạy: node tools/tao_ban_giangsinh.js)');
for (const id of ['id="login-screen"', 'id="login-sdt"', 'id="btn-login"', 'login()', 'showRegister()', 'id="login-xmas"', 'id="lc-snow"'])
  chk(moi.includes(id), 'bản Giáng sinh có ' + id);
// chỉ CHÈN thêm: bỏ các phần chèn đi thì phải ra lại đúng index.html (phần app sau đăng nhập giữ nguyên)
const bo = moi.replace(/\n<!-- BẢN GIÁNG SINH[^\n]*-->/, '')
  .replace(/\n  <!-- \[GIÁNG SINH\][\s\S]*?<\/style>/, '')
  .replace(/\n    <div class="lc-snow"[\s\S]*?<\/script>/, '')
  .replace('<span class="lc-spark">❄︎</span><span class="lc-spark sm">❄︎</span>', '<span class="lc-spark">✳</span><span class="lc-spark sm">✳</span>')
  .replace('Merry Christmas · Ba chốn quen', 'Một tài khoản · Ba chốn quen');
chk(bo === goc, 'ngoài màn đăng nhập không đổi gì so với index.html');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
