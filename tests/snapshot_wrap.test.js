// Ảnh chụp các nghiệp vụ E4 tách TAY (hàm giao diện giữ ở app, phần ghi chuyển vào engine):
// chạy nguyên hàm giao diện trên Firebase giả, so bản mới (HTML hiện tại + UnitEngine) với bản GỐC.
//   Lập ảnh chụp:  CORE=html CORE_HTML=<POS gốc> CORE_HTML_QL=<QL gốc> UPDATE=1 node tests/snapshot_wrap.test.js
//   So thẳng 2 bản khi phát triển: CMP=1 CORE_HTML=... CORE_HTML_QL=... node tests/snapshot_wrap.test.js
'use strict';
const fs = require('fs'); const path = require('path');
const { runWrapped } = require('./lib/wrap_harness');
const SNAP = path.join(__dirname, 'snapshots', 'wrap.json');
const CTN = 'stock_containers_gieogieo', INV = 'inventory_items_gieogieo', PB = 'prep_batches_gieogieo', PI = 'prep_items_gieogieo';
const fsDocs = (fake, coll) => Object.keys(fake.FS).filter(k => k.startsWith(coll + '/')).sort().map(k => ({ id: k.split('/')[1], ...JSON.parse(JSON.stringify(fake.FS[k])) }));
const QL_COMMON = (fake, rec) => ({
  ensureAuth: async () => {}, dkey: d => d.toISOString().slice(0, 10), fmtNum: (n, k) => Number(n).toFixed(k || 0),
  loadPrepBatches: async () => fsDocs(fake, PB), INVENTORY_ITEMS: fsDocs(fake, INV), PREP_ITEMS: fsDocs(fake, PI),
  toast: rec('toast'), showError: rec('showError'), memoDropItems: rec('memoDropItems'), memoDropPreps: rec('memoDropPreps'),
  logAudit: rec('logAudit'), _qlRefillActive: []
});
const ITEM_X = { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 1400, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] };
const SEED_QL = () => ({
  rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 400, capacity: 1000, openedAt: 1000 } }, P: { b1: { code: 'L1', unitBase: 100, capacity: 400, openedAt: 500 }, b2: { code: 'L2', unitBase: 300, capacity: 400, openedAt: 600 } } } },
  fs: {
    [INV + '/X']: ITEM_X,
    [INV + '/K']: { name: 'Kit', unit: 'cái', trackingMode: 'unit', currentStock: 2, countUnitName: 'Cái', packagingUnits: [{ name: 'Cái', baseQty: 1 }] },
    [PI + '/P']: { name: 'Cốt', code: 'CT', unit: 'ml', currentStock: 400 },
    [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 100, qtyInitial: 400, unitBase: 100, finishedAt: '2026-09-27T01:00:00.000Z' },
    [PB + '/b2']: { prepId: 'P', status: 'active', qtyRemaining: 300, qtyInitial: 400, unitBase: 300, finishedAt: '2026-09-27T05:00:00.000Z' },
    [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 400, baseQty: 1000 },
    [CTN + '/S']: { itemId: 'X', code: 'SSS', status: 'sealed', baseQty: 1000 },
    [CTN + '/k1']: { itemId: 'K', itemName: 'Kit', code: 'KK1', unit: 'cái', status: 'finished', wasteBasis: 'don_vi_nguyen', baseQty: 1 },
    'receiving_records_gieogieo/r1': { poId: null, lines: [{ itemId: 'X', qtyGoodBase: 2000 }] },
    'stock_transactions_gieogieo/t1': { type: 'RECEIVING', itemId: 'X', qty: 2000, referenceId: 'r1', note: 'nhận' }
  }
});
const S = {};
// ── Quản lý ──
S.QL_chinh_ton_btp_giam = { app: 'ql', target: 'submitPrepAdjust', seed: SEED_QL(),
  scope: (fake, rec) => ({ ...QL_COMMON(fake, rec), prepAdjustId: 'P', prepAdjustDraft: { newQty: 250, reason: 'đếm lại' }, closeModal: rec('closeModal') }),
  call: F => F.submitPrepAdjust() };
S.QL_chinh_ton_btp_tang = { app: 'ql', target: 'submitPrepAdjust', seed: SEED_QL(),
  scope: (fake, rec) => ({ ...QL_COMMON(fake, rec), prepAdjustId: 'P', prepAdjustDraft: { newQty: 600, reason: 'lỡ trừ' }, closeModal: rec('closeModal') }),
  call: F => F.submitPrepAdjust() };
