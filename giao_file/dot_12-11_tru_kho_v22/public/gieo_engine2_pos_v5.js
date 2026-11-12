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
 * Đợt 2 (nhân sự — chủ quán chốt 28/10):
 *   4. Người mở ca duy nhất = người kết ca hôm trước → KHÔNG yêu cầu cân / đếm bất cứ thứ gì ở đầu ca (danh sách kiểm kê đầu ca VÀ đếm giao ca đầu ca) —
 *      cuối ca đã cân hết, bắt chính người đó cân lại chỉ thêm công. Chưa biết ai mở hoặc có từ hai người → hỏi như thường (thận trọng).
 *   5. Cân độc lập (M3) chỉ ở đầu ca và chỉ khi có người KHÁC người cân trước đang mở ca (số cân của người nhận ca chính là phép đo độc lập; không việc riêng).
 * Chưa làm: việc chẩn đoán / nhóm dễ nhầm (nằm chờ, chưa hiện ở đâu).
 * v3 (05/11/2026, chủ quán duyệt A + B + C — rà soát giao tiếp POS ↔ Engine 2; cần unit_engine2_store_v3.js, v2 giữ quay lui):
 *   A. Lượt cân trong BAO GÓI GỐC / gói gốc + dụng cụ được giao cho Engine 2 (trước chỉ dụng cụ prep_vessels → bị bỏ qua lặng lẽ).
 *   B. Dòng Engine 2 cần mà POS tự ghi kho (không giao được lượt) → đóng việc Engine 2 kèm MÃ LÝ DO (store.posFallback, qua hộp thư
 *      máy nên mất mạng vẫn gửi bù). Hết cảnh việc nằm chờ mãi và việc cân ngẫu nhiên M0 bị thêm vào danh sách MỖI NGÀY.
 *   C. Chỉ giao lượt khi bộ xử lý nền còn chạy (workerHeartbeatAt mới hơn 45 phút). Giao lượt = kho bỏ bước ghi trách nhiệm và bước tự
 *      hồi phục để worker làm; worker không chạy mà vẫn giao là mất trách nhiệm. Không chắc → POS ghi như khi chưa bật Engine 2.
 * v4 (05/11/2026) = v3 + xác nhận máy ghi bridgeVersion (quanlygieo2 thấy máy nào còn bản cũ — trước chỉ có ô tick tay «đã cập nhật»);
 *   cần unit_engine2_store_v4.js (posFallback đếm «POS tự ghi» theo ngày). v3 giữ quay lui.
 * v5 (11/11/2026, docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md; cần unit_engine2_store_v5.js; v4 giữ quay lui) — KHÔNG đổi luật, không thêm giao diện,
 *   không thêm lần cân; chỉ để nhân viên KHÔNG CHỜ VÔ NGHĨA lúc kết ca:
 *   B1. Việc «cân cuối ngày»: một transaction cho mọi món + nhớ món đã có việc trong ngày (dựng lại danh sách không hỏi lại).
 *   B2. Mỗi dòng cân: MỘT vòng mạng với Engine 2 (xin lượt + xếp hàng + nhận kết quả), trước là 3–4.
 *   B3. Việc cân ngẫu nhiên / độc lập lấy từ danh sách worker công bố sẵn trên tài liệu đang nghe (state.e2Plan, store worker ≥ 5);
 *       worker cũ chưa công bố → truy vấn như v4.
 *   B4. Người kết ca hôm trước nhớ theo ngày ở máy (tải lại trang không đọc lại).
 *   B5. TRẦN THỜI GIAN: cả lần kết ca Engine 2 chỉ được làm nhân viên chờ tối đa WAIT_BUDGET_MS; hết → POS tự ghi như cơ chế «không
 *       chắc → POS ghi» sẵn có (mã lý do request_failed). Lượt được nhận muộn sau đó → rút lại (store.withdraw). */
