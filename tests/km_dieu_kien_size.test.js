// Khuyến mãi "Mua X tặng Y" — ĐIỀU KIỆN SIZE (10/10): gift.sizes rỗng = mọi size (như cũ); chọn L → chỉ ly trả tiền size L
// mới tính vào "Số ly mua". Hàm thật từ posgieo.html (giỏ hàng, togoSettings giả).
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const src = extract('posgieo.html', ['getCartTotalQty', 'giftEligibleQtyPOS', 'giftSizeNotePOS', 'checkTogoBeforeCheckout']);
const chay = (cart, gift) => {
  const vet = { popup: null, tiep: 0 };
  const stubs = { cart, togoSettings: { gift: Object.assign({ enabled: true, buyQty: 2, freeQty: 1 }, gift), discount: { enabled: false } },
    openTogoGiftPopup: n => { vet.popup = n; }, getCartTotal: () => 0, toast() {}, fmt: x => String(x) };
  const ks = Object.keys(stubs);
  const F = new Function(...ks, 'let togoDiscountAmt = 0;\n' + src + '\nreturn { giftEligibleQtyPOS, giftSizeNotePOS, checkTogoBeforeCheckout };')(...ks.map(k => stubs[k]));
  F.checkTogoBeforeCheckout(() => { vet.tiep++; });
  return Object.assign(vet, { qty: F.giftEligibleQtyPOS(), note: F.giftSizeNotePOS() });
};
const L = (n, extra) => Object.assign({ itemId: 'a', size: 'L', qty: n, price: 35000 }, extra || {});
const M = n => ({ itemId: 'b', size: 'M', qty: n, price: 29000 });

let r = chay({ x: M(1), y: L(1) }, {});
eq([r.qty, r.popup, r.tiep], [2, 1, 0], 'không chọn size: 1 M + 1 L = 2 ly → được tặng (như cũ)');
r = chay({ x: M(1), y: L(1) }, { sizes: [] });
eq([r.qty, r.popup], [2, 1], 'sizes rỗng = mọi size');
r = chay({ x: M(1), y: L(1) }, { sizes: ['L'] });
eq([r.qty, r.popup, r.tiep], [1, null, 1], 'chọn L: 1 M + 1 L chỉ tính 1 ly → KHÔNG tặng, thanh toán bình thường');
r = chay({ x: M(3), y: L(2) }, { sizes: ['L'] });
eq([r.qty, r.popup, r.note], [2, 1, ' size L'], 'chọn L: 2 ly L (+3 M) → tặng 1');
r = chay({ y: L(4) }, { sizes: ['L'] });
eq(r.popup, 2, 'chọn L: 4 ly L → tặng 2 (bội số)');
r = chay({ y: L(1), f: L(1, { isFree: true }), d: { itemId: 'fd', size: '-', qty: 3, isFood: true } }, { sizes: ['L'] });
eq(r.qty, 1, 'chọn L: không tính ly tặng, đồ ăn');
r = chay({ x: M(1), y: L(1) }, { sizes: ['M', 'L'] });
eq(r.qty, 2, 'chọn cả M và L = tính cả hai');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
