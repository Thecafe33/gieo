// Huỷ mẻ có NL đã cân đối chiếu (chủ dự án chốt 28/09/2026): hỏi RIÊNG từng NL —
//   "Đã hoàn trả"        → bắt cân lại từng mã; hoàn = số cân lại − tồn mã lúc cân (≤ lượng đã lấy), phần còn lại → HAO HỤT;
//   "Không thể hoàn trả" → toàn bộ lượng đã lấy → HAO HỤT.
// Sổ: sửa CÓ VẾT 2 dòng của bước đối chiếu (prep_after_… / prep_variance_…), không thêm dòng mới.
// Chạy nguyên các hàm màn Huỷ mẻ của posgieo.html + UnitEngine trên Firebase giả.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 600), '!=', JSON.stringify(b).slice(0, 600)); } else console.log('ok', m); };
const CTN = 'stock_containers_gieogieo', INV = 'inventory_items_gieogieo', PB = 'prep_batches_gieogieo', TX = 'stock_transactions_gieogieo';
const STAFF = { fullName: 'NV A', id: 'e1' };
const fsDocs = (fake, coll) => Object.keys(fake.FS).filter(k => k.startsWith(coll + '/')).sort().map(k => ({ id: k.split('/')[1], ...JSON.parse(JSON.stringify(fake.FS[k])) }));
// X: Nước đường — mã A đã lấy 264 (còn mở), mã F đã lấy 50 (đã báo hết) → lấy 314 = sổ: dùng 290 + chênh 24
// Y: Sữa — mã B đã lấy 100 → sổ: dùng 100
const RECON = {
  X: { status: 'done', unit: 'ml', submitted: [{ id: 'A', code: 'AAA', baseline: 400, after: 136, finished: false }, { id: 'F', code: 'FFF', baseline: 50, after: 0, finished: true }] },
  Y: { status: 'done', unit: 'ml', submitted: [{ id: 'B', code: 'BBB', baseline: 500, after: 400, finished: false }] }
};
const seed = () => ({
  rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 136, capacity: 1000, openedAt: 1000 } }, Y: { B: { code: 'BBB', unitBase: 400, capacity: 1000, openedAt: 1000 } } } },
  fs: {
    [INV + '/X']: { name: 'Nước đường', unit: 'ml', trackingMode: 'unit', currentStock: 1136, countUnitName: 'Chai', packagingUnits: [{ name: 'Chai', baseQty: 1000 }] },
    [INV + '/Y']: { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 400, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] },
    [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 136, baseQty: 1000 },
    [CTN + '/S']: { itemId: 'X', code: 'SSS', status: 'sealed', baseQty: 1000 },
    [CTN + '/F']: { itemId: 'X', code: 'FFF', status: 'finished', baseQty: 1000 },
    [CTN + '/B']: { itemId: 'Y', code: 'BBB', status: 'open', unitBase: 400, baseQty: 1000 },
    'prep_items_gieogieo/P': { name: 'Trà sữa nền', unit: 'ml', currentStock: 0 },
    [PB + '/c1']: { prepId: 'P', prepName: 'Trà sữa nền', status: 'cooking', batchRatio: 1, reconcileInputs: RECON },
    [TX + '/prep_after_c1_X']: { itemId: 'X', type: 'CONSUMPTION', qty: -290, referenceId: 'c1', prepRecon: true, note: 'Nấu Trà sữa nền · lượng cân thực tế' },
    [TX + '/prep_variance_c1_X']: { itemId: 'X', type: 'ADJUSTMENT', qty: -24, referenceId: 'c1', prepReconVariance: true },
    [TX + '/prep_after_c1_Y']: { itemId: 'Y', type: 'CONSUMPTION', qty: -100, referenceId: 'c1', prepRecon: true, note: 'Nấu Trà sữa nền · lượng cân thực tế' }
  }
});
const COOK = { id: 'c1', prepId: 'P', prepName: 'Trà sữa nền', unit: 'ml', batchRatio: 1, status: 'cooking', reconcileInputs: RECON };
const EXPORTS = ['openPrepCancelForm', 'prepCancelReconState', 'prepCancelReconSum', 'renderPrepCancelRecon', 'prepCancelReconAnswer', 'prepCancelReconSet', 'prepCancelReconMeasure'];
const spec = (flow, mutate) => {
  const sd = seed(); if (mutate) mutate(sd);
  const batch = JSON.parse(JSON.stringify(sd.fs[PB + '/c1']));
  return {
    app: 'pos', target: '_submitPrepCancelImpl', exports: EXPORTS, helpers: ['_loadBatchConsumptionTxPOS', '_runPrepCancelSettle', 'prepReconIsCountable', 'prepReconReadUnits', 'prepReconIsLow', 'escHtmlPos'], seed: sd,
    scope: (fake, rec, dom) => {
      dom.prepCancelReason = { value: 'Bấm nhầm thành phẩm' };
      return { _posSubmitBusy: false, resolveStaffPinAndCheckin: async () => STAFF, posDateKey: () => '2026-09-28', posConfirm: async () => true,
        KHO_ITEMS_CACHE: fsDocs(fake, INV), PREP_ITEMS_CACHE_POS: [{ id: 'P', name: 'Trà sữa nền', unit: 'ml', batchInputs: [{ itemId: 'X', qty: 250 }] }],
        PREP_BATCHES_CACHE_POS: [{ ...COOK, reconcileInputs: batch.reconcileInputs, ...batch, id: 'c1' }], _prepCancelRecon: null, _cancellingBatchId: null,
        getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null,
        toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), refreshFifoAlert: async () => rec('refreshFifoAlert')(),
        openPrepBatchScreen: rec('openPrepBatchScreen'), escHtmlPos: x => String(x) };
    },
    call: flow
  };
};
const T = (r, k) => r.fs[TX + '/' + k];
const lastToast = r => (r.calls.filter(c => c[0] === 'toast').pop() || [])[1];
(async () => {
  // A. Nước đường "Đã hoàn trả" (cân lại mã A = 380 → trả 244), Sữa "Không thể hoàn trả"
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      F.openPrepCancelForm('c1');
      const st = base._prepCancelRecon;
      const shape = st.items.map(g => [g.itemName, g.taken, g.units.map(x => x.code), g.blocked.map(x => x.code)]);
      F.prepCancelReconAnswer(0, 'da_tra'); F.prepCancelReconAnswer(1, 'khong_tra');
      await F.prepCancelReconSet(0, 0, 380, [{ gross: 400, tare: 20 }]);
      const sums = st.items.map(g => F.prepCancelReconSum(g));
      await F._submitPrepCancelImpl();
      return { shape, sums };
    }));
    eq(r.result.shape, [['Nước đường', 314, ['AAA'], ['FFF']], ['Sữa', 100, ['BBB'], []]], 'A: gom theo từng NL (mã đã báo hết chỉ tính vào lượng đã lấy)');
    eq(r.result.sums, [{ hao: 70, tra: 244 }, { hao: 100, tra: 0 }], 'A: tổng kết từng NL — trả / hao hụt');
    eq([r.rt.active_units_gieogieo.X.A.unitBase, r.fs[CTN + '/A'].unitBase, r.rt.active_units_gieogieo.Y.B.unitBase], [380, 380, 400], 'A: trả 244 vào mã AAA; Sữa không đụng mã');
    const ux = T(r, 'prep_after_c1_X'), vx = T(r, 'prep_variance_c1_X'), uy = T(r, 'prep_after_c1_Y');
    eq([ux.type, ux.qty, ux.reclassifiedFrom, ux.amendments.length, ux.amendments[0].before, ux.amendments[0].after.qty],
      ['WASTE', -46, 'CONSUMPTION', 1, { amendNote: null, note: 'Nấu Trà sữa nền · lượng cân thực tế', qty: -290, reclassifiedAt: null, reclassifiedBy: null, reclassifiedFrom: null, type: 'CONSUMPTION' }, -46],
      'A: Nước đường — dòng "Nấu …" −290 → HAO HỤT −46 (sửa có vết)');
    eq([vx.qty, vx.amendments], [-24, undefined], 'A: dòng chênh lệch giữ nguyên (phần trả nằm trong phần dùng)');
    eq([uy.type, uy.qty, uy.reclassifiedFrom, /không thể hoàn trả/.test(uy.note)], ['WASTE', -100, 'CONSUMPTION', true], 'A: Sữa — toàn bộ −100 → HAO HỤT');
    eq(Object.keys(r.fs).filter(k => k.startsWith(TX + '/')).length, 3, 'A: không thêm dòng sổ mới');
    eq([r.fs[INV + '/X'].currentStock, r.fs[INV + '/Y'].currentStock], [1380, 400], 'A: tồn Nước đường suy lại theo mã (1000 + 380)');
    const b = r.fs[PB + '/c1'];
    eq([b.status, b.cancelReconAnswer, b.cancelReconReturnedCount], ['cancelled', { X: 'da_tra', Y: 'khong_tra' }, 2], 'A: mẻ huỷ + lưu câu trả lời từng NL');
    eq(lastToast(r), '✅ Đã huỷ mẻ · Nước đường hoàn +244 ml, hao hụt 70 ml · Sữa hao hụt 100 ml', 'A: thông báo nói rõ từng NL');
  }
  // B. Còn NL chưa chọn → chặn, không ghi gì
  {
    const r = await runWrapped('engine', spec(async (F) => { F.openPrepCancelForm('c1'); F.prepCancelReconAnswer(0, 'khong_tra'); await F._submitPrepCancelImpl(); }));
    eq([r.fs[PB + '/c1'].status, T(r, 'prep_after_c1_X').type, lastToast(r)], ['cooking', 'CONSUMPTION', '⚠️ Sữa: chọn "Đã hoàn trả" hoặc "Không thể hoàn trả"'], 'B: NL chưa trả lời → không cho huỷ');
  }
  // C. "Đã hoàn trả" mà chưa cân lại → chặn
  {
    const r = await runWrapped('engine', spec(async (F) => { F.openPrepCancelForm('c1'); F.prepCancelReconAnswer(0, 'da_tra'); F.prepCancelReconAnswer(1, 'khong_tra'); await F._submitPrepCancelImpl(); }));
    eq([r.fs[PB + '/c1'].status, /Cân lại 1 mã/.test(lastToast(r))], ['cooking', true], 'C: đã hoàn trả nhưng chưa cân → không cho huỷ');
  }
  // D. Cân ra ít hơn tồn mã / nhiều hơn lượng đã lấy → báo, không nhận số
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      F.openPrepCancelForm('c1');
      await F.prepCancelReconSet(0, 0, 100, []); const a = base._prepCancelRecon.items[0].units[0].weighed;
      await F.prepCancelReconSet(0, 0, 136 + 264 + 50, []); const b2 = base._prepCancelRecon.items[0].units[0].weighed;
      return [a, b2];
    }));
    const t = r.calls.filter(c => c[0] === 'toast').map(c => c[1]);
    eq([r.result, /nhỏ hơn tồn hiện tại/.test(t[0]), /nhiều hơn lượng đã lấy/.test(t[1])], [[null, null], true, true], 'D: số cân vô lý bị từ chối');
  }
  // E. Trả vượt phần "dùng" → trừ tiếp vào dòng chênh lệch (dùng 200 + chênh 64 = lấy 264, trả 250)
  {
    const r = await runWrapped('engine', spec(async (F) => {
      F.openPrepCancelForm('c1'); F.prepCancelReconAnswer(0, 'da_tra'); F.prepCancelReconAnswer(1, 'da_tra');
      await F.prepCancelReconSet(0, 0, 386, []); await F.prepCancelReconSet(1, 0, 500, []);
      await F._submitPrepCancelImpl();
    }, sd => {
      sd.fs[PB + '/c1'].reconcileInputs = { X: { status: 'done', unit: 'ml', submitted: [RECON.X.submitted[0]] }, Y: RECON.Y };
      sd.fs[TX + '/prep_after_c1_X'].qty = -200; sd.fs[TX + '/prep_variance_c1_X'].qty = -64;
    }));
    const ux = T(r, 'prep_after_c1_X'), vx = T(r, 'prep_variance_c1_X'), uy = T(r, 'prep_after_c1_Y');
    eq([ux.qty, ux.type, /Hoàn toàn bộ/.test(ux.note), vx.qty, vx.type, uy.qty, uy.type], [0, 'CONSUMPTION', true, -14, 'ADJUSTMENT', 0, 'CONSUMPTION'],
      'E: trả 250 = hết phần dùng 200 + 50 của chênh lệch → sổ còn −14 (= 264 − 250)');
    eq([r.rt.active_units_gieogieo.X.A.unitBase, r.rt.active_units_gieogieo.Y.B.unitBase], [386, 500], 'E: mã về đúng số cân lại');
  }
  // F. Engine gọi lại (mạng chập, bấm lại) → không cộng / không sửa sổ hai lần
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => {
      const o = { answer: 'da_tra', staffEmp: STAFF, batchName: 'Trà sữa nền', reason: 'nhầm', returns: [{ unitId: 'A', code: 'AAA', returned: 244 }] };
      await base.UnitEngine.prep.cancelSettleRecon('c1', 'X', o);
      return base.UnitEngine.prep.cancelSettleRecon('c1', 'X', o);
    }));
    eq([r.rt.active_units_gieogieo.X.A.unitBase, T(r, 'prep_after_c1_X').qty, T(r, 'prep_after_c1_X').amendments.length, r.result.already], [380, -46, 1, true], 'F: chống ghi đúp (RT + sổ)');
  }
  // G. Mẻ không có NL đối chiếu → luồng huỷ cũ không đổi (không khối cân lại)
  {
    const r = await runWrapped('engine', spec(async (F, fake, base) => { F.openPrepCancelForm('c1'); return base._prepCancelRecon; }, sd => { delete sd.fs[PB + '/c1'].reconcileInputs; }));
    eq(r.result, null, 'G: mẻ không đối chiếu → không có khối cân lại');
  }
  // H. Chế độ thử: luồng mới cũng không lọt ra dữ liệu thật
  {
    const r = await runWrapped('engine', spec(async (F) => {
      F.openPrepCancelForm('c1'); F.prepCancelReconAnswer(0, 'da_tra'); F.prepCancelReconAnswer(1, 'khong_tra');
      await F.prepCancelReconSet(0, 0, 380, []); await F._submitPrepCancelImpl();
    }), { thu: true });
    eq({ fs: r.thu.realFsChanged, rt: r.thu.realRtChanged, lot: r.thu.escaped, coGhi: r.thu.testWrites > 0 }, { fs: false, rt: false, lot: [], coGhi: true }, 'H: chế độ thử — cách ly');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
