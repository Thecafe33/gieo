// Bill realtime dùng chung: một nguồn RT cho MỘT ngày/điểm bán. Bản đã deploy là immutable.
// Lượt đầu lấy dữ liệu ngày cần tính doanh thu; các lần sau SDK chỉ nhận child thay đổi.
// Tổng hợp và bảng tin dùng CÙNG nguồn này, không đọc lại cả node mỗi khi có bill.
(function(root){
 'use strict';
 const states=new Map();
 const keyOf=(id,day)=>id+'|'+day;
 function connect(opts){
  const key=keyOf(opts.id,opts.day);let s=states.get(key);if(s)return s;
  let resolve,reject;s={id:opts.id,day:opts.day,rows:{},version:0,ready:false,listeners:new Set(),ref:opts.db.ref(opts.path)};
  s.promise=new Promise((a,b)=>{resolve=a;reject=b});s.cancel=reject;s.promise.catch(()=>{});states.set(key,s);
  const valid=o=>o&&typeof o==='object'&&(!o.date||String(o.date).split('/')[2]===opts.day.slice(0,4));
  const event=(type,snap)=>{
   if(states.get(key)!==s)return;
   const k=snap.key,o=type==='remove'?null:snap.val(),before=s.rows[k];
   if(type!=='remove'&&!valid(o)){if(before)return event('remove',snap);return}
   if(type==='remove'){if(!before)return;delete s.rows[k]}
   else{if(JSON.stringify(before)===JSON.stringify(o))return;s.rows[k]=o}
   s.version++;
   if(s.ready)for(const fn of [...s.listeners])fn(type,k,o,before);
  };
  const fail=e=>{if(states.get(key)!==s)return;s.error=e;reject(e);for(const fn of [...s.listeners])fn('error',null,e);drop(opts.id,opts.day)};
  s.add=x=>event('add',x);s.change=x=>event('change',x);s.remove=x=>event('remove',x);
  s.ref.on('child_added',s.add,fail);s.ref.on('child_changed',s.change);s.ref.on('child_removed',s.remove);
  // Cùng ref đang nghe: SDK dùng dữ liệu đợt đầu, không thêm truy vấn/node RT khác.
  s.ref.once('value').then(snap=>{
   if(states.get(key)!==s)return;
   // child_added đã tới trước value; SDK bảo đảm thứ tự. Không seed đè lên child mới hơn.
   if(!s.version&&snap&&snap.val)Object.entries(snap.val()||{}).forEach(([k,o])=>{if(valid(o))s.rows[k]=o});
   s.ready=true;resolve(s);
  },fail);
  return s;
 }
 async function read(opts){const s=connect(opts);await s.promise;return {...s.rows}}
 function listen(opts,fn){
  const s=connect(opts);let initialized=s.ready;const receive=(...args)=>{if(initialized||args[0]==='error')fn(...args)};s.listeners.add(receive);
  if(s.ready){Object.entries(s.rows).forEach(([k,o])=>fn('add',k,o));fn('ready',null,null)}
  else s.promise.then(()=>{if(!s.listeners.has(receive))return;initialized=true;Object.entries(s.rows).forEach(([k,o])=>fn('add',k,o));fn('ready',null,null)},()=>{});
  return ()=>s.listeners.delete(receive);
 }
 function snapshot(id,day){const s=states.get(keyOf(id,day));return s&&s.ready?{...s.rows}:null}
 function version(id,day){return states.get(keyOf(id,day))?.version||0}
 function drop(id,day){const key=keyOf(id,day),s=states.get(key);if(!s)return;states.delete(key);if(!s.ready)s.cancel(new Error('Đã gỡ nguồn bill'));s.ref.off('child_added',s.add);s.ref.off('child_changed',s.change);s.ref.off('child_removed',s.remove);s.listeners.clear()}
 root.BillLive={read,listen,snapshot,version,drop};
 if(typeof module!=='undefined')module.exports=root.BillLive;
})(typeof window!=='undefined'?window:globalThis);
