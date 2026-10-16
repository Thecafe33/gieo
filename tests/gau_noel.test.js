// gau_noel_giangsinh.v1.js — quay trúng gấu Giáng sinh 2026: chặng, tỉ lệ 5 yếu tố, luật chắc trúng, trần kho, giao dịch POS / app khách.
const { makeFake } = require('./lib/fakefb');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
delete require.cache[require.resolve('../gau_noel_giangsinh.v1.js')];
const G = require('../gau_noel_giangsinh.v1.js');
const at = iso => Date.parse(iso + '+07:00');
const setNow = iso => G._setOffset(at(iso) - Date.now());
const near = (a, b) => Math.abs(a - b) < 1e-9;
const seq = arr => { const a = arr.slice(); return () => (a.length ? a.shift() : 0.999); };

// ── chặng
const ch = d => { const c = G.chang(d); return c ? c.w + ':' + c.idx + '/' + c.len : null; };
chk(ch('2026-11-14') === null && ch('2026-12-26') === null, 'ngoài 15/11 → 25/12: không có chặng (không tính lượt)');
chk(ch('2026-11-15') === 'W0:0/7' && ch('2026-11-21') === 'W0:6/7', 'tuần mở màn 15–21/11');
chk(ch('2026-11-22') === 'W1:0/7' && ch('2026-12-05') === 'W2:6/7' && ch('2026-12-06') === 'W3:0/9' && ch('2026-12-14') === 'W3:8/9', 'chạy đều: 3 tuần, tuần cuối gộp phần lẻ (9 ngày)');
chk(ch('2026-12-15') === 'W15:0/8' && ch('2026-12-22') === 'W15:7/8', '15–22/12 một chặng 8 ngày');
chk(ch('2026-12-23') === 'N0:0/1' && ch('2026-12-25') === 'N2:0/1', '23, 24, 25/12 mỗi ngày một chặng');
chk(G.dangMua(at('2026-12-25T23:59:00')) && !G.dangMua(at('2026-12-26T00:00:00')) && G.dangNhan(at('2026-12-31T23:59:00')) && !G.dangNhan(at('2027-01-01T00:00:00')), 'mua tới hết 25/12, mở lượt + đổi quà tới hết 31/12');
chk(G.vnDay(at('2026-11-15T00:05:00')) === '2026-11-15' && G.vnHour(at('2026-11-15T14:30:00')) === 14, 'ngày giờ theo giờ VN');

// ── yếu tố ① số ly, ② giá đơn
chk([0, 1, 2, 3, 4, 5, 6, 9].map(G.soLuot).join() === '0,0,1,1,2,2,3,3', '2–3 ly = 1 lượt · 4–5 = 2 · từ 6 = 3');
chk(G.bandOf(44999) === 'low' && G.bandOf(45000) === 'v45' && G.bandOf(60000) === 'v60' && G.bandOf(80000) === 'v80', 'loại lượt theo tiền nước mỗi lượt');
// ── kịch bản ở trang mô phỏng (ngày thường, không giờ vàng, kho đúng kế hoạch)
chk(near(G.pTurn(1, 30000, 0, 1, 1), 0.015), 'Gieo 2 ly 30K: 1,5% (dưới 45K vẫn có thể trúng)');
chk(near(G.pTurn(1, 50000, 0, 1, 1), 0.10) && near(G.pTurn(1, 65000, 0, 1, 1), 0.125) && near(G.pTurn(1, 85000, 0, 1, 1), 0.15), '2 ly 50K 10% · 65K 12,5% · 85K 15%');
chk(near(G.pTurn(1, 50000, 3, 1, 1), 0.13) && near(G.pTurn(1, 50000, 4, 1, 1), 0.16), 'lịch sử SĐT: trượt 3 ×1,3 · trượt 4 ×1,6');
chk(near(G.pTurn(1, 50000, 0, 3, 1), 0.30) && near(G.pTurn(1, 30000, 0, 3, 1), 0.045), '23–25/12 ×3: 50K 30% · 30K 4,5%');
chk(near(G.pTurn(2, 55000, 0, 1, 1), 0.12) && near(G.pTurn(1, 50000, 0, 1, 0.7), 0.07), 'đơn 4 ly 12%/lượt · kho phát nhanh ×0,7');
chk(G.pTurn(3, 90000, 4, 4.5, 1.25) === 0.6, 'trần 60% mỗi lượt');
const ng = G.heSoNgayGio(G.chang('2026-11-25'), 14), ng2 = G.heSoNgayGio(G.chang('2026-11-16'), 9);
chk(near(ng, 1.5) && near(ng2, 1.5) && near(G.heSoNgayGio(G.chang('2026-12-24'), 15), 4.5), 'giờ vàng ×1,5 · mở màn ×1,5 · Noel giờ vàng ×4,5');
// ── ③ luật niềm tin: đủ lượt VÀ đủ lãi
chk(Math.round(G.nguongLai(false)) === 113333 && G.nguongLai(true) === 85000, 'ngưỡng lãi: 17K ÷ 15% = 113K · Noel ÷ 20% = 85K');
chk(G.chacTrung(5, 5 * G.laiDon(50000, 2), false), 'Gieo 2 ly 50K trượt 5 lượt (lãi ~161K) → lượt sau chắc trúng');
chk(!G.chacTrung(6, 6 * G.laiDon(30000, 2), false), 'Gieo 2 ly 30K trượt 6 lượt (lãi ~73K) → KHÔNG chắc trúng, vẫn quay ngẫu nhiên');
chk(!G.chacTrung(4, 1e6, false) && G.chacTrung(3, 3 * G.laiDon(50000, 2), true), 'thiếu lượt thì lãi bao nhiêu cũng không · Noel: trượt 3 + lãi ≥ 85K');