S.QL_tra_tem_cai_roi = { app: 'ql', target: 'ctnRestoreAtomicSealed', seed: SEED_QL(),
  scope: (fake, rec) => ({ ...QL_COMMON(fake, rec), _ctnDetailRender: rec('_ctnDetailRender'), renderKhoAllItemsBody: rec('renderKhoAllItemsBody') }),
  call: F => F.ctnRestoreAtomicSealed('k1') };
const fixrec = (c, extra) => ({ app: 'ql', target: 'fixRecWizApply', seed: SEED_QL(),
  scope: (fake, rec) => ({ ...QL_COMMON(fake, rec), FIXREC_WIZ: { recId: 'r1', rec: fake.FS['receiving_records_gieogieo/r1'], lyDo: 'gõ nhầm' },
    fixRecWizTinh: () => c, fixRecWizGo: rec('fixRecWizGo'), closeFixRecWizard: rec('closeFixRecWizard'), renderKhoPO: rec('renderKhoPO'), poTruSoDaNhan: rec('poTruSoDaNhan'), ...(extra || {}) }),
  call: F => F.fixRecWizApply() });
S.QL_sua_phieu_huy_tem = fixrec({ hopLe: true, coDanTem: true, l: { itemId: 'X', name: 'Sữa', unit: 'ml' }, huy: [{ id: 'S', code: 'SSS' }], theoLo: false, tem: [], giu: [{ code: 'AAA' }],
  thua: 1000, daGhiBase: 2000, baseDung: 1000, daGhi: 2, soDung: 1, donVi: 'Hộp' });
S.QL_sua_phieu_theo_lo_dang_mo = fixrec({ hopLe: true, coDanTem: true, l: { itemId: 'X', name: 'Sữa', unit: 'ml' }, huy: [], theoLo: true, tem: [{ id: 'A', code: 'AAA', status: 'open', baseQty: 1000 }], giu: [],
  thua: 200, daGhiBase: 2000, baseDung: 800, daGhi: 2000, soDung: 1800, donVi: 'ml' });

// ── POS ──
const STAFF = { fullName: 'NV A', id: 'e1' };
const POS_COMMON = (fake, rec, items, preps) => ({
  _posSubmitBusy: false, resolveStaffPinAndCheckin: async () => STAFF, resolveStaffPinWorkedToday: async () => STAFF, posDateKey: () => '2026-09-28',
  KHO_ITEMS_CACHE: items || fsDocs(fake, INV), PREP_ITEMS_CACHE_POS: preps || fsDocs(fake, PI),
  getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null,
  toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), refreshFifoAlert: async () => rec('refreshFifoAlert')(),
  closeStockScanSheet: rec('closeStockScanSheet'), _refreshStockUseListIfActive: rec('_refreshStockUseListIfActive')
});
const SEED_POS = () => ({
  rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 400, capacity: 1000, openedAt: 1000 } } } },
  fs: {
    [INV + '/X']: ITEM_X,
    [CTN + '/A']: { itemId: 'X', itemName: 'Sữa', code: 'AAA', status: 'open', unitBase: 400, baseQty: 1000, businessDate: '2026-09-20' },
    [CTN + '/S']: { itemId: 'X', itemName: 'Sữa', code: 'SSS', status: 'sealed', baseQty: 1000, businessDate: '2026-09-20', labelEvents: [{ type: 'PRINTED' }] },
    [CTN + '/L1']: { itemId: 'X', itemName: 'Sữa', code: 'LLL', status: 'lost', lostFromStatus: 'open', unitBase: 300, baseQty: 1000, openedAt: '2026-09-25T01:00:00.000Z' },
    [CTN + '/L2']: { itemId: 'X', itemName: 'Sữa', code: 'MMM', status: 'lost', baseQty: 1000 },
    'stock_lost_reports_gieogieo/lr1': { containerId: 'L2', status: 'approved' },
    'employee_stock_deductions_gieogieo/d1': { lostReportId: 'lr1', status: 'active' },
    [CTN + '/F']: { itemId: 'X', code: 'FFF', status: 'finished', baseQty: 1000 }
  }
});
S.POS_tim_lai_tem_dang_mo = { app: 'pos', target: 'submitFoundLostContainer', seed: SEED_POS(), scope: (f, r) => ({ ...POS_COMMON(f, r) }), call: F => F.submitFoundLostContainer('L1') };
S.POS_tim_lai_tem_co_phieu = { app: 'pos', target: 'submitFoundLostContainer', seed: SEED_POS(), scope: (f, r) => ({ ...POS_COMMON(f, r) }), call: F => F.submitFoundLostContainer('L2') };
S.POS_in_lai_tem_mat = { app: 'pos', target: 'missingLabelDoReprint', seed: SEED_POS(),
  scope: (f, r) => ({ ...POS_COMMON(f, r), missingLabelState: { itemId: 'X', itemName: 'Sữa', expected: 3, scannedLog: [{ code: 'AAA' }], missing: [{ id: 'A' }, { id: 'S' }, { id: 'F' }] } }),
  call: F => F.missingLabelDoReprint() };
