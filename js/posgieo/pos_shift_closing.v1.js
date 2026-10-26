// Tách từ posgieo.html dòng 5489–8674 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_shift_closing.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).shiftClosing = 'dang';

// ============================================================
// [NEW] GIAI ĐOẠN 9 — Cash Reconciliation (Blind Cash Reconciliation)
// (POS_Management_Integration_Workflow.md, mục 12)
//
// NGUYÊN TẮC BẮT BUỘC (mục 12.2): nhân viên tuyệt đối không được thấy Expected Cash,
// Cash Sales Total, Cash Variance, số thiếu/thừa, hay bất kỳ phép tính nào suy ra được
// các số đó. Toàn bộ hàm dưới đây tính Expected Cash trong BỘ NHỚ JS và chỉ dùng để so
// sánh nội bộ — KHÔNG BAO GIỜ render ra DOM, không toast, không console.log giá trị này.
//
// GIỚI HẠN THẬT (ghi rõ, không che giấu): app này là 1 file HTML tĩnh chạy thẳng trên
// Firebase (không có Cloud Function/backend riêng), nên "blind" ở đây chỉ được đảm bảo
// ở TẦNG UI — một nhân viên đủ kỹ thuật mở DevTools vẫn có thể đọc biến JS hoặc theo dõi
// network request tới Firestore để tự suy luận. Muốn "blind" đúng nghĩa server-side (không
// thể lách dù có DevTools) cần chuyển phần tính Expected Cash + so sánh sang Cloud Function,
// ngoài phạm vi "bản đầu" này — nhưng vẫn ngăn được phần lớn trường hợp thực tế (nhân viên
// phổ thông không rành DevTools) và đúng tinh thần thiết kế UI theo yêu cầu.
//
// Cách tính Cash Sales: duyệt `orders` (đã có sẵn trong RAM qua realtime listener 3 ngày
// gần nhất — luôn bao gồm hôm nay) — đơn có `method` chứa 'TIỀN MẶT' thì CẢ `order.total`
// là tiền mặt thật thu tại quầy (vì phần ví/giảm giá đã trừ trước khi ra total, xem
// confirmPay()); riêng đơn "TÍNH RIÊNG" cộng từng nhóm (`splitGroups`) có method là
// 'TIỀN MẶT'. Cash Refunds và Cash Adjustments CHƯA có luồng nào trong app (không có tính
// năng hoàn tiền) nên tạm = 0 — ghi rõ trong tài liệu .md, không phải bỏ sót âm thầm.
// ============================================================
function posDateKeyToDisplay(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

function orderCashAmountPOS(o) {
  const adds = o.addons || [];
  const addonTotal = adds.reduce((s,a)=>s+(Number(a.amount)||0),0);
  const addonPaid = adds.filter(a=>(a.method||'').includes('TIỀN MẶT')).reduce((s,a)=>s+(Number(a.amount)||0),0);
  // splitGroups chỉ chứa tiền gốc; total đã gồm các lần mua bổ sung.
  if(o.method === 'TÍNH RIÊNG') return (o.splitGroups||[]).filter(g=>g.method==='TIỀN MẶT').reduce((s,g)=>s+(Number(g.total)||0),0)+addonPaid;
  return ((o.method||'').includes('TIỀN MẶT') ? Math.max(0,(Number(o.total)||0)-addonTotal) : 0)+addonPaid;
}

// [BUG#36 FIX] MỘT ĐIỀU KIỆN DUY NHẤT cho "khoản chi này có thật sự rút tiền khỏi két hay không".
// TRƯỚC ĐÂY mỗi nơi tự viết filter: P&L bên Management đã loại `voided` (khoản bị Quản lý huỷ),
// nhưng Expected Cash của POS chỉ loại `rejected` → khoản đã VOID vẫn bị trừ khỏi tiền dự kiến.
// Hệ quả rất khó lần ra: P&L nhìn ĐÚNG, còn đối soát két lại báo "thừa tiền" đúng bằng số đã void
// (Expected thấp hơn thực tế) — nhân viên bị hỏi về một khoản thừa không tồn tại. Mọi chỗ tính
// tiền mặt từ đây dùng chung hàm này để không bao giờ lệch nhau nữa.
function isExpenseIncludedInCash(e) {
  if (!e || e.baseType !== 'cash') return false;
  const st = String(e.status || '');
  return st !== 'rejected' && st !== 'voided' && st !== 'cancelled';
}

async function computeExpectedCashPOS(businessDate, openingCash) {
  const displayDate = posDateKeyToDisplay(businessDate);
  const cashSales = orders.filter(o => o.date === displayDate).reduce((s, o) => s + orderCashAmountPOS(o), 0);
  let cashExpenseTotal = 0;
  // [BUG#34 FIX] FAIL-CLOSED. Trước đây lỗi đọc chi phí chỉ console.warn rồi để
  // cashExpenseTotal = 0 — nghĩa là Expected bị tính CAO HƠN thực tế đúng bằng tổng chi tiền mặt
  // trong ngày, và vì đây là đối soát MÙ (nhân viên không thấy Expected), hệ quả là app kết luận
  // "đếm thiếu tiền" đúng số tiền đã chi, bắt đếm lại tới hết lượt rồi ghi vào sổ một khoản
  // 'cash_variance_recorded' mà nhân viên không hề gây ra. Thà dừng đối soát và bảo thử lại còn
  // hơn quy kết thiếu hụt cho người đang đếm.
  const expSnap = await fstore.collection('expenses_gieogieo').where('date', '==', businessDate).get()
    .catch(err => { throw new Error('Không đọc được chi phí trong ngày — chưa đối soát được, thử lại: ' + (err.message || err)); });
  cashExpenseTotal = expSnap.docs.map(d => d.data())
    .filter(isExpenseIncludedInCash)   // [BUG#36 FIX] loại cả 'voided', xem hàm đó
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // Cash Refunds = 0 (chưa có luồng hoàn tiền), Cash Adjustments = 0 (chưa có Correction
  // Request flow — mục 12.4, ngoài phạm vi bản đầu).
  return (Number(openingCash) || 0) + cashSales - cashExpenseTotal;
}

let shiftState = { businessDate: null, opening: null, closing: null };

// Trạng thái thao tác mở/giao/kết ca cho nhãn trên Quản lý. Heartbeat giúp nhãn
// tự hết hạn khi POS bị tắt; giữ khối này riêng để dễ thay đổi luồng về sau.
const SHIFT_WORKFLOW_COLL_POS = 'shift_workflows_gieogieo';

let _shiftWorkflowPOS = null;

let _shiftWorkflowTimerPOS = null;

let _shiftWorkflowWritePOS = Promise.resolve();

function _queueShiftWorkflowWritePOS(dateKey, data){
  _shiftWorkflowWritePOS = _shiftWorkflowWritePOS.catch(()=>{}).then(() =>
    fstore.collection(SHIFT_WORKFLOW_COLL_POS).doc(dateKey).set(data, { merge:true })
  ).catch(err=>console.warn('[Trạng thái ca] Không đồng bộ được:', err));
}

function startShiftWorkflowPOS(phase, startedAt){
  const dateKey = shiftState.businessDate || posDateKey();
  if(_shiftWorkflowPOS && _shiftWorkflowPOS.phase===phase && _shiftWorkflowPOS.dateKey===dateKey) return;
  stopShiftWorkflowPOS();
  const now = vnDate().toISOString();
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const start = Number.isFinite(Date.parse(startedAt||'')) ? startedAt : now;
  _shiftWorkflowPOS = { phase, dateKey, sessionId, startedAt:start };
  _queueShiftWorkflowWritePOS(dateKey, { phase, sessionId, startedAt:start, updatedAt:now, active:true, endedAt:null });
  _shiftWorkflowTimerPOS = setInterval(()=>{
    const current = _shiftWorkflowPOS;
    if(!current || current.sessionId!==sessionId) return;
    _queueShiftWorkflowWritePOS(dateKey, { phase, sessionId, updatedAt:vnDate().toISOString(), active:true });
  }, 30000);
}

function stopShiftWorkflowPOS(phase){
  const current = _shiftWorkflowPOS;
  if(!current || (phase && current.phase!==phase)) return;
  _shiftWorkflowPOS = null;
  if(_shiftWorkflowTimerPOS){ clearInterval(_shiftWorkflowTimerPOS); _shiftWorkflowTimerPOS=null; }
  const now = vnDate().toISOString();
  _queueShiftWorkflowWritePOS(current.dateKey, { active:false, updatedAt:now, endedAt:now, sessionId:current.sessionId });
}

// Các ô PIN thuộc pipeline kết ca — chỉ những ô này mới được phiên kết ca ký hộ.
// Cố tình KHÔNG đưa 'handoverSigner'/'handoverSigner2'/'checkin' vào: đó là chữ
// ký của giao ca giữa ngày và của chính việc check-in, phải do đúng người gõ.
const CLOSE_PIPELINE_PIN_FIELDS = new Set([
  'shiftCloseStaff', 'handoverCloseStaff', 'refillOverrideStaff',
  'prepCountStaff', 'shiftInventoryCloseStaff', 'shiftRecipient', 'closeChecklistStaff'
]);

// { employeeId, fullName, startedAt } — null nghĩa là chưa mở phiên kết ca.
let _closeSession = null;

function closeSessionEmployeePOS() {
  if (!_closeSession) return null;
  const e = EMPLOYEES_CACHE_POS.find(x => x.id === _closeSession.employeeId);
  // Nhân viên có thể bị ngừng hoạt động giữa chừng → vẫn giữ danh tính đã ký ở
  // đầu phiên, không để pipeline gãy giữa đường vì một thay đổi bên Quản lý.
  return e || { id: _closeSession.employeeId, fullName: _closeSession.fullName };
}

// Ai còn đang đứng trong ca (đã check-in, chưa check-out).
function staffStillInShiftPOS() {
  return _employeeShiftsTodayCache.filter(s => !s.checkedOutAt);
}

// Khôi phục phiên sau khi app bị tắt/reload giữa pipeline. Không hỏi PIN lại ở
// đây: danh tính đã được ký và ghi xuống Firestore lúc mở phiên, bắt gõ lại chỉ
// làm nhân viên khổ thêm mà không tăng độ tin cậy.
function restoreCloseSessionPOS(closing) {
  if (_closeSession) return;
  const op = closing && closing.closeOperator;
  if (!op || !op.employeeId) return;
  if (closing.status === 'closed') return;
  _closeSession = { employeeId: op.employeeId, fullName: op.fullName || '', startedAt: op.startedAt || null, businessDate: closing.businessDate || shiftState.businessDate, restored: true };
  startCloseElapsedTickPOS();
}

// Vào lại pipeline ở ĐÚNG bước đang dở. Dùng chung cho cả lúc mở phiên mới lẫn
// lúc ký lại phiên sau khi app bị tắt giữa chừng — nếu cứ gọi thẳng
// renderShiftCloseCountForm() thì ngày đã đối soát xong tiền mặt sẽ bị bắt đếm lại.
function resumeClosePipelinePOS() {
  if (_closeSession) startShiftWorkflowPOS('closing', _closeSession.startedAt);
  const st = shiftState.closing && shiftState.closing.status;
  // [FIX] Xem chú thích đầy đủ ở hasNewCashOrdersSinceCashCount() — có bill tiền mặt mới
  // phát sinh sau lần đối soát trước thì KHÔNG được nhảy qua bước sau, bắt đếm lại ngay.
  if (CASH_OR_LATER_STATUSES.includes(st) && hasNewCashOrdersSinceCashCount(shiftState.closing)) {
    renderCashRecountRequiredPOS();
    return;
  }
  if (st === 'handed_over') { renderDailyClosingChecklist(); return; }
  if (st === 'bank_passed') { renderShiftHandoverForm(); return; }
  if (cashStepDone(st)) { proceedAfterCashPass(); return; }
  renderShiftCloseCountForm();
}

// Chốt chặn dùng lại ở mọi cửa vào pipeline: nạp lại cache (người khác có thể
// vừa check-in ở máy khác) rồi trả về danh sách người còn trong ca.
async function closeGateBlockersPOS() {
  await loadEmployeeShiftsTodayCache();
  _employeeShiftsCacheDate = posDateKey();
  return staffStillInShiftPOS();
}

// ---------- cửa vào: nút "Kết ca" ----------
async function beginCloseShiftPOS() {
  const box = document.getElementById('shiftBody');
  showLoading(box);
  try { await recheckCloseAfterSalesPOS(); }
  catch (err) {
    console.error('[Kết ca] không kiểm tra được bill mới:', err);
    box.innerHTML = '<div class="kc-card">Không kiểm tra được bill mới nên chưa thể tiếp tục kết ca.</div><button onclick="beginCloseShiftPOS()" class="kc-btn" style="background:var(--gd);color:#fff;">Thử lại</button>';
    return;
  }
  let conTrongCa;
  try {
    conTrongCa = await closeGateBlockersPOS();
  } catch (err) {
    // Không đọc được danh sách check-in thì KHÔNG đoán bừa là "đã hết người".
    console.warn('beginCloseShiftPOS: không đọc được check-in:', err);
    box.innerHTML = `
      <div style="text-align:center;padding:26px 16px;">
        <div style="font-size:30px;margin-bottom:8px;">📴</div>
        <div style="font-weight:700;font-size:14.5px;color:var(--td);margin-bottom:6px;">Không kiểm tra được ai đang trong ca</div>
        <div style="font-size:12.5px;color:#999;line-height:1.6;">Mạng đang chập chờn. Thử lại sau giây lát.</div>
      </div>
      <button onclick="beginCloseShiftPOS()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Thử lại</button>
      <button onclick="renderShiftDashboard()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">← Quay lại</button>`;
    return;
  }
  if (conTrongCa.length) { renderCloseGateBlockedPOS(conTrongCa); return; }
  if (_closeSession) { resumeClosePipelinePOS(); return; }
  renderCloseOperatorFormPOS();
}

function renderCloseGateBlockedPOS(list) {
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:16px;padding:16px;margin:0 0 14px;">
      <div style="font-size:14.5px;font-weight:800;color:#c0392b;margin-bottom:8px;">🚫 Chưa kết ca được — còn ${list.length} người đang trong ca</div>
      ${list.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #fecaca;">
          <span style="font-size:13.5px;font-weight:700;color:#c0392b;">${s.employeeName}</span>
          <span style="font-size:11.5px;color:#e07a6a;">Vào lúc ${vnDate(s.checkedInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>`).join('')}
      <div style="font-size:12px;color:#b23c2c;margin-top:10px;line-height:1.6;">
        <b>Tất cả mọi người phải check-out trước khi kết ca.</b><br>
        Check-out ở ô <b>Check-in / Check-out hôm nay</b> ngay phía trên, rồi quay lại bấm Kết ca.
      </div>
    </div>
    <button onclick="beginCloseShiftPOS()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Đã check-out xong — kiểm tra lại</button>
    <button onclick="renderShiftDashboard()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">← Quay lại</button>`;
}

function renderCloseOperatorFormPOS() {
  const box = document.getElementById('shiftBody');
  // Người đủ điều kiện = có ca hôm nay (đã check-in ít nhất 1 lần). Hiện danh
  // sách ra để nhân viên biết ngay ai được phép, khỏi gõ PIN mò.
  const seen = new Map();
  _employeeShiftsTodayCache.forEach(s => { if (!seen.has(s.employeeId)) seen.set(s.employeeId, s.employeeName); });
  const names = [...seen.values()];
  box.innerHTML = `
    <div style="background:#f0faf4;border:1.5px solid #86efac;border-radius:16px;padding:14px 16px;margin:0 0 14px;">
      <div style="font-size:13.5px;font-weight:800;color:#15803d;margin-bottom:6px;">✅ Đã check-out hết — bắt đầu kết ca</div>
      <div style="font-size:12px;color:#166534;line-height:1.6;">Nhập mã PIN một lần, hệ thống sẽ nhớ bạn suốt các bước kết ca và chỉ hỏi lại đúng một lần ở bước cuối.</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Người thực hiện kết ca</div>
      <div style="font-size:11.5px;color:#999;margin-bottom:2px;">Phải là người có đi làm hôm nay${names.length ? ': <b style="color:var(--td);">' + names.join(', ') + '</b>' : ''}.</div>
      ${renderPinInput('closeOperatorStaff', 'Mã nhân viên (PIN 4 số)')}
    </div>
    <button onclick="submitCloseOperatorPOS()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Bắt đầu kết ca</button>
    <button onclick="renderShiftDashboard()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">← Quay lại</button>`;
}

async function submitCloseOperatorPOS() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitCloseOperatorImplPOS(); } finally { _posSubmitBusy = false; }
}

async function _submitCloseOperatorImplPOS() {
  // resolveStaffPinWorkedToday chấp nhận cả ca ĐÃ check-out — đúng điều kiện
  // cần ở đây ("một trong những người vừa kết thúc ca"), khác với các thao tác
  // vận hành vốn đòi ca đang mở.
  const emp = await resolveStaffPinWorkedToday('closeOperatorStaff');
  if (!emp) return;
  // Nạp lại lần cuối: có thể trong lúc gõ PIN có người vừa check-in ở máy khác.
  const conTrongCa = await closeGateBlockersPOS();
  if (conTrongCa.length) { toast('🚫 Vừa có người check-in lại — phải check-out hết'); renderCloseGateBlockedPOS(conTrongCa); return; }
  _closeSession = { employeeId: emp.id, fullName: emp.fullName, startedAt: vnDate().toISOString(), businessDate: shiftState.businessDate };
  // Ghi xuống Firestore để (a) khôi phục được nếu app tắt giữa chừng, (b) Quản
  // lý đo được kết ca mất bao lâu (startedAt → closedAt) mà so giữa các nhân viên.
  try {
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      businessDate: shiftState.businessDate,
      closeOperator: { employeeId: emp.id, fullName: emp.fullName, startedAt: _closeSession.startedAt }
    }, { merge: true });
  } catch (err) {
    // Không chặn: phiên vẫn chạy được trong bộ nhớ, chỉ mất khả năng khôi phục.
    console.warn('Không ghi được closeOperator (vẫn tiếp tục kết ca):', err);
  }
  if (shiftState.closing) shiftState.closing.closeOperator = { employeeId: emp.id, fullName: emp.fullName, startedAt: _closeSession.startedAt };
  startShiftWorkflowPOS('closing', _closeSession.startedAt);
  toast(`🔒 ${emp.fullName} đang kết ca`);
  startCloseElapsedTickPOS();
  closeStepRememberEntryPOS();
  resumeClosePipelinePOS();
}

// Banner nhỏ hiện ở mọi bước trong pipeline — nhân viên luôn thấy hệ thống đang
// ghi việc này cho ai, khỏi phải đoán vì sao không còn ô PIN nào.
//
// Chỉ hiện ĐÚNG 2 thứ: tên người kết ca và đã kết ca bao nhiêu phút. Mọi diễn
// giải khác (giờ công, mốc cảnh báo, so sánh giữa các nhân viên) để bên Quản lý
// — POS là màn của nhân viên, đưa nhận xét về năng suất lên đây chỉ gây ức chế
// mà không đổi được thao tác họ phải làm.
function closeSessionElapsedMinPOS() {
  if (!_closeSession || !_closeSession.startedAt) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(_closeSession.startedAt)) / 60000));
}

function closeSessionBannerPOS() {
  if (!_closeSession) return '';
  const m = closeSessionElapsedMinPOS();
  return `
    <div style="display:flex;align-items:center;gap:8px;background:#f0faf4;border:1.5px solid #86efac;border-radius:999px;padding:9px 15px;margin:0 0 14px;">
      <span style="font-size:15px;">🔒</span>
      <div style="min-width:0;flex:1;">
        <div style="font-size:11px;color:#15803d;font-weight:600;">Đang kết ca</div>
        <div style="font-size:13px;font-weight:700;color:var(--td);">${_closeSession.fullName}</div>
      </div>
      ${m != null ? `<div style="flex-shrink:0;text-align:right;">
        <div style="font-size:15px;font-weight:800;color:#15803d;line-height:1.1;"><span id="closeElapsedMin">${m}</span> phút</div>
      </div>` : ''}
    </div>`;
}

// ============================================================================
// Thanh tiến trình 8 bước. Giữ ảnh chụp giao diện của các bước đã đi qua để nút
// quay lại thực sự mở bước trước. Bước đã ghi Firestore chỉ xem lại, không gửi lần 2.
// ============================================================================
const CLOSE_STEP_TOTAL = 8;

let _closeStepCurrentPOS = 0;

let _closeStepReviewPOS = null;

let _closeStepScreensPOS = {};

let _closeStepEntryPOS = '';

let _closeStepDatePOS = '';

function closeStepEnsureDatePOS() {
  const date = shiftState.businessDate || posDateKey();
  if (_closeStepDatePOS === date) return;
  _closeStepDatePOS = date;
  _closeStepCurrentPOS = 0;
  _closeStepReviewPOS = null;
  _closeStepScreensPOS = {};
  _closeStepEntryPOS = '';
}

function closeStepSnapshotPOS(box) {
  const clone = box.cloneNode(true);
  const sourceFields = box.querySelectorAll('input,textarea,select');
  const clonedFields = clone.querySelectorAll('input,textarea,select');
  sourceFields.forEach((field, i) => {
    const copy = clonedFields[i];
    if (!copy) return;
    // Không giữ mã PIN trong màn xem lại.
    if (field.type === 'hidden' || /pin/i.test(field.id || '')) {
      copy.value = '';
      copy.setAttribute('value', '');
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      copy.checked = field.checked;
      if (field.checked) copy.setAttribute('checked', '');
      else copy.removeAttribute('checked');
    } else if (field.tagName === 'TEXTAREA') {
      copy.textContent = field.value;
    } else {
      copy.value = field.value;
      copy.setAttribute('value', field.value);
    }
  });
  return clone.innerHTML;
}

function closeStepRememberEntryPOS() {
  closeStepEnsureDatePOS();
  const box = document.getElementById('shiftBody');
  if (box) _closeStepEntryPOS = closeStepSnapshotPOS(box);
}

function closeStepTrackPOS() {
  if (_closeStepReviewPOS !== null) return;
  const box = document.getElementById('shiftBody');
  if (!box) return;
  const label = box.querySelector('.kc-nav-pill .lbl');
  const match = label && label.textContent.match(new RegExp('Bước\\s+(\\d+)/' + CLOSE_STEP_TOTAL));
  if (!match) return;
  const step = Number(match[1]);
  closeStepEnsureDatePOS();
  _closeStepCurrentPOS = step;
  _closeStepScreensPOS[step] = closeStepSnapshotPOS(box);
}

function closeStepShowReviewPOS(step) {
  const box = document.getElementById('shiftBody');
  const html = step === 0 ? _closeStepEntryPOS : _closeStepScreensPOS[step];
  if (!box || !html) return false;
  _closeStepReviewPOS = step;
  box.innerHTML = html;
  box.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = true; });
  // Nội dung đã chốt là bản xem lại, không thể bấm các nút ghi dữ liệu cũ.
  box.insertAdjacentHTML('afterbegin', '<div style="background:#f0faf4;border:1.5px solid #86efac;border-radius:14px;padding:11px 14px;color:#15803d;font-size:13px;font-weight:700;margin-bottom:12px;">Đã hoàn tất · Xem lại bước trước</div>');
  const nav = box.querySelector('.kc-nav');
  if (nav) {
    const back = nav.querySelector('.kc-nav-back');
    if (back) { back.disabled = false; back.onclick = closeStepNavBack; }
    const pill = nav.querySelector('.kc-nav-pill');
    if (pill) pill.insertAdjacentHTML('beforeend', '<button type="button" onclick="closeStepNavForward()" style="border:0;background:var(--gl);color:var(--gd);border-radius:999px;padding:7px 10px;font-weight:800;margin-left:4px;">Tiếp →</button>');
  }
  const next = [...box.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tiếp →');
  if (next) next.disabled = false;
  const action = box.querySelector('.kc-nav ~ .kc-btn');
  if (action) action.style.display = 'none';
  box.insertAdjacentHTML('beforeend', '<button type="button" onclick="closeStepNavForward()" class="kc-btn" style="background:var(--gd);color:#fff;margin:10px 0 22px;">Tiếp tục →</button>');
  return true;
}

function closeStepNavHTML(stepIdx) {
  const dots = Array.from({ length: CLOSE_STEP_TOTAL }, (_, i) => {
    const n = i + 1;
    if (n === stepIdx) return `<div style="height:7px;border-radius:999px;background:#E23A5D;width:28px;flex-shrink:0;"></div>`;
    if (n < stepIdx) return `<div style="height:7px;border-radius:999px;background:#d8cfae;width:7px;flex-shrink:0;"></div>`;
    return `<div style="height:7px;border-radius:999px;background:#EFE9D8;width:7px;flex-shrink:0;"></div>`;
  }).join('');
  return `
    <div class="kc-nav">
      <button onclick="closeStepNavBack()" class="kc-nav-back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
      <div class="kc-nav-pill">
        ${dots}
        <span class="lbl">Bước ${stepIdx}/${CLOSE_STEP_TOTAL}</span>
      </div>
    </div>`;
}

function closeStepNavBack() {
  closeStepEnsureDatePOS();
  if (_closeStepReviewPOS === null) closeStepTrackPOS();
  const from = _closeStepReviewPOS === null ? _closeStepCurrentPOS : _closeStepReviewPOS;
  // Những bước tùy điều kiện (thiếu đồ, refill, BTP...) có thể không xuất hiện.
  for (let previous = from - 1; previous >= 0; previous--) {
    if ((previous === 0 && _closeStepEntryPOS) || _closeStepScreensPOS[previous]) {
      closeStepShowReviewPOS(previous);
      return;
    }
  }
  toast('Chưa có màn trước để xem lại');
}

function closeStepNavForward() {
  if (_closeStepReviewPOS === null) return;
  for (let next = _closeStepReviewPOS + 1; next <= _closeStepCurrentPOS; next++) {
    if (!_closeStepScreensPOS[next]) continue;
    if (next === _closeStepCurrentPOS) {
      const box = document.getElementById('shiftBody');
      _closeStepReviewPOS = null;
      box.innerHTML = _closeStepScreensPOS[next];
      closeStepTrackPOS();
    } else closeStepShowReviewPOS(next);
    return;
  }
}

// Đồng hồ chỉ cập nhật ĐÚNG con số phút trong banner, không vẽ lại màn — nhân
// viên đang gõ dở số tiền/số lượng ở bước nào cũng không bị mất.
let _closeElapsedTimer = null;

function startCloseElapsedTickPOS() {
  if (_closeElapsedTimer) return;
  _closeElapsedTimer = setInterval(() => {
    if (!_closeSession) { clearInterval(_closeElapsedTimer); _closeElapsedTimer = null; return; }
    const el = document.getElementById('closeElapsedMin');
    const m = closeSessionElapsedMinPOS();
    if (el && m != null) el.textContent = m;
  }, 30000);
}

