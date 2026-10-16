// Điểm hoà vốn (16/10) — manage.html (TC33 + XOFA cấu hình; Gieo đọc tóm tắt lãi/lỗ quanlygieo ghi vào pl_days_gieogieo).
//   · plBreakEven của manage CHÉP NGUYÊN của quanlygieo (khoá giống hệt).
//   · Gieo: tóm tắt từng ngày (plTomTatNgay của quanlygieo) cộng lại ở manage ra ĐÚNG lãi + hoà vốn mà quanlygieo tính
//     cho cả dải (plSumDays → plBreakEven); một ngày = đúng số hoà vốn quanlygieo đã ghi.
//   · TC33 / XOFA: hoà vốn = chi phí cố định ÷ (1 − giá vốn %), lãi = (doanh thu − hoà vốn) × biên đóng góp.
'use strict';
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.abs(a - b) < 0.5, true, m + ' (' + a + ' ≈ ' + b + ')');

const MG = ['daysInMonthYm', 'beMonthValue', 'plBreakEven', 'tcxBreakEven', 'ggBreakEven'];
const M = new Function("const PL_SUM_KEYS=['doanhThu','giaVon','phiKenh','luong','chiPhiCoDinh','khauHao','haoHut','bienPhiKhac','tongChiPhi','lai','laiTruocKhauHao'];\n" +
  extract('manage.html', MG) + '\nreturn {' + MG.join(',') + '};')();
const Q = new Function("const PL_TOM_TAT_KEYS=['doanhThu','giaVon','phiKenh','luong','chiPhiCoDinh','khauHao','haoHut','bienPhiKhac','tongChiPhi','lai','laiTruocKhauHao'];\n" +
  extract('quanlygieo.html', ['plBreakEven', 'plSumDays', 'plTomTatNgay']) + '\nreturn { plBreakEven, plSumDays, plTomTatNgay };')();

eq(extract('manage.html', ['plBreakEven']), extract('quanlygieo.html', ['plBreakEven']), 'plBreakEven của manage giống hệt quanlygieo');
{
  const src = s => fs.readFileSync(path.join(__dirname, '..', s), 'utf8');
  const da = fs.readdirSync(path.join(__dirname, '..')).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => parseInt(a.slice(13)) - parseInt(b.slice(13))).pop();
  eq(/'pl_days'/.test(src(da)), true, 'pl_days_gieogieo đăng ký riêng từng quán trong ' + da);
  eq((src('quanlygieo.html').match(/plLuuTomTat\(/g) || []).length, 5, 'quanlygieo ghi tóm tắt ở Hôm nay, Sức khoẻ, Tổng kết tháng, dải ngày (cửa sổ 30 ngày / thu hồi vốn) + 1 định nghĩa');
  eq(/ggName\('pl_days_gieogieo', *r\.id\)/.test(src('manage.html')), true, 'manage đọc pl_days theo tên từng quán (gg02 → __gg02)');
}

// ── TC33 / XOFA ─────────────────────────────────────────────────────────
const B = { '2026-10': { tc33: { fixed: 31000000, cogsPct: 40 } }, '2026-12': { tc33: { fixed: 62000000, cogsPct: 30 }, xofa: { fixed: 3100000, cogsPct: 50 } } };
eq(M.beMonthValue(B, '2026-11', 'tc33'), { fixed: 31000000, cogsPct: 40, from: '2026-10' }, 'Cấu hình: tháng chưa đặt dùng tháng gần nhất trước đó');
eq(M.beMonthValue(B, '2026-11', 'xofa'), null, 'Cấu hình: trước tháng đặt đầu tiên → chưa có');
// [16/10] TC33 / XOFA không có lãi / lỗ: hoà vốn = chi phí cố định của các ngày (% giá vốn cũ trong cấu hình bỏ qua).
const t1 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-10-16', rev: 2000000 }]);
near(t1.hoaVon, 1000000, 'TC33 1 ngày: hoà vốn = 31tr ÷ 31 ngày (không chia cho giá vốn %)');
eq([t1.dat, t1.lai], [true, undefined], 'TC33: doanh thu 2tr > hoà vốn 1tr → đã hoà vốn; không có số lãi / lỗ');
near(t1.vuot, 1000000, 'TC33: vượt hoà vốn 1tr');
const t2 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-10-16', rev: 500000 }, { date: '2026-10-17', rev: 700000 }]);
near(t2.hoaVon, 2000000, 'TC33 2 ngày: hoà vốn = chi phí cố định 2 ngày');
eq(t2.dat, false, 'TC33: dưới hoà vốn → chưa hoà vốn');
near(t2.conThieu, 800000, 'TC33: còn thiếu 800k');
const t3 = M.tcxBreakEven(B, 'xofa', [{ date: '2026-11-30', rev: 100000 }, { date: '2026-12-01', rev: 300000 }]);
eq([t3.soNgay, t3.thieu], [1, 1], 'XOFA: ngày chưa cấu hình không tính, đếm thiếu');
near(t3.hoaVon, 100000, 'XOFA: hoà vốn ngày 1/12 = 3,1tr ÷ 31');
eq(M.tcxBreakEven(B, 'xofa', [{ date: '2026-10-01', rev: 1 }]), null, 'XOFA chưa cấu hình → null');
const t4 = M.tcxBreakEven(B, 'tc33', [{ date: '2026-10-16', rev: 0 }]);
eq([Math.round(t4.hoaVon), t4.conThieu > 0], [1000000, true], 'TC33 chưa bán: còn thiếu đúng chi phí cố định ngày');

