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
    M: GIEO.require('catalog/menu'),
    P: GIEO.require('catalog/promotion'),
    RCP: GIEO.require('recipe-cost-btp/recipe'),
    VI: GIEO.require('compaction/versioned-input'),
    STORE: ids.deterministicId('store', ['main']),
    STORE_B: ids.deterministicId('store', ['b']),
    ORG: ids.deterministicId('org', ['gieo']),
    NV: ids.deterministicId('actor', ['nv01']),
    QL: ids.deterministicId('actor', ['ql']),
    BOSS: ids.deterministicId('actor', ['boss']),
    SUA: ids.deterministicId('item', ['sua']),
    DA: ids.deterministicId('item', ['da']),
    MON: ids.deterministicId('item', ['tra-sua']),
    RECIPE: ids.deterministicId('recipe', ['tra-sua'])
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

describe('GetMenuAvailability (CP1, NET-CATALOG-PROMOTION-V1.md) — sold-out dẫn xuất từ FIFO', function () {
  var G = _r.G;
  var M = _r.M;
  var T_AVAIL = new Date(2026, 2, 10, 10).getTime();

  function menuItem(over) {
    return assertOk(M.createMenuItem(Object.assign({
      menuItemId: _r.MON, storeId: _r.STORE, name: 'Trà sữa',
      prices: { M: 30000 }, recipeId: _r.RECIPE
    }, over || {})));
  }

  function registryWithRecipe() {
    var reg = _r.VI.createRegistry();
    assertOk(_r.RCP.publishRecipeVersion(reg, {
      recipeId: _r.RECIPE, storeId: _r.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
      publishedBy: _r.BOSS, components: { M: [{ refType: 'item', refId: _r.SUA, qty: 100 }] }
    }));
    return reg;
  }

  test('cùng quyền EXECUTE với GetMenu — POS đọc được để làm mờ nút', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem(), size: 'M', versionRegistry: registryWithRecipe(),
      stockByItemId: { }
    }));
    assert.ok(out.data);
  });

  test('thiếu menuItem thì VALIDATION', function () {
    assertErr(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), { size: 'M' }), 'VALIDATION');
  });

  test('thiếu size thì VALIDATION — khả dụng khác nhau theo size', function () {
    assertErr(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), { menuItem: menuItem() }), 'VALIDATION');
  });

  test('món đã ngừng bán → ARCHIVED', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: Object.assign({}, menuItem(), { archived: true }), size: 'M'
    }));
    assert.strictEqual(out.data.available, false);
    assert.strictEqual(out.data.reason, 'ARCHIVED');
  });

  test('chưa khai định mức → NO_RECIPE, unknown (không suy đoán còn/hết)', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem({ recipeId: null }), size: 'M'
    }));
    assert.strictEqual(out.data.reason, 'NO_RECIPE');
    assert.strictEqual(out.data.unknown, true);
  });

  test('thiếu versionRegistry (dù menuItem có recipeId) → về NO_RECIPE/unknown, KHÔNG đoán mò (§2.3a)', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem(), size: 'M'
    }));
    assert.strictEqual(out.data.reason, 'NO_RECIPE');
    assert.strictEqual(out.data.unknown, true);
  });

  test('đủ nguyên liệu → available true', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem(), size: 'M', versionRegistry: registryWithRecipe(),
      stockByItemId: { }
    }));
    var withStock = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem(), size: 'M', versionRegistry: registryWithRecipe(), at: T_AVAIL,
      stockByItemId: (function () { var o = {}; o[_r.SUA] = 1000; return o; })()
    }));
    assert.strictEqual(withStock.data.available, true);
  });

  test('thiếu số liệu tồn của nguyên liệu cần → STOCK_UNKNOWN, không mặc định là còn', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem(), size: 'M', versionRegistry: registryWithRecipe(), at: T_AVAIL,
      stockByItemId: { }
    }));
    assert.strictEqual(out.data.reason, 'STOCK_UNKNOWN');
    assert.strictEqual(out.data.unknown, true);
  });

  test('không đủ tồn → OUT_OF_STOCK kèm blockingItems', function () {
    var out = assertOk(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      menuItem: menuItem(), size: 'M', versionRegistry: registryWithRecipe(), at: T_AVAIL,
      stockByItemId: (function () { var o = {}; o[_r.SUA] = 50; return o; })()
    }));
    assert.strictEqual(out.data.available, false);
    assert.strictEqual(out.data.reason, 'OUT_OF_STOCK');
    assert.strictEqual(out.data.blockingItems[0].itemId, _r.SUA);
  });

  test('storeId ngoài phạm vi thì FORBIDDEN — cùng cổng guard() với mọi query khác', function () {
    assertErr(G.getMenuAvailability(rCtx('POS_OPERATOR', 'POS'), {
      storeId: _r.STORE_B, menuItem: menuItem(), size: 'M'
    }), 'FORBIDDEN');
  });
});

