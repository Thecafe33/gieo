// Bản Giáng sinh (index_giangsinh.html) phải sinh từ index.html HIỆN TẠI bằng tools/tao_ban_giangsinh.js (chỉ đổi giao diện)
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
// ngoài phần chèn, chỉ được khác MÃ MÀU (logic / id / chữ trong app giữ nguyên)
const mau = x => x.replace(/#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g, '#M')
  .replace(/\b(rgba?\(\s*)\d{1,3}(\s*,\s*)\d{1,3}(\s*,\s*)\d{1,3}/g, '$1M$2M$3M')
  .replace(/-(green|emerald|teal|lime|sky)-(\d{2,3})\b/g, '-M-$2');
const bo = moi.replace(/\n<!-- BẢN GIÁNG SINH[^\n]*-->/, '')
  .replace(/\n  <!-- \[GIÁNG SINH\][\s\S]*?<\/style>/, '')
  .replace(/\n    <div class="lc-snow"[\s\S]*?<\/script>/, '')
  .replace(/\n    <!-- \[GIÁNG SINH\] tuyết trong app -->[\s\S]*?<\/script>/, '')
  .replace('<span class="lc-spark">❄\uFE0E</span><span class="lc-spark sm">❄\uFE0E</span>', '<span class="lc-spark">✳</span><span class="lc-spark sm">✳</span>')
  .replace('<span class="lc-xm">Merry Christmas</span> · Ba chốn quen', 'Một tài khoản · Ba chốn quen');
chk(mau(bo) === mau(goc), 'ngoài phần chèn chỉ khác mã màu so với index.html');
chk(!/#006241|rgba\(0,98,65/i.test(moi), 'không còn sót màu xanh lá chính (#006241)');
chk(moi.includes('id="app-snow"'), 'có tuyết trong app');
chk(moi.includes('id="app-orn"') && (moi.match(/class="lc-tree t\d"/g) || []).length === 3, 'có quả châu trong app + 3 cây thông ở màn đăng nhập');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
