// Tách từ posgieo.html dòng 9248–10364 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_orders.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).orders = 'dang';

// ══════════════════════════════════════════════════════════════════════════
// [NEW] BỔ SUNG TOPPING SAU KHI ĐÃ BẤM BILL
//
// Tình huống thật: khách chốt đơn, bấm bill xong rồi mới đổi ý muốn thêm topping cho
// MỘT ly nào đó. Trước đây không có đường nào ngoài việc bấm một bill mới chỉ chứa
// topping 3–5K — mà làm vậy hỏng cùng lúc bốn chỉ số, vì aggregateOrders() bên Quản lý
// chạy `bills++`, `items += qty`, cờ hasTopping và computeBaggingCostForOrder() cho MỌI
// đơn: AOV tụt (quán 40 bill × 30K, thêm 5 bill 4K là AOV rơi từ 30.000 xuống 27.111),
// IPT tụt, attach rate thổi giả, và COGS gánh thêm một bộ túi khống cho mỗi bill phụ.
//
// Cách làm ở đây: KHÔNG tạo đơn mới, mà bổ sung thẳng vào đơn gốc. Về mặt ý nghĩa cũng
// đúng hơn — AOV là chi tiêu trung bình mỗi LƯỢT KHÁCH, khách quay lại thêm topping vẫn
// là một lượt. Nhờ topping nằm trong `itemsArray[i].toppings` như mọi topping khác nên
// toàn bộ hạ tầng phía sau tự chạy đúng, không phải sửa: doanh thu topping, margin nhóm
// topping, trừ kho theo GOGS, và hoàn kho khi xoá đơn (reverseSalesConsumptionPOS tính
// lại từ chính itemsArray).
//
// Ràng buộc vận hành (theo yêu cầu):
//   · Chỉ trong ADDON_WINDOW_MIN phút kể từ lúc bấm bill.
//   · CHỈ THÊM, không sửa/xoá topping cũ.
//   · Bắt mã PIN nhân viên.
//   · Không in lại bill gốc — in một PHIẾU BỔ SUNG và một TEM BỔ SUNG.
//   · Phần thêm có phương thức thanh toán riêng, có khách đưa / thối lại riêng.
// ══════════════════════════════════════════════════════════════════════════
const ADDON_WINDOW_MIN = 10;

// Đơn còn được bổ sung không? Trả về { ok, minsLeft, why }.
function orderAddonInfo(o) {
  if (!o) return { ok: false, minsLeft: 0, why: 'Không tìm thấy đơn' };
  if (!o.createdAt) return { ok: false, minsLeft: 0, why: 'Đơn cũ không có mốc thời gian' };
  const ms = Date.now() - vnDate(o.createdAt).getTime();
  const minsLeft = Math.ceil((ADDON_WINDOW_MIN * 60000 - ms) / 60000);
  if (ms < 0) return { ok: false, minsLeft: 0, why: 'Mốc thời gian đơn không hợp lệ' };
  if (minsLeft <= 0) return { ok: false, minsLeft: 0, why: `Quá ${ADDON_WINDOW_MIN} phút — không bổ sung được nữa` };
  // Đơn của ngày khác: bill sát nửa đêm rồi bổ sung sang ngày mới sẽ làm doanh thu của
  // một ngày đã chốt tự đổi. Chặn hẳn, hiếm gặp nên không đáng phải xử lý phức tạp hơn.
  if (o.date !== posDateKeyToDisplay(posDateKey())) return { ok: false, minsLeft: 0, why: 'Đơn thuộc ngày khác — không bổ sung được' };
  if (_deletingOrderIds.has(o.id)) return { ok: false, minsLeft: 0, why: 'Đơn đang được xoá' };
  if (o.deletionPending) return { ok: false, minsLeft: 0, why: 'Đơn đang xoá dở (đã hoàn kho một phần) — bấm xoá lại để hoàn tất, không bổ sung được' };
  if (o.method === 'TÍNH RIÊNG') return { ok: false, minsLeft: 0, why: 'Đơn Tính riêng chưa hỗ trợ bổ sung' };
  return { ok: true, minsLeft, why: '' };
}

let _addonState = null;

async function openAddonSheet(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { toast('⚠️ Không tìm thấy đơn'); return; }
  const info = orderAddonInfo(o);
  if (!info.ok) { toast('⚠️ ' + info.why); return; }
  if (!TOPPINGS.length) { toast('⚠️ Chưa có topping nào trong menu'); return; }
  // Ngày đã đóng thì mọi con số đã được đối soát — không cho phát sinh doanh thu thêm.
  try {
    const doc = await fstore.collection('daily_closings_gieogieo').doc(posDateKey()).get();
    if (doc.exists && doc.data().status === 'closed') {
      toast('⚠️ Ngày đã đóng — không bổ sung được, nhờ Quản lý xử lý');
      return;
    }
  } catch (err) { console.warn('[addon] không đọc được trạng thái đóng ngày, cho đi tiếp:', err); }

  _addonState = { orderId, step: 'cup', itemIdx: null, unitIdx: 0, seq: 0, totalCups: 0,
                  toppings: [], method: 'TIỀN MẶT', cashGiven: 0 };
  _addonRender();
}

function closeAddonSheet() {
  const ov = document.getElementById('addon-overlay');
  if (ov) ov.remove();
  _addonState = null;
}

function _addonOrder() {
  return _addonState ? orders.find(x => x.id === _addonState.orderId) : null;
}

function _addonAmount() {
  return _addonState ? tpSum(_addonState.toppings) : 0;
}

function _addonRender() {
  const st = _addonState;
  const o = _addonOrder();
  if (!st || !o) { closeAddonSheet(); return; }
  let ov = document.getElementById('addon-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'addon-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
    ov.onclick = e => { if (e.target === ov) closeAddonSheet(); };
    document.body.appendChild(ov);
  }
  const info = orderAddonInfo(o);
  const head = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div style="font-size:17px;font-weight:700;color:var(--td);">Thêm topping</div>
      <span style="font-size:11.5px;font-weight:700;color:#b45309;background:#fef3c7;border-radius:8px;padding:3px 9px;">còn ${Math.max(0, info.minsLeft)} phút</span>
    </div>
    <div style="font-size:12px;font-weight:600;color:var(--gt);margin-bottom:14px;">${o.billCode || ''} · chỉ THÊM, không xoá được topping đã có</div>`;

  let body = '';
  if (st.step === 'cup') body = _addonRenderCupStep(o);
  else if (st.step === 'topping') body = _addonRenderToppingStep(o);
  else body = _addonRenderPayStep(o);

  ov.innerHTML = `
    <div style="background:#FFFCF0;border-radius:26px;padding:22px 20px;width:100%;max-width:430px;max-height:86vh;overflow-y:auto;animation:pi .2s ease;">
      ${head}${body}
    </div>`;
}

// ── Bước 1: chọn ĐÚNG LY ────────────────────────────────────────────────
function _addonRenderCupStep(o) {
  const items = o.itemsArray || o.items || [];
  const rows = items.map((it, idx) => {
    const qty = Math.max(1, Number(it.qty) || 1);
    const { start, total } = _temCupInfoForItem(o, idx);
    const nameLine = `${it.name}${it.size && it.size !== '-' ? ' (' + it.size + ')' : ''}`;
    const tpNow = (it.toppings || []).length
      ? `<div style="font-size:11px;color:#b45309;margin-top:2px;">đang có: ${(it.toppings || []).map(t => tpLabel(t)).join(', ')}</div>` : '';
    return Array.from({ length: qty }, (_, u) => `
      <div onclick="_addonPickCup(${idx},${u})" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eee;cursor:pointer;">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:700;color:var(--td);">${nameLine}</div>
          <div style="font-size:11.5px;color:var(--gt);">Ly ${start + u}/${total}</div>
          ${u === 0 ? tpNow : ''}
        </div>
        <span style="font-size:12.5px;font-weight:700;color:var(--gd);white-space:nowrap;">Chọn ›</span>
      </div>`).join('');
  }).join('');
  return `
    <div style="font-size:12.5px;font-weight:700;color:var(--td);margin-bottom:6px;">Thêm cho ly nào?</div>
    <div>${rows}</div>
    <button onclick="closeAddonSheet()" style="width:100%;margin-top:14px;padding:13px;background:#fff;color:#666;border:1.5px solid #ddd;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Huỷ</button>`;
}

function _addonPickCup(itemIdx, unitIdx) {
  const st = _addonState, o = _addonOrder();
  if (!st || !o) return;
  const { start, total } = _temCupInfoForItem(o, itemIdx);
  st.itemIdx = itemIdx;
  st.unitIdx = unitIdx;
  st.seq = start + unitIdx;      // số thứ tự ly GỐC — giữ nguyên để tem bổ sung khớp tem đã dán
  st.totalCups = total;
  st.step = 'topping';
  _addonRender();
}

