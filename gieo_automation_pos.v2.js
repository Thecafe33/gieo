/* Optional work in existing shift checklists. No listeners, gate or checkout hook. */
(function(){
'use strict';
let rows=[],loading=null,viewNode=null;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mount(phase){
 const box=document.getElementById('shiftBody');if(!box||box.querySelector('#autoShiftWork'))return;
 const screen=box.closest('.screen');if(screen&&!screen.classList.contains('active'))return;
 if(phase==='open'&&![...box.querySelectorAll('.kc-title')].some(e=>e.textContent.trim()==='Việc đầu ca'))return;
 if(phase==='close'&&!box.querySelector('#dcNoMoreBills'))return;
 const host=document.createElement('section');host.id='autoShiftWork';host.className='kc-card';
 host.innerHTML='<b>Công việc được giao tại điểm bán</b><p style="font-size:13px;color:#666">Kiểm tra việc vận hành trong ca. Không ảnh hưởng thao tác bán hàng.</p><button type="button" class="kc-btn" style="background:#fff;color:#b4254d;border:1px solid #f2bfd0" onclick="GieoShiftWork.load()">Xem công việc</button><div id="autoShiftRows"></div>';
 box.prepend(host);
}
function load(){
 const box=document.getElementById('autoShiftRows');if(!box)return;if(loading?.node===box)return loading.promise;
 const pending=loadRows(box).finally(()=>{if(loading?.promise===pending)loading=null;});loading={node:box,promise:pending};return pending;
}
async function loadRows(box){
 box.textContent='Đang tải…';
 try{
  const root=fstore.collection('duty_digests_gieogieo').doc('_automation'),sum=await root.get({source:'server'});
  if(document.getElementById('autoShiftRows')!==box)return;
  if(!sum.exists||!sum.data().enabled||!sum.data().ready||sum.data().mode!=='active'){box.textContent='Tự động chưa được bật cho điểm bán. Thực hiện checklist hiện có.';return;}
  const status=sum.data(),at=Date.parse(status.heartbeatAt||'');
  if(status.lastError||status.lastSourceError||!Number.isFinite(at)||at>Date.now()+300000||Date.now()-at>3600000||status.countsVerifiedVersion!==2){box.textContent='Chưa xác nhận được trạng thái công việc mới nhất. Không coi đây là đã hết việc. Bạn vẫn bán hàng và thực hiện checklist như thường.';return;}
  const snap=await root.collection('cases').where('group','==','working').where('visible','==',true).orderBy('updatedAt','desc').limit(20).get({source:'server'});
  if(document.getElementById('autoShiftRows')!==box)return;
  viewNode=box;rows=snap.docs.map(d=>({...d.data(),id:d.id}));
  box.innerHTML=rows.map((r,i)=>'<article style="background:white;border:1px solid #f0dce3;border-radius:18px;padding:12px;margin-top:10px"><b>'+esc(r.title)+'</b><p style="font-size:13px">'+esc(r.reason)+'</p><p style="font-size:13px">Phụ trách: '+esc(r.assigneeName||r.assigneeId||'Chưa có người phụ trách')+(r.backupName?' · Thay thế: '+esc(r.backupName):'')+'</p>'+(r.deadlineAt?'<p style="font-size:13px">Hạn: '+esc(new Date(r.deadlineAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))+'</p>':'')+'<button type="button" class="kc-btn" style="background:#e23a5d;color:#fff" onclick="GieoShiftWork.open('+i+')">Mở kiểm tra</button></article>').join('')||'<p>Không có việc đang chờ.</p>';
  if(rows.length===20)box.insertAdjacentHTML('beforeend','<p>Đang hiện 20 việc mới nhất. Xem toàn bộ trong quanlygieo2.</p>');
 }catch(e){if(document.getElementById('autoShiftRows')===box)box.textContent='Chưa đọc được công việc. Bạn vẫn có thể thực hiện checklist và bán hàng. '+String(e.message||e);}
}
async function open(i){const r=rows[i];if(!r||document.getElementById('autoShiftRows')!==viewNode)return;
 try{
 if(r.kind==='duty_cases'&&r.sourceStatus==='pending_verify'&&r.entityId){const node=viewNode,taskId='verify_'+r.entityId,snap=await fstore.collection('duty_tasks_gieogieo').doc(taskId).get({source:'server'});if(document.getElementById('autoShiftRows')!==node)return;const task=snap.exists?snap.data():null;if(!task||task.caseId!==r.sourceId||!['open','processing'].includes(task.status)||Date.parse(task.expireAt||'')<=Date.now()){toast('Việc xác minh đã thay đổi hoặc hết hạn. Bấm Xem công việc để cập nhật.');return;}await openPrepVerifyPOS(taskId);}
 else if(r.kind==='duty_cases')openMyDutyCasesPOS();
 else if(r.kind==='stock_containers'&&r.rule==='LOT_REVIEW'&&r.sourceStatus==='finished'){const id='autoWorkInstruction';let note=document.getElementById(id);if(!note){note=document.createElement('p');note.id=id;viewNode.append(note);}note.textContent='Tem này đã báo hết, không báo hết lại. Người phụ trách '+(r.assigneeName||r.assigneeId||'kho')+' cần mở quanlygieo2, chọn đúng điểm bán, vào Đang xử lý và mở đúng tem này để đối chiếu.';}
 else if(r.kind==='stock_containers')openStockUseScreen();
 else if(r.kind==='prep_batches')openPrepBatchScreen();
 else if(r.kind==='purchase_orders')openPoReceiveScreen();
 else {showScreen('khoScreen');loadKhoScreen();}
 }catch(e){toast('Chưa mở được việc: '+String(e.message||e));}
}
function install(){
 for(const name of ['renderOpeningChecklist','renderDailyClosingChecklist']){
  const fn=window[name];if(typeof fn!=='function')continue;
  window[name]=async function(...args){const result=await fn.apply(this,args);mount(name==='renderOpeningChecklist'?'open':'close');return result;};
 }
}
window.GieoShiftWork={load,open};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
