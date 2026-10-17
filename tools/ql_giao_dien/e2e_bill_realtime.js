// Chromium thật + Firebase trong bộ nhớ, chặn mạng ngoài. Không chạm dữ liệu thật.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
mock+=`
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({put:()=>Promise.resolve()})});
(function(){const F=firebase.firestore;const nf=function(){const f=F();window.__FSREADS=window.__FSREADS||{};const coll=f.collection;const wrap=(q,c)=>{for(const method of ['where','orderBy','limit','doc'])if(q[method]){const fn=q[method];q[method]=(...a)=>wrap(fn.apply(q,a),c)}if(q.get){const get=q.get;q.get=(...a)=>{__FSREADS[c]=(__FSREADS[c]||0)+1;return get.apply(q,a)}}return q};f.collection=c=>wrap(coll(c),c);f.batch=()=>{const writes=[];return {set(ref,d,o){writes.push(()=>ref.set(d,o));return this},commit:()=>Promise.all(writes.map(fn=>fn()))}};f.collectionGroup=c=>f.collection(c);f.doc=p=>{const a=p.split('/');return f.collection(a[0]).doc(a[1]||'x')};f.runTransaction=()=>Promise.resolve();return f};Object.assign(nf,F);firebase.firestore=nf;
const D=firebase.database, listeners=new Map();window.__READS={};window.__emit=(p,type,key,o)=>{__RT[p]=__RT[p]||{};if(type==='child_removed')delete __RT[p][key];else __RT[p][key]=o;for(const fn of listeners.get(p+'|'+type)||[])fn({key,val:()=>o})};
firebase.database=function(){const db=D();const old=db.ref;db.ref=function(p){const r=old(p),once=r.once; r.once=function(...a){__READS[p]=(__READS[p]||0)+1;return once.apply(r,a)};const on=r.on;r.on=function(ev,fn,err){if(!ev.startsWith('child_'))return on.call(r,ev,fn,err);const k=p+'|'+ev;if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);if(ev==='child_added')Object.entries(__RT[p]||{}).forEach(([key,o])=>fn({key,val:()=>o}));return fn};r.off=function(ev,fn){if(ev)listeners.get(p+'|'+ev)?.delete(fn);else for(const [k,v] of listeners)if(k.startsWith(p+'|'))v.clear()};return r};return db};firebase.database.ServerValue={TIMESTAMP:0};
})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});let count=0;
 const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
 try{for(const width of [1366,390]){const p=await b.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text().slice(0,220))});
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);await p.waitForTimeout(2000);
 check(errors.length===0,'manage '+width+': mở không lỗi JS '+errors.join('|'));
 const before=await p.evaluate(()=>{window.__other=document.querySelector('[data-store="gg02"]');return{day:BF.day,gg:storeRange(stores.find(s=>s.id==='gg01')).rev,total:[...document.querySelectorAll('.overview-amount')][0].textContent,fsreads:{...__FSREADS},reads:{...__READS},path:backend.billPath('gg01',BF.day)}});
 await p.evaluate(({path})=>{const d=new Date(),date=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();__emit(path,'child_added','NEW',{total:45000,date,time:'10:05',createdAt:d.toISOString(),method:'TIỀN MẶT',itemsArray:[{id:'cf',name:'Cà phê',qty:1,price:45000}]})},before);
 await p.waitForFunction(v=>storeRange(stores.find(s=>s.id==='gg01')).rev===v,before.gg+45000);await p.waitForTimeout(600);
 await p.waitForFunction(({day,rev})=>live.rev.pl?.gg01?.[day]?.doanhThu===rev,{day:before.day,rev:before.gg+45000});
 check(true,'manage '+width+': lãi/lỗ Gieo tự cập nhật bằng bộ tính chung');
 check(await p.evaluate(()=>document.querySelector('[data-store="gg02"]')===window.__other),'manage '+width+': giữ nguyên widget điểm không liên quan');
 check(await p.evaluate(v=>document.querySelector('.overview-amount').textContent!==v,before.total),'manage '+width+': tổng doanh thu tự cập nhật');
 check(await p.evaluate(v=>JSON.stringify(__READS)===JSON.stringify(v),before.reads),'manage '+width+': bill mới không phát sinh lượt đọc RT');
 check(await p.evaluate(v=>JSON.stringify(__FSREADS)===JSON.stringify(v),before.fsreads),'manage '+width+': bill mới không đọc lại chi phí/kho/lương');
 await p.locator('#billFeed .bf-entry:not([hidden]) .bf-row').first().click();
 check(await p.locator('#billFeed .bf-detail').count()===1,'manage '+width+': chi tiết bill mở ngay trong widget');
 check(await p.evaluate(()=>!document.getElementById('dialog').open),'manage '+width+': chi tiết bill không mở popup');
 // More bills than viewport preview limit, header action opens same widget in dialog.
 await p.evaluate(()=>{for(let i=0;i<9;i++)BF.list.push({key:'demo'+i,store:'gg01',t:0,o:{total:1000,time:'09:00',itemsArray:[{name:'Trà',qty:1,price:1000}]}});bfRender()});
 check(await p.evaluate(()=>document.querySelector('#billFeed .bf-more').parentElement===document.querySelector('#billFeed .bf-live').parentElement),'manage '+width+': Xem thêm cạnh Trực tiếp trên đầu');
 await p.click('#billFeed .bf-more');check(await p.locator('#bfModal .bill-widget').count()===1,'manage '+width+': Xem thêm mở popup cùng UI widget');
 check(await p.evaluate(()=>[...document.querySelectorAll('#bfModal .bf-entry')].every(e=>!e.hidden)),'manage '+width+': popup hiện toàn bộ bill đã giữ');
 fs.mkdirSync(ROOT+'/work/bill-ui',{recursive:true});await p.screenshot({path:ROOT+'/work/bill-ui/manage-'+width+'.png'});
 await p.evaluate(()=>closeDialog());
 await p.evaluate(()=>{state.range='day';render();const i=currentBuckets.findIndex(b=>b.label.startsWith('10h'));chartTip(i,document.querySelector('#chartWrap svg rect[tabindex]'))});
 check(await p.locator('#chartTip').innerText().then(s=>s.includes('Tổng doanh thu')),'manage '+width+': tooltip có tổng doanh thu');
 check(await p.evaluate(()=>{const x=currentBuckets.find(b=>b.label.startsWith('10h'));return x.rows.some(r=>r.name===stores.find(s=>s.id==='gg02').name)&&x.total===x.rows.reduce((n,r)=>n+r.value,0)}),'manage '+width+': tách điểm Gieo, tổng bằng cộng từng điểm');
 await p.evaluate(({path})=>{__emit(path,'child_changed','NEW',{total:60000,time:'10:05',createdAt:new Date().toISOString(),method:'TIỀN MẶT'});__emit(path,'child_changed','NEW',{total:60000,time:'10:05',createdAt:new Date().toISOString(),method:'TIỀN MẶT'})},before);
 await p.waitForFunction(v=>storeRange(stores.find(s=>s.id==='gg01')).rev===v,before.gg+60000);check(true,'manage '+width+': sửa/gửi lại bill không cộng trùng');
 await p.evaluate(({path})=>__emit(path,'child_removed','NEW'),before);await p.waitForFunction(v=>storeRange(stores.find(s=>s.id==='gg01')).rev===v,before.gg);check(true,'manage '+width+': xoá bill trả đúng doanh thu');
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'manage '+width+': không tràn ngang');
 for(const [id,total,food,expected] of [['tc33',50000,15000,35000],['xofa',80000,30000,50000]]){
  const initial=await p.evaluate(id=>({revenue:storeRange(stores.find(s=>s.id===id)).rev,path:backend.billPath(id,BF.day),reads:JSON.stringify(__READS)}),id);
  await p.evaluate(({id,total,food,path})=>{const d=new Date(),date=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();__emit(path,'child_added','flow',{total,foodTotal:food,foodMethod:'TIỀN MẶT',date,time:'10:00',createdAt:d.getTime(),method:'TIỀN MẶT',itemsArray:[{name:'Cà phê sữa',qty:1,price:25000},{name:'Thuê mền',qty:1,price:10000},{name:'Bánh tráng',qty:1,price:15000}]})},{id,total,food,path:initial.path});
  await p.waitForFunction(({id,n})=>storeRange(stores.find(s=>s.id===id)).rev===n,{id,n:initial.revenue+expected});
  check(true,'manage '+width+': '+id+' realtime đúng phần doanh thu, tách Food/Ăn vặt');
  check(await p.evaluate(v=>JSON.stringify(__READS)===v,initial.reads),'manage '+width+': '+id+' không đọc lại điểm bán nào');
  await p.evaluate(path=>__emit(path,'child_removed','flow'),initial.path);await p.waitForFunction(({id,n})=>storeRange(stores.find(s=>s.id===id)).rev===n,{id,n:initial.revenue});
 }
 check(errors.length===0,'manage '+width+': toàn luồng không lỗi JS '+errors.join('|'));
 await p.goto(base+'/quanlygieo.html');await p.waitForFunction(()=>typeof _todayLiveCtx!=='undefined'&&_todayLiveCtx&&!_todayBusy);await p.waitForTimeout(1800);
 const q=await p.evaluate(()=>({path:_bfPath,revenue:_todayLiveCtx.values[0].totals.revenue,fsreads:{...__FSREADS},reads:{...__READS}}));
 await p.evaluate(({path})=>__emit(path,'child_added','rtnew',{total:55000,createdAt:new Date().toISOString(),time:'11:00',method:'TIỀN MẶT',itemsArray:[{id:'cf',name:'Cà phê',price:55000,qty:1}]}),q);
 await p.waitForFunction(v=>_todayLiveCtx.values[0].totals.revenue===v,q.revenue+55000);
 check(await p.locator('#todayGrid').innerText().then(s=>s.includes((q.revenue+55000).toLocaleString('vi-VN'))),'quanlygieo '+width+': doanh thu trên thẻ tự cập nhật');
 check(await p.evaluate(()=>_todayLiveCtx.pl.doanhThu===_todayLiveCtx.values[0].totals.revenue),'quanlygieo '+width+': lãi/lỗ cập nhật cùng doanh thu');
 check(await p.evaluate(v=>JSON.stringify(v)===JSON.stringify(__READS),q.reads),'quanlygieo '+width+': không đọc thêm RT khi có bill');
 check(await p.evaluate(v=>JSON.stringify(__FSREADS)===JSON.stringify(v),q.fsreads),'quanlygieo '+width+': bill mới không đọc lại chi phí/kho/lương');
 await p.evaluate(({path})=>__emit(path,'child_changed','rtnew',{total:60000,createdAt:new Date().toISOString(),time:'11:00',method:'TIỀN MẶT'}),q);await p.waitForFunction(v=>_todayLiveCtx.values[0].totals.revenue===v,q.revenue+60000);
 await p.evaluate(({path})=>__emit(path,'child_removed','rtnew'),q);await p.waitForFunction(v=>_todayLiveCtx.values[0].totals.revenue===v,q.revenue);check(true,'quanlygieo '+width+': sửa/xoá bill đồng bộ đúng');
 await p.screenshot({path:ROOT+'/work/bill-ui/quanlygieo-'+width+'.png'});
 check(errors.length===0,'quanlygieo '+width+': không lỗi JS '+errors.join('|'));
 await p.close();}
 console.log('ALL PASS '+count);
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
