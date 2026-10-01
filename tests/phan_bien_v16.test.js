// Bản rà bug lần 11 (01/10/2026) — lỗi 65 (engine); 63–64 ở chuoi_bill.test.js.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const { extract } = require('./lib/extract');
const FILE = process.env.ENGINE || require('./lib/engine_file');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo', TASKS = 'duty_tasks_gieogieo', CASES = 'duty_cases_gieogieo';
let T = Date.parse('2026-09-23T08:30:00.000Z');
const initUE = fake => { fake.FS['duty_config_gieogieo/current'] = Object.assign({ fleetCompliant: true }, fake.FS['duty_config_gieogieo/current'] || {}); const UE = loadEngineModule(FILE);
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-23', now: () => T, random: () => 0.5, hooks: { notify() {}, report() {}, fifoChanged: async () => {} }, appFns: { handoverIsOverThreshold: () => false } });
  return UE; };
const mk = (fs, rt) => { const fake = makeFake({ rt: rt || {}, fs: fs || {} }); return { fake, UE: initUE(fake) }; };

// ── POS: applySalesConsumptionPOS thật, nhiều máy dùng chung dữ liệu ──
const posFns = fake => UE => {
  const src = extract('posgieo.html', ['applySalesConsumptionPOS', '_applySalesConsumptionCorePOS']);
  const stubs = { ensureRecipesLoadedPOS: async () => ({}), ensureToppingRecipesLoadedPOS: async () => ({}), ensurePackagingPresetsLoadedPOS: async () => ({}), ensurePackagingItemOverridesLoadedPOS: async () => ({}),
    ensurePackagingBaggingRulesLoadedPOS: async () => ({}), ensurePackagingRulesLoadedPOS: async () => ({ rules: [], config: {} }), ensurePackagingBaggingTableLoadedPOS: async () => ({}),
    computeConsumptionForOrder: () => ({ agg: { X: 50 }, prepAgg: {}, skipped: [] }), reportMissingRecipePOS: () => {}, posDateKey: () => '2026-09-23', fstore: fake.fstore, UnitEngine: UE,
    prepSugOnUsage: () => {}, _ueWarnGogsConsumptionFailed: async () => {}, STOCK_CONTAINERS_COLL: 'stock_containers_gieogieo', console: { warn() {}, error() {}, info() {}, log() {} } };
  const names = Object.keys(stubs);
  return new Function(...names, 'const _salesConsumeChains = new Map();\n' + src + '\nreturn {applySalesConsumptionPOS};')(...names.map(n => stubs[n]));
};
const nlWorld = () => ({ rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 200, capacity: 1000, openedAt: 1 } } } },
  fs: { 'inventory_items_gieogieo/X': { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 200, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] }, 'stock_containers_gieogieo/A': { itemId: 'X', code: 'AAA', status: 'open', unitBase: 200, baseQty: 1000 } } });

const prepWorld = (cur = 100) => ({ rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: cur, capacity: 733, openedAt: 1 } } } },
  fs: { [PI + '/P']: { name: 'Cốt trà lài', unit: 'g', currentStock: cur, costPerUnit: 1, batchYield: 733 },
    [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: cur, unitBase: cur, batchCode: 'L1', qtyInitial: 733 },
    [TASKS + '/verify_P']: { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c1', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, expireAt: '2026-09-24T14:30:00.000Z' },
    [CASES + '/c1']: { id: 'c1', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-21T14:00:00.000Z', to: '2026-09-22T14:30:00.000Z' }, history: [] } } });
const line = (counted, snap) => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: 100, qtyInitial: 733 }], batchQty: { b1: counted }, batchWeighings: { b1: [{ w: counted }] }, snaps: { b1: { book: snap, exact: true } } });
const task = () => ({ id: 'verify_P', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, caseId: 'c1', prepId: 'P' });
const ctx = (id = 'C') => ({ now: new Date(T + 60000).toISOString(), staff: { id, fullName: id }, businessDate: '2026-09-23' });
const rtv = (f, p) => f.fake.rtGet('active_units_gieogieo/P/' + p);
const hook = (f, coll, method, fn) => { const orig = f.fake.fstore.collection.bind(f.fake.fstore); f.fake.fstore.collection = name => { const c = orig(name); if (name !== coll) return c; return { ...c, doc: id => { const d = c.doc(id); return { ...d, [method]: (...a) => fn(d, id, ...a) }; } }; }; };
const failLot = (f, condFn) => { const orig = f.fake.fstore.runTransaction.bind(f.fake.fstore); f.fake.fstore.runTransaction = fn => orig(async t => { const t2 = Object.create(t); t2.update = (r, ...a) => { if (condFn() && String(r.path).indexOf('prep_batches_gieogieo/') === 0) throw new Error('mất mạng'); return t.update(r, ...a); }; return fn(t2); }); };


const dupWorld = (cur = 100) => ({ rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: cur, capacity: 733, openedAt: 1 } } } },
  fs: { [PI + '/P']: { name: 'Cốt trà lài', unit: 'g', currentStock: cur, costPerUnit: 1, batchYield: 733 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: cur, unitBase: cur, batchCode: 'L1', qtyInitial: 733 } } });
