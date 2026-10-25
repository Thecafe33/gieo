// BTP âm trên POS (docs/KE_HOACH_BTP_AM.md) — kiểm hạn dùng lúc mở ca / chuông / trước check-out (KHÔNG hỏi lúc thanh toán)
// + câu hỏi bắt buộc khi check-out.
// Style thật của posgieo, kho v21 thật, Firebase giả (tests/lib/fakefb). Chạy: node tools/btp_am/e2e_btp_am.js
'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'posgieo.html'),'utf8');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const {extractRaw}=require(path.join(root,'tests/lib/extract')),{chromiumPath,serveFile}=require(path.join(root,'tests/lib/e2e'));
const fns=extractRaw('posgieo.html',['prepLotExpired','expiryCheckLines','expiryExtendTo','loadExpiryCheckLinesPOS','expirySoonLines','fmtPrepTime','expiryLineWhen','expiryCheckHTML','expiryCheckShow','expiryCheckClose','expiryCheckRefresh','expiryCheckAct','expiryCheckOpenSoon','expiryOpenDone','expiryAskOnCheckOut','_expSyncCaches','closeStockScanSheet','posDateKeyToDisplay','prepExtendLotPOS','nlExtendOpenUnitPOS','prepDiscardExpiredLotPOS','prepUntrackedSales','prepUntrackedAskOnCheckOut','renderPrepUntrackedAsk','prepUntrackedSubmit','prepSubNorm']);
const fake=fs.readFileSync(path.join(root,'tests/lib/fakefb.js'),'utf8').replace('module.exports =','window.__fakefb =');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');
 if(u.pathname==='/p'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style></head><body><div id="shiftBody" style="padding:12px"></div></body></html>');}
 if(serveFile(root,u.pathname,res))return;res.statusCode=404;res.end();});   // đường đầy đủ (js/posgieo/…) — tests/lib/e2e.js
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
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
    'prep_batches_gieogieo/L2':{prepId:'tc',prepName:'Thạch Cafe',unit:'g',batchCode:'TC02',status:'active',qtyRemaining:400,unitBase:400,shelfLifeType:'hours',finishedAt:iso(NOW-3600000),expiresAt:iso(NOW+40*3600000),businessDate:day},
    'stock_containers_gieogieo/N1':{itemId:'sua',itemName:'Sữa tươi',code:'SU01',unit:'ml',status:'open',unitBase:600,openedAt:iso(NOW-20*3600000),openedBy:'Lê Thị Lan',expiresAt:iso(NOW+60000)},
    'stock_containers_gieogieo/N2':{itemId:'kem',itemName:'Kem béo',code:'KB01',unit:'ml',status:'open',unitBase:200,openedAt:iso(NOW-30*3600000),expiresAt:iso(NOW-3600000)},
    ['daily_openings_gieogieo/'+day]:{openedAt:iso(NOW-3600000)},
    'prep_batches_gieogieo/E1':{prepId:'cot',prepName:'Trân châu HK',unit:'g',batchCode:'CS01',status:'active',qtyRemaining:300,unitBase:300,shelfLifeType:'endOfDay',finishedAt:iso(NOW-30*3600000),businessDate:yday},
    'prep_items_gieogieo/th':{name:'Thạch trà',unit:'g',untrackedPendingDelta:-300,substitutes:[{kind:'prep',id:'tc',ratio:1}]},
    'prep_transactions_gieogieo/s1':{prepId:'th',type:'CONSUMPTION',qty:-150,referenceId:'bill_1',businessDate:day,createdAt:iso(NOW-1800000)},
    'prep_transactions_gieogieo/s2':{prepId:'th',type:'CONSUMPTION',qty:-150,referenceId:'bill_2',businessDate:day,createdAt:iso(NOW-1200000)}
   }});
   window.fstore=__fx.fstore;window.db=__fx.db;window.firebase={firestore:{FieldValue:__fx.FieldValue}};
   UnitEngine.init({app:'pos',fstore,db,FieldValue:__fx.FieldValue,now:Date.now,storeId:'gg01',getItems:()=>[],state:{_shiftInventoryCountStatePOS:()=>({lines:[]})}});
   window.PREP_BATCHES_CACHE_POS=[];window.PREP_ITEMS_CACHE_POS=[];window.STOCK_OPEN_LIST=[];window._expWatchPrep=[];window._expCheck=null;window._expAfterSheet=null;window._expSoonSig='';window.EXP_SOON_MIN=30;
   window.loadOpenContainers=async()=>{STOCK_OPEN_LIST=(await fstore.collection('stock_containers_gieogieo').where('status','==','open').get()).docs.map(d=>({id:d.id,...d.data()}));return STOCK_OPEN_LIST};
   window.__opened=0;window.renderOpeningChecklist=async()=>{__opened++};window.renderFifoAlertBar=()=>{};window._fifoAlertExpanded=false;window.__finishSheet=[];window.openConfirmFinishSheet=c=>{__finishSheet.push(c.id)};window.PREP_SHORTAGE_RECON_COLL='prep_shortage_recons_gieogieo';window.PREP_EXTEND_HOURS=24;
   window.round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;window.fmtPrepQty=n=>String(round2(n));window.escHtmlPos=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
   window.vnDate=x=>x?new Date(x):new Date();window.posDateKey=()=>day;window.toast=s=>{window.__toast=s};window.__printed=[];window.__checkout=0;
   window.POSTemPrinter={printPrepBatchLabel:async x=>{__printed.push(x);return true},printOpenLabel:async x=>{__printed.push(x);return true}};window.doCheckOut=async()=>{__checkout++};
   window.renderPinInput=id=>'<input id="'+id+'Pin" placeholder="PIN" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px">';
   window.resolveStaffPinWorkedToday=async id=>document.getElementById(id+'Pin')?.value==='1111'?{id:'e',fullName:'Lê Thị Lan'}:null;
   ['ensureRecipesLoadedPOS','ensureToppingRecipesLoadedPOS','ensurePackagingPresetsLoadedPOS','ensurePackagingItemOverridesLoadedPOS','ensurePackagingBaggingRulesLoadedPOS','ensurePackagingBaggingTableLoadedPOS'].forEach(n=>window[n]=async()=>({}));
   window.ensurePackagingRulesLoadedPOS=async()=>({rules:[],config:{}});window.__needs={tc:50};window.computeConsumptionForOrder=()=>({prepAgg:__needs});
  `});
  await page.addScriptTag({content:fns.replace(/^(async )?function (\w+)/gm,(m,a,n)=>'window.'+n+'='+(a||'')+'function '+n)});
  // A1. Mở ca: lô hết hạn trong hôm nay (giờ VN) / đã quá hạn → kiểm ngay; lô còn hạn tới mai không hỏi.
  await page.evaluate(async()=>{expiryCheckShow({phase:'open',lines:await loadExpiryCheckLinesPOS()})});
  const sb=()=>page.locator('#shiftBody'),txt=async()=>(await sb().innerText()).replace(/\s+/g,' ');
  let t=await txt();
  assert(t.includes('Kiểm hạn dùng đầu ca')&&t.includes('Lô TC01')&&t.includes('Lô CS01')&&t.includes('Mã SU01')&&t.includes('Mã KB01')&&!t.includes('TC02'),width+': danh sách kiểm hạn '+t);
  assert(t.includes('không được gia hạn'),width+': loại cuối ngày ngày cũ ghi rõ không gia hạn');
  assert.equal(await page.evaluate(()=>_expCheck.lines.find(x=>x.code==='CS01').extendable),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+': không cuộn ngang');
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'kiem_han_dau_ca_'+width+'.png'),fullPage:true});
  const row=code=>sb().locator('.kc-sub',{hasText:code});
  await row('TC01').getByRole('button',{name:'Còn dùng được'}).click();await page.waitForTimeout(150);
  assert((await txt()).includes('TC01'),width+': chưa nhập PIN → chưa gia hạn');
  await page.locator('#expChkStaff_openPin').fill('1111');await row('TC01').getByRole('button',{name:'Còn dùng được'}).click();
  await page.waitForFunction(()=>!document.getElementById('shiftBody').innerText.includes('TC01'));
  const L1=await page.evaluate(()=>__fx.FS['prep_batches_gieogieo/L1']);
  assert(Math.abs(Date.parse(L1.expiresAt)-Date.now()-24*3600000)<120000&&L1.expiryExtensions.length===1&&L1.expiryExtensions[0].byId==='e'&&L1.expiryExtensions[0].source==='pos_open',width+': lô quá hạn → +24 giờ từ bây giờ, lưu ai gia hạn');
  assert.equal(await page.evaluate(()=>__printed.at(-1).id),'L1',width+': in tem gia hạn BTP');
  // NL còn hạn tới cuối ngày → gia hạn +24 giờ từ hạn cũ, in tem mở có dòng GIA HẠN.
  const n1Old=await page.evaluate(()=>__fx.FS['stock_containers_gieogieo/N1'].expiresAt);
  await page.locator('#expChkStaff_openPin').fill('1111');await row('SU01').getByRole('button',{name:'Còn dùng được'}).click();
  await page.waitForFunction(()=>!document.getElementById('shiftBody').innerText.includes('SU01'));
  const N1=await page.evaluate(()=>__fx.FS['stock_containers_gieogieo/N1']);
  assert.equal(Date.parse(N1.expiresAt)-Date.parse(n1Old),24*3600000,width+': NL +24 giờ tính từ hạn cũ');
  assert(N1.expiryExtensions.length===1&&N1.status==='open'&&N1.unitBase===600,width+': chỉ đổi hạn, không đổi số / trạng thái');
  // NL bỏ đi → mở đúng màn Báo hết hiện có; đóng màn → đọc lại danh sách.
  await row('KB01').getByRole('button',{name:'Bỏ đi'}).click();
  assert.deepEqual(await page.evaluate(()=>__finishSheet),['N2'],width+': NL bỏ đi = màn Báo hết hiện có');
  await page.evaluate(()=>{__fx.FS['stock_containers_gieogieo/N2'].status='finished';closeStockScanSheet()});
  await page.waitForFunction(()=>!document.getElementById('shiftBody').innerText.includes('KB01'));
  // Loại cuối ngày ngày cũ → chỉ «Bỏ đi» → ghi đổ bỏ cả lô; hết việc → dấu đã kiểm + sang bước đầu ca tiếp theo.
  assert.equal(await row('CS01').getByRole('button',{name:'Còn dùng được'}).count(),0,width+': cuối ngày không có nút gia hạn');
  await page.locator('#expChkStaff_openPin').fill('1111');await row('CS01').getByRole('button',{name:'Bỏ đi'}).click();
  await page.waitForFunction(()=>__opened===1);
  const w=await page.evaluate(()=>Object.values(__fx.FS).filter(d=>d&&d.type==='WASTE'&&d.prepId==='cot'));
  assert(w.length===1&&Math.abs(w[0].qty)===300&&/kiểm đầu ca/.test(w[0].reason||w[0].note||''),width+': ghi đổ bỏ cả lô, có lý do');
  assert.equal(await page.evaluate(()=>__fx.FS['prep_batches_gieogieo/E1'].qtyRemaining),0);
  assert.ok(await page.evaluate(()=>__fx.FS['daily_openings_gieogieo/'+posDateKey()].expiryCheckedAt),width+': ghi dấu đã kiểm hạn hôm nay');
  console.log('ok '+width+': mở ca kiểm hạn — BTP / NL gia hạn (PIN, +24 giờ, tem), NL bỏ đi qua màn Báo hết, cuối ngày chỉ bỏ đi, ghi dấu đã kiểm');
  // A2. Chuông: chỉ dữ liệu trong máy, lô còn ≤ 30 phút; «Để sau» đóng, không chặn gì.
  await page.evaluate(()=>{PREP_BATCHES_CACHE_POS=[{id:'S1',prepId:'tc',prepName:'Thạch Cafe',unit:'g',batchCode:'TC09',status:'active',qtyRemaining:200,shelfLifeType:'hours',expiresAt:new Date(Date.now()+20*60000).toISOString()}]});
  assert.deepEqual(await page.evaluate(()=>expirySoonLines().map(x=>x.code)),['TC09'],width+': chuông thấy lô còn 20 phút, không thấy lô còn lâu');
  await page.evaluate(()=>{__fx.FS['prep_batches_gieogieo/S1']={...PREP_BATCHES_CACHE_POS[0]};delete __fx.FS['prep_batches_gieogieo/S1'].id;});
  await page.evaluate(()=>expiryCheckOpenSoon());await page.locator('#exp-check-overlay').waitFor();
  assert((await page.locator('#exp-check-overlay').innerText()).includes('TC09'));
  await page.getByRole('button',{name:'Để sau'}).click();assert.equal(await page.locator('#exp-check-overlay').count(),0);
  console.log('ok '+width+': chuông nhắc lô sắp hết hạn (≤ 30 phút), mở lúc rảnh, «Để sau» không chặn');
  // A3. Check-out: còn lô ĐÃ quá hạn → xử lý rồi tự check-out; không còn → không hỏi.
  await page.evaluate(()=>{__fx.FS['prep_batches_gieogieo/S1'].expiresAt=new Date(Date.now()-60000).toISOString();__checkout=0});
  assert.equal(await page.evaluate(()=>expiryAskOnCheckOut()),true);await page.locator('#exp-check-overlay').waitFor();
  assert((await page.locator('#exp-check-overlay').innerText()).includes('Còn lô đã quá hạn'));
  await page.locator('#expChkStaff_checkoutPin').fill('1111');await page.locator('#exp-check-overlay .kc-sub',{hasText:'TC09'}).getByRole('button',{name:'Bỏ đi'}).click();
  await page.waitForFunction(()=>__checkout===1);assert.equal(await page.locator('#exp-check-overlay').count(),0);
  assert.equal(await page.evaluate(()=>expiryAskOnCheckOut()),false,width+': hết lô quá hạn → check-out không hỏi');
  await page.evaluate(()=>{__checkout=0});
  console.log('ok '+width+': check-out — lô đã quá hạn phải xử lý, xong tự check-out');
  // B. Check-out: bán Thạch trà lúc không còn lô → phải trả lời; lưu câu trả lời rồi mới check-out.
  const shown=page.evaluate(()=>prepUntrackedAskOnCheckOut({id:'e',fullName:'Lê Thị Lan'},{id:'sh1',checkedInAt:new Date(Date.now()-3*3600000).toISOString()}));
  await page.locator('#prep-untracked-overlay').waitFor();assert.equal(await shown,true);
  const t2=await page.locator('#prep-untracked-overlay').innerText();const t2n=t2.replace(/\s+/g,' ');assert(t2n.includes('Thạch trà 300 g')&&t2n.includes('Dùng Thạch Cafe thay')&&t2.includes('Không dùng gì'),width+': câu hỏi + lựa chọn từ cấu hình thay thế');
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
