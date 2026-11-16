// Tách từ posgieo.html dòng 3266–4702 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_stock_units.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).stockUnits = 'dang';

// đọc được — tương tự cách 1 tấm nhãn in thật co giãn theo nội dung.
// ============================================================
// ============================================================
// ============================================================
// [NEW] MỞ CHAI & BÁO HẾT — nơi tem thật sự phát huy tác dụng
// ------------------------------------------------------------
// Hai sự kiện, KHÔNG phải một:
//   · MỞ  (sealed → open)  : ghi ngày mở, ai mở, hạn dùng sau khi mở. Thiếu bước này thì
//                            hệ thống không biết chai nào đang mở, mất luôn FIFO và mất
//                            đúng hai thông tin mà tem sinh ra để mang.
//   · HẾT (open → finished): chốt lại chai đó, và ghi hao hụt phần còn thừa trong chai.
//
// Mỗi sự kiện có HAI đường: quét mã (nhanh, và chứng minh nhân viên đang cầm đúng chai
// trên tay) và chọn tay KÈM LÝ DO (tem rách/mờ/bong). Đường phụ bắt nhập lý do để đường
// dễ nhất là đường trung thực — nhưng CHỈ bắt khi có từ 2 chai cùng loại đang mở trở lên,
// vì lúc chỉ có 1 chai thì chọn kiểu gì cũng đúng, hỏi lý do là ma sát không đổi lại gì.
//
// Lý do là danh sách CỐ ĐỊNH, không cho gõ tự do — gõ tự do là dữ liệu rác, không thống kê
// được "nhân viên nào hay dùng đường phụ" hay "món nào tem hay hỏng".
// ============================================================
const STOCK_MANUAL_REASONS = [
  { k: 'tem_mo',    label: 'Tem mờ / rách, không quét được' },
  { k: 'tem_bong',  label: 'Tem bong mất' },
  { k: 'may_loi',   label: 'Máy quét lỗi' },
  { k: 'chua_tem',  label: 'Chưa có tem (nhập trước khi bật tính năng)' }
];

let STOCK_OPEN_LIST = [];

// ============================================================
// [E1/E2 — UNIT ENGINE] Lõi kho (tem/lô, FIFO, nợ, suy tồn, hoàn, mở/báo hết, sổ kho, sinh mã,
// Sổ lệch, khoá mẻ) đã chuyển sang unit_engine.v1.js — chép nguyên văn, xem chú thích đầu file đó.
// Tên cũ giữ làm LỚP CHUYỂN TIẾP để mọi nơi gọi trong POS không phải đổi (E1-3 kế hoạch).
// ============================================================
async function loadOpenContainers() { STOCK_OPEN_LIST = await UnitEngine.units.listOpen(); return STOCK_OPEN_LIST; }

// Chấm cam trên ô "Chai đang dùng" — đếm số chai ĐÃ QUÁ HẠN sau khi mở, không phải tổng số
// chai đang mở. Tổng số chai mở là chuyện bình thường, không có gì phải báo.
async function refreshStockUseBadge() {
  const badge = document.getElementById('stockUseBadge');
  if (!badge) return;
  await loadOpenContainers();
  const nay = Date.now();
  const quaHan = STOCK_OPEN_LIST.filter(c => c.expiresAt && vnDate(c.expiresAt).getTime() <= nay).length;
  badge.textContent = quaHan > 99 ? '99+' : String(quaHan);
  badge.style.display = quaHan ? 'flex' : 'none';
}

// Nhóm 2 dòng lặp ở cả hai màn quét (mở chai / báo hết) vào một chỗ.
function chanMaTrung(c) {
  if (!c || !c._trungMa) return false;
  toastAutoReport('⛔ Mã ' + c.code + ' đang trùng trên ' + c.soChai + ' phần — chọn tay đúng thứ đang cầm', 'Mã tem bị trùng — cần cấp lại mã', { ref: c.code || '', itemName: c.itemName || '' });
  return true;
}

// ---------- Cảnh báo "cần xác nhận đã hết" trên màn Order ----------
let FIFO_PENDING_CONFIRM = [];

let _fifoAlertExpanded = false;

// [UNIT ENGINE v2] "Cần xác nhận đã hết" = tem đang 'open' nhưng unitBase đã <= 0 (nợ FIFO
// hoặc vừa cạn đúng lúc) — unitBase là bản sao Firestore, đồng bộ sau mỗi lượt bán qua
// unitEngineAllocateConsumption, đủ mới để dùng cho cảnh báo này.
// [GIẢM-ĐỌC] Danh sách tem "cần xác nhận đã hết" lấy từ RT (nguồn thật của phần đang mở,
// RTDB tính theo dung lượng chứ không theo lượt đọc) thay vì đọc mọi tem đang mở trên
// Firestore mỗi 2 phút. Một listener trên active_units giữ bản sao sống; mỗi lượt bán chỉ tải
// phần thay đổi. Chỉ lấy node của NGUYÊN LIỆU (BTP cũng nằm dưới active_units).
let _fifoRtRoot = null, _fifoRtOn = false, _fifoRtHen = null;

function _fifoRtListen() {
  if (_fifoRtOn) return;
  _fifoRtOn = true;
  db.ref('active_units_gieogieo').on('value', snap => {
    _fifoRtRoot = snap.val() || {};
    if (!_fifoRtHen) _fifoRtHen = setTimeout(() => { _fifoRtHen = null; _fifoRebuild(); }, 800);
  }, err => { console.warn('[FIFO] listener RT lỗi — lần gọi sau đọc lại', err); _fifoRtOn = false; _fifoRtRoot = null; });
}

function _fifoRebuild() {
  // [E2] Phần dữ liệu (lọc tem NL đang mở mà unitBase ≤ 0) nằm trong engine.
  FIFO_PENDING_CONFIRM = UnitEngine.units.fifoPendingFromRt(_fifoRtRoot, (KHO_ITEMS_CACHE || []).map(x => x.id));
  renderFifoAlertBar();
}

async function refreshFifoAlert() {
  try {
    await ensureKhoItemsPOS();
    _fifoRtListen();
    if (!_fifoRtRoot) _fifoRtRoot = (await db.ref('active_units_gieogieo').once('value')).val() || {};
  } catch (err) { console.warn('[FIFO] refreshFifoAlert lỗi:', err); return; }
  _fifoRebuild();
  // [FIX] TRƯỚC ĐÂY có tem mới cạn là tự bung hẳn cái panel to ra giữa màn hình order,
  // bất kể đang bận bán hàng cỡ nào — đây chính là thứ "che màn hình rất khó chịu khi
  // đang bán đông khách". Chấm đỏ nhấp nháy cạnh logo + dòng chip nhỏ (đã sửa CSS cho
  // không còn chiếm hết bề ngang) là đủ để nhân viên biết có việc cần xử lý; panel to
  // với nút xác nhận chỉ nên hiện khi họ CHỦ ĐỘNG bấm vào lúc rảnh tay.
  renderFifoAlertBar();
  prepSugRefreshThrottled();   // gợi ý mẻ dùng chung nút chuông — tối đa 10 phút/lần ở đường này
}

function toggleFifoAlertBar() {
  _fifoAlertExpanded = !_fifoAlertExpanded;
  renderFifoAlertBar();
}

// Bấm "Quét mã xác nhận" ngay trong pill.
//
// [FIX] TRƯỚC ĐÂY gọi thẳng scanToFinishContainer() — hàm đó (khi đó) vẽ sheet "Xác
// nhận đã hết" vào #stockUseBody, một element chỉ thật sự HIỂN THỊ khi #stockUseScreen
// đang là màn đang mở. Pill này lại nằm trên màn Order (#sm) — bấm "Quét mã xác nhận"
// từ đây, quét xong, sheet vẫn được vẽ ra nhưng nằm sau màn Order đang hiện, nhân viên
// không thấy gì để bấm "Xác nhận đã hết" tiếp. Kết quả: tưởng đã quét xong nhưng vì
// không bấm được nút xác nhận cuối cùng nên tem chưa bao giờ thật sự được chốt — pill
// cứ treo mãi dù "đã quét theo đúng nút nhắc nhở". openConfirmFinishSheet() giờ vẽ vào
// sheet nổi dùng chung (#stockScanSheetOverlay) thay vì #stockUseBody, nên tự hiện đúng
// ngay trên màn đang đứng — khỏi cần chuyển tab nữa, và cũng khỏi cần chuyển VỀ tab cũ
// sau khi xong.
//
// Cũng kiểm tra thêm: mã vừa quét có ĐÚNG là một trong những tem đang bị pill này
// cảnh báo hay không. Trước đây quét trúng một tem BẤT KỲ đang mở (kể cả tem không
// nằm trong danh sách cảnh báo) vẫn chạy hết luồng "báo hết" bình thường và tự coi
// là xong — không giải quyết được cảnh báo nào cả, nhìn như "quét rồi mà pill không
// biến mất".
async function fifoAlertScanNow() {
  if (typeof posScan !== 'function') { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) { if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error)); return; }
  const c = await UnitEngine.codes.find(r.code);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + r.code + ' trong hệ thống'); return; }
  if (!FIFO_PENDING_CONFIRM.some(x => x.id === c.id)) {
    toast('⚠️ Mã ' + (c.code || '') + ' không nằm trong danh sách đang chờ xác nhận ở đây — vào Kho → Quét mở/hết để báo hết mã này bình thường.');
    return;
  }
  if (c.status === 'voided')   { toast('⛔ ' + c.code + ' đã bị huỷ (phiếu nhận ghi thừa) — bóc tem này bỏ đi, đừng dùng'); return; }
  if (c.status === 'lost')     { toast('⚠️ ' + c.code + ' đang ở trạng thái "báo mất" — dùng nút "Quét mã hàng tìm lại được" ở Kiểm kê để phục hồi'); return; }
  if (c.status === 'sealed' && !isAtomicUnitContainer(c)) { toast('ℹ️ ' + c.code + ' còn nguyên seal — mở trước đã'); return; }
  if (c.status === 'finished') { toast('ℹ️ ' + c.code + ' đã báo hết trước đó'); return; }
  openConfirmFinishSheet(c, true);
}

// ============================================================================
// [MỚI] "CHƯA HẾT" — nghi vấn ngược lại của pill FIFO.
// ----------------------------------------------------------------------------
// Pill này chỉ hỏi MỘT chiều: "hệ thống tính tem này đã hết, đúng chứ?" — và trước đây
// đường trả lời DUY NHẤT là quét mã xác nhận đúng là đã hết. Nhưng phép tính FIFO chỉ là
// SUY RA từ công thức/lượt bán, không phải đo thật — rất có thể tem đó cân/đong lại vẫn
// còn hàng (công thức khai nhiều hơn thực tế rót, hoặc một lượt bán trước trừ nhầm tem).
// Trước đây không có đường nào để nói "chưa hết" cả — nhân viên chỉ có thể lờ đi (pill cứ
// treo mãi) hoặc quét bừa xác nhận sai sự thật.
//
// Cách xử lý: cho cân/đong lại thật, ghi ĐÈ THẲNG unitBase theo số đo được (đúng tinh thần
// "kiểm kê" mà _submitPrepCountImpl() đã dùng cho BTP — số đo tại thời điểm này là sự thật,
// không phải suy diễn tiếp từ lịch sử), đồng bộ cả RT lẫn Firestore, suy lại currentStock từ
// RT, và ghi một dòng ADJUSTMENT + một mục trong `notEmptyChecks` trên chính tem để biết rõ
// ai xác nhận, lúc nào, cân được bao nhiêu, vì sao — không chỉ thấy con số tồn kho tự nhảy.
// ============================================================================
// Bảng kê các lần cân của popup "Chưa hết" — cùng cách _prepFinishWeighLines làm cho form
// Hoàn thành mẻ chế biến: giữ lại để lưu kèm vào notEmptyChecks (soi lại được "cân mấy khay,
// khay nào" thay vì chỉ thấy một con số trần), và tự vứt nếu nhân viên sửa tay đè lên số vừa
// cân (khớp không còn đúng nữa thì giữ bảng kê cũ là lừa dối, không phải tiện lợi).
let _fifoNotEmptyWeighLines = [];

let _fifoNotEmptyOpId = null;

