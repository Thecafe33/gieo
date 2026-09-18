/**
 * P5 — BTP. Chuỗi thật: FIFO-CHAIN-TRACE-BTP-V1.md (4 vấn đề).
 */

var _b = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    BTP: GIEO.require('recipe-cost-btp/btp'),
    RCP: GIEO.require('recipe-cost-btp/recipe'),
    CST: GIEO.require('recipe-cost-btp/cost'),
    PREP: GIEO.require('commands/prep'),
    INV: GIEO.require('commands/inventory'),
    RPT: GIEO.require('reporting/btp-report'),
    VI: GIEO.require('compaction/versioned-input'),
    U: GIEO.require('fifo-core/unit'),
    PIPE: GIEO.require('commands/pipeline'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    NV: ids.deterministicId('actor', ['nv01']),
    BOSS: ids.deterministicId('actor', ['boss']),
    SUA: ids.deterministicId('item', ['sua']),
    TRAN_CHAU: ids.deterministicId('item', ['tran-chau-kho']),
    PREP_ITEM: ids.deterministicId('prepItem', ['tran-chau']),
    RECIPE: ids.deterministicId('recipe', ['nau-tran-chau'])
  };
})();

var T_COOK = new Date(2026, 2, 10, 8).getTime();

function bCtx() {
  var day = assertOk(_b.BD.openDay({
    storeId: _b.STORE, dateKey: '2026-03-10', actorId: _b.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _b.CLK.createClock()
  }));
  var actor = assertOk(_b.ACCESS.createActor({
    actorId: _b.NV, role: 'POS_OPERATOR', source: 'POS', stores: [_b.STORE]
  }));
  return assertOk(_b.CTXL.createContext({
    organizationId: _b.ORG, storeId: _b.STORE, actor: actor, source: 'POS', businessDay: day
  }));
}

function bReg() {
  var reg = _b.VI.createRegistry();
  assertOk(_b.RCP.publishRecipeVersion(reg, {
    recipeId: _b.RECIPE, storeId: _b.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
    publishedBy: _b.BOSS, components: { BATCH: [{ refType: 'item', refId: _b.SUA, qty: 1000 }] }
  }));
  assertOk(_b.BTP.publishYield(reg, {
    prepItemId: _b.PREP_ITEM, storeId: _b.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
    publishedBy: _b.BOSS, yieldPerBatch: 10
  }));
  return reg;
}

function rawUnit(qty) {
  var u = assertOk(_b.U.createUnit({
    unitId: _b.ids.deterministicId('unit', ['raw1']),
    itemId: _b.SUA, storeId: _b.STORE, itemKind: 'raw', initialQty: qty,
    costBasis: { unitCost: 30, versionId: 'version_c1' }, operationId: 'operation_r'
  }));
  u = assertOk(_b.U.open(u, { at: 1000, actorId: _b.NV, operationId: 'operation_o' }));
  return Object.assign({}, u, { remainingQty: qty });
}

