// Kiểm thử NÚT SỬA TÀI SẢN — mở file HTML thật trong Chromium, thay các hàm đọc/ghi
// Firestore bằng bản giả, rồi bấm đúng luồng chủ quán sẽ bấm.
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
  const out = {ghi:[], xoa:[]};
  const TS = {id:'a1', name:'Máy dập nắp', purchaseDate:'2025-11-20', purchaseCost:12000000,
              usefulLifeMonths:60, residualValue:1000000, active:true};
  window.ensureAuth = async () => ({uid:'u'});
  window.loadAssetsAll = async () => [ {...TS} ];
  window.updateAsset = async (id, data) => { out.ghi.push({id, data}); };
  window.deleteAsset = async (id) => { out.xoa.push(id); };
  window.logAudit = () => {};
  window.toast = (t) => { out.toast = t; };
  window.showError = (t) => { out.showError = t; };
  if(!document.getElementById('entryBody')){ const d=document.createElement('div'); d.id='entryBody'; document.body.appendChild(d); }

  // 1) Danh sách thật phải có nút Sửa, và form Thêm phải có dòng xem trước
  await window.renderEntryAsset();
  const dsHtml = document.getElementById('astList').innerHTML;
  out.coNutSua = dsHtml.includes("openAssetEdit('a1')");
  out.coNutXoaHoiLai = dsHtml.includes("removeAsset('a1')");
  out.xemTruocFormThem = (document.getElementById('astPreview')||{}).textContent || '';
  window.renderEntryAsset = async () => { out.veLai = (out.veLai||0)+1; };

  // 2) Mở popup sửa
  await window.openAssetEdit('a1');
  const sheet = document.getElementById('editSheetWrap');
  out.moDuocPopup = !!sheet;
  out.tieuDe = sheet ? sheet.querySelector('.edit-sheet-title').textContent : '';
  out.dienSan = {
    name: document.getElementById('astEName').value,
    date: document.getElementById('astEDate').value,
    cost: document.getElementById('astECost').value,
    life: document.getElementById('astELife').value,
    residual: document.getElementById('astEResidual').value
  };
  out.xemTruoc = (document.getElementById('astEPreview')||{}).textContent || '';
  out.canhBaoQuaKhu = /mọi ngày trong quá khứ/i.test(sheet ? sheet.textContent : '');

  // 3) Sửa lại ngày mua + thời gian sử dụng, xem dòng xem trước có đổi không
  document.getElementById('astEDate').value = '2025-06-01';
  document.getElementById('astECost').value = '20000000';
  document.getElementById('astELife').value = '80';
  document.getElementById('astECost').dispatchEvent(new Event('input'));
  out.xemTruocSau = (document.getElementById('astEPreview')||{}).textContent || '';

  // 4) Lưu
  await window.submitAssetEdit('a1');
  out.dongPopup = !document.getElementById('editSheetWrap') || !document.getElementById('editSheetWrap').classList.contains('open');

  // 5) Ô trống / số vô lý phải bị chặn, KHÔNG được ghi
  await window.openAssetEdit('a1');
  document.getElementById('astELife').value = '0';
  await window.submitAssetEdit('a1');
  out.chanLife = out.toast;
  document.getElementById('astELife').value = '60';
  document.getElementById('astECost').value = '0';
  await window.submitAssetEdit('a1');
  out.chanCost = out.toast;
  document.getElementById('astECost').value = '5000000';
  document.getElementById('astEResidual').value = '9000000';
  await window.submitAssetEdit('a1');
  out.chanResidual = out.toast;
  document.getElementById('astEResidual').value = '0';
  document.getElementById('astEDate').value = '';
  await window.submitAssetEdit('a1');
  out.chanDate = out.toast;

  // 6) Xoá phải hỏi lại — trả lời KHÔNG thì không được xoá
  window.confirm = () => false;
  await window.removeAsset('a1');
  out.xoaKhiTuChoi = out.xoa.length;
  window.confirm = (t) => { out.hoiXoa = t; return true; };
  await window.removeAsset('a1');
  out.xoaKhiDongY = out.xoa.length;

  // 7) Cache thu hồi vốn / hoà vốn phải bị xoá khi tài sản đổi
  // _thvCache/_bepCache khai bằng let nên KHÔNG nằm trên window — đọc/ghi thẳng tên biến.
  _thvCache = {key:'x'}; _bepCache = {key:'x'};
  window.assetCacheDirty();
  out.xoaCache = (_thvCache === null && _bepCache === null);
  return out;
});

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };

