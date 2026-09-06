// Kiểm thử cơ chế THU HỒI VỐN — chỉ các hàm THUẦN, trích thẳng từ file HTML thật.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const HTML = join(dirname(fileURLToPath(import.meta.url)), 'quanlygieo.html');
const src = readFileSync(HTML,'utf8');

function grab(name){
  const i = src.indexOf('function '+name+'(');
  if(i<0) throw new Error('không thấy hàm '+name);
  // Bỏ qua danh sách tham số trước (thvCompute nhận object destructuring, dấu {}
  // của tham số sẽ làm bộ đếm ngoặc đóng sớm).
  let j = src.indexOf('(', i), p = 0;
  for(; j<src.length; j++){
    if(src[j]==='(') p++;
    else if(src[j]===')'){ p--; if(p===0){ j++; break; } }
  }
  let d=0, started=false;
  for(; j<src.length; j++){
    const c=src[j];
    if(c==='{'){d++;started=true;}
    else if(c==='}'){d--; if(started&&d===0) return src.slice(i,j+1);}
  }
  throw new Error('không đóng ngoặc '+name);
}
const code = ['totalCapex','thvTienNgay','thvTongVon','thvMocBatDau','thvCompute'].map(grab).join('\n');
const {thvTienNgay, thvTongVon, thvMocBatDau, thvCompute, totalCapex} =
  new Function(code + '\nreturn {thvTienNgay, thvTongVon, thvMocBatDau, thvCompute, totalCapex};')();

