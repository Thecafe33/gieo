'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{extract}=require('./lib/extract');
const src=fs.readFileSync(path.join(__dirname,'../manage.html'),'utf8');
const pure=new Function('const money=v=>Number(v).toLocaleString("vi-VN"),esc=v=>String(v).replace(/</g,"&lt;"),icon=()=>"",clockVN=()=>"20:00";'+extract('manage.html',['ggCashExpected','cashDaySummary','cashNumber','cashVar','cashReconciliation','cashDayStats','cashSegmentHTML'])+';return {ggCashExpected,cashDaySummary,cashReconciliation,cashDayStats,cashSegmentHTML};')();
const closing={status:'closed',finalExpectedCash:1700000,finalActualCash:1680000,finalVariance:-20000,
 retainedAmount:500000,handedOverAmount:1180000,segmentCount:2,closingStaff:'NV <A>',cashPassedAt:'2026-10-19T13:00:00Z',
 postCloseBills:{a:{timing:'after_close',cash:45000,bank:50000},b:{timing:'in_close_count',cash:30000}}};
const r=pure.ggCashExpected(closing);
assert.equal(r.expected,1225000,'Giữ nguyên số tiền cần lấy theo báo bàn giao + bán sau ca');
assert.deepEqual([r.reconciliation.expectedCash,r.reconciliation.countedCash,r.reconciliation.variance,r.reconciliation.systemHandover],[1700000,1680000,-20000,1245000]);
const html=pure.cashReconciliation(r,'gg02','2026-10-19');
for(const text of ['1.700.000','1.680.000','Thiếu 20.000','1.245.000','Đối soát đoạn cuối','2 đoạn ca','NV &lt;A>'])assert(html.includes(text),text);
assert.equal(pure.ggCashExpected({status:'closed',handedOverAmount:0,finalVariance:0}).reconciliation.variance,null,'Thiếu số đếm không hiển thị Khớp');
assert.equal(pure.ggCashExpected({status:'cash_passed',finalExpectedCash:0,finalActualCash:0}).reconciliation.variance,0,'Số đếm 0 là dữ liệu thật');
assert.equal(pure.ggCashExpected({status:'cash_variance_recorded',finalExpectedCash:50000,finalActualCash:40000}).reconciliation.countedCash,40000,'Chưa bàn giao vẫn xem được số đếm');
assert.equal(pure.ggCashExpected({status:'closed',forceClosedByManagement:true}).state,'forced');
assert.deepEqual(pure.cashDaySummary({total:150000,drink:100000,snack:50000,transfer:60000},'tc33'),{revenue:150000,bank:60000});
assert.deepEqual(pure.cashDaySummary({total:110000,food:40000,bank:50000,foodBank:10000},'xofa'),{revenue:150000,bank:60000});
assert.deepEqual(pure.cashDaySummary({total:110000,revenue:150000,bank:50000,foodBank:10000},'gg02'),{revenue:150000,bank:60000});
assert.equal(pure.cashDaySummary(null,'gg01'),null);
assert(pure.cashDayStats({daySummary:{gg02:{revenue:0,bank:0}}},'gg02').includes('0 ₫'));
assert(pure.cashDayStats({daySummary:{gg02:null}},'gg02').includes('Chưa tải được'));
const segments=[{seq:1,status:'closed',startCash:500000,expectedEndCash:900000,endCash:850000,variance:-50000,custodianName:'Sáng'},
 {seq:2,status:'closed',expectedEndCash:1700000,endCash:1680000,variance:-20000,endType:'close',custodianName:'Chiều'},
 {seq:3,status:'open',startCash:100000}];
const detail=pure.cashSegmentHTML(segments);
for(const text of ['Thiếu 70.000','Thiếu 50.000','Thiếu 20.000','2/3 đoạn','Chưa đối soát'])assert(detail.includes(text),text);
assert(pure.cashSegmentHTML([{seq:1,variance:1000},{seq:2,variance:-1000}]).includes('2 đoạn lệch'),'Bù trừ tổng 0 vẫn hiện các đoạn lệch');
console.log('ok Tiền cần lấy giữ nguyên; đối soát cuối ca / từng đoạn; không biến thiếu dữ liệu thành 0; doanh thu CK từng thương hiệu');

