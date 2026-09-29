// Ảnh chụp hành vi các nghiệp vụ E4 chuyển NGUYÊN VĂN vào engine (cùng cách snapshot_core):
// ảnh chụp lập từ bản HTML GỐC (trước E1 — CORE=html CORE_HTML=<file> UPDATE=1), rồi so với engine.
'use strict';
const fs = require('fs'); const path = require('path');
const { makeFake, normalize, dropStore, storeGaps, markFirstCall } = require('./lib/fakefb');
const { extract } = require('./lib/extract');
const { loadEngineModule } = require('./lib/engine');
const { CORE_NAMES } = require('./lib/core_loader');
const SNAP = path.join(__dirname, 'snapshots', 'e4.json');
const kind = process.env.CORE || 'engine';
// Hàm E4 đã chuyển (tên cũ) — mỗi nhóm thêm vào đây cùng kịch bản.
const E4_NAMES = ['writeAtomicContainerFinish', '_reverseAtomicContainerFinish', '_wastePrepQtyPOS', 'prepShortageClearAll'];
const C = 'stock_containers_gieogieo', PB = 'prep_batches_gieogieo', INV = 'inventory_items_gieogieo', PI = 'prep_items_gieogieo';
const ITEM = { id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit', countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] };
const ATOM = { id: 'K', name: 'Kit', unit: 'cái', trackingMode: 'unit', countUnitName: 'Cái', packagingUnits: [{ name: 'Cái', baseQty: 1 }] };
const staff = { fullName: 'NV A', id: 'e1' };

function env0() {
  const calls = [];
  const rec = n => (...a) => { calls.push([n, ...a.filter(x => x == null || typeof x !== 'object' && typeof x !== 'function')]); };
  const ui = new Proxy({}, { get: (o, k) => rec('ui.' + String(k)) });
  const state = {};   // trạng thái màn hình mà kịch bản cần (getter)
  const app = {};     // hàm tính toán thuần của app
  return { calls, rec, ui, state, app, items: [ITEM, ATOM], preps: [{ id: 'P', name: 'Cốt trà', unit: 'ml', costPerUnit: 3 }] };
}
function loadHtml(fake, env) {
  const file = process.env.CORE_HTML || 'posgieo.html';
  const src = `const STOCK_CONTAINERS_COLL='${C}',STOCK_ANOMALY_COLL='stock_anomalies_gieogieo',PREP_RECON_LOCK_COLL='prep_ingredient_locks_gieogieo',REVERSAL_CLAIM_STALE_MS=120000,MA_BANG_CHU='0123456789ABCDEFGHJKMNPQRSTVWXYZ';let STOCK_OPEN_LIST=[];\n`
    + extract(file, ['round2', 'fmtPrepQty', 'prepFlowError', ...CORE_NAMES, ...E4_NAMES]);
  const g = Object.assign({
    fstore: fake.fstore, db: fake.db, firebase: fake.firebase, Date: fake.clock.Date, Math: fake.rnd.Math,
    KHO_ITEMS_CACHE: env.items, PREP_ITEMS_CACHE_POS: env.preps, posDateKey: () => '2026-09-28',
    toast: env.rec('toast'), toastAutoReport: env.rec('report'), refreshFifoAlert: async () => { env.calls.push(['fifoChanged']); },
    closeStockScanSheet: env.rec('closeScanSheet'), _refreshStockUseListIfActive: env.rec('openUnitsChanged'),
    getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null,
    setTimeout: f => setImmediate(f), console: { log() {}, warn() {}, error() {}, info() {} },
    window: { crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(fake.rnd.random() * 256); return a; } } }
  }, new Proxy({}, { get: () => undefined }));
  // ui / state / app của app: trong bản HTML gốc là hàm/biến toàn cục cùng tên
  for (const k of Object.keys(env.uiNames || {})) g[k] = env.rec('ui.' + k);
  for (const [k, v] of Object.entries(env.state)) g[k] = v();
  for (const [k, v] of Object.entries(env.app)) g[k] = v;
  const names = Object.keys(g);
  return new Function(...names, src + '\nreturn {' + E4_NAMES.join(',') + '};')(...names.map(n => g[n]));
}
function loadEng(fake, env) {
  const UE = loadEngineModule();
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28',
    now: () => fake.clock.now(), random: () => fake.rnd.random(), randomBytes: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(fake.rnd.random() * 256); return a; },
    getItems: () => env.items, getPreps: () => env.preps,
    hooks: { notify: env.rec('toast'), report: env.rec('report'), fifoChanged: async () => { env.calls.push(['fifoChanged']); }, closeScanSheet: env.rec('closeScanSheet'), openUnitsChanged: env.rec('openUnitsChanged') },
    ui: env.ui, state: env.state, appFns: env.app });
  const out = {}; for (const n of E4_NAMES) out[n] = UE.fn[n]; return out;
}
const S = {};
S.G1_tra_tem_cai_roi_ve_seal = async (F, fake) => { await fake.fstore.collection(C).doc('k1').set({ itemId: 'K', code: 'KK1', status: 'finished', finishedFromStatus: 'sealed', baseQty: 1 }); return F._reverseAtomicContainerFinish('k1', 'mb1', staff, 'huỷ mẻ'); };
S.G1_tra_tem_cai_roi_ve_mo = async (F, fake) => { await fake.fstore.collection(C).doc('k2').set({ itemId: 'K', code: 'KK2', status: 'finished', finishedFromStatus: 'open', baseQty: 1, openedAt: '2026-09-27T01:00:00.000Z' }); return F._reverseAtomicContainerFinish('k2', 'mb1', staff, 'huỷ mẻ'); };
S.G1_do_ly_btp = async F => [await F._wastePrepQtyPOS('P', 150, 'đổ ly', staff, { reason: 'Ly bị đổ' }, 'dw_1'), await F._wastePrepQtyPOS('P', 150, 'đổ ly', staff, { reason: 'Ly bị đổ' }, 'dw_1')];
S.G1_do_ly_btp_chua_lo = async F => F._wastePrepQtyPOS('Q', 20, 'đổ ly', staff, null, 'dw_2');
S.G1_xoa_am_btp = async (F, fake) => { await fake.db.ref('active_units_gieogieo/P/b2').update({ unitBase: -40 }); return F.prepShortageClearAll({ P: 40 }); };
S.G1_bao_het_cai_roi = async (F, fake) => { await fake.db.ref('active_units_gieogieo/K/k3').set({ code: 'KK3', unitBase: -1, openedAt: 1 }); return F.writeAtomicContainerFinish(fake.fstore.collection(C).doc('k3'), { itemId: 'K', code: 'KK3', status: 'open' }, staff, 'het', true); };

