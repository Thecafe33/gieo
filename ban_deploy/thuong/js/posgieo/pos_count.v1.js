// Tách từ posgieo.html dòng 7693–8758 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_count.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).count = 'dang';

// ============================================================
// [NEW] GIAI ĐOẠN 6 — Kiểm kê (Stock Count) — BLIND COUNT
// (POS_Management_Integration_Workflow.md, mục "Giai đoạn 6 — Waste + Stock Count")
//
// QUAN TRỌNG (đã sửa lại theo đúng tinh thần "mù" — trước đây điền sẵn số hệ thống vào ô
// nhập, khiến nhân viên chỉ cần bấm gửi mà không cần đếm thật, làm mất hết ý nghĩa của
// việc kiểm kê): màn này giờ giống nguyên tắc Blind Cash Reconciliation (mục 12) —
// - KHÔNG hiển thị số hệ thống (`expectedBase`) ở bất kỳ đâu trên màn hình.
// - Ô nhập luôn BẮT ĐẦU TRỐNG, không điền sẵn giá trị nào.
// - KHÔNG có phản hồi/lệch số hiện theo thời gian thực khi đang gõ (sẽ lộ số hệ thống
//   ngược lại qua phép trừ nếu hiện "lệch X" ngay khi gõ).
// - Dòng nào để TRỐNG = "chưa đếm dòng đó trong lượt này" → KHÔNG gửi lên (không tính là
//   khớp, không tính là lệch — đơn giản là chưa có dữ liệu, nhân viên có thể quay lại đếm
//   sau, đúng tinh thần "không cần đếm hết trong 1 lần" đã có từ trước).
// - Việc so sánh với số hệ thống (`expectedBase`, `varianceBase`) vẫn được TÍNH và LƯU vào
//   Firestore lúc gửi — Management cần số này để duyệt điều chỉnh (mục 12.6: Management
//   luôn được xem toàn bộ, chỉ nhân viên POS mới bị giới hạn) — chỉ là không được HIỂN THỊ
//   ra UI cho nhân viên ở bất kỳ bước nào trong lúc đếm.
// ============================================================
// [SỬA] Mỗi dòng giờ có thêm `unitOptions` + `unitFactor` — nhân viên chọn đơn vị
// đếm phù hợp với thực tế (Thùng/Hộp/ml), thay vì bị ép đếm ra đơn vị pha chế.
// Không ai đếm sữa theo ml; ép quy đổi tay chính là nguồn sai số. `countedBase`
// vẫn luôn quy về đơn vị pha chế trước khi lưu → schema stock_counts_gieogieo và
// luồng duyệt bên Management không đổi gì.
//
// [MỚI] ĐẢO NGƯỢC dòng có tem (countMode:'unit') sang BẮT BUỘC QUÉT MÃ, không cho gõ
// tay số lượng nữa. Lý do: gõ tay thì nhân viên có thể ghi bừa một con số mà không cần
// tận tay cầm đúng chai/gói đó — quét mã thì bắt buộc mã tem đó phải THẬT SỰ tồn tại và
// đang ở trạng thái sealed/open thì mới tính, không thể "khai khống" một chai không có.
// Dòng KHÔNG có tem (countMode:'qty') vẫn đếm tay như cũ — không có mã nào để quét.
// `scannedLog`/`scannedSet` sống ở CẤP PHIÊN (không theo từng dòng) vì nhân viên quét
// liên tục, mã nào cũng tự tìm đúng nguyên liệu của nó, không cần chọn dòng trước.
// [MỚI] mismatches/reportedLostSet/inMismatchReview/staffEmp phục vụ bước "Kiểm tra lại"
// sau khi bấm Gửi kiểm kê — xem stockCountReviewAndSubmit()/stockCountBuildMismatches().
let stockCountState = { items: [], scannedLog: [], scannedSet: new Set(), mismatches: [], reportedLostSet: new Set(), inMismatchReview: false, staffEmp: null };

