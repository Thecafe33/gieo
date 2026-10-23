// BTP âm trên POS (docs/KE_HOACH_BTP_AM.md) — popup hết hạn lúc thanh toán + câu hỏi bắt buộc khi check-out.
// Style thật của posgieo, kho v21 thật, Firebase giả (tests/lib/fakefb). Chạy: node tools/btp_am/e2e_btp_am.js
'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'posgieo.html'),'utf8');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const {extractRaw}=require(path.join(root,'tests/lib/extract'));
const fns=extractRaw('posgieo.html',['prepLotExpired','prepExpiryPlan','prepExpiryGateBeforePay','prepExpiryAsk','fmtPrepTime','prepExtendLotPOS','prepDiscardExpiredLotPOS','prepUntrackedSales','prepUntrackedAskOnCheckOut','renderPrepUntrackedAsk','prepUntrackedSubmit','prepSubNorm']);
const fake=fs.readFileSync(path.join(root,'tests/lib/fakefb.js'),'utf8').replace('module.exports =','window.__fakefb =');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');
 if(u.pathname==='/p'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style></head><body></body></html>');}
 const f=path.join(root,path.basename(u.pathname));if(fs.existsSync(f)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(f));}res.statusCode=404;res.end();});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p)),args:['--no-sandbox']});
 try{for(const width of [1366,390]){
  const page=await b.newPage({viewport:{width,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base+'/p');
  await page.addScriptTag({content:'(function(){const process={env:{}};'+fake+'})();'});
  await page.addScriptTag({url:base+'/unit_engine.v21.js'});
  await page.addScriptTag({content:`
   const NOW=Date.now(),iso=ms=>new Date(ms).toISOString(),day=new Date(NOW+7*3600000).toISOString().slice(0,10),yday=new Date(NOW+7*3600000-86400000).toISOString().slice(0,10);
   window.__fx=__fakefb.makeFake({rt:{active_units_gieogieo:{tc:{L1:{code:'TC01',unitBase:100,openedAt:NOW-6*3600000},L2:{code:'TC02',unitBase:400,openedAt:NOW-3600000}},cot:{E1:{code:'CS01',unitBase:300,openedAt:NOW-30*3600000}}}},fs:{
    'prep_items_gieogieo/tc':{name:'Thạch Cafe',unit:'g',costPerUnit:20,currentStock:500},'prep_items_gieogieo/cot':{name:'Trân châu HK',unit:'g',costPerUnit:30,currentStock:300},
    'prep_batches_gieogieo/L1':{prepId:'tc',prepName:'Thạch Cafe',unit:'g',batchCode:'TC01',status:'active',qtyRemaining:100,unitBase:100,shelfLifeType:'hours',finishedAt:iso(NOW-6*3600000),expiresAt:iso(NOW-2*3600000),businessDate:day,finishedBy:'Nguyễn Văn Bếp'},
    'prep_batches_gieogieo/L2':{prepId:'tc',prepName:'Thạch Cafe',unit:'g',batchCode:'TC02',status:'active',qtyRemaining:400,unitBase:400,shelfLifeType:'hours',finishedAt:iso(NOW-3600000),expiresAt:iso(NOW+3*3600000),businessDate:day},
    'prep_batches_gieogieo/E1':{prepId:'cot',prepName:'Trân châu HK',unit:'g',batchCode:'CS01',status:'active',qtyRemaining:300,unitBase:300,shelfLifeType:'endOfDay',finishedAt:iso(NOW-30*3600000),businessDate:yday},
    'prep_items_gieogieo/th':{name:'Thạch trà',unit:'g',untrackedPendingDelta:-300,substitutes:[{kind:'prep',id:'tc',ratio:1}]},
    'prep_transactions_gieogieo/s1':{prepId:'th',type:'CONSUMPTION',qty:-150,referenceId:'bill_1',businessDate:day,createdAt:iso(NOW-1800000)},
    'prep_transactions_gieogieo/s2':{prepId:'th',type:'CONSUMPTION',qty:-150,referenceId:'bill_2',businessDate:day,createdAt:iso(NOW-1200000)}
   }});
   window.fstore=__fx.fstore;window.db=__fx.db;window.firebase={firestore:{FieldValue:__fx.FieldValue}};
   UnitEngine.init({app:'pos',fstore,db,FieldValue:__fx.FieldValue,now:Date.now,storeId:'gg01',getItems:()=>[],state:{_shiftInventoryCountStatePOS:()=>({lines:[]})}});
   window.PREP_BATCHES_CACHE_POS=[];window.PREP_ITEMS_CACHE_POS=[];window.PREP_SHORTAGE_RECON_COLL='prep_shortage_recons_gieogieo';window.PREP_EXTEND_HOURS=24;
   window.round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;window.fmtPrepQty=n=>String(round2(n));window.escHtmlPos=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
   window.vnDate=x=>x?new Date(x):new Date();window.posDateKey=()=>day;window.toast=s=>{window.__toast=s};window.__printed=[];window.__checkout=0;
   window.POSTemPrinter={printPrepBatchLabel:async x=>{__printed.push(x);return true}};window.doCheckOut=async()=>{__checkout++};
   window.renderPinInput=id=>'<input id="'+id+'Pin" placeholder="PIN" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px">';
   window.resolveStaffPinWorkedToday=async id=>document.getElementById(id+'Pin')?.value==='1111'?{id:'e',fullName:'Lê Thị Lan'}:null;
   ['ensureRecipesLoadedPOS','ensureToppingRecipesLoadedPOS','ensurePackagingPresetsLoadedPOS','ensurePackagingItemOverridesLoadedPOS','ensurePackagingBaggingRulesLoadedPOS','ensurePackagingBaggingTableLoadedPOS'].forEach(n=>window[n]=async()=>({}));
   window.ensurePackagingRulesLoadedPOS=async()=>({rules:[],config:{}});window.__needs={tc:50};window.computeConsumptionForOrder=()=>({prepAgg:__needs});
  `});
  await page.addScriptTag({content:fns.replace(/^(async )?function (\w+)/gm,(m,a,n)=>'window.'+n+'='+(a||'')+'function '+n)});
  // A1. Lô hết hạn theo giờ → gia hạn 24 giờ + tem gia hạn.
  let gate=page.evaluate(()=>prepExpiryGateBeforePay([{}]));
  await page.locator('#prep-exp-overlay').waitFor();const t1=await page.locator('#prep-exp-overlay').innerText();
  assert(t1.includes('Thạch Cafe — lô TC01 đã hết hạn lúc')&&t1.includes('Vẫn còn dùng được'),width+': popup hết hạn');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+': không cuộn ngang');
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'btp_het_han_'+width+'.png')});
  await page.getByRole('button',{name:'Vẫn còn dùng được'}).click();await page.waitForTimeout(150);
  assert.equal(await page.locator('#prep-exp-overlay').count(),1,width+': chưa nhập PIN → chưa gia hạn');
  await page.locator('#prepExpStaffPin').fill('1111');await page.getByRole('button',{name:'Vẫn còn dùng được'}).click();
  assert.equal(await gate,true,width+': gia hạn xong → tiếp tục thanh toán');
  const L1=await page.evaluate(()=>__fx.FS['prep_batches_gieogieo/L1']);
  assert(Date.parse(L1.expiresAt)-Date.now()>23.9*3600000&&L1.expiryExtensions.length===1&&L1.expiryExtensions[0].byId==='e',width+': hạn mới +24h, lưu ai gia hạn');
  assert.equal(await page.evaluate(()=>__printed.length&&__printed[0].expiryExtensions.length),1,width+': in tem gia hạn');
  console.log('ok '+width+': lô hết hạn theo giờ → «Vẫn còn dùng được» (PIN) gia hạn 24 giờ + in tem gia hạn');
  // A2. Loại hết hạn cuối ngày (lô hôm qua) → chỉ «Hủy» → ghi đổ bỏ lô, thanh toán tiếp.
  await page.evaluate(()=>{__needs={cot:50}});gate=page.evaluate(()=>prepExpiryGateBeforePay([{}]));
  await page.locator('#prep-exp-overlay').waitFor();
  assert.equal(await page.getByRole('button',{name:'Vẫn còn dùng được'}).count(),0,width+': cuối ngày không có nút gia hạn');
  assert((await page.locator('#prep-exp-overlay').innerText()).includes('không được gia hạn'));
  await page.locator('#prepExpStaffPin').fill('1111');await page.getByRole('button',{name:'Hủy lô này'}).click();assert.equal(await gate,true);
  const w=await page.evaluate(()=>Object.values(__fx.FS).filter(d=>d&&d.type==='WASTE'&&d.prepId==='cot'));
  assert(w.length===1&&Math.abs(w[0].qty)===300&&/Hết hạn/.test(w[0].reason||w[0].note||''),width+': ghi đổ bỏ cả lô, có lý do');
  assert.equal(await page.evaluate(()=>__fx.FS['prep_batches_gieogieo/E1'].qtyRemaining),0);
  console.log('ok '+width+': loại hết hạn cuối ngày → chỉ «Hủy», ghi đổ bỏ lô qua Unit Engine, món vẫn bán');
  // A3. Quay lại giỏ hàng → chưa thanh toán. Lô còn hạn → không hỏi.
  await page.evaluate(()=>{const e=new Date(Date.now()-60000).toISOString();__fx.FS['prep_batches_gieogieo/L1'].expiresAt=e;PREP_BATCHES_CACHE_POS.forEach(x=>{if(x.id==='L1')x.expiresAt=e});__needs={tc:50}});
  gate=page.evaluate(()=>prepExpiryGateBeforePay([{}]));await page.locator('#prep-exp-overlay').waitFor();await page.getByRole('button',{name:'Quay lại giỏ hàng'}).click();assert.equal(await gate,false);
  await page.evaluate(()=>{__fx.FS['prep_batches_gieogieo/L1'].expiresAt=new Date(Date.now()+3600000).toISOString();PREP_BATCHES_CACHE_POS.length=0});
  assert.equal(await page.evaluate(()=>prepExpiryGateBeforePay([{}])),true);assert.equal(await page.locator('#prep-exp-overlay').count(),0,width+': còn hạn → không popup');
  console.log('ok '+width+': đóng popup = chưa thanh toán; lô còn hạn không hỏi');
  // B. Check-out: bán Thạch trà lúc không còn lô → phải trả lời; lưu câu trả lời rồi mới check-out.
  const shown=page.evaluate(()=>prepUntrackedAskOnCheckOut({id:'e',fullName:'Lê Thị Lan'},{id:'sh1',checkedInAt:new Date(Date.now()-3*3600000).toISOString()}));
  await page.locator('#prep-untracked-overlay').waitFor();assert.equal(await shown,true);
  const t2=await page.locator('#prep-untracked-overlay').innerText();const t2n=t2.replace(/\s+/g,' ');assert(t2n.includes('Thạch trà — 300 g')&&t2n.includes('Dùng Thạch Cafe thay')&&t2.includes('Không dùng gì'),width+': câu hỏi + lựa chọn từ cấu hình thay thế');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'btp_checkout_'+width+'.png')});
  await page.getByRole('button',{name:'Lưu & check-out'}).click();assert((await page.locator('#puaMsg').innerText()).includes('Trả lời hết'),width+': chưa trả lời → không check-out');
  await page.locator('#prep-untracked-overlay label',{hasText:'Thạch Cafe'}).click();await page.getByRole('button',{name:'Lưu & check-out'}).click();
  await page.waitForFunction(()=>__checkout===1);
  const rec=await page.evaluate(()=>__fx.FS['prep_shortage_recons_gieogieo/'+posDateKey()+'_th']);
  assert(rec&&rec.checkoutAnswers.sh1.choice==='sub:prep:tc'&&rec.checkoutAnswers.sh1.qty===300&&rec.checkoutAnswers.sh1.employeeId==='e',width+': lưu câu trả lời vào phiếu đối chiếu');
  assert.equal(await page.evaluate(()=>prepUntrackedAskOnCheckOut({id:'e',fullName:'Lê Thị Lan'},{id:'sh1',checkedInAt:new Date(Date.now()-3*3600000).toISOString()})),false,width+': đã trả lời → check-out không hỏi lại');
  console.log('ok '+width+': check-out bắt buộc trả lời đã dùng gì thay; lưu vào phiếu; không hỏi lại');
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await b.close();server.close();}
 console.log('ALL PASS');
})().catch(e=>{console.error(e);server.close();process.exit(1)});
