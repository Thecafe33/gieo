'use strict';
// Lệch NL khi nấu mẻ BTP («Chờ quản lý duyệt») — chủ quán 23/10: không giữ việc nào cho quản lý.
//   ≤ max(15 g/ml, 5%) → tự duyệt · 5–25% → tự duyệt + theo dõi dồn (lặp lại cùng người/NL/chiều → thông báo để biết)
//   25–50% «lệch lớn», > 50% «lệch rất lớn» → VẪN tự duyệt, ghi người chịu trách nhiệm + mốc thời gian, thông báo để biết.
// Chỉ từ ngày áp dụng (cfg.fromDate); chế độ thử chỉ ghi hồ sơ; dòng có quyết định tay / đã duyệt không bị đè.
const assert=require('node:assert'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const E=require('../unit_engine2_v1');
const Q=require('../gieo_automation.v3');
const AUD=require('../unit_engine2_audit_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const ROOT=E.rootPath('gg01'),T='stock_transactions_gieogieo/';
const NOW=Date.parse('2026-10-24T05:00:00.000Z');
const resp={employeeId:'a',employeeName:'A',role:'người cân chốt và giải trình',batchOperatorId:'a',batchOperatorName:'A',status:'assigned'};
const after=(b,i,expected,qty,uv,extra={})=>({['prep_after_'+b+'_'+i]:{itemId:i,type:'CONSUMPTION',qty:-qty,expectedQty:expected,uncertainVariance:uv,varianceKind:'uncertain',prepRecon:true,needsReview:true,referenceId:b,businessDate:'2026-10-24',createdAt:'2026-10-24T04:00:00.000Z',responsibility:resp,...extra}});
function fixture(rows,cfg={}){
 const seed={[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-24',settingsRevision:1,...cfg},
  'inventory_items_gieogieo/milk':{name:'Sữa',unit:'ml'},'inventory_items_gieogieo/egg':{name:'Trứng',unit:'cái'},
  'prep_batches_gieogieo/B1':{prepName:'Kem trứng'},'prep_batches_gieogieo/B2':{prepName:'Kem trứng'},'prep_batches_gieogieo/B3':{prepName:'Kem trứng'}};
 for(const [k,v] of Object.entries(rows))seed[T+k]=v;
 const fake=makeFake({fs:seed}),ctx={console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../unit_engine.v21.js'),'utf8'),ctx);
 const UE=ctx.UnitEngine;UE.init({fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,now:()=>NOW,storeId:'gg01',app:'quanly'});
 let t=NOW;const s=create({storeId:'gg01',fstore:fake.fstore,now:()=>t,inventory:UE});
 return {...fake,UE,s,tick:ms=>{t+=ms;}};
}
const alerts=f=>Object.entries(f.FS).filter(([k])=>k.startsWith('alerts_gieogieo/')).map(([k,v])=>({id:k.split('/')[1],...v}));

(async()=>{
 // Lõi: cách tính % và mức.
 const cls=(row,unit)=>E.prepReviewClass(E.prepVariance(row,unit)).band;
 const r=id=>Object.entries(id).map(([k,v])=>({id:k,...v}))[0];
 assert.equal(cls(r(after('B','milk',200,210,0)),'ml'),'within','10 ml ≤ 15 ml');
 assert.equal(cls(r(after('B','milk',1000,1040,0)),'ml'),'within','4% ≤ 5%');
 assert.equal(cls(r(after('B','milk',200,240,0)),'ml'),'moderate','20%');
 assert.equal(cls(r(after('B','milk',200,160,0)),'ml'),'moderate','dùng ít 20% cũng là lệch vừa');
 assert.equal(cls(r(after('B','milk',200,280,0)),'ml'),'large','40%');
 assert.equal(cls(r(after('B','milk',200,200,120)),'ml'),'very_large','phần chênh chưa giải trình cộng vào lượng thực giảm → 60%');
 assert.equal(cls(r(after('B','egg',5,4,0)),'cái'),'moderate','đơn vị đếm không có sai số tuyệt đối 15 → 20%');
 assert.equal(cls(r(after('B','egg',5,3,0)),'cái'),'large');
 assert.equal(cls({id:'prep_variance_B_milk',needsReview:true,type:'ADJUSTMENT',qty:-30,observedDecrease:230,expectedQty:200,itemId:'milk',referenceId:'B'},'ml'),'moderate');
 assert.equal(cls({id:'prep_pre_B_c1',needsReview:true,type:'ADJUSTMENT',qty:-1,bookBefore:72,itemId:'milk',referenceId:'B',containerId:'c1'},'ml'),'within','cân trước mẻ: lệch 1 so với sổ');
 assert.equal(cls({id:'prep_pre_B_c1',needsReview:true,type:'ADJUSTMENT',qty:146,bookBefore:380,itemId:'milk',referenceId:'B',containerId:'c1'},'ml'),'large','cân trước mẻ: sổ lệch 38%');
 assert.equal(cls({id:'prep_pre_B_c1',needsReview:true,type:'ADJUSTMENT',qty:138,bookBefore:-37,itemId:'milk',referenceId:'B',containerId:'c1'},'ml'),'very_large','sổ âm → không có mốc so sánh, lệch > 15 → rất lớn');
 assert.equal(E.prepVariance({id:'finish_x_WASTE',needsReview:true},'g'),null,'không phải dòng đối chiếu mẻ');
 assert.equal(E.prepVariance({...r(after('B','milk',200,280,0)),needsReview:false},'ml'),null,'đã duyệt → không xử lý');
 const v1=E.prepVariance(r(after('B','milk',200,280,0)),'ml'),v2=E.prepVariance({id:'prep_variance_B_milk',needsReview:true,qty:-80,observedDecrease:280,expectedQty:200,itemId:'milk',referenceId:'B'},'ml');
 assert.equal(v1.key,v2.key,'dòng tiêu hao và dòng chênh của CÙNG mẻ-NL chung một khoá (không báo / đếm hai lần)');
 console.log('ok Lõi: ≤ max(15, 5%) / 5–25% / 25–50% / > 50%, cả dòng cân trước mẻ và đơn vị đếm');

 // Trong sai số → tự duyệt, không thông báo.
 {const f=fixture(after('B1','milk',200,210,0));const d=await f.s.prepReview('prep_after_B1_milk');
  const tx=f.FS[T+'prep_after_B1_milk'];
  assert.equal(d.band,'within');assert.equal(tx.needsReview,false);assert.equal(tx.reviewedBy,'engine2_auto');assert.equal(tx.autoReview.by,'engine2');
  assert.equal(tx.qty,-210,'không đổi số lượng');assert.deepEqual(tx.responsibility,resp,'không đổi trách nhiệm');
  assert.equal(alerts(f).length,0);assert.equal(f.FS[ROOT+'/prep_reviews/'+E.key('prep_after_B1_milk')].applied,true);
  assert.equal(await f.s.prepReview('prep_after_B1_milk'),false,'chạy lại: dòng đã duyệt → không làm gì');
  console.log('ok Trong sai số: tự duyệt, giữ nguyên số lượng / trách nhiệm, không thông báo, chạy lại an toàn');}

 // Lệch lớn: tự duyệt + người chịu trách nhiệm + mốc thời gian + thông báo ĐỂ BIẾT (một lần cho cả hai dòng cùng mẻ).
 {const f=fixture({...after('B1','milk',200,200,80),'prep_variance_B1_milk':{itemId:'milk',type:'ADJUSTMENT',qty:-80,observedDecrease:280,expectedQty:200,varianceKind:'uncertain',prepReconVariance:true,needsReview:true,referenceId:'B1',businessDate:'2026-10-24',responsibility:resp}});
  await f.s.prepReview('prep_after_B1_milk');await f.s.prepReview('prep_variance_B1_milk');
  const a=alerts(f);assert.equal(a.length,1,'một thông báo cho một mẻ-NL');
  assert.equal(a[0].type,'prep_variance_large');assert.equal(a[0].fyi,true);assert.equal(a[0].status,'new');assert.equal(a[0].severity,'warning');
  assert.equal(a[0].responsible.employeeId,'a');assert.match(a[0].title,/Sữa dùng nhiều hơn định lượng 40% · mẻ Kem trứng/);assert.match(a[0].note,/không cần thao tác/);
  for(const id of ['prep_after_B1_milk','prep_variance_B1_milk']){const tx=f.FS[T+id];assert.equal(tx.needsReview,false);assert.equal(tx.autoReview.band,'large');assert.equal(tx.autoReview.responsible.employeeName,'A');assert(tx.autoReview.at);}
  // Quanlygieo2: thông báo để biết KHÔNG thành việc cần làm.
  const rep=await AUD.run({storeId:'gg01',from:'2026-10-24',to:'2026-10-24',fstore:f.fstore});assert.equal(rep.violations,0,AUD.summary(rep));assert.equal(rep.issues.filter(i=>/^PREP_/.test(i.code)).length,0);
  const k=Q.task('alerts',a[0].id,a[0],{},NOW);assert.equal(k.group,'done');assert.equal(k.rule,'ENGINE2_FYI');
  console.log('ok Lệch lớn: tự duyệt, ghi người chịu trách nhiệm + mốc, 1 thông báo để biết; quanlygieo2 không coi là việc');}

 {const f=fixture(after('B1','milk',200,200,150));await f.s.prepReview('prep_after_B1_milk');
  const a=alerts(f);assert.equal(a[0].severity,'danger');assert.equal(f.FS[T+'prep_after_B1_milk'].autoReview.band,'very_large');
  a[0].status='seen';f.FS['alerts_gieogieo/'+a[0].id]=a[0];
  f.FS[T+'prep_after_B1_milk'].needsReview=true;delete f.FS[T+'prep_after_B1_milk'].autoReview;   // giả lập POS bật lại cờ
  await f.s.prepReview('prep_after_B1_milk');assert.equal(f.FS['alerts_gieogieo/'+a[0].id].status,'seen','không mở lại thông báo quản lý đã xem');
  console.log('ok Lệch rất lớn: mức danger; chạy lại không mở lại thông báo đã xem');}

 // Lệch vừa lặp lại: cùng người, cùng NL, cùng chiều ≥ 3 mẻ / 30 ngày → MỘT thông báo để biết.
 {const f=fixture({...after('B1','milk',200,240,0),...after('B2','milk',200,240,0),...after('B3','milk',200,245,0)});
  await f.s.prepReview('prep_after_B1_milk');await f.s.prepReview('prep_after_B2_milk');assert.equal(alerts(f).length,0,'2 lần chưa báo');
  await f.s.prepReview('prep_after_B3_milk');const a=alerts(f);assert.equal(a.length,1);assert.equal(a[0].type,'prep_variance_repeat');assert.equal(a[0].count,3);
  assert.equal(Q.task('alerts',a[0].id,a[0],{},NOW).rule,'ENGINE2_FYI');
  console.log('ok Lệch vừa lặp lại 3 mẻ cùng chiều → một thông báo để biết');}

 // Trước ngày áp dụng: không đụng (tồn quá khứ giữ nguyên).
 {const f=fixture(after('B1','milk',200,280,0,{businessDate:'2026-10-20'}));assert.equal(await f.s.prepReview('prep_after_B1_milk'),false);
  assert.equal(f.FS[T+'prep_after_B1_milk'].needsReview,true);assert.equal(alerts(f).length,0);
  console.log('ok Phát sinh trước ngày áp dụng: không tự xử lý');}

 // Chế độ thử: chỉ ghi hồ sơ, không đổi sổ / không thông báo.
 {const f=fixture(after('B1','milk',200,280,0),{mode:'shadow'});const d=await f.s.prepReview('prep_after_B1_milk');
  assert.equal(d.mode,'shadow');assert.equal(f.FS[T+'prep_after_B1_milk'].needsReview,true);assert.equal(alerts(f).length,0);
  assert.equal(await f.s.prepReview('prep_after_B1_milk'),null,'chạy lại cùng dữ liệu: không ghi lại');
  console.log('ok Chế độ thử: chỉ ghi hồ sơ đối chiếu');}

 // Quyết định tay / quản lý duyệt trước → không đè.
 {const f=fixture(after('B1','milk',200,280,0,{responsibility:{...resp,status:'assigned_by_manager'}}));assert.equal(await f.s.prepReview('prep_after_B1_milk'),false);assert.equal(f.FS[T+'prep_after_B1_milk'].needsReview,true);
  const g=fixture(after('B1','milk',200,280,0));
  assert.equal(await g.UE.ledger.autoReview('prep_after_B1_milk',{needsReview:false,reviewedAt:'x',reviewedBy:'engine2_auto',autoReview:{by:'engine2'}}),true);
  g.FS[T+'prep_after_B1_milk'].needsReview=false;g.FS[T+'prep_after_B1_milk'].reviewedBy='management';
  assert.equal(await g.UE.ledger.autoReview('prep_after_B1_milk',{needsReview:false,reviewedAt:'y',reviewedBy:'engine2_auto',autoReview:{by:'engine2'}}),false);
  assert.equal(g.FS[T+'prep_after_B1_milk'].reviewedBy,'management','quản lý đã duyệt → engine không ghi đè');
  await assert.rejects(g.UE.ledger.autoReview('prep_after_B1_milk',{needsReview:false,reviewedBy:'x',reviewedAt:'y',autoReview:{},qty:0}),/không được sửa/);
  console.log('ok Quyết định tay / quản lý đã duyệt: không ghi đè; autoReview chỉ nhận trường chú thích');}

 // Quét bù: chỉ dòng đối chiếu mẻ từ ngày áp dụng.
 {const f=fixture({...after('B1','milk',200,280,0),...after('B2','milk',200,280,0,{businessDate:'2026-10-01'}),'finish_u_WASTE':{needsReview:true,businessDate:'2026-10-24'}});
  assert.equal(await f.s.sweepPrepReview(),1);
  const req=Object.keys(f.FS).filter(k=>k.startsWith(ROOT+'/requests/'));assert.deepEqual(req,[ROOT+'/requests/'+E.key('prep_review','prep_after_B1_milk')]);
  assert.equal(await f.s.drain(E.key('prep_review','prep_after_B1_milk')),true);assert.equal(f.FS[T+'prep_after_B1_milk'].needsReview,false);
  console.log('ok Quét bù + hàng đợi: chỉ dòng đối chiếu mẻ từ ngày áp dụng');}

 // Worker: trigger khi POS gắn cờ.
 {const src=fs.readFileSync(path.join(__dirname,'../functions/automation/engine2.js'),'utf8');assert.match(src,/E\.PREP_ROW\.test\(id\)&&after\?\.needsReview===true&&before\?\.needsReview!==true/);assert.match(src,/sweepPrepReview\(\)/);
  console.log('ok Worker: xếp việc khi dòng mới cần duyệt + quét bù mỗi ngày');}
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
