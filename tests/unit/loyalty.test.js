/**
 * [4] Loyalty.
 * Chuỗi thật: FIFO-CHAIN-TRACE-LOYALTY-V1.md. Gap: FEATURE-TREE-V1.md §4.15, §4.16.
 */

var _l = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    C: GIEO.require('loyalty/customer'),
    L: GIEO.require('loyalty/ledger'),
    A: GIEO.require('loyalty/accrual'),
    LOY: GIEO.require('commands/loyalty'),
    SALES: GIEO.require('commands/sales'),
    PIPE: GIEO.require('commands/pipeline'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    DE: GIEO.require('bootstrap/domain-events'),
    BOOT: GIEO.require('bootstrap/runtime'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    BOSS: ids.deterministicId('actor', ['boss']),
    NV: ids.deterministicId('actor', ['nv01']),
    BILL: ids.deterministicId('bill', ['b1'])
  };
})();

function loyCtx(source, role, actorId) {
  var day = assertOk(_l.BD.openDay({
    storeId: _l.STORE, dateKey: '2026-03-10', actorId: _l.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _l.CLK.createClock()
  }));
  var actor = assertOk(_l.ACCESS.createActor({
    actorId: actorId || _l.NV, role: role || 'POS_OPERATOR', source: source || 'POS', stores: [_l.STORE]
  }));
  return assertOk(_l.CTXL.createContext({
    organizationId: _l.ORG, storeId: _l.STORE, actor: actor, source: source || 'POS', businessDay: day
  }));
}

function cust(over) {
  return assertOk(_l.C.createCustomer(Object.assign({ phone: '0912345678', storeId: _l.STORE }, over || {})));
}

function mkBill(over) {
  return Object.assign({
    billId: _l.BILL, storeId: _l.STORE, businessDate: '2026-03-10', occurredAt: 1000,
    soldByActorId: _l.NV, channel: { type: 'DINE_IN' }, total: 100000,
    lines: [{ menuItemId: _l.ids.deterministicId('item', ['m']), qty: 2 }]
  }, over || {});
}

describe('loyalty/customer', function () {
  var C = _l.C;

  test('chuẩn hoá SĐT: 84xxx → 0xxx', function () {
    assert.strictEqual(C.normalizePhone('+84912345678'), '0912345678');
    assert.strictEqual(C.normalizePhone('84912345678'), '0912345678');
    assert.strictEqual(C.normalizePhone('0912 345 678'), '0912345678');
  });

  test('SĐT rác bị từ chối', function () {
    assert.strictEqual(C.normalizePhone('123'), null);
    assert.strictEqual(C.normalizePhone('abc'), null);
    assertErr(C.createCustomer({ phone: '123', storeId: _l.STORE }), 'VALIDATION');
  });

  test('customerId xác định theo SĐT — nhập lại không tạo khách trùng', function () {
    assert.strictEqual(cust().customerId, cust({ phone: '+84912345678' }).customerId);
  });

  test('tier là chỗ nối sẵn, mặc định hệ số 1 (§7 — không dựng tier ngay)', function () {
    assert.strictEqual(_l.C.accrualMultiplierOf(cust()), 1);
    assert.strictEqual(_l.C.accrualMultiplierOf(cust({ tier: 'VIP', accrualMultiplier: 2 })), 2);
    assert.strictEqual(_l.C.accrualMultiplierOf(null), 1);
  });
});

