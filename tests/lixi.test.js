// lixi.v1.js — lì xì Tết 2027: lịch, tỉ lệ, mở bao (transaction), cộng lượt, mã dùng được, đánh dấu dùng, thống kê, xoá hết.
const path = require('path');
const { makeFake } = require('./lib/fakefb');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
delete require.cache[require.resolve('../lixi.v1.js')];
const L = require('../lixi.v1.js');
const at = iso => Date.parse(iso + '+07:00');               // giờ VN
const setNow = iso => L._setOffset(at(iso) - Date.now());

// ── lịch
chk(L.vnDay(at('2027-02-03T00:05:00')) === '2027-02-03', 'vnDay theo giờ VN (00:05 3/2 VN vẫn là 3/2)');
chk(!L.inGive(at('2027-02-02T23:59:00')) && L.inGive(at('2027-02-03T00:00:00')), 'phát từ 0h 27 Tết (3/2)');
chk(L.inGive(at('2027-02-10T23:59:00')) && !L.inGive(at('2027-02-11T00:00:00')), 'phát tới hết mùng 5 (10/2)');
chk(!L.inUse(at('2027-02-07T23:59:00')) && L.inUse(at('2027-02-08T00:00:00')), 'dùng từ mùng 3 (8/2)');
chk(L.inUse(at('2027-02-15T23:59:00')) && !L.inUse(at('2027-02-16T00:00:00')) && L.isOver(at('2027-02-16T00:00:00')), 'hết hạn từ mùng 11 (16/2)');
chk(L.daysToTet(at('2027-01-27T09:00:00')) === 10 && L.daysToTet(at('2027-02-06T01:00:00')) === 0, 'đếm ngày tới mùng 1');

// ── tỉ lệ
chk(L.chance('2027-02-03', true) === 0.9 && L.chance('2027-02-06', true) === 0.9, 'có mua 24h: luôn 90%');
chk(L.chance('2027-02-03', false) === 0.1 && L.chance('2027-02-10', false) === 0.1, 'không mua, ngày thường: 10%');
chk(['2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08'].every(d => L.chance(d, false) === 0.8), 'không mua, 29 Tết + mùng 1–3: 80%');
chk(L.boughtRecently('2027-02-04T10:00:00+07:00', at('2027-02-05T09:59:00')) && !L.boughtRecently('2027-02-04T10:00:00+07:00', at('2027-02-05T10:01:00')), 'mua trong 24h (lastVisit)');
chk(L.draw('2027-02-03', false, 0.15, 0) === null && L.draw('2027-02-03', false, 0.05, 0) === 'upsize_xofa', 'bốc: r1 ≥ tỉ lệ → trượt');
const cnt = {}; for (let i = 0; i < 1000; i++) { const t = L.pickPrize(i / 1000); cnt[t] = (cnt[t] || 0) + 1; }
chk(cnt.upsize_xofa === 250 && cnt.upsize_tc33 === 250 && cnt.giam5k_xofa === 250 && cnt.giam10k_bed === 150 && cnt.bed1h === 100, 'tỉ lệ loại 25/25/25/15/10');
chk(L.normPhone('+84 912 345 678') === '0912345678', 'chuẩn hoá SĐT 84 → 0');

