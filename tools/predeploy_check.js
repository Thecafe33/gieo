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
//   10. Lớp đường dẫn đa cửa hàng: HTML nạp data_access.v*.js thì file đó phải có (check_paths.js chạy riêng trong predeploy_check.sh).
//   9. BẢN ĐO (posgieo_dem / quanlygieo_dem — tools/tao_ban_dem.js): nhúng đúng 1 bộ đếm, không chế độ thử;
//      app thật và bản thử KHÔNG được nạp dem_luot_doc.
//   8. (nhắc) thư mục deploy có tools/ tests/ docs/ … mà firebase.json không "ignore" → bị công khai trên web.
//  11. [Tách posgieo — T10] firebase.json tìm ở thư mục deploy HOẶC thư mục cha (Hosting thật: firebase.json cạnh public/,
//      deploy = public/) và "public" phải trỏ đúng thư mục deploy; MỌI file JS cục bộ app Gieo nạp (cả js/…, cả
//      document.write) phải có; có js/posgieo → header immutable cho /js/posgieo/**; rewrites "**" → nhắc (JS thiếu bị trả
//      HTML); tên trong js/ viết thường, không hai đường chỉ khác hoa/thường (bộ nhớ /sdcard không phân biệt).
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
  // [Đa cửa hàng — Bước 1] HTML nào nạp lớp đường dẫn thì file đó phải có trong thư mục deploy.
  for (const m of src.matchAll(/<script\s+src="(data_access\.v\d+\.js)(?:\?[^"]*)?"/g)) if (!co(m[1])) loi.push(h + ' trỏ tới ' + m[1] + ' nhưng file này KHÔNG có trong thư mục');
  const thu = [...src.matchAll(/<script\s+src="(che_do_thu\.v\d+\.js)(?:\?[^"]*)?"/g)];
  const install = (c.match(/GieoThu\.install\(/g) || []).length;
  if (/\[BẢN ĐO\]|dem_luot_doc|demLuotDoc/.test(src)) loi.push(h + ': có BỘ ĐẾM lượt đọc (bản đo) — chỉ *_dem.html được có (chép nhầm bản _dem?)');
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
function N0() { const v = [...new Set(Object.values(banThat))]; return v.length === 1 ? v[0] : 0; }
// [T1 tối ưu đọc] Bản ĐO (posgieo_dem / quanlygieo_dem, sinh bằng tools/tao_ban_dem.js): app thật + bộ đếm, chạy DỮ LIỆU THẬT.
for (const h of ['posgieo_dem.html', 'quanlygieo_dem.html'].filter(co)) {
  const src = doc(h);
  const dem = (src.match(/<script>\/\* \[BẢN ĐO\] bộ đếm lượt đọc/g) || []).length;
  if (dem !== 1) loi.push(h + ': bản đo phải nhúng đúng 1 bộ đếm (thấy ' + dem + ') — sinh lại bằng tools/tao_ban_dem.js');
  if (/che_do_thu\./.test(code(src))) loi.push(h + ': bản đo không được nạp chế độ thử');
  const eng = /<script\s+src="(unit_engine\.v(\d+)\.js)(?:\?[^"]*)?"/.exec(src);
  if (eng && N0() && Number(eng[2]) !== N0()) nhac.push(h + ' dùng engine v' + eng[2] + ' khác app thật — sinh lại bằng tools/tao_ban_dem.js cho khớp');
}
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

