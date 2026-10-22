const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const code=fs.readFileSync('gieo_automation_pos.v2.js','utf8');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1366,390]){
 const p=await b.newPage({viewport:{width,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.abort());
 await p.setContent('<div id="shiftBody"></div>');
 await p.addScriptTag({content:`let reads=0,countScreen=false;async function renderOpeningChecklist(){if(countScreen){document.getElementById('shiftBody').innerHTML='<div class="kc-title">Đếm đầu ca</div>';return;}document.getElementById('shiftBody').innerHTML='<div class="kc-title">Việc đầu ca</div><button id="sale">Bắt đầu bán hàng</button>';}async function renderDailyClosingChecklist(){document.getElementById('shiftBody').innerHTML='<input id="dcNoMoreBills" type="checkbox"><button id="close">Tiếp tục kết ca</button>';}
 let row={kind:'stock_containers',title:'Tem sữa đã quá hạn',reason:'Kiểm tra đúng tem',assigneeName:'Duy',backupName:'An'};
 const q={where(){return this},orderBy(){return this},limit(){return this},async get(){reads++;return{docs:[{id:'t',data:()=>row}]}}};
 let status={enabled:true,mode:'active',ready:true,heartbeatAt:new Date().toISOString(),countsVerifiedVersion:2};let task={caseId:'new-case',status:'open',expireAt:new Date(Date.now()+3600000).toISOString()};
 const root={async get(){reads++;return{exists:true,data:()=>status}},collection(){return q}};const fstore={collection:name=>({doc:()=>name==='duty_tasks_gieogieo'?{async get(){reads++;return{exists:true,data:()=>task}}}:root})};
 function toast(s){window.notice=s}async function openPrepVerifyPOS(){window.verifyOpened=true;}
 function openStockUseScreen(){window.opened='stock';}function showScreen(){}function loadKhoScreen(){}`});
 await p.addScriptTag({content:code});await p.evaluate(()=>renderOpeningChecklist());
 assert.equal(await p.evaluate(()=>reads),0);await p.locator('#sale').waitFor();
 await p.getByRole('button',{name:'Xem công việc'}).click();await p.getByText('Tem sữa đã quá hạn').waitFor();assert.equal(await p.evaluate(()=>reads),2);
 await p.getByRole('button',{name:'Mở kiểm tra'}).click();assert.equal(await p.evaluate(()=>window.opened),'stock');
 await p.evaluate(()=>renderDailyClosingChecklist());await p.locator('#close').waitFor();assert.equal(await p.evaluate(()=>reads),2);
 await p.evaluate(()=>{status.heartbeatAt='2026-01-01';return Promise.all([GieoShiftWork.load(),GieoShiftWork.load()])});assert.equal(await p.evaluate(()=>reads),3);assert((await p.locator('#autoShiftRows').innerText()).includes('Chưa xác nhận'));
 await p.evaluate(()=>{countScreen=true;return renderOpeningChecklist()});assert.equal(await p.locator('#autoShiftWork').count(),0);
 await p.evaluate(async()=>{countScreen=false;status.heartbeatAt=new Date().toISOString();row={kind:'duty_cases',sourceStatus:'pending_verify',sourceId:'old-case',entityId:'p',title:'Cân lại BTP'};await renderOpeningChecklist();await GieoShiftWork.load();await GieoShiftWork.open(0)});assert.equal(await p.evaluate(()=>!!window.verifyOpened),false);assert((await p.evaluate(()=>notice)).includes('đã thay đổi'));
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('ok '+width+'px: checklist không tự đọc, không chặn bán/kết ca; bấm mới tải đúng việc và mở nghiệp vụ');await p.close();
 }}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
