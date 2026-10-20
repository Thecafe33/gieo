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
mock+=`(function(){const F=firebase.firestore;const wrap=function(){const f=F(),coll=f.collection;window.__daySubs=[];f.collection=n=>{const c=coll(n),doc=c.doc;c.doc=id=>{const r=doc(id);if(n.startsWith('daily_closings_gieogieo'))r.onSnapshot=(on)=>{const sub={n,id,on,active:true};__daySubs.push(sub);r.get().then(on);return()=>sub.active=false};return r};return c};return f};Object.assign(wrap,F);firebase.firestore=wrap;window.__dayEmit=(n,status)=>__daySubs.filter(s=>s.active&&s.n===n).forEach(s=>s.on({exists:true,data:()=>({status})}));})();`;
mock+=`{const d=new Date(),k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');__FS.daily_closings_gieogieo={[k]:{status:'closed'}};}`;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [1366,390]){
const p=await b.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);await p.waitForTimeout(300);
assert.equal(await p.locator('.outlet-widgets [data-store="gg01"] .widget-day-closed').count(),1,'mở trang khi quán đã đóng vẫn phải hiện nhãn sau tải bill');
const before=await p.locator('.outlet-widgets [data-store="gg01"] .widget-revenue-value').textContent();
await p.evaluate(()=>__dayEmit('daily_closings_gieogieo','handed_over'));assert.equal(await p.locator('.widget-day-closed').count(),0);
await p.evaluate(()=>__dayEmit('daily_closings_gieogieo','closed'));assert.equal(await p.locator('.outlet-widgets [data-store="gg01"] .widget-day-closed').textContent(),'Đã đóng quán');assert.equal(await p.locator('.outlet-widgets .is-day-closed').count(),1);
assert.equal(await p.locator('.outlet-widgets [data-store="gg01"] .widget-revenue-value').textContent(),before);
const readCounts=await p.evaluate(()=>({subs:__daySubs.length,fs:JSON.stringify(__FSREADS),rt:JSON.stringify(__READS)}));
await p.evaluate(()=>bfStatsPaint('gg01'));
assert.equal(await p.locator('.outlet-widgets [data-store="gg01"] .widget-day-closed').count(),1,'bill RT cập nhật không làm mất nhãn đóng quán');
assert.equal(await p.locator('.outlet-widgets [data-store="gg01"].is-day-closed').count(),1,'bill RT cập nhật không làm mất màu đóng quán');
assert.deepEqual(await p.evaluate(()=>({subs:__daySubs.length,fs:JSON.stringify(__FSREADS),rt:JSON.stringify(__READS)})),readCounts,'giữ nhãn từ bộ nhớ, không đọc lại Firebase');
await p.evaluate(()=>render());assert.equal(await p.locator('.outlet-widgets .is-day-closed').count(),1);
await p.evaluate(()=>__dayEmit('daily_closings_gieogieo','pending'));assert.equal(await p.locator('.widget-day-closed').count(),0);
await p.evaluate(()=>setStore('xofa'));assert(await p.evaluate(()=>__daySubs.every(s=>!s.active)));
assert.deepEqual(errs,[]);console.log('ok '+width+': đóng đúng quán, nhạt màu/tag, đóng sẵn khi tải, cập nhật bill RT giữ nhãn/màu không đọc thêm, mở lại và gỡ listener');await p.close();}
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
