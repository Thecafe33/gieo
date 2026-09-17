/**
 * [3] Sales → COGS → P&L.
 * Chuỗi thật: FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md.
 * Gap nghiêm trọng nhất toàn audit: "COGS actual" chưa từng tồn tại (§3).
 */

var _s = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    VI: GIEO.require('compaction/versioned-input'),
    RCP: GIEO.require('recipe-cost-btp/recipe'),
    CST: GIEO.require('recipe-cost-btp/cost'),
    COGS: GIEO.require('recipe-cost-btp/cogs'),
    U: GIEO.require('fifo-core/unit'),
    A: GIEO.require('fifo-core/allocation'),
    SALES: GIEO.require('commands/sales'),
    PIPE: GIEO.require('commands/pipeline'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    BOSS: ids.deterministicId('actor', ['boss']),
    NV: ids.deterministicId('actor', ['nv01']),
    SUA: ids.deterministicId('item', ['sua']),
    LY: ids.deterministicId('item', ['ly']),
    MON: ids.deterministicId('item', ['tra-sua']),
    RECIPE: ids.deterministicId('recipe', ['tra-sua'])
  };
})();

var T_SALE = new Date(2026, 2, 10, 10).getTime();

function setupRegistry() {
  var reg = _s.VI.createRegistry();
  assertOk(_s.RCP.publishRecipeVersion(reg, {
    recipeId: _s.RECIPE, storeId: _s.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
    publishedBy: _s.BOSS, components: { M: [{ refType: 'item', refId: _s.SUA, qty: 100 }] }
  }));
  assertOk(_s.CST.publishCostBasis(reg, {
    itemId: _s.SUA, storeId: _s.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
    publishedBy: _s.BOSS, unitCost: 30
  }));
  return reg;
}

function mkUnit(unitCost, qty, openedAt, tag) {
  var u = assertOk(_s.U.createUnit({
    unitId: _s.ids.deterministicId('unit', [tag || 'u1']),
    itemId: _s.SUA, storeId: _s.STORE, itemKind: 'raw', initialQty: qty,
    costBasis: { unitCost: unitCost, versionId: 'version_c' + unitCost },
    operationId: 'operation_recv_' + (tag || 'u1')
  }));
  u = assertOk(_s.U.open(u, { at: openedAt, actorId: _s.NV, operationId: 'operation_open' }));
  return Object.assign({}, u, { remainingQty: qty });
}

describe('recipe-cost-btp/recipe — versioned (instance #1, vi phạm rõ nhất)', function () {
  var RCP = _s.RCP;

  test('đổi công thức KHÔNG làm trôi COGS của bill cũ', function () {
    var reg = _s.VI.createRegistry();
    assertOk(RCP.publishRecipeVersion(reg, {
      recipeId: _s.RECIPE, storeId: _s.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
      publishedBy: _s.BOSS, components: { M: [{ refType: 'item', refId: _s.SUA, qty: 100 }] }
    }));
    assertOk(RCP.publishRecipeVersion(reg, {
      recipeId: _s.RECIPE, storeId: _s.STORE, effectiveFrom: new Date(2026, 5, 1).getTime(),
      publishedBy: _s.BOSS, components: { M: [{ refType: 'item', refId: _s.SUA, qty: 250 }] }
    }));
    var old = assertOk(RCP.resolveRecipeAt(reg, { recipeId: _s.RECIPE, storeId: _s.STORE, at: T_SALE }));
    assert.strictEqual(old.payload.components.M[0].qty, 100, 'bill cũ bị tính theo công thức mới');
  });

  test('định mức không khai size thì báo lỗi, KHÔNG suy ra từ size khác', function () {
    var reg = setupRegistry();
    var v = assertOk(RCP.resolveRecipeAt(reg, { recipeId: _s.RECIPE, storeId: _s.STORE, at: T_SALE }));
    assertErr(RCP.toRequirements(v, { size: 'L', qty: 1 }), 'NOT_FOUND');
  });

  test('yêu cầu vật chất nhân đúng số lượng, mang theo recipeVersionId', function () {
    var reg = setupRegistry();
    var v = assertOk(RCP.resolveRecipeAt(reg, { recipeId: _s.RECIPE, storeId: _s.STORE, at: T_SALE }));
    var out = assertOk(RCP.toRequirements(v, { size: 'M', qty: 3 }));
    assert.strictEqual(out.requirements[0].qty, 300);
    assert.strictEqual(out.recipeVersionId, v.versionId);
  });

  test('món chưa khai định mức nói ra được, không im lặng trả 0', function () {
    assertErr(RCP.requireRecipe({ name: 'Món lạ', recipeId: null }), 'PRECONDITION');
  });

  test('định mức rỗng bị từ chối', function () {
    assertErr(RCP.publishRecipeVersion(_s.VI.createRegistry(), {
      recipeId: _s.RECIPE, storeId: _s.STORE, effectiveFrom: 1, publishedBy: _s.BOSS,
      components: { M: [] }
    }), 'VALIDATION');
  });
});

