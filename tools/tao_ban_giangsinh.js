// Sinh BẢN GIÁNG SINH của app khách The Cafe 33: index.html → index_giangsinh.html
// CHỈ đổi MÀN ĐĂNG NHẬP (#login-screen): tông lạnh (xanh băng / bạc), tuyết rơi, đồi tuyết, bông tuyết thay ✳.
// Phần app sau đăng nhập, id, hàm (login(), showRegister()…) giữ nguyên 100% — chỉ CHÈN thêm, không xoá code cũ.
//
//   node tools/tao_ban_giangsinh.js              → ghi index_giangsinh.html cạnh index.html
//   node tools/tao_ban_giangsinh.js <thư mục>    → ghi vào thư mục đó (vd. thư mục deploy)
//
// Sửa index.html xong → chạy lại lệnh này (test tests/giangsinh.test.js báo nếu quên).
// Bật Giáng sinh = deploy nội dung index_giangsinh.html làm index.html; hết mùa = deploy lại index.html gốc.
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const CSS = `
  <!-- [GIÁNG SINH] tông lạnh — chỉ phủ lên màn đăng nhập, sinh bởi tools/tao_ban_giangsinh.js -->
  <style id="login-xmas">
  #login-screen{background:radial-gradient(ellipse 130% 75% at 50% 24%,#1b3d66 0%,#0d2342 40%,#061229 76%,#030914 100%);color:#f2f8ff}
  body:has(#login-screen:not(.hidden)){background:#030914!important}
  html:has(#login-screen:not(.hidden)){background:#030914}
  body.lc-on{background:#030914!important}
  #login-screen:after{background:radial-gradient(ellipse 85% 70% at 50% 40%,transparent 45%,rgba(2,6,16,.55) 80%,rgba(1,4,12,.88) 100%)}
  #login-screen .lc-b1>i{background:radial-gradient(circle at 40% 40%,#8fd3ff 0%,#2a5f9e 55%,transparent 100%);opacity:.24}
  #login-screen .lc-b2>i{background:radial-gradient(circle at 60% 40%,#b8c8ff 0%,#2b3f8a 60%,transparent 100%);opacity:.2}
  #login-screen .lc-b3>i{background:radial-gradient(circle,#c9f1ff 0%,#24548a 65%,transparent 100%);opacity:.12}
  #login-screen .lc-b4>i{background:radial-gradient(circle,#9fe7ff 0%,#163a66 70%,transparent 100%);opacity:.12}
  #login-screen .lc-star{background:#eef7ff;box-shadow:0 0 6px #bfe0ff}
  #login-screen .lc-shoot{background:linear-gradient(90deg,transparent,#eef7ffcc)}
  #login-screen .lc-gieo-img,#login-screen .lc-xofa-img{filter:drop-shadow(0 0 14px rgba(150,205,255,.3))}
  #login-screen .lc-logo,#login-screen .lc-xofa{text-shadow:0 0 22px rgba(150,205,255,.45)}
  #login-screen .lc-cosmos:before{background:radial-gradient(ellipse at center,rgba(120,180,255,.24) 0%,rgba(60,110,200,.12) 40%,transparent 70%)}
  #login-screen .lc-33{background:linear-gradient(115deg,#e8f4ff 0%,#b9d3ef 22%,#ffffff 30%,#a6c8ec 38%,#ffffff22 52%,#86b2e0 70%,#f0f8ff 88%);background-size:260% 100%;-webkit-background-clip:text;background-clip:text;
    filter:drop-shadow(0 0 26px rgba(150,200,255,.32)) drop-shadow(0 16px 24px rgba(0,10,30,.5))}
  #login-screen .lc-ring{border-color:rgba(214,232,255,.42);box-shadow:0 0 16px rgba(160,205,255,.2)}
  #login-screen .lc-ring.b{border-color:rgba(214,232,255,.18)}
  #login-screen .lc-planet{background:radial-gradient(circle at 35% 35%,#ffffff,#cfe8ff 45%,#6fa8e6 100%);box-shadow:0 0 14px 4px rgba(170,215,255,.55)}
  #login-screen .lc-run.slow .lc-planet{background:#eaf4ff;box-shadow:0 0 10px 3px rgba(220,236,255,.5)}
  #login-screen .lc-spark{color:#e6f2ff;text-shadow:0 0 18px rgba(200,228,255,.85)}
  #login-screen .lc-eyebrow{color:#bcd6f2}
  #login-screen .lc-h1{color:#f5faff}
  #login-screen .lc-h1 span{color:#a9d2ff}
  #login-screen .lc-caption{color:#cfe0f3}
  #login-screen .lc-caption i{background:#9cc3ea}
  #login-screen #login-sdt{background:rgba(255,255,255,.08);border-color:rgba(170,210,255,.3)}
  #login-screen #login-sdt:focus{border-color:rgba(190,225,255,.7);background:rgba(255,255,255,.12);box-shadow:0 0 0 4px rgba(140,195,255,.14)}
  #login-screen #btn-login{background:linear-gradient(135deg,rgba(110,175,235,.95) 0%,rgba(38,92,160,.97) 100%)!important;box-shadow:0 0 30px rgba(90,160,240,.32),0 6px 18px rgba(0,0,0,.4)}
  #login-screen .lc-reg-q{color:rgba(225,238,255,.5)}
  #login-screen .lc-reg{color:#a8d6ff;text-shadow:0 0 12px rgba(150,205,255,.4)}
  #login-screen .lc-footer{color:rgba(214,230,250,.42)}
  /* tuyết rơi: mỗi bông chỉ animate transform (GPU), dựng 1 lần; màn đăng nhập ẩn (display:none) = dừng hẳn */
  #login-screen .lc-snow{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  #login-screen .lc-flake{position:absolute;top:-12px;left:var(--x);width:var(--s);height:var(--s);border-radius:50%;background:#fff;opacity:var(--o);animation:lc-fall1 var(--d) linear var(--dl) infinite}
  #login-screen .lc-flake.w2{animation-name:lc-fall2} #login-screen .lc-flake.w3{animation-name:lc-fall3}
  /* 1 lớp / bông, rơi + lắc gộp trong 1 keyframes; KHÔNG dùng var() trong keyframes (có var() thì không lên GPU được) */
  @keyframes lc-fall1{0%{transform:translate3d(0,0,0)}25%{transform:translate3d(12px,26vh,0)}50%{transform:translate3d(-6px,52vh,0)}75%{transform:translate3d(10px,78vh,0)}100%{transform:translate3d(-4px,105vh,0)}}
  @keyframes lc-fall2{0%{transform:translate3d(0,0,0)}25%{transform:translate3d(-16px,26vh,0)}50%{transform:translate3d(8px,52vh,0)}75%{transform:translate3d(-12px,78vh,0)}100%{transform:translate3d(6px,105vh,0)}}
  @keyframes lc-fall3{0%{transform:translate3d(0,0,0)}25%{transform:translate3d(22px,26vh,0)}50%{transform:translate3d(4px,52vh,0)}75%{transform:translate3d(24px,78vh,0)}100%{transform:translate3d(2px,105vh,0)}}
  /* đồi tuyết mờ ở đáy — nhạt để chữ chân trang vẫn đọc rõ */
  #login-screen .lc-hills{position:absolute;left:0;right:0;bottom:0;height:120px;z-index:0;pointer-events:none}
  #login-screen .lc-hills svg{display:block;width:100%;height:100%}
  @media(min-width:800px){#login-screen .lc-hills{height:170px}}
  </style>`;

