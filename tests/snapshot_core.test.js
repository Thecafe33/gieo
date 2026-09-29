// Test ẢNH CHỤP HÀNH VI của lõi Unit Engine (E0 — mục 7 kế hoạch, bảng 5.1).
// Mỗi kịch bản chạy trên Firebase giả (đồng hồ giả + ngẫu nhiên cố định), ghi lại trạng thái RT +
// Firestore đã chuẩn hoá, thứ tự lượt ghi, hook giao diện đã gọi và giá trị trả về.
//   - Chưa có tests/snapshots/core.json → chạy trên bản trong posgieo.html và TẠO ảnh chụp.
//   - Đã có → chạy trên unit_engine.v1.js (nếu có, không thì posgieo.html) và SO với ảnh chụp.
//   CORE=html|engine để ép nguồn; UPDATE=1 để ghi đè ảnh chụp (chỉ khi cố ý đổi hành vi).
'use strict';
const fs = require('fs');
const path = require('path');
const { makeFake, normalize, dropStore, storeGaps, markFirstCall } = require('./lib/fakefb');
const { loadCore } = require('./lib/core_loader');

const SNAP = path.join(__dirname, 'snapshots', 'core.json');
const hasEngine = fs.existsSync(path.join(__dirname, '..', 'unit_engine.v1.js'));
const kind = process.env.CORE || (hasEngine ? 'engine' : 'html');
const C = 'stock_containers_gieogieo', PB = 'prep_batches_gieogieo', INV = 'inventory_items_gieogieo', PI = 'prep_items_gieogieo';
const ITEM = { id: 'X', name: 'Sữa', unit: 'ml', trackingMode: 'unit', countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] };
const ATOM = { id: 'K', name: 'Kit', unit: 'cái', trackingMode: 'unit', countUnitName: 'Cái', packagingUnits: [{ name: 'Cái', baseQty: 1 }] };
const NOTEM = { id: 'N', name: 'Nước', unit: 'ml', trackingMode: 'none' };
const PREP = { id: 'P', name: 'Cốt trà', unit: 'ml' };
const RULE = { itemId: 'X', sourceLocationId: 'kho', destLocationId: 'quay', destLocationName: 'Quầy' };
const u = (code, unitBase, openedAt, extra) => ({ code, itemName: 'Sữa', unit: 'ml', unitBase, capacity: 1000, openedAt, ...extra });
const staff = { fullName: 'NV A', id: 'e1' };

