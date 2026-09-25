#!/usr/bin/env node
/**
 * Gộp nguồn thành 2 file HTML TỰ CHỨA: dist/posgieo_new.html, dist/quanlygieo_new.html
 *
 * Đã chốt với chủ hệ thống: HTML thuần, không TS/pnpm/Vite. Script này không
 * phải bundler — nó chỉ nối file theo thứ tự và chèn vào 1 khuôn HTML, để
 * domain core dùng chung được sinh vào CẢ HAI file từ MỘT nguồn (nếu copy tay
 * 2 bản thì sớm muộn 2 bản lệch nhau — đúng lớp bug "2 app 2 công thức" của legacy).
 *
 * Chạy: node tools/build-html.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

/* Thứ tự layer chỉ để file đọc ra dễ theo dõi. define() là lazy nên thứ tự nạp
   không ảnh hưởng đúng/sai — require() mới là lúc resolve. */
const LAYER_ORDER = [
  'shared-kernel', 'store-context',
  'fifo-core', 'traceability', 'recipe-cost-btp', 'compaction',
  'catalog', 'loyalty', 'hr', 'finance', 'alerts',
  'protected-adapters', 'legacy-firebase-adapter', 'persistence-firebase',
  'read-layer', 'commands', 'reporting',
  'bootstrap'
];

