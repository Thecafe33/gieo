// Kiểm tra trước deploy (mục 6.7 kế hoạch) — phần kiểm tra THƯ MỤC DEPLOY. Gọi qua tools/predeploy_check.sh.
//   node tools/predeploy_check.js <thư mục deploy>      (bỏ trống = thư mục chứa tools/)
// Mã thoát 1 nếu có lỗi. Kiểm:
//   1. HTML nào trỏ tới unit_engine.v{N}.js / che_do_thu.v{N}.js thì file đó phải có trong thư mục.
//   2. Mỗi CẶP app (thật: posgieo + quanlygieo; thử: posgieo_thu + quanlygieo_thu) dùng CÙNG một bản engine.
//      Cặp thật chưa dùng engine (bản cũ) → được phép, chỉ nhắc (giai đoạn thử bản mới).
//   3. Thiếu unit_engine.v{N-1}.js khi bản N của APP THẬT lên chưa đủ 7 ngày (tools/engine_releases.txt).
//   4. firebase.json có headers: engine immutable, HTML thật no-cache; (nhắc) HTML thử no-cache.
//   5. (predeploy_check.sh) rào ranh giới + test — chạy trên code nguồn.
//   6. (nếu có tools/site_files.txt) không thiếu file của XOFA / The Cafe 33.
//   7. CHẾ ĐỘ THỬ: app THẬT tuyệt đối không nạp che_do_thu / không gọi GieoThu.install;
//      bản thử PHẢI có đủ: nạp che_do_thu, chốt trước initializeApp, đúng 1 lần GieoThu.install.
//   8. (nhắc) thư mục deploy có tools/ tests/ docs/ … mà firebase.json không "ignore" → bị công khai trên web.
'use strict';
const fs = require('fs'); const path = require('path');
const SRC = path.resolve(__dirname, '..');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : SRC;
const loi = []; const nhac = [];
const doc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const co = f => fs.existsSync(path.join(ROOT, f));
const srcDoc = f => (fs.existsSync(path.join(SRC, f)) ? fs.readFileSync(path.join(SRC, f), 'utf8') : '');
const code = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

