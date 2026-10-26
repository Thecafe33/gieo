// e2e Đợt 1D kế hoạch tách posgieo: BÁN HÀNG CÓ TRỢ LÝ — so HÀNH VI bản tách với bản đang chạy ở cửa hàng.
//   node tools/tach_posgieo/e2e_ban.js [--moc 0bd95a7] [--mua giangsinh]
// Cùng một kịch bản thao tác trên hai bộ deploy (hai_ban.js): thêm món / tăng giảm / topping / đá → khách quen
// (renderCustomerInfo — bọc trợ lý + Gấu Noel) → xem gợi ý trợ lý (#assistBar*) → nội dung bill (buildReceiptContent,
// bọc Gấu Noel) + vẽ bill (renderReceiptCanvas) + vẽ tem (renderTemCanvas) → THANH TOÁN TIỀN MẶT thật (confirmPay →
// mã bill, ghi đơn, trợ lý chốt đơn assistFinalizeOrder, tích tem…) → so từng bước: giỏ, tổng, HTML trợ lý, lệnh in,
// kích thước ảnh in, DANH SÁCH LƯỢT GHI FIREBASE (đường dẫn + dữ liệu, đã chuẩn hoá giờ / mã ngẫu nhiên), toast, lỗi JS.
// Cổng ca (mở ca / việc đầu ca / check-in) được mở bằng cách gán đè GIỐNG NHAU ở cả hai bản — không phải phần đang kiểm.
// Firebase giả không có dữ liệu thật: so sánh chứng minh bản tách xử lý Y HỆT bản đang chạy, không chứng minh đúng nghiệp vụ.
'use strict';
const { chromium } = require('playwright'); const path = require('path');
const fs = require('fs');
const { dungHaiBan, moTrang, banSua, ROOT } = require('./hai_ban');
const { chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOC = arg('--moc', '0bd95a7'), MUA = arg('--mua', 'giangsinh');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

// Chuẩn hoá THEO TRƯỜNG (kiểm toán lượt 07 F07-2 — trước thay mọi HH:MM trên toàn JSON, nuốt cả giờ in trên bill):
// chỉ ở dữ liệu ghi Firebase + giỏ, chỉ đúng giá trị phụ thuộc lúc chạy: khoá giờ (…At / at / ts / time) mang giá trị giờ
// (ISO / ms / HH:MM), khoá thanh toán `bill_<ms>_<ngẫu nhiên>` (giá trị / khoá / đoạn đường dẫn), khoá dòng giỏ `_new…`.
// Nội dung bill, toast, lỗi, giờ fixture (order.time '10:00') KHÔNG chuẩn hoá.
const KHOA_GIO = /(?:^|[a-z])At$|^at$|^ts$|^time$/;
const LA_GIO = v => (typeof v === 'string' && (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/.test(v) || /^\d\d:\d\d$/.test(v))) || (typeof v === 'number' && v > 1.6e12);
const MA_TT = /bill_\d{12,}_[a-z0-9]+/g;
function chuanDuLieu(v, k) {
  if (Array.isArray(v)) return v.map(x => chuanDuLieu(x));
  if (v && typeof v === 'object') { const o = {}; for (const [kk, vv] of Object.entries(v)) o[kk.replace(MA_TT, 'bill_ID').replace(/_new[a-z0-9]+$/, '_newID')] = chuanDuLieu(vv, kk); return o; }
  if (k && KHOA_GIO.test(k) && LA_GIO(v)) return '<giờ>';
  return typeof v === 'string' ? v.replace(MA_TT, 'bill_ID') : v;
}
const chuanGhi = ds => (ds || []).map(g => ({ op: String(g.op).replace(MA_TT, 'bill_ID'), p: String(g.p).replace(MA_TT, 'bill_ID'), d: chuanDuLieu(g.d) }));
function chuan(r) {
  const o = Object.assign({}, r);
  o.ghiTruocTT = chuanGhi(r.ghiTruocTT); o.ghiTT = chuanGhi(r.ghiTT);
  o.buoc = chuanDuLieu(r.buoc); o.sauTT = chuanDuLieu(r.sauTT);
  return o;
}
const SO = ['buoc', 'bill', 'billAnh', 'temAnh', 'billLoi', 'temLoi', 'ghiTruocTT', 'ghiTT', 'ttLoi', 'sauTT', 'toasts', 'loi'];
const lechMuc = (m, n) => SO.filter(p => JSON.stringify(m[p]) !== JSON.stringify(n[p]));

async function kichBan(page) {
  return page.evaluate(async () => {
    const kq = { buoc: {} }; const toasts = [];
    const _t = window.toast; window.toast = function (m) { toasts.push(String(m)); try { return _t.apply(this, arguments); } catch (e) {} };
    window.requireShiftOpened = () => true; window.requireOpeningChecklistDone = () => true;
    window.requireSomeoneCheckedIn = () => true; window.requireSomeoneCheckedInAsync = async () => true;
    MENU = [{ id: 'm1', name: 'Trà sữa Gieo', type: 'Trà sữa', sizes: [{ label: 'M', price: 30000 }, { label: 'L', price: 35000 }] },
            { id: 'm2', name: 'Cà phê muối', type: 'Cà phê', sizes: [{ label: 'M', price: 29000 }] }];
    MENU_TOGO = MENU; TOPPINGS = [{ id: 't1', name: 'Trân châu', price: 5000 }];
    const assist = () => ['assistBarCart', 'assistBarSc', 'assistBarMain'].map(id => { const e = document.getElementById(id); return e ? e.style.display + '|' + e.innerHTML : null; });
    const anh = () => ({ gio: JSON.parse(JSON.stringify(cart)), tong: getCartTotal(), cuoi: getFinalTotal(), assist: assist() });
    const buoc = async (ten, fn) => { try { await fn(); } catch (e) { kq.buoc[ten + '!loi'] = String(e && e.message || e); } await new Promise(r => setTimeout(r, 120)); kq.buoc[ten] = anh(); };
    window.__ghi = [];
    await buoc('them', () => { addCart(MENU[0], MENU[0].sizes[0]); addCart(MENU[0], MENU[0].sizes[0]); addCart(MENU[1], MENU[1].sizes[0]); addCart(MENU[0], MENU[0].sizes[1]); });
    await buoc('tangGiam', () => { const k = Object.keys(cart); cartAdj(k[0], 1); cartAdj(k[1], -1); });
    await buoc('topping', () => { _tpPickerKey = Object.keys(cart)[0]; setCartToppingQty('t1', 2); });
    await buoc('da', () => { _afterIceChange(); });
    await buoc('khach', () => { document.getElementById('cuph').value = '0901234567'; curCustomer = { phone: '0901234567', name: 'Khách E2E', note: '' }; renderCustomerInfo(12, 4); });
    const order = { id: 'o-e2e', billCode: '#07-26.10.26', time: '10:00', date: '26/10/2026', itemsArray: Object.values(cart), total: getFinalTotal(), method: 'TIỀN MẶT', phone: '0901234567', customerName: 'Khách E2E' };
    try { const nd = buildReceiptContent(order, POSPrinter.layout); kq.bill = nd; const c = renderReceiptCanvas(nd); kq.billAnh = c && [c.width, c.height]; } catch (e) { kq.billLoi = String(e.message || e); }
    try { const c = renderTemCanvas(['TRÀ SỮA GIEO', 'Size M · Trân châu x2', '#07']); kq.temAnh = c && [c.width, c.height]; } catch (e) { kq.temLoi = String(e.message || e); }
    kq.ghiTruocTT = window.__ghi.splice(0);
    curPay = 'cash';
    try { await Promise.race([confirmPay(200000, 200000 - getFinalTotal()), new Promise((_, j) => setTimeout(() => j(new Error('quá 10 giây')), 10000))]); } catch (e) { kq.ttLoi = String(e && e.message || e); }
    await new Promise(r => setTimeout(r, 1500));
    kq.ghiTT = window.__ghi.splice(0);
    kq.sauTT = anh(); kq.toasts = toasts;
    return kq;
  });
}

async function chay(b, base, opts) {
  const t = await moTrang(b, base, opts);
  const r = await kichBan(t.page); r.qua = t.qua; r.loi = t.loi.slice().sort();
  await t.ctx.close(); return chuan(r);
}

(async () => {
  const hb = await dungHaiBan(MOC, MUA);
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  let goc = null;
  try {
    for (const [nhan, authNgay] of [['A auth chậm', false], ['B auth ngay', true]]) {
      const kq = {};
      for (const k of ['moc', 'nay']) kq[k] = await chay(b, hb.base[k], { authNgay });
      const m = kq.moc, n = kq.nay;
      chk(!m.ttLoi && !n.ttLoi && (n.toasts || []).some(x => /Thanh toán thành công/.test(x)) && n.sauTT && !Object.keys(n.sauTT.gio || {}).length,
        `(${nhan}) thanh toán THÀNH CÔNG ở cả hai bản: không lỗi, toast «Thanh toán thành công», giỏ trống sau thanh toán` + (n.ttLoi || m.ttLoi ? ' — ' + (n.ttLoi || m.ttLoi) : ''));
      chk(m.qua && n.qua, `(${nhan}) cả hai bản qua chốt dừng`);
      const ghiOrder = (n.ghiTT || []).filter(g => /orders_gieogieo\//.test(g.p) && g.op === 'set');
      chk(ghiOrder.length === 1 && ghiOrder[0].d && ghiOrder[0].d.method === 'TIỀN MẶT', `(${nhan}) bản tách: thanh toán tiền mặt ghi đúng 1 đơn vào orders_gieogieo (kịch bản thật sự đi hết luồng)` + (n.ttLoi ? ' — lỗi: ' + n.ttLoi : ''));
      chk(n.bill && n.bill.length > 5 && n.billAnh && n.temAnh, `(${nhan}) bản tách: dựng + vẽ được bill (${n.bill && n.bill.length} dòng lệnh in) và tem`);
      chk(n.buoc.khach.assist.some(x => x && x.length > 5), `(${nhan}) bản tách: trợ lý có hiện nội dung sau khi có khách`);
      for (const p of SO) {
        const a = JSON.stringify(m[p]), c = JSON.stringify(n[p]);
        chk(a === c, `(${nhan}) giống bản ${MOC}: ${p}` + (a === c ? '' : '\n   mốc ' + (a || '').slice(0, 600) + '\n   nay ' + (c || '').slice(0, 600)));
      }
      if (nhan[0] === 'A') { console.log(`   (${(n.ghiTT || []).length} lượt ghi khi thanh toán: ` + [...new Set((n.ghiTT || []).map(g => g.op + ' ' + String(g.p).split('/')[0]))].join(', ') + ')'); goc = n; }
    }
    // TỰ KIỂM (kiểm toán lượt 07 F07-2): (1) bản hiện tại chạy như đang ở giờ khác (lệch 7 phút) → KHÔNG được báo lệch
    // (giờ thật đã chuẩn hoá theo trường); (2) bản sao in SAI giờ fixture trên bill → PHẢI báo lệch đúng mục `bill`.
    const vnPhut = (new Date(Date.now() + 7 * 3600e3).getUTCHours()) * 60 + new Date().getUTCMinutes();
    const lech = (vnPhut > 23 * 60 ? -1 : 1) * (7 * 60 + 13) * 1000;   // không vượt qua nửa đêm giờ VN
    const t1 = await chay(b, hb.base.nay, { lechGio: lech });
    const l1 = lechMuc(goc, t1);
    chk(!l1.length, '(tự kiểm) cùng bản, giờ thật lệch 7 phút → không báo lệch giả' + (l1.length ? ': ' + l1.join(', ') : ''));
    const fc = path.join('js', 'posgieo', 'pos_print_content.v1.js');
    const sua = await banSua(hb.dir.nay, d => {
      const f = path.join(d, fc); const t = fs.readFileSync(f, 'utf8');
      if (!t.includes('${order.time}')) throw new Error('tự kiểm: không thấy ${order.time} trong ' + fc);
      fs.writeFileSync(f, t.replace('${order.time}', '12:34'));
    });
    try {
      const t2 = await chay(b, sua.base, {}); const l2 = lechMuc(goc, t2);
      chk(JSON.stringify(l2) === JSON.stringify(['bill']), '(tự kiểm) bản cài lỗi in giờ 12:34 thay giờ đơn 10:00 → báo lệch ĐÚNG mục bill' + (JSON.stringify(l2) === JSON.stringify(['bill']) ? '' : ': thấy ' + (l2.join(', ') || 'không lệch')));
    } finally { sua.dong(); }
  } finally { await b.close(); hb.dong(); }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
