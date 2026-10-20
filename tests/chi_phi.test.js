// Chi phí The cafe 33 / XOFA (16/10) — manage.html tab Chi phí + cham_cong.v4.js (XOFA ghi chi phí ở Ca làm việc).
//   · Danh mục mặc định 2 bên trùng nhau; POS ghi đúng dạng chờ duyệt, không PIN.
//   · Phân bổ: khoản theo kỳ chia đều theo ngày; chỉ khoản đã duyệt (như filterExpenses của quanlygieo).
//   · Hoà vốn: tháng có chi phí thật → dùng chi phí thật (Giá vốn → giá vốn, còn lại → cần đắp); tháng chưa có → cấu hình.
'use strict';
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.abs(a - b) < 0.5, true, m + ' (' + a + ' ≈ ' + b + ')');

const C = require('../cham_cong.v4.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'manage.html'), 'utf8');
const mgCats = new Function(src.match(/const DEFAULT_EXPENSE_CATS = (\[[\s\S]*?\n\]);/)[0] + '\nreturn DEFAULT_EXPENSE_CATS;')();
eq(mgCats, C.DEFAULT_EXPENSE_CATS, 'Danh mục mặc định manage.html trùng cham_cong.v4.js');
eq(C.expenseCats({ items: [{ label: 'Đá', costType: 'cogs' }, { label: 'Cũ', active: false }] }).map(c => c.label), ['Đá'], 'POS: chỉ danh mục đang dùng');
eq(C.expenseCats(null).length, C.DEFAULT_EXPENSE_CATS.length, 'POS: chưa cấu hình → danh mục mặc định');
const p = C.expensePayload({ category: 'Đá', amount: '25000', note: ' 2 bao ', cats: C.DEFAULT_EXPENSE_CATS, today: '2026-10-16', store: 'xofa', now: 'T' });
eq(p.doc, { periodType: 'onetime', date: '2026-10-16', category: 'Đá', costType: 'cogs', amount: 25000, note: '2 bao', amountKind: 'actual', status: 'pending_review', source: 'pos', store: 'xofa', createdAt: 'T' }, 'POS: bản ghi chờ duyệt, nguồn pos, không có PIN / nhân viên');
eq([C.expensePayload({ category: 'Đá', amount: 0, cats: C.DEFAULT_EXPENSE_CATS }).error, C.expensePayload({ category: 'Không có', amount: 5, cats: C.DEFAULT_EXPENSE_CATS }).error,
  C.expensePayload({ category: 'Đá', amount: 2e8, cats: C.DEFAULT_EXPENSE_CATS }).error], ['amount', 'cat', 'big'], 'POS: chặn thiếu tiền / sai danh mục / số quá lớn');
{
  const pos = fs.readFileSync(path.join(__dirname, '..', 'PosX.html'), 'utf8'), tc = fs.readFileSync(path.join(__dirname, '..', 'pos.html'), 'utf8');
  eq(/cham_cong\.v4\.js/.test(pos) && /ChamCong\.init\(\{ store: 'xofa', expenses: true \}\)/.test(pos), true, 'PosX nạp v4 và bật khung chi phí');
  eq(/cham_cong\.v4\.js/.test(tc) && /ChamCong\.init\(\{ store: 'tc33' \}\)/.test(tc), true, 'pos.html nạp v4, không bật khung chi phí');
}

const NAMES = ['pad', 'parseDkey', 'addDays', 'dkey', 'daysBetween', 'daysInMonthYm', 'beMonthValue', 'plBreakEven', 'expenseCatsAll', 'expenseCats', 'expCostType', 'expCounts', 'expAllocate', 'expAmountIn', 'tcxBreakEven', 'expPaidOf', 'expIsBase'];
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
// [16/10] Hoà vốn TC33 / XOFA = chi phí VẬN HÀNH (đã duyệt + chờ duyệt) + khấu hao; mua hàng (Giá vốn) không tính.
const r = M.tcxBreakEven(B, 'tc33', [{ date: '2026-10-16', rev: 1000000 }], { list: E, cats });
eq(r.nguon, 'thuc', 'Tháng có chi phí vận hành → tính theo chi phí đó');
near(r.hoaVon, 100000, 'Ngày 16: hoà vốn = thuê nhà 100k (mua hàng 400k, đá chờ duyệt 50k là Giá vốn → không tính; từ chối không tính)');
const Pd = E.concat([{ id: 'f', periodType: 'onetime', date: '2026-10-16', category: 'Sửa chữa / bảo trì', amount: 60000, status: 'pending_review', source: 'pos' }]);
near(M.tcxBreakEven(B, 'tc33', [{ date: '2026-10-16', rev: 1000000 }], { list: Pd, cats }).hoaVon, 160000, 'Khoản vận hành CHỜ DUYỆT cộng thẳng vào hoà vốn');
near(M.expAllocate(Pd, cats, true).byDay['2026-10-16'].fixed, 160000, 'expAllocate có chờ duyệt: tính cả khoản chờ duyệt, bỏ khoản từ chối');
const r2 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-09-30', rev: 1000000 }, { date: '2026-10-16', rev: 1000000 }], { list: E, cats });
eq([r2.nguon, r2.soNgayThuc, r2.soNgay], ['tron', 1, 2], 'Kỳ vắt 2 tháng: tháng 9 theo cấu hình, tháng 10 theo chi phí vận hành');
near(r2.hoaVon, 1000000 + 100000, 'Hoà vốn 2 ngày: 30/9 cấu hình 1tr + 16/10 vận hành 100k');
const r3 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-09-30', rev: 0 }], { list: E, cats });
eq(r3.nguon, 'cauhinh', 'Tháng chưa có chi phí vận hành → cấu hình');
const onlyBuy = [{ id: 'z', periodType: 'onetime', date: '2026-09-30', category: 'Nguyên liệu / mua hàng', amount: 900000, status: 'approved' }];
eq(M.tcxBreakEven(B, 'tc33', [{ date: '2026-09-30', rev: 0 }], { list: onlyBuy, cats }).nguon, 'cauhinh', 'Tháng chỉ có khoản mua hàng → vẫn dùng chi phí cố định cấu hình');
eq(M.tcxBreakEven({}, 'xofa', [{ date: '2026-10-16', rev: 5 }], { list: [], cats }), null, 'Không chi phí, không cấu hình → chưa có số');
// Tháng chỉ có khoản nhân viên gửi từ Ca làm việc (chờ duyệt / đã duyệt) → KHÔNG thay chi phí cố định cấu hình, mà cộng thêm.
const Bx = { '2026-10': { xofa: { fixed: 6200000 } } };
const posOnly = [{ id: 'p1', periodType: 'onetime', date: '2026-10-16', category: 'Sửa chữa / bảo trì', amount: 50000, status: 'pending_review', source: 'pos' },
  { id: 'p2', periodType: 'onetime', date: '2026-10-16', category: 'Khác', amount: 30000, status: 'approved', source: 'pos' },
  { id: 'p3', periodType: 'onetime', date: '2026-10-16', category: 'Đá', amount: 40000, status: 'pending_review', source: 'pos' }];
const rx = M.tcxBreakEven(Bx, 'xofa', [{ date: '2026-10-16', rev: 0 }], { list: posOnly, cats });
eq([rx.nguon, Math.round(rx.hoaVon)], ['cauhinh', 200000 + 50000 + 30000], 'XOFA: cấu hình 200k/ngày + khoản nhân viên gửi 80k (đá là Giá vốn → không tính)');
eq(M.tcxBreakEven({}, 'xofa', [{ date: '2026-10-16', rev: 0 }], { list: posOnly, cats }).hoaVon, 80000, 'Chưa cấu hình: chỉ còn khoản nhân viên gửi');

// ── Trả trước nhiều tháng (chủ dự án 16/10): XOFA trả tiền thuê QUÝ ngày 1/11 → kỳ 1/11/2026 – 31/1/2027, ĐÃ TRẢ, chia đều mỗi ngày ──
const Q = { id: 'q', periodType: 'period', startDate: '2026-11-01', endDate: '2027-01-31', date: '2026-11-01', paidDate: '2026-11-01', category: 'Tiền thuê nhà', amount: 9200000, status: 'approved', source: 'manage' };
const aq = M.expAllocate([Q], cats);
eq([Object.keys(aq.byDay).length, [...aq.months]], [92, ['2026-11', '2026-12', '2027-01']], 'Thuê quý: 92 ngày, vắt qua năm, cả 3 tháng có chi phí thật');
near(aq.byDay['2027-01-15'].fixed, 100000, 'Thuê quý: mỗi ngày gánh 9,2tr ÷ 92 = 100k (cả ngày tháng 1/2027)');
near(M.expAmountIn(Q, '2026-12-01', '2026-12-31'), 3100000, 'Thuê quý: chi phí tháng 12 = 31 ngày × 100k');
eq([M.expPaidOf(Q), M.expPaidOf({ source: 'pos', date: '2026-11-03', status: 'pending_review' }), M.expPaidOf({ source: 'manage', date: '2026-11-03' }), M.expPaidOf({ source: 'pos', date: '2026-11-03', status: 'rejected' })],
  ['2026-11-01', '2026-11-03', null, null], 'Ngày trả: theo paidDate; khoản POS = trả ngay hôm ghi; chưa ghi = chưa trả');
const rq = M.tcxBreakEven({}, 'xofa', [{ date: '2027-01-15', rev: 300000 }], { list: [Q], cats });
near(rq.hoaVon, 100000, 'Hoà vốn ngày 15/1/2027: tiền thuê trả từ 1/11 vẫn được tính 100k vào ngày đó');

console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
