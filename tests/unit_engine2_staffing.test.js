'use strict';
// Nhân sự & «không làm việc gì hai lần» (28/10/2026, chủ quán chốt):
//  - quán MỘT người vận hành xuyên suốt là mô hình chủ đích (không phải thiếu nhân sự): nhận từ ca thật theo quán, tự chuyển khi có người thứ hai;
//  - không tạo việc cân độc lập (M3) không thể hoàn thành khi chỉ có một người; có người thứ hai thì tạo như cũ;
//  - cân ngẫu nhiên M0 ưu tiên món ĐÃ nằm trong danh sách cân bắt buộc cuối ca (không thêm lần cân);
//  - store v2 = store v1 + các điểm trên: mọi test viết cho v1 vẫn phải đạt trên v2.
const assert=require('node:assert');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const E=require('../unit_engine2_v1');
const S=require('../unit_engine2_staffing_v1');
const L=require('../unit_engine2_learn_v1');
const {create}=require('../unit_engine2_store_v2');
const {makeFake}=require('./lib/fakefb');
const ROOT=E.rootPath('gg01'),clone=v=>JSON.parse(JSON.stringify(v));
const NOW=Date.parse('2026-10-24T03:00:00Z');

// ── 1. Hàm thuần ──────────────────────────────────────────────────────────────────────────────────────────
{
 const sh=(id,inAt,outAt,roles)=>({employeeId:id,checkedInAt:inAt,checkedOutAt:outAt,...(roles?{roles}:{})});
 const one=[sh('b','2026-10-22T02:00:00Z','2026-10-22T13:00:00Z'),sh('b','2026-10-23T02:00:00Z','2026-10-23T13:00:00Z')];
 assert.equal(S.operatingModel(one,{now:NOW}).model,'single','một pha chế làm xuyên suốt = mô hình một người');
 assert.equal(S.operatingModel([...one,sh('o','2026-10-23T02:00:00Z','2026-10-23T13:00:00Z',['order'])],{now:NOW}).model,'single','người không làm pha chế không đổi mô hình');
 assert.equal(S.operatingModel([...one,sh('a','2026-10-23T02:00:00Z','2026-10-23T13:00:00Z')],{now:NOW}).model,'multi','người thứ hai làm ca gần đây → nhiều người');
 assert.equal(S.operatingModel([...one,sh('a','2026-09-30T02:00:00Z','2026-09-30T13:00:00Z')],{now:NOW}).model,'single','người đã nghỉ từ lâu (ngoài 14 ngày) không giữ quán ở mô hình nhiều người');
 assert.equal(S.operatingModel([],{now:NOW}).model,'unknown');
 assert.deepEqual(S.operatingModel(one,{now:NOW}).people.map(p=>p.id),['b']);
 assert.equal(S.lastCloser([sh('a','2026-10-22T02:00:00Z','2026-10-22T10:00:00Z'),sh('b','2026-10-22T08:00:00Z','2026-10-22T13:00:00Z')]),'b','người ra muộn nhất kết ca');
 assert.equal(S.lastCloser([sh('a','2026-10-22T02:00:00Z','2026-10-22T10:00:00Z'),sh('o','2026-10-22T08:00:00Z','2026-10-22T14:00:00Z',['order'])]),'a','người không pha chế không phải người kết ca');
 assert.equal(S.lastCloser([]),'');
 assert.deepEqual(S.openBaristas([sh('b','2026-10-24T02:00:00Z',null),sh('a','2026-10-24T01:00:00Z','2026-10-24T01:30:00Z'),sh('o','2026-10-24T02:00:00Z',null,['order'])]),['b'],'chỉ người đang có ca mở và làm được pha chế');
 assert.equal(S.sameOperator(['b'],'b'),true);
 assert.equal(S.sameOperator(['b'],'a'),false);
 assert.equal(S.sameOperator([],'b'),false,'chưa ai check-in → hỏi như thường');
 assert.equal(S.sameOperator(['a','b'],'b'),false,'từ hai người đang làm → hỏi như thường');
 assert.equal(S.sameOperator(['b'],''),false,'không biết ai kết ca hôm trước → hỏi như thường');
 assert.equal(S.independentPossible(['b'],'b'),false,'người mở ca duy nhất chính là người cân trước → không độc lập');
 assert.equal(S.independentPossible(['a'],'b'),true);
 assert.equal(S.independentPossible(['a','b'],'b'),true);
 assert.equal(S.independentPossible([],'b'),false);
 // M0: ưu tiên món ĐÃ nằm trong danh sách cân bắt buộc; chỉ khi không có mới thêm tối đa 1 món ngoài danh sách
 assert.deepEqual(S.pickM0({pool:['x','y','z'],mandatory:['y','z'],budget:2}),{ids:['y','z'],extraIds:[]});
 assert.deepEqual(S.pickM0({pool:['x','y','z'],mandatory:['z'],budget:2}),{ids:['z'],extraIds:[]},'đã có món cân sẵn → không thêm món ngoài danh sách');
 assert.deepEqual(S.pickM0({pool:['x','y'],mandatory:[],budget:2}),{ids:['x'],extraIds:['x']},'không món nào cân sẵn → thêm đúng 1 món');
 assert.deepEqual(S.pickM0({pool:['x','y'],mandatory:['q'],budget:2,extra:2}).ids,['x','y']);
 assert.deepEqual(S.pickM0({pool:['x','y'],mandatory:['x','y'],lastM0:{x:'2026-10-20',y:'2026-10-10'},budget:1}).ids,['y'],'xoay vòng: lâu chưa lấy mẫu trước');
 assert.deepEqual(S.pickM0({pool:[],mandatory:['x'],budget:2}),{ids:[],extraIds:[]});
 console.log('ok Nhân sự: mô hình một người / nhiều người theo ca thật, người kết ca / mở ca, cân độc lập, chọn M0 ưu tiên món đã cân sẵn');
}

