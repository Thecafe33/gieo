'use strict';
// quanlygieo «load mãi không xong, phải F5» (23/10): đăng nhập treo / lỗi không được giữ lời hứa hỏng suốt phiên.
//   ensureAuth: quá 20 giây → báo lỗi + lần sau thử đăng nhập lại; lỗi → lần sau thử lại; đã đăng nhập → trả ngay.
//   Mỗi màn «Đang tải» quá 20 giây không đổi → thanh «Tải lâu hơn bình thường · Thử lại» (bật lại kết nối Firestore rồi tải lại màn).
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const {extract}=require('./lib/extract');
(async()=>{
 let timers=[];const fakeSetTimeout=(fn,ms)=>{const t={fn,ms};timers.push(t);return t};const fakeClear=t=>{timers=timers.filter(x=>x!==t)};
 const mk=()=>{const a={currentUser:null,calls:0,mode:'hang',onAuthStateChanged(){return()=>{}},
  signInWithEmailAndPassword(){a.calls++;if(a.mode==='hang')return new Promise(()=>{});if(a.mode==='fail')return Promise.reject(new Error('mạng'));a.currentUser={uid:'u'};return Promise.resolve({user:a.currentUser})}};return a};
 const auth=mk();
 const F=new Function('auth','setTimeout','clearTimeout','let _authReady=null;'+extract('quanlygieo.html',['ensureAuth'])+';return ensureAuth;')(auth,fakeSetTimeout,fakeClear);
 const p1=F();assert.equal(F(),p1,'đang chờ thì dùng chung một lượt đăng nhập');
 assert.equal(timers.length,1);assert.equal(timers[0].ms,20000);timers[0].fn();
 await assert.rejects(p1,e=>e.code==='auth/timeout');await new Promise(r=>setImmediate(r));
 auth.mode='fail';await assert.rejects(F(),/mạng/);await new Promise(r=>setImmediate(r));
 auth.mode='ok';const u=await F();assert.equal(u.uid,'u');assert.equal(auth.calls,3,'treo → lỗi → thử lại, không giữ lời hứa hỏng');
 assert.equal(await F(),auth.currentUser);assert.equal(auth.calls,3,'đã đăng nhập: không gọi lại');
 console.log('ok ensureAuth: quá 20 giây báo lỗi, lỗi thì lần sau thử lại, đã đăng nhập trả ngay');
 const html=fs.readFileSync(path.join(__dirname,'../quanlygieo.html'),'utf8');
 assert.match(html,/function showLoading\(el, text\)\{\s*if\(!el\) return;\s*qlLoadWatch\(el\);/,'mọi màn «Đang tải» có canh giờ');
 assert.match(html,/await qlKickNetwork\(\); bar\.remove\(\); reloadCurrent\(\);/,'Thử lại = bật lại kết nối + tải lại màn, không F5');
 assert.match(html,/fstore\.disableNetwork\(\)[\s\S]{0,80}fstore\.enableNetwork\(\)/);
 console.log('ok Màn tải quá 20 giây: thanh Thử lại (bật lại kết nối, tải lại màn)');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
