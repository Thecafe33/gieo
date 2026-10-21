const assert=require('assert/strict'),{extract}=require('./lib/extract');
const names=['mcName','mcKey','mcExcluded','mcCatalog','mcUsage','mcAttach','mcVersion','mcDay','mcRange','mcBreakEven','tcIsKhacLine','tcIsTransfer','tcEmptySum','xoEmptySum','tcAddOrder','xoAddOrder','tcSummarize','xoSummarize','sumMerge'];
const M=new Function('vnDate','vnHour',extract('manage.html',names)+';return {'+names.join(',')+'}')(d=>new Date(d),d=>d.getHours());
const menu=[{name:'Trà',type:'Trà',priceM:30000,priceL:35000},{name:'1h bed',type:'Khác',priceM:20000},{name:'Bánh',type:'Ăn vặt',priceM:10000}];
const rows=M.mcCatalog('tc33',{main:menu});assert.equal(rows.length,2);
const cat=M.mcCatalog('xofa',{instore:menu,togo:menu},{a:{name:'Trân châu',price:5000,priceTogo:3000}});assert.equal(cat.length,6,'2 size x 2 menu + 2 topping');
const key=(channel,name,size,kind='drink')=>M.mcKey(channel,kind,name,size);
const costs={[key('main','Trà','M')]:8000,[key('main','Trà','L')]:9000};
const cfg={enabled:true,versions:[{from:'2026-10-01',costs},{from:'2026-10-15',costs:{...costs,[key('main','Trà','M')]:10000}}]};
let s=M.mcAttach('tc33',[{total:30000,itemsArray:[{name:'Trà',size:'M',qty:1,price:30000},{name:'Trà',size:'M',qty:1,price:0},{name:'1h bed',size:'M',qty:2,price:20000},{name:'Bánh',size:'M',qty:1,price:10000}]},{total:0,itemsArray:[{name:'Trà',size:'L',qty:2,price:0}]}],menu);
assert.equal(M.mcDay(cfg,'2026-10-10',s).total,34000,'16k size M + 18k hai ly L trên bill 0đ');
assert.equal(M.mcDay(cfg,'2026-10-15',s).total,38000,'mốc mới giữ riêng giá ngày cũ');
assert.equal(M.mcDay(cfg,'2026-09-30',s).active,false);assert.equal(M.mcDay({...cfg,enabled:false},'2026-10-10',s).active,false);
let d=M.mcDay(cfg,'2026-10-10',s);assert.equal(d.lines.reduce((n,l)=>n+l.free,0),3,'3 ly tặng vẫn có giá vốn');
s=M.mcAttach('xofa',[{total:0,isToGo:true,itemsArray:[{name:'Trà (Tặng)',size:'M',qty:2,price:0,isFree:true,toppings:[{name:'Trân châu',price:0,qty:2}]}]}]);
const xc={enabled:true,versions:[{from:'2026-10-01',costs:{[key('togo','Trà','M')]:11000,[key('togo','Trân châu','','topping')]:2000}}]};
d=M.mcDay(xc,'2026-10-20',s);assert.equal(d.total,30000,'2 ly To Go + 4 phần topping miễn phí');assert.equal(d.missing.length,0);
assert.equal(M.mcDay({...xc,versions:[{from:'2026-10-01',costs:{[key('togo','Trà','M')]:0}}]},'2026-10-20',s).missing.length,1,'0đ rõ ràng hợp lệ; topping chưa nhập phải báo thiếu');
assert.equal(M.mcDay(xc,'2026-10-20',{}).missing.length,1,'đệm cũ không có số lượng không được coi là zero');
assert.equal(M.mcDay(xc,'2026-10-20',M.mcAttach('xofa',[{total:10000,isToGo:false,itemsArray:[{name:'Trà',size:'M',qty:1,price:10000}]}])).missing.length,1,'không lấy giá vốn To Go cho tại quán');
s=M.mcAttach('tc33',[{total:1,items:'Trà(M)x2, 1h bed(M)x1, Bánh(M)x3'}],menu);assert.equal(M.mcDay(cfg,'2026-10-10',s).total,16000);
assert.equal(M.mcUsage('tc33',[{total:1,items:'dòng thiếu dữ liệu'}],menu).unknown,1);
assert.equal(M.mcUsage('tc33',[{status:'cancelled',itemsArray:[{name:'Trà',qty:1}]}],menu).rows.length,0);
const r=M.mcRange(cfg,{'2026-10-10':s},['2026-09-30','2026-10-10'],()=>100000);assert.equal(r.total,16000);assert.equal(r.pct,.16);assert.equal(r.activeDays,1);
const two=M.mcRange(cfg,{'2026-10-10':M.mcAttach('tc33',[{total:30000,itemsArray:[{name:'Trà',size:'M',price:30000,qty:1}]}],menu),'2026-10-11':M.mcAttach('tc33',[{total:60000,itemsArray:[{name:'Trà',size:'M',price:20000,qty:3}]}],menu)},['2026-10-10','2026-10-11'],d=>d.endsWith('10')?30000:60000);
assert.equal(two.total,32000);assert.equal(two.pct,32000/90000,'kỳ tuần/tháng lấy tổng COGS/tổng doanh thu, không bình quân % từng ngày');
const base={hoaVon:1000000,doanhThu:2000000};let b=M.mcBreakEven(base,{activeDays:1,activeRevenue:2000000,total:600000,missing:[],pct:.3});assert(Math.abs(b.hoaVon-1000000/.7)<.001);assert(b.dat);
assert.equal(M.mcBreakEven(base,{activeDays:1,activeRevenue:1,total:2,missing:[]}).hoaVon,null,'COGS quá doanh thu không có hoà vốn');
assert.equal(M.mcBreakEven(base,{activeDays:1,activeRevenue:0,total:6000,missing:[]}).cogsNoRevenue,true);
assert.equal(M.mcBreakEven(base,{activeDays:1,activeRevenue:2,total:0,missing:['x']}).cogsMissing,true);
b=M.mcBreakEven({hoaVon:200,doanhThu:300},{activeDays:1,activeRevenue:200,total:50,missing:[]},100);assert(Math.abs(b.hoaVon-(100+100/.75))<.001,'kỳ có ngày trước hiệu lực');
const merged=M.sumMerge(M.mcAttach('tc33',[],menu),s);M.sumMerge(merged,s);assert.equal(merged.cogsUsage.rows[0].qty,4,'cộng các ngày không làm mất số lượng');
console.log('ok COGS: size/menu, ly tặng/bill 0đ, topping, lịch sử, thiếu số, đệm và hoà vốn');
// Các bước lưu không đụng Firebase thật.
(async()=>{
 let writes=0,updated='rev1';
 const save=new Function('ensureAuth','validStore','validDate','dkey','vnDate','mcReadEditor','BE_DOC','fstore','BE_CFG',extract('manage.html',['mcSave'])+';return mcSave')(
 async()=>{},()=>{},()=>{},()=> '2026-10-20',()=>new Date(),async()=>({rows}),()=>({}),{runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>({cogs:{tc33:{updatedAt:updated,versions:[]}}})}),set:()=>writes++})},null);
 await assert.rejects(()=>save('tc33','2026-10-01',{[rows[0].key]:0},true,'rev1'),/nhập đủ/);assert.equal(writes,0);
 await save('tc33','2026-10-01',costs,true,'rev1');assert.equal(writes,1);
 await assert.rejects(()=>save('tc33','2026-10-01',costs,true,'old'),/máy khác/);
 await save('tc33','2026-10-01',{},false,'rev1');assert.equal(writes,2,'tắt và lưu bản nháp được phép');
 console.log('ok bật cần đủ menu, giá 0 hợp lệ, bản nháp tắt và chống ghi đè cấu hình máy khác');
 // Đệm cũ chỉ nạp bù khi bật COGS, sửa đơn giá không đọc lại bill.
 let reads=0;const day='2026-10-01',stored={tc33:{[day]:{drink:100000,h24:[]}}};
 const load=new Function('mcVersion','revSources','revCacheLoad','revCacheSave','pool','REV_MEM','REV_STABLE_AFTER',extract('manage.html',['dkey','parseDkey','addDays','daysBetween','revLoadRange'])+';return revLoadRange')(
 M.mcVersion,async()=>[{key:'tc33',run:async()=>{reads++;return {drink:100000,cogsUsage:{v:1,rows:[],unknown:0}}}}],()=>stored,()=>{},async(items,n,fn)=>Promise.all(items.map(fn)),{},8);
 await load(day,day,null,['tc33'],null,{});assert.equal(reads,0);
 await load(day,day,null,['tc33'],null,{tc33:cfg});assert.equal(reads,1);
 await load(day,day,null,['tc33'],null,{tc33:{...cfg,versions:[{from:day,costs:{}}]}});assert.equal(reads,1);
 console.log('ok đệm cũ khi tắt không đọc bù; bật nạp đúng ngày một lần; sửa giá vốn tính từ số lượng đệm');

})().catch(e=>{console.error(e);process.exitCode=1});
