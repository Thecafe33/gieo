// Chromium thật + Firebase trong bộ nhớ, chặn mạng ngoài. Không chạm dữ liệu thật.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
// Firestore set({merge:true}) gộp từng trường của map; giữ đúng hành vi thật của pl_book.
mock=mock.replace('Object.assign({},FS[key][id]||{},d)', '(function merge(a,b){for(const k of Object.keys(b)){const v=b[k];a[k]=v&&typeof v===\'object\'&&!Array.isArray(v)?merge(a[k]&&typeof a[k]===\'object\'?a[k]:{},v):v}return a})(FS[key][id]||{},d)');
mock+=`
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({put:()=>Promise.resolve()})});
(function(){const F=firebase.firestore;const nf=function(){const f=F();window.__FSREADS=window.__FSREADS||{};const coll=f.collection;const wrap=(q,c)=>{for(const method of ['where','orderBy','limit','doc'])if(q[method]){const fn=q[method];q[method]=(...a)=>wrap(fn.apply(q,a),c)}if(q.get){const get=q.get;q.get=(...a)=>{__FSREADS[c]=(__FSREADS[c]||0)+1;return get.apply(q,a)}}return q};f.collection=c=>wrap(coll(c),c);f.batch=()=>{const writes=[];return {set(ref,d,o){writes.push(()=>ref.set(d,o));return this},commit:()=>Promise.all(writes.map(fn=>fn()))}};f.collectionGroup=c=>f.collection(c);f.doc=p=>{const a=p.split('/');return f.collection(a[0]).doc(a[1]||'x')};f.runTransaction=()=>Promise.resolve();return f};Object.assign(nf,F);firebase.firestore=nf;
const D=firebase.database, listeners=new Map();window.__READS={};window.__emit=(p,type,key,o)=>{__RT[p]=__RT[p]||{};if(type==='child_removed')delete __RT[p][key];else __RT[p][key]=o;for(const fn of listeners.get(p+'|'+type)||[])fn({key,val:()=>o})};
firebase.database=function(){const db=D();const old=db.ref;db.ref=function(p){const r=old(p),once=r.once; r.once=function(...a){__READS[p]=(__READS[p]||0)+1;return once.apply(r,a)};const on=r.on;r.on=function(ev,fn,err){if(!ev.startsWith('child_'))return on.call(r,ev,fn,err);const k=p+'|'+ev;if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);if(ev==='child_added')Object.entries(__RT[p]||{}).forEach(([key,o])=>fn({key,val:()=>o}));return fn};r.off=function(ev,fn){if(ev)listeners.get(p+'|'+ev)?.delete(fn);else for(const [k,v] of listeners)if(k.startsWith(p+'|'))v.clear()};return r};return db};firebase.database.ServerValue={TIMESTAMP:0};
})();`;
// Chỉ dữ liệu giả; mọi mạng ngoài loopback bị chặn.
mock+=`
(function(){const t=new Date(),y=new Date(t);y.setDate(y.getDate()-1);const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),today=key(t),yesterday=key(y);const at=(d,h,m)=>{const v=new Date(d);v.setHours(h,m,0,0);return v.toISOString()};
__FS.inventory_items_gieogieo={milk:{name:'Sữa',unit:'g',costPerUnit:100,currentStock:100000,stockManaged:true,active:true}};
__FS.employees_gieogieo={e1:{fullName:'Người đã nghỉ',active:false,payType:'hourly_part',hourlyRate:20000},e2:{fullName:'Nhân viên hiện tại',active:true,payType:'hourly_full',hourlyRate:20000,otEnabled:true,otThresholdHours:8,otRate:25000}};
__FS.employee_shifts_gieogieo={a:{employeeId:'e1',businessDate:yesterday,checkedInAt:at(y,8,0),checkedOutAt:at(y,12,0)},b:{employeeId:'e2',businessDate:yesterday,checkedInAt:at(y,9,30),checkedOutAt:at(y,20,0)}};
__FS.hr_settings_gieogieo={current:{useActualLaborCost:true}};
__FS.work_schedules_gieogieo={today:{employeeId:'e2',date:today,startTime:'09:30',endTime:'20:00',isOff:false}};
__FS.assets_gieogieo={a:{purchaseDate:yesterday,purchaseCost:1200000,usefulLifeMonths:12,active:true}};
__FS.expense_categories_gieogieo={ice:{label:'Nước đá',active:true,costType:'variable'}};
__FS.expenses_gieogieo={ice:{date:today,amount:20000,category:'Nước đá',status:'approved',source:'pos',baseType:'cash'}};
__FS.purchase_orders_gieogieo={p1:{storeId:'gg01',supplier:'Nhà cung cấp <b>ABC</b>',createdAt:t.toISOString(),status:'received',lines:[{itemId:'milk',name:'Sữa',unit:'g',qtyExpectedBase:50000,receivedGoodBase:50000,unitPriceBase:100}]}};
})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':'/usr/bin/chromium')});let count=0;
 const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
 try{for(const width of [1366,1024,853,390]){
 const p=await b.newPage({viewport:{width,height:1000},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const url=r.request().url();if(url.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(url.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(url.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/quanlygieo.html');await p.waitForFunction(()=>!_todayBusy&&!!_todayLiveCtx?.pl);
 const before=await p.evaluate(()=>({profit:_todayLiveCtx.pl.lai,reads:JSON.stringify(__READS)}));
 check(await p.evaluate(()=>Math.abs(_todayLiveCtx.pl.luong-222500)<.01),width+': lịch một nhân viên 9:30–20:00 dự toán đúng 222.500đ');
 check(await p.locator('#todayCashFlow .recorded-cash-widget').isVisible(),width+': dòng tiền đứng riêng với lãi/lỗ');
 await p.evaluate(()=>goKho('po'));await p.waitForSelector('button[onclick^="openPoPayment"]');await p.click('button[onclick^="openPoPayment"]');await p.waitForSelector('#poPayAmount');
 check(await p.locator('#poPayAmount').isVisible(),width+': ghi trả NCC từ đúng đơn đặt hàng');
 await p.fill('#poPayAmount','5000000');await p.evaluate(()=>{submitPoPayment();submitPoPayment()});
 await p.waitForFunction(()=>Object.values(__FS.expenses_gieogieo).some(e=>e.source==='po_payment'));
 check(await p.evaluate(()=>Object.values(__FS.expenses_gieogieo).filter(e=>e.source==='po_payment').length===1),width+': bấm lặp chỉ có một khoản trả NCC');
 check(await p.evaluate(()=>{const e=Object.values(__FS.expenses_gieogieo).find(e=>e.source==='po_payment');return e.amount===5000000&&e.purchaseOrderId==='p1'&&e.accountingTreatment==='inventory_purchase'&&e.baseType==='bank'&&!!e.paidDate}),width+': tiền trả lưu đủ ngày/nguồn/liên kết PO');
 await p.evaluate(()=>switchScreen('today'));await p.waitForFunction(()=>!_todayBusy&&!!_todayLiveCtx?.pl);
 check(await p.evaluate(v=>Math.abs(_todayLiveCtx.pl.lai-v.profit)<.01,before),width+': trả hàng 5 triệu không làm lãi/lỗ tụt 5 triệu');
 check(await p.locator('#todayCashFlow').innerText().then(t=>t.includes('5.020.000')&&t.includes('Không phải lợi nhuận')),width+': dòng tiền vẫn ghi tiền mua hàng và mua đá');
 await p.evaluate(()=>switchScreen('thangket'));await p.waitForSelector('.month-owner-summary');
 check(await p.locator('.month-owner-summary .wkpi').count()===3,width+': ba chỉ số quản trị, không trộn thu trừ chi vào kết quả kinh doanh');
 check(await p.locator('.recorded-cash-widget .kmlabel').allTextContents().then(a=>a.includes('Thu vào')&&a.includes('Chi ra đã ghi nhận')&&!a.includes('Thu − chi đã ghi')),width+': tiền thu vào và chi ra có ô riêng');
 check(await p.locator('details.month-dept').count()===4&&await p.locator('details.month-dept[open]').count()===0,width+': chi tiết kế toán/HR/kho/bán hàng mặc định thu gọn');
 check(await p.evaluate(()=>thangKetData.emps.some(e=>e.id==='e1'&&e.active===false)),width+': không bỏ người đã nghỉ có công trong tháng');
 check(await p.locator('#thangKetBody').innerText().then(t=>t.includes('Việc cần quyết định')&&t.includes('Dòng tiền tháng đã ghi nhận')),width+': có việc chủ quán cần quyết định và dòng tiền riêng');
 await p.click('#monthHRDetails>summary');await p.evaluate(()=>thangKetRedraw());
 check(await p.locator('#monthHRDetails').getAttribute('open')!==null,width+': vẽ lại giữ phần HR đang mở');
 const reads=await p.evaluate(()=>({fs:JSON.stringify(__FSREADS),rt:JSON.stringify(__READS)}));
 check(await p.evaluate(()=>{for(let i=0;i<monthMetricRegistry.length;i++){const x=monthMetricRegistry[i];openMonthMetric(i);if(!document.querySelector('.report-explanation')?.textContent.includes(x.formula))return false;closeEditSheet(true)}return true}),width+': các số quản trị/kế toán/HR/kho/bán hàng mở giải thích từ dữ liệu đã nạp');
 check(await p.evaluate(()=>{const id=monthMetricRegistry.findIndex(x=>x.label.includes('Nhân viên hiện tại')&&x.label.includes('Lương tính'));if(id<0)return false;openMonthMetric(id);const text=document.querySelector('.report-explanation').textContent,ok=text.includes('222.500')&&text.includes('20.000')&&text.includes('25.000')&&text.includes('2,5');closeEditSheet(true);return ok}),width+': giải thích lương có công 10,5h/OT 2,5h và đơn giá 20K/25K theo ngày');
 check(await p.locator('#monthFinanceDetails .rv').evaluateAll(xs=>xs.every(x=>!!x.querySelector('button'))),width+': số ở các dòng kế toán đều có giải thích');
 const download=p.waitForEvent('download');await p.click('button[onclick="downloadMonthOwnerReport()"]');const out=await download;fs.mkdirSync(ROOT+'/work/bao-cao-dieu-hanh',{recursive:true});const file=ROOT+'/work/bao-cao-dieu-hanh/report-'+width+'.html';await out.saveAs(file);const html=fs.readFileSync(file,'utf8');
 check(html.includes('BÁO CÁO THÁNG')&&html.includes('Phạm vi:')&&html.includes('KẾT QUẢ QUẢN TRỊ TRƯỚC KHẤU HAO')&&html.includes('ĐỐI CHIẾU KẾ TOÁN')&&html.includes('Thu vào theo bill:')&&html.includes('Chi ra đã ghi nhận:')&&html.includes('In / lưu PDF')&&!html.includes('firebaseConfig')&&!html.includes('<script'),width+': tải báo cáo có quản trị/kế toán/thu/chi riêng, in PDF, không mang mã Firebase');
 check(await p.evaluate(v=>v.fs===JSON.stringify(__FSREADS)&&v.rt===JSON.stringify(__READS),reads),width+': mở chi tiết/xuất báo cáo không đọc Firebase');
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),width+': không tràn ngang báo cáo');
 // Bộ số minh hoạ giả để kiểm số tiền dài và đủ ba trạng thái của giao diện.
 await p.evaluate(()=>{
  window.__reportFixtureOriginal=thangKetData;
  const r={stage:'recovery',capital:100000000,opening:30000000,closing:40300000,remaining:59700000,pct:40.3,recoveryContribution:10300000,operatingSurplus:0,reached:null};
  thangKetData={...thangKetData,recovery:r,plTong:{...thangKetData.plTong,doanhThu:22500000,giaVon:6800000,luong:4100000,chiPhiCoDinh:500000,bienPhiKhac:100000,phiKenh:400000,haoHut:300000,khauHao:3100000,tongChiPhi:15300000,lai:7200000,laiTruocKhauHao:10300000}};
  document.querySelectorAll('details.month-dept').forEach(el=>el.open=false);thangKetRedraw();
 });
 check(await p.locator('.month-owner-summary .wkpi').last().innerText().then(t=>t.includes('Góp thu hồi vốn kỳ này')&&t.includes('10.300.000')),width+': giai đoạn 1 ưu tiên góp vốn trước khấu hao');
 check(await p.locator('.month-profit-bridge .is-result').innerText().then(t=>t.includes('10.300.000'))&&await p.locator('.month-profit-bridge').innerText().then(t=>t.includes('Giá vốn nguyên liệu')&&t.includes('Tiền lương')&&t.includes('Phí kênh')),width+': bảng giải thích cộng trừ ra đúng chỉ số quản trị');
 check(await p.evaluate(()=>[...document.querySelectorAll('.month-owner-summary .wkpi .report-money-number')].every(el=>{const r=document.createRange();r.selectNodeContents(el);const b=r.getBoundingClientRect(),c=el.closest('.wkpi').getBoundingClientRect();return r.getClientRects().length===1&&b.right<=c.right&&b.left>=c.left})),width+': đủ chữ số trên một dòng, không rơi chữ số hoặc tràn thẻ');
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),width+': số tiền dài không làm tràn ngang');
 await p.screenshot({path:ROOT+'/work/bao-cao-dieu-hanh/month-stage-recovery-'+width+'.png',fullPage:true});
 await p.evaluate(()=>{thangKetData.recovery={...thangKetData.recovery,stage:'operating',reached:thangKetData.startKey,recoveryContribution:0,operatingSurplus:10300000};thangKetRedraw()});
 check(await p.locator('.month-owner-summary .wkpi').last().innerText().then(t=>t.includes('Thặng dư vận hành')&&t.includes('10.300.000'))&&await p.locator('.month-stage-summary').innerText().then(t=>t.includes('Giai đoạn 2')),width+': sau hoàn vốn ưu tiên thặng dư, vẫn trước khấu hao');
 await p.evaluate(()=>{thangKetData.recovery={...thangKetData.recovery,stage:'transition',recoveryContribution:4000000,operatingSurplus:6300000};thangKetRedraw()});
 check(await p.locator('.month-stage-summary').innerText().then(t=>t.includes('Tháng chuyển')&&t.includes('4.000.000')&&t.includes('6.300.000')),width+': tháng chuyển giai đoạn tách góp vốn và thặng dư');
 await p.evaluate(()=>{thangKetData=__reportFixtureOriginal;thangKetRedraw()});
 if(width===1366){
  await p.evaluate(()=>{window.__originalFetch=fetchSalesRange;let first=true;fetchSalesRange=async(...a)=>{if(first){first=false;window.__gated=true;await new Promise(ok=>window.__release=ok)}return __originalFetch(...a)};window.__oldMonth=renderThangKet()});
  await p.waitForFunction(()=>window.__gated);
  const race=await p.evaluate(async()=>{const prev=new Date();prev.setMonth(prev.getMonth()-1);thangKetMonth=dkey(prev).slice(0,7);const expected=thangKetMonth;await renderThangKet();__release();await __oldMonth;fetchSalesRange=__originalFetch;return thangKetData.startKey.slice(0,7)===expected&&document.querySelector('.month-owner-summary').textContent.includes('tháng '+Number(expected.slice(5)))});
  check(race,width+': lượt nạp tháng cũ không ghi đè báo cáo tháng vừa chọn');
  check(await p.evaluate(()=>{const old=thangKetData.storeId;thangKetData.storeId='gg02';const blocked=currentMonthReportData()===null;thangKetData.storeId=old;return blocked}),width+': chặn xuất số của quán cũ sau khi đổi quán');
 }
 check(errors.length===0,width+': không lỗi JS '+errors.join('|'));
 await p.close();}
 console.log('ALL PASS '+count);
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
