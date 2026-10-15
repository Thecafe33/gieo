// index.html → index_tet.html (BẢN TẾT 2027 — Đinh Mùi). Gọi từ tools/tao_ban_tet.js.
// Chỉ đổi GIAO DIỆN + thêm Túi lì xì; logic / id / chữ cũ giữ nguyên:
//   • màn đăng nhập tông ĐỎ ĐÔ + VÀNG: đèn lồng đung đưa, hoa mai rơi, "Chúc Mừng Năm Mới";
//   • trong app: dải màu xanh lá → đỏ đô (màu đậm) / kem vàng (màu nhạt);
//   • Bé Gạo DÊ (tools/be_gao/be_gao_tet_sheet.png) — câu chúc có vần + đếm ngày tới mùng 1 + nhắc mở lì xì;
//   • thẻ "Túi lì xì Tết 2027" (tab Tích điểm, chỗ thẻ voucher bed cũ) + popup mở bao — dùng lixi.v1.js.
'use strict';
const fs = require('fs'); const path = require('path');

// ── màu: xanh lá → đỏ đô / kem vàng (giữ độ sáng) ──────────────
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
function doiMauTet(r, g, b) {
  const [, s, l] = rgb2hsl(r, g, b);
  if (l >= .82) return hsl2rgb(40, Math.min(1, s * .9), l);                     // nền nhạt → kem vàng
  return hsl2rgb(348, Math.min(1, s * .85), l < .42 ? l + (.42 - l) * .25 : l);   // đậm → đỏ đô
}
const hex2 = v => v.toString(16).padStart(2, '0');
function doiMauToanBoTet(h) {
  h = h.replace(/([:\s,(='"`>[])#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g, (m, pre, c, a) => {
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return laXanhLa(r, g, b) ? pre + '#' + doiMauTet(r, g, b).map(hex2).join('') + (a || '') : m;
  });
  h = h.replace(/\b(rgba?\(\s*)(\d{1,3})(\s*,\s*)(\d{1,3})(\s*,\s*)(\d{1,3})/g, (m, p, r, s1, g, s2, b) => {
    r = +r; g = +g; b = +b; if (r > 255 || g > 255 || b > 255 || !laXanhLa(r, g, b)) return m;
    const [R, G, B] = doiMauTet(r, g, b); return p + R + s1 + G + s2 + B;
  });
  h = h.replace(/\b((?:bg|text|border|from|to|via|ring|shadow|fill|stroke|outline|divide|accent|decoration|placeholder)-)(green|emerald|teal|lime)-(\d{2,3})\b/g,
    (m, a, c, n) => a + (+n <= 200 ? 'amber' : 'rose') + '-' + n);
  return h;
}

// ── màn đăng nhập ───────────────────────────────────────────
const LOGIN_CSS = `
  <!-- [TẾT 2027] tông đỏ đô + vàng — chỉ phủ lên màn đăng nhập, sinh bởi tools/tao_ban_tet.js -->
  <style id="login-tet">
  #login-screen{background:radial-gradient(ellipse 130% 75% at 50% 24%,#7a1228 0%,#4f0a18 40%,#2c040d 76%,#170209 100%);color:#fff8e7}
  body:has(#login-screen:not(.hidden)){background:#170209!important}
  html:has(#login-screen:not(.hidden)){background:#170209}
  body.lc-on{background:#170209!important}
  #login-screen:after{background:radial-gradient(ellipse 85% 70% at 50% 40%,transparent 45%,rgba(20,2,8,.55) 80%,rgba(12,1,5,.88) 100%)}
  #login-screen .lc-b1>i{background:radial-gradient(circle at 40% 40%,#ffcf5a 0%,#a3172f 55%,transparent 100%);opacity:.24}
  #login-screen .lc-b2>i{background:radial-gradient(circle at 60% 40%,#ff8a5c 0%,#7a1027 60%,transparent 100%);opacity:.2}
  #login-screen .lc-b3>i{background:radial-gradient(circle,#ffe08a 0%,#7a1027 65%,transparent 100%);opacity:.12}
  #login-screen .lc-b4>i{background:radial-gradient(circle,#ff6a6a 0%,#5c0d1f 70%,transparent 100%);opacity:.14}
  #login-screen .lc-star{background:#ffe9b0;box-shadow:0 0 6px #ffd27a}
  #login-screen .lc-shoot{background:linear-gradient(90deg,transparent,#ffe9b0cc)}
  #login-screen .lc-gieo-img,#login-screen .lc-xofa-img{filter:drop-shadow(0 0 14px rgba(255,200,90,.3))}
  #login-screen .lc-logo,#login-screen .lc-xofa{text-shadow:0 0 22px rgba(255,200,90,.45)}
  #login-screen .lc-cosmos:before{background:radial-gradient(ellipse at center,rgba(255,190,80,.22) 0%,rgba(200,40,50,.14) 40%,transparent 70%)}
  #login-screen .lc-33{background:linear-gradient(115deg,#fff3c4 0%,#f5c96a 22%,#ffffff 30%,#e8b04b 38%,#ffffff22 52%,#c9932e 70%,#fff0b8 88%);background-size:260% 100%;-webkit-background-clip:text;background-clip:text;
    filter:drop-shadow(0 0 26px rgba(255,190,80,.35)) drop-shadow(0 16px 24px rgba(30,0,8,.55))}
  #login-screen .lc-ring{border-color:rgba(255,222,150,.42);box-shadow:0 0 16px rgba(255,200,110,.2)}
  #login-screen .lc-ring.b{border-color:rgba(255,222,150,.18)}
  #login-screen .lc-planet{background:radial-gradient(circle at 35% 35%,#fffbe6,#ffd36b 45%,#c8901f 100%);box-shadow:0 0 14px 4px rgba(255,200,90,.55)}
  #login-screen .lc-run.slow .lc-planet{background:radial-gradient(circle at 35% 35%,#fff,#ff7a6a 50%,#c8202f);box-shadow:0 0 10px 3px rgba(255,100,90,.5)}
  #login-screen .lc-spark{color:#ffd36b;text-shadow:0 0 18px rgba(255,200,90,.85)}
  #login-screen .lc-eyebrow{color:#f5d48a}
  #login-screen .lc-eyebrow .lc-tet{color:#ffcf4d;text-shadow:0 0 12px rgba(255,190,60,.45)}
  #login-screen .lc-h1{color:#fff8e7}
  #login-screen .lc-h1 span{color:#ffd36b}
  #login-screen .lc-caption{color:#f3dcc0}
  #login-screen .lc-caption i{background:#e9b949}
  #login-screen #login-sdt{background:rgba(255,255,255,.08);border-color:rgba(255,214,140,.35)}
  #login-screen #login-sdt:focus{border-color:rgba(255,220,150,.75);background:rgba(255,255,255,.12);box-shadow:0 0 0 4px rgba(255,200,100,.14)}
  #login-screen #btn-login{background:linear-gradient(135deg,#ffe08a 0%,#e9b949 50%,#c8901f 100%)!important;color:#5c0d1f!important;box-shadow:0 0 30px rgba(255,190,70,.32),0 6px 18px rgba(0,0,0,.4)}
  #login-screen .lc-reg-q{color:rgba(255,236,210,.5)}
  #login-screen .lc-reg{color:#ffd36b;text-shadow:0 0 12px rgba(255,200,90,.4)}
  #login-screen .lc-footer{color:rgba(255,230,200,.42)}
  /* đèn lồng đung đưa (transform — GPU) */
  #login-screen .lc-lantern{position:absolute;top:0;width:34px;z-index:1;pointer-events:none;transform-origin:50% 0;animation:lc-swing var(--t,3.2s) ease-in-out var(--d,0s) infinite alternate}
  #login-screen .lc-lantern.l1{left:22%;--t:3.4s}
  #login-screen .lc-lantern.l2{right:22%;--t:2.9s;--d:-1.2s}
  #login-screen .lc-lantern .str{width:2px;height:var(--h,30px);margin:0 auto;background:linear-gradient(#b8862e,#f5d48a)}
  #login-screen .lc-lantern .cap{width:18px;height:6px;margin:0 auto;border-radius:3px;background:linear-gradient(#f5d48a,#c8901f)}
  #login-screen .lc-lantern .bd{width:34px;height:40px;margin:-1px auto;border-radius:50%/46%;background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(255,210,120,.28) 7px 8px),radial-gradient(circle at 40% 35%,#ff7a62,#d4202f 55%,#8e0c1c);box-shadow:0 0 22px rgba(255,90,60,.55)}
  #login-screen .lc-lantern .tas{width:4px;height:16px;margin:0 auto;border-radius:2px;background:linear-gradient(#f5d48a,#c8901f)}
  @keyframes lc-swing{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
  @media(min-width:800px){#login-screen .lc-lantern.l1{left:30%}#login-screen .lc-lantern.l2{right:30%}}
  /* hoa mai rơi (transform — GPU; keyframes không dùng var()) */
  #login-screen .lc-maifall{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  #login-screen .lc-mai{position:absolute;top:-20px;left:var(--x);font-size:var(--s);line-height:1;color:#ffcf3f;opacity:var(--o);text-shadow:0 0 8px rgba(255,200,60,.5);animation:lc-mai1 var(--d) linear var(--dl) infinite}
  #login-screen .lc-mai.w2{animation-name:lc-mai2} #login-screen .lc-mai.w3{animation-name:lc-mai3;color:#ffb3b3}
  @keyframes lc-mai1{0%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(22px,55vh,0) rotate(200deg)}100%{transform:translate3d(-6px,110vh,0) rotate(400deg)}}
  @keyframes lc-mai2{0%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(-26px,55vh,0) rotate(-180deg)}100%{transform:translate3d(10px,110vh,0) rotate(-380deg)}}
  @keyframes lc-mai3{0%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(14px,55vh,0) rotate(150deg)}100%{transform:translate3d(30px,110vh,0) rotate(320deg)}}
  </style>`;
const LOGIN_DECO = `
    <div class="lc-maifall" id="lc-maifall" aria-hidden="true"></div>
    <div class="lc-lantern l1" aria-hidden="true"><div class="str" style="--h:26px"></div><div class="cap"></div><div class="bd"></div><div class="cap"></div><div class="tas"></div></div>
    <div class="lc-lantern l2" aria-hidden="true"><div class="str" style="--h:44px"></div><div class="cap"></div><div class="bd"></div><div class="cap"></div><div class="tas"></div></div>
    <script>
    (function () { // [TẾT] hoa mai / đào rơi: dựng 1 lần
      var box = document.getElementById('lc-maifall'); if (!box) return;
      var html = '', R = function (a, b) { return a + Math.random() * (b - a); };
      for (var i = 0; i < 26; i++) { var d = R(11, 20);
        html += '<i class="lc-mai w' + (1 + Math.floor(R(0, 3))) + '" style="--x:' + R(0, 100).toFixed(1) + '%;--s:' + R(10, 18).toFixed(0) + 'px;--d:' + d.toFixed(1) + 's;--dl:-' + R(0, d).toFixed(1) + 's;--o:' + R(.45, .9).toFixed(2) + '">✿</i>'; }
      box.innerHTML = html;
    })();
    </script>`;

// ── Bé Gạo dê ───────────────────────────────────────────────
function beGaoTet(block, ROOT) {
  let b = block;
  const doi = (tim, moi, ten) => {
    const n = b.split(tim).length - 1;
    if (n !== 1) throw new Error('khối [BÉ GẠO] trong index.html: cần đúng 1 chỗ "' + ten + '", thấy ' + n + ' — sửa lại tools/tet/index_tet.js');
    b = b.replace(tim, () => moi);
  };
  const png = fs.readFileSync(path.join(ROOT, 'tools/be_gao/be_gao_tet_sheet.png')).toString('base64');
  const re = /(<img class="bgp-strip"[^>]*src=")data:image\/png;base64,[^"]+(")/;
  if (!re.test(b)) throw new Error('khối [BÉ GẠO]: không thấy ảnh sprite');
  b = b.replace(re, (m, a, z) => a + 'data:image/png;base64,' + png + z);
  const iS = b.indexOf('  var SAY = ['), iT = b.indexOf('\n', b.indexOf('  var TAP = ['));
  if (iS < 0 || iT < 0) throw new Error('khối [BÉ GẠO]: không thấy SAY / TAP');
  b = b.slice(0, iS) +
`  // [TẾT 2027] câu chúc có vần + đếm ngày tới mùng 1 (giờ VN) + nhắc mở lì xì
  function demNgayTet() {
    var d = window.LiXi ? LiXi.daysToTet() : 99;
    return d > 1 ? 'Còn ' + d + ' ngày nữa thôi, Tết đến nơi rồi!' : d === 1 ? 'Giao thừa tới rồi, đón lộc thôi bạn ơi!' :
      d === 0 ? 'Mùng 1 Tết sang, chúc bạn bình an, phú quý giàu sang!' : 'Xuân sang phơi phới, chúc bạn năm mới như ý!';
  }
  function nhacLiXi() { return (window.LiXiUI && LiXiUI.avail() > 0) ? 'Bé Gạo có lì xì nè, chạm Gạo mở liền đi!' : 'Mở bao lì xì, năm mới hết ý!'; }
  var SAY = [demNgayTet, demNgayTet, nhacLiXi, 'Tết sang phúc tới, lộc mới đầy nhà!', 'Dê vàng gõ cửa, vạn sự như ý, tỷ sự như mơ!',
    'Uống ly đầu xuân, lộc tới muôn phần!', 'Năm Mùi phơi phới, ghé 33 lấy lộc nha!', 'Chúc bạn năm mới, tiền vô như nước, tiền ra nhỏ giọt!',
    'An khang thịnh vượng, vạn sự cát tường!'];
  var TAP = [nhacLiXi, 'Be be~ Lộc xuân tới rồi!', 'Dê con chúc Tết, sức khoẻ không hết!', 'Hihi, chúc bạn phát tài phát lộc!', demNgayTet];` + b.slice(iT);
  doi('lastAct = Date.now(); next(1200);', 'lastAct = Date.now(); next(1200);\n    if (!window._bgTetHi) { window._bgTetHi = 1; setTimeout(function () { if (running && !asleep) speak(demNgayTet(), 2800); }, 1600); }', 'start');
  doi('<!-- [BÉ GẠO] 16/10', '<!-- [BÉ GẠO] (bản TẾT 2027: Bé Gạo DÊ, câu chúc có vần, đếm ngày tới mùng 1, nhắc mở lì xì — tools/tet/index_tet.js) 16/10', 'đầu khối');
  return b;
}

// ── Túi lì xì ───────────────────────────────────────────────
const LIXI_CARD = `
      <!-- [TẾT 2027] TÚI LÌ XÌ — vẽ bởi khối [LÌ XÌ TẾT 2027] cuối trang -->
      <div id="lx-card" class="mb-6" style="display:none;"></div>
`;
const LIXI_UI = fs.readFileSync(path.join(__dirname, 'index_lixi.js'), 'utf8');

function taoIndexTet(src, ROOT) {
  let h = src;
  const thay = (tim, moi, ten) => {
    const n = h.split(tim).length - 1;
    if (n !== 1) throw new Error('index.html: cần đúng 1 chỗ "' + ten + '", thấy ' + n + ' — sửa lại tools/tet/index_tet.js');
    h = h.replace(tim, () => moi);
  };
  if (/lixi\.v\d+\.js/.test(h) || /id="login-tet"/.test(h)) throw new Error('index.html đã có bản Tết — phải sinh từ bản BÌNH THƯỜNG');
  // 1. màn đăng nhập
  const iC = h.indexOf('<style id="login-cosmos">');
  if (iC < 0) throw new Error('index.html: không thấy <style id="login-cosmos">');
  const iE = h.indexOf('</style>', iC) + '</style>'.length;
  h = h.slice(0, iE) + LOGIN_CSS + h.slice(iE);
  thay('<div class="lc-shoot" aria-hidden="true"></div>', '<div class="lc-shoot" aria-hidden="true"></div>' + LOGIN_DECO, 'lc-shoot');
  thay('<span class="lc-spark">✳</span><span class="lc-spark sm">✳</span>', '<span class="lc-spark">✿︎</span><span class="lc-spark sm">✿︎</span>', 'lc-spark');
  thay('<p class="lc-eyebrow">Một tài khoản · Ba chốn quen</p>', '<p class="lc-eyebrow"><span class="lc-tet">Chúc Mừng Năm Mới</span> · Ba chốn quen</p>', 'lc-eyebrow');
  // 2. Bé Gạo dê
  const BG = /<!-- \[BÉ GẠO\][\s\S]*?<!-- \[\/BÉ GẠO\] -->\n?/;
  const m = h.match(BG); if (!m) throw new Error('index.html: không thấy khối [BÉ GẠO]');
  h = h.replace(BG, () => beGaoTet(m[0], ROOT));
  // 3. thẻ Túi lì xì (chỗ thẻ voucher bed cũ — thẻ đó đã ẩn hẳn từ 16/10)
  thay('      <!-- HỢP TÁC XOFA & THE CAFE 33 — VOUCHER BED 1H MIỄN PHÍ -->', LIXI_CARD + '      <!-- HỢP TÁC XOFA & THE CAFE 33 — VOUCHER BED 1H MIỄN PHÍ -->', 'chỗ thẻ voucher');
  thay('</body>', '<!-- [LÌ XÌ TẾT 2027] lõi dùng chung + túi lì xì (tools/tet/index_lixi.js) -->\n<script src="lixi.v1.js"></script>\n<script>\n' + LIXI_UI + '\n</script>\n</body>', '</body>');
  // 4. màu trong app
  h = doiMauToanBoTet(h);
  thay('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- BẢN TẾT 2027 — sinh tự động từ index.html bằng tools/tao_ban_tet.js. KHÔNG sửa tay: sửa index.html rồi chạy lại. -->', 'DOCTYPE');
  return h;
}
module.exports = { taoIndexTet, doiMauToanBoTet, LOGIN_CSS, LIXI_CARD };