S.POS_cap_lai_hang_loat = { app: 'pos', target: 'bulkReprintByDateConfirm', seed: SEED_POS(),
  scope: (f, r, dom) => { dom.bulkReprintReason = { value: 'tem mờ' }; return { ...POS_COMMON(f, r), bulkReprintState: { itemName: 'Sữa', cutoff: '2026-09-21', preview: [{ id: 'S' }, { id: 'A' }], safe: [{ code: 'ZZZ' }] } }; },
  call: F => F.bulkReprintByDateConfirm() };

// ── POS: mẻ BTP ──
const PREP_P = { id: 'P', name: 'Cốt', code: 'CT', unit: 'ml', batchYield: 800, costPerUnit: 3, batchInputs: [{ itemId: 'X', qty: 500 }] };
const SEED_PREP = () => {
  const s = SEED_POS();
  s.rt.active_units_gieogieo.P = { b1: { code: 'L1', unitBase: 100, capacity: 400, openedAt: 500 }, b2: { code: 'L2', unitBase: 300, capacity: 400, openedAt: 600 } };
  s.rt.active_units_gieogieo.K = {};
  Object.assign(s.fs, {
    [PI + '/P']: { name: 'Cốt', code: 'CT', unit: 'ml', currentStock: 400, batchYield: 800, costPerUnit: 3 },
    [INV + '/K']: { name: 'Kit', unit: 'cái', trackingMode: 'unit', currentStock: 2, countUnitName: 'Cái', packagingUnits: [{ name: 'Cái', baseQty: 1 }] },
    [PB + '/b1']: { prepId: 'P', batchCode: 'L1', status: 'active', qtyRemaining: 100, qtyInitial: 400, unitBase: 100 },
    [PB + '/b2']: { prepId: 'P', batchCode: 'L2', status: 'active', qtyRemaining: 300, qtyInitial: 400, unitBase: 300 },
    [PB + '/c1']: { prepId: 'P', prepName: 'Cốt', status: 'cooking', batchRatio: 1 },
    [CTN + '/k1']: { itemId: 'K', code: 'KK1', status: 'finished', finishedFromStatus: 'sealed', baseQty: 1 },
    'stock_transactions_gieogieo/cs1': { itemId: 'X', type: 'CONSUMPTION', qty: -150, referenceId: 'c1', fifoAllocations: [{ containerId: 'A', qty: 150 }] },
    'stock_transactions_gieogieo/cs2': { itemId: 'X', type: 'CONSUMPTION', qty: -20, referenceId: 'c1', prepRecon: true }
  });
  return s;
};
const COOK = { id: 'c1', prepId: 'P', prepCode: 'CT', prepName: 'Cốt', unit: 'ml', batchRatio: 1, status: 'cooking', businessDate: '2026-09-28', shelfLifeType: 'hours', shelfLifeHours: 24, atomicScannedContainerIds: ['k1'] };
const PREP_SCOPE = (f, r, dom, extra) => ({ ...POS_COMMON(f, r, null, [PREP_P]), PREP_BATCHES_CACHE_POS: [JSON.parse(JSON.stringify(COOK))], posConfirm: async () => true,
  prepBatchInputCostPOS: () => 1500, computePrepExpiry: () => '2026-09-29T08:00:00.000Z', refreshPrepYieldStatsPOS: async () => r('refreshPrepYieldStatsPOS')(), loadPrepBatchesPOS: async () => r('loadPrepBatchesPOS')(), ...(extra || {}) });