function renderShiftDashboard() {
  // Đã quay về màn tổng quan thì không còn ở bước mở ca đang thao tác.
  stopShiftWorkflowPOS('opening');
  const box = document.getElementById('shiftBody');
  const { opening, closing } = shiftState;
  if (!opening) {
    box.innerHTML = renderStaleShiftWarning() + `
      <div class="kc-title">Mở ca hôm nay</div>
      <div class="kc-card"><div style="font-size:20px;font-weight:900;margin-bottom:5px;">Chưa mở ca</div>
        <div style="font-size:13px;color:#999;">Đếm tiền quỹ đầu ca để bắt đầu bán hàng.</div></div>
      <button onclick="renderShiftOpenForm()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Bắt đầu ca</button>`;
    return;
  }
  // [Giai đoạn 10] closing.status giờ là 1 pipeline nhiều bước:
  // (không có) → 'cash_passed' → 'bank_passed' (hệ thống TỰ chốt, không còn bước nhân viên
  // nhập tay — xem _continueAfterPrepCount()) → 'handed_over'.
  // [Giai đoạn 11] → 'closed' (bước cuối, sau khi xác nhận checklist đóng ngày).
  if (closing && closing.status === 'closed') {
    box.innerHTML = renderStaleShiftWarning() + `
      <div style="text-align:center;padding:20px 10px;">
        <div style="display:flex;justify-content:center;margin-bottom:10px;"><span style="width:56px;height:56px;border-radius:18px;background:#F6F4EF;color:var(--td);display:flex;align-items:center;justify-content:center;">${caIcon('lock', 26)}</span></div>
        <div style="font-weight:700;font-size:15px;color:var(--td);margin-bottom:6px;">Đã đóng ngày hôm nay</div>
        <div style="font-size:12.5px;color:#999;">Đóng lúc ${vnDate(closing.closedAt).toLocaleTimeString('vi-VN')}</div>
        ${closing.closeDurationMin != null ? `<div style="font-size:12.5px;color:#999;margin-top:3px;">Kết ca mất <b style="color:var(--td);">${closing.closeDurationMin} phút</b></div>` : ''}
      </div>`;
    return;
  }
  // [FIX] Xem chú thích đầy đủ ở hasNewCashOrdersSinceCashCount() — nhân viên đếm tiền
  // xong, back ra bán thêm bill tiền mặt, rồi quay lại màn này: TUYỆT ĐỐI không được nhảy
  // qua bước sau bằng số tiền đã đối soát cũ. Đặt TRƯỚC khối khôi phục phiên bên dưới vì
  // khối đó có thể return sớm (gọi beginCloseShiftPOS/resumeClosePipelinePOS) mà không đi
  // qua các nhánh render tiếp theo trong chính hàm này.
  if (closing && CASH_OR_LATER_STATUSES.includes(closing.status) && hasNewCashOrdersSinceCashCount(closing)) {
    renderCashRecountRequiredPOS();
    return;
  }
  // [PHIÊN KẾT CA] Ngày đang dở pipeline: khôi phục người kết ca đã ký lúc mở
  // phiên. Không khôi phục được (ghi Firestore hỏng lúc đó, hoặc dữ liệu cũ từ
  // trước khi có tính năng này) → quay về cửa vào, bắt check-out hết + ký lại,
  // rồi beginCloseShiftPOS sẽ tự nhảy đúng bước đang dở.
  if (closing && [...CASH_DONE_STATUSES, 'bank_passed', 'handed_over'].includes(closing.status)) {
    restoreCloseSessionPOS(closing);
    if (!_closeSession) { beginCloseShiftPOS(); return; }
    startShiftWorkflowPOS('closing', _closeSession.startedAt);
  }
  if (closing && closing.status === 'handed_over') { renderDailyClosingChecklist(); return; }
  if (closing && closing.status === 'bank_passed') { renderShiftHandoverForm(); return; }
  if (closing && cashStepDone(closing.status)) { proceedAfterCashPass(); return; }
  // Gọn để thấy được nút Kết ca mà không phải cuộn: trạng thái ca + người giữ két gộp
  // chung một khối, 2 việc phụ nằm chung một hàng.
  const seg = currentSegmentPOS();
  const nguoiKhac = seg ? _employeeShiftsTodayCache.filter(x => !x.checkedOutAt && x.employeeId !== seg.custodianId) : [];
  const hm = iso => vnDate(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  box.innerHTML = renderStaleShiftWarning() + `
    ${closing && closing.reopeningAfterSaleAt && !closing.cashPassedAt ? '<div class="kc-sub" style="margin-bottom:12px;color:#a32946;font-weight:700;">Có bill mới · Cần đối soát lại trước khi đóng ngày.</div>' : ''}
    <div class="wal-section" style="margin:0 0 12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <span style="display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:800;color:#15803d;background:#dcfce7;border-radius:999px;padding:6px 12px;"><span style="width:8px;height:8px;border-radius:50%;background:#16a34a;"></span>Đang mở ca từ ${hm(opening.createdAt)}</span>
        <span style="font-size:14px;color:#8A8A90;">Quỹ đầu ca <b style="font-size:16px;color:var(--td);">${Number(opening.openingCash).toLocaleString('vi-VN')}đ</b></span>
      </div>
      ${seg ? `
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid #F0EDE6;">
        <span style="width:44px;height:44px;border-radius:14px;background:var(--gl);color:var(--gd);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${caIcon('key', 22)}</span>
        <div style="min-width:0;">
          <div style="font-size:12.5px;color:#8A8A90;font-weight:700;">Người giữ két</div>
          <div style="font-size:18px;font-weight:800;color:var(--td);line-height:1.25;">${escHtmlPos(seg.custodianName || '—')}</div>
          <div style="font-size:12.5px;color:#8A8A90;margin-top:2px;">Đoạn ${seg.seq}${seg.seq > 1 ? ` · nhận ${(Number(seg.startCash) || 0).toLocaleString('vi-VN')}đ lúc ${hm(seg.startAt)}` : ' · từ lúc mở ca'}${nguoiKhac.length ? ` · cùng ca: ${nguoiKhac.map(x => escHtmlPos(x.employeeName)).join(', ')}` : ''}</div>
        </div>
      </div>` : ''}
      ${closing && closing.attempts && closing.attempts.length ? `<div style="font-size:13px;font-weight:700;color:#c0392b;margin-top:10px;">Đã thử đối soát tiền mặt ${closing.attempts.length} lần, chưa khớp.</div>` : ''}
    </div>
    ${_openChecklistBlocking ? caBtn('renderOpeningChecklist()', 'alert', 'Việc đầu ca chưa xong, chưa bán được', 'danger', 'margin-bottom:10px;') : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${_openChecklistBlocking ? '' : caBtn('renderOpeningChecklist()', 'check', 'Việc đầu ca', 'plain', 'font-size:15px;padding:0 10px;')}
      ${caBtn('renderShiftCloseReview()', 'list', 'Rà soát thu/chi', 'plain', 'font-size:15px;padding:0 10px;' + (_openChecklistBlocking ? 'grid-column:1 / -1;' : ''))}
    </div>
    ${caBtn('beginCloseShiftPOS()', 'lock', 'Kết ca, đối soát tiền mặt', 'primary', 'margin-top:10px;')}
    <div style="font-size:13px;color:#9A9AA0;text-align:center;margin-top:8px;">Phải check-out hết mọi người mới kết ca được.</div>
    <button onclick="openHandoverPOS('manual')" style="display:block;margin:6px auto 0;padding:8px 12px;background:none;border:none;color:var(--gd);font-family:'Google Sans',sans-serif;font-size:13.5px;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;">Đổi người giữ két mà không check-out</button>
  `;
}

async function renderShiftCloseReview() {
  const box = document.getElementById('shiftBody');
  showLoading(box);
  // [FIX] Trước đây chỉ lấy khoản baseType==='cash' → khoản bị ghi sai hình thức
  // (hoặc thiếu hình thức) KHÔNG hiện ra ở đây, trong khi nó cũng KHÔNG được trừ
  // vào Expected cash. Nhân viên bị mù hai lớp: tiền mặt thiếu mà không thấy khoản
  // nào khả nghi để đối chiếu. Giờ lấy HẾT chi phí trong ngày, đánh dấu rõ khoản
  // không tính vào tiền mặt để họ tự phát hiện chỗ ghi sai.
  let allExpenses = [];
  try {
    const snap = await fstore.collection('expenses_gieogieo').where('date', '==', shiftState.businessDate).get();
    // [BUG#36 FIX] Bỏ luôn khoản đã bị Quản lý VOID/huỷ: nó không còn rút tiền khỏi két (Expected
    // Cash cũng không trừ nữa — xem isExpenseIncludedInCash), nên để nó trong danh sách đối soát
    // chỉ làm nhân viên tin là đã được tính rồi đi tìm khoản thừa không tồn tại.
    allExpenses = snap.docs.map(d => d.data())
      .filter(e => { const st = String(e.status || ''); return st !== 'rejected' && st !== 'voided' && st !== 'cancelled'; });
  } catch (err) {
    console.warn('renderShiftCloseReview load failed', err);
  }
  const cashExpenses = allExpenses.filter(e => e.baseType === 'cash');
  const otherExpenses = allExpenses.filter(e => e.baseType !== 'cash');
  // [GIAO CA] Ngày có giao ca: nói rõ ca này chịu trách nhiệm từ mốc nào, để nhân
  // viên không hoang mang khi thấy cả khoản chi của ca trước trong danh sách dưới.
  const revSeg = currentSegmentPOS();
  const revFrom = revSeg && (Number(revSeg.seq) || 1) > 1
    ? vnDate(revSeg.startAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null;
  const tong = list => list.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const dong = (e, i, mau) => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;${i ? `border-top:1px solid ${mau || '#F0EDE6'};` : ''}">
          <div style="min-width:0;">
            <div style="font-size:16px;font-weight:800;color:inherit;">${escHtmlPos(e.category || '')}</div>
            ${e.note ? `<div style="font-size:13px;opacity:.7;margin-top:2px;">${escHtmlPos(e.note)}</div>` : ''}
            ${mau ? `<span style="display:inline-block;margin-top:6px;font-size:12px;font-weight:800;background:#fff;border:1.5px solid #fcd34d;border-radius:8px;padding:2px 8px;">${escHtmlPos(e.paymentMethodLabel || 'Chưa ghi hình thức')}</span>` : ''}
          </div>
          <span style="font-size:16px;font-weight:800;white-space:nowrap;">${Number(e.amount).toLocaleString('vi-VN')}đ</span>
        </div>`;
  box.innerHTML = (revFrom ? `
    <div style="background:#EAF3FA;border-radius:18px;padding:14px 16px;margin:0 0 14px;color:#0062AD;">
      <div style="font-size:16px;font-weight:800;">Ca của bạn tính từ ${revFrom}</div>
      <div style="font-size:13.5px;margin-top:4px;line-height:1.55;">Bạn nhận két lúc đó, nên chỉ chịu trách nhiệm phần thu/chi từ mốc này. Danh sách dưới vẫn liệt kê cả ngày để soát cho đủ.</div>
    </div>` : '') + `
    <div class="wal-section" style="margin:0 0 14px;padding:18px;color:var(--td);">
      ${caTitle('Chi tiền mặt hôm nay', `<span style="font-size:13px;font-weight:800;color:var(--gd);background:var(--gl);border-radius:999px;padding:4px 10px;">${cashExpenses.length} khoản</span>`)}
      ${cashExpenses.length ? cashExpenses.map((e, i) => dong(e, i)).join('') + `
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:12px;margin-top:4px;border-top:2px solid #E6E1D6;">
          <span style="font-size:14.5px;color:#8A8A90;font-weight:700;">Tổng chi tiền mặt</span>
          <span style="font-size:19px;font-weight:800;">${tong(cashExpenses).toLocaleString('vi-VN')}đ</span>
        </div>` : '<div style="font-size:14px;color:#9A9AA0;">Chưa ghi khoản chi tiền mặt nào hôm nay.</div>'}
      <div style="font-size:13px;color:#8A8A90;margin:14px 0 12px;line-height:1.5;">Thiếu khoản nào thì ghi bổ sung ngay, hệ thống tự tính lại khi đối soát.</div>
      ${caBtn('openExpenseScreen()', 'plus', 'Ghi thêm chi phí', 'plain')}
    </div>
    ${otherExpenses.length ? `
    <div class="wal-section" style="margin:0 0 14px;padding:18px;border:2px solid #fcd34d;background:#fffbeb;color:#92400e;">
      ${caTitle('<span style="color:#92400e;">Không tính vào tiền mặt</span>', `<span style="font-size:13px;font-weight:800;color:#92400e;background:#fef3c7;border-radius:999px;padding:4px 10px;">${otherExpenses.length} khoản</span>`)}
      ${otherExpenses.map((e, i) => dong(e, i, '#fde68a')).join('')}
      <div style="font-size:13.5px;margin-top:12px;line-height:1.55;">Khoản nào thực tế chi bằng <b>tiền mặt</b> mà bị ghi nhầm hình thức thì tiền mặt cuối ca sẽ thiếu đúng số đó. Báo Quản lý sửa lại hình thức trước khi đối soát.</div>
    </div>` : ''}
    <div style="display:flex;gap:10px;margin-top:4px;">
      ${caBtn('renderShiftDashboard()', 'back', 'Quay lại', 'plain', 'flex:1;')}
      ${caBtn('beginCloseShiftPOS()', 'lock', 'Kết ca', 'primary', 'flex:1.6;')}
    </div>
  `;
}

// [NEW-GUARD Lớp 3] `canGhiChu` = lần đếm này là lần CUỐI (đã đếm lệch một lần
// rồi). Khi đó hiện thêm ô ghi lý do: lần này đếm xong là chốt, dù còn lệch —
// nên phải lấy được lời giải thích của chính người đang đếm, lúc họ còn nhớ.
// Hiện ô này ở mọi lần đếm thì nó thành một ô trống bị bỏ qua theo thói quen.
function renderShiftCloseCountForm(canGhiChu) {
  const box = document.getElementById('shiftBody');
  _shiftCloseDenoms = cfEmptyDenoms();
  box.innerHTML = `
    <div class="kc-title">Đối soát tiền mặt</div>
    ${shiftState.closing && shiftState.closing.reopeningAfterSaleAt && !shiftState.closing.cashPassedAt ? '<div class="kc-sub" style="margin-bottom:14px;color:#a32946;font-weight:700;">Có bill mới · Đếm lại tiền thực tế trong két.</div>' : ''}
    ${closeSessionBannerPOS()}
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:16px;">Đếm toàn bộ tiền mặt thực tế còn trong két</div>
      <div id="shiftCloseGrid" style="display:flex;flex-direction:column;gap:6px;"></div>
      <div style="text-align:right;font-weight:700;font-size:16px;color:var(--gd);margin-top:10px;" id="shiftCloseTotal">0đ</div>
    </div>
    ${canGhiChu ? `
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:8px;">Ghi chú (không bắt buộc)</div>
      <div style="font-size:12px;color:#999;line-height:1.5;margin-bottom:8px;">Lần đếm cuối — bấm Xác nhận là qua. Nếu biết vì sao lệch thì ghi lại giúp Quản lý; không biết thì để trống.</div>
      <textarea id="shiftCloseNote" rows="3" placeholder="VD: Thối nhầm cho khách 20.000đ lúc trưa, đã báo ca trưởng" style="width:100%;box-sizing:border-box;padding:14px;border:1.5px solid #F0EAD9;background:#FAF8F2;border-radius:18px;font-size:14px;font-family:inherit;line-height:1.5;resize:vertical;outline:none;" oninput="this.style.borderColor='#F0EAD9'"></textarea>
    </div>` : ''}
    <div class="kc-card">${renderPinInput('shiftCloseStaff')}</div>
    ${closeStepNavHTML(1)}
    <button onclick="submitShiftClose()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận kết ca</button>
  `;
  cfRenderDenomGrid('shiftCloseGrid', _shiftCloseDenoms, 'shiftChangeCloseDenom');
}

function shiftChangeCloseDenom(d, delta) {
  const next = (_shiftCloseDenoms[d] || 0) + delta;
  if (next < 0) return;
  _shiftCloseDenoms[d] = next;
  document.getElementById('shiftCloseGrid-qty-' + d).textContent = next;
  document.getElementById('shiftCloseTotal').textContent = cfDenomTotal(_shiftCloseDenoms).toLocaleString('vi-VN') + 'đ';
}

async function submitShiftClose() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitShiftCloseImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitShiftCloseImpl() {
  const staffEmp = await resolveStaffPinWorkedToday('shiftCloseStaff');
  if (!staffEmp) return;
  const staff = staffEmp.fullName;
  const box = document.getElementById('shiftBody');
  // [FIX kẹt kết ca] Ô ghi chú NẰM TRONG #shiftBody — phải đọc nó TRƯỚC khi ghi đè #shiftBody bằng "Đang đối soát...".
  // Trước đây đọc sau → luôn rỗng, nhân viên gõ gì cũng bị báo "ghi rõ lý do" mãi, không bao giờ qua được lần đếm cuối.
  const ghiChuNhap = String((document.getElementById('shiftCloseNote') || {}).value || '').trim();
  box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Đang đối soát...</div>';
  const actualCash = cfDenomTotal(_shiftCloseDenoms);
  let tolerance = 0;
  try {
    const finDoc = await fstore.collection('finance_gieogieo').doc('current').get();
    if (finDoc.exists) tolerance = Number(finDoc.data().cashToleranceAmount) || 0;
  } catch (err) { /* im lặng dùng mặc định 0 — không chặn đối soát */ }
  try {
    await recheckCloseAfterSalesPOS();
    await loadCloseDayOrdersPOS(shiftState.businessDate);
    // [GIAO CA] Ngày đã có giao ca thì đối soát cuối ngày chỉ tính TỪ LẦN GIAO CA
    // GẦN NHẤT. Vẫn tính từ tiền mở ca nghĩa là ca cuối bị chặn kết ca vì khoản
    // thiếu của ca trước — đúng cái tính năng này sinh ra để chữa. Ngày KHÔNG có
    // giao ca thì giữ nguyên công thức cũ, không đổi một con số nào.
    await loadSegmentsPOS(shiftState.businessDate);
    const closeSeg = await ensureOpeningSegmentPOS();
    let expected, closeMetrics = null;
    if (closeSeg && (Number(closeSeg.seq) || 1) > 1) {
      closeMetrics = await computeSegmentExpectedPOS(closeSeg, Date.now());
      expected = closeMetrics.expected;
    } else {
      expected = await computeExpectedCashPOS(shiftState.businessDate, shiftState.opening.openingCash);
    }
    const diff = actualCash - expected; // KHÔNG render biến này ra DOM, chỉ dùng để so sánh
    const passed = Math.abs(diff) <= tolerance;

    // [NEW-GUARD Lớp 3] ĐẾM TỐI ĐA MẤY LẦN.
    //
    // Trước đây vòng "đếm lại" KHÔNG có giới hạn: chưa khớp thì bắt đếm lại, mãi
    // tới khi khớp mới cho kết ca. Hai hậu quả, cả hai đều tệ:
    //   · Người trung thực bị kẹt — lệch 2.000đ do thối nhầm cũng không kết ca được.
    //   · Người muốn gian có thể RÀ: tăng/giảm một mệnh giá rồi thử lại tới khi
    //     hệ thống báo khớp. Mỗi lần thử đều được ghi vào `attempts`, nhưng vì cuối
    //     cùng bao giờ cũng "khớp" nên bản ghi đó thành vô nghĩa.
    //
    // Giờ: đếm tối đa CASH_COUNT_MAX_ATTEMPTS lần. Hết lượt thì GHI NHẬN đúng số
    // đã đếm kèm mức lệch và CHO QUA, trạng thái 'cash_variance_recorded' (khác
    // 'cash_passed' — Quản lý phân biệt được ngay). Số liệu thật thì có ích;
    // một con số khớp do rà ra thì không.
    const closingRef = fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate);
    const soLanTruoc = await closingRef.get()
      .then(d => (d.exists ? (d.data().attempts || []).length : 0))
      .catch(() => 0);
    const hetLuot = !passed && (soLanTruoc + 1) >= CASH_COUNT_MAX_ATTEMPTS;

    // Hết lượt mà chưa khớp → GHI NHẬN đúng số đã đếm và cho qua (chủ dự án chốt 11/10: KHÔNG bắt ghi lý do — lý do không đổi
    // được số tiền đã đếm, bắt nhập chỉ làm kẹt nhân viên). Ghi chú là TUỲ CHỌN: có thì lưu để Quản lý đọc ở màn Tiền mặt.
    const lyDoLech = hetLuot ? ghiChuNhap : '';

    const attempt = { actualCash, expectedCash: expected, variance: diff, passed, staff, staffEmployeeId: staffEmp.id, enteredAt: vnDate().toISOString(), ...(lyDoLech ? { note: lyDoLech } : {}) };
    const chotSo = passed || hetLuot;
    await closingRef.set({
      businessDate: shiftState.businessDate,
      status: passed ? 'cash_passed' : (hetLuot ? 'cash_variance_recorded' : 'pending'),
      attempts: firebase.firestore.FieldValue.arrayUnion(attempt),
      ...(chotSo ? {
        cashPassedAt: vnDate().toISOString(),
        finalActualCash: actualCash, finalExpectedCash: expected, finalVariance: diff,
        closingStaff: staff,
        varianceAccepted: hetLuot || null,
        varianceNote: lyDoLech || null,
        attemptCount: soLanTruoc + 1
      } : {})
    }, { merge: true });
    if (chotSo) {
      // [GIAO CA] Chốt sổ đoạn ca cuối cùng của ngày. Lỗi ở đây KHÔNG được chặn
      // kết ca — tiền đã đối soát xong, bản ghi đoạn ca chỉ là sổ phụ cho Quản lý.
      if (closeSeg) {
        try {
          await fstore.collection(SEG_COLL).doc(segDocId(shiftState.businessDate, closeSeg.seq)).set({
            endAt: vnDate().toISOString(), endType: 'close', endCash: actualCash,
            expectedEndCash: expected, variance: diff, withinTolerance: passed,
            ...(hetLuot ? { varianceAccepted: true, varianceNote: lyDoLech } : {}),
            ...(closeMetrics ? { cashSales: closeMetrics.cashSales, cashExpenses: closeMetrics.cashExpenses, unattributedSales: closeMetrics.unattributedSales || 0 } : {}),
            closingStaff: staff, closingStaffId: staffEmp.id,
            status: 'closed'
          }, { merge: true });
          await closingRef.set({ segmentCount: (Number(closeSeg.seq) || 1), lastSegmentStartCash: Number(closeSeg.startCash) || 0 }, { merge: true });
        } catch (err) { console.warn('[Giao ca] Không ghi được đoạn ca cuối (đã đối soát xong):', err); }
      }
      toast(passed ? '✅ Đã đối soát tiền mặt' : '⚠️ Đã ghi nhận mức lệch — Quản lý sẽ xem lại');
      shiftState.closing = { ...(shiftState.closing || {}), status: passed ? 'cash_passed' : 'cash_variance_recorded',
        cashPassedAt: vnDate().toISOString(), finalActualCash: actualCash, closingStaff: staff };
      proceedAfterCashPass();
    } else {
      toast('⚠️ Số tiền chưa khớp — còn 1 lần đếm');
      box.innerHTML = `
        <div style="text-align:center;padding:24px 16px;">
          <div style="font-size:32px;margin-bottom:8px;">⚠️</div>
          <div style="font-weight:700;font-size:15px;color:var(--td);margin-bottom:8px;">Số tiền chưa khớp</div>
          <div style="font-size:13px;color:#999;line-height:1.6;">Vui lòng đếm lại hoặc kiểm tra các khoản thu/chi trong ngày — có thể có bill bị bỏ sót, chi tiêu chưa ghi, hoặc nhập sai hình thức thanh toán.</div>
          <div style="margin-top:12px;background:#fff7e6;border:1.5px solid #fbbf24;border-radius:14px;padding:12px 14px;font-size:12.5px;font-weight:600;color:#92400e;line-height:1.55;text-align:left;">
            Đây là <b>lần đếm cuối</b>. Lần này đếm xong, dù còn lệch hệ thống vẫn <b>ghi nhận đúng số bạn đếm</b> và cho kết ca. Không cần đếm đi đếm lại cho khớp.
          </div>
        </div>
        <button onclick="renderShiftCloseReview()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;margin-bottom:10px;">← Rà soát lại thu/chi</button>
        <button onclick="renderShiftCloseCountForm(true)" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Đếm lại tiền mặt</button>
      `;
    }
  } catch (err) {
    console.error('submitShiftClose failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
    renderShiftCloseCountForm();
  }
}

// ============================================================
// [NEW] GIAI ĐOẠN 10 — Payment Reconciliation (Chuyển khoản) + Handover
// (POS_Management_Integration_Workflow.md, mục 13 + 15)
//
// [ĐÃ ĐỔI] Bản đầu bắt nhân viên đối soát MÙ cả CHUYỂN KHOẢN (gõ tay tổng tiền từ app ngân
// hàng, chỉ nhận PASS/FAIL). Đã BỎ bước đó: chuyển khoản được chính app ghi nhận ngay lúc bán
// nên không tồn tại "bản đếm độc lập" để đối chiếu — nhân viên chỉ có thể chép lại đúng con số
// app đã biết, trong khi vẫn bị chặn kết ca nếu lệch. Nay hệ thống tự chốt (bankAutoConfirmed),
// nguyên tắc "blind" chỉ còn áp dụng cho TIỀN MẶT — thứ thực sự đếm được và có thể sai lệch.
// Chi tiết lý do: xem _continueAfterPrepCount().
//
// Ghi chú phạm vi (giữ nguyên): POS chỉ có 2 method gốc lúc bán là TIỀN MẶT/CHUYỂN KHOẢN —
// các "ví" là hệ thống nội bộ tự đối chiếu chính xác qua ledger Firestore, không cần đếm/xác
// minh vật lý. orderBankAmountPOS()/computeExpectedBankPOS() bên dưới VẪN DÙNG để tính doanh
// thu chuyển khoản cho Quản lý, chỉ là không còn hỏi nhân viên nữa.
//
// Handover: SAU KHI cả 2 bước trên PASS, tính "Tiền giữ lại"/"Tiền cần bàn giao"
// từ Actual Cash — số này KHÔNG bí mật (đúng mục 15, khác Expected/Variance ở
// mục 12/13) vì chính nhân viên vừa tự đếm ra Actual Cash, hiển thị lại cho họ
// không tiết lộ gì mới.
// ============================================================
function orderBankAmountPOS(o) {
  const adds = o.addons || [];
  const addonTotal = adds.reduce((s,a)=>s+(Number(a.amount)||0),0);
  const addonPaid = adds.filter(a=>(a.method||'').includes('CHUYỂN KHOẢN')).reduce((s,a)=>s+(Number(a.amount)||0),0);
  // splitGroups chỉ chứa tiền gốc; total đã gồm các lần mua bổ sung.
  if(o.method === 'TÍNH RIÊNG') return (o.splitGroups||[]).filter(g=>g.method==='CHUYỂN KHOẢN').reduce((s,g)=>s+(Number(g.total)||0),0)+addonPaid;
  return ((o.method||'').includes('CHUYỂN KHOẢN') ? Math.max(0,(Number(o.total)||0)-addonTotal) : 0)+addonPaid;
}

function computeExpectedBankPOS(businessDate) {
  const displayDate = posDateKeyToDisplay(businessDate);
  return orders.filter(o => o.date === displayDate).reduce((s, o) => s + orderBankAmountPOS(o), 0);
}

// ============================================================
// [NEW] Checklist "chưa refill" ngay tại bước Kết ca — chốt theo yêu cầu người
// dùng: hiện 1 LẦN lúc đóng ngày cửa hàng (không phải mỗi nhân viên check-out
// riêng — mục 2.2 check-in/out là khái niệm khác, không liên quan bước này).
//
// Vì sao đặt NGAY SAU KHI TIỀN MẶT ĐÃ KHỚP (`cash_passed`), trước Bank/Handover:
// đây là bước "chốt sổ" tự nhiên trong ngày — và renderShiftDashboard() đã sẵn
// tự resume đúng vào proceedAfterCashPass() mỗi khi mở lại tab Ca làm việc với
// closing.status==='cash_passed' (xem dòng gần đầu hàm đó) — nghĩa là nếu nhân
// viên rời checklist này để đi Refill thật rồi quay lại, checklist TỰ TÍNH LẠI
// từ đầu, không cần thêm cơ chế điều hướng phức tạp nào khác.
// ============================================================
// ============================================================
// 🆕 KẾ HOẠCH V3 — PHẦN 4: ĐẾM GIAO CA (vấn đề #7 — điểm mù lớn nhất trước đây:
// "ca tối nói bao nhiêu thì tin bấy nhiêu, sáng mai không ai biết có đúng không").
// Chỉ áp dụng cho Refill Rule có mustCount=true (cấu hình ở Quản lý — PHẦN 1 / GĐ1).
//
// Cơ chế ĐẾM MÙ HAI LẦN (PHẦN 4.2–4.5 kế hoạch):
//   Cuối ca: đếm & ghi số thật (closeQty).
//   Đầu ca : đếm LẦN 1, KHÔNG thấy closeQty. Lệch > 5% (sàn 1 đơn vị) so với
//            closeQty → yêu cầu đếm LẦN 2, VẪN MÙ (không thấy lần 1 lẫn closeQty).
//   KHÔNG hỏi lý do — ca sáng KHÔNG chịu trách nhiệm, chỉ đếm và đếm lại (PHẦN
//   4.4). Quản lý nhận cảnh báo trong hộp thư `alerts_gieogieo`, tự tìm nguyên
//   nhân dựa trên 3 con số (closeQty/openQty1/openQty2) — không có ai phải khai.
//
// Vị trí trong pipeline kết ca (PHẦN 5.1): cash_passed → [refill checklist] →
// [ĐẾM GIAO CA] → [ĐẾM BTP] → bank_passed. Đặt SAU checklist refill vì phải
// refill xong quầy mới ở trạng thái cuối cùng để đếm; đặt TRƯỚC đếm BTP theo
// đúng thứ tự đã chốt.
// ============================================================
const HANDOVER_TOLERANCE_PCT = 0.05;

const HANDOVER_TOLERANCE_FLOOR = 1;

// Dung sai 5%, sàn tối thiểu 1 đơn vị (PHẦN 4.5 / PHẦN 9 "Đã chốt") — món số lượng
// nhỏ (vd 10 muỗng) thì 5%=0.5, lệch 1 cái đã vượt ngưỡng nếu không có sàn này.
function handoverIsOverThreshold(diff, base) {
  const nguong = Math.max(HANDOVER_TOLERANCE_FLOOR, Math.abs(base) * HANDOVER_TOLERANCE_PCT);
  return Math.abs(diff) > nguong;
}

// [MỚI] Nạp danh mục nguyên liệu + thư viện dụng cụ cho màn đếm giao ca, để nút
// cân hiện được. Bọc riêng: hỏng thì chỉ mất nút cân, TUYỆT ĐỐI không chặn kết ca.
async function warmHandoverWeighPOS(lines) {
  try {
    await Promise.all([ensureKhoItemsPOS(), ensurePrepVesselsPOS()]);
    preloadVesselImagesForItemsPOS((lines || []).map(l => l.itemId));
  } catch (err) { console.warn('[Đếm giao ca] không nạp được dụng cụ (vẫn gõ tay được):', err); }
}

// Đơn vị trên Refill Rule được CHÉP LẠI lúc tạo rule. Nguyên liệu đổi đơn vị sau
// đó thì rule vẫn giữ đơn vị cũ — cân theo nhầm đơn vị là sai 1000 lần (g ↔ kg),
// mà số này ghi thẳng vào đối chiếu giao ca. Nên chỉ cho cân khi đơn vị của rule
// KHỚP đơn vị hiện tại của nguyên liệu; lệch thì ẩn nút, gõ tay như trước.
function handoverCanWeighPOS(l) {
  const it = (KHO_ITEMS_CACHE || []).find(x => x.id === l.itemId);
  if (!it) return false;
  if (l.unit && it.unit && l.unit !== it.unit) return false;
  return itemCanWeighPOS(l.itemId);
}

// Vì sao chưa có nút cân nào ở màn này — nói ra một dòng kèm đúng đường bật, thay
// vì ẩn im lặng để người dùng tưởng tính năng không tồn tại (cùng lý do với
// prepWeighHintHTML của bán thành phẩm).
function handoverWeighHintHTML() {
  return `<div style="margin:2px 0 10px;padding:9px 11px;background:#fbfaf5;border:1px dashed #ddd6c2;border-radius:11px;font-size:11px;color:#8a8471;line-height:1.55;">
      <b>Cân trừ bì chưa bật cho các món ở đây</b> — đang phải đếm/gõ tay.<br>
      Bật ở app Quản lý: <b>Kho → Dụng cụ đựng</b> khai khay/ca kèm trọng lượng bì, rồi <b>Kho → Nguyên liệu</b> mở từng món, mục <b>"Cân cuối ca"</b> chọn dụng cụ. Chỉ nguyên liệu tính bằng <b>g</b> hoặc <b>kg</b> mới cân trừ bì được.
    </div>`;
}

// ---------- CUỐI CA ----------
async function computeHandoverCloseLinesPOS() {
  const ruleSnap = await refillRulesSnapPOS();
  const rules = ruleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const seen = new Set(); // 1 rule/item, giống giới hạn ở computeRefillChecklistPOS
  const lines = [];
  for (const r of rules) {
    if (!r.mustCount || !(r.countTiming === 'close' || r.countTiming === 'both')) continue;
    if (seen.has(r.itemId)) continue;
    seen.add(r.itemId);
    lines.push({ ruleId: r.id, itemId: r.itemId, itemName: r.itemName, unit: r.unit, locationId: r.destLocationId, locationName: r.destLocationName });
  }
  if (lines.length) await warmHandoverWeighPOS(lines);
  return lines;
}

let _handoverCloseState = [];

function renderHandoverCloseScreen(lines) {
  _handoverCloseState = lines.map(l => ({ ...l, counted: null, weighings: [] }));
  kcStepReset('kcHc');
  renderHandoverCloseCard();
}

function renderHandoverCloseCard() {
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div class="kc-title">Đếm giao ca cuối ca</div>
    ${(shiftState.closing && (shiftState.closing.handoverCloseRecountIds || []).length) ? '<div class="kc-sub" style="margin-bottom:14px;color:#a32946;font-weight:700;">Chỉ đếm lại hàng quầy được bill mới sử dụng.</div>' : ''}
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;">Đếm/cân THỰC TẾ còn lại ở quầy — ca mai đếm lại độc lập để đối chiếu.</div>
      ${_handoverCloseState.some(l => handoverCanWeighPOS(l)) ? '' : handoverWeighHintHTML()}
      <div id="kcHcList" style="margin-top:18px;display:flex;flex-direction:column;gap:12px;">
      ${_handoverCloseState.map((l, i) => {
        const canWeigh = handoverCanWeighPOS(l);
        const done = l.counted !== null;
        return `
        <div class="kc-sub">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
            <span style="font-size:17px;font-weight:800;color:var(--td);">${l.itemName} <span style="font-weight:400;color:#999;font-size:11.5px;">· ${l.locationName}</span></span>
            <div class="kc-pill" style="background:${done ? '#16a34a' : '#E23A5D'};">${done ? (canWeigh ? 'Đã cân xong' : 'Đã đếm') : (canWeigh ? 'Chưa cân' : 'Chưa đếm')}</div>
          </div>
          ${canWeigh ? `
            <button class="btn-reset" onclick="handoverCloseWeigh(${i})" style="width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:14px 8px;border-radius:999px;background:${done ? '#fff' : '#1f1f1f'};color:${done ? '#1f1f1f' : '#fff'};border:1.5px solid #1f1f1f;font-family:'Google Sans',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;">${done ? 'Cân lại' : 'Cân trừ bì'}</button>
            ${done ? `<div style="text-align:center;background:#fff;border:1.5px solid #F0EAD9;border-radius:14px;padding:12px 10px;margin-top:10px;">
              <span style="font-size:30px;font-weight:900;color:var(--td);letter-spacing:-.3px;">${fmtPrepQty(l.counted)}</span>
              <span style="font-size:14px;font-weight:700;color:#999;margin-left:4px;">${l.unit || ''}</span>
            </div>` : ''}
          ` : `
            <div style="display:flex;gap:8px;align-items:center;">
              <div style="flex:1;background:#fff;border:1.5px solid #F0EAD9;border-radius:999px;padding:12px 16px;"><input id="hcQty${i}" type="number" value="${l.counted === null ? '' : l.counted}" inputmode="decimal" step="0.01" placeholder="Đếm được..." style="width:100%;border:none;outline:none;background:transparent;font-family:inherit;font-size:16px;font-weight:700;color:#111;" oninput="handoverCloseSetQty(${i},this.value,true)"></div>
              <span style="font-size:13px;font-weight:800;color:#E23A5D;flex-shrink:0;">${l.unit || ''}</span>
            </div>
          `}
        </div>`;
      }).join('')}
      </div>
      <div id="kcHcNav"></div>
      <div class="kcHc-final">${renderPinInput('handoverCloseStaff')}</div>
    </div>
    ${closeStepNavHTML(4)}
    <button onclick="submitHandoverClose()" class="kc-btn kcHc-final" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận &amp; tiếp tục kết ca</button>
  `;
  kcStepApply('kcHc', _handoverCloseState.length, i => _handoverCloseState[i] && _handoverCloseState[i].counted !== null);
}

// goTay = nhân viên tự gõ đè lên số vừa cân. Bảng kê cân không còn khớp số sắp
// lưu thì bỏ đi, chứ không lưu kèm một bảng kê cộng ra số khác — cùng cách xử lý
// với màn đếm bán thành phẩm.
function handoverCloseSetQty(i, val, goTay) {
  const l = _handoverCloseState[i];
  if (!l) return;
  l.counted = (val === '' || val === null) ? null : (Number(val) || 0);
  kcStepRefresh('kcHc');
  if (goTay && (l.weighings || []).length) {
    const cu = l.weighings.reduce((s, w) => s + (Number(w.net) || 0), 0);
    if (Math.abs(cu - (l.counted || 0)) > 0.005) {
      l.weighings = [];
      const el = document.getElementById('hcWeigh' + i);
      if (el) el.innerHTML = '';
    }
  }
}

function handoverCloseWeigh(i) {
  const l = _handoverCloseState[i];
  if (!l) return;
  openWeighPad({
    itemId: l.itemId, unit: l.unit,
    title: 'Cân ' + (l.itemName || '') + ' còn lại',
    onDone: (total, lines) => {
      l.weighings = lines;
      handoverCloseSetQty(i, total);
      renderHandoverCloseCard();
    }
  });
}

async function submitHandoverClose() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitHandoverCloseImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitHandoverCloseImpl() {
  const missing = _handoverCloseState.filter(l => l.counted === null);
  if (missing.length) { toast(`⚠️ Còn ${missing.length} món chưa đếm`); return; }
  const staffEmp = await resolveStaffPinWorkedToday('handoverCloseStaff');
  if (!staffEmp) return;
  const now = vnDate().toISOString();
  const lines = _handoverCloseState.map(l => ({
    itemId: l.itemId, itemName: l.itemName, unit: l.unit, locationId: l.locationId,
    countedQty: Number(l.counted) || 0, countedAt: now,
    // Bảng kê từng lần cân — để sau này tra được con số này từ đâu ra (mấy khay,
    // bì bao nhiêu), thay vì chỉ có một số trơ không ai kiểm lại được.
    weighings: (l.weighings || [])
  }));
  const previouslyValid = (shiftState.closing && shiftState.closing.handoverCloseLines) || [];
  const refreshedIds = new Set(lines.map(l => l.itemId));
  const completeLines = previouslyValid.filter(l => !refreshedIds.has(l.itemId))
    .map(l => ({ ...l, countedAt: l.countedAt || (shiftState.closing && shiftState.closing.handoverCloseAt) || now }))
    .concat(lines);
  try {
    await fstore.collection('handover_counts_gieogieo').doc(`${shiftState.businessDate}_close`).set({
      businessDate: shiftState.businessDate, phase: 'close', lines: completeLines,
      staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, countedAt: now,
      pendingRecountItemIds: [], supersededAt: null
    });
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      handoverCloseLines: completeLines, handoverCloseAt: now, handoverCloseRecountIds: [],
      handoverCloseBy: staffEmp.fullName, handoverCloseByEmployeeId: staffEmp.id
    }, { merge: true });
    shiftState.closing = shiftState.closing || {};
    shiftState.closing.handoverCloseLines = completeLines;
    shiftState.closing.handoverCloseAt = now;
    shiftState.closing.handoverCloseRecountIds = [];
    // [FIX — "refill hết báo mà không ai biết"] Cùng lý do với đầu ca: số đếm cuối ca
    // THẬT phải chảy ngược lại locationStock ngay, để checklist đóng ngày/gợi ý refill
    // sáng mai không còn dựa vào số cũ đã trôi. Best-effort, không chặn luồng kết ca.
    Promise.allSettled(lines.map(l => UnitEngine.ledger.setLocationStock(l.itemId, l.locationId, l.countedQty, staffEmp.fullName)))
      .then(results => {
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length) console.warn('[Đếm giao ca] đồng bộ locationStock lỗi', failed.map(f => f.reason));
      });
    toast('✅ Đã ghi nhận đếm giao ca');
    await _continueAfterHandoverClose();
  } catch (err) {
    console.error('submitHandoverClose failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

// ---------- ĐẦU CA ----------
// Tìm bản ghi đếm CUỐI CA gần nhất (lùi tối đa 7 ngày, cùng kiểu với
// loadPrevRetainedInfo — quán có thể nghỉ 1-2 ngày) để đối chiếu đếm mù đầu ca.
let _prevHandoverCloseCache = null;

async function loadPrevHandoverCloseInfo() {
  if (_prevHandoverCloseCache !== null) return _prevHandoverCloseCache;
  for (let i = 1; i <= 7; i++) {
    const d = vnDate(); d.setDate(d.getDate() - i);
    const key = posDateKey(d);
    try {
      const snap = await fstore.collection('handover_counts_gieogieo').doc(`${key}_close`).get();
      if (!snap.exists) continue;
      const data = snap.data();
      _prevHandoverCloseCache = { dateKey: key, lines: data.lines || [], staff: data.staff || '', staffEmployeeId: data.staffEmployeeId || '' };
      return _prevHandoverCloseCache;
    } catch (err) {
      console.warn('loadPrevHandoverCloseInfo lỗi (bỏ qua đối chiếu):', err);
      break;
    }
  }
  _prevHandoverCloseCache = false;
  return null;
}

// Bỏ qua nếu hôm nay đã đếm rồi (tránh hỏi lại khi nhân viên ra vào lại tab —
// cùng nguyên tắc idempotent với computePrepCountLinesPOS/prepCountLines).
async function computeHandoverOpenLinesPOS() {
  try {
    const already = await fstore.collection('handover_counts_gieogieo').doc(`${shiftState.businessDate}_open`).get();
    if (already.exists) return [];
  } catch (err) { console.warn('computeHandoverOpenLinesPOS: kiểm tra đã đếm lỗi (vẫn thử tính tiếp):', err); }
  const ruleSnap = await refillRulesSnapPOS();
  const rules = ruleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const seen = new Set();
  const lines = [];
  for (const r of rules) {
    if (!r.mustCount || !(r.countTiming === 'open' || r.countTiming === 'both')) continue;
    if (seen.has(r.itemId)) continue;
    seen.add(r.itemId);
    lines.push({ ruleId: r.id, itemId: r.itemId, itemName: r.itemName, unit: r.unit, locationId: r.destLocationId, locationName: r.destLocationName });
  }
  if (lines.length) await warmHandoverWeighPOS(lines);
  return lines;
}

let _handoverOpenState = [];

let _handoverOpenStateDate = null;

let _handoverOpenStaff = null;

let _handoverOpenRecountIndexes = [];

async function renderHandoverOpenScreen(lines) {
  const prev = await loadPrevHandoverCloseInfo();
  _handoverOpenStateDate = shiftState.businessDate;
  _handoverOpenState = lines.map(l => {
    const prevLine = prev ? (prev.lines || []).find(x => x.itemId === l.itemId) : null;
    return {
      ...l,
      closeQty: prevLine ? (Number(prevLine.countedQty) || 0) : null,
      closeDate: prev ? prev.dateKey : null,
      closeStaff: prev ? prev.staff : '', closeStaffId: prev ? prev.staffEmployeeId : '',
      counted1: null, counted2: null, weighings1: [], weighings2: []
    };
  });
  kcStepReset('kcHo1');
  _renderHandoverOpenStage1();
}

function _renderHandoverOpenStage1() {
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div class="kc-title">Đếm giao ca đầu ca</div>
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;">Đếm thực tế hàng còn ở quầy</div>
      <div id="kcHo1List" style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">
      ${_handoverOpenState.map((l, i) => `
        <div class="kc-sub">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
            <span style="font-size:17px;font-weight:800;color:var(--td);">${l.itemName} <span style="font-size:11.5px;font-weight:400;color:#999;">· ${l.locationName}</span></span>
            <span class="kc-pill" style="background:${l.counted1 === null ? '#E23A5D' : '#16a34a'};">${l.counted1 === null ? 'Chưa đếm' : 'Đã đếm'}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;"><div style="flex:1;background:#fff;border:1.5px solid #F0EAD9;border-radius:999px;padding:12px 16px;"><input id="hoQty${i}" type="number" inputmode="decimal" step="0.01" value="${l.counted1 === null ? '' : l.counted1}" placeholder="Đếm được..." style="width:100%;border:0;outline:none;background:transparent;font:700 16px 'Google Sans',sans-serif;" oninput="handoverOpenSetQty(${i},1,this.value,true)"></div><span style="font-size:13px;font-weight:800;color:var(--gd);">${l.unit || ''}</span></div>
          ${handoverCanWeighPOS(l) ? `<button onclick="handoverOpenWeigh(${i},1)" style="width:100%;margin-top:10px;padding:12px;border-radius:999px;background:#1f1f1f;color:#fff;border:0;font-weight:800;">Cân trừ bì</button>` : ''}
          <div id="hoWeigh1_${i}"></div>
        </div>`).join('')}
      </div>
      <div id="kcHo1Nav"></div>
    </div>
    <div class="kc-card kcHo1-final">
      ${renderPinInput('handoverOpenStaff')}
    </div>
    ${openStepNavHTML(2, "renderOpeningReviewPOS('cash','_renderHandoverOpenStage1()')")}
    <button onclick="submitHandoverOpenStage1()" class="kc-btn kcHo1-final" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận đếm</button>
  `;
  kcStepApply('kcHo1', _handoverOpenState.length, i => _handoverOpenState[i] && _handoverOpenState[i].counted1 !== null);
  _handoverOpenState.forEach((l, i) => {
    if (l.weighings1.length) document.getElementById(`hoWeigh1_${i}`).innerHTML = weighSummaryHTML(l.weighings1, l.unit, `handoverOpenWeigh(${i},1)`);
  });
}

// Hai vòng đếm mù dùng CHUNG một cặp hàm, chỉ khác số vòng (1|2) — chép thành hai
// bản là hai chỗ để lệch nhau khi sửa.
function handoverOpenSetQty(i, vong, val, goTay) {
  const l = _handoverOpenState[i];
  if (!l) return;
  const so = (val === '' || val === null) ? null : (Number(val) || 0);
  if (vong === 1 && l.counted1 !== so) {
    l.counted2 = null;
    l.weighings2 = [];
  }
  const kCount = vong === 2 ? 'counted2' : 'counted1';
  const kWeigh = vong === 2 ? 'weighings2' : 'weighings1';
  l[kCount] = so;
  kcStepRefresh(vong === 2 ? 'kcHo2' : 'kcHo1');
  if (goTay && (l[kWeigh] || []).length) {
    const cu = l[kWeigh].reduce((s, w) => s + (Number(w.net) || 0), 0);
    if (Math.abs(cu - (so || 0)) > 0.005) {
      l[kWeigh] = [];
      const el = document.getElementById(`hoWeigh${vong}_${i}`);
      if (el) el.innerHTML = '';
    }
  }
}

function handoverOpenWeigh(i, vong) {
  const l = _handoverOpenState[i];
  if (!l) return;
  openWeighPad({
    itemId: l.itemId, unit: l.unit,
    title: 'Cân ' + (l.itemName || '') + (vong === 2 ? ' (đếm lại)' : ''),
    onDone: (total, lines) => {
      l[vong === 2 ? 'weighings2' : 'weighings1'] = lines;
      const inp = document.getElementById(vong === 2 ? `hoQty2_${i}` : `hoQty${i}`);
      if (inp) inp.value = total;
      const el = document.getElementById(`hoWeigh${vong}_${i}`);
      if (el) el.innerHTML = weighSummaryHTML(lines, l.unit, `handoverOpenWeigh(${i},${vong})`);
      handoverOpenSetQty(i, vong, total);
    }
  });
}

async function submitHandoverOpenStage1() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitHandoverOpenStage1Impl(); } finally { _posSubmitBusy = false; }
}

async function _submitHandoverOpenStage1Impl() {
  const missing = _handoverOpenState.filter(l => l.counted1 === null);
  if (missing.length) { toast(`⚠️ Còn ${missing.length} món chưa đếm`); return; }
  const staffEmp = await resolveStaffPinAndCheckin('handoverOpenStaff');
  if (!staffEmp) return;
  _handoverOpenStaff = staffEmp;
  // Chỉ xét đếm lại với món CÓ số cuối ca hôm qua để so — món không có (vd
  // countTiming chỉ 'open') thì không có gì đối chiếu, cho qua luôn.
  const needRecount = _handoverOpenState.filter(l => l.closeQty !== null && handoverIsOverThreshold(l.counted1 - l.closeQty, l.closeQty));
  if (needRecount.length) { _renderHandoverOpenStage2(needRecount); return; }
  await _finalizeHandoverOpen();
}

function _renderHandoverOpenStage2(needRecount) {
  const nextIdx = needRecount.map(l => _handoverOpenState.indexOf(l));
  if (String(nextIdx) !== String(_handoverOpenRecountIndexes || '')) kcStepReset('kcHo2');
  _handoverOpenRecountIndexes = nextIdx;
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div class="kc-title">Đếm lại giao ca</div>
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:16px;">${needRecount.length} món cần đếm lại để xác nhận</div>
      <div id="kcHo2List" style="display:flex;flex-direction:column;gap:12px;">
      ${_handoverOpenRecountIndexes.map(idx => {
        const l = _handoverOpenState[idx];
        return `
        <div class="kc-sub">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;"><span style="font-size:17px;font-weight:800;">${l.itemName} <span style="font-size:11.5px;font-weight:400;color:#999;">· ${l.locationName}</span></span><span class="kc-pill" style="background:${l.counted2 === null ? '#E23A5D' : '#16a34a'};">${l.counted2 === null ? 'Chưa đếm' : 'Đã đếm'}</span></div>
          <div style="display:flex;gap:8px;align-items:center;"><div style="flex:1;background:#fff;border:1.5px solid #F0EAD9;border-radius:999px;padding:12px 16px;"><input id="hoQty2_${idx}" type="number" inputmode="decimal" step="0.01" value="${l.counted2 === null ? '' : l.counted2}" placeholder="Đếm lại..." style="width:100%;border:0;outline:none;background:transparent;font:700 16px 'Google Sans',sans-serif;" oninput="handoverOpenSetQty(${idx},2,this.value,true)"></div><span style="font-size:13px;font-weight:800;color:var(--gd);">${l.unit || ''}</span></div>
          ${handoverCanWeighPOS(l) ? `<button onclick="handoverOpenWeigh(${idx},2)" style="width:100%;margin-top:10px;padding:12px;border-radius:999px;background:#1f1f1f;color:#fff;border:0;font-weight:800;">Cân trừ bì</button>` : ''}
          <div id="hoWeigh2_${idx}"></div>
        </div>`;
      }).join('')}
      </div>
      <div id="kcHo2Nav"></div>
    </div>
    ${openStepNavHTML(2, '_renderHandoverOpenStage1()')}
    <button onclick="submitHandoverOpenStage2()" class="kc-btn kcHo2-final" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận &amp; tiếp tục</button>
  `;
  kcStepApply('kcHo2', _handoverOpenRecountIndexes.length, j => {
    const l = _handoverOpenState[_handoverOpenRecountIndexes[j]]; return !!l && l.counted2 !== null; });
  _handoverOpenRecountIndexes.forEach(idx => {
    const l = _handoverOpenState[idx];
    if (l.weighings2.length) document.getElementById(`hoWeigh2_${idx}`).innerHTML = weighSummaryHTML(l.weighings2, l.unit, `handoverOpenWeigh(${idx},2)`);
  });
}

async function submitHandoverOpenStage2() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitHandoverOpenStage2Impl(); } finally { _posSubmitBusy = false; }
}

