// Tách từ posgieo.html dòng 5111–5185, 5205–5432, 5459–5762, 6043–6277 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_print_ui.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).printUi = 'dang';

function temToggleEnabled(el) {
  POSTemPrinter.setEnabled(el.checked);
  _updateTemStatusUI();
  // [FIX-tem-keepalive] Vừa bật in tem thì nối luôn + bật watchdog, để lúc bán hàng đã sẵn sàng
  if (el.checked) { startTemConnectionWatchdog(); temEnsureConnected().catch(() => {}); }
  toast(el.checked ? '✅ Đã bật in tem — đã lưu' : '🔕 Đã tắt in tem — đã lưu');
}

async function temTestPrintClick() {
  if (!POSTemPrinter.enabled) { toast('⚠ Hãy bật in tem trước khi in thử'); return; }
  // [FIX-tem-keepalive] Nối lại trước khi in thử — nếu không, in thử sau một lúc nhàn rỗi sẽ
  // gửi vào socket đã chết và "báo gửi thành công" trong khi máy in im lặng, gây hiểu nhầm.
  if (!(await temEnsureConnected())) { toast('⚠ Không nối được máy in tem — kiểm tra máy in đã bật & cùng WiFi'); return; }
  try {
    // [FIX-bridge-v2] Phân biệt "đã gửi được" với "app từ chối vì mất kết nối".
    if (POSTemPrinter.printTestLabel() === false) {
      const st = _temStatus();
      toast('❌ Không gửi được' + ((st && st.lastError) ? ' — ' + st.lastError : ' — máy in chưa kết nối'));
    } else {
      toast('✅ Đã gửi lệnh in tem');
    }
  }
  catch (e) { toast('❌ Lỗi gửi lệnh in tem: ' + (e && e.message ? e.message : e)); }
}

function temEngineChange(el) {
  POSTemPrinter.setEngine(el.value);
  // [FIX-bridge-v2] Gói keepalive khác nhau giữa TSPL và ESC/POS — đổi engine phải đặt lại,
  // không thì ESC/POS sẽ nhả giấy mỗi 20 giây vì "\r\n" là lệnh xuống dòng thật.
  _temKeepAliveSig = null; _temSyncKeepAlive();
  toast('✅ Đã lưu ngôn ngữ lệnh: ' + (el.value === 'escpos' ? 'ESC/POS' : 'TSPL'));
}

function temDpiChange(el) {
  POSTemPrinter.setDpi(Number(el.value));
  toast('✅ Đã lưu DPI: ' + el.value);
}

function temGapChange(el) {
  POSTemPrinter.setGapMm(el.value);
  toast('✅ Đã lưu khoảng gap: ' + POSTemPrinter.getGapMm() + 'mm');
}

function temOffsetChange(el) {
  POSTemPrinter.setOffsetMm(el.value);
  toast('✅ Đã lưu offset dọc: ' + POSTemPrinter.getOffsetMm() + 'mm');
}

function temInvertChange(el) {
  POSTemPrinter.setInvert(el.checked);
  const track = document.getElementById('tem-invert-track');
  if (track) track.classList.toggle('on', el.checked);
  toast(el.checked ? '✅ Đã bật đảo màu tem' : '✅ Đã tắt đảo màu tem');
}

function _updateTemStatusUI() {
  const st = POSTemPrinter.getStatus();
  const toggle = document.getElementById('tem-enable-toggle');
  if (toggle) toggle.checked = st.enabled;
  const track = document.getElementById('tem-enable-track');
  if (track) track.classList.toggle('on', st.enabled);
  const statusText = document.getElementById('tem-status-text');
  if (statusText) {
    statusText.textContent = st.enabled ? 'Đang BẬT ✅' : 'Đang TẮT';
    statusText.style.color = st.enabled ? '#15803d' : '#999';   // xanh lá = đang chạy
  }
  const engineSel = document.getElementById('tem-engine-select');
  if (engineSel) engineSel.value = st.engine;
  const dpiSel = document.getElementById('tem-dpi-select');
  if (dpiSel) dpiSel.value = String(st.dpi);
  const gapInput = document.getElementById('tem-gap-input');
  if (gapInput) gapInput.value = st.gapMm;
  const offsetInput = document.getElementById('tem-offset-input');
  if (offsetInput) offsetInput.value = st.offsetMm;
  const invertToggle = document.getElementById('tem-invert-toggle');
  if (invertToggle) invertToggle.checked = st.invert;
  const invertTrack = document.getElementById('tem-invert-track');
  if (invertTrack) invertTrack.classList.toggle('on', st.invert);
}

function _updatePrinterStatusUI() {
  const st = POSPrinter.getStatus();
  const dotColor = st.connected ? '#22c55e' : '#ccc';
  document.querySelectorAll('.printer-status-dot').forEach(d => d.style.background = dotColor);
  _updatePrinterQuickStatusUI(); // đồng bộ luôn 2 chấm trạng thái nhanh cạnh logo
  const label = document.getElementById('printer-status-label');
  if (label) label.textContent = st.connected
    ? (st.baudRate ? `Đã kết nối · ${st.baudRate} baud` : 'Đã kết nối (Bluetooth)')
    : 'Chưa kết nối';
  const hasApp = !!window.AndroidPrinter;
  const btnC = document.getElementById('printer-btn-connect');
  const btnD = document.getElementById('printer-btn-disconnect');
  // Trong app bọc riêng, Web Serial không hoạt động — luôn ẩn nút kết nối kiểu cũ
  if (btnC) btnC.style.display = (st.connected || hasApp) ? 'none' : '';
  if (btnD) btnD.style.display = st.connected ? '' : 'none';
  const btSection = document.getElementById('printer-bt-app-section');
  if (btSection) btSection.style.display = (hasApp && !st.connected) ? '' : 'none';
  const autoToggle = document.getElementById('printer-auto-toggle');
  if (autoToggle) autoToggle.checked = st.autoPrintEnabled;
  const autoTrack = document.getElementById('printer-auto-track');
  if (autoTrack) autoTrack.classList.toggle('on', st.autoPrintEnabled);
  const autoStatusText = document.getElementById('printer-auto-status-text');
  if (autoStatusText) {
    autoStatusText.textContent = st.autoPrintEnabled ? 'Đang BẬT ✅' : 'Đang TẮT';
    autoStatusText.style.color = st.autoPrintEnabled ? '#15803d' : '#999';
  }
}

