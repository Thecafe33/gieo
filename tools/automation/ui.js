/* Inline source for quanlygieo2 only; all inventory and financial APIs remain shared. */
const AUTO_UI=new Map();
let autoRequest=0,autoSavedView=false;const autoHealthRequests=new Map();
let autoTab='approval',autoPage=null,autoRows=[],autoPageStore='',autoMore=false,autoBusy=false;
function autoState(){const id=alertUiScope();if(!AUTO_UI.has(id))AUTO_UI.set(id,{sum:null,at:0,pending:null});return AUTO_UI.get(id);}
function autoRoot(){return fstore.collection('duty_digests_gieogieo').doc('_automation');}
async function autoSummary(force=false){
 const state=autoState(),ref=autoRoot(),epoch=state.epoch||0;
 if(state.pending&&!force)return state.pending;
 if(!force&&Date.now()-state.at<30000)return state.sum;
 const pending=ref.get({source:'server'}).then(d=>{const sum=d.exists?d.data():null;if(epoch===(state.epoch||0)){state.sum=sum;state.at=Date.now();}return sum;}).finally(()=>{if(state.pending===pending)state.pending=null;});
 state.pending=pending;return pending;
}
function autoHeartbeatFresh(s){const t=Date.parse(s?.heartbeatAt||'');return Number.isFinite(t)&&t<=Date.now()+5*60000&&Date.now()-t<=60*60000;}
function autoCountsVerified(s){return typeof GieoAutomation!=='undefined'&&s?.countsVerifiedVersion===GieoAutomation.VERSION;}
function autoUsable(s){return !!(s?.ready&&autoCountsVerified(s)&&s.enabled===true&&s.mode==='active'&&!s.lastError&&!s.lastSourceError&&!s.sourceErrorCount&&autoHeartbeatFresh(s));}
function autoStatusHTML(s){
 if(!s)return '<b>Chưa có bộ xử lý nền</b><p>Đang hiển thị cảnh báo hiện có. Triển khai bộ xử lý nền rồi bật theo từng điểm bán để giao việc tự động.</p>';
 if(s.enabled===false)return '<b>Tự động đang tắt</b><p>Cảnh báo nguồn vẫn được giữ. Mở thiết lập để bật lại.</p>';
 if(s.lastError||s.lastSourceError||s.sourceErrorCount)return '<b>Bộ xử lý cần kiểm tra</b><p>'+escapeHtmlAttr(s.lastError||s.lastSourceError?.message||s.sourceErrorCount+' nguồn công việc đang chờ thử lại')+'</p>';
 if(!s.ready)return '<b>Đang khởi tạo hồ sơ</b><p>Chưa đối soát hết dữ liệu cũ. Các cảnh báo nguồn vẫn hiện bên dưới.</p>';
 if(!autoCountsVerified(s))return '<b>Đang đối chiếu lại số hồ sơ</b><p>Chưa có bản tổng hợp xác nhận theo phiên bản mới. Các cảnh báo nguồn vẫn được giữ.</p>';
 if(!autoHeartbeatFresh(s))return '<b>Chưa xác nhận bộ xử lý đang hoạt động</b><p>Bản tổng hợp có thể đã cũ. Cảnh báo nguồn vẫn được giữ; số 0 trong bản lưu không có nghĩa mọi việc đã xong.</p>';
 if(s.mode==='shadow')return '<b>Đang chạy đối chiếu thử</b><p>Hồ sơ đề xuất được cập nhật; cảnh báo nguồn vẫn được giữ. Bấm Xem hồ sơ đối chiếu để so sánh.</p>';
 return '<b>Tự động đang hoạt động</b><p>Kiểm tra nền gần nhất '+escapeHtmlAttr(qlFmtDT(s.heartbeatAt))+'. Việc chưa đủ bằng chứng vẫn đang được theo dõi.</p>';
}
function autoInvalidate(state=autoState()){state.at=0;state.epoch=(state.epoch||0)+1;state.pending=null;}
function reloadCurrent(){autoInvalidate();return reloadCurrentLegacy();}
function _expWriteDone(p){const state=autoState();return _expWriteDoneLegacy(p).then(result=>{state.at=0;state.epoch=(state.epoch||0)+1;state.pending=null;return result;});}
function autoPaintBell(c){renderTodayHealthBar(c.approval||0,c.working||0);const b=document.getElementById('todayHealthToggle');if(b){const label='Thông báo · '+(c.approval||0)+' khoản chi chờ duyệt · '+(c.working||0)+' việc đã giao';b.title=label;b.setAttribute('aria-label',label);}}
function autoHeaderHTML(s,compact=false){if(compact&&autoUsable(s))return '<div class="auto-toolbar"><span><b>Tự động đang hoạt động</b> · '+escapeHtmlAttr(qlFmtDT(s.heartbeatAt))+'</span><button class="btn outline sm" onclick="autoSettings()">Thiết lập phụ trách</button></div>';return '<div class="auto-status">'+autoStatusHTML(s)+'<button class="btn outline sm" onclick="autoSettings()">Thiết lập phụ trách</button></div>';}
async function renderStoreHealth(targetId){
 const scope=alertUiScope(),target=targetId||'storeHealthBody',box=document.getElementById(target);if(!box)return;
 const generation=(autoHealthRequests.get(target)||0)+1;autoHealthRequests.set(target,generation);const epoch=autoState().epoch||0;
 const current=()=>scope===alertUiScope()&&autoHealthRequests.get(target)===generation&&(autoState().epoch||0)===epoch;
 try{
  await ensureAuth();const s=await autoSummary();if(!current())return;
  if(!autoUsable(s)){
   await renderStoreHealthLegacy(target);
   if(!current())return;
   // Legacy checks remain visible until the worker has completed bootstrap; no false all-clear.
   // Hộp thông báo (chuông) chỉ chứa THÔNG BÁO để cuộn xem; thẻ trạng thái / thiết lập nằm ở mục menu «Tự động & Engine 2».
   if(target!=='todayHealth'){const head=document.createElement('div');head.innerHTML=autoHeaderHTML(s);box.prepend(head);}
   return;
  }
  const c=s.counts||{};STORE_HEALTH_ISSUE_COUNT=c.approval||0;renderSidebarNav();
  autoPaintBell(c);
  if(target==='todayHealth')renderTodayHealthInbox([]);
  else box.innerHTML=autoHeaderHTML(s)+autoOverviewHTML(s);
 }catch(e){if(!current())return;box.innerHTML='<div class="auto-status"><b>Không đọc được trạng thái tự động</b><p>'+escapeHtmlAttr(e.message||e)+'</p><button class="btn outline" onclick="renderStoreHealth(\''+target+'\')">Thử lại</button></div>';}
}
function autoOverviewHTML(s,compact=false){const c=s?.counts||{},note='Số hồ sơ từ khi bật tự động; không phải tổng tiền hao hụt. Người báo không mặc định là người gây ra.';return '<div class="auto-overview '+(compact?'auto-tabs auto-overview-compact':'')+'">'+[['approval','Chờ duyệt chi'],['working','Đang xử lý'],['done','Đã có kết quả']].concat(c.backlog?[['backlog','Tồn trước ngày áp dụng']]:[]).map(([k,label])=>'<button aria-pressed="'+(autoTab===k)+'" onclick="autoOpenTab(\''+k+'\')"><b>'+(c[k]||0)+'</b><span>'+label+'</span></button>').join('')+'</div>'+(compact?'<div class="auto-meta-actions"><details><summary>Về số hồ sơ</summary><p>'+note+'</p></details>':'<p class="small-note">'+note+'</p>')+'<button class="btn outline sm" onclick="autoDayReport()">Tổng hợp vận hành 7 ngày</button>'+(compact?'</div>':'');}
function renderTodayHealthInbox(list){
 const s=autoState().sum;
 if(!autoUsable(s)){renderTodayHealthInboxLegacy(list);return;}
 const box=document.getElementById('todayHealth');if(!box)return;
 const c=s.counts||{};autoPaintBell(c);
 box.innerHTML='<header class="th-head"><div><h2 id="todayHealthTitle">Thông báo</h2><p>Chi tiêu chờ bạn duyệt · vận hành theo hồ sơ</p></div></header><div class="th-list">'+autoHeaderHTML(s,true)+autoOverviewHTML(s,true)+'</div><button class="th-footer" onclick="closeTodayHealth(false);switchScreen(\'inbox\')">Xem tiến độ và bằng chứng</button>';
 syncNotificationHeader();applyTodayHealthOpen();
}
function autoOpenTab(tab){autoTab=tab;autoPage=null;autoRows=[];closeTodayHealth(false);if(curScreen==='inbox')renderAlertInbox(autoSavedView);else switchScreen('inbox');}
async function renderAlertInbox(viewSaved=false){
 const loadedList=Array.isArray(viewSaved)?viewSaved:undefined;viewSaved=viewSaved===true;
 autoSavedView=viewSaved;
 const generation=++autoRequest;autoBusy=false;
 const scope=alertUiScope(),box=document.getElementById('inboxBody');if(!box)return;
 box.innerHTML='<div class="muted">Đang đọc hồ sơ…</div>';
 try{
  await ensureAuth();const s=await autoSummary();if(scope!==alertUiScope()||generation!==autoRequest)return;
  if(!autoUsable(s)&&!viewSaved){
   await renderAlertInboxLegacy(loadedList);if(scope!==alertUiScope()||generation!==autoRequest)return;
   const h=document.createElement('div');h.innerHTML=autoHeaderHTML(s)+(s?.ready?'<button class="btn outline sm" onclick="renderAlertInbox(true)">'+(s.mode==='shadow'?'Xem hồ sơ đối chiếu':'Xem bản lưu gần nhất')+'</button>':'');box.prepend(h);return;
  }
  autoPage=null;autoRows=[];autoPageStore=scope;autoSavedView=viewSaved;
  box.innerHTML='<section class="wdg wdg-pink"><div class="wdg-head"><h2>Công việc & duyệt chi</h2></div><div class="wdg-body">'+autoHeaderHTML(s,true)+(viewSaved?'<p class="auto-status">Đang xem bản lưu để đối chiếu. Đây không phải xác nhận trạng thái hiện tại.</p><button class="btn outline sm" onclick="renderAlertInbox(false)">Quay về cảnh báo hiện có</button>':'')+autoOverviewHTML(s,true)+'<div id="autoCaseList"></div><p id="autoLoadError" role="status"></p><button id="autoLoadMore" class="btn outline sm" onclick="autoLoadCases()">Tải thêm</button></div></section>';
  await autoLoadCases();
 }catch(e){if(scope===alertUiScope()&&generation===autoRequest)box.innerHTML='<div class="auto-status">Không tải được hồ sơ: '+escapeHtmlAttr(e.message||e)+'</div>';}
}
async function autoLoadCases(){
 if(autoBusy===autoTab)return;const requestTab=autoTab,request=autoRequest;autoBusy=requestTab;
 const scope=alertUiScope(),tab=autoTab,root=autoRoot();
 const errorBox=document.getElementById('autoLoadError');if(errorBox)errorBox.textContent='';
 try{
  let q=root.collection('cases').where('group','==',tab).where('visible','==',true).orderBy('updatedAt','desc').limit(20);
  if(autoPage)q=q.startAfter(autoPage);
  const snap=await q.get({source:'server'});if(scope!==alertUiScope()||tab!==autoTab||request!==autoRequest)return;
  autoRows.push(...snap.docs.map(d=>({...d.data(),id:d.id})));autoPage=snap.docs[snap.docs.length-1]||autoPage;autoMore=snap.docs.length===20;
  const list=document.getElementById('autoCaseList');if(list)list.innerHTML=autoRows.map((r,i)=>autoCaseHTML(r,i)).join('')||'<p class="small-note">Không có hồ sơ trong nhóm này.</p>';
  const more=document.getElementById('autoLoadMore');if(more)more.hidden=!autoMore;
 }catch(e){if(scope!==alertUiScope()||tab!==autoTab||request!==autoRequest)return;const out=document.getElementById('autoLoadError')||document.getElementById('autoCaseList');if(out)out.innerHTML='Không đọc được hồ sơ: '+escapeHtmlAttr(e.message||e)+' <button class="btn outline sm" onclick="autoLoadCases()">Thử lại</button>';const more=document.getElementById('autoLoadMore');if(more)more.hidden=true;}
 finally{if(request===autoRequest&&autoBusy===requestTab)autoBusy=false;}
}
function autoResultLabel(r){return ({recorded:'Đã ghi nhận',waiting_verification:'Chờ xác minh',allocated:'Đã có căn cứ phân bổ',insufficient:'Chưa đủ căn cứ',manual:'Quyết định tay',policy_closed:'Đóng theo chính sách'})[r.resultStatus]||'Đang xử lý';}
function autoMoney(v){return v!=null&&Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString('vi-VN')+'đ':'';}
function _ctnDetailRender(box,c,recv){
 _ctnDetailRenderLegacy(box,c,recv);
 if(c.needsReview){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Xác nhận đã xem';button.onclick=()=>autoReviewContainer(c.id,button);box.append(button);
  const note=document.createElement('p');note.className='small-note';note.textContent='Chỉ xác nhận đã xem yêu cầu kiểm tra. Không thay đổi tồn kho hoặc ghi nhận hủy hàng.';box.append(note);}
}
async function autoReviewContainer(id,button){
 if(button.disabled)return;button.disabled=true;const scope=alertUiScope(),state=autoState();
 try{await UnitEngine.containers.annotate(id,{needsReview:false,reviewedAt:vnDate().toISOString(),reviewedBy:'management'});
  autoInvalidate(state);if(scope!==alertUiScope())return;
  if(typeof CTN_ALL_CACHE!=='undefined')CTN_ALL_CACHE.review=null;
  logAudit('review','stock_container',id,{});button.textContent='Đã xác nhận xem';toast('Đã xác nhận xem. Hồ sơ tự động sẽ cập nhật theo chứng từ nguồn.');
 }catch(e){if(scope===alertUiScope()){button.disabled=false;showError('Không xác nhận được: '+(e.message||e));}}
}
function autoCaseHTML(r,i){
 const esc=escapeHtmlAttr;
 const who=r.group==='backlog'?'Tồn trước ngày áp dụng — không giao':r.group==='approval'?'Chủ quán':r.group==='working'?(r.assigneeName||r.assigneeId||'Chưa có người phụ trách'):'Đã ghi nhận kết quả';
 return '<article class="auto-case"><div><h3>'+esc(r.title)+'</h3><span class="tier tier-'+(r.group==='approval'?'amber':r.group==='done'?'green':'blue')+'">'+esc(who)+'</span></div>'+(autoMoney(r.value)?'<p class="auto-money">'+esc(autoMoney(r.value))+'</p>':'')+'<p><b>'+esc(autoResultLabel(r))+'</b> · '+esc(r.reason)+'</p>'+(r.deadlineAt?'<p>Hạn xử lý: '+esc(qlFmtDT(r.deadlineAt))+'</p>':'')+'<small>'+(r.backupName||r.backupId?'Thay thế: '+esc(r.backupName||r.backupId)+' · ':'')+esc(r.businessDate||'')+' · '+esc(qlFmtDT(r.updatedAt))+'</small><div class="auto-actions"><button class="btn outline sm" onclick="autoCaseDetail('+i+')">Căn cứ & lịch sử</button><button class="btn sm" onclick="autoGoSource('+i+')">'+(r.group==='approval'?'Mở khoản chi':'Mở nghiệp vụ')+'</button></div></article>';
}
async function autoCaseDetail(i){
 const r=autoRows[i],scope=alertUiScope();if(!r)return;
 const ref=autoRoot().collection('cases').doc(r.id);
 closeTodayHealth(false);openEditSheet('Căn cứ xử lý','<div id="autoEvidence">Đang tải lịch sử…</div>');
 const evidenceNode=document.getElementById('autoEvidence');
 try{
  const snap=await ref.collection('history').orderBy('at','desc').limit(10).get();if(scope!==alertUiScope()||document.getElementById('autoEvidence')!==evidenceNode)return;
  const e=escapeHtmlAttr;
  const alloc=(r.allocations||[]).map(a=>'<li>'+e(a.employeeName||a.employeeId||'')+(autoMoney(a.value)?' · '+e(autoMoney(a.value)):'')+(a.qty!=null?' · '+e(a.qty)+' '+e(r.evidence?.unit||''):'')+' · '+e(({strong:'Mạnh',medium:'Vừa',weak:'Yếu'})[a.confidence]||a.status||'Chưa có độ tin cậy')+'</li>').join('');
  const evidence=p=>{const v=p.evidence||{};return '<p>Chứng từ: '+e(v.sourceId||p.sourceId)+' · Lượng: '+e(v.quantity??'Chưa có')+' '+e(v.unit||'')+' · '+Number(v.fifoAllocationCount||0)+' phân bổ FIFO trên chứng từ</p>';};
  const parts=Object.values(r.parts||{}).map(p=>'<li>'+e(p.title)+' — '+e(p.reason)+evidence(p)+'</li>').join('');
  const body=document.getElementById('autoEvidence');if(!body)return;
  body.innerHTML='<p><b>'+e(r.title)+'</b></p>'+(autoMoney(r.value)?'<p class="auto-money">'+e(autoMoney(r.value))+'</p>':'')+'<p>'+e(autoResultLabel(r))+' · Độ tin cậy: '+e(({strong:'Mạnh',medium:'Vừa',weak:'Yếu',none:'Chưa có'})[r.confidence]||r.confidence||'Chưa có')+'</p><p>'+e(r.reason)+'</p><p>Luật '+e(r.rule)+' · phiên bản '+Number(r.policyVersion||1)+'</p><p>Người ghi nhận: '+e(r.reportedBy||'Không có thông tin')+'</p><p>Người xử lý: '+e(r.assigneeName||'Chưa phân công')+'</p>'+(alloc?'<p>Phân bổ đã có từ Engine/quản lý:</p><ul>'+alloc+'</ul>':'<p>Không có kết luận quy cá nhân trong hồ sơ này.</p>')+(parts?'<ul>'+parts+'</ul>':evidence(r))+'<h3>10 thay đổi gần nhất</h3>'+snap.docs.map(d=>{const h=d.data();return '<p>'+e(qlFmtDT(h.at))+' · '+e(h.reason)+'</p>';}).join('');
 }catch(e){const b=document.getElementById('autoEvidence');if(b===evidenceNode&&scope===alertUiScope())b.textContent='Không tải được bằng chứng: '+(e.message||e);}
}
function autoGoSource(i){
 const r=autoRows[i];if(!r)return;
 ++autoRequest;closeEditSheet(true);closeTodayHealth(false);
 if(r.kind==='expenses'){curEntryTab='exp';switchScreen('entry');}
 else if(r.kind==='duty_cases'||r.linkedDutyId){dutyTab='cases';dutyFilter='all';if(/^\d{4}-\d{2}-\d{2}$/.test(r.businessDate||''))dutyFrom=dutyTo=r.businessDate;goKho('duty');}
 else if(r.kind==='stock_containers'&&r.sourceId&&typeof ctnShowDetail==='function')ctnShowDetail(r.sourceId);
 else if(r.kind==='stock_containers')goContainers(r.rule==='LOT_EXPIRED'?'expired':r.rule==='LABEL_PENDING'?'unlabeled':'review');
 else if(r.kind==='prep_batches'&&r.sourceId&&typeof ctnShowDetail==='function')ctnShowDetail(r.sourceId,'prep_batches_gieogieo');
 else if(r.kind==='prep_batches')goKho2('prep');
 else if(r.kind==='inventory_items')goKho('items',r.rule==='STOCK_NEGATIVE'?'negative':'low');
 else if(r.kind==='stock_counts'){scTab='pending';goKho('stockcount');}
 else if(r.kind==='purchase_orders'){poTab='po';fixRecPoId=null;goKho('po');}
 else if(String(r.kind||'').endsWith('_transactions')&&r.businessDate)openWasteDetailSheet(r.businessDate);
 else if(r.kind==='daily_openings'||r.kind==='daily_closings'){cashViewDate=r.businessDate||r.sourceId;goEntry('cash');}
 else {renderAlertInboxLegacy().catch(e=>showError(e.message||e));}
}
async function autoSettings(){
 const scope=alertUiScope(),uiState=autoState(),ref=fstore.collection('duty_digests_gieogieo').doc('_automation_config');
 closeTodayHealth(false);openEditSheet('Tự động · người phụ trách','<div id="autoSettingsBody">Đang tải…</div>');
 const settingsNode=document.getElementById('autoSettingsBody');
 try{
  const [snap,emps]=await Promise.all([ref.get(),loadEmployees()]);if(scope!==alertUiScope()||document.getElementById('autoSettingsBody')!==settingsNode)return;
  const c=snap.exists?snap.data():{},e=escapeHtmlAttr;
  const options=(role,backup=false)=>'<option value="">Chưa phân công</option>'+emps.filter(x=>x.active!==false).map(x=>'<option value="'+e(x.id)+'" '+((backup?c.backups:c.owners)?.[role]?.id===x.id?'selected':'')+'>'+e(x.fullName||x.id)+'</option>').join('');
  const b=document.getElementById('autoSettingsBody');if(!b)return;
  const fld=(id,label,control)=>'<div class="field"><label for="'+id+'">'+label+'</label>'+control+'</div>';
  b.innerHTML='<p class="ax-intro">Dùng chung hồ sơ và Unit Engine hiện tại. Hệ thống không tự duyệt chi, không trừ lương và không sửa tồn.</p>'
   +'<section class="ax-sec"><h3>Người phụ trách</h3><p class="ax-sub">Chọn từ danh sách nhân viên. Làm một mình thì chọn chính mình cho cả hai ô «Phụ trách»; hai ô «Thay thế» có thể để trống.</p><div class="ax-grid">'
   +fld('autoOwnerOperations','Phụ trách vận hành','<select id="autoOwnerOperations">'+options('operations')+'</select>')+fld('autoOwnerStock','Phụ trách kho','<select id="autoOwnerStock">'+options('stock')+'</select>')
   +fld('autoBackupOperations','Thay thế vận hành','<select id="autoBackupOperations">'+options('operations',true)+'</select>')+fld('autoBackupStock','Thay thế kho','<select id="autoBackupStock">'+options('stock',true)+'</select>')+'</div></section>'
   +'<section class="ax-sec"><h3>Cách hoạt động</h3><div class="ax-grid">'
   +fld('autoMode','Chế độ','<select id="autoMode"><option value="shadow">Đối chiếu thử — giữ cảnh báo hiện tại</option><option value="active" '+(c.mode==='active'?'selected':'')+'>Tự xử lý theo chính sách</option></select>')
   +fld('autoLowValue','Khoản nhỏ chỉ ghi nhận (đ)','<input type="number" min="0" id="autoLowValue" value="'+Number(c.lowValueLimit||0)+'"><small class="ax-hint">0 = không áp dụng</small>')+'</div>'
   +'<label class="ax-check"><input type="checkbox" id="autoFleet" '+(c.fleet20Confirmed?'checked':'')+'><span><b>Các máy đã tải lại bản mới nhất</b><small>Cần Engine v20 trở lên (hiện là v21). Chỉ tick khi mọi máy POS và máy quản lý đã mở lại bản mới.</small></span></label></section>'
   +'<section class="ax-sec"><h3>Dữ liệu ban đầu</h3><div class="ax-grid">'+fld('autoStart','Đọc bổ sung sổ hao hụt từ ngày','<input type="date" id="autoStart" value="'+e(c.startDate||dkey(vnDate(Date.now()-7*86400000)))+'">')+'</div>'
   +'<p class="ax-sub">Các cảnh báo và phiếu đang chờ vẫn được nạp đủ, kể cả trước mốc này. Sổ hao hụt tối đa 31 ngày cho lần khởi tạo.</p></section>'
   +'<label class="ax-check ax-main"><input type="checkbox" id="autoEnabled" '+(c.enabled?'checked':'')+'><span><b>Bật tự động cho điểm bán này</b><small>Chọn «Đối chiếu thử» ở trên thì chỉ ghi hồ sơ để so sánh, chưa thay các cảnh báo hiện có. Tắt thì giữ nguyên mọi thiết lập.</small></span></label>'
   +'<div class="ax-foot"><button class="btn" id="autoSave">Lưu thiết lập</button><p id="autoSaveError" class="ax-msg"></p></div>';
  document.getElementById('autoSave').onclick=async()=>{
   const button=document.getElementById('autoSave');button.disabled=true;
   try{
    if(scope!==alertUiScope())throw Error('Điểm bán đã đổi; mở lại thiết lập.');
    if(document.getElementById('autoSettingsBody')!==settingsNode)return;
    const start=document.getElementById('autoStart').value,enabled=document.getElementById('autoEnabled').checked;
    if(!enabled){if(c.enabled){const batch=fstore.batch();batch.set(ref,{enabled:false,updatedAt:new Date().toISOString(),by:'quanlygieo2'},{merge:true});batch.set(autoRoot(),{enabled:false},{merge:true});await batch.commit();autoInvalidate(uiState);}if(scope===alertUiScope()&&document.getElementById('autoSettingsBody')===settingsNode)closeEditSheet(true);toast('Đã tắt tự động; giữ các thiết lập và lịch sử.');return;}
    const age=Date.parse(dkey(vnDate())+'T00:00:00+07:00')-Date.parse(start+'T00:00:00+07:00');
    if(!Number.isFinite(age)||age<0||((!c.enabled||start!==c.startDate)&&age>31*86400000))throw Error('Chọn ngày trong 31 ngày gần nhất.');
    const backups={};for(const [role,id] of [['operations','autoBackupOperations'],['stock','autoBackupStock']]){const emp=emps.find(x=>x.id===document.getElementById(id).value);backups[role]={id:emp?.id||'',name:emp?.fullName||''};}
    const fleet20Confirmed=document.getElementById('autoFleet').checked;
    const mode=document.getElementById('autoMode').value,lowValueLimit=Number(document.getElementById('autoLowValue').value);
    if(enabled&&mode==='active'&&!fleet20Confirmed)throw Error('Cập nhật và tải lại v20 trên các máy trước khi bật xử lý thật.');
    if(!Number.isFinite(lowValueLimit)||lowValueLimit<0)throw Error('Ngưỡng khoản nhỏ không hợp lệ.');
    const owners={};for(const [role,id] of [['operations','autoOwnerOperations'],['stock','autoOwnerStock']]){const emp=emps.find(x=>x.id===document.getElementById(id).value);owners[role]={id:emp?.id||'',name:emp?.fullName||''};}
    if(enabled&&(!owners.operations.id||!owners.stock.id))throw Error('Chọn người phụ trách vận hành và kho trước khi bật.');
    const nextConfig={enabled,mode,fleet20Confirmed,lowValueLimit,disputeDays:7,startDate:start,owners,backups};
    const normalized=x=>JSON.stringify({enabled:!!x.enabled,mode:x.mode||'shadow',fleet20Confirmed:!!x.fleet20Confirmed,lowValueLimit:Number(x.lowValueLimit)||0,disputeDays:7,startDate:x.startDate||'',owners:Object.fromEntries(['operations','stock'].map(k=>[k,{id:x.owners?.[k]?.id||'',name:x.owners?.[k]?.name||''}])),backups:Object.fromEntries(['operations','stock'].map(k=>[k,{id:x.backups?.[k]?.id||'',name:x.backups?.[k]?.name||''}]))});
    if(normalized(c)===normalized(nextConfig)){closeEditSheet(true);toast('Không có thiết lập nào thay đổi.');return;}
    const batch=fstore.batch();batch.set(ref,{...nextConfig,updatedAt:new Date().toISOString(),by:'quanlygieo2'},{merge:true});
    // Re-bootstrap on policy changes, preserving old cases/history. Counts are not reset.
    batch.set(autoRoot(),{enabled,mode,ready:false,bootstrap:{phase:0,cursor:''},lastError:''},{merge:true});await batch.commit();
    autoInvalidate(uiState);if(scope!==alertUiScope()||document.getElementById('autoSettingsBody')!==settingsNode)return;closeEditSheet(true);toast('Đã lưu thiết lập; bộ xử lý nền sẽ tiếp nhận.');await renderStoreHealth('todayHealth');
   }catch(err){const out=document.getElementById('autoSaveError');if(out&&scope===alertUiScope()&&document.getElementById('autoSettingsBody')===settingsNode)out.textContent=err.message||err;button.disabled=false;}
  };
 }catch(err){const b=document.getElementById('autoSettingsBody');if(b===settingsNode&&scope===alertUiScope())b.textContent='Không tải được thiết lập: '+(err.message||err);}
}

