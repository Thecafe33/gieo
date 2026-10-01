// 01/10/2026 — hai yêu cầu của chủ quán. Hàm thật trích từ HTML, Firebase/DOM giả.
//  1. Quản lý, tab Hôm nay (Bill bán hàng): chuyển khoản do nhân viên tự bấm xác nhận
//     (bankConfirmMethod 'manual_staff') hiện nhãn "Chuyển khoản - xác nhận tay" màu riêng.
//  2. POS, Nhận hàng: còn đơn đặt hàng đang chờ (chờ nhận / nhận một phần) thì khoá "Nhận hàng
//     tự do"; bấm vào → báo đang có đơn chờ nhận, không mở phiếu tự do.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const t = (cond, m) => { if (!cond) { ok = false; console.log('FAIL', m); } else console.log('ok', m); };

// ---------- 1. Nhãn CK xác nhận tay (quanlygieo.html) ----------
const qlSrc = extract('quanlygieo.html', ['bfTagMethod', 'bfDongMon', 'bfChiTiet']);
const QL = new Function('escapeHtmlAttr', 'fmt', 'BF_ICE', qlSrc + '\nreturn { bfTagMethod, bfChiTiet };')(
  s => String(s == null ? '' : s), n => String(n), {});
const TAY = 'Chuyển khoản - xác nhận tay';
{
  const cash = QL.bfTagMethod('TIỀN MẶT', {});
  t(cash.includes('Tiền mặt') && !cash.includes(TAY), 'tiền mặt: nhãn Tiền mặt như cũ');
  const auto = QL.bfTagMethod('CHUYỂN KHOẢN', { bankConfirmMethod: 'auto' });
  t(auto.includes('>Chuyển khoản<') && auto.includes('var(--bi)') && !auto.includes(TAY), 'CK hệ thống tự nhận: nhãn Chuyển khoản màu xanh như cũ');
  const tay = QL.bfTagMethod('CHUYỂN KHOẢN', { bankConfirmMethod: 'manual_staff', bankConfirmedBy: 'An' });
  t(tay.includes(TAY) && tay.includes('var(--bad)') && !tay.includes('var(--bi)'), 'CK nhân viên xác nhận tay: nhãn "Chuyển khoản - xác nhận tay", màu khác (đỏ)');
  const cu = QL.bfTagMethod('CHUYỂN KHOẢN');
  t(cu.includes('>Chuyển khoản<') && !cu.includes(TAY), 'gọi kiểu cũ (không truyền bill) vẫn chạy, ra nhãn thường');
  const splitTay = QL.bfTagMethod('TÍNH RIÊNG', { splitGroups: [{ method: 'TIỀN MẶT' }, { method: 'CHUYỂN KHOẢN', bankConfirmMethod: 'manual_staff', bankConfirmedBy: 'Bình' }] });
  t(splitTay.includes('Tính riêng') && splitTay.includes(TAY), 'Tính riêng có nhóm CK xác nhận tay: thêm nhãn xác nhận tay cạnh "Tính riêng"');
  const splitAuto = QL.bfTagMethod('TÍNH RIÊNG', { splitGroups: [{ method: 'CHUYỂN KHOẢN', bankConfirmMethod: 'auto' }, null] });
  t(splitAuto.includes('Tính riêng') && !splitAuto.includes(TAY), 'Tính riêng CK tự nhận (kể cả nhóm rỗng): chỉ nhãn Tính riêng');
  const ctSplit = QL.bfChiTiet({ items: 'x', splitGroups: [
    { method: 'CHUYỂN KHOẢN', bankConfirmMethod: 'manual_staff', bankConfirmedBy: 'An' },
    { method: 'CHUYỂN KHOẢN', bankConfirmMethod: 'manual_staff', bankConfirmedBy: 'Bình' },
    { method: 'CHUYỂN KHOẢN', bankConfirmMethod: 'manual_staff', bankConfirmedBy: 'An' }] });
  t(ctSplit.includes('Thủ công bởi An, Bình'), 'chi tiết bill Tính riêng ghi đủ người xác nhận tay (không lặp tên)');
  const ctMot = QL.bfChiTiet({ items: 'x', method: 'CHUYỂN KHOẢN', bankConfirmMethod: 'manual_staff', bankConfirmedBy: 'An' });
  t((ctMot.match(/Thủ công bởi/g) || []).length === 1 && ctMot.includes('Thủ công bởi An'), 'chi tiết bill CK thường: một dòng "Thủ công bởi" như cũ');
}

