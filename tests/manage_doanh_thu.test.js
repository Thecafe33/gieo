// manage.html (Quản lý The Cafe 33 + XOFA) — doanh thu phải chia Y NHƯ 2 POS đang chia (docs/KE_HOACH_QUANLY_TC33_XOFA.md):
//   · The Cafe 33: so với calculateStats() trích thẳng từ pos.html.
//   · XOFA: so với updRv() trích thẳng từ PosX.html.
// Thêm: lương giờ (OT theo ngày) và các hàm thuần của cham_cong.v1.js.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };

const M = new Function(extract('manage.html', ['tcEmptySum', 'tcIsTransfer', 'tcAddOrder', 'tcSummarize', 'xoEmptySum', 'xoAddOrder', 'xoSummarize',
  'payTermsOfRecord', 'empPayTermsOn', 'computeWageForDayHours', 'isShiftInProgress', 'shiftWorkedHours', 'laborByEmployee', 'pad', 'dkey']) +
  '\nreturn { tcSummarize, xoSummarize, laborByEmployee };')();

// Bộ sinh số giả ngẫu nhiên cố định — test lặp lại được.
let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

// ── The Cafe 33 ───────────────────────────────────────────────────────────
const menu = [
  { name: 'Cà phê sữa', type: 'Cà phê', priceM: 25000 }, { name: 'Bạc xỉu', type: 'Cà phê', priceM: 29000, priceL: 35000 },
  { name: 'Bánh tráng trộn', type: 'Ăn vặt', priceM: 20000 }, { name: 'Khoai chiên', type: 'Đồ ăn', priceM: 30000 },
  { name: 'Thuê mền', type: 'Khác', priceM: 10000 }, { name: 'Gửi xe', type: 'khac', priceM: 5000 }, { name: 'Snack', type: 'SNACK', priceM: 12000 }
];
const names = menu.map(m => m.name).concat(['Món đã xoá', 'Khuyến mãi đặc biệt']);
const day = new Date(2026, 9, 12);
const tcOrders = [];
for (let i = 0; i < 300; i++) {
  const d = new Date(day); d.setHours(rnd(24), rnd(60));
  const n = 1 + rnd(4); const arr = [];
  for (let j = 0; j < n; j++) {
    const nm = names[rnd(names.length)];
    arr.push({ name: rnd(3) ? nm : nm.toUpperCase(), qty: 1 + rnd(3), price: nm === 'Khuyến mãi đặc biệt' ? -5000 : (rnd(4) ? 20000 + rnd(5) * 1000 : 0) });
  }
  const total = rnd(15) ? arr.reduce((s, x) => s + x.price * x.qty, 0) : 0;
  const method = ['Tiền mặt', 'Chuyển khoản', 'bank', 'TRANSFER', '', 'chuyen khoan'][rnd(6)];
  const o = { total, method, createdAt: d.toISOString() };
  if (rnd(5)) o.itemsArray = arr; else o.items = arr.map(x => `${x.name}(M)x${x.qty}`).join(', ');
  tcOrders.push(o);
}
const calculateStats = new Function('menu', extract('pos.html', ['calculateStats']) + '\nreturn calculateStats;')(menu);
const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
const pos = calculateStats(tcOrders, 'custom', key, key);
const mg = M.tcSummarize(tcOrders, menu);
eq([mg.drink, mg.snack, mg.khac, mg.cash, mg.transfer], [pos.drinkTotal, pos.snackTotal, pos.khacTotal, pos.cashTotal, pos.transferTotal],
  'TC33: Đồ uống / Ăn vặt / Khác / Tiền mặt / Chuyển khoản khớp calculateStats của pos.html (300 đơn ngẫu nhiên)');
eq(mg.total, mg.cash + mg.transfer, 'TC33: Tổng thu = Tiền mặt + Chuyển khoản');
eq(mg.hours.reduce((a, b) => a + b, 0), pos.drinkTotal + pos.khacTotal, 'TC33: biểu đồ = Tổng nước (Đồ uống + Khác) như pos.html khi bật 🐶');
eq(M.tcSummarize([{ total: 0, method: 'Tiền mặt', itemsArray: [{ name: 'Cà phê sữa', qty: 1, price: 25000 }] }], menu).count, 0, 'TC33: đơn total 0 bỏ qua như POS');

// ── XOFA ─────────────────────────────────────────────────────────────────
const xoOrders = [];
const MT = ['TIỀN MẶT', 'CHUYỂN KHOẢN', 'TÍNH RIÊNG', 'VÍ'];
for (let i = 0; i < 300; i++) {
  const total = 20000 + rnd(30) * 5000;
  const o = { total, method: MT[rnd(4)], date: '12/10/2026', time: `${String(rnd(24)).padStart(2, '0')}:${String(rnd(60)).padStart(2, '0')}`, isToGo: rnd(3) === 0 };
  if (o.method === 'TÍNH RIÊNG' && rnd(4)) { const a = rnd(total / 1000) * 1000; o.splitGroups = [{ method: 'TIỀN MẶT', total: a }, { method: 'CHUYỂN KHOẢN', total: total - a }]; }
  if (rnd(3) === 0) { o.foodTotal = Math.min(total, 10000 + rnd(5) * 5000); o.foodMethod = rnd(4) ? MT[rnd(3)] : null; }
  if (rnd(6) === 0) o.isShip = true;
  xoOrders.push(o);
}
const out = {};
const fakeDoc = { getElementById: id => (out[id] = out[id] || { style: {}, set textContent(v) { this.v = v; }, get textContent() { return this.v; } }) };
const updRv = new Function('document', 'fmt', '_updShipStats', 'orders', 'todayKey', '_rvFrom', extract('PosX.html', ['updRv']) + '\nreturn updRv;')(
  fakeDoc, n => String(n), () => {}, [], () => '12/10/2026', null);
