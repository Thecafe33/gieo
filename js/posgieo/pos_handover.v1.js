// Tách từ posgieo.html dòng 8675–9600 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_handover.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).handover = 'dang';

// 🆕 GIAO CA GIỮA NGÀY — ĐẾM TIỀN 2 NGƯỜI (Giai đoạn 1)
// ----------------------------------------------------------------------------
// VẤN ĐỀ ĐANG CHỮA: cả ngày chỉ có 1 phương trình tiền mặt (mở ca → kết ca), nên
// mọi chênh lệch phát hiện lúc 21h là chênh lệch của CẢ NGÀY — không tách được
// ca sáng hay ca chiều gây ra. Nặng hơn: ca chiều bị CHẶN kết ca vì khoản thiếu
// do ca sáng để lại, và cách duy nhất thoát ra là nới dung sai (nới rồi thì che
// luôn mọi lệch thật sau này).
//
// CÁCH CHỮA: cắt ngày thành nhiều ĐOẠN CA (shift_segments_gieogieo), mỗi đoạn
// có đúng một NGƯỜI GIỮ KÉT và một phương trình riêng:
//     expected = startCash + tiền mặt bán trong đoạn − chi tiền mặt trong đoạn
// Vốn đầu đoạn sau = SỐ TIỀN THẬT hai người vừa đếm khớp ở cuối đoạn trước
// (KHÔNG phải expected) — nhờ vậy thiếu hụt của ca trước không chảy sang ca sau.
//
// QUY TẮC ĐÃ CHỐT VỚI CHỦ QUÁN:
//   1. BẮT BUỘC giao ca khi người đang giữ két bấm check-out mà ngày chưa đóng
//      và vẫn còn người khác đang trong ca. Ngoài ra bấm tay được bất cứ lúc nào.
//   2. Mốc cắt = lúc bấm "Bắt đầu đếm" (handoverStartedAt), KHÔNG phải lúc đếm
//      xong. Bill trước mốc thuộc ca trước. Nhân viên tự chọn lúc vắng khách.
//   3. Lệch so với sổ sách dù chỉ 1.000đ → bắt đếm lại ĐÚNG MỘT lần nữa. Sau
//      lần đó lệch bao nhiêu cũng CHO QUA và ghi nhận — không chặn người đã hết
//      giờ ở lại giữa quầy (chốt chặn cứng vẫn nằm nguyên ở bước kết ca).
//   4. BẮT BUỘC 2 người đếm độc lập. Người nhận đếm khớp số người giao vừa đếm
//      thì mới chốt — hai người cùng ra một số mới là số thật của két.
//   5. KHÔNG rút tiền ra khỏi két lúc giao ca. Két để nguyên, giao trọn.
//
// NGUYÊN TẮC ĐẾM MÙ vẫn giữ như phần kết ca: không hiện expected, không hiện
// chênh lệch, không hiện số người kia vừa đếm. Chỉ nói "đếm lại", không nói
// thiếu/thừa bao nhiêu.
// ============================================================================
const SEG_COLL = 'shift_segments_gieogieo';

const HANDOVER_MAX_BLIND_ROUNDS = 3;

function segDocId(businessDate, seq) { return `${businessDate}_${seq}`; }

let _segments = [];

let _handover = null;

let _handoverBusy = false;

async function loadSegmentsPOS(businessDate) {
  try {
    const snap = await fstore.collection(SEG_COLL).where('businessDate', '==', businessDate).get();
    _segments = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  } catch (err) {
    console.warn('loadSegmentsPOS lỗi (bỏ qua, không chặn màn Ca làm việc):', err);
    _segments = [];
  }
  return _segments;
}

function currentSegmentPOS() {
  for (let i = _segments.length - 1; i >= 0; i--) if (_segments[i].status === 'open') return _segments[i];
  return null;
}

// ensureOpeningSegmentPOS — ngày đã mở ca TRƯỚC khi có tính năng này (hoặc lỡ
// rớt mạng đúng lúc mở ca) sẽ không có đoạn 1. Tạo bù từ chính doc mở ca, để
// mọi nhánh phía sau luôn có một đoạn đang mở mà không phải xử lý riêng.
async function ensureOpeningSegmentPOS() {
  const cur = currentSegmentPOS();
  if (cur) return cur;
  if (_segments.length) return null;            // có đoạn nhưng đều đã đóng → ngày đã kết ca
  if (!shiftState.opening) return null;         // chưa mở ca → chưa có két nào để giao
  const businessDate = shiftState.businessDate;
  const seg = {
    businessDate, seq: 1,
    custodianId: shiftState.opening.staffEmployeeId || '',
    custodianName: shiftState.opening.staff || '',
    startAt: shiftState.opening.createdAt || vnDate().toISOString(),
    startType: 'open',
    startCash: Number(shiftState.opening.openingCash) || 0,
    status: 'open',
    createdAt: vnDate().toISOString()
  };
  try {
    await fstore.collection(SEG_COLL).doc(segDocId(businessDate, 1)).set(seg, { merge: true });
    _segments = [{ id: segDocId(businessDate, 1), ...seg }];
  } catch (err) {
    console.warn('ensureOpeningSegmentPOS lỗi:', err);
    return null;
  }
  return currentSegmentPOS();
}

// ---------- cộng tiền theo CỬA SỔ THỜI GIAN ----------
// Bill không có trường nhân viên (kiểm tra lại orders_gieogieo: chỉ có createdAt),
// nên chia bill về ca hoàn toàn dựa trên dấu thời gian. fromMs === null nghĩa là
// "đoạn đầu tiên của ngày" — lấy hết từ đầu ngày, giữ y hệt cách tính cũ để ngày
// KHÔNG có giao ca cho ra đúng con số như trước khi có tính năng này.
function _orderCreatedMsPOS(o) {
  if (o && o.createdAt) { const t = Date.parse(o.createdAt); if (!isNaN(t)) return t; }
  return null;   // bill cũ thiếu dấu thời gian → quy về đoạn đầu tiên
}

function cashSalesWindowPOS(businessDate, fromMs, toMs) {
  const displayDate = posDateKeyToDisplay(businessDate);
  let total = 0, unattributed = 0;
  orders.filter(o => o.date === displayDate).forEach(o => {
    const amt = orderCashAmountPOS(o);
    if (!amt) return;
    const ms = _orderCreatedMsPOS(o);
    // Bill thiếu dấu thời gian chỉ được tính (và chỉ được báo) ở đoạn đầu tiên —
    // báo lại ở đoạn sau sẽ khiến Quản lý tưởng cùng số tiền đó lặp ở nhiều đoạn.
    if (ms === null) { if (fromMs === null) { unattributed += amt; total += amt; } return; }
    if ((fromMs === null || ms >= fromMs) && ms < toMs) total += amt;
  });
  return { total, unattributed };
}

