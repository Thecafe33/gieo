// pos.html (The Cafe 33) — áp phiếu quà khách đổi trên App vào bill (sửa 13/10/2026).
// Phiếu đổi trên index.html mang mã riêng TC33-xxxx, không có rewardKey → POS trước đây không tìm ra quà,
// im lặng không giảm, lúc thanh toán vẫn đánh dấu phiếu đã dùng.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const src = extract('pos.html', ['giftVoucherResetOld', 'giftVoucherAddToCart', '_escGiftTxt', '_findRewardForGift']);
function make(cache, firestoreHas) {
  const env = { modals: [], scans: 0 };
  const f = new Function('env', [
    '' + `var cart = [], _discountCache = env.cache, _giftVoucherKey = null, _giftVoucherPhone = null, _giftOrderDiscount = null;
    function renderCart() {} function openPickCartModal() {}
    function showAppModal(t, m) { env.modals.push(t); }
    function scanGiftVouchers() { env.scans++; }
    var fstore = { collection: function() { return {
      doc: function() { return { get: function() { return Promise.resolve({ exists: false }); } }; },
      where: function() { return { limit: function() { return { get: function() { return Promise.resolve({ empty: !env.fsHas, docs: env.fsHas ? [{ data: function() { return env.fsHas; } }] : [] }); } }; } }; } }; } };`,
    src,
    'return { get cart() { return cart; }, set cart(v) { cart = v; }, get key() { return _giftVoucherKey; }, giftVoucherAddToCart, _findRewardForGift };'].join('\n'));
  env.cache = cache; env.fsHas = firestoreHas || null;
  return Object.assign(f(env), { env });
}
const BED = { label: 'Voucher +1h sử dụng bed', name: 'Voucher +1h sử dụng bed', type: 'item', value: 15000, targetItems: ['1h bed'], active: true, code: null };
const cache = { gift_A: BED, gift_B: { label: '1 Gấu bông', type: 'fixed', value: 0, active: true } };

(async () => {
  // 1) Đúng ca trong ảnh: 3 × 1h bed, phiếu TC33-Q7BRUM không có rewardKey
  let t = make(cache);
  t.cart = [{ name: '1h bed', size: 'M', price: 15000, qty: 3 }];
  t.giftVoucherAddToCart('0393601460', 'gift_k1', 'Voucher +1h sử dụng bed', 'TC33-Q7BRUM', null);
  await new Promise(r => setTimeout(r, 0));
  const total = t.cart.reduce((s, i) => s + i.price * i.qty, 0);
  eq(total, 30000, 'Phiếu không có rewardKey, mã riêng TC33-… → tìm theo tên quà, giảm 15.000 (45.000 → 30.000)');
  eq(t.cart.map(i => [i.name, i.qty, i.price, !!i._vKey]), [['1h bed', 2, 15000, false], ['1h bed', 1, 0, true]], 'Tách 1 giờ bed thành dòng quà giá 0');
  eq(t.key, 'gift_k1', 'Phiếu được giữ để đánh dấu đã dùng khi thanh toán');

  // 2) Tên khác hoa thường / khoảng trắng vẫn khớp
  eq(!!t._findRewardForGift(cache, 'TC33-XXXX', '  voucher +1h  SỬ DỤNG bed '), true, 'Khớp tên không phân biệt hoa thường, khoảng trắng thừa');
  // 3) Trùng tên → ưu tiên quà đang BẬT
  const dup = { a: Object.assign({}, BED, { active: false, value: 1 }), b: BED };
  eq(t._findRewardForGift(dup, '', BED.label).key, 'b', 'Trùng tên → lấy quà đang BẬT');
  // 4) Mã của quà vẫn ưu tiên trước tên
  eq(t._findRewardForGift({ x: { code: 'C33-ABC', label: 'Khác' }, y: BED }, 'c33-abc', BED.label).key, 'x', 'Khớp mã quà trước, rồi mới tới tên');

  // 5) Không tìm thấy quà → báo, KHÔNG giữ phiếu (để thanh toán không đánh dấu đã dùng)
  t = make({ gift_B: cache.gift_B });
  t.cart = [{ name: '1h bed', size: 'M', price: 15000, qty: 3 }];
  t.giftVoucherAddToCart('0393601460', 'gift_k2', 'Quà đã bị xoá', 'TC33-ZZZ', null);
  await new Promise(r => setTimeout(r, 0));
  eq([t.key, t.env.modals, t.env.scans], [null, ['Không áp được quà'], 1], 'Không có cấu hình → báo "Không áp được quà", bỏ phiếu khỏi bill, làm mới danh sách phiếu');
  eq(t.cart.reduce((s, i) => s + i.price * i.qty, 0), 45000, 'Giỏ giữ nguyên');

  // 6) Phiếu có rewardKey (bản App mới) → dùng thẳng
  t = make(cache);
  t.cart = [{ name: '1h bed', size: 'M', price: 15000, qty: 1 }];
  t.giftVoucherAddToCart('0393601460', 'gift_k3', 'tên bất kỳ', 'TC33-YYY', 'gift_A');
  eq(t.cart.map(i => i.price), [0], 'Phiếu có rewardKey → áp đúng quà');

  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})();

// 7) Mở lại lịch bed sau khi đã áp quà → autoAddBedItems không được xoá dòng quà / thêm trùng giờ
(() => {
  const src2 = extract('pos.html', ['autoAddBedItems']);
  const run = new Function('cart0', [
    'var cart = cart0; var menu = [{ name: "1h bed", priceM: 15000 }, { name: "1h bed từ h5", priceM: 20000 }];',
    'function renderCart() {} function showToast() {}', src2,
    'autoAddBedItems({ start: "14:05", end: "16:29" }); return cart;'].join('\n'));
  const after = run([{ name: '1h bed', size: 'M', price: 15000, qty: 2 },
    { name: '1h bed', size: 'M', price: 0, qty: 1, _vKey: 'gift_k1', _giftType: 'item', _originalPrice: 15000, _originalName: '1h bed' }]);
  const tot = after.reduce((s, i) => s + i.price * i.qty, 0), hours = after.reduce((s, i) => s + (/1h bed/.test(i.name) ? i.qty : 0), 0);
  const res = [tot, hours, after.filter(i => i._vKey).length];
  if (JSON.stringify(res) !== JSON.stringify([30000, 3, 1])) { console.log('FAIL Mở lại lịch giữ dòng quà', JSON.stringify(res)); process.exitCode = 1; console.log('SOME FAIL'); }
  else console.log('ok Mở lại lịch bed (3 giờ) sau khi áp quà → vẫn 2 × 15.000 + 1 dòng quà, không thêm trùng');
  const fresh = run([]);
  const r2 = [fresh.reduce((s, i) => s + i.price * i.qty, 0), fresh.length];
  if (JSON.stringify(r2) !== JSON.stringify([45000, 1])) { console.log('FAIL Lịch mới', JSON.stringify(r2)); process.exitCode = 1; console.log('SOME FAIL'); }
  else console.log('ok Lịch chưa áp quà → 3 × 1h bed như cũ');
})();
