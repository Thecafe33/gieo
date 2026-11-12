'use strict';
// RÀ trừ kho lúc BÁN (NL có tem) bằng hàm thật của POS + UnitEngine v21 trên Firebase giả.
const R=require('node:path').join(__dirname,'../..')+'/';
const { runWrapped } = require(R+'tests/lib/wrap_harness');
const MONTH_KEYS = ['thang01','thang02','thang03','thang04','thang05','thang06','thang07','thang08','thang09','thang10','thang11','thang12'];
const ORDER = { billCode:'B001', date:'28/09/2026', total:30000, itemsArray:[{name:'Trà sữa',size:'M',qty:1,price:30000,toppings:[]}], items:'x', addons:[], isToGo:true, createdAt:new Date().toISOString() };
const seed = () => ({
  rt: { active_units_gieogieo: { X: { A: { code:'AAA', unitBase:200, capacity:1000, openedAt:1 } } }, orders_gieogieo: { thang09: { 28: { bill_o1: JSON.parse(JSON.stringify(ORDER)), bill_o2: JSON.parse(JSON.stringify({...ORDER,billCode:'B002'})) } } } },
  fs: { 'inventory_items_gieogieo/X': { name:'Sữa', unit:'ml', trackingMode:'unit', currentStock:200, costPerUnit:10, countUnitName:'Hộp', packagingUnits:[{name:'Hộp',baseQty:1000}] },
        'stock_containers_gieogieo/A': { itemId:'X', itemName:'Sữa', code:'AAA', status:'open', unitBase:200, baseQty:1000, unit:'ml' } }
});
const calc = () => ({ agg:{ X:50 }, prepAgg:{}, skipped:[] });
const EXPORTS = ['delOrderConfirm','applySalesConsumptionPOS','_applySalesConsumptionCorePOS','removeBillSideRecordsPOS'];
const spec = (flow, extra) => ({ app:'pos', target:'applySalesConsumptionPOS', exports:EXPORTS, helpers:['_ueWarnGogsConsumptionFailed'], seed:seed(),
  scope:(fake,rec)=>{ const o={id:'bill_o1',...JSON.parse(JSON.stringify(ORDER))}; o.items=o.itemsArray; const o2={id:'bill_o2',...JSON.parse(JSON.stringify(ORDER)),billCode:'B002'}; o2.items=o2.itemsArray;
   return Object.assign({ MONTH_KEYS, orders:[o,o2], curOid:'bill_o1', _deletingOrderIds:new Set(), _consumptionInflightPOS:new Map(), _salesConsumeChains:new Map(),
    resolveStaffPinAndCheckin:async()=>({fullName:'NV A',id:'e1'}), posConfirm:async()=>true, fmt:n=>String(n), toast:rec('toast'), toastAutoReport:rec('toastAutoReport'), showDet:rec('showDet'), showScreen:rec('showScreen'), refreshFifoAlert:async()=>{},
    trackConsumptionPOS:(id,p)=>p, ensureRecipesLoadedPOS:async()=>({}), ensureToppingRecipesLoadedPOS:async()=>({}), ensurePackagingPresetsLoadedPOS:async()=>({}), ensurePackagingItemOverridesLoadedPOS:async()=>({}),
    ensurePackagingBaggingRulesLoadedPOS:async()=>({}), ensurePackagingRulesLoadedPOS:async()=>({rules:[],config:{}}), ensurePackagingBaggingTableLoadedPOS:async()=>({}), computeConsumptionForOrder:calc,
    reportMissingRecipePOS:()=>{}, prepSugOnUsage:()=>{}, _loadLocDeductedForOrderPOS:async()=>({fifoMap:{}}), _loadPrepUnitAllocationsForOrderPOS:async()=>({}), posDateKey:()=>'2026-09-28',
    getPrimaryRefillRulePOS:()=>null, getBiggestPackagingUnitPOS:()=>null, STOCK_CONTAINERS_COLL:'stock_containers_gieogieo', removeBillSideRecordsPOS:async()=>{} }, extra||{}); },
  call:flow });
const st = r => ({ temRT:r.rt.active_units_gieogieo.X?.A?.unitBase, temFS:r.fs['stock_containers_gieogieo/A'].unitBase, tonSo:r.fs['inventory_items_gieogieo/X'].currentStock,
  so:Object.entries(r.fs).filter(([p])=>p.startsWith('stock_transactions_gieogieo/')).map(([p,d])=>p.split('/')[1]+':'+d.type+':'+d.qty+(d.fifoAllocations||d.meta?.fifoAllocations?'':' (không gắn tem)')),
  canhBao:Object.entries(r.fs).filter(([p])=>p.startsWith('alerts_gieogieo/')).map(([p,d])=>d.type),
  soLech:Object.entries(r.fs).filter(([p])=>p.startsWith('stock_anomalies_gieogieo/')).map(([p,d])=>d.kind+':'+d.qty+':'+d.status+':'+(d.referenceId||'')),
  vuLech:Object.entries(r.fs).filter(([p])=>p.startsWith('duty_cases_gieogieo/')).map(([p,d])=>d.type+':'+d.status+':'+JSON.stringify(d.qty??d.lossQty??d.diff??'')) });
