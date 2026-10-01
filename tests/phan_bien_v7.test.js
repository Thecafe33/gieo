// Bản rà bug lần 2 (01/10/2026) — lỗi 9–14 ở engine v6, sửa ở v7 (ENGINE=unit_engine.v6.js để xem lỗi cũ).
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const FILE = process.env.ENGINE || require('./lib/engine_file');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.round(a * 100) / 100, b, m);
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo', TASKS = 'duty_tasks_gieogieo', CASES = 'duty_cases_gieogieo';
let T = Date.parse('2026-09-23T08:30:00.000Z');
const mk = (fs, rt) => {
  const fake = makeFake({ rt: rt || {}, fs: fs || {} }); fake.FS['duty_config_gieogieo/current'] = Object.assign({ fleetCompliant: true }, fake.FS['duty_config_gieogieo/current'] || {}); const UE = loadEngineModule(FILE);
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-23', now: () => T, random: () => 0.5, hooks: { notify() {}, report() {} }, appFns: { handoverIsOverThreshold: () => false } });
  return { fake, UE };
};
const world = (o = {}) => {
  const lots = o.lots || [['b1', 100]];
  const rt = { active_units_gieogieo: { P: {} } }, fs = {
    [PI + '/P']: { name: 'Cốt trà lài', unit: 'g', currentStock: lots.reduce((s, x) => s + x[1], 0), costPerUnit: 1, batchYield: 733 },
    [TASKS + '/verify_P']: { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c1', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, expireAt: '2026-09-24T14:30:00.000Z' },
    [CASES + '/c1']: { id: 'c1', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-21T14:00:00.000Z', to: '2026-09-22T14:30:00.000Z' }, history: [] } };
  lots.forEach(([id, q]) => { rt.active_units_gieogieo.P[id] = { code: id, unitBase: q, capacity: 733, openedAt: 1 }; fs[PB + '/' + id] = { prepId: 'P', status: 'active', qtyRemaining: q, unitBase: q, batchCode: id, qtyInitial: 733 }; });
  return { rt, fs };
};
const line = (counted, snap, batches) => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: batches || [{ id: 'b1', batchCode: 'L1', qtyRemaining: 100, qtyInitial: 733 }],
  batchQty: { b1: counted }, batchWeighings: { b1: [{ w: counted }] }, snaps: { b1: { book: snap, exact: true } } });
const task = () => ({ id: 'verify_P', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, caseId: 'c1', prepId: 'P' });
const ctx = (id = 'C') => ({ now: new Date(T + 60000).toISOString(), staff: { id, fullName: id }, businessDate: '2026-09-23' });
const rtv = (f, p) => f.fake.rtGet('active_units_gieogieo/P/' + p);
const hook = (f, coll, method, fn) => { const orig = f.fake.fstore.collection.bind(f.fake.fstore); f.fake.fstore.collection = name => { const c = orig(name); if (name !== coll) return c; return { ...c, doc: id => { const d = c.doc(id); return { ...d, [method]: (...a) => fn(d, id, ...a) }; } }; }; };
const failLot = (f, condFn) => { const orig = f.fake.fstore.runTransaction.bind(f.fake.fstore); f.fake.fstore.runTransaction = fn => orig(async t => { const t2 = Object.create(t); t2.update = (r, ...a) => { if (condFn() && String(r.path).indexOf('prep_batches_gieogieo/') === 0) throw new Error('mất mạng'); return t.update(r, ...a); }; return fn(t2); }); };

(async () => {
  // ── Lỗi 9: hai lượt trừ BTP CÙNG txId chạy chồng nhau chỉ được trừ một lần ──
  {
    const f = mk({ [PI + '/P']: { name: 'Cốt', unit: 'g', currentStock: 200, costPerUnit: 1 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 200, unitBase: 200, batchCode: 'L1' } },
      { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 200, capacity: 200, openedAt: 1 } } } });
    const sale = () => f.UE.consume.prepSale('P', 50, 'bán', 'bill_1_x', '2026-09-23', 'bill_1_x_prep_P');
    await Promise.all([sale(), sale()]);
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PI + '/P'].currentStock, Object.keys(f.fake.FS).filter(k => k.startsWith(PT + '/')).length], [150, 150, 1], 'L9 hai lượt cùng txId chạy chồng → trừ 1 lần (tồn 150, một dòng sổ)');
  }
  // ── Lỗi 10: gỡ node lô về 0 không được xoá nợ do bán xen ngay trước đó ──
  {
    const f = mk(world().fs, world().rt); let fired = false, nTx = 0;
    const origRef = f.fake.db.ref.bind(f.fake.db);
    const sell = async () => { if (fired) return; fired = true; await f.UE.consume.prepSale('P', 10, 'bán xen', 'bill_9_x', '2026-09-23', 'bill_9_x_prep_P'); };
    const wrap = r => ({ ...r, remove: async (...a) => { await sell(); return r.remove(...a); },                       // v6: gỡ node riêng biệt sau khi đọc thấy 0
      transaction: async (...a) => { if (++nTx === 2) await sell(); return r.transaction(...a); } });                  // v7: giao dịch thứ 2 trên node = bước gỡ có điều kiện
    f.fake.db.ref = p => { const r = origRef(p);
      if (/active_units_gieogieo\/P$/.test(String(p))) return { ...r, child: id => (id === 'b1' ? wrap(r.child(id)) : r.child(id)) };
      if (/active_units_gieogieo\/P\/b1$/.test(String(p))) return wrap(r);
      return r; };
    await f.UE.duty.verifyCommit(line(0, 100), task(), ctx());
    eq([rtv(f, 'b1/unitBase'), f.fake.FS[PI + '/P'].pendingShortage || 0], [-10, 10], 'L10 bán 10 g ngay trước khi gỡ node → nợ lô −10 và khoản thiếu chờ đối chiếu 10 được giữ');
  }
  // ── Lỗi 11: bán xen / lô mới xuất hiện không tạo dòng điều chỉnh giả ──
  {
    const f = mk(world().fs, world().rt);
    // bán xen đúng lúc giữa bước ghi RT và bước ghi sổ/tồn (ở v6 là giao dịch thứ 2 trên Firestore)
    const origTx = f.fake.fstore.runTransaction.bind(f.fake.fstore); let nTx = 0;
    f.fake.fstore.runTransaction = async fn => { if (++nTx === 2) await f.UE.consume.prepSale('P', 10, 'bán xen', 'bill_8_x', '2026-09-23', 'bill_8_x_prep_P'); return origTx(fn); };
    await f.UE.duty.verifyCommit(line(100, 100), task(), ctx());
    const adj = Object.values(f.fake.FS).find(v => v && v.fromPrepVerify);
    eq([f.fake.FS[PI + '/P'].currentStock, adj ? adj.qty : 0], [90, 0], 'L11a cân đúng 100, bán xen 10 → tồn 90 và KHÔNG có điều chỉnh giả');
    const g = mk(world({ lots: [['b1', 100], ['b2', 200]] }).fs, world({ lots: [['b1', 100], ['b2', 200]] }).rt);
    await g.UE.duty.verifyCommit(line(100, 100), task(), ctx());
    const adj2 = Object.values(g.fake.FS).find(v => v && v.fromPrepVerify);
    eq([g.fake.FS[PI + '/P'].currentStock, adj2 ? adj2.qty : 0], [300, 0], 'L11b lô mới 200 g (chưa nằm trong màn cân) → tồn 300 và KHÔNG có điều chỉnh −200');
    const h = mk(world().fs, world().rt);
    await h.UE.duty.verifyCommit(line(80, 100), task(), ctx());
    const adj3 = Object.values(h.fake.FS).find(v => v && v.fromPrepVerify);
    eq([adj3 && adj3.qty, h.fake.FS[PI + '/P'].currentStock], [-20, 80], 'L11c cân thật lệch −20 → điều chỉnh đúng −20, tồn 80');
  }
  // ── Lỗi 12: cùng một nhân viên trên hai máy — lượt thứ hai khi lượt đầu còn mới bị từ chối ──
  {
    const fs = world().fs; fs[TASKS + '/verify_P'] = { ...fs[TASKS + '/verify_P'], status: 'processing', processingById: 'C', processingAt: new Date(T).toISOString(), processingToken: 'tok1' };
    const f = mk(fs, world().rt); let err = '';
    try { await f.UE.duty.verifyCommit(line(60, 100), task(), ctx('C')); } catch (e) { err = e.message; }
    eq([/đang xử lý|đã được xử lý/.test(err), rtv(f, 'b1/unitBase')], [true, 100], 'L12 cùng người, máy thứ hai khi lượt đầu còn mới → từ chối, không ghi');
    // lượt đầu lỗi → nhả việc → làm lại ngay được
    const g = mk(world().fs, world().rt);
    failLot(g, () => true);
    let e1 = ''; try { await g.UE.duty.verifyCommit(line(80, 100), task(), ctx('C')); } catch (e) { e1 = e.message; }
    eq([/mất mạng/.test(e1), g.fake.FS[TASKS + '/verify_P'].status], [true, 'open'], 'L12 lượt lỗi → việc được nhả về "open" để làm lại ngay');
  }
  // ── Lỗi 13: màn cũ giữ việc cũ không xử lý được việc mới (kể cả tự xác minh chính mình) ──
  {
    const fs = world().fs; fs[TASKS + '/verify_P'] = { ...fs[TASKS + '/verify_P'], firstById: 'B2', firstBy: 'Bình 2', firstAt: '2026-09-23T14:30:00.000Z', caseId: 'c2' };
    const f = mk(fs, world().rt); let err = '';
    try { await f.UE.duty.verifyCommit(line(80, 100), task(), ctx('B2')); } catch (e) { err = e.message; }
    eq([/đã thay đổi|tải lại/.test(err), rtv(f, 'b1/unitBase'), f.fake.FS[TASKS + '/verify_P'].status], [true, 100, 'open'], 'L13 màn cũ (việc của A) gửi khi server đã có việc mới (của B2) → từ chối, không ghi');
  }
  // ── Lỗi 14: ghi lô Firestore thất bại → KHÔNG đóng việc; làm lại thì xong ──
  {
    const f = mk(world().fs, world().rt); let fail = true;
    failLot(f, () => fail);
    let err = ''; try { await f.UE.duty.verifyCommit(line(80, 100), task(), ctx()); } catch (e) { err = e.message; }
    eq([/mất mạng|lô/.test(err), f.fake.FS[TASKS + '/verify_P'].status], [true, 'open'], 'L14 ghi lô lỗi → báo lỗi, việc chưa đóng');
    fail = false;
    await f.UE.duty.verifyCommit(line(80, 100), task(), ctx());
    eq([f.fake.FS[TASKS + '/verify_P'].status, rtv(f, 'b1/unitBase'), f.fake.FS[PB + '/b1'].qtyRemaining, Object.values(f.fake.FS).filter(v => v && v.fromPrepVerify).length], ['done', 80, 80, 1], 'L14 làm lại → xong, RT/lô khớp 80, đúng một dòng điều chỉnh');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
