// Tách từ posgieo.html dòng 2970–2976, 6849–6911, 7073–7404 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_cashfund.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).cashfund = 'dang';

// ─── QUỸ TIỀN MẶT (Cash Fund) ───────────────────────────────────────────────
const CF_PASSWORD = '3368';

const CASH_DENOMS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];

function cfEmptyDenoms() { const o = {}; CASH_DENOMS.forEach(d => o[d] = 0); return o; }

function cfDateKey(d) { d = vnDate(d || Date.now()); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }

let _cfDoc = null;

let _cfCheckoutDenoms = cfEmptyDenoms();

// ============================================================
// [MỞ KÉT] Mở két tiền bằng tay — chủ dự án yêu cầu 06/10: nút ngay trên màn bán hàng, mỗi lần mở lưu nhật ký
// để Quản lý biết (cash_drawer_logs_gieogieo — riêng từng quán; Quản lý ▸ Tiền mặt + Hôm nay · Sức khoẻ quán).
// Mở két khi THANH TOÁN tiền mặt vẫn tự động như cũ (POSPrinter.openCashDrawerIfConnected) và KHÔNG ghi nhật ký này.
// Bắt buộc: lý do + người mở (PIN — có đúng 1 người đang trong ca thì tự điền, giống các chỗ ký tên khác).
// Két cắm qua máy in Bill → máy in chưa kết nối thì không mở được, không ghi gì.
// ============================================================
const CASH_DRAWER_REASONS = ['Đổi tiền lẻ', 'Thối thêm cho khách', 'Kiểm đếm két', 'Khác'];

let _cashDrawerReason = '';

function openCashDrawerSheetPOS() {
  if (!POSPrinter.connected || !POSPrinter.engine || typeof POSPrinter.engine.openDrawer !== 'function') {
    toast('⚠️ Máy in Bill chưa kết nối — két mở qua máy in. Bấm biểu tượng máy in để kết nối lại.');
    return;
  }
  _cashDrawerReason = '';
  const o = document.createElement('div');
  o.id = 'cashDrawerSheet';
  o.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center';
  o.innerHTML = '<div style="background:#fff;width:100%;max-width:430px;border-radius:22px 22px 0 0;padding:20px 18px 24px;max-height:90vh;overflow:auto">'
    + '<div style="font-size:18px;font-weight:800">Mở két tiền</div>'
    + '<div style="font-size:12.5px;color:#888;margin-top:4px">Mỗi lần mở két ngoài lúc thanh toán đều được ghi lại cho Quản lý.</div>'
    + '<div style="font-size:13px;font-weight:700;margin:14px 0 8px">Lý do</div>'
    + '<div id="cdReasons" style="display:flex;flex-wrap:wrap;gap:8px">'
    + CASH_DRAWER_REASONS.map(r => '<button data-r="' + r + '" onclick="cashDrawerPickReasonPOS(this)" style="padding:9px 14px;border-radius:20px;border:1.5px solid #ddd;background:#fff;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer">' + r + '</button>').join('')
    + '</div>'
    + '<input id="cdNote" placeholder="Ghi chú (bắt buộc nếu chọn Khác)" style="width:100%;box-sizing:border-box;margin-top:12px;padding:11px 12px;border:1.5px solid #ddd;border-radius:12px;font-family:inherit;font-size:14px">'
    + renderPinInput('cashDrawer', 'Người mở két (PIN 4 số)')
    + '<div style="display:flex;gap:8px;margin-top:14px"><button onclick="document.getElementById(\'cashDrawerSheet\').remove()" style="flex:1;padding:13px;border:0;border-radius:12px;background:#eee;font-family:inherit;font-weight:700">Huỷ</button>'
    + '<button id="cdGo" onclick="confirmCashDrawerOpenPOS()" style="flex:2;padding:13px;border:0;border-radius:12px;background:#C22B49;color:#fff;font-family:inherit;font-size:15px;font-weight:800">Mở két</button></div></div>';
  o.addEventListener('click', e => { if (e.target === o) o.remove(); });
  document.body.appendChild(o);
}

function cashDrawerPickReasonPOS(btn) {
  _cashDrawerReason = btn.dataset.r;
  document.querySelectorAll('#cdReasons button').forEach(b => {
    const on = b === btn;
    b.style.background = on ? '#C22B49' : '#fff'; b.style.color = on ? '#fff' : '#333'; b.style.borderColor = on ? '#C22B49' : '#ddd';
  });
}

