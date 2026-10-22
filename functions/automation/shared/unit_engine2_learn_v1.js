/* Unit Engine 2 — học & tự hiệu chuẩn v1 (lộ trình cấp 3–6). Thuần: không Firebase, không DOM; trình duyệt và worker cùng byte.
 * Đơn vị dữ liệu: QUAN SÁT KHOẢNG — đoạn giữa hai mốc vật lý của một tem (mở / cân / báo hết):
 *   {id, itemId, unit, at (ISO kết thúc), day, used (lượng bán theo sổ), loss (sổ − đo, dương = thiếu), measured, nWeigh,
 *    vesselIds[], groupKey (nhóm pha chế), sampling ('random_m0'|'control'|'finish'|'m3'), verified (phép đo hợp lệ),
 *    ctx:{fifoDebt, untracked, otherOpen, anomalies, rtStale, densityProven}, truth? (chỉ mô phỏng / kết quả xác minh)}
 * Nguyên tắc (lộ trình mục 1, 4; ma trận 5.1–5.5):
 *  - Hao hụt thường xuyên vẫn là hao hụt: baseline là mức DỰ BÁO, không phải mức được miễn; không tự tăng định mức.
 *  - Xác suất chỉ cho giả thuyết KIỂM ĐƯỢC bằng phép đo (sai bì, tỷ trọng, định mức, mở không khai, đồng bộ) và chỉ in % khi
 *    giả thuyết đó đã hiệu chuẩn đủ nhãn; thất thoát chưa khai = PHẦN DƯ, chỉ có lượng + độ bất định, không có %.
 *  - Tham số có phiên bản, đổi trong biên (live ±5% / 7 ngày hoạt động), đánh giá ngoài thời gian học, tự quay lui.
 *  - Không đụng tiền / lương / định mức / bì thật — chỉ đề xuất có căn cứ.
 * Bản đã phát hành bất biến: sửa sau deploy = unit_engine2_learn_v2.js. */
