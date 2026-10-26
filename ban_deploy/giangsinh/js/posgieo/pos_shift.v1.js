// Tách từ posgieo.html dòng 5035–5308, 5864–6183, 6637–7420 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_shift.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).shift = 'dang';

// ============================================================
// [NEW] mục 2.1 NEXT_SESSION_TODO.md — Hệ thống mã nhân viên (PIN 4 số)
//
// Trước đây mọi nơi cần "tên nhân viên" là ô text tự do (ai gõ gì cũng
// được) — không xác thực, dễ gõ sai/gõ bậy, không tra cứu được đúng người.
// Giờ thay bằng: Management định nghĩa danh sách nhân viên (employees_gieogieo,
// Họ tên + PIN 4 số duy nhất), POS chỉ nhận PIN rồi tự tra ra tên, hiển thị
// xác nhận trước khi cho submit — không cho gõ tên tự do nữa ở bất kỳ đâu.
//
// Cache session (giống pattern KHO_ITEMS_CACHE) — tránh đọc Firestore mỗi
// lần gõ PIN, vì PIN được gõ ở RẤT nhiều màn hình khác nhau trong 1 ca làm
// việc. Chỉ cache nhân viên active — nhân viên bị Management tắt sẽ không
// tra được PIN nữa (đúng ý "ẩn khỏi danh sách chọn khi tạo mới" — mục 4.6).
// Cache tự làm mới định kỳ (không cần F5) để không bị lệch quá lâu nếu
// Management vừa thêm nhân viên mới trong lúc POS đang mở.
// ============================================================
let EMPLOYEES_CACHE_POS = [];

async function loadEmployeesCachePOS(force) {
  // [GIẢM-ĐỌC] Listener thay cho đọc lại mỗi 3 phút — nhân viên mới/đổi PIN vẫn thấy ngay.
  await _posLiveSubscribe('employees', fstore.collection('employees_gieogieo').where('active', '==', true),
    snap => { EMPLOYEES_CACHE_POS = snap.docs.map(d => ({ id: d.id, ...d.data() })); });
  if (_posLiveOk('employees')) return;
  if (EMPLOYEES_CACHE_POS.length && !force) return;
  try {
    const snap = await fstore.collection('employees_gieogieo').where('active', '==', true).get();
    EMPLOYEES_CACHE_POS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('loadEmployeesCachePOS failed:', err);
  }
}

// resolvePinToEmployee — tra cứu ĐỒNG BỘ trong cache đã load sẵn (không phải
// async đọc Firestore mỗi lần gõ, vì cần phản hồi tức thời khi nhân viên gõ
// đủ 4 số). Trả về {id, fullName} hoặc null nếu không hợp lệ/không active.
function resolvePinToEmployee(pin) {
  if (!/^\d{4}$/.test(pin)) return null;
  const emp = EMPLOYEES_CACHE_POS.find(e => e.pin === pin);
  return emp ? { id: emp.id, fullName: emp.fullName } : null;
}

// [NEW] mục 4.3 — Khoá tạm PIN sau 3 lần nhập sai liên tiếp. Đếm theo TỪNG Ô
// PIN riêng biệt (fieldId) chứ không theo toàn app — 1 nhân viên gõ sai ở màn
// Kho không nên bị khoá luôn cả màn Chi phí đang gõ đúng. Đếm sai CHỈ tính ở
// thời điểm SUBMIT thật sự (resolveStaffPinField), KHÔNG tính lúc đang gõ dở
// (onPinFieldInput chỉ xem trước, không đếm) — tránh khoá oan khi người dùng
// đang gõ từng số một, chưa gõ xong đã bị tính "sai".
let _pinAttemptState = {};

function _pinFieldLockRemainingMs(fieldId) {
  const st = _pinAttemptState[fieldId];
  if (!st || !st.lockedUntil) return 0;
  return Math.max(0, st.lockedUntil - Date.now());
}

function _registerWrongPin(fieldId) {
  const st = _pinAttemptState[fieldId] || (_pinAttemptState[fieldId] = { wrongCount: 0, lockedUntil: 0 });
  st.wrongCount++;
  if (st.wrongCount >= 3) {
    st.lockedUntil = Date.now() + 60 * 1000; // khoá đúng 60 giây theo yêu cầu mục 4.3
    st.wrongCount = 0;
    toast('🔒 Nhập sai mã PIN 3 lần — tạm khoá ô này 60 giây');
  }
}

function _resetPinAttempts(fieldId) {
  if (_pinAttemptState[fieldId]) _pinAttemptState[fieldId].wrongCount = 0;
}

// renderPinInput — component UI dùng chung, thay cho việc viết lặp lại ô
// "Tên nhân viên" ở 8+ chỗ. Sinh ra ô nhập PIN + dòng xác nhận tên hiện ra
// ngay dưới khi đủ 4 số (preview, không đếm là 1 lần thử sai).
// ============================================================
// NGƯỜI KÝ TRONG PHIÊN
// Trước đây MỌI thao tác cần ký tên đều bắt gõ lại PIN 4 số từ đầu — tick 8 mục
// checklist đầu ca là gõ PIN 8 lần, dù suốt ca chỉ có đúng một người đứng quầy.
//
// Chỉ bỏ qua PIN trong ĐÚNG MỘT trường hợp không thể nhầm lẫn: ca có duy nhất
// một người đang check-in. Danh tính vẫn được xác thực, vì chính họ đã gõ PIN
// lúc check-in và không còn ai khác để nhầm sang.
//
// KHÔNG nhớ "người vừa ký" khi ca có nhiều người. Nhiều người trong ca nghĩa là
// mỗi người một việc — A nấu trân châu, B nấu sữa gạo. Hiện sẵn tên A cho thao
// tác của B là ghi SAI người chế biến vào lô của B; dữ liệu sai kiểu đó tệ hơn
// nhiều so với việc phải gõ lại 4 số. Nhiều người → luôn hỏi PIN.
// ============================================================
// [PHIÊN KẾT CA] Trong pipeline kết ca thì cả quán đã check-out hết, nên nhánh
// "một mình trong ca" bên dưới không bao giờ đúng và nhân viên sẽ phải gõ PIN ở
// từng bước. Phiên kết ca ký hộ đúng các ô của pipeline (danh tính đã xác thực
// bằng PIN lúc mở phiên và sẽ được ký lại ở bước cuối). Các ô khác không đụng tới.
// Ô PIN luôn phải gõ, không bao giờ tự điền người đang trong ca. Check-in/Check-out là
// chính việc xác nhận ai vào/ra ca: tự điền người đang một mình trong ca thì người mới
// tới phải bấm "Đổi người" mới check-in được, còn bấm Check-out thì dễ check-out nhầm.
const PIN_FIELDS_ALWAYS_ASK = new Set(['checkin']);

function currentSignerPOS(fieldId) {
  if (fieldId && PIN_FIELDS_ALWAYS_ASK.has(fieldId)) return null;
  if (_closeSession && fieldId && CLOSE_PIPELINE_PIN_FIELDS.has(fieldId)) {
    return closeSessionEmployeePOS();
  }
  const dangTrongCa = _employeeShiftsTodayCache.filter(s => !s.checkedOutAt);
  if (dangTrongCa.length !== 1) return null;
  return EMPLOYEES_CACHE_POS.find(e => e.id === dangTrongCa[0].employeeId) || null;
}

let _pinFieldForceAsk = {};

// Đổi người ký: chỉ thay RIÊNG khối ô PIN, không đụng tới phần còn lại của màn.
// Làm vậy để nút chạy được ở MỌI màn có ô PIN mà không cần từng màn tự khai hàm
// vẽ lại — số liệu đang nhập dở ở các ô khác (số lượng, lý do...) cũng không bị
// mất theo.
function switchSignerPOS(fieldId) {
  _pinFieldForceAsk[fieldId] = true;
  const box = document.getElementById(fieldId + 'Box');
  if (box) {
    box.outerHTML = renderPinInput(fieldId, box.dataset.label || undefined);
    const inp = document.getElementById(fieldId + 'Pin');
    if (inp && inp.type !== 'hidden') inp.focus();
  }
}

function renderPinInput(fieldId, label) {
  label = label || 'Mã nhân viên (PIN 4 số)';
  const signer = _pinFieldForceAsk[fieldId] ? null : currentSignerPOS(fieldId);
  if (signer) {
    // Không hỏi PIN — chỉ hiện ai đang ký, kèm đường đổi người.
    return `
      <div id="${fieldId}Box" data-label="${label.replace(/"/g, '&quot;')}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 4px;padding:11px 14px;background:#f0faf4;border:1.5px solid #86efac;border-radius:12px;">
        <div style="min-width:0;">
          <div style="font-size:11px;color:#15803d;font-weight:600;">Người thực hiện</div>
          <div style="font-size:14px;font-weight:700;color:var(--td);">${signer.fullName}</div>
        </div>
        <button onclick="switchSignerPOS('${fieldId}')" style="flex-shrink:0;padding:9px 12px;border-radius:10px;border:1.5px solid #86efac;background:#fff;color:#15803d;font-family:'Google Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Đổi người</button>
      </div>
      <input id="${fieldId}Pin" type="hidden" value="__signer__">
      <div id="${fieldId}Confirm" style="display:none;"></div>
      </div>
    `;
  }
  return `
    <div id="${fieldId}Box" data-label="${label.replace(/"/g, '&quot;')}">
    <div class="wal-input-label" style="margin:10px 0 6px;">${label}</div>
    <div class="wal-input-group" style="margin-bottom:2px;">
      <input id="${fieldId}Pin" type="tel" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off"
        oninput="onPinFieldInput('${fieldId}')"
        style="width:100%;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:18px;font-weight:700;letter-spacing:6px;color:var(--td);background:transparent;padding:10px 0;">
    </div>
    <div id="${fieldId}Confirm" style="font-size:12.5px;font-weight:600;min-height:16px;margin:0 2px 4px;color:#888;"></div>
    </div>
  `;
}

// onPinFieldInput — chạy khi gõ, chỉ để XEM TRƯỚC tên tương ứng, không đếm
// vào số lần sai (số lần sai chỉ tính lúc bấm nút submit thật sự).
function onPinFieldInput(fieldId) {
  const el = document.getElementById(fieldId + 'Pin');
  const confirmEl = document.getElementById(fieldId + 'Confirm');
  if (!el || !confirmEl) return;
  el.value = el.value.replace(/\D/g, '').slice(0, 4); // chỉ giữ số, tối đa 4 ký tự
  const pin = el.value;
  if (pin.length < 4) { confirmEl.textContent = ''; return; }
  const remainMs = _pinFieldLockRemainingMs(fieldId);
  if (remainMs > 0) {
    confirmEl.textContent = `🔒 Đang tạm khoá — thử lại sau ${Math.ceil(remainMs / 1000)}s`;
    confirmEl.style.color = '#e74c3c';
    return;
  }
  const emp = resolvePinToEmployee(pin);
  if (emp) {
    confirmEl.textContent = `✅ Xác nhận: ${emp.fullName}`;
    confirmEl.style.color = '#2e7d32';
  } else {
    confirmEl.textContent = '❌ Mã PIN không tồn tại hoặc nhân viên đã ngừng hoạt động';
    confirmEl.style.color = '#e74c3c';
  }
}

