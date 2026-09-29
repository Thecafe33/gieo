// Ảnh chụp hành vi các nghiệp vụ Quản lý chuyển NGUYÊN VĂN vào engine (E4, app='quanly').
// Ảnh chụp lập từ quanlygieo.html GỐC (trước E3): CORE=html CORE_HTML=<file> UPDATE=1.
'use strict';
const fs = require('fs'); const path = require('path');
const { makeFake, normalize, dropStore, storeGaps, markFirstCall } = require('./lib/fakefb');
const { extract } = require('./lib/extract');
const { loadEngineModule } = require('./lib/engine');
const SNAP = path.join(__dirname, 'snapshots', 'ql.json');
const kind = process.env.CORE || 'engine';
const QL_NAMES = ['setLocationStock', 'prepBatchSetQtyCore', 'prepBatchRestoreCore', 'approvePendingLostReportsForItem', 'ctnAdjustCore'];
const pad = n => String(n).padStart(2, '0');
function env0() {
  const calls = [];
  return { calls, app: { dkey: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, fmtNum: (n, k) => Number(n).toFixed(k || 0), memoDropItems: () => calls.push(['memoDropItems']) } };
}
function loadHtml(fake, env) {
  const file = process.env.CORE_HTML || 'quanlygieo.html';
  const src = `const CTN_COLL='stock_containers_gieogieo', STOCK_ANOMALY_COLL='stock_anomalies_gieogieo';\n` +
    extract(file, ['_ueActiveUnitsRef', 'isTemTrackedItem', 'logStockAnomaly', 'recomputeTemStock', 'recomputePrepStock', ...QL_NAMES]);
  const g = { fstore: fake.fstore, db: fake.db, firebase: fake.firebase, Date: fake.clock.Date, Math: fake.rnd.Math,
    dkey: env.app.dkey, fmtNum: env.app.fmtNum, memoDropItems: env.app.memoDropItems, memoDropPreps() {},
    setTimeout: f => setImmediate(f), console: { log() {}, warn() {}, error() {} } };
  const n = Object.keys(g);
  return new Function(...n, src + '\nreturn {' + QL_NAMES.join(',') + '};')(...n.map(k => g[k]));
}
function loadEng(fake, env) {
  const UE = loadEngineModule();
  UE.init({ app: 'quanly', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => fake.clock.now(), random: () => fake.rnd.random(),
    businessDate: () => env.app.dkey(new fake.clock.Date()), appFns: env.app,
    hooks: { stockChanged: (id, kind) => { if (kind !== 'prep') env.calls.push(['memoDropItems']); } } });
  const out = {}; for (const k of QL_NAMES) out[k] = UE.fn[k]; return out;
}
const S = {};
S.Q_dat_ton_quay = async F => F.setLocationStock({ itemId: 'X', locationId: 'quay', locationName: 'Quầy', qty: 300, staff: 'QL' });
S.Q_sua_so_lo_active = async F => F.prepBatchSetQtyCore('b1', 250);
S.Q_khoi_phuc_lo = async F => F.prepBatchRestoreCore('b9', 120);
S.Q_duyet_bao_mat = async (F, fake) => {
  await fake.fstore.collection('stock_lost_reports_gieogieo').doc('lr1').set({ itemId: 'X', containerId: 'A', code: 'AAA', status: 'pending_review', reportedBy: 'NV' });
  await fake.fstore.collection('stock_lost_reports_gieogieo').doc('lr2').set({ itemId: 'X', containerId: 'S1', code: 'SSS', status: 'pending_review', reportedBy: 'NV' });
  return F.approvePendingLostReportsForItem('X', 'cnt1', ['AAA', 'SSS']);
};
S.Q_can_lai_ma = async F => [await F.ctnAdjustCore({ id: 'B', itemId: 'X', code: 'BBB', unit: 'ml' }, 280, 300, 'mgradj_1', 'cân lại'), await F.ctnAdjustCore({ id: 'B', itemId: 'X', code: 'BBB', unit: 'ml' }, 280, 300, 'mgradj_1', 'cân lại')];
S.Q_can_lai_ma_sai_moc = async F => F.ctnAdjustCore({ id: 'B', itemId: 'X', code: 'BBB', unit: 'ml' }, 280, 999, 'mgradj_2', '');
function seed() {
  return {
    rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 100, capacity: 1000, openedAt: 1000 }, B: { code: 'BBB', unitBase: 300, capacity: 1000, openedAt: 2000 } }, P: { b1: { code: 'L1', unitBase: 400, capacity: 800, openedAt: 500 } } } },
    fs: {
      'inventory_items_gieogieo/X': { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 1400, locationStock: { quay: 50 } },
      'prep_items_gieogieo/P': { name: 'Cốt', currentStock: 400 },
      'stock_containers_gieogieo/A': { itemId: 'X', code: 'AAA', status: 'open', unitBase: 100, baseQty: 1000 },
      'stock_containers_gieogieo/B': { itemId: 'X', code: 'BBB', status: 'open', unitBase: 300, baseQty: 1000 },
      'stock_containers_gieogieo/S1': { itemId: 'X', code: 'SSS', status: 'sealed', unitBase: 1000, baseQty: 1000 },
      'prep_batches_gieogieo/b1': { prepId: 'P', batchCode: 'L1', status: 'active', qtyRemaining: 400, qtyInitial: 800 },
      'prep_batches_gieogieo/b9': { prepId: 'P', batchCode: 'L9', prepName: 'Cốt', unit: 'ml', status: 'used_up', qtyInitial: 500, qtyRemaining: 0, usedUpAt: '2026-09-27T09:00:00.000Z', finishedAt: '2026-09-26T08:00:00.000Z' },
      'prep_transactions_gieogieo/w1': { prepId: 'P', businessDate: '2026-09-27', type: 'WASTE', qty: -120, createdAt: '2026-09-27T09:00:00.000Z', fromPrepCount: true, note: 'đếm' }
    }
  };
}
async function runOne(name) {
  const fake = makeFake(seed()); const env = env0();
  const F0 = kind === 'html' ? loadHtml(fake, env) : loadEng(fake, env);
  const mark = { i: null }; const F = markFirstCall(F0, fake, mark);
  let result, error = null;
  try { result = await S[name](F, fake, env); } catch (e) { error = String(e && e.message || e); }
  await new Promise(r => setImmediate(r)); await new Promise(r => setTimeout(r, 5));
  if (result && result.b) result = { ...result, b: '<b>' };
  if (Array.isArray(result)) result = result.map(x => (x && x.b ? { ...x, b: '<b>' } : x));
  const log = fake.log.map((x, i) => [x, i]).sort((a, b) => (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : a[1] - b[1])).map(x => x[0]);
  const gaps = kind === 'engine' ? storeGaps(fake.FS, seed().fs, fake.log, mark.i) : null;
  return normalize(dropStore({ result: result === undefined ? null : result, error, rt: fake.RT.root, fs: fake.FS, log, calls: env.calls }, gaps));
}
// Khác biệt CÓ CHỦ ĐÍCH so với bản gốc (chủ dự án duyệt): F1 — khôi phục lô giữ openedAt gốc.
const INTENDED = { Q_khoi_phuc_lo: g => { g.rt.active_units_gieogieo.P.b9.openedAt = '<F1:finishedAt>'; } };
(async () => {
  const out = {}; for (const n of Object.keys(S)) out[n] = await runOne(n);
  if (process.env.UPDATE === '1') { fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify(out, null, 1)); console.log('ok đã ghi ảnh chụp (' + kind + ')'); console.log('ALL PASS'); return; }
  const golden = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  let ok = true;
  for (const n of Object.keys(S)) {
    const g = JSON.parse(JSON.stringify(golden[n])), o = JSON.parse(JSON.stringify(out[n]));
    if (INTENDED[n]) { INTENDED[n](g); const f1 = o.rt.active_units_gieogieo.P.b9.openedAt; if (f1 === Date.parse('2026-09-26T08:00:00.000Z') || /^<T/.test(String(f1))) INTENDED[n](o); }
    if (JSON.stringify(o) === JSON.stringify(g)) { console.log('ok ' + n); continue; }
    ok = false; console.log('FAIL ' + n);
    for (const k of ['result', 'error', 'rt', 'fs', 'log', 'calls', 'storeGaps']) if (JSON.stringify(o[k]) !== JSON.stringify(g[k])) console.log('   khác ở ' + k + ':\n     mới ' + String(JSON.stringify(o[k])).slice(0, 700) + '\n     cũ  ' + String(JSON.stringify(g[k])).slice(0, 700));
  }
  console.log('nguồn: ' + kind); console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
