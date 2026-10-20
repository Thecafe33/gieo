'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{makeCashFixture}=require('./lib/manage_cash_fixture');
const file=process.env.SOURCE||path.join(__dirname,'../manage.html'),html=fs.readFileSync(file,'utf8');
const source=html.slice(html.indexOf('const backend=(()=>{'),html.indexOf("\n'use strict';\nconst paths="));
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-10-20T02:26:00Z']))}static now(){return +new Date('2026-10-20T02:26:00Z')}}
function setup(options){
 const m=makeCashFixture(options),before=JSON.stringify(m.data);
 const ctx={console,Date:FixedDate,Intl,queueMicrotask,firebase:m.firebase,
  localStorage:{getItem:k=>m.memory[k]||null,setItem:(k,v)=>m.memory[k]=v,removeItem:k=>delete m.memory[k]}};
 vm.createContext(ctx);vm.runInContext(source+';globalThis.api=backend;',ctx);
 return{...m,api:ctx.api,unchanged:()=>{assert.equal(JSON.stringify(m.data),before);assert.equal(m.writes.length,0)}};
}
(async()=>{
 let m=setup({noCache:true}),r=await m.api.readCash('2026-10-18');
 assert.equal(r.tcx.tc33['2026-10-18'].received,500000,'Tra doc ID khôi phục số nhận của phiếu cũ thiếu date');
 assert.equal(r.tcx.xofa['2026-10-18'].received,400000);
 assert.equal(r.gg.gg01['2026-10-18'].received,300000,'Phiếu kết ca cũ thiếu businessDate vẫn tra được bằng ID ngày');
 assert(m.reads.some(x=>x.doc==='cash_receipts_tc33xofa/tc33_2026-10-18'&&x.source==='server'));
 assert.equal(r.gg.gg01['2026-10-18'].reconciliation.variance,-20000);m.unchanged();
 console.log('ok Toàn bộ backend thật: ngày cũ TC33/XOFA/Gieo, phiếu thiếu trường truy vấn, đúng doc gốc và không ghi dữ liệu');
 m=setup({});r=await m.api.readCash('2026-10-20');
 assert.equal(r.tcx.tc33['2026-10-18'].received,500000,'v2 rỗng không che phiếu v1');
 assert.equal(r.tcx.tc33['2026-10-19'].expected,600000);
 assert.equal(r.tcx.xofa['2026-10-19'].expected,700000);
 assert.equal(r.gg.gg01['2026-10-19'].expected,350000);
 const again=await m.api.readCash('2026-10-18',true);
 assert.equal(again.tcx.tc33['2026-10-18'].received,500000,'Bấm tải lại không bỏ mất đệm đã nhận');m.unchanged();
 console.log('ok Nâng v1 → v2, mở hôm nay, quay lại ngày cũ, tải lại: giữ đủ số nhận và số ngày chưa nhận');
 m=setup({emptyQueries:true,noCache:true});r=await m.api.readCash('2026-10-18');
 assert.equal(r.tcx.tc33['2026-10-18'].received,500000);
 assert.equal(r.gg.gg01['2026-10-18'].received,300000);m.unchanged();
 console.log('ok Truy vấn khoảng rỗng vẫn tra phiếu nhận/ngày gốc; không biến thành số 0');
 m=setup({offline:true});r=await m.api.readCash('2026-10-18');
 assert.equal(r.tcx.tc33['2026-10-18'].received,500000);
 assert.equal(r.gg.gg01['2026-10-18'].received,300000);
 assert.equal(r.verified.tc33,false);assert.equal(r.verified.gg01,false);
 assert(r.readErrors.tc33&&r.readErrors.gg01);m.unchanged();
 await assert.rejects(()=>m.api.writeCashReceipt('tc33','2026-10-18',0,{expected:0,sales:0,spent:0}),/Chưa xác minh/);
 await assert.rejects(()=>m.api.writeCashReceipt('gg01','2026-10-18',0,{}),/Chưa xác minh/);m.unchanged();
 console.log('ok Snapshot từ cache rỗng: giữ số lưu gần nhất, báo chưa xác minh, không cho ghi đè');
 m=setup({offline:true,noCache:true});r=await m.api.readCash('2026-10-18');
 assert.equal(r.verified.tc33,false);assert.equal(r.verified.xofa,false);assert.equal(r.verified.gg01,false);m.unchanged();
 console.log('ok Không có đệm + chưa đọc được server: chưa kết luận đã nhận đủ');
 m=setup({offline:true,offlineConfig:true,noCache:true});await assert.rejects(()=>m.api.readCash('2026-10-18'),/Chưa xác minh/);m.unchanged();
 console.log('ok Không đọc được cấu hình: không tự ghi lại mốc theo dõi, không dựng bộ lịch sử rỗng');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
