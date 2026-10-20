// Backend + UI thật, Firebase giả có lọc where/doc; chặn mọi kết nối ngoài.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),{makeCashFixture}=require(ROOT+'/tests/lib/manage_cash_fixture');
const baseHtml=fs.readFileSync(ROOT+'/manage.html','utf8').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/g,'');
let currentOptions={};
function pageHtml(){
 const boot=`const cashMock=(${makeCashFixture.toString()})(${JSON.stringify(currentOptions)});window.cashMock=cashMock;window.firebase=cashMock.firebase;
 if(${!!currentOptions.poisonOld}){for(const k of ['mg_cash_cache_v1','mg_cash_cache_v2'])cashMock.memory[k]=JSON.stringify({tcx:{tc33:{'2026-10-18':{received:9999999}}},gg:{gg01:{'2026-10-18':{received:8888888}}}});}
 if(!sessionStorage.getItem('cash-clear-reload'))for(const [k,v]of Object.entries(cashMock.memory))localStorage.setItem(k,v);
 const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['${currentOptions.oldCache?'2026-11-20':'2026-10-20'}T02:26:00Z']))}static now(){return +new RealDate('${currentOptions.oldCache?'2026-11-20':'2026-10-20'}T02:26:00Z')}};`;
 const defer=currentOptions.defer?`const readDay=backend.readCashGieoDay;backend.readCashGieoDay=async(...a)=>{const result=await readDay(...a);await new Promise(r=>window.releaseCashDay=r);return result;};`:'';
 return baseHtml.replace('const backend=(()=>{',boot+'\nconst backend=(()=>{').replace('hydrateIcons();setTheme();render();',defer+"state.view='tienmat';state.cashDate='2026-10-18';hydrateIcons();setTheme();render();");
}
const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml())});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let checks=0;
 const check=(v,label)=>{assert(v,label);console.log('ok '+label);checks++};
 try{for(const width of [1366,390])for(const opts of [{noCache:true},{poisonOld:true},{noCache:true,oldCache:true},{noCache:true,defer:true},{noCache:true,offline:true},{noCache:true,failCollection:'daily_closings_gieogieo'}]){
  currentOptions=opts;const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  await page.goto(url);
  if(opts.offline){
   await page.waitForFunction(()=>!!live.error);
   check(await page.locator('.cash-widget').count()===0,'mất mạng báo lỗi thay vì dựng số 0/chưa nhận');
   check(await page.evaluate(()=>!localStorage.getItem('mg_cash_cache_v3')),'lỗi mạng không dựng đệm rỗng v3');
  }else{
  await page.waitForSelector('.cash-widget');
  const tc=page.locator('.cash-widget').filter({hasText:'The cafe 33'}),gg=page.locator('.cash-widget').filter({hasText:'GG01'});
  check((await tc.innerText()).includes('500.000'),'ngày cũ hiện thực nhận TC33 500k');
  if(opts.failCollection){
   check((await page.locator('.cash-banner').innerText()).includes('Chưa tải đủ'),'lỗi đọc Gieo không báo đã nhận đủ');
   check(await gg.locator('.cash-form').count()===0,'chưa đọc được kết ca không cho nhập đè');
  }else check((await gg.innerText()).includes('300.000'),'ngày cũ hiện thực nhận Gieo 300k');
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
  }else check(await page.evaluate(()=>JSON.parse(localStorage.mg_cash_cache_v3).gg.gg01['2026-10-18'].received)===300000,'ngày đã cũ vẫn tự dựng v3 không cần v1/v2');
  if(!opts.failCollection){
   await page.evaluate(()=>{localStorage.clear();sessionStorage.setItem('cash-clear-reload','1')});await page.reload();await page.waitForSelector('.cash-widget');
   check((await page.locator('.cash-widget').filter({hasText:'The cafe 33'}).innerText()).includes('500.000'),'xoá sạch localStorage và reload: TC33 vẫn 500k');
   check((await page.locator('.cash-widget').filter({hasText:'GG01'}).innerText()).includes('300.000'),'xoá sạch localStorage và reload: Gieo vẫn 300k');
   check(await page.evaluate(()=>!localStorage.getItem('mg_cash_cache_v1')&&!localStorage.getItem('mg_cash_cache_v2')&&JSON.parse(localStorage.mg_cash_cache_v3).schema===3),'chỉ có v3 tự dựng từ nguồn');
  }
  }
  check(await page.evaluate(()=>window.cashMock.writes.length)===0,'mở/xem/sửa nháp không ghi Firebase');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'không tràn ngang');
  check(errors.length===0,'không lỗi JS '+errors.join('|'));
  await page.close();
 }}finally{await browser.close();server.close()}
 console.log('ALL PASS '+checks+' checks');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
