// Engine v18 (01/10/2026, chủ dự án chốt "fix cả 2, chọn A"). Engine thật + Firebase giả + hàm POS thật trích từ HTML.
//  A. Mẻ kẹt ở bước Đối chiếu NL (lỗi loại "báo Quản lý") → nhân viên TỰ CHỐT trên POS theo số cân hiện có
//     (UnitEngine.prep.reconForceSettle): tồn mã = số cân, mẻ dùng ≤ định mức, phần chênh "chưa quy" + Sổ lệch,
//     mở khoá NL, báo Quản lý. Duyệt báo mất không còn gỡ mã đang mở của NL đang chờ cân (nguyên nhân gây kẹt).
//  B. Huỷ mẻ mà hoàn kho chưa xong (lỗi mạng / tắt app sau khi giành lô) → "Hoàn tiếp" làm nốt đúng kế hoạch đã ghi
//     lúc huỷ, không hoàn hai lần, không hoàn nhầm tem đã được mẻ khác dùng lại.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const { extract } = require('./lib/extract');
const FILE = process.env.ENGINE || require('./lib/engine_file');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', CTN = 'stock_containers_gieogieo', PB = 'prep_batches_gieogieo', TX = 'stock_transactions_gieogieo',
  LOCK = 'prep_ingredient_locks_gieogieo', ANOM = 'stock_anomalies_gieogieo', AL = 'alerts_gieogieo', LOST = 'stock_lost_reports_gieogieo';
const T = Date.parse('2026-10-01T08:30:00.000Z');
const STAFF = { id: 'e1', fullName: 'NV A' };
const quiet = { warn() {}, error() {}, info() {}, log() {} };
const clone = v => JSON.parse(JSON.stringify(v));
const initUE = (fake, items) => { fake.FS['duty_config_gieogieo/current'] = { fleetCompliant: true }; const UE = loadEngineModule(FILE);
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-10-01', now: () => T, random: () => 0.5,
    getItems: () => items || [], hooks: { notify() {}, report() {}, fifoChanged: async () => {} }, appFns: { handoverIsOverThreshold: () => false } });
  return UE; };
const rtv = (fake, p) => fake.rtGet('active_units_gieogieo/' + p);

// ── Thế giới A: NL Sữa (X) khoá cho mẻ c1; mã A đang mở (sổ 500); mã V của mẻ đã bị đóng ở luồng khác (báo mất) ──
const ITEMS = [{ id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit' }];
const worldA = (extra) => {
  const w = { rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 500, capacity: 1000, openedAt: 1000 }, __prepLock: { batchId: 'c1', at: '2026-10-01T07:00:00.000Z' } } } },
    fs: {
      [INV + '/X']: { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 500, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] },
      [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 500, baseQty: 1000 },
      [CTN + '/V']: { itemId: 'X', code: 'VVV', status: 'lost', baseQty: 1000 },
      'prep_items_gieogieo/P': { name: 'Cốt', code: 'CT', unit: 'ml', currentStock: 0, batchYield: 800 },
      [PB + '/c1']: { prepId: 'P', prepCode: 'CT', prepName: 'Cốt', unit: 'ml', status: 'cooking', batchRatio: 1, staff: 'NV B', staffEmployeeId: 'eB',
        startedAt: '2026-10-01T07:00:00.000Z', businessDate: '2026-10-01', shelfLifeType: 'endOfDay', reconcileMode: true,
        reconcileInputs: { X: { status: 'pending', expected: 150, unit: 'ml', units: [
          { id: 'A', code: 'AAA', baseline: 500, bookBaseline: 500, heldAtBook: 0, capacity: 1000 },
          { id: 'V', code: 'VVV', baseline: 80, bookBaseline: 80, heldAtBook: 0, capacity: 1000 }] } } },
      [LOCK + '/X']: { batchId: 'c1', at: '2026-10-01T07:00:00.000Z' },
      [AL + '/pos_prep_blocked_c1_X']: { type: 'pos_prep_blocked', status: 'new', message: 'Một mã đã mất khỏi danh sách đang mở — kiểm tra tem trước khi chốt', batchId: 'c1', itemId: 'X' }
    } };
  if (extra) extra(w);
  return w;
};
const posForce = (fake, UE) => {
  const src = extract('posgieo.html', ['prepBlockedAlertId', 'prepReconStuckReason', 'prepForcePrepare', 'prepForceUnitsHTML', 'prepForcePanelHTML',
    'prepForceRerender', 'prepForceRedo', 'prepForceSet', 'prepForceSubmit', 'fmtPrepQty', 'round2']);
  const calls = { toast: [], screen: 0, reopen: 0 };
  const stubs = { fstore: fake.fstore, UnitEngine: UE, toast: m => calls.toast.push(m), escHtmlPos: s => String(s == null ? '' : s), renderPinInput: id => `<pin ${id}>`,
    resolveStaffPinAndCheckin: async () => STAFF, posConfirm: async () => true, setBtnBusy: () => () => {}, refreshFifoAlert: async () => {},
    openPrepBatchScreen: () => { calls.screen++; }, openPrepReconForm: async () => { calls.reopen++; }, openWeighPad: () => {}, prepReconScanExact: async () => true,
    document: { getElementById: () => null }, console: quiet };
  const ks = Object.keys(stubs);
  const api = new Function(...ks, 'const _prepReconStuck = {}; let _prepForce = null; let prepReconForm = {}; let _posSubmitBusy = false;\n' + src +
    '\nreturn { prepReconStuckReason, prepForcePrepare, prepForcePanelHTML, prepForceSet, prepForceSubmit, get force() { return _prepForce; }, get busy() { return _posSubmitBusy; } };')(...ks.map(k => stubs[k]));
  return { api, calls };
};

