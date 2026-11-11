'use strict';
// Cầu nối POS v5 + store v5 (11/11/2026, docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md) — phần MỚI so với v4 (kịch bản cũ chạy lại ở engine2_pos_v5.test.js):
//  B1 việc cân cuối ngày: một transaction, nhớ trong ngày · B2 mỗi dòng một vòng mạng với Engine 2 · B3 dùng danh sách worker công bố ·
//  B4 người kết ca hôm trước nhớ ở máy · B5 TRẦN THỜI GIAN chờ: mạng treo → POS tự ghi, lượt nhận muộn được rút lại.
// Ưu tiên của chủ dự án: nhân viên không chờ vô nghĩa; không luồng riêng; không giải thích.
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../unit_engine2_v1');
const Store=require('../unit_engine2_store_v5');
const {makeFake}=require('./lib/fakefb');
const {createEngine}=require('../functions/automation/engine');
const {run,ketCa}=require('../tools/automation/engine2_do_tai');
const ROOT=E.rootPath('gg01'),DAY='2026-10-22',NOW=Date.parse('2026-10-22T04:00:00Z'),SRC=fs.readFileSync(path.join(__dirname,'../gieo_engine2_pos_v5.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ITEMS=['j','k'].map((id,i)=>({id,name:['Thạch','Cà phê'][i],unit:'g',trackingMode:'unit',stockManaged:true,currentStock:400,costPerUnit:100,packagingUnits:[]}));
function world(extra={},root={}){
 const unit=code=>({code,unitBase:400,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')});
 return makeFake({rt:{active_units_gieogieo:{j:{n:unit('NEXT0001')},k:{k1:unit('KOPI0001')}}},fs:{
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j','k'],settingsRevision:3,revision:1,workerHeartbeatAt:new Date().toISOString(),...root},
  [ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1},[ROOT+'/controls/k']:{level:2,itemId:'k',itemName:'Cà phê',revision:1},
  'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:400,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
  'stock_containers_gieogieo/k1':{itemId:'k',itemName:'Cà phê',unit:'g',status:'open',baseQty:500,unitBase:400,openedAt:'2026-10-21T03:00:00Z',code:'KOPI0001'},
  'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
  'employee_shifts_gieogieo/b':{employeeId:'b',employeeName:'b',roles:['barista'],businessDate:DAY,checkedInAt:DAY+'T02:00:00.000Z',checkedOutAt:DAY+'T13:00:00.000Z'},
  ...Object.fromEntries(ITEMS.map(i=>['inventory_items_gieogieo/'+i.id,i])),...extra}});
}
async function load(f,{today=[]}={}){
 const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>NOW,items:ITEMS}),g=globalThis;
 g.window=g;g.document={readyState:'complete'};g.addEventListener=()=>{};g.localStorage=g.__ls||{s:{},getItem(k){return this.s[k]??null;},setItem(k,v){this.s[k]=String(v);},removeItem(k){delete this.s[k];}};
 g.UnitEngine2=E;g.UnitEngine2Store=Store;g.UnitEngine2Staffing=require('../unit_engine2_staffing_v1');g.fstore=f.fstore;g.db=f.db;g.POS_STORE={storeId:'gg01'};g.GieoData={collFor:n=>f.fstore.collection(n)};
 g.UnitEngine={VERSION:inv.VERSION,clock:{now:()=>NOW},units:inv.units,shift:{...inv.shift}};
 g.KHO_ITEMS_CACHE=clone(ITEMS);g.shiftState={businessDate:DAY};g.posDateKey=d=>d?new Date(d.getTime()+7*3600000).toISOString().slice(0,10):DAY;g.ensureKhoItemsPOS=async()=>{};g.toast=()=>{};
 g.shiftWeighIsTemItemPOS=it=>it.trackingMode==='unit';
 g.shiftWeighTemLinePOS=(it,node,reasons)=>{const open=Object.entries(node||{}).filter(([id,v])=>v&&!v.finishedDebt).map(([id,v])=>({id,code:v.code,openedAt:v.openedAt,capacity:v.capacity,state:'pending'}));return open.length?{itemId:it.id,itemName:it.name,unit:it.unit,mode:'tem',layer:'config',reasons,units:open}:null;};
 g.shiftWeighLineHTML=l=>JSON.stringify({reasons:l.reasons||[]});g._employeeShiftsTodayCache=today;g.loadEmployeeShiftsTodayCache=async()=>{};
 g.computeHandoverOpenLinesPOS=async()=>[{itemId:'x'}];g.computeShiftInventoryCountLinesPOS=async()=>[];
 delete g.GieoEngine2POS;vm.runInThisContext(SRC);await g.computeShiftInventoryCountLinesPOS('khoi_tao');await sleep(30);
 return inv;
}
const fill=(f,inv,l)=>{const live=f.rtGet('active_units_gieogieo/'+l.itemId+'/'+l.units[0].id);l.units=[{id:l.units[0].id,code:live.code,openedAt:live.openedAt,capacity:500,state:'confirmed',confirmVia:'scan',manualReason:'',weighed:380,baseline:400,baselineSig:inv.shift.absSig(live),
 countedAt:new Date(NOW-60000).toISOString(),seq:0,gone:false,weighings:[{vesselId:'v',vesselName:'Hũ',variantId:'a',tareG:100,grossG:480}]}];return l;};
const txCount=f=>{let n=0;const rt=f.fstore.runTransaction;f.fstore.runTransaction=fn=>{n++;return rt.call(f.fstore,fn);};return ()=>n;};
(async()=>{
 // ── Không giao diện / không giải thích (ưu tiên 3, 4) ───────────────────────────────────────────────────────
 for(const bad of ['e2Modal','e2-dialog','innerHTML','Vì sao cần cân','document.createElement','toast(','alert(','confirm('])assert(!SRC.includes(bad),'cầu nối v5 không được có giao diện / lời giải thích: '+bad);
 {const h=fs.readFileSync(path.join(__dirname,'../posgieo.html'),'utf8');
  assert(/gieo_engine2_pos_v5\.js/.test(h)&&!/gieo_engine2_pos_v[1234]\.js/.test(h),'posgieo.html nạp cầu nối v5');
  assert(/unit_engine2_store_v5\.js/.test(h)&&!/unit_engine2_store_v[1234]\.js/.test(h),'posgieo.html nạp store v5');}
 console.log('ok 0. Cầu nối v5: không giao diện, không lời giải thích; posgieo nạp v5');

 // ── B1 ─────────────────────────────────────────────────────────────────────────────────────────────────────
 {
  const f=world();await load(f);const n=txCount(f);
  const a=await computeShiftInventoryCountLinesPOS('close');
  assert.deepEqual(a.map(l=>l.itemId).sort(),['j','k']);assert(a.every(l=>l.e2&&l.e2.taskId===E.key('day_close',DAY,l.itemId,'c')),'cả hai món kiểm soát có dấu ngầm');
  assert.equal(n(),1,'việc cân cuối ngày của MỌI món tạo trong MỘT transaction (đo: '+n()+')');
  for(const id of ['j','k'])assert.equal(f.FS[ROOT+'/tasks/'+E.key('day_close',DAY,id,'c')].status,'queued');
  const b=await computeShiftInventoryCountLinesPOS('close');
  assert.equal(n(),1,'dựng lại danh sách trong ngày: không hỏi lại việc đã có');assert.deepEqual(b.map(l=>l.e2.taskId),a.map(l=>l.e2.taskId),'dấu ngầm giữ nguyên');
  assert(a.every(l=>(l.reasons||[]).length===0),'dòng thêm không kèm lý do');
 }
 console.log('ok 1. B1 — việc cân cuối ngày: một transaction cho mọi món, dựng lại danh sách không hỏi lại');

 // ── B2: một vòng mạng mỗi dòng, kết quả y hệt (kho ghi một lần, worker ghi nốt) ───────────────────────────────
 {
  const f=world(),inv=await load(f);const lines=await computeShiftInventoryCountLinesPOS('close');
  const n=txCount(f),l=fill(f,inv,lines.find(x=>x.itemId==='j'));let gets=0;const mcoll=f.fstore.collection;
  f.fstore.collection=function(name){const c=mcoll.apply(this,arguments);return c;};
  await UnitEngine.shift.applyLine(l,DAY,{id:'b',fullName:'B'});await sleep(20);
  assert(l.engine2Owner&&/^e2sw_/.test(l.engine2OpId),'dòng được giao cho Engine 2 với mã lượt');
  const ms=Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/measurements/'));assert.equal(ms.length,1);assert.equal(ms[0][1].status,'queued');
  const job=f.FS[ROOT+'/requests/'+E.key('measurement',ms[0][0].split('/').pop())];
  assert(job&&job.dirty===true&&job.kind==='measurement'&&job.revision===1,'lượt cân đã XẾP HÀNG ngay trong transaction xin lượt (revision 1 — không xếp hai lần)');
  assert.equal(f.rtGet('active_units_gieogieo/j/n').unitBase,380,'kho do POS áp một lần');
  const w=Store.create({storeId:'gg01',fstore:f.fstore,now:()=>Date.now()+2000,inventory:inv});await w.drain(E.key('measurement',ms[0][0].split('/').pop()));
  assert.equal(f.FS[ms[0][0]].status,'done','worker hoàn tất lượt cân');assert.equal(f.rtGet('active_units_gieogieo/j/n').unitBase,380,'worker không áp kho lần hai');
  assert.equal(f.FS[ROOT+'/tasks/'+l.e2.taskId].status,'done');
 }
 {const r=await ketCa({pos:'v5',store:'v5'}),old=await ketCa({pos:'v4',store:'v4'});
  assert.equal(r.posTuGhi,0);assert.equal(r.luotCanXong,7);
  assert(r.engine2ThemMoiDong.trips<=1.01,'Engine 2 thêm ≤ 1 vòng mạng mỗi dòng cân (đo: '+r.engine2ThemMoiDong.trips.toFixed(2)+'; v4: '+old.engine2ThemMoiDong.trips.toFixed(2)+')');
  assert(r.dungDanhSach.trips<=3&&r.dungDanhSach.trips<old.dungDanhSach.trips,'dựng danh sách ≤ 3 vòng mạng (đo: '+r.dungDanhSach.trips+'; v4: '+old.dungDanhSach.trips+')');
  assert(r.dungLaiDanhSach.reads<old.dungLaiDanhSach.reads/2,'dựng lại danh sách đọc dưới một nửa v4');
  assert.deepEqual([r.workerHoanTat.reads,r.workerHoanTat.writes],[old.workerHoanTat.reads,old.workerHoanTat.writes],'phần worker hoàn tất không đổi (cùng dữ liệu vào)');
  console.log('ok 2. B2 — mỗi dòng cân: Engine 2 thêm '+r.engine2ThemMoiDong.trips.toFixed(1)+' vòng mạng (v4: '+old.engine2ThemMoiDong.trips.toFixed(1)+'); dựng danh sách '+r.dungDanhSach.trips+' vòng (v4: '+old.dungDanhSach.trips+'); kho ghi một lần, worker ghi nốt');}

 // ── B3: danh sách worker công bố ───────────────────────────────────────────────────────────────────────────
 {
  const plan={m0:{k:'m0~k'},m3:{}};
  const f=world({[ROOT+'/tasks/m0~k']:{id:'m0~k',itemId:'k',kind:'weigh_open_units',sampling:'random_m0',pending:true,status:'queued',createdAt:DAY+'T01:00:00.000Z'}},{controlledItemIds:['j'],workerStoreVersion:5,e2Plan:plan});
  delete f.FS[ROOT+'/controls/k'];await load(f);
  let q=0;const sub=f.fstore.collection;f.fstore.collection=function(n){const c=sub.apply(this,arguments);return c;};
  const log0=f.log.length,a=await computeShiftInventoryCountLinesPOS('close'),by=Object.fromEntries(a.map(l=>[l.itemId,l]));
  assert.equal(by.k.e2.taskId,'m0~k','món cân ngẫu nhiên lấy từ danh sách công bố');assert.equal(by.j.e2.taskId,E.key('day_close',DAY,'j','c'));
  // worker cũ (chưa công bố) → vẫn truy vấn như v4
  const g2=world({[ROOT+'/tasks/m0~k']:{id:'m0~k',itemId:'k',kind:'weigh_open_units',sampling:'random_m0',pending:true,status:'queued',createdAt:DAY+'T01:00:00.000Z'}},{controlledItemIds:['j'],workerStoreVersion:4});
  delete g2.FS[ROOT+'/controls/k'];await load(g2);const b=await computeShiftInventoryCountLinesPOS('close');
  assert.equal(b.find(l=>l.itemId==='k').e2.taskId,'m0~k','worker bản cũ: truy vấn việc đang chờ như v4');
  // danh sách công bố rỗng → không thêm món
  const g3=world({},{controlledItemIds:['j'],workerStoreVersion:5,e2Plan:{m0:{},m3:{}}});await load(g3);const c=await computeShiftInventoryCountLinesPOS('close');
  assert.deepEqual(c.map(l=>l.itemId),['j']);
 }
 console.log('ok 3. B3 — việc cân ngẫu nhiên / độc lập lấy từ danh sách worker công bố; worker cũ → truy vấn như v4');

 // ── B4 ─────────────────────────────────────────────────────────────────────────────────────────────────────
 {
  const prev='2026-10-21',f=world({'employee_shifts_gieogieo/p':{employeeId:'b',employeeName:'b',roles:['barista'],businessDate:prev,checkedInAt:prev+'T02:00:00.000Z',checkedOutAt:prev+'T13:00:00.000Z'}});
  globalThis.__ls={s:{},getItem(k){return this.s[k]??null;},setItem(k,v){this.s[k]=String(v);},removeItem(k){delete this.s[k];}};
  const today=[{employeeId:'b',roles:['barista'],checkedInAt:DAY+'T02:00:00.000Z'}];
  await load(f,{today});
  assert.deepEqual(await computeHandoverOpenLinesPOS(),[],'người mở ca duy nhất = người kết ca hôm trước → không đếm giao ca đầu ca');
  assert(JSON.parse(globalThis.__ls.s['gieo_engine2_closer_gg01']).id==='b','người kết ca hôm trước được nhớ ở máy theo ngày');
  // «tải lại trang»: nạp lại cầu nối, cấm mọi truy vấn ca → vẫn biết nhờ bản nhớ
  await load(f,{today});const coll=f.fstore.collection;f.fstore.collection=function(n){if(n==='employee_shifts_gieogieo')throw Error('không được đọc lại ca');return coll.apply(this,arguments);};
  assert.deepEqual(await computeHandoverOpenLinesPOS(),[],'tải lại trang trong ngày: không đọc lại ca hôm trước');
  f.fstore.collection=coll;delete globalThis.__ls;
 }
 console.log('ok 4. B4 — người kết ca hôm trước nhớ ở máy theo ngày (tải lại trang không đọc lại)');

 // ── B5: mạng treo → nhân viên chờ tối đa trần, POS tự ghi; lượt nhận muộn được rút lại ───────────────────────
 {
  const f=world(),inv=await load(f);const lines=await computeShiftInventoryCountLinesPOS('close');
  const limit=GieoEngine2POS._budget().limit;assert(limit>0&&limit<=5000,'trần chờ của cả lần kết ca ≤ 5 giây');
  // transaction xin lượt bị treo lâu hơn trần (mạng rất chậm) — chỉ làm chậm transaction có đọc tài liệu việc cân
  const rt=f.fstore.runTransaction;let slow=true;f.fstore.runTransaction=fn=>slow?sleep(limit+600).then(()=>rt.call(f.fstore,fn)):rt.call(f.fstore,fn);
  const staff={id:'b',fullName:'B'},l1=fill(f,inv,lines.find(x=>x.itemId==='j')),l2=fill(f,inv,lines.find(x=>x.itemId==='k'));
  const apply=inv.shift.applyLine;   // phần kho của POS không bị làm chậm (đo riêng thời gian chờ Engine 2)
  let t=Date.now();const r1=await GieoEngine2POS._engage(l1,DAY,staff),d1=Date.now()-t;
  assert.equal(r1.ok,false);assert.equal(r1.code,'request_failed');assert(/quá thời gian chờ/.test(r1.detail));
  assert(d1<limit+400,'dòng đầu: chờ không quá trần ('+d1+' ms, trần '+limit+')');assert(!l1.engine2Owner);
  t=Date.now();const r2=await GieoEngine2POS._engage(l2,DAY,staff),d2=Date.now()-t;
  assert.equal(r2.ok,false);assert(d2<50,'dòng sau: trần đã hết → KHÔNG chờ thêm ('+d2+' ms)');
  assert(!Object.keys(f.FS).some(p=>p.startsWith(ROOT+'/measurements/')&&f.FS[p].itemId==='k'),'dòng sau: không gửi yêu cầu nào');
  // lượt của dòng đầu được nhận MUỘN → rút lại: rejected, mở khoá, việc đóng kèm lý do, đếm «POS tự ghi»
  slow=false;await sleep(1200);
  const m=Object.entries(f.FS).find(([p,d])=>p.startsWith(ROOT+'/measurements/')&&d.itemId==='j');
  assert(m,'yêu cầu treo cuối cùng vẫn tới máy chủ');assert.equal(m[1].status,'rejected','lượt nhận muộn bị rút lại');assert(/quá thời gian chờ/.test(m[1].lastError));
  assert(!f.FS[ROOT+'/measurement_locks/j'],'khoá món được mở');
  const task=f.FS[ROOT+'/tasks/'+l1.e2.taskId];assert.equal(task.status,'cancelled');assert.equal(task.pending,false);assert.equal(task.posFallback.code,'request_failed');
  assert.equal(Object.values(f.FS[ROOT].e2Daily)[0].fb.request_failed,1,'đếm một lượt «POS tự ghi»');
  // worker gặp lượt đã rút → không làm gì với kho
  const before=clone(f.RT.root);const w=Store.create({storeId:'gg01',fstore:f.fstore,now:()=>Date.now()+2000,inventory:inv});await w.drain(E.key('measurement',m[0].split('/').pop())).catch(()=>{});
  assert.deepEqual(f.RT.root,before,'worker không áp kho cho lượt đã rút');
  // mở lại màn kết ca → trần tính lại
  await computeShiftInventoryCountLinesPOS('close');assert.equal(GieoEngine2POS._budget().used,0,'lần kết ca mới: trần chờ tính lại');
  f.fstore.runTransaction=rt;
 }
 {// dựng danh sách khi mạng treo: trả danh sách sẵn có của POS sau tối đa ~3 giây, không dấu Engine 2, không treo màn
  const f=world();await load(f);globalThis.computeShiftInventoryCountLinesPOS=globalThis.computeShiftInventoryCountLinesPOS;   // (đã bọc)
  const rt=f.fstore.runTransaction;f.fstore.runTransaction=fn=>sleep(5000).then(()=>rt.call(f.fstore,fn));
  const t=Date.now(),out=await computeShiftInventoryCountLinesPOS('close'),d=Date.now()-t;
  assert(d<3600,'dựng danh sách không chờ Engine 2 quá ~3 giây ('+d+' ms)');assert.deepEqual(out,[],'trả đúng danh sách sẵn có của POS (ở đây rỗng)');
  f.fstore.runTransaction=rt;}
 console.log('ok 5. B5 — mạng treo: nhân viên chờ Engine 2 tối đa trần của cả lần kết ca, POS tự ghi; lượt nhận muộn được rút lại, kho không ghi đôi');
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e.stack||e.message);process.exit(1);});
