// Thu hồi vốn: thay đúng ngày đang chạy từ P&L, không đọc thêm khi bill RT đổi.
'use strict';
const assert=require('assert/strict'),{extract}=require('./lib/extract');
const names=['thvDropCache','thvCacheScope','thvCapNhatHomNay','thvGhiMoc','thvTienNgay',
  'thvCompute','thvTongVon','thvMocBatDau','totalCapex','computeCapitalRecovery'];
const homNay='2026-10-17',day=(date,tien)=>({date,lai:tien-50000,khauHao:50000});
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.01,`${a} ≈ ${b}`);
const Clock=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-17T05:00:00Z']))}};
let passed=0;const check=(msg,fn)=>{fn();passed++;console.log('ok '+msg)};
function setup(){
 const state={store:'gg01',reads:0,writes:0,finance:{recoveryStartDate:'2026-09-01'},
   days:[day('2026-10-15',200000),day('2026-10-16',300000),day(homNay,-100000)]};
 const code=`let _thvCache=null,_thvEpoch=0;const THV_MAX_DAYS=730;let QL_VIEW='gg01',QL_ALL=false;
 const FINANCE=state.finance,window={GieoData:{storeId:()=>state.store}},GieoData=window.GieoData;
 const dkey=d=>typeof d==='string'?d:d.toISOString().slice(0,10);
 const loadAssetsAll=async()=>{state.reads++;return [{purchaseCost:10000000,purchaseDate:'2026-09-01'}]};
 let plNgayTuSo=async()=>{state.reads++;return {days:state.days}};
 const saveFinance=async d=>{state.writes++;if(state.pendingSave)await state.pendingSave;Object.assign(FINANCE,d)};
 ${extract('quanlygieo.html',names)}
 return {computeCapitalRecovery,thvCapNhatHomNay,thvDropCache,thvCompute,
   get:()=>_thvCache,set:c=>{_thvCache=c},setLoader:f=>{plNgayTuSo=f}};`;
 // Loader is overridable below for delayed responses. Keep data reads observable.
 return {state,api:new Function('state','Date',code)(state,Clock)};
}
(async()=>{
 const {state,api}=setup();
 const old=await api.computeCapitalRecovery();
 check('nạp ban đầu cộng đúng mọi ngày',()=>near(old.daThuHoi,400000));
 const firstReads=state.reads;
 check('giữ cả dữ liệu ngày trong đệm',()=>assert.equal(api.get().days.length,3));
 await api.computeCapitalRecovery();
 check('mở lại cùng quán/ngày dùng đệm',()=>assert.equal(state.reads,firstReads));
 let current=api.thvCapNhatHomNay(day(homNay,150000));
 check('bill mới: luỹ kế, thiếu vốn, tốc độ, kỳ dự kiến cùng đổi',()=>{
  near(current.daThuHoi,650000);near(current.conCan,9350000);near(current.tocDoThang,6500000);
  near(current.soThangConLai,9350000/6500000);assert.equal(current.soNgayAm,0);
  near(current.theoThang[0].tien,650000);
 });
 api.thvCapNhatHomNay(day(homNay,150000));
 check('gửi lại cùng bill không cộng trùng',()=>near(api.get().data.daThuHoi,650000));
 api.thvCapNhatHomNay(day(homNay,200000));
 check('sửa bill thay ngày thay vì cộng chồng',()=>near(api.get().data.daThuHoi,700000));
 current=api.thvCapNhatHomNay(day(homNay,-100000));
 check('xoá bill trả đúng luỹ kế và ngày lỗ ban đầu',()=>{near(current.daThuHoi,old.daThuHoi);assert.equal(current.soNgayAm,1)});
 check('ngày cũ nguyên vẹn, không đọc/ghi khi bill đổi dưới mốc',()=>{
  assert.deepEqual(api.get().days.slice(0,2),state.days.slice(0,2));assert.equal(state.reads,firstReads);assert.equal(state.writes,0);
 });
 const result=await api.computeCapitalRecovery();
 check('màn khác đọc được đệm đã cập nhật',()=>assert.equal(result,current));
 state.store='gg02';
 check('không lấy đệm quán khác để cập nhật',()=>assert.equal(api.thvCapNhatHomNay(day(homNay,999)),null));
 await api.computeCapitalRecovery();
 check('đổi quán phải nạp đúng quán mới',()=>{assert.equal(state.reads,firstReads+2);assert.equal(api.get().scope,'gg02')});
 api.thvDropCache();state.days=[day('2026-10-16',100000)];
 await api.computeCapitalRecovery();api.thvCapNhatHomNay(day(homNay,200000));api.thvCapNhatHomNay(day(homNay,250000));
 check('sổ chưa có hôm nay: thêm một lần, thay được số mới',()=>{assert.equal(api.get().days.length,2);near(api.get().data.daThuHoi,350000)});
 api.get().data.batDauThat='2026-10-18';
 check('không cộng hôm nay trước mốc đầu tư tương lai',()=>assert.equal(api.thvCapNhatHomNay(day(homNay,1000000)),null));
 api.get().data.batDauThat='2026-09-01';api.get().key='2026-10-16';
 check('không trộn đệm ngày hôm qua vào hôm nay',()=>assert.equal(api.thvCapNhatHomNay(day(homNay,1000000)),null));
 // 30 ngày gần nhất: thay một ngày không làm dài cửa sổ/đổi lịch sử.
 api.thvDropCache();state.days=Array.from({length:46},(_,i)=>{const d=new Date('2026-09-02T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return day(d.toISOString().slice(0,10),100000)});
 await api.computeCapitalRecovery();current=api.thvCapNhatHomNay(day(homNay,400000));
 check('tốc độ lấy đúng 30 ngày, luỹ kế vẫn gồm cả lịch sử',()=>{near(current.daThuHoi,4900000);near(current.tocDoThang,3300000);assert.equal(current.soNgay,46)});
 // Hoàn thành lần nạp cũ sau khi reset không được phục hồi đệm cũ.
 api.thvDropCache();let release,started;const waiting=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 api.setLoader(async()=>{started();return waiting});const slow=api.computeCapitalRecovery();await ready;
 api.thvDropCache();api.setLoader(async()=>({days:[day(homNay,123000)]}));await api.computeCapitalRecovery();
 release({days:[day(homNay,999999)]});await slow;
 check('tải lại: kết quả nạp cũ không ghi đè đệm mới',()=>near(api.get().data.daThuHoi,123000));
 // Bill tới trong lúc lịch sử đang nạp: ghép P&L mới nhất sau khi nạp xong.
 api.thvDropCache();api.setLoader(async()=>({days:[day(homNay,100000)]}));await api.computeCapitalRecovery();
 current=api.thvCapNhatHomNay(day(homNay,777000));
 check('P&L mới nhất thay được ảnh sổ cũ nạp nền',()=>near(current.daThuHoi,777000));
 let finish;state.pendingSave=new Promise(r=>finish=r);
 api.thvCapNhatHomNay(day(homNay,11000000));api.thvCapNhatHomNay(day(homNay,12000000));
 check('RT chạm 100%: giữ ghi mốc một lần dù nhiều bill',()=>assert.equal(state.writes,1));
 finish();await new Promise(r=>setTimeout(r,0));
 check('ghi xong: đệm hiện tại nhớ mốc đã đạt',()=>{assert.equal(api.get().data.daGhiMoc,true);assert.equal(state.finance.recoveryReachedDate,homNay)});
 api.thvCapNhatHomNay(day(homNay,13000000));
 check('bill tiếp theo không ghi lại mốc đã lưu',()=>assert.equal(state.writes,1));
 console.log('ALL PASS '+passed);
})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1});
