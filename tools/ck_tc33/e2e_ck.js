// E2E pos.html — chuyển khoản theo luồng posgieo (VietQR Cake + bank_confirmations), PayOS đã bỏ (25/10).
// Chạy: node tools/ck_tc33/e2e_ck.js [pos.html | pos_tet.html]   (cần Playwright; Firebase giả trong bộ nhớ, không nối mạng)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const E = path.resolve(__dirname, '../tet/e2e'), FILE = path.resolve(process.argv[2] || path.resolve(__dirname, '../../pos.html'));
let mock = fs.readFileSync(path.join(E, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(E, 'rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu',[{name:'Trà long nhãn',type:'Trà',priceM:30000},{name:'Mint choco latte',type:'Cà phê',priceM:27000}]);\n";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
  const net = [];
  await p.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if (u.startsWith('file:')) return r.continue(); net.push(u); return r.abort(); });
  await p.goto('file://' + FILE); await p.waitForTimeout(2500);
  const res = await p.evaluate(async () => {
    const R = []; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c ? '' : ' → ' + JSON.stringify(x)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const orders = () => { const out = []; const s = { v: null }; getOrdersRef().once('value', x => { s.v = x.val(); }); return s; };
    const modalOpen = () => !document.getElementById('qr-modal').classList.contains('hidden');
    const lastOrder = async () => { const s = orders(); await sleep(50); const v = s.v || {}; const ks = Object.keys(v); return ks.length ? v[ks[ks.length - 1]] : null; };
    const countOrders = async () => { const s = orders(); await sleep(50); return Object.keys(s.v || {}).length; };
    const fill = () => { cart = [{ name: 'Trà long nhãn', size: 'M', price: 30000, qty: 1 }, { name: 'Mint choco latte', size: 'M', price: 27000, qty: 1 }]; renderCart(); currentTotal = 57000; };

    // 1. Hệ thống tự nhận (webhook ghi bank_confirmations)
    fill(); const n0 = await countOrders();
    setMethod('Chuyển khoản'); await sleep(200);
    const code = currentOrderCode, img = document.getElementById('vietqr-img').src;
    chk(modalOpen() && /^TC33\d{10}$/.test(code), '1a. bấm CK → popup QR, mã TC33…', code);
    chk(img.includes('img.vietqr.io/image/cake-0977570035-compact2.png') && img.includes('amount=57000') && img.includes(encodeURIComponent('TTHD ' + code)), '1b. QR VietQR Cake tài khoản Gieo, đúng số tiền + nội dung', img);
    chk(document.getElementById('qr-content').innerText === 'TTHD ' + code && /57\.000/.test(document.getElementById('qr-amount').innerText), '1c. hiện nội dung TTHD + số tiền');
    const sd = __RT2.get('session_display') || {}; chk(sd.state === 'qr_payment' && sd.qrUrl === img && sd.bankAddInfo === 'TTHD ' + code, '1d. màn hình khách nhận QR', sd);
    db.ref('bank_confirmations/' + code).set({ orderId: code, amount: 57000, account: '0977570035', source: 'gmail' });
    await sleep(2200);
    const o1 = await lastOrder();
    chk((await countOrders()) === n0 + 1 && o1.method === 'Chuyển khoản' && o1.total === 57000, '1e. tự lưu 1 bill Chuyển khoản 57.000', o1);
    chk(o1.bankOrderId === code && o1.bankConfirmMethod === 'auto', '1f. bill ghi mã CK + xác nhận tự động', o1);
    chk(__RT2.get('bank_confirmations/' + code) == null, '1g. xoá bank_confirmations sau khi dùng');
    chk(!modalOpen(), '1h. popup đóng');

    // 2. Đóng popup → thôi nghe; webhook tới muộn không tạo bill
    fill(); const n2 = await countOrders();
    setMethod('Chuyển khoản'); await sleep(100); const code2 = currentOrderCode;
    closeQRModal(); await sleep(100);
    db.ref('bank_confirmations/' + code2).set({ orderId: code2, amount: 57000 }); await sleep(1900);
    chk((await countOrders()) === n2 && __RT2.get('bank_confirmations/' + code2) != null, '2. đóng popup → không lưu bill khi xác nhận tới muộn (bản ghi để Quản lý dọn)');

    // 3. Xác nhận tay bằng PIN
    setMethod('Chuyển khoản'); await sleep(100); const code3 = currentOrderCode;
    openManualBankConfirm();
    const pin = document.getElementById('qr-manual-pin'), msg = () => document.getElementById('qr-manual-msg').innerText;
    pin.value = '1111'; await submitManualBankConfirm();
    chk(/chưa được phân công/.test(msg()) && modalOpen(), '3a. NV chỉ làm Gieo → từ chối', msg());
    pin.value = '2222'; await submitManualBankConfirm();
    chk(/chưa check-in/.test(msg()) && modalOpen(), '3b. NV TC33 chưa vào ca → từ chối', msg());
    pin.value = '9999'; await submitManualBankConfirm();
    chk(/PIN không tồn tại/.test(msg()), '3c. PIN sai → báo lỗi', msg());
    const t = new Date(Date.now() + 7 * 3600000), ymd = t.toISOString().slice(0, 10);
    __FS.employee_shifts_tc33.open1 = { employeeId: 'e2', employeeName: 'Minh Cafe', businessDate: ymd, checkedInAt: new Date().toISOString(), checkedOutAt: null };
    pin.value = '2222'; await submitManualBankConfirm(); await sleep(1900);
    const o3 = await lastOrder();
    chk(o3.method === 'Chuyển khoản' && o3.bankOrderId === code3 && o3.bankConfirmMethod === 'manual_staff' && o3.bankConfirmedBy === 'Minh Cafe' && o3.bankConfirmedById === 'e2', '3d. NV đang trong ca → lưu bill, ghi tên người xác nhận', o3);
    db.ref('bank_confirmations/' + code3).set({ orderId: code3, amount: 57000 }); await sleep(1900);
    chk((await lastOrder()).bankOrderId === code3 && (await countOrders()) === n2 + 1, '3e. webhook tới sau xác nhận tay → không lưu bill lần 2');

    // 4. Bill tiền mặt sau đó không dính mã CK cũ
    fill(); setMethod('Tiền mặt'); saveOrderToFirebase('Tiền mặt'); await sleep(300);
    const o4 = await lastOrder();
    chk(o4.method === 'Tiền mặt' && !o4.bankOrderId && !o4.bankConfirmMethod, '4. bill tiền mặt không có trường CK', o4);

    // 5. Chi tiết bill hiện mã CK + người xác nhận tay
    chk(_ckBillNote(o3).includes(code3) && _ckBillNote(o3).includes('Minh Cafe') && _ckBillNote(o1) === ' · ' + code && _ckBillNote(o4) === '', '5. ghi chú CK trong chi tiết bill');
    return R;
  });
  chk2 = (c, m) => res.push((c ? 'ok   ' : 'FAIL ') + m);
  chk2(!net.some(u => /cloudfunctions|payos/i.test(u)), '6. không gọi Cloud Function / PayOS');
  console.log(res.join('\n')); const nf = res.filter(x => x.startsWith('FAIL')).length; console.log('FAIL:', nf, '/', res.length);
  await b.close(); process.exit(nf ? 1 : 0);
})();