describe('recipe-cost-btp/btp — yield versioned (fix đứt chuỗi #1)', function () {
  var BTP = _b.BTP;

  test('sửa yield KHÔNG làm trôi COGS ngày cũ — legacy đọc yieldActualAvg hiện tại', function () {
    var reg = bReg();
    assertOk(BTP.publishYield(reg, {
      prepItemId: _b.PREP_ITEM, storeId: _b.STORE, effectiveFrom: new Date(2026, 5, 1).getTime(),
      publishedBy: _b.BOSS, yieldPerBatch: 25
    }));
    var old = assertOk(BTP.resolveYieldAt(reg, {
      prepItemId: _b.PREP_ITEM, storeId: _b.STORE, at: T_COOK
    }));
    assert.strictEqual(old.payload.yieldPerBatch, 10, 'ngày cũ bị tính theo yield mới');
  });

  test('giá vốn 1 đơn vị BTP là giá THẬT của chính mẻ đó', function () {
    var b = assertOk(BTP.createBatch({
      prepItemId: _b.PREP_ITEM, storeId: _b.STORE, actualYield: 8, rawCost: 30000,
      expectedYield: 10, at: T_COOK, actorId: _b.NV, businessDate: '2026-03-10',
      operationId: 'operation_p1'
    }));
    assert.strictEqual(b.costPerUnit, 3750);
    assert.strictEqual(b.yieldVariancePct, -20);
  });

  test('mẻ không có giá vốn thì từ chối — BTP không có cost basis', function () {
    assertErr(BTP.createBatch({
      prepItemId: _b.PREP_ITEM, storeId: _b.STORE, actualYield: 8,
      at: T_COOK, actorId: _b.NV, operationId: 'op'
    }), 'VALIDATION');
  });

  test('prepCostAt ưu tiên giá của CHÍNH mẻ đã bị trừ', function () {
    var b = assertOk(BTP.createBatch({
      prepItemId: _b.PREP_ITEM, storeId: _b.STORE, actualYield: 10, rawCost: 30000,
      at: T_COOK, actorId: _b.NV, businessDate: '2026-03-10', operationId: 'op'
    }));
    var c = assertOk(BTP.prepCostAt({ batch: b }));
    assert.strictEqual(c.costPerUnit, 3000);
    assert.strictEqual(c.source, 'BATCH');
  });

  test('không có mẻ và không có yield hiệu lực thì TỪ CHỐI, không lấy yield hiện tại', function () {
    assertErr(BTP.prepCostAt({
      registry: _b.VI.createRegistry(), prepItemId: _b.PREP_ITEM,
      storeId: _b.STORE, at: T_COOK, batchRawCost: 30000
    }), 'NOT_FOUND');
  });

  describe('sửa yield', function () {
    function batch() {
      return assertOk(BTP.createBatch({
        prepItemId: _b.PREP_ITEM, storeId: _b.STORE, actualYield: 10, rawCost: 30000,
        expectedYield: 10, at: T_COOK, actorId: _b.NV, businessDate: '2026-03-10', operationId: 'op'
      }));
    }

    test('giữ audit trail đầy đủ — legacy làm đúng chỗ này, giữ nguyên', function () {
      var e = assertOk(BTP.editYield(batch(), {
        newYield: 8, consumedQty: 2, reason: 'đếm lại', actorId: _b.NV,
        at: 5000, operationId: 'operation_e1'
      }));
      assert.strictEqual(e.actualYield, 8);
      assert.strictEqual(e.costPerUnit, 3750);
      assert.strictEqual(e.yieldEdits.length, 1);
      assert.strictEqual(e.yieldEdits[0].before.actualYield, 10);
      assert.strictEqual(e.yieldEdits[0].consumedQtyAtEdit, 2);
    });

    test('initialYield BẤT BIẾN sau khi sửa', function () {
      var e = assertOk(BTP.editYield(batch(), {
        newYield: 8, consumedQty: 0, reason: 'x', actorId: _b.NV, at: 1, operationId: 'op'
      }));
      assert.strictEqual(e.initialYield, 10);
    });

    test('sửa nhỏ hơn lượng ĐÃ DÙNG bị chặn — làm tồn âm không có nguyên nhân vật lý', function () {
      var r = BTP.editYield(batch(), {
        newYield: 3, consumedQty: 7, reason: 'x', actorId: _b.NV, at: 1, operationId: 'op'
      });
      assertErr(r, 'VALIDATION');
      assert.ok(/nhỏ hơn lượng đã dùng/.test(r.error.message));
    });

    test('sửa yield phải có lý do', function () {
      assertErr(BTP.editYield(batch(), {
        newYield: 8, actorId: _b.NV, at: 1, operationId: 'op'
      }), 'VALIDATION');
    });
  });
});

