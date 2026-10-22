/* Unit Engine 2 — «Bản kiểm toán kho» v1 (lộ trình B2: xuất đủ dữ liệu cho kiểm toán + replay).
 * READ-ONLY, chạy khi người dùng bấm (Quản lý › Trích xuất dữ liệu). Không có listener, không quét nền.
 * Kết quả: { manifest, docs: { "tên_bảng_vật_lý/id": doc }, rt: { "active_units_gieogieo[__ggNN]": {...} } }
 * — docs đọc thẳng được bởi unit_engine2_audit_v1.js / tools/automation/engine2_audit.js.
 * Published versions are immutable: sửa sau khi deploy = unit_engine2_export_v2.js. */
(function(root){
'use strict';
const SCHEMA='gieo-e2-export',VERSION=1,MAX_DAYS=62;
// Bảng DÙNG CHUNG mọi quán (loại G trong data_access) — không thêm hậu tố quán. Test đối chiếu với GieoData.REG.
const SHARED=['price_history','prep_vessels','employees','recipes','recipe_history','prep_recipe_history','special_days'];
const physName=(kind,store)=>kind+'_gieogieo'+(store==='gg01'||SHARED.includes(kind)?'':'__'+store);
// Theo ngày nghiệp vụ (businessDate) — sổ gốc và hồ sơ liên quan family NL có tem (+ BTP cho các family sau).
const BY_DAY=['stock_transactions','prep_transactions','prep_batches','stock_containers','stock_anomalies','daily_closings','daily_openings','shift_segments','duty_cases'];
// Danh mục / lịch sử cần để định giá, quy đổi đơn vị và kiểm bì (đọc hết — ít dòng).
const CATALOG=['inventory_items','prep_items','price_history','prep_vessels','refill_rules'];
const E2_SUBS=['cases','decisions','audits','checkpoints','unit_checkpoints','controls','tasks','measurements','measurement_locks','devices','requests','operations'];
const DAY=86400000;
const stable=v=>v===undefined?'null':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
// Timestamp Firestore → chuỗi ISO (mất phần dưới mili-giây, ghi trong manifest). Giữ nguyên mọi trường khác.
function plain(v){
 if(v&&typeof v.toDate==='function')return v.toDate().toISOString();
 if(Array.isArray(v))return v.map(plain);
 if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v))o[k]=plain(v[k]);return o;}
 return v;
}
async function sha256(text){
 const c=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);
 if(!c?.subtle)return null;
 const b=await c.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function dayList(from,to){const out=[];for(let t=Date.parse(from+'T12:00:00+07:00');t<=Date.parse(to+'T12:00:00+07:00');t+=DAY)out.push(new Date(t+7*3600000).toISOString().slice(0,10));return out;}

/* opts: storeId, from, to (YYYY-MM-DD, giờ VN), coll(kind) → CollectionReference của quán,
 * rtRef(rootName) → RT ref của quán, nameFor(kind)/rtNameFor(rootName) → tên vật lý (mặc định theo quy tắc data_access),
 * serverOffset() → ms lệch giờ máy chủ (tuỳ chọn), onStatus(text), pageSize, limit (mỗi phần), meta (app, phiên bản). */
