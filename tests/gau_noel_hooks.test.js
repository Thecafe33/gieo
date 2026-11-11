// Gấu Noel 2026 — HỢP ĐỒNG GẮN VÀO APP (tĩnh): phần gắn của gau_noel_giangsinh.v3.js chỉ BỌC hàm sẵn có của 3 POS, nên
// (1) hàm bị bọc phải còn là hàm toàn cục, (2) nơi gọi phải truyền đủ tham số mà phần gắn đọc (mã bill!), (3) thẻ <script> gấu
// phải nằm SAU mọi script nạp hàm đó. e2e (tools/gau_noel/e2e_gau.js) tự gọi hàm bằng tham số giả nên KHÔNG bắt được lỗi
// «nơi gọi thật không truyền mã bill» (PosX 10/11: _loyaltyAfterSave(items, total) → bill rỗng → XOFA không bao giờ có lượt).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const bo = s => s.replace(/\/\/[^\n]*/g, '');   // bỏ chú thích // (đủ cho kiểm tra này)

/** Chia danh sách tham số ở mức ngoặc ngoài cùng (bỏ qua dấu phẩy trong ngoặc con). */
function thamSo(s) {
  const out = []; let d = 0, cur = '';
  for (const c of s) {
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** Mọi lời gọi `ten(...)` (không phải khai báo `function ten`) → mảng tham số. */
function loiGoi(src, ten) {
  const re = new RegExp('(^|[^\\w.$])' + ten + '\\s*\\(', 'g'), rs = [];
  let m; src = bo(src);
  while ((m = re.exec(src))) {
    const truoc = src.slice(Math.max(0, m.index - 12), m.index + m[1].length);
    if (/function\s*$/.test(truoc) || /async\s+function\s*$/.test(truoc)) continue;
    let i = re.lastIndex, d = 1, j = i;
    for (; j < src.length && d > 0; j++) { if ('([{'.includes(src[j])) d++; else if (')]}'.includes(src[j])) d--; }
    rs.push(thamSo(src.slice(i, j - 1)));
  }
  return rs;
}
function khaiBao(src, ten) {
  const m = new RegExp('(^|\\n)(async\\s+)?function\\s+' + ten + '\\s*\\(([^)]*)\\)', '').exec(src);
  return m ? thamSo(m[3]) : null;
}

// ── PosX (XOFA): phần gắn đọc (items, total, orderId) của _loyaltyAfterSave
{
  const s = rd('PosX.html');
  chk(!!khaiBao(s, '_loyaltyAfterSave'), 'PosX: còn hàm _loyaltyAfterSave (phần gắn bọc hàm này)');
  const g = loiGoi(s, '_loyaltyAfterSave');
  chk(g.length === 2, 'PosX: 2 nơi gọi _loyaltyAfterSave (confirmPay + Tính riêng) — thêm nơi gọi mới thì phải thêm vào test', g.length);
  chk(g.every(a => a.length === 3 && /\bref\.key\b/.test(a[2])), 'PosX: MỌI nơi gọi _loyaltyAfterSave truyền ref.key (mã bill) làm tham số thứ 3', g.map(a => a.join('|')));
  chk(/\.push\(order\)\s*\.then\(\s*ref\s*=>/.test(s), 'PosX: nơi gọi nằm trong .push(order).then(ref => …) nên có ref.key');
  for (const t of ['renderCustomerInfo', 'clearCustomer', 'delOrderConfirm']) chk(!!khaiBao(s, t), 'PosX: còn hàm ' + t);
}

// ── pos.html (TC33): phần gắn đọc (orderData, finalSdt, currentBooking, isCheckout, done); orderData.id = mã bill
{
  const s = rd('pos.html');
  const kb = khaiBao(s, '_pushPaidOrder');
  chk(kb && kb.join() === 'orderData,finalSdt,currentBooking,isCheckout,done', 'TC33: _pushPaidOrder(orderData, finalSdt, currentBooking, isCheckout, done) đúng thứ tự phần gắn đọc', kb);
  const g = loiGoi(s, '_pushPaidOrder');
  chk(g.length >= 2 && g.every(a => a.length === 5), 'TC33: mọi nơi gọi _pushPaidOrder truyền đủ 5 tham số', g.map(a => a.length));
  chk(/const orderData = \{\s*id:\s*Date\.now\(\)/.test(s), 'TC33: orderData có id (mã bill) ngay khi dựng đơn');
  const cl = loiGoi(s, 'clearDebtAfterPayment');
  chk(cl.length === 1, 'TC33: clearDebtAfterPayment chỉ gọi ở nhánh lưu thành công của _pushPaidOrder (phần gắn dựa vào đó để bốc)', cl.length);
  for (const t of ['checkSdtLive', 'resetPhoneInput']) chk(!!khaiBao(s, t), 'TC33: còn hàm ' + t);
}

// ── posgieo: assistFinalizeOrder(order, orderId) + hàm in bill/khách/xoá bill nằm trong module nạp TRƯỚC thẻ gấu
{
  const html = rd('posgieo.html'), th = rd('js/posgieo/pos_thanh_toan.v1.js'), as = rd('js/posgieo/pos_assist.v1.js');
  const kb = khaiBao(as, 'assistFinalizeOrder');
  chk(kb && kb.join() === 'order,orderId', 'Gieo: assistFinalizeOrder(order, orderId) đúng thứ tự phần gắn đọc', kb);
  const g = loiGoi(th, 'assistFinalizeOrder');
  chk(g.length >= 2 && g.every(a => a.length === 2 && /billRef\.key/.test(a[1])), 'Gieo: MỌI nơi gọi assistFinalizeOrder truyền billRef.key (mã bill)', g.map(a => a.join('|')));
  const tag = html.indexOf('gau_noel_giangsinh.v3.js');
  const nap = f => html.indexOf('src="' + f + '"');
  const mods = { assistFinalizeOrder: 'js/posgieo/pos_assist.v1.js', buildReceiptContent: 'js/posgieo/pos_print_content.v1.js', renderReceiptCanvas: 'js/posgieo/pos_print_content.v1.js',
    renderCustomerInfo: 'js/posgieo/pos_customers.v1.js', clearCustomer: 'js/posgieo/pos_customers.v1.js', delOrderConfirm: 'js/posgieo/pos_orders.v1.js' };
  for (const [fn, f] of Object.entries(mods)) {
    chk(!!khaiBao(rd(f), fn), 'Gieo: ' + fn + ' khai báo toàn cục trong ' + f);
    chk(nap(f) > 0 && nap(f) < tag, 'Gieo: ' + f + ' nạp TRƯỚC thẻ gấu (nạp sau thì ghi đè phần bọc)');
  }
  chk(/autoPrintIfEnabled\s*\(order\)/.test(rd('js/posgieo/pos_printer.v1.js')) || /autoPrintIfEnabled\s*\(order\)/.test(html), 'Gieo: POSPrinter.autoPrintIfEnabled(order) còn nhận 1 tham số order (khoá WeakMap hỏi nơi quay)');
}

// ── thẻ gấu phải là script CUỐI của app (sau mọi script khác nạp hàm bị bọc) và có đủ data-quan
for (const [f, q] of [['pos.html', 'tc33'], ['PosX.html', 'xofa'], ['posgieo.html', 'gieo'], ['kiosk.html', 'kiosk'], ['index_giangsinh.html', 'khach']]) {
  const s = rd(f), tag = s.indexOf('<script src="gau_noel_giangsinh.v3.js"'), conLai = s.slice(tag + 30);
  chk(tag > 0 && new RegExp('gau_noel_giangsinh\\.v3\\.js"\\s+data-quan="' + q + '"').test(s), f + ': có thẻ gấu data-quan="' + q + '"');
  // posgieo: sau thẻ gấu còn các file Engine 2 / trợ lý tự động — không khai báo lại hàm gấu bọc (kiểm ngay dưới)
  const sau = (conLai.match(/<script[^>]*\ssrc="([^"]+)"/g) || []).map(x => /src="([^"]+)"/.exec(x)[1]);
  const duocPhep = f === 'posgieo.html' ? ['gieo_automation_pos.v3.js', 'unit_engine2_v1.js', 'unit_engine2_staffing_v1.js', 'unit_engine2_store_v5.js', 'gieo_engine2_pos_v5.js'] : [];
  chk(sau.every(x => duocPhep.indexOf(x) >= 0), f + ': sau thẻ gấu chỉ còn script đã kiểm (không khai báo lại hàm bị bọc)', sau);
  for (const x of sau) if (duocPhep.indexOf(x) >= 0) chk(!/\bfunction\s+(assistFinalizeOrder|buildReceiptContent|renderReceiptCanvas|renderCustomerInfo|clearCustomer|delOrderConfirm)\b|autoPrintIfEnabled\s*=/.test(rd(x)), f + ': ' + x + ' không khai báo lại hàm gấu bọc');
}
{
  const ban = rd('ban_deploy/giangsinh/index.html');
  chk(/gau_noel_giangsinh\.v3\.js"\s+data-quan="khach"/.test(ban), 'bản deploy giangsinh/index.html (app khách) có thẻ gấu');
  chk(!/gau_noel_giangsinh/.test(rd('index.html')), 'index.html gốc không mang thẻ gấu (chỉ bản Giáng sinh)');
}
// ── file mà app KHÁCH nạp được (gau_noel_giangsinh.v3.js): không mang PIN xoá bill, không nhắc tên file POS / chú thích về rules
{
  const g = rd('gau_noel_giangsinh.v3.js');
  chk(!/3367/.test(g), 'gấu v3 (file khách nạp): không chứa PIN xoá bill');
  chk(!/\b(PosX|posgieo|pos|manage|quanlygieo|kiosk)\.html\b/i.test(g), 'gấu v3 (file khách nạp): không nhắc tên file POS / quản lý');
  chk(!/toàn quyền/.test(g), 'gấu v3 (file khách nạp): không có chú thích về rules Firebase');
}
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); if (!ok) process.exit(1);