// ── Bước 2: chọn topping ────────────────────────────────────────────────
function _addonRenderToppingStep(o) {
  const st = _addonState;
  const items = o.itemsArray || o.items || [];
  const it = items[st.itemIdx] || {};
  const list = TOPPINGS.map(t => {
    const price = o.isToGo ? t.priceTogo : t.price;   // theo đúng kiểu giá của đơn gốc
    const cur = st.toppings.find(x => x.id === t.id);
    const q = cur ? tpQty(cur) : 0;
    return `<div ${q ? '' : `onclick="_addonSetToppingQty('${t.id}',1)"`} style="background:${q ? 'var(--gl)' : '#fff'};border-radius:16px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;${q ? '' : 'cursor:pointer;'}border:2px solid ${q ? 'var(--gm)' : '#f0f0f0'};">
      <div style="min-width:0;flex:1;">
        <div style="font-size:15px;font-weight:700;color:var(--td);">${t.name}</div>
        <div style="font-size:12.5px;font-weight:700;color:var(--gm);margin-top:2px;">+${fmt(price)}${q > 1 ? ` × ${q} = ${fmt(price * q)}` : ''}</div>
      </div>
      ${q ? `
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" onclick="event.stopPropagation()">
        <button onclick="event.stopPropagation(); _addonSetToppingQty('${t.id}',${q - 1})" style="width:40px;height:40px;border-radius:11px;border:1.5px solid var(--gm);background:#fff;color:var(--gm);font-size:19px;font-weight:700;cursor:pointer;line-height:1;">−</button>
        <span style="min-width:24px;text-align:center;font-size:16px;font-weight:800;color:var(--td);">${q}</span>
        <button onclick="event.stopPropagation(); _addonSetToppingQty('${t.id}',${q + 1})" style="width:40px;height:40px;border-radius:11px;border:none;background:var(--gd);color:#fff;font-size:19px;font-weight:700;cursor:pointer;line-height:1;">+</button>
      </div>` : `<span style="font-size:12.5px;font-weight:700;color:#bbb;flex-shrink:0;">Chạm để thêm</span>`}
    </div>`;
  }).join('');
  const amt = _addonAmount();
  return `
    <div style="background:#fff;border-radius:14px;padding:10px 12px;margin-bottom:12px;">
      <div style="font-size:12px;color:var(--gt);font-weight:600;">Đang thêm cho</div>
      <div style="font-size:14px;font-weight:700;color:var(--td);">${it.name || ''}${it.size && it.size !== '-' ? ' (' + it.size + ')' : ''} · ly ${st.seq}/${st.totalCups}</div>
    </div>
    ${list}
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 2px 12px;">
      <span style="font-size:13px;font-weight:700;color:var(--gt);">Cộng thêm</span>
      <span style="font-size:22px;font-weight:800;color:var(--gd);">${fmt(amt)}</span>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="_addonState.step='cup'; _addonRender();" style="flex:1;padding:13px;background:#fff;color:#666;border:1.5px solid #ddd;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">‹ Đổi ly</button>
      <button onclick="_addonGoPay()" style="flex:1.4;padding:13px;background:${amt > 0 ? 'var(--gd)' : '#ddd'};color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:${amt > 0 ? 'pointer' : 'default'};">Thanh toán ›</button>
    </div>`;
}

function _addonSetToppingQty(toppingId, qty) {
  const st = _addonState, o = _addonOrder();
  if (!st || !o) return;
  const t = TOPPINGS.find(x => x.id === toppingId);
  if (!t) return;
  const price = o.isToGo ? t.priceTogo : t.price;
  const q = Math.max(0, Math.min(99, Number(qty) || 0));
  const idx = st.toppings.findIndex(x => x.id === toppingId);
  if (q === 0) { if (idx >= 0) st.toppings.splice(idx, 1); }
  else if (idx >= 0) { st.toppings[idx].qty = q; st.toppings[idx].price = price; }
  else st.toppings.push({ id: t.id, name: t.name, price, qty: q });
  _addonRender();
}

function _addonGoPay() {
  const st = _addonState;
  if (!st) return;
  if (_addonAmount() <= 0) { toast('⚠️ Chưa chọn topping nào'); return; }
  st.cashGiven = _addonAmount();
  st.step = 'pay';
  _addonRender();
}

// ── Bước 3: thanh toán phần thêm + PIN ──────────────────────────────────
function _addonRenderPayStep(o) {
  const st = _addonState;
  const amt = _addonAmount();
  const isCash = st.method === 'TIỀN MẶT';
  const change = Math.max(0, (Number(st.cashGiven) || 0) - amt);
  const mBtn = (label, val) => `<button onclick="_addonSetMethod('${val}')" style="flex:1;padding:13px 6px;border-radius:13px;border:1.5px solid ${st.method === val ? 'var(--gd)' : '#e6e1d2'};background:${st.method === val ? '#FDE6EA' : '#fff'};color:${st.method === val ? 'var(--gd)' : '#888'};font-family:'Google Sans',sans-serif;font-weight:700;font-size:13px;cursor:pointer;">${label}</button>`;
  const cashChip = v => `<button onclick="_addonSetCash(${v})" style="flex:1;padding:10px 4px;border-radius:11px;border:1.5px solid #e6e1d2;background:#fff;color:#666;font-family:'Google Sans',sans-serif;font-weight:700;font-size:12.5px;cursor:pointer;">${fmt(v)}</button>`;
  return `
    <div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;text-align:center;">
      <div style="font-size:11.5px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.5px;">Tiền thêm</div>
      <div style="font-size:38px;font-weight:800;color:var(--gd);line-height:1.15;">${fmt(amt)}</div>
      <div style="font-size:12px;color:var(--gt);margin-top:2px;">${st.toppings.map(t => tpLabel(t)).join(', ')} · ly ${st.seq}/${st.totalCups}</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;">${mBtn('💵 Tiền mặt', 'TIỀN MẶT')}${mBtn('🏦 Chuyển khoản', 'CHUYỂN KHOẢN')}</div>
    ${isCash ? `
    <div style="background:#fff;border-radius:16px;padding:14px;margin-bottom:12px;">
      <div style="font-size:11.5px;font-weight:700;color:var(--gt);text-transform:uppercase;margin-bottom:8px;">Khách đưa</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">${cashChip(amt)}${cashChip(10000)}${cashChip(20000)}${cashChip(50000)}</div>
      <input id="addon-cash" type="text" inputmode="numeric" value="${st.cashGiven || ''}" oninput="_addonSetCash(this.value)" style="width:100%;padding:12px;border:1.5px solid #e6e1d2;border-radius:12px;font-family:'Google Sans',sans-serif;font-size:17px;font-weight:700;color:var(--td);text-align:right;outline:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <span style="font-size:12.5px;font-weight:700;color:var(--gt);">Thối lại</span>
        <span style="font-size:19px;font-weight:800;color:${change > 0 ? 'var(--gm)' : 'var(--td)'};">${fmt(change)}</span>
      </div>
    </div>` : ''}
    <div style="background:#fff;border-radius:16px;padding:14px;margin-bottom:12px;">${renderPinInput('addonStaff')}</div>
    <div style="display:flex;gap:8px;">
      <button onclick="_addonState.step='topping'; _addonRender();" style="flex:1;padding:13px;background:#fff;color:#666;border:1.5px solid #ddd;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">‹ Quay lại</button>
      <button id="addonSubmitBtn" onclick="submitAddon()" style="flex:1.4;padding:13px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Xác nhận thêm</button>
    </div>`;
}

function _addonSetMethod(m) {
  if (!_addonState) return;
  _addonState.method = m;
  if (m === 'TIỀN MẶT' && !_addonState.cashGiven) _addonState.cashGiven = _addonAmount();
  _addonRender();
}

function _addonSetCash(v) {
  if (!_addonState) return;
  _addonState.cashGiven = Math.max(0, Number(String(v).replace(/[^\d]/g, '')) || 0);
  // Không render lại toàn bộ khi đang gõ — chỉ cập nhật số thối, để không mất con trỏ.
  const amt = _addonAmount();
  const change = Math.max(0, _addonState.cashGiven - amt);
  const ov = document.getElementById('addon-overlay');
  const el = ov && ov.querySelector('#addon-cash');
  if (el && document.activeElement === el) {
    const box = el.parentElement.querySelector('span:last-child');
    if (box) { box.textContent = fmt(change); box.style.color = change > 0 ? 'var(--gm)' : 'var(--td)'; }
    return;
  }
  _addonRender();
}

// ── Ghi dữ liệu ─────────────────────────────────────────────────────────
// Trả về itemsArray MỚI + vị trí ly đích. Ly có qty>1 phải TÁCH DÒNG: topping tính theo
// đơn giá mỗi ly (toppingSum × qty) nên không thể gắn topping cho riêng 1 ly trong dòng
// gộp mà không tách ra, nếu không cả 3 ly đều bị tính tiền topping.
// [Sửa lỗi 7] Tách ĐÚNG ly đã chọn (unitIdx = ly thứ k trong dòng, tính từ 0): [k ly trước][ly đích][các ly sau]
// — số thứ tự ly (seq) trên tem bổ sung khớp tem đã dán. Trước đây luôn tách ly CUỐI của dòng.
function _addonApplyToItems(o, itemIdx, newToppings, atISO, unitIdx) {
  const src = o.itemsArray || o.items || [];
  const items = src.map(it => ({ ...it, toppings: (it.toppings || []).map(t => ({ ...t })) }));
  const line = items[itemIdx];
  const qty = Math.max(1, Number(line.qty) || 1);
  let targetIdx = itemIdx;
  if (qty > 1) {
    const k = Math.min(qty - 1, Math.max(0, Math.floor(Number(unitIdx) || 0)));
    const copy = n => ({ ...line, qty: n, toppings: (line.toppings || []).map(t => ({ ...t })) });
    const parts = [];
    if (k > 0) parts.push(copy(k));
    parts.push(copy(1));
    if (qty - k - 1 > 0) parts.push(copy(qty - k - 1));
    items.splice(itemIdx, 1, ...parts);
    targetIdx = itemIdx + (k > 0 ? 1 : 0);
  }
  const target = items[targetIdx];
  if (!target.toppings) target.toppings = [];
  // Cố ý ghi thành dòng RIÊNG kể cả khi trùng tên topping đã có — để chi tiết đơn hiện
  // tách bạch "topping mua lúc đầu" và "topping mua thêm sau", đúng yêu cầu phân biệt màu.
  newToppings.forEach(nt => target.toppings.push({ ...nt, addon: true, addonAt: atISO }));
  target.toppingSum = tpSum(target.toppings);
  return { items, targetIdx };
}

// [Sửa lỗi 5] Đơn trên máy chủ còn đúng như lúc máy này mở không (tổng, số lần bổ sung, các dòng món).
function _addonSameOrderState(cur, o) {
  const sig = arr => JSON.stringify((Array.isArray(arr) ? arr : Object.values(arr || {}))
    .map(x => [x && x.name, x && x.size, Number(x && x.qty) || 0, ((x && x.toppings) ? Object.keys(x.toppings).length : 0)]));
  const len = a => (Array.isArray(a) ? a.length : Object.keys(a || {}).length);
  return Number(cur.total) === Number(o.total) && len(cur.addons) === len(o.addons)
    && sig(cur.itemsArray) === sig(o.itemsArray || o.items);
}

async function submitAddon() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  const restore = setBtnBusy('addonSubmitBtn', '⏳ Đang lưu...');
  try { await _submitAddonImpl(); } finally { _posSubmitBusy = false; restore(); }
}