function fifoNotEmptyPrompt(containerId) {
  const c = FIFO_PENDING_CONFIRM.find(x => x.id === containerId);
  if (!c) { toast('⚠️ Không tìm thấy mã này'); return; }
  _fifoNotEmptyWeighLines = [];
  _fifoNotEmptyOpId = 'fne_' + containerId + '_' + Date.now();
  // [FIX] Trước đây ô này chỉ cho gõ tay — lệch với mọi màn "cân lại" khác trong app (Hoàn
  // thành mẻ chế biến, Đếm giao ca cuối ca...) đều ưu tiên cân trừ bì khi nguyên liệu đã gắn
  // dụng cụ đựng. Dùng lại đúng itemCanWeighPOS()/openWeighPad() để nhất quán toàn hệ thống.
  const canWeigh = itemCanWeighPOS(c.itemId);
  openStockScanSheet(`
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Chưa hết — cân lại</div>
      <div style="font-size:20px;font-weight:700;color:var(--td);margin:6px 0 2px;">${escHtmlPos(c.itemName || '')}</div>
      <div style="font-size:13px;color:#999;letter-spacing:.5px;">${escHtmlPos(c.code || '')}</div>
      <div style="font-size:12px;color:#a16207;margin-top:8px;line-height:1.6;">Hệ thống tính theo công thức là tem này đã hết — nếu cân/đong lại thấy vẫn còn hàng thật, nhập đúng số còn lại để sửa lại tồn kho, tem vẫn ở trạng thái đang mở.</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-input-label" style="margin:0 0 6px;">Cân/đong lại còn (${escHtmlPos(c.unit || '')})</div>
      ${canWeigh
        ? weighBtnWide(`fifoNotEmptyWeigh('${containerId}')`, 'Cân trừ bì', 'Đặt chai/hũ lên cân — máy tự trừ bì') + '<div style="height:9px;"></div>'
        : ''}
      <div class="wal-input-group" style="margin-bottom:0;display:flex;align-items:center;gap:8px;">
        ${canWeigh ? '<span style="font-size:11.5px;color:#aaa;font-weight:600;flex-shrink:0;">hoặc</span>' : ''}
        <input id="fifoNotEmptyQty" type="number" inputmode="decimal" step="0.01" placeholder="${canWeigh ? 'Gõ tay' : '0'}" oninput="fifoNotEmptyQtyInput(this.value)" style="flex:1;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:18px;font-weight:700;color:var(--td);background:transparent;padding:10px 0;">
      </div>
      <div id="fifoNotEmptyWeighInfo"></div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-input-label" style="margin:0 0 6px;">Lý do / ghi chú (bắt buộc)</div>
      <div class="wal-input-group" style="margin-bottom:0;">
        <input id="fifoNotEmptyNote" type="text" placeholder="VD: rót ít hơn định lượng công thức, cân lại vẫn còn" style="width:100%;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:14px;color:var(--td);background:transparent;padding:10px 0;">
      </div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('fifoNotEmptyStaff')}</div>
    <button id="fifoNotEmptyBtn" onclick="submitFifoNotEmpty('${containerId}')" style="width:100%;padding:15px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Xác nhận vẫn còn hàng</button>
    <button onclick="closeStockScanSheet()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Huỷ</button>`);
}

// Mở bộ cân trừ bì cho đúng nguyên liệu của tem này. Cân xong đổ số vào ô đang có rồi chạy
// tiếp y hệt như khi nhân viên gõ tay — mọi thứ phía sau (validate, lưu) không cần biết số
// đến từ cân hay gõ tay.
function fifoNotEmptyWeigh(containerId) {
  const c = FIFO_PENDING_CONFIRM.find(x => x.id === containerId);
  if (!c) { toast('⚠️ Không tìm thấy mã này'); return; }
  openWeighPad({
    itemId: c.itemId, unit: c.unit,
    title: 'Cân ' + (c.itemName || ''),
    onDone: (total, lines) => {
      _fifoNotEmptyWeighLines = lines;
      const el = document.getElementById('fifoNotEmptyQty');
      if (el) el.value = total;
      const info = document.getElementById('fifoNotEmptyWeighInfo');
      if (info) info.innerHTML = weighSummaryHTML(lines, c.unit, `fifoNotEmptyWeigh('${containerId}')`);
    },
    onManual: () => { const el = document.getElementById('fifoNotEmptyQty'); if (el) el.focus(); }
  });
}

// Gõ tay đè lên số vừa cân mà không còn khớp bảng kê → bảng kê cũ hết ý nghĩa, vứt đi thay
// vì lưu kèm một bảng kê nói dối (cùng nguyên tắc onPrepFinishQtyInput/handoverCloseSetQty).
function fifoNotEmptyQtyInput(val) {
  if (!_fifoNotEmptyWeighLines.length) return;
  const cu = _fifoNotEmptyWeighLines.reduce((s, l) => s + (Number(l.net) || 0), 0);
  if (Math.abs(cu - (Number(val) || 0)) > 0.005) {
    _fifoNotEmptyWeighLines = [];
    const info = document.getElementById('fifoNotEmptyWeighInfo');
    if (info) info.innerHTML = '';
  }
}

async function submitFifoNotEmpty(containerId) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const qty = Number(document.getElementById('fifoNotEmptyQty')?.value);
  if (!(qty > 0)) { toast('⚠️ Nhập số thật cân/đong được, lớn hơn 0 — nếu đúng là đã hết thì dùng "Quét mã xác nhận" thay vì đây'); return; }
  const note = (document.getElementById('fifoNotEmptyNote')?.value || '').trim();
  if (!note) { toast('⚠️ Phải ghi rõ lý do/ghi chú'); return; }
  // Chụp lại bảng kê NGAY, trước khi chờ PIN — nhân viên có thể bấm mở bộ cân lần nữa trong
  // lúc đang chờ mạng, biến _fifoNotEmptyWeighLines thành của lần khác (cùng lý do
  // _submitPrepFinishImpl chụp _prepFinishWeighLines trước mọi await).
  const weighLines = _fifoNotEmptyWeighLines.slice(0);
  const opId = _fifoNotEmptyOpId || ('fne_' + containerId + '_' + Date.now());
  const staffEmp = await resolveStaffPinAndCheckin('fifoNotEmptyStaff');
  if (!staffEmp) return;

  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('fifoNotEmptyBtn', '⏳ Đang lưu...');
  try {
    await UnitEngine.units.fifoNotEmpty(containerId, qty, note, staffEmp, weighLines, opId);
    toast('✅ Đã sửa lại tồn kho — tem vẫn đang mở');
    closeStockScanSheet();
    refreshFifoAlert().catch(() => {});
  } catch (err) {
    console.error('submitFifoNotEmpty lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  } finally { _posSubmitBusy = false; restoreBtn(); }
}

// [FIX] TRƯỚC ĐÂY trạng thái "thu gọn" vẫn vẽ ra một cái chip chữ dài ("⚠️ N tem đã dùng
// hết theo tính toán — bấm để xác nhận") — câu chữ dài nên dù CSS đã co theo nội dung, nó
// vẫn rộng gần hết màn hình và đè lên đúng hàng phân loại món (filter-bar) ngay dưới logo,
// chặn luôn việc chọn danh mục lúc đang bán. Giờ trạng thái "thu gọn" KHÔNG vẽ gì thêm ở
// dưới nữa — chỉ còn đúng nút chuông kèm số đã có sẵn cạnh logo (#fifoAlertDot, nằm giữa
// nút mở sidebar và chữ "GIEO GIEO") làm dấu hiệu duy nhất; bấm vào nút đó mới bung bảng chi
// tiết đầy đủ (#fifoAlertBar), và bảng đó luôn hiện dạng panel to rõ ràng, không còn dạng
// chip rút gọn nửa vời nữa.
// [FIX-fifo-btn] TRƯỚC ĐÂY dấu hiệu chỉ là một chấm tròn 15px không số — nhìn không biết là
// cái gì. Giờ là nút chuông cùng khuôn với nút mở sidebar, kèm số đếm thật (huy hiệu .cb).
function renderFifoAlertBar() {
  const dot = document.getElementById('fifoAlertDot');
  const badge = document.getElementById('fifoAlertBadge');
  const bar = document.getElementById('fifoAlertBar');
  if (!dot || !bar) return;
  const n = FIFO_PENDING_CONFIRM.length;
  const cook = (typeof _prepSug !== 'undefined' && _prepSug.list) || [];
  const exp = typeof expirySoonLines === 'function' ? expirySoonLines() : [];   // [HẠN DÙNG 23/10] lô sắp / đã hết hạn — chỉ dữ liệu trong máy
  const tong = n + cook.length + exp.length;
  dot.style.display = tong ? 'flex' : 'none';
  if (badge) {
    badge.textContent = tong > 9 ? '9+' : String(tong);
    badge.classList.toggle('show', tong > 0);
  }
  if (!tong || !_fifoAlertExpanded) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'block';
  // [FIX-UI] TRƯỚC ĐÂY câu giải thích "Theo tính toán, tem này vừa dùng hết..." lặp lại
  // NGUYÊN VĂN cho từng tem — với 2-3 tem thì chiếm gần hết chiều cao panel, đẩy nút
  // "Quét mã xác nhận" ở cuối xuống dưới, dễ bị khuất/phải cuộn mới thấy. Giờ chỉ nói MỘT
  // LẦN, rút gọn, ngay dưới tiêu đề — từng dòng tem bên dưới chỉ còn tên + mã + nút riêng.
  // "Thu gọn" cũng đổi sang nền trắng viền rõ (trước là xám nhạt trên nền trắng, khó thấy).
  // Nút "Quét mã xác nhận" đổi từ hồng (var(--gd), trùng tông với lưới menu) sang xanh
  // dương (var(--bi)) để tách bạch hẳn khỏi các nút món trong menu.
  const thuGon = `<button onclick="toggleFifoAlertBar()" style="background:#fff;border:1.5px solid #ccc;border-radius:10px;padding:5px 10px;font-size:11.5px;font-weight:800;color:#333;cursor:pointer;">Thu gọn</button>`;
  const fifoHtml = !n ? '' : `
      <div class="fifo-alert-panel-h">
        <div style="font-size:13px;font-weight:800;color:#b91c1c;">Cần xác nhận đã hết (${n})</div>
        ${thuGon}
      </div>
      <div style="font-size:12px;color:#a16207;margin:2px 0 8px;line-height:1.5;">Các tem dưới đây đã dùng hết theo tính toán — quét mã để xác nhận, hoặc bấm "Chưa hết" nếu cân/đong lại vẫn còn hàng.</div>
      ${FIFO_PENDING_CONFIRM.map(c => `
        <div class="fifo-alert-item">
          <div style="font-size:13.5px;font-weight:700;color:var(--td);">${escHtmlPos(c.itemName || '')} <span style="font-size:11px;color:#999;font-weight:600;letter-spacing:.4px;">${escHtmlPos(c.code || '')}</span></div>
          <button onclick="fifoNotEmptyPrompt('${c.id}')" style="width:100%;margin-top:6px;padding:9px;background:#fff;color:#a16207;border:1.5px solid #f6d29a;border-radius:12px;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">Chưa hết — cân lại</button>
        </div>`).join('')}
      <button onclick="fifoAlertScanNow()" style="width:100%;margin-top:8px;padding:12px;background:var(--bi);color:#fff;border:none;border-radius:13px;font-family:'Google Sans',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;">Quét mã xác nhận</button>`;
  // Gợi ý nấu (xem prepSugRefresh) — cùng nút chuông, chỉ hiện khi nhân viên tự bấm mở.
  const cookHtml = !cook.length ? '' : `
      <div class="fifo-alert-panel-h" style="${n ? 'margin-top:14px;' : ''}">
        <div style="font-size:13px;font-weight:800;color:#92400e;">Nên nấu (${cook.length})</div>
        ${n ? '' : thuGon}
      </div>
      ${cook.map(x => { const t = prepSugLineText(x); return `
        <button onclick="prepSugGo('${x.prepId}',${x.ratio})" class="fifo-alert-item" style="width:100%;text-align:left;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;padding:10px 12px;margin-top:6px;cursor:pointer;font-family:'Google Sans',sans-serif;">
          <div style="font-size:13.5px;font-weight:800;color:#78350f;">${escHtmlPos(t.title)}</div>
          <div style="font-size:12px;color:#92400e;margin-top:2px;">${escHtmlPos(t.why)}</div>
        </button>`; }).join('')}
      <div style="font-size:11px;color:#a16207;margin-top:4px;">Bấm để mở Chế biến với số mẻ gợi ý — chỉ là gợi ý.</div>`;
  const expHtml = !exp.length ? '' : `
      <div class="fifo-alert-panel-h" style="${(n || cook.length) ? 'margin-top:14px;' : ''}">
        <div style="font-size:13px;font-weight:800;color:#b91c1c;">Sắp hết hạn (${exp.length})</div>
        ${(n || cook.length) ? '' : thuGon}
      </div>
      ${exp.map(x => `
        <div class="fifo-alert-item">
          <div style="font-size:13.5px;font-weight:700;color:var(--td);">${escHtmlPos(x.name)} <span style="font-size:11px;color:#999;font-weight:600;letter-spacing:.4px;">${escHtmlPos(x.code)}</span></div>
          <div style="font-size:12px;color:${x.expired ? '#b91c1c' : '#a16207'};margin-top:2px;">${escHtmlPos(expiryLineWhen(x))}</div>
        </div>`).join('')}
      <button onclick="expiryCheckOpenSoon()" style="width:100%;margin-top:8px;padding:12px;background:var(--gd);color:#fff;border:none;border-radius:13px;font-family:'Google Sans',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;">Kiểm tra lúc rảnh</button>`;
  bar.innerHTML = `
    <div class="fifo-alert-panel">${fifoHtml}${cookHtml}${expHtml}
    </div>`;
}

async function openStockUseScreen() {
  showScreen('stockUseScreen');
  _stockUseFilter = '';   // mở lại màn là danh sách đầy đủ, không dính bộ lọc lần trước
  _stockUseExpanded = false;
  const box = document.getElementById('stockUseBody');
  showLoading(box);
  await loadOpenContainers();
  renderStockUseList();
}

function stockExpiryLabel(c) {
  if (!c.expiresAt) return { text: c.openShelfLifeHours ? '' : 'Không đặt hạn', color: '#999' };
  const con = vnDate(c.expiresAt).getTime() - Date.now();
  const gio = Math.round(con / 3600000);
  if (con <= 0) return { text: 'QUÁ HẠN ' + Math.abs(Math.round(gio / 24)) + ' ngày', color: '#c0392b' };
  if (gio <= 24) return { text: 'Còn ' + gio + ' giờ', color: '#e67e22' };
  return { text: 'Còn ' + Math.round(gio / 24) + ' ngày', color: '#999' };
}

// Lọc theo tên — chỉ hiện khi đã mở rộng và danh sách dài. Quán khui vài chục loại
// thì cuộn tay tìm một dòng là chậm hơn gõ hai chữ.
let _stockUseFilter = '';

const STOCK_USE_FILTER_TU = 8;

// Mặc định chỉ hiện vài mã mở gần nhất: thứ nhân viên vừa khui là thứ hay cần báo hết
// nhất. Muốn xem đủ thì bấm mở rộng.
let _stockUseExpanded = false;

const STOCK_USE_PREVIEW = 3;

function stockUseSetFilter(v) { _stockUseFilter = v; renderStockUseRows(); }

function stockUseToggleExpand() { _stockUseExpanded = !_stockUseExpanded; if (!_stockUseExpanded) _stockUseFilter = ''; renderStockUseList(); }

const SU_QR_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/><rect x="7" y="7" width="4" height="4" rx=".8" stroke-width="1.6"/><rect x="13" y="7" width="4" height="4" rx=".8" stroke-width="1.6"/><rect x="7" y="13" width="4" height="4" rx=".8" stroke-width="1.6"/><g fill="currentColor" stroke="none"><rect x="13" y="13" width="1.8" height="1.8" rx=".3"/><rect x="15.2" y="15.2" width="1.8" height="1.8" rx=".3"/><rect x="15.2" y="13" width="1.8" height="1.8" rx=".3"/></g></svg>';

// Ô nút quét lớn (icon QR + tên + dòng phụ) dùng chung cho Quét mở/hết và Kiểm kê.
function scanTileBtn(onclick, label, sub, chinh) {
  return `
        <button onclick="${onclick}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:14px;padding:18px 16px 16px;
          background:${chinh ? 'var(--gd)' : '#fff'};color:${chinh ? '#fff' : 'var(--td)'};border:${chinh ? 'none' : '1.5px solid #EDE8DD'};border-radius:22px;
          box-shadow:${chinh ? '0 10px 22px -10px var(--gd)' : '0 3px 12px rgba(35,28,26,.05)'};font-family:'Google Sans',sans-serif;text-align:left;cursor:pointer;">
          <span style="width:48px;height:48px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:${chinh ? 'rgba(255,255,255,.2)' : 'var(--gl)'};color:${chinh ? '#fff' : 'var(--gd)'};">${SU_QR_SVG}</span>
          <span><span style="display:block;font-size:19px;font-weight:800;line-height:1.2;">${label}</span>
          <span style="display:block;font-size:12.5px;font-weight:600;margin-top:3px;opacity:${chinh ? '.85' : '.55'};">${sub}</span></span>
        </button>`;
}

// Vẽ RIÊNG phần danh sách, để lọc không làm mất con trỏ trong ô tìm.
function renderStockUseRows() {
  const box = document.getElementById('stockUseRows');
  if (!box) return;
  const tu = _stockUseFilter.trim().toLowerCase();
  // Mới mở gần nhất lên đầu. Chỉ sắp bản sao; STOCK_OPEN_LIST giữ thứ tự cũ cho chỗ khác dùng.
  const moiNhat = STOCK_OPEN_LIST.slice().sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));
  let list = tu
    ? moiNhat.filter(c => ((c.itemName || '') + ' ' + (c.code || '')).toLowerCase().includes(tu))
    : moiNhat;
  if (!_stockUseExpanded) list = list.slice(0, STOCK_USE_PREVIEW);
  if (!list.length) {
    box.innerHTML = `<div style="text-align:center;padding:24px;color:#bbb;font-size:14px;">${
      tu ? 'Không có mục nào khớp "' + wpEsc(_stockUseFilter) + '"' : 'Chưa có thứ gì đang mở.'}</div>`;
    return;
  }
  const p2 = n => String(n).padStart(2, '0');
  box.innerHTML = list.map((c, i) => {
    const ex = stockExpiryLabel(c);
    const moNgay = c.openedAt ? vnDate(c.openedAt) : null;
    const moStr = moNgay && !isNaN(moNgay) ? `${p2(moNgay.getHours())}:${p2(moNgay.getMinutes())} · ${p2(moNgay.getDate())}/${p2(moNgay.getMonth() + 1)}` : '';
    const exBg = ex.color === '#c0392b' ? '#FDECEA' : ex.color === '#e67e22' ? '#FEF3E6' : '#F2F2F4';
    const exFg = ex.color === '#999' ? '#6B6B70' : ex.color;
    return `
        <div style="display:flex;align-items:center;gap:12px;padding:16px 0;${i ? 'border-top:1px solid #F0EDE6;' : ''}">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:800;font-size:18px;line-height:1.25;color:var(--td);">${escHtmlPos(c.itemName || '')}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:7px;">
              <span style="font-size:16px;font-weight:800;letter-spacing:.8px;color:var(--td);background:#F2F2F4;border-radius:8px;padding:3px 9px;font-variant-numeric:tabular-nums;">${escHtmlPos(c.code || '')}</span>
              ${ex.text ? `<span style="font-size:12.5px;font-weight:800;color:${exFg};background:${exBg};border-radius:8px;padding:5px 9px;">${ex.text}</span>` : ''}
            </div>
            <div style="font-size:12.5px;color:#9A9AA0;margin-top:7px;">${moStr ? 'Mở ' + moStr : ''}${c.openedBy ? ' · ' + escHtmlPos(c.openedBy) : ''}</div>
          </div>
          <button onclick="startFinishContainer('${c.id}')" style="flex-shrink:0;height:56px;padding:0 16px;background:#FFF0F2;color:var(--gd);border:none;border-radius:16px;font-family:'Google Sans',sans-serif;font-size:14.5px;font-weight:800;line-height:1.2;cursor:pointer;">Báo<br>đã hết</button>
        </div>`;
  }).join('');
}

