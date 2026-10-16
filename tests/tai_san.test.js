// Tài sản TC33 / XOFA + giảm lượt đọc manage.html (16/10).
//   · Khấu hao y như monthlyDepreciation của quanlygieo (tháng = nguyên giá ÷ số tháng, mỗi ngày = tháng ÷ số ngày tháng) → vào hoà vốn.
//   · Bản tổng hợp chi phí tháng (expense_sums) cho ra đúng phân bổ như đọc từng khoản chi.
//   · Lãi/lỗ Gieo: tháng đã ổn định lưu trong máy → mở lần 2 không đọc lại.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.abs(a - b) < 0.5, true, m + ' (' + a + ' ≈ ' + b + ')');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'manage.html'), 'utf8');
const CATS = src.match(/const DEFAULT_EXPENSE_CATS = (\[[\s\S]*?\n\]);/)[0];
const HELP = "const monthStartOf = k => k.slice(0, 7) + '-01', monthEndOf = k => k.slice(0, 7) + '-' + String(daysInMonthYm(k.slice(0, 7))).padStart(2, '0');\nconst r2 = v => Math.round(v * 100) / 100;\n";
const N = ['pad', 'parseDkey', 'addDays', 'dkey', 'daysBetween', 'daysInMonthYm', 'beMonthValue', 'plBreakEven', 'expenseCatsAll', 'expCostType', 'expCounts', 'expPaidOf', 'expAllocate',
  'assetEndDate', 'assetLive', 'assetMonthly', 'assetDepDay', 'assetRecovered', 'tcxBreakEven', 'expMonthsOf', 'expMonthSum', 'sumsToAlloc', 'expIsBase'];
const M = new Function(CATS + '\n' + HELP + extract('manage.html', N) + '\nreturn {' + N.join(',') + '};')();
const Q = new Function(extract('quanlygieo.html', ['pad', 'dkey', 'monthlyDepreciation']) + '\nreturn { monthlyDepreciation };')();

// ── Khấu hao ──
const A = [{ id: 'a', store: 'xofa', name: 'Máy pha', purchaseCost: 36000000, purchaseDate: '2026-11-01', usefulLifeMonths: 36 },
  { id: 'b', store: 'xofa', name: 'Tủ mát', purchaseCost: 12000000, purchaseDate: '2026-11-15', usefulLifeMonths: 12 },
  { id: 'c', store: 'tc33', name: 'Sofa', purchaseCost: 6000000, purchaseDate: '2026-10-01', usefulLifeMonths: 6, active: false },
  { id: 'd', store: 'tc33', name: 'Đèn', purchaseCost: 3000000, purchaseDate: '2026-10-01', usefulLifeMonths: 3 }];
for (const d of ['2026-10-31', '2026-11-10', '2026-12-01', '2027-11-14', '2027-11-15', '2029-10-31', '2029-11-01'])
  for (const st of ['xofa', 'tc33']) near(M.assetMonthly(A, st, d), Q.monthlyDepreciation(A.filter(a => a.store === st), d), 'Khấu hao tháng ' + st + ' ngày ' + d + ' = monthlyDepreciation của quanlygieo');
near(M.assetDepDay(A, 'xofa', '2026-12-10'), (1000000 + 1000000) / 31, 'Mỗi ngày tháng 12 = (1tr + 1tr) ÷ 31');
near(M.assetRecovered(A[3], '2027-06-01'), 3000000, 'Đèn 3 tháng: thu hồi đủ 3tr, không vượt nguyên giá');
near(M.assetRecovered(A[3], '2026-10-31'), 1000000, 'Đèn: hết tháng 10 thu hồi 1tr');
eq(M.assetMonthly(A, 'tc33', '2026-10-05'), 1000000, 'Tài sản đã ngừng (bán / thanh lý) không khấu hao');
const B = { '2026-12': { xofa: { fixed: 3100000, cogsPct: 40 } } };
const be = M.tcxBreakEven(B, 'xofa', [{ date: '2026-12-10', rev: 500000 }], null, A);
near(be.hoaVon, 100000 + 2000000 / 31, 'Hoà vốn: khấu hao tài sản cộng vào phần cần đắp của ngày');
near(be.khauHao, 2000000 / 31, 'Hoà vốn: tách riêng số khấu hao');

// ── Bản tổng hợp chi phí tháng = phân bổ từng khoản ──
const cats = M.expenseCatsAll(null);
const E = [{ id: 'q', periodType: 'period', startDate: '2026-11-01', endDate: '2027-01-31', date: '2026-11-01', paidDate: '2026-11-01', category: 'Tiền thuê nhà', amount: 9200000, status: 'approved' },
  { id: 'm', periodType: 'onetime', date: '2026-12-05', category: 'Nguyên liệu / mua hàng', amount: 300000, status: 'approved', paidDate: '2026-12-05' },
  { id: 'p', periodType: 'onetime', date: '2026-12-06', category: 'Đá', amount: 40000, status: 'pending_review', source: 'pos' },
  { id: 'x', periodType: 'onetime', date: '2026-12-07', category: 'Đá', amount: 40000, status: 'rejected' }];