let pass=0, fail=0;
const ok=(cond,msg)=>{ if(cond){pass++;} else {fail++; console.log('  ✗ '+msg);} };
const gan=(a,b,msg,eps=0.5)=>ok(Math.abs(a-b)<=eps, `${msg} — được ${a}, cần ${b}`);
const ngay=(i)=>{ const d=new Date(2026,0,1); d.setDate(d.getDate()+i);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
// một "ngày" giả lập: chỉ cần lai + khauHao là đủ cho cơ chế thu hồi vốn
const D=(i,lai,khauHao)=>({date:ngay(i), lai, khauHao});

console.log('\n1. Tiền thu hồi ngày = lãi + khấu hao (đúng dòng "Trước khấu hao")');
[[800000,-44000,200000],[0,-550000,200000],[1200000,300000,200000],[500000,-100000,0],[999999,1,2]]
  .forEach(([dt,lai,kh])=>gan(thvTienNgay({doanhThu:dt,lai,khauHao:kh}), lai+kh, `lãi ${lai} + KH ${kh}`));
gan(thvTienNgay(null), 0, 'không có số liệu → 0');
// ví dụ bằng số ở kế hoạch: ngày LỖ 44.000 theo sổ cũ vẫn thu hồi được 156.000
gan(thvTienNgay({lai:-44000, khauHao:200000}), 156000, 'ngày lỗ 44k vẫn thu hồi 156k');

console.log('2. Ví dụ chủ quán: vốn 50tr, đã thu hồi 30tr');
{
  const days = Array.from({length:30},(_,i)=>D(i, 800000, 200000)); // 1tr/ngày × 30 = 30tr
  const r = thvCompute({days, tongVon:50000000, mocDaDat:null});
  gan(r.daThuHoi, 30000000, 'đã thu hồi');
  gan(r.pct, 60, 'tiến độ %');
  gan(r.conCan, 20000000, 'còn cần');
  ok(r.daDu===false, 'chưa đạt 100%');
  ok(r.ngayDat===null, 'chưa có ngày đạt mốc');
  gan(r.tocDoThang, 30000000, 'tốc độ 30 ngày gần nhất/tháng');
  gan(r.soThangConLai, 20000000/30000000, 'số tháng còn lại');
}

console.log('3. Chạm đúng 100% → ghi mốc đúng ngày');
{
  const days = Array.from({length:60},(_,i)=>D(i, 800000, 200000));
  const r = thvCompute({days, tongVon:50000000, mocDaDat:null});
  ok(r.daDu===true, 'đã đủ vốn');
  ok(r.ngayDat===ngay(49), `ngày đạt mốc phải là ngày thứ 50 — được ${r.ngayDat}`);
  gan(r.tienSauMoc, 10000000, 'tiền của Giai đoạn 2 (10 ngày sau mốc)');
  gan(r.conCan, 0, 'không còn phải thu hồi');
}

console.log('4. Vượt mốc: 51tr trên vốn 50tr');
{
  const days = Array.from({length:51},(_,i)=>D(i, 800000, 200000));
  const r = thvCompute({days, tongVon:50000000, mocDaDat:null});
  ok(r.daDu===true, 'đã đủ');
  gan(r.pct, 102, '% thô là 102 (màn hình mới chặn ở 100)');
  gan(r.conCan, 0, 'còn cần không âm');
  gan(r.tienSauMoc, 1000000, 'phần dư chảy sang Giai đoạn 2');
}

console.log('5. Ngày lỗ TRỪ vào luỹ kế, không làm tròn thành 0');
{
  const days=[D(0,800000,200000), D(1,-1200000,200000), D(2,800000,200000)];
  const r = thvCompute({days, tongVon:50000000, mocDaDat:null});
  gan(r.daThuHoi, 1000000-1000000+1000000, 'luỹ kế đã trừ ngày lỗ');
  ok(r.soNgayAm===1, 'đếm đúng 1 ngày âm');
  const rDuong = thvCompute({days:[D(0,800000,200000),D(1,800000,200000)], tongVon:50000000, mocDaDat:null});
  ok(rDuong.daThuHoi > r.daThuHoi, 'ngày lỗ làm luỹ kế thấp hơn');
}

console.log('6. Mốc KHÔNG phụ thuộc số tháng khấu hao đã khai');
{
  // Tài sản 50tr khai "thời gian sử dụng 12 tháng" → khấu hao 4.166.667/tháng.
  // Quán làm ra 7,2tr tiền mặt/tháng → thu đủ 50tr trong tháng thứ 7, KHÔNG phải 12.
  const khNgay = 50000000/12/30, tienNgay = 7200000/30;
  const days = Array.from({length:360},(_,i)=>D(i, tienNgay-khNgay, khNgay));
  const r = thvCompute({days, tongVon:50000000, mocDaDat:null});
  const thangDat = Math.ceil((days.findIndex(d=>d.date===r.ngayDat)+1)/30);
  ok(thangDat===7, `đạt mốc ở tháng thứ 7 (không phải 12) — được tháng ${thangDat}`);
}

console.log('7. Chưa khai vốn → không chia cho 0');
{
  const r = thvCompute({days:[D(0,800000,200000)], tongVon:0, mocDaDat:null});
  ok(r.chuaKhaiVon===true, 'cờ chưa khai vốn');
  ok(r.pct===null, '% là null chứ không phải Infinity/NaN');
  ok(r.daDu===false, 'không tự nhận đã thu hồi đủ');
  ok(r.ngayDat===null, 'không bịa ngày đạt mốc');
  const r2 = thvCompute({days:[], tongVon:50000000, mocDaDat:null});
  gan(r2.daThuHoi, 0, 'không có ngày nào → 0'); gan(r2.pct, 0, '0%');
  ok(r2.soThangConLai===null, 'chưa có tốc độ thì không bịa "còn N tháng"');
}

console.log('8. Mốc ĐÃ GHI không bị xoá khi mua thêm tài sản');
{
  const days = Array.from({length:60},(_,i)=>D(i, 800000, 200000)); // 60tr
  const r = thvCompute({days, tongVon:80000000, mocDaDat:ngay(49)}); // vốn tăng lên 80tr
  ok(r.daGhiMoc===true, 'giữ cờ đã ghi mốc');
  ok(r.ngayDat===ngay(49), 'giữ nguyên ngày đã đạt trong quá khứ');
  ok(r.daDu===false, 'nhưng tiến độ trên vốn MỚI thì chưa đủ');
  gan(r.pct, 75, 'tiến độ tụt còn 75%');
  gan(r.tienSauMoc, 10000000, 'tiền sau mốc vẫn đếm từ ngày đã ghi');
}

console.log('9. Tổng vốn = tổng nguyên giá tài sản active (không trừ residual)');
{
  const assets=[{purchaseCost:30000000, residualValue:5000000, purchaseDate:'2025-06-01'},
                {purchaseCost:20000000, residualValue:0, purchaseDate:'2025-03-15'},
                {purchaseCost:99000000, active:false, purchaseDate:'2024-01-01'}];
  gan(thvTongVon(assets), 50000000, 'tổng vốn bỏ tài sản đã ngưng, không trừ residual');
  ok(thvMocBatDau(assets,null)==='2025-03-15', 'mốc = ngày mua sớm nhất');
  ok(thvMocBatDau(assets,'2025-01-01')==='2025-01-01', 'chủ quán khai đè được');
  ok(thvMocBatDau([],null)===null, 'không có tài sản → không có mốc');
  ok(thvMocBatDau([{purchaseCost:1000, active:true}],null)===null, 'tài sản không có ngày mua → không có mốc');
}

console.log('10. Bảng theo tháng + thứ tự ngày lộn xộn vẫn đúng');
{
  const days=[D(40,1000000,0), D(0,800000,200000), D(20,500000,100000)];
  const r = thvCompute({days, tongVon:10000000, mocDaDat:null});
  ok(r.theoThang.length===2, `2 tháng (T1 + T2) — được ${r.theoThang.length}`);
  ok(r.theoThang[0].thang==='2026-01', 'tháng đầu là 2026-01');
  gan(r.theoThang[0].tien, 1600000, 'T1 thu hồi 1tr + 0,6tr');
  gan(r.theoThang[1].luyKe, 2600000, 'luỹ kế cuối T2');
  gan(r.theoThang[1].pct, 26, '% luỹ kế cuối T2');
  gan(r.daThuHoi, 2600000, 'tổng không phụ thuộc thứ tự đầu vào');
}

console.log(`\n${pass} đúng · ${fail} sai`);
process.exit(fail?1:0);
