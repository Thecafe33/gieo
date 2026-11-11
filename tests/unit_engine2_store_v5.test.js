'use strict';
// Store Engine 2 v5 (11/11/2026, docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md): KHÔNG đổi luật / ngưỡng / kết quả — chỉ bớt đọc, bớt vòng mạng.
//  1. 10 bộ test cũ trên v5 (công tắc việc cũ ép bật) + bộ POS v3 / v4 trên v5 → hành vi cũ giữ nguyên.
//  2. Lượt học v5 = v4 GIỐNG HỆT (hai thế giới, nhiều đêm, có nâng mức / việc mới) — A1 / A4 chỉ bớt đọc.
//  3. B1 ensureCloseTasks một transaction · B2 requestMeasurementEx · B5 withdraw · B3 e2Plan công bố + tự gỡ · G1 nextDue / onDue.
const assert=require('node:assert'),path=require('node:path'),{spawnSync}=require('node:child_process');
const E=require('../unit_engine2_v1');
const V4=require('../unit_engine2_store_v4'),V5=require('../unit_engine2_store_v5');
const {makeFake}=require('./lib/fakefb');
const {cleanState}=require('./lib/engine2_fixture');
const {createEngine}=require('../functions/automation/engine');
const run=(alias,t)=>spawnSync(process.execPath,['-r',path.join(__dirname,'lib',alias),path.join(__dirname,t+'.test.js')],{env:{...process.env,E2_STORE:'v2'},encoding:'utf8'});
for(const t of ['unit_engine2','unit_engine2_alert_review','unit_engine2_mixup','unit_engine2_prep_review','unit_engine2_queue','unit_engine2_review_fixes','unit_engine2_runtime','unit_engine2_spec','unit_engine2_sub_review','unit_engine2_staffing']){
 const r=run('alias_store_v5_legacy.js',t);assert.equal(r.status,0,t+' trên store v5 (bật lại việc cũ):\n'+(r.stdout+r.stderr).split('\n').slice(-12).join('\n'));
}
for(const t of ['engine2_pos_v3','unit_engine2_prep_entry_error']){const r=run('alias_store_v5.js',t);assert.equal(r.status,0,t+' trên store v5:\n'+(r.stdout+r.stderr).split('\n').slice(-12).join('\n'));}
console.log('ok 1. 10 bộ test cũ + bộ POS v3 + chặn nhập sai đạt trên store v5 (kịch bản POS v4 chạy lại ở engine2_pos_v5.test.js) — hành vi cũ giữ nguyên');

const ROOT=E.rootPath('gg01'),clone=v=>JSON.parse(JSON.stringify(v));
const strip=o=>JSON.parse(JSON.stringify(o,(k,v)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)?'<T>':v));
const bill=r=>r&&Array.isArray(r.docs)?Math.max(1,r.docs.length):1;
function counted(fs){const c={n:0};const wrap=o=>new Proxy(o,{get(t,k){const v=t[k];if(typeof v!=='function')return v;
 if(k==='get')return (...a)=>Promise.resolve(v.apply(t,a)).then(r=>{c.n+=bill(r);return r;});
 if(k==='runTransaction')return fn=>v.call(t,x=>fn(new Proxy(x,{get(tt,kk){const vv=tt[kk];return kk==='get'?(...a)=>Promise.resolve(vv.apply(tt,a)).then(r=>{c.n+=bill(r);return r;}):typeof vv==='function'?vv.bind(tt):vv;}})));
 return (...a)=>{const r=v.apply(t,a);return r&&typeof r==='object'&&typeof r.then!=='function'?wrap(r):r;};}});return {fs:wrap(fs),c};}
