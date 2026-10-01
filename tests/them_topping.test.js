// Bổ sung topping (POS) — chạy nguyên hàm của posgieo.html + UnitEngine trên Firebase giả. Tái hiện các lỗi đã sửa:
//   4. trừ tem xong mà ghi sổ lỗi → hoàn lại tem (sổ không có dòng thì tem không được giảm);
//   5. hai máy cùng bổ sung một đơn → máy sau bị chặn, không ghi đè, không trừ kho;
//   6. lỗi nạp công thức / tính chênh lệch → cảnh báo BỀN (alerts_gieogieo) + báo nhân viên;
//   7. dòng nhiều ly → tách ĐÚNG ly đã chọn.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', CTN = 'stock_containers_gieogieo', TX = 'stock_transactions_gieogieo';
const MONTH_KEYS = ['thang01', 'thang02', 'thang03', 'thang04', 'thang05', 'thang06', 'thang07', 'thang08', 'thang09', 'thang10', 'thang11', 'thang12'];
const RTP = 'orders_gieogieo/thang09/28/o1';
const ITEMS = [{ name: 'Trà sữa', size: 'M', qty: 3, price: 30000, toppings: [] }, { name: 'Cà phê', size: '-', qty: 1, price: 20000, toppings: [] }];
const ORDER = { billCode: 'B001', date: '28/09/2026', total: 110000, itemsArray: ITEMS, items: 'x', addons: [], isToGo: true, createdAt: '2026-09-28T02:00:00.000Z' };
const seed = () => ({
  rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 300, capacity: 1000, openedAt: 1 } } }, orders_gieogieo: { thang09: { 28: { o1: JSON.parse(JSON.stringify(ORDER)) } } } },
  fs: { [INV + '/X']: { name: 'Trân châu', unit: 'g', trackingMode: 'unit', currentStock: 300, countUnitName: 'Bịch', packagingUnits: [{ name: 'Bịch', baseQty: 1000 }] },
    [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 300, baseQty: 1000 } }
});
const TP = { id: 'tc', name: 'Trân châu', price: 10000, qty: 1 };
// Tiêu hao giả: mỗi topping 50g NL X
const calc = ord => { let n = 0; (ord.itemsArray || []).forEach(it => (it.toppings || []).forEach(t => { n += 50 * (Number(it.qty) || 1) * (Number(t.qty) || 1); })); return { agg: n ? { X: n } : {}, prepAgg: {} }; };
const spec = (flow, extraScope) => ({
  app: 'pos', target: '_submitAddonImpl', exports: ['_addonApplyToItems', 'applyAddonConsumptionPOS', '_applyAddonConsumptionCorePOS', '_addonJobStartPOS', '_addonJobUpdatePOS', '_orderRtPathPOS', '_addonConsumeIngredientPOS', '_addonSameOrderState'],
  helpers: ['_addonOrder', '_addonAmount', 'tpSum', 'tpQty', 'tpLabel', '_ueWarnGogsConsumptionFailed'], seed: seed(),
  scope: (fake, rec) => {
    const o = { id: 'o1', ...JSON.parse(JSON.stringify(ORDER)) }; o.items = o.itemsArray;
    const tracked = [];
    return Object.assign({ MONTH_KEYS, orders: [o], _addonState: { orderId: 'o1', step: 'pay', itemIdx: 0, unitIdx: 1, seq: 2, totalCups: 4, toppings: [{ ...TP }], method: 'CHUYỂN KHOẢN', cashGiven: 0 },
      orderAddonInfo: () => ({ ok: true, minsLeft: 20 }), resolveStaffPinAndCheckin: async () => ({ fullName: 'NV A', id: 'e1' }), posConfirm: async () => true,
      fmt: n => String(n), toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), closeAddonSheet: rec('closeAddonSheet'), showDet: rec('showDet'),
      printAddonReceipt: rec('printAddonReceipt'), printAddonLabel: rec('printAddonLabel'), refreshFifoAlert: async () => {},
      trackConsumptionPOS: (id, p) => { tracked.push(p); rec('trackConsumptionPOS')(id); }, __tracked: tracked,
      ensureRecipesLoadedPOS: async () => ({}), ensureToppingRecipesLoadedPOS: async () => ({}), ensurePackagingPresetsLoadedPOS: async () => ({}),
      ensurePackagingItemOverridesLoadedPOS: async () => ({}), ensurePackagingBaggingRulesLoadedPOS: async () => ({}), ensurePackagingRulesLoadedPOS: async () => ({ rules: [], config: {} }),
      ensurePackagingBaggingTableLoadedPOS: async () => ({}), computeConsumptionForOrder: calc,
      _loadLocDeductedForOrderPOS: async () => ({ fifoMap: {} }), _loadPrepUnitAllocationsForOrderPOS: async () => ({}), posDateKey: () => '2026-09-28',
      getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null, STOCK_CONTAINERS_COLL: CTN }, extraScope || {});
  },
  call: flow
});
const toasts = r => r.calls.filter(c => c[0] === 'toast').map(c => c[1]);

