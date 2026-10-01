// Bản rà bug lần 5 (01/10/2026) — lỗi 29–35 (ENGINE=unit_engine.v9.js để xem lỗi cũ).
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const { extract } = require('./lib/extract');
const FILE = process.env.ENGINE || require('./lib/engine_file');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo', TASKS = 'duty_tasks_gieogieo', CASES = 'duty_cases_gieogieo';
let T = Date.parse('2026-09-23T08:30:00.000Z');
const initUE = fake => { const UE = loadEngineModule(FILE);
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

(async () => {
  // ── Lỗi 29: hai máy cùng xoá một bill — máy thua (transaction chạy lại) KHÔNG được hoàn RT lần nữa ──
  {
    const w = dupWorld(50); const fake = makeFake({ rt: w.rt, fs: w.fs }); const U1 = initUE(fake), U2 = initUE(fake);
    const del = U => U.consume.reversePrep('P', 50, 'xoá bill', 'bill_del_1', [{ containerId: 'b1', qty: 50 }]).then(() => 'ok', e => 'err:' + e.message);
    const r = await Promise.all([del(U1), del(U2)]); await sleep(30);
    eq([fake.rtGet('active_units_gieogieo/P/b1/unitBase'), r.filter(x => x === 'ok').length >= 1], [100, true], 'L29 BTP: hai máy cùng xoá bill → RT 100 (không 150)');
    const nw = nlWorld(); nw.rt.active_units_gieogieo.X.A.unitBase = 150; const f2 = makeFake(nw); const V1 = initUE(f2), V2 = initUE(f2);
    const delN = U => U.consume.reverseIngredient('X', 50, 'xoá bill', 'bill_del_2', undefined, [{ containerId: 'A', qty: 50 }]).then(() => 'ok', e => 'err:' + e.message);
    await Promise.all([delN(V1), delN(V2)]); await sleep(30);
    eq(f2.rtGet('active_units_gieogieo/X/A/unitBase'), 200, 'L29 NL: hai máy cùng xoá bill → tem 200 (không 250)');
  }
  // ── Lỗi 30: xác minh dựng lại node không được làm mất dấu chống hoàn lặp ──
  {
    const f = mk(dupWorld(100).fs, dupWorld(100).rt);
    f.fake.FS[TASKS + '/verify_P'] = prepWorld().fs[TASKS + '/verify_P']; f.fake.FS[CASES + '/c1'] = prepWorld().fs[CASES + '/c1'];
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));   // hoàn xong nhưng không chốt được việc
    hook(f, 'reversal_unit_claims_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));   // kết quả claim cũng không ghi được → claim kẹt 'claiming'
    await f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx30');
    eq(rtv(f, 'b1/unitBase'), 150, 'L30 hoàn 50 → RT 150 (việc còn pending trên Firestore)');
    await f.UE.duty.verifyCommit(line(150, 150), task(), ctx());                       // xác minh giữa chừng dựng lại node
    T += 130000; await f.UE.consume.recoverDuplicates();            // quá hạn claim: giành lại và thử lại
    eq(rtv(f, 'b1/unitBase'), 150, 'L30 worker chạy tiếp sau xác minh → vẫn 150 (dấu hoàn còn nguyên, không cộng lại)');
  }
  // ── Lỗi 31: lượt xác minh cũ chậm không dựng lại RT của lô mà việc mới đã xác minh về 0 và đóng ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const release = gateRt(f, /active_units_gieogieo\/P\/b1$/);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30); T += 5000;
    f.fake.FS[TASKS + '/verify_P'] = { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c2', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-23T07:00:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, expireAt: '2026-09-25T14:30:00.000Z' };
    f.fake.FS[CASES + '/c2'] = { id: 'c2', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-22T14:00:00.000Z', to: '2026-09-23T07:00:00.000Z' }, history: [] };
    await f.UE.duty.verifyCommit(line(0, 100), Object.assign(task(), { firstAt: '2026-09-23T07:00:00.000Z', caseId: 'c2' }), ctx('D'));
    release(); const e = await old; await sleep(50);
    eq([rtv(f, 'b1'), f.fake.FS[PB + '/b1'].status, f.fake.FS[TASKS + '/verify_P'].status, /khác giành/.test((e && e.message) || '')], [null, 'used_up', 'done', true], 'L31 lượt cũ không dựng lại node RT sau khi việc mới đóng lô (RT trống, lô used_up)');
  }
  // ── Lỗi 32: mọi đường đổi số lô giữ nhật ký — sửa tay (setBatchQty) và đổ bỏ (discardByLots) ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    await f.UE.consume.prepSale('P', 10, 'bán', 'bill_32a_x', '2026-09-23', 'bill_32a_x_prep_P'); await sleep(30);   // RT 90
    const atMs = T; T += 1000;
    await f.UE.prep.setBatchQty('b1', 80); T += 1000;
    await f.UE.consume.prepSale('P', 10, 'bán', 'bill_32b_x', '2026-09-23', 'bill_32b_x_prep_P');                        // RT 70
    const a = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([rtv(f, 'b1/unitBase'), a.book, a.exact], [70, 90, true], 'L32a sửa tay 80 + bán 10 sau mốc cân 90 → sổ tại mốc vẫn 90 (setBatchQty giữ & ghi nhật ký)');
    const g = mk(prepWorld().fs, prepWorld().rt);
    await g.UE.consume.prepSale('P', 10, 'bán', 'bill_32c_x', '2026-09-23', 'bill_32c_x_prep_P'); await sleep(30);
    const at2 = T; T += 1000;
    await g.UE.prep.discardByLots({ id: 'P', name: 'Cốt', unit: 'g' }, { qty: 20, lines: [{ batchId: 'b1', batchCode: 'L1', qty: 20, con: 90 }], reason: 'đổ', totalCost: 0, ingredientBreakdown: [], weighings: {}, staffEmp: { id: 'E', fullName: 'E' } });
    const b = await g.UE.duty.lotBookAtExact('P', 'b1', at2);
    eq([rtv(g, 'b1/unitBase'), b.book, b.exact], [70, 90, true], 'L32b cân lúc 90 rồi đổ bỏ 20 → sổ tại mốc cân vẫn 90 (không thành 70)');
  }
  // ── Lỗi 33: hai tab cùng ghi hàng đợi cục bộ không ghi đè nhau ──
  {
    const store = mkStore();
    const f = mk(dupWorld(100).fs, dupWorld(100).rt); const UA = f.UE, UB = initUE(f.fake);
    let failDup = true; const rt = failRtOn(f); rt.on = true;
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => (failDup ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    await UA.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'txA');
    await UB.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'txB');
    eq(Object.keys(store).filter(k => k.indexOf('ue_dup_recovery_gieogieo__') === 0).length, 2, 'L33 hai tab → hai khoá riêng trong localStorage (không ghi đè)');
    failDup = false; rt.on = false; T += 70000;
    const UC = initUE(f.fake); await UC.consume.recoverDuplicates();
    eq([rtv(f, 'b1/unitBase'), Object.keys(store).length], [200, 0], 'L33 phiên mới phục hồi CẢ HAI việc (100 + 50 + 50 = 200), khoá đã đồng bộ được xoá');
    delete global.localStorage;
  }
  // ── Lỗi 34: dấu chống hoàn lặp không bị loại theo số lượng khi việc còn chờ ──
  {
    const f = mk(dupWorld(100).fs, dupWorld(100).rt);
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => ((a[0] && a[0].status === 'done') ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    await f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx34');          // RT 150, việc chưa chốt
    for (let i = 0; i < 25; i++) await f.UE.consume.reversePrep('P', 1, 'xoá', 'bill_34_' + i, [{ containerId: 'b1', qty: 1 }]);   // thêm 25 khoản hoàn → RT 175
    T += 70000; await f.UE.consume.recoverDuplicates();
    eq(rtv(f, 'b1/unitBase'), 175, 'L34 sau 25 khoản hoàn khác, việc cũ chạy lại KHÔNG hoàn lần nữa (175, không 225)');
  }
  // ── Lỗi 35: nhật ký bị cắt → "không đủ dữ liệu" (exact:false); xác minh không âm thầm điều chỉnh kho ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; T += 1000;
    const s1 = await f.UE.consume.prepSale('P', 10, 'bán', 'bill_35_0', '2026-09-23', 'bill_35_0_prep_P'); T += 1000;
    await f.UE.consume.reverse('P', s1.unitAllocations, 'prep_batches_gieogieo');
    for (let i = 1; i <= 31; i++) { T += 1000; await f.UE.consume.prepSale('P', 1, 'bán', 'bill_35_' + i, '2026-09-23', 'bill_35_' + i + '_prep_P'); }
    const bk = await f.UE.duty.lotBookAtExact('P', 'b1', atMs);
    eq([rtv(f, 'b1/unitBase'), bk.exact], [69, false], 'L35 nhật ký quá 30 dòng bị cắt → exact:false (không âm thầm trả số)');
    let err = null; try { await f.UE.duty.verifyCommit(Object.assign(line(100, bk.book), { snaps: { b1: { book: bk.book, exact: false } } }), task(), ctx()); } catch (e) { err = e; }
    eq([err && err.code, rtv(f, 'b1/unitBase'), Object.values(f.fake.FS).some(v => v && v.fromPrepVerify)], ['BOOK_INEXACT', 69, false], 'L35 xác minh bị từ chối: không đổi RT, không ghi điều chỉnh giả');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
