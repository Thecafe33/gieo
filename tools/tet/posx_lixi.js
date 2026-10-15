// [LÌ XÌ TẾT 2027 — PosX_tet.html (XOFA)] Sinh bởi tools/tao_ban_tet.js — KHÔNG sửa tay trong PosX_tet.html.
// Nhập SĐT tích điểm (#cuph) → khung khách hiện mã lì xì dùng được ở XOFA (tag "Tết 2027") → nhân viên bấm "Áp" → upsize: popup chọn ly trong giỏ
// (ly lên L giữ giá M, tag lì xì dưới món); giảm 5K: dòng giảm toàn đơn.
// Thanh toán xong (_loyaltyAfterSave — chạy sau khi đơn lưu thành công, mọi cách trả): đánh dấu mã đã dùng + cộng 1 lượt mở lì xì.
(function () {
  if (!window.LiXi) { console.warn('[lì xì] thiếu lixi.v1.js'); return; }
  LiXi.init({ fstore: fstore, db: db, FieldValue: firebase.firestore.FieldValue });
  var STORE = 'xofa', KEY = '__lixi__', cache = { phone: '', at: 0, codes: [] };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function phoneNow() { var el = document.getElementById('cuph'); return LiXi.normPhone(el ? el.value : ''); }
  function refresh() { if (typeof _refreshSc === 'function') _refreshSc(); else updFooter(); }

  var css = document.createElement('style');
  css.textContent = '#lixi-panel-x{margin:10px 0 0;border-radius:16px;background:linear-gradient(135deg,#fff7e6,#fdecd2);border:1.5px solid #e9b949;padding:10px 12px;display:none}' +
    '#lixi-panel-x .lx-h{display:flex;align-items:center;gap:8px;font-weight:900;font-size:13px;color:#7a1027}' +
    '#lixi-panel-x .lx-tag{font-size:10px;font-weight:900;letter-spacing:.06em;padding:3px 8px;border-radius:99px;background:#8b1530;color:#ffd977}' +
    '#lixi-panel-x .lx-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border-radius:12px;background:#fff;border:1px solid #f3d9a4}' +
    '#lixi-panel-x .lx-t{flex:1;min-width:0}#lixi-panel-x .lx-t b{display:block;font-size:13px;color:#5c0d1f}#lixi-panel-x .lx-t small{display:block;font-size:11px;color:#9a6a3a}' +
    '#lixi-panel-x .lx-btn{border:none;border-radius:99px;padding:7px 14px;font-weight:900;font-size:12px;cursor:pointer;background:linear-gradient(135deg,#a3172f,#6e0d22);color:#ffe7a3}' +
    '#lixi-panel-x .lx-btn.off{background:#eee;color:#888}#lixi-panel-x .lx-msg{font-size:11.5px;color:#9a6a3a;margin-top:6px}';
  document.head.appendChild(css);
  var panel = document.createElement('div'); panel.id = 'lixi-panel-x';
  var anchor = document.getElementById('voucherList');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);

  function render(codes, phone) {
    if (!codes.length) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
    var lk = lixiKey(), appliedId = lk ? cart[lk]._lixiCode : null;
    panel.innerHTML = '<div class="lx-h">🧧 Lì xì của khách <span class="lx-tag">TẾT 2027</span></div>' + codes.map(function (c) {
      var T = LiXi.TYPES[c.type], on = c.id === appliedId;
      return '<div class="lx-row"><div class="lx-t"><b>' + esc(T.label) + '</b><small>Mã ' + esc(c.id) + ' · ' + esc(T.note) + '</small></div>' +
        '<button class="lx-btn' + (on ? ' off' : '') + '" data-id="' + esc(c.id) + '">' + (on ? 'Bỏ' : 'Áp') + '</button></div>';
    }).join('') + '<div class="lx-msg">Mỗi bill dùng 1 mã · hạn ' + LiXi.useRange + '</div>';
    panel.style.display = 'block';
    Array.prototype.forEach.call(panel.querySelectorAll('.lx-btn'), function (b) {
      b.onclick = function () { var id = b.getAttribute('data-id'); var c = codes.filter(function (x) { return x.id === id; })[0]; if (c) toggle(c, phone); };
    });
  }
  function scan(p) {
    if (p.length < 10 || !LiXi.inUse()) { panel.style.display = 'none'; return; }
    if (cache.phone === p && Date.now() - cache.at < 60000) { render(cache.codes, p); return; }
    LiXi.usableCodes(p, STORE).then(function (codes) { cache = { phone: p, at: Date.now(), codes: codes }; if (phoneNow() === p) render(codes, p); })
      .catch(function (e) { console.warn('[lì xì] đọc mã', e); });
  }

  // Upsize: chọn món xong → nhập SĐT → bấm mã → popup chọn ly trong giỏ → ly đó thành size L, GIỮ GIÁ M,
  // tag lì xì gắn ngay dưới món (không có dòng "−xK"). Giảm 5K: dòng giảm toàn đơn (KEY).
  function isUp(it) { return !!(it && it._lixiCode && /^upsize/.test(it._lixiType || '')); }
  function lixiKey() { for (var k in cart) if (cart[k] && cart[k]._lixiCode) return k; return null; }
  function netWithout() { var t = getCartTotal(); return cart[KEY] ? t - (cart[KEY].price * cart[KEY].qty) : t; }
  function special(it) { return !it || it.isFree || it._vKey || it._discountId || it._lixiCode; }
  function sizesOf(it) {
    var M = (typeof getActiveMenu === 'function' ? getActiveMenu() : MENU) || [];
    var m = M.filter(function (x) { return x.id === it.itemId; })[0]; if (!m || !m.sizes) return null;
    var pm = m.sizes.filter(function (s) { return s.label === 'M'; })[0], pl = m.sizes.filter(function (s) { return s.label === 'L'; })[0];
    return (pm && pl && pl.price > pm.price) ? { M: pm.price, L: pl.price } : null;
  }
  function upCandidates() {
    return Object.keys(cart).filter(function (k) { var it = cart[k]; return !special(it) && !it.isFood && (it.size === 'M' || it.size === 'L') && sizesOf(it); })
      .map(function (k) { var z = sizesOf(cart[k]); return { k: k, it: cart[k], M: z.M, L: z.L }; });
  }
  function pickCup(c, phone) {
    var list = upCandidates();
    if (!list.length) { toast('🧧 Giỏ chưa có ly nào upsize được (món có size L). Chọn món trước rồi bấm Áp.'); return; }
    var modal = document.getElementById('xl-pick-modal'), listEl = document.getElementById('xl-pick-list');
    if (!modal || !listEl) { applyUpsize(c, phone, list[0]); return; }
    document.getElementById('xl-pick-title').innerText = '🧧 Lì xì: chọn ly upsize M → L';
    document.getElementById('xl-pick-subtitle').innerText = 'Mã ' + c.id + ' · ly được chọn lên size L, khách trả giá M';
    listEl.innerHTML = '';
    list.forEach(function (o) {
      var btn = document.createElement('button');
      btn.style.cssText = 'width:100%;padding:13px 16px;border-radius:16px;border:2px solid #f3d9a4;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-family:inherit;text-align:left;margin-bottom:6px;';
      btn.innerHTML = '<span style="font-weight:700;font-size:.92rem;color:#111;">' + esc(o.it.name) + ' <span style="color:#9ca3af;font-size:.78rem;">(' + esc(o.it.size) + (o.it.qty > 1 ? ' ×' + o.it.qty : '') + ')</span></span>' +
        '<span style="flex-shrink:0;margin-left:10px;font-weight:800;font-size:.85rem;color:#7a1027;">L <s style="color:#bbb;font-weight:600;">' + fmt(o.L) + '</s> ' + fmt(o.M) + '</span>';
      btn.onclick = function () { _xlPickCommitted = true; xlPickModalClose(); applyUpsize(c, phone, o); };
      listEl.appendChild(btn);
    });
    modal.style.display = 'flex';
    _xlPickCommitted = true;            // đóng popup lì xì không đụng tới voucher thường đang chọn dở
  }
  function applyUpsize(c, phone, o) {
    var it = cart[o.k]; if (!it || special(it)) { toast('🧧 Giỏ vừa thay đổi — bấm Áp lại.'); return; }
    var old = lixiKey(); if (old) removeLine(old, '');                                  // 1 bill 1 mã
    if (!cart[o.k] || cart[o.k] !== it) { toast('🧧 Giỏ vừa thay đổi — bấm Áp lại.'); refresh(); return; }
    var nk = o.k + '_lxL', one = Object.assign({}, it, { qty: 1, size: 'L', price: o.M,
      _lixiCode: c.id, _lixiPhone: phone, _lixiType: c.type, _lixiFrom: o.k, _lixiOrigSize: it.size, _lixiMPrice: o.M, _lixiLPrice: o.L });
    if (it.qty > 1) it.qty--; else delete cart[o.k];
    cart[nk] = one;
    refresh(); if (cache.phone) render(cache.codes, cache.phone);
    toast('🧧 Upsize M→L: ' + one.name);
  }
  // trả ly upsize về như trước khi áp (giá theo menu đang dùng — To Go / Tại quán)
  function revertUp(k) {
    var it = cart[k], z = sizesOf(it), size = it._lixiOrigSize || 'M', from = it._lixiFrom;
    var back = Object.assign({}, it, { size: size, price: z ? z[size] : it.price });
    ['_lixiCode', '_lixiPhone', '_lixiType', '_lixiFrom', '_lixiOrigSize', '_lixiMPrice', '_lixiLPrice'].forEach(function (f) { delete back[f]; });
    delete cart[k];
    if (from && cart[from] && _sameCartLine(cart[from], back)) cart[from].qty += back.qty;
    else if (from && !cart[from]) cart[from] = back;
    else cart[k + '_x'] = back;
  }
  // ly upsize chỉ 1 ly: bấm "+" → phần dư thành ly L thường
  function normalizeUp() {
    Object.keys(cart).forEach(function (k) {
      var it = cart[k]; if (!isUp(it) || it.qty <= 1) return;
      var extra = it.qty - 1; it.qty = 1;
      var z = sizesOf(it), lk = it.itemId + '_L', plain = Object.assign({}, it, { qty: extra, price: z ? z.L : it._lixiLPrice });
      ['_lixiCode', '_lixiPhone', '_lixiType', '_lixiFrom', '_lixiOrigSize', '_lixiMPrice', '_lixiLPrice'].forEach(function (f) { delete plain[f]; });
      if (cart[lk] && _sameCartLine(cart[lk], plain)) cart[lk].qty += extra; else cart[cart[lk] ? k + '_xL' : lk] = plain;
    });
  }
  function invalidReason(line) {
    var t = line._lixiType, T = LiXi.TYPES[t];
    if (t === 'upsize_xofa') return line.size === 'L' ? '' : 'ly không còn size L';
    if (t === 'giam5k_xofa') return netWithout() >= T.minOrder ? '' : 'đơn chưa tới ' + LiXi.fmtVnd(T.minOrder);
    return 'mã không dùng ở XOFA';
  }
  function removeLine(k, reason) {
    var line = cart[k]; if (!line) return;
    if (isUp(line)) revertUp(k); else delete cart[k];
    if (reason) toast('🧧 Đã bỏ mã lì xì ' + line._lixiCode + ': ' + reason);
  }
  function dropLine(reason) { var k = lixiKey(); if (k) removeLine(k, reason); }
  window.lixiDropCodeX = function () { dropLine(''); refresh(); if (cache.phone) render(cache.codes, cache.phone); };
  // Bấm "Áp": đọc lại mã từ Firebase (1 lượt) — mã vừa dùng ở máy / quầy khác thì báo ngay, không trừ tiền
  function toggle(c, phone) {
    var k = lixiKey();
    if (k && cart[k]._lixiCode === c.id) return toggleNow(c, phone);       // Bỏ — không cần đọc
    LiXi.usableCodes(phone, STORE, '').then(function (codes) {
      cache = { phone: phone, at: Date.now(), codes: codes }; render(codes, phone);
      var f = codes.filter(function (x) { return x.id === c.id; })[0];
      if (!f) { toast('🧧 Mã ' + c.id + ' vừa được dùng hoặc không còn hợp lệ.'); return; }
      toggleNow(f, phone);
    }).catch(function () { toast('🧧 Không kiểm tra được mã (mạng?) — thử lại.'); });
  }
  function toggleNow(c, phone) {
    var k = lixiKey();
    if (k && cart[k]._lixiCode === c.id) { dropLine(''); refresh(); render(cache.codes, phone); return; }
    if (typeof _appliedDiscountId !== 'undefined' && _appliedDiscountId) { toast('🧧 Bill đang dùng mã giảm giá khác — mỗi bill chỉ 1 mã.'); return; }
    if (c.type === 'upsize_xofa') return pickCup(c, phone);
    if (c.type === 'giam5k_xofa') {
      if (k) dropLine('');                                                // 1 bill 1 mã
      var T = LiXi.TYPES[c.type];
      if (netWithout() < T.minOrder) { toast('🧧 Mã giảm 5K áp cho đơn từ ' + LiXi.fmtVnd(T.minOrder) + '.'); refresh(); render(cache.codes, phone); return; }
      cart[KEY] = { name: '🧧 Lì xì Tết · Giảm 5K', size: '', price: -T.value, qty: 1,
        _discountId: 'lixi_' + c.id, _discountCode: c.id + ' · Lì xì Tết · Giảm 5K đơn từ 30K', _lixiCode: c.id, _lixiPhone: phone, _lixiType: c.type };
      refresh(); render(cache.codes, phone); return;
    }
    toast('🧧 Mã này không dùng ở XOFA.');
  }
  // tag lì xì ngay dưới ly upsize trong giỏ
  var _rcd = window.renderCartDrawer;
  if (typeof _rcd === 'function') window.renderCartDrawer = function () {
    var r = _rcd.apply(this, arguments);
    Object.keys(cart).forEach(function (k) {
      var it = cart[k]; if (!isUp(it)) return;
      var del = document.querySelector('#cartBody button.cart-del[onclick="cartDel(\'' + k + '\')"]'), row = del && del.closest('.cart-row');
      if (!row || row.querySelector('.lx-itag')) return;
      Array.prototype.forEach.call(row.querySelectorAll('.cqb'), function (b) { b.style.visibility = 'hidden'; });
      row.insertAdjacentHTML('beforeend', '<div class="lx-itag" style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:10px;background:#fff1d6;border:1px solid #f0c674;color:#7a1027;font-size:12px;font-weight:800;">' +
        '🧧 Lì xì Tết · Upsize M→L miễn phí <span style="margin-left:4px;"><s style="color:#b9a78a;font-weight:600;">' + fmt(it._lixiLPrice) + '</s></span>' +
        '<button type="button" onclick="lixiDropCodeX()" style="margin-left:auto;border:none;background:none;color:#b91c1c;font-weight:900;cursor:pointer;font-size:13px;">✕</button></div>');
    });
    return r;
  };
  // giỏ đổi (tăng/giảm/xoá món…) → mã không còn đủ điều kiện thì tự bỏ (báo nhân viên)
  var _uf = window.updFooter, inUf = false;
  if (typeof _uf === 'function') window.updFooter = function () {
    if (!inUf) { inUf = true; try { normalizeUp(); var k = lixiKey(); if (k) { var why = invalidReason(cart[k]); if (why) dropLine(why); } } finally { inUf = false; } }
    var r = _uf.apply(this, arguments);
    if (cache.phone && panel.style.display !== 'none') render(cache.codes, cache.phone);
    return r;
  };
  var _ca = window.cartAdj;
  if (typeof _ca === 'function') window.cartAdj = function (k, d) { if (isUp(cart[k])) return; return _ca.apply(this, arguments); };
  var _cd = window.cartDel;
  if (typeof _cd === 'function') window.cartDel = function (k) {
    if (k === KEY) { dropLine(''); updFooter(); refreshMenuBadges(); return; }
    return _cd.apply(this, arguments);
  };
  // chốt chặn trước khi lưu đơn (mọi cách trả đều qua confirmPay)
  var _cp = window.confirmPay;
  if (typeof _cp === 'function') window.confirmPay = function () {
    normalizeUp();
    var k = lixiKey(); if (k) { var why = invalidReason(cart[k]); if (why) { dropLine(why); refresh(); return; } }
    return _cp.apply(this, arguments);
  };
  // ── móc vào app ──
  var _rci = window.renderCustomerInfo;
  if (typeof _rci === 'function') window.renderCustomerInfo = function () { var r = _rci.apply(this, arguments); scan(phoneNow()); return r; };
  var _clr = window.clearCustomer;
  if (typeof _clr === 'function') window.clearCustomer = function () { panel.style.display = 'none'; return _clr.apply(this, arguments); };
  // nút ✕ của dòng giảm 5K gọi removeAppliedDiscount() (dòng có _discountId): không có mã giảm giá thường đang áp → bỏ dòng lì xì
  var _rad = window.removeAppliedDiscount;
  if (typeof _rad === 'function') window.removeAppliedDiscount = function () {
    if (!_appliedDiscountId && cart[KEY]) { dropLine(''); if (cache.phone) render(cache.codes, cache.phone); }
    return _rad.apply(this, arguments);
  };
  // đổi To Go ↔ Tại quán: app tính lại giá + gỡ mã giảm giá đang áp → lì xì cũng gỡ (giá chênh M/L khác nhau), nhân viên áp lại
  var _tg = window.toggleTogo;
  if (typeof _tg === 'function') window.toggleTogo = function () {
    var before = isToGo, r = _tg.apply(this, arguments);
    if (isToGo !== before && lixiKey()) { dropLine('đổi ' + (isToGo ? 'To Go' : 'Tại quán') + ' — bấm Áp lại'); refresh(); if (cache.phone) render(cache.codes, cache.phone); }
    return r;
  };
  var _adc = window.applyDiscountCode;
  if (typeof _adc === 'function') window.applyDiscountCode = function () {
    if (lixiKey()) { toast('🧧 Bill đang áp lì xì — bỏ lì xì trước khi nhập mã khác (mỗi bill 1 mã).'); return; }
    return _adc.apply(this, arguments);
  };
  var _las = window._loyaltyAfterSave;
  if (typeof _las === 'function') window._loyaltyAfterSave = function (items, total, orderId) {
    var phone = phoneNow(), line = null;
    (items || []).forEach(function (it) { if (it && it._lixiCode) line = it; });
    var r = _las.apply(this, arguments);
    if (line) {
      var amt = isUp(line) ? (Number(line._lixiLPrice) || 0) - (Number(line.price) || 0) : -Number(line.price) || 0;
      LiXi.markUsed(line._lixiPhone, line._lixiCode, { store: STORE, bill: orderId || '', amount: amt })
        .catch(function (e) { toast('🧧 Mã ' + line._lixiCode + ' không đánh dấu được (' + e.message + ')'); });
      cache = { phone: '', at: 0, codes: [] };
    }
    if (phone.length >= 10) LiXi.grantOpen(phone, STORE, orderId || '').catch(function (e) { console.warn('[lì xì] cộng lượt', e); });
    return r;
  };
})();
