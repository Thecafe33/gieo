// Môi trường chung cho test cân cuối ca (E4.5: các hàm shiftWeigh* nằm trong unit_engine.v1.js).
// Firebase giả + engine thật (sổ kho thật, suy tồn thật) — thay cho bản giả tay trước đây.
const { makeFake } = require('./fakefb');
const { loadEngineModule } = require('./engine');
const ITEM = id => ({ name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 0, id });
function mkSW(rtInit, extraFs) {
  const rt = { active_units_gieogieo: {} };
  const fs = {};
  for (const [itemId, node] of Object.entries(rtInit.active_units_gieogieo || {})) {
    rt.active_units_gieogieo[itemId] = node;
    fs['inventory_items_gieogieo/' + itemId] = ITEM(itemId);
    for (const [uid, u] of Object.entries(node)) if (uid !== '__prepLock') fs['stock_containers_gieogieo/' + uid] = { itemId, code: u.code, status: 'open', unitBase: u.unitBase, baseQty: 1000 };
  }
  Object.assign(fs, extraFs || {});
  const fake = makeFake({ rt, fs });
  const state = { lines: [] };
  const UE = loadEngineModule();
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, now: () => fake.clock.now(), businessDate: () => 'D',
    getItems: () => Object.keys(rt.active_units_gieogieo).map(ITEM),
    state: { _shiftInventoryCountStatePOS: () => state }, appFns: { shiftWeighCaptureBaselinePOS: async () => {} } });
  const txRows = () => Object.keys(fake.FS).filter(k => k.startsWith('stock_transactions_gieogieo/')).sort().map(k => ({ id: k.split('/')[1], ...fake.FS[k] }));
  const alerts = () => Object.keys(fake.FS).filter(k => k.startsWith('alerts_gieogieo/')).map(k => fake.FS[k]);
  return { fake, UE, F: UE.fn, state, RT: fake.RT, FS: fake.FS, rtGet: fake.rtGet, txRows, alerts };
}
const line = (itemId, units) => ({ itemId, itemName: 'Sữa', unit: 'ml', mode: 'tem', layer: 'config', reasons: [], needReload: false, units });
const U = (id, code, openedAt, weighed, baseline, state = 'confirmed') => ({ id, code, openedAt, state, confirmVia: 'scan', manualReason: '', weighed, baseline, weighings: [], countedAt: 't', gone: false, seq: 0, baselineSig: '||' });
module.exports = { mkSW, line, U };
