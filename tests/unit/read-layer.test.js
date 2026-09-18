/**
 * P4 Traceability + P7 Unified Read Layer.
 * Contract: UNIFIED-READ-LAYER-CONTRACT-V1.md.
 */

var _r = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    T: GIEO.require('traceability/trace'),
    G: GIEO.require('read-layer/gateway'),
    MC: GIEO.require('read-layer/merge-canonical'),
    U: GIEO.require('fifo-core/unit'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    STORE_B: ids.deterministicId('store', ['b']),
    ORG: ids.deterministicId('org', ['gieo']),
    NV: ids.deterministicId('actor', ['nv01']),
    QL: ids.deterministicId('actor', ['ql']),
    BOSS: ids.deterministicId('actor', ['boss']),
    SUA: ids.deterministicId('item', ['sua'])
  };
})();

function rCtx(role, source, actorId) {
  var day = assertOk(_r.BD.openDay({
    storeId: _r.STORE, dateKey: '2026-03-10', actorId: _r.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _r.CLK.createClock()
  }));
  var actor = assertOk(_r.ACCESS.createActor({
    actorId: actorId || _r.NV, role: role || 'POS_OPERATOR',
    source: source || 'POS', stores: [_r.STORE]
  }));
  return assertOk(_r.CTXL.createContext({
    organizationId: _r.ORG, storeId: _r.STORE, actor: actor, source: source || 'POS', businessDay: day
  }));
}

function fullUnit() {
  var u = assertOk(_r.U.createUnit({
    unitId: _r.ids.deterministicId('unit', ['u1']),
    itemId: _r.SUA, storeId: _r.STORE, itemKind: 'raw', initialQty: 1000,
    costBasis: { unitCost: 30, versionId: 'version_c1' },
    receiptId: 'receipt_1', supplierId: 'supplier_a', receivedAt: 500, receivedBy: _r.NV,
    operationId: 'operation_recv'
  }));
  return assertOk(_r.U.open(u, { at: 1000, actorId: _r.NV, operationId: 'operation_open' }));
}

describe('traceability/trace', function () {
  var T = _r.T;

  test('trace trả lời đủ bộ câu hỏi của HANDOFF §1.1', function () {
    var tr = assertOk(T.buildUnitTrace({
      unit: fullUnit(),
      allocations: [{
        unitId: _r.ids.deterministicId('unit', ['u1']), itemId: _r.SUA, qty: 200,
        unitBaseBefore: 1000, unitBaseAfter: 800, unitCost: 30, cost: 6000,
        operationId: 'operation_sale1', billId: _r.ids.deterministicId('bill', ['b1']),
        recipeVersionIds: ['version_r1']
      }]
    }));
    assert.deepStrictEqual(T.unanswered(tr), [], 'trace còn câu chưa trả lời được');
    assert.strictEqual(tr.billIds.length, 1);
    assert.deepStrictEqual(tr.recipeVersionIds, ['version_r1']);
  });

  test('nói rõ THIẾU câu nào thay vì chỉ báo không đủ', function () {
    var u = Object.assign({}, fullUnit(), { supplierId: null, receiptId: null, openedBy: null });
    var missing = T.unanswered(assertOk(T.buildUnitTrace({ unit: u })));
    assert.ok(missing.indexOf('nhận từ đâu') !== -1);
    assert.ok(missing.indexOf('ai mở') !== -1);
  });

  test('2 mốc hết hàng ĐỘC LẬP, không suy ra nhau', function () {
    var u = Object.assign({}, fullUnit(), { systemExhaustedAt: 5000, finishedAt: 9000, finishedBy: _r.NV });
    var tr = assertOk(T.buildUnitTrace({ unit: u }));
    assert.strictEqual(tr.systemExhaustedAt, 5000);
    assert.strictEqual(tr.physicallyFinished.at, 9000);
  });

  test('reverse trace: từ bill xuống các Unit đã gánh nó', function () {
    var BILL = _r.ids.deterministicId('bill', ['b1']);
    var tr = assertOk(T.buildBillTrace({
      billId: BILL,
      bill: { recipeVersionIds: ['version_r1'], soldByActorId: _r.NV },
      allocations: [
        { billId: BILL, unitId: 'unit_a', itemId: _r.SUA, qty: 100, cost: 3000 },
        { billId: BILL, unitId: 'unit_a', itemId: _r.SUA, qty: 50, cost: 1500 },
        { billId: BILL, unitId: 'unit_b', itemId: _r.SUA, qty: 50, cost: 2500 },
        { billId: 'bill_khac', unitId: 'unit_c', itemId: _r.SUA, qty: 999, cost: 999 }
      ]
    }));
    assert.strictEqual(tr.units.length, 2);
    assert.strictEqual(tr.totalActualCost, 7000);
    assert.strictEqual(tr.soldByActorId, _r.NV);
  });

  describe('TRACE_DEPENDENCY registry (invariant C6)', function () {
    test('còn tham chiếu ACTIVE thì KHÔNG được purge', function () {
      var reg = _r.T.createDependencyRegistry();
      assertOk(reg.register({ sourceType: 'unit', sourceId: 'unit_a', referencedBy: [{ type: 'bill', id: 'b1' }] }));
      assertErr(reg.canPurge('unit', 'unit_a'), 'PRECONDITION');
    });

    test('resolved hết thì purge được', function () {
      var reg = _r.T.createDependencyRegistry();
      assertOk(reg.register({ sourceType: 'unit', sourceId: 'unit_a' }));
      assertOk(reg.resolveDep('unit', 'unit_a'));
      assertOk(reg.canPurge('unit', 'unit_a'));
    });

    test('chưa từng đăng ký thì không có gì chặn', function () {
      assertOk(_r.T.createDependencyRegistry().canPurge('unit', 'unit_x'));
    });
  });
});

