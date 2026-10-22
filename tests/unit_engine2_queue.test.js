'use strict';
const assert=require('node:assert'),E=require('../unit_engine2_v1'),{create}=require('../unit_engine2_store_v1'),{makeFake}=require('./lib/fakefb'),{createWorker,configPath,key}=require('../functions/automation/worker'),{createEngine2Worker}=require('../functions/automation/engine2');
// Cursor-aware fixture, isolated from older tests whose fake intentionally ignores cursors.
function fixture(){
 let time=Date.parse('2026-10-22T04:00:00.000Z'),reads=0;const root=E.rootPath('gg01'),f=makeFake({fs:{[root]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01'}}}),original=f.fstore.collection.bind(f.fstore);
 const field=(d,k)=>k==='__name__'?d.id:k.split('.').reduce((o,k)=>o?.[k],d.data());
 function coll(path){const base=original(path);function query(filters=[],order=[],limit=Infinity,cursor=null){return{path,doc(id){const d=base.doc(id);d.collection=n=>coll(d.path+'/'+n);return d;},where:(...a)=>query([...filters,a],order,limit,cursor),orderBy:(k,dir)=>query(filters,[...order,[k,dir]],limit,cursor),limit:n=>query(filters,order,n,cursor),startAfter:(...c)=>query(filters,order,limit,c),async get(){
   let docs=(await base.get()).docs.filter(d=>filters.every(([k,op,v])=>{const x=field(d,k);return op==='=='?x===v:op==='>='?x>=v:op==='>'?x>v:op==='<='?x<=v:op==='<'?x<v:false}));
   const cmp=(a,b)=>{for(let i=0;i<order.length;i++){const[k,dir]=order[i],x=field(a,k),y=Array.isArray(b)?b[i]:field(b,k),c=x<y?-1:x>y?1:0;if(c)return dir==='desc'?-c:c;}return 0};
   docs.sort(cmp);if(cursor)docs=docs.filter(d=>cmp(d,cursor.length===1&&cursor[0]?.data?cursor[0]:cursor)>0);docs=docs.slice(0,limit);reads+=Math.max(1,docs.length);return{docs,size:docs.length,empty:!docs.length};}
  }}return query()}
 f.fstore.collection=coll;f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return coll(a.join('/')).doc(id)};
 const service=create({storeId:'gg01',fstore:f.fstore,now:()=>time});return{...f,root,service,readCount:()=>reads,advance:n=>{time+=n}};
}
(async()=>{
 {
  const f=fixture(),s=f.service;
  for(let i=0;i<123;i++)await f.fstore.doc('stock_transactions_gieogieo/finish_u'+String(i).padStart(3,'0')+'_WASTE').set({type:'WASTE',businessDate:'2026-10-20'});
  const j=await s.enqueue('bootstrap','settings_1');for(let i=0;i<3;i++)await s.drain(j);
  assert.equal(Object.keys(f.FS).filter(p=>p.startsWith(f.root+'/requests/finish~')).length,123);assert.equal(f.FS[f.root+'/requests/'+j].dirty,false);assert(f.FS[f.root].bootstrapFinishedAt);
  console.log('ok Bootstrap 123 nguồn qua ba trang, cursor tiếp tục và không bỏ sót/lặp trang đầu');
 }
 {
  const f=fixture(),s=f.service;f.FS[f.root].controlledItemIds=['j'];f.FS[f.root+'/controls/j']={level:2,itemName:'Thạch'};
  f.FS['stock_containers_gieogieo/u']={itemId:'j',status:'open',openedAt:'2026-10-22T03:00:00Z'};
  await s.opened('u');await s.opened('u');assert.equal(Object.keys(f.FS).filter(p=>p.startsWith(f.root+'/tasks/')).length,1);
  f.FS['employee_shifts_gieogieo/s']={employeeId:'a',roles:['barista'],checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T03:00:00.000Z'};
  f.FS[f.root+'/cases/new_overlap']={originKind:'finish',originId:'finish_u_WASTE',interval:{from:'2026-10-21T03:00:00.000Z',to:'2026-10-22T04:00:00.000Z'}};
  const job=await s.enqueue('discover_shift','s');await s.drain(job);assert(f.FS[f.root+'/requests/'+E.key('finish','finish_u_WASTE')]);
  console.log('ok Mã mở sau sự cố có việc cân bền, retry không đúp; ca bổ sung mới tìm đúng các khoảng bị ảnh hưởng');
 }
 {
  const f=fixture();let touched=0;const db=new Proxy(f.fstore,{get(o,k){if(k==='doc'||k==='collection')return(...a)=>{touched++;return o[k](...a)};return o[k]}}),w=createEngine2Worker({db,rt:f.db,FieldValue:f.FieldValue});
  for(let i=0;i<100;i++)await w.source('gg01','stock_transactions','bill_'+i,null,{type:'CONSUMPTION',qty:-25});assert.equal(touched,0);
  console.log('ok 100 dòng tiêu thụ bill không kích hoạt đọc hoặc query Engine2');
 }
 {
  const f=fixture();f.FS[configPath('gg01')]={enabled:true,mode:'active',fleet20Confirmed:true};const c={itemId:'j',status:'finished',needsReview:true,code:'JELLY001'};f.FS['stock_containers_gieogieo/u']=c;
  const worker=createWorker(f.fstore),caseId=E.key('finish','finish_u_WASTE');f.FS[f.root+'/cases/'+caseId]={originKind:'finish',containerId:'u',status:'decided',mode:'active',decisionId:'rev1',allocations:[{employeeId:'a',qty:300}]};
  await worker.processSource('gg01','stock_containers','u');const row=f.FS['duty_digests_gieogieo/_automation/cases/'+key('stock_containers','u')];assert.equal(row.rule,'ENGINE2_RESULT');assert.equal(row.group,'done');assert.equal(f.FS['stock_containers_gieogieo/u'].needsReview,true);assert.equal(f.FS['stock_containers_gieogieo/u'].status,'finished');
  f.FS[f.root+'/cases/'+caseId].status='voided';await worker.processSource('gg01','stock_containers','u');assert.equal(f.FS['duty_digests_gieogieo/_automation/cases/'+key('stock_containers','u')].rule,'LOT_REVIEW');
  console.log('ok Hộp thư theo quyết định E2 đã có hiệu lực; nguồn sửa rút liên kết, không sửa cờ nguồn hoặc đếm hao hụt lần hai');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
