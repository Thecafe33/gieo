'use strict';
const assert=require('node:assert'),vm=require('node:vm'),fs=require('node:fs');
const {makeFake}=require('./lib/fakefb');
const now=Date.parse('2026-10-22T12:00:00+07:00');
function fixture(seed={}){const fake=makeFake({fs:seed}),ctx={console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../unit_engine.v20.js'),'utf8'),ctx);const E=ctx.UnitEngine;E.init({fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,now:()=>now,storeId:'gg01',app:'quanly'});return {...fake,E};}
(async()=>{
 const f=fixture({'duty_cases_gieogieo/c':{status:'manual',manual:{by:'Chủ'},value:900,revision:4,allocations:[{employeeId:'a'}]},'duty_tasks_gieogieo/t':{caseId:'c',prepId:'p',status:'open',expireAt:'2026-10-01',firstAt:'2026-09-29'},'prep_items_gieogieo/p':{lastCount:{at:'2026-10-20',suspect:true}}});
 assert(await f.E.duty.expireTask('t'));assert.equal(f.FS['duty_cases_gieogieo/c'].status,'manual');assert.equal(f.FS['prep_items_gieogieo/p'].lastCount.suspect,true);
 console.log('ok Hết hạn không đổi quyết định tay hoặc mốc cân mới');
 const g=fixture({'duty_cases_gieogieo/c':{status:'pending_verify',variance:-10,value:100,allocations:[{employeeId:'a'}]},'duty_tasks_gieogieo/t':{caseId:'c',prepId:'p',status:'processing',processingAt:new Date(now).toISOString(),expireAt:'2026-10-01'}});
 assert.equal(await g.E.duty.expireTask('t'),false);assert.equal(g.FS['duty_cases_gieogieo/c'].status,'pending_verify');
 console.log('ok Không hết hạn lượt cân đang giữ lease hợp lệ');
 const h=fixture({'duty_cases_gieogieo/c':{status:'contested',createdAt:'2026-10-01',contest:{at:'2026-10-02'},variance:-10,value:500,revision:2,allocations:[{employeeId:'a',qty:-10,value:500}]}});
 assert.equal(await h.E.duty.closePolicy('c',{expectedRevision:1}),false);
 assert(await h.E.duty.closePolicy('c',{expectedRevision:2}));assert.equal(h.FS['duty_cases_gieogieo/c'].value,500);assert.equal(h.FS['duty_cases_gieogieo/c'].allocations.length,0);assert.equal(h.FS['duty_cases_gieogieo/c'].pool[0].value,500);assert.equal(h.FS['duty_cases_gieogieo/c'].history[0].before.allocations[0].employeeId,'a');
 assert.equal(await h.E.duty.closePolicy('c',{expectedRevision:3}),false);
 console.log('ok Đóng theo chính sách giữ tiền/lịch sử, không tăng độ tin cậy, có CAS');
 const m=fixture({'stock_transactions_gieogieo/w':{type:'WASTE',responsibility:{status:'assigned_by_manager',employeeId:'b'}}});
 assert.equal(await m.E.ledger.annotateAuto('w',{responsibility:{status:'auto',employeeId:'a'}},{expectedRevision:0}),false);assert.equal(m.FS['stock_transactions_gieogieo/w'].responsibility.employeeId,'b');
 assert.equal(m.E.duty.wasteDecision({staff:'a',reason:'đổ'}).allocations.length,0);
 assert.equal(m.E.duty.wasteDecision({reason:'hỏng'},{verified:{byId:'a',employeeId:'a'}}).allocations.length,0);
 console.log('ok WASTE không suy lỗi từ người báo, xác minh phải khác người nhận trách nhiệm');
 const race=fixture({'duty_config_gieogieo/current':{fleetCompliant:true},'prep_items_gieogieo/p':{currentStock:10,costPerUnit:2},'duty_cases_gieogieo/c':{status:'pending_verify',revision:1,variance:-2,value:4},'duty_tasks_gieogieo/t':{status:'open',caseId:'c',prepId:'p',firstById:'a',firstBy:'A',firstAt:'2026-10-01',countedQty:0,bookBeforeCount:0,usageBase:1}});
 const run=race.fstore.runTransaction.bind(race.fstore);let injected=false;
 race.fstore.runTransaction=fn=>run(t=>{const get=t.get;t.get=async r=>{if(!injected&&r.path==='duty_cases_gieogieo/c'&&race.FS['prep_items_gieogieo/p'].lastCount?.kind==='verify'){injected=true;await race.fstore.collection('duty_cases_gieogieo').doc('c').update({status:'manual',manual:{by:'Chủ'},revision:2,allocations:[{employeeId:'bossChoice'}]});}return get(r)};return fn(t)});
 await race.E.duty.verifyCommit({prepId:'p',activeBatches:[],batchQty:{},snaps:{}},{id:'t',...race.FS['duty_tasks_gieogieo/t']},{now:new Date(now).toISOString(),businessDate:'2026-10-22',staff:{id:'b',fullName:'B'}});
 assert(injected);assert.equal(race.FS['duty_cases_gieogieo/c'].status,'manual');assert.equal(race.FS['duty_cases_gieogieo/c'].allocations[0].employeeId,'bossChoice');assert.equal(race.FS['duty_tasks_gieogieo/t'].status,'done');
 console.log('ok Chủ quyết tay giữa lượt cân lại vẫn giữ quyết định khi xác minh chốt xong');

 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