describe('loyalty/ledger — SỔ CÁI, không phải field cộng dồn (§8, gap nặng nhất)', function () {
  var L = _l.L;

  function entry(over) {
    return L.createEntry(Object.assign({
      customerId: cust().customerId, storeId: _l.STORE, currency: 'POINTS',
      delta: 50, reason: 'EARN_SALE', referenceId: _l.BILL,
      operationId: 'operation_x', businessDate: '2026-03-10'
    }, over || {}));
  }

  test('KHÔNG tồn tại hàm set số dư — số dư chỉ là tổng sổ', function () {
    assert.strictEqual(L.setBalance, undefined);
    assert.strictEqual(L.updateBalance, undefined);
  });

  test('số dư dựng lại được từ sổ', function () {
    var c = cust().customerId;
    var es = [
      assertOk(entry({ delta: 50, referenceId: 'b1' })),
      assertOk(entry({ delta: 30, referenceId: 'b2' })),
      assertOk(entry({ delta: -20, reason: 'REDEEM', referenceId: 'b3' }))
    ];
    assert.strictEqual(L.computeBalance(es, c).POINTS, 60);
  });

  test('3 loại số dư tách biệt', function () {
    var c = cust().customerId;
    var es = [
      assertOk(entry({ currency: 'POINTS', delta: 50, referenceId: 'b1' })),
      assertOk(entry({ currency: 'STAMPS', delta: 2, referenceId: 'b2' })),
      assertOk(entry({ currency: 'FREE_DRINKS', delta: 1, referenceId: 'b3' }))
    ];
    var b = L.computeBalance(es, c);
    assert.strictEqual(b.POINTS, 50);
    assert.strictEqual(b.STAMPS, 2);
    assert.strictEqual(b.FREE_DRINKS, 1);
  });

  test('sổ của khách khác không lẫn vào', function () {
    var a = cust().customerId;
    var b = cust({ phone: '0987654321' }).customerId;
    var es = [assertOk(entry({ customerId: a, delta: 50, referenceId: 'b1' })),
              assertOk(entry({ customerId: b, delta: 999, referenceId: 'b2' }))];
    assert.strictEqual(L.computeBalance(es, a).POINTS, 50);
  });

  test('entryId xác định — ghi lại cùng sự kiện không sinh dòng thứ 2', function () {
    assert.strictEqual(assertOk(entry()).entryId, assertOk(entry()).entryId);
  });

  test('dòng sổ phải có referenceId — dòng không nguồn gốc là dòng không kiểm chứng được', function () {
    assertErr(entry({ referenceId: null }), 'VALIDATION');
  });

  test('delta = 0 bị từ chối', function () {
    assertErr(entry({ delta: 0 }), 'VALIDATION');
  });

  test('phát hiện số dư trôi — phép đối chiếu legacy KHÔNG làm được', function () {
    var c = cust().customerId;
    var es = [assertOk(entry({ delta: 50, referenceId: 'b1' }))];
    var clean = assertOk(L.detectDrift(es, c, { POINTS: 50, STAMPS: 0, FREE_DRINKS: 0 }));
    assert.strictEqual(clean.clean, true);
    var drifted = assertOk(L.detectDrift(es, c, { POINTS: 999, STAMPS: 0, FREE_DRINKS: 0 }));
    assert.strictEqual(drifted.clean, false);
    assert.strictEqual(drifted.drift.POINTS.difference, 949);
  });

  test('sửa tay vẫn là 1 DÒNG SỔ, bắt buộc có lý do và người chịu trách nhiệm', function () {
    var base = { customerId: cust().customerId, storeId: _l.STORE, currency: 'POINTS', delta: 100,
                 operationId: 'operation_adj', businessDate: '2026-03-10' };
    assertErr(L.adjust(Object.assign({}, base, { actorId: _l.NV })), 'VALIDATION');
    assertErr(L.adjust(Object.assign({}, base, { reasonText: 'bù cho khách' })), 'VALIDATION');
    var e = assertOk(L.adjust(Object.assign({}, base, { actorId: _l.NV, reasonText: 'bù cho khách' })));
    assert.strictEqual(e.reason, 'MANUAL_ADJUSTMENT');
    assert.strictEqual(e.note, 'bù cho khách');
  });
});