// [ADD-printer-quickstatus] Cập nhật 2 chấm trạng thái (Bill/Tem) trên nút nhanh cạnh logo.
// Bill: dựa vào POSPrinter.connected (đã có sẵn, cùng nguồn với dấu chấm ở sidebar Máy in).
// Tem: chỉ có ý nghĩa "kết nối" khi chạy trong app bọc riêng (LAN qua AndroidPrinter) — nếu
// đang tắt tem thì để chấm xám (không phải lỗi, chỉ là không áp dụng).
// [REMOVE-rawbt] Chạy ngoài app bọc TRƯỚC ĐÂY cũng để xám vì còn đường RawBT dự phòng.
// Đường đó đã bị xoá nên giờ là ĐỎ — không in tem được thật, nhân viên cần thấy ngay.
function _updatePrinterQuickStatusUI() {
  const billDot = document.getElementById('pqs-dot-bill');
  const temDot = document.getElementById('pqs-dot-tem');
  if (!billDot || !temDot) return;
  billDot.className = 'pqs-dot ' + (POSPrinter.connected ? 'ok' : 'bad');
  if (!POSTemPrinter.enabled) {
    temDot.className = 'pqs-dot'; // tem đang tắt — không phải lỗi
  } else {
    temDot.className = 'pqs-dot ' + (_temPrinterReady() ? 'ok' : 'bad');
  }
}

// Đợi tới khi máy in tem sẵn sàng (hoặc hết số lần thử) — dùng cho nút dò & kết nối lại nhanh.
function _waitForTemReady(maxTries, intervalMs) {
  return new Promise(resolve => {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const ok = _temPrinterReady();
      if (ok || tries >= maxTries) { clearInterval(timer); resolve(ok); }
    }, intervalMs);
  });
}

// [ADD-printer-quickstatus] Bấm vào nút trạng thái cạnh logo — tự dò & kết nối lại máy nào
// đang mất kết nối trong CẢ 2 máy in (Bill + Tem) cùng lúc, không cần vào tận màn Máy in.
async function printerQuickReconnect() {
  const btn = document.getElementById('printerQuickBtn');
  if (btn) btn.classList.add('busy');
  document.getElementById('pqs-dot-bill').className = 'pqs-dot busy';
  document.getElementById('pqs-dot-tem').className = 'pqs-dot busy';
  toast('🔄 Đang dò & kết nối lại máy in...');

  // ---- Máy in Bill ----
  let billOk = POSPrinter.connected;
  if (!billOk) {
    try {
      if (window.AndroidPrinter) billOk = await POSPrinter.tryReconnectBluetoothAppSilently();
      else billOk = await POSPrinter.tryReconnectSilently();
    } catch (e) { billOk = false; }
  }

  // ---- Máy in Tem ----
  // [FIX-tem-freeze] Trước đây nếu window.AndroidPrinter.startLanDiscovery() (gọi bên trong
  // temAppDiscoverAndConnect) ném lỗi, exception văng thẳng ra khỏi hàm này — bỏ qua luôn dòng
  // gỡ 'busy' bên dưới, khiến nút trạng thái cạnh logo bị kẹt mờ/không bấm được nữa (class
  // 'busy' có pointer-events:none). Bọc try/catch để LUÔN gỡ được 'busy' dù máy in tem lỗi gì.
  let temOk;
  try {
    if (!POSTemPrinter.enabled) {
      temOk = null; // đang tắt — không tính là lỗi
    } else if (!window.AndroidPrinter) {
      temOk = false; // [REMOVE-rawbt] ngoài app bọc là không in tem được — báo đỏ, không bỏ qua
    } else {
      // [FIX-tem-keepalive] Dùng chung temEnsureConnected(): thử IP đã nhớ trước (~1s) rồi mới
      // quét lại toàn mạng — nhanh hơn hẳn việc lúc nào cũng quét LAN như trước.
      temOk = await temEnsureConnected();
    }
  } catch (e) {
    console.warn('[printerQuickReconnect] lỗi khi dò/kết nối máy in tem', e);
    temOk = false;
  }

  if (btn) btn.classList.remove('busy');
  _updatePrinterQuickStatusUI();

  // Thông báo tổng kết, chỉ nhắc tới máy nào THỰC SỰ áp dụng được (bỏ qua tem nếu đang tắt/ngoài app riêng)
  const parts = [];
  parts.push(billOk ? '✅ Bill' : '❌ Bill');
  if (temOk !== null) parts.push(temOk ? '✅ Tem' : '❌ Tem');
  const allOk = billOk && temOk !== false;
  toast((allOk ? '✅ ' : '⚠ ') + parts.join(' · '));
}

function _fillPrinterLayoutInputs() {
  const lay = POSPrinter.layout;
  const g = id => document.getElementById(id);
  if (g('pl-copies')) g('pl-copies').value = lay.copies;
  if (g('pl-feed')) g('pl-feed').value = lay.feedLinesAfter;
  if (g('pl-fonttitle')) g('pl-fonttitle').value = lay.fontSizeTitle;
  if (g('pl-fontbody')) g('pl-fontbody').value = lay.fontSizeBody;
  if (g('pl-showlogo')) g('pl-showlogo').checked = lay.showLogo;
  if (g('pl-footer-text')) g('pl-footer-text').value = lay.footerText || '';
  if (g('pl-footer-bold')) g('pl-footer-bold').checked = !!lay.footerBold;
}

