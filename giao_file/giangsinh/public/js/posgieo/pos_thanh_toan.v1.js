// Tách từ posgieo.html dòng 4004–4873, 7018–7346, 7360–7749, 7951–8387 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_thanh_toan.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).thanhtoan = 'dang';

// ============================================================
// TO GO — Toggle, Settings, Logic
// ============================================================
function resetTogoToggle() {
  // [F5] Chỉ còn To Go — không còn đảo chế độ; hàm giữ tên cũ, chỉ đặt lại bộ lọc/App/Ship sau mỗi đơn.
  curFilter = 'all';
  buildFilterBar();
  renderMenu();
  // Reset App Sale
  isAppSale = false;
  renderAppSaleBtn();
  // Reset Ship
  isShip = false;
  renderShipBtn();
  _syncShipBtnVisibility();
}

function loadTogoSettings() {
  try {
    const raw = localStorage.getItem('togoSettings_gieogieo');
    if (raw) {
      const parsed = JSON.parse(raw);
      togoSettings = {
        gift: { ...togoSettings.gift, ...(parsed.gift || {}) },
        giftMenu: { ...togoSettings.giftMenu, ...(parsed.giftMenu || {}) },
        discount: { ...togoSettings.discount, ...(parsed.discount || {}) },
        freeTopping: { ...togoSettings.freeTopping, ...(parsed.freeTopping || {}) }
      };
    }
  } catch(e) {}
}

function saveTogoSettingsLocal() {
  localStorage.setItem('togoSettings_gieogieo', JSON.stringify(togoSettings)); // cache offline, mở app lên có ngay
  // [FIX] Trước đây lỗi ghi Firebase chỉ console.warn (im lặng) — nhân viên bấm Lưu
  // vẫn thấy toast "✅ Đã lưu" dù bản ghi cloud thất bại, nên không hề biết, chỉ phát
  // hiện ra khi xoá cache/đổi máy thì mất sạch. Giờ báo lỗi rõ bằng toast ngay lúc đó,
  // và trả về Promise<boolean> để hàm gọi biết chắc có lưu cloud thành công hay không.
  return db.ref(TG_SETTINGS_FB_PATH).set(togoSettings)
    .then(() => true)
    .catch(err => {
      console.error('Lỗi lưu khuyến mãi lên Firebase:', err);
      toast('⚠️ LƯU CLOUD THẤT BẠI (' + (err.code || err.message || 'lỗi') + ') — chỉ lưu tạm máy này, xoá cache sẽ mất!');
      return false;
    });
}

// ============================================================
// BÁN QUA APP — Functions
// ============================================================
function loadAppFeeSettings() {
  try {
    const raw = localStorage.getItem('appFeeSettings_gieogieo');
    if (raw) { appSaleSettings = JSON.parse(raw); }
  } catch(e) {}
  // Cập nhật label % trên nút
  const pctLabel = document.getElementById('pmapp-pct-label');
  if (pctLabel) pctLabel.textContent = appSaleSettings.feePct || 10;
  // Cập nhật input trong màn hình cài đặt
  const inp = document.getElementById('app-fee-pct');
  if (inp) inp.value = appSaleSettings.feePct || 10;
}

function saveAppFeeSettings() {
  const pct = parseInt(document.getElementById('app-fee-pct').value) || 0;
  if (pct < 0 || pct > 100) { toast('⚠ % phí sàn không hợp lệ (0-100)'); return; }
  appSaleSettings.feePct = pct;
  localStorage.setItem('appFeeSettings_gieogieo', JSON.stringify(appSaleSettings));
  // Cập nhật label trên nút
  const pctLabel = document.getElementById('pmapp-pct-label');
  if (pctLabel) pctLabel.textContent = pct;
  toast('✅ Đã lưu cài đặt phí sàn ' + pct + '%');
}

function toggleAppSale() {
  isAppSale = !isAppSale;
  renderAppSaleBtn();
  // Cập nhật tổng bill ngay lập tức
  updCoTotal();
}

function renderAppSaleBtn() {
  const wrap = document.getElementById('pmapp-toggle-wrap');
  const sw = document.getElementById('pmapp-switch');
  const pmapp = document.getElementById('pmapp');
  const icon = document.getElementById('pmapp-icon');
  const title = document.getElementById('pmapp-title');
  if (!wrap) return;
  wrap.classList.toggle('active', isAppSale);
  if (sw) sw; // switch animation via CSS
  if (pmapp) pmapp.style.background = isAppSale ? '#e3f2fd' : '#fff';
  if (icon) icon.style.background = isAppSale ? '#bbdefb' : '#e8f4fd';
  if (title) title.style.color = isAppSale ? '#0d47a1' : '#1565c0';
}

function getAppSaleDiscount() {
  if (!isAppSale) return 0;
  const base = getCartTotal();
  const pct = appSaleSettings.feePct || 10;
  return Math.round(base * pct / 100);
}

// ============================================================
// SHIP MODE — Toggle & Render
// ============================================================
function toggleShipMode() {
  isShip = !isShip;
  renderShipBtn();
}

function renderShipBtn() {
  const btn  = document.getElementById('pmship');
  const wrap = document.getElementById('pmship-toggle-wrap');
  const icon = document.getElementById('pmship-icon');
  const title = document.getElementById('pmship-title');
  if (!btn) return;
  wrap.classList.toggle('active', isShip);
  btn.style.background  = isShip ? '#fffde7' : '#fff';
  icon.style.background = isShip ? '#fde68a' : '#fffbeb';
  if (title) title.style.color = isShip ? '#92400e' : '#b45309';
}

function _syncShipBtnVisibility() {
  const btn = document.getElementById('pmship');
  if (!btn) return;
  btn.style.display = 'flex';   // [F5] luôn To Go
}

// Làm tròn tiền mặt theo quy tắc:
// 0-799 → làm tròn xuống, 800-999 → làm tròn lên (theo đơn vị 1000đ)
function roundCashAmount(amount) {
  const thousands = Math.floor(amount / 1000);
  const remainder = amount % 1000;
  if (remainder >= 800) return (thousands + 1) * 1000;
  return thousands * 1000;
}

async function toggleTgGift() {
  togoSettings.gift.enabled = !togoSettings.gift.enabled;
  renderTgGiftToggle();
  // [FIX] Trước đây bấm công tắc KHÔNG lưu — phải bấm thêm nút "Lưu cài đặt" bên
  // dưới mới thực sự ghi lên Firebase. Rất dễ quên → tưởng đã bật mà deploy/mở lại
  // app là mất. Giờ bấm công tắc là lưu ngay, giống cảm giác 1 cái toggle bình thường.
  await saveTogoSettingsLocal(); // tự báo lỗi qua toast nếu ghi cloud thất bại
}

async function toggleTgDisc() {
  togoSettings.discount.enabled = !togoSettings.discount.enabled;
  renderTgDiscToggle();
  await saveTogoSettingsLocal(); // [FIX] tự lưu ngay khi bấm — xem ghi chú ở toggleTgGift()
}

function renderTgGiftToggle() {
  const wrap = document.getElementById('tgGiftToggle');
  const status = document.getElementById('tgGiftStatus');
  if (wrap) { wrap.classList.toggle('active', togoSettings.gift.enabled); }
  if (status) status.textContent = togoSettings.gift.enabled ? 'Bật' : 'Tắt';
}

function renderTgDiscToggle() {
  const wrap = document.getElementById('tgDiscToggle');
  const status = document.getElementById('tgDiscStatus');
  if (wrap) { wrap.classList.toggle('active', togoSettings.discount.enabled); }
  if (status) status.textContent = togoSettings.discount.enabled ? 'Bật' : 'Tắt';
}

function renderTgCategoryList() {
  const el = document.getElementById('tg-category-list');
  if (!el) return;
  // Danh mục áp dụng quà tặng lấy từ menu To Go
  const togoSrc = MENU_TOGO.length ? MENU_TOGO : MENU;
  const types = [...new Set(togoSrc.map(m => m.type).filter(Boolean))];
  el.innerHTML = types.map(t => {
    const checked = togoSettings.gift.categories.includes(t);
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;">
      <input type="checkbox" value="${t}" ${checked ? 'checked' : ''} onchange="onTgCatChange(this)"
        style="width:18px;height:18px;cursor:pointer;accent-color:var(--gm);">
      <span style="font-size:14px;font-weight:600;color:var(--td);">${t}</span>
    </label>`;
  }).join('');
  if (!types.length) el.innerHTML = '<div style="font-size:12px;color:#bbb;">Chưa có danh mục nào. Thêm món trước.</div>';
}

function onTgCatChange(cb) {
  if (cb.checked) { if (!togoSettings.gift.categories.includes(cb.value)) togoSettings.gift.categories.push(cb.value); }
  else { togoSettings.gift.categories = togoSettings.gift.categories.filter(c => c !== cb.value); }
}

// ---------- Menu quà tặng ----------
// [FIX] Trước đây danh sách này chỉ hiện món có size M và chỉ đọc MỘT trong hai
// menu (thường / mang đi) tuỳ nút To Go đang bật hay tắt — nên phần lớn món
// không hiện ra, chủ quán tưởng menu bị thiếu.
// Ràng buộc "phải có size M" đã bỏ hẳn: món nào cũng tặng được, chỉ cần giá của
// size sẽ tặng không vượt trần. Món không có M thì tặng size rẻ nhất của nó.
// Kèm giá để chủ quán nhìn giá mà quyết, khỏi mở menu tra song song.
function tgGiftMenuSource() {
  // Gộp cả hai menu, khử trùng theo id — chương trình tặng áp dụng cho cả bán
  // tại chỗ lẫn mang đi, nên không được phụ thuộc nút To Go đang bật hay tắt.
  const seen = new Set();
  const out = [];
  [...(MENU || []), ...(MENU_TOGO || [])].forEach(m => {
    if (!m || seen.has(m.id)) return;
    seen.add(m.id);
    out.push(m);
  });
  return out;
}

function renderTgGiftMenu() {
  const el = document.getElementById('tg-giftmenu-list');
  if (!el) return;
  const gm = togoSettings.giftMenu || {};
  const src = tgGiftMenuSource();
  if (!src.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;">Chưa có món nào trong menu.</div>'; return; }
  const sorted = [...src].sort((a, b) => giftRefPricePOS(a) - giftRefPricePOS(b));
  const chosen = (gm.itemIds || []).length;
  const head = `<div style="font-size:11.5px;font-weight:700;color:${chosen ? 'var(--gm)' : '#b45309'};padding-bottom:6px;border-bottom:1px solid #e8e8e8;margin-bottom:4px;">${chosen ? `Đã chọn ${chosen}/${src.length} món` : `Chưa chọn món nào — đang lọc theo danh mục (${src.length} món trong menu)`}</div>`;
  el.innerHTML = head + sorted.map(m => {
    const checked = (gm.itemIds || []).includes(m.id);
    // Hiện luôn size sẽ được tặng + giá của chính size đó, để chủ quán quyết
    // được ngay mà không phải mở menu ra tra.
    const gs = giftSizeForPOS(m);
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:7px 0;min-height:40px;">
      <input type="checkbox" value="${m.id}" ${checked ? 'checked' : ''} onchange="onTgGiftMenuChange(this)"
        style="width:20px;height:20px;flex-shrink:0;cursor:pointer;accent-color:var(--gm);">
      <span style="font-size:13.5px;font-weight:600;color:var(--td);flex:1;min-width:0;">${m.name}${gs ? `<span style="color:#999;font-weight:400;font-size:11.5px;"> · size ${gs.label}</span>` : ''}</span>
      <span style="font-size:12.5px;font-weight:700;color:var(--gm);flex-shrink:0;">${fmt(giftRefPricePOS(m))}</span>
    </label>`;
  }).join('');
}

function onTgGiftMenuChange(cb) {
  if (!togoSettings.giftMenu.itemIds) togoSettings.giftMenu.itemIds = [];
  if (cb.checked) { if (!togoSettings.giftMenu.itemIds.includes(cb.value)) togoSettings.giftMenu.itemIds.push(cb.value); }
  else { togoSettings.giftMenu.itemIds = togoSettings.giftMenu.itemIds.filter(id => id !== cb.value); }
}

function tgGiftMenuAll(val) {
  togoSettings.giftMenu.itemIds = val ? tgGiftMenuSource().map(m => m.id) : [];
  renderTgGiftMenu();
}

async function saveTgGift() {
  const buyQty = parseInt(document.getElementById('tg-buy-qty').value) || 0;
  const freeQty = parseInt(document.getElementById('tg-free-qty').value) || 0;
  if (!buyQty || !freeQty) { toast('⚠ Nhập số ly mua và số ly tặng'); return; }
  togoSettings.gift.buyQty = buyQty;
  togoSettings.gift.freeQty = freeQty;
  // Menu quà tặng — itemIds đã được cập nhật sẵn qua onTgGiftMenuChange, ở đây
  // chỉ gom nốt 2 ô còn lại.
  togoSettings.giftMenu = togoSettings.giftMenu || { itemIds: [] };
  togoSettings.giftMenu.maxPrice = parseInt((document.getElementById('tg-gift-maxprice').value || '').replace(/[^0-9]/g, '')) || 0;
  togoSettings.giftMenu.capByCheapest = !!document.getElementById('tg-gift-capcheapest').checked;
  // [FIX] Trước đây toast "Đã lưu" hiện ngay lập tức, không chờ biết ghi Firebase
  // có thành công hay không — nếu thất bại (mất mạng, lỗi quyền...) nhân viên vẫn
  // thấy "✅ Đã lưu" như bình thường, không hề hay biết cho tới khi xoá cache/đổi
  // máy mới phát hiện mất. Giờ đợi kết quả thật rồi mới báo thành công.
  const ok = await saveTogoSettingsLocal();
  if (ok) toast('✅ Đã lưu cài đặt tặng quà');
}

async function saveTgDisc() {
  const minQty = parseInt(document.getElementById('tg-disc-qty').value) || 0;
  const pct = parseInt(document.getElementById('tg-disc-pct').value) || 0;
  const maxAmt = parseInt(document.getElementById('tg-disc-max').value.replace(/[^0-9]/g,'')) || 0;
  if (!minQty || !pct) { toast('⚠ Nhập số ly điều kiện và % giảm'); return; }
  togoSettings.discount.minQty = minQty;
  togoSettings.discount.pct = pct;
  togoSettings.discount.maxAmt = maxAmt;
  const ok = await saveTogoSettingsLocal(); // [FIX] xem ghi chú ở saveTgGift()
  if (ok) toast('✅ Đã lưu cài đặt giảm giá');
}

