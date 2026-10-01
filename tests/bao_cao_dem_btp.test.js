// Báo cáo tháng theo nhân viên phải thấy lệch đếm BTP cuối ca (ADJUSTMENT fromPrepCount), thiếu/thừa tách riêng,
// kể cả lệch nhỏ; bỏ dòng hoàn (reversal) và dòng ADJUSTMENT không phải từ lần đếm.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
const fn = new Function(extract('quanlygieo.html', ['thangKetTrachNhiemNL']) + '\nreturn thangKetTrachNhiemNL;')();
const row = o => ({ type: 'ADJUSTMENT', fromPrepCount: true, prepId: 'p1', prepName: 'Cốt trà lài', unit: 'g', businessDate: '2026-09-22', createdAt: '2026-09-22T14:00:00Z', staff: 'Vỹ', staffEmployeeId: 'e1', costPerUnit: 10, ...o });
const r = fn([], [], () => 0, [
  row({ qty: 6599.4, totalCost: 65994 }),
  row({ qty: -3, totalCost: 30, createdAt: '2026-09-23T14:00:00Z' }),          // lệch nhỏ vẫn ghi
  row({ qty: -100, totalCost: 1000, reversal: true }),                          // hoàn bill → bỏ
  row({ qty: -50, totalCost: 500, fromPrepCount: false }),                      // ADJUSTMENT khác → bỏ
  row({ qty: -200, totalCost: 2000, substitutionQty: 80, createdAt: '2026-09-24T14:00:00Z' }), // bù BTP khác: trừ phần bù
  row({ qty: 0, totalCost: 0 }),
  { type: 'WASTE', prepId: 'p1', prepName: 'Cốt trà lài', unit: 'g', qty: -10, totalCost: 100, staff: 'Vỹ', staffEmployeeId: 'e1', businessDate: '2026-09-22', createdAt: '2026-09-22T15:00:00Z' }
]);
const g = r.byEmployee.e1;
eq([r.events.length, g.events.length], [4, 4], '4 sự kiện: 3 chênh đếm + 1 hao hụt đã khai');
eq([g.prepCountSurplus, g.prepCountShort, g.reportedWaste], [65994, 30 + 1200, 100], 'thừa/thiếu tách riêng; thiếu trừ phần bù; hao hụt khai giữ nguyên');
eq(r.events.filter(e => e.category.startsWith('prepCount')).map(e => e.category).sort(), ['prepCountShort', 'prepCountShort', 'prepCountSurplus'], 'nhãn loại');
// ── Hồ sơ vụ lệch (quy theo ca) thay cho "người đếm" khi đã có hồ sơ; phần không ai chịu tính riêng ──
const adjRows = [
  row({ qty: -100, totalCost: 100, createdAt: '2026-09-22T14:30:00.000Z' }),      // đã có hồ sơ vụ lệch → không tính theo người đếm nữa
  row({ qty: -50, totalCost: 50, createdAt: '2026-09-23T14:30:00.000Z' })];       // chưa có hồ sơ → vẫn tính theo người đếm (dữ liệu cũ)
const cases = [
  { id: 'c1', prepId: 'p1', prepName: 'Cốt trà lài', unit: 'g', businessDate: '2026-09-22', createdAt: '2026-09-22T14:30:00.000Z', interval: { from: '2026-09-21T14:00:00.000Z', to: '2026-09-22T14:30:00.000Z' }, status: 'auto',
    allocations: [{ employeeId: 'e1', employeeName: 'Vỹ', qty: -80, value: 80, confidence: 'strong', basis: ['nhap_sai_da_xac_minh'] }, { employeeId: 'e2', employeeName: 'Duy', qty: -20, value: 20, confidence: 'medium', basis: ['chia_theo_so_ban'] }],
    pool: [{ kind: 'recipe', qty: -30, value: 30 }], entryErrorConfirmed: true, entryErrorQty: -80, verification: { by: 'Chi', at: 'x' } },
  { id: 'c2', prepId: 'p2', prepName: 'Pudding', unit: 'g', businessDate: '2026-09-23', createdAt: 'z', interval: { to: 'z' }, status: 'dispute', allocations: [], pool: [{ kind: 'dispute', qty: -500, value: 500 }] }];
const r2 = fn([], [], () => 0, adjRows, cases);
const g1 = r2.byEmployee.e1, g2 = r2.byEmployee.e2;
eq([g1.prepCountShort, g1.dutyShort, g1.dutyStrongShort, g2.dutyShort, g2.dutyStrongShort], [50, 80, 80, 20, 0], 'có hồ sơ vụ lệch → quy theo ca; dòng chưa có hồ sơ vẫn tính theo người đếm; chỉ phần Mạnh vào "căn cứ phạt"');
eq([r2.dutyPool.recipe.value, r2.dutyPool.dispute.value, r2.dutyPool.dispute.count], [30, 500, 1], 'phần định mức / chờ quyết tính riêng, không vào ai');
eq(r2.events.find(e => e.category === 'dutyShort' && e.employeeId === 'e1').entryError.qty, -80, 'sự kiện giữ dấu "đã xác minh nhập sai"');
// ── NL cân cuối ca đã có hồ sơ vụ lệch → không đổ hết cho người đứng cân ──
const swTx = [{ id: 't1', itemId: 'X', type: 'WASTE', qty: -50, wasteKind: 'shift_weigh', shiftWeighOp: 'sw_1', staff: 'Vỹ', staffEmployeeId: 'e1', businessDate: '2026-09-28', createdAt: '2026-09-28T14:00:00Z' },
  { id: 't2', itemId: 'X', type: 'WASTE', qty: -70, wasteKind: 'shift_weigh', shiftWeighOp: 'sw_old', staff: 'Vỹ', staffEmployeeId: 'e1', businessDate: '2026-09-20', createdAt: '2026-09-20T14:00:00Z' }];
const r3 = fn(swTx, [{ id: 'X', name: 'Sữa', unit: 'ml' }], () => 2, [], [{ id: 'cn1', type: 'nl', prepId: 'X', prepName: 'Sữa', unit: 'ml', businessDate: '2026-09-28', createdAt: '2026-09-28T14:00:00Z', interval: { to: 'z' }, shiftWeighOp: 'sw_1', status: 'auto',
  allocations: [{ employeeId: 'e1', employeeName: 'Vỹ', qty: -30, value: 60, confidence: 'medium', basis: ['chia_theo_so_ban'] }, { employeeId: 'e2', employeeName: 'An', qty: -20, value: 40, confidence: 'medium', basis: ['chia_theo_so_ban'] }], pool: [] }]);
eq([r3.byEmployee.e1.shortage, r3.byEmployee.e1.dutyShort, r3.byEmployee.e2.dutyShort], [140, 60, 40], 'NL: lượt cân đã có hồ sơ → quy theo ca (60/40); lượt cũ chưa có hồ sơ vẫn tính theo người cân (70×2đ)');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
