'use strict';
// Lộ trình Engine 2 — runtime cấp 3–6: quan sát ghi cùng quyết định / mốc cân, lượt học hằng ngày (learnDay),
// việc chẩn đoán → nhãn, cân ngẫu nhiên M0, M3 người khác cân, tự hạ mức theo tiêu chí đã hiệu chuẩn, hiệu chuẩn có rào.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const L=require('../unit_engine2_learn_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const {cleanState,ROOT}=require('./lib/engine2_fixture');
const clone=v=>JSON.parse(JSON.stringify(v));

(async()=>{
 const f=await cleanState();
 const obsOf=FS=>Object.entries(FS).filter(([p])=>p.startsWith(ROOT+'/obs/')).map(([,o])=>o);
 assert.equal(obsOf(f.FS).length,3,'báo hết + hai lượt cân → ba quan sát');
 const at=Date.parse('2026-10-23T03:00:00Z'),s=create({storeId:'gg01',fstore:f.fstore,now:()=>at});
 const r1=await s.learnDay();
 assert.equal(r1.scored,3);assert(obsOf(f.FS).every(o=>o.scored));
 const fin=obsOf(f.FS).find(o=>o.sampling==='finish');assert.equal(fin.flagged,true,'báo hết còn 300 g → bất thường');assert(fin.residualQty>0);
 assert.equal(f.FS[ROOT+'/controls/jelly'].level,2,'không đẩy lên M3 vì chính sự kiện đã nâng M2 (không đếm hai lần)');
 const model=f.FS[ROOT+'/models/current'];assert.equal(model.day,'2026-10-23');assert.equal(model.obs.scored,3);assert.equal(model.obs.flagged,obsOf(f.FS).filter(o=>o.flagged).length);assert.equal(model.excluded,model.obs.flagged,'quan sát bất thường không vào dữ liệu học');assert.deepEqual(model.modelIssues,[]);assert.equal(model.autoRelease,false,'tiên nghiệm khai báo → chưa tự hạ mức');
 assert.equal((await s.learnDay()).skipped,'done_today','một lần mỗi ngày');
 console.log('ok Quan sát ghi cùng quyết định/mốc cân; học hằng ngày chấm + giả thuyết; không đếm hai lần sự kiện đã nâng mức; một lần/ngày');

 // Việc chẩn đoán → kết quả → nhãn hiệu chuẩn giả thuyết; tare checks vào bằng chứng.
 const tid=await s.createTask('tare_check','j','o1',{resolves:'tare',posterior:0.7,vesselId:'v'});assert(tid);assert.equal(await s.createTask('tare_check','j','o1',{}),false,'không đúp');
 await assert.rejects(s.submitEvidence(tid,{vesselId:'v',variantId:'a'},{id:'b'}),/Cân bì/);
 assert.equal(await s.submitEvidence(tid,{vesselId:'v',variantId:'a',measuredTareG:118},{id:'b'}),true);
 const task=f.FS[ROOT+'/tasks/'+tid];assert.equal(task.status,'done');assert.deepEqual(task.statusEvents,['CLAIM','START','VALID_RESULT']);assert.equal(task.pending,false);
 assert.equal(f.FS[ROOT+'/evidence/'+tid].result.recordedTareG,100);
 const r2=await s.learnDay({force:true});const m2=f.FS[ROOT+'/models/current'];
 assert.equal(f.FS[ROOT+'/evidence/'+tid].labeled,true);assert.equal(f.FS[ROOT+'/evidence/'+tid].label,1,'bì lệch 18 g > 2σ → giả thuyết sai bì đúng');
 assert.equal(m2.labels.tare.n,1);assert(Math.abs(m2.labels.tare.brier-0.09)<1e-9);assert.equal(m2.labels.tare.calibrated,false,'1 nhãn chưa đủ hiệu chuẩn');assert.equal(m2.tareChecks.v.length,1);
 assert.equal(r2.scored,0);
 // Nhận hàng sai dung tích (cân tem nguyên) + cân lệch hệ số (vật mẫu) → nhãn + bằng chứng cho giả thuyết.
 const sid=await s.createTask('spec_confirm','j','R1',{resolves:'spec',posterior:0.4,recordedQty:500}),rid=await s.createTask('reference_weigh','_scale','2026-10-23',{resolves:'scale',posterior:0.3});
 await assert.rejects(s.submitEvidence(sid,{},{id:'b'}),/quy cách in trên bao/);
 await s.submitEvidence(sid,{labelQty:250},{id:'b'});await s.submitEvidence(rid,{known:1000,reading:1000.3},{id:'b'});
 await s.learnDay({force:true});const m3d=f.FS[ROOT+'/models/current'];
 assert.equal(f.FS[ROOT+'/evidence/'+sid].label,1,'nhãn bao 250 ≠ phiếu nhận 500 → sai quy cách xác nhận');assert.equal(f.FS[ROOT+'/evidence/'+rid].label,0,'cân đúng trong 1%');
 assert.equal(m3d.labels.tare.n,1,'nhãn cũ giữ qua ngày');assert(Math.abs(m3d.labels.tare.brier-0.09)<1e-9,'Brier cộng dồn đúng qua nhiều lượt học (không NaN)');assert.deepEqual(m3d.labels.tare.pairs,[[0.7,1]]);assert.equal(m3d.labels.tare.calibrated,false);
 assert.equal(m3d.specChecks.j[0].label,250);assert.equal(m3d.referenceChecks.length,1);assert.equal(m3d.labels.spec.n,1);assert.equal(m3d.labels.scale.n,1);
 console.log('ok Chẩn đoán qua máy trạng thái → nhãn (Brier) cho giả thuyết; chưa đủ nhãn thì chưa in %; đối chiếu nhãn bao (không cân hàng nhập) / vật mẫu');

 // M3: người khác cân.
 const m3=await s.createTask('weigh_open_units','j','m3~x',{sampling:'m3',blind:true,excludeStaffId:'b'});
 f.FS['employee_shifts_gieogieo/b2']={employeeId:'b',employeeName:'B',checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'};
 const live=f.rtGet('active_units_gieogieo/j/n');
 const mid=await s.requestMeasurement(m3,{itemId:'j',unit:'g',businessDate:'2026-10-22',sessionId:'m3s',units:[{id:'n',code:'NEXT0001',capacity:500,baseline:200,weighed:200,countedAt:'2026-10-22T06:00:00.000Z',weighings:[{vesselId:'v',variantId:'a',tareG:100,grossG:300}],openedAt:live.openedAt}]},{id:'b',fullName:'B'});
 assert.equal(f.FS[ROOT+'/measurements/'+mid].status,'rejected');assert.match(f.FS[ROOT+'/measurements/'+mid].lastError,/người khác/);
 console.log('ok M3 cân xác nhận độc lập: cùng người cân trước bị từ chối');

 // Cân ngẫu nhiên M0 + tự hạ mức (tham số đã hiệu chuẩn) trên dữ liệu dựng thêm.
 {
  const g=makeFake({fs:clone(f.FS)});const day=(i,h=13)=>new Date(Date.parse('2026-10-10T00:00:00Z')+i*86400000+h*3600000).toISOString();
  const ob=(item,i,extra)=>({schemaVersion:1,id:item+'~'+i,storeId:'gg01',itemId:item,unit:'g',containerId:'c_'+item,at:day(i),day:day(i).slice(0,10),used:200,loss:4,book:204,measured:200,nWeigh:1,verified:true,scored:true,flagged:false,sampling:'control',ctx:{},...extra});
  for(const it of ['k','k2','k3'])for(let i=0;i<12;i++)g.FS[ROOT+'/obs/'+it+'~'+i]=ob(it,i,{sampling:it==='k2'?'control':'random_m0'});
  g.FS[ROOT+'/controls/k2']={level:2,manualFloor:0,itemId:'k2',revision:1,lastEscalationAt:day(0,1),updatedAt:day(0,1)};
  g.FS[ROOT+'/models/params']={params:{...L.DEFAULT_PARAMS,version:'sim-test',origin:'calibrated_simulation'}};
  const s2=create({storeId:'gg01',fstore:g.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')});
  const r=await s2.learnDay({force:true});
  assert.deepEqual(r.released,['k2'],'mẫu sạch đủ tiêu chí → hạ một bậc');assert.equal(g.FS[ROOT+'/controls/k2'].level,1);
  const m0=Object.values(g.FS).filter(t=>t&&t.sampling==='random_m0'&&t.kind==='weigh_open_units');assert.equal(m0.length,2,'ngân sách 2 món/ngày');assert(m0.every(t=>!['jelly','j','k2'].includes(t.itemId)),'chỉ món đang M0');
  assert.equal(g.FS[ROOT+'/models/current'].autoRelease,true);
  // Sàn quản lý chặn hạ mức.
  const h=makeFake({fs:clone(g.FS)});h.FS[ROOT+'/controls/k2']={level:2,manualFloor:2,itemId:'k2',revision:1,lastEscalationAt:day(0,1)};delete h.FS[ROOT+'/models/current'];
  const r3=await create({storeId:'gg01',fstore:h.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')}).learnDay({force:true});assert.deepEqual(r3.released,[]);
  console.log('ok Cân ngẫu nhiên M0 theo ngân sách (chỉ món M0); tự hạ mức một bậc với tham số đã hiệu chuẩn; sàn quản lý chặn');
 }
 // Hiệu chuẩn có rào: dữ liệu ít → không nhận bộ mới; có bản ghi phiên bản xấu → kiểm toán mô hình báo.
 {
  const g=makeFake({fs:clone(f.FS)});delete g.FS[ROOT+'/models/current'];
  g.FS[ROOT+'/model_versions/bad']={version:'bad',parent:'p',mode:'live',createdAt:'2026-10-01T00:00:00Z',dataHash:'h',window:{},metricsBefore:{missRate:0.1},metricsAfter:{missRate:0.3},changes:[{param:'kEscalate',from:2.5,to:3.5}],rollbackRef:'p'};
  const r=await create({storeId:'gg01',fstore:g.fstore,now:()=>Date.parse('2026-10-23T03:00:00Z')}).learnDay({force:true});
  assert.equal(r.calibration.promoted,false);assert.match(r.calibration.reason,/Chưa đủ quan sát/);
  assert(r.issues.some(i=>i.code==='MODEL_PROMOTED_WORSE_MISS')&&r.issues.some(i=>i.code==='MODEL_STEP_OUT_OF_BOUNDS'));
  console.log('ok Hiệu chuẩn live chỉ nhận khi đủ quan sát kiểm; kiểm toán mô hình bắt phiên bản tệ hơn / bước vượt biên');
 }
 // Engine 2 tắt → không học.
 {const g=makeFake({fs:clone(f.FS)});g.FS[ROOT].enabled=false;assert.equal((await create({storeId:'gg01',fstore:g.fstore,now:()=>at}).learnDay({force:true})).skipped,'disabled');}
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