function renderStockUseList() {
  const box = document.getElementById('stockUseBody');
  if (!box) return;
  const list = STOCK_OPEN_LIST;
  const coQuet = typeof posScanAvailable === 'function' && posScanAvailable();
  const coAn = list.length > STOCK_USE_PREVIEW;
  const timDuoc = _stockUseExpanded && list.length >= STOCK_USE_FILTER_TU;
  const nutQuet = scanTileBtn;

  // Hai nút quét đặt ngay đầu màn, cạnh nhau: mở và báo hết là hai việc ngang hàng,
  // và phải thấy được ngay khi mở màn (nút báo hết từng nằm dưới đáy danh sách, không ai thấy).
  box.innerHTML = `
    <div style="display:flex;gap:10px;margin:0 0 14px;">
      ${nutQuet('scanToOpenContainer()', 'Quét mở', 'Khui mã mới', true)}
      ${nutQuet('scanToFinishContainer()', 'Báo hết', 'Quét mã đã dùng hết', false)}
    </div>
    ${coQuet ? '' : '<div style="font-size:12.5px;color:#c0392b;margin:-4px 4px 14px;line-height:1.5;">Máy này chưa quét được — cần mở bằng app của quán bản mới.</div>'}

    <div class="wal-section" style="margin:0;padding:18px 18px 10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
        <div style="font-size:17px;font-weight:800;color:var(--td);">Đang mở <span style="display:inline-block;min-width:26px;text-align:center;font-size:13px;font-weight:800;color:var(--gd);background:var(--gl);border-radius:999px;padding:3px 8px;margin-left:4px;vertical-align:2px;">${list.length}</span></div>
        ${coAn ? `<button onclick="stockUseToggleExpand()" style="display:flex;align-items:center;gap:5px;height:40px;padding:0 14px;background:#F6F4EF;color:var(--td);border:none;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">
          ${_stockUseExpanded ? 'Thu gọn' : 'Xem tất cả'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="${_stockUseExpanded ? 'transform:rotate(180deg);' : ''}"><path d="M6 9l6 6 6-6"/></svg>
        </button>` : ''}
      </div>
      ${timDuoc ? `
      <div class="wal-input-group" style="margin:12px 0 4px;">
        <input id="stockUseSearch" type="text" placeholder="Tìm theo tên hoặc mã..." value="${wpEsc(_stockUseFilter)}" oninput="stockUseSetFilter(this.value)">
      </div>` : ''}
      <div id="stockUseRows"></div>
    </div>`;
  renderStockUseRows();
}

// ---------- MỞ CHAI ----------
async function scanToOpenContainer() {
  if (typeof posScan !== 'function') { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) {
    if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error));
    return;
  }
  const c = await UnitEngine.codes.find(r.code);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + r.code + ' trong hệ thống'); return; }
  // Quét nhầm trạng thái là chuyện thường — nói rõ đang ở đâu thay vì báo lỗi chung chung.
  if (c.status === 'voided')   { toast('⛔ ' + c.code + ' đã bị huỷ (phiếu nhận ghi thừa) — bóc tem này bỏ đi, đừng dùng'); return; }
  // Đã báo mất (xem stock_lost_reports_gieogieo) — quét "mở" bình thường không xử lý được
  // ca này, vì hệ thống đã trừ tạm khỏi tồn kho khi Quản lý duyệt báo mất. Chỉ đường
  // "Quét mã hàng tìm lại được" ở Kiểm kê mới đúng cách phục hồi (cộng lại tồn kho).
  if (c.status === 'lost')     { toast('⚠️ ' + c.code + ' đang ở trạng thái "báo mất" — dùng nút "Quét mã hàng tìm lại được" ở Kiểm kê để phục hồi'); return; }
  if (c.status === 'open')     { toast('ℹ️ ' + c.code + ' đang mở rồi — muốn báo hết thì bấm "Báo hết"'); return; }
  if (c.status === 'discard_pending') { toast('⏳ Mã ' + c.code + ' đang báo hủy — vào Hao hụt nguyên liệu, quét lại để hoàn tất'); return; }
  if (c.status === 'finished') { toast(c.finishReason === 'discarded' ? 'ℹ️ Mã ' + c.code + ' đã báo hủy, không báo hết lần nữa' : 'ℹ️ ' + c.code + ' đã báo hết trước đó'); return; }
  // Đơn vị nguyên (cái rời, vd một gói bột) — mở lên là dùng hết luôn, không có
  // giai đoạn "đang mở, dùng dở" nào để theo dõi riêng. Quét "mở" cho loại này
  // thì coi luôn là báo hết, khỏi bắt quét thêm lần hai.
  if (c.status === 'sealed' && isAtomicUnitContainer(c)) { openConfirmFinishSheet(c, true); return; }
  openConfirmOpenSheet(c);
}

// [MỚI] Sheet xác nhận quét mã kho (mở/báo hết) — NỔI TRÊN đúng tab đang đứng thay vì
// buộc phải chuyển sang tab Kho mới thấy. Xem chú thích ở #stockScanSheetOverlay trong
// HTML: trước đây openConfirmOpenSheet()/openConfirmFinishSheet() vẽ thẳng vào
// #stockUseBody, quét từ tab khác (Chế biến, pill FIFO ở tab Order) thì sheet vẽ ra ở
// chỗ không hiện, hoặc phải ép chuyển tab rồi tự chuyển tay về tab cũ sau — đúng cái
// nhân viên phàn nàn là "mắc công chuyển về tab cũ rất mệt".
// true khi sheet đang là bước bắt buộc (in/dán tem mở): chạm ra ngoài không đóng được.
let _stockSheetLocked = false;

// Sheet mặc định trượt từ đáy; popup tem mở hiện giữa màn hình (Elio chọn).
function stockSheetSetCentered(on) {
  const overlay = document.getElementById('stockScanSheetOverlay');
  const body = document.getElementById('stockScanSheetBody');
  if (!overlay || !body) return;
  overlay.style.alignItems = on ? 'center' : 'flex-end';
  body.style.borderRadius = on ? '24px' : '24px 24px 0 0';
  body.style.width = on ? 'calc(100% - 32px)' : '100%';
  body.style.paddingBottom = on ? '22px' : '32px';
}

