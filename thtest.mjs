// Kiểm thử BỘ MÁY ĐỐI CHIẾU TIÊU HAO — hàm thuần, trích thẳng từ file HTML thật.
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
const konst = ['TH_TYPES','TH_LECH_BAT_THUONG','TH_MIN_KY','TH_CV_MAX'].map(k=>{
  const m = new RegExp('const '+k+' = ([^;]+);').exec(src); return 'const '+k+' = '+m[1]+';';
}).join('\n');
const names = ['fmtNum','pad','dkey','thChuanType','thGomLedger','thCongLedger','thPhieuCuaItem',
  'thTinhMotKy','thTrungVi','thCV','thDoTinCay','thDoiChieu','_thLui1Ngay','thDoPhu'];
const api = new Function(konst + '\n' + names.map(grab).join('\n') + '\nreturn {'+names.join(',')+'};')();

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };
const gan=(a,b,m,eps=0.001)=>ok(a!=null && Math.abs(a-b)<=eps, `${m} — được ${a}, cần ${b}`);
const tx=(itemId,date,type,qty)=>({itemId,businessDate:date,type,qty});
const phieu=(id,date,items,status='approved')=>({id,businessDate:date,status,countedBy:'An',items});
const dong=(itemId,counted,expected)=>({itemId,countedBase:counted,expectedBase:expected,varianceBase:counted-expected,unit:'g'});
const NL=[{id:'i1',name:'Bột sữa',unit:'g',costPerUnit:120}];

console.log('\n1. Đúng ví dụ chủ quán: 100 ly, định mức 5kg, kho hụt 5,5kg');
{
  // Tồn đầu 10.000g (đếm 01/09) → nhập 0 → tồn cuối 4.500g (đếm 10/09) → thực tế 5.500g
  // POS đã trừ theo định mức 5.000g, nhân viên khai hao hụt 200g.
  const r = api.thDoiChieu({
    items: NL,
    txs: [ tx('i1','2026-09-05','CONSUMPTION',-5000), tx('i1','2026-09-05','WASTE',-200) ],
    counts: [ phieu('c1','2026-09-01',[dong('i1',10000,10000)]),
              phieu('c2','2026-09-10',[dong('i1',4500,4800)]) ],
    tuKey:'2026-09-01', denKey:'2026-09-10'
  });
  const k = r.rows[0].kyGanNhat;
  ok(r.rows[0].duLieuDu, 'đủ dữ liệu');
  gan(k.tonDau, 10000, 'tồn đầu'); gan(k.tonCuoi, 4500, 'tồn cuối'); gan(k.nhap, 0, 'nhập');
  gan(k.thucTe, 5500, 'tiêu hao THỰC TẾ');
  gan(k.lyThuyet, 5000, 'tiêu hao LÝ THUYẾT (POS đã trừ theo định mức)');
  gan(k.haoHutDaGhi, 200, 'hao hụt đã ghi — tách riêng');
  gan(k.chenh, 500, 'chênh lệch');
  gan(k.chuaGiaiThich, 300, 'chênh CHƯA GIẢI THÍCH ĐƯỢC = 5500 − 5000 − 200');
  gan(k.pctChenh, 10, 'tỷ lệ chênh 10%');
  gan(k.heSo, 1.1, 'hệ số hiệu chỉnh 1,10');
  gan(k.soNgay, 9, 'kỳ dài 9 ngày');
  gan(r.rows[0].tienLech, 300*120, 'quy ra tiền: 300g × 120đ');
}

console.log('2. Không đủ phiếu kiểm kê → KHÔNG bịa số thực tế');
{
  const r = api.thDoiChieu({ items: NL, txs:[tx('i1','2026-09-05','CONSUMPTION',-5000)],
    counts:[phieu('c1','2026-09-01',[dong('i1',10000,10000)])], tuKey:'2026-09-01', denKey:'2026-09-10' });
  const row = r.rows[0];
  ok(row.duLieuDu === false, 'đánh dấu thiếu dữ liệu');
  ok(/HAI lần đếm/.test(row.thieuLyDo), 'nói rõ vì sao thiếu — "'+row.thieuLyDo+'"');
  ok(row.kyGanNhat === null, 'không có kỳ nào');
  gan(row.chiCoLedger.lyThuyet, 5000, 'vẫn cho xem phần ledger');
  ok(row.chiCoLedger.thucTe === undefined, 'nhưng KHÔNG có trường "thực tế"');
  const r0 = api.thDoiChieu({ items: NL, txs:[], counts:[], tuKey:'2026-09-01', denKey:'2026-09-10' });
  ok(/Chưa có phiếu kiểm kê nào/.test(r0.rows[0].thieuLyDo), 'chưa có phiếu nào cũng nói rõ');
  gan(r0.tongQuan.soThieuDuLieu, 1, 'tổng quan đếm đúng số thiếu dữ liệu');
}

