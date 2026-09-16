/**
 * packages/protected-adapters.
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md. Gate: §8.
 */

var _pa = (function () {
  return {
    Q: GIEO.require('protected-adapters/print-queue'),
    NB: GIEO.require('protected-adapters/native-bridge'),
    BP: GIEO.require('protected-adapters/bill-printer'),
    LP: GIEO.require('protected-adapters/label-printer'),
    SC: GIEO.require('protected-adapters/scanner'),
    BK: GIEO.require('protected-adapters/bank-payment'),
    R: GIEO.require('shared-kernel/result'),
    CLK: GIEO.require('shared-kernel/clock')
  };
})();

/** Máy in giả — điều khiển được lượt nào hỏng. */
function fakePrinter(opts) {
  opts = opts || {};
  var calls = { bill: [], label: [], bt: [], lan: [], drawer: 0 };
  var failNext = opts.failNext || 0;
  return {
    calls: calls,
    failOnce: function () { failNext += 1; },
    printBillRawBytes: function (b) {
      calls.bill.push(b);
      if (failNext > 0) { failNext -= 1; return Promise.reject(new Error('mất kết nối')); }
      return Promise.resolve(true);
    },
    printRawBytes: function (b) {
      calls.label.push(b);
      if (failNext > 0) { failNext -= 1; return Promise.reject(new Error('hết giấy')); }
      return Promise.resolve(true);
    },
    connectBluetoothApp: function (mac) { calls.bt.push(mac); return Promise.resolve(true); },
    connectPrinter: function (ip, port) { calls.lan.push([ip, port]); return Promise.resolve(true); },
    openCashDrawer: function () { calls.drawer += 1; return Promise.resolve(true); }
  };
}

describe('print-queue — BUG THẬT đã sửa: queue tự phục hồi (§1.2, §6.1)', function () {
  var Q = _pa.Q;
  var R = _pa.R;

  test('một lượt hỏng KHÔNG đầu độc mọi lượt sau — đây chính là bug legacy', function () {
    var q = Q.createPrintQueue({ name: 'test' });
    var ran = [];
    var a = q.enqueue(function () { ran.push('a'); throw new Error('mất kết nối'); }, 'a');
    var b = q.enqueue(function () { ran.push('b'); return true; }, 'b');
    var c = q.enqueue(function () { ran.push('c'); return true; }, 'c');

    return Promise.all([a, b, c]).then(function (rs) {
      assert.strictEqual(R.isErr(rs[0]), true);
      assert.strictEqual(R.isOk(rs[1]), true, 'lượt sau lỗi không chạy — queue bị đầu độc như legacy');
      assert.strictEqual(R.isOk(rs[2]), true);
      assert.deepStrictEqual(ran, ['a', 'b', 'c']);
    });
  });

  test('queue vẫn khoẻ sau nhiều lần lỗi liên tiếp', function () {
    var q = Q.createPrintQueue({ name: 'test' });
    var jobs = [];
    for (var i = 0; i < 5; i++) jobs.push(q.enqueue(function () { throw new Error('x'); }));
    jobs.push(q.enqueue(function () { return 'ok'; }));
    return Promise.all(jobs).then(function (rs) {
      assert.strictEqual(R.isOk(rs[5]), true);
      assert.strictEqual(q.isHealthy(), true);
      assert.strictEqual(q.snapshot().failed, 5);
      assert.strictEqual(q.snapshot().done, 1);
    });
  });

  test('lỗi in là GIÁ TRỊ TRẢ VỀ, không phải exception — không làm sập luồng bán', function () {
    var q = Q.createPrintQueue({ name: 'test' });
    /* Nếu enqueue reject thì await không có catch sẽ làm vỡ luồng thanh toán. */
    return q.enqueue(function () { throw new Error('hỏng'); }).then(function (r) {
      assert.strictEqual(R.isErr(r), true);
      assert.strictEqual(r.error.kind, 'RETRYABLE');
    });
  });

  test('handler báo lỗi của người dùng hỏng cũng không nghẽn queue', function () {
    var q = Q.createPrintQueue({
      name: 'test', onError: function () { throw new Error('toast hỏng'); }
    });
    return q.enqueue(function () { throw new Error('in hỏng'); })
      .then(function () { return q.enqueue(function () { return 'sau'; }); })
      .then(function (r) { assert.strictEqual(R.isOk(r), true); });
  });

  test('giữ đúng thứ tự — máy in chỉ nhận tuần tự', function () {
    var q = Q.createPrintQueue({ name: 'test' });
    var order = [];
    var jobs = [1, 2, 3].map(function (n) {
      return q.enqueue(function () {
        return new Promise(function (res) {
          setTimeout(function () { order.push(n); res(true); }, (4 - n) * 5);
        });
      });
    });
    return Promise.all(jobs).then(function () {
      assert.deepStrictEqual(order, [1, 2, 3]);
    });
  });
});

