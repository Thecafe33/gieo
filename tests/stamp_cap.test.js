// Trần giá ly đổi 6 tem: trung bình giá 6 ly tích tem + 3K; tem cũ không có giá = trần 19K.
const src = require('./lib/extract').extract('posgieo.html', ['_numList', '_stampPricesSynced', '_freeCapsSynced', '_capOfSixStamps', '_stampPricesPick', 'stampCupPricesOf', '_stampLedgerAdd', 'giftBlockReasonPOS']);
const api = new Function('fmt', 'togoSettings', 'cheapestPaidCupPOS', 'giftRefPricePOS', `
const STAMP_LEGACY_PRICE = 16000, STAMP_CAP_MARGIN = 3000, FREE_DRINK_LEGACY_CAP = 19000;
` + src + `; return { _stampPricesSynced, _freeCapsSynced, _capOfSixStamps, _stampPricesPick, stampCupPricesOf, _stampLedgerAdd, giftBlockReasonPOS };`)(
  n => n + 'đ', { giftMenu: { itemIds: [], maxPrice: 0, capByCheapest: false } }, () => 0, () => 0);
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

eq(api._capOfSixStamps([15000, 15000, 15000, 15000, 15000, 15000]), 18000, 'toàn ly 15K → trần 18K');
eq(api._capOfSixStamps([15000, 15000, 15000, 15000, 15000, 35000]), 21333, 'có 1 ly 35K → trung bình + 3K');
eq(api._capOfSixStamps([]), 19000, 'không có giá nào → 19K');
eq(api._freeCapsSynced(undefined, 2), [19000, 19000], 'ly miễn phí cũ → trần 19K');
eq(api._freeCapsSynced([18000], 2), [19000, 18000], 'ly cũ đứng trước, ly mới có trần');
eq(api._stampPricesSynced([15000, 15000], 4), [16000, 16000, 15000, 15000], 'tem cũ coi 16K');
eq(api._stampPricesSynced([1, 2, 3, 4, 5, 6, 7], 3), [5, 6, 7], 'số đếm bị app khác giảm → cắt theo số đếm');

eq(api._stampPricesPick([15000], 1), [15000], '1 ly → 1 tem giá ly đó');
eq(api._stampPricesPick([15000, 35000], 2), [15000, 35000], '2 ly → cả hai');
eq(api._stampPricesPick([15000, 20000, 35000], 2), [15000, 35000], '3 ly → đắt nhất + rẻ nhất');
eq(api._stampPricesPick([15000, 20000, 25000, 35000], 2), [15000, 35000], '4 ly → đắt nhất + rẻ nhất');
eq(api._stampPricesPick([15000, 35000, 20000], 1), [15000], 'chỉ còn 1 tem → ly rẻ nhất');
eq(api._stampPricesPick(undefined, 2), [16000, 16000], 'không có giá (hàng đợi cũ) → 16K');

eq(api.stampCupPricesOf([{ price: 15000, qty: 2 }, { price: 0, qty: 1, isFree: true }, { price: 0, qty: 1, _vKey: 'x' }]), [15000, 15000], 'ly tặng / ly tem không tính');

// Khách quen: 3 bill, mỗi bill 2 ly 15K → 6 tem → trần 18K
let d = {};
for (let i = 0; i < 3; i++) {
  const L = api._stampLedgerAdd(d, api._stampPricesPick([15000, 15000], 2));
  d = { stamp_count: ((d.stamp_count || 0) + 2) % 6, free_drink_available: (d.free_drink_available || 0) + (L.free_drink_caps.length - (d.free_drink_caps || []).length), ...L };
}
eq(d.free_drink_caps, [18000], '3 bill × 2 ly 15K → 1 ly miễn phí, trần 18K');
eq(d.stamp_prices, [], 'tem đã chốt hết');

// Chặn món
const block = (price, cap) => api.giftBlockReasonPOS({ id: 'a' }, price, cap);
eq(block(18000, 18000), null, 'đúng bằng trần → được');
eq(typeof block(21000, 18000), 'string', 'cao hơn trần 3K+ → bị chặn');
eq(block(35000, 0), null, 'không có trần (mua-X-tặng-Y) → như cũ');
process.exit(ok ? 0 : 1);