const show=(name,r,note)=>console.log('\n== '+name+'\n  '+JSON.stringify(st(r))+(note?'\n  → '+note:''));
const failRtOnce=(fake)=>{ const orig=fake.db.ref.bind(fake.db); let done=false; fake.db.ref=p=>{const r=orig(p);const t=r.transaction.bind(r);r.transaction=async(fn,...a)=>{ if(!done&&/active_units_gieogieo\/X$/.test(String(p))){done=true;console.log('   (giả lập: RT lỗi ở '+p+')');throw new Error('disconnect');} return t(fn,...a);};return r;}; };
const pinOk = base => { base.document.getElementById('del-pin-input').value='3367'; };
(async()=>{
  { const r=await runWrapped('engine',spec(async(F,fake,base)=>{ await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); }));
    show('0. Bán bình thường 50 (mốc)',r,'đúng: tem 200→150, tồn sổ 150, một dòng sổ gắn tem'); }
  { const r=await runWrapped('engine',spec(async(F,fake,base)=>{ await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); }));
    show('1. Gọi trừ kho HAI lần cho cùng bill',r,'kỳ vọng: vẫn 150'); }
  { const r=await runWrapped('engine',spec(async(F,fake,base)=>{ failRtOnce(fake); await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); }));
    show('2. RT lỗi đúng lúc bán bill 1',r,'hàng thật đã ra 50; xem tem / tồn sổ có trừ không'); }
  { const r=await runWrapped('engine',spec(async(F,fake,base)=>{ failRtOnce(fake); await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); await F.applySalesConsumptionPOS(base.orders[1],'bill_o2','2026-09-28'); }));
    show('3. RT lỗi ở bill 1, bill 2 bán bình thường',r,'hàng thật đã ra 100 → đúng phải còn 100'); }
  { const r=await runWrapped('engine',spec(async(F,fake,base)=>{ failRtOnce(fake); await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); pinOk(base); await F.delOrderConfirm(); }));
    show('4. RT lỗi ở bill 1 rồi XOÁ bill 1',r,'bill xoá = hàng coi như chưa bán → đúng phải 200 / 200'); }
  { // 3b: RT lỗi ở bill 1, bill 2 bình thường, CUỐI CA cân mã: thực còn 100
    const r=await runWrapped('engine',spec(async(F,fake,base)=>{ failRtOnce(fake); await F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); await F.applySalesConsumptionPOS(base.orders[1],'bill_o2','2026-09-28');
      await new Promise(x=>setTimeout(x,100));
      const U=base.UnitEngine,live=fake.rtGet('active_units_gieogieo/X/A');
      const l={itemId:'X',itemName:'Sữa',unit:'ml',mode:'tem',units:[{id:'A',code:'AAA',openedAt:1,capacity:1000,state:'confirmed',weighed:100,baseline:live.unitBase,baselineSig:U.shift.absSig(live),countedAt:new Date().toISOString(),seq:0,gone:false,weighings:[]}]};
      try{ const out=await U.shift.applyLine(l,'2026-09-28',{id:'e1',fullName:'NV A'},'seed1'); console.log('   cân cuối ca:',JSON.stringify(out).slice(0,200)); }catch(e){console.log('   cân cuối ca lỗi:',e.code,e.message.slice(0,120));}
      if(U.duty&&U.duty.flush)await U.duty.flush(); await new Promise(x=>setTimeout(x,100)); }));
    show('3b. RT lỗi ở bill 1 + bill 2 bình thường + CÂN cuối ca (thực còn 100)',r,'50 của bill 1: vừa nằm ở Sổ lệch, vừa thành hao hụt cân?'); }
  { // app tắt sau khi RT trừ xong nhưng trước khi ghi sổ
    const r=await runWrapped('engine',spec(async(F,fake,base)=>{ const rt=fake.fstore.runTransaction.bind(fake.fstore); let killed=false; fake.fstore.runTransaction=fn=>{ if(!killed){killed=true;return new Promise(()=>{});} return rt(fn); };
      F.applySalesConsumptionPOS(base.orders[0],'bill_o1','2026-09-28'); await new Promise(x=>setTimeout(x,300)); fake.fstore.runTransaction=rt;
      /* mở lại app: không có gì chạy lại; bán bill 2 */ await F.applySalesConsumptionPOS(base.orders[1],'bill_o2','2026-09-28'); }));
    show('5. App tắt GIỮA trừ tem và ghi sổ của bill 1, sau đó bán bill 2',r,'hàng thật ra 100 → tem đúng phải 100; sổ đúng phải có 2 dòng'); }
})().catch(e=>{console.error(e);process.exit(1);});
