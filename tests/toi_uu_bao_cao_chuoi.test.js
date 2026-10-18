// Đọc sổ ngày trước, nguồn sau; dữ liệu giả, không gọi Firebase thật.
'use strict';
const assert=require('assert/strict'),{extract}=require('./lib/extract'),G=require('../data_access.v9.js').GieoData;
const now=Date.parse('2026-10-18T05:00:00Z'),Clock=class extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}};
const keys=['doanhThu','giaVon','phiKenh','luong','chiPhiCoDinh','khauHao','haoHut','bienPhiKhac','tongChiPhi','lai','laiTruocKhauHao'];
const names=['pad','dkey','daysBetweenInclusive','chainMonthRange','plNgayLuongCanTinhLai','plNgayDaCanTinhLai','plTomTatNgay','chainMonthPeriods','chainMonthDayValid','chainMonthNeedDays','chainMonthSegments','chainMonthSaveDays','chainMonthReadDays','chainMonthReadGroup','chainMonthReadSales'];
const state={store:'gg01',docs:{},reads:[],writes:[],failWrite:false};
const fs={collection(name){const scoped=name+(state.store==='gg01'?'':'__'+state.store);const query=(filters=[])=>({where(k,op,v){return query([...filters,[k,op,v]])},async get(){state.reads.push([scoped,filters]);const docs=Object.entries(state.docs[scoped]||{}).filter(([id,x])=>filters.every(([k,op,v])=>op==='>='?x[k]>=v:x[k]<=v)).map(([id,x])=>({id,data:()=>structuredClone(x)}));return {docs,forEach:fn=>docs.forEach(fn)}},doc(id){return {scoped,id,async get(){state.reads.push([scoped,id]);if(state.failArchive&&name==='orders_gieogieo_archive')throw new Error('archive fail');const x=state.docs[scoped]?.[id];return {exists:!!x,data:()=>structuredClone(x)}}}}});return query()},batch(){const ops=[];return {set(ref,row,opts){ops.push([ref,row,opts])},async commit(){if(state.failWrite)throw new Error('write fail');for(const [{scoped,id},row,opts]of ops){state.docs[scoped]??={};const old=state.docs[scoped][id]||{};state.docs[scoped][id]=opts?.merge?{...old,...row,d:{...old.d,...row.d}}:structuredClone(row);state.writes.push([scoped,id]);}}}}};
const api=new Function('GieoData','fstore','Date','PL_TOM_TAT_KEYS','db','window','MONTH_KEYS','aggregateOrders','rawMixFromOrders','ensurePriceHistory','ensureRecipeHistory','ensurePrepRecipeHistory',`const PL_LABOR_VERSION=1,PL_ICE_VERSION=1;${extract('quanlygieo.html',names)};return{${names.join(',')}};`)({...G,storeId:()=>state.store,plNgayCanTinh:(by,a,b,o)=>G.plNgayCanTinh(by,a,b,{...o,now})},fs,Clock,keys,{ref:p=>({once:async()=>{state.reads.push(['rt',p]);if(state.failRt)throw new Error('rt fail');return {val:()=>state.rt?.[p]||null}}})},{},['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],orders=>({revenue:orders.reduce((n,o)=>n+o.total,0),cogsActual:0}),()=>[],async()=>{},async()=>{},async()=>{});
let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
const range=api.chainMonthRange('2026-10','2026-10-18');
const row=(date,revenue=1000)=>({date,doanhThu:revenue,giaVon:300,phiKenh:0,luong:100,chiPhiCoDinh:0,khauHao:10,haoHut:0,bienPhiKhac:0,tongChiPhi:410,lai:revenue-410,laiTruocKhauHao:revenue-400,mucTinCay:'chot-thang',laborVersion:1,laborCheckedAmount:100,iceVersion:1,iceCheckedExpenseAmount:0,updatedAt:new Clock().toISOString()});
const seed=()=>{const by={};for(let d=new Clock('2026-09-01T12:00:00');api.dkey(d)<=range.endKey;d.setDate(d.getDate()+1)){const key=api.dkey(d);by[key]=row(key)}return {du:'2026-09-01',d:by}};
let calls=[];const compute=async(a,b)=>{calls.push([api.dkey(a),api.dkey(b)]);const days=[];for(let d=new Clock(a);d<=b;d.setDate(d.getDate()+1))days.push(row(api.dkey(d),2000));return {days}};
(async()=>{
 let book=seed(),r=await api.chainMonthReadDays(range,book,{},compute);
 check(calls.length===0&&state.reads.length===0&&state.writes.length===0&&r.reused===36,'sổ hợp lệ: dùng 36 ngày hai kỳ, không đọc nguồn/legacy và không ghi lại');
 check(api.chainMonthNeedDays(book.d,range,{},true).join()==='2026-10-18','tải lại buộc làm mới đúng hôm nay, giữ ngày cũ hợp lệ');
 delete book.d['2026-09-25'];check(api.chainMonthNeedDays(book.d,range,{}).length===0,'không tính phần cuối tháng trước ngoài kỳ so sánh');
 const key='2026-10-03';delete book.d[key];calls=[];r=await api.chainMonthReadDays(range,book,{},compute);
 check(calls.length===1&&calls[0].join()===key+','+key&&r.computed===1&&r.days.find(x=>x.date===key).doanhThu===2000,'thiếu một ngày: chỉ tính đúng ngày và thay giá trị');
 check(state.writes.every(([c])=>/^(pl_days|pl_book)_gieogieo$/.test(c))&&!state.writes.some(([c])=>/closing|finance/.test(c)),'chỉ cập nhật sổ tổng hợp hiện có, không chạm sổ chốt hay mốc vốn');
 calls=[];r=await api.chainMonthReadDays(range,r.book,{},compute);check(calls.length===0&&r.reused===36,'ngày vừa sửa được dùng lại, không tính lặp khi mở lại');
 book=seed();calls=[];const marks={[key+'_'+key]:'2026-10-18T05:00:01Z'};r=await api.chainMonthReadDays(range,book,marks,compute);
 check(calls.length===1&&calls[0][0]===key&&book.d[key].doanhThu===1000,'dấu sửa chỉ chọn đúng ngày; không làm biến đổi book đầu vào');
 check(G.plCoDau(marks,key,r.book.d[key].updatedAt),'dấu phát sinh trong lúc tính vẫn mới hơn mốc đọc, không bị xoá dấu hiệu');
 const missing=seed();delete missing.d[key];delete missing.du;state.docs.pl_days_gieogieo={[key]:row(key)};calls=[];const before=state.reads.length;r=await api.chainMonthReadDays(range,missing,{},compute);
 check(calls.length===0&&state.reads.length===before+1&&state.reads.at(-1)[1].every(([,op,v])=>v===key),'book cũ thiếu ngày: bù đúng khoảng từ pl_days, không quét sổ nguồn');
 const split=api.chainMonthSegments(['2026-10-03','2026-10-01','2026-10-02','2026-10-06']);check(JSON.stringify(split)===JSON.stringify([['2026-10-01','2026-10-03'],['2026-10-06','2026-10-06']]),'chỉ gom ngày liền nhau, không đọc ké ngày hợp lệ ở giữa');
 const invalid=seed();invalid.d[key].lai=999999;check(api.chainMonthNeedDays(invalid.d,range,{}).includes(key),'tổng chi phí/lãi không khớp thì không tin snapshot');
 invalid.d[key]=row(key);delete invalid.d[key].giaVon;check(api.chainMonthNeedDays(invalid.d,range,{}).includes(key),'snapshot thiếu trường tài chính không bị hiểu là số 0');
 book=seed();delete book.d[key];const beforeWrites=state.writes.length;let failed=false;
 try{await api.chainMonthReadDays(range,book,{},async()=>{throw new Error('source fail')})}catch(e){failed=true}
 check(failed&&state.writes.length===beforeWrites,'nguồn lỗi: không ghi snapshot 0 đè số cũ');
 failed=false;try{await api.chainMonthReadDays(range,book,{},async()=>({days:[{...row(key),lai:1}]}))}catch(e){failed=true}check(failed&&state.writes.length===beforeWrites,'phép tính mới không khớp không được ghi vào sổ');
 state.failWrite=true;calls=[];const warn=console.warn;console.warn=()=>{};
 try{r=await api.chainMonthReadDays(range,book,{},compute)}finally{state.failWrite=false;console.warn=warn}
 check(r.saveError&&r.days.find(x=>x.date===key).doanhThu===2000,'lỗi ghi sổ được nêu rõ, số vừa tính vẫn xem được');
 state.store='gg02';calls=[];r=await api.chainMonthReadDays(range,book,{},compute);check(state.writes.slice(-2).every(([c])=>c.endsWith('__gg02')),'sổ tính lại ghi đúng quán đang ở trong scope');
 book=seed();book.d[key].mucTinCay='dang-chay';book.d[key].laborVersion=0;check(api.chainMonthNeedDays(book.d,range,{}).join()===key,'sổ lương phiên bản cũ chọn sửa đúng ngày, không sửa cả kỳ');
 book=seed();book.d[key].wasteValueThieu=true;check(api.chainMonthNeedDays(book.d,range,{}).includes(key),'bản ghi báo thiếu nguồn hao hụt không được coi hợp lệ');
 book=seed();delete book.d[key];const readAt='2026-10-18T04:59:00Z';r=await api.chainMonthReadDays(range,book,{},compute,false,readAt);
 check(r.book.d[key].updatedAt===readAt&&G.plCoDau({[key+'_'+key]:'2026-10-18T04:59:30Z'},key,r.book.d[key].updatedAt),'dùng mốc trước cả lượt đọc tài sản, không che sửa đổi giữa lúc nạp');
 check(!state.reads.some(([c])=>/stock_transactions|prep_transactions|orders/.test(c)),'đường dùng sổ không tải truy vết bill/tem/BTP');
 state.docs.orders_gieogieo_archive__gg02={oct_03_2026:{orders:{same:{total:1000},arch:{total:2000}}}};
 state.rt={'orders_gieogieo/oct/03':{same:{total:3000,date:'03/10/2026'},live:{total:4000,date:'03/10/2026'},wrong:{total:99999,date:'03/10/2025'}}};
 state.docs.prep_shortage_recons_gieogieo__gg02={sub:{businessDate:key,status:'substitution_confirmed',cogsDelta:100}};
 const sales=await api.chainMonthReadSales(new Clock(key+'T00:00:00'),new Clock(key+'T00:00:00'));
 check(sales.perDay[0].revenue===9000&&sales.perDay[0].cogsActual===100,'tính lại: gộp archive/RT theo khoá, loại năm khác và cộng bù BTP');
 check(!state.reads.some(([c])=>String(c).includes('daily_sales_cache')),'tính lại COGS không lấy cache doanh thu đã chứa giá vốn cũ');
 for(const source of ['failArchive','failRt']){
  state[source]=true;let error=false;const before=state.writes.length;
  try{await api.chainMonthReadDays(range,book,{[key+'_'+key]:'2026-10-18T05:01:00Z'},async(a,b)=>{const x=await api.chainMonthReadSales(a,b);return {days:x.perDay.map(p=>row(p.date,p.revenue))}})}catch(e){error=true}finally{state[source]=false}
  check(error&&state.writes.length===before,source+': bill đọc lỗi không bị đổi thành doanh thu 0 rồi ghi sổ');
 }
 console.log('ALL PASS '+n);
})().catch(e=>{console.error(e);process.exitCode=1});