async function printerConnectClick() {
  try {
    const baud = await POSPrinter.connect();
    toast('✅ Đã kết nối máy in (' + baud + ' baud)');
  } catch (e) {
    toast('❌ Không kết nối được: ' + e.message);
  }
}

// Liệt kê các máy in đã ghép nối (bonded) Bluetooth trên tablet — lấy từ app Android riêng
function billBtScanClick() {
  if (!window.AndroidPrinter) { toast('⚠ Chức năng này chỉ hoạt động trong app Android'); return; }
  let list = [];
  try { list = JSON.parse(window.AndroidPrinter.listBluetoothPrinters() || '[]'); }
  catch (e) { toast('❌ Lỗi lấy danh sách máy in: ' + e.message); return; }

  const sel = document.getElementById('printer-bt-device-select');
  const btn = document.getElementById('printer-bt-connect-btn');
  if (!sel) return;
  sel.innerHTML = '';

  if (!list.length) {
    toast('⚠ Chưa ghép nối máy in nào — vào Cài đặt Bluetooth của tablet để ghép nối trước');
    sel.style.display = 'none';
    if (btn) btn.style.display = 'none';
    return;
  }
  list.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.mac;
    opt.textContent = d.name + ' (' + d.mac + ')';
    sel.appendChild(opt);
  });
  sel.style.display = '';
  if (btn) btn.style.display = '';
}

async function billBtConnectClick() {
  const sel = document.getElementById('printer-bt-device-select');
  const mac = sel && sel.value;
  if (!mac) { toast('⚠ Vui lòng chọn máy in trong danh sách'); return; }
  try {
    await POSPrinter.connectBluetoothApp(mac);
    toast('✅ Đã kết nối máy in qua Bluetooth');
  } catch (e) {
    toast('❌ Không kết nối được: ' + e.message);
  }
}

async function printerDisconnectClick() {
  await POSPrinter.disconnect();
  toast('Đã ngắt kết nối máy in');
}

async function printerTestClick() {
  try { await POSPrinter.printTestPage(); toast('✅ Đã gửi lệnh in thử'); }
  catch (e) { toast('❌ Lỗi in thử: ' + e.message); }
}

function printerToggleAuto(el) {
  POSPrinter.setAutoPrint(el.checked);
  _updatePrinterStatusUI();
  toast(el.checked ? '✅ Đã bật tự động in' : 'Đã tắt tự động in');
}

function printerSaveLayout() {
  const g = id => document.getElementById(id);
  POSPrinter.saveLayout({
    copies: Math.max(1, Math.min(5, parseInt(g('pl-copies').value) || 1)),
    feedLinesAfter: Math.max(0, Math.min(10, parseInt(g('pl-feed').value) || 3)),
    fontSizeTitle: parseInt(g('pl-fonttitle').value) || 28,
    fontSizeBody: parseInt(g('pl-fontbody').value) || 16,
    showLogo: g('pl-showlogo').checked,
    footerText: (g('pl-footer-text') ? g('pl-footer-text').value : '').slice(0, 500),
    footerBold: g('pl-footer-bold') ? g('pl-footer-bold').checked : false
  });
  toast('✅ Đã lưu cấu hình in');
}

// Có cầu nối quét hay không. Kiểm cả getScannerVersion để app đời cũ (chỉ có AndroidPrinter,
// chưa có AndroidScanner) không bị nhận nhầm là quét được.
function posScanAvailable() {
  try {
    return !!(window.AndroidScanner
      && typeof window.AndroidScanner.scan === 'function'
      && typeof window.AndroidScanner.getScannerVersion === 'function'
      && window.AndroidScanner.getScannerVersion() >= 1);
  } catch (e) { return false; }
}

function posScan() {
  if (!posScanAvailable()) {
    return Promise.resolve({ ok: false, code: '', format: '', error: 'no-scanner' });
  }
  const id = 'sc' + (++_scanSeq) + '_' + Date.now();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      delete _scanPending[id];
      resolve({ ok: false, code: '', format: '', error: 'timeout' });
    }, 90000);
    _scanPending[id] = { resolve, timer };
    try {
      window.AndroidScanner.scan(id);
    } catch (e) {
      delete _scanPending[id];
      clearTimeout(timer);
      resolve({ ok: false, code: '', format: '', error: e.message || 'Không gọi được máy quét' });
    }
  });
}

// Câu chữ hiển thị cho từng loại lỗi — gom một chỗ để mọi màn dùng quét báo giống nhau.
function posScanErrorText(err) {
  if (err === 'no-scanner') return 'Máy này không quét được — cần mở bằng app của quán (bản mới).';
  if (err === 'cancelled')  return 'Đã huỷ quét.';
  if (err === 'timeout')    return 'Máy quét không phản hồi — thử lại hoặc chọn mã bằng tay.';
  if (err === 'busy')       return 'Đang có một lượt quét khác.';
  return err || 'Không quét được.';
}

