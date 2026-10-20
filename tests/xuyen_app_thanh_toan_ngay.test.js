'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),acorn=require('acorn'),{execFileSync}=require('child_process');
const {extract,extractRaw}=require('./lib/extract');const root=path.resolve(__dirname,'..');
(async()=>{
 if(process.argv.includes('--zone')){
  const at='2026-10-20T17:30:00Z',ms=Date.parse(at),helper=extract('pos.html',['vnDate']);
  const c=vm.createContext({Date,console});vm.runInContext(helper,c);const d=c.vnDate(at);
  assert.equal(+d,ms);assert.equal(d.toISOString(),'2026-10-20T17:30:00.000Z');
  assert.deepEqual([d.getFullYear(),d.getMonth(),d.getDate(),d.getHours(),d.getMinutes(),d.getTimezoneOffset()],[2026,9,21,0,30,-420]);
  assert.equal(d.toLocaleDateString('en-CA'),'2026-10-21');
  assert.equal(c.vnDate('2026-10-01').toISOString(),'2026-09-30T17:00:00.000Z');
  assert.equal(c.vnDate(2026,10,0).getDate(),31);
  const next=c.vnDate('2026-11-01');next.setDate(next.getDate()+1);assert.equal(next.toISOString(),'2026-11-01T17:00:00.000Z');
  assert(Number.isNaN(+c.vnDate('không phải ngày')));
  assert.equal(c.vnDate(new Date(ms)).getDate(),21,'Nhận Date native từ SDK vẫn đổi lịch VN');
  const C=require('../cham_cong.v4.js');assert.equal(C.dateKey(new Date(ms)),'2026-10-21');
  for(const [file,names,call]of [['posgieo.html',['posDateKey'],"posDateKey(input)"],['PosX.html',['_localDateToYMD'],"_localDateToYMD(input)"],['quanlygieo.html',['pad','dkey'],"dkey(input)"]]){
   const key=new Function('input',extract(file,names)+';return '+call)(new Date(ms));assert.equal(key,'2026-10-21',file+' nhận Date native');
  }
  class FixedDate extends Date{constructor(...a){super(...(a.length?a:[at]))}static now(){return ms}}
  // Chạy nguyên phần caller tạo order, dừng ở biên ghi DB; không dựng lại DTO bằng test.
  for(const file of ['posgieo.html','PosX.html']){
   const src=extractRaw(file,['confirmPay']),ast=acorn.parse(src,{ecmaVersion:'latest'}),fn=ast.body[0];
   const st=fn.body.body.find(s=>s.type==='VariableDeclaration'&&s.declarations.some(d=>d.id.name==='order'));assert(st);
   const caller=src.slice(0,st.end)+';return order;}';
   const ctx=vm.createContext({Date:FixedDate,console,cart:{tea:{name:'Trà',itemId:'tea',size:'L',qty:1,price:30000}},MONTH_KEYS:['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    _isDayClosedToday:false,_backfillMode:null,requireShiftOpened:()=>true,requireOpeningChecklistDone:()=>true,requireSomeoneCheckedIn:()=>true,_payBegin:()=>true,
    getCartTotal:()=>30000,computeAllDiscounts:()=>0,getFinalTotal:()=>30000,getAppSaleDiscount:()=>0,isAppSale:false,isShip:false,isToGo:true,curPay:'cash',curCustomer:null,togoDiscountAmt:0,dgDiscountAmt:0,
    _giftVoucherKey:null,_stampFreeVKey:null,_appliedDiscountId:null,_discountCache:{},_bankConfirmMeta:null,document:{getElementById:()=>({value:''})},toast:m=>{throw Error(m)}});
   vm.runInContext(helper+'\n'+caller,ctx);const o=await ctx.confirmPay(30000,0);
   assert.equal(o.date,'21/10/2026',file);assert.equal(o.time,'00:30',file);assert.equal(o.createdAt,new Date(ms).toISOString(),file+' giữ timestamp thật');
  }
  console.log('ok '+process.env.TZ+': lịch VN/ISO/DST/tháng/chấm công/DTO hai POS');return;
 }
 const helper=extract('pos.html',['vnDate']);for(const file of ['posgieo.html','PosX.html','manage.html','quanlygieo.html'])assert.equal(extract(file,['vnDate']),helper,file+' cùng lịch VN');
 for(const zone of ['Asia/Ho_Chi_Minh','UTC','Australia/Sydney','America/New_York','Pacific/Honolulu'])process.stdout.write(execFileSync(process.execPath,[__filename,'--zone'],{cwd:root,env:{...process.env,TZ:zone},encoding:'utf8'}));
 const out=execFileSync(process.execPath,['tools/kiem_tra_xuyen_app.js','--assert-clean'],{cwd:root,env:{...process.env,TZ:'Asia/Ho_Chi_Minh'},encoding:'utf8'});process.stdout.write(out);assert(!out.includes('BUG '));
 // Chạy nhiều addon bằng các phương thức khác nhau và split: tiền phải bảo toàn.
 const M=new Function(extract('manage.html',['xoEmptySum','xoAddOrder','ggEmptySum','ggAddOrder','ggSummarize'])+';return ggSummarize')();
 const P=new Function(extract('posgieo.html',['orderCashAmountPOS','orderBankAmountPOS'])+';return [orderCashAmountPOS,orderBankAmountPOS]')();
 const Q=new Function(extract('quanlygieo.html',['orderCashAmount','orderBankAmount'])+';return [orderCashAmount,orderBankAmount]')();
 const nodes={};const revenue=new Function('document','fmt','_updShipStats',extract('posgieo.html',['orderCashAmountPOS','orderBankAmountPOS','updRv'])+';return updRv')({getElementById:id=>nodes[id]||(nodes[id]={style:{}})},String,()=>{});
 const num=id=>Number(String(nodes[id].textContent).replace(/\./g,''));
 for(const method of ['TIỀN MẶT','CHUYỂN KHOẢN','TÍNH RIÊNG'])for(const adds of [[],[{amount:5000,method:'TIỀN MẶT'}],[{amount:5000,method:'CHUYỂN KHOẢN'}],[{amount:5000,method:'TIỀN MẶT'},{amount:7000,method:'CHUYỂN KHOẢN'}]]){
  const baseCash=method==='TIỀN MẶT'?30000:method==='TÍNH RIÊNG'?15000:0,baseBank=30000-baseCash;
  const o={total:30000+adds.reduce((s,a)=>s+a.amount,0),method,addons:adds,splitGroups:[{method:'TIỀN MẶT',total:15000},{method:'CHUYỂN KHOẢN',total:15000}]};
  const cash=baseCash+adds.filter(a=>a.method==='TIỀN MẶT').reduce((s,a)=>s+a.amount,0),bank=baseBank+adds.filter(a=>a.method==='CHUYỂN KHOẢN').reduce((s,a)=>s+a.amount,0),m=M([o]);
  assert.deepEqual([P[0](o),P[1](o),Q[0](o),Q[1](o),m.cash,m.bank],[cash,bank,cash,bank,cash,bank]);assert.equal(m.cash+m.bank,o.total);
  revenue([o]);assert.deepEqual([num('rv-cash'),num('rv-bank'),num('rvtb')],[cash,bank,o.total],'màn Doanh thu POS dùng đúng phương thức addons');
 }
 console.log('ok nhiều addon/split bảo toàn phương thức và tiền; 0 lượt đọc bổ sung');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
