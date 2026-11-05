// [05/11 — CHẶN NHẬP SAI, pos_prep.v2] Vụ trà ô long: mẻ dùng 5 túi, hộp mới 25 → còn 20 nhưng Vỹ nhập «còn 2»; hôm sau A
// «cân trước khi lấy NL» đếm 20 và bị ghi khoản chênh +18. Chạy nguyên các hàm POS (bản posgieo đang trỏ) + UnitEngine thật
// trên Firebase giả:
//   A. Hoàn thành mẻ: lệch LỚN so với định mức → hỏi lại MỘT lần nói rõ hậu quả; «Đếm lại» = không ghi gì; «Đúng» = chốt.
//   B. Cân trước khi lấy NL: lệch LỚN so với sổ → hỏi lại; dư → nêu người ghi lần trước + «bạn KHÔNG chịu»; «Đếm lại» xoá số.
//   C. Bắt đầu mẻ: khoản dư ở cân trước quy cho NGƯỜI GHI LẦN TRƯỚC (Vỹ), A chỉ là người phát hiện; dòng sổ của lần ghi
//      trước được đánh dấu «đã xác minh nhập sai»; báo Quản lý. Thiếu so với sổ: giữ như cũ (người bắt đầu mẻ giải trình).
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 600), '!=', JSON.stringify(b).slice(0, 600)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', CTN = 'stock_containers_gieogieo', PB = 'prep_batches_gieogieo', TX = 'stock_transactions_gieogieo', AL = 'alerts_gieogieo';
const STAFF = { fullName: 'NV A', id: 'e1' };
const ITEM = { name: 'Trà ô long', unit: 'cái', trackingMode: 'unit', currentStock: 25 };
const CP = { stage: 'after', batchId: 'B1', at: '2026-11-04T09:00:00.000Z', employeeId: 'vy', employeeName: 'Vỹ' };
const EMP = [{ id: 'vy', fullName: 'Vỹ' }, { id: 'e1', fullName: 'NV A' }, { id: 'b', fullName: 'NV B' }];

// ── A. Hoàn thành mẻ ──
const seedPost = () => ({
  rt: { active_units_gieogieo: { X: { __prepLock: { batchId: 'c1' }, A: { code: 'YW', unitBase: 25, capacity: 25, openedAt: 1 } } } },
  fs: { [INV + '/X']: { ...ITEM }, [CTN + '/A']: { itemId: 'X', itemName: 'Trà ô long', code: 'YW', status: 'open', unitBase: 25, baseQty: 25 },
    'prep_ingredient_locks_gieogieo/X': { batchId: 'c1' },
    [PB + '/c1']: { prepId: 'P', prepName: 'Trà ô long', status: 'cooking', staff: 'Vỹ', staffEmployeeId: 'vy',
      reconcileInputs: { X: { status: 'pending', expected: 5, unit: 'cái', units: [{ id: 'A', code: 'YW', baseline: 25, bookBaseline: 25, heldAtBook: 0, preVerified: true }] } } } }
});
const H = ['prepReconReadUnits', 'prepReconIsLow', 'prepReconIsCountable', 'prepReconClassifyUsage', 'prepReconResidueAuto', 'prepReconExtraNeedsReview', 'prepReconConfirmBigDiff', 'prepBigDev', 'prepConfirmMin'];
const post = (left, answers) => ({
  app: 'pos', target: 'prepReconPostSave', helpers: H, seed: seedPost(),
  scope: (f, r) => { const box = { msgs: [], answers: [...answers] }; return {
    _posSubmitBusy: false, resolveStaffPinAndCheckin: async () => ({ fullName: 'Vỹ', id: 'vy' }), posDateKey: () => '2026-11-04',
    KHO_ITEMS_CACHE: [{ id: 'X', ...ITEM, stockManaged: true }], getPrimaryRefillRulePOS: () => null, getBiggestPackagingUnitPOS: () => null,
    toast: r('toast'), toastAutoReport: r('toastAutoReport'), refreshFifoAlert: async () => {}, escHtmlPos: x => String(x), renderPinInput: () => '',
    openPrepReconForm: async () => r('openPrepReconForm')(), openPrepBatchScreen: r('openPrepBatchScreen'), setBtnBusy: () => () => {},
    prepReconScanExact: async () => true, itemCanWeighPOS: () => true, __box: box,
    posConfirm: async (m, o) => { box.msgs.push(m); box.opts = o; return box.answers.shift(); },
    prepReconForm: { batchId: 'c1', itemId: 'X', varianceKind: 'uncertain', note: 'chưa rõ',
      values: { A: { qty: left, whole: left, partial: 0, manual: true, verifiedUnitId: 'A' } } } }; },
  call: async (F, fake, base) => { await F.prepReconPostSave(); const again = base.__box.answers.length ? await F.prepReconPostSave() : null;
    return { msgs: base.__box.msgs, opts: base.__box.opts }; }
});