describe('recipe-cost-btp/cost', function () {
  var CST = _s.CST;

  test('giá vốn Unit ưu tiên giá THỰC TRẢ trên phiếu nhập', function () {
    var reg = setupRegistry();
    var cb = assertOk(CST.costBasisForNewUnit(reg, {
      itemId: _s.SUA, storeId: _s.STORE, at: T_SALE, paidUnitCost: 45
    }));
    assert.strictEqual(cb.unitCost, 45);
    assert.strictEqual(cb.source, 'RECEIVING');
  });

  test('không có giá trên phiếu thì rơi về CostBasis tại thời điểm nhận', function () {
    var cb = assertOk(CST.costBasisForNewUnit(setupRegistry(), {
      itemId: _s.SUA, storeId: _s.STORE, at: T_SALE
    }));
    assert.strictEqual(cb.unitCost, 30);
    assert.strictEqual(cb.source, 'COST_BASIS');
  });

  test('không có giá nào thì TỪ CHỐI tạo Unit — không có costBasis thì cogsActual vô nghĩa', function () {
    assertErr(CST.costBasisForNewUnit(_s.VI.createRegistry(), {
      itemId: _s.SUA, storeId: _s.STORE, at: T_SALE
    }), 'PRECONDITION');
  });

  test('thiếu giá 1 thành phần thì TỪ CHỐI cả cụm, không coi phần thiếu là 0', function () {
    var reg = setupRegistry();
    var r = CST.computeTheoreticalCost(reg, {
      storeId: _s.STORE, at: T_SALE,
      requirements: [{ itemId: _s.SUA, qty: 100 }, { itemId: _s.LY, qty: 1 }]
    });
    assertErr(r, 'NOT_FOUND');
    assert.ok(/không được coi phần thiếu bằng 0/.test(r.error.message));
  });
});

