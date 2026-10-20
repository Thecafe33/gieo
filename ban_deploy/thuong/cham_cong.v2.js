/* ==========================================================================
   cham_cong.v2.js — màn "Ca làm việc" (check-in / check-out bằng mã PIN)
   v2 (12/10/2026): máy màn rộng (PC / tablet ≥ 768px) mở dạng POPUP giữa màn thay vì phủ cả màn hình
   (chủ dự án: bản PC phủ cả màn là "thảm hoạ"); bấm nền mờ / ✕ / Esc để đóng. Điện thoại giữ toàn màn.
   v1 giữ nguyên để quay lui (đã deploy — không sửa).
   cho POS The Cafe 33 (pos.html) và POS XOFA (PosX.html).
   --------------------------------------------------------------------------
   Kế hoạch: docs/KE_HOACH_QUANLY_TC33_XOFA.md. Giao diện + quy tắc theo khối
   Check-in / Check-out của posgieo (renderCheckinBlock / doCheckIn / doCheckOut):
     · PIN 4 số tra trong employees_gieogieo (nhân viên DÙNG CHUNG với Gieo),
       chỉ nhận người active VÀ có tích đúng quán trong `workStores`.
     · Sai 3 lần liên tiếp → khoá ô 60 giây.
     · Tối đa 2 lần vào/ra mỗi ngày; đang trong ca phải check-out mới vào lại.
     · Chụp mức lương vào ca (payTerms) — sửa hồ sơ về sau không đổi lịch sử.
   Khác posgieo (đã chốt): KHÔNG mở ca / kết ca, KHÔNG chặn bán khi chưa ai
   check-in, KHÔNG tự chốt ca bỏ quên (2 quán không có đóng ngày) — Quản lý
   điền giờ ra ở manage.html.
   Ghi: employee_shifts_tc33 / employee_shifts_xofa (KHÔNG ghi chấm công Gieo).
   Sửa bản đã deploy = tạo cham_cong.v{N+1}.js, trỏ cả 2 POS sang (file cũ giữ nguyên).
   ========================================================================== */
