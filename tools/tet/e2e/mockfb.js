// Firebase giả trong bộ nhớ — chỉ dùng để chạy thử giao diện, KHÔNG nối mạng.
(function(){
  const now = new Date(); const p=n=>String(n).padStart(2,'0');
  const MK=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const y=now.getFullYear(), mon=MK[now.getMonth()], dd=p(now.getDate());
  const yd=new Date(now); yd.setDate(yd.getDate()-1);
  const old=new Date(now); old.setDate(old.getDate()-20);
  const iso=(h,m,d)=>{const x=new Date(d||now);x.setHours(h,m,0,0);return x.toISOString();};
  const RT = {
    menu: [{name:'Cà phê sữa',type:'Cà phê',priceM:25000},{name:'Bánh tráng',type:'Ăn vặt',priceM:15000},{name:'Thuê mền',type:'Khác',priceM:10000}],
    [`orders/${y}/${mon}/${dd}`]: {
      a:{total:50000,method:'Tiền mặt',itemsArray:[{name:'Cà phê sữa',qty:2,price:25000}],createdAt:iso(9,10)},
      b:{total:25000,method:'Chuyển khoản',itemsArray:[{name:'Bánh tráng',qty:1,price:15000},{name:'Thuê mền',qty:1,price:10000}],createdAt:iso(15,0)},
      c:{total:0,method:'Tiền mặt',itemsArray:[{name:'Cà phê sữa',qty:1,price:25000}],createdAt:iso(15,5)}
    },
    [`orders/${yd.getFullYear()}/${MK[yd.getMonth()]}/${p(yd.getDate())}`]: { z:{total:40000,method:'Tiền mặt',items:'Cà phê sữa(M)x1, Bánh tráng(M)x1',createdAt:iso(10,0,yd)} },
    [`orders_xolifa/${mon}/${dd}`]: {
      x1:{total:60000,method:'TIỀN MẶT',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'08:30',isToGo:false,itemsArray:[]},
      x2:{total:80000,method:'CHUYỂN KHOẢN',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'12:15',isToGo:true,foodTotal:30000,foodMethod:'CHUYỂN KHOẢN',isShip:true},
      x3:{total:100000,method:'TÍNH RIÊNG',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'19:00',splitGroups:[{method:'TIỀN MẶT',total:40000},{method:'CHUYỂN KHOẢN',total:60000}]},
      oldx:{total:1,method:'TIỀN MẶT',date:'01/01/2000',time:'10:00'},
      old:{total:999999,method:'TIỀN MẶT',date:`${dd}/${p(now.getMonth()+1)}/${y-1}`,time:'10:00'}
    }
  };
  RT[`orders_gieogieo/${mon}/${dd}`] = {
    g1:{total:45000,method:'TIỀN MẶT',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'09:05'},
    g2:{total:60000,method:'CHUYỂN KHOẢN',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'14:20',foodTotal:20000,foodMethod:'CHUYỂN KHOẢN'},
    g3:{total:50000,method:'TÍNH RIÊNG',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'16:00',splitGroups:[{method:'TIỀN MẶT',total:20000},{method:'CHUYỂN KHOẢN',total:30000}]},
    gold:{total:777777,method:'TIỀN MẶT',date:`${dd}/${p(now.getMonth()+1)}/${y-1}`,time:'09:00'}
  };
  RT[`orders_gieogieo__gg02/${mon}/${dd}`] = { h1:{total:30000,method:'TIỀN MẶT',date:`${dd}/${p(now.getMonth()+1)}/${y}`,time:'10:00'} };
  const FS = { // path -> {id: data}
    employees_gieogieo: {
      e1:{fullName:'Lan Gieo',pin:'1111',active:true,payType:'hourly_part',hourlyRate:20000},
      e2:{fullName:'Minh Cafe',pin:'2222',active:true,payType:'hourly_part',hourlyRate:25000,workStores:['tc33','xofa'],otEnabled:true,otThresholdHours:8,otRate:30000},
      e3:{fullName:'Chủ Gieo',pin:'3333',active:true,payType:'fixed',fixedMonthlySalary:9000000,workStores:['gieo','tc33']}
    },
    employee_shifts_tc33: {
      s1:{employeeId:'e2',employeeName:'Minh Cafe',businessDate:`${y}-${p(now.getMonth()+1)}-${dd}`,checkedInAt:iso(7,0),checkedOutAt:iso(17,30)},
      s2:{employeeId:'e2',employeeName:'Minh Cafe',businessDate:`${old.getFullYear()}-${p(old.getMonth()+1)}-${p(old.getDate())}`,checkedInAt:iso(8,0,old),checkedOutAt:null}
    },
    employee_shifts_xofa: {}, work_schedules_tc33: {}, work_schedules_xofa: {}, hr_settings_tc33xofa: {},
    employee_shifts_gieogieo: { g1:{employeeId:'e2',businessDate:`${y}-${p(now.getMonth()+1)}-${dd}`,checkedInAt:iso(18,0),checkedOutAt:iso(20,0)} },
    rewards: {
      r1:{ label:'Giảm 50% các món trà trái cây khi mua kèm bánh', type:'item', scope:'xolifa', active:true, value:10000, targetItems:['trà lài thơm chanh dây','trà lựu đỏ','trà quýt jeju','cà phê latte','matcha latte','trà vải lài'] },
      r2:{ label:'Giảm 20% tổng hoá đơn cho khách thành viên', type:'percent', scope:'cafe33', active:true, value:20, code:'THANHVIEN20' },
      r3:{ label:'Up size M → L miễn phí', type:'item_upsize', scope:'both', active:false, cost:50, targetItems:['Bạc xỉu','Cafe sữa đá'] }
    },
    stores_gieogieo: { gg01:{name:'Gieo Nguyễn Trãi'}, gg02:{name:'Gieo Quận 3'}, gg03:{name:'Gieo cũ', active:false} },
    config_history_gieogieo: { c1:{effectiveFrom:'2026-01-01', targets:{aov:50000, billsPerDay:31*1000/31*30/30}} },
    [`orders_gieogieo_archive/${y}`]: {},
    revenue_targets_tc33xofa: { months: { m: { [`${y}-${p(now.getMonth())}`]: { tc33: 3100000, xofa: 6200000, all: 8000000 } } } }
  };
  window.__FS = FS; window.__RT = RT; window.__WRITES = [];
  const listeners = [];
  function notify(coll){ listeners.filter(l=>l.coll===coll).forEach(l=>l.fire()); }
  function snapDocs(coll, filters){
    const c = FS[coll] || {};
    return Object.entries(c).filter(([id,d])=>filters.every(([f,op,v])=>{
      const x = d[f] === undefined ? undefined : d[f];
      if(op==='==') return (v===null ? (x===null) : x===v);
      if(op==='>=') return x!=null && x>=v; if(op==='<=') return x!=null && x<=v; return true;
    })).map(([id,d])=>({id, data:()=>JSON.parse(JSON.stringify(d)), exists:true}));
  }
  function query(coll, filters){
    return {
      where(f,op,v){ return query(coll, filters.concat([[f,op,v]])); },
      orderBy(){ return this; }, limit(){ return this; },
      get(){ const docs = snapDocs(coll, filters); return Promise.resolve({ docs, empty: !docs.length, size: docs.length, forEach(cb){ docs.forEach(cb); } }); },
      onSnapshot(cb){ const l={coll, fire:()=>setTimeout(()=>{const docs=snapDocs(coll,filters);cb({docs,empty:!docs.length,size:docs.length,forEach(fn){docs.forEach(fn)}})},5)}; listeners.push(l); l.fire(); return ()=>{ const i=listeners.indexOf(l); if(i>=0) listeners.splice(i,1); }; },
      add(d){ const id='n'+Math.random().toString(36).slice(2,8); (FS[coll]=FS[coll]||{})[id]=JSON.parse(JSON.stringify(d)); window.__WRITES.push(['add',coll,id,d]); notify(coll); return Promise.resolve({id}); },
      doc(id){ const key = coll; return {
        get(){ const d=(FS[key]||{})[id]; return Promise.resolve({exists:!!d, id, data:()=>d?JSON.parse(JSON.stringify(d)):undefined}); },
        set(d,o){ FS[key]=FS[key]||{}; if(o&&o.mergeFields){ const cur=FS[key][id]||{}; o.mergeFields.forEach(fp=>{ const [a,b]=fp.split('.'); cur[a]=cur[a]||{}; cur[a][b]=JSON.parse(JSON.stringify(d[a][b])); }); FS[key][id]=cur; window.__WRITES.push(['set',key,id,d]); notify(key); return Promise.resolve(); } FS[key][id]= (o&&o.merge) ? Object.assign({},FS[key][id]||{},d) : JSON.parse(JSON.stringify(d)); window.__WRITES.push(['set',key,id,d]); notify(key); return Promise.resolve(); },
        update(d){ FS[key][id]=Object.assign({},FS[key][id],d); window.__WRITES.push(['update',key,id,d]); notify(key); return Promise.resolve(); },
        delete(){ delete FS[key][id]; window.__WRITES.push(['delete',key,id]); notify(key); return Promise.resolve(); },
        collection(sub){ return query(key+'/'+id+'/'+sub, []); }
      }; }
    };
  }
  const user = {uid:'u'};
  window.firebase = {
    apps: [], initializeApp(){ this.apps.push(1); },
    database(){ const mk = path => { const snap = ()=>{ const v = RT[path]; return { key: String(path).split('/').pop(), val:()=>v===undefined?null:JSON.parse(JSON.stringify(v)), exists:()=>v!==undefined, forEach(cb){ const o=v||{}; Object.keys(o).forEach(k=>cb({key:k,val:()=>o[k]})); } }; };
      const r = { key: String(path).split('/').pop(), once(ev, cb){ const s0 = snap(); if(typeof cb==='function'){ cb(s0); } return Promise.resolve(s0); }, on(ev, cb){ if(ev==='value') setTimeout(()=>cb(snap()),5); return cb; }, off(){}, set(){ return Promise.resolve(); }, update(){ return Promise.resolve(); }, remove(){ return Promise.resolve(); }, push(){ return Object.assign(mk(path+'/p'+Math.random().toString(36).slice(2,8)), { then:undefined }); }, transaction(){ return Promise.resolve({committed:false}); }, child(k){ return mk(path+'/'+k); }, toString(){ return 'https://x.com/'+path; } };
      ['limitToLast','limitToFirst','orderByChild','orderByKey','equalTo','startAt','endAt'].forEach(m=>r[m]=()=>r); return r; };
      return { ref: mk, ServerValue:{TIMESTAMP:0} }; },
    firestore: Object.assign(function(){ return { collection:(c)=>query(c,[]), enablePersistence(){ return Promise.resolve(); } }; }, { FieldValue:{} }),
    auth(){ return { currentUser:user, onAuthStateChanged(cb){ setTimeout(()=>cb(user),1); return ()=>{}; }, signInWithEmailAndPassword(){ return Promise.resolve({user}); } }; }
  };
})();
