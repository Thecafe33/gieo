// E2E Gấu Noel 2026 (trình duyệt thật — cần Playwright + Chromium; không thuộc tests/run_all.sh)
//   node tools/gau_noel/e2e_gau.js [thư_mục_ảnh]
// pos.html: tab Quản lý (bật/tắt, kho) → thanh toán thật (saveOrderToFirebase) → popup QR → khung khách → Mở lượt tại quầy → Đổi quà; bed > 160K.
// PosX.html: _loyaltyAfterSave → bốc, màn hình phụ. kiosk.html: QR / Mở lượt tại quầy chiếu từ PosX. posgieo.html: assistFinalizeOrder → bốc, QR cuối bill (buildReceiptContent + renderReceiptCanvas).
// Firebase giả: tools/tet/e2e/mockfb.js + rtmem.js (RT) và lixi_fake_inpage.js (Firestore của bảng chương trình).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), E2E = path.join(ROOT, 'tools/tet/e2e'), OUT = process.argv[2] || '';
let mock = fs.readFileSync(path.join(E2E, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(E2E, 'rtmem.js'), 'utf8');
// posgieo: GieoData.install cần fstore.batch (Firestore giả thiếu) — thêm batch rỗng để app chạy tới POSPrinter
mock += "\n(function(){var f=firebase.firestore,FV=f.FieldValue;firebase.firestore=Object.assign(function(){var o=f();if(!o.batch)o.batch=function(){return{set(){},update(){},delete(){},commit(){return Promise.resolve();}};};return o;},{FieldValue:FV});})();\n";
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
    $('gn-ov').querySelector('[data-a=quay]').click(); await sleep(5800);
    chk(/Chưa trúng/.test($('gn-ov').textContent) && Object.values(DB['gau_noel_2026/' + P].luot)[0].opened === true, '9. Mở lượt tại quầy → vòng quay → trượt, lượt đã mở');
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
    // dashboard trong tab Gấu Noel
    switchMgrTab('gaunoel'); await sleep(800);
    const dash = $('gn-dash');
    chk(dash && /Dashboard Gấu Noel/.test(dash.textContent) && /Hôm nay đã tặng/.test(dash.textContent) && dash.querySelectorAll('.gd-w').length === 3, '15b. tab Gấu Noel có dashboard: hôm nay đã tặng + 3 thẻ quán', dash && dash.textContent.slice(0, 120));
    const rowP = [...dash.querySelectorAll('table tr')].find(tr => tr.textContent.includes(P));
    chk(rowP && /Kho từng kịch bản/.test(dash.textContent), '15c. bảng kho từng kịch bản + bảng khách có SĐT vừa nhận gấu', rowP && rowP.textContent);
    { const sh = document.createElement('div'); sh.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#fff;overflow:auto;padding:24px'; sh.appendChild(dash); document.body.appendChild(sh);
      await sleep(100); await window.__shot('gau_dashboard'); sh.remove(); }
    switchMgrTab('label'); await sleep(100);
    // bed > 160K (không tính ăn vặt)
    // bed: chỉ BILL LÚC VÀO ACTIVE BED (finalizeBedCheckIn → _pushPaidOrder có hàm done) mới xét «trên 160K = trúng chắc»
    const P2 = '0912000222', bk2 = { id: 'BKX', key: 'BKX', phone: P2, name: 'Khách bed', bedId: 'WAITING', status: 'chờ khách', start: '13:00', end: '23:00' };
    reset();
    for (let i = 0; i < 10; i++) addToCart('1h bed', 'M', 15000); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bánh tráng', 'M', 20000);
    const od2 = { id: Date.now(), createdAt: 0, sdt: P2, items: '', itemsArray: cart.slice(), total: 195000, paid: 195000, change: 0, method: 'Chuyển khoản', points: 0, bedId: '3', customerName: 'Khách bed' };
    await new Promise(res => _pushPaidOrder(od2, P2, bk2, false, function () { res(); })); await sleep(900);
    let d2 = DB['gau_noel_2026/' + P2], l2 = d2 ? Object.values(d2.luot) : [];
    chk(l2.length === 1 && l2[0].k === 'bed' && l2[0].win, '16. bill LÚC VÀO ACTIVE BED: 150K giờ bed + 25K nước = 175K (bỏ 20K ăn vặt) → trúng chắc', l2);
    $('gn-ov') && $('gn-ov').querySelector('[data-a=x]') && $('gn-ov').querySelector('[data-a=x]').click();
    const P3 = '0912000333';
    reset(); activeOrderingBedId = '4';
    for (let i = 0; i < 10; i++) addToCart('1h bed', 'M', 15000); addToCart('Bạc xỉu', 'M', 25000);
    $('kh-sdt').value = P3; saveOrderToFirebase('Chuyển khoản'); await sleep(900);
    chk(!DB['gau_noel_2026/' + P3], '17. bill GỌI THÊM giữa giờ bed 175K → KHÔNG xét bed 160K (1 ly → không lượt)');
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
    const ovx = () => document.getElementById('gn-ov'), mox = () => ovx() && ovx().style.display === 'flex';
    chk(mox() && /Khách quay ở đâu/.test(ovx().textContent) && !(__RT2.get('gau_noel_2026_kiosk/xofa') || {}).ev, 'X2. thanh toán xong → POS hỏi «Khách quay ở đâu?», màn hình phụ CHƯA hiện gì');
    ovx().querySelector('[data-a=nha]').click(); await sleep(200);
    Math.random = rnd;
    chk(typeof window.delOrderConfirm === 'function' && /3367/.test(String(window.delOrderConfirm)), 'X3. đã bọc delOrderConfirm (huỷ bill trả kho)');
    isAppSale = true; document.getElementById('cuph').value = '0933000999';
    _loyaltyAfterSave([{ name: 'Trà sữa', price: 30000, qty: 6 }], 180000, 'XAPP'); await sleep(500); isAppSale = false;
    chk(!DB['gau_noel_2026/0933000999'] && !mox(), 'X3b. đơn BÁN QUA APP → không lượt, không hỏi');
    document.getElementById('cuph').value = '0933000111';
    const K = () => __RT2.get('gau_noel_2026_kiosk/xofa') || {};
    chk(K().bat === true && K().ev && K().ev.loai === 'qr' && K().ev.soLuot === 2 && K().ev.sdt === '111', 'X4. màn hình phụ: ghi bat + sự kiện QR 2 lượt (SĐT chỉ 3 số cuối)', K());
    window.__kQr = JSON.parse(JSON.stringify(K()));
    // đơn 2: Quay tại quán → vòng quay POS + màn hình phụ ngay
    _loyaltyAfterSave([{ name: 'Trà sữa', price: 30000, qty: 2 }], 60000, 'XK2'); await sleep(600);
    chk(mox() && /Khách quay ở đâu/.test(ovx().textContent), 'X4b. đơn 2 → hỏi lại');
    ovx().querySelector('[data-a=quan]').click(); await sleep(300);
    chk(mox() && !!ovx().querySelector('.gn-vong') && K().ev.loai === 'mo', 'X4c. «Quay tại quán» → vòng quay trên POS, màn hình phụ hiện vòng quay', K().ev);
    ovx().querySelector('[data-a=x]').click(); await sleep(200);
    // mở lượt tại quầy từ khung khách → chiếu lên màn hình phụ
    document.getElementById('cuph').value = '0933000111'; try { renderCustomerInfo(0, 0); } catch (e) {}
    await sleep(900);
    const pn = document.getElementById('gn-panel'), bm = pn && pn.querySelector('[data-mo]');
    chk(!!bm && /Còn 3 lượt chưa quay/.test(pn.textContent), 'X5. nhập SĐT → khung Gấu Noel có «Mở lượt» (3 lượt)', pn && pn.textContent);
    if (bm) { bm.click(); await sleep(100); }
    chk(K().ev && K().ev.loai === 'mo', 'X6. bấm Mở lượt → màn hình phụ hiện «Mở lượt quay»');
    const q = document.getElementById('gn-ov') && document.getElementById('gn-ov').querySelector('[data-a=quay]');
    if (q) { q.click(); await sleep(300); }
    chk(K().ev && K().ev.loai === 'quay' && K().ev.win === false && !!document.querySelector('#gn-ov .gn-vong svg'), 'X7. bấm Quay → vòng quay trên POS + màn hình phụ quay cùng kết quả');
    await sleep(5800);
    chk(K().ev && K().ev.loai === 'ketqua' && K().ev.conLai === 2, 'X8. kết quả → màn hình phụ hiện kết quả, còn 2 lượt', K().ev);
    window.__kKq = JSON.parse(JSON.stringify(K()));
    ovx().querySelector('[data-a=x]') && ovx().querySelector('[data-a=x]').click(); await sleep(200);
    // quay TẠI QUẦY trúng gấu của chính quán → mã tự «Đã nhận» (không bấm Đổi quà)
    const P6 = '0933000666'; document.getElementById('cuph').value = P6;
    _loyaltyAfterSave([{ name: 'Trà sữa', price: 30000, qty: 6 }], 180000, 'XK6'); await sleep(600);
    ovx().querySelector('[data-a=quan]').click(); await sleep(300);
    for (let i = 0; i < 3; i++) { const b = ovx().querySelector('[data-a=quay]'); if (!b || b.style.display === 'none') break; b.click(); await sleep(5700); }
    const d6 = DB['gau_noel_2026/' + P6], q6 = Object.values(d6.qua || {});
    chk(q6.length >= 1 && q6.every(g => g.used === true && g.usedBy === 'quay tại quầy'), 'X9. đơn 6 ly quay tại quầy → trúng gấu XOFA → mã TỰ chuyển «Đã nhận»', q6);
    chk(DB['gau_noel_2026_kho/xofa'].doi >= 1 && DB['gau_noel_2026_kho/xofa'].ma[Object.keys(d6.qua)[0]].used === true, 'X10. sổ mã quán + kho đếm đã nhận cập nhật');
    ovx().querySelector('[data-a=x]').click(); await sleep(200);
    // nút «🧸 Đổi gấu» ở sidebar — giỏ trống vẫn đổi được
    const nut = document.querySelector('#sdb #gn-sdb-btn');
    nut.classList.add('on'); document.getElementById('sdb').classList.add('open'); document.getElementById('ov').classList.add('show'); await sleep(400);
    await window.__shot('gau_posx_sidebar'); document.getElementById('sdb').classList.remove('open'); document.getElementById('ov').classList.remove('show');
    chk(!!nut && /Đổi gấu/.test(nut.textContent), 'X11. sidebar PosX có nút «🧸 Đổi gấu» (góc trái trên)');
    const P7 = '0933000777'; document.getElementById('cuph').value = '';
    await G.boc({ store: 'xofa', sdt: P7, bill: 'XK7', ly: 6, tienNuoc: 180000 }, () => 0.99);   // trúng chắc (đơn nhiều ly), khách KHÔNG quay ở quán
    await G.mo(P7); await G.mo(P7); await G.mo(P7);                                               // khách tự quay trên app
    nut.click(); await sleep(200);
    chk(mox() && /Đổi gấu Noel/.test(ovx().textContent), 'X12. bấm nút → popup Đổi gấu Noel (nhập SĐT)');
    ovx().querySelector('#gn-dg-sdt').value = P7; ovx().querySelector('[data-a=tim]').click(); await sleep(400);
    const bd = ovx().querySelector('[data-doi]');
    chk(!!bd && /Đổi quà/.test(bd.textContent), 'X13. khách tự quay trên app → mã chờ nhận → có nút Đổi quà (không cần có món trong giỏ)');
    bd.click(); await sleep(500);
    chk(Object.values(DB['gau_noel_2026/' + P7].qua)[0].used === true && !ovx().querySelector('[data-doi]'), 'X14. Đổi quà trong popup → mã hết hiệu lực, dòng biến mất');
    ovx().querySelector('[data-a=x]').click();
    return R;
  }, [fake, CHUNG.toString()]).catch(async e => (await p.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
  const kQr = await p.evaluate(() => window.__kQr), kKq = await p.evaluate(() => window.__kKq);
  inKq('PosX.html (XOFA)', R, errs); await p.close();

  // ════ kiosk.html (màn hình phụ XOFA) ════
  ({ p, errs } = await moTrang(b, 'kiosk.html', { width: 1920, height: 1080 }));
  R = await p.evaluate(async ([kQr, kKq]) => {
    const R = []; window.__R = R; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x)));
    const sleep = ms => new Promise(r => setTimeout(r, ms)); const $ = id => document.getElementById(id);
    if (!window.GauNoel) { chk(false, 'K0. kiosk không nạp được gau_noel_giangsinh.v2.js'); return R; }
    const now = o => Object.assign({}, o, { ev: Object.assign({}, o.ev, { at: Date.now() }) });
    chk(!$('gn-k').classList.contains('on') && !$('gn-kb').classList.contains('on'), 'K1. chưa có dữ liệu → không hiện gì');
    await db.ref('gau_noel_2026_kiosk/xofa').set(now(kQr)); await sleep(150);
    chk($('gn-k').classList.contains('on') && /2 lượt/.test($('gn-k').textContent) && $('gn-k').querySelector('svg path') && /…111/.test($('gn-k').textContent), 'K2. sau thanh toán: QR + "2 lượt" + SĐT …111 ở khung phải', $('gn-k').textContent);
    chk($('gn-kb').classList.contains('on') && $('bed-voucher-banner').style.display === 'none', 'K3. đang bật: banner «quay trúng gấu bông» thay banner voucher bed cũ');
    await window.__shot('gau_kiosk_qr');
    await db.ref('session_display_xolifa').set({ state: 'idle', cart: [], total: 0 }); await sleep(100);
    chk($('gn-k').classList.contains('on'), 'K4. POS về «idle» 5 giây sau thanh toán → QR vẫn giữ');
    await db.ref('session_display_xolifa').set({ state: 'ordering', cart: [{ name: 'Trà', qty: 1, price: 30000 }], total: 30000 }); await sleep(100);
    chk(!$('gn-k').classList.contains('on') && $('orders-list').style.display !== 'none', 'K5. khách sau bắt đầu order → thu QR, hiện lại giỏ hàng');
    await db.ref('gau_noel_2026_kiosk/xofa').set(now(kKq)); await sleep(150);
    chk($('gn-k').classList.contains('on') && /Còn 2 lượt/.test($('gn-k').textContent) && $('gn-k').querySelector('.gn-vong'), 'K6. chiếu kết quả «Mở lượt tại quầy» (vòng quay + kết quả)', $('gn-k').textContent);
    await db.ref('gau_noel_2026_kiosk/xofa').set(now({ bat: true, ev: { loai: 'mo', sdt: '111' } })); await sleep(150);
    await db.ref('gau_noel_2026_kiosk/xofa').set(now({ bat: true, ev: { loai: 'quay', sdt: '111', win: true } })); await sleep(300);
    const kx = /rotate\(([-\d.]+)deg\)/.exec($('gn-k').querySelector('.gn-vong svg').style.transform);
    chk(kx && +kx[1] > 1800 && /Đang quay/.test($('gn-k').textContent), 'K6b. POS bấm Quay → vòng trên màn hình phụ quay', kx && kx[1]);
    await sleep(5500); await window.__shot('gau_kiosk_vong');
    let kth = ((-(+kx[1])) % 360 + 360) % 360; if (kth > 180) kth -= 360;
    chk(Math.abs(kth) < 50, 'K6c. vòng màn hình phụ dừng đúng ô «Gấu bông» như kết quả', kth);
    await db.ref('gau_noel_2026_kiosk/xofa').set(now({ bat: true, ev: { loai: 'ketqua', win: true, code: 'GAUAB2CD', store: 'xofa', conLai: 0 } })); await sleep(150);
    chk(/Trúng 1 gấu bông/.test($('gn-k').textContent) && /GAUAB2CD/.test($('gn-k').textContent) && /XOFA/.test($('gn-k').textContent), 'K7. trúng → gấu + mã + quán nhận');
    await window.__shot('gau_kiosk_trung');
    await db.ref('gau_noel_2026_kiosk/xofa/bat').set(false); await sleep(150);
    chk(!$('gn-k').classList.contains('on') && !$('gn-kb').classList.contains('on') && $('bed-voucher-banner').style.display === '', 'K8. TẮT → ẩn hết, kiosk về như cũ');
    await db.ref('gau_noel_2026_kiosk/xofa').set({ bat: true, ev: { loai: 'qr', soLuot: 1, at: Date.now() - 11 * 60e3 } }); await sleep(150);
    chk(!$('gn-k').classList.contains('on'), 'K9. sự kiện cũ hơn 10 phút (mở lại kiosk) → không hiện');
    return R;
  }, [kQr, kKq]).catch(async e => (await p.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
  inKq('kiosk.html (màn hình phụ XOFA)', R, errs); await p.close();

  // ════ posgieo.html (Gieo Gieo) ════
  ({ p, errs } = await moTrang(b, 'posgieo.html', { width: 1280, height: 800 }));
  R = await p.evaluate(async ([fake, chung]) => {
    const R = []; window.__R = R; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x)));
    if (!window.GauNoel) { chk(false, 'G0. trang không nạp được gau_noel_giangsinh.v2.js'); return R; }
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
    // hỏi «Khách quay ở đâu?» trước khi in
    const inRa = []; POSPrinter.autoPrintEnabled = true; POSPrinter.connected = true;
    POSPrinter.printOrder = o => { inRa.push(buildReceiptContent(o, LAY).some(x => x && x.type === 'gauNoel')); return Promise.resolve(); };
    const ov = () => document.getElementById('gn-ov'), mo = () => ov() && ov().style.display === 'flex';
    const oA = Object.assign({}, order, { phone: '0944000222' });
    try { assistFinalizeOrder(oA, 'GB2'); } catch (e) {}
    POSPrinter.autoPrintIfEnabled(oA); await sleep(300);
    chk(mo() && /Khách quay ở đâu/.test(ov().textContent) && inRa.length === 0, 'G7. đơn có lượt → hỏi «Khách quay ở đâu?», CHƯA in bill', ov() && ov().textContent);
    await window.__shot('gau_gieo_hoi');
    ov().querySelector('[data-a=nha]').click(); await sleep(300);
    chk(inRa.length === 1 && inRa[0] === true && !mo(), 'G8. «Quét mã ở nhà» → in bill CÓ QR, đóng popup', inRa);
    const oB = Object.assign({}, order, { phone: '0944000333' });
    try { assistFinalizeOrder(oB, 'GB3'); } catch (e) {}
    POSPrinter.autoPrintIfEnabled(oB); await sleep(300);
    ov().querySelector('[data-a=quan]').click(); await sleep(800);
    chk(inRa.length === 2 && inRa[1] === false, 'G9. «Quay tại quán» → bill in KHÔNG có QR (tiết kiệm giấy)', inRa);
    chk(mo() && !!ov().querySelector('.gn-vong') && !!ov().querySelector('[data-a=quay]'), 'G10. «Quay tại quán» → vòng quay mở ngay trên POS (không cần nhập lại SĐT)');
    ov().querySelector('[data-a=quay]').click(); await sleep(6000);
    chk(DB['gau_noel_2026/0944000333'] && Object.values(DB['gau_noel_2026/0944000333'].luot)[0].opened === true, 'G11. quay tại quán → lượt đã mở');
    ov().querySelector('[data-a=x]').click(); await sleep(100);
    POSPrinter.autoPrintIfEnabled(Object.assign({}, order, { phone: '' })); await sleep(200);
    chk(inRa.length === 3 && !mo(), 'G12. đơn không có SĐT → in luôn, không hỏi');
    chk(!!document.querySelector('#sdb #gn-sdb-btn'), 'G13. sidebar posgieo có nút «🧸 Đổi gấu»');
    const oApp = Object.assign({}, order, { phone: '0944000888', isAppSale: true });
    try { assistFinalizeOrder(oApp, 'GAPP'); } catch (e) {}
    POSPrinter.autoPrintIfEnabled(oApp); await sleep(400);
    chk(!DB['gau_noel_2026/0944000888'] && !mo() && inRa[inRa.length - 1] === false, 'G14. đơn BÁN QUA APP → không lượt, không hỏi, bill không QR');
    await G.datCfg({ bat: false });
    chk(!buildReceiptContent(order, LAY).some(x => x && x.type === 'gauNoel'), 'G6. đang TẮT → bill không có QR');
    Math.random = rnd;
    return R;
  }, [fake, CHUNG.toString()]).catch(async e => (await p.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
  if (OUT) { const u = await p.evaluate(() => window.__qr); if (u) fs.writeFileSync(path.join(OUT, 'gau_bill_gieo.png'), Buffer.from(u.split(',')[1], 'base64')); }
  inKq('posgieo.html (Gieo Gieo)', R, errs); await p.close();

  // ════ index_giangsinh.html (app khách) ════
  {
    const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errs2 = []; pg.on('pageerror', e => errs2.push(e.message)); pg.on('dialog', d => d.dismiss());
    await pg.exposeFunction('__shot', n => (OUT ? pg.screenshot({ path: path.join(OUT, n + '.png') }) : null));
    await pg.addInitScript(() => { try { localStorage.setItem('member_phone', '0955000111'); } catch (e) {} });
    await pg.route('**/*', r => { const u = r.request().url();
      if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
      if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
      if (u.includes('cdn.tailwindcss.com')) return r.fulfill({ contentType: 'application/javascript', body: twJs });
      if (u.startsWith('file:') || u.includes('fonts.g')) return r.continue(); return r.abort(); });
    await pg.goto('file://' + ROOT + '/index_giangsinh.html').catch(() => {}); await pg.waitForTimeout(2500);
    R = await pg.evaluate(async ([fake]) => {
      const R = []; window.__R = R; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x)));
      const sleep = ms => new Promise(r => setTimeout(r, ms)); const $ = id => document.getElementById(id);
      if (!window.GauNoel) { chk(false, 'I0. index_giangsinh không nạp gau_noel_giangsinh.v2.js'); return R; }
      eval(fake); const F = window.__lxFake, DB = window.__LXFS, G = GauNoel;
      // Firestore giả + nghe doc (onSnapshot)
      const LS = [], oc = F.fstore.collection, ot = F.fstore.runTransaction;
      const bao = () => LS.forEach(l => l.r.get().then(l.cb));
      F.fstore.collection = c => { const col = oc(c), od = col.doc; col.doc = id => { const r = od(id); r.onSnapshot = cb => { const l = { r, cb }; LS.push(l); setTimeout(() => r.get().then(cb), 0); return () => { const i = LS.indexOf(l); if (i >= 0) LS.splice(i, 1); }; }; return r; }; return col; };
      F.fstore.runTransaction = fn => ot(fn).then(v => { bao(); return v; });
      G.init({ fstore: F.fstore, FieldValue: F.FieldValue }); G._setOffset(Date.parse('2026-11-25T15:00:00+07:00') - Date.now());
      const w = $('welcome-popup'); if (w) { w.classList.add('hidden'); w.style.display = 'none'; }
      const P = '0955000111';
      DB['gau_noel_2026/' + P] = { sdt: P, luot: {
          xofa_b1_0: { store: 'xofa', bill: 'b1', at: '2026-11-25T03:00:00.000Z', win: true, code: 'GAUAB2CD', k: 'v45', w: 'W1', opened: false },
          xofa_b1_1: { store: 'xofa', bill: 'b1', at: '2026-11-25T03:00:00.000Z', win: false, code: '', k: '', w: 'W1', opened: false },
          tc33_b0_0: { store: 'tc33', bill: 'b0', at: '2026-11-20T03:00:00.000Z', win: true, code: 'GAUZZ9YY', k: 'bed', w: 'W0', opened: true } },
        qua: { GAUAB2CD: { store: 'xofa', bill: 'b1', luot: 'xofa_b1_0', at: '2026-11-25T03:00:00.000Z', used: false },
          GAUZZ9YY: { store: 'tc33', bill: 'b0', luot: 'tc33_b0_0', at: '2026-11-20T03:00:00.000Z', used: true, usedAt: '2026-11-21T03:00:00.000Z' } } };
      let okW = true, okL = true; for (let i = 0; i < 2000; i++) { const w = G._vong.gocDung(true, Math.random), l = Math.abs(G._vong.gocDung(false, Math.random)); if (!(Math.abs(w) <= 50)) okW = false; if (!(l >= 62 && l <= 66)) okL = false; }
      chk(G._vong.O === 3 && okW && okL, 'I0. vòng 3 ô; 2000 lần: trúng luôn trong ô Gấu bông, trượt luôn sát mép Gấu bông 2–6°');
      G.apCfg(null); G.khachBat(); await sleep(300);
      chk(!$('gn-q').classList.contains('on') && $('gn-the').style.display === 'none', 'I1. chương trình TẮT → không popup, không thẻ, không đọc lượt');
      G.apCfg({ bat: true }); G.khachBat(); await sleep(1500);
      chk($('gn-q').classList.contains('on') && /2 lượt quay/.test($('gn-q').textContent), 'I2. có lượt → popup «Bạn có 2 lượt quay»', $('gn-q').textContent);
      const the = $('gn-the');
      chk(the.style.display === 'block' && /2 lượt/.test(the.textContent) && !/GAUAB2CD/.test(the.textContent) && /GAUZZ9YY/.test(the.textContent) && /Đã nhận/.test(the.textContent), 'I3. thẻ dưới thẻ thành viên: 2 lượt chưa quay; gấu của lượt chưa quay CHƯA lộ mã; gấu đã nhận hiện «Đã nhận»', the.textContent);
      chk(the.previousElementSibling && the.previousElementSibling.classList.contains('card-gradient'), 'I4. thẻ nằm ngay dưới thẻ thành viên');
      await window.__shot('gau_khach_popup');
      $('gn-q').querySelector('[data-a=quay]').click(); await sleep(600);
      const xoay = () => { const m = /rotate\(([-\d.]+)deg\)/.exec($('gn-q').querySelector('.gn-vong svg').style.transform); return m ? +m[1] : 0; };
      chk(/Đang quay/.test($('gn-q').textContent) && xoay() > 1800, 'I5. bấm Quay → vòng quay quay (≥ 5 vòng)', xoay());
      await sleep(5200);
      const kim = () => { let th = ((-xoay()) % 360 + 360) % 360; if (th > 180) th -= 360; return th; };   // góc dưới kim, 0 = giữa ô Gấu bông
      chk(Math.abs(kim()) < 50, 'I5b. trúng → kim dừng TRONG ô «Gấu bông»', kim());
      await window.__shot('gau_khach_trung');
      chk(/trúng 1 gấu bông/i.test($('gn-q').textContent) && /GAUAB2CD/.test($('gn-q').textContent) && /XOFA/.test($('gn-q').textContent) && DB['gau_noel_2026/' + P].luot.xofa_b1_0.opened === true, 'I6. mở lượt cũ nhất → trúng: mã GAUAB2CD, nhận tại XOFA', $('gn-q').textContent);
      await window.__shot('gau_khach_trung');
      await sleep(200);
      chk(/GAUAB2CD/.test(the.textContent) && /1 lượt/.test(the.textContent), 'I7. thẻ cập nhật: hiện mã vừa trúng, còn 1 lượt');
      $('gn-q').querySelector('[data-a=quay]').click(); await sleep(6000);
      const k2 = Math.abs(kim());
      chk(k2 > 60 && k2 <= 66.5, 'I8a. trượt → kim dừng NGOÀI ô Gấu bông nhưng SÁT MÉP (2–6°)', kim());
      await window.__shot('gau_khach_truot');
      chk(/Chưa trúng/.test($('gn-q').textContent) && /hết lượt/.test($('gn-q').textContent) && !$('gn-q').querySelector('[data-a=quay]'), 'I8. lượt 2 trượt → hết lượt, không còn nút Quay');
      $('gn-q').querySelector('[data-a=x]').click(); await sleep(300);
      chk(!$('gn-q').classList.contains('on') && !/lượt\s*chưa quay/.test(the.textContent), 'I9. đóng popup; thẻ không còn dòng lượt chưa quay');
      showTab('user'); await sleep(200); the.scrollIntoView(); await sleep(200); await window.__shot('gau_khach_the');
      // nhận lượt mới khi đang mở app → popup tự hiện
      await G.docKhach(P).set({ luot: { gg01_b9_0: { store: 'gg01', bill: 'b9', at: '2026-11-25T08:00:00.000Z', win: false, code: '', k: '', w: 'W1', opened: false } } }, { merge: true });
      LS.forEach(l => l.r.get().then(l.cb)); await sleep(1500);
      chk($('gn-q').classList.contains('on') && /1 lượt quay/.test($('gn-q').textContent), 'I10. vừa thanh toán xong (lượt mới) → popup tự hiện', [$('gn-q').className, $('gn-q').textContent, LS.length, JSON.stringify(DB['gau_noel_2026/' + P].luot.gg01_b9_0), the.textContent]);
      $('gn-q').querySelector('[data-a=x]').click();
      G.apCfg({ bat: false }); G.khachBat(); await sleep(200);
      chk(the.style.display === 'none', 'I11. TẮT chương trình → ẩn thẻ');
      return R;
    }, [fake]).catch(async e => (await pg.evaluate(() => window.__R || []).catch(() => [])).concat(['FAIL dừng giữa chừng: ' + e.message.split('\n')[0]]));
    inKq('index_giangsinh.html (app khách)', R, errs2); await pg.close();
  }

  await b.close();
  console.log('FAIL: ' + tong.fail + ' / ' + (tong.ok + tong.fail));
  process.exit(tong.fail ? 1 : 0);
})();
