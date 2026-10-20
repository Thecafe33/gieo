// node tools/manage_cash/e2e.js — dữ liệu giả, không cho phép kết nối Firebase.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),{extract}=require(ROOT+'/tests/lib/extract');
const gg=new Function(extract('manage.html',['ggCashExpected'])+';return ggCashExpected')();
const d='2026-10-19',cl={status:'closed',finalExpectedCash:1700000,finalActualCash:1680000,finalVariance:-20000,retainedAmount:500000,handedOverAmount:1180000,
 segmentCount:2,closingStaff:'Nguyễn An',cashPassedAt:'2026-10-19T13:00:00Z',handoverRecipient:'Chủ quán',postCloseBills:{a:{timing:'after_close',cash:45000}}};
const fixture={start:d,today:'2026-10-20',date:d,records:[{id:'gg01',name:'Gieo Mỹ Hiệp Sơn'},{id:'gg02',name:'Gieo Quán 2'},{id:'gg03',name:'Gieo Quán 3'},{id:'gg04',name:'Gieo Quán 4'}],
 tcx:{tc33:{[d]:{expected:750000,sales:800000,spent:50000,received:740000,receipt:{by:'manage'}}},xofa:{[d]:{expected:600000,sales:600000,received:null}}},
 gg:{gg01:{[d]:{...gg(cl),received:null}},gg02:{[d]:gg({status:'cash_variance_recorded',finalExpectedCash:450000,finalActualCash:470000,closingStaff:'Lê Bình'})},gg03:{[d]:gg({status:'closed',forceClosedByManagement:true})},gg04:null},
 daySummary:{tc33:{revenue:1800000,bank:900000},xofa:{revenue:1400000,bank:800000},gg01:{revenue:2000000,bank:700000},gg02:{revenue:900000,bank:300000},gg03:{revenue:0,bank:0},gg04:null}};
const segments=[{seq:1,status:'closed',custodianName:'Ca sáng',startAt:'2026-10-19T02:30:00Z',endAt:'2026-10-19T07:00:00Z',startCash:500000,expectedEndCash:900000,endCash:850000,variance:-50000,
 outgoingCount:{byName:'Ca sáng',total:850000},incomingCount:{byName:'Ca chiều',total:850000}},
 {seq:2,status:'closed',endType:'close',custodianName:'Ca chiều',startCash:850000,expectedEndCash:1700000,endCash:1680000,variance:-20000,startAt:'2026-10-19T07:00:00Z',endAt:'2026-10-19T13:00:00Z'}];
let html=fs.readFileSync(ROOT+'/manage.html','utf8').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/g,'');
const a=html.indexOf('const backend=(()=>{'),b=html.indexOf("\n'use strict';\nconst paths=",a);
assert(a>0&&b>a);
html=html.slice(0,a)+`window.cashFixture=${JSON.stringify(fixture)};window.segmentRows=${JSON.stringify(segments)};window.segmentReads=[];window.receiptWrites=[];
const backend={CLOSE_W:{},readCash:async()=>window.cashFixture,invalidateEmployees(){},
 readCashSegments:async(id,date)=>{window.segmentReads.push({id,date});return window.segmentRows},
 writeCashReceipt:async(id,date,n)=>{window.receiptWrites.push({id,date,n});const r=window.cashFixture.gg[id][date];r.received=n;r.receipt={by:'manage',at:new Date().toISOString()}}};\n`+html.slice(b);
html=html.replace('hydrateIcons();setTheme();render();',`state.view='tienmat';state.cashDate='${d}';live.cash=window.cashFixture;live.records=live.cash.records;stores=buildStoreCatalog(live.records);live.ready.tienmat=loadKey();live.updates.tienmat=Date.now();hydrateIcons();setTheme();render();`);
const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const out=process.env.AUDIT_OUTPUT||'/workspace/work/manage-cash';fs.mkdirSync(out,{recursive:true});let checks=0;
 try{for(const [w,h]of [[1366,1100],[1024,900],[390,844]]){
  const page=await browser.newPage({viewport:{width:w,height:h}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base);await page.waitForSelector('.cash-widget');
  const check=(v,msg)=>{assert(v,msg);console.log('ok '+w+' '+msg);checks++};
  check(await page.locator('.cash-widget').count()===6,'đủ 6 điểm bán');
  check(await page.locator('.cash-day-stats').count()===6,'hai số nhỏ ở mỗi điểm bán');
  const gieo=page.locator('.cash-widget').filter({hasText:'GG01'});
  check((await gieo.innerText()).includes('Thiếu 20.000'),'lệch cuối ca hiện trước khi mở chi tiết');
  for(const n of ['1.700.000','1.680.000','1.245.000','1.225.000'])check((await gieo.innerText()).includes(n),'đúng số '+n);
  check((await page.locator('.cash-widget').filter({hasText:'GG02'}).innerText()).includes('Thừa 20.000'),'chưa bàn giao vẫn hiện số đếm');
  check((await page.locator('.cash-widget').filter({hasText:'GG04'}).innerText()).includes('Chưa tải được'),'lỗi đọc không hiển thị 0');
  check(await page.evaluate(()=>window.segmentReads.length)===0,'không tự đọc đoạn ca');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'không tràn ngang');
  await page.screenshot({path:out+'/'+w+'.png',fullPage:true});
  await gieo.locator('.cash-segments-link').click();await page.waitForSelector('#cashSegmentDetail .cash-segment');
  check((await page.locator('#cashSegmentDetail').innerText()).includes('Thiếu 70.000'),'chi tiết cộng lệch của 2 đoạn');
  check(await page.evaluate(()=>window.segmentReads.length)===1,'chỉ đọc một lần khi bấm');
  check(await page.evaluate(()=>window.segmentReads[0].id==='gg01'&&window.segmentReads[0].date==='2026-10-19'),'đọc đúng quán và ngày');
  check(await page.evaluate(()=>{const d=document.getElementById('dialog');return d.scrollWidth<=d.clientWidth+1}),'popup không tràn ngang');
  await page.getByRole('button',{name:'Đóng',exact:true}).click();await gieo.locator('.cash-segments-link').click();
  check(await page.evaluate(()=>window.segmentReads.length)===1,'mở lại dùng kết quả đã tải');
  await page.getByRole('button',{name:'Đóng',exact:true}).click();
  await gieo.locator('[name=received]').fill('1,220,000');await gieo.locator('[name=received]').dispatchEvent('input');
  check((await gieo.locator('.cash-live').innerText()).includes('Thiếu 5.000'),'thực nhận so đúng tiền bàn giao, không so với số đếm');
  await gieo.locator('button[type=submit]').click();await page.waitForTimeout(100);
  check(await page.evaluate(()=>window.receiptWrites.length)===1,'nút nhận tiền cũ vẫn lưu');
  check(await page.locator('.cash-widget').filter({hasText:'GG01'}).getByRole('button',{name:'Sửa',exact:true}).isVisible(),'đã nhận vẫn có nút sửa');
  await page.evaluate(()=>{state.theme='dark';setTheme()});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'chế độ tối không tràn ngang');
  await page.screenshot({path:out+'/'+w+'-dark.png',fullPage:true});
  check(errors.length===0,'không lỗi JS '+errors.join(' | '));await page.close();
 }}finally{await browser.close();server.close()}
 console.log('ALL PASS '+checks+' checks');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