describe('read-layer — phân quyền đọc (đóng gap 0% của Reporting)', function () {
  var G = _r.G;

  test('POS operator KHÔNG đọc được P&L', function () {
    assertErr(G.getPnL(rCtx('POS_OPERATOR', 'POS'), { revenue: {}, cogs: {} }), 'FORBIDDEN');
  });

  test('POS operator KHÔNG đọc được COGS', function () {
    assertErr(G.getCOGS(rCtx('POS_OPERATOR', 'POS'), { bills: [] }), 'FORBIDDEN');
  });

  test('POS operator ĐỌC ĐƯỢC tồn kho — cần cho việc bán hàng', function () {
    assertOk(G.getInventoryLevel(rCtx('POS_OPERATOR', 'POS'), { units: [], untrackedBase: 100 }));
  });

  test('QUANLY admin đọc được P&L', function () {
    assertOk(G.getPnL(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      revenue: { netRevenue: 1000000 },
      cogs: { cogsTheoretical: 300000, cogsActual: 310000 }
    }));
  });

  test('QUANLY operator KHÔNG đọc được P&L (thiếu MASTER)', function () {
    assertErr(G.getPnL(rCtx('QUANLY_OPERATOR', 'QUANLY', _r.QL), { revenue: {}, cogs: {} }), 'FORBIDDEN');
  });

  test('từ chối là FORBIDDEN tường minh, KHÔNG trả rỗng/0 (quy tắc P2)', function () {
    var r = G.getCOGS(rCtx('POS_OPERATOR', 'POS'), { bills: [] });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.kind, 'FORBIDDEN');
    assert.strictEqual(r.value, undefined);
  });

  test('storeId bắt buộc trong mọi query (quy tắc P5)', function () {
    var ctx = rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL);
    assertErr(G.getRevenue(ctx, { storeId: 'khong-phai-id', bills: [] }), 'VALIDATION');
  });

  test('không đọc được store ngoài phạm vi', function () {
    assertErr(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      storeId: _r.STORE_B, bills: []
    }), 'FORBIDDEN');
  });

  test('query mới chưa khai quyền thì mặc định ĐÓNG', function () {
    var ctx = rCtx('SYSTEM_ADMIN', 'SYSTEM', _r.BOSS);
    assertErr(_r.ACCESS.authorize(ctx.actor, 'GetSomethingNew', _r.STORE), 'FORBIDDEN');
  });
});

