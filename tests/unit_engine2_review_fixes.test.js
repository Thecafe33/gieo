'use strict';
// Rà soát trước triển khai Engine 2 (23/10, commit 6be72cc) — mỗi mục có ca tái hiện riêng. Firestore giả nay cấm đọc sau ghi.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const L=require('../unit_engine2_learn_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const {createEngine}=require('../functions/automation/engine');
const vm=require('node:vm'),fsx=require('node:fs'),path=require('node:path');
const {cleanState}=require('./lib/engine2_fixture');
const clone=v=>JSON.parse(JSON.stringify(v));
const X=require('../unit_engine2_export_v2');const A=require('../unit_engine2_audit_v1');
const os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=E.rootPath('gg01');
const T0=Date.parse('2026-10-22T04:00:00Z');
function stock(extra={},cfg={},rtExtra={}){
 let current=T0;const item={id:'j',name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:280,costPerUnit:100,packagingUnits:[]};
 const f=makeFake({rt:{active_units_gieogieo:{j:{n:{code:'NEXT0001',unitBase:280,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}}},...rtExtra},fs:{
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,controlledItemIds:['j'],...cfg},
  [ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1},
  'inventory_items_gieogieo/j':item,'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:280,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
  'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
  'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
  'employee_shifts_gieogieo/a':{employeeId:'a',employeeName:'A',roles:['barista'],checkedInAt:'2026-10-21T02:00:00.000Z',checkedOutAt:'2026-10-21T13:00:00.000Z'},
  'employee_shifts_gieogieo/b':{employeeId:'b',employeeName:'B',roles:['barista'],checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'},...extra}});
 const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>current,items:[item]});
 return {f,inv,item,tick:ms=>{current+=ms},now:()=>current};
}
async function line(ctx,cycle,baseline,weighed,at,tare=100){
 const live=ctx.f.rtGet('active_units_gieogieo/j/n');
 return {itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:'2026-10-22',sessionId:cycle,units:[{id:'n',code:'NEXT0001',capacity:500,state:'confirmed',openedAt:live.openedAt,baseline,weighed,baselineSig:ctx.inv.shift.absSig(live),countedAt:at,seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:tare,grossG:weighed+tare}]}]};
}