// ── B. Cân trước khi lấy NL (nút Tiếp tục) ──
const gate = (book, counted) => ({ key: 'P:1', ready: false,
  targets: [{ itemId: 'X', itemName: 'Trà ô long', unit: 'cái', id: 'A', code: 'YW', unitBase: book, expected: 5, multiOpen: false, fromCheckpoint: CP }],
  values: { 0: { qty: counted, whole: counted, partial: 0, manual: true, reason: 'đếm lại thấy ' + counted } } });
const pre = (book, counted, answer, ctn) => ({
  app: 'pos', target: 'prepReconPreflightDone', helpers: ['prepReconGateReady', 'prepLastRecorder', 'prepBigDev', 'prepConfirmMin', '_prepMs', 'prepReconIsCountable', 'fmtDateTimeShort'],
  seed: { rt: {}, fs: { [INV + '/X']: { ...ITEM }, [CTN + '/A']: { itemId: 'X', code: 'YW', status: 'open', ...(ctn || {}) } } },
  scope: (f, r) => { const box = { msgs: [] }; return { _prepPreflightAsking: false, prepReconGate: gate(book, counted), STOCK_CONTAINERS_COLL: CTN,
    KHO_ITEMS_CACHE: [{ id: 'X', ...ITEM }], EMPLOYEES_CACHE_POS: EMP, renderPrepReconPreflight: r('renderPrepReconPreflight'), startPrepBatchGate: r('startPrepBatchGate'),
    posConfirm: async (m, o) => { box.msgs.push(m); box.opts = o; return answer; }, toast: r('toast'), __box: box }; },
  call: async (F, fake, base) => { await F.prepReconPreflightDone(); return { msgs: base.__box.msgs, opts: base.__box.opts, gate: base.prepReconGate }; }
});

// ── C. Bắt đầu mẻ với số cân trước ──
const seedStart = book => ({
  rt: { active_units_gieogieo: { X: { A: { code: 'YW', unitBase: book, capacity: 25, openedAt: 1, lastPrepCheckpoint: CP } } } },
  fs: { [INV + '/X']: { ...ITEM, currentStock: book }, [CTN + '/A']: { itemId: 'X', itemName: 'Trà ô long', code: 'YW', status: 'open', unitBase: book, baseQty: 25 },
    // Ngày 1 — dòng sổ Vỹ để lại khi chốt mẻ B1 (ghi mất 18).
    [TX + '/prep_variance_B1_X']: { itemId: 'X', type: 'ADJUSTMENT', qty: -18, observedDecrease: 23, expectedQty: 5, varianceKind: 'uncertain', prepReconVariance: true, needsReview: true, referenceId: 'B1', businessDate: '2026-11-04', staff: 'Vỹ', staffEmployeeId: 'vy' },
    [TX + '/prep_after_B1_X']: { itemId: 'X', type: 'CONSUMPTION', qty: -5, expectedQty: 5, uncertainVariance: 18, prepRecon: true, needsReview: true, referenceId: 'B1', businessDate: '2026-11-04', staff: 'Vỹ', staffEmployeeId: 'vy' } }
});
const start = (book, counted) => ({
  app: 'pos', target: '_startPrepBatchImpl', helpers: ['_reversePrepBatchInputsPOS', '_loadBatchConsumptionTxPOS', 'prepLastRecorder', 'prepBigDev', 'prepConfirmMin', '_prepMs',
    'prepMarkPriorEntryError', 'prepPriorRowIds', 'fmtDateTimeShort'], seed: seedStart(book),
  scope: (fake, rec) => ({
    PREP_ITEMS_CACHE_POS: [{ id: 'P', name: 'Trà ô long', code: 'TOL', unit: 'ml', batchInputs: [{ itemId: 'X', qty: 5 }] }],
    prepBatchState: { prepId: 'P', ratio: 1 }, KHO_ITEMS_CACHE: [{ id: 'X', ...ITEM }], EMPLOYEES_CACHE_POS: EMP,
    STOCK_CONTAINERS_COLL: CTN, prepReconGate: gate(book, counted),
    prepReconRows: () => [{ itemId: 'X', expected: 5, item: { id: 'X', ...ITEM } }], prepCountQuantityError: () => null, prepReconCheckNewRisk: async () => {},
    prepReconBaseline: async () => ({ status: 'pending', expected: 5, unit: 'cái', units: [] }),
    posDateKey: () => '2026-11-05', toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), posAutoReportManager: async (...a) => { rec('posAutoReportManager')(a[0]); },
    refreshFifoAlert: async () => {}, loadPrepBatchesPOS: async () => rec('loadPrepBatchesPOS')(), renderPrepBatchForm: rec('renderPrepBatchForm'), prepSugRefresh: rec('prepSugRefresh')
  }), call: async F => { await F._startPrepBatchImpl(STAFF, false, [], {}); }
});
const preRow = r => { const k = Object.keys(r.fs).find(x => x.startsWith(TX + '/prep_pre_')); return k ? r.fs[k] : null; };

