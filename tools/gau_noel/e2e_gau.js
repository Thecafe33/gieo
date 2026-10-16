// E2E Gấu Noel 2026 (trình duyệt thật — cần Playwright + Chromium; không thuộc tests/run_all.sh)
//   node tools/gau_noel/e2e_gau.js [thư_mục_ảnh]
// pos.html: tab Quản lý (bật/tắt, kho) → thanh toán thật (saveOrderToFirebase) → popup QR → khung khách → Mở lượt tại quầy → Đổi quà; bed > 160K.
// PosX.html: _loyaltyAfterSave → bốc. posgieo.html: assistFinalizeOrder → bốc, QR cuối bill (buildReceiptContent + renderReceiptCanvas).
// Firebase giả: tools/tet/e2e/mockfb.js + rtmem.js (RT) và lixi_fake_inpage.js (Firestore của bảng chương trình).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), E2E = path.join(ROOT, 'tools/tet/e2e'), OUT = process.argv[2] || '';
let mock = fs.readFileSync(path.join(E2E, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(E2E, 'rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu',[{name:'Bạc xỉu',type:'Cà phê',priceM:25000,priceL:30000},{name:'Trà đào',type:'Trà',priceM:30000},{name:'Bánh tráng',type:'Ăn vặt',priceM:20000},{name:'1h bed',type:'Bed',priceM:15000},{name:'1h bed từ h5',type:'Bed',priceM:10000}]); __RT2.put('bed_closing_time','20:50');\n";
const fake = fs.readFileSync(path.join(E2E, 'lixi_fake_inpage.js'), 'utf8');
const twJs = 'document.head.insertAdjacentHTML("beforeend","<style>.hidden{display:none!important}</style>");';
const tong = { ok: 0, fail: 0 };

async function moTrang(b, file, vp) {
  const p = await b.newPage({ viewport: vp || { width: 1366, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('gieo_store_v1', JSON.stringify({ storeId: 'gg01', code: 'GG0001' })); } catch (e) {} });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.dismiss());
  await p.exposeFunction('__shot', n => (OUT ? p.screenshot({ path: path.join(OUT, n + '.png') }) : null));
  await p.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if (u.includes('cdn.tailwindcss.com')) return r.fulfill({ contentType: 'application/javascript', body: twJs });
    if (u.startsWith('file:') || u.includes('fonts.g')) return r.continue(); return r.abort(); });
  await p.goto('file://' + ROOT + '/' + file).catch(() => {}); await p.waitForTimeout(2500);
  return { p, errs };
}
function inKq(ten, R, errs) {
  console.log('── ' + ten);
  R.forEach(l => { console.log(l); if (/^ok/.test(l)) tong.ok++; else tong.fail++; });
  const gau = errs.filter(e => /gấu|GauNoel|gau_noel/i.test(e));
  if (gau.length) { console.log('FAIL lỗi trang liên quan gấu: ' + gau.join(' | ')); tong.fail++; }
}
const CHUNG = (fake) => {
  eval(fake);
  const F = window.__lxFake; GauNoel.init({ fstore: F.fstore, FieldValue: F.FieldValue });
  GauNoel._setOffset(Date.parse('2026-11-25T10:00:00+07:00') - Date.now());
  window._posConfirm = () => Promise.resolve(true); window._posPrompt = () => Promise.resolve('2512');
  const cap = {}; GauNoel.KHO_NGAU.forEach(k => { cap[k] = { open: 9, week: 9, p15: 9, pre: 60, n: [9, 9, 9] }; });
  return { F, cap };
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ════ pos.html (The cafe 33) ════
  let { p, errs } = await moTrang(b, 'pos.html');
  let R = await p.evaluate(async ([fake, chung]) => {
    const { cap } = (eval('(' + chung + ')'))(fake);
    const R = []; window.__R = R; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x)));
    const sleep = ms => new Promise(r => setTimeout(r, ms)); const $ = id => document.getElementById(id);
    const DB = window.__LXFS, G = GauNoel;
    chk(!G.dangBat() && !G.dangMua(), '1. mặc định TẮT');
    // tab Quản lý
    switchMgrTab('gaunoel'); await sleep(300);
    const pane = $('mgr-c-gaunoel');
    chk(pane && pane.style.display === 'flex' && /Chương trình đang TẮT/.test(pane.textContent) && !!$('mgr-tab-gaunoel'), '2. tab Quản lý «Gấu Noel» mở được, báo đang TẮT');
    chk(pane.querySelectorAll('[data-quan]').length === 3, '3. 3 khung kho: The cafe 33, XOFA, Gieo Gieo');
    $('gn-bat').click(); await sleep(300);
    chk(G.dangBat() && DB['gau_noel_2026_kho/_cfg'].bat === true && /đang BẬT/.test(pane.textContent), '4. bấm BẬT → ghi _cfg.bat, 3 quán chạy');
    const card = pane.querySelector('[data-quan="tc33"]');
    card.querySelectorAll('input[data-b]').forEach(i => { i.value = 7; }); card.querySelector('[data-tong]').value = 100;
    card.querySelector('[data-luu]').click(); await sleep(300);
    const k = DB['gau_noel_2026_kho/tc33'];
    chk(k && k.tong === 100 && k.cap.v80.week === 7 && k.cap.low.n[2] === 7, '5. lưu kho The cafe 33 (trần từng kho × chặng + số gấu thật)', k);
    switchMgrTab('label'); await sleep(100);
    chk(pane.style.display === 'none', '6. sang tab khác → ẩn tab Gấu Noel');
    await window.__shot('gau_tab');
    // thanh toán thật: 2 ly + 1 ăn vặt, có SĐT
    const P = '0912000111';
    const reset = () => { cart = []; pendingBedOrder = null; isCheckoutFlow = false; renderCart(); $('kh-sdt').value = ''; };
    const rnd = Math.random; Math.random = () => 0.99;   // trượt
    reset(); addToCart('Bạc xỉu', 'M', 25000); addToCart('Trà đào', 'M', 30000); addToCart('Bánh tráng', 'M', 20000);
    $('kh-sdt').value = P; saveOrderToFirebase('Chuyển khoản'); await sleep(900);
    let d = DB['gau_noel_2026/' + P], ls = d ? Object.values(d.luot) : [];
    chk(ls.length === 1 && ls[0].ly === 2 && ls[0].tienNuoc === 55000 && ls[0].store === 'tc33', '7. thanh toán 2 ly + ăn vặt → 1 lượt, tiền nước 55K (không tính ăn vặt)', ls);
    const ov = $('gn-ov');
    chk(ov && ov.style.display === 'flex' && /1 lượt quay/.test(ov.textContent) && ov.querySelector('svg path'), '8. popup QR hiện trên POS: "1 lượt quay" + mã QR');
    await window.__shot('gau_popup_qr');
    // mở tại quầy
    ov.querySelector('[data-a=mo]').click(); await sleep(100);
    $('gn-ov').querySelector('[data-a=quay]').click(); await sleep(2000);
    chk(/Chưa trúng/.test($('gn-ov').textContent) && Object.values(DB['gau_noel_2026/' + P].luot)[0].opened === true, '9. Mở lượt tại quầy → quay → trượt, lượt đã mở');
    $('gn-ov').querySelector('[data-a=x]').click(); await sleep(100);
    // bill 6 ly → chắc 1 gấu
    reset(); for (let i = 0; i < 6; i++) addToCart('Bạc xỉu', 'M', 25000);
    $('kh-sdt').value = P; saveOrderToFirebase('Tiền mặt'); await sleep(900);
    d = DB['gau_noel_2026/' + P];
    const qua = Object.entries(d.qua || {});
    chk(Object.keys(d.luot).length === 4 && qua.length === 1 && /^GAU/.test(qua[0][0]), '10. bill 6 ly → 3 lượt, chắc 1 gấu (mã GAU…)', d);
    chk(/3 lượt quay/.test($('gn-ov').textContent), '11. popup báo 3 lượt');
    $('gn-ov').querySelector('[data-a=x]').click();
    // nhập SĐT → khung khách
    reset(); $('kh-sdt').value = P; checkSdtLive(); await sleep(1300);
    const pn = $('gn-panel');
    chk(pn.style.display === 'block' && pn.textContent.includes(qua[0][0]) && /Còn 3 lượt chưa quay/.test(pn.textContent), '12. nhập SĐT → khung Gấu Noel: quà chưa nhận + 3 lượt chưa quay', pn.textContent);
    await window.__shot('gau_panel');
    pn.querySelector('[data-doi]').click(); await sleep(600);
    chk(DB['gau_noel_2026/' + P].qua[qua[0][0]].used === true && DB['gau_noel_2026_kho/tc33'].doi === 1, '13. Đổi quà → mã hết hiệu lực, kho đếm đã nhận');
    chk(!pn.querySelector('[data-doi]'), '14. khung không còn nút Đổi quà cho mã đó');
    resetPhoneInput(); await sleep(50);
    chk(pn.style.display === 'none', '15. xoá SĐT → khung ẩn');
    // bed > 160K (không tính ăn vặt)
    const P2 = '0912000222';
    reset(); pendingBedOrder = null; activeOrderingBedId = '3';
    for (let i = 0; i < 10; i++) addToCart('1h bed', 'M', 15000); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bánh tráng', 'M', 20000);
    $('kh-sdt').value = P2; saveOrderToFirebase('Chuyển khoản'); await sleep(900);
    let d2 = DB['gau_noel_2026/' + P2], l2 = d2 ? Object.values(d2.luot) : [];
    chk(l2.length === 1 && l2[0].k === 'bed' && l2[0].win, '16. bill bed: 150K giờ bed + 25K nước = 175K (bỏ 20K ăn vặt) → trúng chắc', l2);
    $('gn-ov') && $('gn-ov').querySelector('[data-a=x]') && $('gn-ov').querySelector('[data-a=x]').click();
    const P3 = '0912000333';
    reset(); activeOrderingBedId = '4';
    for (let i = 0; i < 9; i++) addToCart('1h bed', 'M', 15000); addToCart('Bánh tráng', 'M', 20000); addToCart('Bánh tráng', 'M', 20000);
    $('kh-sdt').value = P3; saveOrderToFirebase('Chuyển khoản'); await sleep(900);
    chk(!DB['gau_noel_2026/' + P3], '17. bill bed 135K + 40K ăn vặt (chỉ 135K tính) → không trúng chắc, 0 ly → không lượt');
    activeOrderingBedId = null;
    // TẮT
    switchMgrTab('gaunoel'); await sleep(200); $('gn-bat').click(); await sleep(300);
    chk(!G.dangBat() && DB['gau_noel_2026_kho/_cfg'].bat === false, '18. TẮT → ghi _cfg.bat = false');
    reset(); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000);
    $('kh-sdt').value = '0912000444'; saveOrderToFirebase('Chuyển khoản'); await sleep(900);
    chk(!DB['gau_noel_2026/0912000444'] && (!$('gn-ov') || $('gn-ov').style.display === 'none'), '19. đang TẮT: thanh toán không bốc, không popup');
    $('kh-sdt').value = P; checkSdtLive(); await sleep(1300);
    chk($('gn-panel').style.display === 'none', '20. đang TẮT: nhập SĐT không hiện khung');
    // xoá dữ liệu
    switchMgrTab('gaunoel'); await sleep(200); $('gn-xoa').click(); await sleep(600);
    chk(!Object.keys(DB).some(x => x.indexOf('gau_noel_2026') === 0), '21. Xoá dữ liệu (mã 2512) → hết mọi bản ghi gau_noel_2026*');
    Math.random = rnd;
    const o = (function () { const t = __RT2.tree().orders || {}; let n = 0; (function w(x) { Object.keys(x || {}).forEach(k => { const v = x[k]; if (v && v.itemsArray) n++; else if (v && typeof v === 'object') w(v); }); })(t); return n; })();
    chk(o === 5, '22. 5 đơn đều lưu bình thường (chương trình không chặn thanh toán)', o);
    return R;
  }, [fake, CHUNG.toString()]).catch(async e => (await p.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
  inKq('pos.html (The cafe 33)', R, errs); await p.close();

  // ════ PosX.html (XOFA) ════
  ({ p, errs } = await moTrang(b, 'PosX.html', { width: 1280, height: 800 }));
  R = await p.evaluate(async ([fake, chung]) => {
    const { cap } = (eval('(' + chung + ')'))(fake);
    const R = []; window.__R = R; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x)));
    const sleep = ms => new Promise(r => setTimeout(r, ms)); const DB = window.__LXFS, G = GauNoel;
    await G.datCfg({ bat: true }); await G.luuKho('xofa', cap, 50);
    document.getElementById('cuph').value = '0933000111';
    const rnd = Math.random; Math.random = () => 0.99;
    _loyaltyAfterSave([{ name: 'Trà sữa', price: 30000, qty: 4 }, { name: 'Bánh', price: 20000, qty: 2, isFood: true }, { name: 'Tặng', price: 0, qty: 1, isFree: true }], 160000, 'XK1');
    await sleep(600);
    const d = DB['gau_noel_2026/0933000111'], ls = d ? Object.values(d.luot) : [];
    chk(ls.length === 2 && ls[0].ly === 4 && ls[0].tienNuoc === 120000 && ls[0].store === 'xofa' && ls[0].bill === 'XK1', 'X1. _loyaltyAfterSave (đơn đã lưu) → 4 ly tính tiền (bỏ Food, ly tặng) = 2 lượt', ls);
    chk(!document.getElementById('gn-ov') || document.getElementById('gn-ov').style.display !== 'flex', 'X2. XOFA không bật popup QR trên POS (QR ở màn hình phụ — chờ file)');
    Math.random = rnd;
    chk(typeof window.delOrderConfirm === 'function' && /3367/.test(String(window.delOrderConfirm)), 'X3. đã bọc delOrderConfirm (huỷ bill trả kho)');
    return R;
  }, [fake, CHUNG.toString()]).catch(async e => (await p.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
  inKq('PosX.html (XOFA)', R, errs); await p.close();

  // ════ posgieo.html (Gieo Gieo) ════
  ({ p, errs } = await moTrang(b, 'posgieo.html', { width: 1280, height: 800 }));
  R = await p.evaluate(async ([fake, chung]) => {
    const R = []; window.__R = R; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x)));
    if (!window.GauNoel) { chk(false, 'G0. trang không nạp được gau_noel_giangsinh.v1.js'); return R; }
    const { cap } = (eval('(' + chung + ')'))(fake);
    const sleep = ms => new Promise(r => setTimeout(r, ms)); const DB = window.__LXFS, G = GauNoel;
    if (window.GieoData) GieoData.storeId = () => 'gg01';
    await G.datCfg({ bat: true }); await G.luuKho('gg01', cap, 50);
    chk(window.GieoData && GieoData.REG.fs.gau_noel_2026 === 'X' && GieoData.REG.fs.gau_noel_2026_kho === 'X', 'G1. data_access v9 đăng ký gau_noel_2026* (X)');
    const rnd = Math.random; Math.random = () => 0.99;
    const order = { phone: '0944000111', itemsArray: [{ name: 'Cà phê', price: 25000, qty: 2 }, { name: 'Ly tem', price: 0, qty: 1, _vKey: 'v' }], total: 50000, method: 'TIỀN MẶT', date: '25/11/2026', time: '10:00' };
    try { assistFinalizeOrder(order, 'GB1'); } catch (e) { /* hàm gốc có thể lỗi vì Firebase giả — phần gấu vẫn chạy */ }
    await sleep(600);
    const ls = DB['gau_noel_2026/0944000111'] ? Object.values(DB['gau_noel_2026/0944000111'].luot) : [];
    chk(ls.length === 1 && ls[0].store === 'gg01' && ls[0].bill === 'GB1', 'G2. assistFinalizeOrder (sau khi lưu đơn) → 1 lượt ở gg01', ls);
    const LAY = { showLogo: true, fontSizeBody: 16 }; const c = buildReceiptContent(order, LAY);
    chk(c.some(x => x && x.type === 'gauNoel' && x.soLuot === 1), 'G3. bill in có khối "Quay trúng gấu Noel · 1 lượt"');
    const base = renderReceiptCanvas(c.filter(x => x.type !== 'gauNoel')), withQr = renderReceiptCanvas(c);
    chk(withQr.height > base.height + 150, 'G4. renderReceiptCanvas vẽ thêm QR cuối bill', [base.height, withQr.height]);
    window.__qr = withQr.toDataURL();
    chk(!buildReceiptContent(Object.assign({}, order, { phone: '' }), LAY).some(x => x && x.type === 'gauNoel'), 'G5. đơn không SĐT → bill không có QR');
    await G.datCfg({ bat: false });
    chk(!buildReceiptContent(order, LAY).some(x => x && x.type === 'gauNoel'), 'G6. đang TẮT → bill không có QR');
    Math.random = rnd;
    return R;
  }, [fake, CHUNG.toString()]).catch(async e => (await p.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
  if (OUT) { const u = await p.evaluate(() => window.__qr); if (u) fs.writeFileSync(path.join(OUT, 'gau_bill_gieo.png'), Buffer.from(u.split(',')[1], 'base64')); }
  inKq('posgieo.html (Gieo Gieo)', R, errs); await p.close();

  await b.close();
  console.log('FAIL: ' + tong.fail + ' / ' + (tong.ok + tong.fail));
  process.exit(tong.fail ? 1 : 0);
})();