console.log('3. Phiếu CHƯA DUYỆT không được dùng');
{
  const r = api.thDoiChieu({ items: NL, txs:[tx('i1','2026-09-05','CONSUMPTION',-5000)],
    counts:[ phieu('c1','2026-09-01',[dong('i1',10000,10000)]),
             phieu('c2','2026-09-10',[dong('i1',4500,4800)],'pending_review') ],
    tuKey:'2026-09-01', denKey:'2026-09-10' });
  ok(r.rows[0].duLieuDu === false, 'phiếu chờ duyệt bị bỏ qua');
}

console.log('4. Nhiều kỳ → trung vị, dao động, độ tin cậy');
{
  const mk = (d0,d1,ton0,ton1,ct)=>({txs:[tx('i1',d1,'CONSUMPTION',-ct)], p:[d0,d1,ton0,ton1]});
  const counts = [ phieu('c1','2026-09-01',[dong('i1',10000,10000)]),
                   phieu('c2','2026-09-08',[dong('i1',8900,9000)]),
                   phieu('c3','2026-09-15',[dong('i1',7800,7900)]),
                   phieu('c4','2026-09-22',[dong('i1',6650,6800)]) ];
  // mỗi kỳ POS trừ 1000, thực tế lần lượt 1100 / 1100 / 1150 → hệ số 1,10 / 1,10 / 1,15
  const txs = [ tx('i1','2026-09-05','CONSUMPTION',-1000), tx('i1','2026-09-12','CONSUMPTION',-1000),
                tx('i1','2026-09-19','CONSUMPTION',-1000) ];
  const r = api.thDoiChieu({ items: NL, txs, counts, tuKey:'2026-09-01', denKey:'2026-09-22' });
  const row = r.rows[0];
  gan(row.soKy, 3, 'ba kỳ');
  gan(row.cacKy[0].thucTe, 1100, 'kỳ 1 thực tế');
  gan(row.cacKy[2].thucTe, 1150, 'kỳ 3 thực tế');
  gan(row.heSoTrungVi, 1.10, 'trung vị hệ số (không phải trung bình)');
  ok(row.cv < 0.05, 'dao động thấp — được '+api.fmtNum(row.cv*100,1)+'%');
  ok(row.tinCay.muc === 'du', 'độ tin cậy: đáng tin — được '+row.tinCay.nhan);
}

console.log('5. Chưa đủ 3 kỳ / dao động mạnh → KHÔNG nói là đáng tin');
{
  ok(api.thDoTinCay(2, 0.01).muc === 'chuaDu', '2 kỳ → chưa đủ');
  ok(api.thDoTinCay(5, 0.45).muc === 'daoDong', 'dao động 45% → cảnh báo');
  ok(api.thDoTinCay(5, 0.05).muc === 'du', '5 kỳ ổn định → đáng tin');
  ok(/2 kỳ/.test(api.thDoTinCay(2,0.01).giaiThich), 'nói rõ đang có mấy kỳ');
}

console.log('6. Cờ bất thường — đánh dấu, KHÔNG xoá dòng');
{
  const am = api.thDoiChieu({ items: NL, txs:[], tuKey:'2026-09-01', denKey:'2026-09-10',
    counts:[phieu('c1','2026-09-01',[dong('i1',1000,1000)]), phieu('c2','2026-09-10',[dong('i1',2000,1000)])] });
  ok(/ÂM/.test(am.rows[0].kyGanNhat.batThuong.join(' ')), 'thực tế âm → gắn cờ');
  ok(am.rows[0].kyGanNhat.thucTe === -1000, 'nhưng con số vẫn giữ nguyên, không làm tròn về 0');

  const lech = api.thDoiChieu({ items: NL, tuKey:'2026-09-01', denKey:'2026-09-10',
    txs:[tx('i1','2026-09-05','CONSUMPTION',-1000)],
    counts:[phieu('c1','2026-09-01',[dong('i1',5000,5000)]), phieu('c2','2026-09-10',[dong('i1',3500,4000)])] });
  ok(/vượt 30%/.test(lech.rows[0].kyGanNhat.batThuong.join(' ')), 'lệch 50% → gắn cờ');

  const khongDinhMuc = api.thDoiChieu({ items: NL, txs:[], tuKey:'2026-09-01', denKey:'2026-09-10',
    counts:[phieu('c1','2026-09-01',[dong('i1',5000,5000)]), phieu('c2','2026-09-10',[dong('i1',4000,5000)])] });
  ok(/chưa khai định mức/.test(khongDinhMuc.rows[0].kyGanNhat.batThuong.join(' ')), 'dùng thật mà định mức trừ 0 → gắn cờ');

  const dc = api.thDoiChieu({ items: NL, tuKey:'2026-09-01', denKey:'2026-09-10',
    txs:[tx('i1','2026-09-05','CONSUMPTION',-1000), tx('i1','2026-09-06','ADJUSTMENT',-300), tx('i1','2026-09-07','TRANSFER',-500)],
    counts:[phieu('c1','2026-09-01',[dong('i1',5000,5000)]), phieu('c2','2026-09-10',[dong('i1',3900,4000)])] });
  const cb = dc.rows[0].kyGanNhat;
  ok(/điều chỉnh sổ giữa kỳ/.test(cb.batThuong.join(' ')), 'có ADJUSTMENT → nói ra');
  ok(/chuyển kho giữa kỳ/.test(cb.batThuong.join(' ')), 'có TRANSFER → nói ra');
  gan(cb.thucTe, 1100, 'ADJUSTMENT/TRANSFER KHÔNG được trừ vào tiêu hao thực tế');
}