// resolveStaffPinField — hàm dùng chung TRONG lúc submit: đọc ô PIN theo
// fieldId, kiểm tra khoá tạm, tra cứu, đếm lần sai nếu không hợp lệ. Trả về
// {id, fullName} nếu OK, hoặc null (đã tự toast lỗi cụ thể) nếu không được —
// nơi gọi chỉ cần `if (!emp) return;` mà không cần tự viết lại thông báo lỗi.
function resolveStaffPinField(fieldId) {
  const el = document.getElementById(fieldId + 'Pin');
  const pin = el ? (el.value || '').trim() : '';
  // Ô đang ở chế độ "người ký đã biết" (một mình trong ca, hoặc vừa ký xong) —
  // danh tính đã xác thực bằng PIN lúc check-in / lúc ký lần trước.
  if (pin === '__signer__') {
    const signer = currentSignerPOS(fieldId);
    if (signer) return signer;
    // Người đó vừa check-out giữa chừng → quay lại hỏi PIN, không cho ký chui.
    toast('⚠️ Người thực hiện đã check-out — nhập lại mã PIN');
    switchSignerPOS(fieldId);
    return null;
  }
  const remainMs = _pinFieldLockRemainingMs(fieldId);
  if (remainMs > 0) {
    toast(`🔒 Đang tạm khoá do nhập sai nhiều lần — thử lại sau ${Math.ceil(remainMs / 1000)}s`);
    return null;
  }
  if (!/^\d{4}$/.test(pin)) { toast('⚠️ Nhập đủ mã PIN 4 số'); return null; }
  const emp = resolvePinToEmployee(pin);
  if (!emp) {
    _registerWrongPin(fieldId);
    toast('❌ Mã PIN không tồn tại hoặc nhân viên đã ngừng hoạt động');
    return null;
  }
  _resetPinAttempts(fieldId);
  delete _pinFieldForceAsk[fieldId];
  return emp;
}

// requireCheckedIn — mục 2.3: chỉ nhân viên ĐANG TRONG CA (đã check-in, chưa
// check-out) mới được "ký" bất kỳ hạng mục công việc nào. Gọi NGAY SAU khi PIN
// resolve thành công, TRƯỚC khi cho submit — báo lỗi rõ ràng thay vì âm thầm
// chặn, để nhân viên biết phải đi check-in trước.
//
// Dùng cache _employeeShiftsTodayCache (không đọc Firestore mỗi lần) — nhưng
// cache này chỉ được nạp khi mở màn Ca làm việc. Nhân viên có thể mở thẳng màn
// Kho/Chi phí mà chưa từng vào màn Ca làm việc trong session này → cache rỗng,
// sẽ chặn oan. Vì vậy hàm này ASYNC và tự nạp cache nếu chưa có dữ liệu của
// đúng ngày hôm nay. Đánh dấu ngày đã nạp để qua nửa đêm tự nạp lại.
let _employeeShiftsCacheDate = null;

async function requireCheckedIn(employeeId, employeeName) {
  const today = posDateKey();
  if (_employeeShiftsCacheDate !== today) {
    await loadEmployeeShiftsTodayCache();
    _employeeShiftsCacheDate = today;
  }
  if (isEmployeeCheckedInToday(employeeId)) return true;
  // Cache có thể cũ (người này vừa check-in ở thiết bị/tab khác) — nạp lại 1
  // lần rồi mới kết luận, tránh chặn oan vì dữ liệu lệch.
  await loadEmployeeShiftsTodayCache();
  if (isEmployeeCheckedInToday(employeeId)) return true;
  toast(`⚠️ ${employeeName || 'Bạn'} chưa check-in ca hôm nay — vào tab Ca làm việc để check-in trước`);
  return false;
}

// resolveStaffPinAndCheckin — gộp 2 bước (resolve PIN + kiểm tra đang trong ca)
// thành 1 lệnh, để 8 chỗ submit không phải viết lặp lại 2 dòng giống nhau.
// Trả về {id, fullName} hoặc null (đã tự toast lỗi cụ thể).
async function resolveStaffPinAndCheckin(fieldId) {
  const emp = resolveStaffPinField(fieldId);
  if (!emp) return null;
  const ok = await requireCheckedIn(emp.id, emp.fullName);
  return ok ? emp : null;
}

// Biến thể cho các bước KẾT CA (đối soát tiền, đếm giao ca, đếm BTP, bàn giao...).
// [FIX] Trước đây mọi bước đều đòi ca ĐANG MỞ. Nhân viên bấm check-out lúc 22h
// rồi mới nhớ chưa đóng ngày là kẹt cứng: không đối soát, không đếm, không bàn
// giao được gì nữa — muốn thoát phải check-in lại, vừa tốn 1 trong 2 suất/ngày
// vừa làm sai giờ công.
// Ở các bước này, cái cần xác thực là "người này CÓ ĐI LÀM hôm nay và tự tay ký",
// không phải "đang đứng quầy" — nên chấp nhận cả ca đã check-out.
// Các thao tác vận hành (bán hàng, kho, huỷ BTP) vẫn giữ ràng buộc ca đang mở.
async function resolveStaffPinWorkedToday(fieldId) {
  const emp = resolveStaffPinField(fieldId);
  if (!emp) return null;
  const today = posDateKey();
  if (_employeeShiftsCacheDate !== today) {
    await loadEmployeeShiftsTodayCache();
    _employeeShiftsCacheDate = today;
  }
  if (_employeeShiftsOf(emp.id).length) return emp;
  await loadEmployeeShiftsTodayCache(); // cache có thể cũ — nạp lại 1 lần rồi mới kết luận
  if (_employeeShiftsOf(emp.id).length) return emp;
  toast(`⚠️ ${emp.fullName} chưa check-in ca nào hôm nay — vào tab Ca làm việc để check-in trước`);
  return null;
}

// applyStockTransactionPOS — bản sao của applyStockTransaction() bên Management App
// (2 file HTML độc lập, không share module JS), CÙNG collection, CÙNG nguyên tắc:
// mọi thay đổi tồn kho đi qua ledger stock_transactions_gieogieo qua Firestore
// runTransaction, không sửa currentStock trực tiếp (mục 2.1). Field ghi ra giống
// hệt schema mục 20 mà Management đã chuẩn hoá ở Giai đoạn 3.
function posDateKey(d) {
  d = vnDate(d || Date.now());
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ============================================================
// [NEW] mục 2.2 NEXT_SESSION_TODO.md — Check-in / Check-out cá nhân
//
// Data model employee_shifts_gieogieo/{autoId}: employeeId, employeeName
// (snapshot lúc check-in), businessDate, checkedInAt, checkedOutAt (null =
// đang trong ca). Nhiều nhân viên có thể có record cùng lúc trong 1 ngày.
//
// [Trả lời mục 4.1] Cho phép check-in/check-out TỐI ĐA 2 LẦN/NGÀY (2 lần vào,
// 2 lần ra) — vd nghỉ trưa rồi quay lại chiều. Logic chặn: nếu nhân viên đã
// có ĐỦ 2 record (2 chu kỳ vào-ra) trong businessDate hôm nay → không cho
// check-in lần 3. Nếu đang có 1 record dở dang (checkedOutAt===null) → phải
// check-out record đó trước khi check-in lại (không cho 2 record dở dang
// cùng lúc của cùng 1 người).
// ============================================================
let _employeeShiftsTodayCache = [];

async function loadEmployeeShiftsTodayCache() {
  const businessDate = posDateKey();
  // [GIẢM-ĐỌC] Listener theo đúng ngày (qua ngày thì gỡ listener cũ, gắn ngày mới) thay cho
  // đọc lại mỗi 3 phút. Check-in ở máy này hiện ngay (ghi cục bộ), ở máy khác trễ ~1 giây —
  // các chỗ "nạp lại 1 lần rồi mới kết luận" vẫn đúng, chỉ không tốn lượt đọc nữa.
  const cu = _posLive.empShifts;
  if (cu && cu.day !== businessDate) _posLiveStop('empShifts');
  await _posLiveSubscribe('empShifts',
    fstore.collection('employee_shifts_gieogieo').where('businessDate', '==', businessDate),
    snap => { if (_posLive.empShifts && _posLive.empShifts.day === businessDate) _employeeShiftsTodayCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); },
    { day: businessDate });
  if (_posLiveOk('empShifts')) return;
  try {
    const snap = await fstore.collection('employee_shifts_gieogieo').where('businessDate', '==', businessDate).get();
    _employeeShiftsTodayCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('loadEmployeeShiftsTodayCache failed:', err);
    _employeeShiftsTodayCache = [];
  }
}

function _employeeShiftsOf(employeeId) {
  return _employeeShiftsTodayCache.filter(s => s.employeeId === employeeId);
}

// isEmployeeCheckedInToday — tra cứu ĐỒNG BỘ trong cache, dùng lại ở mục 2.3
// (requireCheckedIn) để không phải đọc Firestore mỗi lần cần kiểm tra quyền ký.
function isEmployeeCheckedInToday(employeeId) {
  return _employeeShiftsOf(employeeId).some(s => !s.checkedOutAt);
}

// ---------- Kiểu dùng chung cho màn Ca làm việc ----------
// Đồng bộ với các màn đã làm lại (Nấu chế biến, Quét mở/hết): tiêu đề đậm to, nút bo tròn
// cao 56px chữ 16px, icon vẽ bằng SVG thay cho emoji.
const CA_ICONS = {
  login:  '<path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  door:   '<path d="M4 21h16"/><path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14.5" cy="12" r="1" fill="currentColor"/>',
  key:    '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3"/><path d="M17 6l3 3"/><path d="M15 8l2 2"/>',
  clock:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:  '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
  list:   '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/>',
  swap:   '<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>',
  lock:   '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  alert:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  back:   '<path d="M15 18l-6-6 6-6"/>'
};

function caIcon(name, size) {
  return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${CA_ICONS[name] || ''}</svg>`;
}

function caTitle(text, extra) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
      <div style="font-size:19px;font-weight:800;color:var(--td);">${text}</div>${extra || ''}</div>`;
}

// kind: 'primary' (nền màu chính), 'plain' (nền trắng viền xám), 'danger' (nền đỏ nhạt)
function caBtn(onclick, icon, label, kind, extraStyle) {
  const st = kind === 'primary' ? 'background:var(--gd);color:#fff;border:none;box-shadow:0 4px 12px rgba(226,58,93,.3);'
    : kind === 'danger' ? 'background:#fee2e2;color:#b91c1c;border:2px solid #fca5a5;'
    : 'background:#fff;color:var(--td);border:2px solid #e6e1d2;';
  return `<button onclick="${onclick}" style="width:100%;min-height:56px;display:flex;align-items:center;justify-content:center;gap:9px;padding:0 16px;border-radius:99px;${st}font-family:'Google Sans',sans-serif;font-size:16px;font-weight:800;cursor:pointer;${extraStyle || ''}">${icon ? caIcon(icon) : ''}${label}</button>`;
}

function caInitials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return w.length ? w[w.length - 1][0].toUpperCase() : '?';
}