// ── Gieo: tóm tắt quanlygieo → manage ──────────────────────────────────
const day = (date, dt, gv, cd, extra = {}) => {
  const d = Object.assign({ date, doanhThu: dt, giaVon: gv, phiKenh: 0, luong: 300000, chiPhiCoDinh: cd, khauHao: 50000, haoHut: 20000, bienPhiKhac: 10000, mucTinCay: 'chot-thang' }, extra);
  d.tongChiPhi = d.giaVon + d.phiKenh + d.luong + d.chiPhiCoDinh + d.khauHao + d.haoHut + d.bienPhiKhac;
  d.lai = d.doanhThu - d.tongChiPhi; d.laiTruocKhauHao = d.lai + d.khauHao; return d;
};
const days = [day('2026-10-13', 1500000, 450000, 200000), day('2026-10-14', 900000, 300000, 200000, { phiKenh: 30000 }), day('2026-10-15', 0, 0, 200000, { mucTinCay: 'chot-ngay' })];
const BDP = 0.65;
const snap = {}; days.forEach(d => { snap[d.date] = Q.plTomTatNgay(d, Q.plBreakEven(d, BDP)); });
const g1 = M.ggBreakEven(snap, ['2026-10-13']);
eq([g1.hoaVon, g1.lai, g1.dat], [Q.plBreakEven(days[0], BDP).hoaVon, days[0].lai, days[0].lai >= 0].map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v), 'Gieo 1 ngày: đúng hoà vốn + lãi quanlygieo đã tính');
const tong = Q.plSumDays(days), all = M.ggBreakEven(snap, days.map(d => d.date));
near(all.lai, tong.lai, 'Gieo nhiều ngày: lãi = plSumDays của quanlygieo');
near(all.hoaVon, Q.plBreakEven(tong, BDP).hoaVon, 'Gieo nhiều ngày: hoà vốn = plBreakEven(plSumDays) của quanlygieo');
near((tong.doanhThu - all.hoaVon) * (1 - (tong.giaVon + tong.phiKenh) / tong.doanhThu), all.lai, 'Gieo: lãi = (doanh thu − hoà vốn) × biên đóng góp');
eq([all.mucTinCay, all.soNgay, all.thieu], ['chot-ngay', 3, 0], 'Gieo: mức tin cậy = mức yếu nhất các ngày');
const miss = M.ggBreakEven(snap, ['2026-10-14', '2026-10-15', '2026-10-16']);
eq([miss.soNgay, miss.thieu], [2, 1], 'Gieo: ngày quanlygieo chưa ghi → đếm thiếu');
eq(M.ggBreakEven({}, ['2026-10-16']), { nguon: 'quanlygieo', coSo: false, thieu: 1, soNgay: 0 }, 'Gieo: chưa có số → coSo false');
eq(M.ggBreakEven(null, ['2026-10-16']), null, 'Gieo: không đọc được → null');

// ── quanlygieo plLuuTomTat: chỉ ghi ngày đổi số, hôm nay chỉ màn Hôm nay ghi, Xem tất cả không ghi ──
(async () => {
  const mk = (QL_ALL, storeId) => {
    const writes = [], LS = {};
    const fstore = { collection: n => ({ doc: id => ({ path: n + '/' + id }) }),
      batch: () => { const ops = []; return { set: (ref, d) => ops.push([ref.path, d]), commit: () => { writes.push(...ops); return Promise.resolve(); } }; } };
    const GieoData = { storeId: () => storeId };
    const env = { QL_ALL, fstore, GieoData, window: { GieoData }, localStorage: { getItem: k => LS[k] || null, setItem: (k, v) => { LS[k] = v; } },
      dkey: () => '2026-10-16', configForDate: () => ({ targets: { cogsPct: 35 } }), console: { warn(...a) { console.log('WARN', ...a); } } };
    const f = new Function(...Object.keys(env), "const PL_TOM_TAT_KEYS=['doanhThu','giaVon','phiKenh','luong','chiPhiCoDinh','khauHao','haoHut','bienPhiKhac','tongChiPhi','lai','laiTruocKhauHao'];\n" +
      extract('quanlygieo.html', ['plBreakEven', 'plTomTatNgay', 'plLuuTomTat']) + '\nreturn plLuuTomTat;')(...Object.values(env));
    return { f, writes, LS };
  };
  const tick = () => new Promise(r => setTimeout(r, 5));
  const today = day('2026-10-16', 400000, 120000, 200000, { mucTinCay: 'dang-chay' });
  const A = mk(false, 'gg01');
  A.f(days.concat([today])); await tick();
  eq(A.writes.map(w => w[0]), ['pl_days_gieogieo/2026-10-13', 'pl_days_gieogieo/2026-10-14', 'pl_days_gieogieo/2026-10-15'], 'Ghi các ngày đã qua; hôm nay để màn Hôm nay ghi');
  eq(A.writes[0][1].storeId === 'gg01' && A.writes[0][1].hoaVon > 0 && !!A.writes[0][1].updatedAt, true, 'Bản ghi có quán, hoà vốn, giờ cập nhật');
  A.f(days); await tick();
  eq(A.writes.length, 3, 'Mở lại, số không đổi → không ghi lại');
  A.f([day('2026-10-14', 950000, 300000, 200000)]); await tick();
  eq(A.writes.length, 4, 'Số một ngày đổi (chi phí / doanh thu cập nhật) → ghi lại đúng ngày đó');
  A.f([today], { homNay: true, be: Q.plBreakEven(today, 0.6) }); await tick();
  eq(A.writes[4][0] + ' ' + A.writes[4][1].hoaVon, 'pl_days_gieogieo/2026-10-16 ' + Math.round(Q.plBreakEven(today, 0.6).hoaVon * 100) / 100, 'Màn Hôm nay ghi hôm nay, đúng hoà vốn đang hiện');
  const X = mk(true, null); X.f(days); await tick();
  eq(X.writes.length, 0, 'Xem tất cả: không ghi');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})();
