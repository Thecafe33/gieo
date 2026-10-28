/* Cầu nối Engine 2 ↔ POS, bản v2 (28/10/2026) — KHÔNG CÓ GIAO DIỆN RIÊNG.
 * Chủ quán chốt: nhân viên chỉ làm việc, không được hỏi / giải thích; việc cân Engine 2 điều phối nằm TRONG danh sách cân cuối ca
 * sẵn có của POS (cùng giao diện, cùng thao tác), không popup, không màn riêng, không chú thích.
 * v1 giữ nguyên để quay lui (đã phát hành). Nối bằng cách BỌC hàm POS, không sửa file POS đã phát hành:
 *   1. computeShiftInventoryCountLinesPOS('close'): thêm món Engine 2 điều phối (kiểm soát / cân ngẫu nhiên M0) vào danh sách;
 *      món đã có sẵn thì chỉ gắn dấu ngầm l.e2 — không thêm dòng, không thêm lần cân.
 *   2. UnitEngine.shift.applyLine: dòng có dấu l.e2 → xin Engine 2 mã lượt (requestMeasurement) TRƯỚC, rồi POS tự áp số cân vào
 *      kho với cờ engine2Owner. Tiến trình nền thấy kho đã áp (phiếu inventoryResult) nên chỉ ghi nốt trách nhiệm + mốc cân.
 *      Điều kiện nào không chắc chắn → POS ghi như thường (người ghi trách nhiệm cũ). KHÔNG BAO GIỜ chặn kết ca.
 *   3. shiftWeighLineHTML: bỏ dòng «Cần cân hôm nay vì …» (không giải thích cho nhân viên).
 * Chưa làm (đợt 2): mô hình vận hành theo nhân sự, cân đầu ca khi người mở = người kết, cân độc lập / chẩn đoán / nhóm dễ nhầm.
 * Các việc loại đó vẫn nằm ở trạng thái chờ, không hiện ở đâu cả. */
