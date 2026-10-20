// pos.html (The Cafe 33) — tự trả bed quên bấm ở ngày cũ (12/10/2026): runBedAutoCloseStale.
// Lịch "đang dùng" đã quá giờ kết thúc → 'đã xong', realEndTime = giờ kết thúc khách đặt.
// Ngày còn ở RT → ghi RT; ngày đã archive → ghi bedBookings_archive (KHÔNG dựng lại node RT).
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const NAMES = ['_bedIsActiveStatus', '_bedHmOn', '_bedSessionBounds', '_bedNeedsAutoClose', '_bedSessionSpendOn', '_bedTodayKey', 'runBedAutoCloseStale'];
const src = 'var BED_AUTOCLOSE_DAYS = 14; var _bedAutoCloseRunning = null;\n' + extract('pos.html', NAMES);
const pad = n => String(n).padStart(2, '0');
// 00:30 VN: luôn chạy được ca qua đêm; fixture không phụ thuộc múi giờ máy test.
const NOW=Date.parse('2026-10-20T17:30:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[NOW]))}static now(){return NOW}}
const vnDate=new Function('Date',extract('pos.html',['vnDate'])+';return vnDate;')(Clock);
const dayParts = back => { const n = vnDate(); const d = vnDate(n.getFullYear(), n.getMonth(), n.getDate() - back); return [String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate())]; };

function world({ rt = {}, fs = {}, orders = [] }) {
  const writes = []; const ls = {}; const modals = [];
  const get = path => path.split('/').reduce((o, k) => (o == null ? undefined : o[k]), rt);
  const db = { ref: path => ({
    once: async () => { const v = get(path); return { val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) }; },
    update: async patch => { writes.push(['rt', path, patch]); const parts = path.split('/'); let o = rt; parts.forEach(k => { o[k] = o[k] || {}; o = o[k]; }); Object.assign(o, patch); }
  }) };
  const fstore = { collection: () => ({ doc: y => ({ collection: m => ({ doc: d => ({
    get: async () => { const v = fs[`${y}/${m}/${d}`]; return { exists: !!v, data: () => ({ bookings: JSON.parse(JSON.stringify(v || {})) }) }; },
    update: async upd => { writes.push(['fs', `${y}/${m}/${d}`, upd]); }
  }) }) }) }) };
  const localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } };
  const fn = new Function('Date','db', 'fstore', 'fetchOrdersByDateRange', 'normalizePhone', 'localStorage', 'showAppModal', src + '\nreturn { runBedAutoCloseStale, _bedNeedsAutoClose };');
  const api = fn(Clock,db, fstore, async () => orders, p => String(p || '').replace(/\D/g, ''), localStorage, (t, msg) => modals.push(msg));
  return { api, writes, ls, modals, rt };
}

(async () => {
  const [y1, m1, d1] = dayParts(1), [y5, m5, d5] = dayParts(5);
  const ordersAt = (y, m, d, hh, mm, total, sdt) => ({ sdt, total, createdAt: vnDate(+y, +m - 1, +d, hh, mm).toISOString() });
  const W = world({
    rt: { bedBookings: { [y1]: { [m1]: { [d1]: {
      A: { name: 'An', phone: '0901', start: '14:00', end: '16:00', status: 'active', bedId: 2 },
      B: { name: 'Bình', phone: '0902', start: '15:00', end: '17:00', status: 'đã xong', realEndTime: '17:40' },
      C: { name: 'Chi', phone: '0903', start: '18:00', end: '20:00', status: 'chờ khách' }
    } } } } },
    fs: { [`${y5}/${m5}/${d5}`]: { Z: { name: 'Zin', phone: '0909', start: '09:00', end: '11:00', status: 'đang dùng' } } },
    orders: [ordersAt(y1, m1, d1, 14, 10, 50000, '0901'), ordersAt(y1, m1, d1, 15, 0, 20000, '0901'), ordersAt(y1, m1, d1, 18, 0, 99000, '0901'), ordersAt(y1, m1, d1, 15, 0, 30000, '0902'),
      ordersAt(y5, m5, d5, 10, 0, 40000, '0909')]
  });
  const n = await W.api.runBedAutoCloseStale();
  eq(n, 2, 'Trả 2 lịch quên bấm (1 ngày RT + 1 ngày đã archive)');
  const rtW = W.writes.filter(w => w[0] === 'rt'), fsW = W.writes.filter(w => w[0] === 'fs');
  eq(rtW.map(w => [w[1].endsWith('/A'), w[2].status, w[2].realEndTime, w[2].totalSpend, w[2].autoCheckout]), [[true, 'đã xong', '16:00', 70000, true]],
    'Ngày RT: lịch A → đã xong, giờ trả = 16:00 đã đặt, chi tiêu trong giờ lịch ±5 phút');
  eq(fsW.length === 1 && [fsW[0][2]['bookings.Z.status'], fsW[0][2]['bookings.Z.realEndTime'], fsW[0][2]['bookings.Z.totalSpend']], ['đã xong', '11:00', 40000],
    'Ngày đã archive: ghi thẳng vào bedBookings_archive, không dựng lại node RT');
  eq(((W.rt.bedBookings[y5] || {})[m5] || {})[d5], undefined, 'Không tạo node RT cho ngày đã archive (nguyên nhân lỗi "hỏng cả ngày")');
  eq([W.rt.bedBookings[y1][m1][d1].B.realEndTime, W.rt.bedBookings[y1][m1][d1].C.status], ['17:40', 'chờ khách'], 'Không đụng lịch đã trả tay / chờ khách');
  eq(W.modals.length, 1, 'Báo cho nhân viên số lịch đã tự trả');
  eq(await W.api.runBedAutoCloseStale(), 0, 'Mỗi ngày quét 1 lần');

  // Lịch qua đêm hôm qua chưa tới giờ kết thúc → không trả, không chốt "đã quét".
  const now = vnDate();
  const later = vnDate(now.getTime() + 2 * 3600000), earlier = vnDate(now.getTime() - 20 * 3600000);
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const W2 = world({ rt: { bedBookings: { [y1]: { [m1]: { [d1]: { N: { phone: '1', start: hm(earlier), end: hm(later), status: 'active' } } } } } } });
  const qua = W2.api._bedNeedsAutoClose({ start: hm(earlier), end: hm(later), status: 'active' }, y1, m1, d1, now.getTime());
  if (hm(later) <= hm(earlier)) {   // chỉ đúng là lịch qua đêm khi giờ kết thúc ≤ giờ bắt đầu
    eq(qua, false, 'Lịch qua đêm chưa tới giờ kết thúc → chưa trả');
    eq(await W2.api.runBedAutoCloseStale(), 0, 'Không trả lịch qua đêm còn hạn');
    eq(W2.ls.bedAutoClose_day, undefined, 'Còn lịch qua đêm → chưa chốt "đã quét hôm nay", quét lại sau');
  } else console.log('ok (bỏ qua ca qua đêm — giờ chạy test không tạo được lịch qua đêm)');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})();
