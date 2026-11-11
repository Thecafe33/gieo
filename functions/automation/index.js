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
const {createClock,createFleet}=require('./clock');
const stores=require('./stores.json');
initializeApp();
const db=getFirestore(),rt={ref:p=>getDatabase(undefined,process.env.GIEO_DATABASE_URL||'https://the-cafe-33-default-rtdb.asia-southeast1.firebasedatabase.app').ref(p)},engines=new Map();
const getEngine=store=>{if(!engines.has(store))engines.set(store,createEngine({storeId:store,fstore:db,db:rt,FieldValue}));return engines.get(store);};
// [v5 — cổng tín hiệu] Bảng tín hiệu chuỗi: trigger «gõ cửa» (poke) khi có việc cho nhịp đồng hồ; nhịp chỉ vào quán có tín hiệu.
const fleet=createFleet(db);
const worker=createWorker(db,{documentId:FieldPath.documentId(),getEngine,retrySourceErrors:store=>queue.retrySourceErrors(store)}),queue=createQueue(db,worker,{onDue:store=>fleet.poke(store)});
const engine2=createEngine2Worker({db,rt,FieldValue,documentId:FieldPath.documentId(),onDue:store=>fleet.poke(store)});
const clock=createClock({db,stores,engine2,queue,worker,rootPath,fleet});
// Exact paths only: no trigger on bills or ordinary top-level writes in other apps.
for(const store of stores){
 if(!/^gg\d{2}$/.test(store))throw Error('Mã quán không hợp lệ trong stores.json');
 for(const kind of A.kinds){
  exports[store+'_'+kind]=onDocumentWritten({document:A.collection(kind,store)+'/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
   const before=event.data.before.exists?event.data.before.data():null,after=event.data.after.exists?event.data.after.data():null;
   await engine2.source(store,kind,event.params.id,before,after);
   let job;try{job=await queue.enqueue(store,kind,event.params.id,before,after);}catch(e){await queue.recordEnqueueError(store,kind,event.params.id,e);await fleet.poke(store);throw e;}
   if(job&&job.queued)await fleet.poke(store);   // [v5] có việc tự động hoá mới (ngày cần dựng lại, hồ sơ có hạn) → nhịp kế tiếp vào quán này
  });
 }
 exports[store+'_automation_job']=onDocumentWritten({document:rootPath(store)+'/jobs/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const next=event.data.after.exists?event.data.after.data():null;
  if(!next?.dirty||Number(next.leaseUntil)>Date.now()||Number(next.nextTryAt)>Date.now())return;
  await queue.drain(store,event.params.id);
 });
 exports[store+'_engine2_shift']=onDocumentWritten({document:A.collection('employee_shifts',store)+'/{id}',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const before=event.data.before.exists?event.data.before.data():null,after=event.data.after.exists?event.data.after.data():null;
  await clock.shiftSignal(store,before,after).catch(e=>console.error('Gieo shift signal',store,e.message));   // [v5] vào / ra ca → quán mở / đóng + dấu còn sống ngay
  await engine2.source(store,'employee_shifts',event.params.id,before,after);
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
  // [v4] Lưới an toàn khi POS chưa kịp xếp hàng lượt cân: chỉ xếp khi CHƯA có (onlyNew) — trước mỗi lượt cân bị xử lý hai lần.
  if(!event.data.before.exists&&event.data.after.exists&&event.data.after.data().acceptedProtocol===1)await engine2.service(store).enqueue('measurement',event.params.id,false,true);
 });
 exports[store+'_engine2_settings']=onDocumentWritten({document:A.collection('duty_digests',store)+'/_engine2',region:'asia-southeast1',retry:true,maxInstances:2},async event=>{
  const a=event.data.after.exists?event.data.after.data():null,b=event.data.before.exists?event.data.before.data():null;
  if(a?.enabled&&a.settingsRevision!==b?.settingsRevision)await engine2.service(store).enqueue('bootstrap','settings_'+a.settingsRevision);
 });
}
// [v5 — cổng tín hiệu] Nhịp 15 phút chỉ còn là người gác cổng: đọc một bảng tín hiệu cho mọi quán, chỉ quán có tín hiệu mới chạy
// Engine 2 / hàng đợi / worker tự động hoá (mỗi phần vẫn một khối lỗi riêng) — xem clock.js.
exports.gieoAutomationClock=onSchedule({schedule:'every 15 minutes',timeZone:'Asia/Ho_Chi_Minh',region:'asia-southeast1',timeoutSeconds:540,maxInstances:1},async()=>{await clock.run();});
