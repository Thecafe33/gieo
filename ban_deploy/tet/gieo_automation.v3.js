/* Shared decision policy for quanlygieo2 and the Firebase worker.
 * Existing UnitEngine remains the authority for inventory, verification and responsibility.
 * This module never changes stock, money, payroll or employee attribution. */
(function(root){
'use strict';
const VERSION=3, HOUR=3600000;
const kinds=['alerts','duty_cases','stock_transactions','prep_transactions','stock_containers','prep_batches','inventory_items','stock_counts','purchase_orders','expenses','daily_openings','daily_closings','duty_tasks'];
const text=x=>String(x==null?'':x);
const time=x=>x&&typeof x.toMillis==='function'?x.toMillis():typeof x==='number'?x:Date.parse(x||'')||0;
function parseCollection(collection){
 const m=/^(.+)_gieogieo(?:__(gg\d{2}))?$/.exec(collection);
 return m&&kinds.includes(m[1])?{kind:m[1],storeId:m[2]||'gg01'}:null;
}
function collection(kind,store){
 if(!/^gg\d{2}$/.test(store))throw Error('Điểm bán không hợp lệ');
 return kind+'_gieogieo'+(store==='gg01'?'':'__'+store);
}
function stable(x){
 if(x===undefined)return 'null';
 if(x===null||typeof x!=='object')return JSON.stringify(x);
 if(typeof x.toMillis==='function')return String(x.toMillis());
 if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
}
function relevant(kind,before,after){
 if(!kinds.includes(kind))return false;
 if(kind.endsWith('_transactions'))return [before,after].some(d=>d&&String(d.type).toUpperCase()==='WASTE');
 if(kind==='inventory_items'){
  const bucket=d=>!d||d.active===false||d.stockManaged===false?'none':Number(d.currentStock)<0?'negative':Number(d.minStock)>0&&Number(d.currentStock)<Number(d.minStock)?'low':'ok';
  return bucket(before)!==bucket(after)||text(before&&before.name)!==text(after&&after.name);
 }
 const watched={stock_containers:['status','needsReview','expiresAt','labelPrinted','receivedAt','code'],prep_batches:['status','needsReview','expiresAt','code'],daily_openings:['businessDate','status'],daily_closings:['businessDate','status']};
 if(watched[kind]){const pick=d=>d&&Object.fromEntries(watched[kind].map(k=>[k,d[k]??null]));return stable(pick(before))!==stable(pick(after));}
 return stable(before)!==stable(after);
}
function task(kind,id,d,config,now,related){
 const role=['stock_containers','prep_batches','inventory_items','stock_counts','purchase_orders'].includes(kind)?'stock':'operations';
 const primary=(config.owners||{})[role]||{},backup=(config.backups||{})[role]||{};
 const who=primary.id?primary:backup;
 const r={kind,sourceId:id,title:'Cần đối chiếu chứng từ',group:'working',state:'pending',role,
  backupId:text(backup.id),backupName:text(backup.name),entityId:text(d&&(d.prepId||d.itemId)),
  assigneeId:text(who.id),assigneeName:text(who.name),reason:'Chưa có đủ bằng chứng để tự kết thúc.',
  rule:'SOURCE_PENDING',businessDate:text(d&&d.businessDate),nextCheckAt:0,policyVersion:VERSION,
  deadlineAt:0,resultStatus:'waiting_verification',confidence:text(d&&d.confidence)||'none',
  sourceStatus:text(d&&d.status),reportedBy:text(d&&(d.staff||d.employeeName)),
  allocations:[],pool:[],value:null,
  evidence:{sourceId:id,quantity:d&&Number.isFinite(Number(d.qty))?Number(d.qty):null,unit:text(d&&d.unit),reason:text(d&&(d.reason||d.note)),fifoAllocationCount:Array.isArray(d&&d.fifoAllocations)?d.fifoAllocations.length:0}};
 const done=(reason,rule='SOURCE_COMPLETE')=>Object.assign(r,{group:'done',state:'recorded',resultStatus:'recorded',reason,rule,nextCheckAt:0});
 const watch=(at,reason)=>Object.assign(r,{group:'watch',state:'watching',nextCheckAt:at,reason});
 if(!d)return done('Chứng từ nguồn đã bị xoá. Lịch sử xử lý được giữ lại.','SOURCE_REMOVED');
 if(kind==='expenses'){
  r.title='Chi phí: '+text(d.description||d.note||d.categoryName||id);
  r.value=d.amount!=null&&String(d.amount).trim()!==''&&Number.isFinite(Number(d.amount))?Number(d.amount):null;
  return d.status==='pending_review'?Object.assign(r,{group:'approval',role:'owner',assigneeId:'',assigneeName:'Chủ quán',reason:'Chờ chủ quán duyệt khoản chi.',rule:'EXPENSE_APPROVAL'}):done('Khoản chi không còn chờ duyệt.');
 }
 if(kind==='duty_tasks'){
  if(['open','processing'].includes(d.status))return Object.assign(r,{group:'watch',rule:'VERIFY_CLOCK',nextCheckAt:time(d.expireAt)||now+15*60000,reason:'Theo dõi hạn xác minh của Unit Engine.'});
  return done('Việc xác minh đã kết thúc.','NO_ACTION');
 }
 if(kind==='duty_cases'){
  r.title='Lệch kiểm kê · '+text(d.prepName||d.itemName||id);
  r.allocations=Array.isArray(d.allocations)?d.allocations:[];r.pool=Array.isArray(d.pool)?d.pool:[];
  r.value=d.value!=null&&String(d.value).trim()!==''&&Number.isFinite(Number(d.value))?Number(d.value):null;
  if(['auto','manual','closed_pool','no_checkpoint'].includes(d.status)){
   r.state=d.status;
   const result=done(d.status==='manual'?'Giữ nguyên quyết định của quản lý.':d.status==='auto'?'Unit Engine đã phân bổ; xem căn cứ và độ tin cậy trong hồ sơ.':'Engine đã ghi nhận phần chưa quy cá nhân. Không phát sinh thêm hao hụt.','ENGINE_RESULT');
   result.resultStatus=d.status==='manual'?'manual':d.closedReason==='policy_insufficient_evidence'?'policy_closed':d.allocations?.length?'allocated':'insufficient';
   if(d.status==='manual')result.state='manual';return result;
  }
  if(['contested','dispute'].includes(d.status)){r.deadlineAt=(time(d.contest?.at)||time(d.verification?.at)||time(d.createdAt))+(Number(config.disputeDays)||7)*24*HOUR;r.nextCheckAt=r.deadlineAt;}
  if(d.status==='pending_verify')r.deadlineAt=time(d.createdAt)?time(d.createdAt)+48*HOUR:0;
  r.rule='ENGINE_VERIFY';r.reason=['contested','dispute'].includes(d.status)?'Đang tranh chấp. Giữ nguyên bằng chứng, giao người phụ trách xem xét.':'Chờ kết quả cân lại từ quy trình xác minh của Unit Engine.';
  return r;
 }
 if(kind.endsWith('_transactions')){
  if(d.voided===true||String(d.type).toUpperCase()!=='WASTE')return done('Dòng sổ không còn là hao hụt hiệu lực.','NO_ACTION');
  r.title='Hao hụt đã ghi · '+text(d.itemName||d.prepName||d.itemId||d.prepId||id);
  r.reportedBy=text(d.staff);r.eventId=text(d.wasteEventId||id);
  if(String(d.type).toUpperCase()!=='WASTE')return done('Dòng sổ đã được đổi loại; không còn là hao hụt.');
  r.value=d.totalCost!=null&&Number.isFinite(Number(d.totalCost))?Math.abs(Number(d.totalCost)):null;
  // Reporting a loss is not proof of causing it; preserve verified/manual attribution only.
  if(d.responsibility&&d.responsibility.status==='assigned_by_manager')r.allocations=[d.responsibility];
  if(d.fromPrepCount||d.wasteKind==='shift_weigh'||d.dutyCaseId)return done('Chênh lệch được theo dõi trong quy trình kiểm kê của Engine; không cộng lần hai.','ENGINE_COUNT_LINK');
  if(!(d.reason||d.note)&&Number(config.lowValueLimit)>0&&r.value!=null&&r.value<=Number(config.lowValueLimit))return Object.assign(done('Đã ghi nhận khoản nhỏ; thiếu lý do được tính vào chất lượng nhập liệu.','WASTE_SMALL'),{resultStatus:'insufficient',dataQualityIssue:true});
  if(!(d.reason||d.note))return Object.assign(r,{reason:'Hao hụt đã ghi vào sổ; người phụ trách cần bổ sung lý do. Không mặc định quy lỗi cho người báo.',rule:'WASTE_REASON_MISSING'});
  return done('Đã ghi vào sổ hao hụt. Người báo là người ghi nhận, không tự coi là người gây ra.','WASTE_RECORDED');
 }
 if(kind==='alerts'){
  r.title=text(d.title||({'handover_variance':'Chênh lệch giao ca nguyên liệu','prep_count_variance':'Lệch đếm BTP','missing_recipe':'Thiếu định mức'}[d.type])||'Cảnh báo vận hành');
  if(d.status==='resolved')return done('Chứng từ nguồn đã được xác nhận xử lý.','SOURCE_RESOLVED');
  // Seen is deliberately NOT equivalent to resolved.
  if(d.type==='duty_digest')return done('Tóm tắt ngày đã lưu; công việc được theo dõi ở từng hồ sơ.','DIGEST_RECORDED');
  if(d.type==='duty_case'&&related&&related.duty)return Object.assign(task('duty_cases',d.caseId,related.duty,config,now),{kind,sourceId:id,linkedDutyId:d.caseId});
  if(d.type==='prep_count_variance'&&related&&related.duty)return Object.assign(task('duty_cases',related.dutyId,related.duty,config,now),{kind,sourceId:id,linkedDutyId:related.dutyId});
  r.reason=d.type==='prep_yield_mismatch'?'Engine đã dùng số cân thật cho giá vốn; người phụ trách kiểm tra cấu hình dự báo.':'Giao người phụ trách đối chiếu. Chỉ kết thúc khi nguồn nghiệp vụ có kết quả.';
  return r;
 }
 if(kind==='stock_containers'||kind==='prep_batches'){
  const label=kind==='stock_containers'?'Tem nguyên liệu':'Lô BTP';r.title=label+' · '+text(d.code||d.itemName||d.prepName||id);
  // A finished container may still require review; finishing is not approval.
  if(d.needsReview && !['voided','cancelled','discarded','expired','lost'].includes(d.status))return Object.assign(r,{reason:'Cần đối chiếu kết quả cân/báo hết. Không phục hồi tồn theo số cân cũ.',rule:'LOT_REVIEW'});
  const terminal=['finished','voided','used_up','discarded','cancelled','expired','lost'].includes(d.status);
  if(terminal)return done('Tem/lô đã kết thúc trong Engine; giao dịch hao hụt được theo dõi ở sổ.','LOT_COMPLETE');
  const expiry=time(d.expiresAt);
  if(expiry&&expiry<=now)return Object.assign(r,{reason:'Đã quá hạn. Giao người phụ trách kiểm tra và xử lý đúng tem/lô; không tự huỷ hàng vật lý.',rule:'LOT_EXPIRED'});
  if(d.needsReview)return Object.assign(r,{reason:'Cần đối chiếu kết quả cân/báo hết. Không phục hồi tồn theo số cân cũ.',rule:'LOT_REVIEW'});
  const labelDue=kind==='stock_containers'&&d.status==='sealed'&&d.labelPrinted!==true&&time(d.receivedAt)?time(d.receivedAt)+48*HOUR:0;
  if(labelDue&&labelDue<=now)return Object.assign(r,{reason:'Tem chưa dán quá 2 ngày. Giao người phụ trách kho kiểm tra.',rule:'LABEL_PENDING'});
  const due=[expiry,labelDue].filter(t=>t>now);
  return due.length?watch(Math.min(...due),'Đang theo dõi thời hạn của tem/lô.'):done('Không có việc cần xử lý trên tem/lô.','NO_ACTION');
 }
 if(kind==='inventory_items'){
  r.title='Tồn kho · '+text(d.name||id);
  if(d.stockManaged===false||d.active===false)return done('Nguyên liệu không quản lý tồn hoặc đã ngừng sử dụng.','NO_ACTION');
  const qty=Number(d.currentStock);
  if(Number.isFinite(qty)&&qty<0)return Object.assign(r,{rule:'STOCK_NEGATIVE',reason:'Tồn đang âm. Cần đối chiếu chứng từ; không tự đưa tồn về 0.'});
  if(Number(d.minStock)>0&&qty<Number(d.minStock))return Object.assign(r,{rule:'STOCK_LOW',reason:'Dưới ngưỡng tồn. Giao phụ trách kho, tự hết khi nhận/refill đủ.'});
  return done('Tồn không còn ở ngưỡng cảnh báo.','NO_ACTION');
 }
 if(kind==='stock_counts'){
  r.title='Phiếu kiểm kê · '+text(d.businessDate||id);
  return d.status==='pending_review'?Object.assign(r,{rule:'COUNT_REVIEW',reason:'Người phụ trách kho đối chiếu và duyệt theo quy trình Engine; không tự duyệt chênh lệch chưa xác minh.'}):done('Phiếu kiểm kê không còn chờ duyệt.');
 }
 if(kind==='purchase_orders'){
  r.title='Nhận hàng · '+text(d.code||id);
  return ['pending','partial'].includes(d.status)?Object.assign(r,{rule:'RECEIVING_PENDING',reason:'Đơn chưa nhận đủ. Người phụ trách kho theo dõi; tự kết thúc khi nguồn đổi trạng thái.'}):done('Đơn hàng không còn chờ nhận.');
 }
 if(kind==='daily_openings'||kind==='daily_closings'){
  r.title='Kết ca · '+text(d.businessDate||id);
  if(related&&related.closing&&related.closing.status==='closed')return done('Ngày đã đóng sổ.','DAY_CLOSED');
  if(kind==='daily_closings'&&d.status==='closed')return done('Ngày đã đóng sổ.','DAY_CLOSED');
  const day=text(d.businessDate||id);
  const tomorrow=Date.parse(day+'T23:59:59+07:00')+1;
  if(!Number.isFinite(tomorrow))return Object.assign(r,{reason:'Ngày nghiệp vụ không hợp lệ, cần kiểm tra nguồn.'});
  return tomorrow>now?watch(tomorrow,'Ca đang diễn ra.'):Object.assign(r,{rule:'DAY_NOT_CLOSED',reason:'Ngày đã qua nhưng chưa đóng sổ. Giao người phụ trách ca hoàn tất.'});
 }
 return r;
}
function counterDelta(previous,next){
 const counts={approval:0,working:0,done:0,watch:0};
 for(const [r,n] of [[previous,-1],[next,1]])if(r&&r.visible!==false&&Object.hasOwn(counts,r.group)&&!['NO_ACTION','SOURCE_REMOVED','ENGINE_COUNT_LINK'].includes(r.rule))counts[r.group]+=n;
 return counts;
}
const api={VERSION,HOUR,kinds,parseCollection,collection,stable,time,relevant,task,counterDelta};
if(typeof module==='object'&&module.exports)module.exports=api;
root.GieoAutomation=api;
})(typeof window!=='undefined'?window:globalThis);
