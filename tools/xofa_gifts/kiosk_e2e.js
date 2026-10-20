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
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 async function page(file){const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith('file:'))return r.continue();return r.abort();});await p.goto('file://'+ROOT+'/'+file);await p.waitForTimeout(1200);return p;}
 const pos=await page('PosX.html'), kiosk=await page('kiosk.html');
 const results=[];const ok=(v,m)=>results.push((v?'ok ':'FAIL ')+m);
 async function bridge(){await pos.waitForTimeout(180);const payload=await pos.evaluate(()=>__RT2.get('session_display_xolifa'));await kiosk.evaluate(d=>db.ref('session_display_xolifa').set(d),payload);await kiosk.waitForTimeout(30);return payload;}
 await pos.evaluate(()=>{isToGo=true;cart={paid:{itemId:'bx',name:'Bạc xỉu',size:'M',qty:2,price:20000}};togoSettings=_mergeTogoDefaults({gift:{enabled:true,buyQty:2,freeQty:1,itemIds:['cf1','den']}});checkTogoBeforeCheckout(()=>{});});
 let payload=await bridge();ok(payload.state==='gift_selection'&&payload.giftSelection.items.length===2,'POS mở popup dùng session hiện có');
 ok(await kiosk.locator('#gift-mirror').isVisible(),'listener kiosk mở popup');
 ok(await kiosk.locator('.gift-mirror-item').count()===2,'kiosk chỉ hiện đúng danh sách');
 await pos.evaluate(()=>selectTogoGift('den'));await bridge();
 ok((await kiosk.locator('.gift-mirror-item.selected').textContent()).includes('Đen đá'),'kiosk đánh dấu ly đang chọn');
 await pos.evaluate(()=>confirmTogoGift());payload=await bridge();
 ok(await kiosk.locator('#gift-mirror').isHidden()&&payload.cart.some(c=>c.isFree),'xác nhận đóng popup và thêm quà vào giỏ');
 ok((await kiosk.locator('#orders-list').textContent()).includes('Mua X tặng Y · Miễn phí'),'kiosk ghi rõ loại quà');
 await pos.evaluate(()=>{cart={paid:{itemId:'bx',name:'Bạc xỉu',size:'M',price:20000,qty:1}};showScreen('sc');document.getElementById('cuph').value='0900';curCustomer={phone:'0900',name:'Khách thử',myGifts:{}};loyaltyCustomer={stamp_count:6};renderCustomerInfo(0,6);
 const real=fstore.collection.bind(fstore);fstore.collection=n=>n==='customers'?{...real(n),doc:()=>({get:async()=>({exists:true,data:()=>({stamp_count:6})})})}:real(n);});
 ok((await pos.locator('#voucherList').textContent()).includes('Đổi ly'),'nhập SĐT hiện nút Đổi ly');
 await pos.locator('#voucherList button').first().evaluate(el=>el.click());await bridge();
 ok((await kiosk.locator('#gift-mirror-program').textContent())==='Đổi 6 tem','nhân viên bấm Đổi ly mới mở popup tem ở kiosk');
 await pos.evaluate(()=>selectTogoGift('cf1'));await bridge();
 ok((await kiosk.locator('#gift-mirror-sub').textContent()).includes('1/1'),'đồng bộ tiến độ đã chọn');
 await pos.evaluate(()=>confirmTogoGift());payload=await bridge();
 ok(await kiosk.locator('#gift-mirror').isHidden(),'đổi tem xác nhận đóng popup');
 ok(payload.cart.length===2&&payload.cart.some(c=>c.giftLabel==='Đổi 6 tem'&&c.price===0),'ly đổi tem không biến mất trên màn hình khách');
 ok((await pos.locator('#sc-cart-lines').textContent()).includes('Cafe muối'),'mini giỏ thanh toán cập nhật quà mới');
 await pos.evaluate(()=>{removeGiftVoucher();openTogoGiftPopup(1,()=>{}, {phone:'0900',curFree:0,curStamp:6});});await bridge();
 await pos.evaluate(()=>skipTogoGift());await bridge();ok(await kiosk.locator('#gift-mirror').isHidden(),'hủy quà đóng cả hai màn');
 // >6 món: phân trang tại kiosk, không thêm truy vấn.
 await pos.evaluate(()=>{MENU_TOGO=Array.from({length:9},(_,i)=>({id:'gift'+i,name:'Ly tặng '+(i+1),sizes:[{label:'M',price:15000}]}));togoSettings.gift.itemIds=MENU_TOGO.map(m=>m.id);openTogoGiftPopup(1,()=>{}, {phone:'0900',curFree:0,curStamp:6});selectTogoGift('gift8');});await bridge();
 ok((await kiosk.locator('#gift-mirror-page').textContent())==='Trang 2/2'&&(await kiosk.locator('.gift-mirror-item.selected').textContent()).includes('Ly tặng 9'),'danh sách dài chuyển đúng trang ly vừa chọn');
 if(OUT)await kiosk.screenshot({path:path.join(OUT,'kiosk-gift.png')});
 for(const state of ['bank_qr','done','idle']){await kiosk.evaluate(state=>db.ref('session_display_xolifa').set({state,giftSelection:{need:1,items:[{id:'a',name:'stale'}]}}),state);await kiosk.waitForTimeout(30);ok(await kiosk.locator('#gift-mirror').isHidden(),'không giữ popup cũ khi '+state);}
 await kiosk.evaluate(()=>db.ref('session_display_xolifa').set(null));await kiosk.waitForTimeout(30);ok(await kiosk.locator('#gift-mirror').isHidden(),'xóa session dọn popup');
 ok(errors.length===0,'không lỗi JavaScript '+JSON.stringify(errors));console.log(results.join('\n'));await browser.close();if(results.some(x=>x.startsWith('FAIL')))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
