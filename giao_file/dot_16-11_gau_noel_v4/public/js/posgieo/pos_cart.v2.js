// v2 (31/10/2026) = v1 + «tự chọn topping»: dòng đã chọn (pickTpApplied) không bị cộng dồn thêm ly; Thanh toán gọi pickToppingBeforePay TRƯỚC askIceBeforePay.
// Tách từ posgieo.html dòng 7023–7321, 8238–8423 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_cart.v3.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).cart = 'dang';

// ============================================================
// MENU RENDER
// ============================================================
function fmtK(n) { return Math.round(n / 1000) + 'k'; }

function fmt(n) { return n.toLocaleString('vi-VN') + 'đ'; }

function getCartTotal() {
  return Object.values(cart).reduce((a, c) => {
    const toppingSum = tpSum(c.toppings);
    return a + (c.price + toppingSum) * c.qty;
  }, 0);
}

function getQty(itemId) { return Object.values(cart).filter(c => c.itemId === itemId).reduce((a, b) => a + b.qty, 0); }

function renderMenu() {
  const g = document.getElementById('mg');
  const activeMenu = getActiveMenu();
  const showFood = curFilter === 'all' || curFilter === '__food__';
  const filtered = curFilter === 'all' || curFilter === '__food__'
    ? (curFilter === '__food__' ? [] : activeMenu)
    : activeMenu.filter(m => m.type === curFilter);

  let html = '';
  if (!filtered.length && (!showFood || !FOOD_MENU.length)) {
    g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:#bbb;font-size:14px">Chưa có sản phẩm</div>`;
    return;
  }
  html += filtered.map(m => {
    const q = getQty(m.id);
    const minP = Math.min(...m.sizes.map(s => s.price));
    const bg = m.color || '#E23A5D';
    return `<div class="mi" style="background:${bg}" onclick="openPO('${m.id}')">
      <span class="mn">${m.name}</span>
      <span class="mp">${fmtK(minP)}</span>
      ${q ? `<span class="qb">${q}</span>` : ''}
    </div>`;
  }).join('');

  // Food items — chỉ hiện khi filter "TẤT CẢ" hoặc filter "FOOD"
  if (showFood && FOOD_MENU.length) {
    if (curFilter === 'all') {
      html += `<div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;margin-top:6px;margin-bottom:4px;">
        <span style="font-size:10px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.7px;">Food</span>
        <div style="flex:1;height:1px;background:#fde68a;"></div>
      </div>`;
    }
    html += FOOD_MENU.map(f => {
      const qFood = (cart['food_' + f.id] || {}).qty || 0;
      return `<div class="mi" style="background:#b45309;" onclick="addFoodToCart('${f.id}')">
        <span class="mn">${f.name}</span>
        <span class="mp">${fmtK(f.price)}</span>
        ${qFood ? `<span class="qb">${qFood}</span>` : ''}
      </div>`;
    }).join('');
  }

  g.innerHTML = html;
  updFooter();
}

function updFooter() {
  const finalTotal = getFinalTotal();
  const ftv        = document.getElementById('ftv');
  ftv.textContent = fmt(finalTotal);
  if (document.getElementById('cartDrawer').classList.contains('open')) renderCartDrawer();
}

// ============================================================
// CART DRAWER
// ============================================================
function openCartDrawer() {
  renderCartDrawer();
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('show');
}

function closeCartDrawer() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('show');
}

