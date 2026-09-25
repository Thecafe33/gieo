/** POS controller: chỉ điều phối UI → runtime, không tính kho/giá/COGS. */
GIEO.define('app-pos/controller', [
  'shared-kernel/result',
  'bootstrap/runtime'
], function (R, bootstrap) {
  'use strict';

  function createController(runtime) {
    runtime = runtime || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var state = {
      mode: runtime.mode,
      screen: 'SALE',
      busy: false,
      lastResult: null,
      lastError: null
    };

    /* Giỏ hàng là TRẠNG THÁI CHỌN của màn hình, không phải trạng thái nghiệp vụ.
       Nó chỉ giữ "người bán đã bấm những món nào" — giá cuối, giảm giá, phí kênh,
       FIFO và COGS đều do RecordSale quyết. Đây đúng là gate của Phase 9: POS
       không còn business inventory logic độc lập. */
    var cart = [];

    function snapshot() {
      return Object.assign({}, state, { cart: cart.slice(), cartSubtotal: subtotal() });
    }

    /**
     * Tạm tính để người bán đọc tại chỗ, CỐ Ý không gọi là "tổng tiền".
     * Con số có hiệu lực là con số RecordSale trả về; hai chỗ tính tiền độc lập
     * chính là kiểu lệch mà legacy đã mắc ở doanh thu.
     */
    function subtotal() {
      return cart.reduce(function (sum, line) { return sum + line.unitPrice * line.qty; }, 0);
    }

    function lineKey(line) {
      return [line.menuItemId, line.size || '', (line.toppingIds || []).slice().sort().join('+')].join('|');
    }

    function addLine(line) {
      if (!line || !line.menuItemId) return R.err('VALIDATION', 'addLine cần menuItemId');
      if (typeof line.unitPrice !== 'number' || !isFinite(line.unitPrice)) {
        /* Giá phải đến từ GetMenu. Không có giá thì không thêm — POS không được
           tự bịa giá, kể cả giá 0. */
        return R.err('VALIDATION', 'addLine cần unitPrice lấy từ GetMenu');
      }
      var qty = typeof line.qty === 'number' && line.qty > 0 ? line.qty : 1;
      var key = lineKey(line);
      var existing = cart.filter(function (l) { return l.key === key; })[0];
      if (existing) existing.qty += qty;
      else {
        cart.push({
          key: key,
          menuItemId: line.menuItemId,
          name: line.name || line.menuItemId,
          size: line.size || null,
          toppingIds: (line.toppingIds || []).slice(),
          unitPrice: line.unitPrice,
          qty: qty
        });
      }
      return R.ok(snapshot());
    }

    function changeQty(key, delta) {
      var idx = -1;
      for (var i = 0; i < cart.length; i++) if (cart[i].key === key) { idx = i; break; }
      if (idx === -1) return R.err('NOT_FOUND', 'không có dòng ' + key + ' trong giỏ');
      cart[idx].qty += delta;
      if (cart[idx].qty <= 0) cart.splice(idx, 1);
      return R.ok(snapshot());
    }

    function clearCart() { cart = []; return R.ok(snapshot()); }

    /**
     * Thanh toán. Giỏ chỉ được dọn khi RecordSale thành công — dọn trước rồi
     * command hỏng là cách mất đơn mà người bán không biết đơn đã mất.
     */
    function checkout(payment) {
      if (!cart.length) return Promise.resolve(R.err('VALIDATION', 'giỏ hàng trống'));
      return run('RecordSale', {
        lines: cart.map(function (l) {
          return {
            menuItemId: l.menuItemId, size: l.size,
            toppingIds: l.toppingIds.slice(), qty: l.qty
          };
        }),
        payment: payment || null
      }).then(function (out) {
        if (R.isOk(out)) clearCart();
        return out;
      });
    }
    function navigate(screen) {
      if (['SALE', 'INVENTORY', 'SHIFT'].indexOf(screen) === -1) {
        return R.err('VALIDATION', 'màn POS không hợp lệ: ' + screen);
      }
      state.screen = screen;
      return R.ok(snapshot());
    }
    function run(commandName, input) {
      state.busy = true;
      state.lastError = null;
      return runtime.command(commandName, input || {}).then(function (result) {
        state.busy = false;
        if (R.isErr(result)) state.lastError = result.error;
        else state.lastResult = result.value;
        return result;
      });
    }
    function read(queryName, input) {
      state.busy = true;
      return Promise.resolve(runtime.query(queryName, input || {})).then(function (result) {
        state.busy = false;
        if (R.isErr(result)) state.lastError = result.error;
        else state.lastResult = result.value;
        return result;
      });
    }
    function retryPrint(payload) {
      if (!runtime.device || typeof runtime.device.printBill !== 'function') {
        return Promise.resolve(R.err('NOT_FOUND', 'chưa kết nối máy in bill'));
      }
      /* Retry chỉ gọi adapter thiết bị, tuyệt đối không chạy lại RecordSale. */
      return Promise.resolve(runtime.device.printBill(payload));
    }
    function watchMenu(input, listener) {
      if (typeof runtime.watch === 'function') return runtime.watch('GetMenu', input || {}, listener);
      read('GetMenu', input || {}).then(listener);
      return function () {};
    }

    return {
      state: snapshot,
      navigate: navigate,
      readMenu: function (input) { return read('GetMenu', input); },
      watchMenu: watchMenu,
      addLine: addLine,
      changeQty: changeQty,
      clearCart: clearCart,
      cart: function () { return cart.slice(); },
      cartSubtotal: subtotal,
      checkout: checkout,
      readInventory: function (input) { return read('GetInventoryLevel', input); },
      readShiftStatus: function (input) { return read('GetShiftStatus', input); },
      readAlerts: function (input) { return read('GetAlerts', Object.assign({ audience: 'POS' }, input || {})); },
      readUnitTrace: function (input) { return read('GetUnitTrace', input); },
      recordSale: function (input) { return run('RecordSale', input); },
      recordWaste: function (input) { return run('RecordWaste', input); },
      reportLost: function (input) { return run('ReportLostContainer', input); },
      closeCashSegment: function (input) { return run('CloseCashSegment', input); },
      retryPrint: retryPrint
    };
  }

  return { createController: createController };
});