describe('BillPrinterAdapter (§1)', function () {
  var R = _pa.R;

  function setup(printerOpts) {
    var p = fakePrinter(printerOpts);
    var bridge = _pa.NB.createNativeBridge({ printer: p });
    return { p: p, printer: _pa.BP.createBillPrinter({ bridge: bridge }) };
  }

  test('in qua printBillRawBytes, KHÔNG dùng lẫn với đường tem (§1.3)', function () {
    var s = setup();
    return s.printer.print({ text: 'bill' }).then(function (r) {
      assert.strictEqual(R.isOk(r), true);
      assert.strictEqual(s.p.calls.bill.length, 1);
      assert.strictEqual(s.p.calls.label.length, 0, 'bill bị gửi qua đường tem');
    });
  });

  test('in hỏng KHÔNG ném lỗi ra ngoài — kho đã trừ, bill đã ghi rồi (§1.1)', function () {
    var s = setup({ failNext: 1 });
    return s.printer.print({ text: 'bill' }).then(function (r) {
      assert.strictEqual(R.isErr(r), true);
    });
  });

  test('sau lần in hỏng, lần in kế tiếp VẪN CHẠY (fix §6.1)', function () {
    var s = setup({ failNext: 1 });
    return s.printer.print({ text: 'b1' })
      .then(function () { return s.printer.print({ text: 'b2' }); })
      .then(function (r) {
        assert.strictEqual(R.isOk(r), true, 'legacy sẽ im lặng không in nữa tới khi reload app');
        assert.strictEqual(s.p.calls.bill.length, 2);
      });
  });

  test('reprint cũng chạy được sau lỗi — đúng chỗ legacy hỏng nặng nhất', function () {
    var s = setup({ failNext: 1 });
    return s.printer.print({ text: 'b1' })
      .then(function () { return s.printer.reprint({ text: 'b1' }); })
      .then(function (r) { assert.strictEqual(R.isOk(r), true); });
  });

  test('chưa ghép nối Bluetooth thì báo rõ, không tự pair', function () {
    return setup().printer.connect().then(function (r) {
      assertErr(r, 'PRECONDITION');
      assert.ok(/Cài đặt Android/.test(r.error.message));
    });
  });

  test('nhớ MAC rồi tự nối lại lúc khởi động', function () {
    var s = setup();
    s.printer.rememberMac('AA:BB:CC');
    return s.printer.reconnectOnBoot().then(function (r) {
      assert.strictEqual(R.isOk(r), true);
      assert.deepStrictEqual(s.p.calls.bt, ['AA:BB:CC']);
    });
  });

  test('chưa nhớ MAC thì bỏ qua lúc khởi động, không báo lỗi giả', function () {
    return setup().printer.reconnectOnBoot().then(function (r) {
      assert.strictEqual(R.isOk(r), true);
      assert.strictEqual(r.value.skipped, 'NO_REMEMBERED_MAC');
    });
  });

  test('tắt máy in thì bỏ qua, không xếp hàng vô ích', function () {
    var s = setup();
    s.printer.setEnabled(false);
    return s.printer.print({ text: 'x' }).then(function (r) {
      assert.strictEqual(r.value.skipped, 'PRINTER_DISABLED');
      assert.strictEqual(s.p.calls.bill.length, 0);
    });
  });

  test('KHÔNG có đường Web Serial/XprinterWNN58E (đã chốt cắt bỏ)', function () {
    var s = setup();
    assert.strictEqual(s.printer.connectWebSerial, undefined);
    assert.strictEqual(s.printer.fallbackPrint, undefined);
  });

  test('cầu nối thiếu hàm thì báo lỗi rõ, KHÔNG thử đường khác (§2.4)', function () {
    var bridge = _pa.NB.createNativeBridge({ printer: {} });
    var printer = _pa.BP.createBillPrinter({ bridge: bridge });
    return printer.print({ text: 'x' }).then(function (r) {
      assert.strictEqual(R.isErr(r), true);
    });
  });
});

