// Xoá bill → hoàn kho (engine consume.reverseOrder) + giờ máy chủ. Tái hiện các lỗi đã sửa:
//   1. lượt hoàn khác đang giữ tem → DỪNG, không ghi dòng hoàn, bill giữ để xoá lại (idempotent);
//   2. món đã hoàn theo cách CŨ (ADJUSTMENT + reversal:true) → không hoàn lần hai;
//   3. trả tồn quầy về ĐÚNG vị trí đã trừ (locDeductedAt), không theo quy tắc hiện tại;
//   B. trace chỉ đánh dấu "đã hoàn" sau khi hoàn xong;
//   A. chưa nhận lệch giờ máy chủ → không đóng/so mốc; mốc "tương lai" > 60 giây bị bỏ qua.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', CTN = 'stock_containers_gieogieo', ST = 'stock_transactions_gieogieo', TR = 'order_stock_traces_gieogieo';
const ITEM = { name: 'Sữa', unit: 'ml', trackingMode: 'unit', countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }], currentStock: 300 };
const NOTEM = { name: 'Nước', unit: 'ml', trackingMode: 'none', currentStock: 500, locationStock: { quay_cu: 10, quay_moi: 50 }, unrefilledConsumption: { quay_cu: 30, quay_moi: 30 } };

function mk(opts) {
  opts = opts || {};
  const fake = makeFake({
    rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 300, capacity: 1000, openedAt: 1 } } } },
    fs: { [INV + '/X']: { ...ITEM }, [INV + '/N']: JSON.parse(JSON.stringify(NOTEM)), [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 300, baseQty: 1000 } }
  });
  const UE = loadEngineModule();
  let t = 1790000000000;
  const clock = { now: () => t, add: ms => { t += ms; } };
  UE.init({ app: opts.app || 'quanly', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28',
    now: () => (t += 1), getRefillRule: id => (opts.rules || {})[id] || null });
  return { fake, UE, clock, FS: fake.FS };
}
async function seedBill(fake, id) {
  const f = fake.fstore.collection(ST);
  await f.doc('sales_' + id + '_X').set({ itemId: 'X', type: 'CONSUMPTION', qty: -100, referenceId: id, fifoAllocations: [{ containerId: 'A', qty: 100 }] });
  await f.doc('sales_' + id + '_N').set({ itemId: 'N', type: 'CONSUMPTION', qty: -20, referenceId: id, locDeducted: 20, locDeductedAt: 'quay_cu' });
}
const rtA = fake => fake.db.ref('active_units_gieogieo/X/A/unitBase').once('value').then(s => s.val());

