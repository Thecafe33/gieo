// manage.html — tab Tiền mặt: popup nhập thực nhận NHIỀU NGÀY của một quán. Mỗi ngày 1 dòng (phải nộp, ô nhập, nút xác nhận RIÊNG),
// gõ nhiều ngày cùng lúc, không có nút lưu chung, không chi tiết; hiện lệch + «ck thêm … là đủ»; tự mở khi quán có ≥ 2 ngày chờ.
// Chromium thật + Firebase trong bộ nhớ; backend.readCash / writeCashReceipt được thay bằng bản giả (không chạm dữ liệu thật).
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..');let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
mock=mock.replace('Object.assign({},FS[key][id]||{},d)', '(function merge(a,b){for(const k of Object.keys(b)){const v=b[k];a[k]=v&&typeof v===\'object\'&&!Array.isArray(v)?merge(a[k]&&typeof a[k]===\'object\'?a[k]:{},v):v}return a})(FS[key][id]||{},d)');
// Truy vấn khoảng mã tài liệu (FieldPath.documentId) cho «ngày chưa đóng sổ».
mock=mock.replace('const x = d[f] === undefined ? undefined : d[f];',"const x = f==='__name__' ? id : (d[f] === undefined ? undefined : d[f]);");
mock+=`
firebase.firestore.FieldPath={documentId(){return '__name__'}};
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({put:()=>Promise.resolve()})});
(function(){const F=firebase.firestore;const nf=function(){const f=F();f.batch=()=>{const w=[];return {set(r,d,o){w.push(()=>r.set(d,o));return this},update(r,d){w.push(()=>r.update(d));return this},commit:()=>Promise.all(w.map(fn=>fn()))}};
 f.runTransaction=async fn=>{const w=[];const r=await fn({get:ref=>ref.get(),update:(ref,d)=>{w.push(()=>ref.update(d))},set:(ref,d,o)=>{w.push(()=>ref.set(d,o))}});for(const x of w)await x();return r};
 f.collectionGroup=c=>f.collection(c);return f};Object.assign(nf,F);firebase.firestore=nf})();
(function(){window.__FS=window.__FS||{}})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:['/usr/bin/chromium','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p)),args:['--no-sandbox']});
 let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
 try{for(const width of [1366,390]){
  const p=await b.newPage({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});if(u.startsWith(base+'/'))return r.continue();return r.abort()});
  await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);
  // Dữ liệu giả: tc33 có 3 ngày chờ (phải nộp 500K / 300K / 120K), xofa chỉ 1 ngày. writeCashReceipt giả: ghi lại lời gọi, ngày 'FAIL' ném lỗi.
  await p.evaluate(()=>{
   const k=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
   window.__days=[k(4),k(3),k(2)];window.__calls=[];window.__fail=null;window.__started=0;
   const mk=()=>({cfg:{startDate:k(4)},start:k(4),today:k(0),date:k(0),records:[],gg:{},daySummary:{tc33:null,xofa:null},gieoDayPending:false,
    tcx:{tc33:{[k(4)]:{expected:500000,sales:600000,spent:100000},[k(3)]:{expected:300000,sales:300000,spent:0},[k(2)]:{expected:120000,sales:120000,spent:0},[k(1)]:{expected:0,sales:0,spent:0}},xofa:{[k(3)]:{expected:80000,sales:80000,spent:0}}}});
   window.__rows=mk();
   backend.readCash=async()=>{const c=mk();for(const st of ['tc33','xofa'])for(const [d,r] of Object.entries(c.tcx[st]))if(__calls.some(x=>x.store===st&&x.date===d&&!x.failed))r.received=__calls.find(x=>x.store===st&&x.date===d).n;return c};
   backend.writeCashReceipt=async(store,date,n,info)=>{__started++;await new Promise(r=>setTimeout(r,250));if(__fail===date){__calls.push({store,date,n,failed:true});throw new Error('Mất mạng giả lập')}__calls.push({store,date,n,info})};
   navigate('tienmat');
  });
  await p.waitForSelector('#dialog[open] .cashm-row',{timeout:8000});
  check(true,width+': popup tự mở khi quán có ≥ 2 ngày chờ');
  check(await p.locator('#dialog .cashm-row').count()===3,width+': tc33 có đúng 3 dòng (xofa chỉ 1 ngày thì không vào)');
  check(await p.locator('#dialog details,#dialog .cashm-detail').count()===0,width+': không hiện chi tiết');
  check(await p.locator('#dialog .cashm-row .apb').count()===3&&await p.locator('#dialog button',{hasText:/Lưu \d* ?ngày|Lưu$/}).count()===0,width+': mỗi ngày 1 nút xác nhận riêng, không có nút lưu chung');
  const exp=await p.locator('#dialog .cashm-exp').allInnerTexts();
  check(/500\.000/.test(exp[0])&&/300\.000/.test(exp[1])&&/120\.000/.test(exp[2]),width+': hiện số phải nộp từng ngày');
  check(await p.locator('#dialog .cashm-row .apb[disabled]').count()===3,width+': chưa nhập thì nút xác nhận khoá');
  // Gõ cùng lúc nhiều ngày
  const D=await p.evaluate(()=>__days);
  await p.fill('#cashm-in-'+D[0],'450000');await p.fill('#cashm-in-'+D[1],'300000');await p.fill('#cashm-in-'+D[2],'200000');
  const v0=await p.locator('#cashmv-'+D[0]).innerText(),v1=await p.locator('#cashmv-'+D[1]).innerText(),v2=await p.locator('#cashmv-'+D[2]).innerText();
  check(/50\.000/.test(v0)&&/ck thêm 50\.000/.test(v0)&&/là đủ/.test(v0),width+': thiếu 50K → «ck thêm 50.000 ₫ là đủ» ('+v0+')');
  check(/Khớp/.test(v1),width+': khớp ('+v1+')');
  check(/thừa 80\.000/.test(v2)&&!/ck thêm/.test(v2),width+': thừa 80K ('+v2+')');
  check(await p.locator('#dialog .cashm-row .apb:not([disabled])').count()===3,width+': 3 ngày nhập xong, 3 nút sáng');
  if(process.env.SHOT)await p.locator('#dialog').screenshot({path:process.env.SHOT+'/cash_'+width+'_nhap.png'});
  // Xác nhận NGÀY 1 → chỉ ghi ngày 1, ngày khác không bị khoá, vẫn gõ được
  await p.locator('#cashm-'+D[0]+' .apb').click();
  await p.waitForTimeout(60);
  check(await p.locator('#cashm-'+D[0]+' .apb').getAttribute('data-st')==='busy','D0 đang xác nhận (spinner)');
  check(await p.evaluate(d=>!document.getElementById('cashm-in-'+d).readOnly&&!document.querySelector('#cashm-'+d+' .apb').disabled,D[1]),width+': ngày khác không bị khoá trong lúc ghi ngày 1');
  await p.fill('#cashm-in-'+D[1],'310000');
  check(/Lệch \+10\.000/.test(await p.locator('#cashmv-'+D[1]).innerText()),width+': ngày khác vẫn sửa được trong lúc ngày 1 đang ghi');
  await p.waitForFunction(()=>__calls.length===1);
  check(await p.evaluate(d=>__calls.length===1&&__calls[0].date===d&&__calls[0].n===450000&&__calls[0].info.expected===500000,D[0]),width+': chỉ ghi đúng ngày 1 (450.000, phải nộp 500.000)');
  check(await p.locator('#cashm-'+D[0]+' .apb').getAttribute('data-st')==='done'&&await p.locator('#cashm-'+D[0]).evaluate(e=>e.classList.contains('is-done')),width+': ngày 1 hiện «Đã xác nhận»');
  if(process.env.SHOT)await p.locator('#dialog').screenshot({path:process.env.SHOT+'/cash_'+width+'_xong1.png'});
  // Xác nhận ngày 2 và 3 gần như cùng lúc (ghi song song), ngày 3 lỗi → ở lại, sửa được, xác nhận lại
  await p.evaluate(d=>{__fail=d},D[2]);
  await p.locator('#cashm-'+D[1]+' .apb').click();await p.locator('#cashm-'+D[2]+' .apb').click();
  await p.waitForFunction(()=>__calls.length===3);
  await p.waitForTimeout(300);
  check(await p.evaluate(d=>__calls.find(x=>x.date===d&&!x.failed).n===310000,D[1]),width+': ngày 2 ghi đúng số vừa sửa (310.000)');
  check(await p.locator('#cashm-'+D[2]+' .apb').getAttribute('data-st')==='idle'&&await p.evaluate(d=>!document.getElementById('cashm-in-'+d).readOnly,D[2]),width+': ngày 3 lỗi → về lại nút xác nhận, ô nhập mở lại');
  check(await p.evaluate(()=>document.querySelector('#dialog').open),width+': popup chưa đóng khi còn ngày chưa xong');
  await p.evaluate(()=>{__fail=null});
  await p.locator('#cashm-'+D[2]+' .apb').click();
  await p.waitForFunction(()=>__calls.filter(x=>!x.failed).length===3);
  await p.waitForFunction(()=>!document.querySelector('#dialog').open,{timeout:4000});
  check(true,width+': xác nhận xong ngày cuối → popup tự đóng');
  check(await p.evaluate(()=>__calls.filter(x=>!x.failed).map(x=>x.date).sort().join()===__days.slice().sort().join()),width+': mỗi ngày đúng 1 lần ghi thành công');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': không cuộn ngang');
  check(errors.length===0,width+': không lỗi JS '+errors.join(' | '));
  await p.close();
 }}finally{await b.close();server.close()}
 console.log('ALL PASS ('+n+' kiểm)');
})().catch(e=>{console.error(e);process.exit(1)});
