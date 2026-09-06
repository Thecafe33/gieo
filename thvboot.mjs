// Smoke test: mở FILE HTML THẬT trong Chromium, chặn Firebase SDK bằng bản giả tối
// thiểu, và bắt mọi lỗi JS lúc nạp trang (biến không tồn tại, template hỏng...).
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const HTML = join(dirname(fileURLToPath(import.meta.url)), 'quanlygieo.html');
// Playwright cài toàn cục trong môi trường phát triển; Chromium ở /opt/pw-browsers.
const { chromium } = await import(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p = await b.newPage();
const loi = [];
p.on('pageerror', e => loi.push('pageerror: ' + e.message));
p.on('console', m => { if(m.type()==='error') loi.push('console: ' + m.text()); });
await p.route('**/*firebasejs/**', r => r.fulfill({contentType:'application/javascript', body:`
  (function(){
  const q = { get: async () => ({docs:[], forEach(){}, empty:true}), where(){return q;}, orderBy(){return q;},
    limit(){return q;}, doc(){return q;}, add: async()=>({id:'x'}), set: async()=>{}, update: async()=>{},
    delete: async()=>{}, collection(){return q;}, exists:false, data:()=>({}) };
  window.firebase = { initializeApp: ()=>({}), apps: [],
    firestore: Object.assign(()=>({collection:()=>q, doc:()=>q}), {FieldPath:{documentId:()=>'id'}, FieldValue:{}}),
    auth: ()=>({signInAnonymously: async()=>({}), onAuthStateChanged:(cb)=>cb({uid:'u'}), currentUser:{uid:'u'}}),
    database: ()=>({ref:()=>({once: async()=>({val:()=>null}), get: async()=>({val:()=>null})})}) };
  })();
`}));
await p.goto('file://' + HTML);
await p.waitForTimeout(2500);

const ketQua = await p.evaluate(() => {
  const out = {};
  // Các hàm mới phải tồn tại và chạy được ngay trong trang thật
  out.coHam = ['thvTienNgay','thvCompute','thvCardHTML','thvHealthHTML','computeCapitalRecovery','thvToggleChiTiet']
    .every(n => typeof window[n] === 'function');
  const days = Array.from({length:30},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'), lai:800000, khauHao:200000}));
  const d = window.thvCompute({days, tongVon:50000000, mocDaDat:null});
  out.pct = d.pct; out.daThuHoi = d.daThuHoi;
  // Cắm thẳng thẻ vào đúng chỗ nó sẽ nằm, xem có vẽ ra DOM thật không
  const box = document.getElementById('todayThv');
  out.coChoCam = !!box;
  if(box){
    box.innerHTML = window.thvCardHTML({...d, moc:'2026-01-01', batDauThat:'2026-01-01', biCatBot:false,
      chuaCoMoc:false, vonKhaiTay:0, vonLucDatMoc:0}, {lai:-44000, khauHao:200000});
    out.chuHienThi = box.innerText.replace(/\s+/g,' ').trim();
    const rows = document.getElementById('thvRows');
    out.chiTietAnBanDau = !!(rows && rows.hasAttribute('hidden'));
    window.thvToggleChiTiet();
    out.chiTietMoDuoc = !!(rows && !rows.hasAttribute('hidden'));
  }
  out.coChoCamHealth = !!document.getElementById('healthBody');
  return out;
});

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('  ✗ '+m);} };
ok(ketQua.coHam, 'các hàm thu hồi vốn có mặt trong trang thật');
ok(Math.abs(ketQua.pct-60)<0.01, 'tính trong trang thật ra 60% — được '+ketQua.pct);
ok(ketQua.coChoCam, 'có chỗ cắm #todayThv ở màn Hôm nay');
ok(/Thu hồi vốn đầu tư/i.test(ketQua.chuHienThi||''), 'thẻ hiện tiêu đề');
ok(/60%/.test(ketQua.chuHienThi||''), 'thẻ hiện 60%');
ok(/156\.000/.test(ketQua.chuHienThi||''), 'thẻ hiện "hôm nay góp thêm 156.000đ"');
ok(ketQua.chiTietAnBanDau, 'phần cách tính ban đầu đang ẩn');
ok(ketQua.chiTietMoDuoc, 'bấm mở được phần cách tính');
ok(ketQua.coChoCamHealth, 'màn Sức khoẻ tài chính vẫn còn chỗ vẽ');

const loiThat = loi.filter(l => !/net::|Failed to load|firebase|Firebase|401|403|permission/i.test(l));
ok(loiThat.length===0, 'không có lỗi JS lúc nạp trang:\n    ' + loiThat.join('\n    '));
console.log(`\n${pass} đúng · ${fail} sai`);
if(loi.length) console.log('(bỏ qua ' + loi.length + ' lỗi mạng/firebase giả lập)');
await b.close();
process.exit(fail?1:0);
