// Đối chiếu số lượng độc lập và lỗi SAU COMMIT (mất ACK), không chỉ snapshot lời gọi.
// ENGINE=unit_engine.v18.js để tái hiện lỗi trước bản sửa.
'use strict';
const assert=require('assert/strict');
const {makeFake}=require('./lib/fakefb');
const {loadEngineModule}=require('./lib/engine');
const {extract}=require('./lib/extract');
const FILE=process.env.ENGINE||require('./lib/engine_file');
const INV='inventory_items_gieogieo',CTN='stock_containers_gieogieo',PB='prep_batches_gieogieo',PI='prep_items_gieogieo',ST='stock_transactions_gieogieo';
const STAFF={id:'e',fullName:'NV thử'},ITEM={id:'X',name:'Sữa thử',unit:'ml',trackingMode:'unit',countUnitName:'Chai',packagingUnits:[{name:'Chai',baseQty:1000}],currentStock:800};
const node=(n,t=1)=>({code:'TEST',itemName:'Sữa thử',unit:'ml',unitBase:n,capacity:1000,openedAt:t});
function make(rt={},docs={},preps=[]){
  const fake=makeFake({rt:{active_units_gieogieo:rt},fs:{[INV+'/X']:{...ITEM},...docs}});
  return {fake,UE:engineFor(fake,preps)};
}
function engineFor(fake,preps=[],day='2026-10-19',file=FILE){
  const UE=loadEngineModule(file);
  UE.init({app:'pos',fstore:fake.fstore,db:fake.db,FieldValue:fake.FieldValue,
    now:()=>fake.clock.now(),random:()=>fake.rnd.random(),getItems:()=>[ITEM],getPreps:()=>preps,businessDate:()=>day});
  return UE;
}
const doc=(n,status='open')=>({itemId:'X',code:'TEST',itemName:'Sữa thử',unit:'ml',baseQty:1000,unitBase:n,status});
const waste=f=>Object.entries(f.FS).filter(([k,v])=>k.startsWith(ST+'/')&&v.type==='WASTE').map(([,v])=>v.qty);
const stock=h=>h.fake.FS[INV+'/X'].currentStock;
function wrapRT(fake,path,wrap){const original=fake.db.ref;const instrument=(r,p)=>{
  if(p===path){const tx=r.transaction;r.transaction=fn=>wrap(tx,fn);}
  const child=r.child;r.child=id=>instrument(child(id),p+'/'+id);return r;
};fake.db.ref=p=>instrument(original(p),p);return()=>{fake.db.ref=original;};}
function wrapUpdate(fake,coll,id,wrap){const original=fake.fstore.collection;fake.fstore.collection=c=>{
  const co=original(c),get=co.doc;co.doc=i=>{const r=get(i);if(c===coll&&i===id){const update=r.update;r.update=v=>wrap(update,v);}return r;};return co;
};return()=>{fake.fstore.collection=original;};}
const scenarios={};
scenarios.fifo_va_no_200 = async()=>{
  const h=make({X:{A:node(100,1),B:node(200,2)}},{[CTN+'/A']:doc(100),[CTN+'/B']:doc(200),[CTN+'/C']:doc(1000,'sealed')});
  const a=await h.UE.consume.allocate('X',500);assert.deepEqual(JSON.parse(JSON.stringify(a.map(x=>[x.containerId,x.qty]))),[['A',100],['B',400]]);
  assert.equal(h.fake.rtGet('active_units_gieogieo/X/B/unitBase'),-200);
  await h.UE.lifecycle.finish('B',doc(200),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('B'));
  assert.equal(h.fake.rtGet('active_units_gieogieo/X/B/finishedDebt'),true);
  await h.fake.fstore.collection(CTN).doc('C').update({status:'open'});
  await h.UE.lifecycle.open('C',doc(1000));await h.UE.stock.recompute('X');
  assert.equal(stock(h),800);assert.equal(h.fake.rtGet('active_units_gieogieo/X/C/unitBase'),800);assert.deepEqual(waste(h.fake),[]);
};
scenarios.mo_mat_ack_khong_tru_no_lan_hai = async()=>{
  const h=make({X:{A:node(-200)}},{[CTN+'/A']:doc(-200),[CTN+'/B']:doc(1000)});let lost=false;
  wrapRT(h.fake,'active_units_gieogieo/X',async(tx,fn)=>{const r=await tx(fn);if(!lost){lost=true;throw Error('ACK mất sau commit');}return r;});
  await h.UE.lifecycle.open('B',doc(1000));await h.UE.stock.recompute('X');
  assert.equal(h.fake.rtGet('active_units_gieogieo/X/B/unitBase'),800);assert.equal(stock(h),800);
  assert.equal(h.fake.FS[CTN+'/A'].status,'finished');
};
scenarios.mo_giu_dau_khi_firestore_loi_va_chuyen_no_tiep = async()=>{
  const h=make({X:{A:node(-200)}},{[CTN+'/A']:doc(-200),[CTN+'/B']:doc(1000),[CTN+'/C']:doc(1000,'sealed')});
  const original=h.fake.fstore.runTransaction;h.fake.fstore.runTransaction=async()=>{throw Error('Firestore offline');};
  await h.UE.lifecycle.open('B',doc(1000));h.fake.fstore.runTransaction=original;
  await h.UE.stock.recompute('X');assert.equal(stock(h),1800);
  await h.UE.consume.allocate('X',1000); // B chuyển từ 800 -> -200, vẫn giữ dấu nợ từ A
  await h.fake.fstore.collection(CTN).doc('C').update({status:'open'});
  await h.UE.lifecycle.open('C',doc(1000));await h.UE.stock.recompute('X');
  assert.equal(stock(h),800);assert.equal(h.fake.FS[CTN+'/A'].status,'finished');assert.equal(h.fake.FS[CTN+'/B'].status,'finished');
};
scenarios.no_lon_hon_3_chai = async()=>{
  const h=make({X:{A:node(-2500)}},{[CTN+'/A']:doc(-2500),[CTN+'/B']:doc(1000,'sealed'),[CTN+'/C']:doc(1000,'sealed'),[CTN+'/D']:doc(1000,'sealed')});
  for(const id of ['B','C','D']){await h.fake.fstore.collection(CTN).doc(id).update({status:'open'});await h.UE.lifecycle.open(id,doc(1000));}
  await h.UE.stock.recompute('X');assert.equal(stock(h),500);assert.equal(h.fake.rtGet('active_units_gieogieo/X/D/unitBase'),500);
};
scenarios.bao_het_form_cu_firestore_loi_retry = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});let fails=3;
  wrapUpdate(h.fake,CTN,'A',async(update,fields)=>{if(fails-->0)throw Error('FS offline');return update(fields);});
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A')));
  await h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A'));
  assert.deepEqual(waste(h.fake),[-100]);assert.equal(h.fake.FS[CTN+'/A'].wasteBase,100);assert.equal(stock(h),0);
};
scenarios.bao_het_mat_ack_rt_khong_mat_so_goc = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});let lost=false;
  wrapRT(h.fake,'active_units_gieogieo/X/A',async(tx,fn)=>{const r=await tx(fn);if(!lost){lost=true;throw Error('mất ACK RT');}return r;});
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A')));
  await h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A'));
  assert.deepEqual(waste(h.fake),[-100]);
};
scenarios.bao_het_goi_lai_3_lan_khong_ghi_hao_hut_3_lan = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});
  for(let i=0;i<3;i++)await h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A'));
  assert.deepEqual(waste(h.fake),[-100]);assert.equal(stock(h),0);
};
scenarios.bao_het_waste_mat_ack = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});
  const orig=h.fake.fstore.runTransaction;let lost=false;
  h.fake.fstore.runTransaction=async fn=>{const r=await orig(fn);if(!lost&&waste(h.fake).length){lost=true;throw Error('ACK WASTE mất');}return r;};
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A')));
  await h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A'));
  assert.deepEqual(waste(h.fake),[-100]);assert.equal(h.fake.FS[CTN+'/A'].status,'finished');
};
scenarios.bao_het_waste_loi_tai_app_lai_van_dung_100 = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});
  const orig=h.fake.fstore.runTransaction;let fail=true;
  h.fake.fstore.runTransaction=async fn=>{if(fail){fail=false;throw Error('sổ chưa commit');}return orig(fn);};
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'lý do gốc',true,h.fake.fstore.collection(CTN).doc('A')));
  assert.equal(h.fake.rtGet('active_units_gieogieo/X/A/discardPending'),true);
  assert.equal((await h.UE.consume.allocate('X',50)).length,0); // không bán tiếp hàng đang báo hết
  const fresh=engineFor(h.fake);
  await fresh.lifecycle.finish('A',doc(999),{id:'e2',fullName:'NV khác'},'lý do mới',false,h.fake.fstore.collection(CTN).doc('A'));
  assert.deepEqual(waste(h.fake),[-100]);assert.equal(h.fake.FS[CTN+'/A'].finishedBy,STAFF.fullName);
  assert.equal(h.fake.FS[CTN+'/A'].finishReason,'lý do gốc');
};
scenarios.hai_may_bao_het_cung_ma = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)}),other=engineFor(h.fake);
  await Promise.all([h.UE,other].map(ue=>ue.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A'))));
  assert.deepEqual(waste(h.fake),[-100]);assert.equal(h.fake.FS[CTN+'/A'].wasteBase,100);
};
scenarios.bao_het_thu_lai_hom_sau_giu_ngay_goc = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});const orig=h.fake.fstore.runTransaction;let fail=true;
  h.fake.fstore.runTransaction=async fn=>{if(fail){fail=false;throw Error('chưa ghi sổ');}return orig(fn);};
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A')));
  const nextDay=engineFor(h.fake,[],'2026-10-20');
  await nextDay.lifecycle.finish('A',doc(999),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A'));
  const rows=Object.entries(h.fake.FS).filter(([k,v])=>k.startsWith(ST+'/')&&v.type==='WASTE').map(([,v])=>v);
  assert.equal(rows.length,1);assert.equal(rows[0].businessDate,'2026-10-19');assert.equal(rows[0].qty,-100);
};
scenarios.pos_thuc_te_thu_lai_khi_ma_da_finished_nhung_rt_chua_don = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});let failures=3;
  wrapRT(h.fake,'active_units_gieogieo/X/A',async(tx,fn)=>{
    if(h.fake.FS[CTN+'/A'].status==='finished' && failures-->0)throw Error('RT cleanup offline');
    return tx(fn);
  });
  const source=extract('posgieo.html',['submitFinishContainer','finishContainerRemaining']);
  const env={UnitEngine:h.UE,fstore:h.fake.fstore,STOCK_CONTAINERS_COLL:CTN,
    resolveStaffPinAndCheckin:async()=>STAFF,prepReconStockBatch:async()=>null,
    isAtomicUnitContainer:()=>false,document:{querySelector:()=>null,getElementById:()=>({checked:true})},
    toast(){},console:{error(){}},fmtPrepQty:String,closeStockScanSheet(){},_refreshStockUseListIfActive(){},refreshFifoAlert:async()=>{}};
  const keys=Object.keys(env),api=new Function(...keys,'let _posSubmitBusy=false;'+source+';return {submitFinishContainer,get busy(){return _posSubmitBusy;}};')(...keys.map(k=>env[k]));
  await api.submitFinishContainer('A',true);
  assert.equal(api.busy,false);assert.equal(h.fake.FS[CTN+'/A'].status,'finished');
  assert.ok(h.fake.rtGet('active_units_gieogieo/X/A/_finishPending'));
  await api.submitFinishContainer('A',true);
  assert.equal(api.busy,false);assert.equal(h.fake.rtGet('active_units_gieogieo/X/A'),undefined);
  assert.deepEqual(waste(h.fake),[-100]);
};
scenarios.tai_lai_engine_suy_ton_don_dau_da_chot = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(500)});let failures=3;
  wrapRT(h.fake,'active_units_gieogieo/X/A',async(tx,fn)=>{
    if(h.fake.FS[CTN+'/A'].status==='finished' && failures-->0)throw Error('cleanup offline');
    return tx(fn);
  });
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A')));
  assert.ok(h.fake.rtGet('active_units_gieogieo/X/A/_finishPending'));
  await engineFor(h.fake).stock.recompute('X');
  assert.equal(h.fake.rtGet('active_units_gieogieo/X/A'),undefined);assert.equal(stock(h),0);
  assert.deepEqual(waste(h.fake),[-100]);
};
scenarios.bao_het_don_vi_rt_mat_khong_doan_form = async()=>{
  const h=make({},{[CTN+'/A']:doc(500)});
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc('A')));
  assert.deepEqual(waste(h.fake),[]);assert.equal(h.fake.FS[CTN+'/A'].status,'open');
};
scenarios.bao_het_no_dang_loi_ma_moi_van_giu_nguoi_bao = async()=>{
  const h=make({X:{A:node(-200)}},{[CTN+'/A']:doc(500),[CTN+'/B']:doc(1000)});let fails=3;
  wrapUpdate(h.fake,CTN,'A',async(update,fields)=>{if(fails-->0)throw Error('FS offline');return update(fields);});
  await assert.rejects(()=>h.UE.lifecycle.finish('A',doc(500),STAFF,'lý do gốc',true,h.fake.fstore.collection(CTN).doc('A')));
  await h.UE.lifecycle.open('B',doc(1000));
  await h.UE.lifecycle.finish('A',doc(500),STAFF,'lý do khác',false,h.fake.fstore.collection(CTN).doc('A'));
  assert.deepEqual(waste(h.fake),[]);assert.equal(h.fake.FS[CTN+'/A'].finishedBy,STAFF.fullName);
  assert.equal(h.fake.FS[CTN+'/A'].finishReason,'lý do gốc');await h.UE.stock.recompute('X');assert.equal(stock(h),800);
};
scenarios.btp_lo_moi_khong_ganh_no_lo_cu = async()=>{
  const prep={id:'P',name:'Cốt thử',unit:'ml',currentStock:300};
  const h=make({P:{old:node(-200)}},{[PI+'/P']:prep,[PB+'/old']:{prepId:'P',status:'active',baseQty:500,unitBase:-200},[PB+'/new']:{prepId:'P',status:'active',baseQty:500,unitBase:500}},[prep]);
  await h.UE.lifecycle.open('new',{itemId:'P',baseQty:500},PB);await h.UE.stock.recompute('P',PB);
  assert.equal(h.fake.rtGet('active_units_gieogieo/P/old/unitBase'),-200);assert.equal(h.fake.rtGet('active_units_gieogieo/P/new/unitBase'),500);
  assert.equal(h.fake.FS[PI+'/P'].currentStock,500);assert.equal(h.fake.FS[PI+'/P'].pendingShortage,200);
};
scenarios.hoan_sau_chuyen_no_va_hoan_lap = async()=>{
  const h=make({X:{A:node(100)}},{[CTN+'/A']:doc(100),[CTN+'/B']:doc(1000,'sealed')});
  const al=await h.UE.consume.allocate('X',300);
  await h.fake.fstore.collection(CTN).doc('B').update({status:'open'});await h.UE.lifecycle.open('B',doc(1000));
  await h.UE.fn.unitEngineReverseAllocations('X',al,undefined,'return_bill');
  await h.UE.fn.unitEngineReverseAllocations('X',al,undefined,'return_bill');await h.UE.stock.recompute('X');
  assert.equal(stock(h),1100);assert.equal(h.fake.rtGet('active_units_gieogieo/X/B/unitBase'),1100);
};
scenarios.mo_khong_ghi_de_lich_su_nhan_vien = async()=>{
  const h=make({X:{A:{...node(-200),finishedDebt:true}}},{[CTN+'/A']:{...doc(-200,'finished'),finishedBy:'NV gốc',finishedAt:'2026-10-18T00:00:00Z',finishReason:'đã báo'},[CTN+'/B']:doc(1000)});
  await h.UE.lifecycle.open('B',doc(1000));const a=h.fake.FS[CTN+'/A'];
  assert.equal(a.finishedBy,'NV gốc');assert.equal(a.finishedAt,'2026-10-18T00:00:00Z');assert.equal(a.finishReason,'đã báo');
};
scenarios.mo_trung_sau_khi_ban_khong_hoi_sinh_hang = async()=>{
  const h=make({X:{A:node(800)}},{[CTN+'/A']:doc(800)});await h.UE.consume.allocate('X',100);
  await h.UE.lifecycle.open('A',doc(1000));assert.equal(h.fake.rtGet('active_units_gieogieo/X/A/unitBase'),700);
};
scenarios.mo_phong_200_buoc_ban_hoan_mo_bao_het = async()=>{
  const h=make({X:{A:node(1000)}},{[CTN+'/A']:doc(1000)});let expected=1000,next=0,seed=19;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const bought=[];
  for(let i=0;i<200;i++){
    const rt=h.fake.rtGet('active_units_gieogieo/X')||{},ids=Object.keys(rt).filter(k=>k!=='__prepLock'),kind=Math.floor(random()*4);
    if(kind===0&&ids.length){const qty=1+Math.floor(random()*450);const al=await h.UE.consume.allocate('X',qty);if(al.length){expected-=qty;bought.push(al);}}
    else if(kind===1){const id='new'+next++;await h.fake.fstore.collection(CTN).doc(id).set(doc(1000));await h.UE.lifecycle.open(id,doc(1000));expected+=1000;}
    else if(kind===2&&bought.length){const al=bought.shift();await h.UE.fn.unitEngineReverseAllocations('X',al,undefined,'r'+i);if(ids.length)expected+=al.reduce((s,a)=>s+a.qty,0);}
    else if(ids.length){const id=ids[0],qty=rt[id].unitBase;await h.UE.lifecycle.finish(id,doc(777),STAFF,'hết',true,h.fake.fstore.collection(CTN).doc(id));expected-=Math.max(0,qty);}
    await h.UE.stock.recompute('X');assert.ok(Math.abs(stock(h)-expected)<1e-6,`bước ${i}: ${stock(h)} != ${expected}`);
  }
};
scenarios.luong_ban_thuong_khong_tang_doc = async()=>{
  const count=async file=>{
    const h=make({X:{A:node(1000)}},{[CTN+'/A']:doc(1000)}),n={fsGet:0,txGet:0,rtOnce:0,rtTx:0};
    const wrapFS=r=>new Proxy(r,{get(target,key){
      const v=target[key];
      if(key==='get')return(...args)=>{n.fsGet++;return v.apply(target,args);};
      if(['doc','where','orderBy','limit'].includes(key))return(...args)=>wrapFS(v.apply(target,args));
      return typeof v==='function'?v.bind(target):v;
    }});
    const coll=h.fake.fstore.collection,tx=h.fake.fstore.runTransaction;
    h.fake.fstore.collection=name=>wrapFS(coll(name));
    h.fake.fstore.runTransaction=fn=>tx(t=>fn(new Proxy(t,{get(target,key){const v=target[key];
      if(key==='get')return(...args)=>{n.txGet++;return v.apply(target,args);};return typeof v==='function'?v.bind(target):v;
    }})));
    const ref=h.fake.db.ref;
    const wrapRTRef=r=>new Proxy(r,{get(target,key){const v=target[key];
      if(key==='child')return id=>wrapRTRef(v.call(target,id));
      if(key==='once')return(...args)=>{n.rtOnce++;return v.apply(target,args);};
      if(key==='transaction')return(...args)=>{n.rtTx++;return v.apply(target,args);};
      return typeof v==='function'?v.bind(target):v;
    }});
    h.fake.db.ref=p=>wrapRTRef(ref(p));
    const ue=engineFor(h.fake,[],'2026-10-19',file);
    await ue.stock.recompute('X');const al=await ue.consume.allocate('X',100,undefined,{type:'order',id:'bill_t'});
    await ue.ledger.apply({itemId:'X',type:'CONSUMPTION',qty:-100,referenceId:'bill_t',txId:'sales_bill_t_X',deriveFromUnits:true,meta:{fifoAllocations:al}});
    assert.equal(stock(h),900);return n;
  };
  assert.deepEqual(await count(FILE),await count('unit_engine.v18.js'));
};
(async()=>{let failed=0;for(const[name,run]of Object.entries(scenarios)){
  try{await run();console.log('ok '+name);}catch(e){failed++;console.log('FAIL '+name+': '+e.message);}
}console.log(failed?'SOME FAIL':'ALL PASS');if(failed)process.exitCode=1;})();