function openStockScanSheet(html) {
  const overlay = document.getElementById('stockScanSheetOverlay');
  const body = document.getElementById('stockScanSheetBody');
  if (!overlay || !body) return;
  _stockSheetLocked = false;
  stockSheetSetCentered(false);
  body.innerHTML = html;
  overlay.style.display = 'flex';
}

function closeStockScanSheet() {
  _stockSheetLocked = false;
  const overlay = document.getElementById('stockScanSheetOverlay');
  const body = document.getElementById('stockScanSheetBody');
  if (overlay) overlay.style.display = 'none';
  if (body) body.innerHTML = '';
  // [HẠN DÙNG 23/10] Màn kiểm hạn mở Báo hết NL → đóng màn (xong hoặc huỷ) thì đọc lại danh sách cần kiểm.
  if (typeof _expAfterSheet === 'function') { const f = _expAfterSheet; _expAfterSheet = null; f(); }
}

// Sau khi mở/báo hết xong (hoặc bị chặn giữa chừng), danh sách "Đang dùng" cần cập
// nhật NẾU đang đứng ở tab Kho — nhưng KHÔNG được tự ý chuyển sang tab đó nếu nhân
// viên đang ở tab khác (đó chính là hành vi cũ gây khó chịu).
function _refreshStockUseListIfActive() {
  const screen = document.getElementById('stockUseScreen');
  if (screen && screen.classList.contains('active')) {
    loadOpenContainers().then(renderStockUseList).catch(() => {});
  }
}

// [MỚI] KHOÁ "1 NGUYÊN LIỆU = 1 BAO ĐANG MỞ"
// ------------------------------------------------------------
// VÌ SAO: gốc rễ thật sự của các vụ "báo hết khi còn 70-100%" không phải do 2 tem cùng
// `status==='open'` (case đó submitFinishContainer đã tự chặn từ trước, xem 'nhieu_chai_mo')
// mà do một bao ĐANG ĐƯỢC DÙNG THẬT ngoài đời nhưng KHÔNG được quét "Xác nhận đã mở" — nó
// vẫn nằm `sealed` trong hệ thống nên bị tính là "nguyên chai, chưa đụng tới". Khi bao đó
// cuối cùng cũng được quét mở (thường đúng lúc đối soát mất tem) rồi báo hết ngay sau, toàn
// bộ phần chênh lệch âm thầm tích luỹ bấy lâu bị đổ hết vào đúng bao đó.
//
// Chặn ở đây tại nguồn: không cho mở bao thứ 2 của cùng 1 nguyên liệu trong khi bao trước
// còn `open`, buộc nhân viên phải báo hết bao cũ trước — nên sẽ không còn bao nào "âm thầm
// dùng dở mà vẫn sealed" nữa.
//
// Không có khái niệm phân quyền theo vai trò trong app này (`employees_gieogieo` chỉ có
// {fullName, pin, active}, không có field kiểu role/isManager) nên KHÔNG dùng "PIN quản lý"
// để override — dùng đúng cơ chế trách nhiệm app đang có sẵn ở mọi chỗ khác (báo hết chọn
// tay, báo mất tem...): PIN nhân viên định danh ai làm + lý do bắt buộc bằng chữ.
function openConfirmOpenSheet(c) {
  const han = Number(c.openShelfLifeHours) || 0;
  const hanStr = han > 0
    ? (han >= 24 ? Math.round(han / 24) + ' ngày' : han + ' giờ')
    : 'không đặt hạn';
  // Dùng STOCK_OPEN_LIST (cache đã tải sẵn cho màn Kho → Đang dùng) chỉ để QUYẾT ĐỊNH HIỂN
  // THỊ sheet nào — cache có thể cũ vài giây nên không dùng làm chốt chặn thật. Chốt chặn
  // thật đọc tươi trong submitOpenContainer() ngay trước khi ghi.
  // [UNIT ENGINE v2] Chỉ tính là "bao khác đang mở" (đáng cảnh báo) nếu bao đó THẬT SỰ còn
  // hàng (unitBase>0 hoặc chưa có field này — tem cũ trước khi có engine mới). Bao đã cạn thì
  // đây là carry-forward bình thường, không đáng cảnh báo — chỉ là GỢI Ý hiển thị, chốt chặn
  // thật (đọc tươi RT) nằm ở submitOpenContainer().
  const dangMoKhac = (STOCK_OPEN_LIST || []).filter(x => x.itemId === c.itemId && x.id !== c.id
    && !(typeof x.unitBase === 'number' && x.unitBase <= 0));
  if (dangMoKhac.length) {
    const ds = dangMoKhac.map(x => x.code || '—').join(', ');
    openStockScanSheet(`
      <div class="wal-section" style="margin:0 0 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:14px;padding:14px;">
        <div style="font-weight:700;color:#b91c1c;margin-bottom:6px;">🔴 ${escHtmlPos(c.itemName || '')} đang có bao khác mở: ${escHtmlPos(ds)}</div>
        <div style="font-size:12.5px;color:#7f1d1d;line-height:1.6;">Mỗi nguyên liệu chỉ nên có 1 bao đang mở tại một thời điểm. Mở thêm bao mới trong khi bao cũ chưa báo hết là nguyên nhân chính khiến hệ thống tính sai hao hụt lúc báo hết sau này. Báo hết bao đang mở trước nếu được.</div>
      </div>
      <div class="wal-section" style="margin:0 0 14px;">
        <div style="font-size:20px;font-weight:700;color:var(--td);margin:6px 0 2px;">${c.itemName || ''}</div>
        <div style="font-size:13px;color:#999;letter-spacing:.5px;">${c.code || ''} · ${fmtPrepQty(c.baseQty)} ${c.unit || ''}</div>
      </div>
      <div class="wal-section" style="margin:0 0 14px;">
        <div class="wal-section-title">Vì sao vẫn phải mở bao này?</div>
        <input type="text" id="openOverrideReason" placeholder="VD: bao cũ rách, hỏng, hết hạn..." style="width:100%;border:1px solid #e6e1d2;border-radius:10px;padding:11px;font-size:13.5px;">
      </div>
      <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('openCtStaff')}</div>
      <button onclick="submitOpenContainer('${c.id}', true)" style="width:100%;padding:15px;background:#c0392b;color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Vẫn mở (đã ghi lý do)</button>
      <button onclick="closeStockScanSheet()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Huỷ</button>`);
    return;
  }
  openStockScanSheet(`
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Xác nhận khui</div>
      <div style="font-size:20px;font-weight:700;color:var(--td);margin:6px 0 2px;">${c.itemName || ''}</div>
      <div style="font-size:13px;color:#999;letter-spacing:.5px;margin-bottom:10px;">${c.code || ''} · ${fmtPrepQty(c.baseQty)} ${c.unit || ''}</div>
      <div style="background:#fffbe8;border-radius:12px;padding:12px 14px;font-size:12.5px;font-weight:600;color:#b45309;line-height:1.6;">
        Sau khi mở, hạn dùng còn <b>${hanStr}</b>.${han > 0 ? ' Quá hạn hệ thống sẽ nhắc ở màn này.' : ''}
      </div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('openCtStaff')}</div>
    <button onclick="submitOpenContainer('${c.id}', false)" style="width:100%;padding:15px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Xác nhận đã mở</button>
    <button onclick="closeStockScanSheet()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Huỷ</button>`);
}

// [NL-RECON] Chỉ luồng mẻ đang giữ khóa mới được mở thêm mã cùng NL.
let prepReconOpeningContext = null;

async function prepReconStockBatch(itemId) {
  const lock=await fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId).get();
  if(!lock.exists)return null;
  const batchId=lock.data().batchId;
  const batch=await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
  const row=batch.data()?.reconcileInputs?.[itemId];
  if(!batch.exists||batch.data().status!=='cooking'||!row||row.status!=='pending')
    throw new Error('Nguyên liệu đang khóa để đối chiếu — mở mẻ đang nấu để tiếp tục');
  return batchId;
}