// Nút "Quét thử mã" ở màn Máy in — kiểm tra phần cứng, không dính gì tới dữ liệu kho.
async function scanTestClick() {
  const out = document.getElementById('scanTestOut');
  if (!posScanAvailable()) {
    // Báo "không quét được" suông thì không ai biết hỏng ở đâu: app cũ? trình duyệt thường?
    // hay cầu nối có mà thiếu hàm? Liệt kê thẳng những gì trang web NHÌN THẤY — đọc trên
    // điện thoại là biết ngay, khỏi phải cắm máy tính vào chrome://inspect.
    if (out) out.innerHTML = '<span style="color:#c0392b;font-weight:700;">Không tìm thấy máy quét.</span><br>' +
      '<div style="margin-top:8px;font-family:monospace;font-size:11.5px;line-height:1.7;color:#666;">' +
      'AndroidPrinter: ' + (window.AndroidPrinter ? 'CÓ' : 'KHÔNG') + '<br>' +
      'AndroidScanner: ' + (window.AndroidScanner ? 'CÓ' : 'KHÔNG') + '<br>' +
      'scan(): ' + (window.AndroidScanner ? typeof window.AndroidScanner.scan : '—') + '<br>' +
      'getScannerVersion(): ' + (function(){
        try { return window.AndroidScanner ? String(window.AndroidScanner.getScannerVersion()) : '—'; }
        catch (e) { return 'lỗi: ' + (e.message || e); } })() +
      '</div>' +
      '<div style="margin-top:8px;font-size:12px;">' +
      (window.AndroidPrinter && !window.AndroidScanner
        ? '<b>Đang chạy APK CŨ.</b> App bọc có (máy in chạy được) nhưng chưa có phần quét — gỡ hẳn app rồi cài lại bản vừa build, đừng cài đè.'
        : (!window.AndroidPrinter
            ? 'Đang mở bằng trình duyệt thường, không phải app của quán.'
            : 'Cầu nối có nhưng thiếu hàm — báo lại dòng monospace ở trên.')) +
      '</div>';
    return;
  }
  if (out) out.textContent = 'Đang mở máy quét...';
  const r = await posScan();
  if (!out) return;
  if (r.ok) {
    out.innerHTML = '<span style="color:#16a34a;font-weight:700;">Quét được!</span><br>' +
      'Mã: <b>' + String(r.code).replace(/[<>&]/g, '') + '</b><br>' +
      'Loại mã: ' + (r.format || '—');
  } else if (r.error === 'cancelled') {
    out.textContent = 'Đã huỷ — máy quét hoạt động bình thường.';
  } else {
    out.innerHTML = '<span style="color:#c0392b;font-weight:700;">' + posScanErrorText(r.error) + '</span>';
  }
}

