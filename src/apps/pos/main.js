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

  function money(n) { return Number(n || 0).toLocaleString('vi-VN') + ' ₫'; }

  /** Một khung hiển thị dùng chung cho mọi vùng đọc dữ liệu. */
  function view() { return { loading: false, error: null, data: null }; }

  function applyRead(out) {
    return R.isErr(out)
      ? { loading: false, error: out.error, data: null }
      : { loading: false, error: null, data: out.value.data };
  }

  /** Màn PIN tối thiểu của POS — giống hệt app-quanly/main#showLogin, khác source. */
  function showLogin(spec) {
    spec = spec || {};
    var el = document.getElementById('app');
    if (!el) return R.err('NOT_FOUND', 'không có #app');
    if (typeof spec.authenticate !== 'function' || typeof spec.onAuthenticated !== 'function') {
      return R.err('VALIDATION', 'showLogin cần authenticate và onAuthenticated');
    }
    el.innerHTML = '<div class="app-shell"><section class="panel" style="max-width:420px;margin:12vh auto 0">' +
      '<p class="eyebrow">GIEO POS</p><h2>Đăng nhập bán hàng</h2>' +
      '<p style="color:var(--muted)">Nhập PIN 4 số của bạn.</p>' +
      '<form id="pos-pin-form" class="search-row"><input name="pin" type="password" inputmode="numeric" ' +
      'pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" aria-label="PIN 4 số" required>' +
      '<button type="submit">Đăng nhập</button></form><div id="pos-pin-result"></div></section></div>';
    var form = el.querySelector('#pos-pin-form');
    var result = el.querySelector('#pos-pin-result');
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
    var runtime = globalThis.GIEO_POS_RUNTIME || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var controller = controllerLib.createController(runtime);

    var traceView = view();
    var menuView = { loading: true, error: null, data: null };
    var stockView = view();
    var shiftView = view();
    var alertView = view();
    var checkoutView = { busy: false, error: null, bill: null };

    function errorBox(title, error) {
      return '<div class="result error"><strong>' + esc(title) + '</strong><span>' +
        esc(error.message) + '</span></div>';
    }

    /* ---------- Cảnh báo ---------- */

    function alertBanner() {
      var d = alertView.data;
      if (!d || !d.total) return '';
      var top = d.buckets.DANGER.concat(d.buckets.WARNING).slice(0, 3);
      return '<div class="notice alerts"><strong>' + esc(d.counts.DANGER) + ' nghiêm trọng · ' +
        esc(d.counts.WARNING) + ' cảnh báo</strong><span>' +
        top.map(function (a) { return esc(a.type); }).join(' · ') + '</span></div>';
    }

    /* ---------- Màn bán hàng ---------- */

    function cartMarkup() {
      var state = controller.state();
      if (!state.cart.length) {
        return '<div class="empty"><div class="empty-icon">＋</div><h3>Chưa chọn món</h3>' +
          '<p>Bấm vào món ở trên để thêm vào đơn.</p></div>';
      }
      return '<ul class="cart">' + state.cart.map(function (l) {
        return '<li><span class="cart-name">' + esc(l.name) +
          (l.size ? ' <em>' + esc(l.size) + '</em>' : '') + '</span>' +
          '<span class="cart-qty">' +
            '<button data-qty="-1" data-key="' + esc(l.key) + '" aria-label="Bớt một">−</button>' +
            '<strong>' + esc(l.qty) + '</strong>' +
            '<button data-qty="1" data-key="' + esc(l.key) + '" aria-label="Thêm một">＋</button>' +
          '</span><span class="cart-money">' + esc(money(l.unitPrice * l.qty)) + '</span></li>';
      }).join('') + '</ul>';
    }

    function checkoutMarkup() {
      if (checkoutView.busy) return '<div class="result"><span>Đang ghi đơn…</span></div>';
      if (checkoutView.error) return errorBox('Chưa ghi được đơn', checkoutView.error);
      if (checkoutView.bill) {
        return '<div class="result"><strong>Đã ghi đơn ' + esc(checkoutView.bill.billId || '') + '</strong>' +
          '<span>Tổng chính thức: ' + esc(money(checkoutView.bill.total)) + '</span></div>';
      }
      return '';
    }

    function saleScreen() {
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
            var sizes = Object.keys(item.prices || {});
            return sizes.map(function (size) {
              return '<button class="menu-item" data-add="1" data-item="' + esc(item.menuItemId) +
                '" data-size="' + esc(size) + '" data-price="' + esc(item.prices[size]) +
                /* recipeId đi kèm menu ngay từ GetMenu (catalog/menu.js) — mang
                   theo để checkout dựng requirements thật, không phải đợi tra
                   lại. Thiếu thì rỗng, addLine tự coi là null (N10, §2.3a). */
                '" data-recipe="' + esc(item.recipeId || '') +
                '" data-name="' + esc(item.name) + '"><strong>' + esc(item.name) + '</strong><span>' +
                esc(size) + ' · ' + esc(money(item.prices[size])) + '</span></button>';
            }).join('');
          }).join('') + '</div></div>';
      }).join('');

      var state = controller.state();
      var canCheckout = state.cart.length > 0;
      return '<section class="panel"><div class="section-head"><div><p class="eyebrow">Bán hàng</p>' +
        '<h2>Đơn hiện tại</h2></div><button class="primary" id="pos-checkout"' +
        (canCheckout ? '' : ' disabled') + '>Thanh toán</button></div>' +
        (menuHtml || '<div class="empty"><div class="empty-icon">＋</div><h3>Menu đang trống</h3></div>') +
        cartMarkup() +
        /* Gọi đúng tên: "tạm tính". Số có hiệu lực là số RecordSale trả về. */
        '<div class="total-row"><span>Tạm tính (chưa gồm giảm giá/phí kênh)</span><strong>' +
        esc(money(state.cartSubtotal)) + '</strong></div>' +
        checkoutMarkup() + '</section>';
    }

    /* ---------- Màn kho ---------- */

    function traceMarkup() {
      if (traceView.loading) return '<div class="empty"><h3>Đang đọc Unit…</h3></div>';
      if (traceView.error) return errorBox('Không đọc được Unit', traceView.error);
      if (!traceView.data) return '<div class="empty"><div class="empty-icon">◎</div><h3>Tra một Unit</h3>' +
        '<p>Dữ liệu được merge từ nguồn legacy qua Unified Read Layer.</p></div>';
      return '<div class="result"><strong>' + esc(traceView.data.unitId) + '</strong>' +
        '<span>Còn lại: ' + esc(traceView.data.remainingQty) + '</span>' +
        '<span>Bill liên quan: ' + esc((traceView.data.billIds || []).length) + '</span></div>';
    }

    function stockMarkup() {
      if (stockView.loading) return '<div class="empty"><h3>Đang đọc tồn kho…</h3></div>';
      if (stockView.error) return errorBox('Không đọc được tồn kho', stockView.error);
      if (!stockView.data) return '';
      var b = stockView.data.breakdown || {};
      return '<div class="metric-grid"><article class="metric"><span>Tồn hiện tại</span><strong>' +
        esc(stockView.data.currentStock) + '</strong></article>' +
        '<article class="metric"><span>Hũ chưa mở</span><strong>' + esc(b.sealedQty) + '</strong></article>' +
        '<article class="metric"><span>Hũ đang dùng</span><strong>' + esc(b.openQty) + '</strong></article>' +
        /* Phần chưa gắn được Unit hiện RIÊNG, không cộng thầm vào tổng rồi im. */
        '<article class="metric"><span>Chưa gắn Unit</span><strong>' +
        esc(Number(b.untrackedBase || 0) + Number(b.untrackedPendingDelta || 0)) + '</strong></article></div>';
    }

    function inventoryScreen() {
      return '<section class="panel"><div class="section-head"><div><p class="eyebrow">FIFO</p>' +
        '<h2>Kho theo từng lô</h2></div></div>' + stockMarkup() +
        '<form class="search-row" id="pos-unit-search"><input name="code" aria-label="Mã Unit" ' +
        'placeholder="Nhập hoặc quét mã Unit" required><button>Tra cứu</button></form>' +
        traceMarkup() + '</section>';
    }

    /* ---------- Màn ca ---------- */

    function shiftScreen() {
      var head = '<section class="panel"><div class="section-head"><div><p class="eyebrow">Ca làm việc</p>' +
        '<h2>Ca và két tiền</h2></div><button class="primary" id="pos-close-segment"' +
        ((shiftView.data && shiftView.data.openSegment) ? '' : ' disabled') + '>Chốt két</button></div>';
      if (shiftView.loading) return head + '<div class="empty"><h3>Đang đọc trạng thái ca…</h3></div></section>';
      if (shiftView.error) return head + errorBox('Không đọc được trạng thái ca', shiftView.error) + '</section>';
      var d = shiftView.data;
      if (!d) return head + '<div class="empty"><h3>Chưa có dữ liệu ca</h3></div></section>';
      return head + '<div class="metric-grid">' +
        '<article class="metric"><span>Ngày làm việc</span><strong>' +
          esc(d.businessDate || 'Chưa mở ngày') + '</strong></article>' +
        /* Ngày làm việc là trạng thái vận hành: chưa mở ở QUANLY thì POS nói
           thẳng là không bán được, không tự suy ngày từ đồng hồ máy. */
        '<article class="metric"><span>Trạng thái</span><strong>' +
          esc(d.operable ? 'Đang mở' : 'Chưa mở — không bán được') + '</strong></article>' +
        '<article class="metric"><span>Két đang mở</span><strong>' +
          esc(d.openSegment ? ('Lượt ' + d.openSegment.seq) : 'Không') + '</strong></article>' +
        '<article class="metric"><span>Đang trong ca</span><strong>' +
          esc(d.employeesOnShift.length) + '</strong></article></div></section>';
    }

    function content(screen) {
      if (screen === 'INVENTORY') return inventoryScreen();
      if (screen === 'SHIFT') return shiftScreen();
      return saleScreen();
    }

    /* ---------- Nối sự kiện ---------- */

    function bindNav() {
      Array.prototype.forEach.call(el.querySelectorAll('[data-screen]'), function (button) {
        button.addEventListener('click', function () {
          var screen = button.getAttribute('data-screen');
          controller.navigate(screen);
          render();
          if (screen === 'INVENTORY' && !stockView.data && !stockView.loading) loadStock();
          if (screen === 'SHIFT' && !shiftView.data && !shiftView.loading) loadShift();
        });
      });
    }

    function bindSale() {
      Array.prototype.forEach.call(el.querySelectorAll('[data-add]'), function (button) {
        button.addEventListener('click', function () {
          checkoutView = { busy: false, error: null, bill: null };
          controller.addLine({
            menuItemId: button.getAttribute('data-item'),
            name: button.getAttribute('data-name'),
            size: button.getAttribute('data-size'),
            unitPrice: Number(button.getAttribute('data-price')),
            recipeId: button.getAttribute('data-recipe') || null
          });
          render();
        });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-qty]'), function (button) {
        button.addEventListener('click', function () {
          controller.changeQty(button.getAttribute('data-key'), Number(button.getAttribute('data-qty')));
          render();
        });
      });
      var pay = el.querySelector('#pos-checkout');
      if (pay) pay.addEventListener('click', function () {
        checkoutView = { busy: true, error: null, bill: null };
        render();
        controller.checkout().then(function (out) {
          checkoutView = R.isErr(out)
            ? { busy: false, error: out.error, bill: null }
            : { busy: false, error: null, bill: out.value };
          render();
        });
      });
    }

    function bindInventory() {
      var form = el.querySelector('#pos-unit-search');
      if (!form) return;
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        traceView = { loading: true, error: null, data: null };
        render();
        controller.readUnitTrace({ containerCode: form.elements.code.value }).then(function (out) {
          traceView = applyRead(out);
          render();
        });
      });
    }

    function bindShift() {
      var close = el.querySelector('#pos-close-segment');
      if (!close) return;
      close.addEventListener('click', function () {
        var seg = shiftView.data && shiftView.data.openSegment;
        if (!seg) return;
        controller.closeCashSegment({ seq: seg.seq }).then(function (out) {
          if (R.isErr(out)) shiftView = { loading: false, error: out.error, data: shiftView.data };
          render();
          if (R.isOk(out)) loadShift();
        });
      });
    }

    function loadStock() {
      stockView = { loading: true, error: null, data: null };
      render();
      controller.readInventory({}).then(function (out) { stockView = applyRead(out); render(); });
    }

    function loadShift() {
      shiftView = { loading: true, error: null, data: null };
      render();
      controller.readShiftStatus({}).then(function (out) { shiftView = applyRead(out); render(); });
    }

    function render() {
      var state = controller.state();
      var readonly = state.mode === bootstrap.MODE.READ_ONLY;
      el.innerHTML = '<div class="app-shell"><header class="topbar"><div>' +
        '<p class="brand">gieo gieo</p><h1>Điểm bán hàng</h1></div>' +
        '<span class="status ' + (readonly ? 'warning' : 'success') + '">' + esc(state.mode) + '</span></header>' +
        (readonly ? '<div class="notice"><strong>Chế độ chỉ đọc</strong><span>Hệ thống cũ vẫn là nơi ghi production duy nhất.</span></div>' : '') +
        alertBanner() +
        '<main>' + content(state.screen) + '</main>' +
        '<nav class="bottom-nav" aria-label="Điều hướng POS">' +
          '<button data-screen="SALE" class="' + (state.screen === 'SALE' ? 'active' : '') + '"><span>◫</span>Bán hàng</button>' +
          '<button data-screen="INVENTORY" class="' + (state.screen === 'INVENTORY' ? 'active' : '') + '"><span>◉</span>Kho FIFO</button>' +
          '<button data-screen="SHIFT" class="' + (state.screen === 'SHIFT' ? 'active' : '') + '"><span>◷</span>Ca</button>' +
        '</nav></div>';
      bindNav();
      bindSale();
      bindInventory();
      bindShift();
    }

    render();
    controller.watchMenu({}, function (out) {
      menuView = applyRead(out);
      render();
    });
    controller.readAlerts({}).then(function (out) {
      /* Không đọc được cảnh báo thì im lặng bỏ banner, KHÔNG chặn màn bán hàng —
         nhưng cũng không dựng banner rỗng giả vờ là "không có cảnh báo nào". */
      alertView = applyRead(out);
      render();
    });
    return R.ok({ mode: runtime.mode });
  }

  return { showLogin: showLogin, start: start };
});
