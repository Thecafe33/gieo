// Tổng chuỗi, phạm vi so sánh và sổ vốn: dữ liệu giả, không gọi Firebase.
'use strict';
const assert=require('assert/strict'),fs=require('fs'),{extract}=require('./lib/extract');
const GieoData=require('../data_access.v9.js').GieoData;
const names=['pad','dkey','daysBetweenInclusive','totalCapex','thvTongVon','thvMocBatDau','thvTienNgay','thvCompute','monthRecoveryStage','plNgayLuongCanTinhLai','plNgayDaCanTinhLai','chainMonthReadGroup','chainMonthRange','chainBookRecovery','chainMonthModel','monthResponsibilityMetric'];
const api=new Function('GieoData','fmt',`const THV_MAX_DAYS=730,PL_LABOR_VERSION=2,PL_ICE_VERSION=1;${extract('quanlygieo.html',names)};return{${names.join(',')}};`)(GieoData,n=>String(n??0));
let count=0;const check=(v,m)=>{assert.ok(v,m);console.log('ok '+m);count++};
let r=api.chainMonthRange('2026-10','2026-10-18');
check(r.startKey==='2026-10-01'&&r.endKey==='2026-10-18'&&r.previousStartKey==='2026-09-01'&&r.previousEndKey==='2026-09-18','tháng đang chạy so cùng số ngày đầu tháng trước');
r=api.chainMonthRange('2026-03','2026-03-31');check(r.previousEndKey==='2026-02-28','tháng trước ngắn hơn thì chặn ở ngày cuối tháng');
r=api.chainMonthRange('2024-02','2026-10-18');check(r.endKey==='2024-02-29'&&r.previousStartKey==='2024-01-01'&&r.previousEndKey==='2024-01-31','tháng đã kết thúc so toàn tháng, đúng năm nhuận');
r=api.chainMonthRange('2026-01','2026-01-08');check(r.previousStartKey==='2025-12-01'&&r.previousEndKey==='2025-12-08','so sánh qua năm giữ đúng kỳ');
let bad=0;for(const m of ['2026-00','2026-13','a','2026-1'])try{api.chainMonthRange(m,'2026-10-18')}catch(e){bad++}check(bad===4,'chặn tháng sai trước khi đọc');
const unit=(id,value,rec,extra={})=>({st:{id},pl:{doanhThu:value+20},contribution:value,previousContribution:10,recovery:rec,missing:[],pending:0,flow:{thu:value+20,chi:100,muaHang:70,chuaRoNgay:0},...extra});
let m=api.chainMonthModel([unit('gg01',100,{recoveryContribution:100,operatingSurplus:0}),unit('gg02',-50,{recoveryContribution:0,operatingSurplus:-50},{isFinal:true}),unit('gg03',30,null,{missing:['lịch sử vốn']}),{st:{id:'gg04'},error:'Không đọc được'}]);
check(m.revenue===140&&m.contribution===80&&m.good.length===3&&m.errors.length===1,'chỉ cộng unit có dữ liệu, lỗi đọc không đóng giả số 0');
check(m.recovery===100&&m.surplus===-50&&m.unclassified===30&&m.recovery+m.surplus+m.unclassified===m.contribution,'góp vốn, thặng dư âm và phần chưa phân loại khớp tổng');
check(m.closed.length===1&&m.review.length===2,'chốt kế toán độc lập với phase, unit âm/thiếu nguồn cần rà');
check(m.flow.thu===140&&m.flow.chi===300&&m.flow.conLai===-160&&m.flow.muaHang===210,'thu/chi cộng riêng và không đồng nhất với kết quả vận hành');
m=api.chainMonthModel([unit('gg01',100,{recoveryContribution:25,operatingSurplus:50})]);check(m.unclassified===25&&m.unclassifiedUnits.length===1,'kết quả trước mốc bắt đầu theo dõi vốn không biến mất khi phân giai đoạn');
m=api.chainMonthModel([{st:{id:'gg01'},error:'Lỗi'}]);check(!m.good.length&&m.errors.length===1,'toàn bộ unit lỗi được giữ trạng thái thiếu, UI có thể chặn hiển thị số');
// Sổ dày ngày, có phiên bản lương/đá đúng và dấu đã xử lý; chỉ tính từ sổ có sẵn.
const start='2026-08-31',range=api.chainMonthRange('2026-10','2026-10-18'),by={};
for(let d=new Date(start+'T12:00:00');api.dkey(d)<=range.endKey;d.setDate(d.getDate()+1)){const date=api.dkey(d);by[date]={date,lai:date===start?800:0,khauHao:0,luong:0,chiPhiCoDinh:0,bienPhiKhac:0,mucTinCay:'chot-thang',laborVersion:2,iceVersion:1,updatedAt:'2026-10-18T12:00:00Z'};}
const assets=[{purchaseCost:1000,purchaseDate:start,active:true}],finance={recoveryStartDate:start},book={du:start,d:by},fresh=Object.values(by).filter(d=>d.date>=range.previousStartKey).map(d=>({...d,lai:d.date==='2026-10-01'?300:0}));
const calc=(b=book,f=finance,period=fresh,marks={})=>api.chainBookRecovery(b,f,assets,period,range,marks);
let stage=calc();check(stage.stage==='transition'&&stage.opening===800&&stage.closing===1100&&stage.recoveryContribution===300,'thay đúng snapshot kỳ hiện tại, xác định mốc vốn từ lịch sử + ngày tính mới');
check(by['2026-10-01'].lai===0,'không ghi đè book đầu vào khi chỉ xem báo cáo');
check(calc({...book,du:'2026-09-01'})===null&&calc(null)===null,'mốc đủ sổ bắt đầu sau mốc vốn hoặc thiếu sổ thì chưa xác định phase');
const gap={...by};delete gap[start];check(calc({...book,d:gap})===null,'một ngày lịch sử thiếu cũng không được kết luận đã hoàn vốn');
check(calc(book,finance,fresh,{[start+'_'+start]:'2026-10-19T00:00:00Z'})===null,'snapshot có dấu sửa mới hơn bị từ chối, không đọc lại sổ gốc chỉ để mở popup');
const oldIce={...by,[start]:{...by[start],bienPhiKhac:50,iceVersion:0}};check(calc({...book,d:oldIce})===null,'sổ đá cũ chưa sửa không được dùng để phân giai đoạn');
stage=calc(book,{...finance,recoveryReachedDate:'2026-09-15'},fresh.map(x=>({...x,lai:-10})));check(stage.stage==='operating'&&stage.operatingSurplus<0&&stage.reached==='2026-09-15','mốc đã xác nhận không mất khi có lỗ sau hoàn vốn');
stage=calc(book,{...finance,recoveryReachedDate:'2026-11-01'},fresh.map(x=>({...x,lai:0})));check(stage.stage==='recovery'&&!stage.reached,'mốc tháng sau không áp ngược kỳ hiện tại');
let x=api.monthResponsibilityMetric('Chênh đếm BTP cuối ca · thiếu / thừa',[{date:'a',category:'prepCountShort',value:10},{date:'b',category:'reportedWaste',value:30}],[]);check(x.rows.length===1&&x.rows[0][1]==='10','giải thích chỉ lấy đúng nhóm BTP đang bấm, không cộng hao hụt khác');
x=api.monthResponsibilityMetric('Tổng lệch THIẾU',[],[{date:'a',v:-20},{date:'a',v:30}]);check(x.rows.length===1&&x.rows[0][1]==='-20','thiếu/thừa tiền mặt không bù trừ trong giải thích');
(async()=>{
 let release,settled=false,finished=false;const slow=new Promise(r=>release=r);
 const group=api.chainMonthReadGroup([Promise.reject(new Error('read fail')),slow.then(()=>{finished=true;return 'late'})]).catch(err=>{settled=true;assert.equal(err.message,'read fail')});
 await Promise.resolve();await Promise.resolve();check(!settled&&!finished,'nhánh đọc lỗi chờ nhánh khác xong trước khi hoàn trả scope');
 release();await group;check(settled&&finished,'đủ mọi nhánh rồi mới trả lỗi, không còn gán dữ liệu muộn sang unit sau');
 const values=await api.chainMonthReadGroup([Promise.resolve('a'),Promise.resolve('b')]);check(values.join('')==='ab','nhóm đọc giữ thứ tự nguồn cho các dữ liệu trả về');
 console.log('ALL PASS '+count);
})().catch(e=>{console.error(e);process.exitCode=1});