// [BUG#34 FIX] FAIL-CLOSED, cùng lý do với computeExpectedCashPOS(): nuốt lỗi đọc ở đây làm
// Expected của đoạn ca cao hơn thực tế đúng bằng tiền đã chi, và hai người đếm giao ca bị báo
// lệch oan (rồi lệch đó đi vào sổ). Lỗi đọc thì dừng, không đoán 0.
async function cashExpensesWindowPOS(businessDate, fromMs, toMs) {
  let total = 0;
  {
    const snap = await fstore.collection('expenses_gieogieo').where('date', '==', businessDate).get()
      .catch(err => { throw new Error('Không đọc được chi phí trong ngày — chưa đối soát được, thử lại: ' + (err.message || err)); });
    snap.docs.map(d => d.data())
      .filter(isExpenseIncludedInCash)   // [BUG#36 FIX] loại cả 'voided', xem hàm đó
      .forEach(e => {
        const amt = Number(e.amount) || 0;
        if (!amt) return;
        const t = e.createdAt ? Date.parse(e.createdAt) : NaN;
        if (isNaN(t)) { if (fromMs === null) total += amt; return; }
        if ((fromMs === null || t >= fromMs) && t < toMs) total += amt;
      });
  }
  return total;
}

// computeSegmentExpectedPOS — CHỈ dùng để so sánh trong bộ nhớ. Tuyệt đối không
// render giá trị trả về ra DOM (giữ đúng nguyên tắc đếm mù của phần kết ca).
async function computeSegmentExpectedPOS(seg, cutMs) {
  const fromMs = (Number(seg.seq) || 1) <= 1 ? null : Date.parse(seg.startAt);
  const sales = cashSalesWindowPOS(seg.businessDate, fromMs, cutMs);
  const cashExpenses = await cashExpensesWindowPOS(seg.businessDate, fromMs, cutMs);
  return {
    expected: (Number(seg.startCash) || 0) + sales.total - cashExpenses,
    cashSales: sales.total, cashExpenses, unattributedSales: sales.unattributed
  };
}

// Bill TIỀN MẶT phát sinh sau mốc cắt — tiền của bill đó đang nằm trong két đang
// đếm, nên phải dời mốc và đếm lại. Bill chuyển khoản không đụng tới két, bỏ qua.
function cashBillsAfterPOS(businessDate, sinceMs) {
  const displayDate = posDateKeyToDisplay(businessDate);
  return orders.filter(o => o.date === displayDate && orderCashAmountPOS(o) > 0)
    .filter(o => { const ms = _orderCreatedMsPOS(o); return ms !== null && ms >= sinceMs; });
}

async function handoverTolerancePOS() {
  try {
    const doc = await fstore.collection('finance_gieogieo').doc('current').get();
    if (!doc.exists) return 0;
    const d = doc.data();
    if (d.handoverToleranceAmount != null) return Number(d.handoverToleranceAmount) || 0;
    return Math.round((Number(d.cashToleranceAmount) || 0) / 2);   // mặc định: nửa dung sai ngày
  } catch (err) { return 0; }
}

// ---------- băng cảnh báo "đang giao ca" trên màn bán hàng ----------
// Không chặn bán (chặn doanh thu là sai về vận hành) — chỉ báo thật rõ, vì mỗi
// bill tiền mặt lúc này đều khiến hai người phải đếm lại từ đầu.
function setHandoverBannerPOS(on) {
  let el = document.getElementById('handoverBanner');
  if (!on) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.id = 'handoverBanner';
  el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:400;background:#c0392b;color:#fff;'
    + "font-family:'Google Sans',sans-serif;font-size:13px;font-weight:700;text-align:center;"
    + 'padding:11px 14px calc(11px + env(safe-area-inset-bottom));box-shadow:0 -4px 16px rgba(0,0,0,.22);';
  el.textContent = '⏸ ĐANG ĐẾM TIỀN GIAO CA — thu thêm tiền mặt lúc này sẽ phải đếm lại từ đầu';
  document.body.appendChild(el);
}

// ---------- điều kiện BẮT BUỘC giao ca ----------
async function handoverRequiredOnCheckOutPOS(emp) {
  try {
    if (!shiftState.businessDate || shiftState.businessDate !== posDateKey()) return false;
    const closeSnap = await fstore.collection('daily_closings_gieogieo').doc(posDateKey()).get();
    if (closeSnap.exists && closeSnap.data().status === 'closed') return false;  // đã đóng ngày, không còn két để giao
    await loadSegmentsPOS(posDateKey());
    const seg = await ensureOpeningSegmentPOS();
    if (!seg) return false;                                        // chưa mở ca
    if (String(seg.custodianId || '') !== String(emp.id)) return false;  // không phải người giữ két
    return _employeeShiftsTodayCache.some(s => !s.checkedOutAt && s.employeeId !== emp.id);
  } catch (err) {
    // Lỗi mạng/quyền → KHÔNG chặn check-out. Giữ người ta lại vì app không đọc
    // được Firestore là tệ hơn nhiều so với thiếu một bản ghi giao ca.
    console.warn('handoverRequiredOnCheckOutPOS lỗi (bỏ qua, cho check-out):', err);
    return false;
  }
}

// ---------- luồng đếm giao ca ----------
async function openHandoverPOS(reason) {
  showScreen('caLamViecScreen');
  const box = document.getElementById('shiftBody');
  showLoading(box);
  await loadSegmentsPOS(posDateKey());
  const seg = await ensureOpeningSegmentPOS();
  if (!seg) {
    box.innerHTML = '<div style="text-align:center;padding:30px 16px;color:#999;font-size:13px;">Chưa mở ca hôm nay — không có két nào để giao.</div>'
      + '<button onclick="renderShiftDashboard()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">← Quay lại</button>';
    return;
  }
  _handover = {
    seg, reason: reason || 'manual',
    cutMs: null, cutIso: null,
    round: 1, phase: 'intro',
    out: null, in: null,
    outDenoms: cfEmptyDenoms(), inDenoms: cfEmptyDenoms(),
    recountForced: false, countMode: 'blind', restartedByBill: 0
  };
  renderHandoverIntroPOS();
}

