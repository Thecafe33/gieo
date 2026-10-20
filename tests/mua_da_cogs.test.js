// Mua đá: giữ tiền chi/két; giá vốn món giữ nguyên; không trừ lãi/lỗ hai lần.
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{extract}=require('./lib/extract');
const source=fs.readFileSync(path.join(__dirname,'../quanlygieo.html'),'utf8');
const declarations=source.match(/const PL_(?:LABOR|ICE)_VERSION = \d+;/g).join('\n');
const defaults=new Function('return '+source.match(/const DEFAULTS = (\{[\s\S]*?\n\});/)[1])();
const names=['pad','dkey','daysInMonth','configForDate','laborMonthlyTotal','computeWageForDayHours','expenseCoveredByCogs','costTypeOf','guessCostType','splitExpensesByCostType','daysBetweenInclusive','expenseAllocatedAmount','expenseIsEstimate','filterExpenses','computeDayPL','computeKPIs','plNgayDaCanTinhLai','plTomTatNgay','plBreakEven'];
const api=new Function('DEFAULTS',`const HR_SETTINGS={useActualLaborCost:true},CONFIG_HISTORY=[],EXP_VARIABLE_HINTS=['đá','ship'];
const PL_TOM_TAT_KEYS=${source.match(/const PL_TOM_TAT_KEYS = (\[[^;]+\]);/)[1]};${declarations}
const plChannelFeeForDay=()=>0,monthlyDepreciation=()=>0;
${extract('quanlygieo.html',names)};return{${names.join(',')}};`)(defaults);
let count=0;const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
const near=(a,b)=>Math.abs(a-b)<.01;
(async()=>{
 check(api.computeWageForDayHours({hourlyRate:20000,otEnabled:true,otThresholdHours:8,otRate:25000},10.5).amount===222500,'ca 09:30–20:00 = 222.500đ, không phải ngân sách tháng/31');
 check(near((6500000+2*75*20000)/31,306451.612903),'306K tái hiện đúng nguồn ngân sách 9,5 triệu/31 ngày');
 for(const label of ['Nước đá','  NƯỚC  ĐÁ ','Đá cây','Đá viên','Đá'])check(api.expenseCoveredByCogs({category:label}),'nhận đúng danh mục '+label.trim());
 check(['Trà đào','Đá sửa chữa','Ship','Đá xay','Tiền nước'].every(category=>!api.expenseCoveredByCogs({category})),'không loại nhầm chi phí có chữ gần giống');
 const date='2026-09-02',base={day:{date,revenue:100000,cogsActual:30000,revenueUncosted:0,toppingRevenueUncosted:0},cats:[],assets:[],laborActual:{[date]:0},laborPredicted:{},wasteValue:0,homNayKey:'2026-10-18'};
 const ice={id:'ice',date,category:'Nước đá',amount:20000,status:'approved',baseType:'cash'},ship={date,category:'Ship',amount:10000,status:'approved',baseType:'cash'};
 const plain=api.computeDayPL({...base,expList:[ship]}),withIce=api.computeDayPL({...base,expList:[ice,ship]});
 check(withIce.giaVon===30000&&withIce.bienPhiKhac===10000&&withIce.lai===60000,'giữ COGS, vẫn trừ ship; không trừ mua đá hai lần');
 check(withIce.lai===plain.lai&&withIce.chiMuaDa===20000,'thêm khoản mua đá không đổi lãi, vẫn có số tiền để theo dõi');
 check(api.computeDayPL({...base,laborActual:{[date]:222500},expList:[ice]}).luong===222500,'P&L dùng đúng lương theo ca đã tính');
 check(api.filterExpenses([ice,ship],new Date(date+'T00:00:00+07:00'),new Date(date+'T23:59:59+07:00')).reduce((s,e)=>s+e.amount,0)===30000,'sổ chi gốc vẫn đủ 30K; không sửa/xoá dữ liệu khoản mua');
 const period={...ice,date:null,periodType:'period',startDate:'2026-09-01',endDate:'2026-09-30',amount:600000,amountKind:'estimate'};
 const p=api.computeDayPL({...base,expList:[period]});
 check(p.chiMuaDa===20000&&p.bienPhiKhac===0&&p.mucTinCay==='chot-thang','mua đá theo kỳ phân bổ đúng và không làm P&L chờ hoá đơn ảo');
 const denied=api.computeDayPL({...base,expList:[{...ice,status:'pending_review'},{...ice,status:'rejected'}]});
 check(denied.chiMuaDa===0&&denied.lai===70000,'tôn trọng chờ duyệt/từ chối');
 const summary=api.plTomTatNgay(withIce),old={...summary,iceVersion:undefined,iceCheckedExpenseAmount:undefined,bienPhiKhac:30000};
 const now=Date.parse('2026-10-18T03:00:00Z'),book={[date]:old,'2026-09-03':{date:'2026-09-03',bienPhiKhac:0,chiPhiCoDinh:0}};
 check(api.plNgayDaCanTinhLai(book,date,'2026-09-03',{now}).join()===date,'ngày cũ đã chốt có khoản chi cũng được sửa, không chỉ dang-chay');
 book[date]=summary;check(api.plNgayDaCanTinhLai(book,date,'2026-09-03',{now}).length===0,'snapshot đã sửa không tính lại mỗi lần mở');
 book[date]={...summary,bienPhiKhac:30000};check(api.plNgayDaCanTinhLai(book,date,date,{now}).length===1,'bắt HTML cũ ghi đè chi phí qua merge');
 check(api.plNgayDaCanTinhLai(book,date,date,{now,back:2}).length===0,'manage giữ giới hạn ngày tính lại');
 const cash=new Function('loadDailyOpening','loadDailyClosing','fetchOrdersForDate','loadExpensesAll','loadHandoverRecord','computePostCloseBills',extract('quanlygieo.html',['orderCashAmount','orderBankAmount','computeCashBreakdownForDate'])+';return computeCashBreakdownForDate;')(
  async()=>({openingCash:500000}),async()=>null,async()=>[],async()=>[ice,ship],async()=>null,()=>null);
 const c=await cash(date);check(c.cashExpenseTotal===30000&&c.expected===470000,'đối soát két vẫn trừ đủ tiền mua đá + ship');
 const oldBy={[date]:old};
 const need=new Function('window','PL_COMPUTE_BACK','PL_TODAY_TTL',extract('manage.html',['plNeedDays'])+';return plNeedDays;')({GieoData:{plNgayCanTinh:()=>[]},LaiLo:api},62,600000);
 check(need(oldBy,date,date,now).join()===date,'manage dùng cùng quy tắc sửa snapshot đá');
 const kpi=api.computeKPIs({perDaySales:[{...base.day,bills:1,items:1,toppingBills:0,toppingRevenue:0}],opsSum:{},expList:[ice,ship],assets:[],actualLaborByDate:{[date]:0},ledgerWasteValue:0});
 check(kpi.cogs===30000&&kpi.opex===10000&&kpi.operatingCash===60000,'KPI cũ cũng không trừ mua đá hai lần');
 const be=api.plBreakEven(withIce);check(near((withIce.doanhThu-be.hoaVon)*be.bienDongGop,withIce.lai),'lãi và điểm hoà vốn vẫn khớp sau tách mua đá');
 console.log('ALL PASS '+count);
})().catch(e=>{console.error(e);process.exitCode=1});
