// Sinh BẢN GIÁNG SINH của app khách The Cafe 33: index.html → index_giangsinh.html
// Chỉ đổi GIAO DIỆN, không đổi logic / dữ liệu / lượt đọc:
//   • màn đăng nhập: tông lạnh (xanh băng / bạc), tuyết rơi, đồi tuyết, bông tuyết thay ✳, "Merry Christmas";
//   • trong app: mọi màu thuộc dải XANH LÁ (hex, rgb/rgba, lớp Tailwind green/emerald/teal) đổi sang dải XANH BĂNG
//     — giữ độ sáng tối nên chữ / nền vẫn tương phản như cũ; đỏ (lỗi), vàng / cam (hạng, cảnh báo), ảnh: giữ nguyên;
//   • tuyết rơi thưa ở đầu màn hình trong app (không chặn bấm, mờ dần xuống dưới).
// id, hàm (login(), showRegister()…) giữ nguyên — test tests/giangsinh.test.js kiểm: ngoài phần chèn chỉ khác MÃ MÀU.
//
//   node tools/tao_ban_giangsinh.js              → ghi index_giangsinh.html cạnh index.html
//   node tools/tao_ban_giangsinh.js <thư mục>    → ghi vào thư mục đó (vd. thư mục deploy)
//
// Sửa index.html xong → chạy lại lệnh này (test tests/giangsinh.test.js báo nếu quên).
// Bật Giáng sinh = deploy nội dung index_giangsinh.html làm index.html; hết mùa = deploy lại index.html gốc.
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// Gấu Noel 2026: 1 thẻ script trước </body> (chương trình bật / tắt ở pos.html › Quản lý › Gấu Noel). Hết đợt: đặt GAU_NOEL = '' rồi chạy lại.
const GAU_NOEL = '<!-- [GIÁNG SINH] quay trúng gấu Noel 2026 (gau_noel_giangsinh.v1.js) -->\n<script src="gau_noel_giangsinh.v1.js" data-quan="khach"></script>\n';

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
  /* điểm nhấn ĐỎ: chữ Merry Christmas + quả châu đỏ chạy trên quỹ đạo thay hành tinh */
  #login-screen .lc-xm{color:#ff5a6a;text-shadow:0 0 12px rgba(255,70,90,.45)}
  #login-screen .lc-planet{background:radial-gradient(circle at 34% 30%,#fff 0 8%,#ff6b78 22%,#d6213a 58%,#7d0c1b 100%);box-shadow:0 0 14px 3px rgba(255,60,80,.5)}
  #login-screen .lc-run.slow .lc-planet{background:radial-gradient(circle at 34% 30%,#fff 0 10%,#ff8a95 30%,#c81e35 100%);box-shadow:0 0 10px 2px rgba(255,80,100,.45)}
  /* cây thông mờ: đung đưa nhẹ, thỉnh thoảng rung → rụng tuyết. Chỉ transform/opacity (GPU) */
  #login-screen .lc-tree{position:absolute;bottom:0;z-index:0;pointer-events:none;transform-origin:50% 100%;animation:lc-tree var(--t,8s) ease-in-out var(--td,0s) infinite}
  #login-screen .lc-tree svg{display:block;width:100%;height:100%;overflow:visible}
  #login-screen .lc-tree.t1{left:-24px;width:128px;height:200px;--t:8s;--td:-1s}
  #login-screen .lc-tree.t2{display:none;opacity:.75;--t:9.5s;--td:-5s} /* điện thoại: ẩn — sẽ nằm sau chữ Đăng ký */
  #login-screen .lc-tree.t3{right:-20px;width:116px;height:182px;--t:7.2s;--td:-3.4s}
  @media(min-width:800px){#login-screen .lc-tree.t1{left:4%;width:220px;height:340px}#login-screen .lc-tree.t2{display:block;left:calc(4% + 170px);width:130px;height:200px}#login-screen .lc-tree.t3{right:5%;width:200px;height:310px}}
  @keyframes lc-tree{0%,100%{transform:rotate(0)}18%{transform:rotate(1deg)}40%{transform:rotate(-.8deg)}60%{transform:rotate(0)}
    66%{transform:rotate(2.2deg)}69%{transform:rotate(-2deg)}72%{transform:rotate(1.6deg)}75%{transform:rotate(-1.2deg)}78%{transform:rotate(.6deg)}82%{transform:rotate(0)}}
  /* bông tuyết rụng từ cành: cùng nhịp với cây (rơi đúng lúc cây rung ~66%) */
  #login-screen .lc-tree b{position:absolute;left:var(--x);top:var(--y);width:var(--s,4px);height:var(--s,4px);border-radius:50%;background:#fff;opacity:0;animation:lc-shed var(--t,8s) ease-in var(--td,0s) infinite}
  @keyframes lc-shed{0%,65%{opacity:0;transform:translate3d(0,0,0)}68%{opacity:.95;transform:translate3d(0,2px,0)}100%{opacity:0;transform:translate3d(6px,120px,0)}}
  </style>`;

const SNOW = `
    <div class="lc-snow" id="lc-snow" aria-hidden="true"></div>
    <div class="lc-tree t1" aria-hidden="true"><svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMax meet"><rect x="55" y="176" width="10" height="24" fill="#cfe3ff" fill-opacity=".14"/><path d="M60 10 L84 54 L72 52 L96 94 L80 92 L106 138 L88 136 L116 182 L4 182 L32 136 L14 138 L40 92 L24 94 L48 52 L36 54 Z" fill="#cfe3ff" fill-opacity=".15"/><path d="M36 54 Q48 48 60 52 T84 54 M24 94 Q42 86 60 92 T96 94 M14 138 Q36 129 60 136 T106 138 M4 182 Q32 172 60 180 T116 182" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/><path d="M60 0 l2.4 5.6 6 .6 -4.6 4 1.4 6 -5.2-3.2 -5.2 3.2 1.4-6 -4.6-4 6-.6z" fill="#fff" fill-opacity=".7"/><g fill="#e0283f"><circle cx="50" cy="70" r="4.6"/><circle cx="76" cy="112" r="4.6"/><circle cx="38" cy="152" r="5"/><circle cx="88" cy="160" r="4.6"/><circle cx="62" cy="128" r="3.8"/></g><g fill="#fff" fill-opacity=".75"><circle cx="48.6" cy="68.6" r="1.3"/><circle cx="74.6" cy="110.6" r="1.3"/><circle cx="36.5" cy="150.5" r="1.4"/><circle cx="86.6" cy="158.6" r="1.3"/><circle cx="60.9" cy="126.9" r="1.1"/></g></svg><b style="--x:30%;--y:26%"></b><b style="--x:66%;--y:44%;--s:3px"></b><b style="--x:22%;--y:66%"></b><b style="--x:78%;--y:68%;--s:5px"></b><b style="--x:48%;--y:48%;--s:3px"></b></div>
    <div class="lc-tree t2" aria-hidden="true"><svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMax meet"><rect x="55" y="176" width="10" height="24" fill="#cfe3ff" fill-opacity=".14"/><path d="M60 10 L84 54 L72 52 L96 94 L80 92 L106 138 L88 136 L116 182 L4 182 L32 136 L14 138 L40 92 L24 94 L48 52 L36 54 Z" fill="#cfe3ff" fill-opacity=".15"/><path d="M36 54 Q48 48 60 52 T84 54 M24 94 Q42 86 60 92 T96 94 M14 138 Q36 129 60 136 T106 138 M4 182 Q32 172 60 180 T116 182" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/><path d="M60 0 l2.4 5.6 6 .6 -4.6 4 1.4 6 -5.2-3.2 -5.2 3.2 1.4-6 -4.6-4 6-.6z" fill="#fff" fill-opacity=".7"/><g fill="#e0283f"><circle cx="50" cy="70" r="4.6"/><circle cx="76" cy="112" r="4.6"/><circle cx="38" cy="152" r="5"/><circle cx="88" cy="160" r="4.6"/><circle cx="62" cy="128" r="3.8"/></g><g fill="#fff" fill-opacity=".75"><circle cx="48.6" cy="68.6" r="1.3"/><circle cx="74.6" cy="110.6" r="1.3"/><circle cx="36.5" cy="150.5" r="1.4"/><circle cx="86.6" cy="158.6" r="1.3"/><circle cx="60.9" cy="126.9" r="1.1"/></g></svg><b style="--x:30%;--y:26%"></b><b style="--x:66%;--y:44%;--s:3px"></b><b style="--x:22%;--y:66%"></b><b style="--x:78%;--y:68%;--s:5px"></b><b style="--x:48%;--y:48%;--s:3px"></b></div>
    <div class="lc-tree t3" aria-hidden="true"><svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMax meet"><rect x="55" y="176" width="10" height="24" fill="#cfe3ff" fill-opacity=".14"/><path d="M60 10 L84 54 L72 52 L96 94 L80 92 L106 138 L88 136 L116 182 L4 182 L32 136 L14 138 L40 92 L24 94 L48 52 L36 54 Z" fill="#cfe3ff" fill-opacity=".15"/><path d="M36 54 Q48 48 60 52 T84 54 M24 94 Q42 86 60 92 T96 94 M14 138 Q36 129 60 136 T106 138 M4 182 Q32 172 60 180 T116 182" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/><path d="M60 0 l2.4 5.6 6 .6 -4.6 4 1.4 6 -5.2-3.2 -5.2 3.2 1.4-6 -4.6-4 6-.6z" fill="#fff" fill-opacity=".7"/><g fill="#e0283f"><circle cx="50" cy="70" r="4.6"/><circle cx="76" cy="112" r="4.6"/><circle cx="38" cy="152" r="5"/><circle cx="88" cy="160" r="4.6"/><circle cx="62" cy="128" r="3.8"/></g><g fill="#fff" fill-opacity=".75"><circle cx="48.6" cy="68.6" r="1.3"/><circle cx="74.6" cy="110.6" r="1.3"/><circle cx="36.5" cy="150.5" r="1.4"/><circle cx="86.6" cy="158.6" r="1.3"/><circle cx="60.9" cy="126.9" r="1.1"/></g></svg><b style="--x:30%;--y:26%"></b><b style="--x:66%;--y:44%;--s:3px"></b><b style="--x:22%;--y:66%"></b><b style="--x:78%;--y:68%;--s:5px"></b><b style="--x:48%;--y:48%;--s:3px"></b></div>
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

// ── đổi màu: dải xanh lá (hue 85–178°, đủ đậm màu) → xanh băng (hue ~200–215°), giữ độ sáng ──
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
function laXanhLa(r, g, b) { const [h, s] = rgb2hsl(r, g, b); return h >= 85 && h <= 178 && s >= .18; }
function doiMau(r, g, b) {
  const [h, s, l] = rgb2hsl(r, g, b);
  // màu đậm nâng sáng nhẹ (xanh lá đậm 19% sáng → xanh navy nặng; băng cần sáng hơn chút)
  return hsl2rgb(200 + (h - 85) / (178 - 85) * 15, Math.min(1, s * .82), l < .42 ? l + (.42 - l) * .3 : l);
}
const hex2 = v => v.toString(16).padStart(2, '0');
function doiMauToanBo(h) {
  // #rrggbb / #rrggbbaa (chỉ khi đứng sau ký tự kiểu CSS/chuỗi — không đụng #id trong href)
  h = h.replace(/([:\s,(='"`>[])#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g, (m, pre, c, a) => {
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    if (!laXanhLa(r, g, b)) return m;
    return pre + '#' + doiMau(r, g, b).map(hex2).join('') + (a || '');
  });
  // rgb( / rgba( số thường
  h = h.replace(/\b(rgba?\(\s*)(\d{1,3})(\s*,\s*)(\d{1,3})(\s*,\s*)(\d{1,3})/g, (m, p, r, s1, g, s2, b) => {
    r = +r; g = +g; b = +b; if (r > 255 || g > 255 || b > 255 || !laXanhLa(r, g, b)) return m;
    const [R, G, B] = doiMau(r, g, b); return p + R + s1 + G + s2 + B;
  });
  // lớp Tailwind màu xanh lá → sky (cùng độ đậm)
  h = h.replace(/\b((?:bg|text|border|from|to|via|ring|shadow|fill|stroke|outline|divide|accent|decoration|placeholder)-)(green|emerald|teal|lime)-(\d{2,3})\b/g, '$1sky-$3');
  return h;
}

// tuyết rơi thưa ở đầu màn hình trong app — chỉ transform/opacity (GPU), không chặn bấm; #main-app ẩn = dừng
const APP_SNOW = `
    <!-- [GIÁNG SINH] tuyết trong app -->
    <style id="app-xmas">
    #app-snow{position:fixed;left:0;right:0;top:0;height:34vh;z-index:45;pointer-events:none;overflow:hidden}
    #app-snow i{position:absolute;top:-8px;left:var(--x);width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle,#fff 45%,#cfe2f8 100%);box-shadow:0 0 3px 1px rgba(90,145,215,.45);opacity:0;animation:ax-fall1 var(--d) linear var(--dl) infinite}
    #app-snow i.w2{animation-name:ax-fall2}
    @keyframes ax-fall1{0%{opacity:0;transform:translate3d(0,0,0)}12%{opacity:.95}60%{opacity:.7}100%{opacity:0;transform:translate3d(14px,34vh,0)}}
    @keyframes ax-fall2{0%{opacity:0;transform:translate3d(0,0,0)}12%{opacity:.9}60%{opacity:.65}100%{opacity:0;transform:translate3d(-12px,34vh,0)}}
    /* quả châu đỏ treo ở khoảng trống giữa 2 pill trên cùng — đung đưa (GPU), không chặn bấm */
    #app-orn{position:fixed;top:0;left:50%;width:120px;margin-left:-60px;height:70px;z-index:46;pointer-events:none}
    #app-orn span{position:absolute;top:0;left:var(--x);width:1px;height:var(--l);background:linear-gradient(#b9cde6,#e6eef8);transform-origin:50% 0;animation:ax-swing var(--d) ease-in-out var(--dl) infinite alternate}
    #app-orn span i{position:absolute;top:100%;left:50%;width:var(--r);height:var(--r);margin-left:calc(var(--r) / -2);border-radius:50%;background:var(--c);box-shadow:0 3px 8px rgba(120,20,30,.25)}
    #app-orn span i:before{content:'';position:absolute;top:-3px;left:50%;width:5px;height:4px;margin-left:-2.5px;border-radius:1px;background:linear-gradient(#e9d48a,#b8953c)}
    @keyframes ax-swing{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
    @media(prefers-reduced-motion:reduce){#app-snow,#app-orn span{animation:none}#app-snow{display:none}}
    </style>
    <div id="app-orn" aria-hidden="true"><span style="--x:22px;--l:22px;--r:14px;--d:2.6s;--dl:-1s;--c:radial-gradient(circle at 34% 30%,#fff 0 10%,#ff6b78 26%,#d6213a 60%,#7d0c1b 100%)"><i></i></span><span style="--x:60px;--l:36px;--r:17px;--d:3.1s;--dl:-2.2s;--c:radial-gradient(circle at 34% 30%,#fff 0 10%,#ff6b78 26%,#d6213a 60%,#7d0c1b 100%)"><i></i></span><span style="--x:96px;--l:16px;--r:12px;--d:2.3s;--dl:-.4s;--c:radial-gradient(circle at 34% 30%,#fff 0 12%,#e3ecf7 40%,#9fb6d3 100%)"><i></i></span></div>
    <div id="app-snow" aria-hidden="true"></div>
    <script>
    (function () {
      var box = document.getElementById('app-snow'); if (!box) return;
      var html = '', R = function (a, b) { return a + Math.random() * (b - a); };
      for (var i = 0; i < 22; i++) { var d = R(6, 11);
        html += '<i class="w' + (1 + (i % 2)) + '" style="--x:' + R(0, 100).toFixed(1) + '%;--s:' + R(2.5, 5).toFixed(1) + 'px;--d:' + d.toFixed(1) + 's;--dl:-' + R(0, d).toFixed(1) + 's"></i>'; }
      box.innerHTML = html;
    })();
    </script>`;

// Bé Gạo (khối [BÉ GẠO] … [/BÉ GẠO] trong index.html). Bản Giáng sinh (16/10, chủ dự án duyệt): Bé Gạo CÂY THÔNG
// (tools/be_gao/be_gao_giangsinh_sheet.png — vẽ bằng ve_be_gao.py xsheet()), sao lấp lánh, câu nói Giáng sinh + đếm ngày tới 25/12 (giờ VN).
// false = bỏ hẳn bé khỏi bản Giáng sinh.
const BE_GAO = true;
const BE_GAO_RE = /<!-- \[BÉ GẠO\][\s\S]*?<!-- \[\/BÉ GẠO\] -->\n?/;
function beGaoGiangSinh(block) {
  let b = block;
  const doi = (tim, moi, ten) => {
    const n = b.split(tim).length - 1;
    if (n !== 1) throw new Error('khối [BÉ GẠO] trong index.html: cần đúng 1 chỗ "' + ten + '", thấy ' + n + ' — sửa lại tools/tao_ban_giangsinh.js');
    b = b.replace(tim, () => moi);
  };
  const png = fs.readFileSync(path.join(ROOT, 'tools/be_gao/be_gao_giangsinh_sheet.png')).toString('base64');
  // khung 40×50 (cao hơn 4 ô cho ngôi sao); chân cách đáy khung 4 ô → đáy khung thấp hơn 1px để chân vẫn chạm mép thanh menu
  doi('bottom:99px;width:40px;height:46px;', 'bottom:100px;width:40px;height:50px;', 'cỡ khung');
  doi('width:280px;height:46px;', 'width:280px;height:50px;', 'cỡ dải sprite');
  const re = /(<img class="bgp-strip"[^>]*src=")data:image\/png;base64,[^"]+(")/;
  if (!re.test(b)) throw new Error('khối [BÉ GẠO]: không thấy ảnh sprite');
  b = b.replace(re, (m, a, z) => a + 'data:image/png;base64,' + png + z);
  doi('<div class="bgp-hop"><div class="bgp-win">', '<div class="bgp-hop"><i class="bgp-glow"></i><div class="bgp-win">', 'bgp-hop');
  doi('</style>\n<div id="bg-pet"', '#bg-pet .bgp-glow{position:absolute;left:12px;top:-2px;width:17px;height:17px;border-radius:50%;pointer-events:none;' +
    'background:radial-gradient(circle,rgba(255,244,170,.95),rgba(255,214,70,.4) 45%,transparent 70%);opacity:.4;will-change:opacity;animation:bgp-glow 1.8s ease-in-out infinite}\n' +
    '@keyframes bgp-glow{0%,100%{opacity:.35}50%{opacity:1}}\n#bg-pet.sleep .bgp-glow{animation:none;opacity:.3}\n</style>\n<div id="bg-pet"', 'style');
  const iS = b.indexOf('  var SAY = ['), iT = b.indexOf('\n', b.indexOf('  var TAP = ['));
  if (iS < 0 || iT < 0) throw new Error('khối [BÉ GẠO]: không thấy SAY / TAP');
  b = b.slice(0, iS) +
`  // [GIÁNG SINH] đếm ngày tới 25/12 theo giờ VN (tính trên máy, không đọc Firebase)
  function demNgayNoel() {
    var n = new Date(Date.now() + 7 * 3600e3), y = n.getUTCFullYear();
    var d = Math.round((Date.UTC(y, 11, 25) - Date.UTC(y, n.getUTCMonth(), n.getUTCDate())) / 864e5);
    return d > 1 ? 'Còn ' + d + ' ngày nữa là Giáng sinh rồi đó!' : d === 1 ? 'Tối nay là đêm Noel rồi đó!' :
      d === 0 ? 'Merry Christmas! Giáng sinh vui vẻ nha!' : 'Giáng sinh vui vẻ! Năm mới ghé 33 nha!';
  }
  var SAY = [demNgayNoel, demNgayNoel, 'Merry Christmas!', 'Giáng sinh là ghé 33 nha!', 'Mùa đông uống gì ấm nè?', 'Ho ho ho~ Bé Gạo đây!'];
  var TAP = ['Merry Christmas!', 'Hihi, nhột quá!', 'Ho ho ho~', 'Giáng sinh là ghé 33 nha!', demNgayNoel];` + b.slice(iT);
  doi('lastAct = Date.now(); next(1200);', 'lastAct = Date.now(); next(1200);\n    if (!window._bgNoelHi) { window._bgNoelHi = 1; setTimeout(function () { if (running && !asleep) speak(demNgayNoel(), 2800); }, 1600); }', 'start');
  doi('<!-- [BÉ GẠO] 16/10', '<!-- [BÉ GẠO] (bản GIÁNG SINH: Bé Gạo cây thông, sao lấp lánh, câu nói + đếm ngày Noel — tools/tao_ban_giangsinh.js) 16/10', 'đầu khối');
  return b;
}

function taoGiangSinh(src) {
  let h = src;
  if (!BE_GAO) h = h.replace(BE_GAO_RE, '');
  else { const m = h.match(BE_GAO_RE); if (!m) throw new Error('index.html: không thấy khối [BÉ GẠO]'); h = h.replace(BE_GAO_RE, () => beGaoGiangSinh(m[0])); }
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
  thay('<p class="lc-eyebrow">Một tài khoản · Ba chốn quen</p>', '<p class="lc-eyebrow"><span class="lc-xm">Merry Christmas</span> · Ba chốn quen</p>', 'lc-eyebrow');
  // 5. tuyết trong app (ngay đầu #main-app)
  thay('<div id="main-app" class="hidden">', '<div id="main-app" class="hidden">' + APP_SNOW, 'main-app');
  // 6. đổi màu xanh lá → xanh băng toàn file
  h = doiMauToanBo(h);
  // 7. dấu nhận biết
  // [GẤU NOEL 2026] quay trúng gấu (gau_noel_giangsinh.v1.js — tự tắt khi chương trình TẮT ở pos › Quản lý › Gấu Noel)
  thay('</body>', GAU_NOEL + '</body>', '</body>');
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
module.exports = { GAU_NOEL, taoGiangSinh, doiMauToanBo, BE_GAO, BE_GAO_RE, beGaoGiangSinh };
