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
// Bảng DÙNG CHUNG mọi quán (loại G trong data_access) — không thêm hậu tố quán. Test đối chiếu GieoData.REG.
const SHARED=['price_history','prep_vessels','employees','recipes','recipe_history','prep_recipe_history','special_days'];
function tableName(kind,id){storeId(id);return SHARED.includes(kind)?kind+'_gieogieo':collection(kind,id);}
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
/* Luật «nhập sai quy cách» (chủ quán 23/10). Quán không cân hàng nhập → KHÔNG kết luận từ một mã:
 * - báo hết còn dư < minFrac dung tích → xử lý hao hụt bình thường;
 * - mã không thuộc phiếu nhận THẬT (vd RESET_TON_KHO — opts.receipt === false) → hao hụt;
 * - đã đối chiếu nhãn bao mà quy cách in trên bao = khai báo (opts.rejected) → hao hụt (không phải sai quy cách);
 * - mã DUY NHẤT của nguyên liệu đó trong phiếu nhận → kết luận HAO HỤT (như ca 300 g);
 * - có mã cùng loại cùng phiếu nhận: mã đó đã dùng xong mà CŨNG còn dư gần cùng tỷ lệ → nghi sai quy cách (không quy pha chế);
 *   mã đó dùng xong bình thường → hao hụt; mã đó CHƯA dùng xong → CHỜ (không phân bổ), quá maxWaitDays thì xử lý hao hụt. */
