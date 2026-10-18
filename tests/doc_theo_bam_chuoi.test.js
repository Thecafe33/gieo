// Đếm lời gọi thật của các hàm trích từ HTML, không truy cập Firebase thật.
const assert=require('assert/strict'),vm=require('vm'),{extract}=require('./lib/extract');
const names=['renderTodayAll','loadTodayAllSection','todayAllSectionButton','drawTodayAll','reportAllKey','renderReportAll','refreshReportAll','loadReportAll','chainMonthReadGroup'];
const nodes={todayAll:{innerHTML:''},'screen-today':{},reportBody:{innerHTML:''}};
let calls=[],store='';let failStock=false,failReport=false,gate=null;
const read=(name,result)=>async()=>{calls.push([store,name]);if(gate&&['inventory','bills'].includes(name))await gate;if(failStock&&store==='gg02'&&name==='inventory')throw Error('mạng lỗi');if(failReport&&store==='gg02'&&name==='assets')throw Error('mạng lỗi');return structuredClone(result)};
const c={console,Date,Map,Number,Array,Promise,curScreen:'today',QL_STORES:[{id:'gg01'},{id:'gg02'}],INVENTORY_ITEMS:[],PREP_ITEMS:[],_costMemo:{},_todayAllData:null,_todayAllChiCanXem:true,_reportAllCache:new Map(),_rpAllKy:'tuan',STORE_HEALTH_ISSUE_COUNT:8,HR_SETTINGS:{},
 document:{getElementById:id=>nodes[id],querySelector:()=>({style:{}})},
 dkey:d=>new Date(d).toISOString().slice(0,10),fmt:x=>String(x),fmtNum:x=>String(x),fmtPct:x=>String(x),fmtDateVN:d=>String(d),escapeHtmlAttr:x=>String(x),ic:()=>'',icDot:()=>'',renderSidebarNav(){},setSync(){},memoDropAll(){},qlActiveStores(){return c.QL_STORES},ensureAuth:async()=>{},qlLoadStores:read('stores',null),qlAllNapChung:read('common',null),
 GieoData:{withStore:async(id,fn)=>{store=id;try{return await fn()}finally{store=''}}},
 fetchOrdersForDate:read('bills',[{total:20000},{total:30000}]),loadInventoryItems:read('inventory',[{id:'milk',name:'Sữa',currentStock:5}]),loadPrepItems:read('prep',[]),computeStoreHealth:read('health',[]),itemStockManaged:()=>true,
 _rpAllRange(k){return {start:new Date(k==='tuan'?'2026-10-12':'2026-10-01'),end:new Date('2026-10-18')}},
 loadCogsMaps:read('cogs',null),loadConfig:read('config',null),fetchSalesRange:read('sales',{perDay:[{}]}),loadDailyOpsAll:read('ops',[]),loadExpensesAll:read('expenses',[]),loadAssetsAll:read('assets',[]),computeLedgerRealMetrics:read('ledger',{}),sumDailyOps:()=>({}),filterExpenses:()=>[],
 computeKPIs:()=>({revenue:50000,bills:2,items:3,cogs:10000,grossProfit:40000,laborCost:5000,wasteAmount:0,remakeCups:0,opex:0,contribution:35000,ebit:34000})};
