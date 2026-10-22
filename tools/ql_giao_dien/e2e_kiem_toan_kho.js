// E2E «Bản kiểm toán kho» (Engine 2 · B2) trên quanlygieo.html thật — cần Playwright + Chromium; không thuộc tests/run_all.sh
//   node tools/ql_giao_dien/e2e_kiem_toan_kho.js
// Nạp dữ liệu sạch (tests/lib/engine2_fixture.js: báo hết + hai lượt cân qua kho v21) vào Firebase giả của trình duyệt,
// mở Trích xuất dữ liệu → bấm «Trích xuất bản kiểm toán kho» → tải file → đưa file vào bộ kiểm toán độc lập: phải ĐẠT 0/0.
// Kiểm thêm: không ghi Firebase, không lỗi JS, điện thoại không tràn ngang, Xem tất cả bị chặn.
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const ROOT=path.resolve(__dirname,'../..'), E2E=ROOT+'/tools/tet/e2e';
const {cleanState}=require(ROOT+'/tests/lib/engine2_fixture');
const {makeFake}=require(ROOT+'/tests/lib/fakefb');
const A=require(ROOT+'/unit_engine2_audit_v1');
let mock=fs.readFileSync(E2E+'/mockfb.js','utf8');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {put(){return Promise.resolve()}}}}};\n(function(){const F=firebase.firestore;const nf=function(){const f=F();const nb=()=>{const b={set(){return b},update(){return b},delete(){return b},commit(){return Promise.resolve()}};return b};f.batch=nb;f.collectionGroup=c=>f.collection(c);f.doc=pth=>{const a=pth.split('/');return f.collection(a[0]).doc(a[1]||'x')};f.runTransaction=fn=>Promise.resolve();return f};Object.assign(nf,F);firebase.firestore=nf})();";
const server=require('http').createServer((req,res)=>{
  const file=path.resolve(ROOT, '.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
  const clean=await cleanState();
  // fakefb {đường/dẫn/doc: dữ liệu} → mockfb {đường/dẫn/bảng: {id: dữ liệu}}
  const seedFs={};for(const [p,d] of Object.entries(clean.FS)){const i=p.lastIndexOf('/');(seedFs[p.slice(0,i)]=seedFs[p.slice(0,i)]||{})[p.slice(i+1)]=d;}
  const seedRt={active_units_gieogieo:clean.rtGet('active_units_gieogieo')};
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '/usr/bin/chromium')});
  const R=[]; const chk=(c,m)=>R.push((c?'ok   ':'FAIL ')+m);
  async function open(w,h,view){
    const ctx=await b.newContext({viewport:{width:w,height:h},acceptDownloads:true});const p=await ctx.newPage();p.on('dialog',d=>d.dismiss());
    if(view)await p.addInitScript(v=>{try{localStorage.setItem('ql_view_v1',v)}catch(e){}},view);
    await p.route('**/*',r=>{const u=r.request().url();
      if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});
      if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});
      if(u.startsWith(base+'/'))return r.continue(); return r.abort();});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));p.errs=errs;
    await p.goto(base+'/quanlygieo.html');await p.waitForTimeout(2500);
    await p.evaluate(([f,rt])=>{Object.assign(window.__FS,f);Object.assign(window.__RT,rt);window.__WRITES.length=0;},[seedFs,seedRt]);
    await p.evaluate(()=>goEntry('export'));await p.waitForTimeout(600);
    await p.fill('#exportFrom','2026-10-14');await p.fill('#exportTo','2026-10-22');
    return p;
  }
  for(const [w,h,label] of [[1366,900,'PC'],[390,844,'điện thoại']]){
    const p=await open(w,h);
    chk(await p.evaluate(()=>!!window.UnitEngine2Export),label+': đã nạp unit_engine2_export_v1.js');
    const btn=p.locator('button:has-text("Trích xuất bản kiểm toán kho")');chk(await btn.count()===1,label+': có nút trích xuất bản kiểm toán kho');
    await btn.click();await p.waitForSelector('#exportResult .card-h:has-text("Đã dựng bản kiểm toán kho")',{timeout:15000});
    const tier=await p.textContent('#exportResult .tier');chk(/Đủ/.test(tier)&&!/Chưa/.test(tier),label+': báo Đủ ('+tier.trim()+')');
    const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#exportResult button:has-text("Tải file")')]);
    chk(/^gieo-gg01-kiemtoankho-2026-10-14_den_2026-10-22\.json$/.test(dl.suggestedFilename()),label+': tên file '+dl.suggestedFilename());
    const out=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    chk(out.manifest.complete===true&&out.manifest.store==='gg01',label+': manifest đủ, đúng quán');
    chk(!!out.docs['stock_containers_gieogieo/u']&&!!out.rt.active_units_gieogieo?.j?.n,label+': có tem nhận trước kỳ + RT tem đang mở');
    const r=await A.run({storeId:'gg01',from:'2026-10-14',to:'2026-10-22',fstore:makeFake({fs:out.docs}).fstore});
    chk(r.ok&&r.violations===0&&r.warnings===0,label+': file tải về → bộ kiểm toán ĐẠT 0/0 '+(r.ok?'':A.summary(r).slice(0,300)));
    chk(await p.evaluate(()=>window.__WRITES.length)===0,label+': không ghi Firebase');
    chk(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),label+': không cuộn ngang');
    chk(p.errs.length===0,label+': không lỗi JS '+p.errs.slice(0,2).join('|'));
    await p.context().close();
  }
  {
    const key=fs.readFileSync(ROOT+'/quanlygieo.html','utf8').match(/const QL_VIEW_KEY\s*=\s*'([^']+)'/);
    const p=await open(1366,900);
    // Xem tất cả không mở được màn nhập liệu; chốt chặn trong runExportKho vẫn phải dừng trước mọi lượt đọc.
    if(key){await p.evaluate(k=>{localStorage.setItem(k,'all')},key[1]);await p.reload();await p.waitForTimeout(2500);
      const res=await p.evaluate(async()=>{let err=null;try{await runExportKho();}catch(e){err=e.message;}return {all:QL_ALL,err,busy:_exportBusy,result:_exportResult&&_exportResult.filename||null};});
      chk(res.all===true&&res.err===null&&res.busy===false&&!/kiemtoankho/.test(res.result||''),'Xem tất cả: runExportKho dừng ngay, không xuất '+JSON.stringify(res));}
    else chk(false,'không tìm thấy QL_VIEW_KEY');
    await p.context().close();
  }
  await b.close();server.close();
  console.log(R.join('\n'));const bad=R.filter(x=>x.startsWith('FAIL'));console.log(bad.length?'SOME FAIL':'ALL PASS');process.exit(bad.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