// ── bốc thăm thuần + kho
const capDeu = (n) => { const c = {}; G.KHO_NGAU.forEach(k => { c[k] = { open: n, week: n, p15: n, pre: n * 6, n: [n, n, n] }; }); return c; };
const khoMoi = (n, tong) => ({ cap: capDeu(n), tong: tong == null ? 9999 : tong });
const ms = at('2026-11-25T10:00:00');
let kho = khoMoi(5), r = G.bocThuan({}, kho, { ly: 1, tienNuoc: 30000 }, ms, seq([0]));
chk(r.luot.length === 0 && !kho.phat, '1 ly: không có lượt');
r = G.bocThuan({}, kho, { ly: 2, tienNuoc: 50000 }, ms, seq([0.05]));
chk(r.luot.length === 1 && r.luot[0].k === 'v45' && kho.dung.W1.v45 === 1 && kho.pre.v45 === 1 && kho.phat === 1 && r.streak === 0 && r.acc === 0, '2 ly 50K, rand 0,05 < 10% → trúng kho 45–59K, trừ kho, chuỗi về 0');
r = G.bocThuan({}, kho, { ly: 2, tienNuoc: 50000 }, ms, seq([0.13]));
chk(!r.luot[0].win && r.streak === 1 && r.acc === 50000 - 2 * 8900, 'rand 0,13 (> 10% × kho chậm 1,25) → trượt, chuỗi +1, cộng lãi');
r = G.bocThuan({ streak: 5, acc: 120000 }, khoMoi(5), { ly: 2, tienNuoc: 30000 }, ms, seq([0.999]));
chk(r.luot[0].k === 'pity', 'trượt 5 + lãi đủ → chắc trúng (kho chuỗi trượt), kể cả đơn 30K');
r = G.bocThuan({}, khoMoi(5), { ly: 6, tienNuoc: 170000 }, ms, seq([0.999, 0.999, 0.999]));
chk(r.luot.length === 3 && r.luot.filter(x => x.win).length === 1 && r.luot[2].k === 'big', 'đơn 6 ly 3 lượt: trượt cả 2 lượt đầu → lượt cuối chắc trúng (kho đơn nhiều ly)');
r = G.bocThuan({}, khoMoi(5), { ly: 6, tienNuoc: 170000 }, ms, seq([0, 0.999, 0.999]));
chk(r.luot.filter(x => x.win).length === 1 && r.luot[0].k === 'v45' && !r.luot[2].win, 'đơn 6 ly đã trúng lượt đầu → lượt cuối không ép trúng thêm');
r = G.bocThuan({}, khoMoi(5), { ly: 4, tienNuoc: 120000 }, at('2026-12-23T10:00:00'), seq([0.999, 0.999]));
chk(r.luot[1].k === 'big' && r.luot[1].noel, '23/12: từ 4 ly đã chắc ≥ 1 gấu');
r = G.bocThuan({}, khoMoi(5), { ly: 0, tienNuoc: 0, bed160: true }, ms, seq([0.999]));
chk(r.luot.length === 1 && r.luot[0].k === 'bed', 'The cafe 33 bed trên 160K (không ly nước) → 1 lượt trúng chắc');
r = G.bocThuan({}, khoMoi(5), { ly: 2, tienNuoc: 90000, bed160: true }, ms, seq([0.999]));
chk(r.luot.length === 1 && r.luot[0].k === 'bed', 'bed trên 160K có 2 ly → lượt đầu là gấu bed');
// kho hết
kho = khoMoi(5); kho.dung = { W1: { v45: 5 } }; kho.pre = { v45: 5 };
r = G.bocThuan({}, kho, { ly: 2, tienNuoc: 50000 }, ms, seq([0]));
chk(!r.luot[0].win && G.conKho(kho, G.chang('2026-11-25'), 'v45') === false, 'kho 45–59K tuần này đã hết → không trúng dù rand 0');
kho = khoMoi(5, 3); kho.phat = 3;
r = G.bocThuan({ streak: 9, acc: 1e6 }, kho, { ly: 6, tienNuoc: 200000, bed160: true }, ms, seq([0, 0, 0]));
chk(r.luot.every(x => !x.win) && kho.phat === 3, 'hết gấu thật của quán (tong) → không trao cả lượt chắc trúng');
// Noel: hết trần ngày → lấy phần trước 23 chưa phát (carry)
kho = khoMoi(1); kho.dung = { N0: { v45: 1 } }; kho.pre = { v45: 0 };
r = G.bocThuan({}, kho, { ly: 2, tienNuoc: 50000 }, at('2026-12-23T10:00:00'), seq([0]));
chk(r.luot[0].k === 'v45' && kho.carry === 1, '23/12 hết trần ngày → dùng gấu ngẫu nhiên trước 23/12 chưa phát');
// hệ số kho
kho = khoMoi(7); kho.dung = { W1: { v45: 5 } };
chk(G.heSoKho(kho, G.chang('2026-11-23'), 'v45') === 0.7 && G.heSoKho(khoMoi(7), G.chang('2026-11-27'), 'v45') === 1.25, 'kho phát nhanh hơn kế hoạch ×0,7 · chậm ×1,25');