describe('loyalty/accrual', function () {
  var A = _l.A;
  var L = _l.L;

  describe('giữ nguyên luật legacy làm ĐÚNG', function () {
    test('dine-in: 5 điểm / 100đ, tính trên total SAU giảm giá (§6 — không double-dip)', function () {
      var out = assertOk(A.accrueForSale({
        bill: mkBill({ total: 100000 }), customer: cust(), operationId: 'operation_x'
      }));
      assert.strictEqual(out.entries[0].delta, 5000);
      assert.strictEqual(out.entries[0].currency, 'POINTS');
    });

    test('giảm giá làm giảm điểm tương ứng — vì tính trên số tiền thực trả', function () {
      var full = assertOk(A.accrueForSale({ bill: mkBill({ total: 100000 }), customer: cust(), operationId: 'op1' }));
      var disc = assertOk(A.accrueForSale({ bill: mkBill({ total: 60000 }), customer: cust(), operationId: 'op2' }));
      assert.strictEqual(full.entries[0].delta, 5000);
      assert.strictEqual(disc.entries[0].delta, 3000);
    });

    test('to-go: 1 tem/ly, trần 2 tem/khách/ngày', function () {
      var bill = mkBill({ channel: { type: 'TO_GO' }, lines: [{ qty: 5 }] });
      var out = assertOk(A.accrueForSale({ bill: bill, customer: cust(), operationId: 'op' }));
      assert.strictEqual(out.entries[0].delta, 2, 'trần theo ngày không được tôn trọng');
    });

    test('đã nhận tem trong ngày thì phần còn lại bị trừ vào trần', function () {
      var bill = mkBill({ channel: { type: 'TO_GO' }, lines: [{ qty: 5 }] });
      var out = assertOk(A.accrueForSale({
        bill: bill, customer: cust(), operationId: 'op', stampsEarnedToday: 1
      }));
      assert.strictEqual(out.entries[0].delta, 1);
    });

    test('hết trần thì không sinh dòng sổ rỗng', function () {
      var bill = mkBill({ channel: { type: 'TO_GO' }, lines: [{ qty: 5 }] });
      var out = assertOk(A.accrueForSale({
        bill: bill, customer: cust(), operationId: 'op', stampsEarnedToday: 2
      }));
      assert.strictEqual(out.entries.length, 0);
    });

    test('ly TẶNG không được tính tem — giữ nguyên fix đã có của legacy', function () {
      var bill = mkBill({ channel: { type: 'TO_GO' }, lines: [{ qty: 1 }, { qty: 1, isFree: true }] });
      var out = assertOk(A.accrueForSale({ bill: bill, customer: cust(), operationId: 'op' }));
      assert.strictEqual(out.entries[0].delta, 1, 'ly tặng bị tính tem');
      assert.strictEqual(A.countableCups(bill), 1);
    });

    test('không có khách thì bỏ qua TƯỜNG MINH, không return 0 ngầm', function () {
      var out = assertOk(A.accrueForSale({ bill: mkBill(), customer: null, operationId: 'op' }));
      assert.strictEqual(out.skipped, 'NO_CUSTOMER');
      assert.strictEqual(out.entries.length, 0);
    });

    test('hệ số tier nhân vào khi bật lên', function () {
      var out = assertOk(A.accrueForSale({
        bill: mkBill({ total: 100000 }), customer: cust({ accrualMultiplier: 2 }), operationId: 'op'
      }));
      assert.strictEqual(out.entries[0].delta, 10000);
    });
  });

  describe('ĐÓNG GAP §4 — addon phải tích điểm', function () {
    test('addon cộng điểm cho ĐÚNG phần chênh lệch', function () {
      var out = assertOk(A.accrueForAddon({
        customer: cust(), storeId: _l.STORE, billId: _l.BILL, addonSeq: 1,
        addedAmount: 20000, operationId: 'operation_addon', businessDate: '2026-03-10', actorId: _l.NV
      }));
      assert.strictEqual(out.entries[0].delta, 1000);
      assert.strictEqual(out.entries[0].reason, 'EARN_ADDON');
    });

    test('addon lặp cùng seq trùng entryId → không cộng đúp', function () {
      function run() {
        return assertOk(A.accrueForAddon({
          customer: cust(), storeId: _l.STORE, billId: _l.BILL, addonSeq: 1,
          addedAmount: 20000, operationId: 'op', businessDate: '2026-03-10'
        })).entries[0];
      }
      assert.strictEqual(run().entryId, run().entryId);
    });

    test('2 lần addon khác seq là 2 dòng khác nhau', function () {
      function run(seq) {
        return assertOk(A.accrueForAddon({
          customer: cust(), storeId: _l.STORE, billId: _l.BILL, addonSeq: seq,
          addedAmount: 20000, operationId: 'op', businessDate: '2026-03-10'
        })).entries[0];
      }
      assert.notStrictEqual(run(1).entryId, run(2).entryId);
    });

    test('số tiền quá nhỏ để ra điểm thì nói rõ, không sinh dòng 0', function () {
      var out = assertOk(A.accrueForAddon({
        customer: cust(), storeId: _l.STORE, billId: _l.BILL, addonSeq: 1,
        addedAmount: 10, operationId: 'op', businessDate: '2026-03-10'
      }));
      assert.strictEqual(out.entries.length, 0);
      assert.strictEqual(out.skipped, 'BELOW_THRESHOLD');
    });
  });

  describe('đổi tem — số dư kiểm từ SỔ, không từ field', function () {
    function stampEntries(n) {
      var out = [];
      for (var i = 0; i < n; i++) {
        out.push(assertOk(L.createEntry({
          customerId: cust().customerId, storeId: _l.STORE, currency: 'STAMPS', delta: 1,
          reason: 'EARN_SALE', referenceId: 'b' + i, operationId: 'op' + i, businessDate: '2026-03-10'
        })));
      }
      return out;
    }

    test('đủ 6 tem thì đổi được 1 ly', function () {
      var out = assertOk(A.redeemStamps({
        customerId: cust().customerId, storeId: _l.STORE, entries: stampEntries(6),
        billId: _l.BILL, operationId: 'operation_redeem', businessDate: '2026-03-10'
      }));
      assert.strictEqual(out.entries.length, 2);
      assert.strictEqual(out.entries[0].delta, -6);
      assert.strictEqual(out.entries[1].currency, 'FREE_DRINKS');
      assert.strictEqual(out.entries[1].delta, 1);
    });

    test('thiếu tem thì từ chối và nói rõ còn thiếu bao nhiêu', function () {
      var r = A.redeemStamps({
        customerId: cust().customerId, storeId: _l.STORE, entries: stampEntries(3),
        billId: _l.BILL, operationId: 'op', businessDate: '2026-03-10'
      });
      assertErr(r, 'PRECONDITION');
      assert.ok(/có 3, cần 6/.test(r.error.message));
    });

    test('sau khi đổi, số dư tính lại từ sổ đã trừ đúng', function () {
      var es = stampEntries(6);
      var out = assertOk(A.redeemStamps({
        customerId: cust().customerId, storeId: _l.STORE, entries: es,
        billId: _l.BILL, operationId: 'op', businessDate: '2026-03-10'
      }));
      var after = L.computeBalance(es.concat(out.entries), cust().customerId);
      assert.strictEqual(after.STAMPS, 0);
      assert.strictEqual(after.FREE_DRINKS, 1);
    });
  });

  describe('ĐÓNG GAP §5 — huỷ bill', function () {
    function earned() {
      return [assertOk(L.createEntry({
        customerId: cust().customerId, storeId: _l.STORE, currency: 'POINTS', delta: 5000,
        reason: 'EARN_SALE', referenceId: _l.BILL, operationId: 'op', businessDate: '2026-03-10'
      }))];
    }

    test('mặc định HOÀN điểm khi huỷ bill — legacy không hoàn gì cả', function () {
      var out = assertOk(A.reverseForVoidedBill({
        billId: _l.BILL, entries: earned(), operationId: 'operation_void', businessDate: '2026-03-10'
      }));
      assert.strictEqual(out.entries[0].delta, -5000);
      assert.strictEqual(out.entries[0].reason, 'REVERSAL');
    });

    test('số dư về 0 sau khi hoàn', function () {
      var es = earned();
      var out = assertOk(A.reverseForVoidedBill({
        billId: _l.BILL, entries: es, operationId: 'op', businessDate: '2026-03-10'
      }));
      assert.strictEqual(L.computeBalance(es.concat(out.entries), cust().customerId).POINTS, 0);
    });

    test('giữ điểm là CỜ TƯỜNG MINH, không phải im lặng bỏ qua', function () {
      var out = assertOk(A.reverseForVoidedBill({
        billId: _l.BILL, entries: earned(), policy: 'KEEP',
        operationId: 'op', businessDate: '2026-03-10'
      }));
      assert.strictEqual(out.entries.length, 0);
      assert.strictEqual(out.skipped, 'POLICY_KEEP');
      assert.ok(/quyết định tường minh/.test(out.note));
    });

    test('policy lạ bị từ chối', function () {
      assertErr(A.reverseForVoidedBill({
        billId: _l.BILL, entries: earned(), policy: 'TUY_Y',
        operationId: 'op', businessDate: '2026-03-10'
      }), 'VALIDATION');
    });

    test('bill không có điểm nào thì nói rõ, không tạo dòng rỗng', function () {
      var out = assertOk(A.reverseForVoidedBill({
        billId: _l.BILL, entries: [], operationId: 'op', businessDate: '2026-03-10'
      }));
      assert.strictEqual(out.skipped, 'NOTHING_TO_REVERSE');
    });

    test('hoàn theo dòng gốc đã ghi, không tính lại theo luật hiện tại', function () {
      /* Dòng gốc 5000 điểm; dù luật giờ đổi thành 10 điểm/100đ, hoàn vẫn đúng 5000. */
      var out = assertOk(A.reverseForVoidedBill({
        billId: _l.BILL, entries: earned(), operationId: 'op', businessDate: '2026-03-10',
        rules: { pointsPer100: 10 }
      }));
      assert.strictEqual(out.entries[0].delta, -5000);
    });
  });
});

