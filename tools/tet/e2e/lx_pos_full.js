// E2E pos_tet.html: áp đủ loại mã lì xì + thanh toán thật (saveOrderToFirebase → _pushPaidOrder → lixiAfterPaid)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..'), OUT = process.argv[2] || '';   // OUT: thư mục lưu ảnh chụp (tuỳ chọn)
const S = OUT;
let mock = fs.readFileSync(path.join(__dirname, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(__dirname, 'rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu',[{name:'Bạc xỉu',type:'Cà phê',priceM:25000,priceL:30000},{name:'Trà đào',type:'Trà',priceM:30000,priceL:36000},{name:'Cà phê đen',type:'Cà phê',priceM:20000},{name:'1h bed',type:'Bed',priceM:15000},{name:'1h bed từ h5',type:'Bed',priceM:10000}]); __RT2.put('bed_closing_time','20:50');\n";
const fake = fs.readFileSync(path.join(__dirname, 'lixi_fake_inpage.js'), 'utf8');
const tw = (fs.existsSync(path.join(__dirname, 'pos_tw.css')) ? fs.readFileSync(path.join(__dirname, 'pos_tw.css'), 'utf8') : '');
const twJs = 'document.head.insertAdjacentHTML("beforeend", ' + JSON.stringify('<style>' + tw + '</style>') + ');';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
  const errs = [], dlg = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => { dlg.push(d.message()); d.dismiss(); });
  await p.exposeFunction('__dlgs', () => dlg.splice(0));
  await p.exposeFunction('__shot', n => (OUT ? o => p.screenshot(o) : async () => {})({ path: path.join(OUT, n + '.png') }));
  await p.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if (u.includes('cdn.tailwindcss.com')) return r.fulfill({ contentType: 'application/javascript', body: twJs });
    if (u.startsWith('file:') || u.includes('fonts.g')) return r.continue(); return r.abort(); });
  await p.goto('file://' + ROOT + '/pos_tet.html'); await p.waitForTimeout(2500);
  const res = await p.evaluate(async (fake) => {
    eval(fake); const F = window.__lxFake; LiXi.init({ fstore: F.fstore, FieldValue: F.FieldValue });
    const setDay = iso => LiXi._setOffset(Date.parse(iso + '+07:00') - Date.now());
    setDay('2027-02-09T10:00:00');
    const R = []; const chk = (c, m, extra) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const DB = window.__LXFS; let n = 0;
    const mkPhone = () => '09' + String(10000000 + (++n)).slice(-8);
    const seed = (P, codes) => { DB['lixi_tet_2027/' + P] = { phone: P, extra: 0, codes }; };
    const lixiLine = () => cart.find(c => c._lixiCode);
    const sum = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
    const btn = id => document.querySelector('#lixi-panel .lx-btn[data-id="' + id + '"]');
    const reset = () => { cart = []; pendingBedOrder = null; isCheckoutFlow = false; const pl = document.getElementById('cart-bed-info'); if (pl) pl.remove(); renderCart(); document.getElementById('kh-sdt').value = ''; };
    async function phone(P) { document.getElementById('kh-sdt').value = P; checkSdtLive(); await sleep(900); }
    async function ap(id) { const x = btn(id); if (!x) return false; x.click(); await sleep(250); return true; }
    const orders = () => { const t = __RT2.tree().orders || {}; const out = []; (function walk(o) { Object.keys(o || {}).forEach(k => { const v = o[k]; if (v && v.itemsArray) out.push(v); else if (v && typeof v === 'object') walk(v); }); })(t); return out; };
    async function pay() { const before = orders().length; saveOrderToFirebase('Chuyển khoản'); await sleep(500); const o = orders(); return o.length > before ? o[o.length - 1] : null; }
    const DL = []; window.alert = m => DL.push(String(m)); const dl = async () => DL.splice(0).join(' | ');
    function mkBooking(key, start, end, P, extra) {
      const bk = Object.assign({ id: key, key, path: 'bedBookings/2027/02/09/' + key, date: '09/02/2027', start, end, phone: P, name: 'Khách', type: 'app', bedId: '2', status: 'active', createdAt: Date.now() - 86400000 }, extra || {});
      __RT2.put(bk.path, Object.assign({}, bk, { id: null, key: null, path: null }));
      globalAllBookings = (globalAllBookings || []).concat([bk]); return bk;
    }
    // mở lịch đúng như nhân viên bấm "Gọi món" ở thẻ bed (showBedDetail → _doShowBedDetail: SĐT, giờ bed, pill order bed)
    async function openBooking(bk) { activeOrderingBedId = bk.bedId; pendingBedOrder = bk; _doShowBedDetail(bk, bk.bedId); await sleep(900); document.getElementById('app-modal') && document.getElementById('app-modal').classList.add('hidden'); }
    const pillTxt = () => { const pl = document.getElementById('cart-bed-info'); return pl ? pl.textContent.replace(/\s+/g, ' ') : ''; };

    const pickRows = () => [...document.querySelectorAll('#pick-cart-list > div')];
    async function pick(name, size) {     // popup chọn ly upsize
      const row = pickRows().find(r => r.textContent.includes(name) && (!size || r.textContent.includes('(' + size)));
      if (!row) return false; row.querySelector('button').click(); await sleep(150); return true;
    }
    const modalOpen = () => { const m = document.getElementById('modal-pick-cart-item'); return m && m.style.display === 'flex'; };
    const rowOf = it => document.getElementById('cart-list').children[cart.indexOf(it)];

    // ── 1. Upsize TC33: khách mua Bạc xỉu M ×2 → bấm mã → popup chọn ly → 1 ly lên L GIỮ GIÁ M, tag dưới món ──
    reset(); let P = mkPhone(); seed(P, { TETUPA01: { type: 'upsize_tc33', at: 'x' }, TETXOF01: { type: 'upsize_xofa', at: 'x' }, TETXOF02: { type: 'giam5k_xofa', at: 'x' } });
    addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000); addToCart('Cà phê đen', 'M', 20000);
    await phone(P);
    chk(document.getElementById('lixi-panel').style.display === 'block' && !!btn('TETUPA01'), '1a. nhập SĐT → khung lì xì hiện mã upsize The cafe 33');
    chk(!btn('TETXOF01') && !btn('TETXOF02'), '1b. mã của XOFA KHÔNG hiện ở The cafe 33');
    chk(/Upsize lên L miễn phí khi mua M/.test(document.getElementById('lixi-panel').textContent), '1c. chữ trên mã: "Upsize lên L miễn phí khi mua M"');
    await ap('TETUPA01');
    chk(modalOpen() && pickRows().length === 1 && /Bạc xỉu/.test(pickRows()[0].textContent) && cart.every(c => !c._lixiCode), '1d. bấm Áp → popup chọn ly (chỉ ly có size L: Bạc xỉu, không có Cà phê đen), chưa đổi giỏ', pickRows().map(r => r.textContent));
    await window.__shot('lx_pos_pick');
    await pick('Bạc xỉu');
    const mLine = cart.find(c => c.name === 'Bạc xỉu' && c.size === 'M'), lLine = cart.find(c => c.name === 'Bạc xỉu' && c.size === 'L');
    chk(!modalOpen() && mLine && mLine.qty === 1 && lLine && lLine.qty === 1 && lLine.price === 25000 && lLine._lixiCode === 'TETUPA01', '1e. chọn ly → 1 ly M + 1 ly L giá M 25.000 (pha chế thấy size L)', cart);
    chk(!cart.some(c => c.price < 0) && sum() === 70000 && currentTotal === 70000, '1f. KHÔNG có dòng "−xK" — tổng 70.000 = 2 ly M + cà phê đen', [sum(), currentTotal]);
    const tag1 = rowOf(lLine) && rowOf(lLine).querySelector('.lx-itag');
    chk(tag1 && /Upsize M→L miễn phí/.test(tag1.textContent) && /30,000đ/.test(tag1.textContent), '1g. tag "🧧 Lì xì Tết · Upsize M→L miễn phí" gắn ngay dưới ly L (giá L gạch)', tag1 && tag1.textContent);
    await window.__shot('lx_pos_upsize');
    chk(btn('TETUPA01').textContent === 'Bỏ', '1h. nút trên khung đổi thành "Bỏ"');
    let o = await pay();
    chk(o && o.total === 70000 && o.itemsArray.some(i => i._lixiCode === 'TETUPA01' && i.size === 'L' && i.price === 25000), '1i. thanh toán: đơn 70.000, ly L giá 25.000 mang mã', o && [o.total, o.items]);
    await sleep(300);
    let d = DB['lixi_tet_2027/' + P];
    chk(d.codes.TETUPA01.used === true && d.codes.TETUPA01.usedStore === 'tc33' && d.codes.TETUPA01.usedAmount === 5000, '1j. mã đã dùng ở The cafe 33, ưu đãi 5.000 (chênh M→L)', d.codes.TETUPA01);
    chk(d.extra === 1 && d.earned === 1, '1k. đơn có SĐT (mùng 4, trong đợt phát) → +1 lượt mở bao', [d.extra, d.earned]);
    await phone(P); chk(!btn('TETUPA01'), '1l. mã đã dùng không hiện lại');
    await dl();

    // ── 2. Upsize: giỏ không có món nào có size L → báo, không mở popup ──
    reset(); P = mkPhone(); seed(P, { TETUPA02: { type: 'upsize_tc33', at: 'x' } });
    addToCart('Cà phê đen', 'M', 20000); await phone(P); await ap('TETUPA02');
    chk(!modalOpen() && !lixiLine() && sum() === 20000 && /upsize được/.test(await dl()), '2. giỏ không có ly nào có size L → báo, không trừ');
    // đóng popup không chọn → giỏ giữ nguyên
    addToCart('Bạc xỉu', 'M', 25000); await ap('TETUPA02'); closePickCartModal(); await sleep(50);
    chk(!lixiLine() && sum() === 45000, '2b. mở popup rồi đóng không chọn → giỏ giữ nguyên');

    // ── 3. Nhân viên đã bấm sẵn size L → chọn ly đó → tính giá M ──
    reset(); addToCart('Trà đào', 'L', 36000); await phone(P); await ap('TETUPA02'); await pick('Trà đào', 'L');
    chk(lixiLine() && lixiLine().size === 'L' && lixiLine().price === 30000 && sum() === 30000, '3. ly Trà đào L có sẵn → tính giá M 30.000', cart);
    window.lixiDropCode(); await sleep(50);
    chk(!lixiLine() && cart[0].size === 'L' && cart[0].price === 36000, '3b. bỏ mã → ly về L giá 36.000 như lúc chưa áp', cart);

    // ── 4. Bỏ mã (✕ trên tag / "Bỏ" trên khung) → ly trả về M, gộp lại ──
    reset(); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000); await phone(P); await ap('TETUPA02'); await pick('Bạc xỉu');
    rowOf(lixiLine()).querySelector('.lx-itag button').click(); await sleep(100);
    chk(!lixiLine() && cart.length === 1 && cart[0].size === 'M' && cart[0].qty === 2 && sum() === 50000, '4a. ✕ trên tag → Bạc xỉu M ×2 như cũ', cart);
    await ap('TETUPA02'); await pick('Bạc xỉu'); await ap('TETUPA02');
    chk(!lixiLine() && cart.length === 1 && cart[0].qty === 2, '4b. Áp → chọn ly → "Bỏ" trên khung → về như cũ', cart);
    // ly upsize bị gộp thêm 1 ly L (bấm món L) → ly thêm tính giá L; bỏ mã → chỉ 1 ly về M
    await ap('TETUPA02'); await pick('Bạc xỉu'); addToCart('Bạc xỉu', 'L', 30000); await sleep(50);
    const up4 = lixiLine(), extraL = cart.find(c => c.size === 'L' && !c._lixiCode);
    chk(up4 && up4.qty === 1 && extraL && extraL.qty === 1 && extraL.price === 30000 && sum() === 80000, '4c. gọi thêm 1 ly Bạc xỉu L → ly đó giá L 30.000, ly lì xì vẫn 1 ly giá M', cart);
    window.lixiDropCode(); await sleep(50);
    const m4 = cart.find(c => c.size === 'M'), l4 = cart.find(c => c.size === 'L');
    chk(m4 && m4.qty === 2 && l4 && l4.qty === 1 && sum() === 80000, '4d. bỏ mã → 2 M + 1 L', cart);
    await dl();

    // ── 5. Bớt ly upsize (−) → mã tự rời bill, không trừ gì ──
    reset(); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000); await phone(P); await ap('TETUPA02'); await pick('Bạc xỉu');
    updateQty(cart.indexOf(lixiLine()), -1); await sleep(100);
    chk(!lixiLine() && sum() === 25000, '5. bớt ly upsize → còn 1 ly M 25.000, mã không bị dùng', cart);
    await dl();

    // ── 6. Giảm 10K lịch bed: CHỈ khi đang order cho bed (pill bed) ──
    reset(); P = mkPhone(); seed(P, { TETG10K1: { type: 'giam10k_bed', at: 'x' } });
    addToCart('Bạc xỉu', 'M', 25000); await phone(P);
    chk(btn('TETG10K1').classList.contains('off') && /chỉ áp khi order cho bed/.test(document.getElementById('lixi-panel').textContent), '6a. không order cho bed → mã bed mờ, ghi "chỉ áp khi order cho bed"');
    await ap('TETG10K1');
    chk(!lixiLine() && /order cho 1 lịch bed/.test(await dl()), '6b. bấm Áp khi không order cho bed → báo, không áp');
    addToCart('1h bed', 'M', 15000); addToCart('1h bed', 'M', 15000); await ap('TETG10K1');
    chk(!lixiLine() && /order cho 1 lịch bed/.test(await dl()), '6c. tự thêm món "1h bed" vào bill thường (không pill bed) → vẫn không áp', cart);
    reset(); let bk = mkBooking('BK6', '13:00', '15:00', P); await openBooking(bk);
    addToCart('Bạc xỉu', 'M', 25000);
    chk(cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0) === 2 && !btn('TETG10K1').classList.contains('off'), '6d. mở lịch 13:00–15:00 → 2 giờ bed, mã bed bấm được', cart);
    chk(/BED 02/.test(pillTxt()) && /13:00 – 15:00/.test(pillTxt()), '6d2. đang có pill order bed ở đầu giỏ', pillTxt());
    await ap('TETG10K1');
    const iBed = cart.findIndex(c => c.name === '1h bed'), iLx = cart.indexOf(lixiLine());
    chk(lixiLine() && lixiLine().price === -10000 && sum() === 45000 && iLx === iBed + 1, '6e. giảm 10K → 55.000 − 10.000; dòng lì xì nằm NGAY DƯỚI giờ bed', [sum(), cart.map(c => c.name)]);
    chk(rowOf(lixiLine()).classList.contains('lx-bedrow') && /Giảm 10K lịch bed/.test(rowOf(lixiLine()).textContent), '6f. dòng lì xì hiển thị gắn vào giờ bed ("Lì xì Tết · Giảm 10K lịch bed")');
    const keep6 = pendingBedOrder; pendingBedOrder = null; renderCart(); await sleep(50);
    chk(!lixiLine() && /chỉ áp khi order cho bed/.test(await dl()), '6g. bill không còn gắn lịch bed (giỏ vẫn còn món) → mã bed tự gỡ + báo');
    resetOrderingMode(true);
    await openBooking(bk); addToCart('Bạc xỉu', 'M', 25000); await ap('TETG10K1');
    o = await pay(); await sleep(300);
    chk(o && o.total === 45000 && DB['lixi_tet_2027/' + P].codes.TETG10K1.used === true && DB['lixi_tet_2027/' + P].codes.TETG10K1.usedAmount === 10000, '6h. thanh toán lịch bed → đơn 45.000, mã đã dùng', o && o.total);

    // ── 7. +1h bed áp ở quầy: lịch 13:00–15:00 (2 giờ) → kéo dài tới 16:00, trả 2 giờ ──
    reset(); P = mkPhone(); seed(P, { TETB1H01: { type: 'bed1h', at: 'x' } });
    bk = mkBooking('BK7', '13:00', '15:00', P); await openBooking(bk);
    chk(/Tặng thêm 1 giờ bed cho lịch từ 2 giờ/.test(document.getElementById('lixi-panel').textContent), '7a. chữ trên mã: "Tặng thêm 1 giờ bed cho lịch từ 2 giờ"');
    await ap('TETB1H01'); await sleep(300);
    const rt7 = __RT2.get('bedBookings/2027/02/09/BK7');
    chk(rt7.end === '16:00' && rt7.lixiBed1h && rt7.lixiBed1h.code === 'TETB1H01' && rt7.lixiBed1h.baseEnd === '15:00', '7b. lịch trên Firebase kéo tới 16:00 (Đặt bed / lịch trống thấy đúng)', rt7);
    chk(globalAllBookings.find(x => x.id === 'BK7').end === '16:00', '7c. danh sách lịch trên máy cũng 16:00');
    chk(/13:00 – 16:00/.test(pillTxt()), '7c2. pill order bed đổi thành 13:00 – 16:00', pillTxt());
    chk(cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0) === 3 && lixiLine() && lixiLine().price === -15000 && sum() === 30000, '7d. bill: 3 giờ bed − 1 giờ tặng = 30.000', [sum(), cart]);
    chk(cart.indexOf(lixiLine()) === cart.findIndex(c => c.name === '1h bed') + 1 && /Tặng 1 giờ bed/.test(rowOf(lixiLine()).textContent) && rowOf(lixiLine()).classList.contains('lx-bedrow'), '7d2. dòng "Lì xì Tết · Tặng 1 giờ bed (giờ cuối)" nằm ngay dưới giờ bed');
    document.getElementById('app-modal').classList.add('hidden'); await sleep(2600); await window.__shot('lx_pos_bed1h');
    o = await pay(); await sleep(400);
    chk(o && o.total === 30000 && DB['lixi_tet_2027/' + P].codes.TETB1H01.used === true, '7e. thanh toán → 30.000, mã đã dùng', o && o.total);
    chk(__RT2.get('bedBookings/2027/02/09/BK7/lixiBed1h/used') === true, '7f. lịch được đánh dấu mã +1h đã dùng');
    bk.lixiBed1h.used = true; reset(); await openBooking(bk);
    chk(!lixiLine() && cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0) === 3, '7g. mở lại lịch đã thanh toán → KHÔNG trừ 1 giờ lần 2', cart);
    await dl();

    // ── 8. +1h bed: lịch chỉ 1 giờ → từ chối ──
    reset(); P = mkPhone(); seed(P, { TETB1H02: { type: 'bed1h', at: 'x' } });
    bk = mkBooking('BK8', '13:00', '14:00', P); await openBooking(bk); await ap('TETB1H02'); await sleep(200);
    chk(!lixiLine() && __RT2.get('bedBookings/2027/02/09/BK8').end === '14:00' && /từ 2 giờ/.test(await dl()), '8. lịch 1 giờ → không áp, lịch giữ nguyên');

    // ── 9. +1h bed: cộng thêm quá giờ đóng cửa (20:50) → từ chối ──
    reset(); bk = mkBooking('BK9', '18:00', '20:00', P); await openBooking(bk); await ap('TETB1H02'); await sleep(200);
    chk(!lixiLine() && __RT2.get('bedBookings/2027/02/09/BK9').end === '20:00' && /quá giờ đóng cửa/.test(await dl()), '9. lịch tới 20:00 + 1 giờ quá 20:50 → không áp');

    // ── 10. +1h bed ĐẶT QUA APP (mã đã giữ, lịch đã kéo sẵn 13:00–18:00 = 4 giờ trả + 1 tặng) ──
    reset(); P = mkPhone(); seed(P, { TETB1H03: { type: 'bed1h', at: 'x', reservedBooking: 'BK10', reservedPath: 'bedBookings/2027/02/09/BK10', reservedInfo: '09/02 13:00–18:00' } });
    await phone(P); chk(!btn('TETB1H03'), '10a. mã đã giữ cho lịch → bill thường KHÔNG thấy mã');
    reset(); bk = mkBooking('BK10', '13:00', '18:00', P, { lixiBed1h: { code: 'TETB1H03', phone: P, freeMin: 60, baseEnd: '17:00', by: 'app' } }); await openBooking(bk); await sleep(200);
    const h1 = cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0), h5 = cart.filter(c => c.name === '1h bed từ h5').reduce((s, c) => s + c.qty, 0);
    chk(h1 === 4 && h5 === 1 && lixiLine() && lixiLine().price === -10000 && sum() === 60000, '10b. mở lịch → tự trừ giờ CUỐI (giá giờ thứ 5 = 10.000) → 60.000', [h1, h5, sum()]);
    chk(btn('TETB1H03') && btn('TETB1H03').textContent === 'Bỏ', '10c. tính đúng lịch đó: khung hiện mã đang áp');
    o = await pay(); await sleep(400);
    chk(o && o.total === 60000 && DB['lixi_tet_2027/' + P].codes.TETB1H03.used === true, '10d. thanh toán → 60.000, mã đã dùng', o && o.total);

    // ── 11. Bỏ +1h bed ở quầy → lịch trả về giờ cũ ──
    reset(); P = mkPhone(); seed(P, { TETB1H04: { type: 'bed1h', at: 'x' }, TETB1H05: { type: 'bed1h', at: 'x', reservedBooking: 'BK11B' } });
    bk = mkBooking('BK11', '13:00', '15:00', P); await openBooking(bk); await ap('TETB1H04'); await sleep(300);
    removeCartItem(cart.indexOf(lixiLine())); await sleep(300);
    chk(!lixiLine() && __RT2.get('bedBookings/2027/02/09/BK11').end === '15:00' && !__RT2.get('bedBookings/2027/02/09/BK11/lixiBed1h') && cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0) === 2, '11a. ✕ dòng +1h → lịch về 15:00, bill về 2 giờ', [__RT2.get('bedBookings/2027/02/09/BK11'), cart]);
    reset(); bk = mkBooking('BK11B', '13:00', '16:00', P, { lixiBed1h: { code: 'TETB1H05', phone: P, freeMin: 60, baseEnd: '15:00', by: 'app' } }); await openBooking(bk); await sleep(200);
    await ap('TETB1H05'); await sleep(300);
    chk(!lixiLine() && __RT2.get('bedBookings/2027/02/09/BK11B').end === '15:00' && !DB['lixi_tet_2027/' + P].codes.TETB1H05.reservedBooking, '11b. bỏ +1h của lịch đặt qua app → lịch về 15:00 + trả mã cho khách', [__RT2.get('bedBookings/2027/02/09/BK11B'), DB['lixi_tet_2027/' + P].codes.TETB1H05]);

    // ── 12. Đổi mã trong cùng bill: đang +1h → bấm giảm 10K → +1h bỏ, lịch về cũ ──
    reset(); P = mkPhone(); seed(P, { TETB1H06: { type: 'bed1h', at: 'x' }, TETG10K2: { type: 'giam10k_bed', at: 'x' } });
    bk = mkBooking('BK12', '13:00', '15:00', P); await openBooking(bk); await ap('TETB1H06'); await sleep(300);
    await ap('TETG10K2'); await sleep(300);
    chk(cart.filter(c => c._lixiCode).length === 1 && lixiLine()._lixiCode === 'TETG10K2' && __RT2.get('bedBookings/2027/02/09/BK12').end === '15:00' && sum() === 20000, '12. 1 bill 1 mã: đổi sang giảm 10K → +1h gỡ, lịch về 15:00, 30.000 − 10.000', [sum(), cart]);

    // ── 13. Mã vừa dùng ở máy khác → bấm Áp báo, không trừ ──
    reset(); P = mkPhone(); seed(P, { TETG10K3: { type: 'giam10k_bed', at: 'x' } });
    bk = mkBooking('BK13', '13:00', '15:00', P); await openBooking(bk);
    DB['lixi_tet_2027/' + P].codes.TETG10K3.used = true;           // máy khác vừa dùng
    await ap('TETG10K3'); await sleep(200);
    chk(!lixiLine() && sum() === 30000 && /vừa được dùng/.test(await dl()), '13. mã vừa dùng ở máy khác → báo, không trừ tiền');

    // ── 14. Lịch +1h đặt qua app nhưng mã đã dùng (lỗi dữ liệu) → tự gỡ dòng trừ ──
    reset(); P = mkPhone(); seed(P, { TETB1H07: { type: 'bed1h', at: 'x', used: true, reservedBooking: 'BK14' } });
    bk = mkBooking('BK14', '13:00', '16:00', P, { lixiBed1h: { code: 'TETB1H07', phone: P, freeMin: 60, baseEnd: '15:00', by: 'app' } }); await openBooking(bk); await sleep(300);
    chk(!lixiLine() && __RT2.get('bedBookings/2027/02/09/BK14').end === '16:00', '14. mã của lịch đã dùng rồi → kiểm lại Firebase, gỡ dòng trừ (lịch giữ nguyên)', cart);
    await dl();

    // ── 14b. Luồng Trả bed (không có pill order bed) → không áp mã bed ──
    reset(); P = mkPhone(); seed(P, { TETG10K6: { type: 'giam10k_bed', at: 'x' } });
    bk = mkBooking('BK14B', '13:00', '15:00', P);
    addToCart('1h bed', 'M', 15000); addToCart('1h bed', 'M', 15000);
    proceedToCheckoutFlow(bk); await sleep(900);
    chk(!document.getElementById('cart-bed-info') && btn('TETG10K6') && btn('TETG10K6').classList.contains('off'), '14b. Trả bed (không pill) → mã bed mờ', pillTxt());
    await ap('TETG10K6');
    chk(!lixiLine() && /pill bed/.test(await dl()), '14c. bấm Áp khi Trả bed → báo cần pill bed, không áp');

    // ── 15. Chặn trước thanh toán: rời chế độ bed mà chưa vẽ lại giỏ → bấm thanh toán bị chặn ──
    reset(); P = mkPhone(); seed(P, { TETG10K5: { type: 'giam10k_bed', at: 'x' } });
    bk = mkBooking('BK15', '13:00', '15:00', P); await openBooking(bk); await ap('TETG10K5');
    pendingBedOrder = null;                                               // không qua renderCart
    o = await pay();
    chk(!o && !lixiLine() && /chỉ áp khi order cho bed/.test(await dl()), '15. bill không còn gắn lịch bed → thanh toán bị chặn, gỡ mã bed');

    // ── 16. Ngoài hạn ──
    reset(); P = mkPhone(); seed(P, { TETG10K4: { type: 'giam10k_bed', at: 'x' } });
    setDay('2027-02-07T10:00:00'); await phone(P);
    chk(document.getElementById('lixi-panel').style.display === 'none', '16a. mùng 2 (chưa tới mùng 3) → không hiện mã');
    setDay('2027-02-15T20:00:00'); await phone(P + ''); document.getElementById('kh-sdt').value = ''; await phone(P);
    chk(!!btn('TETG10K4'), '16b. mùng 10 → vẫn dùng được');
    setDay('2027-02-16T08:00:00'); document.getElementById('kh-sdt').value = ''; checkSdtLive(); await sleep(100); await phone(P);
    chk(document.getElementById('lixi-panel').style.display === 'none', '16c. mùng 11 → hết hạn, không hiện');
    setDay('2027-02-09T10:00:00');

    // ── 17. Khách vãng lai (không SĐT) thanh toán bình thường ──
    reset(); addToCart('Bạc xỉu', 'M', 25000); o = await pay();
    chk(o && o.total === 25000, '17. bill không SĐT / không lì xì → thanh toán bình thường');
    return R;
  }, fake);
  await (OUT ? o => p.screenshot(o) : async () => {})({ path: path.join(OUT, 'lx_pos_full.png') });
  console.log(res.join('\n'));
  const nf = res.filter(x => x.startsWith('FAIL')).length; process.exitCode = nf ? 1 : 0;
  console.log('FAIL:', res.filter(x => x.startsWith('FAIL')).length, '/', res.length);
  console.log('pageerrors', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