// ---------- 2. Khoá Nhận hàng tự do (posgieo.html) ----------
const posSrc = extract('posgieo.html', ['renderPoReceiveSelect', 'poSelectFree']);
const MSG = '🔒 Đang có đơn chờ nhận, vui lòng bấm nhận hàng của đơn';
function make({ dbPos = [], fail = false, cache = [], fromCache = false } = {}) {
  const calls = { toast: [], form: 0, query: null };
  const box = { innerHTML: '' };
  const stubs = {
    document: { getElementById: id => (id === 'poReceiveBody' ? box : null) },
    poPendingCardHtml: po => `<div class="card">${po.id}</div>`,
    toast: m => calls.toast.push(m),
    renderPoReceiveForm: () => { calls.form++; },
    console: { warn() {}, log() {}, error() {} },
    fstore: { collection: name => ({ where: (f, op, v) => ({ get: async () => {
      calls.query = [name, f, op, v];
      if (fail) throw new Error('mất mạng');
      return { docs: dbPos.map(p => ({ id: p.id, data: () => p })), metadata: { fromCache } };
    } }) }) }
  };
  const ks = Object.keys(stubs);
  const api = new Function(...ks, '__cache',
    'let POS_PENDING_PO_CACHE = __cache; let poReceiveState = { poId: "po_cu", supplier: "NCC cũ", lines: [{ itemId: "a" }], photoFiles: [], idemKey: null };\n'
    + posSrc + '\nreturn { renderPoReceiveSelect, poSelectFree, get cache() { return POS_PENDING_PO_CACHE; }, get state() { return poReceiveState; } };'
  )(...ks.map(k => stubs[k]), cache);
  return { api, calls, box };
}
const freeBtn = html => (html.match(/<button[^>]*onclick="poSelectFree\(\)"[^>]*>[^<]*<\/button>/) || [''])[0];
(async () => {
  {
    const { api, calls } = make();
    await api.poSelectFree();
    t(calls.form === 1 && calls.toast.length === 0, 'không có đơn đang chờ: mở phiếu nhận tự do như cũ');
    t(api.state.poId === null && api.state.supplier === '' && api.state.lines.length === 0, 'phiếu tự do bắt đầu trống (không theo đơn)');
    t(calls.query && calls.query[0] === 'purchase_orders_gieogieo' && calls.query[2] === 'in'
      && JSON.stringify(calls.query[3]) === JSON.stringify(['pending', 'partial']), 'đọc lại đúng danh sách đơn "đang chờ" (chờ nhận + nhận một phần) lúc bấm');
  }
  {
    // Đơn Quản lý tạo SAU khi mở màn (bộ nhớ tạm còn rỗng) vẫn phải khoá.
    const { api, calls, box } = make({ dbPos: [{ id: 'po1', status: 'pending', createdAt: '2026-10-01T08:00:00Z' }] });
    await api.poSelectFree();
    t(calls.form === 0, 'có đơn chờ nhận: KHÔNG mở phiếu tự do');
    t(calls.toast.length === 1 && calls.toast[0] === MSG, 'bấm vào → báo "Đang có đơn chờ nhận, vui lòng bấm nhận hàng của đơn"');
    t(box.innerHTML.includes('po1') && freeBtn(box.innerHTML).includes('is-locked'), 'vẽ lại danh sách: hiện đơn mới + nút tự do ở trạng thái khoá');
    t(api.state.poId === 'po_cu', 'không đụng phiếu đang có trong bộ nhớ');
  }
  {
    const { api, calls } = make({ dbPos: [{ id: 'po2', status: 'partial' }] });
    await api.poSelectFree();
    t(calls.form === 0 && calls.toast[0] === MSG, 'đơn mới nhận một phần cũng khoá (còn chờ phần thiếu)');
  }
  {
    const { api, calls } = make({ fail: true, cache: [{ id: 'po3', status: 'pending' }] });
    await api.poSelectFree();
    t(calls.form === 0 && calls.toast[0] === MSG, 'mất mạng lúc bấm: dùng danh sách lúc mở màn — đang có đơn thì vẫn khoá');
  }
  {
    const { api, calls } = make({ fail: true, cache: [] });
    await api.poSelectFree();
    t(calls.form === 1 && calls.toast.length === 0, 'mất mạng lúc bấm, lúc mở màn không có đơn: vẫn cho nhận tự do');
  }
  {
    // Mất mạng thật: Firestore không ném lỗi mà trả RỖNG từ bộ nhớ đệm — không được coi là "hết đơn".
    const { api, calls } = make({ fromCache: true, dbPos: [], cache: [{ id: 'po5', status: 'pending' }] });
    await api.poSelectFree();
    t(calls.form === 0 && calls.toast[0] === MSG && api.cache.length === 1, 'rỗng từ bộ nhớ đệm (mất mạng): giữ danh sách lúc mở màn — vẫn khoá');
    const r2 = make({ fromCache: true, dbPos: [{ id: 'po6', status: 'partial' }], cache: [] });
    await r2.api.poSelectFree();
    t(r2.calls.form === 0 && r2.calls.toast[0] === MSG, 'bộ nhớ đệm CÓ đơn: khoá');
    const r3 = make({ fromCache: false, dbPos: [], cache: [{ id: 'po7', status: 'pending' }] });
    await r3.api.poSelectFree();
    t(r3.calls.form === 1 && r3.calls.toast.length === 0 && r3.api.cache.length === 0, 'máy chủ báo hết đơn (vừa nhận đủ/đóng/huỷ): mở khoá, bỏ danh sách cũ');
  }
  {
    const { api, box } = make({ cache: [{ id: 'po4', status: 'pending' }] });
    api.renderPoReceiveSelect();
    const b = freeBtn(box.innerHTML);
    t(b.includes('is-locked') && b.includes('🔒') && !/\sdisabled/.test(b), 'có đơn: nút tự do hiện khoá (🔒) nhưng KHÔNG disabled — bấm được để báo lý do');
    t(box.innerHTML.includes('Đang có đơn chờ nhận'), 'có dòng nhắc nhận theo đơn dưới nút');
    const r = make({ cache: [] });
    r.api.renderPoReceiveSelect();
    const b2 = freeBtn(r.box.innerHTML);
    t(b2 && !b2.includes('is-locked') && !b2.includes('🔒') && !r.box.innerHTML.includes('Đang có đơn chờ nhận'), 'không có đơn: nút tự do bình thường như cũ');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.stack || e); process.exit(1); });
