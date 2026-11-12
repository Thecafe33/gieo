'use strict';
// [F1 12/11/2026 — docs/KE_HOACH_FIX_TRU_KHO_HAO_HUT_12-11.md] Engine 2 (store v5) KHÔNG quy trách nhiệm cho phần hao hụt đã có Sổ lệch giải thích
// (bán khi chưa có tem mở / lỗi kết nối lúc trừ tem). Kho chạy bằng mã thật (functions/automation/engine.js) trên Firebase giả.
//  a. Tình huống A của tools/ra_soat/ban_khi_chua_mo_tem.js qua finish() → 0 phân bổ, không nâng mức, quan sát không học.
//  b. Hao hụt 80 có Sổ lệch 50 → chỉ 30 phân bổ (tiền chia theo tỷ lệ).
//  c. Sổ lệch ngoài khoảng / món khác / đã đóng → không trừ.
//  d. Hụt cân cuối ca có Sổ lệch (rt_error) → như (a).
//  e. Một dòng Sổ lệch chỉ giải thích một hồ sơ; Engine 2 không sửa Sổ lệch.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const {create}=require('../unit_engine2_store_v5');
const A=require('../unit_engine2_audit_v1');
const {makeFake}=require('./lib/fakefb');
const {createEngine}=require('../functions/automation/engine');
const ROOT=E.rootPath('gg01');
const CFG={enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',settingsRevision:1};
const shift=(id,from,to)=>['employee_shifts_gieogieo/'+id,{employeeId:id,employeeName:id.toUpperCase(),roles:['barista'],checkedInAt:from,checkedOutAt:to}];
const caseOf=(f,id)=>f.FS[ROOT+'/cases/'+E.key('finish',id)];
const anomalies=f=>Object.entries(f.FS).filter(([p])=>p.startsWith('stock_anomalies_gieogieo/')).map(([p,d])=>({id:p.split('/')[1],...d}));

(async()=>{
 // ── a. Bán 50 khi chưa quét mở → quét mở → bán 950 → báo hết (hộp thật rỗng) ───────────────────────────────
 {
  let now=Date.parse('2026-10-22T03:00:00Z');
  const item={id:'X',name:'Sữa',unit:'ml',trackingMode:'unit',stockManaged:true,currentStock:1000,costPerUnit:10,packagingUnits:[{name:'Hộp',baseQty:1000}],countUnitName:'Hộp'};
  const f=makeFake({rt:{},fs:{[ROOT]:{...CFG},'inventory_items_gieogieo/X':item,'stock_containers_gieogieo/B':{itemId:'X',itemName:'Sữa',code:'BBB',status:'sealed',baseQty:1000,unit:'ml'},
   'price_history_gieogieo/p':{itemId:'X',effectiveFrom:'2026-09-01',price:10},...Object.fromEntries([shift('a','2026-10-22T01:00:00.000Z','2026-10-22T12:00:00.000Z'),shift('b','2026-10-22T01:00:00.000Z','2026-10-22T12:00:00.000Z')])}});
  const e=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>now,items:[item]});
  const sell=async(bill,qty)=>{const al=await e.consume.allocate('X',qty,undefined,{type:'order',id:bill,duringPrepLock:true}).catch(()=>[]);
   await e.ledger.apply({itemId:'X',type:'CONSUMPTION',qty:-qty,note:'bán',staff:'',referenceId:bill,deriveFromUnits:al.length>0,businessDate:'2026-10-22',txId:bill+'_ing_X',duringPrepLock:true,...(al.length?{meta:{fifoAllocations:al}}:{})});};
  await sell('bill_1',50);now+=600000;
  const ref=f.fstore.collection('stock_containers_gieogieo').doc('B');
  // Kho v21: mở tem KHÔNG gánh khoản bán trước khi quét (đó là việc F2 / kho v22) — giữ nguyên để thử đúng chuỗi lỗi L1.
  await ref.update({status:'open',openedAt:new Date(now).toISOString()});
  await e.fn.unitEngineOnOpen('B',{itemId:'X',itemName:'Sữa',code:'BBB',baseQty:1000,unit:'ml'});now+=3600000;
  await sell('bill_2',950);now+=3600000;
  await e.fn.unitEngineFinishOpenUnit('B',{...f.FS['stock_containers_gieogieo/B'],itemId:'X',code:'BBB',unit:'ml'},{id:'a',fullName:'A'},'Hết',true,ref,'',true);
  assert.equal(f.FS['stock_transactions_gieogieo/finish_B_WASTE'].qty,-50,'kho v21 ghi WASTE −50 (chuỗi L1)');
  const before=JSON.stringify(anomalies(f));
  const s=create({storeId:'gg01',fstore:f.fstore,now:()=>now+60000});
  await s.finish('finish_B_WASTE');
  const c=caseOf(f,'finish_B_WASTE');
  assert(c,'có hồ sơ');assert.equal(c.basis,'anomaly_explained');assert.equal(c.status,'decided');
  assert.deepEqual(c.allocations,[]);assert.equal(c.quantity,50);assert.equal(c.pending.qty,50);assert.equal(c.pending.value,500);
  assert.deepEqual(c.explainedByAnomaly.anomalyIds,[anomalies(f)[0].id]);assert.deepEqual(c.explainedByAnomaly.kinds,['no_open_tem']);
  assert(!f.FS[ROOT+'/controls/X'],'không nâng mức kiểm soát');assert(!(f.FS[ROOT].controlledItemIds||[]).includes('X'),'không thêm món vào danh sách kiểm soát');
  const ob=Object.entries(f.FS).find(([p])=>p.startsWith(ROOT+'/obs/'))[1];assert.equal(ob.verified,false);assert.equal(ob.reason,'Có Sổ lệch chưa đối trừ');
  assert.equal(JSON.stringify(anomalies(f)),before,'Engine 2 chỉ đọc Sổ lệch');
  // chạy lại: không ghi gì thêm (dấu vân tay giữ)
  const rev=c.revision;await s.finish('finish_B_WASTE');assert.equal(caseOf(f,'finish_B_WASTE').revision,rev);
  // kiểm toán độc lập: không vi phạm
  const r=await A.run({storeId:'gg01',from:'2026-10-21',to:'2026-10-23',fstore:f.fstore});
  assert.equal(r.violations,0,A.summary(r));assert.equal(r.warnings,0,A.summary(r));assert(r.coverage.cases>=1);
  // cài lỗi: hồ sơ được giải thích mà vẫn phân bổ / dòng Sổ lệch không có thật / vẫn nâng mức / hồ sơ cũ bỏ qua Sổ lệch
  const P=ROOT+'/cases/'+E.key('finish','finish_B_WASTE'),D=ROOT+'/decisions/'+c.decisionId,clone=v=>JSON.parse(JSON.stringify(v));
  const fault=async(mut,code)=>{const FS=clone(f.FS);mut(FS);const rr=await A.run({storeId:'gg01',from:'2026-10-21',to:'2026-10-23',fstore:makeFake({fs:FS}).fstore});assert(rr.issues.some(i=>i.code===code),code+'\n'+A.summary(rr));};
  await fault(FS=>{for(const k of [P,D])Object.assign(FS[k],{basis:'policy_equal_share',allocations:[{employeeId:'a',employeeName:'A',qty:25,value:250},{employeeId:'b',employeeName:'B',qty:25,value:250}],pending:null});},'ANOMALY_EXPLAINED_BUT_ALLOCATED');
  await fault(FS=>{FS[P].explainedByAnomaly.anomalyIds=['khong_co'];},'ANOMALY_EXPLAIN_UNSUPPORTED');
  await fault(FS=>{FS[ROOT+'/controls/X']={itemId:'X',level:2,manualFloor:0,storeId:'gg01',reasonCaseIds:[FS[P].id]};FS[ROOT].controlledItemIds=['X'];},'ANOMALY_EXPLAINED_CONTROL');
  await fault(FS=>{for(const k of [P,D]){delete FS[k].explainedByAnomaly;Object.assign(FS[k],{basis:'policy_equal_share',allocations:[{employeeId:'a',employeeName:'A',qty:25,value:250},{employeeId:'b',employeeName:'B',qty:25,value:250}],pending:null});}},'ANOMALY_NOT_DEDUCTED');
  console.log('ok a. Tình huống A (bán trước khi quét mở → báo hết dư 50): 0 phân bổ, không nâng mức, quan sát không học, Sổ lệch không bị sửa');
 }

 // ── b / c. Dữ liệu dựng tay: báo hết dư 80 ─────────────────────────────────────────────────────────────────
 const OPEN='2026-10-22T02:00:00.000Z',FIN='2026-10-22T10:00:00.000Z';
 const seed=extra=>makeFake({fs:{[ROOT]:{...CFG},
  'stock_transactions_gieogieo/finish_K_WASTE':{itemId:'Y',referenceId:'K',type:'WASTE',qty:-80,createdAt:FIN,businessDate:'2026-10-22',note:'Báo hết'},
  'stock_containers_gieogieo/K':{itemId:'Y',itemName:'Đường',unit:'g',baseQty:1000,openedAt:OPEN,finishedAt:FIN,status:'finished',wasteBase:80,wasteBasis:'unit_engine'},
  'inventory_items_gieogieo/Y':{name:'Đường',unit:'g',costPerUnit:10},'price_history_gieogieo/p':{itemId:'Y',effectiveFrom:'2026-09-01',price:10},
  ...Object.fromEntries([shift('a','2026-10-22T01:00:00.000Z','2026-10-22T12:00:00.000Z'),shift('b','2026-10-22T01:00:00.000Z','2026-10-22T12:00:00.000Z')]),...extra}});
 const an=(id,o)=>['stock_anomalies_gieogieo/'+id,{itemId:'Y',itemName:'Đường',unit:'g',qty:-50,kind:'no_open_tem',txType:'CONSUMPTION',status:'open',createdAt:'2026-10-22T05:00:00.000Z',businessDate:'2026-10-22',...o}];
 const decide=async f=>{await create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(FIN)+60000}).finish('finish_K_WASTE');return caseOf(f,'finish_K_WASTE');};
 {
  const f=seed(Object.fromEntries([an('t1',{})]));const c=await decide(f);
  assert.equal(c.basis,'policy_equal_share');assert.equal(c.quantity,80);assert.equal(c.amount,800);
  assert.deepEqual(c.allocations.map(a=>[a.employeeId,a.qty,a.value]),[['a',15,150],['b',15,150]]);
  assert.deepEqual(c.pending,{qty:50,value:500});assert.equal(c.explainedByAnomaly.qty,50);
  assert.equal(f.FS[ROOT+'/controls/Y'].level,2,'phần còn lại là hao hụt thật → vẫn nâng mức');
  const r=await A.run({storeId:'gg01',from:'2026-10-21',to:'2026-10-23',fstore:f.fstore});assert.equal(r.violations,0,A.summary(r));
  console.log('ok b. Hao hụt 80, Sổ lệch 50 → 30 phân bổ (15 + 15), 50 để ngoài; phần còn lại vẫn nâng mức');
 }
 {
  // trước lúc mở tem (bán khi chưa quét mở) trong 3 ngày → được tính; hai dòng cộng dồn, lấy tới đủ lượng hao hụt
  const f=seed(Object.fromEntries([an('p1',{createdAt:'2026-10-21T20:00:00.000Z',qty:-30}),an('p2',{kind:'rt_error',qty:-70})]));const c=await decide(f);
  assert.equal(c.basis,'anomaly_explained');assert.deepEqual(c.explainedByAnomaly.anomalyIds,['p1','p2']);assert.equal(c.explainedByAnomaly.qty,80);
  console.log('ok b2. Sổ lệch trước lúc quét mở (≤ 3 ngày) + rt_error lúc tem mở → giải thích hết, lấy tới đủ lượng hao hụt');
 }
 {
  const f=seed(Object.fromEntries([an('old',{createdAt:'2026-10-18T00:00:00.000Z'}),an('after',{createdAt:'2026-10-22T11:00:00.000Z'}),an('other',{itemId:'Z'}),an('closed',{status:'resolved'}),
   an('pos',{qty:50}),an('waste',{kind:'waste_no_tem'}),an('done',{absorbedQty:50,absorbedBy:'Q'})]));
  const c=await decide(f);
  assert.equal(c.basis,'policy_equal_share');assert(!c.explainedByAnomaly);assert.deepEqual(c.allocations.map(a=>a.qty),[40,40]);assert(!c.pending);
  console.log('ok c. Sổ lệch ngoài khoảng / sau báo hết / món khác / đã đóng / dương / loại khác / đã gánh hết → không trừ');
 }
 {
  // cùng dòng Sổ lệch không giải thích hai hồ sơ: tem K2 báo hết sau, cửa sổ chứa cùng dòng t1
  const f=seed(Object.fromEntries([an('t1',{}),
   ['stock_transactions_gieogieo/finish_K2_WASTE',{itemId:'Y',referenceId:'K2',type:'WASTE',qty:-40,createdAt:FIN,businessDate:'2026-10-22',note:'Báo hết'}],
   ['stock_containers_gieogieo/K2',{itemId:'Y',itemName:'Đường',unit:'g',baseQty:1000,openedAt:'2026-10-22T03:00:00.000Z',finishedAt:FIN,status:'finished',wasteBase:40,wasteBasis:'unit_engine'}]]));
  await decide(f);const s=create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(FIN)+60000});await s.finish('finish_K2_WASTE');
  const c2=caseOf(f,'finish_K2_WASTE');assert(!c2.explainedByAnomaly);assert.deepEqual(c2.allocations.map(a=>a.qty),[20,20]);
  // chạy lại hồ sơ đầu: vẫn giữ dòng của nó
  await s.finish('finish_K_WASTE');assert.deepEqual(caseOf(f,'finish_K_WASTE').explainedByAnomaly.anomalyIds,['t1']);
  console.log('ok e. Một dòng Sổ lệch chỉ giải thích MỘT hồ sơ (hồ sơ sau phân bổ đủ)');
 }

 // ── d. Hụt cân cuối ca có Sổ lệch rt_error → không phân bổ ───────────────────────────────────────────────────
 {
  const item={id:'j',name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:300,costPerUnit:100,packagingUnits:[]};
  const f=makeFake({rt:{active_units_gieogieo:{j:{n:{code:'NEXT0001',unitBase:300,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}}}},fs:{
   [ROOT]:{...CFG,controlledItemIds:['j']},[ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1,manualFloor:0,storeId:'gg01'},
   'inventory_items_gieogieo/j':item,'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
   'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:300,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
   'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
   'stock_anomalies_gieogieo/tx_r1':{itemId:'j',itemName:'Thạch',unit:'g',qty:-50,kind:'rt_error',txType:'CONSUMPTION',status:'open',createdAt:'2026-10-21T09:00:00.000Z',businessDate:'2026-10-21'},
   ...Object.fromEntries([shift('a','2026-10-21T02:00:00.000Z','2026-10-21T13:00:00.000Z'),shift('b','2026-10-22T02:00:00.000Z','2026-10-22T13:00:00.000Z')])}});
  const current=Date.parse('2026-10-22T04:00:00Z');
  const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>current,items:[item]});
  const s=create({storeId:'gg01',fstore:f.fstore,now:()=>current,inventory:inv});
  await s.ensureCloseTasks('2026-10-22','first');const task=E.key('day_close','2026-10-22','j','first'),live=f.rtGet('active_units_gieogieo/j/n');
  const line={itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:'2026-10-22',sessionId:'first',units:[{id:'n',code:'NEXT0001',capacity:500,state:'confirmed',openedAt:live.openedAt,baseline:300,weighed:250,baselineSig:inv.shift.absSig(live),countedAt:'2026-10-22T03:00:00.000Z',seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:100,grossG:350}]}]};
  const id=await s.requestMeasurement(task,line,{id:'b',fullName:'B'});await s.drain(E.key('measurement',id));
  const c=f.FS[ROOT+'/cases/'+E.key('weigh',id,'n')];
  assert(c,'có hồ sơ cân');assert.equal(c.quantity,50);assert.equal(c.basis,'anomaly_explained');assert.deepEqual(c.allocations,[]);assert.deepEqual(c.explainedByAnomaly.anomalyIds,['tx_r1']);
  const ob=Object.entries(f.FS).find(([p,d])=>p.startsWith(ROOT+'/obs/')&&d.measurementId===id)[1];assert.equal(ob.verified,false);
  assert.equal(f.FS['stock_anomalies_gieogieo/tx_r1'].status,'open','không đóng Sổ lệch');
  const r=await A.run({storeId:'gg01',from:'2026-10-21',to:'2026-10-23',fstore:f.fstore});assert.equal(r.violations,0,A.summary(r));
  console.log('ok d. Hụt cân 50 có Sổ lệch rt_error 50 → 0 phân bổ, quan sát không học');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
