// Tổng kết tháng (manage.html, 16/10) — The cafe 33 / XOFA tính + chốt ở manage, Gieo chỉ đọc sổ đã chốt của quanlygieo.
//   · Ảnh chụp chốt tháng CÙNG BỘ TRƯỜNG với chotSoThang của quanlygieo → mọi quán đọc một cách.
//   · Doanh thu như Tổng quan; giá vốn = khoản chi loại Giá vốn; lương = nhập tay + chấm công + khoản «Lương / thưởng»;
//     vận hành = khoản đã nhập, tháng chưa nhập ở manage → chi phí cố định cấu hình; khấu hao = tài sản.
//   · Trạng thái như trangThaiThang: đang chạy / chờ số thật (dự đoán, chờ duyệt) / đủ số / đã chốt.
'use strict';
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

const src = fs.readFileSync(path.join(__dirname, '..', 'manage.html'), 'utf8');
const CATS = src.match(/const DEFAULT_EXPENSE_CATS = (\[[\s\S]*?\n\]);/)[0];
const HELP = "const r2 = v => Math.round(v * 100) / 100, monthEndOf = k => k.slice(0, 7) + '-' + String(daysInMonthYm(k.slice(0, 7))).padStart(2, '0');\nconst CLOSE_KEYS = " +
  src.match(/const CLOSE_KEYS = (\[[^\]]*\]);/)[1] + ';\n';
const N = ['pad', 'parseDkey', 'addDays', 'daysBetween', 'dkey', 'daysInMonthYm', 'expCounts', 'expIsBase', 'expCostType', 'expAmountIn', 'expIsLuong',
  'beMonthValue', 'assetEndDate', 'assetLive', 'assetMonthly', 'assetDepDay', 'shiftPayRows', 'tcxMonthSummary', 'closingDoc'];
const M = new Function('empPayTermsOn', 'shiftPaidHours', 'computeWageForDayHours', CATS + '\n' + HELP + extract('manage.html', N) + '\nreturn { tcxMonthSummary, closingDoc, shiftPayRows, CLOSE_KEYS };')(
  (emp) => ({ payType: emp.payType, hourlyRate: emp.hourlyRate }), sh => sh.h, (t, h) => ({ amount: t.hourlyRate * h }));

// Bộ trường quanlygieo ghi ở chotSoThang (đọc thẳng từ quanlygieo.html — đổi bên đó thì test báo).
const ql = fs.readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8');
const qlSet = ql.slice(ql.indexOf('async function chotSoThang'), ql.indexOf('async function moLaiThang'));
const qlKeys = qlSet.match(/\.doc\(monthKey\)\.set\(\{([\s\S]*?)\}\);/)[1].match(/\b([a-zA-Z]+)\s*[:,]/g).map(s => s.replace(/[:,\s]/g, '')).filter(k => !/^(tong|new)$/.test(k));
const coreKeys = ['monthKey', 'closedAt', 'closedBy'].concat(M.CLOSE_KEYS);
eq(qlKeys.filter(k => !coreKeys.includes(k)), [], 'Mọi trường quanlygieo ghi khi chốt sổ đều có trong ảnh chụp TC33 / XOFA');

const cats = new Function(CATS + '\nreturn DEFAULT_EXPENSE_CATS;')();
const list = [
  { id: 'a1', category: 'Nguyên liệu / mua hàng', amount: 3000000, date: '2026-09-05', status: 'approved', source: 'manage' },
  { id: 'a2', category: 'Tiền thuê nhà', amount: 6000000, periodType: 'period', startDate: '2026-09-01', endDate: '2026-09-30', date: '2026-09-01', status: 'approved', source: 'manage' },
  { id: 'a3', category: 'Lương / thưởng', amount: 1000000, date: '2026-09-30', status: 'approved', source: 'manage' },
  { id: 'a4', category: 'Tiền điện', amount: 900000, date: '2026-09-20', status: 'rejected', source: 'manage' },
  { id: 'a5', category: 'Tiền thuê nhà', amount: 9000000, periodType: 'period', startDate: '2026-08-16', endDate: '2026-09-15', date: '2026-08-16', status: 'approved', source: 'manage' }
];
const rev = { '2026-09-15': 20000000 };
const assets = [{ store: 'tc33', purchaseDate: '2026-01-01', purchaseCost: 3000000, usefulLifeMonths: 10 }];
const base = { store: 'tc33', month: '2026-09', today: '2026-10-16', rev, list, cats, B: {}, assets, luongTay: 3000000, chamCong: [{ name: 'Minh', hours: 10, sum: 260000 }] };
const s = M.tcxMonthSummary(base);
eq([s.doanhThu, s.giaVon, s.chiPhiCoDinh, s.luong, s.khauHao], [20000000, 3000000, 6000000 + Math.round(9000000 * 15 / 31), 3000000 + 260000 + 1000000, 300000],
  'Tháng xong: giá vốn 3tr; vận hành = thuê 6tr + 15/31 kỳ thuê cũ (16/8–15/9) (từ chối không tính); lương = tay + chấm công + «Lương / thưởng»; khấu hao 300k');
