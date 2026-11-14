// manage.html — mục «Bảo mật» (docs/KE_HOACH_BAO_MAT_BACKEND_14-11.md): thẻ màu từng quán chứa máy chờ duyệt / đang dùng +
// mã quản lý hiện sẵn; duyệt / từ chối / thu hồi / đổi tên gọi hàm gieoBaoMat; đặt mã ghi cau_hinh_bao_mat/ma_quan_ly.
// Chromium thật + Firebase trong bộ nhớ, hàm máy chủ giả, chặn mạng ngoài. Không chạm dữ liệu thật.
//   node tools/ql_giao_dien/e2e_manage_bao_mat.js [thư mục lưu ảnh]
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..'),ANH=process.argv[2];let mock=fs.readFileSync(ROOT+'/tools/tet/e2e/mockfb.js','utf8');
mock+=`
firebase.firestore.FieldPath={documentId(){return '__name__'}};
firebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};
(function(){const A=firebase.auth;firebase.auth=function(){const a=A();if(a.currentUser&&!a.currentUser.getIdToken){a.currentUser.getIdToken=async()=>'TOKEN-GIA';a.currentUser.email=a.currentUser.email||'cafe33@xolifa.com'}return a};Object.assign(firebase.auth,A)})();
(function(){const now=Date.now(),ph=60000,ng=86400000;
 __FS.may_duoc_duyet={
  c1:{trangThai:'cho',ma:'K7QM',ten:'Máy quầy 2',app:'posgieo',taoLuc:now-3*ph,hetHan:now+12*ph},
  c2:{trangThai:'cho',ma:'3HXD',ten:'<img src=x onerror=window.__XSS=1>',app:'pos',taoLuc:now-ph,hetHan:now+14*ph},
  c3:{trangThai:'cho',ma:'ZZZZ',ten:'Yêu cầu quá hạn',app:'pos',taoLuc:now-40*ph,hetHan:now-25*ph},
  m1:{trangThai:'hoat_dong',ten:'Quầy chính',app:'posgieo',nguon:'tu_chuyen',capLuc:now-2*ng,lanMoCuoi:now-1000},
  m2:{trangThai:'hoat_dong',ten:'Điện thoại chị Hà',app:'quanlygieo',nguon:'xin_duyet',capLuc:now-ng,lanMoCuoi:now-3*ng},
  m3:{trangThai:'hoat_dong',ten:'Máy tính bảng cũ',app:'quanlygieo',nguon:'tu_chuyen',capLuc:now-30*ng,lanMoCuoi:now-21*ng},
  m4:{trangThai:'hoat_dong',ten:'Mi Pad 7 — quầy',app:'pos',nguon:'tu_chuyen',capLuc:now-2*ng,lanMoCuoi:now-1000},
  m5:{trangThai:'hoat_dong',ten:'Màn kiosk (bản ghi cũ)',app:'kiosk',nguon:'tu_chuyen',capLuc:now-2*ng,lanMoCuoi:now-1000},
  m6:{trangThai:'hoat_dong',ten:'Quầy XOFA',app:'posx',nguon:'xin_duyet',capLuc:now-ng,lanMoCuoi:now-ng-1000},
  x1:{trangThai:'thu_hoi',ten:'Máy đã thu hồi',app:'posx'},x2:{trangThai:'tu_choi',ten:'Máy bị từ chối',app:'pos'}};
 __FS.cau_hinh_bao_mat={ma_quan_ly:{doanh_thu:{ma:'7350',luc:now-2*ng},xoa_bill:{ma:'9064',luc:now-2*ng},quy:{ma:'2618',luc:now-2*ng},xoa_bill_xofa:{ma:'4821',luc:now-2*ng}}};})();`;
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:['/usr/bin/chromium','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p)),args:['--no-sandbox']});
 let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
 try{for(const [width,height,ten] of [[1366,900,'pc'],[390,844,'dt']]){
  const p=await b.newPage({viewport:{width,height},timezoneId:'Asia/Ho_Chi_Minh',deviceScaleFactor:ANH?2:1}),errors=[],goi=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',async r=>{const q=r.request(),u=q.url();
   if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});
   if(u.includes('firebasejs'))return r.fulfill({contentType:'application/javascript',body:''});
   if(u.includes('/gieoBaoMat')){const body=q.postDataJSON();goi.push({body,auth:q.headers().authorization});
    if(body.id==='loi')return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,loi:'het_han'})});
    await p.evaluate(({viec,id,ten})=>{const d=__FS.may_duoc_duyet[id];if(viec==='doi_ten')d.ten=ten;else d.trangThai=viec},body);
    return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true})})}
   if(u.startsWith(base))return r.continue();return r.abort()});
  await p.goto(base+'/manage.html');await p.waitForFunction(()=>typeof live!=='undefined'&&live.rev&&!live.loadingKey);
  const san=()=>p.waitForFunction(()=>!live.loadingKey&&live.ready.baomat===loadKey());
  await p.evaluate(()=>navigate('baomat'));await san();
  check(await p.locator('#nav .nav-item',{hasText:'Bảo mật'}).count()===1,ten+': có mục «Bảo mật» ở thanh bên');
  check(await p.locator('.bm-store').count()===3,ten+': 3 thẻ quán');
  const mau=await p.evaluate(()=>[...document.querySelectorAll('.bm-store')].map(e=>getComputedStyle(e).getPropertyValue('--c').trim()+'|'+getComputedStyle(e.querySelector('.bm-mono')).color));
  check(new Set(mau).size===3,ten+': mỗi thẻ một màu quán ('+mau.join(' ; ')+')');
  const gg=p.locator('.bm-store[data-brand=gieo]'),tc=p.locator('.bm-store[data-brand=tc33]'),xo=p.locator('.bm-store[data-brand=xofa]');
  check((await gg.locator('.bm-cnt').innerText())==='3 máy · 1 chờ'&&(await tc.locator('.bm-cnt').innerText())==='1 máy · 1 chờ'&&(await xo.locator('.bm-cnt').innerText())==='1 máy',ten+': đếm máy theo quán, bỏ máy đã thu hồi / từ chối / yêu cầu quá hạn / kiosk');
  check(await p.locator('#bmTk').count()===0&&/Kiosk không bị ảnh hưởng/.test(await p.locator('.bm-pass').innerText()),ten+': chỉ đổi mật khẩu tài khoản quản lý, không có lựa chọn tài khoản kiosk');
  check((await gg.locator('.bm-wait .bm-code').innerText())==='K7QM'&&/POS · xin \d\d:\d\d · còn 1[12] phút/.test(await gg.locator('.bm-wait').innerText()),ten+': máy chờ duyệt hiện mã + loại + giờ + còn bao lâu');
  check(await p.evaluate(()=>!window.__XSS&&!document.querySelector('.bm-store img')&&document.querySelector('.bm-store[data-brand=tc33] .bm-wait b').textContent.includes('<img')),ten+': tên máy do máy lạ gửi được escape');
  check(await gg.locator('.bm-old',{hasText:'chưa mở 21 ngày'}).count()===1,ten+': máy lâu không mở được đánh dấu');
  check((await gg.locator('.bm-val').allInnerTexts()).join()==='7350,9064,2618'&&(await xo.locator('.bm-val').innerText())==='4821'&&await tc.locator('.bm-codes').count()===0,ten+': mã đang cài hiện sẵn đúng quán; TC33 không có mã');
  check(await gg.locator('.bm-crow',{hasText:'Ghi bù bill'}).locator('.bm-chua').count()===1,ten+': mã chưa đặt có nhãn «Chưa đặt»');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),ten+': không cuộn ngang');
  if(ANH)await p.screenshot({path:path.join(ANH,'manage_bao_mat_'+ten+'.png'),fullPage:true});
  // Duyệt
  await gg.getByRole('button',{name:'Duyệt'}).click();await p.waitForFunction(()=>__FS.may_duoc_duyet.c1.trangThai==='duyet');await san();
  check(goi.at(-1).body.viec==='duyet'&&goi.at(-1).body.id==='c1'&&goi.at(-1).auth==='Bearer TOKEN-GIA',ten+': Duyệt gọi hàm kèm phiên đăng nhập');
  await p.waitForFunction(()=>!document.querySelector('.bm-store[data-brand=gieo] .bm-wait'));
  await p.waitForFunction(()=>document.querySelector('.bm-store[data-brand=gieo] .bm-cnt').textContent==='4 máy');check(/đã duyệt, chờ máy vào/.test(await gg.innerText()),ten+': máy vừa duyệt chuyển xuống «Đang dùng»');
  // Từ chối
  await tc.getByRole('button',{name:'Từ chối'}).click();await p.waitForFunction(()=>__FS.may_duoc_duyet.c2.trangThai==='tu_choi');await san();
  await p.waitForFunction(()=>!document.querySelector('.bm-store[data-brand=tc33] .bm-wait'));check(true,ten+': Từ chối → yêu cầu biến mất');
  // Đổi tên + thu hồi
  await xo.locator('.bm-more').click();await p.locator('#bmTen').fill('Quầy XOFA mới');await p.getByRole('button',{name:'Lưu tên'}).click();
  await p.waitForFunction(()=>__FS.may_duoc_duyet.m6.ten==='Quầy XOFA mới');await san();
  await p.waitForFunction(()=>/Quầy XOFA mới/.test(document.querySelector('.bm-store[data-brand=xofa]').textContent));check(true,ten+': đổi tên máy');
  await p.waitForFunction(()=>!document.getElementById('dialog').open);
  await xo.locator('.bm-more').click();await p.getByRole('button',{name:'Thu hồi máy',exact:true}).click();
  await p.waitForFunction(()=>__FS.may_duoc_duyet.m6.trangThai==='thu_hoi');await san();
  await p.waitForFunction(()=>document.querySelector('.bm-store[data-brand=xofa] .bm-cnt').textContent==='0 máy');check(true,ten+': thu hồi (có hỏi lại) → máy rời danh sách');
  // Máy chủ từ chối → báo, không đổi gì
  await p.evaluate(()=>bmXuLy('duyet','loi'));await p.waitForFunction(()=>/hết hạn/.test(document.getElementById('toast').textContent));check(true,ten+': máy chủ báo hết hạn → hiện thông báo dễ hiểu');
  // Đặt / đổi mã
  await gg.locator('.bm-crow',{hasText:'Ghi bù bill'}).getByRole('button',{name:'Đặt'}).click();
  await p.locator('#bmMa').fill('12');check(await p.evaluate(()=>!document.querySelector('#dialog form').checkValidity()),ten+': mã ngắn hơn 4 số không lưu được');
  await p.locator('#bmMa').fill('5512');await p.getByRole('button',{name:'Lưu mã'}).click();
  await p.waitForFunction(()=>__FS.cau_hinh_bao_mat.ma_quan_ly.ghi_bu&&__FS.cau_hinh_bao_mat.ma_quan_ly.ghi_bu.ma==='5512');await san();
  check(await p.evaluate(()=>__FS.cau_hinh_bao_mat.ma_quan_ly.doanh_thu.ma==='7350'&&__FS.cau_hinh_bao_mat.ma_quan_ly.ghi_bu.luc>0),ten+': đặt mã chỉ ghi đúng mã đó, giữ các mã khác');
  await p.waitForFunction(()=>[...document.querySelectorAll('.bm-store[data-brand=gieo] .bm-val')].some(e=>e.textContent==='5512'));check(true,ten+': mã mới hiện ngay');
  check(await p.evaluate(()=>backend.writeMaQuanLy('la','1234').then(()=>false,()=>true))&&await p.evaluate(()=>backend.writeMaQuanLy('quy','12ab').then(()=>false,()=>true)),ten+': loại mã lạ / mã có chữ bị chặn ở lớp ghi');
  // Đổi mật khẩu: hai lần nhập khác nhau → không gọi
  await p.locator('#bmCu').fill('cu-cu-cu-cu');await p.locator('#bmMoi').fill('moi-moi-moi-1');await p.locator('#bmMoi2').fill('moi-moi-moi-2');await p.getByRole('button',{name:'Đổi mật khẩu'}).click();
  await p.waitForFunction(()=>/chưa giống nhau/.test(document.getElementById('toast').textContent));check(true,ten+': hai lần nhập mật khẩu mới khác nhau → chặn');
  // Màn hỏi mật khẩu
  await p.evaluate(()=>window.bmHoiMatKhau());check(await p.locator('#bmLogin input[type=password]').count()===1,ten+': màn «Đăng nhập Quản lý» dựng được');
  if(ANH)await p.screenshot({path:path.join(ANH,'manage_dang_nhap_'+ten+'.png')});
  check(errors.length===0,ten+': không lỗi JS '+errors.join(' | '));
  await p.close();
 }}finally{await b.close();server.close()}
 console.log('ALL PASS ('+n+' kiểm)');
})().catch(e=>{console.error(e);process.exit(1)});