async function submitOpenContainer(id, isOverride) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý...'); return; }
  _posSubmitBusy = true;
  try {
    let overrideReason = '';
    if (isOverride) {
      const reasonEl = document.getElementById('openOverrideReason');
      overrideReason = (reasonEl && reasonEl.value.trim()) || '';
      if (!overrideReason) { toast('⚠️ Cần ghi rõ lý do mới mở được bao thứ 2'); return; }
    }
    // [Khoá NL đang chờ cân] NL của mẻ đang nấu chưa cân xong: mở mã mới CHỈ làm từ màn Đối chiếu NL của mẻ
    // (có prepReconOpeningContext) — kiểm ngay từ đầu, trước khi bắt nhập PIN.
    {
      const pre = await fstore.collection(STOCK_CONTAINERS_COLL).doc(id).get();
      if (pre.exists) {
        const lk = await fstore.collection('prep_ingredient_locks_gieogieo').doc(pre.data().itemId).get();
        if (lk.exists && !(prepReconOpeningContext && prepReconOpeningContext.itemId === pre.data().itemId)) {
          toast('⛔ Nguyên liệu này đang chờ cân cho mẻ chế biến — mở mã mới ở màn "Đối chiếu NL" của mẻ (Chế biến ▸ mẻ đang nấu), không mở ở tab Kho.'); closeStockScanSheet(); return;
        }
      }
    }
    const staffEmp = await resolveStaffPinAndCheckin('openCtStaff');
    if (!staffEmp) return;
    const ref = fstore.collection(STOCK_CONTAINERS_COLL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) { toast('❌ Không tìm thấy mã này'); return; }
    const c = doc.data();
    const lockDoc=await fstore.collection('prep_ingredient_locks_gieogieo').doc(c.itemId).get();
    if(prepReconOpeningContext && prepReconOpeningContext.itemId===c.itemId){
      const batchDoc=await fstore.collection('prep_batches_gieogieo').doc(prepReconOpeningContext.batchId).get();
      const batch=batchDoc.data(),row=batch&&batch.reconcileInputs&&batch.reconcileInputs[c.itemId];
      if(!batchDoc.exists||batch.status!=='cooking'||!row||row.status!=='pending'
          ||!lockDoc.exists||lockDoc.data().batchId!==prepReconOpeningContext.batchId)
        throw new Error('Mẻ đã chốt hoặc không còn giữ khóa nguyên liệu — tải lại mẻ trước khi mở mã');
    }
    const activePrepBatch=lockDoc.exists ? await prepReconStockBatch(c.itemId) : null;
    if(lockDoc.exists && !activePrepBatch){toast('⚠️ NL đang chờ đối chiếu — mở lại mẻ');return;}
    // Đọc lại trạng thái ngay trước khi ghi: hai máy cùng quét một chai thì máy sau phải
    // biết chai đã được mở rồi, chứ không ghi đè ngày mở của máy trước.
    if (c.status !== 'sealed') { toast('ℹ️ ' + (c.code || '') + ' không còn nguyên seal'); closeStockScanSheet(); _refreshStockUseListIfActive(); return; }
    if(prepReconOpeningContext?.exhaustedId && activePrepBatch===prepReconOpeningContext.batchId){
      const oldRef=fstore.collection(STOCK_CONTAINERS_COLL).doc(prepReconOpeningContext.exhaustedId);
      const oldDoc=await oldRef.get(),old=oldDoc.data();
      if(!oldDoc.exists||old.itemId!==c.itemId)throw new Error('Không tìm thấy mã cũ cần báo hết');
      if(old.status==='open')await UnitEngine.lifecycle.finish(oldRef.id,old,staffEmp,'prep_reconcile',false,
        oldRef,activePrepBatch,true);
      else if(old.status!=='finished'||old.prepReconPendingBatchId!==activePrepBatch)
        throw new Error('Mã cũ đã đổi trạng thái — mở lại đối chiếu mẻ');
    }

    // [MỚI] Chốt chặn thật của khoá "1 nguyên liệu = 1 bao đang mở" — đọc tươi ngay trước
    // khi ghi (khác với gợi ý hiển thị ở openConfirmOpenSheet() dựa vào cache). Bỏ qua nếu
    // đã có lý do override hợp lệ ở trên. Lỗi đọc (mất mạng...) thì cho qua, không chặn bán
    // hàng/vận hành vì lỗi hạ tầng.
    if (!isOverride) {
      let dangMoKhac = null;
      try {
        dangMoKhac = await fstore.collection(STOCK_CONTAINERS_COLL)
          .where('itemId', '==', c.itemId).where('status', '==', 'open').get();
      } catch (err) { console.warn('[khoá 1 bao mở] không kiểm tra được, cho qua', err); }
      let blockingDocs = (dangMoKhac && !dangMoKhac.empty) ? dangMoKhac.docs : [];
      // [UNIT ENGINE v2] Bao đã CẠN (unitBase<=0, đang chờ carry-forward hấp thụ nợ khi mở
      // bao mới) không phải "2 bao cùng mở thật" — đó chính xác là luồng bình thường của
      // engine mới (hết mà chưa kịp quét báo hết thì mở luôn bao kế tiếp). Đọc RT (nguồn thật
      // của phần đang mở) để lọc đúng những bao THẬT SỰ còn hàng ra khỏi khoá này.
      if (blockingDocs.length) {
        try {
          const liveSnap = await UnitEngine.units.ref(c.itemId).once('value');
          const live = liveSnap.val() || {};
          blockingDocs = blockingDocs.filter(d => {
            const base = (live[d.id] && typeof live[d.id].unitBase === 'number')
              ? live[d.id].unitBase : Number(d.data().unitBase);
            return !(isFinite(base) && base <= 0); // base<=0 → đã cạn, không chặn
          });
        } catch (err) { console.warn('[UnitEngine] không đọc được RT để lọc khoá mở bao, dùng nguyên danh sách', err); }
      }
      if (blockingDocs.length) {
        const otherCodes = blockingDocs.map(d => d.data().code || '—').join(', ');
        toast('⛔ ' + (c.itemName || 'Nguyên liệu này') + ' đang có bao mở: ' + otherCodes + ' — báo hết bao đó trước, hoặc quét lại và chọn "Vẫn mở" kèm lý do');
        closeStockScanSheet();
        _refreshStockUseListIfActive();
        return;
      }
    }

    // [RACE FIX] Trước đây get() rồi update() RIÊNG — 2 máy cùng quét 1 mã lúc còn 'sealed'
    // đều đọc thấy 'sealed' và CẢ HAI đều ghi 'open' thành công, rồi cả hai đều gọi
    // unitEngineOnOpen() cho CÙNG containerId (unitEngineOnOpen đã tự vá thành idempotent ở
    // trên, không còn mất số nếu bị gọi 2 lần — nhưng bản thân việc claim sealed→open vẫn nên
    // atomic để đúng ngữ nghĩa). Gộp đọc+kiểm tra+ghi vào 1 transaction Firestore: chỉ đúng 1
    // máy "thắng" claim này, máy còn lại thấy status không còn 'sealed' ngay trong transaction
    // và tự dừng sạch, không ghi gì cả.
    const nowISO = vnDate().toISOString();
    // [TEM MỞ] Nguyên liệu dùng thẳng không qua chế biến (topping đóng gói sẵn...) mà bao bì
    // gốc mang mã tem sẽ bị vứt ngay khi mở — cấu hình ở tab Nguyên liệu (quanlygieo.html).
    // Ghi cờ "cần in tem mở" NGAY TRONG transaction claim, cùng lúc với status:'open': nếu
    // tách thành một lượt ghi riêng sau đó, lượt ghi đó có thể trượt (mất mạng, đóng app giữa
    // chừng) và để lại một chai đã mở nhưng vĩnh viễn không lọt vào hàng chờ dán tem mở.
    // Đọc tươi cờ này từ doc nguyên liệu, không dựa vào KHO_ITEMS_CACHE: cache chỉ được nạp
    // khi đã vào màn Kho (quét mở từ màn Nấu chế biến có thể chưa có) và không biết Quản lý
    // vừa bật cờ — cache trống/cũ là tem mở bị bỏ qua mà không ai hay.
    let itemCfg = KHO_ITEMS_CACHE.find(x => x.id === c.itemId);
    try {
      const itemDoc = await fstore.collection('inventory_items_gieogieo').doc(c.itemId).get();
      if (itemDoc.exists) itemCfg = { id: itemDoc.id, ...itemDoc.data() };
    } catch (err) { console.warn('[tem mở] đọc cấu hình nguyên liệu lỗi, dùng cache', err); }
    const canPrintOpenLabel = !!(itemCfg && itemCfg.printOpenLabel);
    // [E4.2] Claim sealed→open (transaction) + đăng ký RT/hấp thụ nợ + chốt tồn nằm trong
    // unit_engine.v1.js (lifecycle.openSealed). Ở đây chỉ xử lý kết quả cho màn hình.
    const opened = await UnitEngine.lifecycle.openSealed(id, c, { nowISO, staffEmp, isOverride, overrideReason, canPrintOpenLabel });
    if (opened === 'not_found') { toast('❌ Không tìm thấy mã này'); return; }
    if (opened === 'taken') {
      toast('ℹ️ ' + (c.code || '') + ' vừa được mở ở máy khác rồi');
      closeStockScanSheet();
      _refreshStockUseListIfActive();
      return;
    }
    fifoOlderSealedHint(id, c).catch(() => {});
    if(activePrepBatch) await UnitEngine.prep.reconAttachOpenUnit(activePrepBatch,c.itemId,id)
      .catch(err=>toast('⚠️ Đã mở mã nhưng chưa ghi được vào mẻ — mở màn đối chiếu để thử lại: '+(err.message||err)));
    const reconOpening=prepReconOpeningContext;
    prepReconOpeningContext=null;
    toast('✅ Đã mở ' + (c.code || ''));
    if (canPrintOpenLabel) {
      openOpenLabelPrintSheet({ id, code: c.code, itemName: c.itemName, unit: c.unit, openedAt: nowISO, openedBy: staffEmp.fullName });
    } else {
      closeStockScanSheet();
    }
    _refreshStockUseListIfActive();
    if(reconOpening)openPrepReconForm(reconOpening.batchId,reconOpening.itemId);
  } catch (err) {
    console.error('submitOpenContainer lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  } finally { _posSubmitBusy = false; }
}

// [TEM MỞ] Bước BẮT BUỘC ngay sau khi báo mở một nguyên liệu dùng thẳng (cờ printOpenLabel
// ở submitOpenContainer). Tem giữ NGUYÊN mã cũ của container kèm giờ mở, dán vào dụng cụ
// đựng thay cho bao bì gốc sắp bị vứt. Không có nút "Để sau", chạm ra ngoài không đóng:
// phải In rồi bấm "Đã dán". Chỉ khi máy in lỗi mới cho để tem ở hàng chờ Tem kho.
// openLabelPrinted chỉ được ghi khi bấm "Đã dán" — in xong mà tắt app thì tem vẫn còn
// trong hàng chờ "Tem kho ▸ chờ dán".
let _openLabelPrintCtx = null;

let _openLabelStep = 'print';

function openOpenLabelPrintSheet(ctx) {
  _openLabelPrintCtx = ctx;
  _openLabelStep = 'print';
  renderOpenLabelSheet();
}

function renderOpenLabelSheet() {
  const ctx = _openLabelPrintCtx;
  if (!ctx) { closeStockScanSheet(); return; }
  const step = _openLabelStep;
  const soBuoc = (n, label, xong, dang) => `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="flex-shrink:0;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;
          ${xong ? 'background:#16a34a;color:#fff;' : dang ? 'background:var(--gd);color:#fff;' : 'background:#F2F2F4;color:#9A9AA0;'}">${xong ? caIcon('check', 16) : n}</span>
        <span style="font-size:16px;font-weight:800;color:${xong || dang ? 'var(--td)' : '#9A9AA0'};">${label}</span>
      </div>`;
  const nut = step === 'stick' ? `
      ${caBtn('confirmOpenLabelStuck()', 'check', 'Đã dán tem vào dụng cụ đựng', 'primary')}
      <button id="openLabelPrintBtn" onclick="submitOpenLabelPrintNow()" style="width:100%;margin-top:10px;height:48px;background:none;border:none;color:#6B6B70;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:800;text-decoration:underline;cursor:pointer;">Tem chưa ra? In lại</button>`
    : step === 'failed' ? `
      <div style="font-size:14px;font-weight:700;color:#b91c1c;background:#fee2e2;border-radius:12px;padding:10px 12px;margin-bottom:12px;line-height:1.5;">Máy in không gửi được tem. Kiểm tra máy in rồi in lại.</div>
      <button id="openLabelPrintBtn" onclick="submitOpenLabelPrintNow()" style="width:100%;min-height:56px;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:99px;background:var(--gd);color:#fff;border:none;box-shadow:0 4px 12px rgba(226,58,93,.3);font-family:'Google Sans',sans-serif;font-size:16px;font-weight:800;cursor:pointer;">In lại tem mở</button>
      <button onclick="deferOpenLabelPrint()" style="width:100%;margin-top:10px;height:48px;background:none;border:none;color:#6B6B70;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:800;text-decoration:underline;cursor:pointer;">Máy in hỏng, để ở Tem kho in sau</button>`
    : `
      <button id="openLabelPrintBtn" onclick="submitOpenLabelPrintNow()" style="width:100%;min-height:56px;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:99px;background:var(--gd);color:#fff;border:none;box-shadow:0 4px 12px rgba(226,58,93,.3);font-family:'Google Sans',sans-serif;font-size:16px;font-weight:800;cursor:pointer;">In tem mở</button>`;
  openStockScanSheet(`
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:800;color:#9A9AA0;">Bắt buộc in tem mở</div>
      <div style="font-size:23px;font-weight:800;color:var(--td);margin:8px 0 10px;line-height:1.25;">${escHtmlPos(ctx.itemName || '')}</div>
      <span style="font-size:18px;font-weight:800;letter-spacing:.8px;color:var(--td);background:#F2F2F4;border-radius:10px;padding:5px 12px;">${escHtmlPos(ctx.code || '')}</span>
    </div>
    <div style="margin:18px 0 16px;padding:14px 16px;background:#FEF3E6;border:2px solid #FBD38D;border-radius:16px;text-align:center;">
      <div style="font-size:19px;font-weight:800;color:#92400E;line-height:1.3;">Dán tem mới vào dụng cụ đựng</div>
      <div style="font-size:13.5px;font-weight:600;color:#A16207;margin-top:5px;line-height:1.45;">Bao bì gốc sẽ bị vứt. Tem mới giữ nguyên mã này, kèm giờ mở.</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin:0 0 18px;">
      ${soBuoc(1, 'In tem mở', step === 'stick', step !== 'stick')}
      ${soBuoc(2, 'Dán vào dụng cụ đựng rồi bấm Đã dán', false, step === 'stick')}
    </div>
    ${nut}`);
  stockSheetSetCentered(true);
  _stockSheetLocked = true;
}

async function submitOpenLabelPrintNow() {
  const ctx = _openLabelPrintCtx;
  if (!ctx) { closeStockScanSheet(); return; }
  const restoreBtn = setBtnBusy('openLabelPrintBtn', 'Đang in...');
  let ok = false;
  try {
    const r = await POSTemPrinter._enqueue(async () => {
      try { await temEnsureConnected(); } catch (e) { console.warn('[tem mở] nối lại lỗi', e); }
      return POSTemPrinter.printOpenLabel(ctx, 1);
    });
    ok = r !== false;
  } catch (err) {
    console.error('submitOpenLabelPrintNow lỗi', err);
  } finally { restoreBtn(); }
  if (ok) toast('Đã in tem mở ' + (ctx.code || '') + ', dán vào dụng cụ đựng');
  _openLabelStep = ok ? 'stick' : 'failed';
  renderOpenLabelSheet();
}

async function confirmOpenLabelStuck() {
  const ctx = _openLabelPrintCtx;
  if (!ctx) { closeStockScanSheet(); return; }
  try {
    // [E4.1] chú thích tem qua engine (chỉ trường cho phép — 3.9)
    await UnitEngine.containers.annotate(ctx.id, { openLabelPrinted: true, openLabelPrintedAt: vnDate().toISOString() });
  } catch (err) {
    // Không chặn nhân viên: tem đã dán thật, chỉ là hàng chờ Tem kho còn sót dòng này.
    console.error('confirmOpenLabelStuck lỗi', err);
    toast('⚠ Chưa lưu được, tem vẫn hiện ở "Tem kho ▸ chờ dán", bấm Đã dán ở đó');
  }
  _openLabelPrintCtx = null;
  closeStockScanSheet();
  refreshStockLabelBadge().catch(() => {});
}

function deferOpenLabelPrint() {
  _openLabelPrintCtx = null;
  closeStockScanSheet();
  toast('ℹ️ Tem mở đang chờ ở "Tem kho ▸ chờ dán"');
  refreshStockLabelBadge().catch(() => {});
}

// ---------- BÁO HẾT ----------
async function scanToFinishContainer() {
  if (typeof posScan !== 'function') { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) {
    if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error));
    return;
  }
  const c = await UnitEngine.codes.find(r.code);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + r.code + ' trong hệ thống'); return; }
  if (c.status === 'voided')   { toast('⛔ ' + c.code + ' đã bị huỷ (phiếu nhận ghi thừa) — bóc tem này bỏ đi, đừng dùng'); return; }
  if (c.status === 'lost')     { toast('⚠️ ' + c.code + ' đang ở trạng thái "báo mất" — dùng nút "Quét mã hàng tìm lại được" ở Kiểm kê để phục hồi'); return; }
  // Đơn vị nguyên (cái rời) bỏ qua yêu cầu "phải mở trước" — quét báo hết thẳng
  // từ nguyên seal cũng được, vì với loại này mở và dùng hết là một hành động.
  if (c.status === 'sealed' && !isAtomicUnitContainer(c)) { toast('ℹ️ ' + c.code + ' còn nguyên seal — mở trước đã'); return; }
  if (c.status === 'discard_pending') { toast('⏳ Mã ' + c.code + ' đang báo hủy — vào Hao hụt nguyên liệu, quét lại để hoàn tất'); return; }
  if (c.status === 'finished') { toast(c.finishReason === 'discarded' ? 'ℹ️ Mã ' + c.code + ' đã báo hủy, không báo hết lần nữa' : 'ℹ️ ' + c.code + ' đã báo hết trước đó'); return; }
  // Quét được = cầm đúng chai trên tay, không cần hỏi lý do.
  openConfirmFinishSheet(c, true);
}

