'use strict';
// Bill chung (manage.html) — cách hiển thị chi tiết bill phải CỘNG RA ĐÚNG tổng bill:
//  · dòng ly = giá ly, topping dòng riêng (không cộng topping vào ly rồi hiện lại lần nữa);
//  · Đồng giá (XOFA) gắn đúng món được giảm + tag; bill không đủ dữ liệu thì không đoán món.
const vm = require('vm');
const { extract } = require('./lib/extract');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) bad++; };
const ctx = { esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  money: n => Math.round(n || 0).toLocaleString('vi-VN') };
vm.createContext(ctx);
vm.runInContext("const bfGuest=s=>{s=String(s||'').trim();return s&&!/vãng lai/i.test(s)?s:''};\n" + extract('manage.html', ['bfItems', 'stampPromotionLabel', 'bfIsDg', 'bfDgPlan', 'bfLineModel', 'bfDetails'], { vnDate: false }) +
  '\nthis.F={bfDetails,bfDgPlan,bfLineModel,bfItems,bfIsDg};', ctx);
const F = ctx.F;
// cộng các dòng như người đọc: ly + từng topping
const sumLines = o => { const plan = F.bfDgPlan(o); return F.bfItems(o).reduce((n, c) => { const m = F.bfLineModel(c, plan); return n + m.amount + m.tops.reduce((a, t) => a + t.amount, 0); }, 0); };

// 1) Gieo: sữa gạo 25k + 1 trân châu 5k → 30k (không phải 35k)
const A = { total: 30000, itemsArray: [{ name: 'Sữa gạo', size: 'M', qty: 1, price: 25000, toppings: [{ name: 'Trân châu', price: 5000 }] }] };
const hA = F.bfDetails({ o: A });
ok(sumLines(A) === A.total, 'Gieo: cộng các dòng = tổng bill 30.000');
ok(/<b class="num">25\.000đ<\/b>/.test(hA) && /\+ Trân châu<\/span><b class="num">5\.000đ/.test(hA) && !/30\.000đ/.test(hA), 'dòng ly hiện 25.000, topping hiện 5.000, không còn dòng 30.000');
// 2) nhiều ly: topping tính theo ly
const Q = { total: 2 * 25000 + 2 * 5000, itemsArray: [{ name: 'Sữa gạo', qty: 2, price: 25000, toppings: [{ name: 'Trân châu', price: 5000 }] }] };
ok(sumLines(Q) === Q.total && /Trân châu ×2/.test(F.bfDetails({ o: Q })), '2 ly cùng topping: topping ×2, tổng khớp');
// topping có qty
const T = { total: 25000 + 3 * 5000, itemsArray: [{ name: 'X', qty: 1, price: 25000, toppings: [{ name: 'Trân châu', price: 5000, qty: 3 }] }] };
ok(sumLines(T) === T.total, 'topping qty 3 → 15.000');
// 3) ly tặng có topping trả tiền: ly 0đ, topping vẫn tính
const G = { total: 5000, itemsArray: [{ name: 'Ly tặng', qty: 1, price: 0, isFree: true, toppings: [{ name: 'Trân châu', price: 5000 }] }] };
ok(sumLines(G) === G.total && /Tặng/.test(F.bfDetails({ o: G })), 'ly tặng + topping trả tiền: tổng khớp, có nhãn Tặng');
const G2 = { total: 0, itemsArray: [{ name: 'Ly', qty: 1, price: 25000, toppings: [{ name: 'TC', price: 0 }] }].map(x => ({ ...x, isFree: true })) };
ok(/>Tặng<\/b>/.test(F.bfDetails({ o: G2 })), 'topping 0đ → ghi Tặng');

// 4) XOFA Đồng giá: 2 ly M (35k→25k), 1 ly L (45k→35k) + topping 5k, 1 ly ngoài danh sách 40k
const itemsDg = [
  { itemId: 'a', name: 'Matcha', size: 'M', qty: 2, price: 35000, toppings: [{ name: 'Trân châu', price: 5000 }] },
  { itemId: 'a', name: 'Matcha', size: 'L', qty: 1, price: 45000 },
  { itemId: 'b', name: 'Cà phê', size: 'M', qty: 1, price: 40000 }];
