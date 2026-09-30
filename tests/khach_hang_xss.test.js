// POS: tên khách (bảng `customers` dùng chung XOFA) phải được lọc ký tự HTML khi hiện gợi ý số điện thoại;
// id khách không phải chuỗi số bị bỏ (không lọt vào onclick).
'use strict';
const { runWrapped } = require('./lib/wrap_harness');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
(async () => {
  const r = await runWrapped('engine', {
    app: 'pos', target: 'onPhoneInput', helpers: ['escHtmlPos'], seed: { rt: {}, fs: {} },
    scope: (fake, rec, dom) => {
      dom['phone-autocomplete'] = { innerHTML: '', style: {} }; dom.cuph = { value: '' };
      return { allCustomersCache: [
        { id: '0901234567', nickname: '<img src=x onerror=alert(1)>', total_points: 5 },
        { id: "09'+alert(1)+'", name: 'Lạ', total_points: 1 },
        { id: '0907654321', name: 'An & Bình', total_points: 2 }], fetchAllCustomersCache: () => {}, lookupCustomer: () => {}, requestClearCustomer: () => {}, _phoneClearPending: false };
    },
    call: async (F, fake, base) => { F.onPhoneInput('090'); return base.__dom['phone-autocomplete'].innerHTML; }
  });
  const html = r.result || '';
  eq([html.includes('<img'), html.includes('&lt;img'), html.includes("alert(1)'"), html.includes('An &amp; Bình')], [false, true, false, true], 'tên khách bị lọc HTML; id lạ bị bỏ');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
