// API mới của engine (E2+): chú thích theo danh sách trường cho phép, sửa sổ có lưu vết,
// FIFO thuần, hằng số khớp với app. Chạy trên Firebase giả.
const fs = require('fs'); const path = require('path');
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const code = async p => { try { await p; return 'OK'; } catch (e) { return e.code || e.message; } };
(async () => {
  const fake = makeFake({ fs: {
    'stock_containers_gieogieo/A': { code: 'AAA', unitBase: 5 },
    'prep_batches_gieogieo/b1': { batchCode: 'L1' },
    'stock_transactions_gieogieo/t1': { itemId: 'X', type: 'WASTE', qty: -50 },
    'prep_transactions_gieogieo/p1': { prepId: 'P', type: 'WASTE', qty: -9 },
    'stock_anomalies_gieogieo/an1': { status: 'open' }
  } });
  const UE = loadEngineModule();
  UE.init({ fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => fake.clock.now() });
  eq(await code(UE.containers.annotate('A', { labelPrinted: true, labelPrintedAt: 'x' })), 'OK', 'containers.annotate trường cho phép');
  eq(await code(UE.containers.annotate('A', { unitBase: 0 })), 'FIELD_NOT_ANNOTATABLE', 'containers.annotate chặn unitBase');
  eq(fake.FS['stock_containers_gieogieo/A'].unitBase, 5, 'unitBase không đổi');
  eq(await code(UE.batches.annotate('b1', { expiresAt: 'y' })), 'OK', 'batches.annotate expiresAt');
  eq(await code(UE.batches.annotate('b1', { qtyRemaining: 1 })), 'FIELD_NOT_ANNOTATABLE', 'batches.annotate chặn qtyRemaining');
  eq(await code(UE.ledger.annotate('t1', { voided: true, 'responsibility.status': 'x' })), 'OK', 'ledger.annotate voided + dot-path');
  eq(await code(UE.ledger.annotate('t1', { qty: 0 })), 'FIELD_NOT_ANNOTATABLE', 'ledger.annotate chặn qty');
  eq(await code(UE.ledger.annotate('p1', { needsReview: false }, { kind: 'prep' })), 'OK', 'ledger.annotate sổ BTP');
  eq(await code(UE.ledger.annotate('t1', { note: 'n' }, { coll: 'inventory_items_gieogieo' })), 'INVALID_QTY', 'ledger.annotate từ chối collection không phải sổ');
  eq(await code(UE.anomaly.resolve('an1', { status: 'resolved', resolvedBy: 'QL' })), 'OK', 'anomaly.resolve');
  eq(await code(UE.anomaly.resolve('an1', { qty: 1 })), 'FIELD_NOT_ANNOTATABLE', 'anomaly.resolve chặn qty');
  eq(await code(UE.ledger.amend('t1', { qty: -30 }, { by: 'NV' })), 'INVALID_QTY', 'amend cần lý do');
  eq(await code(UE.ledger.amend('t1', { itemId: 'Y' }, { reason: 'r' })), 'FIELD_NOT_ANNOTATABLE', 'amend không sửa itemId');
  eq(await code(UE.ledger.amend('zz', { qty: 1 }, { reason: 'r' })), 'LEDGER_UNKNOWN', 'amend dòng không có');
  await UE.ledger.amend('t1', { qty: -30, reclassifiedToConsumptionQty: 20 }, { reason: 'dùng bù', by: 'NV' });
  const t1 = fake.FS['stock_transactions_gieogieo/t1'];
  eq([t1.qty, t1.amendments.length, t1.amendments[0].before, t1.amendments[0].after, t1.amendments[0].reason], [-30, 1, { qty: -50, reclassifiedToConsumptionQty: null }, { qty: -30, reclassifiedToConsumptionQty: 20 }, 'dùng bù'], 'amend lưu vết trước/sau');
  eq(UE.units.fifoPendingFromRt({ X: { u1: { code: 'C1', unitBase: 0, openedAt: 5 }, u2: { unitBase: 3 }, u3: { unitBase: -1, finishedDebt: true }, __prepLock: {} }, P: { b: { unitBase: -1 } } }, ['X']).map(x => x.code), ['C1'], 'fifoPendingFromRt');
  // Hằng số engine phải khớp hằng số còn giữ trong app
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'posgieo.html'), 'utf8');
  for (const [k, v] of Object.entries({ STOCK_CONTAINERS_COLL: UE.consts.STOCK_CONTAINERS_COLL, STOCK_ANOMALY_COLL: UE.consts.STOCK_ANOMALY_COLL, PREP_RECON_LOCK_COLL: UE.consts.PREP_RECON_LOCK_COLL })) {
    const m = new RegExp('const ' + k + "\\s*=\\s*'([^']+)'").exec(html);
    eq(m && m[1], v, 'hằng ' + k + ' khớp POS');
  }
  // Không init → gọi API báo lỗi rõ, không treo
  const UE2 = loadEngineModule();
  eq(UE2.isReady(), false, 'chưa init → isReady false');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