async function renderCheckinBlock() {
  const box = document.getElementById('checkinBlock');
  showLoading(box);
  await loadEmployeeShiftsTodayCache();
  const checkedInList = _employeeShiftsTodayCache.filter(s => !s.checkedOutAt);
  const hm = iso => vnDate(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 12px;padding:16px;">
      ${caTitle('Check-in / Check-out', `<span style="font-size:13px;font-weight:800;color:var(--gd);background:var(--gl);border-radius:999px;padding:4px 10px;">${checkedInList.length} đang trong ca</span>`)}
      ${checkedInList.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
          ${checkedInList.map(s => `
            <span style="display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border-radius:999px;background:#F6F4EF;">
              <span style="width:30px;height:30px;border-radius:50%;background:#fff;color:var(--td);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;">${escHtmlPos(caInitials(s.employeeName))}</span>
              <span style="font-size:14.5px;font-weight:800;color:var(--td);">${escHtmlPos(s.employeeName || '')}</span>
              <span style="font-size:12.5px;color:#8A8A90;">${hm(s.checkedInAt)}</span>
            </span>`).join('')}
        </div>
      ` : `<div style="font-size:14px;color:#9A9AA0;margin:0 0 4px;">Chưa có ai check-in.</div>`}
      ${renderPinInput('checkin', 'Mã PIN nhân viên')}
      <div style="display:flex;gap:10px;margin-top:10px;">
        ${caBtn('doCheckIn()', 'login', 'Check-in', 'primary', 'flex:1;')}
        ${caBtn('doCheckOut()', 'door', 'Check-out', 'plain', 'flex:1;')}
      </div>
      <button onclick="openMyDutyCasesPOS()" style="width:100%;margin-top:10px;padding:11px;background:none;border:none;color:#a89a7e;font-family:'Google Sans',sans-serif;font-size:13px;font-weight:800;text-decoration:underline;cursor:pointer;">Xem phần trách nhiệm của tôi</button>
    </div>
  `;
  renderDutyTasksPOS();
  UnitEngine.consume.recoverDuplicates().catch(err => console.warn('[UnitEngine] phục hồi phần trừ trùng lỗi', err));
  UnitEngine.duty.recoverVerifyUndo().catch(err => console.warn('[UnitEngine] hoàn tác xác minh dở lỗi', err));
}

async function doCheckIn() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _doCheckInImpl(); } finally { _posSubmitBusy = false; }
}

