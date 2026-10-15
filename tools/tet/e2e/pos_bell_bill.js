const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const E = __dirname, FILE = process.argv[2] || path.resolve(__dirname, '../../../pos.html');   // node tools/tet/e2e/pos_bell_bill.js [pos.html | pos_tet.html]
let mock = fs.readFileSync(path.join(E, 'mockfb.js'), 'utf8').replace('update(d){ FS[key][id]=', 'update(d){ FS[key]=FS[key]||{}; FS[key][id]=');
mock += "\nfirebase.database.ServerValue={TIMESTAMP:0}; firebase.firestore.FieldValue={delete(){return null;},serverTimestamp(){return null;},increment(n){return n;},arrayUnion(){return [];}}; firebase.storage=function(){return {ref(){return {child(){return {put(){return Promise.resolve({ref:{getDownloadURL(){return Promise.resolve('')}}})}}}}}}};\n";
mock += fs.readFileSync(path.join(E, 'rtmem.js'), 'utf8');
mock += "\n__RT2.put('menu',[{name:'Trà long nhãn',type:'Trà',priceM:30000},{name:'1h bed',type:'Bed',priceM:15000},{name:'Mint choco latte',type:'Cà phê',priceM:27000}]);\n";
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
  await p.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('firebasejs')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if (u.startsWith('file:')) return r.continue(); return r.abort(); });
  await p.goto('file://' + FILE); await p.waitForTimeout(2500);
  const res = await p.evaluate(async () => {
    const R = []; const chk = (c, m, x) => R.push((c ? 'ok   ' : 'FAIL ') + m + (c ? '' : ' → ' + JSON.stringify(x)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const n = new Date(), pad = x => String(x).padStart(2, '0');
    const day = n.getFullYear() + '/' + pad(n.getMonth() + 1) + '/' + pad(n.getDate()), dStr = pad(n.getDate()) + '/' + pad(n.getMonth() + 1) + '/' + n.getFullYear();
    const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
    const t0 = new Date(Date.now() - 30 * 60000), t1 = new Date(Date.now() + 90 * 60000), tOld = new Date(Date.now() - 4 * 3600000), tOld2 = new Date(Date.now() - 2 * 3600000);
    db.ref('bedBookings/' + day + '/A1').set({ name: 'Nguyễn Như Ngọc', phone: '0911111111', date: dStr, start: hm(tOld), end: hm(tOld2), bedId: '1', status: 'đã xong', type: 'app' });
    db.ref('bedBookings/' + day + '/B2').set({ name: 'Lưu Nhật Duy', phone: '0866133142', date: dStr, start: hm(t0), end: hm(t1), bedId: '', status: 'chờ xếp bed', type: 'app', createdAt: new Date(Date.now() - 3 * 3600000).toISOString() });
    // đơn khách trước trên Bed 01 + đơn khách hiện tại
    const ord = getOrdersRef();
    ord.push({ sdt: '0911111111', bedId: '1', total: 95000, createdAt: tOld.getTime() + 60000, itemsArray: [{ name: 'Trà long nhãn', size: 'M', price: 30000, qty: 2 }, { name: '1h bed', size: 'M', price: 15000, qty: 1 }, { name: 'Phí không đặt trước', size: 'Phí', price: 10000, qty: 2 }] });
    ord.push({ sdt: '0866133142', bedId: '1', total: 101000, createdAt: Date.now() - 60000, itemsArray: [{ name: '1h bed', size: 'M', price: 15000, qty: 3 }, { name: 'Mint choco latte', size: 'M', price: 27000, qty: 1 }, { name: 'Trà vải lài', size: 'M', price: 25000, qty: 1 }, { name: 'Chăn bed', size: 'M', price: 4000, qty: 1 }] });
    _bellInit(); await sleep(300);
    chk(_bellList.length === 1, '1a. chuông: 1 lịch chờ nhận', _bellList.length);
    openBedManager(); await sleep(400); openBedManager(); await sleep(400);     // mở màn Bed 2 lần (trước đây gỡ mất listener của chuông)
    __RT2.get('bedBookings/' + day + '/B2');
    db.ref('bedBookings/' + day + '/B2').update({ status: 'active', bedId: '1', checkInTime: hm(t0) }); await sleep(400);
    chk(_bellList.length === 0, '1b. lịch đã active → chuông hết "chờ nhận" (mở màn Bed nhiều lần vẫn đúng)', _bellList.map(x => x.name));
    // bill nhanh
    await sleep(300);
    showBillModal('B2'); await sleep(400);
    const tot = document.getElementById('bill-modal-total').innerText, body = document.getElementById('bill-modal-body').innerText;
    chk(/101/.test(tot) && !/196/.test(tot) && !/Phí không đặt trước/.test(body) && !/Trà long nhãn/.test(body), '2. bill xem nhanh = 101.000, không lẫn bill khách trước cùng Bed 01', [tot, body.replace(/\s+/g, ' ').slice(0, 200)]);
    const s = calculateStats([{ total: 101000, createdAt: new Date().toISOString(), method: 'Tiền mặt', itemsArray: [{ name: '1h bed', size: 'M', price: 15000, qty: 3 }, { name: 'Mint choco latte', size: 'M', price: 27000, qty: 1 }, { name: 'Nợ cũ: Phí vệ sinh', size: 'Phí', price: 29000, qty: 1 }] }], 'custom', n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()), n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()));
    chk(s.drinkTotal === 27000 && s.khacTotal === 74000, '3. doanh thu: giờ bed + nợ → Khác, nước = 27.000', [s.drinkTotal, s.khacTotal]);
    return R;
  });
  console.log(res.join('\n')); console.log('FAIL:', res.filter(x => x.startsWith('FAIL')).length, '/', res.length);
  await b.close();
})();