function printerTab(btn, which) {
  document.querySelectorAll('#printerScreen .tbb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('printer-tab-bill').style.display = which === 'bill' ? '' : 'none';
  document.getElementById('printer-tab-tem').style.display = which === 'tem' ? '' : 'none';
  if (which === 'tem') _updateTemAppConnectUI();
}

// ---- Kết nối máy in tem qua app Android riêng (cầu nối window.AndroidPrinter) — tự dò UDP
// trong mạng LAN, tự nhớ MAC máy in đã dùng (lưu cloud), không cần ai gõ tay IP ----
function _updateTemAppConnectUI() {
  const sec = document.getElementById('tem-app-connect-section');
  if (!sec) return;
  if (window.AndroidPrinter) {
    sec.style.display = 'block';
    _refreshTemAppConnectStatus();
    if (!(window.AndroidPrinter.isAvailable && window.AndroidPrinter.isAvailable())) {
      // [FIX-tem-singleflight] Qua khoá chung — mở tab Máy in đúng lúc đang in tem thì
      // trước đây phát thêm một lượt quét/nối chen ngang.
      temEnsureConnected().catch(() => {});
    }
  } else {
    sec.style.display = 'none';
  }
}

// ── Chẩn đoán cầu nối ───────────────────────────────────────────────────────
// Hiện nguyên trạng những gì app Android đưa ra cho trang web. Dùng khi web báo
// "app cũ" mà tablet rõ ràng đang chạy APK mới: nhìn danh sách hàm là biết ngay
// app đặt tên khác, phơi ra dạng thuộc tính, hay thật sự thiếu hàm.
let _temDiagOpen = false;

function temToggleDiag() {
  _temDiagOpen = !_temDiagOpen;
  const el = document.getElementById('tem-bridge-diag');
  if (el) el.style.display = _temDiagOpen ? 'block' : 'none';
  _renderTemBridgeDiag();
}

function _renderTemBridgeDiag() {
  const el = document.getElementById('tem-bridge-diag');
  if (!el || !_temDiagOpen) return;
  const ap = window.AndroidPrinter;
  if (!ap) { el.textContent = 'Không có window.AndroidPrinter — đang chạy NGOÀI app Android của quán.'; return; }
  let ten = [];
  // Cầu nối @JavascriptInterface không liệt kê được bằng Object.keys() trên một số
  // bản WebView, nên dò cả prototype và thử trực tiếp từng tên đã biết.
  try { ten = Object.getOwnPropertyNames(ap); } catch (e) {}
  try { ten = ten.concat(Object.getOwnPropertyNames(Object.getPrototypeOf(ap) || {})); } catch (e) {}
  const doBiet = ['printRawBytes', 'isAvailable', 'connectPrinter', 'startLanDiscovery',
    'getLanDiscoveryResults', 'getBridgeVersion', 'getVersion',
    'getTemStatus', 'setTemKeepAlive', 'resetTemCounters'];
  doBiet.forEach(n => { if (ten.indexOf(n) < 0 && ap[n] !== undefined) ten.push(n); });
  ten = [...new Set(ten)].filter(n => n !== 'constructor').sort();
  const kieu = n => { try { return typeof ap[n]; } catch (e) { return '?'; } };
  let raw = '(không đọc được)';
  try {
    if (typeof ap.getBridgeVersion === 'function') raw = JSON.stringify(ap.getBridgeVersion());
    else if (ap.getBridgeVersion !== undefined) raw = JSON.stringify(ap.getBridgeVersion) + ' (thuộc tính, không phải hàm)';
    else raw = '(app không có getBridgeVersion)';
  } catch (e) { raw = 'lỗi: ' + (e && e.message ? e.message : e); }
  const st = _temStatus();
  el.textContent = [
    'getBridgeVersion trả về : ' + raw,
    'web hiểu là phiên bản   : ' + (_temBridgeVersion() || 'KHÔNG BIẾT'),
    'dùng đường v2           : ' + (_temHasV2() ? 'CÓ' : 'KHÔNG'),
    'năng lực v2 có          : ' + (_temV2FnCount() + '/' + TEM_V2_FNS.length)
      + (_temV2FnCount() < TEM_V2_FNS.length ? '  (thiếu: ' + TEM_V2_FNS.filter(f => !_temFn(f)).join(', ') + ')' : ''),
    'keepalive               : ' + (_temFn('setTemKeepAlive') ? 'CÓ' : 'KHÔNG — sẽ ép nối lại trước mỗi lượt in'),
    'watchdog nền            : ' + (_temWatchdogTimer ? 'đang chạy' : 'KHÔNG chạy'),
    'isAvailable()           : ' + (function () { try { return String(ap.isAvailable()); } catch (e) { return 'lỗi'; } })(),
    'IP đã nhớ               : ' + (_temSavedIp() || '(chưa có)'),
    'lần gửi cuối            : ' + (_temLastSendAt ? Math.round((Date.now() - _temLastSendAt) / 1000) + 's trước' : '(chưa gửi lần nào)'),
    'tự động in tem          : ' + (POSTemPrinter.enabled ? 'BẬT' : 'TẮT'),
    'getTemStatus()          : ' + (st ? JSON.stringify(st) : '(app không cung cấp)'),
    '',
    'Hàm app đưa ra:',
    ...ten.map(n => '  · ' + n + ' : ' + kieu(n))
  ].join('\n');
}

function _refreshTemAppConnectStatus() {
  const statusEl = document.getElementById('tem-app-connect-status');
  _updatePrinterQuickStatusUI(); // đồng bộ luôn 2 chấm trạng thái nhanh cạnh logo
  if (!statusEl || !window.AndroidPrinter) return;
  try {
    const ok = window.AndroidPrinter.isAvailable();
    // [FIX-bridge-v2] Hiện luôn phiên bản app — trong lúc triển khai cần biết ngay tablet
    // nào còn chạy APK cũ mà không phải vào Cài đặt ▸ Ứng dụng để dò.
    // [FIX-bridge-detect] Nhãn cũ chỉ nhìn số phiên bản, nên app mới mà khai
    // getBridgeVersion khác kiểu là bị dán nhãn "cần cài lại APK" — nhân viên đi
    // cài lại APK cả buổi trong khi lỗi nằm ở chỗ khác. Giờ nói ĐÚNG CÁI DÒ ĐƯỢC.
    const v = _temBridgeVersion();
    const nV2 = _temV2FnCount(), nTong = TEM_V2_FNS.length;
    const vLbl = v ? 'app v' + v : 'app';
    let vTxt, xau = false;
    if (nV2 === nTong) vTxt = ' · ' + vLbl + ' (đủ tính năng)';
    else if (nV2 > 0) { vTxt = ' · ' + vLbl + ' — thiếu: ' + TEM_V2_FNS.filter(f => !_temFn(f)).join(', '); xau = true; }
    else { vTxt = ' · app CŨ (v1 — cần cài lại APK)'; xau = true; }
    const st = _temStatus();
    const errTxt = (!ok && st && st.lastError) ? ' — ' + st.lastError : '';
    statusEl.textContent = (ok ? '✅ Đã kết nối' : 'Chưa kết nối') + vTxt + errTxt;
    statusEl.style.color = ok ? (xau ? '#b45309' : '#2e7d32') : (xau ? '#c62828' : '#999');
    _renderTemBridgeDiag();
  } catch (e) {}
}

// Ra lệnh app native quét UDP tìm máy in tem trong mạng LAN, đợi ~2.2s để các máy in kịp
// phản hồi rồi xử lý kết quả. manual=true khi người dùng chủ động bấm "Quét lại" (sẽ báo lỗi
// rõ ràng hơn nếu không tìm thấy); manual=false khi tự động chạy ngầm lúc mở app/mở tab.
function temAppDiscoverAndConnect(manual) {
  if (!window.AndroidPrinter || typeof window.AndroidPrinter.startLanDiscovery !== 'function') return;
  const statusEl = document.getElementById('tem-app-connect-status');
  if (statusEl) { statusEl.textContent = 'Đang dò máy in...'; statusEl.style.color = '#999'; }
  // [FIX-tem-freeze] Trước đây gọi thẳng không try/catch — nếu bản APK mới ném lỗi ngay tại
  // startLanDiscovery() (VD API native đổi/không tương thích), statusEl bị kẹt mãi ở "Đang dò
  // máy in..." không bao giờ cập nhật lại, wrap tại đây để LUÔN báo được kết quả/lỗi cho người dùng.
  try {
    window.AndroidPrinter.startLanDiscovery();
  } catch (e) {
    console.warn('[temAppDiscoverAndConnect] startLanDiscovery lỗi', e);
    if (statusEl) { statusEl.textContent = '❌ Lỗi dò máy in: ' + (e && e.message ? e.message : e); statusEl.style.color = '#c62828'; }
    if (manual) toast('❌ Lỗi dò máy in tem: ' + (e && e.message ? e.message : e));
    return;
  }
  setTimeout(() => {
    let list = [];
    try { list = JSON.parse(window.AndroidPrinter.getLanDiscoveryResults() || '[]'); } catch (e) {
      console.warn('[temAppDiscoverAndConnect] getLanDiscoveryResults lỗi', e);
      if (statusEl) { statusEl.textContent = '❌ Lỗi đọc kết quả dò: ' + (e && e.message ? e.message : e); statusEl.style.color = '#c62828'; }
      if (manual) toast('❌ Lỗi đọc kết quả dò máy in tem');
      return;
    }
    _handleTemDiscoveryResults(list, manual);
  }, 2200);
}

function _handleTemDiscoveryResults(list, manual) {
  const savedMac = POSTemPrinter.getMac();
  const statusEl = document.getElementById('tem-app-connect-status');
  const pickWrap = document.getElementById('tem-printer-pick-wrap');
  const pickSel = document.getElementById('tem-printer-pick-select');

  // Trường hợp 1: đã từng nhớ MAC máy in — nếu lần quét này thấy đúng máy đó, tự kết nối luôn
  if (savedMac) {
    const match = list.find(d => d.mac && d.mac.toUpperCase() === savedMac.toUpperCase());
    if (match) {
      window.AndroidPrinter.connectPrinter(match.ip);
      _temSaveIp(match.ip); // [FIX-tem-keepalive] nhớ IP để lần rớt sau nối lại tức thì, khỏi quét lại LAN
      if (pickWrap) pickWrap.style.display = 'none';
      _pollTemConnectStatus(!manual);
      return;
    }
  }
  // Trường hợp 2: mạng chỉ có ĐÚNG 1 máy in tem — tự chọn luôn, khỏi hỏi.
  // [FIX-tem-selfheal] TRƯỚC ĐÂY điều kiện có thêm `&& !savedMac`, nghĩa là khi đã nhớ MAC cũ
  // mà lần quét này không thấy đúng MAC đó (máy in được thay mới, firmware báo MAC khác định
  // dạng, hoặc MAC nhớ nhầm từ máy khác) thì dù mạng chỉ có duy nhất 1 máy in, app vẫn KHÔNG
  // tự kết nối mà nhảy sang bắt nhân viên chọn tay — watchdog nền vì thế mất khả năng tự phục
  // hồi, quay lại đúng cảnh phải bấm nút giữa ca. Mạng chỉ có 1 máy in tem thì gần như chắc
  // chắn đó là máy của quán: kết nối luôn và CẬP NHẬT LẠI MAC đã nhớ cho các lần sau.
  if (list.length === 1) {
    const d = list[0];
    window.AndroidPrinter.connectPrinter(d.ip);
    _temSaveIp(d.ip); // [FIX-tem-keepalive] nhớ IP để nối lại tức thì khi rớt
    if (d.mac) POSTemPrinter.setMac(d.mac); // chỉ nhớ MAC thật, không ghi đè bằng giá trị rỗng
    if (pickWrap) pickWrap.style.display = 'none';
    _pollTemConnectStatus(!manual);
    return;
  }
  // Trường hợp 3: quét thấy nhiều máy (hoặc máy đã nhớ không thấy) — cho chọn 1 lần, nhớ luôn
  if (list.length > 0) {
    if (pickWrap && pickSel) {
      pickSel.innerHTML = '';
      list.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.ip + '|' + d.mac;
        opt.textContent = d.ip + (d.mac ? ' (' + d.mac + ')' : '');
        pickSel.appendChild(opt);
      });
      pickWrap.style.display = '';
    }
    if (statusEl) { statusEl.textContent = 'Tìm thấy máy in — chọn bên dưới để kết nối'; statusEl.style.color = '#999'; }
    return;
  }
  // Trường hợp 4: không tìm thấy máy in nào
  if (statusEl) {
    statusEl.textContent = manual ? '❌ Không tìm thấy máy in trong mạng' : 'Chưa kết nối';
    statusEl.style.color = manual ? '#c62828' : '#999';
  }
}

