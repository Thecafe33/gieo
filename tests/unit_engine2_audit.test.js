'use strict';
// Lộ trình Engine 2 — B0: bộ kiểm toán độc lập + cài lỗi giả.
// Dữ liệu sạch được dựng bằng chính luồng runtime (báo hết + hai lượt cân qua kho v21 thật),
// rồi mỗi lỗi được cài vào một bản sao. Cửa: sạch → 0 vi phạm, 0 cảnh báo; mọi lỗi cài bị phát hiện.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const A=require('../unit_engine2_audit_v1');
const {makeFake}=require('./lib/fakefb');
const {cleanState,ROOT}=require('./lib/engine2_fixture');
const RANGE={storeId:'gg01',from:'2026-10-14',to:'2026-10-22'};
const clone=v=>JSON.parse(JSON.stringify(v));

async function audit(FS){return A.run({...RANGE,fstore:makeFake({fs:clone(FS)}).fstore});}
const codes=r=>[...new Set(r.issues.map(i=>i.code))].sort();
const casesOf=FS=>Object.entries(FS).filter(([p])=>p.startsWith(ROOT+'/cases/'));
const finishCase=FS=>casesOf(FS).find(([,d])=>d.originKind==='finish');
const weighCases=FS=>casesOf(FS).filter(([,d])=>d.originKind==='measurement').sort((a,b)=>a[1].interval.to.localeCompare(b[1].interval.to));

