'use strict';
// Tab «Điểm khách hàng» của manage: sửa 1 khách (3 số + 2 mảng đi kèm của posgieo), dọn hàng loạt khách lâu không đến,
// lịch sử thay đổi. Firestore giả có transaction (ghi gom, lỗi thì bỏ hết).
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const file=path.join(__dirname,'../manage.html'),html=fs.readFileSync(file,'utf8');
const cut=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>0&&j>i,'không thấy đoạn '+a);return html.slice(i,j)};
const backendSrc=cut('// ---- ĐIỂM KHÁCH HÀNG (tab «Điểm khách hàng») ----','// ---- [GIẢM-ĐỌC] BẢN TỔNG HỢP CHI PHÍ THÁNG');
const uiSrc=cut('const CUS={q:','function cusGet(');
const rowsSrc=cut('function cusRows()','function cusRecalc()');

function fake(initial){
 const data=JSON.parse(JSON.stringify(initial));let auto=0;const writes=[];
 const mk=(coll,id)=>({coll,id,get:async()=>snapOf(coll,id)});
 const snapOf=(coll,id)=>{const d=(data[coll]||{})[id];return{exists:!!d,id,ref:mk(coll,id),data:()=>JSON.parse(JSON.stringify(d))}};
 const fstore={
  collection:coll=>({doc:id=>mk(coll,id||'auto'+(++auto)),orderBy(){return this},limit(){return this},get:async()=>({docs:Object.keys(data[coll]||{}).map(id=>snapOf(coll,id)),size:Object.keys(data[coll]||{}).length})}),
  async runTransaction(fn){
   const buf=[];const t={get:async r=>snapOf(r.coll,r.id),update:(r,p)=>buf.push(['u',r,p]),set:(r,o)=>buf.push(['s',r,o])};
   const out=await fn(t);
   for(const [k,r,p] of buf){(data[r.coll]=data[r.coll]||{});if(k==='s')data[r.coll][r.id]=JSON.parse(JSON.stringify(p));else{if(!data[r.coll][r.id])throw new Error('update doc không tồn tại');Object.assign(data[r.coll][r.id],JSON.parse(JSON.stringify(p)))}writes.push([k,r.coll,r.id])}
   return out;
  }};
 const ctx={console,Date,Intl,fstore,ensureAuth:async()=>{},vnDate:()=>new Date('2026-11-08T03:00:00Z')};
 vm.createContext(ctx);
 vm.runInContext(backendSrc+';globalThis.api={readCustomer,readAllCustomers,readCustomerLogs,writeCustomerCounts,expireCustomers};',ctx);
 return{api:ctx.api,data,writes};
}
const plain=x=>JSON.parse(JSON.stringify(x));
const old='2025-01-10T03:00:00.000Z',recent='2026-10-30T03:00:00.000Z';
const base=()=>({customers:{
 '0900000001':{nickname:'An',total_points:500,stamp_count:3,free_drink_available:0,stamp_prices:[20000,25000,30000],free_drink_caps:[],lastVisit:old,xofa_field:'giữ'},
 '0900000002':{name:'Bình',total_points:70,stamp_count:0,free_drink_available:2,free_drink_caps:[21000,22000],lastVisit:old},
 '0900000003':{nickname:'Chi',total_points:900,stamp_count:5,free_drink_available:1,lastVisit:recent},
 '0900000004':{nickname:'Dũng',total_points:0,stamp_count:0,free_drink_available:0,lastVisit:old},
 '0900000005':{nickname:'Em',total_points:40}}});