updRv(xoOrders);
const num = id => Number(String(out[id].v).replace(/\./g, ''));
const xs = M.xoSummarize(xoOrders);
eq([xs.cash, xs.bank, xs.instore, xs.togo, xs.total, xs.food, xs.foodCash, xs.foodBank],
  [num('rv-cash'), num('rv-bank'), num('rv-instore'), num('rv-togo'), num('rvtb'), num('rv-food-total'), num('rv-food-cash'), num('rv-food-bank')],
  'XOFA: Tiền mặt / CK / Tại quán / To Go / Tổng / Food (TM, CK) khớp updRv của PosX.html (300 đơn ngẫu nhiên)');
eq(xs.hours.reduce((a, b) => a + b, 0), xs.total, 'XOFA: biểu đồ không gồm Food');
eq(xs.ship, xoOrders.filter(o => o.isShip === true).length, 'XOFA: đếm đơn ship');

// ── Lương giờ (OT theo ngày) ─────────────────────────────────────────────
const emps = [{ id: 'a', payType: 'hourly_part', hourlyRate: 20000, otEnabled: true, otThresholdHours: 8, otRate: 30000 },
  { id: 'b', payType: 'fixed', fixedMonthlySalary: 9000000 },
  { id: 'c', payType: 'hourly_part', hourlyRate: 25000, payHistory: [{ effectiveFrom: '0000-00-00', legacy: true, payType: 'hourly_part', hourlyRate: 20000 }, { effectiveFrom: '2026-10-05', payType: 'hourly_part', hourlyRate: 25000 }] }];
const sh = (id, d, a, b) => ({ employeeId: id, businessDate: d, checkedInAt: `${d}T${a}:00`, checkedOutAt: b ? `${d}T${b}:00` : null });
const L = M.laborByEmployee(emps, [sh('a', '2026-10-01', '07:00', '12:00'), sh('a', '2026-10-01', '13:00', '18:00'), sh('b', '2026-10-01', '07:00', '17:00'),
  sh('c', '2026-10-04', '08:00', '10:00'), sh('c', '2026-10-06', '08:00', '10:00'), sh('a', '2026-10-02', '07:00', null)], Date.now());
eq(L.a, { hours: 10, otHours: 2, amount: 8 * 20000 + 2 * 30000 }, 'Lương: 2 ca cùng ngày gộp 10h → 2h OT; ca quên check-out ngày cũ không tính');
eq(L.b, undefined, 'Lương: người lương cứng không tính ở đây');
eq(L.c.amount, 2 * 20000 + 2 * 25000, 'Lương: đơn giá theo mốc lịch sử lương');

// ── cham_cong.v1.js ──────────────────────────────────────────────────────
const C = require('../cham_cong.v1.js');
const E = [{ id: 'g', pin: '1111', fullName: 'Gieo', active: true }, { id: 't', pin: '2222', fullName: 'Tc', active: true, workStores: ['gieo', 'tc33'] },
  { id: 'x', pin: '3333', fullName: 'Nghỉ', active: false, workStores: ['tc33'] }];
eq([C.findByPin(E, '1111', 'tc33').error, C.findByPin(E, '2222', 'tc33').emp.id, C.findByPin(E, '2222', 'xofa').error, C.findByPin(E, '3333', 'tc33').error, C.findByPin(E, '12a4', 'tc33').error],
  ['notassigned', 't', 'notassigned', 'notfound', 'format'], 'Ca làm việc: PIN chỉ nhận người active có tích đúng quán (thiếu workStores = Gieo)');
const S = [{ employeeId: 't', businessDate: '2026-10-11', checkedInAt: '2026-10-11T22:00:00', checkedOutAt: null }];
eq(C.checkInBlockReason(S, 't', '2026-10-12'), 'open', 'Ca làm việc: ca từ hôm qua chưa ra (qua 0h) vẫn phải check-out trước');
eq(!!C.openShiftOf(S, 't'), true, 'Ca làm việc: check-out tìm được ca bắt đầu hôm qua');
const S2 = [{ employeeId: 't', businessDate: '2026-10-12', checkedInAt: 'a', checkedOutAt: 'b' }, { employeeId: 't', businessDate: '2026-10-12', checkedInAt: 'c', checkedOutAt: 'd' }];
eq(C.checkInBlockReason(S2, 't', '2026-10-12'), 'max', 'Ca làm việc: tối đa 2 lần vào/ra mỗi ngày');
eq(C.checkInBlockReason(S2, 't', '2026-10-13'), null, 'Ca làm việc: sang ngày mới check-in lại được');

console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