function renderHandoverIntroPOS() {
  const box = document.getElementById('shiftBody');
  const seg = _handover.seg;
  const others = _employeeShiftsTodayCache.filter(s => !s.checkedOutAt && s.employeeId !== seg.custodianId);
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Giao ca — đoạn ${seg.seq}</div>
      <div style="font-size:13.5px;color:var(--td);">Người đang giữ két: <b>${seg.custodianName || '—'}</b></div>
      <div style="font-size:12.5px;color:#999;margin-top:4px;">Đang trong ca cùng lúc: ${others.length ? others.map(s => s.employeeName).join(', ') : '<b style="color:#c0392b">chưa có ai khác check-in</b>'}</div>
    </div>
    <div style="background:#fef3c7;border:1.5px solid #fcd34d;border-radius:16px;padding:14px 16px;margin:0 0 14px;">
      <div style="font-size:13.5px;font-weight:800;color:#92400e;margin-bottom:6px;">Chọn lúc không có khách đang order</div>
      <div style="font-size:12.5px;color:#92400e;line-height:1.6;">
        Bấm <b>Bắt đầu đếm</b> là chốt mốc: mọi bill trước mốc thuộc ca đang giao, sau mốc thuộc ca nhận.
        Nếu có khách <b>trả tiền mặt</b> trong lúc đang đếm, hệ thống sẽ dời mốc và bắt đếm lại từ đầu.
      </div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div style="font-size:12.5px;color:#666;line-height:1.65;">
        Hai người đếm <b>riêng từng lượt</b>, không nhìn số của nhau. Khớp nhau mới chốt.
        Két <b>giao trọn</b>, không rút bớt tờ nào.
      </div>
    </div>
    ${others.length ? '' : '<div style="font-size:12.5px;color:#c0392b;font-weight:600;margin:0 0 12px;padding:0 2px;">Người nhận phải check-in trước thì mới ký nhận được.</div>'}
    <button onclick="beginHandoverCountPOS()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Bắt đầu đếm</button>
    <button onclick="cancelHandoverPOS()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">Huỷ, quay lại</button>
  `;
}

function beginHandoverCountPOS() {
  const now = Date.now();
  _handover.cutMs = now;
  _handover.cutIso = vnDate(now).toISOString();
  _handover.phase = 'out';
  startShiftWorkflowPOS('handover', _handover.cutIso);
  // Băng chỉ bật khi rời màn này sang màn bán hàng (xem showScreen) — bật ngay ở
  // đây sẽ che mất nút "Xác nhận số đã đếm" nằm sát đáy.
  setHandoverBannerPOS(false);
  renderHandoverCountPOS();
}

function cancelHandoverPOS() {
  stopShiftWorkflowPOS('handover');
  _handover = null;
  setHandoverBannerPOS(false);
  renderShiftDashboard();
}

function renderHandoverCountPOS() {
  const box = document.getElementById('shiftBody');
  const h = _handover;
  const joint = h.phase === 'joint';
  const isOut = h.phase === 'out';
  const title = joint ? 'Đếm chung, có cả hai người chứng kiến'
    : isOut ? 'NGƯỜI GIAO đếm' : 'NGƯỜI NHẬN đếm';
  const sub = joint ? 'Hai lần đếm riêng vẫn không khớp. Đếm chung một lần, cả hai cùng ký.'
    : isOut ? 'Đếm toàn bộ tiền trong két. Người nhận không nhìn màn hình lúc này.'
      : 'Đếm lại từ đầu. Không hỏi số người giao vừa đếm — khớp nhau mới chốt được.';
  const denoms = isOut || joint ? h.outDenoms : h.inDenoms;
  const fn = isOut || joint ? 'handoverChangeOutDenomPOS' : 'handoverChangeInDenomPOS';
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">${title} · lượt ${h.round}</div>
      <div style="font-size:12.5px;color:#999;margin:2px 0 10px;line-height:1.55;">${sub}</div>
      <div id="handoverGrid" style="display:flex;flex-direction:column;gap:6px;"></div>
      <div style="text-align:right;font-weight:700;font-size:16px;color:var(--gd);margin-top:10px;" id="handoverTotal">0đ</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      ${renderPinInput('handoverSigner', joint ? 'PIN NGƯỜI GIAO' : (isOut ? 'PIN người giao' : 'PIN người nhận'))}
      ${joint ? renderPinInput('handoverSigner2', 'PIN NGƯỜI NHẬN') : ''}
    </div>
    <button onclick="submitHandoverCountPOS()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Xác nhận số đã đếm</button>
    <button onclick="cancelHandoverPOS()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">Huỷ giao ca</button>
  `;
  cfRenderDenomGrid('handoverGrid', denoms, fn);
  document.getElementById('handoverTotal').textContent = cfDenomTotal(denoms).toLocaleString('vi-VN') + 'đ';
}

function _handoverChangeDenomPOS(obj, d, delta) {
  const next = (obj[d] || 0) + delta;
  if (next < 0) return;
  obj[d] = next;
  document.getElementById('handoverGrid-qty-' + d).textContent = next;
  document.getElementById('handoverTotal').textContent = cfDenomTotal(obj).toLocaleString('vi-VN') + 'đ';
}

function handoverChangeOutDenomPOS(d, delta) { _handoverChangeDenomPOS(_handover.outDenoms, d, delta); }

function handoverChangeInDenomPOS(d, delta) { _handoverChangeDenomPOS(_handover.inDenoms, d, delta); }

