const src=['const _posLive = {};','const _mapDocs = snap => { const m = {}; snap.forEach(d => { m[d.id] = d.data(); }); return m; };',require('./lib/extract').extract('posgieo.html',["_posLiveSubscribe", "_posLiveOk", "_posLiveStop", "ensureRecipesLoadedPOS", "loadRefillRulesCachePOS", "refillRulesSnapPOS", "loadEmployeeShiftsTodayCache", "_fifoRebuild"])].join('\n');
let reads=0, listeners=[];
function mkQuery(name,docs,{fromCacheFirst=false,fail=false}={}){
  const q={ onSnapshot(next,err){ if(fail){ setTimeout(()=>err(new Error('perm')),5); return ()=>{}; }
      listeners.push(name); const snap=(fc)=>({metadata:{fromCache:fc},docs:docs.map(d=>({id:d.id,data:()=>d})),forEach(f){this.docs.forEach(f)},exists:true,data:()=>docs[0]});
      if(fromCacheFirst){ setTimeout(()=>next(snap(true)),1); setTimeout(()=>next(snap(false)),20);} else setTimeout(()=>next(snap(false)),1);
      return ()=>{}; },
    where(){return q;}, doc(){return q;}, get: async()=>{ reads++; return {docs:docs.map(d=>({id:d.id,data:()=>d})),forEach(f){this.docs.forEach(f)}}; } };
  return q;
}
let failRules=false;
const ctx={
  fstore:{collection:(c)=> c==='refill_rules_gieogieo'? mkQuery(c,[{id:'r1',itemId:'X',minBase:5}],{fail:failRules}) : mkQuery(c,[{id:'a',sizes:{}}],{fromCacheFirst:true})},
  RECIPES_CACHE_POS:null,RECIPES_CACHE_POS_AT:0,RECIPES_CACHE_POS_TTL:300000,REFILL_RULES_CACHE:[],_employeeShiftsTodayCache:[],posDateKey:()=>'D',
  KHO_ITEMS_CACHE:[{id:'X'}],_fifoRtRoot:null,FIFO_PENDING_CONFIRM:[],renderFifoAlertBar:()=>{},UnitEngine:require('./lib/engine').loadEngineModule()
};
// run as a module sharing mutable globals via 'with'-like wrapper
const f=new Function('ctx', 'with(ctx){'+src+'; return {ensureRecipesLoadedPOS,refillRulesSnapPOS,loadEmployeeShiftsTodayCache,_fifoRebuild,_posLive};}');
(async()=>{
  const F=f(ctx);
  const m=await F.ensureRecipesLoadedPOS(); console.log('recipes live:', !!m.a, 'reads', reads);
  await F.ensureRecipesLoadedPOS(); await F.ensureRecipesLoadedPOS(); console.log('3 calls, listeners', listeners.filter(x=>x==='recipes_gieogieo').length, 'reads', reads);
  const rs=await F.refillRulesSnapPOS(); console.log('rules shim', rs.docs.map(d=>[d.id,d.data().itemId]), 'reads',reads);
  await F.loadEmployeeShiftsTodayCache(); console.log('shifts', JSON.stringify(ctx._employeeShiftsTodayCache.length));
  ctx._fifoRtRoot={X:{u1:{code:'C1',unitBase:0,openedAt:5},u2:{code:'C2',unitBase:10},u3:{code:'C3',unitBase:-2,finishedDebt:true}},P:{b1:{unitBase:-1}}};
  F._fifoRebuild(); console.log('fifo', ctx.FIFO_PENDING_CONFIRM.map(c=>c.code));
})();
setTimeout(async()=>{
  failRules=true; ctx.REFILL_RULES_CACHE=[]; const F2=f({...ctx, fstore:{collection:(c)=>mkQuery(c,[{id:'r9',itemId:'Y'}],{fail:true})}});
  const before=reads; const rs=await F2.refillRulesSnapPOS();
  console.log('fallback rules', rs.docs.map(d=>d.id), 'reads used', reads-before);
  const rs2=await F2.refillRulesSnapPOS(); console.log('no resubscribe spam, reads', reads-before);
},200);
