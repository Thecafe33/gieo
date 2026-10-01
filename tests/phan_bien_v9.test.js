// Bản rà bug lần 4 (01/10/2026) — lỗi 22–28 (ENGINE=unit_engine.v8.js để xem lỗi cũ; lỗi 28 phần POS chạy hàm thật từ posgieo.html).
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
const line = (counted, snap) => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: 100, qtyInitial: 733 }], batchQty: { b1: counted }, batchWeighings: { b1: [{ w: counted }] }, snaps: { b1: { book: snap } } });
const task = () => ({ id: 'verify_P', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, caseId: 'c1', prepId: 'P' });
const ctx = (id = 'C') => ({ now: new Date(T + 60000).toISOString(), staff: { id, fullName: id }, businessDate: '2026-09-23' });
const rtv = (f, p) => f.fake.rtGet('active_units_gieogieo/P/' + p);
const hook = (f, coll, method, fn) => { const orig = f.fake.fstore.collection.bind(f.fake.fstore); f.fake.fstore.collection = name => { const c = orig(name); if (name !== coll) return c; return { ...c, doc: id => { const d = c.doc(id); return { ...d, [method]: (...a) => fn(d, id, ...a) }; } }; }; };


const dupWorld = (cur = 100) => ({ rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: cur, capacity: 733, openedAt: 1 } } } },
  fs: { [PI + '/P']: { name: 'Cốt trà lài', unit: 'g', currentStock: cur, costPerUnit: 1, batchYield: 733 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: cur, unitBase: cur, batchCode: 'L1', qtyInitial: 733 } } });
const gateRt = (f, once) => { let release; const gate = new Promise(r => { release = r; }); let used = false;
  const origRef = f.fake.db.ref.bind(f.fake.db);
  const wrapRef = r => ({ ...r, transaction: async (...a) => { if (!used && once()) { used = true; await gate; } return r.transaction(...a); }, child: id => wrapRef(r.child(id)) });
  f.fake.db.ref = p => wrapRef(origRef(p)); return release; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const twoLots = (b2Rt) => { const w = prepWorld(100); w.fs[PB + '/b2'] = { prepId: 'P', status: 'active', qtyRemaining: 100, unitBase: 100, batchCode: 'L2', qtyInitial: 733 };
  w.fs[PI + '/P'].currentStock = 200; if (b2Rt) w.rt.active_units_gieogieo.P.b2 = { code: 'L2', unitBase: 100, capacity: 733, openedAt: 2 }; return w; };
const line2 = () => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: 100, qtyInitial: 733 }, { id: 'b2', batchCode: 'L2', qtyRemaining: 100, qtyInitial: 733 }],
  batchQty: { b1: 80, b2: 80 }, batchWeighings: { b1: [{ w: 80 }], b2: [{ w: 80 }] }, snaps: { b1: { book: 100 }, b2: { book: 100 } } });