const dg = (35000 - 25000) * 2 + (45000 - 35000);
const base = itemsDg.reduce((n, c) => n + (c.price + (c.toppings || []).reduce((a, t) => a + t.price, 0)) * c.qty, 0);
const B = { total: base - dg, discountAmt: dg, dgDiscount: dg, dgItemIds: ['a'], dgFixedPrice: 25000, dgFixedPriceL: 35000, itemsArray: itemsDg };
const hB = F.bfDetails({ o: B });
ok(!!F.bfDgPlan(B), 'Đồng giá: tính lại khớp dgDiscount → gắn vào món');
ok(sumLines(B) === B.total, 'Đồng giá: cộng các dòng (giá sau đồng giá + topping) = tổng bill');
ok((hB.match(/bf-dgtag/g) || []).length === 2 && /50\.000đ<\/b><s class="num">70\.000đ/.test(hB) && /35\.000đ<\/b><s class="num">45\.000đ/.test(hB), 'đúng 2 dòng có tag Đồng giá, giá mới + giá gốc gạch');
ok(!/Cà phê[^]*bf-dgtag[^]*$/.test(hB.split('Matcha')[2] ? hB.split('Matcha')[2].split('Cà phê')[1] || '' : ''), 'món ngoài danh sách không có tag');
ok(/Đồng giá<\/span><b>−30\.000đ \(đã trừ vào từng món\)/.test(hB) && !/Giảm giá khác/.test(hB), 'dòng thông tin chung nói đã trừ vào món, không còn khoản giảm lẻ');
// 5) Đồng giá + giảm khác (app/To Go): phần còn lại hiện riêng, ghi rõ là trừ chung
const D = { ...B, discountAmt: dg + 4000, total: B.total - 4000 };
ok(/Giảm giá khác<\/span><b>−4\.000đ \(trừ chung cả bill/.test(F.bfDetails({ o: D })), 'giảm khác = discountAmt − đồng giá, ghi trừ chung cả bill');
// 6) Bill đồng giá thiếu dữ liệu (cũ): không đoán món
const old = { ...B, dgItemIds: undefined };
const hOld = F.bfDetails({ o: old });
ok(!F.bfDgPlan(old) && !/bf-dgtag/.test(hOld) && /bill cũ — không rõ món nào/.test(hOld), 'thiếu dgItemIds → không gắn tag vào món, vẫn báo Đồng giá ở thông tin chung');
const wrong = { ...B, dgDiscount: dg + 1234 };
ok(!F.bfDgPlan(wrong), 'tổng giảm tính lại lệch dgDiscount → không gắn (tránh sai món)');
ok(!F.bfDgPlan({ ...B, dgFixedPrice: 0 }), 'thiếu giá đồng giá M → không gắn');
// 7) size L mà không có giá L: giữ giá gốc (đúng POS)
const L = { dgDiscount: 10000, dgItemIds: ['a'], dgFixedPrice: 25000, itemsArray: [{ itemId: 'a', size: 'L', qty: 1, price: 45000 }, { itemId: 'a', size: 'M', qty: 1, price: 35000 }] };
ok(!!F.bfDgPlan(L) && F.bfLineModel(L.itemsArray[0], F.bfDgPlan(L)).dg === false && F.bfLineModel(L.itemsArray[1], F.bfDgPlan(L)).amount === 25000, 'L không có giá đồng giá L → giữ nguyên; M → 25.000');
// 8) ly tặng / food / dòng giảm giá không bị đồng giá
const X = { dgDiscount: 10000, dgItemIds: ['a'], dgFixedPrice: 25000, itemsArray: [{ itemId: 'a', size: 'M', qty: 1, price: 35000 }, { itemId: 'a', size: 'M', qty: 1, price: 0, isFree: true }, { itemId: 'a', isFood: true, size: 'M', qty: 1, price: 35000 }] };
ok(!!F.bfDgPlan(X), 'ly tặng và Food không bị coi là được đồng giá');
// 9) bill TC33 (không topping, không đồng giá) hiển thị như cũ
const C = { total: 60000, itemsArray: [{ name: 'Cà phê', size: 'M', qty: 2, price: 30000 }] };
ok(sumLines(C) === 60000 && !/bf-dgtag|Đồng giá/.test(F.bfDetails({ o: C })), 'TC33 / bill thường: không đổi, tổng khớp');
// 10) Giảm giá toàn bill (không đồng giá)
ok(/Giảm giá<\/span><b>−5\.000đ \(trừ chung cả bill/.test(F.bfDetails({ o: { ...C, discountAmt: 5000 } })), 'giảm giá toàn bill ghi rõ trừ chung');
// 11) escape tên
ok(!/<img/.test(F.bfDetails({ o: { itemsArray: [{ name: '<img src=x onerror=1>', qty: 1, price: 1, toppings: [{ name: '<b>', price: 1 }] }] } })), 'tên món / topping được escape');
console.log(bad ? 'SOME FAIL' : 'ALL PASS'); process.exit(bad ? 1 : 0);
