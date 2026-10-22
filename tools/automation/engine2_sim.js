#!/usr/bin/env node
'use strict';
// BỘ MÔ PHỎNG QUÁN có «sự thật» biết trước — lường trước các case CHƯA từng xảy ra (lộ trình cấp 3–6, chủ quán 22/10).
// Vòng kín: quán giả chạy từng ngày, CHÍNH unit_engine2_learn_v1.js điều hành (chấm bất thường, xếp giả thuyết, chọn phép đo,
// tăng / hạ mức), phép đo được «thực hiện» ngày hôm sau và trả nhãn — y như quy trình thật. Mỗi gram hao hụt có sổ «sự thật»
// (thường, thất thoát, sai bì, tỷ trọng, định mức thiếu, tiêu hao không khai, lỗi đồng bộ, nhiễu cân) để chấm hệ thống.
//   node tools/automation/engine2_sim.js                  chạy thư viện kịch bản với tham số đang phát hành, in kết quả
//   node tools/automation/engine2_sim.js --calibrate      hiệu chuẩn trên nhiều hạt giống → sinh unit_engine2_params_v1.js
const fs=require('node:fs'),path=require('node:path');
const L=require('../../unit_engine2_learn_v1.js');

function rng(seed){let a=seed>>>0;const u=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const n=(m=0,s=1)=>{const x=Math.max(1e-12,u()),y=u();return m+s*Math.sqrt(-2*Math.log(x))*Math.cos(2*Math.PI*y);};
 const pois=l=>{if(l>30)return Math.max(0,Math.round(n(l,Math.sqrt(l))));let k=0,p=1;const e=Math.exp(-l);do{k++;p*=u();}while(p>e);return k-1;};
 return {u,n,pois,pick:a=>a[Math.floor(u()*a.length)]};}
const DAY=86400000,START=Date.parse('2026-01-05T00:00:00Z');
const dayKey=d=>new Date(START+d*DAY).toISOString().slice(0,10);
const ITEMS=[ // món mẫu: đơn vị, dung tích tem, lượng bán/ngày (đơn vị nền), hao hụt thường thật, giá/đơn vị
 {id:'pearl',unit:'g',cap:2000,daily:600,normal:0.02,price:22},{id:'rich',unit:'g',cap:1000,daily:180,normal:0.015,price:65},
 {id:'syrup',unit:'ml',cap:750,daily:120,normal:0.01,price:85,density:1.3},{id:'milk',unit:'ml',cap:1000,daily:350,normal:0.012,price:28,density:1.03},
 {id:'jelly',unit:'g',cap:500,daily:70,normal:0.02,price:90},{id:'tea',unit:'cái',cap:50,daily:9,normal:0.0,price:720},{id:'peach',unit:'cái',cap:30,daily:5,normal:0.01,price:1000}
];
/* Thư viện kịch bản. inject: thất thoát (theft), sai bì (tare), tỷ trọng (density), định mức thiếu (recipe), tiêu hao không khai
 * (unrecorded), lỗi đồng bộ (sync), drift (đổi mức thường), mẻ đổ một lần (spill), đổi nhà cung cấp (supplier), cân nhiễu (noisy). */