(function(root){
'use strict';
const VERSION=1,Z90=1.6449,LN2=Math.log(2);
// Kiểm được bằng phép đo: sai bì, tỷ trọng, định mức, tiêu hao không khai, đồng bộ, nhận hàng sai dung tích (D1), cân lệch hệ số.
const HYPOTHESES=['tare','density','recipe','unrecorded','sync','receiving','scale'];
const TESTS={tare:'tare_check',density:'density_proof',recipe:'recipe_portion_weigh',unrecorded:'scan_open_units',sync:'resync_recount',receiving:'weigh_sealed_unit',scale:'reference_weigh',physical:'handover_weigh_m2'};
// Tham số mặc định = TIÊN NGHIỆM khai báo (chưa hiệu chuẩn). Bản hiệu chuẩn mô phỏng / thật thay thế qua calibrate().
const DEFAULT_PARAMS={
 version:'prior-1',origin:'declared_prior',
 kEscalate:2.5,kClean:1.5,coldStartFactor:1.6,minMeasLearn:10,measUnsureFactor:2.5,measUpper:1,minExcess:{g:15,ml:15,cai:2,other:5},
 measSigma:{g:3,ml:4,cai:0.5,other:2},              // sai số một lần cân/đếm (đơn vị nền); đếm cái làm tròn ±0,5 → σ ≥ 0,5
 cusum:{k:0.5,h:4},                                 // cộng dồn thiếu nhỏ dưới ngưỡng từng lần (case A8)
 flagLik:{anomalyGivenSync:0.9,anomalyGivenOther:0.05,untrackedGivenUnrecorded:0.9,untrackedGivenOther:0.05},
 // Tiên nghiệm khai báo theo nhóm đơn vị — dùng khi nhóm chưa đủ món có dữ liệu (≥ minGroupItems), dữ liệu dần thay thế.
 groupPrior:{g:{mu:0.015,tau:0.01,sigma:0.02},ml:{mu:0.012,tau:0.01,sigma:0.02},cai:{mu:0.01,tau:0.02,sigma:0.05},other:{mu:0.015,tau:0.02,sigma:0.04}},minGroupItems:3,
 baseline:{minTrusted:20,minDays:14,minLearning:3,tauFloor:0.004,sigmaFloor:0.006,minObsUsed:{g:50,ml:50,cai:5,other:10},kCap:3},
 release:{validPoints:5,activeDays:3,minUsedRatio:2,daysBetween:7},
 priors:{tare:0.08,density:0.04,recipe:0.08,unrecorded:0.06,sync:0.04,receiving:0.04,scale:0.03,physical:0.12,noise:0.51},
 tareSigma:{g:12,ml:12,cai:0,other:5},densitySigma:{unproven:0.05,proven:0.01},receivingSigma:0.06,receivingFirst:0.2,scaleSigma:0.03,
 minutes:{tare_check:2,density_proof:4,recipe_portion_weigh:5,scan_open_units:2,resync_recount:3,weigh_sealed_unit:2,reference_weigh:1,handover_weigh_m2:3,m3_blind:4},
 calibration:{minLabels:30,maxBrier:0.2,minFit:10,ridge:1,keep:300},
 bounds:{'baseline.kCap':[2,5],kEscalate:[1.8,4],kClean:[0.8,2.5],coldStartFactor:[1,2.5],measUnsureFactor:[1,4],'cusum.h':[2.5,8],'release.validPoints':[3,12],'release.activeDays':[2,10]},
 liveStep:0.05
};
const unitGroup=u=>{u=String(u||'').toLowerCase();return u==='g'||u==='kg'?'g':u==='ml'||u==='l'?'ml':['cái','cai','miếng','mieng','gói','goi','chai','túi','tui','lon','hộp','hop'].includes(u)?'cai':'other';};
const median=a=>{const v=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return NaN;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const mad=a=>{const m=median(a);return 1.4826*median(a.map(x=>Math.abs(x-m)));};
const npdf=(x,mu,sd)=>{const z=(x-mu)/sd;return Math.exp(-0.5*z*z)/(sd*Math.sqrt(2*Math.PI));};
const get=(o,k)=>k.split('.').reduce((x,p)=>x==null?x:x[p],o);
const setK=(o,k,v)=>{const ps=k.split('.');let x=o;for(const p of ps.slice(0,-1))x=x[p];x[ps.at(-1)]=v;};
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>v===undefined?'null':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
const rate=o=>o.used>0?o.loss/o.used:NaN;
const usable=o=>o.verified!==false&&o.used>0&&Number.isFinite(o.loss)&&o.sampling!=='exception';
// Dữ liệu HỌC baseline: chỉ khoảng sạch — quan sát đã bị báo bất thường / cộng dồn bị LOẠI (có lý do), để baseline không hấp thụ hao hụt.
// Nợ FIFO / sổ âm (bán vượt sổ = DƯ so với sổ) đi nhánh KIỂM SỔ, không trộn vào mức hao hụt (không bù trừ che khoản thiếu khác).
const learnable=o=>usable(o)&&!o.flagged&&!(o.ctx&&o.ctx.fifoDebt);

/* ---------- Cấp 3: baseline gộp tầng (empirical Bayes, ước lượng bền) ---------- */
// accepted: {itemId: rate} mức thường đã XÁC MINH (cân phần định mức / quản lý chấp nhận có lý do) — mới được vượt trần nhóm.
function baseline(obs,params=DEFAULT_PARAMS,accepted={}){
 const P=params.baseline,by={};let excluded=0;
 for(const o of obs){if(usable(o)&&!learnable(o)){excluded++;continue;}if(learnable(o))(by[o.itemId]=by[o.itemId]||[]).push(o);}
 const lists=Object.entries(by),gOf=list=>unitGroup(list[0].unit);
 // 1) Sai số cân HỌC theo nhóm đơn vị: phân tán bền của phần dư LƯỢNG quanh trung vị tỷ lệ của món, ở các lượt có cân — cân kém thì tự nới.
 const meas={};
 // Học trên MỌI lượt có cân dùng được (cả mẫu đã báo bất thường): chỉ học trên mẫu chưa báo là cắt cụt phân bố → ước thấp sai số
 // → báo sai nhiều hơn → càng cắt cụt. MAD bền với số ít bất thường thật.
 const allBy={};for(const o of obs)if(usable(o)&&!(o.ctx&&o.ctx.fifoDebt)&&o.nWeigh>0)(allBy[o.itemId]=allBy[o.itemId]||[]).push(o);
 for(const [id,list] of Object.entries(allBy)){const g=unitGroup(list[0].unit),m=median((by[id]||list).map(rate));if(Number.isFinite(m))for(const o of list)(meas[g]=meas[g]||[]).push((o.loss-m*o.used)/Math.sqrt(o.nWeigh));}   // chuẩn hoá về MỘT lần cân
 // Cận trên theo cỡ mẫu (MAD hiệu suất ~37% → sai chuẩn ≈ σ/√(0,74·n)): ít mẫu thì nới, nhiều mẫu thì sát ước lượng.
 const measLearned=g=>meas[g]&&meas[g].length>=10?mad(meas[g])*(1+(params.measUpper??1)/Math.sqrt(0.74*meas[g].length)):null,measOf=g=>Math.max(params.measSigma[g]||0,measLearned(g)||0);
 // 2) Từng món: tách phân tán QUÁ TRÌNH khỏi sai số cân — var(tỷ lệ) = σp² + σm²·nCân/lượng² (không cộng sai số cân hai lần).
 const stats={};
 for(const [id,list] of lists){const g=gOf(list),r=list.map(rate),raw=mad(r),mv=median(list.map(o=>o.nWeigh>0?Math.pow(measOf(g),2)*o.nWeigh/Math.pow(o.used,2):0));
  stats[id]={g,list,r,n:r.length,m:median(r),raw:Number.isFinite(raw)?raw:NaN,sp:r.length>=3?Math.sqrt(Math.max(P.sigmaFloor*P.sigmaFloor,raw*raw-(Number.isFinite(mv)?mv:0))):NaN};}
 // 3) Tiên nghiệm nhóm (gộp tầng).
 const groupPrior={};
 for(const g of new Set(Object.values(stats).map(x=>x.g))){
  const items=Object.values(stats).filter(x=>x.g===g),ms=items.filter(i=>i.n>=P.minLearning).map(i=>i.m),all=items.map(i=>i.m),D=params.groupPrior[g]||params.groupPrior.other;
  let mu0=median(ms.length?ms:all),tau=Math.max(P.tauFloor,mad(ms.length>1?ms:all)||0),sig=Math.max(P.sigmaFloor,median(items.map(i=>i.sp))||0);
  // Nhóm chưa đủ món có dữ liệu → trộn với tiên nghiệm khai báo theo tỷ lệ số món (không để 1–2 món nhiễu quyết mức cả nhóm).
  const k=Math.min(1,ms.length/params.minGroupItems);if(k<1){mu0=k*(Number.isFinite(mu0)?mu0:D.mu)+(1-k)*D.mu;tau=Math.max(tau,D.tau*(1-k)+tau*k);sig=Math.max(sig,D.sigma*(1-k)+sig*k);}
  groupPrior[g]={mu0:Number.isFinite(mu0)?mu0:D.mu,tau,sigma:sig,items:items.length,dataItems:ms.length,measQty:measLearned(g),measN:(meas[g]||[]).length};
 }
 // 4) Ước lượng từng món: co về nhóm; trần nhóm khi chưa xác minh.
 const out={};
 for(const [id,x] of Object.entries(stats)){
  const gp=groupPrior[x.g],n=x.n,sp=Number.isFinite(x.sp)?x.sp:gp.sigma,rawS=Number.isFinite(x.raw)&&n>=3?Math.max(x.raw,sp):Math.sqrt(sp*sp+gp.tau*gp.tau);
  // «Đủ tin cậy» cần mốc CÓ THÔNG TIN: lượng dùng của khoảng ≥ ngưỡng theo nhóm (đặc tả 6.2 — lượng dùng đủ).
  const info=x.list.filter(o=>o.used>=(P.minObsUsed?.[x.g]??0)),days=new Set(info.map(o=>o.day||String(o.at).slice(0,10))).size;
  const se2=(Math.PI/2)*rawS*rawS/Math.max(1,n),w=n<P.minLearning?0:gp.tau*gp.tau/(gp.tau*gp.tau+se2);
  let est=w*x.m+(1-w)*gp.mu0,capped=false,sd=Math.sqrt(sp*sp+(1-w)*gp.tau*gp.tau+w*se2);
  // Trần: mức thường không tự vượt nhóm cùng đơn vị (+kCap·τ) khi chưa xác minh — chặn baseline học luôn thất thoát nhỏ / định mức thiếu.
  // Bị chặn trần thì độ phân tán của chính món cũng đã lẫn hao hụt → dùng phân tán điển hình của nhóm.
  const cap=gp.dataItems>=params.minGroupItems?gp.mu0+P.kCap*gp.tau:Infinity;if(est>cap&&!(Number.isFinite(accepted[id])&&accepted[id]>=est)){est=cap;capped=true;sd=Math.sqrt(gp.sigma*gp.sigma+gp.tau*gp.tau);}
  const state=n<P.minLearning?'cold_start':info.length<P.minTrusted||days<P.minDays?'learning':'trusted';
  out[id]={itemId:id,unitGroup:x.g,n,informative:info.length,days,median:x.m,estimate:est,sd,processSd:sp,low:est-Z90*sd,high:est+Z90*sd,shrink:w,state,capped};
 }
 return {items:out,groups:groupPrior,params:params.version,excluded};
}
function predict(base,itemId,unit){const b=base.items[itemId];if(b)return b;const D=DEFAULT_PARAMS.groupPrior[unitGroup(unit)]||DEFAULT_PARAMS.groupPrior.other,gp=base.groups[unitGroup(unit)]||{mu0:D.mu,tau:D.tau,sigma:D.sigma};const sd=Math.sqrt(gp.sigma*gp.sigma+gp.tau*gp.tau);return {itemId,unitGroup:unitGroup(unit),n:0,estimate:gp.mu0,sd,low:gp.mu0-Z90*sd,high:gp.mu0+Z90*sd,shrink:0,state:'cold_start'};}

/* Điểm bất thường của một quan sát so với baseline. */
function score(o,base,params=DEFAULT_PARAMS){
 const b=predict(base,o.itemId,o.unit),g=unitGroup(o.unit),learned=o.nWeigh>0?base.groups?.[g]?.measQty:null,gp=base.groups?.[g];
 // Chưa học được sai số cân của nhóm (ít lượt cân) hoặc món còn cold_start → đòi bằng chứng mạnh hơn.
 // «Biết mình chưa biết»: chưa học được sai số cân của nhóm → coi sai số có thể lớn tới measUnsureFactor × danh định.
 const measUnknown=o.nWeigh>0&&!((gp?.measN||0)>=params.minMeasLearn),unsure=b.state==='cold_start'||measUnknown,k=params.kEscalate*(b.state==='cold_start'?params.coldStartFactor:1);
 const meas=Math.max(params.measSigma[g]*(measUnknown?params.measUnsureFactor:1),Number.isFinite(learned)?learned:0)*Math.sqrt(Math.max(1,o.nWeigh||1));
 const expected=b.estimate*o.used,sdLoss=Math.sqrt(Math.pow(b.sd*o.used,2)+meas*meas),excess=o.loss-expected,z=sdLoss>0?excess/sdLoss:0;
 return {expected,sdLoss,excess,z,threshold:k,abnormal:z>k&&excess>=params.minExcess[g],clean:Math.abs(z)<=params.kClean,state:b.state,unsure};
}

/* ---------- Cấp 4: giả thuyết KIỂM ĐƯỢC + phần dư ----------
 * evidence: {tareChecks:{vesselId:[{recorded,measured}]}, recipeAudits:{itemId:[{book,measured}]}, itemResiduals:{itemId:[{groupKey,rate}]}, openHistory:{itemId:[{id,at,fromOpen,frac,sdFrac,z}]} (mọi khoảng có cân, cả mẫu đã báo), labelsCount:{h:n}, brier:{h:x}} */
function hypotheses(o,base,evidence={},params=DEFAULT_PARAMS){
 const s=score(o,base,params),g=unitGroup(o.unit),ex=s.excess,sig=Math.max(1e-6,s.sdLoss),cap=Math.max(Math.abs(ex),o.measured||0,o.used||0,1)*2,ctx=o.ctx||{};
 const L={},why={};
 // Sai bì: tem cân bằng dụng cụ có kiểm bì → độ lệch bì b; bì ghi > thật làm lượng ròng thấp → thiếu ảo = −b × số lần cân.
 const checks=(o.vesselIds||[]).flatMap(v=>evidence.tareChecks?.[v]||[]);
 const n=Math.max(1,o.nWeigh||1);
 if(checks.length){const b=median(checks.map(c=>c.measured-c.recorded)),sb=Math.max(1,mad(checks.map(c=>c.measured-c.recorded))||params.measSigma[g]);L.tare=npdf(ex,-b*n,Math.sqrt(sig*sig+Math.pow(sb*n,2)));why.tare='kiểm bì '+checks.length+' lần, lệch bì '+(Math.round(b*10)/10);}
 else{const sb=params.tareSigma[g]||0;L.tare=sb?npdf(ex,0,Math.sqrt(sig*sig+Math.pow(sb*n,2)))*0.5+npdf(Math.abs(ex),sb*n,sig)*0.5:1e-12;why.tare='chưa kiểm bì dụng cụ này';}
 // Tỷ trọng (ml/l): sai lệch tỷ lệ f với lượng đo.
 if(g==='ml'){const sf=ctx.densityProven?params.densitySigma.proven:params.densitySigma.unproven;L.density=npdf(ex,0,Math.sqrt(sig*sig+Math.pow(sf*(o.measured||o.used||1),2)));why.density=ctx.densityProven?'tỷ trọng đã đo':'tỷ trọng chưa có mẫu đo';}else L.density=1e-12;
 // Định mức thiếu: phần dư cùng dấu, tỷ lệ với lượng bán, lặp ở ≥ 2 nhóm pha chế khác nhau.
 const res=(evidence.itemResiduals?.[o.itemId]||[]).filter(r=>Number.isFinite(r.rate));
 const groups=new Set(res.filter(r=>r.rate>0).map(r=>r.groupKey));
 const audits=evidence.recipeAudits?.[o.itemId]||[];
 if(audits.length){const beta=median(audits.map(a=>(a.measured-a.book)/Math.max(a.book,1e-9)));L.recipe=npdf(ex,beta*o.used,Math.sqrt(sig*sig+Math.pow(0.02*o.used,2)));why.recipe='cân phần định mức '+audits.length+' lần';}
 else if(groups.size>=2&&res.length>=3){const beta=median(res.map(r=>r.rate)),same=res.filter(r=>Math.sign(r.rate)===Math.sign(beta)).length/res.length;L.recipe=same>=0.8?npdf(ex,beta*o.used,Math.sqrt(sig*sig+Math.pow(0.5*Math.abs(beta)*o.used,2))):npdf(ex,0,sig)*0.2;why.recipe=groups.size+' nhóm pha chế cùng chiều lệch';}
 else{L.recipe=1e-6/cap;why.recipe='chưa đủ nhóm để tách định mức';}
 // Mở tem / tiêu hao không khai; lỗi đồng bộ — chỉ khi có dấu hiệu trong khoảng.
 // Nhận hàng sai dung tích (D1): chỉ khoảng BẮT ĐẦU từ lúc mở tem; thiếu ≈ dung tích ghi − dung tích thật (hằng theo tem).
 const sealed=evidence.sealedChecks?.[o.itemId]||[];
 if(o.fromOpen&&Number(o.cap)>0){if(sealed.length){const d=median(sealed.map(c=>(c.recorded-c.measured)/c.recorded));L.receiving=npdf(ex,d*o.cap,Math.sqrt(sig*sig+Math.pow(0.01*o.cap,2)));why.receiving='cân tem nguyên '+sealed.length+' lần';}
  else{L.receiving=0.5*npdf(Math.abs(ex),params.receivingSigma*o.cap*0.6,Math.max(sig,0.3*params.receivingSigma*o.cap));
   // Sai dung tích là lỗi THEO LÔ → khoảng mở tem LIỀN TRƯỚC của cùng món phải thiếu gần cùng tỷ lệ. Tỷ số khả năng của tem trước
   // (thiếu f·dung tích ↔ không thiếu); chưa có tem trước → chỉ một lần thấy, hạ khả năng (receivingFirst) chờ lặp lại.
   // Khoảng KHÔNG từ lúc mở tem (cân → cân) của cùng món không bị ảnh hưởng bởi sai dung tích: thiếu rõ ở đó → nguyên nhân khác.
   const hist=(evidence.openHistory?.[o.itemId]||[]).filter(h=>h.id!==o.id&&(!h.at||!o.at||h.at<o.at));
   const prevOpen=hist.filter(h=>h.fromOpen!==false&&Number.isFinite(h.frac)).slice(-1)[0],mid=hist.filter(h=>h.fromOpen===false&&Number.isFinite(h.z)).slice(-3);
   if(prevOpen){const f=ex/o.cap,sd=Math.max(0.01,Number(prevOpen.sdFrac)||0.02),lr=npdf(prevOpen.frac,f,sd)/Math.max(1e-300,npdf(prevOpen.frac,0,sd));L.receiving*=Math.min(10,Math.max(0.02,lr));why.receiving='tem mở liền trước '+(prevOpen.frac>0.5*f?'cũng thiếu':'không thiếu')+' — chưa cân tem nguyên';}
   else{L.receiving*=params.receivingFirst??0.2;why.receiving='lần đầu thấy thiếu ở khoảng mở tem — chờ lặp ở tem sau / cân tem nguyên';}
   for(const h of mid)if(h.z>0)L.receiving*=Math.max(0.01,Math.exp(-h.z*h.z/2));}}
 else{L.receiving=1e-12;why.receiving='khoảng không bắt đầu từ lúc mở tem';}
 // Cân lệch hệ số: thiếu ảo tỷ lệ với lượng đo (mọi đơn vị có cân); vật mẫu biết trước khối lượng xác minh.
 const refs=evidence.referenceChecks||[];
 if(o.nWeigh>0&&Number(o.measured)>0){if(refs.length){const gn=median(refs.map(c=>(c.reading-c.known)/c.known));L.scale=npdf(ex,-gn*o.measured,Math.sqrt(sig*sig+Math.pow(0.005*o.measured,2)));why.scale='cân vật mẫu '+refs.length+' lần';}
  else{L.scale=npdf(ex,0,Math.sqrt(sig*sig+Math.pow(params.scaleSigma*o.measured,2)));why.scale='chưa cân vật mẫu biết trước khối lượng';}}
 else{L.scale=1e-12;why.scale='không có lần cân';}
 L.unrecorded=ex>0?1/cap:1e-9;L.sync=ex>0?1/cap:1e-9;L.physical=ex>0?1/cap:1e-9;L.noise=npdf(ex,0,sig);
 // Dấu hiệu ngữ cảnh là BẰNG CHỨNG: P(dấu | giả thuyết). Sổ lệch gần như luôn có khi lỗi đồng bộ, hiếm khi do nguyên nhân khác.
 const F=params.flagLik,anom=!!(ctx.anomalies||ctx.rtStale),untr=!!(ctx.fifoDebt||ctx.untracked||ctx.otherOpen);
 for(const k of [...HYPOTHESES,'physical','noise']){L[k]*=(k==='sync'?(anom?F.anomalyGivenSync:1-F.anomalyGivenSync):(anom?F.anomalyGivenOther:1-F.anomalyGivenOther));L[k]*=(k==='unrecorded'?(untr?F.untrackedGivenUnrecorded:1-F.untrackedGivenUnrecorded):(untr?F.untrackedGivenOther:1-F.untrackedGivenOther));}
 why.unrecorded=untr?'có nợ FIFO / tiêu hao không gắn mã / mở nhiều mã':'không có dấu hiệu';why.sync=anom?'có Sổ lệch / RT sai trong khoảng':'không có dấu hiệu';
 const pri=params.priors,keys=[...HYPOTHESES,'physical','noise'];let Z=0;const post={};
 for(const k of keys){post[k]=(pri[k]||1e-6)*Math.max(L[k],1e-300);Z+=post[k];}
 for(const k of keys)post[k]=post[k]/Z;
 // Giả thuyết đã hiệu chuẩn đủ nhãn mới in %; thất thoát chưa khai (physical) KHÔNG BAO GIỜ in %.
 // Xác suất in ra = hậu nghiệm đã HIỆU CHỈNH theo nhãn của chính quán (evidence.calibration — fitCalibration), chỉ khi Brier NGOÀI MẪU đạt.
 const cal=params.calibration,isCal=h=>{const c=evidence.calibration?.[h];return c?c.n>=cal.minLabels&&c.brier!=null&&c.brier<=cal.maxBrier:(evidence.labelsCount?.[h]||0)>=cal.minLabels&&(evidence.brier?.[h]??1)<=cal.maxBrier;};
 const list=HYPOTHESES.map(h=>({h,p:post[h],calibrated:isCal(h),shown:evidence.calibration?.[h]?applyCalibration(evidence.calibration[h],post[h]):post[h],why:why[h]})).sort((a,b)=>b.p-a.p);
 const explained=Math.max(0,...HYPOTHESES.map(h=>post[h]>0.5?(h==='tare'&&checks.length?-median(checks.map(c=>c.measured-c.recorded))*n:ex*post[h]):0));
 const top=list[0],explainedBy=top&&top.p>=(params.minTestPosterior??0.05)?top.h:null;
 return {score:s,explainedBy,ranking:list.map(x=>({hypothesis:x.h,probability:x.calibrated?Math.round(x.shown*1000)/1000:null,rankScore:x.p,calibrated:x.calibrated,why:x.why})),
  residual:{qty:Math.max(0,ex-explained),sd:sig,note:'Phần dư chưa giải thích bởi giả thuyết kiểm được — không quy nguyên nhân, không có xác suất.'},posterior:post,next:nextMeasurement(post,o,params)};
}
/* Chọn phép đo tiếp: tách được giả thuyết nào × giá trị đang rủi ro ÷ phút công. */
function nextMeasurement(post,o,params=DEFAULT_PARAMS){
 const H=p=>p.reduce((s,x)=>x>0?s-x*Math.log(x):s,0)/LN2,all=Object.values(post),h0=H(all),risk=Math.max(1,o.excessValue||Math.abs(o.loss||0));
 // Chỉ phép đo CHẨN ĐOÁN được (xác minh một giả thuyết kiểm được). M2 là biện pháp kiểm soát, không phải chẩn đoán.
 const opts=Object.entries(TESTS).filter(([h])=>HYPOTHESES.includes(h)&&(post[h]||0)>=(params.minTestPosterior??0.05)).map(([h,test])=>{const p=post[h]||0,rest=Object.entries(post).filter(([k])=>k!==h).map(([,v])=>v),s=rest.reduce((a,b)=>a+b,0);const after=(1-p)*H(rest.map(v=>v/(s||1)));const gain=Math.max(0,h0-after);return {test,resolves:h,gain,minutes:params.minutes[test],value:gain*Math.log1p(risk)/params.minutes[test]};}).sort((a,b)=>b.value-a.value);
 return opts[0]?{...opts[0],alternatives:opts.slice(1,3).map(x=>x.test)}:{test:null,resolves:null,reason:'Không giả thuyết kiểm được nào đủ khả năng — giữ biện pháp kiểm soát (M2/M3)'};
}

// Cộng dồn thiếu nhỏ (A8): mỗi quan sát cộng z − k; vượt h thì coi là bất thường dù từng lần dưới ngưỡng. Báo xong đặt lại 0.
function accumulate(prev,scoreResult,params=DEFAULT_PARAMS){const S=Math.max(0,(prev||0)+scoreResult.z-params.cusum.k),alarm=S>params.cusum.h&&!scoreResult.abnormal;return {S:alarm||scoreResult.abnormal?0:S,alarm};}

/* ---------- Cấp 5: tăng / hạ mức có tiêu chí ---------- */
function controlAdvice(control,recent,base,ctx={},params=DEFAULT_PARAMS){
 const level=Number(control?.level)||0,floor=Number(control?.manualFloor)||0,R=params.release;
 const scored=recent.filter(usable).map(o=>({o,s:score(o,base,params)}));
 if(scored.some(x=>x.s.abnormal)){const repeat=level>=2&&scored.filter(x=>x.s.abnormal).length>=1;return {action:repeat?'escalate':'hold_or_raise',to:Math.max(level,repeat?3:2),reason:repeat?'Tái diễn dù đã M2 → xác nhận độc lập M3':'Thiếu vượt mức thường → M2'};}
 const clean=scored.filter(x=>x.s.clean&&['random_m0','control','m3'].includes(x.o.sampling));
 const days=new Set(clean.map(x=>x.o.day||String(x.o.at).slice(0,10))).size,used=clean.reduce((a,x)=>a+x.o.used,0),cap=Math.max(1,ctx.typicalUnit||1);
 const ok=level>floor&&clean.length>=R.validPoints&&days>=R.activeDays&&used>=R.minUsedRatio*cap&&!(ctx.pending>0)&&ctx.ackComplete!==false&&(ctx.daysSinceLastRelease??99)>=R.daysBetween;
 return ok?{action:'release',to:Math.max(floor,level-1),reason:clean.length+' mốc sạch / '+days+' ngày'}:{action:'hold',to:level,reason:'Chưa đủ mốc sạch ('+clean.length+'/'+R.validPoints+', '+days+'/'+R.activeDays+' ngày)'};
}

/* ---------- Cấp 6: đánh giá, hiệu chuẩn có rào, drift, quay lui, kiểm toán mô hình ---------- */
// Đánh giá đi tiến theo thời gian: baseline chỉ học từ quan sát TRƯỚC mỗi quan sát (ngoài thời gian học).
function evaluate(obs,params=DEFAULT_PARAMS,opts={}){
 const seq=obs.filter(usable).slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))),warm=opts.warm||0;
 let cov=0,covN=0,mae=0,flags=0,falseAlarm=0,missed=0,trueAbn=0,minutes=0;const brier={},labels={};
 const refit=Math.max(1,opts.refitEvery||10);let base=baseline([],params);
 for(let i=0;i<seq.length;i++){
  if(i%refit===0)base=baseline(seq.slice(0,i),params);
  const o=seq[i],s=score(o,base,params);if(i<warm)continue;
  const b=predict(base,o.itemId,o.unit),t=o.truth,normalTruth=!t||(t.abnormalQty||0)<params.minExcess[unitGroup(o.unit)];
  // Phủ của khoảng dự báo 90% — theo LƯỢNG của từng quan sát (gồm sai số cân), chỉ trên quan sát «bình thường» (nếu biết sự thật).
  if(b.state!=='cold_start'&&normalTruth){covN++;if(Math.abs(o.loss-s.expected)<=Z90*s.sdLoss)cov++;mae+=Math.abs(rate(o)-b.estimate);}
  // Báo sai = báo khi GẦN NHƯ không có gì bất thường (< ¼ ngưỡng); thất thoát thật dưới ngưỡng từng lần (bắt bằng cộng dồn) không phải báo sai.
  if(t){const me=params.minExcess[unitGroup(o.unit)],abn=(t.abnormalQty||0)>=me,nothing=(t.abnormalQty||0)<me/4;if(abn)trueAbn++;
   // Sót = bất thường thật mà KHÔNG bị báo và món KHÔNG đang được kiểm soát (M2+): ở M2 mọi phần thiếu đo được đều thành
   // hao hụt được phân bổ theo chính sách dù dưới ngưỡng báo động.
   const controlled=o.controlled===true||o.sampling==='control'||o.sampling==='m3';
   if(s.abnormal){flags++;minutes+=params.minutes.handover_weigh_m2*3;if(nothing)falseAlarm++;}else if(abn&&!controlled)missed++;
   if(s.abnormal&&t.cause){const hy=hypotheses(o,base,opts.evidence?opts.evidence(o):{},params);for(const h of HYPOTHESES){const y=t.cause===h?1:0;brier[h]=(brier[h]||0)+Math.pow(hy.posterior[h]-y,2);labels[h]=(labels[h]||0)+1;}}}
 }
 for(const h of Object.keys(brier))brier[h]=brier[h]/labels[h];
 return {n:seq.length,coverage90:covN?cov/covN:null,mae:covN?mae/covN:null,flags,falseAlarm,falseAlarmRate:flags?falseAlarm/flags:0,missed,trueAbnormal:trueAbn,missRate:trueAbn?missed/trueAbn:0,minutes,brier,labels};
}
function objective(m){return (m.missRate*10)+(m.falseAlarmRate*3)+(m.coverage90==null?1:Math.abs(m.coverage90-0.9)*4)+m.minutes/Math.max(1,m.n)/20+(m.failures||0)*2;}
// Hiệu chuẩn: tìm quanh tham số hiện hành, đánh giá trên phần THỜI GIAN SAU (chưa học), chỉ nhận khi tốt hơn và
// không tăng bỏ sót. mode 'sim' (khởi tạo từ mô phỏng) được bước lớn trong biên; 'live' tối đa ±liveStep mỗi lần (7 ngày hoạt động).
function calibrate(current,obs,opts={}){
 const mode=opts.mode||'live',P=clone(current),seq=obs.filter(usable).slice().sort((a,b)=>String(a.at).localeCompare(String(b.at)));
 const cut=Math.floor(seq.length*(opts.trainShare||0.6)),valid=seq.slice(cut);
 // opts.evaluator: đánh giá VÒNG KÍN (mô phỏng chạy lại với tham số ứng viên) thay cho chấm lại offline.
 const evalOn=opts.evaluator||(p=>evaluate(seq,p,{warm:cut,evidence:opts.evidence}));
 if(!opts.evaluator&&valid.length<(opts.minValidation||30))return {promoted:false,reason:'Chưa đủ quan sát kiểm (cần '+(opts.minValidation||30)+', có '+valid.length+')',params:current};
 const before=evalOn(P);let best=P,bestM=before,bestObj=objective(before);
 const keys=Object.keys(P.bounds),steps=mode==='sim'?[-0.3,-0.15,0.15,0.3]:[-P.liveStep,P.liveStep];
 for(let round=0;round<(mode==='sim'?3:1);round++)for(const k of keys){
  for(const st of steps){
   const cand=clone(best),[lo,hi]=P.bounds[k],v=get(best,k);let nv=Math.min(hi,Math.max(lo,v*(1+st)));if(k.startsWith('release.'))nv=Math.round(nv);if(nv===v)continue;setK(cand,k,nv);
   const m=evalOn(cand),obj=objective(m);
   if(m.missRate<=bestM.missRate+(opts.missTolerance||1e-9)&&(m.failures||0)<=(bestM.failures||0)&&obj<bestObj-1e-6){best=cand;bestM=m;bestObj=obj;}
  }
 }
 const promoted=best!==P,dataHash=hash(stable(seq.map(o=>[o.id,o.loss,o.used])));
 const changes=keys.filter(k=>get(best,k)!==get(P,k)).map(k=>({param:k,from:get(P,k),to:get(best,k)}));
 if(promoted){best.version=(mode==='sim'?'sim-':'live-')+hash(stable([dataHash,keys.map(k=>get(best,k))]))+'-'+(opts.stamp||'');/* tên theo dữ liệu + tham số: hai bộ khác nhau không trùng tên */best.origin=mode==='sim'?'calibrated_simulation':'calibrated_live';best.parent=current.version;}
 return {promoted,mode,reason:promoted?'Tốt hơn trên phần thời gian chưa học, bỏ sót không tăng':'Không có bộ tham số tốt hơn trong biên',params:promoted?best:current,
  record:{version:promoted?best.version:current.version,parent:current.version,mode,dataHash,window:{from:seq[0]?.at||null,to:seq.at(-1)?.at||null,train:cut,validation:valid.length},metricsBefore:before,metricsAfter:bestM,changes,rollbackRef:current.version}};
}
// Quay lui: số đo thật sau khi nhận kém hơn lúc kiểm định quá biên → về bản cha.
function shouldRollback(record,live,opts={}){const tol=opts.tolerance||0.05;const a=record.metricsAfter;if(!a||!live)return {rollback:false};
 const worse=live.missRate>a.missRate+tol||(live.coverage90!=null&&a.coverage90!=null&&Math.abs(live.coverage90-0.9)>Math.abs(a.coverage90-0.9)+tol*2);
 return worse?{rollback:true,to:record.parent,reason:'Chất lượng thật kém hơn lúc kiểm định — quay về '+record.parent}:{rollback:false};}
