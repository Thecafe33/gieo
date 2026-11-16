// POS Gieo — «Khách tự chọn topping» (chủ dự án 31/10/2026). Món To Go có `pickTopping: {n, toppingIds}` (cấu hình ở Quản lý › Menu):
// bấm THANH TOÁN → trước bước chọn đá, mỗi ly chọn ĐÚNG n topping trong danh sách (được chọn trùng loại) hoặc «Khách không lấy topping».
// Miễn phí (price 0) nhưng mang id → trừ kho (computeConsumptionForOrder) và giá vốn (computeToppingsCogsForLine) tính theo topping thực chọn.
// Cờ riêng `_pickTpMark` / `pickTpApplied` — KHÔNG dùng `_freeTpMark` (tặng topping thành viên): requestClearCustomer xoá mọi `_freeTpMark` khi đổi khách.
// Nạp TRƯỚC <script> chính; CHỈ khai báo. ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung — tạo pos_pick_topping.v2.js (sổ tools/js_da_phat_hanh.json).
(window.PosGieoMods = window.PosGieoMods || {}).pickTp = 'dang';

let _pickTpUnits = [];     // key các ly (đã tách 1 ly / dòng) cần chọn trong lượt thanh toán này
let _pickTpNext = null;    // bước kế (chọn đá) — chỉ chạy khi mọi ly đã chọn xong
let _pickTpActiveKey = null;
let _pickTpSel = {};       // { toppingId: số phần } đang chọn cho ly mở trong popup

// Cấu hình hợp lệ khi n ≥ 1 và có ≥ 1 topping — khớp normPickToppingCfg bên quanlygieo.html.
function normPickToppingCfg(v) {
  if (!v || typeof v !== 'object') return null;
  const n = Math.floor(Number(v.n)) || 0;
  const ids = Array.isArray(v.toppingIds) ? v.toppingIds.filter(x => typeof x === 'string' && x) : [];
  return (n >= 1 && ids.length) ? { n, toppingIds: ids } : null;
}

function pickTpCfgOf(itemId) {
  const m = getActiveMenu().find(x => x.id === itemId);
  return m ? normPickToppingCfg(m.pickTopping) : null;
}

function pickTpNeedKeys() {
  return Object.keys(cart).filter(k => {
    const c = cart[k];
    return c && c.itemId && !c.isFood && !c._discountId && Number(c.qty) > 0 && !c.pickTpApplied && !!pickTpCfgOf(c.itemId);
  });
}

// Cổng vào duy nhất — gọi từ onCheckoutClick (pos_cart.v2.js) giữa checkTogoBeforeCheckout và askIceBeforePay.
function pickToppingBeforePay(next) {
  const keys = pickTpNeedKeys();
  if (!keys.length) { next(); return; }
  const units = [];
  keys.forEach(k => units.push(...splitCartEntryToUnits(k)));
  _pickTpUnits = units.filter(k => !!cart[k]);
  _pickTpNext = next;
  renderPickTpUnits();
  document.getElementById('pickTpUnitsPopup').classList.add('show');
  // 1 ly duy nhất → mở thẳng bảng chọn, đỡ một lần bấm.
  if (_pickTpUnits.length === 1) openPickTpPicker(_pickTpUnits[0]);
}

function _pickTpUnitLabel(key) {
  const c = cart[key];
  if (!c) return '';
  const same = _pickTpUnits.filter(k => cart[k] && cart[k].name === c.name && cart[k].size === c.size);
  const base = c.name + (c.size && c.size !== '-' ? ' ' + c.size : '');
  return same.length <= 1 ? base : `${base} — Ly ${same.indexOf(key) + 1}/${same.length}`;
}

function _pickTpSummary(c) {
  const list = (c.toppings || []).filter(t => t._pickTpMark);
  if (!list.length) return 'Khách không lấy topping';
  return list.map(t => t.name.replace(/ \(Tự chọn\)$/, '') + (tpQty(t) > 1 ? ' ×' + tpQty(t) : '')).join(', ');
}

function renderPickTpUnits() {
  _pickTpUnits = _pickTpUnits.filter(k => !!cart[k]);
  const listEl = document.getElementById('pickTpUnitsList');
  const doneBtn = document.getElementById('pickTpUnitsDoneBtn');
  if (!listEl) return;
  listEl.innerHTML = _pickTpUnits.map(k => {
    const c = cart[k];
    const done = !!c.pickTpApplied;
    return `<div onclick="openPickTpPicker('${k}')" style="background:${done ? 'var(--gl)' : '#fff'};border:2px solid ${done ? 'var(--gm)' : '#f0f0f0'};border-radius:18px;padding:16px 18px;display:flex;align-items:center;cursor:pointer;">
      <div style="min-width:0;flex:1;">
        <div style="font-size:16px;font-weight:800;color:var(--td);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtmlPos(_pickTpUnitLabel(k))}</div>
        <div style="font-size:12px;font-weight:600;color:${done ? 'var(--gd)' : '#999'};margin-top:3px;">${done ? escHtmlPos(_pickTpSummary(c)) : 'Chưa chọn topping'}</div>
      </div>
      <span style="font-size:20px;flex-shrink:0;margin-left:8px;color:${done ? 'var(--gm)' : '#ccc'};">${done ? '✅' : '›'}</span>
    </div>`;
  }).join('');
  const allDone = _pickTpUnits.length > 0 && _pickTpUnits.every(k => cart[k] && cart[k].pickTpApplied);
  if (doneBtn) doneBtn.style.display = allDone ? 'block' : 'none';
}

