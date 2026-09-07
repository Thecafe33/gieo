// Kiểm thử MÀN DỰ BÁO & SỐ MẺ trên file HTML thật trong Chromium.
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const HTML = join(dirname(fileURLToPath(import.meta.url)), 'quanlygieo.html');
const { chromium } = await import(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p = await b.newPage();
const loi = [];
p.on('pageerror', e => loi.push('pageerror: ' + e.message));
await p.route('**/*firebasejs/**', r => r.fulfill({contentType:'application/javascript', body:`
  (function(){
  const q = { get: async () => ({docs:[], forEach(){}, empty:true}), where(){return q;}, orderBy(){return q;},
    limit(){return q;}, doc(){return q;}, add: async()=>({id:'x'}), set: async()=>{}, update: async()=>{},
    delete: async()=>{}, collection(){return q;}, exists:false, data:()=>({}) };
  window.firebase = { initializeApp: ()=>({}), apps: [],
    firestore: Object.assign(()=>({collection:()=>q, doc:()=>q}), {FieldPath:{documentId:()=>'id'}, FieldValue:{}}),
    auth: ()=>({signInAnonymously: async()=>({}), onAuthStateChanged:(cb)=>cb({uid:'u'}), currentUser:{uid:'u'}}),
    database: ()=>({ref:()=>({once: async()=>({val:()=>null}), get: async()=>({val:()=>null})})}) };
  })();
`}));
await p.goto('file://' + HTML);
await p.waitForTimeout(1500);

const kq = await p.evaluate(async () => {
  const out = { luu: [] };
  // Ngày đích = NGÀY MAI thật, để phần "đối chiếu dự báo cũ" (chỉ xét ngày đã qua)
  // có dữ liệu. Lịch sử dựng theo ĐÚNG thứ của ngày đích nên khẳng định vẫn đúng
  // dù chạy test vào thứ nào.
  const _mai = new Date(); _mai.setDate(_mai.getDate()+1);
  const DICH = `${_mai.getFullYear()}-${String(_mai.getMonth()+1).padStart(2,'0')}-${String(_mai.getDate()).padStart(2,'0')}`;
  const THU_DICH = _mai.getDay();
  const lui = (n)=>{ const d=new Date(DICH+'T12:00:00'); d.setDate(d.getDate()-n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  // Trân châu hoàng kim: thứ 7 bán 70, ngày thường 40. 56 ngày lịch sử.
  const txs = [];
  for(let n=1;n<=56;n++){
    const d = lui(n), thu = new Date(d+'T12:00:00').getDay();
    txs.push({prepId:'tc', businessDate:d, type:'CONSUMPTION', qty:-(thu===THU_DICH?70:40)});
  }
  txs.push({prepId:'tc', businessDate:lui(7), type:'WASTE', qty:-12});
  // Cốt trà: chỉ 3 ngày dữ liệu → chưa dự báo được
  [1,2,3].forEach(n=> txs.push({prepId:'ct', businessDate:lui(n), type:'CONSUMPTION', qty:-500}));

  window.ensureAuth = async()=>({uid:'u'});
  window.toast = t=>{ out.toast=t; };
  window.showError = t=>{ out.showError=t; };
  window.loadPrepItems = async()=>[
    {id:'tc', name:'Trân châu hoàng kim', unit:'phần', batchYield:30, shelfLifeType:'endOfDay', prepTimeMinutes:45, active:true},
    {id:'ct', name:'Cốt trà sữa', unit:'ml', batchYield:2000, shelfLifeType:'days', active:true}
  ];
  window.loadPrepTxRange = async()=>txs;
  window.loadPrepBatches = async()=>[
    {prepId:'tc', status:'active', qtyRemaining:15, businessDate:DICH, expiresAt:'2099-01-01T00:00:00Z'},
    {prepId:'tc', status:'active', qtyRemaining:8,  businessDate:lui(1), expiresAt:DICH+'T02:00:00Z'},
    {prepId:'ct', status:'active', qtyRemaining:300, businessDate:lui(1), expiresAt:'2099-01-01T00:00:00Z'}
  ];
  window.loadSpecialDays = async()=>[];
  // Topping: trân châu trắng bán 25 phần vào đúng thứ của ngày đích, 10 phần ngày
  // thường; 6 ngày cũ KHÔNG có toppingMix (cache ghi trước khi có tính năng).
  window.loadToppingRecipes = async()=>{ TOPPING_RECIPES = {
    tp1: { batchInputs:[{refType:'item',itemId:'i1',qty:500}], yieldMode:'servings', batchYield:20 },
    tp2: { batchInputs:[{refType:'item',itemId:'i2',qty:800}], yieldMode:'weight', batchYield:2000, qtyPerServing:50 },
    tp3: { batchInputs:[{refType:'item',itemId:'i3',qty:100}], yieldMode:'servings', batchYield:0 }
  }; return TOPPING_RECIPES; };
  window.loadMenuForManager = async()=>{ TOPPINGS = [{id:'tp1',name:'Trân châu trắng'},{id:'tp2',name:'Thạch dừa'},{id:'tp3',name:'Chưa khai mẻ'}]; };
  window.fetchSalesRange = async()=>{
    const perDay = [];
    for(let n=56;n>=1;n--){
      const d = lui(n), thu = new Date(d+'T12:00:00').getDay();
      if(n <= 6){ perDay.push({date:d, revenue:0}); continue; }   // ngày cache cũ: KHÔNG có toppingMix
      perDay.push({ date:d, revenue:0, toppingMix: thu===THU_DICH ? {tp1:25, tp2:8} : {tp1:10} });
    }
    return { perDay, totals:{items:0}, dayCount:perDay.length, cachedCount:0 };
  };
  window.loadPrepForecasts = async()=>out.forecasts || [];
  window.savePrepForecast = async(date,prepId,data)=>{ out.luu.push({date,prepId,data}); };

  if(!document.getElementById('entryBody')){ const d=document.createElement('div'); d.id='entryBody'; document.body.appendChild(d); }
  document.getElementById('entryBody').innerHTML = '<div id="khoBody"></div>';

  await window.renderKhoDuBao();
  out.ngayMacDinh = document.getElementById('dbNgay').value;
  out.giaiThich = document.getElementById('khoBody').textContent.replace(/\s+/g,' ');
  document.getElementById('dbNgay').value = DICH;
  await window.dbChay();
  out.man = document.getElementById('dbBody').textContent.replace(/\s+/g,' ');

  const tc = dbKetQua.find(x=>x.id==='tc');
  out.tc = { duBao: tc.dubao.duBao, nen: tc.dubao.nen, nguonNen: tc.dubao.nguonNen,
             tinCay: tc.dubao.tinCay.muc, ton: tc.ton.dung, tonHetHan: tc.ton.hetHan,
             soMe: tc.keHoach.soMe, sanXuat: tc.keHoach.sanXuat, tongKhaDung: tc.keHoach.tongKhaDung,
             duKienDu: tc.keHoach.duKienDu, duKienHuy: tc.keHoach.duKienHuy, quyTac: tc.keHoach.quyTac };
  out.tp1 = (()=>{ const x = dbKetQua.find(y=>y.id==='tp:tp1');
    return { ten:x.ten, donVi:x.donVi, yieldMoiMe:x.yieldMoiMe, duBao:x.dubao.duBao, nen:x.dubao.nen,
             soMe:x.keHoach.soMe, tongKhaDung:x.keHoach.tongKhaDung, duKienHuy:x.keHoach.duKienHuy,
             ton:x.ton.dung, ghiChuTon:x.ghiChuTon, soNgay:x.dubao.soNgayCoDuLieu }; })();
  out.tp2Yield = (dbKetQua.find(y=>y.id==='tp:tp2')||{}).yieldMoiMe;
  out.tp2NenCo0 = (()=>{ const x = dbKetQua.find(y=>y.id==='tp:tp2'); return x ? x.dubao.nen : null; })();
  const _tph = thLichSuTopping((await window.fetchSalesRange()).perDay);
  out.tp2So0 = Object.values(_tph.lichSu.tp2||{}).filter(v=>v.dung===0).length;
  out.tp3Co = !!dbKetQua.find(y=>y.id==='tp:tp3');
  out.thieuNgayTopping = dbThieuNgayTopping;
  const ct = dbKetQua.find(x=>x.id==='ct');
  out.ct = { duBao: ct.dubao.duBao, tinCay: ct.dubao.tinCay.muc, giaiThich: ct.dubao.tinCay.giaiThich, keHoach: ct.keHoach };

  await window.dbLuuKeHoach();
  out.daLuu = out.luu.map(x=>({date:x.date, prepId:x.prepId, duBao:x.data.duBao, soMe:x.data.soMe,
    doTinCay:x.data.doTinCay, tonDau:x.data.tonDau, duKienHuy:x.data.duKienHuy, nen:x.data.nen}));

  // Đối chiếu dự báo cũ với thực tế
  out.forecasts = [{date: lui(7), prepId:'tc', prepName:'Trân châu hoàng kim', duBao:70, tongKhaDung:75}];
  await window.dbChay();
  out.dc = dbDoiChieu.filter(x=>!x.chuaCoThucTe).map(x=>({date:x.date, duBao:x.duBao,
    thucTeDung:x.thucTeDung, thucTeHuy:x.thucTeHuy, duBan:x.duBan}));
  out.manDC = document.getElementById('dbBody').textContent.replace(/\s+/g,' ');
  out.dem = demToppingDong({qty:3, toppings:[{id:'tp1', qty:2}, {_freeTpId:'tpFree'}]}, {});
  out.demTuAgg = aggregateOrders([{ total:0, itemsArray:[{qty:3, toppings:[{id:'tp1', qty:2}]}] }]).toppingMix;
  return out;
});

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };
const gan=(a,b,m,e=0.01)=>ok(a!=null&&Math.abs(a-b)<=e, `${m} — được ${a}, cần ${b}`);

console.log('\n1. Màn Dự báo');
ok(kq.ngayMacDinh > '2026-09-06', 'mặc định lên kế hoạch cho NGÀY MAI — được '+kq.ngayMacDinh);
ok(/đủ phục vụ · dư ít · huỷ ít nhất/.test(kq.giaiThich), 'nói rõ mục tiêu không phải chỉ "đủ hàng"');
ok(/thiếu nhẹ vẫn hơn|¼ mẻ/.test(kq.giaiThich), 'giải thích quy tắc làm tròn của hàng hạn ngắn');

console.log('2. Trân châu hoàng kim — đúng ví dụ chủ quán');
gan(kq.tc.nen, 70, 'nền = trung vị thứ 7');
ok(kq.tc.nguonNen === 'cùng thứ', 'lấy theo cùng thứ');
ok(kq.tc.tinCay === 'du', 'đủ tin cậy');
gan(kq.tc.ton, 15, 'tồn đầu ngày CÒN DÙNG ĐƯỢC = 15');
gan(kq.tc.tonHetHan, 8, 'lô 8 phần quá hạn bị loại ra, không giấu');
gan(kq.tc.duBao, 70, 'dự báo 70 phần');
gan(kq.tc.soMe, 2, 'đề xuất nấu 2 mẻ');
gan(kq.tc.sanXuat, 60, '60 phần');
gan(kq.tc.tongKhaDung, 75, 'tổng khả dụng 75');
gan(kq.tc.duKienDu, 5, 'dự kiến dư 5');
gan(kq.tc.duKienHuy, 5, 'hàng bỏ cuối ca → 5 phần đó là phải đổ');
ok(/2 mẻ/.test(kq.man), 'màn hình hiện số mẻ');
ok(/phải đổ/.test(kq.man), 'màn hình nói thẳng phần dự kiến phải đổ');

console.log('3. Chưa đủ dữ liệu → KHÔNG bịa số');
ok(kq.ct.duBao === null, 'cốt trà (3 ngày dữ liệu) không có dự báo');
ok(kq.ct.keHoach === null, 'và không có đề xuất số mẻ');
ok(kq.ct.tinCay === 'chuaDu', 'đánh dấu chưa đủ dữ liệu');
ok(/cần ít nhất 7 ngày/.test(kq.ct.giaiThich), 'nói rõ cần thêm bao nhiêu');
ok(/Chưa dự báo được/.test(kq.man), 'màn hình nói thẳng ra');

console.log('4. Topping — lịch sử lấy từ bill đã bán');
ok(kq.tp1.ten === 'Trân châu trắng', 'lấy đúng tên topping');
ok(kq.tp1.donVi === 'phần', 'đơn vị là phần');
gan(kq.tp1.yieldMoiMe, 20, 'mẻ chia được 20 phần (yieldMode servings)');
gan(kq.tp2Yield, 40, 'mẻ cân 2000g, mỗi phần 50g → 40 phần (yieldMode weight)');
ok(kq.tp3Co === false, 'topping chưa khai mẻ (yield 0) bị bỏ qua, không chia cho 0');
gan(kq.tp1.nen, 25, 'nền = trung vị cùng thứ của topping');
gan(kq.tp1.duBao, 25, 'dự báo 25 phần');
gan(kq.tp1.ton, 0, 'tồn topping coi như 0');
ok(/chưa theo dõi tồn topping/.test(kq.tp1.ghiChuTon||''), 'và NÓI RÕ vì sao — "'+(kq.tp1.ghiChuTon||'').slice(0,50)+'…"');
gan(kq.tp1.soMe, 2, 'cần 26,25 phần, mẻ 20 phần → thiếu 6,25 vượt ¼ mẻ nên vẫn phải nấu mẻ thứ hai');
gan(kq.tp1.tongKhaDung, 40, 'tổng khả dụng 40 phần');
gan(kq.tp1.duKienHuy, 15, 'và nói thẳng: dự kiến phải đổ 15 phần');
gan(kq.thieuNgayTopping, 6, '6 ngày cache cũ không có số topping — đếm và nói ra');
gan(kq.tp1.soNgay, 50, 'và bị loại khỏi lịch sử: còn 50 ngày');
gan(kq.tp2NenCo0, 8, 'thạch dừa: nền = 8 phần (chỉ bán vào đúng thứ đó)');
gan(kq.tp2So0, 42, 'ngày CÓ số liệu mà thạch dừa không xuất hiện = bán 0 phần THẬT, phải điền 0');
ok(/6 ngày/.test(kq.man), 'màn hình nói ra số ngày thiếu dữ liệu topping');
ok(/gồm cả topping/.test(kq.man), 'nói rõ có tính cả topping tặng');

console.log('5. Lưu kế hoạch để hôm sau đối chiếu');
ok(kq.daLuu.length === 3, 'lưu 1 bán thành phẩm + 2 topping — được '+kq.daLuu.length);
ok(kq.daLuu[0].prepId === 'tc', 'đúng bán thành phẩm');
ok(kq.daLuu.some(x=>x.prepId==='tp:tp1'), 'topping lưu với khoá tp:<id> để đối chiếu chung một sổ');
gan(kq.daLuu[0].duBao, 70, 'lưu con số dự báo');
gan(kq.daLuu[0].soMe, 2, 'lưu số mẻ đề xuất');
gan(kq.daLuu[0].tonDau, 15, 'lưu tồn đầu ngày');
gan(kq.daLuu[0].nen, 70, 'lưu cả CĂN CỨ (nền) để sau truy lại được');
ok(kq.daLuu[0].doTinCay === 'du', 'lưu độ tin cậy tại thời điểm dự báo');

console.log('6. Đếm topping dùng chung một phép đếm');
ok(kq.dem && kq.dem.tp1 === 6, 'dòng 3 ly, mỗi ly 2 phần trân châu → 6 phần — được '+(kq.dem||{}).tp1);
ok(kq.dem && kq.dem.tpFree === 3, 'topping TẶNG cũng tính (khách không trả tiền nhưng vẫn ăn nguyên liệu)');
ok(kq.demTuAgg && kq.demTuAgg.tp1 === 6, 'aggregateOrders dùng ĐÚNG hàm đếm đó, không có phép đếm thứ hai');

console.log('7. Đối chiếu dự báo cũ với thực tế');
ok(kq.dc.length === 1, 'có 1 dòng đối chiếu');
gan(kq.dc[0].duBao, 70, 'dự báo cũ');
gan(kq.dc[0].thucTeDung, 70, 'thực bán');
gan(kq.dc[0].thucTeHuy, 12, 'thực đổ 12 — tách khỏi phần bán');
ok(kq.dc[0].duBan === true, 'đánh giá "đủ bán"');
ok(/đủ bán mà không phải đổ nhiều/.test(kq.manDC), 'nói rõ "đúng" nghĩa là gì');

const loiThat = loi.filter(l => !/net::|Failed to load|firebase|Firebase|401|403|permission/i.test(l));
ok(loiThat.length===0, 'không có lỗi JS: ' + loiThat.join(' | '));
console.log(`\n${pass} đúng · ${fail} sai`);
await b.close();
process.exit(fail?1:0);