(function(){
'use strict';
if(!window.UnitEngine2||!window.UnitEngine2Store)return;
const E=window.UnitEngine2,S=window.UnitEngine2Staffing||null;
let service=null,state=null,unsubscribe=null,journal=null,flushing=false,ackSent='';
let vesselCache={at:0,list:null},taskCache={day:'',at:0,promise:null};
const ensured=new Set();                              // [v5-B1] 'ngày|món' đã có việc cân cuối ngày
const WAIT_BUDGET_MS=4000;let waitUsed=0,waitDay='';    // [v5-B5] trần chờ Engine 2 cho cả lần kết ca (tính lại khi sang ngày / mở lại danh sách)
const CYCLE='c';                                   // một việc «cân cuối ngày» cố định cho mỗi (ngày, món)
const TASK_CACHE_MS=15000,VESSEL_CACHE_MS=60000;
const active=()=>!!(state&&state.enabled&&state.mode==='active'&&state.protocolVersion===1&&state.fleetConfirmed===true);
const BRIDGE_VERSION=5;
const WORKER_FRESH_MS=45*60000;                    // đồng hồ worker 15 phút → chịu được 2 nhịp lỡ
const workerFresh=()=>{const t=Date.parse(state?.workerHeartbeatAt||'');return Number.isFinite(t)&&Math.abs(Date.now()-t)<WORKER_FRESH_MS;};

async function ack(){
 if(!service||!state?.enabled)return;const signature=E.stable([state.mode,state.settingsRevision,state.revision,state.controlledItemIds,BRIDGE_VERSION]);if(ackSent===signature)return;
 try{const key='gieo_engine2_device_'+service.storeId;let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}await service.sub('devices').doc(id).set({storeId:service.storeId,protocolVersion:1,inventoryVersion:UnitEngine.VERSION,controlRevision:state.revision||0,settingsRevision:state.settingsRevision||0,bridgeVersion:BRIDGE_VERSION,storeVersion:UnitEngine2Store.VERSION||null,ackedAt:new Date(UnitEngine.clock.now()).toISOString()},{merge:true});ackSent=signature;}catch(e){console.warn('Engine2 chưa xác nhận thiết bị',e.message);}
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
// [v3-B] Hộp thư riêng cho lệnh «POS tự ghi» — E.outbox (unit_engine2_v1, đã phát hành, dùng chung với worker) chỉ nhận các loại lệnh cũ.
const fbKey=()=>'gieo_engine2_fallback_v3_'+(service?.storeId||'');
const fbRead=()=>{try{const v=JSON.parse(localStorage.getItem(fbKey())||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}};
const fbWrite=rows=>{try{localStorage.setItem(fbKey(),JSON.stringify(rows.slice(-100)));}catch(e){}};
async function fbDeliver(c){await service.posFallback(c.taskId,c.staff,c.code,c.detail);fbWrite(fbRead().filter(x=>x.id!==c.id));}
async function flush(){if(flushing||!service||!journal)return;flushing=true;try{for(const c of journal.read().slice(0,10))await deliver(c);for(const c of fbRead().slice(0,10))await fbDeliver(c);}catch(e){console.warn('Engine2 còn việc chờ đồng bộ',e.message);}finally{flushing=false;}}

// ── Việc Engine 2 cần cân ở cuối ca ───────────────────────────────────────────
// Trả {controlled:[itemId], m0:{itemId→taskId}}. Kiểm soát: đọc từ bản cấu hình đã nghe sẵn (0 lượt đọc thêm). Cân ngẫu nhiên M0:
// một truy vấn việc đang chờ, nhớ 15 giây để các lần dựng danh sách liên tiếp không đọc lại.
async function wanted(day){
 const now=Date.now();
 if(taskCache.day===day&&now-taskCache.at<TASK_CACHE_MS&&taskCache.promise)return taskCache.promise;
 const p=(async()=>{
  const m0={},m3={};
  // [v5-B3] Worker (store ≥ 5) công bố sẵn việc cân ngẫu nhiên / độc lập đang chờ trên tài liệu điều khiển — 0 lượt đọc.
  const plan=state&&Number(state.workerStoreVersion)>=5&&state.e2Plan&&typeof state.e2Plan==='object'?state.e2Plan:null;
  if(plan)return {controlled:[...(state.controlledItemIds||[])],m0:{...(plan.m0||{})},m3:JSON.parse(JSON.stringify(plan.m3||{}))};
  try{
   const s=await service.sub('tasks').where('pending','==',true).orderBy('createdAt','desc').limit(40).get({source:'server'});
   s.docs.forEach(d=>{const t=d.data();if(t.kind!=='weigh_open_units'||!t.itemId)return;if((t.sampling==='random_m0'||t.sampling==='resync')&&!m0[t.itemId])m0[t.itemId]=d.id;else if(t.sampling==='m3'&&!m3[t.itemId])m3[t.itemId]={taskId:d.id,excludeStaffId:t.excludeStaffId||''};});
  }catch(e){console.warn('Engine2: chưa đọc được việc cân ngẫu nhiên / độc lập',e.message);}
  return {controlled:[...(state.controlledItemIds||[])],m0,m3};
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
   // [v5] đọc RT các món thiếu SONG SONG (trước: lần lượt từng món); thứ tự dòng giữ theo thứ tự món.
   const cand=missing.filter(id=>!done.has(id)).map(id=>(KHO_ITEMS_CACHE||[]).find(x=>x.id===id)).filter(it=>it&&it.stockManaged!==false&&shiftWeighIsTemItemPOS(it));
   const nodes=await Promise.all(cand.map(it=>UnitEngine.units.ref(it.id).once('value')));
   cand.forEach((it,i)=>{const line=shiftWeighTemLinePOS(it,nodes[i].val(),[]);if(line)extra.push(line);});   // lý do rỗng: không giải thích
  }catch(e){console.warn('Engine2: chưa dựng được dòng cân bổ sung',e.message);extra=[];}
 }
 const all=lines.concat(extra);
 const controlledIds=[];
 for(const l of all){
  if(controlled.has(l.itemId)){controlledIds.push(l.itemId);tasks.set(l.itemId,E.key('day_close',day,l.itemId,CYCLE));}
  else if(m0[l.itemId])tasks.set(l.itemId,m0[l.itemId]);
 }
 // [v5-B1] chỉ hỏi cho món CHƯA biết đã có việc hôm nay; một transaction cho tất cả.
 const need=controlledIds.filter(id=>!ensured.has(day+'|'+id));
 if(need.length){try{const have=await service.ensureCloseTasks(day,CYCLE,need);for(const id of (Array.isArray(have)?have:[]))ensured.add(day+'|'+id);}catch(e){console.warn('Engine2: chưa tạo việc cân cuối ngày',e.message);return lines;}}
 if(waitDay!==day){waitDay=day;}waitUsed=0;        // [v5-B5] mỗi lần dựng danh sách = một lần kết ca mới → trần chờ tính lại
 for(const l of all)if(tasks.has(l.itemId))l.e2={taskId:tasks.get(l.itemId)};
 return extra.length?all.sort(byName):all;
}

// ── Đầu ca: không làm việc thừa ─────────────────────────────────────────────────
// Người kết ca hôm trước = pha chế có giờ ra muộn nhất của ngày làm việc gần nhất có ca (lùi tối đa 7 ngày). Nhớ theo ngày làm việc.
let closerCache={day:'',id:''};
async function previousCloser(day){
 if(closerCache.day===day)return closerCache.id;
 // [v5-B4] nhớ ở máy theo ngày: tải lại trang trong ngày không đọc lại (chỉ nhớ khi ĐÃ tìm thấy người kết ca).
 const lsKey='gieo_engine2_closer_'+(service?.storeId||(typeof POS_STORE!=='undefined'&&POS_STORE.storeId)||'');
 try{const v=JSON.parse(localStorage.getItem(lsKey)||'null');if(v&&v.day===day&&v.id){closerCache={day,id:v.id};return v.id;}}catch(e){}
 let id='';
 for(let i=1;i<=7&&!id;i++){
  const d=posDateKey(new Date(Date.parse(day+'T12:00:00+07:00')-i*86400000));
  const snap=await fstore.collection('employee_shifts_gieogieo').where('businessDate','==',d).get();
  id=S.lastCloser(snap.docs.map(x=>x.data()));
 }
 closerCache={day,id};if(id)try{localStorage.setItem(lsKey,JSON.stringify({day,id}));}catch(e){}
 return id;
}
async function openersNow(){await loadEmployeeShiftsTodayCache();return S.openBaristas(_employeeShiftsTodayCache);}
const businessDay=()=>(typeof shiftState!=='undefined'&&shiftState.businessDate)||posDateKey();
// true = người mở ca duy nhất chính là người kết ca hôm trước → không được yêu cầu cân / đếm bất cứ thứ gì ở đầu ca.
async function sameOperatorOpening(){
 if(!S||typeof loadEmployeeShiftsTodayCache!=='function')return false;
 try{const openers=await openersNow();if(openers.length!==1)return false;return S.sameOperator(openers,await previousCloser(businessDay()));}
 catch(e){console.warn('Engine2: chưa xác định người mở ca, hỏi như thường —',e.message);return false;}
}
// Cân độc lập (M3): chỉ khi có người KHÁC người cân trước đang mở ca. Số cân của người nhận ca chính là phép đo độc lập — dòng nằm trong
// danh sách kiểm kê đầu ca sẵn có, không việc riêng, không cân thêm lần nào.
async function extendOpenLines(lines){
 if(!active()||!service||!S)return lines;
 const day=businessDay();let w;try{w=await wanted(day);}catch(e){return lines;}
 const ids=Object.keys(w.m3||{});if(!ids.length)return lines;
 try{
  const openers=await openersNow(),have=new Set(lines.map(l=>l.itemId));
  await ensureKhoItemsPOS();
  const snap=await fstore.collection('daily_openings_gieogieo').doc(day).get();
  const done=new Set(((snap.exists?snap.data().shiftInventoryOpenLines:[])||[]).map(l=>l.itemId));
  const extra=[];
  for(const id of ids){
   const t=w.m3[id];if(have.has(id)||done.has(id)||!S.independentPossible(openers,t.excludeStaffId))continue;
   const it=(KHO_ITEMS_CACHE||[]).find(x=>x.id===id);if(!it||it.stockManaged===false||!shiftWeighIsTemItemPOS(it))continue;
   const line=shiftWeighTemLinePOS(it,(await UnitEngine.units.ref(id).once('value')).val(),[]);if(!line)continue;
   line.e2={taskId:t.taskId};extra.push(line);
  }
  return extra.length?lines.concat(extra).sort(byName):lines;
 }catch(e){console.warn('Engine2: chưa dựng được dòng cân độc lập đầu ca',e.message);return lines;}
}

// ── Đưa số cân của dòng POS cho Engine 2 ───────────────────────────────────────
// Thư viện bì: dụng cụ + bao gói gốc (hai bảng dùng chung), nhớ 60 giây — đọc lại mỗi lần kết ca, không đọc theo từng lần cân.
async function vessels(){
 const now=Date.now();if(vesselCache.list&&now-vesselCache.at<VESSEL_CACHE_MS)return vesselCache;
 const [v,p]=await Promise.all([fstore.collection('prep_vessels_gieogieo').get(),fstore.collection('ingredient_original_packs_gieogieo').get()]);
 vesselCache={at:now,list:v.docs.map(d=>({...d.data(),id:d.id})),packs:p.docs.map(d=>({...d.data(),id:d.id}))};return vesselCache;
}
const uuid=()=>window.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2);
// Trả {ok:true} khi Engine 2 đã nhận lượt cân (dòng được đánh dấu engine2Owner). Không chắc chắn → {ok:false, code, detail}: POS ghi như
// thường và mã lý do đi vào store.posFallback (đóng việc Engine 2, quanlygieo2 xem được vì sao).
const no=(code,detail='')=>({ok:false,code,detail});
async function engage(l,day,staff){
 if(l.engine2Owner)return {ok:true};
 if(!active()||!service)return no('not_active');
 if(!workerFresh())return no('worker_stale',state?.workerHeartbeatAt?'dấu gần nhất '+state.workerHeartbeatAt:'chưa có dấu');
 if(!staff?.id)return no('request_failed','thiếu người cân');
 const units=l.units||[];
 if(!units.length)return no('no_open_units');
 if(units.some(u=>u.state==='missing'||u.gone))return no('missing_unit',units.filter(u=>u.state==='missing'||u.gone).map(u=>u.code).join(', '));
 if(units.some(u=>u.weighed==null||u.baseline==null||!Number.isFinite(Date.parse(u.countedAt||''))))return no('baseline_pending');
 // Lệch lớn: để POS hỏi xác nhận như cũ trước; chỉ nhận lượt sau khi nhân viên đã xác nhận.
 const large=units.some(u=>Math.abs(u.baseline-u.weighed)>(u.capacity>0?u.capacity:Math.max(Math.abs(u.baseline),1))*.25);
 if(large&&!l._devAck)return no('large_unconfirmed');
 const item=(typeof KHO_ITEMS_CACHE!=='undefined'?KHO_ITEMS_CACHE:[]).find(x=>x.id===l.itemId);
 if(!item)return no('no_item');
 const unit=String(item.unit||'').toLowerCase(),liquid=unit==='ml'||unit==='l';
 if(liquid&&!(Number(item.densityGPerMl)>0))return no('no_density');
 // [v5-B5] Hết trần chờ của lần kết ca này → không gọi mạng nữa, POS tự ghi ngay.
 if(waitUsed>=WAIT_BUDGET_MS)return no('request_failed','quá thời gian chờ');
 const t0=Date.now(),left=()=>WAIT_BUDGET_MS-waitUsed-(Date.now()-t0);
 try{
  const lib=await timed(vessels(),left()),look={vessel:async id=>lib.list.find(x=>x.id===id)||null,pack:async id=>lib.packs.find(x=>x.id===id)||null};
  for(const u of units){
   if(!Array.isArray(u.weighings)||!u.weighings.length)return no('manual_entry',u.code);   // số gõ tay không có dụng cụ → Engine 2 không kiểm được bì
   let net;try{net=E.measurement(u.weighings,item).net;}catch(e){return no('net_mismatch',u.code+': '+e.message);}
   if(Math.abs(net-Number(u.weighed))>0.015)return no('net_mismatch',u.code);
   if(Number(u.capacity)>0&&u.weighed>Number(u.capacity)*1.1)return no('over_capacity',u.code);
   for(const w of u.weighings){const t=await UnitEngine2Store.tareOf(w,look);if(t===null||Math.abs(t-Number(w.tareG))>1e-9)return no('unknown_tare',u.code+' · '+(w.vesselName||w.vesselId||''));}
  }
  const finishedAt=new Date(UnitEngine.clock.now()).toISOString(),times=units.map(u=>u.countedAt).sort();
  const line={itemId:l.itemId,itemName:l.itemName,unit:item.unit,mode:'tem',businessDate:day,sessionId:l._e2Session||(l._e2Session=uuid()),
   startedAt:times[0],finishedAt,
   units:units.map(u=>({id:u.id,code:u.code||'',openedAt:u.openedAt||0,capacity:Number(u.capacity)||0,state:'confirmed',confirmVia:u.confirmVia||'scan',manualReason:u.manualReason||'',
    weighed:Number(u.weighed),weighings:u.weighings,baseline:Number(u.baseline),baselineSig:u.baselineSig||'',countedAt:u.countedAt,seq:u.seq||0,gone:false,checkpointSnapshot:null})),
   densitySnapshot:liquid?Number(item.densityGPerMl):null,largeDeviationConfirmed:!!large};
  // [v5-B2] một vòng mạng: xin lượt + xếp hàng + nhận kết quả. [v5-B5] quá trần → POS tự ghi; lượt được nhận MUỘN thì rút lại.
  const who={id:staff.id,fullName:staff.fullName||''},pending=service.requestMeasurementEx(l.e2.taskId,line,who);
  let r;try{r=await timed(pending,left());}
  catch(e){
   if(e&&e.code==='E2_WAIT'){l._e2Timeout={mid:E.key(l.e2.taskId,l.itemId,line.sessionId)};l._e2Late=pending.then(x=>x&&x.status==='queued'&&!x.existed?service.withdraw(x.id,who,'quá thời gian chờ').then(ok=>{if(ok)l._e2Reported=true;}):null).catch(()=>{});
    return no('request_failed','quá thời gian chờ');}
   throw e;
  }
  if(!r||!r.id)return no('request_failed','không nhận được lượt cân');
  if(r.status==='rejected')return no('rejected',r.lastError||'');
  if(!r.operationId)return no('request_failed','lượt cân thiếu mã thao tác');
  l.engine2Owner=true;l.engine2OpId=r.operationId;return {ok:true};
 }catch(e){console.warn('Engine2: không nhận lượt cân, POS ghi như thường —',e.message);return no('request_failed',e.code==='E2_WAIT'?'quá thời gian chờ':e.message);}
 finally{waitUsed+=Date.now()-t0;}
}
// [v5-B5] POS tự ghi sau khi hết trần chờ nhưng kho báo mã vừa đổi: kiểm biên nhận kho của CHÍNH lượt Engine 2 này (mã lượt tính được
// tại máy). Có biên nhận = worker đã áp đúng số cân này → dòng thuộc Engine 2: trả lại số vừa cân, ghi nốt phần sổ bằng mã lượt đó
// (kho nhận ra biên nhận, không áp lần hai). Không có → để lỗi «tải lại mã» đi tiếp như thường.
async function adopt(l,keep){
 const opId='e2sw_'+(await E.digest(l._e2Timeout.mid)).slice(0,32);
 const doc=await timed(service.sub('operations').doc(opId).get(),2000);
 if(!doc.exists||!doc.data().inventoryResult||doc.data().measurementId!==l._e2Timeout.mid)return false;
 l.units.forEach((u,i)=>{if(keep[i])Object.assign(u,keep[i]);});
 l.engine2Owner=true;l.engine2OpId=opId;l._e2Reported=true;l._e2Why=null;l.needReload=false;
 return true;
}
// [v5-B5] Chờ có trần: quá hạn → lỗi mã E2_WAIT (lời hứa gốc vẫn chạy tiếp ở nền, nơi gọi tự xử lý kết quả muộn).
function timed(p,ms){
 if(!(ms>0))return Promise.reject(Object.assign(new Error('quá thời gian chờ'),{code:'E2_WAIT'}));
 let h;return Promise.race([p,new Promise((_,rej)=>{h=setTimeout(()=>rej(Object.assign(new Error('quá thời gian chờ'),{code:'E2_WAIT'})),ms);})]).finally(()=>clearTimeout(h));
}
// [v3-B] Dòng có việc Engine 2 nhưng POS đã tự ghi → đóng việc kèm lý do. Hộp thư máy giữ lệnh khi mất mạng (gửi bù lúc có mạng).
// Không bao giờ chặn kết ca: mọi lỗi chỉ ghi console.
async function reportFallback(l,staff){
 if(!l?.e2?.taskId||l.engine2Owner||l._e2Reported||!service||typeof service.posFallback!=='function')return;
 if(l._e2Late){try{await l._e2Late;}catch(e){}if(l._e2Reported)return;}   // [v5-B5] lượt nhận muộn đã được rút lại kèm lý do
 l._e2Reported=true;
 const why=l._e2Why||no('request_failed','không rõ');
 const c={id:E.key('pos_fallback',l.e2.taskId),taskId:l.e2.taskId,staff:{id:staff?.id||'',fullName:staff?.fullName||''},code:why.code,detail:String(why.detail||'').slice(0,200)};
 const rows=fbRead();if(!rows.some(x=>x.id===c.id))fbWrite([...rows,c]);
 try{await fbDeliver(c);}catch(e){console.warn('Engine2: chưa gửi được lý do POS tự ghi, sẽ gửi bù —',e.message);}
}

const LIST_WAIT_MS=3000,capped=(p,fallback)=>timed(Promise.resolve(p),LIST_WAIT_MS).catch(e=>{if(!(e&&e.code==='E2_WAIT'))console.warn('Engine2:',e&&e.message);return fallback;});
function install(){
 // 1) Danh sách cân cuối ca = danh sách sẵn có + món Engine 2 điều phối.
 const compute=window.computeShiftInventoryCountLinesPOS;
 if(typeof compute==='function')window.computeShiftInventoryCountLinesPOS=async function(...args){
  init();
  // [v5-B5] Phần Engine 2 thêm vào lúc DỰNG danh sách cũng có trần chờ (LIST_WAIT_MS): quá trần → trả danh sách sẵn có của POS
  // (đầu ca: hỏi như thường) — mở màn cân không bao giờ treo vì Engine 2.
  if(args[0]==='open'){if(await capped(sameOperatorOpening(),false))return [];const base=await compute.apply(this,args);return capped(extendOpenLines(base),base);}
  const lines=await compute.apply(this,args);
  return args[0]==='close'?capped(extendCloseLines(lines),lines):lines;
 };
 // Đếm giao ca đầu ca (đối chiếu số ca tối hôm qua) cũng không hỏi khi chính người đó đã kết ca hôm trước.
 const handover=window.computeHandoverOpenLinesPOS;
 if(typeof handover==='function')window.computeHandoverOpenLinesPOS=async function(...args){if(await capped(sameOperatorOpening(),false))return [];return handover.apply(this,args);};
 // 2) Ghi số cân: dòng của Engine 2 đi qua mã lượt của Engine 2, kho vẫn do chính POS áp ngay (đồng bộ, như mọi dòng khác).
 const shift=window.UnitEngine&&UnitEngine.shift;
 if(shift&&typeof shift.applyLine==='function'){
  const apply=shift.applyLine;
  shift.applyLine=async function(l,day,staff,seed){
   if(l&&l.e2&&!l._applied){try{const r=await engage(l,day,staff);l._e2Why=r.ok?null:r;}catch(e){l._e2Why=no('request_failed',e&&e.message);console.warn('Engine2',e&&e.message);}}
   // [v5-B5] Giữ bản chụp số cân: nếu lượt xin trễ đã tới máy chủ và worker ÁP KHO TRƯỚC POS, kho báo «mã vừa được chỉnh ở nơi khác»
   // và xoá số vừa cân — không được bắt nhân viên cân lại một lần cân đã được ghi.
   const keep=l&&l._e2Timeout&&!l.engine2Owner?l.units.map(u=>({weighed:u.weighed,baseline:u.baseline,baselineSig:u.baselineSig,weighings:u.weighings,countedAt:u.countedAt,state:u.state})):null;
   let out;
   try{out=await apply.call(this,l,day,staff,seed);}
   catch(e){
    if(keep&&e&&e.code==='SW_RELOAD'){const got=await adopt(l,keep).catch(()=>false);if(got){out=await apply.call(this,l,day,staff,seed);return out;}}
    // Số sổ đã đổi giữa lúc cân và lúc ghi (cần tải lại mã): lượt Engine 2 đã xin không còn đúng → xin lại ở lần ghi sau.
    if(l&&l.engine2Owner&&e&&e.code==='SW_RELOAD'){l.engine2Owner=false;delete l.engine2OpId;l._e2Session=null;}
    throw e;
   }
   // Kho đã ghi xong mà dòng không giao được cho Engine 2 → đóng việc Engine 2 kèm lý do (không chờ, không chặn).
   if(l&&l.e2&&!l.engine2Owner)reportFallback(l,staff).catch(()=>{});
   return out;
  };
 }
 // 3) Không giải thích với nhân viên: bỏ dòng «Cần cân hôm nay vì …» (dữ liệu lý do vẫn nằm trong dòng, chỉ không hiển thị).
 const lineHTML=window.shiftWeighLineHTML;
 if(typeof lineHTML==='function')window.shiftWeighLineHTML=function(l,i){return l&&l.reasons&&l.reasons.length?lineHTML.call(this,{...l,reasons:[]},i):lineHTML.call(this,l,i);};
 window.addEventListener('online',flush);
 if(typeof firebase!=='undefined'&&typeof firebase.auth==='function'&&typeof firebase.auth().onAuthStateChanged==='function')firebase.auth().onAuthStateChanged(u=>{if(u)init();else{unsubscribe?.();unsubscribe=null;service=null;state=null;}});
}
window.GieoEngine2POS={flush,_engage:engage,_extend:extendCloseLines,_workerFresh:()=>workerFresh(),_resetCache:()=>{taskCache={day:'',at:0,promise:null};},_budget:()=>({used:waitUsed,limit:WAIT_BUDGET_MS}),VERSION:BRIDGE_VERSION};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
