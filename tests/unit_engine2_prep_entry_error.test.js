'use strict';
// [05/11 — CHẶN NHẬP SAI, chính sách prep_review_v2] Vụ trà ô long: mẻ dùng 5 túi, hộp mới 25 → còn 20 nhưng Vỹ nhập «còn 2»
// (sổ ghi mất 18, quy cho Vỹ); hôm sau A «cân trước khi lấy NL» đếm 20 → khoản dư +18. Quán KHÔNG mất hàng:
//   • khoản dư ở «cân trước» quy cho NGƯỜI GHI LẦN TRƯỚC (Vỹ), không phải A (người phát hiện); mức entry_error_found,
//     không theo dõi dồn; chạy thật thì đánh dấu dòng của lần ghi trước «đã xác minh nhập sai»;
//   • dòng đã đánh dấu nhập sai → chỉ còn phần lệch thật; hết lệch = entry_error (gỡ theo dõi dồn, đóng thông báo lệch lớn);
//   • dòng đã duyệt chỉ xét lại khi Engine 2 có hồ sơ; một lần nâng chính sách cho hồ sơ cũ (mốc models/prep_policy);
//   • kiểm toán độc lập (unit_engine2_audit_v1) tính lại cùng quy tắc — 0 vi phạm.
const assert=require('node:assert'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const E=require('../unit_engine2_v1');
const AUD=require('../unit_engine2_audit_v1');
const {create}=require('../unit_engine2_store_v4');
const {makeFake}=require('./lib/fakefb');
const ROOT=E.rootPath('gg01'),T='stock_transactions_gieogieo/';
const NOW=Date.parse('2026-11-05T05:00:00.000Z');
const VY={employeeId:'vy',employeeName:'Vỹ',role:'người cân chốt và giải trình',status:'assigned'};
// Ngày 1 — Vỹ chốt mẻ B1: sổ 25 → nhập còn 2 (giảm 23, định mức 5), chọn «lệch tồn từ mốc trước».
const vyRows=(extra={})=>({
 prep_variance_B1_tra:{itemId:'tra',type:'ADJUSTMENT',qty:-18,observedDecrease:23,expectedQty:5,varianceKind:'prior_variance',prepReconVariance:true,
  needsReview:true,referenceId:'B1',businessDate:'2026-11-04',createdAt:'2026-11-04T09:00:00.000Z',responsibility:VY,staff:'Vỹ',staffEmployeeId:'vy',...extra},
 prep_after_B1_tra:{itemId:'tra',type:'CONSUMPTION',qty:-5,expectedQty:5,uncertainVariance:18,varianceKind:'prior_variance',prepRecon:true,
  needsReview:false,referenceId:'B1',businessDate:'2026-11-04',createdAt:'2026-11-04T09:00:00.000Z',responsibility:VY,staff:'Vỹ',staffEmployeeId:'vy',...extra}});
const CP={stage:'after',batchId:'B1',at:'2026-11-04T09:00:00.000Z',employeeId:'vy',employeeName:'Vỹ'};
// Ngày 2 — A «cân trước khi lấy NL» mẻ B2: sổ 2, đếm 20 (+18). v1 = dòng POS cũ (quy cho A); v2 = POS pos_prep.v2 (quy cho Vỹ).
const preV1={prep_pre_B2_c1:{itemId:'tra',type:'ADJUSTMENT',qty:18,bookBefore:2,weighedBefore:20,prepReconStage:'before',containerId:'c1',containerCode:'YW1',
 responsibleEmployeeId:'a',responsibleEmployeeName:'A',responsibilityRole:'người chốt cân và giải trình chênh lệch',resolutionStatus:'assigned',
 staff:'A',staffEmployeeId:'a',fromCheckpoint:CP,needsReview:true,referenceId:'B2',businessDate:'2026-11-05',createdAt:'2026-11-05T02:00:00.000Z'}};
const preV2={prep_pre_B2_c1:{...preV1.prep_pre_B2_c1,responsibleEmployeeId:'vy',responsibleEmployeeName:'Vỹ',
 responsibilityRole:'người ghi lần trước — sổ ghi thấp hơn thực tế (nhập sai)',varianceKind:'book_understated',previousRecord:CP,
 responsibility:{employeeId:'vy',employeeName:'Vỹ',role:'người ghi lần trước — sổ ghi thấp hơn thực tế (nhập sai)',status:'assigned',
  classification:'book_understated',discoveredById:'a',discoveredByName:'A'},discoveredById:'a',discoveredByName:'A',entryErrorAlertId:'prep_entry_error_B2_tra'}};

function fixture(rows,cfg={},seedMore={}){
 const seed={[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-11-04',settingsRevision:1,...cfg},
  'inventory_items_gieogieo/tra':{name:'Trà ô long',unit:'cái'},'prep_batches_gieogieo/B1':{prepName:'Trà ô long'},'prep_batches_gieogieo/B2':{prepName:'Trà ô long'},...seedMore};
 for(const [k,v] of Object.entries(rows))seed[T+k]=v;
 const fake=makeFake({fs:seed}),ctx={console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../unit_engine.v22.js'),'utf8'),ctx);
 const UE=ctx.UnitEngine;UE.init({fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,now:()=>NOW,storeId:'gg01',app:'quanly'});
 let t=NOW;const s=create({storeId:'gg01',fstore:fake.fstore,now:()=>t,inventory:UE});
 return {...fake,UE,s,tick:ms=>{t+=ms;}};
}
const alerts=f=>Object.entries(f.FS).filter(([k])=>k.startsWith('alerts_gieogieo/')).map(([k,v])=>({id:k.split('/')[1],...v}));
const kase=(f,id)=>f.FS[ROOT+'/prep_reviews/'+E.key(id)];
const track=(f,emp,dir)=>f.FS[ROOT+'/prep_track/'+E.key(emp,'tra',dir)];
const audit=async f=>{const rep=await AUD.run({storeId:'gg01',from:'2026-11-04',to:'2026-11-05',fstore:f.fstore});
 assert.equal(rep.issues.filter(i=>/^PREP_/.test(i.code)).length,0,AUD.summary(rep));};

(async()=>{
 // 1. Chuỗi đầy đủ với dòng POS v1 (A bị quy): Engine 2 sửa lại — quy Vỹ, đánh dấu nhập sai, gỡ theo dõi / thông báo cũ.
 {const f=fixture({...vyRows(),...preV1});
  const d1=await f.s.prepReview('prep_variance_B1_tra');
  assert.equal(d1.band,'very_large','ngày 1: Vỹ ghi mất 18/5 → lệch rất lớn');assert.equal(d1.responsible.employeeId,'vy');
  assert.equal(track(f,'vy','over').entries.length,1,'đang theo dõi dồn Vỹ');
  const big=alerts(f).find(a=>a.type==='prep_variance_large');assert(big&&big.status==='new','thông báo lệch lớn ngày 1');

  const d2=await f.s.prepReview('prep_pre_B2_c1');
  assert.equal(d2.band,'entry_error_found');assert.equal(d2.policy,'prep_review_v2');
  assert.equal(d2.responsible.employeeId,'vy','khoản dư quy cho NGƯỜI GHI LẦN TRƯỚC (Vỹ), không phải A');
  assert.equal(d2.responsible.discoveredById,'a','A chỉ là người phát hiện');
  assert.equal(track(f,'a','under'),undefined,'không theo dõi dồn A');
  assert.equal(f.FS[T+'prep_pre_B2_c1'].needsReview,false,'tự duyệt dòng cân trước');
  assert.equal(f.FS[T+'prep_pre_B2_c1'].autoReview.responsible.employeeId,'vy');
  assert.deepEqual(d2.markedPrior,['prep_after_B1_tra','prep_variance_B1_tra'],'đánh dấu dòng của lần ghi trước');
  for(const id of ['prep_after_B1_tra','prep_variance_B1_tra']){const r=f.FS[T+id];
   assert.equal(r.entryErrorConfirmed,true);assert.equal(r.entryErrorQty,18);assert.equal(r.entryErrorFoundInBatch,'B2');assert.equal(r.entryErrorCorrectedById,'a');}
  const fe=alerts(f).find(a=>a.type==='prep_entry_error');assert(fe&&fe.fyi===true&&fe.source==='engine2','dòng POS cũ chưa có báo → Engine 2 báo để biết');
  assert.match(fe.note,/Vỹ/);

  // Trigger: dòng ngày 1 vừa được đánh dấu → xét lại (dòng đã duyệt nhưng có hồ sơ).
  const d3=await f.s.prepReview('prep_variance_B1_tra');
  assert.equal(d3.band,'entry_error','hết lệch thật → nhập sai, không tính hao hụt');assert.equal(d3.appliedResult,'policy_update');
  assert.equal(d3.responsible.employeeId,'vy','vẫn ghi tên người nhập sai');assert.equal(d3.previous.band,'very_large');
  assert.equal(track(f,'vy','over').entries.length,0,'gỡ khỏi theo dõi dồn');
  assert.equal(f.FS['alerts_gieogieo/'+big.id].status,'resolved','đóng thông báo lệch lớn cũ');
  assert.equal(f.FS['alerts_gieogieo/'+big.id].resolvedBy,'engine2_auto');
  assert.equal(await f.s.prepReview('prep_after_B1_tra'),false,'dòng đã duyệt chưa từng có hồ sơ → không xét');
  assert.equal(await f.s.prepReview('prep_variance_B1_tra'),null,'chạy lại cùng dữ liệu: không ghi lại');
  await audit(f);
  console.log('ok Dòng POS cũ: khoản dư quy người ghi trước, đánh dấu nhập sai, gỡ theo dõi + đóng báo cũ; kiểm toán sạch');}

 // 2. Dòng POS v2 (đã quy Vỹ + đã báo + đã đánh dấu): Engine 2 không báo trùng, không đánh dấu lại.
 {const f=fixture({...vyRows({entryErrorConfirmed:true,entryErrorQty:18,entryErrorFoundInBatch:'B2',entryErrorCorrectedBy:'A',entryErrorCorrectedById:'a',entryErrorAt:'2026-11-05T02:00:00.000Z'}),...preV2});
  const d=await f.s.prepReview('prep_pre_B2_c1');
  assert.equal(d.band,'entry_error_found');assert.equal(d.responsible.employeeId,'vy');assert.equal(d.fyi,false,'POS đã báo — không báo trùng');
  assert.deepEqual(d.markedPrior,[],'đã đánh dấu sẵn — không ghi lại');
  const v=await f.s.prepReview('prep_variance_B1_tra');
  assert.equal(v.band,'entry_error','dòng mới đã đánh dấu sẵn → nhập sai ngay từ đầu');assert.equal(v.fyi,false);
  assert.equal(track(f,'vy','over'),undefined,'không theo dõi dồn');assert.equal(alerts(f).length,0,'không thông báo nào');
  assert.equal(f.FS[T+'prep_variance_B1_tra'].needsReview,false,'vẫn tự duyệt');
  await audit(f);
  console.log('ok Dòng POS v2: không báo trùng, không đánh dấu lại; dòng đã đánh dấu = nhập sai');}

 // 3. Nhập sai MỘT PHẦN: lệch 18, lần sau chỉ xác minh 10 → còn 8/5 lệch thật.
 {const f=fixture(vyRows({entryErrorConfirmed:true,entryErrorQty:10}));
  const d=await f.s.prepReview('prep_variance_B1_tra');
  assert.equal(d.band,'very_large');assert.match(d.label,/Nhập sai một phần/);assert.equal(d.effectiveDeviation,8);assert.equal(d.deviation,18);
  assert.equal(track(f,'vy','over').entries.length,1,'phần lệch thật vẫn theo dõi');
  await audit(f);
  console.log('ok Nhập sai một phần: phần còn lại vẫn tính lệch');}

 // 4. Chế độ thử: chỉ ghi hồ sơ, không đánh dấu, không báo, không duyệt.
 {const f=fixture({...vyRows(),...preV1},{mode:'shadow'});
  const d=await f.s.prepReview('prep_pre_B2_c1');
  assert.equal(d.mode,'shadow');assert.equal(d.band,'entry_error_found');assert.equal(d.responsible.employeeId,'vy');
  assert.equal(f.FS[T+'prep_after_B1_tra'].entryErrorConfirmed,undefined);assert.equal(alerts(f).length,0);
  assert.equal(f.FS[T+'prep_pre_B2_c1'].needsReview,true);
  console.log('ok Chế độ thử: chỉ ghi hồ sơ');}

 // 5. Dư nhỏ trong sai số: vẫn quy người ghi trước, mức «trong sai số», không đánh dấu ai.
 {const small={prep_pre_B2_c1:{...preV1.prep_pre_B2_c1,qty:0.5,bookBefore:19.5,weighedBefore:20}};
  const f=fixture({...vyRows(),...small},{},{'inventory_items_gieogieo/tra':{name:'Trà ô long',unit:'cái'}});
  const d=await f.s.prepReview('prep_pre_B2_c1');assert.equal(d.band,'within');assert.equal(d.responsible.employeeId,'vy');
  assert.equal(f.FS[T+'prep_variance_B1_tra'].entryErrorConfirmed,undefined,'trong sai số: không kết luận nhập sai');
  await audit(f);
  console.log('ok Dư trong sai số: không kết luận nhập sai');}

 // 6. prep_surplus (engine v21, lúc hoàn thành mẻ): quy người cân mốc trước theo previousWeighers.
 {const sur={prep_surplus_B2_tra:{itemId:'tra',type:'ADJUSTMENT',qty:18,expectedQty:5,prepReconSurplus:true,varianceKind:'book_understated',needsReview:true,
   referenceId:'B2',businessDate:'2026-11-05',responsibility:{employeeId:'a',employeeName:'A',role:'người cân chốt và giải trình',status:'assigned'},staff:'A',staffEmployeeId:'a',
   previousWeighers:[{unitId:'c1',code:'YW1',qty:18,stage:'after',employeeId:'vy',employeeName:'Vỹ',batchId:'B1',at:CP.at}]}};
  const f=fixture({...vyRows(),...sur});
  const d=await f.s.prepReview('prep_surplus_B2_tra');
  assert.equal(d.band,'entry_error_found');assert.equal(d.responsible.employeeId,'vy');assert.equal(d.fyi,false,'engine v21 đã báo prep_entry_error');
  assert.deepEqual(d.markedPrior,['prep_after_B1_tra','prep_variance_B1_tra']);
  await audit(f);
  console.log('ok prep_surplus: quy người cân mốc trước');}

 // 7. Nâng chính sách MỘT lần: hồ sơ cũ v1 (pre dư quy A) + dòng đã đánh dấu nhập sai → xếp lại; lần sau không quét nữa.
 {const f=fixture({...vyRows({needsReview:false,entryErrorConfirmed:true,entryErrorQty:18}),...preV1});
  // Hồ sơ v1 có sẵn (đã tự duyệt, quy A) — dòng nguồn đã hết needsReview.
  f.FS[T+'prep_pre_B2_c1'].needsReview=false;
  f.FS[ROOT+'/prep_reviews/'+E.key('prep_pre_B2_c1')]={id:E.key('prep_pre_B2_c1'),txId:'prep_pre_B2_c1',policy:'prep_review_v1',kind:'pre',band:'very_large',direction:'under',
   itemId:'tra',responsible:{employeeId:'a',employeeName:'A'},mode:'active',applied:true,businessDate:'2026-11-05'};
  f.FS[ROOT+'/prep_reviews/'+E.key('prep_variance_B1_tra')]={id:E.key('prep_variance_B1_tra'),txId:'prep_variance_B1_tra',policy:'prep_review_v1',kind:'variance',band:'very_large',direction:'over',
   itemId:'tra',responsible:{employeeId:'vy',employeeName:'Vỹ'},mode:'active',applied:true,businessDate:'2026-11-04'};
  f.FS[ROOT+'/prep_track/'+E.key('a','tra','under')]={entries:[{k:'x',at:new Date(NOW).toISOString(),txId:'prep_pre_B2_c1',band:'very_large'}]};
  const n=await f.s.sweepPrepReview();assert.equal(n,3,'2 hồ sơ cũ + dòng nhập sai chưa có hồ sơ (store tự bỏ qua lúc chạy)');
  const ids=['prep_pre_B2_c1','prep_variance_B1_tra','prep_after_B1_tra'];
  const req=Object.keys(f.FS).filter(k=>k.startsWith(ROOT+'/requests/')).sort();
  assert.deepEqual(req,ids.map(id=>ROOT+'/requests/'+E.key('prep_review',id)).sort());
  assert.equal(f.FS[ROOT+'/models/prep_policy'].version,'prep_review_v2');
  for(const id of ids)assert.equal(await f.s.drain(E.key('prep_review',id)),true);
  assert.equal(kase(f,'prep_after_B1_tra'),undefined,'dòng đã duyệt chưa có hồ sơ: không tạo hồ sơ mới');
  assert.equal(kase(f,'prep_pre_B2_c1').responsible.employeeId,'vy','hồ sơ cũ: đổi sang người ghi trước');assert.equal(kase(f,'prep_pre_B2_c1').previous.responsible.employeeId,'a');
  assert.equal(track(f,'a','under').entries.length,0,'gỡ A khỏi theo dõi dồn');
  assert.equal(kase(f,'prep_variance_B1_tra').band,'entry_error');
  assert.equal(await f.s.sweepPrepReview(),0,'đã nâng — không quét lại');
  console.log('ok Nâng chính sách một lần: hồ sơ cũ được xét lại, A được gỡ');}

 // 8. Quyết định tay của quản lý không bị đè.
 {const f=fixture({...vyRows(),prep_pre_B2_c1:{...preV1.prep_pre_B2_c1,responsibility:{employeeId:'a',employeeName:'A',status:'assigned_by_manager'}}});
  assert.equal(await f.s.prepReview('prep_pre_B2_c1'),false);
  console.log('ok Quản lý đã quyết: không đè');}

 // Worker: xếp việc khi dòng vừa được đánh dấu nhập sai.
 {const src=fs.readFileSync(path.join(__dirname,'../functions/automation/engine2.js'),'utf8');
  assert.match(src,/E\.PREP_ROW\.test\(id\)&&after&&after\.entryErrorConfirmed===true&&before\?\.entryErrorConfirmed!==true/);
  console.log('ok Worker: xếp việc khi dòng vừa được đánh dấu nhập sai');}
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