eq(M.expMonthsOf(E[0]), ['2026-11', '2026-12', '2027-01'], 'Khoản theo kỳ chạm 3 tháng (dựng lại cả 3 bản tổng hợp khi sửa)');
const sums = {}; ['2026-11', '2026-12', '2027-01'].forEach(ym => { sums[ym] = M.expMonthSum(E, ym); });
eq([sums['2026-11'].paid, sums['2026-12'].paid, sums['2026-12'].count], [9200000, 300000, 2], 'Tổng hợp: tiền đã trả theo tháng trả; chờ duyệt / từ chối không tính');
const a1 = M.sumsToAlloc(sums, cats), a2 = M.expAllocate(E, cats);
eq(Object.keys(a1.byDay).length, Object.keys(a2.byDay).length, 'Tổng hợp: đủ ngày như phân bổ trực tiếp');
eq(Object.keys(a2.byDay).every(d => Math.abs(a1.byDay[d].fixed - a2.byDay[d].fixed) < 0.02 && Math.abs(a1.byDay[d].cogs - a2.byDay[d].cogs) < 0.02), true, 'Tổng hợp: từng ngày khớp phân bổ trực tiếp (Giá vốn / Vận hành)');
eq([...a1.months].sort(), ['2026-11', '2026-12', '2027-01'], 'Tổng hợp: tháng có chi phí thật');
eq([sums['2026-11'].base, M.expMonthSum([E[2]], '2026-12').base], [true, false], 'Tổng hợp: base = tháng có khoản vận hành do manage nhập (khoản nhân viên gửi không tính)');
eq([...a1.base].sort(), ['2026-11', '2026-12', '2027-01'], 'Tổng hợp → phân bổ: giữ base từng tháng');
const r1 = M.tcxBreakEven({}, 'xofa', [{ date: '2026-12-05', rev: 1000000 }], a1), r2_ = M.tcxBreakEven({}, 'xofa', [{ date: '2026-12-05', rev: 1000000 }], { list: E, cats });
near(r1.hoaVon, r2_.hoaVon, 'Hoà vốn từ bản tổng hợp = từ từng khoản chi');

// ── Lãi/lỗ Gieo: đệm tháng ổn định ──
(async () => {
  const LS = {}; let queries = 0;
  const docs = {}; for (let d = new Date('2026-01-01T12:00:00'); d <= new Date('2026-10-15T12:00:00'); d.setDate(d.getDate() + 1)) { const k = d.toISOString().slice(0, 10); docs[k] = { date: k, lai: 1 }; }
  const q = (f = []) => ({ where: (a, op, v) => q(f.concat([[op, v]])), get: async () => { queries++; return { docs: Object.values(docs).filter(x => f.every(([op, v]) => op === '>=' ? x.date >= v : x.date <= v)).map(x => ({ data: () => x })) }; } });
  const env = { fstore: { collection: () => q() }, localStorage: { getItem: k => LS[k] || null, setItem: (k, v) => { LS[k] = v; } }, console: { warn() {} } };
  const realNow = Date; global.Date = class extends realNow { constructor(...a) { super(...(a.length ? a : ['2026-10-16T05:00:00Z'])); } static now() { return new realNow('2026-10-16T05:00:00Z').getTime(); } };
  const read = new Function(...Object.keys(env), HELP + extract('manage.html', ['pad', 'parseDkey', 'addDays', 'dkey', 'daysInMonthYm', 'pool', 'ggName', 'plCacheLoad', 'plCacheSave', 'readPlBook', 'readPlDays']) +
    "\nconst GIEO_LEGACY='gg01', PL_CACHE_KEY='mg_pl_cache_v1', PL_STABLE_DAYS=35;\nreturn readPlDays;")(...Object.values(env));
  const R = [{ id: 'gg01' }];
  const y1 = await read(R, '2026-01-01', '2026-10-15');
  eq([Object.keys(y1.gg01).length, queries], [288, 1], 'Xem cả năm lần đầu: 1 truy vấn, đủ 288 ngày');
  queries = 0; let got = 0; const qq = env.fstore.collection; env.fstore.collection = () => { const x = qq(); const g = x.where; x.where = (...a) => { const y = g(...a); const g2 = y.where; y.where = (...b) => { const z = g2(...b); const gg = z.get; z.get = async () => { const r = await gg(); got += r.docs.length; return r; }; return z; }; return y; }; return x; };
  const y2 = await read(R, '2026-01-01', '2026-10-15');
  eq(Object.keys(y2.gg01).length, 288, 'Lần 2: vẫn đủ 288 ngày');
  eq(got <= 46, true, 'Lần 2: chỉ đọc lại phần chưa ổn định (≤ 46 ngày gần nhất, đọc ' + got + ')');
  const m1 = await read(R, '2026-03-10', '2026-03-20');
  eq(Object.keys(m1.gg01).length, 11, 'Khoảng nằm trong tháng đã lưu: lấy từ đệm, đúng khoảng ngày');
  // Sổ gộp: quán đã có sổ → 1 lượt đọc cho mọi ngày, không truy vấn pl_days
  {
    let soReads = 0, q2 = 0;
    const book = { d: {} }; Object.keys(docs).forEach(k => { book.d[k] = { lai: 2, updatedAt: 'x' }; });
    const env2 = { fstore: { collection: () => ({ doc: () => ({ get: async () => { soReads++; return { exists: true, data: () => book }; } }), where: () => ({ where: () => ({ get: async () => { q2++; return { docs: [] }; } }) }) }) },
      localStorage: env.localStorage, console: { warn() {} } };
    const read2 = new Function(...Object.keys(env2), HELP + extract('manage.html', ['pad', 'parseDkey', 'addDays', 'dkey', 'daysInMonthYm', 'pool', 'ggName', 'plCacheLoad', 'plCacheSave', 'readPlBook', 'readPlDays']) +
      "\nconst GIEO_LEGACY='gg01', PL_CACHE_KEY='mg_pl_cache_v1', PL_STABLE_DAYS=35;\nreturn readPlDays;")(...Object.values(env2));
    const y3 = await read2(R, '2026-01-01', '2026-10-15');
    eq([Object.keys(y3.gg01).length, y3.gg01['2026-05-05'].lai, soReads, q2], [288, 2, 1, 0], 'Sổ gộp: cả năm = 1 lượt đọc (288 ngày), không truy vấn pl_days');
  }
  global.Date = realNow;
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})();
