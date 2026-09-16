/** P9/P10 — thin-client boundary, READ_ONLY gate và device retry. */
var _app = (function () {
  return {
    R: GIEO.require('shared-kernel/result'),
    BOOT: GIEO.require('bootstrap/runtime'),
    POS: GIEO.require('app-pos/controller'),
    QL: GIEO.require('app-quanly/controller')
  };
})();

function fakeRuntime(mode) {
  var calls = [];
  var prints = [];
  return {
    mode: mode || 'SHADOW',
    calls: calls,
    prints: prints,
    query: function (name, input) {
      calls.push({ kind: 'query', name: name, input: input });
      return Promise.resolve(_app.R.ok({ name: name }));
    },
    watch: function (name, input, listener) {
      calls.push({ kind: 'watch', name: name, input: input });
      listener(_app.R.ok({ name: name }));
      return function () {};
    },
    command: function (name, input) {
      calls.push({ kind: 'command', name: name, input: input });
      return Promise.resolve(_app.R.ok({ name: name }));
    },
    device: {
      printBill: function (payload) {
        prints.push(payload);
        return _app.R.ok({ printed: true });
      }
    }
  };
}

describe('P9 POS thin client', function () {
  test('bán hàng chỉ gọi RecordSale, không tự đụng FIFO', function () {
    var runtime = fakeRuntime();
    var pos = _app.POS.createController(runtime);
    return pos.recordSale({ checkoutId: 'checkout_1' }).then(function (out) {
      assertOk(out);
      assert.deepStrictEqual(runtime.calls, [{
        kind: 'command', name: 'RecordSale', input: { checkoutId: 'checkout_1' }
      }]);
    });
  });

  test('retry print không chạy lại command bán hàng', function () {
    var runtime = fakeRuntime();
    var pos = _app.POS.createController(runtime);
    return pos.retryPrint({ billId: 'bill_1' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls.length, 0);
      assert.deepStrictEqual(runtime.prints, [{ billId: 'bill_1' }]);
    });
  });

  test('đọc tồn kho đi qua GetInventoryLevel', function () {
    var runtime = fakeRuntime();
    return _app.POS.createController(runtime).readInventory({ itemId: 'item_1' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].name, 'GetInventoryLevel');
    });
  });

  test('menu POS chỉ đọc qua GetMenu', function () {
    var runtime = fakeRuntime();
    return _app.POS.createController(runtime).readMenu({}).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].name, 'GetMenu');
    });
  });

  test('menu realtime cũng chỉ đi qua GetMenu watch', function () {
    var runtime = fakeRuntime();
    var received;
    var unsubscribe = _app.POS.createController(runtime).watchMenu({}, function (out) { received = out; });
    assertOk(received);
    assert.strictEqual(runtime.calls[0].kind, 'watch');
    assert.strictEqual(runtime.calls[0].name, 'GetMenu');
    assert.strictEqual(typeof unsubscribe, 'function');
  });
});

describe('P10 QUANLY thin client', function () {
  test('drill Unit chỉ gọi GetUnitTrace', function () {
    var runtime = fakeRuntime();
    return _app.QL.createController(runtime).getUnitTrace({ unitId: 'unit_1' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].name, 'GetUnitTrace');
    });
  });

  test('hoàn đơn đi chung ReverseTransaction, không có inventory engine riêng', function () {
    var runtime = fakeRuntime();
    return _app.QL.createController(runtime).reverseOrder({ referenceId: 'bill_1' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].name, 'ReverseTransaction');
    });
  });
});

describe('bootstrap runtime — rollout gate', function () {
  test('READ_ONLY từ chối mọi mutation trước khi cần context', function () {
    var runtime = _app.BOOT.createRuntime({ mode: _app.BOOT.MODE.READ_ONLY });
    return runtime.command('RecordSale', {}).then(function (out) {
      assertErr(out, 'FORBIDDEN');
      assert.ok(/sole writer/.test(out.error.message));
    });
  });

  test('command/query lạ mặc định đóng', function () {
    var runtime = _app.BOOT.createRuntime({ mode: _app.BOOT.MODE.READ_ONLY });
    return Promise.all([
      runtime.query('DocThangFirebase', {}),
      runtime.command('SuaKhoTrucTiep', {})
    ]).then(function (out) {
      assertErr(out[0], 'NOT_FOUND');
      assertErr(out[1], 'NOT_FOUND');
    });
  });
});

