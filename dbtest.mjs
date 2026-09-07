// Kiểm thử BỘ MÁY DỰ BÁO & SỐ MẺ — hàm thuần, trích từ file HTML thật.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const HTML = join(dirname(fileURLToPath(import.meta.url)), 'quanlygieo.html');
const src = readFileSync(HTML,'utf8');
function grab(name){
  const i = src.indexOf('function '+name+'(');
  if(i<0) throw new Error('không thấy hàm '+name);
  let j = src.indexOf('(', i), p = 0;
  for(; j<src.length; j++){ if(src[j]==='(') p++; else if(src[j]===')'){ p--; if(p===0){ j++; break; } } }
  let d=0, st=false;
  for(; j<src.length; j++){ const c=src[j];
    if(c==='{'){d++;st=true;} else if(c==='}'){d--; if(st&&d===0) return src.slice(i,j+1);} }
  throw new Error('không đóng ngoặc '+name);
}
const konst = ['DB_SO_TUAN','DB_MIN_NGAY','DB_MIN_CUNG_THU','DB_XU_HUONG_MIN','DB_XU_HUONG_MAX',
  'DB_DEM_HAN_NGAN','DB_DEM_DE_DUOC','DB_NGUONG_LAM_TRON_XUONG'].map(k=>{
  const m = new RegExp('const '+k+' = ([^;]+);').exec(src); return 'const '+k+' = '+m[1]+';'; }).join('\n');
const names = ['fmtNum','pad','dkey','thTrungVi','specialDayLabel','thLichSuBTP','dbThu','dbLui',
  'thDuBao','thKeHoachNau','thTonDungDuoc','thDoiChieuDuBao'];