function seed() {
  return {
    rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 100, capacity: 800, openedAt: 500 }, b2: { code: 'L2', unitBase: 800, capacity: 800, openedAt: 600 } } } },
    fs: {
      [INV + '/K']: { ...ATOM, currentStock: 3 }, [INV + '/X']: { ...ITEM, currentStock: 0 },
      [PI + '/P']: { name: 'Cốt trà', code: 'CT', unit: 'ml', currentStock: 900, costPerUnit: 3 }, [PI + '/Q']: { name: 'Thạch', unit: 'g', currentStock: 0 },
      [PB + '/b1']: { prepId: 'P', status: 'active', unitBase: 100 }, [PB + '/b2']: { prepId: 'P', status: 'active', unitBase: 800 },
      [C + '/k3']: { itemId: 'K', code: 'KK3', status: 'open', baseQty: 1 }
    }
  };
}
async function runOne(name) {
  const fake = makeFake(seed()); const env = env0();
  const F0 = kind === 'html' ? loadHtml(fake, env) : loadEng(fake, env);
  const mark = { i: null }; const F = markFirstCall(F0, fake, mark);
  let result, error = null;
  try { result = await S[name](F, fake, env); } catch (e) { error = String(e && e.message || e) + (e && e.code ? ' [' + e.code + ']' : ''); }
  await new Promise(r => setImmediate(r)); await new Promise(r => setTimeout(r, 5));
  const log = fake.log.map((x, i) => [x, i]).sort((a, b) => (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : a[1] - b[1])).map(x => x[0]);
  const gaps = kind === 'engine' ? storeGaps(fake.FS, seed().fs, fake.log, mark.i) : null;
  return normalize(dropStore({ result: result === undefined ? null : result, error, rt: fake.RT.root, fs: fake.FS, log, calls: env.calls }, gaps));
}
(async () => {
  const out = {}; for (const n of Object.keys(S)) out[n] = await runOne(n);
  let golden = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : {};
  if (process.env.UPDATE === '1') {
    // chỉ ghi các kịch bản chưa có (hoặc ONLY=tên1,tên2) — ảnh chụp cũ giữ nguyên
    const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
    for (const n of Object.keys(out)) if (only ? only.includes(n) : !golden[n]) golden[n] = out[n];
    fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify(golden, null, 1));
    console.log('ok đã ghi ảnh chụp (' + kind + ')'); console.log('ALL PASS'); return;
  }
  let ok = true;
  for (const n of Object.keys(S)) {
    if (!golden[n]) { ok = false; console.log('FAIL chưa có ảnh chụp ' + n); continue; }
    if (JSON.stringify(out[n]) === JSON.stringify(golden[n])) { console.log('ok ' + n); continue; }
    ok = false; console.log('FAIL ' + n);
    for (const k of ['result', 'error', 'rt', 'fs', 'log', 'calls', 'storeGaps']) if (JSON.stringify(out[n][k]) !== JSON.stringify(golden[n][k])) console.log('   khác ở ' + k + ':\n     mới ' + String(JSON.stringify(out[n][k])).slice(0, 500) + '\n     cũ  ' + String(JSON.stringify(golden[n][k])).slice(0, 500));
  }
  console.log('nguồn: ' + kind); console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