(async()=>{
 const CLEAN=(await cleanState()).FS;
 assert.equal(casesOf(CLEAN).length,3,'báo hết + hai lượt cân');
 const clean=await audit(CLEAN);
 assert.equal(clean.complete,true);assert.equal(clean.violations,0,A.summary(clean));assert.equal(clean.warnings,0,A.summary(clean));assert.equal(clean.ok,true);
 assert(clean.coverage.cases===3&&clean.coverage.checkpoints===2&&clean.coverage.sources>=3);
 // Read-only: auditor never writes.
 {const f=makeFake({fs:clone(CLEAN)});await A.run({...RANGE,fstore:f.fstore});assert.equal(f.log.filter(x=>/^fs\.(set|update|delete)/.test(x[0])).length,0);}
 // Independent: does not load the decision module.
 assert(!/require\(['"]\.\/unit_engine2_v1/.test(require('node:fs').readFileSync(require.resolve('../unit_engine2_audit_v1'),'utf8')));
 console.log('ok Dữ liệu sạch từ luồng thật: 0 vi phạm, 0 cảnh báo; chỉ đọc; không nạp lõi quyết định');

 // Each fault: [name, mutate(FS), expected code that MUST appear]
 const FAULTS=[
  ['trùng event (hai hồ sơ cho một dòng hao hụt)',FS=>{const [p,d]=finishCase(FS);FS[p+'_dup']={...clone(d),id:d.id+'_dup'};},'DUPLICATE_LOSS_CASE'],
  ['sai đơn vị mốc cân',FS=>{const [,d]=weighCases(FS)[0];const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/checkpoints/')&&FS[p].measurementId===d.originId);FS[k].unitSnapshot='kg';},'CHECKPOINT_NET_MISMATCH'],
  ['sai bì mốc cân',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/checkpoints/'));FS[k].weighings[0].tareG=90;},'CHECKPOINT_NET_MISMATCH'],
  ['bì âm',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/checkpoints/'));FS[k].weighings[0].tareG=-5;},'CHECKPOINT_BAD_TARE'],
  ['ml không tỷ trọng',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/checkpoints/'));FS[k].unitSnapshot='ml';FS[k].densitySnapshot=null;},'CHECKPOINT_NO_DENSITY'],
  ['worker lease cũ ghi đè hồ sơ bằng số cũ',FS=>{const [p,d]=finishCase(FS);FS[p]={...d,quantity:280,allocations:d.allocations.map(a=>({...a,qty:70,value:7000})),amount:28000};},'QUANTITY_SOURCE_MISMATCH'],
  ['worker lease cũ: hồ sơ khác nhật ký quyết định',FS=>{const [p,d]=finishCase(FS);FS[p]={...d,allocations:[...d.allocations].reverse().map((a,i,arr)=>({...a,employeeId:arr[(i+1)%arr.length].employeeId}))};FS[p].allocations[0].qty+=0;},'DECISION_LOG_MISMATCH'],
  ['sai cửa hàng (storeId)',FS=>{const [p]=finishCase(FS);FS[p].storeId='gg02';},'STORE_MISMATCH'],
  ['sai cửa hàng (nguồn quán khác)',FS=>{const [p]=finishCase(FS);FS[p].sourcePath='stock_transactions_gieogieo__gg02/finish_u_WASTE';},'STORE_MISMATCH'],
  ['phân bổ lệch tổng lượng',FS=>{const [p]=finishCase(FS);FS[p].allocations[0].qty+=5;},'ALLOCATION_QTY_MISMATCH'],
  ['phân bổ lệch tổng tiền',FS=>{const [p]=finishCase(FS);FS[p].allocations[1].value+=1;},'ALLOCATION_MONEY_MISMATCH'],
  ['tiền không có căn cứ giá',FS=>{const [p]=finishCase(FS);FS[p].valuation={status:'missing'};},'MONEY_WITHOUT_VALUATION'],
  ['tiền khác lịch sử giá',FS=>{FS['price_history_gieogieo/price'].price=120;},'VALUATION_SOURCE_MISMATCH'],
  ['trùng người',FS=>{const [p]=finishCase(FS);FS[p].allocations[1].employeeId=FS[p].allocations[0].employeeId;},'DUPLICATE_PERSON'],
  ['bỏ sót pha chế có ca',FS=>{const [p,d]=finishCase(FS);const keep=d.allocations.slice(0,3);keep[0]={...keep[0],qty:keep[0].qty+75,value:keep[0].value+7500};FS[p].allocations=keep;},'ELIGIBLE_MISSING'],
  ['ca không ghi chức năng (= pha chế) bị bỏ sót',FS=>{FS['employee_shifts_gieogieo/norole']={employeeId:'e',employeeName:'E',checkedInAt:'2026-10-19T02:00:00.000Z',checkedOutAt:'2026-10-19T12:00:00.000Z'};},'ELIGIBLE_MISSING'],
  ['phân bổ cho người order',FS=>{const [p]=weighCases(FS)[0];FS[p].allocations[0].employeeId='o';},'INELIGIBLE_ALLOCATED'],
  ['WASTE đúp cùng tem',FS=>{FS['stock_transactions_gieogieo/dup_u_WASTE']={itemId:'jelly',referenceId:'u',type:'WASTE',qty:-300,businessDate:'2026-10-22'};},'WASTE_EXCEEDS_UNIT'],
  ['báo hết khi tem còn mở',FS=>{FS['stock_containers_gieogieo/u'].status='open';},'FINISH_WASTE_OPEN_UNIT'],
  ['mất ACK (chưa máy POS nào xác nhận)',FS=>{delete FS[ROOT+'/devices/pos1'];},'CONTROL_NOT_ACKED'],
  ['máy POS chưa nhận thiết lập mới',FS=>{FS[ROOT].settingsRevision=4;},'DEVICE_STALE'],
  ['sự kiện đến muộn: báo hết chưa có hồ sơ',FS=>{FS['stock_transactions_gieogieo/finish_x_WASTE']={itemId:'jelly',referenceId:'x',type:'WASTE',qty:-40,businessDate:'2026-10-20'};FS['stock_containers_gieogieo/x']={itemId:'jelly',baseQty:500,status:'finished',openedAt:'2026-10-19T00:00:00Z',finishedAt:'2026-10-20T00:00:00Z'};},'CASE_NOT_CREATED'],
  ['sửa nguồn sau khi chốt: nguồn đã huỷ',FS=>{FS['stock_transactions_gieogieo/finish_u_WASTE'].voided=true;},'SOURCE_VOIDED_CASE_ACTIVE'],
  ['sửa nguồn sau khi chốt: nguồn đổi chưa tính lại',FS=>{const [,d]=finishCase(FS);FS['stock_transactions_gieogieo/finish_u_WASTE'].updatedAt=new Date(Date.parse(d.updatedAt)+60000).toISOString();},'SOURCE_CHANGED_AFTER_DECISION'],
  ['nguồn bị xoá',FS=>{delete FS['stock_transactions_gieogieo/finish_u_WASTE'];},'SOURCE_MISSING'],
  ['khoảng chồng hai hồ sơ cùng tem',FS=>{const [[,a],[p]]=weighCases(FS);FS[p].interval={...FS[p].interval,from:a.interval.from,checkpointId:null};},'INTERVAL_OVERLAP'],
  ['bỏ qua mốc cân trong khoảng',FS=>{const [,[p]]=weighCases(FS);FS[p].interval={...FS[p].interval,from:'2026-10-21T03:00:00.000Z',checkpointId:null};},'INTERVAL_IGNORED_CHECKPOINT'],
  ['mốc cân bị xoá',FS=>{const [,[,d]]=weighCases(FS);delete FS[ROOT+'/checkpoints/'+d.interval.checkpointId];},'CHECKPOINT_MISSING'],
  ['khoảng trước lúc mở tem',FS=>{const [p]=finishCase(FS);FS[p].interval={...FS[p].interval,from:'2026-10-01T00:00:00.000Z'};},'INTERVAL_INVALID'],
  ['quyết định tay bị phân bổ lại',FS=>{const [p]=finishCase(FS);FS[p].decisionMode='manual';},'MANUAL_OVERRIDDEN'],
  ['mất nhật ký quyết định',FS=>{const [,d]=finishCase(FS);delete FS[ROOT+'/decisions/'+d.decisionId];},'DECISION_LOG_MISSING'],
  ['đối chiếu thử đã bật kiểm soát',FS=>{const [p,d]=finishCase(FS);FS[p].mode='shadow';FS[ROOT+'/controls/jelly'].reasonCaseIds=[d.id];},'SHADOW_EFFECT'],
  ['lượt cân thiếu nhưng mất dòng hao hụt',FS=>{const [,d]=weighCases(FS)[0];delete FS[d.sourcePath];delete FS[d.sourcePath.replace('stock_transactions_gieogieo','x')];},'MEASUREMENT_LEDGER_MISSING'],
  ['dòng hao hụt khác chênh lệch đo',FS=>{const [,d]=weighCases(FS)[0];FS[d.sourcePath].qty=-45;},'MEASUREMENT_LEDGER_MISMATCH'],
  ['việc báo xong không có kết quả',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/tasks/')&&FS[p].status==='done');delete FS[ROOT+'/measurements/'+FS[k].resultRef.split('/').pop()];},'TASK_DONE_WITHOUT_RESULT'],
  ['việc xong vẫn còn chờ',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/tasks/')&&FS[p].status==='done');FS[k].pending=true;},'TASK_STATE_INCONSISTENT'],
  ['trạng thái việc lạ',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/tasks/'));FS[k].status='resolved';},'TASK_BAD_STATUS'],
  ['khoá cân treo',FS=>{const [,d]=weighCases(FS)[0];FS[ROOT+'/measurement_locks/j']={measurementId:d.originId};},'LOCK_STALE'],
  ['mức kiểm soát dưới sàn',FS=>{FS[ROOT+'/controls/j'].manualFloor=3;},'CONTROL_BELOW_FLOOR'],
  ['món kiểm soát không tới POS',FS=>{FS[ROOT].controlledItemIds=['j'];},'CONTROL_NOT_PUBLISHED'],
  ['ngoại lệ tính là mẫu sạch',FS=>{const k=Object.keys(FS).find(p=>p.startsWith(ROOT+'/tasks/')&&FS[p].status==='queued');FS[k].status='exception_recorded';FS[ROOT+'/controls/j'].deescalationEvidence={taskIds:[FS[k].id]};},'CLEAN_SAMPLE_INVALID']
 ];
 const missed=[];
 for(const [name,mutate,code] of FAULTS){
  const FS=clone(CLEAN);mutate(FS);const r=await audit(FS);
  if(!r.issues.some(i=>i.code===code))missed.push(name+' → cần '+code+', thấy ['+codes(r).join(',')+']');
  else if(A.CODES[code][0]==='violation')assert.equal(r.ok,false,name);
 }
 assert.deepEqual(missed,[],'Lỗi cài bị bỏ sót:\n'+missed.join('\n'));
 console.log('ok '+FAULTS.length+'/'+FAULTS.length+' lỗi cài sẵn bị phát hiện (trùng event, sai đơn vị/bì, worker cũ, sai quán, lệch tổng, WASTE đúp, mất ACK, đến muộn, sửa nguồn…)');
 // Every code in the catalogue is exercised by at least one fault (except the open-shift / unit-change notices tested below).
 const exercised=new Set(FAULTS.map(f=>f[2]));
 const notExercised=Object.keys(A.CODES).filter(c=>!exercised.has(c)&&!['OPEN_SHIFT_IN_INTERVAL','UNIT_CHANGED_SINCE','CHECKPOINT_WRONG_OBJECT','CHECKPOINT_INVALID','INTERVAL_CHECKPOINT_MISMATCH','CONTROL_BAD_LEVEL'].includes(c));
 assert.deepEqual(notExercised,[]);
 {
  const FS=clone(CLEAN);const [,[,d]]=weighCases(FS);const cp=FS[ROOT+'/checkpoints/'+d.interval.checkpointId];cp.containerId='u';cp.status='void';cp.countedAt='2026-10-22T02:59:00.000Z';
  FS['employee_shifts_gieogieo/late']={employeeId:'late',roles:['barista'],checkedInAt:'2026-10-22T04:30:00.000Z'};FS['inventory_items_gieogieo/j'].unit='kg';FS[ROOT+'/controls/j'].level=5;
  const r=await audit(FS);for(const c of ['CHECKPOINT_WRONG_OBJECT','CHECKPOINT_INVALID','INTERVAL_CHECKPOINT_MISMATCH','OPEN_SHIFT_IN_INTERVAL','UNIT_CHANGED_SINCE','CONTROL_BAD_LEVEL'])assert(codes(r).includes(c),c+' trong ['+codes(r)+']');
  console.log('ok Mốc sai đối tượng/không hợp lệ/lệch đầu khoảng, ca chưa check-out, đổi đơn vị, mức ngoài 0–3');
 }
 {
  // Truncation is never reported as pass.
  const r=await A.run({...RANGE,fstore:makeFake({fs:clone(CLEAN)}).fstore,limit:1});assert.equal(r.complete,false);assert.equal(r.ok,false);assert(r.truncated.length);
  const other=await A.run({storeId:'gg02',from:RANGE.from,to:RANGE.to,fstore:makeFake({fs:clone(CLEAN)}).fstore});assert.equal(other.coverage.cases,0);assert.equal(other.violations,0);
  assert.throws(()=>A.check({store:'xx'}),/không hợp lệ/);await assert.rejects(A.run({storeId:'gg01',from:'2026-10-22',to:'2026-10-01',fstore:makeFake().fstore}),/khoảng ngày/);
  console.log('ok Chạm giới hạn đọc → CHƯA ĐẠT (không PASS âm thầm); quán khác không lẫn dữ liệu');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
