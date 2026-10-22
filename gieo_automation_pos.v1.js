/* Optional work in existing shift checklists. No listeners, gate or checkout hook. */
(function(){
'use strict';
let rows=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mount(){
 const box=document.getElementById('shiftBody');if(!box||box.querySelector('#autoShiftWork'))return;
 const host=document.createElement('section');host.id='autoShiftWork';host.className='kc-card';
 host.innerHTML='<b>Công việc được giao tại điểm bán</b><p style="font-size:13px;color:#666">Kiểm tra việc vận hành trong ca. Không ảnh hưởng thao tác bán hàng.</p><button type="button" class="kc-btn" style="background:#fff;color:#b4254d;border:1px solid #f2bfd0" onclick="GieoShiftWork.load()">Xem công việc</button><div id="autoShiftRows"></div>';
 box.prepend(host);
}
async function load(){
 const box=document.getElementById('autoShiftRows');if(!box)return;box.textContent='Đang tải…';
 try{
  const root=fstore.collection('duty_digests_gieogieo').doc('_automation'),sum=await root.get({source:'server'});
  if(!sum.exists||!sum.data().enabled||!sum.data().ready||sum.data().mode!=='active'){box.textContent='Tự động chưa được bật cho điểm bán. Thực hiện checklist hiện có.';return;}
  const snap=await root.collection('cases').where('group','==','working').where('visible','==',true).orderBy('updatedAt','desc').limit(20).get({source:'server'});
  if(!document.contains(box))return;
  rows=snap.docs.map(d=>({...d.data(),id:d.id}));
  box.innerHTML=rows.map((r,i)=>'<article style="background:white;border:1px solid #f0dce3;border-radius:18px;padding:12px;margin-top:10px"><b>'+esc(r.title)+'</b><p style="font-size:13px">'+esc(r.reason)+'</p><p style="font-size:13px">Phụ trách: '+esc(r.assigneeName||'Chưa có người phụ trách')+(r.backupName?' · Thay thế: '+esc(r.backupName):'')+'</p>'+(r.deadlineAt?'<p style="font-size:13px">Hạn: '+esc(new Date(r.deadlineAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))+'</p>':'')+'<button type="button" class="kc-btn" style="background:#e23a5d;color:#fff" onclick="GieoShiftWork.open('+i+')">Mở kiểm tra</button></article>').join('')||'<p>Không có việc đang chờ.</p>';
  if(rows.length===20)box.insertAdjacentHTML('beforeend','<p>Đang hiện 20 việc mới nhất. Xem toàn bộ trong quanlygieo2.</p>');
 }catch(e){if(document.contains(box))box.textContent='Chưa đọc được công việc. Bạn vẫn có thể thực hiện checklist và bán hàng. '+String(e.message||e);}
}
function open(i){const r=rows[i];if(!r)return;
 if(r.kind==='duty_cases'&&r.sourceStatus==='pending_verify'&&r.entityId)openPrepVerifyPOS('verify_'+r.entityId);
 else if(r.kind==='duty_cases')openMyDutyCasesPOS();
 else if(r.kind==='stock_containers')openStockUseScreen();
 else if(r.kind==='prep_batches')openPrepBatchScreen();
 else if(r.kind==='purchase_orders')openPoReceiveScreen();
 else {showScreen('khoScreen');loadKhoScreen();}
}
function install(){
 for(const name of ['renderOpeningChecklist','renderDailyClosingChecklist']){
  const fn=window[name];if(typeof fn!=='function')continue;
  window[name]=async function(...args){const result=await fn.apply(this,args);mount();return result;};
 }
}
window.GieoShiftWork={load,open};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
