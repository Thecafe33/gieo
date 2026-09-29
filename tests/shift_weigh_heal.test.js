// Cân cuối ca: tự bù lượt dở dang, chuyển loại sang dùng bù, ghi đè đồng thời, lệch lớn
// (E4.5 — chạy trên unit_engine.v1.js + Firebase giả, sổ kho thật).
const { mkSW, line, U } = require('./lib/sw_env');
const staff = { fullName: 'NV', id: 'e1' };
// Lỗi ghi sổ lần đầu: runTransaction đầu tiên (chính là lượt ghi sổ hao hụt) ném lỗi mạng.
function failFirstTx(E) { const orig = E.fake.fstore.runTransaction; let n = 0; E.fake.fstore.runTransaction = async fn => { if (n++ === 0) throw new Error('net'); return orig(fn); }; }
let ok = true; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
(async () => {
  // H1: RT đã chốt, ghi sổ lỗi → lượt dở dang 'rt_done' → tự bù dùng kết quả đã lưu (kể cả khi node RT đã mất)
  let E = mkSW({ active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: -100, finishedDebt: true, openedAt: 1 }, C: { code: 'CCC', unitBase: 600, openedAt: 5 } } } });
  let l = line('X', [U('C', 'CCC', 5, 450, 600)]); E.state.lines = [l];
  failFirstTx(E);
  try { await E.F.shiftWeighApplyLinePOS(l, 'D', staff, 's'); eq(1, 0, 'H1 should throw'); } catch (e) { eq(e.message, 'net', 'H1 ledger failed'); }
  const pend = E.FS['daily_closings_gieogieo/D'].shiftWeighPending; const opId = Object.keys(pend)[0];
  eq(pend[opId].stage, 'rt_done', 'H1 pending rt_done');
  eq(E.rtGet('active_units_gieogieo/X/C/unitBase'), 450, 'H1 RT applied');
  E.fake.db.ref('active_units_gieogieo/X/C').remove();   // mã C báo hết trong lúc đó
  await E.F.shiftWeighHealPendingPOS('D', E.FS['daily_closings_gieogieo/D'].shiftWeighPending);
  const row = E.FS['stock_transactions_gieogieo/' + opId + '_C'];
  eq([row && row.type, row && row.qty, row && row.measured], ['WASTE', -50, true], 'H1 healed ledger');
  eq(Object.keys(E.FS['daily_closings_gieogieo/D'].shiftWeighPending || {}).length, 0, 'H1 pending cleared');
  // H2: dừng sau 'planned', RT chưa đổi → bỏ lượt, không ghi gì
  E = mkSW({ active_units_gieogieo: { Y: { A: { code: 'A', unitBase: 100, openedAt: 1 } } } }, { 'daily_closings_gieogieo/D': { shiftWeighPending: { op1: { itemId: 'Y', stage: 'planned', unitIds: ['A'], day: 'D' } } } });
  await E.F.shiftWeighHealPendingPOS('D', E.FS['daily_closings_gieogieo/D'].shiftWeighPending);
  eq([Object.keys(E.FS['daily_closings_gieogieo/D'].shiftWeighPending).length, E.rtGet('active_units_gieogieo/Y/A/unitBase'), E.txRows().length], [0, 100, 0], 'H2 dropped, nothing written');
  // H3: 'planned' nhưng RT đã ghi (chết trước khi lưu rt_done) → dựng lại từ RT
  E = mkSW({ active_units_gieogieo: { Z: { A: { code: 'A', unitBase: 70, openedAt: 1, shiftWeigh: { op: 'op2', before: 100, after: 70, baseline: 100, weighed: 70, newest: true, debt: [{ id: 'Q', code: 'Q', amount: -10 }] } } } } },
    { 'stock_containers_gieogieo/Q': { itemId: 'Z', status: 'finished' }, 'daily_closings_gieogieo/D': { shiftWeighPending: { op2: { itemId: 'Z', itemName: 'Sữa', unit: 'ml', stage: 'planned', unitIds: ['A'], day: 'D', staffName: 'NV', staffId: 'e1' } } } });
  await E.F.shiftWeighHealPendingPOS('D', E.FS['daily_closings_gieogieo/D'].shiftWeighPending);
  eq(E.FS['stock_transactions_gieogieo/op2_A'].qty, -20, 'H3 loss 30-10 debt');
  // R1: chuyển 20 trong 50 hao hụt sang dùng bù — gọi hai lần chỉ chuyển một lần
  E = mkSW({ active_units_gieogieo: {} }, { 'stock_transactions_gieogieo/opX_C': { itemId: 'X', type: 'WASTE', qty: -50, shiftWeighOp: 'opX', note: 'n' } });
  const o = { itemId: 'X', qty: 20, day: 'D', opId: 'opX', txId: 'subst_r_X', reconId: 'r', prepId: 'P', prepName: 'Cốt', unit: 'ml', staffEmp: staff };
  await E.F.shiftWeighReclassToConsumptionPOS(o); await E.F.shiftWeighReclassToConsumptionPOS(o);
  eq([E.FS['stock_transactions_gieogieo/opX_C'].qty, E.FS['stock_transactions_gieogieo/subst_r_X'].qty, E.FS['stock_transactions_gieogieo/opX_C'].reclassifiedToConsumptionQty], [-30, -20, 20], 'R1 reclass once');
  // C1: Quản lý vừa chỉnh mã sau mốc cân → ghi đè đồng thời → huỷ, bắt cân lại
  E = mkSW({ active_units_gieogieo: { X: { C: { code: 'C', unitBase: 500, openedAt: 1, lastMgrAdjustOp: 'mgradj_1' } } } });
  let u = U('C', 'C', 1, 450, 600); u.capacity = 1000; l = line('X', [u]); E.state.lines = [l];
  try { await E.F.shiftWeighApplyLinePOS(l, 'D', staff, 'c1'); eq(1, 0, 'C1'); } catch (e) { eq([e.code, u.weighed, E.rtGet('active_units_gieogieo/X/C/unitBase')], ['SW_RELOAD', null, 500], 'C1 concurrent abort'); }
  eq(Object.keys((E.FS['daily_closings_gieogieo/D'] || {}).shiftWeighPending || {}).length, 0, 'C1 pending dropped');
  // D1: lệch > 25% dung tích → hỏi lại trước mọi lượt ghi; xác nhận → ghi, gắn cờ, cảnh báo
  E = mkSW({ active_units_gieogieo: { Y: { C: { code: 'C', unitBase: 600, openedAt: 1 } } } });
  u = U('C', 'C', 1, 100, 600); u.capacity = 1000; l = line('Y', [u]); E.state.lines = [l];
  try { await E.F.shiftWeighApplyLinePOS(l, 'D', staff, 'd1'); eq(1, 0, 'D1'); } catch (e) { eq([e.code, E.rtGet('active_units_gieogieo/Y/C/unitBase'), !!E.FS['daily_closings_gieogieo/D']], ['SW_DEVIATION', 600, false], 'D1 deviation stops before writes'); }
  l._devAck = true; const r = await E.F.shiftWeighApplyLinePOS(l, 'D', staff, 'd1');
  const wrow = E.txRows().find(t => t.wasteKind === 'shift_weigh');
  eq([r.lossQty, wrow.largeDeviation, E.alerts().some(a => a.type === 'shift_weigh_large_deviation')], [500, true, true], 'D1 ack → written, flagged, alerted');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
