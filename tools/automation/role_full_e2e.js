// Actual HTML + shared JS; all network data replaced by local Firebase fixtures.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
let mock=fs.readFileSync(path.join(root,'tools/tet/e2e/mockfb.js'),'utf8');
const fake=fs.readFileSync(path.join(root,'tests/lib/fakefb.js'),'utf8').replace('module.exports =','window.__fakefb =');
mock+='\n(function(){const process={env:{}};'+fake+'\n})();';
mock+=`\n(function(){const seed={};for(const [c,docs]of Object.entries(window.__FS))for(const[id,d]of Object.entries(docs))seed[c+'/'+id]=d;
 const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10),at=new Date().toISOString(),base='duty_digests_gieogieo/_automation';
 seed['duty_digests_gieogieo/_engine2']={enabled:true,mode:'shadow',protocolVersion:1,settingsRevision:1,controlledItemIds:[]};
 seed['duty_digests_gieogieo/_engine2/cases/example']={itemId:'milk',itemName:'Sữa đặc',status:'decided',mode:'shadow',quantity:300,amount:30000,unit:'g',interval:{from:at,to:at},allocations:[{employeeId:'e2',employeeName:'Minh Cafe',qty:300,value:30000}],policyVersion:'finish_equal_barista_v1',explanation:'Chia theo nhóm pha chế trong khoảng',updatedAt:at};
 seed['duty_digests_gieogieo/_engine2/models/current']={day,storeId:'gg01',updatedAt:at,params:{version:'sim-test-v1',origin:'calibrated_simulation'},autoRelease:true,coverage90:0.91,modelIssues:[],obs:{total:12,scored:12,flagged:1,fifoDebt:0,minutesKnown:3},items:{milk:{n:24,informative:22,days:15,estimate:0.021,low:0.015,high:0.028,state:'trusted',level:2}},labels:{tare:{n:34,calBrier:0.06,calibrated:true},spec:{n:4,calBrier:null,calibrated:false}}};
 seed['duty_digests_gieogieo/_engine2/obs/o1']={itemId:'milk',unit:'g',at,flagged:true,score:{excess:120},residualQty:40,ranking:[{hypothesis:'tare',probability:0.62},{hypothesis:'spec',probability:null}]};
 seed['work_schedules_gieogieo/e2_'+day]={employeeId:'e2',date:day,startTime:'09:30',endTime:'20:00',isOff:false};
 seed[base]={enabled:true,ready:true,mode:'active',heartbeatAt:at,countsVerifiedVersion:3,policyVersion:3,counts:{approval:1,working:1,done:0}};
 seed[base+'/cases/expense']={id:'expense',kind:'expenses',sourceId:'e1',group:'approval',title:'Chi phí nước đá',value:35000,businessDate:day,reason:'Chờ chủ quán duyệt',resultStatus:'waiting_verification',rule:'EXPENSE_APPROVAL',visible:true,updatedAt:at};
 seed[base+'/cases/stock']={id:'stock',kind:'stock_containers',sourceId:'c1',group:'working',title:'Tem nguyên liệu Sữa cần kiểm tra',businessDate:day,reason:'Đã báo hết nhưng cần kiểm tra',resultStatus:'waiting_verification',rule:'LOT_REVIEW',visible:true,updatedAt:at};
 seed['stock_containers_gieogieo/c1']={itemId:'milk',code:'ABC123',itemName:'Sữa đặc',status:'finished',needsReview:true,initialQty:1000,unit:'g',unitBase:0,receivedAt:at};
 seed['inventory_items_gieogieo/milk']={name:'Sữa đặc',unit:'g',currentStock:0,costPerUnit:10,active:true};
 seed['expenses_gieogieo/e1']={amount:35000,status:'pending_review',date:day,paidDate:day,periodType:'onetime',category:'Nước đá',description:'Chi phí nước đá',note:'Mua đá',createdAt:at};
 const f=__fakefb.makeFake({fs:seed});window.__roleFixture=f;
 f.fstore.doc=p=>{const a=p.split('/'),id=a.pop();return f.fstore.collection(a.join('/')).doc(id)};
 f.fstore.enablePersistence=async()=>{};f.fstore.collectionGroup=c=>f.fstore.collection(c);
 const fb=()=>f.fstore;fb.FieldValue=f.FieldValue;firebase.firestore=fb;
 firebase.database.ServerValue={TIMESTAMP:0};firebase.storage=()=>({ref:()=>({})});})();`;
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(p));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:['/usr/bin/chromium','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p)),args:['--no-sandbox']});try{
 for(const width of [1366,390]){const page=await b.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.route('**/*',r=>{const url=r.request().url();if(url.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(url.includes('firebasejs'))return r.fulfill({body:''});if(url.startsWith(base+'/'))return r.continue();return r.abort()});
 await page.goto(base+'/quanlygieo2.html');await page.waitForTimeout(800);await page.evaluate(()=>switchScreen('inbox'));
 await page.getByRole('heading',{name:'Chi phí nước đá',exact:true}).waitFor();assert((await page.locator('.auto-case').innerText()).includes('35.000'));
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'inbox-'+width+'.png')});}
 await page.evaluate(()=>autoOpenTab('working'));await page.getByRole('heading',{name:'Tem nguyên liệu Sữa cần kiểm tra'}).waitFor();await page.getByRole('button',{name:'Mở nghiệp vụ'}).click();await page.locator('#ctnDetailBody').getByText('ABC123',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Xác nhận đã xem',exact:true}).click();await page.waitForFunction(()=>__roleFixture.FS['stock_containers_gieogieo/c1'].needsReview===false);
 assert.equal(await page.evaluate(()=>__roleFixture.FS['stock_containers_gieogieo/c1'].unitBase),0);assert.equal(await page.getByRole('button',{name:'Đã xác nhận xem',exact:true}).isDisabled(),true);
 await page.evaluate(()=>closeEditSheet(true));await page.evaluate(()=>autoOpenTab('approval'));await page.getByRole('heading',{name:'Chi phí nước đá',exact:true}).waitFor();await page.getByRole('button',{name:'Mở khoản chi'}).click();await page.locator('[onclick="doApproveExpense(\'e1\')"]').waitFor();
 await page.locator('[onclick="doApproveExpense(\'e1\')"]').click();await page.waitForFunction(()=>__roleFixture.FS['expenses_gieogieo/e1'].status==='approved');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'manager-'+width+'.png')});}
 await page.evaluate(()=>{return Engine2QL.open()});await page.getByRole('button',{name:'Xem cách tính và trách nhiệm'}).click();await page.getByText('300 g ÷ 1 người.',{exact:false}).waitFor();await page.getByRole('button',{name:'Về danh sách',exact:true}).click();await page.getByRole('button',{name:'POS / việc đang xử lý'}).click();await page.getByText('Chưa có xác nhận từ máy POS.',{exact:false}).waitFor();await page.getByRole('button',{name:'Về danh sách',exact:true}).click();await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await page.locator('#e2From').waitFor();await page.evaluate(()=>Engine2QL.open());await page.getByRole('button',{name:'Học & tự hiệu chuẩn'}).click();await page.getByText('Lượt học',{exact:false}).first().waitFor();const lt=await page.locator('#e2QBody').innerText();assert(lt.includes('Sữa đặc')&&lt.includes('2,1%')&&lt.includes('Đủ tin cậy'),lt);assert(lt.includes('Sai bì dụng cụ 62%')&&lt.includes('phần dư chưa giải thích 40 g'),lt);assert(lt.includes('chỉ xếp hạng, chưa in %'),lt);await page.evaluate(()=>Engine2QL.open());await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await page.locator('#e2From').waitFor();assert.equal(await page.locator('#e2From').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('ok Actual HTML '+width+'px: số tiền, mở đúng tem và xác nhận xem qua Engine không đổi tồn, duyệt đúng chi phí, không lỗi JS');await page.close();
 }
}finally{await b.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exit(1)});