async function confirmCashDrawerOpenPOS() {
  const note = (document.getElementById('cdNote')?.value || '').trim();
  if (!_cashDrawerReason) { toast('⚠️ Chọn lý do mở két'); return; }
  if (_cashDrawerReason === 'Khác' && !note) { toast('⚠️ Ghi rõ lý do vào ô ghi chú'); return; }
  const emp = resolveStaffPinField('cashDrawer');
  if (!emp) return;
  const nut = document.getElementById('cdGo'); if (nut) nut.disabled = true;
  try {
    await POSPrinter.engine.openDrawer();
  } catch (err) {
    console.warn('[Mở két] gửi lệnh lỗi', err);
    toast('❌ Không gửi được lệnh mở két — kiểm tra máy in Bill rồi thử lại');
    if (nut) nut.disabled = false;
    return;
  }
  document.getElementById('cashDrawerSheet')?.remove();
  // Ghi nhật ký SAU khi lệnh đã đi (két đã bật). Mất mạng: Firestore tự xếp hàng ghi khi có mạng lại.
  fstore.collection('cash_drawer_logs_gieogieo').add({
    businessDate: posDateKey(), createdAt: vnDate().toISOString(),
    employeeId: emp.id || '', employeeName: emp.fullName || '', reason: _cashDrawerReason, note,
    storeId: (window.GieoData && GieoData.storeId()) || 'gg01'
  }).catch(err => { console.warn('[Mở két] ghi nhật ký lỗi', err); toast('⚠️ Két đã mở nhưng CHƯA ghi được nhật ký — báo Quản lý'); });
  toast('✅ Đã mở két — đã ghi nhật ký');
}

// Đọc/ghi document Firestore của ngày hôm nay
function cfDocRef(dateKey) { return fstore.collection('cashfund_gieogieo').doc(dateKey || cfDateKey()); }

function cfLoadTodayDoc() {
  return cfDocRef().get().then(snap => {
    _cfDoc = snap.exists ? snap.data() : null;
    return _cfDoc;
  }).catch(() => { _cfDoc = null; });
}

// Tính "Doanh thu tiền mặt hôm nay" — dùng ĐÚNG công thức với tab Doanh thu (cash + foodCash)
// để con số luôn khớp tuyệt đối, tránh nhân viên tính nhầm khi đối soát.
function getTodayCashRevenue() {
  const list = orders.filter(o => o.date === todayKey());
  let cash = 0, foodCash = 0;
  list.forEach(o => {
    const ft = o.foodTotal || 0;
    const fMethod = o.foodMethod || o.method;
    if (ft > 0) {
      if (fMethod === 'TIỀN MẶT') foodCash += ft;
      else if (fMethod !== 'CHUYỂN KHOẢN') {
        if (o.splitGroups && o.splitGroups.length) {
          const sgCash = o.splitGroups.filter(g => g.method === 'TIỀN MẶT').reduce((s,g) => s+(g.total||0),0);
          const sgBank = o.splitGroups.filter(g => g.method === 'CHUYỂN KHOẢN').reduce((s,g) => s+(g.total||0),0);
          const sgTot = sgCash + sgBank || 1;
          foodCash += Math.round(ft * sgCash / sgTot);
        } else {
          foodCash += ft;
        }
      }
    }
    const netAmt = ft > 0 ? (o.total - ft) : o.total;
    if (o.method === 'TIỀN MẶT') {
      cash += netAmt;
    } else if (o.method === 'TÍNH RIÊNG' && o.splitGroups && o.splitGroups.length) {
      o.splitGroups.forEach(g => {
        const ratio = o.total > 0 ? (netAmt / o.total) : 1;
        if (g.method === 'TIỀN MẶT') cash += Math.round((g.total || 0) * ratio);
      });
    } else if (o.method !== 'CHUYỂN KHOẢN') {
      cash += netAmt;
    }
  });
  return cash + foodCash;
}

// Vẽ 1 lưới nhập số tờ theo mệnh giá — dùng chung cho Quỹ tiền mặt & màn thanh toán
function cfRenderDenomGrid(gridId, valuesObj, onChangeFnName) {
  const el = document.getElementById(gridId);
  if (!el) return;
  el.innerHTML = CASH_DENOMS.map(d => `
    <div class="cp-denom-row">
      <span class="cp-denom-label">${d.toLocaleString('vi-VN')}đ</span>
      <div class="cp-denom-ctrl">
        <button type="button" onclick="${onChangeFnName}(${d},-1)">−</button>
        <span class="cp-denom-qty" id="${gridId}-qty-${d}">${(valuesObj && valuesObj[d]) || 0}</span>
        <button type="button" onclick="${onChangeFnName}(${d},1)">+</button>
      </div>
    </div>
  `).join('');
}