describe('commands/loyalty — L9: bọc accrual.js thành command thật', function () {
  var LOY = _l.LOY;
  var PIPE = _l.PIPE;

  function run(cmd, input) {
    return PIPE.run(cmd, input, loyCtx(), { operationStore: PIPE.createInMemoryOperationStore() });
  }

  test('AccrueLoyaltyForSale sinh domainRecord loyaltyLedgerEntry thật', function () {
    var out = assertOk(run(LOY.AccrueLoyaltyForSale, {
      bill: mkBill({ total: 100000 }), customer: cust()
    }));
    assert.strictEqual(out.plan.domainRecords.length, 1);
    assert.strictEqual(out.plan.domainRecords[0].type, 'loyaltyLedgerEntry');
    assert.strictEqual(out.plan.domainRecords[0].record.delta, 5000);
  });

  test('AccrueLoyaltyForSale không có customer thì plan rỗng, không lỗi (accrual tự skip)', function () {
    var out = assertOk(run(LOY.AccrueLoyaltyForSale, { bill: mkBill(), customer: null }));
    assert.strictEqual(out.plan.domainRecords.length, 0);
  });

  test('AccrueLoyaltyForSale gọi lại cùng bill (operationId xác định) là no-op replay', function () {
    var store = PIPE.createInMemoryOperationStore();
    var input = { bill: mkBill({ total: 100000 }), customer: cust() };
    var c = loyCtx();
    var first = assertOk(PIPE.run(LOY.AccrueLoyaltyForSale, input, c, { operationStore: store }));
    var second = assertOk(PIPE.run(LOY.AccrueLoyaltyForSale, input, c, { operationStore: store }));
    assert.strictEqual(first.replayed, false);
    assert.strictEqual(second.replayed, true);
  });

  test('AccrueLoyaltyForAddon sinh đúng dòng sổ cho phần chênh lệch', function () {
    var out = assertOk(run(LOY.AccrueLoyaltyForAddon, {
      billId: _l.BILL, addonSeq: 1, addedAmount: 20000, customer: cust(),
      storeId: _l.STORE, businessDate: '2026-03-10', actorId: _l.NV
    }));
    assert.strictEqual(out.plan.domainRecords[0].record.delta, 1000);
    assert.strictEqual(out.plan.domainRecords[0].record.reason, 'EARN_ADDON');
  });

  test('ReverseLoyaltyForVoidedBill THIẾU policy bị từ chối — L5 chưa chốt, không được ngầm định', function () {
    assertErr(run(LOY.ReverseLoyaltyForVoidedBill, {
      billId: _l.BILL, entries: [], storeId: _l.STORE, businessDate: '2026-03-10'
    }), 'VALIDATION');
  });

  test('ReverseLoyaltyForVoidedBill với policy REVERSE tường minh thì hoàn đúng dòng gốc', function () {
    var original = assertOk(_l.L.createEntry({
      customerId: cust().customerId, storeId: _l.STORE, currency: 'POINTS', delta: 5000,
      reason: 'EARN_SALE', referenceId: _l.BILL, operationId: 'op', businessDate: '2026-03-10'
    }));
    var out = assertOk(PIPE.run(LOY.ReverseLoyaltyForVoidedBill, {
      billId: _l.BILL, policy: 'REVERSE', entries: [original],
      storeId: _l.STORE, businessDate: '2026-03-10'
    }, loyCtx('QUANLY', 'QUANLY_ADMIN'), { operationStore: PIPE.createInMemoryOperationStore() }));
    assert.strictEqual(out.plan.domainRecords[0].record.delta, -5000);
  });
});

