// 04/10/2026 — Hoà vốn của ngày: chi phí biến đổi (khoản chi đã duyệt trong ngày) là số tiền đã tiêu, không tăng
// theo từng ly → nằm trong phần cần đắp như hao hụt/khấu hao; chỉ giá vốn + phí kênh nằm trong biên phí.
// Số liệu thật của chủ quán: trước đây ra 2.905.597đ (vô lý), nay ≈ 1,47tr.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const plBreakEven = new Function(extract('quanlygieo.html', ['plBreakEven']) + '\nreturn plBreakEven;')();
const pl = { doanhThu: 674000, giaVon: 245725, haoHut: 54968, bienPhiKhac: 275000, luong: 380000, chiPhiCoDinh: 0, khauHao: 225795, phiKenh: 0 };
const be = plBreakEven(pl, 0.6);
const lai = pl.doanhThu - pl.giaVon - pl.haoHut - pl.bienPhiKhac - pl.luong - pl.chiPhiCoDinh - pl.khauHao - pl.phiKenh;
eq([Math.round(be.bienDongGop * 1000) / 1000, be.coDinh, Math.round(be.hoaVon)], [0.635, 935763, Math.round(935763 / (1 - 245725 / 674000))],
  'biên 63,5% (chỉ giá vốn), cần đắp 935.763đ (gồm chi phí biến đổi 275k), hoà vốn ≈ 1,47tr');
eq(Math.abs((pl.doanhThu - be.hoaVon) * be.bienDongGop - lai) < 1, true, 'đẳng thức lãi = (doanh thu − hoà vốn) × biên đóng góp vẫn đúng (lỗ −507.488đ)');
eq([be.dat, Math.round(be.conThieu)], [false, Math.round(be.hoaVon - 674000)], 'chưa đạt, còn thiếu = hoà vốn − doanh thu');
const pk = plBreakEven({ ...pl, phiKenh: 67400 }, 0.6);
eq(Math.round(pk.bienDongGop * 1000) / 1000, Math.round((1 - (245725 + 67400) / 674000) * 1000) / 1000, 'phí kênh (theo từng đơn) vẫn nằm trong biên phí');
const zero = plBreakEven({ ...pl, doanhThu: 0 }, 0.5);
eq([zero.uocTinh, zero.hoaVon], [true, 935763 / 0.5], 'chưa bán: mượn biên tham chiếu, vẫn đắp đủ chi phí biến đổi');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
