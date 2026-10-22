'use strict';
const assert=require('node:assert/strict'),{makeFake}=require('./lib/fakefb');
const {createWorker,rootPath,configPath}=require('../functions/automation/worker');
const {createQueue}=require('../functions/automation/queue');
function fixture(){
 const cfg={enabled:true,mode:'active',fleet20Confirmed:true,startDate:'2026-10-01'},f=makeFake({fs:{[configPath('gg01')]:cfg,[configPath('gg02')]:cfg}});
 const collection=f.fstore.collection.bind(f.fstore);f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return collection(a.join('/')).doc(id)};
 const originalTx=f.fstore.runTransaction.bind(f.fstore);
 f.fstore.runTransaction=fn=>originalTx(tx=>{let written=false;const get=tx.get;tx.get=ref=>{assert.equal(written,false,'Firestore không cho đọc sau ghi trong transaction');return get(ref)};
  for(const name of ['set','update','delete']){const call=tx[name];tx[name]=(...args)=>{written=true;return call(...args)}}return fn(tx)});
 let now=Date.parse('2026-10-22T12:00:00+07:00');const worker=createWorker(f.fstore,{now:()=>now}),queue=createQueue(f.fstore,worker,{now:()=>now});
 return {...f,cfg,worker,queue,collection,advance:n=>now+=n};
}
async function expense(f,id,store='gg01'){
 const d={status:'pending_review',amount:10,businessDate:'2026-10-22'},coll='expenses_gieogieo'+(store==='gg01'?'':'__'+store);
 await f.fstore.doc(coll+'/'+id).set(d);return f.queue.enqueue(store,'expenses',id,null,d);
}
(async()=>{
 {
  const f=fixture(),root=rootPath('gg01'),a=await expense(f,'A'),b=await expense(f,'B'),actual=f.worker.processSource;
  f.worker.processSource=async()=>{throw Error('network')};
  await f.queue.drain('gg01',a.id).catch(()=>{});f.advance(60001);await f.queue.drain('gg01',a.id).catch(()=>{});
  assert.equal(f.FS[root].sourceErrorCount,1);await f.queue.drain('gg01',b.id).catch(()=>{});assert.equal(f.FS[root].sourceErrorCount,2);
  f.advance(60001);f.worker.processSource=actual;await f.queue.drain('gg01',b.id);assert.equal(f.FS[root].sourceErrorCount,1);assert(f.FS[root].lastSourceError);
  await f.queue.drain('gg01',a.id);assert.equal(f.FS[root].sourceErrorCount,0);assert.equal(f.FS[root].lastSourceError,null);
  await f.queue.drain('gg01',a.id);assert.equal(f.FS[root].sourceErrorCount,0);
  console.log('ok Hai lỗi độc lập; retry cùng lỗi không tăng đúp, một thành công không che lỗi khác và hết lỗi mới báo ổn');
 }
 for(const fail of [true,false]){
  const f=fixture(),root=rootPath('gg01'),j=await expense(f,'slow'),actual=f.worker.processSource;let release,entered;
  const start=new Promise(r=>entered=r);f.worker.processSource=()=>new Promise((resolve,reject)=>{release=fail?()=>reject(Error('late')):resolve;entered()});
  const stale=f.queue.drain('gg01',j.id).catch(()=>null);await start;f.advance(120001);f.worker.processSource=actual;await f.queue.drain('gg01',j.id);release();await stale;
  assert.equal(f.FS[root+'/jobs/'+j.id].dirty,false);assert(!f.FS[root].lastSourceError);assert(!f.FS[root].sourceErrorCount);
 }
 console.log('ok Chủ lease cũ trả lỗi hoặc thành công đều không sửa kết quả của chủ mới');
 {
  const f=fixture();for(const store of ['gg01','gg02'])await f.queue.recordEnqueueError(store,'expenses','same',Error('enqueue'));
  await f.queue.recordEnqueueError('gg01','expenses','same',Error('enqueue retry'));
  assert.equal(f.FS[rootPath('gg01')].sourceErrorCount,1);assert.equal(f.FS[rootPath('gg02')].sourceErrorCount,1);
  await expense(f,'same');assert.equal(f.FS[rootPath('gg01')].sourceErrorCount,0);assert.equal(f.FS[rootPath('gg02')].sourceErrorCount,1);
  console.log('ok Lỗi enqueue được giữ riêng, retry thành công gỡ đúng nguồn và không trộn quán');
 }
 {
  const f=fixture(),root=rootPath('gg01');await f.queue.recordEnqueueError('gg01','expenses','deleted',Error('enqueue'));
  await f.fstore.doc(configPath('gg01')).set({enabled:false},{merge:true});await f.queue.retrySourceErrors('gg01');assert.equal(f.FS[root].sourceErrorCount,1);
  await f.fstore.doc(configPath('gg01')).set({enabled:true},{merge:true});await f.queue.retrySourceErrors('gg01');assert.equal(f.FS[root].sourceErrorCount,0);
  console.log('ok Lỗi enqueue qua lần tắt/bật được thử lại đúng nguồn kể cả chứng từ đã xóa; không cần sự kiện mới');
 }
 {
  const f=fixture(),root=rootPath('gg01');await f.queue.recordEnqueueError('gg01','expenses','bad',Error('enqueue'));
  f.worker.processSource=async()=>{throw Error('processing')};await f.queue.retrySourceErrors('gg01');
  assert.equal(f.FS[root].sourceErrorCount,1);
  const active=Object.entries(f.FS).filter(([p,d])=>p.startsWith(root+'/errors/')&&d.active).map(([,d])=>d);
  assert.equal(active.length,1);assert.equal(active[0].kind,'job');
  console.log('ok Phục hồi enqueue rồi xử lý lỗi chỉ đếm lỗi job, không đếm trùng cùng lượt');
 }
 {
  const f=fixture(),root=rootPath('gg01'),jobPath=root+'/jobs';let scans=0;
  // Exact document-ID cursor semantics, unlike the generic fake's no-op cursor.
  f.fstore.collection=p=>{if(p!==jobPath)return f.collection(p);let cursor='',limit=Infinity;const q={orderBy:()=>q,startAfter:id=>{cursor=id;return q},limit:n=>{limit=n;return q},get:async()=>{scans++;return {docs:(await f.collection(p).get()).docs.filter(d=>d.id>cursor).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit)}}};return q;};
  for(let i=0;i<230;i++)await f.fstore.doc(jobPath+'/'+String(i).padStart(3,'0')).set({dirty:i===0||i===229,lastError:i===0||i===229?'old network':'',sources:{},revision:1,nextTryAt:0});
  await f.fstore.doc(root).set({lastSourceError:{path:jobPath+'/100',message:'stale phantom'}});
  assert.equal(await f.worker.migrateErrors('gg01',f.cfg),false);assert.equal(f.FS[root].sourceErrorCount,1);
  assert.equal(await f.worker.migrateErrors('gg01',f.cfg),false);assert.equal(await f.worker.migrateErrors('gg01',f.cfg),true);
  assert.equal(f.FS[root].sourceErrorCount,2);assert.equal(f.FS[root].errorStateVersion,1);
  const done=scans;await f.worker.migrateErrors('gg01',f.cfg);assert.equal(scans,done);
  await f.queue.drain('gg01','000');assert.equal(f.FS[root].sourceErrorCount,1);await f.queue.drain('gg01','229');assert.equal(f.FS[root].sourceErrorCount,0);assert.equal(f.FS[root].lastSourceError,null);
  console.log('ok Nâng dữ liệu lỗi cũ qua 230 jobs có cursor, không nuốt lỗi hay quét lại sau hoàn tất');
 }
 {
  const f=fixture(),root=rootPath('gg01');await f.fstore.doc(root).set({lastSourceError:{path:'expenses_gieogieo/old',message:'old enqueue'}});
  await f.queue.recordEnqueueError('gg01','expenses','new',Error('new enqueue'));assert.equal(f.FS[root].legacySourceError.path,'expenses_gieogieo/old');
  await f.worker.migrateErrors('gg01',f.cfg);assert.equal(f.FS[root].sourceErrorCount,1);assert(f.FS[root].lastSourceError);
  console.log('ok Giữ nguồn lỗi legacy khi lỗi mới đến trước lượt nâng dữ liệu');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