S.POS_hoan_thanh_me = { app: 'pos', target: '_submitPrepFinishImpl', helpers: ['_prepAfterFinishOK'], seed: SEED_PREP(),
  scope: (f, r, dom) => { dom.prepFinishQty = { value: '750' }; return PREP_SCOPE(f, r, dom, { _finishingBatchId: 'c1', _prepFinishWeighLines: [{ w: 800, tare: 50 }] }); },
  call: F => F._submitPrepFinishImpl() };
S.POS_hoan_thanh_me_resume = { app: 'pos', target: '_submitPrepFinishImpl', helpers: ['_prepAfterFinishOK'], seed: (() => { const s = SEED_PREP(); s.fs[PB + '/c1'] = { ...s.fs[PB + '/c1'], status: 'finishing', _pendingFinish: { qty: 700, batchCode: 'OLD', expiresAt: 'E', inputCost: 10, weighLines: [], weighMethod: 'manual', staffFullName: 'NV B', staffEmployeeId: 'e2', declaredYieldTotal: 800, yieldVariancePct: -12.5, finishedAt: '2026-09-28T00:00:00.000Z' } }; return s; })(),
  scope: (f, r, dom) => { dom.prepFinishQty = { value: '750' }; return PREP_SCOPE(f, r, dom, { _finishingBatchId: 'c1', _prepFinishWeighLines: [] }); },
  call: F => F._submitPrepFinishImpl() };
S.POS_do_bo_theo_lo = { app: 'pos', target: '_submitPrepWasteImpl', seed: SEED_PREP(),
  scope: (f, r, dom) => { dom.pwReasonSelect = { value: '__other__' }; dom.pwReason = { value: 'đổ nhầm' };
    return PREP_SCOPE(f, r, dom, { khoTxState: { prepId: 'P' }, pwReadLines: () => [{ batchId: 'b1', batchCode: 'L1', qty: 100, con: 100 }, { batchId: 'b2', batchCode: 'L2', qty: 50, con: 300 }],
      pwBatchesFor: () => [1, 2], WASTE_REASONS_CACHE: [], _pwWeighings: { b2: { w: 60, tare: 10 } }, showScreen: r('showScreen') }); },
  call: F => F._submitPrepWasteImpl() };
S.POS_huy_me = { app: 'pos', target: '_submitPrepCancelImpl', seed: SEED_PREP(), helpers: ['_loadBatchConsumptionTxPOS', '_reverseAtomicContainerFinish', '_runPrepCancelSettle'],
  scope: (f, r, dom) => { dom.prepCancelReason = { value: 'khét' }; return PREP_SCOPE(f, r, dom, { _cancellingBatchId: 'c1', openPrepBatchScreen: r('openPrepBatchScreen') }); },
  call: F => F._submitPrepCancelImpl() };

// ── POS: mở tem / báo huỷ tem ──
const OPEN_SCOPE = (f, r, extra) => ({ ...POS_COMMON(f, r), prepReconOpeningContext: null, prepReconStockBatch: async () => null,
  fifoOlderSealedHint: async () => r('fifoOlderSealedHint')(), computeOpenExpiry: (h, iso) => (h ? 'HSD+' + h : null), openOpenLabelPrintSheet: r('openOpenLabelPrintSheet'), ...(extra || {}) });
S.POS_mo_tem_bi_chan = { app: 'pos', target: 'submitOpenContainer', seed: SEED_POS(), scope: (f, r) => OPEN_SCOPE(f, r), call: F => F.submitOpenContainer('S', false) };
S.POS_mo_tem_van_mo = { app: 'pos', target: 'submitOpenContainer', seed: SEED_POS(),
  scope: (f, r, dom) => { dom.openOverrideReason = { value: 'bao cũ vón' }; return OPEN_SCOPE(f, r); }, call: F => F.submitOpenContainer('S', true) };
S.POS_mo_tem_bao_cu_can = { app: 'pos', target: 'submitOpenContainer', seed: (() => { const s = SEED_POS(); s.rt.active_units_gieogieo.X.A.unitBase = 0; s.fs[INV + '/X'] = { ...ITEM_X, printOpenLabel: true }; s.fs[CTN + '/S'].openShelfLifeHours = 48; return s; })(),
  scope: (f, r) => OPEN_SCOPE(f, r), call: F => F.submitOpenContainer('S', false) };
