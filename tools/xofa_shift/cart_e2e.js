// E2E bấm món → chọn size → giỏ → thanh toán, độc lập danh sách ly tặng. Firebase giả.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), OUT = process.argv[2] || '';   // OUT: thư mục lưu ảnh chụp (tuỳ chọn)
const S = OUT;
let mock = fs.readFileSync(path.join(ROOT, 'tools/tet/e2e/mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(ROOT, 'tools/tet/e2e/rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:20000,priceL:26000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:22000,priceL:27000},den:{name:'Đen đá',type:'Cà phê',priceM:15000}});" +
  "__RT2.put('menu_togo_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:18000,priceL:22000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:20000,priceL:25000},den:{name:'Đen đá',type:'Cà phê',priceM:14000}});\n";

const assert=require('assert/strict');
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const app of (process.env.SOURCE_ONLY ? ['PosX.html'] : ['PosX.html','ban_deploy/thuong/PosX.html','ban_deploy/giangsinh/PosX.html','ban_deploy/tet/PosX.html']))for(const width of [1366,390]){
 const p=await b.newPage({viewport:{width,height:900}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort();});
 await p.goto(base+'/'+app);await p.waitForSelector('#mg .mi');
 for(const togo of [false,true])for(const configured of [false,true]){
  await p.evaluate(({togo,configured})=>{isToGo=togo;cart={};togoSettings=_mergeTogoDefaults({gift:{enabled:true,buyQty:99,freeQty:1,itemIds:configured?['cf1']:[]}});showScreen('sm');renderMenu();},{togo,configured});
  // Món ngoài danh sách tặng: bấm DOM thật, không gọi addCart thay người dùng.
  for(const size of ['M','L']){
   await p.locator('#mg [data-mid="bx"]').click();await p.locator('#so .sb').filter({hasText:'SIZE '+size}).click();
   const line=await p.evaluate(size=>cart['bx_'+size],size);
   assert(line,`Món bán ngoài danh sách tặng phải vào giỏ: ${app}, ${width}, togo=${togo}, configured=${configured}, size=${size}`);
   assert.equal(line.price,togo?(size==='M'?20000:25000):(size==='M'?22000:27000));assert.equal(line.qty,1);
  }
  // Món có trong danh sách tặng vẫn phải bán đúng giá menu hiện tại.
  await p.locator('#mg [data-mid="cf1"]').click();await p.locator('#so .sb').filter({hasText:'SIZE M'}).click();
  assert.equal(await p.evaluate(()=>cart.cf1_M.price),togo?18000:20000);
  // Một size không mở popup; bấm lại tăng số lượng.
  await p.locator('#mg [data-mid="den"]').click();await p.locator('#mg [data-mid="den"]').click();
  assert.equal(await p.evaluate(()=>cart.den_M.qty),2);
  await p.locator('#mg [data-mid="bx"]').click();await p.locator('#so .sb').filter({hasText:'SIZE M'}).click();
  assert.equal(await p.evaluate(()=>cart.bx_M.qty),2);
  const total=togo?111000:121000;
  assert.equal(await p.evaluate(()=>getCartTotal()),total);
  assert.equal(await p.evaluate(()=>getFinalTotal()),total);
  assert((await p.locator('#ftv').textContent()).includes(total.toLocaleString('vi-VN')));
  await p.evaluate(()=>onCheckoutClick());assert(await p.locator('#sc').evaluate(el=>el.classList.contains('active')));
  assert.equal(await p.evaluate(()=>getFinalTotal()),total);
 }
 assert.deepEqual(errors,[]);console.log('ok cart',app,width,'tại quán/To Go, M/L/một size, chưa/có cấu hình quà, giá/tổng/checkout');await p.close();
 }
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