(async () => {
  // A0. Dựng lại lỗi: mã V của mẻ đã đóng ở luồng khác → mọi đường chốt thường báo "Quản lý" → mẻ kẹt.
  {
    const fake = makeFake(worldA()); const UE = initUE(fake, ITEMS);
    let kind = '';
    try { await UE.prep.reconRebase('c1', 'X'); } catch (e) { kind = e.kind || ''; }
    eq(kind, 'manager', 'dựng lại lỗi: mã của mẻ đã đóng ở luồng khác → nạp lại mốc báo "Quản lý" (mẻ kẹt, trước đây không có lối ra)');
  }
  // A1. Duyệt báo mất không gỡ mã đang mở của NL đang chờ cân (nguyên nhân gây kẹt).
  {
    const fake = makeFake(worldA(w => { w.fs[LOST + '/r1'] = { containerId: 'A', code: 'AAA', itemId: 'X', status: 'pending_review', reportedBy: 'NV C' }; }));
    const UE = initUE(fake, ITEMS);
    let msg = '';
    try { await UE.lifecycle.approveLostReports('X', 'cnt1', ['AAA']); } catch (e) { msg = e.message; }
    eq([/chốt mẻ/.test(msg), !!rtv(fake, 'X/A'), fake.FS[LOST + '/r1'].status, fake.FS[CTN + '/A'].status], [true, true, 'pending_review', 'open'],
      'duyệt báo mất khi NL đang chờ cân của mẻ: không gỡ mã đang mở, phiếu giữ nguyên chờ, báo chốt mẻ rồi duyệt lại');
  }
  // A2. Tự chốt trên POS — có bán xen giữa lúc cân và lúc chốt.
  {
    const fake = makeFake(worldA()); const UE = initUE(fake, ITEMS);
    const { api, calls } = posForce(fake, UE);
    const row = clone(fake.FS[PB + '/c1'].reconcileInputs.X);
    const msg = await api.prepReconStuckReason('c1', 'X', row);
    eq(/mất khỏi danh sách/.test(msg), true, 'màn đối chiếu nhận ra NL đang kẹt (cảnh báo kẹt còn mở trên máy chủ)');
    const live = await UE.prep.reconReadUnits('X');
    api.prepForcePrepare(msg, { batchId: 'c1', itemId: 'X', it: { name: 'Sữa', unit: 'ml' }, b: { prepName: 'Cốt' }, row, live, finishedUnits: new Map(), countable: false });
    const html0 = api.prepForcePanelHTML();
    eq([html0.includes('Chốt theo số cân hiện có'), html0.includes('mã VVV — không còn mở'), /id="prepForceBtn"[^>]*disabled/.test(html0)], [true, true, true],
      'khối tự chốt: liệt kê mã đang mở cần cân, mã đã mất; nút khoá tới khi cân đủ');
    await api.prepForceSet(0, 300, [{ net: 300 }], false);
    eq([api.force.units[0].qty, api.force.units[0].held], [300, 0], 'cân mã A = 300, chụp bộ đếm bán lúc cân');
    // Bán 20 ml trong lúc NL đang khoá, SAU lúc cân (allocator trừ tồn + tăng saleHeld).
    const a = rtv(fake, 'X/A'); await fake.db.ref('active_units_gieogieo/X/A').set({ ...a, unitBase: 480, saleHeld: 20 });
    await api.prepForceSubmit();
    const lo = fake.FS[PB + '/c1'], rx = lo.reconcileInputs.X;
    eq([rtv(fake, 'X/A').unitBase, rtv(fake, 'X/__prepLock') == null, fake.FS[LOCK + '/X'] === undefined, fake.FS[INV + '/X'].currentStock],
      [280, true, true, 280], 'tồn mã = số cân − phần bán sau lúc cân (280), mở khoá NL, tồn NL = tổng mã');
    const u = fake.FS[TX + '/prep_after_c1_X'], v = fake.FS[TX + '/prep_variance_c1_X'];
    eq([u && u.type, u && u.qty, u && u.forcedSettle, u && u.prepRecon, v && v.type, v && v.qty, v && v.responsibility.employeeId, v && v.responsibility.status, v && (v.staffEmployeeId || '')],
      ['CONSUMPTION', -150, true, true, 'ADJUSTMENT', -50, '', 'unassigned', ''],
      'mẻ dùng 200 (500→300): tiêu hao 150 (định mức) + chênh 50 "chưa quy" — không đổ cho người bấm chốt');
    const an = fake.FS[ANOM + '/prep_force_c1_X'];
    eq([an && an.kind, an && an.qty, an && /VVV/.test(an.note)], ['prep_force_settle', -50, true], 'Sổ lệch: phần chênh + mã không cân được');
    eq([rx.status, rx.actualQty, rx.forced.by, rx.forced.vanished.map(x => x.code), rx.submitted.map(s => [s.id, s.baseline, s.after]), lo.inputTrace.X.reconciled, lo.inputTrace.X.forced],
      ['done', 150, 'NV A', ['VVV'], [['A', 480, 280]], true, true], 'NL của mẻ đóng (done, forced) kèm vết người chốt, mã mất, số cân');
    eq([fake.FS[AL + '/pos_prep_blocked_c1_X'].status, fake.FS[AL + '/prep_force_c1_X'] && fake.FS[AL + '/prep_force_c1_X'].type, api.force, calls.screen, api.busy],
      ['resolved', 'pos_auto_report', null, 1, false], 'cảnh báo kẹt → đã xử lý; báo Quản lý việc tự chốt; về màn Nấu chế biến');
    // Hết kẹt: mẻ hoàn thành được; NL nhận mẻ mới.
    const fin = await UE.prep.finishBatch({ id: 'c1', ...fake.FS[PB + '/c1'] }, { qty: 700, batchCode: 'CT-1', expiresAt: null, inputCost: 0, weighLines: [],
      staffEmp: STAFF, sug: 800, lechPct: -12.5, finishedAt: '2026-10-01T09:00:00.000Z' });
    await UE.prep.reconAcquire('c2', [{ itemId: 'X', item: { name: 'Sữa' } }]);
    eq([fin.status, fake.FS[PB + '/c1'].status, rtv(fake, 'X/__prepLock') && rtv(fake, 'X/__prepLock').batchId], ['ok', 'active', 'c2'], 'mẻ hết kẹt: Hoàn thành được; mẻ mới giành được NL');
    // Gọi lại tự chốt → không ghi gì thêm.
    const before = JSON.stringify([fake.FS[TX + '/prep_after_c1_X'], fake.FS[TX + '/prep_variance_c1_X'], rtv(fake, 'X/A').unitBase]);
    const again = await UE.prep.reconForceSettle('c1', 'X', { staffEmp: STAFF, units: [{ unitId: 'A', qty: 1 }] });
    eq([again.already, JSON.stringify([fake.FS[TX + '/prep_after_c1_X'], fake.FS[TX + '/prep_variance_c1_X'], rtv(fake, 'X/A').unitBase]) === before], [true, true], 'chạy lại tự chốt: không ghi lần hai');
  }
  // A3. Đã có dòng sổ từ lượt chốt dở → không ghi thêm dòng sổ (tránh tính trùng), toàn bộ phần giảm vào Sổ lệch.
  {
    const fake = makeFake(worldA(w => { w.fs[TX + '/prep_after_c1_X'] = { itemId: 'X', type: 'CONSUMPTION', qty: -120, referenceId: 'c1', prepRecon: true }; }));
    const UE = initUE(fake, ITEMS);
    const kq = await UE.prep.reconForceSettle('c1', 'X', { staffEmp: STAFF, units: [{ unitId: 'A', qty: 300, heldAt: 0 }] });
    const an = fake.FS[ANOM + '/prep_force_c1_X'];
    eq([kq.priorLines, fake.FS[TX + '/prep_after_c1_X'].qty, fake.FS[TX + '/prep_variance_c1_X'] === undefined, an && an.qty, an && /trùng/.test(an.note), rtv(fake, 'X/A').unitBase, fake.FS[PB + '/c1'].reconcileInputs.X.status],
      [true, -120, true, -200, true, 300, 'done'], 'lượt chốt dở đã ghi sổ: giữ nguyên dòng cũ, phần giảm 200 vào Sổ lệch (có thể trùng), tồn mã = số cân');
  }
  // A4. Còn mã đang mở chưa cân → không ghi gì; NL khoá cho mẻ khác → từ chối.
  {
    const fake = makeFake(worldA(w => { w.rt.active_units_gieogieo.X.B = { code: 'BBB', unitBase: 1000, capacity: 1000, openedAt: 2000 }; }));
    const UE = initUE(fake, ITEMS);
    let code = '';
    try { await UE.prep.reconForceSettle('c1', 'X', { staffEmp: STAFF, units: [{ unitId: 'A', qty: 300 }] }); } catch (e) { code = e.code || e.message; }
    eq([code, rtv(fake, 'X/A').unitBase, fake.FS[PB + '/c1'].reconcileInputs.X.status], ['PREP_FORCE_UNWEIGHED', 500, 'pending'], 'còn mã đang mở chưa cân: dừng, không ghi gì');
    const fake2 = makeFake(worldA(w => { w.fs[LOCK + '/X'] = { batchId: 'c9' }; w.rt.active_units_gieogieo.X.__prepLock = { batchId: 'c9' }; }));
    const UE2 = initUE(fake2, ITEMS);
    let m2 = '';
    try { await UE2.prep.reconForceSettle('c1', 'X', { staffEmp: STAFF, units: [{ unitId: 'A', qty: 300 }] }); } catch (e) { m2 = e.message; }
    eq([/mẻ khác/.test(m2), rtv(fake2, 'X/A').unitBase], [true, 500], 'NL đang khoá cho mẻ khác: từ chối, không ghi đè tồn');
  }
  // A5. Huỷ mẻ sau khi tự chốt: "Không thể hoàn trả" sửa đúng 2 dòng sổ của lượt tự chốt thành hao hụt.
  {
    const fake = makeFake(worldA()); const UE = initUE(fake, ITEMS);
    await UE.prep.reconForceSettle('c1', 'X', { staffEmp: STAFF, units: [{ unitId: 'A', qty: 300, heldAt: 0 }] });
    await UE.prep.claimCancel('c1', { cancelledAt: '2026-10-01T09:00:00.000Z', reason: 'khét', staffEmp: STAFF, plan: { reason: 'khét', recon: [{ itemId: 'X', answer: 'khong_tra', returns: [] }] } });
    const kq = await UE.prep.cancelSettleRecon('c1', 'X', { answer: 'khong_tra', staffEmp: STAFF, batchName: 'Cốt', reason: 'khét', returns: [] });
    eq([kq.lost, fake.FS[TX + '/prep_after_c1_X'].type, fake.FS[TX + '/prep_after_c1_X'].qty], [200, 'WASTE', -150], 'huỷ mẻ sau tự chốt: toàn bộ 200 đã lấy thành hao hụt (150 dòng mẻ → WASTE, 50 chênh giữ nguyên)');
  }

  // ── Thế giới B: Huỷ mẻ c1 đã trừ 150 ml Sữa (mã A) + 1 tem Kit đã quét ──
  const ITEMS_B = [{ id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit' }, { id: 'K', name: 'Kit', unit: 'cái', trackingMode: 'unit' }];
  const worldB = (extra) => {
    const w = { rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 350, capacity: 1000, openedAt: 1000 } } } },
      fs: {
        [INV + '/X']: { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 350, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] },
        [INV + '/K']: { name: 'Kit', unit: 'cái', trackingMode: 'unit', currentStock: 0, countUnitName: 'Cái', packagingUnits: [{ name: 'Cái', baseQty: 1 }] },
        [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 350, baseQty: 1000 },
        [CTN + '/k1']: { itemId: 'K', code: 'KK1', status: 'finished', finishedFromStatus: 'sealed', baseQty: 1 },
        [PB + '/c1']: { prepId: 'P', prepCode: 'CT', prepName: 'Cốt', unit: 'ml', status: 'cooking', batchRatio: 1, atomicScannedContainerIds: ['k1'], startedAt: '2026-10-01T07:00:00.000Z' },
        [TX + '/cs1']: { itemId: 'X', type: 'CONSUMPTION', qty: -150, referenceId: 'c1', fifoAllocations: [{ containerId: 'A', qty: 150 }] },
        [TX + '/cs2']: { itemId: 'K', type: 'CONSUMPTION', qty: -1, referenceId: 'c1', atomicScanned: true }
      } };
    if (extra) extra(w);
    return w;
  };
  const posCancel = (fake, UE) => {
    const src = extract('posgieo.html', ['loadPrepBatchesPOS', '_loadBatchConsumptionTxPOS', '_runPrepCancelSettle', 'retryPrepCancelSettle', 'fmtPrepQty']);
    const calls = { toast: [], render: 0 };
    const stubs = { fstore: fake.fstore, UnitEngine: UE, toast: m => calls.toast.push(m), setBtnBusy: () => () => {}, refreshFifoAlert: async () => {},
      renderPrepBatchForm: () => { calls.render++; }, console: quiet };
    const ks = Object.keys(stubs);
    const api = new Function(...ks, 'let PREP_BATCHES_CACHE_POS = []; let _prepBatchesLoadError = null; let _posSubmitBusy = false;\n' + src +
      '\nreturn { loadPrepBatchesPOS, _runPrepCancelSettle, retryPrepCancelSettle, _loadBatchConsumptionTxPOS, get cache() { return PREP_BATCHES_CACHE_POS; }, get busy() { return _posSubmitBusy; } };')(...ks.map(k => stubs[k]));
    return { api, calls };
  };
  const PLAN = { reason: 'khét', staffName: 'NV A', staffId: 'e1', recon: [] };
  const claim = (UE, plan) => UE.prep.claimCancel('c1', { cancelledAt: '2026-10-01T09:00:00.000Z', reason: 'khét', staffEmp: STAFF, plan: plan || PLAN });
  // B1. App tắt ngay sau khi giành lô (chưa hoàn gì) → mẻ hiện "Hoàn tiếp" → làm nốt đúng một lần.
  {
    const fake = makeFake(worldB()); const UE = initUE(fake, ITEMS_B);
    await claim(UE);
    eq([fake.FS[PB + '/c1'].status, fake.FS[PB + '/c1'].cancelSettled, fake.FS[PB + '/c1'].cancelPlan.reason], ['cancelled', false, 'khét'],
      'giành lô huỷ ghi luôn kế hoạch + cờ "chưa hoàn xong" trong cùng transaction');
    const { api, calls } = posCancel(fake, UE);
    await api.loadPrepBatchesPOS();
    eq(api.cache.some(b => b.id === 'c1' && b.status === 'cancelled' && b.cancelSettled === false), true, 'màn Nấu chế biến nạp mẻ huỷ chưa hoàn xong (thẻ "Hoàn tiếp")');
    await api.retryPrepCancelSettle('c1');
    eq([rtv(fake, 'X/A').unitBase, fake.FS[CTN + '/k1'].status, fake.FS[PB + '/c1'].cancelSettled, !!fake.FS[TX + '/reversal_c1_ing_X'], /hoàn xong/.test(calls.toast.join(' ')), api.busy],
      [500, 'sealed', true, true, true, false], 'Hoàn tiếp: Sữa hoàn 150 vào mã A, tem Kit về chưa mở, mẻ hết "chưa hoàn xong"');
    await api.retryPrepCancelSettle('c1');
    eq([rtv(fake, 'X/A').unitBase, fake.FS[INV + '/X'].currentStock], [500, 500], 'bấm lại khi đã xong: không hoàn lần hai');
    // B3. Tem Kit được mẻ khác dùng lại sau đó → lượt hoàn (nếu chạy lại) không trả nhầm tem của mẻ khác.
    fake.FS[CTN + '/k1'].status = 'finished'; fake.FS[CTN + '/k1'].finishedFromStatus = 'sealed';
    fake.FS[PB + '/c1'].cancelSettled = false;
    await api.retryPrepCancelSettle('c1');
    eq([fake.FS[CTN + '/k1'].status, fake.FS[PB + '/c1'].cancelSettled, rtv(fake, 'X/A').unitBase], ['finished', true, 500], 'tem đã hoàn cho mẻ này rồi được mẻ khác dùng lại: không hoàn lần nữa');
  }
  // B2. Lượt huỷ đầu: mã A đã được cộng lại nhưng dòng hoàn trong sổ lỗi mạng → còn "chưa hoàn xong" → Hoàn tiếp không cộng mã lần hai.
  {
    const fake = makeFake(worldB()); const UE = initUE(fake, ITEMS_B);
    const st = { on: true };
    const orig = fake.fstore.runTransaction.bind(fake.fstore);
    fake.fstore.runTransaction = fn => orig(async t => { const t2 = Object.create(t);
      t2.set = (r, ...a) => { if (st.on && /reversal_c1_ing_X$/.test(String(r.path))) { st.on = false; throw new Error('mất mạng'); } return t.set(r, ...a); }; return fn(t2); });
    await claim(UE);
    const { api, calls } = posCancel(fake, UE);
    const b = { id: 'c1', ...clone(fake.FS[PB + '/c1']) };
    const txs = await api._loadBatchConsumptionTxPOS('c1');
    const r1 = await api._runPrepCancelSettle(b, { txs, plan: PLAN, staffEmp: STAFF, note: 'Hoàn kho do HUỶ MẺ Cốt (CT) — khét', reason: 'khét', retry: false });
    eq([r1.failed, r1.allOk, fake.FS[PB + '/c1'].cancelSettled, rtv(fake, 'X/A').unitBase, !!fake.FS[TX + '/reversal_c1_ing_X']], [1, false, false, 500, false],
      'dựng lại lỗi: mã A đã cộng lại nhưng dòng hoàn chưa ghi → mẻ còn "chưa hoàn xong" (trước đây không còn nút nào)');
    await api.retryPrepCancelSettle('c1');
    eq([rtv(fake, 'X/A').unitBase, !!fake.FS[TX + '/reversal_c1_ing_X'], fake.FS[PB + '/c1'].cancelSettled, /hoàn xong/.test(calls.toast.join(' '))], [500, true, true, true],
      'Hoàn tiếp: ghi nốt dòng hoàn, mã A KHÔNG bị cộng lần hai (vẫn 500)');
  }
  // B4. NL đã cân đối chiếu, "Đã hoàn trả" vào mã Z — Z đã đóng ở luồng khác: lượt đầu lỗi; Hoàn tiếp bỏ qua Z (thành hao hụt), xong mẻ.
  {
    const fake = makeFake(worldB(w => { w.fs[TX + '/prep_after_c1_X'] = { itemId: 'X', type: 'CONSUMPTION', qty: -100, referenceId: 'c1', prepRecon: true }; }));
    const UE = initUE(fake, ITEMS_B);
    const plan = { ...PLAN, recon: [{ itemId: 'X', itemName: 'Sữa', unit: 'ml', answer: 'da_tra', taken: 100, returns: [{ unitId: 'Z', code: 'ZZZ', returned: 40 }] }] };
    await claim(UE, plan);
    const { api, calls } = posCancel(fake, UE);
    const b = { id: 'c1', ...clone(fake.FS[PB + '/c1']) };
    const r1 = await api._runPrepCancelSettle(b, { txs: await api._loadBatchConsumptionTxPOS('c1'), plan, staffEmp: STAFF, note: 'n', reason: 'khét', retry: false });
    eq([r1.reconFail, fake.FS[PB + '/c1'].cancelSettled], [1, false], 'lượt huỷ đầu: mã nhận NL trả lại đã đóng → lỗi, mẻ còn "chưa hoàn xong"');
    await api.retryPrepCancelSettle('c1');
    const pa = fake.FS[TX + '/prep_after_c1_X'];
    eq([fake.FS[PB + '/c1'].cancelSettled, pa.type, pa.qty, /ZZZ không còn mở/.test(calls.toast.join(' '))], [true, 'WASTE', -100, true],
      'Hoàn tiếp: bỏ qua mã đã đóng — phần NL đó thành hao hụt, mẻ hoàn xong');
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.stack || e); process.exit(1); });
