'use strict';
const assert=require('node:assert'),{makeFake}=require('./lib/fakefb');
const {createWorker,rootPath,configPath}=require('../functions/automation/worker');
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
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
