// Fault-injection audit of release 46c4a8f. No network or production writes.
// This is an evidence tool, not a passing regression suite: exit 1 means confirmed bugs.
'use strict';
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const {makeFake}=require('../../tests/lib/fakefb');
const {extractRaw}=require('../../tests/lib/extract');
const A=require('../../gieo_automation.v2');
const {createWorker,rootPath,configPath,key}=require('../../functions/automation/worker');
const {createQueue}=require('../../functions/automation/queue');
const root=path.resolve(__dirname,'../..'),results=[];
function check(id,expected,actual,detail){const pass=expected===actual;results.push({id,status:pass?'PASS':'BUG',expected,actual,detail});}
function fixture(){
 const f=makeFake({fs:{[configPath('gg01')]:{enabled:true,mode:'active',fleet20Confirmed:true,startDate:'2026-10-01'}}});
 f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return f.fstore.collection(a.join('/')).doc(id)};
 let t=Date.parse('2026-10-22T12:00:00+07:00');
 const worker=createWorker(f.fstore,{now:()=>t}),queue=createQueue(f.fstore,worker,{now:()=>t});
 return {...f,worker,queue,advance:n=>t+=n};
}
async function expense(f,id){const d={status:'pending_review',amount:35000,businessDate:'2026-10-22'};await f.fstore.doc('expenses_gieogieo/'+id).set(d);return f.queue.enqueue('gg01','expenses',id,null,d);}
async function backend(){
 // Relevant-event filtering happens before the durable queue, so skipped writes
 // cannot be recovered by retryDue (and review cases have no periodic nextCheckAt).
 {
  const f=fixture(),before={status:'active',needsReview:true,prepId:'p',code:'BTP1'},after={...before,needsReview:false};
  await f.fstore.doc('prep_batches_gieogieo/b').set(before);await f.worker.processSource('gg01','prep_batches','b');
  await f.fstore.doc('prep_batches_gieogieo/b').set(after);const q=await f.queue.enqueue('gg01','prep_batches','b',before,after);if(q.queued)await f.queue.drain('gg01',q.id);
  const row=f.FS[rootPath('gg01')+'/cases/'+key('prep_batches','b')];
  check('BTP_REVIEW_EVENT',false,row.rule==='LOT_REVIEW','Nguồn needsReview=false nhưng hồ sơ vẫn LOT_REVIEW; queued='+q.queued+', nextCheckAt='+row.nextCheckAt);
 }
 // A late failure from an expired lease must not poison a job already completed
 // by its replacement owner. Lease protection exists for the job but not its root error.
 {
  const f=fixture(),j=await expense(f,'late'),actual=f.worker.processSource;
  let rejectOld,started;const entered=new Promise(r=>started=r);
  f.worker.processSource=()=>new Promise((resolve,reject)=>{rejectOld=reject;started()});
  const old=f.queue.drain('gg01',j.id).then(()=>null,e=>e.message);await entered;
  f.advance(120001);f.worker.processSource=actual;await f.queue.drain('gg01',j.id);
  rejectOld(Error('old invocation timeout'));await old;
  const job=f.FS[rootPath('gg01')+'/jobs/'+j.id],sum=f.FS[rootPath('gg01')];
  check('EXPIRED_LEASE_ERROR',false,!!sum.lastSourceError,'job.dirty='+job.dirty+', job.lastError='+JSON.stringify(job.lastError)+', root='+JSON.stringify(sum.lastSourceError));
  const n=await f.queue.retryDue('gg01');check('EXPIRED_LEASE_SELF_HEAL',true,n>0,'Không có job dirty để retry; root lỗi vẫn tồn tại');
 }
 // Two independent errors must remain independently observable.
 {
  const f=fixture(),a=await expense(f,'A'),b=await expense(f,'B'),actual=f.worker.processSource;
  f.worker.processSource=async()=>{throw Error('network')};
  for(const j of [a,b])await f.queue.drain('gg01',j.id).catch(()=>{});
  f.advance(60001);f.worker.processSource=actual;await f.queue.drain('gg01',b.id);
  const broken=f.FS[rootPath('gg01')+'/jobs/'+a.id],sum=f.FS[rootPath('gg01')];
  check('OTHER_JOB_ERROR_CLEARED',true,!!sum.lastSourceError,'A còn dirty='+broken.dirty+' và lastError='+broken.lastError+' nhưng B thành công xoá lỗi root');
 }
 // Controls: duplicate and out-of-order delivery are already handled correctly.
 {
  const f=fixture(),d={status:'pending_review',amount:1};await f.fstore.doc('expenses_gieogieo/e').set(d);
  const j=await f.queue.enqueue('gg01','expenses','e',null,d);await f.queue.drain('gg01',j.id);
  const c=rootPath('gg01')+'/cases/'+key('expenses','e'),revision=f.FS[c].revision;
  await f.queue.enqueue('gg01','expenses','e',null,d);await f.queue.drain('gg01',j.id);
  check('CONTROL_DUPLICATE_DELIVERY',revision,f.FS[c].revision,'Lặp sự kiện không tạo lại phiên bản kết luận');
  const newer={...d,status:'approved'};await f.fstore.doc('expenses_gieogieo/e').set(newer);
  await f.queue.enqueue('gg01','expenses','e',null,d);await f.queue.drain('gg01',j.id);
  check('CONTROL_LATE_DELIVERY','done',f.FS[c].group,'Sự kiện cũ vẫn đọc nguồn hiện tại đã duyệt');
 }
}
async function browser(){
 const {chromium}=require('playwright'),b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const fixtureText=fs.readFileSync(path.join(__dirname,'review_e2e.js'),'utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
 const p=await b.newPage();await p.route('**/*',r=>r.abort());await p.setContent('<main><div id="inboxBody"></div><div id="todayHealth"></div><div id="sheet"></div></main>');
 await p.addScriptTag({content:fixtureText});await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'ui.js'),'utf8')});
 // Exercise the original caller too: it passes its cached array to the new UI.
 await p.addScriptTag({content:extractRaw('quanlygieo.html',['markAlertStatus'])});
 const observed=await p.evaluate(async()=>{
  const state={version:0,changes:new Map(),unread:[],inbox:[{id:'old-alert',status:'new'}],health:null};window.alertUiState=()=>state;
  const collection=fstore.collection;fstore.collection=(...a)=>{const c=collection(...a),doc=c.doc;return {...c,doc:id=>({...doc(id),update:async()=>{}})}};
  sum.enabled=false;sum.ready=false;await markAlertStatus('old-alert','resolved');
  return {legacy:counts.legacy,cases:counts.cases,saved:document.body.textContent.includes('Đang xem bản lưu'),sourceStatus:state.inbox[0].status};
 });
 check('LEGACY_ARGUMENT_COMPATIBILITY',true,observed.legacy>0,'Sau markAlertStatus truyền mảng: '+JSON.stringify(observed));
 await p.close();
 }finally{await b.close()}
 // Exercise the exact renderer reached by the new autoGoSource, not a UI mock.
 const ctx={box:{innerHTML:''},fmtNum:x=>String(x||0),escapeHtmlAttr:x=>String(x||''),fmtDateVN:x=>String(x),vnDate:x=>new Date(x)};
 vm.runInNewContext(extractRaw('quanlygieo.html',['_ctnDetailRender'])+";_ctnDetailRender(box,{id:'c1',status:'finished',needsReview:true,code:'NL1'},null)",ctx);
 check('REVIEW_DETAIL_ACTION',true,/ctnMarkReviewed\(/.test(ctx.box.innerHTML),'Chi tiết tem đã mở đúng mã nhưng không có hành động Đã xem; nút nằm ở danh sách Kho khác');
}
(async()=>{await backend();await browser();const report={release:'46c4a8f',scope:'quanlygieo2 + automation worker',productionWrites:0,results};console.log(JSON.stringify(report,null,2));if(process.argv.includes('--json'))fs.writeFileSync(path.join(root,'docs/QUANLYGIEO2_FAULT_AUDIT_46c4a8f.json'),JSON.stringify(report,null,2)+'\n');process.exitCode=results.some(r=>r.status==='BUG')?1:0;})().catch(e=>{console.error(e);process.exit(2)});
