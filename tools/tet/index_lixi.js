// [LÌ XÌ TẾT 2027 — index_tet.html] Sinh bởi tools/tao_ban_tet.js — KHÔNG sửa tay trong index_tet.html.
// Thẻ "Túi lì xì Tết 2027" (tab Tích điểm) + popup mở bao. Đọc Firestore CHỈ trong giai đoạn phát / dùng (1 lần khi vào app).
// Trước đợt: thẻ đếm ngày (không đọc gì). Sau mùng 10: thẻ ẩn.
(function () {
  if (!window.LiXi) { console.warn('[lì xì] thiếu lixi.v1.js'); return; }
  LiXi.init({ fstore: fstore, db: db, FieldValue: firebase.firestore.FieldValue });
  var st = null, loadedFor = '', busy = false;
  var card = document.getElementById('lx-card');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function avail() { return st && st.give ? st.free + st.extra : 0; }
  function lastVisit() { try { return (userData && userData.lastVisit) || null; } catch (e) { return null; } }
  function phone() { try { return curPhone || ''; } catch (e) { return ''; } }

  var css = document.createElement('style');
  css.textContent =
    '#lx-card .lxw{position:relative;overflow:hidden;border-radius:32px;padding:20px 20px 18px;color:#ffeec2;background:radial-gradient(circle at 88% -10%,#c22a42 0%,#7a1027 46%,#4d0a18 100%);box-shadow:0 14px 34px rgba(122,16,39,.32)}' +
    '#lx-card .lxw:before{content:"";position:absolute;right:-30px;top:-30px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(255,214,110,.35),transparent 70%)}' +
    '#lx-card .lx-top{display:flex;align-items:center;gap:10px;position:relative}' +
    '#lx-card .lx-ic{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;background:rgba(255,214,110,.16);border:1px solid rgba(255,214,110,.35)}' +
    '#lx-card .lx-tt{flex:1;min-width:0}#lx-card .lx-tt b{display:block;font-size:16px;font-weight:900;color:#ffe08a;letter-spacing:-.01em}#lx-card .lx-tt small{display:block;font-size:11.5px;color:rgba(255,236,200,.75);margin-top:1px}' +
    '#lx-card .lx-tag{font-size:10px;font-weight:900;letter-spacing:.08em;padding:4px 9px;border-radius:99px;background:linear-gradient(135deg,#ffe08a,#c8901f);color:#5c0d1f}' +
    '#lx-card .lx-mid{display:flex;align-items:center;gap:12px;margin-top:16px;position:relative}' +
    '#lx-card .lx-num{flex:1}#lx-card .lx-num b{font-size:30px;font-weight:900;color:#fff3c4;line-height:1}#lx-card .lx-num span{display:block;font-size:12px;color:rgba(255,236,200,.8);margin-top:3px}' +
    '#lx-card .lx-open{border:none;border-radius:99px;padding:13px 20px;font-weight:900;font-size:13px;letter-spacing:.04em;cursor:pointer;color:#5c0d1f;background:linear-gradient(135deg,#ffe9a8,#e9b949 55%,#c8901f);box-shadow:0 6px 18px rgba(0,0,0,.25);-webkit-tap-highlight-color:transparent;transition:transform .15s}' +
    '#lx-card .lx-open:active{transform:scale(.96)}#lx-card .lx-open[disabled]{opacity:.45}' +
    '#lx-card .lx-hint{font-size:11.5px;color:rgba(255,236,200,.75);margin-top:10px;line-height:1.5;position:relative}' +
    '#lx-card .lx-codes{margin-top:14px;display:flex;flex-direction:column;gap:8px;position:relative}' +
    '#lx-card .lx-code{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(255,246,225,.1);border:1px solid rgba(255,214,110,.22)}' +
    '#lx-card .lx-code .t{flex:1;min-width:0}#lx-card .lx-code .t b{display:block;font-size:13.5px;color:#fff3c4}#lx-card .lx-code .t small{display:block;font-size:11px;color:rgba(255,236,200,.7);margin-top:1px}' +
    '#lx-card .lx-chip{font-size:10px;font-weight:900;padding:4px 8px;border-radius:99px;white-space:nowrap;background:rgba(255,214,110,.18);color:#ffe08a}' +
    '#lx-card .lx-chip.ok{background:#ffe08a;color:#5c0d1f}#lx-card .lx-chip.used{background:rgba(255,255,255,.12);color:rgba(255,236,200,.6)}' +
    '#lx-card .lx-foot{font-size:11px;color:rgba(255,236,200,.6);margin-top:12px;position:relative}' +
    /* popup mở bao */
    '#lx-modal{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(24,2,8,.9);-webkit-tap-highlight-color:transparent}' +
    '#lx-modal.on{display:flex}#lx-modal .lx-box{width:min(300px,86vw);text-align:center}' +
    '#lx-modal .env{position:relative;width:220px;height:290px;margin:0 auto;cursor:pointer;will-change:transform}' +
    '#lx-modal .env .bk{position:absolute;inset:0;border-radius:22px;background:linear-gradient(160deg,#e0283a,#9c0f22 70%,#7a0c1c);box-shadow:0 20px 50px rgba(0,0,0,.45),inset 0 0 0 3px rgba(255,214,110,.55)}' +
    '#lx-modal .env .flap{position:absolute;left:0;right:0;top:0;height:120px;transform-origin:50% 0;border-radius:22px 22px 0 0;background:linear-gradient(180deg,#f0394a,#b8142a);clip-path:polygon(0 0,100% 0,100% 40%,50% 100%,0 40%);will-change:transform;transition:transform .45s cubic-bezier(.3,1.3,.5,1)}' +
    '#lx-modal .env .seal{position:absolute;left:50%;top:92px;width:64px;height:64px;margin-left:-32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 20px/1 "League Spartan",sans-serif;color:#7a0c1c;background:radial-gradient(circle at 35% 30%,#fff3c4,#e9b949 60%,#b8862e);box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .25s,transform .3s}' +
    '#lx-modal .env .gold{position:absolute;left:18px;right:18px;bottom:22px;font:800 12px/1.4 Inter,sans-serif;color:#ffe08a;letter-spacing:.08em;text-transform:uppercase}' +
    '#lx-modal .env .paper{position:absolute;left:16px;right:16px;top:60px;height:190px;border-radius:16px;background:linear-gradient(180deg,#fffaf0,#fdeccc);box-shadow:0 8px 24px rgba(0,0,0,.25);transform:translateY(40px);opacity:0;will-change:transform,opacity;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;color:#5c0d1f;transition:transform .55s cubic-bezier(.2,1.2,.4,1),opacity .3s}' +
    '#lx-modal .paper .big{font-size:34px;line-height:1}#lx-modal .paper b{display:block;font-size:16px;font-weight:900;margin-top:8px}#lx-modal .paper small{display:block;font-size:11.5px;color:#9a6a3a;margin-top:6px;line-height:1.45}' +
    '#lx-modal .paper .cd{display:inline-block;margin-top:8px;padding:5px 10px;border-radius:10px;background:#7a1027;color:#ffe08a;font:900 14px/1 monospace;letter-spacing:.08em}' +
    '#lx-modal.shake .env{animation:lx-shake .5s ease-in-out}' +
    '@keyframes lx-shake{0%,100%{transform:rotate(0)}20%{transform:rotate(-6deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-4deg)}80%{transform:rotate(3deg)}}' +
    '#lx-modal.open .gold{opacity:0}#lx-modal .env .gold{transition:opacity .2s}#lx-modal.open .flap{transform:rotateX(180deg) translateY(4px)}#lx-modal.open .seal{opacity:0;transform:scale(.6)}' +
    '#lx-modal .env .flap{z-index:2}#lx-modal .env .seal{z-index:3}#lx-modal .env .paper{z-index:1}' +
    '#lx-modal.open .paper{transform:translateY(-86px);opacity:1;z-index:4}' +
    '#lx-modal .lx-say{margin-top:18px;font-size:14px;font-weight:700;color:#ffeec2;min-height:40px;line-height:1.45}' +
    '#lx-modal .lx-btns{display:flex;gap:10px;justify-content:center;margin-top:12px}' +
    '#lx-modal .lx-btns button{border:none;border-radius:99px;padding:12px 18px;font-weight:900;font-size:13px;cursor:pointer}' +
    '#lx-modal .lx-again{color:#5c0d1f;background:linear-gradient(135deg,#ffe9a8,#e9b949 55%,#c8901f)}#lx-modal .lx-close{background:rgba(255,255,255,.14);color:#ffeec2}' +
    '@media(prefers-reduced-motion:reduce){#lx-modal *{transition:none!important;animation:none!important}}';
  document.head.appendChild(css);

  var modal = document.createElement('div'); modal.id = 'lx-modal';
  modal.innerHTML = '<div class="lx-box"><div class="env" role="button" aria-label="Mở bao lì xì"><div class="bk"></div><div class="paper"></div><div class="flap"></div><div class="seal">Lộc</div>' +
    '<div class="gold">Chạm để mở bao lì xì</div></div><div class="lx-say"></div><div class="lx-btns"></div></div>';
  document.body.appendChild(modal);
  var env = modal.querySelector('.env'), paper = modal.querySelector('.paper'), say = modal.querySelector('.lx-say'), btns = modal.querySelector('.lx-btns');

  function storeOf(t) { return LiXi.STORE_NAME[LiXi.TYPES[t].store]; }
  function render() {
    if (!card) return;
    var now = LiXi.now();
    if (LiXi.isOver(now)) { card.style.display = 'none'; return; }
    var html = '<div class="lxw"><div class="lx-top"><div class="lx-ic">🧧</div><div class="lx-tt"><b>Túi lì xì Tết 2027</b><small>Bé Gạo phát lì xì · 27 Tết → mùng 5</small></div><span class="lx-tag">TẾT 2027</span></div>';
    if (!LiXi.inGive(now) && !LiXi.inUse(now)) {          // trước đợt — đếm ngày, không đọc gì
      var d = Math.round((Date.parse(LiXi.CFG.giveFrom + 'T00:00:00+07:00') - Date.parse(LiXi.vnDay(now) + 'T00:00:00+07:00')) / 864e5);
      html += '<div class="lx-mid"><div class="lx-num"><b>' + d + ' ngày</b><span>nữa Bé Gạo bắt đầu phát lì xì (27 Tết · 3/2/2027)</span></div></div>' +
        '<div class="lx-hint">Mỗi ngày 1 bao miễn phí · mua 1 đơn ở XOFA hoặc The cafe 33 = thêm 1 bao. Quà: upsize miễn phí, giảm 5K, giảm 10K lịch bed, +1h bed…</div></div>';
      card.innerHTML = html; card.style.display = 'block'; return;
    }
    if (st && st.give) {
      var n = avail();
      html += '<div class="lx-mid"><div class="lx-num"><b>' + n + ' bao</b><span>' + (n ? 'đang chờ bạn mở' : 'hôm nay đã mở hết') + '</span></div>' +
        '<button class="lx-open"' + (n ? '' : ' disabled') + '>Mở lì xì</button></div>' +
        '<div class="lx-hint">Mỗi ngày 1 bao miễn phí · mua 1 đơn ở XOFA / The cafe 33 (nhập SĐT tích điểm) = thêm 1 bao.</div>';
    }
    var codes = (st && st.codes) || [];
    if (codes.length) {
      html += '<div class="lx-codes">' + codes.map(function (c) {
        var T = LiXi.TYPES[c.type], chip = c.used ? '<span class="lx-chip used">Đã dùng</span>' : c.reservedBooking ? '<span class="lx-chip ok">Đã giữ cho lịch</span>' : (LiXi.inUse(now) ? '<span class="lx-chip ok">Dùng được</span>' : '<span class="lx-chip">Từ mùng 3</span>');
        var extra = (!c.used && c.reservedInfo) ? ' · lịch ' + esc(c.reservedInfo) : '';
        return '<div class="lx-code"><div class="t"><b>' + esc(T.label) + '</b><small>Mã ' + esc(c.id) + ' · tại ' + esc(storeOf(c.type)) + ' · ' + esc(T.note) + extra + '</small></div>' + chip + '</div>';
      }).join('') + '</div>';
    } else if (st && !st.give) {
      html += '<div class="lx-hint">Bạn chưa có mã lì xì nào.</div>';
    }
    html += '<div class="lx-foot">Mã dùng từ ' + LiXi.useRange + ' · đọc SĐT ở quầy để áp.</div></div>';
    card.innerHTML = html; card.style.display = 'block';
    var b = card.querySelector('.lx-open'); if (b) b.onclick = openModal;
  }
  function refresh(force) {
    var p = phone(); if (!p) return;
    var now = LiXi.now();
    if (LiXi.isOver(now) || !(LiXi.inGive(now) || LiXi.inUse(now))) { st = null; render(); return; }
    if (!force && loadedFor === p && st && st.today === LiXi.vnDay(now)) { render(); return; }   // sang ngày mới → đọc lại (bao miễn phí mới)
    LiXi.load(p).then(function (s) { st = s; loadedFor = p; render(); }).catch(function (e) { console.warn('[lì xì] tải', e); });
  }

  // ── popup ──
  function closeModal() { modal.classList.remove('on', 'open', 'shake'); busy = false; }
  function resetEnv() {
    modal.classList.remove('open', 'shake'); paper.innerHTML = ''; btns.innerHTML = '';
    say.textContent = avail() > 1 ? 'Bạn còn ' + avail() + ' bao — chạm bao để mở nha!' : 'Chạm bao để mở nha!';
    modal.querySelector('.gold').textContent = 'Chạm để mở bao lì xì';
  }
  function openModal() {
    if (!st || !st.give) return;
    if (!avail()) { modal.classList.add('on'); paper.innerHTML = ''; say.textContent = 'Hôm nay hết bao rồi — mua 1 đơn ở XOFA / The cafe 33 để có thêm bao nha!'; btns.innerHTML = '<button class="lx-close">Đóng</button>'; btns.querySelector('button').onclick = closeModal; return; }
    resetEnv(); modal.classList.add('on');
  }
  modal.addEventListener('click', function (e) { if (e.target === modal && !busy) closeModal(); });
  env.addEventListener('click', function () {
    if (busy || modal.classList.contains('open') || !avail()) return;
    busy = true; modal.classList.add('shake'); say.textContent = 'Đang mở…';
    var started = Date.now();
    LiXi.open(phone(), lastVisit()).then(function (r) {
      st = r.state;
      setTimeout(function () {
        modal.classList.remove('shake'); modal.classList.add('open');
        if (r.win) {
          var T = LiXi.TYPES[r.code.type];
          paper.innerHTML = '<div class="big">🎉</div><b>' + esc(T.label) + '</b><span class="cd">' + esc(r.code.id) + '</span><small>Dùng tại ' + esc(storeOf(r.code.type)) + ' · ' + esc(T.note) + '<br>từ mùng 3 → mùng 10 Tết</small>';
          say.textContent = 'Trúng rồi nè! Lộc xuân gõ cửa, vui cả nhà!';
        } else {
          paper.innerHTML = '<div class="big">🌸</div><b>Chúc may mắn lần sau</b><small>Lộc chưa ghé bao này thôi —<br>Bé Gạo vẫn chúc bạn năm mới an vui!</small>';
          say.textContent = 'Lần này chưa trúng, mai thử tiếp nha! Lộc xuân còn đó, ghé quán nhận quà!';
        }
        btns.innerHTML = (avail() ? '<button class="lx-again">Mở bao tiếp (' + avail() + ')</button>' : '') + '<button class="lx-close">Đóng</button>';
        var a = btns.querySelector('.lx-again'); if (a) a.onclick = function () { resetEnv(); };
        btns.querySelector('.lx-close').onclick = closeModal;
        busy = false; render();
      }, Math.max(0, 520 - (Date.now() - started)));
    }).catch(function (e) {
      modal.classList.remove('shake'); busy = false;
      say.textContent = e.message === 'het-luot' ? 'Hôm nay hết bao rồi — mua 1 đơn để có thêm bao nha!' : e.message === 'het-dot' ? 'Đợt lì xì đã kết thúc rồi nè.' : 'Mạng chập chờn, thử lại giúp Bé Gạo nha!';
      refresh(true);
    });
  });

  // ── +1h BED: lịch đặt qua app có dùng mã → KÉO DÀI thêm 1 giờ ngay lúc đặt ──
  // Mọi chỗ kiểm trùng lịch (app khách + POS) chỉ đọc giờ `end` → lịch 13:00–15:00 dùng mã được lưu 13:00–16:00:
  // khách sau thấy 15:00–16:00 đã có người, không chồng lịch. POS: lịch có `lixiBed1h` → tự trừ 1 giờ khi tính tiền.
  var bedOn = true, pending = null, box = null;
  function $(id) { return document.getElementById(id); }
  function bed1hCode() {
    if (!st) return null;
    return (st.codes || []).filter(function (c) { return c.type === 'bed1h' && !c.used && !c.reservedBooking; })[0] || null;
  }
  function closeMin() { try { return _bedClosingMin || 1250; } catch (e) { return 1250; } }
  function closeStr() { try { return _bedClosingTime || '20:50'; } catch (e) { return '20:50'; } }
  /** {code, base, ext} nếu dùng được với ngày / giờ đang chọn; {why} nếu có mã nhưng chưa dùng được; null nếu không có mã */
  function bedPlan(dateVal, s, e) {
    var c = bed1hCode(); if (!c) return null;
    if (!LiXi.dateInUse(dateVal)) return { why: 'Mã +1h bed dùng cho lịch từ mùng 3 → mùng 10 Tết (8/2 → 15/2).' };
    if (!s || !e) return { why: '' };
    var paid = LiXi.mins(e) - LiXi.mins(s), T = LiXi.TYPES.bed1h;
    if (paid < (T.minBedHours || 2) * 60) return { why: 'Mã +1h bed áp cho lịch từ ' + (T.minBedHours || 2) + ' giờ — chọn thêm giờ để được tặng 1 giờ.', code: c.id };
    var ext = LiXi.hm(LiXi.mins(e) + LiXi.BED_FREE_MIN);
    if (LiXi.mins(e) + LiXi.BED_FREE_MIN > closeMin()) return { why: 'Lịch kết thúc ' + e + ' — cộng 1 giờ sẽ quá giờ quán nhận bed (' + closeStr() + '). Chọn giờ kết thúc sớm hơn để dùng mã.', code: c.id };
    return { code: c.id, base: e, ext: ext };
  }
  function bedUi() {
    var btn = $('btn-booking'); if (!btn) return;
    if (!box) {
      box = document.createElement('div'); box.id = 'lx-bed1h';
      box.style.cssText = 'display:none;margin:0 0 12px;padding:12px 14px;border-radius:18px;background:linear-gradient(135deg,#fff7e6,#fdecd2);border:1.5px solid #e9b949;color:#5c0d1f;font-size:13px;line-height:1.45;';
      btn.parentNode.insertBefore(box, btn);
    }
    var pl = bedPlan(($('book-date') || {}).value, ($('book-start') || {}).value, ($('book-end') || {}).value);
    if (!pl) { box.style.display = 'none'; return; }
    var html;
    if (pl.ext) html = '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;"><input type="checkbox" id="lx-bed1h-on"' + (bedOn ? ' checked' : '') + ' style="margin-top:3px;width:18px;height:18px;accent-color:#7a1027;">' +
      '<span><b>🧧 Dùng lì xì +1h bed miễn phí</b> (mã ' + esc(pl.code) + ')<br>' + (bedOn ? 'Lịch của bạn kết thúc <b>' + pl.ext + '</b> thay vì ' + pl.base + ' — giờ cuối miễn phí.' : 'Bật để được tặng thêm 1 giờ (kết thúc ' + pl.ext + ').') + '</span></label>';
    else if (pl.why) html = '<b>🧧 Bạn có lì xì +1h bed</b><br><span style="color:#9a6a3a">' + esc(pl.why) + '</span>';
    else { box.style.display = 'none'; return; }
    if (box.getAttribute('data-h') !== html) { box.innerHTML = html; box.setAttribute('data-h', html); var cb = $('lx-bed1h-on'); if (cb) cb.onchange = function () { bedOn = cb.checked; box.setAttribute('data-h', ''); bedUi(); }; }
    box.style.display = 'block';
  }
  setInterval(function () { var t = $('tab-bed'); if (t && !t.classList.contains('hidden') && st) bedUi(); }, 800);

  var _hb = window.handleBooking;
  if (typeof _hb === 'function') window.handleBooking = function () {
    var sEl = $('book-start'), eEl = $('book-end'), dEl = $('book-date');
    if (!sEl || !eEl) return _hb.apply(this, arguments);
    var dur = LiXi.mins(eEl.value) - LiXi.mins(sEl.value), r;
    // gọi lại từ chính handleBooking (app tự dời giờ khi đặt quá sát / chọn giờ gợi ý): giờ trên form đã gồm +1h → không cộng lần 2
    // (lần gọi lại đó luôn đổi giờ bắt đầu; khách tự chọn lại cùng giờ bắt đầu = lượt đặt mới → tính lại từ đầu)
    if (pending && dur === pending.extDur && sEl.value !== pending.start && Date.now() - pending.at < 120000) {
      pending.at = Date.now(); pending.start = sEl.value;
      r = _hb.apply(this, arguments);
      eEl.value = LiXi.hm(LiXi.mins(sEl.value) + pending.baseDur);
      return r;
    }
    var pl = bedOn ? bedPlan(dEl && dEl.value, sEl.value, eEl.value) : null;
    if (!pl || !pl.ext) { pending = null; return _hb.apply(this, arguments); }
    pending = { code: pl.code, baseDur: dur, extDur: dur + LiXi.BED_FREE_MIN, at: Date.now(), start: sEl.value };
    eEl.value = pl.ext;                               // handleBooking đọc giờ NGAY đầu hàm → kiểm giờ đóng cửa + trùng lịch theo khung đã cộng
    try { r = _hb.apply(this, arguments); } finally { eEl.value = pl.base; }
    return r;
  };
  // hết chỗ → app gợi ý khung giờ (đã gồm +1h) → khách chọn: form về giờ khách TRẢ TIỀN, bấm Đặt sẽ cộng lại 1 giờ
  var _aab = window.applyAutoBook;
  if (typeof _aab === 'function') window.applyAutoBook = function (timeRange) {
    var r = _aab.apply(this, arguments), P = pending, a = String(timeRange || '').split(' - ');
    if (P && a.length === 2 && LiXi.mins(a[1]) - LiXi.mins(a[0]) === P.extDur) { var eEl = $('book-end'); if (eEl) eEl.value = LiXi.hm(LiXi.mins(a[0]) + P.baseDur); }
    pending = null;
    return r;
  };
  var _pnb = window._pushNewBedBooking;
  if (typeof _pnb === 'function') window._pushNewBedBooking = function (bookingData, callback, presetKey) {
    var self = this, args = arguments;
    var P = pending;
    if (!P || !bookingData || bookingData.type !== 'app' || LiXi.mins(bookingData.end) - LiXi.mins(bookingData.start) !== P.extDur) return _pnb.apply(self, args);
    pending = null;
    var d = _parseBedDateKey(bookingData.date), rtPath = 'bedBookings/' + d.year + '/' + d.month + '/' + d.day;
    var key = presetKey || db.ref(rtPath).push().key;
    var baseEnd = LiXi.hm(LiXi.mins(bookingData.end) - LiXi.BED_FREE_MIN);
    // giữ mã TRƯỚC rồi mới lưu lịch: mã vừa bị dùng / giữ ở chỗ khác → lịch giữ giờ cũ (không kéo dài, không trừ)
    LiXi.reserve(curPhone, P.code, { key: key, path: rtPath + '/' + key, info: bookingData.date.slice(0, 5) + ' ' + bookingData.start + '–' + bookingData.end }).then(function () {
      bookingData.lixiBed1h = { code: P.code, phone: curPhone, freeMin: LiXi.BED_FREE_MIN, baseEnd: baseEnd, by: 'app' };
    }).catch(function () {
      bookingData.end = baseEnd;
      if (bookingData.preorder && bookingData.preorder.bookingEnd) bookingData.preorder.bookingEnd = baseEnd;
      setTimeout(function () { showAppModal('Lì xì +1h bed', 'Mã lì xì vừa được dùng ở chỗ khác nên lịch giữ giờ kết thúc <b>' + baseEnd + '</b> nhé.', '🧧'); }, 1200);
    }).then(function () {
      _pnb.call(self, bookingData, function () { refresh(true); if (callback) callback.apply(this, arguments); }, key);
    });
  };
  // huỷ lịch → trả mã
  var _rfd = window._refundBedVoucherIfAny;
  if (typeof _rfd === 'function') window._refundBedVoucherIfAny = function (booking) {
    var L = booking && booking.lixiBed1h;
    if (L && L.code) LiXi.unreserve(L.phone || curPhone, L.code, booking.key || booking.id).then(function () { refresh(true); }).catch(function () {});
    return _rfd.apply(this, arguments);
  };
  // đổi giờ: form hiện giờ khách TRẢ TIỀN (bỏ 1 giờ tặng); lưu thì cộng lại 1 giờ
  function editingLixi() {
    try { var c = (_historyCache || []).filter(function (b) { return b.key === editingBookingKey; })[0]; return c && c.lixiBed1h ? c : null; } catch (e) { return null; }
  }
  var reM = $('reschedule-modal');
  if (reM && window.MutationObserver) new MutationObserver(function () {
    if (reM.classList.contains('hidden')) return;
    var b = editingLixi(), reE = $('re-end'), h = $('reschedule-hint'); if (!b || !reE) return;
    setTimeout(function () {
      if (reE.value === b.end) reE.value = LiXi.hm(LiXi.mins(b.end) - LiXi.BED_FREE_MIN);
      if (h && h.textContent.indexOf('🧧') < 0) h.textContent += ' · 🧧 lịch có lì xì +1h: chọn giờ kết thúc bạn trả tiền, Bé Gạo tự cộng thêm 1 giờ';
    }, 0);
  }).observe(reM, { attributes: true, attributeFilter: ['class'] });
  var _dsr = window._doSubmitReschedule;
  if (typeof _dsr === 'function') window._doSubmitReschedule = function () {
    var b = editingLixi(), reS = $('re-start'), reE = $('re-end'), reD = $('re-date');
    if (!b || !reS || !reE) return _dsr.apply(this, arguments);
    var T = LiXi.TYPES.bed1h, paid = LiXi.mins(reE.value) - LiXi.mins(reS.value), base = reE.value;
    if (!LiXi.dateInUse(reD && reD.value)) return alert('Lịch có lì xì +1h bed chỉ đổi sang ngày mùng 3 → mùng 10 Tết (8/2 → 15/2).');
    if (paid < (T.minBedHours || 2) * 60) return alert('Lịch có lì xì +1h bed cần từ ' + (T.minBedHours || 2) + ' giờ trở lên.');
    if (LiXi.mins(base) + LiXi.BED_FREE_MIN > closeMin()) return alert('Cộng 1 giờ tặng sẽ quá giờ quán nhận bed (' + closeStr() + ') — chọn giờ kết thúc sớm hơn.');
    reE.value = LiXi.hm(LiXi.mins(base) + LiXi.BED_FREE_MIN);
    var L = b.lixiBed1h, dd = String((reD && reD.value) || '').split('-');
    resched = { at: Date.now(), phone: L.phone || curPhone, code: L.code, key: b.key, path: (typeof _editingBookingPath !== 'undefined' && _editingBookingPath) || '',
      info: (dd.length === 3 ? dd[2] + '/' + dd[1] : '') + ' ' + reS.value + '–' + reE.value };
    try { return _dsr.apply(this, arguments); } finally { reE.value = base; }
  };
  // đổi giờ thành công (app mở lại Lịch sử) → cập nhật dòng "đã giữ cho lịch …" trên mã
  var resched = null, _oh = window.openHistory;
  if (typeof _oh === 'function') window.openHistory = function () {
    var R = resched; resched = null;
    if (R && Date.now() - R.at < 30000) LiXi.reserve(R.phone, R.code, { key: R.key, path: R.path, info: R.info }).then(function () { refresh(true); }).catch(function () {});
    return _oh.apply(this, arguments);
  };

  // ── móc vào app ──
  window.LiXiUI = { avail: avail, open: openModal, refresh: refresh, bedPlan: bedPlan };
  var _sd = window.showDashboard;
  if (typeof _sd === 'function') window.showDashboard = function () { var r = _sd.apply(this, arguments); setTimeout(function () { refresh(true); }, 900); return r; };
  // chạm Bé Gạo khi còn bao → mở popup
  var pet = document.querySelector('#bg-pet .bgp-win');
  if (pet) pet.addEventListener('click', function () { if (avail() > 0) setTimeout(openModal, 900); });
  // đã đăng nhập sẵn (showDashboard chạy trước khi khối này nạp) → tải sau khi giờ máy chủ về
  setTimeout(function () { var app = document.getElementById('main-app'); if (phone() && app && !app.classList.contains('hidden')) refresh(true); }, 1500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && phone()) refresh(false); });
})();