(async()=>{
 // ── 2. Lượt học: hai thế giới ───────────────────────────────────────────────────────────────────────────────
 {
  const A=await cleanState(),B=await cleanState(),start=Date.parse('2026-10-23T17:10:00Z');
  const ca=counted(A.fstore),cb=counted(B.fstore);let now=start;
  const sa=V4.create({storeId:'gg01',fstore:ca.fs,now:()=>now}),sb=V5.create({storeId:'gg01',fstore:cb.fs,now:()=>now});
  const reads=[];
  for(let night=0;night<4;night++,now+=86400000){
   // mỗi ngày thêm một quan sát lệch lớn (để có chấm điểm, nâng mức, việc mới) + một việc treo cũ
   for(const [f,s] of [[A,sa],[B,sb]]){
    const c={id:'n',itemId:'j',unit:'g',openedAt:'2026-10-21T03:00:00Z',baseQty:500},at=new Date(now-3600000).toISOString();
    const ob=s.observation(c,{at:new Date(now-9*3600000).toISOString(),measured:400,weighed:true,id:'p'+night},{kind:'weigh',at,book:300,measured:300-40*night,weighed:true},{sampling:'control',groupKey:'b',vesselIds:['v'],controlled:true,measuredBy:'b',ctx:{fifoDebt:false,densityProven:true}});
    Object.assign(ob,{createdAt:at,updatedAt:at});f.FS[ROOT+'/obs/'+ob.id]=ob;
    f.FS[ROOT+'/tasks/old~'+night]={id:'old~'+night,itemId:'j',kind:'weigh_open_units',status:'queued',pending:true,createdAt:new Date(now-5*86400000).toISOString()};
   }
   const a0=ca.c.n,b0=cb.c.n,ra=await sa.learnDay(),rb=await sb.learnDay();reads.push([cb.c.n-b0,ca.c.n-a0]);
   assert.deepEqual(strip({...rb,obsSync:null}),strip({...ra,obsSync:null}),'đêm '+night+': kết quả lượt học giống hệt');
  }
  const pick=f=>Object.fromEntries(Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/')).map(([p,d])=>[p,strip(d)]));
  const da=pick(A),db=pick(B);assert.deepEqual(Object.keys(db).sort(),Object.keys(da).sort(),'cùng tập tài liệu Engine 2');
  for(const p of Object.keys(da))assert.deepEqual(db[p],da[p],'khác nhau ở '+p);
  const ra=strip(A.FS[ROOT]),rb=strip(B.FS[ROOT]);assert(rb.e2Plan&&rb.workerStoreVersion===5,'v5 công bố danh sách việc cân cho POS');delete rb.e2Plan;delete rb.workerStoreVersion;delete ra.workerStoreVersion;
  assert.deepEqual(rb,ra,'tài liệu điều khiển giống hệt (trừ phần công bố mới)');
  assert(Object.keys(da).some(p=>/\/controls\//.test(p))&&da[ROOT+'/models/current'].obs.scored>0,'kịch bản có chấm điểm thật');
  console.log('ok 2. Lượt học v5 = v4 giống hệt sau 4 đêm (mô hình, mức kiểm soát, việc, nhãn); lượt đọc mỗi đêm [v5, v4]: '+JSON.stringify(reads));
 }

 // ── 3. Phần POS của store ──────────────────────────────────────────────────────────────────────────────────
 const DAY='2026-10-22',NOW=Date.parse('2026-10-22T04:00:00Z');
 function world(extra={}){
  const item=id=>({id,name:id,unit:'g',trackingMode:'unit',stockManaged:true,currentStock:400,costPerUnit:100,packagingUnits:[]});
  const f=makeFake({rt:{active_units_gieogieo:{j:{n:{code:'NEXT0001',unitBase:400,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}}}},fs:{
   [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j','k','z'],settingsRevision:3,revision:1},
   [ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch'},[ROOT+'/controls/k']:{level:2,itemId:'k',itemName:'Cà phê'},[ROOT+'/controls/z']:{level:0,itemId:'z'},
   'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:400,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
   'inventory_items_gieogieo/j':item('j'),'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
   'employee_shifts_gieogieo/b':{employeeId:'b',employeeName:'b',roles:['barista'],checkedInAt:DAY+'T02:00:00.000Z',checkedOutAt:DAY+'T13:00:00.000Z'},...extra}});
  const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>NOW,items:[item('j')]});
  return {f,inv,s:V5.create({storeId:'gg01',fstore:f.fstore,now:()=>NOW,inventory:inv})};
 }
 const line=(f,inv,session='s1')=>{const live=f.rtGet('active_units_gieogieo/j/n');return {itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:DAY,sessionId:session,
  units:[{id:'n',code:'NEXT0001',capacity:500,state:'confirmed',openedAt:live.openedAt,baseline:400,weighed:380,baselineSig:inv.shift.absSig(live),countedAt:new Date(NOW-60000).toISOString(),seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:100,grossG:480}]}]};};
 {
  // B1
  const {f,s}=world();let tx=0;const rt=f.fstore.runTransaction;f.fstore.runTransaction=fn=>{tx++;return rt.call(f.fstore,fn);};
  const have=await s.ensureCloseTasks(DAY,'c',['j','k','z']);
  assert.deepEqual(have.sort(),['j','k'],'trả các món đã có việc; món mức 0 không tạo việc (như v4)');assert.equal(tx,1,'một transaction cho mọi món');
  assert(f.FS[ROOT+'/tasks/'+E.key('day_close',DAY,'j','c')]&&!f.FS[ROOT+'/tasks/'+E.key('day_close',DAY,'z','c')]);
  const again=await s.ensureCloseTasks(DAY,'c',['j','k']);assert.deepEqual(again.sort(),['j','k']);assert.equal(Object.keys(f.FS).filter(p=>p.startsWith(ROOT+'/tasks/')).length,2,'gọi lại không tạo đúp');
  f.FS[ROOT].mode='shadow';assert.deepEqual(await s.ensureCloseTasks(DAY,'d',['j']),[],'chưa chạy tự động → không tạo');
 }
 {
  // B2 + giao thức cũ vẫn chạy
  const {f,inv,s}=world();await s.ensureCloseTasks(DAY,'c',['j']);const task=E.key('day_close',DAY,'j','c');
  const r=await s.requestMeasurementEx(task,line(f,inv),{id:'b',fullName:'B'});
  assert.equal(r.status,'queued');assert(/^e2sw_/.test(r.operationId));assert.equal(f.FS[ROOT+'/operations/'+r.operationId].measurementId,r.id);
  const job=f.FS[ROOT+'/requests/'+E.key('measurement',r.id)];assert(job.dirty&&job.revision===1&&job.kind==='measurement'&&job.sourceId===r.id,'xếp hàng ngay trong transaction, đúng một lần');
  const r2=await s.requestMeasurementEx(task,line(f,inv),{id:'b',fullName:'B'});assert.equal(r2.id,r.id);assert(r2.existed,'gọi lại cùng phiên: trả lượt đã có');
  assert.equal(await s.requestMeasurement(task,line(f,inv),{id:'b',fullName:'B'}),r.id,'requestMeasurement (giao thức cũ) vẫn trả mã lượt');
  // người không có ca → vẫn bị chặn như v4; M3 cùng người cân trước → rejected kèm lý do
  await assert.rejects(()=>s.requestMeasurementEx(task,line(f,inv,'s9'),{id:'ghost',fullName:'?'}),/Chưa xác thực được ca/);
  f.FS[ROOT+'/tasks/m3~x']={id:'m3~x',itemId:'j',kind:'weigh_open_units',sampling:'m3',blind:true,excludeStaffId:'b',status:'queued',pending:true};
  f.FS[ROOT+'/measurement_locks/j']&&delete f.FS[ROOT+'/measurement_locks/j'];
  const rj=await s.requestMeasurementEx('m3~x',line(f,inv,'s3'),{id:'b',fullName:'B'});assert.equal(rj.status,'rejected');assert(/người khác/.test(rj.lastError));
 }
 {
  // B5 withdraw
  const {f,inv,s}=world({[ROOT+'/tasks/m0~j']:{id:'m0~j',itemId:'j',kind:'weigh_open_units',sampling:'random_m0',status:'queued',pending:true,createdAt:DAY+'T01:00:00.000Z'}});
  f.FS[ROOT].e2Plan={m0:{j:'m0~j'},m3:{}};
  const r=await s.requestMeasurementEx('m0~j',line(f,inv),{id:'b',fullName:'B'});
  assert.equal(await s.withdraw(r.id,{id:'b',fullName:'B'},'quá thời gian chờ'),true);
  assert.equal(f.FS[ROOT+'/measurements/'+r.id].status,'rejected');assert(!f.FS[ROOT+'/measurement_locks/j']);
  const t=f.FS[ROOT+'/tasks/m0~j'];assert.equal(t.status,'cancelled');assert.equal(t.pending,false);assert.equal(t.posFallback.code,'request_failed');
  assert.deepEqual(f.FS[ROOT].e2Plan.m0,{},'việc đã đóng được gỡ khỏi danh sách công bố');assert.equal(Object.values(f.FS[ROOT].e2Daily)[0].fbTotal,1);
  assert.equal(await s.withdraw(r.id,{id:'b'}),false,'rút lần hai: không làm gì');
  await s.drain(E.key('measurement',r.id));assert.equal(f.rtGet('active_units_gieogieo/j/n').unitBase,400,'worker không áp kho cho lượt đã rút');
  // kho đã áp (worker / POS giữ mã lượt) → không rút
  const w2=world();await w2.s.ensureCloseTasks(DAY,'c',['j']);const q=await w2.s.requestMeasurementEx(E.key('day_close',DAY,'j','c'),line(w2.f,w2.inv),{id:'b',fullName:'B'});
  await w2.s.drain(E.key('measurement',q.id));assert.equal(w2.f.FS[ROOT+'/measurements/'+q.id].status,'done');assert.equal(await w2.s.withdraw(q.id,{id:'b'}),false,'lượt đã xong: không rút');
 }
 {
  // B3 e2Plan: công bố + tự gỡ khi việc xong / POS tự ghi
  const mk=(id,itemId,sampling,createdAt,extra={})=>({[ROOT+'/tasks/'+id]:{id,itemId,kind:'weigh_open_units',sampling,status:'queued',pending:true,createdAt,...extra}});
  const {f,inv,s}=world({...mk('m0~old','j','random_m0','2026-10-20T01:00:00.000Z'),...mk('m0~new','j','random_m0','2026-10-22T01:00:00.000Z'),...mk('rs~k','k','resync','2026-10-22T01:00:00.000Z'),
   ...mk('m3~q','q','m3','2026-10-22T01:00:00.000Z',{excludeStaffId:'a',blind:true}),...mk('done~x','x','random_m0','2026-10-22T01:00:00.000Z',{pending:false,status:'done'}),
   [ROOT+'/tasks/diag']:{id:'diag',itemId:'j',kind:'tare_check',status:'queued',pending:true,createdAt:'2026-10-22T02:00:00.000Z'}});
  const plan=await s.publishPlan();
  assert.deepEqual(plan.m0,{j:'m0~new',k:'rs~k'},'mỗi món một việc, việc mới nhất trước; việc đã xong / việc chẩn đoán không vào');assert.deepEqual(plan.m3,{q:{taskId:'m3~q',excludeStaffId:'a'}});
  assert.deepEqual(f.FS[ROOT].e2Plan.m0,plan.m0);assert.equal(f.FS[ROOT].workerStoreVersion,5);
  await s.posFallback('rs~k',{id:'b',fullName:'B'},'manual_entry','');assert.deepEqual(f.FS[ROOT].e2Plan.m0,{j:'m0~new'},'POS tự ghi → việc gỡ khỏi danh sách');
  const r=await s.requestMeasurementEx('m0~new',line(f,inv),{id:'b',fullName:'B'});await inv.shift.applyLine({...line(f,inv),engine2Owner:true,engine2OpId:r.operationId,_devAck:true},DAY,{id:'b',fullName:'B'},r.operationId);
  await s.drain(E.key('measurement',r.id));assert.equal(f.FS[ROOT+'/measurements/'+r.id].status,'done');
  assert.deepEqual(f.FS[ROOT].e2Plan.m0,{},'lượt cân xong → việc của nó và việc cũ cùng món bị phủ đều gỡ khỏi danh sách');assert.equal(f.FS[ROOT+'/tasks/m0~old'].status,'superseded');
  assert.deepEqual(f.FS[ROOT].e2Plan.m3,{q:{taskId:'m3~q',excludeStaffId:'a'}},'việc món khác giữ nguyên');
 }
 {
  // G1 nextDue / onDue
  let poked=0;const {f}=world();const s=V5.create({storeId:'gg01',fstore:f.fstore,now:()=>NOW,onDue:async()=>{poked++;}});
  assert.equal(await s.nextDue(),0,'hàng trống → 0');
  f.FS['stock_transactions_gieogieo/finish_x_WASTE']={itemId:'j',type:'WASTE',qty:-5,businessDate:DAY};
  f.FS[ROOT+'/requests/'+E.key('finish','finish_x_WASTE')]={kind:'finish',sourceId:'finish_x_WASTE',storeId:'gg01',dirty:true,revision:1,nextTryAt:NOW-1,leaseUntil:0};
  await assert.rejects(()=>s.drain(E.key('finish','finish_x_WASTE')));assert.equal(poked,1,'việc lỗi được hẹn thử lại → báo nhịp đồng hồ');
  assert.equal(await s.nextDue(),NOW+60000,'giờ hẹn sớm nhất = lần thử lại kế tiếp (1 phút, giãn dần như v4)');
 }
 console.log('ok 3. B1 một transaction · B2 xin lượt + xếp hàng + kết quả một lần · B5 rút lượt nhận muộn · B3 danh sách việc cân công bố + tự gỡ · G1 báo việc hẹn');
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e.stack||e.message);process.exit(1);});