async function autoDayReport(){
 const scope=alertUiScope(),root=autoRoot(),today=dkey(vnDate()),from=dkey(vnDate(Date.now()-6*86400000)),e=escapeHtmlAttr;
 closeTodayHealth(false);openEditSheet('Vận hành · 7 ngày gần nhất','<div id="autoDayReport">Đang tải bản tổng hợp…</div>');
 const reportNode=document.getElementById('autoDayReport');
 try{
  const snap=await root.collection('days').where('day','>=',from).where('day','<=',today).orderBy('day','desc').get({source:'server'});
  if(scope!==alertUiScope()||document.getElementById('autoDayReport')!==reportNode)return;const box=document.getElementById('autoDayReport');if(!box)return;
  const all=snap.docs.map(d=>d.data()),days=all.filter(d=>!d.dirty);
  if(!days.length){box.innerHTML='<p>Chưa có ngày nào được tổng hợp hoàn tất trong 7 ngày này'+(all.length?' · '+all.length+' ngày đang cập nhật':'')+'. Chưa đủ dữ liệu để kết luận số lượt hoặc giá trị hao hụt.</p>';return;}
  const sum=k=>days.reduce((n,d)=>n+(Number(d[k])||0),0);
  const items=new Map();for(const d of days)for(const r of d.itemStats||[]){const k=r.kind+':'+r.id,old=items.get(k)||{name:r.name,days:0,value:0};old.days++;old.value+=Number(r.declaredValue)||0;items.set(k,old);}
  box.innerHTML='<p>'+e(from)+' → '+e(today)+'</p><p>'+days.length+' ngày có bản tổng hợp hoàn tất'+(all.length>days.length?' · '+(all.length-days.length)+' ngày đang cập nhật':'')+'. Ngày chưa có bản tổng hợp không được coi là 0.</p>'+
   '<p><b>'+sum('eventCount')+' lượt khai báo hao hụt</b> · '+sum('remakeEventCount')+' lượt đổ/làm lại ly (nằm trong tổng)</p>'+
   '<p>Giá trị WASTE khai báo có giá vốn: <b>'+Math.round(sum('declaredValue')).toLocaleString('vi-VN')+'đ</b></p>'+
   '<p>Giá trị chênh lệch kiểm kê hai chiều: '+Math.round(sum('varianceValue')).toLocaleString('vi-VN')+'đ. Không cộng hai số này thành khoản lỗ mới.</p>'+
   '<p>'+sum('missingCost')+' dòng thiếu giá vốn · '+sum('missingReason')+' dòng thiếu lý do. Người ghi nhận không mặc định là người gây tổn thất.</p>'+
   '<h3>NL/BTP lặp lại ở nhiều ngày</h3>'+[...items.values()].filter(r=>r.days>=2).sort((a,b)=>b.days-a.days).slice(0,10).map(r=>'<p>'+e(r.name)+' · '+r.days+' ngày có khai báo. Cần xem lượng nhập/nấu, bảo quản và dữ liệu trước khi kết luận nguyên nhân.</p>').join('')+
   (!days.length?'<p>Chưa có dữ liệu tổng hợp để đánh giá.</p>':'');
 }catch(err){const box=document.getElementById('autoDayReport');if(box===reportNode&&scope===alertUiScope())box.textContent='Chưa đọc được tổng hợp: '+(err.message||err);}
}

