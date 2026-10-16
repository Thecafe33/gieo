// manage.html (Quản lý The Cafe 33 + XOFA) — doanh thu phải chia Y NHƯ 2 POS đang chia (docs/KE_HOACH_QUANLY_TC33_XOFA.md):
//   · The Cafe 33: so với calculateStats() trích thẳng từ pos.html.
//   · XOFA: so với updRv() trích thẳng từ PosX.html.
// Thêm: lương giờ (OT theo ngày) và các hàm thuần của cham_cong.v3.js.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };

const M = new Function(extract('manage.html', ['vnHour', 'tcEmptySum', 'tcIsTransfer', 'tcIsKhacLine', 'tcAddOrder', 'tcSummarize', 'xoEmptySum', 'xoAddOrder', 'xoSummarize',
  'payTermsOfRecord', 'empPayTermsOn', 'computeWageForDayHours', 'isShiftInProgress', 'shiftWorkedHours', 'laborByEmployee', 'pad', 'dkey',
  'parseDkey', 'addDays', 'targetMonthValue', 'daysInMonthYm', 'targetForRange', 'sharePcts',
  'ggEmptySum', 'ggAddOrder', 'ggSummarize', 'gieoTargetsOn', 'isStoreOff', 'gieoTargetForRange', 'ggName', 'gieoLabel']) +
  '\nconst GIEO_LEGACY = "gg01", GIEO_TARGET_DEFAULTS = { aov:46000, billsPerDay:60 };\nreturn { tcSummarize, xoSummarize, laborByEmployee, targetMonthValue, targetForRange, sharePcts, ggSummarize, gieoTargetForRange, ggName, gieoLabel };')();

// Bộ sinh số giả ngẫu nhiên cố định — test lặp lại được.
let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

// ── The Cafe 33 ───────────────────────────────────────────────────────────
const menu = [
  { name: 'Cà phê sữa', type: 'Cà phê', priceM: 25000 }, { name: 'Bạc xỉu', type: 'Cà phê', priceM: 29000, priceL: 35000 },
  { name: 'Bánh tráng trộn', type: 'Ăn vặt', priceM: 20000 }, { name: 'Khoai chiên', type: 'Đồ ăn', priceM: 30000 },
  { name: 'Thuê mền', type: 'Khác', priceM: 10000 }, { name: 'Gửi xe', type: 'khac', priceM: 5000 }, { name: 'Snack', type: 'SNACK', priceM: 12000 }
];
// + dòng không có trong menu: giờ bed, phí (size "Phí"), nợ cũ → phải vào nhóm Khác (sửa 16/10)
const FEE = ['Phí không đặt trước', 'Nợ cũ: Phí vệ sinh', 'Phí chọn Bed 02'];
const names = menu.map(m => m.name).concat(['Món đã xoá', 'Khuyến mãi đặc biệt', '1h bed', '1h bed từ h5'], FEE);
const day = new Date(2026, 9, 12);
const tcOrders = [];
for (let i = 0; i < 300; i++) {
  const d = new Date(day); d.setHours(rnd(24), rnd(60));
  const n = 1 + rnd(4); const arr = [];
  for (let j = 0; j < n; j++) {
    const nm = names[rnd(names.length)];
    arr.push({ name: rnd(3) ? nm : nm.toUpperCase(), size: FEE.indexOf(nm) >= 0 ? 'Phí' : 'M', qty: 1 + rnd(3), price: nm === 'Khuyến mãi đặc biệt' ? -5000 : (rnd(4) ? 20000 + rnd(5) * 1000 : 0) });
  }
  const total = rnd(15) ? arr.reduce((s, x) => s + x.price * x.qty, 0) : 0;
  const method = ['Tiền mặt', 'Chuyển khoản', 'bank', 'TRANSFER', '', 'chuyen khoan'][rnd(6)];
  const o = { total, method, createdAt: d.toISOString() };
  if (rnd(5)) o.itemsArray = arr; else o.items = arr.map(x => `${x.name}(${x.size})x${x.qty}`).join(', ');
  tcOrders.push(o);
}
const calculateStats = new Function('menu', extract('pos.html', ['_isKhacLine', 'calculateStats']) + '\nreturn calculateStats;')(menu);
const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
const pos = calculateStats(tcOrders, 'custom', key, key);
const mg = M.tcSummarize(tcOrders, menu);
eq([mg.drink, mg.snack, mg.khac, mg.cash, mg.transfer], [pos.drinkTotal, pos.snackTotal, pos.khacTotal, pos.cashTotal, pos.transferTotal],
  'TC33: Đồ uống / Ăn vặt / Khác / Tiền mặt / Chuyển khoản khớp calculateStats của pos.html (300 đơn ngẫu nhiên)');