(async () => {
  // ── 1. claim đang giữ ──
  {
    const { fake, UE, clock, FS } = mk();
    await seedBill(fake, 'o1');
    await fake.fstore.collection('reversal_unit_claims_gieogieo').doc('o1_ing_X').set({ status: 'claiming', claimedAt: clock.now() });
    const r1 = await UE.consume.reverseOrder('o1', { billCode: 'B1' });
    eq([r1.ok, r1.busy], [false, 1], '1 claim tươi của lượt khác → ok:false, busy');
    eq([!!FS[ST + '/reversal_o1_ing_X'], await rtA(fake)], [false, 300], '1 KHÔNG ghi dòng hoàn, tem chưa cộng');
    eq(!!(FS[TR + '/o1'] && FS[TR + '/o1'].reversed), false, '1 trace chưa đánh dấu đã hoàn');
    eq(Object.keys(FS).filter(k => k.startsWith('alerts_gieogieo/')).length, 0, '1 không ghi cảnh báo "xoá bill lỗi" (bill còn nguyên)');
    const nSau1 = FS[INV + '/N'].currentStock;
    clock.add(3 * 60000);   // claim quá hạn 2 phút → lượt sau giành lại
    const r2 = await UE.consume.reverseOrder('o1', { billCode: 'B1' });
    eq([r2.ok, !!FS[ST + '/reversal_o1_ing_X'], await rtA(fake)], [true, true, 400], '1 xoá lại sau 2 phút → hoàn đủ vào tem');
    eq([nSau1, FS[INV + '/N'].currentStock], [520, 520], '1 món đã hoàn ở lượt đầu không hoàn lần hai');
    eq(FS[TR + '/o1'].reversed, true, '1 trace đánh dấu sau khi xong');
    const r3 = await UE.consume.reverseOrder('o1', { billCode: 'B1' });
    eq([r3.ok, await rtA(fake), FS[INV + '/N'].currentStock], [true, 400, 520], '1 bấm lại lần 3 → không cộng đúp');
  }
  {
    // claim 'claiming' cũ không rõ tuổi (không claimedAt/at) → giành lại, không kẹt bill vĩnh viễn
    const { fake, UE } = mk();
    await seedBill(fake, 'o1b');
    await fake.fstore.collection('reversal_unit_claims_gieogieo').doc('o1b_ing_X').set({ status: 'claiming' });
    const r = await UE.consume.reverseOrder('o1b', {});
    eq([r.ok, await rtA(fake)], [true, 400], '1 claim cũ không rõ tuổi → giành lại, hoàn được');
  }
  {
    // POS gọi reverseSales trực tiếp: cùng hành vi
    const { fake, UE, clock } = mk({ app: 'pos' });
    await seedBill(fake, 'o1c');
    await fake.fstore.collection('reversal_unit_claims_gieogieo').doc('o1c_ing_X').set({ status: 'claiming', claimedAt: clock.now() });
    const r = await UE.consume.reverseSales({ billCode: 'C' }, 'o1c');
    eq([r.ok, r.busy, /2 phút/.test(r.message)], [false, 1, true], '1 POS reverseSales → busy + thông báo đợi 2 phút');
  }
  // ── 2. dòng hoàn kiểu cũ ──
  {
    const { fake, UE, FS } = mk();
    await seedBill(fake, 'o2');
    await fake.fstore.collection(ST).doc('oldrev_random').set({ itemId: 'X', type: 'ADJUSTMENT', qty: 100, reversal: true, referenceId: 'o2' });
    const r = await UE.consume.reverseOrder('o2', {});
    eq([r.ok, !!FS[ST + '/reversal_o2_ing_X'], await rtA(fake)], [true, false, 300], '2 món đã hoàn kiểu cũ → không hoàn lần hai');
    eq(FS[INV + '/N'].currentStock, 520, '2 món khác của bill vẫn được hoàn');
  }
  // ── 3. vị trí đã trừ ──
  {
    const { fake, UE, FS } = mk({ rules: { N: { itemId: 'N', sourceLocationId: 'kho', destLocationId: 'quay_moi' } } });
    await seedBill(fake, 'o3');
    await UE.consume.reverseOrder('o3', {});
    const n = FS[INV + '/N'];
    eq([n.locationStock.quay_cu, n.locationStock.quay_moi], [30, 50], '3 trả về đúng vị trí đã trừ (quay_cu), không theo quy tắc mới');
    eq([n.unrefilledConsumption.quay_cu, n.unrefilledConsumption.quay_moi], [10, 30], '3 bộ đếm chờ refill trừ đúng vị trí');
  }
  {
    const { fake, UE, FS } = mk();   // chưa có quy tắc nào (chưa nạp)
    await seedBill(fake, 'o3b');
    await UE.consume.reverseOrder('o3b', {});
    eq(FS[INV + '/N'].locationStock.quay_cu, 30, '3 không có quy tắc vẫn trả đúng vị trí đã ghi trên dòng');
  }
  {
    // dòng cũ không ghi vị trí → theo quy tắc hiện tại (như trước)
    const { fake, UE, FS } = mk({ rules: { N: { itemId: 'N', destLocationId: 'quay_moi' } } });
    await fake.fstore.collection(ST).doc('sales_o3c_N').set({ itemId: 'N', type: 'CONSUMPTION', qty: -20, referenceId: 'o3c', locDeducted: 15 });
    await UE.consume.reverseOrder('o3c', {});
    eq([FS[INV + '/N'].locationStock.quay_moi, FS[INV + '/N'].unrefilledConsumption.quay_moi], [65, 10], '3 dòng cũ không vị trí → theo quy tắc hiện tại');
  }
  // ── B. trace chỉ đánh dấu khi hoàn xong ──
  {
    const { fake, UE, FS } = mk();
    await fake.fstore.collection(ST).doc('bf_oB_X').set({ itemId: 'X', type: 'CONSUMPTION', qty: -10, referenceId: 'oB', backfillNoStockEffect: true });
    await fake.fstore.collection(ST).doc('sales_oB_Z').set({ itemId: 'Z', type: 'CONSUMPTION', qty: -5, referenceId: 'oB' });   // Z không tồn tại → hoàn lỗi
    const r = await UE.consume.reverseOrder('oB', {});
    eq([r.ok, FS[ST + '/bf_oB_X'].voided, !!(FS[TR + '/oB'] && FS[TR + '/oB'].reversed)], [false, true, false], 'B hoàn lỗi → trace KHÔNG bị đánh dấu dù đã huỷ dòng bổ sung');
    await fake.fstore.collection(INV).doc('Z').set({ name: 'Z', unit: 'ml', trackingMode: 'none', currentStock: 0 });
    const r2 = await UE.consume.reverseOrder('oB', {});
    eq([r2.ok, FS[TR + '/oB'].reversed], [true, true], 'B làm lại thành công → trace đánh dấu');
  }
  // ── A. giờ máy chủ ──
  {
    const fake = makeFake({ rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 300, capacity: 1000, openedAt: 1 } } } },
      fs: { [INV + '/X']: { ...ITEM, currentStock: 777, _ueLastRecomputeStart: Date.now() + 8 * 60000 }, [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 300, baseQty: 1000 } } });
    const UE = loadEngineModule();
    UE.init({ app: 'pos', serverClock: true, fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28' });
    const t0 = Date.now();
    const v = await UE.stock.recompute('X');
    const waited = Date.now() - t0;
    eq([v, fake.FS[INV + '/X'].currentStock], [300, 300], 'A chưa có lệch giờ → vẫn ghi tồn (không bị mốc tương lai chặn)');
    eq(fake.FS[INV + '/X']._ueLastRecomputeStart > Date.now() + 7 * 60000, true, 'A chưa có lệch giờ → KHÔNG đóng mốc mới');
    eq(waited >= 2900 && waited < 4500, true, 'A chờ tối đa ~3 giây lệch giờ');
    // máy chạy nhanh 8 phút: máy chủ báo lệch −8 phút → mốc cũ (tương lai) bị bỏ qua, mốc mới theo giờ máy chủ
    await fake.db.ref('.info/serverTimeOffset').set(-8 * 60000);
    const v2 = await UE.stock.recompute('X');
    const stamp = fake.FS[INV + '/X']._ueLastRecomputeStart;
    eq([v2, Math.abs(stamp - (Date.now() - 8 * 60000)) < 5000], [300, true], 'A có lệch giờ → mốc theo giờ máy chủ, mốc tương lai bị ghi đè');
  }
  {
    // lệch giờ tới trong lúc chờ → không đợi hết 3 giây
    const fake = makeFake({ rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 300, capacity: 1000, openedAt: 1 } } } },
      fs: { [INV + '/X']: { ...ITEM }, [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 300, baseQty: 1000 } } });
    const UE = loadEngineModule();
    UE.init({ app: 'pos', serverClock: true, fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28' });
    setTimeout(() => fake.db.ref('.info/serverTimeOffset').set(1000), 200);
    const t0 = Date.now();
    await UE.stock.recompute('X');
    eq([Date.now() - t0 < 1500, typeof fake.FS[INV + '/X']._ueLastRecomputeStart], [true, 'number'], 'A lệch giờ tới sau 200ms → chạy tiếp ngay, có đóng mốc');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