const SCENARIOS=[
 {name:'yen_tinh',note:'Chỉ hao hụt thường + nhiễu cân',expect:{maxFalseAlarmRate:0.25}},
 {name:'that_thoat_keo_dai',note:'Mất 60 g/ngày trân châu từ ngày 20 đến 40, nhiều người',inject:{theft:{item:'pearl',from:20,to:40,qty:60}},expect:{detectWithin:6,residual:true}},
 {name:'that_thoat_mot_nguoi',note:'Mất rich lùn ngày chỉ một người làm',staffPattern:'single',inject:{theft:{item:'rich',from:15,to:35,qty:25}},expect:{detectWithin:8,residual:true}},
 {name:'sai_bi',note:'Bì dụng cụ ghi cao hơn thật 25 g (thiếu ảo)',startLevel:{jelly:2},inject:{tare:{vessel:'v_jelly',bias:-25}},expect:{identify:'tare',fixed:true}},
 {name:'sai_ty_trong',note:'Syrup ghi tỷ trọng cao hơn thật 10%, chưa có mẫu đo',startLevel:{syrup:2},inject:{density:{item:'syrup',f:0.10}},expect:{identify:'density',fixed:true}},
 {name:'dinh_muc_thieu_giua_ky',note:'Từ ngày 25 định mức sổ thấp hơn thật 12% (đổi công thức không cập nhật)',inject:{recipe:{item:'pearl',beta:0.12,from:25}},expect:{flagAny:['drift','absorption','recipe']}},
 {name:'dinh_muc_thieu_tu_dau',note:'Rich lùn định mức thiếu 15% từ ngày đầu',inject:{recipe:{item:'rich',beta:0.15,from:0}},expect:{flagAny:['outlier','recipe']}},
 {name:'tieu_hao_khong_khai',note:'Bán không gắn tem / mở mã không khai',inject:{unrecorded:{item:'milk',prob:0.35,qty:80,from:10,to:40}},expect:{identify:'unrecorded'}},
 {name:'loi_dong_bo',note:'Mất lượt trừ kho (Sổ lệch) — không phải mất hàng',inject:{sync:{item:'pearl',prob:0.3,qty:120,from:10,to:40}},expect:{identify:'sync',notPhysical:true}},
 {name:'drift_mua',note:'Mức hao hụt thường của trân châu tăng từ 2% lên 5% từ ngày 30',inject:{drift:{item:'pearl',from:30,normal:0.05}},expect:{flagAny:['drift','absorption']}},
 {name:'me_do_mot_lan',note:'Đổ 400 g một lần ngày 22 — baseline không bị kéo lệch',inject:{spill:{item:'pearl',day:22,qty:400}},expect:{robustBaseline:'pearl'}},
 {name:'doi_nha_cung_cap',note:'Ngày 25 tem trân châu đổi 2000 g → 1000 g',inject:{supplier:{item:'pearl',day:25,cap:1000}},expect:{maxFalseAlarmRate:0.3}},
 {name:'mon_it_ban',note:'Món bán rất ít (~0,6 miếng/ngày) — không được tuyên bố đủ tin cậy, không báo động sai',items:['peach','tea'],itemOverrides:{peach:{daily:0.6}},expect:{noTrustedFor:['peach'],maxFalseAlarmRate:0.25}},
 {name:'nhieu_loi_cung_luc',note:'Sai bì + thất thoát cùng lúc — phải tách được',startLevel:{jelly:2},inject:{tare:{vessel:'v_jelly',bias:-20},theft:{item:'jelly',from:25,to:45,qty:12}},expect:{identify:'tare',fixed:true,residual:true}},
 {name:'can_nhieu',note:'Cân điện tử kém (sai số 3×)',noise:3,expect:{maxFalseAlarmRate:0.35}},
 {name:'thieu_nho_lap_lai',note:'Thiếu nhỏ 8 g/ngày dưới ngưỡng từng lần',inject:{theft:{item:'jelly',from:10,to:55,qty:8}},expect:{flagAny:['drift','detect']}},
 {name:'du_hang',note:'Sổ thấp hơn thực (nhập thiếu sổ) — dư không phải thất thoát',inject:{surplus:{item:'pearl',from:15,to:30,qty:40}},expect:{noEscalateFor:['pearl']}},
 {name:'nhan_hang_sai_dung_tich',note:'Tem trân châu ghi 2000 g nhưng thật 1880 g (nhận hàng sai đơn vị — D1)',inject:{receiving:{item:'pearl',delta:120,from:0}},expect:{identify:'receiving',fixed:true}},
 {name:'can_lech_he_so',note:'Từ ngày 20 cân đọc thấp 4% (hỏng / chưa hiệu chỉnh) — thiếu ảo ở mọi món',startLevel:{rich:2,jelly:2},inject:{scale:{gain:-0.04,from:20}},expect:{identify:'scale',fixed:true}},
 {name:'nhan_vien_moi_qua_tay',note:'Từ ngày 20 nhân viên mới làm quá tay +10% rich lùn khi có ca',inject:{newStaff:{id:'n',from:20,item:'rich',over:0.10}},expect:{detectAny:'rich',residual:'rich'}},
 {name:'cuoi_tuan_dong',note:'Thứ 7 / CN bán gấp đôi — không được báo sai',weekendFactor:2,expect:{maxFalseAlarmPerObs:0.015}},
 {name:'ban_dot_bien',note:'Ngày 30 bán gấp 5 lần — không được báo sai',inject:{spike:{day:30,factor:5}},expect:{maxFalseAlarmPerObs:0.015}},
 {name:'that_thoat_sau_ha_muc',note:'Đang M2, sạch → hạ mức; từ ngày 40 mất 50 g/ngày trân châu — cân ngẫu nhiên M0 phải bắt lại',startLevel:{pearl:2},inject:{theft:{item:'pearl',from:40,to:58,qty:50}},expect:{detectWithin:6,releasedBefore:{item:'pearl',day:40}}},
 {name:'mo_nhieu_ma',note:'Mở nhiều mã cùng lúc + bán không gắn mã (sữa)',inject:{unrecorded:{item:'milk',prob:0.3,qty:70,from:15,to:45,otherOpen:true}},expect:{identify:'unrecorded'}}
];