// ✕ ở danh sách ly = huỷ lượt thanh toán (chọn topping là bắt buộc); các ly đã chọn vẫn giữ để lần sau khỏi chọn lại.
function closePickTpUnits() {
  document.getElementById('pickTpUnitsPopup').classList.remove('show');
  document.getElementById('pickTpPopup').classList.remove('show');
  _pickTpNext = null;
  _pickTpActiveKey = null;
  renderCartDrawer();
}

function finishPickTpUnits() {
  const next = _pickTpNext;
  _pickTpNext = null;
  _pickTpUnits = [];
  document.getElementById('pickTpUnitsPopup').classList.remove('show');
  if (next) next();
}

function openPickTpPicker(key) {
  const c = cart[key];
  if (!c) { renderPickTpUnits(); return; }
  _pickTpActiveKey = key;
  _pickTpSel = {};
  (c.toppings || []).filter(t => t._pickTpMark).forEach(t => { _pickTpSel[t.id] = tpQty(t); });
  document.getElementById('pickTpSub').textContent = _pickTpUnitLabel(key);
  renderPickTpPicker();
  document.getElementById('pickTpPopup').classList.add('show');
}

function _pickTpTotal() { return Object.values(_pickTpSel).reduce((a, b) => a + b, 0); }

function renderPickTpPicker() {
  const c = cart[_pickTpActiveKey];
  const cfg = c && pickTpCfgOf(c.itemId);
  const listEl = document.getElementById('pickTpList');
  if (!c || !cfg) { listEl.innerHTML = ''; return; }
  const total = _pickTpTotal();
  const rows = cfg.toppingIds.map(id => TOPPINGS.find(x => x.id === id)).filter(Boolean);
  document.getElementById('pickTpCount').textContent = `Đã chọn ${total}/${cfg.n}`;
  listEl.innerHTML = rows.length ? rows.map(t => {
    const q = _pickTpSel[t.id] || 0;
    return `<div class="togo-gift-item ${q ? 'selected' : ''}" style="cursor:default;">
      <div style="width:36px;height:36px;border-radius:10px;background:#f59e0b;flex-shrink:0;"></div>
      <span class="togo-gift-name" style="flex:1;">${escHtmlPos(t.name)}</span>
      <button onclick="pickTpAdj('${t.id}',-1)" style="width:36px;height:36px;border-radius:50%;border:none;background:#eee;font-size:20px;font-weight:700;cursor:pointer;">−</button>
      <span style="min-width:22px;text-align:center;font-size:17px;font-weight:800;">${q}</span>
      <button onclick="pickTpAdj('${t.id}',1)" style="width:36px;height:36px;border-radius:50%;border:none;background:var(--gd);color:#fff;font-size:20px;font-weight:700;cursor:pointer;">+</button>
    </div>`;
  }).join('') : '<div style="text-align:center;padding:20px;color:#bbb;">Topping của món này không còn trong danh mục</div>';
  const btn = document.getElementById('pickTpConfirmBtn');
  btn.style.opacity = total === cfg.n ? '1' : '.45';
}

function pickTpAdj(toppingId, delta) {
  const c = cart[_pickTpActiveKey];
  const cfg = c && pickTpCfgOf(c.itemId);
  if (!cfg) return;
  const cur = _pickTpSel[toppingId] || 0;
  if (delta > 0 && _pickTpTotal() >= cfg.n) { toast('Chỉ được chọn ' + cfg.n + ' topping'); return; }
  const q = Math.max(0, cur + delta);
  if (q) _pickTpSel[toppingId] = q; else delete _pickTpSel[toppingId];
  renderPickTpPicker();
}

function _pickTpApply(c, entries) {
  c.toppings = (c.toppings || []).filter(t => !t._pickTpMark);
  entries.forEach(e => c.toppings.push({ id: e.id, name: e.name + ' (Tự chọn)', price: 0, qty: e.qty, _pickTpMark: true }));
  c.pickTpApplied = true;
}

function _pickTpAfterChoose() {
  document.getElementById('pickTpPopup').classList.remove('show');
  _pickTpActiveKey = null;
  renderPickTpUnits();
  // 1 ly: chọn xong là đi tiếp luôn, không bắt bấm «Hoàn tất».
  if (_pickTpUnits.length && _pickTpUnits.every(k => cart[k] && cart[k].pickTpApplied) && _pickTpUnits.length === 1) finishPickTpUnits();
}

function confirmPickTp() {
  const c = cart[_pickTpActiveKey];
  const cfg = c && pickTpCfgOf(c.itemId);
  if (!c || !cfg) { closePickTpPicker(); return; }
  if (_pickTpTotal() !== cfg.n) { toast('Vui lòng chọn đủ ' + cfg.n + ' topping'); return; }
  const entries = Object.entries(_pickTpSel).map(([id, qty]) => {
    const t = TOPPINGS.find(x => x.id === id);
    return t ? { id, name: t.name, qty } : null;
  }).filter(Boolean);
  _pickTpApply(c, entries);
  _pickTpAfterChoose();
}

function pickTpNone() {
  const c = cart[_pickTpActiveKey];
  if (!c) { closePickTpPicker(); return; }
  _pickTpApply(c, []);
  _pickTpAfterChoose();
}

function closePickTpPicker() {
  document.getElementById('pickTpPopup').classList.remove('show');
  _pickTpActiveKey = null;
  // 1 ly mà đóng bảng chọn = huỷ lượt thanh toán (không còn danh sách để quay lại).
  if (_pickTpUnits.length === 1 && !(cart[_pickTpUnits[0]] && cart[_pickTpUnits[0]].pickTpApplied)) closePickTpUnits();
}

PosGieoMods.pickTp = true;
