// Chẩn đoán liên app, chạy hàm gốc trên Firebase giả; KHÔNG sửa app/DB thật.
// node tools/kiem_tra_xuyen_app.js [--json đường_dẫn]
// Exit 0 = chạy xong cuộc rà; các BUG được ghi rõ, không có nghĩa app hết lỗi.
'use strict';
const assert=require('assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const {extract}=require('../tests/lib/extract'),{makeFake}=require('../tests/lib/fakefb');
const root=path.resolve(__dirname,'..'),MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const findings=[],checks=[];
function funcs(file,names,context={}){const c=vm.createContext(context);vm.runInContext(extract(file,names),c);return c;}
function record(id,apps,scenario,expected,actual,refs){const row={id,apps,scenario,expected,actual,refs};findings.push(row);console.log('BUG '+id+': '+scenario+'\n  đúng: '+JSON.stringify(expected)+'\n  đang có: '+JSON.stringify(actual));}
function pass(msg){checks.push(msg);console.log('ok '+msg)}
const M=funcs('manage.html',['pad','dkey','vnHour','tcEmptySum','tcIsTransfer','tcIsKhacLine','tcAddOrder','tcSummarize','tcxCashExpected','xoEmptySum','xoAddOrder','xoSummarize','ggEmptySum','ggAddOrder','ggSummarize','cashDaySummary']);
const P=funcs('posgieo.html',['orderCashAmountPOS','orderBankAmountPOS']);
const Q=funcs('quanlygieo.html',['orderCashAmount','orderBankAmount']);
async function addonCase(method,addonMethod,splitGroups){
 const base={id:'audit_bill',billCode:'#audit',date:'20/10/2026',time:'10:00',total:30000,method,itemsArray:[{itemId:'tea',name:'Trà',size:'L',qty:1,price:30000,toppings:[]}],...(splitGroups?{splitGroups}: {})};
 const fake=makeFake({rt:{orders_gieogieo:{oct:{20:{audit_bill:JSON.parse(JSON.stringify(base))}}}}});
 const c=funcs('posgieo.html',['_addonOrder','_addonAmount','tpSum','tpQty','tpLabel','_addonApplyToItems','_addonSameOrderState','_submitAddonImpl'],{
  Date,console,MONTH_KEYS:MONTHS,db:fake.db,orders:[base],_addonState:{orderId:base.id,itemIdx:0,unitIdx:0,seq:1,totalCups:1,toppings:[{id:'tp',name:'Topping',price:5000,qty:1}],method:addonMethod,cashGiven:5000},
  orderAddonInfo:()=>({ok:true}),resolveStaffPinAndCheckin:async()=>({id:'e',fullName:'NV thử'}),posConfirm:async()=>true,fmt:String,toast(){},closeAddonSheet(){},showDet(){},
  applyAddonConsumptionPOS:async()=>{},trackConsumptionPOS(){},printAddonReceipt(){},printAddonLabel(){}
 });
 await c._submitAddonImpl();
 const saved=(await fake.db.ref('orders_gieogieo/oct/20/audit_bill').once('value')).val();
 assert.equal(saved.total,35000);assert.equal(saved.addons[0].method,addonMethod);assert(fake.log.some(r=>r[0].startsWith('rt.')));
 const summary=M.ggSummarize([saved]);
 return{saved,cashPOS:P.orderCashAmountPOS(saved),bankPOS:P.orderBankAmountPOS(saved),cashQL:Q.orderCashAmount(saved),bankQL:Q.orderBankAmount(saved),cashManage:summary.cash,bankManage:summary.bank,revenueManage:summary.revenue};
}
function tcGiftCase(){
 const menu=[{name:'Trà',type:'Trà',priceM:25000},{name:'Bánh',type:'Ăn vặt',priceM:20000}];
 let saved;
 const c=funcs('pos.html',['applyPickedCartItem','saveOrderToFirebase'],{console,Date,cart:[{name:'Trà',size:'M',price:25000,qty:1},{name:'Bánh',size:'M',price:20000,qty:1}],renderCart(){},isSavingOrder:false,window:{innerWidth:1366},document:{getElementById:id=>({value:id==='cash-paid'?'25000':''})},currentTotal:25000,pendingBedOrder:null,isCheckoutFlow:false,activeOrderingBedId:'',firebase:{database:{ServerValue:{TIMESTAMP:Date.parse('2026-10-20T03:00:00Z')}}},_pushPaidOrder:o=>{saved=JSON.parse(JSON.stringify(o))},alert:m=>{throw Error(m)}});
 c.applyPickedCartItem(1,{type:'item_free'},'gift','QUA','Bánh miễn phí');
 assert.equal(c.cart[1].price,0);c.saveOrderToFirebase('Tiền mặt');assert(saved);assert.equal(saved.total,25000);assert.equal(saved.itemsArray[1].price,0);
 const sum=M.tcSummarize([saved],menu),pc=funcs('pos.html',['_isKhacLine','calculateStats'],{menu,Date}).calculateStats([saved],'custom','2026-10-20','2026-10-20');
 return{saved,manage:{total:sum.total,drink:sum.drink,snack:sum.snack,cashDue:M.tcxCashExpected(sum,'tc33',0).expected,hourly:sum.h24.reduce((a,b)=>a+b,0)},pos:{drink:pc.drinkTotal,snack:pc.snackTotal}};
}
function timeCase(tz){
 const code=`const vm=require('vm'),{extract}=require('./tests/lib/extract');const c={MONTHS:${JSON.stringify(MONTHS)},Intl,Date};vm.createContext(c);vm.runInContext(extract('pos.html',['getOrderParts'])+'\\n'+extract('manage.html',['dkey','parseDkey','addDays']),c);const t=new Date('2026-10-20T17:30:00Z');const parts=c.getOrderParts(t);const day=c.dkey(t);const keys=[];for(let d=c.parseDkey(day);c.dkey(d)<=day;d=c.addDays(d,1)){keys.push(c.dkey(d));if(keys.length>3)throw Error('loop')};console.log(JSON.stringify({writePath:parts,manageDay:day,manageRange:keys,payrollFrom:c.dkey(new Date(2026,9,1)),payrollTo:c.dkey(new Date(2026,10,0))}));`;
 return JSON.parse(execFileSync(process.execPath,['-e',code],{cwd:root,env:{...process.env,TZ:tz},encoding:'utf8'}));
}
(async()=>{
 for(const [name,method,extra,groups,expected]of [
  ['cash→bank','TIỀN MẶT','CHUYỂN KHOẢN',null,{cash:30000,bank:5000}],
  ['bank→cash','CHUYỂN KHOẢN','TIỀN MẶT',null,{cash:5000,bank:30000}],
  ['split→bank','TÍNH RIÊNG','CHUYỂN KHOẢN',[{method:'TIỀN MẶT',total:15000},{method:'CHUYỂN KHOẢN',total:15000}],{cash:15000,bank:20000}]
 ]){
  const r=await addonCase(method,extra,groups);assert.equal(r.revenueManage,35000);
  const actual={pos:{cash:r.cashPOS,bank:r.bankPOS},quanlygieo:{cash:r.cashQL,bank:r.bankQL},manage:{cash:r.cashManage,bank:r.bankManage}};
  if(Object.values(actual).some(x=>x.cash!==expected.cash||x.bank!==expected.bank))record('ADDON_'+name,['posgieo','quanlygieo','manage'],'Bill 30K + topping 5K, '+name,expected,actual,['posgieo:_submitAddonImpl/orderCashAmountPOS/orderBankAmountPOS','quanlygieo:orderCashAmount/orderBankAmount','manage:ggAddOrder/xoAddOrder']);
  else pass('Addon '+name+' khớp cả ba app');
 }
 const same=await addonCase('TIỀN MẶT','TIỀN MẶT');assert.deepEqual([same.cashPOS,same.bankPOS,same.cashQL,same.bankQL,same.cashManage,same.bankManage],[35000,0,35000,0,35000,0]);pass('Đối chứng: topping cùng tiền mặt khớp 35K ở cả ba app');
 const gift=tcGiftCase();
 if(gift.manage.snack!==0||gift.manage.cashDue!==25000)record('TC33_GIFT_ZERO',['pos','manage'],'Trà 25K + Bánh 20K được tặng; khách trả tiền mặt 25K',{revenue:25000,snack:0,cashDue:25000},gift,['pos:applyPickedCartItem/saveOrderToFirebase/calculateStats','manage:tcAddOrder/tcxCashExpected']);
 for(const tz of ['Asia/Ho_Chi_Minh','UTC','Australia/Sydney']){
  const r=timeCase(tz);if(tz==='Asia/Ho_Chi_Minh'){assert.equal(r.writePath.day,'21');assert.deepEqual(r.manageRange,['2026-10-21']);assert.equal(r.payrollFrom,'2026-10-01');pass('Đối chứng múi giờ VN: ghi/đọc ngày và biên tháng khớp');}
  if(r.writePath.day!=='21'||!r.manageRange.includes('2026-10-21')||r.payrollFrom!=='2026-10-01'||r.payrollTo!=='2026-10-31')record('TIMEZONE_'+tz,['pos','manage'],'Cùng thời điểm 00:30 ngày 21/10 VN, máy đặt '+tz,{billDay:'21',reportDay:'2026-10-21',range:['2026-10-21'],payrollFrom:'2026-10-01',payrollTo:'2026-10-31'},r,['pos:getOrderParts','manage:dkey/parseDkey/readPayroll']);
 }
 const report={generatedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),limitations:['Firebase giả; không truy cập dữ liệu quán','Phần in/két/nhà cung cấp thanh toán bên ngoài chưa được kiểm chứng','Không thay đổi app hoặc dữ liệu; chỉ chẩn đoán'],checks,findings};
 const i=process.argv.indexOf('--json');if(i>=0){assert(process.argv[i+1]);fs.writeFileSync(process.argv[i+1],JSON.stringify(report,null,2)+'\n');}
 console.log('AUDIT COMPLETE: '+findings.length+' trường hợp lỗi; '+checks.length+' đối chứng đạt. Không sửa app.');
})().catch(e=>{console.error('AUDIT ERROR',e);process.exitCode=1});