describe('LabelPrinterAdapter (§2)', function () {
  var R = _pa.R;

  function setup(printerOpts) {
    var p = fakePrinter(printerOpts);
    var bridge = _pa.NB.createNativeBridge({ printer: p });
    var lp = _pa.LP.createLabelPrinter({ bridge: bridge });
    lp.rememberIp('192.168.1.50');
    return { p: p, lp: lp };
  }

  test('queue ĐỘC LẬP với máy in bill — tem kẹt giấy không nghẽn in bill (gate §8)', function () {
    var p = fakePrinter({ failNext: 1 });
    var bridge = _pa.NB.createNativeBridge({ printer: p });
    var bill = _pa.BP.createBillPrinter({ bridge: bridge });
    var label = _pa.LP.createLabelPrinter({ bridge: bridge });
    label.rememberIp('192.168.1.50');

    return label.print({ px: 1 }, {})
      .then(function (r) {
        assert.strictEqual(R.isErr(r), true);
        return bill.print({ text: 'bill' });
      })
      .then(function (r) {
        assert.strictEqual(R.isOk(r), true, 'lỗi tem làm nghẽn cả in bill — 2 queue không độc lập');
      });
  });

  test('mặc định TSPL, có SIZE/GAP/OFFSET để máy tự canh tem (§2.3)', function () {
    var s = setup();
    assert.strictEqual(s.lp.state().engine, 'TSPL');
    var enc = s.lp.encode({ px: 1 }, { size: '40x30', gap: 2 });
    assert.strictEqual(enc.engine, 'TSPL');
    assert.strictEqual(enc.header.size, '40x30');
  });

  test('ESC/POS không có khái niệm khổ tem — header null', function () {
    var s = setup();
    assertOk(s.lp.setEngine('ESCPOS'));
    assert.strictEqual(s.lp.encode({ px: 1 }, { size: '40x30' }).header, null);
  });

  test('KHÔNG auto-detect giao thức — chọn tay, giao thức lạ bị từ chối', function () {
    assertErr(setup().lp.setEngine('ZPL'), 'VALIDATION');
  });

  test('lớp 1: tự nối lại ngay trước khi in', function () {
    var s = setup();
    return s.lp.print({ px: 1 }, {}).then(function () {
      assert.deepStrictEqual(s.p.calls.lan, [['192.168.1.50', 9100]]);
    });
  });

  test('lớp 3: single-flight — nhiều lượt in song song chỉ gọi connect MỘT lần', function () {
    var s = setup();
    return Promise.all([
      s.lp.ensureConnected(), s.lp.ensureConnected(), s.lp.ensureConnected()
    ]).then(function () {
      assert.strictEqual(s.p.calls.lan.length, 1, 'gọi connect chồng lấp — máy chỉ nhận 1 phiên TCP');
    });
  });

  test('mất kết nối giữa chừng thì lượt sau nối lại, KHÔNG thử đường gửi khác', function () {
    var s = setup({ failNext: 1 });
    return s.lp.print({ px: 1 }, {})
      .then(function () {
        assert.strictEqual(s.lp.state().connected, false);
        return s.lp.print({ px: 2 }, {});
      })
      .then(function (r) {
        assert.strictEqual(R.isOk(r), true);
        assert.strictEqual(s.p.calls.lan.length, 2, 'không nối lại sau khi rớt');
      });
  });

  test('lớp 2: watchdog FEATURE-DETECT — APK cũ thì bỏ qua, không nổ', function () {
    var s = setup();
    return s.lp.startKeepAlive().then(function (r) {
      assert.strictEqual(R.isOk(r), true);
      assert.strictEqual(r.value.skipped, 'APK_KHONG_HO_TRO');
    });
  });

  test('APK mới thì bật watchdog thật', function () {
    var p = fakePrinter();
    p.setTemKeepAlive = function () { return Promise.resolve(true); };
    p.getTemStatus = function () { return Promise.resolve({ connected: true }); };
    var lp = _pa.LP.createLabelPrinter({ bridge: _pa.NB.createNativeBridge({ printer: p }) });
    return lp.startKeepAlive().then(function (r) {
      assert.strictEqual(R.isOk(r), true);
      assert.strictEqual(lp.state().keepAliveOn, true);
    });
  });

  test('chưa biết IP thì báo rõ', function () {
    var lp = _pa.LP.createLabelPrinter({ bridge: _pa.NB.createNativeBridge({ printer: fakePrinter() }) });
    return lp.ensureConnected().then(function (r) { assertErr(r, 'PRECONDITION'); });
  });

  test('in nhiều tem vẫn TUẦN TỰ — song song hoá là cách làm rớt kết nối', function () {
    var s = setup();
    return s.lp.printBatch([{ px: 1 }, { px: 2 }, { px: 3 }], {}).then(function (r) {
      assert.strictEqual(r.value.total, 3);
      assert.strictEqual(r.value.ok, 3);
      assert.strictEqual(s.p.calls.label.length, 3);
    });
  });

  test('một tem hỏng không chặn các tem còn lại', function () {
    var s = setup({ failNext: 1 });
    return s.lp.printBatch([{ px: 1 }, { px: 2 }, { px: 3 }], {}).then(function (r) {
      assert.strictEqual(r.value.failed, 1);
      assert.strictEqual(r.value.ok, 2);
    });
  });

  test('KHÔNG có đường gửi fallback thứ hai (§2.4)', function () {
    var s = setup();
    assert.strictEqual(s.lp.sendViaRawBT, undefined);
    assert.strictEqual(s.lp.fallbackSend, undefined);
  });
});

