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
 __FS.pl_book_gieogieo={days:{du:k(y),d:{[k(y)]:{date:k(y),doanhThu:1000000,giaVon:200000,phiKenh:0,haoHut:0,luong:200000,chiPhiCoDinh:0,bienPhiKhac:0,khauHao:30000,lai:570000,laiTruocKhauHao:600000,mucTinCay:'chot-thang',updatedAt:t.toISOString()}}}};
}`;
mock+=`(function(){const F=firebase.firestore;const nf=function(){const f=F(),coll=f.collection;f.collection=function(c){const q=coll(c),doc=q.doc;q.doc=function(id){const r=doc(id);r.onSnapshot=(fn)=>{let active=true;r.get().then(s=>{if(active)fn(s)});return()=>{active=false}};return r};return q};return f};Object.assign(nf,F);firebase.firestore=nf})();`;
mock+=`for(let i=2;i<=16;i++)__FS.stores_gieogieo['gg'+String(i).padStart(2,'0')]={name:'Gieo Nguyễn Văn '+i,active:true};`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});

(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const b=await chromium.launch({executablePath:'/usr/bin/chromium'});let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
try{for(const width of [1366,390]){
const p=await b.newPage({viewport:{width,height:850},timezoneId:'Asia/Ho_Chi_Minh'});
await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);await p.waitForTimeout(500);

await p.locator('#outletButton').click();await p.waitForTimeout(220);
check(await p.locator('#storeDropdown.is-open').count()===1,width+': dropdown opens');
check(await p.evaluate(()=>document.querySelector('#storeSearch').getBoundingClientRect().top<document.querySelector('#storeChoices').getBoundingClientRect().top),width+': search stays above list');
check(await p.locator('#dialog').evaluate(e=>!e.open),width+': no modal');
check(await p.locator('.store-choice').count()>=16,width+': 16+ stores');
check(await p.locator('#storeChoices').evaluate(e=>e.scrollHeight>e.clientHeight),width+': bounded scroll');
const box=await p.locator('#storeDropdown').boundingBox();check(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=850,width+': fits viewport');
await p.locator('#storeSearch').fill('nguyen van 15');check(await p.locator('.store-choice').count()===1,width+': accent insensitive search');
await p.locator('#storeSearch').fill('GG12');await p.locator('#storeSearch').press('Enter');
check(await p.evaluate(()=>state.store==='gg12'),width+': Enter chooses point');check(await p.locator('#storeDropdown').getAttribute('aria-hidden')==='true',width+': closes after choosing');
await p.locator('#outletButton').click();await p.locator('#storeSearch').press('Escape');check(await p.locator('#outletButton').getAttribute('aria-expanded')==='false',width+': Escape closes');
await p.locator('#outletButton').click();await p.mouse.wheel(0,250);await p.waitForTimeout(200);check(await p.locator('#storeDropdown.is-open').count()===1,width+': scroll does not dismiss');
await p.screenshot({path:'/workspace/work/store-dropdown/'+width+'.png'});
await p.locator('#breadcrumb').evaluate(e=>e.click());check(await p.locator('#storeDropdown.is-open').count()===0,width+': outside click closes');
await p.close();}console.log('ALL PASS '+n)}finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