function renderCartDrawer() {
  const items = Object.entries(cart);
  const body = document.getElementById('cartBody');
  renderCartIceBar(); // [NEW-ICE] cập nhật thanh chọn đá cho cả đơn
  if (!items.length) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb;font-size:14px;">Giỏ hàng trống</div>`;
    return;
  }

  body.innerHTML = items.map(([k, c]) => {
    // Item giảm giá (discount code hoặc gift voucher toàn đơn)
    if (c._discountId || (c._vKey && (c._giftType === 'percent' || c._giftType === 'fixed' || k === '__giftvoucher__'))) {
      const label = c._discountCode ? `🏷 Mã: ${c._discountCode}` : `🎁 ${c._giftLabel || c.name}`;
      // [F4] Chỉ còn gặp ở giỏ khôi phục từ bản cũ (trước khi gỡ mã/voucher) — xoá như món thường.
      const removeHandler = `cartDel('${k}')`;
      return `
      <div class="cart-row" style="background:#f0fdf4;border-radius:12px;margin:4px 0;padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:6px;flex:1;">
          <span style="font-size:13px;font-weight:700;color:#C22B49;flex:1;">${label}</span>
          <span style="font-size:14px;font-weight:700;color:#e74c3c;">${fmt(c.price)}</span>
          <button onclick="${removeHandler}" style="background:none;border:none;cursor:pointer;padding:0 2px;color:#ccc;font-size:14px;line-height:1;">✕</button>
        </div>
      </div>`;
    }

    // Item miễn phí hoặc giảm giá theo món
    const isGiftItem = !!c._vKey;
    const dispPrice = c.price;
    const toppings = c.toppings || [];
    const toppingSum = tpSum(toppings);
    const lineTotalWithToppings = (dispPrice + toppingSum) * c.qty;
    const toppingHtml = toppings.map((t, ti) => `
      <div style="display:flex;align-items:center;gap:4px;margin-top:3px;">
        <span style="font-size:11px;color:var(--gt);">+ ${tpLabel(t)}</span>
        <span style="font-size:11px;font-weight:700;color:var(--gt);">${fmt((Number(t.price)||0) * tpQty(t))}</span>
        <button onclick="removeCartTopping('${k}',${ti})" style="background:none;border:none;cursor:pointer;padding:0 2px;color:#ccc;font-size:12px;line-height:1;">✕</button>
      </div>`).join('');
    const finalPriceHtml = isGiftItem
        ? `<div style="text-align:right;">
             ${c._originalPrice !== undefined ? `<span style="font-size:11px;color:#bbb;text-decoration:line-through;">${fmt(c._originalPrice)}</span>` : ''}
             <span class="cart-price" style="color:#C22B49;display:block;">${c.price === 0 ? 'Miễn phí' : fmt(lineTotalWithToppings)}</span>
           </div>`
        : `<span class="cart-price" style="flex-shrink:0;">${fmt(lineTotalWithToppings)}</span>`;
    return `
    <div class="cart-row" style="flex-direction:column;align-items:stretch;gap:4px;padding:10px 0;${isGiftItem ? 'background:#f0fdf4;border-radius:12px;padding:10px 12px;margin:4px 0;' : ''}">
      <div style="display:flex;align-items:center;gap:5px;">
        <span class="cart-name" style="font-size:16px;cursor:pointer;text-decoration:underline dotted var(--gt);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="openToppingPickerSplit('${k}')">${c.name}</span>
        ${(!c.isFree && !isGiftItem && isFreeTpEligibleItem(c.itemId)) ? `<span title="Món có thể tặng topping cho thành viên" style="width:11px;height:11px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #dcfce7;flex-shrink:0;"></span>` : ''}
        <span class="cart-size" style="flex-shrink:0;">${c.size}</span>
        ${isGiftItem ? `<span style="font-size:10px;font-weight:700;background:#d1fae5;color:#065f46;border-radius:6px;padding:1px 5px;flex-shrink:0;">🎁</span>` : ''}
        ${!c.isFood ? iceChipHtml(c) : ''}
        <button class="cqb minus" style="flex-shrink:0;" onclick="cartAdj('${k}',-1)">−</button>
        <span class="cart-qn" style="flex-shrink:0;">${c.qty}</span>
        <button class="cqb plus" style="flex-shrink:0;" onclick="cartAdj('${k}',1)">+</button>
        <button class="cart-del" style="flex-shrink:0;" onclick="cartDel('${k}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
      </div>
      ${(c.isFree || isGiftItem) ? `<div style="font-size:10.5px;font-weight:700;color:#b91c1c;display:flex;align-items:center;gap:3px;">🔒 Đây là ly tặng — không áp dụng KM tặng topping</div>` : ''}
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;">
        <div style="flex:1;">${toppingHtml ? `<div style="padding-left:2px;">${toppingHtml}</div>` : ''}</div>
        <div style="flex-shrink:0;">${finalPriceHtml}</div>
      </div>
    </div>`;
  }).join('');
}

