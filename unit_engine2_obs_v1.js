/* Unit Engine 2 — dựng QUAN SÁT KHOẢNG từ dữ liệu kho thật v1 (đầu vào của unit_engine2_learn_v1.js). Thuần, không Firebase.
 * Một tem → dãy mốc: mở tem (sổ = dung tích, chính xác) → các lần cân (cân ca cũ sw_* / lượt cân Engine 2) → báo hết.
 * Mỗi cặp mốc liền nhau = một quan sát: used = Σ fifoAllocations của tem trong khoảng; loss = sổ lúc mốc cuối − số đo.
 * Bỏ có lý do (không học): tem dùng nguyên gói (don_vi_nguyen — không mang thông tin hao hụt), đối chiếu chế biến (prep_reconciled —
 * thuộc family BTP), tem huỷ / huỷ quét mã, tem mở trước đầu kỳ dữ liệu (thiếu tiêu hao trước kỳ) → verified:false.
 * Bản đã phát hành bất biến: sửa sau deploy = unit_engine2_obs_v2.js. */
(function(root){
'use strict';
const VERSION=1;
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():typeof v==='number'?v:Date.parse(v||'');
const iso=t=>new Date(t).toISOString();
const isBarista=s=>!!s&&(!Array.isArray(s.roles)||!s.roles.length||s.roles.includes('barista'));
function groupKey(shifts,from,to){const ids=new Set();for(const s of shifts){if(!s.employeeId||!isBarista(s))continue;const a=ms(s.checkedInAt),b=s.checkedOutAt?ms(s.checkedOutAt):a+14*3600000;if(a<to&&b>from)ids.add(s.employeeId);}return [...ids].sort().join('+');}
/* input: {txs, containers, items:{id:item}, shifts, anomalies, checkpoints (Engine 2), from (YYYY-MM-DD)} */
function build(input){
 const {txs=[],containers=[],items={},shifts=[],anomalies=[],checkpoints=[]}=input,fromMs=input.from?Date.parse(input.from+'T00:00:00+07:00'):-Infinity;
 const alloc={};for(const t of txs){if(t.voided||!Array.isArray(t.fifoAllocations))continue;const sign=Number(t.qty)<0?1:-1,at=ms(t.createdAt);for(const a of t.fifoAllocations)if(a.containerId)(alloc[a.containerId]=alloc[a.containerId]||[]).push({at,qty:sign*(Number(a.qty)||0)});}
 const weighs={};
 for(const t of txs)if(t.shiftWeighOp&&t.containerId&&!t.voided&&Number.isFinite(Number(t.weighedQty))&&Number.isFinite(Number(t.bookQty)))(weighs[t.containerId]=weighs[t.containerId]||[]).push({at:ms(t.createdAt),book:Number(t.bookQty),measured:Number(t.weighedQty),kind:'legacy_shift_weigh',sampling:'control',vesselIds:[]});
 for(const c of checkpoints)if(c.status==='valid'&&c.containerId&&Number.isFinite(Number(c.book))&&Number.isFinite(Number(c.counted)))(weighs[c.containerId]=weighs[c.containerId]||[]).push({at:ms(c.countedAt),book:Number(c.book),measured:Number(c.counted),kind:'engine2',sampling:c.sampling||'control',vesselIds:(c.weighings||[]).map(w=>w.vesselId).filter(Boolean),startedAt:c.startedAt,finishedAt:c.finishedAt});
 const anomBy={};for(const a of anomalies)if(a.itemId)(anomBy[a.itemId]=anomBy[a.itemId]||[]).push(ms(a.createdAt));
 const obs=[],skipped={};const skip=r=>{skipped[r]=(skipped[r]||0)+1;};
 for(const c of containers){
  if(!c.openedAt||!c.itemId){skip('chưa mở');continue;}
  if(c.status==='voided'){skip('tem huỷ');continue;}
  if(['don_vi_nguyen','prep_reconciled','scanned_discard','prep_reconcile_pending'].includes(c.wasteBasis)){skip(c.wasteBasis);continue;}
  const item=items[c.itemId]||{},unit=c.unit||item.unit||'',opened=ms(c.openedAt),complete=opened>=fromMs;
  const pts=[{at:opened,book:Number(c.baseQty)||0,measured:Number(c.baseQty)||0,kind:'open',exact:true}];
  for(const w of (weighs[c.id]||[]).sort((a,b)=>a.at-b.at))if(w.at>opened&&(!c.finishedAt||w.at<ms(c.finishedAt)))pts.push(w);
  if(c.status==='finished'&&c.finishedAt){
   const fin=ms(c.finishedAt),used=(alloc[c.id]||[]).filter(a=>a.at>pts.at(-1).at&&a.at<=fin+60000).reduce((s,a)=>s+a.qty,0);
   const debt=['unit_engine_debt','unit_engine_carried'].includes(c.wasteBasis);
   // Báo hết: số đo = 0 (rỗng). Sổ lúc báo hết = wasteBase (còn dư theo sổ); nợ FIFO → sổ âm = sổ đầu khoảng − lượng bán.
   const book=c.wasteBasis==='unit_engine'||(c.wasteBasis==null&&Number(c.wasteBase)>0)?Number(c.wasteBase)||0:pts.at(-1).measured-used;
   pts.push({at:fin,book,measured:0,kind:'finish',sampling:'finish',fifoDebt:debt||book<0});
  }
  for(let i=1;i<pts.length;i++){
   const p0=pts[i-1],p1=pts[i],used=(alloc[c.id]||[]).filter(a=>a.at>p0.at&&a.at<=p1.at+(p1.kind==='finish'?60000:0)).reduce((s,a)=>s+a.qty,0);
   const nWeigh=(p0.kind==='open'||p0.kind==='finish'?0:1)+(p1.kind==='finish'?0:1);
   obs.push({id:c.id+'~'+i,itemId:c.itemId,unit,containerId:c.id,from:iso(p0.at),at:iso(p1.at),day:new Date(p1.at+7*3600000).toISOString().slice(0,10),
    used,loss:p1.book-p1.measured,book:p1.book,measured:p1.measured,nWeigh,fromOpen:p0.kind==='open',cap:p0.kind==='open'?p0.measured:null,receiveRefId:c.receiveRefId||null,vesselIds:p1.vesselIds||[],groupKey:groupKey(shifts,p0.at,p1.at),sampling:p1.sampling||'control',
    verified:complete&&used>0,reason:!complete?'tem mở trước đầu kỳ dữ liệu':used>0?null:'không có tiêu hao trong khoảng',source:p1.kind,
    ctx:{fifoDebt:!!p1.fifoDebt,anomalies:(anomBy[c.itemId]||[]).filter(t=>t>p0.at&&t<=p1.at).length,otherOpen:!!c.openedWithOtherOpen,densityProven:Number(item.densityGPerMl)>0},
    minutes:p1.startedAt&&p1.finishedAt?Math.max(0,(ms(p1.finishedAt)-ms(p1.startedAt))/60000):null});
  }
 }
 return {obs,skipped};
}
const api={VERSION,build,groupKey,isBarista};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Obs=api;
})(typeof window!=='undefined'?window:globalThis);
