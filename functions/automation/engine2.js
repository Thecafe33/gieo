'use strict';
const E=require('./shared/unit_engine2_v1');
const {create}=require('./shared/unit_engine2_store_v1');
const {createEngine}=require('./engine');
function createEngine2Worker({db,rt,FieldValue,now=Date.now,documentId}){
 const services=new Map();
 function service(store){
  let shared=null;
  if(!services.has(store))services.set(store,create({storeId:store,fstore:db,now,documentId,log:e=>console.error('Engine2',store,e.message),
   getEngine:async()=>shared||(shared=createEngine({storeId:store,fstore:db,db:rt,FieldValue,now,items:[],rules:[]})),
   getInventory:async itemId=>{
    const [item,rules]=await Promise.all([db.doc(E.collection('inventory_items',store)+'/'+itemId).get(),db.collection(E.collection('refill_rules',store)).where('itemId','==',itemId).limit(2).get()]);
    if(!item.exists)throw Error('Không đọc được nguyên liệu');
    return createEngine({storeId:store,fstore:db,db:rt,FieldValue,now,items:[{...item.data(),id:itemId}],rules:rules.docs.map(d=>({...d.data(),id:d.id}))});
   }
  }));return services.get(store);
 }
 async function source(store,kind,id,before,after){
  if(kind==='stock_transactions'){
   const owned=after?.engine2Owner?after:before?.engine2Owner?before:null;
   if(owned&&before&&E.stable(before)!==E.stable(after)){const op=await service(store).sub('operations').doc(owned.shiftWeighOp).get();if(op.exists)await service(store).enqueue('measurement',op.data().measurementId);return;}
   // Lệch NL khi nấu mẻ BTP vừa được POS gắn «Chờ quản lý duyệt» → Engine 2 tự xử lý (store tự chặn ngày trước ngày áp dụng).
   if(E.PREP_ROW.test(id)&&after?.needsReview===true&&before?.needsReview!==true){await service(store).enqueue('prep_review',id);return;}
   if(!/^finish_.+_WASTE$/.test(id)||![before,after].some(d=>d?.type==='WASTE'))return;
   await service(store).enqueue('finish',id);
  }else if(kind==='duty_cases'){
   // Vụ lệch đếm BTP / cân NL cuối ngày vừa tạo → xét «pha nhầm trong nhóm dễ nhầm» cho ngày đó (store tự lọc nhóm + ngày áp dụng).
   if(!before&&after?.businessDate)await service(store).enqueue('mixup_day',after.businessDate);
  }else if(kind==='stock_containers'){
   if(after?.status==='finished'&&Number(after.wasteBase)>0&&after.wasteBasis==='unit_engine'&&(before?.status!==after.status||before?.wasteBase!==after.wasteBase))await service(store).enqueue('finish','finish_'+id+'_WASTE');
   if(after?.status==='open'&&(before?.status!=='open'||before?.openedAt!==after.openedAt))await service(store).enqueue('opened',id);
  }else if(kind==='employee_shifts'&&[before,after].some(d=>E.isBarista(d))&&E.stable(before)!==E.stable(after))await service(store).enqueue('handover',id);
  else if(kind==='price_history'&&E.stable(before)!==E.stable(after)){for(const item of new Set([before?.itemId,after?.itemId].filter(Boolean)))await service(store).enqueue('reprice',item);}
 }
 // Lượt học mỗi ngày (store tự chặn chạy lại trong ngày); lỗi học không chặn hàng đợi nghiệp vụ.
 let params=null;try{params=require('./shared/unit_engine2_params_v1.js');}catch(e){}
 const learned=new Map(),learn=async store=>{const day=new Date(now()+7*3600000).toISOString().slice(0,10);if(learned.get(store)===day)return null;try{await service(store).sweepPrepReview().catch(e=>console.error('Engine2 prep sweep',store,e.message));await service(store).mixupSweep().catch(e=>console.error('Engine2 mixup sweep',store,e.message));const r=await service(store).learnDay({params:params||undefined});if(r)learned.set(store,day);return r;}catch(e){console.error('Engine2 learn',store,e.message);return null;}};
 return {service,source,learn,drain:(store,id)=>service(store).drain(id),tick:async store=>{const n=await service(store).retryDue();await learn(store);return n;}};
}
module.exports={createEngine2Worker};
