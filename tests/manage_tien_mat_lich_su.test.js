'use strict';
// A/B: cùng Firebase giả, cùng đồng hồ, cùng đệm; mốc gốc lấy nguyên văn từ 26edad6.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {extract}=require('./lib/extract'),{makeCashFixture}=require('./lib/manage_cash_fixture');
const before=require('./fixtures/manage_cash_before_26edad6'),broken=require('./fixtures/manage_cash_broken_5d42060');
const file=path.join(__dirname,'../manage.html'),html=fs.readFileSync(file,'utf8');
const source=html.slice(html.indexOf('const backend=(()=>{'),html.indexOf("\n'use strict';\nconst paths="));
function setup(mode,options={}){
 const m=makeCashFixture(options);
 if(options.normal!==false){m.data.cash_receipts_tc33xofa['tc33_2026-10-18'].date='2026-10-18';m.data.daily_closings_gieogieo['2026-10-18'].businessDate='2026-10-18';}
 if(options.oldCache){
  const old=JSON.parse(m.memory.mg_cash_cache_v1);old.tcx.xofa={'2026-10-18':{store:'xofa',date:'2026-10-18',received:400000,expected:400000,sales:400000}};
  m.memory.mg_cash_cache_v1=JSON.stringify(old);
 }
 if(options.start)m.data.expense_config_tc33xofa.cash.startDate=options.start;
 if(options.v2Only){delete m.memory.mg_cash_cache_v1;m.memory.mg_cash_cache_v2=JSON.stringify({tcx:{tc33:{'2026-09-01':{received:700000,expected:700000}}},gg:{}});}
 const unchanged=JSON.stringify(m.data),now=options.now||'2026-10-20';
 class FixedDate extends Date{constructor(...a){super(...(a.length?a:[now+'T02:26:00Z']))}static now(){return +new Date(now+'T02:26:00Z')}}
 let code=source;
 if(mode!=='current'){
  const ref=mode==='before'?before:broken;
  for(const [name,fn]of Object.entries(ref))code=code.replace(extract(file,[name]),fn.toString());
  if(mode==='broken')code=code.replace("CASH_CACHE_KEY = 'mg_cash_cache_v1'","CASH_CACHE_KEY = 'mg_cash_cache_v2'");
 }
 const ctx={console,Date:FixedDate,Intl,queueMicrotask,firebase:m.firebase,localStorage:{getItem:k=>m.memory[k]||null,setItem:(k,v)=>m.memory[k]=v,removeItem:k=>delete m.memory[k]}};
 vm.createContext(ctx);vm.runInContext(code+';globalThis.api=backend;',ctx);
 return{...m,api:ctx.api,unchanged(){assert.equal(JSON.stringify(m.data),unchanged);assert.equal(m.writes.length,0)}};
}
function moneyRows(r){const x=JSON.parse(JSON.stringify({tcx:r.tcx,gg:r.gg}));for(const map of Object.values(x.gg))for(const row of Object.values(map||{}))delete row.reconciliation;return x;}
(async()=>{
 for(const name of ['loadCashCfg','writeCashReceipt','writeCashStart','cashQueryFrom','cashCacheSave'])assert.equal(extract(file,[name]),before[name].toString(),name+' giữ nguyên mã nguồn bản trước sửa');
 const current=extract(file,['readCash']),original=before.readCash.toString();
 assert.equal(current.split('  // Chỉ đính kèm số')[0],original.slice(0,original.lastIndexOf('  return { cfg')),'Toàn bộ truy vấn / ghép dữ liệu / lưu đệm tiền nhận giữ nguyên bản gốc');
 assert(html.includes("CASH_CACHE_KEY = 'mg_cash_cache_v1'"));
 console.log('ok Mã nguồn truy vấn/ghi tiền nhận khớp bản gốc; chỉ đính kèm hai số UI từ kết quả đã tải');
 const cases=[
  {name:'Máy mới chưa có đệm',options:{noCache:true},dates:['2026-10-18','2026-10-20','2026-10-19']},
  {name:'Máy cũ v1 có tiền + v2 tồn tại rỗng',options:{},dates:['2026-10-18','2026-10-20','2026-10-18']},
  {name:'Chọn ngày trước mốc theo dõi',options:{start:'2026-10-19'},dates:['2026-10-18']},
  {name:'Tải lại khi đang xem ngày cũ',options:{},dates:['2026-10-18','2026-10-20'],force:true},
  {name:'Ngày đã cũ, v1 có số, v2 rỗng',options:{normal:false,oldCache:true,now:'2026-11-20'},dates:['2026-10-18']}
 ];
 for(const c of cases){
  const a=setup('before',c.options),b=setup('current',c.options);
  for(const d of c.dates){const old=await a.api.readCash(d,!!c.force),now=await b.api.readCash(d,!!c.force);assert.deepEqual(moneyRows(now),moneyRows(old),c.name+' '+d);}
  assert.deepEqual(b.reads,a.reads,c.name+': không thêm/đổi truy vấn tiền nộp');a.unchanged();b.unchanged();console.log('ok A/B '+c.name);
 }
 const opts={normal:false,oldCache:true,now:'2026-11-20'},a=setup('before',opts),b=setup('broken',opts),c=setup('current',opts);
 const old=await a.api.readCash('2026-10-18'),bad=await b.api.readCash('2026-10-18'),fixed=await c.api.readCash('2026-10-18');
 assert.equal(old.tcx.tc33['2026-10-18'].received,500000);assert.equal(bad.tcx.tc33['2026-10-18'].received,null);assert.equal(fixed.tcx.tc33['2026-10-18'].received,500000);
 assert.equal(old.gg.gg01['2026-10-18'].received,300000);assert.equal(bad.gg.gg01['2026-10-18']?.received??null,null);assert.equal(fixed.gg.gg01['2026-10-18'].received,300000);
 a.unchanged();b.unchanged();c.unchanged();console.log('ok Tái hiện đúng hồi quy 5d42060: cùng dữ liệu, bản trước đọc được, bản lỗi mất, bản sửa đọc được');
 const migrate=setup('current',{v2Only:true});await migrate.api.readCash('2026-10-18');
 assert.equal(JSON.parse(migrate.memory.mg_cash_cache_v1).tcx.tc33['2026-09-01'].received,700000,'Ngày chỉ có ở v2 được mang về v1, không mất');migrate.unchanged();
 console.log('ok Giữ các ngày đã nhập bằng v2 nhưng không thay số gốc v1');
 const ui={state:{view:'tienmat',cashDate:'2026-10-18'},live:{},document:{querySelector:()=>({set outerHTML(v){ui.painted=v}})},backend:{}};
 let finish;ui.backend.readCashGieoDay=()=>new Promise(r=>finish=r);
 const read=new Function(...Object.keys(ui),extract(file,['cashLoadGieoDay'])+';return cashLoadGieoDay')(...Object.values(ui));
 const panel={date:'2026-10-18',records:[{id:'gg01'}],daySummary:{},gieoDayPending:true};ui.live.cash=panel;
 const job=read(panel);assert(finish);ui.live.cash={date:'2026-10-19'};finish({gg01:{bank:100}});await job;assert.equal(ui.painted,undefined,'Kết quả cũ không được vẽ đè ngày mới');
 console.log('ok Chỉ số phụ về trễ không đè tiền nộp/ngày mới');console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
