/** QUANLY thin client — điều tra qua read-layer, sửa qua commands. */
GIEO.define('app-quanly/main', [
  'shared-kernel/result',
  'shared-kernel/clock',
  'shared-kernel/ids',
  'bootstrap/runtime',
  'app-quanly/controller'
], function (R, clockLib, ids, bootstrap, controllerLib) {
  'use strict';

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) { return Number(n || 0).toLocaleString('vi-VN') + ' ₫'; }
  var clock = clockLib.createClock();

  /**
   * Kho — danh mục cấu hình (2026-09-18). Một schema mô tả field cho MỘT
   * bảng thay vì viết 6 màn riêng — cùng tinh thần `defineConfigUpsert`
   * (commands/kho-config.js): 6 collection khác nhau nhưng hình dạng UI
   * giống hệt nhau (list + form sửa/thêm + bật/tắt), nên viết 1 lần.
   */
  var KHO_CONFIG_SCHEMAS = {
    storageLocation: {
      title: 'Vị trí kho', command: 'saveStorageLocation', titleField: 'name',
      fields: [
        { key: 'name', label: 'Tên vị trí', required: true },
        { key: 'type', label: 'Loại (vd: kho lạnh, quầy)' },
        { key: 'note', label: 'Ghi chú' }
      ]
    },
    wasteReason: {
      title: 'Lý do hao hụt', command: 'saveWasteReason', titleField: 'label',
      fields: [{ key: 'label', label: 'Lý do', required: true }]
    },
    vessel: {
      title: 'Dụng cụ đựng', command: 'saveVessel', titleField: 'name',
      fields: [
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên', required: true },
        { key: 'note', label: 'Ghi chú' }
      ]
    },
    refillRule: {
      title: 'Refill', command: 'saveRefillRule', titleField: 'itemName',
      fields: [
        { key: 'itemId', label: 'Mã nguyên liệu (itemId)', required: true },
        { key: 'itemName', label: 'Tên nguyên liệu' },
        { key: 'sourceLocationId', label: 'Vị trí nguồn (id)' },
        { key: 'destLocationId', label: 'Vị trí đích (id)' },
        { key: 'targetBase', label: 'Định mức', type: 'number' },
        { key: 'minBase', label: 'Tối thiểu', type: 'number' },
        { key: 'maxBase', label: 'Tối đa', type: 'number' }
      ]
    },
    checklistItem: {
      title: 'Checklist kho', command: 'saveChecklistItem', titleField: 'label',
      fields: [
        { key: 'phase', label: 'Ca (open/close)', required: true },
        { key: 'label', label: 'Nội dung', required: true },
        { key: 'blocking', label: 'Chặn đóng ca nếu chưa xong', type: 'checkbox' },
        { key: 'order', label: 'Thứ tự', type: 'number' }
      ]
    },
    toppingRecipe: {
      title: 'Topping COGS', command: 'saveToppingRecipe', titleField: 'toppingName',
      fields: [
        { key: 'toppingName', label: 'Tên topping', required: true },
        { key: 'batchYield', label: 'Sản lượng/mẻ', type: 'number' },
        { key: 'qtyPerServing', label: 'Định lượng/ly', type: 'number' },
        { key: 'costPerServing', label: 'Giá vốn/ly', type: 'number' },
        { key: 'note', label: 'Ghi chú' }
      ]
    }
  };
  var KHO_CONFIG_ORDER = ['storageLocation', 'wasteReason', 'vessel', 'refillRule', 'checklistItem', 'toppingRecipe'];

  /**
   * Hệ mới không có field zone/domain trên alert (khác legacy computeStoreHealth()
   * gắn zone:'kho'). Tự phân loại type nào thuộc "Kho → Cần xử lý" — đối chiếu
   * TYPES trong alerts/alert.js, loại các type không liên quan kho (CASH_VARIANCE,
   * COGS_OVER_TARGET, LOYALTY_DRIFT, DRIFT_AFTER_CLOSING, SNAPSHOT_VERIFY_FAILED,
   * DAY_NOT_CLOSED — vận hành chung, không phải kho).
   */
  var KHO_ALERT_TYPES = {
    FIFO_UNIT_EXHAUSTED: true, CONTAINER_EXPIRING: true, PREP_BATCH_EXPIRING: true,
    LOW_STOCK: true, STOCKOUT: true, UNIT_NEEDS_REVIEW: true, STOCK_VARIANCE: true,
    MISSING_RECIPE: true, UNTRACKED_CONSUMPTION: true, LOST_CONTAINER_PENDING: true,
    PREP_YIELD_MISMATCH: true, STOCK_COUNT_LINE_FAILED: true
  };

  function view() { return { loading: false, error: null, data: null }; }

  function applyRead(out) {
    return R.isErr(out)
      ? { loading: false, error: out.error, data: null }
      : { loading: false, error: null, data: out.value.data, meta: out.value.meta };
  }

  /**
   * Các query Kho/Báo cáo mới (getKhoConfigList/getKhoHistory/getMix/
   * getCustomerReport) trả THẲNG `R.ok({...})` — không qua merge-canonical
   * (không có khái niệm đóng băng/snapshot cho danh mục cấu hình hay báo cáo
   * gộp trên bill), nên không có `.data`/`.meta` như applyRead đọc.
   */
  function applyRaw(out) {
    return R.isErr(out)
      ? { loading: false, error: out.error, data: null }
      : { loading: false, error: null, data: out.value };
  }

  /** Màn PIN tối thiểu của QUANLY; sẽ được đặt vào layout legacy khi port UI. */
  function showLogin(spec) {
    spec = spec || {};
    var el = document.getElementById('app');
    if (!el) return R.err('NOT_FOUND', 'không có #app');
    if (typeof spec.authenticate !== 'function' || typeof spec.onAuthenticated !== 'function') {
      return R.err('VALIDATION', 'showLogin cần authenticate và onAuthenticated');
    }
    el.innerHTML = '<div class="app-shell"><section class="panel" style="max-width:420px;margin:12vh auto 0">' +
      '<p class="eyebrow">GIEO QUANLY</p><h2>Đăng nhập quản lý</h2>' +
      '<p style="color:var(--muted)">Nhập PIN 4 số của bạn.</p>' +
      '<form id="ql-pin-form" class="search-row"><input name="pin" type="password" inputmode="numeric" ' +
      'pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" aria-label="PIN 4 số" required>' +
      '<button type="submit">Đăng nhập</button></form><div id="ql-pin-result"></div></section></div>';
    var form = el.querySelector('#ql-pin-form');
    var result = el.querySelector('#ql-pin-result');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var button = form.querySelector('button');
      button.disabled = true;
      result.innerHTML = '<div class="result"><span>Đang kiểm tra…</span></div>';
      var authenticated = spec.authenticate(form.elements.pin.value);
      if (R.isErr(authenticated)) {
        button.disabled = false;
        form.elements.pin.value = '';
        form.elements.pin.focus();
        result.innerHTML = '<div class="result error"><strong>Không đăng nhập được</strong><span>' +
          esc(authenticated.error.message) + '</span></div>';
        return;
      }
      result.innerHTML = '';
      Promise.resolve(spec.onAuthenticated(authenticated.value)).catch(function (error) {
        button.disabled = false;
        result.innerHTML = '<div class="result error"><strong>Không khởi động được</strong><span>' +
          esc(error && error.message ? error.message : error) + '</span></div>';
      });
    });
    form.elements.pin.focus();
    return R.ok(true);
  }

  function start() {
    var el = document.getElementById('app');
    if (!el) return R.err('NOT_FOUND', 'không có #app');
    var runtime = globalThis.GIEO_QUANLY_RUNTIME || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var controller = controllerLib.createController(runtime);

    var traceView = view();
    var inventoryView = view();
    var reportView = view();
    var cogsView = view();
    var varianceView = view();
    var pnlView = view();
    var alertView = view();
    var shiftView = view();
    var approvalView = view();
    var usageView = view();
    var lossView = view();
    var valuationView = view();
    var btpView = view();
    var compareView = view();
    var exportView = { busy: false, error: null, file: null };
    var btpExportView = { busy: false, error: null, file: null };
    var approvalAction = { busy: null, error: null, done: null };
    var lastPeriod = null;

    /* LỊCH SỬ BILL (port từ quanlygieo.html#renderBills — xem khối bên dưới). */
    var billsView = view();
    var billsUI = { from: clock.calendarDate(), to: clock.calendarDate(), query: '', openId: null };
    var billsDelete = { confirmId: null, busy: null, error: null };
    var billsNotice = null;

    /* Kho — danh mục cấu hình đơn giản + Báo cáo mix/customer (2026-09-18).
       Xem commands/kho-config.js cho lý do các màn này KHÔNG có pipeline
       riêng phức tạp như sales/inventory — chỉ lưu + đọc, đúng chỉ đạo chủ
       quán "đơn giản, không phải core". */
    var khoUI = { tab: 'inbox' };
    var khoConfigViews = {}; /* kind -> view(), lazy */
    var khoForm = { editingId: null, values: {}, busy: false, error: null };
    var khoHistoryView = view();
    var khoPOView = view();
    var khoPOForm = { open: false, busy: false, error: null };
    var khoContainersView = view();
    var khoContainersFilter = 'ALL';
    var khoContainersAction = { busy: null, error: null };
    var khoPackagingView = view();
    var khoPackagingForm = { busy: false, error: null };
    var mixUI = { from: clock.calendarDate(), to: clock.calendarDate() };
    var mixView = view();
    var customerUI = { from: clock.calendarDate(), to: clock.calendarDate() };
    var customerView = view();

    function errorBox(title, error) {
      return '<div class="result error"><strong>' + esc(title) + '</strong><span>' +
        esc(error.message) + '</span></div>';
    }

    function metric(label, value) {
      return '<article class="metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></article>';
    }

    /** Cột đã đóng băng phải nói ra là đóng băng (quy tắc T3 của read contract). */
    function frozenTag(v) {
      if (!v || !v.meta) return '';
      return v.meta.frozen ? '<span class="status neutral">Số đã chốt</span>' : '<span class="status">Số sống</span>';
    }

    /* ---------- Tổng quan ---------- */

    function overviewScreen() {
      var busy = reportView.loading || alertView.loading || shiftView.loading;
      var head = '<section><div class="section-head"><div><p class="eyebrow">Hôm nay</p>' +
        '<h2>Sức khỏe quán</h2></div>' +
        '<span class="status ' + (busy ? 'neutral' : 'success') + '">' +
        (busy ? 'Đang đọc…' : (shiftView.data && shiftView.data.businessDate ? esc(shiftView.data.businessDate) : 'Chưa mở ngày')) +
        '</span></div>';

      var boxes = [];
      if (reportView.error) boxes.push(errorBox('Không đọc được doanh thu', reportView.error));
      if (alertView.error) boxes.push(errorBox('Không đọc được cảnh báo', alertView.error));
      if (shiftView.error) boxes.push(errorBox('Không đọc được trạng thái ca', shiftView.error));

      var rev = reportView.data;
      var al = alertView.data;
      var sh = shiftView.data;
      function kcard(label, value, sub, tone) {
        return '<article class="kcard ' + (tone || '') + '"><div class="klabel">' + esc(label) +
          '</div><div class="kvalue">' + esc(value) + '</div><div class="ksub">' + esc(sub || '') + '</div></article>';
      }
      return head + boxes.join('') + '<div class="kgrid" id="todayGrid">' +
        kcard('Doanh thu thuần', rev ? money(rev.netRevenue) : money(0),
          rev ? rev.billCount + ' đơn' : 'Không có giao dịch', 'accent') +
        kcard('Số đơn', rev ? rev.billCount : 0, 'Trong ngày được chọn') +
        /* Hai mức nặng để RIÊNG: gộp thành "12 cảnh báo" là cách một DANGER
           biến mất giữa đám INFO. */
        kcard('Nghiêm trọng', al ? al.counts.DANGER : 0, 'Cần xử lý ngay', 'danger') +
        kcard('Cảnh báo', al ? al.counts.WARNING : 0, 'Cần theo dõi', 'warning') +
        kcard('Trạng thái ngày', sh && sh.operable ? 'Đang mở' : 'Đóng cửa',
          sh && sh.businessDate ? sh.businessDate : 'Không có ca bán hàng') +
        kcard('Đang trong ca', sh && sh.employeesOnShift ? sh.employeesOnShift.length : 0,
          'Nhân viên đã check-in') +
        '</div></section>';
    }

    function alertDetail(alert) {
      var data = alert.data || {};
      return Object.keys(data).sort().map(function (key) {
        var value = Array.isArray(data[key]) ? data[key].join(', ') : data[key];
        return key + ': ' + value;
      }).join(' · ');
    }

    function alertsScreen() {
      var d = alertView.data;
      var head = '<section id="screen-alerts-port"><div class="section-head"><div><p class="eyebrow">Ưu tiên vận hành</p>' +
        '<h2>Cảnh báo đang mở</h2></div><span class="status neutral">' +
        (d ? d.total + ' việc' : '—') + '</span></div>';
      if (alertView.loading) return head + '<div class="empty"><h3>Đang đọc cảnh báo…</h3></div></section>';
      if (alertView.error) return head + errorBox('Không đọc được cảnh báo', alertView.error) + '</section>';
      if (!d || !d.total) return head + '<div class="empty"><div class="empty-icon">✓</div>' +
        '<h3>Không có cảnh báo đang mở</h3></div></section>';
      var sections = ['DANGER', 'WARNING', 'INFO'].map(function (severity) {
        var items = d.buckets[severity] || [];
        if (!items.length) return '';
        var tone = severity === 'DANGER' ? 'danger' : (severity === 'WARNING' ? 'warning' : 'neutral');
        return '<h3 class="report-sub"><span class="status ' + tone + '">' + severity + '</span> ' +
          items.length + ' việc</h3><div class="card">' + items.map(function (alert) {
            return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(alert.type) +
              '</div><div class="lsub">' + esc(alertDetail(alert)) + '</div></div><div class="lmeta">' +
              esc(alert.businessDate || '') + '</div></article>';
          }).join('') + '</div>';
      }).join('');
      return head + sections + '</section>';
    }

    /* ---------- Truy vết ---------- */

    function traceMarkup() {
      if (traceView.loading) return '<div class="empty"><h3>Đang dựng timeline…</h3></div>';
      if (traceView.error) return errorBox('Không thể truy vết', traceView.error);
      if (!traceView.data) return '<div class="empty"><div class="empty-icon">⌕</div><h3>Chọn một Unit để điều tra</h3>' +
        '<p>Read Layer tự chọn LIVE hoặc snapshot lịch sử; màn hình không branch theo nguồn.</p></div>';
      return '<div class="card"><article class="litem"><div class="lmain"><div class="ltitle">Unit</div>' +
        '<div class="lsub">' + esc(traceView.data.unitId) + '</div></div></article>' +
        '<article class="litem"><div class="lmain"><div class="ltitle">Bill liên quan</div>' +
        '<div class="lsub">Theo allocation canonical</div></div><strong>' +
        esc((traceView.data.billIds || []).length) + '</strong></article>' +
        '<article class="litem"><div class="lmain"><div class="ltitle">Mẻ BTP liên quan</div>' +
        '<div class="lsub">Theo dependency registry</div></div><strong>' +
        esc((traceView.data.prepBatchIds || []).length) + '</strong></article></div>';
    }

    function traceScreen() {
      return '<section id="screen-trace-port"><div class="section-head"><div><p class="eyebrow">Truy vết hai chiều</p>' +
        '<h2>Unit → Bill / BTP / Waste</h2></div>' + frozenTag(traceView) + '</div><div class="search-row">' +
        '<form id="ql-unit-search" style="display:contents"><input name="code" aria-label="Mã Unit" ' +
        'placeholder="Nhập hoặc quét mã Unit" required><button>Tra cứu</button></form></div>' +
        traceMarkup() + '</section>';
    }

    function inventoryScreen() {
      var d = inventoryView.data;
      var body;
      if (inventoryView.loading) body = '<div class="empty"><h3>Đang đọc projection tồn kho…</h3></div>';
      else if (inventoryView.error) body = errorBox('Không đọc được tồn kho', inventoryView.error);
      else if (!d) body = '<div class="empty"><div class="empty-icon">▦</div><h3>Chọn một mặt hàng</h3>' +
        '<p>Tồn kho được đọc từ projection duy nhất của FIFO core.</p></div>';
      else body = '<div class="metric-grid">' + metric('Tồn hiện tại', d.currentStock) +
        metric('Unit còn niêm phong', d.breakdown.sealedQty) +
        metric('Unit đang mở', d.breakdown.openQty) +
        metric('Tồn chưa gắn Unit', d.breakdown.untrackedBase) +
        metric('Biến động chưa gắn Unit', d.breakdown.untrackedPendingDelta) + '</div>';
      return '<section id="screen-inventory-port"><div class="section-head"><div><p class="eyebrow">Kho canonical</p>' +
        '<h2>Tồn kho theo mặt hàng</h2></div>' + frozenTag(inventoryView) + '</div>' +
        '<form class="search-row" id="inventory-search"><input name="itemId" aria-label="Mã mặt hàng" ' +
        'placeholder="Nhập mã mặt hàng" required><button>Đọc tồn</button></form>' + body + '</section>';
    }

    /* ---------- Duyệt ---------- */

    function approvalsScreen() {
      var d = approvalView.data;
      var count = d ? d.items.length : 0;
      var head = '<section id="screen-inbox-port"><div class="section-head"><div><p class="eyebrow">Kiểm soát</p>' +
        '<h2>Hộp việc</h2></div><span class="status neutral">' +
        (approvalView.loading ? 'Đang đọc…' : count + ' việc') + '</span></div>';

      if (approvalView.error) return head + errorBox('Không đọc được danh sách duyệt', approvalView.error) + '</section>';
      if (approvalView.loading) return head + '<div class="empty"><h3>Đang đọc…</h3></div></section>';
      if (!d || !count) {
        return head + '<div class="empty"><div class="empty-icon">✓</div><h3>Không có việc chờ duyệt</h3>' +
          '<p>Kiểm kê, báo mất và chi phí chỉ được thay đổi qua command có audit.</p></div></section>';
      }

      var warn = d.unknownTypes.length
        /* Loại chưa khai không được dựng nút duyệt. Hiện ra để người ta biết có
           việc đang kẹt, thay vì im lặng bỏ qua. */
        ? '<div class="result error"><strong>' + esc(d.unknownTypes.length) +
          ' loại việc chưa khai báo command</strong><span>' + esc(d.unknownTypes.join(', ')) +
          ' — không dựng nút duyệt cho tới khi được khai.</span></div>'
        : '';

      var action = approvalAction.error
        ? errorBox('Không duyệt được', approvalAction.error)
        : (approvalAction.done ? '<div class="result"><strong>Đã duyệt ' + esc(approvalAction.done) + '</strong></div>' : '');

      return head + warn + action + '<div class="card" id="inboxBody">' + d.items.map(function (item, i) {
        return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(item.label) + '</div>' +
          '<div class="lsub">' + esc(item.referenceId) + '</div></div>' +
          '<div class="lmeta">' + esc(item.summary || '') + '</div>' +
          '<button class="btn primary" data-approve="' + i + '"' +
          (approvalAction.busy === item.referenceId ? ' disabled' : '') + '>' +
          esc(approvalAction.busy === item.referenceId ? 'Đang duyệt…' : 'Duyệt') + '</button></article>';
      }).join('') + '</div></section>';
    }

    /* ---------- Báo cáo ---------- */

    function cogsMarkup() {
      if (cogsView.loading) return '<div class="empty"><h3>Đang đọc COGS…</h3></div>';
      if (cogsView.error) return errorBox('Không đọc được COGS', cogsView.error);
      var c = cogsView.data;
      if (!c) return '';
      /* R8: luôn 2 vế. Thiếu vế thực tế thì hiện "chưa đủ", tuyệt đối không
         lấy lý thuyết đắp vào cho ô trông đầy. */
      var actual = c.cogsActual === null
        ? 'Chưa đủ (' + c.missingActual.length + ' đơn thiếu)'
        : money(c.cogsActual);
      return '<div class="metric-grid">' +
        metric('COGS lý thuyết', money(c.cogsTheoretical)) +
        metric('COGS thực tế', actual) +
        metric('Chênh lệch', c.variance === null ? '—' : money(c.variance)) +
        metric('Chênh lệch %', c.variancePct === null ? '—' : c.variancePct.toFixed(1) + '%') +
        '</div>';
    }

    function pnlMarkup() {
      if (pnlView.loading) return '<div class="empty"><h3>Đang đọc P&amp;L…</h3></div>';
      if (pnlView.error) return errorBox('Không đọc được P&L', pnlView.error);
      var p = pnlView.data;
      if (!p) return '';
      return '<div class="metric-grid">' +
        metric('Lãi gộp', money(p.grossProfit)) +
        /* Nói rõ lãi đang tính theo vế nào — legacy chỉ có một số nên không ai
           biết nó là số gì. */
        metric('Tính theo vế', p.cogsBasisUsed === 'ACTUAL' ? 'Thực tế' : 'Lý thuyết') +
        metric('Chi phí', money(p.expenses)) +
        metric('Lãi ròng', money(p.netProfit) + (p.hasEstimatedExpenses ? ' (còn khoản ước tính)' : '')) +
        '</div>';
    }

    function varianceMarkup() {
      if (varianceView.loading) return '<div class="empty"><h3>Đang đối chiếu giá vốn…</h3></div>';
      if (varianceView.error) return errorBox('Không đối chiếu được giá vốn', varianceView.error);
      var v = varianceView.data;
      if (!v) return '';
      var actual = v.cogsActual === null ? 'Chưa đủ dữ liệu lô' : money(v.cogsActual);
      var tone = v.status === 'OK' ? 'success' : (v.status === 'UNKNOWN' ? 'neutral' : 'warning');
      return '<h3 class="report-sub">Đối chiếu thực tế với định mức</h3>' +
        '<div class="section-head"><span class="status ' + tone + '">' + esc(v.status) + '</span>' +
        '<span>' + esc(v.message) + '</span></div><div class="metric-grid">' +
        metric('Giá vốn định mức', money(v.cogsTheoretical)) + metric('Giá vốn thực tế', actual) +
        metric('Chênh lệch', v.variance === null ? '—' : money(v.variance)) +
        metric('Chênh lệch %', v.variancePct === null ? '—' : Number(v.variancePct).toFixed(1) + '%') +
        '</div>' + (v.possibleCauses && v.possibleCauses.length
          ? '<div class="result"><strong>Cần điều tra</strong><span>' +
            esc(v.possibleCauses.join(' · ')) + '</span></div>' : '');
    }

    function usageMarkup() {
      if (usageView.loading) return '<div class="empty"><h3>Đang đọc hao hụt…</h3></div>';
      if (usageView.error) return errorBox('Không đọc được hao hụt/tiêu thụ', usageView.error);
      var u = usageView.data;
      if (!u) return '';
      if (!u.rows.length) return '<div class="result"><span>Kỳ này không có bút toán kho nào.</span></div>';
      return '<h3 class="report-sub">Tiêu thụ · hao hụt · mất</h3>' +
        '<table class="report"><thead><tr><th>Mặt hàng</th><th>Nhập</th><th>Dùng</th>' +
        '<th>Hao</th><th>Mất</th><th>Chưa gắn lô</th></tr></thead><tbody>' +
        u.rows.map(function (r) {
          return '<tr><td>' + esc(r.itemName || r.itemId) + '</td><td>' + esc(r.received) +
            '</td><td>' + esc(r.consumed) + '</td><td>' + esc(r.waste) + '</td><td>' +
            /* Mất và tìm lại hiện cùng nhau: "mất 10 tìm lại 10" khác hẳn
               "không mất gì", gộp lại là xoá mất một sự kiện có thật. */
            esc(r.lost) + (r.found ? ' (tìm lại ' + esc(r.found) + ')' : '') +
            '</td><td>' + esc(r.untrackedQty) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        (u.unknownTypes.length
          ? '<div class="result error"><strong>Có loại bút toán chưa khai</strong><span>' +
            esc(u.unknownTypes.join(', ')) + ' — số của các dòng này KHÔNG nằm trong bảng trên.</span></div>'
          : '');
    }

    function lossMarkup() {
      if (lossView.loading) return '<div class="empty"><h3>Đang đọc hao hụt và mất…</h3></div>';
      if (lossView.error) return errorBox('Không đọc được hao hụt và mất', lossView.error);
      var l = lossView.data;
      if (!l) return '';
      return '<h3 class="report-sub">Hao hụt và mất</h3><div class="metric-grid">' +
        metric('Hao hụt', l.totalWaste) + metric('Báo mất', l.totalLost) +
        metric('Đã tìm lại', l.totalFound) + metric('Mất ròng', l.netLost) + '</div>' +
        (!l.rows.length ? '<div class="result"><span>Kỳ này không có hao hụt hoặc báo mất.</span></div>' :
          '<table class="report"><thead><tr><th>Mặt hàng</th><th>Hao hụt</th><th>Báo mất</th>' +
          '<th>Tìm lại</th><th>Unit liên quan</th></tr></thead><tbody>' + l.rows.map(function (row) {
            return '<tr><td>' + esc(row.itemName || row.itemId) + '</td><td>' + esc(row.waste) +
              '</td><td>' + esc(row.lost) + '</td><td>' + esc(row.found) + '</td><td>' +
              esc((row.unitIds || []).join(', ') || 'Chưa gắn Unit') + '</td></tr>';
          }).join('') + '</tbody></table>');
    }

    function valuationMarkup() {
      if (valuationView.loading) return '<div class="empty"><h3>Đang định giá tồn…</h3></div>';
      if (valuationView.error) return errorBox('Không định giá được tồn kho', valuationView.error);
      var v = valuationView.data;
      if (!v) return '';
      return '<h3 class="report-sub">Giá trị tồn kho</h3><div class="metric-grid">' +
        metric('Giá trị theo lô thật', money(v.trackedValue)) +
        metric('Số lượng có lô', v.trackedQty) +
        /* Phần không có lô dùng cơ sở giá KHÁC — nói ra ngay cạnh số, không để
           dưới chú thích cuối trang. */
        metric('Tồn chưa gắn lô', v.untrackedQty) +
        metric('Giá trị phần chưa gắn lô',
          v.untrackedValue === null ? 'Không định giá được' : money(v.untrackedValue)) +
        '</div>';
    }

    function exportMarkup() {
      if (exportView.busy) return '<div class="result"><span>Đang dựng file…</span></div>';
      if (exportView.error) return errorBox('Không xuất được báo cáo', exportView.error);
      if (!exportView.file) return '';
      return '<div class="result"><strong>Đã dựng file ' + esc(exportView.file.title) + '</strong>' +
        '<span>' + esc(exportView.file.rowCount) + ' dòng · kỳ ' + esc(exportView.file.period) + '</span>' +
        exportView.file.notices.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') +
        '</div>';
    }

    function reportsScreen() {
      var r = reportView.data;
      var selectedDate = lastPeriod || clock.calendarDate();
      var channels = r && r.byChannel ? Object.keys(r.byChannel).sort().map(function (name) {
        var c = r.byChannel[name];
        return '<tr><td>' + esc(name) + '</td><td>' + esc(c.billCount) + '</td><td>' +
          money(c.gross) + '</td><td>' + money(c.fees) + '</td><td>' + money(c.net) + '</td></tr>';
      }).join('') : '';
      var comparison = compareView.loading ? '<div class="empty"><h3>Đang so sánh hai kỳ…</h3></div>' :
        compareView.error ? errorBox('Không so sánh được hai kỳ', compareView.error) :
        compareView.data ? '<div class="metric-grid">' +
          metric('Kỳ trước · lãi ròng', money(compareView.data.previous.data.netProfit)) +
          metric('Kỳ hiện tại · lãi ròng', money(compareView.data.current.data.netProfit)) +
          metric('Kỳ trước', compareView.data.previous.frozen ? 'Đã chốt' : 'Số sống') +
          metric('Kỳ hiện tại', compareView.data.current.frozen ? 'Đã chốt' : 'Số sống') + '</div>' +
          (compareView.data.bothLive ? '<div class="notice"><strong>Cả hai kỳ đều là số sống</strong>' +
            '<span>Kết quả có thể thay đổi khi dữ liệu mới được ghi.</span></div>' : '') : '';
      return '<section id="screen-report-port"><div class="section-head"><div><p class="eyebrow">Sổ sách</p>' +
        '<h2>Doanh thu · COGS · P&amp;L</h2></div>' + frozenTag(reportView) +
        '<button class="btn primary" id="ql-export"' + (usageView.data ? '' : ' disabled') + '>Xuất báo cáo</button></div>' +
        '<form class="filter-bar" id="revenue-search"><input type="date" name="date" value="' +
        esc(selectedDate) + '" required><button class="btn">Đọc báo cáo</button></form>' +
        (reportView.loading ? '<div class="empty"><h3>Đang đọc báo cáo…</h3></div>' :
          reportView.error ? errorBox('Không đọc được báo cáo', reportView.error) :
          '<div class="metric-grid">' +
            metric('Doanh thu thuần', r ? money(r.netRevenue) : '—') +
            metric('Số đơn', r ? r.billCount : '—') +
            metric('Phí kênh', r ? money(r.channelFees) : '—') +
            metric('Giảm giá', r ? money(r.discountTotal) : '—') +
          '</div>' + (channels ? '<h3 class="report-sub">Doanh thu theo kênh</h3><table class="report">' +
            '<thead><tr><th>Kênh</th><th>Số đơn</th><th>Doanh thu gộp</th><th>Phí</th><th>Doanh thu thuần</th>' +
            '</tr></thead><tbody>' + channels + '</tbody></table>' : '')) +
        '<h3 class="report-sub">So sánh hai kỳ</h3><form class="filter-bar" id="compare-periods">' +
          '<label>Kỳ trước <input type="date" name="previous" required></label>' +
          '<label>Kỳ hiện tại <input type="date" name="current" value="' + esc(selectedDate) + '" required></label>' +
          '<button class="btn">So sánh</button></form>' + comparison +
        cogsMarkup() + varianceMarkup() + pnlMarkup() + lossMarkup() + usageMarkup() +
        valuationMarkup() + exportMarkup() + '</section>';
    }

    /* BTP chỉ trình bày số do core trả về, không suy ngược sản lượng từ tồn kho. */
    function btpScreen() {
      var selectedDate = lastPeriod || clock.calendarDate();
      var b = btpView.data;
      var body;
      if (btpView.loading) body = '<div class="empty"><h3>Đang đọc sổ BTP…</h3></div>';
      else if (btpView.error) body = errorBox('Không đọc được sổ BTP', btpView.error);
      else if (!b || !b.rows || !b.rows.length) {
        body = '<div class="empty"><div class="empty-icon">◎</div><h3>Không có mẻ BTP trong ngày</h3>' +
          '<p>Bảng chỉ hiện các mẻ mà core đã ghi nhận.</p></div>';
      } else {
        body = '<div class="metric-grid">' + metric('Đã nấu', b.total.nau) +
          metric('Đã dùng', b.total.dung) + metric('Đã hủy', b.total.huy) +
          metric('Chi phí hủy', money(b.total.huyCost)) + '</div>' +
          '<table class="report"><thead><tr><th>Ngày</th><th>Số mẻ</th><th>Nấu</th><th>Đã dùng</th>' +
          '<th>Hủy</th><th>Tỷ lệ hủy</th><th>Chi phí hủy</th></tr></thead><tbody>' +
          b.rows.map(function (row) {
            return '<tr><td>' + esc(row.dateKey) + '</td><td>' + esc(row.batchCount) + '</td><td>' +
              esc(row.nau) + '</td><td>' + esc(row.dung) + '</td><td>' + esc(row.huy) +
              '</td><td>' + (row.huyPct === null ? '—' : esc(Number(row.huyPct).toFixed(1)) + '%') + '</td><td>' +
              money(row.huyCost) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      var exported = btpExportView.error ? errorBox('Không xuất được sổ BTP', btpExportView.error) :
        btpExportView.file ? '<div class="result"><strong>Đã dựng file ' + esc(btpExportView.file.title) +
          '</strong><span>' + esc(btpExportView.file.rowCount) + ' dòng</span></div>' : '';
      return '<section id="screen-btp-port"><div class="section-head"><div><p class="eyebrow">Sản xuất</p>' +
        '<h2>Sổ bán thành phẩm</h2></div>' + frozenTag(btpView) +
        '<button class="btn primary" id="btp-export"' + (b && b.rows && b.rows.length ? '' : ' disabled') + '>' +
        (btpExportView.busy ? 'Đang xuất…' : 'Xuất báo cáo') + '</button></div>' +
        '<form class="filter-bar" id="btp-search"><input type="date" name="date" value="' +
        esc(selectedDate) + '" required><button class="btn">Đọc sổ BTP</button></form>' + body + exported + '</section>';
    }

    /* ---------- Lịch sử bill ----------
     * Port từ quanlygieo.html#renderBills (LỊCH SỬ ĐƠN — xem comment gốc ở đó):
     * nhân viên vẫn cộng tay được doanh thu ngày qua tab Lịch sử của POS, nên
     * quyền xem/tìm/xoá bill chuyển hẳn về Quản lý. Giữ đúng bố cục gốc (nhóm
     * theo ngày, badge SHIP/APP/BỔ SUNG, thẻ hoá đơn) qua các class `.pos-clone`
     * đã có sẵn trong CSS của chính quanlygieo.html. Xoá bill KHÔNG còn tự chạy
     * lại engine định mức để hoàn kho (qlReverseStockForOrder) — hoàn qua
     * ReverseTransaction theo đúng phân bổ gốc đọc từ ledger (§3.8); bill trước
     * cutover không truy được Unit thật (xem canonical-data-source.js) nên hoàn
     * thành việc-chờ-rà-tay (manualReviewTask), không phải lỗi.
     */

    function billBadges(bill) {
      var ls = bill.legacySource || {};
      var channelType = bill.channel && bill.channel.type;
      var isSplit = ls.method === 'TÍNH RIÊNG' || !!(ls.splitGroups && ls.splitGroups.length);
      var isBank = (ls.method || '').indexOf('CHUYỂN KHOẢN') !== -1 ||
        !!(ls.splitGroups && ls.splitGroups.some(function (g) { return g && g.method === 'CHUYỂN KHOẢN'; }));
      return {
        isShip: !!ls.isShip,
        isApp: channelType === 'APP',
        hasAddons: !!(ls.addons && ls.addons.length),
        isSplit: isSplit,
        isBank: isBank,
        cls: isSplit ? ' split-order' : (isBank ? ' bank-order' : (channelType === 'APP' ? ' app-order' : ''))
      };
    }

    function billQtyTotal(bill) {
      return (bill.lines || []).reduce(function (a, l) { return a + (Number(l.qty) || 0); }, 0);
    }

    function billMatchesQuery(bill, q) {
      if (!q) return true;
      var ls = bill.legacySource || {};
      return String(bill.total || '').indexOf(q) !== -1 ||
        (!!ls.phone && ls.phone.indexOf(q) !== -1) ||
        (!!ls.billCode && String(ls.billCode).toLowerCase().indexOf(q) !== -1) ||
        (!!ls.bankOrderId && String(ls.bankOrderId).toLowerCase().indexOf(q) !== -1);
    }

    function billListItem(bill) {
      var ls = bill.legacySource || {};
      var b = billBadges(bill);
      var shipBadge = b.isShip ? '<span class="status warning">SHIP</span> ' : '';
      var appBadge = b.isApp ? '<span class="status success">APP</span> ' : '';
      var addonBadge = b.hasAddons ? '<span class="status neutral">BỔ SUNG</span> ' : '';
      var bankCodes = b.isSplit && ls.splitGroups
        ? ls.splitGroups.filter(function (g) { return g && g.method === 'CHUYỂN KHOẢN' && g.bankOrderId; })
          .map(function (g) { return g.bankOrderId; })
        : (b.isBank && ls.bankOrderId ? [ls.bankOrderId] : []);
      return '<button class="hit' + b.cls + '" data-bill-open="' + esc(bill.billId) + '">' +
        '<div class="hii"></div><div class="hin"><div class="hitime">' + esc(ls.time || '') + ' ' +
        shipBadge + appBadge + addonBadge + '</div><div class="himeta">' +
        (bankCodes.length ? '🏦 ' + esc(bankCodes.join(', ')) + ' · ' : '') +
        (ls.billCode ? esc(ls.billCode) + ' · ' : '') +
        esc(ls.phone || 'Khách vãng lai') + '</div></div>' +
        '<div style="text-align:right;flex-shrink:0;min-width:110px;"><div class="hip">' +
        money(bill.total) + '</div><div class="him">' + esc(ls.method || '') + '</div></div></button>';
    }

    function billListMarkup() {
      if (billsView.loading) return '<div class="pc-empty">Đang đọc bill…</div>';
      if (billsView.error) return errorBox('Không đọc được bill', billsView.error);
      var all = (billsView.data && billsView.data.bills) || [];
      var q = (billsUI.query || '').trim().toLowerCase();
      var filtered = all.filter(function (bill) { return billMatchesQuery(bill, q); });
      if (!filtered.length) return '<div class="pc-empty">Không có đơn hàng</div>';
      var total = filtered.reduce(function (a, bill) { return a + (Number(bill.total) || 0); }, 0);
      var grp = {};
      filtered.forEach(function (bill) {
        var k = bill.businessDate || 'Chưa rõ ngày';
        (grp[k] || (grp[k] = [])).push(bill);
      });
      return '<div class="pc-sum"><span>' + filtered.length + ' đơn</span><b>' + money(total) + '</b></div>' +
        Object.keys(grp).sort().reverse().map(function (d) {
          return '<div class="hdg"><div class="hdl">' + esc(d) + '</div>' +
            grp[d].map(billListItem).join('') + '</div>';
        }).join('');
    }

    function billDetailMarkup(bill) {
      var ls = bill.legacySource || {};
      var qty = billQtyTotal(bill);
      var lines = (bill.lines || []).map(function (l, i) {
        return '<article class="litem"><div class="lmain"><div class="ltitle">' + (i + 1) + '. ' +
          esc(l.name || '') + (l.qty > 1 ? ' ×' + esc(l.qty) : '') + '</div><div class="lsub">' +
          esc(l.size || '') + (l.isFree ? ' · Miễn phí' : '') + '</div></div><div class="lmeta">' +
          money((l.price || 0) * (l.qty || 1)) + '</div></article>';
      }).join('');

      var addons = (ls.addons && ls.addons.length)
        ? '<h3 class="report-sub">Đã bổ sung sau khi bấm bill</h3><div class="card">' +
          ls.addons.map(function (ad) {
            return '<article class="litem"><div class="lmain"><div class="ltitle">Ly ' + esc(ad.seq) + '/' +
              esc(ad.totalCups) + ' · ' + esc(ad.itemName || '') + '</div><div class="lsub">' +
              esc(ad.staff || '') + ' · ' + esc(ad.method || '') + '</div></div><div class="lmeta">' +
              money(ad.amount) + '</div></article>';
          }).join('') + '</div>'
        : '';

      var payment = (ls.method === 'TÍNH RIÊNG' && ls.splitGroups && ls.splitGroups.length)
        ? '<div class="metric-grid">' + ls.splitGroups.map(function (g) {
          return metric(g.method || '—', money(g.total));
        }).join('') + '</div>'
        : '<div class="metric-grid">' +
          metric('Khách đưa', money(ls.cashGiven !== null && ls.cashGiven !== undefined ? ls.cashGiven : bill.total)) +
          metric('Tiền thừa', money(ls.cashChange || 0)) + '</div>';

      var delBlock;
      if (billsDelete.confirmId === bill.billId) {
        delBlock = '<div class="result error"><strong>Xoá bill này?</strong>' +
          '<span>Nguyên liệu sẽ được hoàn về kho đúng theo sổ đã ghi lúc bán. ' +
          'Điểm/tem/voucher đã cộng cho khách KHÔNG tự thu hồi. Thao tác không hoàn tác được.</span>' +
          '<span>' + esc(qty) + ' món · ' + money(bill.total) + '</span></div>' +
          '<div class="search-row"><button class="btn outline" id="bills-del-cancel"' +
          (billsDelete.busy ? ' disabled' : '') + '>Huỷ</button>' +
          '<button class="btn danger" id="bills-del-go"' + (billsDelete.busy ? ' disabled' : '') + '>' +
          (billsDelete.busy ? 'Đang xoá…' : 'Xoá bill') + '</button></div>';
      } else {
        delBlock = (billsDelete.error ? errorBox('Không xoá được bill', billsDelete.error) : '') +
          '<button class="btn danger" id="bills-del-ask" data-bill-id="' + esc(bill.billId) + '">Xoá bill</button>' +
          '<p style="color:var(--muted);font-size:12px;margin-top:6px">' +
          'Xoá đơn sẽ hoàn nguyên liệu về kho đúng bằng số đã trừ lúc bán. ' +
          'Điểm/tem/voucher đã cộng cho khách thì không tự thu hồi.</p>';
      }

      return '<section id="screen-bill-detail-port"><div class="section-head">' +
        '<button class="btn outline" id="bills-back">← Danh sách</button><div><p class="eyebrow">' +
        esc(bill.businessDate || '') + (ls.time ? ' · ' + esc(ls.time) : '') + '</p><h2>' +
        esc(ls.billCode || bill.billId) + '</h2></div></div>' +
        '<div class="metric-grid">' + metric('Khách', ls.phone || 'Khách vãng lai') +
        metric('Thanh toán', ls.method || '—') +
        metric('Kênh', (bill.channel && bill.channel.type) || '—') + '</div>' +
        '<h3 class="report-sub">Món (' + esc(qty) + ')</h3><div class="card">' +
        (lines || '<div class="pc-empty">Không có dòng món</div>') + '</div>' + addons +
        '<h3 class="report-sub">Thanh toán</h3>' + payment +
        '<div class="metric-grid">' + metric('Tổng bill', money(bill.total)) + '</div>' + delBlock + '</section>';
    }

    function billsScreen() {
      if (billsUI.openId) {
        var all = (billsView.data && billsView.data.bills) || [];
        var bill = all.filter(function (b) { return b.billId === billsUI.openId; })[0];
        if (!bill) return '<section><div class="pc-empty">Bill không còn tồn tại (có thể vừa bị xoá).</div>' +
          '<button class="btn outline" id="bills-back">← Danh sách</button></section>';
        return billDetailMarkup(bill);
      }
      var notice = billsNotice ? '<div class="result"><span>' + esc(billsNotice) + '</span></div>' : '';
      return '<section id="screen-bills-port"><div class="section-head"><div><p class="eyebrow">Lịch sử đơn</p>' +
        '<h2>Lịch sử bill</h2></div>' + frozenTag(billsView) + '</div>' +
        '<form class="filter-bar" id="bills-range"><input type="date" name="from" value="' +
        esc(billsUI.from) + '" required><input type="date" name="to" value="' + esc(billsUI.to) +
        '" required><button class="btn">Xem</button></form>' +
        '<form class="search-row" id="bills-search"><input type="text" name="q" value="' +
        esc(billsUI.query) + '" placeholder="Tìm theo số tiền, SĐT, mã bill..."><button class="btn">Tìm</button></form>' +
        notice + '<div class="pos-clone">' + billListMarkup() + '</div></section>';
    }

    /* ---------- Kho — danh mục cấu hình đơn giản + đặt hàng + lịch sử ---------- */

    var KHO_TABS = ['inbox'].concat(KHO_CONFIG_ORDER, ['containers', 'packaging', 'purchaseOrder', 'history']);

    function khoTabLabel(tab) {
      if (tab === 'inbox') return 'Cần xử lý';
      if (tab === 'containers') return 'Hàng đang mở';
      if (tab === 'packaging') return 'Bao bì';
      if (tab === 'purchaseOrder') return 'Đặt hàng';
      if (tab === 'history') return 'Lịch sử kho';
      return KHO_CONFIG_SCHEMAS[tab].title;
    }

    /**
     * "Kho → Cần xử lý" — thay renderKhoInbox() legacy (zone==='kho' + tier
     * red/yellow). Lọc alertView theo KHO_ALERT_TYPES, tái dùng alertDetail()
     * và bố cục bucket DANGER/WARNING/INFO như alertsScreen().
     */
    function khoInboxMarkup() {
      var quickLinks = '<div class="search-row" style="flex-wrap:wrap;margin-top:12px">' +
        '<button class="btn outline" data-kho-tab="containers">Hàng đang mở</button>' +
        '<button class="btn outline" data-kho-tab="purchaseOrder">Đặt hàng</button>' +
        '<button class="btn outline" data-screen="APPROVALS">Duyệt kiểm kê</button>' +
        '<button class="btn outline" data-kho-tab="history">Lịch sử kho</button></div>';
      if (alertView.loading) return '<div class="empty"><h3>Đang đọc cảnh báo…</h3></div>' + quickLinks;
      if (alertView.error) return errorBox('Không đọc được cảnh báo', alertView.error) + quickLinks;
      var d = alertView.data;
      var buckets = d && d.buckets ? d.buckets : {};
      var khoBuckets = ['DANGER', 'WARNING', 'INFO'].reduce(function (acc, sev) {
        acc[sev] = (buckets[sev] || []).filter(function (a) { return KHO_ALERT_TYPES[a.type]; });
        return acc;
      }, {});
      var total = khoBuckets.DANGER.length + khoBuckets.WARNING.length + khoBuckets.INFO.length;
      if (!total) return '<div class="empty"><div class="empty-icon">✓</div>' +
        '<h3>Không có việc cần xử lý ở Kho</h3></div>' + quickLinks;
      var sections = ['DANGER', 'WARNING', 'INFO'].map(function (severity) {
        var items = khoBuckets[severity];
        if (!items.length) return '';
        var tone = severity === 'DANGER' ? 'danger' : (severity === 'WARNING' ? 'warning' : 'neutral');
        return '<h3 class="report-sub"><span class="status ' + tone + '">' + severity + '</span> ' +
          items.length + ' việc</h3><div class="card">' + items.map(function (alert) {
            return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(alert.type) +
              '</div><div class="lsub">' + esc(alertDetail(alert)) + '</div></div><div class="lmeta">' +
              esc(alert.businessDate || '') + '</div></article>';
          }).join('') + '</div>';
      }).join('');
      return sections + quickLinks;
    }

    function khoConfigView(kind) {
      if (!khoConfigViews[kind]) khoConfigViews[kind] = view();
      return khoConfigViews[kind];
    }

    function khoTabBar() {
      return '<div class="search-row" style="flex-wrap:wrap">' + KHO_TABS.map(function (t) {
        return '<button class="btn ' + (khoUI.tab === t ? 'primary' : 'outline') +
          '" data-kho-tab="' + t + '">' + esc(khoTabLabel(t)) + '</button>';
      }).join('') + '</div>';
    }

    function khoConfigFormMarkup(kind) {
      var schema = KHO_CONFIG_SCHEMAS[kind];
      var editing = khoForm.editingId;
      return '<form id="kho-config-form" class="card" style="padding:16px;margin-top:12px">' +
        '<h3 class="report-sub">' + (editing ? 'Sửa' : 'Thêm') + ' ' + esc(schema.title) + '</h3>' +
        (khoForm.error ? errorBox('Không lưu được', khoForm.error) : '') +
        schema.fields.map(function (f) {
          var val = khoForm.values[f.key];
          if (f.type === 'checkbox') {
            return '<label style="display:block;margin:8px 0"><input type="checkbox" name="' + f.key + '"' +
              (val ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
          }
          return '<label style="display:block;margin:8px 0">' + esc(f.label) + (f.required ? ' *' : '') +
            '<input name="' + f.key + '" type="' + (f.type === 'number' ? 'number' : 'text') + '" value="' +
            esc(val === undefined || val === null ? '' : val) + '"' + (f.required ? ' required' : '') +
            ' style="display:block;width:100%;margin-top:4px"></label>';
        }).join('') +
        '<div class="search-row" style="margin-top:12px">' +
        '<button class="btn primary" type="submit"' + (khoForm.busy ? ' disabled' : '') + '>' +
        (khoForm.busy ? 'Đang lưu…' : 'Lưu') + '</button>' +
        (editing ? '<button class="btn outline" type="button" id="kho-form-cancel">Huỷ sửa</button>' : '') +
        '</div></form>';
    }

    function khoConfigListMarkup(kind) {
      var v = khoConfigView(kind);
      var schema = KHO_CONFIG_SCHEMAS[kind];
      if (v.loading) return '<div class="pc-empty">Đang đọc…</div>';
      if (v.error) return errorBox('Không đọc được ' + schema.title, v.error);
      var entries = (v.data && v.data.entries) || [];
      if (!entries.length) return '<div class="empty"><h3>Chưa có ' + esc(schema.title.toLowerCase()) + '</h3></div>';
      return '<div class="card" style="margin-top:12px">' + entries.map(function (e) {
        var title = e[schema.titleField] || e.id;
        return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(title) +
          (e.active === false ? ' <span class="status neutral">Đã ẩn</span>' : '') + '</div>' +
          '<div class="lsub">' + esc(e.id) + '</div></div>' +
          '<button class="btn outline" data-kho-edit="' + esc(e.id) + '" data-kho-kind="' + kind + '">Sửa</button>' +
          '<button class="btn ' + (e.active === false ? 'outline' : 'danger') + '" data-kho-toggle="' + esc(e.id) +
          '" data-kho-kind="' + kind + '">' + (e.active === false ? 'Bật lại' : 'Ẩn') + '</button></article>';
      }).join('') + '</div>';
    }

    function khoPOFormMarkup() {
      return '<form id="kho-po-form" class="card" style="padding:16px;margin-top:12px">' +
        '<h3 class="report-sub">Tạo đơn đặt hàng</h3>' +
        (khoPOForm.error ? errorBox('Không tạo được đơn', khoPOForm.error) : '') +
        '<label style="display:block;margin:8px 0">Nhà cung cấp *<input name="supplier" required ' +
        'style="display:block;width:100%;margin-top:4px"></label>' +
        '<label style="display:block;margin:8px 0">Danh sách hàng (mỗi dòng một mặt hàng)' +
        '<textarea name="items" rows="3" style="display:block;width:100%;margin-top:4px"></textarea></label>' +
        '<label style="display:block;margin:8px 0">Ghi chú<input name="note" ' +
        'style="display:block;width:100%;margin-top:4px"></label>' +
        '<button class="btn primary" type="submit"' + (khoPOForm.busy ? ' disabled' : '') + '>' +
        (khoPOForm.busy ? 'Đang tạo…' : 'Tạo đơn') + '</button></form>';
    }

    function khoPOListMarkup() {
      if (khoPOView.loading) return '<div class="pc-empty">Đang đọc…</div>';
      if (khoPOView.error) return errorBox('Không đọc được đơn đặt hàng', khoPOView.error);
      var entries = ((khoPOView.data && khoPOView.data.entries) || []).slice().sort(function (a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
      if (!entries.length) return '<div class="empty"><h3>Chưa có đơn đặt hàng</h3></div>';
      var toneOf = { pending: 'warning', cancelled: 'neutral' };
      return '<div class="card" style="margin-top:12px">' + entries.map(function (po) {
        var lines = (po.lines || []).map(function (l) { return l.label; }).join(', ');
        return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(po.supplier) +
          ' <span class="status ' + (toneOf[po.status] || 'success') + '">' + esc(po.status) + '</span></div>' +
          '<div class="lsub">' + esc(lines || po.note || '') + '</div></div>' +
          (po.status === 'pending'
            ? '<button class="btn danger" data-po-cancel="' + esc(po.purchaseOrderId) + '">Huỷ đơn</button>' : '') +
          '</article>';
      }).join('') + '</div>';
    }

    var KHO_CONTAINER_FILTERS = ['ALL', 'OPEN', 'NEEDS_REVIEW', 'LOST'];
    var KHO_CONTAINER_FILTER_LABEL = { ALL: 'Tất cả', OPEN: 'Đang mở', NEEDS_REVIEW: 'Cần rà', LOST: 'Báo mất' };
    var KHO_STATUS_LABEL = {
      SEALED: 'Còn niêm', OPEN: 'Đang mở', CONSUMING: 'Đang dùng', LOST: 'Báo mất'
    };

    /**
     * Kho — hàng đang mở & tem (thay legacy renderKhoContainers()). Unit mới
     * không có field expiresAt/labelPrinted như legacy (fifo-core/unit.js
     * không lưu hai field này) — không bịa ra tab "Quá hạn"/"Tem chưa dán",
     * chỉ hiển thị field THẬT có: status/needsReview/remainingQty. "Tìm lại
     * được" tái dùng RestoreFoundContainer đã có sẵn (chưa từng có UI gọi).
     */
    function khoContainersMarkup() {
      var filterBar = '<div class="search-row" style="flex-wrap:wrap;margin-bottom:12px">' +
        KHO_CONTAINER_FILTERS.map(function (f) {
          return '<button class="btn ' + (khoContainersFilter === f ? 'primary' : 'outline') +
            '" data-kho-ctn-filter="' + f + '">' + esc(KHO_CONTAINER_FILTER_LABEL[f]) + '</button>';
        }).join('') + '</div>';
      if (khoContainersView.loading) return filterBar + '<div class="pc-empty">Đang đọc…</div>';
      if (khoContainersView.error) return filterBar + errorBox('Không đọc được danh sách hàng đang mở', khoContainersView.error);
      var all = (khoContainersView.data && khoContainersView.data.units) || [];
      var units = all.filter(function (u) {
        if (khoContainersFilter === 'OPEN') return u.status === 'OPEN' || u.status === 'CONSUMING';
        if (khoContainersFilter === 'NEEDS_REVIEW') return !!u.needsReview;
        if (khoContainersFilter === 'LOST') return u.status === 'LOST';
        return true;
      });
      var actionMsg = khoContainersAction.error
        ? errorBox('Không thực hiện được', khoContainersAction.error) : '';
      if (!units.length) return filterBar + actionMsg + '<div class="empty"><h3>Không có Unit ở nhóm này</h3></div>';
      var rows = units.map(function (u) {
        var tone = u.status === 'LOST' ? 'danger' : (u.needsReview ? 'warning' : 'neutral');
        var action = u.status === 'LOST'
          ? '<button class="btn primary" data-restore-found="' + esc(u.unitId) + '"' +
            (khoContainersAction.busy === u.unitId ? ' disabled' : '') + '>' +
            esc(khoContainersAction.busy === u.unitId ? 'Đang xử lý…' : 'Tìm lại được') + '</button>'
          : '<button class="btn outline" data-container-trace="' + esc(u.unitId) + '">Truy vết</button>';
        return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(u.itemId) +
          ' <span class="status ' + tone + '">' + esc(KHO_STATUS_LABEL[u.status] || u.status) + '</span>' +
          (u.needsReview ? ' <span class="status warning">Cần rà</span>' : '') + '</div>' +
          '<div class="lsub">Còn ' + esc(u.remainingQty) + '/' + esc(u.initialQty) +
          ' · mở ' + esc(u.openedAt || '—') + ' · nhận ' + esc(u.receivedAt || '—') + '</div></div>' +
          action + '</article>';
      }).join('');
      return filterBar + actionMsg + '<div class="card">' + rows + '</div>';
    }

    /**
     * Kho — Bao bì (thay legacy renderKhoPackaging()/PACKAGING_PRESETS). Đợt
     * này CHỈ bản MẶC ĐỊNH toàn quán (subjectId '__default__', áp cho mọi
     * món chưa khai riêng) — bao bì riêng theo món (packaging_item_overrides
     * cũ) và túi/khay theo bill (rules/bagging) CHƯA xây ở màn này, xem
     * comment `bootstrap/canonical-data-source.js#hydrateForPublishPackaging`
     * cho lý do (liệt kê mọi subjectId của 1 kind đòi khả năng đọc mới, chưa
     * có). Danh sách nhập tay theo dòng "itemId,số lượng,ghi chú" — cùng lối
     * nhập tay itemId đã dùng ở refillRule (KHO_CONFIG_SCHEMAS), vì màn quản
     * lý danh mục nguyên liệu (item #4, "Nguyên liệu") chưa xây.
     */
    function khoPackagingMarkup() {
      var scopeNote = '<div class="result"><strong>Phạm vi đợt này</strong><span>Chỉ bao bì MẶC ĐỊNH ' +
        'áp cho mọi món chưa khai riêng — bao bì riêng theo món, túi/khay theo bill chưa có ở màn này.</span></div>';
      if (khoPackagingView.loading) return scopeNote + '<div class="pc-empty">Đang đọc…</div>';
      if (khoPackagingView.error) return scopeNote + errorBox('Không đọc được bao bì', khoPackagingView.error);
      var d = khoPackagingView.data;
      var current = d && d.current;
      var currentBlock = current
        ? '<div class="card" style="padding:16px;margin:12px 0"><h3 class="report-sub">Đang áp dụng từ ' +
          esc(new Date(current.effectiveFrom).toLocaleString('vi-VN')) + '</h3>' +
          '<table class="report"><thead><tr><th>Mã nguyên liệu</th><th>SL</th><th>Ghi chú</th></tr></thead><tbody>' +
          (current.payload.items || []).map(function (it) {
            return '<tr><td>' + esc(it.itemId) + '</td><td>' + esc(it.qty) + '</td><td>' + esc(it.note || '') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty"><h3>Chưa khai bao bì mặc định</h3></div>';
      var history = (d && d.history) || [];
      var historyBlock = history.length > 1
        ? '<h3 class="report-sub">Lịch sử</h3><div class="card">' +
          history.slice().reverse().slice(1).map(function (v) {
            return '<article class="litem"><div class="lmain"><div class="ltitle">' +
              esc(new Date(v.effectiveFrom).toLocaleString('vi-VN')) + '</div><div class="lsub">' +
              esc((v.payload.items || []).map(function (it) { return it.itemId + ' x' + it.qty; }).join(', ')) +
              '</div></div></article>';
          }).join('') + '</div>'
        : '';
      return scopeNote + currentBlock + khoPackagingFormMarkup() + historyBlock;
    }

    function khoPackagingFormMarkup() {
      return '<form id="kho-packaging-form" class="card" style="padding:16px;margin-top:12px">' +
        '<h3 class="report-sub">Khai bao bì mặc định mới</h3>' +
        (khoPackagingForm.error ? errorBox('Không lưu được', khoPackagingForm.error) : '') +
        '<label style="display:block;margin:8px 0">Danh sách (mỗi dòng: mã nguyên liệu,số lượng,ghi chú)' +
        '<textarea name="items" rows="4" placeholder="item_xxx,1,Ly nhựa size M" required ' +
        'style="display:block;width:100%;margin-top:4px"></textarea></label>' +
        '<button class="btn primary" type="submit"' + (khoPackagingForm.busy ? ' disabled' : '') + '>' +
        (khoPackagingForm.busy ? 'Đang lưu…' : 'Áp dụng từ bây giờ') + '</button></form>';
    }

    function khoHistoryMarkup() {
      if (khoHistoryView.loading) return '<div class="pc-empty">Đang đọc…</div>';
      if (khoHistoryView.error) return errorBox('Không đọc được lịch sử kho', khoHistoryView.error);
      var entries = (khoHistoryView.data && khoHistoryView.data.entries) || [];
      if (!entries.length) return '<div class="empty"><h3>Chưa có phát sinh</h3></div>';
      return '<div class="card" style="margin-top:12px">' + entries.map(function (en) {
        return '<article class="litem"><div class="lmain"><div class="ltitle">' + esc(en.itemId || en.domain || '—') +
          '</div><div class="lsub">' + esc(en.reason || en.type || '') + '</div></div><div class="lmeta">' +
          esc(en.qtyDelta !== null && en.qtyDelta !== undefined ? en.qtyDelta : '') + ' · ' +
          esc(en.occurredAt || '') + '</div></article>';
      }).join('') + '</div>';
    }

    function khoScreen() {
      var head = '<section><div class="section-head"><div><p class="eyebrow">Kho</p>' +
        '<h2>Danh mục &amp; đặt hàng</h2></div></div>' + khoTabBar() + '</section>';
      var body;
      if (khoUI.tab === 'inbox') body = khoInboxMarkup();
      else if (khoUI.tab === 'containers') body = khoContainersMarkup();
      else if (khoUI.tab === 'packaging') body = khoPackagingMarkup();
      else if (khoUI.tab === 'purchaseOrder') body = khoPOFormMarkup() + khoPOListMarkup();
      else if (khoUI.tab === 'history') body = khoHistoryMarkup();
      else body = khoConfigFormMarkup(khoUI.tab) + khoConfigListMarkup(khoUI.tab);
      return head + body;
    }

    /* ---------- Báo cáo — mix (phân tích bán hàng) / khách hàng ---------- */

    function mixScreen() {
      var d = mixView.data;
      var head = '<section><div class="section-head"><div><p class="eyebrow">Báo cáo</p>' +
        '<h2>Phân tích bán hàng</h2></div></div>' +
        '<form class="filter-bar" id="mix-range"><input type="date" name="from" value="' + esc(mixUI.from) +
        '" required><input type="date" name="to" value="' + esc(mixUI.to) + '" required>' +
        '<button class="btn">Xem</button></form></section>';
      if (mixView.loading) return head + '<div class="empty"><h3>Đang đọc…</h3></div>';
      if (mixView.error) return head + errorBox('Không đọc được báo cáo', mixView.error);
      if (!d) return head + '<div class="empty"><h3>Chọn khoảng ngày</h3></div>';
      var rows = d.rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.qty) + '</td><td>' + money(r.revenue) + '</td></tr>';
      }).join('');
      return head + '<div class="metric-grid">' + metric('Số đơn', d.billCount) +
        metric('Doanh thu', money(d.totalRevenue)) + '</div>' +
        '<table class="report"><thead><tr><th>Món</th><th>SL</th><th>Doanh thu</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="3">Không có dữ liệu</td></tr>') + '</tbody></table>';
    }

    var CUSTOMER_GROUP_LABEL = { loyal: 'Thân thiết', back: 'Quay lại', new: 'Mới' };

    function customerScreen() {
      var d = customerView.data;
      var head = '<section><div class="section-head"><div><p class="eyebrow">Báo cáo</p>' +
        '<h2>Khách hàng</h2></div></div>' +
        '<form class="filter-bar" id="customer-range"><input type="date" name="from" value="' +
        esc(customerUI.from) + '" required><input type="date" name="to" value="' + esc(customerUI.to) +
        '" required><button class="btn">Xem</button></form></section>';
      if (customerView.loading) return head + '<div class="empty"><h3>Đang đọc…</h3></div>';
      if (customerView.error) return head + errorBox('Không đọc được báo cáo', customerView.error);
      if (!d) return head + '<div class="empty"><h3>Chọn khoảng ngày</h3></div>';
      var rows = d.rows.map(function (r) {
        return '<tr><td>' + esc(r.name || 'Không rõ') + '</td><td>' + esc(r.phone || '') + '</td><td>' +
          esc(r.billCount) + '</td><td>' + money(r.totalSpend) + '</td><td>' + esc(r.visitDays) + '</td><td>' +
          esc(CUSTOMER_GROUP_LABEL[r.group] || r.group) + '</td></tr>';
      }).join('');
      return head + '<div class="metric-grid">' + metric('Số khách', d.customerCount) + '</div>' +
        '<table class="report"><thead><tr><th>Khách</th><th>SĐT</th><th>Số đơn</th><th>Tổng chi</th>' +
        '<th>Số ngày ghé</th><th>Nhóm</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="6">Không có dữ liệu</td></tr>') + '</tbody></table>';
    }

    function content(screen) {
      if (screen === 'TRACE') return traceScreen();
      if (screen === 'ALERTS') return alertsScreen();
      if (screen === 'INVENTORY') return inventoryScreen();
      if (screen === 'APPROVALS') return approvalsScreen();
      if (screen === 'REPORTS') return reportsScreen();
      if (screen === 'BTP') return btpScreen();
      if (screen === 'BILLS') return billsScreen();
      if (screen === 'KHO') return khoScreen();
      if (screen === 'MIX') return mixScreen();
      if (screen === 'CUSTOMER') return customerScreen();
      return overviewScreen();
    }

    /* ---------- Tải dữ liệu ---------- */

    function loadOverview() {
      reportView = { loading: true, error: null, data: null };
      alertView = { loading: true, error: null, data: null };
      shiftView = { loading: true, error: null, data: null };
      render();
      controller.getAlerts({}).then(function (out) { alertView = applyRead(out); render(); });
      controller.getShiftStatus({}).then(function (out) {
        shiftView = applyRead(out);
        var date = R.isOk(out) && out.value.data && out.value.data.businessDate
          ? out.value.data.businessDate : clock.calendarDate();
        return controller.getRevenue({ businessDate: date }).then(function (revenue) {
          reportView = applyRead(revenue);
          render();
        });
      });
    }

    function loadApprovals() {
      approvalView = { loading: true, error: null, data: null };
      approvalAction = { busy: null, error: null, done: null };
      render();
      controller.getPendingApprovals({}).then(function (out) { approvalView = applyRead(out); render(); });
    }

    /**
     * Một ngày kéo cả 3 báo cáo: doanh thu, COGS, P&L. Cùng một `businessDate`
     * cho cả ba — chọn ngày khác nhau cho từng ô là cách người ta so nhầm.
     */
    function loadReports(businessDate) {
      reportView = { loading: true, error: null, data: null };
      cogsView = { loading: true, error: null, data: null };
      varianceView = { loading: true, error: null, data: null };
      pnlView = { loading: true, error: null, data: null };
      render();
      usageView = { loading: true, error: null, data: null };
      lossView = { loading: true, error: null, data: null };
      valuationView = { loading: true, error: null, data: null };
      exportView = { busy: false, error: null, file: null };
      lastPeriod = businessDate;
      var revenue = controller.getRevenue({ businessDate: businessDate });
      var cogs = controller.getCOGS({ businessDate: businessDate });
      controller.getUsageReport({ businessDate: businessDate }).then(function (out) {
        usageView = applyRead(out); render();
      });
      controller.getLossReport({ businessDate: businessDate }).then(function (out) {
        lossView = applyRead(out); render();
      });
      controller.getInventoryValuation({ businessDate: businessDate }).then(function (out) {
        valuationView = applyRead(out); render();
      });
      revenue.then(function (out) { reportView = applyRead(out); render(); });
      cogs.then(function (out) { cogsView = applyRead(out); render(); });
      Promise.all([revenue, cogs]).then(function (both) {
        if (R.isErr(both[0]) || R.isErr(both[1])) {
          /* Không dựng P&L từ số nửa vời. Thà trống còn hơn một con lãi sai. */
          pnlView = { loading: false, error: null, data: null };
          varianceView = { loading: false, error: null, data: null };
          return render();
        }
        controller.getVarianceReport({
          businessDate: businessDate,
          revenue: both[0].value.data,
          cogs: both[1].value.data
        }).then(function (out) { varianceView = applyRead(out); render(); });
        return controller.getPnL({
          businessDate: businessDate,
          revenue: both[0].value.data,
          cogs: both[1].value.data
        }).then(function (out) { pnlView = applyRead(out); render(); });
      });
    }

    function loadBTP(businessDate) {
      btpView = { loading: true, error: null, data: null };
      lastPeriod = businessDate;
      btpExportView = { busy: false, error: null, file: null };
      render();
      controller.getBTPReport({ businessDate: businessDate }).then(function (out) {
        btpView = applyRead(out);
        render();
      });
    }

    function loadBills(clearNotice) {
      billsView = { loading: true, error: null, data: null };
      if (clearNotice) billsNotice = null;
      render();
      controller.getBillsForRange({ from: billsUI.from, to: billsUI.to }).then(function (out) {
        billsView = applyRead(out);
        render();
      });
    }

    function loadKhoConfig(kind) {
      khoConfigViews[kind] = { loading: true, error: null, data: null };
      render();
      controller.getKhoConfigList({ kind: kind }).then(function (out) {
        khoConfigViews[kind] = applyRaw(out);
        render();
      });
    }

    function loadKhoPO() {
      khoPOView = { loading: true, error: null, data: null };
      render();
      controller.getKhoConfigList({ kind: 'purchaseOrder' }).then(function (out) {
        khoPOView = applyRaw(out);
        render();
      });
    }

    function loadKhoHistory() {
      khoHistoryView = { loading: true, error: null, data: null };
      render();
      controller.getKhoHistory({}).then(function (out) {
        khoHistoryView = applyRaw(out);
        render();
      });
    }

    /** Điều hướng theo tab hiện tại của màn Kho — mỗi tab tự tải nguồn của nó. */
    function loadKhoContainers() {
      khoContainersView = { loading: true, error: null, data: null };
      render();
      controller.getOpenUnits({}).then(function (out) {
        khoContainersView = applyRaw(out);
        render();
      });
    }

    function loadKhoPackaging() {
      khoPackagingView = { loading: true, error: null, data: null };
      render();
      controller.getPackagingConfig({}).then(function (out) {
        khoPackagingView = applyRaw(out);
        render();
      });
    }

    function loadKhoForTab(tab) {
      if (tab === 'inbox') {
        if (!alertView.data && !alertView.loading) loadOverview();
      } else if (tab === 'containers') {
        if (!khoContainersView.data && !khoContainersView.loading) loadKhoContainers();
      } else if (tab === 'packaging') {
        if (!khoPackagingView.data && !khoPackagingView.loading) loadKhoPackaging();
      } else if (tab === 'purchaseOrder') {
        if (!khoPOView.data && !khoPOView.loading) loadKhoPO();
      } else if (tab === 'history') {
        if (!khoHistoryView.data && !khoHistoryView.loading) loadKhoHistory();
      } else {
        var v = khoConfigView(tab);
        if (!v.data && !v.loading) loadKhoConfig(tab);
      }
    }

    function submitKhoForm(kind) {
      var schema = KHO_CONFIG_SCHEMAS[kind];
      var payload = Object.assign({}, khoForm.values, {
        id: khoForm.editingId || ids.newId('item'),
        editRef: String(Date.now())
      });
      var method = 'save' + kind.charAt(0).toUpperCase() + kind.slice(1);
      khoForm.busy = true;
      khoForm.error = null;
      render();
      controller[method](payload).then(function (out) {
        if (R.isErr(out)) {
          khoForm = { editingId: khoForm.editingId, values: khoForm.values, busy: false, error: out.error };
          return render();
        }
        khoForm = { editingId: null, values: {}, busy: false, error: null };
        loadKhoConfig(kind);
      });
    }

    function loadMix() {
      mixView = { loading: true, error: null, data: null };
      render();
      controller.getMix({ from: mixUI.from, to: mixUI.to }).then(function (out) {
        mixView = applyRaw(out);
        render();
      });
    }

    function loadCustomerReport() {
      customerView = { loading: true, error: null, data: null };
      render();
      controller.getCustomerReport({ from: customerUI.from, to: customerUI.to }).then(function (out) {
        customerView = applyRaw(out);
        render();
      });
    }

    /**
     * Hoàn kho theo phân bổ GỐC đọc từ ledger (§3.8), không chạy lại định mức —
     * cùng nguyên tắc `qlReverseStockForOrder` legacy nhưng qua ReverseTransaction.
     * Luôn thử CẢ HAI sổ raw/prep, độc lập nhau (một sổ lỗi không chặn sổ kia) —
     * đúng tinh thần Promise.allSettled của bản gốc. Bill không truy được phân bổ
     * gốc (referenceId rỗng ở ledger canonical — bill trước cutover) không lỗi:
     * ReverseTransaction tự đẩy việc-chờ-rà-tay (manualReviewTask), UI chỉ cần
     * nói thật điều đó ra, không giả vờ đã hoàn xong.
     */
    /**
     * NET-LOYALTY-V1.md #4 — bill ghi qua canonical (không có legacySource)
     * kèm sự kiện OrderVoided vào ĐÚNG lượt hoàn domain 'raw' (referenceId ở
     * đó khớp bill.billId — xem comment domain-events.js#ROUTES.OrderVoided),
     * để L5 (`ReverseLoyaltyForVoidedBill`) chạy thật qua domain-events thay
     * vì chỉ hoàn kho mà bỏ quên điểm/tem. Bill legacy KHÔNG kèm: referenceId
     * hoàn kho của nó là orderId thô (khác định dạng billId canonical) và
     * AccrueLoyaltyForSale chưa từng chạy cho bill đó — không có gì để hoàn.
     */
    function doDeleteBill(bill) {
      billsDelete = { confirmId: bill.billId, busy: bill.billId, error: null };
      render();
      var isNative = !bill.legacySource;
      var refId = (bill.legacySource && bill.legacySource.billId) || bill.billId;
      var label = (bill.legacySource && bill.legacySource.billCode) || bill.billId;
      var domains = ['raw', 'prep'];
      var failed = [];
      var manualReview = [];
      var loyaltyReversed = false;

      var loyaltyEntries = Promise.resolve([]);
      if (isNative) {
        loyaltyEntries = controller.getLoyaltyLedgerForReference({
          billId: bill.billId, storeId: bill.storeId
        }).then(function (out) { return R.isOk(out) ? (out.value.entries || []) : []; });
      }

      var chain = loyaltyEntries.then(function (entries) {
        var afterFirst = Promise.resolve();
        domains.forEach(function (domain) {
          afterFirst = afterFirst.then(function () {
            return controller.getLedgerEntriesForReference({
              referenceId: refId, domain: domain, storeId: bill.storeId
            }).then(function (out) {
              if (R.isErr(out)) { failed.push(domain + ': ' + out.error.message); return; }
              var allocations = (out.value.entries || []).map(function (e) {
                return {
                  unitId: e.unitId, itemId: e.itemId, qty: Math.abs(e.qtyDelta || 0),
                  unitCost: e.unitCost, costBasisVersionId: e.costBasisVersionId
                };
              }).filter(function (a) { return a.unitId && a.itemId; });
              var revInput = {
                referenceId: refId, domain: domain, storeId: bill.storeId,
                reason: 'Xoá bill — Quản lý (' + label + ')', originalAllocations: allocations
              };
              if (isNative && domain === 'raw') {
                revInput.eventType = 'OrderVoided';
                revInput.eventData = { loyaltyEntries: entries };
              }
              return controller.reverseOrder(revInput).then(function (revOut) {
                if (R.isErr(revOut)) { failed.push(domain + ': ' + revOut.error.message); return; }
                var records = (revOut.value.plan && revOut.value.plan.domainRecords) || [];
                if (records.some(function (r) { return r.type === 'manualReviewTask'; })) manualReview.push(domain);
                (revOut.value.sideEffects || []).forEach(function (se) {
                  if (se.command === 'ReverseLoyaltyForVoidedBill' && R.isOk(se.result)) {
                    var loyaltyRecords = (se.result.value.plan && se.result.value.plan.domainRecords) || [];
                    if (loyaltyRecords.length) loyaltyReversed = true;
                  }
                });
              });
            });
          });
        });
        return afterFirst;
      });

      chain.then(function () {
        if (failed.length) {
          billsDelete = { confirmId: null, busy: null, error: { message: failed.join(' · ') } };
          return render();
        }
        billsDelete = { confirmId: null, busy: null, error: null };
        billsUI.openId = null;
        var base = manualReview.length
          ? '🗑 Đã xoá bill · sổ ' + manualReview.join(', ') +
            ' không truy được phân bổ gốc (bill trước cutover) — đã đưa vào việc chờ rà tay'
          : '🗑 Đã xoá bill · đã hoàn kho theo đúng sổ ghi lúc bán';
        billsNotice = base + (loyaltyReversed ? ' · đã hoàn điểm/tem khách hàng' : '');
        loadBills(false);
      });
    }

    function loadPnLForDate(businessDate) {
      var revenue = controller.getRevenue({ businessDate: businessDate });
      var cogs = controller.getCOGS({ businessDate: businessDate });
      return Promise.all([revenue, cogs]).then(function (both) {
        if (R.isErr(both[0])) return both[0];
        if (R.isErr(both[1])) return both[1];
        return controller.getPnL({
          businessDate: businessDate, revenue: both[0].value.data, cogs: both[1].value.data
        });
      });
    }

    function loadComparison(previousDate, currentDate) {
      compareView = { loading: true, error: null, data: null };
      render();
      Promise.all([loadPnLForDate(previousDate), loadPnLForDate(currentDate)]).then(function (periods) {
        if (R.isErr(periods[0]) || R.isErr(periods[1])) {
          compareView = applyRead(R.isErr(periods[0]) ? periods[0] : periods[1]);
          return render();
        }
        controller.comparePeriods({ previous: periods[0].value, current: periods[1].value }).then(function (out) {
          /* ComparePeriods hiện trả chính cấu trúc so sánh (hai Result vẫn giữ
             meta riêng), không ép nó qua shape của báo cáo một kỳ. */
          compareView = R.isErr(out)
            ? { loading: false, error: out.error, data: null }
            : { loading: false, error: null, data: out.value };
          render();
        });
      });
    }

    /* ---------- Nối sự kiện ---------- */

    function bind() {
      Array.prototype.forEach.call(el.querySelectorAll('[data-screen]'), function (button) {
        button.addEventListener('click', function () {
          var screen = button.getAttribute('data-screen');
          controller.navigate(screen);
          render();
          if (screen === 'APPROVALS' && !approvalView.data && !approvalView.loading) loadApprovals();
          if (screen === 'OVERVIEW' && !alertView.data && !alertView.loading) loadOverview();
          if (screen === 'ALERTS' && !alertView.data && !alertView.loading) loadOverview();
          if (screen === 'BTP' && !btpView.data && !btpView.loading) loadBTP(clock.calendarDate());
          if (screen === 'BILLS' && !billsView.data && !billsView.loading) loadBills(true);
          if (screen === 'KHO') loadKhoForTab(khoUI.tab);
          if (screen === 'MIX' && !mixView.data && !mixView.loading) loadMix();
          if (screen === 'CUSTOMER' && !customerView.data && !customerView.loading) loadCustomerReport();
        });
      });

      var sidebar = el.querySelector('#sidebar');
      var backdrop = el.querySelector('#sidebarBackdrop');
      var hamburger = el.querySelector('#hamburgerBtn');
      function setSidebar(open) {
        if (sidebar) sidebar.classList.toggle('open', open);
        if (backdrop) backdrop.classList.toggle('open', open);
      }
      if (hamburger) hamburger.addEventListener('click', function () {
        setSidebar(!sidebar.classList.contains('open'));
      });
      if (backdrop) backdrop.addEventListener('click', function () { setSidebar(false); });

      var form = el.querySelector('#ql-unit-search');
      if (form) form.addEventListener('submit', function (event) {
        event.preventDefault();
        var code = form.elements.code.value;
        traceView = { loading: true, error: null, data: null };
        render();
        controller.getUnitTrace({ containerCode: code }).then(function (out) {
          traceView = applyRead(out);
          render();
        });
      });

      var inventoryForm = el.querySelector('#inventory-search');
      if (inventoryForm) inventoryForm.addEventListener('submit', function (event) {
        event.preventDefault();
        inventoryView = { loading: true, error: null, data: null };
        render();
        controller.getInventoryLevel({ itemId: inventoryForm.elements.itemId.value }).then(function (out) {
          inventoryView = applyRead(out);
          render();
        });
      });

      var revenueForm = el.querySelector('#revenue-search');
      if (revenueForm) revenueForm.addEventListener('submit', function (event) {
        event.preventDefault();
        loadReports(revenueForm.elements.date.value);
      });

      var btpForm = el.querySelector('#btp-search');
      if (btpForm) btpForm.addEventListener('submit', function (event) {
        event.preventDefault();
        loadBTP(btpForm.elements.date.value);
      });

      var billsRangeForm = el.querySelector('#bills-range');
      if (billsRangeForm) billsRangeForm.addEventListener('submit', function (event) {
        event.preventDefault();
        billsUI.from = billsRangeForm.elements.from.value;
        billsUI.to = billsRangeForm.elements.to.value;
        loadBills(true);
      });

      var billsSearchForm = el.querySelector('#bills-search');
      if (billsSearchForm) billsSearchForm.addEventListener('submit', function (event) {
        event.preventDefault();
        billsUI.query = billsSearchForm.elements.q.value;
        render();
      });

      var billsBack = el.querySelector('#bills-back');
      if (billsBack) billsBack.addEventListener('click', function () {
        billsUI.openId = null;
        billsDelete = { confirmId: null, busy: null, error: null };
        render();
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-bill-open]'), function (button) {
        button.addEventListener('click', function () {
          billsUI.openId = button.getAttribute('data-bill-open');
          billsDelete = { confirmId: null, busy: null, error: null };
          window.scrollTo(0, 0);
          render();
        });
      });

      var billsDelAsk = el.querySelector('#bills-del-ask');
      if (billsDelAsk) billsDelAsk.addEventListener('click', function () {
        billsDelete = { confirmId: billsDelAsk.getAttribute('data-bill-id'), busy: null, error: null };
        render();
      });

      var billsDelCancel = el.querySelector('#bills-del-cancel');
      if (billsDelCancel) billsDelCancel.addEventListener('click', function () {
        billsDelete = { confirmId: null, busy: null, error: null };
        render();
      });

      var billsDelGo = el.querySelector('#bills-del-go');
      if (billsDelGo) billsDelGo.addEventListener('click', function () {
        var all = (billsView.data && billsView.data.bills) || [];
        var bill = all.filter(function (b) { return b.billId === billsDelete.confirmId; })[0];
        if (bill) doDeleteBill(bill);
      });

      var compareForm = el.querySelector('#compare-periods');
      if (compareForm) compareForm.addEventListener('submit', function (event) {
        event.preventDefault();
        loadComparison(compareForm.elements.previous.value, compareForm.elements.current.value);
      });

      var btpExport = el.querySelector('#btp-export');
      if (btpExport) btpExport.addEventListener('click', function () {
        if (!btpView.data || !btpView.data.rows.length) return;
        btpExportView = { busy: true, error: null, file: null };
        render();
        controller.exportReport({
          title: 'Bán thành phẩm', period: lastPeriod,
          columns: [
            { key: 'dateKey', label: 'Ngày' }, { key: 'batchCount', label: 'Số mẻ' },
            { key: 'nau', label: 'Nấu' }, { key: 'dung', label: 'Dùng' },
            { key: 'huy', label: 'Hủy' }, { key: 'huyPct', label: 'Tỷ lệ hủy (%)' },
            { key: 'huyCost', label: 'Chi phí hủy' }
          ],
          rows: btpView.data.rows, meta: btpView.meta
        }).then(function (out) {
          btpExportView = R.isErr(out) ? { busy: false, error: out.error, file: null } :
            { busy: false, error: null, file: out.value.data };
          render();
        });
      });

      var exportBtn = el.querySelector('#ql-export');
      if (exportBtn) exportBtn.addEventListener('click', function () {
        if (!usageView.data) return;
        exportView = { busy: true, error: null, file: null };
        render();
        controller.exportReport({
          title: 'Tiêu thụ và hao hụt',
          period: lastPeriod,
          columns: [
            { key: 'itemId', label: 'Mặt hàng' },
            { key: 'received', label: 'Nhập' },
            { key: 'consumed', label: 'Dùng' },
            { key: 'waste', label: 'Hao' },
            { key: 'lost', label: 'Mất' },
            { key: 'found', label: 'Tìm lại' },
            { key: 'untrackedQty', label: 'Chưa gắn lô' }
          ],
          rows: usageView.data.rows,
          /* meta của chính truy vấn đã dựng ra các dòng này — không bịa một meta
             mới, vì meta là thứ nói file đến từ đâu. */
          meta: usageView.meta
        }).then(function (out) {
          exportView = R.isErr(out)
            ? { busy: false, error: out.error, file: null }
            : { busy: false, error: null, file: out.value.data };
          render();
        });
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-approve]'), function (button) {
        button.addEventListener('click', function () {
          var item = approvalView.data.items[Number(button.getAttribute('data-approve'))];
          if (!item) return;
          approvalAction = { busy: item.referenceId, error: null, done: null };
          render();
          controller.approvePending(item).then(function (out) {
            approvalAction = R.isErr(out)
              ? { busy: null, error: out.error, done: null }
              : { busy: null, error: null, done: item.referenceId };
            render();
            /* Duyệt xong phải đọc lại danh sách: giữ danh sách cũ là cách một
               việc đã xử lý vẫn còn nút bấm. */
            if (R.isOk(out)) loadApprovals();
          });
        });
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-kho-tab]'), function (button) {
        button.addEventListener('click', function () {
          khoUI.tab = button.getAttribute('data-kho-tab');
          khoForm = { editingId: null, values: {}, busy: false, error: null };
          render();
          loadKhoForTab(khoUI.tab);
        });
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-kho-ctn-filter]'), function (button) {
        button.addEventListener('click', function () {
          khoContainersFilter = button.getAttribute('data-kho-ctn-filter');
          render();
        });
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-container-trace]'), function (button) {
        button.addEventListener('click', function () {
          var unitId = button.getAttribute('data-container-trace');
          controller.navigate('TRACE');
          traceView = { loading: true, error: null, data: null };
          render();
          controller.getUnitTrace({ containerCode: unitId }).then(function (out) {
            traceView = applyRead(out);
            render();
          });
        });
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-restore-found]'), function (button) {
        button.addEventListener('click', function () {
          var unitId = button.getAttribute('data-restore-found');
          var unit = ((khoContainersView.data && khoContainersView.data.units) || [])
            .filter(function (u) { return u.unitId === unitId; })[0];
          if (!unit) return;
          khoContainersAction = { busy: unitId, error: null };
          render();
          controller.restoreFoundContainer({ unitId: unitId, units: [unit] }).then(function (out) {
            khoContainersAction = R.isErr(out) ? { busy: null, error: out.error } : { busy: null, error: null };
            render();
            if (R.isOk(out)) loadKhoContainers();
          });
        });
      });

      var khoConfigForm = el.querySelector('#kho-config-form');
      if (khoConfigForm) khoConfigForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var kind = khoUI.tab;
        var schema = KHO_CONFIG_SCHEMAS[kind];
        var values = {};
        schema.fields.forEach(function (f) {
          var input = khoConfigForm.elements[f.key];
          if (!input) return;
          if (f.type === 'checkbox') values[f.key] = input.checked;
          else if (f.type === 'number') values[f.key] = input.value === '' ? 0 : Number(input.value);
          else values[f.key] = input.value;
        });
        khoForm.values = values;
        submitKhoForm(kind);
      });

      var khoFormCancel = el.querySelector('#kho-form-cancel');
      if (khoFormCancel) khoFormCancel.addEventListener('click', function () {
        khoForm = { editingId: null, values: {}, busy: false, error: null };
        render();
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-kho-edit]'), function (button) {
        button.addEventListener('click', function () {
          var kind = button.getAttribute('data-kho-kind');
          var id = button.getAttribute('data-kho-edit');
          var v = khoConfigView(kind);
          var entry = ((v.data && v.data.entries) || []).filter(function (e) { return e.id === id; })[0];
          if (!entry) return;
          khoForm = { editingId: id, values: Object.assign({}, entry), busy: false, error: null };
          window.scrollTo(0, 0);
          render();
        });
      });

      /* Ẩn/Bật lại = lưu đúp qua defineConfigUpsert với active đảo ngược
         (xoá mềm — §2.3a không âm thầm làm mất dữ liệu). */
      Array.prototype.forEach.call(el.querySelectorAll('[data-kho-toggle]'), function (button) {
        button.addEventListener('click', function () {
          var kind = button.getAttribute('data-kho-kind');
          var id = button.getAttribute('data-kho-toggle');
          var schema = KHO_CONFIG_SCHEMAS[kind];
          var v = khoConfigView(kind);
          var entry = ((v.data && v.data.entries) || []).filter(function (e) { return e.id === id; })[0];
          if (!entry) return;
          var values = {};
          schema.fields.forEach(function (f) { values[f.key] = entry[f.key]; });
          var payload = Object.assign({}, values, {
            id: id, editRef: String(Date.now()), active: entry.active === false
          });
          var method = 'save' + kind.charAt(0).toUpperCase() + kind.slice(1);
          controller[method](payload).then(function (out) {
            if (R.isOk(out)) loadKhoConfig(kind);
            else { khoForm.error = out.error; render(); }
          });
        });
      });

      var khoPOForm_ = el.querySelector('#kho-po-form');
      if (khoPOForm_) khoPOForm_.addEventListener('submit', function (event) {
        event.preventDefault();
        var supplier = khoPOForm_.elements.supplier.value;
        var note = khoPOForm_.elements.note.value;
        var lines = (khoPOForm_.elements.items.value || '').split('\n')
          .map(function (s) { return s.trim(); }).filter(Boolean)
          .map(function (label) { return { label: label }; });
        khoPOForm = { open: true, busy: true, error: null };
        render();
        controller.createPurchaseOrder({
          purchaseOrderId: ids.newId('item'), supplier: supplier, note: note || null, lines: lines
        }).then(function (out) {
          khoPOForm = R.isErr(out)
            ? { open: true, busy: false, error: out.error }
            : { open: false, busy: false, error: null };
          if (R.isOk(out)) loadKhoPO();
          else render();
        });
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-po-cancel]'), function (button) {
        button.addEventListener('click', function () {
          var id = button.getAttribute('data-po-cancel');
          var entries = (khoPOView.data && khoPOView.data.entries) || [];
          var po = entries.filter(function (e) { return e.purchaseOrderId === id; })[0];
          if (!po) return;
          controller.cancelPurchaseOrder({ purchaseOrderId: id, purchaseOrder: po }).then(function (out) {
            if (R.isOk(out)) loadKhoPO();
            else { khoPOForm = { open: true, busy: false, error: out.error }; render(); }
          });
        });
      });

      var khoPackagingForm_ = el.querySelector('#kho-packaging-form');
      if (khoPackagingForm_) khoPackagingForm_.addEventListener('submit', function (event) {
        event.preventDefault();
        var lines = (khoPackagingForm_.elements.items.value || '').split('\n')
          .map(function (s) { return s.trim(); }).filter(Boolean);
        var items = lines.map(function (line) {
          var parts = line.split(',').map(function (s) { return s.trim(); });
          return { itemId: parts[0], qty: Number(parts[1]), note: parts[2] || null };
        });
        khoPackagingForm = { busy: true, error: null };
        render();
        controller.publishPackaging({
          effectiveFrom: clock.now(), tier: 'preset', packaging: { items: items }
        }).then(function (out) {
          khoPackagingForm = R.isErr(out) ? { busy: false, error: out.error } : { busy: false, error: null };
          if (R.isOk(out)) loadKhoPackaging();
          else render();
        });
      });

      var mixRangeForm = el.querySelector('#mix-range');
      if (mixRangeForm) mixRangeForm.addEventListener('submit', function (event) {
        event.preventDefault();
        mixUI.from = mixRangeForm.elements.from.value;
        mixUI.to = mixRangeForm.elements.to.value;
        loadMix();
      });

      var customerRangeForm = el.querySelector('#customer-range');
      if (customerRangeForm) customerRangeForm.addEventListener('submit', function (event) {
        event.preventDefault();
        customerUI.from = customerRangeForm.elements.from.value;
        customerUI.to = customerRangeForm.elements.to.value;
        loadCustomerReport();
      });
    }

    function render() {
      var state = controller.state();
      var readonly = state.mode === bootstrap.MODE.READ_ONLY;
      el.innerHTML = '<div class="app-shell management">' +
        '<div class="sidebar-backdrop" id="sidebarBackdrop"></div>' +
        '<aside class="sidebar" id="sidebar" aria-label="Điều hướng quản lý">' +
          '<div class="sidebar-brand"><span class="seedmark" aria-hidden="true">●</span>' +
            '<div class="brand disp">GIEO GIEO</div></div>' +
          '<div class="sidebar-group-label">Vận hành</div>' +
          '<button data-screen="OVERVIEW" class="sidebar-item ' + (state.screen === 'OVERVIEW' ? 'active' : '') + '"><span class="sb-ic">⌂</span><span>Hôm nay</span></button>' +
          '<button data-screen="ALERTS" class="sidebar-item ' + (state.screen === 'ALERTS' ? 'active' : '') + '"><span class="sb-ic">!</span><span>Cảnh báo</span>' +
            (alertView.data && alertView.data.total ? '<span class="sb-dot">' + esc(alertView.data.total) + '</span>' : '') + '</button>' +
          '<button data-screen="APPROVALS" class="sidebar-item ' + (state.screen === 'APPROVALS' ? 'active' : '') + '"><span class="sb-ic">✓</span><span>Hộp việc</span>' +
            (approvalView.data && approvalView.data.items.length ? '<span class="sb-dot">' + esc(approvalView.data.items.length) + '</span>' : '') + '</button>' +
          '<div class="sidebar-group-label">Sổ &amp; kho</div>' +
          '<button data-screen="TRACE" class="sidebar-item ' + (state.screen === 'TRACE' ? 'active' : '') + '"><span class="sb-ic">⌕</span><span>Truy vết FIFO</span></button>' +
          '<button data-screen="INVENTORY" class="sidebar-item ' + (state.screen === 'INVENTORY' ? 'active' : '') + '"><span class="sb-ic">▦</span><span>Tồn kho</span></button>' +
          '<button data-screen="BTP" class="sidebar-item ' + (state.screen === 'BTP' ? 'active' : '') + '"><span class="sb-ic">◎</span><span>Bán thành phẩm</span></button>' +
          '<button data-screen="BILLS" class="sidebar-item ' + (state.screen === 'BILLS' ? 'active' : '') + '"><span class="sb-ic">🧾</span><span>Lịch sử bill</span></button>' +
          '<button data-screen="KHO" class="sidebar-item ' + (state.screen === 'KHO' ? 'active' : '') + '"><span class="sb-ic">📦</span><span>Kho</span></button>' +
          '<button data-screen="REPORTS" class="sidebar-item ' + (state.screen === 'REPORTS' ? 'active' : '') + '"><span class="sb-ic">▥</span><span>Báo cáo</span></button>' +
          '<button data-screen="MIX" class="sidebar-item ' + (state.screen === 'MIX' ? 'active' : '') + '"><span class="sb-ic">▤</span><span>Phân tích bán hàng</span></button>' +
          '<button data-screen="CUSTOMER" class="sidebar-item ' + (state.screen === 'CUSTOMER' ? 'active' : '') + '"><span class="sb-ic">☺</span><span>Khách hàng</span></button>' +
        '</aside><div class="main-col"><header class="topbar"><div class="topbar-row">' +
          '<div class="brandrow"><button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu">☰</button>' +
          '<div class="hdr-titles"><div class="brand disp" id="hdrTitle">Quản lý vận hành</div></div></div>' +
          '<div class="topbar-actions"><span class="status ' + (readonly ? 'warning' : 'success') + '">' + esc(state.mode) + '</span></div>' +
        '</div></header><div id="errBanner">' +
          (readonly ? '<div class="notice"><strong>Chế độ chỉ đọc</strong><span>Mọi chỉnh sửa đang bị khóa cho tới shadow/cutover.</span></div>' : '') +
        '</div><main class="screen active"><div class="wrap">' + content(state.screen) +
        '</div></main></div></div>';
      bind();
    }

    render();
    loadOverview();
    return R.ok({ mode: runtime.mode });
  }

  return { showLogin: showLogin, start: start };
});
