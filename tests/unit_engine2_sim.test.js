'use strict';
// Lộ trình Engine 2 — mô phỏng có sự thật biết trước + chứng nhận cấp (tools/automation/engine2_sim.js, engine2_certify.js).
// Hạt giống 301–303 KHÔNG dùng để hiệu chuẩn (1–6), nghiệm thu (101–110) hay chứng nhận mặc định (201–203).
const assert=require('node:assert');
const L=require('../unit_engine2_learn_v1');
const S=require('../tools/automation/engine2_sim');
const {certify,report}=require('../tools/automation/engine2_certify');
const RAW=require('../unit_engine2_params_v1'),P=L.withDefaults(RAW);

(async()=>{
 // Bộ tham số sinh tự động: có bản ghi hiệu chuẩn đầy đủ, trong biên, nghiệm thu ngoài huấn luyện không trượt, kiểm toán mô hình sạch.
 const rec=RAW.record;assert(rec,'thiếu bản ghi hiệu chuẩn');assert.equal(rec.origin,'calibrated_simulation');
 assert.deepEqual(rec.holdoutFailures,[],'nghiệm thu trên hạt giống chưa dùng phải đạt hết');
 assert(rec.trainSeeds.every(s=>!rec.holdoutSeeds.includes(s)),'huấn luyện và nghiệm thu tách hạt giống');
 assert.deepEqual(rec.scenarios.slice().sort(),S.SCENARIOS.map(s=>s.name).sort(),'tham số hiệu chuẩn trên ĐÚNG thư viện kịch bản hiện hành — thêm kịch bản thì chạy lại --calibrate');
 assert.deepEqual(L.auditModels([rec],P),[]);
 for(const [k,[lo,hi]] of Object.entries(P.bounds)){const v=k.split('.').reduce((o,x)=>o[x],P);assert(v>=lo&&v<=hi,k+' ngoài biên');}
 console.log('ok Tham số «hiệu chuẩn mô phỏng»: có căn cứ, trong biên, nghiệm thu ngoài huấn luyện đạt, đúng thư viện kịch bản');

 // Mô phỏng tất định theo hạt giống; kịch bản sạch không có bất thường thật.
 const sc=S.SCENARIOS.find(s=>s.name==='yen_tinh'),a=S.simulate(sc,{seed:7,params:P}),b=S.simulate(sc,{seed:7,params:P});
 assert.equal(JSON.stringify(a.obs.map(o=>[o.id,o.loss])),JSON.stringify(b.obs.map(o=>[o.id,o.loss])));
 assert(a.obs.every(o=>o.truth.abnormalQty<P.minExcess[L.unitGroup(o.unit)]),'yên tĩnh: không có bất thường thật');
 console.log('ok Mô phỏng tất định theo hạt giống; sự thật biết trước');

 // Chứng nhận trên hạt giống chưa dùng: năng lực đủ 6 cấp, không kịch bản nào trượt; không có dữ liệu thật → không bao giờ báo đạt thật.
 const c=await certify({seeds:[301,302,303]});   // 3 hạt giống như công cụ chứng nhận — 1 hạt giống (~225 bất thường) quá ít mẫu để chấm ngưỡng bỏ sót 3%
 assert.deepEqual(c.failedScenarios,[],c.failedScenarios.join('\n'));
 assert.equal(c.simLevel,6,report(c));
 assert.equal(c.realLevel,0);for(let i=1;i<=6;i++)assert.equal(c.levels[i].real,'CHƯA ĐỦ DỮ LIỆU THẬT');
 assert(c.aggregate.missRate<=0.03&&c.aggregate.coverage90>=0.85&&c.aggregate.coverage90<=0.97,JSON.stringify(c.aggregate));
 assert.match(report(c),/Năng lực \(mô phỏng, kịch bản lường trước\): cấp 6\/6/);
 console.log('ok Chứng nhận: mô phỏng đạt cấp 6 trên hạt giống chưa dùng; thiếu dữ liệu thật → «chưa đủ dữ liệu thật», không đạt giả');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