async function _submitHandoverOpenStage2Impl() {
  const missing = _handoverOpenRecountIndexes.filter(idx => _handoverOpenState[idx].counted2 === null);
  if (missing.length) { toast(`⚠️ Còn ${missing.length} món chưa đếm lại`); return; }
  await _finalizeHandoverOpen();
}

// _finalizeHandoverOpen — điểm ghi DUY NHẤT của đếm đầu ca (cả luồng khớp ngay
// lẫn luồng phải đếm lại), lưu handover_counts_gieogieo + tạo alerts_gieogieo
// cho món vẫn lệch sau khi đã đếm lại (PHẦN 4.6/4.7 kế hoạch V3).
async function _finalizeHandoverOpen() {
  const now = vnDate().toISOString();
  const lines = [];
  const alertJobs = [];
  for (const l of _handoverOpenState) {
    const recountRequired = l.counted2 !== null;
    lines.push({
      itemId: l.itemId, itemName: l.itemName, unit: l.unit, locationId: l.locationId,
      countedQty: l.counted1, countedQty2: l.counted2, recountRequired,
      // Bảng kê từng lần cân của mỗi vòng — để Quản lý tra ngược con số, xem lệch
      // là do cân thiếu một khay hay do hàng hụt thật.
      weighings: (l.weighings1 || []), weighings2: (l.weighings2 || [])
    });
    if (recountRequired && l.closeQty !== null) {
      // Đếm lại lần 2 mà KHỚP lần 1 → ca sáng đếm chuẩn, lệch với ca tối nhiều
      // khả năng là THẬT. Lần 2 mà LỆCH lần 1 → nghi lần đầu đếm vội, lấy lần 2
      // làm số chính thức, giảm nghi vấn (đúng bảng suy luận PHẦN 4.3).
      const recountMatched = !handoverIsOverThreshold(l.counted2 - l.counted1, l.counted1);
      const finalQty = l.counted2;
      const varianceQty = finalQty - l.closeQty;
      const variancePct = l.closeQty !== 0 ? Math.round((varianceQty / l.closeQty) * 1000) / 10 : null;
      alertJobs.push(() => fstore.collection('alerts_gieogieo').add({
        type: 'handover_variance', severity: recountMatched ? 'danger' : 'warning',
        businessDate: shiftState.businessDate, createdAt: now,
        title: `Chênh lệch giao ca — ${l.itemName}`,
        itemId: l.itemId, itemName: l.itemName, unit: l.unit,
        closeQty: l.closeQty, openQty1: l.counted1, openQty2: l.counted2,
        varianceQty, variancePct,
        closeStaff: l.closeStaff || '', closeStaffId: l.closeStaffId || '',
        openStaff: _handoverOpenStaff ? _handoverOpenStaff.fullName : '',
        openStaffId: _handoverOpenStaff ? _handoverOpenStaff.id : '',
        recountMatched, status: 'new'
      }));
    }
  }
  try {
    await fstore.collection('handover_counts_gieogieo').doc(`${shiftState.businessDate}_open`).set({
      businessDate: shiftState.businessDate, phase: 'open', lines,
      staff: _handoverOpenStaff ? _handoverOpenStaff.fullName : '',
      staffEmployeeId: _handoverOpenStaff ? _handoverOpenStaff.id : '',
      countedAt: now
    });
    // Cảnh báo chỉ ghi SAU khi biên bản đã lưu — lưu lỗi rồi bấm lại không tạo cảnh báo trùng.
    if (alertJobs.length) await Promise.allSettled(alertJobs.map(f => f()));
    // [FIX — "refill hết báo mà không ai biết"] Số đếm THẬT vừa xác nhận phải chảy
    // ngược lại locationStock ngay — đóng vòng lặp trôi dần khiến checklist refill và
    // chặn đóng ca tự tin nhầm vào số cũ (xem setLocationStockFromCountPOS). Best-effort:
    // đếm giao ca đã lưu thành công rồi, lỗi ở bước đồng bộ này không được làm hỏng cả
    // luồng mở ca.
    Promise.allSettled(_handoverOpenState.map(l =>
      UnitEngine.ledger.setLocationStock(l.itemId, l.locationId, l.counted2 !== null ? l.counted2 : l.counted1,
        _handoverOpenStaff ? _handoverOpenStaff.fullName : '')
    )).then(results => {
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) console.warn('[Đếm giao ca] đồng bộ locationStock lỗi', failed.map(f => f.reason));
    });
    // 🆕 GĐ4 kế hoạch V3 — PHẦN 3.2b: ghi audit trỏ đúng bản ghi đếm giao ca vừa lưu.
    logAutoChecklistResolved('count_handover', `${shiftState.businessDate}_open`, _handoverOpenStaff);
    toast(alertJobs.length ? `✅ Đã ghi nhận — ${alertJobs.length} món chênh lệch đã báo Quản lý` : '✅ Đã ghi nhận đếm giao ca');
  } catch (err) {
    // Chưa lưu được biên bản → KHÔNG đi tiếp, giữ nguyên số đếm + người đếm trên màn để bấm lại.
    console.error('_finalizeHandoverOpen failed', err);
    toast('❌ Chưa lưu được đếm giao ca: ' + (err.code || err.message || err) + ' — bấm xác nhận lại');
    return;
  }
  _handoverOpenStaff = null;
  await _continueAfterHandoverOpen();
}

