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

// Bốn unit giả: đang thu hồi / đã hoàn vốn / đã ngừng nhưng có bán / đọc lỗi.
mock+=`
(function(){const t=new Date(),key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const start=key(new Date(t.getFullYear(),t.getMonth(),1)),prior=key(new Date(t.getFullYear(),t.getMonth(),0)),today=key(t),mk=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][t.getMonth()],dd=String(t.getDate()).padStart(2,'0');
__FS.stores_gieogieo={gg01:{name:'Unit A',active:true},gg02:{name:'Unit B',active:true},gg03:{name:'Unit cũ',active:false},gg04:{name:'Unit lỗi',active:true}};
__FS.employees_gieogieo={};__FS.employee_shifts_gieogieo={};__FS.work_schedules_gieogieo={};
__FS.config_history_gieogieo={c:{effectiveFrom:'2020-01-01',targets:{cogsPct:30},labor:{fulltimeCost:0,parttimeHourly:0,parttimeCount:0,parttimeHoursPerPerson:0}}};
for(const id of ['gg01','gg02','gg03','gg04']){const suf=id==='gg01'?'':'__'+id;__FS['assets_gieogieo'+suf]={a:{purchaseCost:id==='gg02'?1000:1000000,purchaseDate:id==='gg02'?prior:start,usefulLifeMonths:12,active:true}};__FS['finance_gieogieo'+suf]={current:{recoveryStartDate:id==='gg02'?prior:start,...(id==='gg02'?{recoveryReachedDate:prior,recoveryReachedCapital:1000}:{})}};__FS['inventory_items_gieogieo'+suf]=__FS.inventory_items_gieogieo;
if(id==='gg01'||id==='gg02'){const d={};for(let x=new Date((id==='gg02'?prior:start)+'T12:00:00');key(x)<=today;x.setDate(x.getDate()+1))d[key(x)]={date:key(x),lai:0,khauHao:0,luong:0,chiPhiCoDinh:0,bienPhiKhac:0,laborVersion:1,laborCheckedAmount:0,iceVersion:1,iceCheckedExpenseAmount:0,updatedAt:t.toISOString()};__FS['pl_book_gieogieo'+suf]={days:{du:id==='gg02'?prior:start,d}};}}
__FS.expenses_gieogieo__gg02={p:{date:today,paidDate:today,amount:50000,category:'Thanh toán nguyên liệu',accountingTreatment:'inventory_purchase',amountKind:'actual',status:'approved',source:'po_payment',baseType:'bank'}};
__RT['orders_gieogieo__gg03/'+mk+'/'+dd]={a:{total:50000,method:'TIỀN MẶT',date:dd+'/'+String(t.getMonth()+1).padStart(2,'0')+'/'+t.getFullYear(),time:'10:00'}};
for(const [id,total] of [['gg01',155000],['gg02',30000],['gg03',50000]])__RT['orders_gieogieo'+(id==='gg01'?'':'__'+id)+'/'+mk+'/'+dd]={a:{total,method:'TIỀN MẶT',date:dd+'/'+String(t.getMonth()+1).padStart(2,'0')+'/'+t.getFullYear(),time:'10:00',itemsArray:[{itemId:'fake',name:'Món giả lập',size:'M',qty:1,price:total}]}};
const F=firebase.firestore;const nf=function(){const f=F(),coll=f.collection;f.collection=function(c){const q=coll(c);if(c==='assets_gieogieo__gg04')q.get=()=>Promise.reject(new Error('Lỗi đọc giả lập'));return q};return f};Object.assign(nf,F);firebase.firestore=nf;
})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});

(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':'/usr/bin/chromium')});let count=0;
 const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
 try{for(const width of [1366,853,390]){
 const p=await b.newPage({viewport:{width,height:1000},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('ql_view_store_v1','all'));
 await p.route('**/*',r=>{const url=r.request().url();if(url.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(url.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(url.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/quanlygieo.html');await p.waitForFunction(()=>typeof switchScreen==='function'&&QL_STORES.length>0);await p.evaluate(()=>switchScreen('thangket'));
 await p.waitForFunction(()=>!!chainMonthData&&chainMonthData.range.month===thangKetMonth,{},{timeout:60000});
 check(await p.evaluate(()=>curScreen==='thangket'),width+': Xem tất cả mở đúng báo cáo tháng mới');
 check(await p.evaluate(()=>chainMonthData.model.good.length===3&&chainMonthData.model.errors.length===1),width+': tách unit đọc lỗi khỏi các unit có số');
 const summary=await p.evaluate(()=>{const m=chainMonthData.model;return {revenue:m.revenue,result:m.contribution,rec:m.recovery,surplus:m.surplus,other:m.unclassified,stages:m.good.map(u=>[u.st.id,u.recovery?.stage])}});
 check(summary.revenue===235000&&Math.abs(summary.result-164500)<.01,width+': tổng doanh thu/kết quả đúng ba unit, không lẫn điểm');
 check(Math.abs(summary.rec-108500)<.01&&Math.abs(summary.surplus-21000)<.01&&Math.abs(summary.other-35000)<.01,width+': phần góp vốn/thặng dư/chưa phân loại khớp tổng');
 check(await p.locator('.chain-month-kpis .wkpi').count()===6,width+': số quan trọng nằm đầu trang');
 check(await p.locator('.chain-month-kpis').innerText().then(t=>t.includes('Nguồn mở rộng')&&t.includes('Chưa đủ số liệu')),width+': không gọi kết quả quản trị là tiền mở rộng đã xác nhận');
 check(await p.locator('.chain-month-table').innerText().then(t=>t.includes('Unit cũ')&&t.includes('đã ngừng')&&t.includes('Unit lỗi')),width+': giữ quán ngừng có bán và dòng quán đọc lỗi');
 const reads=await p.evaluate(()=>JSON.stringify([__FSREADS,__READS]));
 check(await p.evaluate(()=>{for(let i=0;i<monthMetricRegistry.length;i++){openMonthMetric(i);const x=monthMetricRegistry[i],el=document.querySelector('.report-explanation');if(!el||!el.textContent.includes(x.formula))return false;closeEditSheet(true)}return true}),width+': mọi chỉ số đăng ký mở được giải thích có công thức và thành phần');
 check(await p.evaluate(()=>{chainMonthFilter='operating';chainMonthSort='name';drawChainMonth();return document.querySelector('.chain-month-table tbody').textContent.includes('Unit B')&&!document.querySelector('.chain-month-table tbody').textContent.includes('Unit A')}),width+': lọc giai đoạn và sắp xếp dùng số đã nạp');
 await p.evaluate(()=>{chainMonthFilter='all';chainMonthSort='result';drawChainMonth()});
 await p.evaluate(()=>renderThangKetAll());
 check(await p.evaluate(v=>JSON.stringify([__FSREADS,__READS])===v,reads),width+': bấm thông số/lọc/sắp xếp/mở lại báo cáo trong đệm không đọc Firebase');
 await p.locator('.chain-month-table .report-metric-button').filter({hasText:'108.500'}).first().click();await p.waitForSelector('#editSheetWrap.open');
 check(await p.locator('.report-explanation').innerText().then(t=>t.includes('Doanh thu')&&t.includes('Giá vốn')&&t.includes('chưa trừ khấu hao')),width+': bấm số thật mở popup giải thích cộng/trừ đúng unit');
 check(await p.locator('.edit-sheet-body').evaluate(el=>el.scrollWidth<=el.clientWidth+2),width+': popup giải thích không tràn ngang');
 await p.screenshot({path:ROOT+'/work/bao-cao-chuoi/explain-'+width+'.png'});await p.evaluate(()=>closeEditSheet(true));
 const dl=p.waitForEvent('download');await p.evaluate(()=>chainMonthExport(false));const out=await dl;fs.mkdirSync(ROOT+'/work/bao-cao-chuoi',{recursive:true});const target=ROOT+'/work/bao-cao-chuoi/report-'+width+'.html';await out.saveAs(target);const html=fs.readFileSync(target,'utf8');
 check(html.includes('BÁO CÁO CHUỖI')&&html.includes('ĐỌC LỖI')&&html.includes('chưa đủ sổ điều chuyển')&&!html.includes('firebaseConfig'),width+': tải báo cáo chuỗi nêu phạm vi/thiếu số/quỹ');
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),width+': bảng cuộn riêng, trang không tràn ngang');
 check(await p.evaluate(()=>GieoData.storeId()===null),width+': ra khỏi từng unit trả lại scope tất cả');
 check(await p.evaluate(()=>!__WRITES.some(w=>JSON.stringify(w).includes('pl_book_gieogieo')||JSON.stringify(w).includes('recoveryReachedDate'))),width+': xem báo cáo chuỗi không ghi snapshot/mốc vốn');
 await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:ROOT+'/work/bao-cao-chuoi/chain-'+width+'.png',fullPage:true});
 if(width===1366){
  const cache=await p.evaluate(async()=>{window.__chainOriginal=chainMonthData;const old=loadExpenseCategories;loadExpenseCategories=async()=>{throw new Error('Lỗi danh mục chi phí giả lập')};try{await renderThangKetAll(true)}finally{loadExpenseCategories=old}return chainMonthData.model.good.length===0&&chainMonthData.model.errors.length===4&&document.querySelector('.chain-month-kpis').textContent.includes('Chưa đủ số liệu')&&!document.querySelector('.recorded-cash-widget')});
  check(cache,width+': tất cả unit lỗi không biến thành doanh thu/tiền bằng 0');
  const emptyDownload=p.waitForEvent('download');await p.evaluate(()=>chainMonthExport(false));const emptyOut=await emptyDownload;await emptyOut.saveAs(ROOT+'/work/bao-cao-chuoi/report-missing.html');
  check(fs.readFileSync(ROOT+'/work/bao-cao-chuoi/report-missing.html','utf8').includes('Doanh thu từ unit đọc được: Chưa đủ số liệu'),width+': bản tải cũng giữ rõ số chưa biết');
  await p.evaluate(()=>{chainMonthData=__chainOriginal;drawChainMonth();window.__originalChainLoader=chainMonthLoadUnit;let first=true;chainMonthLoadUnit=async(...a)=>{if(first){first=false;window.__chainGated=true;await new Promise(ok=>window.__chainRelease=ok)}return __originalChainLoader(...a)};window.__oldChain=renderThangKetAll(true)});
  await p.waitForFunction(()=>window.__chainGated);
  const race=await p.evaluate(async()=>{const prev=new Date();prev.setMonth(prev.getMonth()-1);thangKetMonth=dkey(prev).slice(0,7);const expected=thangKetMonth;await renderThangKetAll(true);__chainRelease();await __oldChain;chainMonthLoadUnit=__originalChainLoader;return chainMonthData.range.month===expected&&document.querySelector('#thangKetMonthInput').value===expected&&GieoData.storeId()===null});
  check(race,width+': tháng cũ trả chậm không ghi đè tháng mới, scope vẫn tất cả');
 }
 check(errors.length===0,width+': không lỗi JS '+errors.join('|'));await p.close();}
 console.log('ALL PASS '+count);
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