describe('COGS — HAI con số (đóng gap nghiêm trọng nhất toàn audit)', function () {
  var COGS = _s.COGS;

  function runCogs(units, qty) {
    var reg = setupRegistry();
    var ws = _s.A.createWorkingSet(units);
    var reqs = [{ itemId: _s.SUA, qty: qty }];
    var alloc = assertOk(_s.A.allocateMany(ws, reqs, { operationId: 'operation_sale1' }));
    return assertOk(COGS.computeCogs({
      registry: reg, storeId: _s.STORE, at: T_SALE,
      requirements: reqs, allocationPlans: alloc.plans
    }));
  }

  test('giá lô khớp giá khai → variance = 0', function () {
    var c = runCogs([mkUnit(30, 1000, 100)], 300);
    assert.strictEqual(c.cogsTheoretical, 9000);
    assert.strictEqual(c.cogsActual, 9000);
    assert.strictEqual(c.variance, 0);
  });

  test('NCC tăng giá đột xuất → phát hiện được, thứ legacy KHÔNG thể', function () {
    /* Lô nhập thật 50đ/đv trong khi giá đang khai là 30đ/đv. */
    var c = runCogs([mkUnit(50, 1000, 100)], 300);
    assert.strictEqual(c.cogsTheoretical, 9000);
    assert.strictEqual(c.cogsActual, 15000);
    assert.strictEqual(c.variance, 6000);
    assert.ok(Math.abs(c.variancePct - 66.67) < 0.1);
    assert.strictEqual(COGS.explainVariance(c).status, 'OVER');
  });

  test('trộn nhiều lô giá khác nhau → actual là tổng THẬT theo từng lô', function () {
    var re = mkUnit(30, 100, 100, 'cu');
    var dat = mkUnit(50, 500, 200, 'moi');
    var c = runCogs([re, dat], 300);
    assert.strictEqual(c.cogsActual, 100 * 30 + 200 * 50);
    assert.strictEqual(c.cogsTheoretical, 300 * 30);
  });

  test('cogsActual = null khi không có lô nào — KHÔNG fallback sang theoretical (R8)', function () {
    var c = runCogs([], 300);
    assert.strictEqual(c.cogsTheoretical, 9000);
    assert.strictEqual(c.cogsActual, null, 'theoretical bị gán vào cogsActual — đúng lỗi legacy');
    assert.strictEqual(c.variance, null);
    assert.strictEqual(c.cogsActualReason, 'NO_ALLOCATION');
  });

  test('thiếu hàng giữa chừng → actual KHÔNG đầy đủ, nói rõ thay vì bù bằng giá lý thuyết', function () {
    var c = runCogs([mkUnit(30, 100, 100)], 300);
    assert.strictEqual(c.cogsActual, null);
    assert.strictEqual(c.cogsActualReason, 'SHORTFALL');
    assert.strictEqual(c.cogsActualPartial, 3000, 'phần đã cấp phát vẫn phải báo được');
    assert.strictEqual(COGS.explainVariance(c).status, 'UNKNOWN');
  });

  test('variance trong ngưỡng thì báo OK', function () {
    var c = runCogs([mkUnit(31, 1000, 100)], 300);
    assert.strictEqual(COGS.explainVariance(c, 5).status, 'OK');
  });

  test('kết quả mang theo versionId và unitId để truy vết ngược', function () {
    var c = runCogs([mkUnit(30, 1000, 100)], 300);
    assert.ok(c.basis.costBasisVersionIds.length > 0);
    assert.ok(c.basis.unitIds.length > 0);
  });

  test('N10 (§2.3a): gapLineCount > 0 → cả 2 vế COGS về null kèm reason, KHÔNG âm thầm tính thiếu', function () {
    var reg = setupRegistry();
    var units = [mkUnit(30, 1000, 100)];
    var ws = _s.A.createWorkingSet(units);
    var reqs = [{ itemId: _s.SUA, qty: 300 }];
    var alloc = assertOk(_s.A.allocateMany(ws, reqs, { operationId: 'operation_sale1' }));
    var c = assertOk(COGS.computeCogs({
      registry: reg, storeId: _s.STORE, at: T_SALE,
      requirements: reqs, allocationPlans: alloc.plans, gapLineCount: 1
    }));
    assert.strictEqual(c.cogsTheoretical, null);
    assert.strictEqual(c.cogsTheoreticalReason, 'NO_RECIPE');
    assert.strictEqual(c.cogsTheoreticalPartial, 9000, 'phần đã tính được từ các dòng CÓ định mức vẫn phải báo được');
    assert.strictEqual(c.cogsActual, null);
    assert.strictEqual(c.cogsActualReason, 'NO_RECIPE');
    assert.strictEqual(c.cogsActualPartial, 9000);
    assert.strictEqual(c.variance, null);
    assert.strictEqual(COGS.explainVariance(c).status, 'UNKNOWN');
  });
});

