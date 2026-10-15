// E2E PosX_tet.html (XOFA): upsize + giảm 5K, thanh toán thật (confirmPay → push đơn → _loyaltyAfterSave)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..'), OUT = process.argv[2] || '';   // OUT: thư mục lưu ảnh chụp (tuỳ chọn)
const S = OUT;
let mock = fs.readFileSync(path.join(__dirname, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(__dirname, 'rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:20000,priceL:26000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:22000,priceL:27000},den:{name:'Đen đá',type:'Cà phê',priceM:15000}});" +
  "__RT2.put('menu_togo_xolifa',{cf1:{name:'Cafe muối',type:'Cà phê',priceM:18000,priceL:22000},bx:{name:'Bạc xỉu',type:'Cà phê',priceM:20000,priceL:25000},den:{name:'Đen đá',type:'Cà phê',priceM:14000}});\n";
const fake = fs.readFileSync(path.join(__dirname, 'lixi_fake_inpage.js'), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.exposeFunction('__shot', n => (OUT ? o => p.screenshot(o) : async () => {})({ path: path.join(OUT, n + '.png') }));
  await p.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if (u.startsWith('file:') || u.includes('fonts.g')) return r.continue(); return r.abort(); });
  await p.goto('file://' + ROOT + '/PosX_tet.html'); await p.waitForTimeout(2500);
  const res = await p.evaluate(async (fake) => {
    eval(fake); const F = window.__lxFake; LiXi.init({ fstore: F.fstore, FieldValue: F.FieldValue });
    const setDay = iso => LiXi._setOffset(Date.parse(iso + '+07:00') - Date.now());
    setDay('2027-02-09T10:00:00');
    const R = []; const chk = (c, m, extra) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const TL = []; const _t = window.toast; window.toast = m => { TL.push(String(m)); try { _t(m); } catch (e) {} };
    const tl = () => TL.splice(0).join(' | ');
    const DB = window.__LXFS; let n = 0;
    const mkPhone = () => '08' + String(10000000 + (++n)).slice(-8);
    const seed = (P, codes) => { DB['lixi_tet_2027/' + P] = { phone: P, extra: 0, codes }; };
    const M = id => getActiveMenu().find(x => x.id === id), SZ = (id, l) => M(id).sizes.find(s => s.label === l);
    const add = (id, l) => addCart(M(id), SZ(id, l));
    const line = () => cart.__lixi__;
    const btn = id => document.querySelector('#lixi-panel-x .lx-btn[data-id="' + id + '"]');
    async function ap(id) { const x = btn(id); if (!x) return false; x.click(); await sleep(250); return true; }
    async function phone(P) { document.getElementById('cuph').value = P; curCustomer = { phone: P, name: 'Khách', note: '', myGifts: {} }; renderCustomerInfo(0, 0); await sleep(500); }
    const reset = () => { if (isToGo) toggleTogo(); cart = {}; _appliedDiscountId = null; updFooter(); document.getElementById('cuph').value = ''; tl(); };
    const orders = () => { const t = (__RT2.tree().orders_xolifa) || {}; const out = []; (function w(o) { Object.keys(o || {}).forEach(k => { const v = o[k]; if (v && v.itemsArray) out.push(v); else if (v && typeof v === 'object') w(v); }); })(t); return out; };
    async function pay() { const before = orders().length; curPay = 'bank'; confirmPay(null, null); await sleep(600); const o = orders(); return o.length > before ? o[o.length - 1] : null; }

    const upLine = () => Object.values(cart).find(c => c._lixiCode && /^upsize/.test(c._lixiType));
    const pickBtns = () => [...document.querySelectorAll('#xl-pick-list > button')];
    const modalOpen = () => document.getElementById('xl-pick-modal').style.display === 'flex';
    async function pick(name, size) { const b = pickBtns().find(x => x.textContent.includes(name) && (!size || x.textContent.includes('(' + size))); if (!b) return false; b.click(); await sleep(150); return true; }

    // 1. chọn món xong → nhập SĐT → bấm mã upsize → popup chọn ly M → ly đó lên L GIỮ GIÁ M, tag dưới món
    reset(); let P = mkPhone(); seed(P, { TETXU001: { type: 'upsize_xofa', at: 'x' }, TETXG001: { type: 'giam5k_xofa', at: 'x' }, TETTC001: { type: 'upsize_tc33', at: 'x' }, TETBD001: { type: 'bed1h', at: 'x' } });
    add('cf1', 'M'); add('cf1', 'M'); add('den', 'M'); await phone(P);
    chk(document.getElementById('lixi-panel-x').style.display === 'block' && btn('TETXU001') && btn('TETXG001'), '1a. nhập SĐT → khung hiện 2 mã XOFA');
    chk(!btn('TETTC001') && !btn('TETBD001'), '1b. mã The cafe 33 (upsize / +1h bed) KHÔNG hiện ở XOFA');
    chk(/Upsize lên L miễn phí khi mua M/.test(document.getElementById('lixi-panel-x').textContent), '1c. chữ: "Upsize lên L miễn phí khi mua M"');
    await ap('TETXU001');
    chk(modalOpen() && pickBtns().length === 1 && /Cafe muối/.test(pickBtns()[0].textContent) && !upLine(), '1d. bấm mã → popup chọn ly (chỉ ly có size L: Cafe muối; Đen đá không có L), giỏ chưa đổi', pickBtns().map(b => b.textContent));
    await window.__shot('lx_posx_pick');
    await pick('Cafe muối');
    chk(!modalOpen() && cart.cf1_M && cart.cf1_M.qty === 1 && cart.cf1_M_lxL && cart.cf1_M_lxL.size === 'L' && cart.cf1_M_lxL.price === 20000, '1e. chọn ly → 1 ly M + 1 ly L giá M 20.000 (pha chế thấy size L)', cart);
    chk(!line() && !Object.values(cart).some(c => c.price < 0) && getFinalTotal() === 55000, '1f. KHÔNG có dòng "−6.000đ" — tổng 55.000 = 2 ly M + Đen đá', [getFinalTotal()]);
    chk(cartCupCount() === 3, '1g. tem tính đủ 3 ly');
    openCartDrawer(); await sleep(300);
    const row1 = document.querySelector('#cartBody button.cart-del[onclick="cartDel(\'cf1_M_lxL\')"]').closest('.cart-row');
    chk(row1.querySelector('.lx-itag') && /Upsize M→L miễn phí/.test(row1.textContent) && [...row1.querySelectorAll('.cqb')].every(b => b.style.visibility === 'hidden'), '1h. giỏ: tag "🧧 Lì xì Tết · Upsize M→L miễn phí" ngay dưới ly L, ly đó không bấm +/−', row1.textContent.replace(/\s+/g, ' '));
    await window.__shot('lx_posx_upsize'); closeCartDrawer(); await sleep(300);
    let o = await pay(); await sleep(300);
    chk(o && o.total === 55000 && o.itemsArray.some(i => i._lixiCode === 'TETXU001' && i.size === 'L' && i.price === 20000), '1i. thanh toán → đơn 55.000, ly L giá 20.000 mang mã', o && [o.total, o.items]);
    let d = DB['lixi_tet_2027/' + P];
    chk(d.codes.TETXU001.used && d.codes.TETXU001.usedStore === 'xofa' && d.codes.TETXU001.usedAmount === 6000 && d.codes.TETXU001.usedBill, '1j. mã đã dùng ở XOFA, ưu đãi 6.000 (chênh M→L), có mã bill', d.codes.TETXU001);
    chk(d.extra === 1, '1k. +1 lượt mở bao', d.extra);
    chk(Object.keys(cart).length === 0, '1l. giỏ trống sau thanh toán');

    // 2. 1 ly M → chọn → thành L; ✕ trên tag → về M
    reset(); P = mkPhone(); seed(P, { TETXU002: { type: 'upsize_xofa', at: 'x' }, TETXG002: { type: 'giam5k_xofa', at: 'x' } });
    add('bx', 'M'); await phone(P); await ap('TETXU002'); await pick('Bạc xỉu');
    chk(!cart.bx_M && cart.bx_M_lxL && cart.bx_M_lxL.size === 'L' && cart.bx_M_lxL.price === 22000 && getFinalTotal() === 22000, '2. 1 ly Bạc xỉu M → thành L giá 22.000', cart);
    openCartDrawer(); await sleep(200);
    document.querySelector('#cartBody .lx-itag button').click(); await sleep(100); closeCartDrawer();
    chk(!upLine() && cart.bx_M && cart.bx_M.qty === 1 && cart.bx_M.size === 'M' && getFinalTotal() === 22000, '2b. ✕ trên tag → ly về M', cart);
    // ly upsize bị tăng số lượng → phần dư thành ly L giá L; bỏ mã → 1 M + 1 L
    await ap('TETXU002'); await pick('Bạc xỉu'); cartAdj('bx_M_lxL', 1);
    chk(cart.bx_M_lxL.qty === 1, '2c. ly lì xì không tăng số lượng được (+ bị chặn)');
    cart.bx_M_lxL.qty++; updFooter();
    chk(cart.bx_M_lxL.qty === 1 && cart.bx_L && cart.bx_L.qty === 1 && cart.bx_L.price === 27000 && getFinalTotal() === 49000, '2d. lỡ thành 2 ly → ly thứ 2 tính giá L 27.000', cart);
    await ap('TETXU002');
    chk(!upLine() && cart.bx_M && cart.bx_M.qty === 1 && cart.bx_L && cart.bx_L.qty === 1 && getFinalTotal() === 49000, '2e. "Bỏ" trên khung → 1 M + 1 L thường', cart);

    // 3. món không có L → báo; đóng popup không chọn → giữ nguyên
    reset(); add('den', 'M'); await phone(P); await ap('TETXU002');
    chk(!modalOpen() && !upLine() && /upsize được/.test(tl()), '3. món không có size L → báo, không mở popup');
    add('cf1', 'M'); await ap('TETXU002'); xlPickModalClose(); await sleep(50);
    chk(!upLine() && getFinalTotal() === 35000, '3b. mở popup rồi đóng không chọn → giỏ giữ nguyên');
    // 4. ly L có sẵn → chọn → tính giá M
    reset(); add('cf1', 'L'); await phone(P); await ap('TETXU002'); await pick('Cafe muối', 'L');
    chk(upLine() && upLine().size === 'L' && upLine().price === 20000 && getFinalTotal() === 20000, '4. ly L có sẵn → tính giá M 20.000', cart);
    // 5. xoá ly upsize → mã rời bill
    cartDel(Object.keys(cart).find(k => cart[k]._lixiCode)); await sleep(100);
    chk(!upLine() && getFinalTotal() === 0, '5. xoá ly upsize → mã rời bill, không trừ gì');

    // 6. giảm 5K: đơn < 30K từ chối, ≥ 30K áp
    reset(); add('cf1', 'M'); await phone(P); await ap('TETXG002');
    chk(!line() && /từ 30\.000/.test(tl()), '6a. đơn 20.000 < 30.000 → không áp giảm 5K');
    add('cf1', 'M'); await ap('TETXG002');
    chk(line() && line().price === -5000 && getFinalTotal() === 35000, '6b. đơn 40.000 → giảm 5.000 = 35.000', getFinalTotal());
    openCartDrawer(); await sleep(200);
    chk(/Lì xì Tết · Giảm 5K đơn từ 30K/.test(document.getElementById('cartBody').textContent), '6b2. giỏ ghi rõ "Lì xì Tết · Giảm 5K đơn từ 30K" (giảm toàn đơn)', document.getElementById('cartBody').textContent.replace(/\s+/g, ' ').slice(0, 160));
    closeCartDrawer(); await sleep(200);
    // giảm số ly xuống dưới 30K → tự bỏ
    cart.cf1_M.qty = 1; updFooter(); await sleep(50);
    chk(!line() && /chưa tới/.test(tl()), '6c. bớt ly còn 20.000 → mã tự bỏ + báo');
    add('cf1', 'M'); await ap('TETXG002');
    o = await pay(); await sleep(300);
    chk(o && o.total === 35000 && DB['lixi_tet_2027/' + P].codes.TETXG002.used, '6d. thanh toán 35.000, mã đã dùng', o && o.total);

    // 7. To Go: giá To Go
    reset(); P = mkPhone(); seed(P, { TETXU003: { type: 'upsize_xofa', at: 'x' } });
    toggleTogo(); add('cf1', 'M'); add('cf1', 'M'); await phone(P); await ap('TETXU003'); await pick('Cafe muối');
    chk(isToGo && upLine() && upLine().price === 18000 && upLine()._lixiLPrice === 22000 && getFinalTotal() === 36000, '7a. To Go: ly L giá M To Go 18.000', cart);
    toggleTogo(); await sleep(100);
    chk(!isToGo && !upLine() && cart.cf1_M && cart.cf1_M.qty === 2 && cart.cf1_M.price === 20000 && !cart.cf1_M_lxL, '7b. đổi To Go → Tại quán: gỡ lì xì, 2 ly M giá Tại quán', cart);

    // 8. đang áp mã giảm giá thường → lì xì từ chối; đang áp lì xì → mã thường từ chối
    reset(); P = mkPhone(); seed(P, { TETXG003: { type: 'giam5k_xofa', at: 'x' } });
    add('cf1', 'M'); add('cf1', 'M'); await phone(P);
    _appliedDiscountId = 'abc'; await ap('TETXG003');
    chk(!line() && /mã giảm giá khác/.test(tl()), '8a. bill đang có mã giảm giá thường → không áp thêm lì xì');
    _appliedDiscountId = null; await ap('TETXG003');
    applyDiscountCode();
    chk(line() && /bỏ lì xì trước/.test(tl()), '8b. đang áp lì xì → không nhập được mã giảm giá thường');

    // 9. mã vừa dùng ở máy khác
    reset(); P = mkPhone(); seed(P, { TETXG004: { type: 'giam5k_xofa', at: 'x' } });
    add('cf1', 'M'); add('cf1', 'M'); await phone(P);
    DB['lixi_tet_2027/' + P].codes.TETXG004.used = true; await ap('TETXG004');
    chk(!line() && /vừa được dùng/.test(tl()), '9. mã vừa dùng ở máy khác → báo, không trừ');

    // 10. chặn trước thanh toán
    reset(); P = mkPhone(); seed(P, { TETXG005: { type: 'giam5k_xofa', at: 'x' } });
    add('cf1', 'M'); add('cf1', 'M'); await phone(P); await ap('TETXG005');
    cart.cf1_M.qty = 1;                                   // sửa thẳng, chưa vẽ lại
    o = await pay();
    chk(!o && !line() && /chưa tới/.test(tl()), '10. giỏ không còn đủ điều kiện → thanh toán bị chặn, gỡ mã');

    // 11. ngoài hạn
    reset(); P = mkPhone(); seed(P, { TETXG006: { type: 'giam5k_xofa', at: 'x' } });
    setDay('2027-02-16T08:00:00'); await phone(P);
    chk(document.getElementById('lixi-panel-x').style.display === 'none', '11. mùng 11 → không hiện mã');
    setDay('2027-02-09T10:00:00');
    // 12. bill thường không lì xì
    reset(); add('bx', 'M'); o = await pay();
    chk(o && o.total === 22000, '12. bill không lì xì thanh toán bình thường');
    return R;
  }, fake);
  console.log(res.join('\n'));
  const nf = res.filter(x => x.startsWith('FAIL')).length; process.exitCode = nf ? 1 : 0;
  console.log('FAIL:', res.filter(x => x.startsWith('FAIL')).length, '/', res.length);
  console.log('pageerrors', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
