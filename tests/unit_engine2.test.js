'use strict';
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const {createEngine}=require('../functions/automation/engine');
const start='2026-10-14T07:17:00.000Z',end='2026-10-22T02:49:00.000Z';
const shifts=['a','b','c','d'].map((id,i)=>({id:'shift'+id,employeeId:id,employeeName:id,roles:['barista'],checkedInAt:'2026-10-'+String(15+i).padStart(2,'0')+'T02:30:00.000Z',checkedOutAt:'2026-10-'+String(15+i).padStart(2,'0')+'T13:00:00.000Z'}));
const container={id:'u',itemId:'jelly',itemName:'Thạch',unit:'g',baseQty:500,openedAt:start,finishedAt:end,status:'finished',wasteBase:300,wasteBasis:'unit_engine'};
const source={id:'finish_u_WASTE',itemId:'jelly',referenceId:'u',type:'WASTE',qty:-300,createdAt:end,businessDate:'2026-10-22',note:'Báo hết'};
const input={store:'gg01',sourceId:source.id,source,container,shifts,valuation:{status:'known',amount:30000}};
function fixture(store='gg01'){
 const c=n=>E.collection(n,store),f=makeFake({fs:{
  [E.rootPath(store)]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01'},
  [c('stock_transactions')+'/'+source.id]:source,[c('stock_containers')+'/u']:container,[c('inventory_items')+'/jelly']:{name:'Thạch',unit:'g',costPerUnit:100},
  [E.tableName('price_history',store)+'/price']:{itemId:'jelly',effectiveFrom:'2026-09-01',price:100},...Object.fromEntries(shifts.map(s=>[c('employee_shifts')+'/'+s.id,s]))
 }});
 const service=create({storeId:store,fstore:f.fstore,now:()=>Date.parse(end)+1000});return {...f,service,c};
}
(async()=>{
 const d=E.decision(input);assert.deepEqual(d.allocations.map(a=>a.qty),[75,75,75,75]);assert.deepEqual(d.allocations.map(a=>a.value),[7500,7500,7500,7500]);assert.deepEqual(E.audit(d),[]);
 assert.equal(E.group([...shifts,shifts[0],{employeeId:'order',roles:['order'],checkedInAt:start,checkedOutAt:end}],start,end).people.length,4);
 assert.equal(E.split(1,['c','b','a']).reduce((s,p)=>s+Math.round(p.value*100),0),100);
 {
  // Chủ quán 22/10: ca không ghi chức năng (thiếu / rỗng) = pha chế; ca chỉ 'order' không được chia.
  const raw=[{id:'s1',employeeId:'x',checkedInAt:start,checkedOutAt:end},{id:'s2',employeeId:'y',roles:[],checkedInAt:start,checkedOutAt:end},{id:'s3',employeeId:'z',roles:['order','barista'],checkedInAt:start,checkedOutAt:end},{id:'s4',employeeId:'o',roles:['order'],checkedInAt:start,checkedOutAt:end}];
  const g=E.group(raw,start,end);assert.deepEqual(g.people.map(p=>[p.id,p.roleBasis]),[['x','not_recorded'],['y','not_recorded'],['z','recorded']]);
  assert.equal(E.isBarista(undefined),false);assert.equal(E.isBarista({roles:['order']}),false);
  const d1=E.decision({...input,shifts:[{id:'only',employeeId:'duy',employeeName:'Duy',checkedInAt:start,checkedOutAt:end}]});
  assert.deepEqual(d1.allocations.map(a=>[a.employeeId,a.qty,a.value,a.roleBasis]),[['duy',300,30000,'not_recorded']]);assert.deepEqual(E.audit(d1),[]);
 }
 const cp={id:'cp',status:'valid',containerId:'u',countedAt:'2026-10-18T01:00:00.000Z'};
 assert.deepEqual(E.decision({...input,checkpoint:cp}).allocations.map(a=>a.employeeId),['d']);
 assert.equal(E.control({level:2,manualFloor:2},'CLEAN_WINDOW_PASSED',{releaseEnabled:true,validPoints:8,activeDays:4,usedEnough:true,pending:0,ackComplete:true,daysSinceLastRelease:8}).level,2);
 assert.throws(()=>E.measurement([{vesselId:'v',variantId:'x',grossG:100,tareG:20}],{unit:'ml'}),/tỷ trọng/);
 assert.equal(E.measurement([{vesselId:'v',variantId:'x',grossG:120,tareG:20}],{unit:'g'}).net,100);
 assert.throws(()=>E.transition('task','queued','VALID_RESULT'),/INVALID/);
 console.log('ok 300g chia đều bốn pha chế; mốc mới thu hẹp nhóm, không kéo nhân viên order, không đoán tỷ trọng; ca không ghi chức năng = pha chế, một người nhận 100%');
 for(const store of ['gg01','gg02']){
  const f=fixture(store),before=JSON.stringify(Object.fromEntries(Object.entries(f.FS).filter(([p])=>!p.startsWith(E.rootPath(store)))));
  const out=await f.service.finish(source.id);assert.equal(out.mode,'active');assert.equal(out.valuation.status,'known','bảng giá dùng chung đọc đúng ở mọi quán (store mặc định = worker)');assert.equal(out.status,'decided');assert.deepEqual(out.statusEvents,['CHECK_START','EVIDENCE_READY','DECIDE']);assert.equal(out.quantity,300);assert.equal(out.allocations[0].qty,75);
  assert.equal(f.FS[E.rootPath(store)+'/controls/jelly'].level,2);
  assert.equal(Object.keys(f.FS).filter(p=>p.startsWith(E.rootPath(store)+'/tasks/')).length,1);
  assert.equal(await f.service.finish(source.id),false);
  const after=JSON.stringify(Object.fromEntries(Object.entries(f.FS).filter(([p])=>!p.startsWith(E.rootPath(store)))));assert.equal(before,after);
  const job=await f.service.enqueue('finish',source.id);assert(await f.service.drain(job));assert.equal(f.FS[E.rootPath(store)+'/requests/'+job].dirty,false);
 }
 console.log('ok Ghi quyết định/control/task bền, retry không nhân đôi và không đổi kho/tiền nguồn; cách ly hai quán');
 const f=fixture();f.FS[E.rootPath('gg01')].mode='shadow';const draft=await f.service.finish(source.id);assert.equal(draft.mode,'shadow');assert(!f.FS[E.rootPath('gg01')+'/controls/jelly']);
 console.log('ok Shadow không bật kiểm soát hoặc giao cân hiệu lực');
 const g=fixture();await g.service.finish(source.id);const caseKey=E.rootPath('gg01')+'/cases/'+E.key('finish',source.id);g.FS[caseKey].decisionMode='manual';g.FS[caseKey].allocations=[{employeeId:'ownerChoice'}];g.FS[g.c('stock_transactions')+'/'+source.id].note='sửa ghi chú';assert.equal(await g.service.finish(source.id),false);assert.equal(g.FS[caseKey].allocations[0].employeeId,'ownerChoice');
 console.log('ok Giữ quyết định tay khi nguồn thay đổi');
 {
  const f=fixture(),s=f.service;await s.finish(source.id);f.FS[f.c('stock_transactions')+'/'+source.id].voided=true;const changed=await s.finish(source.id);assert.equal(changed.status,'voided');assert.equal(changed.quantity,0);assert.equal(f.FS[E.rootPath('gg01')+'/tasks/'+E.key('baseline',source.id)].status,'cancelled');assert.equal(f.FS[E.rootPath('gg01')+'/controls/jelly'].level,2);
  console.log('ok Void rút phân bổ nguồn và hủy việc dư; không tự tắt kiểm soát hoặc sửa kho');
 }
 {
  const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)},a=E.outbox(storage,'gg01'),b=E.outbox(storage,'gg02');
  a.put({id:'same',kind:'exception',payload:{taskId:'t'}});a.put({id:'same',kind:'exception',payload:{taskId:'other'}});assert.equal(a.read().length,1);assert.equal(a.read()[0].payload.taskId,'t');assert.equal(b.read().length,0);a.remove('same');assert.equal(a.read().length,0);
  assert.throws(()=>E.outbox({getItem:()=>null,setItem:()=>{throw Error('full')}},'gg01').put({id:'x',kind:'exception'}),/full/);
  console.log('ok Outbox giữ lệnh bất biến, tách quán và không báo lưu thành công khi bộ nhớ lỗi');
 }
 {
  let current=Date.parse('2026-10-22T04:00:00Z');const item={id:'j',name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:280,costPerUnit:100,packagingUnits:[]};
  const f=makeFake({rt:{active_units_gieogieo:{j:{n:{code:'NEXT0001',unitBase:280,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}}}},fs:{
   [E.rootPath('gg01')]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,controlledItemIds:['j']},
   [E.rootPath('gg01')+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1},
   'inventory_items_gieogieo/j':item,'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:280,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
   'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
   'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
   'employee_shifts_gieogieo/a':{employeeId:'a',employeeName:'A',roles:['barista'],checkedInAt:'2026-10-21T02:00:00.000Z',checkedOutAt:'2026-10-21T13:00:00.000Z'},
   'employee_shifts_gieogieo/b':{employeeId:'b',employeeName:'B',roles:['barista'],checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'}
  }});
  const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>current,items:[item]});
  let loseAck=true;const adapter={...inv,shift:{...inv.shift,applyLine:async(...args)=>{const result=await inv.shift.applyLine(...args);if(loseAck){loseAck=false;throw Error('ACK_LOST');}return result;}}};
  const s=create({storeId:'gg01',fstore:f.fstore,now:()=>current,inventory:adapter});
  async function weigh(cycle,baseline,weighed,at){
   await s.ensureCloseTasks('2026-10-22',cycle);const task=E.key('day_close','2026-10-22','j',cycle),live=f.rtGet('active_units_gieogieo/j/n');
   const line={itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:'2026-10-22',sessionId:cycle,units:[{id:'n',code:'NEXT0001',capacity:500,state:'confirmed',openedAt:live.openedAt,baseline,weighed,baselineSig:inv.shift.absSig(live),countedAt:at,seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:100,grossG:weighed+100}]}]};
   const id=await s.requestMeasurement(task,line,{id:'b',fullName:'B'});if(loseAck){await assert.rejects(s.drain(E.key('measurement',id)),/ACK_LOST/);assert.equal(f.rtGet('active_units_gieogieo/j/n/unitBase'),230);const writes=f.log.filter(x=>x[0]==='rt.tx').length;current+=60001;await s.drain(E.key('measurement',id));assert.equal(f.log.filter(x=>x[0]==='rt.tx').length,writes,'Recovery uses durable inventory receipt, no second RT write');}else await s.drain(E.key('measurement',id));return id;
  }
  const id=await weigh('first',300,250,'2026-10-22T03:00:00.000Z');assert.equal(f.rtGet('active_units_gieogieo/j/n/unitBase'),230);
  let cases=Object.entries(f.FS).filter(([p])=>p.startsWith(E.rootPath('gg01')+'/cases/')).map(([,d])=>d);assert.equal(cases[0].quantity,50);assert.deepEqual(cases[0].allocations.map(a=>a.qty),[25,25]);
  assert.equal(Object.keys(f.FS).filter(p=>p.startsWith('duty_cases_gieogieo/')).length,0);
  await s.measure(id);assert.equal(f.rtGet('active_units_gieogieo/j/n/unitBase'),230);
  current=Date.parse('2026-10-22T06:00:00Z');await weigh('second',230,200,'2026-10-22T05:00:00.000Z');
  cases=Object.entries(f.FS).filter(([p])=>p.startsWith(E.rootPath('gg01')+'/cases/')).map(([,d])=>d);assert.equal(cases.length,2);assert.equal(cases[1].quantity,30);assert.deepEqual(cases[1].allocations.map(a=>[a.employeeId,a.qty]),[['b',30]]);
  assert.equal(Object.entries(f.FS).filter(([p,d])=>p.startsWith('stock_transactions_gieogieo/')&&d.type==='WASTE').length,2);
  const last=cases[1],point=f.FS[E.rootPath('gg01')+'/unit_checkpoints/n'].measurementId;f.FS[last.sourcePath].voided=true;await s.measure(last.originId);assert.equal(f.FS[E.rootPath('gg01')+'/cases/'+last.id].status,'voided');assert.equal(f.FS[E.rootPath('gg01')+'/unit_checkpoints/n'].measurementId,point);assert.equal(f.rtGet('active_units_gieogieo/j/n/unitBase'),200);
  await s.ensureCloseTasks('2026-10-22','bad_tare');const badTask=E.key('day_close','2026-10-22','j','bad_tare'),before=f.rtGet('active_units_gieogieo/j/n'),badLine={itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:'2026-10-22',sessionId:'bad_tare',units:[{id:'n',code:'NEXT0001',state:'confirmed',capacity:500,baseline:200,weighed:170,baselineSig:inv.shift.absSig(before),countedAt:'2026-10-22T05:30:00.000Z',seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:99,grossG:269}]}]};
  const bad=await s.requestMeasurement(badTask,badLine,{id:'b',fullName:'B'}),revision=f.FS[E.rootPath('gg01')].revision;await s.drain(E.key('measurement',bad));assert.equal(f.FS[E.rootPath('gg01')+'/measurements/'+bad].status,'rejected');assert.equal(f.FS[E.rootPath('gg01')+'/tasks/'+badTask].status,'retry_wait','từ chối sau khi bắt đầu → retry_wait (đặc tả 3.4)');assert.equal(f.FS[E.rootPath('gg01')+'/tasks/'+badTask].pending,true);assert(f.FS[E.rootPath('gg01')].revision>revision);assert.equal(f.rtGet('active_units_gieogieo/j/n/unitBase'),200);assert(!f.FS[E.rootPath('gg01')+'/measurement_locks/j']);
  await f.db.ref('active_units_gieogieo/j/n').remove();await f.fstore.collection('stock_containers_gieogieo').doc('n').update({status:'finished'});await s.ensureCloseTasks('2026-10-22','empty');const emptyTask=E.key('day_close','2026-10-22','j','empty');const empty=await s.requestMeasurement(emptyTask,{itemId:'j',unit:'g',sessionId:'empty',businessDate:'2026-10-22',units:[]},{id:'b',fullName:'B'});await s.drain(E.key('measurement',empty));assert.equal(f.FS[E.rootPath('gg01')+'/measurements/'+empty].result.kind,'no_open_units');assert.equal(f.FS[E.rootPath('gg01')+'/tasks/'+badTask].pending,false);assert.equal(f.FS[E.rootPath('gg01')+'/tasks/'+badTask].status,'superseded','việc được lượt cân khác phủ → superseded, chỉ VALID_RESULT mới là done');assert.equal(f.FS[E.rootPath('gg01')+'/tasks/'+emptyTask].status,'done');assert.equal(f.FS[E.rootPath('gg01')+'/unit_checkpoints/n'].measurementId,point);
  console.log('ok Bì đổi bị từ chối trước kho và báo POS cân lại; không có mã mở được xác minh, không tạo checkpoint 0');
  console.log('ok Mất ACK phục hồi qua receipt, không ghi RT lần hai; sửa nguồn cũ không ghi lại kho hoặc lùi mốc cân');
  console.log('ok Cân qua inventory thật: giữ 20g bill xen giữa; 50g chia hai người, lần sau 30g chỉ thuộc khoảng mới; không duty/WASTE đúp');
 }
 {
  const f=fixture();f.FS[f.c('stock_transactions')+'/'+source.id].responsibility={status:'assigned_by_manager',employeeId:'a'};const d=await f.service.finish(source.id);assert.equal(d.basis,'manual_source');assert.equal(d.allocations.length,0);assert.equal(d.pending.qty,300);
  const task=f.FS[E.rootPath('gg01')+'/tasks/'+E.key('baseline',source.id)];assert(task.pending);
  const cfg=f.FS[E.rootPath('gg01')];cfg.enabled=false;f.FS[E.rootPath('gg01')+'/measurements/recover']={acceptedProtocol:1};assert(await f.service.enqueue('measurement','recover'));assert.equal(await f.service.enqueue('finish',source.id),false);
  console.log('ok Giữ phân bổ tay trên nguồn; tắt tính năng không bỏ việc cân đã nhận trước đó');
 }
 {
  const f=fixture();const job=await f.service.enqueue('finish',source.id),ref=f.service.sub('requests').doc(job);await ref.set({leaseToken:'new',revision:2},{merge:true});await assert.rejects(f.service.finish(source.id,{ref,token:'old',revision:1}),/Lease/);assert(!f.FS[E.rootPath('gg01')+'/cases/'+E.key('finish',source.id)]);
  console.log('ok Worker lease cũ không chốt quyết định sau phiên bản mới');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
