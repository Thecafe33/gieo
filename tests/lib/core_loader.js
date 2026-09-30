// Nạp lõi Unit Engine để chạy trên Firebase giả, theo HAI cách cho cùng một bộ kịch bản:
//   'html'   — trích thẳng các hàm lõi từ posgieo.html (bản trước khi tách — dùng để lập ảnh chụp E0)
//   'engine' — nạp unit_engine.v1.js, gọi UnitEngine.init() (bản sau khi tách, E1/E2)
// Cả hai trả về cùng một object hàm theo TÊN CŨ, để test ảnh chụp so được hai bản với nhau.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extract } = require('./extract');

const ROOT = path.resolve(__dirname, '..', '..');
// Hàm lõi — tên cũ trong POS (2.2 + E2 của kế hoạch).
const CORE_NAMES = [
  '_ueActiveUnitsRef', '_ueRetryAsync', '_ueComputeAllocation', 'missingUnitsWarning',
  'unitEngineAllocateConsumption', '_ueMaybeWarnUntrackedConsumption', '_ueWarnAllocateRtdbError',
  '_ueRecomputeCurrentStock', '_ueSyncQtyRemainingClamped', 'unitEngineReverseAllocations',
  '_ueClaimedReverseAllocations', 'unitEngineOnOpen', 'unitEngineFinishOpenUnit',
  'isTemTrackedNL', 'isAtomicUnitItem',
  'prepReconRecoverOrphan', 'prepReconAcquire', 'prepReconRelease', 'prepReconAssertFree', 'prepReconSetUnit',
  'applyPrepConsumptionPOS',
  // E2
  'applyStockTransactionPOS', 'applyStockTransferPOS', 'setLocationStockFromCountPOS', 'logStockAnomalyPOS',
  'createContainersForReceipt', 'findContainerByCode', 'loadOpenContainers',
  'sinhMaNgauNhien', 'capMaKhoDuyNhat', 'genStockContainerCode', 'genPrepBatchCode',
  // E3 — hoàn kho khi xoá bill
  'prepareOrderReversalNetPOS', 'reverseSalesConsumptionPOS', '_voidBackfillConsumptionPOS', '_ueWarnReverseFailed',
  '_reverseIngredientConsumptionPOS', '_reversePrepConsumptionPOS'
];
const HTML_HELPERS = ['round2', 'fmtPrepQty', 'prepFlowError'];
const HTML_CONSTS = `
const STOCK_CONTAINERS_COLL = 'stock_containers_gieogieo';
const STOCK_ANOMALY_COLL = 'stock_anomalies_gieogieo';
const PREP_RECON_LOCK_COLL = 'prep_ingredient_locks_gieogieo';
const REVERSAL_CLAIM_STALE_MS = 2 * 60 * 1000;
const MA_BANG_CHU = ${JSON.stringify(readConst('MA_BANG_CHU'))};
let STOCK_OPEN_LIST = [];
`;
function readConst(name) {
  const html = fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8');
  const m = new RegExp('const ' + name + "\\s*=\\s*'([^']*)'").exec(html);
  if (m) return m[1];
  const e = path.join(ROOT, require('./engine_file'));
  if (fs.existsSync(e)) { const m2 = new RegExp('const ' + name + "\\s*=\\s*'([^']*)'").exec(fs.readFileSync(e, 'utf8')); if (m2) return m2[1]; }
  throw new Error('không thấy hằng ' + name);
}

// env: { items, preps, refillRules, calls[] (ghi toast/hook), businessDate }
function appGlobals(fake, env) {
  const calls = env.calls || (env.calls = []);
  const rec = name => (...a) => { calls.push([name, ...a.filter(x => typeof x !== 'object')]); };
  return {
    fstore: fake.fstore, db: fake.db, firebase: fake.firebase,
    Date: fake.clock.Date, Math: fake.rnd.Math,
    KHO_ITEMS_CACHE: env.items || [], PREP_ITEMS_CACHE_POS: env.preps || [],
    posDateKey: () => env.businessDate || '2026-09-28',
    toast: rec('toast'), toastAutoReport: rec('report'),
    refreshFifoAlert: async () => { calls.push(['fifoChanged']); },
    closeStockScanSheet: rec('closeScanSheet'), _refreshStockUseListIfActive: rec('openUnitsChanged'),
    getPrimaryRefillRulePOS: id => (env.refillRules || []).find(r => r.itemId === id) || null,
    getBiggestPackagingUnitPOS: item => {
      const opts = (item.packagingUnits || []).map(p => ({ label: p.name, baseQty: Number(p.baseQty) || 0 })).filter(o => o.baseQty > 0);
      return opts.length ? opts.reduce((a, b) => (b.baseQty > a.baseQty ? b : a), opts[0]) : null;
    },
    setTimeout: (f) => setImmediate(f),
    console: { log() {}, warn() {}, error() {}, info() {} },
    window: { crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(fake.rnd.random() * 256); return a; } } }
  };
}

function loadHtml(fake, env) {
  // CORE_HTML: đường dẫn (tương đối gốc dự án) tới bản HTML cũ dùng để lập ảnh chụp
  const src = HTML_CONSTS + extract(process.env.CORE_HTML || 'posgieo.html', HTML_HELPERS.concat(CORE_NAMES));
  const g = appGlobals(fake, env);
  const names = Object.keys(g);
  return new Function(...names, src + '\nreturn {' + CORE_NAMES.join(',') + '};')(...names.map(n => g[n]));
}

function loadEngine(fake, env, file = require('./engine_file')) {
  const g = appGlobals(fake, env);
  const sandbox = { console: g.console, setTimeout: g.setTimeout, clearTimeout, setImmediate, Promise, Uint8Array };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  const UE = sandbox.UnitEngine;
  UE.init({
    app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.firebase.firestore.FieldValue,
    storeId: 'gg01', businessDate: g.posDateKey,
    now: () => fake.clock.now(), random: () => fake.rnd.random(),
    randomBytes: g.window.crypto.getRandomValues,
    getItems: () => g.KHO_ITEMS_CACHE, getPreps: () => g.PREP_ITEMS_CACHE_POS,
    getRefillRule: g.getPrimaryRefillRulePOS, getBiggestPackagingUnit: g.getBiggestPackagingUnitPOS,
    hooks: {
      notify: g.toast, report: g.toastAutoReport, fifoChanged: g.refreshFifoAlert,
      closeScanSheet: g.closeStockScanSheet, openUnitsChanged: g._refreshStockUseListIfActive
    }
  });
  const out = {};
  for (const n of CORE_NAMES) { if (typeof UE.fn[n] !== 'function') throw new Error('engine thiếu ' + n); out[n] = UE.fn[n]; }
  out.__UE = UE;
  return out;
}

function loadCore(kind, fake, env) { return kind === 'engine' ? loadEngine(fake, env) : loadHtml(fake, env); }
module.exports = { loadCore, CORE_NAMES };
