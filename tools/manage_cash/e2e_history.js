// Luồng backend + UI thật, Firebase giả lọc where/doc; chặn mọi kết nối ngoài.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),{makeCashFixture}=require(ROOT+'/tests/lib/manage_cash_fixture');
const baseHtml=fs.readFileSync(ROOT+'/manage.html','utf8').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/g,'');
let currentOptions={};
function pageHtml(){
 const boot=`const cashMock=(${makeCashFixture.toString()})(${JSON.stringify(currentOptions)});window.cashMock=cashMock;window.firebase=cashMock.firebase;
 for(const [k,v]of Object.entries(cashMock.memory))localStorage.setItem(k,v);
 const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-10-20T02:26:00Z']))}static now(){return 1792463160000}};`;
 return baseHtml.replace('const backend=(()=>{',boot+'\nconst backend=(()=>{').replace('hydrateIcons();setTheme();render();',"state.view='tienmat';state.cashDate='2026-10-18';hydrateIcons();setTheme();render();");
}
const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml())});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let checks=0;
 const check=(v,text)=>{assert(v,text);console.log('ok '+text);checks++};
 try{for(const width of [1366,390])for(const opts of [{noCache:true},{},{emptyQueries:true,noCache:true},{offline:true},{offline:true,noCache:true}]){
  currentOptions=opts;const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  await page.goto(url);await page.waitForSelector('.cash-widget');
  const tc=page.locator('.cash-widget').filter({hasText:'The cafe 33'}),gg=page.locator('.cash-widget').filter({hasText:'GG01'});
  if(opts.offline){
   check(await page.locator('.cash-banner').innerText().then(t=>t.includes('Chưa xác minh')),'offline không báo đã nhận đủ');
   check(await page.locator('.cash-form').count()===0,'offline không cho ghi đè thực nhận');
   if(!opts.noCache){check((await tc.innerText()).includes('500.000'),'offline giữ TC33 500k');check((await gg.innerText()).includes('300.000'),'offline giữ Gieo 300k')}
  }else{
   check((await tc.innerText()).includes('500.000'),'ngày cũ hiện thực nhận TC33 500k');
   check((await gg.innerText()).includes('300.000'),'ngày cũ hiện thực nhận Gieo 300k');
   check(await tc.getByRole('button',{name:'Sửa',exact:true}).isVisible(),'phiếu gốc đã xác minh mới cho sửa');
   check((await tc.innerText()).includes('Đã ghi nhận'),'có lối xem lại ngày đã nhận');
   await page.evaluate(()=>{state.cashDate='2026-10-20';render()});await page.waitForTimeout(150);
   check((await page.locator('.cash-widget').filter({hasText:'The cafe 33'}).innerText()).includes('19/10'),'hôm nay vẫn hiện ngày 19 chưa ghi nhận');
   await page.evaluate(()=>{state.cashDate='2026-10-18';render()});await page.waitForTimeout(150);
   check((await page.locator('.cash-widget').filter({hasText:'The cafe 33'}).innerText()).includes('500.000'),'quay lại ngày cũ còn đủ số thực nhận');
  }
  check(await page.evaluate(()=>window.cashMock.writes.length)===0,'mở/xem ngày không ghi Firebase');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'không tràn ngang');
  check(errors.length===0,'không lỗi JS '+errors.join('|'));
  await page.close();
 }}finally{await browser.close();server.close()}
 console.log('ALL PASS '+checks+' checks');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
