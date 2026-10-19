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
try{for(const width of [1366,820,390]){
 const p=await b.newPage({viewport:{width,height:900}});p.on('dialog',d=>d.dismiss());
 await p.route('**/*',r=>{let u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({body:''});if(u.includes('cdn.tailwindcss.com'))return r.fulfill({body:tw});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/pos.html');await p.waitForTimeout(800);
 await p.evaluate(()=>switchView('discount'));
 for(const tab of ['menueditor','gift','screen','label','sticker']){
  await p.evaluate(t=>switchMgrTab(t),tab);await p.waitForTimeout(150);
  check(await p.locator('#mgr-c-'+tab).isVisible(),width+': '+tab+' editor visible');
  if(tab!=='sticker')check(await p.locator('#mgr-col-b-wrap').isVisible(),width+': '+tab+' list accessible');
  else check(!await p.locator('#mgr-col-b-wrap').isVisible(),width+': sticker full width');
  check(await p.evaluate(()=>document.querySelector('#view-discount').scrollWidth<=innerWidth),width+': '+tab+' no page overflow');
  if(tab==='menueditor'){
   await p.locator('#me-name').fill('Món thử UI');check(await p.locator('#me-name').inputValue()==='Món thử UI',width+': form editable');
   await p.screenshot({path:'/workspace/work/pos-manager/'+width+'-'+tab+'.png'});
  }
 }
 await p.close();}console.log('ALL PASS '+n)}finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