(function(){
'use strict';
if(!window.UnitEngine2||!window.UnitEngine2Store)return;
const E=window.UnitEngine2;
let service=null,state=null,unsubscribe=null,journal=null,flushing=false,ackSent='';
let vesselCache={at:0,list:null},taskCache={day:'',at:0,promise:null};
const CYCLE='c';                                   // một việc «cân cuối ngày» cố định cho mỗi (ngày, món)
const TASK_CACHE_MS=15000,VESSEL_CACHE_MS=60000;
const active=()=>!!(state&&state.enabled&&state.mode==='active'&&state.protocolVersion===1&&state.fleetConfirmed===true);

async function ack(){
 if(!service||!state?.enabled)return;const signature=E.stable([state.mode,state.settingsRevision,state.revision,state.controlledItemIds]);if(ackSent===signature)return;
 try{const key='gieo_engine2_device_'+service.storeId;let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}await service.sub('devices').doc(id).set({storeId:service.storeId,protocolVersion:1,inventoryVersion:UnitEngine.VERSION,controlRevision:state.revision||0,settingsRevision:state.settingsRevision||0,ackedAt:new Date(UnitEngine.clock.now()).toISOString()},{merge:true});ackSent=signature;}catch(e){console.warn('Engine2 chưa xác nhận thiết bị',e.message);}
}
function init(){
 if(service||typeof POS_STORE==='undefined'||!POS_STORE.storeId||!window.UnitEngine2Store||!window.GieoData)return;
 const store=POS_STORE.storeId;service=UnitEngine2Store.create({storeId:store,fstore,collection:k=>GieoData.collFor(k+'_gieogieo',store)});journal=E.outbox(localStorage,store);
 unsubscribe=service.base.onSnapshot(s=>{state=s.exists?s.data():null;ack();if(active())flush();},e=>{console.warn('Engine2 control',e);});
}
// Lệnh còn nằm trong hộp thư máy từ bản v1 (đo / ghi tình trạng / chứng cứ / bỏ qua cuối ngày) vẫn được giao nốt.
async function deliver(command){
 const p=command.payload;
 if(command.kind==='measurement')await service.requestMeasurement(p.taskId,p.line,p.staff);
 else if(command.kind==='exception')await service.exception(p.taskId,p.staff,p.reason);
 else if(command.kind==='evidence')await service.submitEvidence(p.taskId,p.result,p.staff);
 else{await service.ensureCloseTasks(p.day,p.cycle,p.itemIds);for(const id of p.itemIds)await service.exception(E.key('day_close',p.day,id,p.cycle),p.staff,p.reason);}
 journal.remove(command.id);
}
async function flush(){if(flushing||!service||!journal)return;flushing=true;try{for(const c of journal.read().slice(0,10))await deliver(c);}catch(e){console.warn('Engine2 còn việc chờ đồng bộ',e.message);}finally{flushing=false;}}

// ── Việc Engine 2 cần cân ở cuối ca ───────────────────────────────────────────
// Trả {controlled:[itemId], m0:{itemId→taskId}}. Kiểm soát: đọc từ bản cấu hình đã nghe sẵn (0 lượt đọc thêm). Cân ngẫu nhiên M0:
// một truy vấn việc đang chờ, nhớ 15 giây để các lần dựng danh sách liên tiếp không đọc lại.
async function wanted(day){
 const now=Date.now();
 if(taskCache.day===day&&now-taskCache.at<TASK_CACHE_MS&&taskCache.promise)return taskCache.promise;
 const p=(async()=>{
  const m0={};
  try{
   const s=await service.sub('tasks').where('pending','==',true).orderBy('createdAt','desc').limit(40).get({source:'server'});
   s.docs.forEach(d=>{const t=d.data();if(t.kind==='weigh_open_units'&&t.sampling==='random_m0'&&t.itemId&&!m0[t.itemId])m0[t.itemId]=d.id;});
  }catch(e){console.warn('Engine2: chưa đọc được việc cân ngẫu nhiên',e.message);}
  return {controlled:[...(state.controlledItemIds||[])],m0};
 })();
 taskCache={day,at:now,promise:p};
 return p;
}
const byName=(a,b)=>(a.itemName||'').localeCompare(b.itemName||'','vi');
async function extendCloseLines(lines){
 if(!active()||!service)return lines;
 const day=(typeof shiftState!=='undefined'&&shiftState.businessDate)||posDateKey();
 let w;try{w=await wanted(day);}catch(e){console.warn('Engine2: bỏ qua việc cân bổ sung',e.message);return lines;}
 const controlled=new Set(w.controlled),m0=w.m0,ids=new Set([...controlled,...Object.keys(m0)]);
 if(!ids.size)return lines;
 const byItem=new Map(lines.map(l=>[l.itemId,l]));
 const tasks=new Map();                              // itemId → taskId của các dòng sẽ đánh dấu
 // 1) Món đã có trong danh sách cân (bắt buộc / bất thường): chỉ gắn dấu ngầm.
 const missing=[...ids].filter(id=>!byItem.has(id));
 // 2) Món chưa có: thêm dòng nếu còn mã mở và hôm nay chưa cân. Đọc 1 phiếu đóng ngày + RT từng món (ít món).
 let extra=[];
 if(missing.length){
  try{
   await ensureKhoItemsPOS();
   const snap=await fstore.collection('daily_closings_gieogieo').doc(day).get();
   const done=new Set(((snap.exists?snap.data().shiftInventoryCloseLines:[])||[]).map(l=>l.itemId));
   for(const id of missing){
    if(done.has(id))continue;
    const it=(KHO_ITEMS_CACHE||[]).find(x=>x.id===id);
    if(!it||it.stockManaged===false||!shiftWeighIsTemItemPOS(it))continue;
    const node=(await UnitEngine.units.ref(id).once('value')).val();
    const line=shiftWeighTemLinePOS(it,node,[]);    // lý do rỗng: không giải thích
    if(line)extra.push(line);
   }
  }catch(e){console.warn('Engine2: chưa dựng được dòng cân bổ sung',e.message);extra=[];}
 }
 const all=lines.concat(extra);
 const controlledIds=[];
 for(const l of all){
  if(controlled.has(l.itemId)){controlledIds.push(l.itemId);tasks.set(l.itemId,E.key('day_close',day,l.itemId,CYCLE));}
  else if(m0[l.itemId])tasks.set(l.itemId,m0[l.itemId]);
 }
 if(controlledIds.length){try{await service.ensureCloseTasks(day,CYCLE,controlledIds);}catch(e){console.warn('Engine2: chưa tạo việc cân cuối ngày',e.message);return lines;}}
 for(const l of all)if(tasks.has(l.itemId))l.e2={taskId:tasks.get(l.itemId)};
 return extra.length?all.sort(byName):all;
}

// ── Đưa số cân của dòng POS cho Engine 2 ───────────────────────────────────────
async function vessels(){
 const now=Date.now();if(vesselCache.list&&now-vesselCache.at<VESSEL_CACHE_MS)return vesselCache.list;
 const s=await fstore.collection('prep_vessels_gieogieo').get();
 vesselCache={at:now,list:s.docs.map(d=>({...d.data(),id:d.id}))};return vesselCache.list;
}
const uuid=()=>window.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2);
// Trả true khi Engine 2 đã nhận lượt cân và dòng được đánh dấu engine2Owner. Bất kỳ điều kiện nào không chắc chắn → false (POS ghi như thường).
async function engage(l,day,staff){
 if(l.engine2Owner)return true;
 if(!l.e2?.taskId||!active()||!service||!staff?.id)return false;
 const units=l.units||[];
 if(!units.length||units.some(u=>u.state==='missing'||u.gone||u.weighed==null||u.baseline==null||!Number.isFinite(Date.parse(u.countedAt||''))))return false;
 // Lệch lớn: để POS hỏi xác nhận như cũ trước; chỉ nhận lượt sau khi nhân viên đã xác nhận.
 const large=units.some(u=>Math.abs(u.baseline-u.weighed)>(u.capacity>0?u.capacity:Math.max(Math.abs(u.baseline),1))*.25);
 if(large&&!l._devAck)return false;
 const item=(typeof KHO_ITEMS_CACHE!=='undefined'?KHO_ITEMS_CACHE:[]).find(x=>x.id===l.itemId);
 if(!item)return false;
 const unit=String(item.unit||'').toLowerCase(),liquid=unit==='ml'||unit==='l';
 if(liquid&&!(Number(item.densityGPerMl)>0))return false;
 try{
  const lib=await vessels();
  for(const u of units){
   if(!Array.isArray(u.weighings)||!u.weighings.length)return false;               // số gõ tay không có dụng cụ → Engine 2 không kiểm được bì
   if(Math.abs(E.measurement(u.weighings,item).net-Number(u.weighed))>0.015)return false;
   if(Number(u.capacity)>0&&u.weighed>Number(u.capacity)*1.1)return false;
   for(const w of u.weighings){const v=lib.find(x=>x.id===w.vesselId),variant=v&&(v.variants||[]).find(x=>x.id===w.variantId);if(!variant||Number(variant.tareG)!==Number(w.tareG))return false;}
  }
  const finishedAt=new Date(UnitEngine.clock.now()).toISOString(),times=units.map(u=>u.countedAt).sort();
  const line={itemId:l.itemId,itemName:l.itemName,unit:item.unit,mode:'tem',businessDate:day,sessionId:l._e2Session||(l._e2Session=uuid()),
   startedAt:times[0],finishedAt,
   units:units.map(u=>({id:u.id,code:u.code||'',openedAt:u.openedAt||0,capacity:Number(u.capacity)||0,state:'confirmed',confirmVia:u.confirmVia||'scan',manualReason:u.manualReason||'',
    weighed:Number(u.weighed),weighings:u.weighings,baseline:Number(u.baseline),baselineSig:u.baselineSig||'',countedAt:u.countedAt,seq:u.seq||0,gone:false,checkpointSnapshot:null})),
   densitySnapshot:liquid?Number(item.densityGPerMl):null,largeDeviationConfirmed:!!large};
  const id=await service.requestMeasurement(l.e2.taskId,line,{id:staff.id,fullName:staff.fullName||''});
  const doc=await service.sub('measurements').doc(id).get();
  if(!doc.exists||doc.data().status==='rejected')return false;
  l.engine2Owner=true;l.engine2OpId=doc.data().operationId;return true;
 }catch(e){console.warn('Engine2: không nhận lượt cân, POS ghi như thường —',e.message);return false;}
}