// ── mô phỏng 40 ngày, 60 bill/ngày: không kho nào vượt trần
(() => {
  const k = khoMoi(4, 400); let s = 77; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const khach = Array.from({ length: 50 }, () => ({}));
  for (let d = 0; d < 41; d++) {
    const day = new Date(at('2026-11-15T00:00:00') + d * 864e5 + 7 * 3600e3).toISOString().slice(0, 10);
    for (let b = 0; b < 60; b++) {
      const c = khach[Math.floor(rnd() * 50)], ly = [2, 2, 2, 3, 4, 6][Math.floor(rnd() * 6)];
      const rr = G.bocThuan(c, k, { ly, tienNuoc: ly * (12000 + rnd() * 30000) }, at(day + 'T' + String(8 + Math.floor(rnd() * 13)).padStart(2, '0') + ':00:00'), rnd);
      c.streak = rr.streak; c.acc = rr.acc;
    }
  }
  let vuot = [];
  Object.keys(k.dung).forEach(w => G.KHO_NGAU.forEach(b => {
    const c = k.cap[b], used = k.dung[w][b] || 0;
    const lim = w === 'W0' ? c.open : w === 'W15' ? c.p15 : w[0] === 'N' ? c.n[+w[1]] + (k.carry || 0) : c.week;
    if (used > lim) vuot.push(w + ':' + b + ' ' + used + '>' + lim);
  }));
  G.KHO_NGAU.forEach(b => { if ((k.pre[b] || 0) > k.cap[b].pre) vuot.push('pre:' + b); });
  chk(!vuot.length && k.phat <= 400, '40 ngày × 60 bill: không kho ngẫu nhiên nào vượt trần, tổng ≤ số gấu thật (' + k.phat + ' con)' + (vuot.length ? ' ' + vuot.join(', ') : ''));
})();

chk(/^GAU[A-HJ-NP-Z2-9]{5}$/.test(G.maNhan(Math.random)) && G.normPhone('+84 912 345 678') === '0912345678', 'mã GAU + 5 ký tự (không 0/O/1/I) · chuẩn hoá SĐT');

