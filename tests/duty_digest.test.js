// Tóm tắt ngày (v5): NL/BTP đi đâu (bán, nấu, hao hụt khai, nhập, lệch cân), lệch ở đâu, ai chịu; lưu + thông báo cuối ngày.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 700), '!=', JSON.stringify(b).slice(0, 700)); } else console.log('ok', m); };
const UE0 = loadEngineModule();
const D = UE0.duty;
const stockTx = [
  { id: 'bill_1_a_ing_X', itemId: 'X', type: 'CONSUMPTION', qty: -300, referenceId: 'bill_1_a' },
  { id: 'bill_2_b_ing_X', itemId: 'X', type: 'CONSUMPTION', qty: -200, referenceId: 'bill_2_b' },
  { id: 'rev', itemId: 'X', type: 'ADJUSTMENT', qty: 50, reversal: true, referenceId: 'bill_2_b' },       // xoá bill: hoàn 50
  { id: 'cook', itemId: 'X', type: 'CONSUMPTION', qty: -400, referenceId: 'batch1', note: 'Nấu' },
  { id: 'w1', itemId: 'X', type: 'WASTE', qty: -30, wasteKind: 'drink' },
  { id: 'r1', itemId: 'X', type: 'RECEIVING', qty: 1000 },
  { id: 'sw', itemId: 'X', type: 'WASTE', qty: -50, wasteKind: 'shift_weigh' },
  { id: 'adj', itemId: 'X', type: 'ADJUSTMENT', qty: 10 },
  { id: 'y1', itemId: 'Y', type: 'CONSUMPTION', qty: -100, referenceId: 'bill_3_c' }];
const prepTx = [
  { id: 'p1', prepId: 'P', type: 'PRODUCTION', qty: 733 }, { id: 'p2', prepId: 'P', type: 'CONSUMPTION', qty: -490, referenceId: 'bill_4_d' },
  { id: 'p3', prepId: 'P', type: 'ADJUSTMENT', qty: -100, fromPrepCount: true }, { id: 'p4', prepId: 'P', type: 'WASTE', qty: -20, fromPrepCount: true }];
const cases = [
  { id: 'c1', type: 'nl', prepId: 'X', variance: -50, value: 100, status: 'auto', allocations: [{ employeeId: 'A', employeeName: 'An', qty: -41.67, value: 83, confidence: 'medium' }, { employeeId: 'B', employeeName: 'Bình', qty: -8.33, value: 17, confidence: 'medium' }], pool: [] },
  { id: 'c2', type: 'prep', prepId: 'P', variance: -100, value: 100, status: 'dispute', allocations: [], pool: [{ kind: 'dispute', qty: -100, value: 100 }] }];
const dg = D.buildDigest({ day: '2026-09-28', stockTx, prepTx, cases, anomalies: [{ itemId: 'Y', qty: -20 }], items: { X: { name: 'Sữa tươi', unit: 'ml', costPerUnit: 2 }, Y: { name: 'Đường', unit: 'g', costPerUnit: 1 } }, preps: { P: { name: 'Cốt trà lài', unit: 'g', costPerUnit: 1 } } });
const X = dg.items.find(i => i.id === 'X'), P = dg.items.find(i => i.id === 'P'), Y = dg.items.find(i => i.id === 'Y');
eq(X.flows, { sales: 450, cooking: 400, produced: 0, wasteDeclared: 30, received: 1000, countVariance: -50, otherAdjust: 10 }, 'NL "đi đâu": bán 450 (đã trừ hoàn bill), nấu 400, hao hụt khai 30, nhập 1000, lệch cân −50, điều chỉnh +10');
eq([X.name, X.status, X.variance, X.value, X.allocations.map(a => [a.employeeName, a.value])], ['Sữa tươi', 'da_quy', -50, 100, [['An', 83], ['Bình', 17]]], 'NL lệch: tên, đã quy, ai chịu');
eq([P.flows.produced, P.flows.sales, P.flows.countVariance, P.flows.wasteDeclared, P.status, P.openCaseIds], [733, 490, -100, 20, 'cho_quyet', ['c2']], 'BTP: nấu ra, bán, lệch đếm, đổ; vụ tranh chấp chờ chủ');
eq([Y.status, Y.anomalies, Y.anomalyQty, Y.flows.sales], ['ok', 1, -20, 100], 'NL không lệch: vẫn thấy đi đâu + Sổ lệch');
eq(dg.totals, { person: 100, recipe: 0, unknown: 0, dispute: 100, waived: 0, varianceValue: 200 }, 'tổng: đã quy người / chờ quyết');
eq([dg.lechCount, dg.needsAttention, dg.lines.length >= 3, /CHỜ BẠN QUYẾT/.test(dg.lines.join('|')), /An 83/.test(dg.lines.join('|'))], [2, ['P'], true, true, true], 'câu tóm tắt có người chịu và nêu vụ chờ bạn quyết');
eq(D.buildDigest({ day: 'd', stockTx: [], prepTx: [], cases: [], anomalies: [], items: {}, preps: {} }).lines, ['Không có NL/BTP nào lệch.'], 'ngày không lệch → câu tóm tắt "không có lệch"');
// ── lưu + thông báo ──
(async () => {
  const fs = {
    'inventory_items_gieogieo/X': { name: 'Sữa tươi', unit: 'ml', costPerUnit: 2 }, 'prep_items_gieogieo/P': { name: 'Cốt trà lài', unit: 'g', costPerUnit: 1 },
    'stock_transactions_gieogieo/a': { ...stockTx[0], businessDate: '2026-09-28' }, 'stock_transactions_gieogieo/o': { ...stockTx[0], id: undefined, itemId: 'X', businessDate: '2026-09-27' },
    'prep_transactions_gieogieo/p1': { ...prepTx[0], businessDate: '2026-09-28' },
    'duty_cases_gieogieo/c1': { ...cases[0], businessDate: '2026-09-28' }, 'duty_cases_gieogieo/c2': { ...cases[1], businessDate: '2026-09-28' }, 'duty_cases_gieogieo/c9': { ...cases[0], id: 'c9', businessDate: '2026-09-27' } };
  const fake = makeFake({ rt: {}, fs }); const UE = loadEngineModule();
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28', now: () => Date.UTC(2026, 8, 28, 15, 0, 0), random: () => 0.5 });
  const d = await UE.duty.writeDigest('2026-09-28');
  const doc = fake.FS['duty_digests_gieogieo/2026-09-28'], al = fake.FS['alerts_gieogieo/duty_digest_2026-09-28'];
  eq([d.itemCount, d.lechCount, doc.lechCount, doc.needsAttention], [2, 2, 2, ['P']], 'đọc đúng dữ liệu của NGÀY đó (không lẫn ngày khác) và lưu tóm tắt');
  eq([al.type, al.severity, al.status, al.needsAttention, al.lines.length > 0], ['duty_digest', 'warning', 'new', 1, true], 'thông báo cuối ngày gửi chủ; cảnh báo vàng vì còn vụ chờ quyết');
  await UE.duty.writeDigest('2026-09-28');
  eq(Object.keys(fake.FS).filter(k => k.startsWith('alerts_gieogieo/')).length, 1, 'lập lại cùng ngày → không nhân đôi thông báo');
  // writeDigest chờ việc nền xong
  let finished = false; UE.duty.bg(new Promise(r => setTimeout(() => { finished = true; r(); }, 30)));
  await UE.duty.writeDigest('2026-09-28');
  eq(finished, true, 'lập tóm tắt chờ các việc duty chạy nền xong');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
