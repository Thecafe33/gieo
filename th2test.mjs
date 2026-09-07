// Kiểm thử MÀN LỆCH KHO + SỔ ĐỀ XUẤT + KHỐI JSON — mở file HTML thật trong Chromium.
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
  const out = { ghiDeXuat: [], luuRecipe: [], capNhat: [] };
  const NL = [{id:'i1', name:'Bột sữa', unit:'g', costPerUnit:120},
              {id:'i2', name:'Trân châu', unit:'g', costPerUnit:60}];
  const tx=(itemId,date,type,qty)=>({itemId,businessDate:date,type,qty});
  const dong=(itemId,c,e)=>({itemId,countedBase:c,expectedBase:e,varianceBase:c-e,unit:'g'});

  window.ensureAuth = async()=>({uid:'u'});
  window.toast = t => { out.toast = t; };
  window.showError = t => { out.showError = t; };
  window.thLoadDuLieu = async () => ({
    items: NL,
    txs: [ tx('i1','2026-09-05','CONSUMPTION',-5000), tx('i1','2026-09-05','WASTE',-200),
           tx('i1','2026-09-14','CONSUMPTION',-5000), tx('i1','2026-09-14','WASTE',-200),
           tx('i1','2026-09-24','CONSUMPTION',-5000), tx('i1','2026-09-24','WASTE',-200) ],
    counts: [ {id:'c1',businessDate:'2026-09-01',status:'approved',items:[dong('i1',20000,20000)]},
              {id:'c2',businessDate:'2026-09-10',status:'approved',items:[dong('i1',14500,14800)]},
              {id:'c3',businessDate:'2026-09-20',status:'approved',items:[dong('i1',9000,9500)]},
              {id:'c4',businessDate:'2026-09-30',status:'approved',items:[dong('i1',3500,4000)]},
              {id:'c5',businessDate:'2026-09-30',status:'pending_review',items:[dong('i2',100,100)]} ],
    alerts: [{type:'missing_recipe',businessDate:'2026-09-05',itemName:'Trà sữa mới',size:'M',hitCount:30}]
  });
  window.fetchSalesRange = async () => ({ totals:{items:300}, perDay:[], dayCount:30, cachedCount:0 });
  window.loadRecipeSuggestions = async () => out.sgList || [];
  window.addRecipeSuggestion = async d => { out.ghiDeXuat.push(d); };
  window.loadMenuForManager = async () => {};
  window.saveRecipe = async (k, sizes) => { out.luuRecipe.push({k, sizes}); };
  window.loadRecipes = async () => RECIPES;
  window.loadPrepItems = async () => PREP_ITEMS;
  window.loadToppingRecipes = async () => TOPPING_RECIPES;
  RECIPES = { 'togo:m1': { sizes: { M: [{refType:'item', itemId:'i1', qty:50}], L: [{refType:'item', itemId:'i1', qty:70}] } } };
  PREP_ITEMS = [{id:'p1', name:'Cốt trà', unit:'ml', batchYield:1000, batchInputs:[{itemId:'i1', qty:300}]}];
  TOPPING_RECIPES = {};
  TOPPINGS = [];

  if(!document.getElementById('entryBody')){ const d=document.createElement('div'); d.id='entryBody'; document.body.appendChild(d); }
  document.getElementById('entryBody').innerHTML = '<div id="khoBody"></div>';

  await window.renderKhoLech();
  out.coONgay = !!document.getElementById('thFrom');
  out.mocMacDinh = document.getElementById('thFrom').value;
  out.giaiThichBaConSo = /Chênh chưa giải thích/.test(document.getElementById('khoBody').textContent);
  out.ghiChuMoc = document.getElementById('khoBody').textContent.replace(/\s+/g,' ');

  // Hôm nay là chính 06/09/2026 nên khoảng mặc định chỉ có 1 ngày — đặt tay khoảng
  // phủ đủ 4 phiếu kiểm kê của bộ dữ liệu giả.
  document.getElementById('thFrom').value = '2026-09-01';
  document.getElementById('thTo').value = '2026-09-30';
  await window.thChay();
  const t = document.getElementById('thBody').textContent.replace(/\s+/g,' ');
  out.bang = t;
  out.coTruocSau = /5\.500|5500/.test(t.replace(/\./g,'.'));

  const rows = thKetQua.rows;
  out.soRow = rows.length;
  const r1 = rows.find(r=>r.itemId==='i1');
  out.i1 = { duLieuDu:r1.duLieuDu, soKy:r1.soKy, heSo:r1.heSoTrungVi, tinCay:r1.tinCay.muc,
             chuaGiaiThich:r1.kyGanNhat.chuaGiaiThich, thucTe:r1.kyGanNhat.thucTe, lyThuyet:r1.kyGanNhat.lyThuyet };
  const r2 = rows.find(r=>r.itemId==='i2');
  out.i2ThieuDuLieu = !r2.duLieuDu;
  out.doPhu = thKetQua.doPhu.doPhu;
  out.choDuyet = thKetQua.soPhieuChoDuyet;

  // Tạo đề xuất
  window.thMoDeXuat('i1');
  const sheet = document.getElementById('editSheetWrap');
  out.sheetText = sheet ? sheet.textContent.replace(/\s+/g,' ') : '';
  out.soCho = document.querySelectorAll('.thSgChk').length;
  await window.thTaoDeXuat('i1');
  out.deXuat = out.ghiDeXuat.map(d=>({scope:d.scope, targetKey:d.targetKey, size:d.size, idx:d.idx,
    goc:d.giaTriGoc, deXuat:d.giaTriDeXuat, heSo:d.heSo, tinCay:d.doTinCay}));

  // Áp dụng một đề xuất định mức món
  const sg = { id:'s1', scope:'recipe', targetKey:'togo:m1', size:'M', idx:0, itemId:'i1',
               giaTriGoc:50, giaTriDeXuat:55, donVi:'g', nhan:'Định mức món', tenNguyenLieu:'Bột sữa' };
  out.sgList = [sg];
  window.confirm = () => true;
  window.setRecipeSuggestionState = async (id, patch) => { out.capNhat.push({id, patch}); };
  window.logAudit = () => {};
  thDeXuatList = [sg];
  await window.thApDung('s1');
  out.recipeSauKhiApDung = out.luuRecipe.length ? out.luuRecipe[0].sizes : null;
  out.recipeGocConNguyen = RECIPES['togo:m1'].sizes.M[0].qty;

  // Áp dụng vào ĐÚNG dòng khác nguyên liệu → phải chặn
  try{
    await window.thApDungDeXuat({scope:'recipe', targetKey:'togo:m1', size:'M', idx:0, itemId:'i9', giaTriDeXuat:1});
    out.chanSaiNguyenLieu = false;
  }catch(e){ out.chanSaiNguyenLieu = /nguyên liệu khác/.test(e.message); }

  // Khối hướng dẫn cho Claude
  const hd = _expHuongDanPhanTich();
  out.soNhiemVu = hd.nhiem_vu.length;
  out.coBatBuoc = hd.bat_buoc.length;
  out.nhacDoPhu = hd.bat_buoc.some(x=>/do_phu_dinh_muc/.test(x));
  out.nhacChuaDu = hd.bat_buoc.some(x=>/chưa đủ tin cậy/.test(x));
  const nt = _expNguyenTacDuLieu();
  out.bonTang = nt.bon_tang.length;

  // lich_su_theo_ngay
  const ls = _expLichSuTheoNgay(['2026-09-05','2026-09-06'],
    {'2026-09-05':{soBill:10,soLy:20,doanhThu:500000,mon:{'Trà sữa|M':20},topping:{}}},
    [{prepId:'p1',prepName:'Cốt trà',businessDate:'2026-09-05',batchRatio:2,qtyInitial:1900,qtyRemaining:200,startedAt:'2026-09-05T07:00:00Z',status:'active'}],
    [{prepId:'p1',prepName:'Cốt trà',businessDate:'2026-09-05',type:'WASTE',qty:-150,unit:'ml',note:'hết hạn'}],
    [{date:'2026-09-05',loai:'khuyenmai',ten:'Giảm 20%'}]);
  out.ls = ls;

  // tem kho
  out.tem = _expTomTatTem([{code:'A1B2C3D4',itemId:'i1',itemName:'Bột sữa',unit:'g',baseQty:1000,
    status:'open',openedAt:'2026-09-05T02:00:00Z',expiresAt:'2020-01-01T00:00:00Z',wasteBase:300,needsReview:true}]);

  // Màn ngày đặc biệt
  window.loadSpecialDays = async () => [{date:'2026-09-02',loai:'le',ten:'Quốc khánh'}];
  await window.renderEntryNgayDacBiet();
  out.sdText = document.getElementById('entryBody').textContent.replace(/\s+/g,' ');
  return out;
});

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };
const gan=(a,b,m,e=0.001)=>ok(a!=null&&Math.abs(a-b)<=e, `${m} — được ${a}, cần ${b}`);