const S = {};   // tên → async (F, fake, env) => kết quả
// ── FIFO ──
S.A1_fifo_cu_truoc = async F => F.unitEngineAllocateConsumption('X', 150, undefined, { type: 'order', id: 'o1', businessDate: '2026-09-28' });
S.A2_can_het_no_tem_moi_nhat = async F => F.unitEngineAllocateConsumption('X', 450);
S.A3_bo_qua_discard_va_lock = async (F, fake) => { fake.db.ref('active_units_gieogieo/X/B').update({ discardPending: true }); fake.db.ref('active_units_gieogieo/X/__prepLock').set({ batchId: 'mb1' }); return F.unitEngineAllocateConsumption('X', 50, undefined, { type: 'prep', id: 'mb1' }); };
S.A4_khoa_me_khac = async (F, fake) => { await fake.db.ref('active_units_gieogieo/X/__prepLock').set({ batchId: 'mb9' }); return F.unitEngineAllocateConsumption('X', 50, undefined, { type: 'order', id: 'o2' }); };
S.A5_khong_tem_mo = async F => F.unitEngineAllocateConsumption('Z', 30);
S.A6_loi_rtdb = async (F, fake) => { fake.RT.failTxNext = new Error('offline'); return F.unitEngineAllocateConsumption('X', 30); };
S.A7_btp_qtyRemaining = async F => F.unitEngineAllocateConsumption('P', 700, PB, { type: 'order', id: 'o3' });
// ── Mở tem ──
S.O1_mo_hap_thu_no = async (F, fake) => {
  await fake.db.ref('active_units_gieogieo/X/A').update({ unitBase: -120 });
  await fake.db.ref('active_units_gieogieo/X/B').update({ unitBase: -30, finishedDebt: true });
  return F.unitEngineOnOpen('C3', { itemId: 'X', code: 'CCC', itemName: 'Sữa', unit: 'ml', baseQty: 1000 });
};
S.O2_mo_trung = async F => F.unitEngineOnOpen('A', { itemId: 'X', code: 'AAA', baseQty: 1000 });
S.O3_btp_khong_hap_thu = async (F, fake) => { await fake.db.ref('active_units_gieogieo/P/b1').update({ unitBase: -50 }); return F.unitEngineOnOpen('b3', { itemId: 'P', code: 'L3', baseQty: 800 }, PB); };
S.O4_mo_loi_rt = async (F, fake) => { let n = 0; const orig = fake.db.ref; fake.db.ref = p => { const r = orig(p); const t = r.transaction; r.transaction = async fn => { n++; throw new Error('net'); }; return r; }; const res = await F.unitEngineOnOpen('C4', { itemId: 'X', code: 'DDD', baseQty: 1000 }); fake.db.ref = orig; return [res, n]; };
// ── Báo hết ──
S.F1_bao_het_du = async (F, fake) => F.unitEngineFinishOpenUnit('A', { itemId: 'X', code: 'AAA', unit: 'ml', baseQty: 1000, unitBase: 100 }, { fullName: 'NV A', id: 'e1' }, 'het', true, fake.fstore.collection(C).doc('A'));
S.F2_bao_het_am = async (F, fake) => { await fake.db.ref('active_units_gieogieo/X/A').update({ unitBase: -40 }); return F.unitEngineFinishOpenUnit('A', { itemId: 'X', code: 'AAA', unit: 'ml', baseQty: 1000 }, staff, 'het', false, fake.fstore.collection(C).doc('A')); };
S.F3_bao_het_trong_me = async (F, fake) => F.unitEngineFinishOpenUnit('B', { itemId: 'X', code: 'BBB', baseQty: 1000 }, staff, 'het', true, fake.fstore.collection(C).doc('B'), 'mb1', true);
S.F4_bao_het_loi_rt = async (F, fake) => { fake.RT.failNext = new Error('net'); return F.unitEngineFinishOpenUnit('A', { itemId: 'X', code: 'AAA', baseQty: 1000 }, staff, 'het', true, fake.fstore.collection(C).doc('A')); };
// ── Hoàn ──
S.R1_hoan_dung_tem = async F => F.unitEngineReverseAllocations('X', [{ containerId: 'A', qty: 30 }, { containerId: 'B', qty: 20 }]);
S.R2_tem_goc_roi_ve_cu_nhat = async F => F.unitEngineReverseAllocations('X', [{ containerId: 'GONE', qty: 25 }]);
S.R3_khong_tem_mo = async F => F.unitEngineReverseAllocations('Z', [{ containerId: 'Q', qty: 10 }]);
S.R4_khoa_me = async (F, fake) => { await fake.db.ref('active_units_gieogieo/X/__prepLock').set({ batchId: 'mb1' }); return F.unitEngineReverseAllocations('X', [{ containerId: 'A', qty: 5 }]); };
S.R5_claim_chong_dup = async F => [await F._ueClaimedReverseAllocations('cl1', 'X', [{ containerId: 'A', qty: 10 }]), await F._ueClaimedReverseAllocations('cl1', 'X', [{ containerId: 'A', qty: 10 }])];
S.R6_claim_cu_gianh_lai = async (F, fake) => { await fake.fstore.collection('reversal_unit_claims_gieogieo').doc('cl2').set({ status: 'claiming', claimedAt: 1000 }); return F._ueClaimedReverseAllocations('cl2', 'X', [{ containerId: 'A', qty: 7 }]); };
S.R7_claim_dang_chay = async (F, fake) => { await fake.fstore.collection('reversal_unit_claims_gieogieo').doc('cl3').set({ status: 'claiming' }); return F._ueClaimedReverseAllocations('cl3', 'X', [{ containerId: 'A', qty: 7 }]); };
S.R8_claim_loi_giao_dich = async (F, fake) => { fake.fstore._ctl.failNext = new Error('offline'); return F._ueClaimedReverseAllocations('cl4', 'X', [{ containerId: 'A', qty: 7 }]); };
// ── Suy tồn ──
S.T1_suy_ton_nl = async (F, fake) => {
  await fake.fstore.collection(C).doc('ORPH').set({ itemId: 'X', status: 'open', unitBase: 55 });
  await fake.fstore.collection(C).doc('B').update({ _ueRtStale: true, unitBase: 333 });
  return F._ueRecomputeCurrentStock('X');
};
S.T2_suy_ton_btp = async (F, fake) => { await fake.db.ref('active_units_gieogieo/P/b2').update({ unitBase: -80 }); await fake.fstore.collection(PI).doc('P').update({ untrackedPendingDelta: -15 }); return F._ueRecomputeCurrentStock('P', PB); };
S.T3_moc_chan_luot_cu = async (F, fake) => { await fake.fstore.collection(INV).doc('X').update({ _ueLastRecomputeStart: 9e12, currentStock: 7 }); return F._ueRecomputeCurrentStock('X'); };
// ── Khoá mẻ / ghi tuyệt đối ──
S.L1_giu_nha_khoa = async (F, fake) => { const rows = [{ itemId: 'X', item: ITEM }]; await F.prepReconAcquire('mb1', rows); const mid = [fake.rtGet('active_units_gieogieo/X/__prepLock'), fake.FS['prep_ingredient_locks_gieogieo/X']]; await F.prepReconRelease('mb1', ['X']); return mid; };
S.L2_khoa_xung_dot = async (F, fake) => { await fake.db.ref('active_units_gieogieo/X/__prepLock').set({ batchId: 'mb9', at: new fake.clock.Date().toISOString() }); await fake.fstore.collection(PB).doc('mb9').set({ status: 'cooking', reconcileInputs: { X: { status: 'pending' } } }); return F.prepReconAcquire('mb1', [{ itemId: 'X', item: ITEM }]); };
S.L3_thu_hoi_khoa_mo_coi = async (F, fake) => { await fake.db.ref('active_units_gieogieo/X/__prepLock').set({ batchId: 'mbX', at: '2020-01-01T00:00:00.000Z' }); await F.prepReconRecoverOrphan('X'); return fake.rtGet('active_units_gieogieo/X/__prepLock') || null; };
S.L4_assert_free = async (F, fake) => { await fake.fstore.collection('prep_ingredient_locks_gieogieo').doc('X').set({ batchId: 'mb9' }); return F.prepReconAssertFree('X', 'mb1'); };
S.W1_set_unit = async (F, fake) => { await F.prepReconAcquire('mb1', [{ itemId: 'X', item: ITEM }]); const a = await F.prepReconSetUnit('X', 'A', 80, 'op1', 100, { batchId: 'mb1' }); const b = await F.prepReconSetUnit('X', 'A', 80, 'op1', 100, { batchId: 'mb1' }); return [a, b]; };
S.W2_set_unit_sai_moc = async (F, fake) => { await F.prepReconAcquire('mb1', [{ itemId: 'X', item: ITEM }]); return F.prepReconSetUnit('X', 'A', 250, 'op2', 999, { batchId: 'mb1' }); };
// ── BTP bán ──
S.P1_ban_btp = async F => F.applyPrepConsumptionPOS('P', 300, 'Bán', 'o5', '2026-09-28', 'sales_o5_P');
S.P2_ban_btp_goi_lai = async F => [await F.applyPrepConsumptionPOS('P', 300, 'Bán', 'o5', '2026-09-28', 'sales_o5_P'), await F.applyPrepConsumptionPOS('P', 300, 'Bán', 'o5', '2026-09-28', 'sales_o5_P')];
S.P3_ban_btp_chua_lo = async F => F.applyPrepConsumptionPOS('Q', 40, 'Bán', 'o6', '2026-09-28', 'sales_o6_Q');
// ── Sổ kho (E2) ──
S.K1_waste_tem = async F => F.applyStockTransactionPOS({ itemId: 'X', type: 'WASTE', qty: -40, note: 'đổ', staff: 'NV A', staffEmployeeId: 'e1' });
S.K2_consumption_ngoai_tem = async F => F.applyStockTransactionPOS({ itemId: 'X', type: 'CONSUMPTION', qty: -1200, txId: 'sales_o7_X', referenceId: 'o7' });
S.K3_receiving_goi_lai = async F => [await F.applyStockTransactionPOS({ itemId: 'X', type: 'RECEIVING', qty: 2000, txId: 'recv_1' }), await F.applyStockTransactionPOS({ itemId: 'X', type: 'RECEIVING', qty: 2000, txId: 'recv_1' })];
S.K4_measured_adjust = async F => F.applyStockTransactionPOS({ itemId: 'X', type: 'ADJUSTMENT', qty: 30, measured: true, deriveFromUnits: true, txId: 'sw_1' });
S.K5_khong_quan_kho = async (F, fake) => { await fake.fstore.collection(INV).doc('N').update({ stockManaged: false }); return F.applyStockTransactionPOS({ itemId: 'N', type: 'CONSUMPTION', qty: -10 }); };
S.K6_atomic_unscanned = async F => F.applyStockTransactionPOS({ itemId: 'K', type: 'CONSUMPTION', qty: -1, referenceId: 'o8' });
S.K7_transfer = async F => [await F.applyStockTransferPOS({ itemId: 'X', fromLocationId: 'kho', toLocationId: 'quay', qty: 1500, txId: 'rf1' }), await F.applyStockTransferPOS({ itemId: 'X', fromLocationId: 'kho', toLocationId: 'quay', qty: 1500, txId: 'rf1' })];
S.K8_loc_set = async F => F.setLocationStockFromCountPOS('X', 'quay', 420, 'NV A');
S.K9_so_lech = async F => F.logStockAnomalyPOS('an1', { itemId: 'X', qty: -5, kind: 'no_open_tem' });
// ── Nhận hàng / mã ──
S.N1_sinh_tem = async F => F.createContainersForReceipt({ item: ITEM, qtyBase: 2500, staff: 'NV A', staffEmployeeId: 'e1', refId: 'po1', idPrefix: 'po1_X' });
S.N2_sinh_tem_goi_lai = async F => [(await F.createContainersForReceipt({ item: ITEM, qtyBase: 2000, idPrefix: 'po2_X' })).length, (await F.createContainersForReceipt({ item: ITEM, qtyBase: 2000, idPrefix: 'po2_X' })).map(x => x.id)];
S.N3_qua_60_tem = async F => F.createContainersForReceipt({ item: { ...ITEM, packagingUnits: [{ name: 'Hộp', baseQty: 10 }] }, qtyBase: 700 });
S.N4_chua_khai_quy_cach = async F => F.createContainersForReceipt({ item: { ...ITEM, countUnitName: '' }, qtyBase: 700, idPrefix: 'po4' });
S.N5_tra_ma = async (F, fake) => { await fake.fstore.collection(C).doc('D1').set({ code: 'DUPE', status: 'sealed' }); await fake.fstore.collection(C).doc('D2').set({ code: 'DUPE', status: 'open' }); return [await F.findContainerByCode('dupe'), await F.findContainerByCode('AAA'), await F.findContainerByCode('none')]; };
S.N6_ds_tem_mo = async F => (await F.loadOpenContainers()).map(x => x.id);
S.N7_ma_lo = async F => [await F.genPrepBatchCode({ id: 'P' }), await F.genStockContainerCode('X')];
// ── Xoá bill → hoàn kho (E3: POS và Quản lý dùng chung) ──
const seedOrder = async (fake, id, extra) => {
  const f = fake.fstore;
  await f.collection('stock_transactions_gieogieo').doc('sales_' + id + '_X').set({ itemId: 'X', type: 'CONSUMPTION', qty: -150, referenceId: id, fifoAllocations: [{ containerId: 'A', qty: 100 }, { containerId: extra && extra.gone ? 'GONE' : 'B', qty: 50 }], locDeducted: 150, locDeductedAt: 'quay' });
  await f.collection('prep_transactions_gieogieo').doc('sales_' + id + '_P').set({ prepId: 'P', type: 'CONSUMPTION', qty: -300, referenceId: id, unitAllocations: [{ containerId: 'b1', qty: 300 }] });
  await f.collection('stock_transactions_gieogieo').doc('sales_' + id + '_N').set({ itemId: 'N', type: 'CONSUMPTION', qty: -20, referenceId: id });
};
S.V1_xoa_bill_hai_lan = async (F, fake) => { await seedOrder(fake, 'o9'); return [await F.reverseSalesConsumptionPOS({ billCode: 'B9' }, 'o9'), await F.reverseSalesConsumptionPOS({ billCode: 'B9' }, 'o9')]; };
S.V2_tem_goc_roi = async (F, fake) => { await seedOrder(fake, 'o10', { gone: true }); return F.reverseSalesConsumptionPOS({ billCode: 'B10' }, 'o10'); };
S.V3_bill_bo_sung = async (F, fake) => { await fake.fstore.collection('stock_transactions_gieogieo').doc('bf_o11_X').set({ itemId: 'X', type: 'CONSUMPTION', qty: -10, referenceId: 'o11', backfillNoStockEffect: true }); return F._voidBackfillConsumptionPOS('o11'); };
S.V4_hoan_mot_phan_truoc = async (F, fake) => { await seedOrder(fake, 'o12'); await fake.fstore.collection('stock_transactions_gieogieo').doc('rev_part_o12').set({ itemId: 'X', type: 'CONSUMPTION', qty: 40, reversal: true, referenceId: 'o12', reversedAllocations: [{ containerId: 'A', qty: 40 }] }); return F.reverseSalesConsumptionPOS({ billCode: 'B12' }, 'o12'); };
S.N8_phan_loai = async F => [F.isTemTrackedNL(ITEM), F.isTemTrackedNL(NOTEM), F.isAtomicUnitItem(ATOM), F.isAtomicUnitItem(ITEM), F.missingUnitsWarning(-2500, 1000), F._ueComputeAllocation([{ id: 'a', unitBase: 5, openedAt: 2 }, { id: 'b', unitBase: 5, openedAt: 1 }], 12)];