eq(mg.total, mg.cash + mg.transfer, 'TC33: Tổng thu = Tiền mặt + Chuyển khoản');
eq(mg.hours.reduce((a, b) => a + b, 0), pos.drinkTotal + pos.khacTotal, 'TC33: biểu đồ = Tổng nước (Đồ uống + Khác) như pos.html khi bật 🐶');
{ // giờ bed, phí, nợ cũ → Khác (không phải nước); món thường vẫn là nước
  const o = { total: 101000, method: 'Tiền mặt', itemsArray: [{ name: '1h bed', size: 'M', qty: 3, price: 15000 }, { name: 'Bạc xỉu', size: 'M', qty: 1, price: 29000 },
    { name: 'Phí không đặt trước', size: 'Phí', qty: 1, price: 10000 }, { name: 'Nợ cũ: Phí vệ sinh', size: 'Phí', qty: 1, price: 17000 }] };
  const a = M.tcSummarize([o], menu), b = calculateStats([Object.assign({ createdAt: new Date(2026, 9, 12, 19).toISOString() }, o)], 'custom', key, key);
  eq([a.drink, a.khac], [29000, 72000], 'TC33: 3 giờ bed + phí không đặt trước + nợ cũ → Khác (72.000), chỉ Bạc xỉu là nước');
  eq([b.drinkTotal, b.khacTotal], [29000, 72000], 'TC33 pos.html: cùng phân nhóm');
  const s2 = M.tcSummarize([{ total: 55000, method: 'Tiền mặt', items: '1h bed (M)x2, Nợ cũ: Phí hủy muộn (Phí)x1, Cà phê sữa (M)x1' }], [{ name: 'Cà phê sữa', type: 'Cà phê', priceM: 25000 }, { name: '1h bed', type: 'Bed', priceM: 15000 }]);
  eq([s2.drink, s2.khac], [25000, 30000], 'TC33: đơn cũ dạng chuỗi — giờ bed → Khác; nợ cũ không có giá trong chuỗi (0đ)');
}
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

// ── Gieo Gieo: tiền mặt / chuyển khoản như updRv của posgieo.html; doanh thu = Σ bill như quanlygieo ──
const out2 = {};
const fakeDoc2 = { getElementById: id => (out2[id] = out2[id] || { style: {}, set textContent(v) { this.v = v; }, get textContent() { return this.v; } }) };
const updRvGieo = new Function('document', 'fmt', '_updShipStats', 'orders', 'todayKey', '_rvFrom', extract('posgieo.html', ['updRv']) + '\nreturn updRv;')(
  fakeDoc2, n => String(n), () => {}, [], () => '12/10/2026', null);
updRvGieo(xoOrders);
const num2 = id => Number(String(out2[id].v).replace(/\./g, ''));
const gs = M.ggSummarize(xoOrders);
eq([gs.cash + gs.foodCash, gs.bank + gs.foodBank], [num2('rv-cash') + num2('rv-food-cash'), num2('rv-bank') + num2('rv-food-bank')],
  'Gieo: Tiền mặt / Chuyển khoản (gồm Food) khớp updRv của posgieo.html (300 đơn ngẫu nhiên)');
