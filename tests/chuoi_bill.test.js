// CHUỖI thao tác bill (v14): bán → thêm topping (trừ kho đến muộn / ở máy khác) → xoá bill. Chạy hàm thật của POS + UnitEngine trên Firebase giả,
// rồi kiểm CÙNG LÚC RT, lô, tồn tổng, thiếu chờ đối chiếu, sổ và trạng thái bill.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 600), '!=', JSON.stringify(b).slice(0, 600)); } else console.log('ok', m); };
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo';
const MONTH_KEYS = ['thang01', 'thang02', 'thang03', 'thang04', 'thang05', 'thang06', 'thang07', 'thang08', 'thang09', 'thang10', 'thang11', 'thang12'];
const RTP = 'orders_gieogieo/thang09/28/bill_o1';
const ITEMS = [{ name: 'Trà sữa', size: 'M', qty: 1, price: 30000, toppings: [] }];
const ORDER = { billCode: 'B001', date: '28/09/2026', total: 30000, itemsArray: ITEMS, items: 'x', addons: [], isToGo: true, createdAt: new Date().toISOString() };
const seed = () => ({
  rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 100, capacity: 800, openedAt: 1 } }, X: { A: { code: 'AAA', unitBase: 200, capacity: 1000, openedAt: 1 } } }, orders_gieogieo: { thang09: { 28: { bill_o1: JSON.parse(JSON.stringify(ORDER)) } } } },
  fs: { 'inventory_items_gieogieo/X': { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 200, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] }, 'stock_containers_gieogieo/A': { itemId: 'X', code: 'AAA', status: 'open', unitBase: 200, baseQty: 1000 }, [PI + '/P']: { name: 'Cốt trà', unit: 'g', currentStock: 100, costPerUnit: 1 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 100, unitBase: 100, batchCode: 'L1', qtyInitial: 800 } }
});
const TP = { id: 'tc', name: 'Trân châu', price: 10000, qty: 1 };
// Tiêu hao giả: món gốc 50 g BTP P, mỗi topping thêm 20 g
const calc = ord => { let n = 0; (ord.itemsArray || []).forEach(it => (it.toppings || []).forEach(t => { n += 20 * (Number(it.qty) || 1) * (Number(t.qty) || 1); })); return { agg: {}, prepAgg: { P: 50 + n }, skipped: [] }; };
const EXPORTS = ['_addonApplyToItems', 'applyAddonConsumptionPOS', '_applyAddonConsumptionCorePOS', '_addonJobStartPOS', '_addonJobUpdatePOS', '_orderRtPathPOS', '_addonConsumeIngredientPOS', '_addonSameOrderState',
  'delOrderConfirm', 'applySalesConsumptionPOS', '_applySalesConsumptionCorePOS', 'removeBillSideRecordsPOS'];