function seed() {
  return {
    rt: { active_units_gieogieo: {
      X: { A: u('AAA', 100, 1000), B: u('BBB', 300, 2000) },
      P: { b1: { code: 'L1', itemName: 'Cốt trà', unit: 'ml', unitBase: 400, capacity: 800, openedAt: 500 }, b2: { code: 'L2', itemName: 'Cốt trà', unit: 'ml', unitBase: 800, capacity: 800, openedAt: 600 } }
    } },
    fs: {
      [INV + '/X']: { ...ITEM, currentStock: 1400, locationStock: { kho: 3000, quay: 200 }, unrefilledConsumption: { quay: 900 } },
      [INV + '/K']: { ...ATOM, currentStock: 3 }, [INV + '/N']: { ...NOTEM, currentStock: 50 },
      [PI + '/P']: { ...PREP, code: 'CT', currentStock: 1200 }, [PI + '/Q']: { id: 'Q', name: 'Thạch', unit: 'g', currentStock: 0 },
      [C + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 100, baseQty: 1000, openedAt: '2026-09-27T01:00:00.000Z' },
      [C + '/B']: { itemId: 'X', code: 'BBB', status: 'open', unitBase: 300, baseQty: 1000, openedAt: '2026-09-27T02:00:00.000Z' },
      [C + '/S1']: { itemId: 'X', code: 'SSS', status: 'sealed', unitBase: 1000, baseQty: 1000 },
      [C + '/C3']: { itemId: 'X', code: 'CCC', status: 'open', baseQty: 1000 }, [C + '/C4']: { itemId: 'X', code: 'DDD', status: 'open', baseQty: 1000 },
      [PB + '/b1']: { prepId: 'P', batchCode: 'L1', status: 'active', unitBase: 400, qtyRemaining: 400 },
      [PB + '/b2']: { prepId: 'P', batchCode: 'L2', status: 'active', unitBase: 800, qtyRemaining: 800 },
      [PB + '/b3']: { prepId: 'P', batchCode: 'L3', status: 'active' }
    }
  };
}

