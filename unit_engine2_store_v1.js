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
   used,loss:E.round(end.book-end.measured),book:end.book,measured:end.measured,nWeigh:(start.weighed?1:0)+(end.weighed?1:0),fromOpen:start.id==='open',cap:start.id==='open'?start.measured:null,receiveRefId:c.receiveRefId||null,verified:used>0,scored:false,...extra,createdAt:iso()};
 }
 const DIAG=['tare_check','density_proof','recipe_portion_weigh','scan_open_units','spec_confirm','reference_weigh','mixup_reweigh','mixup_group_weigh'];
 const MIX=['mixup_reweigh','mixup_group_weigh'];
 async function fence(t,guard){if(!guard)return;const s=await t.get(guard.ref);if(!s.exists||s.data().leaseToken!==guard.token||s.data().revision!==guard.revision)throw error('Lease hoặc phiên bản công việc đã thay đổi');}
 async function config(){const s=await base.get();return s.exists?s.data():{};}
 // Công bố danh sách món đang kiểm soát (root `controlledItemIds`) + tăng revision — POS đọc danh sách này cho mã mới mở / bàn giao /
 // cuối ngày và ACK theo revision. Một transaction; idempotent (chạy lại không đổi gì nếu đã đủ). Lượt học luôn đối chiếu để tự lành.
 async function publishControls(ids){
  const want=[...new Set(ids||[])];if(!want.length)return false;
  return fs.runTransaction(async t=>{
   const sn=await t.get(base),cur=sn.exists?sn.data():{},list=cur.controlledItemIds||[],add=want.filter(id=>!list.includes(id));
   if(!add.length)return false;
   const all=[...list,...add];if(all.length>500)throw error('Giới hạn danh sách control; chưa công bố vượt phạm vi');
   t.set(base,{controlledItemIds:all,revision:(cur.revision||0)+1,lastDecisionAt:iso()},{merge:true});return true;
  });
 }
 async function enqueue(kind,id,resumeCursor=false){
  if(!['finish','measurement','handover','bootstrap','reprice','recompute_shift','discover_shift','opened','prep_review','mixup_day','alert_review','sub_review'].includes(kind))throw Error('Engine2: loại việc không hợp lệ');
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
  // Luật sai quy cách (chủ quán 23/10): mã cùng loại cùng phiếu nhận — đọc khi báo hết còn dư đáng kể (≥ SPEC.minFrac), 1 truy vấn có giới hạn.
  const leftover=-Number(source.qty)||0,needLot=c.receiveRefId&&source.type==='WASTE'&&!source.voided&&Number(c.baseQty)>0;
  // Tổng hụt suốt đời = dư lúc báo hết + hụt đã ghi ở các lượt cân Engine 2 của chính mã (hồ sơ measurement còn hiệu lực).
  const measuredShort=async cid=>(await sub('cases').where('containerId','==',cid).limit(100).get()).docs.map(data).filter(k=>k.originKind==='measurement'&&k.status!=='voided').reduce((a,k)=>a+(Number(k.quantity)||0),0);
  const ownShort=needLot?leftover+await measuredShort(c.id):leftover;
  const lotNeeded=needLot&&ownShort/Number(c.baseQty)>=E.SPEC.minFrac,siblings=lotNeeded?await Promise.all((await coll('stock_containers').where('receiveRefId','==',c.receiveRefId).limit(51).get()).docs.map(data).filter(x=>x.itemId===c.itemId&&x.id!==c.id).map(async x=>({id:x.id,itemId:x.itemId,receiveRefId:x.receiveRefId,status:x.status,baseQty:x.baseQty,wasteBase:x.wasteBase,shortfall:x.status==='finished'?(Number(x.wasteBase)||0)+await measuredShort(x.id):null}))):[];
  const input={store,sourceId:id,source,container:c,shifts:shiftRows,checkpoint:cp,valuation,siblings};
  // Phiếu nhận THẬT (receiving_records) + kết quả đối chiếu nhãn bao (nếu đã làm) — chỉ đọc khi cần xét.
  let receipt,rejected=false;if(lotNeeded){const [rs,es]=await Promise.all([coll('receiving_records').doc(c.receiveRefId).get(),sub('evidence').doc(E.key('spec_confirm',c.receiveRefId,c.itemId)).get()]);receipt=rs.exists;
   const r=es.exists?es.data().result||{}:null;rejected=!!(r&&Number(r.recordedQty)>0&&Math.abs(Number(r.labelQty)-Number(r.recordedQty))/Number(r.recordedQty)<=0.02);}
  const specCheck=needLot?E.specCheck(c,ownShort,siblings,now(),lotNeeded?{receipt,rejected}:{}):null;
  const result=E.specOutcome(E.decision(input),specCheck),groupKey=(result.allocations||[]).map(a=>a.employeeId).sort().join('+');
  if(['assigned_by_manager','manual'].includes(source.responsibility?.status)&&result.status!=='voided')Object.assign(result,{decisionMode:'manual',basis:'manual_source',manualSource:source.responsibility,allocations:[],pending:{qty:result.quantity,value:result.amount},explanation:'Giữ nguyên quyết định tay trong chứng từ nguồn. Engine 2 không phân bổ lại hoặc tạo khoản thu thứ hai.'});
  const faults=E.audit(result);if(faults.length)throw error('Tự kiểm toán: '+faults.join(', '));
  const fingerprint=E.stable(specCheck&&specCheck.action!=='decide'||specCheck?.reason==='wait_timeout'?{input,spec:specCheck.action+':'+specCheck.reason}:input),controlRef=sub('controls').doc(source.itemId),taskRef=sub('tasks').doc(E.key('baseline',id));
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
   let flow;try{flow=E.caseFlow(old?.status,result.status==='voided'?'voided':result.status==='checking'?'checking':'decided');}catch(e){return false;}if(flow.hold)return false;
   const mode=active.mode==='active'&&active.protocolVersion===1&&active.fleetConfirmed===true?'active':'shadow';
   if(old?.fingerprint===fingerprint&&old.mode===mode)return false;
   const revision=(old?.revision||0)+1,at=iso(),decisionId=caseRef.id+'_'+revision;
   const d={...result,status:flow.status,statusEvents:flow.events,originKind:'finish',originId:id,containerId:c.id,itemName:c.itemName||item.name||source.itemId,storeId:store,itemId:source.itemId,id:caseRef.id,revision,decisionId,mode,fingerprint,updatedAt:at,createdAt:old?.createdAt||at};
   t.set(caseRef,d);t.set(sub('decisions').doc(decisionId),{...d,previousDecisionId:old?.decisionId||null});
   if(d.mode==='active'&&d.status!=='voided'&&!['spec_mismatch','waiting_sibling'].includes(d.basis)){
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
   if(d.status==='voided')Object.assign(ob,{verified:false,reason:'Nguồn hao hụt đã huỷ'});t.set(sub('obs').doc(ob.id),ob);
   // Nghi sai quy cách → việc đối chiếu nhãn bao với phiếu nhận (không cân) cho pha chế đang ca.
   if(d.basis==='spec_mismatch'&&d.mode==='active')t.set(sub('tasks').doc(E.key('spec_confirm',c.receiveRefId,c.itemId)),{id:E.key('spec_confirm',c.receiveRefId,c.itemId),storeId:store,itemId:c.itemId,itemName:d.itemName,kind:'spec_confirm',status:'queued',pending:true,assignment:'current_barista_group',receiveRefId:c.receiveRefId,recordedQty:Number(c.baseQty),resolves:'spec',caseId:caseRef.id,reason:'Đối chiếu quy cách in trên bao với phiếu nhận — nghi nhập sai quy cách',createdAt:at,updatedAt:at,revision:1},{merge:true});
   return d;
  }).then(async d=>{
   // Mã này vừa báo hết → hồ sơ khác của CÙNG phiếu nhận đang chờ thì tính lại ngay (không đợi lượt ngày).
   if(c.receiveRefId&&!(specCheck&&specCheck.action==='wait')){const lot=E.lotKey(c),w=await sub('cases').where('waitLot','==',lot).limit(20).get().catch(()=>null);for(const x of (w?w.docs:[])){const o=x.data();if(o.status==='checking'&&o.originId&&o.originId!==id)await finish(o.originId).catch(()=>{});}}
   return d;
  });
 }
 // Lệch NL khi nấu mẻ BTP (dòng sổ needsReview do POS bật) — chủ quán 23/10: tự xử lý MỌI mức, chỉ từ ngày áp dụng
 // (cfg.fromDate) trở đi; tồn trước ngày áp dụng giữ nguyên. Lệch > 25% vẫn tự duyệt nhưng ghi rõ người chịu trách nhiệm +
 // mốc thời gian (báo cáo tháng) và tạo THÔNG BÁO ĐỂ BIẾT (fyi) — quản lý không phải thao tác. Chế độ thử: chỉ ghi hồ sơ.
 async function prepReview(id,guard){
  const sourceRef=coll('stock_transactions').doc(id),tx=data(await sourceRef.get());
  if(!tx||!E.PREP_ROW.test(id)||tx.needsReview!==true||tx.voided===true)return false;
  if(['assigned_by_manager','manual'].includes(tx.responsibility?.status))return false;
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||'')||!(String(tx.businessDate||'')>=cfg.fromDate))return false;
  const item=data(await coll('inventory_items').doc(tx.itemId).get());if(!item)throw error('Chưa đọc được nguyên liệu của dòng lệch');
  const v=E.prepVariance(tx,item.unit);if(!v)return false;const cls=E.prepReviewClass(v);
  const batch=cls.fyi&&v.batchId?data(await coll('prep_batches').doc(v.batchId).get()):null;
  const caseRef=sub('prep_reviews').doc(E.key(id)),fingerprint=E.stable({tx,unit:item.unit||''});
  const trackRef=cls.track?sub('prep_track').doc(E.key(v.responsible.employeeId||'_none',v.itemId,v.direction)):null;
  const alertRef=cls.fyi?coll('alerts').doc(E.key('e2_prep_var',v.key)):null;
  const pct=Number.isFinite(v.ratio)?Math.round(v.ratio*1000)/10:null,itemName=item.name||v.itemId,prepName=batch?.prepName||'';
  const what=v.basis==='book'?'sổ tồn lệch so với cân thực tế':v.direction==='over'?'dùng nhiều hơn định lượng':'dùng ít hơn định lượng';
  const plan=await fs.runTransaction(async t=>{
   await fence(t,guard);
   const [cs,ss,oldSn,tr,al]=await Promise.all([t.get(base),t.get(sourceRef),t.get(caseRef),trackRef?t.get(trackRef):null,alertRef?t.get(alertRef):null]);
   if(E.stable(data(ss))!==E.stable(tx))throw error('Dòng sổ vừa đổi; tính lại');
   const c=cs.exists?cs.data():{};if(!c.enabled)return null;
   if(E.stable([c.enabled,c.mode,c.fromDate,c.settingsRevision])!==E.stable([cfg.enabled,cfg.mode,cfg.fromDate,cfg.settingsRevision]))throw error('Thiết lập vừa đổi — tính lại theo phiên bản mới');
   const mode=active(c)?'active':'shadow',old=oldSn.exists?oldSn.data():null;
   if(old&&old.fingerprint===fingerprint&&old.mode===mode&&(mode==='shadow'||old.applied))return null;
   const at=old?.mode===mode&&old.at?old.at:iso();
   const d={id:caseRef.id,storeId:store,txId:id,policy:'prep_review_v1',mode,fingerprint,band:cls.band,label:cls.label,severity:cls.severity||null,fyi:cls.fyi,
    kind:v.kind,basis:v.basis,direction:v.direction,deviation:v.deviation,base:v.base,ratioPct:pct,unit:v.unit,itemId:v.itemId,itemName,batchId:v.batchId,prepName,
    responsible:v.responsible,businessDate:v.businessDate,applied:false,at,updatedAt:iso(),revision:(old?.revision||0)+1};
   let repeat=null;
   if(mode==='active'&&trackRef){
    const old2=tr.exists?tr.data():{},tk=E.prepTrack(old2.entries,v,cls,at);
    const due=tk.repeated&&(!old2.lastAlertAt||E.ms(at)-E.ms(old2.lastAlertAt)>E.PREP_REVIEW.repeatDays*E.DAY);
    t.set(trackRef,{storeId:store,employeeId:v.responsible.employeeId||'',employeeName:v.responsible.employeeName||'',itemId:v.itemId,itemName,direction:v.direction,entries:tk.entries,...(due?{lastAlertAt:at}:{}),updatedAt:iso()},{merge:true});
    if(due){repeat=coll('alerts').doc(E.key('e2_prep_repeat',trackRef.id,at.slice(0,10)));
     t.set(repeat,{type:'prep_variance_repeat',fyi:true,source:'engine2',severity:'warning',status:'new',businessDate:v.businessDate,createdAt:at,itemId:v.itemId,
      employeeId:v.responsible.employeeId||'',employeeName:v.responsible.employeeName||'',direction:v.direction,count:tk.entries.length,txIds:tk.entries.map(e=>e.txId),
      title:(v.responsible.employeeName||'Chưa rõ người')+' lệch '+itemName+' '+tk.entries.length+' mẻ trong '+E.PREP_REVIEW.repeatDays+' ngày ('+(v.direction==='over'?'cùng chiều thiếu / dùng nhiều':'cùng chiều thừa / dùng ít')+')',
      note:'Thông báo để biết — hệ thống đã tự duyệt từng mẻ và ghi vào báo cáo tháng. Lặp lại cùng chiều nên quản lý trao đổi với nhân viên hoặc xem lại định lượng; không cần thao tác trên hệ thống.'});}
   }
   if(mode==='active'&&alertRef&&!al.exists)t.set(alertRef,{type:'prep_variance_large',fyi:true,source:'engine2',severity:cls.severity,status:'new',businessDate:v.businessDate,createdAt:at,
    itemId:v.itemId,batchId:v.batchId,txId:id,ratioPct:pct,deviation:v.deviation,base:v.base,unit:v.unit,direction:v.direction,band:cls.band,responsible:v.responsible,
    title:itemName+' '+what+' '+(pct===null?Math.abs(v.deviation)+' '+v.unit+' (không có định lượng)':pct+'%')+(prepName?' · mẻ '+prepName:''),
    note:cls.label+'. Hệ thống đã tự ghi nhận vào báo cáo tháng (mốc '+new Date(E.ms(at)+7*3600000).toISOString().slice(0,16).replace('T',' ')+' giờ VN) — người chịu trách nhiệm: '+(v.responsible.employeeName||'chưa rõ')+' ('+v.responsible.role+'). Thông báo để biết; quản lý yêu cầu nhân viên giải trình riêng, không cần thao tác trên hệ thống.'});
   d.fyiAlertId=alertRef?alertRef.id:null;d.repeatAlertId=repeat?repeat.id:null;
   t.set(caseRef,d);return d;
  });
  if(!plan||plan.mode!=='active')return plan;
  const inventory=opts.getInventory?await opts.getInventory(tx.itemId):opts.inventory;if(!inventory?.ledger?.autoReview)throw error('Chưa có inventory adapter (ledger.autoReview)');
  const autoReview={by:'engine2',policy:plan.policy,band:plan.band,label:plan.label,ratioPct:plan.ratioPct,deviation:plan.deviation,base:plan.base,unit:plan.unit,basis:plan.basis,direction:plan.direction,
   responsible:plan.responsible,at:plan.at,caseId:plan.id,fyiAlertId:plan.fyiAlertId};
  const ok=await inventory.ledger.autoReview(id,{needsReview:false,reviewedAt:plan.at,reviewedBy:'engine2_auto',autoReview});
  await caseRef.set({applied:true,appliedResult:ok?'reviewed':'skipped_source_changed',appliedAt:iso()},{merge:true});
  return {...plan,applied:true,appliedResult:ok?'reviewed':'skipped_source_changed'};
 }
 // Quét dòng còn chờ duyệt từ ngày áp dụng (lượt ngày + khởi động) — bù trigger bị lỡ. 1 truy vấn một trường, có giới hạn.
 async function sweepPrepReview(){
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||''))return 0;
  const s=await coll('stock_transactions').where('needsReview','==',true).limit(200).get();let n=0;
  for(const d of s.docs)if(E.PREP_ROW.test(d.id)&&String(d.data().businessDate||'')>=cfg.fromDate&&d.data().voided!==true){await enqueue('prep_review',d.id);n++;}
  return n;
 }
 // ── Pha nhầm trong NHÓM DỄ NHẦM (chủ quán 23/10, docs/KE_HOACH_PHA_NHAM_NHOM.md P3–P4) ──
 // Chạy theo NGÀY sau khi đếm BTP / cân NL cuối ngày tạo vụ lệch (duty_cases). Chỉ ghép trong nhóm chủ quán khai báo
 // (nhomDeNham). Kết quả là SỰ CỐ CHẤT LƯỢNG (mixups), không phải hao hụt: phần ghép khớp rút khỏi phân bổ (duty.markMixup);
 // trách nhiệm ghi cho ca / nhóm pha chế trong ngày — KHÔNG xác định được bill. Không thêm thao tác lúc bán: chỉ việc cân lại
 // lúc mở ca kế tiếp (loại «nhập nhầm ô») và cân nhóm lúc bàn giao cho đúng nhân viên có ca trong ngày sự cố.
 const dayAdd=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*E.DAY).toISOString().slice(0,10);
 const vnDay=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
 async function dutyEngine(itemHint){if(opts.getEngine)return opts.getEngine();if(opts.inventory)return opts.inventory;if(opts.getInventory)return opts.getInventory(itemHint);throw error('Chưa có inventory adapter');}
 function salesOf(rows,from,to){
  const by={},prod=[];
  for(const t of rows){const ty=String(t.type||'').toUpperCase(),q=Number(t.qty)||0,at=E.ms(t.createdAt);
   if(ty==='PRODUCTION'&&q>0){prod.push(q);continue;}
   if(t.prepRecon||t.substitutionFor||/^prep_/.test(String(t.id||'')))continue;   // NL dùng nấu mẻ / dùng bù — không phải bán
   const sale=ty==='CONSUMPTION',rev=ty==='ADJUSTMENT'&&t.reversal===true;if(!sale&&!rev)continue;
   if(from&&Number.isFinite(at)&&(at<=E.ms(from)||at>E.ms(to)))continue;
   const k=t.referenceId||t.id,o=(by[k]=by[k]||{refId:k,qty:0,at:null});o.qty+=-q;if(sale&&t.createdAt)o.at=t.createdAt;}
  const events=Object.values(by).filter(e=>e.qty>0.0001);
  return {events,sold:E.round(events.reduce((a,e)=>a+e.qty,0)),portion:E.mixPortion(events),production:prod};
 }
 async function fyiOnce(t,ref,doc){const sn=await t.get(ref);return ()=>{if(!sn.exists)t.set(ref,{fyi:true,source:'engine2',status:'new',createdAt:iso(),...doc});};}
 async function mixupDay(day,guard){
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||'')||day<cfg.fromDate)return null;
  const [ps,is]=await Promise.all([coll('prep_items').where('nhomDeNham','>','').limit(300).get(),coll('inventory_items').where('nhomDeNham','>','').limit(300).get()]);
  const cat=new Map();
  for(const d of ps.docs){const x=d.data();if(x.active!==false&&E.groupKey(x.nhomDeNham))cat.set(d.id,{id:d.id,kind:'prep',name:x.name||d.id,unit:x.unit||'',group:String(x.nhomDeNham).trim()});}
  for(const d of is.docs){const x=d.data();if(x.active!==false&&E.groupKey(x.nhomDeNham))cat.set(d.id,{id:d.id,kind:'item',name:x.name||d.id,unit:x.unit||'',group:String(x.nhomDeNham).trim()});}
  const size={};for(const m of cat.values())size[E.groupKey(m.group)]=(size[E.groupKey(m.group)]||0)+1;
  for(const [id,m] of cat)if(size[E.groupKey(m.group)]<2)cat.delete(id);
  if(!cat.size)return {day,pairs:0,reason:'no_groups'};
  const cs=await coll('duty_cases').where('businessDate','==',day).limit(501).get();if(cs.docs.length>500)throw error('Quá nhiều vụ lệch trong ngày; chưa xét pha nhầm');
  const varOf=new Map();
  for(const d of cs.docs){const c=d.data();if(!cat.has(c.prepId)||c.status==='voided')continue;const o=varOf.get(c.prepId)||{variance:0,cases:[],from:null,to:null};
   // Phần đã xác nhận DÙNG THAY hợp lệ (BTP âm, pool kind substitution) không phải lệch — trừ ra trước khi ghép pha nhầm.
   const subQ=(c.pool||[]).filter(x=>x.kind==='substitution').reduce((a,x)=>a+(Number(x.qty)||0),0);
   o.variance=E.round(o.variance+(Number(c.variance)||0)-subQ);o.cases.push({id:d.id,variance:Number(c.variance)||0});
   if(c.interval?.from&&(!o.from||E.ms(c.interval.from)<E.ms(o.from)))o.from=c.interval.from;if(c.interval?.to&&(!o.to||E.ms(c.interval.to)>E.ms(o.to)))o.to=c.interval.to;varOf.set(c.prepId,o);}
  const hot=new Set();
  for(const g of new Set([...cat.values()].map(m=>E.groupKey(m.group)))){const ms=[...cat.values()].filter(m=>E.groupKey(m.group)===g),v=ms.map(m=>varOf.get(m.id)?.variance||0);
   if(v.some(x=>x>=E.MIXUP.minQty)&&v.some(x=>-x>=E.MIXUP.minQty))ms.forEach(m=>hot.add(m.id));}
  const members=[],salesById={};
  for(const id of hot){const m=cat.get(id),o=varOf.get(id)||{variance:0,cases:[]};
   const q=m.kind==='prep'?coll('prep_transactions').where('prepId','==',id):coll('stock_transactions').where('itemId','==',id);
   const rows=(await q.where('businessDate','==',day).limit(1001).get()).docs.map(data);if(rows.length>1000)throw error('Quá nhiều dòng sổ trong ngày; chưa xét pha nhầm');
   const sl=salesOf(rows,o.from,o.to);salesById[id]=sl;
   // Độ nhiễu đếm của chính món: |lệch| các ngày trước (≤ 30 ngày) — lệch phải bất thường so với nhiễu mới xét ghép.
   const past=(await coll('duty_cases').where('prepId','==',id).limit(120).get()).docs.map(x=>x.data()).filter(c=>c.businessDate&&c.businessDate<day&&c.businessDate>=dayAdd(day,-E.MIXUP.noiseDays)&&c.status!=='voided');
   const byDay={};for(const c of past)byDay[c.businessDate]=(byDay[c.businessDate]||0)+(Number(c.variance)||0);
   members.push({...m,variance:o.variance,sold:sl.sold,portion:sl.portion,noise:E.mixNoise(Object.values(byDay)),production:m.kind==='prep'?sl.production:[],cases:o.cases});}
  const prev=(await sub('mixups').where('day','==',dayAdd(day,-1)).limit(50).get()).docs.map(data).filter(x=>x.outcome==='entry_error');
  const r=E.mixMatch(members,{entryErrors:prev});
  const shifts=(await coll('employee_shifts').where('businessDate','==',day).limit(200).get()).docs.map(data).filter(E.isBarista);
  const staffRows=[...new Map(shifts.filter(x=>x.employeeId).map(x=>[x.employeeId,{id:x.employeeId,name:x.employeeName||x.employeeId}])).values()].sort((a,b)=>a.id.localeCompare(b.id));
  const found=[...r.pairs,...r.reversed],keep=new Set();
  const results=[];
  for(const p of found){
   const X=cat.get(p.surplusId),Y=cat.get(p.shortageId),id=E.key('mixup',day,p.surplusId,p.shortageId);keep.add(id);
   const candidates=(salesById[p.surplusId]?.events||[]).map(e=>({ref:e.refId,at:e.at||null})).sort((a,b)=>String(a.at).localeCompare(String(b.at))).slice(0,200);
   const doc={id,storeId:store,day,group:X.group,surplusId:X.id,surplusName:X.name,surplusKind:X.kind,shortageId:Y.id,shortageName:Y.name,shortageKind:Y.kind,unit:X.unit||Y.unit,
    k:p.k,qty:p.qty,surplus:p.surplus,shortage:p.shortage,err:p.err,noise:{surplus:members.find(m=>m.id===X.id)?.noise||0,shortage:members.find(m=>m.id===Y.id)?.noise||0},hypothesis:p.hypothesis,batchItemId:p.batchItemId||null,reverseOf:p.reverseOf||null,
    caseIds:{surplus:(members.find(m=>m.id===X.id)?.cases||[]).map(c=>c.id),shortage:(members.find(m=>m.id===Y.id)?.cases||[]).map(c=>c.id)},
    candidateBills:candidates,candidateCount:(salesById[p.surplusId]?.events||[]).length,staff:staffRows,
    responsibility:{basis:'shift_group',note:'Không xác định được bill / người — ghi cho ca / nhóm pha chế trong ngày'}};
   const fingerprint=E.stable(doc),ref=sub('mixups').doc(id),taskRef=sub('tasks').doc(E.key('mixup_reweigh',id));
   const res=await fs.runTransaction(async t=>{
    await fence(t,guard);const [c,old]=await Promise.all([t.get(base),t.get(ref)]);const cf=c.exists?c.data():{};if(!cf.enabled)return null;
    const mode=active(cf)?'active':'shadow',o=old.exists?old.data():null;
    if(o&&(o.fingerprint===fingerprint&&o.mode===mode||o.status==='closed'))return null;   // đã kết luận thì không mở lại
    const at=iso(),checking=p.hypothesis==='mixup';
    const d={...doc,fingerprint,mode,status:checking?'checking':'closed',outcome:checking?null:p.hypothesis,createdAt:o?.createdAt||at,updatedAt:at,revision:(o?.revision||0)+1,pooled:o?.pooled||false};
    if(checking&&mode==='active'){d.reweighTaskId=taskRef.id;
     t.set(taskRef,{id:taskRef.id,storeId:store,kind:'mixup_reweigh',itemId:X.id,itemName:X.name+' · '+Y.name,incidentId:id,status:'queued',pending:true,assignment:'opening',
      items:[{id:X.id,kind:X.kind,name:X.name,unit:X.unit,role:'surplus'},{id:Y.id,kind:Y.kind,name:Y.name,unit:Y.unit,role:'shortage'}],
      reason:'Cân lại 2 món lúc mở ca, TRƯỚC khi bán — hệ thống kiểm tra cuối ngày '+day+' có nhập nhầm ô hay không',businessDate:dayAdd(day,1),createdAt:at,updatedAt:at,revision:1},{merge:true});
     t.set(base,{revision:(cf.revision||0)+1,lastTaskAt:at},{merge:true});}
    if(!checking&&mode==='active'&&p.hypothesis==='batch_mislabel'){const add=await fyiOnce(t,coll('alerts').doc(E.key('e2_mixup',id)),{type:'mixup_batch_mislabel',severity:'warning',businessDate:day,
     title:'Nghi ghi nhầm loại mẻ: '+X.name+' dư '+p.surplus+' – '+Y.name+' thiếu '+p.shortage+' '+(X.unit||''),note:'Lượng lệch ≈ cỡ một mẻ nấu trong ngày. Không phải hao hụt, không ảnh hưởng khách. Thông báo để biết.'});add();}
    t.set(ref,d);return d;
   });
   if(res)results.push(res);
  }
  // Lượt trước của cùng ngày (khi chưa đủ dữ liệu đếm) ghép khác → bỏ hồ sơ cũ còn đang chờ.
  const olds=(await sub('mixups').where('day','==',day).limit(50).get()).docs;
  for(const o of olds)if(!keep.has(o.id)&&o.data().status==='checking')await fs.runTransaction(async t=>{const sn=await t.get(o.ref);if(!sn.exists||sn.data().status!=='checking')return;
   const tr=sub('tasks').doc(E.key('mixup_reweigh',o.id)),ts=await t.get(tr);t.set(o.ref,{status:'superseded',updatedAt:iso()},{merge:true});
   if(ts.exists&&!['done','cancelled','superseded'].includes(ts.data().status))t.set(tr,{status:E.transition('task',ts.data().status,'NEW_REVISION'),pending:false,updatedAt:iso()},{merge:true});});
  for(const a of r.ambiguous){const id=E.key('mixup',day,'ambiguous',E.groupKey(a.group));
   await sub('mixups').doc(id).set({id,storeId:store,day,group:a.group,status:'closed',outcome:'ambiguous',options:a.options,staff:staffRows,updatedAt:iso()},{merge:true});}
  // Phần đã ghép không chia hao hụt cá nhân (chỉ chế độ chạy thật).
  const all=(await sub('mixups').where('day','==',day).limit(50).get()).docs.map(data).filter(x=>x.mode==='active'&&!x.pooled&&['checking','closed'].includes(x.status)&&x.surplusId);
  for(const x of all){const eng=await dutyEngine(x.surplusKind==='item'?x.surplusId:x.shortageKind==='item'?x.shortageId:x.surplusId);
   for(const cid of [...(x.caseIds?.surplus||[]),...(x.caseIds?.shortage||[])])await eng.duty.markMixup(cid,{qty:x.qty,mixupId:x.id,reason:x.hypothesis==='batch_mislabel'?'ghi_nham_loai_me':x.hypothesis==='entry_error_reverse'?'nhap_nham_o_tu_dung_lai':'nghi_pha_nham'});
   await sub('mixups').doc(x.id).set({pooled:true,pooledAt:iso()},{merge:true});}
  return {day,pairs:results.length,ambiguous:r.ambiguous.length};
 }
 async function mixupWatchUpsert(t,inc,at){
  const ref=sub('mixup_watch').doc(E.key(E.groupKey(inc.group))),sn=await t.get(ref),o=sn.exists?sn.data():{};
  const items=[];const seen=new Set();for(const x of [...(o.items||[]),{id:inc.surplusId,kind:inc.surplusKind,name:inc.surplusName,unit:inc.unit},{id:inc.shortageId,kind:inc.shortageKind,name:inc.shortageName,unit:inc.unit}])if(!seen.has(x.id)){seen.add(x.id);items.push(x);}
  const emp=new Map((o.active?o.staff||[]:[]).map(s=>[s.id,s]));for(const s of inc.staff||[])emp.set(s.id,s);
  return ()=>t.set(ref,{id:ref.id,storeId:store,group:inc.group,items,staff:[...emp.values()],employeeIds:[...emp.keys()],active:true,from:inc.day,until:dayAdd(inc.day,E.MIXUP.watchDays),
   clean:0,needed:E.MIXUP.watchCleanNeeded,incidentIds:[...new Set([...(o.active?o.incidentIds||[]:[]),inc.id])].slice(-20),updatedAt:at});
 }
 async function mixupEvidence(taskId){
  const task=data(await sub('tasks').doc(taskId).get()),ev=data(await sub('evidence').doc(taskId).get());if(!task||!ev)return null;const r=ev.result||{};
  if(task.kind==='mixup_reweigh'){const ref=sub('mixups').doc(task.incidentId);
   return fs.runTransaction(async t=>{const sn=await t.get(ref);if(!sn.exists||sn.data().status!=='checking')return null;const inc=sn.data();
    const out=E.mixReweigh(inc,{surplusCounted:r.counts[inc.surplusId],surplusBook:r.books[inc.surplusId],shortageCounted:r.counts[inc.shortageId],shortageBook:r.books[inc.shortageId]});
    const at=iso(),wrong=out.outcome!=='entry_error';
    const add=await fyiOnce(t,coll('alerts').doc(E.key('e2_mixup',inc.id)),wrong?{type:'mixup_suspected',severity:out.outcome==='suspected_wrong_drink'?'danger':'warning',businessDate:inc.day,
      title:(out.outcome==='suspected_wrong_drink'?'Nghi pha sai món: ':'Nghi pha sai món hoặc nhập nhầm ô: ')+'~'+inc.k+' ly '+inc.surplusName+' có thể đã pha bằng '+inc.shortageName+' ngày '+inc.day,
      note:'Không xác định được bill: '+inc.candidateCount+' bill có '+inc.surplusName+' trong ngày. Ca / nhóm pha chế: '+(inc.staff||[]).map(s=>s.name).join(', ')+'. Phần lệch '+inc.qty+' '+(inc.unit||'')+' không tính hao hụt. Những ngày tới, nhân viên có ca hôm đó sẽ cân nhóm «'+inc.group+'» lúc bàn giao. Thông báo để biết.',
      incidentId:inc.id,group:inc.group}
     :{type:'mixup_entry_error',severity:'warning',businessDate:inc.day,title:'Nhập nhầm ô khi đếm cuối ngày '+inc.day+': '+inc.surplusName+' ↔ '+inc.shortageName,
      note:'Cân lại lúc mở ca cho thấy số của hai món bị ghi lẫn. Khách không bị ảnh hưởng; sổ tự đúng lại ở lần đếm tối nay. Thông báo để biết (lỗi nhập liệu).',incidentId:inc.id});
    const watch=wrong?await mixupWatchUpsert(t,inc,at):null;
    t.set(ref,{status:'closed',outcome:out.outcome,reweigh:{...out,evidenceTaskId:taskId,byEmployeeId:ev.byEmployeeId,at:ev.at},closedAt:at,updatedAt:at},{merge:true});
    if(inc.mode==='active'){add();if(watch)watch();}
    return out;});
  }
  if(task.kind==='mixup_group_weigh'){const ref=sub('mixup_watch').doc(task.watchId);
   return fs.runTransaction(async t=>{const sn=await t.get(ref);if(!sn.exists||!sn.data().active)return null;const w=sn.data(),at=iso();
    const d=(task.items||[]).map(x=>({id:x.id,name:x.name,delta:E.round(Number(r.counts[x.id])-Number(r.books[x.id]))}));
    const S=d.filter(x=>x.delta>=E.MIXUP.minQty),T=d.filter(x=>-x.delta>=E.MIXUP.minQty);
    const hit=S.flatMap(a=>T.map(b=>({a,b}))).find(({a,b})=>Math.abs(a.delta+b.delta)<=E.mixTol(Math.max(a.delta,-b.delta)));
    const log=[...(w.log||[]),{taskId,shiftId:task.shiftId||null,employeeId:ev.byEmployeeId,at:ev.at,deltas:d,repeat:!!hit}].slice(-30);
    if(hit){const add=await fyiOnce(t,coll('alerts').doc(E.key('e2_mixup_repeat',w.id,task.shiftId||taskId)),{type:'mixup_repeat',severity:'danger',businessDate:vnDay(now()),group:w.group,employeeId:ev.byEmployeeId,
      title:'Lặp lại nghi pha nhầm nhóm «'+w.group+'»: '+hit.a.name+' dư '+hit.a.delta+' – '+hit.b.name+' thiếu '+(-hit.b.delta)+' lúc bàn giao ca',
      note:'Cân bàn giao của nhân viên có ca trong ngày sự cố trước. Thông báo để biết; quản lý trao đổi riêng.'});add();
     t.set(ref,{log,clean:0,until:dayAdd(vnDay(now()),E.MIXUP.watchDays),repeats:(w.repeats||0)+1,updatedAt:at},{merge:true});}
    else{const clean=(w.clean||0)+1;t.set(ref,{log,clean,active:clean<(w.needed||E.MIXUP.watchCleanNeeded),updatedAt:at,...(clean>=(w.needed||E.MIXUP.watchCleanNeeded)?{closedAt:at,closedReason:'clean'}:{})},{merge:true});}
    return {repeat:!!hit};});
  }
  return null;
 }
 // Nhân viên có ca trong ngày sự cố check-in (ngày sau) → việc cân nhóm lúc bàn giao, giao ĐÍCH DANH người đó; nhân viên khác không.
 async function mixupHandover(shiftId,shift,guard){
  if(!shift?.employeeId||!shift.checkedInAt||shift.checkedOutAt)return;
  const day=shift.businessDate||vnDay(E.ms(shift.checkedInAt));
  const ws=await sub('mixup_watch').where('employeeIds','array-contains',shift.employeeId).limit(20).get();
  for(const w of ws.docs){const wd=w.data();if(!wd.active||day<=wd.from||day>wd.until)continue;
   const ref=sub('tasks').doc(E.key('mixup_group_weigh',w.id,shiftId));
   await fs.runTransaction(async t=>{await fence(t,guard);const [c,old]=await Promise.all([t.get(base),t.get(ref)]);if(!c.exists||!active(c.data())||old.exists)return;const at=iso();
    t.set(ref,{id:ref.id,storeId:store,kind:'mixup_group_weigh',itemId:(wd.items[0]||{}).id||'',itemName:'Nhóm «'+wd.group+'»',items:wd.items,watchId:w.id,shiftId,
     assigneeIds:[shift.employeeId],assigneeName:shift.employeeName||'',assignment:'assigned_employee',status:'queued',pending:true,businessDate:day,
     reason:'Cân các món nhóm dễ nhầm lúc bàn giao ca (ngoài giờ bán) — chỉ nhân viên có ca trong ngày xảy ra sự cố',createdAt:at,updatedAt:at,revision:1});
    t.set(base,{revision:(c.data().revision||0)+1,lastTaskAt:at},{merge:true});});
  }
 }
 // Lượt ngày: chưa cân lại sau 36 giờ → kết luận ở mức «nghi» (không phân biệt được với nhập nhầm ô), báo để biết; hết hạn theo dõi → đóng.
 async function mixupSweep(){
  const cfg=await config();if(!cfg.enabled)return 0;let n=0;
  for(const d of (await sub('mixups').where('status','==','checking').limit(50).get()).docs){const inc=d.data();if(now()-E.ms(inc.createdAt)<36*3600000)continue;
   await fs.runTransaction(async t=>{const sn=await t.get(d.ref);if(!sn.exists||sn.data().status!=='checking')return;const at=iso();
    const add=await fyiOnce(t,coll('alerts').doc(E.key('e2_mixup',inc.id)),{type:'mixup_suspected',severity:'warning',businessDate:inc.day,incidentId:inc.id,group:inc.group,
     title:'Nghi pha sai món hoặc nhập nhầm ô: ~'+inc.k+' ly '+inc.surplusName+' / '+inc.shortageName+' ngày '+inc.day+' (chưa cân lại lúc mở ca)',
     note:'Không cân lại nên không loại được nhập nhầm ô. '+inc.candidateCount+' bill có '+inc.surplusName+' trong ngày; không xác định được bill. Thông báo để biết.'});
    const watch=await mixupWatchUpsert(t,inc,at),tr=sub('tasks').doc(E.key('mixup_reweigh',inc.id)),ts=await t.get(tr);
    t.set(d.ref,{status:'closed',outcome:'reweigh_missed',closedAt:at,updatedAt:at},{merge:true});
    if(inc.mode==='active'){add();watch();}
    if(ts.exists&&!['done','cancelled','superseded'].includes(ts.data().status))t.set(tr,{status:'cancelled',pending:false,reason:'Quá hạn cân lại',updatedAt:at},{merge:true});});n++;}
  for(const d of (await sub('mixup_watch').where('active','==',true).limit(50).get()).docs)if(vnDay(now())>d.data().until)await d.ref.set({active:false,closedAt:iso(),closedReason:'expired'},{merge:true});
  return n;
 }
 // ── Thông báo lệch đếm cuối ngày (prep_count_variance / duty_case) — chủ quán 23/10: quản lý không phải xử lý thông báo
 // từ ngày áp dụng. Chờ vụ lệch Unit Engine chốt (không còn chờ cân lại / tranh chấp) rồi: ≤ 25% → đóng thông báo kèm căn cứ;
 // > 25% (và mọi «Lệch lớn») → giữ làm THÔNG BÁO ĐỂ BIẾT. Không đổi vụ lệch / phân bổ. Chế độ thử: chỉ ghi hồ sơ.
 // handover_variance (đếm giao ca NL, đã đếm lại 2 lần ở POS — không có vụ lệch): so với số chốt ca trước.
 // shift_weigh_large_deviation (cân cuối ca theo mã lệch nhiều): vụ lệch NL của lượt cân → luôn để biết như «Lệch lớn».
 const ALERT_TYPES=['prep_count_variance','duty_case','handover_variance','shift_weigh_large_deviation'],CASE_FINAL=['auto','closed_pool','no_checkpoint','manual'];
 async function alertReview(id,guard){
  const ref=coll('alerts').doc(id),a=data(await ref.get());
  if(!a||!ALERT_TYPES.includes(a.type)||a.status!=='new'||a.fyi===true||a.autoReview)return false;
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||'')||!(String(a.businessDate||'')>=cfg.fromDate))return false;
  let c=null;
  if(a.type==='handover_variance'){
   if(!E.finite(a.varianceQty))return false;
   c={id:null,status:'auto',variance:Number(a.varianceQty),usageTotal:0,book:Math.abs(Number(a.closeQty)||0),unit:a.unit,allocations:[],handover:true};
  }
  else if(a.type==='shift_weigh_large_deviation'&&a.itemId&&a.opId)c=data(await coll('duty_cases').doc(E.ueKey('nl',a.itemId,a.opId)).get());
  else if(a.type==='duty_case'&&a.caseId)c=data(await coll('duty_cases').doc(a.caseId).get());
  else if(a.prepId){c=data(await coll('duty_cases').doc(E.ueKey('prep',a.prepId,E.ms(a.createdAt))).get());
   if(!c){const q=(await coll('duty_cases').where('prepId','==',a.prepId).where('businessDate','==',a.businessDate).limit(5).get()).docs.map(data);c=q.sort((x,y)=>Math.abs(E.ms(x.createdAt)-E.ms(a.createdAt))-Math.abs(E.ms(y.createdAt)-E.ms(a.createdAt)))[0]||null;}}
  if(!c)return false;                                     // vụ lệch chưa ghi xong — trigger vụ lệch / lượt ngày sẽ gọi lại
  if(!CASE_FINAL.includes(c.status))return false;         // đang chờ cân lại / tranh chấp: đợi Unit Engine chốt
  const cls=E.countAlertClass(c.variance,c.usageTotal,c.book,c.unit||a.unit);
  const fyi=['duty_case','shift_weigh_large_deviation'].includes(a.type)||cls.fyi,pct=Number.isFinite(cls.ratio)?Math.round(cls.ratio*1000)/10:null;
  const who=(c.allocations||[]).filter(x=>Math.abs(Number(x.qty)||0)>0.005).map(x=>(x.employeeName||x.employeeId)+' '+E.round(Math.abs(Number(x.qty)))).join(', ');
  const mix=(c.mixupIds||[]).length?' Một phần đã ghép «nghi pha nhầm» trong nhóm dễ nhầm — xem sự cố trong Tổng kết tháng.':'';
  const label=a.type==='duty_case'||a.type==='shift_weigh_large_deviation'?'Lệch lớn — vụ lệch đã được Unit Engine chốt':cls.label;
  const reason=(c.variance<0?'Thiếu ':'Dư ')+Math.abs(E.round(c.variance))+' '+(c.unit||a.unit||'')+(pct!==null?' (~'+pct+(c.handover?'% số chốt ca trước':'% lượng dùng')+')':'')+'. '+
   (c.handover?(a.recountMatched?'Đã đếm lại 2 lần khớp nhau — lệch giữa ca trước và ca sau.':'Lần đếm lại khác lần đầu — lấy số đếm lại.')+(a.closeStaff||a.openStaff?' Ca trước: '+(a.closeStaff||'—')+' · ca sau: '+(a.openStaff||'—')+'.':'')
    :c.status==='manual'?'Giữ quyết định của quản lý.':who?'Unit Engine đã quy theo ca: '+who+'.':'Unit Engine ghi phần chưa quy cá nhân (không đủ căn cứ).')+mix;
  const rec={by:'engine2',policy:'count_alert_v1',band:cls.band,label,ratioPct:pct,caseId:c.id||null,caseStatus:c.status,reason};
  const auditRef=sub('alert_reviews').doc(E.key(id));
  return fs.runTransaction(async t=>{
   await fence(t,guard);const [cs,as]=await Promise.all([t.get(base),t.get(ref)]);const cf=cs.exists?cs.data():{};if(!cf.enabled)return false;
   const cur=as.exists?as.data():null;if(!cur||cur.status!=='new'||cur.fyi===true||cur.autoReview)return false;
   const mode=active(cf)?'active':'shadow',at=iso();
   t.set(auditRef,{id:auditRef.id,storeId:store,alertId:id,type:a.type,businessDate:a.businessDate,mode,fyi,...rec,at});
   if(mode==='active')t.set(ref,fyi?{fyi:true,source:'engine2',autoReview:{...rec,at},note:(cur.note?cur.note+' · ':'')+'Thông báo để biết — '+reason}
    :{status:'resolved',resolvedAt:at,resolvedBy:'engine2_auto',autoReview:{...rec,at}},{merge:true});
   return {mode,fyi,band:cls.band};
  });
 }
 // Vụ lệch vừa chốt (đổi trạng thái) → xếp lại các thông báo của chính vụ đó.
 async function alertsForCase(c){
  if(!c||!CASE_FINAL.includes(c.status))return 0;const ids=new Set();
  if(c.id)for(const d of (await coll('alerts').where('caseId','==',c.id).limit(10).get()).docs)ids.add(d.id);
  if(c.type==='nl'&&c.shiftWeighOp)ids.add(('shift_weigh_large_dev_'+c.shiftWeighOp).slice(0,180));
  if(c.prepId&&c.businessDate)for(const d of (await coll('alerts').where('prepId','==',c.prepId).where('businessDate','==',c.businessDate).limit(20).get()).docs)if(d.data().type==='prep_count_variance')ids.add(d.id);
  for(const id of ids)await enqueue('alert_review',id);return ids.size;
 }
 async function sweepAlerts(){
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||''))return 0;let n=0;
  for(const d of (await coll('alerts').where('status','==','new').limit(300).get()).docs){const a=d.data();if(ALERT_TYPES.includes(a.type)&&!a.fyi&&!a.autoReview&&String(a.businessDate||'')>=cfg.fromDate){await enqueue('alert_review',d.id);n++;}}
  return n;
 }
 // ── BTP âm: dùng loại thay thế (chủ quán 23/10) — thay bước quản lý bấm «Xác nhận bù» ở quanlygieo. Phiếu
 // prep_shortage_recons «chờ xác nhận bù» từ ngày áp dụng: loại thay thế thiếu cuối ngày khớp lượng cần bù ±10% (≤ 30) →
 // ghi y _btpAmApplySubstitution (qua Unit Engine) + phần bù không chia hao hụt (duty.markMixup kind substitution);
 // không khớp / «không dùng gì» → để hao hụt theo luật thường + THÔNG BÁO ĐỂ BIẾT. Chế độ thử: chỉ ghi hồ sơ.
 async function subReview(id,guard){
  const ref=coll('prep_shortage_recons').doc(id),r=data(await ref.get());
  if(!r||!['substitution_pending','unexplained'].includes(r.status)||r.autoReview)return false;
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||'')||!(String(r.businessDate||'')>=cfg.fromDate))return false;
  // Tổng đã phân bổ cho mọi phiếu cùng ngày theo từng loại thay (một loại thiếu 200 g chia cho nhiều phiếu). Một truy vấn khi duyệt, không theo bill.
  const allocated={};
  if(r.status!=='unexplained'&&(r.substitutions||[]).length)for(const d of (await coll('prep_shortage_recons').where('businessDate','==',r.businessDate).limit(100).get()).docs){
   const o=d.data();if(['dismissed'].includes(o.status))continue;
   for(const x of o.substitutions||[]){const k=(x.kind||'prep')+':'+(x.id||x.prepId);allocated[k]=E.round((allocated[k]||0)+(Number(x.expectedQty)||0));}
  }
  const chk=r.status==='unexplained'?{ok:false,reason:'staff_none',need:Number(r.remainder)||0,covered:0,tol:0}:E.subCheck(r,{allocated});
  const cs=await base.get(),cf=cs.exists?cs.data():{};const mode=active(cf)?'active':'shadow',at=iso();
  const alertRef=coll('alerts').doc('prep_shortage_'+id),auditRef=sub('sub_reviews').doc(E.key(id));
  const reason=chk.reason==='match'?'Loại dùng thay thiếu '+chk.covered+' — khớp lượng cần bù '+chk.need+' (±'+chk.tol+'). Hệ thống tự xác nhận bù.'
   :chk.reason==='staff_none'?'Nhân viên trả lời không dùng gì / không rõ — '+chk.need+' '+(r.unit||'')+' tính hao hụt theo luật thường.'
   :'Loại dùng thay thiếu '+chk.covered+', cần bù '+chk.need+' (lệch '+chk.diff+', quá ±'+chk.tol+') — không xác nhận bù, tính hao hụt theo luật thường.';
  const rec={by:'engine2',policy:'sub_review_v1',ok:chk.ok,reason,check:chk,at,mode};
  if(mode!=='active'){await auditRef.set({id:auditRef.id,storeId:store,reconId:id,businessDate:r.businessDate,...rec});return {mode,ok:chk.ok};}
  if(chk.ok){
   const eng=await dutyEngine(r.sourceKind==='item'?r.prepId:null);
   for(const x of (r.substitutions||[]).filter(x=>(x.kind||'prep')==='prep')){
    const id2=x.id||x.prepId,rows=(await coll('prep_transactions').where('prepId','==',id2).where('businessDate','==',r.businessDate).limit(200).get()).docs;
    const hit=rows.find(d=>d.data().type==='ADJUSTMENT'&&d.data().fromPrepCount&&Number(d.data().qty)<0);
    if(hit&&hit.data().substitutionReconId!==id)await eng.ledger.annotate(hit.id,{substitutionQty:E.round(Math.min(Math.abs(Number(hit.data().qty)),(Number(hit.data().substitutionQty)||0)+(Number(x.expectedQty)||0))),substitutionReconId:id,substitutionFor:r.prepId},{kind:'prep'});
    for(const c of (await coll('duty_cases').where('prepId','==',id2).where('businessDate','==',r.businessDate).limit(10).get()).docs)
     if(Number(c.data().variance)<0)await eng.duty.markMixup(c.id,{qty:Number(x.expectedQty)||0,mixupId:'sub_'+id,kind:'substitution',reason:'dung_thay_the'});
   }
   if(r.sourceKind==='item'){let ids=r.anomalyIds||[];
    if(!ids.length)ids=(await coll('stock_anomalies').where('itemId','==',r.prepId).where('businessDate','==',r.businessDate).limit(50).get()).docs.filter(d=>d.data().status==='open'&&Number(d.data().qty)<0).map(d=>d.id);
    for(const a of ids)await eng.anomaly.resolve(a,{status:'explained_substitution',reconId:id}).catch(()=>{});}
  }
  return fs.runTransaction(async t=>{
   await fence(t,guard);const [ss,as]=await Promise.all([t.get(ref),t.get(alertRef)]);const cur=ss.exists?ss.data():null;
   if(!cur||cur.status!==r.status||cur.autoReview)return false;
   t.set(auditRef,{id:auditRef.id,storeId:store,reconId:id,businessDate:r.businessDate,...rec});
   if(chk.ok){
    const cogsDelta=E.subCogsDelta(r);
    t.set(ref,{status:'substitution_confirmed',cogsDelta,confirmedAt:at,confirmedBy:'engine2_auto',autoReview:rec},{merge:true});
    // Giá vốn của NGÀY ĐÃ QUA đổi → đánh dấu để lãi/lỗ (quanlygieo / manage) tính lại — worker ghi thẳng, không qua lớp bọc data_access.
    // Cùng định dạng GieoData.danhDau: pl_dirty_gieogieo/{quán} { m:{'từ_đến':lúc}, at }; ngày hôm nay không cần dấu.
    const day=String(r.businessDate||''),today=new Date(now()+7*3600000).toISOString().slice(0,10);
    if(cogsDelta&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&day<today)t.set(fs.collection('pl_dirty_gieogieo').doc(store),{m:{[day+'_'+day]:at},at},{merge:true});
   }
   else t.set(ref,{status:'unexplained',autoReview:rec},{merge:true});
   if(as.exists&&as.data().status==='new')t.set(alertRef,chk.ok?{status:'resolved',resolvedAt:at,resolvedBy:'engine2_auto',autoReview:{...rec,label:'Dùng thay hợp lệ'}}
    :{fyi:true,source:'engine2',autoReview:{...rec,label:'Không xác nhận bù'},note:'Thông báo để biết — '+reason},{merge:true});
   return {mode,ok:chk.ok};
  });
 }
 async function sweepSubReviews(){
  const cfg=await config();if(!cfg.enabled||!/^\d{4}-\d{2}-\d{2}$/.test(cfg.fromDate||''))return 0;let n=0;
  for(const st of ['substitution_pending','unexplained'])for(const d of (await coll('prep_shortage_recons').where('status','==',st).limit(50).get()).docs)
   if(!d.data().autoReview&&String(d.data().businessDate||'')>=cfg.fromDate){await enqueue('sub_review',d.id);n++;}
  return n;
 }
 async function handover(id,guard){
  const c=await config();if(!active(c))return;
  await enqueue('recompute_shift',id);await enqueue('discover_shift',id);
  const s=await coll('employee_shifts').doc(id).get();if(!s.exists||!E.isBarista(s.data()))return;
  const at=iso(),shift=s.data();
  await mixupHandover(id,shift,guard);
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
  // Phép cân ĐÃ áp dụng vào kho (receipt `inventoryResult` của adapter) nhưng Engine2 chưa kịp ghi `done` (mất ACK / lỗi giữa chừng):
  // KHÔNG kiểm lại bì / tỷ trọng hiện tại (đã đổi sau lúc cân thì từ chối một thao tác đã ghi kho như chưa ghi) — đi thẳng tới phục hồi.
  const opSn=alreadyComplete?null:await sub('operations').doc(m.operationId).get(),applied=alreadyComplete||!!(opSn&&opSn.exists&&opSn.data().inventoryResult);
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
   await fs.runTransaction(async t=>{await fence(t,guard);const [l,c,own]=await Promise.all([t.get(sub('measurement_locks').doc(m.itemId)),t.get(base),t.get(sub('tasks').doc(m.taskId))]);   // mọi lượt ĐỌC trước mọi lượt GHI (Firestore thật từ chối ngược lại)
   if(c.exists)t.set(base,{revision:(c.data().revision||0)+1,lastInspectionAt:iso()},{merge:true});t.set(ref,{status:'done',result:{kind:'no_open_units',verified:true},completedAt:iso()},{merge:true});settle(t,older.docs,ref.path,now());if(own.exists)t.set(own.ref,{...finalOwn(own.data().status),pending:false,resultRef:ref.path,updatedAt:iso()},{merge:true});if(l.exists&&l.data().measurementId===id)t.delete(sub('measurement_locks').doc(m.itemId));});return;
  }
  if(!(Number(item.densityGPerMl)>0)&&line.densityProof){const p=line.densityProof;if(!E.finite(p.netG)||!E.finite(p.volumeMl)||Number(p.netG)<=0||Number(p.volumeMl)<=0)return reject('Số đo tỷ trọng không hợp lệ');item.densityGPerMl=Number(p.netG)/Number(p.volumeMl);}
  if(!applied&&['ml','l'].includes(String(item.unit).toLowerCase())){if(!E.finite(line.densitySnapshot)||!(Number(line.densitySnapshot)>0))return reject('Thiếu bản chụp tỷ trọng lúc cân — cân lại để giữ đủ căn cứ');if(Math.abs(Number(item.densityGPerMl)-Number(line.densitySnapshot))>1e-9)return reject('Tỷ trọng vừa thay đổi — kiểm tra lại số cân');}
  if(!applied)try{
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
  if(!staff?.id)throw Error('Cần người thực hiện');const ref=sub('tasks').doc(taskId);let lot=null,mixTask=null;
  return fs.runTransaction(async t=>{
   const ts=await t.get(ref);if(!ts.exists)throw Error('Không có việc này');const task=ts.data();if(task.kind==='spec_confirm')lot=task.itemId+'|'+task.receiveRefId;if(MIX.includes(task.kind))mixTask=taskId;if(!DIAG.includes(task.kind))throw Error('Việc này không phải việc chẩn đoán');
   if(['done','cancelled','superseded'].includes(task.status))return false;
   const r={...result};
   if(task.kind==='tare_check'){if(!r.vesselId||!r.variantId||!E.finite(r.measuredTareG)||Number(r.measuredTareG)<0)throw Error('Cân bì dụng cụ rỗng và chọn đúng dụng cụ');const v=await t.get(coll('prep_vessels').doc(r.vesselId));const vr=v.exists?(v.data().variants||[]).find(x=>x.id===r.variantId):null;if(!vr)throw Error('Dụng cụ đã thay đổi');r.recordedTareG=Number(vr.tareG);r.measuredTareG=Number(r.measuredTareG);}
   else if(task.kind==='recipe_portion_weigh'){if(!(Number(r.bookG)>0)||!(Number(r.measuredG)>0))throw Error('Nhập định lượng theo công thức và số cân thực của một phần');r.bookG=Number(r.bookG);r.measuredG=Number(r.measuredG);}
   else if(task.kind==='density_proof'){if(!(Number(r.netG)>0)||!(Number(r.volumeMl)>0))throw Error('Nhập khối lượng ròng và thể tích mẫu');r.density=Number(r.netG)/Number(r.volumeMl);}
   else if(task.kind==='scan_open_units'){if(!Array.isArray(r.present)||!Array.isArray(r.unregistered))throw Error('Đánh dấu mã có trên tay và ghi mã đang mở chưa khai');}
   else if(task.kind==='spec_confirm'){if(!(Number(r.labelQty)>0))throw Error('Nhập quy cách in trên bao (đơn vị nền)');r.recordedQty=Number(task.recordedQty)||null;}
   else if(MIX.includes(task.kind)){
    // Cân lại nhóm dễ nhầm: số cân từng món + sổ lúc gửi (đọc trong cùng giao dịch). Chỉ là bằng chứng — không đổi kho.
    const items=task.items||[],counts=r.counts||{};
    if(!items.length||items.some(x=>!E.finite(counts[x.id])||Number(counts[x.id])<0))throw Error('Cân đủ các món trong danh sách');
    if(task.kind==='mixup_group_weigh'&&(task.assigneeIds||[]).length&&!task.assigneeIds.includes(staff.id))throw Error('Việc này giao cho nhân viên có ca trong ngày xảy ra sự cố');
    const books={};for(const x of items){const d=await t.get(coll(x.kind==='prep'?'prep_items':'inventory_items').doc(x.id));books[x.id]=d.exists&&E.finite(d.data().currentStock)?Number(d.data().currentStock):null;}
    if(Object.values(books).some(b=>b===null))throw Error('Chưa đọc được sổ của món cần cân');
    r.counts=Object.fromEntries(items.map(x=>[x.id,Number(counts[x.id])]));r.books=books;
   }
   else if(task.kind==='reference_weigh'){if(!(Number(r.known)>0)||!(Number(r.reading)>=0))throw Error('Đặt vật mẫu biết trước khối lượng lên cân: nhập khối lượng chuẩn và số cân hiện');r.known=Number(r.known);r.reading=Number(r.reading);}
   const at=iso(),start=E.taskStart(task.status);
   t.set(sub('evidence').doc(taskId),{taskId,storeId:store,kind:task.kind,itemId:task.itemId,resolves:task.resolves||null,posterior:task.posterior??null,obsId:task.obsId||null,result:r,byEmployeeId:staff.id,at,labeled:MIX.includes(task.kind)});
   t.set(ref,{status:E.transition('task',start.status,'VALID_RESULT'),statusEvents:[...start.events,'VALID_RESULT'],pending:false,resultRef:sub('evidence').doc(taskId).path,updatedAt:at},{merge:true});return true;
  }).then(async ok=>{
   // Đối chiếu nhãn bao xong → tính lại các hồ sơ «nghi sai quy cách» của phiếu đó (nhãn = khai báo → chuyển thành hao hụt).
   if(ok&&mixTask)await mixupEvidence(mixTask);
   if(ok&&lot){const w=await sub('cases').where('basis','==','spec_mismatch').limit(50).get().catch(()=>null);for(const x of (w?w.docs:[])){const o=x.data();if(o.spec?.lot===lot&&o.originId)await finish(o.originId).catch(()=>{});}}
   return ok;
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
  // Hồ sơ đang CHỜ mã cùng phiếu nhận: tính lại mỗi ngày (mã kia đã dùng xong / quá hạn chờ → kết luận). Giới hạn 50.
  const waiting=[];try{for(const x of (await sub('cases').where('status','==','checking').limit(50).get()).docs){const o=x.data();if(o.basis==='waiting_sibling'&&o.originId){await finish(o.originId).catch(()=>{});waiting.push(o.originId);}}}catch(e){}
  const P=L.withDefaults(pSn.exists&&pSn.data().params?pSn.data().params:(opts.params||L.DEFAULT_PARAMS));
  const since=new Date(now()-90*86400000).toISOString();
  const [oSn,eSn,cSn,vSn]=await Promise.all([sub('obs').where('at','>=',since).orderBy('at').limit(3001).get(),sub('evidence').where('labeled','==',false).limit(200).get(),sub('controls').limit(501).get(),sub('model_versions').orderBy('createdAt').limit(200).get()]);
  if(oSn.docs.length>3000)throw error('Quá 3000 quan sát trong 90 ngày — cần phân vùng học, chưa tự chốt');
  const obs=oSn.docs.map(data),controls=Object.fromEntries(cSn.docs.map(d=>[d.id,data(d)])),at=iso(),writes=[];
  // 1) Nhãn từ kết quả chẩn đoán (quy tắc cố định, kiểm được).
  // Nhãn / cờ «đã chấm» của quan sát chỉ ghi SAU khi models/current đã lưu bền (late[]); nhãn đã tính vào mô hình được nhớ (consumedEvidence)
  // → lỗi giữa chừng thì chạy lại khôi phục đúng kết quả: không mất nhãn (cờ chưa ghi) và không đếm đôi (đã nhớ).
  const late=[],consumed=new Set(prev.consumedEvidence||[]);
  const labels=JSON.parse(JSON.stringify(prev.labels||{})),tareChecks=JSON.parse(JSON.stringify(prev.tareChecks||{})),recipeAudits=JSON.parse(JSON.stringify(prev.recipeAudits||{}));
  const specChecks=JSON.parse(JSON.stringify(prev.specChecks||{})),referenceChecks=JSON.parse(JSON.stringify(prev.referenceChecks||[]));
  for(const ev of eSn.docs.map(data)){
   if(consumed.has(ev.taskId)){late.push([sub('evidence').doc(ev.taskId),{labeled:true,labeledAt:at}]);continue;}
   const r=ev.result||{};let y=null;
   if(ev.kind==='tare_check'){y=Math.abs(r.measuredTareG-r.recordedTareG)>2*(P.measSigma.g||3)?1:0;(tareChecks[r.vesselId]=tareChecks[r.vesselId]||[]).push({recorded:r.recordedTareG,measured:r.measuredTareG});tareChecks[r.vesselId]=tareChecks[r.vesselId].slice(-20);}
   else if(ev.kind==='recipe_portion_weigh'){y=Math.abs(r.measuredG-r.bookG)/r.bookG>0.05?1:0;(recipeAudits[ev.itemId]=recipeAudits[ev.itemId]||[]).push({book:r.bookG,measured:r.measuredG});recipeAudits[ev.itemId]=recipeAudits[ev.itemId].slice(-20);}
   else if(ev.kind==='density_proof'){const it=await coll('inventory_items').doc(ev.itemId).get(),old=Number(it.exists&&it.data().densityGPerMl);y=old>0?(Math.abs(r.density-old)/old>0.03?1:0):1;}
   else if(ev.kind==='scan_open_units')y=(r.unregistered||[]).length>0?1:0;
   else if(ev.kind==='spec_confirm'){y=r.recordedQty>0&&Math.abs(r.labelQty-r.recordedQty)/r.recordedQty>0.02?1:0;(specChecks[ev.itemId]=specChecks[ev.itemId]||[]).push({recorded:r.recordedQty,label:r.labelQty});specChecks[ev.itemId]=specChecks[ev.itemId].slice(-20);}
   else if(ev.kind==='reference_weigh'){y=Math.abs(r.reading-r.known)/r.known>0.01?1:0;referenceChecks.push({known:r.known,reading:r.reading});referenceChecks.splice(0,Math.max(0,referenceChecks.length-20));}
   if(y!==null&&ev.resolves){const l=labels[ev.resolves]=labels[ev.resolves]||{n:0,brierSum:0,pairs:[]},p=Number(ev.posterior)||0;if(!Number.isFinite(l.brierSum))l.brierSum=(Number(l.brier)||0)*(l.n||0);l.n=(l.n||0)+1;l.brierSum+=Math.pow(p-y,2);l.pairs=[...(l.pairs||[]),[p,y]].slice(-(P.calibration.keep||300));}
   late.push([sub('evidence').doc(ev.taskId),{labeled:true,label:y,labeledAt:at}]);consumed.add(ev.taskId);
  }
  // Hiệu chỉnh xác suất từng giả thuyết theo nhãn của quán (Brier ngoài mẫu) — chỉ giả thuyết đạt mới in %.
  const calMaps=Object.fromEntries(Object.entries(labels).map(([h,l])=>[h,L.fitCalibration(l.pairs||[],P)]));
  const evidence={tareChecks,recipeAudits,specChecks,referenceChecks,calibration:calMaps,labelsCount:Object.fromEntries(Object.entries(labels).map(([h,l])=>[h,l.n])),brier:Object.fromEntries(Object.entries(labels).map(([h,l])=>[h,l.brierSum/Math.max(1,l.n)]))};
  // 2) Chấm quan sát mới theo thời gian, baseline học từ các quan sát đã chấm trước đó (mẫu bất thường không học).
  const scored=obs.filter(o=>o.scored),fresh=obs.filter(o=>!o.scored),cusum={...(prev.cusum||{})},created=[];
  let base=L.baseline(scored,P);
  const residuals={};for(const o of scored)if(o.verified&&o.used>0&&o.nWeigh>0&&!o.flagged){const b=L.predict(base,o.itemId,o.unit);(residuals[o.itemId]=residuals[o.itemId]||[]).push({groupKey:o.groupKey,rate:(o.loss-b.estimate*o.used)/o.used});}
  evidence.itemResiduals=residuals;
  // Mã cùng loại cùng phiếu nhận (giả thuyết sai quy cách) — đọc khi cần, 1 truy vấn có giới hạn / phiếu.
  evidence.lots={};const lotFor=async(itemId,ref,selfId)=>{const k=itemId+'|'+ref;if(evidence.lots[k])return;let rows=[];try{if((await coll('receiving_records').doc(ref).get()).exists)rows=(await coll('stock_containers').where('receiveRefId','==',ref).limit(51).get()).docs.map(data).filter(x=>x.itemId===itemId&&!['voided','cancelled'].includes(x.status));}catch(e){}
   const lossOf=id=>obs.filter(q=>q.containerId===id&&q.verified!==false).reduce((a,q)=>a+Math.max(0,Number(q.loss)||0),0);
   evidence.lots[k]={size:rows.length,units:rows.map(x=>({id:x.id,finished:x.status==='finished',frac:Number(x.baseQty)>0?Math.max(Number(x.wasteBase)||0,lossOf(x.id))/Number(x.baseQty):0,finishedAt:x.finishedAt||null}))};};
  for(const o of fresh){
   const upd={scored:true,scoredAt:at};
   if(o.verified&&o.used>0){
    const sc=L.score(o,base,P),acc=o.nWeigh>0?L.accumulate(cusum[o.itemId],sc,P):{S:cusum[o.itemId]||0,alarm:false};cusum[o.itemId]=acc.S;
    Object.assign(upd,{score:{z:sc.z,excess:sc.excess,expected:sc.expected,threshold:sc.threshold,state:sc.state},flagged:sc.abnormal||acc.alarm,accumulated:acc.alarm});
    if(upd.flagged&&!(o.ctx&&o.ctx.fifoDebt)){
     if(o.fromOpen&&o.receiveRefId)await lotFor(o.itemId,o.receiveRefId,o.containerId);
     const hy=L.hypotheses(o,base,evidence,P);Object.assign(upd,{explainedBy:hy.explainedBy,residualQty:hy.residual.qty,ranking:hy.ranking.slice(0,3)});
     const test=hy.next&&hy.next.test,common={obsId:o.id,resolves:hy.next&&hy.next.resolves,posterior:hy.next?hy.posterior[hy.next.resolves]:null,reason:'Chẩn đoán: '+(hy.ranking[0]?.why||'')};
     if(test==='tare_check'&&o.vesselIds?.[0])created.push(createTask('tare_check',o.itemId,o.id,{...common,vesselId:o.vesselIds[0],reason:'Kiểm bì dụng cụ — giả thuyết sai bì'}));
     else if(test==='density_proof')created.push(createTask('density_proof',o.itemId,o.id,{...common,reason:'Đo lại tỷ trọng — giả thuyết sai tỷ trọng'}));
     else if(test==='recipe_portion_weigh')created.push(createTask('recipe_portion_weigh',o.itemId,o.id,{...common,reason:'Cân một phần theo định mức — giả thuyết định mức sai'}));
     else if(test==='scan_open_units')created.push(createTask('scan_open_units',o.itemId,o.id,{...common,reason:'Rà mã đang mở / chưa khai — giả thuyết tiêu hao không khai'}));
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
   late.push([sub('obs').doc(o.id),upd]);Object.assign(o,upd);
  }
  // 3) Hạ mức theo tiêu chí đã hiệu chuẩn (chỉ khi bật tự hạ; không dưới sàn; mỗi lần một bậc).
  const allScored=obs.filter(o=>o.scored);base=L.baseline(allScored,P);
  const recentFrom=new Date(now()-14*86400000).toISOString(),released=[];
  // ACK thật: mọi thiết bị POS hoạt động gần đây (7 ngày) đã nhận phiên bản yêu cầu hiện hành (revision gốc) — không giả định đã ACK.
  let ackComplete=false;
  if(cfg.mode==='active'&&cfg.autoRelease!==false&&!prev.safeMode&&/^calibrated/.test(String(P.origin||''))){
   const devs=(await sub('devices').orderBy('ackedAt','desc').limit(20).get()).docs.map(data).filter(d=>E.ms(d.ackedAt)>=now()-7*86400000);
   ackComplete=devs.length>0&&devs.every(d=>(Number(d.controlRevision)||0)>=(Number(cfg.revision)||0));
  }
  if(cfg.mode==='active'&&cfg.autoRelease!==false&&!prev.safeMode&&/^calibrated/.test(String(P.origin||'')))for(const [itemId,ctl] of Object.entries(controls)){
   if(!(ctl.level>=1))continue;
   // Chỉ mốc SAU lần đổi mức gần nhất của món (nâng / hạ / sửa sàn): mốc sạch cũ không dùng lại cho một sự cố mới.
   const effective=[recentFrom,ctl.lastEscalationAt,ctl.lastReleaseAt,ctl.updatedAt].filter(Boolean).map(x=>typeof x==='string'?x:new Date(E.ms(x)).toISOString()).sort().pop();
   const recent=allScored.filter(o=>o.itemId===itemId&&o.at>=effective);
   const pend=await sub('tasks').where('itemId','==',itemId).where('pending','==',true).limit(1).get();
   const days=ctl.lastReleaseAt?(now()-E.ms(ctl.lastReleaseAt))/86400000:99,cap=Math.max(1,...recent.map(o=>o.used||0));
   const adv=L.controlAdvice(ctl,recent,base,{typicalUnit:cap/2,daysSinceLastRelease:days,pending:pend.docs.length,ackComplete},P);
   if(adv.action!=='release')continue;
   const clean=recent.filter(o=>!o.flagged&&['random_m0','control','m3'].includes(o.sampling));
   const next=E.control(ctl,'CLEAN_WINDOW_PASSED',{releaseEnabled:true,validPoints:clean.length,activeDays:new Set(clean.map(o=>o.day)).size,usedEnough:true,pending:pend.docs.length,ackComplete,daysSinceLastRelease:days,criteria:P.release});
   if(next.level<ctl.level){writes.push([sub('controls').doc(itemId),{...next,revision:(ctl.revision||0)+1,lastReleaseAt:at,lastReleaseReason:adv.reason,updatedAt:at}]);released.push(itemId);}
  }
  // 4) Cân ngẫu nhiên M0 theo ngân sách (mẫu không thiên lệch cho baseline — lộ trình điều chỉnh 2).
  const budget=Number(cfg.randomM0PerDay??P.sampling?.perDay??2),lastM0={...(prev.lastM0||{})},act={};
  for(const o of allScored)if(o.at>=recentFrom&&o.used>0)act[o.itemId]=(act[o.itemId]||0)+o.used;
  // Ứng viên = món có quan sát + MỌI món đang có mã mở (một truy vấn / lượt học) — món sạch chưa từng có quan sát cũng được lấy mẫu đầu tiên.
  // Xoay vòng: món lâu chưa cân M0 (hoặc chưa từng) trước, hòa thì món dùng nhiều trước — mẫu không thiên về món đã có sự cố.
  const openIds=new Set();if(cfg.mode==='active')try{for(const d of (await coll('stock_containers').where('status','==','open').limit(300).get()).docs)if(d.data().itemId)openIds.add(d.data().itemId);}catch(e){}
  const m0Pool=new Set([...Object.keys(act),...openIds]);
  const cand=[...m0Pool].filter(id=>!(controls[id]?.level>=1)&&(!lastM0[id]||lastM0[id]<new Date(now()-2*86400000).toISOString().slice(0,10))).sort((a,b)=>String(lastM0[a]||'').localeCompare(String(lastM0[b]||''))||(act[b]||0)-(act[a]||0)||String(a).localeCompare(String(b))).slice(0,Math.max(0,budget));
  if(cfg.mode==='active')for(const id of cand){created.push(createTask('weigh_open_units',id,'m0~'+day,{sampling:'random_m0',reason:'Cân ngẫu nhiên — dữ liệu mức thường (không phải vì có nghi vấn)'}));lastM0[id]=day;}
  // 5) Hiệu chuẩn có rào hằng tuần (live ±5%), quay lui, kiểm toán mô hình.
  const versions=vSn.docs.map(data);let calib=null,rollback=null,safeMode=!!prev.safeMode;const lastCal=prev.lastCalibratedDay||'';
  if(!lastCal||(Date.parse(day)-Date.parse(lastCal))/86400000>=7){
   const c=L.calibrate(P,allScored,{mode:'live',minValidation:30,stamp:day,evidence:()=>evidence});
   calib={promoted:c.promoted,reason:c.reason,changes:c.record?.changes||[]};
   if(c.promoted&&!versions.some(v=>v.version===P.version)){
    // Bản đang chạy (vd bản mô phỏng nạp từ JS) chưa từng lưu ở model_versions → lưu TRƯỚC khi nhận bản mới, để quay lui được.
    const baseRec={version:P.version,parent:P.version,rollbackRef:P.version,mode:'baseline',dataHash:'baseline',window:{},metricsBefore:{missRate:0},metricsAfter:{missRate:0},changes:[],createdAt:new Date(E.ms(at)-1).toISOString(),params:P};
    writes.push([sub('model_versions').doc(P.version),baseRec]);versions.push(baseRec);
   }
   if(c.promoted){const rec={...c.record,createdAt:at,params:c.params};writes.push([sub('model_versions').doc(c.params.version),rec],[paramsRef,{params:c.params,version:c.params.version,parent:P.version,updatedAt:at}]);versions.push(rec);}
   const lastRec=versions.at(-1);if(lastRec&&lastRec.metricsAfter){const live=L.evaluate(allScored.filter(o=>o.at>=(lastRec.createdAt||'')),P);const rb=L.shouldRollback(lastRec,live);if(rb.rollback){const parent=versions.find(v=>v.version===rb.to);if(parent?.params){writes.push([paramsRef,{params:parent.params,version:parent.version,rolledBackFrom:lastRec.version,updatedAt:at}]);rollback=rb;}else{rollback={...rb,failed:true,reason:'Không tìm thấy bản cha '+rb.to+' để quay lui — chế độ an toàn: dừng tự hạ mức'};safeMode=true;}}}
  }
  const issues=L.auditModels(versions,P);if(rollback&&rollback.failed)issues.push({code:'ROLLBACK_PARENT_MISSING',version:P.version,to:rollback.to});const evalM=L.evaluate(allScored,P);
  const items=Object.fromEntries(Object.values(base.items).map(b=>[b.itemId,{n:b.n,informative:b.informative,days:b.days,estimate:b.estimate,low:b.low,high:b.high,state:b.state,capped:b.capped,level:controls[b.itemId]?.level||0}]));
  const model={day,storeId:store,updatedAt:at,params:{version:P.version,origin:P.origin||null},items,groups:base.groups,excluded:base.excluded,outliers:L.outlierItems(base),drift:L.drift(allScored,L.baseline(allScored.slice(0,Math.floor(allScored.length/2)),P),P),
   labels:Object.fromEntries(Object.entries(labels).map(([h,l])=>{const c=calMaps[h];return [h,{n:l.n,brierSum:l.brierSum,brier:l.brierSum/Math.max(1,l.n),pairs:l.pairs||[],calBrier:c.brier,a:c.a,b:c.b,calibrated:l.n>=P.calibration.minLabels&&c.calibrated}];})),
   coverage90:evalM.coverage90,obs:{total:obs.length,scored:allScored.length,flagged:allScored.filter(o=>o.flagged).length,fifoDebt:allScored.filter(o=>o.ctx?.fifoDebt).length,minutesKnown:allScored.filter(o=>o.minutes!=null).length},
   cusum,lastM0,tareChecks,recipeAudits,specChecks,referenceChecks,released,calibration:calib,rollback,safeMode,modelIssues:issues,lastCalibratedDay:calib?day:lastCal,autoRelease:cfg.autoRelease!==false&&/^calibrated/.test(String(P.origin||''))};
  for(const [ref,val] of writes)await ref.set(val,{merge:true});
  // [Rà soát 23/10 #3] Món vừa nâng mức (hoặc nâng dở ở lượt trước) phải nằm trong danh sách POS thực thi — đối chiếu mỗi lượt.
  if(cfg.mode==='active')await publishControls(Object.entries(controls).filter(([,c])=>Number(c.level)>=1).map(([id])=>id));
  model.consumedEvidence=[...consumed].slice(-400);
  await modelRef.set(model);
  for(const [ref,val] of late)await ref.set(val,{merge:true});
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
  else{await sweepPrepReview();await fs.runTransaction(async t=>{await fence(t,guard);const cs=await t.get(base);if(cs.exists&&cs.data().settingsRevision===cfg.settingsRevision)t.set(base,{bootstrapFinishedAt:iso()},{merge:true});});}
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
   const guard={ref,token,revision:job.revision};if(job.kind==='finish')await finish(job.sourceId,guard);else if(job.kind==='measurement')await measure(job.sourceId,guard);else if(job.kind==='bootstrap')await bootstrap(guard);else if(['reprice','recompute_shift'].includes(job.kind))await dependencies(job.kind,job.sourceId,guard);else if(job.kind==='discover_shift')await discoverShift(job.sourceId,guard);else if(job.kind==='opened')await opened(job.sourceId,guard);else if(job.kind==='prep_review')await prepReview(job.sourceId,guard);else if(job.kind==='mixup_day')await mixupDay(job.sourceId,guard);else if(job.kind==='alert_review')await alertReview(job.sourceId,guard);else if(job.kind==='sub_review')await subReview(job.sourceId,guard);else await handover(job.sourceId,guard);
   return await fs.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||s.data().leaseToken!==token)return false;t.set(ref,{dirty:s.data().revision!==job.revision,leaseUntil:0,leaseToken:'',nextTryAt:now(),lastError:'',completedAt:iso()},{merge:true});return true;});
   }catch(e){await fs.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||s.data().leaseToken!==token)return;if(s.data().revision!==job.revision){t.set(ref,{leaseUntil:0,leaseToken:'',nextTryAt:now()},{merge:true});return;}t.set(ref,{leaseUntil:0,leaseToken:'',lastError:String(e.message||e),nextTryAt:now()+60000,attempt:(s.data().attempt||0)+1},{merge:true});});throw e;}
 }
 async function retryDue(){const s=await sub('requests').where('dirty','==',true).where('nextTryAt','<=',now()).orderBy('nextTryAt').limit(30).get();for(const d of s.docs)try{await drain(d.id);}catch(e){if(opts.log)opts.log(e);}return s.docs.length;}
 return {storeId:store,base,sub,coll,config,enqueue,finish,prepReview,sweepPrepReview,mixupDay,mixupSweep,alertReview,alertsForCase,sweepAlerts,subReview,sweepSubReviews,handover,opened,ensureCloseTasks,registerVessel,requestMeasurement,measure,createTask,submitEvidence,learnDay,exception,drain,retryDue,observation,startPoint};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Store=api;
})(typeof window!=='undefined'?window:globalThis);
