'use strict';
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldPath,FieldValue}=require('firebase-admin/firestore');
const {getDatabase}=require('firebase-admin/database');
const A=require('./shared/gieo_automation.v3');
const {createWorker,rootPath}=require('./worker');
const {createQueue}=require('./queue');
const {createEngine}=require('./engine');
const {createEngine2Worker}=require('./engine2');
const stores=require('./stores.json');
initializeApp();
const db=getFirestore(),rt={ref:p=>getDatabase(undefined,process.env.GIEO_DATABASE_URL||'https://the-cafe-33-default-rtdb.asia-southeast1.firebasedatabase.app').ref(p)},engines=new Map();
const getEngine=store=>{if(!engines.has(store))engines.set(store,createEngine({storeId:store,fstore:db,db:rt,FieldValue}));return engines.get(store);};
const worker=createWorker(db,{documentId:FieldPath.documentId(),getEngine,retrySourceErrors:store=>queue.retrySourceErrors(store)}),queue=createQueue(db,worker);
const engine2=createEngine2Worker({db,rt,FieldValue,documentId:FieldPath.documentId()});
// Exact paths only: no trigger on bills or ordinary top-level writes in other apps.
for(const store of stores){
 if(!/^gg\d{2}$/.test(store))throw Error('Mã quán không hợp lệ trong stores.json');
 for(const kind of A.kinds){
  exports[store+'_'+kind]=onDocumentWritten({document:A.collection(kind,store)+'/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
   const before=event.data.before.exists?event.data.before.data():null,after=event.data.after.exists?event.data.after.data():null;
   await engine2.source(store,kind,event.params.id,before,after);
   try{await queue.enqueue(store,kind,event.params.id,before,after);}catch(e){await queue.recordEnqueueError(store,kind,event.params.id,e);throw e;}
  });
 }
 exports[store+'_automation_job']=onDocumentWritten({document:rootPath(store)+'/jobs/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const next=event.data.after.exists?event.data.after.data():null;
  if(!next?.dirty||Number(next.leaseUntil)>Date.now()||Number(next.nextTryAt)>Date.now())return;
  await queue.drain(store,event.params.id);
 });
 exports[store+'_engine2_shift']=onDocumentWritten({document:A.collection('employee_shifts',store)+'/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  await engine2.source(store,'employee_shifts',event.params.id,event.data.before.exists?event.data.before.data():null,event.data.after.exists?event.data.after.data():null);
 });
 exports[store+'_engine2_price']=onDocumentWritten({document:A.collection('price_history',store)+'/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  await engine2.source(store,'price_history',event.params.id,event.data.before.exists?event.data.before.data():null,event.data.after.exists?event.data.after.data():null);
 });
 exports[store+'_engine2_request']=onDocumentWritten({document:A.collection('duty_digests',store)+'/_engine2/requests/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const d=event.data.after.exists?event.data.after.data():null;if(d?.dirty&&Number(d.leaseUntil)<=Date.now()&&Number(d.nextTryAt)<=Date.now())await engine2.drain(store,event.params.id);
 });
 exports[store+'_engine2_case']=onDocumentWritten({document:A.collection('duty_digests',store)+'/_engine2/cases/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const a=event.data.after.exists?event.data.after.data():null,b=event.data.before.exists?event.data.before.data():null;if((a||b)?.originKind==='finish'&&(a||b).containerId)await worker.processSource(store,'stock_containers',(a||b).containerId);
 });
 exports[store+'_engine2_measurement']=onDocumentWritten({document:A.collection('duty_digests',store)+'/_engine2/measurements/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  if(!event.data.before.exists&&event.data.after.exists&&event.data.after.data().acceptedProtocol===1)await engine2.service(store).enqueue('measurement',event.params.id);
 });
 exports[store+'_engine2_settings']=onDocumentWritten({document:A.collection('duty_digests',store)+'/_engine2',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const a=event.data.after.exists?event.data.after.data():null,b=event.data.before.exists?event.data.before.data():null;
  if(a?.enabled&&a.settingsRevision!==b?.settingsRevision)await engine2.service(store).enqueue('bootstrap','settings_'+a.settingsRevision);
 });
}
exports.gieoAutomationClock=onSchedule({schedule:'every 15 minutes',timeZone:'Asia/Ho_Chi_Minh',region:'asia-southeast1',timeoutSeconds:540,maxInstances:1},async()=>{
 for(const store of stores)try{await engine2.tick(store);await queue.retryDue(store);await worker.tickStore(store);}catch(e){
  await db.doc(rootPath(store)).set({lastError:String(e.message||e),errorAt:new Date().toISOString()},{merge:true});console.error('Gieo automation',store,e);
 }
});
