/* Unit Engine 2 v1: deterministic decisions, evidence and control state.
 * Inventory mutations belong to the inventory adapter, never to this module.
 * Published versions are immutable. Browser and worker use identical bytes. */
(function(root){
'use strict';
const VERSION=1, POLICY='finish_equal_barista_v1', DAY=86400000;
const states={case:['new','checking','ready','decided','review','closed','voided','superseded'],task:['queued','claimed','in_progress','waiting_dependency','retry_wait','exception_recorded','done','superseded','cancelled']};
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():typeof v==='number'?v:Date.parse(v||'');
const finite=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
const stable=v=>v===undefined?'null':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
function storeId(id){if(!/^gg\d{2}$/.test(id))throw Error('Engine2: điểm bán không hợp lệ');return id;}
function collection(kind,id){storeId(id);return kind+'_gieogieo'+(id==='gg01'?'':'__'+id);}
const rootPath=id=>collection('duty_digests',id)+'/_engine2';
async function digest(value){const crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);if(!crypto?.subtle)throw Error('Chưa có công cụ xác định mã thao tác');const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function key(...parts){return parts.map(x=>encodeURIComponent(String(x))).join('~');}
function round(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function split(total,ids){
 if(!finite(total)||Number(total)<0)throw Error('Engine2: tổng phân bổ không hợp lệ');
 const people=[...new Set(ids)].sort();if(!people.length)throw Error('Engine2: chưa nối được nhóm pha chế');
 const cents=Math.round(Number(total)*100);if(!Number.isSafeInteger(cents))throw Error('Engine2: lượng vượt độ chính xác');
 const q=Math.floor(cents/people.length),r=cents%people.length;
 return people.map((id,i)=>({employeeId:id,value:(q+(i<r?1:0))/100}));
}
// Chủ quán chốt 22/10: ca KHÔNG ghi chức năng (thiếu trường roles hoặc rỗng) = pha chế — ở Gieo ai đứng ca cũng pha chế
// (dữ liệu thật 1/9–22/10: không ca nào ghi chức năng). Ca có ghi chức năng thì theo đúng chức năng đó (chỉ 'order' → không).
const isBarista=s=>!!s&&(!Array.isArray(s.roles)||!s.roles.length||s.roles.includes('barista'));
function group(shifts,from,to){
 const start=ms(from),end=ms(to);if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw Error('Engine2: khoảng trách nhiệm không hợp lệ');
 const names=new Map(),refs=[],recorded=new Set();
 for(const s of shifts||[]){
  if(!s.employeeId||!isBarista(s))continue;
  const a=ms(s.checkedInAt),b=s.checkedOutAt?ms(s.checkedOutAt):Math.min(end,a+14*3600000);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||a>=end||b<=start)continue;
  names.set(s.employeeId,s.employeeName||s.employeeId);if(s.id)refs.push(s.id);
  if(Array.isArray(s.roles)&&s.roles.includes('barista'))recorded.add(s.employeeId);
 }
 return {people:[...names].sort(([a],[b])=>a.localeCompare(b)).map(([id,name])=>({id,name,roleBasis:recorded.has(id)?'recorded':'not_recorded'})),shiftIds:[...new Set(refs)].sort()};
}
function interval(container,checkpoint,to){
 const opened=ms(container.openedAt),end=ms(to);if(!Number.isFinite(opened)||!Number.isFinite(end)||opened>=end)throw Error('Engine2: thiếu mốc mở hợp lệ');
 const at=checkpoint&&checkpoint.status==='valid'&&checkpoint.containerId===container.id?ms(checkpoint.countedAt):NaN;
 return {from:new Date(Number.isFinite(at)&&at>opened&&at<end?at:opened).toISOString(),to:new Date(end).toISOString(),checkpointId:Number.isFinite(at)&&at>opened&&at<end?checkpoint.id||'':null};
}
function decision(input){
 const {store,sourceId,source,container,shifts,checkpoint,valuation}=input;storeId(store);
 if(!source||source.type!=='WASTE'||source.voided===true||!(Number(source.qty)<0))return {schemaVersion:1,policyVersion:POLICY,storeId:store,sourceId,sourcePath:collection('stock_transactions',store)+'/'+sourceId,status:'voided',quantity:0,amount:0,allocations:[],reason:'SOURCE_INACTIVE'};
 if(!container||container.id!==source.referenceId||container.itemId!==source.itemId||sourceId!=='finish_'+container.id+'_WASTE')throw Error('Engine2: nguồn báo hết không khớp tem');
 if(container.status!=='finished'||container.wasteBasis!=='unit_engine'||Math.abs(Number(container.wasteBase)+Number(source.qty))>0.005)throw Error('Engine2: báo hết chưa chốt hoặc nguồn vừa thay đổi');
 const range=interval(container,checkpoint,container.finishedAt),g=group(shifts,range.from,range.to);
 if(!g.people.length)throw Error('Engine2: chưa đọc được nhóm pha chế của khoảng này');
 const quantity=round(-Number(source.qty)),qty=split(quantity,g.people.map(p=>p.id));
 const amount=valuation&&finite(valuation.amount)&&Number(valuation.amount)>=0?round(valuation.amount):null;
 const money=amount===null?null:split(amount,g.people.map(p=>p.id));
 return {schemaVersion:1,policyVersion:POLICY,storeId:store,status:'decided',decisionMode:'auto',basis:'policy_equal_share',sourceId,
  sourcePath:collection('stock_transactions',store)+'/'+sourceId,containerId:container.id,itemId:source.itemId,itemName:container.itemName||source.itemId,unit:container.unit||'',quantity,
  interval:range,shiftIds:g.shiftIds,valuation:valuation||{status:'missing',amount:null},amount,
  allocations:qty.map((p,i)=>({employeeId:p.employeeId,employeeName:g.people.find(e=>e.id===p.employeeId).name,qty:p.value,value:money?money[i].value:null,basis:'policy_equal_share',roleBasis:g.people.find(e=>e.id===p.employeeId).roleBasis})),
  explanation:'Chia đều nhóm pha chế có ca thực tế giao với khoảng từ mốc cân hợp lệ gần nhất hoặc mở tem đến báo hết. Đây là trách nhiệm theo chính sách, không kết luận hành vi cá nhân.',
  control:{level:2,targetId:source.itemId,requirements:['checkpoint_soon','barista_handover','day_close'],manualFloor:0},
  actions:[{type:'weigh_open_units',targetId:source.itemId,assignment:'current_barista_group',handover:'next_barista_group'}]};
}
function audit(d){
 const issues=[];if(d.status==='voided')return issues;
 if(!d.allocations?.length&&d.basis!=='manual_source')issues.push('NO_BARISTA_ALLOCATION');
 if(Math.abs(round((d.allocations||[]).reduce((s,a)=>s+Number(a.qty),0)+(Number(d.pending?.qty)||0))-d.quantity)>0.005)issues.push('QUANTITY_MISMATCH');
 if(d.amount!==null&&Math.abs(round(d.allocations.reduce((s,a)=>s+Number(a.value),0)+(Number(d.pending?.value)||0))-d.amount)>0.005)issues.push('MONEY_MISMATCH');
 if(new Set((d.allocations||[]).map(a=>a.employeeId)).size!==d.allocations?.length)issues.push('DUPLICATE_PERSON');
 if(!Number.isFinite(ms(d.interval?.from))||ms(d.interval.from)>=ms(d.interval.to))issues.push('INVALID_INTERVAL');
 return issues;
}
function measuredDecision(input){
 const {store,sourceId,source,container,shifts,checkpoint,countedAt,valuation}=input;storeId(store);
 if(!source||source.type!=='WASTE'||source.voided||!(Number(source.qty)<0)||source.containerId!==container.id||source.itemId!==container.itemId)throw Error('Engine2: dòng hao hụt cân không khớp mã');
 const range=interval(container,checkpoint,countedAt),g=group(shifts,range.from,range.to);if(!g.people.length)throw Error('Engine2: chưa đọc được nhóm pha chế của khoảng cân');
 const quantity=round(-Number(source.qty)),amount=valuation&&finite(valuation.amount)?round(valuation.amount):null;
 const qty=split(quantity,g.people.map(p=>p.id)),money=amount===null?null:split(amount,g.people.map(p=>p.id));
 return {schemaVersion:1,policyVersion:POLICY,storeId:store,status:'decided',decisionMode:'auto',basis:'policy_equal_share',sourceId,sourcePath:collection('stock_transactions',store)+'/'+sourceId,
  itemId:source.itemId,itemName:container.itemName||source.itemId,containerId:container.id,unit:container.unit||'',quantity,amount,valuation:valuation||{status:'missing',amount:null},interval:range,shiftIds:g.shiftIds,
  allocations:qty.map((p,i)=>({employeeId:p.employeeId,employeeName:g.people.find(e=>e.id===p.employeeId).name,qty:p.value,value:money?money[i].value:null,basis:'policy_equal_share',roleBasis:g.people.find(e=>e.id===p.employeeId).roleBasis})),
  explanation:'Hao hụt đã ghi trong lượt cân, chia đều pha chế thuộc khoảng giữa mốc vật lý trước và lần cân này. Không ghi thêm WASTE.'};
}
function transition(kind,state,event){
 if(!states[kind]?.includes(state))throw Error('Engine2: trạng thái không hợp lệ');
 if(event==='RETRY'||event==='LATE_ACK')return state;
 const table=kind==='case'?{
  SOURCE_UPSERT:{new:'checking'},EVIDENCE_READY:{checking:'ready'},EVIDENCE_MISSING:{checking:'checking'},DECIDE:{ready:'decided'},RESULTS_CONFIRMED:{decided:'closed'},
  CONTEST:{decided:'review',closed:'review'},REVIEW_RESULT:{review:'decided'},REVIEW_DUE:{review:'review'},SOURCE_CORRECTED:{checking:'checking',ready:'checking',decided:'checking',closed:'checking',review:'review'},
  SOURCE_REMOVED:{new:'checking',checking:'checking',ready:'checking',decided:'checking',closed:'checking',review:'review'},RESTORE_SOURCE:{voided:'checking'}
 }:{CLAIM:{queued:'claimed',retry_wait:'claimed'},START:{claimed:'in_progress'},NEED_INPUT:{claimed:'waiting_dependency',in_progress:'waiting_dependency'},DEPENDENCY_READY:{waiting_dependency:'queued'},
  TRANSIENT_FAILURE:{claimed:'retry_wait',in_progress:'retry_wait'},LEASE_EXPIRED:{claimed:'retry_wait',in_progress:'retry_wait'},VALID_RESULT:{in_progress:'done'},RECOVERY:{exception_recorded:'queued'},NEXT_SHIFT:{exception_recorded:'queued'}};
 if(event==='EXPLICIT_VOID'&&kind==='case'&&!['voided','superseded'].includes(state))return 'voided';
 if(event==='CASE_MERGED'&&kind==='case'&&state!=='superseded')return 'superseded';
 if(kind==='task'&&event==='HANDOVER_EXIT_WITH_EXCEPTION'&&!['done','superseded','cancelled'].includes(state))return 'exception_recorded';
 if(kind==='task'&&['NEW_REVISION','VALID_VOID'].includes(event)&&!['done','superseded','cancelled'].includes(state))return event==='VALID_VOID'?'cancelled':'superseded';
 const result=table[event]?.[state];if(!result)throw Error('INVALID_TRANSITION: '+kind+'/'+state+'/'+event);return result;
}
function control(previous,event,evidence={}){
 const p=previous||{level:0,manualFloor:0},floor=Math.max(0,Math.min(3,Number(p.manualFloor)||0));let level=Math.max(floor,Number(p.level)||0);
 if(event==='NEED_BASELINE')level=Math.max(level,1);
 else if(event==='PHYSICAL_LOSS')level=Math.max(level,2);
 else if(event==='MEASUREMENT_CONFLICT')level=3;
 else if(event==='CLEAN_WINDOW_PASSED'){
  // Automatic release is disabled until calibrated criteria have been explicitly configured.
  if(evidence.releaseEnabled===true&&evidence.validPoints>=5&&evidence.activeDays>=3&&evidence.usedEnough===true&&evidence.pending===0&&evidence.ackComplete===true&&evidence.daysSinceLastRelease>=7)level=Math.max(floor,level-1);
 }else if(!['ACK','OFFLINE','NO_ACTIVITY','EXCEPTION','MANUAL_FLOOR_SET'].includes(event))throw Error('INVALID_CONTROL_EVENT');
 return {...p,level,manualFloor:floor};
}
function measurement(lines,item){
 const unit=String(item.unit||'').toLowerCase();const density=Number(item.densityGPerMl);
 const factor=unit==='g'?1:unit==='kg'?1000:unit==='ml'&&density>0?density:unit==='l'&&density>0?density*1000:0;
 if(!factor)throw Error('Chưa có đơn vị cân/tỷ trọng hợp lệ');
 if(!Array.isArray(lines)||!lines.length)throw Error('Chưa có số cân');
 let net=0;
 for(const l of lines){
  if(!l.vesselId||!l.variantId||!finite(l.tareG)||Number(l.tareG)<0||!finite(l.grossG)||Number(l.grossG)<Number(l.tareG))throw Error('Kiểm tra dụng cụ, bì và số cân tổng');
  net+=(Number(l.grossG)-Number(l.tareG))/factor;
 }
 return {net:round(net),factor,unit,tareSnapshots:lines.map(l=>({...l})),densitySnapshot:unit==='ml'||unit==='l'?density:null};
}
function outbox(storage,store){
 storeId(store);const name='gieo_engine2_outbox_v1_'+store;
 const read=()=>{const value=JSON.parse(storage.getItem(name)||'[]');if(!Array.isArray(value)||value.some(x=>x.storeId!==store))throw Error('Bộ nhớ công việc cần kiểm tra');return value;};
 return {read,put(command){if(!command.id||!['measurement','exception','close_exception'].includes(command.kind))throw Error('Lệnh lưu không hợp lệ');const rows=read();if(rows.some(x=>x.id===command.id))return;if(rows.length>=100)throw Error('Bộ nhớ công việc đã đầy; kết nối để đồng bộ trước');storage.setItem(name,JSON.stringify([...rows,{...command,storeId:store}]));},remove(id){storage.setItem(name,JSON.stringify(read().filter(x=>x.id!==id)));}};
}
const api={VERSION,POLICY,DAY,states,ms,finite,stable,storeId,collection,rootPath,key,digest,round,split,isBarista,group,interval,decision,measuredDecision,audit,transition,control,measurement,outbox};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2=api;
})(typeof window!=='undefined'?window:globalThis);