async function runOne(name) {
  const fake = makeFake(seed());
  const env = { items: [ITEM, ATOM, NOTEM, { id: 'Z', name: 'Đá', trackingMode: 'unit' }], preps: [PREP, { id: 'Q', name: 'Thạch' }], refillRules: [RULE], calls: [] };
  const F0 = loadCore(kind, fake, env);
  const mark = { i: null }; const F = markFirstCall(F0, fake, mark);
  let result, error = null;
  try { result = await S[name](F, fake, env); } catch (e) { error = String(e && e.message || e) + (e && e.code ? ' [' + e.code + ']' : ''); }
  await new Promise(r => setImmediate(r)); await new Promise(r => setTimeout(r, 5));  // cho các lệnh ghi không await chạy xong
  // Thứ tự ghi so THEO TỪNG tài liệu/đường dẫn (sắp ổn định theo đường dẫn): các món chạy song song
  // (Promise.allSettled) xen kẽ nhau tuỳ nhịp — không mang nghĩa nghiệp vụ; thứ tự trên cùng một
  // tài liệu thì giữ nguyên.
  const log = fake.log.map((x, i) => [x, i]).sort((a, b) => (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : a[1] - b[1])).map(x => x[0]);
  const gaps = kind === 'engine' ? storeGaps(fake.FS, seed().fs, fake.log, mark.i) : null;
  return normalize(dropStore({ result: result === undefined ? null : result, error, rt: fake.RT.root, fs: fake.FS, log, calls: env.calls }, gaps));
}