function temPickerConnectClick() {
  const sel = document.getElementById('tem-printer-pick-select');
  if (!sel || !sel.value) { toast('⚠ Vui lòng chọn máy in'); return; }
  const [ip, mac] = sel.value.split('|');
  window.AndroidPrinter.connectPrinter(ip);
  _temSaveIp(ip); // [FIX-tem-keepalive] nhớ IP để nối lại tức thì khi rớt
  if (mac) POSTemPrinter.setMac(mac);
  const pickWrap = document.getElementById('tem-printer-pick-wrap');
  if (pickWrap) pickWrap.style.display = 'none';
  _pollTemConnectStatus();
}

let _temPollTimer = null;

// [FIX] silent — TRƯỚC ĐÂY hàm này luôn toast khi thất bại, kể cả khi được gọi từ
// đường "ÂM THẦM" (watchdog nền mỗi 30s, và lượt dò tự động lúc mở app — xem
// _temQuietReconnect/_handleTemDiscoveryResults). Máy in tem tắt hay ngoài vùng
// WiFi giữa ca là chuyện thường, nhưng cứ mỗi lượt watchdog lại bắn "❌ Không kết
// nối được, thử quét lại" — nhân viên đang bận quét mã kho/bán hàng (việc không hề
// liên quan tới máy in tem) thấy lỗi này hiện lên vài giây sau một thao tác của
// mình thì tưởng chính thao tác đó thất bại, dù nó đã thành công. Giờ chỉ toast khi
// đây THẬT SỰ là lượt dò do nhân viên tự bấm (xem chỗ gọi `!manual` ở
// _handleTemDiscoveryResults) — lượt nền vẫn cập nhật đúng trạng thái (chấm đỏ/xanh
// cạnh logo), chỉ là không làm phiền bằng toast.
function _pollTemConnectStatus(silent) {
  const statusEl = document.getElementById('tem-app-connect-status');
  if (statusEl) { statusEl.textContent = 'Đang kết nối...'; statusEl.style.color = '#999'; }
  // [FIX] Trước đây mỗi lần gọi lại tạo thêm một interval mà không dọn cái cũ — vài lượt dò
  // chồng nhau là bắn ra một chuỗi toast "Không kết nối được" trùng lặp.
  if (_temPollTimer) { clearInterval(_temPollTimer); _temPollTimer = null; }
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    let ok = false;
    try { ok = window.AndroidPrinter.isAvailable(); } catch (e) {}
    if (ok || tries >= 8) {
      clearInterval(timer);
      if (_temPollTimer === timer) _temPollTimer = null;
      if (ok) _temSyncKeepAlive();
      _refreshTemAppConnectStatus();
      if (!ok && !silent) toast('❌ Không kết nối được, thử quét lại');
    }
  }, 500);
  _temPollTimer = timer;
}

