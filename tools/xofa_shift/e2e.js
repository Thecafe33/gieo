// E2E mở Ca làm việc TC33/XOFA, đầy đủ module và phục hồi sau lỗi tải.
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
 try{for(const app of ['PosX.html','pos.html'])for(const width of [1366,390])for(const missing of [false,true,'persistent']){
 const p=await b.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];let failModule=missing,moduleReads=0;
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/cham_cong.v4.js')){moduleReads++;if(failModule)return r.fulfill({status:404,body:'missing module'});}if(u.startsWith(base+'/'))return r.continue();return r.abort();});
 await p.goto(base+'/'+app);await p.waitForTimeout(100);
 const xofa=app==='PosX.html';
 const button=xofa?'.sdi[onclick*="openXofaShift"]':width>=768?'#btn-nav-calamviec':'[onclick="toggleMobileMenu(); openTc33Shift()"]';
 if(missing){
  // Tái hiện gói chỉ có HTML / module chưa tải được: không lỗi JS, bấm lại có thể hồi phục.
  console.log('missing module initial',width,errors);
  if(missing===true)failModule=false;
 }
 await p.locator(button).evaluate(el=>{el.click();el.click()});
 if(missing==='persistent'){
  await p.waitForFunction(xofa=>xofa?_xofaShiftOpening===null:_tc33ShiftOpening===null,xofa);
  assert((await p.locator(xofa?'#toastEl':'#app-modal-msg').textContent()).includes('Chưa tải được Ca làm việc'));
  if(!xofa)await p.evaluate(()=>closeAppModal());
  assert.equal(await p.locator('#ccx-root').count(),0);assert.equal(errors.length,0);
  failModule=false;await p.locator(button).evaluate(el=>el.click());
 }
 await p.waitForSelector('#ccx-root',{state:'visible'});await p.waitForTimeout(100);
 assert.equal(errors.length,0,errors.join('|'));assert.equal(await p.locator('#ccx-root').count(),1);
 assert.equal(await p.locator('#ccx-root').getAttribute('data-pop'),String(width>=768));
 assert.equal(moduleReads,missing==='persistent'?3:missing?2:1,'bấm hai lần chỉ tải lại module một lần');
 assert(await p.locator('#ccx-pin').isVisible());if(xofa)assert(await p.locator('#ccx-exp').textContent().then(t=>t.includes('Chi phí')));else assert(await p.locator('#ccx-exp').isHidden());
 await p.locator('#ccx-back').click();assert(await p.locator('#ccx-root').isHidden());
 await p.locator(button).evaluate(el=>el.click());await p.waitForSelector('#ccx-root',{state:'visible'});
 assert.equal(moduleReads,missing==='persistent'?3:missing?2:1,'mở lại không tải module thêm');
 if(OUT&&!missing)await p.screenshot({path:path.join(OUT,'shift-'+app+'-'+width+'.png')});
 console.log('ok',app,width,missing==='persistent'?'lỗi tải kéo dài có báo, lần bấm sau hồi phục':missing?'module lỗi lần đầu, bấm tải lại mở được':'module đủ mở được','PIN/Chi phí/đóng/mở lại, không trùng tải');await p.close();
 }
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
