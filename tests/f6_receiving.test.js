// F6 — Quản lý "Nhập kho nhanh" (ledger.applyManual, RECEIVING) cộng vào tồn kho NGUỒN theo quy tắc
// refill như POS; các loại khác và món có tem giữ nguyên hành vi cũ.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo';
const RULE = { itemId: 'D', sourceLocationId: 'kho', destLocationId: 'quay', active: true };
function mk(rules) {
  const fake = makeFake({ rt: {}, fs: {
    [INV + '/D']: { name: 'Đường', unit: 'g', trackingMode: 'none', currentStock: 1000, locationStock: { kho: 100, quay: 50 } },
    [INV + '/N']: { name: 'Nước', unit: 'ml', trackingMode: 'none', currentStock: 10 },
    [INV + '/T']: { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 0, locationStock: { kho: 0 } }
  } });
  let t = 1790000000000; const UE = loadEngineModule();
  UE.init({ app: 'quanly', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => (t += 1000), businessDate: () => '2026-09-28',
    getRefillRule: id => (rules || []).find(r => r.itemId === id) || null });
  return { fake, UE, doc: id => fake.FS[INV + '/' + id] };
}
(async () => {
  {
    const { UE, doc } = mk([RULE]);
    await UE.ledger.applyManual({ itemId: 'D', type: 'RECEIVING', qty: 500, note: 'nhập', source: 'management', txId: 'r1' });
    eq([doc('D').currentStock, doc('D').locationStock], [1500, { kho: 600, quay: 50 }], 'RECEIVING có quy tắc: cộng tồn + cộng kho nguồn');
    await UE.ledger.applyManual({ itemId: 'D', type: 'RECEIVING', qty: 500, note: 'nhập', source: 'management', txId: 'r1' });
    eq([doc('D').currentStock, doc('D').locationStock.kho], [1500, 600], 'gọi lại cùng txId: không cộng lần hai');
  }
  {
    const { UE, doc } = mk([RULE]);
    await UE.ledger.applyManual({ itemId: 'D', type: 'ADJUSTMENT', qty: -200, note: 'chỉnh', source: 'management' });
    eq([doc('D').currentStock, doc('D').locationStock], [800, { kho: 100, quay: 50 }], 'ADJUSTMENT: không đụng tồn vị trí (như cũ)');
  }
  {
    const { UE, doc } = mk([]);
    await UE.ledger.applyManual({ itemId: 'N', type: 'RECEIVING', qty: 5, note: 'nhập', source: 'management' });
    eq([doc('N').currentStock, doc('N').locationStock], [15, undefined], 'RECEIVING không có quy tắc: chỉ cộng tồn (như cũ)');
  }
  {
    const { UE, doc } = mk([{ ...RULE, itemId: 'T' }]);
    await UE.ledger.applyManual({ itemId: 'T', type: 'RECEIVING', qty: 1000, note: 'nhập', source: 'management' });
    eq([doc('T').currentStock, doc('T').locationStock], [0, { kho: 0 }], 'món có tem: không đổi tồn / vị trí (như cũ)');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
