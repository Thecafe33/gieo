/* POS bridge for Engine2. One small control subscription per bound store.
 * No hook on order entry/payment. Measurement commands are durable before stock changes. */
(function(){
'use strict';
if(!window.UnitEngine2||!window.UnitEngine2Store)return;
let service=null,state=null,rows=[],node=null,unsubscribe=null,view=null,library=[],continuation=null,loading=null,phaseHandoff=false,closeCycle='',closeItemIds=[],journal=null,flushing=false;
const E=window.UnitEngine2,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=()=>state?.enabled&&state.mode==='active'&&state.protocolVersion===1&&state.fleetConfirmed===true;
const visible=el=>!el.closest('.screen')||el.closest('.screen').classList.contains('active');
let ackSent='',opening=0;
async function ack(){
 if(!service||!state?.enabled)return;const signature=E.stable([state.mode,state.settingsRevision,state.revision,state.controlledItemIds]);if(ackSent===signature)return;
 try{const key='gieo_engine2_device_'+service.storeId;let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}await service.sub('devices').doc(id).set({storeId:service.storeId,protocolVersion:1,inventoryVersion:UnitEngine.VERSION,controlRevision:state.revision||0,settingsRevision:state.settingsRevision||0,ackedAt:new Date(UnitEngine.clock.now()).toISOString()},{merge:true});ackSent=signature;}catch(e){console.warn('Engine2 chưa xác nhận thiết bị',e.message);}
}
function init(){
 if(service||typeof POS_STORE==='undefined'||!POS_STORE.storeId||!window.UnitEngine2Store||!window.GieoData)return;
 const store=POS_STORE.storeId;service=UnitEngine2Store.create({storeId:store,fstore,collection:k=>GieoData.collFor(k+'_gieogieo',store)});journal=E.outbox(localStorage,store);
 unsubscribe=service.base.onSnapshot(s=>{const old=state;state=s.exists?s.data():null;mount();ack();if(node&&document.body.contains(node)&&visible(node)&&old?.revision!==state?.revision)load().catch(()=>{});if(active())flush();},e=>{if(node)node.textContent='Chưa đọc được kiểm soát tự động. Tiếp tục bán hàng; mở lại để thử.';console.warn('Engine2 control',e);});
}
async function deliver(command){
 const p=command.payload;
 if(command.kind==='measurement')await service.requestMeasurement(p.taskId,p.line,p.staff);
 else if(command.kind==='exception')await service.exception(p.taskId,p.staff,p.reason);
 else{await service.ensureCloseTasks(p.day,p.cycle,p.itemIds);for(const id of p.itemIds)await service.exception(E.key('day_close',p.day,id,p.cycle),p.staff,p.reason);}
 journal.remove(command.id);
}
async function flush(){if(flushing||!service||!journal)return;flushing=true;try{for(const c of journal.read().slice(0,10))await deliver(c);}catch(e){console.warn('Engine2 còn việc chờ đồng bộ',e.message);}finally{flushing=false;}}
async function durable(command){journal.put(command);const saved=journal.read().find(c=>c.id===command.id);try{await deliver(saved);return true;}catch(e){toast('Đã giữ công việc trên máy để đồng bộ lại. '+e.message);return false;}}
function mount(){
 if(!active()){document.getElementById('e2Work')?.remove();return;}
 const inModal=document.querySelector('#e2Modal #e2Tasks');if(inModal){node=inModal;return;}
 const box=document.getElementById('shiftBody');if(!box||!visible(box))return;const existing=box.querySelector('#e2Work');if(existing){node=existing.querySelector('#e2Tasks');return;}
 const host=document.createElement('section');host.id='e2Work';host.className='kc-card';host.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><b>Kiểm soát nguyên liệu</b><button class="kc-btn" style="width:auto;background:#e23a5d;color:white" onclick="GieoEngine2POS.load()">Xem việc cân</button></div><p>Hệ thống giao cân theo nguyên liệu. Ca sau nhận việc còn dở.</p><div id="e2Tasks"></div>';box.prepend(host);node=host.querySelector('#e2Tasks');
}
async function load(){
 init();mount();if(!service||!node)return;if(loading)return loading;
 const target=node;loading=(async()=>{target.textContent='Đang tải…';try{
  const s=await service.sub('tasks').where('pending','==',true).orderBy('createdAt','desc').limit(40).get({source:'server'});
  if(target!==node||!document.body.contains(target))return;
  rows=s.docs.map(d=>({...d.data(),id:d.id}));target.innerHTML=rows.map((r,i)=>'<article class="e2-task"><div><b>'+esc(r.itemName||r.itemId)+'</b><p>'+esc(r.reason||'Lấy mốc cân để theo dõi hao hụt')+'</p>'+(r.lastError?'<p class="e2-error">'+esc(r.lastError)+'</p>':'')+'<small>'+esc(r.status==='exception_recorded'?'Đã ghi tình trạng — việc vẫn được bàn giao':r.status==='in_progress'?'Đang xử lý số cân':'Pha chế trong ca thực hiện')+'</small></div><button class="kc-btn" onclick="GieoEngine2POS.open('+i+')">'+(r.status==='in_progress'?'Xem kết quả':'Cân / kiểm tra')+'</button></article>').join('')||'<p>Không có nhiệm vụ cân đang chờ.</p>';
  if(s.docs.length===40)target.insertAdjacentHTML('beforeend','<p>Đang hiện 40 việc mới nhất; xem đầy đủ trong quanlygieo2.</p>');
 }catch(e){if(target===node)target.textContent='Chưa tải được công việc: '+e.message;}})().finally(()=>{loading=null;});return loading;
}
function modal(title,body){
 close(false);const el=document.createElement('div');el.id='e2Modal';el.className='e2-overlay';el.innerHTML='<section role="dialog" aria-modal="true" aria-label="'+esc(title)+'" class="e2-dialog"><header><h2>'+esc(title)+'</h2><button type="button" aria-label="Đóng" onclick="GieoEngine2POS.close()">×</button></header><div class="e2-body">'+body+'</div><footer id="e2Footer"></footer></section>';document.body.append(el);
 el.addEventListener('click',e=>{if(e.target===el)close();});
}
function close(refresh=true){const detail=!!view;document.getElementById('e2Modal')?.remove();view=null;if(refresh&&detail&&continuation){showCloseSummary().catch(e=>toast(e.message));return;}if(refresh&&continuation&&!detail)continuation=null;if(refresh){mount();load().catch(()=>{});}}
async function staff(){const who=await resolveStaffPinWorkedToday('e2StaffPin');if(!who)return null;if(typeof _employeeShiftsTodayCache!=='undefined'&&!_employeeShiftsTodayCache.some(s=>s.employeeId===who.id&&E.isBarista(s))){toast('Người thực hiện cần có chức năng pha chế trong ca đã làm');return null;}return who;}
async function open(i){
 const token=++opening,task=rows[i];if(!task)return;
 if(task.status==='in_progress'){await load();toast('Số cân đã gửi. Bộ xử lý sẽ xác nhận kết quả; không gửi lại lượt mới.');return;}
 try{
  const [it,rt,v,proof]=await Promise.all([fstore.collection('inventory_items_gieogieo').doc(task.itemId).get(),UnitEngine.units.ref(task.itemId).once('value'),fstore.collection('prep_vessels_gieogieo').get(),task.caseId?service.sub('cases').doc(task.caseId).get():Promise.resolve(null)]);
  if(token!==opening)return;
  if(!it.exists)throw Error('Chưa đọc được nguyên liệu');
  library=v.docs.map(d=>({...d.data(),id:d.id})).filter(v=>v.active!==false);
  const units=Object.entries(rt.val()||{}).filter(([id,u])=>id!=='__prepLock'&&u&&!u.finishedDebt&&!u.discardPending).map(([id,u])=>({id,code:u.code||id,openedAt:u.openedAt,capacity:Number(u.capacity)||0}));
  const item={...it.data(),id:task.itemId};
  const reason=proof?.exists?proof.data():null;
  const evidence=reason?'<details><summary>Vì sao cần cân? Xem khoản hao hụt đã phân bổ</summary><p>'+(reason.status==='voided'?'Nguồn ban đầu đã sửa/hủy; kiểm soát vẫn được giữ để có đủ mốc đo.':'Khoản gốc '+esc(reason.quantity)+' '+esc(reason.unit||'')+'. '+esc(reason.explanation||''))+'</p>'+(reason.allocations||[]).map(a=>'<p><b>'+esc(a.employeeName||a.employeeId)+'</b> · '+esc(a.qty)+' '+esc(reason.unit||'')+'</p>').join('')+'<p>Phần này thuộc nhóm lịch sử của khoản gốc. Nhận việc cân không chuyển khoản mất đó sang ca nhận việc; không tự trừ lương.</p></details>':'';
  modal(item.name||task.itemName,evidence+'<p>Cân đúng từng mã đang dùng. Chọn dụng cụ và nhập số tổng trên cân; hệ thống tự trừ bì.</p>'+(units.length?'<div class="e2-unit-grid">'+units.map((u,j)=>'<article class="e2-unit"><h3>'+esc(u.code)+'</h3><label>Dụng cụ đựng<select id="e2Vessel'+j+'">'+options(item)+'</select></label><label>Tổng trên cân (g)<input id="e2Gross'+j+'" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Nhập số cân"></label><p class="e2-net" id="e2Net'+j+'"></p></article>').join('')+'</div>':'<p><b>Không có mã đang mở.</b> Gửi kiểm tra để hệ thống đối soát, không tạo số cân 0.</p>')+
   (units.length&&['ml','l'].includes(String(item.unit).toLowerCase())&&!(Number(item.densityGPerMl)>0)?'<fieldset><legend>Đo tỷ trọng cho nguyên liệu này</legend><p>Đong một mẫu, cân khối lượng ròng của chính mẫu đó.</p><div class="e2-unit-grid"><label>Khối lượng ròng mẫu (g)<input id="e2DensityG" type="number" min="0" step="0.1"></label><label>Thể tích mẫu (ml)<input id="e2DensityMl" type="number" min="0" step="0.1"></label></div></fieldset>':'')+
   '<details><summary>Chưa có dụng cụ đúng? Thêm từ số bì đã cân</summary><div class="e2-unit-grid"><label>Tên dụng cụ<input id="e2NewName" placeholder="VD: Hũ thạch"></label><label>Bì dụng cụ rỗng (g)<input id="e2NewTare" type="number" min="0" step="0.1"></label></div><button class="kc-btn" onclick="GieoEngine2POS.addVessel()">Lưu dụng cụ đã đo bì</button></details><label>Tình trạng khi cần bàn giao<textarea id="e2Reason" placeholder="VD: hỏng cân, chưa có dụng cụ, không tìm thấy mã"></textarea></label><label>Mã PIN người thực hiện<input id="e2StaffPin" type="password" inputmode="numeric" autocomplete="off"></label><p id="e2Message" aria-live="polite"></p>');
  view={task,item,units,sessionId:(window.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2)),attempt:0};
  for(const el of document.querySelectorAll('#e2Modal input,#e2Modal select'))el.addEventListener('input',preview);
  document.getElementById('e2Footer').innerHTML='<button class="kc-btn e2-secondary" onclick="GieoEngine2POS.recordException()">Ghi tình trạng để bàn giao</button><button class="kc-btn e2-primary" onclick="GieoEngine2POS.submit()">'+(units.length?'Gửi số cân':'Xác nhận kiểm tra không có mã mở')+'</button>';
 }catch(e){toast('Chưa mở được việc cân: '+e.message);}
}
function preview(){
 if(!view)return;const item={...view.item},g=document.getElementById('e2DensityG'),ml=document.getElementById('e2DensityMl');if(g&&ml)item.densityGPerMl=Number(g.value)/Number(ml.value);
 for(let j=0;j<view.units.length;j++){const node=document.getElementById('e2Net'+j),gross=document.getElementById('e2Gross'+j)?.value,key=document.getElementById('e2Vessel'+j)?.value;node.textContent='';if(gross==='')continue;
  for(const v of library)for(const x of v.variants||[])if(E.key(v.id,x.id)===key)try{node.textContent='Ròng: '+E.measurement([{vesselId:v.id,variantId:x.id,tareG:x.tareG,grossG:gross}],item).net+' '+item.unit;}catch(e){node.textContent=e.message;}
 }
}
function options(item){const assigned=new Set(item.vesselIds||[]);return '<option value="">Chọn đúng dụng cụ / bì</option>'+library.slice().sort((a,b)=>Number(assigned.has(b.id))-Number(assigned.has(a.id))).flatMap(v=>(v.variants||[]).filter(x=>E.finite(x.tareG)&&Number(x.tareG)>=0).map(x=>'<option value="'+esc(E.key(v.id,x.id))+'">'+esc(v.name+' · '+(x.label||'')+' · bì '+x.tareG+' g')+'</option>')).join('');}
async function addVessel(){
 if(!view)return;const who=await staff();if(!who)return;const name=document.getElementById('e2NewName').value,tare=document.getElementById('e2NewTare').value;
 try{const id=await service.registerVessel(name,tare,who);const sn=await fstore.collection('prep_vessels_gieogieo').doc(id).get();library.push({...sn.data(),id});for(let j=0;j<view.units.length;j++){const el=document.getElementById('e2Vessel'+j),value=el.value;el.innerHTML=options(view.item);el.value=value||E.key(id,'measured');}document.getElementById('e2Message').textContent='Đã lưu dụng cụ và bì đo. Chọn đúng dụng cụ cho từng mã.';}catch(e){document.getElementById('e2Message').textContent=e.message;}
}
async function submit(){
 const v=view;if(!v||v.busy)return;if(v.command){v.busy=true;try{if(await durable(v.command)){close();toast('Đã đồng bộ số cân; kết quả được cập nhật trong công việc.');}else document.getElementById('e2Message').textContent='Số cân đã giữ trên máy, chưa đồng bộ được. Bạn có thể tiếp tục bán hàng hoặc ghi tình trạng bàn giao.';}finally{v.busy=false;}return;}const who=await staff();if(!who||view!==v)return;v.busy=true;
 try{
  const connected=await db.ref('.info/connected').once('value');if(connected.val()!==true)throw Error('Cần kết nối để lấy mốc sổ mới. Có thể ghi tình trạng bàn giao khi mất mạng.');
  const item={...v.item},densityProof=document.getElementById('e2DensityG')?{netG:document.getElementById('e2DensityG').value,volumeMl:document.getElementById('e2DensityMl').value}:null;
  if(densityProof){if(!(Number(densityProof.netG)>0&&Number(densityProof.volumeMl)>0))throw Error('Nhập đủ hai số đo tỷ trọng');item.densityGPerMl=Number(densityProof.netG)/Number(densityProof.volumeMl);}
  const units=[];
  for(const [j,u]of v.units.entries()){
   const selected=document.getElementById('e2Vessel'+j).value,gross=document.getElementById('e2Gross'+j).value;
   let vessel,variant;for(const x of library)for(const y of x.variants||[])if(E.key(x.id,y.id)===selected){vessel=x;variant=y;}
   if(!vessel||!variant)throw Error('Chọn đúng dụng cụ cho mã '+u.code);
   const weighing={vesselId:vessel.id,variantId:variant.id,vesselName:vessel.name,tareG:Number(variant.tareG),grossG:gross===''?null:Number(gross)};
   const measured=E.measurement([weighing],item);
   const snap=await UnitEngine.units.ref(item.id).child(u.id).once('value'),live=snap.val();
   if(!live||live.finishedDebt||live.discardPending)throw Error('Mã '+u.code+' đã đổi trạng thái — tải lại việc cân');
   units.push({...u,state:'confirmed',confirmVia:'measurement',manualReason:'',weighed:measured.net,weighings:[weighing],baseline:Number(live.unitBase),baselineSig:UnitEngine.shift.absSig(live),countedAt:new Date(UnitEngine.clock.now()).toISOString(),seq:0,gone:false,checkpointSnapshot:null});
   document.getElementById('e2Net'+j).textContent='Ròng: '+measured.net+' '+item.unit;
  }
  const large=units.some(u=>Math.abs(u.baseline-u.weighed)>(u.capacity>0?u.capacity:Math.max(Math.abs(u.baseline),1))*.25);
  if(large&&!v.attempt){v.attempt=1;for(let j=0;j<units.length;j++)document.getElementById('e2Gross'+j).value='';preview();throw Error('Số cân lệch lớn. Kiểm tra dụng cụ/bì và cân lại một lần trước khi gửi.');}
  v.command={id:E.key('measurement',v.task.id,v.sessionId),kind:'measurement',payload:{taskId:v.task.id,line:{itemId:item.id,itemName:item.name,unit:item.unit,mode:'tem',businessDate:posDateKey(),sessionId:v.sessionId,units,densitySnapshot:['ml','l'].includes(String(item.unit).toLowerCase())?Number(item.densityGPerMl):null,largeDeviationConfirmed:!!v.attempt,...(densityProof?{densityProof}: {})},staff:{id:who.id,fullName:who.fullName}}};
  const sent=await durable(v.command);if(!sent){for(const el of document.querySelectorAll('[id^=e2Gross],[id^=e2Vessel],#e2DensityG,#e2DensityMl'))el.disabled=true;document.getElementById('e2Message').textContent='Số cân đã giữ trên máy, chưa đồng bộ được. Bạn có thể tiếp tục bán hàng hoặc ghi tình trạng bàn giao.';return;}
  close();toast('Đã gửi số cân. Kết quả hoặc yêu cầu cân lại sẽ hiện trong công việc.');
 }catch(e){if(view===v)document.getElementById('e2Message').textContent=e.message;}finally{v.busy=false;}
}
async function recordException(){
 const v=view;if(!v)return;const who=await staff();if(!who||view!==v)return;
 const reason=document.getElementById('e2Reason')?.value.trim();if(!reason){toast('Ghi tình trạng thực tế để bàn giao');return;}
 try{await durable({id:E.key('exception',v.task.id,Date.now()),kind:'exception',payload:{taskId:v.task.id,staff:{id:who.id},reason}});close();toast('Đã ghi tình trạng và giữ việc để bàn giao.');}catch(e){toast('Chưa lưu được tình trạng: '+e.message);}
}
async function closePhase(next){
 init();if(!active()||!service)return next();closeCycle=Date.now()+'_'+Math.random().toString(36).slice(2);closeItemIds=[...(state.controlledItemIds||[])];continuation=next;try{await service.ensureCloseTasks(posDateKey(),closeCycle);}catch(e){toast('Chưa đồng bộ việc cân; có thể ghi tình trạng để bàn giao.');}await showCloseSummary();
}
async function showCloseSummary(){
 modal('Cân nguyên liệu trước bàn giao','<p>Hoàn thành việc cân. Khi có sự cố, ghi tình trạng để bàn giao và tiếp tục đóng ca.</p><div id="e2Tasks"></div><label>Tình trạng khi cần bàn giao<textarea id="e2Reason" placeholder="Ghi sự cố thực tế để ca sau tiếp tục"></textarea></label><label>Mã PIN người bàn giao<input id="e2StaffPin" type="password" inputmode="numeric" autocomplete="off"></label>');node=document.getElementById('e2Tasks');await load();
 document.getElementById('e2Footer').innerHTML='<button class="kc-btn e2-secondary" onclick="GieoEngine2POS.resumeWithException()">Ghi sự cố và tiếp tục</button><button class="kc-btn e2-primary" onclick="GieoEngine2POS.resumeClose()">Tiếp tục với kết quả đã ghi</button>';
}
async function resumeClose(){
 if(!continuation||!service)return;let s;try{const cfg=await service.config(),extra=(cfg.controlledItemIds||[]).filter(id=>!closeItemIds.includes(id));if(extra.length){closeItemIds.push(...extra);await service.ensureCloseTasks(posDateKey(),closeCycle,extra);await showCloseSummary();toast('Có nguyên liệu vừa được bật cân. Kiểm tra việc mới trước khi bàn giao.');return;}s=await service.sub('tasks').where('closeCycle','==',closeCycle).get({source:'server'});}catch(e){toast('Chưa đọc được kết quả. Ghi sự cố để tiếp tục bàn giao.');return;}
 if(s.docs.length<closeItemIds.length||s.docs.some(d=>!['done','superseded','exception_recorded','in_progress'].includes(d.data().status))){toast('Còn việc chưa cân. Mở từng việc để cân hoặc ghi tình trạng bàn giao.');return;}
 const next=continuation;continuation=null;phaseHandoff=true;close(false);await next();
}
async function resumeWithException(){
 if(!continuation)return;const who=await staff();if(!who)return;const reason=document.getElementById('e2Reason')?.value.trim();if(!reason){toast('Ghi tình trạng thực tế để ca sau tiếp tục');return;}
 try{await durable({id:E.key('close_exception',closeCycle),kind:'close_exception',payload:{day:posDateKey(),cycle:closeCycle,itemIds:closeItemIds,staff:{id:who.id},reason}});const next=continuation;continuation=null;phaseHandoff=true;close(false);await next();}catch(e){toast('Chưa lưu được việc bàn giao: '+e.message);}
}
function install(){
 const style=document.createElement('style');style.textContent='.e2-overlay{position:fixed;inset:0;z-index:12000;background:#2d172b66;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)}.e2-dialog{background:linear-gradient(135deg,#fbe2e9,#fff4f7);color:#211c20;border:1px solid white;border-radius:30px;width:min(1000px,100%);max-height:90dvh;display:flex;flex-direction:column;box-shadow:0 24px 80px #36182744;overflow:hidden}.e2-dialog header,.e2-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;flex-shrink:0}.e2-dialog h2{font-size:22px;margin:0}.e2-dialog header button{border:0;border-radius:50%;background:#fff9;font-size:28px;width:42px;height:42px;cursor:pointer}.e2-body{overflow:auto;overscroll-behavior:contain;padding:0 22px 18px}.e2-unit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.e2-unit,.e2-task{background:white;border-radius:22px;padding:16px;margin:12px 0}.e2-task{display:flex;justify-content:space-between;gap:12px;align-items:center}.e2-task p{margin:8px 0}.e2-task .kc-btn{width:auto;min-width:130px;background:#e23a5d;color:white}.e2-unit:only-child{grid-column:1/-1}.e2-dialog label{display:block;font-size:15px;font-weight:650;margin:12px 0}.e2-dialog input,.e2-dialog select,.e2-dialog textarea{display:block;width:100%;box-sizing:border-box;background:white!important;color:#211c20!important;border:1px solid #dbbdc9;border-radius:14px;padding:12px;margin-top:7px;font-size:17px;min-height:48px}.e2-dialog details,.e2-dialog fieldset{padding:14px;border:1px solid #e3bfce;border-radius:18px;margin:14px 0}.e2-dialog footer .kc-btn{width:auto;flex:1}.e2-primary{background:#e23a5d;color:white}.e2-secondary{background:white;color:#a31a45;border:1px solid #e7b5c6}.e2-error,#e2Message{color:#ad173a;font-weight:650}.e2-net{font-weight:750;color:#0b7857}@media(max-width:640px){.e2-overlay{padding:8px}.e2-unit-grid{grid-template-columns:1fr}.e2-dialog header,.e2-dialog footer{padding:14px}.e2-body{padding:0 14px 14px}.e2-task{flex-wrap:wrap}.e2-dialog footer{flex-wrap:wrap}}';document.head.append(style);
 for(const name of ['renderOpeningChecklist','renderDailyClosingChecklist','openCaLamViecScreen','renderShiftHandoverForm']){const fn=window[name];if(typeof fn==='function')window[name]=async function(...args){const r=await fn.apply(this,args);init();mount();return r;};}
 const old=window._continueAfterPrepCount;if(typeof old==='function')window._continueAfterPrepCount=function(...args){return closePhase(()=>old.apply(this,args));};
 const count=window.computeShiftInventoryCountLinesPOS;if(typeof count==='function')window.computeShiftInventoryCountLinesPOS=async function(...args){const r=await count.apply(this,args);return active()&&phaseHandoff&&args[0]==='close'?r.filter(l=>!closeItemIds.includes(l.itemId)):r;};
 window.addEventListener('online',flush);
 if(typeof firebase!=='undefined'&&typeof firebase.auth==='function'&&typeof firebase.auth().onAuthStateChanged==='function')firebase.auth().onAuthStateChanged(u=>{if(u)init();else{unsubscribe?.();unsubscribe=null;service=null;state=null;}});
}
window.GieoEngine2POS={load,open,close,addVessel,submit,recordException,resumeClose,resumeWithException,flush};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
