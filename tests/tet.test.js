// Bản Tết 2027 (index_tet / pos_tet / PosX_tet) phải sinh từ bản BÌNH THƯỜNG hiện tại bằng tools/tao_ban_tet.js,
// và chỉ CHÈN thêm (pos / PosX) hoặc chèn + đổi màu (index) — logic / id / chữ cũ giữ nguyên.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const T = require('../tools/tao_ban_tet.js');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
const rd = f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : null;

for (const [nguon, dich, fn] of T.BAN) chk(rd(dich) === fn(rd(nguon)), dich + ' khớp ' + nguon + ' hiện tại (lệch → chạy: node tools/tao_ban_tet.js)');
chk(T.BAN.length === 3, 'sinh đủ 3 bản (index_tet, pos_tet, PosX_tet)');

const boChen = h => h.replace(/\n<!-- BẢN TẾT 2027[^\n]*-->/, '')
  .replace(/<!-- \[LÌ XÌ TẾT 2027\][^\n]*-->\n<script src="lixi\.v1\.js"><\/script>\n<script>\n[\s\S]*?\n<\/script>\n<\/body>/, '</body>');
const pos = rd('pos_tet.html'), posx = rd('PosX_tet.html'), idx = rd('index_tet.html');
chk(/<script src="lixi\.v1\.js"><\/script>/.test(pos) && /<script src="lixi\.v1\.js"><\/script>/.test(posx) && /<script src="lixi\.v1\.js"><\/script>/.test(idx), 'cả 3 bản nạp lixi.v1.js');
chk(!/lixi\.v\d+\.js/.test(rd('pos.html') + rd('PosX.html') + rd('index.html')), 'bản bình thường KHÔNG có lì xì');
const posBo = boChen(pos).replace(/\n            if \(window\.lixiAfterPaid\) \{[^\n]*\n/, '\n');
chk(posBo === rd('pos.html'), 'pos_tet = pos.html + phần chèn (không sửa / xoá gì)');
chk(boChen(posx) === rd('PosX.html'), 'PosX_tet = PosX.html + phần chèn (không sửa / xoá gì)');
chk(/lixiAfterPaid\(normalizedSdt, finalSdt, orderData\)/.test(pos), 'pos_tet: móc sau khi đơn lưu thành công (_pushPaidOrder)');

// index: ngoài phần chèn chỉ khác mã màu; khối Bé Gạo được thay riêng (dê) — so phần còn lại
const BG = /<!-- \[BÉ GẠO\][\s\S]*?<!-- \[\/BÉ GẠO\] -->\n?/;
const mau = x => x.replace(/#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g, '#M')
  .replace(/\b(rgba?\(\s*)\d{1,3}(\s*,\s*)\d{1,3}(\s*,\s*)\d{1,3}/g, '$1M$2M$3M')
  .replace(/-(green|emerald|teal|lime|amber|rose)-(\d{2,3})\b/g, '-M-$2');
let ib = boChen(idx).replace(BG, '')
  .replace(/\n  <!-- \[TẾT 2027\] tông đỏ đô[\s\S]*?<\/style>/, '')
  .replace(/\n    <div class="lc-maifall"[\s\S]*?<\/script>/, '')
  .replace(/\n      <!-- \[TẾT 2027\] TÚI LÌ XÌ[^\n]*\n      <div id="lx-card"[^\n]*\n/, '')
  .replace('<span class="lc-spark">✿︎</span><span class="lc-spark sm">✿︎</span>', '<span class="lc-spark">✳</span><span class="lc-spark sm">✳</span>')
  .replace('<span class="lc-tet">Chúc Mừng Năm Mới</span> · Ba chốn quen', 'Một tài khoản · Ba chốn quen');
chk(mau(ib) === mau(rd('index.html').replace(BG, '')), 'index_tet: ngoài phần chèn chỉ khác mã màu so với index.html');
chk(!/#006241/i.test(idx), 'index_tet: không sót màu xanh lá chính');
const kb = (idx.match(BG) || [''])[0];
const png = fs.readFileSync(path.join(ROOT, 'tools/be_gao/be_gao_tet_sheet.png')).toString('base64');
chk(kb.includes(png) && kb.includes('demNgayTet') && kb.includes('nhacLiXi'), 'Bé Gạo dê: đúng hình + câu chúc / đếm ngày / nhắc lì xì');
chk(idx.includes('id="lx-card"') && idx.includes("LiXi.open(phone(), lastVisit())"), 'index_tet: thẻ Túi lì xì + mở bao');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
