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
mock+=`
if(location.pathname.includes('quanlygieo')){const t=new Date(),y=new Date(t);y.setDate(y.getDate()-1);const k=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 __FS.assets_gieogieo={a:{purchaseCost:10000000,purchaseDate:k(y),usefulLifeMonths:12,active:true}};
 __FS.finance_gieogieo={current:{recoveryStartDate:k(y)}};
 // Ngày trước có thặng dư dương đủ lớn để kịch bản dự kiến hoàn vốn có số tháng,
 // thay vì null hợp lệ khi chi phí hiện tại làm tốc độ hai ngày không dương.
 __FS.pl_book_gieogieo={days:{du:k(y),d:{[k(y)]:{date:k(y),doanhThu:5000000,giaVon:1000000,phiKenh:0,haoHut:0,luong:200000,chiPhiCoDinh:0,bienPhiKhac:0,khauHao:30000,lai:3770000,laiTruocKhauHao:3800000,mucTinCay:'chot-thang',laborVersion:2,laborCheckedAmount:200000,updatedAt:t.toISOString()}}}};
}`;
// Từ 01/10 phải có lịch mới tính lương. Fixture cũ có chấm công nhưng thiếu lịch,
// nên kiểm RT vô tình dừng đúng ở cảnh báo nghiệp vụ này, không tới phần lãi/lỗ.
mock+=`for(const suffix of ['tc33','xofa','gieogieo']){const table=__FS['work_schedules_'+suffix]||(__FS['work_schedules_'+suffix]={});for(const sh of Object.values(__FS['employee_shifts_'+suffix]||{})){table[sh.employeeId+'_'+sh.businessDate]={employeeId:sh.employeeId,date:sh.businessDate,startTime:'00:00',endTime:'23:59',isOff:false};}}`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
mock+=`
firebase.firestore.FieldPath={documentId:()=> '__name__'};
(function(){const F=firebase.firestore;const wrap=function(){const f=F();f.runTransaction=async fn=>{const pending=[];await fn({get:r=>r.get(),set:(r,d,o)=>pending.push(()=>r.set(d,o))});for(const write of pending)await write()};return f};Object.assign(wrap,F);firebase.firestore=wrap;})();
const today=new Date(),date=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'),mon=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][today.getMonth()],day=String(today.getDate()).padStart(2,'0');
__FS.revenue_targets_tc33xofa.breakeven={m:{'2026-10':{tc33:{fixed:31000000},xofa:{fixed:15500000}}}};
__RT.menu={c:{name:'Cà phê',type:'Cà phê',priceM:25000,priceL:30000},t:{name:'Trà',type:'Trà',priceM:20000,priceL:30000},b:{name:'1h bed',type:'Khác',priceM:15000},f:{name:'Bánh',type:'Ăn vặt',priceM:10000}};
__RT.menu_xolifa={c:{name:'Cà phê',type:'Cà phê',priceM:20000,priceL:25000}};
__RT.menu_togo_xolifa={c:{name:'Cà phê',type:'Cà phê',priceM:18000,priceL:22000}};
__RT.toppings_xolifa={p:{name:'Trân châu',price:5000,priceTogo:3000}};
__RT['orders/'+today.getFullYear()+'/'+mon+'/'+day]={a:{total:65000,createdAt:today.toISOString(),method:'Tiền mặt',itemsArray:[{name:'Cà phê',size:'M',qty:2,price:25000},{name:'Cà phê',size:'M',qty:1,price:0},{name:'1h bed',size:'M',qty:1,price:15000}]},z:{total:0,createdAt:today.toISOString(),itemsArray:[{name:'Trà',size:'L',qty:1,price:0}]}};
const vn=day+'/'+String(today.getMonth()+1).padStart(2,'0')+'/'+today.getFullYear();
__RT['orders_xolifa/'+mon+'/'+day]={a:{total:40000,date:vn,time:'10:00',method:'TIỀN MẶT',itemsArray:[{name:'Cà phê',size:'M',qty:2,price:20000,toppings:[{name:'Trân châu',price:0}]}]},z:{total:0,date:vn,time:'11:00',isToGo:true,itemsArray:[{name:'Cà phê (Tặng)',size:'M',qty:1,price:0,toppings:[{name:'Trân châu',price:0}]}]}};
`;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [width,height] of [[1440,900],[1366,768],[1024,768],[390,844]]){
 const p=await b.newPage({viewport:{width,height},timezoneId:'Asia/Ho_Chi_Minh'}),errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);await p.waitForTimeout(300);
 const check=(v,m)=>{assert.ok(v,m);console.log('ok '+width+'x'+height+': '+m)};
 const saveAndReturn=async()=>{await p.locator('#mc-save').click();await p.waitForFunction(()=>!MC_EDITOR.dirty&&!$('#mc-save').disabled);await p.evaluate(()=>navigate('rev'));await p.waitForFunction(()=>state.view==='rev'&&live.ready.rev===loadKey()&&!live.loadingKey)};
 check(await p.evaluate(()=>!__READS.menu_xolifa&&!__READS.menu_togo_xolifa&&!__READS.toppings_xolifa),'không tự tải menu XOFA khi xem tổng quan');
 check(await p.locator('.outlet-widget .widget-cogs').count()===0,'widget quán không còn dòng hoặc đường dẫn COGS');
 await p.locator('#nav [onclick="navigate(\'cogs\')"]').evaluate(el=>el.click());await p.waitForFunction(()=>MC_EDITOR?.id==='tc33'&&live.ready.cogs===loadKey());
 check(await p.locator('#view .mc-editor').count()===1&&await p.locator('#dialog').evaluate(el=>!el.open),'COGS có tab riêng trong sidebar, bảng nằm trên trang, không dùng popup');
 check(await p.evaluate(()=>!__READS.menu_xolifa&&!__READS.menu_togo_xolifa),'mở COGS TC33 chưa tải menu XOFA');
 check(await p.locator('[data-mc-cost]').count()===4,'TC33 chỉ 4 ô hai size, không có bed/Food');
 await p.locator('#mc-enabled').check();await p.locator('#mc-save').click();await p.waitForTimeout(80);check((await p.locator('#mc-save-state').textContent()).includes('nhập đủ'),'không cho bật khi chưa đủ menu');
 await p.evaluate(()=>{for(const el of document.querySelectorAll('[data-mc-cost]')){const r=MC_EDITOR.rows[Number(el.dataset.mcCost)];el.value=r.name==='Cà phê'?(r.size==='M'?8000:10000):(r.size==='M'?7000:9000)}mcProgress()});
 check(await p.evaluate(()=>{const b=document.getElementById('mc-save').getBoundingClientRect();return b.bottom<=innerHeight&&b.top>=0}),'nút lưu luôn thấy trên PC/mobile');
 await saveAndReturn();await p.waitForTimeout(100);
 let c=await p.evaluate(()=>storeRange(stores.find(s=>s.id==='tc33')));check(c.cogs.total===33000&&Math.abs(c.be.hoaVon-2031250)<.01,'giá vốn 33k có cả 3 ly tặng, hoà vốn đúng 2.031.250');
 check(Math.abs(c.cogs.total/c.rev*100-50.769230769)<.001,'COGS vẫn tính đúng 50,8% trong dữ liệu, không nới widget');
 await p.evaluate(()=>mcOpenDetails('tc33'));check((await p.locator('#dialogInner').textContent()).includes('Trong đó tặng'),'chi tiết vẫn giải thích giá vốn bằng số lượng thật');
 const reads=await p.evaluate(()=>JSON.stringify(__READS));await p.evaluate(()=>mcOpenDetails('tc33'));check(await p.evaluate(before=>JSON.stringify(__READS)===before,reads),'xem chi tiết COGS không đọc lại Firebase');
 await p.evaluate(()=>mcOpenEditor('xofa'));await p.waitForFunction(()=>MC_EDITOR?.id==='xofa');check(await p.locator('[data-mc-cost]').count()===6,'XOFA hai menu hai size và hai phần topping');
 await p.evaluate(()=>{for(const el of document.querySelectorAll('[data-mc-cost]')){const r=MC_EDITOR.rows[Number(el.dataset.mcCost)];el.value=r.kind==='topping'?(r.channel==='togo'?500:1000):r.channel==='togo'?6000:7000}document.getElementById('mc-enabled').checked=true;mcProgress()});
 await p.locator('[data-mc-tab="togo"]').click();check(await p.locator('[data-mc-row]:visible').count()===2,'lọc To Go ngay tại máy');
 await saveAndReturn();
 c=await p.evaluate(()=>storeRange(stores.find(s=>s.id==='xofa')));check(c.cogs.total===22500&&c.cogs.missing.length===0,'XOFA 22.500đ: đúng giá từng menu + topping miễn phí');
 check(await p.evaluate(()=>live.rev.beCfg._cogs.tc33.enabled&&live.rev.beCfg._cogs.xofa.enabled),'lưu XOFA không ghi đè TC33');
 const beforeRT=await p.evaluate(()=>({reads:JSON.stringify(__READS),fs:JSON.stringify(__FSREADS),total:storeRange(stores.find(s=>s.id==='xofa')).cogs.total}));
 await p.evaluate(()=>{const d=new Date(),date=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();__emit(backend.billPath('xofa',currentDate()),'child_added','GIFT_NEW',{total:0,isToGo:true,date,time:'12:00',itemsArray:[{name:'Cà phê',size:'M',price:0,qty:1}]})});
 await p.waitForFunction(v=>storeRange(stores.find(s=>s.id==='xofa')).cogs.total===v,beforeRT.total+6000);
 check(await p.evaluate(v=>JSON.stringify(__READS)===v.reads&&JSON.stringify(__FSREADS)===v.fs,beforeRT),'bill tặng realtime cập nhật COGS không đọc thêm');
 // Món cũ đã bán không còn trong menu: báo thiếu, mở giá vốn từ bill đã có trong RAM.
 await p.evaluate(()=>{const d=new Date(),date=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();__emit(backend.billPath('xofa',currentDate()),'child_added','OLD_ITEM',{total:10000,date,time:'12:05',itemsArray:[{name:'Món cũ',size:'M',price:10000,qty:1}]})});
 await p.waitForFunction(()=>storeRange(stores.find(s=>s.id==='xofa')).cogs.missing.length>0);
 check(await p.evaluate(()=>storeRange(stores.find(s=>s.id==='xofa')).be?.hoaVon===null),'không kết luận hoà vốn khi bill có món chưa nhập COGS');
 await p.evaluate(()=>mcOpenEditor('xofa'));await p.waitForFunction(()=>MC_EDITOR?.id==='xofa');
 check(await p.evaluate(()=>MC_EDITOR.rows.some(r=>r.name==='Món cũ'&&r.historical)),'cho nhập giá vốn món cũ từ bill đang xem, không đọc tra cứu thêm');
 await p.evaluate(()=>{for(const el of document.querySelectorAll('[data-mc-cost]'))if(MC_EDITOR.rows[Number(el.dataset.mcCost)].historical)el.value=9000});
 await saveAndReturn();
 check(await p.evaluate(()=>storeRange(stores.find(s=>s.id==='xofa')).cogs.missing.length===0),'bổ sung món cũ xong có thể tính đủ COGS');
 // Chủ quán chọn mốc hôm nay: không đổi mốc 01/10.
 await p.evaluate(()=>mcOpenEditor('tc33'));await p.waitForFunction(()=>MC_EDITOR?.id==='tc33');await p.evaluate(()=>{$('#mc-from').value=currentDate();mcLoadDate(currentDate());for(const el of document.querySelectorAll('[data-mc-cost]'))if(MC_EDITOR.rows[Number(el.dataset.mcCost)].name==='Cà phê')el.value=12000});await saveAndReturn();
 check(await p.evaluate(()=>{const c=live.rev.beCfg._cogs.tc33;return backend.mcVersion(c,'2026-10-01').from==='2026-10-01'&&backend.mcVersion(c,currentDate()).from===currentDate()&&c.versions.length===2}),'giữ mốc 01/10 riêng sau sửa giá hôm nay');
 await p.evaluate(()=>mcOpenEditor('tc33'));await p.waitForFunction(()=>MC_EDITOR?.id==='tc33');await p.locator('#mc-enabled').uncheck();await saveAndReturn();
 check(await p.evaluate(()=>storeRange(stores.find(s=>s.id==='tc33')).be.hoaVon===1000000),'tắt trở lại đúng hoà vốn cơ bản');
 await p.evaluate(()=>{for(let i=0;i<40;i++)__RT.menu['extra'+i]={name:'Món thử '+i,type:'Trà',priceM:25000,priceL:30000};mcOpenEditor('tc33',true)});await p.waitForFunction(()=>MC_EDITOR?.rows.length>60);
 const geometry=await p.evaluate(()=>{const save=$('#mc-save').getBoundingClientRect(),list=$('.mc-table-wrap'),b=list.getBoundingClientRect(),rows=$$('[data-mc-row]').filter(el=>{const r=el.getBoundingClientRect();return !el.hidden&&r.top>=b.top+43&&r.bottom<=b.bottom});return{listHeight:list.clientHeight,rows:rows.length,scroll:list.scrollHeight>list.clientHeight,saveVisible:save.top>=0&&save.bottom<=innerHeight-(innerWidth<=760?80:0),overflow:document.documentElement.scrollWidth>innerWidth}});
 console.log('geometry',width,height,JSON.stringify(geometry));
 check(geometry.saveVisible&&geometry.scroll,'menu dài vẫn thấy nút lưu, cuộn riêng danh sách');
 check(geometry.listHeight>=(width>760?340:240)&&geometry.rows>=(width>760?5:3),'bảng món chiếm phần lớn màn hình, hiện nhiều món đầy đủ');
 check(!geometry.overflow,'không làm trang tràn ngang trên PC/mobile');
 const readsDraft=await p.evaluate(()=>JSON.stringify(__READS));
 await p.locator('[data-mc-cost]').first().fill('12345');
 await p.locator('[data-mc-store="xofa"]').click();await p.waitForFunction(()=>MC_EDITOR?.id==='xofa'&&$('#mc-save'));
 await p.locator('[data-mc-store="tc33"]').click();await p.waitForFunction(()=>MC_EDITOR?.id==='tc33'&&$('#mc-save'));
 check(await p.locator('[data-mc-cost]').first().inputValue()==='12345','chuyển quán giữ nguyên ô đang nhập dở');
 check(await p.evaluate(v=>JSON.stringify(__READS)===v,readsDraft),'chuyển giữa hai menu đã tải không đọc thêm RT');
 p.once('dialog',d=>d.dismiss());await p.locator('[aria-label="Tải lại menu và giá vốn đã lưu"]').click();
 check(await p.locator('[data-mc-cost]').first().inputValue()==='12345'&&await p.evaluate(v=>JSON.stringify(__READS)===v,readsDraft),'huỷ tải lại giữ bản nháp và không đọc menu');
 // Menu đang tải về trễ không được thay bảng quán người dùng đã chuyển sang.
 await p.evaluate(()=>{window.__mcOriginal=backend.mcReadEditor;backend.mcReadEditor=(id,force)=>id==='xofa'&&force?new Promise(resolve=>{window.__mcResume=()=>__mcOriginal(id,false).then(resolve)}):__mcOriginal(id,force);mcOpenEditor('xofa',true)});
 await p.waitForFunction(()=>typeof __mcResume==='function');
 await p.locator('[data-mc-store="tc33"]').click();await p.waitForFunction(()=>MC_EDITOR?.id==='tc33'&&$('#mc-save'));
 await p.evaluate(()=>{__mcResume();backend.mcReadEditor=__mcOriginal});await p.waitForTimeout(80);
 check(await p.locator('[data-mc-cost]').first().inputValue()==='12345'&&await p.evaluate(()=>MC_EDITOR.id==='tc33'&&!live.loadingKey),'kết quả tải về trễ không ghi đè quán đang nhập');

 await p.locator('#mc-search').fill('không có món');check(await p.locator('#mc-empty').isVisible(),'bộ lọc rỗng báo rõ');await p.locator('#mc-search').fill('');
 const first=p.locator('[data-mc-cost]').first();await first.focus();await first.press('Enter');
 check(await p.evaluate(()=>document.activeElement===document.querySelectorAll('[data-mc-row]')[1].cells[1].querySelector('input')),'Enter chuyển đúng cột giá vốn sang món tiếp theo');
 await p.evaluate(()=>navigate('target'));await p.waitForFunction(()=>live.ready.target===loadKey());await p.evaluate(()=>navigate('cogs'));await p.waitForFunction(()=>live.ready.cogs===loadKey()&&$('#mc-save'));
 check(await p.locator('[data-mc-cost]').first().inputValue()==='12345','rời tab rồi quay lại vẫn giữ bản nháp trong phiên');
 await p.waitForTimeout(250);await p.screenshot({path:'/workspace/work/manage-cogs-tab-21-10/cogs-'+width+'x'+height+'.png'});

 check(errs.length===0,'không lỗi JS '+errs.join('|'));await p.close();
}}finally{await b.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
