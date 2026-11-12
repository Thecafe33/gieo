'use strict';
// [F2 12/11/2026 — docs/KE_HOACH_FIX_TRU_KHO_HAO_HUT_12-11.md, bất biến B16] Mở tem GÁNH khoản «bán khi chưa có tem mở» (Sổ lệch no_open_tem)
// của món — như gánh nợ FIFO. Chạy mã kho THẬT (functions/automation/engine.js → unit_engine.v22.js) trên Firebase giả.
const assert = require('node:assert');
const { makeFake } = require('./lib/fakefb');
const { createEngine } = require('../functions/automation/engine');
const CTN = 'stock_containers_gieogieo', AN = 'stock_anomalies_gieogieo', TX = 'stock_transactions_gieogieo';
const item = (o) => Object.assign({ id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit', stockManaged: true, currentStock: 1000, costPerUnit: 10, packagingUnits: [{ name: 'Hộp', baseQty: 1000 }], countUnitName: 'Hộp' }, o || {});
const sealed = (id, extra) => [CTN + '/' + id, Object.assign({ itemId: 'X', itemName: 'Sữa', code: id + id + id, status: 'sealed', baseQty: 1000, unit: 'ml' }, extra || {})];
function world(o) {
  o = o || {};
  let now = Date.parse('2026-11-12T03:00:00Z');
  const it = item(o.item);
  const f = makeFake({ rt: o.rt || {}, fs: Object.assign({ ['inventory_items_gieogieo/X']: it }, Object.fromEntries([sealed('B'), sealed('C')]), o.fs || {}) });
  const e = createEngine({ storeId: 'gg01', fstore: f.fstore, db: f.db, FieldValue: f.FieldValue, now: () => now, items: [it] });
  const W = { f, e, tick: ms => { now += ms; }, now: () => now };
  W.sell = async (bill, qty) => {
    const al = await e.consume.allocate('X', qty, undefined, { type: 'order', id: bill, duringPrepLock: true, opId: bill + '_ing_X' }).catch(() => []);
    await e.ledger.apply({ itemId: 'X', type: 'CONSUMPTION', qty: -qty, note: 'bán', staff: '', referenceId: bill, deriveFromUnits: al.length > 0, rtError: !!al.rtError,
      businessDate: '2026-11-12', txId: bill + '_ing_X', duringPrepLock: true, ...(al.length ? { meta: { fifoAllocations: al } } : {}) });
  };
  W.open = async id => {
    const ref = f.fstore.collection(CTN).doc(id), d = f.FS[CTN + '/' + id];
    if (d.status === 'sealed') await ref.update({ status: 'open', openedAt: new Date(now).toISOString() });
    await e.fn.unitEngineOnOpen(id, { itemId: 'X', itemName: 'Sữa', code: d.code, baseQty: d.baseQty, unit: 'ml' });
    await e.stock.recompute('X', CTN);
  };
  W.finish = async id => {
    const ref = f.fstore.collection(CTN).doc(id);
    await e.fn.unitEngineFinishOpenUnit(id, { ...f.FS[CTN + '/' + id], itemId: 'X', unit: 'ml' }, { id: 'a', fullName: 'A' }, 'Hết', true, ref, '', true);
  };
  W.tem = id => { const n = f.rtGet('active_units_gieogieo/X/' + id); return n ? n.unitBase : null; };
  W.an = () => Object.entries(f.FS).filter(([p]) => p.startsWith(AN + '/')).map(([p, d]) => ({ id: p.split('/')[1], ...d }));
  W.waste = () => Object.entries(f.FS).filter(([p, d]) => p.startsWith(TX + '/') && d.type === 'WASTE');
  W.out = () => Object.entries(f.FS).filter(([p, d]) => p.startsWith(TX + '/') && (d.type === 'CONSUMPTION' || d.type === 'WASTE')).reduce((s, [, d]) => s - Number(d.qty), 0);
  return W;
}
const anom = (id, o) => [AN + '/' + id, Object.assign({ itemId: 'X', itemName: 'Sữa', unit: 'ml', qty: -50, kind: 'no_open_tem', txType: 'CONSUMPTION', status: 'open', ue: 22, createdAt: '2026-11-12T02:00:00.000Z', businessDate: '2026-11-12' }, o || {})];

(async () => {
  // ── 1. Tình huống A: bán 50 khi chưa quét mở → mở → bán 950 (hộp thật cạn) → báo hết ─────────────────────
  {
    const W = world();
    await W.sell('bill_1', 50); W.tick(60000);
    assert.equal(W.an()[0].kind, 'no_open_tem'); assert.equal(W.an()[0].ue, 22);
    await W.open('B');
    assert.equal(W.tem('B'), 950, 'tem mở ra gánh 50 đã bán');
    assert.equal(W.f.FS['inventory_items_gieogieo/X'].currentStock, 1950, 'tồn = Σ tem (B 950 + C còn seal 1000)');
    const a = W.an()[0]; assert.equal(a.status, 'absorbed'); assert.equal(a.absorbedBy, 'B'); assert.equal(a.absorbedQty, 50);
    const tx = W.f.FS[TX + '/bill_1_ing_X']; assert.equal(tx.absorbedIntoContainerId, 'B'); assert.deepEqual(tx.absorbedAllocations.map(x => [x.containerId, x.qty]), [['B', 50]]);
    assert(!W.f.rtGet('active_units_gieogieo/X/B/_anomCarry'), 'dấu RT đã gỡ');
    assert.equal(W.f.FS['inventory_items_gieogieo/X'].lastUnitOpenedAt, undefined, 'không ghi gì lên doc món (danh mục đồng bộ giữa các quán)');
    // mở lại cùng mã (bấm lại / máy khác) → không gánh thêm
    await W.open('B'); assert.equal(W.tem('B'), 950);
    await W.sell('bill_2', 950); await W.finish('B');
    assert.equal(W.waste().length, 0, 'báo hết lúc hộp thật cạn → KHÔNG có WASTE');
    assert.equal(W.out(), 1000, 'tổng sổ ra = đúng một hộp');
    console.log('ok 1. Tình huống A: tem mở ra 950, báo hết 0 WASTE, Sổ lệch đóng (absorbed), tổng sổ ra 1000; mở lại không gánh thêm');
  }
  // ── 2. Mất mạng giữa hai pha (RT đã trừ, Firestore chưa chốt) ─────────────────────────────────────────
  {
    const W = world({ fs: Object.fromEntries([anom('tx_s1')]) });
    const rt = W.f.fstore.runTransaction.bind(W.f.fstore); let fail = 3;
    W.f.fstore.runTransaction = fn => (fail-- > 0 ? Promise.reject(new Error('offline')) : rt(fn));
    await W.open('B');   // pha 2 hỏng cả 3 lần thử
    W.f.fstore.runTransaction = rt;
    assert.equal(W.tem('B'), 950); assert(W.f.rtGet('active_units_gieogieo/X/B/_anomCarry'), 'dấu còn trên RT'); assert.equal(W.an()[0].status, 'open');
    await W.open('B');   // mở lại → chạy nốt, không trừ thêm
    assert.equal(W.tem('B'), 950); assert.equal(W.an()[0].status, 'absorbed'); assert(!W.f.rtGet('active_units_gieogieo/X/B/_anomCarry'));
    // báo hết cũng tự chạy nốt (mã còn dấu)
    const W2 = world({ fs: Object.fromEntries([anom('tx_s1')]) });
    const rt2 = W2.f.fstore.runTransaction.bind(W2.f.fstore); let fail2 = 3;
    W2.f.fstore.runTransaction = fn => (fail2-- > 0 ? Promise.reject(new Error('offline')) : rt2(fn));
    await W2.open('B'); W2.f.fstore.runTransaction = rt2;
    await W2.sell('bill_9', 950); await W2.finish('B');
    assert.equal(W2.an()[0].status, 'absorbed'); assert.equal(W2.waste().length, 0);
    console.log('ok 2. Mất mạng giữa hai pha: tem giữ 950 + dấu; mở lại / báo hết chạy nốt, không trừ thêm');
  }
  // ── 3. Dòng Sổ lệch bị đóng / gánh nơi khác giữa hai pha → trả lại tem ────────────────────────────────
  {
    const W = world({ fs: Object.fromEntries([anom('tx_s1'), anom('tx_s2', { qty: -30, createdAt: '2026-11-12T02:10:00.000Z' })]) });
    const rt = W.f.fstore.runTransaction.bind(W.f.fstore); let first = true;
    W.f.fstore.runTransaction = fn => { if (first) { first = false; W.f.FS[AN + '/tx_s2'].status = 'resolved'; } return rt(fn); };
    await W.open('B');
    assert.equal(W.tem('B'), 950, '30 của dòng vừa bị quản lý đóng được trả lại tem');
    assert.equal(W.f.FS[AN + '/tx_s1'].status, 'absorbed'); assert.equal(W.f.FS[AN + '/tx_s2'].absorbedBy, undefined);
    console.log('ok 3. Dòng Sổ lệch đổi trạng thái giữa hai pha → phần đó trả lại tem (tem 950, không 920)');
  }
  // ── 4. Trần dung tích ───────────────────────────────────────────────────────────────────────────────────
  {
    const W = world({ fs: Object.fromEntries([anom('tx_big', { qty: -1200 })]) });
    await W.open('B');
    assert.equal(W.tem('B'), 0, 'gánh tới trần dung tích');
    const a = W.f.FS[AN + '/tx_big']; assert.equal(a.status, 'open', 'phần vượt còn ở Sổ lệch'); assert.equal(a.absorbedQty, 1000); assert.equal(a.absorbedBy, 'B');
    W.tick(60000); await W.finish('B'); await W.open('C');
    assert.equal(W.tem('C'), 1000, 'dòng đã được một tem gánh thì tem sau không gánh phần vượt');
    console.log('ok 4. Sổ lệch 1200 > dung tích 1000 → gánh 1000, 200 ở lại Sổ lệch; tem sau không gánh tiếp');
  }
  // ── 5. Không gánh: dòng cũ / trước lần mở tem trước / dữ liệu cũ (không ue:22) / rt_error / món khác / đang có tem khác mở ─
  {
    const W = world({ fs: Object.fromEntries([
      anom('old', { createdAt: '2026-11-08T00:00:00.000Z' }), anom('beforeOpen', { absorbSkippedBy: 'Z' }), anom('legacy', { ue: null }),
      anom('rt', { kind: 'rt_error' }), anom('other', { itemId: 'Y' }), anom('waste', { kind: 'waste_no_tem' })]) });
    await W.open('B');
    assert.equal(W.tem('B'), 1000); assert(W.an().every(a => a.status === 'open' && !a.absorbedBy));
    assert.equal(W.f.FS[AN + '/beforeOpen'].absorbSkippedBy, 'Z', 'dòng đã được lần mở trước xét giữ nguyên');
    const W2 = world({ rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 300, capacity: 1000, openedAt: 1 } } } }, fs: Object.fromEntries([anom('tx_s1')]) });
    W2.f.FS['inventory_items_gieogieo/X'].currentStock = 1300;
    await W2.open('B');
    assert.equal(W2.tem('B'), 1000, 'đang có tem khác mở → dòng Sổ lệch không thuộc tem này');
    assert.equal(W2.f.FS[AN + '/tx_s1'].absorbSkippedBy, 'B', 'đánh dấu đã xét');
    W2.f.FS[CTN + '/A'] = { itemId: 'X', code: 'AAA', status: 'open', baseQty: 1000, unitBase: 300, unit: 'ml' };
    await W2.sell('bill_7', 300); W2.tick(60000); await W2.finish('A'); await W2.open('C');
    assert.equal(W2.tem('C'), 1000, 'tem mở sau KHÔNG gánh dòng đã được lần mở trước xét (thuộc tem cũ)');
    console.log('ok 5. Không gánh: dòng > 3 ngày / đã được lần mở tem trước xét / dữ liệu trước v22 / rt_error / hủy không tem / món khác / có tem khác đang mở');
  }
  // ── 6. Nợ FIFO + Sổ lệch cùng lúc ───────────────────────────────────────────────────────────────────────
  {
    const W = world({ rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: -20, capacity: 1000, openedAt: 1 } } } },
      fs: Object.fromEntries([[CTN + '/A', { itemId: 'X', code: 'AAA', status: 'open', baseQty: 1000, unitBase: -20, unit: 'ml' }], anom('tx_s1')]) });
    await W.open('B');
    assert.equal(W.tem('B'), 930, '1000 − nợ 20 − Sổ lệch 50');
    assert.equal(W.f.FS[CTN + '/A'].status, 'finished'); assert.equal(W.f.FS[AN + '/tx_s1'].status, 'absorbed');
    console.log('ok 6. Nợ FIFO 20 + Sổ lệch 50 → tem mới 930 (cộng đúng, cả hai pha chốt)');
  }
  // ── 7. Tem «cái rời» / BTP → không áp dụng ──────────────────────────────────────────────────────────────
  {
    const W = world({ item: { unit: 'cái', packagingUnits: [{ name: 'Cái', baseQty: 1 }], countUnitName: 'Cái' }, fs: Object.fromEntries([anom('tx_s1', { qty: -1 }), sealed('B', { baseQty: 1, unit: 'cái' })]) });
    await W.open('B'); assert.equal(W.tem('B'), 1); assert.equal(W.f.FS[AN + '/tx_s1'].status, 'open');
    const W2 = world({ fs: Object.fromEntries([anom('tx_s1', { itemId: 'P' }), ['prep_batches_gieogieo/b1', { prepId: 'P', status: 'active', qtyRemaining: 500 }], ['prep_items_gieogieo/P', { name: 'BTP' }]]) });
    await W2.e.fn.unitEngineOnOpen('b1', { itemId: 'P', code: 'L1', baseQty: 500 }, 'prep_batches_gieogieo');
    assert.equal(W2.f.rtGet('active_units_gieogieo/P/b1/unitBase'), 500); assert.equal(W2.f.FS[AN + '/tx_s1'].status, 'open');
    console.log('ok 7. Tem «cái rời» và lô BTP: không gánh');
  }
  // ── 8. Xoá bill đã được gánh → hoàn về đúng tem đã gánh ─────────────────────────────────────────────────
  {
    const W = world();
    await W.sell('bill_1', 50); W.tick(60000); await W.open('B'); assert.equal(W.tem('B'), 950);
    await W.sell('bill_2', 100); assert.equal(W.tem('B'), 850);
    const r = await W.e.consume.reverseSales({ billCode: 'B001' }, 'bill_1');
    assert(r && r.ok !== false, JSON.stringify(r));
    assert.equal(W.tem('B'), 900, 'hoàn 50 về tem B');
    assert.equal(W.f.FS['inventory_items_gieogieo/X'].currentStock, 1900);
    assert(!W.an().some(a => a.kind === 'reversal_outside_tem'), 'không sinh Sổ lệch «hoàn ngoài tem»');
    assert.equal(W.f.FS[TX + '/reversal_bill_1_ing_X'].reversalCoverage, 'full');
    console.log('ok 8. Xoá bill đã được tem gánh → hoàn 50 về tem B (900), không Sổ lệch hoàn ngoài tem');
  }
  console.log('ALL PASS');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