// Drift: CUSUM một phía trên điểm z theo từng món (thiếu tăng dần / mùa / đổi nhà cung cấp).
function drift(obs,base,params=DEFAULT_PARAMS,opts={}){
 const k=opts.k??0.5,h=opts.h??5,by={},out=[];
 for(const o of obs.filter(usable).sort((a,b)=>String(a.at).localeCompare(String(b.at))))(by[o.itemId]=by[o.itemId]||[]).push(o);
 for(const [id,list] of Object.entries(by)){let S=0,at=null;for(const o of list){S=Math.max(0,S+score(o,base,params).z-k);if(S>h&&!at)at=o.at;}if(at)out.push({itemId:id,at,cusum:Math.round(S*100)/100});}
 return out;
}
// Baseline đang «học» luôn cả thất thoát? Ước lượng tăng dần qua các phiên bản trong khi vẫn có bất thường → đóng băng.
function baselineAbsorption(history,opts={}){
 const out=[];for(const [id,vals] of Object.entries(history)){if(vals.length<3)continue;const first=vals[0].estimate,last=vals.at(-1).estimate,ups=vals.slice(1).filter((v,i)=>v.estimate>vals[i].estimate+1e-6).length;
  if(last-first>(opts.minRise||0.01)&&ups>=vals.length-2&&vals.some(v=>v.abnormal>0))out.push({itemId:id,from:first,to:last,action:'freeze_baseline',reason:'Mức thường tăng liên tục kèm bất thường — không cho baseline hấp thụ hao hụt'});}
 return out;
}
// Món có mức thường vượt hẳn các món cùng nhóm (định mức thiếu ngay từ đầu, thất thoát từ trước khi học) — baseline riêng của
// món đó không được dùng để «bình thường hoá»: đề xuất cân phần định mức / M2.
function outlierItems(base,opts={}){
 const k=opts.k??3,out=[];for(const b of Object.values(base.items)){const g=base.groups[b.unitGroup];if(!g||b.n<3||g.items<3)continue;if(b.median>g.mu0+k*g.tau)out.push({itemId:b.itemId,median:b.median,groupMedian:g.mu0,tau:g.tau,next:TESTS.recipe,reason:'Mức hao hụt thường cao hơn hẳn nhóm cùng đơn vị'});}
 return out;
}
// Kiểm toán mô hình độc lập: mọi phiên bản có căn cứ, kiểm định, biên, đường quay lui.
function auditModels(records,params=DEFAULT_PARAMS){
 const issues=[];
 for(const r of records){
  if(!r.dataHash||!r.window||!r.metricsBefore||!r.metricsAfter)issues.push({code:'MODEL_NO_EVIDENCE',version:r.version});
  if(r.version!==r.parent&&!r.rollbackRef)issues.push({code:'MODEL_NO_ROLLBACK',version:r.version});
  if(r.metricsAfter&&r.metricsBefore&&r.metricsAfter.missRate>r.metricsBefore.missRate+1e-9&&r.version!==r.parent)issues.push({code:'MODEL_PROMOTED_WORSE_MISS',version:r.version});
  if(r.mode==='live')for(const c of r.changes||[])if(Math.abs(c.to-c.from)>Math.abs(c.from)*params.liveStep+1e-9&&!String(c.param).startsWith('release.'))issues.push({code:'MODEL_STEP_OUT_OF_BOUNDS',version:r.version,param:c.param});
  for(const c of r.changes||[]){const b=params.bounds[c.param];if(b&&(c.to<b[0]||c.to>b[1]))issues.push({code:'MODEL_OUT_OF_RANGE',version:r.version,param:c.param});}
 }
 return issues;
}
// Bộ tham số cũ (thiếu khoá mới) → bổ sung khoá thiếu bằng tiên nghiệm khai báo; không ghi đè giá trị đã hiệu chuẩn.
function withDefaults(p){const out=clone(DEFAULT_PARAMS);(function merge(dst,src){for(const [k,v] of Object.entries(src||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&dst[k]&&typeof dst[k]==='object'&&!Array.isArray(dst[k]))merge(dst[k],v);else dst[k]=v;}})(out,p);return out;}
/* Hiệu chỉnh xác suất theo nhãn (Platt, hồi quy logistic trên logit hậu nghiệm, kéo về đồng nhất bằng ridge).
 * pairs: [[p,y]] theo thứ tự thời gian. brier = Brier NGOÀI MẪU (mỗi nhãn chấm bằng ánh xạ học từ các nhãn TRƯỚC nó) — không tự chấm điểm mình. */