describe('commands/sales — Bill model', function () {
  var S = _s.SALES;

  function bill(over) {
    return S.buildBill(Object.assign({
      storeId: _s.STORE, soldByActorId: _s.NV, businessDate: '2026-03-10', occurredAt: T_SALE,
      channel: { type: 'DINE_IN' },
      lines: [{ menuItemId: _s.MON, size: 'M', qty: 2, price: 30000, recipeId: _s.RECIPE, name: 'Trà sữa' }]
    }, over || {}));
  }

  test('soldByActorId BẮT BUỘC — ngoại lệ duy nhất của hệ thống cũ (§4.7)', function () {
    var r = S.buildBill({
      storeId: _s.STORE, businessDate: '2026-03-10', occurredAt: T_SALE,
      channel: { type: 'DINE_IN' }, lines: [{ menuItemId: _s.MON, size: 'M', qty: 1, price: 30000 }]
    });
    assertErr(r, 'VALIDATION');
    assert.ok(/soldByActorId/.test(r.error.message));
  });

  test('giá trên dòng là SNAPSHOT, tổng tính từ đó', function () {
    var b = assertOk(bill());
    assert.strictEqual(b.subtotal, 60000);
    assert.strictEqual(b.lines[0].price, 30000);
  });

  describe('channel là first-class, phí sàn được ĐỌC THẬT (fix §5)', function () {
    test('bán tại quán không có phí', function () {
      var b = assertOk(bill());
      assert.strictEqual(b.channelFee, 0);
      assert.strictEqual(b.netRevenue, 60000);
    });

    test('bán qua sàn TRỪ phí thật khỏi doanh thu thuần', function () {
      var b = assertOk(bill({ channel: { type: 'APP', appName: 'ShopeeFood', feePct: 25 } }));
      assert.strictEqual(b.channelFee, 15000);
      assert.strictEqual(b.netRevenue, 45000, 'phí sàn lại bị bỏ qua như legacy (hard-code 0)');
    });

    test('bán qua sàn mà thiếu feePct thì TỪ CHỐI', function () {
      var r = bill({ channel: { type: 'APP', appName: 'ShopeeFood' } });
      assertErr(r, 'VALIDATION');
      assert.ok(/ghi rồi không bao giờ đọc/.test(r.error.message));
    });

    test('bán qua sàn phải ghi tên sàn', function () {
      assertErr(bill({ channel: { type: 'APP', feePct: 25 } }), 'VALIDATION');
    });

    test('channel lạ bị từ chối', function () {
      assertErr(bill({ channel: { type: 'TELEPATHY' } }), 'VALIDATION');
    });
  });

  test('giảm giá trừ vào tổng, không âm', function () {
    var b = assertOk(bill({ discountTotal: 100000 }));
    assert.strictEqual(b.total, 0);
  });

  test('bill rỗng bị từ chối', function () {
    assertErr(bill({ lines: [] }), 'VALIDATION');
  });
});