// ============================================================
// 🆕 KẾ HOẠCH V3 — PHẦN 5: CHẶN ĐÓNG CA khi thiếu đồ bắt buộc (vấn đề #6).
// Quy tắc PHẦN 5.2 (đã chốt):
//   Món refillTiming='close' + blockingClose=true, dưới min → 🔴 CHẶN đóng ngày.
//   Món 'both' dưới min → chỉ cảnh báo qua checklist refill hiện có (bên dưới),
//     LUÔN cho qua — vì đã có cơ hội bù vào sáng hôm sau (PHẦN 1.2), bất kể có
//     bật blockingClose hay không.
//   Món 'open' dưới min → chỉ ghi nhận, đã có sẵn qua checklist đầu ca
//     `refill_below_min` hôm sau — không cần thêm gì ở đây.
// Luôn có đường thoát "Không refill được — ghi lý do" + PIN (PHẦN 5.3) — chặn
// cứng không lối thoát sẽ khiến nhân viên kẹt lúc 23h và tìm cách lách (đóng
// app, dùng máy khác) — tệ hơn nhiều so với để lại 1 dòng ghi chú có PIN.
// ============================================================
async function computeBlockingRefillItemsPOS() {
  const [ruleSnap, itemSnap] = await Promise.all([
    refillRulesSnapPOS(),
    fstore.collection('inventory_items_gieogieo').get()
  ]);
  const rules = ruleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const seen = new Set();
  const blocking = [];
  for (const r of rules) {
    if (r.refillTiming !== 'close' || !r.blockingClose) continue; // chỉ 'close', KHÔNG áp dụng cho 'both' (xem ghi chú trên)
    const key = r.itemId + ':' + r.destLocationId;
    if (seen.has(key)) continue;
    const item = items.find(x => x.id === r.itemId);
    const cur = (item && item.locationStock && item.locationStock[r.destLocationId]) || 0;
    const min = Number(r.minBase) || 0;
    if (cur >= min) continue;
    seen.add(key);
    blocking.push({ ruleId: r.id, itemId: r.itemId, itemName: r.itemName, unit: r.unit, destLocationName: r.destLocationName, curAtDest: cur, min });
  }
  return blocking;
}

// Bất kỳ override nào ghi hôm nay đều coi là đã xử lý xong việc chặn cho CẢ
// NGÀY hôm đó — đơn giản hoá có chủ đích: tránh lặp lại đúng màn chặn mỗi lần
// nhân viên mở lại tab Ca làm việc trong khi kho tổng vẫn chưa có hàng để bù.
async function hasRefillOverrideTodayPOS() {
  try {
    const doc = await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).get();
    const overrides = (doc.exists && doc.data().refillOverrides) || [];
    return overrides.length > 0;
  } catch (err) { console.warn('hasRefillOverrideTodayPOS lỗi (không chặn vì lỗi mạng):', err); return true; }
}

let _blockingRefillState = [];

function renderBlockingRefillScreen(list) {
  _blockingRefillState = list;
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div class="kc-title">Chặn thiếu đồ bắt buộc</div>
    <div class="kc-card">
      <div style="font-size:24px;font-weight:900;color:var(--td);line-height:1.15;letter-spacing:-.3px;">Chưa thể đóng ngày</div>
      <div style="font-size:14.5px;font-weight:700;color:#c0392b;margin-top:6px;">${list.length} món dưới đây bắt buộc phải refill trước</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:12px;">
        ${list.map(x => `
        <div class="kc-sub">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:17px;font-weight:800;color:var(--td);">${x.itemName}</span>
            <div class="kc-pill" style="background:#c0392b;">Thiếu hàng</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#c0392b;margin-top:8px;">${x.destLocationName}: ${x.curAtDest.toLocaleString('vi-VN')} / tối thiểu ${x.min.toLocaleString('vi-VN')} ${x.unit}</div>
        </div>`).join('')}
      </div>
    </div>
    <button onclick="showScreen('khoScreen'); openRefillScreen();" class="kc-btn" style="border-radius:999px;background:#1f1f1f;color:#fff;margin-bottom:10px;">Refill ngay</button>
    <button onclick="refreshBlockingRefillScreen()" class="kc-btn" style="border-radius:999px;background:#fff;color:var(--td);border:1.5px solid #1f1f1f;padding:14px;margin-bottom:14px;">Đã refill xong — kiểm tra lại</button>
    <button onclick="renderRefillOverrideForm()" style="width:100%;padding:0;background:none;border:none;color:#aaa;font-weight:700;font-size:12.5px;text-decoration:underline;cursor:pointer;margin-bottom:16px;">Không refill được — ghi lý do</button>
    ${closeStepNavHTML(2)}
    <div style="height:22px;"></div>
  `;
}

async function refreshBlockingRefillScreen() {
  const box = document.getElementById('shiftBody');
  box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Đang kiểm tra lại...</div>';
  await proceedAfterCashPass();
}

// Đường thoát PHẦN 5.3 — kho tổng cũng hết hàng thì ép cũng vô ích. Ghi lại đầy
// đủ (món nào, ai, lý do, PIN) để Quản lý xem — KHÔNG xoá nghĩa vụ refill, chỉ
// cho phép đóng ngày tiếp tục.
function renderRefillOverrideForm() {
  const box = document.getElementById('shiftBody');
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Không refill được</div>
      <div style="font-size:12px;color:#999;margin-bottom:10px;line-height:1.6;">Chỉ dùng khi kho tổng cũng đã hết hàng — ép refill lúc này cũng vô ích. Quản lý sẽ thấy lý do này kèm tên và giờ.</div>
      ${_blockingRefillState.map(x => `<div style="font-size:12.5px;color:var(--td);padding:4px 0;">• ${x.itemName} — còn ${x.curAtDest.toLocaleString('vi-VN')}/${x.min.toLocaleString('vi-VN')} ${x.unit}</div>`).join('')}
      <div class="wal-input-label" style="margin:10px 0 6px;">Lý do</div>
      <div class="wal-input-group" style="margin-bottom:0;">
        <input id="refillOverrideReason" type="text" placeholder="VD: kho tổng cũng hết, đã đặt hàng thêm">
      </div>
      ${renderPinInput('refillOverrideStaff')}
    </div>
    <button onclick="confirmRefillOverride()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Xác nhận bỏ qua</button>
    <button onclick="refreshBlockingRefillScreen()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px;">← Quay lại</button>
  `;
}

async function confirmRefillOverride() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const reason = (document.getElementById('refillOverrideReason').value || '').trim();
  if (!reason) { toast('⚠️ Phải ghi lý do'); return; }
  _posSubmitBusy = true;
  try {
    const staffEmp = await resolveStaffPinWorkedToday('refillOverrideStaff');
    if (!staffEmp) return;
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      refillOverrides: firebase.firestore.FieldValue.arrayUnion({
        items: _blockingRefillState.map(x => ({ itemId: x.itemId, itemName: x.itemName, curAtDest: x.curAtDest, min: x.min, destLocationName: x.destLocationName })),
        reason, staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, confirmedAt: vnDate().toISOString()
      })
    }, { merge: true });
    toast('⏭️ Đã ghi nhận — Quản lý sẽ thấy lý do này');
    await _proceedAfterBlockingCheck();
  } catch (err) {
    console.error('confirmRefillOverride failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  } finally { _posSubmitBusy = false; }
}

async function proceedAfterCashPass() {
  if (!(await hasRefillOverrideTodayPOS())) {
    let blocking = [];
    try { blocking = await computeBlockingRefillItemsPOS(); }
    catch (err) { console.warn('computeBlockingRefillItemsPOS lỗi (bỏ qua chặn, không giữ chân nhân viên vì lỗi mạng):', err); }
    if (blocking.length) { renderBlockingRefillScreen(blocking); return; }
  }
  await _proceedAfterBlockingCheck();
}

async function _proceedAfterBlockingCheck() {
  let checklist = [];
  try { checklist = await computeRefillChecklistPOS(); }
  catch (err) { console.warn('computeRefillChecklistPOS lỗi (bỏ qua checklist, không chặn kết ca vì lỗi mạng):', err); }
  if (checklist.length) { renderRefillChecklistScreen(checklist); return; }
  await _continueAfterCashPass();
}

// computeRefillChecklistPOS — luôn tải MỚI rules + items (không dùng cache cũ)
// để có unrefilledConsumption chính xác nhất tại đúng thời điểm kết ca.
async function computeRefillChecklistPOS() {
  const [ruleSnap, itemSnap] = await Promise.all([
    refillRulesSnapPOS(),
    fstore.collection('inventory_items_gieogieo').get()
  ]);
  const rules = ruleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const seenItemIds = new Set(); // giới hạn: chỉ xét rule ĐẦU TIÊN tìm thấy cho mỗi nguyên liệu (xem ghi chú applyStockTransactionPOS)
  const list = [];
  for (const rule of rules) {
    if (seenItemIds.has(rule.itemId)) continue;
    const item = items.find(x => x.id === rule.itemId);
    if (!item) continue;
    const packUnit = getBiggestPackagingUnitPOS(item);
    if (!packUnit) continue; // chưa khai quy cách đóng gói → không có gì để so sánh, bỏ qua nguyên liệu này
    seenItemIds.add(rule.itemId);
    const unrefilled = Number((item.unrefilledConsumption || {})[rule.destLocationId]) || 0;
    // [NEW — theo phản hồi người dùng] "Nghi ngờ" (vừa có hao hụt ghi nhận, chưa refill lại)
    // LUÔN vào checklist BẤT KỂ số liệu unrefilled đã vượt ngưỡng hay chưa — vì chính số liệu
    // đó đã mất căn cứ kể từ lần hao hụt, không thể dùng ngưỡng để quyết định có hỏi hay không.
    const isUncertain = !!(item.refillUncertain || {})[rule.destLocationId];
    const overThreshold = unrefilled >= packUnit.baseQty;
    if (isUncertain || overThreshold) {
      list.push({
        itemId: item.id, itemName: item.name, destLocationName: rule.destLocationName,
        unrefilled, packLabel: packUnit.label, timesOver: Math.floor(unrefilled / packUnit.baseQty),
        isUncertain, minDurationSec: Math.max(0, Number(rule.minDurationSec) || 0)
      });
    }
  }
  return list;
}

let _refillChecklistState = [];

let _refillCountdownInterval = null;

function _refillClearCountdown() { if (_refillCountdownInterval) { clearInterval(_refillCountdownInterval); _refillCountdownInterval = null; } }

// [MỚI] Khoá thời gian tối thiểu cho MÀN NÀY — lấy số LỚN NHẤT trong các rule đang
// hiện (VD ly PP 500 đặt 60s, ly PP 700 đặt 90s thì cả màn khoá 90s). Đúng ca dùng:
// trước đây chỉ cần tick checkbox là qua ngay, kể cả khi không thật sự đi đếm/kiểm
// tra — không có gì buộc nhân viên phải đứng lại đủ lâu để làm thật.
async function renderRefillChecklistScreen(list) {
  _refillChecklistState = list;
  _refillClearCountdown();
  const box = document.getElementById('shiftBody');
  const requiredSec = list.reduce((m, r) => Math.max(m, Number(r.minDurationSec) || 0), 0);
  await clEnsureStarted('close', 'refillcheck', 'Kiểm tra Refill', requiredSec);
  box.innerHTML = `
    <div class="kc-title">Kiểm tra Refill</div>
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;">Món đã bán hết 1 lần đóng gói mà chưa Refill, hoặc vừa có hao hụt nên cần tự kiểm tra lại.</div>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">
      ${list.map((r, idx) => `
        <div class="kc-sub">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
            <span style="font-size:16px;font-weight:800;color:var(--td);">${r.itemName}</span>
            <div class="kc-pill" style="background:${r.isUncertain ? '#c2703c' : '#E23A5D'};">${r.isUncertain ? 'Cần kiểm tra' : 'Chưa refill'}</div>
          </div>
          <div style="font-size:12.5px;color:#999;margin-bottom:10px;">${r.isUncertain
            ? `Vừa có hao hụt tại ${r.destLocationName} — số liệu không còn đáng tin, cần tự kiểm tra thực tế.`
            : `Đã bán tương đương ${r.timesOver} ${r.packLabel} tại ${r.destLocationName}.`}</div>
          <label style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:#999;font-weight:700;cursor:pointer;">
            <input type="checkbox" class="kc-chk" id="refillOk${idx}" onchange="refillChecklistUpdateContinueState()">
            ${r.isUncertain ? 'Đã kiểm tra thực tế — ổn, sẽ refill khi cần' : 'Đã kiểm tra — sẽ refill ngay sau kết ca'}
          </label>
        </div>`).join('')}
      </div>
      <button onclick="showScreen('khoScreen'); openRefillScreen();" class="kc-btn" style="border-radius:999px;background:#fff;color:var(--td);border:1.5px solid #1f1f1f;padding:13px;font-size:13.5px;margin-top:14px;">Mở màn Refill ngay</button>
    </div>
    ${closeStepNavHTML(3)}
    <div id="refillCountdownNote" style="font-size:11.5px;color:#b45309;margin-bottom:8px;line-height:1.5;"></div>
    <button id="refillChecklistContinueBtn" onclick="continueAfterRefillChecklist()" disabled class="kc-btn" style="background:#f1eee4;color:#bbb;margin-bottom:22px;cursor:not-allowed;">Tiếp tục kết ca</button>
  `;
  refillChecklistUpdateContinueState();
  if (requiredSec > 0 && clRemainingSec('close', 'refillcheck') > 0) {
    _refillCountdownInterval = setInterval(() => {
      refillChecklistUpdateContinueState();
      if (clRemainingSec('close', 'refillcheck') <= 0) _refillClearCountdown();
    }, 1000);
  }
}

function refillChecklistUpdateContinueState() {
  const btn = document.getElementById('refillChecklistContinueBtn');
  if (!btn) return;
  const allChecked = _refillChecklistState.every((_, idx) => document.getElementById('refillOk' + idx)?.checked);
  const remain = clRemainingSec('close', 'refillcheck');
  const note = document.getElementById('refillCountdownNote');
  if (note) note.innerHTML = remain > 0 ? `⏱️ Cần thêm ${remain}s nữa mới bấm tiếp tục được — dùng thời gian này để thật sự kiểm tra/refill, không chỉ tick cho qua.` : '';
  const ok = allChecked && remain <= 0;
  btn.disabled = !ok;
  btn.textContent = remain > 0 ? `Còn ${remain}s…` : 'Tiếp tục kết ca';
  btn.style.background = ok ? 'var(--gd)' : '#ddd';
  btn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

async function continueAfterRefillChecklist() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  if (clRemainingSec('close', 'refillcheck') > 0) { toast('⏳ Chưa đủ thời gian tối thiểu ở màn này'); return; }
  _posSubmitBusy = true;
  _refillClearCountdown();
  try {
    await clLogComplete('close', 'refillcheck', null);
    // Ghi log việc nhân viên đã CHỦ ĐỘNG xác nhận bỏ qua refill lúc kết ca — không xoá
    // nghĩa vụ refill, chỉ để Management xem lại được: hệ thống ĐÃ cảnh báo, và ai là
    // người xác nhận bỏ qua cho nguyên liệu nào, tránh tình huống đổ lỗi ngược sau này.
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      refillChecklistOverrides: firebase.firestore.FieldValue.arrayUnion({
        items: _refillChecklistState.map(r => ({ itemId: r.itemId, itemName: r.itemName, unrefilled: r.unrefilled, destLocationName: r.destLocationName, isUncertain: !!r.isUncertain })),
        staff: (shiftState.closing && shiftState.closing.closingStaff) || '', confirmedAt: vnDate().toISOString()
      })
    }, { merge: true });
  } catch (err) {
    console.warn('Ghi log refillChecklistOverrides thất bại (không chặn kết ca vì lỗi này):', err);
  }
  // Luôn nhả khoá, kể cả khi bước chuyển tiếp lỗi — nếu không thanh toán/tạo bill bị từ chối "Đang xử lý…" cho tới khi tải lại app.
  try { await _continueAfterCashPass(); }
  catch (err) {
    console.error('continueAfterRefillChecklist: chuyển bước lỗi', err);
    toast('❌ Chưa chuyển được sang bước tiếp theo — bấm lại để thử');
  } finally { _posSubmitBusy = false; }
}

// ============================================================
// [GĐ3] ĐẾM BÁN THÀNH PHẨM CUỐI NGÀY
//
// Vì sao BẮT BUỘC phải đếm tay chứ không tin số hệ thống:
// BTP hao hụt nhiều theo cách không ghi nhận được (dính nồi, đổ, nếm thử, múc
// dư tay) nên số lý thuyết LUÔN cao hơn thực tế. Nếu lấy số hệ thống làm tồn
// đầu ngày hôm sau thì checklist sẽ báo "còn đủ, không cần nấu" trong khi thực
// tế đã hết — đúng loại lỗi làm hỏng cả tính năng chuẩn bị hàng.
//
// Đếm MÙ (không hiện số hệ thống) — cùng nguyên tắc với kiểm kê kho và đối soát
// tiền mặt đã có: thấy số trước thì nhân viên gõ theo số đó thay vì cân thật.
//
// Đặt SAU checklist refill, TRƯỚC đối soát bank: refill xong thì quầy mới ở
// trạng thái cuối cùng để đếm; còn đặt trước bank để nếu nhân viên bỏ dở thì
// renderShiftDashboard() vẫn resume đúng vào proceedAfterCashPass() như cũ.
// ============================================================
async function _continueAfterCashPass() {
  // 🆕 GĐ3 kế hoạch V3 — PHẦN 4/5.1: đếm giao ca cuối ca, đứng GIỮA checklist
  // refill và đếm BTP. Chỉ hiện 1 lần/ngày — đã có handoverCloseLines thì đi
  // tiếp luôn (cùng nguyên tắc idempotent với bước đếm BTP ngay bên dưới).
  if (!(shiftState.closing && shiftState.closing.handoverCloseLines) ||
      (shiftState.closing.handoverCloseRecountIds || []).length) {
    let lines = [];
    const redo = (shiftState.closing && shiftState.closing.handoverCloseRecountIds) || [];
    try { lines = await computeHandoverCloseLinesPOS(); }
    catch (err) {
      if (redo.length) {
        document.getElementById('shiftBody').innerHTML = '<div class="kc-card">Không tải được danh sách hàng cần đếm lại.</div><button onclick="_continueAfterCashPass()" class="kc-btn" style="background:var(--gd);color:#fff;">Thử lại</button>';
        return;
      }
      console.warn('computeHandoverCloseLinesPOS lỗi (bỏ qua, không chặn kết ca vì lỗi mạng):', err);
    }
    if (redo.length) lines = lines.filter(l => redo.includes(l.itemId));
    if (lines.length) { renderHandoverCloseScreen(lines); return; }
    if (redo.length) {
      await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate)
        .set({ handoverCloseRecountIds: [] }, { merge: true });
      shiftState.closing.handoverCloseRecountIds = [];
    }
  }
  await _continueAfterHandoverClose();
}

async function _continueAfterHandoverClose() {
  // Bước đếm BTP chỉ hiện 1 lần — đã đếm rồi (có prepCountLines) thì đi tiếp luôn,
  // tránh bắt đếm lại khi nhân viên quay ra quay vào tab Ca làm việc.
  if (!(shiftState.closing && shiftState.closing.prepCountLines) ||
      (shiftState.closing.prepCountRecountIds || []).length) {
    let lines = [];
    const redo = (shiftState.closing && shiftState.closing.prepCountRecountIds) || [];
    try { lines = await computePrepCountLinesPOS(); }
    catch (err) {
      if (redo.length) {
        document.getElementById('shiftBody').innerHTML = '<div class="kc-card">Không tải được bán thành phẩm cần cân lại.</div><button onclick="_continueAfterHandoverClose()" class="kc-btn" style="background:var(--gd);color:#fff;">Thử lại</button>';
        return;
      }
      console.warn('computePrepCountLinesPOS lỗi (bỏ qua, không chặn kết ca vì lỗi mạng):', err);
    }
    if (redo.length) lines = lines.filter(l => redo.includes(l.prepId));
    if (lines.length) { renderPrepCountScreen(lines); return; }
    if (redo.length) {
      await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate)
        .set({ prepCountRecountIds: [] }, { merge: true });
      shiftState.closing.prepCountRecountIds = [];
    }
  }
  await _continueAfterPrepCount();
}