const gateRtOld = (f, once) => { let release; const gate = new Promise(r => { release = r; }); let used = false;
  const origRef = f.fake.db.ref.bind(f.fake.db);
  const wrapRef = r => ({ ...r, transaction: async (...a) => { if (!used && once()) { used = true; await gate; } return r.transaction(...a); }, child: id => wrapRef(r.child(id)) });
  f.fake.db.ref = p => wrapRef(origRef(p)); return release; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const twoLots = (b2Rt) => { const w = prepWorld(100); w.fs[PB + '/b2'] = { prepId: 'P', status: 'active', qtyRemaining: 100, unitBase: 100, batchCode: 'L2', qtyInitial: 733 };
  w.fs[PI + '/P'].currentStock = 200; if (b2Rt) w.rt.active_units_gieogieo.P.b2 = { code: 'L2', unitBase: 100, capacity: 733, openedAt: 2 }; return w; };
const line2 = () => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: 100, qtyInitial: 733 }, { id: 'b2', batchCode: 'L2', qtyRemaining: 100, qtyInitial: 733 }],
  batchQty: { b1: 80, b2: 80 }, batchWeighings: { b1: [{ w: 80 }], b2: [{ w: 80 }] }, snaps: { b1: { book: 100, exact: true }, b2: { book: 100, exact: true } } });


const gateRt = (f, pathRe) => { let release; const gate = new Promise(r => { release = r; }); let used = false; const origRef = f.fake.db.ref.bind(f.fake.db);
  const wrap = (r, p) => ({ ...r, transaction: async (...a) => { if (!used && pathRe.test(p)) { used = true; await gate; } return r.transaction(...a); }, child: id => wrap(r.child(id), p + '/' + id) });
  f.fake.db.ref = p => wrap(origRef(p), p); return release; };
const mkStore = () => { const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i] || null }; return store; };
const failRtOn = (f) => { const st = { on: false }; const origRef = f.fake.db.ref.bind(f.fake.db);
  const wrap = r => ({ ...r, transaction: (...a) => (st.on ? Promise.reject(new Error('RT lỗi')) : r.transaction(...a)), child: id => wrap(r.child(id)) }); f.fake.db.ref = p => wrap(origRef(p)); return st; };


const hookFenceOnce = (f, fn) => { const origRef = f.fake.db.ref.bind(f.fake.db);
  const wrap = (r, p) => ({ ...r, once: async (...a) => { if (/duty_verify_fence_gieogieo/.test(p) && fn.armed) { const h = fn.armed; await h(); } return r.once(...a); }, child: id => wrap(r.child(id), p + '/' + id) });
  f.fake.db.ref = p => wrap(origRef(p), p); };
const closedByNew = async (f, T0) => {                 // việc mới xác minh 0 và đóng lô (như L31)
  T += 5000;
  f.fake.FS[TASKS + '/verify_P'] = { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c2', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-23T07:00:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, expireAt: '2026-09-25T14:30:00.000Z' };
  f.fake.FS[CASES + '/c2'] = { id: 'c2', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-22T14:00:00.000Z', to: '2026-09-23T07:00:00.000Z' }, history: [] };
  await f.UE.duty.verifyCommit(line(0, 100), Object.assign(task(), { firstAt: '2026-09-23T07:00:00.000Z', caseId: 'c2' }), ctx('D')); };




const snapAll = f => { const pi = f.fake.FS[PI + '/P'], lot = f.fake.FS[PB + '/b1']; return { rt: rtv(f, 'b1/unitBase'), lotUnit: lot.unitBase, lot: lot.qtyRemaining, stock: pi.currentStock, short: pi.pendingShortage || 0,
  adj: Object.values(f.fake.FS).filter(v => v && v.fromPrepVerify).map(v => v.qty), task: (f.fake.FS[TASKS + '/verify_P'] || {}).status }; };


(async () => {
  // ── 65: lô THIẾU node RT → xác minh dựng node (có rev ngay lúc dựng) → đóng lô chậm không đè lô dựng lại ──
  {
    const w = prepWorld(100); w.rt = {}; const f = mk(w.fs, w.rt);
    const orig = f.fake.fstore.runTransaction.bind(f.fake.fstore); let held = false, release; const gate = new Promise(r => { release = r; });
    f.fake.fstore.runTransaction = async cb => { if (!held && /rtRev/.test(cb.toString())) { held = true; await gate; } return orig(cb); };
    const op1 = f.UE.duty.verifyCommit(line(0, 100), task(), ctx('C')).catch(e => e);               // lô không node → dựng node, cân 0, gỡ node; đồng bộ đóng bị giữ
    await sleep(60);
    const created = rtv(f, 'b1');                                                                    // (đã gỡ) — kiểm: lô trước đó được dựng có rev
    T += 1000;
    await f.fake.db.ref('active_units_gieogieo/P/b1').set({ code: 'L1', unitBase: 80, capacity: 733, openedAt: 5 });
    await f.fake.fstore.collection(PB).doc('b1').update({ status: 'active', qtyRemaining: 80, unitBase: 80 });
    T += 1000; await f.UE.consume.prepSale('P', 10, 'bán', 'bill_65_x', '2026-09-23', 'bill_65_x_prep_P'); await sleep(40);
    release(); await op1; await sleep(60);
    const lot = f.fake.FS[PB + '/b1'];
    eq([rtv(f, 'b1/unitBase'), lot.unitBase, lot.qtyRemaining, lot.status, typeof rtv(f, 'b1/rev')], [70, 70, 70, 'active', 'number'], 'L65 lô thiếu node: đóng lô chậm không đè lô dựng lại; node dựng bằng set có rev');
  }
  // ── rev ngay lúc dựng node (transaction) ──
  {
    const w = prepWorld(100); w.rt = {}; const f = mk(w.fs, w.rt);
    const g = mk(w.fs, w.rt);
    await g.UE.duty.verifyCommit(line(100, 100), task(), ctx());                                    // dựng node từ Firestore trong transaction
    eq(typeof rtv(g, 'b1/rev'), 'number', 'node lô BTP dựng trong transaction (xác minh) được cấp rev');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
