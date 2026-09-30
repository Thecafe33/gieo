// Bắt đầu mẻ chế biến (POS): ghi lô "cooking" báo lỗi nhưng lô THỰC RA đã được ghi (mất phản hồi mạng)
// → KHÔNG hoàn nguyên liệu (nếu hoàn thì vừa có lô đang nấu vừa có nguyên liệu quay lại kho).
// Lô chưa được ghi thật → vẫn hoàn như cũ. Không đọc lại được lô → không hoàn, báo Quản lý.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', TX = 'stock_transactions_gieogieo', PB = 'prep_batches_gieogieo';
const STAFF = { fullName: 'NV A', id: 'e1' };
const seed = () => ({ rt: {}, fs: { [INV + '/N']: { name: 'Nước', unit: 'ml', trackingMode: 'none', currentStock: 1000 } } });
const spec = flow => ({
  app: 'pos', target: '_startPrepBatchImpl', helpers: ['_reversePrepBatchInputsPOS', '_loadBatchConsumptionTxPOS'], seed: seed(),
  scope: (fake, rec) => ({
    PREP_ITEMS_CACHE_POS: [{ id: 'P', name: 'Trà nền', code: 'TN', unit: 'ml', batchInputs: [{ itemId: 'N', qty: 300 }] }],
    prepBatchState: { prepId: 'P', ratio: 1 }, KHO_ITEMS_CACHE: [{ id: 'N', name: 'Nước', unit: 'ml', trackingMode: 'none' }],
    STOCK_CONTAINERS_COLL: 'stock_containers_gieogieo', prepReconGate: null,
    prepReconRows: () => [], prepCountQuantityError: () => null, prepReconCheckNewRisk: async () => {}, prepReconBaseline: async () => ({}),
    posDateKey: () => '2026-09-30', round2: x => Math.round(x * 100) / 100,
    toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), posAutoReportManager: async (...a) => { rec('posAutoReportManager')(a[0]); },
    refreshFifoAlert: async () => {}, loadPrepBatchesPOS: async () => rec('loadPrepBatchesPOS')(), renderPrepBatchForm: rec('renderPrepBatchForm'), prepSugRefresh: rec('prepSugRefresh')
  }), call: flow
});
const has = (r, n) => r.calls.some(c => c[0] === n);
const toasts = r => r.calls.filter(c => c[0] === 'toast').map(c => c[1]).join(' | ');
(async () => {
  // A. mất phản hồi: lô đã ghi → không hoàn
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      base.UnitEngine.prep.createBatch = async (id, data) => { await fake.fstore.collection(PB).doc(id).set(data); throw new Error('mất phản hồi'); };
      await F._startPrepBatchImpl(STAFF, false, [], {});
    }));
    const batches = Object.keys(r.fs).filter(k => k.startsWith(PB + '/'));
    const rev = Object.keys(r.fs).filter(k => k.startsWith(TX + '/') && r.fs[k].reversal === true);
    eq([r.error, batches.length, rev.length, r.fs[INV + '/N'].currentStock], [null, 1, 0, 700], 'A lô đã ghi thật → không hoàn nguyên liệu (kho vẫn −300)');
    eq([has(r, 'renderPrepBatchForm'), /lô đã được tạo/.test(toasts(r))], [true, true], 'A báo lô đã tạo + vẽ lại thẻ đang nấu');
  }
  // B. lô thật sự chưa ghi → hoàn như cũ
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      base.UnitEngine.prep.createBatch = async () => { throw new Error('lỗi thật'); };
      await F._startPrepBatchImpl(STAFF, false, [], {});
    }));
    const batches = Object.keys(r.fs).filter(k => k.startsWith(PB + '/'));
    eq([batches.length, r.fs[INV + '/N'].currentStock], [0, 1000], 'B lô chưa ghi → hoàn nguyên liệu về 1000');
  }
  // C. không đọc lại được lô → không hoàn, báo Quản lý
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      base.UnitEngine.prep.createBatch = async () => { throw new Error('mạng'); };
      const realColl = fake.fstore.collection.bind(fake.fstore);
      fake.fstore.collection = name => { const c = realColl(name); if (name !== PB) return c;
        return new Proxy(c, { get: (t, k) => k === 'doc' ? (...a) => { const d = t.doc(...a); return new Proxy(d, { get: (x, kk) => kk === 'get' ? async () => { throw new Error('offline'); } : x[kk] }); } : t[k] }); };
      await F._startPrepBatchImpl(STAFF, false, [], {});
    }));
    eq([r.fs[INV + '/N'].currentStock, has(r, 'posAutoReportManager')], [700, true], 'C không đọc lại được → giữ nguyên, báo Quản lý');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
