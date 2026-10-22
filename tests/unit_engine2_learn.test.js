'use strict';
// Lộ trình Engine 2 — cấp 3–6: module học & tự hiệu chuẩn (unit_engine2_learn_v1.js). Mỗi luật nguyên tắc có một kiểm riêng.
const assert=require('node:assert');
const L=require('../unit_engine2_learn_v1');
const P=L.DEFAULT_PARAMS;
let n=0;const day=i=>new Date(Date.parse('2026-03-01T00:00:00Z')+i*86400000).toISOString();
const ob=(item,unit,i,used,loss,extra={})=>({id:item+'_'+(n++),itemId:item,unit,at:day(i),day:day(i).slice(0,10),used,loss,measured:100,nWeigh:1,vesselIds:['v_'+item],groupKey:'a+b',sampling:'random_m0',verified:true,ctx:{},...extra});
// Ba món g «sạch» ~2% để có nhóm; món thứ tư để thử.
function cleanSet(days=30,extraItem){const o=[];for(let i=0;i<days;i++){for(const [it,r] of [['a',0.02],['b',0.018],['c',0.022]])o.push(ob(it,'g',i,200,200*r+((i*7+it.charCodeAt(0))%5-2)));if(extraItem)o.push(ob(extraItem,'g',i,200,200*0.02+((i*3)%5-2)));}return o;}

