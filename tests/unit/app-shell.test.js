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
    context: function () {
      return {
        storeId: 'store_1',
        actor: { actorId: 'actor_1' },
        businessDate: '2026-09-17',
        clock: { now: function () { return 1700000000000; } }
      };
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
  test('vòng đời ngày chỉ gọi command mới, không tự sửa state', function () {
    var runtime = fakeRuntime();
    var ql = _app.QL.createController(runtime);
    return Promise.all([
      ql.openBusinessDay({ storeId: 'store_main', dateKey: '2026-09-20' }),
      ql.closeBusinessDay({ day: { storeId: 'store_main', dateKey: '2026-09-20' } })
    ]).then(function () {
      assert.deepStrictEqual(runtime.calls.map(function (call) { return call.name; }),
        ['OpenBusinessDay', 'CloseBusinessDay']);
    });
  });

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

  test('found/revise/correction đều đi qua command catalog mới', function () {
    var runtime = fakeRuntime();
    var ql = _app.QL.createController(runtime);
    return Promise.all([
      ql.restoreFoundContainer({ unitId: 'unit_1' }),
      ql.reviseState({ referenceId: 'shift_1' }),
      ql.correctLedgerEntry({ entryId: 'ledger_1' })
    ]).then(function () {
      assert.deepStrictEqual(runtime.calls.map(function (call) { return call.name; }),
        ['RestoreFoundContainer', 'ReviseState', 'CorrectLedgerEntry']);
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

  test('thanh toán gửi đúng bill qua RecordSale, không tự tính tiền', function () {
    var runtime = fakeRuntime();
    var pos = posWith(runtime);
    pos.addLine({ menuItemId: 'item_1', size: 'M', unitPrice: 30000, qty: 2 });
    return pos.checkout({ method: 'CASH' }).then(function (out) {
      assertOk(out);
      var call = runtime.calls[0];
      assert.strictEqual(call.name, 'RecordSale');
      var bill = call.input.bill;
      assert.strictEqual(bill.storeId, 'store_1');
      assert.strictEqual(bill.soldByActorId, 'actor_1');
      assert.strictEqual(bill.businessDate, '2026-09-17');
      assert.strictEqual(bill.channel.type, 'DINE_IN');
      assert.deepStrictEqual(bill.payments, [{ method: 'CASH' }]);
      assert.strictEqual(bill.lines.length, 1);
      assert.deepStrictEqual({
        menuItemId: bill.lines[0].menuItemId, size: bill.lines[0].size,
        qty: bill.lines[0].qty, price: bill.lines[0].price, toppings: bill.lines[0].toppings
      }, { menuItemId: 'item_1', size: 'M', qty: 2, price: 30000, toppings: [] });
      /* subtotal/total do buildBill tính từ giá đã snapshot — chỗ duy nhất có
         hiệu lực, POS không tự nhét thêm trường tổng tiền nào khác. */
      assert.strictEqual(bill.subtotal, 60000);
      assert.strictEqual(bill.total, 60000);
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
    var ql = _app.QL.createController(runtime);
    assertOk(ql.navigate('ALERTS'));
    return ql.getAlerts({}).then(function () {
      assert.strictEqual(runtime.calls[0].input.audience, 'QUANLY');
    });
  });

  test('QUANLY đọc tồn qua GetInventoryLevel, không tự cộng Unit trong UI', function () {
    var runtime = fakeRuntime();
    var ql = _app.QL.createController(runtime);
    assertOk(ql.navigate('INVENTORY'));
    return ql.getInventoryLevel({ itemId: 'item_1' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].name, 'GetInventoryLevel');
      assert.strictEqual(runtime.calls[0].input.itemId, 'item_1');
    });
  });

  test('QUANLY mở màn BTP và đọc qua GetBTPReport của runtime', function () {
    var runtime = fakeRuntime();
    var ql = _app.QL.createController(runtime);
    assertOk(ql.navigate('BTP'));
    assert.strictEqual(ql.state().screen, 'BTP');
    return ql.getBTPReport({ businessDate: '2026-09-16' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].kind, 'query');
      assert.strictEqual(runtime.calls[0].name, 'GetBTPReport');
      assert.strictEqual(runtime.calls[0].input.businessDate, '2026-09-16');
    });
  });

  test('QUANLY đối chiếu giá vốn qua GetVarianceReport, không tính tại UI', function () {
    var runtime = fakeRuntime();
    var input = { businessDate: '2026-09-16', revenue: { netRevenue: 100 }, cogs: { cogsActual: 40 } };
    return _app.QL.createController(runtime).getVarianceReport(input).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].kind, 'query');
      assert.strictEqual(runtime.calls[0].name, 'GetVarianceReport');
      assert.strictEqual(runtime.calls[0].input, input);
    });
  });

  test('QUANLY đọc hao hụt và mất qua GetLossReport canonical', function () {
    var runtime = fakeRuntime();
    return _app.QL.createController(runtime).getLossReport({ businessDate: '2026-09-16' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].kind, 'query');
      assert.strictEqual(runtime.calls[0].name, 'GetLossReport');
      assert.strictEqual(runtime.calls[0].input.businessDate, '2026-09-16');
    });
  });

  test('QUANLY so sánh kỳ qua ComparePeriods và giữ nguyên hai Result có meta', function () {
    var runtime = fakeRuntime();
    var previous = { data: { netProfit: 10 }, meta: { frozen: true } };
    var current = { data: { netProfit: 12 }, meta: { frozen: false } };
    return _app.QL.createController(runtime).comparePeriods({ previous: previous, current: current }).then(function (out) {
      assertOk(out);
      assert.strictEqual(runtime.calls[0].name, 'ComparePeriods');
      assert.strictEqual(runtime.calls[0].input.previous, previous);
      assert.strictEqual(runtime.calls[0].input.current, current);
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
