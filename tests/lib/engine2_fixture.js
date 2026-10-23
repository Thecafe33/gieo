'use strict';
// Dữ liệu Engine 2 SẠCH dựng bằng chính luồng runtime: báo hết 300 g (tem u, 4 pha chế) + hai lượt cân
// qua kho v21 thật (tem n: thiếu 50 g rồi 30 g). Dùng chung cho test kiểm toán (B0) và bản xuất (B2).
const E=require('../../unit_engine2_v1');
const {create}=require('../../unit_engine2_store_v1');
const {makeFake}=require('./fakefb');
const {createEngine}=require('../../functions/automation/engine');
const ROOT=E.rootPath('gg01');
async function cleanState(){
 const start='2026-10-14T07:17:00.000Z',end='2026-10-22T02:49:00.000Z';
 const shifts=['a','b','c','d'].map((id,i)=>({id:'shift'+id,employeeId:id,employeeName:id,roles:['barista'],checkedInAt:'2026-10-'+String(15+i).padStart(2,'0')+'T02:30:00.000Z',checkedOutAt:'2026-10-'+String(15+i).padStart(2,'0')+'T13:00:00.000Z'}));
 const item={id:'j',name:'Thạch',unit:'g',trackingMode:'unit',stockManaged:true,currentStock:280,costPerUnit:100,packagingUnits:[]};
 const f=makeFake({rt:{active_units_gieogieo:{j:{n:{code:'NEXT0001',unitBase:280,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}}}},fs:{
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:['j'],settingsRevision:3},
  [ROOT+'/controls/j']:{level:2,itemId:'j',itemName:'Thạch',revision:1,manualFloor:0,storeId:'gg01'},
  [ROOT+'/devices/pos1']:{storeId:'gg01',protocolVersion:1,settingsRevision:3,controlRevision:1,ackedAt:'2026-10-22T00:00:00.000Z'},
  'stock_transactions_gieogieo/finish_u_WASTE':{itemId:'jelly',referenceId:'u',type:'WASTE',qty:-300,createdAt:end,businessDate:'2026-10-22',note:'Báo hết'},
  'stock_containers_gieogieo/u':{itemId:'jelly',itemName:'Thạch hồng',unit:'g',baseQty:500,openedAt:start,finishedAt:end,status:'finished',wasteBase:300,wasteBasis:'unit_engine'},
  'inventory_items_gieogieo/jelly':{name:'Thạch hồng',unit:'g',costPerUnit:100},
  'inventory_items_gieogieo/j':item,
  'stock_containers_gieogieo/n':{itemId:'j',itemName:'Thạch',unit:'g',status:'open',baseQty:500,unitBase:280,openedAt:'2026-10-21T03:00:00Z',code:'NEXT0001'},
  'price_history_gieogieo/price':{itemId:'jelly',effectiveFrom:'2026-09-01',price:100},
  'price_history_gieogieo/p':{itemId:'j',effectiveFrom:'2026-09-01',price:100},
  'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
  ...Object.fromEntries(shifts.map(s=>['employee_shifts_gieogieo/'+s.id,s])),
  'employee_shifts_gieogieo/a':{employeeId:'a',employeeName:'A',roles:['barista'],checkedInAt:'2026-10-21T02:00:00.000Z',checkedOutAt:'2026-10-21T13:00:00.000Z'},
  'employee_shifts_gieogieo/b':{employeeId:'b',employeeName:'B',roles:['barista'],checkedInAt:'2026-10-22T02:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'},
  'employee_shifts_gieogieo/o':{employeeId:'o',employeeName:'Order',roles:['order'],checkedInAt:'2026-10-21T02:00:00.000Z',checkedOutAt:'2026-10-21T13:00:00.000Z'}
 }});
 await create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(end)+1000}).finish('finish_u_WASTE');
 let current=Date.parse('2026-10-22T04:00:00Z');
 const inv=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,now:()=>current,items:[item]});
 const s=create({storeId:'gg01',fstore:f.fstore,now:()=>current,inventory:inv});
 async function weigh(cycle,baseline,weighed,at){
  await s.ensureCloseTasks('2026-10-22',cycle);const task=E.key('day_close','2026-10-22','j',cycle),live=f.rtGet('active_units_gieogieo/j/n');
  const line={itemId:'j',itemName:'Thạch',unit:'g',mode:'tem',businessDate:'2026-10-22',sessionId:cycle,units:[{id:'n',code:'NEXT0001',capacity:500,state:'confirmed',openedAt:live.openedAt,baseline,weighed,baselineSig:inv.shift.absSig(live),countedAt:at,seq:0,gone:false,weighings:[{vesselId:'v',variantId:'a',tareG:100,grossG:weighed+100}]}]};
  const id=await s.requestMeasurement(task,line,{id:'b',fullName:'B'});await s.drain(E.key('measurement',id));return id;
 }
 await weigh('first',300,250,'2026-10-22T03:00:00.000Z');
 current=Date.parse('2026-10-22T06:00:00Z');await weigh('second',230,200,'2026-10-22T05:00:00.000Z');
 f.FS[ROOT+'/devices/pos1'].controlRevision=f.FS[ROOT].revision||0;   // thiết bị POS mẫu đã ACK phiên bản yêu cầu hiện hành
 return f;
}
module.exports={cleanState,ROOT};