describe('read-layer/gateway — GetPOSInventoryWorkspace (đóng gap §15.2/§15.7 tab Kho POS)', function () {
  var G = _r.G;

  test('POS operator đọc được workspace canonical đủ 12 danh sách', function () {
    var out = assertOk(G.getPOSInventoryWorkspace(rCtx('POS_OPERATOR', 'POS'), {
      source: 'QUANLY_CANONICAL', revision: 7, catalog: [{ itemId: 'x' }]
    })).data;
    assert.strictEqual(out.source, 'QUANLY_CANONICAL');
    assert.strictEqual(out.revision, 7);
    assert.strictEqual(out.catalog.length, 1);
    ['purchaseOrders', 'stockCountTasks', 'refillTasks', 'prepItems', 'prepBatches',
      'openUnits', 'pendingLabels', 'labelLossCandidates', 'wasteReasons', 'vessels', 'prepQuotes'
    ].forEach(function (field) {
      assert.deepStrictEqual(out[field], [], field + ' phải mặc định là mảng rỗng, không phải undefined');
    });
  });

  test('snapshot khai nguồn khác QUANLY_CANONICAL bị TỪ CHỐI, không hiển thị mập mờ', function () {
    assertErr(G.getPOSInventoryWorkspace(rCtx('POS_OPERATOR', 'POS'), {
      source: 'LEGACY_DIRECT_READ'
    }), 'VALIDATION');
  });
});

describe('read-layer — doanh thu MỘT implementation (R3)', function () {
  var G = _r.G;

  function bill(over) {
    return Object.assign({
      billId: _r.ids.newId('bill'), total: 100000, discountTotal: 0,
      channelFee: 0, netRevenue: 100000, channel: { type: 'DINE_IN' }
    }, over || {});
  }

  test('phí sàn được TRỪ khỏi doanh thu thuần', function () {
    var out = assertOk(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      bills: [bill(), bill({ channel: { type: 'APP', appName: 'X', feePct: 25 }, channelFee: 25000, netRevenue: 75000 })]
    }));
    assert.strictEqual(out.data.grossRevenue, 200000);
    assert.strictEqual(out.data.channelFees, 25000);
    assert.strictEqual(out.data.netRevenue, 175000);
  });

  test('tách theo kênh — legacy chỉ có 1 số tổng dù dữ liệu đã có', function () {
    var out = assertOk(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      bills: [bill(), bill({ channel: { type: 'TO_GO' } })]
    }));
    assert.strictEqual(out.data.byChannel.DINE_IN.billCount, 1);
    assert.strictEqual(out.data.byChannel.TO_GO.billCount, 1);
  });

  test('POS và QUANLY gọi CÙNG một hàm nên không thể lệch', function () {
    var bills = [bill()];
    /* Cùng dữ liệu, cùng implementation — khác nhau chỉ là quyền. */
    var ql = assertOk(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), { bills: bills }));
    var mgr = assertOk(G.getRevenue(rCtx('STORE_MANAGER', 'POS'), { bills: bills }));
    assert.deepStrictEqual(ql.data, mgr.data);
  });

  test('tách theo hình thức thanh toán — bill tính riêng cộng đúng từng phần', function () {
    var out = assertOk(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      bills: [
        bill({ payments: [{ method: 'CASH', amount: 100000 }] }),
        bill({ payments: [{ method: 'CASH', amount: 40000 }, { method: 'BANK', amount: 60000 }] })
      ]
    }));
    assert.strictEqual(out.data.byPaymentMethod.CASH, 140000);
    assert.strictEqual(out.data.byPaymentMethod.BANK, 60000);
  });

  test('payment thiếu method thì vào UNKNOWN — không đoán là tiền mặt', function () {
    var out = assertOk(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      bills: [bill({ payments: [{ amount: 50000 }] })]
    }));
    assert.strictEqual(out.data.byPaymentMethod.UNKNOWN, 50000);
    assert.strictEqual(out.data.byPaymentMethod.CASH, undefined);
  });

  test('bill không có payments thì byPaymentMethod rỗng, không lỗi', function () {
    var out = assertOk(G.getRevenue(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), { bills: [bill()] }));
    assert.deepStrictEqual(out.data.byPaymentMethod, {});
  });
});