(async () => {
  const out = {};
  for (const name of Object.keys(S)) out[name] = await runOne(name);
  if (!fs.existsSync(SNAP) || process.env.UPDATE === '1') {
    fs.mkdirSync(path.dirname(SNAP), { recursive: true });
    fs.writeFileSync(SNAP, JSON.stringify(out, null, 1));
    console.log('ok đã ghi ảnh chụp (' + kind + ') ' + Object.keys(out).length + ' kịch bản');
    console.log('ALL PASS');
    return;
  }
  const golden = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  let ok = true;
  for (const name of Object.keys(S)) {
    const a = JSON.stringify(out[name]), b = JSON.stringify(golden[name]);
    if (a === b) console.log('ok ' + name);
    else {
      ok = false; console.log('FAIL ' + name);
      for (const k of ['result', 'error', 'rt', 'fs', 'log', 'calls', 'storeGaps']) if (JSON.stringify(out[name][k]) !== JSON.stringify((golden[name] || {})[k])) console.log('   khác ở ' + k + ':\n     mới ' + String(JSON.stringify(out[name][k])).slice(0, 600) + '\n     cũ  ' + String(JSON.stringify((golden[name] || {})[k])).slice(0, 600));
    }
  }
  const extra = Object.keys(golden).filter(k => !S[k]); if (extra.length) { ok = false; console.log('FAIL thiếu kịch bản', extra); }
  console.log('nguồn: ' + kind);
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
