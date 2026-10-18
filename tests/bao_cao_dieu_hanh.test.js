// Tiền mua hàng và lợi nhuận là hai số khác nhau; báo cáo không chốt giả dữ liệu thiếu.
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{extract}=require('./lib/extract');
const src=fs.readFileSync(path.join(__dirname,'../quanlygieo.html'),'utf8');
const names=['pad','dkey','daysBetweenInclusive','expenseAllocatedAmount','expenseIsEstimate','expenseIsUnpaid','expenseCoveredByCogs','recordedCashFlow','purchasePaymentDoc','monthOwnerModel','monthOwnerReportText'];
const api=new Function('fmt','fmtNum',`const QL_VIEW='gg01';${extract('quanlygieo.html',names)};return{${names.join(',')}};`)(v=>String(v??0),v=>String(v??0));
let count=0;const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
const from='2026-09-01',to='2026-09-30',day='2026-09-02';
const purchase=api.purchasePaymentDoc({id:'po1',receiptId:'one'},5000000,day,'bank','trả NCC');
check(purchase.purchaseOrderId==='po1'&&purchase.accountingTreatment==='inventory_purchase'&&purchase.paidDate===day,'tiền thực trả có liên kết PO, ngày trả, phân loại riêng');
check(api.expenseCoveredByCogs(purchase),'thanh toán nguyên liệu không bị coi là opex');
let rejected=0;for(const [amount,date,method] of [[0,day,'bank'],[-1,day,'bank'],[Infinity,day,'bank'],[1,'2026-02-30','bank'],[1,day,'other']])try{api.purchasePaymentDoc({id:'p',receiptId:'one'},amount,date,method,'')}catch(e){rejected++}
check(rejected===5,'chặn tiền/ngày/nguồn không hợp lệ');
const sales=[{date:day,revenue:1000000}];
const flow=api.recordedCashFlow(sales,[purchase],from,to);
check(flow.thu===1000000&&flow.chi===5000000&&flow.conLai===-4000000&&flow.muaHang===5000000,'thu 1 triệu, trả hàng 5 triệu: dòng tiền âm 4 triệu, không gọi là lỗ');
check(api.recordedCashFlow(sales,[],from,to).chi===0,'PO chưa ghi trả không tự biến thành tiền đã chi');
const period={amount:3100000,periodType:'period',startDate:'2026-09-01',endDate:'2026-09-30',amountKind:'actual',paidDate:'2026-10-02',status:'approved'};
check(api.recordedCashFlow(sales,[period],from,to).chi===0&&api.expenseAllocatedAmount(period,new Date(from+'T00:00:00'),new Date(to+'T00:00:00'))===3100000,'chi phí tháng 9 trả tháng 10: P&L đúng kỳ, dòng tiền đúng ngày trả');
check(api.recordedCashFlow(sales,[{...period,paidDate:null}],from,to).chi===0,'khoản chưa trả không bị trừ dòng tiền');
check(api.recordedCashFlow(sales,[{...purchase,status:'rejected'},{...purchase,amountKind:'estimate'}],from,to).chi===0,'từ chối/dự đoán không bị coi là tiền trả thật');
check(api.recordedCashFlow(sales,[{date:day,amount:20000,source:'pos',status:'pending_review'}],from,to).chi===20000,'POS đã chi tiền dù còn chờ duyệt vẫn vào dòng tiền');
const d={m:9,y:2026,storeId:'gg01',start:new Date(from+'T00:00:00'),end:new Date(to+'T00:00:00'),monthEnd:new Date(to+'T00:00:00'),startKey:from,endKey:to,expAll:[purchase],
 plTong:{doanhThu:1000000,giaVon:300000,luong:222500,chiPhiCoDinh:0,bienPhiKhac:0,haoHut:0,khauHao:0,phiKenh:0,lai:477500,laiTruocKhauHao:477500,mucTinCay:'chot-thang'},
 plDays:[{date:day,doanhThu:1000000}],emps:[{id:'active',active:true},{id:'left',active:false}],empBreakdown:{active:{amount:222500,hours:10.5,otHours:2.5},left:{amount:100000,hours:5,otHours:0}},
 dataMissing:[],khoExtra:{tongNhap:5000000},cashVar:{},mix:{soBill:10,soLy:20,mon:[]}};
let m=api.monthOwnerModel(d,{});
check(m.pl.lai===477500&&m.flow.conLai===-4000000,'báo cáo giữ lãi 477.500đ riêng với dòng tiền âm 4 triệu');
check(m.hours===15.5&&m.ot===2.5&&m.working===2,'HR gồm cả nhân viên đã nghỉ có công trong kỳ');
check(m.received===5000000&&!m.isFinal,'giá trị nhận hàng riêng, không tự chốt khi chưa có sổ tháng');
m=api.monthOwnerModel({...d,plBook:{chot:{...d.plTong}}},{});check(m.isFinal,'chỉ nhận khớp chốt khi sổ và dữ liệu đủ khớp nhau');
m=api.monthOwnerModel({...d,plBook:{chot:{...d.plTong,lai:1}}},{});check(m.bookDiff&&!m.isFinal&&m.actions.some(s=>s.includes('sổ')),'số chốt khác số mới có cảnh báo, không ghi đè tự động');
m=api.monthOwnerModel({...d,dataMissing:['bảng lương'],empBreakdown:{}},{});
check(!m.hrAvailable&&!m.isFinal&&api.monthOwnerReportText(d,m).includes('Chưa đủ dữ liệu'),'lỗi đọc HR không được báo lương bằng 0 hoặc chốt đủ dữ liệu');
check(api.monthOwnerReportText(d,m).includes('Phạm vi: '+from+' → '+to),'báo cáo xuất có đúng phạm vi kỳ');
check(src.includes('if(obsolete())return;')&&src.includes('function currentMonthReportData()'),'có chặn lượt nạp cũ và xuất báo cáo sai kỳ/quán');
console.log('ALL PASS '+count);
