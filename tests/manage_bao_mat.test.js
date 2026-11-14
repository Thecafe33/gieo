// manage.html — mục «Bảo mật»: kiểm tĩnh các điểm nối + lớp ghi mã quản lý + đăng nhập (ensureAuth) không gọi lại khi đã có phiên.
// Luồng giao diện đầy đủ: node tools/ql_giao_dien/e2e_manage_bao_mat.js (Chromium).
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'../manage.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(c)console.log('ok   '+m);else{fail++;console.log('FAIL '+m)}};
const cut=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<=i)throw new Error('không thấy đoạn '+a);return html.slice(i,j)};

ok(html.includes("['baomat','lock','Bảo mật']")&&html.includes('baomat:bmView')&&html.includes("if(view==='baomat')live.bm=result;")&&/lock:'<rect/.test(html),'điều hướng: mục, biểu tượng, hàm vẽ, nạp dữ liệu');
ok((html.match(/'diemkh','baomat'\]\.includes\(state\.view\)/g)||[]).length===2&&html.includes("'thangket','diemkh','baomat','nv'"),'ẩn bộ chọn quán ở mục Bảo mật + tính vào nút «Thêm» trên điện thoại');
ok(/readBaoMat,bmGoi,writeMaQuanLy,doiMatKhau,dangNhapQuanLy,BM_EMAIL,/.test(html),'backend xuất đủ hàm');
const ui=cut('// ---- BẢO MẬT (mục «Bảo mật») — giao diện ----','function cusView(){');
ok(!/\$\{d\.(ten|ma|id)\}/.test(ui)&&/esc\(d\.ten\)/.test(ui)&&/esc\(d\.ma\)/.test(ui)&&/esc\(v\)/.test(ui),'dữ liệu từ máy lạ (tên, mã) luôn qua esc() trước khi chèn HTML');
ok(!/functions\/automation|gieoAutomation/.test(ui),'không đụng worker Engine 2');

(async()=>{
 // Lớp ghi + gọi hàm
 const be=cut('// ---- BẢO MẬT (mục «Bảo mật») ----','// ---- ĐIỂM KHÁCH HÀNG');
 const ghi=[],goi=[];let tra={ok:true};
 const ctx={console,Date,JSON,Object,Promise,ensureAuth:async()=>{},auth:{currentUser:{email:'q@x',getIdToken:async()=>'T'}},
  fstore:{collection:c=>({get:async()=>({docs:[{id:'a',data:()=>({ten:'A'})}]}),doc:d=>({get:async()=>({exists:false}),set:async(v,o)=>{ghi.push([c,d,v,o])}})})},
  fetch:async(u,o)=>{goi.push([u,o]);return{status:400,json:async()=>tra}}};
 vm.createContext(ctx);vm.runInContext(be+';globalThis.api={readBaoMat,bmGoi,writeMaQuanLy,BM_URL};',ctx);
 const r=await ctx.api.readBaoMat();
 ok(r.may.length===1&&r.may[0].id==='a'&&JSON.stringify(r.ma)==='{}'&&r.email==='q@x','đọc: danh sách máy + mã (chưa có tài liệu → rỗng)');
 await ctx.api.writeMaQuanLy('xoa_bill',' 4455 ');
 ok(ghi.length===1&&ghi[0][0]==='cau_hinh_bao_mat'&&ghi[0][1]==='ma_quan_ly'&&ghi[0][2].xoa_bill.ma==='4455'&&ghi[0][3].merge===true,'ghi mã: đúng tài liệu, merge (không xoá mã khác)');
 for(const [l,m] of [['la','1234'],['quy','123'],['quy','123456789'],['quy','12a4'],['quy','']]){let nem=false;try{await ctx.api.writeMaQuanLy(l,m)}catch(e){nem=true}ok(nem,'ghi mã bị chặn: '+l+' / «'+m+'»')}
 ok(ghi.length===1,'mã không hợp lệ không chạm Firestore');
 await ctx.api.bmGoi('duyet',{id:'x'});
 ok(/asia-southeast1-the-cafe-33\.cloudfunctions\.net\/gieoBaoMat$/.test(goi[0][0])&&goi[0][1].headers.Authorization==='Bearer T'&&JSON.parse(goi[0][1].body).viec==='duyet','gọi hàm: đúng địa chỉ, kèm phiên, kèm việc');
 tra={ok:false,loi:'het_han'};let loi='';try{await ctx.api.bmGoi('duyet',{id:'x'})}catch(e){loi=e.message}
 ok(/hết hạn/.test(loi),'máy chủ từ chối → câu báo dễ hiểu');
 ctx.fetch=async()=>{throw new Error('mạng')};loi='';try{await ctx.api.bmGoi('duyet',{id:'x'})}catch(e){loi=e.message}
 ok(/Chưa gọi được máy chủ/.test(loi),'mất mạng / hàm chưa deploy → báo rõ');

 // ensureAuth
 const ea=cut('let _authReady = null;','const STORES = {');
 const chay=async(user,loiDangNhap)=>{let goiDN=0,hoi=0;const cbs=[];
  const c={window:{bmHoiMatKhau:()=>{hoi++}},initialize(){},Promise,String,setTimeout,auth:{onAuthStateChanged(cb){cbs.push(cb);setTimeout(()=>cb(user),1);return()=>{}},signInWithEmailAndPassword(){goiDN++;return loiDangNhap?Promise.reject(loiDangNhap):new Promise(res=>setTimeout(()=>{cbs.forEach(cb=>cb({uid:'moi'}));res()},1))}}};
  vm.createContext(c);vm.runInContext(ea+';globalThis.ensureAuth=ensureAuth;',c);
  const kq=await Promise.race([c.ensureAuth().then(u=>['ok',u],e=>['loi',e]),new Promise(r=>setTimeout(()=>r(['treo']),60))]);return{kq,goiDN,hoi}};
 let x=await chay({uid:'cu'});ok(x.kq[0]==='ok'&&x.kq[1].uid==='cu'&&x.goiDN===0,'đã có phiên lưu ở máy → dùng luôn, KHÔNG gọi đăng nhập');
 x=await chay(null);ok(x.kq[0]==='ok'&&x.kq[1].uid==='moi'&&x.goiDN===1&&x.hoi===0,'chưa có phiên → đăng nhập bằng mật khẩu cũ như trước nay');
 x=await chay(null,{code:'auth/wrong-password'});ok(x.kq[0]==='treo'&&x.hoi===1,'mật khẩu đã đổi → hỏi mật khẩu một lần (không báo lỗi tải dữ liệu)');
 x=await chay(null,{code:'auth/network-request-failed'});ok(x.kq[0]==='loi'&&x.hoi===0,'lỗi mạng → báo lỗi như cũ, không hỏi mật khẩu');
 console.log(fail?'SOME FAIL':'ALL PASS');process.exit(fail?1:0);
})();