eq([s.tongChiPhi, s.lai, s.laiTruocKhauHao, s.soNgay, s.trangThai, s.nguonChiPhi], [s.giaVon + s.luong + s.chiPhiCoDinh + s.khauHao, 20000000 - s.tongChiPhi, s.lai + 300000, 30, 'du-so-that', 'thuc'],
  'Lãi = doanh thu − tổng chi phí; đủ số thật');
eq(M.tcxMonthSummary({ ...base, closing: { lai: 1 } }).trangThai, 'da-chot', 'Có ảnh chụp → đã chốt');
const est = M.tcxMonthSummary({ ...base, list: list.concat([{ id: 'e1', category: 'Tiền điện', amount: 800000, date: '2026-09-28', status: 'approved', amountKind: 'estimate', source: 'manage' },
  { id: 'p1', category: 'Đá', amount: 50000, date: '2026-09-10', status: 'pending_review', source: 'pos' }]) });
eq([est.trangThai, est.khoanCho.map(k => k.loai)], ['cho-so-that', ['du-doan', 'cho-duyet']], 'Còn số dự đoán / chờ duyệt → chờ số thật (không chốt được)');
eq(est.giaVon, 3000000, 'Khoản chờ duyệt chưa cộng vào số tạm tính');
const cfg = M.tcxMonthSummary({ ...base, store: 'xofa', list: [{ id: 'q', category: 'Đá', amount: 50000, date: '2026-09-10', status: 'approved', source: 'pos', costType: 'cogs' }, { id: 'f', category: 'Ship / vận chuyển', amount: 100000, date: '2026-09-11', status: 'approved', source: 'pos' }], B: { '2026-09': { xofa: { fixed: 9000000 } } } });
eq([cfg.nguonChiPhi, cfg.chiPhiCoDinh, cfg.giaVon, cfg.khauHao], ['cauhinh', 9100000, 50000, 0], 'Chưa nhập vận hành ở manage → chi phí cố định cấu hình 9tr + khoản nhân viên gửi');
const run = M.tcxMonthSummary({ ...base, month: '2026-10', rev: { '2026-10-01': 1000000 }, list: [], luongTay: 3100000, chamCong: [] });
eq([run.trangThai, run.soNgay, run.luong], ['dang-chay', 16, 1600000], 'Tháng đang chạy: tính tới hôm nay, lương tay chia theo ngày (16/31)');
const d = M.closingDoc(s, '2026-10-16T05:00:00Z');
eq([d.monthKey, d.storeId, d.closedBy, d.lai, d.luongTay, M.CLOSE_KEYS.every(k => typeof d[k] === 'number')], ['2026-09', 'tc33', 'manage', s.lai, 3000000, true], 'Ảnh chụp: trường lõi là số + phần riêng TC33 / XOFA');

const rows = M.shiftPayRows([{ id: 'e1', fullName: 'Minh', payType: 'hourly_part', hourlyRate: 25000 }, { id: 'e3', fullName: 'Chủ', payType: 'fixed' }],
  [{ employeeId: 'e1', businessDate: '2026-09-01', h: 4 }, { employeeId: 'e1', businessDate: '2026-09-02', h: 6 }, { employeeId: 'e3', businessDate: '2026-09-02', h: 8 }, { employeeId: 'x', businessDate: '2026-09-02', h: 8 }]);
eq(rows, [{ id: 'e1', name: 'Minh', hours: 10, sum: 250000 }], 'Lương chấm công: chỉ lương giờ, cộng theo ngày; lương cố định / người lạ bỏ qua');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
