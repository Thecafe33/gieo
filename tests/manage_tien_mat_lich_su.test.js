'use strict';
// Chạy toàn bộ backend với Firebase giả lọc FieldPath.documentId() như SDK.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {extract}=require('./lib/extract'),{makeCashFixture}=require('./lib/manage_cash_fixture');
const before=require('./fixtures/manage_cash_before_26edad6');
const file=path.join(__dirname,'../manage.html'),html=fs.readFileSync(file,'utf8');
const source=html.slice(html.indexOf('const backend=(()=>{'),html.indexOf("\n'use strict';\nconst paths="));
function setup(options={},original=false){
 const m=makeCashFixture(options);
 if(options.normal){m.data.cash_receipts_tc33xofa['tc33_2026-10-18'].date='2026-10-18';m.data.daily_closings_gieogieo['2026-10-18'].businessDate='2026-10-18';}
 if(options.start)m.data.expense_config_tc33xofa.cash.startDate=options.start;
 if(options.poisonOld){for(const k of ['mg_cash_cache_v1','mg_cash_cache_v2'])m.memory[k]=JSON.stringify({tcx:{tc33:{'2026-10-18':{received:9999999}}},gg:{gg01:{'2026-10-18':{received:8888888}}}});}
 const unchanged=JSON.stringify(m.data),now=options.now||'2026-10-20';
 class FixedDate extends Date{constructor(...a){super(...(a.length?a:[now+'T02:26:00Z']))}static now(){return +new Date(now+'T02:26:00Z')}}
 let code=source;
 if(original){for(const [name,fn]of Object.entries(before))code=code.replace(extract(file,[name]),fn.toString());code=code.replace("CASH_CACHE_KEY = 'mg_cash_cache_v3'","CASH_CACHE_KEY = 'mg_cash_cache_v1'");}
 const ctx={console,Date:FixedDate,Intl,queueMicrotask,firebase:m.firebase,localStorage:{getItem:k=>m.memory[k]||null,setItem:(k,v)=>m.memory[k]=v,removeItem:k=>delete m.memory[k]}};
 vm.createContext(ctx);vm.runInContext(code+';globalThis.api=backend;',ctx);
 return{...m,api:ctx.api,unchanged(){assert.equal(JSON.stringify(m.data),unchanged);assert.equal(m.writes.length,0)}};
}
function money(r){return[r.tcx.tc33['2026-10-18']?.received,r.tcx.xofa['2026-10-18']?.received,r.gg.gg01?.['2026-10-18']?.received];}
function moneyRows(r){const x=JSON.parse(JSON.stringify({tcx:r.tcx,gg:r.gg}));for(const map of Object.values(x.gg))for(const row of Object.values(map||{}))delete row.reconciliation;return x;}
function cashReads(m){return m.reads.filter(r=>/cash_receipts_tc33xofa|daily_closings_gieogieo/.test(r.coll||r.doc||''));}
(async()=>{
 for(const name of ['writeCashReceipt','writeCashStart'])assert.equal(extract(file,[name]),before[name].toString(),name+' giữ nguyên cách ghi phiếu');
 // Cùng phiếu cũ THIẾU date/businessDate, không tự bổ sung trường để làm test qua.
 const old=setup({noCache:true},true),fresh=setup({noCache:true});
 const a=await old.api.readCash('2026-10-18'),b=await fresh.api.readCash('2026-10-18');
 assert.equal(a.tcx.tc33['2026-10-18'].received,null);assert.equal(a.gg.gg01['2026-10-18'],undefined);
 assert.deepEqual(money(b),[500000,400000,300000]);old.unchanged();fresh.unchanged();
 console.log('ok Cùng phiếu thiếu trường ngày: bản gốc không đọc được khi sạch đệm; v3 lấy đủ TC33/XOFA/Gieo từ mã phiếu');
 for(const options of [{noCache:true},{poisonOld:true},{noCache:true,start:'2026-10-19'},{noCache:true,now:'2026-11-20'}]){
  const m=setup(options);for(const d of ['2026-10-18','2026-10-20','2026-10-18']){const r=await m.api.readCash(d);assert.deepEqual(money(r),[500000,400000,300000]);}
  assert.deepEqual(money(await m.api.readCash('2026-10-18',true)),[500000,400000,300000]);
  assert.equal(JSON.parse(m.memory.mg_cash_cache_v3).schema,3);
  const first=JSON.parse(m.memory.mg_cash_cache_v3);assert.equal(first.gg.gg01['2026-10-18'].received,300000);
  assert(cashReads(m).every(r=>r.source==='server'),'Không chấp nhận snapshot rỗng từ cache SDK');
  assert(cashReads(m).filter(r=>r.coll).every(r=>r.filters.length===2&&r.filters.every(f=>f[0]==='__name__')),'Truy vấn có cận mã phiếu, không lọc trường ngày');
  m.unchanged();console.log('ok Sạch đệm / đệm cũ sai / ngày trước mốc / ngày đã cũ: đổi ngày và tải lại đều đúng '+JSON.stringify(options));
 }
 const norm=setup({noCache:true,normal:true}),ref=setup({noCache:true,normal:true},true);
 assert.deepEqual(moneyRows(await norm.api.readCash('2026-10-18')),moneyRows(await ref.api.readCash('2026-10-18')));norm.unchanged();ref.unchanged();
 console.log('ok Phiếu đủ trường: số tiền / phải nộp / chênh lệch vẫn khớp bản gốc');
 const clear=setup({});await clear.api.readCash('2026-10-18');
 for(const k of Object.keys(clear.memory))delete clear.memory[k];
 assert.deepEqual(money(await clear.api.readCash('2026-10-18')),[500000,400000,300000]);clear.unchanged();
 console.log('ok Xoá cả v1/v2/v3 ngay trong phiên rồi tải lại vẫn dựng đủ số nhận từ Firebase');
 const bounded=setup({noCache:true,start:'2026-10-01'});
 for(let i=1;i<=19;i++){const d='2026-10-'+String(i).padStart(2,'0');for(const st of ['tc33','xofa'])bounded.data.cash_receipts_tc33xofa[st+'_'+d]={received:100,expected:100};bounded.data.daily_closings_gieogieo[d]={status:'closed',handedOverAmount:100,ownerReceipt:{received:100}};}
 await bounded.api.readCash('2026-10-20');bounded.reads.length=0;await bounded.api.readCash('2026-10-20');
 assert.equal(cashReads(bounded).length,3,'Lượt sau chỉ 2 query TC33/XOFA + 1 query Gieo');
 assert(cashReads(bounded).every(r=>r.filters[0][2].endsWith('2026-10-13')),'Không đọc lại ngày đã nhận ổn định');
 bounded.reads.length=0;await bounded.api.readCash('2026-10-01');
 assert.equal(cashReads(bounded).filter(r=>r.doc).length,3,'Chọn ngày ổn định: mỗi quán đúng một doc, không mở rộng khoảng');
 assert(cashReads(bounded).filter(r=>r.coll).every(r=>r.filters[0][2].endsWith('2026-10-13')));
 console.log('ok V3 sau lần tải đầu vẫn tối ưu: chỉ phần chưa nhận / 7 ngày gần nhất; bấm ngày cũ chỉ thêm doc đúng ngày');
 for(const options of [{offline:true,noCache:true},{offline:true,offlineConfig:true}]){
  const m=setup(options);await assert.rejects(()=>m.api.readCash('2026-10-18'),/máy chủ/);assert.equal(m.memory.mg_cash_cache_v3,undefined);m.unchanged();
 }
 const partial=setup({failCollection:'daily_closings_gieogieo'});const p=await partial.api.readCash('2026-10-18');
 assert.equal(p.gg.gg01,null);assert.equal(p.tcx.tc33['2026-10-18'].received,500000);partial.unchanged();
 console.log('ok Lỗi mạng/config không tạo số 0 hoặc ghi lại phiếu; lỗi Gieo không mất số quán khác');
 const zero=setup({noCache:true});zero.data.cash_receipts_tc33xofa['tc33_2026-10-18'].received=0;zero.data.daily_closings_gieogieo['2026-10-18'].ownerReceipt.received=0;
 assert.deepEqual(money(await zero.api.readCash('2026-10-18')),[0,400000,0]);assert.equal(zero.writes.length,0);
 console.log('ok Số thực nhận 0 vẫn là dữ liệu thật, không bị xem như chưa nhập');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
