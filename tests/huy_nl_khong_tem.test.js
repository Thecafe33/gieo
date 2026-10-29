'use strict';
// Hủy NL KHÔNG TEM (chủ dự án 29/10/2026) — màn Hao hụt › Nguyên liệu › ô «Không tem» (pos_kho.v2.js):
//  - CHỈ liệt kê NL không có kiểm kê tem (NL có tem BẮT BUỘC quét mã QR); NL ngừng dùng / không quản lý tồn không hiện;
//  - nhân viên luôn ĐẾM MÙ: không hiện tồn ở đâu trong luồng này;
//  - đơn vị mặc định = đơn vị kiểm kê (không khai → đơn vị pha chế); bắt buộc lý do + ô tích xác nhận; nhập quá tồn KHÔNG chặn;
//  - ghi qua UnitEngine.ledger.apply (WASTE), id giao dịch cố định theo lần hủy → bấm lại sau lỗi không ghi đúp.
const assert = require('assert/strict');
const { extract } = require('./lib/extract');
const names = ['wasteNoTemItems', 'wasteNoTemOpen', 'wasteNoTemUnits', 'wasteNoTemDefaultFactor', 'wasteNoTemPick', 'wasteNoTemBack',
  'wasteNoTemFilter', 'wasteNoTemSetUnit', 'wasteNoTemQty', '_wasteNoTemRowsHtml', 'renderNoTemWasteForm', 'submitNoTemWaste', '_submitNoTemWasteImpl',
  'renderItemWasteForm', '_hhTile', 'renderScannedWasteForm', 'wasteSetTarget'];
const source = extract('posgieo.html', names);
const ITEMS = [
  { id: 'flan', name: 'Bánh flan', unit: 'cái', stockManaged: true, currentStock: 7777, countUnitName: 'Khay', packagingUnits: [{ name: 'Khay', baseQty: 12 }] },
  { id: 'thach', name: 'Thạch rau câu', unit: 'cái', stockManaged: true, currentStock: 5555 },
  { id: 'milk', name: 'Sữa tươi', unit: 'ml', stockManaged: true, trackingMode: 'unit', currentStock: 9999, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] },
  { id: 'batch', name: 'Cà phê hạt', unit: 'g', stockManaged: true, trackingMode: 'batch', currentStock: 8888 },
  { id: 'cu', name: 'NL cũ', unit: 'cái', stockManaged: true, active: false },
  { id: 'khongton', name: 'Nước lọc', unit: 'ml', stockManaged: false },
];
function make({ fail = 0, values = {}, checked = {} } = {}) {
  const calls = { toast: [], ledger: [], renders: 0, staff: 0 };
  const field = { ntwQty: '', ntwReasonSelect: '', ntwReason: '', ntwNote: '', ...values };
  const elements = {};
  const el = id => (elements[id] = elements[id] || { get value() { return field[id] ?? ''; }, get checked() { return !!checked[id]; }, style: {}, innerHTML: '' });
  const store = {};
  let failLeft = fail;
  const env = {
    UnitEngine: {
      classify: { isTemTracked: it => !!it && it.stockManaged !== false && (it.trackingMode === 'unit' || it.trackingMode === 'batch') },
      ledger: { apply: async p => { calls.ledger.push(JSON.parse(JSON.stringify(p))); if (failLeft-- > 0) throw new Error('mất mạng thử'); return {}; } }
    },
    document: { getElementById: el }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    toast: m => calls.toast.push(m), renderKhoTxForm: () => calls.renders++, renderPinInput: id => `<pin ${id}>`,
    resolveStaffPinAndCheckin: async () => { calls.staff++; return { id: 'nv1', fullName: 'Nhân viên thử' }; },
    escHtmlPos: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    fmtPrepQty: n => Number(n).toLocaleString('vi-VN'),
    HH_QR_SVG: '<svg qr/>', HH_BOX_SVG: '<svg box/>', getPrimaryRefillRulePOS: () => null
  };
  const ks = Object.keys(env);
  const api = new Function(...ks, 'items', `
    let KHO_ITEMS_CACHE = items, WASTE_REASONS_CACHE = [{ id: 'r1', label: 'Hết hạn' }, { id: 'r2', label: 'Hư hỏng' }], _posSubmitBusy = false;
    let khoTxState = { type: 'WASTE', target: 'item' }, PREP_ITEMS_CACHE_POS = [];
    ${source}
    return { ${names.join(',')}, get st() { return khoTxState; }, set st(v) { khoTxState = v; }, items() { return KHO_ITEMS_CACHE; }, setReasons(v) { WASTE_REASONS_CACHE = v; } };
  `)(...ks.map(k => env[k]), JSON.parse(JSON.stringify(ITEMS)));
  return { api, calls, field, store };
}

