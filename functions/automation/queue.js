'use strict';
const A=require('./shared/gieo_automation.v2');
const {key,rootPath,configPath}=require('./worker');
function createQueue(db,worker,{now=Date.now}={}){
 const path=store=>rootPath(store)+'/jobs';
 async function enqueue(store,kind,id,before,after){
  if(!A.relevant(kind,before,after))return {queued:false};
  const event=kind.endsWith('_transactions')&&(after?.wasteEventId||before?.wasteEventId);
  const ref=db.doc(path(store)+'/'+key(event?'waste':kind,event||id));
  return db.runTransaction(async tx=>{
   const cfg=await tx.get(db.doc(configPath(store)));if(!cfg.exists||!cfg.data().enabled)return {queued:false};
   const snap=await tx.get(ref),old=snap.exists?snap.data():{};
   const sources={...(old.sources||{}),[key(kind,id)]:{kind,id}};
   if(Object.keys(sources).length>100)throw Error('Sự kiện quá 100 dòng; cần đối chiếu');
   const days=new Set(old.days||[]);for(const d of (kind.endsWith('_transactions')||kind==='duty_cases'||kind==='daily_closings'?[before,after]:[]))if(/^\d{4}-\d{2}-\d{2}$/.test(d?.businessDate||''))days.add(d.businessDate);
   const revision=(old.revision||0)+1;
   tx.set(ref,{...old,sources,days:[...days],revision,dirty:true,nextTryAt:now(),updatedAt:now(),leaseUntil:old.leaseUntil||0});
   return {queued:true,id:ref.id,revision};
  });
 }
 async function drain(store,id){
  const ref=db.doc(path(store)+'/'+id),token=require('node:crypto').randomUUID();
  const job=await db.runTransaction(async tx=>{
   const [snap,cfg]=await Promise.all([tx.get(ref),tx.get(db.doc(configPath(store)))]);
   if(!cfg.exists||!cfg.data().enabled||!snap.exists)return null;const j=snap.data();
   if(!j.dirty||Number(j.leaseUntil)>now()||Number(j.nextTryAt)>now())return null;
   tx.update(ref,{leaseUntil:now()+120000,leaseToken:token});return j;
  });
  if(!job)return false;
  try{
   const sources=Object.values(job.sources||{}).sort((a,b)=>(a.kind+'/'+a.id).localeCompare(b.kind+'/'+b.id));
   if(sources.length){const [first,...rest]=sources;await worker.processSource(store,first.kind,first.id,rest);}
   for(const day of job.days||[])await worker.markDay(store,day,'queue_'+id+'_'+job.revision);
   await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)return;const j=snap.data();if(j.leaseToken!==token)return;
    tx.update(ref,{dirty:j.revision!==job.revision,leaseUntil:0,leaseToken:'',nextTryAt:now(),lastError:'',completedAt:now()});});
   const root=db.doc(rootPath(store)),sum=await root.get();
   if(sum.exists&&sum.data().lastSourceError?.path===ref.path)await root.set({lastSourceError:null},{merge:true});
   return true;
  }catch(e){
   await db.runTransaction(async tx=>{const sn=await tx.get(ref);if(sn.exists&&sn.data().leaseToken===token)tx.update(ref,{leaseUntil:0,leaseToken:'',nextTryAt:now()+60000,lastError:String(e.message||e)});});
   await db.doc(rootPath(store)).set({lastSourceError:{path:ref.path,message:String(e.message||e),at:new Date(now()).toISOString()}},{merge:true});
   throw e;
  }
 }
 async function retryDue(store){
  const snap=await db.collection(path(store)).where('dirty','==',true).where('nextTryAt','<=',now()).orderBy('nextTryAt').limit(30).get();
  for(const d of snap.docs)try{await drain(store,d.id);}catch(e){if(process.env.NODE_ENV!=='test')console.error('Gieo retry job',store,d.id,e.message);}
  return snap.docs.length;
 }
 return {enqueue,drain,retryDue};
}
module.exports={createQueue};
