// E2E khung giao diện quanlygieo.html (trình duyệt thật — cần Playwright + Chromium; không thuộc tests/run_all.sh)
//   node tools/ql_giao_dien/e2e_khung.js
// Firebase giả (tools/tet/e2e/mockfb.js). Kiểm: thanh điều hướng dưới (điện thoại) bấm đúng màn + sáng đúng nút, ngăn menu mở/đóng,
// sidebar nổi + nút ☰ ẩn/hiện + Ctrl+K + tìm menu (máy tính), nút chọn quán, popup, không tràn ngang, không lỗi JS.
const { chromium } = require('playwright'); const fs=require('fs');
const path=require('path'); const ROOT=path.resolve(__dirname,'../..'), E2E=ROOT+'/tools/tet/e2e';
let mock=fs.readFileSync(E2E+'/mockfb.js','utf8');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {put(){return Promise.resolve()}}}}};\n(function(){const F=firebase.firestore;const nf=function(){const f=F();const nb=()=>{const b={set(){return b},update(){return b},delete(){return b},commit(){return Promise.resolve()}};return b};f.batch=nb;f.collectionGroup=c=>f.collection(c);f.doc=pth=>{const a=pth.split('/');return f.collection(a[0]).doc(a[1]||'x')};f.runTransaction=fn=>Promise.resolve();return f};Object.assign(nf,F);firebase.firestore=nf})();";
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const R=[]; const chk=(c,m)=>R.push((c?'ok   ':'FAIL ')+m);
  async function open(w,h){const p=await b.newPage({viewport:{width:w,height:h}}); p.on('dialog',d=>d.dismiss());
    await p.route('**/*',r=>{const u=r.request().url();
      if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});
      if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});
      if(u.startsWith('file:'))return r.continue(); return r.abort();});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.errs=errs;
    await p.goto('file://'+ROOT+'/quanlygieo.html'); await p.waitForTimeout(2500); return p;}
  // --- điện thoại
  let p=await open(390,844);
  const vis=async s=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return cs.display!=='none'&&r.width>0&&r.height>0},s);
  chk(await vis('#bottomNav'),'phone: thanh dưới hiện');
  chk(await p.evaluate(()=>document.querySelectorAll('#bottomNav button').length)===4,'phone: 4 nút');
  chk(await p.evaluate(()=>document.querySelector('#bottomNav button.active span').textContent)==='Hôm nay','phone: Hôm nay đang chọn');
  await p.click('#bottomNav button:nth-child(2)'); await p.waitForTimeout(600);
  chk(await p.evaluate(()=>document.getElementById('screen-todayops').classList.contains('active')),'phone: bấm Vận hành → mở màn Vận hành');
  chk(await p.evaluate(()=>document.querySelector('#bottomNav button.active span').textContent)==='Vận hành','phone: nút Vận hành sáng');
  await p.click('#bottomNav button:nth-child(3)'); await p.waitForTimeout(600);
  chk(await p.evaluate(()=>document.getElementById('screen-report').classList.contains('active')),'phone: bấm Báo cáo → mở Báo cáo');
  await p.click('#bottomNav button:nth-child(4)'); await p.waitForTimeout(500);
  chk(await p.evaluate(()=>document.getElementById('sidebar').classList.contains('open')),'phone: bấm Thêm → mở menu');
  const sb=await p.evaluate(()=>{const r=document.getElementById('sidebar').getBoundingClientRect();return [r.left,r.right]});
  chk(sb[0]>=0&&sb[1]<=390,'phone: menu nằm trọn trong màn hình '+JSON.stringify(sb));
  await p.click('#sidebarBackdrop',{position:{x:370,y:400}}); await p.waitForTimeout(500);
  chk(!(await p.evaluate(()=>document.getElementById('sidebar').classList.contains('open'))),'phone: bấm nền → đóng menu');
  // chọn mục menu → sang màn
  await p.click('#bottomNav button:nth-child(4)'); await p.waitForTimeout(400);
  await p.click('#sidebarNav .sidebar-item:has-text("Khách hàng")'); await p.waitForTimeout(700);
  chk(await p.evaluate(()=>document.getElementById('screen-customer').classList.contains('active')),'phone: menu → Khách hàng');
  chk(await p.evaluate(()=>document.querySelector('#bottomNav button.active span').textContent)==='Thêm','phone: ở màn khác → "Thêm" sáng');
  // không tràn ngang
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'phone: không cuộn ngang');
  // popup
  await p.evaluate(()=>openEditSheet('Thử','<div>x</div>')); await p.waitForTimeout(500);
  chk(await p.evaluate(()=>document.getElementById('editSheetWrap').classList.contains('open')),'phone: popup mở');
  chk(p.errs.length===0,'phone: không lỗi JS '+p.errs.slice(0,2).join('|'));
  await p.close();
  // --- widget màn Hôm nay (Bill bán hàng / Hoạt động kho / Hoạt động BTP): đổi giao diện, KHÔNG đổi chức năng
  const SEED = "_bfList=[{key:'k1',o:{time:'16:05',method:'TIỀN MẶT',total:116000,itemsArray:[{name:'Matcha',qty:2,size:'S',price:45000}],billCode:'GG-1'}},{key:'k2',o:{time:'14:20',method:'CHUYỂN KHOẢN',total:60000,itemsArray:[{name:'Trà đào',qty:1,price:60000}]}}];_bfOpen.clear();renderBillFeed();"
    + "document.getElementById('todayKhoFeed').innerHTML=khoFeedHTML([{loai:'mo',at:new Date().toISOString(),ten:'Syrup',ma:'S-1',ai:'Minh'}]);"
    + "document.getElementById('todayPrepFeed').innerHTML=prepFeedHTML([{loai:'start',at:new Date().toISOString(),b:{id:'b1',prepName:'Trà ủ',batchCode:'T-1',staff:'Minh'}}])";
  p=await open(390,844);
  await p.evaluate(SEED); await p.waitForTimeout(300);
  chk(await p.evaluate(()=>['todayBills','todayKhoFeed','todayPrepFeed'].every(i=>document.getElementById(i).classList.contains('wdg')&&document.getElementById(i).children.length>0)),'widget: 3 khối có khung .wdg + nội dung');
  chk(await p.evaluate(()=>document.querySelectorAll('#todayBills .bfeed-row').length===2),'widget bill: 2 hàng bill');
  await p.click('#todayBills .bfeed-row:nth-child(1) .bfeed-head'); await p.waitForTimeout(200);
  chk(await p.evaluate(()=>document.querySelector('#todayBills .bfeed-row:nth-child(1) .bfeed-body')!==null && document.querySelector('#todayBills .bfeed-row:nth-child(1) .bfeed-body').textContent.includes('Matcha')),'widget bill: bấm hàng → bung chi tiết NGAY TẠI CHỖ (không popup)');
  chk(!(await p.evaluate(()=>{const w=document.getElementById('editSheetWrap');return !!(w&&w.classList.contains('open'));})),'widget bill: không mở popup');
  await p.click('#todayBills .bfeed-row:nth-child(1) .bfeed-head'); await p.waitForTimeout(200);
  chk(await p.evaluate(()=>document.querySelector('#todayBills .bfeed-row:nth-child(1) .bfeed-body')===null),'widget bill: bấm lần nữa → thu lại');
  chk(await p.evaluate(()=>document.querySelector('#todayBills .wdg-head button').getAttribute('onclick')==='goBills()'),'widget bill: nút «Xem tất cả» vẫn gọi goBills()');
  const kh=await p.evaluate(()=>document.querySelector('#todayKhoFeed .wdg-head').getAttribute('aria-expanded'));
  chk(kh==='false','widget kho (điện thoại): mặc định gập lại');
  await p.click('#todayKhoFeed .wdg-head'); await p.waitForTimeout(250);
  chk(await p.evaluate(()=>document.querySelector('#todayKhoFeed .wdg-body')!==null),'widget kho: bấm đầu widget → bung ra');
  chk(await p.evaluate(()=>[...document.querySelectorAll('#todayKhoFeed .wdg-body button')].some(b=>/openKhoFeedSheet/.test(b.getAttribute('onclick')||''))),'widget kho: còn nút «Mở rộng» (openKhoFeedSheet)');
  await p.evaluate(()=>{ [...document.querySelectorAll('#todayKhoFeed .wdg-body button')].find(b=>/openKhoFeedSheet/.test(b.getAttribute('onclick'))).click(); }); await p.waitForTimeout(500);
  chk(await p.evaluate(()=>{const w=document.getElementById('editSheetWrap');return !!(w&&w.classList.contains('open'));}),'widget kho: «Mở rộng» mở bảng đầy đủ như cũ');
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'widget: không tràn ngang trên điện thoại');
  chk(p.errs.length===0,'widget: không lỗi JS '+p.errs.slice(0,2).join('|'));
  await p.close();
  p=await open(1366,820);
  await p.evaluate(SEED); await p.waitForTimeout(300);
  chk(await p.evaluate(()=>document.querySelector('#todayKhoFeed .wdg-body')!==null && document.querySelector('#todayPrepFeed .wdg-body')!==null),'widget (tablet): kho + BTP mở sẵn song song');
  chk(await p.evaluate(()=>{const a=document.getElementById('todayKhoFeed').getBoundingClientRect(),b=document.getElementById('todayPrepFeed').getBoundingClientRect();return Math.abs(a.top-b.top)<2 && a.right<=b.left+1;}),'widget (tablet): kho và BTP nằm cạnh nhau');
  await p.close();
  // --- huy hiệu «Ca hiện tại»: máy tính thì CÙNG HÀNG với tiêu đề; chỉ xuống hàng khi thanh tiêu đề thật sự hẹp
  const badgeTops = async (w) => { const q = await open(w, 820); await q.evaluate(() => { document.getElementById('todayShiftInfo').innerHTML = '<div class="shift-badge" onclick="openTodayShiftDetail()"><div class="shift-badge-line1">Ca hiện tại: Ca sáng</div><div class="shift-badge-line2">1 đang làm</div></div>'; });
    await q.waitForTimeout(200); const r = await q.evaluate(() => ({ t: document.getElementById('hdrTitle').getBoundingClientRect().top, b: document.getElementById('todayShiftInfo').getBoundingClientRect().top, h: document.querySelector('#todayShiftInfo .shift-badge').getBoundingClientRect().height })); await q.close(); return r; };
  let bt = await badgeTops(1366); chk(Math.abs(bt.b - bt.t) < 40, 'huy hiệu ca: 1366px → cùng hàng với tiêu đề ' + JSON.stringify(bt));
  bt = await badgeTops(1180); chk(Math.abs(bt.b - bt.t) < 40, 'huy hiệu ca: 1180px → vẫn cùng hàng ' + JSON.stringify(bt));
  bt = await badgeTops(1000); chk(bt.b > bt.t + 20 && bt.h < 45, 'huy hiệu ca: cửa sổ hẹp → xuống hàng riêng nhưng gọn một dòng ' + JSON.stringify(bt));
  // --- tab Tiền mặt + Chi phí dạng widget — chức năng cũ còn nguyên
  p = await open(1366, 820);
  await p.evaluate(() => goEntry('exp')); await p.waitForTimeout(900);
  chk(await p.evaluate(() => document.querySelectorAll('#entryBody .wdg').length >= 3 && document.querySelector('#entryBody .wkpi-row .wkpi.hero') !== null), 'Chi phí: có widget + ô tổng hợp đầu màn');
  chk(await p.evaluate(() => ['expCat', 'expAmt', 'expTypeSeg', 'expKindSeg', 'expNote', 'expList'].every(i => document.getElementById(i))), 'Chi phí: form + danh sách còn đủ id');
  await p.click('#expTypeSeg button[data-type="onetime"]'); await p.waitForTimeout(150);
  chk(await p.evaluate(() => document.querySelector('#expTypeSeg button[data-type="onetime"]').classList.contains('active') && document.getElementById('expOnetimeFields').style.display !== 'none'), 'Chi phí: đổi «Một lần» / «Có kỳ hạn» vẫn chạy');
  await p.click('#entryBody .wdg-fold'); await p.waitForTimeout(900);
  chk(await p.evaluate(() => document.getElementById('expCatNew') !== null), 'Chi phí: bấm đầu widget «Cấu hình Danh mục» → mở cấu hình');
  await p.evaluate(() => goEntry('cash')); await p.waitForTimeout(1200);
  chk(await p.evaluate(() => document.querySelectorAll('#entryBody .wdg').length >= 5 && document.getElementById('cashKpis').children.length >= 1), 'Tiền mặt: có widget + ô tổng hợp đầu màn');
  chk(await p.evaluate(() => ['cashViewDateInput', 'cashToleranceInput', 'handoverToleranceInput', 'cashRetainInput', 'segTimeline', 'cashDetail', 'cashDrawerLog', 'cashHistory'].every(i => document.getElementById(i))), 'Tiền mặt: các ô + vùng đối soát còn đủ id');
  chk(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Tiền mặt / Chi phí: không tràn ngang');
  chk(p.errs.length === 0, 'Tiền mặt / Chi phí: không lỗi JS ' + p.errs.slice(0, 2).join('|'));
  await p.close();
  // --- tablet / desktop
  p=await open(1366,820);
  chk(!(await vis('#bottomNav')),'desktop: thanh dưới ẩn');
  const r0=await p.evaluate(()=>{const r=document.getElementById('sidebar').getBoundingClientRect();return [r.left,r.width,r.height]});
  chk(r0[0]>=10&&r0[1]>240&&r0[2]>700,'desktop: sidebar nổi '+JSON.stringify(r0));
  await p.click('#hamburgerBtn'); await p.waitForTimeout(500);
  chk(await p.evaluate(()=>document.documentElement.classList.contains('nav-off')),'desktop: ☰ ẩn sidebar');
  const r1=await p.evaluate(()=>document.getElementById('sidebar').getBoundingClientRect().right);
  chk(r1<=0,'desktop: sidebar ẩn hẳn ra ngoài '+r1);
  await p.click('#hamburgerBtn'); await p.waitForTimeout(500);
  chk(!(await p.evaluate(()=>document.documentElement.classList.contains('nav-off'))),'desktop: ☰ hiện lại');
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200);
  chk(await p.evaluate(()=>document.activeElement&&document.activeElement.id==='navSearch'),'desktop: Ctrl+K vào ô tìm');
  await p.keyboard.type('khách'); await p.waitForTimeout(300);
  chk(await p.evaluate(()=>[...document.querySelectorAll('#sidebarNav .sidebar-item')].length>=1&&[...document.querySelectorAll('#sidebarNav .sidebar-item')].every(e=>/khách|kh/i.test(e.textContent))),'desktop: tìm "khách" lọc menu');
  chk(await p.evaluate(()=>{const e=document.querySelector('.sb-store');return !!e}),'desktop: nút chọn quán (class mới) có mặt');
  await p.click('.sb-store'); await p.waitForTimeout(500);
  chk(await p.evaluate(()=>document.getElementById('editSheetWrap').classList.contains('open')),'desktop: bấm chọn quán → mở bảng chọn');
  chk(p.errs.length===0,'desktop: không lỗi JS '+p.errs.slice(0,2).join('|'));
  console.log(R.join('\n')); console.log('FAIL:',R.filter(x=>x.startsWith('FAIL')).length,'/',R.length);
  await b.close();
})();
