// Bản rà bug lần 7 (01/10/2026) — lỗi 43–48 (ENGINE=unit_engine.v11.js để xem lỗi cũ).
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


(async () => {
  // ── Lỗi 43: đóng dấu lại không được xoá nhật ký hợp lệ do máy khác vừa ghi ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; let armed = true; const origRef = f.fake.db.ref.bind(f.fake.db);
    const wrap = (r, p) => ({ ...r, transaction: async (...a) => { if (armed && /active_units_gieogieo\/P\/b1$/.test(p)) { armed = false; T += 100; await f.UE.consume.prepSale('P', 10, 'bán', 'bill_43_x', '2026-09-23', 'bill_43_x_prep_P'); } return r.transaction(...a); }, child: id => wrap(r.child(id), p + '/' + id) });
    f.fake.db.ref = p => wrap(origRef(p), p);
    const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([rtv(f, 'b1/unitBase'), bk.book, bk.exact], [90, 100, true], 'L43 bán xen ngay lúc đóng dấu → sổ tại mốc vẫn 100 (không xoá nhật ký, không trả 90)');
  }
  // ── Lỗi 44: rào mới hơn không đủ để hoàn tác một lượt xác minh ĐÃ CHỐT hợp lệ ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    hook(f, 'duty_verify_undo_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    await f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C'));                                // 100 → 80, hoàn tất; chỉ việc hoàn tác không ghi được 'done'
    await f.fake.db.ref('duty_verify_fence_gieogieo/P').set({ gen: Date.parse('2026-09-23T07:00:00.000Z'), at: T });     // lượt xác minh KẾ TIẾP vừa giành rào
    const n = await f.UE.duty.recoverVerifyUndo();
    eq([rtv(f, 'b1/unitBase'), n], [80, 1], 'L44 worker không hoàn tác lượt đã chốt (RT vẫn 80), chỉ đóng việc');
  }
  // ── Lỗi 45: không đọc được dấu hoàn bền → chưa biết → KHÔNG hoàn lần nữa ──
  {
    const f = mk(dupWorld(100).fs, dupWorld(100).rt);
    f.fake.FS[TASKS + '/verify_P'] = prepWorld().fs[TASKS + '/verify_P']; f.fake.FS[CASES + '/c1'] = prepWorld().fs[CASES + '/c1'];
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    hook(f, 'reversal_unit_claims_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    await f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx45');
    await f.UE.duty.verifyCommit(line(0, 150), task(), ctx());
    await f.fake.db.ref('active_units_gieogieo/P/b2').set({ code: 'L2', unitBase: 100, capacity: 733, openedAt: 5 });
    let failMarks = true; const origRef = f.fake.db.ref.bind(f.fake.db);
    const wrap = (r, p) => ({ ...r, once: (...a) => (failMarks && /rev_marks_gieogieo/.test(p) ? Promise.reject(new Error('RT đọc lỗi')) : r.once(...a)), child: id => wrap(r.child(id), p + '/' + id) });
    f.fake.db.ref = p => wrap(origRef(p), p);
    T += 130000; await f.UE.consume.recoverDuplicates();
    eq([f.fake.rtGet('active_units_gieogieo/P/b2/unitBase'), Object.values(f.fake.FS).filter(v => v && v.txId === 'tx45').map(v => v.status)], [100, ['pending']], 'L45 đọc dấu bền lỗi → không hoàn (lô mới giữ 100), việc còn pending');
    failMarks = false; T += 70000; await f.UE.consume.recoverDuplicates();
    eq(f.fake.rtGet('active_units_gieogieo/P/b2/unitBase'), 100, 'L45 đọc lại được dấu → vẫn 100 (đã hoàn từ trước)');
  }
  // ── Lỗi 46: hoàn tác đồng bộ lô, tồn tổng và thiếu chờ đối chiếu ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); const fn = {}; hookFenceOnce(f, fn);
    const release = gateRt(f, /active_units_gieogieo\/P\/b1$/);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); await closedByNew(f);
    fn.armed = async () => { fn.armed = null; await f.UE.consume.prepSale('P', 10, 'bán', 'bill_46_x', '2026-09-23', 'bill_46_x_prep_P'); };
    release(); await old; await sleep(50);
    const pi = f.fake.FS[PI + '/P'];
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PB + '/b1'].qtyRemaining, pi.currentStock, pi.pendingShortage], [-10, 0, 0, 10], 'L46 sau hoàn tác: RT −10, lô 0, tồn BTP 0, thiếu chờ đối chiếu 10');
  }
  // ── Lỗi 47: bill đã bắt đầu hoàn kho không được bổ sung thêm (khoá bền trên node bill) ──
  {
    const src = extract('posgieo.html', ['orderAddonInfo']);
    const fn = new Function('ADDON_WINDOW_MIN', 'posDateKeyToDisplay', 'posDateKey', '_deletingOrderIds', src + '\nreturn orderAddonInfo;')(60, () => '23/09/2026', () => '2026-09-23', new Set());
    const o = { id: 'x', createdAt: new Date().toISOString(), date: '23/09/2026', method: 'TIỀN MẶT' };
    eq([fn(o).ok, fn(Object.assign({}, o, { deletionPending: true })).ok], [true, false], 'L47 bill có cờ xoá dở → không bổ sung được');
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'posgieo.html'), 'utf8');
    const iFlag = html.indexOf("'/deletionPending').set(true)"), iRev = html.indexOf('UnitEngine.consume.reverseSales(o, delId)');
    eq([iFlag > 0, iFlag < iRev], [true, true], 'L47 cờ xoá dở được đặt TRƯỚC khi hoàn kho');
  }
  // ── Lỗi 48: chưa xác nhận mọi máy đã cập nhật → lịch sử nhật ký không được coi là chính xác ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    f.fake.FS['duty_config_gieogieo/current'] = {};
    const atMs = T; const a = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([a.exact, a.reason], [false, 'chua_xac_nhan_moi_may_da_cap_nhat'], 'L48 chưa xác nhận → exact:false');
    await f.UE.duty.setFleetCompliant(true, 'Chủ');
    const b = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([b.exact, await f.UE.duty.fleetCompliant()], [true, true], 'L48 chủ xác nhận → exact:true');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