(async () => {
  // A1. Vỹ nhập «còn 2» (sổ 25, định mức 5) → hỏi lại; bấm «Đếm lại» → không ghi gì.
  {
    const r = await runWrapped('engine', post(2, [false]));
    const m = (r.result.msgs || [])[0] || '';
    eq([r.error, r.result.msgs.length, /lẽ ra còn khoảng 20/.test(m), /18 cái bị ghi là DÙNG VƯỢT \/ MẤT — trách nhiệm ghi cho Vỹ/.test(m)], [null, 1, true, true], 'A1 hỏi lại, nói rõ: lẽ ra còn ~20, 18 bị ghi mất, trách nhiệm Vỹ');
    eq([r.result.opts.okText, r.result.opts.cancelText], ['Đúng, tôi chắc chắn', 'Đếm lại'], 'A1 nút: «Đếm lại» / «Đúng, tôi chắc chắn»');
    eq([r.fs[PB + '/c1'].reconcileInputs.X.status, Object.keys(r.fs).filter(k => k.startsWith(TX + '/')).length, r.rt.active_units_gieogieo.X.A.unitBase], ['pending', 0, 25], 'A1 «Đếm lại»: chưa chốt, không dòng sổ, tem giữ 25');
  }
  // A2. Đếm lại vẫn nhập 2 và bấm «Đúng» → chốt như cũ (lệch ghi cho người chốt).
  {
    const r = await runWrapped('engine', post(2, [true]));
    eq([r.error, r.fs[PB + '/c1'].reconcileInputs.X.status, r.rt.active_units_gieogieo.X.A.unitBase, !!r.fs[TX + '/prep_after_c1_X']], [null, 'done', 2, true], 'A2 «Đúng, tôi chắc chắn» → chốt theo số nhập');
  }
  // A3. Nhập đúng 20 → không hỏi gì.
  {
    const r = await runWrapped('engine', post(20, []));
    eq([r.error, r.result.msgs.length, r.fs[PB + '/c1'].reconcileInputs.X.status], [null, 0, 'done'], 'A3 đúng định mức → không hỏi');
  }
  // B1. A đếm 20, sổ 2 → hỏi lại, nêu Vỹ + «bạn KHÔNG chịu»; bấm «Đếm lại» → xoá số, chưa sang bước bắt đầu.
  {
    const r = await runWrapped('engine', pre(2, 20, false));
    const m = r.result.msgs[0] || '', v = r.result.gate.values[0];
    eq([r.error, /NHIỀU hơn sổ 18 cái/.test(m), /Lần ghi trước: Vỹ lúc 04\/11 16:00/.test(m), /bạn KHÔNG chịu/.test(m)], [null, true, true, true], 'B1 dư: nêu người ghi trước (Vỹ, giờ VN) + bạn không chịu');
    eq([v.qty, v.reason, r.calls.some(c => c[0] === 'startPrepBatchGate'), r.calls.some(c => c[0] === 'renderPrepReconPreflight')], [undefined, 'đếm lại thấy 20', false, true], 'B1 «Đếm lại»: xoá số, giữ lý do, vẽ lại màn');
  }
  // B2. Bấm «Đúng» → sang bước bắt đầu, nhớ người ghi trước để ghi sổ.
  {
    const r = await runWrapped('engine', pre(2, 20, true));
    const v = r.result.gate.values[0];
    eq([r.result.gate.ready, v.confirmedQty, v.prev && v.prev.employeeId, r.calls.some(c => c[0] === 'startPrepBatchGate')], [true, 20, 'vy', true], 'B2 «Đúng» → bắt đầu mẻ, nhớ người ghi trước');
  }
  // B3. Có lượt cân cuối ca SAU mốc mẻ → người ghi trước = người cân cuối ca.
  {
    const r = await runWrapped('engine', pre(2, 20, true, { lastShiftWeigh: { op: 'sw1', at: '2026-11-04T14:00:00.000Z', book: 20, weighed: 2, by: 'NV B' } }));
    const p = r.result.gate.values[0].prev || {};
    eq([p.stage, p.employeeId, p.op, /Lần ghi trước: NV B/.test(r.result.msgs[0] || '')], ['shift', 'b', 'sw1', true], 'B3 lần ghi gần nhất = cân cuối ca (NV B)');
  }
  // B4. Lệch nhỏ (sổ 19, đếm 20 — dưới 25% định mức) → không hỏi.
  {
    const r = await runWrapped('engine', pre(19, 20, false));
    eq([r.result.msgs.length, r.result.gate.ready], [0, true], 'B4 lệch nhỏ → không hỏi');
  }
  // B5. Thiếu lớn (sổ 20, đếm 2) → hỏi lại: phần thiếu ghi cho BẠN.
  {
    const r = await runWrapped('engine', pre(20, 2, true));
    eq([/THIẾU 18 cái/.test(r.result.msgs[0] || ''), /ghi trách nhiệm giải trình cho BẠN/.test(r.result.msgs[0] || '')], [true, true], 'B5 thiếu: nói rõ phần thiếu ghi cho người bắt đầu mẻ');
  }
  // C1. Bắt đầu mẻ: dư +18 quy Vỹ; A = người phát hiện; dòng ngày 1 đánh dấu nhập sai; báo Quản lý.
  {
    const r = await runWrapped('engine', start(2, 20));
    const t = preRow(r) || {};
    eq([r.error, t.qty, t.responsibleEmployeeId, t.responsibleEmployeeName, t.responsibility && t.responsibility.discoveredById, t.varianceKind, t.previousRecord && t.previousRecord.stage, t.needsReview],
      [null, 18, 'vy', 'Vỹ', 'e1', 'book_understated', 'after', true], 'C1 khoản dư quy NGƯỜI GHI LẦN TRƯỚC (Vỹ), A chỉ phát hiện');
    eq([t.staffEmployeeId, t.responsibilityRole], ['e1', 'người ghi lần trước — sổ ghi thấp hơn thực tế (nhập sai)'], 'C1 người thao tác vẫn là A (vết), vai trò rõ');
    const v = r.fs[TX + '/prep_variance_B1_X'], a = r.fs[TX + '/prep_after_B1_X'];
    eq([v.entryErrorConfirmed, v.entryErrorQty, v.entryErrorCorrectedById, a.entryErrorConfirmed], [true, 18, 'e1', true], 'C1 dòng ngày 1 của Vỹ: đã xác minh nhập sai');
    const al = Object.entries(r.fs).find(([k]) => k.startsWith(AL + '/prep_entry_error_'));
    eq([!!al, al && /Vỹ/.test(al[1].title), al && al[1].markedTxIds.length, al && t.entryErrorAlertId === al[0].split('/')[1]], [true, true, 2, true], 'C1 báo Quản lý (prep_entry_error) + dòng sổ trỏ tới báo');
    eq([r.rt.active_units_gieogieo.X.A.unitBase >= 0, r.fs[INV + '/X'].currentStock], [true, 20 - 0], 'C1 tồn = số đếm (20; mẻ chờ cân sau)');
  }
  // C2. Thiếu so với sổ: giữ như cũ — người bắt đầu mẻ chịu, không đánh dấu ai.
  {
    const r = await runWrapped('engine', start(20, 2));
    const t = preRow(r) || {};
    eq([r.error, t.qty, t.responsibleEmployeeId, t.responsibility, r.fs[TX + '/prep_variance_B1_X'].entryErrorConfirmed, Object.keys(r.fs).some(k => k.startsWith(AL + '/'))],
      [null, -18, 'e1', undefined, undefined, false], 'C2 thiếu: người bắt đầu mẻ giải trình (như cũ), không đánh dấu, không báo');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
