'use strict';
const assert=require('assert/strict'),{extract,extractRaw}=require('./lib/extract'),{makeFake}=require('./lib/fakefb');
const names=['gieoReceiptState','gieoReceiptPatch'];
for(const n of names)assert.equal(extractRaw('manage.html',[n]),extractRaw('quanlygieo.html',[n]),n+' thống nhất cả hai app');
const P=new Function(extract('manage.html',names)+';return {gieoReceiptState,gieoReceiptPatch}')();
const date='2026-10-18',at='2026-10-21T04:00:00Z';
const closing={status:'closed',handedOverAmount:300000,postCloseBills:{a:{timing:'after_close',cash:50000,bank:20000},b:{timing:'in_close_count',cash:20000}},postCloseCashPending:true};
const legacy={...closing,postCloseReceipt:{received:350000,expectedTotal:350000,expectedExtra:50000,at,by:'management'},ownerReceipt:{received:300000,expected:300000,at:'2026-10-20T00:00:00Z'}};
assert.equal(P.gieoReceiptState(legacy).receipt.received,350000);assert.equal(P.gieoReceiptState(legacy).needsConfirmation,false,'đã nhận bổ sung trước đây không bị bắt xác nhận lại');
assert.equal(P.gieoReceiptState(closing).needsConfirmation,true);
const patch=P.gieoReceiptPatch(closing,350000,'manage',at);
assert.deepEqual([patch.ownerReceipt.received,patch.ownerReceipt.expected,patch.postCloseReceipt.received,patch.postCloseCashPending],[350000,350000,350000,false]);
const done={...closing,...patch};assert.equal(P.gieoReceiptState(done).needsConfirmation,false);
assert.equal(P.gieoReceiptPatch(done,350000,'quanlygieo',at).ownerReceipt.received,350000,'xác nhận lại không cộng trùng khoản bổ sung');
assert.equal(P.gieoReceiptState({...done,postCloseBills:{...done.postCloseBills,c:{timing:'after_close',cash:10000}}}).needsConfirmation,true,'bill mới làm phiếu cũ cần xác nhận lại');
assert.equal(P.gieoReceiptState({...done,postCloseBills:{...done.postCloseBills,c:{timing:'after_close',bank:10000}}}).needsConfirmation,false,'bill CK không cộng thành tiền mặt');
assert.equal(P.gieoReceiptPatch(closing,340000,'manage',at).ownerReceipt.variance,-10000,'thực nhận thiếu không được hiển thị Khớp');
assert.equal(P.gieoReceiptPatch(closing,0,'manage',at).ownerReceipt.received,0,'số thực nhận 0 được giữ');
assert.throws(()=>P.gieoReceiptPatch({...closing,postCloseBills:{u:{cash:10000}}},1,'manage',at),/chưa phân loại/);
for(const v of [NaN,Infinity,-1,1e12])assert.throws(()=>P.gieoReceiptPatch(closing,v,'manage',at),/hợp lệ/);
const ui=new Function('cashViewDate','ownerReceiptEditing','const escapeHtmlAttr=s=>String(s);let CASH_PC_STATE=null;'+extract('quanlygieo.html',['fmt',...names,'ownerReceiptExpected','ownerReceiptHTML','postCloseCashHTML'])+';return {ownerReceiptHTML,postCloseCashHTML}') (date,null);
const detail={opening:{businessDate:date},closing,postClose:{list:[{cash:50000,timing:'after_close'}],afterCash:50000,afterBank:20000,inCash:20000,unclassifiedCash:0}};
const both=ui.postCloseCashHTML(detail)+ui.ownerReceiptHTML(closing);
assert.equal((both.match(/id="ownerRecvInput"/g)||[]).length,1);assert(!both.includes('pcReceivedInput'),'một form nhận tổng, không còn form xác nhận bổ sung riêng');
assert(!ui.ownerReceiptHTML(legacy).includes('ownerRecvInput'),'phiếu bổ sung cũ hợp lệ tự được đọc, không ghi migrate');
console.log('ok Phiếu cũ/mới, một form, tổng tiền không trùng, thiếu/0/chưa phân loại, hai app cùng quy tắc');
(async()=>{
 const f=makeFake({fs:{['daily_closings_gieogieo/'+date]:closing,['daily_closings_gieogieo__gg02/'+date]:closing}});
 const M=new Function('fstore','localStorage','ensureAuth','validDate','ggName','CASH_CACHE_KEY','CASH_COLL',extract('manage.html',[...names,'ggCashExpected','writeCashReceipt'])+';return writeCashReceipt')(f.fstore,{removeItem(){}},async()=>{},()=>{},(n,id)=>id==='gg01'?n:n+'__'+id,'mock','cash_receipts_tc33xofa');
 const Q=new Function('fstore','ensureAuth',extract('quanlygieo.html',[...names,'writeGieoOwnerReceipt'])+';return writeGieoOwnerReceipt')(f.fstore,async()=>{});
 for(const st of ['tc33','xofa']){
   await M(st,date,0,{expected:50000,sales:60000,spent:10000});
   assert.equal(f.FS['cash_receipts_tc33xofa/'+st+'_'+date].received,0);
   await M(st,date,50000,{expected:50000,sales:60000,spent:10000});
   const rec=f.FS['cash_receipts_tc33xofa/'+st+'_'+date];assert.equal(rec.variance,0);assert.equal(rec.prevReceived,0);assert.equal(rec.store,st);
 }
 await M('gg02',date,350000,{expected:350000});
 assert.equal(f.FS['daily_closings_gieogieo__gg02/'+date].ownerReceipt.received,350000);
 assert.equal(f.FS['daily_closings_gieogieo/'+date].ownerReceipt,undefined,'manage không ghi sang quán khác');
 await Q(date,350000,350000,'nhận cả ngày');
 const cl=f.FS['daily_closings_gieogieo/'+date];assert.equal(cl.ownerReceipt.received,cl.postCloseReceipt.received);assert.equal(cl.postCloseCashPending,false);
 assert.equal(cl.ownerReceipt.note,'nhận cả ngày');assert.equal(cl.status,'closed');assert.equal(cl.handedOverAmount,300000);
 await assert.rejects(()=>M('gg01',date,350000,{expected:300000}),/vừa thay đổi/);
 await assert.rejects(()=>Q(date,350000,300000),/vừa thay đổi/);
 // Có bill mới ghi ngay sau khi transaction đọc: retry phải dừng, không ghi xác nhận nhầm tổng cũ.
 const ref=f.fstore.collection('daily_closings_gieogieo').doc(date),real=f.fstore.runTransaction;let inject=true;
 f.fstore.runTransaction=fn=>real(tx=>fn({...tx,get:async r=>{const snap=await tx.get(r);if(inject){inject=false;await ref.set({postCloseBills:{late:{timing:'after_close',cash:10000}},postCloseCashPending:true},{merge:true})}return snap}}));
 await assert.rejects(()=>Q(date,350000,350000),/vừa thay đổi/);
 assert.equal(f.FS['daily_closings_gieogieo/'+date].postCloseCashPending,true);
 assert.equal(f.FS['daily_closings_gieogieo/'+date].ownerReceipt.received,350000);
 assert.equal(P.gieoReceiptState(f.FS['daily_closings_gieogieo/'+date]).needsConfirmation,true);
 console.log('ok Xác nhận manage/quanlygieo ghi nguyên tử hai phiếu; đúng quán/ngày; bill mới đồng thời không bị xác nhận nhầm');
 // Ngày cũ đã nhận / đã đệm vẫn phải phát hiện bill bổ sung mà không đọc lại bill ngày đó.
 const fs=require('fs'),vm=require('vm'),{makeCashFixture}=require('./lib/manage_cash_fixture');
 const html=fs.readFileSync(require('path').join(__dirname,'../manage.html'),'utf8');
 const source=html.slice(html.indexOf('const backend=(()=>{'),html.indexOf("\n'use strict';\nconst paths="));
 const m=makeCashFixture({noCache:true});m.data.expense_config_tc33xofa.cash.startDate='2026-10-01';
 for(let i=1;i<=20;i++){const d='2026-10-'+String(i).padStart(2,'0');m.data.daily_closings_gieogieo[d]={status:'closed',handedOverAmount:100000,ownerReceipt:{received:100000,expected:100000}};
 for(const st of ['tc33','xofa'])m.data.cash_receipts_tc33xofa[st+'_'+d]={received:100000,expected:100000};}
 class D extends Date{constructor(...a){super(...(a.length?a:['2026-10-20T02:00:00Z']))}static now(){return +new Date('2026-10-20T02:00:00Z')}}
 const ctx={firebase:m.firebase,console,Date:D,setTimeout,clearTimeout,setInterval:()=>0,clearInterval,localStorage:{getItem:k=>m.memory[k]||null,setItem:(k,v)=>m.memory[k]=v,removeItem:k=>delete m.memory[k]}};
 vm.createContext(ctx);vm.runInContext(extract('manage.html',['vnDate'])+'\n'+source+';globalThis.api=backend;',ctx);
 await ctx.api.readCash('2026-10-20');m.reads.length=0;
 const oldDay='2026-10-02';Object.assign(m.data.daily_closings_gieogieo[oldDay],{postCloseBills:{extra:{timing:'after_close',cash:50000}},postCloseCashPending:true});
 const next=await ctx.api.readCash('2026-10-20');assert.equal(next.gg.gg01[oldDay].expected,150000);assert.equal(next.gg.gg01[oldDay].needsConfirmation,true);
 const ranged=m.reads.filter(x=>x.coll==='daily_closings_gieogieo'&&x.filters[0][0]==='__name__');assert(ranged.every(x=>x.filters[0][2]==='2026-10-13'),'không mở rộng range lịch sử khi có bill bổ sung cũ');
 assert(m.reads.some(x=>x.coll==='daily_closings_gieogieo'&&x.filters[0][0]==='postCloseCashPending'));
 Object.assign(m.data.daily_closings_gieogieo[oldDay],P.gieoReceiptPatch(m.data.daily_closings_gieogieo[oldDay],150000,'quanlygieo',at));m.reads.length=0;
 const ack=await ctx.api.readCash('2026-10-20');assert.equal(ack.gg.gg01[oldDay].received,150000);assert.equal(ack.gg.gg01[oldDay].needsConfirmation,false);
 assert.equal(m.reads.filter(x=>x.doc==='daily_closings_gieogieo/'+oldDay).length,1,'app khác xác nhận xong: tải đúng một phiếu cũ đang chờ');
 assert.equal(m.writes.length,0,'chỉ xem không ghi migrate');
 console.log('ok Manage phát hiện bổ sung ở ngày cũ đã đệm; chỉ query cờ / doc đang chờ, không đọc bill lịch sử');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
