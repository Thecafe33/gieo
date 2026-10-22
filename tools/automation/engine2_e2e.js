// Engine2 POS bridge with actual POS styles and shared inventory/data modules; no network Firebase.
'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),styles=[...fs.readFileSync(path.join(root,'posgieo.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const fake=fs.readFileSync(path.join(root,'tests/lib/fakefb.js'),'utf8').replace('module.exports =','window.__fakefb =');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__engine2'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+styles+'</style></head><body><section class="screen" id="work"><div id="shiftBody"></div></section></body></html>');}const p=path.resolve(root,'.'+url.pathname);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(p));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const width of [1366,390]){
  const page=await b.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base+'/__engine2');
  await page.addScriptTag({content:'(function(){const process={env:{}};'+fake+'})();'});
  for(const name of ['unit_engine.v21.js','unit_engine2_v1.js','unit_engine2_store_v1.js'])await page.addScriptTag({url:base+'/'+name});
  await page.addScriptTag({content:`
   const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10),at=new Date().toISOString(),start=new Date(Date.now()-3600000).toISOString(),rt='active_units_gieogieo/j',base='duty_digests_gieogieo/_engine2';
   window.POS_STORE={storeId:'gg01'};window.__taskReads=0;window.__offline=false;window.__continued=0;
   window.__fixture=__fakefb.makeFake({rt:{'.info':{connected:true},active_units_gieogieo:{j:{u:{code:'JELLY001',unitBase:300,capacity:500,openedAt:Date.now()-3600000}}}},fs:{
    [base]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,revision:1,controlledItemIds:['j']},
    [base+'/controls/j']:{level:2,itemName:'Thạch'},[base+'/tasks/first']:{itemId:'j',itemName:'Thạch',pending:true,status:'queued',createdAt:at},
    'inventory_items_gieogieo/j':{name:'Thạch',unit:'g',active:true},'stock_containers_gieogieo/u':{itemId:'j',itemName:'Thạch',status:'open',unit:'g',openedAt:start},
    'prep_vessels_gieogieo/v':{name:'Hũ tròn',variants:[{id:'a',label:'Hũ nhỏ',tareG:100}]},'prep_vessels_gieogieo/other':{name:'Hũ vuông',variants:[{id:'b',label:'Hũ lớn',tareG:200}]},
    'employee_shifts_gieogieo/s':{employeeId:'e',employeeName:'Lan',roles:['barista'],checkedInAt:start}
   }});window.fstore=__fixture.fstore;window.db=__fixture.db;const tx=fstore.runTransaction.bind(fstore);fstore.runTransaction=fn=>{if(__offline)return Promise.reject(Error('offline'));return tx(fn)};
   const wrap=q=>new Proxy(q,{get(o,k){if(k==='get')return async(...a)=>{if(o.path?.includes('/tasks')||o.__tasks)__taskReads++;return o.get(...a)};if(['where','orderBy','limit','startAfter'].includes(k))return(...a)=>{const r=o[k](...a);r.__tasks=o.__tasks||o.path?.includes('/tasks');return wrap(r)};return o[k]}});
   window.GieoData={collFor:name=>{const c=fstore.collection(name),doc=c.doc;c.doc=id=>{const d=doc(id),sub=d.collection;d.collection=n=>wrap(sub(n));return d};return c}};
   window.posDateKey=()=>day;window.toast=s=>{window.notice=s};window._employeeShiftsTodayCache=[{employeeId:'e',roles:['barista']}];window.resolveStaffPinWorkedToday=async id=>document.getElementById(id)?.value==='1111'?{id:'e',fullName:'Lan'}:null;
   window.renderOpeningChecklist=async()=>{};window.renderDailyClosingChecklist=async()=>{};window.openCaLamViecScreen=async()=>{};window.renderShiftHandoverForm=async()=>{};
   window._continueAfterPrepCount=async()=>{__continued++};window.computeShiftInventoryCountLinesPOS=async()=>[{itemId:'j'},{itemId:'uncontrolled'}];
   UnitEngine.init({app:'pos',fstore,db,FieldValue:__fixture.FieldValue,now:Date.now,getItems:()=>[],state:{_shiftInventoryCountStatePOS:()=>({lines:[]})}});
  `});
  await page.addScriptTag({url:base+'/gieo_engine2_pos_v1.js'});await page.evaluate(()=>renderOpeningChecklist());assert.equal(await page.evaluate(()=>__taskReads),0);
  await page.evaluate(()=>document.getElementById('work').classList.add('active'));await page.evaluate(()=>renderOpeningChecklist());await page.getByRole('button',{name:'Xem việc cân'}).click();await page.getByRole('button',{name:'Cân / kiểm tra'}).click();
  assert.equal(await page.locator('#e2Vessel0 option').count(),3,'Unassigned item must offer the full valid vessel library');
  await page.locator('#e2Vessel0').selectOption('v~a');await page.locator('#e2StaffPin').fill('1111');await page.locator('#e2Gross0').fill('200');await page.getByRole('button',{name:'Gửi số cân',exact:true}).click();await page.getByText('Số cân lệch lớn.',{exact:false}).waitFor();assert.equal(await page.locator('#e2Gross0').inputValue(),'');
  await page.locator('#e2Gross0').fill('350');assert.equal(await page.locator('#e2Net0').innerText(),'Ròng: 250 g');assert.equal(await page.locator('#e2Gross0').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await page.evaluate(()=>document.getElementById('e2Modal').scrollWidth>innerWidth),false);
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'engine2-weigh-'+width+'.png')});}
  await page.getByRole('button',{name:'Gửi số cân',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('e2Modal'));
  const sent=await page.evaluate(()=>Object.entries(__fixture.FS).filter(([p])=>p.startsWith('duty_digests_gieogieo/_engine2/measurements/')).map(([,d])=>d));assert.equal(sent.length,1);assert.equal(sent[0].line.units[0].weighed,250);assert.equal(sent[0].line.units[0].weighings[0].tareG,100);assert.equal(sent[0].staff.id,'e');assert.equal(await page.evaluate(()=>__fixture.rtGet('active_units_gieogieo/j/u/unitBase')),300,'Browser only journals; inventory worker is the single writer');
  await page.evaluate(()=>_continueAfterPrepCount());await page.locator('#e2Reason').fill('Cân hỏng, bàn giao ca sau cân tiếp');await page.locator('#e2StaffPin').fill('1111');await page.evaluate(()=>{__offline=true});await page.getByRole('button',{name:'Ghi sự cố và tiếp tục'}).click();await page.waitForFunction(()=>__continued===1);
  const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('gieo_engine2_outbox_v1_gg01')));assert.equal(pending[0].kind,'close_exception');assert.equal(pending[0].payload.reason,'Cân hỏng, bàn giao ca sau cân tiếp');assert.equal(await page.evaluate(()=>__fixture.FS['duty_digests_gieogieo/_engine2/tasks/first'].pending),true);
  assert.deepEqual(await page.evaluate(async()=> (await computeShiftInventoryCountLinesPOS('close')).map(l=>l.itemId)),['uncontrolled']);
  await page.evaluate(()=>{__offline=false;return GieoEngine2POS.flush()});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gieo_engine2_outbox_v1_gg01')).length),0);assert.deepEqual(errors,[]);
  console.log('ok Engine2 POS '+width+'px: lazy tasks, all vessels, blind reweigh, white inputs, immutable command, offline close exception, no direct stock mutation');await page.close();
 }
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
