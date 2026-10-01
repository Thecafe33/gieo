// Trích xuất dữ liệu v2 (quanlygieo.html): chuỗi BTP theo ngày, cờ nghi nhập sai, số đếm NL giao ca, dòng đối chiếu.
'use strict';
const fs = require('fs'), path = require('path');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
const src = fs.readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8');
const code = src.slice(src.indexOf('// ════════ [Trích xuất v2]'), src.indexOf('function _expFileName'));
const dkey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const F = new Function('dkey', code + ';return {_expCaLamViec,_expBtpTheoNgay,_expDemNlGiaoCa,_expDongDoiChieu,_expTomTatSoLech}')(dkey);
const line = (day, sys, cnt) => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', systemQty: sys, countedQty: cnt, varianceQty: cnt - sys, discardedQty: 0, weighMethod: 'vessel' });
const closings = [
  { id: '2026-09-21', businessDate: '2026-09-21', prepCountLines: [line(0, 359, 621)] },
  { id: '2026-09-22', businessDate: '2026-09-22', prepCountBy: 'Vỹ', prepCountByEmployeeId: 'e1', prepCountAt: '2026-09-22T14:30:00.000Z', prepCountLines: [line(0, 864, 7464)] },
  { id: '2026-09-23', businessDate: '2026-09-23', prepCountLines: [line(0, 251, 88)] }];
const batches = [{ prepId: 'P', businessDate: '2026-09-22', finishedAt: '2026-09-22T05:00:00.000Z', startedAt: '2026-09-22T04:30:00.000Z', qtyInitial: 733, status: 'used_up',
  usageEvents: [{ type: 'consumed', qty: 490, at: '2026-09-22T09:00:00.000Z', refId: 'b1', refType: 'order' }] }];
const r = F._expBtpTheoNgay(['2026-09-21', '2026-09-22', '2026-09-23'], closings, batches, [{ prepId: 'P', type: 'WASTE', qty: -5, businessDate: '2026-09-22' }], [{ id: 'P', name: 'Cốt trà lài', unit: 'g' }]);
const d22 = r.theoNgay.find(x => x.ngay === '2026-09-22');
eq([d22.demHomTruoc, d22.nauThem, d22.dungTheoBill, d22.soCuoiNgay, d22.chenhChuoi], [621, 733, 490, 864, 0], 'chuỗi: 621 + 733 − 490 = 864, chênh chuỗi 0');
eq(d22.canhBao, ['dem_vot_so_voi_so'], 'đếm 7464 vs sổ 864 → cờ nghi nhập sai');
eq(d22.theoLoaiSoBTP.WASTE, { qty: -5, soDong: 1 }, 'tóm tắt sổ BTP theo loại');
eq(r.tongKet.P.ngayNghiNhapSai.map(x => x.ngay), ['2026-09-22'], 'tổng kết: ngày nghi nhập sai');
eq(r.theoNgay.find(x => x.ngay === '2026-09-21').canhBao.some(c => c.startsWith('chua_co_usageEvents')), true, 'ngày trước khi có usageEvents được ghi chú');
eq([d22.nguoiDem, d22.nguoiDemId, d22.demLuc], ['Vỹ', 'e1', '2026-09-22T14:30:00.000Z'], 'mỗi dòng đếm có người đếm + giờ');
eq(r.theoNgay.find(x => x.ngay === '2026-09-23').nguoiDem, '', 'phiếu chưa ghi người đếm → rỗng, không lỗi');
const ca = F._expCaLamViec([
  { businessDate: '2026-09-22', employeeName: 'Vỹ', employeeId: 'e1', checkedInAt: '2026-09-22T07:00:00Z', checkedOutAt: null, roles: ['barista'] },
  { businessDate: '2026-09-22', employeeName: 'An', employeeId: 'e2', checkedInAt: '2026-09-22T01:00:00Z', checkedOutAt: '2026-09-22T06:00:00Z' }]);
eq(ca['2026-09-22'].map(x => [x.nhanVien, x.chucNang, x.ra]), [['An', null, '2026-09-22T06:00:00Z'], ['Vỹ', ['barista'], null]], 'ca làm việc: xếp theo giờ vào, chức năng null nếu ca cũ');
const nl = F._expDemNlGiaoCa([{ id: '2026-09-22', handoverCloseLines: [{ itemId: 'X', itemName: 'Sữa', unit: 'ml', countedQty: 3, locationId: 'q' }], prepCountLines: [{ prepId: 'P', countedQty: 1 }] }], []);
eq([Object.keys(nl), nl['2026-09-22'].length, nl['2026-09-22'][0].dem], [['2026-09-22'], 1, 3], 'số đếm NL giao ca (bỏ mảng không có itemId)');
const dc = F._expDongDoiChieu([{ id: 'a', type: 'CONSUMPTION', qty: -20, prepRecon: true, varianceKind: 'extra_usage', businessDate: '2026-09-29' }, { id: 'b', type: 'CONSUMPTION', qty: -5 },
  { id: 'c', type: 'CONSUMPTION', qty: -150, prepWindowBatchId: 'c1', businessDate: '2026-09-30' }]);
eq(dc.map(x => x.id), ['a', 'c'], 'chỉ lấy dòng đối chiếu / bán trong lúc khoá');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
