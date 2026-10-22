'use strict';
const assert=require('node:assert'),{makeFake}=require('./lib/fakefb');
const {createWorker,rootPath,configPath,key}=require('../functions/automation/worker');
// Cursor-capable fixture: the old general fake intentionally does not implement startAfter.
const f=makeFake({fs:{[configPath('gg01')]:{enabled:true,mode:'shadow',startDate:'2026-10-01'}}});
const coll=f.fstore.collection.bind(f.fstore);let reads=0;
f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return coll(a.join('/')).doc(id);};
f.fstore.collection=path=>{
 const base=coll(path);
 function query(filters=[],order=[],limit=Infinity,cursor=null){return {
  doc:id=>base.doc(id),where:(...a)=>query([...filters,a],order,limit,cursor),orderBy:(k,d)=>query(filters,[...order,[k,d]],limit,cursor),limit:n=>query(filters,order,n,cursor),startAfter:c=>query(filters,order,limit,c),
  get:async()=>{let docs=(await base.get()).docs.filter(d=>filters.every(([k,op,v])=>{const a=d.data()[k];return op==='=='?a===v:op==='>='?a>=v:op==='<='?a<=v:op==='>'?a>v:false}));
   const cmp=(a,b)=>{for(const[k,dir]of order){const x=k==='__name__'?a.id:a.data()[k],y=k==='__name__'?b.id:b.data()[k],c=x<y?-1:x>y?1:0;if(c)return dir==='desc'?-c:c;}return a.id.localeCompare(b.id)};
   docs.sort(cmp);if(cursor)docs=docs.filter(d=>cmp(d,cursor)>0);docs=docs.slice(0,limit);reads+=Math.max(1,docs.length);return{docs};}
 };}return query();
};
const tx=f.fstore.runTransaction.bind(f.fstore);f.fstore.runTransaction=fn=>tx(t=>{const get=t.get;t.get=async r=>{reads++;return get(r)};return fn(t)});
(async()=>{
 for(let i=0;i<205;i++)await coll('alerts_gieogieo').doc(String(i).padStart(4,'0')).set({status:'new',type:'custom',businessDate:'2026-10-20'});
 const w=createWorker(f.fstore,{now:()=>Date.parse('2026-10-22T00:00:00Z')});
 for(let i=0;i<4;i++)await w.tickStore('gg01');
 assert(f.FS[rootPath('gg01')].ready);assert.equal(f.FS[rootPath('gg01')].counts.working,205);
 const revisions=Object.entries(f.FS).filter(([p])=>p.startsWith(rootPath('gg01')+'/cases/')&&!p.includes('/history/')).map(([,v])=>v.revision);
 assert.equal(revisions.length,205);assert(revisions.every(r=>r===1));
 console.log('ok Khởi tạo 205 hồ sơ qua nhiều trang và nhiều nhịp, không lặp trang đầu/không bỏ sót');
 console.log('ok Đo fixture: '+reads+' lượt đọc tài liệu hoặc query rỗng (gồm khởi tạo và transaction; không phải số đo Firebase production)');
 // Existing v1 cases must be re-evaluated, not only recounted after an upgrade.
 const root=rootPath('gg01'),source='stock_containers_gieogieo/finished_review',casePath=root+'/cases/'+key('stock_containers','finished_review');
 await f.fstore.doc(source).set({status:'finished',needsReview:true,code:'NL-CU'});
 await f.fstore.doc(casePath).set({visible:true,group:'done',kind:'stock_containers',sourceId:'finished_review',rule:'LOT_COMPLETE',fingerprint:'v1',revision:1});
 await f.fstore.doc(root).set({ready:true,bootstrapPolicyVersion:1,countsVerifiedVersion:1,counts:{working:205,done:1}},{merge:true});
 for(let i=0;i<4;i++)await w.tickStore('gg01');
 assert.equal(f.FS[casePath].group,'working');assert.equal(f.FS[casePath].rule,'LOT_REVIEW');
 assert.equal(f.FS[root].counts.working,206);assert.equal(f.FS[root].counts.done,0);assert.equal(f.FS[root].countsVerifiedVersion,3);
 const revision=f.FS[casePath].revision,beforeTick=reads;await w.tickStore('gg01');
 assert.equal(f.FS[casePath].revision,revision);assert(reads-beforeTick<20,'Không chạy lại bootstrap nguồn sau khi đã nâng phiên bản xong');
 console.log('ok Nâng v1→v3 sửa hồ sơ cũ qua bootstrap có cursor; chỉ xác nhận badge khi hoàn tất và không quét nguồn lặp lại');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
