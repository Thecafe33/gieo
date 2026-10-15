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
    const reset = () => { cart = []; pendingBedOrder = null; renderCart(); document.getElementById('kh-sdt').value = ''; };
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
    async function openBooking(bk) { pendingBedOrder = bk; document.getElementById('kh-sdt').value = bk.phone; checkSdtLive(); autoAddBedItems(bk); await sleep(900); }

    // ── 1. Upsize TC33: khách mua Bạc xỉu M ×2 → 1 ly lên L, trả giá 2 ly M ──
    reset(); let P = mkPhone(); seed(P, { TETUPA01: { type: 'upsize_tc33', at: 'x' }, TETXOF01: { type: 'upsize_xofa', at: 'x' }, TETXOF02: { type: 'giam5k_xofa', at: 'x' } });
    addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000);
    await phone(P);
    chk(document.getElementById('lixi-panel').style.display === 'block' && !!btn('TETUPA01'), '1a. nhập SĐT → khung lì xì hiện mã upsize The cafe 33');
    chk(!btn('TETXOF01') && !btn('TETXOF02'), '1b. mã của XOFA KHÔNG hiện ở The cafe 33');
    chk(/Upsize lên L miễn phí khi mua M/.test(document.getElementById('lixi-panel').textContent), '1c. chữ trên mã: "Upsize lên L miễn phí khi mua M"');
    await ap('TETUPA01');
    const mLine = cart.find(c => c.name === 'Bạc xỉu' && c.size === 'M'), lLine = cart.find(c => c.name === 'Bạc xỉu' && c.size === 'L');
    chk(mLine && mLine.qty === 1 && lLine && lLine.qty === 1 && lLine.price === 30000, '1d. áp → 1 ly M + 1 ly L (pha chế thấy đúng size L)', cart);
    chk(lixiLine() && lixiLine().price === -5000 && sum() === 50000 && currentTotal === 50000, '1e. dòng lì xì −5.000 → tổng 50.000 = giá 2 ly M', [sum(), currentTotal]);
    await window.__shot('lx_pos_upsize');
    chk(btn('TETUPA01').textContent === 'Bỏ', '1f. nút đổi thành "Bỏ"');
    let o = await pay();
    chk(o && o.total === 50000 && o.itemsArray.some(i => i._lixiCode === 'TETUPA01') && o.itemsArray.some(i => i.size === 'L'), '1g. thanh toán: đơn lưu tổng 50.000, có dòng lì xì + ly L', o && [o.total, o.items]);
    await sleep(300);
    let d = DB['lixi_tet_2027/' + P];
    chk(d.codes.TETUPA01.used === true && d.codes.TETUPA01.usedStore === 'tc33' && d.codes.TETUPA01.usedAmount === 5000, '1h. mã đánh dấu đã dùng ở The cafe 33, số tiền 5.000', d.codes.TETUPA01);
    chk(d.extra === 1 && d.earned === 1, '1i. đơn có SĐT (mùng 4, trong đợt phát) → +1 lượt mở bao', [d.extra, d.earned]);
    await phone(P); chk(!btn('TETUPA01'), '1j. mã đã dùng không hiện lại');
    await dl();

    // ── 2. Upsize: chỉ có món không có size L → báo, không trừ ──
    reset(); P = mkPhone(); seed(P, { TETUPA02: { type: 'upsize_tc33', at: 'x' } });
    addToCart('Cà phê đen', 'M', 20000); await phone(P); await ap('TETUPA02');
    chk(!lixiLine() && sum() === 20000 && /size M \(có size L\)/.test(await dl()), '2. giỏ không có ly M nào lên được L → báo, không trừ tiền');

    // ── 3. Upsize: nhân viên đã bấm sẵn size L → chỉ trừ phần chênh ──
    reset(); addToCart('Trà đào', 'L', 36000); await phone(P); await ap('TETUPA02');
    chk(lixiLine() && lixiLine().price === -6000 && sum() === 30000, '3. giỏ có sẵn Trà đào L → trừ 6.000 → khách trả giá M (30.000)', cart);

    // ── 4. Bỏ mã (✕ trong giỏ) → ly trả về M ──
    reset(); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000); await phone(P); await ap('TETUPA02');
    removeCartItem(cart.indexOf(lixiLine())); await sleep(100);
    chk(!lixiLine() && cart.length === 1 && cart[0].size === 'M' && cart[0].qty === 2 && sum() === 50000, '4a. ✕ dòng lì xì → Bạc xỉu M ×2 như cũ', cart);
    await ap('TETUPA02'); await ap('TETUPA02');
    chk(!lixiLine() && cart.length === 1 && cart[0].qty === 2, '4b. bấm "Áp" rồi "Bỏ" trên khung → về như cũ', cart);
    // ly L bị bấm thêm 1 ly L nữa rồi bỏ mã → chỉ 1 ly về M
    await ap('TETUPA02'); addToCart('Bạc xỉu', 'L', 30000);
    removeCartItem(cart.indexOf(lixiLine())); await sleep(100);
    const m4 = cart.find(c => c.size === 'M'), l4 = cart.find(c => c.size === 'L');
    chk(m4 && m4.qty === 2 && l4 && l4.qty === 1 && sum() === 80000, '4c. upsize + khách gọi thêm 1 ly L, rồi bỏ mã → 2 M + 1 L (ly L gọi thêm giữ nguyên)', cart);
    await dl();

    // ── 5. Xoá ly L đã upsize → mã tự bỏ + báo ──
    reset(); addToCart('Bạc xỉu', 'M', 25000); addToCart('Bạc xỉu', 'M', 25000); await phone(P); await ap('TETUPA02');
    removeCartItem(cart.findIndex(c => c.size === 'L')); await sleep(100);
    chk(!lixiLine() && sum() === 25000 && /không còn ly size L/.test(await dl()), '5. xoá ly L → dòng lì xì tự bỏ (không trừ oan), báo nhân viên', cart);

    // ── 6. Giảm 10K lịch bed ──
    reset(); P = mkPhone(); seed(P, { TETG10K1: { type: 'giam10k_bed', at: 'x' } });
    addToCart('Bạc xỉu', 'M', 25000); await phone(P); await ap('TETG10K1');
    chk(!lixiLine() && /chưa có giờ bed/.test(await dl()), '6a. bill không có giờ bed → không áp giảm 10K');
    reset(); let bk = mkBooking('BK6', '13:00', '15:00', P); await openBooking(bk);
    chk(cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0) === 2, '6b. mở lịch 13:00–15:00 → 2 giờ bed', cart);
    await ap('TETG10K1');
    chk(lixiLine() && lixiLine().price === -10000 && sum() === 20000, '6c. áp giảm 10K → 30.000 − 10.000 = 20.000', [sum(), cart]);
    o = await pay(); await sleep(300);
    chk(o && o.total === 20000 && DB['lixi_tet_2027/' + P].codes.TETG10K1.used === true, '6d. thanh toán lịch bed → đơn 20.000, mã đã dùng', o && o.total);

    // ── 7. +1h bed áp ở quầy: lịch 13:00–15:00 (2 giờ) → kéo dài tới 16:00, trả 2 giờ ──
    reset(); P = mkPhone(); seed(P, { TETB1H01: { type: 'bed1h', at: 'x' } });
    bk = mkBooking('BK7', '13:00', '15:00', P); await openBooking(bk);
    chk(/Tặng thêm 1 giờ bed cho lịch từ 2 giờ/.test(document.getElementById('lixi-panel').textContent), '7a. chữ trên mã: "Tặng thêm 1 giờ bed cho lịch từ 2 giờ"');
    await ap('TETB1H01'); await sleep(300);
    const rt7 = __RT2.get('bedBookings/2027/02/09/BK7');
    chk(rt7.end === '16:00' && rt7.lixiBed1h && rt7.lixiBed1h.code === 'TETB1H01' && rt7.lixiBed1h.baseEnd === '15:00', '7b. lịch trên Firebase kéo tới 16:00 (Đặt bed / lịch trống thấy đúng)', rt7);
    chk(globalAllBookings.find(x => x.id === 'BK7').end === '16:00', '7c. danh sách lịch trên máy cũng 16:00');
    chk(cart.filter(c => c.name === '1h bed').reduce((s, c) => s + c.qty, 0) === 3 && lixiLine() && lixiLine().price === -15000 && sum() === 30000, '7d. bill: 3 giờ bed − 1 giờ tặng = 30.000', [sum(), cart]);
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

    // ── 15. Chặn trước thanh toán: giỏ đổi làm mã hết điều kiện ──
    reset(); P = mkPhone(); seed(P, { TETUPA03: { type: 'upsize_tc33', at: 'x' } });
    addToCart('Bạc xỉu', 'M', 25000); await phone(P); await ap('TETUPA03');
    const li15 = cart.findIndex(c => c.size === 'L'); cart.splice(li15, 1);   // xoá thẳng (không qua renderCart)
    o = await pay();
    chk(!o && !lixiLine() && /không còn ly size L/.test(await dl()), '15. giỏ mất ly L mà chưa vẽ lại → bấm thanh toán bị chặn, gỡ mã');

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
