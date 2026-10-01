// Bản rà bug lần 6 (01/10/2026) — lỗi 36–42 (ENGINE=unit_engine.v10.js để xem lỗi cũ).
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
  // ── Lỗi 36: hoàn tác khi node do lượt cũ dựng lại có bán xen → số đúng là −10, không phải 90 ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); const fn = {}; hookFenceOnce(f, fn);
    const release = gateRt(f, /active_units_gieogieo\/P\/b1$/);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); await closedByNew(f);
    fn.armed = async () => { fn.armed = null; await f.UE.consume.prepSale('P', 10, 'bán', 'bill_36_x', '2026-09-23', 'bill_36_x_prep_P'); };   // bán xen sau khi lượt cũ dựng node 80
    release(); await old; await sleep(50);
    eq(rtv(f, 'b1/unitBase'), -10, 'L36 hoàn tác node dựng lại có bán xen 10 → −10 (nợ thực), không phải 90');
  }
  // ── Lỗi 37: đọc rào lỗi / hoàn tác lỗi → việc hoàn tác BỀN, phiên sau chạy tiếp ──
  {
    const store = mkStore();
    const f = mk(prepWorld().fs, prepWorld().rt); const fn = {}; hookFenceOnce(f, fn); const rt = failRtOn(f);
    const release = gateRt(f, /active_units_gieogieo\/P\/b1$/);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); await closedByNew(f);
    let thrown = false; fn.armed = async () => { fn.armed = null; thrown = true; throw new Error('RT đọc rào lỗi'); };
    release(); const e = await old; await sleep(50);
    eq([thrown, rtv(f, 'b1/unitBase')], [true, 80], 'L37a đọc rào lỗi → chưa hoàn tác được (RT 80 tạm)');
    const n = await f.UE.duty.recoverVerifyUndo();
    eq([n, rtv(f, 'b1')], [1, null], 'L37a việc hoàn tác bền: phiên sau chạy → gỡ node 80');
    // b) đọc rào được nhưng hoàn tác lỗi
    const g = mk(prepWorld().fs, prepWorld().rt); const gn = {}; hookFenceOnce(g, gn); const grt = failRtOn(g);
    const rel2 = gateRt(g, /active_units_gieogieo\/P\/b1$/);
    const old2 = g.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); await closedByNew(g);
    gn.armed = async () => { gn.armed = null; grt.on = true; };                                  // đọc rào được (mất quyền) nhưng RT lỗi ở bước hoàn tác
    rel2(); await old2; await sleep(50); grt.on = false;
    eq(rtv(g, 'b1/unitBase'), 80, 'L37b hoàn tác lỗi → RT 80 tạm còn đó (việc hoàn tác đã lưu bền)');
    const n2 = await g.UE.duty.recoverVerifyUndo();
    eq([n2, rtv(g, 'b1')], [1, null], 'L37b phiên sau chạy việc hoàn tác → gỡ node');
    delete global.localStorage;
  }
  // ── Lỗi 38: đọc sổ lỗi → POS vô hiệu snapshot cũ, không nhận số cân mới; engine từ chối snapshot thiếu ──
  {
    const src = extract('posgieo.html', ['prepCountWeighBatch']);
    const l = { prepId: 'P', prepName: 'X', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1' }], batchQty: { b1: 100 }, batchDone: {}, batchWeighings: {}, snaps: { b1: { book: 100, exact: true } } };
    const toasts = [];
    const fn = new Function('l', 'toasts', 'let _prepCountState=[l]; let _prepVerifyMode={task:{}}; const _prepCountRefreshLineCounted=()=>{}; const renderPrepCountCard=()=>{}; const console={warn(){}}; const toast=m=>toasts.push(m);\n' +
      'const UnitEngine={clock:{now:()=>1000},duty:{lotBookAtExact:async()=>{ throw new Error("RT lỗi"); }}};\n' +
      'const openWeighPad=o=>o.onDone(80,[{w:80}]);\n' + src + '\nprepCountWeighBatch(0,"b1",0); return new Promise(r=>setTimeout(()=>r(l),10));');
    const lr = await fn(l, toasts);
    eq([lr.snaps.b1, lr.batchQty.b1, toasts.length], [undefined, 100, 1], 'L38 POS: đọc sổ lỗi → bỏ snapshot cũ, KHÔNG ghi số cân mới (giữ 100), báo nhân viên');
    const f = mk(prepWorld().fs, prepWorld().rt); let err = null;
    try { await f.UE.duty.verifyCommit(Object.assign(line(80, 100), { snaps: {} }), task(), ctx()); } catch (e) { err = e; }
    eq([err && err.code, rtv(f, 'b1/unitBase')], ['BOOK_INEXACT', 100], 'L38 engine: thiếu snapshot → từ chối, không điều chỉnh kho');
  }
  // ── Lỗi 39: lô active thiếu node RT → exact:true (không thể bị bán trừ), xác minh dựng node, không vòng cân lại ──
  {
    const w = prepWorld(100); w.rt = {}; const f = mk(w.fs, w.rt);
    const atMs = T; const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([bk.book, bk.exact], [100, true], 'L39 lô không node RT → sổ Firestore 100, exact:true');
    await f.UE.duty.verifyCommit(Object.assign(line(100, 100), { snaps: { b1: { book: bk.book, exact: bk.exact, at: new Date(atMs).toISOString() } } }), task(), ctx());
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[TASKS + '/verify_P'].status], [100, 'done'], 'L39 xác minh dựng node RT 100 và đóng việc (không kẹt BOOK_INEXACT)');
  }
  // ── Lỗi 40: dấu hoàn sống sót khi lô/node bị đóng và lô mới mở ──
  {
    const f = mk(dupWorld(100).fs, dupWorld(100).rt);
    f.fake.FS[TASKS + '/verify_P'] = prepWorld().fs[TASKS + '/verify_P']; f.fake.FS[CASES + '/c1'] = prepWorld().fs[CASES + '/c1'];
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    hook(f, 'reversal_unit_claims_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    await f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx40');          // RT 150
    await f.UE.duty.verifyCommit(line(0, 150), task(), ctx());                                              // xác minh 0 → node b1 bị gỡ cùng dấu trong node
    await f.fake.db.ref('active_units_gieogieo/P/b2').set({ code: 'L2', unitBase: 100, capacity: 733, openedAt: 5 });
    T += 130000; await f.UE.consume.recoverDuplicates();
    eq(f.fake.rtGet('active_units_gieogieo/P/b2/unitBase'), 100, 'L40 lô mới 100 không bị khoản hoàn cũ (đã áp dụng) cộng vào → 100');
  }
  // ── Lỗi 41: việc chờ quá 3 ngày vẫn giữ dấu; quá 60 ngày chuyển đối soát ──
  {
    const f = mk(dupWorld(100).fs, dupWorld(100).rt);
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    hook(f, 'reversal_unit_claims_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    await f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx41');          // RT 150
    T += 4 * 24 * 3600 * 1000;
    await f.UE.consume.reversePrep('P', 1, 'xoá', 'bill_41', [{ containerId: 'b1', qty: 1 }]);              // RT 151, dấu trong node cũ >3 ngày bị loại
    await f.UE.consume.recoverDuplicates();
    eq(rtv(f, 'b1/unitBase'), 151, 'L41 sau >3 ngày + khoản hoàn khác, việc cũ chạy lại KHÔNG hoàn lần nữa (151)');
    T += 60 * 24 * 3600 * 1000;
    await f.UE.consume.recoverDuplicates();
    const st = Object.values(f.fake.FS).filter(v => v && v.txId === 'tx41').map(v => v.status);
    eq([rtv(f, 'b1/unitBase'), st[0]], [151, 'needs_manual'], 'L41 quá 60 ngày → chuyển đối soát tay, không tự hoàn');
  }
  // ── Lỗi 42: biến động KHÔNG ghi nhật ký (máy cũ) → exact:false; đọc ngay sau cân thì đóng dấu lại ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; const first = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);          // đóng dấu node lần đầu (đọc ngay sau cân)
    eq([first.book, first.exact], [100, true], 'L42 đọc ngay sau cân: node chưa theo dõi → đóng dấu, chính xác 100');
    await f.fake.db.ref('active_units_gieogieo/P/b1/unitBase').set(90);                         // máy chạy engine cũ bán 10, không ghi nhật ký, usageEvents lỗi
    T += 60000;
    const late = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([late.book, late.exact], [90, false], 'L42 đọc muộn: bất biến vỡ → exact:false (không còn tin "không thấy bán")');
    let err = null; try { await f.UE.duty.verifyCommit(Object.assign(line(100, late.book), { snaps: { b1: { book: late.book, exact: late.exact } } }), task(), ctx()); } catch (e) { err = e; }
    eq([err && err.code, rtv(f, 'b1/unitBase')], ['BOOK_INEXACT', 90], 'L42 xác minh bị từ chối, RT giữ 90');
    const again = await f.UE.duty.lotBookAtExact('P', 'b1', T);                                  // [v13] lịch sử đã có mà vỡ → KHÔNG đóng dấu lại (chữa bằng Điều chỉnh số lô)
    eq([again.book, again.exact], [90, false], 'L42 (v13) cân lại: bất biến vỡ → vẫn exact:false, không công nhận lại mốc');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
