'use strict';
const crypto=require('node:crypto');
const A=require('./shared/gieo_automation.v1.js');
const hash=x=>crypto.createHash('sha256').update(A.stable(x)).digest('hex');
const key=(kind,id)=>hash([kind,id]);
const rootPath=store=>A.collection('duty_digests',store)+'/_automation';
const configPath=store=>A.collection('duty_digests',store)+'/_automation_config';
const BOOTSTRAP=[
 ['alerts','status','==','new'],['alerts','status','==','seen'],
 ['duty_cases','status','==','pending_verify'],['duty_cases','status','==','contested'],['duty_cases','status','==','dispute'],
 ['stock_containers','status','==','open'],['stock_containers','status','==','sealed'],['stock_containers','needsReview','==',true],
 ['duty_tasks','status','==','open'],['duty_tasks','status','==','processing'],
 ['prep_batches','status','==','active'],['inventory_items'],['stock_counts','status','==','pending_review'],
 ['purchase_orders','status','==','pending'],['purchase_orders','status','==','partial'],['expenses','status','==','pending_review'],
 ['daily_openings','businessDate','>=','$from'],['daily_closings','businessDate','>=','$from'],
 ['stock_transactions','businessDate','>=','$from'],['prep_transactions','businessDate','>=','$from']
];
function createWorker(db,opts={}){
 const now=opts.now||Date.now;
 async function processSource(store,kind,id,extraSources=[]){
  if(!A.kinds.includes(kind))return;
  const source=db.doc(A.collection(kind,store)+'/'+id);
  if(opts.getEngine && ['duty_tasks','duty_cases'].includes(kind)){
   const [snap,cfgSnap]=await Promise.all([source.get(),db.doc(configPath(store)).get()]);
   if(snap.exists&&cfgSnap.exists&&cfgSnap.data().enabled&&cfgSnap.data().mode==='active'&&cfgSnap.data().fleet20Confirmed===true){const d=snap.data(),guard={ref:db.doc(configPath(store)),updatedAt:cfgSnap.data().updatedAt||''};
    if(kind==='duty_tasks'&&A.time(d.expireAt)<=now())await opts.getEngine(store).duty.expireTask(id,{guard});
    if(kind==='duty_cases'&&['contested','dispute'].includes(d.status))await opts.getEngine(store).duty.closePolicy(id,{expectedRevision:Number(d.revision)||0,days:Number(cfgSnap.data().disputeDays)||7,guard});
   }
  }
  // Every decision reads the CURRENT source inside the transaction. Delivery order is irrelevant.
  const outcome=await db.runTransaction(async tx=>{
   const [src,cfgSnap]=await Promise.all([tx.get(source),tx.get(db.doc(configPath(store)))]);
   const cfg=cfgSnap.exists?cfgSnap.data():{};
   if(!cfg.enabled)return;
   let data=src.exists?src.data():null, actualKind=kind, actualId=id, related={};
   const indexRef=db.doc(rootPath(store)+'/sources/'+key(kind,id));
   const indexSnap=kind.endsWith('_transactions')?await tx.get(indexRef):null;
   const indexed=indexSnap?.exists?indexSnap.data():null;
   let linked='';
   if(kind==='alerts'&&data){
    if(data.type==='duty_case'&&data.caseId)linked=data.caseId;
    else if(data.type==='prep_count_variance'&&data.prepId&&A.time(data.createdAt))linked=('prep_'+data.prepId+'_'+A.time(data.createdAt)).replace(/[^\w\-]/g,'_').slice(0,180);
    if(linked){
     const doc=await tx.get(db.doc(A.collection('duty_cases',store)+'/'+linked));
     if(doc.exists){actualKind='duty_cases';actualId=linked;data=doc.data();}
    }
   }
   if(kind==='daily_closings'&&!data){const sn=await tx.get(db.doc(A.collection('daily_openings',store)+'/'+id));if(sn.exists){data=sn.data();actualKind='daily_openings';}}
   if(kind==='daily_openings'||actualKind==='daily_openings'){
    const close=await tx.get(db.doc(A.collection('daily_closings',store)+'/'+id));
    related.closing=close.exists?close.data():null;
   }
   // Both opening and closing address the SAME operational case. Cash is out of scope.
   const waste=actualKind.endsWith('_transactions');
   const canonicalKind=waste&&(data?.wasteEventId||indexed?.eventId)?'waste':['daily_openings','daily_closings'].includes(actualKind)?'day':actualKind;
   const canonicalId=canonicalKind==='waste'?(data?.wasteEventId||indexed.eventId):actualId;
   if(indexed?.eventId&&data?.wasteEventId&&indexed.eventId!==data.wasteEventId)throw Error('Mã sự kiện hao hụt đã đổi; cần kiểm tra liên kết trước khi tổng hợp');
   const caseRef=db.doc(rootPath(store)+'/cases/'+key(canonicalKind,canonicalId));
   const [oldSnap,sumSnap]=await Promise.all([tx.get(caseRef),tx.get(db.doc(rootPath(store)))]);
   const old=oldSnap.exists?oldSnap.data():null, sum=sumSnap.exists?sumSnap.data():{};
   const aliasRef=kind==='alerts'&&actualKind==='duty_cases'?db.doc(rootPath(store)+'/cases/'+key('alerts',id)):null;
   const aliasSnap=aliasRef?await tx.get(aliasRef):null;
   const alias=aliasSnap?.exists?aliasSnap.data():null;
   let decision=A.task(actualKind,actualId,data,cfg,now(),related),parts=null;
   if(canonicalKind==='waste'){
    parts={...(old?.parts||{})};
    const partId=key(actualKind,actualId);
    parts[partId]={...decision,sourcePath:source.path,sourceHash:hash(data)};
    for(const other of extraSources){
     const ref=db.doc(A.collection(other.kind,store)+'/'+other.id),sn=await tx.get(ref),d=sn.exists?sn.data():null;
     if(d&&d.wasteEventId!==canonicalId)throw Error('Dòng sổ không cùng sự kiện hao hụt');
     parts[key(other.kind,other.id)]={...A.task(other.kind,other.id,d,cfg,now()),sourcePath:ref.path,sourceHash:hash(d)};
    }
    if(Object.keys(parts).length>100)throw Error('Sự kiện có hơn 100 dòng; cần kiểm tra trước khi tổng hợp');
    const rows=Object.values(parts).filter(p=>!['SOURCE_REMOVED','NO_ACTION','ENGINE_COUNT_LINK'].includes(p.rule)),pending=rows.filter(p=>p.group==='working');
    decision={...(rows.slice().sort((a,b)=>a.sourcePath.localeCompare(b.sourcePath))[0]||decision),sourceId:canonicalId,kind:'stock_transactions',title:'Hao hụt · '+rows.length+' dòng nguyên liệu/BTP',group:pending.length?'working':'done',
      rule:rows.length?'WASTE_GROUP':'SOURCE_REMOVED',
      reason:pending.length?'Hao hụt đã ghi; còn dòng thiếu lý do cần người phụ trách bổ sung.':'Các dòng của cùng sự kiện đã được gom. Không mặc định quy lỗi cho người báo.',value:null};
   }
   const fingerprint=hash({data:parts?null:data,parts,related,owners:cfg.owners||{},decision,version:A.VERSION});
   if(old&&old.fingerprint===fingerprint&&!alias?.visible){if(sum.lastSourceError?.path===source.path)tx.set(db.doc(rootPath(store)),{lastSourceError:null},{merge:true});return {changed:false};}
   if(!old&&['NO_ACTION','SOURCE_REMOVED','ENGINE_COUNT_LINK'].includes(decision.rule)){if(sum.lastSourceError?.path===source.path)tx.set(db.doc(rootPath(store)),{lastSourceError:null},{merge:true});return {changed:false};}
   const at=new Date(now()).toISOString();
   const result={...decision,storeId:store,id:caseRef.id,sourcePath:A.collection(actualKind,store)+'/'+actualId,
    fingerprint,createdAt:old?.createdAt||at,updatedAt:at,revision:(old?.revision||0)+1,
    visible:!['NO_ACTION','SOURCE_REMOVED','ENGINE_COUNT_LINK'].includes(decision.rule),parts,linkedDutyId:linked||'',assigneeMissing:decision.group==='working'&&!decision.assigneeId};
   // No source ledger/stock/receipt is mutated. Manual Engine decisions remain authoritative.
   const delta=A.counterDelta(old,result),counts={...(sum.counts||{})};
   const aliasDelta=A.counterDelta(alias,null);
   for(const group of Object.keys(delta))counts[group]=Math.max(0,(counts[group]||0)+delta[group]+aliasDelta[group]);
   if(aliasRef&&alias)tx.set(aliasRef,{...alias,visible:false,rule:'NO_ACTION',linkedDutyId:actualId,reason:'Đã liên kết với hồ sơ Engine; không đếm trùng.',nextCheckAt:0});
   if(linked&&actualKind==='alerts')tx.set(db.doc(rootPath(store)+'/dependents/'+key('duty_cases',linked)+'/alerts/'+id),{alertId:id});
   if(waste){tx.set(indexRef,{eventId:canonicalKind==='waste'?canonicalId:'',caseId:caseRef.id});
    for(const other of extraSources)tx.set(db.doc(rootPath(store)+'/sources/'+key(other.kind,other.id)),{eventId:canonicalKind==='waste'?canonicalId:'',caseId:caseRef.id});
   }
   tx.set(caseRef,result);
   for(const day of new Set([old?.businessDate,result.businessDate]))if(/^\d{4}-\d{2}-\d{2}$/.test(day||'') && (waste||actualKind==='duty_cases'))tx.set(db.doc(rootPath(store)+'/days/'+day),{day,dirty:true,dirtyToken:fingerprint},{merge:true});
   tx.set(caseRef.collection('history').doc(String(result.revision)),{
    at,rule:result.rule,reason:result.reason,group:result.group,sourceStatus:result.sourceStatus,
    sourceFingerprint:fingerprint,previousFingerprint:old?.fingerprint||'',policyVersion:A.VERSION,
    assigneeId:result.assigneeId,allocations:result.allocations,pool:result.pool
   });
   tx.set(db.doc(rootPath(store)),{counts,updatedAt:at,policyVersion:A.VERSION,...(sum.lastSourceError?.path===source.path?{lastSourceError:null}:{})},{merge:true});
   return {changed:true,id:caseRef.id};
  });
  if(kind==='duty_cases'){
   const waiting=await db.collection(rootPath(store)+'/dependents/'+key(kind,id)+'/alerts').limit(100).get();
   for(const d of waiting.docs){await processSource(store,'alerts',d.id);await d.ref.delete();}
  }
  return outcome;
 }
 async function markDay(store,day,token){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  await db.doc(rootPath(store)+'/days/'+day).set({day,dirty:true,dirtyToken:token},{merge:true});
 }
 async function buildDay(store,day){
  const ref=db.doc(rootPath(store)+'/days/'+day),before=await ref.get();if(!before.exists||!before.data().dirty)return;
  const token=before.data().dirtyToken;
  const [stock,prep,cases]=await Promise.all(['stock_transactions','prep_transactions','duty_cases'].map(kind=>{
   let q=db.collection(A.collection(kind,store)).where('businessDate','==',day);if(kind.endsWith('_transactions'))q=q.where('type','==','WASTE');return q.get();
  }));
  const rows=[...stock.docs,...prep.docs].map(x=>({...x.data(),id:x.id}));
  const declared=rows.filter(d=>!d.voided&&!d.fromPrepCount&&d.wasteKind!=='shift_weigh'&&!d.dutyCaseId);
  const eventIds=new Set(declared.map(d=>d.wasteEventId||d.id));
  const c=cases.docs.map(d=>({...d.data(),id:d.id}));
  const itemStats={};for(const d of declared){const kind=d.prepId?'prep':'nl',id=d.prepId||d.itemId||'unknown',k=kind+':'+id;const row=itemStats[k]||(itemStats[k]={kind,id,name:d.prepName||d.itemName||id,declaredValue:0,lines:0});row.lines++;row.declaredValue+=Math.abs(Number(d.totalCost)||0);}
  const summary={day,itemStats:Object.values(itemStats),eventCount:eventIds.size,declaredValue:declared.reduce((sum,d)=>sum+Math.abs(Number(d.totalCost)||0),0),
   missingCost:declared.filter(d=>d.totalCost==null).length,missingReason:declared.filter(d=>!d.reason&&!d.note).length,
   varianceValue:c.reduce((sum,d)=>sum+Math.abs(Number(d.value)||0),0),caseCount:c.length,
   // Separate amounts: never add declared loss and count variance as a new financial loss.
   remakeEventCount:new Set(declared.filter(d=>d.wasteKind==='drink').map(d=>d.wasteEventId||d.id)).size,
   engineVersion:opts.getEngine?opts.getEngine(store).VERSION:'',updatedAt:new Date(now()).toISOString()};
  if(opts.getEngine)summary.engineTotals=JSON.parse(JSON.stringify(opts.getEngine(store).duty.buildDigest({day,stockTx:stock.docs.map(d=>({...d.data(),id:d.id})),prepTx:prep.docs.map(d=>({...d.data(),id:d.id})),cases:c,anomalies:[],items:{},preps:{}}).totals));
  await db.runTransaction(async tx=>{const sn=await tx.get(ref);if(sn.exists&&sn.data().dirtyToken===token)tx.set(ref,{...summary,dirty:false},{merge:true});});
 }
 async function bootstrap(store,cfg){
  const ref=db.doc(rootPath(store));
  for(let page=0;page<8;page++){
   const snap=await ref.get(),state=snap.exists?snap.data():{};
   const b=state.bootstrap||{phase:0,cursor:''};
   if(b.phase>=BOOTSTRAP.length){await progress(store,cfg,{ready:true});return;}
   const [kind,field,op,value]=BOOTSTRAP[b.phase];
   let q=db.collection(A.collection(kind,store));
   if(kind.endsWith('_transactions'))q=q.where('type','==','WASTE');
   if(field)q=q.where(field,op,value==='$from'?cfg.startDate:value);
   // Range query must order by the range field first. A snapshot cursor handles tied dates.
   if(op==='>=')q=q.orderBy(field);
   q=q.orderBy(opts.documentId||'__name__');
   if(b.cursor){const cursor=await db.doc(A.collection(kind,store)+'/'+b.cursor).get();if(cursor.exists)q=q.startAfter(cursor);}
   const docs=(await q.limit(100).get()).docs;
   if(kind.endsWith('_transactions')){const groups=new Map();for(const doc of docs){const d=doc.data();if(String(d.type).toUpperCase()!=='WASTE')continue;const k=d.wasteEventId||doc.id;if(!groups.has(k))groups.set(k,[]);groups.get(k).push({kind,id:doc.id});}for(const list of groups.values()){const [first,...rest]=list;await processSource(store,first.kind,first.id,rest);}}
   else for(const doc of docs)await processSource(store,kind,doc.id);
   const more=docs.length===100;
   if(!await progress(store,cfg,{bootstrap:{phase:b.phase+(more?0:1),cursor:more?docs[docs.length-1].id:''},ready:false}))return;
  }
 }
 async function progress(store,cfg,fields){
  return db.runTransaction(async tx=>{const snap=await tx.get(db.doc(configPath(store)));const cur=snap.exists?snap.data():{};if(!cur.enabled||A.stable(cur)!==A.stable(cfg))return false;tx.set(db.doc(rootPath(store)),fields,{merge:true});return true;});
 }
 async function tickStore(store){
  const ref=db.doc(rootPath(store)),cfgSnap=await db.doc(configPath(store)).get();
  const cfg=cfgSnap.exists?cfgSnap.data():{};if(!cfg.enabled)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(cfg.startDate||''))throw Error('Thiếu ngày bắt đầu khởi tạo '+store);
  const token=crypto.randomUUID();
  const claimed=await db.runTransaction(async tx=>{const snap=await tx.get(ref),s=snap.exists?snap.data():{};if(Number(s.leaseUntil)>now())return false;tx.set(ref,{leaseUntil:now()+12*60000,leaseToken:token},{merge:true});return true;});
  if(!claimed)return;
  try{
  const sum=await ref.get();if(!sum.exists||!sum.data().ready)await bootstrap(store,cfg);
  // Only date-driven lot/day checks. No periodic read of every unresolved case or all bills.
  const due=cfg.mode==='active'&&cfg.fleet20Confirmed===true?await db.collection(rootPath(store)+'/cases').where('nextCheckAt','>',0).where('nextCheckAt','<=',now()).orderBy('nextCheckAt').limit(100).get():{docs:[]};
  for(const doc of due.docs){const d=doc.data();await processSource(store,d.kind,d.sourceId);}
  const dirtyDays=await db.collection(rootPath(store)+'/days').where('dirty','==',true).limit(5).get();
  for(const d of dirtyDays.docs)await buildDay(store,d.id);
  await progress(store,cfg,{enabled:true,mode:cfg.mode==='active'&&cfg.fleet20Confirmed===true?'active':'shadow',heartbeatAt:new Date(now()).toISOString(),lastError:''});
  }finally{await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().leaseToken===token)tx.set(ref,{leaseUntil:0,leaseToken:''},{merge:true});});}
 }
 return {processSource,bootstrap,tickStore,markDay,buildDay};
}
module.exports={createWorker,rootPath,configPath,key,BOOTSTRAP};
