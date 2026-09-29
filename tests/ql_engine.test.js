// E3 — Quản lý dùng engine: xoá bill (chung luồng POS, không hoàn đúp giữa hai app), suy tồn
// không đụng mốc, sổ thủ công giữ hành vi cũ, BTP âm → dùng bù không cộng hai lần.
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const ITEM = { id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit' };
function seed() {
  return makeFake({
    rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 100, capacity: 1000, openedAt: 1000 }, B: { code: 'BBB', unitBase: 300, capacity: 1000, openedAt: 2000 } } } },
    fs: {
      'inventory_items_gieogieo/X': { ...ITEM, currentStock: 400, locationStock: { quay: 10 }, _ueLastRecomputeStart: 9e12 },
      'stock_containers_gieogieo/A': { itemId: 'X', status: 'open', unitBase: 100 },
      'stock_containers_gieogieo/B': { itemId: 'X', status: 'open', unitBase: 300 },
      'stock_transactions_gieogieo/sales_o1_X': { itemId: 'X', type: 'CONSUMPTION', qty: -150, referenceId: 'o1', fifoAllocations: [{ containerId: 'A', qty: 100 }, { containerId: 'GONE', qty: 50 }], locDeducted: 150 }
    }
  });
}
function engine(fake, app) {
  const UE = loadEngineModule();
  UE.init({ app, fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => fake.clock.now(),
    businessDate: () => '2026-09-28', getItems: () => [ITEM], getRefillRule: id => (id === 'X' ? { itemId: 'X', destLocationId: 'quay' } : null) });
  return UE;
}
function loadQL(fake, UE, extra) {
  const src = 'let _qlRefillActive = null;\n' + extract('quanlygieo.html', ['qlReverseStockForOrder', '_qlEnsureRefillRulesForEngine', 'recomputeTemStock', 'applyStockTransaction', '_btpAmApplySubstitution']);
  const ctx = Object.assign({ UnitEngine: UE, fstore: fake.fstore, memoDropItems() {}, memoDropPreps() {}, logAudit() {}, toast() {}, fmt: String, STOCK_ANOMALY_COLL: 'stock_anomalies_gieogieo', console: { warn() {}, log() {} } }, extra || {});
  const n = Object.keys(ctx);
  return new Function(...n, src + '\nreturn {qlReverseStockForOrder, recomputeTemStock, applyStockTransaction, _btpAmApplySubstitution};')(...n.map(k => ctx[k]));
}
(async () => {
  // Q1: POS xoá bill rồi Quản lý xoá lại cùng bill → không hoàn lần hai
  let fake = seed();
  const pos = engine(fake, 'pos');
  await pos.consume.reverseSales({ billCode: 'B1' }, 'o1');
  const afterPos = [fake.rtGet('active_units_gieogieo/X/A/unitBase'), fake.rtGet('active_units_gieogieo/X/B/unitBase')];
  let QL = loadQL(fake, engine(fake, 'quanly'));
  const kq = await QL.qlReverseStockForOrder('o1', 'B1');
  eq([fake.rtGet('active_units_gieogieo/X/A/unitBase'), fake.rtGet('active_units_gieogieo/X/B/unitBase')], afterPos, 'Q1 Quản lý xoá lại: RT không đổi');
  eq(afterPos, [250, 300], 'Q1 POS: A +100, GONE 50 → tem cũ nhất A');
  eq(kq.loi, 0, 'Q1 không lỗi');
  eq(fake.FS['stock_transactions_gieogieo/reversal_o1_ing_X'].source, 'pos', 'Q1 dòng hoàn giữ của POS');
  // Q2: Quản lý xoá trước — R1 (tem gốc rời RT → cũ nhất), source/staff Quản lý, hoàn tồn quầy
  fake = seed();
  QL = loadQL(fake, engine(fake, 'quanly'));
  await fake.fstore.collection('refill_rules_gieogieo').doc('r1').set({ itemId: 'X', active: true, destLocationId: 'quay' });
  const kq2 = await QL.qlReverseStockForOrder('o1', 'B1');
  const row = fake.FS['stock_transactions_gieogieo/reversal_o1_ing_X'];
  eq([row.source, row.staff, row.qty, row.reversalCoverage, kq2.nguyenLieu, kq2.loi], ['management', 'Quản lý', 150, 'full', 1, 0], 'Q2 dòng hoàn của Quản lý');
  eq(fake.rtGet('active_units_gieogieo/X/A/unitBase'), 250, 'Q2 R1: GONE → tem cũ nhất');
  eq(fake.FS['inventory_items_gieogieo/X'].locationStock.quay, 160, 'Q2 hoàn tồn quầy theo rule');
  eq(fake.FS['reversal_unit_claims_gieogieo/o1_ing_X'].status, 'done', 'Q2 claim chung với POS');
  // Q3: suy tồn từ Quản lý — luôn ghi, không đụng mốc, trả về tồn
  eq([fake.FS['inventory_items_gieogieo/X'].currentStock, fake.FS['inventory_items_gieogieo/X']._ueLastRecomputeStart], [550, 9e12], 'Q3 ghi tồn dù mốc tương lai, không đổi mốc');
  eq(await QL.recomputeTemStock('X'), 550, 'Q3 trả về tồn');
  // Q4: sổ thủ công RECEIVING món có tem → không đổi tồn, ghi Sổ lệch, source management
  await QL.applyStockTransaction({ itemId: 'X', type: 'RECEIVING', qty: 1000, note: 'nhập tay', txId: 'man1' });
  const m1 = fake.FS['stock_transactions_gieogieo/man1'];
  eq([m1.outsideTem, m1.source, fake.FS['stock_anomalies_gieogieo/tx_man1'].source, fake.FS['stock_anomalies_gieogieo/tx_man1'].kind, fake.FS['inventory_items_gieogieo/X'].currentStock], [true, 'management', 'management', 'manual_adjust', 550], 'Q4 sổ thủ công giữ hành vi Quản lý');
  // Q5: BTP âm → dùng bù: bấm lại không cộng substitutionQty lần hai
  await fake.fstore.collection('prep_transactions_gieogieo').doc('pc1').set({ prepId: 'S', businessDate: 'D', type: 'ADJUSTMENT', fromPrepCount: true, qty: -100 });
  await fake.fstore.collection('prep_shortage_recons_gieogieo').doc('rc1').set({ status: 'substitution_pending' });
  const r = { id: 'rc1', prepId: 'P', businessDate: 'D', remainder: 50, costPerUnit: 1 };
  const subs = [{ kind: 'prep', id: 'S', expectedQty: 40, costPerUnit: 1 }];
  await QL._btpAmApplySubstitution(r, subs); await QL._btpAmApplySubstitution(r, subs);
  eq(fake.FS['prep_transactions_gieogieo/pc1'].substitutionQty, 40, 'Q5 dùng bù không cộng hai lần');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
