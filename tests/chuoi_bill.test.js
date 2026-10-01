// CHUỖI thao tác bill (v14): bán → thêm topping (trừ kho đến muộn / ở máy khác) → xoá bill. Chạy hàm thật của POS + UnitEngine trên Firebase giả,
// rồi kiểm CÙNG LÚC RT, lô, tồn tổng, thiếu chờ đối chiếu, sổ và trạng thái bill.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 600), '!=', JSON.stringify(b).slice(0, 600)); } else console.log('ok', m); };
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo';
const MONTH_KEYS = ['thang01', 'thang02', 'thang03', 'thang04', 'thang05', 'thang06', 'thang07', 'thang08', 'thang09', 'thang10', 'thang11', 'thang12'];
const RTP = 'orders_gieogieo/thang09/28/o1';
const ITEMS = [{ name: 'Trà sữa', size: 'M', qty: 1, price: 30000, toppings: [] }];
const ORDER = { billCode: 'B001', date: '28/09/2026', total: 30000, itemsArray: ITEMS, items: 'x', addons: [], isToGo: true, createdAt: new Date().toISOString() };
const seed = () => ({
  rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 100, capacity: 800, openedAt: 1 } } }, orders_gieogieo: { thang09: { 28: { o1: JSON.parse(JSON.stringify(ORDER)) } } } },
  fs: { [PI + '/P']: { name: 'Cốt trà', unit: 'g', currentStock: 100, costPerUnit: 1 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 100, unitBase: 100, batchCode: 'L1', qtyInitial: 800 } }
});
const TP = { id: 'tc', name: 'Trân châu', price: 10000, qty: 1 };
// Tiêu hao giả: món gốc 50 g BTP P, mỗi topping thêm 20 g
const calc = ord => { let n = 0; (ord.itemsArray || []).forEach(it => (it.toppings || []).forEach(t => { n += 20 * (Number(it.qty) || 1) * (Number(t.qty) || 1); })); return { agg: {}, prepAgg: { P: 50 + n }, skipped: [] }; };
const EXPORTS = ['_addonApplyToItems', 'applyAddonConsumptionPOS', '_applyAddonConsumptionCorePOS', '_addonJobStartPOS', '_addonJobDonePOS', '_orderRtPathPOS', '_addonConsumeIngredientPOS', '_addonSameOrderState',
  'delOrderConfirm', 'applySalesConsumptionPOS', '_applySalesConsumptionCorePOS', 'removeBillSideRecordsPOS'];
const spec = (flow, extra) => ({
  app: 'pos', target: '_submitAddonImpl', exports: EXPORTS, helpers: ['_addonOrder', '_addonAmount', 'tpSum', 'tpQty', 'tpLabel', '_ueWarnGogsConsumptionFailed'], seed: seed(),
  scope: (fake, rec) => {
    const o = { id: 'o1', ...JSON.parse(JSON.stringify(ORDER)) }; o.items = o.itemsArray;
    const tracked = [];
    return Object.assign({ MONTH_KEYS, orders: [o], curOid: 'o1', _deletingOrderIds: new Set(), _consumptionInflightPOS: new Map(), _salesConsumeChains: new Map(),
      _addonState: { orderId: 'o1', step: 'pay', itemIdx: 0, unitIdx: 0, seq: 1, totalCups: 1, toppings: [{ ...TP }], method: 'CHUYỂN KHOẢN', cashGiven: 0 },
      orderAddonInfo: () => ({ ok: true, minsLeft: 20 }), resolveStaffPinAndCheckin: async () => ({ fullName: 'NV A', id: 'e1' }), posConfirm: async () => true,
      fmt: n => String(n), toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), closeAddonSheet: rec('closeAddonSheet'), showDet: rec('showDet'), showScreen: rec('showScreen'),
      printAddonReceipt: rec('printAddonReceipt'), printAddonLabel: rec('printAddonLabel'), refreshFifoAlert: async () => {},
      trackConsumptionPOS: (id, p) => { tracked.push(p); }, __tracked: tracked,
      ensureRecipesLoadedPOS: async () => ({}), ensureToppingRecipesLoadedPOS: async () => ({}), ensurePackagingPresetsLoadedPOS: async () => ({}),
      ensurePackagingItemOverridesLoadedPOS: async () => ({}), ensurePackagingBaggingRulesLoadedPOS: async () => ({}), ensurePackagingRulesLoadedPOS: async () => ({ rules: [], config: {} }),
      ensurePackagingBaggingTableLoadedPOS: async () => ({}), computeConsumptionForOrder: calc, reportMissingRecipePOS: () => {}, prepSugOnUsage: () => {},
      _loadLocDeductedForOrderPOS: async () => ({ fifoMap: {} }), _loadPrepUnitAllocationsForOrderPOS: async () => ({}), posDateKey: () => '2026-09-28',
      getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null, STOCK_CONTAINERS_COLL: 'stock_containers_gieogieo', removeBillSideRecordsPOS: async () => {} }, extra || {});
  },
  call: flow
});
const state = r => ({ rt: r.rt.active_units_gieogieo.P.b1.unitBase, lot: r.fs[PB + '/b1'].qtyRemaining, stock: r.fs[PI + '/P'].currentStock, short: r.fs[PI + '/P'].pendingShortage || 0,
  bill: !!(((r.rt.orders_gieogieo || {}).thang09 || {})[28] || {}).o1 });
