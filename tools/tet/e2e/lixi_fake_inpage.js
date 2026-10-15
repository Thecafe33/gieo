window.__LXFS = {};
window.__lxFake = (function(){
  var DB = window.__LXFS;
  function clone(v){ return v===undefined?undefined:JSON.parse(JSON.stringify(v)); }
  function merge(dst, src){ Object.keys(src).forEach(function(k){ var v=src[k]; if(v&&v.__inc){ dst[k]=(dst[k]||0)+v.__inc; } else if(v&&typeof v==='object'&&!Array.isArray(v)&&dst[k]&&typeof dst[k]==='object'){ merge(dst[k],v); } else dst[k]=clone(v); }); return dst; }
  function dot(dst, upd){ Object.keys(upd).forEach(function(p){ var ks=p.split('.'), o=dst; ks.slice(0,-1).forEach(function(k){ o[k]=o[k]||{}; o=o[k]; }); o[ks[ks.length-1]]=clone(upd[p]); }); }
  function ref(c,id){ var k=c+'/'+id; return { _k:k, id:id,
    get:function(){ return Promise.resolve({exists:DB[k]!==undefined, id:id, data:function(){return clone(DB[k]);}, ref:ref(c,id)}); },
    set:function(d,o){ DB[k] = (o&&o.merge&&DB[k]) ? merge(DB[k],d) : merge({},d); return Promise.resolve(); },
    update:function(d){ dot(DB[k],d); return Promise.resolve(); } }; }
  var fs = { collection:function(c){ return { doc:function(id){ return ref(c,id); }, limit:function(){ return this; },
      get:function(){ var docs=Object.keys(DB).filter(function(k){return k.indexOf(c+'/')===0;}).map(function(k){ var id=k.slice(c.length+1); return {id:id,data:function(){return clone(DB[k]);},ref:ref(c,id)}; }); return Promise.resolve({docs:docs,empty:!docs.length,forEach:function(f){docs.forEach(f);}}); } }; },
    runTransaction:function(fn){ var ops=[]; var tx={ get:function(r){ return r.get(); }, set:function(r,d,o){ ops.push(function(){ r.set(d,o); }); }, update:function(r,d){ ops.push(function(){ r.update(d); }); } };
      return Promise.resolve(fn(tx)).then(function(v){ ops.forEach(function(o){o();}); return v; }); },
    batch:function(){ var ops=[]; return { delete:function(r){ ops.push(function(){ delete DB[r._k]; }); }, commit:function(){ ops.forEach(function(o){o();}); return Promise.resolve(); } }; } };
  return { fstore: fs, FieldValue: { increment:function(n){ return {__inc:n}; } } };
})();