async function _submitAddonImpl() {
  const st = _addonState;
  if (!st) return;
  const o = _addonOrder();
  if (!o) { toast('⚠️ Không tìm thấy đơn'); return; }
  const info = orderAddonInfo(o);
  if (!info.ok) { toast('⚠️ ' + info.why); closeAddonSheet(); return; }
  const amount = _addonAmount();
  if (amount <= 0) { toast('⚠️ Chưa chọn topping nào'); return; }
  const isCash = st.method === 'TIỀN MẶT';
  const cashGiven = isCash ? Math.max(amount, Number(st.cashGiven) || 0) : amount;
  const cashChange = isCash ? cashGiven - amount : 0;
  const staffEmp = await resolveStaffPinAndCheckin('addonStaff');
  if (!staffEmp) return;

  const items = o.itemsArray || o.items || [];
  const it = items[st.itemIdx] || {};
  if (!(await posConfirm(
    `Thêm ${st.toppings.map(t => tpLabel(t)).join(', ')}\ncho ly ${st.seq}/${st.totalCups} — ${it.name || ''}\n\nThu thêm ${fmt(amount)} (${st.method})`,
    { okText: 'Xác nhận', cancelText: 'Huỷ' }))) return;

  const atISO = vnDate().toISOString();
  const addonId = o.id + '_edit_' + Date.now().toString(36);        // mã thao tác cố định của lần bổ sung này — dùng cho việc trừ kho bền
  const before = { ...o, itemsArray: (o.itemsArray || o.items || []) };
  const { items: newItems } = _addonApplyToItems(o, st.itemIdx, st.toppings, atISO, st.unitIdx);
  const newTotal = (Number(o.total) || 0) + amount;
  const addon = {
    at: atISO, staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
    itemName: it.name || '', itemSize: it.size || '', seq: st.seq, totalCups: st.totalCups,
    toppings: st.toppings.map(t => ({ ...t })),
    amount, method: st.method, cashGiven, cashChange
  };
  const addons = (o.addons || []).concat([addon]);

  // Đường dẫn RTDB dựng từ o.date (DD/MM/YYYY) — cùng cách delOrderConfirm() đang dùng.
  const [dd, mm, yyyy] = String(o.date).split('/');
  const rtPath = 'orders_gieogieo/' + MONTH_KEYS[parseInt(mm, 10) - 1] + '/' + dd + '/' + o.id;
  const itemsSummary = newItems.map(c => `${c.name}(${c.size})x${c.qty}`).join(', ');

  // [Sửa lỗi 5] Ghi bằng transaction + so trạng thái đơn lúc mở: máy khác vừa sửa đơn (thêm topping,
  // đổi tổng / dòng món) → HUỶ, không ghi đè mất phần của máy kia. Kho chỉ trừ sau khi ghi đơn thành công.
  let conflict = false, gone = false, deleting = false;
  try {
    const kq = await db.ref(rtPath).transaction(cur => {
      if (cur === null) return cur;   // chưa có bản cục bộ — trả null để máy chủ gửi bản thật rồi chạy lại
      // [v13] Bill đang xoá dở (cờ BỀN trên chính node bill, do máy khác ghi) → KHÔNG ghi thêm: kiểm ngay trong transaction vì bản trong RAM có thể cũ.
      if (cur.deletionPending) { deleting = true; return; }
      deleting = false;
      if (!_addonSameOrderState(cur, o)) { conflict = true; return; }   // undefined = huỷ transaction
      conflict = false;
      // [v14] Ghi VIỆC TRỪ KHO bền cùng transaction nhận topping: bill đang xoá / máy khác xoá bill sẽ thấy việc này (chờ nếu đang chạy, huỷ nếu chưa bắt đầu).
      return { ...cur, itemsArray: newItems, items: itemsSummary, total: newTotal, addons, consumeJobs: { ...(cur.consumeJobs || {}), [addonId]: { status: 'pending', at: Date.now() } } };
    });
    const val = kq && kq.snapshot && kq.snapshot.val();
    if (!val) gone = true;
    else if (!kq.committed) {
      // Cập nhật RAM theo bản trên máy chủ để mở lại đơn thấy đúng (listener child_added không báo lần sửa).
      o.itemsArray = val.itemsArray || []; o.items = o.itemsArray; o.total = val.total; o.addons = val.addons || [];
    }
  } catch (err) {
    console.error('submitAddon: ghi Firebase lỗi', err);
    toast('❌ Không lưu được: ' + (err.code || err.message || err));
    return;
  }
  if (gone) { toast('⚠️ Đơn không còn trên hệ thống (có thể vừa bị xoá) — chưa thêm gì'); closeAddonSheet(); return; }
  if (deleting) { o.deletionPending = true; toast('⚠️ Đơn đang xoá dở (đã hoàn kho một phần) — không bổ sung được. Chưa thu tiền, chưa trừ kho.'); closeAddonSheet(); return; }
  if (conflict) { toast('⚠️ Đơn vừa được sửa ở máy khác — mở lại đơn rồi thêm lại. Chưa thu tiền, chưa trừ kho.'); closeAddonSheet(); showDet(o.id); return; }

  // Cập nhật RAM. Listener child_added không bắn cho lần sửa này nên phải tự đồng bộ;
  // `items` trong RAM là MẢNG (xem _attachRtListener), khác `items` chuỗi dưới RTDB.
  o.itemsArray = newItems;
  o.items = newItems;
  o.total = newTotal;
  o.addons = addons;

  closeAddonSheet();
  toast(`✅ Đã thêm ${fmt(amount)} vào ${o.billCode || 'đơn'}`);
  showDet(o.id);

  // Trừ kho phần thêm — không chặn luồng, lỗi chỉ ghi log như applySalesConsumptionPOS.
  trackConsumptionPOS(o.id, applyAddonConsumptionPOS(before, { ...o, itemsArray: newItems }, o.id,
    'Bổ sung topping' + (o.billCode ? ' — ' + o.billCode : ''), addonId));

  // In phiếu bổ sung + tem bổ sung. Không in lại bill gốc.
  printAddonReceipt(o, addon);
  printAddonLabel(o, addon);
}

// ── Trừ kho phần thêm ───────────────────────────────────────────────────
// Tính CHÊNH LỆCH tiêu hao giữa đơn trước và sau khi thêm, thay vì tính riêng phần
// topping mới. Lý do: thêm topping vào một ly vốn CHƯA có topping còn làm ĐỔI CẢ BAO BÌ
// của ly đó (resolvePackagingItemsForLinePOS nhận tham số hasTopping — ly có topping có
// thể dùng cỡ ly/nắp khác). Lấy hiệu số thì mọi thay đổi kiểu đó tự được tính đúng, và
// dùng chung đúng một đường tính với lúc bán nên không bao giờ lệch nhau.
// [v14] Việc trừ kho của một lần bổ sung đi qua "thuê" trên node bill (RT): chỉ chạy khi bill CHƯA bị khoá xoá và việc chưa bị huỷ; xoá bill ở máy khác chờ việc đang chạy
// hoặc huỷ việc chưa bắt đầu — nên phần trừ topping không thể đến sau khi bill đã bị hoàn kho và xoá.
const ADDON_JOB_STALE_MS = 120000;

function _orderRtPathPOS(o) {
  const [dd, mm] = String(o.date).split('/');
  return 'orders_gieogieo/' + MONTH_KEYS[parseInt(mm, 10) - 1] + '/' + dd + '/' + o.id;
}

// Trạng thái việc: pending → running(owner) → done | failed(failedLines) ; cancelled (bill bị xoá). Hợp đồng: `done`/`cancelled` KHÔNG chạy lại; `running` còn hạn thuộc owner khác thì từ chối;
// quá hạn thì máy khác tiếp quản (owner mới) — worker cũ nếu còn sống vẫn bị chặn ở bước ghi sổ bởi dấu huỷ bill (engine) và mọi khoản trừ có txId cố định (chạy lại không trừ đôi).
// Kế hoạch trừ kho (plan) được lưu bền trên việc nên chạy lại dùng ĐÚNG khoản đã tính, không tính lại theo công thức có thể đã đổi.
// Trả { st: 'ok'|'busy'|'done'|'cancelled'|'gone', owner, plan }.
async function _addonJobStartPOS(o, addonId) {
  const owner = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  let verdict = null, plan = null;
  const kq = await db.ref(_orderRtPathPOS(o)).transaction(cur => {
    if (cur === null) return cur;
    verdict = null; plan = null;
    const jobs = { ...(cur.consumeJobs || {}) }, j = jobs[addonId];
    if (cur.deletionPending || (j && j.status === 'cancelled')) { verdict = 'cancelled'; return; }
    if (j && j.status === 'done') { verdict = 'done'; return; }
    if (j && j.status === 'running' && Date.now() - (Number(j.startedAt) || 0) < ADDON_JOB_STALE_MS) { verdict = 'busy'; return; }
    plan = j && j.plan ? j.plan : null;
    jobs[addonId] = { ...(j || {}), status: 'running', owner, startedAt: Date.now(), tries: (Number(j && j.tries) || 0) + 1 };
    return { ...cur, consumeJobs: jobs };
  });
  if (!(kq && kq.snapshot && kq.snapshot.val())) return { st: 'gone' };
  if (kq.committed) return { st: 'ok', owner, plan };
  return { st: verdict || 'busy' };
}

// Ghi vào việc CHỈ khi vẫn là owner (worker cũ bị tiếp quản không ghi đè trạng thái của worker mới).
async function _addonJobUpdatePOS(o, addonId, owner, patch) {
  let mine = false;
  await db.ref(_orderRtPathPOS(o)).transaction(cur => {
    mine = false;
    const j = cur && cur.consumeJobs && cur.consumeJobs[addonId];
    if (!j || j.owner !== owner || j.status === 'cancelled') return cur;
    mine = true;
    return { ...cur, consumeJobs: { ...cur.consumeJobs, [addonId]: { ...j, ...patch } } };
  });
  return mine;
}

