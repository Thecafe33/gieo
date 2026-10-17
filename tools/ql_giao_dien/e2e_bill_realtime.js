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
 try{for(const width of [1366,853,390]){const p=await b.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text().slice(0,220))});
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
 await p.evaluate(()=>{BF.list.unshift({key:'ui-preview',store:'xofa',t:Date.now(),o:{total:30000,time:'12:23',isToGo:true,billCode:'#05-17.10.26',bankOrderId:'XO1710122218',method:'CHUYỂN KHOẢN',itemsArray:[{name:'Trà lựu đỏ thạch dừa',size:'L',qty:1,price:25000,toppings:[{name:'Ngọc trai hồng',price:5000,qty:1}]}]}},{key:'ui-here',store:'xofa',t:0,o:{total:29000,time:'12:20',isToGo:false,method:'TIỀN MẶT'}},{key:'ui-legacy',store:'xofa',t:0,o:{total:29000,time:'12:19',method:'TIỀN MẶT'}});bfRender()});
 await p.locator('#billFeed .bf-entry:not([hidden]) .bf-row').first().click();
 check(await p.locator('#billFeed .bf-detail').count()===1,'manage '+width+': chi tiết bill mở ngay trong widget');
 check(await p.evaluate(()=>!document.getElementById('dialog').open),'manage '+width+': chi tiết bill không mở popup');
 check(await p.locator('#billFeed .bf-row[data-k="ui-preview"] .bf-mode').innerText()==='Togo','manage '+width+': XOFA isToGo=true có nhãn Togo ngay trên đầu bill');
 check(await p.locator('#billFeed .bf-row[data-k="ui-here"] .bf-mode,#billFeed .bf-row[data-k="ui-legacy"] .bf-mode').count()===0,'manage '+width+': bill tại quán/thiếu cờ không bị gắn Togo');
 check(await p.locator('#billFeed .bf-detail').innerText().then(t=>t.includes('#05-17.10.26')&&t.includes('XO1710122218')&&t.includes('Ngọc trai hồng')&&t.includes('5.000đ')&&!t.includes('Tổng bill')&&!t.includes('Thanh toán')),'manage '+width+': chi tiết có mã bill/CK/topping, bỏ dòng lặp đã có trên đầu');
 check(await p.evaluate(()=>{const d=bfDetails({o:{total:50000,method:'TIỀN MẶT',itemsArray:[{name:'Trà',qty:1,price:50000}]}});return !d.includes('bf-meta')}),'manage '+width+': bill không có thông tin phụ không sinh vùng trống');
 // More bills than viewport preview limit, header action opens same widget in dialog.
 await p.evaluate(()=>{for(let i=0;i<9;i++)BF.list.push({key:'demo'+i,store:'gg01',t:0,o:{total:1000,time:'09:00',itemsArray:[{name:'Trà',qty:1,price:1000}]}});bfRender()});
 check(await p.evaluate(()=>document.querySelector('#billFeed .bf-more').parentElement===document.querySelector('#billFeed .bf-live').parentElement),'manage '+width+': Xem thêm cạnh Trực tiếp trên đầu');
 await p.click('#billFeed .bf-more');check(await p.locator('#bfModal .bill-widget').count()===1,'manage '+width+': Xem thêm mở popup cùng UI widget');
 check(await p.evaluate(()=>[...document.querySelectorAll('#bfModal .bf-entry')].every(e=>!e.hidden)),'manage '+width+': popup hiện toàn bộ bill đã giữ');
 check(await p.evaluate(()=>{const d=document.getElementById('dialog'),inner=document.getElementById('dialogInner'),style=getComputedStyle(d);return style.backgroundColor==='rgba(0, 0, 0, 0)'&&parseFloat(style.paddingTop)===0&&parseFloat(getComputedStyle(inner).paddingTop)===0&&!inner.querySelector('.dialog-head')}),'manage '+width+': popup chỉ có widget xanh, không khung trắng/padding/tiêu đề ngoài');
 check(await p.evaluate(()=>document.querySelectorAll('#dialog #dialogTitle').length===1&&document.querySelector('#dialog #dialogTitle').textContent==='Bill chung'&&!!document.querySelector('#bfModal .widget-head .bf-close')),'manage '+width+': một tiêu đề duy nhất và nút X nằm trong đầu widget');
 const geometry=await p.evaluate(()=>{
  const d=document.getElementById('dialog'),header=document.querySelector('#bfModal .widget-head'),entry=document.querySelector('#bfModal .bf-entry.is-open'),head=entry.querySelector('.bf-row'),detail=entry.querySelector('.bf-detail');
  return {width:d.getBoundingClientRect().width,headerBG:getComputedStyle(header).backgroundColor,headBG:getComputedStyle(head).backgroundColor,detailBG:getComputedStyle(detail).backgroundColor,gap:detail.getBoundingClientRect().top-head.getBoundingClientRect().bottom,detailHeight:detail.getBoundingClientRect().height,stripe:getComputedStyle(detail).borderLeftWidth,overflow:document.querySelector('#bfModal').scrollWidth>document.querySelector('#bfModal').clientWidth+1};
 });
 check(width<=760||Math.abs(geometry.width-Math.min(1100,width*.96)*.8)<2,'manage '+width+': popup PC/tablet giảm đúng 20%');
 check(geometry.headerBG==='rgba(0, 0, 0, 0)','manage '+width+': tiêu đề hoà nền widget, không có dải trắng');
 check(geometry.headBG==='rgba(0, 0, 0, 0)'&&geometry.detailBG==='rgba(0, 0, 0, 0)'&&Math.abs(geometry.gap)<2,'manage '+width+': đầu và chi tiết cùng một thẻ liền mạch');
 check(geometry.detailHeight<160&&geometry.stripe==='0px','manage '+width+': hai dòng món gọn, không khối trắng/viền rời');
 check(!geometry.overflow,'manage '+width+': popup không tràn ngang');
 check(await p.locator('#bfModal .bf-row[data-k="ui-preview"] .bf-mode').innerText()==='Togo','manage '+width+': nhãn Togo cũng có trong popup');
 check(await p.evaluate(()=>{const tag=document.querySelector('#bfModal .bf-row[data-k="ui-preview"] .bf-mode'),who=tag.closest('.bf-who');return tag.getBoundingClientRect().right<=who.getBoundingClientRect().right+1&&tag.scrollWidth<=tag.clientWidth+1}),'manage '+width+': nhãn Togo hiện trọn, không bị cắt trên điện thoại');
 const readability=await p.evaluate(()=>{const card=document.querySelector('#bfModal .bf-entry.is-open'),line=card.querySelector('.bf-line'),value=card.querySelector('.bf-kv>b');const lum=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});return a[0]*.2126+a[1]*.7152+a[2]*.0722};const fg=lum(getComputedStyle(line).color),bg=lum(getComputedStyle(card).backgroundColor);return{font:parseFloat(getComputedStyle(line).fontSize),valueFont:parseFloat(getComputedStyle(value).fontSize),contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)}});
 check(readability.font>=15&&readability.valueFont>=14&&readability.contrast>=7,'manage '+width+': tên món/giá/mã đủ lớn, tương phản cao');
 const scroll=await p.evaluate(()=>{const head=document.querySelector('#bfModal .widget-head'),list=document.querySelector('#bfModal .bf-list'),before=head.getBoundingClientRect().top;list.scrollTop=120;const after=head.getBoundingClientRect().top,top=list.scrollTop;bfRender();return{before,after,top,restored:document.querySelector('#bfModal .bf-list').scrollTop}});
 check(scroll.top>0&&Math.abs(scroll.before-scroll.after)<1&&Math.abs(scroll.top-scroll.restored)<1,'manage '+width+': cuộn danh sách giữ tiêu đề và vị trí khi RT vẽ lại');
 await p.evaluate(()=>{document.querySelector('#bfModal .bf-list').scrollTop=0;toggleTheme()});await p.waitForTimeout(350);
 check(await p.evaluate(()=>['.bf-row','.bf-detail','.widget-head'].every(s=>getComputedStyle(document.querySelector('#bfModal '+s)).backgroundColor==='rgba(0, 0, 0, 0)')),'manage '+width+': theme tối vẫn dùng nền liền mạch');
 fs.mkdirSync(ROOT+'/work/bill-ui',{recursive:true});await p.screenshot({path:ROOT+'/work/bill-ui/manage-dark-'+width+'.png'});await p.evaluate(()=>toggleTheme());await p.waitForTimeout(350);
 fs.mkdirSync(ROOT+'/work/bill-ui',{recursive:true});await p.screenshot({path:ROOT+'/work/bill-ui/manage-'+width+'.png'});
 await p.click('#bfModal .bf-close');await p.waitForTimeout(80);
 check(await p.evaluate(()=>!document.getElementById('dialog').open&&document.activeElement===document.querySelector('#billFeed .bf-more')),'manage '+width+': nút X đóng popup và trả focus về Xem thêm sau RT vẽ lại');
 await p.click('#billFeed .bf-more');await p.keyboard.press('Escape');await p.waitForTimeout(80);check(await p.evaluate(()=>!document.getElementById('dialog').open),'manage '+width+': Esc vẫn đóng popup widget');
 await p.click('#billFeed .bf-more');await p.mouse.click(2,2);await p.waitForTimeout(80);check(await p.evaluate(()=>!document.getElementById('dialog').open),'manage '+width+': bấm ngoài popup vẫn đóng');
 await p.evaluate(()=>openDialog('Kiểm tra hộp thoại khác','<p>Thông tin</p>'));
 check(await p.evaluate(()=>{const d=document.getElementById('dialog');return d.open&&!d.classList.contains('bill-dialog')&&!!d.querySelector('.dialog-head')&&getComputedStyle(d).backgroundColor!=='rgba(0, 0, 0, 0)'}),'manage '+width+': các hộp thoại khác giữ khung/tiêu đề bình thường');
 await p.evaluate(()=>closeDialog());
 await p.evaluate(()=>{state.range='day';render();const i=currentBuckets.findIndex(b=>b.label.startsWith('10h'));chartTip(i,document.querySelector('#chartWrap svg rect[tabindex]'))});
 check(await p.locator('#chartTip').innerText().then(s=>s.includes('Tổng doanh thu')),'manage '+width+': tooltip có tổng doanh thu');
 check(await p.evaluate(()=>{const x=currentBuckets.find(b=>b.label.startsWith('10h'));return x.rows.some(r=>r.name===stores.find(s=>s.id==='gg02').name)&&x.total===x.rows.reduce((n,r)=>n+r.value,0)}),'manage '+width+': tách điểm Gieo, tổng bằng cộng từng điểm');
 // Ba cột: 3 phần màu, 2 phần màu, và phần trên cùng rất mỏng.
 await p.evaluate(()=>{
  window.__chartSaved={data:live.rev.data,hidden:new Set(state.hidden),range:state.range};live.rev.data=structuredClone(live.rev.data);const day=currentDate();
  for(const point of selectedStores()){const key=point.brand==='gieo'?'gg_'+point.id:point.id;live.rev.data[key]||={};const row=live.rev.data[key][day]||={};const a=Array(24).fill(0);if(point.id==='tc33'){a[12]=140000;a[13]=160000;a[14]=90000}else if(point.id==='xofa'){a[12]=25000;a[13]=100000;a[14]=40000}else if(point.id==='gg01'){a[12]=25000;a[14]=1000}row[point.brand==='gieo'?'h24Rev':'h24']=a}
  const host=document.createElement('div');host.id='chartShapePreview';host.style.cssText='position:fixed;inset:16px 16px auto;z-index:100000;padding:16px;background:var(--panel);border-radius:20px';host.innerHTML=chartSvg(selectedStores().map(storeRange),{width:900,height:260});document.body.append(host);host.querySelector('svg').style.cssText='width:100%;height:260px';
 });
 const shape=await p.evaluate(()=>{const root=document.getElementById('chartShapePreview'),groups=[...root.querySelectorAll('.chart-column')].filter(g=>g.children.length>1);return{multi:groups.length,flat:groups.every(g=>[...g.children].every(r=>!Number(r.getAttribute('rx')))),joined:groups.every(g=>[...g.children].slice(1).every((r,i)=>Math.abs(Number(r.getAttribute('y'))+Number(r.getAttribute('height'))-Number(g.children[i].getAttribute('y')))<1e-6)),clipped:groups.every(g=>root.querySelector(g.getAttribute('clip-path').slice(4,-1))?.querySelector('path'))}});
 check(shape.multi===3&&shape.flat&&shape.joined&&shape.clipped,'manage '+width+': các phần màu nối phẳng, bo theo đường bao chung kể cả đoạn trên rất mỏng');
 await p.locator('#chartShapePreview').screenshot({path:ROOT+'/work/bill-ui/chart-caps-'+width+'.png'});
 check(await p.evaluate(()=>{const host=document.getElementById('chartShapePreview');state.hidden.add('gieo');const second=document.createElement('div');second.style.display='none';second.innerHTML=chartSvg(selectedStores().map(storeRange));host.append(second);const ids=[...host.querySelectorAll('clipPath')].map(c=>c.id);return new Set(ids).size===ids.length&&second.querySelectorAll('.data-bar').length===6}),'manage '+width+': tắt điểm bán vẫn có cột đúng, clip không trùng khi vẽ lại');
 await p.evaluate(()=>{live.rev.data=__chartSaved.data;state.hidden=__chartSaved.hidden;state.range=__chartSaved.range;document.getElementById('chartShapePreview').remove();delete window.__chartSaved;render()});
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
