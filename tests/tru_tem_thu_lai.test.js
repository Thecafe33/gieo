'use strict';
// [F3 12/11/2026 — docs/KE_HOACH_FIX_TRU_KHO_HAO_HUT_12-11.md] Trừ tem lúc bán (kho v22): mã lượt `opId` + dấu chống lặp trên tem,
// thử lại khi RT lỗi (≤ 2 lần, ~0,75 giây), vẫn lỗi → Sổ lệch 'rt_error' + cảnh báo allocate_rtdb_error có thật.
const assert = require('node:assert');
const { makeFake } = require('./lib/fakefb');
const { createEngine } = require('../functions/automation/engine');
const item = { id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit', stockManaged: true, currentStock: 200, costPerUnit: 10, packagingUnits: [{ name: 'Hộp', baseQty: 1000 }], countUnitName: 'Hộp' };
function world() {
  const f = makeFake({ rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 200, capacity: 1000, openedAt: 1 } } } },
    fs: { 'inventory_items_gieogieo/X': { ...item }, 'stock_containers_gieogieo/A': { itemId: 'X', code: 'AAA', status: 'open', baseQty: 1000, unitBase: 200, unit: 'ml' } } });
  // engine cố ý KHÔNG có bộ nhớ đệm món (như môi trường thử của tools/ra_soat) — cảnh báo vẫn phải ghi được
  const e = createEngine({ storeId: 'gg01', fstore: f.fstore, db: f.db, FieldValue: f.FieldValue, items: [] });
  return { f, e, tem: () => f.rtGet('active_units_gieogieo/X/A/unitBase') };
}
// RT của món lỗi `n` lần; mode 'committed' = máy chủ ĐÃ ghi nhưng mất ACK (transaction chạy rồi mới ném lỗi)
function failRt(f, n, mode) {
  const orig = f.db.ref.bind(f.db); let left = n, calls = 0;
  f.db.ref = p => { const r = orig(p); if (!/active_units_gieogieo\/X$/.test(String(p))) return r; const t = r.transaction.bind(r);
    r.transaction = async (fn, ...a) => { calls++; if (left > 0) { left--; if (mode === 'committed') await t(fn, ...a); throw new Error('disconnect'); } return t(fn, ...a); }; return r; };
  return () => calls;
}
async function sell(W, bill, qty, opts) {
  const al = await W.e.consume.allocate('X', qty, undefined, { type: 'order', id: bill, ...(opts && opts.noOp ? {} : { opId: bill + '_ing_X' }) }).catch(() => []);
  await W.e.ledger.apply({ itemId: 'X', type: 'CONSUMPTION', qty: -qty, note: 'bán', staff: '', referenceId: bill, deriveFromUnits: al.length > 0, rtError: !!al.rtError,
    businessDate: '2026-11-12', txId: bill + '_ing_X', ...(al.length ? { meta: { fifoAllocations: al } } : {}) });
  return al;
}
const anomalies = f => Object.entries(f.FS).filter(([p]) => p.startsWith('stock_anomalies_gieogieo/')).map(([, d]) => d);
const alerts = f => Object.entries(f.FS).filter(([p]) => p.startsWith('alerts_gieogieo/')).map(([, d]) => d.type);
const settle = () => new Promise(r => setTimeout(r, 50));

