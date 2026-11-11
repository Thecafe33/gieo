'use strict';
/* Đ0 — ĐO TẢI Engine 2 (docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md). CHỈ ĐO, không đổi app.
 * Chạy mã THẬT (worker functions/automation, store Engine 2, cầu nối POS, kho v21) trên Firebase giả và đếm như Firestore tính phí:
 *   đọc một tài liệu = 1 · truy vấn = số tài liệu trả về (tối thiểu 1) · count() = 1 / 1000 dòng · gồm cả t.get() trong transaction.
 *   ghi = mỗi set / update / delete (kể cả trong transaction, batch). vòng mạng = mỗi get / transaction / lần ghi lẻ / batch.commit.
 * Dùng:  node tools/automation/engine2_do_tai.js [--pos v4] [--store v4] [--quan 10] [--json]
 * Bản mới (v5…) đo bằng cùng công cụ: --pos v5 --store v5 → so hai bảng. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT_DIR=path.join(__dirname,'../..');
const E=require(path.join(ROOT_DIR,'unit_engine2_v1'));
const {makeFake}=require(path.join(ROOT_DIR,'tests/lib/fakefb'));
const {createEngine}=require(path.join(ROOT_DIR,'functions/automation/engine'));
const {createWorker,rootPath,configPath}=require(path.join(ROOT_DIR,'functions/automation/worker'));
const {createQueue}=require(path.join(ROOT_DIR,'functions/automation/queue'));
const {createEngine2Worker}=require(path.join(ROOT_DIR,'functions/automation/engine2'));
const A=require(path.join(ROOT_DIR,'functions/automation/shared/gieo_automation.v3'));
const STORE='gg01',ROOT=E.rootPath(STORE),DAY='2026-10-22';
const clone=v=>JSON.parse(JSON.stringify(v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ── Bộ đếm quanh Firestore giả ─────────────────────────────────────────────────────────────────────────────
const bill=r=>r&&Array.isArray(r.docs)?Math.max(1,r.docs.length):r&&typeof r.data==='function'&&r.exists===undefined&&r.data()&&typeof r.data().count==='number'?Math.max(1,Math.ceil(r.data().count/1000)):1;
const WRITE=/^fs\.(tx\.|batch\.)?(set|update|delete|add)$/;
function meter(f){
 const c={reads:0,trips:0,w0:0};
 const wrap=o=>new Proxy(o,{get(target,k){
  const v=target[k];if(typeof v!=='function')return v;
  if(k==='get')return (...a)=>{c.trips++;return Promise.resolve(v.apply(target,a)).then(r=>{c.reads+=bill(r);return r;});};
  if(k==='runTransaction')return fn=>{c.trips++;return v.call(target,t=>fn(new Proxy(t,{get(tt,kk){const vv=tt[kk];return kk==='get'?(...a)=>Promise.resolve(vv.apply(tt,a)).then(r=>{c.reads+=bill(r);return r;}):typeof vv==='function'?vv.bind(tt):vv;}})));};
  return (...a)=>{if(['set','update','delete','add','commit'].includes(k)&&typeof target.path==='string'||k==='commit')c.trips++;const r=v.apply(target,a);return r&&typeof r==='object'&&typeof r.then!=='function'?wrap(r):r;};
 }});
 const writes=()=>f.log.filter(x=>WRITE.test(x[0])).length;
 const snap=()=>({reads:c.reads,writes:writes(),trips:c.trips});
 return {fs:wrap(f.fstore),snap,since:s=>{const n=snap();return {reads:n.reads-s.reads,writes:n.writes-s.writes,trips:n.trips-s.trips};}};
}
const add=(a,b)=>({reads:a.reads+b.reads,writes:a.writes+b.writes,trips:a.trips+b.trips});
const ZERO={reads:0,writes:0,trips:0};

// ── Thế giới mẫu: một quán theo giả định mục 3 của kế hoạch ─────────────────────────────────────────────────
// controlled món Engine 2 kiểm soát (2 món đầu vốn nằm trong danh sách cân bắt buộc), m0 món cân ngẫu nhiên, 3 món chỉ bắt buộc.
function world({controlled=5,m0=2,heartbeatAt,tonCu=true}={}){
 const items=[],rt={},docs={};
 // Tồn cũ có thật ở quán đang chạy: 40 thông báo «để biết» còn trạng thái new + 30 dòng nấu mẻ needsReview TRƯỚC ngày áp dụng (gg01 ~85).
 if(tonCu){for(let i=0;i<40;i++)docs['alerts_gieogieo/fyi'+i]={type:'prep_variance_large',status:'new',fyi:true,businessDate:'2026-10-2'+(i%2)};
  for(let i=0;i<30;i++)docs['stock_transactions_gieogieo/prep_after_old'+i+'_x']={type:'WASTE',needsReview:true,businessDate:'2026-09-1'+(i%9),itemId:'c0',qty:-5};}
 const mk=(id,name,extra={})=>{const it={id,name,unit:'g',trackingMode:'unit',stockManaged:true,currentStock:400,costPerUnit:100,packagingUnits:[],...extra};items.push(it);
  rt[id]={['u_'+id]:{code:'M'+id.toUpperCase().padEnd(7,'0'),unitBase:400,capacity:500,openedAt:Date.parse('2026-10-21T03:00:00Z')}};
  docs['inventory_items_gieogieo/'+id]=it;docs['stock_containers_gieogieo/u_'+id]={itemId:id,itemName:name,unit:'g',status:'open',baseQty:500,unitBase:400,openedAt:'2026-10-21T03:00:00Z',code:rt[id]['u_'+id].code};
  docs['price_history_gieogieo/p_'+id]={itemId:id,effectiveFrom:'2026-09-01',price:100};};
 const ctl=[],rnd=[],must=[];
 for(let i=0;i<controlled;i++){const id='c'+i;mk(id,'Kiểm soát '+i,i<2?{shiftCountTiming:'close'}:{});ctl.push(id);docs[ROOT+'/controls/'+id]={level:2,itemId:id,itemName:'Kiểm soát '+i,revision:1,manualFloor:0,storeId:STORE};}
 for(let i=0;i<m0;i++){const id='r'+i;mk(id,'Ngẫu nhiên '+i);rnd.push(id);docs[ROOT+'/tasks/m0~'+id]={id:'m0~'+id,itemId:id,kind:'weigh_open_units',sampling:'random_m0',pending:true,status:'queued',createdAt:DAY+'T01:00:00.000Z',storeId:STORE};}
 for(let i=0;i<3;i++){const id='b'+i;mk(id,'Bắt buộc '+i,{shiftCountTiming:'close'});must.push(id);}
 const f=makeFake({rt:{active_units_gieogieo:rt},fs:{
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:ctl,settingsRevision:3,revision:1,workerHeartbeatAt:heartbeatAt||new Date().toISOString()},
  [configPath(STORE)]:{enabled:true,mode:'active',fleet20Confirmed:true,startDate:'2026-10-01'},
  [rootPath(STORE)]:{bootstrapPolicyVersion:A.VERSION,ready:true,countsVerifiedVersion:A.VERSION,errorStateVersion:1,bootstrap:{phase:999,cursor:''}},
  [ROOT+'/devices/pos1']:{storeId:STORE,protocolVersion:1,settingsRevision:3,controlRevision:1,ackedAt:DAY+'T00:00:00.000Z'},
  'prep_vessels_gieogieo/v':{name:'Hũ',variants:[{id:'a',tareG:100}]},
  'ingredient_original_packs_gieogieo/p':{name:'Chai gốc',variants:[{id:'pv',label:'Chai 500 g',tareG:40}]},
  'employee_shifts_gieogieo/sb':{employeeId:'b',employeeName:'B',roles:['barista'],businessDate:DAY,checkedInAt:DAY+'T02:00:00.000Z',checkedOutAt:DAY+'T13:00:00.000Z'},
  ...docs}});
 f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return f.fstore.collection(a.join('/')).doc(id);};   // Admin SDK có db.doc(đường dẫn)
 return {f,items,ctl,rnd,must};
}
function workers(f,db,now){
 const engines=new Map(),getEngine=s=>{if(!engines.has(s))engines.set(s,createEngine({storeId:s,fstore:db,db:f.db,FieldValue:f.FieldValue}));return engines.get(s);};
 let queue;const worker=createWorker(db,{now,getEngine,retrySourceErrors:s=>queue.retrySourceErrors(s)});queue=createQueue(db,worker,{now});
 return {worker,queue,engine2:createEngine2Worker({db,rt:f.db,FieldValue:f.FieldValue,now})};
}

// ── 1. Một ngày 96 nhịp đồng hồ, KHÔNG có việc gì (index.js › gieoAutomationClock) ─────────────────────────
// lanh=true: mỗi nhịp một instance mới (bộ nhớ «hôm nay đã học» mất) — trường hợp khởi động lạnh.
async function nhip({lanh=false}={}){
 const {f}=world(),m=meter(f);let now=Date.parse(DAY+'T10:00:00+07:00'),w=workers(f,m.fs,()=>now);
 const parts={engine2:ZERO,queue:ZERO,tickStore:ZERO},ticks=[];
 for(let i=0;i<96;i++,now+=15*60000){
  if(lanh)w=workers(f,m.fs,()=>now);
  const t0=m.snap();
  for(const [name,run] of [['engine2',()=>w.engine2.tick(STORE)],['queue',()=>w.queue.retryDue(STORE)],['tickStore',()=>w.worker.tickStore(STORE)]]){const s=m.snap();await run();parts[name]=add(parts[name],m.since(s));}
  ticks.push(m.since(t0));
 }
 const sorted=[...ticks].sort((a,b)=>a.reads-b.reads),hoc=sorted.at(-1),thuong=sorted[Math.floor(sorted.length/2)];
 const heartbeats=f.log.filter(x=>WRITE.test(x[0])&&x[1]===ROOT).length;
 return {tong:ticks.reduce(add,ZERO),nhipThuong:thuong,nhipHoc:hoc,parts,ghiLenTaiLieuDieuKhien:heartbeats};
}

// ── 2. Kết ca ở POS (cầu nối thật + kho thật) + worker hoàn tất các lượt cân ────────────────────────────────
async function ketCa({pos='v4',store='v4'}={}){
 const Store=require(path.join(ROOT_DIR,'unit_engine2_store_'+store));
 const SRC=fs.readFileSync(path.join(ROOT_DIR,'gieo_engine2_pos_'+pos+'.js'),'utf8');
 const {f,items,ctl,rnd,must}=world(),mp=meter(f),mw=meter(f),NOW=Date.parse(DAY+'T04:00:00Z');
 const inv=createEngine({storeId:STORE,fstore:mp.fs,db:f.db,FieldValue:f.FieldValue,now:()=>NOW,items});
 const g=globalThis,saved={};for(const k of ['window','document','localStorage'])saved[k]=g[k];
 g.window=g;g.document={readyState:'complete'};g.addEventListener=()=>{};g.localStorage={s:{},getItem(k){return this.s[k]??null;},setItem(k,v){this.s[k]=String(v);},removeItem(k){delete this.s[k];}};
 g.UnitEngine2=E;g.UnitEngine2Store=Store;g.UnitEngine2Staffing=require(path.join(ROOT_DIR,'unit_engine2_staffing_v1'));
 g.fstore=mp.fs;g.db=f.db;g.POS_STORE={storeId:STORE};g.GieoData={collFor:name=>mp.fs.collection(name)};
 g.UnitEngine={VERSION:inv.VERSION,clock:{now:()=>NOW},units:inv.units,shift:{...inv.shift}};
 g.KHO_ITEMS_CACHE=clone(items);g.shiftState={businessDate:DAY};g.posDateKey=d=>d?new Date(d.getTime()+7*3600000).toISOString().slice(0,10):DAY;g.ensureKhoItemsPOS=async()=>{};g.toast=()=>{};
 g.shiftWeighIsTemItemPOS=it=>it.trackingMode==='unit';
 g.shiftWeighTemLinePOS=(it,node,reasons)=>{const open=Object.entries(node||{}).filter(([id,v])=>id!=='__prepLock'&&v&&!v.finishedDebt).map(([id,v])=>({id,code:v.code,openedAt:v.openedAt,capacity:v.capacity,state:'pending'}));return open.length?{itemId:it.id,itemName:it.name,unit:it.unit,mode:'tem',layer:reasons.length?'anomaly':'config',reasons,units:open}:null;};
 g.shiftWeighLineHTML=l=>JSON.stringify({reasons:l.reasons||[]});g._employeeShiftsTodayCache=[];g.loadEmployeeShiftsTodayCache=async()=>{};
 g.computeHandoverOpenLinesPOS=async()=>[];
 // Danh sách cân bắt buộc sẵn có của POS: 3 món chỉ bắt buộc + 2 món kiểm soát vốn bắt buộc (không tính lượt đọc của phần POS gốc).
 const base=[...must,...ctl.slice(0,2)].map(id=>g.shiftWeighTemLinePOS(items.find(x=>x.id===id),f.rtGet('active_units_gieogieo/'+id),[]));
 g.computeShiftInventoryCountLinesPOS=async()=>clone(base);
 delete g.GieoEngine2POS;vm.runInThisContext(SRC);
 await g.computeShiftInventoryCountLinesPOS('close');await sleep(40);        // khởi tạo + nhận cấu hình (không tính)
 const out={};
 // (a) mở màn kết ca: dựng danh sách
 let s=mp.snap();const lines=await g.computeShiftInventoryCountLinesPOS('close');out.dungDanhSach=mp.since(s);
 // (a') mở lại màn (nhân viên thoát ra vào lại sau 20 giây — hết bộ nhớ 15 giây của cầu nối v4)
 if(g.GieoEngine2POS&&g.GieoEngine2POS._resetCache)g.GieoEngine2POS._resetCache();
 const realNow=Date.now;Date.now=()=>realNow()+20000;s=mp.snap();await g.computeShiftInventoryCountLinesPOS('close');out.dungLaiDanhSach=mp.since(s);Date.now=realNow;
 const e2=lines.filter(l=>l.e2);
 // (b) ghi từng dòng cân — tách phần Engine 2 thêm vào so với dòng thường
 const staff={id:'b',fullName:'B'},fill=l=>{const live=f.rtGet('active_units_gieogieo/'+l.itemId+'/'+l.units[0].id);
  l.units=[{id:l.units[0].id,code:live.code,openedAt:live.openedAt,capacity:500,state:'confirmed',confirmVia:'scan',manualReason:'',weighed:380,baseline:400,baselineSig:inv.shift.absSig(live),
   countedAt:new Date(NOW-60000).toISOString(),seq:0,gone:false,weighings:[{vesselId:'v',vesselName:'Hũ',variantId:'a',tareG:100,grossG:480}]}];return l;};
 let e2Sum=ZERO,plainSum=ZERO,nE2=0,nPlain=0,fallback=0;
 for(const l of lines){fill(l);s=mp.snap();await g.UnitEngine.shift.applyLine(l,DAY,staff);const d=mp.since(s);
  if(l.e2){e2Sum=add(e2Sum,d);nE2++;if(!l.engine2Owner)fallback++;}else{plainSum=add(plainSum,d);nPlain++;}}
 await sleep(40);
 const per=(x,n)=>n?{reads:x.reads/n,writes:x.writes/n,trips:x.trips/n}:ZERO,pE2=per(e2Sum,nE2),pPlain=per(plainSum,nPlain);
 out.dongEngine2=nE2;out.dongThuong=nPlain;out.posTuGhi=fallback;out.moiDongEngine2=pE2;out.moiDongThuong=pPlain;
 out.engine2ThemMoiDong={reads:pE2.reads-pPlain.reads,writes:pE2.writes-pPlain.writes,trips:pE2.trips-pPlain.trips};
 out.posTong=add(add(out.dungDanhSach,e2Sum),ZERO);
 // (c) worker hoàn tất các lượt cân đã xếp hàng (trigger _engine2_request → drain)
 let now=Date.now()+5000;const w=workers(f,mw.fs,()=>now);s=mw.snap();   // POS xếp hàng theo giờ máy thật
 for(let round=0;round<6;round++){const n=await w.engine2.service(STORE).retryDue();if(!n)break;now+=1000;}
 out.workerHoanTat=mw.since(s);out.luotCanXong=Object.entries(f.FS).filter(([p,d])=>p.startsWith(ROOT+'/measurements/')&&d.status==='done').length;
 for(const k of Object.keys(saved))g[k]=saved[k];
 return out;
}

// ── 3. Các tín hiệu lẻ ở worker ─────────────────────────────────────────────────────────────────────────────
async function tinHieu(){
 const out={};
 {// Báo hết còn dư: hai trigger (dòng WASTE + tem finished) → một việc → drain
  const {f}=world(),m=meter(f);let now=Date.parse('2026-10-22T02:50:00Z');const w=workers(f,m.fs,()=>now);
  const tx={itemId:'c0',referenceId:'u_c0',type:'WASTE',qty:-120,createdAt:'2026-10-22T02:49:00.000Z',businessDate:DAY,note:'Báo hết'};
  const before=clone(f.FS['stock_containers_gieogieo/u_c0']),after={...before,status:'finished',finishedAt:'2026-10-22T02:49:00.000Z',wasteBase:120,wasteBasis:'unit_engine'};
  f.FS['stock_transactions_gieogieo/finish_u_c0_WASTE']=tx;f.FS['stock_containers_gieogieo/u_c0']=after;
  const s=m.snap();await w.engine2.source(STORE,'stock_transactions','finish_u_c0_WASTE',null,tx);await w.engine2.source(STORE,'stock_containers','u_c0',before,after);
  for(let i=0;i<4&&await w.engine2.service(STORE).retryDue();i++)now+=1000;out.baoHet=m.since(s);
 }
 {// Đổi ca: pha chế ra ca → handover + recompute_shift + discover_shift
  const {f}=world(),m=meter(f);let now=Date.parse('2026-10-22T13:00:05Z');const w=workers(f,m.fs,()=>now);
  const after=clone(f.FS['employee_shifts_gieogieo/sb']),before={...after};delete before.checkedOutAt;
  const s=m.snap();await w.engine2.source(STORE,'employee_shifts','sb',before,after);
  for(let i=0;i<6&&await w.engine2.service(STORE).retryDue();i++)now+=1000;out.doiCa=m.since(s);
 }
 {// Bán một bill: 6 dòng trừ kho CONSUMPTION + 6 lần đổi tồn — trigger chạy nhưng không được đọc / ghi gì
  const {f}=world(),m=meter(f),now=Date.parse('2026-10-22T05:00:00Z'),w=workers(f,m.fs,()=>now),s=m.snap();
  for(let i=0;i<6;i++){const row={itemId:'c'+(i%5),type:'CONSUMPTION',qty:-10,businessDate:DAY,createdAt:new Date(now).toISOString()};
   await w.engine2.source(STORE,'stock_transactions','bill1_'+i,null,row);await w.queue.enqueue(STORE,'stock_transactions','bill1_'+i,null,row);
   const it={name:'x',currentStock:400,minStock:0},it2={...it,currentStock:390};await w.engine2.source(STORE,'inventory_items','c'+(i%5),it,it2);await w.queue.enqueue(STORE,'inventory_items','c'+(i%5),it,it2);}
  out.banMotBill={...m.since(s),lanGoiFunction:12};
 }
 return out;
}

// ── Tổng hợp theo giả định mục 3: mỗi quán / ngày ───────────────────────────────────────────────────────────
async function run(opts={}){
 const [am,lanh,kc,th]=[await nhip(),await nhip({lanh:true}),await ketCa(opts),await tinHieu()];
 const mayPos=opts.mayPos||1.5,quan=opts.quan||10;
 const khongViec={reads:am.nhipThuong.reads*96+am.ghiLenTaiLieuDieuKhien*mayPos,writes:am.nhipThuong.writes*96,trips:am.nhipThuong.trips*96};
 const hoc={reads:am.nhipHoc.reads-am.nhipThuong.reads,writes:am.nhipHoc.writes-am.nhipThuong.writes,trips:am.nhipHoc.trips-am.nhipThuong.trips};
 const coViec=[kc.posTong,kc.workerHoanTat,th.baoHet,{reads:th.doiCa.reads*3,writes:th.doiCa.writes*3,trips:th.doiCa.trips*3},hoc].reduce(add,ZERO);
 const tong=add(khongViec,coViec),x=(o,n)=>({reads:Math.round(o.reads*n),writes:Math.round(o.writes*n)});
 return {phienBan:{pos:opts.pos||'v4',store:opts.store||'v4'},nhipAm:am,nhipLanh:lanh,ketCa:kc,tinHieu:th,
  motQuanMotNgay:{khongViec,coViec,tong,tiLeKhongViec:{reads:khongViec.reads/tong.reads,writes:khongViec.writes/tong.writes}},
  chuoi:{quan,ngay:x(tong,quan),thang:x(tong,quan*30),khongViecNgay:x(khongViec,quan),lanhNgay:x(lanh.tong,quan)}};
}
function report(r){
 const f=o=>String(Math.round(o.reads)).padStart(6)+' đọc '+String(Math.round(o.writes)).padStart(5)+' ghi'+(o.trips!=null?String(Math.round(o.trips*10)/10).padStart(7)+' vòng mạng':'');
 const L=[];
 L.push('ĐO TẢI ENGINE 2 — cầu nối POS '+r.phienBan.pos+', store '+r.phienBan.store+' (Firebase giả, mã thật)');
 L.push('');L.push('1. Nhịp 15 phút, KHÔNG có việc (một quán)');
 L.push('   một nhịp thường           '+f(r.nhipAm.nhipThuong));
 for(const [k,v] of Object.entries(r.nhipAm.parts))L.push('   cả ngày · '+k.padEnd(15)+f(v));
 L.push('   cả ngày 96 nhịp (ấm)      '+f(r.nhipAm.tong)+'   ← gồm 1 lượt học');
 L.push('   cả ngày 96 nhịp (LẠNH)    '+f(r.nhipLanh.tong)+'   ← mỗi nhịp một instance mới');
 L.push('   ghi lên tài liệu điều khiển (đánh thức trigger thiết lập + máy POS đang nghe): '+r.nhipAm.ghiLenTaiLieuDieuKhien+' lần / ngày');
 L.push('   lượt học + 4 lượt quét    '+f({reads:r.nhipAm.nhipHoc.reads-r.nhipAm.nhipThuong.reads,writes:r.nhipAm.nhipHoc.writes-r.nhipAm.nhipThuong.writes}));
 L.push('');L.push('2. Kết ca: '+r.ketCa.dongEngine2+' dòng Engine 2 + '+r.ketCa.dongThuong+' dòng thường (POS tự ghi: '+r.ketCa.posTuGhi+', worker hoàn tất: '+r.ketCa.luotCanXong+')');
 L.push('   POS dựng danh sách        '+f(r.ketCa.dungDanhSach));
 L.push('   POS dựng LẠI danh sách    '+f(r.ketCa.dungLaiDanhSach));
 L.push('   POS mỗi dòng thường       '+f(r.ketCa.moiDongThuong));
 L.push('   POS mỗi dòng Engine 2     '+f(r.ketCa.moiDongEngine2));
 L.push('   → Engine 2 THÊM mỗi dòng  '+f(r.ketCa.engine2ThemMoiDong)+'   ← nhân viên chờ thêm');
 L.push('   worker hoàn tất cả lượt   '+f(r.ketCa.workerHoanTat));
 L.push('');L.push('3. Tín hiệu lẻ ở worker');
 L.push('   báo hết còn dư            '+f(r.tinHieu.baoHet));
 L.push('   một lần đổi ca            '+f(r.tinHieu.doiCa));
 L.push('   bán một bill (12 lần gọi) '+f(r.tinHieu.banMotBill));
 const q=r.motQuanMotNgay,c=r.chuoi;
 L.push('');L.push('4. Một quán / ngày (1 kết ca, 1 báo hết, 3 đổi ca, 1 lượt học)');
 L.push('   không có việc             '+f(q.khongViec)+'   = '+Math.round(q.tiLeKhongViec.reads*100)+'% đọc, '+Math.round(q.tiLeKhongViec.writes*100)+'% ghi');
 L.push('   có việc                   '+f(q.coViec));
 L.push('   tổng                      '+f(q.tong));
 L.push('');L.push('5. '+c.quan+' quán');
 L.push('   mỗi ngày                  '+f(c.ngay)+'   (trong đó không có việc: '+f(c.khongViecNgay)+')');
 L.push('   mỗi tháng                 '+f(c.thang));
 L.push('   riêng nhịp nếu LẠNH       '+f(c.lanhNgay)+' / ngày');
 return L.join('\n');
}
module.exports={run,report,nhip,ketCa,tinHieu,world,meter};
if(require.main===module){
 const arg=k=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:undefined;};
 run({pos:arg('pos'),store:arg('store'),quan:Number(arg('quan'))||10}).then(r=>{console.log(process.argv.includes('--json')?JSON.stringify(r,null,1):report(r));}).catch(e=>{console.error(e);process.exit(1);});
}