function cartAdj(k, delta) {
  if (!cart[k]) return;
  // [F4] Ly đổi tem: mỗi lượt đổi đúng 1 ly — không cho "+" (trước đây bấm "+" thành 2 ly
  // miễn phí mà chỉ trừ 1). "−" về 0 = bỏ ly → huỷ luôn ý định trừ tem (_stampFreeSyncCart).
  if (delta > 0 && _stampFreeVKey && cart[k]._vKey === _stampFreeVKey) {
    toast('ℹ️ Mỗi lượt chỉ đổi 1 ly miễn phí — thanh toán xong rồi đổi tiếp nhé.');
    return;
  }
  // [FIX-freeTp-splitGiftedLine] Bấm "+" trên dòng đã có topping tặng: không cộng dồn
  // qty vào chung dòng (ly mới sẽ ăn ké topping tặng của ly cũ) — tách thành dòng riêng,
  // sạch, để ly mới được xét tặng topping lại từ đầu.
  if (delta > 0 && (cart[k].freeTpApplied || cart[k].pickTpApplied)) {
    const src = cart[k];
    const nk = k + '_new' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    cart[nk] = { itemId: src.itemId, name: src.name, size: src.size, price: src.price, qty: 1, ice: src.ice || cartIceDefault };
  } else {
    cart[k].qty += delta;
    if (cart[k].qty <= 0) delete cart[k];
  }
  _stampFreeSyncCart();
  renderMenu();
  renderCartDrawer();
  // [FIX-freeTp-deferToCheckout] Xem ghi chú ở addCart() — popup dời sang lúc bấm
  // THANH TOÁN, ở đây chỉ cập nhật dòng nhắc.
  renderFreeTpReminder();
}

function cartDel(k) {
  delete cart[k];
  _stampFreeSyncCart();
  renderMenu();
  renderCartDrawer();
  renderFreeTpReminder(); // xoá món → số ly được tặng đổi theo, cập nhật lại dòng nhắc
}

function cartClear() {
  resetDiscountState();
  cart = {};
  cartIceDefault = 'chung'; // [NEW-ICE] giỏ mới → về lại mặc định đá chung
  _checkoutIdemKey = null; // [FIX duplicate bill] giỏ mới = đơn MỚI, cần idemKey mới
  _clearPersistedPendingCheckout(); // [BUG#18 FIX] đơn mới thật sự — bỏ luôn bản lưu localStorage
  renderMenu();
  renderCartDrawer();
  renderFreeTpReminder();
}

// ============================================================
// SIZE POPUP
// ============================================================
function openPO(itemId) {
  const m = getActiveMenu().find(x => x.id === itemId); if (!m) return;
  if (m.sizes.length === 1) { addCart(m, m.sizes[0]); return; }
  document.getElementById('spn').textContent = m.name;
  document.getElementById('so').innerHTML = m.sizes.map((s, i) => {
    const big = i === m.sizes.length - 1;
    return `<button class="sb" onclick="onSize('${m.id}','${s.label}')">${cupSVG(big ? 1 : .82)}<span class="sbl">SIZE ${s.label}</span><span class="sbp">${fmt(s.price)}</span></button>`;
  }).join('');
  document.getElementById('po').classList.add('show');
}

function closePO(e) { if (!e || e.target === document.getElementById('po')) document.getElementById('po').classList.remove('show'); }

function onSize(id, label) {
  document.getElementById('po').classList.remove('show');
  const m = getActiveMenu().find(x => x.id === id);
  if (m) { const s = m.sizes.find(x => x.label === label); if (s) addCart(m, s); }
}

function cupSVG(sc) {
  const w = Math.round(52 * sc), h = Math.round(62 * sc);
  return `<svg width="${w}" height="${h}" viewBox="0 0 52 62" fill="none"><rect x="30" y="0" width="5" height="27" rx="2.5" fill="#d63031" transform="rotate(12 30 0)"/><path d="M8 13L12 55Q12 59 16 59L36 59Q40 59 40 55L44 13Z" fill="#b0d4dc"/><rect x="6" y="10" width="40" height="6" rx="3" fill="#90bfc8"/><rect x="13" y="20" width="6" height="24" rx="3" fill="white" opacity=".22"/></svg>`;
}