async function applyAddonConsumptionPOS(orderBefore, orderAfter, orderId, note, addonId) {
  if (!addonId) return _applyAddonConsumptionCorePOS(orderBefore, orderAfter, orderId, note);
  let got;
  try { got = await _addonJobStartPOS(orderAfter, addonId); }
  catch (err) {
    console.warn('[addon] không giành được việc trừ kho (lỗi kết nối)', err);
    _ueWarnGogsConsumptionFailed(orderId, orderAfter, [{ id: 'toàn bộ phần thêm topping', isPrep: false, reason: 'không giành được việc trừ kho: ' + String((err && err.message) || err || '') }]).catch(() => {});
    toastAutoReport('⚠️ Thêm topping: chưa trừ kho được — đã báo Quản lý', 'Thêm topping: trừ kho lỗi', { ref: orderId });
    return;
  }
  if (got.st !== 'ok') { console.info('[addon] không chạy việc trừ kho:', got.st, orderId); return; }
  const ctx = { plan: got.plan, savePlan: plan => _addonJobUpdatePOS(orderAfter, addonId, got.owner, { plan }) };
  let res;
  try { res = await _applyAddonConsumptionCorePOS(orderBefore, orderAfter, orderId, note, addonId, ctx); }
  catch (err) { res = { ok: false, failedLines: [{ id: '*', isPrep: false, reason: String((err && err.message) || err || '') }] }; }
  // Lỗi → trạng thái `failed` kèm dòng lỗi (KHÔNG đóng `done`): chạy lại sẽ dùng đúng plan đã lưu.
  await _addonJobUpdatePOS(orderAfter, addonId, got.owner, res && res.ok ? { status: 'done', doneAt: Date.now() } : { status: 'failed', failedLines: (res && res.failedLines) || [], failedAt: Date.now() })
    .catch(err => console.warn('[addon] không ghi được trạng thái việc trừ kho', err));
}

async function _applyAddonConsumptionCorePOS(orderBefore, orderAfter, orderId, note, editKeyIn, jobCtx) {
  // Khoá riêng của lần sửa này — dòng hoàn phần bớt không trùng id với lượt xoá cả đơn sau này.
  const editKey = editKeyIn || (orderId + '_edit_' + Date.now().toString(36));
  try {
    const jobs = [];
    const diffOf = (mapA, mapB) => {
      const out = {};
      new Set([...Object.keys(mapA || {}), ...Object.keys(mapB || {})]).forEach(k => {
        const d = (Number(mapB[k]) || 0) - (Number(mapA[k]) || 0);
        if (Math.abs(d) > 1e-9) out[k] = d;
      });
      return out;
    };
    let dIng, dPrep;
    if (jobCtx && jobCtx.plan) { dIng = jobCtx.plan.dIng || {}; dPrep = jobCtx.plan.dPrep || {}; }      // chạy lại: dùng ĐÚNG kế hoạch đã lưu, không tính lại theo công thức
    else {
      const [recipes, toppingRecipes, packagingPresets, packagingItemOverrides, baggingRules, pkgRulesPack, baggingTable] =
        await Promise.all([ensureRecipesLoadedPOS(), ensureToppingRecipesLoadedPOS(), ensurePackagingPresetsLoadedPOS(), ensurePackagingItemOverridesLoadedPOS(), ensurePackagingBaggingRulesLoadedPOS(), ensurePackagingRulesLoadedPOS(), ensurePackagingBaggingTableLoadedPOS()]);
      const calc = ord => computeConsumptionForOrder(ord, recipes, toppingRecipes, packagingPresets, packagingItemOverrides, baggingRules, pkgRulesPack.rules, pkgRulesPack.config, baggingTable);
      const a = calc(orderBefore), b = calc(orderAfter);
      dIng = diffOf(a.agg, b.agg); dPrep = diffOf(a.prepAgg, b.prepAgg);
      if (jobCtx && !(await jobCtx.savePlan({ dIng, dPrep }))) return { ok: false, failedLines: [{ id: '*', isPrep: false, reason: 'mất quyền xử lý việc (đã bị tiếp quản/huỷ)' }] };
    }
    // [BUG "Add-on giảm không hoàn Unit" — FIX] Chiều GIẢM là hiệu số của 2 lần tính cả đơn,
    // không trỏ thẳng về đúng 1 giao dịch gốc — nhưng KHÔNG có allocations nào để hoàn nghĩa
    // là Unit không được cộng lại trong khi currentStock (qua nhánh cộng thẳng của
    // _reverseIngredientConsumptionPOS) vẫn tăng đúng, để lại đúng khoảng lệch mà toàn bộ
    // Unit Engine sinh ra để triệt tiêu. Đọc lại breakdown gốc của ĐƠN này (đã lưu trên các
    // giao dịch CONSUMPTION gốc, dùng chung hạ tầng với reverseSalesConsumptionPOS) rồi chia
    // theo TỶ LỆ đúng bằng phần giảm/tổng gốc — không biết chính xác giảm ở cup/dòng nào nên
    // chia đều theo tỷ trọng đã dùng ban đầu là xấp xỉ hợp lý nhất có thể, còn hơn bỏ trắng.
    const { fifoMap: origFifoMap } = await _loadLocDeductedForOrderPOS(orderId).catch(() => ({ fifoMap: {} }));
    const origPrepAllocMap = await _loadPrepUnitAllocationsForOrderPOS(orderId).catch(() => ({}));
    const scaledAlloc = (list, back) => {
      const total = (list || []).reduce((s, x) => s + (Number(x.qty) || 0), 0);
      if (!(total > 0)) return [];
      return list.map(x => ({ containerId: x.containerId, qty: (Number(x.qty) || 0) * (back / total) }));
    };
    Object.keys(dIng).forEach(id => {
      // [MỚI] Chiều TĂNG (thêm topping) cũng phân bổ FIFO như lúc bán bình thường.
      jobs.push(dIng[id] > 0
        ? _addonConsumeIngredientPOS(id, dIng[id], note, orderId, 'addon_' + editKey + '_ing_' + id)
        : UnitEngine.consume.reverseIngredient(id, -dIng[id], note + ' (giảm)', orderId, undefined, scaledAlloc(origFifoMap[id], -dIng[id]), false, editKey));
    });
    Object.keys(dPrep).forEach(id => {
      jobs.push(dPrep[id] > 0
        ? UnitEngine.consume.prepSale(id, dPrep[id], note, orderId, undefined, 'addon_' + editKey + '_prep_' + id)
        : UnitEngine.consume.reversePrep(id, -dPrep[id], note + ' (giảm)', orderId, scaledAlloc(origPrepAllocMap[id], -dPrep[id]), editKey));
    });
    if (!jobs.length) return { ok: true, failedLines: [] };
    const jobIds = [...Object.keys(dIng).map(id => ({ id, isPrep: false })), ...Object.keys(dPrep).map(id => ({ id, isPrep: true }))];
    const results = await Promise.allSettled(jobs);
    // Đơn đã lưu + báo thành công trước (không chặn quầy vì lỗi kho) — dòng kho lỗi phải để lại
    // cảnh báo BỀN cho Quản lý như bán thường, không chỉ console.
    const failedLines = [];
    results.forEach((r, i) => { if (r.status === 'rejected') {
      console.warn('[addon] trừ kho lỗi:', r.reason);
      failedLines.push({ ...jobIds[i], reason: String((r.reason && r.reason.message) || r.reason || '') });
    } });
    if (failedLines.length) {
      _ueWarnGogsConsumptionFailed(orderId, orderAfter, failedLines).catch(() => {});
      toastAutoReport('⚠️ Thêm topping: ' + failedLines.length + ' dòng kho chưa trừ được — đã báo Quản lý', 'Thêm topping: trừ kho lỗi', { ref: orderId });
    }
    refreshFifoAlert().catch(() => {});
    // [MỚI — Tuần 4 truy xuất] order_stock_traces_gieogieo (ghi bởi applySalesConsumptionPOS lúc
    // bán) chỉ chụp đúng breakdown TẠI THỜI ĐIỂM BÁN — hàm này tính CHÊNH LỆCH rồi trừ/hoàn thẳng
    // qua applyStockTransactionPOS/_reverseIngredientConsumptionPOS, không đi qua đường ghi lại
    // snapshot đó. Không đủ thời gian gộp chính xác allocations mới vào snapshot (phần TĂNG có
    // allocations riêng, phần GIẢM chia tỷ lệ xấp xỉ từ allocations gốc — xem scaledAlloc ở trên),
    // nên chỉ đánh dấu RÕ là đã chỉnh sau khi bán để Bill ↔ Tem không hiển thị nhầm thành đầy đủ —
    // đối soát phần thêm/giảm bằng ledger (referenceId=orderId) khi cần chính xác tuyệt đối.
    UnitEngine.consume.writeTrace(orderId, {
      edited: true, editedAt: vnDate().toISOString()
    }, { merge: true }).catch(err => console.warn('[stockTrace] đánh dấu edited lỗi', orderId, err));
    return { ok: failedLines.length === 0, failedLines };
  } catch (err) {
    // [Sửa lỗi 6] Lỗi nạp công thức / tính chênh lệch → cả phần thêm CHƯA trừ kho: để lại cảnh báo BỀN.
    console.warn('[addon] applyAddonConsumptionPOS lỗi (không ảnh hưởng bill):', err);
    _ueWarnGogsConsumptionFailed(orderId, orderAfter, [{ id: 'toàn bộ phần thêm topping', isPrep: false,
      reason: 'không tính được tiêu hao: ' + String((err && err.message) || err || '') }]).catch(() => {});
    toastAutoReport('⚠️ Thêm topping: chưa trừ kho được — đã báo Quản lý', 'Thêm topping: trừ kho lỗi', { ref: orderId });
    return { ok: false, failedLines: [{ id: '*', isPrep: false, reason: 'không tính được tiêu hao: ' + String((err && err.message) || err || '') }] };
  }
}