describe('read-layer — COGS luôn 2 vế (§3, invariant R8)', function () {
  var G = _r.G;
  var ctx = function () { return rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL); };

  function billWith(theo, act, reason) {
    return {
      billId: _r.ids.newId('bill'),
      cogs: {
        cogsTheoretical: theo, cogsActual: act,
        cogsActualReason: reason || null,
        basis: { costBasisVersionIds: ['version_c1'] }
      }
    };
  }

  test('đủ dữ liệu thì có cả 2 vế và variance', function () {
    var out = assertOk(G.getCOGS(ctx(), { bills: [billWith(9000, 9000), billWith(3000, 4000)] }));
    assert.strictEqual(out.data.cogsTheoretical, 12000);
    assert.strictEqual(out.data.cogsActual, 13000);
    assert.strictEqual(out.data.variance, 1000);
  });

  test('1 bill thiếu vế actual → TỔNG actual là null, KHÔNG bù bằng theoretical', function () {
    var out = assertOk(G.getCOGS(ctx(), { bills: [billWith(9000, 9000), billWith(3000, null, 'SHORTFALL')] }));
    assert.strictEqual(out.data.cogsActual, null, 'theoretical bị bù vào cho tổng trông đẹp');
    assert.strictEqual(out.data.variance, null);
    assert.strictEqual(out.data.cogsActualPartial, 9000);
    assert.strictEqual(out.data.missingActual[0].reason, 'SHORTFALL');
  });

  test('bill không có cogs thì báo, không im lặng bỏ qua', function () {
    var out = assertOk(G.getCOGS(ctx(), { bills: [{ billId: _r.ids.newId('bill') }] }));
    assert.strictEqual(out.data.missingActual[0].reason, 'NO_COGS');
  });

  test('P&L nói rõ lãi đang tính theo vế nào', function () {
    var full = assertOk(G.getPnL(ctx(), {
      revenue: { netRevenue: 1000000 },
      cogs: { cogsTheoretical: 300000, cogsActual: 310000 },
      expenses: { total: 200000, fixed: 150000, variable: 50000, estimated: 0 }
    }));
    assert.strictEqual(full.data.cogsBasisUsed, 'ACTUAL');
    assert.strictEqual(full.data.netProfit, 1000000 - 310000 - 200000);

    var partial = assertOk(G.getPnL(ctx(), {
      revenue: { netRevenue: 1000000 },
      cogs: { cogsTheoretical: 300000, cogsActual: null },
      expenses: { total: 0, fixed: 0, variable: 0, estimated: 0 }
    }));
    assert.strictEqual(partial.data.cogsBasisUsed, 'THEORETICAL');
  });

  test('còn chi phí ước tính thì P&L nói rõ chưa phải số cuối', function () {
    var out = assertOk(G.getPnL(ctx(), {
      revenue: { netRevenue: 1000000 },
      cogs: { cogsTheoretical: 300000, cogsActual: 300000 },
      expenses: { total: 200000, fixed: 100000, variable: 100000, estimated: 50000 }
    }));
    assert.strictEqual(out.data.hasEstimatedExpenses, true);
  });
});

