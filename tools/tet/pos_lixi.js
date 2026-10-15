// [LÌ XÌ TẾT 2027 — pos_tet.html (The cafe 33)] Sinh bởi tools/tao_ban_tet.js — KHÔNG sửa tay trong pos_tet.html.
// Nhập SĐT tích điểm → hiện mã lì xì dùng được ở The cafe 33 (tag "Tết 2027") → nhân viên bấm "Áp" → dòng giảm trong giỏ.
// Thanh toán xong: đánh dấu mã đã dùng + cộng 1 lượt mở lì xì cho SĐT (trong giai đoạn phát). Tab Quản lý "Lì xì 2027".
(function () {
  if (!window.LiXi) { console.warn('[lì xì] thiếu lixi.v1.js'); return; }
  LiXi.init({ fstore: fstore, db: db, FieldValue: firebase.firestore.FieldValue });
  var STORE = 'tc33', LINE = '🧧 Lì xì Tết 2027', cache = { phone: '', at: 0, codes: [] }, timer = null;
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
  function scan(force) {
    var p = phoneNow();
    if (p.length < 10 || !LiXi.inUse()) { panel.style.display = 'none'; return; }
    if (!force && cache.phone === p && Date.now() - cache.at < 60000) { render(cache.codes, p); return; }
    LiXi.usableCodes(p, STORE).then(function (codes) { cache = { phone: p, at: Date.now(), codes: codes }; if (phoneNow() === p) render(codes, p); })
      .catch(function (e) { console.warn('[lì xì] đọc mã', e); });
  }
  function scanSoon() { clearTimeout(timer); timer = setTimeout(scan, 600); }

  // ── tính số tiền giảm theo loại (kiểm điều kiện trên giỏ hiện tại) ──
  function amountFor(c) {
    var T = LiXi.TYPES[c.type];
    if (c.type === 'upsize_tc33') {
      var best = 0;
      cart.forEach(function (it) {
        if (!it || it._vKey || it._discountId || it.size !== 'L') return;
        var m = (menu || []).filter(function (x) { return String(x.name).toLowerCase() === String(it.name).toLowerCase(); })[0];
        if (m && m.priceM > 0 && m.priceL > m.priceM) best = Math.max(best, m.priceL - m.priceM);
      });
      return best > 0 ? { amt: best } : { err: 'Giỏ chưa có ly size L để upsize miễn phí.' };
    }
    var beds = bedLines(), hours = beds.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
    if (c.type === 'giam10k_bed') return hours > 0 ? { amt: T.value } : { err: 'Bill chưa có giờ bed.' };
    if (c.type === 'bed1h') {
      if (hours < (T.minBedHours || 2)) return { err: 'Mã +1h bed áp cho lịch từ ' + (T.minBedHours || 2) + ' giờ trở lên.' };
      var unit = beds.filter(function (l) { return String(l.name).toLowerCase() === '1h bed'; })[0] || beds[0];
      return { amt: Number(unit.price) || 0 };
    }
    return { err: 'Mã này không dùng ở The cafe 33.' };
  }
  function toggle(c, phone) {
    var li = lixiLine();
    if (li >= 0 && cart[li]._lixiCode === c.id) { cart.splice(li, 1); renderCart(); render(cache.codes, phone); return; }
    var r = amountFor(c);
    if (r.err) { alert('🧧 ' + r.err); return; }
    if (li >= 0) cart.splice(li, 1);                                   // 1 bill 1 mã
    cart.push({ name: LINE + ' · ' + LiXi.TYPES[c.type].short, size: '', price: -r.amt, qty: 1,
      _discountId: 'lixi_' + c.id, _discountCode: c.id, _discountTarget: 'Lì xì Tết 2027', _lixiCode: c.id, _lixiPhone: phone, _lixiType: c.type });
    renderCart(); render(cache.codes, phone);
  }

  // ── móc vào app ──
  var _check = window.checkSdtLive;
  if (typeof _check === 'function') window.checkSdtLive = function () { var r = _check.apply(this, arguments); scanSoon(); return r; };
  var _reset = window.resetPhoneInput;
  if (typeof _reset === 'function') window.resetPhoneInput = function () { var r = _reset.apply(this, arguments); panel.style.display = 'none'; return r; };
  /** gọi từ _pushPaidOrder (đơn đã lưu thành công) */
  window.lixiAfterPaid = function (phone, rawSdt, orderData) {
    var items = (orderData && orderData.itemsArray) || [], line = null;
    items.forEach(function (it) { if (it && it._lixiCode) line = it; });
    if (line) {
      LiXi.markUsed(line._lixiPhone, line._lixiCode, { store: STORE, amount: -Number(line.price) || 0 })
        .catch(function (e) { alert('🧧 Mã lì xì ' + line._lixiCode + ' không đánh dấu được (' + e.message + ') — kiểm tra lại.'); });
      cache = { phone: '', at: 0, codes: [] };
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
