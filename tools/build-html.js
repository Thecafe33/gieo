#!/usr/bin/env node
/**
 * Gộp nguồn thành 2 file HTML TỰ CHỨA: dist/posgieo-new.html, dist/quanlygieo-new.html
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
  pos: { out: 'posgieo-new.html', title: 'GIEO — POS', entry: 'app-pos/main' },
  quanly: { out: 'quanlygieo-new.html', title: 'GIEO — Quản lý', entry: 'app-quanly/main' }
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
  js += `\n/* ===== khởi động ===== */\nGIEO.require(${JSON.stringify(APPS[appKey].entry)}).start();\n`;
  return js;
}

function shell(title, js) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  #app { padding: 16px; }
</style>
</head>
<body>
<div id="app"></div>
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

fs.mkdirSync(DIST, { recursive: true });
for (const [key, cfg] of Object.entries(APPS)) {
  const html = shell(cfg.title, buildBundle(key));
  const dest = path.join(DIST, cfg.out);
  fs.writeFileSync(dest, html);
  console.log(`  ${cfg.out}  ${(html.length / 1024).toFixed(1)} KB`);
}
console.log('Build xong.');
