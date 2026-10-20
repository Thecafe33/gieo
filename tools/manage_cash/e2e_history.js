// Backend + UI thật, Firebase giả có lọc where/doc; chặn mọi kết nối ngoài.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),{makeCashFixture}=require(ROOT+'/tests/lib/manage_cash_fixture');
const baseHtml=fs.readFileSync(ROOT+'/manage.html','utf8').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/g,'');
let currentOptions={};
function pageHtml(){
 const boot=`const cashMock=(${makeCashFixture.toString()})(${JSON.stringify(currentOptions)});window.cashMock=cashMock;window.firebase=cashMock.firebase;
 if(${!currentOptions.oldCache}){cashMock.data.cash_receipts_tc33xofa['tc33_2026-10-18'].date='2026-10-18';cashMock.data.daily_closings_gieogieo['2026-10-18'].businessDate='2026-10-18';}
 if(${!!currentOptions.oldCache}){const old=JSON.parse(cashMock.memory.mg_cash_cache_v1);old.tcx.xofa={'2026-10-18':{store:'xofa',date:'2026-10-18',received:400000,expected:400000,sales:400000}};cashMock.memory.mg_cash_cache_v1=JSON.stringify(old);}
 for(const [k,v]of Object.entries(cashMock.memory))localStorage.setItem(k,v);
 const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['${currentOptions.oldCache?'2026-11-20':'2026-10-20'}T02:26:00Z']))}static now(){return +new RealDate('${currentOptions.oldCache?'2026-11-20':'2026-10-20'}T02:26:00Z')}};`;
 const defer=currentOptions.defer?`const readDay=backend.readCashGieoDay;backend.readCashGieoDay=async(...a)=>{const result=await readDay(...a);await new Promise(r=>window.releaseCashDay=r);return result;};`:'';
 return baseHtml.replace('const backend=(()=>{',boot+'\nconst backend=(()=>{').replace('hydrateIcons();setTheme();render();',defer+"state.view='tienmat';state.cashDate='2026-10-18';hydrateIcons();setTheme();render();");
}
const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml())});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let checks=0;
 const check=(v,label)=>{assert(v,label);console.log('ok '+label);checks++};
 try{for(const width of [1366,390])for(const opts of [{noCache:true},{},{oldCache:true},{defer:true}]){
  currentOptions=opts;const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  await page.goto(url);await page.waitForSelector('.cash-widget');
  const tc=page.locator('.cash-widget').filter({hasText:'The cafe 33'}),gg=page.locator('.cash-widget').filter({hasText:'GG01'});
  check((await tc.innerText()).includes('500.000'),'ngày cũ hiện thực nhận TC33 500k');
  check((await gg.innerText()).includes('300.000'),'ngày cũ hiện thực nhận Gieo 300k');
  check(await tc.getByRole('button',{name:'Sửa',exact:true}).isVisible(),'giữ thao tác sửa thực nhận như bản trước');
  if(opts.defer){
   await page.waitForFunction(()=>typeof window.releaseCashDay==='function');
   await tc.getByRole('button',{name:'Sửa',exact:true}).click();await page.locator('#cash-tc33').fill('456789');
   const entered=await page.locator('#cash-tc33').inputValue();
   check((await gg.innerText()).includes('300.000'),'tiền nhận đã hiện trong lúc chỉ số phụ còn chờ');
   await page.evaluate(()=>window.releaseCashDay());await page.waitForFunction(()=>!live.cash.gieoDayPending);
   check(await page.locator('#cash-tc33').inputValue()===entered,'chỉ số phụ về không xoá số tiền đang gõ');
   check(!(await gg.innerText()).includes('Đang tải số liệu'),'chỉ số phụ cập nhật sau khi tiền nhận đã hiện');
  }else if(!opts.oldCache){
   await page.evaluate(()=>{state.cashDate='2026-10-20';render()});
   await page.waitForFunction(()=>live.cash?.date==='2026-10-20'&&!live.loadingKey);
   check((await page.locator('.cash-widget').filter({hasText:'The cafe 33'}).innerText()).includes('19/10'),'hôm nay vẫn hiện ngày 19 chưa ghi nhận');
   await page.evaluate(()=>{state.cashDate='2026-10-18';render()});
   await page.waitForFunction(()=>live.cash?.date==='2026-10-18'&&!live.loadingKey);
   check((await page.locator('.cash-widget').filter({hasText:'The cafe 33'}).innerText()).includes('500.000'),'quay lại ngày cũ giữ số thực nhận');
  }else check(await page.evaluate(()=>JSON.parse(localStorage.mg_cash_cache_v1).gg.gg01['2026-10-18'].received)===300000,'ngày cũ hơn 7 ngày vẫn đọc v1 khi v2 rỗng');
  check(await page.evaluate(()=>window.cashMock.writes.length)===0,'mở/xem/sửa nháp không ghi Firebase');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'không tràn ngang');
  check(errors.length===0,'không lỗi JS '+errors.join('|'));
  await page.close();
 }}finally{await browser.close();server.close()}
 console.log('ALL PASS '+checks+' checks');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
