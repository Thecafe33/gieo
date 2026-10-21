// Kiểm thao tác bán hàng/quà từ phản hồi 21/10; Firebase bộ nhớ, không truy cập dữ liệu thật.
// E2E bấm món → chọn size → giỏ → thanh toán, độc lập danh sách ly tặng. Firebase giả.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname,'../..'), OUT = '';
const REVIEW=process.env.REVIEW_FILE || path.join(ROOT,'PosX.html');   // OUT: thư mục lưu ảnh chụp (tuỳ chọn)
const S = OUT;
let mock = fs.readFileSync(path.join(ROOT, 'tools/tet/e2e/mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(ROOT, 'tools/tet/e2e/rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:20000,priceL:26000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:22000,priceL:27000},den:{name:'Đen đá',type:'Cà phê',priceM:15000}});" +
  "__RT2.put('menu_togo_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:18000,priceL:22000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:20000,priceL:25000},den:{name:'Đen đá',type:'Cà phê',priceM:14000}});\n";

const assert=require('assert/strict');
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f === path.join(ROOT,'PosX.html') ? REVIEW : f))});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{for(const width of [1366,390]){
 const p=await b.newPage({viewport:{width,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort();});
 p.on('dialog',d=>d.accept());await p.goto(base+'/PosX.html');await p.waitForSelector('#mg .mi');
 const record=(name,pass,detail)=>results.push({width,name,pass,detail});
 const reset=async(opts={})=>p.evaluate(opts=>{
  cart={};isToGo=opts.togo!==false;togoGiftDeclinedQty=null;_giftVoucherKey=null;_giftVoucherPhone=null;_stampFreePhone=null;
  curCustomer=null;loyaltyCustomer=null;_stampPickLoading=false;_dgLock=false;
  togoSettings=_mergeTogoDefaults({gift:{enabled:true,buyQty:2,freeQty:1,sizes:[],itemIds:opts.empty?[]:['cf1']},discount:{enabled:!!opts.discount,minQty:2,pct:10,maxAmt:0}});
  document.getElementById('togoGiftPopup').classList.remove('show');document.getElementById('togoGiftPopup')._stamp=null;
  document.getElementById('po').classList.remove('show');document.getElementById('toastEl').textContent='';
  const notice=document.getElementById('sp-promo-notice');if(notice)notice.style.display='none';
  showScreen('sm');renderMenu();
 },opts);
 const buy=async(id,size)=>{await p.locator('#mg [data-mid="'+id+'"]').click();await p.locator('#so .sb').filter({hasText:'SIZE '+size}).click()};
 // 1. Bấm món nhiều size bằng thao tác DOM, cả hai menu / hai size.
 for(const togo of [false,true]){await reset({togo});await buy('bx','M');await buy('bx','L');const lines=await p.evaluate(()=>Object.values(cart).map(c=>[c.size,c.price]));record('1. chọn M/L '+(togo?'To Go':'Tại quán'),JSON.stringify(lines)===JSON.stringify([['M',togo?20000:22000],['L',togo?25000:27000]]),lines)}
 // 2. Tính riêng trước khi chọn ly tặng, không đi vòng qua nút thanh toán có mở popup.
 await reset();await buy('bx','M');await buy('bx','M');await p.evaluate(()=>showScreen('sc'));await p.locator('#pmsp').click();
 record('2. Tính riêng chặn bill đang đủ quà',await p.locator('#sp-promo-notice').isVisible(),await p.locator('#sp-promo-notice').textContent());
 // Bill không khuyến mãi vẫn tính riêng được.
 await reset();await buy('bx','M');await p.evaluate(()=>showScreen('sc'));await p.locator('#pmsp').click();record('Tính riêng bill thường',await p.locator('#sp').evaluate(el=>el.classList.contains('active')));
 // 3. Danh sách quà rỗng; kiểm cả không và có chương trình giảm giá.
 for(const discount of [false,true]){await reset({empty:true,discount});await buy('bx','M');await buy('bx','M');await p.evaluate(()=>renderTgGiftSummary());
 record('3. cảnh báo cài đặt',await p.locator('#tg-gift-summary').textContent().then(t=>t.includes('CHƯA CHỌN MÓN TẶNG')));
 await p.locator('#sm .bco').click();const text=await p.locator('#toastEl').textContent();record('3. cảnh báo thanh toán, giảm giá='+discount,text.includes('chưa chọn món tặng'),text);
 record('Danh sách rỗng vẫn bán được',await p.locator('#sc').evaluate(el=>el.classList.contains('active')));}
 // Dùng I/O bộ nhớ cho quyền tem; giữ caller/callee của ứng dụng.
 await p.evaluate(()=>{window.__reviewReads=0;const original=fstore.collection.bind(fstore);fstore.collection=n=>n==='customers'?{...original(n),doc:()=>({get:async()=>{window.__reviewReads++;return{exists:true,data:()=>({stamp_count:6,free_drink_available:0,total_points:0})}}})}:original(n)});
 const customer=async()=>p.evaluate(()=>{document.getElementById('cuph').value='0900';curCustomer={phone:'0900',name:'Khách thử',note:'',myGifts:{}};loyaltyCustomer={stamp_count:6,free_drink_available:0,total_points:0};showScreen('sc');renderCustomerInfo(0,6)});
 // 4. Đổi tem ở tại quán: không đọc, không mở popup. To Go: đọc đúng 1 lần và mở popup.
 await reset({togo:false});await customer();let before=await p.evaluate(()=>window.__reviewReads);await p.locator('#voucherList button[onclick*="consumeFreeToGoDrink"]').click();record('4. chặn đổi tem Tại quán',await p.locator('#togoGiftPopup').evaluate(el=>!el.classList.contains('show')) && await p.evaluate(n=>window.__reviewReads===n,before),await p.locator('#toastEl').textContent());
 await reset();await customer();before=await p.evaluate(()=>window.__reviewReads);await p.locator('#voucherList button[onclick*="consumeFreeToGoDrink"]').click();await p.waitForSelector('#togoGiftPopup.show');record('4. To Go mở chọn quà',await p.evaluate(n=>window.__reviewReads===n+1,before));
 await p.locator('#tgi_cf1').click();await p.locator('.togo-gift-confirm').click();
 const state=await p.evaluate(()=>({qty:Object.values(cart).filter(c=>String(c._vKey||'').startsWith('__free_stamp__')).length,button:!!document.querySelector('#voucherList button[onclick*="consumeFreeToGoDrink"]'),text:document.getElementById('voucherList').textContent,valid:validateSharedGifts()}));
 record('5. Đổi xong nút đổi ly cập nhật',state.qty===1&&!state.button,state);
 const readCount=await p.evaluate(()=>window.__reviewReads);
 await p.evaluate(()=>{loyaltyCustomer.stamp_count=12;renderCustomerInfo(0,12)});
 record('Có 12 tem cũng chỉ chọn 1 ly/bill',await p.locator('#voucherList button:disabled').textContent().then(t=>t.includes('Đã chọn')) && await p.locator('#voucherList button[onclick*="consumeFreeToGoDrink"]').count()===0);
 await p.locator('#sc-cart-preview').click();await p.locator('#cartBody .cart-del').click();
 const removed=await p.evaluate(()=>({stamp:_stampFreePhone,key:_giftVoucherKey,reads:window.__reviewReads,button:!!document.querySelector('#voucherList button[onclick*="consumeFreeToGoDrink"]')}));
 record('Gỡ ly trả nút Đổi ly, không đọc Firebase',removed.stamp===null&&removed.key===null&&removed.button&&removed.reads===readCount,removed);
 await p.evaluate(()=>closeCartDrawer());

 // 6. Hai cách dựng badge phải cùng bỏ quà, giữ số ly mua.
 await reset();await p.evaluate(()=>{cart={paid:{itemId:'cf1',name:'Cafe muối',price:18000,size:'M',qty:2},gift:{itemId:'cf1',name:'Cafe muối',price:0,size:'M',qty:1,isFree:true,_togoGift:true},stamp:{itemId:'cf1',name:'Cafe muối',price:0,size:'M',qty:1,_vKey:'__free_stamp__test'}};renderMenu()});
 let badge=await p.locator('#mg [data-mid="cf1"] .qb').textContent();await p.evaluate(()=>refreshMenuBadges());record('6. badge chỉ ly mua',badge==='2'&&await p.locator('#mg [data-mid="cf1"] .qb').textContent()==='2',badge);
 // 7. Không có quà ở popup tem không ghi từ chối mua X.
 await reset({empty:true});const declined=await p.evaluate(()=>{togoGiftDeclinedQty=3;openTogoGiftPopup(1,()=>{},{phone:'0900',curFree:0,curStamp:6});return togoGiftDeclinedQty});record('7. hết món tem không đổi trạng thái từ chối',declined===3,declined);
 // Kiểm chuyển chế độ sau khi chọn ly tem (thao tác bình thường, nhận confirm).
 await reset();await customer();await p.locator('#voucherList button[onclick*="consumeFreeToGoDrink"]').click();await p.waitForSelector('#togoGiftPopup.show');await p.locator('#tgi_cf1').click();await p.locator('.togo-gift-confirm').click();await p.evaluate(()=>showScreen('sm'));await p.locator('#togoToggle').click();const switched=await p.evaluate(()=>({isToGo,stamp:Object.values(cart).some(c=>String(c._vKey||'').startsWith('__free_stamp__')),valid:validateSharedGifts()}));record('Đổi sang Tại quán sau chọn tem phải gỡ/chặn quà',!switched.stamp||!switched.valid,switched);
 record('Không phát sinh lỗi JS',errors.length===0,errors);await p.close();
 }}finally{await b.close();server.close()}
 console.log(JSON.stringify({file:REVIEW,results},null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
