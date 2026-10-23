/* Unit Engine 2 v1: deterministic decisions, evidence and control state.
 * Inventory mutations belong to the inventory adapter, never to this module.
 * Published versions are immutable. Browser and worker use identical bytes. */
(function(root){
'use strict';
const VERSION=1, POLICY='finish_equal_barista_v1', DAY=86400000;
const states={case:['new','checking','ready','decided','review','closed','voided','superseded'],task:['queued','claimed','in_progress','waiting_dependency','retry_wait','exception_recorded','done','superseded','cancelled']};
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():typeof v==='number'?v:Date.parse(v||'');
const finite=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
const stable=v=>v===undefined?'null':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
function storeId(id){if(!/^gg\d{2}$/.test(id))throw Error('Engine2: điểm bán không hợp lệ');return id;}
function collection(kind,id){storeId(id);return kind+'_gieogieo'+(id==='gg01'?'':'__'+id);}
// Bảng DÙNG CHUNG mọi quán (loại G trong data_access) — không thêm hậu tố quán. Test đối chiếu GieoData.REG.
const SHARED=['price_history','prep_vessels','employees','recipes','recipe_history','prep_recipe_history','special_days'];
function tableName(kind,id){storeId(id);return SHARED.includes(kind)?kind+'_gieogieo':collection(kind,id);}
const rootPath=id=>collection('duty_digests',id)+'/_engine2';
async function digest(value){const crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);if(!crypto?.subtle)throw Error('Chưa có công cụ xác định mã thao tác');const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function key(...parts){return parts.map(x=>encodeURIComponent(String(x))).join('~');}
function round(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function split(total,ids){
 if(!finite(total)||Number(total)<0)throw Error('Engine2: tổng phân bổ không hợp lệ');
 const people=[...new Set(ids)].sort();if(!people.length)throw Error('Engine2: chưa nối được nhóm pha chế');
 const cents=Math.round(Number(total)*100);if(!Number.isSafeInteger(cents))throw Error('Engine2: lượng vượt độ chính xác');
 const q=Math.floor(cents/people.length),r=cents%people.length;
 return people.map((id,i)=>({employeeId:id,value:(q+(i<r?1:0))/100}));
}
// Chủ quán chốt 22/10: ca KHÔNG ghi chức năng (thiếu trường roles hoặc rỗng) = pha chế — ở Gieo ai đứng ca cũng pha chế
// (dữ liệu thật 1/9–22/10: không ca nào ghi chức năng). Ca có ghi chức năng thì theo đúng chức năng đó (chỉ 'order' → không).
const isBarista=s=>!!s&&(!Array.isArray(s.roles)||!s.roles.length||s.roles.includes('barista'));
function group(shifts,from,to){
 const start=ms(from),end=ms(to);if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw Error('Engine2: khoảng trách nhiệm không hợp lệ');
 const names=new Map(),refs=[],recorded=new Set();
 for(const s of shifts||[]){
  if(!s.employeeId||!isBarista(s))continue;
  const a=ms(s.checkedInAt),b=s.checkedOutAt?ms(s.checkedOutAt):Math.min(end,a+14*3600000);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||a>=end||b<=start)continue;
  names.set(s.employeeId,s.employeeName||s.employeeId);if(s.id)refs.push(s.id);
  if(Array.isArray(s.roles)&&s.roles.includes('barista'))recorded.add(s.employeeId);
 }
 return {people:[...names].sort(([a],[b])=>a.localeCompare(b)).map(([id,name])=>({id,name,roleBasis:recorded.has(id)?'recorded':'not_recorded'})),shiftIds:[...new Set(refs)].sort()};
}
function interval(container,checkpoint,to){
 const opened=ms(container.openedAt),end=ms(to);if(!Number.isFinite(opened)||!Number.isFinite(end)||opened>=end)throw Error('Engine2: thiếu mốc mở hợp lệ');
 const at=checkpoint&&checkpoint.status==='valid'&&checkpoint.containerId===container.id?ms(checkpoint.countedAt):NaN;
 return {from:new Date(Number.isFinite(at)&&at>opened&&at<end?at:opened).toISOString(),to:new Date(end).toISOString(),checkpointId:Number.isFinite(at)&&at>opened&&at<end?checkpoint.id||'':null};
}
/* Luật «nhập sai quy cách» (chủ quán 23/10). Quán không cân hàng nhập → KHÔNG kết luận từ một mã:
 * - báo hết còn dư < minFrac dung tích → xử lý hao hụt bình thường;
 * - mã không thuộc phiếu nhận THẬT (vd RESET_TON_KHO — opts.receipt === false) → hao hụt;
 * - đã đối chiếu nhãn bao mà quy cách in trên bao = khai báo (opts.rejected) → hao hụt (không phải sai quy cách);
 * - mã DUY NHẤT của nguyên liệu đó trong phiếu nhận → kết luận HAO HỤT (như ca 300 g);
 * - có mã cùng loại cùng phiếu nhận: mã đó đã dùng xong mà CŨNG còn dư gần cùng tỷ lệ → nghi sai quy cách (không quy pha chế);
 *   mã đó dùng xong bình thường → hao hụt; mã đó CHƯA dùng xong → CHỜ (không phân bổ), quá maxWaitDays thì xử lý hao hụt. */
const SPEC={minFrac:0.15,tol:0.1,maxWaitDays:45};
function lotKey(c){return c&&c.itemId&&c.receiveRefId?c.itemId+'|'+c.receiveRefId:null;}
// leftover = tổng phần hụt suốt đời của mã này (dư lúc báo hết + hụt đã ghi ở các lần cân); siblings[].shortfall tương tự.
function specCheck(container,leftover,siblings,now,opts){
 const P={...SPEC,...(opts||{})},cap=Number(container&&container.baseQty)||0,f=cap>0?(Number(leftover)||0)/cap:0;
 if(!(cap>0)||f<P.minFrac)return {action:'decide',reason:'normal',frac:f};
 const key=lotKey(container),sib=key?(siblings||[]).filter(s=>s&&s.id!==container.id&&lotKey(s)===key&&!['voided','cancelled'].includes(s.status)):[];
 if(P.receipt===false)return {action:'decide',reason:'no_receipt',frac:f,lot:key};
 if(P.rejected)return {action:'decide',reason:'spec_rejected',frac:f,lot:key};
 if(!sib.length)return {action:'decide',reason:'only_unit',frac:f,lot:key};
 const done=sib.filter(s=>s.status==='finished');
 // Tổng phần hụt SUỐT ĐỜI mã (các lần cân đã ghi hụt + dư lúc báo hết) — mã đã cân giữa chừng thì lúc báo hết dư rất ít.
 const fr=s=>Number(s.baseQty)>0?(Number(s.shortfall!=null?s.shortfall:s.wasteBase)||0)/Number(s.baseQty):0;
 const match=done.find(s=>fr(s)>=P.minFrac&&Math.abs(fr(s)-f)<=P.tol);
 if(match)return {action:'spec',reason:'sibling_same_shortfall',frac:f,lot:key,siblingId:match.id,siblingFrac:fr(match)};
 if(done.length)return {action:'decide',reason:'sibling_normal',frac:f,lot:key,siblingId:done[0].id,siblingFrac:fr(done[0])};
 const fin=ms(container.finishedAt);if(Number.isFinite(fin)&&Number.isFinite(Number(now))&&Number(now)-fin>P.maxWaitDays*DAY)return {action:'decide',reason:'wait_timeout',frac:f,lot:key};
 return {action:'wait',reason:'waiting_sibling',frac:f,lot:key,siblingIds:sib.map(s=>s.id).sort()};
}
// Biến quyết định chia đều thành hồ sơ «chờ mã cùng phiếu» / «nghi sai quy cách»: không phân bổ cho người, giữ toàn bộ ở pending.
function specOutcome(result,check){
 if(!check||!['spec','wait'].includes(check.action)||result.status==='voided')return result;
 const pct=Math.round(check.frac*100),spec=check.action==='spec';
 return {...result,status:spec?'decided':'checking',basis:spec?'spec_mismatch':'waiting_sibling',allocations:[],pending:{qty:result.quantity,value:result.amount},
  spec:{...check},waitLot:spec?null:check.lot,control:spec?null:result.control,actions:spec?[{type:'spec_confirm',targetId:result.itemId,assignment:'current_barista_group'}]:[],
  explanation:spec?'Mã cùng loại cùng phiếu nhận cũng còn dư ~'+Math.round(check.siblingFrac*100)+'% khi báo hết (mã này '+pct+'%) → nghi nhập sai quy cách. Không quy trách nhiệm cho pha chế; đối chiếu nhãn bao với phiếu nhận.'
   :'Báo hết còn dư '+pct+'% dung tích. Phiếu nhận còn mã cùng loại chưa dùng xong → CHỜ mã đó dùng xong mới kết luận (sai quy cách hay hao hụt); chưa phân bổ trách nhiệm.'};
}
// Lệch NL khi nấu mẻ BTP (dòng sổ «Chờ quản lý duyệt» do POS bật) — chủ quán chốt 23/10: công thức đã R&D kỹ nên
// không giữ lại việc nào cho quản lý. Trong sai số (≤ max(15 g/ml, 5%)) → tự duyệt; 5–25% → tự duyệt + theo dõi dồn
// (cùng người, cùng NL, cùng chiều lặp lại → thông báo); > 25% «lệch lớn», > 50% «lệch rất lớn» → vẫn tự xử lý: ghi rõ
// người chịu trách nhiệm + mốc thời gian vào báo cáo tháng và tạo THÔNG BÁO ĐỂ BIẾT (quản lý hỏi giải trình riêng).
const PREP_REVIEW={absQty:{g:15,ml:15,kg:0.015,l:0.015},minor:0.05,large:0.25,veryLarge:0.5,repeatN:3,repeatDays:30};
const PREP_ROW=/^prep_(after|variance|surplus|pre)_/;
function prepVariance(tx,unit){
 const t=tx||{},id=String(t.id||''),m=id.match(PREP_ROW);if(!m||t.needsReview!==true||t.voided===true)return null;
 const kind=m[1],r=t.responsibility||{},batchId=t.referenceId||'',itemId=t.itemId||'';
 let base,dev,basis;
 if(kind==='pre'){base=Number(t.bookBefore)||0;dev=-(Number(t.qty)||0);basis='book';}   // cân trước mẻ: số cân − sổ = qty → lệch dương = thiếu tồn
 else if(kind==='surplus'){base=Number(t.expectedQty)||0;dev=-(Number(t.qty)||0);basis='book';}   // sổ ghi thấp hơn thực tế (qty > 0)
 else{base=Number(t.expectedQty)||0;basis='recipe';
  const obs=kind==='variance'?Number(t.observedDecrease):Math.abs(Number(t.qty)||0)+(Number(t.uncertainVariance)||0);
  if(!Number.isFinite(obs))return null;dev=obs-base;}
 const u=String(unit||'').toLowerCase(),abs=PREP_REVIEW.absQty[u]||0,mag=Math.abs(dev);
 const ratio=base>0?mag/base:mag>abs?Infinity:0;
 const resp=kind==='pre'?{employeeId:t.responsibleEmployeeId||t.staffEmployeeId||'',employeeName:t.responsibleEmployeeName||t.staff||'',role:t.responsibilityRole||'người chốt cân'}
  :{employeeId:r.employeeId||t.staffEmployeeId||'',employeeName:r.employeeName||t.staff||'',role:r.role||'người cân chốt',batchOperatorId:r.batchOperatorId||'',batchOperatorName:r.batchOperatorName||''};
 return {kind,basis,txId:id,batchId,itemId,unit:u,base:round(base),deviation:round(dev),ratio,abs,direction:dev>0?'over':dev<0?'under':'none',
  key:kind==='pre'?key('pre',batchId,t.containerId||id):key(batchId,itemId),responsible:resp,businessDate:t.businessDate||''};
}
function prepReviewClass(v){
 if(!v)return null;const mag=Math.abs(v.deviation);
 if(mag<=Math.max(v.abs,PREP_REVIEW.minor*v.base))return {band:'within',fyi:false,track:false,label:'Trong sai số cân'};
 if(v.ratio<=PREP_REVIEW.large)return {band:'moderate',fyi:false,track:true,label:'Lệch vừa (5–25%) — theo dõi dồn'};
 if(v.ratio<=PREP_REVIEW.veryLarge)return {band:'large',fyi:true,track:true,severity:'warning',label:'Lệch lớn (25–50%) — cần nhân viên giải trình'};
 return {band:'very_large',fyi:true,track:true,severity:'danger',label:'Lệch rất lớn (> 50%) — cần người chịu trách nhiệm giải trình'};
}
// Theo dõi dồn: các lần lệch vừa trở lên cùng người / NL / chiều trong repeatDays (mỗi mẻ tính một lần — key).
function prepTrack(entries,v,cls,at){
 const cut=ms(at)-PREP_REVIEW.repeatDays*DAY,list=(entries||[]).filter(e=>ms(e.at)>=cut&&e.k!==v.key);
 list.push({k:v.key,at,ratio:Number.isFinite(v.ratio)?round(v.ratio*100)/100:null,band:cls.band,txId:v.txId});
 return {entries:list.slice(-20),repeated:list.length>=PREP_REVIEW.repeatN};
}
// Pha nhầm trong NHÓM DỄ NHẦM (chủ quán 23/10, docs/KE_HOACH_PHA_NHAM_NHOM.md). Thuần, không đọc / ghi.
// Chỉ ghép trong cùng nhóm do chủ quán khai báo (trường nhomDeNham). Không bao giờ suy ra bill / người cụ thể.
const MIXUP={tolAbs:15,tolFrac:0.1,minQty:15,ambiguity:0.05,reweighTol:0.35,watchDays:7,watchCleanNeeded:3,zSig:3.5,zTol:2,scoop:0.15,noiseDays:30};
const mixTol=q=>Math.max(MIXUP.tolAbs,MIXUP.tolFrac*Math.abs(Number(q)||0));
const groupKey=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
// Phần ăn 1 ly ước từ bán trong khoảng: lượng nhỏ nhất của một bill (bill 2 ly vẫn ≥ 1 phần).
function mixPortion(events){const q=(events||[]).map(e=>Number(e.qty)).filter(x=>x>0.0001).sort((a,b)=>a-b);return q.length?q[0]:0;}
// m = {id, group, variance (đếm − sổ), sold, portion, production:[qty]} ; trả null nếu không hợp lệ.
// Độ nhiễu đếm hằng ngày của một món (σ) ước từ |lệch| các ngày trước: σ ≈ trung vị |lệch| / 0.6745. Thiếu lịch sử → 0 (dùng ngưỡng cố định).
function mixNoise(pastVariances){const a=(pastVariances||[]).map(v=>Math.abs(Number(v))).filter(Number.isFinite).sort((p,q)=>p-q);if(a.length<5)return 0;const m=a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;return round(m/0.6745);}
function mixPair(x,y){
 const s=Number(x.variance),d=-Number(y.variance);if(!(s>=MIXUP.minQty)||!(d>=MIXUP.minQty)||groupKey(x.group)!==groupKey(y.group)||!groupKey(x.group)||x.id===y.id)return null;
 if(!(Number(x.portion)>0))return null;
 const nx=Number(x.noise)||0,ny=Number(y.noise)||0;
 if(s<MIXUP.zSig*nx||d<MIXUP.zSig*ny)return null;                  // lệch phải BẤT THƯỜNG so với nhiễu đếm hằng ngày của chính món đó
 const k=Math.round(s/Number(x.portion));if(k<1)return null;
 if(Math.abs(s-k*x.portion)>Math.max(mixTol(s),MIXUP.zTol*nx))return null;   // dư ≈ bội số phần 1 ly của món dư
 if(s>(Number(x.sold)||0)+mixTol(s))return null;                  // không thể pha nhầm nhiều hơn số đã bán
 const e1=Math.abs(d-s),e2=Number(y.portion)>0?Math.abs(d-k*y.portion):Infinity,err=Math.min(e1,e2);
 if(err>Math.max(mixTol(Math.max(s,d)),MIXUP.zTol*Math.hypot(nx,ny)+MIXUP.scoop*s))return null;   // thiếu ≈ dư (muỗng / ca của món khác lệch chút)
 const batch=[x,y].find(m=>(m.production||[]).some(q=>Math.abs(Number(q)-s)<=mixTol(s)||Math.abs(Number(q)-d)<=mixTol(d)));
 return {surplusId:x.id,shortageId:y.id,group:x.group,k,qty:round(Math.min(s,d)),surplus:round(s),shortage:round(d),
  err:round(err/Math.max(s,d)+Math.abs(s-k*x.portion)/s),hypothesis:batch?'batch_mislabel':'mixup',batchItemId:batch?batch.id:null};
}
// Ghép một-một trong nhóm: nhiều cặp nhất, rồi sai số nhỏ nhất; cách ghép khác cùng số cặp và sai số gần bằng → mập mờ.
function mixMatch(members,opts={}){
 const out={pairs:[],ambiguous:[],reversed:[]},byGroup=new Map();
 for(const m of members||[])if(groupKey(m.group)){const k=groupKey(m.group);if(!byGroup.has(k))byGroup.set(k,[]);byGroup.get(k).push(m);}
 for(const [gk,list] of byGroup){
  const S=list.filter(m=>Number(m.variance)>=MIXUP.minQty),T=list.filter(m=>-Number(m.variance)>=MIXUP.minQty);if(!S.length||!T.length)continue;
  const options=[];
  (function walk(i,used,acc){if(i===S.length){if(acc.length)options.push(acc.slice());return;}walk(i+1,used,acc);
   for(const y of T)if(!used.has(y.id)){const p=mixPair(S[i],y);if(p){used.add(y.id);acc.push(p);walk(i+1,used,acc);acc.pop();used.delete(y.id);}}})(0,new Set(),[]);
  if(!options.length)continue;
  const score=o=>o.reduce((a,p)=>a+p.err,0),sig=o=>o.map(p=>p.surplusId+'>'+p.shortageId).sort().join(',');
  options.sort((a,b)=>b.length-a.length||score(a)-score(b));
  const best=options[0],rival=options.find(o=>o.length===best.length&&sig(o)!==sig(best)&&score(o)-score(best)<=MIXUP.ambiguity*best.length);
  if(rival){out.ambiguous.push({group:list[0].group,options:[sig(best),sig(rival)]});continue;}
  for(const p of best){
   // Hôm trước kết luận «nhập nhầm ô» cho cặp ngược chiều cùng lượng → hôm nay chỉ là sổ tự đúng lại, không phải sự cố mới.
   const rev=(opts.entryErrors||[]).find(e=>e.surplusId===p.shortageId&&e.shortageId===p.surplusId&&Math.abs(Number(e.qty)-p.qty)<=mixTol(p.qty));
   if(rev){out.reversed.push({...p,hypothesis:'entry_error_reverse',reverseOf:rev.id||null});continue;}
   out.pairs.push(p);
  }
 }
 return out;
}
// Cân lại lúc mở ca (trước bán): sổ X đã bị cộng ~qty, sổ Y bị trừ ~qty nếu là nhập nhầm ô → cân lại X thấp hơn sổ ~qty, Y cao hơn ~qty.
function mixReweigh(pair,read){
 const dx=Number(read.surplusCounted)-Number(read.surplusBook),dy=Number(read.shortageCounted)-Number(read.shortageBook);
 if(![dx,dy].every(Number.isFinite))return {outcome:'invalid'};
 const tol=Math.max(mixTol(pair.qty),MIXUP.reweighTol*pair.qty);
 if(Math.abs(dx+pair.qty)<=tol&&Math.abs(dy-pair.qty)<=tol)return {outcome:'entry_error',dx:round(dx),dy:round(dy)};
 if(Math.abs(dx)<=tol&&Math.abs(dy)<=tol)return {outcome:'suspected_wrong_drink',dx:round(dx),dy:round(dy)};
 return {outcome:'inconclusive',dx:round(dx),dy:round(dy)};
}
// Thông báo «Lệch đếm bán thành phẩm» / «Lệch lớn» (vụ lệch đếm cuối ngày) — cùng nguyên tắc chủ quán chốt 23/10 cho lệch NL
// khi nấu mẻ: so với lượng ĐÃ DÙNG trong khoảng (như Unit Engine dutyBase), ≤ max(15, 5%) / ≤ 25% → hệ thống tự xử lý (đóng
// thông báo); > 25% → giữ làm THÔNG BÁO ĐỂ BIẾT. Phân bổ trách nhiệm do Unit Engine (vụ lệch) quyết, ở đây không đổi.
function countAlertClass(variance,usage,book,unit){
 const u=Number(usage)||0,b=Number(book)||0,base=u>0?u:b>0?b:1,abs=PREP_REVIEW.absQty[String(unit||'').toLowerCase()]||0,mag=Math.abs(Number(variance)||0);
 const v={deviation:round(Number(variance)||0),base:round(base),abs,ratio:mag/base};return {...v,...prepReviewClass(v)};
}
const ueKey=(...p)=>p.join('_').replace(/[^\w\-]/g,'_').slice(0,180);   // = P.key của unit_engine (mã hồ sơ vụ lệch)
// BTP âm — dùng loại thay thế (chủ quán 23/10, docs/KE_HOACH_BTP_AM.md): hệ thống tự xác nhận khi loại thay thế THIẾU cuối
// ngày khớp lượng cần bù trong ±10%, tối đa 30 (nhân viên còn nếm thử). Lượng thiếu của loại thay thế quy về đơn vị món bị âm.
const SUB_TOL={frac:0.1,cap:30};
// ctx.allocated {kind:id → tổng lượng đã phân bổ cho MỌI phiếu cùng ngày dùng loại này}: một loại thay thiếu 200 g có thể chia cho nhiều
// phiếu — mỗi phiếu chỉ được tính phần ĐÃ PHÂN BỔ cho nó (expectedQty, POS phân theo phần còn lại), không phải cả lượng thiếu chung.
//   · thiếu phủ: Σ min(đã phân bổ, thiếu thật)/tỉ lệ so với lượng cần bù;  · thừa: phần thiếu của loại thay mà KHÔNG phiếu nào giải thích.
// Không có ctx / phiếu cũ không có expectedQty → như cũ (so thẳng tổng thiếu với lượng cần bù).
function subCheck(r,ctx){
 const subs=(r&&r.substitutions)||[],R=Number(r&&r.remainder)||0;
 if(!subs.length||!(R>0))return {ok:false,reason:'no_substitution',need:R,covered:0,tol:0};
 let covered=0,more=0;
 for(const x of subs){
  const ratio=Number(x.ratio)>0?Number(x.ratio):1,short=Number(x.observedShortQty)||0,exp=Number(x.expectedQty);
  const give=Number.isFinite(exp)&&exp>=0?Math.min(exp,short):short;
  covered+=give/ratio;
  const key=(x.kind||'prep')+':'+(x.id||x.prepId),alloc=ctx&&ctx.allocated?Number(ctx.allocated[key]):NaN;
  more+=Math.max(0,short-(Number.isFinite(alloc)?Math.max(alloc,give):give))/ratio;
 }
 covered=round(covered);more=round(more);
 const tol=round(Math.min(SUB_TOL.frac*R,SUB_TOL.cap)),under=round(R-covered);
 if(under>tol)return {ok:false,reason:'substitute_short_less',need:round(R),covered,diff:round(-under),tol};
 if(more>tol)return {ok:false,reason:'substitute_short_more',need:round(R),covered,diff:more,tol};
 return {ok:true,reason:'match',need:round(R),covered,diff:round(covered-R),tol};
}
// Chênh giá vốn khi xác nhận bù — chép công thức _btpAmApplySubstitution (quanlygieo).
function subCogsDelta(r){
 const costA=Number(r.costPerUnit)||0;let covered=0,costB=0;
 for(const x of r.substitutions||[]){costB+=(Number(x.expectedQty)||0)*(Number(x.costPerUnit)||0);covered+=Number(x.coversQty)>0?Number(x.coversQty):(Number(x.expectedQty)||0)/(Number(x.ratio)||1);}
 covered=Math.min(covered,Number(r.remainder)||0);return Math.round(costB-covered*costA);
}
function decision(input){
 const {store,sourceId,source,container,shifts,checkpoint,valuation}=input;storeId(store);
 if(!source||source.type!=='WASTE'||source.voided===true||!(Number(source.qty)<0))return {schemaVersion:1,policyVersion:POLICY,storeId:store,sourceId,sourcePath:collection('stock_transactions',store)+'/'+sourceId,status:'voided',quantity:0,amount:0,allocations:[],reason:'SOURCE_INACTIVE'};
 if(!container||container.id!==source.referenceId||container.itemId!==source.itemId||sourceId!=='finish_'+container.id+'_WASTE')throw Error('Engine2: nguồn báo hết không khớp tem');
 if(container.status!=='finished'||container.wasteBasis!=='unit_engine'||Math.abs(Number(container.wasteBase)+Number(source.qty))>0.005)throw Error('Engine2: báo hết chưa chốt hoặc nguồn vừa thay đổi');
 const range=interval(container,checkpoint,container.finishedAt),g=group(shifts,range.from,range.to);
 if(!g.people.length)throw Error('Engine2: chưa đọc được nhóm pha chế của khoảng này');
 const quantity=round(-Number(source.qty)),qty=split(quantity,g.people.map(p=>p.id));
 const amount=valuation&&finite(valuation.amount)&&Number(valuation.amount)>=0?round(valuation.amount):null;
 const money=amount===null?null:split(amount,g.people.map(p=>p.id));
 return {schemaVersion:1,policyVersion:POLICY,storeId:store,status:'decided',decisionMode:'auto',basis:'policy_equal_share',sourceId,
  sourcePath:collection('stock_transactions',store)+'/'+sourceId,containerId:container.id,itemId:source.itemId,itemName:container.itemName||source.itemId,unit:container.unit||'',quantity,
  interval:range,shiftIds:g.shiftIds,valuation:valuation||{status:'missing',amount:null},amount,
  allocations:qty.map((p,i)=>({employeeId:p.employeeId,employeeName:g.people.find(e=>e.id===p.employeeId).name,qty:p.value,value:money?money[i].value:null,basis:'policy_equal_share',roleBasis:g.people.find(e=>e.id===p.employeeId).roleBasis})),
  explanation:'Chia đều nhóm pha chế có ca thực tế giao với khoảng từ mốc cân hợp lệ gần nhất hoặc mở tem đến báo hết. Đây là trách nhiệm theo chính sách, không kết luận hành vi cá nhân.',
  control:{level:2,targetId:source.itemId,requirements:['checkpoint_soon','barista_handover','day_close'],manualFloor:0},
  actions:[{type:'weigh_open_units',targetId:source.itemId,assignment:'current_barista_group',handover:'next_barista_group'}]};
}
function audit(d){
 const issues=[];if(d.status==='voided')return issues;
 if(!d.allocations?.length&&!['manual_source','spec_mismatch','waiting_sibling'].includes(d.basis))issues.push('NO_BARISTA_ALLOCATION');
 if(Math.abs(round((d.allocations||[]).reduce((s,a)=>s+Number(a.qty),0)+(Number(d.pending?.qty)||0))-d.quantity)>0.005)issues.push('QUANTITY_MISMATCH');
 if(d.amount!==null&&Math.abs(round(d.allocations.reduce((s,a)=>s+Number(a.value),0)+(Number(d.pending?.value)||0))-d.amount)>0.005)issues.push('MONEY_MISMATCH');
 if(new Set((d.allocations||[]).map(a=>a.employeeId)).size!==d.allocations?.length)issues.push('DUPLICATE_PERSON');
 if(!Number.isFinite(ms(d.interval?.from))||ms(d.interval.from)>=ms(d.interval.to))issues.push('INVALID_INTERVAL');
 return issues;
}
function measuredDecision(input){
 const {store,sourceId,source,container,shifts,checkpoint,countedAt,valuation}=input;storeId(store);
 if(!source||source.type!=='WASTE'||source.voided||!(Number(source.qty)<0)||source.containerId!==container.id||source.itemId!==container.itemId)throw Error('Engine2: dòng hao hụt cân không khớp mã');
 const range=interval(container,checkpoint,countedAt),g=group(shifts,range.from,range.to);if(!g.people.length)throw Error('Engine2: chưa đọc được nhóm pha chế của khoảng cân');
 const quantity=round(-Number(source.qty)),amount=valuation&&finite(valuation.amount)?round(valuation.amount):null;
 const qty=split(quantity,g.people.map(p=>p.id)),money=amount===null?null:split(amount,g.people.map(p=>p.id));
 return {schemaVersion:1,policyVersion:POLICY,storeId:store,status:'decided',decisionMode:'auto',basis:'policy_equal_share',sourceId,sourcePath:collection('stock_transactions',store)+'/'+sourceId,
  itemId:source.itemId,itemName:container.itemName||source.itemId,containerId:container.id,unit:container.unit||'',quantity,amount,valuation:valuation||{status:'missing',amount:null},interval:range,shiftIds:g.shiftIds,
  allocations:qty.map((p,i)=>({employeeId:p.employeeId,employeeName:g.people.find(e=>e.id===p.employeeId).name,qty:p.value,value:money?money[i].value:null,basis:'policy_equal_share',roleBasis:g.people.find(e=>e.id===p.employeeId).roleBasis})),
  explanation:'Hao hụt đã ghi trong lượt cân, chia đều pha chế thuộc khoảng giữa mốc vật lý trước và lần cân này. Không ghi thêm WASTE.'};
}
function transition(kind,state,event){
 if(!states[kind]?.includes(state))throw Error('Engine2: trạng thái không hợp lệ');
 // Bảng theo DAC_TA 3.2–3.4 (test tích Descartes tests/unit_engine2_fsm.test.js). Trùng / đến muộn → không đổi trạng thái.
 if(event==='RETRY'||event==='LATE_ACK'||event==='LATE_EVENT')return state;
 const table=kind==='case'?{
  CHECK_START:{new:'checking'},EVIDENCE_READY:{checking:'ready'},EVIDENCE_MISSING:{checking:'checking'},DUE:{checking:'checking'},DECIDE:{ready:'decided'},RESULTS_CONFIRMED:{decided:'closed'},
  CONTEST:{decided:'review',closed:'review'},REVIEW_RESULT:{review:'decided'},REVIEW_DUE:{review:'review'},SOURCE_CORRECTED:{checking:'checking',ready:'checking',decided:'checking',closed:'checking',review:'review'},
  SOURCE_REMOVED:{new:'checking',checking:'checking',ready:'checking',decided:'checking',closed:'checking',review:'review'},RESTORE_SOURCE:{voided:'checking'}
 }:{CLAIM:{queued:'claimed',retry_wait:'claimed'},START:{claimed:'in_progress'},NEED_INPUT:{claimed:'waiting_dependency',in_progress:'waiting_dependency'},DEPENDENCY_READY:{waiting_dependency:'queued'},
  TRANSIENT_FAILURE:{claimed:'retry_wait',in_progress:'retry_wait'},LEASE_EXPIRED:{claimed:'retry_wait',in_progress:'retry_wait'},VALID_RESULT:{in_progress:'done'},RECOVERY:{exception_recorded:'queued'},NEXT_SHIFT:{exception_recorded:'queued'},DUE:{exception_recorded:'queued'}};
 if(event==='EXPLICIT_VOID'&&kind==='case'&&!['voided','superseded'].includes(state))return 'voided';
 if(event==='CASE_MERGED'&&kind==='case'&&state!=='superseded')return 'superseded';
 if(kind==='task'&&event==='HANDOVER_EXIT_WITH_EXCEPTION'&&!['done','superseded','cancelled'].includes(state))return 'exception_recorded';
 if(kind==='task'&&['NEW_REVISION','VALID_VOID'].includes(event)&&!['done','superseded','cancelled'].includes(state))return event==='VALID_VOID'?'cancelled':'superseded';
 const result=table[event]?.[state];if(!result)throw Error('INVALID_TRANSITION: '+kind+'/'+state+'/'+event);return result;
}
// Đi qua từng bước; bước nào sai bảng thì ném INVALID_TRANSITION (không «đánh dấu xong» âm thầm).
function path(kind,state,events){let s=state;for(const e of events)s=transition(kind,s,e);return s;}
// Hồ sơ hao hụt: trạng thái mới khi worker chốt kết quả (outcome 'decided' | 'voided') — chưa có hồ sơ thì bắt đầu từ 'new'.
function caseFlow(old,outcome){
 const from=old||'new';
 if(outcome==='voided'){const events=from==='voided'?[]:['EXPLICIT_VOID'];return {status:path('case',from,events),events};}
 // Chờ thêm bằng chứng (mã cùng phiếu nhận chưa dùng xong): new → checking; đang checking thì giữ (EVIDENCE_MISSING).
 if(outcome==='checking'){if(from==='review')return {status:'review',events:[],hold:true};const events=from==='new'?['CHECK_START']:from==='checking'?['EVIDENCE_MISSING']:from==='voided'?['RESTORE_SOURCE']:['SOURCE_CORRECTED'];return {status:path('case',from,events),events};}
 if(from==='review')return {status:path('case',from,['SOURCE_CORRECTED']),events:['SOURCE_CORRECTED'],hold:true};
 const events=from==='new'?['CHECK_START','EVIDENCE_READY','DECIDE']:from==='voided'?['RESTORE_SOURCE','EVIDENCE_READY','DECIDE']:from==='checking'?['EVIDENCE_READY','DECIDE']:['SOURCE_CORRECTED','EVIDENCE_READY','DECIDE'];
 return {status:path('case',from,events),events};
}
// Việc cân: bắt đầu thực hiện từ trạng thái hiện tại (nhận việc + bắt đầu, qua đúng các bước đặc tả).
function taskStart(state){
 const pre={queued:[],retry_wait:[],exception_recorded:['RECOVERY'],waiting_dependency:['DEPENDENCY_READY'],claimed:null,in_progress:null}[state];
 if(state==='in_progress')return {status:'in_progress',events:[]};
 const events=pre===null?['START']:[...(pre||[]),'CLAIM','START'];return {status:path('task',state,events),events};
}
function control(previous,event,evidence={}){
 const p=previous||{level:0,manualFloor:0},floor=Math.max(0,Math.min(3,Number(p.manualFloor)||0));let level=Math.max(floor,Number(p.level)||0);
 if(event==='NEED_BASELINE')level=Math.max(level,1);
 else if(event==='PHYSICAL_LOSS')level=Math.max(level,2);
 else if(event==='MEASUREMENT_CONFLICT'){if(level<1)throw Error('INVALID_CONTROL_EVENT: MEASUREMENT_CONFLICT cần món đang được kiểm soát (mức ≥ 1)');level=3;}
 // Đổi cấu hình / công thức / cách đo: giữ mức (không xoá rủi ro); cần mốc mới thì tối thiểu M1.
 else if(['CONFIG_CHANGED','RECIPE_CHANGED','MEASUREMENT_CHANGED'].includes(event)){if(evidence.requireCheckpoint===true)level=Math.max(level,1);}
 else if(event==='CLEAN_WINDOW_PASSED'){
  // Automatic release is disabled until calibrated criteria have been explicitly configured.
  // Tiêu chí lấy từ bộ tham số đã hiệu chuẩn (evidence.criteria); thiếu thì dùng mốc khởi điểm đặc tả 3.3 (5 mốc / 3 ngày / cách 7 ngày).
  const k=evidence.criteria||{validPoints:5,activeDays:3,daysBetween:7};
  if(evidence.releaseEnabled===true&&evidence.validPoints>=k.validPoints&&evidence.activeDays>=k.activeDays&&evidence.usedEnough===true&&evidence.pending===0&&evidence.ackComplete===true&&evidence.daysSinceLastRelease>=k.daysBetween)level=Math.max(floor,level-1);
 }else if(!['ACK','TASK_RESULT','DUE','OFFLINE','NO_ACTIVITY','EXCEPTION','MANUAL_FLOOR_SET'].includes(event))throw Error('INVALID_CONTROL_EVENT');
 return {...p,level,manualFloor:floor};
}
function measurement(lines,item){
 const unit=String(item.unit||'').toLowerCase();const density=Number(item.densityGPerMl);
 const factor=unit==='g'?1:unit==='kg'?1000:unit==='ml'&&density>0?density:unit==='l'&&density>0?density*1000:0;
 if(!factor)throw Error('Chưa có đơn vị cân/tỷ trọng hợp lệ');
 if(!Array.isArray(lines)||!lines.length)throw Error('Chưa có số cân');
 let net=0;
 for(const l of lines){
  if(!l.vesselId||!l.variantId||!finite(l.tareG)||Number(l.tareG)<0||!finite(l.grossG)||Number(l.grossG)<Number(l.tareG))throw Error('Kiểm tra dụng cụ, bì và số cân tổng');
  net+=(Number(l.grossG)-Number(l.tareG))/factor;
 }
 return {net:round(net),factor,unit,tareSnapshots:lines.map(l=>({...l})),densitySnapshot:unit==='ml'||unit==='l'?density:null};
}
function outbox(storage,store){
 storeId(store);const name='gieo_engine2_outbox_v1_'+store;
 const read=()=>{const value=JSON.parse(storage.getItem(name)||'[]');if(!Array.isArray(value)||value.some(x=>x.storeId!==store))throw Error('Bộ nhớ công việc cần kiểm tra');return value;};
 return {read,put(command){if(!command.id||!['measurement','exception','close_exception','evidence'].includes(command.kind))throw Error('Lệnh lưu không hợp lệ');const rows=read();if(rows.some(x=>x.id===command.id))return;if(rows.length>=100)throw Error('Bộ nhớ công việc đã đầy; kết nối để đồng bộ trước');storage.setItem(name,JSON.stringify([...rows,{...command,storeId:store}]));},remove(id){storage.setItem(name,JSON.stringify(read().filter(x=>x.id!==id)));}};
}
const api={VERSION,POLICY,DAY,states,ms,finite,stable,storeId,collection,SHARED,tableName,rootPath,key,digest,round,split,isBarista,group,interval,SPEC,lotKey,specCheck,specOutcome,PREP_REVIEW,PREP_ROW,prepVariance,prepReviewClass,prepTrack,SUB_TOL,subCheck,subCogsDelta,countAlertClass,ueKey,MIXUP,groupKey,mixTol,mixPortion,mixNoise,mixPair,mixMatch,mixReweigh,decision,measuredDecision,audit,transition,path,caseFlow,taskStart,control,measurement,outbox};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2=api;
})(typeof window!=='undefined'?window:globalThis);
