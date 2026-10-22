'use strict';
// Lộ trình Engine 2 — B2: «Bản kiểm toán kho» (unit_engine2_export_v2.js).
// Xuất từ dữ liệu sạch dựng bằng luồng thật → đưa thẳng vào bộ kiểm toán độc lập phải ĐẠT 0/0;
// chỉ đọc; phân trang không đổi nội dung; chạm giới hạn / lỗi một phần → manifest.complete=false.
const assert=require('node:assert');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const X=require('../unit_engine2_export_v2');
const A=require('../unit_engine2_audit_v1');
const {makeFake}=require('./lib/fakefb');
const {cleanState,ROOT}=require('./lib/engine2_fixture');
const {GieoData}=require('../data_access.v9.js');
const RANGE={storeId:'gg01',from:'2026-10-14',to:'2026-10-22'};
const opts=(f,extra={})=>({...RANGE,coll:k=>f.fstore.collection(X.physName(k,'gg01')),rtRef:n=>f.db.ref(n+'_gieogieo'),serverOffset:async()=>-120,meta:{app:'test'},...extra});
const writes=f=>f.log.filter(x=>/^(fs\.(set|update|delete)|rt\.(set|update|remove|tx|push))/.test(x[0])).length;

(async()=>{
 const f=await cleanState(),before=writes(f);
 const out=await X.build(opts(f));
 assert.equal(writes(f),before,'bản xuất không được ghi gì');
 const m=out.manifest;
 assert.equal(m.schema,'gieo-e2-export');assert.equal(m.complete,true,JSON.stringify(m.errors));assert.equal(m.store,'gg01');assert.equal(m.range.days,9);assert.equal(m.serverOffsetMs,-120);
 assert(out.docs['stock_containers_gieogieo/u'],'tem nhận trước kỳ (không có businessDate) vẫn có vì có dòng sổ báo hết trong kỳ');
 assert(out.docs['stock_containers_gieogieo/n'],'tem đang mở');
 for(const k of ['stock_transactions_gieogieo/finish_u_WASTE','price_history_gieogieo/price','prep_vessels_gieogieo/v','inventory_items_gieogieo/j',ROOT,ROOT+'/controls/j',ROOT+'/devices/pos1'])assert(out.docs[k],'thiếu '+k);
 assert.equal(Object.keys(out.docs).filter(k=>k.startsWith(ROOT+'/cases/')).length,3);
 assert.equal(Object.keys(out.docs).filter(k=>k.startsWith(ROOT+'/checkpoints/')).length,2);
 assert.equal(out.rt.active_units_gieogieo.j.n.unitBase,200,'RT đúng số sau hai lượt cân');
 assert(m.sections.employee_shifts.count>=6);assert.equal(m.version,2);assert(!m.sections.stock_containers_ref?.missing,'v2: không đếm mã bill là thiếu tem');assert(Object.keys(out.docs).some(k=>k.startsWith(ROOT+'/obs/')),'v2: có quan sát học');assert.equal(m.inflight.measurementLocks,0);assert.match(m.sha256,/^[0-9a-f]{64}$/);
 assert(Object.values(out.docs).every(d=>!JSON.stringify(d).includes('"seconds"')));
 console.log('ok Xuất đủ: sổ gốc, tem liên quan (kể cả nhận trước kỳ), ca, giá, dụng cụ, Engine 2, RT tem đang mở; chỉ đọc');

 const r=await A.run({...RANGE,fstore:makeFake({fs:JSON.parse(JSON.stringify(out.docs))}).fstore});
 assert.equal(r.violations+r.warnings,0,A.summary(r));assert.equal(r.ok,true);assert.equal(r.coverage.cases,3);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'e2x-')),file=path.join(tmp,'kho.json');fs.writeFileSync(file,JSON.stringify(out));
 const cli=spawnSync(process.execPath,[path.join(__dirname,'../tools/automation/engine2_audit.js'),file,'gg01',RANGE.from,RANGE.to]);
 assert.equal(cli.status,0,String(cli.stdout)+String(cli.stderr));assert.match(String(cli.stdout),/^ĐẠT/);
 const broken=JSON.parse(JSON.stringify(out));broken.docs['stock_transactions_gieogieo/finish_u_WASTE'].voided=true;fs.writeFileSync(file,JSON.stringify(broken));
 assert.equal(spawnSync(process.execPath,[path.join(__dirname,'../tools/automation/engine2_audit.js'),file,'gg01',RANGE.from,RANGE.to]).status,1);
 console.log('ok Bản xuất → bộ kiểm toán: ĐẠT 0 vi phạm/0 cảnh báo; CLI đọc thẳng file, nguồn bị huỷ → thoát mã 1');

 const again=await X.build(opts(f)),small=await X.build(opts(f,{pageSize:2}));
 assert.equal(again.manifest.sha256,m.sha256,'cùng dữ liệu → cùng mã kiểm');
 assert.equal(small.manifest.sha256,m.sha256,'phân trang nhỏ không đổi nội dung');assert.equal(small.manifest.docCount,m.docCount);
 const cut=await X.build(opts(f,{pageSize:2,limit:3}));assert.equal(cut.manifest.complete,false);assert(Object.values(cut.manifest.sections).some(s=>s.truncated));
 fs.writeFileSync(file,JSON.stringify(cut));const cliCut=spawnSync(process.execPath,[path.join(__dirname,'../tools/automation/engine2_audit.js'),file,'gg01',RANGE.from,RANGE.to]);
 assert.equal(cliCut.status,1);assert.match(String(cliCut.stdout),/CHƯA ĐỦ DỮ LIỆU/);
 console.log('ok Mã kiểm SHA-256 ổn định, phân trang không đổi nội dung; chạm giới hạn → chưa đủ, CLI không báo ĐẠT');

 const failing=await X.build(opts(f,{coll:k=>{if(k==='stock_anomalies')return {where:()=>{throw Error('permission-denied')}};return f.fstore.collection(X.physName(k,'gg01'));}}));
 assert.equal(failing.manifest.complete,false);assert.equal(failing.manifest.errors[0].phan,'stock_anomalies');assert(failing.docs['stock_transactions_gieogieo/finish_u_WASTE'],'phần khác vẫn xuất');
 const [,wc]=Object.entries(f.FS).find(([p,d])=>p.startsWith(ROOT+'/cases/')&&d.originKind==='measurement');
 f.FS[ROOT+'/measurement_locks/j']={measurementId:wc.originId};f.FS[ROOT+'/requests/x']={dirty:true};
 const busy=await X.build(opts(f));assert.equal(busy.manifest.inflight.measurementLocks,1);assert.equal(busy.manifest.inflight.dirtyRequests,1);
 delete f.FS[ROOT+'/measurement_locks/j'];delete f.FS[ROOT+'/requests/x'];
 console.log('ok Một phần đọc lỗi → ghi rõ, phần khác vẫn có, complete=false; ghi lại thao tác dở (khoá cân, việc chờ)');

 await assert.rejects(X.build(opts(f,{from:'2026-08-01',to:'2026-10-22'})),/tối đa 62/);
 await assert.rejects(X.build(opts(f,{storeId:null})),/điểm bán/);
 await assert.rejects(X.build(opts(f,{from:'2026-10-22',to:'2026-10-01'})),/khoảng ngày/);
 const ts={toDate:()=>new Date('2026-10-22T03:00:00.123Z')};
 const fake={collection:()=>({where:()=>fake.collection(),orderBy:()=>fake.collection(),limit:()=>fake.collection(),startAfter:()=>fake.collection(),doc:()=>({get:async()=>({exists:false}),collection:()=>fake.collection()}),get:async()=>({docs:[{id:'t',data:()=>({at:ts,nested:{list:[ts]}}),ref:{}}]})})};
 const tsOut=await X.build({...RANGE,coll:()=>fake.collection(),rtRef:()=>({once:async()=>({val:()=>null})})});
 assert.equal(tsOut.docs['inventory_items_gieogieo/t'].at,'2026-10-22T03:00:00.123Z');assert.equal(tsOut.docs['inventory_items_gieogieo/t'].nested.list[0],'2026-10-22T03:00:00.123Z');
 console.log('ok Chặn quá 62 ngày / chưa chọn quán / ngày ngược; Timestamp Firestore → ISO');

 // Tên bảng vật lý phải khớp lớp đường dẫn data_access (bảng dùng chung không có hậu tố quán).
 const kinds=[...X.CATALOG,...X.BY_DAY,'employee_shifts','duty_digests'];
 for(const store of ['gg01','gg02'])for(const k of kinds){
  const want=GieoData.fsName(k+'_gieogieo',store);
  assert.equal(X.physName(k,store),want,'xuất '+k+'@'+store);assert.equal(require('../unit_engine2_v1').tableName(k,store),want,'lõi/worker '+k+'@'+store);assert.equal(A.collName(k,store),want,'kiểm toán '+k+'@'+store);
 }
 for(const k of X.SHARED)assert.equal(GieoData.fsName(k+'_gieogieo','gg02'),k+'_gieogieo','SHARED '+k+' phải là bảng dùng chung');
 assert.deepEqual(A.SHARED,X.SHARED);assert.deepEqual(require('../unit_engine2_v1').SHARED,X.SHARED);
 for(const store of ['gg01','gg02'])for(const k of X.SHARED)assert.equal(require('../unit_engine2_v1').tableName(k,store),GieoData.fsName(k+'_gieogieo',store));
 console.log('ok Tên bảng theo quán khớp data_access (gg02: price_history/prep_vessels dùng chung, sổ/tem/ca có hậu tố)');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
