// E2E index_tet.html: đặt bed có lì xì +1h → lịch lưu đã kéo dài, khách sau không chồng lịch; huỷ / đổi giờ
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..'), OUT = process.argv[2] || '';   // OUT: thư mục lưu ảnh chụp (tuỳ chọn)
const S = OUT;
let mock = fs.readFileSync(path.join(__dirname, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}};\n";
mock += fs.readFileSync(path.join(__dirname, 'rtmem.js'), 'utf8');
mock += "\n__RT2.put('bed_closing_time','20:50');\n";
const fake = fs.readFileSync(path.join(__dirname, 'lixi_fake_inpage.js'), 'utf8');
const tw = (fs.existsSync(path.join(__dirname, 'tet_tw.css')) ? fs.readFileSync(path.join(__dirname, 'tet_tw.css'), 'utf8') : '');
const PREV = path.join(ROOT, '__tet_bed_preview.html');
fs.writeFileSync(PREV, fs.readFileSync(path.join(ROOT, 'index_tet.html'), 'utf8').replace('<script src="https://cdn.tailwindcss.com"></script>', '<style>' + tw + '</style>'));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.stack.split('\n').slice(0,3).join(' '))); p.on('dialog', d => d.accept());
  await p.exposeFunction('__shotEl', async n => { if (!OUT) return; const bb = await p.locator('#lx-bed1h').boundingBox(); await p.locator('#btn-booking').scrollIntoViewIfNeeded(); const b2 = await p.locator('#lx-bed1h').boundingBox(); const bt = await p.locator('#btn-booking').boundingBox(); await (OUT ? o => p.screenshot(o) : async () => {})({ path: path.join(OUT, n + '.png'), clip: { x: 0, y: Math.max(0, b2.y - 20), width: 390, height: (bt.y + bt.height) - b2.y + 40 } }); });
  await p.exposeFunction('__shot', n => (OUT ? o => p.screenshot(o) : async () => {})({ path: path.join(OUT, n + '.png') }));
  await p.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if (u.startsWith('file:') || u.startsWith('data:') || u.includes('fonts.g')) return r.continue(); return r.abort(); });
  await p.goto('file://' + PREV).catch(() => {}); await p.waitForTimeout(2500);
  const res = await p.evaluate(async (fake) => {
    eval(fake); const F = window.__lxFake; LiXi.init({ fstore: F.fstore, FieldValue: F.FieldValue });
    LiXi._setOffset(Date.parse('2027-02-07T10:00:00+07:00') - Date.now());   // mùng 2: đặt lịch cho mùng 4
    const R = []; const chk = (c, m, extra) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const AL = []; window.alert = m => AL.push(String(m));
    const DB = window.__LXFS, $ = id => document.getElementById(id);
    const DAY = 'bedBookings/2027/02/09';
    document.getElementById('login-screen').classList.add('hidden'); $('main-app').classList.remove('hidden'); $('nav-bar').classList.remove('hidden');
    window._checkActiveBooking = (ph, d, cb) => cb(null);
    window._poDrinkCount = () => 9;
    const day = () => __RT2.get(DAY) || {};
    const mine = ph => Object.entries(day()).filter(([k, v]) => v.phone === ph).map(([k, v]) => Object.assign({ key: k }, v));
    const seedDay = list => { __RT2.put(DAY, null); list.forEach((v, i) => __RT2.put(DAY + '/X' + i, Object.assign({ phone: '0999' + i, status: 'chờ xếp bed', date: '09/02/2027', type: 'app' }, v))); };
    async function login(P, codes) {
      DB['lixi_tet_2027/' + P] = { phone: P, extra: 0, codes: codes || {} };
      curPhone = P; userData = { name: 'Khách ' + P.slice(-2) }; await LiXiUI.refresh(true); await sleep(200);
    }
    async function book(dateYmd, s, e, opt) {
      opt = opt || {};
      $('agree-rules').checked = true; _guestCount = 1; _poPendingPreorder = { items: [{ name: 'Bạc xỉu', qty: 1 }] };
      $('book-date').value = dateYmd; $('book-start').value = s; $('book-end').value = e;
      if (opt.off) { const cb = $('lx-bed1h-on'); if (cb && cb.checked) { cb.click(); } }
      handleBooking(); await sleep(900);
      const mo = $('modal-overlay'); const txt = mo && !mo.classList.contains('hidden') ? mo.innerText.replace(/\s+/g, ' ') : '';
      if (mo) mo.classList.add('hidden');
      return txt;
    }
    showTab('bed'); await sleep(300);

    // 1. Khách A có mã +1h, chọn 13:00–15:00 → khung báo kết thúc 16:00
    const A = '0911000001';
    await login(A, { TETBDA01: { type: 'bed1h', at: 'x' } });
    $('book-date').value = '2027-02-09'; $('book-start').value = '13:00'; $('book-end').value = '15:00'; await sleep(1000);
    $('lx-bed1h') && window.scrollTo(0, $('lx-bed1h').getBoundingClientRect().top + window.scrollY - 420); $('lx-bed1h') && $('lx-bed1h').scrollIntoView({block:'center'}); await sleep(200); await window.__shotEl('lx_idx_bed1h');
    const box = $('lx-bed1h');
    chk(box && box.style.display === 'block' && /kết thúc 16:00/.test(box.innerText) && /thay vì 15:00/.test(box.innerText), '1. tab Đặt bed: báo "lịch kết thúc 16:00 thay vì 15:00"', box && box.innerText);
    // 2. đặt → lịch lưu 13:00–16:00 + giữ mã
    seedDay([]);
    let msg = await book('2027-02-09', '13:00', '15:00');
    let a = mine(A)[0];
    chk(a && a.start === '13:00' && a.end === '16:00', '2a. lịch lưu trên Firebase 13:00–16:00', a);
    chk(a && a.lixiBed1h && a.lixiBed1h.code === 'TETBDA01' && a.lixiBed1h.baseEnd === '15:00' && a.lixiBed1h.by === 'app', '2b. lịch ghi lixiBed1h (POS tự trừ 1 giờ)', a && a.lixiBed1h);
    chk(a && a.preorder && a.preorder.bookingEnd === '16:00', '2c. pre-order cũng ghi giờ kết thúc 16:00', a && a.preorder);
    let c = DB['lixi_tet_2027/' + A].codes.TETBDA01;
    chk(c.reservedBooking === a.key && c.reservedPath === DAY + '/' + a.key && /13:00–16:00/.test(c.reservedInfo), '2d. mã được GIỮ cho đúng lịch này', c);
    chk($('book-end').value === '15:00', '2e. ô giờ trên form trả về 15:00 (không cộng 2 lần)', $('book-end').value);
    chk(/13:00 – 16:00/.test($('bs-time').innerText), '2f. thông báo đặt thành công hiện 13:00 – 16:00', $('bs-time').innerText);

    // 3. Khách B đặt 15:00–16:00, đã có 3 lịch khác 15:00–16:00 → lịch A (tới 16:00) là bed thứ 4 → HẾT CHỖ
    const B = '0911000002';
    seedDay([{ start: '15:00', end: '16:00' }, { start: '15:00', end: '16:00' }, { start: '15:00', end: '16:00' }]);
    __RT2.put(DAY + '/' + a.key, Object.assign({}, a, { key: null }));
    await login(B, {});
    msg = await book('2027-02-09', '15:00', '16:00');
    chk(mine(B).length === 0, '3a. khách sau chọn 15:00 → KHÔNG đặt được (A giữ bed tới 16:00)', [msg.slice(0, 100), mine(B)]);
    // đối chứng: nếu A không có +1h (tới 15:00) thì B đặt được
    __RT2.put(DAY + '/' + a.key + '/end', '15:00');
    msg = await book('2027-02-09', '15:00', '16:00');
    chk(mine(B).length === 1, '3b. đối chứng: A chỉ tới 15:00 → B đặt được 15:00 (đúng là nhờ +1h mới chặn)', mine(B));

    // 4. Đủ 4 bed 15:00–16:30: 13:00–15:00 trống nhưng cộng 1 giờ thì trùng → không đặt, gợi ý giờ khác
    const C = '0911000003';
    seedDay([{ start: '15:00', end: '16:30' }, { start: '15:00', end: '16:30' }, { start: '15:00', end: '16:30' }, { start: '15:00', end: '16:30' }]);
    await login(C, { TETBDC01: { type: 'bed1h', at: 'x' } });
    msg = await book('2027-02-09', '13:00', '15:00');
    chk(mine(C).length === 0 && !DB['lixi_tet_2027/' + C].codes.TETBDC01.reservedBooking, '4a. cộng 1 giờ thì trùng → không đặt, mã không bị giữ', msg.slice(0, 120));
    // khách tắt dùng mã → đặt được 13:00–15:00, không giữ mã
    msg = await book('2027-02-09', '13:00', '15:00', { off: true });
    let cc = mine(C)[0];
    chk(cc && cc.end === '15:00' && !cc.lixiBed1h && !DB['lixi_tet_2027/' + C].codes.TETBDC01.reservedBooking, '4b. bỏ tick "Dùng lì xì" → đặt 13:00–15:00 bình thường, mã còn nguyên', cc);
    $('lx-bed1h-on') && !$('lx-bed1h-on').checked && $('lx-bed1h-on').click();

    // 5. Lịch 1 giờ → không dùng mã
    const D = '0911000004'; seedDay([]);
    await login(D, { TETBDD01: { type: 'bed1h', at: 'x' } });
    $('book-start').value = '13:00'; $('book-end').value = '14:00'; await sleep(1000);
    chk(/từ 2 giờ/.test($('lx-bed1h').innerText) && !$('lx-bed1h-on'), '5a. lịch 1 giờ → khung nhắc "từ 2 giờ", không có ô tick', $('lx-bed1h').innerText);
    await book('2027-02-09', '13:00', '14:00');
    let dd = mine(D)[0];
    chk(dd && dd.end === '14:00' && !dd.lixiBed1h, '5b. đặt 13:00–14:00 bình thường, không trừ mã', dd);

    // 6. Sát giờ đóng cửa (20:50): 18:30–20:00 → cộng 1 giờ = 21:00 quá giờ → không dùng mã
    const E = '0911000005'; seedDay([]);
    await login(E, { TETBDE01: { type: 'bed1h', at: 'x' } });
    $('book-start').value = '18:00'; $('book-end').value = '20:00'; await sleep(1000);
    chk(/quá giờ quán nhận bed/.test($('lx-bed1h').innerText), '6a. khung báo cộng 1 giờ quá giờ đóng cửa', $('lx-bed1h').innerText);
    await book('2027-02-09', '18:00', '20:00');
    let ee = mine(E)[0];
    chk(ee && ee.end === '20:00' && !ee.lixiBed1h && !DB['lixi_tet_2027/' + E].codes.TETBDE01.reservedBooking, '6b. đặt 18:00–20:00 không kéo dài, mã còn nguyên', ee);

    // 7. Ngày ngoài hạn dùng (mùng 1 = 6/2) → không dùng
    const G = '0911000006'; seedDay([]);
    await login(G, { TETBDG01: { type: 'bed1h', at: 'x' } });
    $('book-date').value = '2027-02-06'; $('book-start').value = '13:00'; $('book-end').value = '15:00'; await sleep(1000);
    chk(/mùng 3 → mùng 10/.test($('lx-bed1h').innerText), '7. lịch ngày mùng 1 → khung báo mã chỉ dùng mùng 3 → mùng 10', $('lx-bed1h').innerText);

    // 8. Mã vừa bị giữ ở máy khác (giữa lúc mở app và bấm đặt) → lịch giữ giờ cũ
    const H = '0911000007'; seedDay([]);
    await login(H, { TETBDH01: { type: 'bed1h', at: 'x' } });
    DB['lixi_tet_2027/' + H].codes.TETBDH01.reservedBooking = 'KHAC';
    await book('2027-02-09', '13:00', '15:00'); await sleep(1300);
    let hh = mine(H)[0];
    chk(hh && hh.end === '15:00' && !hh.lixiBed1h && DB['lixi_tet_2027/' + H].codes.TETBDH01.reservedBooking === 'KHAC', '8. mã đã giữ chỗ khác → lịch lưu 15:00 (không kéo dài, không trừ)', hh);

    // 9. Gọi lại handleBooking từ app (dời giờ khi đặt sát giờ): giờ trên form đã gồm +1h → không cộng lần 2
    const K = '0911000008'; seedDay([]);
    await login(K, { TETBDK01: { type: 'bed1h', at: 'x' } });
    $('agree-rules').checked = false; $('book-date').value = '2027-02-09'; $('book-start').value = '13:00'; $('book-end').value = '15:00';
    handleBooking(); await sleep(200);                                  // lần 1 dừng sớm (chưa tick nội quy) — đã tính +1h
    $('agree-rules').checked = true; _poPendingPreorder = { items: [{ name: 'x', qty: 1 }] };
    $('book-start').value = '13:20'; $('book-end').value = '16:20';     // app dời giờ: giữ thời lượng đã gồm +1h
    handleBooking(); await sleep(1000); $('modal-overlay').classList.add('hidden');
    let kk = mine(K)[0];
    chk(kk && kk.start === '13:20' && kk.end === '16:20' && kk.lixiBed1h && kk.lixiBed1h.baseEnd === '15:20', '9a. app tự dời giờ → 13:20–16:20 (không cộng lần 2), trả tiền tới 15:20', kk);
    // khách tự chọn lại cùng giờ bắt đầu, 3 tiếng → lượt mới, cộng 1 giờ
    const K2 = '0911000009'; seedDay([]);
    await login(K2, { TETBDK02: { type: 'bed1h', at: 'x' } });
    $('agree-rules').checked = false; $('book-start').value = '13:00'; $('book-end').value = '15:00'; handleBooking(); await sleep(100);
    msg = await book('2027-02-09', '13:00', '16:00');
    let k2 = mine(K2)[0];
    chk(k2 && k2.end === '17:00' && k2.lixiBed1h && k2.lixiBed1h.baseEnd === '16:00', '9b. khách tự đổi sang 13:00–16:00 → lưu 13:00–17:00 (trả 3 giờ + tặng 1)', k2);

    // 10. Hết chỗ → gợi ý giờ (đã gồm +1h) → khách chọn → form về giờ trả tiền, bấm Đặt cộng lại đúng 1 giờ
    const M = '0911000010';
    seedDay([{ start: '15:00', end: '16:30' }, { start: '15:00', end: '16:30' }, { start: '15:00', end: '16:30' }, { start: '15:00', end: '16:30' }]);
    await login(M, { TETBDM01: { type: 'bed1h', at: 'x' } });
    $('agree-rules').checked = true; $('book-date').value = '2027-02-09'; $('book-start').value = '13:00'; $('book-end').value = '15:00';
    handleBooking(); await sleep(900); $('modal-overlay').classList.add('hidden');
    applyAutoBook('16:30 - 19:30', null); await sleep(200); $('modal-overlay').classList.add('hidden');
    chk($('book-start').value === '16:30' && $('book-end').value === '18:30', '10a. chọn gợi ý 16:30–19:30 → form hiện 16:30–18:30 (giờ trả tiền)', [$('book-start').value, $('book-end').value]);
    await book('2027-02-09', '16:30', '18:30');
    let mm = mine(M)[0];
    chk(mm && mm.end === '19:30' && mm.lixiBed1h && mm.lixiBed1h.baseEnd === '18:30', '10b. đặt → lưu 16:30–19:30, mã giữ', mm);

    // 11. Huỷ lịch → trả mã
    const resv = DB['lixi_tet_2027/' + M].codes.TETBDM01.reservedBooking;
    _refundBedVoucherIfAny(Object.assign({}, mm)); await sleep(300);
    chk(resv === mm.key && !DB['lixi_tet_2027/' + M].codes.TETBDM01.reservedBooking, '11. huỷ lịch → mã trả lại, dùng cho lịch khác được');

    // 12. Đổi giờ lịch có +1h: form hiện giờ trả tiền, lưu thì cộng lại 1 giờ
    const N = '0911000011'; seedDay([]);
    await login(N, { TETBDN01: { type: 'bed1h', at: 'x' } });
    await book('2027-02-09', '13:00', '15:00');
    let nn = mine(N)[0];
    _historyCache = [Object.assign({}, nn)]; editingBookingKey = nn.key; _editingBookingPath = DAY + '/' + nn.key;
    $('re-date').value = '2027-02-09'; $('re-start').value = '13:00'; $('re-end').value = nn.end;
    $('reschedule-modal').classList.remove('hidden'); await sleep(100);
    chk($('re-end').value === '15:00', '12a. mở Đổi giờ → ô kết thúc hiện 15:00 (giờ trả tiền)', $('re-end').value);
    $('re-start').value = '14:00'; $('re-end').value = '16:00';
    _doSubmitReschedule(0); await sleep(900);
    nn = mine(N)[0];
    chk(nn.start === '14:00' && nn.end === '17:00', '12b. đổi sang 14:00–16:00 → lưu 14:00–17:00', nn);
    chk(/14:00–17:00/.test(DB['lixi_tet_2027/' + N].codes.TETBDN01.reservedInfo || ''), '12c. mã ghi lại giờ mới', DB['lixi_tet_2027/' + N].codes.TETBDN01);
    _historyCache = [Object.assign({}, mine(N)[0])];   // app nạp lại Lịch sử sau khi đổi giờ
    $('re-start').value = '14:00'; $('re-end').value = '15:00'; AL.length = 0;
    _doSubmitReschedule(0); await sleep(500);
    chk(mine(N)[0].end === '17:00' && /từ 2 giờ/.test(AL.join(' ')), '12d. đổi xuống 1 giờ → báo cần từ 2 giờ, lịch giữ nguyên');
    $('reschedule-modal').classList.add('hidden');

    // 13. Thẻ Túi lì xì hiện "Đã giữ cho lịch"
    showTab('user'); await LiXiUI.refresh(true); await sleep(300);
    chk(/giữ/i.test($('lx-card').innerText) && /14:00–17:00/.test($('lx-card').innerText), '13. thẻ Túi lì xì: mã "Đã giữ cho lịch 09/02 14:00–17:00"', $('lx-card').innerText.replace(/\s+/g, ' ').slice(0, 200));
    return R;
  }, fake);
  await (OUT ? o => p.screenshot(o) : async () => {})({ path: path.join(OUT, 'lx_idx_card.png') });
  console.log(res.join('\n'));
  const nf = res.filter(x => x.startsWith('FAIL')).length; process.exitCode = nf ? 1 : 0;
  console.log('FAIL:', res.filter(x => x.startsWith('FAIL')).length, '/', res.length);
  console.log('pageerrors', JSON.stringify(errs.slice(0, 8)));
  await b.close(); fs.unlinkSync(PREV);
})();