console.log('\n1. Màn Lệch kho');
ok(kq.coONgay, 'có ô chọn khoảng ngày');
// Mốc ghi nhận (06/09/2026) mới hơn "hôm nay − 30 ngày" nên màn hình phải nới ra
// 30 ngày. Tính kỳ vọng theo ngày chạy test, không ghim cứng — ghim cứng thì mai
// chạy lại là đỏ mà chẳng có gì hỏng.
const _l30 = new Date(); _l30.setDate(_l30.getDate()-30);
const _mong = `${_l30.getFullYear()}-${String(_l30.getMonth()+1).padStart(2,'0')}-${String(_l30.getDate()).padStart(2,'0')}`;
ok(kq.mocMacDinh===_mong, 'mốc mới quá (hôm nay) → nới mặc định về 30 ngày — được '+kq.mocMacDinh+', cần '+_mong);
ok(/bắt đầu trước mốc/.test(kq.ghiChuMoc||''), 'và NÓI RÕ khoảng đang mở bắt đầu trước mốc ghi nhận');
ok(kq.giaiThichBaConSo, 'có giải thích ba con số khác nhau');

console.log('2. Đối chiếu đúng số');
ok(kq.i1.duLieuDu, 'bột sữa đối chiếu được');
gan(kq.i1.thucTe, 5500, 'thực tế kỳ gần nhất');
gan(kq.i1.lyThuyet, 5000, 'lý thuyết');
gan(kq.i1.chuaGiaiThich, 300, 'chênh chưa giải thích');
gan(kq.i1.soKy, 3, 'ba kỳ');
gan(kq.i1.heSo, 1.1, 'hệ số trung vị');
ok(kq.i1.tinCay==='du', 'đủ tin cậy — được '+kq.i1.tinCay);
ok(kq.i2ThieuDuLieu, 'trân châu (chỉ có phiếu CHƯA duyệt) → thiếu dữ liệu');
gan(kq.doPhu*100, 90, 'độ phủ 270/300');
gan(kq.choDuyet, 1, 'đếm phiếu chờ duyệt');
ok(/Chưa đủ dữ liệu/.test(kq.bang), 'màn hình nói rõ nguyên liệu thiếu dữ liệu');
ok(/Độ phủ định mức/.test(kq.bang), 'màn hình hiện độ phủ');
ok(/Trà sữa mới/.test(kq.bang), 'chỉ đích danh món chưa khai định mức');

