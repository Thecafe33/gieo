'use strict';
// Cầu nối Engine 2 ↔ POS bản v2 (28/10/2026): KHÔNG popup / màn riêng / chú thích; việc cân Engine 2 nằm trong danh sách cân cuối ca
// sẵn có. Test chạy bằng kho thật (functions/automation/engine) + store Engine 2 thật + Firebase giả — chuỗi đầy đủ:
// danh sách gộp (không thêm lần cân cho món đã bắt buộc) → POS xin mã lượt → kho ghi MỘT lần → tiến trình nền ghi nốt trách nhiệm.
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../unit_engine2_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const {createEngine}=require('../functions/automation/engine');
const ROOT=E.rootPath('gg01'),DAY='2026-10-22',SRC=fs.readFileSync(path.join(__dirname,'../gieo_engine2_pos_v2.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const tick=()=>new Promise(r=>setTimeout(r,20));
const NOW=Date.parse('2026-10-22T04:00:00Z');
const ITEMS=[
 {id:'j',name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:280,costPerUnit:100,packagingUnits:[]},   // Engine 2 kiểm soát
 {id:'k',name:'Cà phê',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:400,costPerUnit:100,packagingUnits:[]},  // có việc cân ngẫu nhiên M0
 {id:'m',name:'Bột',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:300,costPerUnit:100,packagingUnits:[]},    // chỉ nằm trong danh sách bắt buộc
 {id:'z',name:'Đường',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:0,costPerUnit:100,packagingUnits:[]}      // kiểm soát nhưng không còn mã mở
];
const unit=(code,base)=>({code,unitBase:base,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')});
function world(mode='active',extraFS={}){
 const shifts=id=>({employeeId:id,employeeName:id,roles:['barista'],checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'});
 const f=makeFake({rt:{active_units_gieogieo:{j:{n:unit('NEXT0001',280)},k:{k1:unit('KOPI0001',400)},m:{m1:unit('BOT00001',300)}}},fs:{
  [ROOT]:{enabled:true,mode,protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j','z'],settingsRevision:3,revision:1},
  [ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1,manualFloor:0,storeId:'gg01'},
  [ROOT+'/controls/z']:{level:2,itemId:'z',itemName:'Đường',revision:1,manualFloor:0,storeId:'gg01'},
  [ROOT+'/tasks/m0~k']:{id:'m0~k',itemId:'k',kind:'weigh_open_units',sampling:'random_m0',pending:true,status:'queued',createdAt:'2026-10-22T01:00:00.000Z'},
  'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:280,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
  'stock_containers_gieogieo/k1':{itemId:'k',itemName:'Cà phê',unit:'g',status:'open',baseQty:500,unitBase:400,openedAt:'2026-10-21T03:00:00Z',code:'KOPI0001'},
  'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
  'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
  'employee_shifts_gieogieo/b':shifts('b'),
  'employee_shifts_gieogieo/o':{employeeId:'o',employeeName:'Order',roles:['order'],checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'},
  ...Object.fromEntries(ITEMS.map(i=>['inventory_items_gieogieo/'+i.id,i])),
  ...extraFS
 }});
 return f;
}
// Dựng môi trường POS giả quanh bản v2 thật; mỗi lần gọi nạp lại bản v2 trên các hàm gốc MỚI (không bọc chồng).
async function load(f,{lines,applyOverride,today=[],handover=[]}={}){
 const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>NOW,items:ITEMS});
 const g=globalThis;
 g.window=g;g.document={readyState:'complete'};g.addEventListener=()=>{};g.localStorage={s:{},getItem(k){return this.s[k]??null},setItem(k,v){this.s[k]=String(v)},removeItem(k){delete this.s[k]}};
 g.UnitEngine2=E;g.UnitEngine2Store={create};g.fstore=f.fstore;g.db=f.db;g.POS_STORE={storeId:'gg01'};g.GieoData={collFor:name=>f.fstore.collection(name)};
 g.UnitEngine={VERSION:inv.VERSION,clock:{now:()=>NOW},units:inv.units,shift:{...inv.shift}};
 if(applyOverride)g.UnitEngine.shift.applyLine=applyOverride;
 g.KHO_ITEMS_CACHE=clone(ITEMS);g.shiftState={businessDate:DAY};g.posDateKey=d=>d?new Date(d.getTime()+7*3600000).toISOString().slice(0,10):DAY;g.ensureKhoItemsPOS=async()=>{};g.toast=()=>{};
 g.shiftWeighIsTemItemPOS=it=>it.trackingMode==='unit';
 g.shiftWeighTemLinePOS=(it,node,reasons)=>{const open=Object.entries(node||{}).filter(([id,v])=>id!=='__prepLock'&&v&&!v.finishedDebt).map(([id,v])=>({id,code:v.code,openedAt:v.openedAt,capacity:v.capacity,state:'pending'}));return open.length?{itemId:it.id,itemName:it.name,unit:it.unit,mode:'tem',layer:reasons.length?'anomaly':'config',reasons,units:open}:null;};
 g.shiftWeighLineHTML=l=>JSON.stringify({reasons:l.reasons||[]});
 g.UnitEngine2Staffing=require('../unit_engine2_staffing_v1');g._employeeShiftsTodayCache=today;g.loadEmployeeShiftsTodayCache=async()=>{};
 g.computeHandoverOpenLinesPOS=async()=>clone(handover);
 g.computeShiftInventoryCountLinesPOS=async phase=>clone(lines||[]);
 delete g.GieoEngine2POS;
 vm.runInThisContext(SRC);
 await g.computeShiftInventoryCountLinesPOS('close');await tick();await tick();      // kích hoạt init + nhận cấu hình
 return {inv,store:create({storeId:'gg01',fstore:f.fstore,now:()=>Date.now(),inventory:inv})};
}
// Dòng POS đã cân xong như luồng cân thường dựng: mã đã xác nhận, số cân từ dụng cụ có bì.
function weighed(inv,{itemId='j',unitId='n',base=280,net=250,tare=100,vessel='v',variant='a',reason=[],typed=false}={}){
 const live=globalThis.__rt(itemId,unitId);
 return {itemId,itemName:ITEMS.find(i=>i.id===itemId).name,unit:'g',mode:'tem',layer:'config',reasons:reason,
  units:[{id:unitId,code:live.code,openedAt:live.openedAt,capacity:500,state:'confirmed',confirmVia:'scan',manualReason:'',weighed:net,baseline:base,baselineSig:inv.shift.absSig(live),
   countedAt:new Date(NOW-60000).toISOString(),seq:0,gone:false,weighings:typed?[]:[{vesselId:vessel,vesselName:'Hũ',variantId:variant,tareG:tare,grossG:net+tare}]}]};
}

(async()=>{
 // ── Không popup / không giải thích: bản v2 không có giao diện ─────────────────────────────────────────────
 for(const bad of ['e2Modal','e2-dialog','innerHTML','Vì sao cần cân','document.createElement','toast('])assert(!SRC.includes(bad),'bản v2 không được có giao diện / lời giải thích: '+bad);
 assert(/gieo_engine2_pos_v2\.js/.test(fs.readFileSync(path.join(__dirname,'../posgieo.html'),'utf8')),'posgieo.html nạp bản v2');
 assert(!/gieo_engine2_pos_v1\.js/.test(fs.readFileSync(path.join(__dirname,'../posgieo.html'),'utf8')),'posgieo.html không còn nạp bản v1 (popup)');

 // ── 1. Engine 2 chưa bật (đối chiếu) → danh sách giữ nguyên, không dấu ngầm ───────────────────────────────
 {
  const f=world('shadow');globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  await load(f,{lines:[{itemId:'m',itemName:'Bột',unit:'g',mode:'tem',reasons:['Có dòng Sổ lệch'],units:[{id:'m1'}]}]});
  const out=await computeShiftInventoryCountLinesPOS('close');
  assert.deepEqual(out.map(l=>l.itemId),['m']);assert(!out[0].e2);
  assert.equal(await computeShiftInventoryCountLinesPOS('open').then(x=>x.length),1,'không có ca nào → danh sách đầu ca đi qua nguyên vẹn');
 }

 // ── 2. Danh sách cuối ca gộp: không thêm lần cân cho món đã bắt buộc, thêm đúng món còn thiếu ──────────────
 {
  const f=world();globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  await load(f,{lines:[
   {itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',layer:'config',reasons:[],units:[{id:'n',code:'NEXT0001'}]},   // bắt buộc VÀ Engine 2 kiểm soát
   {itemId:'m',itemName:'Bột',unit:'g',mode:'tem',layer:'config',reasons:[],units:[{id:'m1'}]}                  // chỉ bắt buộc
  ]});
  const out=await computeShiftInventoryCountLinesPOS('close');
  assert.deepEqual(out.map(l=>l.itemId),['k','m','j'].sort((a,b)=>ITEMS.find(x=>x.id===a).name.localeCompare(ITEMS.find(x=>x.id===b).name,'vi')),'bắt buộc + M0 (k thêm một dòng); z không còn mã mở nên không có dòng; không dòng nào bị đúp');
  assert.equal(out.filter(l=>l.itemId==='j').length,1,'món vừa bắt buộc vừa kiểm soát chỉ MỘT dòng');
  const byId=Object.fromEntries(out.map(l=>[l.itemId,l]));
  assert.equal(byId.j.e2.taskId,E.key('day_close',DAY,'j','c'));assert.equal(byId.k.e2.taskId,'m0~k','món M0 mượn việc cân ngẫu nhiên đang chờ');assert(!byId.m.e2,'món bắt buộc thường: Engine 2 không đụng');
  assert.deepEqual(byId.k.reasons,[],'dòng thêm không kèm lý do');assert.equal(byId.k.mode,'tem');
  assert(f.FS[ROOT+'/tasks/'+E.key('day_close',DAY,'j','c')],'việc cân cuối ngày chỉ tạo cho món có dòng');
  assert(!f.FS[ROOT+'/tasks/'+E.key('day_close',DAY,'z','c')],'món không còn mã mở: không tạo việc thừa');
  // hôm nay đã cân k → không thêm lại
  f.FS['daily_closings_gieogieo/'+DAY]={shiftInventoryCloseLines:[{itemId:'k'}]};
  const again=await computeShiftInventoryCountLinesPOS('close');await tick();
  assert(!again.some(l=>l.itemId==='k'),'hôm nay đã cân k rồi → không thêm lại dòng nào');
 }

 // ── 3. Chuỗi đầy đủ: POS xin mã lượt → kho ghi MỘT lần → tiến trình nền ghi nốt trách nhiệm, không ghi đúp ─────
 {
  const f=world();globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  const {inv,store}=await load(f,{lines:[{itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',layer:'config',reasons:[],units:[{id:'n',code:'NEXT0001'}]}]});
  const [l]=(await computeShiftInventoryCountLinesPOS('close')).filter(x=>x.itemId==='j');
  Object.assign(l,weighed(inv),{e2:l.e2});
  const out=await UnitEngine.shift.applyLine(l,DAY,{id:'b',fullName:'B'},'seed');
  assert.equal(out.status,'reconciled');assert.equal(l.engine2Owner,true);assert(/^e2sw_[a-f0-9]{32}$/.test(l.engine2OpId));
  const meas=Object.entries(f.FS).filter(([p])=>p.startsWith(ROOT+'/measurements/'));assert.equal(meas.length,1,'đúng một lệnh cân');
  assert.equal(meas[0][1].operationId,l.engine2OpId);assert.equal(meas[0][1].status,'queued');assert.equal(meas[0][1].staff.id,'b');
  assert.equal(f.rtGet('active_units_gieogieo/j/n').unitBase,250,'kho đã áp số cân ngay (đồng bộ, như mọi dòng cân)');
  assert(f.FS[ROOT+'/operations/'+l.engine2OpId].inventoryResult,'phiếu kho để tiến trình nền nhận ra đã áp');
  await tick();
  assert.deepEqual(Object.keys(f.FS).filter(p=>/^duty_/.test(p)&&!p.startsWith(ROOT)),[],'kho KHÔNG tự ghi hồ sơ trách nhiệm (một nơi ghi duy nhất = Engine 2)');
  await store.drain(E.key('measurement',meas[0][1].id));
  const m=f.FS[meas[0][0]];
  assert.equal(m.status,'done','tiến trình nền ghi nốt');
  assert(Object.values(f.FS).some(d=>d&&d.originKind==='measurement'),'trách nhiệm được ghi bởi Engine 2');
  assert(Object.keys(f.FS).some(p=>p.startsWith(ROOT+'/checkpoints/')),'mốc cân được ghi');
  const wastes=Object.entries(f.FS).filter(([p,d])=>p.startsWith('stock_transactions_gieogieo/')&&d&&d.type==='WASTE');assert.equal(wastes.length,1,'hao hụt chỉ ghi MỘT lần');assert.equal(f.rtGet('active_units_gieogieo/j/n').unitBase,250);
  assert.equal(f.FS[ROOT+'/tasks/'+E.key('day_close',DAY,'j','c')].status,'done');
 }

 // ── 4. Điều kiện không chắc chắn → POS ghi như thường (không cờ engine2Owner), không bao giờ chặn kết ca ─────
 async function applyCase(setup,{ack=false,staff={id:'b',fullName:'B'}}={}){
  const f=world();globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  const {inv}=await load(f,{lines:[{itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',layer:'config',reasons:[],units:[{id:'n',code:'NEXT0001'}]}]});
  const [l0]=(await computeShiftInventoryCountLinesPOS('close')).filter(x=>x.itemId==='j');
  const l=Object.assign(weighed(inv,setup.line||{}),{e2:l0.e2});if(ack)l._devAck=true;
  let err=null,out=null;try{out=await UnitEngine.shift.applyLine(l,DAY,staff,'seed');}catch(e){err=e;}
  return {f,l,out,err,measurements:Object.keys(f.FS).filter(p=>p.startsWith(ROOT+'/measurements/')).length};
 }
 {
  const typed=await applyCase({line:{typed:true}});
  assert(!typed.l.engine2Owner&&typed.out&&typed.out.status==='reconciled'&&typed.measurements===0,'số gõ tay (không dụng cụ) → ghi như thường');
  const tare=await applyCase({line:{tare:90}});
  assert(!tare.l.engine2Owner&&tare.out&&tare.measurements===0,'bì khác thư viện dụng cụ → ghi như thường');
  const big=await applyCase({line:{net:100}});
  assert.equal(big.err&&big.err.code,'SW_DEVIATION','lệch lớn: POS hỏi xác nhận như cũ');assert(!big.l.engine2Owner&&big.measurements===0,'chưa xác nhận lệch thì chưa xin Engine 2');
  const bigAck=await applyCase({line:{net:100}},{ack:true});
  assert(bigAck.l.engine2Owner&&bigAck.out.status==='reconciled','đã xác nhận lệch lớn → Engine 2 nhận lượt');
  const m=Object.entries(bigAck.f.FS).find(([p])=>p.startsWith(ROOT+'/measurements/'))[1];assert.equal(m.line.largeDeviationConfirmed,true);
  const nobody=await applyCase({},{staff:{id:'o',fullName:'Order'}});
  assert(!nobody.l.engine2Owner&&nobody.out&&nobody.out.status==='reconciled'&&nobody.measurements===0,'người cân không có ca pha chế → ghi như thường, không chặn');
  const missing=await applyCase({line:{}});   // sanity: đường thường vẫn ghi
  assert(missing.out.status==='reconciled');
 }
 {
  // Mã đã đổi giữa lúc cân và lúc ghi (SW_RELOAD): lượt Engine 2 đã xin không còn đúng → bỏ cờ để xin lại.
  const f=world();globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  const reload=Object.assign(Error('tải lại mã'),{code:'SW_RELOAD'});
  const {inv}=await load(f,{lines:[{itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',reasons:[],units:[{id:'n'}]}],applyOverride:async()=>{throw reload;}});
  const [l0]=(await computeShiftInventoryCountLinesPOS('close')).filter(x=>x.itemId==='j');
  const l=Object.assign(weighed(inv),{e2:l0.e2});
  await assert.rejects(UnitEngine.shift.applyLine(l,DAY,{id:'b',fullName:'B'},'s'),e=>e.code==='SW_RELOAD');
  assert(!l.engine2Owner&&!l.engine2OpId&&l._e2Session===null,'bỏ cờ + phiên đo cũ sau khi cần tải lại');
 }

 // ── 5. Không giải thích với nhân viên: dòng «Cần cân hôm nay vì …» không còn hiển thị ─────────────────────────
 {
  const f=world();globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  await load(f);
  assert.deepEqual(JSON.parse(shiftWeighLineHTML({reasons:['Bán khi không có tem mở','Có dòng Sổ lệch']})).reasons,[]);
  assert.deepEqual(JSON.parse(shiftWeighLineHTML({reasons:[]})).reasons,[]);
 }

 // ── 6. Đầu ca: không làm việc thừa (đợt 2) ──────────────────────────────────────────────────────────
 const OPEN_LINES=[{itemId:'m',itemName:'Bột',unit:'g',expectedQty:300}];      // danh sách kiểm kê đầu ca chủ quán cấu hình
 const HANDOVER=[{ruleId:'r',itemId:'m',itemName:'Bột',unit:'g'}];             // đếm giao ca đầu ca
 const past=(id,out,day='2026-10-21')=>({employeeId:id,employeeName:id,roles:['barista'],businessDate:day,checkedInAt:day+'T02:00:00.000Z',checkedOutAt:day+'T'+out+':00.000Z'});
 const live=id=>({employeeId:id,employeeName:id,roles:['barista'],businessDate:DAY,checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:null});
 async function openCase({mode='active',yesterday,today,fs={}}){
  const extra=Object.fromEntries([...yesterday].map((x,i)=>['employee_shifts_gieogieo/y'+i,x]));
  const f=world(mode,{...extra,...fs});globalThis.__rt=(i,u)=>f.rtGet('active_units_gieogieo/'+i+'/'+u);
  const env=await load(f,{lines:OPEN_LINES,today,handover:HANDOVER});
  return {f,env,open:await computeShiftInventoryCountLinesPOS('open'),handover:await computeHandoverOpenLinesPOS()};
 }
 {
  const same=await openCase({yesterday:[past('b','13:00')],today:[live('b')]});
  assert.deepEqual(same.open,[],'người mở ca duy nhất = người kết ca hôm trước → KHÔNG kiểm kê đầu ca');
  assert.deepEqual(same.handover,[],'… và KHÔNG đếm giao ca đầu ca');
  const shadow=await openCase({mode:'shadow',yesterday:[past('b','13:00')],today:[live('b')]});
  assert.deepEqual(shadow.open,[],'luật «không làm việc thừa» không phụ thuộc Engine 2 có bật hay không');
  const other=await openCase({yesterday:[past('a','14:00'),past('b','13:00')],today:[live('b')]});
  assert.deepEqual(other.open.map(l=>l.itemId),['m'],'người kết ca hôm trước là người khác (a ra muộn nhất) → giữ danh sách');assert.equal(other.handover.length,1);
  const two=await openCase({yesterday:[past('b','13:00')],today:[live('a'),live('b')]});
  assert.equal(two.open.length,1,'từ hai người đang làm → hỏi như thường (thận trọng)');
  const nobody=await openCase({yesterday:[past('b','13:00')],today:[]});
  assert.equal(nobody.open.length,1,'chưa ai check-in → hỏi như thường');
  const gap=await openCase({yesterday:[past('b','13:00','2026-10-20')],today:[live('b')]});
  assert.deepEqual(gap.open,[],'hôm qua nghỉ: lùi tới ngày gần nhất có ca để xác định người kết ca');
  const none=await openCase({yesterday:[],today:[live('b')]});
  assert.equal(none.open.length,1,'không biết ai kết ca hôm trước → hỏi như thường');
  // lượt đọc: tìm người kết ca là truy vấn theo ngày, không quét cả bảng ca
 }
 // ── 7. Cân độc lập (M3) chỉ ở đầu ca và chỉ khi có người KHÁC người cân trước ────────────────────────────
 {
  const m3={[ROOT+'/tasks/m3~x']:{id:'m3~x',itemId:'j',kind:'weigh_open_units',sampling:'m3',blind:true,excludeStaffId:'b',pending:true,status:'queued',createdAt:'2026-10-22T01:30:00.000Z',obsId:'x'},
   'employee_shifts_gieogieo/ta':{employeeId:'a',employeeName:'a',roles:['barista'],businessDate:DAY,checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:null}};
  const diff=await openCase({yesterday:[past('b','13:00')],today:[live('a')],fs:m3});
  const row=diff.open.find(l=>l.itemId==='j');
  assert(row&&row.mode==='tem'&&row.e2.taskId==='m3~x'&&row.reasons.length===0,'người mở ca KHÁC người cân trước → dòng cân độc lập nằm trong danh sách đầu ca sẵn có (không việc riêng, không lý do)');
  assert.deepEqual(diff.open.filter(l=>l.itemId!=='j').map(l=>l.itemId),['m'],'danh sách cấu hình giữ nguyên');
  const sameP=await openCase({yesterday:[past('a','13:00')],today:[live('b')],fs:m3});
  assert(!sameP.open.some(l=>l.itemId==='j'),'người mở ca duy nhất chính là người đã cân → không cân độc lập');
  // cân xong bởi người khác → Engine 2 nhận lượt; bởi chính người cân trước → từ chối, POS ghi như thường
  const real=await openCase({yesterday:[past('b','13:00')],today:[live('a')],fs:m3}),{f,env}=real;     // nạp lại để các hàm toàn cục thuộc đúng thế giới giả
  const l=Object.assign(weighed(env.inv),{e2:real.open.find(x=>x.itemId==='j').e2});
  const out=await UnitEngine.shift.applyLine(l,DAY,{id:'a',fullName:'a'},'seed');
  assert.equal(out.status,'reconciled');assert.equal(l.engine2Owner,true,'M3 do người khác cân → Engine 2 nhận');
  assert.equal(Object.values(f.FS).filter(d=>d&&d.taskId==='m3~x'&&d.status==='queued').length,1);
  const f2=world('active',{...m3});globalThis.__rt=(i,u)=>f2.rtGet('active_units_gieogieo/'+i+'/'+u);
  const env2=await load(f2,{lines:[],today:[live('b')]});
  const l2=Object.assign(weighed(env2.inv),{e2:{taskId:'m3~x'}});
  await UnitEngine.shift.applyLine(l2,DAY,{id:'b',fullName:'b'},'seed2');
  assert(!l2.engine2Owner,'chính người cân trước không làm được cân độc lập → POS ghi như thường, không chặn');
  // M3 không bao giờ chen vào danh sách CUỐI ca
  const f3=world('active',{...m3});globalThis.__rt=(i,u)=>f3.rtGet('active_units_gieogieo/'+i+'/'+u);
  await load(f3,{lines:[],today:[live('a')]});
  assert(!(await computeShiftInventoryCountLinesPOS('close')).some(l=>l.e2&&l.e2.taskId==='m3~x'),'cuối ca đã cân hết: không thêm cân độc lập');
 }
 console.log('ok Engine 2 POS v2: không popup / không giải thích; danh sách cuối ca gộp (món bắt buộc không cân hai lần); kho ghi một lần + Engine 2 ghi nốt trách nhiệm; mọi điều kiện không chắc chắn → POS ghi như thường; đầu ca: người mở = người kết ca hôm trước thì không kiểm kê / đếm giao ca; cân độc lập chỉ khi có người khác');
})().catch(e=>{console.error(e);process.exit(1);});
