#!/usr/bin/env node
'use strict';
// Mô phỏng có SỰ THẬT BIẾT TRƯỚC cho luật «pha nhầm trong nhóm dễ nhầm» (docs/KE_HOACH_PHA_NHAM_NHOM.md P6).
// Mỗi ngày: bán ngẫu nhiên, sai số cân / rơi vãi, hao hụt thật, và có thể một sự việc thật: pha nhầm (k ly), nhập nhầm ô khi
// đếm (hôm sau sổ tự đúng lại), ghi nhầm loại mẻ. Chấm: kết luận «nghi pha sai món» sai (không có pha nhầm thật), bỏ sót pha nhầm,
// ghép khác nhóm (phải = 0). Chỉ dùng lõi thuần (E.mixMatch / E.mixReweigh) — cùng mã runtime.
//   node tools/automation/mixup_sim.js [--days 2000] [--seed 7]
const E=require('../../unit_engine2_v1');
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const GROUPS=[
 {name:'Cốt sữa',items:[['sua_gao',150,22],['tra_sua',150,14]]},
 {name:'Cốt trà',items:[['lai',120,10],['olong',120,8],['camelia',120,6],['den',120,9]]},
 {name:'Topping',items:[['dua',40,10],['tc_trang',50,12],['tc_hk',50,8],['th_tra',40,7],['th_cafe',40,6]]},
];
function simulate({days=2000,seed=7,reweighRate=0.9,onMiss=null,noise='sales'}={}){
 const R=rng(seed),norm=()=>{let u=0,v=0;while(!u)u=R();while(!v)v=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
 const st={days:0,truth:{mixup:0,entry:0,batch:0},claims:{wrong:0,falseWrong:0},detected:0,missed:0,crossGroup:0,entryCaught:0,batchCaught:0,ambiguous:0,falseByCause:{}};
 let pendingReverse=[];const hist={};
 for(let d=0;d<days;d++){
  st.days++;
  const items=[];
  for(const g of GROUPS)for(const [id,portion,mean] of g.items){
   const cups=Math.max(0,Math.round(mean+norm()*Math.sqrt(mean)));
   const bills=[];let left=cups;while(left>0){const n=R()<0.2&&left>1?2:1;bills.push(n*portion);left-=n;}
   const sold=cups*portion;
   // Nhiễu đếm: 'sales' = 2% lượng bán (≥ 8); 'real' = như dữ liệu thật gg01 1/9–22/10 (|lệch| trung vị ~30 → σ ≈ 45).
   let v=norm()*(noise==='real'?45:Math.max(8,0.02*sold));
   if(R()<0.08)v-=30+R()*170;                                          // hao hụt thật (đổ, hỏng)
   items.push({id,group:g.name,portion,sold,events:bills,variance:v,production:[]});
  }
  const pick=g=>{const list=items.filter(x=>x.group===g.name);const i=Math.floor(R()*list.length);let j=Math.floor(R()*(list.length-1));if(j>=i)j++;return [list[i],list[j]];};
  let truth=null;const u=R();
  // Hôm trước nhập nhầm ô → hôm nay sổ tự đúng lại (cặp ngược chiều).
  for(const p of pendingReverse){const X=items.find(x=>x.id===p.x),Y=items.find(x=>x.id===p.y);X.variance+=p.q;Y.variance-=p.q;}
  const reverseNow=pendingReverse;pendingReverse=[];
  if(u<0.10){const g=GROUPS[Math.floor(R()*GROUPS.length)],[X,Y]=pick(g),k=1+Math.floor(R()*3);
   if(X.sold>=k*X.portion){X.variance+=k*X.portion;Y.variance-=k*X.portion*(0.85+R()*0.3);truth={kind:'mixup',x:X.id,y:Y.id};st.truth.mixup++;}}
  else if(u<0.15){const g=GROUPS[Math.floor(R()*GROUPS.length)],[X,Y]=pick(g),q=100+R()*300;X.variance+=q;Y.variance-=q;truth={kind:'entry',x:X.id,y:Y.id,q};st.truth.entry++;pendingReverse.push({x:Y.id,y:X.id,q});}
  else if(u<0.18){const g=GROUPS.find(x=>x.name!=='Topping'),[X,Y]=pick(g),b=600+Math.round(R()*6)*100;X.variance+=b;Y.variance-=b;X.production.push(b);truth={kind:'batch',x:X.id,y:Y.id};st.truth.batch++;}
  for(const x of items){(hist[x.id]=hist[x.id]||[]).push(x.variance);if(hist[x.id].length>E.MIXUP.noiseDays)hist[x.id].shift();}
  const members=items.map(x=>({...x,variance:Math.round(x.variance*10)/10,portion:E.mixPortion(x.events.map(q=>({qty:q}))),noise:E.mixNoise(hist[x.id].slice(0,-1))}));
  const r=E.mixMatch(members,{entryErrors:reverseNow.map(p=>({surplusId:p.y,shortageId:p.x,qty:p.q}))});
  st.ambiguous+=r.ambiguous.length;
  let hit=false;
  for(const p of [...r.pairs,...r.reversed]){
   if(E.groupKey(members.find(m=>m.id===p.surplusId).group)!==E.groupKey(members.find(m=>m.id===p.shortageId).group))st.crossGroup++;
   if(p.hypothesis==='batch_mislabel'){if(truth?.kind==='batch')st.batchCaught++;continue;}
   if(p.hypothesis==='entry_error_reverse')continue;
   // Cân lại lúc mở ca: sổ chỉ sai khi là nhập nhầm ô (thật). Không cân lại → «nghi» (vẫn tính là kết luận nghi pha sai món).
   const isEntry=truth?.kind==='entry'&&truth.x===p.surplusId&&truth.y===p.shortageId,noise=()=>norm()*6;
   const out=R()<reweighRate?E.mixReweigh(p,{surplusCounted:(isEntry?-truth.q:0)+noise(),surplusBook:0,shortageCounted:(isEntry?truth.q:0)+noise(),shortageBook:0}).outcome:'reweigh_missed';
   if(out==='entry_error'){if(isEntry)st.entryCaught++;continue;}
   st.claims.wrong++;
   const real=truth?.kind==='mixup'&&truth.x===p.surplusId&&truth.y===p.shortageId;
   if(real)hit=true;else{st.claims.falseWrong++;const c=truth?truth.kind:'none';st.falseByCause[c]=(st.falseByCause[c]||0)+1;}
  }
  if(truth?.kind==='mixup'){if(hit)st.detected++;else{st.missed++;if(onMiss)onMiss(members.find(m=>m.id===truth.x),members.find(m=>m.id===truth.y),r,members);}}
 }
 st.falseWrongPerDay=st.claims.falseWrong/st.days;
 st.detectionRate=st.truth.mixup?st.detected/st.truth.mixup:1;
 st.precision=st.claims.wrong?(st.claims.wrong-st.claims.falseWrong)/st.claims.wrong:1;
 return st;
}
module.exports={simulate,GROUPS};
if(require.main===module){
 const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?Number(process.argv[i+1]):d;};
 const st=simulate({days:arg('--days',2000),seed:arg('--seed',7),noise:process.argv.includes('--real')?'real':'sales'});
 console.log(JSON.stringify(st,null,1));
}