console.log('3. Tạo đề xuất — KHÔNG sửa công thức gốc');
ok(kq.soCho===3, 'tìm ra 3 chỗ dùng bột sữa (2 size + 1 mẻ) — được '+kq.soCho);
ok(/× 1,1|×1,1|1,100/.test(kq.sheetText.replace(/\./g,',')), 'popup nêu hệ số');
ok(kq.deXuat.length===3, 'ghi 3 đề xuất');
const dxM = kq.deXuat.find(d=>d.size==='M');
gan(dxM.goc, 50, 'giá trị gốc size M');
gan(dxM.deXuat, 55, 'đề xuất size M = 50 × 1,10');
const dxPrep = kq.deXuat.find(d=>d.scope==='prep');
gan(dxPrep.goc, 300, 'mẻ chế biến: gốc 300');
gan(dxPrep.deXuat, 330, 'mẻ chế biến: đề xuất 330');
ok(kq.deXuat.every(d=>d.tinCay==='du'), 'ghi kèm độ tin cậy');
ok(kq.recipeGocConNguyen===50, 'CÔNG THỨC GỐC VẪN LÀ 50g sau khi tạo đề xuất');

console.log('4. Áp dụng đề xuất');
ok(kq.recipeSauKhiApDung && kq.recipeSauKhiApDung.M[0].qty===55, 'ghi 55g vào định mức khi bấm Áp dụng');
ok(kq.recipeSauKhiApDung && kq.recipeSauKhiApDung.L[0].qty===70, 'size L không bị đụng');
ok(kq.capNhat.length===1 && kq.capNhat[0].patch.trangThai==='da_ap_dung', 'đánh dấu đã áp dụng');
gan(kq.capNhat[0] && kq.capNhat[0].patch.giaTriTruocKhiApDung, 50, 'LƯU LẠI giá trị cũ để quay về được');
ok(kq.chanSaiNguyenLieu, 'chặn khi dòng công thức đã đổi sang nguyên liệu khác');

