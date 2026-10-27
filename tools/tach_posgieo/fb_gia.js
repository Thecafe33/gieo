// Firebase / CDN giả tối thiểu cho e2e tách posgieo (không mạng ngoài), NHỚ ĐƯỜNG DẪN + lượt ghi (window.__ghi), đọc mồi (window.__SEED).
// Dùng bởi e2e_0d.js, e2e_hook.js, e2e_ban.js, e2e_kho.js.
'use strict';
const FB_STUB = `(function(){
  // Firebase giả tối thiểu, NHỚ ĐƯỜNG DẪN (che_do_thu tự kiểm collection().path / ref().toString() / storage fullPath)
  // Tuỳ chọn trang: window.__SEED_GHI = true → mỗi lượt ghi cập nhật lại __SEED (đọc sau ghi thấy dữ liệu mới; update = gộp nông,
  // khoá 'a.b' gộp lồng; FieldValue.increment KHÔNG cộng dồn — xấp xỉ); window.__HONG = [{op, re, con}] → lượt ghi khớp op + regex
  // đường dẫn bị LỖI (con = số lần, mặc định 1) — giả mạng rớt giữa chừng. window.__SNAP = true → Firestore onSnapshot gửi MỘT ảnh đầu từ mồi
  // (như máy chủ trả lần đầu, fromCache false; không gửi tiếp khi ghi) — tắt thì listener im lặng như trước.
  var cpv=function(v){return v==null?v:JSON.parse(JSON.stringify(v))};
  // FieldValue.arrayUnion / arrayRemove → dấu {__fv, v} (lượt ghi nhớ được giá trị); ghi-cập-nhật-mồi thực hiện phép gộp / bỏ theo giá trị.
  // set KHÔNG merge vẫn thay mọi trường khác, nhưng trường mang phép biến đổi lấy nền là giá trị CŨ của trường đó (như set mutation của SDK).
  var fvAp=function(cu,v){if(!v||typeof v!=='object'||!v.__fv)return cpv(v);var a=Array.isArray(cu)?cpv(cu):[],k=function(x){return chuan(x);};   // so THEO GIÁ TRỊ (map không phụ thuộc thứ tự khoá — như SDK)
    if(v.__fv==='arrayUnion'){v.v.forEach(function(x){if(!a.some(function(y){return k(y)===k(x);}))a.push(cpv(x));});return a;}
    if(v.__fv==='arrayRemove')return a.filter(function(y){return !v.v.some(function(x){return k(x)===k(y);});});return cpv(v);};
  var fvDoc=function(cu,d){if(!d||typeof d!=='object')return cpv(d);var o={};Object.keys(d).forEach(function(kk){o[kk]=fvAp(cu&&cu[kk],d[kk]);});return o;};
  var apSeed=function(k,duong,d,merge){ if(!window.__SEED_GHI)return; var S=window.__SEED=window.__SEED||{};
    if(k==='delete'||k==='remove'){delete S[duong];return;}
    if(k==='update'||merge){var o=Object.assign({},S[duong]||{});Object.keys(d||{}).forEach(function(kk){var ps=kk.split('.'),t=o;for(var i=0;i<ps.length-1;i++){t[ps[i]]=Object.assign({},t[ps[i]]||{});t=t[ps[i]];}t[ps[ps.length-1]]=fvAp(t[ps[ps.length-1]],d[kk]);});S[duong]=o;return;}
    S[duong]=fvDoc(S[duong],d); };
  // RT là CÂY: mồi có thể đặt ở node cha ('active_units/milk') hoặc node con ('active_units/milk/ctn1') — đọc / transaction ghép
  // cả hai (node cụ thể hơn thắng); ghi RT gom vào node tổ tiên đã có (một nguồn), set/xoá bỏ mồi con cũ của node đó.
  // RT không giữ node rỗng: object không còn con = không có dữ liệu (val() null, exists() false), dọn cả tổ tiên rỗng sau xoá.
  var gon=function(v){if(!v||typeof v!=='object'||Array.isArray(v))return v;Object.keys(v).forEach(function(k){var c=gon(v[k]);if(c==null)delete v[k];else v[k]=c;});return Object.keys(v).length?v:null;};
  var toTien=function(S,p){var g=null;Object.keys(S).forEach(function(k){if(p.indexOf(k+'/')===0&&(g===null||k.length>g.length))g=k;});return g;};
  var rtDoc=function(S,p){var v=null,g=toTien(S,p);
    if(Object.prototype.hasOwnProperty.call(S,p))v=cpv(S[p]);
    else if(g!==null){v=cpv(S[g]);p.slice(g.length+1).split('/').forEach(function(x){v=(v&&typeof v==='object'&&x in v)?v[x]:null;});}
    Object.keys(S).filter(function(k){return k.indexOf(p+'/')===0;}).sort(function(a,b){return a.length-b.length;}).forEach(function(k){if(v===null||typeof v!=='object')v={};var ps=k.slice(p.length+1).split('/'),t=v;for(var i=0;i<ps.length-1;i++){if(!t[ps[i]]||typeof t[ps[i]]!=='object')t[ps[i]]={};t=t[ps[i]];}t[ps[ps.length-1]]=cpv(S[k]);});
    return gon(v);};
  var apRT=function(k,p,d,merge){if(!window.__SEED_GHI)return;var S=window.__SEED=window.__SEED||{},g=toTien(S,p),cu=rtDoc(S,p),moi;
    if(k==='delete'||k==='remove')moi=null;
    else if(k==='update'||merge){moi=Object.assign({},cu&&typeof cu==='object'?cu:{});Object.keys(d||{}).forEach(function(kk){var ps=kk.split('/'),t=moi;for(var i=0;i<ps.length-1;i++){t[ps[i]]=Object.assign({},t[ps[i]]&&typeof t[ps[i]]==='object'?t[ps[i]]:{});t=t[ps[i]];}if(d[kk]==null)delete t[ps[ps.length-1]];else t[ps[ps.length-1]]=cpv(d[kk]);});}
    else moi=cpv(d);
    Object.keys(S).forEach(function(kk){if(kk.indexOf(p+'/')===0)delete S[kk];});
    if(g!==null){var t=S[g]=(S[g]&&typeof S[g]==='object')?S[g]:{},ps=p.slice(g.length+1).split('/');for(var i=0;i<ps.length-1;i++){if(!t[ps[i]]||typeof t[ps[i]]!=='object')t[ps[i]]={};t=t[ps[i]];}if(moi==null)delete t[ps[ps.length-1]];else t[ps[ps.length-1]]=moi;if(gon(S[g])==null)delete S[g];}
    else if(gon(moi)==null)delete S[p];else S[p]=moi;};
  var hong=function(op,duong){var H=window.__HONG||[];for(var i=0;i<H.length;i++){var h=H[i];if(h.op===op&&new RegExp(h.re).test(duong)&&(h.con==null?1:h.con)>0){h.con=(h.con==null?1:h.con)-1;(window.__ghi=window.__ghi||[]).push({op:op+'!hong',p:duong,rt:false,d:null});return true;}}return false;};
  // Bộ lọc truy vấn: Firestore where ==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any (trường lồng 'a.b',
  // FieldPath.documentId() = mã doc); RT orderByChild + equalTo (áp cả khi mồi là node cha lẫn từng node con).
  // Theo Firestore PHÍA MÁY CHỦ (mock gửi ảnh fromCache:false — tài liệu truy vấn hiện hành): thiếu trường → không khớp MỌI toán tử;
  // != / not-in loại cả trường null, not-in có null trong mảng → không khớp gì (cũng như NotInFilter của SDK 10.13.2); ==/in/array-contains so THEO GIÁ TRỊ (map/mảng so sâu);
  // <,<=,>,>= chỉ so cùng kiểu số/chuỗi (map/mảng → LỖI rõ, không lặng lẽ trả sai); toán tử lạ → LỖI. orderBy / limit / startAt… bỏ qua (thứ tự = mã doc).
  var giaTri=function(d,id,f){if(f==='__name__')return id;var v=d;String(f).split('.').forEach(function(k){v=v==null?undefined:v[k];});return v;};
  var chuan=function(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(chuan).join(',')+']';return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+chuan(v[k]);}).join(',')+'}';};
  var bang=function(a,b){return chuan(a)===chuan(b);};
  var trong=function(v,x){if(!Array.isArray(x))throw new Error('fb_gia: in/not-in/array-contains-any cần mảng');return x.some(function(e){return bang(v,e);});};
  var soSanh=function(v,x,f){var tv=typeof v,tx=typeof x;if((tv!=='number'&&tv!=='string'&&v!==null)||(tx!=='number'&&tx!=='string'))throw new Error('fb_gia: so sánh '+'<>'+' kiểu chưa hỗ trợ');return v!==null&&tv===tx&&f(v,x);};
  var khop=function(d,id,w){var v=giaTri(d,id,w[0]),op=w[1],x=w[2];if(v===undefined)return false;switch(op){case '==':return bang(v,x);case '!=':return v!==null&&!bang(v,x);
    case '<':return soSanh(v,x,function(a,b){return a<b});case '<=':return soSanh(v,x,function(a,b){return a<=b});case '>':return soSanh(v,x,function(a,b){return a>b});case '>=':return soSanh(v,x,function(a,b){return a>=b});
    case 'in':return trong(v,x);case 'not-in':if(!Array.isArray(x))throw new Error('fb_gia: not-in cần mảng');return v!==null&&x.indexOf(null)<0&&!trong(v,x);case 'array-contains':return Array.isArray(v)&&v.some(function(e){return bang(e,x);});case 'array-contains-any':return Array.isArray(v)&&v.some(function(e){return trong(e,x);});
    default:throw new Error('fb_gia: toán tử chưa hỗ trợ '+op);}};
  var mk=function(p,rt,loc){var o={path:p,id:String(p).split('/').pop(),_loc:loc||[]};   // rt: ref Realtime Database (snapshot exists() là HÀM), không: Firestore (exists là thuộc tính)
    ['orderBy','limit','limitToLast','startAt','endAt','startAfter'].forEach(function(k){o[k]=function(){return o};});
    o.where=function(f,op,x){var q=mk(p,rt,o._loc.concat([[typeof f==='string'?f:'__name__',op,x]]));return q;};
    o.orderByChild=function(f){var q=mk(p,rt,o._loc);q._child=f;return q;};
    o.equalTo=function(x){if(!o._child)throw new Error('fb_gia: equalTo chỉ hỗ trợ sau orderByChild');var q=mk(p,rt,o._loc.concat([[o._child,'==',x]]));q._child=o._child;return q;};
    o.collection=o.doc=o.child=function(n){return mk((p?p+'/':'')+(n==null?'auto'+(window.__autoN=(window.__autoN||0)+1):n),rt);};   // doc() không mã → mã riêng mỗi lần (bộ đếm, tất định)
    o.ref=function(n){return mk(n==null?'':String(n),rt);};
    o.toString=function(){return 'https://gia.firebaseio.com/'+p;};
    // Dữ liệu mồi (tuỳ chọn): window.__SEED = {'đường/dẫn/doc': dữ liệu} — doc / nút RT có mồi thì đọc ra, collection = các doc con trực tiếp
    // (đã qua bộ lọc where / orderByChild+equalTo ở trên). Ghi chỉ cập nhật mồi khi window.__SEED_GHI (đầu file).
    o.get=function(){var S=window.__SEED||{},cp=function(v){return v==null?v:JSON.parse(JSON.stringify(v))};
      var con=Object.keys(S).filter(function(k){return k.indexOf(p+'/')===0&&k.slice(p.length+1).indexOf('/')<0;}).sort().filter(function(k){return o._loc.every(function(w){return khop(S[k]||{},k.split('/').pop(),w);});});
      var docs=con.map(function(k){return {id:k.split('/').pop(),exists:true,ref:mk(k,rt),data:function(){return cp(S[k])}};});
      var co=Object.prototype.hasOwnProperty.call(S,p),v=rt?rtDoc(S,p):(co?cp(S[p]):null);
      if(rt&&o._loc.length&&v&&typeof v==='object'){var v2={};Object.keys(v).sort().forEach(function(k){if(o._loc.every(function(w){return khop(v[k]==null?{}:v[k],k,w);}))v2[k]=v[k];});v=gon(v2);}   // RT có lọc → chỉ con khớp (mồi node cha lẫn node con)
      return Promise.resolve({docs:docs,empty:!docs.length,exists:rt?function(){return v!=null}:co,size:docs.length,forEach:function(f){rt?Object.keys(v||{}).forEach(function(k){f({key:k,val:function(){return v[k]}})}):docs.forEach(f);},val:function(){return v},data:function(){return co?cp(S[p]):undefined},numChildren:function(){return v&&typeof v==='object'?Object.keys(v).length:0},hasChildren:function(){return !!(v&&typeof v==='object'&&Object.keys(v).length)},key:o.id,id:o.id,ref:o})};
    var ghi=function(op,d){try{(window.__ghi=window.__ghi||[]).push({op:op,p:p,rt:!!rt,d:JSON.parse(JSON.stringify(d===undefined?null:d))});}catch(e){(window.__ghi=window.__ghi||[]).push({op:op,p:p,rt:!!rt,d:'?'});}};o.add=function(d){if(hong('add',p))return Promise.reject(new Error('e2e-hong add '+p));(window.__ghiAdd=window.__ghiAdd||[]).push(p);ghi('add',d);var id=p+'/auto'+(window.__autoN=(window.__autoN||0)+1);apSeed('set',id,d);return Promise.resolve(mk(id));};o.once=o.get;o.on=function(){};o.off=function(){};o.onSnapshot=function(cb,loi){var tat=false;if(window.__SNAP&&typeof cb==='function')setTimeout(function(){if(tat)return;Promise.resolve().then(o.get).then(function(sn){if(tat)return;sn.metadata={fromCache:false,hasPendingWrites:false};sn.docChanges=function(){return sn.docs.map(function(d){return {type:'added',doc:d}})};cb(sn);},function(e){if(!tat&&typeof loi==='function')loi(e);});},0);return function(){tat=true}};['set','update','delete','remove'].forEach(function(k){o[k]=function(d,opt){if(hong(k,p))return Promise.reject(new Error('e2e-hong '+k+' '+p));ghi(k,d);(rt?apRT:apSeed)(k,p,d,opt&&opt.merge);return Promise.resolve()};});o.push=function(d){ghi('push',d);var c=mk(p+'/push',rt);if(d!==undefined)apRT('set',p+'/push',d);c.then=undefined;return c;};o.transaction=function(fn){var S0=window.__SEED||{};var v=fn(window.__SEED_GHI?rtDoc(S0,p):null);ghi('transaction',v);if(v!==undefined)apRT('set',p,v);return Promise.resolve({committed:true,snapshot:{val:function(){return v},exists:function(){return v!=null}}})};
    o.batch=function(){var q=[];return {set:function(r,d,opt){q.push(['set',r,d,opt&&opt.merge])},update:function(r,d){q.push(['update',r,d])},delete:function(r){q.push(['delete',r,null])},commit:function(){for(var i=0;i<q.length;i++){if(hong('batch.'+q[i][0],q[i][1]&&q[i][1].path))return Promise.reject(new Error('e2e-hong batch'));}q.forEach(function(x){ghi('batch.'+x[0]+'@'+(x[1]&&x[1].path),x[2]);apSeed(x[0],x[1]&&x[1].path,x[2],x[3]);});return Promise.resolve()}}};
    o.runTransaction=function(fn){var q=[];var tx={get:function(r){return r.get()},set:function(r,d,opt){q.push(['set',r,d,opt&&opt.merge]);return tx},update:function(r,d){q.push(['update',r,d]);return tx},delete:function(r){q.push(['delete',r,null]);return tx}};return Promise.resolve().then(function(){return fn(tx);}).then(function(kq){for(var i=0;i<q.length;i++){if(hong('tx.'+q[i][0],q[i][1]&&q[i][1].path))throw new Error('e2e-hong tx.'+q[i][0]+' '+(q[i][1]&&q[i][1].path));}q.forEach(function(x){ghi('tx.'+x[0]+'@'+(x[1]&&x[1].path),x[2]);apSeed(x[0],x[1]&&x[1].path,x[2],x[3]);});return kq;});};o.enablePersistence=function(){return Promise.resolve()};o.settings=function(){};
    o.enableNetwork=o.disableNetwork=function(){return Promise.resolve()};return o;};
  var fs_=mk(''),db_=mk('',true);var st_={ref:function(x){var r={fullPath:String(x||''),child:function(n){return st_.ref((x?x+'/':'')+n)},put:function(f){var duong=String(x||'');if(hong('storage.put',duong))return Promise.reject(new Error('e2e-hong storage.put'));(window.__ghi=window.__ghi||[]).push({op:'storage.put',p:duong,rt:false,d:{name:f&&f.name||null,size:f&&f.size||0}});return Promise.resolve({ref:{fullPath:duong,getDownloadURL:function(){return Promise.resolve('https://gia.storage/'+duong)}}})},getDownloadURL:function(){return Promise.resolve('')},listAll:function(){return Promise.resolve({items:[],prefixes:[]})}};return r;}};
  window.firebase={apps:[],initializeApp:function(){this.apps.push({})},database:function(){return db_},firestore:function(){return fs_},
    auth:function(){return {onAuthStateChanged:function(){},signInWithEmailAndPassword:function(){return new Promise(function(){})},currentUser:null}},storage:function(){return st_}};
  window.firebase.firestore.FieldValue={serverTimestamp:function(){return 0},increment:function(n){return n},arrayUnion:function(){return {__fv:'arrayUnion',v:[].slice.call(arguments)}},arrayRemove:function(){return {__fv:'arrayRemove',v:[].slice.call(arguments)}},delete:function(){}};
  window.firebase.firestore.FieldPath={documentId:function(){return '__name__'}};
  window.firebase.database.ServerValue={TIMESTAMP:0,increment:function(n){return n}};
})();`;
module.exports = { FB_STUB };
