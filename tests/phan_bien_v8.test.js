// Bản rà bug lần 3 (01/10/2026) — lỗi 16–21 (ENGINE=unit_engine.v7.js để xem lỗi cũ; lỗi 16/21 phần POS chạy hàm thật từ posgieo.html).
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

(async () => {
  // ── Lỗi 16: cùng bill, hai lượt (cùng máy / hai máy) chạy chồng → tem chỉ bị trừ một lần ──
  {
    const w = nlWorld(); const fake = makeFake(w); const UE1 = initUE(fake), UE2 = initUE(fake);
    const A = posFns(fake)(UE1), B = posFns(fake)(UE2);
    await Promise.all([A.applySalesConsumptionPOS({ billCode: '#1' }, 'bill_1_x', '2026-09-23'), A.applySalesConsumptionPOS({ billCode: '#1' }, 'bill_1_x', '2026-09-23')]);
    eq([fake.rtGet('active_units_gieogieo/X/A/unitBase'), fake.FS['inventory_items_gieogieo/X'].currentStock], [150, 150], 'L16a cùng máy, hai lượt cùng bill chạy chồng → trừ một lần (tem 150)');
    const w2 = nlWorld(); const f2 = makeFake(w2); const U1 = initUE(f2), U2 = initUE(f2);
    await Promise.all([posFns(f2)(U1).applySalesConsumptionPOS({ billCode: '#2' }, 'bill_2_x', '2026-09-23'), posFns(f2)(U2).applySalesConsumptionPOS({ billCode: '#2' }, 'bill_2_x', '2026-09-23')]);
    await new Promise(r => setTimeout(r, 30));
    eq([f2.rtGet('active_units_gieogieo/X/A/unitBase'), Object.keys(f2.FS).filter(k => k.startsWith('stock_transactions_gieogieo/')).length], [150, 1], 'L16b HAI MÁY cùng bill chạy chồng → phần trừ thêm được hoàn (tem 150, một dòng sổ)');
  }
  // ── Lỗi 17: hoàn phần trừ trùng bị lỗi RT → không báo xong; có việc phục hồi bền, làm lại thì hoàn đủ ──
  {
    const w = prepWorld(200); const fake = makeFake({ rt: w.rt, fs: { [PI + '/P']: w.fs[PI + '/P'], [PB + '/b1']: w.fs[PB + '/b1'] } });
    const UE1 = initUE(fake), UE2 = initUE(fake);
    const sale = UE => UE.consume.prepSale('P', 50, 'bán', 'bill_1_x', '2026-09-23', 'bill_1_x_prep_P');
    let failRt = false, nTx = 0;
    const origTx = fake.fstore.runTransaction.bind(fake.fstore);
    fake.fstore.runTransaction = async fn => { const r = await origTx(fn); if (++nTx === 2) failRt = true; return r; };
    const origRef = fake.db.ref.bind(fake.db);
    const wrapRef = r => ({ ...r, transaction: (...a) => (failRt ? Promise.reject(new Error('RT lỗi')) : r.transaction(...a)), child: id => wrapRef(r.child(id)) });
    fake.db.ref = p => wrapRef(origRef(p));
    const res = await Promise.all([sale(UE1), sale(UE2)]);
    failRt = false;
    const dup = res.find(r => r && r.duplicate);
    eq([!!dup, dup && dup.compensated], [true, false], 'L17 lượt trùng hoàn thất bại → KHÔNG báo đã bù (compensated:false)');
    const pend = Object.keys(fake.FS).filter(k => k.startsWith('dup_recovery_gieogieo/')).map(k => fake.FS[k]);
    eq([pend.length, pend[0] && pend[0].status, Object.keys(fake.FS).some(k => k.startsWith('alerts_gieogieo/dupfix'))], [1, 'pending', true], 'L17 có việc phục hồi bền (pending) + cảnh báo');
    eq(fake.rtGet('active_units_gieogieo/P/b1/unitBase'), 100, 'L17 trước phục hồi: tồn đang thiếu 50 (200 − 100)');
    await UE1.consume.recoverDuplicates();
    eq([fake.rtGet('active_units_gieogieo/P/b1/unitBase'), fake.FS[PI + '/P'].currentStock, Object.values(fake.FS).filter(v => v && v.kind === 'prep' && v.txId).map(v => v.status)], [150, 150, ['done']], 'L17 chạy phục hồi → hoàn đủ (150), việc đóng');
    await UE1.consume.recoverDuplicates();
    eq(fake.rtGet('active_units_gieogieo/P/b1/unitBase'), 150, 'L17 chạy phục hồi lần nữa → không hoàn đôi');
  }
  // ── Lỗi 18: lượt lỗi rồi mở lại màn với số cân/sổ KHÁC → làm tiếp bằng đúng dữ liệu lượt cũ ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); let fail = true;
    hook(f, PB, 'update', (d, id, patch) => { if (fail) return Promise.reject(new Error('mất mạng')); return d.update(patch); });
    let err = ''; try { await f.UE.duty.verifyCommit(line(80, 100), task(), ctx()); } catch (e) { err = e.message; }
    eq([/mất mạng/.test(err), f.fake.FS[TASKS + '/verify_P'].status], [true, 'open'], 'L18 lượt đầu lỗi ghi lô, việc về open (RT đã ghi 80)');
    fail = false;
    await f.UE.duty.verifyCommit(line(80, 80), task(), ctx());      // mở lại màn: cân 80 và chụp sổ MỚI 80
    const adj = Object.values(f.fake.FS).filter(v => v && v.fromPrepVerify);
    eq([adj.length, adj[0] && adj[0].qty, f.fake.FS[TASKS + '/verify_P'].status], [1, -20, 'done'], 'L18a mở lại với sổ mới 80 → vẫn ghi điều chỉnh −20 theo lượt đầu (không mất)');
    const g = mk(prepWorld().fs, prepWorld().rt); let fail2 = true;
    hook(g, PB, 'update', (d, id, patch) => { if (fail2) return Promise.reject(new Error('mất mạng')); return d.update(patch); });
    try { await g.UE.duty.verifyCommit(line(80, 100), task(), ctx()); } catch (e) { /* lượt 1 lỗi */ }
    fail2 = false;
    await g.UE.duty.verifyCommit(line(60, 100), task(), ctx());      // mở lại, cân 60
    eq([g.fake.FS[TASKS + '/verify_P'].bCount, rtv(g, 'b1/unitBase'), g.fake.FS[PB + '/b1'].qtyRemaining], [80, 80, 80], 'L18b mở lại cân 60 → vẫn theo số của lượt đầu (80): task, RT và lô khớp nhau');
  }
  // ── Lỗi 19: lượt hết quyền (bị người khác giành sau 60 giây) không ghi đè sổ / hồ sơ / mốc đếm ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); let slow = null, release;
    // B chậm ở bước ghi lô; trong lúc đó C giành việc (quá 60 giây) và hoàn tất
    hook(f, PB, 'update', async (d, id, patch) => { if (!slow) { slow = new Promise(r => { release = r; }); await slow; } return d.update(patch); });
    const pB = f.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')).then(() => 'ok', e => e.message);
    await new Promise(r => setTimeout(r, 20));
    T += 61000;
    const f2 = f.UE; hook(f, PB, 'update', (d, id, patch) => d.update(patch));
    const rC = await f2.duty.verifyCommit(line(80, 100), task(), { ...ctx('D'), now: new Date(T).toISOString() }).then(() => 'ok', e => e.message);
    release();
    const rB = await pB;
    const adj = Object.values(f.fake.FS).filter(v => v && v.fromPrepVerify);
    eq([rC, /bị lượt khác giành|đã được xử lý|đã bị/.test(rB), adj.length, f.fake.FS[PI + '/P'].lastCount.byId, f.fake.FS[TASKS + '/verify_P'].verifiedById], ['ok', true, 1, 'D', 'D'], 'L19 B hết quyền → bị từ chối ở bước ghi sổ; sổ, mốc đếm và việc đều của D (không bị B ghi đè)');
    T -= 61000;
  }
  // ── Lỗi 20: bán vượt số cân sau lúc cân → nợ lô âm được giữ (không kẹp về 0) ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    await f.UE.consume.prepSale('P', 120, 'bán', 'bill_5_x', '2026-09-23', 'bill_5_x_prep_P');     // sau lúc cân (snap 100): RT −20, thiếu chờ đối chiếu 20
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PI + '/P'].pendingShortage || 0], [-20, 20], 'L20 trước xác minh: nợ lô −20');
    await f.UE.duty.verifyCommit(line(80, 100), task(), ctx());                                      // thực tế lúc cân 80 (kém sổ 20) rồi bán 120 → còn −40
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PI + '/P'].pendingShortage || 0], [-40, 40], 'L20 sau xác minh: nợ lô −40 (không bị kẹp về 0), thiếu chờ đối chiếu 40');
  }
  // ── Lỗi 21: sổ lô TẠI mốc đọc số cân (sales xen vào giữa lúc đọc sổ được cộng lại) ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const atMs = T;                                                                                  // mốc đọc số cân
    T += 1000;                                                                                       // 1 giây sau: bán 10 g (ghi usageEvents của lô)
    await f.UE.consume.prepSale('P', 10, 'bán', 'bill_6_x', '2026-09-23', 'bill_6_x_prep_P');
    const naive = await f.UE.duty.lotBookNow('P', 'b1');
    const atScale = await f.UE.duty.lotBookAt('P', 'b1', atMs);
    eq([naive, atScale], [90, 100], 'L21 sổ tại mốc cân = 100 (sổ hiện tại 90 + 10 bán sau mốc), không phải 90');
    const g = mk(prepWorld().fs, prepWorld().rt); T = atMs;
    const naiveSnap = 90;                                                                            // snapshot đọc muộn (lỗi cũ): count 100 vs book 90
    await g.UE.duty.verifyCommit(line(100, naiveSnap), task(), ctx());
    const adjOld = Object.values(g.fake.FS).find(v => v && v.fromPrepVerify);
    eq(!!adjOld, true, 'L21 (đối chứng) snapshot đọc muộn 90 với số cân 100 → sinh điều chỉnh giả — vì vậy POS phải dùng lotBookAt');
  }
  // POS: onDone lấy mốc TRƯỚC khi đọc sổ
  {
    const src = extract('posgieo.html', ['prepCountWeighBatch']);
    const order = []; let clock = 1000;
    const l = { prepId: 'P', prepName: 'X', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1' }], batchQty: {}, batchDone: {}, batchWeighings: {} };
    const fn = new Function('l', 'order', 'clockRef', 'let _prepCountState=[l]; let _prepVerifyMode={task:{}}; const _prepCountRefreshLineCounted=()=>{}; const renderPrepCountCard=()=>{}; const console={warn(){}};\n' +
      'const UnitEngine={clock:{now:()=>clockRef.v},duty:{lotBookAtExact:async(p,b,at)=>{ order.push(["lotBookAt",at]); clockRef.v+=500; return {book:90,exact:true}; }}};\n' +
      'const openWeighPad=o=>{ clockRef.v=2000; order.push("scale"); return o.onDone(100,[{w:100}]); };\n' + src + '\nprepCountWeighBatch(0,"b1",0); return new Promise(r=>setTimeout(()=>r(l),10));');
    const clockRef = { v: 1000 }; const lr = await fn(l, order, clockRef);
    eq([order, lr.snaps.b1.book, lr.snaps.b1.at], [['scale', ['lotBookAt', 2000]], 90, new Date(2000).toISOString()], 'L21 POS: mốc đọc số cân lấy TRƯỚC khi đọc sổ, truyền cho lotBookAt (không dùng giờ sau khi đọc)');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
