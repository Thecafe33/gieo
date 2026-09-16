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

  function start() {
    var el = document.getElementById('app');
    if (!el) return R.err('NOT_FOUND', 'không có #app');
    var runtime = globalThis.GIEO_QUANLY_RUNTIME || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var controller = controllerLib.createController(runtime);
    var traceView = { loading: false, error: null, data: null };
    var reportView = { loading: false, error: null, data: null };

    function traceMarkup() {
      if (traceView.loading) return '<div class="empty"><h3>Đang dựng timeline…</h3></div>';
      if (traceView.error) return '<div class="result error"><strong>Không thể truy vết</strong><span>' +
        esc(traceView.error.message) + '</span></div>';
      if (!traceView.data) return '<div class="empty"><div class="empty-icon">⌕</div><h3>Chọn một Unit để điều tra</h3>' +
        '<p>Read Layer tự chọn LIVE hoặc snapshot lịch sử; màn hình không branch theo nguồn.</p></div>';
      return '<div class="trace-grid"><article class="result"><span>Unit</span><strong>' +
        esc(traceView.data.unitId) + '</strong></article><article class="result"><span>Bill</span><strong>' +
        esc((traceView.data.billIds || []).length) + '</strong></article><article class="result"><span>BTP</span><strong>' +
        esc((traceView.data.prepBatchIds || []).length) + '</strong></article></div>';
    }

    function content(screen) {
      if (screen === 'TRACE') {
        return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Truy vết hai chiều</p>' +
          '<h2>Unit → Bill / BTP / Waste</h2></div></div><div class="search-row">' +
          '<form id="ql-unit-search" style="display:contents"><input name="code" aria-label="Mã Unit" ' +
          'placeholder="Nhập hoặc quét mã Unit" required><button>Tra cứu</button></form></div>' +
          traceMarkup() + '</section>';
      }
      if (screen === 'APPROVALS') {
        return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Kiểm soát</p>' +
          '<h2>Việc chờ duyệt</h2></div><span class="status neutral">0 việc</span></div>' +
          '<div class="empty"><div class="empty-icon">✓</div><h3>Chưa có dữ liệu duyệt</h3>' +
          '<p>Kiểm kê, báo mất và chi phí chỉ được thay đổi qua command có audit.</p></div></section>';
      }
      if (screen === 'REPORTS') {
        return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Sổ sách</p>' +
          '<h2>Doanh thu · COGS · P&amp;L</h2></div><button disabled>Xuất báo cáo</button></div>' +
          '<form class="search-row" id="revenue-search"><input type="date" name="date" required>' +
          '<button>Đọc doanh thu</button></form>' +
          (reportView.loading ? '<div class="empty"><h3>Đang đọc báo cáo…</h3></div>' :
            reportView.error ? '<div class="result error"><strong>Không đọc được báo cáo</strong><span>' +
              esc(reportView.error.message) + '</span></div>' :
            '<div class="metric-grid"><article class="metric"><span>Doanh thu thuần</span><strong>' +
              (reportView.data ? Number(reportView.data.netRevenue).toLocaleString('vi-VN') + ' ₫' : '—') +
              '</strong></article><article class="metric"><span>Số đơn</span><strong>' +
              (reportView.data ? esc(reportView.data.billCount) : '—') +
              '</strong></article><article class="metric"><span>Phí kênh</span><strong>' +
              (reportView.data ? Number(reportView.data.channelFees).toLocaleString('vi-VN') + ' ₫' : '—') +
              '</strong></article></div>') + '</section>';
      }
      return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Tổng quan cửa hàng</p>' +
        '<h2>Hôm nay</h2></div><span class="status neutral">Chưa đồng bộ</span></div>' +
        '<div class="metric-grid"><article class="metric"><span>Doanh thu</span><strong>—</strong></article>' +
        '<article class="metric"><span>Cảnh báo</span><strong>—</strong></article>' +
        '<article class="metric"><span>Unit cần rà</span><strong>—</strong></article></div></section>';
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
      Array.prototype.forEach.call(el.querySelectorAll('[data-screen]'), function (button) {
        button.addEventListener('click', function () {
          controller.navigate(button.getAttribute('data-screen'));
          render();
        });
      });
      var form = el.querySelector('#ql-unit-search');
      if (form) form.addEventListener('submit', function (event) {
        event.preventDefault();
        traceView = { loading: true, error: null, data: null };
        var code = form.elements.code.value;
        render();
        controller.getUnitTrace({ containerCode: code }).then(function (out) {
          traceView = R.isErr(out)
            ? { loading: false, error: out.error, data: null }
            : { loading: false, error: null, data: out.value.data };
          render();
        });
      });
      var revenueForm = el.querySelector('#revenue-search');
      if (revenueForm) revenueForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var date = revenueForm.elements.date.value;
        reportView = { loading: true, error: null, data: null };
        render();
        controller.getRevenue({ businessDate: date }).then(function (out) {
          reportView = R.isErr(out)
            ? { loading: false, error: out.error, data: null }
            : { loading: false, error: null, data: out.value.data };
          render();
        });
      });
    }

    render();
    return R.ok({ mode: runtime.mode });
  }

  return { start: start };
});