// [Sửa lỗi 4] Trừ kho phần TĂNG khi thêm topping — như nhánh bán thường (applySalesConsumptionPOS):
// txId cố định theo lần sửa, ghi sổ thử lại vài lần; vẫn lỗi mà sổ thật sự CHƯA có dòng thì hoàn phần
// đã trừ khỏi tem (không để tem giảm mà sổ không có gì — xoá bill sau này sẽ không hoàn được).
async function _addonConsumeIngredientPOS(id, qty, note, orderId, txId) {
  // [v15] Chạy lại cùng txId: kiểm sổ TRƯỚC khi phân bổ tem (fail-closed: không đọc được thì không trừ) — không trừ tem lần hai.
  if ((await fstore.collection('stock_transactions_gieogieo').doc(txId).get()).exists) return { alreadyApplied: true };
  const allocations = await UnitEngine.consume.allocate(id, qty, undefined, { type: 'order', id: orderId, duringPrepLock: true })
    .catch(err => { console.warn('[FIFO] phân bổ lỗi', id, err); return []; });
  const ghi = () => UnitEngine.ledger.apply({
    itemId: id, type: 'CONSUMPTION', qty: -qty, note, staff: '', referenceId: orderId, txId, duringPrepLock: true,
    deriveFromUnits: allocations.length > 0,
    ...(allocations.length ? { meta: { fifoAllocations: allocations } } : {})
  });
  let lastErr = null;
  for (let lan = 0; lan < 3; lan++) {
    try {
      const applied = await ghi();
      // Lượt khác đã ghi sổ trước / bill đã bị xoá: phần tem vừa trừ thêm phải được hoàn (đường bù trùng bền của engine).
      if (applied && applied.alreadyApplied && allocations.length) await UnitEngine.consume.compensateDuplicate('item', id, allocations, txId);
      return applied;
    }
    catch (err) { lastErr = err; if (lan < 2) await new Promise(r => setTimeout(r, 400 * (lan + 1))); }
  }
  if (allocations.length) {
    let daGhi = false;
    try { daGhi = (await fstore.collection('stock_transactions_gieogieo').doc(txId).get()).exists; }
    catch (checkErr) { console.warn('[UnitEngine] không kiểm tra lại được sổ, KHÔNG hoàn để tránh hoàn nhầm', id, checkErr); daGhi = true; }
    if (!daGhi) {
      try {
        const rv = await UnitEngine.consume.reverseClaimed('addonfail_' + txId, id, allocations);
        if (rv.ambiguous || rv.appliedQty >= rv.totalQty - 1e-6) await UnitEngine.stock.recompute(id, STOCK_CONTAINERS_COLL).catch(() => {});
      } catch (revErr) { console.error('[UnitEngine] hoàn tem sau khi ghi sổ lỗi cũng lỗi luôn', id, revErr); }
    }
  }
  throw lastErr;
}

// ── In phiếu bổ sung ────────────────────────────────────────────────────
function buildAddonReceiptContent(o, addon) {
  const isCash = addon.method === 'TIỀN MẶT';
  const t = vnDate(addon.at);
  const p2 = n => String(n).padStart(2, '0');
  return [
    { type: 'text', text: 'PHIẾU BỔ SUNG', size: 26, align: 'center', bold: true },
    o.billCode ? { type: 'text', text: o.billCode, size: 20, align: 'center', bold: true } : null,
    { type: 'divider', style: 'dashed' },
    { type: 'text', text: `${p2(t.getDate())}/${p2(t.getMonth() + 1)}/${t.getFullYear()}  ${p2(t.getHours())}:${p2(t.getMinutes())}`, size: 15 },
    { type: 'text', text: `Ly ${addon.seq}/${addon.totalCups}: ${addon.itemName}${addon.itemSize && addon.itemSize !== '-' ? ' (' + addon.itemSize + ')' : ''}`, size: 16, bold: true },
    { type: 'divider', style: 'dashed' },
    ...(addon.toppings || []).map(tp => ({
      type: 'row',
      left: { text: '+ ' + tpLabel(tp), size: 16 },
      right: { text: fmt((Number(tp.price) || 0) * tpQty(tp)), size: 16, bold: true }
    })),
    { type: 'divider', style: 'solid' },
    { type: 'text', text: `CỘNG THÊM: ${fmt(addon.amount)}`, size: 24, bold: true, align: 'right' },
    { type: 'text', text: addon.method, size: 16, align: 'right', bold: true },
    isCash ? { type: 'row', left: { text: 'Khách đưa', size: 16 }, right: { text: fmt(addon.cashGiven), size: 17, bold: true } } : null,
    isCash ? { type: 'row', left: { text: 'Thối lại', size: 16 }, right: { text: fmt(addon.cashChange), size: 17, bold: true } } : null,
    { type: 'divider', style: 'dashed' },
    { type: 'text', text: `NV: ${addon.staff}`, size: 13 },
    { type: 'text', text: 'Phiếu này đi kèm hoá đơn gốc', size: 13, align: 'center' },
  ].filter(Boolean);
}

function printAddonReceipt(o, addon) {
  if (!POSPrinter.autoPrintEnabled || !POSPrinter.connected) return;
  POSPrinter.printCustom(buildAddonReceiptContent(o, addon))
    .catch(() => toast('⚠️ Chưa in được phiếu bổ sung — máy in bill mất kết nối'));
}

// ── In tem bổ sung ──────────────────────────────────────────────────────
// Cố ý KHÔNG in lại tem đầy đủ của ly đó: ly trên quầy đã có tem rồi, dán thêm một tem
// giống hệt chỉ gây rối. Tem này nói đúng việc cần làm — thêm topping gì vào ly nào.
function buildAddonLabelLines(o, addon) {
  const t = vnDate(addon.at);
  const p2 = n => String(n).padStart(2, '0');
  return [
    { type: 'row',
      left: { text: 'BỔ SUNG', size: 13, bold: true },
      right: { text: `${o.billCode || ''}  ${addon.seq}/${addon.totalCups}`, size: 13, bold: true } },
    { text: addon.itemName + (addon.itemSize && addon.itemSize !== '-' ? ' (' + addon.itemSize + ')' : ''), size: 20, align: 'left', bold: true, noWrap: true },
    ...(addon.toppings || []).map(tp => ({ text: '+ ' + tpLabel(tp), size: 18, align: 'left', bold: true })),
    { type: 'divider' },
    { text: fmt(addon.amount), size: 18, align: 'right', bold: true },
    { text: `${p2(t.getHours())}:${p2(t.getMinutes())} · ${addon.staff}`, size: 10, align: 'left' },
  ];
}

async function printAddonLabel(o, addon) {
  if (!_temBridgeReady()) return;
  try {
    await POSTemPrinter._enqueue(async () => {
      try { await temEnsureConnected(); } catch (e) { console.warn('[addon tem] nối lại lỗi', e); }
      if (POSTemPrinter.printLabel(buildAddonLabelLines(o, addon), 1) === false) {
        const stx = _temStatus();
        toast('⚠️ Chưa in được tem bổ sung' + ((stx && stx.lastError) ? ' — ' + stx.lastError : ''));
      }
    });
  } catch (err) { console.warn('[addon tem] lỗi', err); }
}

