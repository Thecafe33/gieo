'use strict';
const E=require('./shared/unit_engine2_v1');
const {create}=require('./shared/unit_engine2_store_v1');
const {createEngine}=require('./engine');
function createEngine2Worker({db,rt,FieldValue,now=Date.now,documentId}){
 const services=new Map();
 function service(store){
  if(!services.has(store))services.set(store,create({storeId:store,fstore:db,now,documentId,log:e=>console.error('Engine2',store,e.message),
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
   if(!/^finish_.+_WASTE$/.test(id)||![before,after].some(d=>d?.type==='WASTE'))return;
   await service(store).enqueue('finish',id);
  }else if(kind==='stock_containers'){
   if(after?.status==='finished'&&Number(after.wasteBase)>0&&after.wasteBasis==='unit_engine'&&(before?.status!==after.status||before?.wasteBase!==after.wasteBase))await service(store).enqueue('finish','finish_'+id+'_WASTE');
   if(after?.status==='open'&&(before?.status!=='open'||before?.openedAt!==after.openedAt))await service(store).enqueue('opened',id);
  }else if(kind==='employee_shifts'&&[before,after].some(d=>d?.roles?.includes('barista'))&&E.stable(before)!==E.stable(after))await service(store).enqueue('handover',id);
  else if(kind==='price_history'&&E.stable(before)!==E.stable(after)){for(const item of new Set([before?.itemId,after?.itemId].filter(Boolean)))await service(store).enqueue('reprice',item);}
 }
 return {service,source,drain:(store,id)=>service(store).drain(id),tick:store=>service(store).retryDue()};
}
module.exports={createEngine2Worker};
