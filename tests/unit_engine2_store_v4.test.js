'use strict';
// Store Engine 2 v4 (05/11/2026, worker dùng; POS vẫn store v3): F1 không tạo việc cân mồ côi (baseline~ / handover~ / opened~),
// F2 dọn việc treo trong lượt học TRƯỚC khi xét hạ mức, giảm đọc (nhịp không đọc trước, thử lại giãn dần, opened kiểm công tắc trước).
//  1. 10 bộ test cũ (store v1 + nhân sự v2) trên v4 với công tắc legacyWeighTasks ÉP BẬT → giống hệt bản cũ (F1 chỉ tắt đúng các việc đó).
//  2. Bộ POS v3 (giao lượt cân, POS tự ghi, nhịp…) trên v4 mặc định → các hàm POS gọi không đổi.
//  3. Hành vi mặc định của v4 + đếm lượt đọc.
const assert=require('node:assert'),path=require('node:path'),{spawnSync}=require('node:child_process');
const E=require('../unit_engine2_v1');
const {create}=require('../unit_engine2_store_v4');
const {makeFake}=require('./lib/fakefb');
const run=(alias,t)=>spawnSync(process.execPath,['-r',path.join(__dirname,'lib',alias),path.join(__dirname,t+'.test.js')],{env:{...process.env,E2_STORE:'v2'},encoding:'utf8'});
for(const t of ['unit_engine2','unit_engine2_alert_review','unit_engine2_mixup','unit_engine2_prep_review','unit_engine2_queue','unit_engine2_review_fixes','unit_engine2_runtime','unit_engine2_spec','unit_engine2_sub_review','unit_engine2_staffing']){
 const r=run('alias_store_v4_legacy.js',t);assert.equal(r.status,0,t+' trên store v4 (bật lại việc cũ):\n'+(r.stdout+r.stderr).split('\n').slice(-12).join('\n'));
}
console.log('ok 1. 10 bộ test cũ đạt trên v4 khi bật lại việc cũ — F1 chỉ tắt đúng baseline~ / handover~ / opened~');
{const r=run('alias_store_v4.js','engine2_pos_v3');assert.equal(r.status,0,'engine2_pos_v3 trên store v4:\n'+(r.stdout+r.stderr).split('\n').slice(-12).join('\n'));}
console.log('ok 2. Bộ POS v3 đạt trên store v4 (giao lượt cân, POS tự ghi, nhịp — POS vẫn nạp store v3, hàm giống hệt)');

