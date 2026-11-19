// quanlygieo Kho ▸ Đặt hàng — widget GỢI Ý ĐẶT HÀNG ([GỢI-Ý-ĐẶT], mẫu v5 19/11). Chromium thật + Firebase giả trong bộ nhớ,
// chặn mạng ngoài. Kiểm: hai nhóm Cần mua / Đủ, nút Đơn thứ Hai / Đặt lẻ, Tạo đơn điền sẵn form cũ, chỉ đọc (không ghi gì),
// không cuộn ngang ở 1366 / 390. SCREENSHOT_DIR=… để lưu ảnh.
// UI widget toàn app — Chromium + Firebase giả, chặn mạng ngoài.
// So Menu/Khuyến mãi và popup với bản trước rollout (dd27002); cần checkout git có commit này.
// Kiểm widget lặp không lồng khung/đọc Firebase; thao tác lưu ghi chú/NL/BTP qua form thật.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');
let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
// Firestore set({merge:true}) gộp từng trường của map; giữ đúng hành vi thật của pl_book.
mock=mock.replace('Object.assign({},FS[key][id]||{},d)', '(function merge(a,b){for(const k of Object.keys(b)){const v=b[k];a[k]=v&&typeof v===\'object\'&&!Array.isArray(v)?merge(a[k]&&typeof a[k]===\'object\'?a[k]:{},v):v}return a})(FS[key][id]||{},d)');
mock+=`
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({put:()=>Promise.resolve()})});
(function(){const F=firebase.firestore;const nf=function(){const f=F();window.__FSREADS=window.__FSREADS||{};const coll=f.collection;const wrap=(q,c)=>{for(const method of ['where','orderBy','limit','doc'])if(q[method]){const fn=q[method];q[method]=(...a)=>wrap(fn.apply(q,a),c)}if(q.get){const get=q.get;q.get=(...a)=>{__FSREADS[c]=(__FSREADS[c]||0)+1;return get.apply(q,a)}}return q};f.collection=c=>wrap(coll(c),c);f.batch=()=>{const writes=[];return {set(ref,d,o){writes.push(()=>ref.set(d,o));return this},commit:()=>Promise.all(writes.map(fn=>fn()))}};f.collectionGroup=c=>f.collection(c);f.doc=p=>{const a=p.split('/');return f.collection(a[0]).doc(a[1]||'x')};f.runTransaction=()=>Promise.resolve();return f};Object.assign(nf,F);firebase.firestore=nf;
const D=firebase.database, listeners=new Map();window.__READS={};window.__emit=(p,type,key,o)=>{__RT[p]=__RT[p]||{};if(type==='child_removed')delete __RT[p][key];else __RT[p][key]=o;for(const fn of listeners.get(p+'|'+type)||[])fn({key,val:()=>o})};
firebase.database=function(){const db=D();const old=db.ref;db.ref=function(p){const r=old(p),once=r.once; r.once=function(...a){__READS[p]=(__READS[p]||0)+1;return once.apply(r,a)};const on=r.on;r.on=function(ev,fn,err){if(!ev.startsWith('child_'))return on.call(r,ev,fn,err);const k=p+'|'+ev;if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);if(ev==='child_added')Object.entries(__RT[p]||{}).forEach(([key,o])=>fn({key,val:()=>o}));return fn};r.off=function(ev,fn){if(ev)listeners.get(p+'|'+ev)?.delete(fn);else for(const [k,v] of listeners)if(k.startsWith(p+'|'))v.clear()};return r};return db};firebase.database.ServerValue={TIMESTAMP:0};
})();`;
mock+=`
if(location.pathname.includes('quanlygieo')){const t=new Date(),y=new Date(t);y.setDate(y.getDate()-1);const k=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const mk=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 __RT['orders_gieogieo/'+mk[t.getMonth()]+'/'+String(t.getDate()).padStart(2,'0')].g1.customerId='test-return';
 __RT['orders_gieogieo/'+mk[t.getMonth()]+'/'+String(t.getDate()).padStart(2,'0')].g2.customerId='test-new';
 __RT['orders_gieogieo/'+mk[y.getMonth()]+'/'+String(y.getDate()).padStart(2,'0')]={a:{total:30000,customerId:'test-return',date:String(y.getDate()).padStart(2,'0')+'/'+String(y.getMonth()+1).padStart(2,'0')+'/'+y.getFullYear(),time:'10:00'}};
 __FS.assets_gieogieo={a:{purchaseCost:10000000,purchaseDate:k(y),usefulLifeMonths:12,active:true}};
 __FS.finance_gieogieo={current:{recoveryStartDate:k(y)}};
 __FS.pl_book_gieogieo={days:{du:k(y),d:{[k(y)]:{date:k(y),doanhThu:1000000,giaVon:200000,phiKenh:0,haoHut:0,luong:200000,chiPhiCoDinh:0,bienPhiKhac:0,khauHao:30000,lai:570000,laiTruocKhauHao:600000,mucTinCay:'chot-thang',updatedAt:t.toISOString()}}}};
}`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
mock+=`
if(location.pathname.includes('quanlygieo')){const t=new Date();const k=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 __FS.inventory_items_gieogieo=Object.assign(__FS.inventory_items_gieogieo||{},{
  sua:{name:'Sữa tươi',unit:'ml',currentStock:3000,minStock:0,active:true,packagingUnits:[{name:'hộp',baseQty:1000}],countUnitName:'hộp'},
  tra:{name:'Trà ô long',unit:'g',currentStock:50000,minStock:0,active:true,packagingUnits:[{name:'gói',baseQty:500}]},
  ly:{name:'Ly nhựa',unit:'cái',currentStock:100,minStock:0,active:true,packagingUnits:[{name:'thùng',baseQty:1000}]},
  cu:{name:'Món ngừng',unit:'g',currentStock:0,minStock:0,active:false}});
 const tx={};let n=0;for(let i=1;i<=28;i++){const d=new Date(t);d.setDate(d.getDate()-i);const b=k(d);
  tx['s'+(n++)]={itemId:'sua',type:'CONSUMPTION',qty:-1000,businessDate:b,createdAt:d.toISOString()};
  tx['s'+(n++)]={itemId:'tra',type:'CONSUMPTION',qty:-100,businessDate:b,createdAt:d.toISOString()};
  tx['s'+(n++)]={itemId:'ly',type:'CONSUMPTION',qty:-60,businessDate:b,createdAt:d.toISOString()};
  tx['s'+(n++)]={itemId:'ly',type:'WASTE',qty:-2,businessDate:b,createdAt:d.toISOString()};}
 __FS.stock_transactions_gieogieo=Object.assign(__FS.stock_transactions_gieogieo||{},tx);
 __FS.purchase_orders_gieogieo=Object.assign(__FS.purchase_orders_gieogieo||{},{p1:{status:'received',createdAt:'2026-11-01T08:00:00Z',supplier:'NCC',lines:[{itemId:'sua',name:'Sữa tươi',unit:'ml',orderUnitFactor:1000,orderUnitName:'hộp',qtyExpectedBase:12000,receivedGoodBase:12000}]}});
 __FS['duty_digests_gieogieo/_engine2/models']={current:{items:{sua:{estimate:0.01,high:0.02,state:'trusted'}}}};
 window.__GHI=0;
}`;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/opt/pw-browsers/chromium'].find(x=>fs.existsSync(x))});let n=0;
const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
try{for(const width of [1366,390]){
 const p=await b.newPage({viewport:{width,height:950},timezoneId:'Asia/Ho_Chi_Minh'});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
 await p.goto(base+'/quanlygieo.html');await p.waitForFunction(()=>typeof goKho==='function'&&typeof fstore!=='undefined'&&document.querySelector('.sb-store,#sidebar'));await p.waitForTimeout(1500);
 const truoc=await p.evaluate(()=>JSON.stringify({po:__FS.purchase_orders_gieogieo,it:__FS.inventory_items_gieogieo,tx:Object.keys(__FS.stock_transactions_gieogieo).length}));
 await p.evaluate(()=>{poTab='po';goKho('po')});
 await p.waitForFunction(()=>/Cần mua/.test(document.getElementById('gydBox')?.innerText||''),null,{timeout:15000});
 const txt=await p.locator('#gydBox').innerText();
 check(/Cần mua/.test(txt)&&/Đủ, không cần mua/.test(txt),width+': widget có hai nhóm Cần mua / Đủ, không cần mua');
 check(/Sữa tươi\s*\d+ hộp/.test(txt),width+': sữa làm tròn theo đơn vị lần đặt gần nhất (hộp)');
 check(/Ly nhựa\s*\d+ thùng/.test(txt)||/Ly nhựa\s*\d+ cái/.test(txt),width+': ly nhựa cần mua');
 check(!/Món ngừng/.test(txt),width+': món ngừng sử dụng không hiện');
 const can=await p.evaluate(()=>gydCache.kq.week.can.map(x=>x.id+':'+x.packs+':'+x.factor).join(','));
 check(/sua:\d+:1000/.test(can),width+': đơn tuần — sữa '+can);
 check(await p.evaluate(()=>gydCache.kq.week.du.some(x=>x.id==='tra')),width+': trà còn 50 kg → Đủ');
 if(width===1366&&process.env.SCREENSHOT_DIR)await p.locator('#gydBox').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'gyd_tuan_'+width+'.png')});
 if(width===390&&process.env.SCREENSHOT_DIR)await p.locator('#gydBox').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'gyd_tuan_'+width+'.png')});
 const thu2=await p.evaluate(()=>gydCache.kq.toiThu2===0);
 if(!thu2){await p.click('.gyd-seg button:nth-child(2)');const t2=await p.locator('#gydBox').innerText();
  check(/Đặt lẻ hôm nay/.test(t2)&&/Cần mua/.test(t2),width+': chuyển Đặt lẻ hôm nay');
  if(process.env.SCREENSHOT_DIR)await p.locator('#gydBox').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'gyd_le_'+width+'.png')});
  await p.click('.gyd-seg button:nth-child(1)');}
 else check(await p.locator('.gyd-seg').count()===0,width+': thứ Hai — chỉ có đơn tuần');
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': không cuộn ngang');
 await p.click('.gyd-foot .btn:not(.outline)');await p.waitForTimeout(300);
 const dl=await p.evaluate(()=>poDraftLines.map(l=>l.itemId+':'+l.qty+':'+l.unitFactor).join(','));
 check(dl.includes('sua:')&&dl.includes(':1000')&&/Tạo đơn đặt hàng/.test(await p.locator('#editSheetWrap').innerText()),width+': Tạo đơn → mở form đơn đặt hàng cũ, điền sẵn '+dl);
 const sau=await p.evaluate(()=>JSON.stringify({po:__FS.purchase_orders_gieogieo,it:__FS.inventory_items_gieogieo,tx:Object.keys(__FS.stock_transactions_gieogieo).length}));
 check(truoc===sau,width+': chỉ đọc — không ghi đơn / nguyên liệu / sổ');
 check(!errs.length,width+': không lỗi JS '+errs.join(' | '));
 await p.close();}
 console.log('ALL PASS ('+n+' kiểm)');
}catch(e){console.error('FAIL',e.message);process.exitCode=1}finally{await b.close();server.close()}})();