describe('GetActivePromotions (NET-SALES-V1.md #3) — POS đọc khuyến mãi trước checkout', function () {
  var G = _r.G;
  var P = _r.P;

  function promo(over) {
    return assertOk(P.createPromotion(Object.assign({
      name: 'KM', storeId: _r.STORE, tier: 'AUTO_EXECUTE', priority: 10,
      conditions: [], effect: { type: 'PERCENT_OFF', pct: 10 }
    }, over || {})));
  }

  test('cùng quyền EXECUTE với GetMenu — POS đọc được', function () {
    var out = assertOk(G.getActivePromotions(rCtx('POS_OPERATOR', 'POS'), {
      promotions: [promo()]
    }));
    assert.strictEqual(out.data.promotions.length, 1);
  });

  test('không truyền promotions thì trả mảng rỗng, không lỗi (§2.3a — thiếu dữ liệu không chặn)', function () {
    var out = assertOk(G.getActivePromotions(rCtx('POS_OPERATOR', 'POS'), {}));
    assert.deepStrictEqual(out.data.promotions, []);
  });

  test('lọc bỏ khuyến mãi active:false', function () {
    var out = assertOk(G.getActivePromotions(rCtx('POS_OPERATOR', 'POS'), {
      promotions: [promo({ active: true }), promo({ active: false })]
    }));
    assert.strictEqual(out.data.promotions.length, 1);
  });

  test('lọc bỏ khuyến mãi của store khác', function () {
    var out = assertOk(G.getActivePromotions(rCtx('POS_OPERATOR', 'POS'), {
      promotions: [promo(), promo({ storeId: _r.STORE_B })]
    }));
    assert.strictEqual(out.data.promotions.length, 1);
    assert.strictEqual(out.data.promotions[0].storeId, _r.STORE);
  });

  test('storeId ngoài phạm vi thì FORBIDDEN — cùng cổng guard() với mọi query khác', function () {
    assertErr(G.getActivePromotions(rCtx('POS_OPERATOR', 'POS'), {
      storeId: _r.STORE_B, promotions: [promo()]
    }), 'FORBIDDEN');
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
});

describe('GetBillsForRange (LỊCH SỬ BILL, port từ qlLoadBills) — nhóm theo ngày, MỘT implementation (R3)', function () {
  var G = _r.G;

  function bill(over) {
    return Object.assign({
      billId: _r.ids.newId('bill'), total: 100000, businessDate: '2026-03-10', occurredAt: 1000
    }, over || {});
  }

  test('sắp mới nhất trước theo occurredAt — cùng thứ tự hiển thị legacy', function () {
    var out = assertOk(G.getBillsForRange(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      bills: [
        bill({ billId: 'b1', occurredAt: 1000 }),
        bill({ billId: 'b2', occurredAt: 3000 }),
        bill({ billId: 'b3', occurredAt: 2000 })
      ]
    }));
    assert.deepStrictEqual(out.data.bills.map(function (b) { return b.billId; }), ['b2', 'b3', 'b1']);
  });

  test('nhóm theo businessDate, cộng tổng từng ngày và cả kỳ', function () {
    var out = assertOk(G.getBillsForRange(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      bills: [
        bill({ businessDate: '2026-03-10', total: 50000 }),
        bill({ businessDate: '2026-03-10', total: 30000 }),
        bill({ businessDate: '2026-03-11', total: 20000 })
      ]
    }));
    assert.strictEqual(out.data.byDate['2026-03-10'].billCount, 2);
    assert.strictEqual(out.data.byDate['2026-03-10'].total, 80000);
    assert.strictEqual(out.data.byDate['2026-03-11'].billCount, 1);
    assert.strictEqual(out.data.totalRevenue, 100000);
    assert.strictEqual(out.data.billCount, 3);
  });

  test('POS và QUANLY gọi CÙNG một hàm nên không thể lệch', function () {
    var bills = [bill()];
    var ql = assertOk(G.getBillsForRange(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), { bills: bills }));
    var mgr = assertOk(G.getBillsForRange(rCtx('STORE_MANAGER', 'POS'), { bills: bills }));
    assert.deepStrictEqual(ql.data, mgr.data);
  });

  test('POS operator KHÔNG đọc được — cùng độ nhạy cảm với GetRevenue/GetCOGS (SĐT khách + doanh thu từng đơn)', function () {
    assertErr(G.getBillsForRange(rCtx('POS_OPERATOR', 'POS'), { bills: [] }), 'FORBIDDEN');
  });

  test('storeId bắt buộc (quy tắc P5)', function () {
    assertErr(G.getBillsForRange(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      storeId: 'khong-phai-id', bills: []
    }), 'VALIDATION');
  });
});