describe('ACTUAL vs THEORETICAL cho BTP — mắt xích CHƯA TỪNG TỒN TẠI (fix [B3])', function () {
  var BTP = _b.BTP;

  function batches(yields) {
    return yields.map(function (y, i) {
      return assertOk(BTP.createBatch({
        prepBatchId: _b.ids.deterministicId('prepBatch', ['b' + i]),
        prepItemId: _b.PREP_ITEM, storeId: _b.STORE, actualYield: y, rawCost: 30000,
        at: T_COOK, actorId: _b.NV, businessDate: '2026-03-10', operationId: 'op' + i
      }));
    });
  }

  test('theoretical = nấu − bán − huỷ', function () {
    var t = assertOk(BTP.computeTheoretical({
      prepItemId: _b.PREP_ITEM, batches: batches([10, 10]), soldQty: 12, wasteQty: 3
    }));
    assert.strictEqual(t.producedQty, 20);
    assert.strictEqual(t.theoreticalRemaining, 5);
  });

  test('đếm khớp thì OK', function () {
    var v = assertOk(BTP.computeVariance({
      prepItemId: _b.PREP_ITEM, batches: batches([10]), soldQty: 6, wasteQty: 1, countedQty: 3
    }));
    assert.strictEqual(v.variance, 0);
    assert.strictEqual(v.status, 'OK');
  });

  test('hụt so với lý thuyết bị PHÁT HIỆN — legacy không có phép so này cho BTP', function () {
    var v = assertOk(BTP.computeVariance({
      prepItemId: _b.PREP_ITEM, batches: batches([10]), soldQty: 6, wasteQty: 1, countedQty: 1
    }));
    assert.strictEqual(v.variance, -2);
    assert.strictEqual(v.status, 'SHORT');
  });

  test('dư so với lý thuyết cũng là bất thường', function () {
    var v = assertOk(BTP.computeVariance({
      prepItemId: _b.PREP_ITEM, batches: batches([10]), soldQty: 0, wasteQty: 0, countedQty: 12
    }));
    assert.strictEqual(v.status, 'OVER');
  });

  test('chưa đếm thì KHÔNG coi lệch bằng 0', function () {
    var v = assertOk(BTP.computeVariance({
      prepItemId: _b.PREP_ITEM, batches: batches([10]), soldQty: 2
    }));
    assert.strictEqual(v.variance, null);
    assert.strictEqual(v.status, 'NOT_COUNTED');
  });

  test('dung sai được tôn trọng', function () {
    var v = assertOk(BTP.computeVariance({
      prepItemId: _b.PREP_ITEM, batches: batches([10]), soldQty: 0, wasteQty: 0,
      countedQty: 9.8, tolerance: 0.5
    }));
    assert.strictEqual(v.status, 'OK');
  });

  test('mẻ của BTP khác không lẫn vào', function () {
    var mine = batches([10]);
    var other = assertOk(BTP.createBatch({
      prepBatchId: _b.ids.deterministicId('prepBatch', ['khac']),
      prepItemId: _b.ids.deterministicId('prepItem', ['thach']),
      storeId: _b.STORE, actualYield: 99, rawCost: 1,
      at: T_COOK, actorId: _b.NV, businessDate: '2026-03-10', operationId: 'opx'
    }));
    var t = assertOk(BTP.computeTheoretical({
      prepItemId: _b.PREP_ITEM, batches: mine.concat([other])
    }));
    assert.strictEqual(t.producedQty, 10);
  });
});