async function _doCheckInImpl() {
  const emp = resolveStaffPinField('checkin');
  if (!emp) return;
  const shifts = _employeeShiftsOf(emp.id);
  if (shifts.some(s => !s.checkedOutAt)) { toast('⚠️ Bạn đã check-in rồi, chưa check-out lần trước'); return; }
  if (shifts.length >= 2) { toast('⚠️ Đã đạt tối đa 2 lần check-in/check-out trong hôm nay'); return; }
  const businessDate = posDateKey();
  // [BUG#35 FIX] Ghi kèm SNAPSHOT điều khoản lương vào chính ca này.
  // Trước đây ca chỉ lưu employeeId, nên Management tính lương lịch sử phải join với bản ghi nhân
  // viên HIỆN TẠI: xoá hẳn nhân viên là mất sạch lương giờ lịch sử của người đó khỏi Labor
  // cost/P&L các ngày đã chốt, và đổi đơn giá giữa tháng thì những ngày cũ bị tính lại theo đơn
  // giá mới. Có snapshot thì mỗi ca tự mang đủ căn cứ tính tiền của đúng thời điểm đó.
  const payTerms = {
    payType: emp.payType || null,
    hourlyRate: Number(emp.hourlyRate) || 0,
    otEnabled: !!emp.otEnabled,
    otThresholdHours: Number(emp.otThresholdHours) || 8,
    otRate: Number(emp.otRate) || 0,
    fixedMonthlySalary: Number(emp.fixedMonthlySalary) || 0,
    snapshotAt: vnDate().toISOString()
  };
  // Chức năng làm việc (pha chế/order) chụp vào ca như payTerms: sửa hồ sơ về sau không đổi
  // lịch sử. Người được tích 'barista' chịu hao hụt định lượng trong khoảng họ có mặt.
  const roles = Array.isArray(emp.roles) ? emp.roles.filter(r => typeof r === 'string' && r) : [];
  try {
    const checkedInAt = vnDate().toISOString();
    const ref = await fstore.collection('employee_shifts_gieogieo').add({
      employeeId: emp.id, employeeName: emp.fullName, businessDate, payTerms, roles,
      checkedInAt, checkedOutAt: null
    });
    _employeeShiftsTodayCache.push({ id: ref.id, employeeId: emp.id, employeeName: emp.fullName, businessDate, payTerms, roles, checkedInAt, checkedOutAt: null });
    toast(`✅ ${emp.fullName} đã check-in`);
    document.getElementById('checkinPin').value = '';
    renderCheckinBlock();
    // Có BTP nghi lệch do người khác cân → nhắc (không chặn gì).
    UnitEngine.duty.listOpenTasks().then(ts => { const n = ts.filter(t => t.firstById !== emp.id).length; if (n) setTimeout(() => toast('📋 Có ' + n + ' bán thành phẩm cần cân lại — xem ở Ca làm việc'), 2200); }).catch(() => {});
  } catch (err) {
    console.error('doCheckIn failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

async function doCheckOut() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _doCheckOutImpl(); } finally { _posSubmitBusy = false; }
}

async function _doCheckOutImpl() {
  const emp = resolveStaffPinField('checkin');
  if (!emp) return;
  const openShift = _employeeShiftsOf(emp.id).find(s => !s.checkedOutAt);
  if (!openShift) { toast('⚠️ Bạn chưa check-in ca nào đang mở'); return; }
  // [FIX] Nhắc trước khi check-out nếu ngày chưa đóng VÀ người này là người cuối
  // cùng còn trong ca — đúng tình huống hay kẹt: bấm check-out xong mới nhớ chưa
  // kết ca. Chỉ CẢNH BÁO chứ không chặn: có thể quán thật sự còn người khác vào
  // sau, hoặc hôm đó nghỉ sớm chưa muốn đóng ngày.
  // [GIAO CA] Người đang giữ két không được rời quầy khi vẫn còn người khác đứng
  // bán mà chưa đếm bàn giao — đây đúng là lúc trách nhiệm tiền chuyển tay.
  if (await handoverRequiredOnCheckOutPOS(emp)) {
    toast('🤝 Cần đếm tiền bàn giao trước khi check-out');
    await openHandoverPOS('checkout');
    return;
  }
  // [BTP ÂM 23/10] Ca có bán BTP lúc không còn lô → phải trả lời đã dùng gì thay rồi mới check-out được.
  if (await prepUntrackedAskOnCheckOut(emp, openShift)) return;
  // [HẠN DÙNG 23/10] Còn lô BTP / mã NL ĐÃ quá hạn đang mở → xử lý rồi mới check-out (xong tự check-out lại).
  if (await expiryAskOnCheckOut()) return;
  const conNguoiKhac = _employeeShiftsTodayCache.some(s => !s.checkedOutAt && s.employeeId !== emp.id);
  if (!conNguoiKhac) {
    let daDongNgay = false;
    try {
      const doc = await fstore.collection('daily_closings_gieogieo').doc(posDateKey()).get();
      daDongNgay = doc.exists && doc.data().status === 'closed';
    } catch (err) {
      console.warn('doCheckOut: không đọc được trạng thái đóng ngày, bỏ qua nhắc:', err);
      daDongNgay = true; // lỗi mạng thì đừng cản đường, cứ cho check-out
    }
    // [FIX-confirm-webview] confirm() luôn trả false trong app bọc → nhánh này TỰ ĐỘNG
    // return, nhân viên bấm Check-out mà không có gì xảy ra và cũng không báo lỗi.
    // [PHIÊN KẾT CA] Thứ tự đã ĐẢO so với bản cũ: giờ phải CHECK-OUT TRƯỚC rồi
    // mới kết ca được. Vì vậy đây không còn là cảnh báo "làm sai thứ tự" nữa mà
    // chỉ là lời nhắc đừng quên quay lại kết ca sau khi đã check-out.
    //
    // Cố tình KHÔNG nói gì về giờ công ở màn POS. Nhân viên chỉ cần biết THỨ TỰ
    // thao tác; chuyện tính công là việc của Quản lý, nói ra chỉ tạo tranh cãi
    // ngay giữa quầy mà không giúp họ làm đúng hơn.
    if (!daDongNgay && !(await posConfirm(
      'Bạn là người cuối cùng còn trong ca và hôm nay CHƯA đóng ngày.\n\nCheck-out xong hãy bấm "🔒 Kết ca" để đối soát tiền → đếm BTP → bàn giao → đóng ngày.\n\nCheck-out bây giờ?',
      { okText: 'Check-out & kết ca', cancelText: 'Chưa, để sau' }))) return;
  }
  try {
    const checkedOutAt = vnDate().toISOString();
    await fstore.collection('employee_shifts_gieogieo').doc(openShift.id).update({ checkedOutAt });
    openShift.checkedOutAt = checkedOutAt; // cập nhật cache tại chỗ — invalidate đúng ý "khi chính người đó check-out"
    toast(`✅ ${emp.fullName} đã check-out`);
    document.getElementById('checkinPin').value = '';
    renderCheckinBlock();
  } catch (err) {
    console.error('doCheckOut failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

async function openCaLamViecScreen() {
  showScreen('caLamViecScreen');
  renderCheckinBlock(); // độc lập với luồng mở/kết ca bên dưới, tự load riêng
  // Dọn ca treo từ ngày cũ — chạy nền, không chặn màn hình.
  closeStaleEmployeeShifts().then(n => { if (n) renderCheckinBlock(); });
  const box = document.getElementById('shiftBody');
  showLoading(box);
  const businessDate = posDateKey();
  // Phiên kết ca của HÔM QUA không được phép ký cho hôm nay (app mở xuyên đêm).
  if (_closeSession && _closeSession.businessDate !== businessDate) _closeSession = null;
  shiftState = { businessDate, opening: null, closing: null };
  try {
    const [openingSnap, closingSnap] = await Promise.all([
      fstore.collection('daily_openings_gieogieo').doc(businessDate).get(),
      fstore.collection('daily_closings_gieogieo').doc(businessDate).get()
    ]);
    shiftState.opening = openingSnap.exists ? openingSnap.data() : null;
    shiftState.closing = closingSnap.exists ? closingSnap.data() : null;
  } catch (err) {
    console.error('openCaLamViecScreen load failed', err);
    box.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được dữ liệu ca<br><span style="color:#aaa;font-size:12px">${err.message || ''}</span></div>`;
    return;
  }
  await loadSegmentsPOS(businessDate);  // [GIAO CA] biết đang ở đoạn ca nào, ai giữ két
  await loadStaleShiftDays(); // [NEW] quét ngày treo trước khi vẽ dashboard
  try { await recheckCloseAfterSalesPOS(); }
  catch (err) {
    console.error('[Kết ca] không kiểm tra được bill mới:', err);
    box.innerHTML = '<div class="kc-card">Không kiểm tra được bill mới. Vui lòng kết nối mạng và thử lại.</div><button onclick="openCaLamViecScreen()" class="kc-btn" style="background:var(--gd);color:#fff;">Thử lại</button>';
    return;
  }
  renderShiftDashboard();
}

// ============================================================
// [NEW] Cảnh báo "ngày trước chưa đóng"
//
// Vấn đề thật: openCaLamViecScreen() chỉ đọc doc của ĐÚNG businessDate hôm nay.
// Nếu tối qua nhân viên bỏ dở giữa pipeline kết ca (vd dừng ở 'cash_passed' rồi
// tắt app), sáng nay mở lên chỉ thấy "Chưa mở ca hôm nay" hoàn toàn bình thường
// — không ai biết ngày hôm qua bị treo. Ngày treo đó vĩnh viễn không được đóng,
// và cũng KHÔNG chặn bán hàng (chỉ status==='closed' mới chặn).
//
// Quét 7 ngày gần nhất (không tính hôm nay): ngày nào ĐÃ MỞ CA mà closing chưa
// 'closed' thì coi là treo. Chỉ xét ngày đã mở ca — ngày nghỉ không mở ca thì
// không có gì phải đóng, cảnh báo sẽ thành nhiễu.
//
// Chỉ CẢNH BÁO, không chặn: ngày treo là dữ liệu quá khứ, ép xử lý trước khi
// cho mở ca hôm nay sẽ chặn cả quán không bán được hàng — sai về vận hành.
// ============================================================
let _staleShiftDays = [];

async function loadStaleShiftDays() {
  _staleShiftDays = [];
  const todayKey = posDateKey();
  const keys = [];
  for (let i = 1; i <= 7; i++) {
    const d = vnDate(); d.setDate(d.getDate() - i);
    keys.push(posDateKey(d));
  }
  try {
    const results = await Promise.all(keys.map(k => Promise.all([
      fstore.collection('daily_openings_gieogieo').doc(k).get(),
      fstore.collection('daily_closings_gieogieo').doc(k).get()
    ])));
    results.forEach(([openSnap, closeSnap], idx) => {
      const key = keys[idx];
      if (key === todayKey) return;
      if (!openSnap.exists) return; // ngày không mở ca (nghỉ) → không có gì để đóng
      const st = closeSnap.exists ? closeSnap.data().status : null;
      if (st === 'closed') return;
      _staleShiftDays.push({ dateKey: key, status: st });
    });
  } catch (err) {
    // Lỗi mạng/quyền → bỏ qua cảnh báo, tuyệt đối không chặn màn Ca làm việc
    console.warn('loadStaleShiftDays lỗi (bỏ qua cảnh báo ngày treo):', err);
  }
}

// Diễn giải status thành câu người dùng hiểu được — tránh hiện chuỗi kỹ thuật
// kiểu 'cash_passed' cho nhân viên.
function _staleStatusLabel(st) {
  if (!st) return 'chưa bắt đầu kết ca';
  if (st === 'pending') return 'đối soát tiền mặt chưa khớp';
  if (st === 'cash_passed') return 'đã đối soát tiền mặt, chưa xong bước sau';
  if (st === 'cash_variance_recorded') return 'tiền mặt lệch (đã ghi nhận), chưa xong bước sau';
  if (st === 'bank_passed') return 'đã đối soát xong, chưa bàn giao';
  if (st === 'handed_over') return 'đã bàn giao, chưa xác nhận đóng ngày';
  return st;
}

function renderStaleShiftWarning() {
  if (!_staleShiftDays.length) return '';
  return `
    <div style="background:#fef3c7;border:1.5px solid #fcd34d;border-radius:16px;padding:14px 16px;margin:0 0 14px;">
      <div style="font-size:13.5px;font-weight:800;color:#92400e;margin-bottom:6px;">⚠️ Có ${_staleShiftDays.length} ngày chưa đóng</div>
      ${_staleShiftDays.map(d => `
        <div style="font-size:12.5px;color:#92400e;padding:3px 0;">
          • <b>${posDateKeyToDisplay(d.dateKey)}</b> — ${_staleStatusLabel(d.status)}
        </div>`).join('')}
      <div style="font-size:11.5px;color:#a16207;margin-top:8px;line-height:1.5;">Ngày cũ không đóng được từ màn này (chỉ thao tác được ngày hôm nay). Nhờ Quản lý mở app Quản lý → <b>Tiền mặt</b>, ở đầu màn có ô đỏ liệt kê các ngày này kèm nút <b>Đóng ngày</b>.</div>
    </div>`;
}

// ============================================================
// [GĐ5] CHECKLIST ĐẦU CA
//
// Ráp 4 giai đoạn trước lại: cấu hình từ Management (GĐ4), tồn BTP đầu ngày lấy
// từ đếm cuối ca hôm qua (GĐ3), cần chuẩn bị bao nhiêu lấy từ dailyTarget (GĐ1),
// và bấm thẳng sang màn chế biến đã hỗ trợ nấu theo tỷ lệ mẻ (GĐ2).
//
// NGUYÊN TẮC CHẶN — quan trọng nhất về vận hành:
//   · Mục 'blocking' mới chặn tạo bill; mặc định Management để tắt.
//   · Mục 'prep_ready' TỰ PASS khi BTP đang được chế biến (lô status='cooking').
//     Trà ủ 15 phút thì vẫn mở ca bán được, không bắt nhân viên đứng chờ.
//   · Luôn có nút "Bỏ qua — ghi lý do" + PIN: chặn cứng lúc đông khách gây thiệt
//     hại thật, nên để lại vết cho Quản lý thay vì khoá tuyệt đối.
// ============================================================
// ============================================================
// [MỚI] Khoá thời gian tối thiểu + nhật ký bắt đầu/hoàn thành cho MỌI mục
// checklist có đặt minDurationSec (mục tự khai của Quản lý lẫn bước "Kiểm tra
// Refill" cuối ca) — ghi vào checklist_activity_logs_gieogieo.
//
// Vì sao cần: trước đây "Kiểm tra Refill"/checklist tự khai chỉ cần tick/bấm
// Xong là qua ngay, kể cả khi nhân viên KHÔNG thật sự đi đếm/kiểm tra hàng —
// đúng lỗ hổng khiến số liệu lý thuyết (bill trừ đúng size ly) và tồn thực tế
// lệch nhau mà không ai biết vì sao. Khoá tối thiểu N giây kèm đếm ngược buộc
// nhân viên phải đứng ở màn đó đủ lâu mới bấm Xong được.
//
// KHÔNG khoá nút "Bỏ qua": bỏ qua đã tự có giá đắt hơn rồi (phải gõ lý do +
// PIN, Quản lý xem lại được) — khoá luôn cả bỏ qua thì mất nốt lối thoát duy
// nhất, biến một cảnh báo thành bẫy kẹt ca giữa giờ đông khách.
//
// Doc ID = `${businessDate}_${phase}_${stepKey}` (không dùng add() tự sinh id)
// để ghi "bắt đầu" là idempotent — nhân viên refresh trang giữa chừng không bị
// tính lại từ đầu (mất hết thời gian đã đứng chờ) và không tạo log trùng.
// ============================================================
function _clLogId(phase, stepKey) { return `${shiftState.businessDate}_${phase}_${stepKey}`; }

// Cache trong phiên: khỏi phải đọc lại Firestore mỗi giây lúc màn đang đếm ngược.
let _clLocalStarts = {};

async function clEnsureStarted(phase, stepKey, stepLabel, minRequiredSec) {
  minRequiredSec = Math.max(0, Number(minRequiredSec) || 0);
  const cacheKey = phase + ':' + stepKey;
  if (_clLocalStarts[cacheKey]) return _clLocalStarts[cacheKey];
  if (!minRequiredSec) {
    // Không khoá thời gian thì khỏi ghi log làm gì — log này chỉ có ý nghĩa đối
    // chiếu khi CÓ ngưỡng thời gian để so.
    _clLocalStarts[cacheKey] = { startedAt: vnDate().toISOString(), minRequiredSec: 0 };
    return _clLocalStarts[cacheKey];
  }
  const id = _clLogId(phase, stepKey);
  try {
    const ref = fstore.collection('checklist_activity_logs_gieogieo').doc(id);
    const doc = await ref.get();
    if (doc.exists && !doc.data().completedAt) {
      // Đã bắt đầu từ trước (refresh trang giữa chừng) — giữ nguyên mốc cũ, không
      // reset đồng hồ đếm ngược cho nhân viên "câu giờ" bằng cách bấm F5.
      _clLocalStarts[cacheKey] = { startedAt: doc.data().startedAt, minRequiredSec };
      return _clLocalStarts[cacheKey];
    }
    const startedAt = vnDate().toISOString();
    await ref.set({
      businessDate: shiftState.businessDate, phase, stepKey, stepLabel,
      startedAt, completedAt: null, durationSec: null,
      minRequiredSec, metMinimum: null
    });
    _clLocalStarts[cacheKey] = { startedAt, minRequiredSec };
  } catch (err) {
    console.warn('clEnsureStarted lỗi (không chặn luồng chính, chỉ mất khoá thời gian):', err);
    _clLocalStarts[cacheKey] = { startedAt: vnDate().toISOString(), minRequiredSec: 0 };
  }
  return _clLocalStarts[cacheKey];
}

function clRemainingSec(phase, stepKey) {
  const s = _clLocalStarts[phase + ':' + stepKey];
  if (!s || !s.minRequiredSec) return 0;
  const elapsed = (Date.now() - Date.parse(s.startedAt)) / 1000;
  return Math.max(0, Math.ceil(s.minRequiredSec - elapsed));
}

async function clLogComplete(phase, stepKey, staffEmp) {
  const s = _clLocalStarts[phase + ':' + stepKey];
  if (!s || !s.minRequiredSec) return; // không đặt ngưỡng thì không có log để hoàn thành
  const id = _clLogId(phase, stepKey);
  try {
    const durationSec = Math.max(0, Math.round((Date.now() - Date.parse(s.startedAt)) / 1000));
    await fstore.collection('checklist_activity_logs_gieogieo').doc(id).set({
      completedAt: vnDate().toISOString(), durationSec,
      metMinimum: durationSec >= s.minRequiredSec,
      staff: staffEmp ? staffEmp.fullName : '', staffEmployeeId: staffEmp ? staffEmp.id : ''
    }, { merge: true });
  } catch (err) {
    console.warn('clLogComplete lỗi (không chặn luồng chính, chỉ mất bằng chứng đã hoàn thành):', err);
  }
}

// 1 hẹn giờ dùng chung cho mọi màn checklist (chỉ 1 màn hiển thị tại 1 thời điểm) —
// tick lại đúng 1 giây/lần để cập nhật số đếm ngược, không chồng nhiều interval.
let _clCountdownTimer = null;

function clClearCountdownTimer() {
  if (_clCountdownTimer) { clearTimeout(_clCountdownTimer); _clCountdownTimer = null; }
}

function clArmCountdownRerender(renderFn) {
  if (_clCountdownTimer) return;
  _clCountdownTimer = setTimeout(() => { _clCountdownTimer = null; renderFn(); }, 1000);
}

// Nút "Xong"/"Tiếp tục" bị khoá — dùng chung cho mọi màn có khoá thời gian.
function clLockedButtonHTML(remain) {
  return `<button disabled style="padding:7px 12px;border-radius:10px;border:none;background:#ddd;color:#888;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:not-allowed;">Còn ${remain}s</button>`;
}

let _openChecklistState = { items: [], loaded: false, staff: null };

// Thứ trong tuần theo quy ước Management: 2..7 = T2..T7, 8 = CN
function posWeekdayKey(d) {
  const w = (d || vnDate()).getDay();   // 0=CN
  return w === 0 ? 8 : w + 1;
}

async function computeOpeningChecklistPOS(opts) {
  const today = posWeekdayKey();
  let defs = [];
  try {
    const snap = await fstore.collection('shift_checklists_gieogieo').where('phase', '==', 'open').get();
    defs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false)
      .filter(c => !Array.isArray(c.activeDays) || !c.activeDays.length || c.activeDays.includes(today))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  } catch (err) {
    console.warn('computeOpeningChecklistPOS: không đọc được cấu hình (bỏ qua checklist):', err);
    return [];
  }
  if (opts && opts.gateSkip) defs = defs.filter(d => d.blocking && !opts.gateSkip.has(d.id));
  if (!defs.length) return [];

  // Chỉ nạp dữ liệu cho loại auto thực sự có trong danh sách — tránh 3 query thừa
  // mỗi lần mở ca khi quán chỉ dùng vài mục.
  const kinds = new Set(defs.map(d => d.autoCheck).filter(Boolean));
  const ctx = {};
  if (kinds.has('prep_ready')) ctx.prep = await computePrepPlanPOS();
  if (kinds.has('stockcount_due')) ctx.stockCountDone = await hasStockCountTodayPOS();
  if (kinds.has('refill_below_min')) ctx.refillLow = await countRefillBelowMinPOS();
  // 🆕 GĐ4 kế hoạch V3 — PHẦN 3.2: mục checklist mới "Đếm giao ca" — thường ĐÃ
  // xong tự động vì luồng mở ca (GĐ3) đã bắt đếm ngay sau khi mở ca, trước khi
  // tới màn checklist này. Vẫn tính lại ở đây để hiện đúng trạng thái nếu Quản
  // lý cấu hình mục này, và để có điểm audit/nút hành động rõ ràng.
  if (kinds.has('count_handover')) ctx.handoverPending = await computeHandoverOpenLinesPOS();

  return defs.map(d => {
    const item = { id: d.id, label: d.label || '', blocking: !!d.blocking, autoCheck: d.autoCheck || null, done: false, detail: '', plan: null,
      minDurationSec: Math.max(0, Number(d.minDurationSec) || 0) };
    if (!d.autoCheck) return item;                       // tick tay
    if (d.autoCheck === 'prep_ready') {
      const plan = ctx.prep || [];
      const pending = plan.filter(x => !x.ok);
      item.plan = plan;
      item.done = pending.length === 0;
      item.detail = pending.length
        ? `Còn ${pending.length} loại cần chuẩn bị`
        : (plan.length ? 'Đã đủ hàng để bán' : 'Chưa khai lượng cần chuẩn bị');
    } else if (d.autoCheck === 'stockcount_due') {
      item.done = !!ctx.stockCountDone;
      item.detail = item.done ? 'Đã kiểm kho hôm nay' : 'Hôm nay có lịch kiểm kho — chưa làm';
    } else if (d.autoCheck === 'refill_below_min') {
      item.done = (ctx.refillLow || 0) === 0;
      item.detail = item.done ? 'Không có nguyên liệu dưới mức tối thiểu' : `${ctx.refillLow} nguyên liệu dưới mức tối thiểu ở quầy`;
    } else if (d.autoCheck === 'count_handover') {
      const pending = ctx.handoverPending || [];
      item.done = pending.length === 0;
      item.detail = item.done ? 'Đã đếm giao ca đầu ca' : `Còn ${pending.length} món cần đếm giao ca`;
    }
    return item;
  });
}

// Kế hoạch chuẩn bị BTP: cần bao nhiêu, còn bao nhiêu, phải nấu thêm bao nhiêu.
// Tồn hiện tại lấy currentStock — sau bước đếm cuối ca hôm qua (GĐ3) nó ĐÃ được
// đồng bộ về đúng số cân thật, nên đây là con số đáng tin nhất.
async function computePrepPlanPOS() {
  try {
    const [prepSnap, batchSnap] = await Promise.all([
      fstore.collection('prep_items_gieogieo').get(),
      fstore.collection('prep_batches_gieogieo').where('status', '==', 'cooking').get()
    ]);
    const cookingByPrep = {};
    batchSnap.docs.forEach(d => {
      const b = d.data();
      // Lô đang nấu chưa cân được → ước lượng theo tỷ lệ mẻ để biết "sắp có bao nhiêu"
      cookingByPrep[b.prepId] = (cookingByPrep[b.prepId] || 0) + (Number(b.batchRatio) || 0);
    });
    return prepSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.active !== false && Number(p.dailyTarget) > 0)
      .map(p => {
        const target = Number(p.dailyTarget) || 0;
        const have = Number(p.currentStock) || 0;
        const yieldPerBatch = Number(p.batchYield) || 0;
        const cookingQty = (cookingByPrep[p.id] || 0) * yieldPerBatch;
        const need = Math.max(0, target - have);
        // ok khi: đã đủ hàng HOẶC phần đang nấu bù được phần thiếu
        const ok = need <= 0 || cookingQty >= need;
        return {
          prepId: p.id, name: p.name || '', unit: p.unit || '', target, have,
          need, cooking: cookingQty, yieldPerBatch,
          ratioNeeded: yieldPerBatch > 0 ? Math.round((need / yieldPerBatch) * 100) / 100 : 0,
          ok
        };
      })
      .sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? 1 : -1));
  } catch (err) {
    console.warn('computePrepPlanPOS lỗi:', err);
    return [];
  }
}

async function hasStockCountTodayPOS() {
  try {
    const snap = await fstore.collection('stock_counts_gieogieo').where('businessDate', '==', posDateKey()).get();
    return snap.size > 0;
  } catch (err) { console.warn('hasStockCountTodayPOS lỗi:', err); return true; } // lỗi mạng → không chặn
}

async function countRefillBelowMinPOS() {
  try {
    const [ruleSnap, itemSnap] = await Promise.all([
      refillRulesSnapPOS(),
      fstore.collection('inventory_items_gieogieo').get()
    ]);
    const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return ruleSnap.docs.map(d => d.data()).filter(r => {
      const it = items.find(x => x.id === r.itemId);
      const cur = (it && it.locationStock && it.locationStock[r.destLocationId]) || 0;
      return cur < (Number(r.minBase) || 0);
    }).length;
  } catch (err) { console.warn('countRefillBelowMinPOS lỗi:', err); return 0; }
}

// ---- Cờ chặn bán, cùng cơ chế với _isShiftOpenedToday ----
let _openChecklistBlocking = false;

let _openGateClearedDay = null;

// Nhịp định kỳ của cổng. Bỏ qua khi app đang ẩn, và khi hôm nay cổng đã mở hẳn.
// Nếu có luồng nào bật lại _openChecklistBlocking=true (vd vào lại màn kiểm kê đầu ca),
// điều kiện thứ hai tự hết hiệu lực và nhịp này chạy lại như cũ.
function _openingGateTick() {
  if (document.hidden) return;
  // [GIẢM-ĐỌC] Chưa mở ca thì bán hàng đã bị chặn sẵn bởi _isShiftOpenedToday — tính cổng lúc
  // này (mỗi lượt ~200 lượt đọc) không để làm gì. Trước đây vòng này chạy mỗi phút từ 0h tới
  // lúc mở ca nếu máy để sáng màn hình qua đêm. Lúc ca vừa được mở, _watchShiftOpenedStatus tự
  // gọi refreshOpeningChecklistGate() ngay, không đợi tới nhịp này.
  if (!_isShiftOpenedToday) return;
  if (_openGateClearedDay === posDateKey() && !_openChecklistBlocking) return;
  refreshOpeningChecklistGate();
}

async function refreshOpeningChecklistGate() {
  try {
    const opening = await fstore.collection('daily_openings_gieogieo').doc(posDateKey()).get();
    const doneIds = new Set(((opening.exists && opening.data().checklistDone) || []).map(x => x.id));
    const overrideIds = new Set(((opening.exists && opening.data().checklistOverrides) || []).map(x => x.id));
    // [GIẢM-ĐỌC] Cổng chỉ cần biết mục BẮT BUỘC nào chưa xong — không tính các mục tự kiểm
    // (đọc cả kho, cả BTP...) của mục không chặn hoặc đã tick/đã bỏ qua. Kết quả chặn/không
    // chặn y hệt cách tính cũ (chỉ các mục này mới có thể làm nó thành true).
    const gateSkip = new Set([...doneIds, ...overrideIds]);
    const [items, shiftCountLines, expLines] = await Promise.all([computeOpeningChecklistPOS({ gateSkip }), computeShiftInventoryCountLinesPOS('open'),
      (opening.exists && opening.data().expiryCheckedAt) ? [] : loadExpiryCheckLinesPOS().catch(err => { console.warn('[Hạn dùng] cổng đầu ca: không đọc được lô (không chặn)', err); return []; })]);
    _openChecklistBlocking = items.some(it =>
      it.blocking && !it.done && !doneIds.has(it.id) && !overrideIds.has(it.id)) || shiftCountLines.length > 0 || expLines.length > 0;
    // Chỉ chốt "đã mở hẳn" khi tính THÀNH CÔNG (nhánh lỗi bên dưới cũng đặt false nhưng
    // không được chốt) và đã mở ca — trước khi mở ca thì còn kiểm tiếp như cũ.
    _openGateClearedDay = (!_openChecklistBlocking && _isShiftOpenedToday) ? posDateKey() : null;
  } catch (err) {
    // Lỗi mạng → KHÔNG chặn. Chặn cả quán không bán được vì rớt mạng tệ hơn nhiều
    // so với sót một mục checklist (cùng triết lý với _watchShiftOpenedStatus).
    console.warn('refreshOpeningChecklistGate lỗi (không chặn bán):', err);
    _openChecklistBlocking = false;
  }
}

function requireOpeningChecklistDone() {
  if (!_openChecklistBlocking) return true;
  toast('🚫 Còn việc đầu ca bắt buộc chưa xong — vào tab Ca làm việc để hoàn tất');
  return false;
}

// ---- Màn checklist đầu ca ----
// silent=true: KHÔNG xoá nội dung đang hiển thị trong lúc nạp lại.
// [FIX] Trước đây mỗi lần tick một mục là màn hình bị thay bằng chữ "Đang tính
// việc đầu ca..." rồi mới vẽ lại — nháy trắng một cái, mất luôn vị trí cuộn, tick
// 8 mục là nháy 8 lần. Giờ tick xong giữ nguyên màn cũ, chỉ thay khi dữ liệu mới
// đã sẵn sàng; chữ "Đang tính..." chỉ còn dùng cho lần mở màn đầu tiên (lúc đó
// màn vốn trống, không có gì để giữ).
async function renderOpeningChecklist(silent) {
  if(!silent && !_shiftWorkflowPOS) startShiftWorkflowPOS('opening');
  const box = document.getElementById('shiftBody');
  clClearCountdownTimer();
  if (!silent) box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Đang tính việc đầu ca...</div>';
  // Resume safety (GĐ3 kế hoạch V3): nếu nhân viên lỡ thoát app giữa lúc đang
  // đếm giao ca đầu ca, bấm lại "Việc đầu ca" vẫn bắt hoàn thành đếm trước —
  // computeHandoverOpenLinesPOS() tự trả rỗng nếu hôm nay đã đếm xong rồi.
  let handoverLines = [];
  try { handoverLines = await computeHandoverOpenLinesPOS(); }
  catch (err) { console.warn('computeHandoverOpenLinesPOS (resume) lỗi (bỏ qua):', err); }
  if (handoverLines.length) { await renderHandoverOpenScreen(handoverLines); return; }
  // [KIỂM KÊ CA] Khi quay lại tab hoặc tải lại app, không được bỏ qua bước đếm đầu ca.
  let shiftCountLines;
  try { shiftCountLines = await computeShiftInventoryCountLinesPOS('open'); }
  catch(err){ box.innerHTML='<div class="kc-card">Không tải được danh sách nguyên liệu cần kiểm kê đầu ca.</div><button onclick="renderOpeningChecklist()" class="kc-btn" style="background:#0062AD;color:#fff">Thử lại</button>'; return; }
  if(shiftCountLines.length){ _openChecklistBlocking=true; await renderShiftInventoryCountPOS('open',shiftCountLines); return; }
  // [HẠN DÙNG 23/10] Lô BTP / mã NL hết hạn trong hôm nay → kiểm ngay lúc mở ca (không hỏi lúc bán). Lỗi đọc → bỏ qua bước này.
  // Kiểm MỘT lần mỗi ngày (dấu expiryCheckedAt trên bản ghi mở ca): tải lại app giữa ngày không chặn bán vì lô mới nấu.
  let expLines = [];
  try {
    const od = await fstore.collection('daily_openings_gieogieo').doc(posDateKey()).get();
    if (!(od.exists && od.data().expiryCheckedAt)) { expLines = await loadExpiryCheckLinesPOS(); if (!expLines.length) await expiryOpenDone().catch(err => console.warn('[Hạn dùng] chưa ghi được dấu đã kiểm', err)); }
  } catch (err) { console.warn('[Hạn dùng] không đọc được lô — bỏ qua bước kiểm hạn', err); }
  if (expLines.length) { _openChecklistBlocking = true; expiryCheckShow({ phase: 'open', lines: expLines }); return; }
  let items = [], doneIds = new Set(), overrideIds = new Set();
  try {
    const [list, openDoc] = await Promise.all([
      computeOpeningChecklistPOS(),
      fstore.collection('daily_openings_gieogieo').doc(shiftState.businessDate).get()
    ]);
    items = list;
    const d = openDoc.exists ? openDoc.data() : {};
    doneIds = new Set((d.checklistDone || []).map(x => x.id));
    overrideIds = new Set((d.checklistOverrides || []).map(x => x.id));
  } catch (err) {
    box.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được checklist<br><span style="color:#aaa;font-size:12px">${err.message || ''}</span></div>`;
    return;
  }
  if (!items.length) {
    box.innerHTML = `<div class="kc-title">Việc đầu ca</div><div class="kc-card"><div style="font-size:18px;font-weight:900;">Chưa có việc đầu ca</div><div style="font-size:13px;color:#999;margin-top:5px;">Quản lý chưa cấu hình checklist.</div></div>
      ${openStepNavHTML(4, "renderShiftInventoryReviewPOS('open','renderOpeningChecklist()')")}
      <button onclick="${shiftState.opening ? 'finishOpeningChecklist()' : 'renderShiftOpenForm()'}" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">${shiftState.opening ? 'Bắt đầu bán hàng' : 'Mở ca ngay'}</button>`;
    return;
  }

  _openChecklistState = { items, loaded: true, doneIds, overrideIds };
  const pendingBlocking = items.filter(it => it.blocking && !it.done && !doneIds.has(it.id) && !overrideIds.has(it.id));

  // Khoá thời gian chỉ có nghĩa cho mục TICK TAY (đang chờ bấm Xong) — mục auto tự
  // chuyển ✅ khi việc thật xong, không có nút Xong nào để khoá. Ghi "bắt đầu" ngay
  // khi màn hiện ra, trước khi vẽ nút, để nút vẽ ra đã đúng trạng thái khoá/mở.
  const lockablePending = items.filter(it => !it.autoCheck && it.minDurationSec > 0
    && !it.done && !doneIds.has(it.id) && !overrideIds.has(it.id));
  await Promise.all(lockablePending.map(it => clEnsureStarted('open', it.id, it.label, it.minDurationSec)));

  // [FIX] Hiện rõ TRẠNG THÁI CA ngay đầu màn checklist. Trước đây không có: sau khi
  // bấm "Xác nhận mở ca" ở form tiền quỹ, app tự nhảy sang đếm giao ca rồi vào thẳng
  // checklist, nên nhân viên KHÔNG BAO GIỜ thấy lại màn báo "Đã mở ca lúc..." của
  // dashboard. Tick xong checklist chỉ còn nút "← Quay lại" → không ai biết ca đã mở
  // hay chưa, tưởng phải bấm thêm gì đó nữa.
  const _op = shiftState.opening;
  const shiftStatusBox = _op ? `
    <div class="kc-signer" style="margin-bottom:14px;"><div><div style="font-size:11px;color:#15803d;">Ca đã mở lúc ${vnDate(_op.createdAt).toLocaleTimeString('vi-VN')}</div><div style="font-size:14px;font-weight:800;">Quỹ đầu ca ${Number(_op.openingCash).toLocaleString('vi-VN')}đ</div></div><span style="color:#15803d;font-size:18px;">✓</span></div>` : `
    <div class="kc-sub" style="margin-bottom:14px;color:#c0392b;font-weight:800;">Chưa mở ca · Cần đếm tiền quỹ đầu ca</div>`;

  box.innerHTML = `
    <div class="kc-title">Việc đầu ca</div>
    ${shiftStatusBox}
    ${pendingBlocking.length ? `
    <div class="kc-sub" style="margin-bottom:14px;color:#c0392b;font-weight:800;">Còn ${pendingBlocking.length} việc bắt buộc trước khi bán</div>` :
    `<div class="kc-sub" style="margin-bottom:14px;color:#15803d;font-weight:800;">Đã đủ điều kiện bán hàng</div>`}

    <div class="kc-card">
      ${items.map((it, i) => {
        const ticked = it.done || doneIds.has(it.id);
        const skipped = overrideIds.has(it.id);
        const icon = skipped ? '⏭️' : ticked ? '✅' : (it.blocking ? '🚫' : '⬜');
        return `
        <div class="kc-sub" style="margin-bottom:10px;">
          <div style="display:flex;gap:9px;align-items:flex-start;">
            <span style="font-size:17px;flex-shrink:0;line-height:1.3;">${icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13.5px;font-weight:700;color:${ticked || skipped ? '#999' : 'var(--td)'};${ticked || skipped ? 'text-decoration:line-through;' : ''}">${it.label}${it.blocking ? ' <span style="background:#fee2e2;color:#c0392b;font-size:9.5px;font-weight:800;border-radius:5px;padding:1px 5px;vertical-align:middle;">BẮT BUỘC</span>' : ''}</div>
              ${it.detail ? `<div style="font-size:11.5px;color:#999;margin-top:2px;">${skipped ? 'Đã bỏ qua có ghi lý do' : it.detail}</div>` : ''}
              ${it.plan && it.plan.length ? renderPrepPlanRows(it.plan) : ''}
              ${(!ticked && !skipped && it.autoCheck) ? `<div style="font-size:10.5px;color:#bbb;margin-top:3px;font-style:italic;">Tự động chuyển ✅ khi ${it.autoCheck === 'refill_below_min' ? 'refill' : it.autoCheck === 'stockcount_due' ? 'kiểm kê' : it.autoCheck === 'count_handover' ? 'đếm giao ca' : 'việc này'} xong</div>` : ''}
              ${(!ticked && !skipped && !it.autoCheck && it.minDurationSec > 0 && clRemainingSec('open', it.id) > 0) ? `<div style="font-size:10.5px;color:#b45309;margin-top:3px;">⏱️ Cần đứng làm tối thiểu ${it.minDurationSec}s mới bấm Xong được</div>` : ''}
            </div>
            ${!ticked && !skipped ? ((!it.autoCheck && it.minDurationSec > 0 && clRemainingSec('open', it.id) > 0)
              ? `<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">${clLockedButtonHTML(clRemainingSec('open', it.id))}<button onclick="skipChecklistItem('${it.id}')" style="padding:7px 10px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#888;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">Bỏ qua</button></div>`
              : renderChecklistItemActionBtn(it)) : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="kc-card">
      ${renderPinInput('openChecklistStaff', 'PIN xác nhận việc đầu ca')}
    </div>
    ${openStepNavHTML(4, "renderShiftInventoryReviewPOS('open','renderOpeningChecklist()')")}
    ${(!pendingBlocking.length && _op) ? `
    <button onclick="finishOpeningChecklist()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Bắt đầu bán hàng</button>` :
    '<button disabled class="kc-btn" style="background:#f1eee4;color:#aaa;margin-bottom:22px;">Hoàn tất việc bắt buộc để tiếp tục</button>'}
  `;
  if (lockablePending.some(it => clRemainingSec('open', it.id) > 0)) clArmCountdownRerender(() => renderOpeningChecklist(true));
}

// [FIX] Kết thúc checklist đầu ca — đưa thẳng ra màn bán hàng kèm xác nhận rõ ràng,
// thay vì để nhân viên đứng ở checklist không biết đã mở ca xong chưa.
function finishOpeningChecklist() {
  stopShiftWorkflowPOS('opening');
  showScreen('sm');
  toast('✅ Ca đã mở — bắt đầu bán hàng được rồi');
}

// Xoá PIN sau mỗi thao tác — mỗi mục checklist là một "chữ ký" riêng, không cho
// gõ 1 lần rồi tick hàng loạt. Người khác tiếp quản chỉ cần gõ PIN của họ.
function clearChecklistPin() {
  const el = document.getElementById('openChecklistStaffPin');
  if (el) el.value = '';
  const cf = document.getElementById('openChecklistStaffConfirm');
  if (cf) cf.textContent = '';
}

// Bảng "cần nấu bao nhiêu" — bấm là sang thẳng màn chế biến, điền sẵn lượng cần.
function renderPrepPlanRows(plan) {
  const pending = plan.filter(x => !x.ok);
  if (!pending.length) return '';
  return `<div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:9px 11px;">
    ${pending.map(x => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;">
        <div style="min-width:0;">
          <div style="font-size:12.5px;font-weight:700;color:#92400e;">${x.name}</div>
          <div style="font-size:11px;color:#a16207;">Cần ${fmtPrepQty(x.target)} · còn ${fmtPrepQty(x.have)} → <b>nấu ${fmtPrepQty(x.need)} ${x.unit}</b>${x.ratioNeeded > 0 ? ` (≈ ${x.ratioNeeded} mẻ)` : ''}${x.cooking > 0 ? ` · đang nấu ${fmtPrepQty(x.cooking)}` : ''}</div>
        </div>
        <button onclick="goCookFromChecklist('${x.prepId}', ${x.need})" style="padding:7px 11px;border-radius:10px;border:none;background:#f59e0b;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Nấu</button>
      </div>`).join('')}
  </div>`;
}

// Sang màn chế biến với lượng cần điền sẵn — nhân viên khỏi tự tính tỷ lệ mẻ.
async function goCookFromChecklist(prepId, needQty) {
  await openPrepBatchScreen();
  if (PREP_ITEMS_CACHE_POS.some(x => x.id === prepId)) {
    prepBatchSelect(prepId);
    prepBatchSetTargetQty(needQty);
  }
}

// 🆕 GĐ4 kế hoạch V3 — PHẦN 3.2a: mỗi mục auto có nút đưa THẲNG tới màn xử lý,
// mang theo ngữ cảnh — thay vì chỉ hiện ✅/⬜ rồi để nhân viên tự mò sang màn khác.
//
// [SỬA BUG] Bản đầu của GĐ4 THAY nút "Bỏ qua" bằng nút hành động — làm mất đường
// thoát duy nhất của mục BẮT BUỘC. Hậu quả: kho tổng hết hàng thật → không refill
// nổi → mục blocking không bao giờ ✅ → KHÔNG TẠO ĐƯỢC BILL, quán đứng hình giữa
// giờ mở cửa. Nút hành động là để làm việc NHANH HƠN, không được lấy đi lối thoát.
// Giờ trả về CẢ HAI: nút hành động (chính, màu) + nút "Bỏ qua" (phụ, viền xám).
function renderChecklistItemActionBtn(it) {
  const skipBtn = `<button onclick="skipChecklistItem('${it.id}')" style="padding:7px 10px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#888;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">Bỏ qua</button>`;
  if (!it.autoCheck) {
    return `<button onclick="tickChecklistItem('${it.id}')" style="padding:7px 12px;border-radius:10px;border:none;background:var(--gd);color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Xong</button>`;
  }
  const goBtn = (label, action) =>
    `<button onclick="${action}" style="padding:7px 12px;border-radius:10px;border:none;background:var(--gd);color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">${label}</button>`;
  let main = '';
  if (it.autoCheck === 'refill_below_min') main = goBtn('Refill ngay', "showScreen('khoScreen'); openRefillScreen();");
  else if (it.autoCheck === 'stockcount_due') main = goBtn('Kiểm kê', 'openStockCountScreen()');
  else if (it.autoCheck === 'count_handover') main = goBtn('Đếm', 'goHandoverCountFromChecklist()');
  // prep_ready và các loại auto khác: hành động chính (nấu) đã có nút riêng theo
  // từng dòng ở renderPrepPlanRows, nên chỉ cần nút "Bỏ qua" ở cấp mục.
  return `<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:stretch;">${main}${skipBtn}</div>`;
}

// Đưa nhân viên sang thẳng màn đếm giao ca đầu ca từ checklist. Xong (hoặc đã
// xong từ trước — vd luồng bắt buộc ngay sau mở ca đã tự chạy) → renderHandoverOpenScreen
// tự gọi lại _continueAfterHandoverOpen() → renderOpeningChecklist(), tự quay lại đúng
// checklist (PHẦN 3.2b "Quay lại tự động").
async function goHandoverCountFromChecklist() {
  let lines = [];
  try { lines = await computeHandoverOpenLinesPOS(); }
  catch (err) { console.warn('goHandoverCountFromChecklist lỗi:', err); }
  if (!lines.length) { toast('✅ Đã đếm giao ca hôm nay rồi'); renderOpeningChecklist(); return; }
  await renderHandoverOpenScreen(lines);
}

// 🆕 GĐ4 kế hoạch V3 — PHẦN 3.2b: "resolvedRef là thứ biến checklist từ lời nhắc
// thành bằng chứng có thể kiểm toán" — ghi vào daily_openings.checklistDone[] kèm
// autoResolvedBy (hành động nào giải quyết) + resolvedRef (trỏ đúng giao dịch cụ
// thể). Chỉ ghi cho mục checklist THẬT SỰ đang dùng đúng autoCheck kind này (quán
// có thể chưa cấu hình mục nào — khi đó bỏ qua, không lỗi). Chạy nền, lỗi không
// chặn luồng chính (refill/kiểm kê/đếm giao ca vẫn đã xong dù ghi audit thất bại).
async function logAutoChecklistResolved(autoCheckKind, resolvedRef, staffEmp) {
  try {
    const [snap, openDoc] = await Promise.all([
      fstore.collection('shift_checklists_gieogieo')
        .where('phase', '==', 'open').where('autoCheck', '==', autoCheckKind).get(),
      fstore.collection('daily_openings_gieogieo').doc(shiftState.businessDate).get()
    ]);
    if (snap.empty) return;
    // [SỬA BUG] arrayUnion so khớp object theo TOÀN BỘ giá trị, mà checkedAt luôn
    // khác nhau → mỗi lần refill lại thêm 1 entry mới cho cùng 1 mục checklist.
    // Refill 30 món buổi sáng = 30 entry trùng, mảng phình mãi và log audit thành
    // rác. Mục đã ghi rồi thì bỏ qua — bằng chứng lần đầu là đủ.
    const already = new Set(((openDoc.exists ? openDoc.data().checklistDone : null) || []).map(x => x.id));
    const now = vnDate().toISOString();
    const entries = snap.docs.filter(d => !already.has(d.id)).map(d => ({
      id: d.id, label: d.data().label || '', checkedAt: now,
      staff: staffEmp ? staffEmp.fullName : '', staffEmployeeId: staffEmp ? staffEmp.id : '',
      autoResolvedBy: autoCheckKind, resolvedRef: resolvedRef || ''
    }));
    if (!entries.length) return;
    await fstore.collection('daily_openings_gieogieo').doc(shiftState.businessDate).set({
      checklistDone: firebase.firestore.FieldValue.arrayUnion(...entries)
    }, { merge: true });
  } catch (err) {
    console.warn('logAutoChecklistResolved lỗi (không quan trọng, chỉ audit):', err);
  }
}

async function tickChecklistItem(itemId) {
  const it = _openChecklistState.items.find(x => x.id === itemId);
  if (!it) return;
  // Chốt chặn phía client: nút đáng lẽ đã bị khoá/disabled rồi, đây là lớp phòng thủ
  // thứ 2 phòng trường hợp render cũ còn kẹt trên màn (vd tab nền chưa kịp vẽ lại).
  if (!it.autoCheck && it.minDurationSec > 0 && clRemainingSec('open', itemId) > 0) {
    toast(`⏳ Cần đứng làm tối thiểu ${it.minDurationSec}s cho mục này`);
    return;
  }
  const staffEmp = await resolveStaffPinAndCheckin('openChecklistStaff');
  if (!staffEmp) return;   // hàm này đã tự toast lỗi cụ thể (thiếu/sai PIN, chưa check-in)
  try {
    await fstore.collection('daily_openings_gieogieo').doc(shiftState.businessDate).set({
      checklistDone: firebase.firestore.FieldValue.arrayUnion({
        id: itemId, label: it.label, checkedAt: vnDate().toISOString(),
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id
      })
    }, { merge: true });
    await clLogComplete('open', itemId, staffEmp);
    await refreshOpeningChecklistGate();
    renderOpeningChecklist(true);   // giữ màn, không nháy trắng
  } catch (err) { toast('❌ Lỗi: ' + (err.code || err.message || err)); }
}

// Bỏ qua — dùng form riêng thay cho prompt(): prompt() bị chặn/hiển thị xấu trên
// webview Android bọc app, và cũng không nhập được PIN cùng lúc.
function skipChecklistItem(itemId) {
  const it = _openChecklistState.items.find(x => x.id === itemId);
  if (!it) return;
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div class="kc-title">Bỏ qua việc đầu ca</div>
    <div class="kc-card">
      <div style="font-size:18px;font-weight:900;margin-bottom:14px;">${it.label}</div>
      <div class="kc-sub"><input id="clSkipReason" type="text" placeholder="Lý do bỏ qua" style="width:100%;border:0;outline:none;background:transparent;font:600 15px 'Google Sans',sans-serif;"></div>
      ${renderPinInput('clSkipStaff')}
    </div>
    ${openStepNavHTML(4, 'renderOpeningChecklist()')}
    <button onclick="confirmSkipChecklistItem('${itemId}')" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận bỏ qua</button>
  `;
}

async function confirmSkipChecklistItem(itemId) {
  const it = _openChecklistState.items.find(x => x.id === itemId);
  if (!it) return;
  const reason = (document.getElementById('clSkipReason').value || '').trim();
  if (!reason) { toast('⚠️ Phải ghi lý do'); return; }
  const staffEmp = await resolveStaffPinAndCheckin('clSkipStaff');
  if (!staffEmp) return;
  try {
    await fstore.collection('daily_openings_gieogieo').doc(shiftState.businessDate).set({
      checklistOverrides: firebase.firestore.FieldValue.arrayUnion({
        id: itemId, label: it.label, reason: reason.trim(), at: vnDate().toISOString(),
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id
      })
    }, { merge: true });
    await refreshOpeningChecklistGate();
    toast('⏭️ Đã bỏ qua — Quản lý sẽ thấy lý do này');
    renderOpeningChecklist(true);   // giữ màn, không nháy trắng
  } catch (err) { toast('❌ Lỗi: ' + (err.code || err.message || err)); }
}

const OPEN_STEP_TOTAL = 4;

function openStepNavHTML(stepIdx, backAction) {
  const dots = Array.from({ length: OPEN_STEP_TOTAL }, (_, i) => {
    const n = i + 1;
    return `<span style="height:7px;border-radius:999px;background:${n === stepIdx ? '#E23A5D' : n < stepIdx ? '#d8cfae' : '#EFE9D8'};width:${n === stepIdx ? 28 : 7}px;flex-shrink:0;"></span>`;
  }).join('');
  return `<div class="kc-nav">
    <button type="button" onclick="${backAction}" class="kc-nav-back" aria-label="Quay lại">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
    <div class="kc-nav-pill">${dots}<span class="lbl">Bước ${stepIdx}/${OPEN_STEP_TOTAL}</span></div>
  </div>`;
}

// Tiền và đếm giao ca đã lưu chỉ xem lại, không cho gửi lần hai.
function returnToHandoverReviewPOS() {
  renderOpeningReviewPOS('handover', 'renderOpeningChecklist()');
}

function renderOpeningReviewPOS(kind, nextAction) {
  const box = document.getElementById('shiftBody');
  const opening = shiftState.opening || {};
  const handover = _handoverOpenState || [];
  const isHandover = kind === 'handover';
  box.innerHTML = `
    <div class="kc-title">${isHandover ? 'Đếm giao ca đầu ca' : 'Tiền quỹ đầu ca'}</div>
    <div class="kc-card">
      <div style="font-size:12px;font-weight:800;color:#15803d;margin-bottom:14px;">ĐÃ GHI NHẬN · XEM LẠI</div>
      ${isHandover ? handover.map(l => `<div class="kc-sub" style="margin-bottom:10px;display:flex;justify-content:space-between;gap:10px;"><b>${l.itemName}</b><b>${Number(l.counted2 !== null ? l.counted2 : l.counted1).toLocaleString('vi-VN')} ${l.unit || ''}</b></div>`).join('')
        : `<div class="kc-sub" style="display:flex;justify-content:space-between;gap:10px;"><span>Đã đếm</span><b>${Number(opening.openingCash || 0).toLocaleString('vi-VN')}đ</b></div>`}
    </div>
    ${openStepNavHTML(isHandover ? 2 : 1, isHandover ? "renderOpeningReviewPOS('cash','returnToHandoverReviewPOS()')" : 'renderShiftDashboard()')}
    <button onclick="${nextAction}" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Tiếp tục →</button>`;
}

function renderShiftOpenForm(keepDenoms) {
  startShiftWorkflowPOS('opening');
  const box = document.getElementById('shiftBody');
  if (!keepDenoms) _shiftOpenDenoms = cfEmptyDenoms();
  box.innerHTML = `
    <div class="kc-title">Tiền quỹ đầu ca</div>
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:16px;">Đếm tiền mặt thực tế trong két</div>
      <div id="shiftOpenGrid" style="display:flex;flex-direction:column;gap:6px;"></div>
      <div style="text-align:right;font-weight:700;font-size:16px;color:var(--gd);margin-top:10px;" id="shiftOpenTotal">${cfDenomTotal(_shiftOpenDenoms).toLocaleString('vi-VN')}đ</div>
    </div>
    <div class="kc-card">
      ${renderPinInput('shiftOpenStaff')}
    </div>
    ${openStepNavHTML(1, 'renderShiftDashboard()')}
    <button onclick="submitShiftOpen()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận mở ca</button>
  `;
  cfRenderDenomGrid('shiftOpenGrid', _shiftOpenDenoms, 'shiftChangeOpenDenom');
}

function shiftChangeOpenDenom(d, delta) {
  const next = (_shiftOpenDenoms[d] || 0) + delta;
  if (next < 0) return;
  _shiftOpenDenoms[d] = next;
  document.getElementById('shiftOpenGrid-qty-' + d).textContent = next;
  document.getElementById('shiftOpenTotal').textContent = cfDenomTotal(_shiftOpenDenoms).toLocaleString('vi-VN') + 'đ';
}

async function submitShiftOpen() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitShiftOpenImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitShiftOpenImpl() {
  const staffEmp = await resolveStaffPinAndCheckin('shiftOpenStaff');
  if (!staffEmp) return;
  const openingCash = cfDenomTotal(_shiftOpenDenoms);
  // [NEW] Đối chiếu với tiền giữ lại của ngày gần nhất TRƯỚC khi ghi. Cố ý đối
  // chiếu SAU khi nhân viên đã đếm xong (không hiện số cũ ở form đếm) — nếu hiện
  // trước, họ sẽ gõ theo con số đó thay vì đếm thật, mất sạch ý nghĩa đối soát.
  const prev = await loadPrevRetainedInfo();
  if (prev && !prev.acknowledged) {
    const tolerance = await getCashTolerancePOS();
    const diff = openingCash - prev.retainedAmount;
    if (Math.abs(diff) > tolerance) { renderOpeningMismatchScreen(staffEmp, openingCash, prev, diff); return; }  }
  await _writeShiftOpen(staffEmp, openingCash, prev, null);
}

// getCashTolerancePOS — dùng chung 1 nguồn dung sai với đối soát tiền mặt/CK,
// tránh mỗi chỗ tự đọc rồi lệch cấu hình nhau.
async function getCashTolerancePOS() {
  try {
    const finDoc = await fstore.collection('finance_gieogieo').doc('current').get();
    if (finDoc.exists) return Number(finDoc.data().cashToleranceAmount) || 0;
  } catch (err) { /* im lặng dùng 0 — không chặn mở ca vì lỗi mạng */ }
  return 0;
}

// loadPrevRetainedInfo — tìm NGÀY GẦN NHẤT (lùi tối đa 7 ngày) đã bàn giao và có
// ghi retainedAmount. Trả null nếu không tìm thấy (vd quán mới chạy, hoặc nghỉ dài
// ngày) → khi đó bỏ qua đối chiếu, không cảnh báo vu vơ.
let _prevRetainedCache = null;

async function loadPrevRetainedInfo() {
  if (_prevRetainedCache !== null) return _prevRetainedCache;
  for (let i = 1; i <= 7; i++) {
    const d = vnDate(); d.setDate(d.getDate() - i);
    const key = posDateKey(d);
    try {
      const snap = await fstore.collection('daily_closings_gieogieo').doc(key).get();
      if (!snap.exists) continue;
      const data = snap.data();
      if (data.retainedAmount === undefined || data.retainedAmount === null) continue;
      _prevRetainedCache = {
        dateKey: key,
        retainedAmount: Number(data.retainedAmount) || 0,
        recipient: data.handoverRecipient || ''
      };
      return _prevRetainedCache;
    } catch (err) {
      console.warn('loadPrevRetainedInfo lỗi (bỏ qua đối chiếu):', err);
      break; // lỗi mạng → không cố lùi tiếp, cho mở ca bình thường
    }
  }
  _prevRetainedCache = false; // đánh dấu "đã tìm, không có" để không query lại
  return null;
}

// Màn cảnh báo lệch — CỐ Ý hiện rõ con số chênh lệch (khác nguyên tắc "blind" của
// đối soát cuối ca): ở đây chính nhân viên vừa tự đếm ra số của mình, và số giữ lại
// hôm qua là số đã bàn giao công khai có PIN hai đầu — hiện ra không tiết lộ gì bí
// mật, mà giúp họ phát hiện ngay đếm sót/lấy nhầm trước khi bắt đầu bán.
function renderOpeningMismatchScreen(staffEmp, openingCash, prev, diff) {
  const box = document.getElementById('shiftBody');
  _pendingOpenStaff = staffEmp; // giữ nguyên object đã resolve — không tra lại cache bằng id
  const thieu = diff < 0;
  box.innerHTML = `
    <div class="kc-title">Quỹ đầu ca không khớp</div>
    <div class="kc-card">
      <div class="kc-sub" style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;"><span>Ca trước giữ lại</span><b>${prev.retainedAmount.toLocaleString('vi-VN')}đ</b></div>
      <div class="kc-sub" style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;"><span>Bạn vừa đếm</span><b>${openingCash.toLocaleString('vi-VN')}đ</b></div>
      <div class="kc-sub" style="display:flex;justify-content:space-between;gap:10px;color:${thieu ? '#c0392b' : '#0f766e'};"><b>${thieu ? 'Thiếu' : 'Dư'}</b><b>${Math.abs(diff).toLocaleString('vi-VN')}đ</b></div>
    </div>
    <div class="kc-card">
      <div style="font-size:13px;font-weight:800;color:#999;margin-bottom:10px;">Nếu vẫn lệch sau khi đếm lại, ghi lý do</div>
      <div class="kc-sub"><input id="shiftOpenVarianceNote" type="text" placeholder="Lý do chênh lệch" style="width:100%;border:0;outline:none;background:transparent;font:600 15px 'Google Sans',sans-serif;color:var(--td);"></div>
    </div>
    ${openStepNavHTML(1, 'renderShiftOpenForm(true)')}
    <button onclick="renderShiftOpenForm()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:10px;">Đếm lại</button>
    <button onclick="confirmOpenDespiteMismatch(${openingCash}, ${diff})" class="kc-btn" style="background:#fff;color:var(--td);border:1.5px solid #1f1f1f;margin-bottom:22px;">Vẫn mở ca · Ghi nhận lệch</button>
  `;
}

let _pendingOpenStaff = null;

async function confirmOpenDespiteMismatch(openingCash, diff) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const note = (document.getElementById('shiftOpenVarianceNote').value || '').trim();
  if (!note) { toast('⚠️ Nhập lý do chênh lệch trước khi mở ca'); return; }
  if (!_pendingOpenStaff) { toast('❌ Phiên đã hết hạn, vui lòng nhập lại PIN'); renderShiftOpenForm(); return; }
  _posSubmitBusy = true;
  try {
    const prev = await loadPrevRetainedInfo();
    await _writeShiftOpen(_pendingOpenStaff, openingCash, prev, { note, variance: diff });
    _pendingOpenStaff = null;
  } finally { _posSubmitBusy = false; }
}

// _writeShiftOpen — điểm ghi DUY NHẤT của việc mở ca (cả luồng khớp lẫn luồng
// lệch có xác nhận), để không có 2 chỗ ghi khác nhau dễ lệch schema về sau.
async function _writeShiftOpen(staffEmp, openingCash, prev, mismatch) {
  const staff = staffEmp.fullName;
  try {
    await fstore.collection('daily_openings_gieogieo').doc(shiftState.businessDate).set({
      businessDate: shiftState.businessDate, openingCash, denominations: { ..._shiftOpenDenoms },
      staff, staffEmployeeId: staffEmp.id, createdAt: vnDate().toISOString(),
      // [NEW] Vết đối chiếu với bàn giao hôm trước — Management xem lại được kể cả
      // khi khớp (prevVariance = 0), không chỉ lúc lệch.
      ...(prev ? {
        prevRetainedDate: prev.dateKey,
        prevRetainedAmount: prev.retainedAmount,
        prevVariance: openingCash - prev.retainedAmount
      } : {}),
      ...(mismatch ? { openingVarianceNote: mismatch.note, openingVarianceAcknowledged: true } : {})
    });
    shiftState.opening = { businessDate: shiftState.businessDate, openingCash, staff, staffEmployeeId: staffEmp.id, createdAt: vnDate().toISOString() };
    // [GIAO CA] Mở đoạn ca số 1 — ai đếm tiền quỹ đầu ngày, người đó giữ két.
    _segments = [];
    await ensureOpeningSegmentPOS();
    toast(mismatch ? '✅ Đã mở ca — đã ghi nhận chênh lệch' : '✅ Đã mở ca');
    stSnapshotOnOpen();   // [TARGET NV] chụp doanh thu các ngày trước (nền, không chặn)
    await _continueAfterHandoverOpenGate();
  } catch (err) {
    console.error('submitShiftOpen failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

// 🆕 GĐ3 kế hoạch V3 — PHẦN 4/5.1: đếm giao ca đầu ca đứng TRƯỚC checklist đầu ca
// khác — đây là việc đầu tiên ca sáng cần làm để đối chiếu với ca tối hôm qua.
async function _continueAfterHandoverOpenGate() {
  let handoverLines = [];
  try { handoverLines = await computeHandoverOpenLinesPOS(); }
  catch (err) { console.warn('computeHandoverOpenLinesPOS lỗi (bỏ qua, không chặn mở ca):', err); }
  if (handoverLines.length) { await renderHandoverOpenScreen(handoverLines); return; }
  await _continueAfterHandoverOpen();
}

// [GĐ5] Mở ca xong (và đếm giao ca đầu ca nếu có, xong rồi) → đi thẳng vào việc
// đầu ca (nếu có cấu hình). Đây là thứ tự nhiên tiếp theo nhân viên phải làm,
// khỏi bắt họ tự tìm nút.
async function _continueAfterHandoverOpen() {
  let lines;
  try { lines = await computeShiftInventoryCountLinesPOS('open'); }
  catch(err){ document.getElementById('shiftBody').innerHTML='<div class="kc-card">Không tải được danh sách nguyên liệu cần kiểm kê đầu ca.</div><button onclick="_continueAfterHandoverOpen()" class="kc-btn" style="background:#0062AD;color:#fff">Thử lại</button>'; return; }
  if(lines.length){ _openChecklistBlocking=true; await renderShiftInventoryCountPOS('open',lines); return; }
  await _continueAfterShiftInventoryOpenPOS();
}

async function _continueAfterShiftInventoryOpenPOS() {
  await refreshOpeningChecklistGate();
  const hasOpenChecklist = (await computeOpeningChecklistPOS()).length > 0;
  if (hasOpenChecklist) { renderOpeningChecklist(); return; }
  stopShiftWorkflowPOS('opening');
  renderShiftDashboard();
}

PosGieoMods.shift = true;