const SPECIAL = `const SPECIAL_DAY_TYPES = [['le','Lễ'],['tet','Tết'],['khuyenmai','Khuyến mãi'],['su_kien','Sự kiện gần quán'],['thoi_tiet','Thời tiết bất thường'],['dong_cua','Nghỉ / đóng cửa'],['khac','Khác']];`;
const api = new Function(konst + '\n' + SPECIAL + '\n' + names.map(grab).join('\n') + '\nreturn {'+names.join(',')+'};')();

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };
const gan=(a,b,m,e=0.01)=>ok(a!=null&&Math.abs(a-b)<=e, `${m} — được ${a}, cần ${b}`);
// 2026-09-07 là Thứ 2. Dựng lịch sử 8 tuần lùi từ ngày đích.
const D=(base,n)=>{ const d=new Date(base+'T12:00:00'); d.setDate(d.getDate()-n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const DICH = '2026-11-07'; // Thứ 7
function lichSu(fn, soNgay=56){
  const ls = {};
  for(let n=1;n<=soNgay;n++){ const d=D(DICH,n); ls[d] = { dung: fn(d, new Date(d+'T12:00:00').getDay()), huy:0, nau:0 }; }
  return ls;
}

console.log('\n1. Chưa đủ dữ liệu → KHÔNG dự báo, nói thẳng là chưa đủ');
{
  const r = api.thDuBao({ lichSuNgay: lichSu(()=>50, 5), ngayDich: DICH, ngayDacBiet:{} });
  ok(r.duBao === null, 'không đưa ra con số');
  ok(r.tinCay.muc === 'chuaDu', 'mức: chưa đủ dữ liệu');
  ok(/ít nhất 7 ngày/.test(r.tinCay.giaiThich), 'nói rõ cần bao nhiêu — "'+r.tinCay.giaiThich+'"');
  const r7 = api.thDuBao({ lichSuNgay: lichSu(()=>50, 7), ngayDich: DICH, ngayDacBiet:{} });
  ok(r7.duBao !== null, 'đủ 7 ngày thì bắt đầu dự báo');
  ok(r7.tinCay.muc === 'yeu', 'nhưng chỉ ở mức "tạm dùng" — được '+r7.tinCay.nhan);
}

console.log('2. Nền lấy TRUNG VỊ CÙNG THỨ, không phải trung bình mọi ngày');
{
  // Thứ 7 bán 80, các ngày khác 40. Trung bình mọi ngày ≈ 46 — sai hẳn.
  const r = api.thDuBao({ lichSuNgay: lichSu((d,thu)=> thu===6 ? 80 : 40), ngayDich: DICH, ngayDacBiet:{} });
  gan(r.nen, 80, 'nền = trung vị của thứ 7');
  ok(r.nguonNen === 'cùng thứ', 'nguồn nền là "cùng thứ"');
  ok(r.soMauCungThu >= 7, 'đủ mẫu cùng thứ — '+r.soMauCungThu+' lần');
  ok(r.tinCay.muc === 'du', 'độ tin cậy: đáng tin');
  gan(r.duBao, 80, 'dự báo bằng nền khi không có xu hướng');
}

console.log('3. Một ngày đột biến KHÔNG kéo lệch dự báo (trung vị, không trung bình)');
{
  const ls = lichSu((d,thu)=> thu===6 ? 80 : 40);
  const t7 = Object.keys(ls).filter(d=>new Date(d+'T12:00:00').getDay()===6).sort();
  ls[t7[0]].dung = 400;   // một hôm đoàn khách 30 người
  const r = api.thDuBao({ lichSuNgay: ls, ngayDich: DICH, ngayDacBiet:{} });
  gan(r.nen, 80, 'trung vị vẫn 80 dù có ngày 400');
}

console.log('4. Xu hướng tăng/giảm, và bị KẸP lại');
{
  // 14 ngày gần nhất gấp đôi 14 ngày trước đó → xu hướng thật ×2, kẹp còn ×1,25
  const ls = lichSu((d)=> d >= api.dbLui(DICH,14) ? 100 : 50);
  const r = api.thDuBao({ lichSuNgay: ls, ngayDich: DICH, ngayDacBiet:{} });
  gan(r.xuHuong, 1.25, 'xu hướng bị kẹp ở trần 1,25');
  ok(r.ghiChu.some(g=>/kẹp lại/.test(g)), 'nói rõ đã kẹp — "'+(r.ghiChu.find(g=>/kẹp/.test(g))||'')+'"');
  const lsGiam = lichSu((d)=> d >= api.dbLui(DICH,14) ? 20 : 100);
  gan(api.thDuBao({lichSuNgay:lsGiam, ngayDich:DICH, ngayDacBiet:{}}).xuHuong, 0.80, 'chiều giảm kẹp ở sàn 0,80');
  const lsNhe = lichSu((d)=> d >= api.dbLui(DICH,14) ? 110 : 100);
  gan(api.thDuBao({lichSuNgay:lsNhe, ngayDich:DICH, ngayDacBiet:{}}).xuHuong, 1.10, 'xu hướng trong ngưỡng thì giữ nguyên');
}

console.log('5. Ngày đặc biệt — học từ dữ liệu, KHÔNG bịa hệ số');
{
  const ls = lichSu((d,thu)=> 50);
  const dd = {};
  // hai ngày lễ trước đó bán gấp rưỡi
  const ngayLe = [D(DICH,14), D(DICH,28)];
  ngayLe.forEach(d=>{ ls[d].dung = 75; dd[d] = {loai:'le', ten:'Lễ cũ'}; });
  dd[DICH] = {loai:'le', ten:'Lễ mới'};
  const r = api.thDuBao({ lichSuNgay: ls, ngayDich: DICH, ngayDacBiet: dd });
  gan(r.heSoDacBiet, 1.5, 'học được hệ số 1,5 từ 2 ngày lễ cũ');
  gan(r.mauDacBiet, 2, 'nêu rõ học từ mấy ngày');
  ok(r.ghiChu.some(g=>/học từ 2 ngày cùng loại/.test(g)), 'nói rõ căn cứ');
  gan(r.duBao, 75, 'dự báo = 50 × 1,5');

  // Chưa từng có ngày cùng loại → KHÔNG bịa
  const dd2 = { [DICH]: {loai:'tet', ten:'Tết'} };
  const r2 = api.thDuBao({ lichSuNgay: lichSu(()=>50), ngayDich: DICH, ngayDacBiet: dd2 });
  gan(r2.heSoDacBiet, 1, 'chưa có ngày Tết nào trước đó → hệ số 1,00');
  ok(r2.ghiChu.some(g=>/CHƯA có ngày cùng loại/.test(g)), 'và NÓI RÕ là chưa có căn cứ');
  // ngày lễ cũ KHÔNG được tính vào nền ngày thường
  ok(r.nen === 50, 'ngày lễ cũ bị loại khỏi nền ngày thường — được '+r.nen);
}

console.log('6. Không dùng chính ngày đích để dự báo nó');
{
  const ls = lichSu(()=>50);
  ls[DICH] = { dung: 9999, huy:0, nau:0 };
  const r = api.thDuBao({ lichSuNgay: ls, ngayDich: DICH, ngayDacBiet:{} });
  gan(r.nen, 50, 'ngày đích bị loại khỏi lịch sử');
}

console.log('7. Số mẻ — ví dụ trân châu hoàng kim của chủ quán');
{
  // Tồn đầu 15 phần · dự báo 70 · mỗi mẻ 30 phần
  const k = api.thKeHoachNau({ duBao:70, tonDungDuoc:15, yieldMoiMe:30, shelfLifeType:'endOfDay' });
  gan(k.can, 70*1.05-15, 'cần sản xuất = 70×1,05 − 15');
  gan(k.soMe, 2, 'đề xuất 2 mẻ');
  gan(k.sanXuat, 60, 'tổng nấu 60 phần');
  gan(k.tongKhaDung, 75, 'tổng khả dụng 75 phần');
  gan(k.duKienDu, 5, 'dự kiến dư 5 phần');
  gan(k.duKienHuy, 5, 'hàng bỏ cuối ca → 5 phần đó là phải đổ');
  gan(k.nguyCoThieu, 0, 'không có nguy cơ thiếu');
}

console.log('8. Ưu tiên ÍT HUỶ: thiếu nhẹ thì không nấu thêm cả mẻ');
{
  // cần 63 → 2,1 mẻ. Thiếu nếu chỉ nấu 2 mẻ = 3 phần = 10% một mẻ → chấp nhận thiếu.
  const k = api.thKeHoachNau({ duBao:75, tonDungDuoc:15, yieldMoiMe:30, shelfLifeType:'endOfDay' });
  gan(k.soMe, 2, 'làm tròn XUỐNG còn 2 mẻ');
  ok(/thiếu nhẹ vẫn hơn/.test(k.quyTac), 'nói rõ vì sao — "'+k.quyTac+'"');
  gan(k.duKienDu, 0, 'vẫn đủ đúng bằng dự báo — chỉ mất phần đệm an toàn');
  // Trường hợp làm tròn xuống ĐÚNG LÀ chấp nhận thiếu thật
  const kThieu = api.thKeHoachNau({ duBao:78, tonDungDuoc:15, yieldMoiMe:30, shelfLifeType:'endOfDay' });
  gan(kThieu.soMe, 2, 'vẫn 2 mẻ');
  gan(kThieu.nguyCoThieu, 3, 'và nêu thẳng nguy cơ thiếu 3 phần');
  gan(kThieu.duKienHuy, 0, 'thiếu thì không có gì để huỷ');
  // thiếu nhiều (quá 25% một mẻ) thì vẫn phải nấu thêm
  const k2 = api.thKeHoachNau({ duBao:95, tonDungDuoc:15, yieldMoiMe:30, shelfLifeType:'endOfDay' });
  gan(k2.soMe, 3, 'thiếu quá nhiều → nấu 3 mẻ');
  ok(/vẫn phải nấu thêm/.test(k2.quyTac), 'giải thích khác đi');
  // hàng để được sang mai thì luôn làm tròn LÊN
  const k3 = api.thKeHoachNau({ duBao:75, tonDungDuoc:15, yieldMoiMe:30, shelfLifeType:'days' });
  gan(k3.soMe, 3, 'hàng để được → làm tròn lên');
  gan(k3.duKienHuy, 0, 'dư không tính là huỷ, chuyển sang mai');
  ok(/không mất gì/.test(k3.quyTac), 'giải thích đúng lý do');
}

console.log('9. Chưa khai yield mỗi mẻ → không quy ra số mẻ');
{
  const k = api.thKeHoachNau({ duBao:70, tonDungDuoc:0, yieldMoiMe:0, shelfLifeType:'endOfDay' });
  ok(k.soMe === null && k.thieuYield, 'trả null chứ không chia cho 0');
  ok(/khối lượng thu được mỗi mẻ/.test(k.lyDo), 'nói rõ thiếu gì');
}

console.log('10. Tồn còn DÙNG ĐƯỢC — lô hết hạn không phải là hàng');
{
  const batches=[
    {prepId:'p1', status:'active', qtyRemaining:10, businessDate:'2026-11-07', expiresAt:'2026-11-08T00:00:00Z'},
    {prepId:'p1', status:'active', qtyRemaining:20, businessDate:'2026-11-06', expiresAt:'2026-11-06T20:00:00Z'},
    {prepId:'p1', status:'used_up', qtyRemaining:0,  businessDate:'2026-11-07'},
    {prepId:'p2', status:'active', qtyRemaining:99, businessDate:'2026-11-07'}
  ];
  const t = api.thTonDungDuoc(batches, 'p1', '2026-11-07', 'hours');
  gan(t.dung, 10, 'chỉ cộng lô còn hạn');
  gan(t.hetHan, 20, 'lô quá hạn tách riêng, không giấu đi');
  const t2 = api.thTonDungDuoc(batches, 'p1', '2026-11-07', 'endOfDay');
  gan(t2.dung, 10, 'hàng bỏ cuối ca: lô hôm trước không mang sang');
  gan(t2.hetHan, 20, 'phần không mang sang được nói ra');
}

console.log('11. Lịch sử BTP: DÙNG và HUỶ phải tách');
{
  const ls = api.thLichSuBTP([
    {prepId:'p1', businessDate:'2026-11-01', type:'CONSUMPTION', qty:-60},
    {prepId:'p1', businessDate:'2026-11-01', type:'WASTE', qty:-40},
    {prepId:'p1', businessDate:'2026-11-01', type:'PRODUCTION', qty:100}
  ]);
  gan(ls.p1['2026-11-01'].dung, 60, 'dùng 60');
  gan(ls.p1['2026-11-01'].huy, 40, 'huỷ 40 — KHÔNG gộp vào "tiêu thụ 100"');
  gan(ls.p1['2026-11-01'].nau, 100, 'nấu 100');
}

console.log('12. Đối chiếu dự báo với thực tế');
{
  const ls = { p1: { '2026-11-07': {dung:65, huy:5, nau:60} } };
  const r = api.thDoiChieuDuBao([
    {prepId:'p1', date:'2026-11-07', duBao:70, tongKhaDung:75},
    {prepId:'p1', date:'2026-11-08', duBao:70, tongKhaDung:75}
  ], ls);
  gan(r[0].thucTeDung, 65, 'lấy đúng số thực tế');
  gan(r[0].saiSo, 5, 'sai số +5 (dự báo cao hơn)');
  gan(r[0].saiSoPct, 5/65*100, 'sai số %');
  ok(r[0].duBan === true, 'đủ bán');
  ok(r[1].chuaCoThucTe === true, 'ngày chưa tới → chưa có thực tế, không bịa 0');
}

console.log(`\n${pass} đúng · ${fail} sai`);
process.exit(fail?1:0);
