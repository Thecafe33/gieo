// Cả hai UI dùng cùng Firebase giả: manage xác nhận -> quanlygieo đọc; sau bill mới làm ngược lại.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),{makeCashFixture}=require(ROOT+'/tests/lib/manage_cash_fixture'),{extract}=require(ROOT+'/tests/lib/extract');
const html=fs.readFileSync(ROOT+'/manage.html','utf8').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/g,'');
const qCode=extract('quanlygieo.html',['gieoReceiptState','gieoReceiptPatch','fmt','ownerReceiptExpected','ownerReceiptHTML','postCloseCashHTML','writeGieoOwnerReceipt','saveOwnerReceipt']);
let legacy=false;
const server=require('http').createServer((req,res)=>{
 const boot=`const cashMock=(${makeCashFixture.toString()})({noCache:true});window.cashMock=cashMock;window.firebase=cashMock.firebase;
 const cl=cashMock.data.daily_closings_gieogieo['2026-10-18'];Object.assign(cl,{ownerReceipt:{received:300000,expected:300000,at:'2026-10-18T14:00:00Z'},postCloseBills:{extra:{cash:50000,timing:'after_close',billCode:'Extra'}},postCloseCashPending:true});
 if(${legacy})cl.postCloseReceipt={received:350000,expectedTotal:350000,expectedExtra:50000,at:'2026-10-19T14:00:00Z',by:'management'};
 const api=cashMock.firebase.firestore(),coll=api.collection;api.collection=n=>{const c=coll(n),doc=c.doc;c.doc=id=>({...doc(id),path:n+'/'+id});return c};
 api.runTransaction=async fn=>{const changes=[];const value=await fn({get:r=>r.get(),set:(r,v)=>changes.push([r,v])});
 const merge=(a,b)=>{for(const [k,v]of Object.entries(b))if(v&&typeof v==='object'&&!Array.isArray(v))merge(a[k]||(a[k]={}),v);else a[k]=v};
 for(const [r,v]of changes){const at=r.path.lastIndexOf('/'),n=r.path.slice(0,at),id=r.path.slice(at+1);merge(cashMock.data[n][id],v);cashMock.writes.push(r.path)}return value;};
 const oldFS=cashMock.firebase.firestore;cashMock.firebase.firestore=Object.assign(()=>api,oldFS);
 const RD=Date;window.Date=class extends RD{constructor(...a){super(...(a.length?a:['2026-10-20T02:26:00Z']))}static now(){return +new RD('2026-10-20T02:26:00Z')}};`;
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html.replace('const backend=(()=>{',boot+'\nconst backend=(()=>{').replace('hydrateIcons();setTheme();render();',"state.view='tienmat';state.cashDate='2026-10-18';hydrateIcons();setTheme();render();"));
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1366,390])for(const oldReceipt of [false,true]){
 legacy=oldReceipt;const p=await b.newPage({viewport:{width,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());await p.goto(url);await p.waitForSelector('.cash-widget');
 const gg=p.locator('.cash-widget').filter({hasText:'GG01'});
 if(oldReceipt){assert.equal(await gg.locator('.cash-form').count(),0);assert((await gg.innerText()).includes('350.000'));assert.equal(await p.evaluate(()=>cashMock.writes.length),0);}
 else{
 assert((await gg.innerText()).includes('350.000'));assert(await gg.locator('.cash-form').isVisible());assert((await gg.innerText()).includes('Đã ghi nhận trước 300.000'));
 await gg.locator('input[name="received"]').fill('350000');await gg.getByRole('button',{name:'Xác nhận tổng',exact:true}).click();await p.waitForFunction(()=>cashMock.data.daily_closings_gieogieo['2026-10-18'].ownerReceipt.received===350000);await p.waitForFunction(()=>!live.loadingKey);
 assert.equal(await gg.locator('.cash-form').count(),0);assert.equal(await p.evaluate(()=>cashMock.writes.length),1);
 }
 // Inject đúng hàm QL, không khởi động các màn kho/lương không liên quan; cùng source Firebase giả.
 await p.evaluate(code=>{
 const box=document.createElement('section');box.id='ql-test';box.style.cssText='background:white;color:#191919;padding:20px 20px 160px;margin-bottom:80px';document.body.appendChild(box);
 const factory=new Function('fstore','ensureAuth','escapeHtmlAttr','toast','renderEntryCash',`let cashViewDate='2026-10-18',ownerReceiptEditing=null,CASH_PC_STATE=null;${code};return {ownerReceiptHTML,postCloseCashHTML,saveOwnerReceipt};`);
 let Q;const render=()=>{const cl=cashMock.data.daily_closings_gieogieo['2026-10-18'],list=Object.entries(cl.postCloseBills).map(([id,x])=>({id,...x})),afterCash=list.reduce((s,x)=>s+(x.timing==='after_close'?x.cash||0:0),0);
 box.innerHTML=Q.postCloseCashHTML({opening:{businessDate:'2026-10-18'},closing:cl,postClose:{list,afterCash,afterBank:0,inCash:0,unclassifiedCash:0}})+Q.ownerReceiptHTML(cl);};
 Q=factory(cashMock.firebase.firestore(),async()=>{},s=>String(s),s=>window.lastQLToast=s,render);window.saveOwnerReceipt=Q.saveOwnerReceipt;window.renderQL=render;render();
 },qCode);
 assert.equal(await p.locator('#ql-test #ownerRecvInput').count(),0,'manage hoặc phiếu cũ đã xác nhận: QL không bắt nhập lại');assert((await p.locator('#ql-test').innerText()).includes('350.000'));
 await p.evaluate(()=>{const c=cashMock.data.daily_closings_gieogieo['2026-10-18'];c.postCloseBills.new={cash:10000,timing:'after_close'};c.postCloseCashPending=true;renderQL()});
 assert.equal(await p.locator('#ql-test input').count(),1,'chỉ một ô nhập thực nhận ở QL');
 await p.locator('#ql-test #ownerRecvInput').fill('360000');await p.locator('#ql-test button[onclick="saveOwnerReceipt()"]').click();await p.waitForFunction(()=>cashMock.data.daily_closings_gieogieo['2026-10-18'].ownerReceipt.received===360000);
 const value=await p.evaluate(()=>cashMock.data.daily_closings_gieogieo['2026-10-18']);assert.equal(value.postCloseReceipt.received,360000);assert.equal(value.postCloseCashPending,false);assert.equal(value.handedOverAmount,300000);
 assert.equal(await p.locator('#ql-test #ownerRecvInput').count(),0);
 await p.evaluate(()=>loadCurrent(true));await p.waitForFunction(()=>!live.loadingKey);assert.equal(await gg.locator('.cash-form').count(),0);assert((await gg.innerText()).includes('360.000'));assert.deepEqual(errors,[]);
 console.log('ok',width,oldReceipt?'đọc phiếu bổ sung cũ không ghi migrate':'manage nhận bổ sung',': một xác nhận, hai app cùng số; bill mới QL xác nhận và manage đọc đúng');await p.close();
 }}finally{await b.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