describe('ScannerAdapter (§3)', function () {
  function setup(hasScanner) {
    var scanned = [];
    var scanner = hasScanner === false ? null : {
      scan: function (id) { scanned.push(id); }
    };
    var bridge = _pa.NB.createNativeBridge({ scanner: scanner });
    var sc = _pa.SC.createScanner({ bridge: bridge, timeoutMs: 50 });
    return { sc: sc, scanned: scanned };
  }

  test('LUÔN resolve, KHÔNG BAO GIỜ reject — quét không ra mã là chuyện thường ngày', function () {
    var s = setup();
    var p = s.sc.scan();
    return p.then(function (res) {
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.reason, 'TIMEOUT');
    });
  });

  test('quét thành công trả {ok, code, format}', function () {
    var s = setup();
    var p = s.sc.scan();
    setTimeout(function () {
      s.sc.handleNativeResult({ id: s.scanned[0], code: 'GG-123', format: 'CODE128' });
    }, 5);
    return p.then(function (res) {
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.code, 'GG-123');
      assert.strictEqual(res.source, 'SCANNER');
    });
  });

  test('có timeout đề phòng app native treo', function () {
    var s = setup();
    var t0 = Date.now();
    return s.sc.scan().then(function (res) {
      assert.strictEqual(res.reason, 'TIMEOUT');
      assert.ok(Date.now() - t0 >= 45);
    });
  });

  test('máy không có scanner thì nói rõ và cho phép nhập tay', function () {
    var s = setup(false);
    return s.sc.scan().then(function (res) {
      assert.strictEqual(res.reason, 'NO_SCANNER');
      assert.strictEqual(res.canFallbackToManual, true);
    });
  });

  test('FALLBACK NHẬP TAY — bổ sung so với legacy (§3.3, §6.2)', function () {
    var res = setup().sc.manualEntry('  GG-999  ');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.code, 'GG-999');
    /* Cùng hình dạng với scan() nên nơi gọi không phải rẽ nhánh theo nguồn. */
    assert.strictEqual(res.source, 'MANUAL');
  });

  test('mã nhập tay rỗng bị từ chối', function () {
    assert.strictEqual(setup().sc.manualEntry('   ').ok, false);
  });

  test('người dùng huỷ quét cũng resolve, không reject', function () {
    var s = setup();
    var p = s.sc.scan();
    setTimeout(function () { s.sc.handleNativeResult({ id: s.scanned[0], cancelled: true }); }, 5);
    return p.then(function (res) { assert.strictEqual(res.reason, 'CANCELLED'); });
  });

  test('kết quả đến sau timeout bị bỏ qua có kiểm soát, không nổ', function () {
    var s = setup();
    return s.sc.scan().then(function () {
      assertErr(s.sc.handleNativeResult({ id: s.scanned[0], code: 'X' }), 'NOT_FOUND');
    });
  });

  test('native gọi hai lần chỉ ăn lần đầu', function () {
    var s = setup();
    var p = s.sc.scan();
    setTimeout(function () {
      s.sc.handleNativeResult({ id: s.scanned[0], code: 'A' });
      s.sc.handleNativeResult({ id: s.scanned[0], code: 'B' });
    }, 5);
    return p.then(function (res) { assert.strictEqual(res.code, 'A'); });
  });

  test('đóng màn hình huỷ mọi lượt đang chờ', function () {
    var s = setup();
    var p = s.sc.scan();
    assert.strictEqual(s.sc.pendingCount(), 1);
    s.sc.cancelAll();
    return p.then(function (res) {
      assert.strictEqual(res.reason, 'CANCELLED');
      assert.strictEqual(s.sc.pendingCount(), 0);
    });
  });

  test('KHÔNG chứa logic đối chiếu mã trùng — đó thuộc Unit Identity (§5)', function () {
    var s = setup();
    assert.strictEqual(s.sc.chanMaTrung, undefined);
    assert.strictEqual(s.sc.findContainerByCode, undefined);
  });
});