// [MỚI] Quét báo dùng GẮN VỚI một nguyên liệu cụ thể — gọi từ banner "Mẻ này
// dùng nguyên liệu cần báo tem" trong màn Chế biến (xem renderPrepBatchForm).
// Khác scanToFinishContainer() ở chỗ CÓ kiểm tra mã quét được đúng là nguyên
// liệu đang chờ báo hay không — nhân viên đang cầm gói vừa xé cho MẺ NÀY, quét
// nhầm mã của nguyên liệu khác (đứng cạnh nhau trên kệ) thì phải báo ngay,
// không âm thầm báo hết nhầm món.
async function scanToFinishContainerForItem(expectedItemId) {
  if (typeof posScan !== 'function') { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) {
    if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error));
    return;
  }
  const c = await UnitEngine.codes.find(r.code);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + r.code + ' trong hệ thống'); return; }
  if (expectedItemId && c.itemId !== expectedItemId) {
    const expectedName = (KHO_ITEMS_CACHE.find(x => x.id === expectedItemId) || {}).name || '';
    toast('⚠️ Mã này là "' + (c.itemName || '') + '", không phải "' + expectedName + '" — quét đúng mã của nguyên liệu vừa mở');
    return;
  }
  if (c.status === 'voided')   { toast('⛔ ' + c.code + ' đã bị huỷ (phiếu nhận ghi thừa) — bóc tem này bỏ đi, đừng dùng'); return; }
  if (c.status === 'lost')     { toast('⚠️ ' + c.code + ' đang ở trạng thái "báo mất" — dùng nút "Quét mã hàng tìm lại được" ở Kiểm kê để phục hồi'); return; }
  if (c.status === 'sealed' && !isAtomicUnitContainer(c)) { toast('ℹ️ ' + c.code + ' còn nguyên seal — mở trước đã'); return; }
  if (c.status === 'discard_pending') { toast('⏳ Mã ' + c.code + ' đang báo hủy — vào Hao hụt nguyên liệu, quét lại để hoàn tất'); return; }
  if (c.status === 'finished') { toast(c.finishReason === 'discarded' ? 'ℹ️ Mã ' + c.code + ' đã báo hủy, không báo hết lần nữa' : 'ℹ️ ' + c.code + ' đã báo hết trước đó'); return; }
  // Gọi từ màn Chế biến (#prepBatchScreen) — openConfirmFinishSheet() vẽ vào sheet nổi
  // dùng chung (#stockScanSheetOverlay), không phải #stockUseBody nữa, nên KHÔNG cần
  // chuyển sang màn Kho mới thấy được sheet. TRƯỚC ĐÂY có gọi showScreen('stockUseScreen')
  // ở đây — đúng là sheet hiện ra được, nhưng đẩy nhân viên rời khỏi màn Chế biến đang
  // làm dở, quét xong phải tự bấm quay lại — đúng thứ bị phàn nàn là "mắc công chuyển về
  // tab cũ rất mệt".
  openConfirmFinishSheet(c, true);
}

function startFinishContainer(id) {
  const c = STOCK_OPEN_LIST.find(x => x.id === id);
  if (!c) { toast('⚠️ Không tìm thấy mã này'); return; }
  openConfirmFinishSheet(c, false);
}

/**
 * daQuet=true  → đã quét mã, không hỏi lý do.
 * daQuet=false → chọn tay. CHỈ hỏi lý do khi có từ 2 chai cùng nguyên liệu đang mở: lúc đó
 *                chọn sai mới có nghĩa. Một chai thì chọn kiểu gì cũng đúng.
 */
// [NL-RECON] Báo hết mã còn dương là ghi toàn bộ số đó thành hao hụt. Đọc RT
// ngay khi mở form và lại một lần khi chốt để nhân viên không vô tình bỏ mã
// đang định lấy cho mẻ ra khỏi danh sách mã mở.
async function finishContainerRemaining(id,c) {
  const snap=await UnitEngine.units.ref(c.itemId).child(id).once('value');
  const live=Number(snap.val()?.unitBase);
  if(snap.val() && Number.isFinite(live))return live;
  const stored=Number(c.unitBase);
  return Number.isFinite(stored)?stored:(Number(c.baseQty)||0);
}

async function openConfirmFinishSheet(c, daQuet) {
  let remaining=0, prepBatchId=null;
  try{
    prepBatchId=await prepReconStockBatch(c.itemId);
    if(c.status==='open'&&!isAtomicUnitContainer(c))remaining=await finishContainerRemaining(c.id,c);
  }catch(err){toast('⚠️ Không đọc được tồn mã trước khi báo hết — thử lại: '+(err.message||err));return;}
  // [Khoá NL đang chờ cân] NL của mẻ đang nấu chưa cân xong: báo hết CHỈ làm ở màn Đối chiếu NL của mẻ, để mốc
  // sổ, số cân và bill đã bán trong lúc chờ luôn khớp — không báo hết lẻ ở tab Kho.
  if(prepBatchId){toast('⛔ Nguyên liệu này đang chờ cân cho mẻ chế biến — báo hết mã ở màn "Đối chiếu NL" của mẻ (Chế biến ▸ mẻ đang nấu), không báo hết ở tab Kho.');return;}
  const cungLoai = STOCK_OPEN_LIST.filter(x => x.itemId === c.itemId).length;
  const canLyDo = !daQuet && cungLoai > 1;
  openStockScanSheet(`
    <div class="wal-section" style="margin:0 0 14px;">
      <div style="font-size:22px;font-weight:800;color:var(--td);line-height:1.25;">Báo hết mã này?</div>
      <div style="margin-top:14px;padding:14px 16px;background:#F7F5F0;border-radius:16px;">
        <div style="font-size:18px;font-weight:800;color:var(--td);line-height:1.25;">${escHtmlPos(c.itemName || '')}</div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;">
          <span style="font-size:17px;font-weight:800;letter-spacing:.8px;color:var(--td);background:#fff;border-radius:8px;padding:4px 10px;">${escHtmlPos(c.code || '')}</span>
          <span style="font-size:13px;color:#8A8A90;">${fmtPrepQty(c.baseQty)} ${escHtmlPos(c.unit || '')}</span>
          ${daQuet ? '<span style="font-size:12.5px;color:#16a34a;font-weight:800;">Đã quét mã trên tem</span>' : ''}
        </div>
      </div>
      <div style="font-size:13px;color:#8A8A90;line-height:1.55;margin-top:10px;">Kiểm tra đúng tên và mã trên tem. Báo hết xong, mã này rời khỏi danh sách đang mở và không dùng lại được.</div>
    </div>
    ${remaining>0.005?`<div class="wal-section" style="border:1.5px solid #0062AD;background:#EAF3FA;margin:0 0 14px">
      <b style="color:#0062AD">Mã ${escHtmlPos(c.code||'')} còn ${fmtPrepQty(remaining)} ${escHtmlPos(c.unit||'')}</b>
      <div style="font-size:12px;line-height:1.5;margin-top:7px">${prepBatchId?'Mẻ đang nấu sẽ đối chiếu mã này cùng mã mới. Chỉ báo hết khi gói cũ đã dùng hết.':'Nếu vẫn dùng phần này để nấu, giữ mã đang mở. Có thể mở thêm mã mới; lúc nấu sẽ cân riêng từng mã.'}</div>
      <label style="display:flex;gap:9px;align-items:flex-start;font-size:12px;margin-top:10px;color:#004b86">
        <input id="finishPositiveWasteAck" type="checkbox" style="width:18px;height:18px;flex-shrink:0;accent-color:#0062AD">
        <span>${prepBatchId?'Tôi xác nhận gói cũ đã hết; lượng thực dùng sẽ được tính khi đối chiếu mẻ.':`Tôi xác nhận không dùng tiếp phần còn lại. Báo hết sẽ ghi ${fmtPrepQty(remaining)} ${escHtmlPos(c.unit||'')} là hao hụt.`}</span>
      </label>
    </div>`:''}
    ${canLyDo ? `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Vì sao không quét mã?</div>
      <div style="font-size:11.5px;color:#999;line-height:1.6;margin-bottom:10px;">
        Đang có ${cungLoai} phần ${c.itemName || ''} cùng mở — chọn tay thì dễ nhầm,
        nên cần biết lý do không quét được.
      </div>
      ${STOCK_MANUAL_REASONS.map((r, i) => `
        <label style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #f0f0f0;cursor:pointer;min-height:48px;">
          <input type="radio" name="finishReason" value="${r.k}" ${i === 0 ? 'checked' : ''} style="width:20px;height:20px;flex-shrink:0;accent-color:var(--gd);">
          <span style="font-size:13.5px;font-weight:600;color:var(--td);">${r.label}</span>
        </label>`).join('')}
    </div>` : ''}
    <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('finishCtStaff')}</div>
    <button onclick="submitFinishContainer('${c.id}', ${daQuet})" style="width:100%;padding:15px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Xác nhận đã hết</button>
    <button onclick="closeStockScanSheet()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Huỷ</button>`);
}

// Ngưỡng "báo hết khi còn nhiều": còn hơn 25% dung tích mà đã báo hết thì đánh dấu để Quản lý
// xem lại. Đây là chỗ hở lớn nhất của cả cơ chế — làm đổ nguyên chai rồi khui ra bấm "đã hết"
// là mất tích hợp pháp. Không chặn (chặn thì nhân viên sẽ không báo gì cả, còn tệ hơn), nhưng
// phải để lại vết có tên người.
const FINISH_REVIEW_RATIO = 0.25;

