/* Inline source for quanlygieo2 only; all inventory and financial APIs remain shared. */
const AUTO_UI=new Map();
let autoRequest=0;
let autoTab='approval',autoPage=null,autoRows=[],autoPageStore='',autoMore=false,autoBusy=false;
function autoState(){const id=alertUiScope();if(!AUTO_UI.has(id))AUTO_UI.set(id,{sum:null,at:0,pending:null});return AUTO_UI.get(id);}
function autoRoot(){return fstore.collection('duty_digests_gieogieo').doc('_automation');}
async function autoSummary(force=false){
 const state=autoState(),ref=autoRoot();
 if(state.pending)return state.pending;
 if(!force&&Date.now()-state.at<30000)return state.sum;
 state.pending=ref.get({source:'server'}).then(d=>{state.sum=d.exists?d.data():null;state.at=Date.now();return state.sum;}).finally(()=>{state.pending=null;});
 return state.pending;
}
function autoStatusHTML(s){
 if(!s)return '<b>Chưa có bộ xử lý nền</b><p>Đang hiển thị các cảnh báo hiện có. Bản HTML dùng chung dữ liệu; cần triển khai bộ xử lý Firebase và bật theo cửa hàng để tự xử lý khi đóng trình duyệt.</p>';
 if(s.enabled===false)return '<b>Tự động đang tắt</b><p>Cảnh báo nguồn vẫn được giữ. Mở thiết lập để bật lại.</p>';
 if(s.lastError||s.lastSourceError)return '<b>Bộ xử lý cần kiểm tra</b><p>'+escapeHtmlAttr(s.lastError||s.lastSourceError?.message||'Lỗi xử lý chứng từ')+'</p>';
 if(s.mode==='shadow'&&s.ready)return '<b>Đang chạy đối chiếu thử</b><p>Hồ sơ đề xuất được cập nhật; chưa tự kết thúc hồ sơ nghiệp vụ trong Engine. Cảnh báo cũ vẫn được giữ.</p>';
 if(!s.ready)return '<b>Đang khởi tạo hồ sơ</b><p>Chưa đối soát hết dữ liệu cũ. Các cảnh báo nguồn vẫn hiện bên dưới.</p>';
 if(!s.heartbeatAt||Date.now()-Date.parse(s.heartbeatAt)>60*60000)return '<b>Chưa xác nhận bộ xử lý đang hoạt động</b><p>Bản tổng hợp có thể đã cũ. Không coi số 0 là mọi việc đã hoàn tất.</p>';
 return '<b>Tự động đang hoạt động</b><p>Kiểm tra nền gần nhất '+escapeHtmlAttr(qlFmtDT(s.heartbeatAt))+'. Các việc chưa đủ bằng chứng vẫn được theo dõi.</p>';
}
function autoHeaderHTML(s){return '<div class="auto-status">'+autoStatusHTML(s)+'<button class="btn outline sm" onclick="autoSettings()">Thiết lập phụ trách</button></div>';}
async function renderStoreHealth(targetId){
 const scope=alertUiScope(),target=targetId||'storeHealthBody',box=document.getElementById(target);if(!box)return;
 try{
  await ensureAuth();const s=await autoSummary();if(scope!==alertUiScope())return;
  if(!s?.ready||s.mode==='shadow'||s.enabled===false||s.lastError||s.lastSourceError||!s.heartbeatAt||Date.now()-Date.parse(s.heartbeatAt)>60*60000){
   await renderStoreHealthLegacy(target);
   if(scope!==alertUiScope())return;
   // Legacy checks remain visible until the worker has completed bootstrap; no false all-clear.
   const head=document.createElement('div');head.innerHTML=autoHeaderHTML(s);box.prepend(head);
   return;
  }
  const c=s.counts||{};STORE_HEALTH_ISSUE_COUNT=c.approval||0;renderSidebarNav();
  renderTodayHealthBar(c.approval||0,c.working||0);
  if(target==='todayHealth')renderTodayHealthInbox([]);
  else box.innerHTML=autoHeaderHTML(s)+autoOverviewHTML(s);
 }catch(e){if(scope!==alertUiScope())return;box.innerHTML='<div class="auto-status"><b>Không đọc được trạng thái tự động</b><p>'+escapeHtmlAttr(e.message||e)+'</p><button class="btn outline" onclick="renderStoreHealth(\''+target+'\')">Thử lại</button></div>';}
}
function autoOverviewHTML(s){const c=s?.counts||{};return '<div class="auto-overview">'+[['approval','Chờ duyệt chi'],['working','Đang xử lý'],['done','Đã tự ghi nhận']].map(([k,label])=>'<button onclick="autoOpenTab(\''+k+'\')"><b>'+(c[k]||0)+'</b><span>'+label+'</span></button>').join('')+'</div><p class="small-note">Số hồ sơ từ khi bật tự động; không phải tổng tiền hao hụt. Người báo không mặc định là người gây ra.</p><button class="btn outline sm" onclick="autoDayReport()">Tổng hợp vận hành 7 ngày</button>';}
function renderTodayHealthInbox(list){
 const s=autoState().sum;
 if(!s?.ready||s.mode==='shadow'||s.enabled===false||s.lastError||s.lastSourceError||!s.heartbeatAt||Date.now()-Date.parse(s.heartbeatAt)>60*60000){renderTodayHealthInboxLegacy(list);return;}
 const box=document.getElementById('todayHealth');if(!box)return;
 const c=s.counts||{};renderTodayHealthBar(c.approval||0,c.working||0);
 box.innerHTML='<header class="th-head"><div><h2 id="todayHealthTitle">Thông báo</h2><p>Chi tiêu chờ bạn duyệt · vận hành theo hồ sơ</p></div></header><div class="th-list">'+autoHeaderHTML(s)+autoOverviewHTML(s)+'</div><button class="th-footer" onclick="closeTodayHealth(false);switchScreen(\'inbox\')">Xem tiến độ và bằng chứng</button>';
 syncNotificationHeader();applyTodayHealthOpen();
}
function autoOpenTab(tab){autoTab=tab;autoPage=null;autoRows=[];closeTodayHealth(false);if(curScreen==='inbox')renderAlertInbox();else switchScreen('inbox');}
async function renderAlertInbox(){
 const generation=++autoRequest;autoBusy=false;
 const scope=alertUiScope(),box=document.getElementById('inboxBody');if(!box)return;
 box.innerHTML='<div class="muted">Đang đọc hồ sơ…</div>';
 try{
  await ensureAuth();const s=await autoSummary();if(scope!==alertUiScope())return;
  if(!s?.ready||s.enabled===false){
   await renderAlertInboxLegacy();if(scope!==alertUiScope())return;
   const h=document.createElement('div');h.innerHTML=autoHeaderHTML(s);box.prepend(h);return;
  }
  autoPage=null;autoRows=[];autoPageStore=scope;
  box.innerHTML='<section class="wdg wdg-pink"><div class="wdg-head"><h2>Thông báo tự động</h2></div><div class="wdg-body">'+autoHeaderHTML(s)+autoOverviewHTML(s)+'<div class="auto-tabs">'+[['approval','Chờ duyệt chi'],['working','Đang xử lý'],['done','Đã ghi nhận']].map(([k,t])=>'<button class="btn '+(k===autoTab?'':'outline')+' sm" onclick="autoOpenTab(\''+k+'\')">'+t+'</button>').join('')+'</div><div id="autoCaseList"></div><button id="autoLoadMore" class="btn outline sm" onclick="autoLoadCases()">Tải thêm</button></div></section>';
  await autoLoadCases();
 }catch(e){if(scope===alertUiScope())box.innerHTML='<div class="auto-status">Không tải được hồ sơ: '+escapeHtmlAttr(e.message||e)+'</div>';}
}
async function autoLoadCases(){
 if(autoBusy===autoTab)return;const requestTab=autoTab,request=autoRequest;autoBusy=requestTab;
 const scope=alertUiScope(),tab=autoTab,root=autoRoot();
 try{
  let q=root.collection('cases').where('group','==',tab).where('visible','==',true).orderBy('updatedAt','desc').limit(20);
  if(autoPage)q=q.startAfter(autoPage);
  const snap=await q.get({source:'server'});if(scope!==alertUiScope()||tab!==autoTab||request!==autoRequest)return;
  autoRows.push(...snap.docs.map(d=>({...d.data(),id:d.id})));autoPage=snap.docs[snap.docs.length-1]||autoPage;autoMore=snap.docs.length===20;
  const list=document.getElementById('autoCaseList');if(list)list.innerHTML=autoRows.map((r,i)=>autoCaseHTML(r,i)).join('')||'<p class="small-note">Không có hồ sơ trong nhóm này.</p>';
  const more=document.getElementById('autoLoadMore');if(more)more.hidden=!autoMore;
 }catch(e){const list=document.getElementById('autoCaseList');if(list)list.innerHTML='<p>Không đọc được hồ sơ: '+escapeHtmlAttr(e.message||e)+'</p>';}
 finally{if(request===autoRequest&&autoBusy===requestTab)autoBusy=false;}
}
function autoResultLabel(r){return ({recorded:'Đã ghi nhận',waiting_verification:'Chờ xác minh',allocated:'Đã có căn cứ phân bổ',insufficient:'Chưa đủ căn cứ',manual:'Quyết định tay',policy_closed:'Đóng theo chính sách'})[r.resultStatus]||'Đang xử lý';}
function autoCaseHTML(r,i){
 const esc=escapeHtmlAttr;
 const who=r.group==='approval'?'Chủ quán':r.group==='working'?(r.assigneeName||'Chưa có người phụ trách'):'Đã ghi nhận kết quả';
 return '<article class="auto-case"><div><h3>'+esc(r.title)+'</h3><span class="tier tier-'+(r.group==='approval'?'amber':r.group==='done'?'green':'blue')+'">'+esc(who)+'</span></div><p><b>'+esc(autoResultLabel(r))+'</b> · '+esc(r.reason)+'</p>'+(r.deadlineAt?'<p>Hạn xử lý: '+esc(qlFmtDT(r.deadlineAt))+'</p>':'')+'<small>'+esc(r.businessDate||'')+' · '+esc(qlFmtDT(r.updatedAt))+'</small><div class="auto-actions"><button class="btn outline sm" onclick="autoCaseDetail('+i+')">Căn cứ & lịch sử</button><button class="btn sm" onclick="autoGoSource('+i+')">'+(r.group==='approval'?'Mở khoản chi':'Mở nghiệp vụ')+'</button></div></article>';
}
async function autoCaseDetail(i){
 const r=autoRows[i],scope=alertUiScope();if(!r)return;
 const ref=autoRoot().collection('cases').doc(r.id);
 openEditSheet('Căn cứ xử lý','<div id="autoEvidence">Đang tải lịch sử…</div>');
 try{
  const snap=await ref.collection('history').orderBy('at','desc').limit(10).get();if(scope!==alertUiScope())return;
  const e=escapeHtmlAttr;
  const alloc=(r.allocations||[]).map(a=>'<li>'+e(a.employeeName||a.employeeId||'')+' · '+e(a.confidence||a.status||'')+'</li>').join('');
  const evidence=p=>{const v=p.evidence||{};return '<p>Chứng từ: '+e(v.sourceId||p.sourceId)+' · Lượng: '+e(v.quantity??'Chưa có')+' '+e(v.unit||'')+' · '+Number(v.fifoAllocationCount||0)+' phân bổ FIFO trên chứng từ</p>';};
  const parts=Object.values(r.parts||{}).map(p=>'<li>'+e(p.title)+' — '+e(p.reason)+evidence(p)+'</li>').join('');
  const body=document.getElementById('autoEvidence');if(!body)return;
  body.innerHTML='<p><b>'+e(r.title)+'</b></p><p>'+e(autoResultLabel(r))+' · Độ tin cậy: '+e(({strong:'Mạnh',medium:'Vừa',weak:'Yếu',none:'Chưa có'})[r.confidence]||r.confidence||'Chưa có')+'</p><p>'+e(r.reason)+'</p><p>Luật '+e(r.rule)+' · phiên bản '+Number(r.policyVersion||1)+'</p><p>Người ghi nhận: '+e(r.reportedBy||'Không có thông tin')+'</p><p>Người xử lý: '+e(r.assigneeName||'Chưa phân công')+'</p>'+(alloc?'<p>Phân bổ đã có từ Engine/quản lý:</p><ul>'+alloc+'</ul>':'<p>Không có kết luận quy cá nhân trong hồ sơ này.</p>')+(parts?'<ul>'+parts+'</ul>':evidence(r))+'<h3>10 thay đổi gần nhất</h3>'+snap.docs.map(d=>{const h=d.data();return '<p>'+e(qlFmtDT(h.at))+' · '+e(h.reason)+'</p>';}).join('');
 }catch(e){const b=document.getElementById('autoEvidence');if(b)b.textContent='Không tải được bằng chứng: '+(e.message||e);}
}
function autoGoSource(i){
 const r=autoRows[i];if(!r)return;
 closeEditSheet(true);
 if(r.kind==='expenses'){curEntryTab='exp';switchScreen('entry');}
 else if(r.kind==='duty_cases'||r.linkedDutyId)goKho('duty');
 else if(r.kind==='stock_containers')goContainers(r.rule==='LOT_EXPIRED'?'expired':r.rule==='LABEL_PENDING'?'unlabeled':'review');
 else if(r.kind==='prep_batches')goKho2('prep');
 else if(r.kind==='inventory_items')goKho('items',r.rule==='STOCK_NEGATIVE'?'negative':'low');
 else if(r.kind==='stock_counts')goKho('stockcount');
 else if(r.kind==='purchase_orders')goKho('po');
 else if(r.kind.endsWith('_transactions')&&r.businessDate)openWasteDetailSheet(r.businessDate);
 else if(r.kind==='daily_openings'||r.kind==='daily_closings'){cashViewDate=r.businessDate||r.sourceId;goEntry('cash');}
 else {renderAlertInboxLegacy().catch(e=>showError(e.message||e));}
}
async function autoSettings(){
 const scope=alertUiScope(),ref=fstore.collection('duty_digests_gieogieo').doc('_automation_config');
 openEditSheet('Tự động · người phụ trách','<div id="autoSettingsBody">Đang tải…</div>');
 try{
  const [snap,emps]=await Promise.all([ref.get(),loadEmployees()]);if(scope!==alertUiScope())return;
  const c=snap.exists?snap.data():{},e=escapeHtmlAttr;
  const options=(role,backup=false)=>'<option value="">Chưa phân công</option>'+emps.filter(x=>x.active!==false).map(x=>'<option value="'+e(x.id)+'" '+((backup?c.backups:c.owners)?.[role]?.id===x.id?'selected':'')+'>'+e(x.fullName||x.id)+'</option>').join('');
  const b=document.getElementById('autoSettingsBody');if(!b)return;
  b.innerHTML='<p>Dùng chung hồ sơ và Unit Engine hiện tại. Bật tại đây sau khi bộ xử lý Firebase đã được triển khai. Không tự duyệt chi, trừ lương hoặc sửa tồn.</p><label class="field">Phụ trách vận hành<select id="autoOwnerOperations">'+options('operations')+'</select></label><label class="field">Phụ trách kho<select id="autoOwnerStock">'+options('stock')+'</select></label><label class="field">Thay thế vận hành<select id="autoBackupOperations">'+options('operations',true)+'</select></label><label class="field">Thay thế kho<select id="autoBackupStock">'+options('stock',true)+'</select></label><label class="field">Chế độ<select id="autoMode"><option value="shadow">Đối chiếu thử — giữ cảnh báo hiện tại</option><option value="active" '+(c.mode==='active'?'selected':'')+'>Tự xử lý theo chính sách</option></select></label><label><input type="checkbox" id="autoFleet" '+(c.fleet20Confirmed?'checked':'')+'> Các máy POS và quản lý đã tải lại Engine v20</label><label class="field">Khoản nhỏ chỉ ghi nhận (đ, 0 = không áp dụng)<input type="number" min="0" id="autoLowValue" value="'+Number(c.lowValueLimit||0)+'"></label><label class="field">Đọc bổ sung sổ hao hụt từ ngày<input type="date" id="autoStart" value="'+e(c.startDate||dkey(vnDate(Date.now()-7*86400000)))+'"></label><p class="small-note">Các cảnh báo và phiếu đang chờ vẫn được nạp đủ, kể cả trước mốc này. Khoảng sổ hao hụt tối đa 31 ngày cho lần khởi tạo.</p><label><input type="checkbox" id="autoEnabled" '+(c.enabled?'checked':'')+'> Bật tự động cho điểm bán này</label><button class="btn" id="autoSave">Lưu thiết lập</button><p id="autoSaveError"></p>';
  document.getElementById('autoSave').onclick=async()=>{
   const button=document.getElementById('autoSave');button.disabled=true;
   try{
    if(scope!==alertUiScope())throw Error('Điểm bán đã đổi; mở lại thiết lập.');
    const start=document.getElementById('autoStart').value,enabled=document.getElementById('autoEnabled').checked;
    const age=Date.parse(dkey(vnDate())+'T00:00:00+07:00')-Date.parse(start+'T00:00:00+07:00');
    if(!Number.isFinite(age)||age<0||age>31*86400000)throw Error('Chọn ngày trong 31 ngày gần nhất.');
    const backups={};for(const [role,id] of [['operations','autoBackupOperations'],['stock','autoBackupStock']]){const emp=emps.find(x=>x.id===document.getElementById(id).value);backups[role]={id:emp?.id||'',name:emp?.fullName||''};}
    const fleet20Confirmed=document.getElementById('autoFleet').checked;
    const mode=document.getElementById('autoMode').value,lowValueLimit=Number(document.getElementById('autoLowValue').value);
    if(enabled&&mode==='active'&&!fleet20Confirmed)throw Error('Cập nhật và tải lại v20 trên các máy trước khi bật xử lý thật.');
    if(!Number.isFinite(lowValueLimit)||lowValueLimit<0)throw Error('Ngưỡng khoản nhỏ không hợp lệ.');
    const owners={};for(const [role,id] of [['operations','autoOwnerOperations'],['stock','autoOwnerStock']]){const emp=emps.find(x=>x.id===document.getElementById(id).value);owners[role]={id:emp?.id||'',name:emp?.fullName||''};}
    if(enabled&&(!owners.operations.id||!owners.stock.id))throw Error('Chọn người phụ trách vận hành và kho trước khi bật.');
    const batch=fstore.batch();batch.set(ref,{enabled,mode,fleet20Confirmed,lowValueLimit,disputeDays:7,startDate:start,owners,backups,updatedAt:new Date().toISOString(),by:'quanlygieo2'},{merge:true});
    // Re-bootstrap on policy changes, preserving old cases/history. Counts are not reset.
    batch.set(autoRoot(),{enabled,mode,ready:false,bootstrap:{phase:0,cursor:''},lastError:''},{merge:true});await batch.commit();
    autoState().at=0;closeEditSheet(true);toast('Đã lưu thiết lập; bộ xử lý nền sẽ tiếp nhận.');await renderStoreHealth('todayHealth');
   }catch(err){const out=document.getElementById('autoSaveError');if(out)out.textContent=err.message||err;button.disabled=false;}
  };
 }catch(err){const b=document.getElementById('autoSettingsBody');if(b)b.textContent='Không tải được thiết lập: '+(err.message||err);}
}