// ── 2. Store v2: M3 theo nhân sự, mô hình vận hành, M0 ưu tiên danh sách cân bắt buộc ────────────────────
function world(shifts,{mandatory=[]}={}){
 const day=(i,h=13)=>new Date(Date.parse('2026-10-10T00:00:00Z')+i*86400000+h*3600000).toISOString();
 const ob=(item,i,extra)=>({schemaVersion:1,id:item+'~'+i,storeId:'gg01',itemId:item,unit:'g',containerId:'c_'+item,at:day(i),day:day(i).slice(0,10),used:200,loss:4,book:204,measured:200,nWeigh:1,verified:true,scored:true,flagged:false,sampling:'control',measuredBy:'b',ctx:{},...extra});
 const fs={
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j'],settingsRevision:3,revision:1},
  [ROOT+'/controls/j']:{level:2,manualFloor:0,itemId:'j',itemName:'Thạch',revision:1,storeId:'gg01',lastEscalationAt:day(0,1),updatedAt:day(0,1)},
  [ROOT+'/devices/pos1']:{storeId:'gg01',protocolVersion:1,settingsRevision:3,controlRevision:1,ackedAt:'2026-10-23T00:00:00.000Z'},
  'inventory_items_gieogieo/j':{name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true},
  ...Object.fromEntries(['k','k2'].map(i=>['inventory_items_gieogieo/'+i,{name:i,unit:'g',trackingMode:'unit',stockManaged:true,...(mandatory.includes(i)?{shiftCountTiming:'close'}:{})}])),
  'stock_containers_gieogieo/ck':{itemId:'k',itemName:'k',unit:'g',status:'open',baseQty:500,unitBase:300,openedAt:'2026-10-20T01:00:00Z',code:'K1'},
  'stock_containers_gieogieo/ck2':{itemId:'k2',itemName:'k2',unit:'g',status:'open',baseQty:500,unitBase:300,openedAt:'2026-10-20T01:00:00Z',code:'K2'},
  ...Object.fromEntries(shifts.map((s,i)=>['employee_shifts_gieogieo/s'+i,s]))
 };
 const f=makeFake({fs});
 for(let i=0;i<12;i++)f.FS[ROOT+'/obs/j~'+i]=ob('j',i);
 // quan sát mới, thiếu lớn SAU lúc món được nâng mức → bằng chứng «tái diễn» đòi mức 3 (cân độc lập)
 f.FS[ROOT+'/obs/j~fresh']=ob('j',13,{id:'j~fresh',loss:90,measured:110,book:200,scored:false});
 return f;
}
const shift=(id,d)=>({employeeId:id,employeeName:id,roles:['barista'],checkedInAt:'2026-10-'+d+'T02:00:00.000Z',checkedOutAt:'2026-10-'+d+'T13:00:00.000Z'});
(async()=>{
 const run=async f=>create({storeId:'gg01',fstore:f.fstore,now:()=>NOW}).learnDay({force:true});
 const m3Tasks=f=>Object.values(f.FS).filter(t=>t&&t.sampling==='m3');
 // một người vận hành xuyên suốt
 {
  const f=world([shift('b','21'),shift('b','22'),shift('b','23')]);
  const r=await run(f);
  assert.equal(r.operating,'single');assert.equal(f.FS[ROOT+'/models/current'].operating.model,'single');
  assert.deepEqual(f.FS[ROOT+'/models/current'].operating.recentIds,['b']);
  assert.equal(m3Tasks(f).length,0,'một người: không tạo việc cân độc lập không thể hoàn thành');
  assert.equal(f.FS[ROOT+'/controls/j'].level,2,'giữ mức hiện tại, không đẩy lên mức 3');
  assert.equal(r.independentWanted,1);assert.equal(f.FS[ROOT+'/models/current'].independentWanted[0].itemId,'j','ghi nhận trung tính «cần cân độc lập» để quản lý biết (không phải cảnh báo thiếu)');
  assert(!JSON.stringify(f.FS[ROOT+'/models/current']).includes('thiếu nhân sự'),'không gắn nhãn thiếu nhân sự');
 }
 // có người thứ hai → như cũ: nâng mức 3 + việc cân độc lập, loại trừ người cân trước
 {
  const f=world([shift('b','21'),shift('a','22'),shift('b','23')]);
  const r=await run(f);
  assert.equal(r.operating,'multi');
  assert.equal(f.FS[ROOT+'/controls/j'].level,3);
  const t=m3Tasks(f);assert.equal(t.length,1);assert.equal(t[0].excludeStaffId,'b');assert.equal(t[0].blind,true);
  assert.equal(r.independentWanted,0);
 }
 // chưa có ca nào → không biết mô hình: giữ hành vi cũ (không chặn vô cớ)
 {
  const f=world([]);const r=await run(f);assert.equal(r.operating,'unknown');assert.equal(f.FS[ROOT+'/controls/j'].level,3,'chưa biết mô hình → hành vi cũ');
 }
 // M0: món đã nằm trong danh sách cân bắt buộc được chọn, không thêm món ngoài danh sách
 {
  const f=world([shift('b','23')],{mandatory:['k2']});await run(f);
  const m0=Object.values(f.FS).filter(t=>t&&t.sampling==='random_m0').map(t=>t.itemId);
  assert.deepEqual(m0,['k2'],'chỉ món đã cân sẵn (k2); k không bắt buộc nên không thêm dòng cân');
 }
 {
  const f=world([shift('b','23')]);await run(f);
  const m0=Object.values(f.FS).filter(t=>t&&t.sampling==='random_m0');assert.equal(m0.length,1,'không món nào cân sẵn → chỉ thêm 1 món');
 }
 // Việc chẩn đoán dạng nhập riêng chưa có chỗ hiển thị trong danh sách cân cuối ca của POS → không tạo việc không ai làm; bật lại bằng cfg.diagTasks
 {
  const shifts=[shift('b','21'),shift('a','22'),shift('b','23')],fresh={loss:30,measured:170,vesselIds:['v']};
  const f=world(shifts);f.FS[ROOT+'/obs/j~fresh']={...f.FS[ROOT+'/obs/j~fresh'],...fresh};await run(f);
  assert(!Object.values(f.FS).some(t=>t&&t.kind==='tare_check'),'chưa có chỗ hiển thị → không tạo việc kiểm bì');
  const g=world(shifts);g.FS[ROOT]={...g.FS[ROOT],diagTasks:true};g.FS[ROOT+'/obs/j~fresh']={...g.FS[ROOT+'/obs/j~fresh'],...fresh};await run(g);
  assert(Object.values(g.FS).some(t=>t&&t.kind==='tare_check'),'cfg.diagTasks=true → tạo như cũ');
 }
 console.log('ok Store v2: một người = mô hình chủ đích (không việc độc lập bất khả thi, không nhãn thiếu); có người thứ hai → M3 như cũ; M0 ưu tiên món đã cân sẵn');

 // ── 3. Mọi test viết cho store v1 vẫn đạt trên store v2 ──────────────────────────────────────────────
 const alias=path.join(__dirname,'lib/alias_store_v2.js');
 for(const t of ['unit_engine2','unit_engine2_alert_review','unit_engine2_mixup','unit_engine2_prep_review','unit_engine2_queue','unit_engine2_review_fixes','unit_engine2_runtime','unit_engine2_spec','unit_engine2_sub_review']){
  const r=spawnSync(process.execPath,['-r',alias,path.join(__dirname,t+'.test.js')],{env:{...process.env,E2_STORE:'v2'},encoding:'utf8'});
  assert.equal(r.status,0,t+' trên store v2:\n'+(r.stdout+r.stderr).split('\n').slice(-12).join('\n'));
 }
 console.log('ok Store v2 giữ nguyên mọi hành vi đã kiểm của store v1 (9 bộ test)');
})().catch(e=>{console.error(e);process.exit(1);});
