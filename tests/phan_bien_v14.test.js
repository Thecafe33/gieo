// Bản rà bug lần 9 (01/10/2026) — lỗi 55–58 + chuỗi thao tác (kiểm RT, lô, tồn, thiếu chờ đối chiếu, sổ, việc cùng lúc).
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
  // ── 56: nhật ký đã vỡ (thiếu −10 không ghi) → Quản lý chỉnh 95 → mốc cân CŨ không được công nhận ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; const first = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);               // cân lúc RT 100 (đóng dấu theo dõi)
    await f.fake.db.ref('active_units_gieogieo/P/b1/unitBase').set(90);                          // máy cũ bán 10, không nhật ký
    T += 60000; await f.UE.prep.setBatchQty('b1', 95);                                           // Quản lý chỉnh 95 (chữa)
    const old = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([first.exact, old.exact, old.reason], [true, false, 'nhat_ky_bi_cat'], 'L56 sau khi chữa, mốc cân CŨ vẫn exact:false (không dùng chgBase mới để công nhận quá khứ)');
    let err = null; try { await f.UE.duty.verifyCommit(Object.assign(line(100, old.book), { snaps: { b1: { book: old.book, exact: old.exact } } }), task(), ctx()); } catch (e) { err = e; }
    eq([err && err.code, rtv(f, 'b1/unitBase')], ['BOOK_INEXACT', 95], 'L56 xác minh bằng mốc cũ bị từ chối, RT giữ 95');
    const fresh = await f.UE.duty.lotBookAtExact('P', 'b1', T);
    eq([fresh.book, fresh.exact], [95, true], 'L56 mốc cân MỚI (sau lần chữa) dùng được: 95');
  }
  // ── 57: nhập đúng số RT hiện tại vẫn chữa được bất biến ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    await f.fake.db.ref('active_units_gieogieo/P/b1/unitBase').set(90);                          // vỡ: chgBase 100, không nhật ký
    T += 60000; await f.UE.prep.setBatchQty('b1', 90);                                           // nhập ĐÚNG số hiện tại
    const old = await f.UE.duty.lotBookAtExact('P', 'b1', atMs), nw = await f.UE.duty.lotBookAtExact('P', 'b1', T);
    eq([old.exact, nw.book, nw.exact], [false, 90, true], 'L57 nhập đúng 90 → đặt lại theo dõi: mốc cũ bị từ chối, mốc mới chính xác (90)');
  }
  // ── 58: đồng bộ hoàn tác chậm không ghi đè số lô mới hơn ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); const fn = {}; hookFenceOnce(f, fn);
    const orig = f.fake.fstore.runTransaction.bind(f.fake.fstore); let gateNext = false, release, gotGate = false;
    const gate = new Promise(r => { release = r; });
    f.fake.fstore.runTransaction = async cb => { if (gateNext && /rtRev/.test(cb.toString())) { gateNext = false; gotGate = true; await gate; } return orig(cb); };
    const rel = gateRt(f, /active_units_gieogieo\/P\/b1$/);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); await closedByNew(f);
    fn.armed = async () => { fn.armed = null; await f.UE.consume.prepSale('P', 10, 'bán xen 1', 'bill_58_a', '2026-09-23', 'bill_58_a_prep_P'); await sleep(40); gateNext = true; };   // bán xen trước hoàn tác; sau đó bước đồng bộ lô của hoàn tác sẽ chờ
    rel(); await sleep(150);
    await f.UE.consume.prepSale('P', 10, 'bán xen', 'bill_58_x', '2026-09-23', 'bill_58_x_prep_P'); await sleep(40);   // bán xen: RT mới hơn, lô đã đồng bộ số mới
    release(); await old; await sleep(60);
    const s = snapAll(f);
    eq([s.lotUnit, s.rt, s.lotUnit === s.rt, gotGate], [s.rt, s.rt, true, true], 'L58 bản sao lô (' + s.lotUnit + ') khớp RT (' + s.rt + ') — lượt đồng bộ chậm mang số cũ bị bỏ qua');
  }
  // ── Chuỗi: cân → Quản lý sửa lô → bán → xác minh: RT, lô, tồn, thiếu, sổ, việc phải khớp nhau ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    await f.UE.consume.prepSale('P', 10, 'bán', 'bill_c1_x', '2026-09-23', 'bill_c1_x_prep_P'); await sleep(30);   // 90
    const atMs = T; const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);                    // cân tại 90
    T += 1000; await f.UE.prep.setBatchQty('b1', 80); await sleep(30);                             // Quản lý sửa 80
    T += 1000; await f.UE.consume.prepSale('P', 10, 'bán', 'bill_c2_x', '2026-09-23', 'bill_c2_x_prep_P'); await sleep(30);   // 70
    await f.UE.duty.verifyCommit(Object.assign(line(90, bk.book), { snaps: { b1: { book: bk.book, exact: bk.exact } } }), task(), ctx());
    await sleep(30);
    eq([bk.book, bk.exact, snapAll(f)], [90, true, { rt: 70, lotUnit: 70, lot: 70, stock: 70, short: 0, adj: [], task: 'done' }], 'CHUỖI cân → sửa lô → bán → xác minh: RT = lô = tồn = 70, không thiếu, không điều chỉnh giả, việc xong');
  }
  // ── Chuỗi: chữa (setBatchQty) bị chặn khi có lượt cân lại dở ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    f.fake.FS[TASKS + '/verify_P'] = Object.assign({}, f.fake.FS[TASKS + '/verify_P'], { status: 'open', partialRt: true });
    let err = null; try { await f.UE.prep.setBatchQty('b1', 50); } catch (e) { err = e; }
    eq([/lượt cân lại dở/.test((err && err.message) || ''), rtv(f, 'b1/unitBase')], [true, 100], 'chỉnh số lô bị chặn khi lượt cân lại còn dở (partialRt) — không xoá dữ liệu lượt đã sửa RT');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