describe('bootstrap/domain-events — routeEvents (L9: tầng "ai lắng nghe, gọi gì")', function () {
  var DE = _l.DE;

  test('SaleCompleted có bill denormalized → route AccrueLoyaltyForSale', function () {
    var routes = DE.routeEvents([{ type: 'SaleCompleted', bill: mkBill(), customer: cust() }]);
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].command, 'AccrueLoyaltyForSale');
    assert.strictEqual(routes[0].input.customer.customerId, cust().customerId);
  });

  test('SaleCompleted THIẾU bill (event cũ chưa mang denormalized) thì bỏ qua route, không gọi command với input rỗng', function () {
    var routes = DE.routeEvents([{ type: 'SaleCompleted', customerId: cust().customerId }]);
    assert.strictEqual(routes.length, 0);
  });

  test('SaleAmountIncreased → route AccrueLoyaltyForAddon', function () {
    var routes = DE.routeEvents([{
      type: 'SaleAmountIncreased', billId: _l.BILL, addonSeq: 1, addedAmount: 20000
    }]);
    assert.strictEqual(routes[0].command, 'AccrueLoyaltyForAddon');
    assert.strictEqual(routes[0].input.addedAmount, 20000);
  });

  test('OrderVoided → route ReverseLoyaltyForVoidedBill, billId lấy từ referenceId', function () {
    var routes = DE.routeEvents([{
      type: 'OrderVoided', referenceId: _l.BILL, loyaltyPolicy: 'KEEP', reversedBy: _l.NV
    }]);
    assert.strictEqual(routes[0].command, 'ReverseLoyaltyForVoidedBill');
    assert.strictEqual(routes[0].input.billId, _l.BILL);
    assert.strictEqual(routes[0].input.policy, 'KEEP');
  });

  test('OrderVoided KHÔNG tự đặt mặc định policy — L5 chưa chốt, để lộ ra thành undefined chứ không bịa', function () {
    var routes = DE.routeEvents([{ type: 'OrderVoided', referenceId: _l.BILL, reversedBy: _l.NV }]);
    assert.strictEqual(routes[0].input.policy, undefined);
  });

  test('event lạ (chưa khai route) bị bỏ qua, không ném lỗi', function () {
    assert.deepStrictEqual(DE.routeEvents([{ type: 'KhongTonTai' }]), []);
  });

  test('mảng rỗng/undefined trả mảng rỗng', function () {
    assert.deepStrictEqual(DE.routeEvents([]), []);
    assert.deepStrictEqual(DE.routeEvents(undefined), []);
  });
});