const KTX = (id, code, status, itemId) => (f, r, dom) => {
  dom.ktxDiscardAck = { checked: true }; dom.ktxReasonSelect = { value: '__other__' }; dom.ktxReason = { value: 'hỏng' }; dom.ktxNote = { value: 'rơi vỡ' }; dom.ktxLoc = { value: 'source' };
  return { ...POS_COMMON(f, r), khoTxState: { scannedContainer: { id, code, status, itemId } }, posMgrError: m => new Error('[QL] ' + m), renderKhoTxForm: r('renderKhoTxForm') };
};
S.POS_bao_huy_tem_mo = { app: 'pos', target: '_submitKhoTxImpl', seed: SEED_POS(), scope: KTX('A', 'AAA', 'open', 'X'), call: F => F._submitKhoTxImpl() };
S.POS_bao_huy_tem_seal = { app: 'pos', target: '_submitKhoTxImpl', seed: SEED_POS(), scope: KTX('S', 'SSS', 'sealed', 'X'), call: F => F._submitKhoTxImpl() };
S.POS_bao_huy_tem_da_het = { app: 'pos', target: '_submitKhoTxImpl', seed: SEED_POS(), scope: KTX('F', 'FFF', 'finished', 'X'), call: F => F._submitKhoTxImpl() };

// ── POS: đối chiếu NL của mẻ ──
const RECON_HELPERS = ['prepReconReadUnits', 'prepReconIsLow', 'prepReconIsCountable'];
const SEED_RECON = (rtX, row) => () => {
  const s = SEED_POS();
  s.rt.active_units_gieogieo.X = rtX;
  s.fs[PB + '/c1'] = { prepId: 'P', prepName: 'Cốt', status: 'cooking', staff: 'NV A', staffEmployeeId: 'e1', reconcileInputs: { X: row } };
  s.fs[CTN + '/N'] = { itemId: 'X', itemName: 'Sữa', code: 'NNN', status: 'open', unitBase: 1000, baseQty: 1000 };
  return s;
};
const ROW = { status: 'pending', units: [{ id: 'A', code: 'AAA', baseline: 400 }] };
const RECON_SCOPE = (f, r, extra) => ({ ...POS_COMMON(f, r), openPrepReconForm: async (...a) => r('openPrepReconForm')(...a),
  prepFlowToastError: (e, pre) => r('prepFlowToastError')((pre || '') + String(e && e.message || e)), escHtmlPos: x => String(x), renderPinInput: () => '', ...(extra || {}) });
S.POS_doi_chieu_ghi_moc_ma_moi = { app: 'pos', target: 'prepReconRegisterNew', helpers: RECON_HELPERS,
  seed: (() => { const s = SEED_RECON({ __prepLock: { batchId: 'c1' }, A: { code: 'AAA', unitBase: 400, capacity: 1000, openedAt: 1000 }, N: { code: 'NNN', unitBase: 1000, capacity: 1000, openedAt: 2000 } }, ROW)();
    s.fs['prep_ingredient_locks_gieogieo/X'] = { batchId: 'c1' }; return s; })(),
  scope: (f, r) => { const box = {}; return RECON_SCOPE(f, r, { __box: box, openWeighPad: o => { box.p = o.onDone(950, [{ w: 1000, tare: 50 }]); } }); },
  call: async (F, fake, base) => { await F.prepReconRegisterNew('c1', 'X', 'N'); await base.__box.p; } };
S.POS_doi_chieu_mo_ma_tiep = { app: 'pos', target: 'prepReconOpenNext', helpers: RECON_HELPERS,
  seed: SEED_RECON({ A: { code: 'AAA', unitBase: 400, capacity: 1000, openedAt: 1000 } }, ROW)(),
  scope: (f, r) => RECON_SCOPE(f, r, { prepReconForm: { batchId: 'c1', itemId: 'X', values: { A: { qty: 0, manual: true, lines: [] } }, note: 'hết thật' },
    posScan: async () => ({ ok: true, code: 'SSS' }), prepReconOpeningContext: null, openStockScanSheet: r('openStockScanSheet') }),
  call: async (F, fake, base) => { await F.prepReconOpenNext('c1', 'X'); return base.prepReconOpeningContext; } };
