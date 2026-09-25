/**
 * SC1 (classifyCountMode) + SC2 (SubmitStockCount) — `commands/stock-count.js`.
 * Chuỗi thật: `NET-STOCK-COUNT-V1.md` SC1/SC2. SC3 (ApproveStockCount) đã có
 * sẵn ở `commands/approval.js` — test cuối ở đây nối thẳng output của
 * SubmitStockCount vào ApproveStockCount để chứng minh hình dạng khớp nhau.
 */

var _sc = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    PIPE: GIEO.require('commands/pipeline'),
    SC: GIEO.require('commands/stock-count'),
    RCV: GIEO.require('commands/receiving'),
    APR: GIEO.require('commands/approval'),
    U: GIEO.require('fifo-core/unit'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    BOSS: ids.deterministicId('actor', ['boss']),
    NV: ids.deterministicId('actor', ['nv01']),
    SUA: ids.deterministicId('item', ['sua']),
    TUONG: ids.deterministicId('item', ['tuong-ot'])
  };
})();

function scCtx(role, source, actorId) {
  var day = assertOk(_sc.BD.openDay({
    storeId: _sc.STORE, dateKey: '2026-03-10', actorId: _sc.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _sc.CLK.createClock()
  }));
  var actor = assertOk(_sc.ACCESS.createActor({
    actorId: actorId || _sc.NV, role: role || 'POS_OPERATOR',
    source: source || 'POS', stores: [_sc.STORE]
  }));
  return assertOk(_sc.CTXL.createContext({
    organizationId: _sc.ORG, storeId: _sc.STORE, actor: actor, source: source || 'POS', businessDay: day
  }));
}

function run(input, ctx, store) {
  return _sc.PIPE.run(_sc.SC.SubmitStockCount, input, ctx || scCtx(), {
    operationStore: store || _sc.PIPE.createInMemoryOperationStore()
  });
}

function runApprove(input, ctx, store) {
  return _sc.PIPE.run(_sc.APR.ApproveStockCount, input, ctx || scCtx('QUANLY_ADMIN', 'QUANLY'), {
    operationStore: store || _sc.PIPE.createInMemoryOperationStore()
  });
}

function mkUnit(qty, tag) {
  var sealed = assertOk(_sc.U.createUnit({
    unitId: _sc.ids.deterministicId('unit', ['sc', tag || 'x1']),
    itemId: _sc.SUA, storeId: _sc.STORE, itemKind: 'raw', initialQty: qty,
    costBasis: { unitCost: 30, versionId: null, source: 'RECEIVING' },
    operationId: 'operation_sc_' + (tag || 'x1')
  }));
  return assertOk(_sc.U.open(sealed, {
    at: new Date(2026, 2, 10, 8).getTime(), actorId: _sc.NV,
    operationId: 'operation_sc_open_' + (tag || 'x1')
  }));
}

describe('classifyCountMode — tái dùng classifyTrackingMode (fix cùng gốc AMBIGUOUS với RM1)', function () {
  test('trackingMode "unit" tường minh trên item → countMode "unit" (bắt buộc quét mã)', function () {
    assert.strictEqual(_sc.SC.classifyCountMode({ trackingMode: 'unit' }), 'unit');
  });

  test('trackingMode "batch"/"none"/thiếu → countMode "qty" (đếm tổng bằng tay)', function () {
    assert.strictEqual(_sc.SC.classifyCountMode({ trackingMode: 'batch' }), 'qty');
    assert.strictEqual(_sc.SC.classifyCountMode({ trackingMode: 'none' }), 'qty');
    assert.strictEqual(_sc.SC.classifyCountMode({}), 'qty');
    assert.strictEqual(_sc.SC.classifyCountMode(null), 'qty');
  });
});