// 11 — mọi JS cục bộ của app Gieo phải có trong thư mục deploy (kể cả js/posgieo/… và chuỗi nạp lại document.write)
const { jsCucBoCua } = require('./tach_posgieo/nguon');
const APP_GIEO = ['posgieo.html', 'quanlygieo.html', 'posgieo_thu.html', 'quanlygieo_thu.html', 'posgieo_dem.html', 'quanlygieo_dem.html', 'quanlygieo2.html'].filter(co);
const jsApp = new Set();
for (const h of APP_GIEO) for (const f of jsCucBoCua(doc(h))) { jsApp.add(f); if (!co(f)) loi.push(h + ' nạp ' + f + ' nhưng file này KHÔNG có trong thư mục deploy' + (f.includes('/') ? ' (chép GIỮ NGUYÊN thư mục con, không chép phẳng)' : '')); }
const coJsPosgieo = [...jsApp].some(f => f.startsWith('js/posgieo/'));
if (fs.existsSync(path.join(ROOT, 'js'))) {
  const walkJs = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkJs(d + '/' + e.name) : [d + '/' + e.name]);
  const tatCa = walkJs('js');
  for (const f of tatCa) if (/^js\/posgieo\//.test(f) && f !== f.toLowerCase()) loi.push(f + ': tên trong js/posgieo phải viết thường (bộ nhớ /sdcard không phân biệt hoa/thường)');
  const gap = {}; for (const f of tatCa.concat(fs.readdirSync(ROOT))) { const k = f.toLowerCase(); (gap[k] = gap[k] || []).push(f); }
  for (const v of Object.values(gap)) if (v.length > 1) loi.push('Hai đường chỉ khác hoa/thường (trên /sdcard sẽ đè nhau): ' + v.join(' , '));
}

// 4 + 8 — firebase.json: ở thư mục deploy, hoặc ở thư mục cha khi deploy = <cha>/public (cấu hình Hosting thật 25/10)
let FJ = null;
if (co('firebase.json')) FJ = path.join(ROOT, 'firebase.json');
else if (fs.existsSync(path.join(ROOT, '..', 'firebase.json'))) FJ = path.join(ROOT, '..', 'firebase.json');
if (!FJ) loi.push('Không thấy firebase.json trong thư mục deploy hoặc thư mục cha của nó');
else {
  let fj = null;
  try { fj = JSON.parse(fs.readFileSync(FJ, 'utf8')); } catch (e) { loi.push('firebase.json không đọc được: ' + e.message); }
  if (fj && FJ !== path.join(ROOT, 'firebase.json')) {
    // realpath hai phía: đường symlink (Termux ~/storage/shared ↔ /sdcard) là cùng một chỗ
    const real = q => { try { return fs.realpathSync(q); } catch (e) { return path.resolve(q); } };
    const pubs = [].concat(fj.hosting || []).map(h => real(path.resolve(real(path.dirname(FJ)), h.public || '.')));
    if (!pubs.includes(real(ROOT))) loi.push('firebase.json ở ' + path.dirname(FJ) + ' nhưng "public" không trỏ tới thư mục đang kiểm (' + ROOT + ') — kiểm đúng thư mục deploy chưa?');
  }
  if (fj) {
    const hosts = [].concat(fj.hosting || []);
    const hs = [].concat(...hosts.map(h => h.headers || []));
    const cc = test => hs.filter(h => test(h.source || '')).flatMap(h => h.headers || []).filter(x => /cache-control/i.test(x.key)).map(x => x.value).join(' ');
    const dungEngine = N || vThu.some(Boolean);
    if (dungEngine && !/immutable/.test(cc(s => /unit_engine/.test(s)))) loi.push('firebase.json thiếu headers cho unit_engine.v*.js (Cache-Control ... immutable) — xem tools/firebase_headers_gieogieo.json');
    if (N && !/no-cache/.test(cc(s => /posgieo/.test(s) && /quanlygieo/.test(s) && !/_thu/.test(s)))) loi.push('firebase.json thiếu headers no-cache cho posgieo.html / quanlygieo.html — xem tools/firebase_headers_gieogieo.json');
    if (coThu.length && !/no-cache/.test(cc(s => /_thu/.test(s)))) nhac.push('firebase.json chưa đặt no-cache cho *_thu.html — bản thử có thể chậm ~1 giờ mới thấy bản mới (xem tools/firebase_headers_gieogieo.json)');
    if (coJsPosgieo && !/immutable/.test(cc(s => /^\/?js\/posgieo\//.test(s)))) loi.push('firebase.json thiếu headers cho /js/posgieo/** (Cache-Control ... immutable) — xem tools/firebase_headers_gieogieo.json');
    const rw = [].concat(...hosts.map(h => h.rewrites || [])).filter(r => /\*\*/.test(r.source || ''));
    if (rw.length) nhac.push('firebase.json có rewrites "**" → file JS thiếu sẽ bị trả về HTML (mã 200) thay vì 404; trình duyệt báo lỗi cú pháp, khó nhận ra');
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
