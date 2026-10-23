'use strict';
// Thông báo «Lệch đếm bán thành phẩm» / «Lệch lớn» (loại phát sinh nhiều nhất sau duyệt chi phí — gg01 ~5 / ngày).
// Chủ quán 23/10: quản lý không phải xử lý thông báo từ ngày áp dụng. Chờ vụ lệch Unit Engine chốt rồi:
//   ≤ max(15, 5%) hoặc ≤ 25% lượng dùng → hệ thống ĐÓNG thông báo kèm căn cứ; > 25% và mọi «Lệch lớn» → THÔNG BÁO ĐỂ BIẾT.
// Không đổi vụ lệch / phân bổ; chế độ thử chỉ ghi hồ sơ; trước ngày áp dụng không đụng.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const Q=require('../gieo_automation.v3');
const AUD=require('../unit_engine2_audit_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const ROOT=E.rootPath('gg01'),D='2026-10-24',NOW=Date.parse('2026-10-24T15:00:00.000Z');
const AT='2026-10-24T14:30:00.000Z',caseId=E.ueKey('prep','tc',Date.parse(AT));
const dcase=(variance,extra={})=>({[`duty_cases_gieogieo/${caseId}`]:{id:caseId,type:'prep',prepId:'tc',prepName:'Thạch Cafe',unit:'g',businessDate:D,createdAt:AT,variance,usageTotal:400,book:800,status:'auto',
 allocations:[{employeeId:'a',employeeName:'A',qty:variance}],pool:[],...extra}});
const alertDoc=(id='al1',extra={})=>({['alerts_gieogieo/'+id]:{type:'prep_count_variance',prepId:'tc',itemName:'Thạch Cafe',unit:'g',businessDate:D,createdAt:AT,status:'new',varianceQty:-30,...extra}});
function fx(rows,cfg={}){const f=makeFake({fs:{[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:D,settingsRevision:1,...cfg},...rows}});
 return {...f,s:create({storeId:'gg01',fstore:f.fstore,now:()=>NOW})};}
const A=(f,id='al1')=>f.FS['alerts_gieogieo/'+id];

(async()=>{
 assert.equal(E.countAlertClass(-10,400,800,'g').band,'within');assert.equal(E.countAlertClass(-90,400,800,'g').band,'moderate');
 assert.equal(E.countAlertClass(-150,400,800,'g').band,'large');assert.equal(E.countAlertClass(-300,400,800,'g').band,'very_large');
 assert.equal(E.countAlertClass(-20,0,100,'g').band,'moderate','chưa bán gì trong khoảng → so với sổ');
 console.log('ok Lõi: so với lượng dùng trong khoảng (như Unit Engine), cùng ngưỡng chủ quán đã chốt');

 // Lệch vừa → hệ thống đóng thông báo, ghi căn cứ (ai chịu theo vụ lệch), không đổi vụ lệch.
 {const f=fx({...dcase(-60),...alertDoc()});const r=await f.s.alertReview('al1');
  assert.equal(r.fyi,false);assert.equal(A(f).status,'resolved');assert.equal(A(f).resolvedBy,'engine2_auto');assert.match(A(f).autoReview.reason,/Unit Engine đã quy theo ca: A 60/);
  assert.equal(f.FS['duty_cases_gieogieo/'+caseId].allocations[0].qty,-60,'không đổi phân bổ');
  assert.equal(Q.task('alerts','al1',A(f),{},NOW).group,'done');
  assert.equal(await f.s.alertReview('al1'),false,'chạy lại: đã xử lý → không làm gì');
  const rep=await AUD.run({storeId:'gg01',from:D,to:D,fstore:f.fstore});assert.equal(rep.issues.filter(i=>/^ALERT_/.test(i.code)).length,0,AUD.summary(rep));
  console.log('ok Lệch ≤ 25%: hệ thống đóng thông báo kèm căn cứ, không đổi vụ lệch; kiểm toán sạch');}

 // Lệch > 25% → thông báo để biết (vẫn hiện, không phải việc).
 {const f=fx({...dcase(-150),...alertDoc()});await f.s.alertReview('al1');
  assert.equal(A(f).status,'new');assert.equal(A(f).fyi,true);assert.equal(A(f).source,'engine2');assert.match(A(f).note,/Thông báo để biết/);
  assert.equal(Q.task('alerts','al1',A(f),{},NOW).rule,'ENGINE2_FYI');
  console.log('ok Lệch > 25%: giữ làm thông báo để biết; quanlygieo2 không coi là việc');}

 // «Lệch lớn» (duty_case) → luôn để biết. Vụ lệch quản lý đã quyết tay → ghi «giữ quyết định».
 {const f=fx({...dcase(-60,{status:'manual'}),...alertDoc('d1',{type:'duty_case',caseId})});await f.s.alertReview('d1');
  assert.equal(A(f,'d1').fyi,true);assert.match(A(f,'d1').autoReview.reason,/Giữ quyết định của quản lý/);
  console.log('ok «Lệch lớn» luôn để biết; vụ lệch quyết tay → giữ quyết định');}

 // Vụ lệch còn chờ cân lại → chưa đụng; chốt xong → trigger vụ lệch xếp lại thông báo.
 {const f=fx({...dcase(-60,{status:'pending_verify'}),...alertDoc()});assert.equal(await f.s.alertReview('al1'),false);assert.equal(A(f).status,'new');assert.equal(A(f).autoReview,undefined);
  f.FS['duty_cases_gieogieo/'+caseId].status='auto';
  assert.equal(await f.s.alertsForCase({...f.FS['duty_cases_gieogieo/'+caseId],id:caseId}),1);
  await f.s.drain(E.key('alert_review','al1'));assert.equal(A(f).status,'resolved');
  console.log('ok Chờ Unit Engine chốt vụ lệch rồi mới xử lý thông báo');}

 // Mã vụ lệch khác giờ (đếm lại) → tìm theo món + ngày.
 {const f=fx({...dcase(-60),...alertDoc('al2',{createdAt:'2026-10-24T14:30:05.000Z'})});await f.s.alertReview('al2');assert.equal(A(f,'al2').status,'resolved');
  console.log('ok Không khớp mã theo giờ → tìm vụ lệch cùng món, cùng ngày');}

 // Trước ngày áp dụng / chế độ thử.
 {const f=fx({...dcase(-60),...alertDoc()},{fromDate:'2026-10-25'});assert.equal(await f.s.alertReview('al1'),false);assert.equal(A(f).status,'new');
  const g=fx({...dcase(-60),...alertDoc()},{mode:'shadow'});const r=await g.s.alertReview('al1');assert.equal(r.mode,'shadow');assert.equal(A(g).status,'new');
  assert(Object.keys(g.FS).some(k=>k.startsWith(ROOT+'/alert_reviews/')));
  console.log('ok Trước ngày áp dụng không đụng; chế độ thử chỉ ghi hồ sơ');}

 // Quét bù: chỉ loại thông báo này, từ ngày áp dụng, còn mới.
 {const f=fx({...dcase(-60),...alertDoc(),...alertDoc('old',{businessDate:'2026-10-01'}),...alertDoc('x',{type:'missing_recipe'})});assert.equal(await f.s.sweepAlerts(),1);
  console.log('ok Quét bù: đúng loại, từ ngày áp dụng');}

 // Bộ kiểm toán bắt: tự đóng thông báo lệch lớn / xử lý khi vụ lệch chưa chốt.
 {const f=fx({...dcase(-150),...alertDoc()});await f.s.alertReview('al1');const k=Object.keys(f.FS).find(x=>x.startsWith(ROOT+'/alert_reviews/'));
  f.FS[k].fyi=false;let rep=await AUD.run({storeId:'gg01',from:D,to:D,fstore:f.fstore});assert(rep.issues.some(i=>i.code==='ALERT_AUTO_CLOSED_LARGE'));
  f.FS[k].fyi=true;f.FS[k].caseStatus='pending_verify';rep=await AUD.run({storeId:'gg01',from:D,to:D,fstore:f.fstore});assert(rep.issues.some(i=>i.code==='ALERT_REVIEW_BEFORE_FINAL'));
  console.log('ok Kiểm toán độc lập: bắt tự đóng thông báo lệch lớn / xử lý khi vụ lệch chưa chốt');}

 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../functions/automation/engine2.js'),'utf8');
 assert.match(src,/kind==='alerts'[\s\S]*enqueue\('alert_review',id\)/);assert.match(src,/alertsForCase\(/);assert.match(src,/sweepAlerts\(\)/);
 console.log('ok Worker: thông báo mới / vụ lệch đổi trạng thái / quét hằng ngày');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