(async () => {
  const f = makeFake();
  L.init({ fstore: f.fstore, FieldValue: f.FieldValue });
  const P = '0912345678';
  const doc = () => f.FS['lixi_tet_2027/' + P];
  let seq = [0.05, 0.0, 0.3, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9];   // ngẫu nhiên giả: r1, r2, mã...
  const rnd = () => { const v = seq.shift(); return v == null ? 0.5 : v; };

  // ngoài đợt: không đọc / ghi gì
  setNow('2027-01-20T10:00:00');
  const s0 = await L.load(P); chk(!s0.give && s0.free === 0 && !doc(), 'trước đợt: load không đọc, không có bao');
  let e0 = null; try { await L.open(P, null, rnd); } catch (e) { e0 = e.message; } chk(e0 === 'het-dot', 'trước đợt: không mở được');
  chk(await L.grantOpen(P, 'xofa', 'o1') === false && !doc(), 'trước đợt: đơn không cộng lượt');

  // 27 Tết: mở bao miễn phí (không mua → 10%, r1=0.05 trúng)
  setNow('2027-02-03T09:00:00');
  const r1 = await L.open(P, null, rnd);
  chk(r1.win && r1.usedFree && r1.code.type === 'upsize_xofa' && /^TET[A-Z0-9]{5}$/.test(r1.code.id), 'mở bao miễn phí: trúng upsize XOFA, mã TETxxxxx');
  chk(doc().freeDay === '2027-02-03' && doc().opened === 1 && doc().wins === 1, 'ghi freeDay + đếm lượt mở');
  let e1 = null; try { await L.open(P, null, rnd); } catch (e) { e1 = e.message; } chk(e1 === 'het-luot', 'hết bao miễn phí hôm nay, chưa có lượt thêm → không mở được');
  // mua 2 đơn → +2 lượt
  await L.grantOpen(P, 'xofa', 'o2'); await L.grantOpen(P, 'tc33', 'o3');
  chk(doc().extra === 2 && doc().earned === 2, 'mỗi đơn có SĐT +1 lượt (không giới hạn)');
  seq = [0.95, 0.1];                                                // trượt
  const r2 = await L.open(P, '2027-02-03T08:00:00+07:00', rnd);
  chk(!r2.win && !r2.usedFree && doc().extra === 1 && r2.state.extra === 1, 'mở bằng lượt thêm: trừ 1 lượt; r1=0.95 ≥ 90% → trượt');
  seq = [0.5, 0.9, 0.1, 0.2, 0.3, 0.4, 0.5];                      // có mua 24h → 90% → trúng; r2=0.9 → +1h bed
  const r3 = await L.open(P, '2027-02-03T08:00:00+07:00', rnd);
  chk(r3.win && r3.code.type === 'bed1h' && doc().extra === 0, 'có mua trong 24h: tỉ lệ 90% → trúng +1h bed');
  // sang ngày mới: lại có bao miễn phí
  setNow('2027-02-04T08:00:00');
  const st = await L.load(P); chk(st.free === 1 && st.extra === 0 && st.codes.length === 2, 'ngày mới: lại 1 bao miễn phí; 2 mã đã trúng');

  // chưa tới ngày dùng: POS không thấy mã, không đọc
  chk((await L.usableCodes(P, 'xofa')).length === 0, 'trước mùng 3: POS không thấy mã');
  // mùng 3: dùng được
  setNow('2027-02-08T10:00:00');
  const ux = await L.usableCodes(P, 'xofa'), ut = await L.usableCodes(P, 'tc33');
  chk(ux.length === 1 && ux[0].type === 'upsize_xofa' && ut.length === 1 && ut[0].type === 'bed1h', 'mùng 3: XOFA thấy mã XOFA, The cafe 33 thấy mã TC33');
  await L.markUsed(P, ux[0].id, { store: 'xofa', bill: 'B1', amount: 6000 });
  chk(doc().codes[ux[0].id].used === true && doc().codes[ux[0].id].usedAmount === 6000, 'thanh toán xong: đánh dấu đã dùng');
  let e2 = null; try { await L.markUsed(P, ux[0].id, { store: 'xofa' }); } catch (e) { e2 = e.message; } chk(e2 === 'da-dung', 'mã đã dùng → không dùng lại (2 máy cùng lúc)');
  chk((await L.usableCodes(P, 'xofa')).length === 0, 'mã đã dùng biến khỏi danh sách');
  // +1h bed: app khách GIỮ mã cho 1 lịch → POS chỉ thấy khi tính đúng lịch đó
  const bid = ut[0].id;
  await L.reserve(P, bid, { key: 'BK1', path: 'bedBookings/2027/2/9/BK1', info: '09/02 13:00–16:00' });
  chk(doc().codes[bid].reservedBooking === 'BK1' && doc().codes[bid].reservedInfo === '09/02 13:00–16:00', 'giữ mã +1h bed cho lịch BK1');
  chk((await L.usableCodes(P, 'tc33')).length === 0 && (await L.usableCodes(P, 'tc33', 'BK2')).length === 0, 'mã đang giữ: bill khác / lịch khác không thấy');
  chk((await L.usableCodes(P, 'tc33', 'BK1')).length === 1, 'tính tiền đúng lịch BK1: thấy mã');
  let e3 = null; try { await L.reserve(P, bid, { key: 'BK2' }); } catch (e) { e3 = e.message; } chk(e3 === 'dang-giu', 'mã đã giữ cho lịch khác → không giữ lần 2');
  await L.reserve(P, bid, { key: 'BK1' }); chk(doc().codes[bid].reservedBooking === 'BK1', 'giữ lại cho đúng lịch cũ (đổi giờ): không lỗi');
  chk(await L.unreserve(P, bid, 'BK2') === false && doc().codes[bid].reservedBooking === 'BK1', 'trả mã sai lịch: không đổi');
  chk(await L.unreserve(P, bid, 'BK1') === true && !doc().codes[bid].reservedBooking && (await L.usableCodes(P, 'tc33')).length === 1, 'huỷ lịch → trả mã, dùng lại được');
  let e4 = null; try { await L.reserve(P, ux[0].id, { key: 'BK3' }); } catch (e) { e4 = e.message; } chk(e4 === 'da-dung', 'mã đã dùng → không giữ được');
  chk(L.dateInUse('08/02/2027') && L.dateInUse('2027-02-15') && !L.dateInUse('07/02/2027') && !L.dateInUse('2027-02-16'), 'ngày lịch bed trong giai đoạn dùng: mùng 3 → mùng 10');
  chk(L.hm(L.mins('15:00') + 60) === '16:00' && L.hm(L.mins('23:30') + 60) === '00:30', 'cộng 60 phút vào giờ lịch');
  // mùng 11: hết hạn
  setNow('2027-02-16T08:00:00');
  chk((await L.usableCodes(P, 'tc33')).length === 0, 'mùng 11: không còn mã dùng được');
  chk(await L.grantOpen(P, 'tc33', 'o9') === false, 'mùng 11: đơn không cộng lượt');

  // thống kê + xoá hết
  f.FS['lixi_tet_2027/0900000001'] = { phone: '0900000001', opened: 3, wins: 1, earned: 2, codes: { TETAAAAA: { type: 'giam5k_xofa', used: false } } };
  const S = await L.stats();
  chk(S.customers === 2 && S.opened === 6 && S.wins === 3 && S.byType.upsize_xofa.used === 1 && S.byType.upsize_xofa.amount === 6000 && S.byType.giam5k_xofa.issued === 1, 'thống kê: số khách / lượt mở / mã phát / đã dùng');
  for (let i = 0; i < 450; i++) f.FS['lixi_tet_2027/08' + String(i).padStart(8, '0')] = { opened: 1 };
  let prog = 0; const n = await L.deleteAll(d => { prog = d; });
  chk(n === 452 && prog === 452 && !Object.keys(f.FS).some(k => k.startsWith('lixi_tet_2027/')), 'xoá hết: xoá từng lô 400, sạch bảng');
  chk(Object.keys(f.FS).every(k => !k.startsWith('customers/')), 'không đụng bảng customers');

  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL lỗi: ' + e.stack); process.exit(1); });
