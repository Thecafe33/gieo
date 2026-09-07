// Kiểm thử: (1) mở app lần đầu PHẢI có chỉ số ngay, (2) nhóm "Phân tích & dữ liệu".
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const HTML = join(dirname(fileURLToPath(import.meta.url)), 'quanlygieo.html');
const { chromium } = await import(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p = await b.newPage();
const loi = [];
p.on('pageerror', e => loi.push('pageerror: ' + e.message));
// Firebase giả: trả rỗng cho mọi truy vấn, nhưng KHÔNG lỗi — đúng cảnh "quán mới,
// chưa có dữ liệu": vẫn phải hiện đủ khung chỉ số chứ không được để trắng.
await p.route('**/*firebasejs/**', r => r.fulfill({contentType:'application/javascript', body:`
  (function(){
  const q = { get: async () => ({docs:[], forEach(){}, empty:true, size:0}), where(){return q;},
    orderBy(){return q;}, limit(){return q;}, doc(){return q;}, add: async()=>({id:'x'}),
    set: async()=>{}, update: async()=>{}, delete: async()=>{}, collection(){return q;},
    exists:false, data:()=>({}) };
  window.firebase = { initializeApp: ()=>({}), apps: [],
    firestore: Object.assign(()=>({collection:()=>q, doc:()=>q, runTransaction: async(f)=>f({get:async()=>({exists:false,data:()=>({})}),set(){},update(){}})}),
      {FieldPath:{documentId:()=>'id'}, FieldValue:{increment:()=>1}}),
    // Firebase thật LUÔN gọi callback bất đồng bộ. Gọi đồng bộ ở bản giả sẽ ném
    // "Cannot access 'unsub' before initialization" trong ensureAuth — lỗi của bản
    // giả, không phải của app.
    auth: ()=>({signInAnonymously: async()=>({user:{uid:'u'}}), signInWithEmailAndPassword: async()=>({user:{uid:'u'}}),
                onAuthStateChanged:(cb)=>{ setTimeout(()=>cb({uid:'u'}),0); return ()=>{}; },
                currentUser:{uid:'u'}}),
    database: ()=>({ref:()=>({once: async()=>({val:()=>null}), get: async()=>({val:()=>null}), on(){}, off(){}})}) };
  })();
`}));
await p.goto('file://' + HTML);
// Không bấm gì cả — đúng cảnh mở app lần đầu.
await p.waitForTimeout(3500);

const kq = await p.evaluate(() => {
  const grid = document.getElementById('todayGrid');
  const nav = document.getElementById('sidebarNav') || document.querySelector('.sidebar') || document.body;
  const nhom = [...document.querySelectorAll('.nav-group, .navgroup, .nav-sec-title')].map(e=>e.textContent.trim());
  return {
    manDangMo: curScreen,
    gridCoNoiDung: !!(grid && grid.innerHTML.trim().length > 50),
    gridText: grid ? grid.textContent.replace(/\s+/g,' ').slice(0,300) : '',
    coDoanhThu: !!(grid && /Doanh thu/i.test(grid.textContent)),
    coLaiLo: !!(grid && /(Lãi|Lỗ) hôm nay/i.test(grid.textContent)),
    coAOV: !!(grid && /AOV/i.test(grid.textContent)),
    coThuHoiVon: /Thu hồi vốn/i.test((document.getElementById('todayThv')||{textContent:''}).textContent),
    navText: nav.textContent.replace(/\s+/g,' '),
    nhomTieuDe: nhom,
    // Nhánh Kho không được chứa 2 mục phân tích nữa
    khoSubs: [...KHO_SIDEBAR_SUBS],
    navSections: NAV_SECTIONS.map(s=>({ group:s.group||'', keys:s.items.map(i=>i.key) }))
  };
});

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };

console.log('\n1. LỖI ĐÃ SỬA: mở app lần đầu phải có chỉ số ngay, không phải bấm Tải lại');
ok(kq.manDangMo === 'today', 'màn mặc định là Hôm nay');
ok(kq.gridCoNoiDung, 'khối chỉ số ĐÃ ĐƯỢC VẼ mà không bấm gì — "' + kq.gridText.slice(0,80) + '…"');
ok(kq.coDoanhThu, 'có thẻ Doanh thu');
ok(kq.coLaiLo, 'có thẻ Lãi/lỗ hôm nay');
ok(kq.coAOV, 'có các thẻ AOV / số bill / IPT');
ok(kq.coThuHoiVon, 'có thẻ Thu hồi vốn');

console.log('2. Nhóm "Phân tích & dữ liệu" tách riêng');
const nhomPT = kq.navSections.find(s=>s.group==='Phân tích & dữ liệu');
ok(!!nhomPT, 'có nhóm riêng trên sidebar');
ok(nhomPT && nhomPT.keys.length === 4, '4 mục — được ' + (nhomPT?nhomPT.keys.length:0));
['kho:lechkho','kho:dubao','entry:ngaydacbiet','entry:export'].forEach(k=>
  ok(nhomPT && nhomPT.keys.includes(k), 'gồm ' + k));

console.log('3. Nhánh Kho nhẹ đi, Cấu hình nhẹ đi');
ok(!kq.khoSubs.includes('lechkho'), 'Kho không còn Lệch kho');
ok(!kq.khoSubs.includes('dubao'), 'Kho không còn Dự báo');
const kho = kq.navSections.find(s=>s.group==='Kho');
ok(kho && !kho.keys.includes('kho:lechkho'), 'nhánh Kho trên sidebar cũng không còn');
const cfg = kq.navSections.find(s=>s.group==='Cấu hình');
ok(cfg && !cfg.keys.includes('entry:export'), 'Cấu hình không còn Trích xuất');
ok(cfg && !cfg.keys.includes('entry:ngaydacbiet'), 'Cấu hình không còn Ngày đặc biệt');
ok(/Phân tích & dữ liệu/.test(kq.navText), 'tên nhóm hiện trên sidebar');

const loiThat = loi.filter(l => !/net::|Failed to load|firebase|Firebase|401|403|permission/i.test(l));
ok(loiThat.length===0, 'không có lỗi JS lúc khởi động: ' + loiThat.join(' | '));
console.log(`\n${pass} đúng · ${fail} sai`);
await b.close();
process.exit(fail?1:0);
