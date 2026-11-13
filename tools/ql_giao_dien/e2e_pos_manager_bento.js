// pos.html › Quản lý (bento 12/11/2026): chạy markup + hàm THẬT với Firebase giả cục bộ; không đọc dữ liệu ngoài, không in.
// Chạy:  TAILWIND_CSS=<file css> [OUT=<thư mục ảnh>] [FILE=pos_tet.html] node tools/ql_giao_dien/e2e_pos_manager_bento.js
//   file css:  printf '@tailwind base;@tailwind components;@tailwind utilities;' > in.css
//              npx -y tailwindcss@3 -i in.css --content ./pos.html -o tailwind.css
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'../..'),fixtures=ROOT+'/tools/tet/e2e/',OUT=process.env.OUT||'';
if(!process.env.TAILWIND_CSS||!fs.existsSync(process.env.TAILWIND_CSS)){console.error('Thiếu TAILWIND_CSS (xem đầu file).');process.exit(2)}
let mock=fs.readFileSync(fixtures+'mockfb.js','utf8').replace('cb({docs:snapDocs(coll,filters)})','cb({docs:snapDocs(coll,filters),forEach(fn){snapDocs(coll,filters).forEach(fn)}})');
mock+="\nfirebase.database.ServerValue={TIMESTAMP:0};firebase.firestore.FieldValue={delete(){return null},serverTimestamp(){return null},increment(n){return n},arrayUnion(){return []}};firebase.storage=()=>({ref:()=>({})});";
mock+=fs.readFileSync(fixtures+'rtmem.js','utf8');
mock+=`var sample={};for(var i=0;i<34;i++)sample['item'+i]={name:(i===0?'Trà đào hồng nhài với trân châu trắng':i===1?'Trà đào cam sả':'Món thử '+i),type:i%2?'Trà':'Cà phê',priceM:25000+i*1000,priceL:32000+i*1000,color:i%2?'#955f29':'#006241'};__RT2.put('menu',sample);__FS.config=__FS.config||{};__FS.config.screen_slides={slides:[{url:'https://example.com/banner-1.png',duration:8},{url:'https://example.com/banner-2.png',duration:12}]};__FS.rewards={gift1:{label:'Quà tháng mười <b>x</b>',code:'THANG10',type:'order',value:5000,cost:0,scope:'cafe33',active:true},gift2:{label:'Ly đổi tem',code:'TEM',type:'item_free',value:0,cost:500,scope:'both',active:false,targetItems:['Món thử 2']}};`;
const tw='document.head.insertAdjacentHTML("beforeend",'+JSON.stringify('<style>'+fs.readFileSync(process.env.TAILWIND_CSS,'utf8')+'</style>')+')';
const server=require('http').createServer((req,res)=>{const f=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f))});
const TABS=['menueditor','gift','screen','sticker','label'];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch();let n=0,fail=0;
const check=(v,m)=>{n++;if(!v){fail++;console.log('  ✗ '+m)}};
try{for(const [width,height,dsf] of [[1080,690,2],[1280,800,1],[1366,768,1],[1600,1000,1],[1024,700,1],[390,844,1]]){
 const pc=width>768,p=await b.newPage({viewport:{width,height},deviceScaleFactor:OUT?dsf:1});p.on('dialog',d=>d.dismiss());const errors=[];p.on('pageerror',e=>errors.push(e.stack||String(e)));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('firebase-app-compat'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.includes('firebasejs'))return r.fulfill({body:''});if(u.includes('cdn.tailwindcss.com'))return r.fulfill({contentType:'application/javascript',body:tw});if(u.startsWith(base+'/'))return r.continue();if(/fonts\.(googleapis|gstatic)\.com/.test(u))return r.continue().catch(()=>{});return r.abort()});
 await p.goto(base+'/'+(process.env.FILE||'pos.html'));await p.waitForTimeout(900);await p.evaluate(()=>switchView('discount'));await p.waitForTimeout(250);
 const W=width+': ';
 // Bấm như người dùng: cuộn tới, kiểm tra điểm giữa KHÔNG bị phần tử khác che, rồi bấm theo toạ độ thật.
 // (Không dùng locator.click(): bước tự kiểm tra che của Playwright báo sai với các khung cuộn bo góc ở màn này.)
 const tap=async l=>{await l.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));const bb=await l.boundingBox();const x=bb.x+bb.width/2,y=bb.y+bb.height/2;
  const ok=await l.evaluate((e,[x,y])=>{const t=document.elementFromPoint(x,y);return !!t&&e.contains(t)},[x,y]);check(ok,W+'bị che: '+await l.evaluate(e=>e.id||e.textContent.trim().slice(0,20)));await p.mouse.click(x,y)};
 // mỗi mục: khung hiện, thanh thao tác đúng mục, không tràn ngang, PC không cuộn trang và ô không bị cắt
 const fit=async tab=>{const r=await p.evaluate(pc=>{const v=document.getElementById('view-discount'),o=[];if(v.scrollWidth>innerWidth+1)o.push('tràn ngang '+v.scrollWidth);
   if(pc){if(v.scrollHeight>v.clientHeight+1)o.push('cuộn trang '+v.scrollHeight+'>'+v.clientHeight);
    if(innerWidth>=1080)document.querySelectorAll('#view-discount .mgr-pane.on .mgr-bento, #view-discount .mgr-pane.on .mgr-tile.scroll').forEach(e=>{if(e.scrollHeight>e.clientHeight+1)o.push('PHẢI CUỘN vùng soạn '+e.scrollHeight+'>'+e.clientHeight)});
    document.querySelectorAll('#view-discount .mgr-pane.on .mgr-tile:not(.scroll):not(.mgr-list), #view-discount .mgr-top').forEach(e=>{if(e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1)o.push('ô bị cắt: '+(e.querySelector('h3')||e).textContent.trim().slice(0,24)+' '+e.scrollHeight+'>'+e.clientHeight+' / '+e.scrollWidth+'>'+e.clientWidth)});
    document.querySelectorAll('#view-discount .mgr-pane.on input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=color]), #view-discount .mgr-pane.on select, #view-discount .mgr-pane.on textarea').forEach(e=>{const b=e.getBoundingClientRect();if(e.offsetParent&&(b.height<44||b.right>innerWidth+1||(innerWidth>=1080&&b.bottom>innerHeight+1)))o.push('ô nhập '+e.id+' '+Math.round(b.height)+'px / đáy '+Math.round(b.bottom))});
    document.querySelectorAll('#view-discount .mgr-acts .mgr-act.on button, #view-discount .mgr-seg button').forEach(e=>{const b=e.getBoundingClientRect();if(e.offsetParent&&(b.right>innerWidth+1||b.height<40))o.push('nút ngoài màn: '+e.textContent.trim())});}
   return o},pc);check(r.length===0,W+tab+' bố cục: '+r.join(' | '));if(OUT)await p.screenshot({path:path.join(OUT,width+'_'+tab+'.png')})};
 check(await p.locator('#menu-editor-list [data-key]').count()===34,W+'34 món');
 check(await p.locator('#mgr-act-menueditor').isVisible()&&await p.locator('#m-menu-search').isVisible(),W+'thanh thao tác + ô tìm luôn hiện');
 check(await p.locator(pc?'#mgr-col-a':'#mgr-mobile-tabbar').isVisible()&&!(await p.locator(pc?'#mgr-mobile-tabbar':'#mgr-col-a').isVisible()),W+'đúng thanh mục cho cỡ màn');
 await p.evaluate(()=>{window.__menuReads=0;const original=db.ref;db.ref=function(path){const r=original.call(this,path),once=r.once;if(path==='menu')r.once=function(...args){__menuReads++;return once.apply(r,args)};return r};});
 await p.locator('#m-menu-search').fill('tra dao');check(await p.locator('#menu-editor-list [data-key]:visible').count()===2,W+'tìm không dấu');
 await p.locator('#m-menu-group').selectOption('Trà');check(await p.locator('#menu-editor-list [data-key]:visible').count()===1,W+'lọc nhóm kết hợp ô tìm');
 await tap(p.locator('#menu-editor-list [data-key]:visible'));
 check(await p.locator('#me-name').inputValue()==='Trà đào cam sả'&&await p.locator('#menu-editor-list [aria-pressed=true]').count()===1,W+'chọn đúng món');
 check((await p.locator('#menu-editor-form-title').textContent()).includes('Trà đào cam sả')&&await p.locator('#menu-editor-delete-btn').isVisible(),W+'tên đang sửa + nút Xoá');
 check(await p.evaluate(()=>document.getElementById('me-preview-name').textContent==='Trà đào cam sả'&&/M 26k · L 33k/.test(document.getElementById('me-preview-price').textContent)&&getComputedStyle(document.getElementById('me-preview-card')).backgroundColor==='rgb(149, 95, 41)'),W+'ô xem trước theo món');
 check(await p.locator('#me-type-dropdown button[aria-pressed=true]').textContent()==='Trà',W+'viên phân loại đang chọn');
 await tap(p.locator('#me-type-dropdown button',{hasText:'Cà phê'}));check(await p.locator('#me-type').inputValue()==='Cà phê',W+'bấm viên → điền phân loại');
 await p.locator('#m-menu-group').selectOption('');await p.locator('#m-menu-search').fill('');
 await tap(p.locator('#menu-editor-list [data-key="item0"]'));check(await p.locator('#me-price-l').inputValue()==='32000',W+'giá L đúng món');
 await tap(p.locator('#me-color-swatches button').nth(2));check(await p.evaluate(()=>document.getElementById('me-color-value').value===ME_COLORS[2]&&document.querySelectorAll('#me-color-swatches [aria-pressed=true]').length===1),W+'chọn màu');
 await p.waitForTimeout(150);check(await p.evaluate(()=>__menuReads===0),W+'tìm / lọc / chọn không đọc thêm menu');
 await fit('menueditor');
 await p.locator('#me-price-m').fill('27000');await p.evaluate(()=>menuEditorSave());await p.waitForTimeout(150);
 check(await p.evaluate(()=>{const m=__RT2.get('menu/item0');return m.priceM===27000&&m.name==='Trà đào hồng nhài với trân châu trắng'&&m.color===ME_COLORS[2]}),W+'Lưu món ghi đúng bản ghi');
 await p.evaluate(()=>menuEditorNewItem());check(await p.locator('#me-name').inputValue()===''&&!(await p.locator('#menu-editor-delete-btn').isVisible())&&(await p.locator('#menu-editor-form-title').textContent())==='Thêm món mới',W+'Món mới xoá trắng form');
 for(const tab of TABS.slice(1)){
  await tap(p.locator(pc?'#mgr-tab-'+tab:'#mgr-mob-tab-'+tab));await p.waitForTimeout(220);
  check(await p.locator('#mgr-c-'+tab).isVisible()&&await p.locator('#mgr-act-'+tab).isVisible()&&await p.locator('#view-discount .mgr-pane.on').count()===(tab==='sticker'?1:2)&&await p.locator('#view-discount .mgr-act.on').count()===1,W+tab+' hiện đúng khung');
  check(await p.locator((pc?'#mgr-tab-':'#mgr-mob-tab-')+tab).getAttribute('aria-selected')==='true'&&await p.locator('#view-discount .mgr-seg:visible [aria-selected=true]').count()===1,W+tab+' nút mục sáng');
  if(tab==='gift'){
   check(await p.locator('#discount-list [data-key]').count()===2&&await p.locator('#discount-list b b').count()===0,W+'2 quà, tên được escape');
   await p.locator('#m-gift-search').fill('THANG10');check(await p.locator('#discount-list [data-key]:visible').count()===1,W+'tìm quà theo mã');
   await tap(p.locator('#discount-list [data-key]:visible'));check(await p.locator('#df-code').inputValue()==='THANG10'&&await p.locator('#df-delete-btn').isVisible()&&await p.locator('#df-type-order').getAttribute('aria-pressed')==='true',W+'nạp quà vào form');
   check(!(await p.locator('#df-target-row').isVisible())&&await p.locator('.mgr-target-empty').isVisible(),W+'Toàn đơn: ẩn chọn món, có ghi chú');
   await p.evaluate(()=>dfSetType('item_free'));check(await p.locator('#df-condition-row').isVisible()&&await p.locator('#df-target-search-c33').isVisible(),W+'Miễn phí 1 ly: hiện điều kiện + chọn món');
   await p.evaluate(()=>dfSetType('percent'));check(await p.evaluate(()=>document.querySelector('#df-value').parentNode.querySelector('span').textContent==='%'),W+'đơn vị % theo loại');
   await p.evaluate(()=>dfSetType('item'));await p.locator('#df-target-search-c33').fill('Món thử 3');await p.waitForTimeout(80);
   check(await p.locator('#df-menu-dropdown-c33 > div').count()>=1,W+'danh sách gợi ý món');await tap(p.locator('#df-menu-dropdown-c33 > div').first());
   check(await p.locator('#df-chips-c33 .mgr-tag').count()===1&&await p.evaluate(()=>_dfPanelItems.c33[0]==='Món thử 3'),W+'thêm món áp dụng');
   await tap(p.locator('#df-chips-c33 .mgr-tag button'));check(await p.evaluate(()=>_dfPanelItems.c33.length===0),W+'bỏ món áp dụng');
   await p.locator('#df-scope').selectOption('both');check(await p.locator('#df-target-xolifa-wrap').isVisible(),W+'Cả 2 quán: hiện ô XOFA');
   await tap(p.locator('#df-active-toggle'));check(await p.locator('#df-active-toggle').getAttribute('aria-checked')==='false'&&await p.evaluate(()=>_dfActive===false),W+'công tắc kích hoạt');
   await p.locator('#m-gift-search').fill('');
  }
  if(tab==='screen'){
   check(await p.locator('#slide-list [data-slide]').count()===2,W+'2 slide');await tap(p.locator('#slide-list [data-slide="1"]'));
   check(await p.locator('#slide-new-duration').inputValue()==='12'&&(await p.locator('#screen-add-btn').textContent())==='Cập nhật slide',W+'chọn slide → form');
  }
  if(tab==='sticker'){
   check(!(await p.locator('#mgr-col-b-wrap').isVisible()),W+'tem: không có cột danh sách');
   await tap(p.locator('#stk-logo-img-btn'));check(await p.locator('#stk-logo-img-btn').getAttribute('aria-pressed')==='true'&&await p.locator('#stk-logo-img-upload').isVisible(),W+'chọn logo ảnh');await tap(p.locator('#stk-logo-text-btn'));
   const f0=await p.locator('#stk-font-name-disp').textContent();await p.locator('#mgr-c-sticker .mgr-step button').nth(1).dispatchEvent('pointerdown');await p.locator('#mgr-c-sticker .mgr-step button').nth(1).dispatchEvent('pointerup');check(Number(await p.locator('#stk-font-name-disp').textContent())===Number(f0)+1,W+'tăng cỡ chữ');
  }
  if(tab==='label'){
   check(await p.locator('#lbl-btn-print').isDisabled()&&await p.locator('#lbl-upload-zone').isVisible()&&await p.locator('#lbl-btn-ble').isVisible(),W+'in ảnh: nút In khoá, có ô chọn ảnh + nút kết nối');
   await tap(p.locator('#lbl-btn-fliph'));check(await p.locator('#lbl-btn-fliph').getAttribute('aria-pressed')==='true',W+'lật ngang');await tap(p.locator('#lbl-btn-fliph'));
   await tap(p.locator('label[for=lbl-ck-dither]'));check(await p.locator('#lbl-ck-dither').isChecked(),W+'công tắc dithering');await tap(p.locator('label[for=lbl-ck-dither]'));
  }
  await fit(tab);
 }
 // mục theo mùa (Gấu Noel) vẫn gắn được, mở được, và trả lại mục chuẩn
 const SS=(await p.locator('#mgr-tab-lixi').count())?'lixi':'gaunoel',season=await p.locator(pc?'#mgr-tab-'+SS:'#mgr-mob-tab-'+SS).count();
 if(season){await tap(p.locator(pc?'#mgr-tab-'+SS:'#mgr-mob-tab-'+SS));await p.waitForTimeout(400);
  check(await p.locator('#mgr-c-'+SS).isVisible()&&await p.locator('#view-discount .mgr-pane.on').count()===0&&await p.locator('#view-discount .mgr-act.on').count()===0&&!(await p.locator('#mgr-col-b-wrap').isVisible()),W+SS+' mở, mục chuẩn tắt hết');await fit(SS);
  await tap(p.locator(pc?'#mgr-tab-menueditor':'#mgr-mob-tab-menueditor'));await p.waitForTimeout(250);
  check(!(await p.locator('#mgr-c-'+SS).isVisible())&&await p.locator('#mgr-c-menueditor').isVisible()&&await p.locator('#mgr-col-b-wrap').isVisible(),W+'rời '+SS+' về Menu');}
 else console.log('  (bản này không nạp mục theo mùa)');
 check(errors.length===0,W+'không lỗi trình duyệt: '+errors.join('\n').slice(0,600));await p.close();}
 console.log(fail?('CÓ '+fail+' / '+n+' KIỂM TRA HỎNG'):('ALL PASS '+n));if(fail)process.exitCode=1}finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
