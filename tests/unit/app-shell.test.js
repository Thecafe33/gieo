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
