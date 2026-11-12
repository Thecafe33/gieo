'use strict';
// RÀ: bán khi CHƯA quét mở tem (hoặc RT lỗi) → Sổ lệch; sau đó mở tem, bán tiếp, BÁO HẾT. Hao hụt ghi thế nào?
const R=require('node:path').join(__dirname,'../..')+'/';
const {makeFake}=require(R+'tests/lib/fakefb'),{createEngine}=require(R+'functions/automation/engine');
const item={id:'X',name:'Sữa',unit:'ml',trackingMode:'unit',stockManaged:true,currentStock:1000,costPerUnit:10,packagingUnits:[{name:'Hộp',baseQty:1000}],countUnitName:'Hộp'};
const staff={id:'e1',fullName:'NV A'};
const dump=(f,name)=>{const tx=Object.entries(f.FS).filter(([p])=>p.startsWith('stock_transactions_gieogieo/')).map(([p,d])=>d.type+':'+d.qty+(d.outsideTem?' (ngoài tem)':''));
 const an=Object.entries(f.FS).filter(([p])=>p.startsWith('stock_anomalies_gieogieo/')).map(([p,d])=>d.kind+':'+d.qty+':'+d.status);
 const B=f.FS['stock_containers_gieogieo/B']||{};
 console.log('  '+name+'\n     tem RT:',JSON.stringify(f.rtGet('active_units_gieogieo/X')||null),'· tem FS:',B.status,B.unitBase,'wasteBase='+B.wasteBase,'· tồn sổ:',f.FS['inventory_items_gieogieo/X'].currentStock,'\n     sổ:',JSON.stringify(tx),'· Sổ lệch:',JSON.stringify(an));};
async function sell(e,f,bill,qty){
 const al=await e.consume.allocate('X',qty,undefined,{type:'order',id:bill,duringPrepLock:true}).catch(()=>[]);
 await e.ledger.apply({itemId:'X',type:'CONSUMPTION',qty:-qty,note:'bán',staff:'',referenceId:bill,deriveFromUnits:al.length>0,businessDate:'2026-10-22',txId:bill+'_ing_X',duringPrepLock:true,...(al.length?{meta:{fifoAllocations:al}}:{})});
 return al.length;
}
(async()=>{
 console.log('\n== A. Hộp 1000 ml: bán 50 khi CHƯA quét mở → quét mở → bán 950 (hộp thật đã cạn) → báo hết');
 { const f=makeFake({rt:{},fs:{'inventory_items_gieogieo/X':item,'stock_containers_gieogieo/B':{itemId:'X',itemName:'Sữa',code:'BBB',status:'sealed',baseQty:1000,unit:'ml'}}});
   const e=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,items:[item]});
   await sell(e,f,'bill_1',50);dump(f,'sau bill 1 (50, chưa có tem mở)');
   const ref=f.fstore.collection('stock_containers_gieogieo').doc('B');await ref.update({status:'open',openedAt:new Date().toISOString()});
   await e.fn.unitEngineOnOpen('B',{itemId:'X',itemName:'Sữa',code:'BBB',baseQty:1000,unit:'ml'});await e.stock.recompute('X','stock_containers_gieogieo');dump(f,'sau khi quét mở hộp');
   await sell(e,f,'bill_2',950);dump(f,'sau bill 2 (950) — hộp THẬT đã cạn');
   try{await e.fn.unitEngineFinishOpenUnit('B',{...f.FS['stock_containers_gieogieo/B'],itemId:'X',code:'BBB',unit:'ml'},staff,'Hết',true,ref,'',true);}catch(x){console.log('     báo hết lỗi:',x.message);}
   dump(f,'sau BÁO HẾT (hộp thật rỗng)');
 }
 console.log('\n== B. Đối chứng: quét mở trước, bán 50 + 950, báo hết');
 { const f=makeFake({rt:{},fs:{'inventory_items_gieogieo/X':item,'stock_containers_gieogieo/B':{itemId:'X',itemName:'Sữa',code:'BBB',status:'open',baseQty:1000,unit:'ml',openedAt:new Date().toISOString()}}});
   const e=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,items:[item]});const ref=f.fstore.collection('stock_containers_gieogieo').doc('B');
   await e.fn.unitEngineOnOpen('B',{itemId:'X',itemName:'Sữa',code:'BBB',baseQty:1000,unit:'ml'});await sell(e,f,'bill_1',50);await sell(e,f,'bill_2',950);
   await e.fn.unitEngineFinishOpenUnit('B',{...f.FS['stock_containers_gieogieo/B'],itemId:'X',code:'BBB',unit:'ml'},staff,'Hết',true,ref,'',true);dump(f,'sau báo hết');
 }
 console.log('\n== C. Hộp A đang mở còn 30; bán 50 (nợ 20) → mở hộp B → kiểm nợ có được hấp thụ');
 { const f=makeFake({rt:{active_units_gieogieo:{X:{A:{code:'AAA',unitBase:30,capacity:1000,openedAt:1}}}},fs:{'inventory_items_gieogieo/X':{...item,currentStock:1030},'stock_containers_gieogieo/A':{itemId:'X',code:'AAA',status:'open',baseQty:1000,unitBase:30,unit:'ml'},'stock_containers_gieogieo/B':{itemId:'X',itemName:'Sữa',code:'BBB',status:'open',baseQty:1000,unit:'ml'}}});
   const e=createEngine({storeId:'gg01',fstore:f.fstore,db:f.db,FieldValue:f.FieldValue,items:[item]});
   await sell(e,f,'bill_1',50);await e.fn.unitEngineOnOpen('B',{itemId:'X',itemName:'Sữa',code:'BBB',baseQty:1000,unit:'ml'});await e.stock.recompute('X','stock_containers_gieogieo');dump(f,'sau khi mở B');
 }
})().catch(e=>{console.error(e);process.exit(1);});
