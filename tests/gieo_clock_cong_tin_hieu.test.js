'use strict';
// [v5 11/11/2026] «Cổng tín hiệu» của nhịp đồng hồ (functions/automation/clock.js, docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md).
// Nhịp 15 phút chỉ là người gác: quán KHÔNG có tín hiệu thì Engine 2 / hàng đợi / worker tự động hoá không chạy dòng nào;
// có tín hiệu (việc mới, việc lỗi hẹn thử lại, tới giờ hẹn, sang ngày mới, lần trước lỗi, lưới an toàn 6 giờ) thì chạy đủ như trước.
// Kết quả nghiệp vụ phải GIỐNG HỆT cách chạy cũ (mỗi quán mỗi nhịp).
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const E=require('../unit_engine2_v1');
const {createClock,reason,SAFETY}=require('../functions/automation/clock');
const {createWorker,rootPath,configPath}=require('../functions/automation/worker');
const {createQueue}=require('../functions/automation/queue');
const {createEngine}=require('../functions/automation/engine');
const {createEngine2Worker}=require('../functions/automation/engine2');
const {world,meter,nhip,run}=require('../tools/automation/engine2_do_tai');
const STORE='gg01',ROOT=E.rootPath(STORE),DAY='2026-10-22',MIN=60000,FLEET='duty_digests_gieogieo/_fleet';
const at=hhmm=>Date.parse(DAY+'T'+hhmm+':00+07:00');
function setup(start='10:00'){
 const {f}=world(),m=meter(f);let now=at(start);const calls={engine2:0,queue:0,worker:0};
 const engines=new Map(),getEngine=s=>{if(!engines.has(s))engines.set(s,createEngine({storeId:s,fstore:m.fs,db:f.db,FieldValue:f.FieldValue}));return engines.get(s);};
 let queue,poked=0;const fleetPoke=s=>clock.fleet.poke(s).then(()=>{poked++;});
 const worker=createWorker(m.fs,{now:()=>now,getEngine,retrySourceErrors:s=>queue.retrySourceErrors(s)});queue=createQueue(m.fs,worker,{now:()=>now,onDue:fleetPoke});
 const engine2=createEngine2Worker({db:m.fs,rt:f.db,FieldValue:f.FieldValue,now:()=>now,onDue:fleetPoke});
 const spy=(o,k,name)=>{const fn=o[k].bind(o);o[k]=(...a)=>{calls[name]++;return fn(...a);};};spy(engine2,'tick','engine2');spy(queue,'retryDue','queue');spy(worker,'tickStore','worker');
 const clock=createClock({db:m.fs,stores:[STORE],engine2,queue,worker,rootPath,now:()=>now,log:()=>{}});
 return {f,m,calls,clock,engine2,queue,worker,poked:()=>poked,get now(){return now;},set now(v){now=v;},tick:async(n=1)=>{let r;for(let i=0;i<n;i++){r=await clock.run();now+=15*MIN;}return r[STORE];}};
}
const strip=o=>JSON.parse(JSON.stringify(o,(k,v)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)?'<T>':typeof v==='number'&&v>1e12?'<N>':v));
(async()=>{
 // ── 1. Không có tín hiệu → không vào quán ──────────────────────────────────────────────────────────────────
 {
  const w=setup();
  const first=await w.tick();assert(first.ran&&first.why==='first','nhịp đầu tiên sau deploy: kiểm đủ một lần');
  assert(w.f.FS[FLEET].stores[STORE].openUntil>w.now,'lần đầu sau deploy: coi quán đang mở (dấu còn sống mỗi nhịp) cho tới tín hiệu ra ca');
  await w.clock.fleet.patch(STORE,{openUntil:0});                    // quán đã đóng (tín hiệu ra ca)
  const c0={...w.calls},s=w.m.snap();
  for(let i=0;i<8;i++){const r=await w.tick();assert.equal(r.ran,false,'2 giờ không có tín hiệu: không vào quán (nhịp '+i+')');}
  assert.deepEqual(w.calls,c0,'Engine 2 / hàng đợi / worker tự động hoá KHÔNG chạy dòng nào khi không có tín hiệu');
  const d=w.m.since(s);assert.equal(d.reads,8,'8 nhịp không việc = 8 lượt đọc (mỗi nhịp một bảng tín hiệu cho cả chuỗi), đo: '+d.reads);
  assert(d.writes<=8,'quán đóng: chỉ ghi dấu còn sống 30 phút / lần (đo '+d.writes+' lần ghi / 8 nhịp)');
 }
 console.log('ok 1. Không có tín hiệu: nhịp chỉ đọc 1 bảng tín hiệu, không vào quán; trước đây mỗi nhịp ~11 đọc + 4 ghi / quán');

 // ── 2. Có tín hiệu → vào quán đúng nhịp kế tiếp ──────────────────────────────────────────────────────────────
 {
  const w=setup();await w.tick();const c0=w.calls.engine2;
  await w.clock.fleet.poke(STORE);                                   // trigger vừa xếp một việc tự động hoá
  const r=await w.tick();assert(r.ran&&r.why==='poke');assert.equal(w.calls.engine2,c0+1);assert.equal(w.calls.worker,2);
  assert.equal((await w.tick()).ran,false,'xử lý xong → lại yên');
  // việc Engine 2 lỗi → được hẹn thử lại → onDue gõ cửa → nhịp kế tiếp vào; tới giờ hẹn thì chạy lại đúng giờ (như bản trước)
  w.f.FS[ROOT+'/requests/'+E.key('finish','finish_x_WASTE')]={kind:'finish',sourceId:'finish_x_WASTE',storeId:STORE,dirty:true,revision:1,nextTryAt:w.now-1000,leaseUntil:0};
  w.f.FS['stock_transactions_gieogieo/finish_x_WASTE']={itemId:'c0',type:'WASTE',qty:-5,businessDate:DAY};   // thiếu referenceId → finish ném lỗi thử lại
  await w.engine2.drain(STORE,E.key('finish','finish_x_WASTE')).catch(()=>{});
  assert.equal(w.poked(),1,'việc lỗi được hẹn thử lại → gõ cửa nhịp đồng hồ');
  const job=()=>w.f.FS[ROOT+'/requests/'+E.key('finish','finish_x_WASTE')];assert.equal(job().attempt,1);
  const r2=await w.tick();assert(r2.ran&&r2.why==='poke');assert(r2.next>0,'ghi giờ hẹn sớm nhất của quán');
  let tries=job().attempt,seen=0;for(let i=0;i<12;i++){const r=await w.tick();if(r.ran){seen++;assert(['due','poke'].includes(r.why),'vào quán vì tới giờ hẹn: '+r.why);}}
  assert(job().attempt>tries,'việc lỗi vẫn được thử lại theo lịch giãn dần (lần thử: '+job().attempt+')');assert(seen>=1&&seen<12,'chỉ vào quán ở nhịp có việc tới hạn ('+seen+' / 12 nhịp)');
 }
 console.log('ok 2. Có tín hiệu (việc mới / việc lỗi hẹn thử lại / tới giờ hẹn) → nhịp kế tiếp vào quán; xong lại yên');

 // ── 3. Lượt học: đúng một lần / ngày, khởi động lạnh không quét lại; lỗi thì thử lại sau 1 giờ ──────────────────
 {
  const w=setup('23:20');await w.tick();                                  // nhịp đầu: học cho ngày 22
  assert.equal(w.f.FS[ROOT+'/models/current'].day,DAY);
  let ran=0;for(let i=0;i<8;i++){const r=await w.tick();if(r.ran){ran++;assert.equal(r.why,'learn','sang ngày mới → lượt học');}}
  assert.equal(ran,1,'đúng MỘT nhịp vào quán khi sang ngày (đo: '+ran+')');assert.equal(w.f.FS[ROOT+'/models/current'].day,'2026-10-23');
  assert.equal(w.f.FS[FLEET].stores[STORE].learnDay,'2026-10-23','mốc «đã học» BỀN ở bảng tín hiệu');
  const cold=await nhip({lanh:true,cong:true}),warm=await nhip({cong:true});
  assert.equal(cold.tong.reads,warm.tong.reads,'instance lạnh mỗi nhịp tốn đúng bằng instance ấm (trước: 9.011 so với 1.303 lượt đọc / ngày)');
  // engine2.learn tự nó cũng kiểm mốc bền trước khi quét (gọi thẳng, instance mới)
  const w2=setup();await w2.tick();const s=w2.m.snap();const fresh=createEngine2Worker({db:w2.m.fs,rt:w2.f.db,FieldValue:w2.f.FieldValue,now:()=>w2.now});
  const r=await fresh.learn(STORE);assert.equal(r.skipped,'done_today');assert(w2.m.since(s).reads<=2,'đã học hôm nay: 2 lượt đọc, không quét lại (đo '+w2.m.since(s).reads+')');
 }
 console.log('ok 3. Lượt học + bốn lượt quét: một lần / ngày, mốc bền — khởi động lạnh không quét lại');

 // ── 4. Phần lỗi → kiểm lại mỗi nhịp như trước; lưới an toàn 6 giờ ────────────────────────────────────────────
 {
  const w=setup();await w.tick();const real=w.queue.retryDue;let fail=true;w.queue.retryDue=async s=>{w.calls.queue++;if(fail)throw Error('thiếu chỉ mục');return 0;};
  await w.clock.fleet.poke(STORE);let r=await w.tick();assert(r.ran&&r.ok===false);
  assert.equal(w.f.FS[rootPath(STORE)].errorPart,'queue','lỗi từng phần vẫn ghi như trước');assert(w.calls.engine2>=2&&w.calls.worker>=2,'một phần lỗi không làm bỏ hai phần kia');
  r=await w.tick();assert(r.ran&&r.why==='bad','lần trước lỗi → nhịp sau kiểm lại (không ghi dấu còn sống mù)');
  fail=false;r=await w.tick();assert(r.ran&&r.ok);assert.equal((await w.tick()).ran,false);
  assert.equal(reason({checkedAt:1,ok:true,learnDay:'2026-10-22'},Date.parse('2026-10-22T03:00:00Z')),'safety');
  assert.equal(reason({checkedAt:Date.parse('2026-10-22T03:00:00Z')-SAFETY+60000,ok:true,learnDay:'2026-10-22'},Date.parse('2026-10-22T03:00:00Z')),'');
 }
 console.log('ok 4. Phần lỗi → kiểm lại mỗi nhịp tới khi sạch, lỗi một phần không bỏ phần khác; lưới an toàn 6 giờ');

 // ── 5. Dấu «còn sống»: POS / quanlygieo2 không thấy khác (Engine 2 < 45 phút, tự động hoá < 60 phút) ──────────
 {
  const w=setup('00:05');w.f.FS[ROOT].workerHeartbeatAt='2026-10-21T16:00:00.000Z';let maxOpen=0,maxAll=0,maxAuto=0;
  const shift={employeeId:'b',roles:['barista'],businessDate:DAY,checkedInAt:new Date(at('07:02')).toISOString()};
  for(let i=0;i<96;i++){
   const hm=new Date(w.now+7*3600000).toISOString().slice(11,16);
   if(hm==='07:05'){w.f.FS['employee_shifts_gieogieo/sx']=shift;assert.equal(await w.clock.shiftSignal(STORE,null,shift),'open');
    assert(w.now-Date.parse(w.f.FS[ROOT].workerHeartbeatAt)<1000,'vào ca → dấu còn sống ghi NGAY');}
   if(hm==='22:05'){const out={...shift,checkedOutAt:new Date(w.now).toISOString()};w.f.FS['employee_shifts_gieogieo/sx']=out;w.f.FS['employee_shifts_gieogieo/sb'].checkedOutAt=out.checkedOutAt;assert.equal(await w.clock.shiftSignal(STORE,shift,out),'closed');}
   const open=Number((w.f.FS[FLEET]||{stores:{}}).stores[STORE]?.openUntil)>w.now;
   if(i>0){const age=w.now-Date.parse(w.f.FS[ROOT].workerHeartbeatAt),auto=w.now-Date.parse(w.f.FS[rootPath(STORE)].heartbeatAt);maxAll=Math.max(maxAll,age);maxAuto=Math.max(maxAuto,auto);if(open)maxOpen=Math.max(maxOpen,age);}
   await w.clock.run();w.now+=15*MIN;
  }
  assert(maxOpen<=15*MIN,'quán có người trong ca: dấu Engine 2 không cũ quá 15 phút (đo '+maxOpen/MIN+')');
  assert(maxAll<=30*MIN,'quán đóng: dấu Engine 2 không cũ quá 30 phút < ngưỡng 45 của POS (đo '+maxAll/MIN+')');
  assert(maxAuto<=30*MIN,'dấu tự động hoá không cũ quá 30 phút < ngưỡng 60 của POS / quanlygieo2 (đo '+maxAuto/MIN+')');
  // một người ra ca nhưng còn người khác trong ca → quán vẫn «mở»
  const w2=setup();const a={employeeId:'a',businessDate:DAY,checkedInAt:'x'},b={employeeId:'c',businessDate:DAY,checkedInAt:'y'};
  w2.f.FS['employee_shifts_gieogieo/sb'].checkedOutAt='2026-10-22T03:00:00.000Z';w2.f.FS['employee_shifts_gieogieo/s1']=a;w2.f.FS['employee_shifts_gieogieo/s2']=b;
  await w2.clock.shiftSignal(STORE,null,a);const out={...a,checkedOutAt:'z'};w2.f.FS['employee_shifts_gieogieo/s1']=out;
  assert.equal(await w2.clock.shiftSignal(STORE,a,out),'','còn người khác trong ca → chưa đóng');assert(w2.f.FS[FLEET].stores[STORE].openUntil>w2.now);
 }
 console.log('ok 5. Dấu còn sống: mở ca ghi ngay, có ca ≤ 15 phút, đóng ≤ 30 phút (ngưỡng đọc 45 / 60 phút giữ nguyên)');

 // ── 6. Hai thế giới: chạy kiểu cũ (mỗi quán mỗi nhịp) và qua cổng tín hiệu → dữ liệu nghiệp vụ GIỐNG HỆT ─────
 {
  async function day(cong){
   const w=setup('09:00');const old=async()=>{await w.engine2.tick(STORE);await w.queue.retryDue(STORE);await w.worker.tickStore(STORE);w.now+=15*MIN;};
   const step=()=>cong?w.tick():old();
   const sig=async(kind,id,before,after)=>{await w.engine2.source(STORE,kind,id,before,after);const j=await w.queue.enqueue(STORE,kind,id,before,after);if(j.queued){if(cong)await w.clock.fleet.poke(STORE);await w.queue.drain(STORE,j.id).catch(()=>{});}
    for(let i=0;i<4&&await w.engine2.service(STORE).retryDue();i++);};
   for(let i=0;i<4;i++)await step();
   // 10:00 báo hết còn dư một mã
   const tx={itemId:'c0',referenceId:'u_c0',type:'WASTE',qty:-120,createdAt:new Date(w.now).toISOString(),businessDate:DAY,note:'Báo hết'};
   const before=JSON.parse(JSON.stringify(w.f.FS['stock_containers_gieogieo/u_c0'])),after={...before,status:'finished',finishedAt:tx.createdAt,wasteBase:120,wasteBasis:'unit_engine'};
   w.f.FS['stock_transactions_gieogieo/finish_u_c0_WASTE']=tx;w.f.FS['stock_containers_gieogieo/u_c0']=after;
   await sig('stock_transactions','finish_u_c0_WASTE',null,tx);await sig('stock_containers','u_c0',before,after);
   for(let i=0;i<70;i++)await step();                                     // qua nửa đêm → lượt học ngày 23
   const pick=p=>p.startsWith(ROOT+'/')||p.startsWith(rootPath(STORE)+'/');
   const docs={};for(const [p,d] of Object.entries(w.f.FS))if(pick(p)&&!/\/(requests|jobs)\//.test(p))docs[p]=strip(d);
   const ctl=strip(w.f.FS[ROOT]);for(const k of ['workerHeartbeatAt','workerStoreVersion'])delete ctl[k];
   const auto=strip(w.f.FS[rootPath(STORE)]);for(const k of ['heartbeatAt','leaseUntil','leaseToken'])delete auto[k];
   return {docs,ctl,auto,m:w.m.snap()};
  }
  const A=await day(false),B=await day(true);
  assert.deepEqual(Object.keys(B.docs).sort(),Object.keys(A.docs).sort(),'cùng tập hồ sơ / việc / mô hình');
  for(const p of Object.keys(A.docs))assert.deepEqual(B.docs[p],A.docs[p],'khác nhau ở '+p);
  assert.deepEqual(B.ctl,A.ctl,'tài liệu điều khiển Engine 2 giống hệt (trừ dấu còn sống)');assert.deepEqual(B.auto,A.auto,'trạng thái worker tự động hoá giống hệt (trừ dấu còn sống / khoá)');
  assert(Object.keys(A.docs).some(p=>/\/cases\//.test(p))&&A.docs[ROOT+'/models/current'],'kịch bản có hồ sơ hao hụt + lượt học thật');
  assert(B.m.reads<A.m.reads*0.6&&B.m.writes<A.m.writes,'cổng tín hiệu đọc / ghi ít hơn hẳn: '+B.m.reads+' / '+B.m.writes+' so với '+A.m.reads+' / '+A.m.writes);
  console.log('ok 6. Hai thế giới (báo hết + qua đêm học): hồ sơ, việc, mức kiểm soát, mô hình GIỐNG HỆT; đọc '+B.m.reads+' so với '+A.m.reads+', ghi '+B.m.writes+' so với '+A.m.writes);
 }

 // ── 7. index.js nối đúng: nhịp đi qua cổng, trigger gõ cửa, worker dùng store v5 (bản shared khớp gốc) ─────────
 {
  const ix=fs.readFileSync(path.join(__dirname,'../functions/automation/index.js'),'utf8'),e2=fs.readFileSync(path.join(__dirname,'../functions/automation/engine2.js'),'utf8');
  assert(/createClock\(\{db,stores,engine2,queue,worker,rootPath,fleet\}\)/.test(ix)&&/await clock\.run\(\)/.test(ix),'nhịp đồng hồ chạy qua clock.run()');
  assert(/if\(job&&job\.queued\)await fleet\.poke\(store\)/.test(ix)&&/clock\.shiftSignal\(store,before,after\)/.test(ix)&&/onDue:store=>fleet\.poke\(store\)/.test(ix),'trigger gõ cửa: việc tự động hoá mới, việc lỗi, vào / ra ca');
  assert(!/for\(const store of stores\)for\(const \[name,run\]/.test(ix),'không còn vòng «mỗi quán mỗi nhịp»');
  assert(/require\('\.\/shared\/unit_engine2_store_v5'\)/.test(e2),'worker dùng store v5');
  assert.equal(fs.readFileSync(path.join(__dirname,'../functions/automation/shared/unit_engine2_store_v5.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../unit_engine2_store_v5.js'),'utf8'),'bản shared của worker khớp file gốc (tools/automation/sync.js)');
  const r=await run({pos:'v5',store:'v5'});
  assert.deepEqual({reads:r.tinHieu.banMotBill.reads,writes:r.tinHieu.banMotBill.writes},{reads:0,writes:0},'bán một bill: vẫn 0 đọc / 0 ghi');
  assert(r.motQuanMotNgay.khongViec.reads<400&&r.motQuanMotNgay.khongViec.writes<200,'một quán / ngày «không có việc» < 400 đọc / 200 ghi (v4: 1.205 / 384) — đo '+Math.round(r.motQuanMotNgay.khongViec.reads)+' / '+Math.round(r.motQuanMotNgay.khongViec.writes));
  assert(r.chuoi.ngay.reads<9000&&r.chuoi.ngay.writes<4500,'10 quán / ngày < 9.000 đọc / 4.500 ghi (v4: ~18.000 / ~6.400) — đo '+r.chuoi.ngay.reads+' / '+r.chuoi.ngay.writes);
  console.log('ok 7. Nối đúng ở index.js; 10 quán / ngày: '+r.chuoi.ngay.reads+' đọc + '+r.chuoi.ngay.writes+' ghi (v4: ~18.000 + ~6.400); «không có việc» '+r.chuoi.khongViecNgay.reads+' đọc (v4: ~12.000)');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e.stack||e.message);process.exit(1);});