function simulate(sc,opts={}){
 const R=rng(opts.seed||1),params=opts.params||L.DEFAULT_PARAMS,days=opts.days||60,inj=sc.inject||{},noiseK=sc.noise||1;
 const items=ITEMS.filter(i=>!sc.items||sc.items.includes(i.id)).map(i=>({...i,...(sc.itemOverrides?.[i.id]||{})}));
 const staff=['a','b','c','d','e'],vessels={};for(const it of items)vessels['v_'+it.id]={tareTrue:150,tareRecorded:150};
 if(inj.tare)vessels[inj.tare.vessel].tareRecorded=vessels[inj.tare.vessel].tareTrue-inj.tare.bias;
 const st={},obs=[],events=[],evidence={tareChecks:{},recipeAudits:{},itemResiduals:{},openHistory:{},labelsCount:{},brier:{}},brierSum={};
 for(const it of items){st[it.id]={level:sc.startLevel?.[it.id]||0,lastRelease:-99,density:{f:inj.density?.item===it.id?inj.density.f:0,proven:false},recipeFixed:false,unrecordedOn:true,syncOn:true,receivingOn:true,c:null,lastM0:-99,flags:[]};}
 let scaleGain=0,scaleFixed=false;evidence.sealedChecks={};evidence.referenceChecks=[];
 const open=(it,d)=>{const cap=inj.supplier?.item===it.id&&d>=inj.supplier.day?inj.supplier.cap:it.cap,recv=inj.receiving?.item===it.id&&st[it.id].receivingOn&&d>=inj.receiving.from?inj.receiving.delta:0;st[it.id].c={cap,fromOpen:true,trueRem:cap-recv,bookRem:cap,recv,from:d,used:0,acc:{normal:0,theft:0,unrecorded:0,sync:0,recipe:0,surplus:0,drift:0,receiving:recv,overpour:0},ctx:{}};};
 for(const it of items)open(it,0);
 let base=L.baseline([],params),pending=[],minutes=0;
 const unitKey=it=>L.unitGroup(it.unit);
 function record(it,d,kind,group){
  const s=st[it.id],c=s.c,meas=params.measSigma[unitKey(it)]*noiseK;let measured=0,tareApp=0,densApp=0,noise=0,nWeigh=0;
  // Sổ đầu khoảng đặt theo lần cân trước → sai số lần cân đó nằm trong quan sát (kể cả báo hết).
  const startWeighed=c.fromWeigh?1:0;
  if(kind!=='finish'){nWeigh=1;const v=vessels['v_'+it.id],b=v.tareTrue-v.tareRecorded;tareApp=-b;
   if(it.unit==='ml'){densApp=c.trueRem*s.density.f/(1+s.density.f);}
   noise=R.n(0,meas);const g=scaleFixed?0:scaleGain,scaleApp=-(c.trueRem*g);measured=Math.max(0,c.trueRem*(1+g)+b-densApp+noise);if(it.unit==='cái')measured=Math.round(measured);c.scaleApp=scaleApp;}
  const scaleApp=kind!=='finish'?(c.scaleApp||0):0,loss=c.bookRem-measured,a=c.acc,abn=a.theft+a.drift+a.overpour+a.unrecorded+a.sync+a.recipe+a.receiving+tareApp+densApp+scaleApp-a.surplus;
  const parts={physical:a.theft+a.drift+a.overpour,unrecorded:a.unrecorded,sync:a.sync,recipe:a.recipe,tare:tareApp,density:densApp,receiving:a.receiving,scale:scaleApp};const cause=Object.entries(parts).sort((x,y)=>y[1]-x[1])[0];
  const o={id:sc.name+'~'+it.id+'~'+d+'~'+kind+'~'+obs.length,itemId:it.id,unit:it.unit,at:new Date(START+d*DAY+20*3600000).toISOString(),day:dayKey(d),used:c.used,loss,measured,nWeigh:nWeigh+startWeighed,vesselIds:nWeigh?['v_'+it.id]:[],groupKey:group,sampling:kind,verified:true,
   fromOpen:!!c.fromOpen,cap:c.fromOpen?c.cap:null,ctx:{untracked:a.unrecorded>0,otherOpen:!!c.otherOpen,anomalies:a.sync>0?1:0,densityProven:s.density.proven,fifoDebt:c.bookRem<0},
   truth:{normal:a.normal,abnormalQty:abn,cause:cause&&cause[1]>params.minExcess[unitKey(it)]?cause[0]:null,parts,noise},
   controlled:s.level>=2};
  // Ảnh chụp bằng chứng chỉ cần cho quan sát có bất thường THẬT (evaluate chấm giả thuyết ở đó) — không chép labelLog (tốn bộ nhớ khi hiệu chuẩn).
  if(o.truth.cause){const {labelLog,...ev}=evidence;o.evidence=JSON.parse(JSON.stringify(ev));}
  obs.push(o);c.used=0;c.acc={normal:0,theft:0,unrecorded:0,sync:0,recipe:0,surplus:0,drift:0,receiving:0,overpour:0};c.bookRem=measured;c.trueRem=Math.max(0,c.trueRem);c.fromWeigh=kind!=='finish';c.fromOpen=false;c.otherOpen=false;
  if(kind!=='finish'){const r=o.used>0?(o.loss-base.items[it.id]?.estimate*o.used||0)/o.used:NaN;if(Number.isFinite(r))(evidence.itemResiduals[it.id]=evidence.itemResiduals[it.id]||[]).push({groupKey:group,rate:r});}
  minutes+=kind==='finish'?0:params.minutes.handover_weigh_m2;
  // Hệ thống phản ứng (cấp 4–5): chấm, xếp giả thuyết, chọn phép đo, tăng mức.
  const sc0=L.score(o,base,params),acc=kind==='finish'&&!o.nWeigh?{alarm:false,S:s.S||0}:L.accumulate(s.S,sc0,params);s.S=acc.S;
  if(sc0.abnormal||acc.alarm){o.flagged=true;
   const hy=L.hypotheses(o,base,evidence,params);s.flags.push({d,accumulated:acc.alarm,top:hy.ranking[0].hypothesis,next:hy.next?.test,residual:hy.residual.qty,truth:o.truth.cause,abnormalTrue:o.truth.abnormalQty>=params.minExcess[unitKey(it)]});
   if(hy.next?.test)pending.push({d:d+1,it,test:hy.next.test,resolves:hy.next.resolves,p:hy.posterior[hy.next.resolves],truthCause:o.truth.cause});
   const adv=acc.alarm?{to:Math.max(s.level,2),reason:'Cộng dồn thiếu nhỏ vượt ngưỡng (A8)'}:L.controlAdvice({level:s.level},[o],base,{},params);if(adv.to>s.level){s.level=adv.to;events.push({d,item:it.id,ev:'level_'+adv.to,reason:adv.reason});}
  }
  if(o.used>0&&(o.fromOpen?o.cap>0:o.nWeigh>=2))(evidence.openHistory[it.id]=evidence.openHistory[it.id]||[]).push({id:o.id,at:o.at,fromOpen:!!o.fromOpen,frac:o.fromOpen?sc0.excess/o.cap:null,sdFrac:o.fromOpen?sc0.sdLoss/o.cap:null,z:sc0.z});
  return o;
 }
 for(let d=0;d<days;d++){
  const group=sc.staffPattern==='single'?[R.pick(staff)]:staff.filter(()=>R.u()<0.45);if(!group.length)group.push(R.pick(staff));
  if(inj.newStaff&&d>=inj.newStaff.from&&R.u()<0.5)group.push(inj.newStaff.id);const gk=group.sort().join('+');
  const volume=(sc.weekendFactor&&[5,6].includes(d%7)?sc.weekendFactor:1)*(inj.spike?.day===d?inj.spike.factor:1);
  if(inj.scale&&d>=inj.scale.from)scaleGain=inj.scale.gain;
  for(const it of items){
   const s=st[it.id];let c=s.c;
   const sales=(it.unit==='cái'?R.pois(it.daily*volume):Math.max(0,R.n(it.daily*volume,it.daily*volume*0.25)));
   const beta=inj.recipe?.item===it.id&&d>=inj.recipe.from&&!s.recipeFixed?inj.recipe.beta:0;
   const normalRate=inj.drift?.item===it.id&&d>=inj.drift.from?inj.drift.normal:it.normal;
   let left=sales;
   while(left>0){
    const trueUse=left/(1-beta),noiseF=Math.exp(R.n(0,0.3)),normal=trueUse*normalRate*noiseF,extra=trueUse*Math.max(0,normalRate-it.normal)*noiseF,needTrue=trueUse+normal;
    if(c.trueRem>=needTrue){c.trueRem-=needTrue;c.bookRem-=left;c.used+=left;c.acc.normal+=normal-extra;c.acc.drift+=extra;c.acc.recipe+=trueUse-left;left=0;}
    else{const frac=Math.max(0,c.trueRem)/needTrue,part=left*frac;c.bookRem-=part;c.used+=part;c.acc.normal+=(normal-extra)*frac;c.acc.drift+=extra*frac;c.acc.recipe+=(trueUse-left)*frac;c.trueRem=0;left-=part;
     record(it,d,'finish',gk);open(it,d);c=s.c;if(left<1e-6)break;}
   }
   if(inj.newStaff?.item===it.id&&group.includes(inj.newStaff.id)){const q=Math.min(c.trueRem,sales*inj.newStaff.over);c.trueRem-=q;c.acc.overpour+=q;}
   if(inj.theft?.item===it.id&&d>=inj.theft.from&&d<=inj.theft.to){const q=Math.min(c.trueRem,inj.theft.qty*Math.exp(R.n(0,0.2)));c.trueRem-=q;c.acc.theft+=q;}
   if(inj.spill?.item===it.id&&d===inj.spill.day){const q=Math.min(c.trueRem,inj.spill.qty);c.trueRem-=q;c.acc.theft+=q;}
   if(inj.unrecorded?.item===it.id&&s.unrecordedOn&&d>=inj.unrecorded.from&&d<=inj.unrecorded.to&&R.u()<inj.unrecorded.prob){const q=Math.min(c.trueRem,inj.unrecorded.qty);c.trueRem-=q;c.acc.unrecorded+=q;if(inj.unrecorded.otherOpen)c.otherOpen=true;}
   if(inj.sync?.item===it.id&&s.syncOn&&d>=inj.sync.from&&d<=inj.sync.to&&R.u()<inj.sync.prob){const q=inj.sync.qty;c.bookRem+=q;c.acc.sync+=q;}
   if(inj.surplus?.item===it.id&&d>=inj.surplus.from&&d<=inj.surplus.to){c.trueRem+=inj.surplus.qty;c.acc.surplus+=inj.surplus.qty;}
   if(c.trueRem<=0.5){record(it,d,'finish',gk);open(it,d);}
  }
  // Cân bàn giao cho món đang kiểm soát (M2+); cân ngẫu nhiên M0 theo ngân sách (≤ 2 món/ca, ưu tiên giá trị cao, lâu chưa cân).
  for(const it of items)if(st[it.id].level>=2&&st[it.id].c.used>0)record(it,d,'control',gk);
  const m0=items.filter(it=>st[it.id].level<2&&d-st[it.id].lastM0>=2&&st[it.id].c.used>0).sort((x,y)=>(y.price*y.daily*(d-st[y.id].lastM0))-(x.price*x.daily*(d-st[x.id].lastM0))).slice(0,2);
  for(const it of m0){st[it.id].lastM0=d;record(it,d,'random_m0',gk);}
  // Thực hiện phép đo đã chọn hôm trước → nhãn cho giả thuyết (y như quy trình thật) + sửa cái đo được sửa tại quầy.
  for(const t of pending.filter(p=>p.d===d)){
   const s=st[t.it.id];minutes+=params.minutes[t.test]||3;
   // Nhãn = phép đo chẩn đoán THẤY lỗi lúc đo (cùng ngưỡng learnDay của unit_engine2_store_v1.js), không phải «nguyên nhân lớn nhất».
   const v0=vessels['v_'+t.it.id],within=x=>x&&x.item===t.it.id&&d>=x.from&&d<=(x.to??1e9);
   const y=({tare_check:Math.abs(v0.tareTrue-v0.tareRecorded)>2*params.measSigma[unitKey(t.it)],density_proof:Math.abs(s.density.f)>0.03,
    recipe_portion_weigh:inj.recipe?.item===t.it.id&&d>=inj.recipe.from&&Math.abs(inj.recipe.beta)>0.05,scan_open_units:within(inj.unrecorded)&&s.unrecordedOn,
    resync_recount:within(inj.sync)&&s.syncOn,weigh_sealed_unit:inj.receiving?.item===t.it.id&&s.receivingOn&&d>=inj.receiving.from&&inj.receiving.delta/t.it.cap>0.02,
    reference_weigh:!scaleFixed&&Math.abs(scaleGain)>0.01})[t.test]?1:0;
   (evidence.labelLog=evidence.labelLog||[]).push({h:t.resolves,p:t.p||0,y,item:t.it.id,d});brierSum[t.resolves]=(brierSum[t.resolves]||0)+Math.pow((t.p||0)-y,2);evidence.labelsCount[t.resolves]=(evidence.labelsCount[t.resolves]||0)+1;evidence.brier[t.resolves]=brierSum[t.resolves]/evidence.labelsCount[t.resolves];
   if(t.test==='tare_check'){const v=vessels['v_'+t.it.id];(evidence.tareChecks['v_'+t.it.id]=evidence.tareChecks['v_'+t.it.id]||[]).push({recorded:v.tareRecorded,measured:v.tareTrue+R.n(0,1)});if(Math.abs(v.tareTrue-v.tareRecorded)>2*params.measSigma[unitKey(t.it)]){v.tareRecorded=v.tareTrue;events.push({d,item:t.it.id,ev:'fixed_tare'});}}
   if(t.test==='density_proof'){if(s.density.f){events.push({d,item:t.it.id,ev:'fixed_density'});}s.density={f:0,proven:true};}
   if(t.test==='recipe_portion_weigh'){const beta=inj.recipe?.item===t.it.id&&d>=inj.recipe.from?inj.recipe.beta:0;(evidence.recipeAudits[t.it.id]=evidence.recipeAudits[t.it.id]||[]).push({book:100,measured:100/(1-beta)+R.n(0,1)});if(beta)events.push({d,item:t.it.id,ev:'identified_recipe'});}
   if(t.test==='scan_open_units'&&inj.unrecorded?.item===t.it.id){s.unrecordedOn=false;events.push({d,item:t.it.id,ev:'fixed_unrecorded'});}
   if(t.test==='resync_recount'&&inj.sync?.item===t.it.id){s.syncOn=false;events.push({d,item:t.it.id,ev:'fixed_sync'});}
   if(t.test==='weigh_sealed_unit'){const delta=inj.receiving?.item===t.it.id&&s.receivingOn?inj.receiving.delta:0;(evidence.sealedChecks[t.it.id]=evidence.sealedChecks[t.it.id]||[]).push({recorded:t.it.cap,measured:t.it.cap-delta+R.n(0,1)});if(delta){s.receivingOn=false;events.push({d,item:t.it.id,ev:'fixed_receiving'});}}
   if(t.test==='reference_weigh'){const g=scaleFixed?0:scaleGain;evidence.referenceChecks.push({known:1000,reading:1000*(1+g)+R.n(0,0.5)});if(Math.abs(g)>0.01){scaleFixed=true;events.push({d,item:t.it.id,ev:'fixed_scale'});}}
  }
  pending=pending.filter(p=>p.d>d);
  base=L.baseline(obs,params);   // worker tính lại mỗi ngày (bị giới hạn đọc theo khoảng) — sai số cân học kịp
  if(d%7===6){
   for(const it of items){const s=st[it.id];if(s.level<1)continue;const recent=obs.filter(o=>o.itemId===it.id&&o.day>dayKey(d-14));const adv=L.controlAdvice({level:s.level},recent,base,{typicalUnit:it.cap,daysSinceLastRelease:d-s.lastRelease},params);if(adv.action==='release'){s.level=adv.to;s.lastRelease=d;events.push({d,item:it.id,ev:'release_'+adv.to});}}
  }
 }
 base=L.baseline(obs,params);
 return {scenario:sc.name,obs,events,flags:Object.fromEntries(items.map(it=>[it.id,st[it.id].flags])),levels:Object.fromEntries(items.map(it=>[it.id,st[it.id].level])),base,minutes,evidence,
  drift:L.drift(obs,L.baseline(obs.filter(o=>o.day<dayKey(Math.floor(days/2))),params),params),outliers:L.outlierItems(base),days};
}

