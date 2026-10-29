// pos_receive.v2.js (29/10/2026) = pos_receive.v1.js + GIAO DIỆN MỚI của form «Nhận hàng» (chủ dự án duyệt qua bản xem trước): mỗi món một widget
// kiểu manage (nền trắng, màu nhạt riêng từng món, nút đen), tên món to, ô nhập số lượng thay cho nút −/+, đơn vị đang chọn nổi bật và
// MẶC ĐỊNH là ĐƠN VỊ KIỂM KÊ (countUnitName; món không khai đơn vị kiểm kê → đơn vị pha chế), Hỏng / Sai sản phẩm / Ghi chú gập gọn.
// CHỈ đổi cách dựng HTML + đơn vị mặc định: logic ghi kho, PIN, idempotency, tên hàm, id, onclick/oninput giữ nguyên v1.
// v1 đã phát hành — giữ để quay lui (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).receive = 'dang';

// ============================================================
// [NEW] GIAI ĐOẠN 5 — Nhận hàng thực tế (PO tuỳ chọn + Đủ/Thiếu/Thừa/Hư hỏng/Sai sản phẩm/Ảnh)
// (POS_Management_Integration_Workflow.md, mục 8 + "Giai đoạn 5")
//
// Đọc purchase_orders_gieogieo (do Management tạo, TUỲ CHỌN — mục 8: "Management CÓ THỂ
// có PO"). Nếu có PO đang chờ, POS chọn PO đó để hiện số lượng DỰ KIẾN cạnh ô nhập số
// THỰC NHẬN — không được tự động ghi nhận đúng số đã đặt (mục 8). Nếu không có/không chọn
// PO, vẫn nhận hàng tự do bằng cách tự thêm dòng nguyên liệu (giống hệt tinh thần RECEIVING
// ở khoTxScreen, chỉ khác là màn này hỗ trợ nhiều dòng + hư hỏng + ảnh trong 1 lần).
//
// Ghi kho: mỗi dòng có thể sinh tối đa 2 giao dịch — RECEIVING (số lượng TỐT, cộng kho) và
// WASTE (số lượng HƯ HỎNG, trừ kho ngay lúc nhận — không cộng vào kho tốt rồi trừ lại, mà
// tách bạch 2 sự kiện để ledger phản ánh đúng thực tế: "nhận X, trong đó Y bị hư ngay khi
// nhận"). Dòng "Sai sản phẩm" KHÔNG sinh giao dịch kho nào (hàng không dùng được, không
// cộng vào kho), chỉ lưu lại trong receiving_records_gieogieo để Management biết mà xử lý
// với nhà cung cấp. Tất cả đều qua applyStockTransactionPOS() — không sửa currentStock
// trực tiếp (mục 2.1).
//
// receiving_records_gieogieo — 1 doc / lần nhận hàng, lưu đầy đủ chi tiết (đối chiếu
// expected/actual, ảnh chứng từ) để Management xem lại (mục 18 drill-down), TÁCH BIỆT với
// stock_transactions_gieogieo (ledger số lượng — vẫn là nguồn DUY NHẤT cho tồn kho, mục 2.1).
// Mỗi giao dịch ledger sinh ra có `referenceId` trỏ về đúng receiving_records doc này.
// ============================================================
let POS_PENDING_PO_CACHE = null;

let poReceiveState = { poId: null, supplier: '', lines: [], photoFiles: [], idemKey: null };

