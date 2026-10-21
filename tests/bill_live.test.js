// Một ngày/điểm: baseline được chia sẻ; add/change/delete không đọc lại node hay quán khác.
'use strict';
const assert=require('assert/strict');const BillLive=require('../bill_live.v1.js');
const refs=new Map();let reads=0;
const db={ref(path){if(refs.has(path))return refs.get(path);let rows={},fail,resolve;const handlers={};
 const ref={rows, on(ev,fn,err){(handlers[ev]||(handlers[ev]=new Set())).add(fn);if(err)fail=err},off(ev,fn){handlers[ev]?.delete(fn)},once(){reads++;return new Promise(r=>resolve=r)},emit(ev,key,o){if(ev==='child_removed')delete rows[key];else rows[key]=o;for(const fn of handlers[ev]||[])fn({key,val:()=>o})},ready(){resolve({val:()=>({...rows})})},fail(e){fail(e)},size(){return Object.values(handlers).reduce((n,s)=>n+s.size,0)}};refs.set(path,ref);return ref}};
(async()=>{
 const opts={id:'gg01',day:'2026-10-17',db,path:'gg01/oct/17'},events=[];
 const baseline=BillLive.read(opts),stop=BillLive.listen(opts,(t,k,o)=>events.push([t,k,o?.total]));
 const r=refs.get(opts.path);r.emit('child_added','a',{date:'17/10/2026',total:100});r.emit('child_added','old',{date:'17/10/2025',total:999});
 // Delta arrives while initial read is pending, must survive baseline completion.
 r.emit('child_changed','a',{date:'17/10/2026',total:150});r.ready();await baseline;await Promise.resolve();
 assert.equal(reads,1);assert.deepEqual(events,[['add','a',150],['ready',null,undefined]]);
 assert.equal(BillLive.snapshot('gg01',opts.day).a.total,150);
 r.emit('child_added','b',{total:200});r.emit('child_added','b',{total:200});
 assert.equal(events.filter(e=>e[1]==='b').length,1);assert.equal(reads,1);
 r.emit('child_removed','a');assert.deepEqual(Object.keys(BillLive.snapshot('gg01',opts.day)),['b']);
 r.emit('child_changed','b',{date:'17/10/2025',total:300});assert.deepEqual(BillLive.snapshot('gg01',opts.day),{});
 const other={...opts,id:'gg02',path:'gg02/oct/17'};const p=BillLive.read(other);refs.get(other.path).emit('child_added','c',{total:450});refs.get(other.path).ready();await p;
 r.emit('child_added','z',{total:50});assert.equal(BillLive.snapshot('gg02',opts.day).c.total,450);assert.equal(reads,2);
 const count=events.length;stop();r.emit('child_changed','z',{total:60});assert.equal(events.length,count);
 BillLive.drop(opts.id,opts.day);assert.equal(r.size(),0);assert.equal(BillLive.snapshot(opts.id,opts.day),null);
 BillLive.drop(other.id,other.day);
 const errOpts={...opts,id:'error',path:'error/oct/17'};const rejected=BillLive.read(errOpts).catch(e=>e.message);refs.get(errOpts.path).fail(new Error('mất quyền đọc'));
 assert.equal(await rejected,'mất quyền đọc');assert.equal(refs.get(errOpts.path).size(),0);
 const retry=BillLive.read(errOpts);refs.get(errOpts.path).ready();await retry;assert.deepEqual(BillLive.snapshot('error',opts.day),{});BillLive.drop('error',opts.day);
 const cancelled=BillLive.read({...opts,id:'cancel',path:'cancel/oct/17'}).catch(e=>e.message);BillLive.drop('cancel',opts.day);assert.equal(await cancelled,'Đã gỡ nguồn bill');

 // TC33 giữ đúng fallback archive của POS khi RT hôm nay rỗng; có RT thì ưu tiên RT.
 let currentRows={};
 const summarize=orders=>orders.reduce((n,o)=>n+o.total,0);
 const summary=new Function('window','_tcTodayArchive','_tcLegacy','_tcMenu','tcSummarize','xoSummarize','ggSummarize','dkey','mcAttach',require('./lib/extract').extract('manage.html',['billLiveSummary'])+';return billLiveSummary')({BillLive:{snapshot:()=>currentRows}},{day:opts.day,orders:[{total:175}]},[],[],summarize,summarize,summarize,()=>opts.day,(_id,orders)=>summarize(orders));
 assert.equal(await summary('tc33',opts.day),175);
 currentRows={newBill:{total:250}};assert.equal(await summary('tc33',opts.day),250);
 currentRows={};assert.equal(await summary('tc33',opts.day),175);
 console.log('ok baseline dùng chung; delta trong lúc tải; bill lặp; sửa/xoá cả bill đầu; lọc năm; cách ly quán; gỡ listener');
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e);process.exitCode=1});