const SNOW = `
    <div class="lc-snow" id="lc-snow" aria-hidden="true"></div>
    <div class="lc-hills" aria-hidden="true"><svg viewBox="0 0 400 120" preserveAspectRatio="none"><defs><linearGradient id="lcHill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcebff"/><stop offset="1" stop-color="#9dbbe0"/></linearGradient></defs><path d="M0 70 C60 40 120 46 180 64 S300 88 400 52 V120 H0Z" fill="url(#lcHill)" opacity=".08"/><path d="M0 92 C80 70 150 74 220 88 S340 104 400 82 V120 H0Z" fill="url(#lcHill)" opacity=".12"/></svg></div>
    <script>
    (function () { // [GIÁNG SINH] tuyết: 2 lớp (xa: nhỏ/mờ/chậm · gần: to/rõ/nhanh), vị trí + nhịp ngẫu nhiên, dựng 1 lần
      var box = document.getElementById('lc-snow'); if (!box) return;
      var html = '', R = function (a, b) { return a + Math.random() * (b - a); };
      for (var i = 0; i < 54; i++) {
        var near = i % 3 === 0, s = near ? R(4, 7) : R(1.6, 3.4), d = near ? R(9, 14) : R(16, 26);
        html += '<i class="lc-flake w' + (1 + Math.floor(R(0, 3))) + '" style="--x:' + R(0, 100).toFixed(1) + '%;--s:' + s.toFixed(1) + 'px;--d:' + d.toFixed(1) + 's;--dl:-' + R(0, d).toFixed(1) +
          's;--o:' + (near ? R(.7, .95) : R(.35, .65)).toFixed(2) + '"></i>';
      }
      box.innerHTML = html;
    })();
    </script>`;