// Bộ đếm lượt đọc quanh Firestore giả: mọi .get() trên tham chiếu / truy vấn và t.get() trong transaction.
function counted(fs){
 const c={n:0};
 const wrap=o=>new Proxy(o,{get(target,k){
  const v=target[k];if(typeof v!=='function')return v;
  if(k==='get')return (...a)=>{c.n++;return v.apply(target,a);};
  if(k==='runTransaction')return fn=>v.call(target,t=>fn(new Proxy(t,{get(tt,kk){const vv=tt[kk];return kk==='get'?(...a)=>{c.n++;return vv.apply(tt,a);}:typeof vv==='function'?vv.bind(tt):vv;}})));
  return (...a)=>{const r=v.apply(target,a);return r&&typeof r==='object'&&typeof r.then!=='function'?wrap(r):r;};
 }});
 return {fs:wrap(fs),c};
}
const ROOT=E.rootPath('gg01'),NOW=Date.parse('2026-10-26T03:00:00.000Z'),ago=d=>new Date(NOW-d*86400000).toISOString();
const cfg0={enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j'],settingsRevision:1,revision:7};
function world(extra={}){
 const f=makeFake({fs:{[ROOT]:{...cfg0},[ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1},
  'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',status:'open',openedAt:ago(0.1)},
  'employee_shifts_gieogieo/sa':{employeeId:'a',employeeName:'a',roles:['barista'],checkedInAt:ago(0.4),checkedOutAt:new Date(NOW-60000).toISOString()},...extra}});
 const {fs,c}=counted(f.fstore);return {f,c,s:create({storeId:'gg01',fstore:fs,now:()=>NOW})};
}
const tasks=f=>Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/tasks/')).map(([p,t])=>({...t,id:p.split('/').pop()}));
(async()=>{
 // ── F1 ──────────────────────────────────────────────────────────────────────────────────────────────
 {
  const {f,c,s}=world();
  await s.opened('n');
  assert.equal(tasks(f).length,0,'mã mới mở: không tạo việc cân «opened~» (POS không có chỗ làm)');
  assert.equal(c.n,1,'opened chỉ đọc tài liệu điều khiển — KHÔNG đọc mã khi việc đã tắt');
  await s.handover('sa');
  assert(!tasks(f).some(t=>/^handover~/.test(t.id)),'pha chế check-out: không tạo việc cân giao ca cho từng món kiểm soát');
  assert(Object.keys(f.FS).some(p=>p.startsWith(ROOT+'/requests/recompute_shift~')),'phần còn lại của giao ca (tính lại trách nhiệm theo ca) vẫn chạy');
  // bật lại công tắc → tạo như cũ
  const g=world();g.f.FS[ROOT].legacyWeighTasks=true;await g.s.opened('n');await g.s.handover('sa');
  assert(tasks(g.f).some(t=>/^opened~/.test(t.id))&&tasks(g.f).some(t=>/^handover~/.test(t.id)),'legacyWeighTasks=true → tạo như cũ');
 }
 {
  // Hồ sơ hao hụt (báo hết còn dư) vẫn nâng mức kiểm soát + đưa món vào danh sách cân cuối ngày, nhưng không tạo việc «baseline~».
  const start='2026-10-14T07:17:00.000Z',end='2026-10-22T02:49:00.000Z';
  const sh=['a','b'].map((id,i)=>({employeeId:id,employeeName:id,roles:['barista'],checkedInAt:'2026-10-1'+(5+i)+'T02:30:00.000Z',checkedOutAt:'2026-10-1'+(5+i)+'T13:00:00.000Z'}));
  const f=makeFake({fs:{[ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01'},
   'stock_transactions_gieogieo/finish_u_WASTE':{itemId:'jelly',referenceId:'u',type:'WASTE',qty:-300,createdAt:end,businessDate:'2026-10-22',note:'Báo hết'},
   'stock_containers_gieogieo/u':{itemId:'jelly',itemName:'Thạch',unit:'g',baseQty:500,openedAt:start,finishedAt:end,status:'finished',wasteBase:300,wasteBasis:'unit_engine'},
   'inventory_items_gieogieo/jelly':{name:'Thạch',unit:'g',costPerUnit:100},'price_history_gieogieo/price':{itemId:'jelly',effectiveFrom:'2026-09-01',price:100},
   ...Object.fromEntries(sh.map((x,i)=>['employee_shifts_gieogieo/s'+i,x]))}});
  const s=create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(end)+1000});
  const out=await s.finish('finish_u_WASTE');assert.equal(out.status,'decided');
  assert.equal(f.FS[ROOT+'/controls/jelly'].level,2,'vẫn nâng mức kiểm soát');assert.deepEqual(f.FS[ROOT].controlledItemIds,['jelly'],'vẫn vào danh sách cân cuối ngày');
  assert.equal(Object.keys(f.FS).filter(p=>p.startsWith(ROOT+'/tasks/')).length,0,'không tạo việc «baseline~» (POS không có chỗ làm)');
 }
 // ── F2: dọn việc treo — một truy vấn, ghi gộp, không đọc lại từng việc ────────────────────────────────────
 {
  const T=(id,o)=>({[ROOT+'/tasks/'+id]:{itemId:'j',kind:'weigh_open_units',status:'queued',pending:true,revision:1,...o}});
  const {f,c,s}=world({
   ...T('handover~sa~j~x',{createdAt:ago(0.01)}),...T('opened~n~1',{createdAt:ago(0.2)}),...T('baseline~cases1',{createdAt:ago(5)}),
   ...T('tare~1',{kind:'tare_check',createdAt:ago(1)}),
   ...T(E.key('day_close','2026-10-25','j','c'),{createdAt:ago(1),businessDate:'2026-10-25'}),
   ...T(E.key('day_close','2026-10-21','j','c'),{createdAt:ago(5),businessDate:'2026-10-21'}),
   ...T('m0~fresh',{sampling:'random_m0',createdAt:ago(1)}),...T('m3~old',{sampling:'m3',status:'retry_wait',createdAt:ago(4)}),
   ...T('busy~old',{status:'in_progress',createdAt:ago(9)}),
  });
  const n=await s.sweepStaleTasks(f.FS[ROOT]);
  const byId=Object.fromEntries(tasks(f).map(t=>[t.id,t]));
  for(const id of ['handover~sa~j~x','opened~n~1','baseline~cases1','tare~1',E.key('day_close','2026-10-21','j','c'),'m3~old'])
   assert(byId[id].status==='cancelled'&&byId[id].pending===false&&byId[id].expired.reason,'đóng kèm lý do: '+id+' → '+JSON.stringify(byId[id].expired));
  assert(/Không có chỗ làm/.test(byId['handover~sa~j~x'].expired.reason)&&/Quá hạn 3 ngày/.test(byId['m3~old'].expired.reason));
  for(const id of [E.key('day_close','2026-10-25','j','c'),'m0~fresh'])assert(byId[id].pending===true&&byId[id].status==='queued','việc còn hạn giữ nguyên: '+id);
  assert(byId['busy~old'].status==='in_progress'&&byId['busy~old'].pending,'việc đang xử lý một lượt cân không đụng');
  assert.equal(n,6);assert.equal(c.n,1,'dọn việc: đúng MỘT lượt truy vấn, không đọc lại từng việc (ghi gộp một batch)');
  assert.equal(f.FS[ROOT].revision,7,'không tăng revision (POS không phải xác nhận lại)');
  const g=world({...T('tare~1',{kind:'tare_check',createdAt:ago(1)})});g.f.FS[ROOT].diagTasks=true;await g.s.sweepStaleTasks(g.f.FS[ROOT]);
  assert(tasks(g.f)[0].pending,'cfg.diagTasks=true → việc chẩn đoán có chỗ làm, không đóng');
 }
 {
  // Tình huống thật (đã tái hiện trên v3): cân cuối ngày xong → đóng ngày tự check-out → việc giao ca treo → lượt học 00:xx thấy
  // «món còn việc chờ» nên không bao giờ hạ mức. v4: không tạo việc đó; việc cũ còn treo bị dọn TRƯỚC khi xét hạ mức.
  const src=require('fs').readFileSync(path.join(__dirname,'../unit_engine2_store_v4.js'),'utf8'),body=src.slice(src.indexOf('async function learnDay('));
  assert(body.indexOf('sweepStaleTasks(cfg)')>0&&body.indexOf('sweepStaleTasks(cfg)')<body.indexOf("where('pending','==',true).limit(1)"),'lượt học dọn việc treo TRƯỚC truy vấn chặn hạ mức');
  const {f,s}=world({[ROOT+'/tasks/handover~sa~j~old']:{itemId:'j',kind:'weigh_open_units',status:'queued',pending:true,createdAt:ago(0.05)}});
  await s.sweepStaleTasks(f.FS[ROOT]);
  const q=await s.sub('tasks').where('itemId','==','j').where('pending','==',true).limit(1).get();
  assert.equal(q.docs.length,0,'sau khi dọn: truy vấn chặn hạ mức không còn thấy việc treo');
 }
 // ── Giảm đọc: nhịp ghi thẳng, thử lại giãn dần ─────────────────────────────────────────────────────────────
 {
  const {f,c,s}=world();
  assert.equal(await s.heartbeat(),true);assert.equal(f.FS[ROOT].workerHeartbeatAt,new Date(NOW).toISOString());assert.equal(f.FS[ROOT].workerStoreVersion,4);
  assert.equal(c.n,0,'nhịp «còn sống» không đọc trước khi ghi');assert.equal(f.FS[ROOT].revision,7,'nhịp không tăng revision');
  const g=makeFake({fs:{}});const s2=create({storeId:'gg01',fstore:g.fstore,now:()=>NOW});
  assert.equal(await s2.heartbeat(),false,'chưa có tài liệu điều khiển → không tự tạo');assert.equal(Object.keys(g.FS).length,0);
 }
 {
  // Việc nền lỗi mãi: lần thử kế tiếp giãn 1, 2, 4, 8 … phút, tối đa 6 giờ (trước: mỗi phút, mãi mãi).
  let t=NOW;const f=makeFake({fs:{[ROOT]:{...cfg0}}});const s=create({storeId:'gg01',fstore:f.fstore,now:()=>t});
  const id=await s.enqueue('opened','khong_co');const ref=ROOT+'/requests/'+id;
  const realGet=f.fstore.collection;let boom=true;
  f.fstore.collection=function(name){const c=realGet.call(this,name);if(boom&&/stock_containers/.test(name)){const d=c.doc.bind(c);c.doc=x=>{const r=d(x);r.get=async()=>{throw Error('lỗi đọc thử');};return r;};}return c;};
  f.FS[ROOT].legacyWeighTasks=true;   // để opened() đi tới bước đọc mã (bị gây lỗi)
  const gaps=[];
  for(let i=0;i<12;i++){await s.drain(id).catch(()=>{});const j=f.FS[ref];gaps.push(Math.round((j.nextTryAt-t)/60000));t=j.nextTryAt;}
  assert.deepEqual(gaps.slice(0,6),[1,2,4,8,16,32],'giãn dần');assert(gaps.slice(-3).every(m=>m===360),'tối đa 6 giờ: '+gaps);
  assert.equal(f.FS[ref].attempt,12);assert.equal(f.FS[ref].dirty,true,'vẫn còn trong hàng đợi (không bỏ việc)');
  boom=false;await s.drain(id);assert.equal(f.FS[ref].dirty,false,'hết lỗi → xử lý xong');
 }
 {
  const w=require('fs').readFileSync(path.join(__dirname,'../functions/automation/engine2.js'),'utf8');
  assert(/require\('\.\/shared\/unit_engine2_store_v4'\)/.test(w),'worker dùng store v4');
  assert.equal(require('fs').readFileSync(path.join(__dirname,'../functions/automation/shared/unit_engine2_store_v4.js'),'utf8'),require('fs').readFileSync(path.join(__dirname,'../unit_engine2_store_v4.js'),'utf8'),'bản Functions khớp gốc');
 }
 console.log('ok 3. v4 mặc định: không tạo việc mồ côi; dọn việc treo (1 truy vấn, ghi gộp) trước khi xét hạ mức; nhịp không đọc trước; thử lại giãn dần tới 6 giờ');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1);});