console.log('5. Hướng dẫn cho Claude trong JSON');
ok(kq.soNhiemVu===22, 'đủ 22 nhiệm vụ chủ quán liệt kê — được '+kq.soNhiemVu);
ok(kq.coBatBuoc>=7, 'có phần nguyên tắc bắt buộc');
ok(kq.nhacDoPhu, 'bắt Claude đọc độ phủ trước khi kết luận');
ok(kq.nhacChuaDu, 'bắt nói rõ khi chưa đủ tin cậy');
ok(kq.bonTang===4, 'nêu 4 tầng dữ liệu: gốc → tính → phân tích → đề xuất');

console.log('6. Lịch sử theo ngày');
ok(kq.ls[0].thu==='Thứ 7', '05/09/2026 là Thứ 7 — được '+kq.ls[0].thu);
ok(kq.ls[0].ngayDacBiet && kq.ls[0].ngayDacBiet.loai==='khuyenmai', 'gắn đúng ngày khuyến mãi');
ok(kq.ls[1].ngayDacBiet === null, 'ngày CHƯA KHAI để null, không mặc định là ngày thường');
gan(kq.ls[0].soLy, 20, 'số ly');
ok(kq.ls[0].meDaNau.length===1 && kq.ls[0].meDaNau[0].soMe===2, 'mẻ đã nấu trong ngày');
ok(kq.ls[0].banThanhPhamHuy.length===1 && kq.ls[0].banThanhPhamHuy[0].qty===150, 'lượng huỷ trong ngày');

console.log('7. Tem kho trong JSON');
ok(kq.tem[0].code==='A1B2C3D4', 'giữ mã tem');
ok(kq.tem[0].quaHanKhiConMo === true, 'nhận ra tem đang mở mà đã quá hạn');
gan(kq.tem[0].thuaKhiBaoHet, 300, 'phần thừa lúc báo hết');
ok(kq.tem[0].canXemLai === true, 'giữ cờ cần xem lại');

console.log('8. Màn Ngày đặc biệt');
ok(/Quốc khánh/.test(kq.sdText), 'hiện ngày đã khai');
ok(/không tự biết lịch Âm/i.test(kq.sdText), 'nói rõ vì sao phải khai tay');

const loiThat = loi.filter(l => !/net::|Failed to load|firebase|Firebase|401|403|permission/i.test(l));
ok(loiThat.length===0, 'không có lỗi JS: ' + loiThat.join(' | '));
console.log(`\n${pass} đúng · ${fail} sai`);
await b.close();
process.exit(fail?1:0);