async function autoDayReport(){
 const scope=alertUiScope(),root=autoRoot(),today=dkey(vnDate()),from=dkey(vnDate(Date.now()-6*86400000)),e=escapeHtmlAttr;
 openEditSheet('Vận hành · 7 ngày gần nhất','<div id="autoDayReport">Đang tải bản tổng hợp…</div>');
 try{
  const snap=await root.collection('days').where('day','>=',from).where('day','<=',today).orderBy('day','desc').get({source:'server'});
  if(scope!==alertUiScope())return;const box=document.getElementById('autoDayReport');if(!box)return;
  const all=snap.docs.map(d=>d.data()),days=all.filter(d=>!d.dirty),sum=k=>days.reduce((n,d)=>n+(Number(d[k])||0),0);
  const items=new Map();for(const d of days)for(const r of d.itemStats||[]){const k=r.kind+':'+r.id,old=items.get(k)||{name:r.name,days:0,value:0};old.days++;old.value+=Number(r.declaredValue)||0;items.set(k,old);}
  box.innerHTML='<p>'+e(from)+' → '+e(today)+'</p><p>'+days.length+' ngày có bản tổng hợp hoàn tất'+(all.length>days.length?' · '+(all.length-days.length)+' ngày đang cập nhật':'')+'. Ngày chưa có bản tổng hợp không được coi là 0.</p>'+
   '<p><b>'+sum('eventCount')+' lượt khai báo hao hụt</b> · '+sum('remakeEventCount')+' lượt đổ/làm lại ly (nằm trong tổng)</p>'+
   '<p>Giá trị WASTE khai báo có giá vốn: <b>'+Math.round(sum('declaredValue')).toLocaleString('vi-VN')+'đ</b></p>'+
   '<p>Giá trị chênh lệch kiểm kê hai chiều: '+Math.round(sum('varianceValue')).toLocaleString('vi-VN')+'đ. Không cộng hai số này thành khoản lỗ mới.</p>'+
   '<p>'+sum('missingCost')+' dòng thiếu giá vốn · '+sum('missingReason')+' dòng thiếu lý do. Người ghi nhận không mặc định là người gây tổn thất.</p>'+
   '<h3>NL/BTP lặp lại ở nhiều ngày</h3>'+[...items.values()].filter(r=>r.days>=2).sort((a,b)=>b.days-a.days).slice(0,10).map(r=>'<p>'+e(r.name)+' · '+r.days+' ngày có khai báo. Cần xem lượng nhập/nấu, bảo quản và dữ liệu trước khi kết luận nguyên nhân.</p>').join('')+
   (!days.length?'<p>Chưa có dữ liệu tổng hợp để đánh giá.</p>':'');
 }catch(err){const box=document.getElementById('autoDayReport');if(box)box.textContent='Chưa đọc được tổng hợp: '+(err.message||err);}
}
