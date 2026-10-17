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
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh',hasTouch:width<768}),errors=[];
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
  check(await page.locator('.topbar #todayHealthToggle').count()===1,width+': chuông nằm trên header');
  check(await page.locator('.topbar .hdr-titles').isHidden(),width+': bỏ tiêu đề Hôm nay trùng sidebar');
  check(await page.locator('#screen-today #todayNotifications').count()===0,width+': không còn hộp thông báo dư dưới chỉ số');
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
  await page.locator('#todayHealth [data-filter="all"]').click();
  await page.locator('#todayHealth .th-list').evaluate(e=>e.scrollTop=50);
  await page.evaluate(()=>renderTodayHealthInbox(__notices.concat({tier:'red',label:'Việc mới',count:1,onclick:'window.__noticeAction=99'})));
  check(await page.locator('#todayHealth').isVisible()&&await page.locator('#todayHealth [data-filter="all"]').getAttribute('aria-pressed')==='true',width+': cập nhật giữ mở và bộ lọc');
  check(await page.locator('#todayHealth .th-list').evaluate(e=>e.scrollTop)>0,width+': cập nhật giữ vị trí cuộn');
  check(await page.locator('#todayHealth .th-total').count()===0&&(await page.locator('#todayHealthToggle .th-total').innerText())==='14',width+': số tổng cập nhật');
  await page.keyboard.press('Escape');
  check(await page.locator('#todayHealth').isHidden()&&await page.locator('#todayHealthToggle').evaluate(e=>e===document.activeElement),width+': Escape đóng và trả focus');
  await page.keyboard.press('Enter');
  check(await page.locator('#todayHealth').isVisible(),width+': mở bằng bàn phím');
  check(await page.locator('#todayHealth .th-close').count()===0,width+': bỏ nút X');
  const bellTop=await page.locator('#todayHealthToggle').evaluate(e=>e.getBoundingClientRect().top);
  await page.mouse.move(width-3,500);await page.mouse.wheel(0,400);await page.waitForTimeout(350);
  check(await page.locator('#todayHealth').isVisible(),width+': cuộn bên ngoài vẫn giữ hộp mở');
  check(Math.abs(await page.locator('#todayHealthToggle').evaluate(e=>e.getBoundingClientRect().top)-bellTop)<1,width+': chuông cố định khi cuộn trang');
  await page.locator('#reloadBtn').focus();
  check(await page.locator('#todayHealth').isVisible(),width+': đổi focus không tự đóng');
  if(width<768){
   const touch=await page.context().newCDPSession(page);
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:780}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y:400}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForTimeout(200);
   check(await page.locator('#todayHealth').isVisible(),width+': vuốt ngoài hộp không tự đóng');
   // Chờ quán tính cuộn dừng: tap khi còn trượt chỉ là thao tác dừng cuộn của trình duyệt.
   await page.waitForFunction(()=>{const y=scrollY,t=performance.now();if(!window.__touchStill||__touchStill.y!==y){window.__touchStill={y,t};return false}return t-__touchStill.t>180});
   await page.touchscreen.tap(width/2,8);
   check(await page.locator('#todayHealth').isHidden(),width+': chạm ngoài hộp đóng');
   await page.locator('#todayHealthToggle').click();
  }
  await page.locator('#todayHealthToggle').click();
  check(await page.locator('#todayHealth').isHidden(),width+': bấm lại chuông đóng');
  await page.locator('#todayHealthToggle').click();await page.mouse.click(width/2,8);
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
  await page.screenshot({path:ROOT+'/work/chuong/hop-thong-bao-'+width+'.png'});
  await page.evaluate(()=>{window.__screen=null;window.__originalSwitch=switchScreen;switchScreen=s=>window.__screen=s});
  await page.locator('#todayHealth .th-footer').click();
  check(await page.evaluate(()=>__screen==='inbox')&&await page.locator('#todayHealth').isHidden(),width+': nút hộp thư điều hướng đúng');
  if(width===1366||width===390){
   await page.evaluate(()=>{
    switchScreen=__originalSwitch;
    __FS.alerts_gieogieo={};
    for(let i=0;i<15;i++)__FS.alerts_gieogieo['old'+i]={status:'new',type:'prep_count_variance',title:'BTP thử '+i,createdAt:'2026-09-'+String(i+1).padStart(2,'0')+'T08:00:00Z',unit:'g',systemQty:500,countedQty:300,varianceQty:-200};
    for(let i=0;i<40;i++)__FS.alerts_gieogieo['recent'+i]={status:'resolved',type:'prep_count_variance',title:'Lịch sử '+i,createdAt:'2026-10-17T08:'+String(i).padStart(2,'0')+':00Z',unit:'g',systemQty:500,countedQty:300,varianceQty:-200};
    switchScreen('inbox');
   });
   await page.waitForFunction(()=>alertUiState().inbox?.some(a=>a.id==='old0'));
   await page.evaluate(()=>{const s=alertUiState();s.health=storeHealthAlertRows(s.unread);paintStoreHealth(s.health,'todayHealth')});
   check(await page.locator('#inboxBody .alert-card:not(.resolved)').count()===15,width+': hộp thư có đủ 15 mục BTP cũ chưa xem');
   check(await page.locator('.topbar .hdr-titles').isVisible(),width+': giữ tiêu đề trên màn khác');
   const statusReads=await page.evaluate(()=>__noticeReads);
   await page.locator(`#inboxBody button[onclick="markAlertStatus('old0','seen')"]`).click();
   await page.waitForFunction(()=>alertUiState().unread.length===14);
   check(await page.locator('#inboxBody .alert-card').filter({hasText:'BTP thử 0'}).locator('.tier').innerText()==='Đã xem',width+': thẻ đã xem ghi đúng trạng thái');
   check(await page.evaluate(()=>alertUiState().health.find(x=>x.fromAlerts)?.count===14),width+': đếm BTP giảm ngay không cần reload');
   await page.locator(`#inboxBody button[onclick="markAlertStatus('old0','resolved')"]`).click();
   await page.waitForFunction(()=>alertUiState().inbox.find(x=>x.id==='old0')?.status==='resolved');
   check(await page.locator('#inboxBody .alert-card').filter({hasText:'BTP thử 0'}).locator('.tier').innerText()==='Đã xử lý',width+': có thể xử lý tiếp mục đã xem');
   await page.evaluate(async()=>{for(let i=1;i<15;i++)await markAlertStatus('old'+i,i%2?'seen':'resolved')});
   check(await page.locator('#todayHealthToggle .th-total').isHidden(),width+': hết mục mới thì bỏ số trên chuông');
   check(await page.locator('#inboxBody .alert-card:not(.resolved)').count()===0,width+': không còn thẻ BTP chưa xem');
   check(await page.evaluate(()=>__noticeReads)===statusReads,width+': xử lý cả danh sách không truy vấn lại Firebase');
   check(errors.length===0,width+': thao tác trạng thái không lỗi JS '+errors.join('|'));
  }
  await page.close();
 }}finally{await browser.close();server.close()}
 console.log('ĐẠT '+count+' kiểm tra');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