// ── giao dịch
(async () => {
  const f = makeFake();
  G.init({ fstore: f.fstore, FieldValue: f.FieldValue });
  const P = '0912345678', D = () => f.FS['gau_noel_2026/' + P], K = s => f.FS['gau_noel_2026_kho/' + s];
  setNow('2026-11-10T10:00:00');
  let x = await G.boc({ store: 'gg01', sdt: P, bill: 'b0', ly: 2, tienNuoc: 50000 });
  chk(x.soLuot === 0 && !D(), 'trước đợt: không bốc, không ghi');
  setNow('2026-11-25T10:00:00');
  x = await G.boc({ store: 'gg01', sdt: P, bill: 'b1', ly: 2, tienNuoc: 50000 });
  chk(x.loi === 'chua-co-kho' && !D(), 'quán chưa nhập kho: không bốc, không ghi');
  await G.luuKho('gg01', capDeu(5), 50); await G.luuKho('xofa', capDeu(5), 50);
  x = await G.boc({ store: 'gg01', sdt: P, bill: 'b1', ly: 2, tienNuoc: 50000 }, seq([0.05, 0.1, 0.2, 0.3, 0.4, 0.5]));
  const code = x.luot[0].code;
  chk(x.soLuot === 1 && x.trung === 1 && /^GAU/.test(code) && D().qua[code].store === 'gg01' && K('gg01').phat === 1 && K('gg01').dung.W1.v45 === 1, 'thanh toán: bốc trong 1 giao dịch — lượt + mã ghi vào khách, trừ kho quán');
  const y = await G.boc({ store: 'gg01', sdt: P, bill: 'b1', ly: 2, tienNuoc: 50000 }, seq([0.05]));
  chk(y.cu && K('gg01').phat === 1 && Object.keys(D().luot).length === 1, 'gọi lại cùng bill: không bốc lại');
  await G.boc({ store: 'gg01', sdt: P, bill: 'b2', ly: 2, tienNuoc: 30000 }, seq([0.9]));
  let st = await G.load(P);
  chk(st.chuaMo.length === 2 && st.qua.length === 1, 'app khách: 2 lượt chưa quay, 1 quà');
  let m1 = await G.mo(P); let m2 = await G.mo(P);
  chk(m1.win && m1.code === code && !m2.win && m2.conLai === 0, 'quay = mở lượt cũ nhất trước; lượt 2 trượt');
  let e = null; try { await G.mo(P); } catch (er) { e = er.message; } chk(e === 'het-luot', 'hết lượt chưa mở');
  e = null; try { await G.doi('xofa', P, code, 'nv1'); } catch (er) { e = er.message; } chk(e === 'sai-quan', 'trúng ở Gieo → XOFA không đổi được');
  chk((await G.quaTaiQuan(P, 'gg01')).length === 1 && (await G.quaTaiQuan(P, 'xofa')).length === 0, 'khung Đổi quà chỉ hiện quà của quán này');
  chk(await G.doi('gg01', P, code, 'nv1') === true && D().qua[code].used && K('gg01').doi === 1, 'Đổi quà: mã hết hiệu lực, kho đếm đã nhận');
  e = null; try { await G.doi('gg01', P, code, 'nv2'); } catch (er) { e = er.message; } chk(e === 'da-doi', 'đổi lần 2 (máy khác) → báo đã đổi');
  // huỷ bill: quà chưa nhận → trả kho
  const z = await G.boc({ store: 'gg01', sdt: P, bill: 'b3', ly: 2, tienNuoc: 50000 }, seq([0.01, 0.2, 0.3, 0.4, 0.5, 0.6]));
  const phat0 = K('gg01').phat;
  const h = await G.huyBill('gg01', P, 'b3');
  chk(z.trung === 1 && h.traKho === 1 && K('gg01').phat === phat0 - 1 && !D().qua[z.luot[0].code] && !Object.keys(D().luot).some(id => id.indexOf('_b3_') > 0), 'huỷ bill có gấu chưa nhận → bỏ lượt, trả kho');
  const h2 = await G.huyBill('gg01', P, 'b1');
  chk(h2.daNhan === 1 && K('gg01').canhBao === 1 && D().luot['gg01_b1_0'].huy === true, 'huỷ bill có gấu ĐÃ nhận → giữ, gắn cờ cho Quản lý');
  setNow('2026-12-26T10:00:00');
  x = await G.boc({ store: 'gg01', sdt: P, bill: 'b9', ly: 6, tienNuoc: 200000 });
  chk(x.soLuot === 0, 'sau 25/12: đơn không có lượt');
  setNow('2027-01-01T09:00:00');
  st = await G.load(P);
  chk(st.het && !st.chuaMo.length, 'qua 31/12: hết đợt, không đọc');
  const tk = await G.thongKe();
  chk(tk.khach === 1 && tk.nhan === 1, 'thống kê');
  e = null; try { await G.xoaHet('0000'); } catch (er) { e = er.message; } chk(e === 'sai-ma' && D(), 'xoá hết: sai mã → không xoá');
  const n = await G.xoaHet('2512');
  chk(n === 3 && !D() && !K('gg01') && !K('xofa'), 'xoá hết dữ liệu chương trình (khách + kho)');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); if (!ok) process.exit(1);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
