// manage.html — tab Chi phí: khoản chờ duyệt của quán Gieo hiện CHUNG với TC33 / XOFA, duyệt / từ chối tại chỗ
// (docs/KE_HOACH_MANAGE_DUYET_GIEO.md, 1.1). Chromium thật + Firebase trong bộ nhớ, chặn mạng ngoài. Không chạm dữ liệu thật.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
mock=mock.replace('Object.assign({},FS[key][id]||{},d)', '(function merge(a,b){for(const k of Object.keys(b)){const v=b[k];a[k]=v&&typeof v===\'object\'&&!Array.isArray(v)?merge(a[k]&&typeof a[k]===\'object\'?a[k]:{},v):v}return a})(FS[key][id]||{},d)');
mock+=`
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({put:()=>Promise.resolve()})});
(function(){const F=firebase.firestore;const nf=function(){const f=F();f.batch=()=>{const w=[];return {set(r,d,o){w.push(()=>r.set(d,o));return this},update(r,d){w.push(()=>r.update(d));return this},commit:()=>Promise.all(w.map(fn=>fn()))}};
 f.runTransaction=async fn=>{const w=[];const r=await fn({get:ref=>ref.get(),update:(ref,d)=>{w.push(()=>ref.update(d))},set:(ref,d,o)=>{w.push(()=>ref.set(d,o))}});for(const x of w)await x();return r};
 f.collectionGroup=c=>f.collection(c);return f};Object.assign(nf,F);firebase.firestore=nf})();
(function(){const t=new Date(),k=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),y=new Date(t);y.setDate(y.getDate()-2);
 __FS.expenses_gieogieo={p1:{periodType:'onetime',date:k(y),category:'Đá viên',amount:35000,note:'2 bao',staff:'Minh',paymentMethodLabel:'Tiền mặt',status:'pending_review',source:'pos',createdAt:y.toISOString()},
  p2:{periodType:'onetime',date:k(t),category:'Ly nhựa',amount:120000,staff:'Lan',status:'pending_review',source:'pos',createdAt:t.toISOString()},
  ok:{periodType:'onetime',date:k(y),category:'Gas',amount:90000,status:'approved'}};
 __FS.expenses_gieogieo__gg02={q1:{periodType:'onetime',date:k(y),category:'Sữa',amount:64000,staff:'Huy',status:'pending_review',source:'pos',createdAt:y.toISOString()}};
 __FS.expenses_xofa=Object.assign(__FS.expenses_xofa||{},{x1:{periodType:'onetime',date:k(t),category:'Đá',amount:20000,status:'pending_review',source:'pos',store:'xofa',createdAt:t.toISOString()}});
 __FS.alerts_gieogieo={a1:{type:'missing_recipe',title:'Trà sữa chưa có công thức',status:'new',businessDate:k(y),createdAt:y.toISOString()},a2:{type:'duty_case',status:'seen',createdAt:t.toISOString()},a3:{type:'duty_case',status:'resolved'}};
 __FS.alerts_gieogieo__gg02={b1:{type:'handover_cash_variance',message:'Thiếu 20.000đ',status:'new',createdAt:t.toISOString()}};
 const at=(d,h)=>{const x=new Date(d);x.setHours(h,0,0,0);return x.toISOString()};
 __FS.employee_shifts_gieogieo=Object.assign(__FS.employee_shifts_gieogieo||{},{st1:{employeeId:'e2',employeeName:'Minh Cafe',businessDate:k(y),checkedInAt:at(y,8),checkedOutAt:null},st2:{employeeId:'e2',employeeName:'Đang làm',businessDate:k(t),checkedInAt:at(t,0),checkedOutAt:null}});
 window.__Y=k(y);})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:['/usr/bin/chromium','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p)),args:['--no-sandbox']});
 let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
 try{for(const width of [1366,390]){
  const p=await b.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('dialog',d=>d.type()==='prompt'?d.accept('Trùng hoá đơn'):d.accept());
  await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
  await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);
  await p.evaluate(()=>navigate('chiphi'));await p.waitForFunction(()=>!live.loadingKey&&live.ready.chiphi===loadKey());
  const box=p.locator('.cost-pending');await box.waitFor();
  const txt=await box.innerText();
  check(/4 khoản chờ duyệt/.test(txt),width+': khung chờ duyệt gồm 3 khoản Gieo (gg01 ×2, gg02) + 1 XOFA');
  check(txt.includes('Gieo GG01')&&txt.includes('Gieo GG02')&&txt.includes('XOFA')&&txt.includes('Minh')&&txt.includes('Tiền mặt'),width+': tên quán Gieo, người ghi, phương thức trả');
  check(await p.locator('.cost-pend-row.is-gieo').count()===3&&await p.locator('.cost-pend-row.is-gieo button',{hasText:'Sửa'}).count()===0,width+': hàng Gieo chỉ Duyệt / Từ chối (sửa ở Quản lý Gieo)');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': không cuộn ngang');
  // Duyệt khoản ngày cũ gg01 → approved + dấu lãi/lỗ quán gg01.
  await p.locator('.cost-pend-row.is-gieo',{hasText:'Đá viên'}).getByRole('button',{name:'Duyệt'}).click();
  await p.waitForFunction(()=>__FS.expenses_gieogieo.p1.status==='approved');
  check(await p.evaluate(()=>!!__FS.expenses_gieogieo.p1.reviewedAt&&!!(__FS.pl_dirty_gieogieo&&__FS.pl_dirty_gieogieo.gg01.m[__Y+'_'+__Y])),width+': duyệt ghi approved + reviewedAt, dấu lãi/lỗ đúng ngày + quán');
  await p.waitForFunction(()=>!live.loadingKey&&document.querySelectorAll('.cost-pend-row.is-gieo').length===2);
  // Từ chối khoản gg02 có lý do.
  await p.locator('.cost-pend-row.is-gieo',{hasText:'Gieo GG02'}).getByRole('button',{name:'Từ chối'}).click();
  await p.waitForFunction(()=>__FS.expenses_gieogieo__gg02.q1.status==='rejected');
  check(await p.evaluate(()=>__FS.expenses_gieogieo__gg02.q1.reviewNote==='Trùng hoá đơn'),width+': từ chối ghi lý do vào bảng __gg02');
  // Khoản đã được duyệt ở nơi khác giữa chừng → báo, không ghi đè.
  await p.waitForFunction(()=>!live.loadingKey&&document.querySelectorAll('.cost-pend-row.is-gieo').length===1);
  await p.evaluate(()=>{__FS.expenses_gieogieo.p2.status='approved';__FS.expenses_gieogieo.p2.reviewedAt='QL'});
  await p.locator('.cost-pend-row.is-gieo',{hasText:'Ly nhựa'}).getByRole('button',{name:'Duyệt'}).click();
  await p.waitForTimeout(400);
  check(await p.evaluate(()=>__FS.expenses_gieogieo.p2.reviewedAt==='QL'),width+': đã duyệt ở Quản lý Gieo → không ghi đè');
  // Màn «Chờ xử lý · Gieo».
  await p.evaluate(()=>navigate('duyet'));await p.waitForFunction(()=>!live.loadingKey&&live.ready.duyet===loadKey());
  const it=await p.locator('#view').innerText();
  check(/4 việc/.test(it)&&it.includes('Minh Cafe · ca chưa check-out')&&!it.includes('Đang làm')&&it.includes('Gieo GG01')&&it.includes('Gieo GG02')&&it.includes('Trà sữa chưa có công thức')&&it.includes('Thiếu 20.000đ')&&it.includes('Vụ lệch cần xem'),width+': chờ xử lý: cảnh báo mới + đã xem từng quán, không có cảnh báo đã xử lý');
  check(await p.evaluate(()=>document.querySelector('#storeSwitcher').hidden&&document.documentElement.scrollWidth<=innerWidth),width+': ẩn chọn quán, không cuộn ngang');
  if(process.env.SCREENSHOT_DIR)await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'cho_xu_ly_'+width+'.png'),fullPage:true});
  await p.locator('.cost-pend-row',{hasText:'Trà sữa'}).getByRole('button',{name:'Đã xem'}).click();
  await p.waitForFunction(()=>__FS.alerts_gieogieo.a1.status==='seen');
  await p.waitForFunction(()=>!live.loadingKey&&live.ready.duyet===loadKey());
  await p.locator('.cost-pend-row',{hasText:'Thiếu 20.000đ'}).getByRole('button',{name:'Đã xử lý'}).click();
  await p.waitForFunction(()=>__FS.alerts_gieogieo__gg02.b1.status==='resolved');
  await p.waitForFunction(()=>!live.loadingKey&&live.ready.duyet===loadKey()&&!document.querySelector('#view').innerText.includes('Thiếu 20.000đ'));
  check(await p.evaluate(()=>!!__FS.alerts_gieogieo__gg02.b1.resolvedAt),width+': Đã xem / Đã xử lý ghi trạng thái + resolvedAt, danh sách cập nhật');
  await p.getByRole('button',{name:'Điền giờ ra'}).click();await p.locator('#ggShiftOut').fill('17:30');await p.getByRole('button',{name:'Lưu giờ ra'}).click();
  await p.waitForFunction(()=>!!__FS.employee_shifts_gieogieo.st1.checkedOutAt);
  check(await p.evaluate(()=>{const x=__FS.employee_shifts_gieogieo.st1,o=new Date(x.checkedOutAt);return o.getHours()===17&&o.getMinutes()===30&&x.manualEdit===true&&!!__FS.pl_dirty_gieogieo.gg01.m[__Y+'_'+__Y]}),width+': điền giờ ra ca treo → checkedOutAt 17:30 giờ VN + manualEdit + dấu lãi/lỗ');
  await p.waitForFunction(()=>!live.loadingKey&&live.ready.duyet===loadKey()&&!document.querySelector('#view').innerText.includes('ca chưa check-out'));
  check(errors.length===0,width+': không lỗi JS '+errors.join(' | '));
  // Đặt lại dữ liệu cho cỡ màn sau.
  await p.close();
 }}finally{await b.close();server.close()}
 console.log('ALL PASS ('+n+' kiểm)');
})().catch(e=>{console.error(e);process.exit(1)});