describe('read-layer — nguồn và đóng băng', function () {
  var G = _r.G;
  var MC = _r.MC;
  var ctx = function () { return rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL); };

  test('kỳ đã chốt → đọc thẳng snapshot, meta.frozen = true', function () {
    var out = assertOk(G.getPnL(ctx(), { closing: { netProfit: 123456 } }));
    assert.strictEqual(out.meta.frozen, true);
    assert.deepStrictEqual(out.meta.sources, ['SNAPSHOT']);
    assert.strictEqual(out.data.netProfit, 123456);
  });

  test('chưa chốt → tính sống, frozen = false', function () {
    var out = assertOk(G.getPnL(ctx(), {
      revenue: { netRevenue: 100 }, cogs: { cogsTheoretical: 10, cogsActual: 10 }
    }));
    assert.strictEqual(out.meta.frozen, false);
    assert.deepStrictEqual(out.meta.sources, ['LIVE']);
  });

  test('so sánh 2 kỳ mang cờ frozen RIÊNG cho từng cột (quy tắc T3)', function () {
    var frozen = assertOk(G.getPnL(ctx(), { closing: { netProfit: 100 } }));
    var live = assertOk(G.getPnL(ctx(), {
      revenue: { netRevenue: 200 }, cogs: { cogsTheoretical: 20, cogsActual: 20 }
    }));
    var cmp = assertOk(G.comparePeriods(ctx(), { previous: frozen, current: live }));
    assert.strictEqual(cmp.previous.frozen, true);
    assert.strictEqual(cmp.current.frozen, false);
    assert.strictEqual(cmp.bothLive, false);
  });

  test('cả 2 cột đều sống thì NÓI RA — so sánh sẽ trôi theo thời gian', function () {
    var a = assertOk(G.getPnL(ctx(), { revenue: { netRevenue: 1 }, cogs: { cogsTheoretical: 1, cogsActual: 1 } }));
    var b = assertOk(G.getPnL(ctx(), { revenue: { netRevenue: 2 }, cogs: { cogsTheoretical: 1, cogsActual: 1 } }));
    assert.strictEqual(assertOk(G.comparePeriods(ctx(), { previous: a, current: b })).bothLive, true);
  });

  test('UI không cần biết nguồn — data giống nhau bất kể đến từ đâu', function () {
    var fromSnapshot = assertOk(G.getPnL(ctx(), { closing: { netProfit: 100 } }));
    assert.ok(fromSnapshot.data.netProfit !== undefined);
    assert.ok(fromSnapshot.meta.sources.length > 0);
  });

  describe('cache invalidate theo PHẠM VI, không xoá sạch (K3/K4)', function () {
    var keys = [
      { storeId: _r.STORE, dateKey: '2026-03-01' },
      { storeId: _r.STORE, dateKey: '2026-03-10' },
      { storeId: _r.STORE, dateKey: '2026-03-20' }
    ];

    test('chỉ bỏ ngày bị ảnh hưởng', function () {
      var out = assertOk(MC.invalidateScope(keys, {
        fromDateKey: '2026-03-10', toDateKey: '2026-03-10', storeId: _r.STORE
      }));
      assert.strictEqual(out.dropped.length, 1);
      assert.strictEqual(out.kept.length, 2, 'xoá sạch cache — đúng lỗi clearSalesCache của legacy');
    });

    test('sửa/xoá bill cũ làm mất cache ĐÚNG ngày đó (K4)', function () {
      var out = assertOk(MC.invalidateScope(keys, {
        fromDateKey: '2026-03-01', toDateKey: '2026-03-01', storeId: _r.STORE
      }));
      assert.strictEqual(out.dropped[0].dateKey, '2026-03-01');
    });

    test('không nêu phạm vi thì TỪ CHỐI — cấm xoá sạch', function () {
      assertErr(MC.invalidateScope(keys, {}), 'VALIDATION');
    });
  });

  test('không nguồn nào trả được thì NOT_FOUND, không trả rỗng giả vờ thành công', function () {
    assertErr(MC.resolve({ computeLive: function () { return GIEO.require('shared-kernel/result').ok(null); } }), 'NOT_FOUND');
  });
});