const spec = (flow, extra) => ({
  app: 'pos', target: '_submitAddonImpl', exports: EXPORTS, helpers: ['_addonOrder', '_addonAmount', 'tpSum', 'tpQty', 'tpLabel', '_ueWarnGogsConsumptionFailed'], seed: seed(),
  scope: (fake, rec) => {
    const o = { id: 'bill_o1', ...JSON.parse(JSON.stringify(ORDER)) }; o.items = o.itemsArray;
    const tracked = [];
    return Object.assign({ MONTH_KEYS, orders: [o], curOid: 'bill_o1', _deletingOrderIds: new Set(), _consumptionInflightPOS: new Map(), _salesConsumeChains: new Map(),
      _addonState: { orderId: 'bill_o1', step: 'pay', itemIdx: 0, unitIdx: 0, seq: 1, totalCups: 1, toppings: [{ ...TP }], method: 'CHUYỂN KHOẢN', cashGiven: 0 },
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
  bill: !!(((r.rt.orders_gieogieo || {}).thang09 || {})[28] || {}).bill_o1 });
const gated = (fake, re) => { let release; const gate = new Promise(x => { release = x; }); const orig = fake.db.ref.bind(fake.db);
  fake.db.ref = p => { const r = orig(p); return { ...r, transaction: async (fn, ...a) => { if (re.test(fn.toString())) await gate; return r.transaction(fn, ...a); } }; }; return release; };
const pinOk = base => { base.document.getElementById('del-pin-input').value = '3367'; };

(async () => {
  // ── 55: máy A thêm topping (trừ kho CHƯA bắt đầu), máy B xoá bill → trừ kho không được đến sau khi bill đã hoàn kho và xoá ──
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');                   // bán: BTP 100 → 50
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
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');
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
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');
      await F._submitAddonImpl(); await Promise.all(base.__tracked);
      const mid = (await fake.db.ref('active_units_gieogieo/P/b1/unitBase').once('value')).val();
      pinOk(base); await F.delOrderConfirm();
      return mid;
    }));
    eq([r.result, state(r)], [30, { rt: 100, lot: 100, stock: 100, short: 0, bill: false }], 'chuỗi bán → topping (70→ còn 30 sau 50+20) → xoá: RT, lô, tồn về 100, bill xoá');
  }

  // ── 59: thuê đã hết hạn nhưng worker cũ còn sống → trừ kho đến muộn sau khi bill bị xoá phải được hoàn (dấu huỷ bill trong transaction ghi sổ) ──
  {
    let release, nLoad = 0; const gate = new Promise(r => { release = r; });
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');                  // BTP 100 → 50
      await F._submitAddonImpl();                                                            // A giành thuê, lưu plan rồi chờ ngay trước khi trừ
      await new Promise(x => setTimeout(x, 20));
      const jobs = (await fake.db.ref(RTP + '/consumeJobs').once('value')).val() || {};
      const key = Object.keys(jobs)[0];
      await fake.db.ref(RTP + '/consumeJobs/' + key).update({ startedAt: 1 });               // thuê hết hạn (>120 s)
      pinOk(base); await F.delOrderConfirm();                                                // B: huỷ việc + dấu huỷ + hoàn kho + xoá bill
      release(); await Promise.all(base.__tracked);                                          // worker cũ chạy tiếp: trừ 20 → ghi sổ thấy dấu huỷ → tự hoàn
    }, { _loadPrepUnitAllocationsForOrderPOS: async () => { if (++nLoad > 0) await gate; return {}; } }));   // chờ SAU khi đã lưu plan, ngay trước các dòng trừ kho
    eq(state(r), { rt: 100, lot: 100, stock: 100, short: 0, bill: false }, '59 worker cũ (thuê hết hạn) trừ muộn sau khi bill đã xoá → bị hoàn: RT, lô, tồn đều 100');
  }
  // ── 60: chạy lại cùng addonId — `done` không chạy lại; NL cùng txId chỉ trừ một lần ──
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      const before = JSON.parse(JSON.stringify(base.orders[0]));
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');
      await F._submitAddonImpl(); await Promise.all(base.__tracked);                         // topping: BTP 50 → 30, job done
      const key = Object.keys((await fake.db.ref(RTP + '/consumeJobs').once('value')).val())[0];
      await F.applyAddonConsumptionPOS(before, base.orders[0], 'bill_o1', 'chạy lại', key);       // cùng addonId: bị từ chối
      await F._addonConsumeIngredientPOS('X', 20, 'n', 'bill_o1', 'addon_t60_ing_X');            // NL lần 1
      await F._addonConsumeIngredientPOS('X', 20, 'n', 'bill_o1', 'addon_t60_ing_X');            // NL chạy lại cùng txId
      const st = (await fake.db.ref(RTP + '/consumeJobs/' + key + '/status').once('value')).val();
      return st;
    }));
    const ledgerRows = Object.keys(r.fs).filter(k => /^stock_transactions_gieogieo\/addon_t60/.test(k)).length;
    eq([r.result, r.rt.active_units_gieogieo.P.b1.unitBase, r.rt.active_units_gieogieo.X.A.unitBase, ledgerRows], ['done', 30, 180, 1], '60 `done` không chạy lại; NL cùng txId chạy lại → tem 180 (một lần), một dòng sổ');
  }
  // ── 61: trừ kho lỗi → việc `failed` (không `done`) + chạy lại dùng plan đã lưu, không trừ đôi phần đã xong ──
  {
    const calc2 = ord => { let n = 0; (ord.itemsArray || []).forEach(it => (it.toppings || []).forEach(t => { n += 1; })); return { agg: n ? { X: 30 * n } : {}, prepAgg: { P: 50 + 20 * n }, skipped: [] }; };
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      const before = JSON.parse(JSON.stringify(base.orders[0]));
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');                  // BTP 100 → 50 (NL không dùng ở món gốc)
      const realApply = base.UnitEngine.ledger.apply;
      base.UnitEngine.ledger.apply = async () => { throw new Error('mất mạng'); };           // NL: ghi sổ lỗi 3 lần
      await F._submitAddonImpl(); await Promise.all(base.__tracked);
      const key = Object.keys((await fake.db.ref(RTP + '/consumeJobs').once('value')).val())[0];
      const j1 = (await fake.db.ref(RTP + '/consumeJobs/' + key).once('value')).val();
      base.UnitEngine.ledger.apply = realApply;
      await F.applyAddonConsumptionPOS(before, base.orders[0], 'bill_o1', 'chạy lại', key);       // chạy lại việc `failed`
      const j2 = (await fake.db.ref(RTP + '/consumeJobs/' + key).once('value')).val();
      return { s1: j1.status, failed: (j1.failedLines || []).map(x => x.id), hasPlan: !!j1.plan, s2: j2.status };
    }, { computeConsumptionForOrder: calc2 }));
    eq([r.result, r.rt.active_units_gieogieo.P.b1.unitBase, r.rt.active_units_gieogieo.X.A.unitBase], [{ failed: ['X'], hasPlan: true, s1: 'failed', s2: 'done' }, 30, 170], '61 lỗi NL → việc `failed` + dòng lỗi + plan; chạy lại → `done`, NL 170, BTP 30 (không trừ đôi)');
  }

  // ── 63: xoá bill từ QUẢN LÝ (consume.reverseOrder, không qua delOrderConfirm của POS) — worker topping đã lưu plan rồi chờ → bị chặn bởi dấu huỷ do engine ghi ──
  {
    let release; const gate = new Promise(r => { release = r; });
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');            // BTP 100 → 50
      await F._submitAddonImpl();                                                            // worker: giành thuê, lưu plan, chờ
      await new Promise(x => setTimeout(x, 20));
      const rv = await base.UnitEngine.consume.reverseOrder('bill_o1', { billCode: 'B001' });   // Quản lý: hoàn kho (engine ghi dấu huỷ)
      await fake.db.ref(RTP).remove();                                                       // Quản lý: xoá bill
      release(); await Promise.all(base.__tracked);
      return rv.ok;
    }, { _loadPrepUnitAllocationsForOrderPOS: async () => { await gate; return {}; } }));
    eq([r.result, state(r)], [true, { rt: 100, lot: 100, stock: 100, short: 0, bill: false }], '63 xoá bill từ Quản lý: trừ topping đến muộn bị chặn — RT, lô, tồn đều 100');
  }
  // ── 64: chiều HOÀN của topping (giảm tiêu hao NL do đổi bao bì) đến sau khi bill bị xoá cũng bị chặn ──
  {
    let release; const gate = new Promise(r => { release = r; });
    const calc3 = ord => { let n = 0; (ord.itemsArray || []).forEach(it => (it.toppings || []).forEach(t => { n += 1; })); return { agg: { X: 50 - 10 * n }, prepAgg: { P: 50 }, skipped: [] }; };   // thêm topping: NL X giảm 10 (bao bì khác)
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');            // X 200 → 150, BTP 100 → 50
      await F._submitAddonImpl();                                                            // worker: delta X = −10 (hoàn), lưu plan, chờ
      await new Promise(x => setTimeout(x, 20));
      const key = Object.keys((await fake.db.ref(RTP + '/consumeJobs').once('value')).val())[0];
      await fake.db.ref(RTP + '/consumeJobs/' + key).update({ startedAt: 1 });               // thuê hết hạn (worker cũ vẫn sống)
      pinOk(base); await F.delOrderConfirm();                                                // POS xoá bill: hoàn về X 200, BTP 100
      release(); await Promise.all(base.__tracked);                                          // worker hoàn thêm 10?
    }, { computeConsumptionForOrder: calc3, _loadLocDeductedForOrderPOS: async () => { await gate; return { fifoMap: { X: [{ containerId: 'A', qty: 50 }] } }; } }));
    eq([r.rt.active_units_gieogieo.X.A.unitBase, state(r)], [200, { rt: 100, lot: 100, stock: 100, short: 0, bill: false }], '64 hoàn do sửa topping đến sau khi bill đã xoá → bỏ qua: NL 200 (không 210), BTP 100');
  }

  // ── NGÀY BÌNH THƯỜNG (không lỗi, không đua): bán → thêm topping → bán bill 2 → POS xoá bill 1 → Quản lý xoá bill 2 → đổ bỏ BTP → Quản lý chỉnh lô → cân lại xác minh.
  //    Sau MỖI bước kiểm bất biến: tồn NL = Σ tem RT; tồn BTP = Σ lô dương; bản sao lô Firestore = RT; thiếu chờ đối chiếu đúng. (Firebase giả chế độ NGHIÊM.)
  {
    const calcD = ord => { let n = 0; (ord.itemsArray || []).forEach(it => (it.toppings || []).forEach(t => { n += 1; })); return { agg: { X: 50 + 10 * n }, prepAgg: { P: 30 + 20 * n }, skipped: [] }; };
    const steps = [];
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      const UE = base.UnitEngine, RTv = p => (fake.rtGet ? fake.rtGet(p) : undefined);
      const inv = name => {
        const X = fake.rtGet('active_units_gieogieo/X') || {}, Pn = fake.rtGet('active_units_gieogieo/P') || {};
        const sumX = Object.keys(X).filter(k => k !== '__prepLock').reduce((a, k) => a + (Number(X[k].unitBase) || 0), 0);
        const lots = Object.keys(Pn).filter(k => k !== '__prepLock');
        const posP = lots.reduce((a, k) => a + Math.max(0, Number(Pn[k].unitBase) || 0), 0);
        const lotOk = lots.every(k => { const d = fake.FS[PB + '/' + k]; return d && Math.abs((d.qtyRemaining || 0) - Math.max(0, Number(Pn[k].unitBase) || 0)) < 1e-6; });
        steps.push({ name, X: sumX, stockX: fake.FS['inventory_items_gieogieo/X'].currentStock, P: posP, stockP: fake.FS[PI + '/P'].currentStock, lotOk });
      };
      const settle = () => new Promise(x => setTimeout(x, 40));
      const o1 = base.orders[0];
      const o2 = { ...JSON.parse(JSON.stringify(o1)), id: 'bill_o2', billCode: 'B002' };
      await fake.db.ref('orders_gieogieo/thang09/28/bill_o2').set(JSON.parse(JSON.stringify({ ...o2, id: undefined })) );
      base.orders.push(o2);
      inv('đầu ngày');
      await F.applySalesConsumptionPOS(o1, 'bill_o1', '2026-09-28'); await settle(); inv('bán bill 1');
      await F._submitAddonImpl(); await Promise.all(base.__tracked); await settle(); inv('thêm topping bill 1');
      await F.applySalesConsumptionPOS(o2, 'bill_o2', '2026-09-28'); await settle(); inv('bán bill 2');
      pinOk(base); base.curOid = 'bill_o1'; await F.delOrderConfirm(); await settle(); inv('POS xoá bill 1');
      const rv = await UE.consume.reverseOrder('bill_o2', { billCode: 'B002' }); await fake.db.ref('orders_gieogieo/thang09/28/bill_o2').remove(); await settle(); inv('Quản lý xoá bill 2 (' + rv.ok + ')');
      await UE.prep.discardByLots({ id: 'P', name: 'Cốt trà', unit: 'g' }, { qty: 10, lines: [{ batchId: 'b1', batchCode: 'L1', qty: 10, con: 100 }], reason: 'đổ', totalCost: 0, ingredientBreakdown: [], weighings: {}, staffEmp: { id: 'e1', fullName: 'NV A' } }); await settle(); inv('đổ bỏ BTP 10');
      await UE.prep.setBatchQty('b1', 85); await settle(); inv('Quản lý chỉnh lô 85');
      fake.FS['duty_config_gieogieo/current'] = { fleetCompliant: true };
      fake.FS['duty_tasks_gieogieo/verify_P'] = { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c1', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-27T14:30:00.000Z', countedQty: 85, bookBeforeCount: 85, usageBase: 50, expireAt: '2099-01-01T00:00:00.000Z' };
      fake.FS['duty_cases_gieogieo/c1'] = { id: 'c1', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-26T14:00:00.000Z', to: '2026-09-27T14:30:00.000Z' }, history: [], businessDate: '2026-09-27' };
      const atMs = UE.clock.now(); const bk = await UE.duty.lotBookAtExact('P', 'b1', atMs);
      const vr = await UE.duty.verifyCommit({ prepId: 'P', prepName: 'Cốt trà', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: 85, qtyInitial: 800 }], batchQty: { b1: 80 }, batchWeighings: { b1: [{ w: 80 }] }, snaps: { b1: { book: bk.book, exact: bk.exact, at: new Date(atMs).toISOString() } } },
        fake.FS['duty_tasks_gieogieo/verify_P'], { now: new Date(UE.clock.now()).toISOString(), staff: { id: 'C', fullName: 'Chi' }, businessDate: '2026-09-28' });
      await settle(); inv('cân lại xác minh 80 (sổ ' + bk.book + ', ' + vr.outcome + ')');
      return { task: fake.FS['duty_tasks_gieogieo/verify_P'].status, adj: Object.values(fake.FS).filter(v => v && v.fromPrepVerify).map(v => v.qty) };
    }, { computeConsumptionForOrder: calcD }));
    if (r.error) console.log('   lỗi:', r.error);
    steps.forEach(st => console.log('   ' + st.name.padEnd(42) + ' NL tem ' + st.X + ' / tồn ' + st.stockX + ' · BTP lô ' + st.P + ' / tồn ' + st.stockP + (st.lotOk ? '' : '  ✗ lô Firestore ≠ RT')));
    const exp = [[200, 100], [150, 70], [140, 50], [90, 20], [150, 70], [200, 100], [200, 90], [200, 85], [200, 80]];
    eq(steps.map(st => [st.X, st.stockX === st.X, st.P, st.stockP === st.P, st.lotOk]), exp.map(([x, p]) => [x, true, p, true, true]), 'NGÀY BÌNH THƯỜNG: mọi bước tồn = Σ tem/lô, bản sao lô khớp RT, số đúng kỳ vọng');
    eq(r.result, { adj: [-5], task: 'done' }, 'NGÀY BÌNH THƯỜNG: cân lại 80 so sổ 85 → điều chỉnh −5, việc xong');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
