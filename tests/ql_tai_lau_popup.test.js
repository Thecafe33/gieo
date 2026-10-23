'use strict';
// quanlygieo: cửa sổ trượt kẹt «Đang tải…» (kết nối Firestore treo sau khi máy ngủ) — tự nối lại + nút xử lý ngay trong cửa sổ.
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../quanlygieo.html'),'utf8');
assert.match(html,/document\.addEventListener\('visibilitychange'[\s\S]{0,300}45000\) qlAutoHeal/,'quay lại tab sau > 45 giây → nối lại');
assert.match(html,/window\.addEventListener\('online', \(\)=> qlAutoHeal\('mạng có lại'\)\)/);
assert.match(html,/requestAnimationFrame\(\(\)=> requestAnimationFrame\(\(\)=> wrap\.classList\.add\('open'\)\)\);\s*qlSheetWatch\(wrap\);/,'mọi cửa sổ trượt đều được canh');
assert.match(html,/setTimeout\(\(\)=>\{ if\(stuck\(\)\) qlAutoHeal\([^)]*\); \}, 12000\)/);
assert.match(html,/location\.reload\(\)/);
// Chạy thật phần canh với DOM giả.
const src=html.slice(html.indexOf('async function qlAutoHeal'),html.indexOf('// STORE_ID giữ lại'));
const fn=src.slice(0,src.indexOf('document.addEventListener'))+src.slice(src.indexOf('// Cửa sổ trượt'));
const timers=[];let kicked=0;
const body={textContent:'Đang tải…',appended:null,appendChild(x){this.appended=x}};
const wrap={isConnected:true,querySelector:()=>body};
const mk=new Function('setTimeout','console','qlKickNetwork','document','location','let _qlHealBusy=false;'+fn+';return qlSheetWatch;');
const watch=mk((f,ms)=>timers.push({f,ms}),console,async()=>{kicked++},{createElement:()=>({style:{},querySelector:()=>({}),set innerHTML(v){this.h=v}})},{reload(){}});
watch(wrap);assert.deepEqual(timers.map(t=>t.ms),[12000,25000]);
(async()=>{
 await timers[0].f();await new Promise(r=>setImmediate(r));assert.equal(kicked,1,'12 giây còn «Đang tải» → tự nối lại');
 timers[1].f();assert(body.appended,'25 giây còn kẹt → có nút xử lý trong cửa sổ');
 body.textContent='Đã tải xong';body.appended=null;timers[0].f();timers[1].f();assert.equal(kicked,1);assert.equal(body.appended,null,'đã tải xong thì không làm gì');
 console.log('ok Cửa sổ kẹt «Đang tải»: tự nối lại 12 giây, nút xử lý 25 giây; tải xong thì im');console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
