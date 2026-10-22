/* Fixed-store persistence and recovery for Unit Engine 2. No UI dependencies. */
(function(root){
'use strict';
const E=typeof module==='object'&&module.exports?require('./unit_engine2_v1.js'):root.UnitEngine2;
function create(opts){
 const store=E.storeId(opts.storeId),fs=opts.fstore,now=opts.now||Date.now;
 // Mặc định theo luật data_access (bảng dùng chung không hậu tố) — worker không có GieoData vẫn đúng ở quán ≠ gg01.
 const coll=opts.collection||(kind=>fs.collection(E.tableName(kind,store)));
 const base=coll('duty_digests').doc('_engine2'),sub=n=>base.collection(n),iso=()=>new Date(now()).toISOString();
 const error=m=>{const e=new Error(m);e.code='ENGINE2_RETRY';return e;};
 const data=s=>s.exists?{...s.data(),id:s.id}:null;
 const active=c=>c.enabled===true&&c.mode==='active'&&c.protocolVersion===1&&c.fleetConfirmed===true;
 function checkpointOf(c,point,to){
  const old=c.lastShiftWeigh,legacy=old&&old.op!==point?.operationId&&E.finite(old.weighed)&&old.op&&Number.isFinite(E.ms(old.at))?{id:'legacy_'+old.op,status:'valid',containerId:c.id,countedAt:old.at,quality:'legacy_recorded',sourcePath:coll('stock_containers').doc(c.id).path,sourceOp:old.op}:null;
  return [point,legacy].filter(p=>p&&E.ms(p.countedAt)>E.ms(c.openedAt)&&E.ms(p.countedAt)<E.ms(to)).sort((a,b)=>E.ms(b.countedAt)-E.ms(a.countedAt))[0]||null;
 }
 // Việc của chính lượt cân: in_progress → done (VALID_RESULT). Việc khác cùng món được lượt cân này phủ → superseded (NEW_REVISION):
 // đặc tả 3.4 chỉ cho VALID_RESULT dẫn tới done.
 function finalOwn(status){return status==='in_progress'?{status:E.transition('task',status,'VALID_RESULT')}:['done','superseded','cancelled'].includes(status)?{}:{status:E.transition('task',status,'NEW_REVISION')};}
 function settle(t,docs,resultRef,cut){for(const w of docs){const st=w.data().status;if(E.ms(w.data().createdAt)>cut||['done','superseded','cancelled','in_progress'].includes(st))continue;t.set(w.ref,{status:E.transition('task',st,'NEW_REVISION'),pending:false,resultRef,updatedAt:iso()},{merge:true});}}
 // [Cấp 3–6] Quan sát khoảng (đầu vào học, unit_engine2_learn_v1.js) — suy từ mốc đầu / cuối, KHÔNG đọc thêm sổ bán:
 // used = số đo đầu khoảng − sổ lúc mốc cuối; loss = sổ − số đo. Ghi cùng giao dịch với quyết định / mốc cân.
 function startPoint(c,point){
  if(point&&point.status==='valid'){const m=E.finite(point.counted)?Number(point.counted):point.quality==='legacy_recorded'&&E.finite(c.lastShiftWeigh?.weighed)?Number(c.lastShiftWeigh.weighed):null;if(m!==null)return {at:point.countedAt,measured:m,weighed:true,id:point.id};}
  return {at:typeof c.openedAt==='number'?new Date(c.openedAt).toISOString():c.openedAt,measured:Number(c.baseQty)||0,weighed:false,id:'open'};
 }
 function observation(c,start,end,extra){
  const used=Math.max(0,E.round(start.measured-end.book));
  return {schemaVersion:1,id:E.key(c.id,end.kind,end.at),storeId:store,itemId:c.itemId,unit:c.unit||'',containerId:c.id,from:start.at,fromPoint:start.id,at:end.at,day:new Date(E.ms(end.at)+7*3600000).toISOString().slice(0,10),
   used,loss:E.round(end.book-end.measured),book:end.book,measured:end.measured,nWeigh:(start.weighed?1:0)+(end.weighed?1:0),fromOpen:start.id==='open',cap:start.id==='open'?start.measured:null,verified:used>0,scored:false,...extra,createdAt:iso()};
 }
 const DIAG=['tare_check','density_proof','recipe_portion_weigh','scan_open_units','weigh_sealed_unit','reference_weigh'];
 async function fence(t,guard){if(!guard)return;const s=await t.get(guard.ref);if(!s.exists||s.data().leaseToken!==guard.token||s.data().revision!==guard.revision)throw error('Lease hoặc phiên bản công việc đã thay đổi');}
 async function config(){const s=await base.get();return s.exists?s.data():{};}
 async function enqueue(kind,id,resumeCursor=false){
  if(!['finish','measurement','handover','bootstrap','reprice','recompute_shift','discover_shift','opened'].includes(kind))throw Error('Engine2: loại việc không hợp lệ');
  const ref=sub('requests').doc(E.key(kind,id));
  return fs.runTransaction(async t=>{
   const [c,s]=await Promise.all([t.get(base),t.get(ref)]);const cfg=c.exists?c.data():{};
   if(!cfg.enabled){if(kind!=='measurement')return false;const accepted=await t.get(sub('measurements').doc(id));if(!accepted.exists||accepted.data().acceptedProtocol!==1)return false;}const old=s.exists?s.data():{};
   t.set(ref,{...old,cursor:resumeCursor?old.cursor||null:null,kind,sourceId:id,storeId:store,dirty:true,revision:(old.revision||0)+1,nextTryAt:now(),leaseUntil:old.leaseUntil||0,updatedAt:iso()});return ref.id;
  });
 }
 async function prices(itemId,day,source,item){
  if(E.finite(source.totalCost)&&Number(source.totalCost)>=0)return {status:'known',amount:E.round(Math.abs(Number(source.totalCost))),method:'source_totalCost',sourceId:source.id};
  const s=await coll('price_history').where('itemId','==',itemId).get();
  const rows=s.docs.map(data).filter(x=>x.effectiveFrom&&x.effectiveFrom<=day&&E.finite(x.price)&&Number(x.price)>=0).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  if(rows.length){const p=rows.at(-1);return {status:'known',amount:E.round(-Number(source.qty)*Number(p.price)),method:'price_history',priceId:p.id,price:Number(p.price),effectiveFrom:p.effectiveFrom};}
  // A current price is useful information, never a silently invented historic price.
  return {status:'missing',amount:null,currentPrice:E.finite(item.costPerUnit)?Number(item.costPerUnit):null,method:'missing_effective_price'};
 }
 async function finish(id,guard){
  const sourceRef=coll('stock_transactions').doc(id),sn=await sourceRef.get(),source=data(sn);
  if(source&&!/^finish_.+_WASTE$/.test(id))return false;
  if(source&&!source.referenceId)throw error('Thiếu mã nguồn của lần báo hết');
  const caseRef=sub('cases').doc(E.key('finish',id)),previous=await caseRef.get();
  if(!source){if(previous.exists)throw error('Không đọc được dòng hao hụt gốc; giữ hồ sơ và thử lại');return false;}
  const cfg=await config();if(!cfg.enabled)return false;
  if(cfg.fromDate&&source.businessDate<cfg.fromDate)return false;
  const containerRef=coll('stock_containers').doc(source.referenceId),itemRef=coll('inventory_items').doc(source.itemId);
  const [ct,it]=await Promise.all([containerRef.get(),itemRef.get()]);const c=data(ct),item=data(it);
  if(!c||!item)throw error('Chưa đọc được tem/nguyên liệu của khoản hao hụt');
  if(source.type==='WASTE'&&!source.voided&&c.status!=='finished')throw error('Báo hết đang chốt; giữ việc và thử lại');
  const cpRef=sub('unit_checkpoints').doc(c.id),cpSn=await cpRef.get();
  const persistedPoint=cpSn.exists?cpSn.data():null;
  const cp=checkpointOf(c,persistedPoint,c.finishedAt);
  const range=E.interval(c,cp,c.finishedAt||source.createdAt);
  const shifts=await coll('employee_shifts').where('checkedInAt','>=',new Date(E.ms(range.from)-14*3600000).toISOString()).where('checkedInAt','<=',range.to).limit(501).get();
  if(shifts.docs.length>500)throw error('Khoảng ca vượt giới hạn một lượt; chưa tự chốt trách nhiệm');
  const shiftRows=shifts.docs.map(data),valuation=await prices(source.itemId,source.businessDate,{...source,id},item);
  const input={store,sourceId:id,source,container:c,shifts:shiftRows,checkpoint:cp,valuation};
  const result=E.decision(input),groupKey=(result.allocations||[]).map(a=>a.employeeId).sort().join('+');
  if(['assigned_by_manager','manual'].includes(source.responsibility?.status)&&result.status!=='voided')Object.assign(result,{decisionMode:'manual',basis:'manual_source',manualSource:source.responsibility,allocations:[],pending:{qty:result.quantity,value:result.amount},explanation:'Giữ nguyên quyết định tay trong chứng từ nguồn. Engine 2 không phân bổ lại hoặc tạo khoản thu thứ hai.'});
  const faults=E.audit(result);if(faults.length)throw error('Tự kiểm toán: '+faults.join(', '));
  const fingerprint=E.stable(input),controlRef=sub('controls').doc(source.itemId),taskRef=sub('tasks').doc(E.key('baseline',id));
  return fs.runTransaction(async t=>{
   await fence(t,guard);
   const refs=[base,sourceRef,containerRef,itemRef,cpRef,caseRef,controlRef,taskRef,...shifts.docs.map(s=>s.ref),...(valuation.priceId?[coll('price_history').doc(valuation.priceId)]:[])];
   const snaps=await Promise.all(refs.map(r=>t.get(r)));const [cs,ss,cc,ii,pp,oldSn,ctlSn,taskSn]=snaps;
   const active=cs.exists?cs.data():{};if(!active.enabled)return false;
   if(E.stable(data(ss))!==E.stable(source)||E.stable(data(cc))!==E.stable(c)||E.stable(data(ii))!==E.stable(item)||E.stable(pp.exists?pp.data():null)!==E.stable(persistedPoint)||E.stable(snaps.slice(8,8+shiftRows.length).map(data))!==E.stable(shiftRows))throw error('Nguồn/ca vừa đổi; tính lại từ dữ liệu mới');
   if(E.stable([active.enabled,active.mode,active.fromDate,active.settingsRevision])!==E.stable([cfg.enabled,cfg.mode,cfg.fromDate,cfg.settingsRevision]))throw error('Thiết lập vừa đổi — tính lại theo phiên bản mới');
   if(valuation.priceId){const p=snaps.at(-1);if(!p.exists||Number(p.data().price)!==valuation.price||p.data().effectiveFrom!==valuation.effectiveFrom)throw error('Giá vốn vừa đổi — tính lại');}
   const old=oldSn.exists?oldSn.data():null;if(old?.decisionMode==='manual'&&result.status!=='voided')return false;
   // Trạng thái hồ sơ đi qua bảng DAC_TA 3.2; hồ sơ đã gộp (superseded) / đang xem xét (review) không bị ghi đè.
   let flow;try{flow=E.caseFlow(old?.status,result.status==='voided'?'voided':'decided');}catch(e){return false;}if(flow.hold)return false;
   const mode=active.mode==='active'&&active.protocolVersion===1&&active.fleetConfirmed===true?'active':'shadow';
   if(old?.fingerprint===fingerprint&&old.mode===mode)return false;
   const revision=(old?.revision||0)+1,at=iso(),decisionId=caseRef.id+'_'+revision;
   const d={...result,status:flow.status,statusEvents:flow.events,originKind:'finish',originId:id,containerId:c.id,itemName:c.itemName||item.name||source.itemId,storeId:store,itemId:source.itemId,id:caseRef.id,revision,decisionId,mode,fingerprint,updatedAt:at,createdAt:old?.createdAt||at};
   t.set(caseRef,d);t.set(sub('decisions').doc(decisionId),{...d,previousDecisionId:old?.decisionId||null});
   if(d.mode==='active'&&d.status!=='voided'){
    const oldCtl=ctlSn.exists?ctlSn.data():{level:0,manualFloor:0};
    const control=E.control(oldCtl,'PHYSICAL_LOSS');
    t.set(controlRef,{...control,storeId:store,itemId:source.itemId,itemName:d.itemName,unit:d.unit,revision:(oldCtl.revision||0)+1,requirements:d.control.requirements,updatedAt:at,reasonCaseIds:[...new Set([...(oldCtl.reasonCaseIds||[]),caseRef.id])].slice(-20)});
    if(!taskSn.exists)t.set(taskRef,{id:taskRef.id,storeId:store,itemId:source.itemId,itemName:d.itemName,caseId:caseRef.id,kind:'weigh_open_units',status:'queued',pending:true,assignment:'current_barista_group',createdAt:at,updatedAt:at,controlRevision:(oldCtl.revision||0)+1,revision:1});
    const ids=[...new Set([...(active.controlledItemIds||[]),source.itemId])];if(ids.length>500)throw error('Giới hạn danh sách control; chưa ghi hồ sơ vượt phạm vi');
    t.set(base,{controlledItemIds:ids,revision:(active.revision||0)+1,lastDecisionAt:at},{merge:true});
   }
   if(d.status==='voided'&&taskSn.exists&&!['done','cancelled','superseded'].includes(taskSn.data().status))t.set(taskRef,{status:E.transition('task',taskSn.data().status,'VALID_VOID'),pending:false,reason:'Nguồn hao hụt không còn hiệu lực',updatedAt:at},{merge:true});
   for(const sid of result.shiftIds||[])t.set(sub('shift_links').doc(sid).collection('cases').doc(caseRef.id),{sourceId:id});
   t.set(sub('item_links').doc(source.itemId).collection('cases').doc(caseRef.id),{kind:'finish',sourceId:id});
   t.set(sub('audits').doc(decisionId),{decisionId,storeId:store,at,issues:faults,quantity:d.quantity||0,sourceId:id,policyVersion:E.POLICY});
   // Quan sát báo hết (cả đối chiếu thử — dữ liệu học không đổi kho / trách nhiệm). Nguồn huỷ → quan sát không dùng để học.
   const ob=observation(c,startPoint(c,cp),{kind:'finish',at:c.finishedAt,book:Number(c.wasteBase)||0,measured:0,weighed:false},{sampling:'finish',groupKey,vesselIds:[],controlled:!!(ctlSn.exists&&ctlSn.data().level>=2),ctx:{fifoDebt:false,densityProven:Number(item.densityGPerMl)>0},decisionId,mode});
   if(d.status==='voided')Object.assign(ob,{verified:false,reason:'Nguồn hao hụt đã huỷ'});t.set(sub('obs').doc(ob.id),ob);return d;
  });
 }
 async function handover(id,guard){
  const c=await config();if(!active(c))return;
  await enqueue('recompute_shift',id);await enqueue('discover_shift',id);
  const s=await coll('employee_shifts').doc(id).get();if(!s.exists||!E.isBarista(s.data()))return;
  const at=iso(),shift=s.data();
  for(const itemId of Math.abs(now()-E.ms(shift.checkedOutAt||shift.checkedInAt))<=14*3600000?c.controlledItemIds||[]:[]){
   const ctl=await sub('controls').doc(itemId).get();if(!ctl.exists||ctl.data().level<1)continue;
   const ref=sub('tasks').doc(E.key('handover',id,itemId,shift.checkedOutAt||shift.checkedInAt));
   await fs.runTransaction(async t=>{await fence(t,guard);const [cfg,old]=await Promise.all([t.get(base),t.get(ref)]);if(!cfg.exists||!active(cfg.data())||old.exists)return;
    t.set(ref,{id:ref.id,storeId:store,itemId,itemName:ctl.data().itemName||itemId,caseId:(ctl.data().reasonCaseIds||[]).at(-1)||'',kind:'weigh_open_units',status:'queued',pending:true,assignment:'current_barista_group',reason:'Nhóm pha chế thay đổi — cân bàn giao',createdAt:at,updatedAt:at,revision:1,shiftId:id});t.set(base,{revision:(cfg.data().revision||0)+1,lastTaskAt:at},{merge:true});});
  }
 }
 async function opened(id,guard){
  const cfg=await config();if(!active(cfg))return;const sn=await coll('stock_containers').doc(id).get();if(!sn.exists||sn.data().status!=='open'||!(cfg.controlledItemIds||[]).includes(sn.data().itemId))return;
  const c=sn.data(),ref=sub('tasks').doc(E.key('opened',id,c.openedAt));
  return fs.runTransaction(async t=>{await fence(t,guard);const [cs,ctl,old]=await Promise.all([t.get(base),t.get(sub('controls').doc(c.itemId)),t.get(ref)]);if(!cs.exists||!active(cs.data())||!ctl.exists||ctl.data().level<1||old.exists)return;
   const at=iso();t.set(ref,{id:ref.id,storeId:store,itemId:c.itemId,itemName:c.itemName||ctl.data().itemName||c.itemId,caseId:(ctl.data().reasonCaseIds||[]).at(-1)||'',kind:'weigh_open_units',status:'queued',pending:true,assignment:'current_barista_group',reason:'Mã mới mở — lấy mốc cân theo kiểm soát',containerId:id,createdAt:at,updatedAt:at,revision:1});t.set(base,{revision:(cs.data().revision||0)+1,lastTaskAt:at},{merge:true});});
 }
 async function ensureCloseTasks(day,cycle='',targets=null){
  const cfg=await config();if(!active(cfg))return;
  for(const itemId of (cfg.controlledItemIds||[]).filter(id=>!targets||targets.includes(id))){
   const ref=sub('tasks').doc(E.key('day_close',day,itemId,cycle));
   await fs.runTransaction(async t=>{const [c,ctl,s]=await Promise.all([t.get(base),t.get(sub('controls').doc(itemId)),t.get(ref)]);if(!c.exists||!active(c.data())||!ctl.exists||ctl.data().level<1||s.exists)return;
    const at=iso();t.set(ref,{id:ref.id,storeId:store,itemId,itemName:ctl.data().itemName||itemId,caseId:(ctl.data().reasonCaseIds||[]).at(-1)||'',kind:'weigh_open_units',status:'queued',pending:true,assignment:'current_barista_group',reason:'Cân cuối ngày',businessDate:day,closeCycle:cycle,createdAt:at,updatedAt:at,revision:1});});
  }
 }
 async function registerVessel(name,tareG,staff){
  if(!staff?.id||!String(name||'').trim()||!E.finite(tareG)||Number(tareG)<0)throw Error('Nhập tên dụng cụ và bì đã cân thực tế');
  const ref=coll('prep_vessels').doc();await ref.set({name:String(name).trim().slice(0,100),variants:[{id:'measured',label:'Bì đã cân',tareG:Number(tareG)}],createdAt:iso(),updatedAt:iso(),createdByEmployeeId:staff.id,source:'engine2_measured_tare'});return ref.id;
 }
 async function requestMeasurement(taskId,line,staff){
  if(!staff?.id||!line?.itemId||!Array.isArray(line.units)||!line.sessionId)throw Error('Thiếu người cân hoặc mã phiên đo');
  const ref=sub('measurements').doc(E.key(taskId,line.itemId,line.sessionId)),taskRef=sub('tasks').doc(taskId),lockRef=sub('measurement_locks').doc(line.itemId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(line.businessDate||''))throw Error('Thiếu ngày của lượt cân');
  const dayStart=Date.parse(line.businessDate+'T00:00:00+07:00'),dayEnd=dayStart+86400000;
  const staffShifts=await coll('employee_shifts').where('employeeId','==',staff.id).where('checkedInAt','>=',new Date(dayStart-14*3600000).toISOString()).where('checkedInAt','<',new Date(dayEnd).toISOString()).limit(51).get();
  if(staffShifts.docs.length>50||!E.group(staffShifts.docs.map(data),new Date(dayStart).toISOString(),new Date(dayEnd).toISOString()).people.some(p=>p.id===staff.id))throw Error('Chưa xác thực được ca pha chế của người cân trong ngày');
  const operationId='e2sw_'+(await E.digest(ref.id)).slice(0,32);
  const result=await fs.runTransaction(async t=>{
   const [cfg,ts,old,lock,...evidence]=await Promise.all([t.get(base),t.get(taskRef),t.get(ref),t.get(lockRef),...line.units.map(u=>t.get(sub('unit_checkpoints').doc(u.id))),...line.units.map(u=>t.get(coll('stock_containers').doc(u.id))),...staffShifts.docs.map(sh=>t.get(sh.ref))]);
   const points=evidence.slice(0,line.units.length),containers=evidence.slice(line.units.length,line.units.length*2),actorProof=evidence.slice(line.units.length*2);
   if(E.stable(actorProof.map(data))!==E.stable(staffShifts.docs.map(data)))throw error('Ca người cân vừa đổi — xác thực lại');
   if(old.exists)return ref.id;
   function rejected(message){const at=iso();t.set(ref,{id:ref.id,taskId,storeId:store,itemId:line.itemId,line,staff,status:'rejected',acceptedProtocol:1,lastError:message,createdAt:at,updatedAt:at});
    // Bị từ chối trước khi bắt đầu: giữ nguyên trạng thái việc (chưa nhận), chỉ ghi lý do để POS hiện.
    if(ts.exists&&!['done','cancelled','superseded','in_progress'].includes(ts.data().status))t.set(taskRef,{pending:true,lastError:message,updatedAt:at},{merge:true});
    if(cfg.exists)t.set(base,{revision:(cfg.data().revision||0)+1,lastRejectedAt:at},{merge:true});return ref.id;}
   if(!cfg.exists||!active(cfg.data()))return rejected('Engine2 đã dừng nhận phép cân mới; chưa thay đổi kho');
   if(!ts.exists||ts.data().itemId!==line.itemId)return rejected('Nhiệm vụ đã thay đổi — tải lại danh sách');
   if(['done','cancelled','superseded'].includes(ts.data().status))return rejected('Việc cân đã kết thúc; không áp thêm lần nữa');
   if(ts.data().blind&&ts.data().excludeStaffId&&ts.data().excludeStaffId===staff.id)return rejected('Cân xác nhận độc lập (M3) cần người khác người cân trước');
   if(lock.exists&&lock.data().measurementId!==ref.id)return rejected('Món này có lượt cân đang xử lý; chờ kết quả để tránh cân trùng');
   if(containers.some(s=>!s.exists||s.data().itemId!==line.itemId||s.data().status!=='open'))return rejected('Mã đang mở đã đổi trạng thái — tải lại danh sách');
   if(new Set(line.units.map(u=>u.id)).size!==line.units.length)throw Error('Một mã chỉ được xuất hiện một lần trong lượt cân');
   const frozen={...line,units:line.units.map((u,i)=>({...u,checkpointSnapshot:checkpointOf(data(containers[i]),points[i].exists?points[i].data():null,u.countedAt)}))};
   const at=iso();t.set(ref,{id:ref.id,taskId,operationId,storeId:store,itemId:line.itemId,line:frozen,staff,status:'queued',acceptedProtocol:1,createdAt:at,updatedAt:at});
   t.set(sub('operations').doc(operationId),{measurementId:ref.id,storeId:store});
   t.set(lockRef,{measurementId:ref.id,createdAt:at});
   const start=E.taskStart(ts.data().status);t.set(taskRef,{status:start.status,statusEvents:start.events,measurementId:ref.id,byEmployeeId:staff.id,startedAt:line.startedAt||null,updatedAt:at},{merge:true});return ref.id;
  });await enqueue('measurement',result);return result;
 }
 async function measure(id,guard){
  const ref=sub('measurements').doc(id),s=await ref.get();if(!s.exists||s.data().status==='rejected')return;
  if(s.data().acceptedProtocol!==1)throw error('Lượt cân chưa có xác nhận giao thức');
  if(!opts.inventory&&!opts.getInventory)throw error('Chưa có inventory adapter');
  const m=s.data(),itemSn=await coll('inventory_items').doc(m.itemId).get();if(!itemSn.exists)throw error('Nguyên liệu đã thay đổi');
  const item=itemSn.data(),line=JSON.parse(JSON.stringify(m.line)),alreadyComplete=m.status==='done';
  const inventory=opts.getInventory?await opts.getInventory(m.itemId):opts.inventory;
  if(Number(String(inventory.VERSION).split('.')[0])<21)throw error('Inventory adapter cần phiên bản 21');
  async function reject(message){
   await fs.runTransaction(async t=>{await fence(t,guard);const [s,l,c,tk]=await Promise.all([t.get(ref),t.get(sub('measurement_locks').doc(m.itemId)),t.get(base),t.get(sub('tasks').doc(m.taskId))]);if(!s.exists||s.data().status==='done')return;t.set(ref,{status:'rejected',lastError:message,updatedAt:iso()},{merge:true});
    // Lượt cân bị từ chối sau khi bắt đầu → retry_wait (đặc tả 3.4); POS vẫn thấy việc (pending) để cân lại.
    if(tk.exists)t.set(sub('tasks').doc(m.taskId),{...(['claimed','in_progress'].includes(tk.data().status)?{status:E.transition('task',tk.data().status,'TRANSIENT_FAILURE')}:{}),pending:true,lastError:message,updatedAt:iso()},{merge:true});if(l.exists&&l.data().measurementId===id)t.delete(sub('measurement_locks').doc(m.itemId));if(c.exists)t.set(base,{revision:(c.data().revision||0)+1,lastRejectedAt:iso()},{merge:true});});
   return {rejected:true};
  }
  if(!line.units.length){
   if(alreadyComplete)return;
   const [rt,open]=await Promise.all([inventory.units.ref(m.itemId).once('value'),coll('stock_containers').where('itemId','==',m.itemId).where('status','==','open').limit(1).get()]);
   const live=Object.entries(rt.val()||{}).filter(([k,v])=>k!=='__prepLock'&&v&&!v.finishedDebt&&!v.discardPending);
   if(live.length||open.docs.length)return reject('Có mã đang mở — tải lại danh sách và cân đúng mã');
   const older=await sub('tasks').where('itemId','==',m.itemId).where('pending','==',true).limit(100).get();
   await fs.runTransaction(async t=>{await fence(t,guard);const [l,c]=await Promise.all([t.get(sub('measurement_locks').doc(m.itemId)),t.get(base)]);if(c.exists)t.set(base,{revision:(c.data().revision||0)+1,lastInspectionAt:iso()},{merge:true});t.set(ref,{status:'done',result:{kind:'no_open_units',verified:true},completedAt:iso()},{merge:true});settle(t,older.docs,ref.path,now());const own=await t.get(sub('tasks').doc(m.taskId));if(own.exists)t.set(own.ref,{...finalOwn(own.data().status),pending:false,resultRef:ref.path,updatedAt:iso()},{merge:true});if(l.exists&&l.data().measurementId===id)t.delete(sub('measurement_locks').doc(m.itemId));});return;
  }
  if(!(Number(item.densityGPerMl)>0)&&line.densityProof){const p=line.densityProof;if(!E.finite(p.netG)||!E.finite(p.volumeMl)||Number(p.netG)<=0||Number(p.volumeMl)<=0)return reject('Số đo tỷ trọng không hợp lệ');item.densityGPerMl=Number(p.netG)/Number(p.volumeMl);}
  if(!alreadyComplete&&['ml','l'].includes(String(item.unit).toLowerCase())){if(!E.finite(line.densitySnapshot)||!(Number(line.densitySnapshot)>0))return reject('Thiếu bản chụp tỷ trọng lúc cân — cân lại để giữ đủ căn cứ');if(Math.abs(Number(item.densityGPerMl)-Number(line.densitySnapshot))>1e-9)return reject('Tỷ trọng vừa thay đổi — kiểm tra lại số cân');}
  if(!alreadyComplete)try{
  for(const u of line.units){
   for(const w of u.weighings||[]){const v=await coll('prep_vessels').doc(w.vesselId).get();const variant=v.exists?(v.data().variants||[]).find(x=>x.id===w.variantId):null;if(!variant||!E.finite(variant.tareG)||Number(variant.tareG)!==Number(w.tareG))return reject('Dụng cụ hoặc bì đã thay đổi — chọn lại rồi cân');}
   const v=E.measurement(u.weighings,item);if(Math.abs(v.net-Number(u.weighed))>0.015||!E.finite(u.baseline)||!Number.isFinite(E.ms(u.countedAt)))throw error('Phép cân không khớp chứng cứ');
   if(Number(u.capacity)>0&&u.weighed>Number(u.capacity)*1.1)return reject('Số cân lớn hơn dung tích mã — kiểm tra bì và đơn vị');
   const limit=(Number(u.capacity)>0?Number(u.capacity):Math.max(Math.abs(u.baseline),1))*.25;
   if(Math.abs(u.baseline-u.weighed)>limit&&!line.largeDeviationConfirmed)return reject('Cần cân lại khi số đo lệch lớn');
  }
  }catch(e){return reject(e.message);}
  if(m.operationId!=='e2sw_'+(await E.digest(id)).slice(0,32))throw error('Mã lượt cân không khớp');
  line.engine2Owner=true;line.engine2OpId=m.operationId;line._devAck=true;
  const day=m.line.businessDate||new Date(E.ms(m.createdAt)+7*3600000).toISOString().slice(0,10);
  let out;try{out=alreadyComplete?m.result:await inventory.shift.applyLine(line,day,m.staff,m.operationId);}catch(e){if(e.code==='SW_RELOAD')return reject(e.message);throw e;}
  if(out?.status!=='reconciled')throw error('Chưa đối soát đủ mã; không đóng nhiệm vụ');
  const decisions=[],proofs=[];
  for(const u of line.units){
   const txSn=await coll('stock_transactions').doc(out.opId+'_'+u.id).get();
   if(!txSn.exists){const debt=u.code===out.newestCode?(out.debtAbsorbed||[]).reduce((s,d)=>s+Number(d.amount||0),0):0;if(Math.abs(E.round(u.baseline-u.weighed+debt))>0.005)throw error('Không đọc được dòng sổ của lượt cân đã áp dụng');continue;}
   proofs.push({ref:txSn.ref,data:data(txSn)});
   if(txSn.data().type!=='WASTE'||txSn.data().voided){decisions.push({schemaVersion:1,policyVersion:E.POLICY,storeId:store,itemId:m.itemId,containerId:u.id,sourceId:txSn.id,sourcePath:txSn.ref.path,status:'voided',quantity:0,amount:0,allocations:[]});continue;}
   const tx=data(txSn),ctSn=await coll('stock_containers').doc(u.id).get(),ct=data(ctSn);if(!ct)throw error('Thiếu mã khi phân bổ hao hụt cân');
   const range=E.interval(ct,u.checkpointSnapshot,u.countedAt),sh=await coll('employee_shifts').where('checkedInAt','>=',new Date(E.ms(range.from)-14*3600000).toISOString()).where('checkedInAt','<=',range.to).limit(501).get();
   if(sh.docs.length>500)throw error('Khoảng pha chế vượt giới hạn một lượt');
   proofs.push({ref:ctSn.ref,data:ct},...sh.docs.map(s=>({ref:s.ref,data:data(s)})));
   const d=E.measuredDecision({store,sourceId:tx.id,source:tx,container:ct,shifts:sh.docs.map(data),checkpoint:u.checkpointSnapshot,countedAt:u.countedAt,valuation:await prices(m.itemId,day,tx,item)});
   if(['assigned_by_manager','manual'].includes(tx.responsibility?.status))Object.assign(d,{decisionMode:'manual',basis:'manual_source',manualSource:tx.responsibility,allocations:[],pending:{qty:d.quantity,value:d.amount},explanation:'Giữ quyết định tay trên dòng hao hụt gốc; không tự phân bổ lại.'});
   const faults=E.audit(d);if(faults.length)throw error(faults.join(', '));decisions.push(d);
  }
  const waiting=await sub('tasks').where('itemId','==',m.itemId).where('pending','==',true).limit(100).get();
  return fs.runTransaction(async t=>{
   await fence(t,guard);
   const [latest,cs,ts,...observed]=await Promise.all([t.get(ref),t.get(base),t.get(sub('tasks').doc(m.taskId)),...line.units.map(u=>t.get(sub('unit_checkpoints').doc(u.id))),...proofs.map(p=>t.get(p.ref)),...decisions.map(d=>t.get(sub('cases').doc(E.key('weigh',id,d.containerId))))]);
   const previousPoints=observed.slice(0,line.units.length),checked=observed.slice(line.units.length,line.units.length+proofs.length),oldCases=observed.slice(line.units.length+proofs.length);
   if(!latest.exists)return;
   if(checked.some((s,i)=>E.stable(data(s))!==E.stable(proofs[i].data)))throw error('Nguồn/ca vừa đổi sau cân — đối chiếu lại');
   // Applied inventory must always be acknowledged even if the UI disabled new decisions meanwhile.
   const at=iso();if(!alreadyComplete)t.set(ref,{status:'done',result:out,completedAt:at,updatedAt:at},{merge:true});
   if(!alreadyComplete&&ts.exists)t.set(sub('tasks').doc(m.taskId),{...finalOwn(ts.data().status),pending:false,resultRef:ref.path,finishedAt:line.finishedAt||null,updatedAt:at},{merge:true});
   const cut=Math.min(...line.units.map(u=>E.ms(u.countedAt)));
   if(!alreadyComplete)settle(t,waiting.docs,ref.path,cut);
   for(const [i,d] of decisions.entries()){
    const caseId=E.key('weigh',id,d.containerId),old=oldCases[i].exists?oldCases[i].data():null,fingerprint=E.stable(d);if(old?.decisionMode==='manual'&&d.status!=='voided'||old?.fingerprint===fingerprint||!old&&d.status==='voided')continue;
    let flow;try{flow=E.caseFlow(old?.status,d.status==='voided'?'voided':'decided');}catch(e){continue;}if(flow.hold)continue;
    const revision=(old?.revision||0)+1,decisionId=caseId+'_'+revision;t.set(sub('cases').doc(caseId),{...d,status:flow.status,statusEvents:flow.events,originKind:'measurement',originId:id,id:caseId,decisionId,mode:'active',fingerprint,revision,createdAt:old?.createdAt||at,updatedAt:at});t.set(sub('decisions').doc(decisionId),{...d,decisionId,mode:'active',createdAt:at});t.set(sub('audits').doc(decisionId),{issues:[],decisionId,storeId:store,at,sourceId:d.sourceId});
    for(const sid of d.shiftIds||[])t.set(sub('shift_links').doc(sid).collection('cases').doc(caseId),{kind:'measurement',sourceId:id});
    t.set(sub('item_links').doc(d.itemId).collection('cases').doc(caseId),{kind:'measurement',sourceId:id});
   }
   for(const [i,u] of line.units.entries()){
    if(alreadyComplete)break;
    const cp={id:E.key(id,u.id),storeId:store,itemId:m.itemId,containerId:u.id,status:'valid',countedAt:u.countedAt,byEmployeeId:m.staff.id,book:u.baseline,counted:u.weighed,weighings:u.weighings,unitSnapshot:item.unit,densitySnapshot:['ml','l'].includes(String(item.unit).toLowerCase())?Number(item.densityGPerMl):null,measurementId:id,operationId:out.opId,createdAt:at};
    if(ts.exists){const tk=ts.data();Object.assign(cp,{sampling:tk.sampling||'control',blind:!!tk.blind,startedAt:line.startedAt||null,finishedAt:line.finishedAt||null});}
    t.set(sub('checkpoints').doc(cp.id),cp);
    const dc=decisions.find(x=>x.containerId===u.id),tk=ts.exists?ts.data():{};
    const ob=observation({id:u.id,itemId:m.itemId,unit:item.unit,openedAt:u.openedAt,baseQty:u.capacity},startPoint({openedAt:u.openedAt,baseQty:u.capacity},u.checkpointSnapshot),{kind:'weigh',at:u.countedAt,book:Number(u.baseline),measured:Number(u.weighed),weighed:true},
     {sampling:tk.sampling||'control',blind:!!tk.blind,groupKey:(dc?.allocations||[]).map(a=>a.employeeId).sort().join('+'),vesselIds:(u.weighings||[]).map(w=>w.vesselId),controlled:(tk.sampling||'control')==='control',measuredBy:m.staff.id,measurementId:id,
      minutes:line.startedAt&&line.finishedAt?Math.max(0,(E.ms(line.finishedAt)-E.ms(line.startedAt))/60000):null,ctx:{fifoDebt:Number(u.baseline)<0,densityProven:!['ml','l'].includes(String(item.unit).toLowerCase())||Number(item.densityGPerMl)>0}});
    t.set(sub('obs').doc(ob.id),ob);if(!previousPoints[i].exists||E.ms(previousPoints[i].data().countedAt)<=E.ms(cp.countedAt))t.set(sub('unit_checkpoints').doc(u.id),cp);
   }
   if(!alreadyComplete){t.delete(sub('measurement_locks').doc(m.itemId));t.set(base,{lastMeasurementAt:at,revision:(cs.exists?cs.data().revision||0:0)+1},{merge:true});}
  });
 }
 // Việc do worker học sinh ra (chẩn đoán / cân ngẫu nhiên M0 / xác nhận độc lập M3). Mã việc cố định → chạy lại không đúp.
 async function createTask(kind,itemId,key,extra={}){
  if(![...DIAG,'weigh_open_units'].includes(kind))throw Error('Engine2: loại việc không hợp lệ');
  const ref=sub('tasks').doc(E.key(kind,itemId,key));
  return fs.runTransaction(async t=>{const [old,cfg]=await Promise.all([t.get(ref),t.get(base)]);if(old.exists||!cfg.exists||!active(cfg.data()))return false;const at=iso();
   t.set(ref,{id:ref.id,storeId:store,itemId,kind,status:'queued',pending:true,assignment:'current_barista_group',createdAt:at,updatedAt:at,revision:1,...extra});t.set(base,{revision:(cfg.data().revision||0)+1,lastTaskAt:at},{merge:true});return ref.id;});
 }
 // Kết quả việc chẩn đoán = NHÃN cho giả thuyết (worker học chấm). Không đổi kho; đề xuất đổi bì / định mức đi đường riêng.
 async function submitEvidence(taskId,result,staff){
  if(!staff?.id)throw Error('Cần người thực hiện');const ref=sub('tasks').doc(taskId);
  return fs.runTransaction(async t=>{
   const ts=await t.get(ref);if(!ts.exists)throw Error('Không có việc này');const task=ts.data();if(!DIAG.includes(task.kind))throw Error('Việc này không phải việc chẩn đoán');
   if(['done','cancelled','superseded'].includes(task.status))return false;
   const r={...result};
   if(task.kind==='tare_check'){if(!r.vesselId||!r.variantId||!E.finite(r.measuredTareG)||Number(r.measuredTareG)<0)throw Error('Cân bì dụng cụ rỗng và chọn đúng dụng cụ');const v=await t.get(coll('prep_vessels').doc(r.vesselId));const vr=v.exists?(v.data().variants||[]).find(x=>x.id===r.variantId):null;if(!vr)throw Error('Dụng cụ đã thay đổi');r.recordedTareG=Number(vr.tareG);r.measuredTareG=Number(r.measuredTareG);}
   else if(task.kind==='recipe_portion_weigh'){if(!(Number(r.bookG)>0)||!(Number(r.measuredG)>0))throw Error('Nhập định lượng theo công thức và số cân thực của một phần');r.bookG=Number(r.bookG);r.measuredG=Number(r.measuredG);}
   else if(task.kind==='density_proof'){if(!(Number(r.netG)>0)||!(Number(r.volumeMl)>0))throw Error('Nhập khối lượng ròng và thể tích mẫu');r.density=Number(r.netG)/Number(r.volumeMl);}
   else if(task.kind==='scan_open_units'){if(!Array.isArray(r.present)||!Array.isArray(r.unregistered))throw Error('Đánh dấu mã có trên tay và ghi mã đang mở chưa khai');}
   else if(task.kind==='weigh_sealed_unit'){if(!(Number(r.recorded)>0)||!(Number(r.measuredNet)>0))throw Error('Cân một tem NGUYÊN chưa mở: nhập dung tích ghi trên tem và lượng ròng cân được');r.recorded=Number(r.recorded);r.measuredNet=Number(r.measuredNet);}
   else if(task.kind==='reference_weigh'){if(!(Number(r.known)>0)||!(Number(r.reading)>=0))throw Error('Đặt vật mẫu biết trước khối lượng lên cân: nhập khối lượng chuẩn và số cân hiện');r.known=Number(r.known);r.reading=Number(r.reading);}
   const at=iso(),start=E.taskStart(task.status);
   t.set(sub('evidence').doc(taskId),{taskId,storeId:store,kind:task.kind,itemId:task.itemId,resolves:task.resolves||null,posterior:task.posterior??null,obsId:task.obsId||null,result:r,byEmployeeId:staff.id,at,labeled:false});
   t.set(ref,{status:E.transition('task',start.status,'VALID_RESULT'),statusEvents:[...start.events,'VALID_RESULT'],pending:false,resultRef:sub('evidence').doc(taskId).path,updatedAt:at},{merge:true});return true;
  });
 }
 /* [Cấp 3–6] Lượt HỌC hằng ngày (worker gọi; chỉ chạy một lần / ngày VN trừ khi force). Đọc có giới hạn:
  * quan sát 90 ngày (≤ 3000), kết quả chẩn đoán chưa gắn nhãn (≤ 200), control (≤ 500). Không đụng kho / tiền.
  * 1) gắn nhãn kết quả chẩn đoán → hiệu chuẩn giả thuyết; 2) chấm quan sát mới (bất thường / cộng dồn) → giả thuyết kiểm được →
  * việc chẩn đoán, tăng mức (M3 → cân độc lập người khác); 3) hạ mức theo tiêu chí đã hiệu chuẩn; 4) cân ngẫu nhiên M0 theo ngân sách;
  * 5) hiệu chuẩn có rào hằng tuần + quay lui + kiểm toán mô hình; 6) ghi models/current (QL2 + chứng nhận đọc). */
 async function learnDay(opts={}){
  const L=opts.learn||(typeof module==='object'&&module.exports?require('./unit_engine2_learn_v1.js'):root.UnitEngine2Learn);if(!L)throw error('Chưa nạp module học');
  const cfg=await config();if(!cfg.enabled)return {skipped:'disabled'};
  const day=new Date(now()+7*3600000).toISOString().slice(0,10),modelRef=sub('models').doc('current'),paramsRef=sub('models').doc('params');
  const [mSn,pSn]=await Promise.all([modelRef.get(),paramsRef.get()]),prev=mSn.exists?mSn.data():{};
  if(prev.day===day&&!opts.force)return {skipped:'done_today'};
  const P=L.withDefaults(pSn.exists&&pSn.data().params?pSn.data().params:(opts.params||L.DEFAULT_PARAMS));
  const since=new Date(now()-90*86400000).toISOString();
  const [oSn,eSn,cSn,vSn]=await Promise.all([sub('obs').where('at','>=',since).orderBy('at').limit(3001).get(),sub('evidence').where('labeled','==',false).limit(200).get(),sub('controls').limit(501).get(),sub('model_versions').orderBy('createdAt').limit(200).get()]);
  if(oSn.docs.length>3000)throw error('Quá 3000 quan sát trong 90 ngày — cần phân vùng học, chưa tự chốt');
  const obs=oSn.docs.map(data),controls=Object.fromEntries(cSn.docs.map(d=>[d.id,data(d)])),at=iso(),writes=[];
  // 1) Nhãn từ kết quả chẩn đoán (quy tắc cố định, kiểm được).
  const labels=JSON.parse(JSON.stringify(prev.labels||{})),tareChecks=JSON.parse(JSON.stringify(prev.tareChecks||{})),recipeAudits=JSON.parse(JSON.stringify(prev.recipeAudits||{}));
  const sealedChecks=JSON.parse(JSON.stringify(prev.sealedChecks||{})),referenceChecks=JSON.parse(JSON.stringify(prev.referenceChecks||[]));
  for(const ev of eSn.docs.map(data)){
   const r=ev.result||{};let y=null;
   if(ev.kind==='tare_check'){y=Math.abs(r.measuredTareG-r.recordedTareG)>2*(P.measSigma.g||3)?1:0;(tareChecks[r.vesselId]=tareChecks[r.vesselId]||[]).push({recorded:r.recordedTareG,measured:r.measuredTareG});tareChecks[r.vesselId]=tareChecks[r.vesselId].slice(-20);}
   else if(ev.kind==='recipe_portion_weigh'){y=Math.abs(r.measuredG-r.bookG)/r.bookG>0.05?1:0;(recipeAudits[ev.itemId]=recipeAudits[ev.itemId]||[]).push({book:r.bookG,measured:r.measuredG});recipeAudits[ev.itemId]=recipeAudits[ev.itemId].slice(-20);}
   else if(ev.kind==='density_proof'){const it=await coll('inventory_items').doc(ev.itemId).get(),old=Number(it.exists&&it.data().densityGPerMl);y=old>0?(Math.abs(r.density-old)/old>0.03?1:0):1;}
   else if(ev.kind==='scan_open_units')y=(r.unregistered||[]).length>0?1:0;
   else if(ev.kind==='weigh_sealed_unit'){y=Math.abs(r.recorded-r.measuredNet)/r.recorded>0.02?1:0;(sealedChecks[ev.itemId]=sealedChecks[ev.itemId]||[]).push({recorded:r.recorded,measured:r.measuredNet});sealedChecks[ev.itemId]=sealedChecks[ev.itemId].slice(-20);}
   else if(ev.kind==='reference_weigh'){y=Math.abs(r.reading-r.known)/r.known>0.01?1:0;referenceChecks.push({known:r.known,reading:r.reading});referenceChecks.splice(0,Math.max(0,referenceChecks.length-20));}
   if(y!==null&&ev.resolves){const l=labels[ev.resolves]=labels[ev.resolves]||{n:0,brierSum:0,pairs:[]},p=Number(ev.posterior)||0;if(!Number.isFinite(l.brierSum))l.brierSum=(Number(l.brier)||0)*(l.n||0);l.n=(l.n||0)+1;l.brierSum+=Math.pow(p-y,2);l.pairs=[...(l.pairs||[]),[p,y]].slice(-(P.calibration.keep||300));}
   writes.push([sub('evidence').doc(ev.taskId),{labeled:true,label:y,labeledAt:at}]);
  }
  // Hiệu chỉnh xác suất từng giả thuyết theo nhãn của quán (Brier ngoài mẫu) — chỉ giả thuyết đạt mới in %.
  const calMaps=Object.fromEntries(Object.entries(labels).map(([h,l])=>[h,L.fitCalibration(l.pairs||[],P)]));
  const evidence={tareChecks,recipeAudits,sealedChecks,referenceChecks,calibration:calMaps,labelsCount:Object.fromEntries(Object.entries(labels).map(([h,l])=>[h,l.n])),brier:Object.fromEntries(Object.entries(labels).map(([h,l])=>[h,l.brierSum/Math.max(1,l.n)]))};
  // 2) Chấm quan sát mới theo thời gian, baseline học từ các quan sát đã chấm trước đó (mẫu bất thường không học).
  const scored=obs.filter(o=>o.scored),fresh=obs.filter(o=>!o.scored),cusum={...(prev.cusum||{})},created=[];
  let base=L.baseline(scored,P);
  const residuals={};for(const o of scored)if(o.verified&&o.used>0&&o.nWeigh>0&&!o.flagged){const b=L.predict(base,o.itemId,o.unit);(residuals[o.itemId]=residuals[o.itemId]||[]).push({groupKey:o.groupKey,rate:(o.loss-b.estimate*o.used)/o.used});}
  evidence.itemResiduals=residuals;
  // Khoảng mở tem + khoảng cân → cân (cả mẫu đã báo bất thường) — bằng chứng lặp lại / loại trừ cho giả thuyết nhận hàng sai dung tích.
  const openHistory={},pushOpen=(o,sc)=>{if(sc&&o.used>0&&(o.fromOpen?Number(o.cap)>0:o.nWeigh>=2))(openHistory[o.itemId]=openHistory[o.itemId]||[]).push({id:o.id,at:o.at,fromOpen:!!o.fromOpen,frac:o.fromOpen?sc.excess/o.cap:null,sdFrac:o.fromOpen?sc.sdLoss/o.cap:null,z:sc.z});};
  for(const o of scored)if(o.verified)pushOpen(o,L.score(o,base,P));
  evidence.openHistory=openHistory;
  for(const o of fresh){
   const upd={scored:true,scoredAt:at};
   if(o.verified&&o.used>0){
    const sc=L.score(o,base,P),acc=o.nWeigh>0?L.accumulate(cusum[o.itemId],sc,P):{S:cusum[o.itemId]||0,alarm:false};cusum[o.itemId]=acc.S;
    Object.assign(upd,{score:{z:sc.z,excess:sc.excess,expected:sc.expected,threshold:sc.threshold,state:sc.state},flagged:sc.abnormal||acc.alarm,accumulated:acc.alarm});
    pushOpen(o,sc);
    if(upd.flagged&&!(o.ctx&&o.ctx.fifoDebt)){
     const hy=L.hypotheses(o,base,evidence,P);Object.assign(upd,{explainedBy:hy.explainedBy,residualQty:hy.residual.qty,ranking:hy.ranking.slice(0,3)});
     const test=hy.next&&hy.next.test,common={obsId:o.id,resolves:hy.next&&hy.next.resolves,posterior:hy.next?hy.posterior[hy.next.resolves]:null,reason:'Chẩn đoán: '+(hy.ranking[0]?.why||'')};
     if(test==='tare_check'&&o.vesselIds?.[0])created.push(createTask('tare_check',o.itemId,o.id,{...common,vesselId:o.vesselIds[0],reason:'Kiểm bì dụng cụ — giả thuyết sai bì'}));
     else if(test==='density_proof')created.push(createTask('density_proof',o.itemId,o.id,{...common,reason:'Đo lại tỷ trọng — giả thuyết sai tỷ trọng'}));
     else if(test==='recipe_portion_weigh')created.push(createTask('recipe_portion_weigh',o.itemId,o.id,{...common,reason:'Cân một phần theo định mức — giả thuyết định mức sai'}));
     else if(test==='scan_open_units')created.push(createTask('scan_open_units',o.itemId,o.id,{...common,reason:'Rà mã đang mở / chưa khai — giả thuyết tiêu hao không khai'}));
     else if(test==='weigh_sealed_unit')created.push(createTask('weigh_sealed_unit',o.itemId,o.id,{...common,reason:'Cân một tem nguyên chưa mở — giả thuyết nhận hàng sai dung tích'}));
     else if(test==='reference_weigh')created.push(createTask('reference_weigh','_scale',day,{...common,reason:'Cân vật mẫu biết trước khối lượng — giả thuyết cân lệch hệ số'}));
     else if(test==='resync_recount')created.push(createTask('weigh_open_units',o.itemId,'resync~'+o.id,{...common,sampling:'resync',reason:'Đếm/cân lại để đồng bộ sổ — giả thuyết lỗi đồng bộ'}));
     // «Tái diễn» chỉ tính bất thường xảy ra SAU lúc món được nâng mức (không đếm hai lần chính sự kiện đã gây nâng mức).
     const ctl=controls[o.itemId]||{level:0,manualFloor:0},raisedAt=ctl.lastEscalationAt||ctl.updatedAt||'',adv=(ctl.level||0)>=2&&!(o.at>raisedAt)?{to:ctl.level}:L.controlAdvice(ctl,[o],base,{},P);
     if(adv.to>(ctl.level||0)&&(cfg.mode==='active')){
      const next=E.control(ctl,adv.to>=3&&ctl.level>=1?'MEASUREMENT_CONFLICT':'PHYSICAL_LOSS');
      writes.push([sub('controls').doc(o.itemId),{...next,storeId:store,itemId:o.itemId,revision:(ctl.revision||0)+1,reasonObsIds:[...(ctl.reasonObsIds||[]),o.id].slice(-20),lastEscalationAt:at,updatedAt:at}]);controls[o.itemId]={...ctl,...next};
      if(next.level>=3)created.push(createTask('weigh_open_units',o.itemId,'m3~'+o.id,{sampling:'m3',blind:true,excludeStaffId:o.measuredBy||null,obsId:o.id,reason:'Cân xác nhận độc lập (người khác, không xem số trước)'}));
     }
    }
   }
   writes.push([sub('obs').doc(o.id),upd]);Object.assign(o,upd);
  }
  // 3) Hạ mức theo tiêu chí đã hiệu chuẩn (chỉ khi bật tự hạ; không dưới sàn; mỗi lần một bậc).
  const allScored=obs.filter(o=>o.scored);base=L.baseline(allScored,P);
  const recentFrom=new Date(now()-14*86400000).toISOString(),released=[];
  if(cfg.mode==='active'&&cfg.autoRelease!==false&&/^calibrated/.test(String(P.origin||'')))for(const [itemId,ctl] of Object.entries(controls)){
   if(!(ctl.level>=1))continue;const recent=allScored.filter(o=>o.itemId===itemId&&o.at>=recentFrom);
   const pend=await sub('tasks').where('itemId','==',itemId).where('pending','==',true).limit(1).get();
   const days=ctl.lastReleaseAt?(now()-E.ms(ctl.lastReleaseAt))/86400000:99,cap=Math.max(1,...recent.map(o=>o.used||0));
   const adv=L.controlAdvice(ctl,recent,base,{typicalUnit:cap/2,daysSinceLastRelease:days,pending:pend.docs.length,ackComplete:true},P);
   if(adv.action!=='release')continue;
   const clean=recent.filter(o=>!o.flagged&&['random_m0','control','m3'].includes(o.sampling));
   const next=E.control(ctl,'CLEAN_WINDOW_PASSED',{releaseEnabled:true,validPoints:clean.length,activeDays:new Set(clean.map(o=>o.day)).size,usedEnough:true,pending:pend.docs.length,ackComplete:true,daysSinceLastRelease:days,criteria:P.release});
   if(next.level<ctl.level){writes.push([sub('controls').doc(itemId),{...next,revision:(ctl.revision||0)+1,lastReleaseAt:at,lastReleaseReason:adv.reason,updatedAt:at}]);released.push(itemId);}
  }
  // 4) Cân ngẫu nhiên M0 theo ngân sách (mẫu không thiên lệch cho baseline — lộ trình điều chỉnh 2).
  const budget=Number(cfg.randomM0PerDay??P.sampling?.perDay??2),lastM0={...(prev.lastM0||{})},act={};
  for(const o of allScored)if(o.at>=recentFrom&&o.used>0)act[o.itemId]=(act[o.itemId]||0)+o.used;
  const cand=Object.keys(act).filter(id=>!(controls[id]?.level>=1)&&(!lastM0[id]||lastM0[id]<new Date(now()-2*86400000).toISOString().slice(0,10))).sort((a,b)=>act[b]*(1+(lastM0[b]?0:1))-act[a]*(1+(lastM0[a]?0:1))).slice(0,Math.max(0,budget));
  if(cfg.mode==='active')for(const id of cand){created.push(createTask('weigh_open_units',id,'m0~'+day,{sampling:'random_m0',reason:'Cân ngẫu nhiên — dữ liệu mức thường (không phải vì có nghi vấn)'}));lastM0[id]=day;}
  // 5) Hiệu chuẩn có rào hằng tuần (live ±5%), quay lui, kiểm toán mô hình.
  const versions=vSn.docs.map(data);let calib=null,rollback=null;const lastCal=prev.lastCalibratedDay||'';
  if(!lastCal||(Date.parse(day)-Date.parse(lastCal))/86400000>=7){
   const c=L.calibrate(P,allScored,{mode:'live',minValidation:30,stamp:day,evidence:()=>evidence});
   calib={promoted:c.promoted,reason:c.reason,changes:c.record?.changes||[]};
   if(c.promoted){const rec={...c.record,createdAt:at,params:c.params};writes.push([sub('model_versions').doc(c.params.version),rec],[paramsRef,{params:c.params,version:c.params.version,parent:P.version,updatedAt:at}]);versions.push(rec);}
   const lastRec=versions.at(-1);if(lastRec&&lastRec.metricsAfter){const live=L.evaluate(allScored.filter(o=>o.at>=(lastRec.createdAt||'')),P);const rb=L.shouldRollback(lastRec,live);if(rb.rollback){const parent=versions.find(v=>v.version===rb.to);if(parent?.params){writes.push([paramsRef,{params:parent.params,version:parent.version,rolledBackFrom:lastRec.version,updatedAt:at}]);rollback=rb;}}}
  }
  const issues=L.auditModels(versions,P),evalM=L.evaluate(allScored,P);
  const items=Object.fromEntries(Object.values(base.items).map(b=>[b.itemId,{n:b.n,informative:b.informative,days:b.days,estimate:b.estimate,low:b.low,high:b.high,state:b.state,capped:b.capped,level:controls[b.itemId]?.level||0}]));
  const model={day,storeId:store,updatedAt:at,params:{version:P.version,origin:P.origin||null},items,groups:base.groups,excluded:base.excluded,outliers:L.outlierItems(base),drift:L.drift(allScored,L.baseline(allScored.slice(0,Math.floor(allScored.length/2)),P),P),
   labels:Object.fromEntries(Object.entries(labels).map(([h,l])=>{const c=calMaps[h];return [h,{n:l.n,brierSum:l.brierSum,brier:l.brierSum/Math.max(1,l.n),pairs:l.pairs||[],calBrier:c.brier,a:c.a,b:c.b,calibrated:l.n>=P.calibration.minLabels&&c.calibrated}];})),
   coverage90:evalM.coverage90,obs:{total:obs.length,scored:allScored.length,flagged:allScored.filter(o=>o.flagged).length,fifoDebt:allScored.filter(o=>o.ctx?.fifoDebt).length,minutesKnown:allScored.filter(o=>o.minutes!=null).length},
   cusum,lastM0,tareChecks,recipeAudits,sealedChecks,referenceChecks,released,calibration:calib,rollback,modelIssues:issues,lastCalibratedDay:calib?day:lastCal,autoRelease:cfg.autoRelease!==false&&/^calibrated/.test(String(P.origin||''))};
  for(const [ref,val] of writes)await ref.set(val,{merge:true});
  await modelRef.set(model);
  const tasks=(await Promise.all(created)).filter(Boolean);
  return {day,scored:fresh.length,flagged:fresh.filter(o=>o.flagged).length,tasks,released,calibration:calib,rollback,issues};
 }
 async function exception(taskId,staff,reason){
  if(!staff?.id||!String(reason||'').trim())throw Error('Cần người ghi nhận và tình trạng thực tế');
  const ref=sub('tasks').doc(taskId);return fs.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||['done','cancelled','superseded'].includes(s.data().status))return;
   const at=iso();t.set(ref,{status:E.transition('task',s.data().status,'HANDOVER_EXIT_WITH_EXCEPTION'),exception:{reason:String(reason).slice(0,500),byEmployeeId:staff.id,at},updatedAt:at,revision:(s.data().revision||0)+1},{merge:true});});
 }
 async function bootstrap(guard){
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||''))return;
  const job=await guard.ref.get(),cursor=job.data().cursor;
  let q=coll('stock_transactions').where('type','==','WASTE').where('businessDate','>=',cfg.fromDate).orderBy('businessDate').orderBy(opts.documentId||'__name__').limit(50);
  if(cursor)q=q.startAfter(cursor.day,cursor.id);
  const s=await q.get();for(const d of s.docs)if(/^finish_.+_WASTE$/.test(d.id))await enqueue('finish',d.id);
  if(s.docs.length===50){const last=s.docs.at(-1);await fs.runTransaction(async t=>{await fence(t,guard);t.set(guard.ref,{cursor:{day:last.data().businessDate,id:last.id}},{merge:true});});await enqueue('bootstrap',job.data().sourceId,true);}
  else await fs.runTransaction(async t=>{await fence(t,guard);const cs=await t.get(base);if(cs.exists&&cs.data().settingsRevision===cfg.settingsRevision)t.set(base,{bootstrapFinishedAt:iso()},{merge:true});});
 }
 async function discoverShift(id,guard){
  const shift=await coll('employee_shifts').doc(id).get();if(!shift.exists||!E.isBarista(shift.data()))return;
  const sh=shift.data(),job=await guard.ref.get(),cursor=job.data().cursor;
  let q=sub('cases').where('interval.to','>',sh.checkedInAt).where('interval.from','<',sh.checkedOutAt||iso()).orderBy('interval.to').orderBy('interval.from').orderBy(opts.documentId||'__name__').limit(50);if(cursor)q=q.startAfter(cursor.to,cursor.from,cursor.id);
  const s=await q.get();for(const row of s.docs)await enqueue(row.data().originKind||'finish',row.data().originId||row.data().sourceId);
  if(s.docs.length===50){const last=s.docs.at(-1);await fs.runTransaction(async t=>{await fence(t,guard);t.set(guard.ref,{cursor:{to:last.data().interval.to,from:last.data().interval.from,id:last.id}},{merge:true});});await enqueue('discover_shift',id,true);}
 }
 async function dependencies(kind,id,guard){
  const job=await guard.ref.get(),parent=sub(kind==='reprice'?'item_links':'shift_links').doc(id).collection('cases');let q=parent.orderBy(opts.documentId||'__name__').limit(50);if(job.data().cursor)q=q.startAfter(job.data().cursor);
  const s=await q.get();for(const row of s.docs)await enqueue(row.data().kind||'finish',row.data().sourceId);
  if(s.docs.length===50){await fs.runTransaction(async t=>{await fence(t,guard);t.set(guard.ref,{cursor:s.docs.at(-1).id},{merge:true});});await enqueue(kind,id,true);}
 }
 async function drain(id){
  const ref=sub('requests').doc(id),token=String(now())+'_'+Math.random().toString(36).slice(2);
  const job=await fs.runTransaction(async t=>{const [s,c]=await Promise.all([t.get(ref),t.get(base)]);if(!s.exists)return null;const j=s.data();if(j.kind!=='measurement'&&(!c.exists||!c.data().enabled))return null;if(!j.dirty||j.leaseUntil>now()||j.nextTryAt>now())return null;t.set(ref,{leaseUntil:now()+120000,leaseToken:token},{merge:true});return j;});
  if(!job)return false;
  try{
   const guard={ref,token,revision:job.revision};if(job.kind==='finish')await finish(job.sourceId,guard);else if(job.kind==='measurement')await measure(job.sourceId,guard);else if(job.kind==='bootstrap')await bootstrap(guard);else if(['reprice','recompute_shift'].includes(job.kind))await dependencies(job.kind,job.sourceId,guard);else if(job.kind==='discover_shift')await discoverShift(job.sourceId,guard);else if(job.kind==='opened')await opened(job.sourceId,guard);else await handover(job.sourceId,guard);
   return await fs.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||s.data().leaseToken!==token)return false;t.set(ref,{dirty:s.data().revision!==job.revision,leaseUntil:0,leaseToken:'',nextTryAt:now(),lastError:'',completedAt:iso()},{merge:true});return true;});
   }catch(e){await fs.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||s.data().leaseToken!==token)return;if(s.data().revision!==job.revision){t.set(ref,{leaseUntil:0,leaseToken:'',nextTryAt:now()},{merge:true});return;}t.set(ref,{leaseUntil:0,leaseToken:'',lastError:String(e.message||e),nextTryAt:now()+60000,attempt:(s.data().attempt||0)+1},{merge:true});});throw e;}
 }
 async function retryDue(){const s=await sub('requests').where('dirty','==',true).where('nextTryAt','<=',now()).orderBy('nextTryAt').limit(30).get();for(const d of s.docs)try{await drain(d.id);}catch(e){if(opts.log)opts.log(e);}return s.docs.length;}
 return {storeId:store,base,sub,coll,config,enqueue,finish,handover,opened,ensureCloseTasks,registerVessel,requestMeasurement,measure,createTask,submitEvidence,learnDay,exception,drain,retryDue,observation,startPoint};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Store=api;
})(typeof window!=='undefined'?window:globalThis);
