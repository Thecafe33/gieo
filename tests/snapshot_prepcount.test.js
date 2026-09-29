// Ảnh chụp hành vi "Kiểm kê BTP cuối ca" (_submitPrepCountImpl) — E4: phần ghi lô/RT/sổ/cảnh báo
// chuyển vào engine (prep.countCommitLine). Ảnh chụp lập từ posgieo.html GỐC (trước E1):
//   CORE=html CORE_HTML=<file gốc> UPDATE=1 node tests/snapshot_prepcount.test.js
// Bản mới: _submitPrepCountImpl trích từ posgieo.html hiện tại + UnitEngine thật.
'use strict';
const fs = require('fs'); const path = require('path');
const { makeFake, normalize, dropStore, storeGaps } = require('./lib/fakefb');
const { extract } = require('./lib/extract');
const { loadCore } = require('./lib/core_loader');
const { loadEngineModule } = require('./lib/engine');
const SNAP = path.join(__dirname, 'snapshots', 'prepcount.json');
const kind = process.env.CORE || 'engine';
const PB = 'prep_batches_gieogieo', PI = 'prep_items_gieogieo';
const NAMES = ['handoverIsOverThreshold', '_submitPrepCountImpl'];
const CONSTS = 'const HANDOVER_TOLERANCE_PCT = 0.05, HANDOVER_TOLERANCE_FLOOR = 1;\n';

function env0(state) {
  const calls = [];
  const rec = n => (...a) => { calls.push([n, ...a.filter(x => x == null || typeof x !== 'object' && typeof x !== 'function')]); };
  const shiftState = { businessDate: '2026-09-28', closing: state.closing || null };
  return {
    calls, shiftState,
    g: {
      _prepCountState: state.lines, shiftState,
      toast: rec('toast'), toastAutoReport: rec('report'),
      resolveStaffPinWorkedToday: async () => ({ fullName: 'NV A', id: 'e1' }),
      prepShortageCollect: async () => state.shortage || null,
      prepShortageClearAll: async s => { calls.push(['prepShortageClearAll', JSON.stringify(s)]); },
      _continueAfterHandoverClose: async () => { calls.push(['continueAfterHandoverClose']); },
      _continueAfterPrepCount: async () => { calls.push(['continueAfterPrepCount']); }
    }
  };
}
function load(fake, env) {
  const file = kind === 'html' ? (process.env.CORE_HTML || 'posgieo.html') : 'posgieo.html';
  const src = CONSTS + extract(file, ['round2', ...NAMES]);
  const g = Object.assign({ fstore: fake.fstore, db: fake.db, firebase: fake.firebase, Date: fake.clock.Date, Math: fake.rnd.Math,
    setTimeout: f => setImmediate(f), console: { log() {}, warn() {}, error() {}, info() {} } }, env.g);
  if (kind === 'html') {
    const core = loadCore('html', fake, { calls: env.calls });
    for (const n of ['_ueRetryAsync', '_ueActiveUnitsRef', '_ueRecomputeCurrentStock']) g[n] = core[n];
  } else {
    const UE = loadEngineModule();
    UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28',
      now: () => fake.clock.now(), random: () => fake.rnd.random(),
      hooks: { notify: (...a) => env.g.toast(...a), report: (...a) => env.g.toastAutoReport(...a) },
      appFns: { handoverIsOverThreshold: (...a) => handoverRef(...a) } });
    // hàm app gọi thẳng UnitEngine.prep.shortageClearAll (không còn shim) — giữ bản ghi vết như bản gốc
    UE.prep.shortageClearAll = (...a) => env.g.prepShortageClearAll(...a);
    g.UnitEngine = UE;
  }
  const names = Object.keys(g);
  let handoverRef;
  const out = new Function(...names, src + '\nreturn {' + NAMES.join(',') + '};')(...names.map(n => g[n]));
  handoverRef = out.handoverIsOverThreshold;
  return out;
}
const B = (id, code, qty, extra) => ({ id, batchCode: code, qtyRemaining: qty, qtyInitial: 800, ...(extra || {}) });
const L = (prepId, sysQty, counted, activeBatches, extra) => ({ prepId, prepName: 'BTP ' + prepId, unit: 'ml', sysQty, counted, activeBatches,
  discardAll: false, perBatch: activeBatches.length > 1, batchQty: {}, batchWeighings: {}, weighings: [], ...(extra || {}) });