(async()=>{
 const calls=[],today='2026-10-20',date='2026-09-01';
 const docs=(rows)=>({docs:rows.map(([id,data])=>({id,data:()=>data}))});
 const db={collection(name){const filters=[];return{where(...f){filters.push(f);return this},async get(){calls.push({name,filters:[...filters]});return docs(name==='daily_closings_gieogieo__gg02'?[['2026-09-01',{...closing,businessDate:date}]]:[])},doc(id){return{async get(){calls.push({name,id});return{exists:false}}}}}}};
 const revCalls=[],scope={ensureAuth:async()=>{},validDate:()=>{},loadCashCfg:async()=>({startDate:'2026-10-21'}),dkey:d=>typeof d==='string'?d:today,CASH_COLL:'cash_receipts_tc33xofa',
  gieoStores:async()=>[{id:'gg02'},{id:'gg03'}],cashCacheLoad:()=>({}),cashCacheSave:()=>{},cashQueryFrom:()=>today,
  pool:async(items,n,fn)=>Promise.all(items.map(fn)),ggName:(name,id)=>name+'__'+id,
  parseDkey:d=>d,addDays:()=>today,EXP_COLL:{tc33:'expenses_tc33',xofa:'expenses_xofa'},console:{warn(){}},
  revLoadRange:async(a,b,progress,only)=>{revCalls.push({a,b,only});if(only.includes('gg_gg03'))throw new Error('Giả lập lỗi một quán');return Object.fromEntries(only.map(k=>[k,{[a]:{total:100000,revenue:100000,bank:50000,transfer:50000}}]))},fstore:db,CASH_CFG:null};
 const backend=new Function(...Object.keys(scope),extract('manage.html',['readCash','cashReadServer','ggCashExpected','cashDaySummary','tcxCashExpected','readCashSegments'])+';return {readCash,readCashSegments}')( ...Object.values(scope));
 const result=await backend.readCash(date);
 assert.equal(calls.filter(c=>c.name.includes('shift_segments')).length,0,'Không tự đọc chi tiết các ca');
 assert.equal(revCalls.filter(c=>c.only.includes('gg_gg02')).length,1);
 assert(revCalls.every(c=>c.a===date&&c.b===date),'Doanh thu chỉ đọc ngày đang xem, không kéo về mốc theo dõi');
 assert.equal(result.daySummary.gg02.revenue,100000);
 assert.equal(result.daySummary.gg03,null,'Một quán lỗi doanh thu không làm mất số quán khác hoặc biến thành 0');
 await backend.readCashSegments('gg02',date);
 assert.deepEqual(calls.at(-1),{name:'shift_segments_gieogieo__gg02',filters:[['businessDate','==',date]]},'Chi tiết đúng ngày và đúng quán');
 await assert.rejects(()=>backend.readCashSegments('tc33',date),/không hợp lệ/);
 assert(src.includes("CASH_CACHE_KEY = 'mg_cash_cache_v2'"),'Thay phiên bản đệm để nhận các trường mới cả ngày cũ');
 const storage={mg_cash_cache_v1:JSON.stringify({tcx:{tc33:{[date]:{received:700000}}}})};
 const loadCache=new Function('localStorage','CASH_CACHE_KEY',extract('manage.html',['cashCacheLoad'])+';return cashCacheLoad')({getItem:k=>storage[k]||null},'mg_cash_cache_v2');
 assert.equal(loadCache().tcx.tc33[date].received,700000,'Nâng phiên bản vẫn dùng lại ngày đã nhận trong đệm cũ');
 const migrationReads=[],oldCache={tcx:{tc33:{[date]:{received:700000,expected:700000}}},gg:{gg02:{[date]:{state:'ready',expected:1225000,received:1225000}}}};
 let saved;
 const migrationScope={...scope,gieoStores:async()=>[{id:'gg02'}],cashCacheLoad:()=>oldCache,cashCacheSave:c=>{saved=c},fstore:{
  collection(name){
   const filters=[];
   return {
    where(...f){filters.push(f);return this},
    get:async()=>{migrationReads.push({name,filters:[...filters]});return docs([])},
    doc:id=>({get:async()=>{
     migrationReads.push({name,id});
     return name==='daily_closings_gieogieo__gg02'
      ? {exists:true,id,data:()=>({...closing,businessDate:date,ownerReceipt:{received:1225000}})} : {exists:false};
    }})
   };
  }
 }};
 const migrate=new Function(...Object.keys(migrationScope),extract('manage.html',['readCash','cashReadServer','ggCashExpected','cashDaySummary','tcxCashExpected'])+';return readCash')(...Object.values(migrationScope));
 const migrated=await migrate(date);
 assert.equal(migrated.gg.gg02[date].reconciliation.countedCash,1680000);
 assert.equal(saved.tcx.tc33[date].received,700000,'Không làm mất đệm TC33 khi nâng dữ kiện Gieo');
 assert.equal(migrationReads.filter(c=>c.name==='daily_closings_gieogieo__gg02'&&c.id===date).length,1,'Đệm Gieo cũ chỉ bổ sung đúng doc của ngày đang xem');
 assert(migrationReads.filter(c=>c.name==='daily_closings_gieogieo__gg02'&&c.filters).every(c=>c.filters[0][2]===today),'Không lùi truy vấn cả lịch sử để nâng đệm');
 console.log('ok Lượt đọc: không tải đoạn ca khi mở tab; doanh thu đúng ngày; chi tiết theo quán/ngày khi yêu cầu; đệm mới');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
