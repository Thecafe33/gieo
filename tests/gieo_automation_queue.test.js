'use strict';
const assert=require('node:assert');
const {makeFake}=require('./lib/fakefb');
const A=require('../gieo_automation.v2');
const {createWorker,rootPath,configPath,key}=require('../functions/automation/worker');
const {createQueue}=require('../functions/automation/queue');
const {createEngine}=require('../functions/automation/engine');
const now=Date.parse('2026-10-22T12:00:00+07:00');
function fixture(){const f=makeFake({fs:{[configPath('gg01')]:{enabled:true,mode:'shadow',startDate:'2026-10-01'},[configPath('gg02')]:{enabled:true,mode:'active',fleet20Confirmed:true,startDate:'2026-10-01'}}});f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return f.fstore.collection(a.join('/')).doc(id);};const engines=new Map();const getEngine=store=>{if(!engines.has(store))engines.set(store,createEngine({storeId:store,fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>now}));return engines.get(store);};const worker=createWorker(f.fstore,{now:()=>now,getEngine});let queueTime=now;return {...f,getEngine,worker,advance:n=>{queueTime+=n;},queue:createQueue(f.fstore,worker,{now:()=>queueTime})};}
(async()=>{
 const f=fixture();let q;
 for(const [id,cost]of [['milk',30],['tea',20]]){const data={type:'WASTE',wasteEventId:'drink',businessDate:'2026-10-20',totalCost:cost,reason:'đổ',qty:-1};await f.fstore.doc('stock_transactions_gieogieo/'+id).set(data);q=await f.queue.enqueue('gg01','stock_transactions',id,null,data);}
 const event=rootPath('gg01')+'/cases/'+key('waste','drink');
 await f.queue.drain('gg01',q.id);assert.equal(f.FS[event].revision,1);assert.equal(Object.keys(f.FS[event].parts).length,2);
 const rev=f.FS[event].revision;await f.queue.drain('gg01',q.id);assert.equal(f.FS[event].revision,rev);
 await f.worker.buildDay('gg01','2026-10-20');assert.equal(f.FS[rootPath('gg01')+'/days/2026-10-20'].declaredValue,50);assert.equal(f.FS[rootPath('gg01')+'/days/2026-10-20'].eventCount,1);
 console.log('ok Hai dòng một sự kiện chỉ chốt một phiên bản; chạy lại không cộng trùng');
 const old=f.FS['stock_transactions_gieogieo/tea'],next={...old,businessDate:'2026-10-19',totalCost:40};await f.fstore.doc('stock_transactions_gieogieo/tea').set(next);await f.queue.enqueue('gg01','stock_transactions','tea',old,next);await f.queue.drain('gg01',q.id);
 await f.worker.buildDay('gg01','2026-10-20');await f.worker.buildDay('gg01','2026-10-19');
 assert.equal(f.FS[rootPath('gg01')+'/days/2026-10-20'].declaredValue,30);assert.equal(f.FS[rootPath('gg01')+'/days/2026-10-19'].declaredValue,40);
 console.log('ok Sửa ngày chứng từ cập nhật cả ngày cũ và ngày mới');
 // Concurrent arrival during processing: old ACK must not clear new work.
 const actual=f.worker.processSource;let injected=false;
 f.worker.processSource=async(...args)=>{await actual(...args);if(!injected){injected=true;const d={type:'WASTE',wasteEventId:'drink',businessDate:'2026-10-20',reason:'đổ',totalCost:10};await f.fstore.doc('stock_transactions_gieogieo/third').set(d);await f.queue.enqueue('gg01','stock_transactions','third',null,d);}};
 await f.queue.enqueue('gg01','stock_transactions','milk',null,f.FS['stock_transactions_gieogieo/milk']);await f.queue.drain('gg01',q.id);
 assert.equal(f.FS[rootPath('gg01')+'/jobs/'+q.id].dirty,true);await f.queue.drain('gg01',q.id);assert.equal(f.FS[rootPath('gg01')+'/jobs/'+q.id].dirty,false);assert.equal(Object.keys(f.FS[event].parts).length,3);
 console.log('ok Sự kiện đến trong lúc xử lý không bị ACK cũ xoá mất');
 const c={status:'pending_verify',revision:1,value:20,variance:-2};const task={status:'open',caseId:'c',prepId:'p',expireAt:'2026-10-01',firstAt:'2026-09-29'};
 for(const store of ['gg01','gg02']){await f.fstore.doc(A.collection('duty_cases',store)+'/c').set(c);await f.fstore.doc(A.collection('duty_tasks',store)+'/t').set(task);await f.worker.processSource(store,'duty_tasks','t');}
 assert.equal(f.FS['duty_cases_gieogieo/c'].status,'pending_verify');assert.equal(f.FS['duty_cases_gieogieo__gg02/c'].status,'closed_pool');
 assert.equal(f.getEngine('gg01').VERSION,'20.0.0');
 console.log('ok Engine Node tách quán, shadow không đổi nghiệp vụ, active xử lý hạn bằng Engine');
 // Controlled failure remains retryable; a later retry may complete.
 const data={status:'pending_review',amount:5};await f.fstore.doc('expenses_gieogieo/e').set(data);const j=await f.queue.enqueue('gg01','expenses','e',null,data);
 f.worker.processSource=async()=>{throw Error('network')};await assert.rejects(f.queue.drain('gg01',j.id),/network/);assert.equal(f.FS[rootPath('gg01')+'/jobs/'+j.id].dirty,true);assert.equal(f.FS[rootPath('gg01')+'/jobs/'+j.id].leaseUntil,0);
 f.worker.processSource=actual;assert.equal(await f.queue.drain('gg01',j.id),false);f.advance(60001);await f.queue.drain('gg01',j.id);assert.equal(f.FS[rootPath('gg01')+'/jobs/'+j.id].dirty,false);
 console.log('ok Lỗi giữ việc thử lại, không để lease khoá vĩnh viễn');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
