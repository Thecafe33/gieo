'use strict';
// «Khách tự chọn topping» (chủ dự án 31/10/2026) — js/posgieo/pos_pick_topping.v1.js + pos_cart.v2.js + form Menu (quanlygieo).
//  - món có pickTopping: bấm Thanh toán → chọn ĐÚNG n topping/ly (được trùng) hoặc «không lấy» → mới sang bước đá;
//  - topping lưu price 0, có id (kho + giá vốn đọc theo id), cờ _pickTpMark (KHÔNG _freeTpMark); mỗi ly một dòng;
//  - món thường / đồ ăn / ly đã chọn → đi thẳng; ✕ = huỷ lượt thanh toán; cấu hình hỏng → coi như món thường.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let bad = 0;
const ok = (c, m) => { if (c) console.log('ok ' + m); else { bad++; console.log('FAIL ' + m); } };

function make() {
  const log = { toast: [], next: 0, shown: {} };
  const els = {};
  const el = id => (els[id] = els[id] || { innerHTML: '', textContent: '', style: {}, classList: { add() { log.shown[id] = true; }, remove() { log.shown[id] = false; } } });
  const ctx = {
    console, Math, Date, Object, Array, Number, String, JSON,
    window: {}, cart: {}, PosGieoMods: {},
    TOPPINGS: [{ id: 'tc', name: 'Trân châu' }, { id: 'thach', name: 'Thạch' }, { id: 'pd', name: 'Pudding' }],
    MENU: [
      { id: 'tt', name: 'Trà tự chọn', sizes: [{ label: 'M', price: 30000 }], pickTopping: { n: 2, toppingIds: ['tc', 'thach'] } },
      { id: 'thuong', name: 'Trà thường', sizes: [{ label: 'M', price: 25000 }], pickTopping: null },
    ],
    getActiveMenu() { return ctx.MENU; },
    toast: m => log.toast.push(m), escHtmlPos: s => String(s),
    tpQty: t => Math.max(1, Number(t && t.qty) || 1),
    renderCartDrawer() {},
    document: { getElementById: el },
    splitCartEntryToUnits(key) {
      const c = ctx.cart[key];
      if (c.qty <= 1) return [key];
      delete ctx.cart[key];
      const out = [];
      for (let i = 0; i < c.qty; i++) { const nk = key + '_u' + i; ctx.cart[nk] = { ...c, qty: 1, toppings: (c.toppings || []).map(t => ({ ...t })) }; out.push(nk); }
      return out;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/posgieo/pos_pick_topping.v1.js'), 'utf8'), ctx);
  // let ở top-level không lên ctx — truy cập qua hàm
  return { ctx, log, run: code => vm.runInContext(code, ctx) };
}

// 1. cấu hình
{ const { run } = make();
  ok(run("normPickToppingCfg({n:2,toppingIds:['a']})").n === 2, 'cấu hình hợp lệ giữ n');
  ok(run("normPickToppingCfg({n:0,toppingIds:['a']})") === null, 'n = 0 → null');
  ok(run("normPickToppingCfg({n:2,toppingIds:[]})") === null, 'không topping → null');
  ok(run("normPickToppingCfg('x')") === null, 'sai kiểu → null'); }

// 2. món thường / đồ ăn → đi thẳng
{ const { ctx, log, run } = make();
  ctx.cart = { thuong_M: { itemId: 'thuong', name: 'Trà thường', size: 'M', qty: 2 }, f: { itemId: 'tt', isFood: true, qty: 1 } };
  run('pickToppingBeforePay(() => { globalThis.__n = 1; })');
  ok(ctx.__n === 1 && !log.shown.pickTpUnitsPopup, 'không có món tự chọn → chạy bước kế ngay, không popup'); }

// 3. 1 ly: mở thẳng bảng chọn, đủ n → đi tiếp; topping đúng dạng
{ const { ctx, log, run } = make();
  ctx.cart = { tt_M: { itemId: 'tt', name: 'Trà tự chọn', size: 'M', price: 30000, qty: 1 } };
  run('pickToppingBeforePay(() => { globalThis.__n = (globalThis.__n||0) + 1; })');
  ok(log.shown.pickTpPopup === true && !ctx.__n, '1 ly → mở thẳng bảng chọn, chưa đi tiếp');
  run("pickTpAdj('tc',1)"); run('confirmPickTp()');
  ok(!ctx.__n && log.toast.some(t => /đủ 2/.test(t)), 'chưa đủ n → báo, không đi tiếp');
  run("pickTpAdj('tc',1)"); // trùng loại: tc ×2
  run("pickTpAdj('thach',1)");
  ok(log.toast.some(t => /Chỉ được chọn 2/.test(t)), 'vượt n → chặn');
  run('confirmPickTp()');
  const c = ctx.cart.tt_M;
  ok(ctx.__n === 1, 'chọn đủ → sang bước kế (đá) tự động');
  ok(c.pickTpApplied === true && c.toppings.length === 1, 'đánh dấu pickTpApplied');
  const t = c.toppings[0];
  ok(t.id === 'tc' && t.qty === 2 && t.price === 0 && t._pickTpMark === true && !t._freeTpMark && /\(Tự chọn\)$/.test(t.name), 'topping: id, qty 2 (trùng loại), giá 0, _pickTpMark, không _freeTpMark'); }

// 4. nhiều ly: tách từng ly; ✕ = huỷ; "không lấy topping"
{ const { ctx, log, run } = make();
  ctx.cart = { tt_M: { itemId: 'tt', name: 'Trà tự chọn', size: 'M', price: 30000, qty: 3 } };
  run('pickToppingBeforePay(() => { globalThis.__n = (globalThis.__n||0) + 1; })');
  const keys = Object.keys(ctx.cart);
  ok(keys.length === 3 && keys.every(k => ctx.cart[k].qty === 1), '3 ly → 3 dòng riêng');
  ok(log.shown.pickTpUnitsPopup === true && !log.shown.pickTpPopup, 'nhiều ly → hiện danh sách ly, chưa mở bảng chọn');
  run(`openPickTpPicker('${keys[0]}')`); run("pickTpAdj('tc',1)"); run("pickTpAdj('thach',1)"); run('confirmPickTp()');
  run(`openPickTpPicker('${keys[1]}')`); run('pickTpNone()');
  ok(ctx.cart[keys[1]].pickTpApplied === true && !ctx.cart[keys[1]].toppings.length, '«không lấy topping» → pickTpApplied, 0 topping');
  ok(!ctx.__n && log.shown.pickTpUnitsPopup, 'còn 1 ly chưa chọn → chưa đi tiếp');
  run('closePickTpUnits()');
  ok(!ctx.__n && log.shown.pickTpUnitsPopup === false, '✕ → huỷ lượt thanh toán');
  // bấm thanh toán lại: chỉ còn 1 ly chưa chọn
  run('pickToppingBeforePay(() => { globalThis.__n = 7; })');
  ok(Object.keys(ctx.cart).length === 3 && log.shown.pickTpPopup === true, 'lần sau chỉ hỏi ly chưa chọn (mở thẳng bảng chọn)');
  run("pickTpAdj('thach',2)"); run('confirmPickTp()');
  ok(ctx.__n === 7, 'ly cuối xong → đi tiếp'); }

// 5. đổi lựa chọn: nạp lại lựa chọn cũ, không nhân đôi topping
{ const { ctx, run } = make();
  ctx.cart = { a: { itemId: 'tt', name: 'x', size: 'M', qty: 1, pickTpApplied: true, toppings: [{ id: 'tc', name: 'Trân châu (Tự chọn)', price: 0, qty: 2, _pickTpMark: true }, { id: 'pd', name: 'Pudding', price: 5000, qty: 1 }] } };
  run("_pickTpUnits = ['a']; openPickTpPicker('a')");
  ok(run('_pickTpTotal()') === 2, 'mở lại ly đã chọn → nạp 2 phần cũ');
  run("pickTpAdj('tc',-1)"); run("pickTpAdj('thach',1)"); run('confirmPickTp()');
  const tp = ctx.cart.a.toppings;
  ok(tp.filter(t => t._pickTpMark).length === 2 && tp.some(t => t.id === 'pd' && t.price === 5000), 'ghi lại đúng, topping trả tiền thêm tay giữ nguyên'); }

// 6. mã nguồn: cart v2 gọi đúng thứ tự, HTML nạp đúng file, parse menu mang pickTopping
{ const v2 = fs.readFileSync(path.join(ROOT, 'js/posgieo/pos_cart.v2.js'), 'utf8');
  ok(/checkTogoBeforeCheckout\(\(\) => pickToppingBeforePay\(\(\) => askIceBeforePay\(/.test(v2), 'onCheckoutClick: topping TRƯỚC đá');
  ok((v2.match(/pickTpApplied/g) || []).length >= 2, 'addCart / cartQty không cộng dồn vào dòng đã chọn');
  const html = fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8');
  ok(/pos_cart\.v2\.js/.test(html) && !/pos_cart\.v1\.js"/.test(html.replace(/\/\/.*$/gm, '')), 'posgieo.html nạp cart v2');
  ok(/pos_pick_topping\.v1\.js/.test(html) && /pickTp: 'js\/posgieo\/pos_pick_topping\.v1\.js'/.test(html), 'posgieo.html nạp module + khai thiết yếu');
  ok(/pickTopping: normPickToppingCfg\(pickTopping\)/.test(html), 'parseMenuSnap POS mang pickTopping');
  ok(/c\.freeTpApplied \|\| c\.pickTpApplied/.test(html), 'mergePlainCartLines không gộp ly đã chọn');
  const ql = fs.readFileSync(path.join(ROOT, 'quanlygieo.html'), 'utf8');
  ok(/data\.pickTopping = \{ n, toppingIds: ids \}/.test(ql) && /pickTopping: normPickToppingCfg\(val\.pickTopping\)/.test(ql), 'quanlygieo: lưu + đọc pickTopping');
  for (const f of ['quanlygieo2.html', 'ban_deploy/thuong/posgieo.html', 'ban_deploy/thuong/quanlygieo2.html']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(/pickTopping|pos_pick_topping/.test(t), f + ' đã sinh lại có tính năng');
  } }

console.log(bad ? 'SOME FAIL' : 'ALL PASS');
process.exit(bad ? 1 : 0);