const SPEC={minFrac:0.15,tol:0.1,maxWaitDays:45};
function lotKey(c){return c&&c.itemId&&c.receiveRefId?c.itemId+'|'+c.receiveRefId:null;}
// leftover = tổng phần hụt suốt đời của mã này (dư lúc báo hết + hụt đã ghi ở các lần cân); siblings[].shortfall tương tự.
function specCheck(container,leftover,siblings,now,opts){
 const P={...SPEC,...(opts||{})},cap=Number(container&&container.baseQty)||0,f=cap>0?(Number(leftover)||0)/cap:0;
 if(!(cap>0)||f<P.minFrac)return {action:'decide',reason:'normal',frac:f};
 const key=lotKey(container),sib=key?(siblings||[]).filter(s=>s&&s.id!==container.id&&lotKey(s)===key&&!['voided','cancelled'].includes(s.status)):[];
 if(P.receipt===false)return {action:'decide',reason:'no_receipt',frac:f,lot:key};
 if(P.rejected)return {action:'decide',reason:'spec_rejected',frac:f,lot:key};
 if(!sib.length)return {action:'decide',reason:'only_unit',frac:f,lot:key};
 const done=sib.filter(s=>s.status==='finished');
 // Tổng phần hụt SUỐT ĐỜI mã (các lần cân đã ghi hụt + dư lúc báo hết) — mã đã cân giữa chừng thì lúc báo hết dư rất ít.
 const fr=s=>Number(s.baseQty)>0?(Number(s.shortfall!=null?s.shortfall:s.wasteBase)||0)/Number(s.baseQty):0;
 const match=done.find(s=>fr(s)>=P.minFrac&&Math.abs(fr(s)-f)<=P.tol);
 if(match)return {action:'spec',reason:'sibling_same_shortfall',frac:f,lot:key,siblingId:match.id,siblingFrac:fr(match)};
 if(done.length)return {action:'decide',reason:'sibling_normal',frac:f,lot:key,siblingId:done[0].id,siblingFrac:fr(done[0])};
 const fin=ms(container.finishedAt);if(Number.isFinite(fin)&&Number.isFinite(Number(now))&&Number(now)-fin>P.maxWaitDays*DAY)return {action:'decide',reason:'wait_timeout',frac:f,lot:key};
 return {action:'wait',reason:'waiting_sibling',frac:f,lot:key,siblingIds:sib.map(s=>s.id).sort()};
}
// Biến quyết định chia đều thành hồ sơ «chờ mã cùng phiếu» / «nghi sai quy cách»: không phân bổ cho người, giữ toàn bộ ở pending.
function specOutcome(result,check){
 if(!check||!['spec','wait'].includes(check.action)||result.status==='voided')return result;
 const pct=Math.round(check.frac*100),spec=check.action==='spec';
 return {...result,status:spec?'decided':'checking',basis:spec?'spec_mismatch':'waiting_sibling',allocations:[],pending:{qty:result.quantity,value:result.amount},
  spec:{...check},waitLot:spec?null:check.lot,control:spec?null:result.control,actions:spec?[{type:'spec_confirm',targetId:result.itemId,assignment:'current_barista_group'}]:[],
  explanation:spec?'Mã cùng loại cùng phiếu nhận cũng còn dư ~'+Math.round(check.siblingFrac*100)+'% khi báo hết (mã này '+pct+'%) → nghi nhập sai quy cách. Không quy trách nhiệm cho pha chế; đối chiếu nhãn bao với phiếu nhận.'
   :'Báo hết còn dư '+pct+'% dung tích. Phiếu nhận còn mã cùng loại chưa dùng xong → CHỜ mã đó dùng xong mới kết luận (sai quy cách hay hao hụt); chưa phân bổ trách nhiệm.'};
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
 if(!d.allocations?.length&&!['manual_source','spec_mismatch','waiting_sibling'].includes(d.basis))issues.push('NO_BARISTA_ALLOCATION');
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
 // Bảng theo DAC_TA 3.2–3.4 (test tích Descartes tests/unit_engine2_fsm.test.js). Trùng / đến muộn → không đổi trạng thái.
 if(event==='RETRY'||event==='LATE_ACK'||event==='LATE_EVENT')return state;
 const table=kind==='case'?{
  CHECK_START:{new:'checking'},EVIDENCE_READY:{checking:'ready'},EVIDENCE_MISSING:{checking:'checking'},DUE:{checking:'checking'},DECIDE:{ready:'decided'},RESULTS_CONFIRMED:{decided:'closed'},
  CONTEST:{decided:'review',closed:'review'},REVIEW_RESULT:{review:'decided'},REVIEW_DUE:{review:'review'},SOURCE_CORRECTED:{checking:'checking',ready:'checking',decided:'checking',closed:'checking',review:'review'},
  SOURCE_REMOVED:{new:'checking',checking:'checking',ready:'checking',decided:'checking',closed:'checking',review:'review'},RESTORE_SOURCE:{voided:'checking'}
 }:{CLAIM:{queued:'claimed',retry_wait:'claimed'},START:{claimed:'in_progress'},NEED_INPUT:{claimed:'waiting_dependency',in_progress:'waiting_dependency'},DEPENDENCY_READY:{waiting_dependency:'queued'},
  TRANSIENT_FAILURE:{claimed:'retry_wait',in_progress:'retry_wait'},LEASE_EXPIRED:{claimed:'retry_wait',in_progress:'retry_wait'},VALID_RESULT:{in_progress:'done'},RECOVERY:{exception_recorded:'queued'},NEXT_SHIFT:{exception_recorded:'queued'},DUE:{exception_recorded:'queued'}};
 if(event==='EXPLICIT_VOID'&&kind==='case'&&!['voided','superseded'].includes(state))return 'voided';
 if(event==='CASE_MERGED'&&kind==='case'&&state!=='superseded')return 'superseded';
 if(kind==='task'&&event==='HANDOVER_EXIT_WITH_EXCEPTION'&&!['done','superseded','cancelled'].includes(state))return 'exception_recorded';
 if(kind==='task'&&['NEW_REVISION','VALID_VOID'].includes(event)&&!['done','superseded','cancelled'].includes(state))return event==='VALID_VOID'?'cancelled':'superseded';
 const result=table[event]?.[state];if(!result)throw Error('INVALID_TRANSITION: '+kind+'/'+state+'/'+event);return result;
}
// Đi qua từng bước; bước nào sai bảng thì ném INVALID_TRANSITION (không «đánh dấu xong» âm thầm).
function path(kind,state,events){let s=state;for(const e of events)s=transition(kind,s,e);return s;}
// Hồ sơ hao hụt: trạng thái mới khi worker chốt kết quả (outcome 'decided' | 'voided') — chưa có hồ sơ thì bắt đầu từ 'new'.
function caseFlow(old,outcome){
 const from=old||'new';
 if(outcome==='voided'){const events=from==='voided'?[]:['EXPLICIT_VOID'];return {status:path('case',from,events),events};}
 // Chờ thêm bằng chứng (mã cùng phiếu nhận chưa dùng xong): new → checking; đang checking thì giữ (EVIDENCE_MISSING).
 if(outcome==='checking'){if(from==='review')return {status:'review',events:[],hold:true};const events=from==='new'?['CHECK_START']:from==='checking'?['EVIDENCE_MISSING']:from==='voided'?['RESTORE_SOURCE']:['SOURCE_CORRECTED'];return {status:path('case',from,events),events};}
 if(from==='review')return {status:path('case',from,['SOURCE_CORRECTED']),events:['SOURCE_CORRECTED'],hold:true};
 const events=from==='new'?['CHECK_START','EVIDENCE_READY','DECIDE']:from==='voided'?['RESTORE_SOURCE','EVIDENCE_READY','DECIDE']:from==='checking'?['EVIDENCE_READY','DECIDE']:['SOURCE_CORRECTED','EVIDENCE_READY','DECIDE'];
 return {status:path('case',from,events),events};
}
// Việc cân: bắt đầu thực hiện từ trạng thái hiện tại (nhận việc + bắt đầu, qua đúng các bước đặc tả).
function taskStart(state){
 const pre={queued:[],retry_wait:[],exception_recorded:['RECOVERY'],waiting_dependency:['DEPENDENCY_READY'],claimed:null,in_progress:null}[state];
 if(state==='in_progress')return {status:'in_progress',events:[]};
 const events=pre===null?['START']:[...(pre||[]),'CLAIM','START'];return {status:path('task',state,events),events};
}
function control(previous,event,evidence={}){
 const p=previous||{level:0,manualFloor:0},floor=Math.max(0,Math.min(3,Number(p.manualFloor)||0));let level=Math.max(floor,Number(p.level)||0);
 if(event==='NEED_BASELINE')level=Math.max(level,1);
 else if(event==='PHYSICAL_LOSS')level=Math.max(level,2);
 else if(event==='MEASUREMENT_CONFLICT'){if(level<1)throw Error('INVALID_CONTROL_EVENT: MEASUREMENT_CONFLICT cần món đang được kiểm soát (mức ≥ 1)');level=3;}
 // Đổi cấu hình / công thức / cách đo: giữ mức (không xoá rủi ro); cần mốc mới thì tối thiểu M1.
 else if(['CONFIG_CHANGED','RECIPE_CHANGED','MEASUREMENT_CHANGED'].includes(event)){if(evidence.requireCheckpoint===true)level=Math.max(level,1);}
 else if(event==='CLEAN_WINDOW_PASSED'){
  // Automatic release is disabled until calibrated criteria have been explicitly configured.
  // Tiêu chí lấy từ bộ tham số đã hiệu chuẩn (evidence.criteria); thiếu thì dùng mốc khởi điểm đặc tả 3.3 (5 mốc / 3 ngày / cách 7 ngày).
  const k=evidence.criteria||{validPoints:5,activeDays:3,daysBetween:7};
  if(evidence.releaseEnabled===true&&evidence.validPoints>=k.validPoints&&evidence.activeDays>=k.activeDays&&evidence.usedEnough===true&&evidence.pending===0&&evidence.ackComplete===true&&evidence.daysSinceLastRelease>=k.daysBetween)level=Math.max(floor,level-1);
 }else if(!['ACK','TASK_RESULT','DUE','OFFLINE','NO_ACTIVITY','EXCEPTION','MANUAL_FLOOR_SET'].includes(event))throw Error('INVALID_CONTROL_EVENT');
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
 return {read,put(command){if(!command.id||!['measurement','exception','close_exception','evidence'].includes(command.kind))throw Error('Lệnh lưu không hợp lệ');const rows=read();if(rows.some(x=>x.id===command.id))return;if(rows.length>=100)throw Error('Bộ nhớ công việc đã đầy; kết nối để đồng bộ trước');storage.setItem(name,JSON.stringify([...rows,{...command,storeId:store}]));},remove(id){storage.setItem(name,JSON.stringify(read().filter(x=>x.id!==id)));}};
}
const api={VERSION,POLICY,DAY,states,ms,finite,stable,storeId,collection,SHARED,tableName,rootPath,key,digest,round,split,isBarista,group,interval,SPEC,lotKey,specCheck,specOutcome,decision,measuredDecision,audit,transition,path,caseFlow,taskStart,control,measurement,outbox};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2=api;
})(typeof window!=='undefined'?window:globalThis);