(async () => {
  {
    const W = world(), calls = failRt(W.f, 1);
    const al = await sell(W, 'bill_1', 50);
    assert.equal(W.tem(), 150); assert.equal(calls(), 2); assert.equal(al.length, 1); assert(al.opMarked);
    assert.deepEqual(anomalies(W.f), []); assert.equal(W.f.FS['stock_transactions_gieogieo/bill_1_ing_X'].outsideTem, undefined);
    console.log('ok 1. RT lỗi 1 lần rồi được → tem trừ đúng 1 lần, không Sổ lệch');
  }
  {
    const W = world(), calls = failRt(W.f, 1, 'committed');
    const al = await sell(W, 'bill_1', 50);
    assert.equal(W.tem(), 150, 'máy chủ đã ghi ở lần 1 (mất ACK) → lần thử lại KHÔNG trừ đôi'); assert.equal(calls(), 2);
    assert(al.replayed); assert.deepEqual(al.map(a => [a.containerId, a.qty]), [['A', 50]]);
    assert.deepEqual(anomalies(W.f), []);
    // chạy lại cả lượt (vd F4 chạy nốt khi sổ chưa ghi) → vẫn không trừ
    const again = await W.e.consume.allocate('X', 50, undefined, { type: 'order', id: 'bill_1', opId: 'bill_1_ing_X' });
    assert(again.replayed); assert.equal(W.tem(), 150);
    console.log('ok 2. RT «lỗi nhưng thật ra đã ghi» → không trừ đôi (trả lại phân bổ cũ, cờ replayed)');
  }
  {
    const W = world(), calls = failRt(W.f, 9);
    const t0 = Date.now(); const al = await sell(W, 'bill_1', 50); const ms = Date.now() - t0;
    await settle();
    assert.equal(calls(), 3, '1 lần + 2 lần thử lại'); assert(ms < 1500, 'thời gian thêm ≤ trần (' + ms + ' ms)');
    assert(al.rtError); assert.equal(W.tem(), 200);
    const a = anomalies(W.f); assert.equal(a.length, 1); assert.equal(a[0].kind, 'rt_error'); assert.equal(a[0].qty, -50);
    assert(alerts(W.f).includes('allocate_rtdb_error'), 'cảnh báo lỗi kết nối có thật (kể cả khi bộ nhớ đệm món rỗng)');
    console.log('ok 3. RT lỗi liên tục → Sổ lệch rt_error + cảnh báo allocate_rtdb_error; thêm ' + ms + ' ms (trần ~1 giây)');
  }
  {
    // nơi gọi chưa truyền mã lượt (thêm topping / đổ ly / bắt đầu mẻ): không thử lại (thử mù có thể trừ đôi), nhưng nhãn vẫn đúng
    const W = world(), calls = failRt(W.f, 1);
    const al = await sell(W, 'bill_1', 50, { noOp: true });
    assert.equal(calls(), 1); assert.equal(al.length, 0);
    assert.equal(anomalies(W.f)[0].kind, 'rt_error', 'engine tự nhận lỗi kết nối vừa xảy ra cho món');
    console.log('ok 4. Không có mã lượt → không thử lại, Sổ lệch vẫn ghi đúng loại rt_error');
  }
  {
    // hoàn phân bổ kèm unmarkOp → gỡ dấu: lần chạy lại sau đó trừ THẬT
    const W = world();
    const al = await W.e.consume.allocate('X', 50, undefined, { type: 'order', id: 'bill_1', opId: 'bill_1_ing_X' });
    assert.equal(W.tem(), 150); assert.equal(W.f.rtGet('active_units_gieogieo/X/A/lastConsumeOps').length, 1);
    await W.e.consume.reverseClaimed('salesfail_bill_1_ing_X', 'X', al, undefined, undefined, { unmarkOp: 'bill_1_ing_X' });
    assert.equal(W.tem(), 200); assert(!W.f.rtGet('active_units_gieogieo/X/A/lastConsumeOps'));
    const again = await W.e.consume.allocate('X', 50, undefined, { type: 'order', id: 'bill_1', opId: 'bill_1_ing_X' });
    assert(!again.replayed); assert.equal(W.tem(), 150);
    // vòng dấu giới hạn 30 lượt / tem
    for (let i = 0; i < 40; i++) await W.e.consume.allocate('X', 1, undefined, { type: 'order', id: 'b' + i, opId: 'b' + i + '_ing_X' });
    assert.equal(W.f.rtGet('active_units_gieogieo/X/A/lastConsumeOps').length, 30);
    console.log('ok 5. Hoàn phân bổ kèm unmarkOp gỡ dấu (chạy lại trừ thật); vòng dấu ≤ 30 lượt / tem');
  }
  {
    // khoá cân của mẻ khác: lỗi nghiệp vụ, không thử lại
    const W = world(); W.f.rtGet('active_units_gieogieo/X').__prepLock = { batchId: 'm1' };
    const calls = (() => { const orig = W.f.db.ref.bind(W.f.db); let n = 0; W.f.db.ref = p => { const r = orig(p); if (/active_units_gieogieo\/X$/.test(String(p))) { const t = r.transaction.bind(r); r.transaction = (...a) => { n++; return t(...a); }; } return r; }; return () => n; })();
    await assert.rejects(W.e.consume.allocate('X', 50, undefined, { type: 'order', id: 'bill_1', opId: 'bill_1_ing_X' }));
    assert(calls() <= 1, 'chặn trước / trong transaction đầu, không thử lại (' + calls() + ')');
    console.log('ok 6. NL đang khoá cân cho mẻ khác → báo lỗi ngay, không thử lại');
  }
  console.log('ALL PASS');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
