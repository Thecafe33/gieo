// E2E mục «Gấu Noel» trong manage.html (bản Giáng sinh): menu có mục, vẽ đúng tab Gấu của pos (công tắc, dashboard, phát theo doanh thu,
// khách có tên, kho + nạp thêm), ẩn bộ chọn quán. Firebase giả (tools/tet/e2e/mockfb.js), chặn mạng ngoài.
//   node tools/gau_noel/e2e_manage_gau.js [thư mục lưu ảnh]
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..'),OUT=process.argv[2];let fail=0;const chk=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)fail++};let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
mock+=`
firebase.firestore.FieldPath={documentId(){return '__name__'}};
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};
(function(){const A=firebase.auth;firebase.auth=function(){const a=A();if(a.currentUser&&!a.currentUser.getIdToken){a.currentUser.getIdToken=async()=>'T';}return a};Object.assign(firebase.auth,A)})();
(function(){const now=Date.now();
 __FS.gau_noel_2026_kho={_cfg:{bat:true},tc33:{tong:83,phat:14,doi:12,v4:{thuong:55,noel:14,quy2:0,rho:0.05,laiTB:400000,gEst:0.4,demBig:0,boost:{},tuan:{wk:'2026-11-16',du:6.2,phat:5},hom:{key:'2026-11-16',lai:412000,du:2.1,phat:2,chac:0,rho:0.05,x2:false},nhip:[],nhanTu:{phat:2,tong:83,at:'2026-11-16'}}},
   xofa:{tong:206,phat:31,doi:26,v4:{thuong:140,noel:35,quy2:0,rho:0.046,laiTB:1900000,gEst:0.4,boost:{'2026-11-16':true},tuan:{wk:'2026-11-16',du:5.2,phat:4},tuanTruoc:{wk:'2026-11-09',du:30,phat:24,x2:true},hom:{key:'2026-11-16',lai:1940000,du:5.2,phat:4,chac:1,rho:0.046,x2:true},nhip:[]}}};
 __FS.gau_noel_2026={'0933123456':{sdt:'0933123456',ong:9000,lastAt:new Date(now-3600e3).toISOString(),luot:{xofa_b1_0:{store:'xofa',bill:'b1',at:new Date(now-3600e3).toISOString(),win:true,code:'GAUK7M2P',opened:true,openedAt:new Date(now-3500e3).toISOString(),v:4}},qua:{GAUK7M2P:{store:'xofa',bill:'b1',luot:'xofa_b1_0',at:new Date(now-3600e3).toISOString(),used:false}}},
   '0944123456':{sdt:'0944123456',ong:3000,lastAt:new Date(now-600e3).toISOString(),luot:{tc33_b2_0:{store:'tc33',bill:'b2',at:new Date(now-600e3).toISOString(),win:false,code:'',opened:false,v:4}},qua:{}}};
 __FS.customers=Object.assign(__FS.customers||{},{'0933123456':{nickname:'Chị Ngọc'}});})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});fs.createReadStream(f).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch();
 for (const [w,h,ten] of [[1366,900,'pc'],[390,844,'dt']]) {
 const p=await b.newPage({viewport:{width:w,height:h},timezoneId:'Asia/Ho_Chi_Minh',deviceScaleFactor:1}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',async r=>{const u=r.request().url();
   if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});
   if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});
   if(u.startsWith(base))return r.continue();return r.abort()});
 await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey,{timeout:20000}).catch(()=>{});
 await p.evaluate(()=>GauNoel._setOffset(Date.parse('2026-11-16T15:00:00+07:00')-Date.now()));
 const nav=await p.evaluate(()=>[...document.querySelectorAll('#nav .nav-item')].map(x=>x.textContent.trim()));
 chk(nav.includes('Gấu Noel'),ten+': menu có mục «Gấu Noel»');
 await p.evaluate(()=>navigate('gaunoel'));await p.waitForTimeout(2500);
  const v=await p.evaluate(()=>document.getElementById('view').innerText);
 chk(/Chương trình đang BẬT/.test(v)&&/Phát theo doanh thu/.test(v)&&/Khách tham gia/.test(v)&&/Kho gấu từng quán/.test(v)&&!/Lỗi/.test(v),ten+': vẽ đủ công tắc, phát theo doanh thu, khách, kho (không lỗi)');
 chk(/Chị Ngọc/.test(v)&&/×2/.test(v),ten+': tên khách từ hồ sơ tích điểm + thông báo ×2 tuần này');
 chk(await p.evaluate(()=>document.getElementById('storeSwitcher').hidden),ten+': ẩn bộ chọn quán');
 if(OUT)await p.screenshot({path:OUT+'/manage_gau_'+ten+'.png',fullPage:true});
 chk(!errors.length,ten+': không lỗi trang '+errors.join(' | '));await p.close();}
 await b.close();server.close();console.log('FAIL: '+fail);process.exit(fail?1:0);
})();
