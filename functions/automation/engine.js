'use strict';
// A separate Engine instance per store: no mutable GieoData.withStore context.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createEngine({storeId,fstore,db,FieldValue,now=Date.now,items=[],rules=[]}){
 const suffix=storeId==='gg01'?'':'__'+storeId;
 const map=p=>String(p).split('/').map(x=>/_gieogieo$/.test(x)?x+suffix:x).join('/');
 const scopedFs={collection:p=>fstore.collection(map(p)),runTransaction:f=>fstore.runTransaction(f),batch:()=>fstore.batch()};
 const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'shared/unit_engine.v21.js'),'utf8'),ctx,{filename:'unit_engine.v21.js'});
 const engine=ctx.UnitEngine;
 engine.init({storeId,app:'quanly',fstore:scopedFs,db:{ref:p=>db.ref(map(p))},FieldValue,now,businessDate:()=>new Date(now()+7*3600000).toISOString().slice(0,10),
  state:{_shiftInventoryCountStatePOS:()=>({lines:[]})},getItems:()=>items,getRefillRule:id=>rules.find(r=>r.itemId===id)||null,getBiggestPackagingUnit:it=>(it.packagingUnits||[]).map(p=>({label:p.name,baseQty:Number(p.baseQty)})).filter(p=>p.baseQty>0).sort((a,b)=>Number(b.baseQty)-Number(a.baseQty))[0]||null});
 return engine;
}
module.exports={createEngine};