vm.createContext(c);vm.runInContext(extract('quanlygieo.html',names),c);
let n=0;function check(v,m){assert.ok(v,m);console.log('ok '+m);n++}
(async()=>{
 await c.renderTodayAll();check(calls.filter(x=>x[1]==='bills').length===2,'Hôm nay chỉ đọc bill của hai quán');
 check(!calls.some(x=>['inventory','prep','health','common','ledger'].includes(x[1])),'chưa bấm: không đọc tồn, cảnh báo, công thức hoặc sổ');
 check(!nodes.todayAll.innerHTML.includes('Mọi cửa hàng đều ổn')&&c.STORE_HEALTH_ISSUE_COUNT===8,'chưa tải không nhận là hết cảnh báo và không xoá badge cũ');
 check(nodes.todayAll.innerHTML.includes('100000'),'tổng doanh thu vẫn đúng');
 const before=calls.length;await c.renderTodayAll();check(calls.length===before,'quay lại Hôm nay trong ngày dùng kết quả đã tải');
 failStock=true;await c.loadTodayAllSection('stock');check(calls.filter(x=>x[1]==='inventory').length===2&&!calls.some(x=>x[1]==='health'),'tải tồn không gọi cảnh báo');
 check(nodes.todayAll.innerHTML.includes('GG02')&&nodes.todayAll.innerHTML.includes('Tổng chỉ gồm'),'lỗi quán không bị coi là tồn bằng không');
 failStock=false;calls=[];await c.loadTodayAllSection('stock');check(calls.length===2&&calls.every(x=>x[0]==='gg02'),'thử lại chỉ đọc danh mục quán lỗi');
 calls=[];await c.loadTodayAllSection('stock');await c.loadTodayAllSection('stock');c._todayAllChiCanXem=false;c.drawTodayAll();check(!calls.length,'thu gọn, mở lại và lọc tồn không đọc thêm');
 await c.loadTodayAllSection('health');check(calls.length===2&&calls.every(x=>x[1]==='health'),'cảnh báo chỉ đọc khi được yêu cầu');
 calls=[];await c.renderTodayAll(true);check(calls.every(x=>['stores','bills'].includes(x[1]))&&!c._todayAllData.stock,'reload doanh thu không tự tải lại phần kho đã đóng');
 let release;gate=new Promise(ok=>release=ok);calls=[];const loading=c.loadTodayAllSection('stock');await Promise.resolve();await c.loadTodayAllSection('stock');release();await loading;gate=null;check(calls.filter(x=>x[1]==='inventory').length===2,'bấm hai lần lúc đang tải chỉ có một lượt mỗi quán');
 gate=new Promise(ok=>release=ok);calls=[];const cancelled=c.renderTodayAll(true);await new Promise(ok=>setImmediate(ok));c.curScreen='report';release();await cancelled;gate=null;
 check(calls.filter(x=>x[1]==='bills').length===1&&!c._todayAllData.complete,'rời Hôm nay dừng đọc quán tiếp theo, không giữ tổng đang dở');
 c.curScreen='today';calls=[];await c.renderTodayAll();check(c._todayAllData.complete&&calls.filter(x=>x[1]==='bills').length===2,'quay lại sau huỷ tải sẽ đọc đủ quán, không dùng số thiếu');
 c.curScreen='report';calls=[];c.renderReportAll();c._rpAllKy='thang';c.renderReportAll();c.refreshReportAll();check(!calls.length&&nodes.reportBody.innerHTML.includes('Tải báo cáo'),'vào báo cáo, đổi kỳ, reload phần chưa mở không đọc dữ liệu');
 await c.loadReportAll();check(calls.some(x=>x[1]==='ledger')&&nodes.reportBody.innerHTML.includes('100000'),'bấm tải mới tính KPI, tổng đúng hai quán');
 calls=[];c.renderReportAll();await c.loadReportAll();check(!calls.length,'mở lại báo cáo có kết quả không truy vấn');
 c._rpAllKy='tuan';c.renderReportAll();check(!calls.length&&nodes.reportBody.innerHTML.includes('Chưa đọc'),'kỳ chưa xem không tự tải theo kỳ cũ');
 failReport=true;await c.loadReportAll();check(nodes.reportBody.innerHTML.includes('Tổng tạm tính')&&nodes.reportBody.innerHTML.includes('GG02'),'báo cáo thiếu quán ghi rõ tổng tạm tính');failReport=false;
 calls=[];await c.refreshReportAll(true);check(calls.filter(x=>x[1]==='ledger').length===1&&calls.find(x=>x[1]==='ledger')[0]==='gg02','thử lại báo cáo chỉ tính cửa hàng lỗi, giữ cửa hàng tốt');
 calls=[];c.curScreen='today';c._reportAllCache.clear();await c.loadReportAll();check(!calls.some(x=>x[1]==='ledger'),'rời màn không chạy tiếp nguồn báo cáo nặng');
 console.log('ALL PASS '+n);
})().catch(e=>{console.error(e);process.exitCode=1});
