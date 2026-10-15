// [LÌ XÌ TẾT 2027 — PosX_tet.html (XOFA)] Sinh bởi tools/tao_ban_tet.js — KHÔNG sửa tay trong PosX_tet.html.
// Nhập SĐT tích điểm (#cuph) → khung khách hiện mã lì xì dùng được ở XOFA (tag "Tết 2027") → nhân viên bấm "Áp" → dòng giảm trong giỏ.
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
    var appliedId = cart[KEY] ? cart[KEY]._lixiCode : null;
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

  function netWithout() { var t = getCartTotal(); return cart[KEY] ? t - (cart[KEY].price * cart[KEY].qty) : t; }
  function special(it) { return !it || it.isFree || it._vKey || it._discountId || it._lixiCode; }
  function sizesOf(it) {
    var M = (typeof getActiveMenu === 'function' ? getActiveMenu() : MENU) || [];
    var m = M.filter(function (x) { return x.id === it.itemId; })[0]; if (!m || !m.sizes) return null;
    var pm = m.sizes.filter(function (s) { return s.label === 'M'; })[0], pl = m.sizes.filter(function (s) { return s.label === 'L'; })[0];
    return (pm && pl && pl.price > pm.price) ? { M: pm.price, L: pl.price } : null;
  }
  // Upsize: khách mua M → tách 1 ly sang L (pha chế thấy đúng size L), dòng lì xì trừ phần chênh → khách trả giá M.
  function doUpsize(code) {
    var keys = Object.keys(cart);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], it = cart[k]; if (special(it) || it._lixiUp || it.size !== 'M') continue;
      var z = sizesOf(it); if (!z) continue;
      var nk = k + '_lxL';
      if (it.qty > 1) { it.qty--; cart[nk] = Object.assign({}, it, { qty: 1, size: 'L', price: z.L, _lixiUp: code, _lixiFrom: k, _lixiMPrice: it.price }); }
      else { delete cart[k]; cart[nk] = Object.assign({}, it, { size: 'L', price: z.L, _lixiUp: code, _lixiFrom: k, _lixiMPrice: it.price }); }
      return { amt: z.L - z.M };
    }
    var best = 0;
    Object.keys(cart).forEach(function (k) { var it = cart[k]; if (special(it) || it.size !== 'L') return; var z = sizesOf(it); if (z) best = Math.max(best, z.L - z.M); });
    return best > 0 ? { amt: best } : { err: 'Giỏ chưa có ly nào size M (có size L) để upsize.' };
  }
  function undoUpsize(code) {
    Object.keys(cart).forEach(function (k) {
      var it = cart[k]; if (!it || it._lixiUp !== code) return;
      // trả ĐÚNG 1 ly về M (dòng L có thể đã bị bấm + thêm ly: phần còn lại giữ là ly L thường)
      var z = sizesOf(it), from = it._lixiFrom, back = Object.assign({}, it, { size: 'M', price: z ? z.M : it._lixiMPrice, qty: 1 });   // giá M theo menu đang dùng (To Go / Tại quán)
      delete back._lixiUp; delete back._lixiFrom; delete back._lixiMPrice;
      if (it.qty > 1) { it.qty--; delete it._lixiUp; delete it._lixiFrom; delete it._lixiMPrice; } else delete cart[k];
      if (cart[from]) cart[from].qty++; else cart[from] = back;
    });
  }
  function invalidReason(line) {
    var t = line._lixiType, T = LiXi.TYPES[t];
    if (t === 'upsize_xofa') {
      var ok = Object.keys(cart).some(function (k) { var it = cart[k]; if (special(it) || it.size !== 'L') return false; var z = sizesOf(it); return z && z.L - z.M >= -line.price; });
      return ok ? '' : 'giỏ không còn ly size L được upsize';
    }
    if (t === 'giam5k_xofa') return netWithout() >= T.minOrder ? '' : 'đơn chưa tới ' + LiXi.fmtVnd(T.minOrder);
    return 'mã không dùng ở XOFA';
  }
  function dropLine(reason) {
    var line = cart[KEY]; if (!line) return;
    delete cart[KEY]; undoUpsize(line._lixiCode);
    if (reason) toast('🧧 Đã bỏ mã lì xì ' + line._lixiCode + ': ' + reason);
  }
  // Bấm "Áp": đọc lại mã từ Firebase (1 lượt) — mã vừa dùng ở máy / quầy khác thì báo ngay, không trừ tiền
  function toggle(c, phone) {
    var on = '';
    for (var k in cart) if (cart[k] && cart[k]._lixiCode) on = cart[k]._lixiCode;
    if (on === c.id) return toggleNow(c, phone);                         // Bỏ — không cần đọc
    LiXi.usableCodes(phone, STORE, '').then(function (codes) {
      cache = { phone: phone, at: Date.now(), codes: codes }; render(codes, phone);
      var f = codes.filter(function (x) { return x.id === c.id; })[0];
      if (!f) { (typeof toast === 'function' ? toast : alert)('🧧 Mã ' + c.id + ' vừa được dùng hoặc không còn hợp lệ.'); return; }
      toggleNow(f, phone);
    }).catch(function (e) { (typeof toast === 'function' ? toast : alert)('🧧 Không kiểm tra được mã (mạng?) — thử lại.'); });
  }
  function toggleNow(c, phone) {
    if (cart[KEY] && cart[KEY]._lixiCode === c.id) { dropLine(''); refresh(); render(cache.codes, phone); return; }
    if (typeof _appliedDiscountId !== 'undefined' && _appliedDiscountId) { toast('🧧 Bill đang dùng mã giảm giá khác — mỗi bill chỉ 1 mã.'); return; }
    if (cart[KEY]) dropLine('');                                         // 1 bill 1 mã
    var r;
    if (c.type === 'upsize_xofa') r = doUpsize(c.id);
    else if (c.type === 'giam5k_xofa') r = netWithout() >= LiXi.TYPES[c.type].minOrder ? { amt: LiXi.TYPES[c.type].value } : { err: 'Mã giảm 5K áp cho đơn từ ' + LiXi.fmtVnd(LiXi.TYPES[c.type].minOrder) + '.' };
    else r = { err: 'Mã này không dùng ở XOFA.' };
    if (r.err) { toast('🧧 ' + r.err); refresh(); render(cache.codes, phone); return; }
    cart[KEY] = { name: '🧧 Lì xì Tết 2027 · ' + LiXi.TYPES[c.type].short, size: '', price: -r.amt, qty: 1,
      _discountId: 'lixi_' + c.id, _discountCode: c.id + ' · Lì xì Tết', _lixiCode: c.id, _lixiPhone: phone, _lixiType: c.type };
    refresh(); render(cache.codes, phone);
  }
  // giỏ đổi (tăng/giảm/xoá món…) → mã không còn đủ điều kiện thì tự bỏ (báo nhân viên)
  var _uf = window.updFooter, inUf = false;
  if (typeof _uf === 'function') window.updFooter = function () {
    if (!inUf && cart[KEY]) { var why = invalidReason(cart[KEY]); if (why) { inUf = true; try { dropLine(why); } finally { inUf = false; } } }
    var r = _uf.apply(this, arguments);
    if (cache.phone && panel.style.display !== 'none') render(cache.codes, cache.phone);
    return r;
  };
  var _cd = window.cartDel;
  if (typeof _cd === 'function') window.cartDel = function (k) {
    if (k === KEY) { dropLine(''); updFooter(); refreshMenuBadges(); return; }
    return _cd.apply(this, arguments);
  };
  // chốt chặn trước khi lưu đơn (mọi cách trả đều qua confirmPay)
  var _cp = window.confirmPay;
  if (typeof _cp === 'function') window.confirmPay = function () {
    if (cart[KEY]) { var why = invalidReason(cart[KEY]); if (why) { dropLine(why); refresh(); return; } }
    return _cp.apply(this, arguments);
  };

  // ── móc vào app ──
  var _rci = window.renderCustomerInfo;
  if (typeof _rci === 'function') window.renderCustomerInfo = function () { var r = _rci.apply(this, arguments); scan(phoneNow()); return r; };
  var _clr = window.clearCustomer;
  if (typeof _clr === 'function') window.clearCustomer = function () { panel.style.display = 'none'; return _clr.apply(this, arguments); };
  // nút ✕ của dòng lì xì gọi removeAppliedDiscount() (dòng có _discountId): không có mã giảm giá thường đang áp → bỏ dòng lì xì
  var _rad = window.removeAppliedDiscount;
  if (typeof _rad === 'function') window.removeAppliedDiscount = function () {
    if (!_appliedDiscountId && cart[KEY]) { dropLine(''); if (cache.phone) render(cache.codes, cache.phone); }
    return _rad.apply(this, arguments);
  };
  // đổi To Go ↔ Tại quán: app tính lại giá + gỡ mã giảm giá đang áp → lì xì cũng gỡ (giá chênh M/L khác nhau), nhân viên áp lại
  var _tg = window.toggleTogo;
  if (typeof _tg === 'function') window.toggleTogo = function () {
    var before = isToGo, r = _tg.apply(this, arguments);
    if (isToGo !== before && cart[KEY]) { dropLine('đổi ' + (isToGo ? 'To Go' : 'Tại quán') + ' — bấm Áp lại'); refresh(); if (cache.phone) render(cache.codes, cache.phone); }
    return r;
  };
  var _adc = window.applyDiscountCode;
  if (typeof _adc === 'function') window.applyDiscountCode = function () {
    if (cart[KEY]) { toast('🧧 Bill đang áp lì xì — bỏ lì xì trước khi nhập mã khác (mỗi bill 1 mã).'); return; }
    return _adc.apply(this, arguments);
  };
  var _las = window._loyaltyAfterSave;
  if (typeof _las === 'function') window._loyaltyAfterSave = function (items, total, orderId) {
    var phone = phoneNow(), line = null;
    (items || []).forEach(function (it) { if (it && it._lixiCode) line = it; });
    var r = _las.apply(this, arguments);
    if (line) {
      LiXi.markUsed(line._lixiPhone, line._lixiCode, { store: STORE, bill: orderId || '', amount: -Number(line.price) || 0 })
        .catch(function (e) { toast('🧧 Mã ' + line._lixiCode + ' không đánh dấu được (' + e.message + ')'); });
      cache = { phone: '', at: 0, codes: [] };
    }
    if (phone.length >= 10) LiXi.grantOpen(phone, STORE, orderId || '').catch(function (e) { console.warn('[lì xì] cộng lượt', e); });
    return r;
  };
})();
