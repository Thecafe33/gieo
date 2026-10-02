// 02/10/2026 — NL "nấu dùng nguyên gói" (vd bí đao: đơn vị g, quy cách 1 gói = 600 g, cờ prepWholePack ở Quản lý).
// Trước đây NL g/kg luôn đi đường cân đối chiếu → báo "cần cân nhưng chưa có dụng cụ hoặc bì bao gói gốc".
// Nay xử lý như NL "cái rời": bắt quét đủ N gói CHƯA MỞ, báo hết luôn, không cân, không qua đối chiếu;
// huỷ mẻ trả gói về chưa mở. Hàm POS thật + engine thật trên Firebase giả.
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', SC = 'stock_containers_gieogieo', PB = 'prep_batches_gieogieo', TX = 'stock_transactions_gieogieo';
const STAFF = { fullName: 'NV A', id: 'e1' };
const BI = { id: 'B', name: 'Bí đao', unit: 'g', trackingMode: 'unit', countUnitName: 'gói', packagingUnits: [{ name: 'gói', baseQty: 600 }], prepWholePack: true };
const DUONG = { id: 'D', name: 'Đường', unit: 'g', trackingMode: 'unit', countUnitName: 'bao', packagingUnits: [{ name: 'bao', baseQty: 1000 }] };
const KIT = { id: 'K', name: 'Kit', unit: 'cái', trackingMode: 'unit' };
const COT = { id: 'P', name: 'Cốt bí đao', code: 'CBD', unit: 'ml', batchInputs: [{ itemId: 'B', qty: 600 }, { itemId: 'D', qty: 100 }] };

// ── 1. Hàm thuần: nhận diện, số gói cần quét, chặn số mẻ lẻ gói, loại khỏi đối chiếu ──
{
  const src = extract('posgieo.html', ['prepWholePackSize', 'computeAtomicRequirementsForPrep', 'prepCountQuantityError', 'prepReconRows', 'prepReconIsCountable', 'fmtPrepQty']);
  const UE = { classify: { isAtomic: it => !!it && it.trackingMode === 'unit' && it.unit === 'cái' } };
  const F = new Function('UnitEngine', 'KHO_ITEMS_CACHE', 'round2', 'posItemWeighFactor', src +
    '\nreturn { prepWholePackSize, computeAtomicRequirementsForPrep, prepCountQuantityError, prepReconRows };')(
    UE, [BI, DUONG, KIT], x => Math.round(x * 100) / 100, it => (it && (it.unit === 'g' || it.unit === 'ml') ? 1 : 0));
  eq([F.prepWholePackSize(BI), F.prepWholePackSize(DUONG), F.prepWholePackSize({ ...BI, prepWholePack: false }), F.prepWholePackSize({ ...BI, stockManaged: false }),
    F.prepWholePackSize({ ...BI, trackingMode: 'none' }), F.prepWholePackSize({ ...BI, countUnitName: 'g' })], [600, 0, 0, 0, 0, 0],
    'chỉ NL bật "nấu dùng nguyên gói", có quản kho theo tem và quy cách > 1 mới vào luồng này');
  const req = F.computeAtomicRequirementsForPrep(COT, 2);
  eq(req, [{ itemId: 'B', name: 'Bí đao', required: 2, wholePack: 600, packName: 'gói', unit: 'g' }], '2 mẻ × 600 g = 2 gói phải quét; đường (không bật cờ) không vào cổng quét');
  eq(F.computeAtomicRequirementsForPrep({ batchInputs: [{ itemId: 'K', qty: 1 }] }, 3).map(r => [r.required, 'wholePack' in r]), [[3, false]], 'NL cái rời vẫn như cũ');
  eq(F.prepCountQuantityError(COT, 2), '', 'số mẻ ra tròn gói → không chặn');
  eq(/Bí đao dùng nguyên gói.*0,5 gói.*tròn gói/.test(F.prepCountQuantityError(COT, 0.5)), true, 'nửa mẻ = 0,5 gói → chặn, bảo chọn số mẻ ra tròn gói');
  eq(F.prepReconRows(COT, 1).map(r => r.itemId), ['D'], 'bí đao KHÔNG vào đối chiếu cân (không còn lỗi "cần cân nhưng chưa có dụng cụ"); đường vẫn cân');
}