describe('SubmitStockCount — command đầy đủ', function () {
  test('dòng countMode unit — tạo phiếu PENDING với unitId + countedQty', function () {
    var out = assertOk(run({
      countRef: 'KK001',
      lines: [{ itemId: _sc.SUA, unitId: _sc.ids.deterministicId('unit', ['sc', 'a1']),
        countedQty: 480, item: { trackingMode: 'unit' } }]
    }));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.type, 'stockCount');
    assert.strictEqual(rec.record.status, 'PENDING');
    assert.strictEqual(rec.record.countRef, 'KK001');
    var line = rec.record.lines[0];
    assert.strictEqual(line.countMode, 'unit');
    assert.strictEqual(line.unitId, _sc.ids.deterministicId('unit', ['sc', 'a1']));
    assert.strictEqual(line.countedQty, 480);
    assert.strictEqual(line.applied, false);
  });

  test('dòng countMode qty — delta tính sẵn (countedQty - expectedQty), không có unitId', function () {
    var out = assertOk(run({
      countRef: 'KK002',
      lines: [{ itemId: _sc.TUONG, countedQty: 18, expectedQty: 20, item: { trackingMode: 'batch' } }]
    }));
    var line = out.plan.domainRecords[0].record.lines[0];
    assert.strictEqual(line.countMode, 'qty');
    assert.strictEqual(line.unitId, null);
    assert.strictEqual(line.delta, -2);
    assert.strictEqual(line.applied, false);
  });

  test('phiếu nhiều dòng trộn cả unit lẫn qty', function () {
    var out = assertOk(run({
      countRef: 'KK003',
      lines: [
        { itemId: _sc.SUA, unitId: _sc.ids.deterministicId('unit', ['sc', 'b1']),
          countedQty: 100, item: { trackingMode: 'unit' } },
        { itemId: _sc.TUONG, countedQty: 5, expectedQty: 5, item: { trackingMode: 'none' } }
      ]
    }));
    assert.strictEqual(out.plan.domainRecords[0].record.lines.length, 2);
  });

  test('gửi lặp lại (retry cùng countRef) là no-op — fix Bug #13 (double-tap sinh 2 phiếu)', function () {
    var store = _sc.PIPE.createInMemoryOperationStore();
    var ctx = scCtx();
    var input = {
      countRef: 'KK004',
      lines: [{ itemId: _sc.TUONG, countedQty: 10, expectedQty: 10, item: { trackingMode: 'batch' } }]
    };
    assertOk(run(input, ctx, store));
    assert.strictEqual(assertOk(run(input, ctx, store)).replayed, true);
  });

  test('thiếu countRef thì từ chối', function () {
    assertErr(run({
      lines: [{ itemId: _sc.SUA, countedQty: 1, expectedQty: 1, item: { trackingMode: 'batch' } }]
    }), 'VALIDATION');
  });

  test('không có dòng nào thì từ chối', function () {
    assertErr(run({ countRef: 'KK005', lines: [] }), 'VALIDATION');
  });

  test('dòng thiếu item (denormalized input) thì từ chối — không tự tra catalog', function () {
    assertErr(run({
      countRef: 'KK006', lines: [{ itemId: _sc.SUA, countedQty: 1, expectedQty: 1 }]
    }), 'VALIDATION');
  });

  test('countMode unit mà thiếu unitId thì từ chối — đóng đúng AMBIGUOUS của SC1', function () {
    assertErr(run({
      countRef: 'KK007',
      lines: [{ itemId: _sc.SUA, countedQty: 1, item: { trackingMode: 'unit' } }]
    }), 'VALIDATION');
  });

  test('countMode qty mà lại gắn unitId thì từ chối — không được trộn 2 kiểu đếm', function () {
    assertErr(run({
      countRef: 'KK008',
      lines: [{ itemId: _sc.SUA, unitId: _sc.ids.deterministicId('unit', ['sc', 'c1']),
        countedQty: 1, expectedQty: 1, item: { trackingMode: 'batch' } }]
    }), 'VALIDATION');
  });

  test('countMode qty thiếu expectedQty thì từ chối — không tính được delta', function () {
    assertErr(run({
      countRef: 'KK009',
      lines: [{ itemId: _sc.SUA, countedQty: 1, item: { trackingMode: 'none' } }]
    }), 'VALIDATION');
  });
});

describe('SubmitStockCount → ApproveStockCount — khớp hình dạng end-to-end', function () {
  test('phiếu unit-mode duyệt được thẳng, không cần dịch lại shape', function () {
    var u = mkUnit(500, 'e1');
    var submitted = assertOk(run({
      countRef: 'KK010',
      lines: [{ itemId: _sc.SUA, unitId: u.unitId, countedQty: 480, item: { trackingMode: 'unit' } }]
    })).plan.domainRecords[0].record;

    var approved = assertOk(runApprove({
      stockCountId: submitted.stockCountId, reason: 'kiểm kê định kỳ',
      stockCount: submitted, units: [u]
    }));
    var rec = approved.plan.domainRecords[0].record;
    assert.strictEqual(rec.status, 'APPROVED');
    assert.strictEqual(rec.appliedItemIds.length, 1);
    assert.strictEqual(approved.plan.unitChanges[0].remainingQty, 480);
  });

  test('phiếu qty-mode duyệt được thẳng — ledger ADJUSTMENT dùng đúng delta đã tính sẵn', function () {
    var submitted = assertOk(run({
      countRef: 'KK011',
      lines: [{ itemId: _sc.TUONG, countedQty: 45, expectedQty: 50, item: { trackingMode: 'batch' } }]
    })).plan.domainRecords[0].record;

    var approved = assertOk(runApprove({
      stockCountId: submitted.stockCountId, reason: 'kiểm kê định kỳ',
      stockCount: submitted, units: []
    }));
    assert.strictEqual(approved.plan.ledgerEntries[0].qtyDelta, -5);
    assert.strictEqual(approved.plan.domainRecords[0].record.status, 'APPROVED');
  });
});
