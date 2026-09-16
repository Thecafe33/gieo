/** POS thin client — UI chỉ gọi controller/runtime, không chứa FIFO engine. */
GIEO.define('app-pos/main', [
  'shared-kernel/result',
  'bootstrap/runtime',
  'app-pos/controller'
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
    var runtime = globalThis.GIEO_POS_RUNTIME || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var controller = controllerLib.createController(runtime);
    var traceView = { loading: false, error: null, data: null };
    var menuView = { loading: true, error: null, data: null };

    function traceMarkup() {
      if (traceView.loading) return '<div class="empty"><h3>Đang đọc Unit…</h3></div>';
      if (traceView.error) return '<div class="result error"><strong>Không đọc được Unit</strong><span>' +
        esc(traceView.error.message) + '</span></div>';
      if (!traceView.data) return '<div class="empty"><div class="empty-icon">◎</div><h3>Tra một Unit</h3>' +
        '<p>Dữ liệu được merge từ nguồn legacy qua Unified Read Layer.</p></div>';
      return '<div class="result"><strong>' + esc(traceView.data.unitId) + '</strong>' +
        '<span>Còn lại: ' + esc(traceView.data.remainingQty) + '</span>' +
        '<span>Bill liên quan: ' + esc((traceView.data.billIds || []).length) + '</span></div>';
    }

    function content(screen) {
      if (screen === 'INVENTORY') {
        return '<section class="panel"><div class="section-head"><div><p class="eyebrow">FIFO</p>' +
          '<h2>Kho theo từng lô</h2></div></div>' +
          '<form class="search-row" id="pos-unit-search"><input name="code" aria-label="Mã Unit" ' +
          'placeholder="Nhập hoặc quét mã Unit" required><button>Tra cứu</button></form>' +
          traceMarkup() + '</section>';
      }
      if (screen === 'SHIFT') {
        return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Ca làm việc</p>' +
          '<h2>Ca và két tiền</h2></div><button class="primary" disabled>Chốt ca</button></div>' +
          '<div class="metric-grid"><article class="metric"><span>Ngày làm việc</span><strong>Chưa kết nối</strong></article>' +
          '<article class="metric"><span>Trạng thái két</span><strong>—</strong></article></div></section>';
      }
      if (menuView.loading) {
        return '<section class="panel"><div class="empty"><h3>Đang tải menu…</h3></div></section>';
      }
      if (menuView.error) {
        return '<section class="panel"><div class="empty"><div class="empty-icon">!</div>' +
          '<h3>Chưa kết nối dữ liệu cửa hàng</h3><p>' + esc(menuView.error.message) + '</p></div></section>';
      }
      var groups = menuView.data || [];
      var menuHtml = groups.map(function (group) {
        return '<div class="menu-group"><h3>' + esc(group.category.name) + '</h3><div class="menu-grid">' +
          group.items.map(function (item) {
            var prices = Object.keys(item.prices || {}).map(function (size) {
              return size + ' ' + Number(item.prices[size]).toLocaleString('vi-VN') + '₫';
            }).join(' · ');
            return '<button class="menu-item" disabled><strong>' + esc(item.name) + '</strong><span>' +
              esc(prices) + '</span></button>';
          }).join('') + '</div></div>';
      }).join('');
      return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Bán hàng</p>' +
        '<h2>Đơn hiện tại</h2></div><button class="primary" disabled>Thanh toán</button></div>' +
        (menuHtml || '<div class="empty"><div class="empty-icon">＋</div><h3>Menu đang trống</h3></div>') +
        '<div class="total-row"><span>Tổng cộng</span><strong>0 ₫</strong></div></section>';
    }

    function render() {
      var state = controller.state();
      var readonly = state.mode === bootstrap.MODE.READ_ONLY;
      el.innerHTML = '<div class="app-shell"><header class="topbar"><div>' +
        '<p class="brand">gieo gieo</p><h1>Điểm bán hàng</h1></div>' +
        '<span class="status ' + (readonly ? 'warning' : 'success') + '">' + esc(state.mode) + '</span></header>' +
        (readonly ? '<div class="notice"><strong>Chế độ chỉ đọc</strong><span>Hệ thống cũ vẫn là nơi ghi production duy nhất.</span></div>' : '') +
        '<main>' + content(state.screen) + '</main>' +
        '<nav class="bottom-nav" aria-label="Điều hướng POS">' +
          '<button data-screen="SALE" class="' + (state.screen === 'SALE' ? 'active' : '') + '"><span>◫</span>Bán hàng</button>' +
          '<button data-screen="INVENTORY" class="' + (state.screen === 'INVENTORY' ? 'active' : '') + '"><span>◉</span>Kho FIFO</button>' +
          '<button data-screen="SHIFT" class="' + (state.screen === 'SHIFT' ? 'active' : '') + '"><span>◷</span>Ca</button>' +
        '</nav></div>';
      Array.prototype.forEach.call(el.querySelectorAll('[data-screen]'), function (button) {
        button.addEventListener('click', function () {
          controller.navigate(button.getAttribute('data-screen'));
          render();
        });
      });
      var form = el.querySelector('#pos-unit-search');
      if (form) form.addEventListener('submit', function (event) {
        event.preventDefault();
        traceView = { loading: true, error: null, data: null };
        render();
        controller.readUnitTrace({ containerCode: form.elements.code.value }).then(function (out) {
          traceView = R.isErr(out)
            ? { loading: false, error: out.error, data: null }
            : { loading: false, error: null, data: out.value.data };
          render();
        });
      });
    }

    render();
    controller.watchMenu({}, function (out) {
      menuView = R.isErr(out)
        ? { loading: false, error: out.error, data: null }
        : { loading: false, error: null, data: out.value.data };
      render();
    });
    return R.ok({ mode: runtime.mode });
  }

  return { start: start };
});