function addCart(item, size) {
  const k = item.id + '_' + size.label;
  // [FIX-freeTp-splitGiftedLine] Nếu dòng này đã được tặng topping free cho (các) ly
  // trước đó (freeTpApplied === true), KHÔNG cộng dồn qty vào chung dòng — vì toppings
  // áp cho cả dòng, ly mới thêm sẽ vô tình "ăn ké" topping tặng của ly cũ mà không qua
  // bước chọn. Tách ly mới thành 1 dòng riêng, sạch, để được xét tặng lại từ đầu.
  if (cart[k] && (cart[k].freeTpApplied || cart[k].pickTpApplied)) {
    const nk = k + '_new' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    cart[nk] = { itemId: item.id, name: item.name, size: size.label, price: size.price, qty: 1, ice: cart[k].ice || cartIceDefault };
  } else if (cart[k]) {
    cart[k].qty++;
  } else {
    cart[k] = { itemId: item.id, name: item.name, size: size.label, price: size.price, qty: 1, ice: cartIceDefault };
  }
  renderMenu(); toast('Thêm: ' + item.name + ' ' + size.label);
  // [FIX-freeTp-deferToCheckout] TRƯỚC ĐÂY gọi checkFreeToppingMemberPromo() ngay tại
  // đây → khách gọi thêm món giữa chừng là popup chọn topping nhảy ra chen ngang màn
  // order, phải đóng đi mới gọi tiếp được, gọi thêm ly nữa lại nhảy tiếp. Giờ chỉ cập
  // nhật lời nhắc (dòng chữ), còn popup dời hẳn sang lúc bấm THANH TOÁN — chọn một lần
  // cho toàn bộ giỏ, không cắt ngang việc order.
  renderFreeTpReminder();
}