async function build(opts){
 const store=opts.storeId;if(!/^gg\d{2}$/.test(store||''))throw Error('Bản kiểm toán: cần chọn một điểm bán');
 const {from,to}=opts;if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)throw Error('Bản kiểm toán: khoảng ngày không hợp lệ');
 const days=dayList(from,to);if(days.length>MAX_DAYS)throw Error('Bản kiểm toán: tối đa '+MAX_DAYS+' ngày một lần (đang chọn '+days.length+')');
 const coll=opts.coll,nameFor=opts.nameFor||(k=>physName(k,store)),rtNameFor=opts.rtNameFor||(n=>n+'_gieogieo'+(store==='gg01'?'':'__'+store));
 const pageSize=opts.pageSize||500,limit=opts.limit||50000,now=opts.now||Date.now,status=opts.onStatus||(()=>{});
 const startedAt=new Date(now()).toISOString(),docs={},sections={},errors=[];
 const fromIso=new Date(Date.parse(from+'T00:00:00+07:00')).toISOString(),toIso=new Date(Date.parse(to+'T00:00:00+07:00')+DAY).toISOString();
 function sec(name){return sections[name]||(sections[name]={count:0,truncated:false,keys:[]});}
 function put(name,prefix,snap){const key=prefix+'/'+snap.id;if(!(key in docs)){docs[key]=plain(snap.data());const s=sec(name);s.count++;s.keys.push(key);}}
 async function guard(name,fn){try{await fn();}catch(e){errors.push({phan:name,loi:String(e&&e.message||e)});sec(name).error=String(e&&e.message||e);}}
 // Đọc theo trang bằng con trỏ snapshot; chạm limit → đánh dấu chưa đủ, không cắt âm thầm.
 async function paged(name,prefix,query){
  let last=null,n=0;
  for(;;){
   const s=await (last?query.startAfter(last):query).limit(pageSize).get();
   for(const d of s.docs){if(n>=limit){sec(name).truncated=true;return;}put(name,prefix,d);n++;}
   if(s.docs.length<pageSize)return;last=s.docs[s.docs.length-1];
   status('Đang đọc '+name+'… '+n);
  }
 }
 async function byIds(name,kind,ids){
  const prefix=nameFor(kind),todo=[...new Set(ids)].filter(id=>id&&!((prefix+'/'+id) in docs));
  for(let i=0;i<todo.length;i+=20){
   const snaps=await Promise.all(todo.slice(i,i+20).map(id=>coll(kind).doc(String(id)).get()));
   for(const s of snaps)if(s.exists)put(name,prefix,s);else sec(name).missing=(sec(name).missing||0)+1;
  }
 }
 status('Đang đọc danh mục, lịch sử giá, dụng cụ…');
 for(const k of CATALOG)await guard(k,()=>paged(k,nameFor(k),coll(k)));
 for(const k of BY_DAY){status('Đang đọc '+k+'…');await guard(k,()=>paged(k,nameFor(k),coll(k).where('businessDate','>=',from).where('businessDate','<=',to).orderBy('businessDate')));}
 // Tem: còn sống (nhận trước kỳ vẫn đang giữ hàng) + mọi tem có dòng sổ trong kỳ (nhận trước kỳ, hết trong kỳ).
 status('Đang đọc tem liên quan…');
 await guard('stock_containers_live',()=>paged('stock_containers_live',nameFor('stock_containers'),coll('stock_containers').where('status','in',['sealed','open'])));
 const unitRefs=Object.keys(docs).filter(k=>k.startsWith(nameFor('stock_transactions')+'/')).map(k=>docs[k].containerId||docs[k].referenceId);
 await guard('stock_containers_ref',()=>byIds('stock_containers_ref','stock_containers',unitRefs));
 status('Đang đọc ca làm việc…');
 await guard('employee_shifts',()=>paged('employee_shifts',nameFor('employee_shifts'),coll('employee_shifts').where('checkedInAt','>=',new Date(Date.parse(fromIso)-14*3600000).toISOString()).where('checkedInAt','<',toIso).orderBy('checkedInAt')));
 status('Đang đọc dữ liệu Engine 2…');
 const e2=coll('duty_digests').doc('_engine2'),e2Prefix=nameFor('duty_digests')+'/_engine2';
 await guard('engine2_config',async()=>{const s=await e2.get();if(s.exists){docs[e2Prefix]=plain(s.data());sec('engine2_config').count=1;sec('engine2_config').keys.push(e2Prefix);}});
 for(const n of E2_SUBS)await guard('engine2_'+n,()=>paged('engine2_'+n,e2Prefix+'/'+n,e2.collection(n)));
 status('Đang chụp tem đang mở (RT)…');
 const rt={},rtName=rtNameFor('active_units');let rtAt=null;
 await guard('active_units',async()=>{const v=await opts.rtRef('active_units').once('value');rt[rtName]=plain(v.val()||{});rtAt=new Date(now()).toISOString();sec('active_units').count=Object.keys(rt[rtName]).length;});
 let serverOffsetMs=null;if(opts.serverOffset)try{serverOffsetMs=Number(await opts.serverOffset());}catch(e){errors.push({phan:'serverOffset',loi:String(e.message||e)});}
 // Thao tác dở lúc xuất: cần biết để không coi ảnh chụp giữa chừng là sổ đã khép.
 const val=k=>docs[k];
 const inflight={
  measurementLocks:Object.keys(docs).filter(k=>k.startsWith(e2Prefix+'/measurement_locks/')).length,
  dirtyRequests:Object.keys(docs).filter(k=>k.startsWith(e2Prefix+'/requests/')&&val(k).dirty===true).length,
  queuedMeasurements:Object.keys(docs).filter(k=>k.startsWith(e2Prefix+'/measurements/')&&val(k).status==='queued').length,
  rtPrepLocks:Object.values(rt[rtName]||{}).filter(v=>v&&v.__prepLock).length,
  rtDiscardPending:Object.values(rt[rtName]||{}).reduce((s,units)=>s+Object.values(units||{}).filter(u=>u&&u.discardPending).length,0)
 };
 status('Đang tính mã kiểm (SHA-256)…');
 const hashes={};
 for(const [name,s] of Object.entries(sections))if(s.keys.length)hashes[name]=await sha256(stable(s.keys.slice().sort().map(k=>[k,docs[k]])));
 if(rt[rtName])hashes.active_units=await sha256(stable(rt[rtName]));
 const total=await sha256(stable({docs,rt}));
 const finishedAt=new Date(now()).toISOString();
 const manifest={
  schema:SCHEMA,version:VERSION,store,range:{from,to,days:days.length},timezone:'Asia/Ho_Chi_Minh (UTC+7)',
  startedAt,finishedAt,rtCapturedAt:rtAt,serverOffsetMs,meta:opts.meta||{},
  complete:!errors.length&&!Object.values(sections).some(s=>s.truncated),
  sections:Object.fromEntries(Object.entries(sections).map(([k,s])=>[k,{count:s.count,truncated:s.truncated,...(s.missing?{missing:s.missing}:{}),...(s.error?{error:s.error}:{})}])),
  errors,inflight,hashes,sha256:total,docCount:Object.keys(docs).length,
  notes:[
   'Chỉ đọc. Firestore và Realtime DB đọc ở hai thời điểm khác nhau — KHÔNG phải ảnh chụp nguyên tử; xem inflight và rtCapturedAt.',
   'Timestamp Firestore đổi sang chuỗi ISO (độ chính xác mili-giây).',
   'Không gồm từng bill / thông tin khách; tiêu hao theo bill nằm ở dòng sổ stock_transactions/prep_transactions.',
   'Tem: còn sống + có dòng sổ trong kỳ + nhận trong kỳ. Tem hết trước kỳ và không có dòng sổ trong kỳ không có trong file.',
   'Ca làm việc từ 14 giờ trước ngày đầu (ca qua đêm). File có tên nhân viên — không đưa lên GitHub/nơi công khai.'
  ]
 };
 return {manifest,docs,rt};
}
const api={SCHEMA,VERSION,MAX_DAYS,SHARED,BY_DAY,CATALOG,E2_SUBS,physName,build};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Export=api;
})(typeof window!=='undefined'?window:globalThis);