describe('GetLedgerEntriesForReference (nguồn originalAllocations cho ReverseTransaction, xoá bill §3.8)', function () {
  var G = _r.G;

  test('entries do canonical-data-source cấp sẵn → coverage traceable', function () {
    var out = assertOk(G.getLedgerEntriesForReference(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      referenceId: 'bill-moi', domain: 'raw',
      entries: [{ entryId: 'e1', unitId: 'u1', itemId: 'i1', qtyDelta: -5 }]
    }));
    assert.strictEqual(out.coverage, 'traceable');
    assert.strictEqual(out.entries.length, 1);
  });

  test('không có entries nào (bill legacy, không truy được) → coverage untracked, KHÔNG lỗi', function () {
    var out = assertOk(G.getLedgerEntriesForReference(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      referenceId: 'bill-cu-truoc-cutover', domain: 'raw'
    }));
    assert.strictEqual(out.coverage, 'untracked');
    assert.deepStrictEqual(out.entries, []);
  });

  test('thiếu referenceId hoặc domain thì VALIDATION', function () {
    assertErr(G.getLedgerEntriesForReference(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      domain: 'raw'
    }), 'VALIDATION');
    assertErr(G.getLedgerEntriesForReference(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      referenceId: 'bill1'
    }), 'VALIDATION');
  });

  test('POS operator KHÔNG đọc được — cùng độ nhạy cảm với GetBillsForRange (dữ liệu xoá bill)', function () {
    assertErr(G.getLedgerEntriesForReference(rCtx('POS_OPERATOR', 'POS'), {
      referenceId: 'bill1', domain: 'raw'
    }), 'FORBIDDEN');
  });

  test('storeId bắt buộc (quy tắc P5)', function () {
    assertErr(G.getLedgerEntriesForReference(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
      storeId: 'khong-phai-id', referenceId: 'bill1', domain: 'raw'
    }), 'VALIDATION');
  });
});

