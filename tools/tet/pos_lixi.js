// [LÌ XÌ TẾT 2027 — pos_tet.html (The cafe 33)] Sinh bởi tools/tao_ban_tet.js — KHÔNG sửa tay trong pos_tet.html.
// Nhập SĐT tích điểm → hiện mã lì xì dùng được ở The cafe 33 (tag "Tết 2027") → nhân viên bấm "Áp" → dòng giảm trong giỏ.
// Thanh toán xong: đánh dấu mã đã dùng + cộng 1 lượt mở lì xì cho SĐT (trong giai đoạn phát). Tab Quản lý "Lì xì 2027".
(function () {
  if (!window.LiXi) { console.warn('[lì xì] thiếu lixi.v1.js'); return; }
  LiXi.init({ fstore: fstore, db: db, FieldValue: firebase.firestore.FieldValue });
  var STORE = 'tc33', LINE = '🧧 Lì xì Tết 2027', cache = { phone: '', bk: '', at: 0, codes: [] }, timer = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function phoneNow() { var el = document.getElementById('kh-sdt'); return LiXi.normPhone(el ? el.value : ''); }
  function lixiLine() { for (var i = 0; i < cart.length; i++) if (cart[i] && cart[i]._lixiCode) return i; return -1; }
  function bedLines() { return cart.filter(function (c) { var n = String(c && c.name || '').toLowerCase(); return !c._vKey && !c._discountId && (n === '1h bed' || n === '1h bed từ h5'); }); }

  // ── panel ──
  var css = document.createElement('style');
  css.textContent = '#lixi-panel{margin:10px 0 0;border-radius:16px;background:linear-gradient(135deg,#fff7e6,#fdecd2);border:1.5px solid #e9b949;padding:10px 12px;display:none}' +
    '#lixi-panel .lx-h{display:flex;align-items:center;gap:8px;font-weight:900;font-size:13px;color:#7a1027}' +
    '#lixi-panel .lx-tag{font-size:10px;font-weight:900;letter-spacing:.06em;padding:3px 8px;border-radius:99px;background:#8b1530;color:#ffd977}' +
    '#lixi-panel .lx-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border-radius:12px;background:#fff;border:1px solid #f3d9a4}' +
    '#lixi-panel .lx-t{flex:1;min-width:0}#lixi-panel .lx-t b{display:block;font-size:13px;color:#5c0d1f}#lixi-panel .lx-t small{display:block;font-size:11px;color:#9a6a3a}' +
    '#lixi-panel .lx-btn{border:none;border-radius:99px;padding:7px 14px;font-weight:900;font-size:12px;cursor:pointer;background:linear-gradient(135deg,#a3172f,#6e0d22);color:#ffe7a3}' +
    '#lixi-panel .lx-btn.off{background:#eee;color:#888}' +
    '#lixi-panel .lx-msg{font-size:11.5px;color:#9a6a3a;margin-top:6px}';
  document.head.appendChild(css);
  var panel = document.createElement('div'); panel.id = 'lixi-panel';
  var anchor = document.getElementById('gift-panel') || document.getElementById('sdt-status');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);

  function render(codes, phone) {
    if (!codes.length) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
    var li = lixiLine(), appliedId = li >= 0 ? cart[li]._lixiCode : null;
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
  function curBk() { return (typeof pendingBedOrder !== 'undefined' && pendingBedOrder) ? (pendingBedOrder.id || pendingBedOrder.key || '') : ''; }   // mã giữ cho lịch nào thì chỉ lịch đó thấy
  function scan(force) {
    var p = phoneNow();
    if (p.length < 10 || !LiXi.inUse()) { panel.style.display = 'none'; return; }
    var bk = curBk();
    if (!force && cache.phone === p && cache.bk === bk && Date.now() - cache.at < 60000) { render(cache.codes, p); return; }
    LiXi.usableCodes(p, STORE, bk).then(function (codes) { cache = { phone: p, bk: bk, at: Date.now(), codes: codes }; if (phoneNow() === p) render(codes, p); })
      .catch(function (e) { console.warn('[lì xì] đọc mã', e); });
  }
  function scanSoon() { clearTimeout(timer); timer = setTimeout(scan, 600); }

  // ── điều kiện + số tiền từng loại ──
  function special(it) { return !it || it._vKey || it._discountId || it._lixiCode; }
  function menuOf(name) { return (menu || []).filter(function (x) { return String(x.name).toLowerCase() === String(name).toLowerCase(); })[0]; }
  function bedHours() { return bedLines().reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0); }
  function lastHourPrice() {      // giờ được tặng = giờ CUỐI của lịch → giá "1h bed từ h5" nếu lịch > 4 giờ
    var beds = bedLines(), h5 = beds.filter(function (l) { return String(l.name).toLowerCase() === '1h bed từ h5'; })[0];
    var h1 = beds.filter(function (l) { return String(l.name).toLowerCase() === '1h bed'; })[0];
    return Number((h5 || h1 || {}).price) || 0;
  }
  function bookingKey(bk) { return bk ? (bk.id || bk.key || '') : ''; }
  // Upsize: khách mua M → tách 1 ly sang L (pha chế thấy đúng size L), dòng lì xì trừ phần chênh → khách trả giá M.
  // Giỏ đã có sẵn ly L (nhân viên bấm L) → chỉ trừ phần chênh.
  function doUpsize(code) {
    for (var i = 0; i < cart.length; i++) {
      var it = cart[i]; if (special(it) || it._lixiUp || it.size !== 'M') continue;
      var m = menuOf(it.name); if (!m || !(m.priceM > 0) || !(m.priceL > m.priceM)) continue;
      if (it.qty > 1) { it.qty--; cart.splice(i + 1, 0, Object.assign({}, it, { qty: 1, size: 'L', price: m.priceL, _lixiUp: code, _lixiMPrice: it.price })); }
      else { it._lixiMPrice = it.price; it.size = 'L'; it.price = m.priceL; it._lixiUp = code; }
      return { amt: m.priceL - m.priceM };
    }
    var best = 0;
    cart.forEach(function (it) { if (special(it) || it.size !== 'L') return; var m = menuOf(it.name); if (m && m.priceM > 0 && m.priceL > m.priceM) best = Math.max(best, m.priceL - m.priceM); });
    return best > 0 ? { amt: best } : { err: 'Giỏ chưa có ly nào size M (có size L) để upsize.' };
  }
  // Trả ĐÚNG 1 ly về M (dòng L có thể đã bị bấm thêm ly L → qty > 1: phần còn lại giữ là ly L thường)
  function undoUpsize(code) {
    for (var i = cart.length - 1; i >= 0; i--) {
      var it = cart[i]; if (!it || it._lixiUp !== code) continue;
      var mPrice = it._lixiMPrice;
      delete it._lixiUp; delete it._lixiSplit; delete it._lixiMPrice;
      if (it.qty > 1) it.qty--; else cart.splice(i, 1);
      var back = cart.filter(function (c) { return !special(c) && c.name === it.name && c.size === 'M'; })[0];
      if (back) back.qty++; else cart.splice(i, 0, { name: it.name, size: 'M', price: mPrice, qty: 1 });
    }
  }
  /** Còn hợp lệ với giỏ hiện tại không (gọi mỗi lần giỏ đổi + ngay trước khi thanh toán) → '' hoặc lý do */
  function invalidReason(line) {
    var t = line._lixiType, T = LiXi.TYPES[t];
    if (t === 'upsize_tc33') {
      var ok = cart.some(function (it) { if (special(it) || it.size !== 'L') return false; var m = menuOf(it.name); return m && m.priceL - m.priceM >= -line.price; });
      return ok ? '' : 'giỏ không còn ly size L được upsize';
    }
    if (t === 'giam10k_bed') return bedHours() > 0 ? '' : 'bill không còn giờ bed';
    if (t === 'bed1h') return bedHours() >= (T.minBedHours || 2) + 1 ? '' : 'lịch không còn đủ ' + ((T.minBedHours || 2) + 1) + ' giờ (2 giờ + 1 giờ tặng)';
    return 'mã không dùng ở The cafe 33';
  }
  // Bỏ dòng lì xì: trả ly upsize về M; mã +1h bed thì trả lịch về giờ kết thúc cũ (và trả mã nếu app khách đã giữ)
  function removeLine(li, reason, keepBooking) {
    var line = cart[li]; cart.splice(li, 1); undoUpsize(line._lixiCode);
    if (line._lixiType === 'bed1h' && !keepBooking) revertBed1h(line._lixiCode);
    if (reason) alert('🧧 Đã bỏ mã lì xì ' + line._lixiCode + ': ' + reason + '.');
  }
  function dropLine(reason) { var li = lixiLine(); if (li >= 0) removeLine(li, reason); }
  function pushLine(c, amt, phone, bkPath) {
    var li = lixiLine(); if (li >= 0) removeLine(li, '');   // 1 bill 1 mã
    cart.push({ name: LINE + ' · ' + LiXi.TYPES[c.type].short, size: '', price: -amt, qty: 1,
      _discountId: 'lixi_' + c.id, _discountCode: c.id, _discountTarget: 'Lì xì Tết 2027', _lixiCode: c.id, _lixiPhone: phone, _lixiType: c.type,
      _lixiBkPath: bkPath || '' });
  }
  function bkPathOf(bk) { try { return (bk && _getBedBookingPath(bk)) || ''; } catch (e) { return ''; } }
  function patchLocal(bk, data) {
    ((typeof globalAllBookings !== 'undefined' && globalAllBookings) || []).forEach(function (b) { if (b !== bk && bookingKey(b) && bookingKey(b) === bookingKey(bk)) Object.assign(b, data); });
    Object.assign(bk, data);
  }
  function revertBed1h(code) {
    var bk = pendingBedOrder, L = bk && bk.lixiBed1h;
    if (!L || L.code !== code || L.used || !bk.end) return;
    var base = LiXi.hm(LiXi.mins(bk.end) - (Number(L.freeMin) || LiXi.BED_FREE_MIN));   // tính từ giờ kết thúc hiện tại (khách có thể đã đổi giờ trên app)
    patchLocal(bk, { end: base, lixiBed1h: null });
    _updateBedBooking(bk, { end: base, lixiBed1h: null }, function (err) { if (err) alert('🧧 Không trả lịch về ' + base + ': ' + err.message); });
    if (L.by === 'app') LiXi.unreserve(L.phone, code, bookingKey(bk)).catch(function (e) { console.warn('[lì xì] trả mã', e); });
    setTimeout(function () { autoAddBedItems(bk); if (typeof showSyncToast === 'function') showSyncToast('🧧 Đã bỏ +1h bed — lịch về lại ' + base); }, 0);
  }
  var silent = false;
  function rerender() { silent = true; try { renderCart(); } finally { silent = false; } if (cache.phone) render(cache.codes, cache.phone); }

  // Bấm "Áp": đọc lại mã từ Firebase (1 lượt) — mã vừa dùng ở máy / quầy khác thì báo ngay, không trừ tiền
  function toggle(c, phone) {
    var on = '';
    for (var k in cart) if (cart[k] && cart[k]._lixiCode) on = cart[k]._lixiCode;
    if (on === c.id) return toggleNow(c, phone);                         // Bỏ — không cần đọc
    var bk = curBk();
    LiXi.usableCodes(phone, STORE, bk).then(function (codes) {
      cache = { phone: phone, bk: bk, at: Date.now(), codes: codes }; render(codes, phone);
      var f = codes.filter(function (x) { return x.id === c.id; })[0];
      if (!f) { (typeof toast === 'function' ? toast : alert)('🧧 Mã ' + c.id + ' vừa được dùng hoặc không còn hợp lệ.'); return; }
      toggleNow(f, phone);
    }).catch(function (e) { (typeof toast === 'function' ? toast : alert)('🧧 Không kiểm tra được mã (mạng?) — thử lại.'); });
  }
  function toggleNow(c, phone) {
    var li = lixiLine();
    if (li >= 0 && cart[li]._lixiCode === c.id) {                       // Bỏ
      dropLine(''); rerender(); return;
    }
    if (c.type === 'upsize_tc33') {
      var li2 = lixiLine(); if (li2 >= 0) removeLine(li2, '');
      var u = doUpsize(c.id); if (u.err) { alert('🧧 ' + u.err); rerender(); return; }
      pushLine(c, u.amt, phone); rerender(); return;
    }
    if (c.type === 'giam10k_bed') {
      if (bedHours() <= 0) { alert('🧧 Bill chưa có giờ bed.'); return; }
      pushLine(c, LiXi.TYPES[c.type].value, phone); rerender(); return;
    }
    if (c.type === 'bed1h') return applyBed1h(c, phone);
    alert('🧧 Mã này không dùng ở The cafe 33.');
  }
  // +1h bed áp ở quầy: lịch đang tính tiền được KÉO DÀI thêm 1 giờ (Đặt bed / Check lịch trống thấy đúng giờ kết thúc mới),
  // rồi tính lại giờ bed + dòng trừ 1 giờ. Lịch đặt qua app đã giữ mã → đã kéo dài sẵn lúc đặt, chỉ thêm dòng trừ.
  function applyBed1h(c, phone) {
    var bk = pendingBedOrder, T = LiXi.TYPES.bed1h;
    if (!bk) { alert('🧧 Mã +1h bed chỉ áp khi tính tiền 1 lịch bed (mở lịch bed rồi order).'); return; }
    if (bk.lixiBed1h && bk.lixiBed1h.code && bk.lixiBed1h.code !== c.id) { alert('🧧 Lịch này đã dùng mã +1h khác (' + bk.lixiBed1h.code + ').'); return; }
    if (bk.lixiBed1h) { autoAddBedItems(bk); return; }
    var paidH = bedHours();
    if (paidH < (T.minBedHours || 2)) { alert('🧧 Mã +1h bed áp cho lịch từ ' + (T.minBedHours || 2) + ' giờ trở lên.'); return; }
    var newEnd = LiXi.hm(LiXi.mins(bk.end) + LiXi.BED_FREE_MIN), close = (typeof currentBedClosingTime === 'string' && currentBedClosingTime) || '20:50';
    if (LiXi.mins(newEnd) > LiXi.mins(close) || LiXi.mins(newEnd) <= LiXi.mins(bk.end)) { alert('🧧 Lịch kết thúc ' + bk.end + ' — cộng thêm 1 giờ sẽ quá giờ đóng cửa (' + close + ').'); return; }
    var info = { code: c.id, phone: phone, freeMin: LiXi.BED_FREE_MIN, baseEnd: bk.end, by: 'pos' };
    if (typeof showSyncToast === 'function') showSyncToast('🧧 Đang cộng 1 giờ vào lịch…');
    _updateBedBooking(bk, { end: newEnd, lixiBed1h: info }, function (err) {
      if (err) { alert('🧧 Không kéo dài được lịch: ' + err.message); return; }
      patchLocal(bk, { end: newEnd, lixiBed1h: info });
      autoAddBedItems(bk);
      if (typeof showSyncToast === 'function') showSyncToast('🧧 Lịch được cộng thêm 1 giờ — kết thúc ' + newEnd);
    });
  }

  // ── móc vào app ──
  var _check = window.checkSdtLive;
  if (typeof _check === 'function') window.checkSdtLive = function () { var r = _check.apply(this, arguments); scanSoon(); return r; };
  var _reset = window.resetPhoneInput;
  if (typeof _reset === 'function') window.resetPhoneInput = function () { var r = _reset.apply(this, arguments); panel.style.display = 'none'; return r; };
  // giỏ đổi → mã không còn đủ điều kiện thì tự bỏ (báo nhân viên)
  var _rc = window.renderCart;
  if (typeof _rc === 'function') window.renderCart = function () {
    if (!silent) { var li = lixiLine(); if (li >= 0) { var why = invalidReason(cart[li]); if (why) dropLine(why); } }
    var r = _rc.apply(this, arguments);
    if (!silent && cache.phone && panel.style.display !== 'none') render(cache.codes, cache.phone);
    return r;
  };
  var _rci = window.removeCartItem;
  if (typeof _rci === 'function') window.removeCartItem = function (idx) {
    var it = cart[idx];
    if (it && it._lixiCode) { removeLine(idx, ''); rerender(); return; }
    return _rci.apply(this, arguments);
  };
  // lịch bed: tính giờ xong → lịch có +1h lì xì (đặt qua app / áp ở quầy) thì thêm dòng trừ giờ cuối
  var _aab = window.autoAddBedItems;
  if (typeof _aab === 'function') window.autoAddBedItems = function (booking) {
    var r = _aab.apply(this, arguments);
    var L = booking && booking.lixiBed1h;
    if (L && L.code && /^TET[A-Z0-9]{5}$/.test(L.code) && !L.used && LiXi.inUse()) {
      var li = lixiLine(), ph = LiXi.normPhone(L.phone || booking.phone);
      if (!(li >= 0 && cart[li]._lixiCode === L.code)) {
        pushLine({ id: L.code, type: 'bed1h' }, lastHourPrice(), ph, bkPathOf(booking));
        rerender();
        if (typeof showSyncToast === 'function') showSyncToast('🧧 Lịch có lì xì +1h bed — đã trừ 1 giờ (mã ' + L.code + ')');
        // kiểm lại trên Firebase: mã đã dùng (bill trước của lịch này / máy khác) → bỏ dòng trừ, lịch giữ nguyên
        LiXi.usableCodes(ph, STORE, bookingKey(booking)).then(function (codes) {
          if (codes.some(function (x) { return x.id === L.code; })) return;
          var k = lixiLine(); if (k >= 0 && cart[k]._lixiCode === L.code) { removeLine(k, 'mã đã dùng hoặc hết hạn', true); rerender(); }
        }).catch(function () {});
      }
    }
    return r;
  };
  // chốt chặn trước khi lưu đơn
  var _save = window.saveOrderToFirebase;
  if (typeof _save === 'function') window.saveOrderToFirebase = function () {
    var li = lixiLine();
    if (li >= 0) { var why = invalidReason(cart[li]); if (why) { dropLine(why); rerender(); return; } }
    return _save.apply(this, arguments);
  };
  /** gọi từ _pushPaidOrder (đơn đã lưu thành công) */
  window.lixiAfterPaid = function (phone, rawSdt, orderData) {
    var items = (orderData && orderData.itemsArray) || [], line = null;
    items.forEach(function (it) { if (it && it._lixiCode) line = it; });
    if (line) {
      LiXi.markUsed(line._lixiPhone, line._lixiCode, { store: STORE, amount: -Number(line.price) || 0 })
        .then(function () { if (line._lixiType === 'bed1h' && line._lixiBkPath) db.ref(line._lixiBkPath + '/lixiBed1h/used').set(true); })
        .catch(function (e) { alert('🧧 Mã lì xì ' + line._lixiCode + ' không đánh dấu được (' + e.message + ') — kiểm tra lại.'); });
      cache = { phone: '', bk: '', at: 0, codes: [] };
    }
    var p = LiXi.normPhone(rawSdt);
    if (p.length >= 10) LiXi.grantOpen(p, STORE, '').catch(function (e) { console.warn('[lì xì] cộng lượt', e); });
    panel.style.display = 'none';
  };

  // ── tab Quản lý "Lì xì 2027" (thống kê + xoá dữ liệu, mã 3367) ──
  function mkBtn(src, id) {
    if (!src) return null;
    var b = src.cloneNode(false); b.id = id; b.removeAttribute('onclick'); b.onclick = function () { window.switchMgrTab('lixi'); };
    b.textContent = '🧧 Lì xì 2027'; b.style.background = 'transparent'; b.style.color = '#6b7280'; b.style.boxShadow = 'none';
    src.parentNode.insertBefore(b, src.nextSibling); return b;
  }
  var tabBtn = mkBtn(document.getElementById('mgr-tab-label'), 'mgr-tab-lixi');
  var tabMob = mkBtn(document.getElementById('mgr-mob-tab-label'), 'mgr-mob-tab-lixi');
  var colC = document.getElementById('mgr-col-c'), pane = null;
  if (colC) {
    pane = document.createElement('div'); pane.id = 'mgr-c-lixi';
    pane.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:auto;min-height:0;padding:20px;gap:14px;';
    pane.innerHTML = '<div style="font-size:20px;font-weight:900;color:#7a1027;">🧧 Lì xì Tết 2027</div>' +
      '<div style="font-size:13px;color:#6b7280;line-height:1.6;">Phát: 27 Tết → mùng 5 (3/2 → 10/2/2027) · Dùng: ' + LiXi.useRange + '. Từ mùng 11 mã tự hết hạn.</div>' +
      '<button id="lixi-stat-btn" style="align-self:flex-start;border:none;border-radius:99px;padding:10px 18px;font-weight:800;background:#7a1027;color:#ffe7a3;cursor:pointer;">Tải thống kê</button>' +
      '<div id="lixi-stat" style="font-size:13px;color:#374151;"></div>' +
      '<div style="margin-top:10px;padding:16px;border-radius:16px;border:1.5px dashed #fca5a5;background:#fff5f5;">' +
      '<div style="font-weight:900;color:#b91c1c;">Xoá toàn bộ dữ liệu lì xì</div>' +
      '<div style="font-size:12.5px;color:#7f1d1d;margin:6px 0 12px;line-height:1.6;">Xoá hết bảng lì xì trên Firebase (mã đã phát, lượt mở…) cho nhẹ dữ liệu. Không đụng hồ sơ khách, đơn hàng. Không hoàn tác được.</div>' +
      '<button id="lixi-del-btn" style="border:none;border-radius:99px;padding:10px 18px;font-weight:900;background:#dc2626;color:#fff;cursor:pointer;">Xoá dữ liệu lì xì…</button>' +
      '<div id="lixi-del-msg" style="font-size:12.5px;margin-top:10px;color:#7f1d1d;"></div></div>';
    colC.appendChild(pane);
    pane.querySelector('#lixi-stat-btn').onclick = function () {
      var out = pane.querySelector('#lixi-stat'); out.textContent = 'Đang tải…';
      LiXi.stats().then(function (S) {
        var rows = Object.keys(LiXi.TYPES).map(function (t) { var b = S.byType[t];
          return '<tr><td style="padding:6px 10px;">' + esc(LiXi.TYPES[t].label) + '</td><td style="padding:6px 10px;text-align:right;">' + b.issued + '</td><td style="padding:6px 10px;text-align:right;">' + b.used + '</td><td style="padding:6px 10px;text-align:right;">' + LiXi.fmtVnd(b.amount) + '</td></tr>'; }).join('');
        out.innerHTML = '<div style="margin-bottom:8px;"><b>' + S.customers + '</b> khách · <b>' + S.opened + '</b> bao đã mở · <b>' + S.wins + '</b> mã trúng · <b>' + S.earned + '</b> lượt mở nhờ mua hàng</div>' +
          '<table style="border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;"><tr style="background:#fdf2e3;"><th style="padding:6px 10px;text-align:left;">Loại</th><th style="padding:6px 10px;">Đã phát</th><th style="padding:6px 10px;">Đã dùng</th><th style="padding:6px 10px;">Đã giảm</th></tr>' + rows + '</table>';
      }).catch(function (e) { out.textContent = 'Lỗi: ' + e.message; });
    };
    pane.querySelector('#lixi-del-btn').onclick = function () {
      var msg = pane.querySelector('#lixi-del-msg');
      var warn = LiXi.isOver() ? '' : 'ĐỢT LÌ XÌ CHƯA KẾT THÚC (mã còn hạn tới hết mùng 10). ';
      _posPrompt(warn + 'Nhập mã xác nhận để xoá toàn bộ dữ liệu lì xì:', '').then(function (v) {
        if (v == null) return;
        if (String(v).trim() !== LiXi.CFG.deleteCode) { alert('Sai mã xác nhận — không xoá.'); return; }
        msg.textContent = 'Đang xoá…';
        LiXi.deleteAll(function (n) { msg.textContent = 'Đã xoá ' + n + ' khách…'; })
          .then(function (n) { msg.textContent = '✅ Đã xoá xong dữ liệu lì xì (' + n + ' khách). Giờ có thể deploy lại pos / PosX / index bản bình thường.'; })
          .catch(function (e) { msg.textContent = '❌ Lỗi: ' + e.message + ' — bấm lại để xoá tiếp.'; });
      });
    };
  }
  var _sw = window.switchMgrTab;
  if (typeof _sw === 'function') window.switchMgrTab = function (tab) {
    var on = tab === 'lixi';
    [tabBtn, tabMob].forEach(function (b) { if (!b) return; b.style.background = on ? '#7a1027' : 'transparent'; b.style.color = on ? '#ffe7a3' : '#6b7280'; });
    if (on) {
      _sw.call(this, '__lixi__');                                     // tắt hết tab cũ (không tab nào trùng tên)
      var bw = document.getElementById('mgr-col-b-wrap'); if (bw) bw.style.display = 'none';
      if (pane) pane.style.display = 'flex';
      return;
    }
    if (pane) pane.style.display = 'none';
    return _sw.apply(this, arguments);
  };
})();
