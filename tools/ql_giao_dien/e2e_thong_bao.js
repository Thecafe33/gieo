// Hôm nay: 6 lượt xem nhanh, mở rộng đủ dữ liệu, hộp thông báo gọn.
// Chromium + Firebase giả, chặn mọi kết nối ngoài loopback. Không dùng dữ liệu thật.
// Chạy: node tools/ql_giao_dien/e2e_thong_bao.js
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');
// Dùng cùng Firebase giả và stub tương thích với bài kiểm khung hiện hành.
const harness=fs.readFileSync(__dirname+'/e2e_khung.js','utf8');
const setup=harness.slice(harness.indexOf('let mock='),harness.indexOf('// Chromium trong'));
const mock=new Function('fs','E2E',setup+'\nreturn mock;')(fs,ROOT+'/tools/tet/e2e')+`
window.__noticeReads=0;
(function(){const F=firebase.firestore;const nf=function(){const f=F(),old=f.collection;function wrap(q){for(const key of ['where','orderBy','limit','doc'])if(q[key]){const fn=q[key];q[key]=(...a)=>wrap(fn.apply(q,a))}if(q.get){const get=q.get;q.get=(...a)=>{__noticeReads++;return get.apply(q,a)}}return q}f.collection=(...a)=>wrap(old(...a));return f};Object.assign(nf,F);firebase.firestore=nf;
const D=firebase.database;firebase.database=function(){const d=D(),old=d.ref;d.ref=(...a)=>{const r=old(...a);for(const key of ['once','on'])if(r[key]){const fn=r[key];r[key]=(...a)=>{__noticeReads++;return fn.apply(r,a)}}return r};return d};firebase.database.ServerValue={TIMESTAMP:0};})();`;
const server=require('http').createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});let count=0;
 const check=(v,label)=>{assert.ok(v,label);console.log('ok '+label);count++};
 try{for(const width of [1366,853,390,320]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
  await page.goto(base+'/quanlygieo.html');await page.waitForTimeout(2800);
  await page.evaluate(()=>{
   _khoFeedMo=true;_prepFeedMo=true;
   const kho=Array.from({length:11},(_,i)=>({loai:'mo',at:new Date(Date.now()-i*60000).toISOString(),ten:'Nguyên liệu '+i,ma:'K-'+i,ai:'Nhân viên thử'}));
   const prep=Array.from({length:14},(_,i)=>({loai:'finish',at:new Date(Date.now()-i*60000).toISOString(),b:{id:'p'+i,prepName:'Bán thành phẩm '+i,batchCode:'B-'+i,qtyInitial:500,unit:'g',finishedBy:'Nhân viên thử'}}));
   document.getElementById('todayKhoFeed').innerHTML=khoFeedHTML(kho);
   document.getElementById('todayPrepFeed').innerHTML=prepFeedHTML(prep);
   window.__notices=Array.from({length:13},(_,i)=>({tier:i<8?'red':'yellow',label:['Chênh lệch đếm giao ca nguyên liệu chưa xem','Lệch đếm bán thành phẩm cuối ca chưa xem','Hàng đã mở quá hạn còn ở quầy','Chi phí chờ duyệt'][i%4],count:i+1,onclick:'window.__noticeAction='+i}));
   computeStoreHealth=async()=>__notices;renderBookAlerts=()=>{};
  });
  await page.evaluate(()=>renderStoreHealth('todayHealth'));
  for(const [id,total,last] of [['Kho',11,'Nguyên liệu 10'],['Prep',14,'Bán thành phẩm 13']]){
   check(await page.locator('#today'+id+'Feed .wdg-body>.row').count()===6,width+' '+id+': chỉ 6 lượt');
   check(await page.locator('#today'+id+'Feed .wdg-body>.row .rl').allTextContents().then(a=>a.every((v,i)=>v.includes((id==='Kho'?'Nguyên liệu ':'Bán thành phẩm ')+i))),width+' '+id+': giữ 6 lượt mới nhất theo thứ tự');
   const reads=await page.evaluate(()=>__noticeReads);
   await page.locator('#today'+id+'Feed button[onclick="open'+id+'FeedSheet()"]' ).click();
   await page.waitForSelector('#editSheetWrap.open');
   await page.waitForTimeout(300);
   check(await page.locator('#'+id.toLowerCase()+'FeedSheetBody .row').count()===total,width+' '+id+': mở rộng đủ '+total+' lượt');
   check((await page.locator('#'+id.toLowerCase()+'FeedSheetBody').innerText()).includes(last),width+' '+id+': lượt cũ vẫn có');
   check(await page.evaluate(()=>__noticeReads)===reads,width+' '+id+': mở rộng hôm nay không đọc thêm');
   await page.evaluate(()=>closeEditSheet());
   await page.waitForSelector('#editSheetWrap',{state:'detached'});
  }
  await page.locator('#todayHealthToggle').scrollIntoViewIfNeeded();
  const reads=await page.evaluate(()=>__noticeReads),gridTop=await page.locator('#todayGrid').evaluate(e=>e.getBoundingClientRect().top);
  check(await page.locator('#todayHealth').isHidden(),width+': thông báo mặc định đóng');
  await page.locator('#todayHealthToggle').click();
  check(await page.locator('#todayHealth').isVisible(),width+': mở hộp thông báo');
  check(await page.locator('#todayHealth .th-notice:visible').count()===13,width+': đầy đủ việc, không bỏ cảnh báo');
  check(Math.abs(await page.locator('#todayGrid').evaluate(e=>e.getBoundingClientRect().top)-gridTop)<1,width+': mở thông báo không đẩy dashboard');
  const bounds=await page.locator('#todayHealth').boundingBox();
  check(bounds.x>=11&&bounds.x+bounds.width<=width-11&&bounds.y>=11&&bounds.y+bounds.height<=889,width+': hộp nằm trọn viewport '+JSON.stringify(bounds));
  check(bounds.width<=440,width+': chiều ngang gọn tối đa 440px');
  check(await page.locator('#todayHealth .th-list').evaluate(e=>e.scrollHeight>e.clientHeight),width+': danh sách dài cuộn bên trong');
  await page.locator('#todayHealth [data-filter="red"]').click();
  check(await page.locator('#todayHealth .th-notice:visible').count()===8,width+': lọc cần xử lý');
  await page.locator('#todayHealth [data-filter="yellow"]').click();
  check(await page.locator('#todayHealth .th-notice:visible').count()===5,width+': lọc nên xem');
  await page.locator('#todayHealth .th-list').evaluate(e=>e.scrollTop=50);
  await page.evaluate(()=>renderTodayHealthInbox(__notices.concat({tier:'red',label:'Việc mới',count:1,onclick:'window.__noticeAction=99'})));
  check(await page.locator('#todayHealth').isVisible()&&await page.locator('#todayHealth [data-filter="yellow"]').getAttribute('aria-pressed')==='true',width+': cập nhật giữ mở và bộ lọc');
  check(await page.locator('#todayHealth .th-list').evaluate(e=>e.scrollTop)>0,width+': cập nhật giữ vị trí cuộn');
  check(await page.locator('#todayHealth .th-total').count()===0&&(await page.locator('#todayHealthToggle .th-total').innerText())==='14',width+': số tổng cập nhật');
  await page.keyboard.press('Escape');
  check(await page.locator('#todayHealth').isHidden()&&await page.locator('#todayHealthToggle').evaluate(e=>e===document.activeElement),width+': Escape đóng và trả focus');
  await page.keyboard.press('Enter');
  check(await page.locator('#todayHealth').isVisible(),width+': mở bằng bàn phím');
  await page.locator('#todayHealth .th-close').click();
  check(await page.locator('#todayHealth').isHidden(),width+': nút X đóng');
  await page.locator('#todayHealthToggle').click();await page.mouse.click(width-3,890);
  check(await page.locator('#todayHealth').isHidden(),width+': bấm ngoài đóng');
  await page.locator('#todayHealthToggle').click();
  await page.locator('#todayHealth .th-notice:visible').first().click();
  check(await page.evaluate(()=>typeof __noticeAction==='number')&&await page.locator('#todayHealth').isHidden(),width+': bấm việc chạy đúng thao tác và đóng hộp');
  await page.evaluate(()=>renderTodayHealthInbox([]));await page.locator('#todayHealthToggle').click();
  check(await page.locator('#todayHealth .th-empty').isVisible(),width+': trạng thái không có việc');
  check(await page.locator('#todayHealth .th-footer').isVisible(),width+': luôn có đường tới hộp thư đầy đủ');
  check(await page.evaluate(()=>__noticeReads)===reads,width+': mở/lọc/cập nhật/đóng không đọc Firebase');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),width+': không tràn ngang');
  check(errors.length===0,width+': không lỗi JS '+errors.join('|'));
  await page.evaluate(()=>renderTodayHealthInbox(__notices));
  await page.locator('#todayHealth [data-filter="all"]').click();
  await page.screenshot({path:ROOT+'/work/notification-check/hop-thong-bao-'+width+'.png'});
  await page.evaluate(()=>{window.__screen=null;switchScreen=s=>window.__screen=s});
  await page.locator('#todayHealth .th-footer').click();
  check(await page.evaluate(()=>__screen==='inbox')&&await page.locator('#todayHealth').isHidden(),width+': nút hộp thư điều hướng đúng');
  await page.close();
 }}finally{await browser.close();server.close()}
 console.log('ĐẠT '+count+' kiểm tra');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