describe('Kho — danh mục cấu hình đơn giản + Báo cáo mix/customer (2026-09-18)', function () {
  var G = _r.G;

  describe('GetKhoConfigList (commands/kho-config.js — "chỗ lưu và app POS đọc")', function () {
    test('trả nguyên entries do canonical-data-source cấp, không lọc/sắp xếp', function () {
      var out = assertOk(G.getKhoConfigList(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
        kind: 'wasteReason', entries: [{ id: 'item_1', label: 'Đổ bỏ' }]
      }));
      assert.strictEqual(out.kind, 'wasteReason');
      assert.strictEqual(out.entries.length, 1);
    });

    test('POS operator ĐỌC ĐƯỢC (đúng "app pos đọc" — chủ quán yêu cầu, không phải MASTER_CONFIGURE)', function () {
      var out = assertOk(G.getKhoConfigList(rCtx('POS_OPERATOR', 'POS'), {
        kind: 'storageLocation', entries: []
      }));
      assert.deepStrictEqual(out.entries, []);
    });

    test('kind không hợp lệ thì VALIDATION, không âm thầm trả rỗng', function () {
      assertErr(G.getKhoConfigList(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
        kind: 'khongTonTai', entries: []
      }), 'VALIDATION');
    });
  });

  describe('GetKhoHistory (sổ ledger raw+prep gần đây, đọc-thuần)', function () {
    test('sắp mới nhất trước và cắt theo limit', function () {
      var out = assertOk(G.getKhoHistory(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
        limit: 2,
        entries: [
          { entryId: 'e1', occurredAt: 1000 },
          { entryId: 'e2', occurredAt: 3000 },
          { entryId: 'e3', occurredAt: 2000 }
        ]
      }));
      assert.deepStrictEqual(out.entries.map(function (e) { return e.entryId; }), ['e2', 'e3']);
    });

    test('POS operator KHÔNG đọc được (cùng độ nhạy cảm sổ kho với GetLedgerEntriesForReference)', function () {
      assertErr(G.getKhoHistory(rCtx('POS_OPERATOR', 'POS'), { entries: [] }), 'FORBIDDEN');
    });
  });

  describe('GetMix (Báo cáo — phân tích bán hàng theo món, legacy renderMix)', function () {
    function bill(over) {
      return Object.assign({ billId: _r.ids.newId('bill'), businessDate: '2026-03-10' }, over || {});
    }

    test('gộp theo menuItemId, cộng qty/doanh thu, bỏ dòng miễn phí khỏi doanh thu', function () {
      var out = assertOk(G.getMix(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
        from: '2026-03-01', to: '2026-03-10',
        bills: [
          bill({ lines: [{ menuItemId: 'item_A', name: 'Trà sữa', qty: 2, amount: 60000 }] }),
          bill({ lines: [{ menuItemId: 'item_A', name: 'Trà sữa', qty: 1, amount: 30000 }] }),
          bill({ lines: [{ menuItemId: 'item_B', name: 'Cà phê', qty: 1, isFree: true, amount: 25000 }] })
        ]
      }));
      var a = out.rows.filter(function (r) { return r.menuItemId === 'item_A'; })[0];
      var b = out.rows.filter(function (r) { return r.menuItemId === 'item_B'; })[0];
      assert.strictEqual(a.qty, 3);
      assert.strictEqual(a.revenue, 90000);
      assert.strictEqual(b.revenue, 0);
      assert.strictEqual(out.totalRevenue, 90000);
      assert.strictEqual(out.billCount, 3);
    });

    test('POS operator KHÔNG đọc được — cùng mức GetBillsForRange (dữ liệu bill chi tiết)', function () {
      assertErr(G.getMix(rCtx('POS_OPERATOR', 'POS'), { from: '2026-03-01', to: '2026-03-10', bills: [] }), 'FORBIDDEN');
    });
  });

  describe('GetCustomerReport (Báo cáo — khách hàng, legacy renderCustomer)', function () {
    function bill(over) {
      return Object.assign({ billId: _r.ids.newId('bill'), businessDate: '2026-03-10', total: 50000 }, over || {});
    }

    test('gộp theo customerId, đếm số ngày ghé riêng biệt, khách vãng lai bị loại', function () {
      var out = assertOk(G.getCustomerReport(rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL), {
        from: '2026-03-01', to: '2026-03-10',
        bills: [
          bill({ customerId: 'customer_1', businessDate: '2026-03-01', total: 40000,
            legacySource: { customerName: 'Anh Tuấn', phone: '0900000001' } }),
          bill({ customerId: 'customer_1', businessDate: '2026-03-05', total: 60000 }),
          bill({ customerId: null, total: 20000 })
        ]
      }));
      assert.strictEqual(out.customerCount, 1);
      var c = out.rows[0];
      assert.strictEqual(c.name, 'Anh Tuấn');
      assert.strictEqual(c.billCount, 2);
      assert.strictEqual(c.totalSpend, 100000);
      assert.strictEqual(c.visitDays, 2);
      assert.strictEqual(c.group, 'back');
    });

    test('MASTER_CONFIGURE — STORE_MANAGER (REVIEW_APPROVE_CORRECT) không đọc được', function () {
      assertErr(G.getCustomerReport(rCtx('STORE_MANAGER', 'POS'), {
        from: '2026-03-01', to: '2026-03-10', bills: []
      }), 'FORBIDDEN');
    });
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

  describe('GetPayrollForMonth (PR2b)', function () {
    var ctx = function () { return rCtx('QUANLY_ADMIN', 'QUANLY', _r.QL); };

    test('chưa chốt thì đọc LIVE, meta.frozen=false', function () {
      var out = assertOk(_r.G.getPayrollForMonth(ctx(), {
        liveResults: [{ employeeId: 'employee_a', total: 5000000 }]
      }));
      assert.strictEqual(out.meta.frozen, false);
      assert.deepStrictEqual(out.data, [{ employeeId: 'employee_a', total: 5000000 }]);
    });

    test('đã chốt thì đọc thẳng snapshot, KHÔNG tính lại — meta.frozen=true', function () {
      var closing = {
        monthKey: '2026-03', lines: [{ employeeId: 'employee_a', total: 5000000 }], total: 5000000
      };
      var out = assertOk(_r.G.getPayrollForMonth(ctx(), { closing: closing }));
      assert.strictEqual(out.meta.frozen, true);
      assert.strictEqual(out.data.total, 5000000);
    });

    test('có cả chốt lẫn sống thì kèm drift — số sống lệch số đã chốt', function () {
      var closing = {
        monthKey: '2026-03',
        lines: [
          { employeeId: 'employee_a', total: 5000000 },
          { employeeId: 'employee_b', total: 4000000 }
        ]
      };
      var out = assertOk(_r.G.getPayrollForMonth(ctx(), {
        closing: closing,
        liveResults: [
          { employeeId: 'employee_a', total: 5200000 },
          { employeeId: 'employee_b', total: 4000000 }
        ]
      }));
      assert.strictEqual(out.data.drift.clean, false);
      assert.strictEqual(out.data.drift.drift.length, 1);
      assert.strictEqual(out.data.drift.drift[0].employeeId, 'employee_a');
      assert.strictEqual(out.data.drift.drift[0].difference, 200000);
    });

    test('nhân viên POS không đọc được báo cáo lương', function () {
      assertErr(_r.G.getPayrollForMonth(rCtx(), { liveResults: [] }), 'FORBIDDEN');
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

  test('RM7 — GetUsageReportDaily cùng cổng quyền, gộp theo ngày', function () {
    function d(type, qtyDelta, businessDate, unitId) {
      return Object.assign(entry(type, qtyDelta, unitId), { businessDate: businessDate });
    }
    assertErr(RQ.getUsageReportDaily(rCtx(), { entries: [] }), 'FORBIDDEN');
    var out = assertOk(RQ.getUsageReportDaily(boss(), {
      entries: [d('WASTE', -50, '2026-03-10', U1), d('WASTE', -10, '2026-03-11', U1)]
    }));
    assert.strictEqual(out.data.days.length, 2);
    assert.strictEqual(out.data.days[0].dateKey, '2026-03-10');
    assert.strictEqual(out.data.days[0].waste, 50);
    assert.ok(out.meta.computedAt, 'thiếu computedAt');
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
