'use strict';
// Thử đua: POS hết trần chờ rồi tự ghi kho, trong khi lượt cân đã tới máy chủ (worker có thể xử lý trước / sau / giữa).
const R=require('node:path').join(__dirname,'../..')+'/';
const E=require(R+'unit_engine2_v1'),V5=require(R+'unit_engine2_store_v5'),{makeFake}=require(R+'tests/lib/fakefb'),{createEngine}=require(R+'functions/automation/engine');
const ROOT=E.rootPath('gg01'),DAY='2026-10-22',NOW=Date.parse('2026-10-22T04:00:00Z');
function world(weighed){
 const item={id:'j',name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:400,costPerUnit:100,packagingUnits:[]};
 const f=makeFake({rt:{active_units_gieogieo:{j:{n:{code:'NEXT0001',unitBase:400,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}}}},fs:{
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j'],settingsRevision:3,revision:1},
  [ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch'},
  'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:400,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
  'inventory_items_gieogieo/j':item,'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
  'employee_shifts_gieogieo/b':{employeeId:'b',employeeName:'b',roles:['barista'],checkedInAt:DAY+'T02:00:00.000Z',checkedOutAt:DAY+'T13:00:00.000Z'}}});
 const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>NOW,items:[item]});
 const s=V5.create({storeId:'gg01',fstore:f.fstore,now:()=>NOW,inventory:inv});
 const live=f.rtGet('active_units_gieogieo/j/n');
 const line=()=>({itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:DAY,sessionId:'s1',units:[{id:'n',code:'NEXT0001',capacity:500,state:'confirmed',openedAt:live.openedAt,baseline:400,weighed,baselineSig:inv.shift.absSig(live),countedAt:new Date(NOW-60000).toISOString(),seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:100,grossG:weighed+100}]}]});
 return {f,inv,s,line};
}
const staff={id:'b',fullName:'B'};
const report=(name,f)=>{const tx=Object.entries(f.FS).filter(([p])=>p.startsWith('stock_transactions_gieogieo/')).map(([p,d])=>({id:p.split('/')[1].slice(0,40),type:d.type,qty:d.qty,voided:!!d.voided,e2:!!d.engine2Owner,resp:d.responsibility?.status||d.responsibility?.employeeId||(d.responsibility?'có':'—')}));
 const cases=Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/cases/')).map(([p,d])=>({q:d.quantity,st:d.status,alloc:(d.allocations||[]).length}));
 const duty=Object.entries(f.FS).filter(([p])=>p.startsWith('duty_cases_gieogieo/')).map(([p,d])=>({st:d.status,qty:d.qty??d.quantity,type:d.type}));
 const m=Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/measurements/')).map(([p,d])=>d.status+(d.lastError?' ('+d.lastError.slice(0,50)+')':''));
 const t=Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/tasks/')).map(([p,d])=>d.status+'/pending='+d.pending);
 console.log('\n== '+name+'\n  tồn mã (RT):',f.rtGet('active_units_gieogieo/j/n').unitBase,'· dòng sổ:',JSON.stringify(tx),'\n  hồ sơ Engine 2:',JSON.stringify(cases),'· vụ lệch kho:',JSON.stringify(duty),'\n  lượt cân:',m,'· việc:',t,'· khoá:',!!f.FS[ROOT+'/measurement_locks/j']);};
(async()=>{
 for(const weighed of [380,400]){
  // A: POS tự ghi TRƯỚC, worker xử lý lượt nhận muộn SAU, rồi mới withdraw
  {const {f,inv,s,line}=world(weighed);await s.ensureCloseTasks(DAY,'c',['j']);const task=E.key('day_close',DAY,'j','c');
   const r=await s.requestMeasurementEx(task,line(),staff);           // tới máy chủ nhưng POS «không nhận được» câu trả lời
   const l=line();l.e2={taskId:task};await inv.shift.applyLine(l,DAY,staff,'seedA');   // POS tự ghi (không engine2Owner)
   let err='';await s.drain(E.key('measurement',r.id)).catch(e=>{err=e.message;});
   const wd=await s.withdraw(r.id,staff,'quá thời gian chờ');
   report('A (cân '+weighed+'): POS tự ghi → worker xử lý → rút. drain lỗi: '+(err||'không')+' · rút: '+wd,f);}
  // B: worker xử lý TRƯỚC (áp kho bằng mã lượt), rồi POS tự ghi
  {const {f,inv,s,line}=world(weighed);await s.ensureCloseTasks(DAY,'c',['j']);const task=E.key('day_close',DAY,'j','c');
   const r=await s.requestMeasurementEx(task,line(),staff);
   let err='';await s.drain(E.key('measurement',r.id)).catch(e=>{err=e.message;});
   let perr='';const l=line();l.e2={taskId:task};await inv.shift.applyLine(l,DAY,staff,'seedB').catch(e=>{perr=e.code+': '+e.message.slice(0,60);});
   const wd=await s.withdraw(r.id,staff,'quá thời gian chờ');
   report('B (cân '+weighed+'): worker xử lý trước → POS tự ghi. drain lỗi: '+(err||'không')+' · POS lỗi: '+(perr||'không')+' · rút: '+wd,f);}
  // C: POS tự ghi → rút TRƯỚC khi worker chạy → worker chạy
  {const {f,inv,s,line}=world(weighed);await s.ensureCloseTasks(DAY,'c',['j']);const task=E.key('day_close',DAY,'j','c');
   const r=await s.requestMeasurementEx(task,line(),staff);const l=line();l.e2={taskId:task};await inv.shift.applyLine(l,DAY,staff,'seedC');
   const wd=await s.withdraw(r.id,staff,'quá thời gian chờ');let err='';await s.drain(E.key('measurement',r.id)).catch(e=>{err=e.message;});
   report('C (cân '+weighed+'): POS tự ghi → rút → worker. rút: '+wd+' · drain lỗi: '+(err||'không'),f);}
 }
})().catch(e=>{console.error(e);process.exit(1);});
