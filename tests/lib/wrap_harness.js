// Chạy MỘT hàm nghiệp vụ của app (tên cũ, kèm phần giao diện) trên Firebase giả, theo hai cách:
//   'html'   — trích từ bản HTML GỐC (trước khi tách): hàm + mọi hàm lõi cũ nó gọi tới.
//   'engine' — trích từ bản HTML hiện tại + UnitEngine thật, init bằng CHÍNH khối UnitEngine.init của app.
// Mọi định danh toàn cục không có trong kịch bản được thay bằng hàm ghi vết (tên + tham số nguyên thuỷ),
// nên hai bản so được với nhau cả phần dữ liệu (RT/Firestore/thứ tự ghi) lẫn lời gọi ra giao diện.
'use strict';
const fs = require('fs'); const path = require('path');
const { makeFake, normalize, dropStore } = require('./fakefb');
const { extractOne } = require('./extract');
const { loadEngineModule } = require('./engine');
const ROOT = path.resolve(__dirname, '..', '..');


// Hằng đơn giản cấp cao nhất của file (tên collection, ngưỡng số...) — trích nguyên dòng.
function simpleConsts(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const re = /^const ([A-Z][A-Z0-9_]*)\s*=\s*('[^'\n]*'|-?[\d.]+(?:\s*\*\s*[\d.]+)*)\s*;/gm; let m; const seen = new Set(); const out = [];
  while ((m = re.exec(html))) if (!seen.has(m[1])) { seen.add(m[1]); out.push('const ' + m[1] + ' = ' + m[2] + ';'); }
  return out.join('\n') + '\n';
}
function fakeEl(id) {
  return { id, value: '', textContent: '', innerHTML: '', innerText: '', checked: false, disabled: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    focus() {}, blur() {}, click() {}, remove() {}, appendChild() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, scrollIntoView() {} };
}
// Trích các hàm có trong file (tên nào không có thì bỏ qua — sẽ thành hàm ghi vết).
function grabAll(file, names) {
  const out = []; const got = [];
  for (const n of [...new Set(names)]) { const s = extractOne(file, n); if (s) { out.push(s); got.push(n); } }
  return { src: out.join('\n'), got };
}
function initBlock(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const i = html.indexOf('UnitEngine.init({'); if (i < 0) throw new Error('không thấy UnitEngine.init trong ' + file);
  const j = html.indexOf('\n  });', i); if (j < 0) throw new Error('không thấy cuối khối init');
  return html.slice(i, j + 6).replace('UnitEngine.init({', 'UnitEngine.init({ now: () => __fake.clock.now(), random: () => __fake.rnd.random(), randomBytes: __rb,');
}

