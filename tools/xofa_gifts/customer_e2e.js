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
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1366,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort();});
 await page.goto(base+'/PosX.html');await page.waitForSelector('#mg .mi');
 const results=await page.evaluate(async()=>{
 const results=[],check=(v,name)=>results.push({pass:!!v,name});
 const A='0900000001',B='0900000002',original=fstore.collection.bind(fstore);let reads=0;
 fstore.collection=n=>n==='customers'?{...original(n),doc:phone=>({get:async()=>{reads++;return{exists:true,data:()=>({name:phone,stamp_count:6,free_drink_available:0,myGifts:{}})}}})}:original(n);
 allCustomersCache=[{id:A},{id:B}];
 const reset=()=>{cart={bx_M:{itemId:'bx',name:'Bạc xỉu',size:'M',price:20000,qty:2}};isToGo=true;togoGiftDeclinedQty=null;
 _giftVoucherKey=null;_giftVoucherPhone=null;_stampFreePhone=null;_pendingVoucherFn=null;_pendingVoucherArgs=null;
 curCustomer={phone:A,name:'A',note:'',myGifts:{}};loyaltyCustomer={stamp_count:6};document.getElementById('cuph').value=A;
 togoSettings=_mergeTogoDefaults({gift:{enabled:true,buyQty:2,freeQty:1,itemIds:['cf1']}});
 document.getElementById('togoGiftPopup').classList.remove('show');const picker=document.getElementById('xl-pick-modal');if(picker)picker.style.display='none';showScreen('sc');renderCustomerInfo(0,6);};
 const pickStamp=async()=>{await consumeFreeToGoDrink(A);selectTogoGift('cf1');confirmTogoGift()};
 const pause=()=>new Promise(r=>setTimeout(r,0));
 for(const action of ['clear','type','select','same']){
 reset();await pickStamp();const before=reads;
 if(action==='clear')clearCustomer();else if(action==='type')onPhoneInput(B);else selectPhone(action==='same'?A:B);
 await pause();
 const stamp=Object.values(cart).some(c=>String(c._vKey||'').startsWith('__free_stamp__'));
 check(action==='same'?stamp:!stamp,'tem '+action+': gỡ đúng khách, giữ khi cùng SĐT');
 check(action==='same'?_captureStampFreeIntent()===A:_captureStampFreeIntent()===null,'tem '+action+': đúng ý định trừ tem');
 if(action==='clear')check(reads===before,'xóa khách không đọc Firebase');
 }
 // Voucher có giá gốc phải trả nguyên giá/size và gộp về dòng ban đầu.
 for(const type of ['item_free','item_upsize','fixed','percent']){
 reset();const overrides=type==='item_upsize'?{size:'L',name:'Bạc xỉu ↑L'}:type==='item_free'?{price:0}:{};
 _discountCache.review={type,value:type==='percent'?10:5000};applyVoucher('voucherA','Voucher A','review','');await pause();
 if(type==='item_free'||type==='item_upsize')document.querySelector('#xl-pick-list button').click();
 check(Object.values(cart).some(c=>c._vKey==='voucherA'),'đã áp voucher thật '+type);
 const before=reads;clearCustomer();
 check(Object.keys(cart).length===1 && cart.bx_M && cart.bx_M.price===20000 && cart.bx_M.size==='M' && cart.bx_M.qty===2 && getCartTotal()===40000,'xoá khách hoàn tác voucher '+type);
 check(_giftVoucherKey===null&&_giftVoucherPhone===null,'xoá khách bỏ trạng thái voucher '+type);
 check(reads===before,'hoàn tác voucher không đọc thêm '+type);
 }
 reset();_giftVoucherKey='__dc__manual';_giftVoucherPhone=null;_appliedDiscountId='manual';cart.bx_M._vKey='__dc__manual';clearCustomer();check(_giftVoucherKey==='__dc__manual'&&cart.bx_M._vKey==='__dc__manual','giữ mã nhập tay không gắn khách');_appliedDiscountId=null;
 reset();openTogoGiftPopup(1,()=>{});selectTogoGift('cf1');confirmTogoGift();clearCustomer();check(cart.cf1_M_free&&cart.cf1_M_free.qty===1,'giữ quà mua X không cần khách');
 // Voucher đang chờ chọn món không được có thể áp lại sau khi xoá khách.
 reset();_discountCache.review={type:'item_free'};applyVoucher('voucherA','Voucher A','review','');await pause();clearCustomer();
 check(!document.getElementById('xl-pick-modal')||document.getElementById('xl-pick-modal').style.display==='none','xoá khách đóng hộp chọn voucher đang chờ');
 const btn=document.querySelector('#xl-pick-list button');if(btn)btn.click();check(!Object.values(cart).some(c=>c._vKey==='voucherA'),'không còn dòng voucher mồ côi từ picker cũ');
 // Hàm retry đã được xếp lịch không được áp lại cho khách mới.
 reset();_discountCache.review={type:'item',value:5000,targetItemXl:'Món chưa có'};
 applyVoucher('voucherA','Voucher A','review','');await pause();const retry=_pendingVoucherFn;
 clearCustomer();curCustomer={phone:B,name:'B',note:'',myGifts:{}};document.getElementById('cuph').value=B;
 cart.extra={itemId:'extra',name:'Món chưa có',size:'M',price:25000,qty:1};if(retry)retry();await pause();
 check(!_giftVoucherKey&&!_pendingVoucherArgs&&!Object.values(cart).some(c=>c._vKey),'retry cũ không áp voucher sang khách mới');
 // Kết quả tra voucher tới muộn sau khi xoá khách không được tái tạo dòng giảm tiền.
 reset();const collection=fstore.collection.bind(fstore);let releaseReward;
 fstore.collection=n=>n==='rewards'?{doc:()=>({get:()=>new Promise(r=>{releaseReward=r})})}:collection(n);
 _discountCache={};applyVoucher('voucherA','Voucher A','deferred','');clearCustomer();
 releaseReward({exists:true,data:()=>({type:'fixed',value:5000})});await pause();await pause();
 check(!_giftVoucherKey&&!Object.values(cart).some(c=>c._vKey),'kết quả voucher muộn không áp cho khách đã xoá');fstore.collection=collection;
 // Quyền đổi tem tới muộn cũng không được mở popup sau khi khách bị xoá.
 reset();let releaseCustomer;fstore.collection=n=>n==='customers'?{doc:()=>({get:()=>new Promise(r=>{releaseCustomer=r})})}:collection(n);
 const pendingStamp=consumeFreeToGoDrink(A);clearCustomer();releaseCustomer({exists:true,data:()=>({stamp_count:6})});await pendingStamp;
 check(!document.getElementById('togoGiftPopup').classList.contains('show')&&!_stampFreePhone,'quyền tem trả về muộn không mở popup cho khách đã xoá');fstore.collection=collection;
 return results;
 });
 console.log(JSON.stringify({width,results,errors},null,2));if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
