// Real POS markup/functions with local Firebase mock; no external data or printing.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..'),fixtures=ROOT+'/tools/tet/e2e/';
let mock=fs.readFileSync(fixtures+'mockfb.js','utf8').replace('cb({docs:snapDocs(coll,filters)})','cb({docs:snapDocs(coll,filters),forEach(fn){snapDocs(coll,filters).forEach(fn)}})');
mock+="\nfirebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({})});";
mock+=fs.readFileSync(fixtures+'rtmem.js','utf8');
mock+="\n__RT2.put('menu',[{name:'Bạc xỉu',type:'Cà phê',priceM:25000,priceL:30000},{name:'Trà đào',type:'Trà',priceM:30000}]);";
// Generate fixture CSS with tailwindcss@3 --content ./pos.html, then pass TAILWIND_CSS.
const tw='document.head.insertAdjacentHTML("beforeend",'+JSON.stringify('<style>'+fs.readFileSync(process.env.TAILWIND_CSS||'/workspace/work/pos-manager/tailwind.css','utf8')+'</style>')+')';
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});

mock+=`var sample={};for(var i=0;i<34;i++)sample['item'+i]={name:(i===0?'Trà đào hồng nhài với trân châu trắng':i===1?'Trà đào cam sả':'Món thử '+i),type:i%2?'Trà':'Cà phê',priceM:25000+i*1000,priceL:32000+i*1000,color:i%2?'#955f29':'#006241'};__RT2.put('menu',sample);__FS.config=__FS.config||{};__FS.config.screen_slides={slides:[{url:'https://example.com/banner-1.png',duration:8},{url:'https://example.com/banner-2.png',duration:12}]};__FS.rewards={gift1:{label:'Quà tháng mười',code:'THANG10',type:'order',value:5000,cost:0,scope:'cafe33',active:true},gift2:{label:'Ly đổi tem',code:'TEM',type:'item_free',value:0,cost:500,scope:'both',active:false}};`;
async function filterText(p,kind,value){const prefix=kind==='menu'?'m-menu':'m-gift';if(!await p.locator('#'+prefix+'-search').isVisible()){if(await p.locator('.mgr-tool-close:visible').count())await p.locator('.mgr-tool-close:visible').click();await p.locator('#'+prefix+'-search-toggle').click();}await p.locator('#'+prefix+'-search').fill(value);}
async function filterGroup(p,value){if(!await p.locator('#m-menu-group').isVisible()){if(await p.locator('.mgr-tool-close:visible').count())await p.locator('.mgr-tool-close:visible').click();await p.locator('#m-menu-group-toggle').click();}await p.locator('#m-menu-group').selectOption(value);}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:'/usr/bin/chromium'});let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
try{for(const [width,height]of [[1366,768],[1024,650],[1920,1080],[390,844]]){
 const p=await b.newPage({viewport:{width,height}});p.on('dialog',d=>d.dismiss());const errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({body:''});if(u.includes('cdn.tailwindcss.com'))return r.fulfill({body:tw});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/pos.html');await p.waitForTimeout(700);await p.evaluate(()=>switchView('discount'));await p.waitForTimeout(150);
 check(await p.locator('#menu-editor-list [data-key]').count()===34,width+': 34 distinguishable menu cards');
 if(width>768){
 await p.evaluate(()=>{window.__menuReads=0;const original=db.ref;db.ref=function(path){const r=original.call(this,path),once=r.once;if(path==='menu')r.once=function(...args){__menuReads++;return once.apply(r,args)};return r}});await filterText(p,'menu','tra dao');check(await p.locator('#menu-editor-list [data-key]:visible').count()===2,width+': accent-insensitive menu search');
 await filterGroup(p,'Trà');check(await p.locator('#menu-editor-list [data-key]:visible').count()===1,width+': group filter combines with query');
 await p.locator('#menu-editor-list [data-key]:visible').click();check(await p.locator('#me-name').inputValue()==='Trà đào cam sả',width+': correct record chosen');check(await p.locator('#menu-editor-list [aria-pressed=true]').count()===1,width+': selected item clearly marked');
 await filterGroup(p,'');await filterText(p,'menu','25000');check(await p.locator('#menu-editor-list [data-key]:visible').count()===1,width+': price search accepts unformatted number');await filterText(p,'menu','');
 await p.locator('#menu-editor-list [data-key="item0"]').click();check(await p.locator('#me-price-l').inputValue()==='32000',width+': price L matches selected card');
 await p.waitForTimeout(250);check(await p.evaluate(()=>__menuReads===0),width+': searching/filtering/selecting adds no menu reads');await p.screenshot({path:'/workspace/work/pos-manager-full/'+width+'-menu.png'});
 await p.locator('#me-price-m').fill('27000');await p.evaluate(()=>menuEditorSave());await p.waitForTimeout(100);check(await p.evaluate(()=>__RT2.get('menu/item0').priceM===27000&&__RT2.get('menu/item0').name==='Trà đào hồng nhài với trân châu trắng'),width+': save retains original item key and payload');
 }
 for(const tab of ['gift','screen','sticker','label']){
 await p.evaluate(t=>switchMgrTab(t),tab);await p.waitForTimeout(160);check(await p.locator('#mgr-c-'+tab).isVisible(),width+': '+tab+' workspace visible');
 check(await p.evaluate(()=>document.getElementById('view-discount').scrollWidth<=innerWidth),width+': '+tab+' no outer horizontal overflow');
 if(width>768){
 if(tab==='gift'){
 await filterText(p,'gift','THANG10');check(await p.locator('#discount-list [data-key]:visible').count()===1,width+': gift filter');await p.locator('#discount-list [data-key]:visible').click();check(await p.locator('#df-label').inputValue()==='Quà tháng mười',width+': gift selects correct record');
 await p.evaluate(()=>dfSetType('item_free'));check(await p.locator('#df-condition-row').isVisible(),width+': conditional gift fields preserved');await p.evaluate(()=>dfSetType('order'));
 check(await p.locator('#df-label').isVisible()&&await p.locator('#df-value').isVisible(),width+': gift identity and benefit together');
 }
 if(tab==='screen'){
 check(await p.locator('#slide-list [data-slide]').count()===2,width+': slide cards');await p.locator('#slide-list [data-slide="1"]').click();check(await p.locator('#slide-new-duration').inputValue()==='12',width+': slide edit');check(await p.locator('#slide-list [aria-pressed=true]').count()===1,width+': selected slide');await p.locator('[onclick="screenShowAddForm()"]').click();check(await p.locator('#slide-new-url').inputValue()===''&&await p.evaluate(()=>window._screenEditIdx===null),width+': new slide clears edit state');
 }
 if(tab==='sticker'){
 const layout=await p.evaluate(()=>{const a=document.getElementById('sticker-layout-preview').getBoundingClientRect(),b=document.getElementById('stk-footer-text').getBoundingClientRect();return a.right<b.left&&a.top<innerHeight&&b.top<innerHeight});check(layout,width+': sticker controls beside preview');
 }
 if(tab==='label'){
 const layout=await p.evaluate(()=>{const a=document.querySelector('.mgr-label-section-0').getBoundingClientRect(),b=document.querySelector('.mgr-label-section-6').getBoundingClientRect();return a.right<=b.left&&a.top<innerHeight&&b.top<innerHeight});check(layout,width+': print settings beside preview');check(await p.locator('#lbl-btn-print').isDisabled(),width+': printing still guarded');
 }
 await p.waitForTimeout(250);await p.screenshot({path:'/workspace/work/pos-manager-full/'+width+'-'+tab+'.png'});
 }
 }
 check(errors.length===0,width+': no browser errors');await p.close();}
 console.log('ALL PASS '+n)}finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