// ============================================================
// DETAIL
// ============================================================
function showDet(id) {
  curOid = id;
  const o = orders.find(x => x.id === id); if (!o) return;
  const itemsList = o.items.map ? o.items : [];
  const totalQty = itemsList.reduce((a,b) => a + b.qty, 0);
  const cashGiven = o.cashGiven !== undefined ? o.cashGiven : o.total;
  const cashChange = o.cashChange !== undefined ? o.cashChange : 0;
  const isCash = o.method === 'TIỀN MẶT';

  document.getElementById('dc2').innerHTML = `
    <!-- Bill card -->
    <div style="background:#fff;border-radius:24px;padding:28px 24px 20px;margin-bottom:12px;">
      <div style="font-family:'Google Sans Display',sans-serif;font-size:32px;font-weight:900;color:var(--gd);letter-spacing:-1px;margin-bottom:2px;">Gieo Gieo</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:${o.isToGo ? '8px' : (o.billCode ? '6px' : '24px')};">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--gm);display:inline-block;"></span>
        <span style="font-size:12px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.8px;">Hóa đơn điện tử</span>
      </div>
      ${o.billCode ? `<div style="font-size:14px;font-weight:800;color:var(--gm);margin-bottom:${o.isToGo?'8px':'20px'};">${o.billCode}${(o.addons && o.addons.length) ? ` <span style="font-size:10.5px;font-weight:800;background:#1d4ed8;color:#fff;border-radius:6px;padding:2px 7px;margin-left:6px;vertical-align:middle;">ĐÃ BỔ SUNG ×${o.addons.length}</span>` : ''}</div>` : ''}
      ${o.bankOrderId ? `<div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:12px;padding:8px 14px;margin-bottom:20px;display:inline-flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">🏦</span>
        <span style="font-size:13px;font-weight:700;color:#6d28d9;">Mã CK: ${o.bankOrderId}</span>
      </div>` : ''}
      ${_bankConfirmBadgeHTML(o)}
      ${o.isToGo ? `<div style="background:#fef3c7;border-radius:12px;padding:8px 14px;margin-bottom:20px;display:inline-flex;align-items:center;gap:8px;">
        <span style="font-size:16px;font-weight:700;">🛵</span>
        <span style="font-size:13px;font-weight:700;color:#92400e;">ĐƠN MANG VỀ (TO GO)</span>
      </div>` : ''}
      ${o.method === 'TÍNH RIÊNG' && o.splitGroups && o.splitGroups.length
        ? o.splitGroups.map((grp, gi) => {
            const isCashGrp = grp.method === 'TIỀN MẶT';
            // [CHANGED] Nhóm chuyển khoản dùng màu tím (#7c3aed) đồng bộ với màu bill
            // chuyển khoản ở danh sách lịch sử, thay vì xanh dương (var(--bi)) cũ.
            const iconBg = isCashGrp ? '#d4f0da' : '#ede9fe';
            const iconColor = isCashGrp ? 'var(--gm)' : '#6d28d9';
            const borderColor = isCashGrp ? 'var(--gm)' : '#7c3aed';
            return `
            <div style="border:2px solid ${borderColor};border-radius:18px;padding:16px;margin-bottom:${gi < o.splitGroups.length-1 ? '14px' : '0'};">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f0f0f0;">
                <div style="width:32px;height:32px;background:${iconBg};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;">${isCashGrp ? '💵' : '🏦'}</div>
                <div>
                  <div style="font-size:13px;font-weight:700;color:${iconColor};text-transform:uppercase;letter-spacing:.5px;">${grp.method}</div>
                  <div style="font-size:11px;color:var(--gt);">${grp.items.length} món · ${grp.total.toLocaleString('vi-VN')}đ${grp.bankOrderId ? ` · Mã CK: <b style="color:#6d28d9;">${grp.bankOrderId}</b>` : ''}${_bankConfirmBadgeHTML(grp, true)}</div>
                </div>
              </div>
              ${grp.items.map((it, ii) => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${ii < grp.items.length-1 ? 'border-bottom:1px solid #f7f7f7;' : ''}">
                  <span style="font-size:14px;font-weight:700;color:var(--gt);min-width:18px;">${ii+1}</span>
                  <div style="flex:1;">
                    <div style="font-size:15px;font-weight:700;color:var(--td);">${it.name}</div>
                    <span style="display:inline-flex;align-items:center;gap:4px;background:var(--gl);color:var(--gd);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;margin-top:3px;">Size ${it.size}&nbsp;&nbsp;${it.price.toLocaleString('vi-VN')}</span>
                    ${it.isFood ? '' : `<span style="display:inline-flex;margin:3px 0 0 4px;vertical-align:top;">${iceChipHtml(it)}</span>`}
                  </div>
                  <div style="font-size:15px;font-weight:700;color:var(--td);">${it.price.toLocaleString('vi-VN')}</div>
                </div>`).join('')}
              ${isCashGrp ? `
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f0;display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;">Khách đưa</span>
                  <span style="font-size:13px;font-weight:700;color:var(--td);">${(grp.cashGiven||grp.total).toLocaleString('vi-VN')}đ</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;">Tiền thừa</span>
                  <span style="font-size:13px;font-weight:700;color:${(grp.cashChange||0)>0?'var(--gm)':'var(--td)'};">${(grp.cashChange||0).toLocaleString('vi-VN')}đ</span>
                </div>
              </div>` : ''}
            </div>`;
          }).join('')
        : itemsList.map((it, i) => {
            // [CHANGED] Đã gỡ Đồng giá — item luôn hiển thị theo giá đã lưu trong bill.

            const itToppings = it.toppings || [];
            const toppingSum = tpSum(itToppings);
            // [NEW-addon] Topping MUA THÊM sau khi bấm bill dùng màu xanh dương + chữ
            // "thêm", tách hẳn khỏi topping cam của lúc đặt đầu — nhìn là biết ngay đơn
            // này đã bị chỉnh và chỉnh cái gì.
            const toppingHtml = itToppings.length
              ? itToppings.map(t => {
                  const bg = t.addon ? '#dbeafe' : '#fff3e0';
                  const fg = t.addon ? '#1d4ed8' : '#b45309';
                  const priceFg = t.addon ? '#2563eb' : '#e67e22';
                  const mark = t.addon ? '<span style="font-size:9.5px;background:#1d4ed8;color:#fff;border-radius:4px;padding:1px 4px;margin-right:3px;">THÊM</span>' : '';
                  return '<span style="display:inline-flex;align-items:center;gap:3px;background:' + bg + ';color:' + fg + ';border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;margin-right:4px;margin-top:4px;">' + mark + '+ ' + tpLabel(t) + (t.price ? ' <span style="color:' + priceFg + ';margin-left:2px;">+' + ((Number(t.price)||0) * tpQty(t)).toLocaleString('vi-VN') + '</span>' : '') + '</span>';
                }).join('')
              : '';
            const itemTotalAmt = (it.price + toppingSum) * it.qty;

            return `
        <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;${i < itemsList.length - 1 ? 'border-bottom:1px solid #f0f0f0;' : ''}">
          <span style="font-size:17px;font-weight:700;color:var(--td);min-width:20px;">${i+1}</span>
          <div style="flex:1;">
            <div style="font-size:17px;font-weight:700;color:var(--td);margin-bottom:5px;">${it.name}${it.qty > 1 ? ` <span style="font-size:13px;color:var(--gm);font-weight:700;">×${it.qty}</span>` : ''}</div>
            <span style="display:inline-flex;align-items:center;gap:4px;background:var(--gl);color:var(--gd);border-radius:8px;padding:3px 10px;font-size:12px;font-weight:700;">${it.size}&nbsp;&nbsp;${it.price.toLocaleString('vi-VN')}</span>
            ${it.isFood ? '' : `<span style="display:inline-flex;margin-left:6px;vertical-align:top;">${iceChipHtml(it)}</span>`}
            ${toppingHtml ? `<div style="display:flex;flex-wrap:wrap;margin-top:2px;">${toppingHtml}</div>` : ''}
          </div>
          <div style="text-align:right;white-space:nowrap;">
            <div style="font-size:17px;font-weight:700;color:var(--td);">${itemTotalAmt.toLocaleString('vi-VN')}</div>
          </div>
        </div>`;
          }).join('')}
    </div>

    ${(() => {
      const ai = orderAddonInfo(o);
      if (!ai.ok) return '';
      return `<div style="background:#fff;border-radius:20px;padding:16px 18px;margin-bottom:12px;border:2px dashed var(--gd);">
        <button onclick="openAddonSheet('${o.id}')" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">➕ Thêm topping cho 1 ly · còn ${ai.minsLeft} phút</button>
        <div style="font-size:11.5px;color:var(--gt);margin-top:8px;line-height:1.5;">Chỉ thêm được trong ${ADDON_WINDOW_MIN} phút kể từ lúc bấm bill, và chỉ THÊM — không xoá được topping đã có. Bill gốc không in lại; máy sẽ in một phiếu bổ sung và một tem bổ sung.</div>
      </div>`;
    })()}

    ${(o.addons && o.addons.length) ? `
    <div style="background:#fff;border-radius:20px;padding:18px 20px;margin-bottom:12px;border:2px solid #1d4ed8;">
      <div style="font-size:11px;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;">Đã bổ sung sau khi bấm bill</div>
      ${o.addons.map((ad, ai2) => {
        const t = vnDate(ad.at);
        const p2 = n => String(n).padStart(2,'0');
        const isCashAd = (ad.method || '').includes('TIỀN MẶT');
        return `<div style="${ai2 ? 'border-top:1px solid #f0f0f0;padding-top:12px;margin-top:12px;' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
            <div style="font-size:14px;font-weight:700;color:var(--td);">Ly ${ad.seq}/${ad.totalCups} · ${ad.itemName}${ad.itemSize && ad.itemSize !== '-' ? ' ('+ad.itemSize+')' : ''}</div>
            <div style="font-size:17px;font-weight:800;color:#1d4ed8;white-space:nowrap;">+${(Number(ad.amount)||0).toLocaleString('vi-VN')}đ</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;margin-top:4px;">
            ${(ad.toppings||[]).map(tp => `<span style="display:inline-flex;background:#dbeafe;color:#1d4ed8;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;margin-right:4px;margin-top:4px;">+ ${tpLabel(tp)}</span>`).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <span style="font-size:11.5px;color:var(--gt);font-weight:600;">${p2(t.getHours())}:${p2(t.getMinutes())} · ${ad.staff || ''}</span>
            <span style="font-size:11.5px;font-weight:800;color:${isCashAd ? 'var(--gm)' : '#6d28d9'};">${ad.method}</span>
          </div>
          ${isCashAd ? `
          <div style="display:flex;gap:16px;margin-top:6px;padding-top:6px;border-top:1px dashed #eee;">
            <div style="flex:1;"><span style="font-size:10.5px;color:var(--gt);font-weight:700;text-transform:uppercase;">Khách đưa</span><div style="font-size:13.5px;font-weight:700;color:var(--td);">${(Number(ad.cashGiven)||0).toLocaleString('vi-VN')}đ</div></div>
            <div style="flex:1;"><span style="font-size:10.5px;color:var(--gt);font-weight:700;text-transform:uppercase;">Thối lại</span><div style="font-size:13.5px;font-weight:700;color:${(Number(ad.cashChange)||0)>0?'var(--gm)':'var(--td)'};">${(Number(ad.cashChange)||0).toLocaleString('vi-VN')}đ</div></div>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Meta row -->
    <div style="background:#fff;border-radius:20px;display:grid;grid-template-columns:1fr 1fr 1fr;overflow:hidden;margin-bottom:12px;">
      <div style="padding:16px 14px;border-right:1px solid #f0f0f0;">
        <div style="font-size:10px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;">Thời gian</div>
        <div style="font-size:14px;font-weight:700;color:var(--td);line-height:1.3;">${o.time}<br><span style="font-size:12px;color:var(--gt);font-weight:600;">${o.date.substring(0,5)}</span></div>
      </div>
      <div style="padding:16px 14px;border-right:1px solid #f0f0f0;">
        <div style="font-size:10px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;">Khách</div>
        <div style="font-size:13px;font-weight:700;color:var(--td);line-height:1.4;">${o.phone || 'Khách vãng lai'}</div>
      </div>
      <div style="padding:16px 14px;">
        <div style="font-size:10px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;">Thanh toán</div>
        <div style="font-size:13px;font-weight:700;color:var(--gm);">${o.method === 'TÍNH RIÊNG' ? 'TÍNH RIÊNG' : o.method}${o.splitGroups && o.splitGroups.length ? `<div style="font-size:11px;font-weight:600;color:var(--gt);margin-top:3px;">${o.splitGroups.length} nhóm</div>` : ''}</div>
      </div>
    </div>

    <!-- Total card -->
    <div style="background:#fff;border-radius:20px;padding:22px 24px;">
      <div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">Tổng Bill</div>
      <div style="font-size:52px;font-weight:700;color:var(--td);line-height:1;letter-spacing:-1px;">${o.total.toLocaleString('vi-VN')}<span style="font-size:24px;color:var(--gt);">đ</span></div>
      <div style="font-size:13px;color:var(--gt);margin-top:6px;margin-bottom:${(o.method === 'TÍNH RIÊNG' && o.splitGroups && o.splitGroups.length) ? '0' : '12px'};">Số lượng: ${totalQty} món${o.voucherUsed ? ' · 🎁 ' + escHtmlPos(stampPromotionLabel(o.voucherUsed)) : ''}</div>
      ${!(o.method === 'TÍNH RIÊNG' && o.splitGroups && o.splitGroups.length) ? `
      <div style="border-top:1px solid #f0f0f0;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f5f5f5;">
          <span style="font-size:12px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.5px;">Khách đưa</span>
          <span style="font-size:15px;font-weight:700;color:var(--td);">${cashGiven.toLocaleString('vi-VN')}đ</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;">
          <span style="font-size:12px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.5px;">Tiền thừa</span>
          <span style="font-size:15px;font-weight:700;color:${cashChange > 0 ? 'var(--gm)' : 'var(--td)'};">${cashChange.toLocaleString('vi-VN')}đ</span>
        </div>
      </div>` : ''}
    </div>`;
  showScreen('de');
}

// [FIX] Chặn xoá cùng một đơn hai lần. Popup đóng lại ngay khi bấm Xoá, nhưng
// màn chi tiết vẫn còn đó và nút thùng rác vẫn bấm được trong lúc chờ Firebase
// phản hồi — bấm lần nữa là hoàn kho thêm một lần nữa, kho dư lên mà không ai
// biết vì sao. Ghi nhớ id đang xoá cho tới khi xong hẳn.
let _deletingOrderIds = new Set();

function delOrder() {
  const o = orders.find(x => x.id === curOid);
  if (!o) return;
  if (_deletingOrderIds.has(curOid)) { toast('⏳ Đơn này đang được xoá, đợi chút...'); return; }
  // Hiện popup nhập mật khẩu
  document.getElementById('del-order-popup').style.display = 'flex';
  document.getElementById('del-pin-input').value = '';
  document.getElementById('del-pin-error').style.display = 'none';
  setTimeout(() => document.getElementById('del-pin-input').focus(), 120);
}

async function removeBillSideRecordsPOS(orderId, month, day, yyyy, closingDate) {
  const arRef = fstore.collection('orders_gieogieo_archive').doc(month + '_' + day + '_' + yyyy);
  const ar = await arRef.get();
  if (ar.exists && ((ar.data() || {}).orders || {})[orderId])
    await arRef.update({ ['orders.' + orderId]: firebase.firestore.FieldValue.delete() });
  if (closingDate) {
    const clRef = fstore.collection('daily_closings_gieogieo').doc(closingDate);
    const cl = await clRef.get();
    if (cl.exists && ((cl.data() || {}).postCloseBills || {})[orderId])
      await clRef.update({ ['postCloseBills.' + orderId]: firebase.firestore.FieldValue.delete() });
  }
}

async function delOrderConfirm() {
  const pin = document.getElementById('del-pin-input').value.trim();
  if (pin !== '3367') {
    document.getElementById('del-pin-error').style.display = 'block';
    document.getElementById('del-pin-input').value = '';
    document.getElementById('del-pin-input').focus();
    return;
  }
  document.getElementById('del-order-popup').style.display = 'none';
  const o = orders.find(x => x.id === curOid);
  if (!o) return;
  if (_deletingOrderIds.has(curOid)) { toast('⏳ Đơn này đang được xoá, đợi chút...'); return; }
  const delId = curOid;
  _deletingOrderIds.add(delId);

  // Build Firebase path từ o.date (DD/MM/YYYY)
  const [dd, mm, yyyy] = o.date.split('/');
  const monthIdx = parseInt(mm, 10) - 1;
  const month = MONTH_KEYS[monthIdx];
  const day = dd;
  const rtPath = 'orders_gieogieo/' + month + '/' + day + '/' + delId;
  // [v12] Khoá sửa BỀN dùng chung giữa các máy: từ lúc bắt đầu hoàn kho, bill không được bổ sung thêm (claim/dòng hoàn cố định theo bill nên phần tiêu thụ thêm sau đó
  // sẽ bị bỏ qua ở lần xoá lại). Cờ nằm trên chính node bill trong RT; bill bị xoá xong thì cờ biến mất cùng bill.
  // Ghi cờ là ĐIỀU KIỆN để bắt đầu hoàn (không phải cố gắng hết sức): lỗi → dừng trước khi hoàn kho, nhả khoá thao tác trên máy. Dùng transaction (không `set` — tránh dựng lại
  // node bill đã bị máy khác xoá).
  try {
    // [v14] Cùng transaction: có việc trừ kho bổ sung ĐANG CHẠY (chưa quá hạn) thì CHƯA khoá/xoá — chờ nó xong để phần trừ được hoàn cùng bill; việc chưa bắt đầu thì HUỶ
    // (lúc bắt đầu nó thấy cờ/huỷ nên không trừ).
    let busy = false;
    const kq = await db.ref(rtPath).transaction(cur => {
      if (cur === null) return cur;
      const jobs = { ...(cur.consumeJobs || {}) }, now = Date.now();
      busy = Object.keys(jobs).some(k => jobs[k].status === 'running' && now - (Number(jobs[k].startedAt) || 0) < ADDON_JOB_STALE_MS);
      if (busy) return;
      Object.keys(jobs).forEach(k => { if (jobs[k].status === 'pending' || jobs[k].status === 'running') jobs[k] = { ...jobs[k], status: 'cancelled' }; });
      return { ...cur, consumeJobs: jobs, deletionPending: true };
    });
    if (!(kq && kq.snapshot && kq.snapshot.val())) { _deletingOrderIds.delete(delId); toast('⚠️ Đơn không còn trên hệ thống — không cần xoá'); return; }
    if (!kq.committed && busy) { _deletingOrderIds.delete(delId); toast('⏳ Đang trừ kho phần bổ sung topping (có thể ở máy khác) — CHƯA xoá. Đợi vài giây rồi xoá lại.'); return; }
    o.deletionPending = true;
    // Dấu huỷ bill do engine ghi trong consume.reverseSales (dùng chung POS và Quản lý).
  } catch (flagErr) {
    console.warn('[xoá bill] không ghi được cờ xoá dở — dừng', flagErr);
    _deletingOrderIds.delete(delId);
    toast('⚠️ Chưa khoá được đơn để xoá (lỗi kết nối) — CHƯA hoàn kho, CHƯA xoá. Thử lại.');
    return;
  }

  // [BUG "xoá bill không await reverse" — FIX] Trước đây gọi reverseSalesConsumptionPOS()
  // KHÔNG await rồi xoá bill khỏi RTDB gần như ngay lập tức — nếu hoàn kho lỗi (một phần hay
  // toàn phần), bill đã biến mất trước khi ai kịp biết, chỉ còn 1 toast thoáng qua làm bằng
  // chứng. Giờ AWAIT xong mới xoá: đa số trường hợp hoàn kho chỉ mất vài trăm ms nên không
  // thực sự làm chậm việc "xoá bill sai gấp" như lo ngại ban đầu — cái chậm lại (nếu có) đúng
  // là lúc hoàn kho đang gặp lỗi mạng, và đó chính xác là lúc NÊN chậm lại để biết kết quả
  // trước khi xoá chứng từ gốc, không phải lúc cần xoá tuột đi.
  // [BUG FIX] Bill "Bổ sung TRƯỚC kết ca" (o.backfillMode==='before_close') chưa từng trừ
  // currentStock/RT — hoàn theo đường thường sẽ cộng ảo một lượng hàng chưa từng bị lấy ra
  // (xem _voidBackfillConsumptionPOS ngay trên reverseSalesConsumptionPOS()).
  const isBackfillNoStock = o.backfillMode === 'before_close';
  toast(isBackfillNoStock ? '⏳ Đang huỷ bill bổ sung (không đụng tồn kho)...' : '⏳ Đang hoàn kho...');
  // Lượt trừ kho của chính bill này còn đang chạy (vừa bán xong) → đợi nó xong mới hoàn.
  if (_consumptionInflightPOS.has(delId)) await _consumptionInflightPOS.get(delId);
  const rv = isBackfillNoStock
    ? await UnitEngine.consume.voidBackfill(delId)
    : await UnitEngine.consume.reverseSales(o, delId);
  // Hoàn kho lỗi → KHÔNG xoá bill: xoá rồi thì không còn gì để bấm hoàn lại. Hoàn kho tự
  // idempotent (id cố định theo bill + món) nên bấm xoá lại chỉ chạy nốt phần còn thiếu.
  if (!rv.ok) {
    _deletingOrderIds.delete(delId);
    // [Sửa lỗi 1] Lượt hoàn khác đang giữ tem của bill này → đợi 2 phút rồi xoá lại.
    toast(rv.busy ? '⏳ Có lượt hoàn kho khác đang chạy cho bill này — CHƯA xoá bill. Đợi 2 phút rồi xoá lại.'
      : '⚠️ ' + (isBackfillNoStock ? 'Huỷ dòng sổ' : 'Hoàn kho') + ' lỗi ' + (rv.failedCount ? rv.failedCount + ' dòng' : '') + ' — CHƯA xoá bill. Bấm xoá lại để thử tiếp.');
    return;
  }
  // Bill đã vào archive (ngày cũ) phải gỡ cả ở archive; bill bổ sung sau kết ca phải gỡ khoản
  // tiền trong phiếu đóng ngày. Làm TRƯỚC khi xoá RTDB và KHÔNG nuốt lỗi: lỗi thì dừng, bill còn
  // nguyên để bấm xoá lại (hoàn kho đã idempotent). Chỉ gỡ khi thật sự có mục đó.
  try {
    await removeBillSideRecordsPOS(delId, month, day, yyyy, o.backfillMode ? (o.businessDate || (yyyy + '-' + mm + '-' + dd)) : null);
  } catch (err) {
    _deletingOrderIds.delete(delId);
    toast('⚠️ Đã hoàn kho nhưng chưa gỡ được bill khỏi lưu trữ/phiếu đóng ngày: ' + (err.message || err) + ' — bấm xoá lại');
    return;
  }

  // Xoá trên Realtime Database
  db.ref(rtPath).remove()
    .then(() => {
      // Xoá khỏi RAM và _ordersInRam Set
      _ordersInRam.delete(delId);
      orders = orders.filter(x => x.id !== delId);
      toast(rv.ok
        ? (isBackfillNoStock
          ? '🗑 Đã xoá bill bổ sung — không đụng tồn kho (bill này chưa từng trừ)'
          : '🗑 Đã xoá đơn — nguyên liệu đã hoàn về kho (stamp/voucher cần Quản lý xử lý tay)')
        : '🗑 Đã xoá đơn — nhưng ' + (isBackfillNoStock ? 'đánh dấu huỷ dòng sổ' : 'hoàn kho') + ' ' + (rv.failedCount ? 'lỗi ' + rv.failedCount + ' dòng' : 'lỗi hoàn toàn') + ', đã báo Quản lý (Hộp thư cảnh báo)');
      showScreen('hi');
    })
    .catch(err => {
      // Xoá hỏng → cho bấm lại. Hoàn kho đã chạy rồi; lần bấm sau reverseSalesConsumptionPOS()
      // chạy lại từ đầu nhưng mỗi bước hoàn (RT lẫn ledger/currentStock) đều có id CỐ ĐỊNH theo
      // (orderId + item) nên tự nhận ra đã hoàn, không cộng đúp (xem _ueClaimedReverseAllocations
      // và txRef cố định trong _reverseIngredientConsumptionPOS/_reversePrepConsumptionPOS).
      _deletingOrderIds.delete(delId);
      toast('❌ Lỗi xoá: ' + err.message);
    });
}

function delOrderCancel() {
  document.getElementById('del-order-popup').style.display = 'none';
}

// ============================================================
// [MỚI] BỔ SUNG BILL THIẾU SAU KẾT CA
// Nhân viên/Quản lý báo phát hiện thiếu 1 bill sau khi ngày đã kết ca (thanh toán bình thường đã
// bị khoá cứng — xem _isDayClosedToday). Luồng này mở lại đúng màn gọi món/thanh toán bình
// thường (để tính tiêu hao đúng công thức GOGS, không phải nhập tay từng nguyên liệu), nhưng:
//   - Cần mã 8833 để vào (không phải PIN nhân viên — đây là thao tác ngoại lệ hiếm khi dùng).
//   - Bill được ghi LÙI NGÀY về đúng ngày kinh doanh GẦN NHẤT đã kết ca (không chọn ngày tuỳ ý —
//     quyết định nghiệp vụ đã chốt: chỉ dùng cho tình huống "vừa kết ca xong, phát hiện thiếu").
//   - Phải chọn 1 trong 2 cách trừ nguyên liệu:
//       "Trừ TRƯỚC kết ca" → applyBackfillConsumptionNoStockEffect(): ghi sổ tiêu hao đúng ngày
//         cho báo cáo doanh thu/giá vốn, KHÔNG đụng currentStock/RT (kiểm kê cuối ngày hôm đó
//         coi như đã bắt đúng phần hao hụt này rồi — đếm tay thật, hàng đã dùng trước khi đếm).
//       "Trừ SAU kết ca" → applySalesConsumptionPOS(): trừ thẳng tồn kho hiện tại như một lượt
//         bán thật diễn ra ngay bây giờ, chỉ ghi lùi ngày trên bill/ledger cho đúng báo cáo.
// ============================================================
let _backfillMode = null;

let _backfillPendingDate = null;

function openBackfillBillPinPopup() {
  const el = document.getElementById('backfill-pin-input');
  if (el) el.value = '';
  const err = document.getElementById('backfill-pin-error');
  if (err) err.style.display = 'none';
  document.getElementById('backfill-pin-popup').style.display = 'flex';
  setTimeout(() => el && el.focus(), 100);
}

function backfillPinCancel() {
  document.getElementById('backfill-pin-popup').style.display = 'none';
}

async function backfillPinConfirm() {
  const pin = (document.getElementById('backfill-pin-input').value || '').trim();
  if (pin !== '8833') {
    document.getElementById('backfill-pin-error').style.display = 'block';
    document.getElementById('backfill-pin-input').value = '';
    document.getElementById('backfill-pin-input').focus();
    return;
  }
  document.getElementById('backfill-pin-popup').style.display = 'none';
  await openBackfillModePopup();
}

// Tìm ngày kinh doanh GẦN NHẤT đã kết ca hẳn (daily_closings_gieogieo.status==='closed'). Quét
// theo document ID (dạng YYYY-MM-DD, so sánh chuỗi đúng thứ tự thời gian) trong 14 ngày gần nhất
// bằng range query trên chính documentId — tránh phải kèm orderBy(status) (sẽ đòi composite
// index chưa chắc dự án đã tạo sẵn). Lọc status==='closed' ở phía client.
async function _findMostRecentClosedBusinessDate() {
  const today = posDateKey();
  const from = posDateKey(vnDate(Date.now() - 14 * 86400000));
  const snap = await fstore.collection('daily_closings_gieogieo')
    .where(firebase.firestore.FieldPath.documentId(), '>=', from)
    .where(firebase.firestore.FieldPath.documentId(), '<=', today)
    .get();
  const closed = snap.docs.filter(d => d.data().status === 'closed').map(d => d.id).sort();
  return closed.length ? closed[closed.length - 1] : null;
}

async function openBackfillModePopup() {
  toast('⏳ Đang tìm ngày gần nhất đã kết ca...');
  let date = null;
  try { date = await _findMostRecentClosedBusinessDate(); }
  catch (err) { console.error('[Bổ sung bill] tìm ngày kết ca lỗi', err); toast('❌ Lỗi tìm ngày đã kết ca: ' + (err.message || err)); return; }
  if (!date) { toast('⚠️ Chưa có ngày nào kết ca gần đây (trong 14 ngày) để bổ sung bill'); return; }
  _backfillPendingDate = date;
  document.getElementById('backfillModeDate').textContent = posDateKeyToDisplay(date);
  document.getElementById('backfill-mode-popup').style.display = 'flex';
}

function backfillModeCancel() {
  document.getElementById('backfill-mode-popup').style.display = 'none';
  _backfillPendingDate = null;
}

async function startBackfillBill(mode) {
  if (!_backfillPendingDate) return;
  const date = _backfillPendingDate;
  document.getElementById('backfill-mode-popup').style.display = 'none';
  const cashTiming = await askBackfillCashTimingPOS(date);
  if (!cashTiming) { _backfillPendingDate = null; return; }
  _backfillMode = { businessDate: date, skipConsumption: mode === 'before', cashTiming };
  _backfillPendingDate = null;
  cartClear();
  showScreen('sm');
  renderBackfillBanner();
  toast('🧾 Đang bổ sung bill cho ngày ' + posDateKeyToDisplay(_backfillMode.businessDate) + ' — ' +
    (_backfillMode.skipConsumption ? 'KHÔNG trừ tồn kho hiện tại' : 'CÓ trừ tồn kho hiện tại'));
}

// Tiền của bill bổ sung nằm ở đâu — quyết định cách đối soát tiền mặt của ngày đó:
//   'in_close_count': bill bị QUÊN nhập, tiền đã nằm trong két lúc đếm kết ca → chỉ
//                     giải thích khoản lệch thừa lúc kết ca, không phải nộp thêm.
//   'after_close'   : bán SAU kết ca (vd khách VIP) → khoản NỘP BỔ SUNG của chính ngày
//                     đó, nộp chung với tiền bàn giao ngày hôm đó. Tiền mỗi ngày tách
//                     riêng: KHÔNG để lại két, KHÔNG cộng vào tiền giữ lại cho ca sau.
function askBackfillCashTimingPOS(date) {
  return new Promise(resolve => {
    const cu = document.getElementById('backfill-cash-overlay');
    if (cu) cu.remove();
    const ov = document.createElement('div');
    ov.id = 'backfill-cash-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2001;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px);';
    const done = v => { ov.remove(); resolve(v); };
    const btn = (id, title, sub, main) => `<button id="${id}" style="width:100%;text-align:left;padding:14px 16px;margin-bottom:10px;background:#fff;border:1.5px solid ${main ? 'var(--gd)' : '#e0e0e0'};border-radius:14px;cursor:pointer;">
        <div style="font-weight:700;font-size:14.5px;color:${main ? 'var(--gd)' : 'var(--td)'};margin-bottom:3px;">${title}</div>
        <div style="font-size:12px;color:#888;line-height:1.4;">${sub}</div></button>`;
    const d = posDateKeyToDisplay(date);
    ov.innerHTML = `<div style="background:#fff;border-radius:24px;padding:26px 22px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.25);">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:17px;font-weight:800;color:#111;margin-bottom:4px;">Tiền của bill bổ sung ngày ${d}</div>
        <div style="font-size:12.5px;color:#999;font-weight:500;">Áp dụng cho các bill bổ sung trong lượt này.</div>
      </div>
      ${btn('bfCashAfter', 'Bán SAU kết ca — nộp bổ sung', 'Khách đến sau khi đã kết ca. Tiền mặt phải nộp chung với tiền bàn giao của ngày ' + d + ', KHÔNG để lại két cho ca sau.', true)}
      ${btn('bfCashIn', 'Tiền đã nằm trong két lúc kết ca', 'Bill bị quên nhập trước khi kết ca, tiền đã được đếm cùng két. Bill này chỉ giải thích khoản lệch thừa lúc kết ca.', false)}
      <button id="bfCashCancel" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">Huỷ</button>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#bfCashAfter').onclick = () => done('after_close');
    ov.querySelector('#bfCashIn').onclick = () => done('in_close_count');
    ov.querySelector('#bfCashCancel').onclick = () => done(null);
  });
}

// Ghi bill bổ sung vào hồ sơ đóng ngày của CHÍNH ngày đó để Quản lý (tab Tiền mặt)
// thấy khoản nộp bổ sung / khoản giải thích lệch. Không chặn luồng thanh toán.
function recordBackfillCashPOS(order, orderId, mode) {
  const cash = orderCashAmountPOS(order), bank = orderBankAmountPOS(order);
  if (!(cash > 0) && !(bank > 0)) return;
  const timing = mode.cashTiming || 'after_close';
  const entry = { billCode: order.billCode || '', cash, bank, timing, at: order.createdAt || vnDate().toISOString(),
    staff: order.staff || '', total: Number(order.total) || 0 };
  const upd = { postCloseBills: { [orderId]: entry } };
  if (timing === 'after_close' && cash > 0) upd.postCloseCashPending = true;
  fstore.collection('daily_closings_gieogieo').doc(mode.businessDate).set(upd, { merge: true })
    .catch(err => { console.error('[Bổ sung bill] ghi hồ sơ tiền mặt lỗi', err); toastAutoReport('⚠️ Chưa ghi được khoản tiền bổ sung vào ngày ' + posDateKeyToDisplay(mode.businessDate) + ' (bill ' + (order.billCode || '') + ')', 'Bổ sung bill: chưa ghi được hồ sơ tiền', { ref: orderId }); });
  if (timing === 'after_close' && cash > 0)
    setTimeout(() => toast('💵 Nộp ' + cash.toLocaleString('vi-VN') + 'đ tiền mặt này CHUNG với tiền bàn giao ngày ' + posDateKeyToDisplay(mode.businessDate) + ' — không để lại két'), 2500);
}

function renderBackfillBanner() {
  const el = document.getElementById('backfillBanner');
  if (!el) return;
  if (!_backfillMode) { el.style.display = 'none'; return; }
  document.getElementById('backfillBannerText').textContent =
    '🧾 ĐANG BỔ SUNG BILL cho ngày ' + posDateKeyToDisplay(_backfillMode.businessDate) +
    ' — ' + (_backfillMode.skipConsumption ? 'không trừ tồn kho' : 'có trừ tồn kho hiện tại') +
    ' · ' + (_backfillMode.cashTiming === 'in_close_count' ? 'tiền đã trong két lúc kết ca' : 'tiền mặt nộp bổ sung cho ngày này');
  el.style.display = 'block';
}

// Không tự thoát chế độ sau mỗi bill — có thể còn nhiều hơn 1 bill thiếu cho cùng ngày đó.
// Nhân viên tự bấm "Thoát chế độ" trên banner khi đã bổ sung xong.
function cancelBackfillMode() {
  _backfillMode = null;
  cartClear();
  const el = document.getElementById('backfillBanner');
  if (el) el.style.display = 'none';
  toast('Đã thoát chế độ bổ sung bill');
}

PosGieoMods.orders = true;