const S = {};
// 2 lô, đếm theo từng lô: lô cũ còn 100 (có cân), lô mới 200 → hụt lớn → cảnh báo + ADJUSTMENT
S.P1_hut_nhieu_lo = () => ({ lines: [L('P', 900, 300, [B('b1', 'L1', 400), B('b2', 'L2', 500)], { batchQty: { b1: 100, b2: 200 }, batchWeighings: { b1: [{ w: 150, tare: 50 }] } })] });
// bỏ hết cuối ngày → WASTE có totalCost, lô expired, RT xoá
S.P2_bo_het = () => ({ lines: [L('Q', 300, 0, [B('q1', 'Q1', 300)], { discardAll: true })] });
// lô hạn cuối ngày bị huỷ, nhân viên gõ còn 50 → countedIgnoredQty; lô 1-lô về 0 → used_up
S.P3_het_han_va_ve_0 = () => ({ lines: [L('Q', 300, 50, [B('q1', 'Q1', 300, { shelfLifeType: 'endOfDay' })]), L('P', 900, 0, [B('b1', 'L1', 900)], { weighings: [{ w: 10 }] })] });
// khớp số, có khoản âm chụp trước + dòng cũ giữ lại từ lượt trước
S.P4_khop_co_am = () => ({ lines: [L('P', 900, 900, [B('b1', 'L1', 400), B('b2', 'L2', 500)], { batchQty: { b1: 400, b2: 500 } })],
  shortage: { P: 40 }, closing: { prepCountLines: [{ prepId: 'Z', countedQty: 1 }], prepCountAt: '2026-09-28T00:00:00.000Z' } });
// BTP không còn trong danh mục → giao dịch bỏ qua (doc không tồn tại)
S.P5_btp_da_xoa = () => ({ lines: [L('R', 10, 10, [B('r1', 'R1', 10)])] });
// thiếu dòng chưa đếm → dừng, không ghi gì
S.P6_chua_dem_du = () => ({ lines: [L('P', 900, null, [B('b1', 'L1', 900)])] });

function seed() {
  return {
    rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 400, capacity: 800, openedAt: 500 }, b2: { code: 'L2', unitBase: 500, capacity: 800, openedAt: 600 } }, Q: { q1: { code: 'Q1', unitBase: 300, capacity: 800, openedAt: 700 } } } },
    fs: {
      [PI + '/P']: { name: 'BTP P', code: 'PP', unit: 'ml', currentStock: 900, costPerUnit: 3, untrackedPendingDelta: -40 },
      [PI + '/Q']: { name: 'BTP Q', unit: 'ml', currentStock: 300, costPerUnit: 2 },
      [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 400, unitBase: 400, batchCode: 'L1' },
      [PB + '/b2']: { prepId: 'P', status: 'active', qtyRemaining: 500, unitBase: 500, batchCode: 'L2' },
      [PB + '/q1']: { prepId: 'Q', status: 'active', qtyRemaining: 300, unitBase: 300, batchCode: 'Q1' },
      [PB + '/r1']: { prepId: 'R', status: 'active', qtyRemaining: 10, unitBase: 10, batchCode: 'R1' }
    }
  };
}
async function runOne(name) {
  const fake = makeFake(seed()); const env = env0(S[name]());
  const F = load(fake, env);
  let error = null;
  try { await F._submitPrepCountImpl(); } catch (e) { error = String(e && e.message || e); }
  for (let i = 0; i < 5; i++) { await new Promise(r => setImmediate(r)); await new Promise(r => setTimeout(r, 5)); }
  const log = fake.log.map((x, i) => [x, i]).sort((a, b) => (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : a[1] - b[1])).map(x => x[0]);
  return normalize(dropStore({ error, rt: fake.RT.root, fs: fake.FS, log, calls: env.calls, closing: env.shiftState.closing }));
}
(async () => {
  const out = {}; for (const n of Object.keys(S)) out[n] = await runOne(n);
  if (process.env.UPDATE === '1') { fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify(out, null, 1)); console.log('ok đã ghi ảnh chụp (' + kind + ')'); console.log('ALL PASS'); return; }
  const golden = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  let ok = true;
  for (const n of Object.keys(S)) {
    if (JSON.stringify(out[n]) === JSON.stringify(golden[n])) { console.log('ok ' + n); continue; }
    ok = false; console.log('FAIL ' + n);
    for (const k of Object.keys(out[n])) if (JSON.stringify(out[n][k]) !== JSON.stringify(golden[n][k])) console.log('   khác ở ' + k + ':\n     mới ' + JSON.stringify(out[n][k]).slice(0, 700) + '\n     cũ  ' + JSON.stringify(golden[n][k]).slice(0, 700));
  }
  console.log('nguồn: ' + kind); console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