function taoGiangSinh(src) {
  let h = src;
  const thay = (tim, moi, ten) => {
    const n = h.split(tim).length - 1;
    if (n !== 1) throw new Error('index.html: cần đúng 1 chỗ "' + ten + '", thấy ' + n + ' — màn đăng nhập đã đổi, sửa lại tools/tao_ban_giangsinh.js');
    h = h.replace(tim, () => moi);
  };
  if (/id="login-xmas"/.test(h)) throw new Error('index.html đã có khối Giáng sinh — phải sinh từ bản THƯỜNG');
  // 1. CSS Giáng sinh ngay sau khối CSS màn đăng nhập (đè màu, thêm tuyết)
  const iC = h.indexOf('<style id="login-cosmos">');
  if (iC < 0) throw new Error('index.html: không thấy <style id="login-cosmos">');
  const iE = h.indexOf('</style>', iC) + '</style>'.length;
  h = h.slice(0, iE) + CSS + h.slice(iE);
  // 2. lớp tuyết + đồi tuyết (dưới nội dung)
  thay('<div class="lc-shoot" aria-hidden="true"></div>', '<div class="lc-shoot" aria-hidden="true"></div>' + SNOW, 'lc-shoot');
  // 3. ✳ → bông tuyết
  thay('<span class="lc-spark">✳</span><span class="lc-spark sm">✳</span>', '<span class="lc-spark">❄\uFE0E</span><span class="lc-spark sm">❄\uFE0E</span>', 'lc-spark');
  // 4. dòng chào
  thay('<p class="lc-eyebrow">Một tài khoản · Ba chốn quen</p>', '<p class="lc-eyebrow">Merry Christmas · Ba chốn quen</p>', 'lc-eyebrow');
  // 5. dấu nhận biết
  thay('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- BẢN GIÁNG SINH — sinh tự động từ index.html bằng tools/tao_ban_giangsinh.js. KHÔNG sửa tay: sửa index.html rồi chạy lại. -->', 'DOCTYPE');
  return h;
}

if (require.main === module) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  if (!fs.existsSync(out)) { console.log('❌ Không thấy thư mục ' + out); process.exit(1); }
  const h = taoGiangSinh(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  fs.writeFileSync(path.join(out, 'index_giangsinh.html'), h);
  console.log('✅ Đã ghi ' + path.join(out, 'index_giangsinh.html'));
}
module.exports = { taoGiangSinh };