async function submitFinishContainer(id, daQuet) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý...'); return; }
  _posSubmitBusy = true;
  try {
    const staffEmp = await resolveStaffPinAndCheckin('finishCtStaff');
    if (!staffEmp) return;
    const lyDoEl = document.querySelector('input[name="finishReason"]:checked');
    const lyDo = daQuet ? 'scanned' : (lyDoEl ? lyDoEl.value : 'khong_ro');

    const ref = fstore.collection(STOCK_CONTAINERS_COLL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) { toast('❌ Không tìm thấy mã này'); return; }
    const c = doc.data();
    // v19: sổ/mã đã chốt nhưng lượt dọn marker RT có thể lỗi. Cho engine tiếp tục
    // hoặc no-op nếu đã xong; không chặn retry chỉ vì status đã là finished.
    if (c.status === 'finished' && !isAtomicUnitContainer(c)) {
      await UnitEngine.lifecycle.finish(id, c, staffEmp, lyDo, daQuet, ref);
      return;
    }
    const activePrepBatch=await prepReconStockBatch(c.itemId);
    if(activePrepBatch){toast('⛔ Nguyên liệu này đang chờ cân cho mẻ chế biến — báo hết mã ở màn "Đối chiếu NL" của mẻ (Chế biến ▸ mẻ đang nấu), không báo hết ở tab Kho.');closeStockScanSheet();return;}
    await UnitEngine.prep.reconAssertFree(c.itemId,activePrepBatch);
    const laDonViNguyen = isAtomicUnitContainer(c);
    // Đơn vị nguyên (cái rời) cho phép chốt thẳng từ 'sealed' (mở+dùng hết gộp
    // một lượt quét) — mọi loại khác vẫn phải qua 'open' trước như cũ.
    if (c.status !== 'open' && !(c.status === 'sealed' && laDonViNguyen)) {
      toast('ℹ️ ' + (c.code || '') + ' không ở trạng thái đang mở'); closeStockScanSheet(); _refreshStockUseListIfActive(); return;
    }

    // Đơn vị nguyên: không có khái niệm "còn thừa một phần" như chai đo được
    // dung tích còn lại — dùng là dùng hết trọn cái, nên KHÔNG chạy phép trừ
    // tồn sổ/tồn lịch sử/chai nguyên bên dưới (phép trừ đó chỉ có nghĩa với
    // hàng đo ml/g). Luôn chốt wasteBase=0, không cần Quản lý xem lại.
    if (laDonViNguyen) {
      await UnitEngine.lifecycle.finishAtomic(ref, c, staffEmp, lyDo, daQuet);
      toast('✅ Đã chốt ' + (c.code || ''));
      refreshFifoAlert().catch(() => {}); // gỡ khỏi pill "cần xác nhận đã hết" nếu có
      closeStockScanSheet();
      _refreshStockUseListIfActive();
      return;
    }

    const remaining=await finishContainerRemaining(id,c);
    if(remaining>0.005 && !document.getElementById('finishPositiveWasteAck')?.checked){
      toast('⚠️ Mã '+(c.code||'')+' còn '+fmtPrepQty(remaining)+' '+(c.unit||'')+'. Xác nhận gói đã hết trước khi báo hết.');
      return;
    }
    // [UNIT ENGINE v2] unitBase đã LÀ số dư thật của đúng tem này (đồng bộ liên tục qua RT
    // mỗi lượt bán) — tính waste thẳng từ đó, không cần tái dựng qua tồn sổ/tồn lịch sử/chai
    // nguyên nào cả.
    await UnitEngine.lifecycle.finish(id, c, staffEmp, lyDo, daQuet, ref, activePrepBatch);
    return;

  } catch (err) {
    console.error('submitFinishContainer lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  } finally { _posSubmitBusy = false; }
}

// [NEW] MÀN TEM KHO — in tem cho hàng vừa nhận, và dọn nốt tem còn chờ dán
// ------------------------------------------------------------
// Vì sao TÁCH thời điểm sinh mã khỏi thời điểm dán tem: nhận một thùng 24 chai lúc 7h sáng
// đang bận mà bắt in và dán đủ 24 tem mới cho bấm "Nhận hàng" thì quy trình sẽ chết vào tuần
// thứ hai — nhân viên sẽ tìm cách bỏ qua. Nên nhận hàng cứ ghi sổ trước, mã sinh ngay ở trạng
// thái "chờ dán", in tem thành xấp rồi dán dần trong ca. Ô "Tem kho" ở màn Kho hiện số đỏ
// cho tới khi dán hết.
// ============================================================
let _stockLabelQueue = null;

let STOCK_LABEL_PENDING = [];

let STOCK_OPEN_LABEL_PENDING = [];

// [TEM MỞ] Song song với hàng chờ dán tem NHẬN ở trên, nhưng khác nguồn cờ (openLabelNeeded/
// openLabelPrinted thay vì labelPrinted) vì đây là tem sinh ra lúc MỞ, không phải lúc nhận —
// gộp chung một danh sách sẽ không phân biệt nổi "tem gì đang chờ dán" để ghi chú cho đúng.
async function loadPendingOpenLabels() {
  try {
    const snap = await fstore.collection(STOCK_CONTAINERS_COLL)
      .where('openLabelNeeded', '==', true).where('openLabelPrinted', '==', false).get();
    // Bỏ 'finished'/'voided' cùng lý do với tem nhận: chai đã hết hoặc bị huỷ thì tem mở
    // của nó không còn ý nghĩa để dán nữa.
    STOCK_OPEN_LABEL_PENDING = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.status !== 'finished' && c.status !== 'voided')
      .sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));
  } catch (err) {
    console.warn('loadPendingOpenLabels lỗi', err);
    STOCK_OPEN_LABEL_PENDING = [];
  }
  return STOCK_OPEN_LABEL_PENDING;
}

async function loadPendingStockLabels() {
  try {
    // Lọc theo labelPrinted chứ KHÔNG kèm status=='sealed': chai đã mở mà chưa kịp in tem
    // vẫn phải dán tem, nếu lọc theo 'sealed' thì nó biến mất khỏi danh sách chờ và không
    // còn đường nào in ra nữa. Chỉ bỏ chai đã dùng hết — tem cho chai đã hết là vô nghĩa.
    const snap = await fstore.collection(STOCK_CONTAINERS_COLL)
      .where('labelPrinted', '==', false).get();
    // Bỏ 'finished' (tem cho chai đã hết là vô nghĩa) và bỏ 'voided' — tem sinh nhầm do
    // phiếu nhận ghi thừa, Quản lý đã huỷ. Không lọc voided ở đây thì 27 con tem ma vẫn
    // nằm trong hàng chờ dán và vẫn tính vào chấm đỏ, nhân viên cứ thế in ra dán lên
    // những lon không tồn tại — đúng cái mà việc huỷ tem sinh ra để chặn.
    STOCK_LABEL_PENDING = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.status !== 'finished' && c.status !== 'voided')
      .sort((a, b) => String(a.receivedAt || '').localeCompare(String(b.receivedAt || '')));
  } catch (err) {
    console.warn('loadPendingStockLabels lỗi', err);
    STOCK_LABEL_PENDING = [];
  }
  return STOCK_LABEL_PENDING;
}

// Chấm đỏ trên ô "Tem kho" ở màn Kho. Gọi được bao nhiêu lần cũng vô hại.
async function refreshStockLabelBadge() {
  const badge = document.getElementById('stockLabelBadge');
  if (!badge) return;
  await Promise.all([loadPendingStockLabels(), loadPendingOpenLabels()]);
  const n = STOCK_LABEL_PENDING.length + STOCK_OPEN_LABEL_PENDING.length;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n ? 'flex' : 'none';
}

async function openStockLabelScreen() {
  showScreen('stockLabelScreen');
  const box = document.getElementById('stockLabelBody');
  showLoading(box);
  await Promise.all([loadPendingStockLabels(), loadPendingOpenLabels()]);
  renderStockLabelList();
}

// [TEM MỞ] Khối riêng cho tem mở chờ dán — ghi chú rõ "Tem mở cho ... chưa được dán" như
// yêu cầu, và nút "Đã dán" ở đây CHỈ dọn hàng chờ, không đụng gì tới tồn kho/trạng thái
// container (cùng nguyên tắc với markStockLabelsPrinted của tem nhận).
function renderOpenLabelPendingSection() {
  const list = STOCK_OPEN_LABEL_PENDING;
  if (!list.length) return '';
  // [PHÂN BIỆT LOẠI TEM] Card riêng, nền/viền màu hổ phách + nhãn "TEM MỞ" — để không lẫn
  // với "TEM NHẬN HÀNG" ở khối bên dưới. Trước đây hai khối dùng chung khuôn card trắng, tiêu
  // đề đều bắt đầu bằng "Còn N tem..." nên rất dễ nhầm giữa lúc bận, đặc biệt khi cả hai loại
  // cùng chờ dán một lúc.
  return `
    <div class="wal-section" style="margin:0 0 14px;background:#fffbeb;border:1.5px solid #fde68a;">
      <div class="wal-section-title" style="color:#92400e;">
        <span style="display:inline-flex;align-items:center;padding:3px 10px;background:#f59e0b;color:#fff;border-radius:20px;font-size:10.5px;font-weight:800;letter-spacing:.4px;">🏷 TEM MỞ</span>
        Còn ${list.length} chưa dán
      </div>
      <div style="font-size:11.5px;color:#92400e;line-height:1.6;">
        Sinh ra khi báo mở nguyên liệu dùng thẳng (bao bì gốc bị vứt) — <b>khác với tem nhận
        hàng</b> ở khối bên dưới. In rồi dán vào đúng dụng cụ đựng, dán xong bấm "Đã dán".
      </div>
      ${list.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #fde68a;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#78350f;letter-spacing:.5px;">${escHtmlPos(c.code || '')}</div>
            <div style="font-size:11.5px;color:#a16207;">Tem mở cho ${escHtmlPos(c.itemName || '')} chưa được dán</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="printOnePendingOpenLabel('${c.id}')" style="height:40px;padding:0 12px;background:#fff;color:#b45309;border:1.5px solid #f59e0b;border-radius:10px;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">In</button>
            <button onclick="markOpenLabelStuck('${c.id}')" style="height:40px;padding:0 12px;background:#fff7e6;color:#92400e;border:none;border-radius:10px;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">Đã dán</button>
          </div>
        </div>`).join('')}
    </div>`;
}

async function printOnePendingOpenLabel(id) {
  const c = STOCK_OPEN_LABEL_PENDING.find(x => x.id === id);
  if (!c) { toast('⚠️ Không tìm thấy tem'); return; }
  try {
    const r = await POSTemPrinter._enqueue(async () => {
      try { await temEnsureConnected(); } catch (e) { console.warn('[tem mở] nối lại lỗi', e); }
      return POSTemPrinter.printOpenLabel(c, 1);
    });
    if (r === false) toast('⚠ Máy in báo không gửi được — thử lại');
    else toast('🖨 Đã gửi tem mở ' + (c.code || ''));
  } catch (err) {
    console.error('printOnePendingOpenLabel lỗi', err);
    toast('❌ Không in được: ' + (err.message || err));
  }
}

// Đánh dấu tem mở đã dán — KHÔNG đụng tồn kho/trạng thái container, thuần tuý dọn hàng chờ.
async function markOpenLabelStuck(containerId) {
  try {
    // [E4.1] chú thích tem qua engine (chỉ trường cho phép — 3.9)
    await UnitEngine.containers.annotate(containerId, { openLabelPrinted: true, openLabelPrintedAt: vnDate().toISOString() });
    STOCK_OPEN_LABEL_PENDING = STOCK_OPEN_LABEL_PENDING.filter(c => c.id !== containerId);
    toast('✅ Đã đánh dấu đã dán');
    renderStockLabelList();
  } catch (err) {
    console.error('markOpenLabelStuck lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  }
}

function renderStockLabelList() {
  const box = document.getElementById('stockLabelBody');
  if (!box) return;
  // Tem của lượt nhận hàng vừa xong lên đầu, phần còn lại xếp theo thứ tự nhận.
  const vuaNhan = (_stockLabelQueue || []).map(c => c.id);
  const list = STOCK_LABEL_PENDING.slice()
    .sort((a, b) => (vuaNhan.includes(b.id) ? 1 : 0) - (vuaNhan.includes(a.id) ? 1 : 0));

  const openLabelHtml = renderOpenLabelPendingSection();

  if (!list.length) {
    _stockLabelQueue = null;
    if (!openLabelHtml) {
      box.innerHTML = `<div style="text-align:center;padding:44px 20px;color:#16a34a;font-size:15px;font-weight:700;">Đã dán hết tem<div style="font-size:12.5px;color:#999;font-weight:400;margin-top:8px;line-height:1.6;">Không còn đơn vị hàng nào chờ dán tem. Tem mới sẽ tự hiện ở đây sau mỗi lần nhận hàng.</div></div>`;
    } else {
      box.innerHTML = openLabelHtml;
    }
    return;
  }

  // Gom theo nguyên liệu cho dễ nhìn — một lần nhập 12 chai thì thấy "Syrup đào · 12 tem"
  // chứ không phải 12 dòng giống hệt nhau.
  const nhom = {};
  list.forEach(c => { (nhom[c.itemId] || (nhom[c.itemId] = { ten: c.itemName, items: [] })).items.push(c); });

  box.innerHTML = `
    ${openLabelHtml}
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">
        <span style="display:inline-flex;align-items:center;padding:3px 10px;background:#eee;color:#555;border-radius:20px;font-size:10.5px;font-weight:800;letter-spacing:.4px;">📦 TEM NHẬN HÀNG</span>
        Còn ${list.length} chưa dán
      </div>
      <div style="font-size:11.5px;color:#999;line-height:1.6;">
        In rồi dán lên đúng chai/gói/hộp. Dán xong bấm "Đã dán" để mã biến khỏi danh sách này.
        Tem in trượt thì cứ bấm in lại — mã không đổi.
      </div>
      <button onclick="printAllStockLabels()" style="width:100%;margin-top:12px;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">🖨 In tất cả ${list.length} tem</button>
    </div>
    ${Object.entries(nhom).map(([itemId, g]) => `
      <div class="wal-section" style="margin:0 0 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="font-weight:700;font-size:14px;color:var(--td);">${g.ten || ''}<span style="color:#999;font-weight:400;font-size:12px;"> · ${g.items.length} tem</span></div>
          <button onclick="markStockLabelsPrinted('${itemId}')" style="flex-shrink:0;padding:9px 14px;background:#fff;color:#16a34a;border:1.5px solid #16a34a;border-radius:10px;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">Đã dán hết</button>
        </div>
        ${g.items.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f0f0;">
            <div style="min-width:0;">
              <div style="font-weight:700;font-size:14px;color:var(--td);letter-spacing:.5px;">${c.code || ''}</div>
              <div style="font-size:11.5px;color:#999;">${fmtPrepQty(c.baseQty)} ${c.unit || ''}${c.trackingMode === 'batch' ? ' · cả lô' : ''}${c.status === 'open' ? '<span style="color:#e67e22;font-weight:700;"> · đang mở</span>' : ''}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button onclick="printOneStockLabel('${c.id}')" style="height:40px;padding:0 12px;background:#fff;color:var(--gd);border:1.5px solid var(--gd);border-radius:10px;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">In</button>
              <button onclick="markStockLabelsPrinted(null,'${c.id}')" style="height:40px;padding:0 12px;background:#f5f5f5;color:#666;border:none;border-radius:10px;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">Đã dán</button>
            </div>
          </div>`).join('')}
      </div>`).join('')}`;
}

