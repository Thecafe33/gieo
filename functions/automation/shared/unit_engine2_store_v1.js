/* Fixed-store persistence and recovery for Unit Engine 2. No UI dependencies. */
(function(root){
'use strict';
const E=typeof module==='object'&&module.exports?require('./unit_engine2_v1.js'):root.UnitEngine2;
function create(opts){
 const store=E.storeId(opts.storeId),fs=opts.fstore,now=opts.now||Date.now;
 const coll=opts.collection||(kind=>fs.collection(E.collection(kind,store)));
 const base=coll('duty_digests').doc('_engine2'),sub=n=>base.collection(n),iso=()=>new Date(now()).toISOString();
 const error=m=>{const e=new Error(m);e.code='ENGINE2_RETRY';return e;};
 const data=s=>s.exists?{...s.data(),id:s.id}:null;
 const active=c=>c.enabled===true&&c.mode==='active'&&c.protocolVersion===1&&c.fleetConfirmed===true;
 function checkpointOf(c,point,to){
  const old=c.lastShiftWeigh,legacy=old&&old.op!==point?.operationId&&E.finite(old.weighed)&&old.op&&Number.isFinite(E.ms(old.at))?{id:'legacy_'+old.op,status:'valid',containerId:c.id,countedAt:old.at,quality:'legacy_recorded',sourcePath:coll('stock_containers').doc(c.id).path,sourceOp:old.op}:null;
  return [point,legacy].filter(p=>p&&E.ms(p.countedAt)>E.ms(c.openedAt)&&E.ms(p.countedAt)<E.ms(to)).sort((a,b)=>E.ms(b.countedAt)-E.ms(a.countedAt))[0]||null;
 }
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
  const result=E.decision(input);
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
   const mode=active.mode==='active'&&active.protocolVersion===1&&active.fleetConfirmed===true?'active':'shadow';
   if(old?.fingerprint===fingerprint&&old.mode===mode)return false;
   const revision=(old?.revision||0)+1,at=iso(),decisionId=caseRef.id+'_'+revision;
   const d={...result,originKind:'finish',originId:id,containerId:c.id,itemName:c.itemName||item.name||source.itemId,storeId:store,itemId:source.itemId,id:caseRef.id,revision,decisionId,mode,fingerprint,updatedAt:at,createdAt:old?.createdAt||at};
   t.set(caseRef,d);t.set(sub('decisions').doc(decisionId),{...d,previousDecisionId:old?.decisionId||null});
   if(d.mode==='active'&&d.status!=='voided'){
    const oldCtl=ctlSn.exists?ctlSn.data():{level:0,manualFloor:0};
    const control=E.control(oldCtl,'PHYSICAL_LOSS');
    t.set(controlRef,{...control,storeId:store,itemId:source.itemId,itemName:d.itemName,unit:d.unit,revision:(oldCtl.revision||0)+1,requirements:d.control.requirements,updatedAt:at,reasonCaseIds:[...new Set([...(oldCtl.reasonCaseIds||[]),caseRef.id])].slice(-20)});
    if(!taskSn.exists)t.set(taskRef,{id:taskRef.id,storeId:store,itemId:source.itemId,itemName:d.itemName,caseId:caseRef.id,kind:'weigh_open_units',status:'queued',pending:true,assignment:'current_barista_group',createdAt:at,updatedAt:at,controlRevision:(oldCtl.revision||0)+1,revision:1});
    const ids=[...new Set([...(active.controlledItemIds||[]),source.itemId])];if(ids.length>500)throw error('Giới hạn danh sách control; chưa ghi hồ sơ vượt phạm vi');
    t.set(base,{controlledItemIds:ids,revision:(active.revision||0)+1,lastDecisionAt:at},{merge:true});
   }
   if(d.status==='voided'&&taskSn.exists&&!['done','cancelled'].includes(taskSn.data().status))t.set(taskRef,{status:'cancelled',pending:false,reason:'Nguồn hao hụt không còn hiệu lực',updatedAt:at},{merge:true});
   for(const sid of result.shiftIds||[])t.set(sub('shift_links').doc(sid).collection('cases').doc(caseRef.id),{sourceId:id});
   t.set(sub('item_links').doc(source.itemId).collection('cases').doc(caseRef.id),{kind:'finish',sourceId:id});
   t.set(sub('audits').doc(decisionId),{decisionId,storeId:store,at,issues:faults,quantity:d.quantity||0,sourceId:id,policyVersion:E.POLICY});return d;
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
    if(ts.exists&&!['done','cancelled','superseded','in_progress'].includes(ts.data().status))t.set(taskRef,{status:'queued',pending:true,lastError:message,updatedAt:at},{merge:true});
    if(cfg.exists)t.set(base,{revision:(cfg.data().revision||0)+1,lastRejectedAt:at},{merge:true});return ref.id;}
   if(!cfg.exists||!active(cfg.data()))return rejected('Engine2 đã dừng nhận phép cân mới; chưa thay đổi kho');
   if(!ts.exists||ts.data().itemId!==line.itemId)return rejected('Nhiệm vụ đã thay đổi — tải lại danh sách');
   if(['done','cancelled','superseded'].includes(ts.data().status))return rejected('Việc cân đã kết thúc; không áp thêm lần nữa');
   if(lock.exists&&lock.data().measurementId!==ref.id)return rejected('Món này có lượt cân đang xử lý; chờ kết quả để tránh cân trùng');
   if(containers.some(s=>!s.exists||s.data().itemId!==line.itemId||s.data().status!=='open'))return rejected('Mã đang mở đã đổi trạng thái — tải lại danh sách');
   if(new Set(line.units.map(u=>u.id)).size!==line.units.length)throw Error('Một mã chỉ được xuất hiện một lần trong lượt cân');
   const frozen={...line,units:line.units.map((u,i)=>({...u,checkpointSnapshot:checkpointOf(data(containers[i]),points[i].exists?points[i].data():null,u.countedAt)}))};
   const at=iso();t.set(ref,{id:ref.id,taskId,operationId,storeId:store,itemId:line.itemId,line:frozen,staff,status:'queued',acceptedProtocol:1,createdAt:at,updatedAt:at});
   t.set(sub('operations').doc(operationId),{measurementId:ref.id,storeId:store});
   t.set(lockRef,{measurementId:ref.id,createdAt:at});
   t.set(taskRef,{status:'in_progress',measurementId:ref.id,byEmployeeId:staff.id,updatedAt:at},{merge:true});return ref.id;
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
   await fs.runTransaction(async t=>{await fence(t,guard);const [s,l,c]=await Promise.all([t.get(ref),t.get(sub('measurement_locks').doc(m.itemId)),t.get(base)]);if(!s.exists||s.data().status==='done')return;t.set(ref,{status:'rejected',lastError:message,updatedAt:iso()},{merge:true});t.set(sub('tasks').doc(m.taskId),{status:'queued',pending:true,lastError:message,updatedAt:iso()},{merge:true});if(l.exists&&l.data().measurementId===id)t.delete(sub('measurement_locks').doc(m.itemId));if(c.exists)t.set(base,{revision:(c.data().revision||0)+1,lastRejectedAt:iso()},{merge:true});});
   return {rejected:true};
  }
  if(!line.units.length){
   if(alreadyComplete)return;
   const [rt,open]=await Promise.all([inventory.units.ref(m.itemId).once('value'),coll('stock_containers').where('itemId','==',m.itemId).where('status','==','open').limit(1).get()]);
   const live=Object.entries(rt.val()||{}).filter(([k,v])=>k!=='__prepLock'&&v&&!v.finishedDebt&&!v.discardPending);
   if(live.length||open.docs.length)return reject('Có mã đang mở — tải lại danh sách và cân đúng mã');
   const older=await sub('tasks').where('itemId','==',m.itemId).where('pending','==',true).limit(100).get();
   await fs.runTransaction(async t=>{await fence(t,guard);const [l,c]=await Promise.all([t.get(sub('measurement_locks').doc(m.itemId)),t.get(base)]);if(c.exists)t.set(base,{revision:(c.data().revision||0)+1,lastInspectionAt:iso()},{merge:true});t.set(ref,{status:'done',result:{kind:'no_open_units',verified:true},completedAt:iso()},{merge:true});for(const task of older.docs)if(E.ms(task.data().createdAt)<=now())t.set(task.ref,{status:'done',pending:false,resultRef:ref.path,updatedAt:iso()},{merge:true});t.set(sub('tasks').doc(m.taskId),{status:'done',pending:false,resultRef:ref.path,updatedAt:iso()},{merge:true});if(l.exists&&l.data().measurementId===id)t.delete(sub('measurement_locks').doc(m.itemId));});return;
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
   if(!alreadyComplete&&ts.exists)t.set(sub('tasks').doc(m.taskId),{status:'done',pending:false,resultRef:ref.path,updatedAt:at},{merge:true});
   const cut=Math.min(...line.units.map(u=>E.ms(u.countedAt)));
   for(const w of waiting.docs)if(!alreadyComplete&&E.ms(w.data().createdAt)<=cut)t.set(w.ref,{status:'done',pending:false,resultRef:ref.path,updatedAt:at},{merge:true});
   for(const [i,d] of decisions.entries()){
    const caseId=E.key('weigh',id,d.containerId),old=oldCases[i].exists?oldCases[i].data():null,fingerprint=E.stable(d);if(old?.decisionMode==='manual'&&d.status!=='voided'||old?.fingerprint===fingerprint||!old&&d.status==='voided')continue;
    const revision=(old?.revision||0)+1,decisionId=caseId+'_'+revision;t.set(sub('cases').doc(caseId),{...d,originKind:'measurement',originId:id,id:caseId,decisionId,mode:'active',fingerprint,revision,createdAt:old?.createdAt||at,updatedAt:at});t.set(sub('decisions').doc(decisionId),{...d,decisionId,mode:'active',createdAt:at});t.set(sub('audits').doc(decisionId),{issues:[],decisionId,storeId:store,at,sourceId:d.sourceId});
    for(const sid of d.shiftIds||[])t.set(sub('shift_links').doc(sid).collection('cases').doc(caseId),{kind:'measurement',sourceId:id});
    t.set(sub('item_links').doc(d.itemId).collection('cases').doc(caseId),{kind:'measurement',sourceId:id});
   }
   for(const [i,u] of line.units.entries()){
    if(alreadyComplete)break;
    const cp={id:E.key(id,u.id),storeId:store,itemId:m.itemId,containerId:u.id,status:'valid',countedAt:u.countedAt,byEmployeeId:m.staff.id,book:u.baseline,counted:u.weighed,weighings:u.weighings,unitSnapshot:item.unit,densitySnapshot:['ml','l'].includes(String(item.unit).toLowerCase())?Number(item.densityGPerMl):null,measurementId:id,operationId:out.opId,createdAt:at};
    t.set(sub('checkpoints').doc(cp.id),cp);if(!previousPoints[i].exists||E.ms(previousPoints[i].data().countedAt)<=E.ms(cp.countedAt))t.set(sub('unit_checkpoints').doc(u.id),cp);
   }
   if(!alreadyComplete){t.delete(sub('measurement_locks').doc(m.itemId));t.set(base,{lastMeasurementAt:at,revision:(cs.exists?cs.data().revision||0:0)+1},{merge:true});}
  });
 }
 async function exception(taskId,staff,reason){
  if(!staff?.id||!String(reason||'').trim())throw Error('Cần người ghi nhận và tình trạng thực tế');
  const ref=sub('tasks').doc(taskId);return fs.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||['done','cancelled','superseded'].includes(s.data().status))return;
   const at=iso();t.set(ref,{status:'exception_recorded',exception:{reason:String(reason).slice(0,500),byEmployeeId:staff.id,at},updatedAt:at,revision:(s.data().revision||0)+1},{merge:true});});
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
 return {storeId:store,base,sub,config,enqueue,finish,handover,opened,ensureCloseTasks,registerVessel,requestMeasurement,measure,exception,drain,retryDue};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Store=api;
})(typeof window!=='undefined'?window:globalThis);