eq(gs.revenue, xoOrders.reduce((a, o) => a + o.total, 0), 'Gieo: Doanh thu = Σ tổng bill (như aggregateOrders của quanlygieo)');
eq([M.ggName('orders_gieogieo', 'gg01'), M.ggName('orders_gieogieo_archive', 'gg02')], ['orders_gieogieo', 'orders_gieogieo_archive__gg02'],
  'Gieo: tên dữ liệu theo quán như data_access (gg01 giữ nguyên, quán mới thêm __id)');
eq([M.gieoLabel({ id: 'gg01', name: 'X' }, false), M.gieoLabel({ id: 'gg02', name: 'Quận 3' }, true), M.gieoLabel({ id: 'gg02', name: '' }, true)],
  ['Gieo Gieo', 'Gieo Gieo · Quận 3', 'Gieo Gieo · GG02'], 'Gieo: nhãn cửa hàng');
const H = [{ effectiveFrom: '2026-10-05', targets: { aov: 50000, billsPerDay: 40 } }];
eq(M.gieoTargetForRange(H, '2026-10-04', '2026-10-05'), 46000 * 60 + 50000 * 40, 'Gieo: mục tiêu ngày = AOV × bill/ngày theo phiên bản có hiệu lực (trước phiên bản đầu = mặc định của quanlygieo)');
{
  const fs = require('fs'), path = require('path');
  const ql = fs.readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8').match(/targets: *\{aov:(\d+), *billsPerDay:(\d+)/);
  const mg = fs.readFileSync(path.join(__dirname, '..', 'manage.html'), 'utf8').match(/GIEO_TARGET_DEFAULTS = \{ *aov:(\d+), *billsPerDay:(\d+)/);
  eq(mg && mg.slice(1, 3), ql && ql.slice(1, 3), 'Gieo: mục tiêu mặc định trong manage.html trùng DEFAULTS.targets của quanlygieo.html');
}
eq(M.sharePcts([1, 1, 1]), [34, 33, 33], '% đóng góp nhiều quán cộng đúng 100');

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

// ── Mục tiêu theo tháng ──────────────────────────────────────────────────
const TG = { '2026-08': { tc33: 3100000, all: 9300000 }, '2026-10': { tc33: 6200000, xofa: 3000000 } };
eq(M.targetMonthValue(TG, '2026-09', 'tc33'), { value: 3100000, from: '2026-08' }, 'Mục tiêu: tháng chưa đặt dùng mức tháng gần nhất trước đó');
eq(M.targetMonthValue(TG, '2026-10', 'all'), { value: 9300000, from: '2026-08' }, 'Mục tiêu: từng ô tự lùi riêng (tháng 10 không đặt Chung → dùng tháng 8)');
eq(M.targetMonthValue(TG, '2026-07', 'tc33'), null, 'Mục tiêu: trước tháng đặt đầu tiên → chưa có');
eq(M.targetForRange(TG, '2026-10-12', '2026-10-12', 'tc33'), 200000, 'Mục tiêu ngày = mục tiêu tháng ÷ số ngày tháng đó');
eq(M.targetForRange(TG, '2026-09-29', '2026-10-02', 'tc33'), 2 * 103333 + 2 * 200000 + 1, 'Mục tiêu tuần vắt qua 2 tháng cộng theo từng ngày');
eq(M.targetForRange(TG, '2026-10-01', '2026-10-31', 'xofa'), 3000000, 'Mục tiêu cả tháng = đúng mức tháng');
eq(M.targetForRange(TG, '2026-07-01', '2026-07-31', 'xofa'), null, 'Mục tiêu: kỳ chưa đặt → null');
eq([M.sharePcts([1, 2]), M.sharePcts([0, 0]), M.sharePcts([5, 0])], [[33, 67], [0, 0], [100, 0]], '% đóng góp cộng lại đúng 100');

// ── cham_cong.v3.js (bản hiện hành) ──────────────────────────────────────────────────────
const C = require('../cham_cong.v3.js');
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