async function toggleTgFreeTp() {
  togoSettings.freeTopping.enabled = !togoSettings.freeTopping.enabled;
  renderTgFreeTpToggle();
  await saveTogoSettingsLocal(); // [FIX] tự lưu ngay khi bấm — xem ghi chú ở toggleTgGift()
}

function renderTgFreeTpToggle() {
  const wrap = document.getElementById('tgFreeTpToggle');
  const status = document.getElementById('tgFreeTpStatus');
  if (wrap) { wrap.classList.toggle('active', togoSettings.freeTopping.enabled); }
  if (status) status.textContent = togoSettings.freeTopping.enabled ? 'Bật' : 'Tắt';
}

function renderTgFreeTpItemList() {
  const el = document.getElementById('tg-freetp-item-list');
  if (!el) return;
  // Danh sách món áp dụng lấy từ menu To Go
  const togoSrc = MENU_TOGO.length ? MENU_TOGO : MENU;
  if (!togoSrc.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;">Chưa có món nào. Thêm món trước.</div>'; return; }
  el.innerHTML = togoSrc.map(m => {
    const checked = togoSettings.freeTopping.itemIds.includes(m.id);
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;">
      <input type="checkbox" value="${m.id}" ${checked ? 'checked' : ''} onchange="onTgFreeTpItemChange(this)"
        style="width:18px;height:18px;cursor:pointer;accent-color:var(--gm);flex-shrink:0;">
      <span style="font-size:14px;font-weight:600;color:var(--td);">${m.name}</span>
    </label>`;
  }).join('');
}

function onTgFreeTpItemChange(cb) {
  if (cb.checked) { if (!togoSettings.freeTopping.itemIds.includes(cb.value)) togoSettings.freeTopping.itemIds.push(cb.value); }
  else { togoSettings.freeTopping.itemIds = togoSettings.freeTopping.itemIds.filter(id => id !== cb.value); }
}

function renderTgFreeTpToppingList() {
  const el = document.getElementById('tg-freetp-topping-list');
  if (!el) return;
  if (!TOPPINGS.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;">Chưa có topping nào. Thêm topping trong Quản lý Menu!</div>'; return; }
  el.innerHTML = TOPPINGS.map(t => {
    const checked = togoSettings.freeTopping.toppingIds.includes(t.id);
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;">
      <input type="checkbox" value="${t.id}" ${checked ? 'checked' : ''} onchange="onTgFreeTpToppingChange(this)"
        style="width:18px;height:18px;cursor:pointer;accent-color:var(--gm);flex-shrink:0;">
      <span style="font-size:14px;font-weight:600;color:var(--td);">${t.name}</span>
    </label>`;
  }).join('');
}

function onTgFreeTpToppingChange(cb) {
  if (cb.checked) { if (!togoSettings.freeTopping.toppingIds.includes(cb.value)) togoSettings.freeTopping.toppingIds.push(cb.value); }
  else { togoSettings.freeTopping.toppingIds = togoSettings.freeTopping.toppingIds.filter(id => id !== cb.value); }
}

async function saveTgFreeTp() {
  if (togoSettings.freeTopping.enabled) {
    if (!togoSettings.freeTopping.itemIds.length) { toast('⚠ Chọn ít nhất 1 món áp dụng'); return; }
    if (!togoSettings.freeTopping.toppingIds.length) { toast('⚠ Chọn ít nhất 1 loại topping'); return; }
  }
  const ok = await saveTogoSettingsLocal(); // [FIX] xem ghi chú ở saveTgGift()
  if (ok) toast('✅ Đã lưu cài đặt Free Topping');
}

// ============================================================
// FREE TOPPING CHO THÀNH VIÊN — logic áp dụng lúc thanh toán
// Popup 2 tầng:
//  - Tầng 1 (freeTpUnitsPopup): danh sách từng LY cần tặng topping (đã tách theo món)
//  - Tầng 2 (freeTpPopup): chọn topping cho 1 ly cụ thể (bấm vào ly ở tầng 1 để mở)
// Cho phép bấm lại vào ly đã chọn để đổi topping nếu bấm nhầm.
// ============================================================
let _freeTpUnits = [];

let _freeTpActiveKey = null;

let _freeTpSelectedId = null;

// Gọi ngay sau khi tra cứu khách hàng thành công (thành viên có SĐT, không phải khách vãng lai)
// Kiểm tra 1 món (theo itemId) có nằm trong danh sách áp dụng Free Topping hay không
// — dùng để hiện label tròn xanh lá nhắc nhân viên trong cart / minicart
function isFreeTpEligibleItem(itemId) {
  const cfg = togoSettings.freeTopping;
  return !!(cfg && cfg.enabled && cfg.itemIds && cfg.itemIds.includes(itemId));
}

// Hiện dòng nhắc nhân viên ở màn thanh toán:
// - Màu vàng: có món thuộc chương trình nhưng CHƯA xác định khách là thành viên
// - Màu xanh: khách đã là thành viên VÀ đã có topping được tặng trong giỏ [FIX-freeTp-appliedBadge]
function renderFreeTpReminder() {
  const el = document.getElementById('freeTpReminder');
  const iconEl = document.getElementById('freeTpReminderIcon');
  if (!el) return;
  const cfg = togoSettings.freeTopping;
  if (!cfg || !cfg.enabled) { el.style.display = 'none'; return; }

  // [FIX-freeTp-appliedBadge] Khách đã tra SĐT (curCustomer) và giỏ đã có topping tặng
  // → đổi hẳn sang thông báo xác nhận màu xanh, không còn hiện lời nhắc "hỏi khách" nữa.
  if (curCustomer) {
    if (cartHasFreeToppingApplied()) {
      const textEl = document.getElementById('freeTpReminderText');
      // [FIX] Trước đây chuỗi này mang sẵn '✅' trong khi ô icon bên trái cũng
      // được set '✅' → hiện ra hai dấu tick cạnh nhau. Chữ để chữ, icon để ô icon.
      if (textEl) textEl.textContent = 'Đã áp dụng chương trình tặng topping miễn phí';
      if (iconEl) iconEl.textContent = '✅';
      el.style.background = '#ecfdf5';
      el.style.borderColor = '#34d399';
      el.style.display = 'flex';
      const t = document.getElementById('freeTpReminderText');
      if (t) t.style.color = '#065f46';
    } else {
      el.style.display = 'none';
    }
    return;
  }

  if (!cfg.itemIds || !cfg.itemIds.length || !cfg.toppingIds || !cfg.toppingIds.length) { el.style.display = 'none'; return; }

  let qty = 0;
  Object.values(cart).forEach(c => {
    // [FIX-freeTp-lockGift] Đồng bộ điều kiện với checkFreeToppingMemberPromo: loại cả ly tặng _vKey
    if (c && c.itemId && cfg.itemIds.includes(c.itemId) && !c.isFree && !c._vKey && !c.freeTpApplied) qty += c.qty;
  });
  if (qty <= 0) { el.style.display = 'none'; return; }

  const textEl = document.getElementById('freeTpReminderText');
  if (textEl) { textEl.textContent = `Đang có ${qty} ly có thể tặng topping miễn phí nếu khách có SĐT tích điểm — nhớ hỏi khách nhé!`; textEl.style.color = '#92400e'; }
  if (iconEl) iconEl.textContent = '🎁';
  el.style.background = '#fff7e6';
  el.style.borderColor = '#fbbf24';
  el.style.display = 'flex';
}

// [FIX-freeTp-appliedBadge] / [FIX-freeTp-confirmBeforeClear] Có ly nào trong giỏ đang
// mang topping được tặng theo chương trình thành viên hay không.
function cartHasFreeToppingApplied() {
  return Object.values(cart).some(c => c && c.freeTpApplied === true);
}

function checkFreeToppingMemberPromo() {
  const cfg = togoSettings.freeTopping;
  if (!cfg || !cfg.enabled) return;
  if (!curCustomer) return; // không áp dụng cho khách vãng lai
  if (!cfg.itemIds || !cfg.itemIds.length) return;
  if (!cfg.toppingIds || !cfg.toppingIds.length) return;

  // Tìm các dòng trong giỏ thuộc danh sách món áp dụng, chưa được tặng topping
  // [FIX-freeTp-lockGift] Loại cả ly tặng từ mua-tặng (isFree) LẪN ly tặng từ tích điểm/stamp (_vKey)
  // — tránh 1 ly ăn 2 khuyến mãi (vừa là ly tặng, vừa được tặng thêm topping).
  const eligibleKeys = Object.keys(cart).filter(k => {
    const c = cart[k];
    return c && c.itemId && cfg.itemIds.includes(c.itemId) && !c.isFree && !c._vKey && !c.freeTpApplied;
  });
  if (!eligibleKeys.length) return;

  // Tách mỗi ly thành 1 dòng riêng để chọn topping riêng cho từng ly
  const unitKeys = [];
  eligibleKeys.forEach(k => { unitKeys.push(...splitCartEntryToUnits(k)); });
  if (!unitKeys.length) return;

  updCoTotal();
  openFreeTpUnitsPopup(unitKeys);
}

// Tách 1 dòng giỏ hàng có qty > 1 thành nhiều dòng qty = 1 (giữ nguyên topping đã có nếu có)
function splitCartEntryToUnits(key) {
  const c = cart[key];
  if (!c) return [];
  if (c.qty <= 1) return [key];
  const newKeys = [];
  delete cart[key];
  for (let i = 0; i < c.qty; i++) {
    const nk = key + '_u' + i + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    cart[nk] = { ...c, qty: 1, toppings: (c.toppings || []).map(t => ({ ...t })) };
    newKeys.push(nk);
  }
  return newKeys;
}

// ── Tầng 1: Popup danh sách các ly cần tặng topping ──
function openFreeTpUnitsPopup(newKeys) {
  (newKeys || []).forEach(k => { if (!_freeTpUnits.includes(k)) _freeTpUnits.push(k); });
  renderFreeTpUnitsPopup();
  document.getElementById('freeTpUnitsPopup').classList.add('show');
}

function renderFreeTpUnitsPopup() {
  // Bỏ những ly không còn trong giỏ (đã bị xoá thủ công)
  _freeTpUnits = _freeTpUnits.filter(k => !!cart[k]);
  const listEl = document.getElementById('freeTpUnitsList');
  const doneBtn = document.getElementById('freeTpUnitsDoneBtn');
  if (!listEl) return;

  if (!_freeTpUnits.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb;">Không còn ly nào cần chọn topping</div>';
    if (doneBtn) doneBtn.style.display = 'block';
    return;
  }

  // Đếm số ly theo từng tên món để đánh số "Ly 1/2", "Ly 2/2"...
  const nameTotal = {};
  _freeTpUnits.forEach(k => { const n = cart[k].name; nameTotal[n] = (nameTotal[n] || 0) + 1; });
  const nameSeen = {};

  listEl.innerHTML = _freeTpUnits.map(k => {
    const c = cart[k];
    const total = nameTotal[c.name];
    nameSeen[c.name] = (nameSeen[c.name] || 0) + 1;
    const label = total > 1 ? `${c.name} — Ly ${nameSeen[c.name]}/${total}` : c.name;
    const done = !!c.freeTpApplied;
    const statusText = done ? ('🎁 Đã chọn: ' + (c._freeTpName || '')) : 'Chưa chọn topping';
    return `<div onclick="openFreeTpUnitPicker('${k}')" style="background:${done ? 'var(--gl)' : '#fff'};border:2px solid ${done ? 'var(--gm)' : '#f0f0f0'};border-radius:18px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:10px;">
      <div style="min-width:0;flex:1;">
        <div style="font-size:16px;font-weight:800;color:var(--td);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
        <div style="font-size:12px;font-weight:600;color:${done ? 'var(--gd)' : '#999'};margin-top:3px;">${statusText}</div>
      </div>
      <span style="font-size:20px;flex-shrink:0;margin-left:8px;color:${done ? 'var(--gm)' : '#ccc'};">${done ? '✅' : '›'}</span>
    </div>`;
  }).join('');

  const allDone = _freeTpUnits.every(k => cart[k] && cart[k].freeTpApplied);
  if (doneBtn) doneBtn.style.display = allDone ? 'block' : 'none';
}

function closeFreeTpUnitsPopup() {
  document.getElementById('freeTpUnitsPopup').classList.remove('show');
}

function finishFreeTpUnits() {
  _freeTpUnits = [];
  closeFreeTpUnitsPopup();
  updCoTotal();
}

// ── Tầng 2: Popup chọn topping cho 1 ly cụ thể ──
function openFreeTpUnitPicker(key) {
  const c = cart[key];
  if (!c) { renderFreeTpUnitsPopup(); return; }
  _freeTpActiveKey = key;

  const cfg = togoSettings.freeTopping;
  const eligible = TOPPINGS.filter(t => cfg.toppingIds.includes(t.id));

  // Nếu ly này đã chọn topping trước đó → pre-select lại để nhân viên có thể đổi
  const existing = (c.toppings || []).find(t => t._freeTpMark);
  _freeTpSelectedId = existing ? existing._freeTpId : null;

  const subEl = document.getElementById('freeTpSub');
  if (subEl) subEl.textContent = _freeTpUnitLabel(key);

  const listEl = document.getElementById('freeTpList');
  if (!eligible.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb;">Chưa cấu hình topping khuyến mãi</div>';
  } else {
    listEl.innerHTML = eligible.map(t => {
      const sel = t.id === _freeTpSelectedId;
      return `<div class="togo-gift-item ${sel ? 'selected' : ''}" id="ftpi_${t.id}" onclick="selectFreeTopping('${t.id}')">
        <div style="width:36px;height:36px;border-radius:10px;background:#f59e0b;flex-shrink:0;"></div>
        <span class="togo-gift-name">${t.name}</span>
        <span class="togo-gift-size">Miễn phí</span>
      </div>`;
    }).join('');
  }
  document.getElementById('freeTpPopup').classList.add('show');
}

// Nhãn hiển thị "Tên món — Ly X/Y" dựa trên các ly cùng tên trong danh sách đang xử lý
function _freeTpUnitLabel(key) {
  const c = cart[key];
  if (!c) return '';
  const sameNameKeys = _freeTpUnits.filter(k => cart[k] && cart[k].name === c.name);
  if (sameNameKeys.length <= 1) return c.name;
  const idx = sameNameKeys.indexOf(key) + 1;
  return `${c.name} — Ly ${idx}/${sameNameKeys.length}`;
}

function closeFreeTpUnitPicker() {
  document.getElementById('freeTpPopup').classList.remove('show');
  _freeTpActiveKey = null;
}

function selectFreeTopping(toppingId) {
  document.querySelectorAll('#freeTpList .togo-gift-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('ftpi_' + toppingId);
  if (el) el.classList.add('selected');
  _freeTpSelectedId = toppingId;
}

function confirmFreeTopping() {
  if (!_freeTpSelectedId) { toast('⚠ Vui lòng chọn topping'); return; }
  const t = TOPPINGS.find(x => x.id === _freeTpSelectedId);
  const c = cart[_freeTpActiveKey];
  if (t && c) {
    // Xoá topping miễn phí cũ (nếu nhân viên đổi lựa chọn khác)
    c.toppings = (c.toppings || []).filter(x => !x._freeTpMark);
    c.toppings.push({ name: t.name + ' (Tặng)', price: 0, _freeTpMark: true, _freeTpId: t.id });
    c.freeTpApplied = true;
    c._freeTpName = t.name;
    toast(`🎁 Đã tặng topping ${t.name}`);
  }
  closeFreeTpUnitPicker();
  renderFreeTpUnitsPopup();
  updCoTotal();
}

function loadTgAdminUI() {
  // Fill inputs from stored settings
  const g = togoSettings.gift, d = togoSettings.discount;
  const buyEl = document.getElementById('tg-buy-qty');
  const freeEl = document.getElementById('tg-free-qty');
  const dQtyEl = document.getElementById('tg-disc-qty');
  const dPctEl = document.getElementById('tg-disc-pct');
  const dMaxEl = document.getElementById('tg-disc-max');
  // [FIX] Không ghi đè ô đang được focus (nhân viên đang gõ dở) — vì giờ bấm
  // toggle Bật/Tắt cũng tự lưu lên Firebase (xem toggleTgGift/Disc/FreeTp), việc
  // đó kích hoạt lại chính listener này và gọi loadTgAdminUI(), nếu không chặn sẽ
  // xoá mất số liệu đang gõ dở trong các ô số ly/% giảm.
  const active = document.activeElement;
  if (buyEl && active !== buyEl) buyEl.value = g.buyQty || '';
  if (freeEl && active !== freeEl) freeEl.value = g.freeQty || '';
  if (dQtyEl && active !== dQtyEl) dQtyEl.value = d.minQty || '';
  if (dPctEl && active !== dPctEl) dPctEl.value = d.pct || '';
  if (dMaxEl && active !== dMaxEl) dMaxEl.value = d.maxAmt ? d.maxAmt.toLocaleString('vi-VN') : '';
  const gm = togoSettings.giftMenu || {};
  const gMaxEl = document.getElementById('tg-gift-maxprice');
  const gCapEl = document.getElementById('tg-gift-capcheapest');
  if (gMaxEl && active !== gMaxEl) gMaxEl.value = gm.maxPrice || '';
  if (gCapEl) gCapEl.checked = gm.capByCheapest !== false; // mặc định BẬT
  renderTgGiftToggle();
  renderTgDiscToggle();
  renderTgGiftMenu();
  renderTgCategoryList();
  renderTgFreeTpToggle();
  renderTgFreeTpItemList();
  renderTgFreeTpToppingList();
}

// ============================================================
// TO GO — Checkout logic (check gift/discount before payment)
// ============================================================
function getCartTotalQty() {
  return Object.values(cart).reduce((a, b) => a + b.qty, 0);
}

// [KHUYẾN MÃI — ĐIỀU KIỆN SIZE] Số ly tính cho "Mua X tặng Y". gift.sizes rỗng / chưa khai = mọi size (y như trước:
// đếm cả giỏ). Có chọn size (vd ['L']) → chỉ đếm ly TRẢ TIỀN đúng size đó (không tính ly tặng, đồ ăn).
function giftEligibleQtyPOS() {
  const sizes = (togoSettings.gift && Array.isArray(togoSettings.gift.sizes)) ? togoSettings.gift.sizes : [];
  if (!sizes.length) return getCartTotalQty();
  return Object.values(cart).reduce((a, c) => a + (c && !c.isFree && !c.isFood && sizes.includes(c.size) ? (Number(c.qty) || 0) : 0), 0);
}

function giftSizeNotePOS() {
  const sizes = (togoSettings.gift && Array.isArray(togoSettings.gift.sizes)) ? togoSettings.gift.sizes : [];
  return sizes.length ? ' size ' + sizes.join('/') : '';
}

let togoDiscountAmt = 0;

function checkTogoBeforeCheckout(onProceed) {

  const totalQty = getCartTotalQty();
  const g = togoSettings.gift;
  const d = togoSettings.discount;

  // Kiểm tra xem trong giỏ đã có ly tặng chưa (tránh popup lại lần 2)
  const alreadyHasFreeItem = Object.values(cart).some(c => c.isFree === true);

  // Priority: check gift first
  // [FIX] Tặng theo BỘI SỐ. Trước đây chỉ xét `totalQty >= buyQty` rồi tặng đúng
  // freeQty một lần — khách mua 10 ly với luật "mua 5 tặng 1" vẫn chỉ được 1 ly,
  // mua 15 cũng vẫn 1 ly. Giờ mua 10 → 2 ly, mua 15 → 3 ly.
  // totalQty ở đây là số ly khách TRẢ TIỀN: nhánh này chỉ chạy khi giỏ chưa có ly
  // tặng nào (alreadyHasFreeItem), nên ly tặng không thể tự cộng vào để đẻ ra
  // lượt tặng tiếp theo.
  const giftQty = giftEligibleQtyPOS();   // chỉ ly đúng size điều kiện (nếu có khai)
  if (!alreadyHasFreeItem && g.enabled && g.buyQty > 0 && giftQty >= g.buyQty) {
    const soLuot = Math.floor(giftQty / g.buyQty);
    const tongTang = soLuot * (g.freeQty || 1);
    openTogoGiftPopup(tongTang, onProceed);
    return;
  }

  // Check discount
  if (d.enabled && d.minQty > 0 && totalQty >= d.minQty && d.pct > 0) {
    const total = getCartTotal();
    let disc = Math.round(total * d.pct / 100);
    if (d.maxAmt > 0) disc = Math.min(disc, d.maxAmt);
    togoDiscountAmt = disc;
    toast(`To Go: Giam ${fmt(disc)} (${d.pct}%)`);
    onProceed();
    return;
  }

  togoDiscountAmt = 0;
  onProceed();
}

// ============================================================
// MENU QUÀ TẶNG — bộ lọc DÙNG CHUNG cho mọi chương trình tặng ly
// (mua N tặng 1, đổi tem/voucher lấy ly miễn phí).
//
// Ba lớp chặn, áp dụng chồng lên nhau:
//   1. Danh sách món cụ thể (giftMenu.itemIds) — chốt chặn chính, do quán tự chọn
//   2. Trần giá (giftMenu.maxPrice)            — tiện khi menu đổi liên tục
//   3. Không đắt hơn ly rẻ nhất khách đã mua (capByCheapest) — lớp cuối, tự động,
//      vẫn đúng kể cả khi quên cập nhật hai lớp trên
//
// Chưa cấu hình gì thì mọi thứ mở như cũ — bật tính năng KHÔNG làm chương trình
// đang chạy đứt gãy giữa chừng.
// ============================================================
// Size sẽ tặng cho một món: ưu tiên M (size tiêu chuẩn của quán), món nào không
// có M thì lấy size RẺ NHẤT món đó có.
// [SỬA] Trước đây chương trình mua N tặng 1 chỉ nhận món CÓ size M và tặng cứng
// size M — món chỉ bán size L (hoặc "Chai", "Lớn"...) bị loại khỏi quà tặng dù
// giá hoàn toàn hợp lệ. Cái cần chặn là GIÁ, không phải tên size.
function giftSizeForPOS(m) {
  if (!m || !m.sizes || !m.sizes.length) return null;
  const sizeM = m.sizes.find(s => s.label === 'M');
  if (sizeM) return { label: sizeM.label, price: Number(sizeM.price) || 0 };
  const cheapest = m.sizes.reduce((a, b) => ((Number(b.price) || 0) < (Number(a.price) || 0) ? b : a), m.sizes[0]);
  return { label: cheapest.label, price: Number(cheapest.price) || 0 };
}

// Giá tham chiếu của một món để so với trần — chính là giá của size sẽ tặng.
function giftRefPricePOS(m) {
  const s = giftSizeForPOS(m);
  return s ? s.price : 0;
}

// Giá ly RẺ NHẤT khách thực sự bỏ tiền mua trong giỏ. Bỏ qua chính các ly tặng
// (isFree/_vKey) — nếu tính cả chúng thì giá rẻ nhất luôn là 0 và không ai được
// tặng gì nữa.
function cheapestPaidCupPOS() {
  const prices = Object.values(cart)
    .filter(c => c && !c.isFree && !c._vKey && Number(c.price) > 0)
    .map(c => Number(c.price));
  return prices.length ? Math.min(...prices) : 0;
}

// Lý do một món KHÔNG được tặng — trả về chuỗi để hiện cho nhân viên, null nếu được.
function giftBlockReasonPOS(m, price, stampCap) {
  const gm = togoSettings.giftMenu || {};
  const p = (typeof price === 'number') ? price : giftRefPricePOS(m);
  // [TRẦN LY TEM] Ly đổi 6 tem không được đắt hơn (trung bình giá 6 ly đã tích tem + 3K).
  if (Number(stampCap) > 0 && p > Number(stampCap)) return `Vượt trần ly tem ${fmt(Number(stampCap))}`;
  if (gm.itemIds && gm.itemIds.length && m && !gm.itemIds.includes(m.id)) return 'Không có trong menu quà tặng';
  const maxPrice = Number(gm.maxPrice) || 0;
  if (maxPrice > 0 && p > maxPrice) return `Vượt trần ${fmt(maxPrice)}`;
  if (gm.capByCheapest !== false) {
    const cheapest = cheapestPaidCupPOS();
    if (cheapest > 0 && p > cheapest) return `Đắt hơn ly rẻ nhất đã mua (${fmt(cheapest)})`;
  }
  return null;
}

function isGiftAllowedPOS(m, price) { return giftBlockReasonPOS(m, price) === null; }

// opts.stampVKey — nếu truyền vào, popup chạy ở chế độ ĐỔI TEM: ly thêm vào giỏ
// mang _vKey (ly đổi tem) thay vì isFree (ly mua-X-tặng-Y). Hai loại phải tách
// bạch vì isFree sẽ CHẶN tích tem cả bill, còn ly đổi tem thì không được chặn.
function openTogoGiftPopup(freeQty, onProceed, opts) {
  togoGiftSelected = null;
  const g = togoSettings.gift;
  const gm = togoSettings.giftMenu || {};
  const cats = g.categories;
  // Filter menu: món nào cũng nhận, size sẽ tặng xác định qua giftSizeForPOS()
  let eligible = getActiveMenu().filter(m => {
    // [SỬA] Không còn đòi món phải có size M — món nào có size là tặng được,
    // giá của size đó mới là thứ quyết định (xem giftBlockReasonPOS).
    if (!m.sizes || !m.sizes.length) return false;
    // Có danh sách món cụ thể → nó là chốt chặn chính, bỏ qua lọc theo danh mục.
    if (gm.itemIds && gm.itemIds.length) return gm.itemIds.includes(m.id);
    if (cats && cats.length > 0) return cats.includes(m.type);
    return true;
  });
  // Chặn tiếp bằng trần giá + "không đắt hơn ly rẻ nhất đã mua". Món bị chặn vẫn
  // HIỆN nhưng mờ và bấm không được, kèm lý do — để nhân viên giải thích được cho
  // khách vì sao món đó không tặng, thay vì món tự dưng biến mất khỏi danh sách.
  const stampCap = (opts && opts.stampCap) || 0;
  const rows = eligible.map(m => ({ m, size: giftSizeForPOS(m), reason: giftBlockReasonPOS(m, undefined, stampCap) }));
  const okCount = rows.filter(r => !r.reason).length;

  const listEl = document.getElementById('togoGiftList');
  const subEl = document.getElementById('togoGiftSub');
  subEl.textContent = `Bạn được tặng ${freeQty} ly miễn phí!` + (stampCap > 0 ? ` (tối đa ${fmt(stampCap)})` : '');

  if (!rows.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb;">Không có món phù hợp</div>';
  } else if (!okCount) {
    listEl.innerHTML = `<div style="text-align:center;padding:20px;color:#c0392b;font-size:13px;font-weight:700;">Không món nào trong menu quà tặng đủ điều kiện<div style="font-weight:400;color:#999;font-size:12px;margin-top:6px;">${rows[0].reason}</div></div>`;
  } else {
    listEl.innerHTML = rows.map(({ m, size, reason }) => `
      <div class="togo-gift-item${reason ? ' disabled' : ''}" id="tgi_${m.id}" ${reason ? '' : `onclick="selectTogoGift('${m.id}')"`}>
        <div style="width:36px;height:36px;border-radius:10px;background:${m.color||'#E23A5D'};flex-shrink:0;"></div>
        <span class="togo-gift-name">${m.name}</span>
        <span class="togo-gift-size">${reason ? reason : `Size ${size.label} · ${fmt(size.price)} → 0đ`}</span>
      </div>`).join('');
  }

  document.getElementById('togoGiftPopup').classList.add('show');
  // Store callback
  document.getElementById('togoGiftPopup')._onProceed = onProceed;
  document.getElementById('togoGiftPopup')._freeQty = freeQty;
  document.getElementById('togoGiftPopup')._opts = opts || null;
  // Nút thoát CHỈ hiện ở chế độ đổi tem: nhân viên có thể bấm nhầm "Đổi ngay",
  // phải có đường lui. Còn mua-X-tặng-Y thì khách đã đủ điều kiện rồi, popup đó
  // buộc chọn xong mới đi tiếp (giữ nguyên hành vi cũ).
  const cancelBtn = document.getElementById('togoGiftCancel');
  if (cancelBtn) cancelBtn.style.display = (opts && opts.stampVKey) ? 'block' : 'none';
}

function selectTogoGift(itemId) {
  document.querySelectorAll('.togo-gift-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('tgi_' + itemId);
  if (el) el.classList.add('selected');
  togoGiftSelected = itemId;
}

// Thoát popup mà không chọn gì — vẫn gọi onProceed để nơi gọi tự dọn intent
// (xoá _stampFreeVKey/_stampFreePhone), tránh để lại rác làm trừ tem oan ở
// lần thanh toán sau.
function cancelTogoGift() {
  const popup = document.getElementById('togoGiftPopup');
  const onProceed = popup._onProceed;
  togoGiftSelected = null;
  popup.classList.remove('show');
  if (onProceed) onProceed();
}

// Nhãn của bill cũ: mã này là khoá đổi tem, không phải tên chương trình.
function stampPromotionLabel(value){
  const label=String(value==null?'':value);
  return /^__free_stamp__\d+$/.test(label)?'Ly miễn phí (6 tem)':label;
}

function confirmTogoGift() {
  if (!togoGiftSelected) { toast('⚠ Vui lòng chọn món quà'); return; }
  const m = getActiveMenu().find(x => x.id === togoGiftSelected);
  // Kiểm tra LẠI ở đây chứ không tin vào việc nút đã bị vô hiệu trên giao diện:
  // giỏ hàng có thể vừa đổi (xoá bớt ly đắt) sau khi popup đã mở, làm điều kiện
  // "không đắt hơn ly rẻ nhất" khác đi.
  const popup = document.getElementById('togoGiftPopup');
  const reason = m ? giftBlockReasonPOS(m, undefined, (popup._opts && popup._opts.stampCap) || 0) : 'Món không còn trong menu';
  if (reason) { toast('⚠ Không tặng được món này: ' + reason); return; }
  const freeQty = popup._freeQty || 1;
  const onProceed = popup._onProceed;
  const opts = popup._opts || null;
  popup.classList.remove('show');

  if (m) {
    // [SỬA] Dùng đúng size đã xác định cho món này (M nếu có, không thì size rẻ
    // nhất) thay vì tìm cứng size M — món chỉ bán size L trước đây rơi hết vào
    // nhánh im lặng: popup đóng lại, không có ly nào được thêm, không báo gì.
    const gs = giftSizeForPOS(m);
    if (gs) {
      if (opts && opts.stampVKey) {
        // Chế độ ĐỔI TEM — ly mang _vKey, KHÔNG mang isFree.
        // Mỗi lượt đổi là 1 ly nên luôn qty:1; _originalPrice giữ giá gốc để
        // giỏ hàng hiện gạch ngang "35.000 → 0đ" cho khách thấy giá trị quà.
        const k = '__stampfree_' + opts.stampVKey;
        cart[k] = {
          itemId: m.id, name: m.name, size: gs.label, price: 0, qty: 1,
          _vKey: opts.stampVKey, _giftType: 'item_free', _giftLabel: 'Ly miễn phí (6 tem)', _originalPrice: gs.price
        };
        renderMenu(); renderCartDrawer(); updFooter();
        toast(`🎁 Đã đổi ly miễn phí: ${m.name} ${gs.label}`);
      } else {
        const k = m.id + '_' + gs.label + '_free';
        // Add free item(s) with price 0 vào cart
        if (cart[k]) cart[k].qty += freeQty;
        else cart[k] = { itemId: m.id, name: m.name + ' (Tặng)', size: gs.label, price: 0, qty: freeQty, isFree: true };
        // Cập nhật UI menu + cart drawer
        renderMenu();
        toast(`Đã thêm ${freeQty}x ${m.name} ${gs.label} miễn phí!`);
      }
    } else {
      toast('⚠ Món này chưa khai size nào — không tặng được');
    }
  }
  if (!(opts && opts.stampVKey)) togoDiscountAmt = 0; // đổi tem không đụng tới KM To Go
  if (onProceed) onProceed();
}

function getCartTotalWithDiscount() {
  return Math.max(0, getCartTotal() - togoDiscountAmt);
}

// Tổng thực tế khách phải trả (đã trừ khuyến mãi To Go + Bán qua App)
function getFinalTotal() {
  const togoDisc = togoDiscountAmt;
  const appDisc  = getAppSaleDiscount();
  return Math.max(0, getCartTotal() - togoDisc - appDisc);
}

function computeAllDiscounts() {
  return togoDiscountAmt + getAppSaleDiscount();
}

// ============================================================
// CHECKOUT — tổng & phương thức thanh toán
// ============================================================
function updCoTotal() {
  // KHÔNG reset discount ở đây — discount đã được tính từ onCheckoutClick
  const finalTotal = getFinalTotal();
  const base       = getCartTotal();
  const appDisc    = getAppSaleDiscount();
  const el         = document.getElementById('cotn');
  if (appDisc > 0) {
    el.innerHTML = `${fmt(finalTotal)} <span style="font-size:13px;background:#e3f2fd;color:#1565c0;border-radius:8px;padding:2px 8px;font-weight:700;">APP -${fmt(appDisc)}</span> <span style="font-size:14px;color:#e74c3c;font-weight:700;text-decoration:line-through;">${fmt(base)}</span>`;
  } else if (togoDiscountAmt > 0) {
    el.innerHTML = `${fmt(finalTotal)} <span style="font-size:14px;color:#e74c3c;font-weight:700;text-decoration:line-through;">${fmt(base)}</span>`;
  } else {
    el.textContent = fmt(finalTotal);
  }
  const cai = document.getElementById('cai');
  const cr  = document.getElementById('cr');
  if (cai) cai.value = '';
  if (cr)  cr.classList.remove('show');
  renderScCartPreview();
  renderFreeTpReminder();
}

function renderScCartPreview() {
  const el = document.getElementById('sc-cart-lines');
  if (!el) return;
  const items = Object.values(cart);
  if (!items.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;">Giỏ trống</div>'; return; }

  // [NEW-ICE] Nếu mọi đồ uống trong đơn cùng 1 mức đá → hiện 1 dòng nhãn chung
  // cho CẢ ĐƠN ở đầu danh sách, đỡ phải nhìn từng dòng khi tất cả đều giống nhau.
  const drinkItems = items.filter(c => !c.isFood);
  let orderIceHtml = '';
  if (drinkItems.length) {
    const modes = new Set(drinkItems.map(c => iceMode(c)));
    if (modes.size === 1) {
      const im = [...modes][0];
      const ist = iceChipStyle(im);
      orderIceHtml = `<div style="display:flex;align-items:center;gap:6px;padding:4px 0 8px;">
        <span style="font-size:11px;font-weight:700;color:var(--gt);">Đá cả đơn:</span>
        <span style="font-size:10px;font-weight:800;background:${ist.bg};color:${ist.fg};border-radius:4px;padding:2px 6px;">${ICE_ICONS[im]} ${ICE_LABELS[im]}</span>
      </div>`;
    }
  }

  el.innerHTML = orderIceHtml + items.map(c => {
    const dispPrice = c.price;
    const toppings = c.toppings || [];
    const toppingSum = tpSum(toppings);
    const lineTotal = (dispPrice + toppingSum) * c.qty;
    const isGifted  = !!c._vKey;
    const isFreeItem = c.isFree || (isGifted && c._giftType === 'item_free');

    // Giá hiển thị
    let priceHtml;
    if (isFreeItem) {
      const orig = c._originalPrice ? `<span style="text-decoration:line-through;color:#ccc;margin-right:3px;">${fmt((c._originalPrice + toppingSum) * c.qty)}</span>` : '';
      priceHtml = `${orig}<span style="color:var(--gm);font-weight:800;">0đ</span>`;
    } else if (isGifted && c._originalPrice !== undefined) {
      const orig = `<span style="text-decoration:line-through;color:#ccc;margin-right:3px;">${fmt((c._originalPrice + toppingSum) * c.qty)}</span>`;
      priceHtml = `${orig}<span style="color:var(--gm);font-weight:800;">${fmt(lineTotal)}</span>`;
    } else {
      priceHtml = `<span style="color:var(--td);font-weight:700;">${fmt(lineTotal)}</span>`;
    }

    // Badge
    let badge = '';
    if (isGifted) badge = `<span style="font-size:9px;font-weight:800;background:#fef9c3;color:#92400e;border-radius:4px;padding:1px 5px;flex-shrink:0;">🎁</span>`;
    // [NEW-ICE] nhãn lượng đá — chỉ hiện cho đồ uống (bỏ qua món ăn)
    let iceBadge = '';
    if (!c.isFood) {
      const im = iceMode(c);
      const ist = iceChipStyle(im);
      iceBadge = `<span style="font-size:9px;font-weight:800;background:${ist.bg};color:${ist.fg};border-radius:4px;padding:1px 5px;flex-shrink:0;white-space:nowrap;">${ICE_ICONS[im]} ${ICE_LABELS[im]}</span>`;
    }

    // Danh sách topping (kể cả topping khuyến mãi miễn phí)
    const toppingHtml = toppings.map(t => {
      const isFreeTp = t.price === 0;
      return `<div style="display:flex;align-items:center;gap:4px;padding-left:16px;">
        <span style="font-size:10px;color:${isFreeTp ? '#b45309' : 'var(--gt)'};font-weight:${isFreeTp ? 700 : 400};">+ ${tpLabel(t)}</span>
        ${t.price ? `<span style="font-size:10px;font-weight:700;color:var(--gt);">${fmt((Number(t.price)||0) * tpQty(t))}</span>` : `<span style="font-size:9px;font-weight:800;background:#fff3e0;color:#b45309;border-radius:4px;padding:0 4px;">0đ</span>`}
      </div>`;
    }).join('');

    return `<div style="padding:3px 0;border-bottom:1px solid #f3f4f6;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1;">
          <span style="font-size:11px;font-weight:700;color:var(--gt);flex-shrink:0;">${c.qty}×</span>
          <span style="font-size:12px;font-weight:600;color:var(--td);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</span>
          ${(!c.isFree && !isGifted && isFreeTpEligibleItem(c.itemId)) ? `<span title="Món có thể tặng topping cho thành viên" style="width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #dcfce7;flex-shrink:0;"></span>` : ''}
          ${c.size ? `<span style="font-size:9px;font-weight:700;color:var(--gt);background:#f0f0f0;border-radius:4px;padding:1px 4px;flex-shrink:0;">${c.size}</span>` : ''}
          ${badge}
          ${iceBadge}
        </div>
        <div style="font-size:12px;flex-shrink:0;white-space:nowrap;">${priceHtml}</div>
      </div>
      ${toppingHtml}
    </div>`;
  }).join('');
}

function selM(m) {
  curPay = m;
  document.getElementById('pmca').classList.toggle('sel', m === 'cash');
  document.getElementById('pmba').classList.toggle('sel', m === 'bank');
  document.getElementById('bank-confirm-area').style.display = 'none';
  // Bấm tiền mặt → vào màn hình nhập tiền ngay
  if (m === 'cash') {
    const items = Object.values(cart);
    if (!items.length) { toast('Giỏ hàng trống!'); return; }
    openCashScreen();
  }
  // Bấm chuyển khoản → hiện QR VietQR
  if (m === 'bank') {
    const items = Object.values(cart);
    if (!items.length) { toast('Giỏ hàng trống!'); return; }
    openVietQRPopup();
  }
}

// ============================================================
// VIETQR — Tạo QR chuyển khoản Cake
// ============================================================
const CAKE_ACCOUNT_NO = '0977570035';

const CAKE_ACCOUNT_NAME = 'NGUYEN HUYNH LONG';

function genBankOrderId() {
  const now = vnDate();
  const p = n => String(n).padStart(2, '0');
  // [CHANGED] Thêm giây (trước đây chỉ tới phút) — vì giờ "Tính riêng" có thể tạo
  // nhiều mã QR liên tiếp trong cùng 1 phút (mỗi khách trả 1 phần), nếu chỉ tính
  // tới phút sẽ dễ trùng mã orderId → ghi đè nhầm bank_confirmations của nhau.
  // [ĐA CỬA HÀNG] Quán khác GG01 chèn số quán ngay sau 'GG' (GG02ddMMHHmmss) — webhook ghi chung
  // bank_confirmations của cả 3 thương hiệu, mã không bao giờ trùng giữa các quán. GG01 giữ y như cũ.
  const quan = (window.GieoData && GieoData.daDangNhap() && !GieoData.laQuanCu()) ? GieoData.ckCode() : '';
  return 'GG' + quan + p(now.getDate()) + p(now.getMonth()+1) + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds());
}

let _vietqrOrderId = null;

// [NEW] Callback chạy khi 1 giao dịch CK được xác nhận (tự động qua Firebase hoặc
// nhân viên bấm tay). Cho phép dùng CHUNG popup QR cho cả bán thường lẫn Tính riêng
// mà không phải hard-code confirmPay() ở nhiều chỗ.
let _vietqrOnConfirm = null;

// [NEW] Đánh dấu popup đang phục vụ luồng nào, để closeVietQRPopup() biết cách dọn
// dẹp UI cho đúng ngữ cảnh (bán thường vs tính riêng).
let _vietqrMode = 'main';

function openVietQRPopup() {
  const total = getFinalTotal();
  if (total <= 0) { toast('Tổng tiền bằng 0!'); return; }

  _vietqrMode = 'main';
  _vietqrResetManualBox();
  // [CHANGED] Logic ghi bill giờ đặt trong callback, gọi từ submitManualBankConfirm()
  // hoặc từ listener khi Firebase báo đã nhận CK — dùng chung 1 chỗ, không lặp code.
  // [MỚI] data = null/{amount...} khi HỆ THỐNG tự nhận (bank_confirmations), hoặc
  // {manualConfirm:true, staffId, staffName} khi NHÂN VIÊN tự bấm xác nhận — quy rõ
  // trách nhiệm, gắn thẳng vào order để hiện trong chi tiết bill (xem confirmPay()).
  _vietqrOnConfirm = (data) => { curPay = 'bank'; _bankConfirmMeta = _bankConfirmMetaFromCallbackData(data); confirmPay(null, null); };

  _vietqrOrderId = genBankOrderId();
  const addInfo = encodeURIComponent('TTHD ' + _vietqrOrderId);
  const accountName = encodeURIComponent(CAKE_ACCOUNT_NAME);

  // Build VietQR URL
  const qrUrl = `https://img.vietqr.io/image/cake-${CAKE_ACCOUNT_NO}-compact2.png`
    + `?amount=${total}`
    + `&addInfo=${addInfo}`
    + `&accountName=${accountName}`;

  // Set QR image
  const img = document.getElementById('vietqr-img');
  const fallback = document.getElementById('vietqr-fallback');
  img.style.display = 'block';
  fallback.style.display = 'none';
  img.src = qrUrl;

  // Set display info
  document.getElementById('vietqr-amount').textContent = total.toLocaleString('vi-VN') + 'đ';
  document.getElementById('vietqr-addinfo').textContent = 'TTHD ' + _vietqrOrderId;

  document.getElementById('vietqr-popup').style.display = 'flex';


  // Bắt đầu lắng nghe xác nhận từ Firebase
  startBankListener(_vietqrOrderId);
}

function closeVietQRPopup() {
  document.getElementById('vietqr-popup').style.display = 'none';
  stopBankListener(_bankListenerOrderId);
  // [CHANGED] Dọn dẹp khác nhau tuỳ ngữ cảnh: bán thường thì reset lại nút chọn
  // phương thức thanh toán; tính riêng thì không đụng gì (đang ở màn 'sp').
  if (_vietqrMode === 'main') {
    curPay = null;
    document.getElementById('pmba').classList.remove('sel');
  }
  _vietqrOnConfirm = null;
  _vietqrResetManualBox();
}

// [MỚI] Chuẩn hoá metadata "ai/cách nào đã xác nhận CK" từ dữ liệu callback, dùng
// chung cho cả bán thường (confirmPay) và Tính riêng (markSpSelectedPaid) — một nơi
// quyết định, tránh 2 chỗ tự suy luận khác nhau rồi lệch nhau.
function _bankConfirmMetaFromCallbackData(data) {
  if (data && data.manualConfirm) {
    return { bankConfirmMethod: 'manual_staff', bankConfirmedBy: data.staffName || '', bankConfirmedById: data.staffId || '' };
  }
  return { bankConfirmMethod: 'auto' };
}

let _bankConfirmMeta = null;

// [MỚI] Badge "xác nhận thủ công" trong Chi tiết bill — chỉ hiện khi CÓ người tự
// bấm (bankConfirmMethod:'manual_staff'); hệ thống tự nhận (mặc định/'auto') thì
// không hiện gì thêm, giữ nguyên giao diện cũ đúng yêu cầu.
function _bankConfirmBadgeHTML(obj, compact) {
  if (!obj || obj.bankConfirmMethod !== 'manual_staff') return '';
  const who = escHtmlPos(obj.bankConfirmedBy || '(không rõ)');
  return compact
    ? ` · <span style="font-size:10.5px;font-weight:800;background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 7px;">⚠️ NV tự xác nhận: ${who}</span>`
    : `<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;padding:8px 14px;margin-bottom:20px;display:inline-flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">⚠️</span>
        <span style="font-size:13px;font-weight:700;color:#92400e;">Xác nhận THỦ CÔNG bởi ${who} — không phải hệ thống tự nhận</span>
      </div>`;
}

// Bấm "ĐÃ CHUYỂN KHOẢN XONG": KHÔNG xác nhận ngay — trước đây bấm phát là xong, không
// ai biết có đúng nhân viên đã kiểm tra tài khoản hay chưa. Giờ bắt buộc thêm 1 bước
// PIN để quy trách nhiệm rõ ràng (đúng SOP: chỉ bấm khi đã thực sự thấy tiền vào).
function openManualBankConfirm() {
  const btn = document.getElementById('vietqrManualBtn');
  const box = document.getElementById('vietqrManualConfirmBox');
  if (!box) return;
  if (btn) btn.style.display = 'none';
  box.style.display = 'block';
  document.getElementById('vqrManualPinWrap').innerHTML = renderPinInput('vqrManualPin', 'Mã nhân viên xác nhận đã nhận tiền (PIN 4 số)');
}

function cancelManualBankConfirm() {
  _vietqrResetManualBox();
}

function _vietqrResetManualBox() {
  const btn = document.getElementById('vietqrManualBtn');
  const box = document.getElementById('vietqrManualConfirmBox');
  if (btn) btn.style.display = '';
  if (box) { box.style.display = 'none'; document.getElementById('vqrManualPinWrap').innerHTML = ''; }
}

async function submitManualBankConfirm() {
  const staffEmp = await resolveStaffPinAndCheckin('vqrManualPin');
  if (!staffEmp) return;
  // Nhân viên bấm thủ công khi hệ thống chưa tự nhận — chạy đúng callback của
  // ngữ cảnh hiện tại (ghi bill thường, hoặc đánh dấu đã trả cho nhóm Tính riêng),
  // kèm rõ AI vừa tự xác nhận để quy trách nhiệm nếu tiền thực ra chưa vào.
  document.getElementById('vietqr-popup').style.display = 'none';
  stopBankListener(_bankListenerOrderId);
  toast('✅ Đã xác nhận thủ công — đang xử lý...');
  const cb = _vietqrOnConfirm;
  _vietqrOnConfirm = null;
  if (typeof cb === 'function') cb({ manualConfirm: true, staffId: staffEmp.id, staffName: staffEmp.fullName });
}

// ============================================================
// BANK LISTENER — Lắng nghe xác nhận CK từ Firebase
// ============================================================
let _bankListener = null;

let _bankListenerOrderId = null;

function startBankListener(orderId) {
  stopBankListener(_bankListenerOrderId);
  _bankListenerOrderId = orderId;
  const ref = db.ref('bank_confirmations/' + orderId);

  _bankListener = ref.on('value', snap => {
    if (!snap.exists()) return;
    const data = snap.val();
    console.log('✅ Nhận xác nhận CK từ Firebase:', data);

    stopBankListener(orderId);

    // Đóng QR popup
    document.getElementById('vietqr-popup').style.display = 'none';

    // Tự động hoàn tất — không cần nhân viên bấm thêm. Dùng đúng callback của
    // ngữ cảnh hiện tại (bán thường → ghi bill; tính riêng → đánh dấu nhóm đã trả).
    const amt = data.amount ? data.amount.toLocaleString('vi-VN') + 'đ' : '';
    toast('💸 Đã nhận ' + (amt || 'chuyển khoản') + ' — đang xử lý...');
    const cb = _vietqrOnConfirm;
    _vietqrOnConfirm = null;
    if (typeof cb === 'function') cb(data);

    // [FIX-rtdb-phinh] DỌN bản ghi xác nhận sau khi đã dùng xong.
    //
    // bank_confirmations là một cái BẮT TAY DÙNG MỘT LẦN: webhook ngân hàng ghi vào,
    // POS đọc để tự hoàn tất bill, xong là hết giá trị. Nhưng trước đây không có chỗ
    // nào xoá — stopBankListener() chỉ gỡ listener chứ không đụng tới dữ liệu. Node
    // này lại PHẲNG (mỗi lượt chuyển khoản một con trực tiếp), nên cứ khoảng 12 đơn
    // CK mỗi ngày là một năm hơn 4.000 con dưới cùng một key. Đó chính là hình dạng
    // làm trình xem dữ liệu của Firebase console phải chuyển sang chế độ chỉ đọc.
    //
    // Xoá SAU khi cb() đã chạy: tiền đã vào tài khoản rồi, còn bill thì nhân viên
    // luôn xác nhận tay được nếu có trục trặc — nên mất bản ghi này không hại gì.
    // Bản ghi của những lượt không ai nghe (khách chuyển muộn, đã đóng popup) vẫn
    // nằm lại; dọn bằng màn "Dọn dữ liệu cũ" bên app Quản lý.
    db.ref('bank_confirmations/' + orderId).remove()
      .catch(e => console.warn('[bank] không xoá được xác nhận ' + orderId, e));
  });
}

function stopBankListener(orderId) {
  if (orderId && _bankListener) {
    db.ref('bank_confirmations/' + orderId).off('value', _bankListener);
  }
  _bankListener = null;
  _bankListenerOrderId = null;
}

function calcChange() {
  const total = getCartTotal(), given = parseInt(document.getElementById('cai').value) || 0, cr = document.getElementById('cr');
  if (given > 0) { document.getElementById('crv').textContent = given >= total ? fmt(given - total) : '⚠ Thiếu ' + fmt(total - given); cr.classList.add('show'); }
  else cr.classList.remove('show');
}

// ============================================================
// CASH PAYMENT SCREEN
// ============================================================
function proceedPay() {
  const items = Object.values(cart);
  if (!items.length) { toast('Giỏ hàng trống!'); return; }
  confirmPay(null, null);
}

// [CHANGED] resetPayMethod() TRƯỚC ĐÂY nằm lẫn trong khối Wallet ở cuối file (chú
// thích cũ: "moved to Wallet section below") dù nó là hàm DÙNG CHUNG của luồng
// thanh toán chính, không phải hàm của ví. Khi gỡ ví đã suýt xoá nhầm luôn nó.
// Chuyển về đúng chỗ này và bỏ đoạn xử lý nút "Ví khách" (pmwa) đã gỡ.
function resetPayMethod() {
  curPay = null;
  document.getElementById('pmca').classList.remove('sel');
  document.getElementById('pmba').classList.remove('sel');
  document.getElementById('bank-confirm-area').style.display = 'none';
}

function openCashScreen() {
  const allDisc = computeAllDiscounts();
  let total = getFinalTotal();

  // Làm tròn tiền mặt khi bán qua App
  if (isAppSale) {
    total = roundCashAmount(total);
  }

  document.getElementById('cp-total-amt').textContent = total.toLocaleString('vi-VN');

  // [FIX-cash-suggest-logic] Gợi ý theo cách khách thật sự trả tiền (xem buildSuggestions)
  const suggestions = buildSuggestions(total);
  document.getElementById('cp-suggest-grid').innerHTML = suggestions.map(s => {
    const label = s >= 1000000
      ? (s / 1000000 % 1 === 0 ? s/1000000 + 'M' : (s/1000000).toFixed(1) + 'M')
      : (s % 1000 === 0 ? s/1000 + 'k' : s.toLocaleString('vi-VN'));
    return `<button class="cp-suggest-btn" onclick="selectSuggest(${s})">${label}</button>`;
  }).join('');

  // Điền sẵn đúng bằng tổng bill, không highlight gợi ý nào
  const inp = document.getElementById('cp-input');
  inp.value = total.toLocaleString('vi-VN');
  updCpChange();
  showScreen('cp');
}

// [FIX-cash-suggest-logic] Toàn bộ mệnh giá tiền mặt VN đang lưu hành, từ nhỏ -> lớn
const VN_NOTES = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];

// Logic gợi ý MỚI: thay vì cộng máy móc total + d (ra số tiền khách không đời nào
// cầm sẵn, VD bill 97.000đ -> gợi ý 102.000đ), giờ gợi ý theo đúng cách khách thật
// sự trả tiền:
//   1) Nếu bill nhỏ hơn 1 tờ tiền cụ thể -> khách hay đưa nguyên tờ đó (vd bill 8.000đ
//      -> khách đưa tờ 10k/20k/50k...), nên liệt kê thẳng các tờ >= bill.
//   2) Với bill lớn hơn, khách thường đưa 1 xấp tiền gộp thành số tròn -> gợi ý "làm
//      tròn lên" tới bội số gần nhất của từng mệnh giá lớn (10k/20k/50k/100k/200k/500k),
//      bỏ qua mệnh giá quá nhỏ hoặc quá lớn so với bill để tránh gợi ý vô nghĩa.
// Luôn tối đa 6 gợi ý, sắp xếp tăng dần, không trùng nhau.
function buildSuggestions(total) {
  if (!total || total <= 0) return [];
  const results = new Set();

  // 1) Các tờ tiền lớn hơn hoặc bằng bill -> khách có thể đưa thẳng, không cần thối nhiều
  VN_NOTES.forEach(n => { if (n >= total) results.add(n); });

  // 2) Làm tròn lên theo các mốc tiền phổ biến khi khách gộp nhiều tờ lại
  [10000, 20000, 50000, 100000, 200000, 500000].forEach(step => {
    if (total < step * 0.5) return;   // bill quá nhỏ so với mốc này -> không thực tế (vd bill 30k mà làm tròn theo 500k)
    if (step < total / 40) return;    // mốc quá nhỏ so với bill lớn -> bỏ, tránh dày đặc gợi ý lẻ tẻ
    let rounded = Math.ceil(total / step) * step;
    if (rounded <= total) rounded += step; // đảm bảo luôn có tiền thừa thực tế, không gợi ý trùng "đưa đủ"
    results.add(rounded);
  });

  return [...results].filter(v => v >= total).sort((a, b) => a - b).slice(0, 6);
}

function selectSuggest(amt) {
  document.getElementById('cp-input').value = amt.toLocaleString('vi-VN');
  markActiveSuggest(amt);
  updCpChange();
}

function markActiveSuggest(amt) {
  document.querySelectorAll('.cp-suggest-btn').forEach(b => {
    const v = parseInt(b.textContent.replace(/[^0-9]/g, ''));
    b.classList.toggle('active-sug', v === amt);
  });
}

function onCpInput(el) {
  // Chỉ giữ số
  const raw = el.value.replace(/[^0-9]/g, '');
  const num = parseInt(raw) || 0;
  // Format dấu phẩy (toLocaleString vi-VN dùng dấu chấm, nhưng ta dùng dấu phẩy cho dễ nhìn)
  el.value = num > 0 ? num.toLocaleString('vi-VN') : '';
  markActiveSuggest(num);
  updCpChange();
}

function getCpInputVal() {
  const raw = document.getElementById('cp-input').value.replace(/[^0-9]/g, '');
  return parseInt(raw) || 0;
}

function updCpChange() {
  let total = getFinalTotal();
  if (isAppSale) total = roundCashAmount(total);
  const given = getCpInputVal();
  const changeCard = document.getElementById('cp-change-card');
  const changeAmt = document.getElementById('cp-change-amt');
  const changeLabel = document.getElementById('cp-change-label');
  const iconBg = document.getElementById('cp-change-icon-bg');
  const iconFg = document.getElementById('cp-change-icon-fg');
  const btn = document.getElementById('cp-confirm-btn');

  const paid = given > 0 ? given : total;
  const change = Math.max(0, paid - total);


  if (given <= 0) {
    changeCard.style.display = 'none';
    btn.disabled = false;
    return;
  }
  changeCard.style.display = 'flex';
  const diff = given - total;
  // [FIX-cash-changeCard-contrast] Đổi hẳn class trạng thái (nền + viền + icon) thay vì chỉ đổi màu chữ,
  // để ô "Tiền thừa/Thiếu" luôn nổi bật rõ ràng, không lẫn vào nền app.
  if (diff >= 0) {
    changeLabel.textContent = 'TIỀN THỪA';
    changeAmt.textContent = diff.toLocaleString('vi-VN') + 'đ';
    changeCard.classList.remove('cp-cc-bad');
    changeCard.classList.add('cp-cc-ok');
    if (iconBg) iconBg.setAttribute('fill', '#bbf7d0');
    if (iconFg) iconFg.setAttribute('stroke', '#15803d');
    btn.disabled = false;
  } else {
    changeLabel.textContent = 'THIẾU';
    changeAmt.textContent = '⚠ ' + Math.abs(diff).toLocaleString('vi-VN') + 'đ';
    changeCard.classList.remove('cp-cc-ok');
    changeCard.classList.add('cp-cc-bad');
    if (iconBg) iconBg.setAttribute('fill', '#fecaca');
    if (iconFg) iconFg.setAttribute('stroke', '#dc2626');
    btn.disabled = false;
  }
}

function confirmCashPay() {
  let total = getFinalTotal();
  if (isAppSale) total = roundCashAmount(total);
  const given = getCpInputVal();
  const change = given - total;
  const cashGiven = given > 0 ? given : total;
  const cashChange = change >= 0 ? change : 0;
  confirmPay(cashGiven, cashChange);
}

// ============================================================
// 2. NHÁNH ORDER — Ghi đơn hàng vào RT theo tháng/ngày
// ============================================================
async function confirmPay(cashGiven, cashChange) {
  // [NEW mục 2.5] Chặn KỸ THUẬT bắt buộc — đây là 1 trong 3 nơi duy nhất tạo
  // bill (.push(order)), phải chặn ở đây dù đã chặn sớm ở onCheckoutClick,
  // vì nhân viên có thể đang đứng sẵn ở màn thanh toán từ trước lúc đóng ngày.
  // [MỚI] "Bổ sung bill thiếu" (xem _backfillMode) cố tình tạo bill SAU KHI ngày đó đã kết ca —
  // đây chính xác là tình huống _isDayClosedToday chặn, nên phải bỏ qua đúng cổng này. Cũng bỏ
  // qua check-in: ca hôm đó đã kết ca nên không còn ai "đang check-in" nữa, và mã 8833 đã tự là
  // một lớp xác thực riêng cho thao tác ngoại lệ này. Cổng mở ca/đầu ca vẫn giữ nguyên.
  if (_isDayClosedToday && !_backfillMode) { toast('🚫 Ngày hôm nay đã đóng ca — không thể tạo bill mới'); return; }
  if (!requireShiftOpened()) return; // [NEW] chặn kỹ thuật: chưa mở ca thì không được ghi bill
  if (!requireOpeningChecklistDone()) return; // [GĐ5] chặn kỹ thuật: việc đầu ca bắt buộc chưa xong
  if (!_backfillMode && !requireSomeoneCheckedIn()) return; // [NEW] chặn kỹ thuật: chưa ai check-in thì không được ghi bill
  const items = Object.values(cart);
  if (!items.length) { toast('Giỏ hàng trống!'); return; }

  const baseTotal = getCartTotal();
  const allDisc   = computeAllDiscounts();
  let total     = getFinalTotal();
  // Làm tròn tiền mặt khi bán qua App
  if (isAppSale && curPay === 'cash') total = roundCashAmount(total);
  // [MỚI] Bổ sung bill thiếu: mọi mốc THỜI GIAN TRÊN BILL (giờ, ngày, đường dẫn RTDB, mã bill)
  // dùng NGÀY LÙI VỀ businessDate đã chọn — nhưng `realNow` (thời điểm nhập THẬT) vẫn được giữ
  // riêng cho `createdAt`/`backfilledAt` để không mất dấu vết audit "ai bấm lúc nào".
  const realNow = vnDate();
  const now = _backfillMode ? vnDate(_backfillMode.businessDate + 'T12:00:00') : realNow;
  const p = n => String(n).padStart(2, '0');

  const month = MONTH_KEYS[now.getMonth()];
  const day   = p(now.getDate());

  const itemsArray    = items.map(c => ({ ...c }));
  const itemsSummary  = items.map(c => `${c.name}(${c.size})x${c.qty}`).join(', ');

  const foodItems = items.filter(c => c.isFood === true);
  const foodTotal = foodItems.reduce((s, c) => s + c.price * c.qty, 0);
  const netTotal  = total - foodTotal;

  // Nếu đang là split bill ví cơ bản: method = combo
  // [CHANGED] Đã gỡ ví: trước đây method có thể là "VÍ CƠ BẢN + TIỀN MẶT/CHUYỂN
  // KHOẢN" khi khách trả một phần bằng ví. Giờ chỉ còn 2 phương thức gốc.
  const splitMethod = (curPay === 'cash' ? 'TIỀN MẶT' : 'CHUYỂN KHOẢN');
  // [MỚI] "Ai/cách nào xác nhận CK" — đọc 1 lần rồi xoá ngay, tránh lỡ dính vào
  // lượt bán tiếp theo nếu vì lý do gì đó không được set lại. Chỉ có ý nghĩa với
  // bill CHUYỂN KHOẢN — bill tiền mặt không đụng tới field này.
  const bankConfirmMeta = curPay === 'bank' ? (_bankConfirmMeta || { bankConfirmMethod: 'auto' }) : null;
  _bankConfirmMeta = null;

  const order = {
    // [MỚI] Bổ sung bill thiếu: giờ hiển thị trên bill là giờ NHẬP THẬT (realNow) dù ngày đã lùi
    // về businessDate — cho biết đúng "khi nào nhân viên thực sự bấm", không phải 12:00 giả.
    time: `${p(realNow.getHours())}:${p(realNow.getMinutes())}`,
    date: `${day}/${p(now.getMonth()+1)}/${now.getFullYear()}`,
    items: itemsSummary,
    itemsArray,
    total,                                    // số tiền thực khách trả cuối cùng (sau -50%)
    netTotal: foodTotal > 0 ? netTotal : null,
    foodTotal: foodTotal > 0 ? foodTotal : null,
    foodItems: foodTotal > 0 ? foodItems.map(c => ({ name: c.name, qty: c.qty, price: c.price })) : null,
    foodMethod: foodTotal > 0 ? splitMethod : null,
    method: splitMethod,
    ...(bankConfirmMeta || {}),
    phone: document.getElementById('cuph').value || '',
    customerName: (curCustomer && curCustomer.name) || '',
    voucherUsed: _stampFreeVKey
      ? (Object.values(cart).find(c=>c._vKey===_stampFreeVKey)?._giftLabel || 'Ly miễn phí (6 tem)')
      : null,
    cashGiven: cashGiven !== null && cashGiven !== undefined ? cashGiven : total,
    cashChange: cashChange !== null && cashChange !== undefined ? cashChange : 0,
    // [NEW] Lưu lại mã chuyển khoản (TTHD ...) của đơn — trước đây mã này chỉ tồn
    // tại tạm trong popup QR lúc thanh toán rồi mất, không rà soát lại được.
    bankOrderId: curPay === 'bank' ? _vietqrOrderId : null,
    // [MỚI] createdAt LUÔN là thời điểm ghi THẬT (realNow) — mốc audit "ai bấm lúc nào", tách
    // biệt hẳn khỏi `date`/`time` (ngày kinh doanh hiển thị, có thể đã lùi khi bổ sung bill).
    createdAt: realNow.toISOString(),
    ...(_backfillMode ? {
      backfilled: true,
      backfillMode: _backfillMode.skipConsumption ? 'before_close' : 'after_close',
      backfillCashTiming: _backfillMode.cashTiming || 'after_close',
      backfilledAt: realNow.toISOString()
    } : {}),
    isToGo: true,   // [F5] field giữ cho màn đọc bill cũ/Quản lý
    isShip: isShip ? true : null,
    isAppSale: isAppSale,
    appFeePct: isAppSale ? (appSaleSettings.feePct || 10) : null,
    discountAmt: (togoDiscountAmt > 0 || getAppSaleDiscount() > 0)
      ? (togoDiscountAmt + getAppSaleDiscount()) : null
  };

  // [FIX] Chống double-submit: cơ chế _posSubmitBusy đã được dùng cẩn thận ở 10+
  // hàm back-office (kho, chi phí, ca làm việc) nhưng lại THIẾU ở đúng 3 nơi tạo
  // bill. Mạng chậm + nhân viên bấm "Xác nhận" 2 lần = 2 bill trùng, mỗi bill 1 mã
  // riêng nên không có gì phát hiện được sau đó.
  // Đặt khoá SÁT lệnh ghi (không đặt đầu hàm) để mọi nhánh `return` phía trên
  // không làm kẹt khoá vĩnh viễn khiến app không bán được nữa.
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;

  // [FIX duplicate bill] Phòng vệ: bình thường onCheckoutClick() đã sinh idemKey trước khi vào
  // được màn thanh toán, nhưng vẫn tự sinh nếu vì lý do gì đó chưa có (hàm này còn được gọi
  // thẳng từ VietQR callback) — vẫn tốt hơn để trống và rơi về .push() ngẫu nhiên như cũ.
  if (!_checkoutIdemKey) { _checkoutIdemKey = 'bill_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10); _persistPendingCheckout(_cartSignature(items)); }
  const billRef = db.ref('orders_gieogieo/' + month + '/' + day).child(_checkoutIdemKey);

  try {
    // [FIX duplicate bill] Dùng KEY CỐ ĐỊNH (idemKey) thay cho .push() ngẫu nhiên — kiểm tra
    // trước xem bill này ĐÃ được ghi ở lượt bấm trước hay chưa (server đã commit thật, client chỉ
    // mất ACK). Nếu đã có: KHÔNG ghi lại (billCode/billSeq cũ giữ nguyên, không sinh mã mới đè
    // lên), chỉ chạy tiếp phần theo sau (GOGS/in/tích điểm) — phần đó CHƯA CHẮC đã chạy ở lượt
    // trước vì .then() nội bộ chưa từng fire trên máy này nếu mất ACK ngay sau khi ghi.
    const existingSnap = await billRef.once('value');
    const isNewBill = !existingSnap.exists();
    if (!isNewBill) {
      Object.assign(order, existingSnap.val());
    } else {
      const { seq, billCode } = await getNextBillCode(now);
      order.billCode = billCode;
      order.billSeq = seq;
      await billRef.set(order);
    }
    // KHÔNG thêm thủ công vào orders[] — RT listener child_added tự xử lý (có guard duplicate).

    // Giai đoạn 4 — tự động trừ kho theo GOGS (recipes_gieogieo), không chặn luồng thanh toán.
    // [MỚI] Bổ sung bill thiếu: "trước kết ca" ghi sổ đúng ngày nhưng KHÔNG đụng tồn kho hiện
    // tại; mọi trường hợp khác (bán thật, hoặc "sau kết ca") đều trừ tồn hiện tại như cũ, chỉ
    // khác chỗ businessDate trên ledger có thể bị lùi về ngày đã chọn.
    // [FIX duplicate bill] applyStockTransactionPOS/applyPrepConsumptionPOS giờ nhận txId suy từ
    // billRef.key — gọi lại hàm này trên 1 bill ĐÃ tồn tại (nhánh existingSnap ở trên) vẫn an
    // toàn, tự nhận ra đã trừ kho rồi, không trừ đúp. Gọi lại KHÔNG ĐIỀU KIỆN (không gate theo
    // sideEffectsDone bên dưới) vì bản thân nó đã tự idempotent qua txId.
    if (_backfillMode) recordBackfillCashPOS(order, billRef.key, _backfillMode);
    trackConsumptionPOS(billRef.key, (_backfillMode && _backfillMode.skipConsumption)
      ? applyBackfillConsumptionNoStockEffect(order, billRef.key, _backfillMode.businessDate)
      : applySalesConsumptionPOS(order, billRef.key, _backfillMode ? _backfillMode.businessDate : undefined));

    // [BUG#20 FIX — thay cờ sideEffectsDone đọc-rồi-ghi KHÔNG NGUYÊN TỬ bằng CLAIM thật sự] Bản
    // trước chỉ đọc `existingSnap.val().sideEffectsDone` một lần rồi quyết định chạy hay không —
    // 2 lượt (2 máy, hoặc 2 callback) đọc gần như đồng thời đều thấy chưa xong nên cùng chạy loyalty/
    // voucher/in/mở két, mỗi thứ chạy đúp. Giờ dùng `_ueClaimCheckoutSideEffects()` (transaction
    // nguyên tử) — chỉ lượt THẮNG claim mới chạy khối bên dưới.
    const _seClaim = await _ueClaimCheckoutSideEffects(billRef.key);
    if (_seClaim.shouldRun) {
      // [NEW-ASSIST] Chốt sổ Trợ lý bán hàng cho đơn vừa ghi: ghi nhật ký hiệu quả
      // của mọi gợi ý đã hiện trong đơn này, và cộng dồn hồ sơ thói quen của khách
      // (đá/size/topping/món hay mua) để lần sau gợi ý đúng hơn. Hàm tự nuốt mọi
      // lỗi — KHÔNG được phép làm hỏng luồng thanh toán vì một bản ghi thống kê.
      // [BUG#21 nhóm — FIX] Cả 2 hàm bên trong giờ tự idempotent theo billId (xem
      // assistFinalizeOrder/assistUpdateCustomerProfile) — claim ở trên là lớp phòng thủ đầu,
      // idempotency riêng trong hàm là lớp phòng thủ thứ hai nếu claim từng bị giành lại sau khi
      // "hết hạn" (_CHECKOUT_SIDE_EFFECTS_STALE_MS) trong khi thật ra lượt trước đã chạy xong.
      assistFinalizeOrder(order, billRef.key);

      // In bill tự động (nếu bật + máy in đang kết nối) — không chặn luồng, lỗi chỉ toast nhẹ
      POSPrinter.autoPrintIfEnabled(order);
      POSTemPrinter.printOrderLabels(order); // in tem (nếu đã bật) — qua cầu nối LAN, KHÔNG chặn luồng thanh toán
      // Mở két — CHỈ khi đơn có phần tiền mặt (orderCashAmountPOS đã tự xử lý cả
      // trường hợp Tính riêng, cộng đúng nhóm trả tiền mặt). Chuyển khoản 100%
      // thì không có gì để thối/cất, mở két lúc đó chỉ vô duyên trước mặt khách.
      if (orderCashAmountPOS(order) > 0) POSPrinter.openCashDrawerIfConnected();

      const loyPhone = document.getElementById('cuph').value.trim();
      if (loyPhone) {
        // [FIX] Bill đã hưởng "mua X tặng Y" thì KHÔNG tích tem nữa.
        // Mua-X-tặng-Y chính là bản rút gọn của "đủ 6 tem tặng 1 ly" — cùng một
        // quyền lợi. Trước đây khách mua 5 ly được tặng 1 ly RỒI vẫn cộng thêm tem
        // cho 5 ly đó, tức hưởng hai lần cùng một chương trình.
        // Nhận diện qua c.isFree (chỉ ly từ mua-X-tặng-Y mới có cờ này; ly đổi tem
        // dùng _vKey nên không nhầm lẫn).
        const coLyTangMuaX = items.some(c => c.isFree === true);
        const drinkCount = coLyTangMuaX ? 0
          : items.reduce((s, c) => s + (!c.isFree && !c._vKey ? c.qty : 0), 0);
        if (coLyTangMuaX) setTimeout(() => toast('Bill có ly tặng (mua X tặng Y) — không tích tem cho bill này'), 800);
        // [BUG#21 FIX] await + truyền billId — TRƯỚC ĐÂY gọi không await (fire-and-forget) và
        // không có billId nào để idempotent theo, nên (1) claim 'done' có thể ghi TRƯỚC KHI loyalty
        // ghi xong (mất quyền lợi nếu loyalty lỗi sau đó), và (2) hàm bên trong cộng thẳng bằng
        // FieldValue.increment không theo billId nên gọi lại là cộng đúp. Xem loyaltyAddPoints/
        // loyaltyAddStamps — giờ đã có claim theo billId trong 1 transaction.
        else await loyaltyProcessAfterPay(loyPhone, total, drinkCount, billRef.key, stampCupPricesOf(items));
      }
      // Ghi trừ stamp miễn phí SAU KHI order lưu thành công.
      // [BUG#19 FIX] Await thay vì fire-and-forget — phải biết chắc bước này đã xong (thành công
      // hoặc đã ghi cảnh báo durable khi lỗi) TRƯỚC KHI đánh dấu done bên dưới, nếu không một lỗi ở
      // đây sẽ vĩnh viễn không có cơ hội chạy lại (retry sau sẽ thấy đã done rồi bỏ qua toàn bộ
      // khối, xem BUG#17/#20 fix ở trên).
      await _finalizeStampFreeAfterPay(billRef.key, order.itemsArray);
      // [F4] Đã gỡ _finalizeDiscountAfterPay (ghi rewards.usedCount / myGifts.used) — Gieo Gieo không dùng mã.
      // [BUG#23 FIX] Await thay vì fire-and-forget — nếu ghi 'done' lỗi mà không biết, claim vẫn
      // ở trạng thái 'processing' và sẽ tự hết hạn sau _CHECKOUT_SIDE_EFFECTS_STALE_MS để retry sau
      // giành lại được (đúng ý đồ), nhưng NẾU coi ghi lỗi này là thành công (không await) thì biến
      // thành im lặng bỏ sót — await để lỗi ở đây lộ ra console thay vì bị nuốt.
      try { await _ueMarkCheckoutSideEffectsDone(billRef.key); }
      catch (err) { console.warn('[checkout] ghi done side-effects lỗi — claim sẽ tự hết hạn để retry sau', billRef.key, err); }
    }
    cart = {};
    cartIceDefault = 'chung'; // [NEW-ICE] đơn kế tiếp mặc định lại đá chung
    togoDiscountAmt = 0;
    resetPayMethod();
    resetDiscountState();
    isShip = false; renderShipBtn();
    resetTogoToggle();
    document.getElementById('cuph').value = '';
    clearCustomer();
    renderMenu();
    renderCartDrawer();
    // [MỚI] Không tự thoát chế độ bổ sung bill sau khi tạo xong 1 bill — có thể còn hơn 1 bill
    // thiếu cho cùng ngày đó. Nhắc lại rõ ràng để không nhầm với bán hàng thật kế tiếp.
    if (_backfillMode) {
      toast('✅ Đã bổ sung bill cho ngày ' + posDateKeyToDisplay(_backfillMode.businessDate) + ' — vẫn ĐANG ở chế độ bổ sung, bấm "Thoát chế độ" trên banner khi xong');
    } else {
      toast('✅ Thanh toán thành công!');
    }
    showScreen('sm');
    _checkoutIdemKey = null; // [FIX duplicate bill] bill đã hoàn tất trọn vẹn — lượt sau là đơn MỚI
    _clearPersistedPendingCheckout(); // [BUG#18 FIX] hoàn tất trọn vẹn — bỏ luôn bản lưu localStorage
  } catch (err) {
    console.error('Lỗi ghi đơn:', err);
    toast('❌ Lỗi lưu đơn — thử lại!'); // KHÔNG xoá _checkoutIdemKey — bấm lại phải là NÓ, không phải đơn mới
  } finally {
    _posSubmitBusy = false; // [FIX] luôn nhả khoá, kể cả khi lỗi
  }
}

// ============================================================
// SPLIT PAY — Tính riêng từng khách
// ============================================================
// spItems: mảng các unit món (mỗi qty=1 là 1 phần tử riêng)
// spPaidAmt: tổng đã thu được
// spSelected: Set of indices đang được tick
let spItems = [];

let spPaidAmt = 0;

let spSelected = new Set();

let _spCurrentMethod = null;

let spGroups = [];

function openSplitPay() {
  if (!Object.keys(cart).length) { toast('Giỏ hàng trống!'); return; }
  // Tách cart thành từng unit riêng lẻ
  spItems = [];
  Object.values(cart).forEach(c => {
    const toppingSum = tpSum(c.toppings);
    const unitPrice = c.price + toppingSum;
    const toppingLabel = (c.toppings || []).map(t => tpLabel(t)).join(', ');
    for (let i = 0; i < c.qty; i++) {
      spItems.push({ name: c.name + (toppingLabel ? ' (+' + toppingLabel + ')' : ''), size: c.size, price: unitPrice, paid: false });
    }
  });
  applySplitBillDiscount(); // [FIX] xem ghi chú trong hàm
  spPaidAmt = 0;
  spSelected = new Set();
  spGroups = [];
  renderSpItems();
  updSpTotals();
  showScreen('sp');
}

// ============================================================
// [FIX] Phân bổ giảm giá theo BILL xuống từng món trong Tính riêng
//
// Lỗi cũ: openSplitPay() chỉ tính giá từng món, còn các khoản giảm tính
// trên TOÀN BILL — giảm giá To Go (togoDiscountAmt) và Bán qua App — bị bỏ qua
// hoàn toàn. Kịch bản thật: khách mua đủ số ly được hứa giảm 10% ở màn thanh
// toán, chọn "Tính riêng" → bị thu đủ giá gốc. Sai cam kết với khách.
//
// Cách xử lý: chia đều theo TỶ LỆ giá trị từng món (món đắt gánh nhiều hơn) —
// công bằng nhất khi mỗi người trả phần của mình. Món tặng (giá 0) tự động
// không bị ảnh hưởng vì 0 × tỷ lệ = 0.
//
// Xử lý số lẻ: làm tròn từng món sẽ khiến tổng lệch vài đồng so với số khách
// phải trả. Dồn toàn bộ phần lệch vào món ĐẮT NHẤT (chịu được sai lệch tương
// đối nhỏ nhất) để tổng luôn khớp tuyệt đối với getFinalTotal().
// ============================================================
let spGrandTotal = 0;

function applySplitBillDiscount() {
  const sumRaw = spItems.reduce((s, x) => s + x.price, 0);
  const target = getFinalTotal(); // đã trừ giảm To Go + Bán qua App
  spGrandTotal = sumRaw;
  if (sumRaw <= 0) { spGrandTotal = 0; return; }
  // target >= sumRaw: bill không có khoản giảm nào → giữ nguyên
  if (target >= sumRaw || target < 0) return;

  const ratio = target / sumRaw;
  spItems.forEach(x => { x.price = Math.round(x.price * ratio); });

  // Dồn phần lệch do làm tròn vào món đắt nhất
  let diff = target - spItems.reduce((s, x) => s + x.price, 0);
  if (diff !== 0) {
    let idx = 0;
    spItems.forEach((x, i) => { if (x.price > spItems[idx].price) idx = i; });
    spItems[idx].price = Math.max(0, spItems[idx].price + diff);
  }
  spGrandTotal = spItems.reduce((s, x) => s + x.price, 0);
}

function renderSpItems() {
  const el = document.getElementById('sp-item-list');
  el.innerHTML = spItems.map((item, i) => {
    const isPaid = item.paid;
    const isSel  = spSelected.has(i);
    return `<div id="sp-row-${i}" onclick="toggleSpItem(${i})"
      style="background:#fff;border-radius:18px;padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:10px;cursor:${isPaid?'default':'pointer'};transition:opacity .2s;opacity:${isPaid?'0.35':'1'};">
      <div style="flex:1;">
        <div style="font-size:16px;font-weight:700;color:var(--td);">${item.name}</div>
        <div style="font-size:12px;color:var(--gt);margin-top:3px;">Size ${item.size} · ${item.price.toLocaleString('vi-VN')}đ</div>
      </div>
      <div style="width:28px;height:28px;border-radius:50%;border:2px solid ${isSel?'var(--gm)':isPaid?'#ccc':'#ddd'};background:${isSel?'var(--gm)':isPaid?'#FDE6EA':'#fff'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;">
        ${isSel ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5L20 7"/></svg>' : isPaid ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5L20 7"/></svg>' : ''}
      </div>
    </div>`;
  }).join('');
}

function toggleSpItem(i) {
  if (spItems[i].paid) return;
  if (spSelected.has(i)) spSelected.delete(i); else spSelected.add(i);
  renderSpItems();
  updSpBottomBar();
}

function updSpTotals() {
  // [FIX] Trước đây dùng getCartTotal() = GIÁ GỐC, trong khi các nhóm lại thu theo
  // giá đã giảm → dòng "Còn lại" hiển thị sai suốt quá trình tính riêng (không bao
  // giờ về 0 dù đã thu đủ). Dùng spGrandTotal — đúng tổng khách thực phải trả.
  const grandTotal = spGrandTotal;
  const remain = Math.max(0, grandTotal - spPaidAmt);
  document.getElementById('sp-paid-total').textContent = spPaidAmt.toLocaleString('vi-VN') + 'đ';
  document.getElementById('sp-remain-total').textContent = remain.toLocaleString('vi-VN') + 'đ';
  // Kiểm tra tất cả đã tính xong chưa
  const allPaid = spItems.every(x => x.paid);
  document.getElementById('sp-pay-btns').style.display = allPaid ? 'none' : 'flex';
  document.getElementById('sp-done-btn').style.display  = allPaid ? 'block' : 'none';
  document.getElementById('sp-bottom-info').style.display = allPaid ? 'none' : 'flex';
}

function updSpBottomBar() {
  const selArr = [...spSelected];
  const subTotal = selArr.reduce((a, i) => a + spItems[i].price, 0);
  document.getElementById('sp-selected-total').textContent = subTotal.toLocaleString('vi-VN') + 'đ';
  document.getElementById('sp-selected-count').textContent = selArr.length + ' món';
}

function spPay(method) {
  if (spSelected.size === 0) { toast('Chưa chọn món nào!'); return; }
  const subTotal = [...spSelected].reduce((a, i) => a + spItems[i].price, 0);
  _spCurrentMethod = method;
  if (method === 'cash') {
    // Mở mini cash popup
    document.getElementById('sp-cash-total').textContent = subTotal.toLocaleString('vi-VN') + 'đ';
    document.getElementById('sp-cash-input').value = subTotal.toLocaleString('vi-VN');
    // Build gợi ý
    const sugs = buildSuggestions(subTotal);
    document.getElementById('sp-cash-suggests').innerHTML = sugs.map(s => {
      const label = s >= 1000000 ? (s/1000000)+'M' : s/1000+'k';
      return `<button onclick="spCashSelectSug(${s})" style="background:var(--gl);border:2px solid transparent;border-radius:24px;padding:8px 14px;font-family:'Google Sans',sans-serif;font-size:13px;font-weight:700;color:var(--gd);cursor:pointer;" id="sp-sug-${s}">${label}</button>`;
    }).join('');
    updSpCashChange();
    document.getElementById('sp-cash-popup').style.display = 'flex';
  } else {
    // [CHANGED] Trước đây chỉ hiện popup tĩnh (không QR) — khách không có cách nào
    // chuyển khoản vì không biết số tiền/nội dung CK chính xác cho riêng phần của
    // họ. Giờ tạo QR VietQR thật với đúng số tiền đã chọn (subTotal đã bao gồm
    // topping — xem cách build spItems[].price trong openSplitPay()).
    openSpBankQR(subTotal);
  }
}

// [NEW] Tạo QR chuyển khoản riêng cho 1 nhóm món trong màn "Tính riêng".
// Dùng chung popup #vietqr-popup với luồng bán thường, chỉ khác:
//  - Số tiền = subTotal của các món đang được chọn (KHÔNG phải tổng cả bill)
//  - Khi xác nhận (tự động hoặc bấm tay) → đánh dấu nhóm đã chọn là đã trả,
//    KHÔNG ghi bill ngay (bill tổng chỉ ghi 1 lần ở finalizeSplitPay khi mọi
//    món đã được tính hết — xem markSpSelectedPaid()).
// Vì popup là modal chặn toàn màn hình, nhân viên bắt buộc đợi khách này chuyển
// khoản xong (đóng popup) mới thao tác tiếp được — đúng yêu cầu xử lý tuần tự
// từng khách một, không cần thêm cơ chế hàng đợi.
function openSpBankQR(subTotal) {
  if (subTotal <= 0) { toast('Số tiền không hợp lệ!'); return; }

  _vietqrMode = 'split';
  _vietqrResetManualBox();

  const orderId = genBankOrderId();
  _vietqrOrderId = orderId;
  // [CHANGED] Dùng closure giữ đúng orderId của LẦN NÀY — an toàn hơn đọc lại
  // _vietqrOrderId global lúc callback chạy (dù thực tế không có race vì popup
  // chặn tuần tự, nhưng closure rõ ràng và chắc chắn hơn).
  // [MỚI] Kèm metadata "ai/cách nào xác nhận" — cùng lý do với luồng bán thường.
  _vietqrOnConfirm = (data) => { markSpSelectedPaid('CHUYỂN KHOẢN', null, null, orderId, _bankConfirmMetaFromCallbackData(data)); };

  const addInfo = encodeURIComponent('TTHD ' + orderId);
  const accountName = encodeURIComponent(CAKE_ACCOUNT_NAME);

  const qrUrl = `https://img.vietqr.io/image/cake-${CAKE_ACCOUNT_NO}-compact2.png`
    + `?amount=${subTotal}`
    + `&addInfo=${addInfo}`
    + `&accountName=${accountName}`;

  const img = document.getElementById('vietqr-img');
  const fallback = document.getElementById('vietqr-fallback');
  img.style.display = 'block';
  fallback.style.display = 'none';
  img.src = qrUrl;

  document.getElementById('vietqr-amount').textContent = subTotal.toLocaleString('vi-VN') + 'đ';
  document.getElementById('vietqr-addinfo').textContent = 'TTHD ' + orderId;

  document.getElementById('vietqr-popup').style.display = 'flex';


  startBankListener(orderId);
}

function spCashSelectSug(amt) {
  document.getElementById('sp-cash-input').value = amt.toLocaleString('vi-VN');
  updSpCashChange();
}

function onSpCashInput(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  const num = parseInt(raw) || 0;
  el.value = num > 0 ? num.toLocaleString('vi-VN') : '';
  updSpCashChange();
}

function updSpCashChange() {
  const subTotal = [...spSelected].reduce((a, i) => a + spItems[i].price, 0);
  const raw = document.getElementById('sp-cash-input').value.replace(/[^0-9]/g, '');
  const given = parseInt(raw) || 0;
  const row = document.getElementById('sp-cash-change-row');
  if (given <= 0) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  const diff = given - subTotal;
  const lbl = document.getElementById('sp-cash-change-label');
  const val = document.getElementById('sp-cash-change-val');
  if (diff >= 0) {
    lbl.textContent = 'TIỀN THỪA'; lbl.style.color = '#c8820a';
    val.textContent = diff.toLocaleString('vi-VN') + 'đ'; val.style.color = '#d4820a';
  } else {
    lbl.textContent = 'THIẾU'; lbl.style.color = '#e74c3c';
    val.textContent = '⚠ ' + Math.abs(diff).toLocaleString('vi-VN') + 'đ'; val.style.color = '#e74c3c';
  }
}

function confirmSpCash() {
  const raw = document.getElementById('sp-cash-input').value.replace(/[^0-9]/g, '');
  const cashGiven = parseInt(raw) || 0;
  const subTotal = [...spSelected].reduce((a, i) => a + spItems[i].price, 0);
  const cashChange = Math.max(0, cashGiven - subTotal);
  markSpSelectedPaid('TIỀN MẶT', cashGiven, cashChange);
  closeSpCashPopup();
}

// [NOTE] Từ khi thêm openSpBankQR() (dùng QR VietQR thật cho Tính riêng),
// confirmSpBank()/closeSpBankPopup() và popup #sp-bank-popup KHÔNG còn được gọi
// tới nữa (spPay('bank') giờ gọi openSpBankQR thay vì mở popup này). Giữ lại code
// này để dễ revert nếu cần, không xoá.
function confirmSpBank() {
  markSpSelectedPaid('CHUYỂN KHOẢN', null, null);
  closeSpBankPopup();
}

function markSpSelectedPaid(method, cashGiven, cashChange, bankOrderId, bankConfirmMeta) {
  const subTotal = [...spSelected].reduce((a, i) => a + spItems[i].price, 0);
  const groupItems = [...spSelected].map(i => ({ name: spItems[i].name, size: spItems[i].size, price: spItems[i].price }));
  spSelected.forEach(i => { spItems[i].paid = true; spItems[i].method = method; });
  // Lưu nhóm
  const grp = { method, items: groupItems, total: subTotal, paid: true };
  if (method === 'TIỀN MẶT') { grp.cashGiven = cashGiven || subTotal; grp.cashChange = cashChange || 0; }
  // [NEW] Lưu mã CK riêng của nhóm này — mỗi nhóm chuyển khoản trong 1 bill Tính
  // riêng có 1 mã QR/mã đơn khác nhau (xem openSpBankQR), cần lưu để đối soát.
  if (method === 'CHUYỂN KHOẢN' && bankOrderId) { grp.bankOrderId = bankOrderId; }
  // [MỚI] "Ai/cách nào xác nhận CK" của riêng nhóm này — quy trách nhiệm nếu nhân
  // viên tự bấm xác nhận mà không đúng SOP (xem _bankConfirmMetaFromCallbackData).
  if (method === 'CHUYỂN KHOẢN' && bankConfirmMeta) Object.assign(grp, bankConfirmMeta);
  spGroups.push(grp);
  spPaidAmt += subTotal;
  spSelected = new Set();
  renderSpItems();
  updSpTotals();
  updSpBottomBar();
  toast('✓ Đã tính ' + subTotal.toLocaleString('vi-VN') + 'đ — ' + method);
}

function closeSpCashPopup() { document.getElementById('sp-cash-popup').style.display = 'none'; }

function closeSpBankPopup() { document.getElementById('sp-bank-popup').style.display = 'none'; }

async function finalizeSplitPay() {
  // [NEW mục 2.5] Chặn KỸ THUẬT bắt buộc — 1 trong 3 nơi duy nhất tạo bill.
  // [MỚI] Bỏ qua đúng cổng _isDayClosedToday + check-in khi đang "Bổ sung bill thiếu" — xem
  // confirmPay().
  if (_isDayClosedToday && !_backfillMode) { toast('🚫 Ngày hôm nay đã đóng ca — không thể tạo bill mới'); return; }
  if (!requireShiftOpened()) return; // [NEW] chặn kỹ thuật: chưa mở ca thì không được ghi bill
  if (!requireOpeningChecklistDone()) return; // [GĐ5] chặn kỹ thuật: việc đầu ca bắt buộc chưa xong
  if (!_backfillMode && !requireSomeoneCheckedIn()) return; // [NEW] chặn kỹ thuật: chưa ai check-in thì không được ghi bill
  // Ghi 1 đơn tổng hợp lên Firebase với method = TÍNH RIÊNG
  const items = Object.values(cart);
  // [FIX] Trước đây ghi getCartTotal() = GIÁ GỐC, trong khi tổng các nhóm đã thu là
  // giá SAU giảm → order.total không khớp tiền thực thu, doanh thu bị thổi phồng.
  const total = spGrandTotal;
  const baseTotal = getCartTotal();
  const discAmt = Math.max(0, baseTotal - total);
  // [MỚI] Cùng cơ chế backdating với confirmPay() — xem chú thích ở đó.
  const realNow = vnDate();
  const now = _backfillMode ? vnDate(_backfillMode.businessDate + 'T12:00:00') : realNow;
  const p = n => String(n).padStart(2, '0');
  const month = MONTH_KEYS[now.getMonth()];
  const day   = p(now.getDate());
  const itemsArray = items.map(c => ({ ...c }));
  const itemsSummary = items.map(c => `${c.name}(${c.size})x${c.qty}`).join(', ');
  const foodItems = items.filter(c => c.isFood === true);
  const foodTotal = foodItems.reduce((s, c) => s + c.price * c.qty, 0);
  const order = {
    time: `${p(realNow.getHours())}:${p(realNow.getMinutes())}`,
    date: `${day}/${p(now.getMonth()+1)}/${now.getFullYear()}`,
    items: itemsSummary, itemsArray, total,
    netTotal: foodTotal > 0 ? total - foodTotal : null,
    foodTotal: foodTotal > 0 ? foodTotal : null,
    foodItems: foodTotal > 0 ? foodItems.map(c => ({ name: c.name, qty: c.qty, price: c.price })) : null,
    foodMethod: foodTotal > 0 ? 'TÍNH RIÊNG' : null,
    method: 'TÍNH RIÊNG',
    splitGroups: spGroups,
    phone: document.getElementById('cuph').value || '',
    customerName: (curCustomer && curCustomer.name) || '',
    voucherUsed: _stampFreeVKey ? (Object.values(cart).find(c=>c._vKey===_stampFreeVKey)?._giftLabel || 'Ly miễn phí (6 tem)') : null,
    cashGiven: total, cashChange: 0,
    // [FIX] Ghi lại tổng đã giảm — trước đây bill Tính riêng không có trường này
    // nên báo cáo không biết đơn đó đã áp khuyến mãi gì.
    discountAmt: discAmt > 0 ? discAmt : null,
    createdAt: realNow.toISOString(),
    ...(_backfillMode ? {
      backfilled: true,
      backfillMode: _backfillMode.skipConsumption ? 'before_close' : 'after_close',
      backfillCashTiming: _backfillMode.cashTiming || 'after_close',
      backfilledAt: realNow.toISOString()
    } : {}),
    isToGo: true,   // [F5] field giữ cho màn đọc bill cũ/Quản lý
    isShip: isShip ? true : null
  };

  // [FIX] Chống double-submit — xem ghi chú ở confirmPay()
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;

  // [FIX duplicate bill] Cùng cơ chế idemKey với confirmPay() — xem chú thích đầy đủ ở đó.
  if (!_checkoutIdemKey) { _checkoutIdemKey = 'bill_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10); _persistPendingCheckout(_cartSignature(items)); }
  const billRef = db.ref('orders_gieogieo/' + month + '/' + day).child(_checkoutIdemKey);

  try {
    const existingSnap = await billRef.once('value');
    const isNewBill = !existingSnap.exists();
    if (!isNewBill) {
      Object.assign(order, existingSnap.val());
    } else {
      const { seq, billCode } = await getNextBillCode(now);
      order.billCode = billCode;
      order.billSeq = seq;
      await billRef.set(order);
    }
    // [FIX] TRƯỚC ĐÂY có `orders.unshift({...})` ở đây → bill Tính riêng bị ĐẾM 2
    // LẦN: listener child_added của _attachRtListener() cũng tự thêm bill này vào
    // mảng orders (nó chỉ bỏ qua khi key đã có trong _ordersInRam, mà dòng unshift
    // thủ công lại không hề thêm key vào Set đó). Hệ quả: lịch sử hiện 2 dòng và
    // doanh thu trong ngày bị cộng gấp đôi cho tới khi F5.
    // confirmPay() đã ghi rõ nguyên tắc này trong comment của nó — Tính riêng bị sót.

    // Giai đoạn 4 — tự động trừ kho theo GOGS (recipes_gieogieo), không chặn luồng thanh toán.
    // [MỚI] Cùng nhánh backfill với confirmPay() — xem chú thích ở đó.
    // Gọi lại KHÔNG ĐIỀU KIỆN (không gate theo sideEffectsDone bên dưới) vì tự idempotent qua txId.
    if (_backfillMode) recordBackfillCashPOS(order, billRef.key, _backfillMode);
    trackConsumptionPOS(billRef.key, (_backfillMode && _backfillMode.skipConsumption)
      ? applyBackfillConsumptionNoStockEffect(order, billRef.key, _backfillMode.businessDate)
      : applySalesConsumptionPOS(order, billRef.key, _backfillMode ? _backfillMode.businessDate : undefined));

    // [BUG#20 FIX] Cùng claim nguyên tử với confirmPay() — xem chú thích đầy đủ ở đó.
    const _seClaim = await _ueClaimCheckoutSideEffects(billRef.key);
    if (_seClaim.shouldRun) {
      // [NEW-ASSIST] Chốt sổ Trợ lý bán hàng cho đơn vừa ghi: ghi nhật ký hiệu quả
      // của mọi gợi ý đã hiện trong đơn này, và cộng dồn hồ sơ thói quen của khách
      // (đá/size/topping/món hay mua) để lần sau gợi ý đúng hơn. Hàm tự nuốt mọi
      // lỗi — KHÔNG được phép làm hỏng luồng thanh toán vì một bản ghi thống kê.
      assistFinalizeOrder(order, billRef.key);
      POSPrinter.autoPrintIfEnabled(order);
      POSTemPrinter.printOrderLabels(order); // in tem (nếu đã bật) — qua cầu nối LAN, KHÔNG chặn luồng thanh toán
      // Mở két — đơn Tính riêng có thể vừa tiền mặt vừa chuyển khoản; chỉ mở khi
      // có ÍT NHẤT 1 phần tiền mặt (orderCashAmountPOS tự cộng đúng nhóm này).
      if (orderCashAmountPOS(order) > 0) POSPrinter.openCashDrawerIfConnected();

      // [FIX] 3 bước dưới đây TRƯỚC ĐÂY BỊ THIẾU HẲN ở luồng Tính riêng (chỉ có ở
      // confirmPay), gây 2 lỗ hổng thật:
      //  · Voucher/mã giảm giá không bị đánh dấu đã dùng → khách dùng lại được vô
      //    hạn; usedCount của mã không tăng nên vượt cả giới hạn lượt dùng.
      //  · Ly miễn phí đổi bằng 6 stamp không bị trừ khỏi tài khoản khách.
      //  · Khách thanh toán Tính riêng không được tích stamp → mất quyền lợi.
      const loyPhone = document.getElementById('cuph').value.trim();
      if (loyPhone) {
        // [FIX] Bill đã hưởng "mua X tặng Y" thì KHÔNG tích tem nữa.
        // Mua-X-tặng-Y chính là bản rút gọn của "đủ 6 tem tặng 1 ly" — cùng một
        // quyền lợi. Trước đây khách mua 5 ly được tặng 1 ly RỒI vẫn cộng thêm tem
        // cho 5 ly đó, tức hưởng hai lần cùng một chương trình.
        // Nhận diện qua c.isFree (chỉ ly từ mua-X-tặng-Y mới có cờ này; ly đổi tem
        // dùng _vKey nên không nhầm lẫn).
        const coLyTangMuaX = items.some(c => c.isFree === true);
        const drinkCount = coLyTangMuaX ? 0
          : items.reduce((s, c) => s + (!c.isFree && !c._vKey ? c.qty : 0), 0);
        if (coLyTangMuaX) setTimeout(() => toast('Bill có ly tặng (mua X tặng Y) — không tích tem cho bill này'), 800);
        // [BUG#21 FIX] await + truyền billId — xem chú thích đầy đủ ở confirmPay().
        else await loyaltyProcessAfterPay(loyPhone, total, drinkCount, billRef.key, stampCupPricesOf(items));
      }
      // [BUG#19 FIX] Await — cùng lý do với confirmPay(), xem chú thích đầy đủ ở đó.
      await _finalizeStampFreeAfterPay(billRef.key, order.itemsArray);
      // [F4] Đã gỡ _finalizeDiscountAfterPay — xem confirmPay().
      // [BUG#23 FIX] Await — xem chú thích đầy đủ ở confirmPay().
      try { await _ueMarkCheckoutSideEffectsDone(billRef.key); }
      catch (err) { console.warn('[checkout] ghi done side-effects lỗi — claim sẽ tự hết hạn để retry sau', billRef.key, err); }
    }
    cart = {};
    cartIceDefault = 'chung'; // [NEW-ICE] đơn kế tiếp mặc định lại đá chung
    togoDiscountAmt = 0; // [FIX] trước đây không reset ở luồng này
    spGrandTotal = 0;
    resetPayMethod();
    resetDiscountState(); // [FIX] dọn ý định đổi ly tem, tránh dính sang đơn sau
    isShip = false; renderShipBtn();
    resetTogoToggle();
    document.getElementById('cuph').value = '';
    clearCustomer();
    renderMenu();
    renderCartDrawer();
    // [MỚI] Không tự thoát chế độ bổ sung bill — xem confirmPay().
    if (_backfillMode) {
      toast('✅ Đã bổ sung bill cho ngày ' + posDateKeyToDisplay(_backfillMode.businessDate) + ' — vẫn ĐANG ở chế độ bổ sung, bấm "Thoát chế độ" trên banner khi xong');
    } else {
      toast('✅ Đã hoàn tất tính riêng!');
    }
    showScreen('sm');
    _checkoutIdemKey = null; // [FIX duplicate bill] bill đã hoàn tất trọn vẹn — lượt sau là đơn MỚI
    _clearPersistedPendingCheckout(); // [BUG#18 FIX] hoàn tất trọn vẹn — bỏ luôn bản lưu localStorage
  } catch (err) {
    toast('❌ Lỗi: ' + err.message); // KHÔNG xoá _checkoutIdemKey — bấm lại phải là NÓ, không phải đơn mới
  } finally {
    _posSubmitBusy = false; // [FIX] luôn nhả khoá, kể cả khi lỗi
  }
}

PosGieoMods.thanhtoan = true;
