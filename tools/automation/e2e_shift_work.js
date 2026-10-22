const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const code=fs.readFileSync('gieo_automation_pos.v1.js','utf8');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1366,390]){
 const p=await b.newPage({viewport:{width,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.abort());
 await p.setContent('<div id="shiftBody"></div>');
 await p.addScriptTag({content:`let reads=0;async function renderOpeningChecklist(){document.getElementById('shiftBody').innerHTML='<button id="sale">Bắt đầu bán hàng</button>';}async function renderDailyClosingChecklist(){document.getElementById('shiftBody').innerHTML='<button id="close">Tiếp tục kết ca</button>';}
 const row={kind:'stock_containers',title:'Tem sữa đã quá hạn',reason:'Kiểm tra đúng tem',assigneeName:'Duy',backupName:'An'};
 const q={where(){return this},orderBy(){return this},limit(){return this},async get(){reads++;return{docs:[{id:'t',data:()=>row}]}}};
 const root={async get(){reads++;return{exists:true,data:()=>({enabled:true,mode:'active',ready:true})}},collection(){return q}};const fstore={collection:()=>({doc:()=>root})};
 function openStockUseScreen(){window.opened='stock';}function showScreen(){}function loadKhoScreen(){}`});
 await p.addScriptTag({content:code});await p.evaluate(()=>renderOpeningChecklist());
 assert.equal(await p.evaluate(()=>reads),0);await p.locator('#sale').waitFor();
 await p.getByRole('button',{name:'Xem công việc'}).click();await p.getByText('Tem sữa đã quá hạn').waitFor();assert.equal(await p.evaluate(()=>reads),2);
 await p.getByRole('button',{name:'Mở kiểm tra'}).click();assert.equal(await p.evaluate(()=>window.opened),'stock');
 await p.evaluate(()=>renderDailyClosingChecklist());await p.locator('#close').waitFor();assert.equal(await p.evaluate(()=>reads),2);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('ok '+width+'px: checklist không tự đọc, không chặn bán/kết ca; bấm mới tải đúng việc và mở nghiệp vụ');await p.close();
 }}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