const APPS = {
  pos: { out: 'posgieo_new.html', title: 'GIEO — POS', entry: 'app-pos/main', runtimeGlobal: 'GIEO_POS_RUNTIME', source: 'POS' },
  quanly: { out: 'quanlygieo_new.html', title: 'GIEO — Quản lý', entry: 'app-quanly/main', runtimeGlobal: 'GIEO_QUANLY_RUNTIME', source: 'QUANLY' }
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function section(file) {
  const rel = path.relative(ROOT, file);
  return `\n/* ===== ${rel} ===== */\n` + fs.readFileSync(file, 'utf8');
}

/** CSS presentation từ file đang dùng; không lấy bất kỳ JavaScript legacy nào. */
function legacyCss(appKey) {
  const file = path.join(ROOT, appKey === 'quanly' ? 'quanlygieo.html' : 'posgieo.html');
  const html = fs.readFileSync(file, 'utf8');
  return Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map(m => m[1]).join('\n');
}

/**
 * Trích config + tài khoản từ chính `posgieo.html` đang chạy production.
 *
 * KHÔNG chép chúng vào src/. Chép là tạo bản thứ hai của cùng một bí mật, và
 * khi đổi mật khẩu sẽ sót đúng cái bản không ai nhớ. Ở đây bí mật vẫn nằm đúng
 * một nơi: file hệ cũ.
 */
function legacyFirebase() {
  const src = fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8');

  const block = /const firebaseConfig = \{([\s\S]*?)\}/.exec(src);
  if (!block) throw new Error('[build] không tìm thấy firebaseConfig trong posgieo.html');
  const config = {};
  for (const m of block[1].matchAll(/(\w+)\s*:\s*"([^"]*)"/g)) {
    /* Hệ cũ để messagingSenderId/appId là "..." — chúng chỉ cần cho FCM/Analytics.
       Bỏ qua thay vì mang một chuỗi vô nghĩa sang. */
    if (m[2] && m[2] !== '...') config[m[1]] = m[2];
  }

  const cred = /signInWithEmailAndPassword\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/.exec(src);
  if (!cred) throw new Error('[build] không tìm thấy tài khoản đăng nhập trong posgieo.html');

  const sdkVersion = (/firebasejs\/([\d.]+)\//.exec(src) || [])[1];
  if (!sdkVersion) throw new Error('[build] không đọc được phiên bản Firebase SDK của hệ cũ');

  return { config, account: { email: cred[1], password: cred[2] }, sdkVersion };
}

function buildBundle(appKey) {
  const rules = fs.readFileSync(path.join(SRC, 'layer-rules.json'), 'utf8');
  const registry = fs
    .readFileSync(path.join(SRC, 'runtime/registry.js'), 'utf8')
    .replace('/*__LAYER_RULES__*/ null', rules.trim())
    /* Dòng export cho Node không có nghĩa trong trình duyệt, bỏ đi. */
    .replace(/\nif \(typeof module[\s\S]*$/, '\n');

  let js = '/* GIEO runtime registry */\n' + registry;
  for (const layer of LAYER_ORDER) {
    for (const f of walk(path.join(SRC, 'layers', layer))) js += section(f);
  }
  for (const f of walk(path.join(SRC, 'apps', appKey))) js += section(f);
  /* Composition root chạy trong trình duyệt. Mọi thứ đi qua `bootstrap/startup`
     — quyền ghi đến từ tiến trình cutover, không hardcode ở đây. */
  js += `
/* ===== khởi động ===== */
(function () {
  var R = GIEO.require('shared-kernel/result');
  var startup = GIEO.require('bootstrap/startup');
  var app = GIEO.require(${JSON.stringify(APPS[appKey].entry)});
  var cfg = globalThis.GIEO_FIREBASE || {};

  function fail(message) {
    /* Không nối được dữ liệu thì NÓI RA ngay trên màn hình. Khởi động im lặng
       rồi hiện màn trống là cách người dùng tưởng quán không có hàng. */
    var el = document.getElementById('app');
    if (el) {
      el.innerHTML = '<div class="app-shell"><div class="notice alerts">' +
        '<strong>Chưa kết nối được dữ liệu cửa hàng</strong><span>' +
        String(message).replace(/[&<>]/g, '') + '</span></div></div>';
    }
  }

  function startRuntime() {
    return startup.start({
      firebase: { config: cfg.config, account: cfg.account },
      context: function () { return globalThis.GIEO_CONTEXT || null; },
      cutoverDate: cfg.cutoverDate,
      today: globalThis.GIEO_TODAY || null
    }).then(function (out) {
      if (R.isErr(out)) { fail(out.error.message); return out; }
      globalThis[${JSON.stringify(APPS[appKey].runtimeGlobal)}] = out.value.runtime;
      globalThis.GIEO_CUTOVER = out.value.cutover;
      globalThis.GIEO_TAKEOVER = out.value.takeover;
      app.start();
      return out;
    });
  }

  /* Cả 2 app đều cần PIN trước khi có StoreContext — không có context thì
     runtime.query()/command() từ chối tất cả (chưa có StoreContext để đọc/ghi).
     Trước đây chỉ QUANLY đi qua nhánh này, POS gọi thẳng startRuntime() nên
     GIEO_CONTEXT không bao giờ được set — mọi màn POS vì thế luôn lỗi ngay
     từ query đầu tiên. */
  var ids = GIEO.require('shared-kernel/ids');
  startup.prepareAuth({
    firebase: { config: cfg.config, account: cfg.account },
    organizationId: ids.deterministicId('org', ['gieo']),
    storeId: cfg.storeId,
    source: ${JSON.stringify(APPS[appKey].source)}
  }).then(function (prepared) {
    if (R.isErr(prepared)) return fail(prepared.error.message);
    app.showLogin({
      authenticate: prepared.value.authenticate,
      onAuthenticated: function (session) {
        globalThis.GIEO_CONTEXT = session.context;
        return startRuntime();
      }
    });
  }).catch(function (e) { fail(e && e.message ? e.message : e); });
})();
`;
  return js;
}

function shell(title, js, fb, presentationCss) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<script src="https://www.gstatic.com/firebasejs/${fb.sdkVersion}/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/${fb.sdkVersion}/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/${fb.sdkVersion}/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/${fb.sdkVersion}/firebase-auth-compat.js"></script>
<style>
${presentationCss || ''}
/* Các rule dưới đây chỉ phục vụ component mới chưa port; selector legacy ở
   trên là nguồn presentation chính và sẽ dần thay thế shell tạm. */
  :root { color-scheme: light; --ink:#172033; --muted:#697386; --line:#e8ebf0; --brand:#315c72; --soft:#f4f7f9; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#f5f6f8; color:var(--ink); font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  button,input { font:inherit; }
  button { border:0; cursor:pointer; }
  button:disabled { cursor:not-allowed; opacity:.46; }
  .app-shell { width:min(1120px,100%); min-height:100vh; margin:auto; padding:24px; }
  .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }
  .topbar h1,.panel h2,.empty h3 { margin:0; letter-spacing:-.025em; }
  .topbar h1 { font-size:24px; }
  .brand,.eyebrow { margin:0 0 2px; color:var(--brand); font-size:12px; font-weight:750; letter-spacing:.08em; text-transform:uppercase; }
  .status { display:inline-flex; align-items:center; padding:5px 9px; border-radius:999px; font-size:11px; font-weight:750; letter-spacing:.04em; }
  .status.warning { color:#8a4b08; background:#fff0d8; }
  .status.success { color:#176b43; background:#dcf6e8; }
  .status.neutral { color:#596273; background:#eef0f4; }
  .notice { display:flex; gap:8px; padding:11px 14px; margin-bottom:16px; border:1px solid #f1d7ac; border-radius:14px; color:#76501d; background:#fff9ed; }
  .notice span { color:#8a6b43; }
  .panel { min-height:440px; padding:22px; border:1px solid var(--line); border-radius:22px; background:#fff; box-shadow:0 14px 42px rgba(35,45,65,.06); }
  .section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; }
  .section-head h2 { font-size:20px; }
  .primary,.search-row button,.section-head button { padding:10px 15px; border-radius:12px; color:#fff; background:var(--brand); font-weight:700; }
  .empty { display:grid; place-items:center; align-content:center; min-height:300px; text-align:center; color:var(--muted); }
  .empty-icon { display:grid; place-items:center; width:52px; height:52px; margin-bottom:12px; border-radius:16px; background:var(--soft); color:var(--brand); font-size:25px; }
  .empty h3 { color:var(--ink); font-size:17px; }
  .empty p { max-width:450px; margin:6px auto 0; }
  .total-row { display:flex; justify-content:space-between; padding-top:16px; border-top:1px solid var(--line); font-size:16px; }
  .metric-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:22px; }
  .metric { padding:18px; border-radius:16px; background:var(--soft); }
  .metric span { display:block; color:var(--muted); font-size:12px; }
  .metric strong { display:block; margin-top:8px; font-size:20px; }
  .bottom-nav { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:14px; padding:7px; border:1px solid var(--line); border-radius:17px; background:#fff; }
  .bottom-nav button { display:grid; place-items:center; gap:2px; padding:8px; border-radius:11px; color:var(--muted); background:transparent; }
  .bottom-nav button span { font-size:17px; }
  .bottom-nav button.active,.side-nav button.active { color:var(--brand); background:#eaf0f3; font-weight:700; }
  .workspace { display:grid; grid-template-columns:190px minmax(0,1fr); gap:14px; }
  .side-nav { display:flex; flex-direction:column; gap:5px; padding:8px; height:max-content; border:1px solid var(--line); border-radius:17px; background:#fff; }
  .side-nav button { padding:11px 12px; border-radius:11px; text-align:left; color:var(--muted); background:transparent; }
  .search-row { display:flex; gap:8px; margin-top:20px; }
  .search-row input { flex:1; min-width:0; padding:11px 13px; border:1px solid var(--line); border-radius:12px; background:#fafbfc; }
  .result { display:flex; flex-direction:column; gap:5px; margin-top:18px; padding:16px; border:1px solid var(--line); border-radius:15px; background:var(--soft); }
  .result span { color:var(--muted); }
  .result.error { color:#8e2f2f; border-color:#f0caca; background:#fff1f1; }
  .trace-grid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px; }
  .menu-group { margin-top:20px; }
  .menu-group h3 { margin:0 0 9px; font-size:14px; }
  .menu-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; }
  .menu-item { display:flex; flex-direction:column; gap:5px; padding:14px; border:1px solid var(--line); border-radius:14px; text-align:left; background:#fff; }
  .menu-item span { color:var(--muted); font-size:12px; }
  .menu-item[disabled] { opacity:.55; }
  .cart { display:flex; flex-direction:column; gap:6px; margin:18px 0 0; padding:0; list-style:none; }
  .cart li { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--line); border-radius:12px; background:#fff; }
  .cart-name em { color:var(--muted); font-style:normal; font-size:12px; }
  .cart-qty { display:flex; align-items:center; gap:8px; }
  .cart-qty button { width:28px; height:28px; border-radius:9px; background:var(--soft); color:var(--ink); font-weight:700; }
  .cart-money { min-width:88px; text-align:right; font-variant-numeric:tabular-nums; }
  .approval-list { display:flex; flex-direction:column; gap:8px; margin:18px 0 0; padding:0; list-style:none; }
  .approval-list li { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; align-items:center; gap:12px; padding:12px 14px; border:1px solid var(--line); border-radius:13px; background:#fff; }
  .approval-label { display:flex; flex-direction:column; gap:2px; }
  .approval-label em { color:var(--muted); font-style:normal; font-size:12px; }
  .approval-meta { color:var(--muted); font-size:13px; }
  .approval-list button { padding:9px 14px; border-radius:11px; color:#fff; background:var(--brand); font-weight:700; }
  .approval-list button[disabled] { opacity:.6; }
  .report-sub { margin:26px 0 10px; font-size:14px; }
  .report { width:100%; margin-top:4px; border-collapse:collapse; font-size:13px; }
  .report th,.report td { padding:9px 10px; text-align:right; border-bottom:1px solid var(--line); }
  .report th:first-child,.report td:first-child { text-align:left; }
  .report th { color:var(--muted); font-weight:600; font-size:12px; }
  .report td { font-variant-numeric:tabular-nums; }
  .notice.alerts { border-color:#f0caca; background:#fff1f1; color:#8e2f2f; }
  @media (max-width:700px) {
    .cart li { grid-template-columns:minmax(0,1fr) auto; row-gap:6px; }
    .cart-money { grid-column:1 / -1; text-align:left; }
    .approval-list li { grid-template-columns:1fr; }
    .report { font-size:12px; }
    .report th,.report td { padding:7px 6px; }
    .app-shell { padding:16px; }
    .workspace { grid-template-columns:1fr; }
    .side-nav { display:grid; grid-template-columns:repeat(4,1fr); overflow:auto; }
    .side-nav button { text-align:center; white-space:nowrap; padding:9px 10px; }
    .metric-grid { grid-template-columns:1fr; }
    .menu-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .notice { flex-direction:column; gap:1px; }
  }
</style>
</head>
<body>
<div id="app"></div>
<script>
/* Config lấy nguyên từ posgieo.html của hệ cũ — cùng project the-cafe-33, nên
   hệ mới đọc đúng dữ liệu hệ cũ. Đây là dữ liệu CLIENT, ai mở file cũng đọc
   được; hệ cũ vốn đã như vậy. Cái chặn thật là Firebase Security Rules phía
   server, không phải chỗ cất chuỗi này. */
window.GIEO_FIREBASE = ${JSON.stringify({ config: fb.config, account: fb.account, storeId: fb.storeId, cutoverDate: fb.cutoverDate }, null, 1)};
</script>
<script>
${js}
</script>
</body>
</html>
`;
}

/* Chặn phát hành bundle vi phạm import-direction. Build không được phép là
   đường vòng qua checker. */
try {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/check-import-direction.js')], { stdio: 'inherit' });
} catch (e) {
  console.error('\nBuild dừng: import-direction FAIL.\n');
  process.exit(1);
}

const fb = legacyFirebase();
fb.storeId = 'store_main';
/* Mốc cutover đã chốt với chủ quán. Nằm ở đây vì nó là cấu hình triển khai,
   không phải luật nghiệp vụ — đổi ngày là build lại, không sửa code. */
fb.cutoverDate = '2026-09-20';
console.log(`  Firebase: project ${fb.config.projectId}, SDK ${fb.sdkVersion}, tài khoản ${fb.account.email}`);

fs.mkdirSync(DIST, { recursive: true });
for (const [key, cfg] of Object.entries(APPS)) {
  const html = shell(cfg.title, buildBundle(key), fb, legacyCss(key));
  const dest = path.join(DIST, cfg.out);
  fs.writeFileSync(dest, html);
  console.log(`  ${cfg.out}  ${(html.length / 1024).toFixed(1)} KB`);
}
console.log('Build xong.');
