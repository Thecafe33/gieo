// Firebase / CDN giả tối thiểu cho e2e tách posgieo (không mạng ngoài), NHỚ ĐƯỜNG DẪN + lượt ghi (window.__ghi), đọc mồi (window.__SEED).
// Dùng bởi e2e_0d.js, e2e_hook.js, e2e_ban.js, e2e_kho.js.
'use strict';
const FB_STUB = `(function(){
  // Firebase giả tối thiểu, NHỚ ĐƯỜNG DẪN (che_do_thu tự kiểm collection().path / ref().toString() / storage fullPath)
  // Tuỳ chọn trang: window.__SEED_GHI = true → mỗi lượt ghi cập nhật lại __SEED (đọc sau ghi thấy dữ liệu mới; update = gộp nông,
  // khoá 'a.b' gộp lồng; FieldValue.increment KHÔNG cộng dồn — xấp xỉ); window.__HONG = [{op, re, con}] → lượt ghi khớp op + regex
  // đường dẫn bị LỖI (con = số lần, mặc định 1) — giả mạng rớt giữa chừng.
  var cpv=function(v){return v==null?v:JSON.parse(JSON.stringify(v))};
  var apSeed=function(k,duong,d,merge){ if(!window.__SEED_GHI)return; var S=window.__SEED=window.__SEED||{};
    if(k==='delete'||k==='remove'){delete S[duong];return;}
    if(k==='update'||merge){var o=Object.assign({},S[duong]||{});Object.keys(d||{}).forEach(function(kk){var ps=kk.split('.'),t=o;for(var i=0;i<ps.length-1;i++){t[ps[i]]=Object.assign({},t[ps[i]]||{});t=t[ps[i]];}t[ps[ps.length-1]]=cpv(d[kk]);});S[duong]=o;return;}
    S[duong]=cpv(d); };
  var hong=function(op,duong){var H=window.__HONG||[];for(var i=0;i<H.length;i++){var h=H[i];if(h.op===op&&new RegExp(h.re).test(duong)&&(h.con==null?1:h.con)>0){h.con=(h.con==null?1:h.con)-1;(window.__ghi=window.__ghi||[]).push({op:op+'!hong',p:duong,rt:false,d:null});return true;}}return false;};
  var mk=function(p,rt){var o={path:p,id:String(p).split('/').pop()};   // rt: ref Realtime Database (snapshot exists() là HÀM), không: Firestore (exists là thuộc tính)
    ['where','orderBy','limit','orderByChild','equalTo','limitToLast','startAt','endAt','startAfter'].forEach(function(k){o[k]=function(){return o};});
    o.collection=o.doc=o.child=function(n){return mk((p?p+'/':'')+(n==null?'auto'+(window.__autoN=(window.__autoN||0)+1):n),rt);};   // doc() không mã → mã riêng mỗi lần (bộ đếm, tất định)
    o.ref=function(n){return mk(n==null?'':String(n),rt);};
    o.toString=function(){return 'https://gia.firebaseio.com/'+p;};
    // Dữ liệu mồi (tuỳ chọn): window.__SEED = {'đường/dẫn/doc': dữ liệu} — doc / nút RT có mồi thì đọc ra, collection = các doc con trực tiếp.
    // Bộ lọc (where/orderBy/limit) bị bỏ qua; ghi KHÔNG cập nhật mồi (chỉ ghi nhớ vào __ghi).
    o.get=function(){var S=window.__SEED||{},cp=function(v){return v==null?v:JSON.parse(JSON.stringify(v))};
      var con=Object.keys(S).filter(function(k){return k.indexOf(p+'/')===0&&k.slice(p.length+1).indexOf('/')<0;}).sort();
      var docs=con.map(function(k){return {id:k.split('/').pop(),exists:true,ref:mk(k,rt),data:function(){return cp(S[k])}};});
      var co=Object.prototype.hasOwnProperty.call(S,p),v=co?cp(S[p]):null;
      if(rt&&!co&&con.length){v={};con.forEach(function(k){v[k.split('/').pop()]=cp(S[k]);});}
      return Promise.resolve({docs:docs,empty:!docs.length,exists:rt?function(){return v!=null}:co,size:docs.length,forEach:function(f){rt?Object.keys(v||{}).forEach(function(k){f({key:k,val:function(){return v[k]}})}):docs.forEach(f);},val:function(){return v},data:function(){return co?cp(S[p]):undefined},numChildren:function(){return v&&typeof v==='object'?Object.keys(v).length:0},hasChildren:function(){return !!(v&&typeof v==='object'&&Object.keys(v).length)},key:o.id,id:o.id,ref:o})};
    var ghi=function(op,d){try{(window.__ghi=window.__ghi||[]).push({op:op,p:p,rt:!!rt,d:JSON.parse(JSON.stringify(d===undefined?null:d))});}catch(e){(window.__ghi=window.__ghi||[]).push({op:op,p:p,rt:!!rt,d:'?'});}};o.add=function(d){(window.__ghiAdd=window.__ghiAdd||[]).push(p);ghi('add',d);var id=p+'/auto'+(window.__autoN=(window.__autoN||0)+1);apSeed('set',id,d);return Promise.resolve(mk(id));};o.once=o.get;o.on=function(){};o.off=function(){};o.onSnapshot=function(){return function(){}};['set','update','delete','remove'].forEach(function(k){o[k]=function(d,opt){if(hong(k,p))return Promise.reject(new Error('e2e-hong '+k+' '+p));ghi(k,d);apSeed(k,p,d,opt&&opt.merge);return Promise.resolve()};});o.push=function(d){ghi('push',d);var c=mk(p+'/push',rt);if(d!==undefined)apSeed('set',p+'/push',d);c.then=undefined;return c;};o.transaction=function(fn){var S0=window.__SEED||{};var v=fn(window.__SEED_GHI&&Object.prototype.hasOwnProperty.call(S0,p)?cpv(S0[p]):null);ghi('transaction',v);if(v!==undefined)apSeed('set',p,v);return Promise.resolve({committed:true,snapshot:{val:function(){return v},exists:function(){return v!=null}}})};
    o.batch=function(){var q=[];return {set:function(r,d,opt){q.push(['set',r,d,opt&&opt.merge])},update:function(r,d){q.push(['update',r,d])},delete:function(r){q.push(['delete',r,null])},commit:function(){for(var i=0;i<q.length;i++){if(hong('batch.'+q[i][0],q[i][1]&&q[i][1].path))return Promise.reject(new Error('e2e-hong batch'));}q.forEach(function(x){ghi('batch.'+x[0]+'@'+(x[1]&&x[1].path),x[2]);apSeed(x[0],x[1]&&x[1].path,x[2],x[3]);});return Promise.resolve()}}};
    o.runTransaction=function(fn){var q=[];var tx={get:function(r){return r.get()},set:function(r,d,opt){q.push(['set',r,d,opt&&opt.merge]);return tx},update:function(r,d){q.push(['update',r,d]);return tx},delete:function(r){q.push(['delete',r,null]);return tx}};return Promise.resolve().then(function(){return fn(tx);}).then(function(kq){for(var i=0;i<q.length;i++){if(hong('tx.'+q[i][0],q[i][1]&&q[i][1].path))throw new Error('e2e-hong tx.'+q[i][0]+' '+(q[i][1]&&q[i][1].path));}q.forEach(function(x){ghi('tx.'+x[0]+'@'+(x[1]&&x[1].path),x[2]);apSeed(x[0],x[1]&&x[1].path,x[2],x[3]);});return kq;});};o.enablePersistence=function(){return Promise.resolve()};o.settings=function(){};
    o.enableNetwork=o.disableNetwork=function(){return Promise.resolve()};return o;};
  var fs_=mk(''),db_=mk('',true);var st_={ref:function(x){var r={fullPath:String(x||''),child:function(n){return st_.ref((x?x+'/':'')+n)},put:function(f){var duong=String(x||'');if(hong('storage.put',duong))return Promise.reject(new Error('e2e-hong storage.put'));(window.__ghi=window.__ghi||[]).push({op:'storage.put',p:duong,rt:false,d:{name:f&&f.name||null,size:f&&f.size||0}});return Promise.resolve({ref:{fullPath:duong,getDownloadURL:function(){return Promise.resolve('https://gia.storage/'+duong)}}})},getDownloadURL:function(){return Promise.resolve('')},listAll:function(){return Promise.resolve({items:[],prefixes:[]})}};return r;}};
  window.firebase={apps:[],initializeApp:function(){this.apps.push({})},database:function(){return db_},firestore:function(){return fs_},
    auth:function(){return {onAuthStateChanged:function(){},signInWithEmailAndPassword:function(){return new Promise(function(){})},currentUser:null}},storage:function(){return st_}};
  window.firebase.firestore.FieldValue={serverTimestamp:function(){return 0},increment:function(n){return n},arrayUnion:function(){},arrayRemove:function(){},delete:function(){}};
  window.firebase.firestore.FieldPath={documentId:function(){return '__name__'}};
  window.firebase.database.ServerValue={TIMESTAMP:0,increment:function(n){return n}};
})();`;
module.exports = { FB_STUB };
