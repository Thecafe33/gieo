// gau_noel_giangsinh.v5.js (= v4 + phần ngẫu nhiên cố định 40% tỉ lệ) — phát gấu theo doanh thu: tính cặp 2 ly, nhận tiếp số liệu v3, tỉ lệ theo lãi, ống may mắn,
// bill nhiều ly, 23–25/12 nhường gấu cho bill 2 ly, ×2 Thứ 2/Thứ 4, nhịp đông khách (quay tại quầy), huỷ bill, nạp thêm.
const { makeFake } = require('./lib/fakefb');
let ok = true; const chk = (c, m, x) => { console.log((c ? 'ok ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x))); if (!c) ok = false; };
delete require.cache[require.resolve('../gau_noel_giangsinh.v5.js')];
const G = require('../gau_noel_giangsinh.v5.js');
const at = iso => Date.parse(iso + '+07:00');
const setNow = iso => G._setOffset(at(iso) - Date.now());
const seq = arr => { const a = arr.slice(); return () => (a.length ? a.shift() : 0.999); };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-6);
G.apCfg({ bat: true });

// ── tính cặp 2 ly
let c = G.catBill([25000, 30000]);
chk(c.L === 1 && c.v === 55000 && near(c.lai, 37200), '2 ly 25K + 30K: 1 lượt, cặp 55K, lãi 37,2K');
c = G.catBill([25000, 30000, 35000]);
chk(c.L === 1 && c.v === 60000, '3 ly: bỏ ly giá giữa (30K) → cặp 25K + 35K = 60K');
c = G.catBill([25000, 25000, 30000, 35000, 35000]);
chk(c.L === 2 && c.v === 60000, '5 ly: bỏ ly giữa → 120K ÷ 2 cặp = 60K mỗi lượt');
c = G.catBill([30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000]);
chk(c.L === 3 && c.v === 60000, '8 ly: tối đa 3 lượt, giá cặp = trung bình chung 60K');
chk(G.catBill([30000]).L === 0 && G.catBill([]).L === 0, '1 ly / không ly nước: không có lượt');
chk(G.catBill([15000, 15000, 15000, 15000]).lai < G.catBill([35000, 35000]).lai / 4, 'cặp ly rẻ (30K) lãi < 1/4 cặp ly mắc (70K) → tỉ lệ thấp hơn tương ứng');

// ── nhận tiếp số liệu v3
let kho = { tong: 83, phat: 2 }, v = G.khoV4(kho, '2026-11-18');
chk(v.thuong === 65 && v.noel === 16 && v.nhanTu.phat === 2 && kho.v4 === v, 'v3 đã phát 2 / 83 → còn 81: 65 ngày thường + 16 cho 23–25/12');
chk(G.khoV4(kho, '2026-11-19') === v, 'đã có nhánh v4 thì không tính lại');
chk(G.khoV4({ tong: 50, phat: 10 }, '2026-12-23').noel === 40, 'chuyển bản đúng 23/12 → toàn bộ gấu còn vào phần Noel');

// ── tỉ lệ theo doanh thu
v = G.khoV4({ tong: 100, phat: 0 }, '2026-11-18');
let h = G.sangNgay(v, '2026-11-18');
chk(h.rho === G.CFG.rhoDau, 'ngày đầu chưa có số lãi → tỉ lệ tạm ' + G.CFG.rhoDau * 100 + '%');
h.lai = 1000000;
h = G.sangNgay(v, '2026-11-19');
const can = 80 * 17000 / (1000000 * 34);
chk(near(v.laiTB, 1000000) && near(h.rho, Math.max(G.CFG.rhoDau * 0.85, Math.min(can, G.CFG.rhoDau * 1.15))), 'hôm sau: tỉ lệ = gấu còn × 17K ÷ (lãi TB × số ngày còn), đổi tối đa ±15%', [h.rho, can]);
const r1 = h.rho; h.lai = 1000000; h = G.sangNgay(v, '2026-11-20');
chk(h.rho >= r1 * 0.85 - 1e-9 && h.rho <= r1 * 1.15 + 1e-9, 'tỉ lệ không nhảy quá ±15% mỗi ngày');
// ngày nghỉ: không có bill → không cập nhật lãi TB; tỉ lệ chỉ nhích nhẹ
const lt = v.laiTB; h = G.sangNgay(v, '2026-11-23');
chk(v.laiTB === lt && h.rho <= r1 * 1.15 * 1.15 + 1e-9, 'nghỉ 2 ngày: lãi TB giữ nguyên, tỉ lệ chỉ nhích theo giới hạn');

// ── bốc thuần
const ms = at('2026-11-25T10:00:00');
v = G.khoV4({ tong: 100, phat: 0 }, '2026-11-25');
let r = G.bocThuan4({}, v, { gia: [35000, 35000] }, ms, seq([0]));
chk(r.luot.length === 1 && r.luot[0].k === 'rand' && v.thuong === 79 && v.hom.phat === 1, 'trúng ngẫu nhiên → trừ phần ngày thường, đếm vào hôm nay');
r = G.bocThuan4({}, v, { gia: [35000, 35000] }, ms, seq([0.999]));
chk(!r.luot[0].win && near(r.ong, 0.04 * 52200), 'trượt → ống may mắn cộng 4% lãi cặp');
r = G.bocThuan4({ ong: 16000 }, v, { gia: [35000, 35000] }, ms, seq([0.999]));
chk(r.luot[0].k === 'pity' && near(r.ong, 16000 + 0.04 * 52200 - 17000), 'ống đủ 17K → chắc trúng, ống trừ 17K');
r = G.bocThuan4({}, v, { gia: Array(6).fill(30000) }, ms, seq([0.999, 0.999, 0.999]));
chk(r.luot.length === 3 && r.luot[2].k === 'big' && r.luot.filter(x => x.win).length === 1, 'bill 6 ly trượt 2 lượt đầu → lượt cuối chắc trúng');
r = G.bocThuan4({}, v, { gia: [30000] }, ms, seq([0]));
chk(r.luot.length === 0, '1 ly: không lượt');
r = G.bocThuan4({}, v, { ly: 2, tienNuoc: 60000 }, ms, seq([0.999]));
chk(r.luot.length === 1 && r.soLy === 2, 'POS cũ chỉ gửi số ly + tổng tiền → chia đều thành giá từng ly');
const v0 = G.khoV4({ tong: 1, phat: 1 }, '2026-11-25');
r = G.bocThuan4({}, v0, { gia: [35000, 35000] }, ms, seq([0]));
chk(!r.luot[0].win, 'hết gấu → không trúng');

// ── [v5] phần ngẫu nhiên CỐ ĐỊNH 40% tỉ lệ — gấu chắc trúng nhiều (gEst cao) không làm tụt
chk(G.CFG.phanRand === 0.4, 'v5: phần ngẫu nhiên = 40% tỉ lệ gấu / lãi');
{
  const pKy = (gEst) => {   // tìm ngưỡng rand đúng ranh giới trúng / trượt của 1 cặp 35K + 35K
    const vv = G.khoV4({ tong: 100, phat: 0 }, '2026-11-25'); vv.gEst = gEst;
    const hh = G.sangNgay(vv, '2026-11-25'), p = hh.rho * 0.4 * 52200 / 17000;
    const duoi = G.bocThuan4({}, vv, { gia: [35000, 35000] }, ms, seq([p - 1e-6])).luot[0].k;
    const tren = G.bocThuan4({}, vv, { gia: [35000, 35000] }, ms, seq([p + 1e-6])).luot[0].k;
    return [duoi, tren, p];
  };
  const a = pKy(0.4), b = pKy(0.8);
  chk(a[0] === 'rand' && !a[1] && near(a[2], 0.06 * 0.4 * 52200 / 17000), 'xác suất 1 lượt = tỉ lệ × 40% × lãi cặp ÷ 17K (ngày đầu 6% → cặp 70K ≈ 7,4%)', a);
  chk(b[0] === 'rand' && !b[1], 'chắc trúng chiếm nhiều (gEst 0,8) → phần ngẫu nhiên vẫn 40%, không tụt về 20% như v4', b);
}

// ── 23–25/12: cứ 5 bill từ 4 ly thì 1 bill nhường gấu cho bill 2 ly
const msN = at('2026-12-23T10:00:00');
v = G.khoV4({ tong: 100, phat: 0 }, '2026-12-23');
let bigs = 0;
for (let i = 0; i < 5; i++) { r = G.bocThuan4({}, v, { gia: Array(4).fill(30000) }, msN, seq([0.999, 0.999, 0.999])); bigs += r.luot.filter(x => x.k === 'big').length; }
chk(bigs === 4 && v.quy2 === 1, '5 bill 4 ly ngày Noel: 4 bill chắc trúng, 1 bill nhường → quỹ bill 2 ly = 1');
r = G.bocThuan4({}, v, { gia: [30000, 30000, 30000] }, msN, seq([0.999, 0.1]));
chk(!r.luot[0].win && v.quy2 === 1, 'bill 3 ly không được dùng quỹ nhường (chỉ bill 2 ly)');
r = G.bocThuan4({}, v, { gia: [30000, 30000] }, msN, seq([0.999, 0.1]));
chk(r.luot[0].k === 'q2' && v.quy2 === 0, 'bill 2 ly trượt → quay thêm với quỹ nhường → trúng');

// ── ×2 Thứ 2 & Thứ 4 khi tuần trước phát thiếu dự kiến ≥ 3
v = G.khoV4({ tong: 200, phat: 0 }, '2026-11-25');
G.sangNgay(v, '2026-11-25'); v.tuan.du = 5; v.tuan.phat = 1;
h = G.sangNgay(v, '2026-11-30');
chk(h.x2 === true && v.boost['2026-11-30'] && v.tuanTruoc.x2, 'tuần 23/11 phát 1 / dự kiến 5 → Thứ 2 (30/11) ×2');
chk(G.sangNgay(v, '2026-12-01').x2 === false && G.sangNgay(v, '2026-12-02').x2 === true, 'Thứ 3 thường · Thứ 4 (2/12) ×2');
v = G.khoV4({ tong: 200, phat: 0 }, '2026-11-25'); G.sangNgay(v, '2026-11-25'); v.tuan.du = 3; v.tuan.phat = 1;
chk(G.sangNgay(v, '2026-11-30').x2 === false, 'thiếu 2 gấu (< 3) → không ×2');

// ── nhịp đông khách (thuần)
v = { nhip: [] };
['b1', 'b2', 'b3'].forEach((b, i) => G.ghiNhip(v, 'gg01', b, at('2026-11-25T10:0' + i + ':00'), false));
G.ghiNhip(v, 'gg01', 'b4', at('2026-11-25T10:05:00'), false);
chk(G.duocNhip(v, 'gg01', 'b4') && !G.duocNhip(v, 'gg01', 'b3'), 'Gieo Gieo: 3 bill trước trong 10 phút đều trượt → bill thứ 4 được chắc trúng');
chk(!G.duocNhip(v, 'xofa', 'b4'), 'XOFA cần 4 bill trước (bill thứ 5)');
v = { nhip: [] };
G.ghiNhip(v, 'gg01', 'b1', at('2026-11-25T10:00:00'), true); G.ghiNhip(v, 'gg01', 'b2', at('2026-11-25T10:01:00'), false);
G.ghiNhip(v, 'gg01', 'b3', at('2026-11-25T10:02:00'), false); G.ghiNhip(v, 'gg01', 'b4', at('2026-11-25T10:03:00'), false);
chk(!G.duocNhip(v, 'gg01', 'b4'), 'bill đầu nhóm đã trúng → bill thứ 4 không chắc trúng');
v = { nhip: [] };
G.ghiNhip(v, 'gg01', 'b1', at('2026-11-25T10:00:00'), false); G.ghiNhip(v, 'gg01', 'b2', at('2026-11-25T10:01:00'), true);
G.ghiNhip(v, 'gg01', 'b3', at('2026-11-25T10:02:00'), false); G.ghiNhip(v, 'gg01', 'b4', at('2026-11-25T10:03:00'), false);
chk(!G.duocNhip(v, 'gg01', 'b4'), 'có 1 bill trong 3 bill trước đã trúng → không chắc trúng, quay theo tỉ lệ thường');
v = { nhip: [] };
G.ghiNhip(v, 'gg01', 'b1', at('2026-11-25T09:50:00'), false); G.ghiNhip(v, 'gg01', 'b2', at('2026-11-25T10:01:00'), false);
G.ghiNhip(v, 'gg01', 'b3', at('2026-11-25T10:02:00'), false); G.ghiNhip(v, 'gg01', 'b4', at('2026-11-25T10:03:00'), false);
chk(!G.duocNhip(v, 'gg01', 'b4'), 'bill cũ hơn 10 phút không tính');

// ── giao dịch (Firestore giả)
(async () => {
  const f = makeFake();
  G.init({ fstore: f.fstore, FieldValue: f.FieldValue });
  const DB = () => f.fstore;
  const docK = async q => (await f.fstore.collection('gau_noel_2026_kho').doc(q).get()).data();
  const docC = async p => (await f.fstore.collection('gau_noel_2026').doc(p).get()).data();
  setNow('2026-11-25T10:00:00');
  let x = await G.boc({ store: 'gg01', sdt: '0912000001', bill: 'g0', gia: [30000, 30000] });
  chk(x.soLuot === 0 && x.loi === 'chua-co-kho', 'quán chưa nhập kho → không bốc');
  await G.datKho('gg01', 149); await G.datKho('xofa', 206);
  let e = null; try { await G.datKho('gg01', 10); } catch (er) { e = er.message; }
  chk(e === 'da-co-kho', 'nhập kho lần 2 bị chặn (dùng Nạp thêm)');
  // giả lập dữ liệu v3 đã chạy thật: 5 gấu đã phát
  await f.fstore.collection('gau_noel_2026_kho').doc('gg01').set({ phat: 5, dung: { W1: { v45: 5 } } }, { merge: true });
  x = await G.boc({ store: 'gg01', sdt: '0912000001', bill: 'g1', gia: [35000, 35000] }, seq([0]));
  let k = await docK('gg01');
  chk(x.soLuot === 1 && x.trung === 1 && k.phat === 6 && k.v4 && k.v4.nhanTu.phat === 5 && k.v4.thuong + k.v4.noel === 149 - 6, 'bill đầu của bản mới: nhận tiếp 5 gấu v3, trúng thêm 1 → đã phát 6, còn 143', k.v4);
  const x2 = await G.boc({ store: 'gg01', sdt: '0912000001', bill: 'g1', gia: [35000, 35000] }, seq([0]));
  chk(x2.cu && (await docK('gg01')).phat === 6, 'gọi lại cùng bill → không bốc lại');
  const kh = await docC('0912000001');
  chk(Object.values(kh.luot)[0].v === 4 && Object.keys(kh.qua).length === 1 && Object.keys(k.ma).length === 1, 'lượt ghi dấu v4, mã có trong hồ sơ khách và sổ mã quán');
  // nhịp đông khách: Gieo Gieo 3 bill trượt rồi bill thứ 4 quay tại quầy
  for (let i = 2; i <= 5; i++) { setNow('2026-11-25T10:0' + i + ':00'); await G.boc({ store: 'gg01', sdt: '091200000' + i, bill: 'g' + i, gia: [30000, 30000] }, seq([0.999, 0.999])); }
  setNow('2026-11-25T10:06:00');
  const kTruoc = await docK('gg01');
  let m = await G.mo('0912000005', undefined, false);
  chk(!m.win, 'bill thứ 4 khách tự quay trên app (không quay tại quầy) → không áp nhịp đông khách');
  await G.boc({ store: 'gg01', sdt: '0912000006', bill: 'g6', gia: [30000, 30000] }, seq([0.999, 0.999]));
  m = await G.mo('0912000006', undefined, true);
  k = await docK('gg01');
  chk(m.win && m.nhip && /^GAU/.test(m.code) && k.phat === kTruoc.phat + 1 && k.ma[m.code] && k.v4.thuong === kTruoc.v4.thuong - 1, 'bill quay tại quầy, 3 bill liền trước đều trượt → chắc trúng, trừ kho, ghi sổ mã', m);
  await G.doi('gg01', '0912000006', m.code, 'quay tại quầy');
  chk((await docC('0912000006')).qua[m.code].used === true, 'mã nhịp đông khách đổi quà được như mã thường');
  await G.boc({ store: 'gg01', sdt: '0912000007', bill: 'g7', gia: [30000, 30000] }, seq([0.999, 0.999]));
  m = await G.mo('0912000007', undefined, true);
  chk(!m.win, 'ngay sau đó (đã có người trúng trong nhóm) → không chắc trúng tiếp');
  // huỷ bill trả gấu về kho
  const kh1 = await docK('gg01');
  const hb = await G.huyBill('gg01', '0912000001', 'g1');
  k = await docK('gg01');
  chk(hb.traKho === 1 && k.phat === kh1.phat - 1 && k.v4.thuong === kh1.v4.thuong + 1, 'huỷ bill có gấu chưa nhận → trả 1 gấu về phần ngày thường');
  // nạp thêm
  await G.napThem('gg01', 20);
  const k2 = await docK('gg01');
  chk(k2.tong === 169 && k2.v4.thuong === k.v4.thuong + 20 && Object.values(k2.napLog || {})[0] === 20, 'nạp thêm 20 → tổng 169, cộng vào phần ngày thường, có nhật ký');
  e = null; try { await G.napThem('tc33', 5); } catch (er) { e = er.message; }
  chk(e === 'chua-co-kho', 'nạp thêm cho quán chưa nhập kho → báo lỗi');
  // tổng hợp dashboard: ống may mắn, lượt chưa quay, tên khách
  await f.fstore.collection('customers').doc('0912000002').set({ nickname: 'Chị Ngọc' });
  const D = await G.dashboard();
  const kc = D.khach.find(z => z.sdt === '0912000002');
  chk(kc && kc.chuaQuay === 1 && kc.ong > 0 && kc.luotQuan.gg01 === 1, 'dashboard: khách có lượt chưa quay, ống may mắn, lượt theo quán', kc);
  const ten = await G.tenKhach(['0912000002', '0912000003']);
  chk(ten['0912000002'] === 'Chị Ngọc' && ten['0912000003'] === '', 'tên khách lấy từ hồ sơ tích điểm (không có → rỗng)');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(er => { console.log('FAIL lỗi: ' + er.stack); process.exit(1); });