describe('P9/P10 — query cho màn Ca / Cảnh báo / Duyệt', function () {
  var A = GIEO.require('alerts/alert');

  function alertOf(type, data, subjectKey) {
    return assertOk(A.raise({
      type: type, storeId: _r.STORE, businessDate: '2026-03-10',
      subjectKey: subjectKey || type, data: data, at: 1000
    }));
  }

  describe('GetShiftStatus', function () {
    test('ngày chưa mở thì operable=false, KHÔNG suy ngày từ đồng hồ', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), { businessDay: null, segments: [] }));
      assert.strictEqual(out.data.businessDate, null);
      assert.strictEqual(out.data.operable, false);
    });

    test('đọc đúng két đang mở và người đang trong ca', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), {
        businessDay: { businessDate: '2026-03-10', status: 'OPEN' },
        segments: [
          { seq: 1, status: 'CLOSED' },
          { seq: 2, status: 'OPEN', openedAt: 900, openedBy: _r.NV }
        ],
        employeeShifts: [
          { shiftId: 'shift_1', employeeId: 'employee_a', status: 'OPEN', checkedInAt: 800 },
          { shiftId: 'shift_2', employeeId: 'employee_b', status: 'CLOSED' }
        ]
      }));
      assert.strictEqual(out.data.operable, true);
      assert.strictEqual(out.data.openSegment.seq, 2);
      assert.strictEqual(out.data.closedSegmentCount, 1);
      assert.strictEqual(out.data.employeesOnShift.length, 1);
    });

    test('đoạn đang mở trả đủ chi tiết cho màn Ca làm việc đối soát', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), {
        businessDay: { businessDate: '2026-03-10', status: 'OPEN' },
        segments: [{
          segmentId: 'shift_seg_1', seq: 1, status: 'OPEN', startCash: 500000,
          startCashSource: 'OPENING_FLOAT', cashSales: 1800000, cashOut: 0,
          counts: [], openedAt: 900, openedBy: _r.NV
        }]
      }));
      assert.strictEqual(out.data.openSegment.startCash, 500000);
      assert.strictEqual(out.data.openSegment.expectedEndCashPreview, 2300000,
        'xem trước lẽ ra phải có = startCash + cashSales - cashOut');
      assert.deepStrictEqual(out.data.openSegment.counts, []);
    });

    test('đoạn vừa chốt gần nhất hiện variance — không chỉ đếm số đoạn đã đóng', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), {
        businessDay: { businessDate: '2026-03-10', status: 'OPEN' },
        segments: [
          { seq: 1, status: 'CLOSED', expectedEndCash: 2300000, actualEndCash: 2250000, variance: -50000, closedAt: 5000, closedBy: _r.NV },
          { seq: 2, status: 'CLOSED', expectedEndCash: 1000000, actualEndCash: 1000000, variance: 0, closedAt: 9000, closedBy: _r.NV }
        ]
      }));
      assert.strictEqual(out.data.lastClosedSegment.seq, 2, 'phải là đoạn seq LỚN NHẤT, không phải đoạn đầu tiên');
      assert.strictEqual(out.data.lastClosedSegment.variance, 0);
    });

    test('chưa có đoạn nào chốt thì lastClosedSegment là null, không phải 0/rỗng mập mờ', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), { businessDay: null, segments: [] }));
      assert.strictEqual(out.data.lastClosedSegment, null);
    });

    test('roster mặc định rỗng khi data source chưa cấp — không suy ra ai được check-in', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), { businessDay: null, segments: [] }));
      assert.deepStrictEqual(out.data.roster, []);
    });

    test('roster đi qua nguyên vẹn khi data source cấp — HR config, không phải fifo-core tự tính', function () {
      var out = assertOk(_r.G.getShiftStatus(rCtx(), {
        businessDay: null, segments: [], roster: [{ employeeId: _r.NV, fullName: 'An' }]
      }));
      assert.strictEqual(out.data.roster.length, 1);
      assert.strictEqual(out.data.roster[0].fullName, 'An');
    });
  });

  describe('GetExpenses', function () {
    test('POS operator đọc được — không phải đặc quyền quản trị', function () {
      assertOk(_r.G.getExpenses(rCtx('POS_OPERATOR', 'POS'), { expenses: [] }));
    });

    test('tổng cộng dồn TRỪ khoản đã bị từ chối', function () {
      var out = assertOk(_r.G.getExpenses(rCtx(), {
        expenses: [
          { expenseId: 'expense_1', amount: 40000, status: 'PENDING_APPROVAL' },
          { expenseId: 'expense_2', amount: 200000, status: 'ACTUAL' },
          { expenseId: 'expense_3', amount: 99999, status: 'REJECTED' }
        ]
      }));
      assert.strictEqual(out.data.total, 240000);
      assert.strictEqual(out.data.expenses.length, 3, 'vẫn liệt kê đủ, kể cả khoản bị từ chối — chỉ loại khỏi tổng');
    });

    test('categories mặc định rỗng, đi qua nguyên vẹn khi QUANLY cấp — không tự bịa danh mục', function () {
      var empty = assertOk(_r.G.getExpenses(rCtx(), { expenses: [] }));
      assert.deepStrictEqual(empty.data.categories, []);

      var withCats = assertOk(_r.G.getExpenses(rCtx(), {
        expenses: [], categories: [{ id: 'ice', label: 'Mua đá' }]
      }));
      assert.strictEqual(withCats.data.categories[0].label, 'Mua đá');
    });
  });

  describe('GetAlerts', function () {
    var lowStock = function () {
      return alertOf('LOW_STOCK', { itemId: _r.SUA, currentStock: 2, threshold: 10 });
    };
    var cashVariance = function () {
      return alertOf('CASH_VARIANCE', { segmentId: 'seg_1', variance: -50000 });
    };

    test('audience bắt buộc — không có mặc định xem hết', function () {
      assertErr(_r.G.getAlerts(rCtx(), { alerts: [] }), 'VALIDATION');
      assertErr(_r.G.getAlerts(rCtx(), { alerts: [], audience: 'TAT_CA' }), 'VALIDATION');
    });

    test('POS không thấy cảnh báo chỉ dành cho QUANLY', function () {
      var out = assertOk(_r.G.getAlerts(rCtx(), {
        alerts: [lowStock(), cashVariance()], audience: 'POS'
      }));
      assert.strictEqual(out.data.total, 1);
      assert.strictEqual(out.data.buckets.WARNING[0].type, 'LOW_STOCK');
    });

    test('đếm tách theo mức nặng, không gộp thành một số tổng', function () {
      var out = assertOk(_r.G.getAlerts(rCtx('QUANLY_ADMIN', 'QUANLY', _r.BOSS), {
        alerts: [
          lowStock(),
          cashVariance(),
          alertOf('STOCKOUT', { itemId: _r.SUA, menuItemIds: ['item_1'] })
        ],
        audience: 'QUANLY'
      }));
      assert.strictEqual(out.data.counts.DANGER, 2);
      assert.strictEqual(out.data.counts.WARNING, 1);
      assert.strictEqual(out.data.total, 3);
    });

    test('cảnh báo đã xử lý không còn hiện', function () {
      var a = lowStock();
      var resolved = Object.assign({}, a, { status: A.STATUS.RESOLVED });
      var out = assertOk(_r.G.getAlerts(rCtx(), { alerts: [resolved], audience: 'POS' }));
      assert.strictEqual(out.data.total, 0);
    });
  });

  describe('GetPendingApprovals', function () {
    var ctx = function () { return rCtx('QUANLY_ADMIN', 'QUANLY', _r.BOSS); };

    test('mỗi việc mang sẵn command, UI không tự tra bảng', function () {
      var out = assertOk(_r.G.getPendingApprovals(ctx(), {
        pending: [
          { type: 'lostReport', referenceId: 'lost_1' },
          { type: 'stockCount', referenceId: 'count_1' },
          { type: 'expense', referenceId: 'expense_1' }
        ]
      }));
      assert.deepStrictEqual(out.data.items.map(function (i) { return i.command; }),
        ['ApproveLostContainer', 'ApproveStockCount', 'ApproveExpense']);
      assert.deepStrictEqual(out.data.byType, { lostReport: 1, stockCount: 1, expense: 1 });
    });

    test('loại chưa khai KHÔNG dựng việc duyệt, mà báo ra', function () {
      var out = assertOk(_r.G.getPendingApprovals(ctx(), {
        pending: [{ type: 'khongBietLaGi', referenceId: 'x_1' }, { type: 'lostReport', referenceId: 'lost_1' }]
      }));
      assert.strictEqual(out.data.items.length, 1);
      assert.deepStrictEqual(out.data.unknownTypes, ['khongBietLaGi']);
    });

    test('nhân viên POS không đọc được hàng đợi duyệt', function () {
      assertErr(_r.G.getPendingApprovals(rCtx(), { pending: [] }), 'FORBIDDEN');
    });
  });
});

