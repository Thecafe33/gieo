// 03/10/2026 — Target doanh thu cho nhân viên (động lực). Hàm thật trích từ HTML, Firebase giả.
//  · Cấu hình theo thứ / theo tháng (chia đều ngày bán), ngày nghỉ, tháng chưa lưu thì dùng tháng gần nhất trước đó.
//  · POS chụp doanh thu các ngày đã qua (lúc mở ca hôm sau, bù ngày thiếu, không chụp lại) — cùng công thức Quản lý.
//  · Đảo % chỉ hiện phần trăm, không hiện số tiền.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
const SHARED = ['stPickConfig', 'stDailyTargets', 'stPct'];

// ── 1. Ba hàm tính target chép y hệt ở 2 app ──
eq(extract('posgieo.html', SHARED), extract('quanlygieo.html', SHARED), 'stPickConfig/stDailyTargets/stPct giống hệt nhau ở POS và Quản lý');
const S = new Function(extract('posgieo.html', SHARED) + '\nreturn { stPickConfig, stDailyTargets, stPct };')();

// ── 2. Tính target ──
{
  // Tháng 10/2026: 1/10 là thứ Năm. T2 1tr, T3 1,2tr, T4 1tr, T5 1,1tr, T6 1tr, T7 1,3tr, CN 1,5tr.
  const wd = { '1': 1000000, '2': 1200000, '3': 1000000, '4': 1100000, '5': 1000000, '6': 1300000, '0': 1500000 };
  const docs = [{ id: '2026-10', mode: 'weekday', weekday: wd, offDays: ['2026-10-20', '2026-09-30'] }];
  const c = S.stPickConfig('2026-10', docs);
  const t = S.stDailyTargets('2026-10', c);
  eq([Object.keys(t).length, t['2026-10-01'], t['2026-10-04'], t['2026-10-05'], t['2026-10-20']], [31, 1100000, 1500000, 1000000, 0],
    '31 ngày; 1/10 (T5) 1,1tr; 4/10 (CN) 1,5tr; 5/10 (T2) 1tr; 20/10 nghỉ = 0');
  // Tháng 10/2026: T2×4, T3×4 (trừ 20/10 nghỉ → 3), T4×4, T5×5, T6×5, T7×5, CN×4.
  const tong = Object.values(t).reduce((a, b) => a + b, 0);
  eq(tong, 4e6 + 3 * 1.2e6 + 4e6 + 5 * 1.1e6 + 5e6 + 5 * 1.3e6 + 4 * 1.5e6, 'target tháng = cộng target từng ngày theo đúng số thứ trong tháng, trừ ngày nghỉ');
  eq(c.offDays, ['2026-10-20'], 'ngày nghỉ khác tháng bị bỏ');

  const m = S.stDailyTargets('2026-10', S.stPickConfig('2026-10', [{ id: '2026-10', mode: 'month', monthTotal: 30000000, offDays: ['2026-10-10'] }]));
  eq([m['2026-10-01'], m['2026-10-10'], Math.round(Object.values(m).reduce((a, b) => a + b, 0))], [1000000, 0, 30000000],
    'nhập theo tháng 30tr, nghỉ 1 ngày → chia đều 30 ngày bán = 1tr/ngày, tổng đúng 30tr');

  const carry = S.stPickConfig('2026-12', [docs[0], { id: '2027-01', mode: 'month', monthTotal: 9 }, { id: '2026-08', mode: 'month', monthTotal: 1 }]);
  eq([carry.fromMonth, carry.mode, carry.offDays, carry.weekday['0']], ['2026-10', 'weekday', [], 1500000],
    'tháng 12 chưa lưu → dùng tháng gần nhất TRƯỚC đó (10), không lấy tháng sau, không mang ngày nghỉ');
  eq([S.stPickConfig('2026-10', []), S.stDailyTargets('2026-10', null)], [null, {}], 'chưa có cấu hình nào → không có target');
  eq([S.stPct(720000, 1000000), S.stPct(1125000, 1000000), S.stPct(5, 0)], [72, 112, null], '% làm tròn xuống; vượt thì ghi số thật; target 0 → không có %');
}

