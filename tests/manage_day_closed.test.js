const assert=require('assert'),{extract}=require('./lib/extract');
(async()=>{
 let day='2026-10-20',shown=true,list=[{id:'gg01',brand:'gieo'},{id:'gg02',brand:'gieo'},{id:'tc33',brand:'tc33'}],calls=[],stops=[],paints=0;
 const state={view:'rev'},GIEO_DAY={day:'',watch:{},closed:{}};
 const backend={watchGieoDayClosed:async(id,date,on,error)=>{calls.push({id,date,on,error});return()=>stops.push(id)}};
 const sync=new Function('state','GIEO_DAY','backend','currentDate','bfShown','selectedStores','gieoDayPaint',extract('manage.html',['gieoDaySync'])+';return gieoDaySync')(state,GIEO_DAY,backend,()=>day,()=>shown,()=>list,()=>paints++);
 sync();await Promise.resolve();assert.equal(calls.length,2);sync();assert.equal(calls.length,2,'render lại không đọc lại');
 calls[0].on(true);assert.equal(GIEO_DAY.closed.gg01,true);calls[0].on(false);assert.equal(GIEO_DAY.closed.gg01,false,'mở lại');
 list=[list[1]];sync();assert.deepEqual(stops,['gg01']);calls[0].on(true);assert(!GIEO_DAY.closed.gg01,'callback cũ không hồi trạng thái');
 day='2026-10-21';sync();await Promise.resolve();assert.equal(calls.length,3);assert.equal(calls[2].date,day);
 shown=false;sync();assert.equal(Object.keys(GIEO_DAY.watch).length,0,'xem lịch sử không nghe hôm nay');
 shown=true;state.view='tienmat';sync();assert.equal(calls.length,3,'tab khác không nghe');
 let callback,path;
 const watch=new Function('ensureAuth','validDate','ggName','fstore',extract('manage.html',['watchGieoDayClosed'])+';return watchGieoDayClosed')(
 async()=>{},()=>{},(n,id)=>n+'__'+id,{collection:n=>({doc:d=>({onSnapshot:cb=>{path=n+'/'+d;callback=cb;return()=>{}}})})});
 let closed;await watch('gg02',day,v=>closed=v,()=>{});assert.equal(path,'daily_closings_gieogieo__gg02/'+day);
 for(const status of ['cash_passed','bank_passed','handed_over','pending',null]){callback({exists:true,data:()=>({status})});assert.equal(closed,false,status+' không phải đóng ngày')}
 callback({exists:true,data:()=>({status:'closed'})});assert.equal(closed,true);
 callback({exists:false});assert.equal(closed,false);
 console.log('ok đóng ngày/mở lại, trạng thái trung gian, đúng quán/ngày, gỡ listener, callback cũ và không đọc lặp');
})().catch(e=>{console.error(e);process.exitCode=1});