describe('P11 — báo cáo là query có quyền, không phải đường tắt về nguồn thô', function () {
  var RQ = GIEO.require('reporting/report-queries');
  var U1 = _r.ids.deterministicId('unit', ['u1']);

  function boss() { return rCtx('QUANLY_ADMIN', 'QUANLY', _r.BOSS); }
  function entry(type, qtyDelta, unitId) {
    return { entryId: type + qtyDelta, type: type, itemId: _r.SUA, qtyDelta: qtyDelta, unitId: unitId || null };
  }

  test('nhân viên POS không đọc được báo cáo hao hụt hay giá trị tồn', function () {
    assertErr(RQ.getUsageReport(rCtx(), { entries: [] }), 'FORBIDDEN');
    assertErr(RQ.getInventoryValuation(rCtx(), { units: [] }), 'FORBIDDEN');
  });

  test('xuất file là tầng quyền cao nhất — quản lý thường không xuất được', function () {
    var manager = rCtx('QUANLY_OPERATOR', 'QUANLY', _r.QL);
    assertErr(RQ.exportReport(manager, {
      title: 'x', period: '2026-03-10', columns: [{ key: 'a', label: 'A' }], rows: [], meta: {}
    }), 'FORBIDDEN');
  });

  test('báo cáo trả kèm meta, đúng khuôn của mọi query đọc', function () {
    var out = assertOk(RQ.getUsageReport(boss(), {
      entries: [entry('WASTE', -50, U1)]
    }));
    assert.strictEqual(out.data.totals.waste, 50);
    assert.ok(out.meta.computedAt, 'thiếu computedAt');
    assert.strictEqual(out.meta.frozen, false);
  });

  test('xuất file KHÔNG có meta gốc thì bị từ chối', function () {
    assertErr(RQ.exportReport(boss(), {
      title: 'Hao hụt', period: '2026-03-10', columns: [{ key: 'itemId', label: 'Mặt hàng' }], rows: []
    }), 'VALIDATION');
  });

  test('xuất file mang theo xuất xứ và cảnh báo chưa chốt', function () {
    var usage = assertOk(RQ.getUsageReport(boss(), { entries: [entry('WASTE', -50, U1)] }));
    var out = assertOk(RQ.exportReport(boss(), {
      title: 'Hao hụt', period: '2026-03-10',
      columns: [{ key: 'itemId', label: 'Mặt hàng' }, { key: 'waste', label: 'Hao' }],
      rows: usage.data.rows, meta: usage.meta
    }));
    assert.strictEqual(out.data.frozen, false);
    assert.ok(out.data.notices.length > 0, 'file chưa chốt phải có cảnh báo dán kèm');
    assert.ok(/Mặt hàng,Hao/.test(out.data.csv), out.data.csv);
  });

  test('cột export khai sai bị TỪ CHỐI, không xuất file header rỗng', function () {
    assertErr(RQ.exportReport(boss(), {
      title: 'Hao hụt', period: '2026-03-10', columns: ['itemId'], rows: [], meta: {}
    }), 'VALIDATION');
  });

  test('định giá tồn từ chối Unit không có costBasis, không quy về giá gần nhất', function () {
    var u = fullUnit();
    var broken = Object.assign({}, u, { costBasis: null });
    assertErr(RQ.getInventoryValuation(boss(), { units: [broken] }), 'PRECONDITION');
  });
});