(function (root) {
  'use strict';
  var VERSION = '2.0.0';
  var STORES = {
    tc33: { name: 'The Cafe 33', shifts: 'employee_shifts_tc33' },
    xofa: { name: 'XOFA', shifts: 'employee_shifts_xofa' }
  };
  var MAX_PER_DAY = 2;
  var LOCK_AFTER = 3, LOCK_MS = 60 * 1000;

  // ---------- Hàm thuần (test được bằng node) ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // Thiếu workStores = nhân viên Gieo như trước khi có trường này.
  function workStoresOf(e) {
    var ws = e && Array.isArray(e.workStores) ? e.workStores.filter(function (x) { return typeof x === 'string' && x; }) : [];
    return ws.length ? ws : ['gieo'];
  }
  function worksAt(e, store) { return workStoresOf(e).indexOf(store) >= 0; }
  // Tra PIN: trả {emp} hoặc {error}. employees = danh sách active.
  function findByPin(employees, pin, store) {
    if (!/^\d{4}$/.test(pin || '')) return { error: 'format' };
    var hit = (employees || []).filter(function (e) { return e.pin === pin && e.active !== false; });
    if (!hit.length) return { error: 'notfound' };
    var ok = hit.filter(function (e) { return worksAt(e, store); });
    if (!ok.length) return { error: 'notassigned', emp: hit[0] };
    return { emp: ok[0] };
  }
  // shifts: các ca hôm qua + hôm nay của quán. Ca đang mở (kể cả ca bắt đầu hôm qua, ra sau 0h).
  function openShiftOf(shifts, employeeId) {
    return (shifts || []).filter(function (s) { return s.employeeId === employeeId && !s.checkedOutAt; })
      .sort(function (a, b) { return String(b.checkedInAt).localeCompare(String(a.checkedInAt)); })[0] || null;
  }
  function checkInBlockReason(shifts, employeeId, today) {
    if (openShiftOf(shifts, employeeId)) return 'open';
    var n = (shifts || []).filter(function (s) { return s.employeeId === employeeId && s.businessDate === today; }).length;
    if (n >= MAX_PER_DAY) return 'max';
    return null;
  }
  function payTermsOf(emp) {
    return {
      payType: emp.payType || null,
      hourlyRate: Number(emp.hourlyRate) || 0,
      otEnabled: !!emp.otEnabled,
      otThresholdHours: Number(emp.otThresholdHours) || 8,
      otRate: Number(emp.otRate) || 0,
      fixedMonthlySalary: Number(emp.fixedMonthlySalary) || 0,
      snapshotAt: new Date().toISOString()
    };
  }

  var pure = { VERSION: VERSION, STORES: STORES, dateKey: dateKey, workStoresOf: workStoresOf, worksAt: worksAt,
    findByPin: findByPin, openShiftOf: openShiftOf, checkInBlockReason: checkInBlockReason, payTermsOf: payTermsOf };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---------- Trạng thái màn ----------
  var store = null;          // 'tc33' | 'xofa'
  var employees = [];        // active, đọc qua listener khi màn mở
  var shifts = [];           // ca từ hôm qua tới nay của quán
  var empLoaded = false, shiftLoaded = false;
  var unsubEmp = null, unsubShift = null, liveDay = null;
  var busy = false;
  var wrong = 0, lockedUntil = 0;

  function fs() { return root.firebase.firestore(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hm(iso) { var d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function initials(name) { var w = String(name || '').trim().split(/\s+/).filter(Boolean); return w.length ? w[w.length - 1][0].toUpperCase() : '?'; }
  function waitAuth() {
    return new Promise(function (resolve) {
      var a = root.firebase.auth();
      if (a.currentUser) return resolve(a.currentUser);
      var un = a.onAuthStateChanged(function (u) { if (u) { un(); resolve(u); } });
    });
  }

  var ICONS = {
    login: '<path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    door: '<path d="M4 21h16"/><path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14.5" cy="12" r="1" fill="currentColor"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(n, s) { return '<svg width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' + ICONS[n] + '</svg>'; }

  var CSS = '' +
    '#ccx-root{position:fixed;inset:0;z-index:2147483000;background:#F3F2F0;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:"Google Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#17151A;--ccx:#006241;--ccx-l:#E6F2EC}' +
    '#ccx-root *{box-sizing:border-box}' +
    // Popup (màn rộng): nền mờ phủ, khung giữa màn rộng 440px, tự cuộn bên trong.
    '#ccx-root.ccx-pop{background:rgba(23,21,26,.45);align-items:center;justify-content:center;padding:24px;overflow:hidden}' +
    '#ccx-root.ccx-pop .ccx-wrap{width:100%;max-width:440px;max-height:calc(100vh - 48px);overflow-y:auto;margin:0;padding:18px 18px 6px;background:#F3F2F0;border-radius:28px;box-shadow:0 24px 64px -16px rgba(23,21,26,.45)}' +
    '#ccx-root.ccx-pop .ccx-top{margin-bottom:12px}#ccx-root.ccx-pop .ccx-h{font-size:20px}' +
    '#ccx-root .ccx-wrap{max-width:560px;margin:0 auto;padding:max(14px,env(safe-area-inset-top)) 16px 40px}' +
    '#ccx-root .ccx-top{display:flex;align-items:center;gap:12px;margin-bottom:16px}' +
    '#ccx-root .ccx-back{width:44px;height:44px;border-radius:50%;border:none;background:#fff;color:#17151A;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer}' +
    '#ccx-root .ccx-h{font-size:22px;font-weight:800;line-height:1.1}' +
    '#ccx-root .ccx-sub{font-size:13px;color:#6C6873;font-weight:600;margin-top:2px}' +
    '#ccx-root .ccx-card{background:#fff;border-radius:22px;padding:16px;margin-bottom:12px;box-shadow:0 2px 4px rgba(23,21,26,.04),0 8px 20px -8px rgba(23,21,26,.12)}' +
    '#ccx-root .ccx-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}' +
    '#ccx-root .ccx-title b{font-size:19px;font-weight:800}' +
    '#ccx-root .ccx-count{font-size:13px;font-weight:800;color:var(--ccx);background:var(--ccx-l);border-radius:999px;padding:4px 10px;white-space:nowrap}' +
    '#ccx-root .ccx-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px}' +
    '#ccx-root .ccx-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border-radius:999px;background:#F6F4EF}' +
    '#ccx-root .ccx-av{width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}' +
    '#ccx-root .ccx-chip span.n{font-size:14.5px;font-weight:800}#ccx-root .ccx-chip span.t{font-size:12.5px;color:#8A8A90}' +
    '#ccx-root .ccx-none{font-size:14px;color:#9A9AA0;margin:0 0 4px}' +
    '#ccx-root .ccx-lab{font-size:13px;font-weight:700;color:#585460;margin:14px 0 6px}' +
    '#ccx-root .ccx-pin{width:100%;height:58px;border-radius:16px;border:2px solid #E6E3DF;background:#FAF9F8;font-size:26px;font-weight:800;letter-spacing:.5em;text-align:center;outline:none;font-family:inherit;color:#17151A}' +
    '#ccx-root .ccx-pin:focus{border-color:var(--ccx);background:#fff}' +
    '#ccx-root .ccx-who{min-height:20px;font-size:13.5px;font-weight:700;margin-top:6px;color:#6C6873}' +
    '#ccx-root .ccx-who.ok{color:var(--ccx)}#ccx-root .ccx-who.bad{color:#D2333F}' +
    '#ccx-root .ccx-btns{display:flex;gap:10px;margin-top:10px}' +
    '#ccx-root .ccx-btn{flex:1;min-height:56px;display:flex;align-items:center;justify-content:center;gap:9px;padding:0 16px;border-radius:99px;font-family:inherit;font-size:16px;font-weight:800;cursor:pointer}' +
    '#ccx-root .ccx-btn.p{background:var(--ccx);color:#fff;border:none;box-shadow:0 4px 12px rgba(0,98,65,.3)}' +
    '#ccx-root .ccx-btn.o{background:#fff;color:#17151A;border:2px solid #e6e1d2}' +
    '#ccx-root .ccx-btn:active{transform:scale(.98)}#ccx-root .ccx-btn[disabled]{opacity:.55}' +
    '#ccx-root .ccx-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F0EEEA;font-size:14.5px}' +
    '#ccx-root .ccx-row:last-child{border-bottom:none}#ccx-root .ccx-row .r{color:#585460;font-weight:600;white-space:nowrap}' +
    '#ccx-root .ccx-on{color:var(--ccx);font-weight:800}' +
    '#ccx-root .ccx-note{font-size:12.5px;color:#6C6873;line-height:1.55;margin-top:8px}' +
    '#ccx-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(20px);opacity:0;z-index:2147483001;background:#17151A;color:#fff;padding:12px 18px;border-radius:14px;font:700 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;max-width:90vw;text-align:center;transition:all .2s;pointer-events:none}' +
    '#ccx-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}';

  function ensureDom() {
    if (!document.getElementById('ccx-style')) {
      var st = document.createElement('style'); st.id = 'ccx-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    if (!document.getElementById('ccx-toast')) {
      var t = document.createElement('div'); t.id = 'ccx-toast'; document.body.appendChild(t);
    }
  }
  var toastT = null;
  function toast(msg) {
    var t = document.getElementById('ccx-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- Listener (chỉ chạy khi màn đang mở — đóng màn là gỡ, không tốn lượt đọc nền) ----------
  function subscribe() {
    var today = dateKey();
    if (unsubShift && liveDay !== today) { unsubShift(); unsubShift = null; shiftLoaded = false; }
    if (!unsubEmp) {
      unsubEmp = fs().collection('employees_gieogieo').where('active', '==', true).onSnapshot(function (snap) {
        employees = snap.docs.map(function (d) { var e = d.data(); e.id = d.id; return e; });
        empLoaded = true; render();
      }, function (err) { console.warn('[Ca làm việc] không đọc được nhân viên', err); toast('Lỗi tải nhân viên: ' + (err.code || err.message)); });
    }
    if (!unsubShift) {
      var y = new Date(); y.setDate(y.getDate() - 1);
      liveDay = today;
      unsubShift = fs().collection(STORES[store].shifts).where('businessDate', '>=', dateKey(y)).onSnapshot(function (snap) {
        shifts = snap.docs.map(function (d) { var s = d.data(); s.id = d.id; return s; });
        shiftLoaded = true; render();
      }, function (err) { console.warn('[Ca làm việc] không đọc được chấm công', err); toast('Lỗi tải chấm công: ' + (err.code || err.message)); });
    }
  }
  function unsubscribe() {
    if (unsubEmp) { unsubEmp(); unsubEmp = null; }
    if (unsubShift) { unsubShift(); unsubShift = null; }
    empLoaded = shiftLoaded = false;
  }

  // ---------- Vẽ ----------
  function render() {
    var box = document.getElementById('ccx-body'); if (!box) return;
    var pinEl = document.getElementById('ccx-pin');
    var keepPin = pinEl ? pinEl.value : '';
    var focused = pinEl && document.activeElement === pinEl;
    var today = dateKey();
    var dangCa = shifts.filter(function (s) { return !s.checkedOutAt; })
      .sort(function (a, b) { return String(a.checkedInAt).localeCompare(String(b.checkedInAt)); });
    var homNay = shifts.filter(function (s) { return s.businessDate === today; })
      .sort(function (a, b) { return String(b.checkedInAt).localeCompare(String(a.checkedInAt)); });
    var loading = !(empLoaded && shiftLoaded);
    box.innerHTML =
      '<div class="ccx-card">' +
        '<div class="ccx-title"><b>Check-in / Check-out</b><span class="ccx-count">' + (loading ? '…' : dangCa.length + ' đang trong ca') + '</span></div>' +
        (dangCa.length ? '<div class="ccx-chips">' + dangCa.map(function (s) {
          return '<span class="ccx-chip"><span class="ccx-av">' + esc(initials(s.employeeName)) + '</span><span class="n">' + esc(s.employeeName) + '</span><span class="t">' + hm(s.checkedInAt) + '</span></span>';
        }).join('') + '</div>' : '<div class="ccx-none">' + (loading ? 'Đang tải…' : 'Chưa có ai check-in.') + '</div>') +
        '<div class="ccx-lab">Mã PIN nhân viên</div>' +
        '<input id="ccx-pin" class="ccx-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="' + esc(keepPin) + '">' +
        '<div id="ccx-who" class="ccx-who"></div>' +
        '<div class="ccx-btns">' +
          '<button class="ccx-btn p" id="ccx-in" ' + (loading ? 'disabled' : '') + '>' + icon('login') + 'Check-in</button>' +
          '<button class="ccx-btn o" id="ccx-out" ' + (loading ? 'disabled' : '') + '>' + icon('door') + 'Check-out</button>' +
        '</div>' +
      '</div>' +
      '<div class="ccx-card">' +
        '<div class="ccx-title"><b>Hôm nay</b></div>' +
        (homNay.length ? homNay.map(function (s) {
          return '<div class="ccx-row"><span>' + esc(s.employeeName) + '</span><span class="r">Vào ' + hm(s.checkedInAt) + ' · ' +
            (s.checkedOutAt ? 'Ra ' + hm(s.checkedOutAt) : '<span class="ccx-on">đang trong ca</span>') + '</span></div>';
        }).join('') : '<div class="ccx-none">Chưa có lượt chấm công nào hôm nay.</div>') +
      '</div>';
    var p = document.getElementById('ccx-pin');
    p.addEventListener('input', onPinInput);
    p.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doCheckIn(); });
    document.getElementById('ccx-in').onclick = doCheckIn;
    document.getElementById('ccx-out').onclick = doCheckOut;
    onPinInput();
    if (focused) { p.focus(); }
  }
  // Xem trước tên khi gõ đủ 4 số — KHÔNG tính là một lần sai (như posgieo).
  function onPinInput() {
    var p = document.getElementById('ccx-pin'), w = document.getElementById('ccx-who');
    if (!p || !w) return;
    p.value = p.value.replace(/\D/g, '').slice(0, 4);
    w.className = 'ccx-who'; w.textContent = '';
    if (p.value.length < 4 || !empLoaded) return;
    var r = findByPin(employees, p.value, store);
    if (!r.error) { w.className = 'ccx-who ok'; w.textContent = '→ ' + r.emp.fullName; }
    else if (r.error === 'notassigned') { w.className = 'ccx-who bad'; w.textContent = r.emp.fullName + ' chưa được phân công làm ở ' + STORES[store].name; }
    else { w.className = 'ccx-who bad'; w.textContent = 'Không có mã PIN này'; }
  }
  function resolvePin() {
    var remain = lockedUntil - Date.now();
    if (remain > 0) { toast('🔒 Đang tạm khoá do nhập sai nhiều lần — thử lại sau ' + Math.ceil(remain / 1000) + 's'); return null; }
    var p = document.getElementById('ccx-pin');
    var r = findByPin(employees, p ? p.value.trim() : '', store);
    if (r.error === 'format') { toast('⚠️ Nhập đủ mã PIN 4 số'); return null; }
    if (r.error === 'notassigned') { toast('⚠️ ' + r.emp.fullName + ' chưa được phân công làm ở ' + STORES[store].name + ' — báo Quản lý'); return null; }
    if (r.error) {
      wrong++;
      if (wrong >= LOCK_AFTER) { wrong = 0; lockedUntil = Date.now() + LOCK_MS; toast('🔒 Nhập sai mã PIN 3 lần — tạm khoá 60 giây'); }
      else toast('❌ Mã PIN không tồn tại hoặc nhân viên đã ngừng hoạt động');
      return null;
    }
    wrong = 0;
    return r.emp;
  }
  function clearPin() { var p = document.getElementById('ccx-pin'); if (p) p.value = ''; onPinInput(); }

  function doCheckIn() {
    if (busy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
    var emp = resolvePin(); if (!emp) return;
    var today = dateKey();
    var why = checkInBlockReason(shifts, emp.id, today);
    if (why === 'open') { toast('⚠️ ' + emp.fullName + ' đã check-in rồi, chưa check-out lần trước'); return; }
    if (why === 'max') { toast('⚠️ Đã đạt tối đa ' + MAX_PER_DAY + ' lần check-in/check-out trong hôm nay'); return; }
    busy = true;
    var roles = Array.isArray(emp.roles) ? emp.roles.filter(function (r) { return typeof r === 'string' && r; }) : [];
    fs().collection(STORES[store].shifts).add({
      employeeId: emp.id, employeeName: emp.fullName || '', businessDate: today, store: store,
      payTerms: payTermsOf(emp), roles: roles,
      checkedInAt: new Date().toISOString(), checkedOutAt: null, source: 'cham_cong.v' + VERSION
    }).then(function () { toast('✅ ' + emp.fullName + ' đã check-in'); clearPin(); })
      .catch(function (err) { console.error('[Ca làm việc] check-in lỗi', err); toast('❌ Lỗi: ' + (err.code || err.message || err)); })
      .then(function () { busy = false; });
  }
  function doCheckOut() {
    if (busy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
    var emp = resolvePin(); if (!emp) return;
    var open = openShiftOf(shifts, emp.id);
    if (!open) { toast('⚠️ ' + emp.fullName + ' chưa check-in ca nào đang mở'); return; }
    busy = true;
    fs().collection(STORES[store].shifts).doc(open.id).update({ checkedOutAt: new Date().toISOString() })
      .then(function () { toast('✅ ' + emp.fullName + ' đã check-out'); clearPin(); })
      .catch(function (err) { console.error('[Ca làm việc] check-out lỗi', err); toast('❌ Lỗi: ' + (err.code || err.message || err)); })
      .then(function () { busy = false; });
  }

  // ---------- API cho POS ----------
  function init(opts) {
    var s = opts && opts.store;
    if (!STORES[s]) throw new Error('ChamCong.init: store phải là tc33 hoặc xofa');
    store = s;
  }
  function isWide() { return !!(root.matchMedia && root.matchMedia('(min-width: 768px)').matches); }
  function open() {
    if (!store) { console.error('ChamCong.open: chưa gọi ChamCong.init({store})'); return; }
    ensureDom();
    var pop = isWide();
    var rootEl = document.getElementById('ccx-root');
    if (rootEl && rootEl.getAttribute('data-pop') !== String(pop)) { rootEl.remove(); rootEl = null; }   // đổi cỡ màn → dựng lại đúng kiểu
    if (!rootEl) {
      rootEl = document.createElement('div'); rootEl.id = 'ccx-root';
      rootEl.setAttribute('data-pop', String(pop));
      if (pop) { rootEl.className = 'ccx-pop'; rootEl.setAttribute('role', 'dialog'); rootEl.setAttribute('aria-modal', 'true'); }
      // Popup: tiêu đề bên trái, nút ✕ bên phải. Toàn màn (điện thoại): nút quay lại bên trái như v1.
      rootEl.innerHTML = '<div class="ccx-wrap"><div class="ccx-top">' +
        (pop ? '' : '<button class="ccx-back" id="ccx-back" aria-label="Quay lại">' + icon('back', 22) + '</button>') +
        '<div style="flex:1;min-width:0"><div class="ccx-h">Ca làm việc</div><div class="ccx-sub">' + esc(STORES[store].name) + ' · Check-in / Check-out</div></div>' +
        (pop ? '<button class="ccx-back" id="ccx-back" aria-label="Đóng">' + icon('x', 20) + '</button>' : '') +
        '</div><div id="ccx-body"></div></div>';
      document.body.appendChild(rootEl);
      document.getElementById('ccx-back').onclick = close;
      // Bấm ra nền mờ ngoài khung → đóng (chỉ popup).
      rootEl.addEventListener('mousedown', function (ev) { if (rootEl.classList.contains('ccx-pop') && ev.target === rootEl) close(); });
    }
    rootEl.style.display = pop ? 'flex' : 'block';
    render();
    var p = document.getElementById('ccx-pin'); if (p && pop) p.focus();
    waitAuth().then(subscribe);
  }
  function close() {
    var rootEl = document.getElementById('ccx-root');
    if (rootEl) rootEl.style.display = 'none';
    unsubscribe();
  }
  document.addEventListener('keydown', function (ev) {
    var rootEl = document.getElementById('ccx-root');
    if (ev.key === 'Escape' && rootEl && rootEl.style.display !== 'none') close();
  });
  // Mở app lại sau khi để nền qua đêm: ngày đổi → gắn lại listener đúng khoảng ngày mới.
  document.addEventListener('visibilitychange', function () {
    var rootEl = document.getElementById('ccx-root');
    if (document.visibilityState === 'visible' && rootEl && rootEl.style.display !== 'none' && liveDay !== dateKey()) subscribe();
  });

  root.ChamCong = { VERSION: VERSION, init: init, open: open, close: close, _pure: pure };
})(typeof window !== 'undefined' ? window : globalThis);