(async()=>{
 // ── 1. Mất ACK sau khi kho đã ghi; bì đổi trước lần thử lại → vẫn phục hồi theo receipt, không bỏ rơi hao hụt ──
 {
  const c=stock();let lose=true;
  const adapter={...c.inv,shift:{...c.inv.shift,applyLine:async(...a)=>{const r=await c.inv.shift.applyLine(...a);if(lose){lose=false;throw Error('ACK_LOST');}return r;}}};
  const s=create({storeId:'gg01',fstore:c.f.fstore,now:c.now,inventory:adapter});
  await s.ensureCloseTasks('2026-10-22','c1');const task=E.key('day_close','2026-10-22','j','c1');
  const id=await s.requestMeasurement(task,await line(c,'c1',300,250,'2026-10-22T03:00:00.000Z'),{id:'b',fullName:'B'});
  await assert.rejects(s.drain(E.key('measurement',id)),/ACK_LOST/);
  assert.equal(c.f.rtGet('active_units_gieogieo/j/n/unitBase'),230,'kho đã trừ');
  c.f.FS['prep_vessels_gieogieo/v'].variants[0].tareG=105;      // bì đổi giữa hai lần thử
  c.tick(60001);await s.drain(E.key('measurement',id));
  const m=c.f.FS[ROOT+'/measurements/'+id];
  assert.equal(m.status,'done','thao tác đã ghi kho phải được hoàn tất, không bị từ chối');
  assert.equal(Object.values(c.f.FS).filter(d=>d&&d.type==='WASTE').length,1,'đúng một WASTE');
  assert(Object.keys(c.f.FS).some(p=>p.startsWith(ROOT+'/cases/')),'có hồ sơ phân bổ hao hụt');
  assert(c.f.FS[ROOT+'/unit_checkpoints/n'],'có mốc cân');
  // Đối chứng: chưa ghi kho mà bì đổi → vẫn từ chối như cũ.
  const c2=stock();const s2=create({storeId:'gg01',fstore:c2.f.fstore,now:c2.now,inventory:c2.inv});
  await s2.ensureCloseTasks('2026-10-22','c2');const t2=E.key('day_close','2026-10-22','j','c2');
  const id2=await s2.requestMeasurement(t2,await line(c2,'c2',300,250,'2026-10-22T03:00:00.000Z'),{id:'b',fullName:'B'});
  c2.f.FS['prep_vessels_gieogieo/v'].variants[0].tareG=105;await s2.drain(E.key('measurement',id2));
  assert.equal(c2.f.FS[ROOT+'/measurements/'+id2].status,'rejected');assert.equal(c2.f.rtGet('active_units_gieogieo/j/n/unitBase'),280);
  console.log('ok 1. Mất ACK + bì đổi: phục hồi theo receipt (WASTE, hồ sơ, mốc cân); chưa ghi kho thì vẫn từ chối');
 }
 // ── 2. Không còn mã mở: hoàn tất trong transaction đúng thứ tự đọc-rồi-ghi, mở khoá cân ──
 {
  const c=stock({},{}, {});const s=create({storeId:'gg01',fstore:c.f.fstore,now:c.now,inventory:c.inv});
  await c.f.db.ref('active_units_gieogieo/j/n').remove();c.f.FS['stock_containers_gieogieo/n'].status='finished';
  await s.ensureCloseTasks('2026-10-22','e');const task=E.key('day_close','2026-10-22','j','e');
  const id=await s.requestMeasurement(task,{itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:'2026-10-22',sessionId:'e',units:[]},{id:'b',fullName:'B'});
  await s.drain(E.key('measurement',id));
  assert.equal(c.f.FS[ROOT+'/measurements/'+id].status,'done');assert.equal(c.f.FS[ROOT+'/measurements/'+id].result.kind,'no_open_units');
  assert.equal(c.f.FS[ROOT+'/measurement_locks/j'],undefined,'khoá cân được mở');
  console.log('ok 2. Không còn mã mở: hoàn tất, mở khoá (fake cấm đọc sau ghi)');
 }

 // ── 3. Nâng mức trong lượt học → danh sách POS thực thi + revision cùng cập nhật; lượt học sau tự lành ──
 {
  const f=await cleanState(),nowT=Date.parse('2026-10-23T03:00:00Z');
  const g=makeFake({fs:clone(f.FS)});g.FS[ROOT].controlledItemIds=[];delete g.FS[ROOT+'/models/current'];const rev0=g.FS[ROOT].revision||0;
  g.FS['inventory_items_gieogieo/milk']={name:'Sữa',unit:'g',costPerUnit:50};
  g.FS[ROOT+'/obs/milk~1']={schemaVersion:1,id:'milk~1',storeId:'gg01',itemId:'milk',unit:'g',containerId:'c_milk',at:'2026-10-23T01:00:00.000Z',day:'2026-10-23',used:200,loss:180,book:380,measured:200,nWeigh:1,verified:true,scored:false,sampling:'random_m0',ctx:{}};
  g.FS[ROOT+'/models/params']={params:{...L.DEFAULT_PARAMS,version:'sim-test',origin:'calibrated_simulation'}};
  const s=create({storeId:'gg01',fstore:g.fstore,now:()=>nowT});await s.learnDay({force:true});
  assert(g.FS[ROOT+'/controls/milk'].level>=2,'milk được nâng mức');
  assert(g.FS[ROOT].controlledItemIds.includes('milk'),'danh sách POS thực thi có milk');assert(g.FS[ROOT].controlledItemIds.includes('j'),'món đã M2 từ trước cũng được công bố (tự lành)');
  assert((g.FS[ROOT].revision||0)>rev0,'revision tăng để POS ACK lại');
  await s.ensureCloseTasks('2026-10-23','x');assert(Object.values(g.FS).some(t=>t&&t.itemId==='milk'&&String(t.kind).includes('weigh')&&String(t.id||'').includes('day_close')),'việc cân cuối ngày cho milk');
  console.log('ok 3. Nâng mức trong lượt học → controlledItemIds + revision; việc cân cuối ngày có milk');
 }
 // ── 5 + 6. Dùng thay chia cho nhiều phiếu; giá vốn ngày cũ → dấu pl_dirty ──
 const D='2026-10-24';
 function subFx(rows,nowMs){
  const fake=makeFake({fs:{[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:D,settingsRevision:1},...rows}}),ctx={console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};
  vm.runInNewContext(fsx.readFileSync(path.join(__dirname,'../unit_engine.v21.js'),'utf8'),ctx);
  ctx.UnitEngine.init({fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,now:()=>nowMs,storeId:'gg01',app:'quanly'});
  return {...fake,s:create({storeId:'gg01',fstore:fake.fstore,now:()=>nowMs,inventory:ctx.UnitEngine})};
 }
 const rc=(id,prepId,R,exp)=>({['prep_shortage_recons_gieogieo/'+id]:{sourceKind:'prep',prepId,prepName:prepId,unit:'g',businessDate:D,costPerUnit:20,remainder:R,status:'substitution_pending',
  substitutions:[{kind:'prep',id:'cafe',prepId:'cafe',prepName:'Thạch Cafe',unit:'g',ratio:1,expectedQty:exp,observedShortQty:200,costPerUnit:25,coversQty:exp}]}});
 const rows=()=>({'prep_items_gieogieo/a':{name:'A',unit:'g'},'prep_items_gieogieo/b':{name:'B',unit:'g'},'prep_items_gieogieo/cafe':{name:'Thạch Cafe',unit:'g'},
  'prep_transactions_gieogieo/cnt_cafe':{prepId:'cafe',type:'ADJUSTMENT',fromPrepCount:true,qty:-200,businessDate:D,createdAt:D+'T14:30:00.000Z'},
  'duty_cases_gieogieo/dc_cafe':{prepId:'cafe',variance:-200,businessDate:D,status:'auto',costPerUnit:25,allocations:[{employeeId:'x',qty:-200,value:5000}],pool:[],revision:1},
  ...rc(D+'_a','a',100,100),...rc(D+'_b','b',200,100)});
 {
  const f=subFx(rows(),Date.parse(D+'T15:00:00Z'));
  assert.equal(E.subCheck(f.FS['prep_shortage_recons_gieogieo/'+D+'_b']).ok,false,'phiếu B: chỉ phân được 100/200 → không đủ dù loại thay thiếu 200');
  await f.s.subReview(D+'_a');await f.s.subReview(D+'_b');
  assert.equal(f.FS['prep_shortage_recons_gieogieo/'+D+'_a'].status,'substitution_confirmed','phiếu A (100 từ thiếu 200 chia chung) hợp lệ — không bị so với cả lượng thiếu chung');
  assert.equal(f.FS['prep_shortage_recons_gieogieo/'+D+'_b'].status,'unexplained','phiếu B còn thiếu 100 chưa phủ → không xác nhận');
  console.log('ok 5. Dùng thay chia nhiều phiếu: phiếu đủ phần được phân bổ → xác nhận; phiếu còn thiếu phần chưa phủ → không');
 }
 {
  const f=subFx(rows(),Date.parse('2026-10-25T15:00:00Z'));await f.s.subReview(D+'_a');
  const mark=f.FS['pl_dirty_gieogieo/gg01'];assert(mark&&mark.m[D+'_'+D],'dấu pl_dirty đúng quán / ngày');
  // Dấu có tác dụng thật: bản tóm tắt ngày D ghi SAU cuối ngày (updatedAt = D+1 06:00) vẫn bị chọn tính lại nhờ dấu ghi sau đó.
  const GD=(()=>{const m={exports:{}};new Function('window','module',fsx.readFileSync(path.join(__dirname,'../data_access.v9.js'),'utf8'))({},m);return m.exports.GieoData;})();
  const byDate={[D]:{updatedAt:'2026-10-25T06:00:00.000Z'}},nowMs=Date.parse('2026-10-25T15:00:00Z');
  assert.deepEqual(GD.plNgayCanTinh(byDate,D,D,{now:nowMs,marks:{}}),[],'không có dấu: số cũ được dùng tiếp (lỗi cũ)');
  assert.deepEqual(GD.plNgayCanTinh(byDate,D,D,{now:nowMs,marks:mark.m}),[D],'có dấu của worker: ngày được tính lại');
  const g=subFx(rows(),Date.parse(D+'T15:00:00Z'));await g.s.subReview(D+'_a');assert.equal(g.FS['pl_dirty_gieogieo/gg01'],undefined,'hôm nay: không cần dấu');
  console.log('ok 6. Xác nhận bù ngày đã qua → ghi dấu pl_dirty cùng transaction (hôm nay không dấu)');
 }

 // ── 4. Hạ mức: chỉ mốc sau lúc đổi mức; cần ACK thật của thiết bị ──
 {
  const f=await cleanState();const day=(i,h=13)=>new Date(Date.parse('2026-10-10T00:00:00Z')+i*86400000+h*3600000).toISOString();
  const ob=(item,i,extra)=>({schemaVersion:1,id:item+'~'+i,storeId:'gg01',itemId:item,unit:'g',containerId:'c_'+item,at:day(i),day:day(i).slice(0,10),used:200,loss:4,book:204,measured:200,nWeigh:1,verified:true,scored:true,flagged:false,sampling:'random_m0',ctx:{},...extra});
  const mk=()=>{const g=makeFake({fs:clone(f.FS)});for(let i=0;i<12;i++)g.FS[ROOT+'/obs/k~'+i]=ob('k',i);
   g.FS[ROOT+'/models/params']={params:{...L.DEFAULT_PARAMS,version:'sim-test',origin:'calibrated_simulation'}};delete g.FS[ROOT+'/models/current'];
   g.FS[ROOT+'/devices/pos1'].controlRevision=g.FS[ROOT].revision||0;return g;};
  const run=g=>create({storeId:'gg01',fstore:g.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')}).learnDay({force:true});
  // 12 mốc sạch cũ rồi VỪA nâng M2 hôm nay → không được hạ (mốc trước lúc nâng mức không tính cho sự cố mới).
  let g=mk();g.FS[ROOT+'/controls/k']={level:2,manualFloor:0,itemId:'k',revision:2,lastEscalationAt:'2026-10-23T01:00:00.000Z',updatedAt:'2026-10-23T01:00:00.000Z'};
  assert.deepEqual((await run(g)).released,[],'vừa nâng mức: mốc sạch cũ không tái sử dụng');
  // Mốc sạch SAU lúc nâng mức thì tính.
  g=mk();g.FS[ROOT+'/controls/k']={level:2,manualFloor:0,itemId:'k',revision:2,lastEscalationAt:'2026-10-09T01:00:00.000Z',updatedAt:'2026-10-09T01:00:00.000Z'};
  assert.deepEqual((await run(g)).released,['k'],'đủ mốc sạch sau lúc nâng mức, thiết bị đã ACK → hạ');
  // Không có thiết bị ACK / thiết bị chậm một phiên bản → không hạ.
  g=mk();g.FS[ROOT+'/controls/k']={level:2,manualFloor:0,itemId:'k',revision:2,lastEscalationAt:'2026-10-09T01:00:00.000Z',updatedAt:'2026-10-09T01:00:00.000Z'};
  delete g.FS[ROOT+'/devices/pos1'];assert.deepEqual((await run(g)).released,[],'không có thiết bị nào ACK → không hạ');
  console.log('ok 4. Hạ mức: không dùng mốc sạch trước lúc nâng mức; cần bằng chứng ACK thiết bị');
 }
 // ── 7. Rollback bản live đầu tiên: bản gốc được lưu trước khi nhận bản mới; không có bản cha → báo + chế độ an toàn ──
 {
  const f=await cleanState();const g=makeFake({fs:clone(f.FS)});delete g.FS[ROOT+'/models/current'];
  g.FS[ROOT+'/models/params']={params:{...L.DEFAULT_PARAMS,version:'sim-v0',origin:'calibrated_simulation'}};
  const real=L.calibrate;L.calibrate=(P)=>({promoted:true,reason:'test',params:{...P,version:'live-first',origin:'calibrated_live'},record:{version:'live-first',parent:P.version,rollbackRef:P.version,mode:'live',dataHash:'h',window:{},metricsBefore:{missRate:.1,coverage90:.9},metricsAfter:{missRate:.1,coverage90:.9},changes:[]}});
  try{await create({storeId:'gg01',fstore:g.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')}).learnDay({force:true});}finally{L.calibrate=real;}
  const base=g.FS[ROOT+'/model_versions/sim-v0'];assert(base&&base.params&&base.params.version==='sim-v0','bản gốc được lưu trước khi nhận bản mới');
  assert.equal(g.FS[ROOT+'/models/params'].version,'live-first');
  // Sau đó chất lượng thật kém hơn lúc kiểm định → quay về bản gốc (trước đây rollback=null, im lặng).
  const rec={...g.FS[ROOT+'/model_versions/live-first'],metricsAfter:{missRate:0,coverage90:0.9}};g.FS[ROOT+'/model_versions/live-first']=rec;
  const worse=ob0=>({...ob0});
  for(let i=0;i<30;i++)g.FS[ROOT+'/obs/w~'+i]={schemaVersion:1,id:'w~'+i,storeId:'gg01',itemId:'w',unit:'g',containerId:'c_w',at:'2026-10-23T0'+(i%9)+':00:00.000Z',day:'2026-10-23',used:200,loss:150,book:350,measured:200,nWeigh:1,verified:true,scored:true,flagged:false,sampling:'random_m0',ctx:{},truth:{abnormalQty:0}};
  const dr=makeFake({fs:clone(g.FS)});delete dr.FS[ROOT+'/models/current'];dr.FS[ROOT+'/models/params']={params:dr.FS[ROOT+'/model_versions/live-first'].params,version:'live-first'};
  const real2=L.calibrate;L.calibrate=()=>({promoted:false,reason:'x'});
  const rr=await create({storeId:'gg01',fstore:dr.fstore,now:()=>Date.parse('2026-10-31T03:00:00Z')}).learnDay({force:true});L.calibrate=real2;
  assert(rr.rollback&&rr.rollback.rollback===true&&!rr.rollback.failed,'quay về bản gốc: '+JSON.stringify(rr.rollback));assert.equal(dr.FS[ROOT+'/models/params'].version,'sim-v0');
  // Bản cha không còn → báo rõ + chế độ an toàn (không im lặng báo sạch).
  const dq=makeFake({fs:clone(g.FS)});delete dq.FS[ROOT+'/models/current'];delete dq.FS[ROOT+'/model_versions/sim-v0'];dq.FS[ROOT+'/models/params']={params:dq.FS[ROOT+'/model_versions/live-first'].params,version:'live-first'};
  L.calibrate=()=>({promoted:false,reason:'x'});const rq=await create({storeId:'gg01',fstore:dq.fstore,now:()=>Date.parse('2026-10-31T03:00:00Z')}).learnDay({force:true});L.calibrate=real2;
  assert(rq.rollback&&rq.rollback.failed===true,'báo không quay lui được');assert(rq.issues.some(i=>i.code==='ROLLBACK_PARENT_MISSING'));assert.equal(dq.FS[ROOT+'/models/current'].safeMode,true);
  console.log('ok 7. Bản live đầu tiên quay lui được về bản gốc đã lưu; không tìm thấy bản cha → báo + chế độ an toàn');
 }
 // ── 8. Lỗi giữa lượt học: nhãn không mất, chạy lại không đếm đôi ──
 {
  const f=await cleanState();const g=makeFake({fs:clone(f.FS)});delete g.FS[ROOT+'/models/current'];
  g.FS[ROOT+'/evidence/t1']={taskId:'t1',storeId:'gg01',kind:'tare_check',itemId:'j',resolves:'tare',posterior:0.7,result:{vesselId:'v',recordedTareG:100,measuredTareG:118},labeled:false,at:'2026-10-23T01:00:00.000Z'};
  const s=create({storeId:'gg01',fstore:g.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')});
  // Lỗi ngay khi ghi models/current: nhãn chưa bị đánh dấu.
  let boom=true;g.fstore._ctl.failOn=(op,p)=>boom&&op==='set'&&p.endsWith('/models/current')?(boom=false,Error('NETWORK')):null;
  await assert.rejects(s.learnDay({force:true}),/NETWORK/);
  assert.equal(g.FS[ROOT+'/evidence/t1'].labeled,false,'lỗi trước khi lưu mô hình → nhãn chưa bị tiêu thụ');
  await s.learnDay({force:true});
  const m=g.FS[ROOT+'/models/current'];assert.equal(m.labels.tare.n,1,'chạy lại: đúng 1 nhãn');assert.equal(g.FS[ROOT+'/evidence/t1'].labeled,true);
  // Lỗi SAU khi lưu mô hình, trước khi đánh dấu nhãn → chạy lại không đếm đôi.
  g.FS[ROOT+'/evidence/t1'].labeled=false;await s.learnDay({force:true});
  assert.equal(g.FS[ROOT+'/models/current'].labels.tare.n,1,'nhãn đã tính trong mô hình không bị đếm lần hai');assert.equal(g.FS[ROOT+'/evidence/t1'].labeled,true);
  console.log('ok 8. Lỗi giữa lượt học: không mất nhãn, không đếm đôi (nhãn / quan sát chỉ đánh dấu sau khi mô hình đã lưu)');
 }
 // ── 9. M0 khởi động: món chưa có quan sát nhưng đang có mã mở vẫn được lấy mẫu ──
 {
  const f=await cleanState();const g=makeFake({fs:clone(f.FS)});delete g.FS[ROOT+'/models/current'];
  for(const k of Object.keys(g.FS))if(k.startsWith(ROOT+'/obs/'))delete g.FS[k];
  g.FS['stock_containers_gieogieo/mk']={itemId:'milk',itemName:'Sữa',unit:'g',status:'open',baseQty:1000,unitBase:700,openedAt:'2026-10-22T01:00:00Z',code:'MILK1'};
  g.FS[ROOT+'/controls/j']={...g.FS[ROOT+'/controls/j'],level:0};
  await create({storeId:'gg01',fstore:g.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')}).learnDay({force:true});
  assert(Object.values(g.FS).some(t=>t&&t.sampling==='random_m0'&&t.itemId==='milk'),'món chưa có quan sát nhưng có mã mở được giao cân M0 đầu tiên');
  console.log('ok 9. M0 khởi động nguội: lấy mẫu từ mọi món đang có mã mở, xoay vòng');
 }
 // ── 10. Bản xuất chứa hồ sơ tự xử lý; cài sai → bộ kiểm toán bắt được ──
 {
  const f=await cleanState(),D2='2026-10-22';
  f.FS['prep_shortage_recons_gieogieo/r1']={sourceKind:'prep',prepId:'th',prepName:'Thạch trà',unit:'g',businessDate:D2,costPerUnit:20,remainder:300,status:'substitution_confirmed',cogsDelta:1500,confirmedBy:'engine2_auto',
   substitutions:[{kind:'prep',id:'cafe',prepId:'cafe',ratio:1,expectedQty:100,observedShortQty:100,costPerUnit:25,coversQty:100}]};
  f.FS[ROOT+'/sub_reviews/r1']={id:'r1',storeId:'gg01',reconId:'r1',businessDate:D2,mode:'active',ok:true,by:'engine2',policy:'sub_review_v1',check:{},at:'2026-10-23T01:00:00.000Z'};
  f.FS['alerts_gieogieo/prep_shortage_r1']={type:'prep_shortage_recon',status:'resolved',reconId:'r1',businessDate:D2};
  const X2=require('../unit_engine2_export_v2');
  const out=await X2.build({storeId:'gg01',from:'2026-10-14',to:'2026-10-22',coll:k=>f.fstore.collection(X2.physName(k,'gg01')),rtRef:n=>f.db.ref(n+'_gieogieo'),serverOffset:async()=>0,meta:{}});
  assert(out.docs['prep_shortage_recons_gieogieo/r1'],'phiếu đối chiếu BTP có trong bản xuất');assert(out.docs[ROOT+'/sub_reviews/r1'],'hồ sơ duyệt dùng thay có trong bản xuất');assert(out.docs['alerts_gieogieo/prep_shortage_r1'],'thông báo được trỏ tới có trong bản xuất');
  for(const n of ['prep_reviews','prep_track','mixups','mixup_watch','alert_reviews','sub_reviews'])assert(out.manifest.scope.sections.includes('engine2_'+n),'phạm vi gồm '+n);
  assert.equal(out.manifest.complete,true);
  const tmp=fsx.mkdtempSync(path.join(os.tmpdir(),'e2r-')),file=path.join(tmp,'kho.json');fsx.writeFileSync(file,JSON.stringify(out));
  const cli=spawnSync(process.execPath,[path.join(__dirname,'../tools/automation/engine2_audit.js'),file,'gg01','2026-10-14','2026-10-22']);
  assert.equal(cli.status,1,String(cli.stdout)+String(cli.stderr));assert.match(String(cli.stdout),/SUB_CONFIRMED_OUT_OF_TOL/,'xác nhận bù 100/300 (ngoài ±30) bị bắt từ chính bản xuất');
  console.log('ok 10. Bản xuất có hồ sơ tự xử lý (đối chiếu, duyệt, thông báo); xác nhận sai → kiểm toán bắt từ file');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
