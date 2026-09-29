// F4 — ly miễn phí theo tem tách khỏi voucher: trừ đúng 1 lần, không ghi myGifts/rewards,
// bỏ ly khỏi giỏ thì không trừ, không "+" được ly tem.
const fs = require('fs');
const path = require('path');
const src = [
  'let cart = {}; let _stampFreePhone = null; let _stampFreeNeedConvert = false; let _stampFreeOriginalStamp = 0; let _stampFreeVKey = null;',
  require('./lib/extract').extract('posgieo.html', ['_stampFreeSyncCart', 'resetDiscountState', '_finalizeStampFreeAfterPay', 'cartAdj', 'cartDel'])
].join('\n');
function mk(customers) {
  const FS = {}; const writes = []; const toasts = [];
  for (const [k, v] of Object.entries(customers)) FS['customers/' + k] = { ...v };
  const docApi = (c, d) => ({ _k: c + '/' + d });
  const fstore = {
    collection: c => ({ doc: d => ({ ...docApi(c, d),
      set: async (x, o) => { writes.push(['set', c + '/' + d]); FS[c + '/' + d] = (o && o.merge) ? { ...(FS[c + '/' + d] || {}), ...x } : { ...x }; } }) }),
    runTransaction: async fn => {
      const ops = [];
      const t = {
        get: async r => ({ exists: !!FS[r._k], data: () => ({ ...FS[r._k] }) }),
        update: (r, x) => ops.push(() => { writes.push(['update', r._k, Object.keys(x)]); FS[r._k] = { ...FS[r._k], ...x }; }),
        set: (r, x) => ops.push(() => { writes.push(['set', r._k]); FS[r._k] = { ...x }; })
      };
      await fn(t); ops.forEach(o => o());
    }
  };
  const ctx = { fstore, UnitEngine: { util: { retry: async f => f() } }, toast: m => toasts.push(m), renderMenu() {}, renderCartDrawer() {},
    renderFreeTpReminder() {}, cartIceDefault: 'chung', FS, writes, toasts };
  const names = Object.keys(ctx).filter(n => !['FS', 'writes', 'toasts'].includes(n));
  const api = new Function(...names, src + `
    return { _finalizeStampFreeAfterPay, cartAdj, cartDel, resetDiscountState,
      set(o) { if ('cart' in o) cart = o.cart; if ('phone' in o) _stampFreePhone = o.phone; if ('vkey' in o) _stampFreeVKey = o.vkey; },
      get() { return { cart, phone: _stampFreePhone, vkey: _stampFreeVKey }; } };`)(...names.map(n => ctx[n]));
  return { api, FS, writes, toasts };
}
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const V = '__free_stamp__1';
const cup = () => ({ itemId: 'm1', name: 'Trà', size: 'M', price: 0, qty: 1, _vKey: V, _giftType: 'item_free', _originalPrice: 35000 });
(async () => {
  // T1: có ly tem trong bill → trừ 1 ly, gọi lại cùng bill không trừ thêm, không đụng myGifts / voucher_effects
  let e = mk({ '0900': { free_drink_available: 1, stamp_count: 2 } });
  e.api.set({ phone: '0900', vkey: V });
  await e.api._finalizeStampFreeAfterPay('b1', [cup()]);
  e.api.set({ phone: '0900', vkey: V });
  await e.api._finalizeStampFreeAfterPay('b1', [cup()]);
  eq([e.FS['customers/0900'].free_drink_available, e.FS['customers/0900'].stamp_count], [0, 2], 'T1 trừ đúng 1 ly');
  eq(e.writes.filter(w => w[0] === 'update').length, 1, 'T1 idempotent theo bill');
  eq(e.writes.some(w => /myGifts|voucher_effects|rewards|discount_effects/.test(JSON.stringify(w))), false, 'T1 không ghi myGifts/rewards');
  eq([e.api.get().phone, e.api.get().vkey], [null, null], 'T1 dọn ý định');
  // T2: đủ 6 tem chưa đổi → convert rồi trừ
  e = mk({ '0901': { free_drink_available: 0, stamp_count: 7 } });
  e.api.set({ phone: '0901', vkey: V });
  await e.api._finalizeStampFreeAfterPay('b2', [cup()]);
  eq([e.FS['customers/0901'].free_drink_available, e.FS['customers/0901'].stamp_count], [0, 1], 'T2 convert 6 tem');
  // T3: bill không còn ly tem → không trừ
  e = mk({ '0902': { free_drink_available: 1 } });
  e.api.set({ phone: '0902', vkey: V });
  await e.api._finalizeStampFreeAfterPay('b3', [{ itemId: 'x', qty: 1, price: 30000 }]);
  eq([e.FS['customers/0902'].free_drink_available, e.writes.length], [1, 0], 'T3 bill không có ly tem → không ghi');
  // T4: xoá ly tem khỏi giỏ → huỷ ý định
  e = mk({});
  e.api.set({ cart: { a: { itemId: 'x', qty: 1 }, s: cup() }, phone: '0903', vkey: V });
  e.api.cartDel('s');
  eq([e.api.get().phone, e.api.get().vkey], [null, null], 'T4 cartDel huỷ ý định');
  // T5: "+" ly tem bị chặn; "−" về 0 → bỏ ly + huỷ ý định; "+" món thường vẫn chạy
  e = mk({});
  e.api.set({ cart: { a: { itemId: 'x', qty: 1 }, s: cup() }, phone: '0904', vkey: V });
  e.api.cartAdj('s', 1);
  eq([e.api.get().cart.s.qty, e.toasts.length], [1, 1], 'T5 chặn "+" ly tem');
  e.api.cartAdj('a', 1);
  eq(e.api.get().cart.a.qty, 2, 'T5 "+" món thường');
  e.api.cartAdj('s', -1);
  eq([!!e.api.get().cart.s, e.api.get().phone], [false, null], 'T5 "−" về 0 huỷ ý định');
  // T6: resetDiscountState trả ly tem về giá gốc (hành vi cũ của removeGiftVoucher)
  e = mk({});
  e.api.set({ cart: { s: cup() }, phone: '0905', vkey: V });
  e.api.resetDiscountState();
  const s6 = e.api.get();
  eq([s6.cart.s.price, s6.cart.s._vKey, s6.phone, s6.vkey], [35000, undefined, null, null], 'T6 reset trả giá gốc');
  // T7: POS không còn đọc/ghi rewards, myGifts, marker voucher/discount
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'posgieo.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const code = html.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  eq([/collection\(\s*['"]rewards['"]/.test(code), /myGifts\./.test(code), /voucher_effects_gieogieo|discount_effects_gieogieo/.test(code)], [false, false, false], 'T7 không còn rewards/myGifts');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