function temReprintInfo(o) {
  if (!o) return { ok: false, minsLeft: 0, why: 'Không tìm thấy đơn' };
  const mins = _guardMinsSince(o.createdAt);
  if (mins === null) return { ok: false, minsLeft: 0, why: 'Đơn cũ không có mốc thời gian — không in lại tem được' };
  if (mins < 0) return { ok: false, minsLeft: 0, why: 'Mốc thời gian đơn không hợp lệ' };
  const minsLeft = TEM_REPRINT_WINDOW_MIN - mins;
  if (minsLeft <= 0) return { ok: false, minsLeft: 0, why: `Quá ${TEM_REPRINT_WINDOW_MIN} phút kể từ lúc bấm bill — không in lại tem được nữa. Cần in thì báo Quản lý.` };
  return { ok: true, minsLeft, why: '' };
}

// Chốt chặn dùng chung cho MỌI đường in lại tem. Đặt ở từng hàm chứ không chỉ ở
// nút bấm: nút chỉ là một trong bốn đường vào, và đường nào cũng gọi được từ
// console của trình duyệt.
function temReprintGuard(o) {
  const info = temReprintInfo(o);
  if (!info.ok) { toast('🔒 ' + info.why); return false; }
  return true;
}

// Ghi sổ mọi lượt in lại. In lại trong 20 phút vẫn là việc bình thường (tem kẹt
// giấy, tem mờ) — nhưng một người in lại 10 lần một ca thì đó là chuyện đáng
// nhìn, mà không ghi thì không ai biết. Không chặn luồng in nếu ghi sổ lỗi.
function logReprint(o, kind, scope, chiTiet) {
  try {
    fstore.collection(REPRINT_LOG_COLL).add({
      orderId: o.id || null,
      billCode: o.billCode || null,
      businessDate: posDateKey(),
      orderDate: o.date || null,
      orderCreatedAt: o.createdAt || null,
      minutesSinceBill: _guardMinsSince(o.createdAt),
      kind,                       // 'tem' | 'bill'
      scope,                      // 'all' | 'item' | 'unit'
      detail: chiTiet || '',
      staffOnShift: _guardStaffOnShift(),
      at: vnDate().toISOString()
    }).catch(err => console.warn('[in lại] không ghi được sổ (không chặn in):', err));
  } catch (err) { console.warn('[in lại] ghi sổ lỗi:', err); }
}

// ── LỚP 2: ẩn bill cũ khỏi danh sách ────────────────────────────────────────
// Cộng tay từng bill trong danh sách là cách dựng lại doanh thu ngày mà không
// cần màn Doanh thu (vốn đã có mật khẩu). Ẩn danh sách thì bỏ được đường đó,
// NHƯNG phải chừa lối tra cứu: khách quay lại hỏi bill là việc thật, và nhân
// viên vẫn cần xoá bill bấm nhầm. Nên: gõ mã bill / SĐT thì tra được mọi đơn,
// chỉ là không còn một danh sách để cộng.
function billIsFresh(o) {
  const mins = _guardMinsSince(o && o.createdAt);
  if (mins === null) return false;      // không rõ tuổi → coi như cũ
  return mins < HISTORY_VISIBLE_MIN;
}

async function printerReprintOrder(orderId) {
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === orderId);
  if (!o) { toast('Không tìm thấy đơn'); return; }
  if (!POSPrinter.connected) { toast('⚠ Máy in chưa kết nối — vào mục Máy in để kết nối'); return; }
  try {
    await POSPrinter.printOrder(o);
    toast('✅ Đang in lại' + (o.billCode ? ' ' + o.billCode : ''));
    logReprint(o, 'bill', 'all', o.billCode || '');
  }
  catch (e) { toast('❌ Lỗi in lại: ' + e.message); }
}

