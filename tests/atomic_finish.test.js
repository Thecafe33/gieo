// Tem cái rời báo hết: gỡ node RT bằng transaction để biết số dư lúc gỡ; âm → Sổ lệch atomic_debt_dropped.
// (E4.3: hàm nằm trong unit_engine.v1.js — chạy trên Firebase giả.)
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
async function run(rtVal) {
  const fake = makeFake({
    rt: rtVal === undefined ? {} : { active_units_gieogieo: { X: { c1: rtVal } } },
    fs: { 'stock_containers_gieogieo/c1': { itemId: 'X', code: 'K1', status: 'open' }, 'inventory_items_gieogieo/X': { name: 'Kit', unit: 'cái', trackingMode: 'unit' } }
  });
  const UE = loadEngineModule();
  UE.init({ fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => fake.clock.now(), businessDate: () => 'D' });
  await UE.fn.writeAtomicContainerFinish(fake.fstore.collection('stock_containers_gieogieo').doc('c1'), { itemId: 'X', code: 'K1', status: 'open' }, { fullName: 'NV', id: 'e' }, 'scanned', true);
  const logs = Object.entries(fake.FS).filter(([k]) => k.startsWith('stock_anomalies_gieogieo/')).map(([k, v]) => [k.split('/')[1], v.kind, v.qty]);
  return { logs, left: fake.rtGet('active_units_gieogieo/X/c1') };
}
(async () => {
  const a = await run({ unitBase: -2, code: 'K1' }); console.log('debt:', JSON.stringify(a));
  const b = await run({ unitBase: 0, code: 'K1' }); console.log('zero:', JSON.stringify(b));
  const c = await run(undefined); console.log('none:', JSON.stringify(c));
  const ok = JSON.stringify(a.logs) === JSON.stringify([['atomic_debt_c1', 'atomic_debt_dropped', -2]]) && !b.logs.length && !c.logs.length && a.left === undefined;
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
