'use strict';
// Pha nhầm trong NHÓM DỄ NHẦM (chủ quán 23/10, docs/KE_HOACH_PHA_NHAM_NHOM.md P2–P4).
//   · chỉ ghép trong cùng nhóm (nhomDeNham); khác nhóm trùng số (cốt trà sữa thiếu – thạch cafe dư) KHÔNG ghép;
//   · dư ≈ k phần 1 ly của món dư, k ≤ số đã bán; thiếu ≈ dư; nhóm nhiều món ghép được hai cách → «mập mờ»;
//   · lệch ≈ cỡ mẻ nấu → «ghi nhầm loại mẻ»; cặp ngược chiều sau một lần «nhập nhầm ô» → sổ tự đúng lại;
//   · sự cố chất lượng, KHÔNG hao hụt: phần ghép rút khỏi phân bổ; trách nhiệm ca / nhóm, không xác định bill;
//   · cân lại lúc mở ca → nhập nhầm ô / nghi pha sai món; những ngày sau chỉ nhân viên có ca hôm đó cân nhóm lúc bàn giao.
const assert=require('node:assert'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const E=require('../unit_engine2_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const AUD=require('../unit_engine2_audit_v1');
const round2=n=>Math.round(n*100)/100;
const ROOT=E.rootPath('gg01'),D='2026-10-24',D2='2026-10-25';
const T0=Date.parse('2026-10-24T15:00:00.000Z');
const ev=(prepId,i,qty,day=D)=>['prep_transactions_gieogieo/s_'+prepId+'_'+day+'_'+i,{prepId,type:'CONSUMPTION',qty:-qty,referenceId:'bill_'+day+'_'+prepId+'_'+i,businessDate:day,createdAt:day+'T0'+(3+i%6)+':00:00.000Z'}];
const dcase=(id,prepId,variance,day=D,extra={})=>['duty_cases_gieogieo/'+id,{prepId,variance,businessDate:day,status:'auto',costPerUnit:10,interval:{from:'2026-10-'+(Number(day.slice(8))-1)+'T15:00:00.000Z',to:day+'T14:30:00.000Z'},
 allocations:variance<0?[{employeeId:'a',qty:variance,value:Math.abs(variance)*10}]:[],pool:variance>0?[{kind:'surplus',qty:variance,value:variance*10}]:[],revision:1,...extra}];
function fixture(extra={},cfg={},t=T0){
 const seed={[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:D,settingsRevision:1,...cfg},
  'prep_items_gieogieo/sg':{name:'Cốt sữa gạo',unit:'ml',nhomDeNham:'Cốt sữa',currentStock:500},
  'prep_items_gieogieo/ts':{name:'Cốt trà sữa',unit:'ml',nhomDeNham:'cốt  sữa',currentStock:400},
  'prep_items_gieogieo/tc':{name:'Thạch Cafe',unit:'g',nhomDeNham:'Topping',currentStock:300},
  'inventory_items_gieogieo/tct':{name:'Trân châu trắng',unit:'g',nhomDeNham:'Topping',currentStock:900},
  'prep_items_gieogieo/lai':{name:'Cốt trà lài',unit:'ml',nhomDeNham:'Cốt trà'},'prep_items_gieogieo/ol':{name:'Cốt trà ô long',unit:'ml',nhomDeNham:'Cốt trà'},'prep_items_gieogieo/den':{name:'Cốt trà đen',unit:'ml',nhomDeNham:'Cốt trà'},
  'employee_shifts_gieogieo/sa':{employeeId:'a',employeeName:'A',businessDate:D,checkedInAt:D+'T01:00:00.000Z',checkedOutAt:D+'T14:40:00.000Z'},
  'employee_shifts_gieogieo/sb':{employeeId:'b',employeeName:'B',businessDate:D,checkedInAt:D+'T01:00:00.000Z',checkedOutAt:D+'T14:40:00.000Z',roles:['barista']},
  'employee_shifts_gieogieo/so':{employeeId:'o',employeeName:'O',businessDate:D,checkedInAt:D+'T01:00:00.000Z',roles:['order']},
  ...Object.fromEntries([...Array(18)].map((_,i)=>ev('sg',i,i%4===0?300:150))),...Object.fromEntries([...Array(10)].map((_,i)=>ev('ts',i,150))),
  ...extra};
 const fake=makeFake({fs:seed}),ctx={console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../unit_engine.v21.js'),'utf8'),ctx);
 const UE=ctx.UnitEngine;let now=t;UE.init({fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,now:()=>now,storeId:'gg01',app:'quanly'});
 const s=create({storeId:'gg01',fstore:fake.fstore,now:()=>now,inventory:UE});
 return {...fake,UE,s,at:ms=>{now=ms;}};
}
const inc=f=>Object.entries(f.FS).filter(([k])=>k.startsWith(ROOT+'/mixups/')).map(([,v])=>v);
const alerts=f=>Object.entries(f.FS).filter(([k])=>k.startsWith('alerts_gieogieo/')).map(([,v])=>v);
const tasks=f=>Object.entries(f.FS).filter(([k])=>k.startsWith(ROOT+'/tasks/')).map(([,v])=>v);
const base=()=>Object.fromEntries([dcase('c_sg','sg',320),dcase('c_ts','ts',-310)]);

(async()=>{
 // ── Lõi ──
 const m=(id,g,v,sold,p,prod)=>({id,group:g,variance:v,sold,portion:p,production:prod||[]});
 assert.equal(E.mixMatch([m('sg','Cốt sữa',320,2700,150),m('ts','Cốt sữa',-310,1500,150)]).pairs[0].k,2);
 assert.equal(E.mixMatch([m('ts','Cốt sữa',-300,1500,150),m('tc','Topping',300,900,30)]).pairs.length,0,'khác nhóm không ghép');
 assert.equal(E.mixMatch([m('sg','Cốt sữa',320,100,150),m('ts','Cốt sữa',-310,1500,150)]).pairs.length,0,'dư nhiều hơn số đã bán → không thể là pha nhầm');
 assert.equal(E.mixMatch([m('sg','Cốt sữa',230,2700,150),m('ts','Cốt sữa',-220,1500,150)]).pairs.length,0,'dư không ≈ bội số phần 1 ly');
 assert.equal(E.mixMatch([m('sg','Cốt sữa',300,2700,150),m('ts','Cốt sữa',-120,1500,150)]).pairs.length,0,'thiếu không ≈ dư');
 assert.equal(E.mixMatch([m('a','Trà',300,3000,150),m('b','Trà',-300,1500,150),m('c','Trà',-300,1500,150)]).ambiguous.length,1,'hai cách ghép ngang nhau → mập mờ');
 assert.equal(E.mixMatch([m('sg','Cốt sữa',600,2700,150,[600]),m('ts','Cốt sữa',-600,1500,150)]).pairs[0].hypothesis,'batch_mislabel');
 assert.equal(E.mixMatch([m('ts','Cốt sữa',310,1500,150),m('sg','Cốt sữa',-310,2700,150)],{entryErrors:[{surplusId:'sg',shortageId:'ts',qty:310}]}).reversed.length,1);
 assert.equal(E.mixReweigh({qty:310},{surplusCounted:500,surplusBook:500,shortageCounted:402,shortageBook:400}).outcome,'suspected_wrong_drink');
 assert.equal(E.mixReweigh({qty:310},{surplusCounted:190,surplusBook:500,shortageCounted:710,shortageBook:400}).outcome,'entry_error');
 assert.equal(E.mixReweigh({qty:310},{surplusCounted:350,surplusBook:500,shortageCounted:400,shortageBook:400}).outcome,'inconclusive');
 assert.equal(E.mixNoise([10,-20,30,-40,50]),round2(30/0.6745));assert.equal(E.mixNoise([1,2]),0,'ít hơn 5 ngày → chưa có nhiễu');
 assert.equal(E.mixMatch([{...m('sg','Cốt sữa',150,2700,150),noise:60},m('ts','Cốt sữa',-150,1500,150)]).pairs.length,0,'lệch không bất thường so với nhiễu đếm của món → không ghép');
 assert.equal(E.mixMatch([{...m('sg','Cốt sữa',320,2700,150),noise:40},{...m('ts','Cốt sữa',-250,1500,150),noise:40}]).pairs.length,1,'nhiễu lớn → nới sai số thiếu ≈ dư');
 console.log('ok Lõi: chỉ trong nhóm, bội số phần 1 ly ≤ đã bán, mập mờ, ghi nhầm loại mẻ, sổ tự đúng lại, cân lại phân biệt nhập nhầm ô');

 // ── Phát hiện: sự cố chất lượng, không hao hụt, không chỉ bill ──
 const f=fixture(base());const r=await f.s.mixupDay(D);
 assert.equal(r.pairs,1);const [x]=inc(f);
 assert.equal(x.status,'checking');assert.equal(x.k,2);assert.equal(x.qty,310);assert.equal(x.candidateCount,18);
 assert.deepEqual(x.staff.map(s=>s.id),['a','b'],'nhóm pha chế trong ngày (ca order không tính)');
 assert.match(x.responsibility.note,/Không xác định được bill/);
 const tk=tasks(f).find(t=>t.kind==='mixup_reweigh');assert(tk&&tk.items.length===2&&tk.businessDate===D2,'việc cân lại lúc mở ca hôm sau');
 const cts=f.FS['duty_cases_gieogieo/c_ts'];assert.equal(cts.allocations[0].qty,0,'phần thiếu đã ghép không chia hao hụt cá nhân');assert.equal(cts.pool.find(p=>p.kind==='mixup').qty,-310);
 const csg=f.FS['duty_cases_gieogieo/c_sg'];assert.equal(Math.abs(csg.pool.reduce((a,p)=>a+Number(p.qty),0)-320)<0.01,true,'tổng vụ lệch không đổi');
 assert.equal(alerts(f).length,0,'chưa cân lại thì chưa báo');
 await f.s.mixupDay(D);assert.equal(f.FS['duty_cases_gieogieo/c_ts'].revision,2,'chạy lại không trừ lần hai');
 console.log('ok Phát hiện: hồ sơ «đang kiểm tra», k ly / N bill nghi, ca pha chế, phần ghép không chia hao hụt, chạy lại an toàn');

 // Cân lại lúc mở ca: sổ đúng → nghi pha sai món → báo để biết + theo dõi nhân viên có ca hôm đó.
 await f.s.submitEvidence(tk.id,{counts:{sg:500,ts:402}},{id:'b',fullName:'B'});
 const y=inc(f)[0];assert.equal(y.status,'closed');assert.equal(y.outcome,'suspected_wrong_drink');
 const a=alerts(f)[0];assert.equal(a.type,'mixup_suspected');assert.equal(a.severity,'danger');assert.equal(a.fyi,true);assert.match(a.title,/~2 ly Cốt sữa gạo có thể đã pha bằng Cốt trà sữa/);assert.match(a.note,/18 bill/);
 const w=f.FS[ROOT+'/mixup_watch/'+E.key('cốt sữa')];assert.deepEqual(w.employeeIds,['a','b']);assert.equal(w.active,true);
 console.log('ok Cân lại lúc mở ca, sổ đúng → «nghi pha sai món», thông báo để biết, theo dõi nhân viên có ca hôm đó');

 // Ngày sau: A check-in → việc cân nhóm giao đích danh A; C (không có ca hôm sự cố) → không có việc.
 f.FS['employee_shifts_gieogieo/n_a']={employeeId:'a',employeeName:'A',businessDate:D2,checkedInAt:D2+'T01:00:00.000Z'};
 f.FS['employee_shifts_gieogieo/n_c']={employeeId:'c',employeeName:'C',businessDate:D2,checkedInAt:D2+'T01:00:00.000Z'};
 f.at(Date.parse(D2+'T01:05:00.000Z'));await f.s.handover('n_a');await f.s.handover('n_c');
 const gw=tasks(f).filter(t=>t.kind==='mixup_group_weigh');assert.equal(gw.length,1);assert.deepEqual(gw[0].assigneeIds,['a']);
 await assert.rejects(f.s.submitEvidence(gw[0].id,{counts:{sg:500,ts:400}},{id:'c',fullName:'C'}),/giao cho nhân viên có ca/);
 await f.s.submitEvidence(gw[0].id,{counts:{sg:500,ts:400}},{id:'a',fullName:'A'});
 assert.equal(f.FS[ROOT+'/mixup_watch/'+E.key('cốt sữa')].clean,1);
 // Lặp lại: B cân bàn giao thấy dư / thiếu cùng lượng → báo lặp lại.
 f.FS['employee_shifts_gieogieo/n_b']={employeeId:'b',employeeName:'B',businessDate:D2,checkedInAt:D2+'T02:00:00.000Z'};
 await f.s.handover('n_b');const gb=tasks(f).find(t=>t.kind==='mixup_group_weigh'&&t.assigneeIds[0]==='b');
 await f.s.submitEvidence(gb.id,{counts:{sg:650,ts:250}},{id:'b',fullName:'B'});
 assert(alerts(f).some(x=>x.type==='mixup_repeat'&&x.severity==='danger'));assert.equal(f.FS[ROOT+'/mixup_watch/'+E.key('cốt sữa')].clean,0);
 console.log('ok Cân bàn giao chỉ giao nhân viên có ca hôm sự cố; sạch thì đếm, lặp lại thì báo');
 {const rep=await AUD.run({storeId:'gg01',from:D,to:D2,fstore:f.fstore});assert.deepEqual(rep.issues.filter(i=>/^MIXUP_/.test(i.code)),[],AUD.summary(rep));
  console.log('ok Kiểm toán độc lập: hồ sơ do runtime ghi không vi phạm luật pha nhầm');}
 // POS: form cân lại / cân bàn giao có trong module việc Engine 2, chặn người không được giao.
 {const pos=fs.readFileSync(path.join(__dirname,'../gieo_engine2_pos_v1.js'),'utf8');assert.match(pos,/mixup_reweigh:'Cân lại lúc mở ca \(trước khi bán\)'/);assert.match(pos,/e2Mx/);assert.match(pos,/t\.assigneeIds\.includes\(who\.id\)/);
  console.log('ok POS: form cân lại / cân bàn giao, chặn người không được giao');}

 // Nhập nhầm ô → báo lỗi nhập liệu, không theo dõi; hôm sau cặp ngược chiều → sổ tự đúng lại, không sự cố mới.
 {const g=fixture(base());await g.s.mixupDay(D);const t1=tasks(g).find(t=>t.kind==='mixup_reweigh');
  await g.s.submitEvidence(t1.id,{counts:{sg:190,ts:710}},{id:'a',fullName:'A'});
  assert.equal(inc(g)[0].outcome,'entry_error');assert.equal(alerts(g)[0].type,'mixup_entry_error');assert.equal(Object.keys(g.FS).some(k=>k.includes('/mixup_watch/')),false);
  Object.assign(g.FS,Object.fromEntries([dcase('c2_ts','ts',310,D2),dcase('c2_sg','sg',-310,D2),...[...Array(4)].map((_,i)=>ev('ts',i,150,D2)),...[...Array(4)].map((_,i)=>ev('sg',i,150,D2))]));
  await g.s.mixupDay(D2);const z=inc(g).find(v=>v.day===D2);assert.equal(z.outcome,'entry_error_reverse');assert.equal(z.status,'closed');
  assert.equal(tasks(g).filter(t=>t.kind==='mixup_reweigh').length,1,'không giao cân lại cho lượt tự đúng lại');
  console.log('ok Nhập nhầm ô: báo lỗi nhập liệu, không theo dõi; hôm sau sổ tự đúng lại không thành sự cố mới');}

 // Khác nhóm trùng số: cốt trà sữa thiếu 300 – thạch cafe dư 300 → không ghép.
 {const g=fixture(Object.fromEntries([dcase('k1','ts',-300),dcase('k2','tc',300),...[...Array(12)].map((_,i)=>ev('tc',i,30))]));
  assert.equal((await g.s.mixupDay(D)).pairs,0);assert.equal(inc(g).length,0);assert.equal(g.FS['duty_cases_gieogieo/k1'].allocations[0].qty,-300,'hao hụt giữ nguyên luật thường');
  console.log('ok Khác nhóm (cốt trà sữa – thạch cafe) không bao giờ ghép');}

 // Ghi nhầm loại mẻ: lệch ≈ cỡ mẻ nấu trong ngày.
 {const g=fixture({...Object.fromEntries([dcase('m1','sg',600),dcase('m2','ts',-600),...[...Array(8)].map((_,i)=>ev('sg',100+i,150))]),'prep_transactions_gieogieo/prod1':{prepId:'sg',type:'PRODUCTION',qty:600,businessDate:D,createdAt:D+'T02:00:00.000Z'}});
  await g.s.mixupDay(D);const z=inc(g)[0];assert.equal(z.outcome,'batch_mislabel');assert.equal(tasks(g).length,0);assert.equal(alerts(g)[0].type,'mixup_batch_mislabel');
  console.log('ok Lệch ≈ cỡ mẻ → «ghi nhầm loại mẻ», không giao cân lại');}

 // Nhóm nhiều món mập mờ → ghi «mập mờ», không giao việc, không rút hao hụt.
 {const g=fixture(Object.fromEntries([dcase('t1','lai',300),dcase('t2','ol',-300),dcase('t3','den',-300),...[...Array(6)].map((_,i)=>ev('lai',i,150)),...[...Array(3)].map((_,i)=>ev('ol',i,150)),...[...Array(3)].map((_,i)=>ev('den',i,150))]));
  await g.s.mixupDay(D);assert.equal(inc(g)[0].outcome,'ambiguous');assert.equal(tasks(g).length,0);assert.equal(g.FS['duty_cases_gieogieo/t2'].allocations[0].qty,-300);
  console.log('ok Nhóm nhiều món ghép được hai cách → «mập mờ», giữ luật thường');}

 // Chế độ thử: chỉ hồ sơ. Trước ngày áp dụng: không xét.
 {const g=fixture(base(),{mode:'shadow'});await g.s.mixupDay(D);assert.equal(inc(g)[0].mode,'shadow');assert.equal(tasks(g).length,0);assert.equal(g.FS['duty_cases_gieogieo/c_ts'].revision,1);
  const h=fixture(base(),{fromDate:D2});assert.equal(await h.s.mixupDay(D),null);
  console.log('ok Chế độ thử chỉ ghi hồ sơ; trước ngày áp dụng không xét');}

 // Quá 36 giờ chưa cân lại → «nghi» (không loại được nhập nhầm ô), báo để biết, theo dõi.
 {const g=fixture(base());await g.s.mixupDay(D);g.at(T0+40*3600000);assert.equal(await g.s.mixupSweep(),1);
  assert.equal(inc(g)[0].outcome,'reweigh_missed');assert.equal(alerts(g)[0].severity,'warning');assert.equal(tasks(g).find(t=>t.kind==='mixup_reweigh').status,'cancelled');
  assert(Object.keys(g.FS).some(k=>k.includes('/mixup_watch/')));
  console.log('ok Quá hạn cân lại → mức «nghi», thông báo để biết, vẫn theo dõi');}

 // Worker: vụ lệch mới tạo → xét pha nhầm cho ngày đó; lượt ngày quét quá hạn.
 const src=fs.readFileSync(path.join(__dirname,'../functions/automation/engine2.js'),'utf8');
 assert.match(src,/kind==='duty_cases'[\s\S]*enqueue\('mixup_day',after\.businessDate\)/);assert.match(src,/mixupSweep\(\)/);
 console.log('ok Worker: vụ lệch mới → xét ngày; quét hằng ngày');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
