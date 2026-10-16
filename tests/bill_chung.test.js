// Bill chung (manage.html, 16/10) — widget Tổng quan nghe bill MỚI của mọi điểm bán hôm nay.
//   · Mỗi điểm 1 listener RT limitToLast(n) đúng đường dẫn POS ghi (TC33 có năm, XOFA / Gieo không năm, Gieo quán mới __ggNN).
//   · Cửa sổ limitToLast trượt (bill cũ nhất rơi ra) KHÔNG phải xoá bill; xoá thật thì báo remove.
//   · Bill năm khác ở đường dẫn không năm bị bỏ; bill chỉ là "mới" khi về sau đợt ban đầu và giờ ghi sau lúc gắn.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

// RT giả: ghi lại listener, phát sự kiện bằng tay
const L = [];
const db = { ref: path => ({ limitToLast: n => ({ path, n,
  on(ev, cb) { L.push({ path, n, ev, cb }); },
  off(ev, cb) { const i = L.findIndex(x => x.ev === ev && x.cb === cb); if (i >= 0) L.splice(i, 1); },
  once() { return Promise.resolve({}); } }) }) };
const emit = (path, ev, key, val) => L.filter(x => x.path === path && x.ev === ev).forEach(x => x.cb({ key, val: () => val }));
const B = new Function('db', 'ensureAuth', "const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], GIEO_LEGACY = 'gg01';\n" +
  extract('manage.html', ['pad', 'parseDkey', 'dkey', 'validDate', 'ggName', 'billPath', 'billYearOk', 'billWinSlide', 'watchBills']) +
  '\nreturn { billPath, billYearOk, billWinSlide, watchBills };')(db, async () => {});

eq(['tc33', 'xofa', 'gg01', 'gg02'].map(id => B.billPath(id, '2026-10-06')),
  ['orders/2026/oct/06', 'orders_xolifa/oct/06', 'orders_gieogieo/oct/06', 'orders_gieogieo__gg02/oct/06'], 'Đường dẫn RT đúng như POS từng quán ghi');
eq([B.billYearOk({ date: '16/10/2026' }, '2026-10-16'), B.billYearOk({ date: '16/10/2025' }, '2026-10-16'), B.billYearOk({ createdAt: 'x' }, '2026-10-16')],
  [true, false, true], 'Bill năm khác (đường dẫn không năm) bị bỏ; TC33 không có date → giữ');
eq([B.billWinSlide(new Set(['a', 'b', 'c']), 'a', 3), B.billWinSlide(new Set(['a', 'b', 'c']), 'b', 3), B.billWinSlide(new Set(['a', 'b']), 'a', 3)],
  [true, false, false], 'Cửa sổ đầy + khoá nhỏ nhất rơi ra = trượt; khoá giữa / cửa sổ chưa đầy = xoá thật');

const U = new Function(extract('manage.html', ['bfTime', 'bfIsNew']) + '\nreturn { bfTime, bfIsNew };')();
const at = Date.parse('2026-10-16T05:00:00Z');
eq([U.bfTime({ date: '16/10/2026', time: '12:00' }), U.bfTime({ createdAt: '2026-10-16T05:00:00Z' })], [at, at], 'Giờ bill: createdAt, thiếu thì date + time giờ VN');
eq([U.bfIsNew({ createdAt: '2026-10-16T04:59:58Z' }, at), U.bfIsNew({ createdAt: '2026-10-16T04:50:00Z' }, at), U.bfIsNew({}, at)], [true, false, false], 'Mới = ghi sau lúc gắn (trừ hao 3 giây)');

(async () => {
  const ev = [];
  const stop = await B.watchBills('xofa', '2026-10-16', 3, (t, k, o) => ev.push([t, k, o && o.total]));
  const P = 'orders_xolifa/oct/16';
  eq(L.map(x => x.ev + ':' + x.n), ['child_added:3', 'child_changed:3', 'child_removed:3'], 'Chỉ nghe child_* với limitToLast(n) — không đọc cả ngày');
  await new Promise(r => setTimeout(r, 0));
  eq(ev.pop(), ['ready', null, undefined], 'Báo ready sau đợt ban đầu');
  emit(P, 'child_added', 'k1', { total: 1, date: '16/10/2026' }); emit(P, 'child_added', 'k2', { total: 2, date: '16/10/2026' });
  emit(P, 'child_added', 'k0', { total: 9, date: '16/10/2025' }); emit(P, 'child_added', 'k3', { total: 3, date: '16/10/2026' });
  eq(ev.splice(0), [['add', 'k1', 1], ['add', 'k2', 2], ['add', 'k3', 3]], 'Bill năm khác không báo');
  emit(P, 'child_removed', 'k0', null); emit(P, 'child_added', 'k4', { total: 4, date: '16/10/2026' });
  eq(ev.splice(0), [['add', 'k4', 4]], 'Bill mới làm cửa sổ trượt → không báo xoá bill cũ');
  emit(P, 'child_removed', 'k3', null);
  eq(ev.splice(0), [['remove', 'k3', undefined]], 'Xoá bill giữa cửa sổ → báo xoá');
  emit(P, 'child_changed', 'k4', { total: 40, date: '16/10/2026' });
  eq(ev.splice(0), [['change', 'k4', 40]], 'Sửa bill → báo sửa');
  stop();
  eq(L.length, 0, 'Gỡ đủ 3 listener');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL lỗi chạy', e && e.stack); process.exit(1); });
