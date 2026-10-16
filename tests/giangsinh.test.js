// Bản Giáng sinh (index_giangsinh.html) phải sinh từ index.html HIỆN TẠI bằng tools/tao_ban_giangsinh.js (chỉ đổi giao diện)
// → sửa index.html mà quên sinh lại thì test này báo (tới mùa bật lên không bị thành app cũ thiếu tính năng).
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { taoGiangSinh, BE_GAO, BE_GAO_RE, GAU_NOEL } = require('../tools/tao_ban_giangsinh.js');
const gocDu = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const goc = gocDu.replace(BE_GAO_RE, '');   // khối Bé Gạo bản Giáng sinh được thay riêng (hình cây thông, câu nói) — kiểm riêng bên dưới
const moi = taoGiangSinh(gocDu);
const co = fs.existsSync(path.join(ROOT, 'index_giangsinh.html')) ? fs.readFileSync(path.join(ROOT, 'index_giangsinh.html'), 'utf8') : null;
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
chk(co === moi, 'index_giangsinh.html khớp index.html hiện tại (lệch → chạy: node tools/tao_ban_giangsinh.js)');
for (const id of ['id="login-screen"', 'id="login-sdt"', 'id="btn-login"', 'login()', 'showRegister()', 'id="login-xmas"', 'id="lc-snow"'])
  chk(moi.includes(id), 'bản Giáng sinh có ' + id);
// ngoài phần chèn, chỉ được khác MÃ MÀU (logic / id / chữ trong app giữ nguyên)
const mau = x => x.replace(/#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g, '#M')
  .replace(/\b(rgba?\(\s*)\d{1,3}(\s*,\s*)\d{1,3}(\s*,\s*)\d{1,3}/g, '$1M$2M$3M')
  .replace(/-(green|emerald|teal|lime|sky)-(\d{2,3})\b/g, '-M-$2');
const bo = moi.replace(GAU_NOEL + '</body>', '</body>').replace(/\n<!-- BẢN GIÁNG SINH[^\n]*-->/, '')
  .replace(/\n  <!-- \[GIÁNG SINH\][\s\S]*?<\/style>/, '')
  .replace(/\n    <div class="lc-snow"[\s\S]*?<\/script>/, '')
  .replace(/\n    <!-- \[GIÁNG SINH\] tuyết trong app -->[\s\S]*?<\/script>/, '')
  .replace('<span class="lc-spark">❄\uFE0E</span><span class="lc-spark sm">❄\uFE0E</span>', '<span class="lc-spark">✳</span><span class="lc-spark sm">✳</span>')
  .replace('<span class="lc-xm">Merry Christmas</span> · Ba chốn quen', 'Một tài khoản · Ba chốn quen');
chk(mau(bo.replace(BE_GAO_RE, '')) === mau(goc), 'ngoài phần chèn chỉ khác mã màu so với index.html');
if (BE_GAO) {
  const kb = (moi.match(BE_GAO_RE) || [''])[0];
  chk(kb.includes('demNgayNoel') && kb.includes('bgp-glow') && kb.includes('height:50px'), 'Bé Gạo Giáng sinh: đếm ngày Noel + sao lấp lánh + khung 40×50');
  const png = fs.readFileSync(path.join(ROOT, 'tools/be_gao/be_gao_giangsinh_sheet.png')).toString('base64');
  chk(kb.includes(png), 'Bé Gạo Giáng sinh dùng đúng hình cây thông (be_gao_giangsinh_sheet.png)');
  // đếm ngày: chạy thử hàm với vài ngày (giờ VN)
  const fnSrc = kb.match(/function demNgayNoel\(\) \{[\s\S]*?\n  \}/)[0];
  const thu = (iso) => { const realNow = Date.now; Date.now = () => Date.parse(iso); try { return (new Function(fnSrc + '; return demNgayNoel();'))(); } finally { Date.now = realNow; } };
  chk(thu('2026-10-15T03:00:00Z') === 'Còn 71 ngày nữa là Giáng sinh rồi đó!', 'đếm ngày 15/10 → còn 71 ngày');
  chk(thu('2026-12-24T02:00:00Z') === 'Tối nay là đêm Noel rồi đó!', '24/12 → đêm Noel');
  chk(thu('2026-12-24T18:00:00Z') === 'Merry Christmas! Giáng sinh vui vẻ nha!', '25/12 1 giờ sáng giờ VN (24/12 UTC) → đã là Giáng sinh');
  chk(thu('2026-12-27T05:00:00Z') === 'Giáng sinh vui vẻ! Năm mới ghé 33 nha!', 'sau Giáng sinh → chúc năm mới');
}
chk(!/#006241|rgba\(0,98,65/i.test(moi), 'không còn sót màu xanh lá chính (#006241)');
chk(moi.includes('id="app-snow"'), 'có tuyết trong app');
chk(!GAU_NOEL || (moi.split('gau_noel_giangsinh.v2.js" data-quan="khach"').length === 2), 'gắn quay trúng gấu Noel (1 thẻ script data-quan="khach")');
chk(moi.includes('id="app-orn"') && (moi.match(/class="lc-tree t\d"/g) || []).length === 3, 'có quả châu trong app + 3 cây thông ở màn đăng nhập');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
