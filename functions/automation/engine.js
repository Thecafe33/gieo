'use strict';
// A separate Engine instance per store: no mutable GieoData.withStore context.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createEngine({storeId,fstore,db,FieldValue,now=Date.now}){
 const suffix=storeId==='gg01'?'':'__'+storeId;
 const map=p=>String(p).split('/').map(x=>/_gieogieo$/.test(x)?x+suffix:x).join('/');
 const scopedFs={collection:p=>fstore.collection(map(p)),runTransaction:f=>fstore.runTransaction(f),batch:()=>fstore.batch()};
 const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'shared/unit_engine.v20.js'),'utf8'),ctx,{filename:'unit_engine.v20.js'});
 const engine=ctx.UnitEngine;
 engine.init({storeId,app:'quanly',fstore:scopedFs,db:{ref:p=>db.ref(map(p))},FieldValue,now,businessDate:()=>new Date(now()+7*3600000).toISOString().slice(0,10)});
 return engine;
}
module.exports={createEngine};