// Gom các lô còn mở của hôm nay + lô cũ chưa dùng hết. Gộp theo BTP để biết tổng,
// nhưng [FIX] vẫn giữ activeBatches (đã sort CŨ -> MỚI theo finishedAt) tách riêng
// để màn đếm cho nhân viên đếm/nhập ĐÚNG TỪNG LÔ theo tem — không gộp mù thành 1 số
// rồi để thuật toán đoán, vì đoán sai hướng là đúng nguyên nhân gây lệch lô (xem
// renderPrepCountScreen bên dưới).
async function computePrepCountLinesPOS() {
  // [MỚI] Luồng kết ca KHÔNG đi qua màn Chế biến nên PREP_ITEMS_CACHE_POS có thể
  // còn rỗng — mà vesselsForPrepPOS() đọc vesselIds/unit từ đó. Không nạp thì nút
  // cân im lặng không hiện, đúng kiểu lỗi "lúc có lúc không" khó lần nhất.
  // Bọc riêng: hỏng phần này thì chỉ mất nút cân, KHÔNG được chặn kết ca.
  try {
    if (!PREP_ITEMS_CACHE_POS.length) {
      const psnap = await fstore.collection('prep_items_gieogieo').get();
      PREP_ITEMS_CACHE_POS = psnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    await ensurePrepVesselsPOS();
  } catch (err) { console.warn('[Đếm BTP] không nạp được dụng cụ (vẫn gõ tay được):', err); }

  const snap = await fstore.collection('prep_batches_gieogieo')
    .where('status', 'in', ['active', 'cooking']).get();
  const batches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const byPrep = {};
  const now = vnDate();
  batches.forEach(b => {
    const k = b.prepId;
    if (!byPrep[k]) byPrep[k] = { prepId: k, prepName: b.prepName, unit: b.unit, batches: [], sysQty: 0, hasExpired: false, hasCooking: false };
    byPrep[k].batches.push(b);
    if (b.status === 'cooking') { byPrep[k].hasCooking = true; return; }
    byPrep[k].sysQty += Number(b.qtyRemaining) || 0;
    // Hết hạn = quá mốc giờ, HOẶC loại 'endOfDay' (đóng ngày là hết hạn)
    if (b.shelfLifeType === 'endOfDay' || (b.expiresAt && vnDate(b.expiresAt) <= now)) byPrep[k].hasExpired = true;
  });
  const lines = Object.values(byPrep);
  lines.forEach(l => {
    // [FIX] activeBatches: CHỈ lô 'active' (không lấy 'cooking'), sort tăng dần
    // theo finishedAt — lô nấu xong sớm nhất đứng đầu. Đây là nguồn duy nhất
    // quyết định thứ tự hiển thị các lô, và ≥2 lô là điều kiện bắt buộc cân
    // riêng từng lô ở màn đếm cuối ca.
    l.activeBatches = l.batches.filter(b => b.status === 'active')
      .sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')));
  });
  return lines.sort((a, b) => String(a.prepName || '').localeCompare(String(b.prepName || ''), 'vi'));
}

// ══════════════════════════════════════════════════════════════════════════
// [BTP — ÂM CHỜ ĐỐI CHIẾU] Bán vượt lô / bán khi chưa có lô → khoản âm (pendingShortage),
// KHÔNG trừ vào lô mới nấu (lô mới = đúng số cân). Mọi so sánh dồn về cuối ca, khi đã có
// số cuối cùng của cả BTP (cân BTP cuối ca) lẫn NL (kiểm kê cuối ca):
//   1. Cân BTP: chụp khoản âm của từng BTP TRƯỚC khi bước cân xoá nó (prepShortageCollect),
//      lưu vào daily_closings.prepShortage.
//   2. Sau kiểm kê NL cuối ca (trước bàn giao tiền): với mỗi nguồn thiếu —
//        · BTP âm: lô nấu hôm nay cân ra THIẾU so với định lượng chuẩn (batchYield × tỷ lệ
//          mẻ) đúng cỡ khoản âm (±5% định lượng chuẩn) → đã lấy từ nồi mới, hợp lệ;
//        · NL dùng thẳng bán lúc không có tem mở (Sổ lệch trong ngày);
//      phần chưa giải thích được đem so với các loại "được phép bù" (cấu hình ở quanlygieo,
//      substitutes = [{kind:'prep'|'item', id, ratio}]) mà SAU KHI ĐẾM/CÂN cuối ca bị HỤT →
//      HỎI NHÂN VIÊN "đã dùng loại này để bù đúng không?".
//   3. Nhân viên trả lời → ghi prep_shortage_recons_gieogieo, chờ Quản lý xác nhận (lúc đó
//      mới tính lại giá vốn). NL dùng để bù được trừ vào tem đang mở ngay khi nhân viên xác
//      nhận — đó là hàng đã dùng thật, số kiểm kê cuối ca vừa đếm đã phản ánh việc này.
// ══════════════════════════════════════════════════════════════════════════
const PREP_SHORTAGE_RECON_COLL = 'prep_shortage_recons_gieogieo';

const PREP_SHORTAGE_TOL_PCT = 5;

// Cấu hình cũ chỉ có {prepId, ratio} (BTP bù BTP) — đọc như kind 'prep'.
function prepSubNorm(x) {
  return { kind: x.kind === 'item' ? 'item' : 'prep', id: x.id || x.prepId, ratio: Number(x.ratio) > 0 ? Number(x.ratio) : 1 };
}

// Chụp khoản âm của MỌI BTP TRƯỚC khi bước cân ghi đè RT/lô (cân xong là âm về 0).
async function prepShortageCollect() {
  const itemsSnap = await fstore.collection('prep_items_gieogieo').get();
  const shortage = {};
  await Promise.all(itemsSnap.docs.map(async d => {
    const p = d.data();
    let neg = 0;
    try {
      const rt = (await UnitEngine.units.ref(d.id).once('value')).val() || {};
      Object.keys(rt).forEach(k => { if (k !== '__prepLock') neg += Math.min(0, Number(rt[k] && rt[k].unitBase) || 0); });
    } catch (err) { neg = -(Number(p.pendingShortage) || 0); }
    const S = round2(Math.max(0, -(neg + Math.min(0, Number(p.untrackedPendingDelta) || 0))));
    if (S > 0.005) shortage[d.id] = S;
  }));
  return shortage;
}

// Hàm THUẦN — dựng danh sách nguồn thiếu + ứng viên bù từ số cuối ca.
//   data.shortage   {prepId: S}                 — chụp lúc cân BTP
//   data.preps      {id: prep_items}            data.nls {id: inventory_items}
//   data.lotsByPrep {prepId: [lô nấu hôm nay]}  data.nlShort {itemId: {qty, ids}}
//   data.prepVar    {prepId: đếm − sổ}          data.nlVar {itemId: đếm − sổ}  (âm = hụt)
function prepShortageBuild(data) {
  const { shortage, preps, nls, lotsByPrep, nlShort, prepVar, nlVar } = data;
  const tolPct = PREP_SHORTAGE_TOL_PCT / 100;
  const candidatesFor = (subs, R) => (subs || []).map(prepSubNorm).map(x => {
    const o = x.kind === 'item' ? nls[x.id] : preps[x.id];
    const v = x.kind === 'item' ? nlVar[x.id] : prepVar[x.id];
    if (!o || v === undefined || !(v < 0)) return null;           // chỉ loại HỤT sau đếm/cân cuối ca
    const need = round2(R * x.ratio), short = round2(-v);
    return { kind: x.kind, id: x.id, name: o.name || '', unit: o.unit || '', ratio: x.ratio,
      need, short, costPerUnit: Number(o.costPerUnit) || 0 };
  }).filter(Boolean).sort((a, b) => Math.abs(a.short - a.need) - Math.abs(b.short - b.need));
  const out = [];
  Object.keys(shortage || {}).forEach(prepId => {
    const p = preps[prepId] || {};
    const S = shortage[prepId];
    const lots = (lotsByPrep[prepId] || []).map(b => {
      const ratio = Number(b.batchRatio) || 1;
      const expected = round2(Number(b.declaredYieldTotal) > 0 ? Number(b.declaredYieldTotal) : (Number(p.batchYield) || 0) * ratio);
      const actual = round2(Number(b.qtyInitial) || 0);
      return { batchId: b.id, code: b.batchCode || '', ratio, expected, actual, shortfall: round2(Math.max(0, expected - actual)) };
    }).filter(l => l.expected > 0);
    const expectedTotal = lots.reduce((a, l) => a + l.expected, 0);
    const tol = round2(tolPct * (expectedTotal > 0 ? expectedTotal : (Number(p.batchYield) || 0)));
    const F = round2(lots.reduce((a, l) => a + l.shortfall, 0));
    const explained = (F > 0 && Math.abs(F - S) <= tol) ? S : round2(Math.min(S, F));
    const R = round2(S - explained);
    const candidates = R > tol ? candidatesFor(p.substitutes, R) : [];
    out.push({
      sourceKind: 'prep', prepId, prepName: p.name || '', unit: p.unit || '', costPerUnit: Number(p.costPerUnit) || 0,
      shortageQty: S, lots, newLotShortfall: F, tolerance: tol, explainedByNewLot: explained, remainder: R,
      status: R <= tol ? 'explained' : (candidates.length ? 'ask' : 'unexplained'), candidates
    });
  });
  Object.keys(nlShort || {}).forEach(itemId => {
    const it = nls[itemId];
    if (!it || !(it.substitutes || []).length) return; // không cấu hình bù — khoản này đã nằm ở Sổ lệch tem
    const Q = nlShort[itemId].qty;
    const candidates = candidatesFor(it.substitutes, Q);
    out.push({
      sourceKind: 'item', prepId: itemId, prepName: it.name || '', unit: it.unit || '', costPerUnit: Number(it.costPerUnit) || 0,
      shortageQty: Q, lots: [], newLotShortfall: 0, tolerance: 0, explainedByNewLot: 0, remainder: Q,
      status: candidates.length ? 'ask' : 'unexplained', candidates, anomalyIds: nlShort[itemId].ids
    });
  });
  return out;
}

// Chia phần hụt của các loại nhân viên xác nhận đã dùng để bù cho một nguồn; phần hụt đã gán
// cho nguồn trước thì không gán lại (usedShort dùng chung cả lượt).
function prepShortageAllocate(r, picked, usedShort) {
  let left = r.remainder;
  const subs = [];
  picked.forEach(c => {
    if (!(left > 0.005)) return;
    const key = c.kind + ':' + c.id;
    const avail = round2(c.short - (usedShort[key] || 0));
    const qty = round2(Math.min(avail, left * c.ratio));
    if (!(qty > 0.005)) return;
    usedShort[key] = round2((usedShort[key] || 0) + qty);
    left = round2(left - qty / c.ratio);
    subs.push({ kind: c.kind, id: c.id, prepId: c.id, prepName: c.name, unit: c.unit, ratio: c.ratio,
      expectedQty: qty, observedShortQty: c.short, costPerUnit: c.costPerUnit, coversQty: round2(qty / c.ratio) });
  });
  return { subs, uncovered: Math.max(0, left) };
}

// B. Hàm THUẦN: các lượt bán BTP KHÔNG trừ được lô nào (dòng CONSUMPTION không có unitAllocations) trong (fromMs, toMs],
// bỏ bill đã huỷ (có dòng hoàn reversal cùng referenceId).
function prepUntrackedSales(rows, fromMs, toMs) {
  const rev = new Set((rows || []).filter(t => String(t.type || '').toUpperCase() === 'ADJUSTMENT' && t.reversal === true).map(t => t.referenceId).filter(Boolean));
  const events = (rows || []).filter(t => String(t.type || '').toUpperCase() === 'CONSUMPTION' && !(t.unitAllocations || []).length && !t.prepRecon && !(t.referenceId && rev.has(t.referenceId)))
    .map(t => ({ at: t.createdAt || '', ms: Date.parse(t.createdAt || ''), qty: Math.abs(Number(t.qty) || 0), ref: t.referenceId || t.id }))
    .filter(e => e.qty > 0 && Number.isFinite(e.ms) && e.ms > fromMs && e.ms <= toMs).sort((a, b) => a.ms - b.ms);
  return { events, qty: round2(events.reduce((a, e) => a + e.qty, 0)) };
}

let _prepUntrackedAsk = null;

// Gọi trong _doCheckOutImpl. true = đang hiện câu hỏi (chưa check-out). Lỗi đọc → không chặn check-out.
async function prepUntrackedAskOnCheckOut(emp, shift) {
  const day = posDateKey();
  let preps;
  try { preps = (await fstore.collection('prep_items_gieogieo').where('untrackedPendingDelta', '<', 0).get()).docs.map(d => ({ id: d.id, ...d.data() })); }
  catch (err) { console.warn('[BTP âm] không đọc được BTP bán không lô — không chặn check-out', err); return false; }
  if (!preps.length) return false;
  const fromMs = Date.parse(shift.checkedInAt || ''), toMs = Date.now(), rows = [];
  for (const p of preps) {
    try {
      const recId = (day + '_' + p.id).replace(/[^\w\-]/g, '_');
      const [tx, rec] = await Promise.all([fstore.collection('prep_transactions_gieogieo').where('prepId', '==', p.id).where('businessDate', '==', day).get(),
        fstore.collection(PREP_SHORTAGE_RECON_COLL).doc(recId).get()]);
      const r = rec.exists ? rec.data() : {};
      if ((r.checkoutAnswers || {})[shift.id] || ['substitution_confirmed', 'dismissed'].includes(r.status)) continue;
      const u = prepUntrackedSales(tx.docs.map(d => ({ id: d.id, ...d.data() })), Number.isFinite(fromMs) ? fromMs : 0, toMs);
      if (u.qty > 0.005) rows.push({ p, recId, ...u, subs: (p.substitutes || []).map(prepSubNorm) });
    } catch (err) { console.warn('[BTP âm] bỏ qua câu hỏi của', p.id, err); }
  }
  if (!rows.length) return false;
  const need = [...new Set(rows.flatMap(r => r.subs.map(s => s.kind + ':' + s.id)))];
  const names = {};
  await Promise.all(need.map(async k => { const [kind, id] = k.split(':');
    try { const d = await fstore.collection(kind === 'item' ? 'inventory_items_gieogieo' : 'prep_items_gieogieo').doc(id).get(); names[k] = d.exists ? (d.data().name || id) : id; } catch (e) { names[k] = id; } }));
  rows.forEach(r => { r.subs = r.subs.map(s => ({ ...s, name: names[s.kind + ':' + s.id] || s.id })); });
  _prepUntrackedAsk = { emp, shift, day, rows, answers: {} };
  renderPrepUntrackedAsk();
  return true;
}

function renderPrepUntrackedAsk() {
  const st = _prepUntrackedAsk; if (!st) return;
  document.getElementById('prep-untracked-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'prep-untracked-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px);';
  // Cùng hệ thẻ với các bước kết ca / cân cuối ca: kc-card, lựa chọn là kc-sub, nút tròn kc-chk, nút gửi kc-btn.
  const opt = (i, val, label) => `<label class="kc-sub" style="display:flex;align-items:center;gap:10px;padding:12px 14px;margin-top:8px;cursor:pointer;${st.answers[i] === val ? 'border-color:var(--gd);background:#fff' : ''}">
      <input type="radio" class="kc-chk" name="pua${i}" ${st.answers[i] === val ? 'checked' : ''} onchange="_prepUntrackedAsk.answers[${i}]='${val}';renderPrepUntrackedAsk()" style="min-height:0;margin:0"><span style="font-size:14px">${label}</span></label>`;
  ov.innerHTML = `<div class="kc-card" style="width:100%;max-width:480px;max-height:92vh;overflow:auto;margin:0;animation:pi .18s ease;">
    <div class="kc-title" style="padding-bottom:6px">Trả lời trước khi check-out</div>
    <div style="font-size:13px;color:#555;margin-bottom:6px">Trong ca của ${escHtmlPos(st.emp.fullName || '')} có bán món cần bán thành phẩm lúc <b>không còn lô nào</b>. Lúc đó đã làm thế nào?</div>
    ${st.rows.map((r, i) => `<div style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">${escHtmlPos(r.p.name || '')}</b><span class="kc-pill" style="background:#e23a5d">${fmtPrepQty(r.qty)} ${escHtmlPos(r.p.unit || '')}</span></div>
      <div style="font-size:12px;color:#888;margin-top:2px">Lúc ${r.events.slice(0, 6).map(e => fmtPrepTime(e.at).slice(0, 5)).join(', ')}${r.events.length > 6 ? '…' : ''}</div>
      ${r.subs.map(s => opt(i, 'sub:' + s.kind + ':' + s.id, 'Dùng <b>' + escHtmlPos(s.name) + '</b> thay')).join('')}
      ${opt(i, 'new_batch', 'Nấu mẻ mới kịp — lấy từ nồi đang nấu')}
      ${opt(i, 'none', 'Không dùng gì / không rõ')}</div>`).join('')}
    <div id="puaMsg" style="font-size:12.5px;color:#c0392b;min-height:16px;margin:12px 0 8px"></div>
    <button onclick="prepUntrackedSubmit()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:6px">Lưu &amp; check-out</button>
    <button onclick="document.getElementById('prep-untracked-overlay').remove();_prepUntrackedAsk=null" class="kc-btn" style="background:none;color:#888;font-size:14px;font-weight:700;padding:12px">Để sau</button></div>`;
  document.body.appendChild(ov);
}

async function prepUntrackedSubmit() {
  const st = _prepUntrackedAsk; if (!st || st.busy) return;
  if (st.rows.some((r, i) => !st.answers[i])) { document.getElementById('puaMsg').textContent = 'Trả lời hết các món trước khi check-out'; return; }
  st.busy = true;
  try {
    const at = vnDate().toISOString();
    for (let i = 0; i < st.rows.length; i++) {
      const r = st.rows[i];
      await fstore.collection(PREP_SHORTAGE_RECON_COLL).doc(r.recId).set({ prepId: r.p.id, prepName: r.p.name || '', unit: r.p.unit || '', businessDate: st.day, sourceKind: 'prep',
        checkoutAnswers: { [st.shift.id]: { employeeId: st.emp.id, employeeName: st.emp.fullName || '', at, choice: st.answers[i], qty: r.qty, events: r.events.length } } }, { merge: true });
    }
    document.getElementById('prep-untracked-overlay')?.remove(); _prepUntrackedAsk = null;
    toast('✅ Đã ghi câu trả lời');
    await doCheckOut();
  } catch (err) { console.error('[BTP âm] lưu câu trả lời lỗi', err); const m = document.getElementById('puaMsg'); if (m) m.textContent = 'Chưa lưu được: ' + (err.message || err); st.busy = false; }
}

// Kết ca: câu đã trả lời lúc check-out điền sẵn cho dòng «hỏi bù» (cùng mã phiếu {ngày}_{BTP}).
function prepShortagePrefillFromCheckout(row, rec) {
  const ans = Object.values((rec && rec.checkoutAnswers) || {});
  if (!ans.length) return null;
  const keys = new Set((row.candidates || []).map(c => c.kind + ':' + c.id));
  const picked = new Set(ans.map(a => String(a.choice || '')).filter(c => c.startsWith('sub:')).map(c => c.slice(4)).filter(k => keys.has(k)));
  return { answer: picked.size ? picked : 'none', staff: [...new Set(ans.map(a => a.employeeName).filter(Boolean))].join(', ') };
}

let _prepShortAsk = null;

// Gọi đầu _continueAfterShiftInventoryClosePOS. true = đang hiện màn hỏi, dừng luồng kết ca.
async function prepShortageAskIfNeeded() {
  const day = shiftState.businessDate;
  let cl;
  try { cl = (await fstore.collection('daily_closings_gieogieo').doc(day).get()).data() || {}; }
  catch (err) { console.warn('[BTP âm] không đọc được phiếu kết ca — bỏ qua bước hỏi bù', err); return false; }
  if (cl.prepShortageAnswered) return false;
  try {
    // Không có BTP nào để cân (không lô nào đang mở) → bước cân bị bỏ qua, khoản âm chưa được
    // chụp/đóng (vd bán trước khi nấu, cả ngày không nấu). Chụp và đóng ngay tại đây.
    if (!cl.prepShortage) {
      const sh = await prepShortageCollect();
      await UnitEngine.prep.shortageClearAll(sh);
      cl.prepShortage = sh;
      await fstore.collection('daily_closings_gieogieo').doc(day).set({ prepShortage: sh }, { merge: true });
    }
    const [pSnap, nSnap, lotSnap, anSnap] = await Promise.all([
      fstore.collection('prep_items_gieogieo').get(),
      fstore.collection('inventory_items_gieogieo').get(),
      fstore.collection('prep_batches_gieogieo').where('businessDate', '==', day).get(),
      fstore.collection(STOCK_ANOMALY_COLL).where('businessDate', '==', day).get()
    ]);
    const preps = {}, nls = {}, lotsByPrep = {}, nlShort = {}, prepVar = {}, nlVar = {};
    pSnap.docs.forEach(d => { preps[d.id] = { id: d.id, ...d.data() }; });
    nSnap.docs.forEach(d => { nls[d.id] = { id: d.id, ...d.data() }; });
    lotSnap.docs.forEach(d => { const b = d.data();
      if (b.prepId && b.finishedAt) (lotsByPrep[b.prepId] = lotsByPrep[b.prepId] || []).push({ id: d.id, ...b }); });
    // Cộng ròng: bán không tem (âm) trừ đi phần hoàn ngoài tem (dương, vd xoá bill) cùng ngày.
    anSnap.docs.forEach(d => { const a = d.data();
      if (a.status !== 'open' || !['no_open_tem', 'atomic_unscanned', 'reversal_outside_tem'].includes(a.kind)) return;
      const g = nlShort[a.itemId] || (nlShort[a.itemId] = { qty: 0, ids: [] });
      g.qty = round2(g.qty - (Number(a.qty) || 0)); g.ids.push(d.id); });
    Object.keys(nlShort).forEach(k => { if (!(nlShort[k].qty > 0.005)) delete nlShort[k]; });
    (cl.prepCountLines || []).forEach(l => { prepVar[l.prepId] = round2((Number(l.countedQty) || 0) - (Number(l.systemQty) || 0)); });
    (cl.shiftInventoryCloseLines || []).forEach(l => {
      if (l.countedQty == null || l.expectedQty == null) return; // món có tem chưa xác nhận đủ mã — không phải số hụt
      nlVar[l.itemId] = round2((Number(l.countedQty) || 0) - (Number(l.expectedQty) || 0)); });
    const rows = prepShortageBuild({ shortage: cl.prepShortage || {}, preps, nls, lotsByPrep, nlShort, prepVar, nlVar });
    if (!rows.length) {
      await fstore.collection('daily_closings_gieogieo').doc(day).set({ prepShortageAnswered: true }, { merge: true });
      return false;
    }
    // [BTP ÂM 23/10] Câu đã trả lời lúc check-out điền sẵn; trả lời đủ thì không hỏi lại.
    const answers = {};
    await Promise.all(rows.map(async (r, i) => {
      if (r.status !== 'ask') return;
      try {
        const rid = (day + (r.sourceKind === 'item' ? '_nl_' : '_') + r.prepId).replace(/[^\w\-]/g, '_');
        const rec = await fstore.collection(PREP_SHORTAGE_RECON_COLL).doc(rid).get();
        const pf = prepShortagePrefillFromCheckout(r, rec.exists ? rec.data() : null);
        if (pf) { answers[i] = pf.answer; r.checkoutStaff = pf.staff; }
      } catch (e) { console.warn('[BTP âm] không đọc được câu trả lời lúc check-out', r.prepId, e); }
    }));
    _prepShortAsk = { day, rows, answers };
    if (!rows.some((r, i) => r.status === 'ask' && !answers[i])) { await prepShortageSubmitAnswers(true); return false; }
    renderPrepShortageAsk();
    return true;
  } catch (err) {
    console.warn('[BTP âm] dựng câu hỏi bù lỗi — không chặn kết ca', err);
    return false;
  }
}

function renderPrepShortageAsk() {
  const st = _prepShortAsk; if (!st) return;
  const box = document.getElementById('shiftBody');
  const ask = st.rows.map((r, i) => ({ r, i })).filter(x => x.r.status === 'ask');
  box.innerHTML = `<div class="kc-title">Đối chiếu topping dùng bù</div>
    <div class="kc-card">
      <div style="font-size:13px;color:#555;margin-bottom:12px;line-height:1.5">Có món bán ra nhiều hơn lượng đã nấu/đã mở tem, và có loại được phép dùng thay lại hụt sau khi cân/đếm cuối ca. Chọn đúng loại bạn đã dùng để bù.</div>
      ${ask.map(({ r, i }) => {
        const a = st.answers[i];
        const btn = (on, label, click) => `<button onclick="${click}" style="display:block;width:100%;text-align:left;margin-top:8px;padding:12px 14px;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;${on ? 'background:#E8F7EE;border:2px solid #16a34a;color:#15803d;' : 'background:#fff;border:2px solid #e6e1d2;color:var(--td);'}">${on ? caIcon('check', 15) + ' ' : ''}${label}</button>`;
        return `<div class="kc-sub" style="margin-bottom:14px">
          <div style="font-weight:800;font-size:16px">${escHtmlPos(r.prepName)}</div>
          <div style="font-size:13px;color:#6B6B70;margin-top:3px">${r.sourceKind === 'item'
            ? `Bán ${fmtPrepQty(r.remainder)} ${escHtmlPos(r.unit)} lúc không còn tem nào đang mở`
            : `Bán vượt ${fmtPrepQty(r.remainder)} ${escHtmlPos(r.unit)} so với lượng đã nấu`}</div>
          ${r.candidates.map(c => btn(a instanceof Set && a.has(c.kind + ':' + c.id),
            `Đã dùng <b>${escHtmlPos(c.name)}</b> để bù <span style="font-weight:600;color:#9A9AA0">· cuối ca hụt ${fmtPrepQty(c.short)} ${escHtmlPos(c.unit)}</span>`,
            `prepShortagePick(${i},'${c.kind}:${c.id}')`)).join('')}
          ${btn(a === 'none', 'Không dùng loại nào', `prepShortagePick(${i},'none')`)}
        </div>`;
      }).join('')}
      ${renderPinInput('prepShortStaff')}
    </div>
    <button onclick="prepShortageSubmitAnswers()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px">Xác nhận</button>`;
}

function prepShortagePick(i, key) {
  const st = _prepShortAsk; if (!st) return;
  if (key === 'none') st.answers[i] = st.answers[i] === 'none' ? undefined : 'none';
  else {
    const cur = st.answers[i] instanceof Set ? st.answers[i] : new Set();
    cur.has(key) ? cur.delete(key) : cur.add(key);
    st.answers[i] = cur.size ? cur : undefined;
  }
  renderPrepShortageAsk();
}

async function prepShortageSubmitAnswers(auto) {
  const st = _prepShortAsk; if (!st) return;
  if (_posSubmitBusy && !auto) { toast('⏳ Đang xử lý...'); return; }
  const askIdx = st.rows.map((r, i) => r.status === 'ask' ? i : -1).filter(i => i >= 0);
  if (!auto && askIdx.some(i => !st.answers[i])) { toast('⚠️ Trả lời hết các món trước khi xác nhận'); return; }
  let staffEmp = { fullName: '', id: '' };
  if (!auto) {
    staffEmp = await resolveStaffPinWorkedToday('prepShortStaff');
    if (!staffEmp) return;
    _posSubmitBusy = true;
  }
  const now = vnDate().toISOString();
  const usedShort = {};
  try {
    // [CÂN THEO MÃ] NL có tem đã cân chốt cuối ca: tem đã mang số THẬT (đã gồm phần lấy đi bù),
    // phần hụt đã ghi "hao hụt cân cuối ca". Nếu nhân viên xác nhận phần hụt đó là dùng bù BTP
    // thì chỉ chuyển loại (hao hụt → tiêu hao), không trừ tem thêm lần nữa.
    const clDoc = await fstore.collection('daily_closings_gieogieo').doc(st.day).get();
    const weighedTem = new Map(((clDoc.exists && clDoc.data().shiftInventoryCloseLines) || [])
      .filter(l => l.mode === 'tem' && l.status === 'reconciled' && l.opId).map(l => [l.itemId, l.opId]));
    for (let i = 0; i < st.rows.length; i++) {
      const r = st.rows[i];
      const a = st.answers[i];
      const picked = a instanceof Set ? r.candidates.filter(c => a.has(c.kind + ':' + c.id)) : [];
      const { subs, uncovered } = prepShortageAllocate(r, picked, usedShort);
      const status = r.status === 'explained' ? 'explained' : (subs.length ? 'substitution_pending' : 'unexplained');
      const id = (st.day + (r.sourceKind === 'item' ? '_nl_' : '_') + r.prepId).replace(/[^\w\-]/g, '_');
      // NL dùng thẳng được xác nhận đã dùng để bù → trừ vào tem đang mở (FIFO) như một lượt dùng thật.
      // Bấm lại / cân lại rồi trả lời lại: KHÔNG ghi đè mục Quản lý đã xử lý, KHÔNG trừ tem lần 2.
      const existing = await fstore.collection(PREP_SHORTAGE_RECON_COLL).doc(id).get();
      if (existing.exists && ['substitution_confirmed', 'dismissed'].includes(existing.data().status)) continue;
      for (const sub of subs.filter(x => x.kind === 'item')) {
        const substTxId = 'subst_' + id + '_' + sub.id;
        if (weighedTem.has(sub.id)) {
          // Chuyển loại NGAY TRÊN dòng hao hụt cân cuối ca (giảm qty) + 1 dòng CONSUMPTION, cùng
          // một transaction. Không đi qua applyStockTransactionPOS: lượng này đã rời quầy/tem từ
          // lúc ghi hao hụt, ghi lại qua đó sẽ trừ quầy/cộng refill thêm một lần nữa.
          await UnitEngine.shift.reclassToConsumption({ itemId: sub.id, qty: sub.expectedQty, day: st.day,
            opId: weighedTem.get(sub.id), txId: substTxId, reconId: id, prepId: r.prepId, prepName: r.prepName,
            unit: sub.unit, staffEmp })
            .catch(err => console.warn('[BTP âm] chuyển hao hụt cân cuối ca sang dùng bù lỗi', sub.id, err));
          continue;
        }
        if ((await fstore.collection('stock_transactions_gieogieo').doc(substTxId).get()).exists) continue;
        const ref = { type: 'substitution', id, note: 'Dùng bù cho ' + r.prepName };
        const allocations = await UnitEngine.consume.allocate(sub.id, sub.expectedQty, undefined, ref)
          .catch(err => { console.warn('[BTP âm] trừ tem NL dùng bù lỗi', sub.id, err); return []; });
        await UnitEngine.ledger.apply({
          itemId: sub.id, type: 'CONSUMPTION', qty: -sub.expectedQty,
          note: 'Dùng bù cho ' + r.prepName + ' (nhân viên xác nhận cuối ca)',
          staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, referenceId: id,
          deriveFromUnits: allocations.length > 0, businessDate: st.day, txId: substTxId,
          meta: { substitutionFor: r.prepId, substitutionReconId: id, ...(allocations.length ? { fifoAllocations: allocations } : {}) }
        }).catch(err => console.warn('[BTP âm] ghi sổ NL dùng bù lỗi', sub.id, err));
      }
      const { candidates, ...rest } = r;
      // merge: giữ câu trả lời lúc check-out (checkoutAnswers) đã ghi vào cùng phiếu.
      const { checkoutStaff, ...restClean } = rest;
      await fstore.collection(PREP_SHORTAGE_RECON_COLL).doc(id).set({
        ...restClean, status, businessDate: st.day, createdAt: now,
        candidates, substitutions: subs, uncoveredQty: round2(uncovered),
        staffAnswer: r.status !== 'ask' ? null : (a === 'none' ? 'none' : subs.map(x => x.kind + ':' + x.id)),
        staff: staffEmp.fullName || checkoutStaff || '', staffEmployeeId: staffEmp.id || ''
      }, { merge: true });
      if (status !== 'explained') {
        await fstore.collection('alerts_gieogieo').doc('prep_shortage_' + id).set({
          type: 'prep_shortage_recon', severity: status === 'unexplained' ? 'danger' : 'warning', status: 'new',
          businessDate: st.day, createdAt: now, prepId: r.prepId, itemName: r.prepName, reconId: id,
          title: status === 'substitution_pending'
            ? `${r.prepName}: nhân viên xác nhận đã bù bằng ${subs.map(x => x.prepName).join(', ')} — hệ thống tự đối chiếu số cân`
            : `${r.prepName}: thiếu ${fmtPrepQty(r.remainder)} ${r.unit} chưa giải thích được`
        }, { merge: true }).catch(() => {});
      }
    }
    await fstore.collection('daily_closings_gieogieo').doc(st.day).set({ prepShortageAnswered: true, prepShortageAnsweredAt: now }, { merge: true });
    _prepShortAsk = null;
    if (!auto) await _continueAfterShiftInventoryClosePOS();
  } catch (err) {
    console.error('[BTP âm] lưu câu trả lời lỗi', err);
    toast('❌ Chưa lưu được: ' + (err.message || err));
  } finally { if (!auto) _posSubmitBusy = false; }
}

let _prepCountState = [];

let _prepVerifyMode = null;

let _prepVerifySeq = 0;

// [THIẾT KẾ LẠI] Chỉ số BTP (dòng trong _prepCountState) đang hiện trên màn — màn
// giờ hiện TỪNG BTP một dạng thẻ, lướt qua bằng nút back + "Tiếp tục", thay vì cuộn
// một danh sách dài mọi loại cùng lúc. Đây là bước nhân viên bị kẹt lâu nhất trong
// cả luồng kết ca.
let _prepCountCardIdx = 0;

// [FIX] Mỗi dòng có:
//   batchQty    — Map<batchId, số CÂN THẬT của đúng lô đó (chỉ đến từ bộ cân)>
//   batchDone   — Map<batchId, true> nếu bấm "Báo hết / không thấy tem"
// counted (tổng thật sẽ lưu) LUÔN LUÔN = tổng các batchQty đã nhập — không còn cách
// nào nhập một số tổng rồi chia ngược cho nhiều lô (số đoán từng gây lô mới nấu bị
// đánh nhầm thành "đã dùng hết").
// [SỬA] Bỏ hẳn nhánh "1 lô dùng UI gọn khác" — giờ MỌI dòng đều perBatch:true, xử
// lý đồng nhất 1 lô hay nhiều lô như nhau (đơn giản hơn, và khớp đúng thiết kế mới:
// mỗi lô luôn là 1 khối "Mã lô + 2 nút", 1 lô thì khối đó chỉ lặp đúng 1 lần).
// verifyTask: có → màn dùng để CÂN LẠI xác minh; không có → đếm cuối ca (luôn xoá chế độ xác minh cũ, kể cả khi người dùng thoát màn bằng menu).
function renderPrepCountScreen(lines, verifyTask) {
  _prepVerifyMode = verifyTask ? { task: verifyTask, session: ++_prepVerifySeq } : null;
  _prepCountState = lines.map(l => {
    const batchQty = {}, batchDone = {}, batchWeighings = {};
    l.activeBatches.forEach(b => { batchQty[b.id] = null; batchDone[b.id] = false; batchWeighings[b.id] = []; });
    return { ...l, perBatch: true, batchQty, batchDone, batchWeighings, weighings: [], discardAll: false, counted: null };
  });
  // Loại hết hạn: tự động đánh dấu "Đã báo hết" cho mọi lô ngay từ đầu — nhân viên
  // vẫn bấm lại "Cân trừ bì" được cho từng lô nếu hũ đó thực ra còn dùng tốt (không
  // tự ý khoá cứng, chỉ đặt sẵn giá trị mặc định an toàn hơn).
  _prepCountState.forEach(l => { if (l.hasExpired && !_prepVerifyMode) _prepCountApplyDiscardAll(l, true); });
  _prepCountCardIdx = 0;
  preloadVesselImagesPOS(_prepCountState.map(l => l.prepId));
  renderPrepCountCard();
}

// Đổi trạng thái TOÀN BỘ lô của 1 dòng cùng lúc — không đụng DOM, chỉ đổi dữ liệu.
// Dùng cho cả lúc khởi tạo (loại hết hạn tự động) lẫn nút "Bỏ hết cả N lô" trên thẻ.
function _prepCountApplyDiscardAll(l, on) {
  l.discardAll = on;
  l.activeBatches.forEach(b => {
    l.batchDone[b.id] = on;
    l.batchQty[b.id] = on ? 0 : null;
    l.batchWeighings[b.id] = [];
  });
  _prepCountRefreshLineCounted(l);
}

// counted = null nghĩa là "chưa xử lý đủ mọi lô" — dùng để khoá nút Tiếp tục/Xác
// nhận, và là điều kiện DUY NHẤT _submitPrepCountImpl() dựa vào (xem "missing" ở đó).
function _prepCountRefreshLineCounted(l) {
  const allEntered = l.activeBatches.every(b => l.batchQty[b.id] !== null);
  l.counted = allEntered ? round2(l.activeBatches.reduce((s, b) => s + (Number(l.batchQty[b.id]) || 0), 0)) : null;
}

// ============================================================================
// [THIẾT KẾ LẠI] Đúng nguyên tắc "cân mù": KHÔNG hiện số hệ thống đang ghi cho
// nhân viên (tránh gõ/canh theo cho khớp) — giờ còn CHẮC hơn nữa vì đã bỏ hẳn ô gõ
// tay, số chỉ có thể đến từ cân thật. Mỗi lô chỉ còn đúng 2 lối: "Cân trừ bì" (mở
// bộ cân — KHÔNG có đường gõ tay nào khác) hoặc "Báo hết / không thấy tem".
// ============================================================================
function renderPrepCountCard() {
  const box = document.getElementById('shiftBody');
  if (!box) return;
  const idx = _prepCountCardIdx;
  const l = _prepCountState[idx];
  const total = _prepCountState.length;
  const isLast = idx === total - 1;
  const allDone = !!l && l.counted !== null;
  const hasPrev = idx > 0;

  box.innerHTML = `
    <div class="kc-title">${_prepVerifyMode ? 'Cân lại bán thành phẩm' : 'Đếm bán thành phẩm'}</div>
    ${_prepVerifyMode ? '<div class="kc-sub" style="margin-bottom:14px;">Cân từng lô như bình thường. Quán vẫn bán trong lúc bạn cân — hệ thống tự trừ phần đã bán.</div>' : ''}
    ${(shiftState.closing && (shiftState.closing.prepCountRecountIds || []).length) ? '<div class="kc-sub" style="margin-bottom:14px;color:#a32946;font-weight:700;">Chỉ cân lại bán thành phẩm được bill mới sử dụng.</div>' : ''}
    ${!l ? `<div class="kc-card"><div class="muted" style="text-align:center;padding:30px 0;">Không còn loại nào cần đếm.</div></div>` : `
    <div class="kc-card" style="margin:0 0 12px;">
      ${hasPrev ? `<button onclick="prepCountGoBack()" style="background:none;border:none;padding:0;margin-bottom:10px;color:#a89a7e;font-family:'Google Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">&lsaquo; Xem lại BTP trước</button>` : ''}
      ${!prepCanWeighPOS(l.prepId) ? prepWeighHintHTML(l.prepId) : ''}
      <div style="font-size:24px;font-weight:900;color:var(--td);line-height:1.15;letter-spacing:-.3px;">${l.prepName || ''}</div>
      <div style="font-size:14px;font-weight:700;color:${l.hasExpired ? '#c0392b' : 'var(--gd)'};margin-top:5px;">Đang có ${l.activeBatches.length} lô${l.hasExpired ? ' · Hết hạn' : ''}${l.hasCooking ? ' · còn lô đang nấu chưa xong' : ''}</div>
      ${l && l.recountDone && !_prepVerifyMode && l.counted === null ? '<div style="margin-top:10px;padding:10px 12px;background:#FBF0DC;border-radius:12px;color:#8a5a15;font-size:13px;font-weight:700;">Cân lại lần nữa để chắc chắn.</div>' : ''}
      ${l.activeBatches.length > 1 && !_prepVerifyMode ? `<button onclick="prepCountToggleDiscardAll(${idx})" style="margin-top:8px;background:none;border:none;padding:0;color:#aaa;font-family:'Google Sans',sans-serif;font-size:12px;font-weight:700;text-decoration:underline;cursor:pointer;">${l.discardAll ? 'Huỷ — không bỏ hết nữa' : `Bỏ hết cả ${l.activeBatches.length} lô →`}</button>` : ''}

      <div style="margin-top:18px;display:flex;flex-direction:column;gap:12px;">
        ${l.activeBatches.map((b, bi) => {
          const done = l.batchDone[b.id];
          const qty = l.batchQty[b.id];
          const state = done ? 'het' : (qty !== null && qty > 0) ? 'can' : null;
          const stateLabel = state === 'het' ? 'Đã báo hết' : state === 'can' ? 'Đã cân xong' : 'Chưa cân';
          const stateBg = state === 'het' ? '#c2703c' : state === 'can' ? '#16a34a' : '#E23A5D';
          const canLabel = state === 'can' ? 'Cân lại' : 'Cân trừ bì';
          return `
          <div style="padding:14px;background:#FAF8F2;border:1.5px solid #F0EAD9;border-radius:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:${state === 'can' ? '10px' : '12px'};">
              <div style="min-width:0;display:flex;align-items:baseline;gap:7px;">
                <span style="font-size:11.5px;font-weight:800;color:#aaa;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0;">Mã lô:</span>
                <span style="font-size:17px;font-weight:800;color:var(--td);letter-spacing:.3px;font-family:ui-monospace,Menlo,monospace;">${b.batchCode || '(chưa có mã)'}</span>
              </div>
              <div style="flex-shrink:0;font-size:12px;font-weight:800;color:#fff;padding:5px 10px;border-radius:999px;white-space:nowrap;background:${stateBg};">${stateLabel}</div>
            </div>
            ${state === 'can' ? `
            <div style="text-align:center;background:#fff;border:1.5px solid #F0EAD9;border-radius:14px;padding:12px 10px;margin-bottom:12px;">
              <span style="font-size:30px;font-weight:900;color:var(--td);letter-spacing:-.3px;">${fmtPrepQty(qty)}</span>
              <span style="font-size:14px;font-weight:700;color:#999;margin-left:4px;">${l.unit || ''}</span>
              <div style="font-size:11px;font-weight:700;color:#aaa;margin-top:2px;">Vừa cân được — bấm "Cân lại" nếu cân nhầm</div>
            </div>` : ''}
            <div style="display:flex;gap:8px;">
              ${prepCanWeighPOS(l.prepId)
                ? `<button onclick="prepCountWeighBatch(${idx},'${b.id}',${bi})" style="flex:1;padding:14px 8px;border-radius:999px;background:${state === 'can' ? '#fff' : '#1f1f1f'};color:${state === 'can' ? '#1f1f1f' : '#fff'};border:1.5px solid #1f1f1f;font-family:'Google Sans',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;">${canLabel}</button>`
                : `<div style="flex:1;padding:14px 8px;border-radius:999px;background:#f1eee4;color:#bbb;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;text-align:center;">Chưa gắn dụng cụ cân</div>`}
              <button onclick="prepCountToggleBatchDone(${idx},'${b.id}')" style="flex:1;padding:14px 8px;border-radius:999px;background:${state === 'het' ? '#c2703c' : '#f1eee4'};color:${state === 'het' ? '#fff' : '#8a5a5a'};border:none;font-family:'Google Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;">Báo hết / không thấy tem</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`}

    <div class="kc-card" style="margin:0 0 14px;">${renderPinInput('prepCountStaff')}</div>

    ${_prepVerifyMode ? `<button onclick="exitPrepVerifyPOS()" style="width:100%;margin:0 0 12px;padding:13px;background:#fff;border:1.5px solid #ddd;border-radius:999px;color:#666;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Để sau</button>` : closeStepNavHTML(5)}

    <button onclick="prepCountGoNext()" ${allDone ? '' : 'disabled'} class="kc-btn" style="background:${allDone ? 'var(--gd)' : '#f1eee4'};color:${allDone ? '#fff' : '#bbb'};cursor:${allDone ? 'pointer' : 'not-allowed'};margin-bottom:22px;">${!allDone ? 'Cân hoặc báo hết đủ các lô để tiếp tục' : (_prepVerifyMode ? 'Xác nhận số cân lại' : (isLast ? 'Xác nhận & tiếp tục kết ca' : 'Tiếp tục'))}</button>
  `;
}

function prepCountGoBack() {
  if (_prepCountCardIdx > 0) { _prepCountCardIdx--; renderPrepCountCard(); }
}

// Bấm hai lần khi mạng chậm: lượt hai bị bỏ (khoá), và sau khi chờ cổng cân lại phải kiểm tra thẻ hiện tại chưa đổi — không nhảy qua BTP chưa cân.
let _prepCountNextBusy = false;

async function prepCountGoNext() {
  if (_prepCountNextBusy) return;
  _prepCountNextBusy = true;
  try { await _prepCountGoNextImpl(); } finally { _prepCountNextBusy = false; }
}

async function _prepCountGoNextImpl() {
  const l = _prepCountState[_prepCountCardIdx];
  if (!l || l.counted === null) { toast('⚠️ Cân hoặc báo hết đủ các lô trước khi tiếp tục'); return; }
  if (_prepVerifyMode) { await submitPrepVerify(); return; }
  // [CÂN LẠI MỘT LẦN] Lệch quá ngưỡng → bắt cân lại đúng 1 lần, KHÔNG nói số/hướng/mức lệch (cân mù). Cân lại lần hai vẫn
  // lệch → ghi nhận như vậy nhưng đánh dấu "nghi lệch": khi người khác check-in sẽ có việc cân lại để xác minh.
  if (!l.discardAll) {
    let g = null;
    try { g = await UnitEngine.duty.gateCheck(l); } catch (err) { console.warn('[duty] gateCheck lỗi — bỏ qua cổng', err); }
    if (_prepCountState[_prepCountCardIdx] !== l) return;   // thẻ đã đổi trong lúc chờ mạng
    if (g) {
      if (!l.recountDone && g.needs) {
        l.attempt1 = l.counted; l.recountDone = true; l.suspect = false;
        _prepCountResetLine(l);
        toast('⚠️ Cân lại ' + (l.prepName || '') + ' thêm một lần nữa');
        renderPrepCountCard();
        return;
      }
      if (l.recountDone) l.suspect = !!g.needs;
    }
  }
  if (_prepCountCardIdx < _prepCountState.length - 1) { _prepCountCardIdx++; renderPrepCountCard(); }
  else await submitPrepCount();
}

// Xoá hết số đã cân của một dòng (để cân lại từ đầu, không hiện số cũ).
function _prepCountResetLine(l) {
  l.discardAll = false; l.weighings = [];
  l.activeBatches.forEach(b => { l.batchQty[b.id] = null; l.batchDone[b.id] = false; l.batchWeighings[b.id] = []; });
  _prepCountRefreshLineCounted(l);
}

// Cân riêng cho ĐÚNG một lô — nhân viên bê đúng khay/hũ của lô đó lên cân, đúng
// nguyên tắc nhập theo tem. Không có đường gõ tay nào khác ngoài bộ cân này.
function prepCountWeighBatch(i, batchId, bi) {
  const l = _prepCountState[i];
  if (!l) return;
  const b = l.activeBatches.find(x => x.id === batchId) || {};
  openWeighPad({
    prepId: l.prepId, unit: l.unit,
    title: 'Cân lô ' + (b.batchCode || '') + ' · ' + (l.prepName || ''),
    onDone: async (total, lines) => {
      // Cân lúc đang bán (xác minh): sổ của lô TẠI MỐC đọc số cân (lấy mốc TRƯỚC khi đọc sổ; engine cộng lại phần bán sau mốc) — số cân và sổ cùng một mốc.
      if (_prepVerifyMode) {
        const atMs = UnitEngine.clock.now();
        // Đọc sổ lỗi → VÔ HIỆU snapshot cũ của lô và KHÔNG nhận số cân mới (nếu không số cân mới sẽ ghép với sổ của lần cân trước).
        try {
          const bk = await UnitEngine.duty.lotBookAtExact(l.prepId, batchId, atMs); (l.snaps = l.snaps || {})[batchId] = { book: bk.book, exact: bk.exact === true, at: vnDate(atMs).toISOString() };
          if (bk.exact !== true && bk.reason === 'chua_xac_nhan_moi_may_da_cap_nhat') toast('⚠️ Quản lý chưa xác nhận mọi máy đã cập nhật — chưa chốt được số cân lại. Báo Quản lý.');
        }
        catch (err) {
          console.warn('[duty] không chụp được sổ lô lúc cân', err);
          if (l.snaps) delete l.snaps[batchId];
          toast('⚠️ Không đọc được sổ của lô — chưa ghi nhận số cân, hãy cân lại khi có mạng');
          return;
        }
      }
      l.batchWeighings[batchId] = lines;
      l.batchDone[batchId] = false;
      l.batchQty[batchId] = total;
      _prepCountRefreshLineCounted(l);
      renderPrepCountCard();
    }
  });
}

// Báo hết một lô mà sổ vẫn còn hàng = đổ bỏ toàn bộ phần còn lại (ghi hao hụt).
// Hỏi lại trước khi ghi để bấm nhầm không thành hao hụt. KHÔNG hiện số trên sổ —
// giữ nguyên tắc cân mù (nhân viên không canh số cho khớp).
function _prepCountBatchHasStock(b) { return !!b && (Number(b.qtyRemaining) || 0) > 0.005; }

async function prepCountToggleBatchDone(i, batchId) {
  const l = _prepCountState[i];
  if (!l) return;
  const willDone = !l.batchDone[batchId];
  const b = l.activeBatches.find(x => x.id === batchId);
  if (willDone && !_prepVerifyMode && _prepCountBatchHasStock(b)) {
    const ok = await posConfirm('Lô ' + ((b && b.batchCode) || '') + ' · ' + (l.prepName || '') +
      '\nTrên sổ lô này VẪN CÒN hàng. Báo hết nghĩa là đổ bỏ toàn bộ phần còn lại và ghi hao hụt.\n\nNếu hũ/khay vẫn còn, bấm "Quay lại" rồi dùng "Cân trừ bì".',
      { okText: 'Đổ bỏ hết', cancelText: 'Quay lại', danger: true });
    if (!ok || _prepCountState[i] !== l) return;
  }
  if (_prepVerifyMode && willDone) {
    const atMs = UnitEngine.clock.now();
    try { const bk = await UnitEngine.duty.lotBookAtExact(l.prepId, batchId, atMs); (l.snaps = l.snaps || {})[batchId] = { book: bk.book, exact: bk.exact === true, at: vnDate(atMs).toISOString() }; }
    catch (err) {
      console.warn('[duty] không chụp được sổ lô', err);
      if (l.snaps) delete l.snaps[batchId];
      toast('⚠️ Không đọc được sổ của lô — chưa ghi nhận, hãy thử lại khi có mạng');
      return;
    }
  }
  l.batchDone[batchId] = willDone;
  l.batchWeighings[batchId] = [];   // đánh dấu hết/bỏ dấu đều làm số cân cũ vô nghĩa
  l.batchQty[batchId] = willDone ? 0 : null;
  // Bỏ tick riêng 1 lô thì "bỏ hết cả N lô" không còn đúng cho toàn dòng nữa.
  if (!willDone) l.discardAll = false;
  _prepCountRefreshLineCounted(l);
  renderPrepCountCard();
}

async function prepCountToggleDiscardAll(i) {
  const l = _prepCountState[i];
  if (!l) return;
  if (!l.discardAll && l.activeBatches.some(_prepCountBatchHasStock)) {
    const ok = await posConfirm((l.prepName || '') + '\nTrên sổ vẫn còn hàng ở ' + l.activeBatches.filter(_prepCountBatchHasStock).length +
      ' lô. Bỏ hết nghĩa là đổ bỏ toàn bộ và ghi hao hụt cho tất cả các lô này.',
      { okText: 'Đổ bỏ hết', cancelText: 'Quay lại', danger: true });
    if (!ok || _prepCountState[i] !== l) return;
  }
  _prepCountApplyDiscardAll(l, !l.discardAll);
  renderPrepCountCard();
}

async function submitPrepCount() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitPrepCountImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitPrepCountImpl() {
  // [FIX] "đã đếm xong" nghĩa là ĐỦ TỪNG LÔ đã cân/báo hết (được
  // _prepCountRefreshLineCounted gán vào l.counted khi allEntered), không phải chỉ
  // cần có 1 số tổng nào đó — tránh thiếu sót 1 lô mà vẫn lọt qua được.
  const missing = _prepCountState.filter(l => l.counted === null);
  if (missing.length) { toast(`⚠️ Còn ${missing.length} loại chưa đếm đủ (kiểm tra đã nhập hết từng lô chưa)`); return; }
  const staffEmp = await resolveStaffPinWorkedToday('prepCountStaff');
  if (!staffEmp) return;

  // [BTP — ÂM CHỜ ĐỐI CHIẾU] Chụp khoản âm TRƯỚC khi các lượt ghi bên dưới xoá nó.
  let shortageSnap = null;
  try { shortageSnap = await prepShortageCollect(); }
  catch (err) { console.warn('[BTP âm] không chụp được khoản âm — bỏ qua đối chiếu lượt này', err); }

  const now = vnDate().toISOString();
  const lines = [];
  const jobs = [];
  const jobPrep = [];   // BTP của từng job (null = job phụ như cảnh báo) — job lỗi thì cân lại đúng BTP đó
  const pushJob = (prepId, p) => { jobs.push(p); jobPrep.push(prepId); };

  for (const l of _prepCountState) {
    // [E4] Ghi lô/RT/sổ/cảnh báo của từng dòng nằm trong Unit Engine (prep.countCommitLine).
    const r = UnitEngine.prep.countCommitLine(l, { now, staff: staffEmp, businessDate: shiftState.businessDate });
    lines.push(r.line);
    for (const j of r.jobs) pushJob(j.prepId, j.promise);
  }

  try {
    const results = await Promise.allSettled(jobs);
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) console.warn('[GĐ3] Một số cập nhật lô thất bại:', failed.map(f => f.reason));
    if (shortageSnap) {
      // Lưu khoản âm vừa chụp — đối chiếu (và hỏi nhân viên) chạy sau kiểm kê NL cuối ca,
      // khi đã có số cuối cùng của cả BTP lẫn NL (prepShortageAskIfNeeded).
      try { await UnitEngine.prep.shortageClearAll(shortageSnap); }
      catch (err) { console.warn('[BTP âm] đóng khoản âm sau khi cân lỗi', err); }
    }
    // BTP có lô/sổ cập nhật lỗi → KHÔNG coi là đã đếm: đưa vào danh sách cân lại (cơ chế
    // prepCountRecountIds sẵn có) và mở lại màn cân chỉ cho các BTP đó.
    const failedPrepIds = [...new Set(results.map((r, i) => r.status === 'rejected' ? jobPrep[i] : null).filter(Boolean))];
    const previouslyValid = (shiftState.closing && shiftState.closing.prepCountLines) || [];
    const refreshedIds = new Set(lines.map(l => l.prepId));
    const completeLines = previouslyValid.filter(l => !refreshedIds.has(l.prepId))
      .map(l => ({ ...l, countedAt: l.countedAt || (shiftState.closing && shiftState.closing.prepCountAt) || now }))
      .concat(lines.filter(l => !failedPrepIds.includes(l.prepId)));
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      prepCountLines: completeLines, prepCountAt: now, prepCountRecountIds: failedPrepIds,
      ...(shortageSnap ? { prepShortage: { ...((shiftState.closing && shiftState.closing.prepShortage) || {}), ...shortageSnap },
        prepShortageAnswered: false } : {}),
      prepCountBy: staffEmp.fullName, prepCountByEmployeeId: staffEmp.id
    }, { merge: true });
    shiftState.closing = shiftState.closing || {};
    shiftState.closing.prepCountLines = completeLines;
    if (shortageSnap) shiftState.closing.prepShortage = { ...(shiftState.closing.prepShortage || {}), ...shortageSnap };
    shiftState.closing.prepCountAt = now;
    shiftState.closing.prepCountRecountIds = failedPrepIds;
    if (failed.length) toastAutoReport('⚠️ Đã lưu nhưng ' + failed.length + ' lô BTP cập nhật lỗi', 'Đếm BTP cuối ca: cập nhật lô lỗi', { ref: shiftState.businessDate || '' });
    else toast('✅ Đã ghi nhận tồn bán thành phẩm');
    if (failedPrepIds.length) {
      toast('⚠️ ' + failedPrepIds.length + ' BTP chưa lưu được — cân lại đúng các BTP đó');
      await _continueAfterHandoverClose();
      return;
    }
    await _continueAfterPrepCount();
  } catch (err) {
    console.error('submitPrepCount failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

// ═══════════════════════════════════════
// [TRÁCH NHIỆM THEO CA] Việc cân lại BTP (xác minh số nghi lệch) khi người khác check-in + xem/phản đối vụ lệch của mình.
// Kế hoạch: docs/KE_HOACH_TRACH_NHIEM_CA.md. Không chặn bán, không chặn check-in; làm khi rảnh. Cân mù: không hiện số.
// ═══════════════════════════════════════
const DUTY_BASIS_LABEL = { nhap_sai_da_xac_minh: 'nhập sai số (đã xác minh)', chia_theo_so_ban: 'có mặt lúc bán', nguoi_nau_me: 'nấu mẻ', chu_quyet_dinh: 'quản lý quyết định' };

const DUTY_POOL_LABEL = { recipe: 'định mức/công thức', unknown: 'chưa xác định được', unverified: 'chờ xác minh', dispute: 'chờ quản lý quyết', waived: 'quản lý miễn' };

let _dutyMine = null;

async function dutyTasksHTMLPOS() {
  let tasks = [];
  try { await UnitEngine.duty.expireTasks(); tasks = await UnitEngine.duty.listOpenTasks(); } catch (err) { console.warn('[duty] không đọc được việc xác minh', err); }
  if (!tasks.length) return '';
  const hm = iso => vnDate(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return `<div class="wal-section" style="margin:0 0 12px;padding:16px;">
    ${caTitle('Cần cân lại', `<span style="font-size:13px;font-weight:800;color:var(--gd);background:var(--gl);border-radius:999px;padding:4px 10px;">${tasks.length}</span>`)}
    <div style="font-size:12.5px;color:#8A8A90;margin:-4px 0 10px;">Người khác phải cân lại. Làm khi rảnh — không ảnh hưởng bán hàng.</div>
    ${tasks.map(t => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;margin-top:8px;background:#FFFCF0;border:1.5px solid #f0ead9;border-radius:16px;">
      <div style="min-width:0;"><div style="font-size:17px;font-weight:800;color:var(--td);">${escHtmlPos(t.prepName || '')}</div><div style="font-size:12.5px;font-weight:700;color:#a89a7e;">Cân từ ${hm(t.createdAt)}</div></div>
      <button onclick="openPrepVerifyPOS('${escHtmlPos(t.id)}')" style="flex-shrink:0;padding:10px 18px;border:none;border-radius:999px;background:var(--gd);color:#fff;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">Cân lại</button>
    </div>`).join('')}
  </div>`;
}

async function renderDutyTasksPOS() {
  const box = document.getElementById('dutyTaskBlock'); if (!box) return;
  box.innerHTML = await dutyTasksHTMLPOS();
}

async function openPrepVerifyPOS(taskId) {
  showScreen('caLamViecScreen');
  const box = document.getElementById('shiftBody'); showLoading(box);
  let task = null, line = null;
  try {
    task = (await UnitEngine.duty.listOpenTasks()).find(t => t.id === taskId);
    if (task) line = (await computePrepCountLinesPOS()).find(x => x.prepId === task.prepId);
  } catch (err) { console.warn('[duty] mở việc cân lại lỗi', err); toast('❌ Không tải được dữ liệu cân lại'); exitPrepVerifyPOS(); return; }
  if (!task) { toast('✅ Việc này đã được xử lý'); exitPrepVerifyPOS(); return; }
  // [v9] Lượt cân lại trước đã cân xong nhưng chưa ghi hết (lô đã đóng/về 0 nên không còn gì để cân): số liệu nằm sẵn trong task.attempt → ghi nốt, KHÔNG bắt cân lại.
  const hasStored = !!(task.attempt && Array.isArray(task.attempt.lots) && task.attempt.lots.length && (task.partialRt === true || task.status === 'processing'));
  if (hasStored && (!line || !line.activeBatches.length)) { renderPrepVerifyRecoveryPOS(task); return; }
  if (!line || !line.activeBatches.length) {
    toast('⚠️ Bán thành phẩm này không còn lô để cân — việc sẽ tự đóng');
    exitPrepVerifyPOS(); return;
  }
  renderPrepCountScreen([line], task);
}

function renderPrepVerifyRecoveryPOS(task) {
  _prepVerifyMode = { task, session: ++_prepVerifySeq, recovery: true };
  _prepCountState = [{ prepId: task.prepId, prepName: task.prepName || '', unit: task.unit || '', activeBatches: [], batchQty: {}, batchWeighings: {}, snaps: {}, counted: 0 }];
  document.getElementById('shiftBody').innerHTML = `
    <div class="kc-card" style="margin:0 0 14px;">
      <div style="font-size:17px;font-weight:800;color:var(--td);margin-bottom:6px;">${escHtmlPos(task.prepName || '')}</div>
      <div style="font-size:13.5px;font-weight:600;color:#8A8A90;line-height:1.5;">Lượt cân lại trước đã cân xong nhưng chưa ghi hết vào sổ. Số cân đã được lưu — chỉ cần nhập mã PIN và ghi nốt, không cần cân lại.</div>
    </div>
    <div class="kc-card" style="margin:0 0 14px;">${renderPinInput('prepCountStaff')}</div>
    <button onclick="exitPrepVerifyPOS()" style="width:100%;margin:0 0 12px;padding:13px;background:#fff;border:1.5px solid #ddd;border-radius:999px;color:#666;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Để sau</button>
    <button onclick="submitPrepVerify()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Ghi nốt số cân lại</button>`;
}

function exitPrepVerifyPOS() {
  _prepVerifyMode = null; _prepCountState = [];
  renderShiftDashboard(); renderCheckinBlock();
}

// Khoá RIÊNG cho xác minh: KHÔNG dùng _posSubmitBusy (khoá chung của thanh toán/tạo bill) — cân lại chạy lúc quán đang bán, không được làm
// thanh toán bị từ chối "Đang xử lý…".
let _dutyVerifyBusy = false;

async function submitPrepVerify() {
  if (_dutyVerifyBusy) { toast('⏳ Đang ghi số cân lại, vui lòng đợi giây lát...'); return; }
  _dutyVerifyBusy = true;
  try { await _submitPrepVerifyImpl(); } finally { _dutyVerifyBusy = false; }
}

async function _submitPrepVerifyImpl() {
  const l = _prepCountState[0], task = _prepVerifyMode && _prepVerifyMode.task, sess = _prepVerifyMode && _prepVerifyMode.session;
  if (!l || !task) return;
  if (l.counted === null) { toast('⚠️ Cân hoặc báo hết đủ các lô'); return; }
  const emp = await resolveStaffPinAndCheckin('prepCountStaff');
  if (!emp) return;
  if (emp.id === task.firstById) { toast('⚠️ Cần người khác với người cân lần trước'); return; }
  try {
    await UnitEngine.duty.verifyCommit(l, task, { now: vnDate(UnitEngine.clock.now()).toISOString(), staff: emp, businessDate: posDateKey() });
    toast('✅ Đã ghi nhận số cân lại');
    // Chỉ dọn màn nếu nó vẫn là phiên đã gửi — mạng chậm mà nhân viên đã sang màn đếm kết ca thì không được xoá số đang cân.
    if (_prepVerifyMode && _prepVerifyMode.session === sess) exitPrepVerifyPOS();
    else if (typeof renderDutyTasksPOS === 'function') renderDutyTasksPOS();
  } catch (err) {
    console.error('submitPrepVerify failed', err);
    toast('❌ ' + (err.message || err));
  }
}

// Xem phần trách nhiệm của chính mình (cần PIN) + phản đối kèm lý do.
function openMyDutyCasesPOS() {
  showScreen('caLamViecScreen');
  _dutyMine = null;
  _pinFieldForceAsk['dutyMinePin'] = true;   // luôn hỏi PIN, kể cả khi chỉ có một người trong ca
  document.getElementById('shiftBody').innerHTML = `
    <div class="kc-title">Phần trách nhiệm của tôi</div>
    <div class="kc-card" style="margin:0 0 14px;">${renderPinInput('dutyMinePin', 'Mã PIN của bạn')}</div>
    <button onclick="loadMyDutyCasesPOS()" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:12px;">Xem</button>
    <button onclick="renderShiftDashboard()" class="kc-btn" style="background:#f1eee4;color:#666;">Quay lại</button>`;
}

async function loadMyDutyCasesPOS() {
  const emp = resolveStaffPinField('dutyMinePin'); if (!emp) return;
  const box = document.getElementById('shiftBody'); showLoading(box);
  let list = [];
  try {
    const to = posDateKey(), from = vnDate(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    list = (await UnitEngine.duty.listCases(from, to)).filter(c => (c.allocations || []).some(a => a.employeeId === emp.id) || (c.countedBy && c.countedBy.id === emp.id && c.status === 'dispute'));
  } catch (err) { box.innerHTML = '<div class="kc-card">Không tải được dữ liệu.</div><button onclick="openMyDutyCasesPOS()" class="kc-btn" style="background:#f1eee4;color:#666;">Thử lại</button>'; return; }
  _dutyMine = { emp, list };
  const money = n => (Math.round(Math.abs(Number(n) || 0))).toLocaleString('vi-VN') + 'đ';
  box.innerHTML = `<div class="kc-title">${escHtmlPos(emp.fullName)} — 30 ngày gần đây</div>
    ${list.length ? list.map((c, i) => {
      const a = (c.allocations || []).find(x => x.employeeId === emp.id);
      const why = a ? (a.basis || []).map(b => DUTY_BASIS_LABEL[b] || b).join(', ') : 'đang chờ quản lý quyết';
      const st = { auto: 'Đã chốt tự động', manual: 'Quản lý đã quyết', contested: 'Đang chờ quản lý xem phản đối', dispute: 'Chờ quản lý quyết', pending_verify: 'Chờ cân lại', closed_pool: 'Đã đóng' }[c.status] || c.status;
      return `<div class="kc-card" style="margin:0 0 10px;">
        <div style="font-size:17px;font-weight:800;color:var(--td);">${escHtmlPos(c.prepName || '')} <span style="font-size:12.5px;color:#a89a7e;font-weight:700;">${escHtmlPos(c.businessDate || '')}</span></div>
        <div style="font-size:14px;font-weight:700;margin-top:4px;color:${a && a.qty < 0 ? '#c0392b' : 'var(--td)'};">${a ? 'Phần của bạn: ' + fmtPrepQty(Math.abs(a.qty)) + ' ' + escHtmlPos(c.unit || '') + ' (' + money(a.value) + ')' : 'Chưa quy cho ai'}</div>
        <div style="font-size:12.5px;color:#8A8A90;margin-top:3px;">Cơ sở: ${escHtmlPos(why)} · ${escHtmlPos(st)}</div>
        ${a && c.status !== 'contested' ? `<textarea id="dutyContestReason_${i}" placeholder="Lý do phản đối" style="width:100%;margin-top:10px;padding:10px;border:1.5px solid #ddd;border-radius:12px;font-family:inherit;font-size:14px;" rows="2"></textarea>
        <button onclick="dutyContestPOS(${i})" style="margin-top:8px;padding:10px 16px;border:1.5px solid #c0392b;background:#fff;color:#c0392b;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;">Phản đối</button>` : ''}
      </div>`;
    }).join('') : '<div class="kc-card"><div class="muted" style="text-align:center;padding:20px 0;">Chưa có vụ nào của bạn.</div></div>'}
    <button onclick="renderShiftDashboard()" class="kc-btn" style="background:#f1eee4;color:#666;margin-top:6px;">Quay lại</button>`;
}

async function dutyContestPOS(i) {
  const c = _dutyMine && _dutyMine.list[i]; if (!c) return;
  const reason = ((document.getElementById('dutyContestReason_' + i) || {}).value || '').trim();
  if (!reason) { toast('⚠️ Nhập lý do phản đối'); return; }
  try {
    await UnitEngine.duty.contest(c.id, { byId: _dutyMine.emp.id, byName: _dutyMine.emp.fullName, reason });
    toast('✅ Đã gửi phản đối cho quản lý');
    c.status = 'contested'; loadMyDutyCasesPOS();
  } catch (err) { toast('❌ ' + (err.message || err)); }
}

// ══════════════════════════════════════════════════════════════════════════
// [KIỂM KÊ CA] Đếm nguyên liệu đầu/ cuối ca, độc lập Refill và kiểm kê thủ công.
// Đầu ca: sau đếm giao ca; cuối ca: sau đếm BTP, trước bàn giao tiền.
// Chỉ lưu số THỰC TẾ để chuẩn bị lấy hàng sáng mai. Không sửa currentStock,
// locationStock, không ghi TRANSFER/ADJUSTMENT và không tự tạo phiếu nhập.
// [NGOẠI LỆ — CÂN THEO MÃ] Cuối ca, NL có tem được cân từng mã đang mở (quét xác nhận trên
// tay trước khi cân). Số cân chốt lại unitBase của đúng mã đó; phần lệch ghi WASTE/ADJUSTMENT
// wasteKind 'shift_weigh' ("hao hụt cân cuối ca") — xem shiftWeighApplyLinePOS.
// ══════════════════════════════════════════════════════════════════════════
const SHIFT_INVENTORY_COUNTS_COLL = 'shift_inventory_counts_gieogieo';

// ── ĐẾM TỪNG MÓN MỘT ──────────────────────────────────────────────────────
// Dùng chung cho các màn đếm dạng danh sách (kiểm kê đầu/cuối ca, đếm giao ca).
// Danh sách vẫn vẽ đủ như cũ (giữ nguyên id ô nhập/hàm lưu), nhưng chỉ HIỆN món
// đang đếm; món này chưa có số thì không sang được món sau. PIN + nút xác nhận chỉ
// hiện ở món cuối — nhân viên mới không thể lướt qua mà quên một món.
// Chỉ dùng ở màn hậu trường (mở/kết ca), không đụng luồng bán hàng.
const _kcStep = {};

function kcStepReset(key){ delete _kcStep[key]; }

function kcStepApply(key, total, isDone){
  const st = _kcStep[key] || (_kcStep[key] = { idx: 0 });
  st.total = total; st.isDone = isDone;
  st.idx = Math.max(0, Math.min(st.idx, total - 1));
  const list = document.getElementById(key + 'List');
  if (!list || total <= 1) { kcStepRefresh(key); return; }
  [...list.children].forEach((el, i) => { el.style.display = i === st.idx ? '' : 'none'; });
  kcStepRefresh(key);
}

function kcStepRefresh(key){
  const st = _kcStep[key]; if (!st) return;
  const nav = document.getElementById(key + 'Nav');
  const single = st.total <= 1;
  const last = st.idx >= st.total - 1;
  const done = !!st.isDone(st.idx);
  document.querySelectorAll('.' + key + '-final').forEach(el => { el.style.display = (single || last) ? '' : 'none'; });
  if (!nav) return;
  if (single) { nav.innerHTML = ''; return; }
  const soXong = Array.from({ length: st.total }, (_, i) => !!st.isDone(i)).filter(Boolean).length;
  nav.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0 4px;">
      <button onclick="kcStepGo('${key}',-1)" ${st.idx > 0 ? '' : 'disabled'} style="padding:12px 14px;border-radius:999px;border:1.5px solid #ddd;background:#fff;color:${st.idx > 0 ? 'var(--td)' : '#ccc'};font-weight:800;font-family:inherit;">‹ Món trước</button>
      <span style="font-size:13px;font-weight:800;color:#888;">Món ${st.idx + 1}/${st.total} · xong ${soXong}</span>
      ${last ? '<span style="width:88px"></span>' : `<button onclick="kcStepGo('${key}',1)" ${done ? '' : 'disabled'} style="padding:12px 16px;border-radius:999px;border:0;background:${done ? 'var(--gd)' : '#f1eee4'};color:${done ? '#fff' : '#bbb'};font-weight:800;font-family:inherit;">Món tiếp ›</button>`}
    </div>`;
}

function kcStepGo(key, d){
  const st = _kcStep[key]; if (!st) return;
  if (d > 0 && !st.isDone(st.idx)) { toast('⚠️ Đếm hoặc cân món này trước khi sang món tiếp theo'); return; }
  st.idx = Math.max(0, Math.min(st.total - 1, st.idx + d));
  kcStepApply(key, st.total, st.isDone);
}

let _shiftInventoryCountStatePOS = { phase:'', lines:[] };

function shiftInventoryCountIntegerPOS(unit){
  return /^(cái|chiếc|ly|phần|quả|trái|hộp|gói|chai|lon|túi|bịch|cây|pcs)$/i.test(String(unit||'').trim());
}

async function computeShiftInventoryCountLinesPOS(phase){
  const day=shiftState.businessDate || posDateKey();
  const [snap, savedSnap] = await Promise.all([
    // [GIẢM-ĐỌC] Chỉ lấy món cần kiểm kê ở ca này thay vì cả kho — bộ lọc bên dưới vốn
    // cũng chỉ giữ đúng các món này, nên kết quả không đổi.
    fstore.collection('inventory_items_gieogieo').where('shiftCountTiming','in',[phase,'both']).get(),
    fstore.collection(phase==='open'?'daily_openings_gieogieo':'daily_closings_gieogieo').doc(day).get()
  ]);
  const saved=savedSnap.exists ? savedSnap.data() : {};
  const done=new Set(((phase==='open'?saved.shiftInventoryOpenLines:saved.shiftInventoryCloseLines)||[]).map(l=>l.itemId));
  const pending=new Set(phase==='close'?(saved.shiftInventoryCloseRecountIds||[]):[]);
  const need=it=>!done.has(it.id) || pending.has(it.id);
  const aggLine=it=>({itemId:it.id,itemName:it.name,unit:it.unit||'',expectedQty:Number(it.currentStock)||0});
  const byName=(a,b)=>(a.itemName||'').localeCompare(b.itemName||'','vi');
  const configured=snap.docs.map(d=>({id:d.id,...d.data()}))
    .filter(it=>it.stockManaged!==false &&
      (it.shiftCountTiming===phase || it.shiftCountTiming==='both') && need(it));
  // Lượt cân trước đã ghi RT nhưng app tắt trước khi ghi sổ → hoàn tất nốt trước khi cân lại.
  await shiftWeighHealRecentPOS(day, phase==='close'?saved:null, phase==='close')
    .catch(err=>console.warn('[Cân cuối ca] tự bù lượt dở dang lỗi', err));
  if(phase!=='close') return configured.map(aggLine).sort(byName);
  // [CÂN CÒN LẠI THEO MÃ] Cuối ca, NL có tem không đếm một con số tổng nữa mà cân TỪNG MÃ đang
  // mở (xem shiftWeighApplyLinePOS). Danh sách gồm 2 lớp:
  //   1. Món Quản lý bật kiểm kê cuối ca VÀ đang có ít nhất 1 mã mở (không mở mã nào = không
  //      có gì để cân, hàng chưa mở không cần quét).
  //   2. Món KHÔNG bật nhưng hôm nay có dấu hiệu bất thường — đúng những món cân tổng không bắt
  //      được: mã đang âm/nợ FIFO, mở 2+ mã cùng lúc, bán khi không có tem mở, lỗi đồng bộ RT,
  //      có dòng Sổ lệch mở trong ngày.
  // NL "cái rời" (atomic) và NL không có tem giữ nguyên cách đếm tổng như cũ.
  await ensureKhoItemsPOS();
  const [rtSnap, anomalies] = await Promise.all([
    db.ref('active_units_gieogieo').once('value'),
    shiftWeighAnomalyItemsPOS(day)
  ]);
  const rt=rtSnap.val()||{};
  const lines=[];
  const configuredIds=new Set(configured.map(it=>it.id));
  configured.forEach(it=>{
    if(!shiftWeighIsTemItemPOS(it)){ lines.push(aggLine(it)); return; }
    const tl=shiftWeighTemLinePOS(it, rt[it.id], []);
    if(tl) lines.push(tl);
  });
  (KHO_ITEMS_CACHE||[]).forEach(it=>{
    if(configuredIds.has(it.id) || !shiftWeighIsTemItemPOS(it) || !need(it)) return;
    const {open,debt}=shiftWeighSplitRtPOS(rt[it.id]);
    if(!open.length) return;
    const reasons=[...(anomalies.get(it.id)||[])];
    if(debt.length || open.some(u=>u.unitBase<0)) reasons.push('Có mã đang âm (nợ FIFO)');
    if(open.length>=2) reasons.push('Đang mở '+open.length+' mã cùng lúc');
    if(!reasons.length) return;
    lines.push(shiftWeighTemLinePOS(it, rt[it.id], reasons));
  });
  return lines.sort(byName);
}

// ── CÂN CÒN LẠI CUỐI CA THEO MÃ ────────────────────────────────────────────
// Mỗi mã đang mở là một ô: nhân viên quét QR (hoặc chọn tay kèm lý do) để xác nhận đang cầm
// đúng mã đó, rồi mới được nhập/cân phần còn lại. Bước quét CHỈ xác nhận có trên tay — không
// mở, không báo hết, không báo mất mã nào.
const SHIFT_WEIGH_DEVIATION_PCT = 25;

function shiftWeighIsTemItemPOS(it){ return UnitEngine.classify.isTemTracked(it) && !UnitEngine.classify.isAtomic(it); }

function shiftWeighSplitRtPOS(node){
  const open=[], debt=[];
  Object.keys(node||{}).forEach(id=>{
    const v=node[id];
    if(id==='__prepLock' || !v || typeof v!=='object' || v.discardPending) return;
    const u={id, code:v.code||id, unitBase:Number(v.unitBase)||0, capacity:Number(v.capacity)||0, openedAt:Number(v.openedAt)||0};
    (v.finishedDebt?debt:open).push(u);
  });
  open.sort((a,b)=>a.openedAt-b.openedAt);
  return {open,debt};
}

function shiftWeighNewUnitPOS(u){
  return {id:u.id,code:u.code||'',openedAt:u.openedAt||0,capacity:Number(u.capacity)||0,state:'pending',confirmVia:'',manualReason:'',
    pickingManual:false,weighed:null,baseline:null,baselineSig:'',weighings:[],countedAt:null,gone:false,seq:0};
}

function shiftWeighTemLinePOS(it, node, reasons){
  const {open}=shiftWeighSplitRtPOS(node);
  if(!open.length) return null;
  return {itemId:it.id,itemName:it.name||'',unit:it.unit||'',mode:'tem',
    layer:reasons.length?'anomaly':'config',reasons,units:open.map(shiftWeighNewUnitPOS),needReload:false};
}

// Lớp 2 — món có bất thường trong ngày. Đọc lỗi thì bỏ qua lớp này (vẫn cân lớp 1), không
// chặn kết ca vì một bước chỉ mang tính bổ sung.
async function shiftWeighAnomalyItemsPOS(day){
  const out=new Map();
  const add=(id,r)=>{ if(!id)return; const a=out.get(id)||[]; if(!a.includes(r))a.push(r); out.set(id,a); };
  // Cảnh báo và Sổ lệch ghi theo NGÀY LỊCH lúc phát sinh (posDateKey), còn ca có thể kết sau
  // nửa đêm (businessDate vẫn là hôm trước) → đọc cả hai ngày, không thì bỏ sót mọi thứ sau 0h.
  const days=[...new Set([day, posDateKey()])];
  const [al,an]=await Promise.all([
    fstore.collection('alerts_gieogieo').where('businessDate','in',days).get()
      .catch(err=>{ console.warn('[Cân cuối ca] không đọc được cảnh báo trong ngày',err); return null; }),
    fstore.collection(STOCK_ANOMALY_COLL).where('businessDate','in',days).get()
      .catch(err=>{ console.warn('[Cân cuối ca] không đọc được Sổ lệch trong ngày',err); return null; })
  ]);
  if(al) al.forEach(d=>{ const a=d.data();
    if(a.type==='untracked_unit_consumption') add(a.itemId,'Bán khi không có tem mở');
    else if(a.type==='allocate_rtdb_error') add(a.itemId,'Lỗi đồng bộ realtime lúc bán'); });
  if(an) an.forEach(d=>{ const a=d.data(); if(a.status==='open') add(a.itemId,'Có dòng Sổ lệch'); });
  return out;
}

function shiftWeighUnitPOS(i,j){
  const l=_shiftInventoryCountStatePOS.lines[i];
  return (l && l.mode==='tem') ? { l, u: l.units[j] } : { l:null, u:null };
}

function shiftWeighQtyError(l,u){
  if(u.weighed===null) return '';
  if(!Number.isFinite(u.weighed) || u.weighed<0) return 'Số còn lại phải từ 0 trở lên';
  if(shiftInventoryCountIntegerPOS(l.unit) && !Number.isInteger(u.weighed)) return 'Đơn vị này chỉ nhận số nguyên';
  // Một chai/hũ không thể chứa nhiều hơn dung tích của nó (chừa 10% sai số cân) — gần như chắc
  // chắn là quên trừ bì hoặc nhầm đơn vị. Chỉ nói tới dung tích, không lộ số sổ.
  if(u.capacity>0 && u.weighed>u.capacity*1.1) return 'Lớn hơn dung tích cả chai/hũ ('+fmtPrepQty(u.capacity)+' '+(l.unit||'')+') — kiểm tra bì hoặc đơn vị';
  return '';
}

function shiftWeighUnitHTML(l,i,u,j){
  const code=escHtmlPos(u.code||'');
  const mo=u.openedAt ? vnDate(u.openedAt).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}) : '';
  const btn=(label,fn,primary)=>`<button type="button" onclick="${fn}" style="flex:1;padding:11px 8px;border-radius:10px;font-weight:700;font-family:inherit;font-size:13px;${primary?'background:#0062AD;color:#fff;border:0':'background:#fff;color:#0062AD;border:1px solid #0062AD'}">${label}</button>`;
  const link=(label,fn)=>`<button type="button" onclick="${fn}" style="margin-top:8px;padding:6px 0;background:none;border:0;color:#888;font-size:12.5px;font-weight:700;font-family:inherit;text-decoration:underline">${label}</button>`;
  let body='';
  if(u.gone){
    body=`<div style="font-size:12.5px;color:#b91c1c;margin-top:6px">Mã này không còn đang mở trên hệ thống — bấm "Tải lại mã" bên dưới.</div>`;
  } else if(u.state==='pending' && !u.pickingManual){
    const scan=posScanAvailable();
    body=`<div style="display:flex;gap:8px;margin-top:8px">
      ${scan?btn('Quét mã',`shiftWeighScanPOS(${i},${j})`,true):''}
      ${btn('Chọn tay',`shiftWeighPickManualPOS(${i},${j},true)`,!scan)}
      ${btn('Không có trên tay',`shiftWeighMissingPOS(${i},${j},true)`,false)}
    </div>`;
  } else if(u.state==='pending'){
    body=`<fieldset style="border:0;padding:0;margin:8px 0 0">
      <legend style="font-size:12.5px;font-weight:700;color:#555;margin-bottom:4px">Vì sao không quét được mã?</legend>
      ${STOCK_MANUAL_REASONS.map((r,k)=>`<label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f0f0;min-height:44px">
        <input type="radio" name="swReason${i}_${j}" value="${r.k}" ${k===0?'checked':''} style="width:20px;height:20px;accent-color:#0062AD">
        <span style="font-size:13px;font-weight:600;color:var(--td)">${r.label}</span></label>`).join('')}
    </fieldset>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${btn('Tôi đang cầm mã này',`shiftWeighManualConfirmPOS(${i},${j})`,true)}
      ${btn('Quay lại',`shiftWeighPickManualPOS(${i},${j},false)`,false)}
    </div>`;
  } else if(u.state==='missing'){
    body=`<div style="font-size:12.5px;color:#b45309;margin-top:6px;line-height:1.5">Không có trên tay — món này sẽ được báo Quản lý và KHÔNG chỉnh số mã nào.</div>
      ${link('Hoàn tác',`shiftWeighMissingPOS(${i},${j},false)`)}`;
  } else {
    const lyDo=(STOCK_MANUAL_REASONS.find(r=>r.k===u.manualReason)||{}).label||'';
    const via=u.confirmVia==='scan' ? 'đã quét' : 'chọn tay: '+escHtmlPos(lyDo);
    const inputId=`swQty${i}_${j}`, errId=`swErr${i}_${j}`;
    const err=shiftWeighQtyError(l,u);
    body=`<div style="font-size:12px;color:#15803d;margin-top:6px">✓ Đang cầm mã này (${via})</div>
      <label for="${inputId}" style="display:block;font-size:12.5px;font-weight:700;color:#555;margin:8px 0 4px">Còn lại trong chai/hũ này</label>
      <div style="display:flex;align-items:center;gap:8px"><input type="number" id="${inputId}" min="0" step="${shiftInventoryCountIntegerPOS(l.unit)?'1':'0.01'}" inputmode="decimal" enterkeyhint="done" aria-describedby="${errId}" value="${u.weighed===null?'':u.weighed}" oninput="shiftWeighQtyPOS(${i},${j},this.value)" style="width:100%;padding:12px;border:1px solid #b9d6eb;border-radius:10px;font:700 16px 'Google Sans',sans-serif;box-sizing:border-box"><span style="color:#0062AD;font-weight:700">${escHtmlPos(l.unit)}</span></div>
      <div id="${errId}" aria-live="polite" style="font-size:13px;color:#b91c1c;min-height:0;margin-top:4px">${escHtmlPos(err)}</div>
      ${itemCanWeighPOS(l.itemId)?`<button type="button" onclick="shiftWeighWeighPOS(${i},${j})" style="width:100%;margin-top:8px;padding:11px;background:#fff;border:1px solid #0062AD;border-radius:10px;color:#0062AD;font-weight:700;font-family:inherit">Cân trừ bì</button>`:''}
      ${link('Bỏ xác nhận mã này',`shiftWeighUnconfirmPOS(${i},${j})`)}`;
  }
  return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-top:8px;background:#fff">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span style="font-family:ui-monospace,Menlo,monospace;font-weight:800;letter-spacing:.5px;color:var(--td)">${code}</span><span style="font-size:11px;color:#888">${mo?'mở '+mo:''}</span></div>
    ${body}</div>`;
}

function shiftWeighLineHTML(l,i){
  const done=shiftInventoryCountLineDonePOS(l);
  const locked=!!l._rtDone;
  return `<div class="kc-sub" id="kcInvLine${i}" style="margin-bottom:11px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><b>${escHtmlPos(l.itemName)}</b><span style="font-size:11px;color:${done?'#15803d':'#0062AD'}">${locked?'Đã chốt':(done?'Đã xong':'Chưa xong')}</span></div>
    ${l.reasons&&l.reasons.length?`<div style="font-size:12px;color:#92400e;background:#fffbeb;border-radius:8px;padding:7px 9px;margin-bottom:6px;line-height:1.5">Cần cân hôm nay vì: ${l.reasons.map(escHtmlPos).join(' · ')}</div>`:''}
    <div style="font-size:12.5px;color:#555;line-height:1.5">Cầm từng chai/hũ đang mở, quét mã rồi cân phần còn lại. Hàng chưa mở không cần quét.</div>
    ${l.units.length?l.units.map((u,j)=>shiftWeighUnitHTML(l,i,u,j)).join(''):'<div style="font-size:12.5px;color:#888;margin-top:8px">Không còn mã nào đang mở — món này không cần cân.</div>'}
    ${(!locked && (l.needReload || l.units.some(u=>u.gone)))?`<button type="button" onclick="shiftWeighReloadLinePOS(${i})" style="width:100%;margin-top:10px;padding:11px;background:#fff7ed;border:1px solid #f59e0b;border-radius:10px;color:#92400e;font-weight:700;font-family:inherit">Tải lại mã của món này</button>`:''}
  </div>`;
}

function shiftWeighRerenderLinePOS(i){
  const l=_shiftInventoryCountStatePOS.lines[i];
  const el=document.getElementById('kcInvLine'+i);
  if(!l || !el){ renderShiftInventoryCountCardPOS(); return; }
  el.outerHTML=shiftWeighLineHTML(l,i);
  kcStepApply('kcInv', _shiftInventoryCountStatePOS.lines.length, k => shiftInventoryCountLineDonePOS(_shiftInventoryCountStatePOS.lines[k]));
}

function shiftWeighConfirmPOS(i,j,via,reason){
  const {u}=shiftWeighUnitPOS(i,j); if(!u) return;
  u.state='confirmed'; u.confirmVia=via; u.manualReason=reason||''; u.pickingManual=false;
  UnitEngine.shift.resetUnit(u);
  shiftWeighRerenderLinePOS(i);
}

async function shiftWeighScanPOS(i,j){
  const {l}=shiftWeighUnitPOS(i,j); if(!l || l._rtDone) return;
  const r=await posScan();
  if(!r.ok){ if(r.error!=='cancelled') toast('⚠️ '+posScanErrorText(r.error)); return; }
  const ma=String(r.code||'').trim().toUpperCase();
  if(!ma) return;
  const k=l.units.findIndex(u=>String(u.code||'').toUpperCase()===ma);
  if(k>=0){
    if(l.units[k].state==='confirmed'){ toast('ℹ️ Mã '+ma+' đã xác nhận rồi'); return; }
    if(k!==j) toast('ℹ️ Đây là mã '+ma+' — đã ghi vào đúng ô của mã đó');
    shiftWeighConfirmPOS(i,k,'scan','');
    return;
  }
  const other=_shiftInventoryCountStatePOS.lines.find(x=>x.mode==='tem'&&x.units.some(u=>String(u.code||'').toUpperCase()===ma));
  if(other){ toast('⚠️ Mã '+ma+' là của '+other.itemName+' — cân ở món đó'); return; }
  const c=await UnitEngine.codes.find(ma);
  if(!c){ toast('⚠️ Không tìm thấy mã '+ma); return; }
  if(chanMaTrung(c)) return;
  const k2=l.units.findIndex(u=>u.id===c.id);
  if(k2>=0){
    const u=l.units[k2];
    if(u.state==='confirmed'){ toast('ℹ️ Mã '+ma+' đã xác nhận rồi'); return; }
    u.code=c.code||ma;   // tem đã cấp lại — hiện đúng mã đang dán trên chai
    shiftWeighConfirmPOS(i,k2,'scan','');
    return;
  }
  const otherById=_shiftInventoryCountStatePOS.lines.find(x=>x.mode==='tem'&&x.units.some(u=>u.id===c.id));
  if(otherById){ toast('⚠️ Mã '+ma+' là của '+otherById.itemName+' — cân ở món đó'); return; }
  if(c.itemId!==l.itemId){ toast('⚠️ Mã '+ma+' là của '+(c.itemName||'nguyên liệu khác')+', không phải '+l.itemName); return; }
  // Bước cân KHÔNG tự mở mã (đúng nguyên tắc: quét ở đây chỉ để xác nhận). Chai đã mở thật mà
  // hệ thống còn ghi chưa mở thì phải đi đúng luồng mở ở Kho, rồi tải lại ô của món này.
  if(c.status==='sealed'){ l.needReload=true; shiftWeighRerenderLinePOS(i); toast('⚠️ Mã '+ma+' chưa được mở trên hệ thống — vào Kho quét mở mã này, rồi bấm "Tải lại mã"'); return; }
  if(c.status==='open'){
    const live=(await UnitEngine.units.ref(c.itemId).child(c.id).once('value').catch(()=>null));
    const v=live&&live.val();
    if(v && !v.finishedDebt && !v.discardPending){ l.needReload=true; shiftWeighRerenderLinePOS(i); toast('ℹ️ Mã '+ma+' vừa mở sau khi tải danh sách — bấm "Tải lại mã"'); return; }
    // Sổ ghi đang mở nhưng realtime không có mã này — cân ở đây không ghi vào đâu được.
    toastAutoReport('⚠️ Mã '+ma+' đang mở trên sổ nhưng mất đồng bộ realtime — không cân được mã này',
      'Mã đang mở bị mất khỏi realtime (phát hiện khi cân cuối ca)', { ref: ma, itemName: l.itemName });
    return;
  }
  toast('⚠️ Mã '+ma+' không còn đang mở (đã báo hết/huỷ) — không cân mã này');
}

function shiftWeighPickManualPOS(i,j,on){
  const {l,u}=shiftWeighUnitPOS(i,j); if(!u || l._rtDone) return;
  u.pickingManual=!!on; shiftWeighRerenderLinePOS(i);
}

function shiftWeighManualConfirmPOS(i,j){
  const el=document.querySelector(`input[name="swReason${i}_${j}"]:checked`);
  if(!el){ toast('⚠️ Chọn lý do không quét được mã'); return; }
  shiftWeighConfirmPOS(i,j,'manual',el.value);
}

function shiftWeighMissingPOS(i,j,on){
  const {l,u}=shiftWeighUnitPOS(i,j); if(!u || l._rtDone) return;
  u.state=on?'missing':'pending'; u.confirmVia=''; u.manualReason=''; u.pickingManual=false;
  UnitEngine.shift.resetUnit(u);
  shiftWeighRerenderLinePOS(i);
}

function shiftWeighUnconfirmPOS(i,j){ shiftWeighMissingPOS(i,j,false); }

// Mốc sổ của mã = unitBase trong RT NGAY LÚC có số cân. Lúc ghi, số mới = số cân + (số lúc
// ghi − mốc): lượt bán xen giữa lúc cân và lúc bấm xác nhận vẫn được giữ, không bị ghi đè.
async function shiftWeighCaptureBaselinePOS(i,j){
  const {l,u}=shiftWeighUnitPOS(i,j); if(!u) return;
  const my=++u.seq;
  try{
    const v=(await UnitEngine.units.ref(l.itemId).child(u.id).once('value')).val();
    if(my!==u.seq) return;
    if(!v || v.finishedDebt || v.discardPending){
      u.baseline=null; u.gone=true;
      toast('⚠️ Mã '+u.code+' không còn đang mở — bấm "Tải lại mã" của món này');
      shiftWeighRerenderLinePOS(i); return;
    }
    u.gone=false; u.baseline=round2(Number(v.unitBase)||0); u.baselineSig=UnitEngine.shift.absSig(v); u.countedAt=vnDate().toISOString();
  }catch(err){
    if(my===u.seq) u.baseline=null;
    console.warn('[Cân cuối ca] không đọc được mốc sổ của mã', u.code, err);
  }
}

function shiftWeighQtyPOS(i,j,value){
  const {l,u}=shiftWeighUnitPOS(i,j); if(!u || l._rtDone) return;
  u.weighed=value===''?null:Number(value); u.weighings=[]; u.baseline=null; u.seq++;
  const errEl=document.getElementById(`swErr${i}_${j}`);
  if(errEl) errEl.textContent=shiftWeighQtyError(l,u);
  if(u._t) clearTimeout(u._t);
  u._t=setTimeout(()=>{ u._t=null; u._p=shiftWeighCaptureBaselinePOS(i,j); },400);
  kcStepRefresh('kcInv');
}

function shiftWeighWeighPOS(i,j){
  const {l,u}=shiftWeighUnitPOS(i,j); if(!u || l._rtDone) return;
  openWeighPad({itemId:l.itemId,unit:l.unit,title:'Cân còn lại · '+l.itemName+' · '+u.code,allowZero:true,
    onDone:(total,weighings)=>{
      if(u._t){ clearTimeout(u._t); u._t=null; }
      u.weighed=round2(total); u.weighings=weighings||[]; u.baseline=null;
      u._p=shiftWeighCaptureBaselinePOS(i,j);
      shiftWeighRerenderLinePOS(i);
    }});
}

async function shiftWeighReloadLinePOS(i){
  const l=_shiftInventoryCountStatePOS.lines[i]; if(!l || l.mode!=='tem' || l._rtDone) return;
  try{
    const node=(await UnitEngine.units.ref(l.itemId).once('value')).val();
    const {open}=shiftWeighSplitRtPOS(node);
    const old=new Map(l.units.map(u=>[u.id,u]));
    l.units=open.map(u=>{ const o=old.get(u.id); return (o && !o.gone) ? o : shiftWeighNewUnitPOS(u); });
    l.needReload=false;
    if(!l.units.length) toast('ℹ️ '+l.itemName+' không còn mã nào đang mở — món này không cần cân');
    shiftWeighRerenderLinePOS(i);
  }catch(err){ toast('⚠️ Không tải lại được mã: '+(err.message||err)); }
}

// Quét lượt dở dang của ngày đang làm + 2 ngày trước (app chết qua đêm thì hôm sau vẫn bù được).
// Ngày cũ đã sạch thì nhớ trong phiên, khỏi đọc lại mỗi lần mở màn.
const _swHealCleanDays = new Set();

async function shiftWeighHealRecentPOS(day, savedCloseDoc, includeToday){
  const days=[];
  if(includeToday) days.push(day);
  [1,2].forEach(n=>{ const d=vnDate(day+'T12:00:00'); d.setDate(d.getDate()-n); days.push(posDateKey(d)); });
  for(const d of days){
    if(d!==day && _swHealCleanDays.has(d)) continue;
    try{
      let pending;
      if(d===day && savedCloseDoc) pending=savedCloseDoc.shiftWeighPending;
      else { const sn=await fstore.collection('daily_closings_gieogieo').doc(d).get(); pending=sn.exists?sn.data().shiftWeighPending:null; }
      if(pending && Object.keys(pending).length) await UnitEngine.shift.healPending(d, pending);
      else if(d!==day) _swHealCleanDays.add(d);
    }catch(err){ console.warn('[Cân cuối ca] quét lượt dở dang ngày', d, 'lỗi', err); }
  }
}

// Dòng lưu vào daily_closings / shift_inventory_counts cho món cân theo mã. countedQty /
// expectedQty chỉ có khi đã chốt được — món chưa xác nhận đủ mã để null, để các nơi đọc số
// đếm (vd BTP âm chờ đối chiếu) không hiểu nhầm là hụt.
function shiftWeighSavedLinePOS(l, now){
  const a=l._applied||{status:'skipped'};
  const ok=a.status==='reconciled';
  const times=l.units.map(u=>u.countedAt).filter(Boolean).sort();
  return {itemId:l.itemId,itemName:l.itemName,unit:l.unit,mode:'tem',layer:l.layer||'config',
    reasons:l.reasons||[], status:a.status, opId:a.opId||null,
    expectedQty:ok?a.book:null, countedQty:ok?a.counted:null, lossQty:ok?a.lossQty:null,
    debtAbsorbed:ok?(a.debtAbsorbed||[]):[], lossAttachedToCode:ok?(a.newestCode||''):'',
    countedAt:times.length?times[times.length-1]:now,
    weighings:[].concat(...l.units.map(u=>u.weighings||[])),
    units:l.units.map(u=>({containerId:u.id,code:u.code||'',state:u.state,confirmVia:u.confirmVia||'',
      manualReason:u.manualReason||'',weighed:u.state==='confirmed'?u.weighed:null,book:u.state==='confirmed'?u.baseline:null}))};
}

async function renderShiftInventoryCountPOS(phase,lines){
  _shiftInventoryCountStatePOS={phase,lines:lines.map(l=>({...l,counted:null,weighings:[]})),
    // Cố định trong suốt màn này — bấm xác nhận lại sau lỗi dùng lại đúng mã lượt, không ghi đôi.
    opSeed:Date.now().toString(36)};
  kcStepReset('kcInv');
  try{
    await Promise.all([ensureKhoItemsPOS(),ensurePrepVesselsPOS(),ensureOriginalPacksPOS()]);
    preloadVesselImagesForItemsPOS(lines.map(l=>l.itemId));
  }catch(err){ console.warn('[Kiểm kê ca] Không nạp được dụng cụ, vẫn đếm tay được:',err); }
  renderShiftInventoryCountCardPOS();
}

function shiftInventoryCountLineDonePOS(l){
  if(l && l.mode==='tem'){
    if(l._rtDone || l._applied) return true;
    return !l.needReload && l.units.every(u=>!u.gone && (u.state==='missing' ||
      (u.state==='confirmed' && u.weighed!==null && !shiftWeighQtyError(l,u))));
  }
  return !!l && Number.isFinite(l.counted) && l.counted>=0 &&
    !(shiftInventoryCountIntegerPOS(l.unit)&&!Number.isInteger(l.counted));
}

function renderShiftInventoryCountCardPOS(){
  const {phase,lines}=_shiftInventoryCountStatePOS;
  const isOpen=phase==='open';
  const coTem=lines.some(l=>l.mode==='tem');
  const box=document.getElementById('shiftBody');
  box.innerHTML=`<div class="kc-title" style="color:#0062AD">Kiểm kê ${isOpen?'đầu':'cuối'} ca</div>
    <div class="kc-card" style="border:1.5px solid #0062AD">
      <div style="font-size:13px;color:#555;margin-bottom:13px">Đếm lượng thực tế còn lại. Số này giúp chuẩn bị hàng cho ngày mai; không tự tạo Refill hoặc nhập hàng.${coTem?' Món có tem: số cân chốt lại đúng mã đó, phần lệch ghi là hao hụt cân cuối ca.':''}</div>
      <div id="kcInvList">${lines.map((l,i)=>{
        if(l.mode==='tem') return shiftWeighLineHTML(l,i);
        const weighed=itemCanWeighPOS(l.itemId);
        return `<div class="kc-sub" style="margin-bottom:11px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><b>${escHtmlPos(l.itemName)}</b><span style="font-size:11px;color:${l.counted===null?'#0062AD':'#15803d'}">${l.counted===null?'Chưa đếm':'Đã đếm'}</span></div>
          <div style="display:flex;align-items:center;gap:8px"><input type="number" id="shiftInvQty${i}" min="0" step="${shiftInventoryCountIntegerPOS(l.unit)?'1':'0.01'}" inputmode="decimal" value="${l.counted===null?'':l.counted}" placeholder="Số thực tế còn lại" oninput="shiftInventoryCountSetQtyPOS(${i},this.value,true)" style="width:100%;padding:12px;border:1px solid #b9d6eb;border-radius:10px;font:700 16px 'Google Sans',sans-serif;box-sizing:border-box"><span style="color:#0062AD;font-weight:700">${escHtmlPos(l.unit)}</span></div>
          ${weighed?`<button onclick="shiftInventoryCountWeighPOS(${i})" style="width:100%;margin-top:8px;padding:11px;background:#fff;border:1px solid #0062AD;border-radius:10px;color:#0062AD;font-weight:700">Cân trừ bì</button>`:''}
        </div>`;
      }).join('')}</div>
      <div id="kcInvNav"></div>
      <div class="kcInv-final">${renderPinInput(isOpen?'shiftInventoryOpenStaff':'shiftInventoryCloseStaff')}</div>
    </div>
    ${isOpen?openStepNavHTML(3,'shiftInventoryOpenBackPOS()'):closeStepNavHTML(6)}
    <button onclick="submitShiftInventoryCountPOS()" class="kc-btn kcInv-final" style="background:#0062AD;color:#fff;margin-bottom:22px">Xác nhận kiểm kê</button>`;
  kcStepApply('kcInv', lines.length, i => shiftInventoryCountLineDonePOS(_shiftInventoryCountStatePOS.lines[i]));
}

function shiftInventoryCountSetQtyPOS(i,value,manual){
  const l=_shiftInventoryCountStatePOS.lines[i];
  if(!l)return;
  l.counted=value===''?null:Number(value);
  l.countedAt=l.counted===null?null:vnDate().toISOString();
  if(manual)l.weighings=[];
  kcStepRefresh('kcInv');
}

function shiftInventoryCountWeighPOS(i){
  const l=_shiftInventoryCountStatePOS.lines[i];
  if(!l)return;
  openWeighPad({itemId:l.itemId,unit:l.unit,title:'Cân '+l.itemName+' còn lại',onDone:(total,weighings)=>{
    l.counted=total;l.countedAt=vnDate().toISOString();l.weighings=weighings||[];renderShiftInventoryCountCardPOS();
  }});
}

function shiftInventoryOpenBackPOS(){
  const hasHandover=_handoverOpenStateDate===shiftState.businessDate&&_handoverOpenState.length;
  renderOpeningReviewPOS(hasHandover?'handover':'cash','_continueAfterHandoverOpen()');
}

async function submitShiftInventoryCountPOS(){
  if(_posSubmitBusy){toast('⏳ Đang xử lý, vui lòng đợi');return;}
  const {phase,lines}=_shiftInventoryCountStatePOS;
  if(!['open','close'].includes(phase)||!lines.length)return;
  const invalid=lines.find(l=>!shiftInventoryCountLineDonePOS(l));
  if(invalid){toast('⚠️ Chưa đếm/cân xong hoặc số không hợp lệ: '+invalid.itemName);return;}
  _posSubmitBusy=true;
  let saved=false;
  try{
    const staffEmp=phase==='open'
      ? await resolveStaffPinAndCheckin('shiftInventoryOpenStaff')
      : await resolveStaffPinWorkedToday('shiftInventoryCloseStaff');
    if(!staffEmp)return;
    const day=shiftState.businessDate;
    // [CÂN THEO MÃ] Chốt từng món có tem TRƯỚC khi lưu phiếu. Mỗi món tự idempotent (mã lượt
    // cố định theo màn này) nên lỗi giữa chừng → bấm xác nhận lại chỉ làm tiếp phần còn thiếu.
    for(const l of lines){
      if(l.mode!=='tem') continue;
      try{
        for(;;){
          try{ await UnitEngine.shift.applyLine(l, day, staffEmp, _shiftInventoryCountStatePOS.opSeed); break; }
          catch(e){
            if(!(e && e.code==='SW_DEVIATION')) throw e;
            const vanGhi=await posConfirm(e.message+'\n\nĐã cân lại và chắc chắn số này đúng?', { okText:'Vẫn ghi', cancelText:'Cân lại' });
            if(!vanGhi){ const idx=lines.indexOf(l); if(_kcStep.kcInv) _kcStep.kcInv.idx=idx; renderShiftInventoryCountCardPOS(); return; }
            l._devAck=true;
          }
        }
      }
      catch(err){
        if(err && err.code==='SW_RELOAD'){
          const idx=lines.indexOf(l);
          l.needReload=true;
          if(_kcStep.kcInv) _kcStep.kcInv.idx=idx;
          renderShiftInventoryCountCardPOS();
        }
        throw err;
      }
    }
    const coll=phase==='open'?'daily_openings_gieogieo':'daily_closings_gieogieo';
    const field=phase==='open'?'shiftInventoryOpenLines':'shiftInventoryCloseLines';
    const ref=fstore.collection(coll).doc(day);
    const snap=await ref.get();
    // [FIX] Trước đây khai `const saved` ở đây, che mất biến `let saved` ngoài try — dòng
    // `saved=true` sau batch.commit() ném TypeError dù phiếu ĐÃ lưu: nhân viên thấy báo lỗi và
    // luồng kết ca không đi tiếp tới khi bấm lại.
    const savedDoc=snap.exists?snap.data():{};
    const now=vnDate().toISOString();
    const counted=lines.map(l=>l.mode==='tem' ? shiftWeighSavedLinePOS(l,now)
      : ({itemId:l.itemId,itemName:l.itemName,unit:l.unit,
      expectedQty:l.expectedQty,countedQty:l.counted,countedAt:l.countedAt||now,weighings:l.weighings}));
    const touched=new Set(counted.map(l=>l.itemId));
    const complete=(savedDoc[field]||[]).filter(l=>!touched.has(l.itemId)).concat(counted);
    const entry={businessDate:day,phase,lines:complete,staff:staffEmp.fullName,
      staffEmployeeId:staffEmp.id,countedAt:now,pendingRecountItemIds:[]};
    const batch=fstore.batch();
    batch.set(ref,{[field]:complete,[phase==='open'?'shiftInventoryOpenAt':'shiftInventoryCloseAt']:now,
      [phase==='open'?'shiftInventoryOpenBy':'shiftInventoryCloseBy']:staffEmp.fullName,
      ...(phase==='close'?{shiftInventoryCloseRecountIds:[]}:{} )},{merge:true});
    batch.set(fstore.collection(SHIFT_INVENTORY_COUNTS_COLL).doc(day+'_'+phase),entry,{merge:true});
    await batch.commit();
    saved=true;
    shiftState[phase==='open'?'opening':'closing']={...(shiftState[phase==='open'?'opening':'closing']||{}),
      [field]:complete,...(phase==='close'?{shiftInventoryCloseRecountIds:[]}:{} )};
    toast('✅ Đã lưu số kiểm kê '+(phase==='open'?'đầu':'cuối')+' ca');
    if(phase==='open')await _continueAfterShiftInventoryOpenPOS();
    else if(await recheckCloseAfterSalesPOS())renderCashRecountRequiredPOS();
    else await _continueAfterShiftInventoryClosePOS();
  }catch(err){
    console.error('[Kiểm kê ca] Lỗi:',err);
    toast(saved?'⚠️ Đã lưu số đếm, nhưng chưa tiếp tục được. Vào lại Ca làm việc để thử tiếp.':'❌ Chưa lưu được kiểm kê: '+(err.message||err));
  }
  finally{_posSubmitBusy=false;}
}

function renderShiftInventoryReviewPOS(phase,nextAction){
  const lines=((shiftState[phase==='open'?'opening':'closing']||{})[phase==='open'?'shiftInventoryOpenLines':'shiftInventoryCloseLines'])||[];
  if(!lines.length){
    if(phase==='open')renderOpeningReviewPOS(_handoverOpenStateDate===shiftState.businessDate&&_handoverOpenState.length?'handover':'cash',nextAction);
    return;
  }
  document.getElementById('shiftBody').innerHTML=`<div class="kc-title">Kiểm kê ${phase==='open'?'đầu':'cuối'} ca</div>
    <div class="kc-card"><b style="color:#0062AD">ĐÃ GHI NHẬN · XEM LẠI</b>
      ${lines.map(l=>`<div class="kc-sub" style="display:flex;justify-content:space-between;gap:8px;margin-top:9px"><span>${escHtmlPos(l.itemName)}</span><b>${
        l.mode==='tem' && l.status!=='reconciled'
          ? (l.status==='unconfirmed'?'Chưa xác nhận đủ mã — đã báo Quản lý':'Không có mã đang mở')
          : Number(l.countedQty).toLocaleString('vi-VN')+' '+escHtmlPos(l.unit||'')+(l.mode==='tem' && Math.abs(Number(l.lossQty)||0)>0.005
            ? ' · '+(l.lossQty>0?'hụt ':'dư ')+Math.abs(l.lossQty).toLocaleString('vi-VN') : '')
      }</b></div>`).join('')}
    </div>${openStepNavHTML(3,'shiftInventoryOpenBackPOS()')}
    <button onclick="${nextAction}" class="kc-btn" style="background:#0062AD;color:#fff;margin-bottom:22px">Tiếp tục →</button>`;
}

// [BỎ-KIỂM-KÊ-CHUYỂN-KHOẢN] TRƯỚC ĐÂY bước này bắt nhân viên mở app ngân hàng và gõ tay tổng
// tiền chuyển khoản trong ngày, rồi đối soát MÙ (không cho thấy số hệ thống, chỉ trả PASS/FAIL).
//
// Vì sao bỏ: đối soát mù chỉ có ý nghĩa với thứ nhân viên ĐẾM ĐƯỢC và có thể sai lệch thật —
// tức TIỀN MẶT trong két. Còn chuyển khoản thì mỗi bill đã được chính app ghi nhận ngay lúc bán
// (orderBankAmountPOS đọc thẳng từ đơn hàng), không có "bản đếm độc lập" nào để đối chiếu:
// nhân viên chỉ có thể cộng lại đúng con số mà app đã tự biết. Bắt gõ lại vừa vô nghĩa, vừa
// thành cửa ải chặn kết ca — sai một giao dịch là FAIL mà lại không được xem số nào để dò.
//
// Giờ: hệ thống TỰ chốt doanh thu chuyển khoản (số nó đã tự ghi), đánh dấu bankAutoConfirmed
// rồi đi thẳng sang Handover. Đối soát TIỀN MẶT giữ nguyên 100% cơ chế mù — đó mới là chỗ
// nguyên tắc blind reconciliation thực sự có tác dụng.
async function _continueAfterPrepCount() {
  let lines;
  try { lines = await computeShiftInventoryCountLinesPOS('close'); }
  catch(err){ document.getElementById('shiftBody').innerHTML='<div class="kc-card">Không tải được danh sách nguyên liệu cần kiểm kê cuối ca.</div><button onclick="_continueAfterPrepCount()" class="kc-btn" style="background:#0062AD;color:#fff">Thử lại</button>'; return; }
  if(lines.length){ await renderShiftInventoryCountPOS('close',lines); return; }
  await _continueAfterShiftInventoryClosePOS();
}

async function _continueAfterShiftInventoryClosePOS() {
  // [BTP — ÂM CHỜ ĐỐI CHIẾU] Đã có số cuối cùng của BTP + NL — hỏi nhân viên đã dùng loại
  // nào để bù (nếu có) trước khi sang bàn giao tiền.
  if (await prepShortageAskIfNeeded()) return;
  const expectedBank = computeExpectedBankPOS(shiftState.businessDate);
  try {
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      status: 'bank_passed',
      bankPassedAt: vnDate().toISOString(),
      // Cờ trung thực cho Quản lý: con số này do HỆ THỐNG tự chốt, KHÔNG phải nhân viên xác minh.
      bankAutoConfirmed: true,
      finalExpectedBank: expectedBank,
      finalActualBank: expectedBank,   // app tự xác nhận từng giao dịch lúc bán → không có số "thực tế" tách rời
      finalBankVariance: 0,
      ...(expectedBank <= 0 ? { bankSkipped: true } : {})
    }, { merge: true });
    shiftState.closing = shiftState.closing || {};
    shiftState.closing.status = 'bank_passed';
    shiftState.closing.bankPassedAt = vnDate().toISOString();
  } catch (err) {
    // Không chặn kết ca vì lỗi mạng ở bước ghi nhận này — tiền mặt (bước quan trọng) đã khớp rồi.
    console.warn('[Kết ca] Không lưu được trạng thái chuyển khoản tự xác nhận:', err);
  }
  renderShiftHandoverForm();
}

async function renderShiftHandoverForm() {
  const box = document.getElementById('shiftBody');
  showLoading(box);
  let retainDefault = 0;
  try {
    const finDoc = await fstore.collection('finance_gieogieo').doc('current').get();
    if (finDoc.exists) retainDefault = Number(finDoc.data().openingCashNextDayDefault) || 0;
  } catch (err) { console.warn('[Handover] Không đọc được mức giữ lại mặc định:', err); }
  const actualCash = shiftState.closing.finalActualCash || 0;
  const toHandOver = Math.max(0, actualCash - retainDefault);
  box.innerHTML = `
    <div class="kc-title">Bàn giao tiền</div>
    <div class="kc-card">
      <div style="font-size:14px;color:var(--td);font-weight:700;">Tiền giữ lại (đầu ca ngày mai): <span>${retainDefault.toLocaleString('vi-VN')}đ</span></div>
      <div style="font-size:14px;color:var(--td);font-weight:700;margin-top:4px;">Tiền cần bàn giao: <b id="shiftHandoverAmt" style="color:#E23A5D;">${toHandOver.toLocaleString('vi-VN')}đ</b></div>
      <div class="kc-sub" style="margin-top:16px;">
        <div style="font-size:11.5px;font-weight:800;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Tiền giữ lại thực tế</div>
        <input id="shiftRetainAmt" type="number" value="${retainDefault}" oninput="shiftUpdateHandoverPreview(${actualCash})" style="width:100%;border:none;outline:none;background:transparent;font-family:inherit;font-size:18px;font-weight:800;color:var(--td);">
      </div>
      ${renderPinInput('shiftRecipient', 'Người nhận bàn giao (bắt buộc mã PIN — kể cả chủ quán, để không ai tự "ghi tên mình" mà không có PIN xác thực)')}
    </div>
    ${closeStepNavHTML(7)}
    <button onclick="submitShiftHandover(${actualCash})" class="kc-btn" style="background:var(--gd);color:#fff;margin-bottom:22px;">Xác nhận đã bàn giao</button>
  `;
}

function shiftUpdateHandoverPreview(actualCash) {
  const retain = Number(document.getElementById('shiftRetainAmt').value) || 0;
  const handover = Math.max(0, actualCash - retain);
  document.getElementById('shiftHandoverAmt').textContent = handover.toLocaleString('vi-VN') + 'đ';
}

async function submitShiftHandover(actualCash) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitShiftHandoverImpl(actualCash); } finally { _posSubmitBusy = false; }
}

async function _submitShiftHandoverImpl(actualCash) {
  const retainedAmount = Number(document.getElementById('shiftRetainAmt').value) || 0;
  // [CẬP NHẬT — mục 4.2 NEXT_SESSION_TODO.md] Người nhận bàn giao giờ BẮT BUỘC
  // phải là nhân viên có PIN trong hệ thống, KHÔNG còn cho gõ tên tự do như đề
  // xuất ban đầu trong TODO — lý do (chủ quán xác nhận): nếu cho tự do, ngay cả
  // CHỦ QUÁN cũng có thể tự gõ tên mình vào mà không có gì xác thực; ép PIN thì
  // chủ quán vẫn tạo được PIN cho chính mình bên Management như 1 nhân viên bình
  // thường — không có ngoại lệ "người ngoài hệ thống" cho bước ký nhận tiền này.
  const recipientEmp = await resolveStaffPinWorkedToday('shiftRecipient');
  if (!recipientEmp) return;
  const recipient = recipientEmp.fullName;
  const handedOverAmount = Math.max(0, actualCash - retainedAmount);
  try {
    await fstore.collection('handover_records_gieogieo').doc(shiftState.businessDate).set({
      businessDate: shiftState.businessDate, actualCash, retainedAmount, handedOverAmount,
      recipient, recipientEmployeeId: recipientEmp.id, staff: shiftState.closing.closingStaff || '', confirmedAt: vnDate().toISOString()
    });
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      status: 'handed_over', handoverAt: vnDate().toISOString(),
      retainedAmount, handedOverAmount, handoverRecipient: recipient
    }, { merge: true });
    toast('✅ Đã bàn giao — hoàn tất ca hôm nay');
    shiftState.closing = { ...(shiftState.closing || {}), status: 'handed_over',
      handoverAt: vnDate().toISOString(), retainedAmount, handedOverAmount, handoverRecipient: recipient };
    renderShiftDashboard();
  } catch (err) {
    console.error('submitShiftHandover failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

PosGieoMods.shiftClosing = true;
