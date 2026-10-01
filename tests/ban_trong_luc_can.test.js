// Bán hàng trong lúc NL đang khoá cân cho mẻ chế biến (VD sữa tươi vừa làm phô mai vừa bán matcha latte).
// Chạy nguyên các hàm màn Đối chiếu NL của posgieo.html (cân → chốt) + UnitEngine trên Firebase giả.
// Nguyên tắc: bán vẫn trừ tem/tồn ngay và được ghi nhận; lúc chốt, lượng mẻ dùng = mốc lúc cân − số cân
// (phần đã bán TRƯỚC lúc cân nằm sẵn trong mốc), còn phần bán SAU lúc cân vẫn bị trừ khỏi tem.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', CTN = 'stock_containers_gieogieo', PB = 'prep_batches_gieogieo', TX = 'stock_transactions_gieogieo';
const STAFF = { fullName: 'NV A', id: 'e1' };
const ITEM_TEM = { name: 'Sữa tươi', unit: 'ml', trackingMode: 'unit', currentStock: 1000, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] };
const ITEM_FREE = { name: 'Đường', unit: 'g', trackingMode: 'none', currentStock: 2000 };
const mkSeed = agg => ({
  rt: { active_units_gieogieo: { X: agg ? {} : { A: { code: 'AAA', unitBase: 1000, capacity: 1000, openedAt: 1 } } } },
  fs: {
    [INV + '/X']: agg ? { ...ITEM_FREE } : { ...ITEM_TEM },
    ...(agg ? {} : { [CTN + '/A']: { itemId: 'X', itemName: 'Sữa tươi', code: 'AAA', status: 'open', unitBase: 1000, baseQty: 1000 } }),
    [PB + '/c1']: { prepId: 'P', prepName: 'Phô mai tươi', status: 'cooking', staff: 'NV A', staffEmployeeId: 'e1',
      reconcileInputs: { X: { status: 'pending', expected: 300, unit: agg ? 'g' : 'ml',
        units: [agg ? { id: '__aggregate', code: 'Tồn chung', baseline: 2000, capacity: 0, preVerified: true, heldAtBook: 0 }
          : { id: 'A', code: 'AAA', baseline: 1000, bookBaseline: 1000, heldAtBook: 0, preVerified: true }] } } }
  }
});
const H = ['prepReconReadUnits', 'prepReconIsLow', 'prepReconIsCountable', 'prepReconClassifyUsage', 'prepReconResidueAuto', 'prepReconExtraNeedsReview'];
const spec = (agg, flow, extra) => ({
  app: 'pos', target: 'prepReconPostSave', exports: ['prepReconWeigh', 'prepReconSnapBook'], helpers: H, seed: mkSeed(agg),
  scope: (f, r) => {
    const box = {}; const uid = agg ? '__aggregate' : 'A';
    return { _posSubmitBusy: false, resolveStaffPinAndCheckin: async () => STAFF, posDateKey: () => '2026-09-30',
      KHO_ITEMS_CACHE: [{ id: 'X', ...(agg ? ITEM_FREE : ITEM_TEM), stockManaged: true }], getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null,
      toast: r('toast'), toastAutoReport: r('toastAutoReport'), refreshFifoAlert: async () => {}, escHtmlPos: x => String(x), renderPinInput: () => '',
      openPrepReconForm: async () => r('openPrepReconForm')(), openPrepBatchScreen: r('openPrepBatchScreen'), setBtnBusy: () => () => {},
      prepReconScanExact: async () => true, itemCanWeighPOS: () => true, __box: box, __uid: uid,
      openWeighPad: o => { box.p = o.onDone(box.qty, [{ w: box.qty + 50, tare: 50 }]); },
      prepReconForm: { batchId: 'c1', itemId: 'X', values: {}, ...(extra || {}) } };
  },
  call: flow
});
// cân "phần còn lại" = qty rồi chụp mốc (như nhân viên bấm Cân)
const weigh = async (F, base, qty) => { base.__box.qty = qty; await F.prepReconWeigh(base.__uid); await base.__box.p; };
// một lượt bán matcha latte dùng `ml` sữa trong lúc NL khoá cho mẻ c1
async function sale(UE, id, ml, agg) {
  const alloc = agg ? [] : await UE.consume.allocate('X', ml, undefined, { type: 'order', id, duringPrepLock: true });
  await UE.ledger.apply({ itemId: 'X', type: 'CONSUMPTION', qty: -ml, note: 'Bán ' + id, referenceId: id, txId: id + '_ing_X', duringPrepLock: true,
    deriveFromUnits: alloc.length > 0, ...(alloc.length ? { meta: { fifoAllocations: alloc } } : {}) });
}
const lock = async (UE, agg) => { await UE.prep.reconAcquire('c1', [{ itemId: 'X', expected: 300, item: { name: 'X' } }]); };
const rtA = r => r.rt.active_units_gieogieo.X.A;
const T = (r, k) => r.fs[TX + '/' + k];
const trace = r => r.fs[PB + '/c1'].inputTrace.X;