// ── 2. Gợi ý mẻ (cả hai app) không gợi ý số mẻ ra lẻ gói ──
for (const file of ['posgieo.html', 'quanlygieo.html']) {
  const F = new Function(extract(file, ['prepSugRatioOk']) + '\nreturn prepSugRatioOk;')();
  const items = [BI, DUONG], isAt = () => false;
  eq([F(COT, 1, items, isAt), F(COT, 1.5, items, isAt), F(COT, 3, items, isAt)], [true, false, true], file + ': gợi ý mẻ chỉ chọn số mẻ ra tròn gói');
}

// ── 3. Quét → báo hết → bắt đầu mẻ → huỷ mẻ: chạy thật trên engine ──
const seed = () => ({ rt: { active_units_gieogieo: { B: { c4: { code: 'BD04', unit: 'g', unitBase: 600, capacity: 600 } } } }, fs: {
  'duty_config_gieogieo/current': { fleetCompliant: true },
  [INV + '/B']: { ...BI, currentStock: 2100 },
  [SC + '/c1']: { itemId: 'B', itemName: 'Bí đao', code: 'BD01', unit: 'g', status: 'sealed', baseQty: 600 },
  [SC + '/c2']: { itemId: 'B', itemName: 'Bí đao', code: 'BD02', unit: 'g', status: 'sealed', baseQty: 600 },
  [SC + '/c3']: { itemId: 'B', itemName: 'Bí đao', code: 'BD03', unit: 'g', status: 'sealed', baseQty: 300 },
  [SC + '/c4']: { itemId: 'B', itemName: 'Bí đao', code: 'BD04', unit: 'g', status: 'open', baseQty: 600, openedAt: '2026-10-01T07:00:00.000Z' }
} });
const PREP = { id: 'P', name: 'Cốt bí đao', code: 'CBD', unit: 'ml', batchInputs: [{ itemId: 'B', qty: 600 }] };
const spec = (codes, flow) => ({
  app: 'pos', target: 'prepStartGateScan', exports: ['confirmPrepStartAfterScan', '_runPrepCancelSettle', '_loadBatchConsumptionTxPOS'],
  helpers: ['startPrepBatch', '_startPrepBatchImpl', '_reversePrepBatchInputsPOS', 'prepWholePackSize', 'computeAtomicRequirementsForPrep', 'prepCountQuantityError', 'prepReconIsCountable'],
  seed: seed(),
  scope: (fake, rec) => {
    let i = 0;
    return {
      PREP_ITEMS_CACHE_POS: [PREP], prepBatchState: { prepId: 'P', ratio: 2 }, KHO_ITEMS_CACHE: [BI],
      prepStartScanState: null, _posSubmitBusy: false, prepReconGate: null,
      prepReconRows: () => [], prepReconCheckNewRisk: async () => {}, prepReconBaseline: async () => ({}),
      posDateKey: () => '2026-10-02', setBtnBusy: () => () => {},
      posScan: async () => ({ ok: true, code: codes[i++] }), chanMaTrung: () => false,
      toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), posAutoReportManager: async (...a) => { rec('posAutoReportManager')(a[0]); },
      refreshFifoAlert: async () => {}, loadPrepBatchesPOS: async () => {}, renderPrepBatchForm: rec('renderPrepBatchForm'),
      renderPrepStartScanGate: rec('renderPrepStartScanGate'), prepSugRefresh: () => {}, savePrepStartScanState: () => {},
      clearPrepStartScanState: rec('clearPrepStartScanState')
    };
  }, call: flow
});
const toasts = r => r.calls.filter(c => c[0] === 'toast').map(c => c[1]).join(' | ');
(async () => {
  {
    // Quét: gói đã mở, gói sai quy cách → từ chối; 2 gói nguyên → tự bắt đầu mẻ.
    let st = null;
    const r = await runWrapped('engine', spec(['BD04', 'BD03', 'BD01', 'BD02'], async (F, fake, base) => {
      const req = [{ itemId: 'B', name: 'Bí đao', required: 2, wholePack: 600, packName: 'gói', unit: 'g', scannedIds: [] }];
      base.prepStartScanState = st = { staffEmp: STAFF, ratio: 2, requirements: req };
      for (let k = 0; k < 4; k++) await F.prepStartGateScan('B');
      const batchKey = Object.keys(fake.FS).find(k => k.startsWith(PB + '/'));
      const b = { id: batchKey.split('/')[1], ...fake.FS[batchKey] };
      return { b, stockAfterStart: fake.FS[INV + '/B'].currentStock, c: ['c1', 'c2', 'c3', 'c4'].map(id => fake.FS[SC + '/' + id].status),
        rtC4: !!fake.rtGet('active_units_gieogieo/B/c4') };
    }));
    // runWrapped chuẩn hoá kết quả — đọc lại từ r.result.
    const out = r.result || {};
    eq(r.error, null, 'không lỗi');
    const t = toasts(r);
    eq([/BD04 đã mở — mẻ này dùng nguyên gói/.test(t), /Tem BD03 là 300 g, không phải 1 gói \(600 g\)/.test(t)], [true, true], 'gói đã mở và gói sai quy cách bị từ chối, báo rõ lý do');
    eq(out.c, ['finished', 'finished', 'sealed', 'open'], 'quét đủ 2 gói nguyên → 2 gói báo hết, gói lẻ và gói đang mở giữ nguyên');
    eq(out.stockAfterStart, 900, 'tồn = tem thật: 2100 − 2 × 600 = 900 (gói 300 g + gói đang mở 600 g), không trừ hai lần');
    const b = out.b || {};
    eq([b.status, (b.atomicScannedContainerIds || []).slice().sort()], ['cooking', ['c1', 'c2']], 'mẻ đang nấu, nhớ đúng 2 gói đã quét để huỷ mẻ hoàn lại');
    const tr = (b.inputTrace || {}).B || {};
    eq((tr.allocations || []).map(a => [a.code, a.qty]), [['BD01', 600], ['BD02', 600]], 'Chi tiết lô: mỗi gói ghi đúng 600 g');
    const tx = Object.values(r.fs).filter(x => x && x.type === 'CONSUMPTION' && x.itemId === 'B');
    eq(tx.map(x => [x.qty, x.atomicScanned]), [[-1200, true]], 'sổ kho: một dòng trừ 1200 g, đánh dấu đã quét (không phân bổ lại vào gói khác)');
  }
  {
    // Huỷ mẻ → 2 gói về chưa mở, tồn trở lại 1800.
    const r = await runWrapped('engine', spec(['BD01', 'BD02'], async (F, fake, base) => {
      base.prepStartScanState = { staffEmp: STAFF, ratio: 2, requirements: [{ itemId: 'B', name: 'Bí đao', required: 2, wholePack: 600, packName: 'gói', unit: 'g', scannedIds: [] }] };
      await F.prepStartGateScan('B'); await F.prepStartGateScan('B');
      const batchKey = Object.keys(fake.FS).find(k => k.startsWith(PB + '/'));
      const b = { id: batchKey.split('/')[1], ...fake.FS[batchKey] };
      const plan = { reason: 'thử', staffName: STAFF.fullName, staffId: STAFF.id, recon: [] };
      await base.UnitEngine.prep.claimCancel(b.id, { cancelledAt: '2026-10-02T09:00:00.000Z', reason: 'thử', staffEmp: STAFF, plan });
      const txs = await F._loadBatchConsumptionTxPOS(b.id);
      const kq = await F._runPrepCancelSettle({ ...b, ...fake.FS[batchKey] }, { txs, plan, staffEmp: STAFF, note: 'Hoàn kho do HUỶ MẺ', reason: 'thử', retry: false });
      return { kq: [kq.ok, kq.failed, kq.atomicOk, kq.atomicFailed, kq.allOk], c: ['c1', 'c2'].map(id => fake.FS[SC + '/' + id].status), stock: fake.FS[INV + '/B'].currentStock };
    }));
    const out = r.result || {};
    eq(r.error, null, 'huỷ: không lỗi');
    eq([out.kq, out.c, out.stock], [[1, 0, 2, 0, true], ['sealed', 'sealed'], 2100], 'huỷ mẻ: hoàn sổ + 2 gói về chưa mở, tồn về 2100');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
