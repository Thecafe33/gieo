// Chi phí The cafe 33 / XOFA (16/10) — manage.html tab Chi phí + cham_cong.v3.js (XOFA ghi chi phí ở Ca làm việc).
//   · Danh mục mặc định 2 bên trùng nhau; POS ghi đúng dạng chờ duyệt, không PIN.
//   · Phân bổ: khoản theo kỳ chia đều theo ngày; chỉ khoản đã duyệt (như filterExpenses của quanlygieo).
//   · Hoà vốn: tháng có chi phí thật → dùng chi phí thật (Giá vốn → giá vốn, còn lại → cần đắp); tháng chưa có → cấu hình.
'use strict';
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.abs(a - b) < 0.5, true, m + ' (' + a + ' ≈ ' + b + ')');

const C = require('../cham_cong.v3.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'manage.html'), 'utf8');
const mgCats = new Function(src.match(/const DEFAULT_EXPENSE_CATS = (\[[\s\S]*?\n\]);/)[0] + '\nreturn DEFAULT_EXPENSE_CATS;')();
eq(mgCats, C.DEFAULT_EXPENSE_CATS, 'Danh mục mặc định manage.html trùng cham_cong.v3.js');
eq(C.expenseCats({ items: [{ label: 'Đá', costType: 'cogs' }, { label: 'Cũ', active: false }] }).map(c => c.label), ['Đá'], 'POS: chỉ danh mục đang dùng');
eq(C.expenseCats(null).length, C.DEFAULT_EXPENSE_CATS.length, 'POS: chưa cấu hình → danh mục mặc định');
const p = C.expensePayload({ category: 'Đá', amount: '25000', note: ' 2 bao ', cats: C.DEFAULT_EXPENSE_CATS, today: '2026-10-16', store: 'xofa', now: 'T' });
eq(p.doc, { periodType: 'onetime', date: '2026-10-16', category: 'Đá', costType: 'cogs', amount: 25000, note: '2 bao', amountKind: 'actual', status: 'pending_review', source: 'pos', store: 'xofa', createdAt: 'T' }, 'POS: bản ghi chờ duyệt, nguồn pos, không có PIN / nhân viên');
eq([C.expensePayload({ category: 'Đá', amount: 0, cats: C.DEFAULT_EXPENSE_CATS }).error, C.expensePayload({ category: 'Không có', amount: 5, cats: C.DEFAULT_EXPENSE_CATS }).error,
  C.expensePayload({ category: 'Đá', amount: 2e8, cats: C.DEFAULT_EXPENSE_CATS }).error], ['amount', 'cat', 'big'], 'POS: chặn thiếu tiền / sai danh mục / số quá lớn');
{
  const pos = fs.readFileSync(path.join(__dirname, '..', 'PosX.html'), 'utf8'), tc = fs.readFileSync(path.join(__dirname, '..', 'pos.html'), 'utf8');
  eq(/cham_cong\.v3\.js/.test(pos) && /ChamCong\.init\(\{ store: 'xofa', expenses: true \}\)/.test(pos), true, 'PosX nạp v3 và bật khung chi phí');
  eq(/cham_cong\.v3\.js/.test(tc) && /ChamCong\.init\(\{ store: 'tc33' \}\)/.test(tc), true, 'pos.html nạp v3, không bật khung chi phí');
}

const NAMES = ['pad', 'parseDkey', 'addDays', 'dkey', 'daysBetween', 'daysInMonthYm', 'beMonthValue', 'plBreakEven', 'expenseCatsAll', 'expenseCats', 'expCostType', 'expCounts', 'expAllocate', 'expAmountIn', 'tcxBreakEven'];
const M = new Function(src.match(/const DEFAULT_EXPENSE_CATS = (\[[\s\S]*?\n\]);/)[0] + '\n' + extract('manage.html', NAMES) + '\nreturn {' + NAMES.join(',') + '};')();
const cats = M.expenseCatsAll(null);
const E = [
  { id: 'a', periodType: 'period', startDate: '2026-10-01', endDate: '2026-10-31', date: '2026-10-01', category: 'Tiền thuê nhà', amount: 3100000, status: 'approved' },
  { id: 'b', periodType: 'onetime', date: '2026-10-16', category: 'Nguyên liệu / mua hàng', amount: 400000, status: 'approved' },
  { id: 'c', periodType: 'onetime', date: '2026-10-16', category: 'Đá', amount: 50000, status: 'pending_review', source: 'pos' },
  { id: 'd', periodType: 'onetime', date: '2026-10-16', category: 'Khác', amount: 90000, status: 'rejected' },
  { id: 'e', periodType: 'onetime', date: '2026-10-17', category: 'Tiền điện', amount: 700000, amountKind: 'estimate' }
];
near(M.expAmountIn(E[0], '2026-10-16', '2026-10-17'), 200000, 'Khoản theo kỳ: 31 ngày → 2 ngày = 200k');
near(M.expAmountIn(E[0], '2026-09-20', '2026-10-01'), 100000, 'Khoản theo kỳ: chỉ phần ngày giao nhau');
eq([M.expCostType(E[1], cats), M.expCostType(E[0], cats), M.expCostType({ category: 'Lạ', costType: 'cogs' }, cats)], ['cogs', 'fixed', 'cogs'], 'Loại chi phí theo danh mục, không có thì theo bản ghi');
const al = M.expAllocate(E, cats);
near(al.byDay['2026-10-16'].fixed, 100000, 'Ngày 16: thuê nhà chia đều 100k; chi phí chờ duyệt / từ chối không tính');
near(al.byDay['2026-10-16'].cogs, 400000, 'Ngày 16: mua hàng → giá vốn');
near(al.byDay['2026-10-17'].fixed, 800000, 'Ngày 17: điện (dự đoán vẫn tính, như quanlygieo) + thuê nhà');
eq([...al.months], ['2026-10'], 'Tháng có chi phí thật');

const B = { '2026-09': { tc33: { fixed: 30000000, cogsPct: 40 } } };
const r = M.tcxBreakEven(B, 'tc33', [{ date: '2026-10-16', rev: 1000000 }], { list: E, cats });
eq(r.nguon, 'thuc', 'Tháng có chi phí thật → tính theo chi phí thật');
near(r.lai, 1000000 - 400000 - 100000, 'Lãi = doanh thu − giá vốn (mua hàng) − vận hành');
near(r.hoaVon, 100000 / 0.6, 'Hoà vốn = vận hành ÷ (1 − giá vốn / doanh thu)');
const r2 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-09-30', rev: 1000000 }, { date: '2026-10-16', rev: 1000000 }], { list: E, cats });
eq([r2.nguon, r2.soNgayThuc, r2.soNgay], ['tron', 1, 2], 'Kỳ vắt 2 tháng: tháng 9 theo cấu hình, tháng 10 theo chi phí thật');
near(r2.lai, (1000000 - 400000 - 1000000) + (500000), 'Lãi cộng 2 phần: 30/9 lỗ 400k theo cấu hình, 16/10 lãi 500k');
const r3 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-09-30', rev: 0 }], { list: E, cats });
eq(r3.nguon, 'cauhinh', 'Tháng chưa có chi phí thật → cấu hình');
eq(M.tcxBreakEven({}, 'xofa', [{ date: '2026-10-16', rev: 5 }], { list: [], cats }), null, 'Không chi phí, không cấu hình → chưa có số');

console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