// ── 3. POS: chụp số + tiến độ ──
const posSrc = extract('posgieo.html', [...SHARED, 'stLoadConfig', 'stRevenueForDate', 'stEnsureSnapshots', 'stLoad', 'stProgress', 'stIslandHTML', 'posDateKey', 'posDateKeyToDisplay']);
function makePos(fake, nowIso) {
  const T = Date.parse(nowIso);
  const FakeDate = class extends Date { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } };
  const fs = fake.fstore;
  const F = new Function('fstore', 'db', 'firebase', 'MONTH_KEYS', 'Date', 'console',
    'const ST_CFG_COLL = "staff_target_config_gieogieo", ST_DAYS_COLL = "staff_target_days_gieogieo"; let _stCache = null, _stLoading = null;\n' + posSrc +
    '\nreturn { stLoad, stEnsureSnapshots, stRevenueForDate, stProgress, stIslandHTML, reset() { _stCache = null; } };')(
    fs, fake.db, { firestore: { FieldPath: { documentId: () => '__name__' } } },
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], FakeDate, { warn() {}, log() {}, error() {} });
  return F;
}
const bill = (date, total) => ({ date, total, items: 'x' });
(async () => {
  const fake = makeFake({
    rt: { orders_gieogieo: { oct: {
      '01': { a: bill('01/10/2026', 300000), b: bill('01/10/2026', 200000), c: bill('01/10/2025', 999999) },  // c: bill năm cũ cùng ngày
      '05': { d: bill('05/10/2026', 400000) },
      '06': { e: bill('06/10/2026', 100000) }
    } } },
    fs: {
      'staff_target_config_gieogieo/2026-10': { mode: 'month', monthTotal: 31000000, offDays: [] },
      'orders_gieogieo_archive/oct_01_2026': { orders: { a: bill('01/10/2026', 300000), z: bill('01/10/2026', 50000) } },
      'staff_target_days_gieogieo/2026-10': { days: { '2026-10-02': { revenue: 700000, bills: 3 } } }
    }
  });
  const P = makePos(fake, '2026-10-07T09:00:00');
  const c = await P.stLoad(true);
  const days = fake.FS['staff_target_days_gieogieo/2026-10'].days;
  eq(Object.keys(days).sort(), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'],
    'mở ca 7/10: chụp bù mọi ngày 1→6 còn thiếu, KHÔNG chụp hôm nay');
  eq([days['2026-10-01'].revenue, days['2026-10-01'].bills], [550000, 3], '1/10 (cũ ≥3 ngày): archive + RT gộp theo khoá bill, bỏ bill năm khác → 550k');
  eq([days['2026-10-02'].revenue, days['2026-10-05'].revenue, days['2026-10-06'].revenue, days['2026-10-03'].revenue], [700000, 400000, 100000, 0],
    'ngày đã chụp giữ nguyên (không chụp lại); 5/10, 6/10 lấy từ RT; ngày không bán = 0');

  // Bổ sung bill cho ngày đã chụp → không chụp lại (theo chốt với chủ quán).
  fake.RT.root.orders_gieogieo.oct['05'].f = bill('05/10/2026', 999000);
  await P.stLoad(true);
  eq(fake.FS['staff_target_days_gieogieo/2026-10'].days['2026-10-05'].revenue, 400000, 'bổ sung bill sau khi đã chụp → giữ số đã chụp');

  // Tiến độ: hôm nay 7/10 đã bán 500k (bill RAM), target 1tr/ngày, 31tr/tháng.
  const ram = [bill('07/10/2026', 300000), bill('07/10/2026', 200000), bill('06/10/2026', 100000)];
  const p = P.stProgress(c, ram, '07/10/2026');
  eq([p.dayPct, p.monthPct, p.dayOff, p.hasCfg, p.month], [50, Math.floor((550000 + 700000 + 0 + 0 + 400000 + 100000 + 500000) / 31000000 * 100), false, true, 10],
    '% ngày = 500k/1tr = 50%; % tháng = (số đã chụp 1→6 + hôm nay) / 31tr');
  const html = P.stIslandHTML(p);
  eq([/50%/.test(html), /đ\b|000/.test(html)], [true, false], 'đảo chỉ hiện %, không có số tiền');

  // Ngày nghỉ + chưa cấu hình.
  fake.FS['staff_target_config_gieogieo/2026-10'].offDays = ['2026-10-07'];
  P.reset();
  const c2 = await P.stLoad(false);
  const p2 = P.stProgress(c2, ram, '07/10/2026');
  eq([p2.dayOff, p2.dayPct, /ngày nghỉ/.test(P.stIslandHTML(p2))], [true, null, true], 'hôm nay là ngày nghỉ → thanh ngày ghi "ngày nghỉ"');

  const fake2 = makeFake({ rt: {}, fs: {} });
  // Tháng chưa có cấu hình riêng → truy vấn tháng trước (fakefb không hiểu FieldPath — giả lập truy vấn).
  const realColl = fake2.fstore.collection.bind(fake2.fstore);
  fake2.fstore.collection = name => name !== 'staff_target_config_gieogieo' ? realColl(name) : {
    doc: id => realColl(name).doc(id),
    where: (f, op, v) => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: (op === '<' && v === '2026-11')
      ? [{ id: '2026-10', data: () => ({ mode: 'weekday', weekday: { '1': 2000000 }, offDays: ['2026-10-12'] }) }] : [] }) }) }) })
  };
  const P2 = makePos(fake2, '2026-11-02T08:00:00');
  const c3 = await P2.stLoad(true);
  eq([c3.cfg && c3.cfg.fromMonth, c3.targets['2026-11-02'], c3.targets['2026-11-03'], c3.cfg.offDays], ['2026-10', 2000000, 0, []],
    'tháng 11 chưa lưu → dùng target tháng 10 (T2 2tr), không mang ngày nghỉ');
  const fakeEmpty = makeFake({ rt: {}, fs: {} });
  fakeEmpty.fstore.collection = (rc => name => name !== 'staff_target_config_gieogieo' ? rc(name) : { doc: id => rc(name).doc(id), where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) })(fakeEmpty.fstore.collection.bind(fakeEmpty.fstore));
  const P4 = makePos(fakeEmpty, '2026-11-02T08:00:00');
  const c4 = await P4.stLoad(true);
  eq(P4.stProgress(c4, [], '02/11/2026').hasCfg, false, 'chưa đặt target → hasCfg=false (bấm logo không mở)');

  // Đọc lỗi → không chụp số 0 giả.
  const fake3 = makeFake({ rt: {}, fs: {} });
  fake3.db.ref = () => ({ once: async () => { throw new Error('mất mạng'); } });
  const P5 = makePos(fake3, '2026-10-03T08:00:00');
  const out = await P5.stEnsureSnapshots('2026-10', {});
  eq([Object.keys(out).length, 'staff_target_days_gieogieo/2026-10' in fake3.FS], [0, false], 'đọc bill lỗi → không ghi số 0 giả, lượt sau chụp tiếp');

  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
