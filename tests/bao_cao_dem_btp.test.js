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
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