describe('commands/prep — mẻ tạo Unit FIFO thật', function () {
  var PREP = _b.PREP;

  function cook(over) {
    return _b.PIPE.run(PREP.RecordPrepProduction, Object.assign({
      batchRef: 'batch-1', prepItemId: _b.PREP_ITEM, prepStockItemId: _b.TRAN_CHAU,
      recipeId: _b.RECIPE, size: 'BATCH', batchCount: 1, actualYield: 10, at: T_COOK,
      deps: { versionRegistry: bReg(), units: [rawUnit(5000)] }
    }, over || {}), bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
  }

  test('nấu xong tạo Unit BTP do FIFO sở hữu, itemKind=prep', function () {
    var plan = assertOk(cook()).plan;
    var out = plan.unitChanges.filter(function (u) { return u.itemKind === 'prep'; })[0];
    assert.ok(out, 'mẻ không tạo Unit BTP — BTP lại nằm ngoài FIFO như legacy');
    assert.strictEqual(out.initialQty, 10);
  });

  test('nguyên liệu thô bị trừ qua CÙNG engine với bán hàng', function () {
    var plan = assertOk(cook()).plan;
    var consumed = plan.ledgerEntries.filter(function (e) { return e.type === 'CONSUMPTION'; });
    assert.strictEqual(consumed.length, 1);
    assert.strictEqual(consumed[0].qtyDelta, -1000);
    assert.ok(consumed[0].unitId);
  });

  test('giá vốn Unit BTP = tổng nguyên liệu thật / yield thật', function () {
    var plan = assertOk(cook()).plan;
    var out = plan.unitChanges.filter(function (u) { return u.itemKind === 'prep'; })[0];
    /* 1000 đơn vị sữa × 30đ = 30000; yield 10 → 3000đ/đơn vị BTP */
    assert.strictEqual(out.costBasis.unitCost, 3000);
    assert.strictEqual(out.costBasis.source, 'BTP_PRODUCTION');
  });

  test('yield lệch nhiều thì PHÁT cảnh báo', function () {
    var plan = assertOk(cook({ actualYield: 6 })).plan;
    var ev = plan.events.filter(function (e) { return e.type === 'PrepYieldMismatch'; })[0];
    assert.ok(ev);
    assert.strictEqual(ev.variancePct, -40);
  });

  test('yield khớp thì không phát cảnh báo thừa', function () {
    assert.strictEqual(assertOk(cook()).plan.events.length, 0);
  });

  test('không đủ nguyên liệu thì CHẶN nấu', function () {
    assertErr(cook({ deps: { versionRegistry: bReg(), units: [rawUnit(100)] } }), 'PRECONDITION');
  });

  test('thiếu batchRef thì từ chối — đó chính là bug #22', function () {
    var r = _b.PIPE.run(PREP.RecordPrepProduction, {
      prepItemId: _b.PREP_ITEM, prepStockItemId: _b.TRAN_CHAU, recipeId: _b.RECIPE,
      actualYield: 10, deps: { versionRegistry: bReg(), units: [rawUnit(5000)] }
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
    assertErr(r, 'VALIDATION');
  });

  test('nấu lặp cùng batchRef là no-op', function () {
    var store = _b.PIPE.createInMemoryOperationStore();
    var ctx = bCtx();
    var input = {
      batchRef: 'batch-9', prepItemId: _b.PREP_ITEM, prepStockItemId: _b.TRAN_CHAU,
      recipeId: _b.RECIPE, size: 'BATCH', batchCount: 1, actualYield: 10, at: T_COOK,
      deps: { versionRegistry: bReg(), units: [rawUnit(5000)] }
    };
    assertOk(_b.PIPE.run(PREP.RecordPrepProduction, input, ctx, { operationStore: store }));
    var again = assertOk(_b.PIPE.run(PREP.RecordPrepProduction, input, ctx, { operationStore: store }));
    assert.strictEqual(again.replayed, true);
  });

  test('trace nối mẻ → nguyên liệu → Unit', function () {
    var t = assertOk(cook()).plan.traceChanges[0];
    assert.ok(t.prepBatchId);
    assert.ok(t.unitId);
    assert.strictEqual(t.unitBaseBefore, 5000);
    assert.strictEqual(t.unitBaseAfter, 4000);
  });
});

describe('commands/prep — StartPrepBatch / CompletePrepBatch / CancelPrepBatch (2 giai đoạn)', function () {
  var PREP = _b.PREP;

  function quoteId(reg, at) {
    var G = GIEO.require('read-layer/gateway');
    var CTXL = _b.CTXL;
    var ACCESS = _b.ACCESS;
    var actor = assertOk(ACCESS.createActor({
      actorId: _b.NV, role: 'POS_OPERATOR', source: 'POS', stores: [_b.STORE]
    }));
    var day = assertOk(_b.BD.openDay({
      storeId: _b.STORE, dateKey: '2026-03-10', actorId: _b.BOSS,
      at: new Date(2026, 2, 10, 7).getTime(), clock: _b.CLK.createClock()
    }));
    var ctx = assertOk(CTXL.createContext({
      organizationId: _b.ORG, storeId: _b.STORE, actor: actor, source: 'POS', businessDay: day
    }));
    var q = assertOk(G.getPrepBatchQuote(ctx, {
      prepItemId: _b.PREP_ITEM, recipeId: _b.RECIPE, batchRatio: 1, at: at, registry: reg
    })).data;
    return q.quoteId;
  }

  function start(over) {
    var reg = bReg();
    return _b.PIPE.run(PREP.StartPrepBatch, Object.assign({
      batchRef: 'startbatch-1', prepItemId: _b.PREP_ITEM, recipeId: _b.RECIPE,
      batchRatio: 1, quoteId: quoteId(reg, T_COOK), at: T_COOK,
      deps: { versionRegistry: reg, units: [rawUnit(5000)] }
    }, over || {}), bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
  }

  test('GetPrepBatchQuote trả định mức resolve theo version, không cho POS tự nhân', function () {
    var G = GIEO.require('read-layer/gateway');
    var reg = bReg();
    var ctx = bCtx();
    var q = assertOk(G.getPrepBatchQuote(ctx, {
      prepItemId: _b.PREP_ITEM, recipeId: _b.RECIPE, batchRatio: 2, at: T_COOK, registry: reg
    })).data;
    assert.strictEqual(q.requirements[0].qty, 2000, 'batchRatio 2 phải nhân đúng 1 lần, ở quote, không phải ở POS');
    assert.strictEqual(q.expectedYield, 20);
    assert.ok(q.quoteId);
  });

  test('StartPrepBatch trừ nguyên liệu ngay, CHƯA tạo Unit BTP', function () {
    var out = assertOk(start());
    var plan = out.plan;
    assert.strictEqual(plan.unitChanges.filter(function (u) { return u.itemKind === 'prep'; }).length, 0,
      'StartPrepBatch không được tạo sản phẩm — đó là việc của CompletePrepBatch');
    var consumed = plan.ledgerEntries.filter(function (e) { return e.type === 'CONSUMPTION'; });
    assert.strictEqual(consumed.length, 1);
    assert.strictEqual(consumed[0].qtyDelta, -1000);
    var rec = plan.domainRecords[0].record;
    assert.strictEqual(rec.status, 'STARTED');
    assert.strictEqual(rec.allocationSnapshot.length, 1);
  });

  test('StartPrepBatch từ chối khi thiếu quoteId — không nấu khi chưa có quote hiệu lực', function () {
    var reg = bReg();
    var r = _b.PIPE.run(PREP.StartPrepBatch, {
      batchRef: 'noquote', prepItemId: _b.PREP_ITEM, recipeId: _b.RECIPE, batchRatio: 1,
      deps: { versionRegistry: reg, units: [rawUnit(5000)] }
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
    assertErr(r, 'VALIDATION');
  });

  test('StartPrepBatch không đủ nguyên liệu thì CHẶN', function () {
    assertErr(start({ deps: { versionRegistry: bReg(), units: [rawUnit(100)] } }), 'PRECONDITION');
  });

  test('CompletePrepBatch tạo Unit BTP từ batch đã STARTED, không trừ nguyên liệu lần 2', function () {
    var started = assertOk(start()).plan.domainRecords[0].record;
    var out = assertOk(_b.PIPE.run(PREP.CompletePrepBatch, {
      prepBatchId: started.prepBatchId, prepStockItemId: _b.TRAN_CHAU,
      actualYield: 10, at: T_COOK + 1000, batch: started
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() }));

    var plan = out.plan;
    assert.strictEqual(plan.ledgerEntries.filter(function (e) { return e.type === 'CONSUMPTION'; }).length, 0,
      'CompletePrepBatch không được trừ nguyên liệu lần 2');
    var produced = plan.unitChanges.filter(function (u) { return u.itemKind === 'prep'; })[0];
    assert.strictEqual(produced.initialQty, 10);
    /* 1000 sữa × 30đ = 30000 đã chốt lúc Start; yield 10 → 3000đ/đơn vị. */
    assert.strictEqual(produced.costBasis.unitCost, 3000);
    assert.strictEqual(plan.domainRecords[0].record.status, 'PRODUCED');
  });

  test('CompletePrepBatch từ chối khi batch chưa ở trạng thái STARTED', function () {
    var started = assertOk(start()).plan.domainRecords[0].record;
    var produced = Object.assign({}, started, { status: 'PRODUCED' });
    var r = _b.PIPE.run(PREP.CompletePrepBatch, {
      prepBatchId: produced.prepBatchId, prepStockItemId: _b.TRAN_CHAU,
      actualYield: 10, batch: produced
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
    assertErr(r, 'PRECONDITION');
  });

  test('CancelPrepBatch hoàn ĐÚNG lô nguyên liệu đã trừ, không chạy lại FIFO', function () {
    var startCtx = bCtx();
    var raw = rawUnit(5000);
    var startOut = assertOk(_b.PIPE.run(PREP.StartPrepBatch, {
      batchRef: 'cancelbatch-1', prepItemId: _b.PREP_ITEM, recipeId: _b.RECIPE,
      batchRatio: 1, quoteId: quoteId(bReg(), T_COOK), at: T_COOK,
      deps: { versionRegistry: bReg(), units: [raw] }
    }, startCtx, { operationStore: _b.PIPE.createInMemoryOperationStore() }));
    var started = startOut.plan.domainRecords[0].record;
    var touchedAfterStart = startOut.plan.unitChanges[0];
    assert.strictEqual(touchedAfterStart.remainingQty, 4000);

    var out = assertOk(_b.PIPE.run(PREP.CancelPrepBatch, {
      prepBatchId: started.prepBatchId, reason: 'nhầm định mức', batch: started,
      units: [touchedAfterStart]
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() }));

    var plan = out.plan;
    var restored = plan.unitChanges.filter(function (u) { return u.unitId === raw.unitId; })[0];
    assert.strictEqual(restored.remainingQty, 5000, 'huỷ mẻ phải trả đúng lượng đã trừ về lại Unit gốc');
    var reversal = plan.ledgerEntries.filter(function (e) { return e.type === 'REVERSAL'; })[0];
    assert.strictEqual(reversal.qtyDelta, 1000);
    assert.strictEqual(plan.domainRecords[0].record.status, 'CANCELLED');
    assert.ok(plan.events.filter(function (e) { return e.type === 'BatchCancelled'; }).length === 1);
  });

  test('CancelPrepBatch phải có lý do', function () {
    var started = assertOk(start()).plan.domainRecords[0].record;
    var r = _b.PIPE.run(PREP.CancelPrepBatch, {
      prepBatchId: started.prepBatchId, batch: started, units: []
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
    assertErr(r, 'VALIDATION');
  });

  test('CancelPrepBatch từ chối khi batch không còn ở trạng thái STARTED', function () {
    var started = assertOk(start()).plan.domainRecords[0].record;
    var cancelled = Object.assign({}, started, { status: 'CANCELLED' });
    var r = _b.PIPE.run(PREP.CancelPrepBatch, {
      prepBatchId: cancelled.prepBatchId, reason: 'x', batch: cancelled, units: []
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() });
    assertErr(r, 'PRECONDITION');
  });

  test('bắt đầu lặp cùng batchRef là no-op — không trừ nguyên liệu lần 2', function () {
    var reg = bReg();
    var store = _b.PIPE.createInMemoryOperationStore();
    var ctx = bCtx();
    var input = {
      batchRef: 'startbatch-idem', prepItemId: _b.PREP_ITEM, recipeId: _b.RECIPE,
      batchRatio: 1, quoteId: quoteId(reg, T_COOK), at: T_COOK,
      deps: { versionRegistry: reg, units: [rawUnit(5000)] }
    };
    assertOk(_b.PIPE.run(PREP.StartPrepBatch, input, ctx, { operationStore: store }));
    var again = assertOk(_b.PIPE.run(PREP.StartPrepBatch, input, ctx, { operationStore: store }));
    assert.strictEqual(again.replayed, true);
  });
});

describe('waste BTP dùng CHUNG đường với raw (fix đứt chuỗi #2)', function () {
  test('waste BTP luôn có ingredientBreakdown, bất kể trigger từ đâu', function () {
    var prepUnit = assertOk(_b.U.createUnit({
      unitId: _b.ids.deterministicId('unit', ['prepu']),
      itemId: _b.TRAN_CHAU, storeId: _b.STORE, itemKind: 'prep', initialQty: 10,
      costBasis: { unitCost: 3000 }, operationId: 'operation_p'
    }));
    prepUnit = assertOk(_b.U.open(prepUnit, { at: 1000, actorId: _b.NV, operationId: 'operation_o' }));
    prepUnit = Object.assign({}, prepUnit, { remainingQty: 10 });

    var out = assertOk(_b.PIPE.run(_b.INV.RecordWaste, {
      itemId: _b.TRAN_CHAU, qty: 3, domain: 'prep', wasteRef: 'endshift-1',
      reason: 'hết hạn cuối ca', units: [prepUnit]
    }, bCtx(), { operationStore: _b.PIPE.createInMemoryOperationStore() }));

    var rec = out.plan.domainRecords[0].record;
    assert.strictEqual(rec.ingredientBreakdown.length, 1,
      'đường hết-hạn-cuối-ca thiếu breakdown — đúng lỗi legacy');
    assert.strictEqual(rec.wasteCost, 3 * 3000);
  });
});

describe('reporting/btp-report — {nấu, dùng, huỷ} theo ngày (fix đứt chuỗi #3)', function () {
  var RPT = _b.RPT;

  var batches = [
    { status: 'PRODUCED', businessDate: '2026-03-10', actualYield: 10, rawCost: 30000 },
    { status: 'PRODUCED', businessDate: '2026-03-10', actualYield: 8, rawCost: 24000 },
    { status: 'PRODUCED', businessDate: '2026-03-11', actualYield: 12, rawCost: 36000 },
    { status: 'CANCELLED', businessDate: '2026-03-11', actualYield: 99, rawCost: 99 }
  ];

  test('gom đúng theo ngày, bỏ mẻ đã huỷ', function () {
    var r = assertOk(RPT.buildDaily({ batches: batches }));
    assert.strictEqual(r.rows.length, 2);
    assert.strictEqual(r.rows[0].nau, 18);
    assert.strictEqual(r.rows[0].batchCount, 2);
    assert.strictEqual(r.rows[1].nau, 12, 'mẻ CANCELLED bị tính vào lượng nấu');
  });

  test('dùng và huỷ lấy từ ledger', function () {
    var r = assertOk(RPT.buildDaily({
      batches: batches,
      consumption: [{ businessDate: '2026-03-10', qtyDelta: -5 }],
      waste: [{ businessDate: '2026-03-10', qtyDelta: -2, unitCost: 3000 }]
    }));
    assert.strictEqual(r.rows[0].dung, 5);
    assert.strictEqual(r.rows[0].huy, 2);
    assert.strictEqual(r.rows[0].huyCost, 6000);
  });

  test('tỉ lệ huỷ trên lượng nấu — con số chủ quán cần nhìn', function () {
    var r = assertOk(RPT.buildDaily({
      batches: [{ status: 'PRODUCED', businessDate: '2026-03-10', actualYield: 10, rawCost: 1 }],
      waste: [{ businessDate: '2026-03-10', qtyDelta: -2, unitCost: 0 }]
    }));
    assert.strictEqual(r.rows[0].huyPct, 20);
  });

  test('ngày không nấu gì thì tỉ lệ huỷ là null, không chia cho 0', function () {
    var r = assertOk(RPT.buildDaily({
      batches: [], waste: [{ businessDate: '2026-03-10', qtyDelta: -2, unitCost: 0 }]
    }));
    assert.strictEqual(r.rows[0].huyPct, null);
  });

  test('xuất được ra CSV với thứ tự cột ổn định', function () {
    var EX = GIEO.require('reporting/export-payload');
    var r = assertOk(RPT.buildDaily({ batches: batches }));
    var csv = assertOk(EX.toCsv({ columns: RPT.COLUMNS, rows: r.rows }));
    assert.ok(csv.split('\n')[0].indexOf('Ngày') === 0);
    assert.strictEqual(csv.split('\n').length, 3);
  });
});
