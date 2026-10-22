const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'quanlygieo2.html'),'utf8'),style=html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const ui=fs.readFileSync(path.join(__dirname,'ui.js'),'utf8');
const fixture=`
let scope='gg01',curScreen='inbox',STORE_HEALTH_ISSUE_COUNT=0,QL_ALL=false;
const counts={summary:0,cases:0,history:0,days:0,writes:0},escapeHtmlAttr=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const alertUiScope=()=>scope,ensureAuth=async()=>{},qlFmtDT=x=>x,renderSidebarNav=()=>{},renderTodayHealthBar=()=>{},syncNotificationHeader=()=>{},applyTodayHealthOpen=()=>{},closeTodayHealth=()=>{};
const sum={ready:true,enabled:true,heartbeatAt:new Date().toISOString(),counts:{approval:1,working:1,done:1}};
const rows=[{id:'chi',kind:'expenses',group:'approval',title:'Chi phí mua đá',reason:'Chờ chủ quán duyệt khoản chi.',sourceId:'chi',updatedAt:'2026-10-21',rule:'EXPENSE_APPROVAL'},{id:'work',kind:'stock_containers',group:'working',title:'Tem nguyên liệu · Sữa',reason:'Đã quá hạn. Giao phụ trách kho xử lý.',assigneeName:'Quách Khánh Duy',updatedAt:'2026-10-21',rule:'LOT_EXPIRED'},{id:'done',kind:'stock_transactions',group:'done',title:'Hao hụt · 2 dòng nguyên liệu/BTP',reason:'Đã ghi nhận vào sổ; không tự quy lỗi người báo.',updatedAt:'2026-10-21',rule:'WASTE_GROUP'}];
const rootRef={get:async()=>{counts.summary++;return{exists:true,data:()=>sum}},collection:n=>query(n)};
function query(n){let group='';const q={where:(k,op,v)=>{if(k==='group')group=v;return q},orderBy:()=>q,limit:()=>q,startAfter:()=>q,doc:id=>({collection:()=>query('history')}),get:async()=>{counts[n]++;const list=n==='history'?[{id:'1',at:'2026-10-21',reason:'Đã ghi nhận từ nguồn.'}]:rows.filter(r=>r.group===group);return{docs:list.map(r=>({id:r.id,data:()=>r}))}}};return q;}
const fstore={collection:()=>({doc:()=>rootRef}),batch:()=>({set(ref,data){window.saved=window.saved||[];saved.push(data);return this},async commit(){counts.writes+=2}})};
const vnDate=t=>new Date(t||Date.now()),dkey=d=>d.toISOString().slice(0,10),toast=()=>{},loadEmployees=async()=>[{id:'nv1',fullName:'Duy',active:true},{id:'nv2',fullName:'An',active:true}];
function openEditSheet(title,body){document.getElementById('sheet').innerHTML='<h2>'+title+'</h2>'+body;document.getElementById('sheet').hidden=false;}
function closeEditSheet(){document.getElementById('sheet').hidden=true;}
function switchScreen(s){curScreen=s;renderAlertInbox();}
function renderAlertInboxLegacy(){document.getElementById('inboxBody').innerHTML='<p>Cảnh báo nguồn hiện có</p>';}
function renderStoreHealthLegacy(t){document.getElementById(t).innerHTML='<p>Cảnh báo nguồn hiện có</p>';}
function renderTodayHealthInboxLegacy(){}
function goContainers(filter){window.lastNavigation=filter;}function showError(e){throw Error(e);}
`;
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1366,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent('<html><head><style>'+style+'</style></head><body style="display:block;padding:12px"><main style="width:min(100%,1100px);margin:auto"><div id="inboxBody"></div><div id="todayHealth"></div><div id="sheet" hidden style="background:white;padding:16px"></div></main></body></html>');
 await page.addScriptTag({content:fixture});await page.addScriptTag({content:ui});await page.evaluate(()=>renderAlertInbox());
 await page.getByRole('heading',{name:'Chi phí mua đá'}).waitFor();assert.equal(await page.evaluate(()=>counts.summary),1);
 await page.locator('.auto-tabs button').filter({hasText:'Đang xử lý'}).click();await page.getByRole('heading',{name:'Tem nguyên liệu · Sữa'}).waitFor();
 assert.equal(await page.evaluate(()=>counts.summary),1);assert.equal(await page.evaluate(()=>counts.history),0);
 await page.getByRole('button',{name:'Căn cứ & lịch sử'}).click();await page.getByText('Đã ghi nhận từ nguồn.').waitFor();assert.equal(await page.evaluate(()=>counts.history),1);
 await page.getByRole('button',{name:'Mở nghiệp vụ'}).click();assert.equal(await page.evaluate(()=>window.lastNavigation),'expired');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>{sum.ready=false;AUTO_UI.clear();return renderAlertInbox();});await page.getByText('Cảnh báo nguồn hiện có').waitFor();
 assert.equal(await page.evaluate(()=>counts.writes),0);
 await page.getByRole('button',{name:'Thiết lập phụ trách'}).click();await page.locator('#autoMode').waitFor();
 assert.equal(await page.locator('#autoMode').inputValue(),'shadow');
 await page.locator('#autoOwnerOperations').selectOption('nv1');await page.locator('#autoOwnerStock').selectOption('nv1');await page.locator('#autoBackupStock').selectOption('nv2');await page.locator('#autoEnabled').check();
 await page.getByRole('button',{name:'Lưu thiết lập'}).click();await page.waitForFunction(()=>counts.writes===2);
 assert.equal(await page.evaluate(()=>saved[0].mode),'shadow');assert.equal(await page.evaluate(()=>saved[0].backups.stock.id),'nv2');
 assert.deepEqual(errors,[]);
 console.log('ok '+width+'px: duyệt chi / giao việc / chi tiết chỉ đọc khi bấm / cache / chưa có nền không ẩn cảnh báo');await page.close();
 }}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