const gated = (fake, re) => { let release; const gate = new Promise(x => { release = x; }); const orig = fake.db.ref.bind(fake.db);
  fake.db.ref = p => { const r = orig(p); return { ...r, transaction: async (fn, ...a) => { if (re.test(fn.toString())) await gate; return r.transaction(fn, ...a); } }; }; return release; };
const pinOk = base => { base.document.getElementById('del-pin-input').value = '3367'; };

(async () => {
  // ── 55: máy A thêm topping (trừ kho CHƯA bắt đầu), máy B xoá bill → trừ kho không được đến sau khi bill đã hoàn kho và xoá ──
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'o1', '2026-09-28');                   // bán: BTP 100 → 50
      const release = gated(fake, /status: 'running'/);                                      // việc trừ kho bổ sung chờ (chưa giành được "thuê")
      await F._submitAddonImpl();                                                            // A: ghi topping (+20 g sẽ trừ sau)
      pinOk(base); await F.delOrderConfirm();                                                // B: xoá bill (hoàn 50 → 100, xoá bill)
      release(); await Promise.all(base.__tracked);                                          // A: việc trừ kho chạy tiếp
    }));
    eq(state(r), { rt: 100, lot: 100, stock: 100, short: 0, bill: false }, '55 trừ topping đến muộn sau khi bill bị xoá → bị bỏ qua: RT, lô, tồn đều 100, thiếu 0, bill đã xoá');
  }
  // ── 55b: việc trừ kho đang CHẠY khi B bấm xoá → B chờ (bill giữ nguyên), xong rồi xoá lần sau → hoàn cả phần topping ──
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'o1', '2026-09-28');
      await F._submitAddonImpl(); await Promise.all(base.__tracked);                         // topping trừ xong: BTP 70 → job 'done'
      // đối chứng "đang chạy": đặt job running còn mới rồi thử xoá
      await fake.db.ref(RTP + '/consumeJobs/zzz').set({ status: 'running', startedAt: Date.now() });
      pinOk(base); await F.delOrderConfirm();
      const stillThere = !!(await fake.db.ref(RTP).once('value')).val();
      await fake.db.ref(RTP + '/consumeJobs/zzz').remove();
      pinOk(base); await F.delOrderConfirm();
      return stillThere;
    }));
    eq([r.result, state(r).bill, state(r).rt, state(r).stock], [true, false, 100, 100], '55b việc đang chạy → chưa xoá (bill còn); hết chạy → xoá và hoàn đủ (100)');
  }
  // ── Chuỗi bình thường: bán → thêm topping → xoá → mọi số đều về 100 ──
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'o1', '2026-09-28');
      await F._submitAddonImpl(); await Promise.all(base.__tracked);
      const mid = (await fake.db.ref('active_units_gieogieo/P/b1/unitBase').once('value')).val();
      pinOk(base); await F.delOrderConfirm();
      return mid;
    }));
    eq([r.result, state(r)], [30, { rt: 100, lot: 100, stock: 100, short: 0, bill: false }], 'chuỗi bán → topping (70→ còn 30 sau 50+20) → xoá: RT, lô, tồn về 100, bill xoá');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
