/** QUANLY thin client — điều tra qua read-layer, sửa qua commands. */
GIEO.define('app-quanly/main', [
  'shared-kernel/result',
  'bootstrap/runtime',
  'app-quanly/controller'
], function (R, bootstrap, controllerLib) {
  'use strict';

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) { return Number(n || 0).toLocaleString('vi-VN') + ' ₫'; }
  function view() { return { loading: false, error: null, data: null }; }

  function applyRead(out) {
    return R.isErr(out)
      ? { loading: false, error: out.error, data: null }
      : { loading: false, error: null, data: out.value.data, meta: out.value.meta };
  }

  function start() {
    var el = document.getElementById('app');
    if (!el) return R.err('NOT_FOUND', 'không có #app');
    var runtime = globalThis.GIEO_QUANLY_RUNTIME || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var controller = controllerLib.createController(runtime);

    var traceView = view();
    var reportView = view();
    var cogsView = view();
    var pnlView = view();
    var alertView = view();
    var shiftView = view();
    var approvalView = view();
    var approvalAction = { busy: null, error: null, done: null };

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
      var head = '<section class="panel"><div class="section-head"><div><p class="eyebrow">Tổng quan cửa hàng</p>' +
        '<h2>Hôm nay</h2></div>' +
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
      return head + boxes.join('') + '<div class="metric-grid">' +
        metric('Doanh thu thuần', rev ? money(rev.netRevenue) : '—') +
        metric('Số đơn', rev ? rev.billCount : '—') +
        /* Hai mức nặng để RIÊNG: gộp thành "12 cảnh báo" là cách một DANGER
           biến mất giữa đám INFO. */
        metric('Nghiêm trọng', al ? al.counts.DANGER : '—') +
        metric('Cảnh báo', al ? al.counts.WARNING : '—') +
        metric('Trạng thái ngày', sh ? (sh.operable ? 'Đang mở' : 'Chưa mở') : '—') +
        metric('Đang trong ca', sh ? sh.employeesOnShift.length : '—') +
        '</div></section>';
    }

    /* ---------- Truy vết ---------- */

    function traceMarkup() {
      if (traceView.loading) return '<div class="empty"><h3>Đang dựng timeline…</h3></div>';
      if (traceView.error) return errorBox('Không thể truy vết', traceView.error);
      if (!traceView.data) return '<div class="empty"><div class="empty-icon">⌕</div><h3>Chọn một Unit để điều tra</h3>' +
        '<p>Read Layer tự chọn LIVE hoặc snapshot lịch sử; màn hình không branch theo nguồn.</p></div>';
      return '<div class="trace-grid"><article class="result"><span>Unit</span><strong>' +
        esc(traceView.data.unitId) + '</strong></article><article class="result"><span>Bill</span><strong>' +
        esc((traceView.data.billIds || []).length) + '</strong></article><article class="result"><span>BTP</span><strong>' +
        esc((traceView.data.prepBatchIds || []).length) + '</strong></article></div>';
    }

    function traceScreen() {
      return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Truy vết hai chiều</p>' +
        '<h2>Unit → Bill / BTP / Waste</h2></div>' + frozenTag(traceView) + '</div><div class="search-row">' +
        '<form id="ql-unit-search" style="display:contents"><input name="code" aria-label="Mã Unit" ' +
        'placeholder="Nhập hoặc quét mã Unit" required><button>Tra cứu</button></form></div>' +
        traceMarkup() + '</section>';
    }

    /* ---------- Duyệt ---------- */

    function approvalsScreen() {
      var d = approvalView.data;
      var count = d ? d.items.length : 0;
      var head = '<section class="panel"><div class="section-head"><div><p class="eyebrow">Kiểm soát</p>' +
        '<h2>Việc chờ duyệt</h2></div><span class="status neutral">' +
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

      return head + warn + action + '<ul class="approval-list">' + d.items.map(function (item, i) {
        return '<li><span class="approval-label"><strong>' + esc(item.label) + '</strong>' +
          '<em>' + esc(item.referenceId) + '</em></span>' +
          '<span class="approval-meta">' + esc(item.summary || '') + '</span>' +
          '<button data-approve="' + i + '"' + (approvalAction.busy === item.referenceId ? ' disabled' : '') +
          '>' + esc(approvalAction.busy === item.referenceId ? 'Đang duyệt…' : 'Duyệt') + '</button></li>';
      }).join('') + '</ul></section>';
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

    function reportsScreen() {
      var r = reportView.data;
      return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Sổ sách</p>' +
        '<h2>Doanh thu · COGS · P&amp;L</h2></div>' + frozenTag(reportView) + '</div>' +
        '<form class="search-row" id="revenue-search"><input type="date" name="date" required>' +
        '<button>Đọc báo cáo</button></form>' +
        (reportView.loading ? '<div class="empty"><h3>Đang đọc báo cáo…</h3></div>' :
          reportView.error ? errorBox('Không đọc được báo cáo', reportView.error) :
          '<div class="metric-grid">' +
            metric('Doanh thu thuần', r ? money(r.netRevenue) : '—') +
            metric('Số đơn', r ? r.billCount : '—') +
            metric('Phí kênh', r ? money(r.channelFees) : '—') +
            metric('Giảm giá', r ? money(r.discountTotal) : '—') +
          '</div>') +
        cogsMarkup() + pnlMarkup() + '</section>';
    }

    function content(screen) {
      if (screen === 'TRACE') return traceScreen();
      if (screen === 'APPROVALS') return approvalsScreen();
      if (screen === 'REPORTS') return reportsScreen();
      return overviewScreen();
    }

    /* ---------- Tải dữ liệu ---------- */

    function loadOverview() {
      alertView = { loading: true, error: null, data: null };
      shiftView = { loading: true, error: null, data: null };
      render();
      controller.getAlerts({}).then(function (out) { alertView = applyRead(out); render(); });
      controller.getShiftStatus({}).then(function (out) { shiftView = applyRead(out); render(); });
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
      pnlView = { loading: true, error: null, data: null };
      render();
      var revenue = controller.getRevenue({ businessDate: businessDate });
      var cogs = controller.getCOGS({ businessDate: businessDate });
      revenue.then(function (out) { reportView = applyRead(out); render(); });
      cogs.then(function (out) { cogsView = applyRead(out); render(); });
      Promise.all([revenue, cogs]).then(function (both) {
        if (R.isErr(both[0]) || R.isErr(both[1])) {
          /* Không dựng P&L từ số nửa vời. Thà trống còn hơn một con lãi sai. */
          pnlView = { loading: false, error: null, data: null };
          return render();
        }
        return controller.getPnL({
          businessDate: businessDate,
          revenue: both[0].value.data,
          cogs: both[1].value.data
        }).then(function (out) { pnlView = applyRead(out); render(); });
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
        });
      });

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

      var revenueForm = el.querySelector('#revenue-search');
      if (revenueForm) revenueForm.addEventListener('submit', function (event) {
        event.preventDefault();
        loadReports(revenueForm.elements.date.value);
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
    }

    function render() {
      var state = controller.state();
      var readonly = state.mode === bootstrap.MODE.READ_ONLY;
      el.innerHTML = '<div class="app-shell management"><header class="topbar"><div>' +
        '<p class="brand">gieo gieo</p><h1>Quản lý vận hành</h1></div>' +
        '<span class="status ' + (readonly ? 'warning' : 'success') + '">' + esc(state.mode) + '</span></header>' +
        (readonly ? '<div class="notice"><strong>Chế độ chỉ đọc</strong><span>Mọi chỉnh sửa đang bị khóa cho tới shadow/cutover.</span></div>' : '') +
        '<div class="workspace"><aside class="side-nav" aria-label="Điều hướng quản lý">' +
          '<button data-screen="OVERVIEW" class="' + (state.screen === 'OVERVIEW' ? 'active' : '') + '">Tổng quan</button>' +
          '<button data-screen="TRACE" class="' + (state.screen === 'TRACE' ? 'active' : '') + '">Truy vết FIFO</button>' +
          '<button data-screen="APPROVALS" class="' + (state.screen === 'APPROVALS' ? 'active' : '') + '">Duyệt &amp; sửa</button>' +
          '<button data-screen="REPORTS" class="' + (state.screen === 'REPORTS' ? 'active' : '') + '">Báo cáo</button>' +
        '</aside><main>' + content(state.screen) + '</main></div></div>';
      bind();
    }

    render();
    loadOverview();
    return R.ok({ mode: runtime.mode });
  }

  return { start: start };
});
