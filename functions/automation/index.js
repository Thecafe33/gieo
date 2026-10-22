'use strict';
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldPath,FieldValue}=require('firebase-admin/firestore');
const {getDatabase}=require('firebase-admin/database');
const A=require('./shared/gieo_automation.v1');
const {createWorker,rootPath}=require('./worker');
const {createQueue}=require('./queue');
const {createEngine}=require('./engine');
const stores=require('./stores.json');
initializeApp();
const db=getFirestore(),rt={ref:p=>getDatabase(undefined,process.env.GIEO_DATABASE_URL||'https://the-cafe-33-default-rtdb.asia-southeast1.firebasedatabase.app').ref(p)},engines=new Map();
const getEngine=store=>{if(!engines.has(store))engines.set(store,createEngine({storeId:store,fstore:db,db:rt,FieldValue}));return engines.get(store);};
const worker=createWorker(db,{documentId:FieldPath.documentId(),getEngine}),queue=createQueue(db,worker);
// Exact paths only: no trigger on bills or ordinary top-level writes in other apps.
for(const store of stores){
 if(!/^gg\d{2}$/.test(store))throw Error('Mã quán không hợp lệ trong stores.json');
 for(const kind of A.kinds){
  exports[store+'_'+kind]=onDocumentWritten({document:A.collection(kind,store)+'/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
   const before=event.data.before.exists?event.data.before.data():null,after=event.data.after.exists?event.data.after.data():null;
   try{await queue.enqueue(store,kind,event.params.id,before,after);}catch(e){await db.doc(rootPath(store)).set({lastSourceError:{path:A.collection(kind,store)+'/'+event.params.id,message:String(e.message||e),at:new Date().toISOString()}},{merge:true});throw e;}
  });
 }
 exports[store+'_automation_job']=onDocumentWritten({document:rootPath(store)+'/jobs/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const next=event.data.after.exists?event.data.after.data():null;
  if(!next?.dirty||Number(next.leaseUntil)>Date.now()||Number(next.nextTryAt)>Date.now())return;
  try{await queue.drain(store,event.params.id);}catch(e){await db.doc(rootPath(store)).set({lastSourceError:{path:rootPath(store)+'/jobs/'+event.params.id,message:String(e.message||e),at:new Date().toISOString()}},{merge:true});throw e;}
 });
}
exports.gieoAutomationClock=onSchedule({schedule:'every 15 minutes',timeZone:'Asia/Ho_Chi_Minh',region:'asia-southeast1',timeoutSeconds:540,maxInstances:1},async()=>{
 for(const store of stores)try{await queue.retryDue(store);await worker.tickStore(store);}catch(e){
  await db.doc(rootPath(store)).set({lastError:String(e.message||e),errorAt:new Date().toISOString()},{merge:true});console.error('Gieo automation',store,e);
 }
});
