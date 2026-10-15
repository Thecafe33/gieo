// Tiền mặt nộp về (16/10) — manage.html tab Tiền mặt + quanlygieo ô "Quản lý thực nhận".
//   · TC33: phải nộp = tiền mặt của bill trừ phần Ăn vặt (cashMain); XOFA: tiền mặt không gồm Food; trừ chi tại quầy (POS).
//   · Gieo: phải nhận = handedOverAmount + bill tiền mặt bán sau kết ca — manage (ggCashExpected) và quanlygieo
//     (ownerReceiptExpected) cùng một số; chỉ khi ngày đã bàn giao tiền.
//   · Đệm: ngày đã nhận và cũ hơn 7 ngày không đọc lại.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

const M = new Function(extract('manage.html', ['vnHour', 'tcEmptySum', 'tcIsTransfer', 'tcIsKhacLine', 'tcAddOrder', 'tcSummarize', 'ggCashExpected', 'tcxCashExpected', 'pad', 'parseDkey', 'addDays', 'dkey', 'cashQueryFrom']) +
  '\nconst CASH_FRESH_DAYS = 7;\nreturn { tcSummarize, ggCashExpected, tcxCashExpected, cashQueryFrom };')();
const Q = new Function(extract('quanlygieo.html', ['ownerReceiptExpected']) + '\nreturn { ownerReceiptExpected };')();

const menu = [{ name: 'Cà phê sữa', type: 'Cà phê', priceM: 25000 }, { name: 'Bánh tráng', type: 'Ăn vặt', priceM: 20000 }];
const s = M.tcSummarize([
  { total: 45000, method: 'Tiền mặt', itemsArray: [{ name: 'Cà phê sữa', qty: 1, price: 25000 }, { name: 'Bánh tráng', qty: 1, price: 20000 }] },
  { total: 40000, method: 'Tiền mặt', itemsArray: [{ name: 'Cà phê sữa', qty: 2, price: 25000 }] },            // giảm 10k trên bill
  { total: 20000, method: 'Chuyển khoản', itemsArray: [{ name: 'Bánh tráng', qty: 1, price: 20000 }] }
], menu);
eq([s.cash, s.cashMain], [85000, 65000], 'TC33: tiền mặt cả bill 85k; phải nộp bỏ Ăn vặt 20k = 65k (giảm giá trên bill vẫn đúng tiền thật)');
eq(M.tcxCashExpected(s, 'tc33', 15000), { sales: 65000, spent: 15000, expected: 50000 }, 'TC33: phải nộp = 65k − chi tại quầy 15k');
eq(M.tcxCashExpected({ cash: 300000, foodCash: 90000 }, 'xofa', 0).expected, 300000, 'XOFA: không gồm Food');
eq(M.tcxCashExpected({ cash: 99000 }, 'tc33', 0).expected, 99000, 'Bản đệm cũ chưa có cashMain → dùng cash');

const CL = { status: 'closed', handedOverAmount: 1200000, retainedAmount: 500000, closedAt: 'x', handoverRecipient: 'Lan',
  postCloseBills: { a: { timing: 'after_close', cash: 45000 }, b: { timing: 'in_close_count', cash: 30000 }, c: { timing: 'after_close', bank: 20000 } } };
const g = M.ggCashExpected(CL);
eq([g.state, g.expected, g.handed, g.after, g.retained], ['ready', 1245000, 1200000, 45000, 500000], 'Gieo: phải nhận = bàn giao 1,2tr + bill tiền mặt bán sau kết ca 45k (bill đã nằm trong két lúc đếm không cộng)');
eq(Q.ownerReceiptExpected(CL), g.expected, 'quanlygieo và manage cùng một số phải nhận');
eq([M.ggCashExpected({ status: 'cash_passed' }).state, M.ggCashExpected(null).state, M.ggCashExpected({ status: 'closed', forceClosedByManagement: true }).state], ['open', 'none', 'forced'],
  'Gieo: chưa bàn giao / không có kết ca / đóng hộ → chưa nhập được');

const C = { '2026-10-01': { received: 1 }, '2026-10-02': { received: 1 }, '2026-10-04': { received: 1 } };
eq(M.cashQueryFrom(C, '2026-10-01', '2026-10-20'), '2026-10-03', 'Đệm: đọc từ ngày sớm nhất chưa nhận');
eq(M.cashQueryFrom({ '2026-10-01': { received: 1 }, '2026-10-02': { received: 1 } }, '2026-10-01', '2026-10-05'), '2026-10-01', 'Đệm: 7 ngày gần nhất luôn đọc lại (sửa từ máy khác)');
const all = {}; for (let d = 1; d <= 12; d++) all['2026-10-' + String(d).padStart(2, '0')] = { received: 1 };
eq(M.cashQueryFrom(all, '2026-10-01', '2026-10-20'), '2026-10-13', 'Đệm: đã nhận đủ → chỉ đọc 7 ngày gần nhất');

{
  const H = new Function('cashViewDate', 'ownerReceiptEditing', extract('quanlygieo.html', ['fmt', 'ownerReceiptExpected', 'ownerReceiptHTML']) + '\nreturn ownerReceiptHTML;');
  const done = H('2026-10-14', null)(Object.assign({}, CL, { ownerReceipt: { received: 1240000, by: 'manage', at: '2026-10-15T10:00:00Z' } }));
  eq([/Sửa/.test(done), /ownerRecvInput/.test(done), /manage/.test(done), /Thiếu/.test(done)], [true, false, true, true], 'quanlygieo: manage đã nhập → khoá ô, hiện số + lệch + nút Sửa');
  const edit = H('2026-10-14', '2026-10-14')(Object.assign({}, CL, { ownerReceipt: { received: 1240000, by: 'manage' } }));
  eq([/ownerRecvInput/.test(edit), /value="1240000"/.test(edit)], [true, true], 'quanlygieo: bấm Sửa → ô nhập điền sẵn số cũ');
  eq([H('2026-10-14', null)({ status: 'cash_passed' }), /ownerRecvInput/.test(H('2026-10-14', null)(CL))], ['', true], 'quanlygieo: chưa bàn giao → không hiện; đã bàn giao chưa nhận → ô nhập');
}

console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