/* Chấm một kịch bản theo kỳ vọng đã khai — trả danh sách lỗi (rỗng = đạt). */
function judge(sc,r,params=L.DEFAULT_PARAMS){
 const e=sc.expect||{},fail=[],inj=sc.inject||{},m=L.evaluate(r.obs,params,{evidence:o=>o.evidence});
 const allFlags=Object.entries(r.flags).flatMap(([id,f])=>f.map(x=>({...x,item:id})));
 // Kịch bản không có bất thường thật: «tỷ lệ báo sai trong số lần báo» luôn 100% — chấm báo sai TRÊN MỖI QUAN SÁT (≤ 1,5%).
 if(m.trueAbnormal===0){const per=m.falseAlarm/Math.max(1,m.n);if(per>(e.maxFalseAlarmPerObs??0.015))fail.push('báo sai '+(per*100).toFixed(1)+'% số quan sát > '+((e.maxFalseAlarmPerObs??0.015)*100)+'%');}
 else if(e.maxFalseAlarmRate!=null&&m.falseAlarmRate>e.maxFalseAlarmRate&&m.flags>=4)fail.push('báo động sai '+(m.falseAlarmRate*100).toFixed(0)+'% > '+(e.maxFalseAlarmRate*100)+'%');
 const tgt=inj.theft?.item;
 if(e.detectWithin!=null){const first=allFlags.find(f=>f.item===tgt&&f.d>=inj.theft.from);if(!first||first.d-inj.theft.from>e.detectWithin)fail.push('phát hiện thất thoát chậm: '+(first?first.d-inj.theft.from+' ngày':'không phát hiện'));}
 if(e.residual===true){const f=allFlags.filter(f=>f.item===tgt&&f.d>=inj.theft.from&&f.residual>0);if(!f.length)fail.push('không báo phần dư chưa giải thích');}
 if(e.identify){const it=inj.tare?Object.keys(r.flags).find(id=>'v_'+id===inj.tare.vessel):e.identify==='scale'?null:(inj[e.identify]?.item);const ok=allFlags.some(f=>(it==null||f.item===it)&&(f.next===L.TESTS[e.identify]||f.top===e.identify))||r.events.some(x=>(it==null||x.item===it)&&x.ev==='fixed_'+e.identify||x.ev==='identified_'+e.identify);if(!ok)fail.push('không nhận ra giả thuyết '+e.identify);}
 if(e.fixed){const ev=r.events.find(x=>/^fixed_/.test(x.ev));if(!ev)fail.push('không dẫn tới sửa được (kiểm bì / đo tỷ trọng)');}
 if(e.notPhysical){const it=inj.sync.item,f=allFlags.filter(f=>f.item===it);if(f.length&&f.every(x=>x.top==='physical'||x.next==='handover_weigh_m2'))fail.push('lỗi đồng bộ bị coi là mất hàng');}
 if(e.flagAny){const hit={drift:r.drift.length>0,absorption:false,recipe:r.events.some(x=>x.ev==='identified_recipe')||allFlags.some(f=>f.top==='recipe'||f.next===L.TESTS.recipe),outlier:r.outliers.length>0,detect:allFlags.some(f=>f.abnormalTrue)};if(!e.flagAny.some(k=>hit[k]))fail.push('không có tín hiệu nào trong '+e.flagAny.join('/'));}
 if(e.robustBaseline){const b=r.base.items[e.robustBaseline],truth=ITEMS.find(i=>i.id===e.robustBaseline).normal;if(!b||Math.abs(b.estimate-truth)>0.02)fail.push('baseline bị kéo lệch: '+(b?b.estimate.toFixed(3):'—')+' so với '+truth);}
 if(e.noTrustedFor)for(const id of e.noTrustedFor)if(r.base.items[id]?.state==='trusted')fail.push(id+' bị coi là đủ tin cậy khi ít mẫu');
 if(e.detectAny){if(!allFlags.some(f=>f.item===e.detectAny))fail.push('không phát hiện bất thường ở '+e.detectAny);}
 if(typeof e.residual==='string'){if(!allFlags.some(f=>f.item===e.residual&&f.residual>0))fail.push('không báo phần dư ở '+e.residual);}
 if(e.releasedBefore){const rel=r.events.find(x=>x.item===e.releasedBefore.item&&/^release_/.test(x.ev)&&x.d<e.releasedBefore.day);if(!rel)fail.push(e.releasedBefore.item+' không được hạ mức khi sạch (trước ngày '+e.releasedBefore.day+')');}
 if(e.noEscalateFor)for(const id of e.noEscalateFor)if(r.events.some(x=>x.item===id&&/^level_/.test(x.ev)))fail.push(id+' bị tăng kiểm soát vì DƯ hàng');
 return {fail,metrics:m};
}
function aggregate(res){const a=res.reduce((x,r)=>{x.flags+=r.metrics.flags;x.falseAlarm+=r.metrics.falseAlarm;x.missed+=r.metrics.missed;x.trueAbnormal+=r.metrics.trueAbnormal;x.n+=r.metrics.n;x.minutes+=r.result.minutes;x.failures+=r.fail.length?1:0;if(r.metrics.coverage90!=null){x.cov+=r.metrics.coverage90;x.covN++;}return x;},{flags:0,falseAlarm:0,missed:0,trueAbnormal:0,n:0,minutes:0,failures:0,cov:0,covN:0});
 return {n:a.n,flags:a.flags,falseAlarm:a.falseAlarm,falseAlarmRate:a.flags?a.falseAlarm/a.flags:0,missed:a.missed,trueAbnormal:a.trueAbnormal,missRate:a.trueAbnormal?a.missed/a.trueAbnormal:0,minutes:a.minutes,failures:a.failures,coverage90:a.covN?a.cov/a.covN:null,runs:res.length};}