// spec: { app:'pos'|'ql', target, helpers:[tên hàm app thật cần trích kèm], oldHelpers:[chỉ bản gốc], scope:(fake, rec)=>({...}), call:(F, fake, env)=>Promise, seed:{rt,fs} }
// opts.thu = true: cài CHẾ ĐỘ THỬ (che_do_thu.v1.js) lên Firebase giả, chép dữ liệu thật vào vùng thử,
// chạy kịch bản, rồi trả thêm `thu` = { realFsChanged, realRtChanged, escaped[], testWrites } để kiểm cách ly.
function loadThu(fake) {
  const vm = require('vm');
  const sb = { firebase: fake.firebase, console: { log() {}, warn() {}, error() {}, info() {} }, setTimeout, Promise };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'che_do_thu.v1.js'), 'utf8'), sb, { filename: 'che_do_thu.v1.js' });
  return sb.GieoThu;
}
// opts.quan = 'gg01' | 'gg02' …: cài LỚP ĐƯỜNG DẪN ĐA CỬA HÀNG (data_access.v1.js) như app thật (sau chế độ thử nếu có).
// Quán khác gg01: dữ liệu S của kịch bản được chép sang tên có hậu tố (dữ liệu của quán đó), bản gốc giữ lại làm
// "mồi" = dữ liệu quán hiện tại; trả thêm `quan` = { gocDoi, ghiLot[], ghiChung[] } để kiểm cách ly.
function loadData() {
  const vm = require('vm');
  const sb = { console: { log() {}, warn() {}, error() {}, info() {} } };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, (require('fs').readdirSync(ROOT).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop())), 'utf8'), sb, { filename: 'data_access (bản mới nhất)' });
  return sb.GieoData;
}
async function runWrapped(kind, spec, opts) {
  const quanId = opts && opts.quan;
  const GD = quanId ? loadData() : null;
  const seed = JSON.parse(JSON.stringify(spec.seed));
  // S (riêng từng quán) + C (danh mục theo quán — Bước 2) = chỗ RIÊNG của quán.
  const laS = (k, p) => { const h = String(p).replace(/^\/+/, '').split('/')[0]; return GD.REG[k][h] === 'S' || GD.REG[k][h] === 'C'; };
  if (GD && quanId !== GD.LEGACY) {
    for (const [k, v] of Object.entries(seed.fs || {})) if (laS('fs', k)) seed.fs[GD.fsPath(k, quanId)] = JSON.parse(JSON.stringify(v));
    for (const [k, v] of Object.entries(seed.rt || {})) if (laS('rt', k)) seed.rt[GD.rtPath(k, quanId)] = JSON.parse(JSON.stringify(v));
  }
  const fake = makeFake(seed);
  let thu = null;
  if (opts && opts.thu) {
    const GT = loadThu(fake);
    GT.install({ app: spec.app, firebase: fake.firebase, db: fake.db, fstore: fake.fstore });
    await GT._seed();
    thu = { GT, realFs: JSON.stringify(Object.entries(fake.FS).filter(([k]) => !k.startsWith('__test_gieogieo/')).sort()),
      realRt: JSON.stringify(Object.fromEntries(Object.entries(fake.RT.root || {}).filter(([k]) => k !== '__test_gieogieo'))), logStart: fake.log.length };
  }
  let quan = null;
  if (GD) {
    GD.install({ fstore: fake.fstore, db: fake.db, storeId: quanId, catalogMirror: !!(opts && opts.mirror) });
    // Realtime DB không lưu nút rỗng ({}), Firebase giả tự tỉa chúng khi có lượt ghi bất kỳ → tỉa trước khi so.
    const tia = v => { if (!v || typeof v !== 'object') return v; const o = {}; for (const [k, x] of Object.entries(v)) { const y = tia(x); if (y !== undefined && !(y && typeof y === 'object' && !Object.keys(y).length)) o[k] = y; } return Object.keys(o).length ? o : undefined; };
    const goc = () => JSON.stringify([Object.entries(fake.FS).filter(([k]) => laS('fs', k.replace(/^__test_gieogieo\/data\//, ''))).sort(),
      Object.entries(fake.RT.root || {}).filter(([k]) => laS('rt', k)).map(([k, v]) => [k, tia(v)])]);
    quan = { goc, truoc: goc(), logStart: fake.log.length };
  }
  const calls = [];
  const prim = a => a.filter(x => x == null || typeof x !== 'object' && typeof x !== 'function');
  const rec = n => (...a) => { calls.push([n, ...prim(a)]); };
  const dom = {};
  const rb = a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(fake.rnd.random() * 256); return a; };
  const base = Object.assign({
    fstore: fake.fstore, db: fake.db, firebase: fake.firebase, Date: fake.clock.Date, Math: fake.rnd.Math,
    setTimeout: f => setImmediate(f), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    console: { log() {}, warn() {}, error() {}, info() {} },
    window: { crypto: { getRandomValues: rb }, addEventListener() {}, location: { reload: rec('reload') } },
    document: { getElementById: id => dom[id] || (dom[id] = fakeEl(id)), querySelector: () => null, querySelectorAll: () => [], createElement: t => fakeEl(t), body: fakeEl('body'), addEventListener() {} },
    confirm: () => true, STOCK_OPEN_LIST: [], alert: rec('alert'), __fake: fake, __rb: rb, __dom: dom
  }, spec.scope ? spec.scope(fake, rec, dom) : {});
  const scope = new Proxy(base, {
    has: (o, k) => typeof k === 'string' && (k in o || !(k in globalThis)),
    get: (o, k) => { if (k === Symbol.unscopables) return undefined; if (!(k in o)) o[k] = rec(String(k)); return o[k]; },
    set: (o, k, v) => { o[k] = v; return true; }
  });
  const isPos = spec.app === 'pos';
  const { CORE_NAMES } = require('./core_loader');
  const QL_CORE = ['_ueActiveUnitsRef', 'isTemTrackedItem', 'logStockAnomaly', 'recomputeTemStock', 'recomputePrepStock', 'applyStockTransaction', 'reverseIntoUnits'];
  // bản mới: các tên này là shim gọi UnitEngine.fn — trích kèm để lời gọi đi đúng vào engine
  const lib = isPos ? ['round2', 'fmtPrepQty', 'prepFlowError', ...CORE_NAMES] : QL_CORE;
  let src;
  if (kind === 'html') {
    const file = (isPos ? process.env.CORE_HTML : process.env.CORE_HTML_QL) || (isPos ? 'posgieo.html' : 'quanlygieo.html');
    src = simpleConsts(file) + grabAll(file, [spec.target, ...(spec.helpers || []), ...(spec.oldHelpers || []), ...lib]).src;
  } else {
    const file = isPos ? 'posgieo.html' : 'quanlygieo.html';
    base.UnitEngine = loadEngineModule();
    src = simpleConsts(file) + grabAll(file, [spec.target, ...(spec.exports || []), ...(spec.helpers || []), ...(spec.newHelpers || []), ...lib]).src + '\n' + initBlock(file) + ';\n';
  }
  const body = 'with (__scope) {\n' + src + '\nreturn { ' + [spec.target, ...(spec.exports || [])].join(', ') + ' };\n}';
  const F = new Function('__scope', body)(scope);
  let result, error = null;
  try { result = await spec.call(F, fake, base); } catch (e) { error = String(e && e.message || e); }
  for (let i = 0; i < 6; i++) { await new Promise(r => setImmediate(r)); await new Promise(r => setTimeout(r, 3)); }
  const log = fake.log.map((x, i) => [x, i]).sort((a, b) => (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : a[1] - b[1])).map(x => x[0]);
  if (quan && quanId !== GD.LEGACY) {
    const after = fake.log.slice(quan.logStart);
    const dauDuongDan = e => String(e[1]).replace(/^__test_gieogieo\/(data\/)?/, '').split('/')[0];
    const lot = after.filter(e => { const h = dauDuongDan(e); const k = e[0].startsWith('rt') ? 'rt' : 'fs'; return GD.REG[k][h] === 'S' || GD.REG[k][h] === 'C'; }).map(e => e.join(' '));
    const chung = [...new Set(after.filter(e => { const h = dauDuongDan(e); const k = e[0].startsWith('rt') ? 'rt' : 'fs'; return GD.REG[k][h] && GD.REG[k][h] !== 'S' && GD.REG[k][h] !== 'C'; }).map(e => dauDuongDan(e)))].sort();
    return { error, calls, quan: { gocDoi: quan.goc() !== quan.truoc, ghiLot: lot, ghiChung: chung, soGhi: after.length }, fake, thu: thu && { escaped: fake.log.slice(thu.logStart).filter(e => !(String(e[1]).startsWith('__test_gieogieo/') || e[1] === '__test_gieogieo')).map(e => e.join(' ')) } };
  }
  if (thu) {
    const after = fake.log.slice(thu.logStart);
    const escaped = after.filter(e => !(String(e[1]).startsWith('__test_gieogieo/') || e[1] === '__test_gieogieo')).map(e => e.join(' '));
    const realFs = JSON.stringify(Object.entries(fake.FS).filter(([k]) => !k.startsWith('__test_gieogieo/')).sort());
    const realRt = JSON.stringify(Object.fromEntries(Object.entries(fake.RT.root || {}).filter(([k]) => k !== '__test_gieogieo')));
    return { error, calls, thu: { realFsChanged: realFs !== thu.realFs, realRtChanged: realRt !== thu.realRt, escaped, testWrites: after.length }, fake, GT: thu.GT };
  }
  const keepCalls = spec.keepCalls ? calls.filter(c => spec.keepCalls.test(c[0])) : calls;
  // [E6 — R3] Quản lý có giờ máy chủ nên giờ ghi mốc B9 (_ueLastRecomputeStart) như POS; ảnh chụp gốc
  // (trước E6) không có → bỏ mốc này ở phía Quản lý trước khi so. Mốc R3 được test riêng (clock_e6.test.js).
  let fsOut = fake.FS;
  if (!isPos) { fsOut = JSON.parse(JSON.stringify(fake.FS)); for (const d of Object.values(fsOut)) if (d && typeof d === 'object') delete d._ueLastRecomputeStart; }
  return normalize(dropStore({ result: result === undefined ? null : result, error, rt: fake.RT.root, fs: fsOut, log, calls: keepCalls }));
}
module.exports = { runWrapped };