console.log('7. Nhập hàng giữa kỳ');
{
  const r = api.thDoiChieu({ items: NL, tuKey:'2026-09-01', denKey:'2026-09-10',
    txs:[tx('i1','2026-09-05','CONSUMPTION',-3000), tx('i1','2026-09-03','RECEIVING',5000)],
    counts:[phieu('c1','2026-09-01',[dong('i1',2000,2000)]), phieu('c2','2026-09-10',[dong('i1',3800,4000)])] });
  const k = r.rows[0].kyGanNhat;
  gan(k.nhap, 5000, 'nhập trong kỳ');
  gan(k.thucTe, 3200, 'thực tế = 2000 + 5000 − 3800');
  gan(k.chuaGiaiThich, 200, 'chênh chưa giải thích');
}

console.log('8. Bản ghi CŨ dùng chữ thường vẫn đọc được');
{
  ok(api.thChuanType('waste')==='WASTE', 'waste → WASTE');
  ok(api.thChuanType('stock_in')==='RECEIVING', 'stock_in → RECEIVING');
  ok(api.thChuanType('adjustment')==='ADJUSTMENT', 'adjustment → ADJUSTMENT');
  ok(api.thChuanType('sale')==='CONSUMPTION', 'sale → CONSUMPTION');
  ok(api.thChuanType('cai_gi_do')==='KHAC', 'loại lạ → KHÁC, không nuốt mất');
  const r = api.thDoiChieu({ items: NL, tuKey:'2026-09-01', denKey:'2026-09-10',
    txs:[tx('i1','2026-09-05','waste',-200), tx('i1','2026-09-05','CONSUMPTION',-1000)],
    counts:[phieu('c1','2026-09-01',[dong('i1',5000,5000)]), phieu('c2','2026-09-10',[dong('i1',3800,4000)])] });
  gan(r.rows[0].kyGanNhat.haoHutDaGhi, 200, 'hao hụt chữ thường vẫn vào đúng cột');
}

console.log('9. Xếp theo TIỀN lệch, không theo số lượng lệch');
{
  const items=[{id:'re',name:'Đường',unit:'g',costPerUnit:5},{id:'dat',name:'Trà ô long',unit:'g',costPerUnit:900}];
  const counts=[phieu('c1','2026-09-01',[dong('re',10000,10000),dong('dat',1000,1000)]),
                phieu('c2','2026-09-10',[dong('re',3900,4000),dong('dat',890,900)])];
  const txs=[tx('re','2026-09-05','CONSUMPTION',-6000), tx('dat','2026-09-05','CONSUMPTION',-100)];
  const r = api.thDoiChieu({items, txs, counts, tuKey:'2026-09-01', denKey:'2026-09-10'});
  ok(r.rows[0].itemId==='dat', 'trà ô long lệch 10g (9.000đ) đứng trên đường lệch 100g (500đ)');
  gan(r.tongQuan.tienLechTong, 100*5 + 10*900, 'tổng tiền lệch');
}

console.log('10. Độ phủ định mức — phải nói ra, không được giấu');
{
  const alerts=[{type:'missing_recipe',businessDate:'2026-09-05',itemName:'Trà sữa mới',size:'M',hitCount:30},
                {type:'missing_recipe',businessDate:'2026-09-06',itemName:'Sữa chua dẻo',size:'',hitCount:12},
                {type:'missing_recipe',businessDate:'2026-08-01',itemName:'Món cũ',size:'M',hitCount:99}];
  const d = api.thDoPhu(alerts, 200, '2026-09-01', '2026-09-10');
  gan(d.soLuotHut, 42, 'đếm đúng số lượt không trừ được kho (bỏ ngày ngoài khoảng)');
  gan(d.doPhu*100, 79, 'độ phủ 79%');
  ok(d.monThieuDinhMuc[0].ten==='Trà sữa mới (M)', 'món gây thiếu nhiều nhất đứng đầu');
  ok(api.thDoPhu([],0).doPhu === null, 'chưa bán ly nào → độ phủ null, không chia cho 0');
}

console.log(`\n${pass} đúng · ${fail} sai`);
process.exit(fail?1:0);