(async () => {
  // ── 1. Danh sách: CHỈ NL không tem, đang dùng, có quản lý tồn ──
  {
    const { api } = make();
    assert.deepEqual(api.wasteNoTemItems().map(i => i.id), ['flan', 'thach'], 'NL có tem (unit / batch), ngừng dùng, không quản lý tồn KHÔNG hiện');
    const html = api.renderNoTemWasteForm();
    assert.match(html, /Bánh flan/); assert.match(html, /Thạch rau câu/);
    assert.ok(!/Sữa tươi|Cà phê hạt|NL cũ|Nước lọc/.test(html), 'NL có tem không xuất hiện trong luồng không tem');
    assert.match(html, /NL có dán tem phải quét mã QR/);
    assert.ok(!/7777|5555|9999|8888/.test(html) && !/tồn/i.test(html), 'đếm mù: không hiện tồn');
    console.log('ok danh sách chỉ NL không tem; không lộ tồn; nhắc NL có tem phải quét QR');
  }
  // ── 2. Hai ô: Quét mã (NL có tem) | Không tem — NL có tem vẫn bắt buộc quét ──
  {
    const { api } = make();
    const html = api.renderItemWasteForm();
    assert.match(html, /scanIngredientForWaste\(\)/); assert.match(html, /NL có dán tem/); assert.match(html, /wasteNoTemOpen\(\)/); assert.match(html, /Vd: bánh flan/);
    api.wasteNoTemOpen(); assert.equal(api.st.itemMode, 'notem');
    assert.match(api.renderItemWasteForm(), /hh-tile alt on/, 'ô Không tem sáng khi đang dùng');
    api.wasteSetTarget('drink'); assert.equal(api.st.itemMode, null, 'rời tab Nguyên liệu → bỏ chế độ không tem'); assert.equal(api.st.ntw, null);
    console.log('ok hai ô Quét mã | Không tem; rời tab thì reset');
  }
  // ── 3. Chọn NL: đơn vị mặc định = đơn vị kiểm kê; NL có tem bị chặn ──
  {
    const { api, calls } = make();
    api.wasteNoTemOpen(); api.wasteNoTemPick('flan');
    assert.equal(api.st.ntw.factor, 12, 'mặc định đơn vị kiểm kê (Khay = 12 cái)');
    let html = api.renderNoTemWasteForm();
    assert.match(html, /class="u">Khay</); assert.match(html, /Khay<small>= 12 cái/); assert.match(html, /id="ntwAck"/); assert.match(html, /Tôi xác nhận hủy/);
    assert.match(html, /onclick="wasteNoTemSetUnit\(12\)"/); assert.ok(!/7777/.test(html));
    api.wasteNoTemSetUnit(1); assert.equal(api.st.ntw.factor, 1); assert.match(api.renderNoTemWasteForm(), /class="u">cái</);
    api.wasteNoTemPick('thach'); assert.equal(api.st.ntw.factor, 1, 'không khai đơn vị kiểm kê → đơn vị pha chế');
    const before = calls.toast.length; api.wasteNoTemPick('milk');
    assert.ok(calls.toast.length > before && /quét mã QR/.test(calls.toast.at(-1)), 'NL có tem: chặn, bắt buộc quét QR'); assert.equal(api.st.ntw.itemId, 'thach', 'không đổi lựa chọn');
    api.wasteNoTemBack(); assert.equal(api.st.ntw, null);
    console.log('ok đơn vị mặc định = đơn vị kiểm kê; NL có tem bị chặn');
  }
  // ── 4. Kiểm tra trước khi ghi: số lượng, lý do, ô tích ──
  {
    const h = make({ values: { ntwQty: '', ntwReasonSelect: '', ntwReason: '' } });
    h.api.wasteNoTemPick('flan');
    await h.api.submitNoTemWaste(); assert.match(h.calls.toast.at(-1), /số lượng/i);
    h.field.ntwQty = '2'; await h.api.submitNoTemWaste(); assert.match(h.calls.toast.at(-1), /lý do/i);
    h.field.ntwReasonSelect = 'r1'; await h.api.submitNoTemWaste(); assert.match(h.calls.toast.at(-1), /xác nhận/i);
    assert.equal(h.calls.ledger.length, 0, 'chưa đủ điều kiện → không ghi gì'); assert.equal(h.calls.staff, 0, 'chưa hỏi PIN');
    console.log('ok bắt buộc số lượng + lý do + ô tích xác nhận trước khi ghi');
  }
  // ── 5. Ghi hao hụt: WASTE qua UnitEngine.ledger.apply, quy về đơn vị pha chế; nhập quá tồn KHÔNG chặn ──
  {
    const h = make({ values: { ntwQty: '2', ntwReasonSelect: 'r1', ntwNote: 'rơi vỡ' }, checked: { ntwAck: true } });
    h.api.wasteNoTemPick('flan');
    await h.api.submitNoTemWaste();
    assert.equal(h.calls.ledger.length, 1); const p = h.calls.ledger[0];
    assert.equal(p.itemId, 'flan'); assert.equal(p.type, 'WASTE'); assert.equal(p.qty, -24, '2 Khay × 12 = 24 cái (trừ)'); assert.equal(p.deriveFromUnits, false);
    assert.equal(p.staff, 'Nhân viên thử'); assert.equal(p.staffEmployeeId, 'nv1'); assert.match(p.txId, /^ntw_.+_ing_flan$/);
    assert.equal(p.meta.wasteKind, 'item_no_tem'); assert.equal(p.meta.reason, 'Hết hạn'); assert.equal(p.meta.unitFactor, 12);
    assert.match(p.note, /Hủy NL không tem: 2 Khay Bánh flan · Lý do: Hết hạn · rơi vỡ/);
    assert.equal(h.api.st.ntw, null, 'ghi xong → về danh sách'); assert.equal(h.store.ntwPending_pos, undefined, 'xoá dấu lượt dở dang');
    assert.match(h.calls.toast.at(-1), /✅ Đã ghi hao hụt/);
    const big = make({ values: { ntwQty: '99999', ntwReason: 'Khác' , ntwReasonSelect: '__other__' }, checked: { ntwAck: true } });
    big.api.wasteNoTemPick('thach'); await big.api.submitNoTemWaste();
    assert.equal(big.calls.ledger.length, 1); assert.equal(big.calls.ledger[0].qty, -99999, 'nhập quá tồn không bị chặn');
    console.log('ok ghi WASTE qua ledger.apply (quy đổi đơn vị, không deriveFromUnits); nhập quá tồn không chặn');
  }
  // ── 6. Lỗi giữa chừng: bấm lại dùng LẠI id giao dịch cũ (không trừ kho hai lần) ──
  {
    const h = make({ fail: 1, values: { ntwQty: '3', ntwReasonSelect: 'r2' }, checked: { ntwAck: true } });
    h.api.wasteNoTemPick('thach');
    await h.api.submitNoTemWaste(); assert.equal(h.calls.ledger.length, 1); assert.ok(h.store.ntwPending_pos, 'giữ dấu lượt dở dang'); assert.match(h.calls.toast.at(-1), /Chưa ghi được/);
    assert.ok(h.api.st.ntw, 'giữ màn + lựa chọn để bấm lại');
    await h.api.submitNoTemWaste(); assert.equal(h.calls.ledger.length, 2);
    assert.equal(h.calls.ledger[1].txId, h.calls.ledger[0].txId, 'cùng id giao dịch ở lần thử lại');
    // đổi số lượng giữa hai lần → lượt mới, id mới
    const g = make({ fail: 1, values: { ntwQty: '3', ntwReasonSelect: 'r2' }, checked: { ntwAck: true } });
    g.api.wasteNoTemPick('thach'); await g.api.submitNoTemWaste(); g.field.ntwQty = '4'; await g.api.submitNoTemWaste();
    assert.notEqual(g.calls.ledger[1].txId, g.calls.ledger[0].txId, 'đổi nội dung → lượt hủy mới');
    console.log('ok lỗi giữa chừng: thử lại cùng id giao dịch; đổi nội dung → id mới');
  }
  // ── 7. Lưới an toàn: NL vừa được bật theo dõi tem giữa chừng → không hủy theo số được ──
  {
    const h = make({ values: { ntwQty: '1', ntwReasonSelect: 'r1' }, checked: { ntwAck: true } });
    h.api.wasteNoTemPick('thach');
    h.api.items().find(i => i.id === 'thach').trackingMode = 'unit';
    await h.api.submitNoTemWaste();
    assert.equal(h.calls.ledger.length, 0); assert.match(h.calls.toast.at(-1), /quét mã QR/);
    console.log('ok NL đổi sang có tem giữa chừng: chặn, bắt buộc quét mã');
  }
  // ── 8. Lọc khi danh sách dài ──
  {
    const h = make(); h.api.wasteNoTemFilter('flan');
    assert.match(h.api._wasteNoTemRowsHtml(), /Bánh flan/); assert.ok(!/Thạch/.test(h.api._wasteNoTemRowsHtml()));
    h.api.wasteNoTemFilter('xyz'); assert.match(h.api._wasteNoTemRowsHtml(), /Không có nguyên liệu khớp/);
    console.log('ok ô tìm lọc đúng');
  }
})().catch(e => { console.error(e); process.exit(1); });