describe('commands/pipeline + RecordSale end-to-end', function () {
  var PIPE = _s.PIPE;
  var S = _s.SALES;

  function ctx(source, actorId) {
    var day = assertOk(_s.BD.openDay({
      storeId: _s.STORE, dateKey: '2026-03-10', actorId: _s.BOSS,
      at: new Date(2026, 2, 10, 7).getTime(), clock: _s.CLK.createClock()
    }));
    var actor = assertOk(_s.ACCESS.createActor({
      actorId: actorId || _s.NV, role: 'POS_OPERATOR', source: source || 'POS', stores: [_s.STORE]
    }));
    return assertOk(_s.CTXL.createContext({
      organizationId: _s.ORG, storeId: _s.STORE, actor: actor, source: source || 'POS', businessDay: day
    }));
  }

  function runSale(over, units, c) {
    var b = assertOk(S.buildBill(Object.assign({
      billId: _s.ids.deterministicId('bill', ['b1']),
      storeId: _s.STORE, soldByActorId: _s.NV, businessDate: '2026-03-10', occurredAt: T_SALE,
      channel: { type: 'DINE_IN' },
      lines: [{ menuItemId: _s.MON, size: 'M', qty: 2, price: 30000, recipeId: _s.RECIPE }]
    }, over || {})));
    return {
      bill: b,
      run: function (store) {
        return PIPE.run(S.RecordSale, {
          bill: b, deps: { versionRegistry: setupRegistry(), units: units || [mkUnit(30, 1000, 100)] }
        }, c || ctx(), { operationStore: store || PIPE.createInMemoryOperationStore() });
      }
    };
  }

  test('bán hàng đi trọn pipeline, sinh MutationPlan đầy đủ', function () {
    var out = assertOk(runSale().run());
    assert.strictEqual(out.status, 'COMPLETED');
    var plan = out.plan;
    assert.strictEqual(plan.domainRecords[0].type, 'bill');
    assert.ok(plan.ledgerEntries.length > 0);
    assert.ok(plan.traceChanges.length > 0);
    assert.ok(plan.projectionRecomputes.length > 0);
  });

  test('bill hoàn tất mang CẢ HAI vế COGS', function () {
    var plan = assertOk(runSale().run()).plan;
    var b = plan.domainRecords[0].record;
    assert.strictEqual(b.cogs.cogsTheoretical, 200 * 30);
    assert.strictEqual(b.cogs.cogsActual, 200 * 30);
    assert.ok(b.recipeVersionIds.length > 0, 'bill không ghi lại recipeVersion đã dùng');
  });

  test('IDEMPOTENCY: bấm thanh toán 2 lần KHÔNG trừ kho 2 lần', function () {
    var store = PIPE.createInMemoryOperationStore();
    var c = ctx();
    var s = runSale(null, null, c);
    var first = assertOk(s.run(store));
    var second = assertOk(s.run(store));
    assert.strictEqual(first.replayed, false);
    assert.strictEqual(second.replayed, true, 'lần 2 chạy lại thật — kho bị trừ đúp');
    assert.strictEqual(first.operationId, second.operationId);
  });

  test('operationId xác định theo billId, không ngẫu nhiên', function () {
    var a = S.RecordSale.operationId({ bill: { billId: 'bill_x' } });
    var b = S.RecordSale.operationId({ bill: { billId: 'bill_x' } });
    assert.strictEqual(a, b);
  });

  test('trace ghi đủ lineage Bill → Unit → UnitBase trước/sau', function () {
    var t = assertOk(runSale().run()).plan.traceChanges[0];
    ['billId', 'unitId', 'itemId', 'qty', 'unitBaseBefore', 'unitBaseAfter', 'costBasisVersionId']
      .forEach(function (k) { assert.ok(t[k] !== undefined, 'trace thiếu ' + k); });
  });

  test('ledger entry sinh ra tự tuân thủ quy tắc §5 (có unitId → delta = 0)', function () {
    var L = GIEO.require('fifo-core/ledger');
    var entries = assertOk(runSale().run()).plan.ledgerEntries.map(function (e) {
      return assertOk(L.createEntry(Object.assign({ operationId: 'operation_x' }, e)));
    });
    assertOk(L.auditEntries(entries));
    assert.strictEqual(L.sumUntrackedPendingDelta(entries), 0);
  });

  test('KHÔNG đủ nguyên liệu VẪN bán được — chốt chủ quán 2026-09 (SOP cho thay nguyên liệu khi hết)', function () {
    var out = assertOk(runSale(null, [mkUnit(30, 50, 100)]).run());
    assert.strictEqual(out.status, 'COMPLETED');
    var plan = out.plan;
    var debtUnit = plan.unitChanges.filter(function (u) { return u.debt; })[0];
    assert.ok(debtUnit, 'không thấy Unit gánh nợ phần thiếu');
    assert.strictEqual(debtUnit.debt.amount, 150);
    assert.ok(debtUnit.needsReview, 'Unit gánh nợ phải gắn needsReview cho QUANLY rà');
    assert.ok(debtUnit.needsReviewReasons.indexOf('NEGATIVE_REMAINDER') !== -1);

    var evt = plan.events.filter(function (e) { return e.type === 'IngredientShortfallRecorded'; })[0];
    assert.ok(evt, 'thiếu event IngredientShortfallRecorded để L9 báo QUANLY');
    assert.strictEqual(evt.shortfallQty, 150);
    assert.strictEqual(evt.unitId, debtUnit.unitId);
  });

  test('N10 (§2.3a): món chưa khai định mức KHÔNG chặn bán — legacy chỉ soft-warn', function () {
    var out = assertOk(runSale({
      lines: [{ menuItemId: _s.MON, size: 'M', qty: 1, price: 30000, recipeId: null }]
    }).run());
    assert.strictEqual(out.status, 'COMPLETED');
  });

  test('N10: bill chưa khai định mức KHÔNG âm thầm tính thiếu — cogs về null kèm reason', function () {
    var plan = assertOk(runSale({
      lines: [{ menuItemId: _s.MON, size: 'M', qty: 1, price: 30000, recipeId: null }]
    }).run()).plan;
    var b = plan.domainRecords[0].record;
    assert.strictEqual(b.cogs.cogsTheoretical, null);
    assert.strictEqual(b.cogs.cogsTheoreticalReason, 'NO_RECIPE');
    assert.strictEqual(b.cogs.cogsActual, null);
    assert.strictEqual(b.cogs.cogsActualReason, 'NO_RECIPE');
  });

  test('N10: phát MissingRecipeDetected cho L9 tạo alert MISSING_RECIPE, gộp theo menuItemId', function () {
    var plan = assertOk(runSale({
      lines: [
        { menuItemId: _s.MON, size: 'M', qty: 1, price: 30000, recipeId: null },
        { menuItemId: _s.MON, size: 'M', qty: 1, price: 30000, recipeId: null }
      ]
    }).run()).plan;
    var evts = plan.events.filter(function (e) { return e.type === 'MissingRecipeDetected'; });
    assert.strictEqual(evts.length, 1, 'cùng 1 món thiếu định mức chỉ cần 1 alert, không phải 1/dòng');
    assert.strictEqual(evts[0].menuItemId, _s.MON);
  });

  test('N10: món CÓ định mức thì KHÔNG phát MissingRecipeDetected', function () {
    var plan = assertOk(runSale().run()).plan;
    assert.strictEqual(plan.events.filter(function (e) { return e.type === 'MissingRecipeDetected'; }).length, 0);
  });

  test('QUANLY KHÔNG gọi được RecordSale (quyền enforce ở Command, không phải UI)', function () {
    var qlActor = assertOk(_s.ACCESS.createActor({
      actorId: _s.NV, role: 'STORE_MANAGER', source: 'QUANLY', stores: [_s.STORE]
    }));
    var day = assertOk(_s.BD.openDay({
      storeId: _s.STORE, dateKey: '2026-03-10', actorId: _s.BOSS,
      at: new Date(2026, 2, 10, 7).getTime(), clock: _s.CLK.createClock()
    }));
    var qlCtx = assertOk(_s.CTXL.createContext({
      organizationId: _s.ORG, storeId: _s.STORE, actor: qlActor, source: 'QUANLY', businessDay: day
    }));
    assertErr(runSale(null, null, qlCtx).run(), 'FORBIDDEN');
  });

  test('ngày làm việc ĐÃ CHỐT thì khoá bán', function () {
    var day = assertOk(_s.BD.openDay({
      storeId: _s.STORE, dateKey: '2026-03-10', actorId: _s.BOSS,
      at: new Date(2026, 2, 10, 7).getTime(), clock: _s.CLK.createClock()
    }));
    var closed = assertOk(_s.BD.closeDay(day, {
      actorId: _s.BOSS, operationId: _s.ids.deterministicId('operation', ['close', 'x']),
      at: new Date(2026, 2, 10, 23).getTime()
    }));
    var actor = assertOk(_s.ACCESS.createActor({
      actorId: _s.NV, role: 'POS_OPERATOR', source: 'POS', stores: [_s.STORE]
    }));
    var c = assertOk(_s.CTXL.createContext({
      organizationId: _s.ORG, storeId: _s.STORE, actor: actor, source: 'POS', businessDay: closed
    }));
    assertErr(runSale(null, null, c).run(), 'PRECONDITION');
  });

  test('bán hộ người khác bị chặn', function () {
    var c = ctx('POS', _s.ids.deterministicId('actor', ['nv02']));
    assertErr(runSale(null, null, c).run(), 'FORBIDDEN');
  });

  test('audit tự gắn đủ trường, command không phải tự nhớ', function () {
    var a = assertOk(runSale().run()).plan.audit;
    ['operationId', 'actorId', 'source', 'storeId', 'businessDate', 'command'].forEach(function (k) {
      assert.ok(a[k], 'audit thiếu ' + k);
    });
    assert.strictEqual(a.command, 'RecordSale');
  });

  test('có khách hàng thì phát event cho loyalty (handler riêng, không nhét vào lệnh bán)', function () {
    var cust = _s.ids.deterministicId('customer', ['kh1']);
    var plan = assertOk(runSale({ customerId: cust }).run()).plan;
    assert.strictEqual(plan.events[0].type, 'SaleCompleted');
    assert.strictEqual(plan.events[0].customerId, cust);
  });

  test('command không khai operationId thì KHÔNG định nghĩa được', function () {
    assert.throws(function () {
      PIPE.defineCommand({ name: 'T_Bad', authority: 'EXECUTE', mutates: true, execute: function () {} });
    }, /phải khai hàm operationId/);
  });
});

