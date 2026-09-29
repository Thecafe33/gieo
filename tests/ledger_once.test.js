// E4.0 — F3: không còn .add() trên sổ; gọi lại cùng lượt không ghi đôi dòng sổ.
const fs = require('fs'); const path = require('path');
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const rows = (fake, coll) => Object.keys(fake.FS).filter(k => k.startsWith(coll + '/'));
(async () => {
  const fake = makeFake({
    rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: -5, capacity: 1000, openedAt: 1 } }, P: { b1: { code: 'L1', unitBase: 300, capacity: 500, openedAt: 2 } } } },
    fs: {
      'inventory_items_gieogieo/X': { name: 'Sữa', trackingMode: 'unit', currentStock: 0 },
      'prep_items_gieogieo/P': { name: 'Cốt', currentStock: 300, costPerUnit: 2 },
      'stock_containers_gieogieo/A': { itemId: 'X', code: 'AAA', status: 'open', unitBase: -5, baseQty: 1000 },
      'prep_batches_gieogieo/b1': { prepId: 'P', batchCode: 'L1', status: 'active', qtyInitial: 500, qtyRemaining: 300, inputCost: 1000 }
    }
  });
  const UE = loadEngineModule();
  UE.init({ fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => fake.clock.now(), businessDate: () => 'D', getPreps: () => [{ id: 'P', costPerUnit: 2 }] });
  const staff = { fullName: 'NV', id: 'e1' };
  await UE.fn._applyFifoNotEmpty('A', 120, 'còn', staff, [], 'fne_A_1');
  await UE.fn._applyFifoNotEmpty('A', 120, 'còn', staff, [], 'fne_A_1');   // bấm lại cùng lượt
  const fne = rows(fake, 'stock_transactions_gieogieo');
  eq(fne, ['stock_transactions_gieogieo/fifo_not_empty_fne_A_1'], 'chưa hết: một dòng sổ, id cố định');
  eq([fake.FS[fne[0]].qty, fake.rtGet('active_units_gieogieo/X/A/unitBase')], [125, 120], 'chưa hết: delta + RT đúng');
  const r = await UE.prep.editYield('b1', 450, 'cân lại', { opId: 'yld_b1_1' });
  eq([r.finalRemaining, r.status, fake.FS['prep_transactions_gieogieo/prep_yield_edit_yld_b1_1'].qty], [250, 'active', -50], 'sửa định lượng: số dư + dòng sổ id cố định');
  eq(rows(fake, 'prep_transactions_gieogieo').length, 1, 'sửa định lượng: một dòng');
  const lines = { agg: { X: -30 }, prepAgg: { P: -20 } };
  await UE.consume.backfillNoStock(lines, 'o7', { businessDate: 'D0', billCode: 'B7' });
  const r2 = await UE.consume.backfillNoStock(lines, 'o7', { businessDate: 'D0', billCode: 'B7' });
  eq([fake.FS['stock_transactions_gieogieo/backfill_o7_ing_X'].qty, fake.FS['prep_transactions_gieogieo/backfill_o7_prep_P'].backfillNoStockEffect, r2.failed], [-30, true, 0], 'bill bổ sung: dòng id cố định');
  eq([rows(fake, 'stock_transactions_gieogieo').length, rows(fake, 'prep_transactions_gieogieo').length], [2, 2], 'bill bổ sung: gọi lại không ghi đôi');
  // Không còn .add() nào trên collection sổ trong engine / hai app
  const bad = [];
  for (const f of ['unit_engine.v1.js', 'posgieo.html', 'quanlygieo.html']) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
    const re = /collection\(\s*'(stock_transactions_gieogieo|prep_transactions_gieogieo)'\s*\)\s*\.add\(/g; let m;
    while ((m = re.exec(src))) bad.push(f + ':' + src.slice(0, m.index).split('\n').length);
  }
  eq(bad, [], 'không còn .add() trên sổ');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
