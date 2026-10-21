// E2E PosX_tet.html (XOFA): upsize + giảm 5K, thanh toán thật (confirmPay → push đơn → _loyaltyAfterSave)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), OUT = process.argv[2] || '';   // OUT: thư mục lưu ảnh chụp (tuỳ chọn)
const S = OUT;
let mock = fs.readFileSync(path.join(ROOT, 'tools/tet/e2e/mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(ROOT, 'tools/tet/e2e/rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:20000,priceL:26000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:22000,priceL:27000},den:{name:'Đen đá',type:'Cà phê',priceM:15000}});" +
  "__RT2.put('menu_togo_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:18000,priceL:22000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:20000,priceL:25000},den:{name:'Đen đá',type:'Cà phê',priceM:14000}});\n";
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:1280,height:820}});
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith('file:'))return r.continue();return r.abort();});
 await p.goto('file://'+ROOT+'/PosX.html');await p.waitForTimeout(1500);
 const results=await p.evaluate(async()=>{
  const R=[],ok=(v,m)=>{R.push((v?'ok ':'FAIL ')+m);};
  isToGo=true;cart={};togoSettings=_mergeTogoDefaults({gift:{enabled:true,buyQty:2,freeQty:1,itemIds:['cf1']}});
  const paid=()=>({itemId:'bx',name:'Bạc xỉu',size:'M',price:20000,qty:2});
  curCustomer=null;loyaltyCustomer=null;cart={paid:paid()};let proceeds=0;
  checkTogoBeforeCheckout(()=>proceeds++);
  ok(document.querySelectorAll('.togo-gift-item').length===1 && document.getElementById('tgi_cf1'),'Mua X: popup chỉ món được chọn');
  selectTogoGift('bx');confirmTogoGift();ok(proceeds===0&&!cart.bx_M_free,'chặn gọi trực tiếp món ngoài danh sách');
  selectTogoGift('cf1');confirmTogoGift();ok(proceeds===1&&cart.cf1_M_free.qty===1,'chọn đúng thêm ly miễn phí và tiếp tục');
  cartAdj('paid',-1);ok(!cart.cf1_M_free,'bớt món mua tự gỡ quà');
  cart={paid:{...paid(),qty:4}};checkTogoBeforeCheckout(()=>proceeds++);selectTogoGift('cf1');selectTogoGift('cf1');confirmTogoGift();ok(cart.cf1_M_free.qty===2,'mua hai bộ tặng hai ly');
  // Khách và Firebase giả: chỉ thay IO, giữ nguyên các hàm ứng dụng.
  let reads=0,writes=0;const data={free_drink_available:0,stamp_count:6};
  const real=fstore.collection.bind(fstore);fstore.collection=n=>n==='customers'?{doc:()=>({get:async()=>{reads++;return{exists:true,data:()=>({...data})};}})}:real(n);
  cart={};_giftVoucherKey=null;_stampFreePhone=null;document.getElementById('cuph').value='0900';curCustomer={phone:'0900'};loyaltyCustomer=data;
  await consumeFreeToGoDrink('0900');ok(document.querySelectorAll('.togo-gift-item').length===1&&document.getElementById('tgi_cf1'),'6 tem dùng cùng danh sách, không cần món sẵn');
  selectTogoGift('cf1');confirmTogoGift();let key=Object.keys(cart)[0];ok(cart[key].price===0&&_captureStampFreeIntent()==='0900'&&validateSharedGifts(),'ly tem mới hợp lệ, ghi ý định');
  cartAdj(key,1);ok(cart[key].qty===1,'không tăng số ly tem');
  cartDel(key);ok(!_stampFreePhone&&!_giftVoucherKey,'xóa quà không tiêu tem');
  cart={paid:paid()};proceeds=0;const readsBeforeCheckout=reads;checkTogoBeforeCheckout(()=>proceeds++);
  ok(!document.getElementById('togoGiftPopup')._stamp&&proceeds===0&&reads===readsBeforeCheckout,'checkout chỉ mời mua X, không tự mở/đọc quyền đổi tem');
  skipTogoGift();ok(proceeds===1,'bỏ quà mua X vẫn bán');
  await consumeFreeToGoDrink('0900');selectTogoGift('cf1');togoSettings.gift.itemIds=[];confirmTogoGift();ok(!Object.values(cart).some(c=>c._vKey),'cấu hình đổi giữa popup không tặng món đã gỡ');skipTogoGift();
  togoSettings.gift.itemIds=['cf1'];await consumeFreeToGoDrink('0900');selectTogoGift('cf1');confirmTogoGift();
  togoSettings.gift.itemIds=[];ok(!_payBegin(),'kiểm lại danh sách ngay trước ghi bill');
  removeGiftVoucher();ok(validateSharedGifts(),'gỡ quà lỗi xong bán bình thường');
  togoSettings.gift.itemIds=['cf1'];await consumeFreeToGoDrink('0900');selectTogoGift('cf1');document.getElementById('cuph').value='0901';confirmTogoGift();ok(!Object.values(cart).some(c=>c._vKey),'đổi khách trong popup không gắn nhầm quà');skipTogoGift();
  renderTgCategoryList();ok(document.querySelectorAll('#tg-category-list input').length===3,'cài đặt cho chọn từng món');
  ok(reads===4,'chỉ đọc khách khi đổi quà, không đọc theo chọn món');
  // Ghi đơn thật vào backend bộ nhớ, gồm cả quà mua X và quà tem.
  const orders=()=>{const out=[];function walk(o){for(const v of Object.values(o||{})){if(v&&v.itemsArray)out.push(v);else if(v&&typeof v==='object')walk(v);}}walk(__RT2.tree().orders_xolifa);return out;};
  document.getElementById('cuph').value='';curCustomer=null;loyaltyCustomer=null;_giftVoucherKey=null;_stampFreePhone=null;
  cart={paid:paid()};togoGiftDeclinedQty=null;openTogoGiftPopup(1,()=>{});selectTogoGift('cf1');confirmTogoGift();
  const before=orders().length;curPay='cash';confirmPay(40000,0);await new Promise(r=>setTimeout(r,400));
  let saved=orders().at(-1);ok(orders().length===before+1&&saved.total===40000&&saved.itemsArray.some(c=>c._togoGift&&c.price===0),'thanh toán tiền mặt giữ đúng giá và ly tặng');
  document.getElementById('cuph').value='0900';data.stamp_count=6;data.free_drink_available=0;if(!isToGo)toggleTogo();
  // Transaction giả cập nhật đúng dữ liệu đang đọc; không gọi mạng thật.
  fstore.runTransaction=async fn=>fn({get:async()=>({exists:true,data:()=>({...data})}),update:(ref,patch)=>{Object.assign(data,patch);writes++;}});
  await consumeFreeToGoDrink('0900');selectTogoGift('cf1');confirmTogoGift();
  const beforeStamp=orders().length;curPay='bank';confirmPay(null,null);await new Promise(r=>setTimeout(r,400));
  saved=orders().at(-1);ok(orders().length===beforeStamp+1&&saved.total===0&&saved.voucherUsed==='Ly miễn phí (6 Stamp)','ghi bill đổi tem, tên rõ và giá 0');
  ok(data.stamp_count===0&&writes===1,'chỉ trừ 6 tem sau khi ghi bill thành công');
  // Giữ popup để kiểm tra bố cục PC/mobile.
  curCustomer=null;loyaltyCustomer=null;cart={paid:paid()};togoGiftDeclinedQty=null;openTogoGiftPopup(1,()=>{});
  return R;
 });
 console.log(results.join('\n'));
 if(OUT){await p.screenshot({path:path.join(OUT,'desktop.png')});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(OUT,'mobile.png')});}
 await b.close();if(results.some(x=>x.startsWith('FAIL')))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