(async () => {
  // ── Lỗi 22: phục hồi bù trùng không được hoàn hai lần (lượt đầu chậm, lượt phục hồi chạy xong, lượt đầu tiếp tục) ──
  {
    const f = mk(dupWorld(100).fs, dupWorld(100).rt);
    const release = gateRt(f, () => true);
    const p1 = f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx22');
    await sleep(30);
    T += 130000;                                                                                       // quá hạn thuê/claim: lượt phục hồi được phép chạy
    await f.UE.consume.recoverDuplicates(); await f.UE.consume.recoverDuplicates();
    const afterRecover = rtv(f, 'b1/unitBase');
    release(); await p1; await sleep(30);
    eq([afterRecover, rtv(f, 'b1/unitBase'), f.fake.FS[PI + '/P'].currentStock], [150, 150, 150], 'L22 lượt đầu chậm + hai lượt phục hồi → RT 150 (không cộng hai lần)');
    eq(Object.values(f.fake.FS).filter(v => v && v.txId === 'tx22').map(v => v.status), ['done'], 'L22 việc phục hồi đóng một lần');
  }
  // ── Lỗi 23: sổ lô tại mốc cân dựng từ nhật ký thay đổi có dấu — bán xen và HOÀN đều tính đúng ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T; T += 1000;
    const sale = await f.UE.consume.prepSale('P', 10, 'bán', 'bill_7_x', '2026-09-23', 'bill_7_x_prep_P');
    eq(await f.UE.duty.lotBookAt('P', 'b1', atMs), 100, 'L23 bán 10 sau mốc → sổ tại mốc 100');
    T += 1000; await f.UE.consume.reverse('P', sale.unitAllocations, 'prep_batches_gieogieo');          // xoá bill → RT về 100
    eq([rtv(f, 'b1/unitBase'), await f.UE.duty.lotBookAt('P', 'b1', atMs)], [100, 100], 'L23 bán rồi xoá bill (RT 100) → sổ tại mốc vẫn 100 (không phải 110)');
    const mid = T; T += 1000; await f.UE.consume.prepSale('P', 30, 'bán', 'bill_8_x', '2026-09-23', 'bill_8_x_prep_P');
    eq(await f.UE.duty.lotBookAt('P', 'b1', mid), 100, 'L23 mốc giữa hai lượt: chỉ tính lượt sau mốc');
  }
  // ── Lỗi 27: hoàn bill SAU lúc cân không bị xác minh ghi mất ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const sale = await f.UE.consume.prepSale('P', 10, 'bán', 'bill_9_x', '2026-09-23', 'bill_9_x_prep_P');   // RT 90
    await f.UE.consume.reverse('P', sale.unitAllocations, 'prep_batches_gieogieo');                          // cân + sổ đều 90, rồi xoá bill → RT 100
    await f.UE.duty.verifyCommit(line(90, 90), task(), ctx());
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PB + '/b1'].qtyRemaining, f.fake.FS[PI + '/P'].currentStock], [100, 100, 100], 'L27 hoàn +10 sau mốc cân được giữ: RT/lô/tồn = 100 (không bị ghi về 90)');
  }
  // ── Lỗi 24: lượt cũ chậm không ghi đè kết quả của việc mới hơn đã xác minh xong ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const release = gateRt(f, () => true);
    const old = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).catch(e => e);
    await sleep(30);
    T += 5000;
    f.fake.FS[TASKS + '/verify_P'] = { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c2', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-23T07:00:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, expireAt: '2026-09-25T14:30:00.000Z' };
    f.fake.FS[CASES + '/c2'] = { id: 'c2', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-22T14:00:00.000Z', to: '2026-09-23T07:00:00.000Z' }, history: [] };
    await f.UE.duty.verifyCommit(line(60, 100), Object.assign(task(), { firstAt: '2026-09-23T07:00:00.000Z', caseId: 'c2' }), ctx('D'));
    release(); const e = await old; await sleep(30);
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PB + '/b1'].qtyRemaining, f.fake.FS[TASKS + '/verify_P'].status, /lượt khác giành/.test((e && e.message) || '')], [60, 60, 'done', true], 'L24 lượt cũ chậm không đổi RT của việc mới (RT 60 = lô 60), lượt cũ báo lỗi');
  }
  // ── Lỗi 25: thử lại không coi lô CHƯA từng xử lý (thiếu node RT) là đã biến mất ──
  {
    const w = twoLots(false); const f = mk(w.fs, w.rt);
    let failB2 = true; const origRef = f.fake.db.ref.bind(f.fake.db);
    const wrapRef = (r, p) => ({ ...r, transaction: (...a) => (failB2 && /\/b2$/.test(p) ? Promise.reject(new Error('RT lỗi b2')) : r.transaction(...a)), child: id => wrapRef(r.child(id), p + '/' + id) });
    f.fake.db.ref = p => wrapRef(origRef(p), p);
    let err = ''; try { await f.UE.duty.verifyCommit(line2(), task(), ctx()); } catch (e) { err = e.message; }
    eq([/RT lỗi/.test(err), rtv(f, 'b1/unitBase'), f.fake.FS[TASKS + '/verify_P'].status], [true, 80, 'open'], 'L25 lượt đầu: lô 1 ghi 80, lô 2 lỗi RT, việc về open');
    failB2 = false;
    await f.UE.duty.verifyCommit(line2(), task(), ctx());
    eq([rtv(f, 'b1/unitBase'), rtv(f, 'b2/unitBase'), f.fake.FS[PB + '/b2'].status, f.fake.FS[PI + '/P'].currentStock], [80, 80, 'active', 160], 'L25 thử lại: lô 2 (chưa từng có node) được dựng 80, không bị đóng; tồn 160');
  }
  // ── Lỗi 26: lỗi ghi việc phục hồi → hàng đợi cục bộ (bộ nhớ + localStorage), máy khác/phiên mới vẫn phục hồi được ──
  {
    const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    const f = mk(dupWorld(100).fs, dupWorld(100).rt); let failDup = true;
    hook(f, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => (failDup ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    const r = await f.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx26');
    eq([r.ok, rtv(f, 'b1/unitBase')], [true, 150], 'L26 hoàn vẫn chạy dù không ghi được việc (RT 150)');
    const f2 = mk(dupWorld(100).fs, dupWorld(100).rt); let failDup2 = true;
    hook(f2, 'dup_recovery_gieogieo', 'set', (d, id, ...a) => (failDup2 ? Promise.reject(new Error('Firestore lỗi')) : d.set(...a)));
    hook(f2, 'stock_containers_gieogieo', 'x', () => {});
    const origRef = f2.fake.db.ref.bind(f2.fake.db); let failRt = true;
    f2.fake.db.ref = p => { const r0 = origRef(p); const wrap = r1 => ({ ...r1, transaction: (...a) => (failRt ? Promise.reject(new Error('RT lỗi')) : r1.transaction(...a)), child: id => wrap(r1.child(id)) }); return wrap(r0); };
    const r2 = await f2.UE.consume.compensateDuplicate('prep', 'P', [{ containerId: 'b1', qty: 50 }], 'tx26b');
    failDup2 = false; failRt = false;
    eq([r2.ok, rtv(f2, 'b1/unitBase'), JSON.parse(store.ue_dup_recovery_gieogieo || '[]').length], [false, 100, 1], 'L26 hoàn lỗi + ghi việc lỗi → còn 1 việc trong hàng đợi cục bộ (không mất dấu)');
    const UE3 = initUE(f2.fake);                                                                       // phiên mới (như mở lại app) — đọc hàng đợi từ localStorage
    T += 70000;
    await UE3.consume.recoverDuplicates();
    eq([rtv(f2, 'b1/unitBase'), Object.values(f2.fake.FS).filter(v => v && v.txId === 'tx26b').map(v => v.status), (JSON.parse(store.ue_dup_recovery_gieogieo || '[]')).length], [150, ['done'], 0], 'L26 phiên mới phục hồi từ hàng đợi cục bộ: RT 150, việc ghi lên Firestore và đóng, hàng đợi trống');
    delete global.localStorage;
  }
  // ── Lỗi 28: lô cuối đã đóng, ghi sổ lỗi → mở lại ghi nốt từ task.attempt (engine + POS) ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); let failLedger = true;
    const origTx = f.fake.fstore.runTransaction.bind(f.fake.fstore);
    f.fake.fstore.runTransaction = async fn => { if (failLedger && /ADJUSTMENT/.test(fn.toString())) throw new Error('mất mạng ghi sổ'); return origTx(fn); };
    let err = ''; try { await f.UE.duty.verifyCommit(line(0, 100), task(), ctx()); } catch (e) { err = e.message; }
    eq([/mất mạng/.test(err), rtv(f, 'b1'), f.fake.FS[PB + '/b1'].status, f.fake.FS[TASKS + '/verify_P'].status, !!(f.fake.FS[TASKS + '/verify_P'].attempt || {}).lots], [true, null, 'used_up', 'open', true], 'L28 lô cuối về 0 đã đóng, ghi sổ lỗi, việc về open còn attempt');
    failLedger = false;
    const lRec = { prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: [], batchQty: {}, batchWeighings: {}, snaps: {}, counted: 0 };
    const t2 = Object.assign(task(), f.fake.FS[TASKS + '/verify_P'], { id: 'verify_P' });
    await f.UE.duty.verifyCommit(lRec, t2, ctx());
    const adj = Object.values(f.fake.FS).find(v => v && v.fromPrepVerify);
    eq([adj && adj.qty, f.fake.FS[TASKS + '/verify_P'].status], [-100, 'done'], 'L28 mở lại không có lô: ghi nốt điều chỉnh −100 từ attempt, đóng việc');
  }
  // POS: mở việc có attempt mà không còn lô → màn ghi nốt (không chặn)
  {
    const src = extract('posgieo.html', ['openPrepVerifyPOS', 'renderPrepVerifyRecoveryPOS']);
    const log = [];
    const task0 = { id: 'verify_P', prepId: 'P', prepName: 'Cốt', partialRt: true, status: 'open', attempt: { lots: [{ id: 'b1', counted: 0, snapBook: 100, rtDone: true }] } };
    const fn = new Function('log', 'task0', 'const document={getElementById:()=>({set innerHTML(v){log.push("html:"+(/Ghi nốt/.test(v)))}})}; let _prepVerifyMode=null,_prepCountState=[],_prepVerifySeq=0;' +
      'const showScreen=()=>{}; const showLoading=()=>{}; const toast=m=>log.push("toast:"+m); const exitPrepVerifyPOS=()=>log.push("exit"); const escHtmlPos=x=>x; const renderPinInput=()=>"";' +
      'const UnitEngine={duty:{listOpenTasks:async()=>[task0]}}; const computePrepCountLinesPOS=async()=>[]; const renderPrepCountScreen=()=>log.push("count");\n' + src + '\nreturn openPrepVerifyPOS("verify_P").then(()=>log);');
    const r = await fn(log, task0);
    eq(r, ['html:true'], 'L28 POS: không còn lô nhưng việc có attempt → hiện màn ghi nốt (không thoát/không chặn)');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