function runLibrary(params,seeds=[1],opts={}){
 const out=[];for(const sc of SCENARIOS)for(const seed of seeds){const r=simulate(sc,{seed,params,days:opts.days});out.push({scenario:sc.name,seed,note:sc.note,...judge(sc,r,params),events:r.events.length,obs:r.obs.length,result:r});}
 return out;
}

if(require.main===module){
 const args=process.argv.slice(2);
 if(args[0]==='--eval'){
  // Tiến trình con của --calibrate: chạy thư viện với bộ tham số trong file, in số đo gọn từng lượt.
  const p=JSON.parse(fs.readFileSync(args[1],'utf8')),res=runLibrary(p,args[2].split(',').map(Number));
  process.stdout.write(JSON.stringify(res.map(r=>({fail:r.fail,metrics:r.metrics,result:{minutes:r.result.minutes}}))));process.exit(0);
 }
 if(args.includes('--calibrate')){
  // Hiệu chuẩn khởi tạo trên MÔ PHỎNG (hạt giống 1–6), nghiệm thu trên hạt giống CHƯA dùng (101–103).
  // Đánh giá VÒNG KÍN: mỗi bộ tham số ứng viên điều hành lại cả thư viện kịch bản trên hạt giống huấn luyện.
  const TRAIN=[1,2,3,4,5,6];
  // Đánh giá song song theo hạt giống (4 tiến trình con) — kết quả y hệt chạy tuần tự (mô phỏng tất định theo hạt giống).
  const os=require('node:os'),{execFileSync}=require('node:child_process'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'e2cal-'));
  const groups=[[1,5],[2,6],[3],[4]];
  const evaluator=p=>{const pf=path.join(tmp,'p.json');fs.writeFileSync(pf,JSON.stringify(p));
   const cmd=groups.map((g,i)=>`"${process.execPath}" "${__filename}" --eval "${pf}" ${g.join(',')} > "${path.join(tmp,'r'+i+'.json')}" &`).join(' ')+' wait';
   execFileSync('/bin/sh',['-c',cmd],{stdio:'inherit'});
   return aggregate(groups.flatMap((g,i)=>JSON.parse(fs.readFileSync(path.join(tmp,'r'+i+'.json'),'utf8'))));};
  const train=runLibrary(L.DEFAULT_PARAMS,TRAIN).flatMap(x=>x.result.obs);
  const cal=L.calibrate(L.DEFAULT_PARAMS,train,{mode:'sim',evaluator,stamp:'v1',missTolerance:0.01});
  const holdout=runLibrary(cal.params,[101,102,103,104,105,106,107,108,109,110]),failures=holdout.filter(x=>x.fail.length),hm=aggregate(holdout);
  const P={...cal.params,record:{...cal.record,origin:'calibrated_simulation',scenarios:SCENARIOS.map(s=>s.name),trainSeeds:[1,2,3,4,5,6],holdoutSeeds:[101,102,103,104,105,106,107,108,109,110],holdoutMetrics:hm,holdoutFailures:failures.map(x=>x.scenario+'#'+x.seed+': '+x.fail.join('; '))}};
  const js='/* SINH TỰ ĐỘNG bởi node tools/automation/engine2_sim.js --calibrate — KHÔNG SỬA TAY.\n * Tham số «hiệu chuẩn mô phỏng»: điểm xuất phát cho quán thật; cấp 6 tự kiểm / chỉnh (±5%/7 ngày) / quay lui khi có số liệu thật.\n * Bản đã phát hành bất biến: hiệu chuẩn lại sau deploy = unit_engine2_params_v2.js. */\n(function(root){\'use strict\';const P='+JSON.stringify(P,null,1)+';\nif(typeof module===\'object\'&&module.exports)module.exports=P;root.UnitEngine2Params=P;\n})(typeof window!==\'undefined\'?window:globalThis);\n';
  fs.writeFileSync(path.join(__dirname,'../../unit_engine2_params_v1.js'),js);
  console.log(cal.promoted?'Đã hiệu chuẩn: '+cal.record.changes.map(c=>c.param+' '+c.from+'→'+(Math.round(c.to*1000)/1000)).join(', '):'Giữ tiên nghiệm: '+cal.reason);
  console.log('Trước: bỏ sót '+(cal.record.metricsBefore.missRate*100).toFixed(1)+'% · báo sai '+(cal.record.metricsBefore.falseAlarmRate*100).toFixed(1)+'% · phủ 90% '+(cal.record.metricsBefore.coverage90*100).toFixed(1)+'%');
  console.log('Sau:   bỏ sót '+(cal.record.metricsAfter.missRate*100).toFixed(1)+'% · báo sai '+(cal.record.metricsAfter.falseAlarmRate*100).toFixed(1)+'% · phủ 90% '+(cal.record.metricsAfter.coverage90*100).toFixed(1)+'%');
  console.log('Nghiệm thu trên hạt giống chưa dùng: '+(holdout.length-failures.length)+'/'+holdout.length+' đạt · bỏ sót '+(hm.missRate*100).toFixed(1)+'% · báo sai '+(hm.falseAlarmRate*100).toFixed(1)+'%'+(failures.length?'\n  '+P.record.holdoutFailures.join('\n  '):''));
  process.exit(0);
 }else{
  let params=L.DEFAULT_PARAMS;try{params=L.withDefaults(require('../../unit_engine2_params_v1.js'));}catch(e){}
  const res=runLibrary(params,[101]);for(const r of res)console.log((r.fail.length?'✗ ':'✓ ')+r.scenario.padEnd(24)+' '+r.note+(r.fail.length?' — '+r.fail.join('; '):'')+'  [báo '+r.metrics.flags+', sai '+r.metrics.falseAlarm+', sót '+r.metrics.missed+'/'+r.metrics.trueAbnormal+']');
  process.exit(res.some(r=>r.fail.length)?1:0);
 }
}
module.exports={SCENARIOS,ITEMS,simulate,judge,runLibrary,aggregate,rng};