// ── Trung tâm «Tự động & Engine 2» ─────────────────────────────────────────────────────────────────────────────────────────
// Trước đây hai thẻ này chèn vào hộp thông báo (chuông) làm chật khung, không cuộn xem được thông báo. Giờ là một mục menu riêng.
async function autoControlCenter(){
 const scope=alertUiScope();
 if(typeof QL_VIEW==='string'&&!/^gg\d{2}$/.test(QL_VIEW)){toast('Chọn một điểm bán trước');return;}
 try{closeTodayHealth(false);}catch(e){}
 const e=escapeHtmlAttr;
 openEditSheet('Tự động & Engine 2 · '+String(QL_VIEW).toUpperCase(),'<div id="autoCenterBody"><div class="muted">Đang tải…</div></div>');
 const node=document.getElementById('autoCenterBody');
 let sum=null,e2=null,err1='',err2='';
 await Promise.all([
  (async()=>{try{await ensureAuth();sum=await autoSummary();}catch(x){err1=x.message||String(x);}})(),
  (async()=>{try{e2=await Engine2QL.summary();}catch(x){err2=x.message||String(x);}})()
 ]);
 if(scope!==alertUiScope()||document.getElementById('autoCenterBody')!==node)return;
 const live1=!err1&&autoUsable(sum),tag=(ok,t)=>'<span class="ax-tag '+(ok?'ok':'')+'">'+e(t)+'</span>';
 const s1=err1?'Chưa đọc được: '+err1:live1?'Đang chạy — nhịp gần nhất '+qlFmtDT(sum.heartbeatAt):!sum?.enabled?'Chưa bật. Đang dùng các cảnh báo hiện có.':sum.mode==='shadow'?'Đang đối chiếu thử — chưa thay cảnh báo hiện có.':'Chưa có tín hiệu từ bộ xử lý nền. Đang dùng các cảnh báo hiện có.';
 const on2=!!e2?.enabled,act2=on2&&e2.mode==='active'&&e2.fleetConfirmed;
 const s2=err2?'Chưa đọc được: '+err2:!on2?'Chưa bật. Bật ở chế độ đối chiếu thử trước khi áp dụng.':(act2?'Đang tự động phân bổ hao hụt và giao cân tại POS.':'Đang đối chiếu thử — chỉ xem đề xuất, vận hành giữ nguyên.')+' '+((e2.controlledItemIds||[]).length)+' nguyên liệu được theo dõi.';
 node.innerHTML='<section class="wdg wdg-pink ax-card"><div class="wdg-head"><span class="wdg-mark">'+ic('inbox',20)+'</span><span class="wdg-title"><b>Công việc & thông báo tự động</b><small>Giao việc, duyệt chi, nhắc việc tồn</small></span>'+tag(live1,live1?'Đang chạy':'Chưa chạy')+'</div>'
  +'<div class="wdg-body"><p class="ax-sub">'+e(s1)+'</p><div class="ax-actions"><button class="btn" onclick="autoSettings()">Thiết lập người phụ trách</button><button class="btn outline" onclick="closeEditSheet(true);switchScreen(\'inbox\')">Mở hộp thư cảnh báo</button></div></div></section>'
  +'<section class="wdg wdg-blue ax-card"><div class="wdg-head"><span class="wdg-mark">'+ic('detective',20)+'</span><span class="wdg-title"><b>Engine 2 · Kiểm soát hao hụt</b><small>Phân bổ trách nhiệm, giao cân, tự học</small></span>'+tag(act2,act2?'Tự động':on2?'Đối chiếu thử':'Tắt')+'</div>'
  +'<div class="wdg-body"><p class="ax-sub">'+e(s2)+'</p><div class="ax-actions"><button class="btn" onclick="Engine2QL.open()">Xem kết quả</button><button class="btn outline" onclick="Engine2QL.settings()">Thiết lập</button></div></div></section>';
}
if(typeof NAV_SECTIONS!=='undefined'){const g=NAV_SECTIONS.find(x=>x.group==='Phân tích & dữ liệu');if(g&&!g.items.some(i=>i.key==='auto'))g.items.push({key:'auto',ic:'sliders',label:'Tự động & Engine 2',go:'autoControlCenter()',sub:'Phụ trách, thiết lập, kết quả'});}