describe('P9 — giỏ hàng POS là trạng thái chọn, không phải nghiệp vụ', function () {
  function posWith(runtime) { return _app.POS.createController(runtime || fakeRuntime()); }

  test('không thêm được món khi giá không đến từ GetMenu', function () {
    var pos = posWith();
    assertErr(pos.addLine({ menuItemId: 'item_1', name: 'Trà' }), 'VALIDATION');
    assert.strictEqual(pos.cart().length, 0);
  });

  test('cùng món cùng size gộp dòng, khác size tách dòng', function () {
    var pos = posWith();
    assertOk(pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000 }));
    assertOk(pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000 }));
    assertOk(pos.addLine({ menuItemId: 'item_1', size: 'L', unitPrice: 40000 }));
    assert.strictEqual(pos.cart().length, 2);
    assert.strictEqual(pos.cart()[0].qty, 2);
    assert.strictEqual(pos.cartSubtotal(), 30000 * 2 + 40000);
  });

  test('bớt về 0 thì dòng biến mất, không để lại dòng qty âm', function () {
    var pos = posWith();
    pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000 });
    var key = pos.cart()[0].key;
    assertOk(pos.changeQty(key, -1));
    assert.strictEqual(pos.cart().length, 0);
    assertErr(pos.changeQty(key, -1), 'NOT_FOUND');
  });

  test('thanh toán gửi đúng các dòng qua RecordSale, không tự tính tiền', function () {
    var runtime = fakeRuntime();
    var pos = posWith(runtime);
    pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000, qty: 2 });
    return pos.checkout({ method: 'CASH' }).then(function (out) {
      assertOk(out);
      var call = runtime.calls[0];
      assert.strictEqual(call.name, 'RecordSale');
      assert.deepStrictEqual(call.input.lines, [
        { menuItemId: 'item_1', size: 'M', toppingIds: [], qty: 2 }
      ]);
      /* Không có trường tổng tiền nào do POS tự tính lọt vào command. */
      assert.strictEqual(call.input.total, undefined);
      assert.strictEqual(call.input.subtotal, undefined);
    });
  });

  test('giỏ trống không gọi command', function () {
    var runtime = fakeRuntime();
    return posWith(runtime).checkout().then(function (out) {
      assertErr(out, 'VALIDATION');
      assert.strictEqual(runtime.calls.length, 0);
    });
  });

  test('RecordSale hỏng thì GIỮ NGUYÊN giỏ — không để mất đơn trong im lặng', function () {
    var runtime = fakeRuntime();
    runtime.command = function () { return Promise.resolve(_app.R.err('RETRYABLE', 'mạng lỗi')); };
    var pos = posWith(runtime);
    pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000 });
    return pos.checkout().then(function (out) {
      assertErr(out, 'RETRYABLE');
      assert.strictEqual(pos.cart().length, 1);
    });
  });

  test('READ_ONLY chặn thanh toán nhưng giỏ vẫn còn để bán lại sau', function () {
    var runtime = _app.BOOT.createRuntime({ mode: _app.BOOT.MODE.READ_ONLY });
    var pos = posWith(runtime);
    pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000 });
    return pos.checkout().then(function (out) {
      assertErr(out, 'FORBIDDEN');
      assert.strictEqual(pos.cart().length, 1);
    });
  });
});

describe('P9/P10 — màn Ca, Cảnh báo, Duyệt đều đi qua read-layer', function () {
  test('POS đọc ca và cảnh báo qua query, cảnh báo mặc định audience POS', function () {
    var runtime = fakeRuntime();
    var pos = _app.POS.createController(runtime);
    return Promise.all([pos.readShiftStatus({}), pos.readAlerts({})]).then(function () {
      assert.deepStrictEqual(runtime.calls.map(function (c) { return c.name; }),
        ['GetShiftStatus', 'GetAlerts']);
      assert.strictEqual(runtime.calls[1].input.audience, 'POS');
    });
  });

  test('QUANLY đọc cảnh báo với audience QUANLY, không dùng chung của POS', function () {
    var runtime = fakeRuntime();
    return _app.QL.createController(runtime).getAlerts({}).then(function () {
      assert.strictEqual(runtime.calls[0].input.audience, 'QUANLY');
    });
  });

  test('duyệt chạy đúng command mà query đã gắn sẵn', function () {
    var runtime = fakeRuntime();
    var ql = _app.QL.createController(runtime);
    return ql.approvePending({
      type: 'lostReport', command: 'ApproveLostContainer', referenceId: 'lost_1'
    }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].kind, 'command');
      assert.strictEqual(runtime.calls[0].name, 'ApproveLostContainer');
      assert.strictEqual(runtime.calls[0].input.referenceId, 'lost_1');
    });
  });

  test('việc không mang command thì TỪ CHỐI, không đoán command', function () {
    var runtime = fakeRuntime();
    return _app.QL.createController(runtime).approvePending({
      type: 'khongBietLaGi', referenceId: 'x_1'
    }).then(function (out) {
      assertErr(out, 'VALIDATION');
      assert.strictEqual(runtime.calls.length, 0);
    });
  });
});