async function submitHandoverCountPOS() {
  if (_handoverBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _handoverBusy = true;
  try { await _submitHandoverCountImplPOS(); } finally { _handoverBusy = false; }
}

async function _submitHandoverCountImplPOS() {
  const h = _handover;
  if (!h) return;
  const seg = h.seg;

  if (h.phase === 'joint') {
    const a = await resolveStaffPinWorkedToday('handoverSigner');
    if (!a) return;
    const b = await resolveStaffPinWorkedToday('handoverSigner2');
    if (!b) return;
    if (a.id === b.id) { toast('⚠️ Hai chữ ký phải là hai người khác nhau'); return; }
    if (String(seg.custodianId || '') !== String(a.id)) { toast(`⚠️ Ô đầu phải là PIN của người đang giữ két (${seg.custodianName})`); return; }
    const total = cfDenomTotal(h.outDenoms);
    h.out = { denoms: { ...h.outDenoms }, total, byId: a.id, byName: a.fullName, at: vnDate().toISOString() };
    h.in = { denoms: { ...h.outDenoms }, total, byId: b.id, byName: b.fullName, at: vnDate().toISOString() };
    h.countMode = 'joint';
    await _afterHandoverAgreedPOS(total);
    return;
  }

  if (h.phase === 'out') {
    const emp = await resolveStaffPinWorkedToday('handoverSigner');
    if (!emp) return;
    if (String(seg.custodianId || '') !== String(emp.id)) {
      toast(`⚠️ Người giao phải là người đang giữ két (${seg.custodianName || '—'})`);
      return;
    }
    h.out = { denoms: { ...h.outDenoms }, total: cfDenomTotal(h.outDenoms), byId: emp.id, byName: emp.fullName, at: vnDate().toISOString() };
    h.phase = 'in';
    h.inDenoms = cfEmptyDenoms();
    delete _pinFieldForceAsk.handoverSigner;
    renderHandoverCountPOS();
    return;
  }

  // phase === 'in'
  const emp = await resolveStaffPinWorkedToday('handoverSigner');
  if (!emp) return;
  if (String(emp.id) === String(h.out.byId)) { toast('⚠️ Người nhận phải là người khác — không tự ký cả hai lượt'); return; }
  const inTotal = cfDenomTotal(h.inDenoms);
  h.in = { denoms: { ...h.inDenoms }, total: inTotal, byId: emp.id, byName: emp.fullName, at: vnDate().toISOString() };

  if (inTotal !== h.out.total) {
    // Két chỉ có MỘT số tiền thật — hai bản lệch nhau nghĩa là có người đếm nhầm,
    // chưa liên quan gì tới thiếu hụt. Không nói bên nào cao hơn.
    h.round++;
    h.phase = (h.round > HANDOVER_MAX_BLIND_ROUNDS) ? 'joint' : 'out';
    h.outDenoms = cfEmptyDenoms();
    h.inDenoms = cfEmptyDenoms();
    toast(h.phase === 'joint' ? '⚠️ Vẫn chưa khớp — chuyển sang đếm chung' : '⚠️ Hai lần đếm chưa khớp — đếm lại');
    renderHandoverCountPOS();
    return;
  }
  await _afterHandoverAgreedPOS(inTotal);
}

// _afterHandoverAgreedPOS — hai người đã ra cùng một số. Còn 2 cửa nữa trước khi chốt.
async function _afterHandoverAgreedPOS(agreedTotal) {
  const h = _handover;
  const seg = h.seg;

  // Cửa 1: có bill TIỀN MẶT phát sinh sau mốc cắt → tiền đó đang nằm trong két
  // vừa đếm nhưng thuộc về ca sau. Dời mốc tới bây giờ và đếm lại.
  const late = cashBillsAfterPOS(seg.businessDate, h.cutMs);
  if (late.length) {
    h.restartedByBill++;
    h.cutMs = Date.now();
    h.cutIso = vnDate(h.cutMs).toISOString();
    h.round++;
    h.phase = 'out';
    h.outDenoms = cfEmptyDenoms();
    h.inDenoms = cfEmptyDenoms();
    toast(`⚠️ Có ${late.length} bill tiền mặt phát sinh trong lúc đếm — đếm lại`);
    renderHandoverCountPOS();
    return;
  }

  // Cửa 2: lệch so với sổ sách dù chỉ 1.000đ → bắt đếm lại ĐÚNG một lần nữa.
  // Sau lần đó cho qua bất kể lệch bao nhiêu (quy tắc đã chốt).
  let metrics;
  try {
    metrics = await computeSegmentExpectedPOS(seg, h.cutMs);
  } catch (err) {
    console.error('computeSegmentExpectedPOS lỗi', err);
    toast('❌ Không tính được đối chiếu: ' + (err.code || err.message || err));
    return;
  }
  const variance = agreedTotal - metrics.expected;
  if (variance !== 0 && !h.recountForced) {
    h.recountForced = true;
    h.round++;
    h.phase = 'out';
    h.outDenoms = cfEmptyDenoms();
    h.inDenoms = cfEmptyDenoms();
    toast('⚠️ Số tiền chưa khớp — đếm lại một lần nữa');
    renderHandoverCountPOS();
    return;
  }
  await _finishHandoverPOS(agreedTotal, metrics, variance);
}

async function _finishHandoverPOS(endCash, metrics, variance) {
  const h = _handover;
  const seg = h.seg;
  const box = document.getElementById('shiftBody');
  box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Đang ghi bàn giao...</div>';
  const tolerance = await handoverTolerancePOS();
  const withinTolerance = Math.abs(variance) <= tolerance;
  const nextSeq = (Number(seg.seq) || 1) + 1;
  const nowIso = vnDate().toISOString();
  try {
    await fstore.collection(SEG_COLL).doc(segDocId(seg.businessDate, seg.seq)).set({
      endAt: h.cutIso, endType: 'handover', endCash,
      expectedEndCash: metrics.expected, variance, withinTolerance,
      cashSales: metrics.cashSales, cashExpenses: metrics.cashExpenses,
      unattributedSales: metrics.unattributedSales || 0,
      outgoingCount: h.out, incomingCount: h.in,
      countRounds: h.round, countMode: h.countMode,
      recountForced: h.recountForced, restartedByBill: h.restartedByBill,
      agreedAt: nowIso, status: 'closed',
      nextCustodianId: h.in.byId, nextCustodianName: h.in.byName
    }, { merge: true });

    await fstore.collection(SEG_COLL).doc(segDocId(seg.businessDate, nextSeq)).set({
      businessDate: seg.businessDate, seq: nextSeq,
      custodianId: h.in.byId, custodianName: h.in.byName,
      startAt: h.cutIso, startType: 'handover', startCash: endCash,
      prevSeq: seg.seq, prevCustodianName: h.out.byName,
      status: 'open', createdAt: nowIso
    }, { merge: true });

    if (!withinTolerance) {
      // Không chặn nhân viên, nhưng Quản lý phải biết NGAY — đây là toàn bộ lý do
      // tính năng này tồn tại.
      try {
        await fstore.collection('alerts_gieogieo').add({
          type: 'handover_cash_variance',
          title: 'Lệch tiền giao ca',
          businessDate: seg.businessDate, seq: seg.seq,
          outgoingName: h.out.byName, outgoingId: h.out.byId,
          incomingName: h.in.byName, incomingId: h.in.byId,
          startCash: Number(seg.startCash) || 0,
          cashSales: metrics.cashSales, cashExpenses: metrics.cashExpenses,
          expectedCash: metrics.expected, countedCash: endCash,
          variance, tolerance,
          countRounds: h.round, countMode: h.countMode,
          recountForced: h.recountForced,
          cutAt: h.cutIso, agreedAt: nowIso,
          status: 'new', createdAt: nowIso
        });
      } catch (err) { console.warn('[Giao ca] Không tạo được cảnh báo (đã ghi đoạn ca):', err); }
    }
  } catch (err) {
    console.error('_finishHandoverPOS failed', err);
    toast('❌ Lỗi ghi bàn giao: ' + (err.code || err.message || err));
    h.phase = 'out';
    renderHandoverCountPOS();
    return;
  }

  setHandoverBannerPOS(false);
  stopShiftWorkflowPOS('handover');
  const outName = h.out.byName, inName = h.in.byName;
  _handover = null;
  await loadSegmentsPOS(seg.businessDate);
  toast('✅ Đã bàn giao ca');
  box.innerHTML = `
    <div style="text-align:center;padding:22px 10px 8px;">
      <div style="font-size:32px;margin-bottom:8px;">🤝</div>
      <div style="font-weight:700;font-size:16px;color:var(--td);margin-bottom:6px;">Đã bàn giao ${endCash.toLocaleString('vi-VN')}đ</div>
      <div style="font-size:13px;color:#999;line-height:1.6;">${outName} → <b style="color:var(--td)">${inName}</b><br>Từ giờ ${inName} là người giữ két.</div>
    </div>
    <div class="wal-section" style="margin:14px 0;">
      <div style="font-size:12.5px;color:#666;line-height:1.65;">Ca vừa xong đã được chốt sổ riêng. Chênh lệch (nếu có) tính vào ca đó, không dồn sang ca sau.</div>
    </div>
    <button onclick="doCheckOut()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">${outName} check-out ngay</button>
    <button onclick="renderShiftDashboard()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">Về màn Ca làm việc</button>
  `;
  renderCheckinBlock();
}

// renderSegmentBlockPOS — khối "đang trong đoạn ca nào" vẽ ở đầu dashboard.
// KHÔNG hiện expected/variance, chỉ hiện những thứ chính nhân viên tự biết.
function renderSegmentBlockPOS() {
  const seg = currentSegmentPOS();
  if (!seg) return '';
  const nguoiKhac = _employeeShiftsTodayCache.filter(s => !s.checkedOutAt && s.employeeId !== seg.custodianId);
  return `
    <div class="wal-section" style="margin:0 0 14px;padding:18px;">
      ${caTitle('Người giữ két')}
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="width:48px;height:48px;border-radius:15px;background:var(--gl);color:var(--gd);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${caIcon('key', 24)}</span>
        <div style="min-width:0;">
          <div style="font-size:19px;font-weight:800;color:var(--td);line-height:1.25;">${escHtmlPos(seg.custodianName || '—')}</div>
          <div style="font-size:13px;color:#8A8A90;margin-top:3px;">Đoạn ${seg.seq}${seg.seq > 1 ? ` · nhận ${(Number(seg.startCash) || 0).toLocaleString('vi-VN')}đ lúc ${vnDate(seg.startAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ' · từ lúc mở ca'}</div>
        </div>
      </div>
      ${nguoiKhac.length ? `<div style="font-size:13px;color:#8A8A90;margin-top:12px;padding-top:12px;border-top:1px solid #F0EDE6;">Cùng ca: <b style="color:var(--td);">${nguoiKhac.map(s => escHtmlPos(s.employeeName)).join(', ')}</b></div>` : ''}
    </div>`;
}

// ============================================================
// [NEW] GIAI ĐOẠN 11 — Daily Closing Engine
// (POS_Management_Integration_Workflow.md, mục 16 + "Giai đoạn 11")
//
// Gộp checklist toàn bộ workflow trước khi cho phép "Xác nhận đóng ngày". Theo đúng
// mục 16, chia 2 loại:
//   - BẮT BUỘC (hard gate, không thể bỏ qua): Cash reconciliation → Payment reconciliation
//     → Handover — đã được ép buộc SẴN qua chính pipeline daily_closings_gieogieo.status
//     (Giai đoạn 9-10: chỉ tới được màn này khi status==='handed_over', không có đường tắt
//     nào trong UI để nhảy cóc). KHÔNG cần thêm logic chặn gì nữa ở đây cho phần này.
//   - THÔNG TIN/NHẮC NHỞ (soft, không chặn nút "Xác nhận đóng ngày"): Inventory
//     (refill/waste/kiểm kê), Expenses. Đây là QUYẾT ĐỊNH CÓ CHỦ ĐÍCH của bản đầu — chặn
//     cứng toàn bộ các mục này (vd bắt buộc mọi refill rule phải đạt Target trước khi đóng
//     ngày) không thực tế vận hành (có thể thiếu hàng chờ giao ngày mai) và cần Management
//     cấu hình "mục nào bắt buộc" — ngoài phạm vi bản đầu, xem phần "Chưa làm" trong .md.
//   - "POS đã ngừng nhận bill mới": mục 16 liệt kê nhưng đây là XÁC NHẬN THỦ CÔNG (checkbox),
//     không phải khoá kỹ thuật màn bán hàng — khoá kỹ thuật rủi ro giữ chân thu ngân giữa
//     chừng 1 giao dịch, ngoài phạm vi bản đầu.
// ============================================================
async function computeDailyClosingChecklistPOS(businessDate) {
  const result = {
    wasteCount: null, stockCountsToday: null, stockCountsPending: null,
    refillBelowMin: null, refillTotal: null, expenseCount: null
  };
  try {
    const txSnap = await fstore.collection('stock_transactions_gieogieo').where('businessDate', '==', businessDate).where('type', '==', 'WASTE').get();
    result.wasteCount = txSnap.size;
  } catch (err) { console.warn('[Giai đoạn 11] Không đọc được WASTE hôm nay:', err); }
  try {
    const scSnap = await fstore.collection('stock_counts_gieogieo').where('businessDate', '==', businessDate).get();
    result.stockCountsToday = scSnap.size;
    result.stockCountsPending = scSnap.docs.filter(d => d.data().status === 'pending_review').length;
  } catch (err) { console.warn('[Giai đoạn 11] Không đọc được kiểm kê hôm nay:', err); }
  try {
    const [ruleSnap, itemSnap] = await Promise.all([
      refillRulesSnapPOS(),
      fstore.collection('inventory_items_gieogieo').get()
    ]);
    const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rules = ruleSnap.docs.map(d => d.data());
    result.refillTotal = rules.length;
    result.refillBelowMin = rules.filter(r => {
      const it = items.find(x => x.id === r.itemId);
      const cur = (it && it.locationStock && it.locationStock[r.destLocationId]) || 0;
      return cur < (Number(r.minBase) || 0);
    }).length;
  } catch (err) { console.warn('[Giai đoạn 11] Không đọc được refill rules hôm nay:', err); }
  try {
    const expSnap = await fstore.collection('expenses_gieogieo').where('date', '==', businessDate).get();
    result.expenseCount = expSnap.size;
  } catch (err) { console.warn('[Giai đoạn 11] Không đọc được chi phí hôm nay:', err); }
  return result;
}

// [FIX] Checklist CUỐI CA do Quản lý cấu hình — trước đây POS chỉ truy vấn
// phase == 'open' ở mọi chỗ, nên mọi mục khai cho "Cuối ca" KHÔNG BAO GIỜ hiện
// ra, dù màn cấu hình ghi rõ "Hiện ở bước cuối của quy trình kết ca".
// Dùng chung cách tính với đầu ca (lọc active + đúng thứ trong tuần + sắp theo
// order), và hỗ trợ đúng các loại tự kiểm mà cuối ca dùng được.
async function computeClosingChecklistPOS() {
  const today = posWeekdayKey();
  let defs = [];
  try {
    const snap = await fstore.collection('shift_checklists_gieogieo').where('phase', '==', 'close').get();
    defs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false)
      .filter(c => !Array.isArray(c.activeDays) || !c.activeDays.length || c.activeDays.includes(today))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  } catch (err) {
    console.warn('computeClosingChecklistPOS: không đọc được cấu hình (bỏ qua):', err);
    return [];
  }
  if (!defs.length) return [];

  const kinds = new Set(defs.map(d => d.autoCheck).filter(Boolean));
  const ctx = {};
  if (kinds.has('prep_ready')) ctx.prep = await computePrepPlanPOS();
  if (kinds.has('stockcount_due')) ctx.stockCountDone = await hasStockCountTodayPOS();
  if (kinds.has('refill_below_min')) ctx.refillLow = await countRefillBelowMinPOS();

  return defs.map(d => {
    const item = { id: d.id, label: d.label || '', blocking: !!d.blocking, autoCheck: d.autoCheck || null, done: false, detail: '', plan: null,
      minDurationSec: Math.max(0, Number(d.minDurationSec) || 0) };
    if (!d.autoCheck) return item;
    if (d.autoCheck === 'prep_ready') {
      const plan = ctx.prep || [];
      const pending = plan.filter(x => !x.ok);
      item.plan = plan;   // để hiện danh sách món cần nấu + nút "Nấu" (như đầu ca)
      item.done = pending.length === 0;
      // Cuối ca, "chuẩn bị đủ bán thành phẩm" nghĩa là chuẩn bị cho NGÀY MAI.
      item.detail = pending.length ? `Còn ${pending.length} loại cần chuẩn bị cho ngày mai` : 'Đã đủ bán thành phẩm';
    } else if (d.autoCheck === 'stockcount_due') {
      item.done = !!ctx.stockCountDone;
      item.detail = item.done ? 'Đã kiểm kho hôm nay' : 'Hôm nay có lịch kiểm kho — chưa làm';
    } else if (d.autoCheck === 'refill_below_min') {
      item.done = (ctx.refillLow || 0) === 0;
      item.detail = item.done ? 'Không có nguyên liệu dưới mức tối thiểu' : `${ctx.refillLow} nguyên liệu dưới mức tối thiểu ở quầy`;
    } else if (d.autoCheck === 'count_handover') {
      // Cuối ca dùng bản ghi đếm giao ca CUỐI CA (đã làm ở bước trước đó).
      item.done = !!(shiftState.closing && shiftState.closing.handoverCloseLines);
      item.detail = item.done ? 'Đã đếm giao ca cuối ca' : 'Chưa đếm giao ca';
    }
    return item;
  });
}

async function renderDailyClosingChecklist() {
  const box = document.getElementById('shiftBody');
  clClearCountdownTimer();
  showLoading(box);
  const [cl, cfgList, closeDoc] = await Promise.all([
    computeDailyClosingChecklistPOS(shiftState.businessDate),
    computeClosingChecklistPOS(),
    fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).get().catch(() => null)
  ]);
  const cd = (closeDoc && closeDoc.exists) ? closeDoc.data() : {};
  const doneIds = new Set(((cd.closeChecklistDone) || []).map(x => x.id));
  const overIds = new Set(((cd.closeChecklistOverrides) || []).map(x => x.id));
  _closeChecklistState = { items: cfgList, doneIds, overIds };
  const lockablePendingClose = cfgList.filter(it => !it.autoCheck && it.minDurationSec > 0
    && !doneIds.has(it.id) && !overIds.has(it.id));
  await Promise.all(lockablePendingClose.map(it => clEnsureStarted('close', it.id, it.label, it.minDurationSec)));
  const item = (ok, label, detail) => `
    <div style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f0f0f0;">
      <span style="font-size:16px;flex-shrink:0;">${ok === null ? '❔' : ok ? '✅' : '⚠️'}</span>
      <div><div style="font-size:13.5px;color:var(--td);font-weight:600;">${label}</div>
      <div style="font-size:11.5px;color:#999;">${detail}</div></div>
    </div>`;
  box.innerHTML = closeSessionBannerPOS() + `
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:14px;">Checklist tham khảo</div>
      <label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <input type="checkbox" class="kc-chk" id="dcNoMoreBills"> <span style="font-size:13.5px;">Xác nhận không còn bill nào đang xử lý dở dang</span>
      </label>
      ${item(true, 'Tiền mặt đã đối soát', 'PASS')}
      ${item(true, 'Chuyển khoản đã đối soát', 'PASS hoặc không có doanh thu chuyển khoản')}
      ${item(true, 'Đã xác nhận tiền giữ lại + bàn giao', `Bàn giao cho ${shiftState.closing.handoverRecipient || ''}`)}
      ${item(cl.wasteCount != null ? true : null, 'Hao hụt trong ngày', cl.wasteCount != null ? `${cl.wasteCount} giao dịch WASTE đã ghi` : 'Không tải được')}
      ${item(cl.refillBelowMin != null ? cl.refillBelowMin === 0 : null, 'Refill', cl.refillTotal != null ? `${cl.refillTotal} rule đang bật, ${cl.refillBelowMin} đang dưới mức tối thiểu` : 'Không tải được')}
      ${item(cl.stockCountsToday != null ? cl.stockCountsToday > 0 : null, 'Kiểm kê', cl.stockCountsToday != null ? `${cl.stockCountsToday} lần kiểm kê hôm nay, ${cl.stockCountsPending} đang chờ Quản lý duyệt` : 'Không tải được')}
      ${item(cl.expenseCount != null ? true : null, 'Chi phí phát sinh', cl.expenseCount != null ? `${cl.expenseCount} khoản đã ghi hôm nay` : 'Không tải được')}
    </div>
    ${cfgList.length ? `
    <div class="kc-card">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:14px;">Việc cuối ca (do Quản lý cấu hình)</div>
      ${cfgList.map(it => {
        const ticked = doneIds.has(it.id) || (it.autoCheck && it.done);
        const skipped = overIds.has(it.id);
        const icon = ticked ? '✅' : skipped ? '⏭️' : (it.blocking ? '🔴' : '⬜');
        return `
        <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <div style="display:flex;gap:9px;align-items:flex-start;">
            <span style="font-size:17px;flex-shrink:0;line-height:1.3;">${icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13.5px;font-weight:700;color:${ticked||skipped?'#999':'var(--td)'};${ticked||skipped?'text-decoration:line-through;':''}">${it.label}${it.blocking?' <span style="background:#fee2e2;color:#c0392b;font-size:9.5px;font-weight:800;border-radius:5px;padding:1px 5px;vertical-align:middle;">BẮT BUỘC</span>':''}</div>
              ${it.detail ? `<div style="font-size:11.5px;color:#999;margin-top:2px;">${skipped ? 'Đã bỏ qua có ghi lý do' : it.detail}</div>` : ''}
              ${(!ticked && !skipped && it.plan && it.plan.length) ? renderPrepPlanRows(it.plan) : ''}
              ${(!ticked && !skipped && it.autoCheck) ? `<div style="font-size:10.5px;color:#bbb;margin-top:3px;font-style:italic;">Tự động chuyển ✅ khi làm xong việc này</div>` : ''}
              ${(!ticked && !skipped && !it.autoCheck && it.minDurationSec > 0 && clRemainingSec('close', it.id) > 0) ? `<div style="font-size:10.5px;color:#b45309;margin-top:3px;">⏱️ Cần đứng làm tối thiểu ${it.minDurationSec}s mới bấm Xong được</div>` : ''}
            </div>
            ${!ticked && !skipped ? `<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
              ${it.autoCheck ? '' : ((it.minDurationSec > 0 && clRemainingSec('close', it.id) > 0)
                ? clLockedButtonHTML(clRemainingSec('close', it.id))
                : `<button onclick="tickCloseChecklistItem('${it.id}')" style="padding:7px 12px;border-radius:10px;border:none;background:var(--gd);color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">Xong</button>`)}
              <button onclick="skipCloseChecklistItem('${it.id}')" style="padding:7px 10px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#888;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">Bỏ qua</button>
            </div>` : ''}
          </div>
          ${_closeSkipId === it.id ? `
          <div style="margin-top:8px;padding:10px;background:#fffbe8;border-radius:12px;">
            <div style="font-size:11.5px;color:#b45309;margin-bottom:6px;">Ghi lý do để Quản lý xem lại:</div>
            <input id="closeSkipReason" type="text" placeholder="VD: hết nước lau, đã báo quản lý" style="width:100%;height:44px;border:1.5px solid #e6e1d2;border-radius:10px;padding:0 12px;font-size:15px;">
            <button onclick="submitCloseSkip('${it.id}')" style="width:100%;margin-top:8px;height:44px;background:var(--gd);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">Xác nhận bỏ qua</button>
          </div>` : ''}
        </div>`;
      }).join('')}
      ${renderPinInput('closeChecklistStaff')}
    </div>` : ''}
    <div class="kc-card" style="border:1.5px solid #E23A5D;">
      <div style="font-size:14px;font-weight:700;color:#999;margin-bottom:6px;">Ký xác nhận đóng ngày</div>
      <div style="font-size:12px;color:#999;line-height:1.5;">Nhập lại mã PIN của <b style="color:var(--td);">${_closeSession ? _closeSession.fullName : 'người kết ca'}</b> — chữ ký chốt sổ cuối cùng.</div>
      ${renderPinInput('closeFinalStaff', 'Mã PIN xác nhận (bắt buộc nhập lại)')}
    </div>
    ${closeStepNavHTML(8)}
    <button onclick="submitDailyClose()" class="kc-btn" style="background:#E23A5D;color:#fff;margin-bottom:22px;">Xác nhận đóng ngày</button>
  `;
  if (lockablePendingClose.some(it => clRemainingSec('close', it.id) > 0)) clArmCountdownRerender(() => renderDailyClosingChecklist());
}

let _closeChecklistState = { items: [], doneIds: new Set(), overIds: new Set() };

// Còn mục BẮT BUỘC nào chưa xong/chưa bỏ qua không
function pendingBlockingCloseItems() {
  const st = _closeChecklistState;
  return (st.items || []).filter(it => it.blocking
    && !st.doneIds.has(it.id) && !st.overIds.has(it.id)
    && !(it.autoCheck && it.done));
}

async function tickCloseChecklistItem(itemId) {
  const it = (_closeChecklistState.items || []).find(x => x.id === itemId);
  if (!it) return;
  if (!it.autoCheck && it.minDurationSec > 0 && clRemainingSec('close', itemId) > 0) {
    toast(`⏳ Cần đứng làm tối thiểu ${it.minDurationSec}s cho mục này`);
    return;
  }
  const staffEmp = await resolveStaffPinWorkedToday('closeChecklistStaff');
  if (!staffEmp) return;
  try {
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      closeChecklistDone: firebase.firestore.FieldValue.arrayUnion({
        id: itemId, label: it.label, checkedAt: vnDate().toISOString(),
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id
      })
    }, { merge: true });
    await clLogComplete('close', itemId, staffEmp);
    renderDailyClosingChecklist();
  } catch (err) { toast('❌ Lỗi: ' + (err.code || err.message || err)); }
}

// Dùng form inline chứ KHÔNG dùng prompt(): prompt bị chặn/hiển thị xấu trên
// webview Android bọc app (cùng lý do đã ghi ở skipChecklistItem đầu ca).
let _closeSkipId = null;

function skipCloseChecklistItem(itemId) {
  _closeSkipId = (_closeSkipId === itemId) ? null : itemId;
  renderDailyClosingChecklist();
}

function submitCloseSkip(itemId) {
  const it = (_closeChecklistState.items || []).find(x => x.id === itemId);
  if (!it) return;
  const el = document.getElementById('closeSkipReason');
  const reason = ((el && el.value) || '').trim();
  if (!reason) { toast('⚠️ Phải ghi lý do'); return; }
  _doSkipCloseChecklist(itemId, it, reason);
}

async function _doSkipCloseChecklist(itemId, it, reason) {
  const staffEmp = await resolveStaffPinWorkedToday('closeChecklistStaff');
  if (!staffEmp) return;
  try {
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      closeChecklistOverrides: firebase.firestore.FieldValue.arrayUnion({
        id: itemId, label: it.label, reason, at: vnDate().toISOString(),
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id
      })
    }, { merge: true });
    _closeSkipId = null;
    toast('⏭️ Đã bỏ qua — Quản lý sẽ thấy lý do này');
    renderDailyClosingChecklist();
  } catch (err) { toast('❌ Lỗi: ' + (err.code || err.message || err)); }
}

async function submitDailyClose() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitDailyCloseImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitDailyCloseImpl() {
  try {
    if (await recheckCloseAfterSalesPOS()) {
      toast('⚠️ Có bill mới sau lúc đối soát — đã chuyển tới bước cần làm lại');
      resumeClosePipelinePOS();
      return;
    }
  } catch (err) {
    console.error('[Kết ca] không kiểm tra được bill trước khi đóng ngày:', err);
    toast('⚠️ Không kiểm tra được bill mới — thử lại khi mạng ổn định');
    return;
  }
  if (!shiftState.closing || shiftState.closing.status !== 'handed_over' ||
      !shiftState.closing.cashPassedAt ||
      (shiftState.closing.handoverCloseRecountIds || []).length ||
      (shiftState.closing.prepCountRecountIds || []).length) {
    toast('⚠️ Có bước kết ca chưa hoàn tất — đã chuyển tới bước đó');
    if (shiftState.closing && shiftState.closing.status === 'closed') renderShiftDashboard();
    else resumeClosePipelinePOS();
    return;
  }
  // [FIX] Chốt chặn CUỐI CÙNG trước khi khoá ngày — phòng đúng trường hợp màn checklist
  // đã mở sẵn từ trước (không đi qua renderShiftDashboard()/resumeClosePipelinePOS() lần
  // nào nữa) mà một bill tiền mặt vẫn lọt vào sau lúc đối soát (máy khác, hoặc tab khác
  // trên cùng máy). Đây là cửa cuối cùng trước khi status thành 'closed' và chặn bán hàng
  // hẳn — không được để lọt. Xem hasNewCashOrdersSinceCashCount() để hiểu đầy đủ lỗ hổng.
  if (hasNewCashOrdersSinceCashCount(shiftState.closing)) {
    toast('⚠️ Có bill tiền mặt mới sau đối soát — đã mở bước đếm lại tiền');
    renderCashRecountRequiredPOS();
    return;
  }
  if (!document.getElementById('dcNoMoreBills').checked) { toast('⚠️ Xác nhận không còn bill đang xử lý dở dang'); return; }
  const conThieu = pendingBlockingCloseItems();
  if (conThieu.length) { toast(`⚠️ Còn ${conThieu.length} việc BẮT BUỘC chưa xong: ${conThieu[0].label}`); return; }
  // [PHIÊN KẾT CA] Chốt chặn cuối: (a) không ai được check-in lại giữa chừng —
  // nếu có thì phút kết ca lại chui vào giờ công, đúng cái đang muốn chặn;
  // (b) ký lại PIN, và phải đúng người đã mở phiên.
  let conTrongCa = [];
  try { conTrongCa = await closeGateBlockersPOS(); }
  catch (err) { console.warn('_submitDailyCloseImpl: không đọc được check-in, bỏ qua chốt chặn:', err); }
  if (conTrongCa.length) {
    toast(`🚫 ${conTrongCa[0].employeeName} đang trong ca — check-out hết mới đóng ngày được`);
    renderCloseGateBlockedPOS(conTrongCa);
    return;
  }
  const signerEmp = await resolveStaffPinWorkedToday('closeFinalStaff');
  if (!signerEmp) return;
  if (_closeSession && signerEmp.id !== _closeSession.employeeId) {
    toast(`⚠️ Phiên kết ca này của ${_closeSession.fullName} — phải chính người đó ký xác nhận`);
    return;
  }
  const closedAt = vnDate().toISOString();
  // Quản lý dùng số này để so ai kết ca 10 phút, ai kết ca cả tiếng. POS chỉ
  // hiện con số trần, không kèm nhận xét gì.
  const phutKetCa = (_closeSession && _closeSession.startedAt)
    ? Math.round((Date.parse(closedAt) - Date.parse(_closeSession.startedAt)) / 60000) : null;
  try {
    await fstore.collection('daily_closings_gieogieo').doc(shiftState.businessDate).set({
      status: 'closed', closedAt,
      closedByEmployeeId: signerEmp.id, closedByName: signerEmp.fullName,
      closeDurationMin: phutKetCa
    }, { merge: true });
    stopShiftWorkflowPOS('closing');
    toast(`✅ Đã đóng ngày — kết ca mất ${phutKetCa != null ? phutKetCa + ' phút' : 'xong'}`);
    _closeSession = null;
    if (_closeElapsedTimer) { clearInterval(_closeElapsedTimer); _closeElapsedTimer = null; }
    shiftState.closing = { ...shiftState.closing, status: 'closed', closedAt, closeDurationMin: phutKetCa };
    // [FIX] TỰ CHECK-OUT mọi nhân viên còn đang mở ca.
    //
    // Trước đây đóng ngày KHÔNG đụng gì tới check-in cá nhân: nhân viên kết ca xong
    // rồi về, quên bấm check-out → record ca cứ để trống checkedOutAt và giờ công
    // CHẠY HOÀI, sang hôm sau vẫn tính. Lương giờ vì thế phồng lên vô lý mà không ai
    // phát hiện (computeActualLaborCostByDate bỏ qua ca chưa check-out, nên nó
    // không sai NGAY mà âm thầm thiếu giờ, rồi sai to khi ai đó sửa tay).
    // Đóng ngày = quán đã ngừng bán, không thể còn ai đang làm việc → mốc check-out
    // đúng nhất chính là thời điểm đóng ngày.
    await autoCheckOutAllOnClose(closedAt, shiftState.businessDate);
    // Tóm tắt ngày cho chủ (NL/BTP đi đâu, lệch ở đâu, ai) — chạy NỀN, không chờ, lỗi không ảnh hưởng đóng ngày.
    UnitEngine.duty.writeDigest(shiftState.businessDate).catch(err => console.warn('[duty] tóm tắt ngày lỗi (không ảnh hưởng đóng ngày)', err));
    renderShiftDashboard();
    renderCheckinBlock();
  } catch (err) {
    console.error('submitDailyClose failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

// Check-out hộ những người còn đang mở ca lúc đóng ngày. Ghi rõ cờ autoCheckOut để
// Quản lý phân biệt được "tự bấm" và "hệ thống chốt hộ" khi rà giờ công.
// KHÔNG để lỗi ở đây làm hỏng việc đóng ngày (đã ghi xong ở trên) — chỉ cảnh báo.
// [FIX] Dọn ca TREO TỪ NGÀY CŨ — những ca chưa từng được check-out trước khi có
// cơ chế tự chốt ở trên, hoặc ngày đó quán quên đóng ngày luôn.
//
// Vì sao phải dọn: ca không có checkedOutAt bị computeActualLaborCostByDate() BỎ QUA
// hoàn toàn, nên giờ công của những ngày đó KHÔNG được tính lương — mất tiền của
// nhân viên mà không ai thấy báo lỗi gì. Đồng thời màn check-in cứ hiện người đó
// "đang trong ca" mãi.
//
// Mốc check-out lấy theo thứ tự ưu tiên: giờ đóng ngày hôm đó → nếu ngày đó không
// đóng thì lấy 23:59 của chính ngày đó. TUYỆT ĐỐI không lấy giờ hiện tại, vì như vậy
// một ca bỏ quên 3 ngày sẽ thành 72 giờ công.
async function closeStaleEmployeeShifts() {
  const today = posDateKey();
  try {
    const snap = await fstore.collection('employee_shifts_gieogieo')
      .where('checkedOutAt', '==', null).get();
    const stale = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.businessDate && s.businessDate < today);
    if (!stale.length) return 0;
    // Gom theo ngày để mỗi ngày chỉ đọc daily_closings 1 lần.
    const byDate = {};
    stale.forEach(s => { (byDate[s.businessDate] = byDate[s.businessDate] || []).push(s); });
    let done = 0;
    for (const dateKey of Object.keys(byDate)) {
      let mark = null;
      try {
        const doc = await fstore.collection('daily_closings_gieogieo').doc(dateKey).get();
        if (doc.exists && doc.data().closedAt) mark = doc.data().closedAt;
      } catch (err) { console.warn('closeStaleEmployeeShifts: không đọc được đóng ngày', dateKey, err); }
      if (!mark) mark = vnDate(dateKey + 'T23:59:00').toISOString();
      await Promise.all(byDate[dateKey].map(s =>
        fstore.collection('employee_shifts_gieogieo').doc(s.id).update({
          checkedOutAt: mark, autoCheckOut: true,
          autoCheckOutReason: 'Tự chốt ca bỏ quên từ ngày ' + dateKey
        })
      ));
      done += byDate[dateKey].length;
    }
    if (done) toast(`🕒 Đã chốt hộ ${done} ca bỏ quên từ ngày trước`);
    return done;
  } catch (err) {
    console.warn('closeStaleEmployeeShifts lỗi (bỏ qua, không chặn bán hàng):', err);
    return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// [FIX-checkout-quanguaydem] TRƯỚC ĐÂY hàm này đọc _employeeShiftsTodayCache, mà cache
// đó nạp theo posDateKey() — tức NGÀY LỊCH HIỆN TẠI, không phải ngày đang được đóng.
//
// Quán đóng cửa muộn, thao tác kết ca thường rơi vào sau 0h. Khi đó:
//   · daily_closings ghi đúng vào doc của NGÀY CŨ (dùng shiftState.businessDate);
//   · nhưng cache lại là của NGÀY MỚI — chưa ai check-in nên rỗng;
//   · dangMo.length === 0 → hàm return ngay, KHÔNG chốt cho ai cả.
// Ca của ngày cũ nằm lại với checkedOutAt = null. Hôm sau Quản lý báo "chưa check-out",
// và computeActualLaborCostByDate() bỏ qua ca đó nên giờ công ngày đó = 0đ.
//
// Giờ truy thẳng theo businessDate của NGÀY ĐANG ĐÓNG, không qua cache.
// ══════════════════════════════════════════════════════════════════════════
async function autoCheckOutAllOnClose(checkedOutAt, businessDate) {
  const ngay = businessDate || shiftState.businessDate || posDateKey();
  try {
    const snap = await fstore.collection('employee_shifts_gieogieo')
      .where('businessDate', '==', ngay).get();
    const dangMo = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.checkedOutAt);
    if (!dangMo.length) return;
    await Promise.all(dangMo.map(s =>
      fstore.collection('employee_shifts_gieogieo').doc(s.id).update({
        checkedOutAt, autoCheckOut: true, autoCheckOutReason: 'Tự chốt khi đóng ngày ' + ngay
      })
    ));
    // Cache chỉ giữ ngày hôm nay — nạp lại khi ngày vừa đóng đúng là hôm nay.
    if (ngay === posDateKey()) await loadEmployeeShiftsTodayCache();
    toast(`🕒 Đã tự check-out ${dangMo.length} nhân viên còn mở ca ngày ${ngay}`);
  } catch (err) {
    console.warn('autoCheckOutAllOnClose lỗi (ngày ĐÃ đóng xong):', err);
    toastAutoReport('⚠️ Đã đóng ngày, nhưng chưa tự check-out được', 'Đóng ngày: chưa tự check-out được nhân viên', { ref: shiftState.businessDate || '' });
  }
}

PosGieoMods.handover = true;
