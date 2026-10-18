// UI widget toàn app — Chromium + Firebase giả, chặn mạng ngoài.
// So Menu/Khuyến mãi và popup với bản trước rollout (dd27002); cần checkout git có commit này.
// Kiểm widget lặp không lồng khung/đọc Firebase; thao tác lưu ghi chú/NL/BTP qua form thật.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');
const BASELINE=require('child_process').execFileSync('git',['show','dd27002:quanlygieo.html'],{cwd:ROOT,maxBuffer:16*1024*1024}).toString();let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
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
 const mk=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 __RT['orders_gieogieo/'+mk[t.getMonth()]+'/'+String(t.getDate()).padStart(2,'0')].g1.customerId='test-return';
 __RT['orders_gieogieo/'+mk[t.getMonth()]+'/'+String(t.getDate()).padStart(2,'0')].g2.customerId='test-new';
 __RT['orders_gieogieo/'+mk[y.getMonth()]+'/'+String(y.getDate()).padStart(2,'0')]={a:{total:30000,customerId:'test-return',date:String(y.getDate()).padStart(2,'0')+'/'+String(y.getMonth()+1).padStart(2,'0')+'/'+y.getFullYear(),time:'10:00'}};
 __FS.assets_gieogieo={a:{purchaseCost:10000000,purchaseDate:k(y),usefulLifeMonths:12,active:true}};
 __FS.finance_gieogieo={current:{recoveryStartDate:k(y)}};
 __FS.pl_book_gieogieo={days:{du:k(y),d:{[k(y)]:{date:k(y),doanhThu:1000000,giaVon:200000,phiKenh:0,haoHut:0,luong:200000,chiPhiCoDinh:0,bienPhiKhac:0,khauHao:30000,lai:570000,laiTruocKhauHao:600000,mucTinCay:'chot-thang',updatedAt:t.toISOString()}}}};
}`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});let n=0;
const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
async function open(width,old=false){const p=await b.newPage({viewport:{width,height:950},timezoneId:'Asia/Ho_Chi_Minh'});p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(old&&u===base+'/quanlygieo.html')return r.fulfill({contentType:'text/html',body:BASELINE});if(u.startsWith(base+'/'))return r.continue();return r.abort()});await p.goto(base+'/quanlygieo.html');await p.waitForFunction(()=>typeof _todayLiveCtx!=='undefined'&&_todayLiveCtx&&!_todayBusy);await p.waitForTimeout(500);await p.evaluate(()=>document.fonts.ready);return p}
try{for(const width of [1366,853,390]){
 const p=await open(width),old=await open(width,true);
 for(const tab of ['mn','tg']){
  for(const page of [old,p]){await page.evaluate(t=>switchScreen(t),tab);await page.waitForTimeout(250)}
  const fingerprint=async page=>page.evaluate(t=>[...document.querySelectorAll('#screen-'+t+' *')].map(el=>{const s=getComputedStyle(el);return [el.tagName,el.className,...['display','fontSize','fontWeight','color','backgroundColor','padding','borderRadius','boxShadow','width','height'].map(k=>s[k])]}),tab);
  const a=await fingerprint(old),c=await fingerprint(p);
  check(JSON.stringify(a)===JSON.stringify(c),width+' '+tab+': DOM/style Menu hoặc Khuyến mãi giữ nguyên');
 }
 for(const [fn,id] of [['openMenuForm','mn-popup'],['openFoodForm','food-popup'],['openToppingForm','tp-popup']]){
  for(const page of [old,p]){await page.evaluate(f=>{switchScreen('mn');window[f]()},fn);await page.waitForTimeout(80)}
  const styles=page=>page.evaluate(id=>[document.getElementById(id),...document.querySelectorAll('#'+id+' *')].map(el=>{const c=getComputedStyle(el);return [el.tagName,el.className,c.display,c.color,c.backgroundColor,c.padding,c.borderRadius,c.fontSize,c.width,c.height]}),id);
  check(JSON.stringify(await styles(old))===JSON.stringify(await styles(p)),width+' '+id+': popup Menu giữ nguyên');
  for(const page of [old,p])await page.evaluate(id=>document.getElementById(id).style.display='none',id);
 }
 await old.close();
 const screens=await p.evaluate(()=>NAV_SECTIONS.flatMap(s=>s.items).filter(i=>UI_WIDGET_PAGES[i.key]&&UI_WIDGET_PAGES[i.key].phase<=UI_WIDGET_PHASE));
 for(const item of screens){
  await p.evaluate(go=>(0,eval)(go),item.go);await p.waitForTimeout(350);
  const r=await p.evaluate(()=>{uiWidgetsApply();const root=document.querySelector('.screen.active'),before=root.innerHTML,fs=JSON.stringify(__FSREADS),rt=JSON.stringify(__READS);uiWidgetsApply();uiWidgetsApply();return {widgets:root.querySelectorAll('.wdg').length,stable:before===root.innerHTML,reads:fs===JSON.stringify(__FSREADS)&&rt===JSON.stringify(__READS),overflow:document.documentElement.scrollWidth>innerWidth+1,title:currentNavKey()}});
  if(item.key==='customer'){
   const colors=await p.evaluate(()=>{
    const card=document.querySelector('#customerBody .kcard-wide'),css=card&&getComputedStyle(card);
    if(!card)return {present:false};
    const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),lum=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const stops=(css.backgroundImage.match(/rgba?\([^)]+\)/g)||[]).map(rgb),els=[...card.querySelectorAll('.klabel,.kval,.ksub,.meter-foot')];
    const contrast=els.flatMap(el=>stops.map(bg=>{const a=rgb(getComputedStyle(el).color),alpha=a[3]??1,fg=a.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha)),x=lum(fg),y=lum(bg);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}));
    return {present:true,gradient:stops.length>=2,min:Math.min(...contrast),value:card.querySelector('.kval').textContent,fill:getComputedStyle(card.querySelector('.meter-fill')).backgroundColor};
   });
   check(colors.present&&colors.gradient&&colors.min>=4.5,width+': thẻ Khách quay lại có tương phản chữ/nền tối thiểu 4,5:1');
   check(colors.value.includes('1')&&colors.value.includes('2 khách')&&colors.fill==='rgb(255, 255, 255)',width+': hiện rõ khách quay lại/tổng khách và thanh tỷ lệ');
  }
  check(r.widgets>0,width+' '+item.key+': có widget');check(r.stable,width+' '+item.key+': gọi lại không lồng thêm khung');check(r.reads,width+' '+item.key+': trang trí không đọc Firebase');check(!r.overflow,width+' '+item.key+': không tràn ngang trang');
 }
 await p.evaluate(()=>goEntry('ops'));await p.waitForTimeout(350);await p.fill('#opsNotes','Ghi chú kiểm tra widget');await p.locator('#opsNotes').focus();
 const draft=await p.evaluate(()=>{uiWidgetsApply();return document.getElementById('opsNotes').value==='Ghi chú kiểm tra widget'&&document.activeElement.id==='opsNotes'});check(draft,width+': giữ bản nhập và focus khi làm mới widget');
 await p.click('button[onclick="submitOps()"]');
 await p.waitForFunction(()=>Object.values(__FS.daily_ops_gieogieo||{}).some(x=>x.notes==='Ghi chú kiểm tra widget'));
 check(true,width+': lưu ghi chú qua nút thật vào đúng dữ liệu cũ');
 await p.evaluate(()=>goKho('items'));await p.waitForTimeout(350);await p.evaluate(()=>startAddItem());await p.waitForTimeout(150);
 await p.fill('#invName','Nguyên liệu kiểm tra UI');await p.selectOption('#invUnit','g');await p.fill('#invCost','50');
 await p.evaluate(()=>{document.getElementById('invStockManaged').checked=false;renderTrackingBox()});
 const draftBefore=await p.locator('#invName').inputValue();await p.evaluate(()=>uiWidgetsApply());
 check(await p.locator('#invName').inputValue()===draftBefore,width+': sheet NL giữ dữ liệu nhập');
 await p.click('button[onclick="submitInventoryItem()"]');
 await p.waitForFunction(()=>Object.values(__FS.inventory_items_gieogieo||{}).some(x=>x.name==='Nguyên liệu kiểm tra UI'));
 check(true,width+': lưu NL qua form thật, giữ schema');
 const itemId=await p.evaluate(()=>Object.entries(__FS.inventory_items_gieogieo).find(([id,x])=>x.name==='Nguyên liệu kiểm tra UI')[0]);
 await p.evaluate(()=>goKho('prep'));await p.waitForTimeout(350);await p.evaluate(()=>prepStartNew());await p.waitForTimeout(300);
 check(await p.locator('.ui-prep-form>.ui-prep-part').count()===6,width+': BTP chia sáu nhóm thao tác');
 await p.fill('.ui-prep-form input[placeholder="VD: Cốt Trà Sữa Nguyên Lá"]','BTP kiểm tra UI');
 await p.click('button[onclick="prepAddInput()"]');await p.selectOption('#prepEditorBox select',itemId);await p.fill('#prepEditorBox input[type=number]','100');await p.fill('#prepYieldInput','600');
 await p.evaluate(()=>uiWidgetsApply());
 check(await p.evaluate(()=>prepDraft.name==='BTP kiểm tra UI'&&prepDraft.batchYield===600&&Number(prepDraft.batchInputs[0].qty)===100),width+': form BTP giữ draft công thức và sản lượng');
 check(await p.evaluate(()=>[...document.querySelectorAll('.ui-prep-form .ui-help')].every(d=>!d.open)&&document.querySelector('#prepYieldInput').getClientRects().length>0),width+': chỉ gập hướng dẫn, sản lượng luôn hiển thị');
 await p.click('button[onclick="submitPrepItem()"]');
 await p.waitForFunction(()=>Object.values(__FS.prep_items_gieogieo||{}).some(x=>x.name==='BTP kiểm tra UI'));
 check(await p.evaluate(()=>{const x=Object.values(__FS.prep_items_gieogieo).find(x=>x.name==='BTP kiểm tra UI');return x.batchYield===600&&Number(x.batchInputs[0].qty)===100&&Math.abs(x.costPerUnit-50*100/600)<0.001}),width+': lưu BTP giữ công thức giá vốn và đơn vị');
 await p.evaluate(()=>{const [id]=Object.entries(__FS.prep_items_gieogieo).find(([id,x])=>x.name==='BTP kiểm tra UI');prepStartEdit(id)});await p.waitForTimeout(350);
 check(await p.locator('.ui-prep-history').count()===1,width+': form sửa có widget lịch sử công thức riêng');
 check(await p.evaluate(()=>{const a=document.querySelector('.ui-prep-history').getBoundingClientRect(),b=document.querySelector('.ui-prep-form').getBoundingClientRect();return Math.abs(a.width-b.width)<2}),width+': lịch sử công thức chiếm đủ chiều ngang');
 check(p.errs.length===0,width+': không lỗi JS '+p.errs.join('|'));await p.close();
 }console.log('ALL PASS '+n)}finally{await b.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