(async () => {
  // S1. bán TRƯỚC lúc cân: lấy 300, bán 150 → cân sau còn 550
  {
    const r = await runWrapped('engine', spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await sale(base.UnitEngine, 'o1', 150);
      await weigh(F, base, 550);
      await F.prepReconPostSave();
    }));
    eq([r.error, rtA(r).unitBase, r.fs[INV + '/X'].currentStock], [null, 550, 550], 'S1 tem/tồn = số cân (550)');
    eq([T(r, 'prep_after_c1_X') && T(r, 'prep_after_c1_X').qty, !!T(r, 'prep_variance_c1_X')], [-300, false], 'S1 mẻ dùng đúng 300, KHÔNG có chênh lệch');
    eq([trace(r).windowSoldQty, trace(r).windowSales.map(x => [x.orderId, x.qty])], [150, [['o1', 150]]], 'S1 hệ thống biết bill o1 đã bán 150 trong lúc chờ');
    eq([T(r, 'o1_ing_X').prepWindowBatchId, T(r, 'o1_ing_X').prepWindowSettled === true, rtA(r).saleHeld], ['c1', true, undefined], 'S1 dòng bán gắn mẻ + đã tất toán; bộ đếm được dọn');
  }
  // S2. bán SAU lúc cân (giữa lúc cân xong và bấm chốt): số ghi vào tem = số cân − phần bán sau
  {
    const r = await runWrapped('engine', spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await weigh(F, base, 700);                    // cân lúc tem chưa có bán: lấy 300
      await sale(base.UnitEngine, 'o2', 150);       // rồi mới bán
      await F.prepReconPostSave();
    }));
    eq([r.error, rtA(r).unitBase, r.fs[INV + '/X'].currentStock], [null, 550, 550], 'S2 phần bán sau lúc cân vẫn bị trừ: 700 − 150 = 550');
    eq([T(r, 'prep_after_c1_X').qty, !!T(r, 'prep_variance_c1_X')], [-300, false], 'S2 mẻ dùng đúng 300, không chênh lệch');
  }
  // S3. bán trước VÀ sau lúc cân
  {
    const r = await runWrapped('engine', spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await sale(base.UnitEngine, 'o3a', 100);
      await weigh(F, base, 600);                    // 1000 − 100 − 300
      await sale(base.UnitEngine, 'o3b', 50);
      await F.prepReconPostSave();
    }));
    eq([r.error, rtA(r).unitBase, T(r, 'prep_after_c1_X').qty, !!T(r, 'prep_variance_c1_X')], [null, 550, -300, false], 'S3 bán trước 100 + sau 50: tem 550, mẻ dùng 300');
    eq(trace(r).windowSales.map(x => x.orderId + ':' + x.qty), ['o3a:100', 'o3b:50'], 'S3 biết cả hai bill');
  }
  // S4. có hao hụt thật (đổ 50) + bán 150 trước lúc cân → chênh lệch chỉ là 50, không lẫn bán
  {
    const r = await runWrapped('engine', spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await sale(base.UnitEngine, 'o4', 150);
      await weigh(F, base, 500);                    // 1000 − 150 − 300 − 50 đổ
      await F.prepReconPostSave();
    }, { varianceKind: 'waste', note: 'đổ khi rót' }));
    eq([r.error, T(r, 'prep_variance_c1_X') && T(r, 'prep_variance_c1_X').qty, T(r, 'prep_after_c1_X').qty, rtA(r).unitBase], [null, -50, -300, 500], 'S4 chênh lệch đúng 50 (không cộng 150 của bill)');
  }
  // S5. không bán gì → như cũ
  {
    const r = await runWrapped('engine', spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine); await weigh(F, base, 700); await F.prepReconPostSave();
    }));
    eq([r.error, rtA(r).unitBase, T(r, 'prep_after_c1_X').qty, trace(r).windowSoldQty], [null, 700, -300, 0], 'S5 không bán → chốt như cũ');
  }
  // S6. NL KHÔNG tem (tồn chung): bán 150 trước lúc cân
  {
    const r = await runWrapped('engine', spec(true, async (F, fake, base) => {
      await lock(base.UnitEngine, true);
      await sale(base.UnitEngine, 'o6', 150, true);
      await weigh(F, base, 1550);                   // 2000 − 150 − 300
      await F.prepReconPostSave();
    }));
    eq([r.error, r.fs[INV + '/X'].currentStock, T(r, 'prep_after_c1_X').qty, !!T(r, 'prep_variance_c1_X')], [null, 1550, -300, false], 'S6 NL không tem: tồn = 1550, mẻ dùng 300');
    eq([r.fs[INV + '/X'].prepSaleHeld, T(r, 'o6_ing_X').prepWindowBatchId], [undefined, 'c1'], 'S6 bộ đếm trên NL được dọn, dòng bán gắn mẻ');
  }
  // S7. thao tác KHÔNG phải bán vẫn bị khoá
  {
    const r = await runWrapped('engine', spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      let e1 = '', e2 = '';
      try { await base.UnitEngine.ledger.apply({ itemId: 'X', type: 'WASTE', qty: -10, referenceId: 'w1' }); } catch (e) { e1 = e.message; }
      try { await base.UnitEngine.consume.allocate('X', 10, undefined, { type: 'order', id: 'o7' }); } catch (e) { e2 = e.message; }
      return [e1, e2];
    }));
    eq(r.result.map(x => /chờ cân/.test(x)), [true, true], 'S7 đổ hao / trừ không đánh dấu bán vẫn bị chặn khi khoá');
  }

  // S8. hai mã đang mở (A cũ hơn, B): bán 100 rơi vào A (FIFO); mẻ lấy 300 từ A → chỉ A có phần bán
  {
    const seed = mkSeed(false);
    seed.rt.active_units_gieogieo.X = { A: { code: 'AAA', unitBase: 500, capacity: 1000, openedAt: 1 }, B: { code: 'BBB', unitBase: 1000, capacity: 1000, openedAt: 2 } };
    seed.fs[CTN + '/A'].unitBase = 500; seed.fs[CTN + '/B'] = { itemId: 'X', itemName: 'Sữa tươi', code: 'BBB', status: 'open', unitBase: 1000, baseQty: 1000 };
    seed.fs[INV + '/X'].currentStock = 1500;
    seed.fs[PB + '/c1'].reconcileInputs.X.units = [{ id: 'A', code: 'AAA', baseline: 500, bookBaseline: 500, heldAtBook: 0, preVerified: true }, { id: 'B', code: 'BBB', baseline: 1000, bookBaseline: 1000, heldAtBook: 0, preVerified: true }];
    const sp = spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await sale(base.UnitEngine, 'o8', 100);       // FIFO → mã A
      base.__box.qty = 100; await F.prepReconWeigh('A'); await base.__box.p;   // A: 500 − 100 bán − 300 mẻ = 100
      base.__box.qty = 1000; await F.prepReconWeigh('B'); await base.__box.p;
      await F.prepReconPostSave();
    });
    sp.seed = seed;
    const r = await runWrapped('engine', sp);
    eq([r.error, r.rt.active_units_gieogieo.X.A.unitBase, r.rt.active_units_gieogieo.X.B.unitBase, T(r, 'prep_after_c1_X').qty, !!T(r, 'prep_variance_c1_X')], [null, 100, 1000, -300, false], 'S8 nhiều mã: bán rơi vào A, mẻ dùng 300, không chênh lệch');
  }
  // S9. màn Đối chiếu: tồn đổi vì BÁN không bị coi là "mốc lệch"; hiện danh sách bill đã bán
  {
    const sp = spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await sale(base.UnitEngine, 'o9', 150);
      await F.openPrepReconForm('c1', 'X');
      return base.__dom.prepBatchBody.innerHTML;
    });
    sp.target = 'openPrepReconForm'; sp.exports = ['prepReconFormHTML', 'prepReconWindowSalesHTML'];
    const base0 = sp.scope;
    sp.scope = (f, r, dom) => ({ ...base0(f, r), prepSetBack: () => {}, orders: [{ id: 'o9', billCode: 'B009', itemsArray: [{ name: 'Matcha latte' }] }],
      STOCK_CONTAINERS_COLL: CTN, prepReconForm: null });
    const r = await runWrapped('engine', sp);
    const html = String(r.result || '');
    eq([r.error, html.includes('Mốc mã đã đổi'), html.includes('Trong lúc chờ đã bán'), html.includes('B009'), html.includes('Matcha latte')], [null, false, true, true, true], 'S9 không báo lệch mốc; hiện bill B009 · Matcha latte');
  }

  // S10. Khoá tab Kho: NL đang chờ cân cho mẻ → không mở mã / không báo hết lẻ ở tab Kho (chỉ ở màn Đối chiếu NL)
  {
    const seed = mkSeed(false);
    seed.fs['prep_ingredient_locks_gieogieo/X'] = { batchId: 'c1' };
    seed.fs[CTN + '/S'] = { itemId: 'X', itemName: 'Sữa tươi', code: 'SSS', status: 'sealed', baseQty: 1000 };
    const common = (f, r) => ({ toast: r('toast'), closeStockScanSheet: r('closeStockScanSheet'), openStockScanSheet: r('openStockScanSheet'), _posSubmitBusy: false,
      resolveStaffPinAndCheckin: async () => { r('daHoiPIN')(); return STAFF; }, KHO_ITEMS_CACHE: [], STOCK_OPEN_LIST: [], isAtomicUnitContainer: () => false });
    const rOpen = await runWrapped('engine', { app: 'pos', target: 'submitOpenContainer', seed, scope: (f, r) => ({ ...common(f, r), prepReconOpeningContext: null, prepReconStockBatch: async () => 'c1' }),
      call: F => F.submitOpenContainer('S', false) });
    eq([rOpen.calls.some(c => c[0] === 'daHoiPIN'), /Đối chiếu NL/.test(String((rOpen.calls.find(c => c[0] === 'toast') || [])[1])), rOpen.fs[CTN + '/S'].status], [false, true, 'sealed'], 'S10 mở mã ở tab Kho khi NL khoá → chặn trước khi hỏi PIN, tem giữ nguyên');
    const rCtx = await runWrapped('engine', { app: 'pos', target: 'submitOpenContainer', seed, scope: (f, r) => ({ ...common(f, r), prepReconOpeningContext: { batchId: 'c1', itemId: 'X' }, prepReconStockBatch: async () => null }),
      call: F => F.submitOpenContainer('S', false) });
    eq(rCtx.calls.some(c => c[0] === 'toast' && /Đối chiếu NL/.test(String(c[1]))), false, 'S10 mở từ màn Đối chiếu (có ngữ cảnh mẻ) → không bị chặn ở bước này');
    const rFin = await runWrapped('engine', { app: 'pos', target: 'openConfirmFinishSheet', helpers: ['prepReconStockBatch', 'finishContainerRemaining'], seed,
      scope: (f, r) => ({ ...common(f, r), PREP_RECON_LOCK_COLL: 'prep_ingredient_locks_gieogieo' }),
      call: F => F.openConfirmFinishSheet({ id: 'A', itemId: 'X', itemName: 'Sữa tươi', code: 'AAA', status: 'open', baseQty: 1000, unit: 'ml' }, false) });
    eq([rFin.calls.some(c => c[0] === 'openStockScanSheet'), /báo hết/.test(String((rFin.calls.find(c => c[0] === 'toast') || [])[1]))], [false, true], 'S10 báo hết ở tab Kho khi NL khoá → chặn, không mở popup');
  }

  // S11. Ca thực tế 01/10: sổ mã còn 171 g, cân ra 337 g, định mức 20 g (lần cân trước của NV A nhập sai −165 g)
  {
    const seed = mkSeed(false);
    seed.rt.active_units_gieogieo.X.A.unitBase = 171; seed.fs[CTN + '/A'].unitBase = 171; seed.fs[INV + '/X'].currentStock = 171;
    seed.fs[PB + '/c1'].reconcileInputs.X.expected = 20;
    seed.fs[PB + '/c1'].reconcileInputs.X.units = [{ id: 'A', code: 'AAA', baseline: 171, bookBaseline: 171, heldAtBook: 0, preVerified: false,
      startCheckpoint: { stage: 'after', at: '2026-09-29T12:05:00.000Z', batchId: 'prevB', employeeId: 'eA', employeeName: 'Nhân viên A' } }];
    seed.fs[TX + '/prep_after_prevB_X'] = { itemId: 'X', type: 'CONSUMPTION', qty: -185, prepRecon: true, varianceKind: 'extra_usage', expectedQty: 20, referenceId: 'prevB',
      responsibility: { employeeId: 'eA', employeeName: 'Nhân viên A' } };
    const sp = spec(false, async (F, fake, base) => {
      await lock(base.UnitEngine);
      await weigh(F, base, 337);
      await F.prepReconPostSave();
    }, { note: 'Lần cân trước nhập sai' });
    sp.seed = seed;
    const r = await runWrapped('engine', sp);
    eq([r.error, rtA(r).unitBase, r.fs[INV + '/X'].currentStock], [null, 337, 337], 'S11 cân nhiều hơn sổ vẫn chốt được: tem = số cân thật 337');
    eq([T(r, 'prep_after_c1_X').qty, T(r, 'prep_surplus_c1_X') && [T(r, 'prep_surplus_c1_X').type, T(r, 'prep_surplus_c1_X').qty]], [-20, ['ADJUSTMENT', 186]], 'S11 mẻ dùng theo định mức 20; điều chỉnh tăng 186 (sổ ghi thiếu)');
    const prev = T(r, 'prep_after_prevB_X');
    eq([prev.entryErrorConfirmed, prev.entryErrorFoundInBatch, prev.responsibility.employeeName], [true, 'c1', 'Nhân viên A'], 'S11 lượt cân trước được đánh dấu nhập sai, người cân vẫn là NV A');
    const al = r.fs['alerts_gieogieo/prep_entry_error_c1_X'];
    eq([!!al, al && al.previousWeighers[0].employeeName, trace(r).bookUnderstated.qty], [true, 'Nhân viên A', 186], 'S11 báo Quản lý + vết mẻ ghi người cân mốc trước');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