// 1 + 2 + 7
const CAP = { that: ['posgieo.html', 'quanlygieo.html'], thu: ['posgieo_thu.html', 'quanlygieo_thu.html'] };
const banThat = {}, banThu = {};
function kiemHtml(h, laThu) {
  const src = doc(h), c = code(src);
  const eng = [...src.matchAll(/<script\s+src="(unit_engine\.v(\d+)\.js)(?:\?[^"]*)?"/g)];
  if (eng.length > 1) loi.push(h + ': có ' + eng.length + ' thẻ engine (chỉ được 1)');
  if (eng.length === 1 && !co(eng[0][1])) loi.push(h + ' trỏ tới ' + eng[0][1] + ' nhưng file này KHÔNG có trong thư mục');
  const thu = [...src.matchAll(/<script\s+src="(che_do_thu\.v\d+\.js)(?:\?[^"]*)?"/g)];
  const install = (c.match(/GieoThu\.install\(/g) || []).length;
  if (!laThu) {
    if (thu.length || install) loi.push(h + ': APP THẬT đang nạp CHẾ ĐỘ THỬ — tuyệt đối không deploy (chép nhầm bản _thu?)');
  } else {
    if (thu.length !== 1) loi.push(h + ': bản thử phải nạp đúng 1 che_do_thu.v*.js (thấy ' + thu.length + ') — sinh lại bằng tools/tao_ban_thu.js');
    else if (!co(thu[0][1])) loi.push(h + ' trỏ tới ' + thu[0][1] + ' nhưng file này KHÔNG có trong thư mục');
    if (install !== 1) loi.push(h + ': bản thử phải gọi GieoThu.install đúng 1 lần (thấy ' + install + ')');
    const iGuard = src.indexOf('if (!window.GieoThu)'), iInit = src.search(/firebase\.initializeApp\(/);
    if (iGuard < 0 || iInit < 0 || iGuard > iInit) loi.push(h + ': bản thử thiếu chốt "thiếu che_do_thu thì dừng" trước initializeApp');
    if (!eng.length) loi.push(h + ': bản thử không nạp Unit Engine');
  }
  return eng.length === 1 ? Number(eng[0][2]) : 0;
}
for (const h of CAP.that) { if (!co(h)) loi.push('Thiếu ' + h + ' trong thư mục'); else banThat[h] = kiemHtml(h, false); }
const coThu = CAP.thu.filter(co);
if (coThu.length === 1) loi.push('Chỉ có ' + coThu[0] + ' — bản thử phải có đủ cặp (sinh bằng tools/tao_ban_thu.js)');
for (const h of coThu) banThu[h] = kiemHtml(h, true);
const vThat = [...new Set(Object.values(banThat))], vThu = [...new Set(Object.values(banThu))];
if (vThat.length > 1) loi.push('Hai app THẬT dùng hai trạng thái engine khác nhau: ' + JSON.stringify(banThat));
if (vThu.length > 1) loi.push('Hai app THỬ dùng hai bản engine khác nhau: ' + JSON.stringify(banThu));
const N = vThat.length === 1 ? vThat[0] : null;
if (N === 0) nhac.push('App thật đang là bản CŨ (chưa dùng Unit Engine) — bình thường trong giai đoạn thử bản mới');

// 3 (theo engine của app thật)
if (N && N > 1 && !co('unit_engine.v' + (N - 1) + '.js')) {
  const rel = srcDoc('tools/engine_releases.txt') || (co('tools/engine_releases.txt') ? doc('tools/engine_releases.txt') : '');
  const m = new RegExp('^v' + N + '\\s+(\\d{4}-\\d{2}-\\d{2})', 'm').exec(rel);
  if (!m) loi.push('Thiếu unit_engine.v' + (N - 1) + '.js và tools/engine_releases.txt chưa ghi ngày lên v' + N + ' (dòng "v' + N + ' YYYY-MM-DD") — giữ bản cũ ≥ 7 ngày để quay lui');
  else {
    const ngay = (Date.now() - Date.parse(m[1] + 'T00:00:00')) / 86400000;
    if (ngay < 7) loi.push('Thiếu unit_engine.v' + (N - 1) + '.js — v' + N + ' mới lên ' + Math.floor(ngay) + ' ngày (< 7): giữ bản cũ để quay lui');
  }
}

// 4 + 8
if (!co('firebase.json')) loi.push('Không thấy firebase.json trong thư mục deploy');
else {
  let fj = null;
  try { fj = JSON.parse(doc('firebase.json')); } catch (e) { loi.push('firebase.json không đọc được: ' + e.message); }
  if (fj) {
    const hosts = [].concat(fj.hosting || []);
    const hs = [].concat(...hosts.map(h => h.headers || []));
    const cc = test => hs.filter(h => test(h.source || '')).flatMap(h => h.headers || []).filter(x => /cache-control/i.test(x.key)).map(x => x.value).join(' ');
    const dungEngine = N || vThu.some(Boolean);
    if (dungEngine && !/immutable/.test(cc(s => /unit_engine/.test(s)))) loi.push('firebase.json thiếu headers cho unit_engine.v*.js (Cache-Control ... immutable) — xem tools/firebase_headers_gieogieo.json');
    if (N && !/no-cache/.test(cc(s => /posgieo/.test(s) && /quanlygieo/.test(s) && !/_thu/.test(s)))) loi.push('firebase.json thiếu headers no-cache cho posgieo.html / quanlygieo.html — xem tools/firebase_headers_gieogieo.json');
    if (coThu.length && !/no-cache/.test(cc(s => /_thu/.test(s)))) nhac.push('firebase.json chưa đặt no-cache cho *_thu.html — bản thử có thể chậm ~1 giờ mới thấy bản mới (xem tools/firebase_headers_gieogieo.json)');
    const ign = [].concat(...hosts.map(h => h.ignore || [])).join(' ');
    const lo = ['tools', 'tests', 'docs', 'node_modules'].filter(d => co(d) && !new RegExp('(^|[/ *])' + d + '(/|\\b)').test(ign));
    if (lo.length) nhac.push('Thư mục deploy có ' + lo.join(', ') + ' mà firebase.json không "ignore" → sẽ bị CÔNG KHAI trên web. Thêm vào "ignore" của firebase.json (mẫu ở docs/CHE_DO_THU.md mục 1)');
    if (co('CLAUDE.md') && !/CLAUDE|\*\.md/.test(ign)) nhac.push('CLAUDE.md nằm trong thư mục deploy → sẽ bị công khai');
  }
}

// 6
const siteList = srcDoc('tools/site_files.txt') || (co('tools/site_files.txt') ? doc('tools/site_files.txt') : '');
if (siteList) {
  const ds = siteList.split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  const thieu = ds.filter(f => !co(f));
  if (thieu.length) loi.push('Thiếu file thương hiệu khác so với tools/site_files.txt (deploy sẽ XOÁ chúng khỏi host): ' + thieu.join(', '));
} else nhac.push('Chưa có tools/site_files.txt — nên liệt kê file chính của XOFA / The Cafe 33 để chặn deploy nhầm làm mất file của họ');

for (const x of nhac) console.log('ℹ️  ' + x);
if (loi.length) { for (const x of loi) console.log('❌ ' + x); console.log('=> KHÔNG ĐƯỢC DEPLOY (' + loi.length + ' lỗi)'); process.exit(1); }
console.log('✅ Thư mục deploy hợp lệ — app thật: ' + (N ? 'engine v' + N : 'bản cũ') + (coThu.length ? ' · bản thử: engine v' + vThu[0] : ''));