function cfDenomTotal(obj) { return CASH_DENOMS.reduce((s,d) => s + d * (obj[d]||0), 0); }

// ─── Mật khẩu ───────────────────────────────────────────────────────────────
function cfRequirePassword(cb) {
  const pass = prompt('Nhập mật khẩu quản lý (' + '****' + ') để tiếp tục:');
  if (pass === null) return; // Huỷ
  if (pass !== CF_PASSWORD) { toast('❌ Sai mật khẩu'); return; }
  cb();
}

// ─── Màn hình chính ─────────────────────────────────────────────────────────
function loadCashFundScreen() {
  const el = document.getElementById('cf-content');
  showLoading(el, 'Đang tải...');
  cfLoadTodayDoc().then(() => cfRenderDashboard());
}

function cfRenderDashboard() {
  const el = document.getElementById('cf-content');
  const hasOpen = _cfDoc && _cfDoc.open && _cfDoc.open.locked;

  if (!hasOpen) {
    // Chưa mở ca hôm nay → cho nhập tự do, không cần mật khẩu
    cfShowForm({ mode: 'open', title: 'BẮT ĐẦU CA — NHẬP TIỀN QUỸ ĐẦU NGÀY', requirePassword: false });
    return;
  }

  const midList = _cfDoc.mid || [];
  const cashRevenue = getTodayCashRevenue();

  el.innerHTML = `
    <div style="padding:0 16px 6px;"><div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:10px 4px;">Hôm nay</div></div>
    <div class="wal-section">
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="color:var(--gt);font-size:13px;">Tiền quỹ đầu ca</span>
        <span style="font-weight:700;">${_cfDoc.open.total.toLocaleString('vi-VN')}đ</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="color:var(--gt);font-size:13px;">Doanh thu tiền mặt hôm nay</span>
        <span style="font-weight:700;">${cashRevenue.toLocaleString('vi-VN')}đ</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #eee;margin-top:6px;padding-top:12px;">
        <span style="color:var(--gt);font-size:13px;">Số dư quỹ kỳ vọng</span>
        <span style="font-weight:700;color:var(--gd);">${(_cfDoc.open.total + cashRevenue - cfTotalExpenseNet()).toLocaleString('vi-VN')}đ</span>
      </div>
    </div>

    <div style="padding:0 16px 6px;"><div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:10px 4px;">Giữa ca (${midList.length} lần đã đối soát)</div></div>
    <div class="wal-section">
      ${midList.length ? midList.map(m => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
          <span style="color:var(--gt);">${vnDate(m.enteredAt).toLocaleTimeString('vi-VN')}</span>
          <span style="font-weight:700;">${m.total.toLocaleString('vi-VN')}đ</span>
        </div>
      `).join('') : `<div style="color:#bbb;font-size:13px;text-align:center;padding:8px 0;">Chưa đối soát lần nào</div>`}
      <button onclick="cfRequirePassword(() => cfShowForm({mode:'mid', title:'GIỮA CA — ĐẾM LẠI TIỀN QUỸ'}))" style="width:100%;margin-top:10px;padding:12px;background:var(--gl);color:var(--gd);border:none;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;">+ Đối soát giữa ca</button>
    </div>

    <div style="padding:0 16px 6px;"><div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:10px 4px;">Chi tiêu (${(_cfDoc.expenses||[]).length})</div></div>
    <div class="wal-section">
      ${(_cfDoc.expenses||[]).length ? _cfDoc.expenses.map(e => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
          <span style="color:var(--gt);">${e.note || '(không ghi lý do)'}</span>
          <span style="font-weight:700;color:#e74c3c;">-${e.netAmount.toLocaleString('vi-VN')}đ</span>
        </div>
      `).join('') : `<div style="color:#bbb;font-size:13px;text-align:center;padding:8px 0;">Chưa có khoản chi nào</div>`}
      <button onclick="cfRequirePassword(cfShowExpenseForm)" style="width:100%;margin-top:10px;padding:12px;background:#fee2e2;color:#e74c3c;border:none;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;">+ Ghi chi tiêu</button>
    </div>

    <div style="padding:0 16px 6px;"><div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:10px 4px;">Kết ca</div></div>
    <div class="wal-section">
      ${_cfDoc.close ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:var(--gt);font-size:13px;">Đã kết ca lúc ${vnDate(_cfDoc.close.enteredAt).toLocaleTimeString('vi-VN')}</span>
          <span style="font-weight:700;">${_cfDoc.close.total.toLocaleString('vi-VN')}đ</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:var(--gt);font-size:13px;">Chênh lệch</span>
          <span style="font-weight:700;color:${_cfDoc.close.diff === 0 ? 'var(--gd)' : '#e74c3c'};">${_cfDoc.close.diff > 0 ? '+' : ''}${_cfDoc.close.diff.toLocaleString('vi-VN')}đ</span>
        </div>
        <button onclick="cfRequirePassword(() => cfShowForm({mode:'close', title:'KẾT CA — NHẬP LẠI'}))" style="width:100%;margin-top:10px;padding:12px;background:var(--gl);color:var(--gd);border:none;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;">Sửa lại kết ca</button>
      ` : `<button onclick="cfRequirePassword(() => cfShowForm({mode:'close', title:'KẾT CA — ĐẾM LẠI TIỀN QUỸ'}))" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Kết ca ngày hôm nay</button>`}
    </div>

    <div style="padding:16px;">
      <button onclick="cfRequirePassword(() => cfShowForm({mode:'open', title:'BẮT ĐẦU CA — NHẬP LẠI'}))" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">Sửa lại số tiền đầu ca</button>
    </div>
  `;
}

function cfTotalExpenseNet() {
  return ((_cfDoc && _cfDoc.expenses) || []).reduce((s,e) => s + (e.netAmount||0), 0);
}

// ─── Form nhập mệnh giá (dùng chung cho open / mid / close) ────────────────
let _cfFormDenoms = cfEmptyDenoms();

let _cfFormMode = 'open';

function cfShowForm({ mode, title }) {
  _cfFormMode = mode;
  _cfFormDenoms = cfEmptyDenoms();
  const el = document.getElementById('cf-content');
  el.innerHTML = `
    <div style="padding:0 16px 6px;"><div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:10px 4px;">${title}</div></div>
    <div class="wal-section">
      <div class="cp-denom-grid" id="cf-form-grid"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:0 4px;">
        <span style="font-size:14px;font-weight:700;color:var(--gt);">TỔNG TIỀN MẶT</span>
        <span style="font-size:20px;font-weight:800;color:var(--gd);" id="cf-form-total">0đ</span>
      </div>
      <button onclick="cfSubmitForm()" style="width:100%;margin-top:16px;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Xác nhận</button>
      <button onclick="loadCashFundScreen()" style="width:100%;margin-top:8px;padding:10px;background:none;border:none;color:var(--gt);font-size:13px;cursor:pointer;">Huỷ, quay lại</button>
    </div>
  `;
  cfRenderDenomGrid('cf-form-grid', _cfFormDenoms, 'cfChangeFormDenom');
}

function cfChangeFormDenom(d, delta) {
  const next = (_cfFormDenoms[d] || 0) + delta;
  if (next < 0) return;
  _cfFormDenoms[d] = next;
  document.getElementById(`cf-form-grid-qty-${d}`).textContent = next;
  document.getElementById('cf-form-total').textContent = cfDenomTotal(_cfFormDenoms).toLocaleString('vi-VN') + 'đ';
}

async function cfSubmitForm() {
  const total = cfDenomTotal(_cfFormDenoms);
  const label = { open: 'BẮT ĐẦU CA', mid: 'GIỮA CA', close: 'KẾT CA' }[_cfFormMode];
  // [FIX-confirm-webview] Xem ghi chú ở posConfirm() — confirm() gốc không bao giờ
  // trả true trong app bọc, nên nút gửi đếm tiền bấm không có tác dụng.
  if (!(await posConfirm(`Xác nhận ${label}\nTổng tiền mặt: ${total.toLocaleString('vi-VN')}đ\n\nBạn chắc chắn số liệu đã đúng?`))) return;

  const entry = { denominations: { ..._cfFormDenoms }, total, enteredAt: Date.now() };
  const ref = cfDocRef();

  if (_cfFormMode === 'open') {
    const isOverride = !!(_cfDoc && _cfDoc.open && _cfDoc.open.locked);
    const openData = { denominations: entry.denominations, total: entry.total, enteredAt: entry.enteredAt, locked: true };
    const write = isOverride
      ? ref.set({ open: openData, currentDenominations: { ..._cfFormDenoms } }, { merge: true })
          .then(() => ref.update({ 'open.overrideLogs': firebase.firestore.FieldValue.arrayUnion({ denominations: _cfDoc.open.denominations, total: _cfDoc.open.total, enteredAt: _cfDoc.open.enteredAt }) }))
      : ref.set({ date: cfDateKey(), open: openData, currentDenominations: { ..._cfFormDenoms }, mid: [], expenses: [] }, { merge: true });
    write.then(() => { toast('✅ Đã lưu tiền quỹ đầu ca'); loadCashFundScreen(); }).catch(() => toast('❌ Lỗi khi lưu'));
  } else if (_cfFormMode === 'mid') {
    ref.update({ mid: firebase.firestore.FieldValue.arrayUnion(entry) })
      .then(() => { toast('✅ Đã lưu đối soát giữa ca'); loadCashFundScreen(); }).catch(() => toast('❌ Lỗi khi lưu'));
  } else if (_cfFormMode === 'close') {
    const cashRevenue = getTodayCashRevenue();
    const expectedTotal = _cfDoc.open.total + cashRevenue - cfTotalExpenseNet();
    const closeData = { denominations: entry.denominations, total: entry.total, enteredAt: entry.enteredAt, cashRevenueToday: cashRevenue, expectedTotal, diff: total - expectedTotal };
    ref.set({ close: closeData }, { merge: true })
      .then(() => { toast('✅ Đã kết ca'); loadCashFundScreen(); }).catch(() => toast('❌ Lỗi khi lưu'));
  }
}

// ─── Form ghi chi tiêu ──────────────────────────────────────────────────────
let _cfExpenseOut = cfEmptyDenoms();

let _cfExpenseChange = cfEmptyDenoms();

function cfShowExpenseForm() {
  _cfExpenseOut = cfEmptyDenoms();
  _cfExpenseChange = cfEmptyDenoms();
  const el = document.getElementById('cf-content');
  el.innerHTML = `
    <div style="padding:0 16px 6px;"><div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:10px 4px;">GHI CHI TIÊU</div></div>
    <div class="wal-section">
      <div class="wal-input-group">
        <div class="wal-input-label">Lý do chi</div>
        <input id="cf-exp-note" type="text" placeholder="VD: Mua đá cây">
      </div>
      <div class="wal-section-title" style="margin:14px 0 8px;">Số tờ LẤY RA khỏi quỹ</div>
      <div class="cp-denom-grid" id="cf-exp-out-grid"></div>
      <div style="display:flex;justify-content:space-between;padding:8px 4px;font-size:13px;">
        <span style="color:var(--gt);">Tổng lấy ra</span><span id="cf-exp-out-total" style="font-weight:700;">0đ</span>
      </div>
      <div class="wal-section-title" style="margin:14px 0 8px;">Tiền thối lại nhận về (nếu có)</div>
      <div class="cp-denom-grid" id="cf-exp-change-grid"></div>
      <div style="display:flex;justify-content:space-between;padding:8px 4px;font-size:13px;">
        <span style="color:var(--gt);">Tổng thối lại</span><span id="cf-exp-change-total" style="font-weight:700;">0đ</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 4px;border-top:1px solid #eee;margin-top:6px;">
        <span style="font-weight:700;">SỐ TIỀN CHI THỰC TẾ</span><span id="cf-exp-net-total" style="font-weight:800;color:#e74c3c;">0đ</span>
      </div>
      <button onclick="cfSubmitExpense()" style="width:100%;margin-top:14px;padding:14px;background:#e74c3c;color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Xác nhận chi tiêu</button>
      <button onclick="loadCashFundScreen()" style="width:100%;margin-top:8px;padding:10px;background:none;border:none;color:var(--gt);font-size:13px;cursor:pointer;">Huỷ, quay lại</button>
    </div>
  `;
  cfRenderDenomGrid('cf-exp-out-grid', _cfExpenseOut, 'cfChangeExpenseOut');
  cfRenderDenomGrid('cf-exp-change-grid', _cfExpenseChange, 'cfChangeExpenseChange');
}

function cfChangeExpenseOut(d, delta) {
  const next = (_cfExpenseOut[d] || 0) + delta;
  if (next < 0) return;
  _cfExpenseOut[d] = next;
  document.getElementById(`cf-exp-out-grid-qty-${d}`).textContent = next;
  cfUpdExpenseTotals();
}

function cfChangeExpenseChange(d, delta) {
  const next = (_cfExpenseChange[d] || 0) + delta;
  if (next < 0) return;
  _cfExpenseChange[d] = next;
  document.getElementById(`cf-exp-change-grid-qty-${d}`).textContent = next;
  cfUpdExpenseTotals();
}

function cfUpdExpenseTotals() {
  const out = cfDenomTotal(_cfExpenseOut), chg = cfDenomTotal(_cfExpenseChange);
  document.getElementById('cf-exp-out-total').textContent = out.toLocaleString('vi-VN') + 'đ';
  document.getElementById('cf-exp-change-total').textContent = chg.toLocaleString('vi-VN') + 'đ';
  document.getElementById('cf-exp-net-total').textContent = (out - chg).toLocaleString('vi-VN') + 'đ';
}

function cfSubmitExpense() {
  const note = document.getElementById('cf-exp-note').value.trim();
  const takenOutTotal = cfDenomTotal(_cfExpenseOut);
  const changeTotal = cfDenomTotal(_cfExpenseChange);
  if (takenOutTotal <= 0) { toast('Chưa nhập số tờ lấy ra'); return; }
  const netAmount = takenOutTotal - changeTotal;
  const expense = { note, takenOut: { ..._cfExpenseOut }, takenOutTotal, change: { ..._cfExpenseChange }, changeTotal, netAmount, enteredAt: Date.now() };

  const ref = cfDocRef();
  const updates = { expenses: firebase.firestore.FieldValue.arrayUnion(expense) };
  CASH_DENOMS.forEach(d => {
    const delta = (_cfExpenseChange[d]||0) - (_cfExpenseOut[d]||0);
    if (delta !== 0) updates[`currentDenominations.${d}`] = firebase.firestore.FieldValue.increment(delta);
  });
  ref.update(updates).then(() => {
    if (_cfDoc) {
      _cfDoc.expenses = _cfDoc.expenses || [];
      _cfDoc.expenses.push(expense);
      _cfDoc.currentDenominations = _cfDoc.currentDenominations || cfEmptyDenoms();
      CASH_DENOMS.forEach(d => { _cfDoc.currentDenominations[d] = (_cfDoc.currentDenominations[d]||0) + (_cfExpenseChange[d]||0) - (_cfExpenseOut[d]||0); });
    }
    toast('✅ Đã ghi chi tiêu');
    loadCashFundScreen();
  }).catch(() => toast('❌ Lỗi khi lưu'));
}

// ─── Áp dụng giao dịch thanh toán tiền mặt vào tồn kho mệnh giá ────────────
function cfApplyCheckoutToFund(receivedDenoms, changeParts) {
  if (!_cfDoc || !_cfDoc.currentDenominations) return; // chưa mở ca hôm nay → không theo dõi được, bỏ qua
  const delta = cfEmptyDenoms();
  CASH_DENOMS.forEach(d => { delta[d] += (receivedDenoms[d] || 0); });
  (changeParts || []).forEach(p => { delta[p.d] -= p.qty; });

  const updates = {};
  CASH_DENOMS.forEach(d => {
    if (delta[d] !== 0) {
      _cfDoc.currentDenominations[d] = (_cfDoc.currentDenominations[d] || 0) + delta[d];
      updates[`currentDenominations.${d}`] = firebase.firestore.FieldValue.increment(delta[d]);
    }
  });
  if (Object.keys(updates).length) {
    cfDocRef().update(updates).catch(() => {});
  }
}

// Thuật toán gợi ý mệnh giá tiền thối — CHỈ gợi ý mệnh giá THỰC TẾ còn trong quỹ
function cfSuggestChangeBreakdown(amount) {
  if (!_cfDoc || !_cfDoc.currentDenominations) return { ok: null, parts: [] }; // chưa có dữ liệu tồn quỹ
  const avail = { ..._cfDoc.currentDenominations };
  let remain = amount;
  const parts = [];
  for (const d of CASH_DENOMS) {
    if (remain <= 0) break;
    const canUse = Math.min(Math.floor(remain / d), avail[d] || 0);
    if (canUse > 0) {
      parts.push({ d, qty: canUse });
      remain -= canUse * d;
    }
  }
  return { ok: remain === 0, parts, remain };
}

PosGieoMods.cashfund = true;