S.POS_doi_chieu_nap_lai_moc = { app: 'pos', target: 'prepReconRefreshStale', helpers: RECON_HELPERS,
  seed: SEED_RECON({ A: { code: 'AAA', unitBase: 350, capacity: 1000, openedAt: 1000 } }, ROW)(),
  scope: (f, r) => RECON_SCOPE(f, r, { prepReconForm: { batchId: 'c1', itemId: 'X', values: { A: { qty: 1 } } } }),
  call: async (F, fake, base) => { await F.prepReconRefreshStale('c1', 'X'); return base.prepReconForm; } };

const POST_HELPERS = [...RECON_HELPERS, 'prepReconClassifyUsage', 'prepReconResidueAuto', 'prepReconExtraNeedsReview'];
const SEED_POST = () => { const s = SEED_RECON({ __prepLock: { batchId: 'c1' }, A: { code: 'AAA', unitBase: 400, capacity: 1000, openedAt: 1000 } },
  { status: 'pending', expected: 150, unit: 'ml', units: [{ id: 'A', code: 'AAA', baseline: 400, preVerified: true }] })();
  s.fs['prep_ingredient_locks_gieogieo/X'] = { batchId: 'c1' }; return s; };
const POST = (qty, extra) => ({ app: 'pos', target: 'prepReconPostSave', helpers: POST_HELPERS, seed: SEED_POST(),
  scope: (f, r) => RECON_SCOPE(f, r, { prepReconForm: { batchId: 'c1', itemId: 'X', values: { A: { qty, lines: [{ w: qty + 50, tare: 50 }], verifiedUnitId: 'A' } }, ...(extra || {}) },
    setBtnBusy: () => () => {}, openPrepBatchScreen: r('openPrepBatchScreen') }),
  call: async (F, fake, base) => { await F.prepReconPostSave(); return base.prepReconForm; } });
S.POS_doi_chieu_chot_khop = POST(250);
S.POS_doi_chieu_chot_hao_hut = POST(200, { varianceKind: 'waste', note: 'rơi ra ngoài' });

// Khác biệt CÓ CHỦ ĐÍCH so với bản gốc (đã duyệt) — áp vào CẢ hai phía trước khi so:
//  · F3/E2: dòng sổ được sửa mang thêm mảng `amendments` (vết sửa chỉ-thêm).
//  · R2: chỉnh tồn BTP xếp lô theo openedAt (kịch bản chọn dữ liệu cùng thứ tự nên không khác).
const strip = o => { const fsx = o.fs || {}; for (const k of Object.keys(fsx)) if (fsx[k] && fsx[k].amendments) delete fsx[k].amendments;
  o.log = (o.log || []).map(x => JSON.parse(JSON.stringify(x).replace(/,?"amendments":\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ''))); return o; };
const INTENDED = { QL_sua_phieu_huy_tem: strip, QL_sua_phieu_theo_lo_dang_mo: strip };

async function all(kind) { const out = {}; for (const n of Object.keys(S)) out[n] = await runWrapped(kind, S[n]); return out; }
function cmp(a, b) {
  let ok = true;
  for (const n of Object.keys(S)) {
    if (!b[n]) { ok = false; console.log('FAIL chưa có ảnh chụp ' + n); continue; }
    let x = JSON.parse(JSON.stringify(a[n])), y = JSON.parse(JSON.stringify(b[n]));
    if (INTENDED[n]) { x = INTENDED[n](x); y = INTENDED[n](y); }
    if (JSON.stringify(x) === JSON.stringify(y)) { console.log('ok ' + n); continue; }
    ok = false; console.log('FAIL ' + n);
    for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) console.log('   khác ở ' + k + ':\n     mới ' + JSON.stringify(x[k]).slice(0, 900) + '\n     cũ  ' + JSON.stringify(y[k]).slice(0, 900));
  }
  return ok;
}
if (require.main !== module) module.exports = { S }; else (async () => {
  if (process.env.CMP === '1') { const ok = cmp(await all('engine'), await all('html')); console.log(ok ? 'ALL PASS' : 'SOME FAIL'); return; }
  const kind = process.env.CORE || 'engine';
  const out = await all(kind);
  if (process.env.UPDATE === '1') { fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify(out, null, 1)); console.log('ok đã ghi ảnh chụp (' + kind + ')'); console.log('ALL PASS'); return; }
  const ok = cmp(out, JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  console.log('nguồn: ' + kind); console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