async function onCheckoutClick() {
  // Chặn SỚM ở đây (không chỉ ở bước xác nhận cuối) để nhân viên không mất
  // công điền form thanh toán rồi mới biết bị chặn — ưu tiên UX (mục 2.5).
  // Chặn thật sự (bắt buộc kỹ thuật) vẫn nằm ở confirmPay/finalizeSplitPay/
  // confirmPayWallet — chỗ này chỉ là lớp chặn sớm cho trải nghiệm.
  // [MỚI] Bỏ qua đúng cổng này khi đang "Bổ sung bill thiếu" (xem _backfillMode) — chặn kỹ
  // thuật thật sự vẫn nằm ở confirmPay/finalizeSplitPay, chỗ này chỉ là chặn sớm cho UX.
  if (_isDayClosedToday && !_backfillMode) { toast('🚫 Ngày hôm nay đã đóng ca — không thể tạo bill mới'); return; }
  if (!requireShiftOpened()) return; // [NEW] chặn sớm luôn cả trường hợp chưa mở ca
  if (!requireOpeningChecklistDone()) return; // [GĐ5] còn việc đầu ca bắt buộc chưa xong
  const items = Object.values(cart);
  if (!items.length) { toast('Giỏ hàng trống!'); return; }
  // [FIX duplicate bill] Sinh idemKey CỐ ĐỊNH cho lượt thanh toán này — chỉ sinh khi CHƯA có
  // (giữ nguyên qua việc quay lại/mở lại màn thanh toán nhiều lần cho cùng giỏ hàng này). Bị xoá
  // khi cartClear() (đơn mới thật sự) hoặc sau khi 1 bill hoàn tất — xem confirmPay().
  if (!_checkoutIdemKey) {
    // [BUG#18 FIX] Trang vừa bị tải lại (F5/crash/SW auto-update) đúng lúc đang chờ ACK của lượt
    // thanh toán trước — _checkoutIdemKey trong RAM mất, nhưng nếu nhân viên gõ lại ĐÚNG giỏ hàng
    // đó (chữ ký khớp với lần lưu gần nhất) thì dùng lại đúng idemKey cũ thay vì sinh mã mới, để
    // confirmPay()/finalizeSplitPay() nhận ra bill có thể đã ghi rồi thay vì tạo bill trùng.
    const _curCartSig = _cartSignature(items);
    _checkoutIdemKey = (_pendingCheckoutFromStorage && _pendingCheckoutFromStorage.cartSig === _curCartSig)
      ? _pendingCheckoutFromStorage.key
      : ('bill_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
    _pendingCheckoutFromStorage = null; // đã dùng (hoặc xác định không khớp) — không cần giữ nữa
    _persistPendingCheckout(_curCartSig);
  }
  // [NEW] Kiểm tra check-in ở ĐÂY (cổng vào duy nhất của mọi luồng thanh toán:
  // tiền mặt / chuyển khoản / tính riêng / ví đều đi qua màn chọn phương thức mở
  // từ hàm này) — dùng bản async có nạp lại cache, để 3 điểm ghi bill phía sau
  // chỉ cần kiểm tra sync trên cache đã mới.
  // [MỚI] Bỏ qua khi đang "Bổ sung bill thiếu" — mã 8833 đã tự là một lớp xác thực riêng, và
  // ca hôm đó đã kết ca nên không ai còn "đang check-in" để đòi hỏi nữa.
  if (!_backfillMode && !(await requireSomeoneCheckedInAsync())) return;
  checkTogoBeforeCheckout(() => pickToppingBeforePay(() => askIceBeforePay(() => {
    closeCartDrawer();
    const allDisc = computeAllDiscounts();
    const base = getCartTotal();
    const finalTotal = getFinalTotal();
    const appDisc = getAppSaleDiscount();
    showScreen('sc');
    renderScCartPreview(); // render giỏ hàng mini ngay khi mở màn thanh toán
    const el = document.getElementById('cotn');
    if (el) {
      if (allDisc > 0) {
        let discLabel = '';
        if (appDisc > 0) discLabel = ` <span style="font-size:13px;background:#e3f2fd;color:#1565c0;border-radius:8px;padding:2px 8px;font-weight:700;">APP -${fmt(appDisc)}</span> <span style="font-size:14px;color:#e74c3c;font-weight:700;text-decoration:line-through;">${fmt(base)}</span>`;
        else if (togoDiscountAmt > 0) discLabel = ` <span style="font-size:14px;color:#e74c3c;font-weight:700;text-decoration:line-through;">${fmt(base)}</span>`;
        el.innerHTML = `${fmt(finalTotal)}${discLabel}`;
      } else {
        el.textContent = fmt(finalTotal);
      }
    }
    // Dòng nhắc phải đúng ngay khi mở màn này, kể cả khi CHƯA tra SĐT — lúc đó
    // checkFreeToppingMemberPromo() bên dưới không chạy nên không ai cập nhật hộ.
    renderFreeTpReminder();
    // [FIX-freeTp-deferToCheckout] Đây là thời điểm DUY NHẤT popup chọn topping tặng
    // được bật từ luồng order. Đặt ở đây (sau showScreen('sc')) nên nó chạy cả ở lần
    // bấm Thanh toán thứ hai — tức khách đã chọn topping, quay ra gọi thêm ly nữa
    // thuộc chương trình, bấm Thanh toán lại thì popup hiện lại cho đúng những ly mới
    // (checkFreeToppingMemberPromo tự lọc bỏ ly đã có freeTpApplied).
    if (curCustomer) checkFreeToppingMemberPromo();
  })));
}

// Thêm món Food vào giỏ hàng (isFood = true để tách doanh thu)
function addFoodToCart(foodId) {
  const f = FOOD_MENU.find(x => x.id === foodId);
  if (!f) return;
  const key = 'food_' + foodId;
  if (cart[key]) {
    cart[key].qty++;
  } else {
    cart[key] = { itemId: foodId, name: f.name, size: '-', price: f.price, qty: 1, isFood: true };
  }
  renderCartDrawer();
  renderMenu();
  toast('Đã thêm ' + f.name + '!');
}

// ── Topping picker trong cart ──
// Mở topping picker — nếu qty > 1 và chưa có topping, hỏi tách trước
function openToppingPickerSplit(cartKey) {
  if (!cart[cartKey]) return;
  if (!TOPPINGS.length) { toast('Chưa có topping nào. Thêm trong Quản lý Menu!'); return; }

  const c = cart[cartKey];

  // Nếu qty > 1 và chưa có topping nào → hỏi thêm cho mấy ly
  if (c.qty > 1 && !(c.toppings && c.toppings.length)) {
    // Tạo popup chọn số ly tách
    showSplitQtyPopup(cartKey, c.qty);
    return;
  }

  // qty = 1 hoặc đã có topping rồi → mở picker thẳng
  openToppingPicker(cartKey);
}

// Popup hỏi "thêm topping cho mấy ly?"
function showSplitQtyPopup(cartKey, totalQty) {
  // Tạo overlay nếu chưa có
  let overlay = document.getElementById('split-qty-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'split-qty-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(3px);';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  // Tạo nội dung
  let btns = '';
  for (let i = 1; i <= totalQty; i++) {
    btns += `<button onclick="doSplitAndOpen('${cartKey}',${i},${totalQty})" style="flex:1;padding:14px 6px;background:#fff;border:2px solid #e0e0e0;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:16px;font-weight:700;color:var(--td);cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor='var(--gm)';this.style.background='var(--gl)'" onmouseout="this.style.borderColor='#e0e0e0';this.style.background='#fff'">${i} ly</button>`;
  }

  overlay.innerHTML = `
    <div style="background:#FFFCF0;border-radius:28px 28px 0 0;padding:24px 20px 36px;width:100%;max-width:430px;animation:pi .2s ease;">
      <div style="font-size:17px;font-weight:700;color:var(--td);margin-bottom:4px;">Thêm topping cho mấy ly?</div>
      <div style="font-size:12px;font-weight:600;color:var(--gt);margin-bottom:20px;">Tổng: ${totalQty} ly — phần còn lại sẽ không có topping</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">${btns}</div>
    </div>`;
}

// Tách món và mở picker
function doSplitAndOpen(cartKey, splitQty, totalQty) {
  // Đóng popup
  const overlay = document.getElementById('split-qty-overlay');
  if (overlay) overlay.remove();

  if (!cart[cartKey]) return;
  const c = cart[cartKey];

  if (splitQty === totalQty) {
    // Thêm topping cho tất cả → không cần tách
    openToppingPicker(cartKey);
    return;
  }

  // Tách: giảm qty gốc, tạo entry mới với splitQty để add topping
  const newKey = cartKey + '_tp' + Date.now();
  cart[newKey] = { itemId: c.itemId, name: c.name, size: c.size, price: c.price, qty: splitQty, toppings: [], isFree: c.isFree || false, ice: c.ice || cartIceDefault };
  cart[cartKey].qty -= splitQty;
  if (cart[cartKey].qty <= 0) delete cart[cartKey];

  renderMenu();
  renderCartDrawer();

  // Mở picker cho entry mới
  openToppingPicker(newKey);
}

// ============================================================
// TOPPING CÓ SỐ LƯỢNG
// Trước đây mỗi topping chỉ bật/tắt được một lần, nên khách muốn "2 phần trân
// châu" thì không có cách nào nhập. Giờ mỗi topping mang thêm `qty`.
//
// TƯƠNG THÍCH NGƯỢC: đơn cũ (và mọi bản ghi đã lưu trên Firebase) không có
// field `qty` — mọi chỗ đọc đều đi qua tpQty() nên tự hiểu là 1, khỏi phải sửa
// dữ liệu cũ. Chiều ngược lại cũng an toàn: qty nằm cạnh {name,price} như cũ.
//
// MỌI nơi tính tiền topping PHẢI dùng tpSum() thay vì tự reduce — sót một chỗ
// là bán 2 phần mà chỉ thu tiền 1 phần.
// ============================================================
function tpQty(t){ return Math.max(1, Number(t && t.qty) || 1); }

function tpSum(list){ return (list || []).reduce((s, t) => s + (Number(t.price) || 0) * tpQty(t), 0); }

function tpLabel(t){ return t.name + (tpQty(t) > 1 ? ` ×${tpQty(t)}` : ''); }

function tpCount(list){ return (list || []).reduce((s, t) => s + tpQty(t), 0); }

function openToppingPicker(cartKey) {
  if (!cart[cartKey]) return;
  if (!TOPPINGS.length) { toast('Chưa có topping nào. Thêm trong Quản lý Menu!'); return; }
  _tpPickerKey = cartKey;
  document.getElementById('tp-picker-sub').textContent = 'Chọn cho: ' + cart[cartKey].name + ' ' + cart[cartKey].size;
  const chosen = cart[cartKey].toppings || [];
  document.getElementById('tp-picker-list').innerHTML = TOPPINGS.map(t => {
    const toppingPrice = t.priceTogo;   // [F5] luôn To Go
    const cur = chosen.find(x => x.name === t.name);
    const q = cur ? tpQty(cur) : 0;
    // Chưa chọn → cả thẻ là nút bấm để thêm phần đầu tiên.
    // Đã chọn → hiện bộ − / số / + ; nút 44px cho đủ chuẩn chạm, và
    // stopPropagation để bấm +/− không kích hoạt luôn onclick của cả thẻ.
    return `<div ${q ? '' : `onclick="setCartToppingQty('${t.id}',1)"`} style="background:${q?'var(--gl)':'#fff'};border-radius:18px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;${q?'':'cursor:pointer;'}border:2px solid ${q?'var(--gm)':'#f0f0f0'};transition:all .15s;">
      <div style="min-width:0;flex:1;">
        <div style="font-size:16px;font-weight:700;color:var(--td);">${t.name}</div>
        <div style="font-size:13px;font-weight:700;color:var(--gm);margin-top:2px;">+${fmt(toppingPrice)}${q>1?` × ${q} = ${fmt(toppingPrice*q)}`:''}</div>
      </div>
      ${q ? `
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" onclick="event.stopPropagation()">
        <button onclick="event.stopPropagation(); setCartToppingQty('${t.id}',${q-1})" style="width:44px;height:44px;border-radius:12px;border:1.5px solid var(--gm);background:#fff;color:var(--gm);font-size:20px;font-weight:700;cursor:pointer;line-height:1;">−</button>
        <span style="min-width:26px;text-align:center;font-size:17px;font-weight:800;color:var(--td);font-variant-numeric:tabular-nums;">${q}</span>
        <button onclick="event.stopPropagation(); setCartToppingQty('${t.id}',${q+1})" style="width:44px;height:44px;border-radius:12px;border:none;background:var(--gd);color:#fff;font-size:20px;font-weight:700;cursor:pointer;line-height:1;">+</button>
      </div>`
      : `<span style="font-size:13px;font-weight:700;color:#bbb;flex-shrink:0;">Chạm để thêm</span>`}
    </div>`;
  }).join('');
  document.getElementById('tp-picker').style.display = 'flex';
}

function closeToppingPicker() {
  document.getElementById('tp-picker').style.display = 'none';
  _tpPickerKey = null;
}

// Đặt số lượng cho 1 topping. qty<=0 → gỡ khỏi giỏ.
function setCartToppingQty(toppingId, qty) {
  if (!_tpPickerKey || !cart[_tpPickerKey]) return;
  const t = TOPPINGS.find(x => x.id === toppingId);
  if (!t) return;
  const toppingPrice = t.priceTogo;   // [F5] luôn To Go
  const line = cart[_tpPickerKey];
  if (!line.toppings) line.toppings = [];
  const q = Math.max(0, Math.min(99, Number(qty) || 0)); // chặn trên 99 để lỡ bấm liên tục không ra số vô lý
  const idx = line.toppings.findIndex(x => x.name === t.name);
  if (q === 0) {
    if (idx >= 0) line.toppings.splice(idx, 1);
  } else if (idx >= 0) {
    line.toppings[idx].qty = q;
    line.toppings[idx].price = toppingPrice; // đồng bộ lại giá phòng khi vừa đổi mang đi/tại chỗ
    line.toppings[idx].id = t.id; // [NEW-GOGS] BTP cũ tạo trước khi có field này sẽ được vá lại id khi sửa số lượng
  } else {
    // [NEW-GOGS] Lưu kèm id topping (không chỉ name/price) — bên Quản lý dùng id này
    // để tra công thức GOGS topping (topping_recipes_gieogieo) và cộng đúng giá vốn
    // nguyên liệu vào COGS, kể cả khi topping được TẶNG (price=0) như chương trình
    // Free Topping cho thành viên — trước đây tặng topping không hề bị tính GOGS.
    line.toppings.push({ id: t.id, name: t.name, price: toppingPrice, qty: q });
  }
  openToppingPicker(_tpPickerKey);
  renderCartDrawer();
  updFooter();
}

// Giữ lại tên cũ (toggle) cho những chỗ còn gọi — bật lên 1 phần hoặc gỡ hẳn.
function addCartTopping(toppingId) {
  if (!_tpPickerKey || !cart[_tpPickerKey]) return;
  const t = TOPPINGS.find(x => x.id === toppingId);
  if (!t) return;
  const cur = (cart[_tpPickerKey].toppings || []).find(x => x.name === t.name);
  setCartToppingQty(toppingId, cur ? 0 : 1);
}

function removeCartTopping(cartKey, toppingIdx) {
  if (!cart[cartKey] || !cart[cartKey].toppings) return;
  cart[cartKey].toppings.splice(toppingIdx, 1);
  renderCartDrawer();
  updFooter();
}

PosGieoMods.cart = true;