(async()=>{
 // --- sửa 1 khách ---
 let f=fake(base());
 let r=await f.api.writeCustomerCounts('0900000001',{pts:0,stamp:1,free:2});
 let c=f.data.customers['0900000001'];
 assert.equal(r.changed,true);assert.equal(c.total_points,0);assert.equal(c.stamp_count,1);assert.equal(c.free_drink_available,2);
 assert.deepEqual(plain(c.stamp_prices),[30000],'giảm tem: giữ tem mới nhất, như _stampPricesSynced của posgieo');
 assert.deepEqual(plain(c.free_drink_caps),[19000,19000],'tăng ly free không nhập trần: mặc định 19K');
 assert.equal(c.xofa_field,'giữ','không đụng trường khác của khách');assert.equal(c.lastVisit,old,'không đổi ngày ghé');
 const logs=Object.values(f.data.customer_adjust_logs_gieogieo);assert.equal(logs.length,1);
 assert.deepEqual(plain(logs[0].before),{pts:500,stamp:3,free:0});assert.deepEqual(plain(logs[0].after),{pts:0,stamp:1,free:2});assert(logs[0].at&&logs[0].kind==='edit');
 console.log('ok Sửa 1 khách: 3 số + 2 mảng đi kèm đúng, lịch sử ghi số trước / sau / giờ');
 // tăng tem
 f=fake(base());await f.api.writeCustomerCounts('0900000002',{pts:70,stamp:2,free:2});
 assert.deepEqual(plain(f.data.customers['0900000002'].stamp_prices),[16000,16000]);
 assert.deepEqual(plain(f.data.customers['0900000002'].free_drink_caps),[21000,22000],'ly free không đổi → không ghi lại mảng');
 // tăng có nhập giá: phần thêm xếp CUỐI, ly / tem thật giữ nguyên thứ tự
 f=fake(base());await f.api.writeCustomerCounts('0900000002',{pts:70,stamp:1,free:3,stampPrice:30000,freeCap:40000});
 assert.deepEqual(plain(f.data.customers['0900000002'].free_drink_caps),[21000,22000,40000],'ly cộng tay xếp CUỐI với trần đã nhập');
 assert.deepEqual(plain(f.data.customers['0900000002'].stamp_prices),[30000]);
 f=fake(base());await f.api.writeCustomerCounts('0900000001',{pts:500,stamp:5,free:0,stampPrice:18000});
 assert.deepEqual(plain(f.data.customers['0900000001'].stamp_prices),[20000,25000,30000,18000,18000],'tem thêm xếp cuối, tem thật giữ nguyên');
 // giảm ly: bỏ ly CŨ NHẤT như POS
 f=fake(base());await f.api.writeCustomerCounts('0900000002',{pts:70,stamp:0,free:1});
 assert.deepEqual(plain(f.data.customers['0900000002'].free_drink_caps),[22000]);
 for(const bad of [{stampPrice:500},{freeCap:'abc'},{freeCap:2e6}]){f=fake(base());await assert.rejects(()=>f.api.writeCustomerCounts('0900000002',{pts:70,stamp:1,free:3,...bad}),/1\.000/);assert.equal(f.writes.length,0)}
 console.log('ok Tăng tem / ly: phần thêm xếp CUỐI với giá / trần nhập tay (mặc định 16K / 19K); giảm bỏ phần cũ nhất; giá sai bị từ chối');
 // không đổi gì
 f=fake(base());r=await f.api.writeCustomerCounts('0900000001',{pts:500,stamp:3,free:0});
 assert.equal(r.changed,false);assert.equal(f.writes.length,0);assert.equal(f.data.customer_adjust_logs_gieogieo,undefined);
 // từ chối giá trị sai
 f=fake(base());
 for(const bad of [{pts:-1,stamp:0,free:0},{pts:'x',stamp:0,free:0},{pts:1,stamp:6,free:0},{pts:1,stamp:0,free:100},{pts:2e9,stamp:0,free:0}])
  await assert.rejects(()=>f.api.writeCustomerCounts('0900000001',bad));
 await assert.rejects(()=>f.api.writeCustomerCounts('0999999999',{pts:1,stamp:0,free:0}),/không còn/);
 assert.equal(f.writes.length,0);
 console.log('ok Không đổi → không ghi; số âm / chữ / tem > 5 / khách không còn → từ chối, không ghi gì');

 // --- đọc ---
 f=fake(base());
 assert.equal((await f.api.readCustomer('090 000 0001')).pts,500);assert.equal(await f.api.readCustomer('123'),null);assert.equal(await f.api.readCustomer('0911111111'),null);
 const all=await f.api.readAllCustomers();assert.equal(all.length,5);assert.equal(all.find(x=>x.id==='0900000002').name,'Bình');assert.equal(all.find(x=>x.id==='0900000005').last,'');
 console.log('ok Đọc khách theo SĐT (bỏ ký tự thừa) và cả bảng');

 // --- dọn hàng loạt ---
 f=fake(base());
 let items=[{id:'0900000001',last:old},{id:'0900000002',last:old},{id:'0900000003',last:old},{id:'0900000004',last:old},{id:'0900000005',last:''}];
 r=await f.api.expireCustomers(items,['pts']);
 assert.deepEqual(plain(r.done).sort(),['0900000001','0900000002','0900000005']);
 assert.deepEqual(plain(r.skipped).sort(),['0900000003','0900000004'],'khách đã ghé lại bị bỏ qua; khách không còn Point thì không có gì để dọn');
 assert.equal(f.data.customers['0900000001'].total_points,0);assert.equal(f.data.customers['0900000001'].stamp_count,3,'chỉ dọn loại đã chọn');
 assert.equal(f.data.customers['0900000003'].total_points,900,'khách vừa ghé lại giữ nguyên');
 let l=Object.values(f.data.customer_adjust_logs_gieogieo);assert.equal(l.length,1);assert.equal(l[0].kind,'expire');assert.equal(l[0].n,3);
 assert.deepEqual(plain(l[0].items).find(x=>x.p==='0900000001'),{p:'0900000001',pts:500,st:3,fr:0});
 console.log('ok Dọn Point: chỉ khách còn điểm + đúng ngày ghé cuối; khách ghé lại bị bỏ qua; lịch sử giữ số trước');
 f=fake(base());r=await f.api.expireCustomers(items.slice(0,2),['pts','stamp','free']);
 for(const id of ['0900000001','0900000002']){const x=f.data.customers[id];assert.equal(x.total_points,0);assert.equal(x.stamp_count,0);assert.equal(x.free_drink_available,0);assert.deepEqual(plain(x.stamp_prices||[]),[]);assert.deepEqual(plain(x.free_drink_caps||[]),[]);}
 await assert.rejects(()=>f.api.expireCustomers(items,[]),/ít nhất/);
 console.log('ok Dọn cả 3 loại: về 0 cùng mảng giá đi kèm; không chọn loại nào → từ chối');
 // nhiều hơn 200 khách → nhiều nhóm
 const big=base();const bigItems=[];for(let i=0;i<450;i++){const id='09'+String(10000000+i);big.customers[id]={nickname:'k'+i,total_points:10,lastVisit:old};bigItems.push({id,last:old})}
 f=fake(big);r=await f.api.expireCustomers(bigItems,['pts']);
 assert.equal(r.done.length,450);assert.equal(Object.keys(f.data.customer_adjust_logs_gieogieo).length,3,'450 khách → 3 nhóm ≤ 200');
 assert((await f.api.readCustomerLogs()).length===3);
 console.log('ok 450 khách chia 3 nhóm, mỗi nhóm 1 dòng lịch sử');

 // --- lọc xem trước ---
 const ctx={Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-11-08T03:00:00Z']))}},Intl,vnDate:x=>new Date(x),dkey:()=>'',dateVN:x=>x,clockVN:()=>''};
 vm.createContext(ctx);vm.runInContext(uiSrc+rowsSrc+';globalThis.CUS=CUS;globalThis.cusRows=cusRows;',ctx);
 ctx.CUS.list=Object.entries(base().customers).map(([id,d])=>({id,name:d.nickname||d.name||'',pts:d.total_points||0,stamp:d.stamp_count||0,free:d.free_drink_available||0,last:d.lastVisit||''}));
 ctx.CUS.months=12;let ids=ctx.cusRows().map(x=>x.id);
 assert.deepEqual(plain(ids),['0900000001','0900000002','0900000005']);
 assert.equal(ids.includes('0900000003'),false,'ghé tháng trước → không dọn');assert.equal(ids.includes('0900000004'),false,'Point = 0 → không có gì dọn');
 assert.equal(ids[ids.length-1],'0900000005','khách chưa rõ ngày ghé xếp cuối');
 ctx.CUS.kinds={pts:false,stamp:false,free:true};ids=ctx.cusRows().map(x=>x.id);assert.deepEqual(plain(ids),['0900000002']);
 ctx.CUS.kinds={pts:true,stamp:true,free:true};ctx.CUS.months=1;ids=ctx.cusRows().map(x=>x.id);assert.equal(ids.includes('0900000003'),false);
 console.log('ok Lọc xem trước theo số tháng và loại: đúng khách, chưa rõ ngày ghé xếp cuối');

 // --- gắn vào menu ---
 assert(/id="cuCapBox"/.test(html)&&/\['diemkh','users','Điểm khách hàng'\]/.test(html)&&/diemkh:cusView/.test(html)&&/view==='diemkh'/.test(html));
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
