'use strict';
// BTP âm — dùng loại thay thế (chủ quán 23/10): Engine 2 thay bước quản lý «Xác nhận đã bù».
//   loại thay thế thiếu cuối ngày khớp lượng cần bù ±10% (≤ 30) → ghi như _btpAmApplySubstitution (sổ BTP substitutionQty,
//   giá vốn cogsDelta), phần bù không chia hao hụt (pool substitution), đóng thông báo;
//   không khớp / nhân viên trả lời «không dùng gì» → hao hụt theo luật thường + thông báo để biết.
const assert=require('node:assert'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const E=require('../unit_engine2_v1');
const Q=require('../gieo_automation.v3');
const AUD=require('../unit_engine2_audit_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const ROOT=E.rootPath('gg01'),D='2026-10-24',NOW=Date.parse('2026-10-24T15:00:00.000Z'),RID='2026-10-24_th';
const recon=(extra={})=>({['prep_shortage_recons_gieogieo/'+RID]:{sourceKind:'prep',prepId:'th',prepName:'Thạch trà',unit:'g',businessDate:D,costPerUnit:20,remainder:300,status:'substitution_pending',
 substitutions:[{kind:'prep',id:'cafe',prepId:'cafe',prepName:'Thạch Cafe',unit:'g',ratio:1,expectedQty:300,observedShortQty:290,costPerUnit:25,coversQty:300}],...extra}});
const base=(extra={})=>({
 'prep_items_gieogieo/th':{name:'Thạch trà',unit:'g',nhomDeNham:'Topping'},'prep_items_gieogieo/cafe':{name:'Thạch Cafe',unit:'g',nhomDeNham:'Topping'},
 'prep_transactions_gieogieo/cnt_cafe':{prepId:'cafe',type:'ADJUSTMENT',fromPrepCount:true,qty:-290,businessDate:D,createdAt:D+'T14:30:00.000Z'},
 'duty_cases_gieogieo/dc_cafe':{prepId:'cafe',variance:-290,businessDate:D,status:'auto',costPerUnit:25,allocations:[{employeeId:'a',qty:-290,value:7250}],pool:[],revision:1},
 ['alerts_gieogieo/prep_shortage_'+RID]:{type:'prep_shortage_recon',status:'new',reconId:RID,businessDate:D,title:'Thạch trà: nhân viên xác nhận đã bù bằng Thạch Cafe'},
 ...recon(),...extra});
function fx(rows,cfg={}){
 const fake=makeFake({fs:{[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:D,settingsRevision:1,...cfg},...rows}}),ctx={console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../unit_engine.v21.js'),'utf8'),ctx);
 const UE=ctx.UnitEngine;UE.init({fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,now:()=>NOW,storeId:'gg01',app:'quanly'});
 return {...fake,s:create({storeId:'gg01',fstore:fake.fstore,now:()=>NOW,inventory:UE})};
}
const R=f=>f.FS['prep_shortage_recons_gieogieo/'+RID],A=f=>f.FS['alerts_gieogieo/prep_shortage_'+RID];

(async()=>{
 assert.equal(E.subCheck({remainder:300,substitutions:[{observedShortQty:290,ratio:1}]}).ok,true,'lệch 10 ≤ 30');
 assert.equal(E.subCheck({remainder:300,substitutions:[{observedShortQty:265,ratio:1}]}).ok,false,'lệch 35 > tối đa 30');
 assert.equal(E.subCheck({remainder:100,substitutions:[{observedShortQty:91,ratio:1}]}).ok,true,'±10% của 100 = 10');
 assert.equal(E.subCheck({remainder:100,substitutions:[{observedShortQty:88,ratio:1}]}).ok,false);
 assert.equal(E.subCheck({remainder:300,substitutions:[{observedShortQty:600,ratio:2}]}).ok,true,'quy đổi theo tỉ lệ');
 assert.equal(E.subCogsDelta({costPerUnit:20,remainder:300,substitutions:[{expectedQty:300,costPerUnit:25,coversQty:300}]}),1500);
 console.log('ok Lõi: ±10%, tối đa 30, quy đổi tỉ lệ; giá vốn như quanlygieo');

 // Khớp → tự xác nhận như quản lý bấm.
 {const f=fx(base());const r=await f.s.subReview(RID);assert.equal(r.ok,true);
  assert.equal(R(f).status,'substitution_confirmed');assert.equal(R(f).confirmedBy,'engine2_auto');assert.equal(R(f).cogsDelta,1500);
  assert.equal(f.FS['prep_transactions_gieogieo/cnt_cafe'].substitutionQty,290);assert.equal(f.FS['prep_transactions_gieogieo/cnt_cafe'].substitutionReconId,RID);
  const dc=f.FS['duty_cases_gieogieo/dc_cafe'];assert.equal(dc.allocations[0].qty,0,'phần bù không chia hao hụt');assert.equal(dc.pool.find(p=>p.kind==='substitution').qty,-290);
  assert.equal(A(f).status,'resolved');assert.equal(A(f).resolvedBy,'engine2_auto');assert.equal(Q.task('alerts','x',A(f),{},NOW).group,'done');
  assert.equal(await f.s.subReview(RID),false,'chạy lại không làm gì');
  const rep=await AUD.run({storeId:'gg01',from:D,to:D,fstore:f.fstore});assert.equal(rep.issues.filter(i=>/^SUB_|^MIXUP_/.test(i.code)).length,0,AUD.summary(rep));
  // Pha nhầm: phần đã xác nhận dùng thay không thành «dư / thiếu» để ghép (thạch trà dư bất kỳ không ghép với thạch cafe).
  f.FS['duty_cases_gieogieo/dc_th']={prepId:'th',variance:300,businessDate:D,status:'auto',pool:[],allocations:[]};
  for(let i=0;i<4;i++)f.FS['prep_transactions_gieogieo/s'+i]={prepId:'th',type:'CONSUMPTION',qty:-150,referenceId:'b'+i,businessDate:D,createdAt:D+'T0'+(3+i)+':00:00.000Z'};
  const m=await f.s.mixupDay(D);assert.equal(m.pairs,0,'thiếu đã giải thích bằng dùng thay → không ghép pha nhầm');
  console.log('ok Khớp: tự xác nhận (sổ BTP, giá vốn, không chia hao hụt, đóng thông báo); kiểm toán sạch; pha nhầm bỏ qua phần dùng thay');}

 // Không khớp → không xác nhận, hao hụt thường + để biết.
 {const f=fx(base(recon({substitutions:[{kind:'prep',id:'cafe',ratio:1,expectedQty:200,observedShortQty:200,costPerUnit:25}]})));await f.s.subReview(RID);
  assert.equal(R(f).status,'unexplained');assert.match(R(f).autoReview.reason,/không xác nhận bù/);assert.equal(f.FS['prep_transactions_gieogieo/cnt_cafe'].substitutionQty,undefined);
  assert.equal(f.FS['duty_cases_gieogieo/dc_cafe'].allocations[0].qty,-290,'giữ hao hụt theo luật thường');
  assert.equal(A(f).fyi,true);assert.equal(A(f).status,'new');assert.equal(Q.task('alerts','x',A(f),{},NOW).rule,'ENGINE2_FYI');
  console.log('ok Không khớp: không xác nhận, hao hụt thường, thông báo để biết');}

 // Nhân viên trả lời «không dùng gì» → để biết.
 {const f=fx(base(recon({status:'unexplained',substitutions:[]})));await f.s.subReview(RID);assert.equal(A(f).fyi,true);assert.match(R(f).autoReview.reason,/không dùng gì/);
  console.log('ok «Không dùng gì»: thông báo để biết');}

 // Quản lý đã xác nhận / trước ngày áp dụng / chế độ thử.
 {const f=fx(base(recon({status:'substitution_confirmed'})));assert.equal(await f.s.subReview(RID),false);
  const g=fx(base(),{fromDate:'2026-10-25'});assert.equal(await g.s.subReview(RID),false);assert.equal(R(g).status,'substitution_pending');
  const h=fx(base(),{mode:'shadow'});const r=await h.s.subReview(RID);assert.equal(r.mode,'shadow');assert.equal(R(h).status,'substitution_pending');assert.equal(h.FS['prep_transactions_gieogieo/cnt_cafe'].substitutionQty,undefined);
  console.log('ok Đã xác nhận tay / trước ngày áp dụng / chế độ thử: không đụng');}

 // Quét bù + worker.
 {const f=fx(base());assert.equal(await f.s.sweepSubReviews(),1);await f.s.drain(E.key('sub_review',RID));assert.equal(R(f).status,'substitution_confirmed');
  const src=fs.readFileSync(path.join(__dirname,'../functions/automation/engine2.js'),'utf8');assert.match(src,/after\?\.type==='prep_shortage_recon'[\s\S]*enqueue\('sub_review',after\.reconId\)/);assert.match(src,/sweepSubReviews\(\)/);
  console.log('ok Quét bù + hàng đợi + worker');}
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
