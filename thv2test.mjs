// Kiểm thử phần HIỂN THỊ của cơ chế thu hồi vốn: dựng HTML thật bằng các hàm thật,
// chỉ thay ic()/VN_MONTHS bằng bản giả. Bắt lỗi template literal + biến không tồn tại.
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
const names=['totalCapex','thvTienNgay','thvTongVon','thvMocBatDau','thvCompute',
  'thvBarHTML','thvChiTietHTML','thvCardHTML','thvHealthHTML','fmt','fmtNum','rowInfoHTML','monthLabelVN'];
const prelude = `
  const THV_MAX_DAYS = ${/THV_MAX_DAYS\s*=\s*(\d+)/.exec(src)[1]};
  const VN_MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const ic = (n,s)=>'<svg data-ic="'+n+'"></svg>';
`;
const api = new Function(prelude + names.map(grab).join('\n') + '\nreturn {'+names.join(',')+'};')();

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+m); } };
const co=(h,t,m)=>ok(h.includes(t), m+` — không thấy "${t}"`);
const sach=(h,m)=>{ ok(!/undefined|NaN|\[object Object\]/.test(h), m+' — HTML lẫn undefined/NaN'); };
const ngay=(i)=>{ const d=new Date(2026,0,1); d.setDate(d.getDate()+i);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const D=(i,lai,kh)=>({date:ngay(i), lai, khauHao:kh});
const pl=(lai,kh)=>({lai, khauHao:kh});

console.log('\n1. Thẻ Giai đoạn 1 — đang thu hồi');
{
  const d = {...api.thvCompute({days:Array.from({length:30},(_,i)=>D(i,800000,200000)), tongVon:50000000, mocDaDat:null}),
    moc:'2026-01-01', batDauThat:'2026-01-01', biCatBot:false, chuaCoMoc:false, vonKhaiTay:0, vonLucDatMoc:0};
  const h = api.thvCardHTML(d, pl(-44000,200000));
  co(h,'Chưa thu hồi đủ','có chip trạng thái');
  co(h,'60%','hiện đúng 60%');
  co(h,'20.000.000đ','hiện đúng số còn cần');
  co(h,'156.000đ','hôm nay góp thêm 156k dù sổ cũ đang lỗ');
  co(h,'Xem cách tính','có nút mở cách tính');
  co(h,'width:60%','thanh tiến độ đúng 60%');
  sach(h,'thẻ giai đoạn 1');
}

console.log('2. Thẻ Giai đoạn 2 — đã thu hồi đủ');
{
  const d = {...api.thvCompute({days:Array.from({length:60},(_,i)=>D(i,800000,200000)), tongVon:50000000, mocDaDat:ngay(49)}),
    moc:'2026-01-01', batDauThat:'2026-01-01', biCatBot:false, chuaCoMoc:false, vonKhaiTay:0, vonLucDatMoc:50000000};
  const h = api.thvCardHTML(d, pl(300000,200000));
  co(h,'Đã thu hồi 100%','chip đã thu hồi đủ');
  co(h,'10.000.000đ','tiền thật của Giai đoạn 2');
  co(h,'kể từ ngày đạt mốc','nói rõ mốc thời gian');
  ok(!h.includes('Chưa thu hồi đủ'),'không còn chip giai đoạn 1');
  sach(h,'thẻ giai đoạn 2');
}

console.log('3. Mua thêm tài sản sau khi đã đạt mốc → tiến độ tụt, có ghi chú');
{
  const d = {...api.thvCompute({days:Array.from({length:60},(_,i)=>D(i,800000,200000)), tongVon:80000000, mocDaDat:ngay(49)}),
    moc:'2026-01-01', batDauThat:'2026-01-01', biCatBot:false, chuaCoMoc:false, vonKhaiTay:0, vonLucDatMoc:50000000};
  const h = api.thvCardHTML(d, pl(300000,200000));
  co(h,'Đã từng đạt 100%','nói ra chuyện đã từng đạt');
  co(h,'30.000.000đ','nêu số vốn khai thêm');
  co(h,'75%','tiến độ hiện tại 75%');
  sach(h,'thẻ vốn tăng thêm');
}

console.log('4. Cảnh báo ô "Vốn đầu tư ban đầu" khai khác tổng tài sản');
{
  const d = {...api.thvCompute({days:[D(0,800000,200000)], tongVon:38000000, mocDaDat:null}),
    moc:'2026-01-01', batDauThat:'2026-01-01', biCatBot:false, chuaCoMoc:false, vonKhaiTay:50000000, vonLucDatMoc:0};
  const h = api.thvCardHTML(d, pl(-44000,200000));
  co(h,'Ô "Vốn đầu tư ban đầu"','có cảnh báo lệch vốn');
  co(h,'38.000.000đ','nói rõ đang dùng tổng tài sản');
}

console.log('5. Chưa khai tài sản / chưa có ngày mua');
{
  const d1 = {...api.thvCompute({days:[], tongVon:0, mocDaDat:null}), chuaCoMoc:true, moc:null, batDauThat:null, biCatBot:false, vonKhaiTay:0, vonLucDatMoc:0};
  const h1 = api.thvCardHTML(d1, pl(0,0));
  co(h1,'Khai tài sản','mời khai tài sản');
  ok(!/\d\s*%/.test(h1),'không bịa con số % nào khi chưa có vốn');
  sach(h1,'thẻ chưa khai vốn');
  const d2 = {...api.thvCompute({days:[D(0,800000,200000)], tongVon:50000000, mocDaDat:null}), chuaCoMoc:true, moc:null, batDauThat:null, biCatBot:false, vonKhaiTay:0, vonLucDatMoc:0};
  co(api.thvCardHTML(d2, pl(0,0)),'chưa có ngày mua','nói rõ thiếu ngày mua');
}

console.log('6. Ghi chú ngày lỗ + trần 730 ngày');
{
  const d = {...api.thvCompute({days:[D(0,800000,200000), D(1,-1200000,200000)], tongVon:50000000, mocDaDat:null}),
    moc:'2023-01-01', batDauThat:'2024-09-08', biCatBot:true, chuaCoMoc:false, vonKhaiTay:0, vonLucDatMoc:0};
  const h = api.thvCardHTML(d, pl(-44000,200000));
  co(h,'1 ngày lỗ','đếm ngày lỗ');
  co(h,'730 ngày','nói ra trần quét');
  co(h,'2024-09-08','nói ra ngày thật bắt đầu cộng');
}

console.log('7. Khối màn Sức khoẻ tài chính');
{
  const d = {...api.thvCompute({days:[D(0,800000,200000), D(40,1000000,0)], tongVon:10000000, mocDaDat:null}),
    moc:'2026-01-01', batDauThat:'2026-01-01', biCatBot:false, chuaCoMoc:false, vonKhaiTay:0, vonLucDatMoc:0};
  const h = api.thvHealthHTML(d, 2000000, 41);
  co(h,'Thu hồi vốn','có tiêu đề khối');
  co(h,'Tháng 1/2026','bảng theo tháng dùng nhãn tiếng Việt');
  co(h,'Tháng 2/2026','đủ 2 tháng');
  co(h,'41 ngày','nêu số ngày của kỳ đang xem');
  co(h,'Trước khấu hao','giải thích nối với sổ cũ');
  sach(h,'khối sức khoẻ tài chính');
  const hRong = api.thvHealthHTML({chuaKhaiVon:true, chuaCoMoc:true}, 0, 0);
  co(hRong,'Chưa khai tài sản','khối rỗng vẫn nói ra lý do');
}

console.log(`\n${pass} đúng · ${fail} sai`);
process.exit(fail?1:0);