// ---- Cấp 3: baseline ----
{
 const base=L.baseline(cleanSet(30,'d'));const d=base.items.d;
 assert.equal(d.state,'trusted');assert(Math.abs(d.estimate-0.02)<0.006,'ước lượng gần 2%: '+d.estimate);assert(d.low<0.02&&d.high>0.02);
 const spill=cleanSet(30,'d');spill.push(ob('d','g',15,200,600));assert(Math.abs(L.baseline(spill).items.d.estimate-d.estimate)<0.003,'một lần đổ lớn không kéo lệch (ước lượng bền)');
 const few=[...cleanSet(10),ob('e','g',3,200,4)];const e=L.baseline(few).items.e;assert.equal(e.state,'cold_start');assert(Math.abs(e.estimate-L.baseline(few).groups.g.mu0)<1e-12,'ít mẫu → co về nhóm');
 const tiny=[...cleanSet(30)];for(let i=0;i<30;i++)tiny.push(ob('t','g',i,5,0.1));assert.notEqual(L.baseline(tiny).items.t.state,'trusted','mốc ít thông tin (lượng dùng nhỏ) không đủ tin cậy');
 const flagged=cleanSet(30,'d');for(let i=0;i<10;i++)flagged.push(ob('d','g',i,200,60,{flagged:true}));const bf=L.baseline(flagged);assert(Math.abs(bf.items.d.estimate-d.estimate)<0.003,'quan sát đã báo bất thường bị loại khỏi học');assert.equal(bf.excluded,10);
 const absorb=cleanSet(30);for(let i=0;i<30;i++)absorb.push(ob('x','g',i,200,200*0.12));const bx=L.baseline(absorb).items.x;assert.equal(bx.capped,true,'mức thường không tự vượt trần nhóm');assert(bx.estimate<0.05);
 assert(L.baseline(absorb,P,{x:0.12}).items.x.estimate>0.1,'mức đã xác minh mới được vượt trần');
 assert(L.outlierItems(L.baseline(absorb)).some(o=>o.itemId==='x'&&o.next==='recipe_portion_weigh'));
 // Phân tán quá trình tách khỏi sai số cân: khoảng bán ít không làm phình độ phân tán của món.
 const noisy=cleanSet(30);for(let i=0;i<40;i++)noisy.push(ob('y','g',i,i%2?40:400,(i%2?40:400)*0.02+(i%3-1)*3));const by=L.baseline(noisy).items.y;assert(by.processSd<0.05,'σ quá trình '+by.processSd);
 console.log('ok Cấp 3: gộp tầng, bền với mẻ lỗi, ít mẫu co về nhóm, «đủ tin cậy» cần mốc có thông tin, loại mẫu bất thường, trần nhóm chống học luôn hao hụt');
}
// ---- score / cộng dồn / «biết mình chưa biết» ----
{
 const base=L.baseline(cleanSet(30,'d'));
 assert.equal(L.score(ob('d','g',31,200,4),base).abnormal,false);
 const big=L.score(ob('d','g',31,200,60),base);assert.equal(big.abnormal,true);assert(big.excess>50);
 assert.equal(L.score(ob('d','g',31,200,14),base).abnormal,false,'dưới ngưỡng vật chất (15 g) không báo từng lần');
 let S=0,alarm=false;for(let i=0;i<8&&!alarm;i++){const r=L.accumulate(S,L.score(ob('d','g',31+i,200,13),base));S=r.S;alarm=r.alarm;}assert(alarm,'thiếu nhỏ lặp lại → cộng dồn báo (A8)');
 const fresh=L.baseline([ob('a','g',0,200,4),ob('b','g',0,200,4)]);const sU=L.score(ob('a','g',1,200,30),fresh);assert.equal(sU.unsure,true);assert.equal(sU.abnormal,false,'chưa học được sai số cân → không báo vì 30 g');
 console.log('ok Ngưỡng vật chất, cộng dồn thiếu nhỏ, chưa học sai số cân thì đòi bằng chứng mạnh hơn');
}
// ---- Cấp 4: giả thuyết kiểm được, phần dư không in % ----
{
 const base=L.baseline(cleanSet(30,'d'));
 const o=ob('d','g',31,200,29);
 const tare=L.hypotheses(o,base,{tareChecks:{v_d:[{recorded:150,measured:125},{recorded:150,measured:126}]}});
 assert.equal(tare.ranking[0].hypothesis,'tare');assert.equal(tare.ranking[0].probability,null,'chưa hiệu chuẩn → không in %');assert(tare.residual.qty<5,'phần thiếu được giải thích bởi bì');
 const syncO=ob('d','g',31,200,90,{ctx:{anomalies:1}}),sy=L.hypotheses(syncO,base,{});assert.equal(sy.ranking[0].hypothesis,'sync');assert(sy.posterior.sync>sy.posterior.physical,'Sổ lệch → đồng bộ hơn là mất hàng');assert.equal(sy.next.test,'resync_recount');
 const unr=L.hypotheses(ob('d','g',31,200,90,{ctx:{untracked:true}}),base,{});assert.equal(unr.ranking[0].hypothesis,'unrecorded');assert.equal(unr.next.test,'scan_open_units');
 const ml=[...cleanSet(30)];for(let i=0;i<30;i++)ml.push(ob('s','ml',i,100,1+(i%3-1)));const bm=L.baseline(ml);const den=L.hypotheses(ob('s','ml',31,100,40,{measured:400}),bm,{});assert.equal(den.ranking[0].hypothesis,'density');assert.equal(den.next.test,'density_proof');
 const phys=L.hypotheses(ob('d','g',31,200,90),base,{});assert(!phys.ranking.some(r=>r.hypothesis==='physical'),'thất thoát chưa khai không nằm trong bảng xác suất');assert(phys.residual.qty>50);assert.match(phys.residual.note,/không có xác suất/);
 const cal=L.hypotheses(o,base,{tareChecks:{v_d:[{recorded:150,measured:125}]},labelsCount:{tare:40},brier:{tare:0.1}});assert.equal(typeof cal.ranking[0].probability,'number','đã hiệu chuẩn đủ nhãn → in %');
 const none=L.nextMeasurement({tare:0.01,density:0,recipe:0.01,unrecorded:0,sync:0,physical:0.9,noise:0.08},{loss:50});assert.equal(none.test,null,'không chọn M2 làm phép đo chẩn đoán');
 console.log('ok Cấp 4: sai bì / đồng bộ / không khai / tỷ trọng được nhận và chọn đúng phép đo; phần dư chỉ có lượng; % chỉ khi đã hiệu chuẩn');
}
// ---- Cấp 5: tăng / hạ mức ----
{
 const base=L.baseline(cleanSet(30,'d'));
 assert.equal(L.controlAdvice({level:0},[ob('d','g',31,200,60)],base).to,2);
 assert.equal(L.controlAdvice({level:2},[ob('d','g',31,200,60)],base).to,3,'tái diễn dù M2 → M3');
 const clean=[...Array(6)].map((_,i)=>ob('d','g',31+i,200,4,{sampling:'control'}));
 assert.equal(L.controlAdvice({level:2},clean,base,{typicalUnit:500,daysSinceLastRelease:9}).action,'release');
 assert.equal(L.controlAdvice({level:2,manualFloor:2},clean,base,{typicalUnit:500,daysSinceLastRelease:9}).action,'hold','không hạ dưới sàn quản lý');
 assert.equal(L.controlAdvice({level:2},clean.map(o=>({...o,sampling:'finish'})),base,{typicalUnit:500,daysSinceLastRelease:9}).action,'hold','báo hết không là mẫu sạch');
 assert.equal(L.controlAdvice({level:2},clean,base,{typicalUnit:500,daysSinceLastRelease:3}).action,'hold','chưa đủ khoảng cách giữa hai lần hạ');
 assert.equal(L.controlAdvice({level:2},clean,base,{typicalUnit:500,daysSinceLastRelease:9,pending:1}).action,'hold','còn việc chưa đối soát');
 console.log('ok Cấp 5: tăng M2/M3, hạ từng bậc chỉ với mẫu sạch đã đo, không dưới sàn, có khoảng cách, không khi còn việc dở');
}
// ---- Cấp 4 (bổ sung): nhận hàng sai phải LẶP theo lô; xác suất in ra chỉ sau hiệu chỉnh ngoài mẫu ----
{
 const base=L.baseline(cleanSet(30,'d'));
 const o=ob('d','g',31,200,4+120,{fromOpen:true,cap:2000,measured:1700,nWeigh:1});
 const first=L.hypotheses(o,base,{}).posterior.receiving;
 const rep=L.hypotheses(o,base,{openHistory:{d:[{id:'p1',at:day(28),fromOpen:true,frac:0.06,sdFrac:0.01}]}}).posterior.receiving;
 const cleanPrev=L.hypotheses(o,base,{openHistory:{d:[{id:'p1',at:day(28),fromOpen:true,frac:0,sdFrac:0.01}]}}).posterior.receiving;
 const theft=L.hypotheses(o,base,{openHistory:{d:[{id:'p1',at:day(28),fromOpen:true,frac:0.06,sdFrac:0.01},{id:'m1',at:day(29),fromOpen:false,z:4}]}}).posterior.receiving;
 assert(rep>first*2,'tem mở liền trước cũng thiếu cùng tỷ lệ → nhận hàng sai mạnh lên ('+first+' → '+rep+')');
 assert(cleanPrev<first,'tem trước không thiếu → yếu đi');assert(theft<rep/4&&theft<first,'khoảng cân → cân cũng thiếu rõ → nguyên nhân khác (không phải dung tích)');
 assert.equal(L.hypotheses(o,base,{openHistory:{d:[{id:o.id,at:o.at,fromOpen:true,frac:0.06,sdFrac:0.01}]}}).posterior.receiving,first,'không tự lấy chính mình làm bằng chứng');
 // Hiệu chỉnh: hậu nghiệm quá tự tin (0.6–0.9 nhưng chỉ 10% đúng) → Brier ngoài mẫu sau hiệu chỉnh đạt; ít nhãn → không in %.
 const pairs=[];for(let i=0;i<80;i++)pairs.push([0.6+0.3*((i*37)%10)/10,i%10===0?1:0]);
 const c=L.fitCalibration(pairs);assert(c.brierRaw>0.3&&c.brier<0.15&&c.calibrated,JSON.stringify(c));assert.equal(c.evaluated,80-P.calibration.minFit,'mỗi nhãn chấm bằng ánh xạ học từ nhãn TRƯỚC nó');
 assert(L.applyCalibration(c,0.8)<0.3);assert.equal(L.fitCalibration(pairs.slice(0,12)).calibrated,false);
 const shown=L.hypotheses(o,base,{calibration:{receiving:c}}).ranking.find(r=>r.hypothesis==='receiving');assert.equal(shown.calibrated,true);assert(Math.abs(shown.probability-Math.round(L.applyCalibration(c,shown.rankScore)*1000)/1000)<1e-9,'in xác suất ĐÃ hiệu chỉnh');
 assert.equal(L.hypotheses(o,base,{calibration:{receiving:{...c,brier:0.3}}}).ranking.find(r=>r.hypothesis==='receiving').probability,null,'Brier ngoài mẫu chưa đạt → không in %');
 console.log('ok Cấp 4: nhận hàng sai cần lặp ở tem trước, bị loại khi khoảng cân→cân cũng thiếu; % chỉ in sau hiệu chỉnh Brier ngoài mẫu');
}
// ---- Cấp 6: hiệu chuẩn có rào, quay lui, drift, kiểm toán mô hình ----
{
 const truthObs=[];for(let i=0;i<120;i++){const theft=i%10===0?60:0;const o=ob(['a','b','c','d'][i%4],'g',Math.floor(i/4),200,4+theft+(i%5-2));o.truth={abnormalQty:theft,cause:theft?'physical':null};truthObs.push(o);}
 const m=L.evaluate(truthObs);assert(m.trueAbnormal>0&&m.missRate<=0.2,'bỏ sót '+m.missRate);assert(m.coverage90!==null);
 const small=L.calibrate(P,truthObs.slice(0,20));assert.equal(small.promoted,false);assert.match(small.reason,/Chưa đủ quan sát kiểm/);
 const live=L.calibrate(P,truthObs,{mode:'live',minValidation:20});for(const c of live.record.changes)assert(Math.abs(c.to-c.from)<=Math.abs(c.from)*P.liveStep+1e-9||c.param.startsWith('release.'),'bước live ≤ 5%');
 assert.deepEqual(L.auditModels([live.record]),[]);
 assert(live.record.dataHash&&live.record.window&&live.record.rollbackRef,'phiên bản có căn cứ + đường quay lui');
 const bad={version:'x',parent:'p',mode:'live',dataHash:'h',window:{},metricsBefore:{missRate:0.1},metricsAfter:{missRate:0.2},changes:[{param:'kEscalate',from:2.5,to:3.5}],rollbackRef:'p'};
 const codes=L.auditModels([bad]).map(i=>i.code);assert(codes.includes('MODEL_PROMOTED_WORSE_MISS')&&codes.includes('MODEL_STEP_OUT_OF_BOUNDS'));
 assert(L.auditModels([{version:'y',parent:'p',changes:[]}]).some(i=>i.code==='MODEL_NO_EVIDENCE'));
 assert.equal(L.shouldRollback({parent:'p',metricsAfter:{missRate:0.05,coverage90:0.9}},{missRate:0.2,coverage90:0.9}).rollback,true);
 assert.equal(L.shouldRollback({parent:'p',metricsAfter:{missRate:0.05,coverage90:0.9}},{missRate:0.06,coverage90:0.88}).rollback,false);
 const base=L.baseline(cleanSet(20,'d'));const dr=[];for(let i=20;i<40;i++)dr.push(ob('d','g',i,200,200*0.06));assert(L.drift(dr,base).some(x=>x.itemId==='d'),'drift được phát hiện');
 assert(L.baselineAbsorption({d:[{estimate:0.02,abnormal:0},{estimate:0.03,abnormal:1},{estimate:0.045,abnormal:1}]}).length===1);
 let called=0;const sim=L.calibrate(P,truthObs,{mode:'sim',evaluator:p=>{called++;return {...L.evaluate(truthObs,p),failures:0};}});assert(called>5,'chế độ mô phỏng đánh giá vòng kín từng ứng viên');for(const c of sim.record.changes){const b=P.bounds[c.param];assert(c.to>=b[0]&&c.to<=b[1],'trong biên');}
 console.log('ok Cấp 6: đánh giá ngoài thời gian học, live ±5%, có căn cứ/quay lui, kiểm toán mô hình bắt bản xấu, drift, chống hấp thụ, đánh giá vòng kín');
}
console.log('ALL PASS');