describe('BankPaymentAdapter (§4)', function () {
  var R = _pa.R;

  function fakeStore() {
    var listeners = Object.create(null);
    var removed = [];
    return {
      removed: removed,
      fire: function (id, snap) { if (listeners[id]) listeners[id](snap); },
      listen: function (id, cb) {
        listeners[id] = cb;
        return function () { delete listeners[id]; };
      },
      remove: function (id) { removed.push(id); delete listeners[id]; }
    };
  }

  function setup() {
    var store = fakeStore();
    var confirmed = [];
    var bk = _pa.BK.createBankPayment({
      confirmationStore: store,
      clock: _pa.CLK.createClock({ now: function () { return new Date(2026, 2, 10, 14, 5, 30).getTime(); } }),
      bankAccount: '0123456789',
      qrBaseUrl: 'https://img.vietqr.io/image',
      onConfirmed: function (s) { confirmed.push(s); }
    });
    return { store: store, bk: bk, confirmed: confirmed };
  }

  test("mã giao dịch giữ định dạng 'GG' + ddHHmmss — có ý nghĩa khi đối soát sao kê", function () {
    var id = _pa.BK.genBankOrderId(new Date(2026, 2, 10, 14, 5, 30).getTime());
    assert.strictEqual(id, 'GG10140530');
  });

  test('QR mang addInfo = bankOrderId để webhook khớp được', function () {
    var s = setup();
    var qr = assertOk(s.bk.buildQrUrl({ bankOrderId: 'GG10140530', amount: 55000 }));
    assert.ok(qr.url.indexOf('addInfo=GG10140530') !== -1);
    assert.ok(qr.url.indexOf('amount=55000') !== -1);
  });

  test('webhook về thì chốt và XOÁ node ngay — bắt tay một lần', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    s.store.fire(session.bankOrderId, { amount: 55000 });
    assert.deepStrictEqual(s.store.removed, [session.bankOrderId]);
    assert.strictEqual(s.confirmed.length, 1);
  });

  test('bấm tay chạy ĐÚNG đường như webhook, không có luồng riêng (§4.1)', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    var r = assertOk(s.bk.confirmManually(session.bankOrderId));
    assert.strictEqual(r.source, 'MANUAL');
    assert.deepStrictEqual(s.store.removed, [session.bankOrderId]);
  });

  test('chốt hai lần là no-op — one-shot', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    assertOk(s.bk.confirmManually(session.bankOrderId));
    assertErr(s.bk.confirmManually(session.bankOrderId), 'NOT_FOUND');
    assert.strictEqual(s.store.removed.length, 1);
  });

  test('KHÔNG đối chiếu số tiền phía client, và NÓI RÕ điều đó (§4.2)', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    /* Webhook báo số tiền KHÁC hẳn — client vẫn chốt, đúng contract hiện tại. */
    s.store.fire(session.bankOrderId, { amount: 1000 });
    assert.strictEqual(s.confirmed.length, 1, 'client tự thêm đối chiếu — đổi semantics ranh giới protected');
    assert.strictEqual(s.confirmed[0].amount, 55000, 'số tiền kỳ vọng vẫn được ghi lại để đối soát sau');
  });

  test('kết quả chốt mang cờ amountNotVerifiedClientSide', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    var r = assertOk(s.bk.confirmManually(session.bankOrderId));
    assert.strictEqual(r.amountNotVerifiedClientSide, true);
    assert.strictEqual(r.expectedAmount, 55000);
  });

  test('KHÔNG có timeout tự đóng QR — nhân viên toàn quyền quyết định (§4.3)', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    assert.strictEqual(session.status, 'WAITING');
    assert.strictEqual(s.bk.activeCount(), 1);
    /* Không có API nào tự hết hạn. */
    assert.strictEqual(s.bk.expire, undefined);
    assert.strictEqual(s.bk.setTimeout, undefined);
  });

  test('nhân viên tự đóng popup thì huỷ lượt chờ', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    assertOk(s.bk.cancel(session.bankOrderId));
    assert.strictEqual(s.bk.activeCount(), 0);
  });

  test('bankOrderId KHÔNG phải operationId (§4.5)', function () {
    var s = setup();
    var session = assertOk(s.bk.open({ amount: 55000 }));
    assert.strictEqual(session.notAnOperationId, true);
    var ids = GIEO.require('shared-kernel/ids');
    assert.strictEqual(ids.isId(session.bankOrderId, 'operation'), false);
  });

  test('số tiền không dương bị từ chối', function () {
    assertErr(setup().bk.buildQrUrl({ bankOrderId: 'GG1', amount: 0 }), 'VALIDATION');
  });
});
