// Hàm nút Báo hết POS thật + engine thật + Firebase giả nghiêm, chặn toàn bộ mạng.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {extract}=require('../../tests/lib/extract');
const root=path.resolve(__dirname,'../..');
const fake=fs.readFileSync(root+'/tests/lib/fakefb.js','utf8').split('module.exports =')[0];
const handlers=extract('posgieo.html',['submitFinishContainer','finishContainerRemaining']);
const engine=fs.readFileSync(root+'/'+require('../../tests/lib/engine_file'),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:require('../../tests/lib/e2e').chromiumPath()});let checks=0;
 try{for(const [width,height]of [[1366,768],[390,844]])for(const mode of ['finishDoc','cleanup']){
  const p=await browser.newPage({viewport:{width,height}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>r.abort());
  await p.setContent('<div id="finish"><input id="finishPositiveWasteAck" type="checkbox" checked><button id="confirm" onclick="submitFinishContainer(\'A\',true)">Xác nhận đã hết</button></div><div id="toast"></div>');
  await p.addScriptTag({content:'(function(){const process={env:{}};'+fake+';window.__makeFake=makeFake;})();'});
  await p.addScriptTag({content:engine});
  await p.addScriptTag({content:`
   const CTN='stock_containers_gieogieo',INV='inventory_items_gieogieo';
   const item={id:'X',name:'Sữa thử',unit:'ml',trackingMode:'unit',countUnitName:'Chai',packagingUnits:[{name:'Chai',baseQty:1000}],currentStock:100};
   window.F=__makeFake({rt:{active_units_gieogieo:{X:{A:{unitBase:100,capacity:1000,openedAt:1}}}},fs:{
    [INV+'/X']:item,[CTN+'/A']:{itemId:'X',status:'open',code:'AAA',unit:'ml',baseQty:1000,unitBase:500}}});
   UnitEngine.init({app:'pos',fstore:F.fstore,db:F.db,FieldValue:F.FieldValue,now:()=>F.clock.now(),
    getItems:()=>[item],businessDate:()=> '2026-10-19',hooks:{closeScanSheet(){document.getElementById('finish').hidden=true;}}});
   let fails=3;
   if(${JSON.stringify(mode)}==='finishDoc'){
    const collection=F.fstore.collection;F.fstore.collection=name=>{const c=collection(name),doc=c.doc;c.doc=id=>{const r=doc(id),update=r.update;
      if(name===CTN&&id==='A')r.update=async v=>{if(fails-->0)throw Error('FS offline');return update(v);};return r;};return c;};
   }else{
    const ref=F.db.ref;const wrap=(r,p)=>{const child=r.child;r.child=id=>wrap(child(id),p+'/'+id);
      if(p==='active_units_gieogieo/X/A'){const tx=r.transaction;r.transaction=async fn=>{if(F.FS[CTN+'/A'].status==='finished'&&fails-->0)throw Error('RT offline');return tx(fn);};}return r;};F.db.ref=p=>wrap(ref(p),p);
   }
   const fstore=F.fstore,STOCK_CONTAINERS_COLL=CTN;let _posSubmitBusy=false;
   const resolveStaffPinAndCheckin=async()=>({id:'nv',fullName:'NV thử'}),prepReconStockBatch=async()=>null,isAtomicUnitContainer=()=>false;
   const toast=m=>document.getElementById('toast').textContent=m,fmtPrepQty=String,closeStockScanSheet=()=>{},_refreshStockUseListIfActive=()=>{},refreshFifoAlert=async()=>{};
   ${handlers}
   window.state=()=>({busy:_posSubmitBusy,closed:document.getElementById('finish').hidden,doc:F.FS[CTN+'/A'],
    rt:F.rtGet('active_units_gieogieo/X/A'),waste:Object.entries(F.FS).filter(([k,v])=>k.startsWith('stock_transactions_gieogieo/')&&v.type==='WASTE').map(([,v])=>v.qty)});`});
  await p.locator('#confirm').click();await p.waitForFunction(()=>!state().busy&&document.getElementById('toast').textContent.includes('Không lưu được'));
  let s=await p.evaluate(()=>state());assert.equal(s.closed,false);assert.equal(s.doc.status,mode==='cleanup'?'finished':'open');checks+=2;
  await p.locator('#confirm').click();await p.waitForFunction(()=>state().closed&&!state().busy);
  s=await p.evaluate(()=>state());assert.equal(s.doc.wasteBase,100);assert.equal(s.doc.status,'finished');assert.equal(s.rt,undefined);
  assert.deepEqual(s.waste,[-100]);assert.deepEqual(errors,[]);checks+=5;
  console.log('ok '+width+' '+mode+': lỗi giữ form, nút thật thử lại đúng 100ml, 1 WASTE, đóng form khi xong');await p.close();
 }console.log('ALL PASS ('+checks+' checks)');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
