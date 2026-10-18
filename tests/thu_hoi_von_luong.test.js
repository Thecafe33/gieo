// Luỹ kế không tự mất tiền do ngày cũ không có lương bị thay bằng ngân sách.
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{extract}=require('./lib/extract');
const NOW=Date.parse('2026-10-18T03:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[NOW]))}static now(){return NOW}}
const source=fs.readFileSync(path.join(__dirname,'../quanlygieo.html'),'utf8');
const defaults=new Function('return '+source.match(/const DEFAULTS = (\{[\s\S]*?\n\});/)[1])();
let count=0;const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
const near=(a,b)=>Math.abs(a-b)<.01;
function labor(employees=[],shifts=[],error=false){
 let reads=0;
 const env={Date:Clock,QL_VIEW:'gg01',GieoData:{storeId:()=> 'gg01'},loadEmployees:async()=>{reads++;return employees},
 fstore:{collection:()=>({where(){return this},get:async()=>{reads++;if(error)throw Error('offline');return{docs:shifts.map(s=>({data:()=>s}))}}})}};
 const names=['pad','dkey','daysInMonth','payTermsOfRecord','empPayTermsOn','computeWageForDayHours','isFixedPayType','empFixedPayHere','isShiftInProgress','shiftWorkedHours','computeActualLaborCostByDate'];
 return{fn:new Function(...Object.keys(env),extract('quanlygieo.html',names)+';return computeActualLaborCostByDate;')(...Object.values(env)),reads:()=>reads};
}
function calculators(){
 return new Function('Date','DEFAULTS',`const HR_SETTINGS={useActualLaborCost:true},CONFIG_HISTORY=[],PL_LABOR_VERSION=1,PL_ICE_VERSION=1;
 const splitExpensesByCostType=()=>({coDinh:0,bienDoi:0}),plChannelFeeForDay=()=>0,monthlyDepreciation=()=>0;
 ${extract('quanlygieo.html',['pad','dkey','daysInMonth','configForDate','laborMonthlyTotal','computeDayPL','plTomTatNgay','plNgayLuongCanTinhLai','plNgayDaCanTinhLai','expenseCoveredByCogs','thvTienNgay','thvCompute'])}
 const PL_TOM_TAT_KEYS=['luong','lai','khauHao'];return{computeDayPL,plTomTatNgay,plNgayLuongCanTinhLai,plNgayDaCanTinhLai,thvCompute};`)(Clock,defaults);
}
(async()=>{
 const c=calculators(),empty=labor(),actual=await empty.fn('2026-09-01','2026-09-04');
 check(Object.values(actual).length===4&&Object.values(actual).every(v=>v===0),'bốn ngày cũ không phát sinh lương có số 0 rõ ràng');
 check(empty.reads()===2,'không thêm lượt đọc: một danh sách nhân viên và một truy vấn ca');
 const hourly=labor([{id:'e',payType:'hourly_part',hourlyRate:20000,active:true}]);
 check(Object.values(await hourly.fn('2026-09-01','2026-09-04')).every(v=>v===0),'nhân viên lương giờ không có ca không làm mất khoá ngày');
 const inactive=labor([{id:'e',payType:'fixed',fixedMonthlySalary:0,active:false}]);
 check(Object.values(await inactive.fn('2026-09-01','2026-09-04')).every(v=>v===0),'tắt hồ sơ lương 0 không tự đẩy ngày cũ về ngân sách');
 const current=await empty.fn('2026-10-17','2026-10-18');
 check(current['2026-10-17']===0&&current['2026-10-18']===undefined,'giữ cơ chế dự đoán cho hôm nay, chỉ xác định 0 ngày đã qua');
 await assert.rejects(labor([],[],true).fn('2026-09-01','2026-09-04'),/offline/);count++;console.log('ok đọc lỗi không trở thành lương 0');
 const input=date=>({day:{date,revenue:0,revenueUncosted:0,toppingRevenueUncosted:0},expList:[],cats:[],assets:[],laborPredicted:{},wasteValue:0,homNayKey:'2026-10-18'});
 const days=Object.keys(actual).map(date=>c.computeDayPL({...input(date),laborActual:actual}));
 check(days.every(d=>d.luong===0&&d.laiTruocKhauHao===0&&!d.luongLaDuDoan),'ngày không hoạt động không tự sinh chi phí ngân sách');
 const today=c.computeDayPL({...input('2026-10-18'),laborActual:current});
 check(today.luong>0&&today.luongLaDuDoan,'hôm nay chưa có số thật vẫn có dự toán lương');
 const base={date:'2026-08-31',lai:10000000,khauHao:0};
 const profit=c.computeDayPL({...input('2026-10-17'),day:{date:'2026-10-17',revenue:500000,cogsActual:100000,revenueUncosted:0,toppingRevenueUncosted:0},laborActual:current});
 const sum=c.thvCompute({days:[base,...days,profit],tongVon:20000000});
 check(near(sum.daThuHoi,10400000),'luỹ kế giữ nguyên lịch sử và tăng đúng lãi của ngày bán hàng');
 check(near(c.thvCompute({days:[base,...days,{date:'2026-10-17',lai:-100000,khauHao:0}],tongVon:20000000}).daThuHoi,9900000),'ngày lỗ thật vẫn trừ đúng, không ép luỹ kế chỉ tăng');
 const summary=c.plTomTatNgay(days[0]);
 check(summary.laborVersion===1&&summary.laborCheckedAmount===0&&summary.luongNguon==='chấm công thật','bản tổng hợp có phiên bản và nguồn lương đã tính');
 const book={};for(const d of days)book[d.date]={date:d.date,luong:100000,mucTinCay:'dang-chay',updatedAt:'2026-10-17T12:00:00Z'};
 book['2026-09-05']={date:'2026-09-05',luong:100000,mucTinCay:'chot-thang'};
 book['2026-09-06']={...summary,date:'2026-09-06',mucTinCay:'dang-chay'};
 const select=c.plNgayLuongCanTinhLai(book,'2026-09-01','2026-09-06',{now:NOW});
 check(JSON.stringify(select)===JSON.stringify(Object.keys(actual)),'chỉ chọn bốn ngày ước tính cũ, giữ bản đủ số thật và bản đã sửa');
 book['2026-09-07']={...summary,date:'2026-09-07',luong:100000,mucTinCay:'dang-chay'};
 check(c.plNgayLuongCanTinhLai(book,'2026-09-07','2026-09-07',{now:NOW}).length===1,'phát hiện HTML cũ ghi đè tiền qua merge dù còn cờ phiên bản');
 check(c.plNgayLuongCanTinhLai(book,'2026-09-01','2026-09-07',{now:NOW,back:2}).length===0,'tôn trọng giới hạn ngày tính lại của manage');
 const gd=require('../data_access.v9.js').GieoData;
 const need=new Function('window','PL_COMPUTE_BACK','PL_TODAY_TTL',extract('manage.html',['plNeedDays'])+';return plNeedDays;')({GieoData:gd,LaiLo:c},62,600000);
 check(need(book,'2026-09-01','2026-09-04',NOW).length===4,'manage dùng cùng quy tắc sửa ngày cũ với quanlygieo');
 // Nạp sổ thật qua hàm trích từ HTML: chỉ sửa một đoạn, không tính lại toàn kỳ.
 const old={};for(const d of days)old[d.date]={date:d.date,luong:100000,lai:-100000,khauHao:0,mucTinCay:'dang-chay',updatedAt:'2026-10-17T12:00:00Z'};
 old['2026-09-05']={date:'2026-09-05',luong:0,lai:250000,khauHao:0,mucTinCay:'chot-thang'};
 const state={ranges:[],book:old};
 const env={Date:Clock,window:{GieoData:gd},GieoData:{storeId:()=> 'gg01',plNgayCanTinh:()=>[],plDocDau:async()=>null},QL_ALL:false,localStorage:{getItem:()=>null,setItem(){}},
  fstore:{collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({du:'2026-09-01',d:state.book})})})})},
  loadAssetsAll:async()=>[],computeDailyPLRange:async(a,b)=>{const from=a.toISOString().slice(0,10),to=b.toISOString().slice(0,10);state.ranges.push([from,to]);const fixed=days.filter(d=>d.date>=from&&d.date<=to).map(d=>({...d,...c.plTomTatNgay(d)}));for(const d of fixed)state.book[d.date]=d;return{days:fixed,assets:[]}},
  plNgayLuongCanTinhLai:c.plNgayLuongCanTinhLai,plNgayDaCanTinhLai:c.plNgayDaCanTinhLai};
 const load=new Function(...Object.keys(env),extract('quanlygieo.html',['pad','dkey','plSumDays','plNgayTuSo'])+';return plNgayTuSo;')(...Object.values(env));
 const result=await load(new Clock('2026-09-01T00:00:00Z'),new Clock('2026-09-05T00:00:00Z'));
 check(JSON.stringify(state.ranges)==='[["2026-09-01","2026-09-04"]]'&&near(result.tong.lai,250000),'nạp thu hồi vốn tự sửa đúng đoạn sai và giữ nguyên ngày khác');
 await load(new Clock('2026-09-01T00:00:00Z'),new Clock('2026-09-05T00:00:00Z'));
 check(state.ranges.length===1,'mở lại không lặp tính/ghi lịch sử đã sửa');
 console.log('ALL PASS '+count);
})().catch(e=>{console.error('FAIL',e);process.exitCode=1});
