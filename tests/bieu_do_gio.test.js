// Biểu đồ doanh thu theo giờ manage.html (16/10): từng giờ, khung mặc định 8h–22h, tự nới khi có bill sớm / muộn.
//   · Bản tóm tắt ngày có h24 (TC33 / XOFA) và h24Rev (Gieo) — cộng lại đúng bằng ô 2 giờ cũ.
//   · Bản đệm cũ (chỉ có ô 2 giờ) vẫn đọc được: dồn vào giờ chẵn; cộng dồn nhiều ngày không lỗi.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const M = new Function(extract('manage.html', ['vnHour', 'tcEmptySum', 'tcIsTransfer', 'tcIsKhacLine', 'tcAddOrder', 'tcSummarize', 'xoEmptySum', 'xoAddOrder', 'xoSummarize', 'ggEmptySum', 'ggAddOrder', 'ggSummarize', 'sumMerge', 'hourRev', 'chartHourSpan']) +
  '\nconst CHART_OPEN=8,CHART_CLOSE=22;\nreturn { tcSummarize, xoSummarize, ggSummarize, sumMerge, hourRev, chartHourSpan, tcEmptySum, ggEmptySum };')();
const sum = a => a.reduce((x, y) => x + y, 0);

const menu = [{ name: 'Cà phê sữa', type: 'Cà phê', priceM: 25000 }];
const tc = M.tcSummarize([
  { total: 25000, method: 'Tiền mặt', itemsArray: [{ name: 'Cà phê sữa', qty: 1, price: 25000 }], createdAt: '2026-10-16T00:10:00Z' },   // 7h10 VN
  { total: 50000, method: 'Tiền mặt', itemsArray: [{ name: 'Cà phê sữa', qty: 2, price: 25000 }], createdAt: '2026-10-16T15:40:00Z' }    // 22h40 VN
], menu);
eq([tc.h24[7], tc.h24[22], sum(tc.h24)], [25000, 50000, sum(tc.hours)], 'TC33: theo giờ VN, từng giờ; tổng = ô 2 giờ cũ');
const xo = M.xoSummarize([{ total: 80000, method: 'TIỀN MẶT', time: '09:15', foodTotal: 30000, foodMethod: 'TIỀN MẶT' }]);
eq([xo.h24[9], sum(xo.h24)], [50000, sum(xo.hours)], 'XOFA: không gồm Food');
const gg = M.ggSummarize([{ total: 45000, method: 'TIỀN MẶT', time: '13:05' }]);
eq([gg.h24Rev[13], sum(gg.h24Rev)], [45000, sum(gg.hoursRev)], 'Gieo: h24Rev = doanh thu gồm Food');

const old = { total: 1, hours: [0, 0, 0, 0, 10, 20, 0, 0, 0, 0, 0, 0] };
const tcS = { brand: 'tc33' };
eq([M.hourRev(old, tcS, 8), M.hourRev(old, tcS, 9), M.hourRev(old, tcS, 10)], [10, 0, 20], 'Bản đệm cũ: ô 2 giờ dồn vào giờ chẵn');
const acc = M.sumMerge(M.tcEmptySum(), old); M.sumMerge(acc, tc);
eq([acc.h24[7], acc.hours[4]], [25000, 10], 'Cộng ngày cũ (không h24) + ngày mới không lỗi');
const g2 = M.sumMerge({}, gg);
eq(g2.h24Rev[13], 45000, 'sumMerge tạo mảng khi đích chưa có');

const z = () => new Array(24).fill(0);
eq(M.chartHourSpan([z(), z()]), [8, 21], 'Không bill: 8h–22h');
const a = z(); a[7] = 5; const b = z(); b[22] = 3;
eq(M.chartHourSpan([a, b]), [7, 22], 'Có bill 7h và 22h → nới 7h–23h');
const c = z(); c[12] = 1;
eq(M.chartHourSpan([c]), [8, 21], 'Bill trong giờ mở cửa: giữ 8h–22h');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
