// Firebase giả có lọc truy vấn và doc ID thật; không mạng, không sửa dữ liệu nguồn.
function makeCashFixture(options={}){
 const clone=x=>JSON.parse(JSON.stringify(x));
 const data={
  expense_config_tc33xofa:{cash:{startDate:'2026-10-18'}},
  stores_gieogieo:{gg01:{name:'Gieo Gieo'}},
  cash_receipts_tc33xofa:{
   tc33_2026_10_18_unused:{store:'other',date:'2026-10-18',received:999},
   'tc33_2026-10-18':{store:'tc33',received:500000,expected:510000,sales:510000,spent:0,at:'2026-10-18T14:00:00Z'},
   'xofa_2026-10-18':{store:'xofa',date:'2026-10-18',received:400000,expected:400000,sales:400000,spent:0}
  },
  daily_closings_gieogieo:{
   '2026-10-18':{status:'closed',handedOverAmount:300000,retainedAmount:100000,finalExpectedCash:420000,finalActualCash:400000,ownerReceipt:{received:300000}},
   '2026-10-19':{businessDate:'2026-10-19',status:'closed',handedOverAmount:350000}
  }
 };
 const rt={menu:[{name:'Tea',type:'Trà'}],
  'orders/2026/oct/19':{a:{total:600000,method:'Tiền mặt',itemsArray:[{name:'Tea',qty:1,price:600000}],createdAt:'2026-10-19T04:00:00Z'}},
  'orders_xolifa/oct/19':{a:{total:700000,method:'TIỀN MẶT',date:'19/10/2026',time:'11:00',itemsArray:[]}}
 };
 const old={tcx:{tc33:{'2026-10-18':{store:'tc33',date:'2026-10-18',received:500000,expected:510000,sales:510000,spent:0}}},gg:{gg01:{'2026-10-18':{state:'ready',received:300000,expected:300000,handed:300000,receipt:{received:300000}}}}};
 const memory=options.noCache?{}:{mg_cash_cache_v1:JSON.stringify(old),mg_cash_cache_v2:JSON.stringify({tcx:{},gg:{}})};
 const reads=[],writes=[];
 const metadata=()=>({fromCache:!!options.offline});
 function snapshot(p,id,value){return{id,exists:value!=null,data:()=>clone(value),metadata:metadata(),ref:ref(p+'/'+id)}}
 function ref(p){return{
  collection:n=>collection(p+'/'+n),
  async get(opts){
   reads.push({doc:p,source:opts?.source});const a=p.split('/'),id=a.pop(),config=p==='expense_config_tc33xofa/cash';
   const offline=options.offline&&(!config||options.offlineConfig);
   const snap=snapshot(a.join('/'),id,offline?null:data[a.join('/')]?.[id]);snap.metadata={fromCache:!!offline};return snap;
  },
  async set(){writes.push(p);throw new Error('Bộ thử chỉ được đọc')},async update(){writes.push(p);throw new Error('Bộ thử chỉ được đọc')}
 }}
 function collection(p){const filters=[];return{
  where(k,op,v){filters.push([k,op,v]);return this},doc:id=>ref(p+'/'+id),
  async get(opts){reads.push({coll:p,filters:clone(filters),source:opts?.source});
   const rows=options.offline||options.emptyQueries?[]:Object.entries(data[p]||{}).filter(([id,x])=>filters.every(([k,op,v])=>op==='=='?x[k]===v:op==='>='?x[k]>=v:x[k]<=v));
   return{metadata:metadata(),docs:rows.map(([id,x])=>snapshot(p,id,x))};
  }
 }}
 const firebase={apps:[{}],database:()=>({ref:p=>({once:async()=>({val:()=>clone(rt[p]||null)})})}),firestore:()=>({collection}),auth:()=>({
  onAuthStateChanged(cb){queueMicrotask(()=>cb({uid:'fake-user'}));return()=>{}},signInWithEmailAndPassword:async()=>{}
 })};
 return{firebase,memory,reads,writes,data,old};
}
module.exports={makeCashFixture};
