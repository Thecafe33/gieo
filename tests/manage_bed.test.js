const assert=require('assert/strict'),{extract}=require('./lib/extract');
const state={day:'2026-10-19',data:{}};
const api=new Function('BED_LIVE',extract('manage.html',['bedCreatedMs','bedRows'])+';return {bedRows,bedCreatedMs}')(state);
state.data={'2026-10-19':{w:{bedId:'WAITING',status:'pending',name:'Khách',createdAt:'2026-10-19T09:00:00+07:00'},a:{bedId:1,status:'active',start:'09:00',end:'10:00'},o:{bedId:2,status:'đang dùng',start:'08:00',end:'09:00'},done:{status:'đã xong'},cancel:{status:'đã hủy'}},'2026-10-18':{night:{status:'active',bedId:3,start:'23:00',end:'10:00'},old:{bedId:'WAITING'}}};
const r=api.bedRows(Date.parse('2026-10-19T09:30:00+07:00'));
assert.equal(r.waiting.length,1);assert.equal(r.active.length,3);assert.equal(r.active.find(b=>b.id==='a').left,30);assert.equal(r.active.find(b=>b.id==='o').left,-30);assert.equal(r.active.find(b=>b.id==='night').left,30);assert.equal(api.bedCreatedMs({id:'unknown'}),null);
console.log('ALL PASS 6');