console.log('\n1. Danh sách tài sản');
ok(kq.coNutSua, 'mỗi tài sản có nút Sửa');
ok(kq.coNutXoaHoiLai, 'nút Xoá đi qua removeAsset (có hỏi lại)');
ok(/Khấu hao/.test(kq.xemTruocFormThem||''), 'form Thêm cũng có dòng xem trước khấu hao');

console.log('2. Mở popup sửa');
ok(kq.moDuocPopup, 'popup mở được');
ok(/Sửa tài sản — Máy dập nắp/.test(kq.tieuDe), 'tiêu đề đúng tên tài sản — được "'+kq.tieuDe+'"');
ok(kq.canhBaoQuaKhu, 'có cảnh báo sửa sẽ tính lại quá khứ');

console.log('3. Điền sẵn ĐÚNG số đang có (không phải bắt gõ lại từ đầu)');
ok(kq.dienSan.name==='Máy dập nắp', 'tên');
ok(kq.dienSan.date==='2025-11-20', 'ngày mua — được '+kq.dienSan.date);
ok(kq.dienSan.cost==='12000000', 'giá mua');
ok(kq.dienSan.life==='60', 'thời gian sử dụng');
ok(kq.dienSan.residual==='1000000', 'giá trị thu hồi');

console.log('4. Dòng xem trước khấu hao');
ok(/183\.333/.test(kq.xemTruoc), '(12tr − 1tr)/60 = 183.333/tháng — được "'+kq.xemTruoc+'"');
ok(/237\.500/.test(kq.xemTruocSau), 'gõ lại thì đổi ngay: (20tr − 1tr)/80 = 237.500/tháng — được "'+kq.xemTruocSau+'"');

console.log('5. Lưu');
ok(kq.ghi.length===1, 'ghi đúng 1 lần');
ok(kq.ghi[0] && kq.ghi[0].id==='a1', 'đúng id');
ok(kq.ghi[0] && kq.ghi[0].data.purchaseDate==='2025-06-01', 'lưu ngày mua mới');
ok(kq.ghi[0] && kq.ghi[0].data.purchaseCost===20000000, 'lưu giá mua mới');
ok(kq.ghi[0] && kq.ghi[0].data.usefulLifeMonths===80, 'lưu thời gian sử dụng mới');
ok(kq.ghi[0] && kq.ghi[0].data.name==='Máy dập nắp', 'giữ nguyên tên');
ok(kq.dongPopup, 'popup đóng sau khi lưu');
ok(kq.veLai>=1, 'vẽ lại danh sách sau khi lưu');

console.log('6. Chặn số vô lý — không ghi thêm lần nào');
ok(kq.ghi.length===1, 'vẫn chỉ 1 lần ghi sau 4 lần bấm Lưu với số sai');
ok(/1 tháng/.test(kq.chanLife||''), 'chặn thời gian sử dụng 0 — "'+kq.chanLife+'"');
ok(/lớn hơn 0/.test(kq.chanCost||''), 'chặn giá mua 0');
ok(/thu hồi/.test(kq.chanResidual||''), 'chặn giá trị thu hồi > giá mua');
ok(/ngày mua/.test(kq.chanDate||''), 'chặn thiếu ngày mua');

console.log('7. Xoá phải hỏi lại');
ok(kq.xoaKhiTuChoi===0, 'trả lời Không thì KHÔNG xoá');
ok(kq.xoaKhiDongY===1, 'trả lời Có thì mới xoá');
ok(/quá khứ/.test(kq.hoiXoa||''), 'câu hỏi nói rõ hậu quả — "'+(kq.hoiXoa||'').slice(0,60)+'…"');
ok(/Tạm dừng/.test(kq.hoiXoa||''), 'gợi ý dùng Tạm dừng thay vì xoá');

console.log('8. Cache');
ok(kq.xoaCache, 'đổi tài sản thì xoá cả cache thu hồi vốn lẫn hoà vốn');

const loiThat = loi.filter(l => !/net::|Failed to load|firebase|Firebase|401|403|permission/i.test(l));
ok(loiThat.length===0, 'không có lỗi JS: ' + loiThat.join(' | '));
console.log(`\n${pass} đúng · ${fail} sai`);
await b.close();
process.exit(fail?1:0);
