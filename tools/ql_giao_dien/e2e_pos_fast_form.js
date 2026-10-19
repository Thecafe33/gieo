// Real POS markup/functions with local Firebase mock; no external data or printing.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..'),fixtures=ROOT+'/tools/tet/e2e/';
let mock=fs.readFileSync(fixtures+'mockfb.js','utf8');
mock+="\nfirebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({})});";
mock+=fs.readFileSync(fixtures+'rtmem.js','utf8');
mock+="\n__RT2.put('menu',[{name:'Bạc xỉu',type:'Cà phê',priceM:25000,priceL:30000},{name:'Trà đào',type:'Trà',priceM:30000}]);";
// Generate fixture CSS with tailwindcss@3 --content ./pos.html, then pass TAILWIND_CSS.
const tw='document.head.insertAdjacentHTML("beforeend",'+JSON.stringify('<style>'+fs.readFileSync(process.env.TAILWIND_CSS||'/workspace/work/pos-manager/tailwind.css','utf8')+'</style>')+')';
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:'/usr/bin/chromium'});let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
try{for(const [width,height]of [[1024,600],[1024,650],[1280,720],[1366,768],[1920,1080],[820,600],[820,700],[390,844]]){
 const p=await b.newPage({viewport:{width,height}});p.on('dialog',d=>d.dismiss());
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({body:''});if(u.includes('cdn.tailwindcss.com'))return r.fulfill({body:tw});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/pos.html');await p.waitForTimeout(700);await p.evaluate(()=>switchView('discount'));await p.waitForTimeout(200);await p.evaluate(()=>menuEditorNewItem());
 if(width>768){
 const layout=await p.evaluate(()=>{const body=document.querySelector('.mgr-menu-fields'),r=body.getBoundingClientRect();return{overflow:body.scrollHeight-body.clientHeight,fields:['me-name','me-type','me-price-m','me-price-l','me-color-swatches','me-custom-color-label'].map(id=>{const b=document.getElementById(id).getBoundingClientRect();return{id,visible:b.top>=r.top-1&&b.bottom<=r.bottom+1&&b.left>=r.left-1&&b.right<=r.right+1}}),save:document.querySelector('[onclick="menuEditorSave()"]')?.getBoundingClientRect().bottom<=innerHeight}});
 console.log(width+'x'+height,JSON.stringify(layout));check(layout.overflow<=1,width+': complete form has no scroll');check(layout.fields.every(f=>f.visible),width+': every input and color visible');check(layout.save,width+': save visible');
 await p.locator('#me-name').fill('Trà đào giá thử');await p.locator('#me-name').press('Tab');check(await p.locator('#me-type').evaluate(e=>e===document.activeElement),width+': Tab name → category');await p.keyboard.type('Trà');await p.keyboard.press('Tab');check(await p.locator('#me-price-m').evaluate(e=>e===document.activeElement),width+': Tab category → M');await p.keyboard.type('25000');await p.keyboard.press('Tab');check(await p.locator('#me-price-l').evaluate(e=>e===document.activeElement),width+': Tab M → L');await p.keyboard.type('30000');check(await p.locator('#me-name').inputValue()==='Trà đào giá thử',width+': name retained while entering prices');
 }else check(await p.locator('#me-name').isVisible(),width+': mobile form still accessible');
 await p.waitForTimeout(250);await p.screenshot({path:'/workspace/work/pos-fast-form/'+width+'.png'});await p.close();}
 console.log('ALL PASS '+n)}finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