function install(){
 // 1) Danh sách cân cuối ca = danh sách sẵn có + món Engine 2 điều phối.
 const compute=window.computeShiftInventoryCountLinesPOS;
 if(typeof compute==='function')window.computeShiftInventoryCountLinesPOS=async function(...args){
  init();const lines=await compute.apply(this,args);
  return args[0]==='close'?extendCloseLines(lines):lines;
 };
 // 2) Ghi số cân: dòng của Engine 2 đi qua mã lượt của Engine 2, kho vẫn do chính POS áp ngay (đồng bộ, như mọi dòng khác).
 const shift=window.UnitEngine&&UnitEngine.shift;
 if(shift&&typeof shift.applyLine==='function'){
  const apply=shift.applyLine;
  shift.applyLine=async function(l,day,staff,seed){
   if(l&&l.e2&&!l._applied){try{await engage(l,day,staff);}catch(e){console.warn('Engine2',e&&e.message);}}
   try{return await apply.call(this,l,day,staff,seed);}
   catch(e){
    // Số sổ đã đổi giữa lúc cân và lúc ghi (cần tải lại mã): lượt Engine 2 đã xin không còn đúng → xin lại ở lần ghi sau.
    if(l&&l.engine2Owner&&e&&e.code==='SW_RELOAD'){l.engine2Owner=false;delete l.engine2OpId;l._e2Session=null;}
    throw e;
   }
  };
 }
 // 3) Không giải thích với nhân viên: bỏ dòng «Cần cân hôm nay vì …» (dữ liệu lý do vẫn nằm trong dòng, chỉ không hiển thị).
 const lineHTML=window.shiftWeighLineHTML;
 if(typeof lineHTML==='function')window.shiftWeighLineHTML=function(l,i){return l&&l.reasons&&l.reasons.length?lineHTML.call(this,{...l,reasons:[]},i):lineHTML.call(this,l,i);};
 window.addEventListener('online',flush);
 if(typeof firebase!=='undefined'&&typeof firebase.auth==='function'&&typeof firebase.auth().onAuthStateChanged==='function')firebase.auth().onAuthStateChanged(u=>{if(u)init();else{unsubscribe?.();unsubscribe=null;service=null;state=null;}});
}
window.GieoEngine2POS={flush,_engage:engage,_extend:extendCloseLines};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
