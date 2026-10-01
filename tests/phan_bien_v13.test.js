// Bản rà bug lần 8 (01/10/2026) — lỗi 49–54 (ENGINE=unit_engine.v12.js để xem lỗi cũ).
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



(async () => {
  // ── Lỗi 49: máy giữ bill cũ trong RAM vẫn bổ sung được — nay transaction ghi topping kiểm cờ trên dữ liệu máy chủ ──
  {
    const src = extract('posgieo.html', ['_submitAddonImpl']);
    const log = []; const serverNode = { id: 'o1', date: '23/09/2026', deletionPending: true, total: 100, itemsArray: [], addons: [] };
    const names = ['_addonState', '_addonOrder', 'orderAddonInfo', '_addonAmount', 'resolveStaffPinAndCheckin', 'posConfirm', '_addonApplyToItems', 'MONTH_KEYS', 'db', '_addonSameOrderState', 'toast', 'closeAddonSheet', 'showDet', 'trackConsumptionPOS', 'applyAddonConsumptionPOS', 'printAddonReceipt', 'printAddonLabel', 'fmt', 'tpLabel', 'log'];
    const o = { id: 'o1', date: '23/09/2026', total: 100, itemsArray: [{ name: 'Trà' }], billCode: 'B1' };   // bản trong RAM: CHƯA có cờ
    const vals = { _addonState: { itemIdx: 0, toppings: [{ n: 1 }], method: 'TIỀN MẶT', cashGiven: 0, seq: 1, totalCups: 1 }, _addonOrder: () => o, orderAddonInfo: () => ({ ok: true }), _addonAmount: () => 10, resolveStaffPinAndCheckin: async () => ({ id: 'E', fullName: 'E' }),
      posConfirm: async () => true, _addonApplyToItems: () => ({ items: [] }), MONTH_KEYS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'], _addonSameOrderState: () => true, toast: m => log.push('toast:' + m), closeAddonSheet: () => {}, showDet: () => {},
      trackConsumptionPOS: () => log.push('TRỪ KHO'), applyAddonConsumptionPOS: () => {}, printAddonReceipt: () => {}, printAddonLabel: () => {}, fmt: x => x, tpLabel: () => 't', log,
      db: { ref: () => ({ transaction: async fn => { const r = fn(JSON.parse(JSON.stringify(serverNode))); return { committed: r !== undefined, snapshot: { val: () => serverNode } }; } }) } };
    await new Function(...names, src + '\nreturn _submitAddonImpl();')(...names.map(n => vals[n]));
    eq([log.some(x => /xoá dở/.test(x)), log.includes('TRỪ KHO')], [true, false], 'L49 bản RAM cũ không có cờ nhưng máy chủ có → từ chối, không trừ kho');
  }
  // ── Lỗi 50: ghi cờ xoá dở lỗi → DỪNG trước khi hoàn kho, nhả khoá thao tác ──
  {
    const src = extract('posgieo.html', ['delOrderConfirm']);
    const log = []; const ids = new Set();
    const names = ['document', 'orders', 'curOid', '_deletingOrderIds', 'toast', 'db', 'MONTH_KEYS', '_consumptionInflightPOS', 'UnitEngine', 'log'];
    const vals = { document: { getElementById: id => ({ value: '3367', style: {}, focus() {} }) }, orders: [{ id: 'o1', date: '23/09/2026', backfillMode: null }], curOid: 'o1', _deletingOrderIds: ids, toast: m => log.push('toast:' + m),
      db: { ref: () => ({ transaction: async () => { throw new Error('mất mạng'); } }) }, MONTH_KEYS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'], _consumptionInflightPOS: new Map(),
      UnitEngine: { consume: { reverseSales: async () => { log.push('HOÀN KHO'); return { ok: true }; }, voidBackfill: async () => ({ ok: true }) } }, log };
    await new Function(...names, src + '\nreturn delOrderConfirm();')(...names.map(n => vals[n]));
    eq([log.includes('HOÀN KHO'), ids.has('o1'), log.some(x => /CHƯA hoàn kho/.test(x))], [false, false, true], 'L50 ghi cờ lỗi → không hoàn kho, nhả khoá, báo thử lại');
  }
  // ── Lỗi 51: hoàn tác RT xong nhưng đồng bộ lô lỗi → lần phục hồi sau VẪN đồng bộ (không đóng việc sớm) ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); const fn = {}; hookFenceOnce(f, fn); 
    let failLotFlag = false; failLot(f, () => failLotFlag);
    const release = gateRt(f, /active_units_gieogieo\/P\/b1$/);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); await closedByNew(f);
    fn.armed = async () => { fn.armed = null; await f.UE.consume.prepSale('P', 10, 'bán', 'bill_51_x', '2026-09-23', 'bill_51_x_prep_P'); await sleep(30); failLotFlag = true; };
    release(); await old; await sleep(50);
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PB + '/b1'].qtyRemaining], [-10, 70], 'L51 RT đã hoàn tác (−10) nhưng bản sao lô còn 70 (đồng bộ lỗi)');
    failLotFlag = false; await f.UE.duty.recoverVerifyUndo();
    const pi = f.fake.FS[PI + '/P'];
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PB + '/b1'].qtyRemaining, pi.currentStock, pi.pendingShortage], [-10, 0, 0, 10], 'L51 lần phục hồi sau: không trừ lại RT (−10) nhưng đồng bộ lô 0, tồn 0, thiếu 10');
  }
  // ── Lỗi 52: cổng phiên bản áp dụng mọi nhánh và kiểm lại khi nhận lượt chốt ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    f.fake.FS['duty_config_gieogieo/current'] = {};                                              // chủ bỏ xác nhận sau khi đã chụp snapshot
    let err = null; try { await f.UE.duty.verifyCommit(Object.assign(line(80, bk.book), { snaps: { b1: { book: bk.book, exact: bk.exact } } }), task(), ctx()); } catch (e) { err = e; }
    eq([err && err.code, f.fake.FS[TASKS + '/verify_P'].status, rtv(f, 'b1/unitBase')], ['FLEET_UNCONFIRMED', 'open', 100], 'L52 bỏ xác nhận → lượt chốt bằng snapshot cũ bị từ chối');
    const w = prepWorld(100); w.rt = {}; const g = mk(w.fs, w.rt); g.fake.FS['duty_config_gieogieo/current'] = {};
    const nb = await g.UE.duty.lotBookAtExact('P', 'b1', T);
    eq([nb.exact, nb.reason], [false, 'chua_xac_nhan_moi_may_da_cap_nhat'], 'L52 lô thiếu node RT cũng bị cổng chặn khi chưa xác nhận');
  }
  // ── Lỗi 53: nhật ký bị cắt trong cửa sổ 10 giây → không đóng dấu lại, exact:false ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T;
    for (let i = 0; i < 31; i++) { T += 100; await f.UE.consume.prepSale('P', 1, 'bán', 'bill_53_' + i, '2026-09-23', 'bill_53_' + i + '_prep_P'); }
    const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([rtv(f, 'b1/unitBase'), bk.exact, bk.reason], [69, false, 'nhat_ky_bi_cat'], 'L53 31 lượt bán trong 3,1 s làm nhật ký bị cắt → exact:false (không "đóng dấu" 69 thành sổ tại mốc)');
  }
  // ── Lỗi 54: node xuất hiện giữa lúc đọc RT và đọc Firestore → dùng lịch sử của node ──
  {
    const w = prepWorld(100); w.rt = {}; const f = mk(w.fs, w.rt);
    const atMs = T; let armed = true;
    hook(f, PB, 'get', async (d, id) => { if (armed && id === 'b1') { armed = false; T += 100; await f.fake.db.ref('active_units_gieogieo/P/b1').set({ code: 'L1', unitBase: 100, capacity: 733, openedAt: 1 }); await f.UE.consume.prepSale('P', 10, 'bán', 'bill_54_x', '2026-09-23', 'bill_54_x_prep_P'); await sleep(30); } return d.get(); });
    const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([rtv(f, 'b1/unitBase'), bk.book, bk.exact], [90, 100, true], 'L54 node đăng ký lại + bán 10 giữa chừng → sổ tại mốc 100 (không phải 90)');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
