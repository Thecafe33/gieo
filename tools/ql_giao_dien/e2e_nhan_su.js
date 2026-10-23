// E2E khung giao diện quanlygieo.html (trình duyệt thật — cần Playwright + Chromium; không thuộc tests/run_all.sh)
//   node tools/ql_giao_dien/e2e_khung.js
// Firebase giả (tools/tet/e2e/mockfb.js). Kiểm: thanh điều hướng dưới (điện thoại) bấm đúng màn + sáng đúng nút, ngăn menu mở/đóng,
// sidebar nổi + nút ☰ ẩn/hiện + Ctrl+K + tìm menu (máy tính), nút chọn quán, popup, không tràn ngang, không lỗi JS.
const { chromium } = require('playwright'); const fs=require('fs');
const path=require('path'); const ROOT=path.resolve(__dirname,'../..'), E2E=ROOT+'/tools/tet/e2e';
let mock=fs.readFileSync(E2E+'/mockfb.js','utf8');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {put(){return Promise.resolve()}}}}};\n(function(){const F=firebase.firestore;const nf=function(){const f=F();const nb=()=>{const ops=[];const b={set(r,d,o){ops.push(()=>r.set(d,o));return b},update(r,d){ops.push(()=>r.update(d));return b},delete(r){ops.push(()=>r.delete());return b},commit(){return Promise.all(ops.map(f=>f())).then(()=>{})}};return b};f.batch=nb;f.collectionGroup=c=>f.collection(c);f.doc=pth=>{const a=pth.split('/');return f.collection(a[0]).doc(a[1]||'x')};f.runTransaction=fn=>Promise.resolve();return f};Object.assign(nf,F);firebase.firestore=nf})();";
// Chạy: node tools/ql_giao_dien/e2e_nhan_su.js (Firebase giả, chặn toàn bộ mạng ngoài).
// Ảnh kiểm tra nằm trong work/; không có thao tác nào vào Firebase thật.
// Chromium trong môi trường cloud có thể khoá file://; phục vụ bản thử trên loopback.
const server=require('http').createServer((req,res)=>{
  const file=path.resolve(ROOT, '.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':'/usr/bin/chromium')});
 let fail=0, count=0;
 const chk=(ok,msg)=>{count++;console.log((ok?'ok ':'FAIL ')+msg);if(!ok)fail++};
 const out=ROOT+'/work/nhan_su';fs.mkdirSync(out,{recursive:true});
 for(const w of [1366,853,390]){
  const p=await b.newPage({viewport:{width:w,height:900},timezoneId:'Asia/Ho_Chi_Minh'});const errs=[];
  p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
  await p.goto(base+'/quanlygieo.html');await p.waitForTimeout(1800);
  if(w===1366){
   await p.evaluate(()=>{QL_STORES=[{id:'gg01',name:'Gieo Gieo Kênh 9',active:true}];goEntry('nv')});await p.waitForTimeout(350);
   chk(await p.locator('input[name=nvWorkStore]').count()===1&&await p.locator('#nvHomeStore').count()===1,'một điểm bán: vẫn có ô điểm làm việc và quán chính lương cứng');
  }
  await p.evaluate(()=>{
   QL_STORES=[{id:'gg01',name:'Gieo Gieo Kênh 9',active:true},{id:'gg02',name:'Gieo Gieo Điểm 2',active:true}];
   __FS.employees_gieogieo.e1.storeTags=['gg01','gg02'];
   __FS.employees_gieogieo.e2.storeTags=['gg02'];
   __FS.employees_gieogieo.e2.fullName="Minh Ô'long <b>";
   const date=dkey(new Date());
   __FS.work_schedules_gieogieo={[`e1_${date}`]:{employeeId:'e1',employeeName:'Lan Gieo',date,startTime:'08:00',endTime:'16:00',isOff:false}};
   __FS.employee_shifts_gieogieo.g1.employeeName='Minh Cafe';
   memoDropAll();goEntry('nv');
  });
  await p.waitForTimeout(700);
  chk(await p.locator('#nvStoreGroups > .wdg').count()===2,`${w}: mỗi điểm bán một widget`);
  chk(await p.locator('#nvStoreGroups .hr-table tbody tr').count()===4,`${w}: người nhiều điểm hiện ở cả hai, hồ sơ cũ về GG01`);
  chk(await p.locator('input[name=nvWorkStore]').count()===2,`${w}: tạo hồ sơ chọn điểm bán ngay khi có danh sách quán`);
  await p.fill('#nvFullName','Nhân viên thử');await p.fill('#nvPin','9876');
  await p.selectOption('#nvPayType','hourly_part');await p.waitForTimeout(400);
  chk(await p.inputValue('#nvFullName')==='Nhân viên thử'&&await p.inputValue('#nvPin')==='9876',`${w}: đổi hình thức lương giữ tên và PIN đang gõ`);
  await p.fill('#nvHourlyRate','25000');await p.check('#nvOtEnabled');await p.fill('#nvOtRate','35000');
  await p.check('input[name=nvWorkStore][value=gg02]');
  await p.evaluate(()=>submitEmployeeForm());await p.waitForTimeout(500);
  chk(await p.evaluate(()=>Object.values(__FS.employees_gieogieo).some(e=>e.fullName==='Nhân viên thử'&&e.storeTags.join(',')==='gg01,gg02'&&e.hourlyRate===25000&&e.otEnabled)),`${w}: lưu hồ sơ đa điểm + lương và OT`);
  await p.fill('#nvSearch',"Ô'long");
  chk(await p.locator('#nvStoreGroups .hr-table tbody tr').count()===1,`${w}: tìm tên có dấu nháy, không thực thi HTML`);
  chk(await p.locator('#nvStoreGroups tbody b b').count()===0,`${w}: tên nhân viên được escape`);
  await p.click('#nvStoreGroups .btn:has-text("Sửa")');await p.waitForTimeout(400);
  chk(await p.locator('#editSheetWrap.open .wdg').count()===1,`${w}: popup sửa có widget hồ sơ`);
  chk(await p.isChecked('#editSheetWrap input[value=gg02]'),`${w}: mở sửa giữ điểm đã chọn`);
  await p.fill('#nvFullName','Minh cập nhật');await p.selectOption('#nvPayType','hourly_full');await p.waitForTimeout(400);
  chk(await p.inputValue('#nvFullName')==='Minh cập nhật',`${w}: đổi hình thức trong popup giữ nội dung`);
  await p.evaluate(()=>{closeEditSheet(true);nvEditingId=null;nvFormDraft={payType:null,otEnabled:null,roles:null};goEntry('nv')});await p.waitForTimeout(400);
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:out+`/nhan-vien-${w}.png`,fullPage:true});
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${w}: nhân viên không tràn ngang`);
  await p.evaluate(()=>goEntry('lich'));await p.waitForTimeout(500);
  chk(await p.locator('#entryBody .wdg').count()===2,`${w}: lịch có widget xếp nhanh và từng ngày`);
  chk(await p.locator('#bulkLichStartTime').count()===1&&await p.locator('[id^=lichStart_]').count()>0,`${w}: còn đủ ô giờ và lịch từng người`);
  await p.fill('#lichStart_e1','09:15');await p.evaluate(()=>submitScheduleEntry('e1','Lan Gieo'));await p.waitForTimeout(350);
  chk(await p.evaluate(()=>__FS.work_schedules_gieogieo['e1_'+lichViewDate].startTime==='09:15'),`${w}: sửa lịch vẫn ghi đúng điểm và ngày`);
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${w}: lịch không tràn ngang`);
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:out+`/lich-${w}.png`,fullPage:true});
  await p.evaluate(()=>goEntry('chamcong'));await p.waitForTimeout(700);
  chk(await p.locator('#entryBody .wdg').count()>=4,`${w}: chấm công có widget ngày, chi tiết, ca bù và cấu hình`);
  await p.evaluate(()=>{_ccAddOpen=true;renderEntryChamCong()});await p.waitForTimeout(400);
  chk(await p.locator('#cc-add-emp').count()===1&&await p.locator('#cc-add-in').count()===1,`${w}: form ca bù vẫn mở`);
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${w}: chấm công không tràn ngang`);
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:out+`/cham-cong-${w}.png`,fullPage:true});
  await p.evaluate(()=>goEntry('luong'));await p.waitForTimeout(900);
  chk(await p.locator('#entryBody .wdg').count()===3&&await p.locator('#luongMonthInput').count()===1,`${w}: lương có widget cấu hình, tháng và bảng lương`);
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${w}: lương không tràn ngang`);
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:out+`/luong-${w}.png`,fullPage:true});
  await p.evaluate(()=>{goKho('dubao')});await p.waitForTimeout(500);
  chk(await p.locator('#dbExpFrom').count()===1&&await p.locator('#dbExpTo').count()===1,`${w}: form xuất phân tích mẻ còn đủ khoảng ngày`);
  chk(await p.evaluate(()=>{const el=document.getElementById('dbExpFrom');return !!el.closest('.wdg')&&getComputedStyle(el).borderRadius==='14px'}),`${w}: form trong ảnh đã thành widget với ô ngày bo tròn`);
  // Ô ngày ngoài .field và popup quy trách nhiệm/lý do đều được style chung.
  await p.evaluate(()=>openEditSheet('Quy trách nhiệm','<input id="bareDate" type="date" value="2026-10-17"><select id="bareSelect"><option>Chưa quy</option><option>Nhân viên</option></select><textarea id="bareReason" placeholder="Lý do"></textarea><input id="bareMonth" type="month"><input id="bareTime" type="time"><input type="checkbox" id="bareCheck">'));
  chk(await p.evaluate(()=>['bareDate','bareSelect','bareReason','bareMonth','bareTime'].every(id=>{const s=getComputedStyle(document.getElementById(id));return parseFloat(s.borderRadius)>=14&&parseFloat(s.minHeight)>=46})),`${w}: ô ngày/giờ/tháng/chọn/lý do ngoài .field đồng bộ`);
  chk(await p.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('bareCheck')).minHeight)<46),`${w}: không biến checkbox thành ô nhập lớn`);
  chk(errs.length===0,`${w}: không lỗi JS ${errs.slice(0,3).join('|')}`);
  await p.close();
 }
 await b.close();console.log(`${count-fail}/${count} PASS`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
