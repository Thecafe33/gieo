// Role-based regressions, using the real quanlygieo2 UI and local Firebase fixtures.
const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..'),code=fs.readFileSync(path.join(__dirname,'ui.js'),'utf8');
const fixture=`
let scope='gg01',curScreen='inbox',STORE_HEALTH_ISSUE_COUNT=0,QL_ALL=false,dutyTab='digest',dutyFilter='todo',dutyFrom='',dutyTo='',curEntryTab='';
window.GieoAutomation={VERSION:2};
const sum={ready:true,enabled:true,mode:'active',countsVerifiedVersion:2,heartbeatAt:new Date().toISOString(),counts:{approval:1,working:1,done:0}};
const rows=[{id:'chi',kind:'expenses',group:'approval',title:'Khoản chi mua đá',value:35000,reason:'Chờ duyệt',sourceId:'chi',businessDate:'2026-10-01',updatedAt:new Date().toISOString(),rule:'EXPENSE_APPROVAL'},
{id:'duty',kind:'duty_cases',sourceId:'old-case',group:'working',title:'Lệch BTP cần cân lại',reason:'Chờ kết quả cân lại',businessDate:'2026-09-01',updatedAt:new Date().toISOString(),rule:'ENGINE_VERIFY'}];
const counts={summary:0,cases:0,history:0,days:0,writes:0,legacy:0};
let deferHistory=false,deferCases=false,historyRequests=[],caseRequests=[];
const escapeHtmlAttr=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const alertUiScope=()=>scope,ensureAuth=async()=>{},qlFmtDT=x=>new Date(x).toLocaleString('vi-VN'),renderSidebarNav=()=>{},renderTodayHealthBar=()=>{},syncNotificationHeader=()=>{},applyTodayHealthOpen=()=>{},closeTodayHealth=()=>{},toast=()=>{},showError=()=>{};
const rootRef={get:async()=>{counts.summary++;return{exists:true,data:()=>sum}},collection:n=>query(n)};
function query(n){let group='';const q={where:(k,op,v)=>{if(k==='group')group=v;return q},orderBy:()=>q,limit:()=>q,startAfter:()=>q,doc:id=>({collection:()=>query('history')}),get:async()=>{counts[n]++;const data=n==='history'?[{id:'1',at:Date.now(),reason:'Bằng chứng'}]:rows.filter(r=>r.group===group);const result={docs:data.map(r=>({id:r.id,data:()=>r}))};if(n==='history'&&deferHistory)return new Promise((resolve,reject)=>historyRequests.push({resolve:()=>resolve(result),reject}));if(n==='cases'&&deferCases)return new Promise((resolve,reject)=>caseRequests.push({group,resolve:()=>resolve(result),reject}));return result}};return q;}
let config={enabled:true,mode:'shadow',startDate:'2026-08-01',owners:{operations:{id:'nv1',name:'Duy'},stock:{id:'nv1',name:'Duy'}},backups:{},lowValueLimit:0,disputeDays:7,fleet20Confirmed:false};let saved=[];
const fstore={collection:()=>({doc:id=>id==='_automation_config'?{get:async()=>({exists:true,data:()=>config})}:rootRef}),batch:()=>({set(ref,data){saved.push(data);return this},async commit(){counts.writes+=2}})};
const vnDate=t=>new Date(t||Date.now()),dkey=d=>d.toISOString().slice(0,10),loadEmployees=async()=>[{id:'nv1',fullName:'Duy',active:true}];
function reloadCurrentLegacy(){}
function openEditSheet(title,body){document.getElementById('sheet').innerHTML='<h2>'+title+'</h2>'+body;document.getElementById('sheet').hidden=false;}
function closeEditSheet(){document.getElementById('sheet').hidden=true;}
function switchScreen(s){curScreen=s;}
async function renderAlertInboxLegacy(){counts.legacy++;document.getElementById('inboxBody').innerHTML='<p>Cảnh báo nguồn hiện có</p>';}
async function renderStoreHealthLegacy(t){document.getElementById(t).innerHTML='<p>Cảnh báo nguồn hiện có</p>';}
function renderTodayHealthInboxLegacy(){}
function goKho(){curScreen='entry';window.navigation={tab:dutyTab,filter:dutyFilter,from:dutyFrom,to:dutyTo};}
`;
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let failed=0;try{
async function check(name,run){const p=await browser.newPage({viewport:{width:1366,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.abort());await p.setContent('<main><div id="inboxBody"></div><div id="todayHealth"></div><div id="sheet"></div></main>');await p.addScriptTag({content:fixture});await p.addScriptTag({content:code});try{await run(p);assert.deepEqual(errors,[]);console.log('ok '+name)}catch(e){failed++;console.log('FAIL '+name+' — '+e.message.split('\n')[0])}finally{await p.close()}}
await check('Quản lý thấy số tiền khoản chi ngay trên thẻ',async p=>{await p.evaluate(()=>renderAlertInbox());assert.match(await p.locator('#inboxBody').innerText(),/35[.,]000/)});
await check('Mở vụ lệch cũ đi đúng danh sách vụ và đúng ngày',async p=>{await p.evaluate(async()=>{autoTab='working';await renderAlertInbox();autoGoSource(0)});const n=await p.evaluate(()=>navigation);assert.equal(n.tab,'cases');assert.equal(n.filter,'all');assert.equal(n.from,'2026-09-01')});
await check('Heartbeat sai định dạng không báo đang hoạt động',async p=>{const s=await p.evaluate(()=>{sum.heartbeatAt='invalid';return autoStatusHTML(sum)});assert(!s.includes('Tự động đang hoạt động'))});
await check('Chạy đối chiếu thử vẫn cho xem cảnh báo gốc trước',async p=>{await p.evaluate(()=>{sum.mode='shadow';return renderAlertInbox()});assert.equal(await p.evaluate(()=>counts.legacy),1)});
await check('Bộ chạy nền quá cũ không thay cảnh báo gốc bằng bản lưu',async p=>{await p.evaluate(()=>{sum.heartbeatAt='2026-01-01';return renderAlertInbox()});assert.equal(await p.evaluate(()=>counts.legacy),1)});
await check('Chi tiết trả chậm không ghi đè hồ sơ vừa mở',async p=>{await p.evaluate(async()=>{await renderAlertInbox();autoRows=rows;deferHistory=true;window.a=autoCaseDetail(0);window.b=autoCaseDetail(1)});await p.evaluate(async()=>{historyRequests[1].resolve();await b;historyRequests[0].resolve();await a});assert((await p.locator('#autoEvidence').innerText()).includes('Lệch BTP cần cân lại'))});
await check('Lỗi truy vấn cũ không xoá danh sách nhóm mới',async p=>{await p.evaluate(async()=>{await renderAlertInbox();deferCases=true;window.a=renderAlertInbox();await new Promise(r=>setTimeout(r,0));autoTab='working';window.b=renderAlertInbox();await new Promise(r=>setTimeout(r,0));caseRequests[1].resolve();await b;caseRequests[0].reject(Error('old network'));await a});assert((await p.locator('#autoCaseList').innerText()).includes('Lệch BTP cần cân lại'))});

await check('Tắt tự động không bị chặn bởi ngày khởi tạo cũ',async p=>{await p.evaluate(()=>autoSettings());await p.locator('#autoEnabled').uncheck();await p.getByRole('button',{name:'Lưu thiết lập'}).click();await p.waitForFunction(()=>counts.writes===2);assert.equal(await p.evaluate(()=>saved[0].enabled),false);assert.equal(await p.evaluate(()=>Object.hasOwn(saved[0],'startDate')),false)});
await check('Lưu thiết lập không đổi không khởi tạo lại và không ghi Firebase',async p=>{await p.evaluate(()=>autoSettings());await p.getByRole('button',{name:'Lưu thiết lập'}).click();assert.equal(await p.evaluate(()=>counts.writes),0);assert.equal(await p.locator('#sheet').isHidden(),true)});
await check('Bấm tải lại bỏ bộ đệm tổng hợp ngay',async p=>{await p.evaluate(()=>renderAlertInbox());assert.equal(await p.evaluate(()=>counts.summary),1);await p.evaluate(()=>{reloadCurrent();return renderAlertInbox()});assert.equal(await p.evaluate(()=>counts.summary),2)});
await check('Chưa có tổng hợp không hiện số tiền 0 như kết quả thật',async p=>{await p.evaluate(()=>autoDayReport());const text=await p.locator('#autoDayReport').innerText();assert(text.includes('Chưa đủ dữ liệu'));assert(!text.includes('0đ'))});
await check('Chưa đối chiếu bộ đếm phiên bản mới vẫn giữ cảnh báo nguồn',async p=>{await p.evaluate(()=>{window.GieoAutomation={VERSION:2};sum.countsVerifiedVersion=1;return renderAlertInbox()});assert.equal(await p.evaluate(()=>counts.legacy),1);assert.equal(await p.evaluate(()=>counts.cases),0)});
await check('Thiếu file chính sách không báo tự động đang hoạt động',async p=>{await p.evaluate(()=>{delete window.GieoAutomation;return renderAlertInbox()});assert.equal(await p.evaluate(()=>counts.legacy),1);assert.equal(await p.evaluate(()=>counts.cases),0)});
}finally{await browser.close()}console.log('RESULT '+failed+' failed');if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exit(1)});