// Mở bottom-sheet chọn món cần in lại tem — dùng khi 1 tem nào đó bị lỗi/kẹt giấy, không phải
// in lại toàn bộ hoá đơn giấy.
function openTemReprintPicker(orderId) {
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === orderId);
  if (!o) { toast('Không tìm thấy đơn'); return; }
  if (!(o.itemsArray && o.itemsArray.length)) { toast('Đơn không có món nào'); return; }
  if (!temReprintGuard(o)) return;   // [NEW-GUARD] hết cửa sổ 20 phút thì không mở picker

  let overlay = document.getElementById('tem-reprint-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tem-reprint-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  // Mỗi LY (tem) là 1 dòng riêng, có nút "In lại" RIÊNG chỉ in đúng 1 tem đó — không còn
  // in lại cả cụm qty (vd món 30 ly thì trước đây bấm 1 nút in ra 30 tem, giờ mỗi ly là 1 nút).
  // Món qty=1 thì gộp gọn 1 dòng như cũ.
  const rows = o.itemsArray.map((item, idx) => {
    const nameLine = `${item.name}${item.size && item.size !== '-' ? ' (' + item.size + ')' : ''}`;
    const qty = Math.max(1, item.qty || 1);
    const { start, total } = _temCupInfoForItem(o, idx);

    if (qty <= 1) {
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #eee;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--td);">${nameLine}</div>
          <div style="font-size:12px;color:var(--gt);">Tem ${start}/${total}</div>
        </div>
        <button onclick="temReprintOneUnit('${orderId}',${idx},0)" style="background:#8b5cf6;color:#fff;border:none;border-radius:12px;padding:10px 16px;font-family:'Google Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">In lại</button>
      </div>`;
    }

    const unitRows = Array.from({ length: qty }, (_, u) => {
      const seq = start + u;
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0 9px 14px;border-bottom:1px dashed #eee;">
        <div style="font-size:13px;font-weight:600;color:var(--gt);">Tem ${seq}/${total}</div>
        <button onclick="temReprintOneUnit('${orderId}',${idx},${u})" style="background:#8b5cf6;color:#fff;border:none;border-radius:12px;padding:8px 14px;font-family:'Google Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">In lại</button>
      </div>`;
    }).join('');

    return `
      <div style="padding:10px 0 0;border-bottom:1px solid #eee;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--td);">${nameLine}</div>
            <div style="font-size:12px;color:var(--gt);">${qty} tem · ${start}-${start + qty - 1}/${total}</div>
          </div>
          <button onclick="temReprintOneItem('${orderId}',${idx})" style="background:#fff;color:#8b5cf6;border:1.5px solid #8b5cf6;border-radius:12px;padding:9px 12px;font-family:'Google Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">In cả ${qty}</button>
        </div>
        ${unitRows}
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div style="background:#FFFCF0;border-radius:28px;padding:24px 20px;width:100%;max-width:430px;max-height:80vh;overflow-y:auto;animation:pi .2s ease;">
      <div style="font-size:17px;font-weight:700;color:var(--td);margin-bottom:4px;">In lại tem</div>
      <div style="font-size:12px;font-weight:600;color:var(--gt);margin-bottom:16px;">Bấm đúng tem bị lỗi/kẹt giấy để in lại 1 tem, hoặc in lại toàn bộ tem của đơn này</div>
      <button onclick="temReprintAll('${orderId}')" style="width:100%;background:var(--gd);color:#fff;border:none;border-radius:14px;padding:13px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:14px;">🖨 In lại TẤT CẢ tem của đơn này</button>
      <div>${rows}</div>
    </div>`;
}

// In lại ĐÚNG 1 tem của 1 ly cụ thể trong 1 dòng món (unitIdx = thứ tự ly trong dòng món đó,
// bắt đầu từ 0) — KHÔNG lặp qua cả qty như printLabelsForItems, tránh lỗi in dư (món qty=2
// bấm 1 tem lại in ra 2, món qty=30 bấm 1 tem lại in ra cả 30).
// [FIX-tem-keepalive] TRƯỚC ĐÂY các hàm in lại tem chặn cứng bằng _temPrinterReady() rồi bắt
// nhân viên "vào mục Máy in để kết nối" — nhưng socket LAN rớt do máy in tự đóng khi nhàn rỗi
// là chuyện xảy ra LIÊN TỤC trong ca, nên thao tác tay đó lặp lại cả chục lần mỗi ngày.
// Giờ tự nối lại tại chỗ (~1s bằng IP đã nhớ), chỉ báo lỗi khi nối lại THẬT SỰ không được.
async function temReprintOneUnit(orderId, itemIdx, unitIdx) {
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === orderId);
  if (!o || !o.itemsArray || !o.itemsArray[itemIdx]) { toast('Không tìm thấy món'); return; }
  if (!temReprintGuard(o)) return;   // [NEW-GUARD]
  if (!(await temEnsureConnected())) { toast('⚠ Không nối được máy in tem — kiểm tra máy in đã bật & cùng WiFi'); return; }
  const item = o.itemsArray[itemIdx];
  const { start, total } = _temCupInfoForItem(o, itemIdx);
  const seq = start + unitIdx;
  const lines = POSTemPrinter.buildItemLabelLines(o, item, seq, total);
  // [FIX-bridge-v2] Trước đây luôn báo "đang in" bất kể có gửi được hay không.
  const _ok = POSTemPrinter.printLabel(lines, 1);
  const _nhan = item.name + (total > 1 ? ` (${seq}/${total})` : '');
  if (_ok === false) {
    const _st = _temStatus();
    toast('❌ Không gửi được tem: ' + _nhan + ((_st && _st.lastError) ? ' — ' + _st.lastError : ''));
  } else {
    toast('✅ Đang in lại 1 tem: ' + _nhan);
    logReprint(o, 'tem', 'unit', _nhan);
  }
}

// Tính vị trí (thứ tự ly đầu tiên + tổng số ly cả đơn) của 1 dòng món trong đơn — để in lại
// đúng số "X/Y" như lúc in gốc, không bị lệch số thứ tự.
function _temCupInfoForItem(order, idx) {
  const items = order.itemsArray || [];
  const total = items.reduce((s, it) => s + Math.max(1, it.qty || 1), 0);
  let start = 1;
  for (let i = 0; i < idx; i++) start += Math.max(1, items[i].qty || 1);
  return { start, total };
}

async function temReprintOneItem(orderId, idx) {
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === orderId);
  if (!o || !o.itemsArray || !o.itemsArray[idx]) { toast('Không tìm thấy món'); return; }
  if (!temReprintGuard(o)) return;   // [NEW-GUARD]
  if (!(await temEnsureConnected())) { toast('⚠ Không nối được máy in tem — kiểm tra máy in đã bật & cùng WiFi'); return; }
  const item = o.itemsArray[idx];
  const { start, total } = _temCupInfoForItem(o, idx);
  POSTemPrinter.printLabelsForItems(o, [item], total, start);
  toast('✅ Đang in lại tem: ' + item.name);
  logReprint(o, 'tem', 'item', item.name);
}

async function temReprintAll(orderId) {
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === orderId);
  if (!o) { toast('Không tìm thấy đơn'); return; }
  if (!temReprintGuard(o)) return;   // [NEW-GUARD]
  if (!(await temEnsureConnected())) { toast('⚠ Không nối được máy in tem — kiểm tra máy in đã bật & cùng WiFi'); return; }
  const overlay = document.getElementById('tem-reprint-overlay');
  if (overlay) overlay.remove();
  toast('✅ Đang in lại toàn bộ tem...');
  logReprint(o, 'tem', 'all', `${(o.itemsArray||[]).length} món`);
  await POSTemPrinter.printLabelsForItems(o, o.itemsArray || []);
}

PosGieoMods.printUi = true;
