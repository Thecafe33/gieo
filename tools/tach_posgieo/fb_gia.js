// Firebase / CDN giả tối thiểu cho e2e tách posgieo (không mạng ngoài), NHỚ ĐƯỜNG DẪN + lượt ghi (window.__ghi), đọc mồi (window.__SEED).
// Dùng bởi e2e_0d.js, e2e_hook.js, e2e_ban.js, e2e_kho.js.
'use strict';
const FB_STUB = `(function(){
  // Firebase giả tối thiểu, NHỚ ĐƯỜNG DẪN (che_do_thu tự kiểm collection().path / ref().toString() / storage fullPath)
  var mk=function(p,rt){var o={path:p,id:String(p).split('/').pop()};   // rt: ref Realtime Database (snapshot exists() là HÀM), không: Firestore (exists là thuộc tính)
    ['where','orderBy','limit','orderByChild','equalTo','limitToLast','startAt','endAt','startAfter'].forEach(function(k){o[k]=function(){return o};});
    o.collection=o.doc=o.child=function(n){return mk((p?p+'/':'')+(n==null?'auto':n),rt);};
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
    var ghi=function(op,d){try{(window.__ghi=window.__ghi||[]).push({op:op,p:p,rt:!!rt,d:JSON.parse(JSON.stringify(d===undefined?null:d))});}catch(e){(window.__ghi=window.__ghi||[]).push({op:op,p:p,rt:!!rt,d:'?'});}};o.add=function(d){(window.__ghiAdd=window.__ghiAdd||[]).push(p);ghi('add',d);return Promise.resolve(mk(p+'/auto'));};o.once=o.get;o.on=function(){};o.off=function(){};o.onSnapshot=function(){return function(){}};['set','update','delete','remove'].forEach(function(k){o[k]=function(d){ghi(k,d);return Promise.resolve()};});o.push=function(d){ghi('push',d);var c=mk(p+'/push',rt);c.then=undefined;return c;};o.transaction=function(fn){var v=fn(null);ghi('transaction',v);return Promise.resolve({committed:true,snapshot:{val:function(){return v},exists:function(){return v!=null}}})};
    o.batch=function(){return {set:function(r,d){ghi('batch.set@'+(r&&r.path),d)},update:function(r,d){ghi('batch.update@'+(r&&r.path),d)},delete:function(r){ghi('batch.delete@'+(r&&r.path),null)},commit:function(){return Promise.resolve()}}};
    o.runTransaction=function(fn){var tx={get:function(r){return r.get()},set:function(r,d){ghi('tx.set@'+(r&&r.path),d);return tx},update:function(r,d){ghi('tx.update@'+(r&&r.path),d);return tx},delete:function(r){ghi('tx.delete@'+(r&&r.path),null);return tx}};try{return Promise.resolve(fn(tx));}catch(e){return Promise.reject(e);}};o.enablePersistence=function(){return Promise.resolve()};o.settings=function(){};
    o.enableNetwork=o.disableNetwork=function(){return Promise.resolve()};return o;};
  var fs_=mk(''),db_=mk('',true);var st_={ref:function(x){var r={fullPath:String(x||''),child:function(n){return st_.ref((x?x+'/':'')+n)},put:function(){return Promise.resolve()},getDownloadURL:function(){return Promise.resolve('')},listAll:function(){return Promise.resolve({items:[],prefixes:[]})}};return r;}};
  window.firebase={apps:[],initializeApp:function(){this.apps.push({})},database:function(){return db_},firestore:function(){return fs_},
    auth:function(){return {onAuthStateChanged:function(){},signInWithEmailAndPassword:function(){return new Promise(function(){})},currentUser:null}},storage:function(){return st_}};
  window.firebase.firestore.FieldValue={serverTimestamp:function(){return 0},increment:function(n){return n},arrayUnion:function(){},arrayRemove:function(){},delete:function(){}};
  window.firebase.firestore.FieldPath={documentId:function(){return '__name__'}};
  window.firebase.database.ServerValue={TIMESTAMP:0,increment:function(n){return n}};
})();`;
module.exports = { FB_STUB };