async function printOneStockLabel(id) {
  const c = STOCK_LABEL_PENDING.find(x => x.id === id);
  if (!c) { toast('⚠️ Không tìm thấy tem'); return; }
  try {
    const r = await POSTemPrinter._enqueue(async () => {
      // Tem kho in rất thưa nên socket LAN gần như chắc chắn đã bị máy in tự đóng — nối lại
      // trước, đúng cách mà tem lô chế biến đang làm.
      try { await temEnsureConnected(); } catch (e) { console.warn('[tem kho] nối lại lỗi', e); }
      return POSTemPrinter.printStockLabel(c, 1);
    });
    if (r === false) toast('⚠ Máy in báo không gửi được — thử lại');
    else toast('🖨 Đã gửi tem ' + (c.code || ''));
  } catch (err) {
    console.error('printOneStockLabel lỗi', err);
    toast('❌ Không in được: ' + (err.message || err));
  }
}

async function printAllStockLabels() {
  const list = STOCK_LABEL_PENDING.slice();
  if (!list.length) return;
  toast(`🖨 Đang in ${list.length} tem...`);
  let failed = 0;
  await POSTemPrinter._enqueue(async () => {
    try { await temEnsureConnected(); } catch (e) { console.warn('[tem kho] nối lại lỗi', e); }
    for (let i = 0; i < list.length; i++) {
      // Một tem lỗi không được làm mất các tem còn lại — cùng nguyên tắc với tem lô.
      try { if (await POSTemPrinter.printStockLabel(list[i], 1) === false) failed++; }
      catch (e) { failed++; console.warn('[tem kho] lỗi tem ' + (i + 1), e); }
      await _temWaitDrain(8000);
      if (i < list.length - 1) await new Promise(r => setTimeout(r, 700));
    }
  });
  toast(failed ? `⚠ ${failed}/${list.length} tem chưa in được` : `🖨 Đã gửi ${list.length} tem`);
}

/**
 * Đánh dấu đã dán. Truyền itemId để đánh dấu cả nhóm, hoặc containerId cho một cái.
 * KHÔNG đụng tới tồn kho — đây thuần tuý là việc dọn danh sách chờ dán.
 */
async function markStockLabelsPrinted(itemId, containerId) {
  const ids = containerId ? [containerId]
            : STOCK_LABEL_PENDING.filter(c => c.itemId === itemId).map(c => c.id);
  if (!ids.length) return;
  try {
    // Ghi tuần tự thay vì batch: số lượng nhỏ (một lần nhập vài chục tem), và ghi trượt một
    // cái thì những cái trước vẫn được đánh dấu, không phải làm lại từ đầu.
    for (const id of ids) {
      // [E4.1] chú thích tem qua engine (chỉ trường cho phép — 3.9)
      await UnitEngine.containers.annotate(id, { labelPrinted: true, labelPrintedAt: vnDate().toISOString() });
    }
    STOCK_LABEL_PENDING = STOCK_LABEL_PENDING.filter(c => !ids.includes(c.id));
    if (_stockLabelQueue) _stockLabelQueue = _stockLabelQueue.filter(c => !ids.includes(c.id));
    toast(`✅ Đã đánh dấu ${ids.length} tem`);
    renderStockLabelList();
  } catch (err) {
    console.error('markStockLabelsPrinted lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  }
}

// [NEW] TEM KHO — mỗi đơn vị hàng nhập về là MỘT bản ghi có mã riêng
// ------------------------------------------------------------
// Vì sao dán tem lúc NHẬP chứ không phải lúc mở nắp: nếu mã chỉ sinh lúc mở thì chai còn
// nguyên seal KHÔNG có danh tính nào cả — mất một chai nguyên vẫn chỉ phát hiện được bằng
// đếm tổng, y như khi chưa có tem. Dán từ lúc nhập mới có chuỗi nhập → mở → hết, và chai
// biến mất giữa chừng mới lộ ra cùng mốc thời gian.
//
// Mức theo dõi do app Quản lý cấu hình cho từng nguyên liệu (tab Nguyên liệu):
//   'unit'  → mỗi đơn vị đếm một bản ghi + một tem  (nhập 12 chai = 12 tem)
//   'batch' → cả lô nhập một bản ghi + một tem      (nhập 100 hũ flan = 1 tem dán lên thùng)
//   'none'  → không sinh gì cả                      (ly, ống hút — tem đắt hơn hàng)
//
// MÃ: 8 KÝ TỰ NGẪU NHIÊN. Trước đây mã là <2 chữ đầu tên>-<ddMM>-<số thứ tự>, và nó SAI
// nghiêm trọng: phần chữ GỘP nhiều nguyên liệu ("Trà lài", "Trà đen", "Trà camelia" đều ra
// "TR") trong khi số thứ tự lại ĐẾM RIÊNG cho từng nguyên liệu — nên chai đầu tiên của mọi
// nguyên liệu bắt đầu bằng TR nhập cùng ngày đều nhận đúng một chuỗi TR-0509-01. Không phải
// trùng hiếm mà là trùng chắc chắn. Tệ hơn: mã đoán được, nhìn một tem là viết ra được mã của
// ngày mai.
//
// Mã mới không mang nghĩa gì cả, và đó là chủ ý: tên nguyên liệu, số lượng, ngày nhập ĐÃ được
// in to trên tem rồi (xem buildStockLabelLines) nên nhét chúng vào chuỗi mã không thêm thông
// tin nào, chỉ lấy mất tính duy nhất. Xếp FIFO vẫn nhìn dòng "Nhập dd/MM" trên tem, còn app
// thì xếp theo receivedAt chứ không theo chuỗi mã.
// ============================================================
const STOCK_CONTAINERS_COLL = 'stock_containers_gieogieo';

// [MỚI] Phiếu báo mất hàng — xem stockCountReportLost()/renderKhoLostReports() bên
// quanlygieo.html. Cùng nếp stock_counts_gieogieo: POS tạo pending_review, Quản lý duyệt.
const STOCK_LOST_REPORTS_COLL = 'stock_lost_reports_gieogieo';

// [MỚI] Báo mất TEM (Reprint Label) — KHÁC HẲN báo mất HÀNG ở trên. Cái này chỉ đổi định
// danh (mã tem) của một container ĐÃ tồn tại, không đụng tồn kho/GOGS/waste gì cả — xem
// khối "BÁO MẤT TEM" phía dưới để hiểu rõ ranh giới.
const MISSING_LABEL_REPORTS_COLL = 'stock_label_reports_gieogieo';

// Mã cũ LUÔN có dấu gạch ngang (TR-0509-01), mã mới thì không bao giờ — hai định dạng rời nhau
// hoàn toàn, nên mã mới không thể đụng mã cũ đang dán trên kệ.
function laMaCu(code) { return /^[A-Z0-9]{1,8}-\d{3,4}-\d{1,4}$/.test(String(code || '').trim().toUpperCase()); }

// Hạn sau khi mở — tính TỪ LÚC MỞ, nên lúc nhập chỉ lưu số giờ, chưa có ngày hết hạn.
function computeOpenExpiry(hours, fromISO) {
  const h = Number(hours) || 0;
  if (h <= 0) return null;
  const base = fromISO ? vnDate(fromISO) : vnDate();
  if (isNaN(base)) return null;
  return vnDate(base.getTime() + h * 3600000).toISOString();
}

// [MỚI] Container "đơn vị nguyên" — đại diện đúng MỘT cái rời (đơn vị pha chế
// đã là "cái", không đo bằng ml/g), không có khái niệm "còn thừa một phần"
// như chai nước cốt hay bao bột. Với loại này, "mở" rồi sau đó "báo hết" là
// HAI LƯỢT QUÉT cho cùng một hành động thực tế — mở gói lên là dùng hết luôn,
// không có khoảng "đang mở, dùng dở dang" nào đáng theo dõi riêng như chai
// nước cốt (mở ra rồi rót dần trong nhiều ngày). Container đủ điều kiện này
// cho phép MỘT lượt quét (mở HOẶC báo hết, cái nào quét trước cũng được) là
// xong việc luôn — xem chỗ dùng ở scanToOpenContainer/scanToFinishContainer/
// submitFinishContainer.
function isAtomicUnitContainer(c) {
  return !!c && c.trackingMode === 'unit'
    && String(c.unit || '').trim().toLowerCase() === 'cái'
    && !(Number(c.baseQty) > 1);
}

// Bản kiểm tra cùng ý nghĩa nhưng đọc trực tiếp trên NGUYÊN LIỆU (inventory_items_gieogieo)
// thay vì trên một container cụ thể — dùng để biết TRƯỚC khi có tem nào cả, ví dụ lúc quét
// công thức mẻ chế biến xem có nguyên liệu nào cần báo tem không (xem atomicUnitInputsForPrep).
//
// [FIX — lỗi logic nghiêm trọng] TRƯỚC ĐÂY chỉ nhìn `unit` (đơn vị PHA CHẾ) — nếu đơn vị
// pha chế là "cái" thì coi luôn là "mỗi tem = 1 cái, bắt quét được". Sai với nguyên liệu mà
// đơn vị PHA CHẾ là "cái" nhưng đơn vị IN TEM (đóng gói) lại là một quy cách khác gộp nhiều
// cái: VD trà 1 hộp = 25 túi, đơn vị pha chế là "cái" (tính theo túi) nhưng tem chỉ in theo
// HỘP — không hề tồn tại tem riêng cho từng túi để quét. Dùng phép kiểm tra cũ, công thức
// cần "5 cái" sẽ bắt quét đủ 5 tem, nhưng mọi lượt quét tem Hộp thật đều bị
// isAtomicUnitContainer() từ chối (baseQty=25>1) — cổng quét KHÔNG BAO GIỜ thoả được, chặn
// đứng luôn việc bắt đầu chế biến. Phải tính ra đúng baseQty của quy cách đóng gói đang chọn
// (giống hệt cách createContainersForReceipt() sinh tem) rồi áp cùng điều kiện `baseQty<=1`
// mà isAtomicUnitContainer() đã dùng cho container — chỉ nguyên liệu nào 1 tem THẬT SỰ đúng
// bằng 1 cái (như "Kit sữa gạo": đơn vị pha chế = cái, đơn vị in tem cũng = cái, baseQty=1)
// mới bắt quét.
// [TEM = SỰ THẬT] Nguyên liệu đã bật in tem (trackingMode 'unit'/'batch'): tồn kho CHỈ
// là tổng các mã còn lại (Σ tem chưa mở + Σ phần còn của tem đang mở) — xem
// _ueRecomputeCurrentStock. Khoản trừ nào không gắn được vào tem nào KHÔNG được trừ lén
// vào tồn nữa (trước đây cộng dồn vào untrackedPendingDelta — một số âm ẩn mà kiểm kê
// quét mã không bao giờ thấy, vd "KIT phô mai tươi" hệ thống 2 cái nhưng quét được 5 mã
// chưa mở). Thay vào đó ghi 1 dòng vào SỔ LỆCH (stock_anomalies_gieogieo) kèm nguồn, để
// Quản lý thấy ngay đường nào đang trừ ngoài tem (bug, sai công thức, quên quét mở...).
const STOCK_ANOMALY_COLL = 'stock_anomalies_gieogieo';

// [FIFO] Nhắc (không chặn) khi vừa mở/dùng một mã mà cùng nguyên liệu còn mã CHƯA MỞ nhận
// về sớm hơn — hàng cũ nằm lại kho lâu là nguồn hết hạn/hư hỏng hay gặp nhất.
async function fifoOlderSealedHint(id, c) {
  if (!c || !c.itemId) return;
  const snap = await fstore.collection(STOCK_CONTAINERS_COLL)
    .where('itemId', '==', c.itemId).where('status', '==', 'sealed').get();
  const mine = String(c.receivedAt || c.createdAt || '');
  if (!mine) return;
  const older = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.id !== id && String(x.receivedAt || '') && String(x.receivedAt) < mine.slice(0, 10))
    .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)));
  if (older.length) toast('ℹ️ Còn ' + older.length + ' mã ' + (c.itemName || '') + ' nhập sớm hơn (vd ' + (older[0].code || '') + ') — lần sau mở mã cũ trước');
}

// [MỚI] Nguyên liệu "đơn vị nguyên" (cái rời) nằm trong công thức mẻ của một bán thành
// phẩm — dùng để nhắc nhân viên báo tem ngay lúc bắt đầu chế biến (xem renderPrepBatchForm,
// khối "🔥 Đang chế biến"): bắt đầu nấu là lúc gói/hộp đó thực sự bị mở ra dùng, đúng thời
// điểm cần quét, khỏi phải nhớ quay lại màn Container sau.
function atomicUnitInputsForPrep(prepId) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepId);
  if (!p) return [];
  return (p.batchInputs || [])
    .filter(r => r.itemId && Number(r.qty) > 0)
    .map(r => ({ itemId: r.itemId, item: KHO_ITEMS_CACHE.find(x => x.id === r.itemId) }))
    .filter(r => UnitEngine.classify.isAtomic(r.item));
}

PosGieoMods.stockUnits = true;