async function openPoReceiveScreen() {
  if (poReceiveState.submitting) { toast('⏳ Đang ghi nhận hàng, vui lòng đợi'); return; }
  showScreen('poReceiveScreen');
  poReceiveState = { poId: null, supplier: '', lines: [], photoFiles: [], idemKey: null };
  const box = document.getElementById('poReceiveBody');
  showLoading(box);
  try {
    if (!KHO_ITEMS_CACHE.length) {
      const snap = await fstore.collection('inventory_items_gieogieo').get();
      KHO_ITEMS_CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    }
    const poSnap = await fstore.collection('purchase_orders_gieogieo').where('status', 'in', ['pending', 'partial']).get();
    POS_PENDING_PO_CACHE = poSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  } catch (err) {
    console.error('openPoReceiveScreen load failed', err);
    box.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được dữ liệu<br><span style="color:#aaa;font-size:12px">${err.message || ''}</span></div>`;
    return;
  }
  renderPoReceiveSelect();
}

function renderPoReceiveSelect() {
  const box = document.getElementById('poReceiveBody');
  const pos = POS_PENDING_PO_CACHE || [];
  // [KHOÁ NHẬN TỰ DO] Còn đơn đang chờ thì nút tự do hiện khoá — vẫn bấm được để báo vì sao
  // (xem poSelectFree), không dùng `disabled` vì nút disabled bấm vào im lặng, không báo gì.
  const khoaTuDo = pos.length > 0;
  box.innerHTML = `
    <div class="wal-section" style="margin:0 16px 14px;">
      <div class="wal-section-title">Đơn đặt hàng đang chờ (từ app Quản lý)${pos.length ? `<span style="font-size:14px;font-weight:800;color:var(--gd);background:var(--gl);border-radius:999px;padding:2px 9px;letter-spacing:0;">${pos.length}</span>` : ''}</div>
      ${pos.length ? pos.map(po => poPendingCardHtml(po)).join('') : '<div style="font-size:12.5px;color:#bbb;padding:6px 2px;">Không có đơn đặt hàng nào đang chờ.</div>'}
    </div>
    <div style="margin:0 16px;"><button class="ds-cta${khoaTuDo ? ' is-locked' : ''}" onclick="poSelectFree()">${khoaTuDo ? '🔒 ' : ''}Nhận hàng tự do (không theo đơn)</button>
      ${khoaTuDo ? '<div style="font-size:12.5px;font-weight:700;color:#a89a7e;text-align:center;margin-top:8px;">Đang có đơn chờ nhận — nhận hàng theo đơn ở trên</div>' : ''}</div>
  `;
}

// Tiến độ nhận của 1 dòng đơn: 'done' (đủ) | 'part' (nhận một phần) | 'none' (chưa nhận).
function poLineProgress(l) {
  const exp = Number(l.qtyExpectedBase) || 0, got = Number(l.receivedGoodBase) || 0;
  return got <= 0 ? 'none' : (got >= exp ? 'done' : 'part');
}

// Viên thuốc số lượng của dòng: chưa nhận → "3 thùng" + quy đổi; đã nhận một phần → "2 / 5 thùng".
function poLinePillHtml(l) {
  const f = Number(l.orderUnitFactor) || 1, name = escHtmlPos(f > 1 ? (l.orderUnitName || l.unit || '') : (l.unit || ''));
  const n = x => Number(x.toFixed(2)).toLocaleString('vi-VN');
  const exp = Number(l.qtyExpectedBase) || 0, got = Number(l.receivedGoodBase) || 0;
  const st = poLineProgress(l);
  const bg = st === 'done' ? '#16a34a' : (st === 'part' ? '#c2703c' : 'var(--gd)');
  const main = st === 'none' ? `${n(exp / f)} ${name}` : (st === 'done' ? `✓ ${n(exp / f)} ${name}` : `${n(got / f)} / ${n(exp / f)} ${name}`);
  const sub = st === 'none' && f > 1 ? `<span style="display:block;font-size:10.5px;font-weight:700;opacity:.85;margin-top:1px;">${n(exp)} ${escHtmlPos(l.unit || '')}</span>` : '';
  return `<div style="flex-shrink:0;padding:8px 14px;border-radius:999px;background:${bg};color:#fff;font-size:16px;font-weight:800;white-space:nowrap;text-align:center;line-height:1.15;">${main}${sub}</div>`;
}

function poPendingCardHtml(po) {
  const lines = po.lines || [];
  const prog = lines.map(poLineProgress);
  const nDone = prog.filter(x => x === 'done').length;
  const isPart = po.status === 'partial' || prog.some(x => x !== 'none');
  const badge = isPart ? ['Nhận một phần', '#c2703c'] : ['Chờ nhận', 'var(--gd)'];
  const sup = escHtmlPos(po.supplier || '(không ghi nhà cung cấp)');
  const when = po.createdAt ? 'Đặt ' + fmtDateTimeShort(po.createdAt) : '';
  const sub = isPart ? `${when ? when + ' · ' : ''}còn thiếu ${lines.length - nDone} mặt hàng` : `${when ? when + ' · ' : ''}${lines.length} mặt hàng`;
  // Đơn dài / đã nhận một phần: hiện món còn thiếu trước, món đã đủ gấp lại.
  const open = lines.map((l, i) => ({ l, st: prog[i] })).filter(x => x.st !== 'done');
  const done = lines.map((l, i) => ({ l, st: prog[i] })).filter(x => x.st === 'done');
  const rowHtml = ({ l, st }) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;margin-top:8px;background:${st === 'done' ? '#f3faf6' : '#FFFCF0'};border:1.5px solid ${st === 'done' ? '#cfe9da' : '#f0ead9'};border-radius:16px;">
      <span style="min-width:0;font-size:17px;font-weight:800;color:${st === 'done' ? '#7d8f85' : 'var(--td)'};line-height:1.3;">${escHtmlPos(l.name || '')}${st === 'part' ? `<span style="display:block;font-size:12.5px;font-weight:700;color:#c2703c;margin-top:2px;">Còn thiếu ${poLineQtyText(l, (Number(l.qtyExpectedBase) || 0) - (Number(l.receivedGoodBase) || 0))}</span>` : ''}</span>
      ${poLinePillHtml(l)}
    </div>`;
  const prBar = isPart ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;"><div style="flex:1;height:8px;border-radius:999px;background:#EFE9D8;overflow:hidden;"><i style="display:block;height:100%;width:${lines.length ? Math.round(nDone / lines.length * 100) : 0}%;border-radius:999px;background:#c2703c;"></i></div><span style="font-size:12px;font-weight:800;color:#a89a7e;flex-shrink:0;">${nDone}/${lines.length} mặt hàng</span></div>` : '';
  return `<div style="padding:14px;background:#FAF8F2;border:1.5px solid #F0EAD9;border-radius:22px;margin-bottom:12px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px;">
      <div style="min-width:0;"><div style="font-size:21px;font-weight:800;color:var(--td);line-height:1.25;letter-spacing:-.2px;word-break:break-word;">${sup}</div>
        <div style="font-size:13px;font-weight:700;color:var(--gd);margin-top:4px;">${sub}</div></div>
      <span style="flex-shrink:0;font-size:12px;font-weight:800;color:#fff;padding:5px 10px;border-radius:999px;white-space:nowrap;background:${badge[1]};">${badge[0]}</span>
    </div>
    ${prBar}
    ${open.map(rowHtml).join('')}
    ${done.length ? `<details style="margin-top:8px;"><summary style="list-style:none;cursor:pointer;font-size:12.5px;font-weight:800;color:#a89a7e;text-decoration:underline;padding:6px 0;">Xem ${done.length} mặt hàng đã nhận đủ ▾</summary>${done.map(rowHtml).join('')}</details>` : ''}
    ${po.note ? `<div style="margin-top:10px;padding:10px 12px;background:#fff;border:1.5px solid #F0EAD9;border-radius:14px;font-size:13px;font-weight:600;color:#8a7a52;line-height:1.4;">📝 ${escHtmlPos(po.note)}</div>` : ''}
    <button onclick="poSelectPO('${po.id}')" style="width:100%;min-height:56px;margin-top:14px;border-radius:999px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;${isPart ? 'background:#fff;color:var(--gd);border:2px solid var(--gd);' : 'background:var(--gd);color:#fff;border:none;'}">${isPart ? 'Nhận tiếp' : 'Nhận hàng'} →</button>
  </div>`;
}

// Viết số lượng theo ĐÚNG đơn vị Quản lý đã đặt. Đặt "3 gói" mà màn nhận hàng hiện
// "3.000 g" thì nhân viên phải tự chia nhẩm, và rất dễ gõ nhầm số. Đơn cũ (chưa có
// orderUnitFactor) rơi về đơn vị pha chế như trước, không vỡ.
function poLineQtyText(l, base) {
  const f = Number(l.orderUnitFactor) || 1;
  const b = Number(base) || 0;
  const n = x => Number(x.toFixed(2)).toLocaleString('vi-VN');
  if (f <= 1) return `${n(b)} ${l.unit || ''}`;
  return `${n(b / f)} ${l.orderUnitName || l.unit || ''} (${n(b)} ${l.unit || ''})`;
}

function poSelectPO(poId) {
  if (poReceiveState.submitting) return;
  const po = (POS_PENDING_PO_CACHE || []).find(p => p.id === poId);
  if (!po) { toast('⚠️ Không tìm thấy đơn đặt hàng'); return; }
  poReceiveState.poId = poId;
  poReceiveState.supplier = po.supplier || '';
  poReceiveState.lines = (po.lines || []).map(l => ({
    itemId: l.itemId, name: l.name, unit: l.unit,
    packagingUnits: (KHO_ITEMS_CACHE.find(x => x.id === l.itemId) || {}).packagingUnits || [],
    qtyExpectedBase: Number(l.qtyExpectedBase) || 0,
    orderUnitName: l.orderUnitName || '', orderUnitFactor: Number(l.orderUnitFactor) || 1,
    receivedGoodBase: Number(l.receivedGoodBase) || 0,
    // [v2] Ô "Đơn vị" mở sẵn ĐƠN VỊ KIỂM KÊ (không còn là đơn vị đã đặt) — chủ dự án chốt 29/10; dòng "Đặt: …" vẫn hiện đúng đơn vị đã đặt.
    goodQty: 0, damagedQty: 0, unitFactor: 1,
    wrongProduct: false, note: ''
  })).map(l => ({ ...l, unitFactor: poReceiveInitialFactor(l) }));
  renderPoReceiveForm();
}

// [KHOÁ NHẬN TỰ DO — chủ quán yêu cầu 01/10/2026] Đang có đơn đặt hàng chờ nhận (chờ nhận hoặc
// mới nhận một phần — đúng danh sách "Đơn đặt hàng đang chờ" của màn này) thì KHÔNG cho nhận tự do:
// hàng về phải nhận theo đơn để đối chiếu đủ/thiếu với số đã đặt. Đọc lại danh sách đơn ngay lúc
// bấm (đơn Quản lý vừa tạo sau khi mở màn cũng khoá); đọc lỗi thì dùng danh sách lúc mở màn.
// Mất mạng: Firestore KHÔNG báo lỗi mà trả kết quả từ bộ nhớ đệm (fromCache) — rỗng từ đệm là
// "chưa biết", không phải "hết đơn" (cùng cách _watchShiftOpenedStatus), nên giữ danh sách lúc mở
// màn; chỉ kết quả từ máy chủ mới được xoá khoá (đơn vừa nhận đủ/đóng/huỷ).
// Chỉ khoá ở cửa vào: phiếu tự do đang ghi dở (bấm "Xác nhận" lại sau rớt mạng) không bị chặn.
// Đơn nhận một phần mà phần thiếu không về nữa: Quản lý "Đóng đơn (thiếu)" thì nút mở lại.
async function poSelectFree() {
  if (poReceiveState.submitting) return;
  let pos = POS_PENDING_PO_CACHE || [];
  try {
    const snap = await fstore.collection('purchase_orders_gieogieo').where('status', 'in', ['pending', 'partial']).get();
    const moi = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (moi.length || !(snap.metadata && snap.metadata.fromCache)) pos = POS_PENDING_PO_CACHE = moi;
  } catch (err) { console.warn('[Nhận hàng tự do] không đọc lại được đơn đang chờ — dùng danh sách lúc mở màn', err); }
  if (pos.length) {
    toast('🔒 Đang có đơn chờ nhận, vui lòng bấm nhận hàng của đơn');
    renderPoReceiveSelect();
    return;
  }
  poReceiveState.poId = null;
  poReceiveState.supplier = '';
  poReceiveState.lines = [];
  renderPoReceiveForm();
}

// ============================================================================
// [MỚI-DS] POPUP CHỌN NGUYÊN LIỆU DÙNG CHUNG — nổi GIỮA màn hình (#dsItemPickerBg trong
// HTML). Gọi dsOpenItemPicker({title, items, excludeIds, onPick}) từ bất kỳ màn nào cần
// chọn 1 nguyên liệu, thay vì mỗi màn tự viết lại một cái <select>/danh sách riêng — viết
// một lần, dùng lại được cho các tab khác khi áp chuẩn thiết kế mới này rộng ra.
// ============================================================================
let _dsItemPickerState = null;

function dsOpenItemPicker(opts) {
  _dsItemPickerState = { items: opts.items || [], excludeIds: opts.excludeIds || [], onPick: opts.onPick };
  document.getElementById('dsItemPickerTitle').textContent = opts.title || 'Chọn nguyên liệu';
  const searchEl = document.getElementById('dsItemPickerSearch');
  searchEl.value = '';
  dsRenderItemPickerList('');
  document.getElementById('dsItemPickerBg').classList.add('open');
  setTimeout(() => searchEl.focus(), 150);
}

function dsCloseItemPicker() {
  document.getElementById('dsItemPickerBg').classList.remove('open');
  _dsItemPickerState = null;
}

function _dsNormalize(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function dsRenderItemPickerList(q) {
  const st = _dsItemPickerState;
  if (!st) return;
  const nq = _dsNormalize(q);
  const list = st.items.filter(it => _dsNormalize(it.name).indexOf(nq) !== -1);
  const el = document.getElementById('dsItemPickerList');
  if (!list.length) { el.innerHTML = '<div class="ds-sheet-empty">Không tìm thấy nguyên liệu nào.</div>'; return; }
  el.innerHTML = list.map(it => {
    const disabled = st.excludeIds.indexOf(it.id) !== -1;
    return `<button class="ds-sheet-item" data-ds-pick="${it.id}" ${disabled ? 'disabled style="opacity:.35"' : ''}>
      <div><div class="nm">${escHtmlPos(it.name || '')}</div><div class="un">${escHtmlPos(it.unit || '')}</div></div>
      <div class="ck">›</div>
    </button>`;
  }).join('');
  el.querySelectorAll('[data-ds-pick]').forEach(btn => {
    btn.onclick = () => {
      const it = st.items.find(x => x.id === btn.getAttribute('data-ds-pick'));
      dsCloseItemPicker();
      if (it && st.onPick) st.onPick(it);
    };
  });
}

// [BUG#31 FIX] KHÔNG cho HAI dòng cùng một nguyên liệu trong một phiếu nhận.
// Vì sao đây là lỗi thật chứ không phải chuyện thẩm mỹ: mọi id chống-ghi-đúp của luồng nhận
// hàng đều suy ra từ (idemKey, itemId) — `txId: ${idemKey}_${itemId}_RECEIVING`, tem
// `idPrefix: ${idemKey}_ctn_${itemId}`, và `deltas[l.itemId]` khi cập nhật PO. Hai dòng cùng
// itemId ⇒ dòng thứ hai TRÙNG txId với dòng đầu nên applyStockTransactionPOS coi như "đã ghi
// rồi" và BỎ QUA: kho không cộng, tem không sinh, nhưng phiếu nhận vẫn ghi nhận đủ cả hai dòng
// (và `deltas` chỉ còn dòng sau, PO cộng thiếu). Chặn ngay ở chỗ TẠO DÒNG là cách rẻ nhất và
// không làm mất dữ liệu của ai — nhân viên gộp số lượng vào đúng dòng đã có.
// [MỚI-DS] Bấm "+ Thêm nguyên liệu" giờ MỞ THẲNG popup chọn (giữa màn hình), không còn
// tự động gán đại nguyên liệu ĐẦU TIÊN còn trống rồi bắt nhân viên tự sửa lại trong một
// cái <select> nhỏ xíu — dễ nấu sót/gõ nhầm số vào đúng dòng nhưng sai nguyên liệu.
// Chỉ dùng mặc định lúc THÊM nguyên liệu mới, không dùng để dựng lại đơn vị đã chọn.
// Giữ mặc định bao bì lớn nhất như trước; khi nhân viên chọn Bịch/Chai/Lon/... phải giữ
// đúng lựa chọn đó đến hết lượt nhận, không tự quay về mặc định khi chọn lại cùng món.
function poReceiveDefaultUnit(item) {
  const c = poReceiveCountUnit(item);
  return { name: c.name, baseQty: c.baseQty };
}

// [ĐƠN VỊ KIỂM KÊ — chủ dự án 29/10] Đơn vị nhập nhanh LUÔN mặc định là đơn vị kiểm kê của nguyên liệu (countUnitName, cùng đơn vị kết ca
// dùng để đếm). Không khai (hoặc không còn trong quy cách) → đơn vị pha chế. Đổi sang đơn vị khác vẫn bấm được.
function poReceiveCountUnit(item) {
  const it = item || {};
  const pk = (it.packagingUnits || []).find(p => p && p.name && p.name === it.countUnitName && Number(p.baseQty) > 0);
  return pk ? { name: pk.name, baseQty: Number(pk.baseQty) } : { name: it.unit, baseQty: 1 };
}
// Hệ số mặc định của một dòng PO: đơn vị kiểm kê nếu nằm trong các đơn vị chọn được, không thì đơn vị pha chế.
function poReceiveInitialFactor(line) {
  const it = KHO_ITEMS_CACHE.find(x => x.id === line.itemId) || { unit: line.unit, packagingUnits: line.packagingUnits };
  const c = poReceiveCountUnit(it);
  const ok = poReceiveUnitOptions({ ...line, unit: line.unit || it.unit, packagingUnits: it.packagingUnits || line.packagingUnits || [] })
    .some(p => Number(p.baseQty) === Number(c.baseQty));
  return ok ? c.baseQty : 1;
}

function poReceiveUnitOptions(l) {
  const opts = [{ name: l.unit, baseQty: 1 }, ...(l.packagingUnits || [])];
  // Đơn đặt giữ quy cách lúc đặt, kể cả danh mục hiện tại đã đổi.
  if (l.orderUnitName && Number(l.orderUnitFactor) > 0 && !opts.some(p => Number(p.baseQty) === Number(l.orderUnitFactor)))
    opts.push({ name: l.orderUnitName, baseQty: Number(l.orderUnitFactor) });
  return opts.filter(p => p.name && Number.isFinite(Number(p.baseQty)) && Number(p.baseQty) > 0);
}

function poReceiveQuantities(l) {
  const factor = Number(l.unitFactor);
  const unit = poReceiveUnitOptions(l).find(p => Number(p.baseQty) === factor);
  if (!unit) throw new Error(`"${l.name}": chọn lại đơn vị nhận hàng`);
  const goodQty = Number(l.goodQty), damagedQty = Number(l.damagedQty);
  if (![goodQty, damagedQty, goodQty * factor, damagedQty * factor].every(n => Number.isFinite(n) && n >= 0))
    throw new Error(`"${l.name}": số lượng phải là số không âm hợp lệ`);
  return { ...l, receiveUnitName: unit.name, unitFactor: factor,
    goodBase: l.wrongProduct ? 0 : goodQty * factor,
    damagedBase: l.wrongProduct ? 0 : damagedQty * factor };
}

function poReceivePreviewHtml(l) {
  let q;
  try { q = poReceiveQuantities(l); } catch (err) { return `<span class="rc-bad">${escHtmlPos(err.message)}</span>`; }
  const unit = escHtmlPos(q.receiveUnitName);
  const baseUnit = escHtmlPos(l.unit || '');
  const it = KHO_ITEMS_CACHE.find(x => x.id === l.itemId);
  const pk = it && (it.packagingUnits || []).find(p => p.name === it.countUnitName);
  const countBase = pk && Number(pk.baseQty) > 0 ? Number(pk.baseQty) : (it && String(it.unit || '').trim().toLowerCase() === 'cái' ? 1 : 0);
  const n = countBase > 0 ? q.goodBase / countBase : 0;
  const tags = it && it.stockManaged !== false && it.trackingMode === 'unit' && q.goodBase > 0 && countBase > 0
    ? (Math.abs(n - Math.round(n)) <= 1e-6
      ? ` · tạo <b>${Math.round(n)} mã NL</b> (${escHtmlPos(it.countUnitName || it.unit)})`
      : ' <span class="rc-bad">Chưa tròn đơn vị dán mã — kiểm tra số lượng</span>') : '';
  return `Vào kho <b>+${fmtPrepQty(q.goodBase)} ${baseUnit}</b> <span class="rc-mut">(${fmtPrepQty(l.goodQty)} ${unit})</span>`
    + (q.damagedBase > 0 ? ` · hỏng <b>${fmtPrepQty(l.damagedQty)} ${unit}</b>` : '') + tags;
}

function poReceiveAddFreeLine() {
  if (poReceiveState.submitting) return;
  if (!KHO_ITEMS_CACHE.length) { toast('⚠️ Chưa tải được danh sách nguyên liệu'); return; }
  const usedIds = poReceiveState.lines.map(l => l.itemId);
  dsOpenItemPicker({
    title: 'Thêm nguyên liệu',
    items: KHO_ITEMS_CACHE.filter(x => x.active !== false),   // [NGỪNG SỬ DỤNG] Quản lý đã ngừng → không nhập mới
    excludeIds: usedIds,
    onPick(it) {
      if (poReceiveState.submitting) return;
      const receivingUnit = poReceiveDefaultUnit(it);
      poReceiveState.lines.push({
        itemId: it.id, name: it.name, unit: it.unit, packagingUnits: it.packagingUnits || [],
        qtyExpectedBase: null, goodQty: 0, damagedQty: 0, unitFactor: receivingUnit.baseQty, wrongProduct: false, note: ''
      });
      renderPoReceiveForm();
    }
  });
}

function poReceiveRemoveLine(idx) {
  if (poReceiveState.submitting) return;
  // [BUG#33 FIX] Dòng đã vào kho thì xoá khỏi form là tạo ra một phiếu nhận không kể hết những gì
  // đã thật sự nhận (và `partial` tính sai theo). Sửa/huỷ phần đã vào kho là việc của
  // Quản lý ▸ Sửa phiếu nhận.
  const l = poReceiveState.lines[idx];
  if (l && (poReceiveState.appliedLines || {})[l.itemId]) {
    toast('⚠️ Dòng này đã vào kho ở lượt trước — không xoá khỏi phiếu được. Dùng Quản lý ▸ Sửa phiếu nhận nếu cần sửa.');
    return;
  }
  const card = document.querySelector('[data-po-card="' + idx + '"]');
  if (card) card.classList.add('leaving');
  setTimeout(() => {
    if (poReceiveState.submitting) { if (card) card.classList.remove('leaving'); return; }
    const current = poReceiveState.lines.indexOf(l);
    if (current >= 0) poReceiveState.lines.splice(current, 1);
    renderPoReceiveForm();
  }, 140);
}

// [MỚI-DS] Đổi nguyên liệu của một dòng — mở popup chọn thay vì đổi <select> tại chỗ, và
// (mới) áp cùng khoá "đã vào kho thì không sửa nữa" mà poReceiveRemoveLine() đã có, vì đổi
// itemId của một dòng đã ghi kho để lại đúng cùng một kiểu chứng từ mồ côi như xoá dòng đó.
function poReceiveOpenItemPicker(idx) {
  if (poReceiveState.submitting) return;
  const l = poReceiveState.lines[idx];
  if (l && (poReceiveState.appliedLines || {})[l.itemId]) {
    toast('⚠️ Dòng này đã vào kho ở lượt trước — không đổi nguyên liệu được. Dùng Quản lý ▸ Sửa phiếu nhận nếu cần sửa.');
    return;
  }
  const usedIds = poReceiveState.lines.filter((x, i) => i !== idx).map(x => x.itemId);
  dsOpenItemPicker({
    title: 'Đổi nguyên liệu',
    items: KHO_ITEMS_CACHE.filter(x => x.active !== false),
    excludeIds: usedIds,
    onPick(it) { poReceiveLineChangeItem(idx, it.id); }
  });
}

function poReceiveLineChangeItem(idx, itemId) {
  if (poReceiveState.submitting) return;
  const it = KHO_ITEMS_CACHE.find(x => x.id === itemId); if (!it) return;
  // [BUG#31 FIX] Xem chú thích ở poReceiveAddFreeLine() — hai dòng cùng itemId làm dòng sau bị
  // bỏ qua khi ghi kho. Popup chọn đã tự loại nguyên liệu trùng khỏi danh sách (excludeIds), nên
  // nhánh này giờ chỉ còn là lưới an toàn cuối cùng.
  if (poReceiveState.lines.some((x, i) => i !== idx && x.itemId === itemId)) {
    toast('⚠️ Nguyên liệu này đã có dòng khác trong phiếu — gộp số lượng vào dòng đó');
    return;
  }
  const l = poReceiveState.lines[idx];
  // Chọn lại CÙNG món là giữ nguyên dòng, tuyệt đối không reset về đơn vị mặc định.
  // Bản cũ giữ goodQty=6 nhưng gán unitFactor=Thùng -> 72.000g, sinh 36 mã Bịch.
  if (!l || l.itemId === it.id) return;
  if ((poReceiveState.appliedLines || {})[l.itemId]) { toast('⚠️ Dòng này đã vào kho — không đổi nguyên liệu ở lượt thử lại'); return; }
  const receivingUnit = poReceiveDefaultUnit(it);
  l.itemId = it.id; l.name = it.name; l.unit = it.unit; l.packagingUnits = it.packagingUnits || [];
  l.unitFactor = receivingUnit.baseQty;
  l.goodQty = 0; l.damagedQty = 0; // số cũ thuộc nguyên liệu/quy cách cũ
  renderPoReceiveForm();
}

// unitFactor/wrongProduct đổi cả hình dạng thẻ (bộ đếm bật/tắt, viền đỏ) nên render lại
// toàn bộ; goodQty/damagedQty/note chỉ cập nhật đúng phần xem trước để KHÔNG mất focus
// đang gõ dở trên chính ô đó.
function poReceiveLineChangeField(idx, field, val) {
  if (poReceiveState.submitting) return;
  const l = poReceiveState.lines[idx];
  if (field === 'goodQty' || field === 'damagedQty') { l[field] = Number(val) || 0; poReceiveRefreshLinePreview(idx); return; }
  if (field === 'unitFactor') {
    const factor = Number(val);
    if (!poReceiveUnitOptions(l).some(p => Number(p.baseQty) === factor) || factor === Number(l.unitFactor)) return;
    if ((poReceiveState.appliedLines || {})[l.itemId]) { toast('⚠️ Dòng này đã vào kho — không đổi đơn vị ở lượt thử lại'); return; }
    const hadQty = l.goodQty || l.damagedQty;
    l.unitFactor = factor; l.goodQty = 0; l.damagedQty = 0;
    renderPoReceiveForm();
    if (hadQty) toast('Đã đổi đơn vị — nhập lại số lượng theo đơn vị mới');
    return;
  }
  if (field === 'wrongProduct') { l.wrongProduct = !!val; renderPoReceiveForm(); return; }
  if (field === 'note') { l.note = val; return; }
}

function poReceiveStepQty(idx, field, dir) {
  if (poReceiveState.submitting) return;
  const l = poReceiveState.lines[idx];
  l[field] = Math.max(0, round2((Number(l[field]) || 0) + dir));
  renderPoReceiveForm();
}

function poReceiveRefreshLinePreview(idx) {
  const l = poReceiveState.lines[idx];
  const el = document.getElementById('polChips' + idx);
  if (el && !l.wrongProduct) el.innerHTML = poReceivePreviewHtml(l);
  const st = document.getElementById('polSt' + idx);
  if (st) { st.textContent = rcStatusText(l); st.className = 'rc-st ' + rcStatusClass(l); }
}

function poReceiveOnPhotoChange(input) {
  const files = Array.from(input.files || []).slice(0, 3 - poReceiveState.photoFiles.length);
  poReceiveState.photoFiles.push(...files);
  poReceiveState.photoUrlsDone = null; // danh sách ảnh đổi ⇒ URL đã upload không còn đại diện đủ
  input.value = '';
  renderPoReceivePhotoPreview();
}

function poReceiveRemovePhoto(idx) { poReceiveState.photoFiles.splice(idx, 1); poReceiveState.photoUrlsDone = null; renderPoReceivePhotoPreview(); }

function renderPoReceivePhotoPreview() {
  const el = document.getElementById('poReceivePhotoPreview');
  if (!el) return;
  el.innerHTML = poReceiveState.photoFiles.map((f, i) => `
    <div style="position:relative;display:inline-block;margin:0 8px 8px 0;">
      <img src="${URL.createObjectURL(f)}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;">
      <button onclick="poReceiveRemovePhoto(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e74c3c;color:#fff;border:none;font-size:12px;cursor:pointer;">✕</button>
    </div>`).join('');
}

// [MỚI-DS] Thiết kế lại theo chuẩn mới (xem token/lớp ds-* ở đầu file): nút to dễ bấm, bo
// tròn nhiều, mỗi trạng thái một màu riêng, chọn nguyên liệu qua popup giữa màn thay vì
// <select> nhỏ xíu. Phần ẢNH PHIẾU GIAO HÀNG tạm ẨN khỏi giao diện (tính năng chưa triển
// khai thật ở quán — storageRef thường chưa bật) — các hàm poReceiveOnPhotoChange()/
// poReceiveUploadPhotos() vẫn giữ nguyên trong file, chỉ là không có gì gọi tới UI của
// chúng nữa; bật lại UI này sau chỉ cần thêm lại đúng khối HTML gọi poReceiveOnPhotoChange.
// [v2] Widget kiểu manage: màu nhạt riêng từng món (theo mã nguyên liệu — món nào luôn cùng một màu), tên to, ô số lượng lớn, đơn vị đang chọn
// nổi bật (nền đen). Hỏng / Sai sản phẩm / Ghi chú gập gọn, tự mở khi đã có dữ liệu.
function rcTint(l) {
  const RC_TINTS = ['#3b6fb6', '#2f7d6d', '#b8862f', '#7a5bb0', '#5f7a8a', '#a8575f'];
  if (l.wrongProduct) return '#ae5a4f';
  const k = String(l.itemId || ''); if (!k) return '#87918b';
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return RC_TINTS[h % RC_TINTS.length];
}
function rcStatusText(l) { return l.wrongProduct ? 'Không cộng kho' : (Number(l.goodQty) > 0 ? 'Đã nhập' : 'Chưa nhập'); }
function rcStatusClass(l) { return l.wrongProduct ? 'no' : (Number(l.goodQty) > 0 ? 'ok' : ''); }
function rcMoreOpen(l) { return l.moreOpen !== undefined ? !!l.moreOpen : !!(Number(l.damagedQty) > 0 || l.wrongProduct || l.note); }
function rcMoreSummary(l) {
  const a = [];
  if (Number(l.damagedQty) > 0) a.push('Hỏng ' + fmtPrepQty(l.damagedQty));
  if (l.wrongProduct) a.push('Sai sản phẩm'); else if (l.note) a.push('Ghi chú');
  return a.join(' · ');
}
function poReceiveToggleMore(idx) {
  const l = poReceiveState.lines[idx]; if (!l) return;
  l.moreOpen = !rcMoreOpen(l);
  renderPoReceiveForm();
}
function poReceiveLineCardHtml(l, idx, isFree) {
  const opts = poReceiveUnitOptions(l);
  const factor = Number(l.unitFactor) || 1;
  const selectedUnit = (opts.find(p => Number(p.baseQty) === factor) || {}).name || '?';
  const segHtml = opts.map(o => {
    const on = Number(o.baseQty) === factor;
    const quyDoi = Number(o.baseQty) > 1 ? `<small>= ${fmtPrepQty(Number(o.baseQty))} ${escHtmlPos(l.unit || '')}</small>` : '';
    return `<button type="button" onclick="poReceiveLineChangeField(${idx},'unitFactor','${o.baseQty}')" class="${on ? 'on' : ''}">${escHtmlPos(o.name)}${quyDoi}</button>`;
  }).join('');
  const open = rcMoreOpen(l);
  const dis = l.wrongProduct ? 'disabled' : '';
  const un = escHtmlPos(selectedUnit);
  const head = isFree ? `
    <div class="rc-pick" onclick="poReceiveOpenItemPicker(${idx})">
      <div class="txt"><div class="rc-nm">${escHtmlPos(l.name || 'Chọn nguyên liệu')}</div><div class="rc-meta">Đơn vị pha chế · ${escHtmlPos(l.unit || '')}</div></div>
      <div class="chev">&rsaquo;</div>
    </div>` : `
    <div class="rc-top"><div>
      <div class="rc-nm">${escHtmlPos(l.name || '')}</div>
      <div class="rc-meta">Đặt ${poLineQtyText(l, l.qtyExpectedBase)}${l.receivedGoodBase > 0 ? ` · đã nhận ${poLineQtyText(l, l.receivedGoodBase)}` : ''}</div>
    </div><span class="rc-st ${rcStatusClass(l)}" id="polSt${idx}">${rcStatusText(l)}</span></div>`;
  return `
  <section class="rc-w${l.wrongProduct ? ' wrong' : ''}" data-po-card="${idx}" style="--c:${rcTint(l)}">
    ${isFree ? `<button type="button" class="rc-del" onclick="poReceiveRemoveLine(${idx})" aria-label="Bỏ dòng">&minus;</button>` : ''}
    ${head}
    <div class="rc-qty${l.wrongProduct ? ' dis' : ''}"><input id="polGood${idx}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" value="${Number(l.goodQty) > 0 ? l.goodQty : ''}" oninput="poReceiveLineChangeField(${idx},'goodQty',this.value)" ${dis}><span class="u">${un}</span></div>
    ${opts.length > 1 ? `<div class="rc-units">${segHtml}</div>` : ''}
    <div class="rc-sum" id="polChips${idx}">${l.wrongProduct ? 'Sai sản phẩm — không cộng kho' : poReceivePreviewHtml(l)}</div>
    <div class="rc-more">
      <button type="button" class="rc-more-h" onclick="poReceiveToggleMore(${idx})" aria-expanded="${open}"><span>Hỏng · Sai sản phẩm · Ghi chú</span><span class="r">${escHtmlPos(rcMoreSummary(l))}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${open ? 'transform:rotate(180deg)' : ''}"><path d="M6 9l6 6 6-6"/></svg></span></button>
      ${open ? `<div class="rc-more-b">
        <div class="rc-fld"><label for="polBad${idx}">Số ${un} hỏng</label><span><input id="polBad${idx}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" value="${Number(l.damagedQty) > 0 ? l.damagedQty : ''}" oninput="poReceiveLineChangeField(${idx},'damagedQty',this.value)" ${dis}><span class="un">${un}</span></span></div>
        <label class="rc-chk${l.wrongProduct ? ' on' : ''}"><input type="checkbox" ${l.wrongProduct ? 'checked' : ''} onchange="poReceiveLineChangeField(${idx},'wrongProduct',this.checked)"><i></i><div>Sai sản phẩm<span>Hàng giao không đúng — không cộng vào kho</span></div></label>
        <input class="rc-note" placeholder="Ghi chú riêng (không bắt buộc)" value="${escHtmlPos(l.note || '').split('"').join('&quot;')}" oninput="poReceiveLineChangeField(${idx},'note',this.value)">
      </div>` : ''}
    </div>
  </section>`;
}

// [v2] Giao diện KHÔNG còn nút −/+ (nhập 100 cái là gõ thẳng vào ô số lượng). Hàm giữ nguyên để tương thích; không nơi nào trong form gọi tới.
function poReceiveStepperHtml(idx, field, val, disabled) {
  return `<div class="ds-stepper">
    <button class="ds-stepbtn" onclick="poReceiveStepQty(${idx},'${field}',-1)" ${disabled ? 'disabled' : ''}>–</button>
    <input class="ds-qtyval" type="number" inputmode="decimal" min="0" step="0.01" value="${val}" oninput="poReceiveLineChangeField(${idx},'${field}',this.value)" ${disabled ? 'disabled' : ''}>
    <button class="ds-stepbtn" onclick="poReceiveStepQty(${idx},'${field}',1)" ${disabled ? 'disabled' : ''}>+</button>
  </div>`;
}

// Quay lại danh sách đơn; đã gõ số lượng thì hỏi trước để không mất dữ liệu đang nhập.
async function poReceiveBack() {
  if (poReceiveState.submitting) { toast('⏳ Đang ghi nhận hàng, vui lòng đợi'); return; }
  const dirty = (poReceiveState.lines || []).some(l => (Number(l.goodQty) || 0) > 0 || (Number(l.damagedQty) || 0) > 0 || l.wrongProduct || l.note);
  if (dirty && !(await posConfirm('Quay lại danh sách đơn?\nSố lượng đã nhập ở màn này sẽ mất.', { okText: 'Quay lại', cancelText: 'Ở lại' }))) return;
  openPoReceiveScreen();
}

function renderPoReceiveForm() {
  const box = document.getElementById('poReceiveBody');
  const isFree = !poReceiveState.poId;
  const lines = poReceiveState.lines;
  box.innerHTML = `
    <div class="rc-page">
      <button type="button" class="rc-back" onclick="poReceiveBack()" aria-label="${isFree ? 'Về danh sách đơn' : 'Chọn đơn khác'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h1 class="rc-title">${isFree ? 'Nhận hàng tự do' : escHtmlPos(poReceiveState.supplier || '(không ghi nhà cung cấp)')}</h1>
      <div class="rc-subtitle">${isFree ? 'Không theo đơn đặt' : 'Theo đơn đặt'} · ${lines.length} dòng</div>
      ${lines.map((l, idx) => poReceiveLineCardHtml(l, idx, isFree)).join('') || `<div class="rc-empty">Chưa có nguyên liệu nào — bấm "Thêm nguyên liệu" bên dưới.</div>`}
      ${isFree ? `<button type="button" class="rc-add" onclick="poReceiveAddFreeLine()"><span class="plus">+</span> Thêm nguyên liệu</button>` : ''}

      <div class="rc-h">Ghi chú chung</div>
      <textarea id="poReceiveNote" class="rc-ta" placeholder="VD: giao thiếu 1 thùng, hẹn bù đợt sau…"></textarea>
      <div class="rc-pin">${renderPinInput('poReceiveStaff')}</div>
      <button type="button" class="rc-cta" onclick="submitPoReceive()">Xác nhận nhận hàng</button>
    </div>
  `;
}

// [BUG#27 FIX phần ảnh] Đường dẫn ảnh cũ có Date.now() nên MỖI lần bấm "Ghi nhận" lại là một
// lần upload MỚI với URL MỚI cho cùng tấm ảnh — phiếu nhận phình ra 2-3 bản của cùng chứng từ
// (và tốn dung lượng). Giờ: đường dẫn suy ra CỐ ĐỊNH từ idemKey + vị trí ảnh, và URL đã upload
// xong được giữ trong poReceiveState để lượt retry dùng lại luôn, không upload lần nữa.
async function poReceiveUploadPhotos(recordId) {
  if (!storageRef || !poReceiveState.photoFiles.length) return [];
  if (Array.isArray(poReceiveState.photoUrlsDone) &&
      poReceiveState.photoUrlsDone.length === poReceiveState.photoFiles.length) {
    return poReceiveState.photoUrlsDone;
  }
  const uploads = poReceiveState.photoFiles.map(async (file, i) => {
    try {
      const ref = storageRef.ref(`receiving_photos_gieogieo/${recordId}/${i}_${file.name || 'photo.jpg'}`);
      const snap = await ref.put(file);
      return await snap.ref.getDownloadURL();
    } catch (err) {
      console.warn('[Giai đoạn 5] Upload ảnh thất bại (bỏ qua, không chặn nhận hàng):', err);
      return null;
    }
  });
  const urls = (await Promise.all(uploads)).filter(Boolean);
  if (urls.length === poReceiveState.photoFiles.length) poReceiveState.photoUrlsDone = urls;
  return urls;
}

// Cập nhật số đã nhận trên PO qua runTransaction — an toàn khi 1 PO được nhận nhiều đợt
// hoặc 2 người cùng thao tác (đúng nguyên tắc runTransaction đã dùng xuyên suốt tài liệu).
async function poReceiveUpdatePODoc(poId, deltasByItemId, idemKey) {
  const poRef = fstore.collection('purchase_orders_gieogieo').doc(poId);
  await fstore.runTransaction(async (t) => {
    const doc = await t.get(poRef);
    if (!doc.exists) return; // PO có thể đã bị xoá — không chặn, chỉ bỏ qua cập nhật này
    const data = doc.data();
    const lines = (data.lines || []).map(l => {
      const d = deltasByItemId[l.itemId];
      if (!d) return l;
      // [BUG "nhận hàng cộng kho 2 lần khi retry" — FIX] Mỗi dòng chỉ cộng dồn theo ĐÚNG một
      // idemKey (1 phiếu nhận) một lần — bấm lại sau khi mạng chập chờn (server đã ghi thật,
      // client tưởng lỗi) sẽ gọi lại hàm này với CÙNG deltasByItemId, nếu không chặn ở đây thì
      // "đã nhận" trên PO sẽ bị cộng đúp dù kho/ledger đã tự chặn đúp ở tầng khác rồi.
      const applied = l.appliedReceiveRecordIds || [];
      if (idemKey && applied.includes(idemKey)) return l;
      return {
        ...l,
        receivedGoodBase: (Number(l.receivedGoodBase) || 0) + d.good,
        receivedDamagedBase: (Number(l.receivedDamagedBase) || 0) + d.damaged,
        wrongProduct: l.wrongProduct || d.wrongProduct,
        ...(idemKey ? { appliedReceiveRecordIds: [...applied, idemKey] } : {})
      };
    });
    const allReceived = lines.every(l => (Number(l.receivedGoodBase) || 0) >= (Number(l.qtyExpectedBase) || 0));
    const anyReceived = lines.some(l => (Number(l.receivedGoodBase) || 0) > 0);
    const status = allReceived ? 'received' : (anyReceived ? 'partial' : data.status);
    t.update(poRef, { lines, status, updatedAt: vnDate().toISOString() });
  });
}

// [BUG#27 FIX] GHI PHIẾU NHẬN THEO KIỂU CỘNG DỒN, KHÔNG GHI ĐÈ.
//
// TRƯỚC ĐÂY chỗ này gọi `recordRef.set({... lines: succeeded ...})` — set() KHÔNG merge, mà
// idemKey (= id của doc phiếu nhận) lại được giữ CỐ ĐỊNH xuyên suốt các lần bấm lại. Nên phiếu
// nhận của lượt sau ĐÈ SẠCH phiếu của lượt trước: dòng nào không có trong `succeeded` của
// ĐÚNG LƯỢT NÀY là mất khỏi chứng từ, dù hàng đã thật sự vào kho ở lượt trước.
// (Dòng đã ghi thành công ở lượt trước thường vẫn nằm trong `succeeded` vì
// applyStockTransactionPOS trả về alreadyApplied chứ không throw — nhưng nó RƠI RA ngay khi:
//  · lượt sau chính dòng đó lỗi mạng lúc đọc lại/kiểm tra txId — rất dễ xảy ra vì đang retry
//    đúng lúc mạng chập chờn;
//  · nhân viên xoá bớt các dòng "đã xong" khỏi form trước khi bấm lại (UI cho xoá dòng);
//  · nguyên liệu của dòng đó vừa bị xoá bên Management ⇒ applyStockTransactionPOS throw.)
// Tồn kho vẫn đúng, nhưng CHỨNG TỪ mất dòng: đối soát nhà cung cấp, drill-down ở Management và
// cả màn "Sửa phiếu nhận" đều đọc từ đây. Ảnh chứng từ cũng bị thay trắng theo cùng cách.
//
// Giờ: transaction trên đúng doc đó, merge theo itemId (dòng cũ giữ nguyên, dòng mới thêm vào,
// dòng retry thành công cập nhật trạng thái), ảnh chứng từ HỢP nhất hai lượt, và createdAt/
// businessDate giữ của lần ghi ĐẦU TIÊN — phiếu vẫn là một phiếu, không bị "trẻ lại" theo lượt
// retry. Dòng còn lỗi lưu riêng ở `failedLines` (chỉ để soi, KHÔNG tính là đã nhận) nên không
// có chỗ nào đọc nhầm thành hàng đã vào kho.
async function poReceiveMergeRecord(recordRef, o) {
  await fstore.runTransaction(async (t) => {
    const doc = await t.get(recordRef);
    const cu = doc.exists ? (doc.data() || {}) : null;
    const theoItem = new Map();
    ((cu && Array.isArray(cu.lines)) ? cu.lines : []).forEach(l => { if (l && l.itemId) theoItem.set(l.itemId, l); });
    (o.newLines || []).forEach(l => theoItem.set(l.itemId, Object.assign({}, theoItem.get(l.itemId) || {}, l)));
    const lines = Array.from(theoItem.values());
    const anhCu = (cu && Array.isArray(cu.photoUrls)) ? cu.photoUrls : [];
    const photoUrls = Array.from(new Set(anhCu.concat(o.photoUrls || [])));
    // Còn dòng chưa ghi được hay không tính theo TỔNG số dòng của phiếu so với số dòng đã ghi
    // trọn vẹn — không theo riêng lượt bấm này (lượt retry có thể chỉ chạy 1 dòng).
    const conThieu = lines.length < o.totalLines || (o.failedCount || 0) > 0;
    const payload = {
      poId: o.poId, supplier: o.supplier, lines,
      failedLines: o.failedLines || [],
      staff: o.staff, staffEmployeeId: o.staffEmployeeId, note: o.note, photoUrls,
      partial: conThieu,
      lineCountExpected: o.totalLines,
      createdAt: (cu && cu.createdAt) ? cu.createdAt : o.nowISO,
      businessDate: (cu && cu.businessDate) ? cu.businessDate : o.businessDate,
      updatedAt: o.nowISO, source: 'pos'
    };
    if (doc.exists) t.update(recordRef, payload); else t.set(recordRef, payload);
  });
}

async function submitPoReceive() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const state = poReceiveState;
  const body = document.getElementById('poReceiveBody');
  _posSubmitBusy = true;
  state.submitting = true;
  if (body) body.inert = true;
  try { await _submitPoReceiveImpl(); }
  finally {
    state.submitting = false;
    if (body) body.inert = false;
    _posSubmitBusy = false;
  }
}

async function _submitPoReceiveImpl() {
  // Chụp lựa chọn NGAY LÚC BẤM, trước await kiểm tra nhân viên/ghi kho. Không giữ
  // tham chiếu dòng và quy cách có thể đổi giữa lúc chờ rồi đọc lại ở bước cuối.
  const lines = poReceiveState.lines.map(l => ({ ...l,
    packagingUnits: (l.packagingUnits || []).map(p => ({ ...p })) }));
  const receiptItems = new Map(lines.map(l => {
    const it = KHO_ITEMS_CACHE.find(x => x.id === l.itemId);
    return [l.itemId, it ? { ...it, packagingUnits: (it.packagingUnits || []).map(p => ({ ...p })) } : null];
  }));
  if (!lines.length) { toast('⚠️ Chưa có nguyên liệu nào'); return; }
  const staffEmp = await resolveStaffPinAndCheckin('poReceiveStaff');
  if (!staffEmp) return;
  const staff = staffEmp.fullName;
  const hasAnyQty = lines.some(l => l.wrongProduct || (Number(l.goodQty) || 0) > 0 || (Number(l.damagedQty) || 0) > 0);
  if (!hasAnyQty) { toast('⚠️ Nhập số lượng cho ít nhất 1 dòng'); return; }
  // [BUG#31 FIX] Chốt chặn cuối, fail-closed TRƯỚC mọi lệnh ghi: nếu vì lý do gì đó vẫn còn hai
  // dòng cùng nguyên liệu (trạng thái cũ còn trong RAM trước khi nạp bản này), thà không ghi còn
  // hơn ghi một phiếu mà kho chỉ cộng một nửa. Xem poReceiveAddFreeLine().
  const trung = lines.map(l => l.itemId).filter((id, i, a) => a.indexOf(id) !== i);
  if (trung.length) {
    const ten = (lines.find(l => l.itemId === trung[0]) || {}).name || trung[0];
    toast(`⚠️ "${ten}" có 2 dòng trong phiếu — gộp thành 1 dòng rồi ghi nhận (kho sẽ cộng thiếu nếu để trùng)`);
    return;
  }

  const generalNote = (document.getElementById('poReceiveNote').value || '').trim();
  // [BUG "nhận hàng cộng kho 2 lần khi retry" — FIX] Trước đây MỖI LẦN gọi hàm này đều sinh
  // recordRef/txRef MỚI hoàn toàn (`.doc()` ngẫu nhiên) — bấm "Ghi nhận" lại sau khi app timeout
  // (server đã commit RECEIVING thật, client chỉ mất gói ACK) tạo ra một phiếu nhận + ledger THỨ
  // HAI cho đúng lô hàng đó, cộng đúp tồn kho. Giờ sinh idemKey MỘT LẦN, giữ nguyên trong
  // poReceiveState xuyên suốt các lần bấm lại (chỉ mất khi mở lại màn hoặc khi đã ghi nhận XONG
  // HẲN) — mọi id downstream (recordRef, mỗi dòng ledger, mỗi tem) đều suy ra CỐ ĐỊNH từ idemKey
  // này, nên bấm lại chỉ là no-op an toàn cho phần đã ghi, và ghi thật cho phần còn thiếu.
  if (!poReceiveState.idemKey) {
    poReceiveState.idemKey = 'recv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }
  const idemKey = poReceiveState.idemKey;
  const recordRef = fstore.collection('receiving_records_gieogieo').doc(idemKey);

  // Tính base qty từng dòng trước, dùng lại cho cả ledger tx lẫn doc receiving_records + cập nhật PO.
  let computed;
  try { computed = lines.map(poReceiveQuantities); }
  catch (err) { toast('⚠️ ' + err.message); return; }

  // [BUG#33 FIX] Bấm lại SAU KHI một dòng đã vào kho, nhưng với SỐ KHÁC.
  // Kịch bản: lượt 1 dòng A ghi 10 thành công, dòng B lỗi → giữ form để bấm lại; nhân viên phát
  // hiện dòng A gõ sai nên sửa 10 → 5 rồi bấm "Ghi nhận" lại. txId của A đã tồn tại nên
  // applyStockTransactionPOS no-op (kho vẫn 10 — ĐÚNG theo thiết kế chống cộng đúp), NHƯNG phiếu
  // nhận lại được ghi theo số MỚI là 5 ⇒ sổ kho nói 10, phiếu nói 5, không ai được cảnh báo.
  // Sửa số đã vào kho là việc của công cụ riêng (Quản lý ▸ Sửa phiếu nhận — nó sửa đồng thời tồn,
  // ledger, tem và đơn đặt hàng). Ở đây chặn lại và nói rõ, thay vì ghi ra một phiếu sai.
  const daGhi = poReceiveState.appliedLines || {};
  const lechSo = computed.filter(l => daGhi[l.itemId] &&
    (Math.abs((Number(daGhi[l.itemId].goodBase) || 0) - l.goodBase) > 1e-9 ||
     Math.abs((Number(daGhi[l.itemId].damagedBase) || 0) - l.damagedBase) > 1e-9));
  if (lechSo.length) {
    const l0 = lechSo[0], cu = daGhi[l0.itemId];
    toast(`⚠️ "${l0.name}" đã vào kho ${cu.goodBase} ${l0.unit || ''} ở lượt trước — không sửa được số ở đây. Trả lại đúng số cũ rồi ghi nhận, sau đó sửa bằng Quản lý ▸ Sửa phiếu nhận.`);
    return;
  }
  // [TEM = SỰ THẬT] Món dán tem theo đơn vị: tồn = tổng mã, mà mỗi mã là MỘT đơn vị đếm
  // (chai/hộp...). Nhận một lượng không chia hết thành đơn vị đếm (chọn nhầm "ml", gõ 2,5 hộp),
  // chưa khai quy cách, hoặc quá 60 tem thì createContainersForReceipt() sinh thiếu/không sinh
  // tem, còn RECEIVING đã cộng đủ — rồi recompute xoá phần không có mã, KHÔNG để lại vết nào.
  // "Bấm Ghi nhận lại" cũng không cứu được (làm tròn vẫn ra đúng số tem cũ). Chặn ngay ở đây,
  // khi chưa có gì được ghi. Dòng đã vào kho ở lượt trước thì bỏ qua (đã bị chốt ở trên).
  const temChan = computed.map(l => {
    if (daGhi[l.itemId] || !(l.goodBase > 0)) return null;
    const it = receiptItems.get(l.itemId);
    if (!it || it.stockManaged === false || it.trackingMode !== 'unit') return null;
    const isDiscrete = String(it.unit || '').trim().toLowerCase() === 'cái';
    const pk = (it.packagingUnits || []).find(p => p.name === it.countUnitName);
    if (!pk && !isDiscrete) return `"${l.name}" dán tem theo đơn vị nhưng chưa khai đơn vị đếm (quy cách) — báo Quản lý khai trước khi nhận`;
    const bq = pk && Number(pk.baseQty) > 0 ? Number(pk.baseQty) : 1;
    const dv = (pk && pk.name) || it.unit || 'đơn vị';
    const n = l.goodBase / bq;
    if (Math.abs(n - Math.round(n)) > 1e-6)
      return `"${l.name}": ${fmtPrepQty(l.goodBase)} ${l.unit || ''} không tròn số ${dv} (1 ${dv} = ${fmtPrepQty(bq)} ${l.unit || ''}) — mỗi ${dv} là một tem, nhập theo số ${dv} nguyên`;
    if (Math.round(n) > 60) return `"${l.name}": ${Math.round(n)} tem là bất thường — kiểm tra lại đơn vị nhập`;
    return null;
  }).filter(Boolean);
  if (temChan.length) { toast('⚠️ ' + temChan[0]); return; }

  // Đặt 1 thùng nhưng gõ 6 khi ô đang là Thùng: không âm thầm nhận gấp 6 lần.
  // Vẫn cho giao dư thực tế, nhưng phải đọc lại số/đơn vị rõ ràng trước khi ghi kho.
  const vuotDon = computed.filter(l => !daGhi[l.itemId] && l.qtyExpectedBase != null &&
    l.goodBase > Math.max(0, Number(l.qtyExpectedBase) - (Number(l.receivedGoodBase) || 0)) + 1e-6);
  if (vuotDon.length) {
    const detail = vuotDon.map(l => `${l.name}: đang nhận ${fmtPrepQty(l.goodQty)} ${l.receiveUnitName} (${fmtPrepQty(l.goodBase)} ${l.unit}). Đơn còn ${poLineQtyText(l, Math.max(0, Number(l.qtyExpectedBase) - (Number(l.receivedGoodBase) || 0)))}.`).join('\n');
    if (!(await posConfirm('Số lượng nhận vượt đơn đặt. Kiểm tra Bịch/Thùng trước khi tiếp tục.\n\n' + detail,
      { okText: 'Đúng, nhận hàng dư', cancelText: 'Sửa số lượng' }))) return;
  }

  try {
    const photoUrls = await poReceiveUploadPhotos(recordRef.id);

    const supplierNote = poReceiveState.supplier ? ` — ${poReceiveState.supplier}` : '';
    // [FIX] LỖI TRỪ KHO 2 LẦN: trước đây RECEIVING chỉ cộng `goodBase`, rồi WASTE
    // lại trừ `damagedBase` — nhưng số hư hỏng CHƯA TỪNG được cộng vào kho. Kết quả
    // tồn kho bị hụt đúng bằng số hư hỏng sau mỗi lần nhận hàng có hàng vỡ/hỏng
    // (nhập 100 chai, vỡ 10 → kho chỉ tăng 80 thay vì 90), và sai này tích luỹ dần.
    //
    // Cách đúng: NHẬN HẾT trước (good + damaged, vì hàng vỡ vẫn thực sự được giao
    // tới quán), rồi ghi WASTE trừ đi phần hỏng. Tồn kho ròng = goodBase (đúng), và
    // sổ kho vẫn còn đủ 2 vết để đối chiếu/khiếu nại nhà cung cấp.
    //
    // [BUG "nhận hàng tạo phiếu nhập giả khi ledger chỉ ghi một phần" — FIX] Trước đây TẤT CẢ
    // dòng chạy song song qua Promise.allSettled rồi bất kể dòng nào lỗi, code vẫn ghi
    // receiving_records/PO/tem cho ĐỦ MỌI dòng — phiếu nhận hiện "đã nhận" và tem đã sinh dù
    // currentStock của đúng dòng đó chưa hề tăng. Giờ theo dõi ĐÚNG TỪNG DÒNG có ghi kho trọn vẹn
    // hay không (cả RECEIVING lẫn WASTE của dòng đó, nếu có, đều phải thành công); chỉ dòng nào
    // trọn vẹn mới được đưa vào phiếu nhận/PO/sinh tem — dòng lỗi coi như CHƯA nhận, giữ nguyên
    // trong form để bấm "Ghi nhận" lại (idemKey cố định nên chỉ dòng lỗi mới thực sự ghi lại).
    const lineOutcomes = await Promise.all(computed.map(async (l) => {
      const receiveBase = l.goodBase + l.damagedBase;
      let ok = true;
      if (receiveBase > 0) {
        try {
          await UnitEngine.ledger.apply({
            itemId: l.itemId, type: 'RECEIVING', qty: receiveBase,
            note: `Nhận hàng${supplierNote}` + (l.damagedBase > 0 ? ` (gồm ${l.damagedBase} hư hỏng)` : '') + (l.note ? ` · ${l.note}` : ''),
            staff, staffEmployeeId: staffEmp.id, referenceId: recordRef.id,
            txId: `${idemKey}_${l.itemId}_RECEIVING`
          });
        } catch (err) { ok = false; console.warn('[Giai đoạn 5] RECEIVING lỗi', l.itemId, err); }
      }
      if (l.damagedBase > 0) {
        try {
          await UnitEngine.ledger.apply({
            itemId: l.itemId, type: 'WASTE', qty: -l.damagedBase,
            // locationId '__SOURCE__' → trừ ở KHO TỔNG, không trừ quầy pha và không
            // làm nhiễu cơ chế cảnh báo refill của quầy (xem applyStockTransactionPOS).
            locationId: '__SOURCE__',
            note: `Hư hỏng khi nhận hàng${supplierNote}` + (l.note ? ` · ${l.note}` : ''),
            staff, staffEmployeeId: staffEmp.id, referenceId: recordRef.id,
            txId: `${idemKey}_${l.itemId}_WASTE`
          });
        } catch (err) { ok = false; console.warn('[Giai đoạn 5] WASTE (hư hỏng) lỗi', l.itemId, err); }
      }
      return { l, ok };
    }));
    const succeeded = lineOutcomes.filter(r => r.ok).map(r => r.l);
    const failedCount = lineOutcomes.length - succeeded.length;
    // [BUG#33 FIX] Ghi lại CHỮ KÝ SỐ LƯỢNG của những dòng đã thật sự vào ledger ở lượt này —
    // chốt chặn ở đầu hàm dựa vào đây để lượt bấm lại không được đổi số của dòng đã vào kho.
    poReceiveState.appliedLines = poReceiveState.appliedLines || {};
    lineOutcomes.forEach(r => {
      if (!r.ok) return;
      if (!(r.l.goodBase + r.l.damagedBase > 0)) return;   // dòng "sai sản phẩm" không ghi ledger
      if (!poReceiveState.appliedLines[r.l.itemId]) {
        poReceiveState.appliedLines[r.l.itemId] = { goodBase: r.l.goodBase, damagedBase: r.l.damagedBase };
      }
    });

    if (succeeded.length) {
      await poReceiveMergeRecord(recordRef, {
        poId: poReceiveState.poId || null,
        supplier: poReceiveState.supplier || '',
        newLines: succeeded.map(l => ({
          itemId: l.itemId, name: l.name, unit: l.unit,
          qtyExpectedBase: l.qtyExpectedBase != null ? l.qtyExpectedBase : null,
          qtyGoodBase: l.goodBase, qtyDamagedBase: l.damagedBase,
          receiveUnitName: l.receiveUnitName, receiveUnitFactor: l.unitFactor,
          qtyGoodReceived: Number(l.goodQty), qtyDamagedReceived: Number(l.damagedQty),
          wrongProduct: !!l.wrongProduct, note: l.note || '', status: 'completed'
        })),
        failedLines: lineOutcomes.filter(r => !r.ok).map(r => ({
          itemId: r.l.itemId, name: r.l.name, unit: r.l.unit,
          qtyGoodBase: r.l.goodBase, qtyDamagedBase: r.l.damagedBase,
          wrongProduct: !!r.l.wrongProduct, status: 'failed'
        })),
        staff, staffEmployeeId: staffEmp.id, note: generalNote, photoUrls,
        failedCount, totalLines: computed.length,
        businessDate: posDateKey(), nowISO: vnDate().toISOString()
      });
    }

    // [BUG#32 FIX] Lỗi cập nhật PO KHÔNG còn bị nuốt. Trước đây `.catch(console.warn)`: kho đúng,
    // phiếu nhận đúng, nhưng đơn đặt hàng vẫn đứng nguyên "chưa nhận"/số cũ — nhân viên thấy
    // "✅ Đã ghi nhận hàng" và không ai biết là đối chiếu đặt/nhận đã sai, không cảnh báo, không
    // có gì chạy lại (đúng cùng lỗ hổng với #25 bên Management). Nay: ghi cảnh báo durable cho
    // Quản lý + GIỮ NGUYÊN poReceiveState (idemKey cố định) và dừng lại ở form để nhân viên bấm
    // "Ghi nhận" lại — lượt sau ledger/phiếu tự no-op, chỉ bước PO thực sự chạy lại
    // (poReceiveUpdatePODoc idempotent theo appliedReceiveRecordIds nên không cộng đúp).
    let poSyncFailed = null;
    if (poReceiveState.poId && succeeded.length) {
      const deltas = {};
      succeeded.forEach(l => {
        // Cộng dồn theo itemId thay vì gán đè — phòng trường hợp có hai dòng cùng nguyên liệu
        // lọt qua được (xem chốt chặn ở đầu hàm, BUG#31).
        const d = deltas[l.itemId] || { good: 0, damaged: 0, wrongProduct: false };
        deltas[l.itemId] = { good: d.good + l.goodBase, damaged: d.damaged + l.damagedBase,
                             wrongProduct: d.wrongProduct || !!l.wrongProduct };
      });
      try {
        await poReceiveUpdatePODoc(poReceiveState.poId, deltas, idemKey);
      } catch (err) {
        poSyncFailed = err;
        console.error('[Giai đoạn 5] Cập nhật PO thất bại:', err);
        fstore.collection('alerts_gieogieo').doc('po_receive_sync_failed_' + idemKey).set({
          type: 'po_receive_sync_failed', severity: 'danger', status: 'new',
          title: 'Đã nhận hàng nhưng chưa cập nhật được đơn đặt hàng',
          note: `Phiếu nhận ${idemKey} (đơn ${poReceiveState.poId}): kho và phiếu nhận đã ghi đúng, nhưng số "đã nhận" trên đơn đặt hàng CHƯA được cập nhật (${(err && (err.message || err)) || 'lỗi không rõ'}). Nhân viên bấm "Ghi nhận" lại là hệ thống tự chạy nốt bước này (không cộng đúp); nếu không, đối soát tay trên tab Đặt hàng.`,
          poId: poReceiveState.poId, recordId: idemKey, at: vnDate().toISOString()
        }, { merge: true }).catch(() => {});
      }
    }

    // [NEW] Sinh mã + tem cho hàng có theo dõi theo đơn vị. Chạy SAU khi phiếu nhận đã ghi
    // xong: nhập hàng là việc chính, sinh tem là việc phụ — hỏng phần tem tuyệt đối không
    // được làm hỏng phiếu nhập đã vào sổ.
    //
    // Chỉ tính hàng LÀNH (goodBase) của những dòng đã ghi kho trọn vẹn. Hàng vỡ lúc nhận đã bị
    // ghi WASTE trừ đi ngay, dán tem cho nó là tạo ra những mã không bao giờ được mở, kẹt vĩnh
    // viễn ở "chờ dán".
    let containers = [];
    try {
      for (const l of succeeded) {
        if (!(l.goodBase > 0)) continue;
        const it = receiptItems.get(l.itemId);
        if (!it) continue;
        const made = await UnitEngine.lifecycle.createFromReceipt({
          item: it, qtyBase: l.goodBase, staff, staffEmployeeId: staffEmp.id, refId: recordRef.id,
          idPrefix: `${idemKey}_ctn_${l.itemId}`
        });
        containers = containers.concat(made);
      }
    } catch (err) {
      console.error('[tem kho] sinh mã sau nhận hàng lỗi', err);
      toast('⚠️ Đã nhận hàng nhưng sinh tem lỗi — vào Kho ▸ Tem chờ dán để sinh lại');
    }
    // [TEM = SỰ THẬT] RECEIVING cộng tạm currentStock trước khi có tem — sinh tem xong thì
    // chốt lại theo tổng mã (tem sinh thiếu thì tồn thiếu đúng phần đó, bấm Ghi nhận lại để
    // sinh nốt — idPrefix cố định nên không sinh trùng).
    for (const l of succeeded) {
      const it = receiptItems.get(l.itemId);
      if (UnitEngine.classify.isTemTracked(it)) await UnitEngine.stock.recompute(l.itemId, STOCK_CONTAINERS_COLL).catch(() => {});
    }
    // [MỚI — đóng vòng "phiếu nhận ↔ tem"] Tem đã có receiveRefId trỏ NGƯỢC về phiếu nhận, nhưng
    // chiều XUÔI (từ phiếu nhận xem được đã sinh những tem nào) trước giờ không có — phải quét
    // toàn bộ container theo receiveRefId mới ra được danh sách. Lưu thẳng containerIds lên chính
    // phiếu nhận, arrayUnion để bấm "Ghi nhận" lại (idemKey cố định, xem BUG#31/33 ở trên) chỉ
    // cộng thêm tem của phần vừa sinh mới, không ghi đè danh sách cũ. Best-effort — tem là việc
    // phụ, lỗi ở đây không được lùi phiếu nhận đã ghi xong.
    if (containers.length) {
      recordRef.update({ containerIds: firebase.firestore.FieldValue.arrayUnion(...containers.map(c => c.id)) })
        .catch(err => console.warn('[tem kho] ghi containerIds lên phiếu nhận lỗi', err));
    }

    if (poSyncFailed) {
      // [BUG#32 FIX] Giữ nguyên state để bấm lại chạy nốt bước PO — xem chú thích ở trên.
      toast('⚠️ Đã ghi kho + phiếu nhận nhưng CHƯA cập nhật được đơn đặt hàng — bấm "Ghi nhận" lại để chạy nốt (không cộng đúp)');
      renderPoReceiveForm();
      return;
    }

    if (failedCount > 0) {
      // KHÔNG xoá poReceiveState/idemKey — giữ nguyên để nhân viên bấm "Ghi nhận" lại đúng chỗ
      // vừa lỗi. Dòng đã ghi trọn vẹn ở lượt này sẽ tự no-op ở lượt sau (txId/idPrefix cố định),
      // không ghi đúp; chỉ dòng lỗi mới thực sự chạy lại.
      toast(`⚠️ Đã ghi ${succeeded.length}/${computed.length} dòng — bấm "Ghi nhận" lại để thử lại ${failedCount} dòng còn lỗi`);
      renderPoReceiveForm();
      return;
    }

    toast('✅ Đã ghi nhận hàng');
    // Có tem cần dán thì đưa thẳng sang màn in, đừng bắt nhân viên tự nhớ vào tìm.
    if (containers.length) {
      _stockLabelQueue = containers;
      openStockLabelScreen();
      poReceiveState = { poId: null, supplier: '', lines: [], photoFiles: [], idemKey: null };
      KHO_ITEMS_CACHE = [];
      return;
    }
    poReceiveState = { poId: null, supplier: '', lines: [], photoFiles: [], idemKey: null };
    KHO_ITEMS_CACHE = [];
    showScreen('khoScreen');
    loadKhoScreen();
  } catch (err) {
    console.error('submitPoReceive failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

PosGieoMods.receive = true;