async function openStockCountScreen() {
  showScreen('stockCountScreen');
  stockCountState.scannedLog = [];
  stockCountState.scannedSet = new Set();
  stockCountState.mismatches = [];
  stockCountState.reportedLostSet = new Set();
  stockCountState.inMismatchReview = false;
  stockCountState.staffEmp = null;
  _scLogExpanded = false;
  const box = document.getElementById('stockCountBody');
  showLoading(box);
  try {
    // Luôn tải mới (không dùng KHO_ITEMS_CACHE cũ) để đảm bảo danh sách nguyên liệu đủ —
    // KHÔNG dùng số currentStock đọc được để hiển thị, chỉ giữ nội bộ cho việc so sánh sau.
    const snap = await fstore.collection('inventory_items_gieogieo').get();
    KHO_ITEMS_CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  } catch (err) {
    console.error('openStockCountScreen load items failed', err);
    box.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được danh mục nguyên liệu<br><span style="color:#aaa;font-size:12px">${err.message || ''}</span></div>`;
    return;
  }
  if (!KHO_ITEMS_CACHE.length) {
    box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Chưa có nguyên liệu nào.<br><span style="font-size:12px">Thêm ở app Quản lý trước.</span></div>';
    return;
  }
  // Chỉ đếm những món Quản lý đã bật "Nhân viên phải kiểm kê" (app Quản lý →
  // Kho → Vận hành → Kiểm kê). Món cũ chưa có field này được coi là PHẢI đếm
  // (staffCounts !== false), nên dữ liệu cũ không bị hụt dòng.
  const countable = KHO_ITEMS_CACHE.filter(it => it.staffCounts !== false);
  if (!countable.length) {
    box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Không có nguyên liệu nào cần kiểm kê.<br><span style="font-size:12px">Quản lý chưa bật món nào ở Kho → Kiểm kê.</span></div>';
    return;
  }
  // [NEW] Nguyên liệu có theo dõi theo đơn vị thì đếm theo CHAI, không theo ml — nhân viên
  // vào kho đếm được "còn 2 chai", không ai ước lượng nổi "2.660ml". Nạp sẵn số chai hệ
  // thống đang biết để đối chiếu lúc gửi (KHÔNG hiện ra màn hình — xem nguyên tắc đếm mù).
  // [MỚI] Ngoài đếm sealed/open, giờ còn cần đúng DANH SÁCH MÃ (cả chưa mở lẫn đang mở) —
  // dùng để đối chiếu sau khi quét xong: mã nào KHÔNG nằm trong danh sách đã quét thì coi
  // là "chưa tìm thấy", đưa vào màn Kiểm tra lại (xem stockCountBuildMismatches).
  let ctByItem = {};
  const gAdd = (m, itemId) => m[itemId] || (m[itemId] = { sealed: 0, open: 0, openCodes: [], allCodes: [] });
  try {
    const snap = await fstore.collection(STOCK_CONTAINERS_COLL).where('status', 'in', ['sealed', 'open']).get();
    snap.docs.forEach(d => {
      const c = d.data();
      const g = gAdd(ctByItem, c.itemId);
      g.allCodes.push({ id: d.id, code: c.code || '', status: c.status });
      if (c.status === 'sealed') g.sealed++;
      else { g.open++; g.openCodes.push({ id: d.id, code: c.code || '' }); }
    });
  } catch (err) {
    // 'in' cần Firestore mới; hỏng thì đếm bằng 2 lượt đọc riêng.
    console.warn('openStockCountScreen: đọc container gộp lỗi, thử tách:', err);
    try {
      const [s1, s2] = await Promise.all([
        fstore.collection(STOCK_CONTAINERS_COLL).where('status', '==', 'sealed').get(),
        fstore.collection(STOCK_CONTAINERS_COLL).where('status', '==', 'open').get()
      ]);
      ctByItem = {};
      s1.docs.forEach(d => { const c = d.data(); const g = gAdd(ctByItem, c.itemId); g.sealed++; g.allCodes.push({ id: d.id, code: c.code || '', status: 'sealed' }); });
      s2.docs.forEach(d => { const c = d.data(); const g = gAdd(ctByItem, c.itemId); g.open++; g.openCodes.push({ id: d.id, code: c.code || '' }); g.allCodes.push({ id: d.id, code: c.code || '', status: 'open' }); });
    } catch (e2) { console.warn('openStockCountScreen: đọc container lỗi hẳn', e2); ctByItem = {}; }
  }

  stockCountState.items = countable.map(it => {
    const mode = (it.trackingMode === 'unit' || it.trackingMode === 'batch') ? it.trackingMode : 'none';
    const pk = (it.packagingUnits || []).find(p => p.name === it.countUnitName);
    // [FIX] Nguyên liệu đơn vị pha chế là "cái" (dùng công tắc bật/tắt tem đơn giản bên
    // Quản lý — xem renderTrackingBox) KHÔNG bắt khai quy cách đóng gói, nên không có `pk`
    // — nhưng tem vẫn sinh bình thường (xem isDiscreteUnit ở createContainersForReceipt).
    // Thiếu nhánh này thì món có tem thật vẫn bị rơi xuống "Đếm tay — không có tem": có tem
    // ở màn Container mà kiểm kê lại không nhận ra, HAI nơi lệch nhau cùng một dữ liệu.
    const isDiscreteUnit = String(it.unit || '').trim().toLowerCase() === 'cái';
    const donVi = pk && Number(pk.baseQty) > 0 ? { label: pk.name, baseQty: Number(pk.baseQty) }
      : (mode === 'unit' && isDiscreteUnit ? { label: it.unit, baseQty: 1 } : null);
    const ct = ctByItem[it.id] || { sealed: 0, open: 0, openCodes: [], allCodes: [] };

    // Có theo dõi theo đơn vị VÀ đã khai đơn vị đếm → đếm theo chai (2 ô: chưa mở / đang mở).
    if (mode !== 'none' && donVi) {
      return {
        itemId: it.id, name: it.name, unit: it.unit,
        countMode: 'unit',
        countUnitName: donVi.label, baseQtyPerUnit: donVi.baseQty,
        expectedSealedUnits: ct.sealed, expectedOpenUnits: ct.open, openCodes: ct.openCodes,
        // [MỚI] Toàn bộ mã (sealed+open) của món này — đối chiếu sau khi quét xong để tìm
        // mã "chưa tìm thấy" (xem stockCountBuildMismatches). KHÔNG dùng để so lệch số ngay
        // lúc đếm (vẫn giữ đúng nguyên tắc "đếm mù") — chỉ dùng ở bước SAU khi đã bấm gửi.
        allCodes: ct.allCodes,
        // Đối chiếu chỉ tính phần CHAI NGUYÊN: phần trong chai đang mở không ai đo được,
        // đưa nó vào phép trừ là lần kiểm kê nào cũng lệch và cảnh báo thành rác.
        expectedBase: ct.sealed * donVi.baseQty,
        // [MỚI] Dòng này giờ đếm bằng QUÉT MÃ (xem stockCountScan) — không còn ô gõ tay.
        // countedSealed/countedOpen bắt đầu ở 0 và CỘNG DẦN theo từng mã quét được (không
        // phải "chưa đếm" nữa — touched mới là cờ phân biệt "chưa đụng tới" với "đã quét,
        // ra 0"). markedEmpty = nhân viên xác nhận tay "không còn tem nào" khi kệ trống thật
        // (không có mã để quét thì không cách nào tự phát sinh bằng chứng quét được).
        countedSealed: 0, countedOpen: 0, countedBase: null, touched: false, markedEmpty: false
      };
    }
    // Mặc định chọn đơn vị LỚN NHẤT đã khai — kiểm kê thực tế thường đếm theo
    // kiện lớn trước ("còn 3 thùng"), nhân viên vẫn đổi được sang đơn vị nhỏ hơn.
    const opts = [{ label: it.unit, baseQty: 1 }, ...(it.packagingUnits || []).map(p => ({ label: p.name, baseQty: Number(p.baseQty) || 1 }))];
    const biggest = opts.reduce((a, b) => (b.baseQty > a.baseQty ? b : a), opts[0]);
    return {
      itemId: it.id, name: it.name, unit: it.unit,
      countMode: 'qty',
      unitOptions: opts, unitFactor: biggest.baseQty,
      expectedBase: Number(it.currentStock) || 0,
      countedInput: null, countedBase: null // null = chưa đếm dòng này
    };
  });
  renderStockCountForm();
}

// [MỚI] Dòng có tem giờ đếm bằng QUÉT MÃ — một nút quét DUY NHẤT cho cả màn, không phải
// chọn dòng trước rồi mới quét. Mỗi mã quét được tự tìm đúng nguyên liệu của nó (qua
// findContainerByCode, itemId lưu sẵn trong tem) rồi cộng vào đúng dòng.
async function stockCountScan() {
  if (typeof posScan !== 'function' || !posScanAvailable()) { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) {
    if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error));
    return;
  }
  const ma = String(r.code || '').trim().toUpperCase();
  if (!ma) return;
  // Quét trùng mã NGAY TRONG LƯỢT KIỂM KÊ NÀY — báo rõ, không cộng thêm lần hai. Một tem
  // vật lý chỉ có một cái, quét trúng lại chỉ có thể là quét nhầm/quét lại chai vừa cầm.
  if (stockCountState.scannedSet.has(ma)) {
    const truoc = stockCountState.scannedLog.find(x => x.code === ma);
    toast('⚠️ Mã ' + ma + ' đã quét rồi' + (truoc ? ' lúc ' + truoc.timeStr : '') + ' — không tính thêm');
    return;
  }
  const c = await UnitEngine.codes.find(ma);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + ma + ' trong hệ thống'); return; }
  if (c.status === 'voided')   { toast('⛔ ' + ma + ' đã bị huỷ — không tính vào kiểm kê'); return; }
  if (c.status === 'finished') { toast('ℹ️ ' + ma + ' đã báo hết trước đó — không còn là tồn hiện có'); return; }
  // Mã đã báo mất — quét mã thường không xử lý được; dùng đúng nút "Quét mã hàng tìm lại
  // được" (stockCountScanFound) để phục hồi, vì thao tác đó còn phải cộng lại tồn kho.
  if (c.status === 'lost')     { toast('⚠️ ' + ma + ' đang ở trạng thái "báo mất" — dùng nút "Quét mã hàng tìm lại được" bên dưới'); return; }
  const line = stockCountState.items.find(l => l.itemId === c.itemId && l.countMode === 'unit');
  if (!line) { toast('ℹ️ ' + (c.itemName || '') + ' không cần kiểm kê (Quản lý chưa bật)'); return; }
  line.touched = true;
  line.markedEmpty = false; // có bằng chứng quét được rồi thì bỏ cờ "khai tay không còn"
  if (c.status === 'sealed') line.countedSealed++; else line.countedOpen++;
  line.countedBase = line.countedSealed * line.baseQtyPerUnit;
  const now = vnDate();
  const p2 = n => String(n).padStart(2, '0');
  stockCountState.scannedLog.unshift({
    code: ma, itemId: c.itemId, itemName: line.name, status: c.status,
    timeStr: p2(now.getHours()) + ':' + p2(now.getMinutes())
  });
  stockCountState.scannedSet.add(ma);
  toast('✅ ' + line.name + ' · ' + (c.status === 'sealed' ? 'chưa mở' : 'đang mở'));
  // [MỚI] Đang ở màn "Kiểm tra lại" (sau khi bấm Gửi kiểm kê, có mã chưa khớp) thì quét
  // xong phải vẽ LẠI đúng màn đó (tính lại còn thiếu mã nào), không được nhảy về màn đếm
  // chính — nhân viên đang xử lý dở danh sách "chưa tìm thấy".
  if (stockCountState.inMismatchReview) {
    stockCountState.mismatches = stockCountBuildMismatches();
    renderStockCountMismatchScreen();
  } else {
    renderStockCountForm();
  }
}

// Bỏ một mã quét nhầm khỏi lượt kiểm kê — trừ lại đúng dòng đã cộng.
function stockCountUndoScan(code) {
  const idx = stockCountState.scannedLog.findIndex(x => x.code === code);
  if (idx < 0) return;
  const e = stockCountState.scannedLog[idx];
  const line = stockCountState.items.find(l => l.itemId === e.itemId && l.countMode === 'unit');
  if (line) {
    if (e.status === 'sealed') line.countedSealed = Math.max(0, line.countedSealed - 1);
    else line.countedOpen = Math.max(0, line.countedOpen - 1);
    line.countedBase = line.countedSealed * line.baseQtyPerUnit;
    const conLai = stockCountState.scannedLog.some((x, i) => i !== idx && x.itemId === e.itemId);
    if (!conLai && !line.markedEmpty) line.touched = false;
  }
  stockCountState.scannedLog.splice(idx, 1);
  stockCountState.scannedSet.delete(code);
  renderStockCountForm();
}

// Kệ trống thật (không có tem nào để quét) thì không cách nào tự sinh bằng chứng quét
// được — cho nhân viên xác nhận tay, nhưng CHỈ khi dòng đó đang ở 0/0 (chưa quét được cái
// nào). Có bằng chứng quét thật rồi thì ưu tiên bằng chứng, không cho xác nhận tay đè lên.
function stockCountMarkEmpty(idx) {
  const l = stockCountState.items[idx];
  if (!l || l.countedSealed > 0 || l.countedOpen > 0) return;
  l.markedEmpty = !l.markedEmpty;
  l.touched = l.markedEmpty;
  l.countedBase = l.touched ? 0 : null;
  renderStockCountForm();
}

function stockCountLineChange(idx, val) {
  const l = stockCountState.items[idx];
  const v = (val === '' || val === null || val === undefined) ? null : Number(val);
  l.countedInput = (v === null || isNaN(v)) ? null : v;
  l.countedBase = l.countedInput === null ? null : l.countedInput * l.unitFactor;
  // Cố ý KHÔNG hiện lệch/phản hồi gì ở đây — hiện ra sẽ lộ ngược số hệ thống.
}

// Đổi đơn vị đếm của 1 dòng — tính lại countedBase theo số đã gõ (nếu có).
// Cố ý KHÔNG render lại (mất focus) và không hiện quy đổi ra đơn vị pha chế:
// hiện "= 3000ml" thì nhân viên suy ngược ra được thang đo số hệ thống.
function stockCountUnitChange(idx, factor) {
  const l = stockCountState.items[idx];
  l.unitFactor = Number(factor) || 1;
  l.countedBase = l.countedInput === null ? null : l.countedInput * l.unitFactor;
}

// Kiểm kê giao diện mới: 2 ô quét lớn ở đầu màn (giống Quét mở/hết), danh sách mã đã
// quét thu gọn còn vài mã mới nhất, nút mở rộng nằm ngay tiêu đề.
let _scLogExpanded = false;

const SC_LOG_PREVIEW = 3;

function stockCountToggleLog() { _scLogExpanded = !_scLogExpanded; renderStockCountForm(); }

function scPill(text, fg, bg) {
  return `<span style="display:inline-block;font-size:13px;font-weight:800;color:${fg || 'var(--gd)'};background:${bg || 'var(--gl)'};border-radius:999px;padding:4px 10px;white-space:nowrap;">${text}</span>`;
}

function scCardTitle(text, pill, right) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
      <div style="font-size:19px;font-weight:800;color:var(--td);">${text}${pill ? ' <span style="vertical-align:2px;margin-left:2px;">' + pill + '</span>' : ''}</div>${right || ''}</div>`;
}

function renderStockCountForm() {
  const box = document.getElementById('stockCountBody');
  const unitItems = stockCountState.items.filter(l => l.countMode === 'unit');
  const qtyItems  = stockCountState.items.filter(l => l.countMode === 'qty');
  const coQuet = typeof posScanAvailable === 'function' && posScanAvailable();
  const daXongUnit = unitItems.filter(l => l.touched).length;
  const log = stockCountState.scannedLog;
  const logShow = _scLogExpanded ? log : log.slice(0, SC_LOG_PREVIEW);
  const chip = (label, n) => `<span style="font-size:14px;font-weight:700;color:#6B6B70;background:#F2F2F4;border-radius:8px;padding:4px 9px;">${label} <b style="color:var(--td);font-size:15px;">${n}</b></span>`;

  box.innerHTML = `
    ${unitItems.length ? `
    <button onclick="stockCountScan()" style="width:100%;display:flex;align-items:center;gap:16px;padding:18px 18px;margin:0 0 10px;background:var(--gd);color:#fff;border:none;border-radius:22px;
      box-shadow:0 10px 22px -10px var(--gd);font-family:'Google Sans',sans-serif;text-align:left;cursor:pointer;">
      <span style="flex-shrink:0;width:56px;height:56px;border-radius:17px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.2);">${SU_QR_SVG.replace(/width="26" height="26"/, 'width="30" height="30"')}</span>
      <span><span style="display:block;font-size:21px;font-weight:800;line-height:1.2;">Quét mã kiểm kê</span>
      <span style="display:block;font-size:13px;font-weight:600;margin-top:3px;opacity:.85;">Quét từng chai, gói, hộp có tem</span></span>
    </button>` : ''}
    <div style="display:flex;justify-content:flex-end;margin:0 0 14px;">
      <button onclick="stockCountScanFound()" style="display:flex;align-items:center;gap:7px;height:44px;padding:0 16px;background:#fff;color:var(--td);border:2px solid #e6e1d2;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">
        <span style="color:var(--gd);display:flex;">${SU_QR_SVG.replace(/width="26" height="26"/, 'width="18" height="18"')}</span>Tìm lại hàng báo mất</button>
    </div>
    ${coQuet ? '' : '<div style="font-size:12.5px;color:#c0392b;margin:-4px 4px 14px;line-height:1.5;">Máy này chưa quét được — cần mở bằng app của quán bản mới.</div>'}

    ${unitItems.length ? `
    <div class="wal-section" style="margin:0 0 14px;padding:18px 18px 8px;">
      ${scCardTitle('Món có tem', scPill(daXongUnit + '/' + unitItems.length + ' đã quét'))}
      ${unitItems.map((l, i) => {
        const idx = stockCountState.items.indexOf(l);
        const trong = l.countedSealed === 0 && l.countedOpen === 0;
        return `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 0;${i ? 'border-top:1px solid #F0EDE6;' : ''}">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:800;font-size:18px;line-height:1.25;color:var(--td);">${escHtmlPos(l.name || '')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;">
              ${l.touched || !trong
                ? chip('Chưa mở', l.countedSealed) + chip('Đang mở', l.countedOpen)
                : scPill('Chưa quét', '#B45309', '#FEF3E6')}
            </div>
          </div>
          ${trong ? `
          <button onclick="stockCountMarkEmpty(${idx})" style="flex-shrink:0;display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;
            ${l.markedEmpty ? 'background:#E8F7EE;color:#15803d;border:2px solid #86efac;' : 'background:#fff;color:#6B6B70;border:2px solid #e6e1d2;'}">
            ${l.markedEmpty ? caIcon('check', 16) : ''}Không còn tem</button>` : ''}
        </div>`;
      }).join('')}
    </div>

    ${log.length ? `
    <div class="wal-section" style="margin:0 0 14px;padding:18px 18px 8px;">
      ${scCardTitle('Đã quét', scPill(log.length), log.length > SC_LOG_PREVIEW ? `<button onclick="stockCountToggleLog()" style="display:flex;align-items:center;gap:5px;height:40px;padding:0 14px;background:#F6F4EF;color:var(--td);border:none;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">
          ${_scLogExpanded ? 'Thu gọn' : 'Xem tất cả'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="${_scLogExpanded ? 'transform:rotate(180deg);' : ''}"><path d="M6 9l6 6 6-6"/></svg>
        </button>` : '')}
      ${logShow.map((e, i) => `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 0;${i ? 'border-top:1px solid #F0EDE6;' : ''}">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:800;font-size:16.5px;line-height:1.25;color:var(--td);">${escHtmlPos(e.itemName || '')}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;">
              <span style="font-size:15px;font-weight:800;letter-spacing:.8px;color:var(--td);background:#F2F2F4;border-radius:8px;padding:3px 9px;font-variant-numeric:tabular-nums;">${escHtmlPos(e.code)}</span>
              <span style="font-size:13px;color:#9A9AA0;font-weight:600;">${e.status === 'sealed' ? 'chưa mở' : 'đang mở'} · ${e.timeStr}</span>
            </div>
          </div>
          <button onclick="stockCountUndoScan('${e.code}')" style="flex-shrink:0;height:44px;padding:0 16px;background:#F6F4EF;color:#6B6B70;border:none;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;">Bỏ</button>
        </div>`).join('')}
    </div>` : ''}
    ` : ''}

    ${qtyItems.length ? `
    <div class="wal-section" style="margin:0 0 14px;padding:18px 18px 8px;">
      ${scCardTitle('Đếm tay', scPill(qtyItems.length))}
      <div style="font-size:13px;color:#9A9AA0;line-height:1.5;margin-bottom:4px;">Món không có tem. Đếm thật số đang có, chưa đếm thì để trống.</div>
      ${qtyItems.map((l, i) => {
        const idx = stockCountState.items.indexOf(l);
        return `
        <div style="padding:14px 0;${i ? 'border-top:1px solid #F0EDE6;' : ''}">
          <div style="font-weight:800;font-size:18px;line-height:1.25;color:var(--td);margin-bottom:10px;">${escHtmlPos(l.name || '')}</div>
          <div style="display:flex;gap:8px;align-items:stretch;">
            <input type="number" step="0.01" inputmode="decimal" placeholder="Số đếm" value="${l.countedInput === null || l.countedInput === undefined ? '' : l.countedInput}" oninput="stockCountLineChange(${idx}, this.value)" style="flex:1.1;min-width:0;height:56px;box-sizing:border-box;text-align:right;border:2px solid #e6e1d2;border-radius:16px;padding:0 14px;font-size:19px;font-weight:800;color:var(--td);font-family:'Google Sans',sans-serif;">
            <select onchange="stockCountUnitChange(${idx}, this.value)" style="flex:1;min-width:0;height:56px;box-sizing:border-box;border:2px solid #e6e1d2;border-radius:16px;padding:0 12px;font-size:16px;font-weight:800;background:#fff;color:var(--td);font-family:'Google Sans',sans-serif;">
              ${l.unitOptions.map(o => `<option value="${o.baseQty}" ${o.baseQty === l.unitFactor ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div class="wal-section" style="margin:0 0 14px;">
      ${renderPinInput('scStaff')}
    </div>
    ${caBtn('stockCountReviewAndSubmit()', 'check', 'Gửi kiểm kê cho Quản lý duyệt', 'primary')}
  `;
}

// ============================================================
// [MỚI] "KIỂM TRA LẠI" — đối chiếu sau khi quét xong, trước khi gửi kiểm kê.
//
// Mã nào hệ thống ghi là còn tồn (sealed/open) nhưng KHÔNG nằm trong danh sách đã quét
// lượt này thì coi là "chưa tìm thấy" — có thể do nhân viên bỏ sót một góc kệ, hoặc hàng
// thật sự đã mất mà chưa ai biết. Chỉ áp dụng cho dòng nhân viên ĐÃ ĐỤNG TỚI (l.touched) —
// dòng bỏ trống hoàn toàn (chưa đếm) vẫn được phép "chưa đếm" như trước giờ, không ép.
// ============================================================
function stockCountBuildMismatches() {
  const reported = stockCountState.reportedLostSet;
  const out = [];
  stockCountState.items.forEach(l => {
    if (l.countMode !== 'unit' || !l.touched) return;
    (l.allCodes || []).forEach(c => {
      if (!stockCountState.scannedSet.has(c.code) && !reported.has(c.code)) {
        out.push({ itemId: l.itemId, itemName: l.name, code: c.code, status: c.status, containerId: c.id, unit: l.unit, baseQty: l.baseQtyPerUnit });
      }
    });
  });
  return out;
}

function renderStockCountMismatchScreen() {
  const box = document.getElementById('stockCountBody');
  const list = stockCountState.mismatches || [];
  // Đã xử lý hết (quét được hoặc báo mất hết) — gửi luôn, khỏi bắt bấm thêm một lần nữa.
  if (!list.length) {
    stockCountState.inMismatchReview = false;
    _posSubmitBusy = true;
    _doSubmitStockCount(stockCountState.staffEmp).finally(() => { _posSubmitBusy = false; });
    return;
  }
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;padding:18px 18px 8px;">
      ${scCardTitle('Kiểm tra lại', scPill(list.length, '#B45309', '#FEF3E6'))}
      <div style="font-size:13px;color:#9A9AA0;line-height:1.5;margin-bottom:4px;">Hệ thống ghi là còn nhưng chưa quét được. Tìm và quét lại, tìm khắp không thấy thì báo Không tìm thấy.</div>
      ${list.map((m, i) => `
      <div style="padding:16px 0;${i ? 'border-top:1px solid #F0EDE6;' : ''}">
        <div style="font-weight:800;font-size:18px;line-height:1.25;color:var(--td);margin-bottom:12px;">${escHtmlPos(m.itemName || '')}</div>
        <div style="display:flex;gap:8px;">
          <button onclick="stockCountScan()" style="flex:1;min-width:0;height:56px;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--gd);color:#fff;border:none;border-radius:999px;box-shadow:0 4px 12px rgba(226,58,93,.3);font-family:'Google Sans',sans-serif;font-size:16px;font-weight:800;cursor:pointer;">${SU_QR_SVG.replace(/width="26" height="26"/, 'width="22" height="22"')}Quét mã</button>
          <button onclick="stockCountReportLost('${m.code}')" style="flex:1;min-width:0;height:56px;background:#fee2e2;color:#b91c1c;border:2px solid #fca5a5;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:16px;font-weight:800;cursor:pointer;">Không tìm thấy</button>
        </div>
      </div>`).join('')}
    </div>
    ${caBtn('stockCountBackFromMismatch()', 'back', 'Quay lại, chưa gửi', 'plain')}
  `;
}

function stockCountBackFromMismatch() {
  stockCountState.inMismatchReview = false;
  renderStockCountForm();
}

// Bấm "Không tìm thấy" — gửi phiếu báo mất chờ Quản lý duyệt (KHÔNG tự trừ tồn kho ngay,
// đúng nguyên tắc "số đếm/báo của nhân viên không được ghi đè thẳng, phải qua duyệt").
async function stockCountReportLost(code) {
  const m = (stockCountState.mismatches || []).find(x => x.code === code);
  if (!m) return;
  if (!confirm('Báo mất "' + m.itemName + '"?\n\nSẽ gửi cho Quản lý duyệt — nếu duyệt, hệ thống mới trừ khỏi tồn kho. Nếu sau này tìm lại được, quét ở nút "Quét mã hàng tìm lại được".')) return;
  const staffEmp = stockCountState.staffEmp;
  if (!staffEmp) { toast('⚠️ Thiếu thông tin nhân viên, thử lại từ đầu'); return; }
  try {
    const nowISO = vnDate().toISOString();
    const repRef = await fstore.collection(STOCK_LOST_REPORTS_COLL).add({
      containerId: m.containerId, code: m.code, itemId: m.itemId, itemName: m.itemName,
      unit: m.unit || '', baseQty: Number(m.baseQty) || 1,
      status: 'pending_review', source: 'pos',
      reportedBy: staffEmp.fullName, reportedByEmployeeId: staffEmp.id, reportedAt: nowISO,
      businessDate: posDateKey(), reason: 'khong_thay_luc_kiem_ke'
    });
    // lostReportId nối alert này với đúng phiếu báo mất — Quản lý bấm Duyệt/Từ chối
    // thẳng từ Hộp thư mà không phải mở riêng tab Báo mất hàng đi tìm.
    await fstore.collection('alerts_gieogieo').add({
      type: 'lost_item_report', severity: 'warning',
      businessDate: posDateKey(), createdAt: nowISO,
      title: 'Báo mất hàng — ' + m.itemName,
      itemName: m.itemName, code: m.code, itemId: m.itemId, lostReportId: repRef.id,
      staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
      status: 'new'
    });
    toast('✅ Đã báo mất ' + m.itemName + ' — chờ Quản lý duyệt');
    stockCountState.reportedLostSet.add(m.code);
    stockCountState.mismatches = stockCountBuildMismatches();
    renderStockCountMismatchScreen();
  } catch (err) {
    console.error('[báo mất hàng] lỗi', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

async function stockCountReviewAndSubmit() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const staffEmp = await resolveStaffPinAndCheckin('scStaff');
  if (!staffEmp) return;
  stockCountState.staffEmp = staffEmp;
  const mismatches = stockCountBuildMismatches();
  if (!mismatches.length) {
    _posSubmitBusy = true;
    try { await _doSubmitStockCount(staffEmp); } finally { _posSubmitBusy = false; }
    return;
  }
  stockCountState.mismatches = mismatches;
  stockCountState.inMismatchReview = true;
  renderStockCountMismatchScreen();
}

// ---------- QUÉT MÃ HÀNG TÌM LẠI ĐƯỢC (đảo ngược báo mất) ----------
async function stockCountScanFound() {
  if (typeof posScan !== 'function' || !posScanAvailable()) { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) {
    if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error));
    return;
  }
  const ma = String(r.code || '').trim().toUpperCase();
  const c = await UnitEngine.codes.find(ma);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + ma + ' trong hệ thống'); return; }
  if (c.status !== 'lost') { toast('ℹ️ ' + ma + ' hiện không ở trạng thái "báo mất" — dùng nút "Quét mã" thường'); return; }
  openConfirmFoundLostSheet(c);
}

function openConfirmFoundLostSheet(c) {
  const box = document.getElementById('stockCountBody');
  box.innerHTML = `
    <div style="min-height:calc(100dvh - 130px);display:flex;flex-direction:column;justify-content:center;gap:14px;">
      <div class="wal-section" style="margin:0;padding:22px 18px;text-align:center;">
        <div style="font-size:14px;font-weight:800;color:#9A9AA0;">Tìm lại hàng báo mất</div>
        <div style="font-size:24px;font-weight:800;color:var(--td);margin:10px 0 10px;line-height:1.25;">${escHtmlPos(c.itemName || '')}</div>
        <span style="font-size:18px;font-weight:800;letter-spacing:.8px;color:var(--td);background:#F2F2F4;border-radius:10px;padding:5px 12px;">${escHtmlPos(c.code || '')}</span>
        <div style="font-size:14px;color:#15803d;font-weight:800;margin-top:16px;background:#E8F7EE;border-radius:12px;padding:10px 12px;">Sẽ cộng lại ${fmtPrepQty(c.baseQty)} ${escHtmlPos(c.unit || '')} vào tồn kho</div>
      </div>
      <div class="wal-section" style="margin:0;">${renderPinInput('foundLostStaff')}</div>
      <div style="display:flex;gap:10px;">
        ${caBtn('renderStockCountForm()', '', 'Huỷ', 'plain', 'flex:1;')}
        ${caBtn(`submitFoundLostContainer('${c.id}')`, 'check', 'Tìm lại được', 'primary', 'flex:1.6;')}
      </div>
    </div>`;
}

async function submitFoundLostContainer(id) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý...'); return; }
  _posSubmitBusy = true;
  try {
    const staffEmp = await resolveStaffPinAndCheckin('foundLostStaff');
    if (!staffEmp) return;
    // [E4.2] Trả tem về trạng thái trước khi mất + đăng ký lại RT + dòng sổ nằm trong
    // unit_engine.v1.js (lifecycle.markFound). Ở đây còn phần màn hình + phiếu báo mất.
    const f = await UnitEngine.lifecycle.markFound(id, staffEmp);
    if (f.status === 'not_found') { toast('❌ Không tìm thấy mã này'); return; }
    if (f.status === 'not_lost') { toast('ℹ️ Mã này không còn ở trạng thái "báo mất"'); renderStockCountForm(); return; }
    const c = f.c, nowISO = f.nowISO;
    // Cập nhật phiếu báo mất tương ứng (nếu Quản lý đã từng duyệt) — không chặn nếu lỗi,
    // vì tồn kho đã được cộng lại đúng ở bước applyStockTransactionPOS phía trên rồi.
    try {
      const repSnap = await fstore.collection(STOCK_LOST_REPORTS_COLL)
        .where('containerId', '==', id).where('status', '==', 'approved').limit(1).get();
      if (!repSnap.empty) {
        const repDoc = repSnap.docs[0];
        await repDoc.ref.update({ status: 'found_again', foundAt: nowISO, foundBy: staffEmp.fullName, foundByEmployeeId: staffEmp.id });
        // [MỚI] Hàng tìm lại được — huỷ luôn (các) khoản đền bù nhân viên gắn với đúng phiếu
        // báo mất này (nếu Quản lý có lập lúc duyệt, xem maybeChargeEmployeeForLostReport bên
        // quanlygieo.html). Không chặn/ảnh hưởng việc tìm lại hàng nếu bước này lỗi.
        try {
          const deductSnap = await fstore.collection('employee_stock_deductions_gieogieo')
            .where('lostReportId', '==', repDoc.id).where('status', '==', 'active').get();
          await Promise.all(deductSnap.docs.map(d => d.ref.update({
            status: 'reversed', reversedAt: nowISO, reversedBy: staffEmp.fullName,
            reversedReason: 'Hàng tìm lại được — mã ' + (c.code || '')
          })));
        } catch (e2) { console.warn('[tìm lại hàng mất] không huỷ được khoản đền bù (nếu có)', e2); }
      }
    } catch (e) { console.warn('[tìm lại hàng mất] không cập nhật được phiếu báo mất', e); }
    toast('✅ Đã tìm lại ' + (c.itemName || '') + ' — cộng lại vào kho');
    await openStockCountScreen();
  } catch (err) {
    console.error('submitFoundLostContainer lỗi', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  } finally { _posSubmitBusy = false; }
}

// ============================================================
// [MỚI] BÁO MẤT TEM (Reprint Label)
//
// NGUYÊN TẮC CỐT LÕI — đọc kỹ trước khi sửa bất cứ dòng nào trong khối này:
//   Mất/hỏng TEM ≠ mất NGUYÊN LIỆU. Màn này chỉ đổi ĐỊNH DANH (code) của container đã
//   tồn tại — tuyệt đối KHÔNG được gọi createContainersForReceipt (không sinh container
//   mới), KHÔNG được gọi applyStockTransactionPOS (không đụng currentStock/GOGS/WASTE),
//   KHÔNG đổi trường `status` (sealed/open/finished/lost/voided) của container. Ví dụ:
//   tồn 12 hộp, mất 2 tem → tồn VẪN 12 hộp, chỉ 2 container đổi từ mã cũ sang mã mới.
//
// Đây là tính năng ĐỐI LẬP với "Báo mất hàng" (stockCountReportLost/approveLostReport) —
// cái đó trừ tồn kho thật vì HÀNG mất; cái này không trừ gì vì HÀNG vẫn còn, chỉ TEM mất.
// Không được lẫn hai luồng — nếu nhầm, xem lại đúng comment ở đầu mỗi hàm.
//
// QUY TRÌNH: chọn 1 nguyên liệu → hệ thống hiện tồn theo container (sealed+open) → quét
// hết tem tìm được → đối chiếu SỐ TƯƠI (đọc lại đúng lúc bấm "Xong", không dùng số cũ lúc
// mới chọn món, vì có thể có nhận hàng/báo hết xảy ra giữa chừng) → mã nào không quét
// được thì cấp code mới cho ĐÚNG container đó (originalLabelId giữ nguyên từ lần đầu,
// labelEvents ghi đủ REPORTED_MISSING + REPRINTED) → đẩy sang "Tem chưa dán" để in thật.
// ============================================================
let missingLabelState = { itemId: null, itemName: '', expected: 0, scannedSet: new Set(), scannedLog: [], missing: [] };

async function openReportMissingLabelScreen() {
  showScreen('reportMissingLabelScreen');
  missingLabelState = { itemId: null, itemName: '', expected: 0, scannedSet: new Set(), scannedLog: [], missing: [] };
  const box = document.getElementById('reportMissingLabelBody');
  showLoading(box);
  // Nạp lại danh mục nguyên liệu — màn này có thể là màn ĐẦU TIÊN nhân viên mở trong ca,
  // KHO_ITEMS_CACHE lúc đó có thể còn rỗng nếu chưa từng qua Kiểm kê/Nhận hàng.
  try {
    const snap = await fstore.collection('inventory_items_gieogieo').get();
    KHO_ITEMS_CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('openReportMissingLabelScreen lỗi', err);
    box.innerHTML = '<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được danh mục nguyên liệu</div>';
    return;
  }
  renderMissingLabelPicker();
}

function renderMissingLabelPicker() {
  const box = document.getElementById('reportMissingLabelBody');
  if (!box) return;
  // Chỉ những món có tem (unit/batch) mới có gì để đối soát — món đo ml/g không có
  // container/tem nào cả.
  const items = (KHO_ITEMS_CACHE || []).filter(it => it.trackingMode === 'unit' || it.trackingMode === 'batch')
    .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Chọn nguyên liệu</div>
      <div style="font-size:11.5px;color:#999;margin-bottom:10px;line-height:1.6;">
        Dùng khi TEM (mã QR dán trên chai/gói) bị mất hoặc rách — hàng vẫn còn nguyên trong kho, chỉ cấp lại mã tem mới cho đúng cái đang có. <b>Không làm thay đổi số lượng tồn.</b>
      </div>
      ${items.length ? `
      <select id="missingLabelItemSelect" onchange="missingLabelPickItem(this.value)" style="width:100%;border:1px solid #e6e1d2;border-radius:10px;padding:12px;font-size:14px;background:#fff;">
        <option value="">— Chọn nguyên liệu —</option>
        ${items.map(it => `<option value="${it.id}">${escHtmlPos(it.name || '')}</option>`).join('')}
      </select>` : '<div style="text-align:center;padding:30px;color:#bbb">Chưa có nguyên liệu nào dùng tem.</div>'}
    </div>
    <button onclick="openBulkReprintByDateScreen()" style="width:100%;padding:13px;background:none;border:1.5px dashed #e6b800;color:#92400e;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:13px;cursor:pointer;">⚠️ Sự cố dán nhầm hàng loạt — cấp lại mã theo ngày nhận</button>`;
}

// ============================================================
// [MỚI] CẤP LẠI MÃ HÀNG LOẠT THEO NGÀY NHẬN — dùng cho sự cố dán nhầm tem trên diện rộng
// ------------------------------------------------------------
// KHÁC với "Báo mất tem" ở trên (đối chiếu từng nguyên liệu, chỉ tem KHÔNG quét được mới bị
// cấp lại): ở đây quản lý/nhân viên biết chắc một đợt tem nhận trước một ngày nào đó đã bị
// dán lộn xộn, không còn tin được cái nào đúng cái nào sai nữa — nên cấp lại TOÀN BỘ mã của
// mọi tem còn sống (sealed/open) nhận trước ngày đó, không cần quét từng cái để "tìm ra cái
// nào thiếu" (không còn ý nghĩa khi cả loạt đã lộn).
//
// Giữ NGUYÊN nguyên tắc của missingLabelDoReprint(): CHỈ đổi code/originalLabelId/
// labelStatus/labelEvents/labelPrinted — không đụng status/baseQty/fifoConsumed/currentStock.
// Nhân viên dán ĐÈ mã mới lên đúng vật lý đang cầm — hàng không mất, chỉ đổi định danh.
// ============================================================
let bulkReprintState = { itemId: '', itemName: '', cutoff: '', preview: [] };

function openBulkReprintByDateScreen() {
  bulkReprintState = { itemId: '', itemName: '', cutoff: '', preview: [] };
  renderBulkReprintByDatePicker();
}

function renderBulkReprintByDatePicker() {
  const box = document.getElementById('reportMissingLabelBody');
  if (!box) return;
  const items = (KHO_ITEMS_CACHE || []).filter(it => it.trackingMode === 'unit' || it.trackingMode === 'batch')
    .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;background:#fffbe8;border:1.5px solid #fde68a;border-radius:14px;padding:14px;">
      <div style="font-weight:700;color:#92400e;margin-bottom:6px;">⚠️ Cấp lại mã hàng loạt theo ngày nhận</div>
      <div style="font-size:12.5px;color:#78350f;line-height:1.6;">Dùng khi một đợt tem đã bị dán nhầm lung tung, không còn phân biệt được cái nào đúng cái nào sai. Mọi tem CÒN SỐNG (chưa mở hoặc đang mở) nhận TRƯỚC ngày bạn chọn sẽ được cấp mã mới — dán đè lên đúng vật lý đang cầm. <b>Không đổi số lượng tồn, không đụng tem đã báo hết.</b></div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Phạm vi</div>
      <select id="bulkReprintItemSelect" style="width:100%;border:1px solid #e6e1d2;border-radius:10px;padding:12px;font-size:14px;background:#fff;margin-bottom:10px;">
        <option value="">— Tất cả nguyên liệu —</option>
        ${items.map(it => `<option value="${it.id}">${escHtmlPos(it.name || '')}</option>`).join('')}
      </select>
      <div class="wal-section-title">Nhận trước ngày</div>
      <input type="date" id="bulkReprintCutoff" style="width:100%;border:1px solid #e6e1d2;border-radius:10px;padding:11px;font-size:14px;">
    </div>
    <button onclick="bulkReprintByDatePreview()" style="width:100%;padding:15px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Xem trước danh sách</button>
    <button onclick="openReportMissingLabelScreen()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">Huỷ</button>`;
}

async function bulkReprintByDatePreview() {
  const itemSel = document.getElementById('bulkReprintItemSelect');
  const cutoffEl = document.getElementById('bulkReprintCutoff');
  const itemId = itemSel ? itemSel.value : '';
  const cutoff = cutoffEl ? cutoffEl.value : '';
  if (!cutoff) { toast('⚠️ Chọn ngày nhận làm mốc'); return; }
  const box = document.getElementById('reportMissingLabelBody');
  showLoading(box);
  // Mốc so sánh là ĐẦU NGÀY đã chọn (00:00) — "nhận trước ngày X" nghĩa là receivedAt <
  // 00:00 ngày X, không bao gồm chính ngày X.
  const cutoffMs = vnDate(cutoff + 'T00:00:00').getTime();
  let preview = [], safe = [];
  try {
    let q = fstore.collection(STOCK_CONTAINERS_COLL).where('status', 'in', ['sealed', 'open']);
    if (itemId) q = q.where('itemId', '==', itemId);
    const snap = await q.get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rawTime = c => { const t = c.receivedAt ? vnDate(c.receivedAt).getTime() : NaN; return isFinite(t) ? t : null; };
    // [FIX] CHỈ cấp lại mã cho tem CÒN SEAL (chưa mở) nhận trước ngày mốc — bỏ hẳn tem đang
    // `open` ra khỏi diện cấp lại. Lý do: một tem đang mở nghĩa là nó ĐÃ được quét thành công
    // để "Xác nhận đã mở" — quét được tức là lúc đó mã trên tem khớp đúng với đúng vật lý đang
    // cầm, đã tự chứng minh rồi, không cần (và không nên) đụng vào nữa. Cấp mã mới cho tem
    // đang mở cũng không giải quyết được gì: đó KHÔNG PHẢI "tem chưa xác định vật lý" như tem
    // sealed cùng lô (giống hệt nhau, gán mã nào cũng như nhau) — nó có lịch sử dùng dở riêng,
    // và tạo thêm một mã mới rồi vẫn phải trả lời đúng câu hỏi cũ: "dán đè lên đúng chai nào?"
    // — không giải quyết gì, chỉ nhân thêm một lớp tem mơ hồ nữa.
    preview = all
      .filter(c => { const t = rawTime(c); return c.status === 'sealed' && t !== null && t < cutoffMs; })
      .sort((a, b) => String(a.receivedAt || '').localeCompare(String(b.receivedAt || '')));
    // "AN TOÀN — không đụng" = mọi tem còn sống KHÔNG nằm trong diện cấp lại ở trên: tem đang
    // mở (bất kể ngày nhận nào — lý do ở trên), tem sealed nhận từ ngày mốc trở đi, và tem
    // sealed thiếu/hỏng ngày nhận (không chắc thuộc lô nào thì thà không đụng, an toàn hơn).
    const previewIds = new Set(preview.map(c => c.id));
    safe = all
      .filter(c => !previewIds.has(c.id))
      .sort((a, b) => String(a.receivedAt || '').localeCompare(String(b.receivedAt || '')));
  } catch (err) {
    console.error('bulkReprintByDatePreview lỗi', err);
    toast('❌ Không đọc được danh sách tem: ' + (err.message || err));
    renderBulkReprintByDatePicker();
    return;
  }
  bulkReprintState = {
    itemId, itemName: itemId ? (escHtmlPos((KHO_ITEMS_CACHE.find(x => x.id === itemId) || {}).name || '')) : 'Tất cả nguyên liệu',
    cutoff, preview, safe
  };
  renderBulkReprintByDatePreview();
}

function renderBulkReprintByDatePreview() {
  const box = document.getElementById('reportMissingLabelBody');
  if (!box) return;
  const s = bulkReprintState;
  if (!s.preview.length) {
    box.innerHTML = `
      <div class="wal-section" style="margin:0 0 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px;">
        <div style="font-weight:700;color:#15803d;">Không có tem nào khớp</div>
        <div style="font-size:13px;color:#166534;margin-top:4px;">Không có tem còn sống nào của "${s.itemName}" nhận trước ${s.cutoff}.</div>
      </div>
      <button onclick="openBulkReprintByDateScreen()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14.5px;cursor:pointer;">Chọn lại</button>`;
    return;
  }
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:14px;padding:14px;">
      <div style="font-weight:700;color:#b91c1c;">Sẽ cấp lại ${s.preview.length} mã — CHỈ tem chưa mở</div>
      <div style="font-size:12.5px;color:#7f1d1d;margin-top:4px;line-height:1.6;">"${s.itemName}" · nhận trước ${s.cutoff} · còn nguyên seal. Sau khi xác nhận, TOÀN BỘ ${s.preview.length} mã dưới đây sẽ đổi sang mã mới và rơi vào "Tem chưa dán" để in lại — không đổi tồn kho. Tem ĐANG MỞ không nằm trong danh sách này (xem lý do ở mục an toàn bên dưới).</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;max-height:280px;overflow-y:auto;">
      ${s.preview.map(c => `<div style="padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12.5px;color:var(--td);">
        <b>${escHtmlPos(c.code || '—')}</b> · ${escHtmlPos(c.itemName || '')} · nhận ${c.receivedAt ? vnDate(c.receivedAt).toLocaleDateString('vi-VN') : '—'}
      </div>`).join('')}
    </div>
    ${s.safe && s.safe.length ? `
    <div class="wal-section" style="margin:0 0 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px;">
      <div style="font-weight:700;color:#15803d;margin-bottom:6px;">🟢 AN TOÀN — TUYỆT ĐỐI KHÔNG DÁN ĐÈ (${s.safe.length} mã)</div>
      <div style="font-size:12px;color:#166534;line-height:1.6;">Gồm: tem ĐANG MỞ (đã quét thành công lúc mở, mã đang dán đúng khớp rồi, không cần đụng), và tem nhận từ ${s.cutoff} trở đi. In danh sách này ra cho nhân viên cầm theo lúc dán, để không lặp lại sự cố dán nhầm.</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;max-height:220px;overflow-y:auto;">
      ${s.safe.map(c => `<div style="padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12.5px;color:#166534;">
        <b>${escHtmlPos(c.code || '—')}</b> · ${escHtmlPos(c.itemName || '')} · ${c.status === 'sealed' ? 'chưa mở' : 'đang mở'} · nhận ${c.receivedAt ? vnDate(c.receivedAt).toLocaleDateString('vi-VN') : '—'}
      </div>`).join('')}
    </div>` : ''}
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Lý do (bắt buộc)</div>
      <input type="text" id="bulkReprintReason" placeholder="VD: dán nhầm mã hàng loạt ngày ..." style="width:100%;border:1px solid #e6e1d2;border-radius:10px;padding:11px;font-size:13.5px;">
    </div>
    <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('bulkReprintStaff')}</div>
    <button onclick="bulkReprintByDateConfirm()" style="width:100%;padding:15px;background:#c0392b;color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Cấp lại ${s.preview.length} mã ngay</button>
    <button onclick="openBulkReprintByDateScreen()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">Huỷ</button>`;
}

async function bulkReprintByDateConfirm() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý...'); return; }
  _posSubmitBusy = true;
  try {
    const reasonEl = document.getElementById('bulkReprintReason');
    const reason = (reasonEl && reasonEl.value.trim()) || '';
    if (!reason) { toast('⚠️ Cần ghi rõ lý do'); return; }
    const staffEmp = await resolveStaffPinAndCheckin('bulkReprintStaff');
    if (!staffEmp) return;
    const s = bulkReprintState;
    const targets = s.preview;
    const nowISO = vnDate().toISOString();
    const box = document.getElementById('reportMissingLabelBody');
    showLoading(box);
    const reprinted = [];
    // Tuần tự từng cái, không Promise.all — đây là thao tác hiếm, số lượng nhỏ (vài chục),
    // ưu tiên tránh dồn tải Firestore hơn tốc độ.
    for (const m of targets) {
      try {
        // [E4.2] Ghi mã mới (tem + bản sao RT) nằm trong unit_engine.v1.js — codes.reprint.
        const r = await UnitEngine.codes.reprint(m.id, { staffId: staffEmp.id, reason: 'Cấp lại hàng loạt: ' + reason, nowISO });
        if (r) reprinted.push({ containerId: r.containerId, oldCode: r.oldCode, newCode: r.newCode, itemName: r.itemName });
      } catch (err) { console.error('[cấp lại hàng loạt] reprint 1 mã lỗi:', err); }
    }
    await fstore.collection(MISSING_LABEL_REPORTS_COLL).add({
      itemId: s.itemId || null, itemName: s.itemName,
      stockBeforeReconcile: targets.length,
      scannedCodes: [], labelsMissingCount: reprinted.length,
      reprinted, anomaly: false, bulkByDate: true, cutoff: s.cutoff, sealedOnly: true,
      // Chụp lại đúng danh sách "an toàn" đã cho nhân viên xem lúc xác nhận — để sau này tra
      // lại còn biết tại thời điểm đó đâu là mã KHÔNG được đụng vào, không phải suy đoán lại.
      safeCodesAtConfirm: (s.safe || []).map(c => c.code || ''),
      staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
      reason: 'Cấp lại hàng loạt: ' + reason, businessDate: posDateKey(), createdAt: nowISO
    });
    toast('✅ Đã cấp lại ' + reprinted.length + '/' + targets.length + ' mã — vào "Tem kho" để in');
    openStockLabelScreen();
  } catch (err) {
    console.error('bulkReprintByDateConfirm lỗi', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  } finally { _posSubmitBusy = false; }
}

async function missingLabelPickItem(itemId) {
  if (!itemId) return;
  const it = KHO_ITEMS_CACHE.find(x => x.id === itemId);
  if (!it) return;
  const box = document.getElementById('reportMissingLabelBody');
  showLoading(box);
  let cnt = 0;
  try {
    const snap = await fstore.collection(STOCK_CONTAINERS_COLL).where('itemId', '==', itemId).where('status', 'in', ['sealed', 'open']).get();
    cnt = snap.size;
  } catch (err) { console.error('missingLabelPickItem lỗi', err); toast('❌ Không tải được tồn kho'); renderMissingLabelPicker(); return; }
  missingLabelState = { itemId, itemName: it.name || '', expected: cnt, scannedSet: new Set(), scannedLog: [], missing: [] };
  renderMissingLabelScan();
}

function renderMissingLabelScan() {
  const box = document.getElementById('reportMissingLabelBody');
  if (!box) return;
  const s = missingLabelState;
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">${escHtmlPos(s.itemName)}</div>
      <div style="font-size:13px;color:#666;margin-bottom:10px;">Tồn hệ thống hiện tại: <b>${s.expected}</b> tem (chưa mở + đang mở). Quét toàn bộ tem còn quét được của món này.</div>
      <button onclick="missingLabelScan()" style="width:100%;padding:15px 8px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14.5px;cursor:pointer;">🔍 Quét tem</button>
      ${(typeof posScanAvailable === 'function' && posScanAvailable()) ? '' : '<div style="font-size:11.5px;color:#c0392b;margin-top:8px;">Máy này chưa quét được — cần mở bằng app của quán bản mới.</div>'}
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Đã quét (${s.scannedLog.length})</div>
      ${s.scannedLog.length ? `<div style="max-height:220px;overflow-y:auto;">
        ${s.scannedLog.map(e => `<div style="padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12.5px;color:var(--td);letter-spacing:.3px;">${e.code} · ${e.status === 'sealed' ? 'chưa mở' : 'đang mở'}</div>`).join('')}
      </div>` : '<div style="font-size:12.5px;color:#bbb;">Chưa quét mã nào.</div>'}
    </div>
    <button onclick="missingLabelFinish()" style="width:100%;padding:14px;background:#fff;color:var(--gd);border:1.5px solid var(--gd);border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14.5px;cursor:pointer;">Xong, đối chiếu</button>
    <button onclick="openReportMissingLabelScreen()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">Chọn món khác</button>`;
}

async function missingLabelScan() {
  if (typeof posScan !== 'function' || !posScanAvailable()) { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) {
    if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error));
    return;
  }
  const ma = String(r.code || '').trim().toUpperCase();
  if (!ma) return;
  const s = missingLabelState;
  if (s.scannedSet.has(ma)) { toast('⚠️ Mã ' + ma + ' đã quét rồi'); return; }
  const c = await UnitEngine.codes.find(ma);
  if (chanMaTrung(c)) return;
  // Đúng nguyên liệu đang đối soát — quét nhầm món khác thì báo rõ, KHÔNG tính vào số
  // lượng tìm thấy (đúng yêu cầu ở mục 5).
  if (!c || !c.itemId || c.itemId !== s.itemId) {
    toast('⚠️ Tem này không thuộc nguyên liệu đang đối soát.');
    return;
  }
  if (c.status !== 'sealed' && c.status !== 'open') {
    toast('ℹ️ ' + ma + ' không còn là tồn hiện có (đã báo hết/huỷ/báo mất trước đó) — không tính');
    return;
  }
  s.scannedSet.add(ma);
  s.scannedLog.unshift({ code: ma, status: c.status });
  toast('✅ ' + ma);
  renderMissingLabelScan();
}

async function missingLabelFinish() {
  const s = missingLabelState;
  const box = document.getElementById('reportMissingLabelBody');
  showLoading(box);
  let fresh = [];
  try {
    // Đọc lại NGAY LÚC ĐỐI CHIẾU, không dùng số lúc mới chọn món — nhận hàng/báo hết có
    // thể đã xảy ra trong lúc đang quét, đối chiếu bằng số cũ sẽ sai.
    const snap = await fstore.collection(STOCK_CONTAINERS_COLL).where('itemId', '==', s.itemId).where('status', 'in', ['sealed', 'open']).get();
    fresh = snap.docs.map(d => ({ id: d.id, code: d.data().code || '', status: d.data().status }));
  } catch (err) {
    console.error('missingLabelFinish lỗi', err);
    toast('❌ Không đối chiếu được, thử lại');
    renderMissingLabelScan();
    return;
  }
  s.expected = fresh.length;
  s.missing = fresh.filter(c => !s.scannedSet.has(c.code));
  // Quét được NHIỀU hơn số hệ thống đang ghi — không thể xảy ra trong vận hành bình
  // thường (mỗi tem quét được đều đã được xác nhận đúng món + đang sealed/open ở bước
  // quét). Nếu vẫn xảy ra (đọc lệch do vừa có thay đổi giữa chừng, hoặc dữ liệu trùng mã)
  // thì đây là dấu hiệu bất thường thật — KHÔNG được tự xử lý, phải dừng lại báo Quản lý.
  const anomaly = s.scannedLog.length > fresh.length;
  renderMissingLabelResult(anomaly);
}

function renderMissingLabelResult(anomaly) {
  const box = document.getElementById('reportMissingLabelBody');
  if (!box) return;
  const s = missingLabelState;
  const found = s.scannedLog.length;
  if (anomaly) {
    box.innerHTML = `
      <div class="wal-section" style="margin:0 0 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:14px;padding:14px;">
        <div style="font-weight:700;color:#b91c1c;margin-bottom:6px;">⚠️ Bất thường — không tự xử lý</div>
        <div style="font-size:13px;color:#7f1d1d;line-height:1.6;">Quét được ${found} tem, nhưng hệ thống chỉ đang ghi ${s.expected} tem sống cho "${escHtmlPos(s.itemName)}". Số quét được KHÔNG được vượt tồn hệ thống — không tự tăng tồn kho. Ghi nhận lại để Quản lý kiểm tra dữ liệu.</div>
      </div>
      <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('missingLabelStaff')}</div>
      <button onclick="missingLabelSubmitAnomalyLog()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14.5px;cursor:pointer;">Ghi nhận & báo Quản lý</button>
      <button onclick="openReportMissingLabelScreen()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">Thoát, không ghi gì</button>`;
    return;
  }
  const missing = s.missing || [];
  if (!missing.length) {
    box.innerHTML = `
      <div class="wal-section" style="margin:0 0 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px;">
        <div style="font-weight:700;color:#15803d;">✅ Khớp — không cần in lại</div>
        <div style="font-size:13px;color:#166534;margin-top:4px;">Quét được đủ ${found}/${s.expected} tem của "${escHtmlPos(s.itemName)}".</div>
      </div>
      <button onclick="openReportMissingLabelScreen()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14.5px;cursor:pointer;">Xong</button>`;
    return;
  }
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;background:#fffbe8;border:1.5px solid #fde68a;border-radius:14px;padding:14px;">
      <div style="font-weight:700;color:#92400e;">Thiếu ${missing.length} tem</div>
      <div style="font-size:13px;color:#78350f;margin-top:4px;">Quét được ${found}/${s.expected} tem của "${escHtmlPos(s.itemName)}" — ${missing.length} tem không tìm thấy (mất/hỏng). Hàng vẫn còn nguyên trong kho — chỉ cần in lại tem mới cho đúng ${missing.length} đơn vị này, <b>tồn kho không đổi</b>.</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Lý do mất/hỏng (tuỳ chọn)</div>
      <input type="text" id="missingLabelReason" placeholder="VD: tem bong, rách, không đọc được..." style="width:100%;border:1px solid #e6e1d2;border-radius:10px;padding:11px;font-size:13.5px;">
    </div>
    <div class="wal-section" style="margin:0 0 14px;">${renderPinInput('missingLabelStaff')}</div>
    <button onclick="missingLabelDoReprint()" style="width:100%;padding:15px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:15px;cursor:pointer;">In lại ${missing.length} tem</button>
    <button onclick="openReportMissingLabelScreen()" style="width:100%;margin-top:8px;padding:13px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">Huỷ</button>`;
}

async function missingLabelDoReprint() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý...'); return; }
  _posSubmitBusy = true;
  try {
    const staffEmp = await resolveStaffPinAndCheckin('missingLabelStaff');
    if (!staffEmp) return;
    const s = missingLabelState;
    const reasonEl = document.getElementById('missingLabelReason');
    const reason = (reasonEl && reasonEl.value.trim()) || 'Không nêu lý do';
    const nowISO = vnDate().toISOString();
    const reprinted = [];
    for (const m of (s.missing || [])) {
      try {
        // [E4.2] Ghi mã mới (tem + bản sao RT) nằm trong unit_engine.v1.js — codes.reprint.
        const r = await UnitEngine.codes.reprint(m.id, { staffId: staffEmp.id, reason, nowISO });
        if (r) reprinted.push({ containerId: r.containerId, oldCode: r.oldCode, newCode: r.newCode });
      } catch (err) { console.error('[báo mất tem] reprint 1 mã lỗi:', err); }
    }
    // [AUDIT] Đúng yêu cầu: ghi rõ "N label missing", KHÔNG được ghi nhầm thành
    // "N inventory missing" — đây là chuyện định danh, không phải chuyện tồn kho.
    await fstore.collection(MISSING_LABEL_REPORTS_COLL).add({
      itemId: s.itemId, itemName: s.itemName,
      stockBeforeReconcile: s.expected,
      scannedCodes: s.scannedLog.map(e => e.code),
      labelsMissingCount: (s.missing || []).length,
      reprinted, anomaly: false,
      staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
      reason, businessDate: posDateKey(), createdAt: nowISO
    });
    toast('✅ Đã in lại ' + reprinted.length + ' tem — tồn kho không đổi (' + s.expected + ')');
    openStockLabelScreen(); // đưa thẳng sang Tem kho — các mã vừa cấp đã nằm sẵn ở "Tem chưa dán" (hàm này tự showScreen)
  } catch (err) {
    console.error('missingLabelDoReprint lỗi', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  } finally { _posSubmitBusy = false; }
}

async function missingLabelSubmitAnomalyLog() {
  const s = missingLabelState;
  try {
    const staffEmp = await resolveStaffPinAndCheckin('missingLabelStaff');
    if (!staffEmp) return;
    const nowISO = vnDate().toISOString();
    await fstore.collection(MISSING_LABEL_REPORTS_COLL).add({
      itemId: s.itemId, itemName: s.itemName,
      stockBeforeReconcile: s.expected,
      scannedCodes: s.scannedLog.map(e => e.code),
      labelsMissingCount: 0, reprinted: [], anomaly: true,
      staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
      reason: 'Quét được nhiều hơn tồn hệ thống', businessDate: posDateKey(), createdAt: nowISO
    });
    await fstore.collection('alerts_gieogieo').add({
      type: 'label_reconcile_anomaly', severity: 'danger',
      businessDate: posDateKey(), createdAt: nowISO,
      title: 'Đối soát tem bất thường — ' + (s.itemName || ''),
      itemName: s.itemName, expected: s.expected, scannedCount: s.scannedLog.length,
      staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
      status: 'new'
    });
    toast('✅ Đã ghi nhận — Quản lý sẽ kiểm tra dữ liệu');
    openReportMissingLabelScreen();
  } catch (err) {
    console.error('missingLabelSubmitAnomalyLog lỗi', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

async function submitStockCount() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _doSubmitStockCount(); } finally { _posSubmitBusy = false; }
}

async function _doSubmitStockCount(preResolvedStaff) {
  const staffEmp = preResolvedStaff || await resolveStaffPinAndCheckin('scStaff');
  if (!staffEmp) return;
  const staff = staffEmp.fullName;
  // Chỉ lấy đúng những dòng nhân viên đã THỰC SỰ gõ số — dòng để trống (countedBase===null)
  // là "chưa đếm", không gửi lên, không tính khớp hay lệch.
  //
  // [NEW] Lưu thêm countedInput + countedUnitLabel (số & đơn vị GỐC nhân viên đã gõ,
  // trước khi quy đổi) song song countedBase — phục vụ audit khi Management thấy lệch
  // bất thường: có thể soi lại nhân viên đếm "5 Hộp" hay "500 ml" để phát hiện lỗi chọn
  // nhầm đơn vị (nguồn sai số phổ biến nhất khi cho chọn nhiều đơn vị đếm khác nhau).
  const items = stockCountState.items
    .filter(l => l.countedBase !== null)
    .map(l => {
      // Dòng đếm theo CHAI: gửi thêm số chai nguyên / chai đang mở để Quản lý đối chiếu
      // theo ĐƠN VỊ, không phải theo ml. Vẫn giữ nguyên bộ ba expectedBase/countedBase/
      // varianceBase như cũ để luồng duyệt và điều chỉnh tồn bên Management không phải sửa.
      if (l.countMode === 'unit') {
        const dangMo = l.countedOpen === null ? 0 : l.countedOpen;
        // [FIX ĐẾM ĐÔI] Mã đã báo mất TRONG LƯỢT NÀY (bấm "Không tìm thấy") sẽ được Quản lý
        // trừ tồn kho RIÊNG khi duyệt phiếu báo mất (approveLostReport bên quanlygieo.html) —
        // không được để lệch kiểm kê tính luôn phần đó vào varianceBase, nếu không cùng một
        // đơn vị mất sẽ bị trừ HAI LẦN (một lần lúc duyệt báo mất, một lần lúc duyệt kiểm kê).
        // Cách sửa: hạ "số hệ thống mong đợi" xuống đúng bằng số đã báo mất trước khi tính
        // lệch — coi như phần đó tạm "không tính" ở phép so sánh này, để riêng cho luồng
        // báo mất xử lý.
        const maBaoMat = (l.allCodes || []).filter(c => stockCountState.reportedLostSet.has(c.code));
        const lostSealed = maBaoMat.filter(c => c.status === 'sealed').length;
        const lostOpen = maBaoMat.filter(c => c.status === 'open').length;
        const expectedSealedAdj = Math.max(0, l.expectedSealedUnits - lostSealed);
        const expectedOpenAdj = Math.max(0, l.expectedOpenUnits - lostOpen);
        const expectedBaseAdj = expectedSealedAdj * l.baseQtyPerUnit;
        return {
          itemId: l.itemId, name: l.name, unit: l.unit,
          countMode: 'unit',
          countUnitName: l.countUnitName, baseQtyPerUnit: l.baseQtyPerUnit,
          countedSealedUnits: l.countedSealed, countedOpenUnits: dangMo,
          expectedSealedUnits: expectedSealedAdj, expectedOpenUnits: expectedOpenAdj,
          varianceSealedUnits: l.countedSealed - expectedSealedAdj,
          varianceOpenUnits: dangMo - expectedOpenAdj,
          expectedBase: expectedBaseAdj, countedBase: l.countedBase,
          varianceBase: l.countedBase - expectedBaseAdj,
          countedInput: l.countedSealed, countedUnitLabel: l.countUnitName,
          // [MỚI] Dòng có tem giờ luôn đếm bằng quét mã (trừ khi markedEmpty = khai tay
          // "không còn tem" cho dòng đang 0/0) — Quản lý cần biết để phân biệt với đếm tay cũ.
          countedByScan: !l.markedEmpty, markedEmpty: !!l.markedEmpty,
          reportedLostCount: maBaoMat.length
        };
      }
      const unitOpt = l.unitOptions.find(o => o.baseQty === l.unitFactor);
      return {
        itemId: l.itemId, name: l.name, unit: l.unit,
        countMode: 'qty',
        expectedBase: l.expectedBase, countedBase: l.countedBase, varianceBase: l.countedBase - l.expectedBase,
        countedInput: l.countedInput, countedUnitLabel: unitOpt ? unitOpt.label : l.unit
      };
    });
  if (!items.length) { toast('⚠️ Chưa đếm dòng nào'); return; }
  try {
    // scannedCodes: đúng danh sách mã tem đã quét trong lượt này (không gồm mã bị "Bỏ" giữa
    // chừng) — bằng chứng thô cho Quản lý, phòng khi cần soi lại một dòng bị nghi ngờ.
    const scannedCodes = stockCountState.scannedLog.map(e => ({ code: e.code, itemId: e.itemId, status: e.status, timeStr: e.timeStr }));
    const scRef = await fstore.collection('stock_counts_gieogieo').add({
      items, countedBy: staff, status: 'pending_review',
      createdAt: vnDate().toISOString(), businessDate: posDateKey(), source: 'pos',
      scannedCodes,
      // Mã nhân viên báo "Không tìm thấy" TRONG lượt này — duyệt/từ chối phiếu kiểm kê bên
      // Quản lý chỉ xử lý đúng các phiếu báo mất này, không vơ phiếu của lượt khác.
      lostReportCodes: [...stockCountState.reportedLostSet]
    });
    // 🆕 GĐ4 kế hoạch V3 — PHẦN 3.2b: ghi audit trỏ đúng phiếu kiểm kê vừa gửi.
    logAutoChecklistResolved('stockcount_due', scRef.id, staffEmp);
    toast('✅ Đã gửi kiểm kê — chờ Quản lý duyệt điều chỉnh');
    showScreen('khoScreen');
    loadKhoScreen();
  } catch (err) {
    console.error('submitStockCount failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

PosGieoMods.count = true;