describe('RecordAddon — đóng gap "addon không cộng điểm" (§1, §4.16)', function () {
  var PIPE = _s.PIPE;
  var S = _s.SALES;

  function addonCtx() {
    var day = assertOk(_s.BD.openDay({
      storeId: _s.STORE, dateKey: '2026-03-10', actorId: _s.BOSS,
      at: new Date(2026, 2, 10, 7).getTime(), clock: _s.CLK.createClock()
    }));
    var actor = assertOk(_s.ACCESS.createActor({
      actorId: _s.NV, role: 'POS_OPERATOR', source: 'POS', stores: [_s.STORE]
    }));
    return assertOk(_s.CTXL.createContext({
      organizationId: _s.ORG, storeId: _s.STORE, actor: actor, source: 'POS', businessDay: day
    }));
  }

  test('addon có khách thì PHÁT event cho đúng phần chênh lệch', function () {
    var cust = _s.ids.deterministicId('customer', ['kh1']);
    var out = assertOk(PIPE.run(S.RecordAddon, {
      billId: _s.ids.deterministicId('bill', ['b1']), addonSeq: 1,
      addedAmount: 15000, customerId: cust
    }, addonCtx(), { operationStore: PIPE.createInMemoryOperationStore() }));
    var ev = out.plan.events[0];
    assert.strictEqual(ev.type, 'SaleAmountIncreased');
    assert.strictEqual(ev.addedAmount, 15000, 'phải là phần chênh lệch, không phải tổng bill');
  });

  test('thiếu addonSeq thì từ chối — đó chính là bug #23 (thiếu txId cố định)', function () {
    var r = PIPE.run(S.RecordAddon, {
      billId: _s.ids.deterministicId('bill', ['b1']), addedAmount: 15000
    }, addonCtx(), { operationStore: PIPE.createInMemoryOperationStore() });
    assertErr(r, 'VALIDATION');
  });

  test('addon lặp cùng seq là no-op', function () {
    var store = PIPE.createInMemoryOperationStore();
    var c = addonCtx();
    var input = { billId: _s.ids.deterministicId('bill', ['b1']), addonSeq: 2, addedAmount: 5000 };
    assertOk(PIPE.run(S.RecordAddon, input, c, { operationStore: store }));
    assert.strictEqual(assertOk(PIPE.run(S.RecordAddon, input, c, { operationStore: store })).replayed, true);
  });
});