(async () => {
  // ── 7. tách đúng ly ──
  {
    const r = await runWrapped('engine', spec(async F => [0, 1, 2].map(k => {
      const { items, targetIdx } = F._addonApplyToItems({ itemsArray: ITEMS }, 0, [TP], 'T', k);
      return [items.map(x => x.qty + (x.toppings.length ? '*' : '')), targetIdx];
    })));
    eq(r.result, [[['1*', '2', '1'], 0], [['1', '1*', '1', '1'], 1], [['2', '1*', '1'], 1]], '7 chọn ly 1/2/3 của dòng 3 ly → tách đúng ly đó');
  }
  // ── 5. bình thường + hai máy ──
  {
    let tracked;
    const r = await runWrapped('engine', spec(async (F, fake, base) => { tracked = base.__tracked; await F._submitAddonImpl(); await Promise.all(tracked); }));
    const o = r.rt.orders_gieogieo.thang09[28].o1;
    eq([o.total, o.addons.length, o.itemsArray.map(x => x.qty + (x.toppings ? '*' : ''))], [120000, 1, ['1', '1*', '1', '1']], '5 bình thường: ghi đơn, tách đúng ly 2');
    eq([!!Object.keys(r.fs).find(k => k.startsWith(TX + '/addon_o1_edit_')), r.rt.active_units_gieogieo.X.A.unitBase], [true, 250], '4/5 trừ kho sau khi ghi đơn (txId addon_…)');
  }
  {
    let tracked;
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      tracked = base.__tracked;
      // máy khác vừa bổ sung xong (RT đổi, RAM máy này chưa biết)
      await fake.db.ref(RTP).update({ total: 115000, addons: [{ amount: 5000, at: 'x' }] });
      await F._submitAddonImpl(); await Promise.all(tracked);
      return base.orders[0].total;
    }));
    const o = r.rt.orders_gieogieo.thang09[28].o1;
    eq([o.total, o.addons.length], [115000, 1], '5 máy khác vừa sửa → KHÔNG ghi đè');
    eq([tracked.length, r.rt.active_units_gieogieo.X.A.unitBase], [0, 300], '5 không trừ kho');
    eq([toasts(r).some(t => /máy khác/.test(t)), r.result], [true, 115000], '5 báo "mở lại đơn" + RAM cập nhật theo máy chủ');
  }
  // ── 4. ghi sổ lỗi → hoàn tem ──
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      base.UnitEngine.ledger.apply = async () => { throw new Error('mất mạng'); };
      try { await F._addonConsumeIngredientPOS('X', 50, 'Bổ sung', 'o1', 'addon_o1_edit_k_ing_X'); return 'không lỗi'; } catch (e) { return e.message; }
    }));
    eq([r.result, r.rt.active_units_gieogieo.X.A.unitBase, !!r.fs[TX + '/addon_o1_edit_k_ing_X']], ['mất mạng', 300, false], '4 ghi sổ lỗi 3 lần → tem được hoàn lại, báo lỗi lên');
  }
  {
    let n = 0;
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      const real = base.UnitEngine.ledger.apply;
      base.UnitEngine.ledger.apply = async a => { if (++n === 1) throw new Error('chập chờn'); return real(a); };
      await F._addonConsumeIngredientPOS('X', 50, 'Bổ sung', 'o1', 'addon_o1_edit_k_ing_X');
    }));
    eq([n, r.rt.active_units_gieogieo.X.A.unitBase, !!r.fs[TX + '/addon_o1_edit_k_ing_X']], [2, 250, true], '4 lỗi 1 lần → thử lại ghi được, không hoàn');
  }
  // ── 6. lỗi nạp công thức ──
  {
    const r = await runWrapped('engine', spec(async F => {
      await F.applyAddonConsumptionPOS({ ...ORDER, itemsArray: ITEMS }, { ...ORDER }, 'o1', 'Bổ sung');
    }, { ensureRecipesLoadedPOS: async () => { throw new Error('không tải được công thức'); } }));
    const al = r.fs['alerts_gieogieo/gogs_consumption_failed_o1'];
    eq([!!al, al && /không tải được công thức/.test(al.failedItems), r.calls.some(c => c[0] === 'toastAutoReport')], [true, true, true], '6 lỗi tính tiêu hao → cảnh báo bền + báo nhân viên');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
