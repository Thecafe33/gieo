/* Unit Engine 2 — independent auditor v1 (lộ trình B0).
 * READ-ONLY: only .get() is ever called. Does NOT load unit_engine2_v1.js; every rule is re-derived
 * from raw sources (stock_transactions, stock_containers, employee_shifts, checkpoints) so that a bug
 * in the decision code cannot certify itself. Published versions are immutable. */
(function(root){
'use strict';
const VERSION=1,EPS=0.005;
// [severity, message]. violation = bất biến vỡ; warning = thiếu căn cứ / chưa có hiệu lực.
const CODES={
 STORE_MISMATCH:['violation','Bản ghi Engine 2 hoặc nguồn thuộc quán khác'],
 SOURCE_MISSING:['violation','Hồ sơ còn hiệu lực nhưng không còn dòng hao hụt gốc'],
 SOURCE_VOIDED_CASE_ACTIVE:['violation','Nguồn đã huỷ/không còn là hao hụt nhưng hồ sơ vẫn phân bổ'],
 QUANTITY_SOURCE_MISMATCH:['violation','Lượng hồ sơ khác lượng dòng hao hụt gốc'],
 ALLOCATION_QTY_MISMATCH:['violation','Tổng lượng phân bổ + chưa phân bổ khác lượng hồ sơ'],
 ALLOCATION_MONEY_MISMATCH:['violation','Tổng tiền phân bổ + chưa phân bổ khác số tiền hồ sơ'],
 MONEY_WITHOUT_VALUATION:['violation','Có số tiền nhưng không có căn cứ giá (hoặc ngược lại)'],
 VALUATION_SOURCE_MISMATCH:['violation','Số tiền khác căn cứ giá được ghi'],
 DUPLICATE_PERSON:['violation','Một người xuất hiện hai lần trong phân bổ'],
 MANUAL_OVERRIDDEN:['violation','Quyết định tay trên nguồn bị phân bổ lại'],
 SPEC_WITHOUT_LOT_EVIDENCE:['violation','Kết luận «nghi sai quy cách» khi không có mã cùng loại cùng phiếu nhận đã dùng xong cũng còn dư gần cùng tỷ lệ'],
 SPEC_WAIT_WITHOUT_SIBLING:['violation','Hồ sơ «chờ mã cùng phiếu» khi phiếu nhận không còn mã cùng loại chưa dùng xong — phải kết luận'],
 SPEC_ALLOCATED:['violation','Hồ sơ chờ / nghi sai quy cách lại phân bổ trách nhiệm cho người'],
 INTERVAL_INVALID:['violation','Khoảng trách nhiệm sai (ngoài thời gian mở/kết thúc tem)'],
 CHECKPOINT_MISSING:['violation','Khoảng bắt đầu từ mốc cân không còn bản ghi'],
 CHECKPOINT_WRONG_OBJECT:['violation','Mốc cân không thuộc đúng tem/nguyên liệu'],
 CHECKPOINT_INVALID:['violation','Mốc cân không hợp lệ'],
 INTERVAL_CHECKPOINT_MISMATCH:['violation','Đầu khoảng không trùng thời điểm mốc cân'],
 INTERVAL_IGNORED_CHECKPOINT:['violation','Có mốc cân hợp lệ nằm trong khoảng nhưng không được dùng'],
 INTERVAL_OVERLAP:['violation','Hai hồ sơ cùng tem có khoảng trách nhiệm chồng nhau'],
 ELIGIBLE_MISSING:['violation','Pha chế có ca trong khoảng nhưng không được phân bổ'],
 INELIGIBLE_ALLOCATED:['violation','Người không có ca pha chế trong khoảng bị phân bổ'],
 DECISION_LOG_MISSING:['violation','Không có bản ghi quyết định tương ứng hồ sơ'],
 DECISION_LOG_MISMATCH:['violation','Hồ sơ khác bản ghi quyết định cùng mã (bị ghi đè)'],
 DUPLICATE_LOSS_CASE:['violation','Một dòng hao hụt có nhiều hồ sơ còn hiệu lực'],
 SHADOW_EFFECT:['violation','Hồ sơ đối chiếu thử đã bật kiểm soát/giao việc'],
 WASTE_EXCEEDS_UNIT:['violation','Tổng hao hụt của một tem vượt dung tích tem (WASTE đúp)'],
 FINISH_WASTE_OPEN_UNIT:['violation','Có hao hụt báo hết nhưng tem chưa kết thúc'],
 CHECKPOINT_NO_DENSITY:['violation','Mốc cân ml/l không có tỷ trọng'],
 CHECKPOINT_BAD_TARE:['violation','Mốc cân có bì âm hoặc số tổng nhỏ hơn bì'],
 CHECKPOINT_NET_MISMATCH:['violation','Lượng ròng của mốc khác số tính lại từ số tổng − bì'],
 MEASUREMENT_LEDGER_MISSING:['violation','Lượt cân thiếu hàng nhưng không có dòng hao hụt'],
 MEASUREMENT_LEDGER_MISMATCH:['violation','Dòng hao hụt của lượt cân khác chênh lệch đo'],
 TASK_BAD_STATUS:['violation','Việc có trạng thái không có trong đặc tả'],
 CASE_BAD_STATUS:['violation','Hồ sơ có trạng thái không có trong đặc tả'],
 TASK_DONE_WITHOUT_RESULT:['violation','Việc báo xong nhưng không có kết quả cân hợp lệ'],
 TASK_STATE_INCONSISTENT:['violation','Việc kết thúc nhưng vẫn đánh dấu còn chờ'],
 LOCK_STALE:['violation','Khoá cân treo: lượt cân đã kết thúc hoặc không tồn tại'],
 CONTROL_BELOW_FLOOR:['violation','Mức kiểm soát thấp hơn mức sàn quản lý đặt'],
 CONTROL_BAD_LEVEL:['violation','Mức kiểm soát ngoài 0–3'],
 CONTROL_NOT_PUBLISHED:['violation','Món đang kiểm soát nhưng POS không nhận được (thiếu trong danh sách)'],
 CLEAN_SAMPLE_INVALID:['violation','Ngoại lệ / không có mã mở được tính là mẫu sạch để hạ mức'],
 CONTROL_NOT_ACKED:['warning','Chưa máy POS nào xác nhận kiểm soát — biện pháp chưa có hiệu lực'],
 DEVICE_STALE:['warning','Có máy POS chưa nhận thiết lập mới nhất'],
 CASE_NOT_CREATED:['warning','Báo hết trong phạm vi chưa có hồ sơ và không có việc chờ xử lý'],
 SOURCE_CHANGED_AFTER_DECISION:['warning','Nguồn sửa sau quyết định, chưa có việc tính lại'],
 UNIT_CHANGED_SINCE:['warning','Đơn vị nguyên liệu đổi sau mốc cân'],
 OPEN_SHIFT_IN_INTERVAL:['warning','Ca chưa check-out giao khoảng — không xác định chắc nhóm pha chế']
};
const CASE_STATUS=['new','checking','ready','decided','review','closed','voided','superseded'];
const TASK_STATUS=['queued','claimed','in_progress','waiting_dependency','retry_wait','exception_recorded','done','superseded','cancelled'];
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():typeof v==='number'?v:Date.parse(v||'');
const num=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
const near=(a,b,eps=EPS)=>Math.abs(Number(a)-Number(b))<=eps;
const sum=(rows,f)=>(rows||[]).reduce((s,r)=>s+(Number(f(r))||0),0);
const stable=v=>v===undefined?'null':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
function storeId(id){if(!/^gg\d{2}$/.test(id))throw Error('Kiểm toán: điểm bán không hợp lệ');return id;}
// Bảng DÙNG CHUNG mọi quán (loại G trong data_access) — không thêm hậu tố quán. Test đối chiếu với GieoData.REG.
const SHARED=['price_history','prep_vessels','employees','recipes','recipe_history','prep_recipe_history','special_days'];
const collName=(kind,store)=>kind+'_gieogieo'+(store==='gg01'||SHARED.includes(kind)?'':'__'+store);
const lastSeg=p=>String(p||'').split('/').pop();
const active=c=>!['voided','superseded'].includes(c.status);

/* Pure check over a collected snapshot. Never throws on bad data: every anomaly is an issue. */
function check(snap){
 const store=storeId(snap.store),issues=[],add=(code,ref,detail)=>issues.push({code,severity:CODES[code][0],message:CODES[code][1],ref,detail:detail||null});
 const S=snap.sources||{},C=snap.containers||{},RC=snap.receipts||null,CP=snap.checkpoints||{},D=snap.decisions||{},M=snap.measurements||{},P=snap.prices||{},I=snap.items||{},R=snap.requests||{};
 const txPrefix=collName('stock_transactions',store)+'/',cases=snap.cases||[],cfg=snap.config||{};
 const isActiveCfg=cfg.enabled===true&&cfg.mode==='active';
 const sourceActive=s=>s&&s.type==='WASTE'&&s.voided!==true&&Number(s.qty)<0;
 const unitOf=s=>s&&(s.containerId||s.referenceId);
 // --- cases ---
 const bySource=new Map(),byUnit=new Map();
 for(const c of cases){
  const ref='cases/'+c.id;
  if(c.storeId!==store||(c.sourcePath&&!String(c.sourcePath).startsWith(txPrefix)))add('STORE_MISMATCH',ref,{storeId:c.storeId,sourcePath:c.sourcePath});
  if(c.status!==undefined&&!CASE_STATUS.includes(c.status))add('CASE_BAD_STATUS',ref,{status:c.status});
  if(!active(c))continue;
  if(!bySource.has(c.sourceId))bySource.set(c.sourceId,[]);bySource.get(c.sourceId).push(c);
  const s=S[c.sourceId];
  if(!s){if(c.status!=='voided'&&Number(c.quantity)>0)add('SOURCE_MISSING',ref,{sourceId:c.sourceId});}
  else if(!sourceActive(s)){if(Number(c.quantity)>0||(c.allocations||[]).length)add('SOURCE_VOIDED_CASE_ACTIVE',ref,{sourceId:c.sourceId});continue;}
  else if(!near(c.quantity,-Number(s.qty)))add('QUANTITY_SOURCE_MISMATCH',ref,{case:c.quantity,source:-Number(s.qty)});
  const alloc=c.allocations||[];
  if(!near(sum(alloc,a=>a.qty)+(Number(c.pending?.qty)||0),c.quantity))add('ALLOCATION_QTY_MISMATCH',ref,{allocated:sum(alloc,a=>a.qty),pending:c.pending?.qty||0,quantity:c.quantity});
  const hasAmount=c.amount!==null&&c.amount!==undefined;
  if(hasAmount&&!near(sum(alloc,a=>a.value)+(Number(c.pending?.value)||0),c.amount))add('ALLOCATION_MONEY_MISMATCH',ref,{allocated:sum(alloc,a=>a.value),amount:c.amount});
  if(hasAmount!==(c.valuation?.status==='known')||(!hasAmount&&alloc.some(a=>a.value!==null&&a.value!==undefined)))add('MONEY_WITHOUT_VALUATION',ref,{amount:c.amount,valuation:c.valuation?.status||null});
  if(hasAmount&&s){
   const v=c.valuation||{};
   if(v.method==='source_totalCost'&&num(s.totalCost)&&!near(c.amount,Math.abs(Number(s.totalCost)),0.01))add('VALUATION_SOURCE_MISMATCH',ref,{amount:c.amount,totalCost:s.totalCost});
   if(v.method==='price_history'){const p=P[v.priceId];if(!p||!near(c.amount,Math.round(-Number(s.qty)*Number(p.price)*100)/100,0.01))add('VALUATION_SOURCE_MISMATCH',ref,{amount:c.amount,priceId:v.priceId,price:p?p.price:null});}
  }
  if(new Set(alloc.map(a=>a.employeeId)).size!==alloc.length)add('DUPLICATE_PERSON',ref);
  if(c.decisionMode==='manual'&&(alloc.length||!near(Number(c.pending?.qty)||0,c.quantity)))add('MANUAL_OVERRIDDEN',ref);
  // Luật sai quy cách (chủ quán 23/10) — viết lại ĐỘC LẬP với lõi: chỉ kết luận theo mã cùng loại cùng phiếu nhận.
  if(['spec_mismatch','waiting_sibling'].includes(c.basis)){
   if(alloc.length)add('SPEC_ALLOCATED',ref);
   const me=C[c.containerId],lot=me&&me.receiveRefId?Object.values(C).filter(x=>x.id!==me.id&&x.itemId===me.itemId&&x.receiveRefId===me.receiveRefId&&!['voided','cancelled'].includes(x.status)):[];
   const f=me&&Number(me.baseQty)>0?((Number(c.quantity)||0)+cases.filter(k=>k.containerId===me.id&&k.originKind==='measurement'&&k.status!=='voided').reduce((a,k)=>a+(Number(k.quantity)||0),0))/Number(me.baseQty):0,msr=id=>cases.filter(k=>k.containerId===id&&k.originKind==='measurement'&&k.status!=='voided').reduce((a,k)=>a+(Number(k.quantity)||0),0),fr=x=>Number(x.baseQty)>0?((Number(x.wasteBase)||0)+msr(x.id))/Number(x.baseQty):0;
   if(RC&&me?.receiveRefId&&!RC[me.receiveRefId])add('SPEC_WITHOUT_LOT_EVIDENCE',ref,{containerId:c.containerId,receiveRefId:me.receiveRefId,reason:'không có phiếu nhận thật'});
   else if(c.basis==='spec_mismatch'&&!lot.some(x=>x.status==='finished'&&fr(x)>=0.15&&Math.abs(fr(x)-f)<=0.1))add('SPEC_WITHOUT_LOT_EVIDENCE',ref,{containerId:c.containerId,receiveRefId:me?.receiveRefId||null});
   if(c.basis==='waiting_sibling'&&!lot.some(x=>x.status!=='finished'))add('SPEC_WAIT_WITHOUT_SIBLING',ref,{containerId:c.containerId});
  }
  // interval vs raw container
  const u=C[c.containerId],iv=c.interval||{},from=ms(iv.from),to=ms(iv.to);
  if(!u||!Number.isFinite(from)||!Number.isFinite(to)||from>=to||from<ms(u.openedAt)-1||(c.originKind==='finish'&&u.finishedAt&&!near(to,ms(u.finishedAt),1)))add('INTERVAL_INVALID',ref,{from:iv.from,to:iv.to,openedAt:u?.openedAt,finishedAt:u?.finishedAt});
  else{
   if(c.containerId&&!byUnit.has(c.containerId))byUnit.set(c.containerId,[]);if(c.containerId)byUnit.get(c.containerId).push(c);
   if(iv.checkpointId&&!String(iv.checkpointId).startsWith('legacy_')){
    const cp=CP[iv.checkpointId];
    if(!cp)add('CHECKPOINT_MISSING',ref,{checkpointId:iv.checkpointId});
    else{if(cp.containerId!==c.containerId)add('CHECKPOINT_WRONG_OBJECT',ref,{checkpointId:cp.id});if(cp.status!=='valid')add('CHECKPOINT_INVALID',ref,{checkpointId:cp.id});if(!near(ms(cp.countedAt),from,1))add('INTERVAL_CHECKPOINT_MISMATCH',ref,{checkpoint:cp.countedAt,from:iv.from});}
   }
   const inside=Object.values(CP).filter(p=>p.containerId===c.containerId&&p.status==='valid'&&ms(p.countedAt)>from+1&&ms(p.countedAt)<to-1);
   if(inside.length)add('INTERVAL_IGNORED_CHECKPOINT',ref,{checkpointIds:inside.map(p=>p.id)});
   // eligibility re-derived from raw shifts (closed shifts must be in; open shifts may be either)
   if(c.basis==='policy_equal_share'&&!snap.truncated?.includes('shifts')){
    const must=new Set(),may=new Set();
    for(const sh of snap.shifts||[]){
     // Chủ quán 22/10: ca không ghi chức năng (thiếu / rỗng) = pha chế; có ghi thì phải có 'barista'. Viết lại độc lập với lõi.
     const roles=Array.isArray(sh.roles)?sh.roles:[];if(!sh.employeeId||(roles.length&&!roles.includes('barista')))continue;
     const a=ms(sh.checkedInAt),b=sh.checkedOutAt?ms(sh.checkedOutAt):NaN;
     if(!Number.isFinite(a)||a>=to)continue;
     if(Number.isFinite(b)){if(b>from)must.add(sh.employeeId);}else may.add(sh.employeeId);
    }
    const got=new Set(alloc.map(a=>a.employeeId)),missing=[...must].filter(x=>!got.has(x)),extra=[...got].filter(x=>!must.has(x)&&!may.has(x));
    if(missing.length)add('ELIGIBLE_MISSING',ref,{missing});if(extra.length)add('INELIGIBLE_ALLOCATED',ref,{extra});
    if([...may].some(x=>!must.has(x)))add('OPEN_SHIFT_IN_INTERVAL',ref,{employees:[...may].filter(x=>!must.has(x))});
   }
  }
  const d=D[c.decisionId];
  if(!d)add('DECISION_LOG_MISSING',ref,{decisionId:c.decisionId});
  else if(!near(d.quantity,c.quantity)||stable((d.allocations||[]).map(a=>[a.employeeId,a.qty,a.value]))!==stable(alloc.map(a=>[a.employeeId,a.qty,a.value])))add('DECISION_LOG_MISMATCH',ref,{decisionId:c.decisionId});
  if(c.mode==='shadow'&&(snap.controls||[]).some(k=>(k.reasonCaseIds||[]).includes(c.id)))add('SHADOW_EFFECT',ref);
  if(s&&s.updatedAt&&ms(s.updatedAt)>ms(c.updatedAt)&&!Object.values(R).some(r=>r.dirty&&r.sourceId===(c.originId||c.sourceId)))add('SOURCE_CHANGED_AFTER_DECISION',ref,{sourceUpdatedAt:s.updatedAt,caseUpdatedAt:c.updatedAt});
 }
 for(const [sid,rows] of bySource)if(rows.length>1)add('DUPLICATE_LOSS_CASE','stock_transactions/'+sid,{cases:rows.map(c=>c.id)});
 for(const [uid,rows] of byUnit){
  const sorted=rows.filter(c=>c.basis!=='manual_source').sort((a,b)=>ms(a.interval.from)-ms(b.interval.from));
  for(let i=1;i<sorted.length;i++)if(ms(sorted[i].interval.from)<ms(sorted[i-1].interval.to)-1)add('INTERVAL_OVERLAP','stock_containers/'+uid,{cases:[sorted[i-1].id,sorted[i].id]});
 }
 // --- raw ledger ---
 const wasteByUnit=new Map();
 for(const [id,s] of Object.entries(S)){
  if(!sourceActive(s))continue;const uid=unitOf(s);if(!uid)continue;
  wasteByUnit.set(uid,(wasteByUnit.get(uid)||0)-Number(s.qty));
  const u=C[uid];
  if(/^finish_.+_WASTE$/.test(id)&&u&&u.status!=='finished')add('FINISH_WASTE_OPEN_UNIT','stock_transactions/'+id,{status:u.status});
  if(/^finish_.+_WASTE$/.test(id)&&isActiveCfg&&(!cfg.fromDate||s.businessDate>=cfg.fromDate)&&!cases.some(c=>c.sourceId===id)&&!Object.values(R).some(r=>r.dirty&&r.sourceId===id))add('CASE_NOT_CREATED','stock_transactions/'+id);
 }
 for(const [uid,total] of wasteByUnit){const u=C[uid],cap=Number(u?.baseQty||u?.capacity);if(u&&cap>0&&total>cap+EPS)add('WASTE_EXCEEDS_UNIT','stock_containers/'+uid,{waste:total,capacity:cap});}
 // --- checkpoints: recompute net from gross − tare, independent of E.measurement ---
 for(const cp of Object.values(CP)){
  const ref='checkpoints/'+cp.id;
  if(cp.storeId&&cp.storeId!==store)add('STORE_MISMATCH',ref,{storeId:cp.storeId});
  const u=C[cp.containerId];if(u&&u.itemId!==cp.itemId)add('CHECKPOINT_WRONG_OBJECT',ref,{containerItem:u.itemId,itemId:cp.itemId});
  if(!Array.isArray(cp.weighings))continue;
  const unit=String(cp.unitSnapshot||'').toLowerCase(),dens=Number(cp.densitySnapshot);
  if(['ml','l'].includes(unit)&&!(dens>0)){add('CHECKPOINT_NO_DENSITY',ref);continue;}
  const factor={g:1,kg:1000,ml:dens,l:dens*1000}[unit];
  if(cp.weighings.some(w=>!num(w.tareG)||!num(w.grossG)||Number(w.tareG)<0||Number(w.grossG)<Number(w.tareG))){add('CHECKPOINT_BAD_TARE',ref);continue;}
  const net=sum(cp.weighings,w=>Number(w.grossG)-Number(w.tareG))/(factor||NaN);
  if(!Number.isFinite(net)||!near(net,cp.counted,0.015))add('CHECKPOINT_NET_MISMATCH',ref,{recomputed:Number.isFinite(net)?Math.round(net*1000)/1000:null,counted:cp.counted,unit});
  const item=I[cp.itemId];if(item&&String(item.unit||'').toLowerCase()!==unit)add('UNIT_CHANGED_SINCE',ref,{was:unit,now:item.unit});
 }
 // --- measurements → ledger ---
 for(const m of Object.values(M)){
  if(m.status!=='done'||!m.result?.opId||!Array.isArray(m.line?.units))continue;
  const debt=(m.result.debtAbsorbed||[]).length>0;
  for(const u of m.line.units){
   const short=Number(u.baseline)-Number(u.weighed);if(!(short>EPS))continue;
   const tx=S[m.result.opId+'_'+u.id];
   if(!tx){if(!debt)add('MEASUREMENT_LEDGER_MISSING','measurements/'+m.id,{unit:u.id,short});}
   else if(tx.voided!==true&&tx.type==='WASTE'&&!debt&&!near(-Number(tx.qty),short,0.01))add('MEASUREMENT_LEDGER_MISMATCH','measurements/'+m.id,{unit:u.id,short,ledger:-Number(tx.qty)});
  }
 }
 // --- tasks / locks ---
 for(const t of snap.tasks||[]){
  const ref='tasks/'+t.id;
  if(!TASK_STATUS.includes(t.status)){add('TASK_BAD_STATUS',ref,{status:t.status});continue;}
  if(['done','cancelled','superseded'].includes(t.status)&&t.pending===true)add('TASK_STATE_INCONSISTENT',ref);
  if(t.status==='done'){const m=M[lastSeg(t.resultRef)];if(!t.resultRef||!m||m.status!=='done')add('TASK_DONE_WITHOUT_RESULT',ref,{resultRef:t.resultRef||null});}
 }
 for(const l of snap.locks||[]){const m=M[l.measurementId];if(!m||['done','rejected'].includes(m.status))add('LOCK_STALE','measurement_locks/'+l.itemId,{measurementId:l.measurementId,status:m?.status||null});}
 // --- controls / ACK ---
 const tasksById=Object.fromEntries((snap.tasks||[]).map(t=>[t.id,t]));
 const live=(snap.controls||[]).filter(k=>Number(k.level)>=1);
 for(const k of snap.controls||[]){
  const ref='controls/'+k.itemId;
  if(k.storeId&&k.storeId!==store)add('STORE_MISMATCH',ref,{storeId:k.storeId});
  if(!Number.isInteger(Number(k.level))||k.level<0||k.level>3)add('CONTROL_BAD_LEVEL',ref,{level:k.level});
  if(Number(k.level)<Number(k.manualFloor||0))add('CONTROL_BELOW_FLOOR',ref,{level:k.level,manualFloor:k.manualFloor});
  if(Number(k.level)>=1&&isActiveCfg&&!(cfg.controlledItemIds||[]).includes(k.itemId))add('CONTROL_NOT_PUBLISHED',ref);
  const used=(k.deescalationEvidence?.taskIds||[]).map(id=>tasksById[id]).filter(Boolean);
  if(used.some(t=>t.status!=='done'||M[lastSeg(t.resultRef)]?.result?.kind==='no_open_units'))add('CLEAN_SAMPLE_INVALID',ref);
 }
 if(isActiveCfg&&live.length){
  const dev=(snap.devices||[]).filter(d=>d.storeId===store&&d.protocolVersion===1);
  if(!dev.length)add('CONTROL_NOT_ACKED','devices',{controlled:live.length});
  else{const stale=dev.filter(d=>(d.settingsRevision||0)!==(cfg.settingsRevision||0));if(stale.length)add('DEVICE_STALE','devices',{stale:stale.length,total:dev.length});}
 }
 const violations=issues.filter(i=>i.severity==='violation').length,warnings=issues.length-violations,complete=!(snap.truncated||[]).length;
 return {version:VERSION,store,range:snap.range||null,complete,truncated:snap.truncated||[],ok:complete&&violations===0,violations,warnings,issues,
  coverage:{cases:cases.length,sources:Object.keys(S).length,containers:Object.keys(C).length,checkpoints:Object.keys(CP).length,controls:(snap.controls||[]).length,tasks:(snap.tasks||[]).length,devices:(snap.devices||[]).length}};
}

/* Bounded, read-only loader. Each query has a limit; hitting it marks the snapshot incomplete
 * (report.ok=false) instead of silently auditing a partial picture. */
async function collect({fstore,storeId:sid,from,to,limit=500,collection}){
 const store=storeId(sid);if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)throw Error('Kiểm toán: cần khoảng ngày YYYY-MM-DD');
 const coll=collection||(k=>fstore.collection(collName(k,store))),base=coll('duty_digests').doc('_engine2'),sub=n=>base.collection(n);
 const fromIso=new Date(Date.parse(from+'T00:00:00+07:00')).toISOString(),toIso=new Date(Date.parse(to+'T00:00:00+07:00')+86400000).toISOString();
 const truncated=[],data=s=>s.exists?{...s.data(),id:s.id}:null;
 async function rows(name,q){const s=await q.limit(limit+1).get();if(s.docs.length>limit)truncated.push(name);return s.docs.slice(0,limit).map(data);}
 async function byIds(c,ids,into){for(const id of [...new Set(ids)].filter(x=>x&&!(x in into))){const d=data(await c.doc(String(id)).get());if(d)into[id]=d;}}
 const cfgSn=await base.get(),config=cfgSn.exists?cfgSn.data():{};
 const sources={},containers={},checkpoints={},decisions={},measurements={},prices={},items={},requests={};
 for(const s of await rows('sources',coll('stock_transactions').where('type','==','WASTE').where('businessDate','>=',from).where('businessDate','<=',to).orderBy('businessDate')))sources[s.id]=s;
 const cases=await rows('cases',sub('cases').where('interval.to','>=',fromIso).where('interval.to','<',toIso).orderBy('interval.to'));
 await byIds(coll('stock_transactions'),cases.map(c=>c.sourceId),sources);
 for(const c of await rows('checkpoints',sub('checkpoints').where('countedAt','>=',fromIso).where('countedAt','<',toIso)))checkpoints[c.id]=c;
 await byIds(sub('checkpoints'),cases.map(c=>c.interval?.checkpointId).filter(id=>id&&!String(id).startsWith('legacy_')),checkpoints);
 const tasks=[...await rows('tasks',sub('tasks').where('updatedAt','>=',fromIso))];
 for(const t of await rows('pending_tasks',sub('tasks').where('pending','==',true)))if(!tasks.some(x=>x.id===t.id))tasks.push(t);
 const locks=(await rows('locks',sub('measurement_locks'))).map(l=>({...l,itemId:l.id}));
 await byIds(sub('measurements'),[...tasks.map(t=>lastSeg(t.resultRef)),...tasks.map(t=>t.measurementId),...locks.map(l=>l.measurementId),...Object.values(checkpoints).map(c=>c.measurementId)],measurements);
 for(const m of Object.values(measurements))if(m.result?.opId)await byIds(coll('stock_transactions'),(m.line?.units||[]).map(u=>m.result.opId+'_'+u.id),sources);
 await byIds(coll('stock_containers'),[...Object.values(sources).map(s=>s.containerId||s.referenceId),...cases.map(c=>c.containerId),...Object.values(checkpoints).map(c=>c.containerId)],containers);
 // Hồ sơ chờ / nghi sai quy cách: lấy đủ các mã cùng phiếu nhận (1 truy vấn có giới hạn / phiếu).
 const specRefs=[...new Set(cases.filter(c=>['spec_mismatch','waiting_sibling'].includes(c.basis)).map(c=>containers[c.containerId]?.receiveRefId).filter(Boolean))],receipts={};
 for(const ref of specRefs)for(const x of await rows('lot_units',coll('stock_containers').where('receiveRefId','==',ref)))containers[x.id]=x;
 for(const ref of specRefs){const r=await coll('receiving_records').doc(ref).get();if(r.exists)receipts[ref]=true;}
 await byIds(sub('decisions'),cases.map(c=>c.decisionId),decisions);
 await byIds(coll('price_history'),cases.map(c=>c.valuation?.priceId),prices);
 await byIds(coll('inventory_items'),Object.values(checkpoints).map(c=>c.itemId),items);
 await byIds(sub('requests'),[...cases.map(c=>(c.originKind==='measurement'?'measurement':'finish')+'~'+encodeURIComponent(c.originId||c.sourceId)),...Object.keys(sources).filter(id=>/^finish_/.test(id)).map(id=>'finish~'+encodeURIComponent(id))],requests);
 const starts=cases.map(c=>ms(c.interval?.from)).filter(Number.isFinite),ends=cases.map(c=>ms(c.interval?.to)).filter(Number.isFinite);
 const shifts=starts.length?await rows('shifts',coll('employee_shifts').where('checkedInAt','>=',new Date(Math.min(...starts)-14*3600000).toISOString()).where('checkedInAt','<=',new Date(Math.max(...ends)).toISOString())):[];
 const controls=(await rows('controls',sub('controls'))).map(k=>({...k,itemId:k.itemId||k.id}));
 const devices=await rows('devices',sub('devices'));
 return {store,range:{from,to},config,sources,containers,receipts,checkpoints,decisions,measurements,prices,items,requests,cases,shifts,tasks,locks,controls,devices,truncated};
}

async function run(opts){return check(await collect(opts));}
function summary(report){
 const head=(report.ok?'ĐẠT':'CHƯA ĐẠT')+' — quán '+report.store+(report.range?' '+report.range.from+'→'+report.range.to:'')+': '+report.violations+' vi phạm, '+report.warnings+' cảnh báo'+(report.complete?'':' (CHƯA ĐỦ DỮ LIỆU: '+report.truncated.join(', ')+')');
 return [head,...report.issues.map(i=>(i.severity==='violation'?'✗ ':'! ')+i.code+' · '+i.ref+' — '+i.message+(i.detail?' '+JSON.stringify(i.detail):''))].join('\n');
}
const api={VERSION,CODES,TASK_STATUS,SHARED,collName,check,collect,run,summary};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Audit=api;
})(typeof window!=='undefined'?window:globalThis);