const sig=x=>1/(1+Math.exp(-x)),logit=p=>{const q=Math.min(1-1e-4,Math.max(1e-4,Number(p)||0));return Math.log(q/(1-q));};
function fitMap(pairs,ridge){let a=1,b=0;for(let it=0;it<30;it++){let ga=ridge*(a-1),gb=ridge*b,haa=ridge,hab=0,hbb=ridge;
 for(const [p,y] of pairs){const x=logit(p),q=sig(a*x+b),r=q-y,w=Math.max(1e-6,q*(1-q));ga+=r*x;gb+=r;haa+=w*x*x;hab+=w*x;hbb+=w;}
 const det=haa*hbb-hab*hab;if(!(det>0))break;const da=(hbb*ga-hab*gb)/det,db=(haa*gb-hab*ga)/det;a-=da;b-=db;if(Math.abs(da)+Math.abs(db)<1e-7)break;}
 return {a,b};}
function applyCalibration(map,p){return map&&Number.isFinite(map.a)?sig(map.a*logit(p)+map.b):p;}
function fitCalibration(pairs,params=DEFAULT_PARAMS){
 const C={...DEFAULT_PARAMS.calibration,...(params.calibration||{})},P=(pairs||[]).filter(x=>Array.isArray(x)&&Number.isFinite(Number(x[0]))&&(x[1]===0||x[1]===1)).slice(-C.keep);
 let s=0,n=0,raw=0;for(let i=0;i<P.length;i++){raw+=Math.pow(P[i][0]-P[i][1],2);if(i>=C.minFit){const m=fitMap(P.slice(0,i),C.ridge);s+=Math.pow(applyCalibration(m,P[i][0])-P[i][1],2);n++;}}
 const m=P.length>=C.minFit?fitMap(P,C.ridge):null;
 return {n:P.length,a:m?m.a:1,b:m?m.b:0,brier:n?s/n:null,brierRaw:P.length?raw/P.length:null,evaluated:n,calibrated:P.length>=C.minLabels&&n>0&&s/n<=C.maxBrier};}
const api={VERSION,withDefaults,fitCalibration,applyCalibration,HYPOTHESES,TESTS,DEFAULT_PARAMS,unitGroup,median,mad,rate,baseline,predict,score,hypotheses,nextMeasurement,accumulate,controlAdvice,evaluate,objective,calibrate,shouldRollback,drift,baselineAbsorption,outlierItems,auditModels,hash,stable};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Learn=api;
})(typeof window!=='undefined'?window:globalThis);