describe('L9 end-to-end — bootstrap/runtime tự chạy tiếp side-effect sau khi command gốc xong', function () {
  var BOOT = _l.BOOT;

  function shadowRuntime() {
    var c = loyCtx();
    return BOOT.createRuntime({ mode: BOOT.MODE.SHADOW, context: function () { return c; } });
  }

  test('RecordAddon có customer denormalized → tự động chạy AccrueLoyaltyForAddon, sinh dòng sổ thật', function () {
    var runtime = shadowRuntime();
    return runtime.command('RecordAddon', {
      billId: _l.BILL, addonSeq: 1, addedAmount: 20000,
      customerId: cust().customerId, loyaltyCustomer: cust()
    }).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.sideEffects.length, 1);
      var fx = out.value.sideEffects[0];
      assert.strictEqual(fx.command, 'AccrueLoyaltyForAddon');
      assert.strictEqual(fx.sourceEvent, 'SaleAmountIncreased');
      assertOk(fx.result);
      var loyaltyPlan = fx.result.value.plan;
      assert.strictEqual(loyaltyPlan.domainRecords[0].type, 'loyaltyLedgerEntry');
      assert.strictEqual(loyaltyPlan.domainRecords[0].record.delta, 1000);
    });
  });

  test('RecordAddon KHÔNG có customer thì không phát sinh sideEffects nào', function () {
    var runtime = shadowRuntime();
    return runtime.command('RecordAddon', {
      billId: _l.BILL, addonSeq: 2, addedAmount: 20000
    }).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.sideEffects, undefined);
    });
  });
});
