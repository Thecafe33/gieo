/**
 * RM1 — Nhận hàng (`commands/receiving.js`).
 * Nguồn đối chiếu: `createContainersForReceipt` (`posgieo.html:5460-5543`).
 * Chuỗi thật: `NET-RAW-MATERIAL-V1.md` RM1.
 */

var _r = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    PIPE: GIEO.require('commands/pipeline'),
    RCV: GIEO.require('commands/receiving'),
    U: GIEO.require('fifo-core/unit'),
    VI: GIEO.require('compaction/versioned-input'),
    CST: GIEO.require('recipe-cost-btp/cost'),
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

function run(input, ctx, store) {
  return _r.PIPE.run(_r.RCV.ReceiveGoods, input, ctx || rCtx(), {
    operationStore: store || _r.PIPE.createInMemoryOperationStore()
  });
}

function runCorrect(input, ctx, store) {
  return _r.PIPE.run(_r.RCV.CorrectReceivingCost, input, ctx || rCtx('QUANLY_ADMIN', 'QUANLY'), {
    operationStore: store || _r.PIPE.createInMemoryOperationStore()
  });
}

function mkReceivedUnit(unitCost, qty, tag) {
  return assertOk(_r.U.createUnit({
    unitId: _r.ids.deterministicId('unit', ['recv', tag || 'x1']),
    itemId: _r.SUA, storeId: _r.STORE, itemKind: 'raw', initialQty: qty,
    costBasis: { unitCost: unitCost, versionId: null, source: 'RECEIVING' },
    operationId: 'operation_recv_' + (tag || 'x1')
  }));
}

function reg() {
  var r = _r.VI.createRegistry();
  assertOk(_r.CST.publishCostBasis(r, {
    itemId: _r.SUA, storeId: _r.STORE, effectiveFrom: new Date(2026, 0, 1).getTime(),
    publishedBy: _r.BOSS, unitCost: 30
  }));
  return r;
}

describe('classifyTrackingMode / splitReceivingLine — phân loại tường minh (fix gap AMBIGUOUS)', function () {
  var RCV = _r.RCV;

  test('trackingMode ngoài unit/batch luôn rơi về "none" — không suy luận từ field unit', function () {
    assert.strictEqual(RCV.classifyTrackingMode({ trackingMode: 'unit' }), 'unit');
    assert.strictEqual(RCV.classifyTrackingMode({ trackingMode: 'batch' }), 'batch');
    assert.strictEqual(RCV.classifyTrackingMode({ trackingMode: 'weird' }), 'none');
    assert.strictEqual(RCV.classifyTrackingMode({}), 'none');
    assert.strictEqual(RCV.classifyTrackingMode(null), 'none');
  });

  test('mode "none" — legacy trả [] (0 container); ở đây LUÔN 1 Unit, không gap (cải thiện thật)', function () {
    var out = RCV.splitReceivingLine({ trackingMode: 'none' }, 500);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].qty, 500);
    assert.strictEqual(out[0].gap, false);
  });

  test('mode "batch" — luôn đúng 1 Unit cho cả qtyBase, như legacy', function () {
    var out = RCV.splitReceivingLine({ trackingMode: 'batch' }, 1234);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].qty, 1234);
    assert.strictEqual(out[0].gap, false);
  });

  test('mode "unit", đơn vị pha chế "cái" — mỗi cái 1 Unit, không cần packagingUnits (đúng [FIX] của legacy)', function () {
    var out = RCV.splitReceivingLine({ trackingMode: 'unit', unit: 'cái' }, 5);
    assert.strictEqual(out.length, 5);
    out.forEach(function (u) { assert.strictEqual(u.qty, 1); assert.strictEqual(u.gap, false); });
  });

  test('mode "unit" chia hết theo quy cách đóng gói — không gap', function () {
    var item = {
      trackingMode: 'unit', unit: 'ml', countUnitName: 'Chai',
      packagingUnits: [{ name: 'Chai', baseQty: 500 }]
    };
    var out = RCV.splitReceivingLine(item, 2000);
    assert.strictEqual(out.length, 4);
    out.forEach(function (u) { assert.strictEqual(u.qty, 500); assert.strictEqual(u.gap, false); });
  });

  test('mode "unit" có phần dư — legacy ÂM THẦM BỎ phần dư, ở đây vẫn vào kho qua Unit gap', function () {
    var item = {
      trackingMode: 'unit', unit: 'ml', countUnitName: 'Chai',
      packagingUnits: [{ name: 'Chai', baseQty: 500 }]
    };
    var out = RCV.splitReceivingLine(item, 2300);
    assert.strictEqual(out.length, 5);
    assert.strictEqual(out[3].qty, 500);
    assert.strictEqual(out[3].gap, false);
    assert.strictEqual(out[4].qty, 300);
    assert.strictEqual(out[4].gap, true);
    var total = out.reduce(function (s, u) { return s + u.qty; }, 0);
    assert.strictEqual(total, 2300, 'không được mất dữ liệu (§2.3a)');
  });

  test('mode "unit" thiếu quy cách đóng gói — legacy trả [] (bỏ cả dòng), ở đây gộp 1 Unit + gap', function () {
    var item = { trackingMode: 'unit', unit: 'ml', countUnitName: 'Chai', packagingUnits: [] };
    var out = RCV.splitReceivingLine(item, 2000);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].qty, 2000, 'không được mất cả dòng nhận hàng (§2.3a)');
    assert.strictEqual(out[0].gap, true);
    assert.ok(/quy cách đóng gói/.test(out[0].gapReason));
  });
});

describe('ReceiveGoods — command đầy đủ', function () {
  test('nhận 1 dòng batch — tạo đúng 1 Unit sealed, costBasis từ giá đã trả trên phiếu', function () {
    var out = assertOk(run({
      receiptRef: 'PN001',
      lines: [{ itemId: _r.SUA, qtyBase: 5000, paidUnitCost: 32, item: { trackingMode: 'batch' } }]
    }));
    assert.strictEqual(out.plan.unitChanges.length, 1);
    var u = out.plan.unitChanges[0];
    assert.strictEqual(u.initialQty, 5000);
    assert.strictEqual(u.status, 'SEALED');
    assert.strictEqual(u.costBasis.unitCost, 32);
    assert.strictEqual(u.costBasis.source, 'RECEIVING');

    assert.strictEqual(out.plan.ledgerEntries.length, 1);
    assert.strictEqual(out.plan.ledgerEntries[0].type, 'RECEIVING');
    assert.strictEqual(out.plan.ledgerEntries[0].qtyDelta, 5000);

    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.type, 'receivingRecord');
    assert.strictEqual(rec.record.receiptRef, 'PN001');
    assert.strictEqual(rec.record.gap, false);
  });

  test('không có paidUnitCost — rơi về CostBasis theo thời điểm (registry)', function () {
    var out = assertOk(run({
      receiptRef: 'PN002', deps: { versionRegistry: reg() },
      lines: [{ itemId: _r.SUA, qtyBase: 1000, item: { trackingMode: 'batch' } }]
    }));
    assert.strictEqual(out.plan.unitChanges[0].costBasis.unitCost, 30);
    assert.strictEqual(out.plan.unitChanges[0].costBasis.source, 'COST_BASIS');
  });

  test('không có paidUnitCost và cũng không có giá vốn nào — PRECONDITION, không bịa giá', function () {
    var r = run({
      receiptRef: 'PN003', deps: { versionRegistry: _r.VI.createRegistry() },
      lines: [{ itemId: _r.SUA, qtyBase: 1000, item: { trackingMode: 'batch' } }]
    });
    assertErr(r, 'PRECONDITION');
  });

  test('nhận hàng tách nhiều lô (trackingMode unit + quy cách) — nhiều Unit, mỗi Unit unitId xác định', function () {
    var item = {
      trackingMode: 'unit', unit: 'chai', countUnitName: 'Thùng',
      packagingUnits: [{ name: 'Thùng', baseQty: 24 }]
    };
    var out = assertOk(run({
      receiptRef: 'PN004',
      lines: [{ itemId: _r.TUONG, qtyBase: 48, paidUnitCost: 15000, item: item }]
    }));
    assert.strictEqual(out.plan.unitChanges.length, 2);
    out.plan.unitChanges.forEach(function (u) { assert.strictEqual(u.initialQty, 24); });
    var ids2 = out.plan.unitChanges.map(function (u) { return u.unitId; });
    assert.notStrictEqual(ids2[0], ids2[1]);
  });

  test('dòng gap vẫn vào kho, ghi rõ trong receivingRecord.gaps — không chặn nhận hàng (§2.3a)', function () {
    var item = { trackingMode: 'unit', unit: 'ml', countUnitName: 'Chai', packagingUnits: [] };
    var out = assertOk(run({
      receiptRef: 'PN005',
      lines: [{ itemId: _r.SUA, qtyBase: 2000, paidUnitCost: 20, item: item }]
    }));
    assert.strictEqual(out.plan.unitChanges.length, 1);
    assert.strictEqual(out.plan.unitChanges[0].initialQty, 2000, 'hàng vẫn vào kho đủ số lượng');
    var rec = out.plan.domainRecords[0].record;
    assert.strictEqual(rec.gap, true);
    assert.strictEqual(rec.gaps.length, 1);
    assert.strictEqual(rec.gaps[0].itemId, _r.SUA);
  });

  test('nhận hàng lặp lại (retry cùng receiptRef) là no-op — fix bug "cộng kho 2 lần"', function () {
    var store = _r.PIPE.createInMemoryOperationStore();
    var ctx = rCtx();
    var input = {
      receiptRef: 'PN006',
      lines: [{ itemId: _r.SUA, qtyBase: 1000, paidUnitCost: 25, item: { trackingMode: 'batch' } }]
    };
    assertOk(run(input, ctx, store));
    assert.strictEqual(assertOk(run(input, ctx, store)).replayed, true);
  });

  test('thiếu receiptRef thì từ chối — không có id xác định để chống retry-đúp', function () {
    assertErr(run({
      lines: [{ itemId: _r.SUA, qtyBase: 100, paidUnitCost: 10, item: { trackingMode: 'batch' } }]
    }), 'VALIDATION');
  });

  test('thiếu item (denormalized input) thì từ chối — không tự tra catalog trong command', function () {
    assertErr(run({
      receiptRef: 'PN007',
      lines: [{ itemId: _r.SUA, qtyBase: 100, paidUnitCost: 10 }]
    }), 'VALIDATION');
  });

  test('nhiều dòng khác itemId trong cùng 1 phiếu — mỗi dòng có ledger + Unit riêng', function () {
    var out = assertOk(run({
      receiptRef: 'PN008',
      lines: [
        { itemId: _r.SUA, qtyBase: 1000, paidUnitCost: 30, item: { trackingMode: 'batch' } },
        { itemId: _r.TUONG, qtyBase: 500, paidUnitCost: 40, item: { trackingMode: 'batch' } }
      ]
    }));
    assert.strictEqual(out.plan.unitChanges.length, 2);
    assert.strictEqual(out.plan.ledgerEntries.length, 2);
    assert.strictEqual(out.plan.domainRecords[0].record.lines.length, 2);
  });
});

describe('CorrectReceivingCost — RM3, sửa giá nhập sai (legacy KHÔNG có nhánh này)', function () {
  test('sửa giá — costBasis mới, audit append-only giữ giá cũ', function () {
    var u = mkReceivedUnit(30, 1000, 'c1');
    var out = assertOk(runCorrect({
      unitId: u.unitId, correctRef: 'FIX1', unitCost: 35, reason: 'nhập nhầm giá',
      units: [u]
    }));
    var revised = out.plan.unitChanges[0];
    assert.strictEqual(revised.costBasis.unitCost, 35);
    assert.strictEqual(revised.costBasis.source, 'CORRECTION');
    assert.strictEqual(revised.costBasisRevisions.length, 1);
    assert.strictEqual(revised.costBasisRevisions[0].before.unitCost, 30);
    assert.strictEqual(revised.costBasisRevisions[0].after.unitCost, 35);
    assert.strictEqual(revised.costBasisRevisions[0].reason, 'nhập nhầm giá');
  });

  test('không đổi remainingQty/initialQty — chỉ giá, không phải lượng (đó là việc của AdjustInventory)', function () {
    var u = mkReceivedUnit(30, 1000, 'c2');
    var out = assertOk(runCorrect({
      unitId: u.unitId, correctRef: 'FIX2', unitCost: 40, reason: 'x', units: [u]
    }));
    var revised = out.plan.unitChanges[0];
    assert.strictEqual(revised.initialQty, 1000);
    assert.strictEqual(revised.remainingQty, 1000);
  });

  test('sửa lặp lại là no-op', function () {
    var store = _r.PIPE.createInMemoryOperationStore();
    var ctx = rCtx('QUANLY_ADMIN', 'QUANLY');
    var u = mkReceivedUnit(30, 1000, 'c3');
    var input = { unitId: u.unitId, correctRef: 'FIX3', unitCost: 33, reason: 'x', units: [u] };
    assertOk(runCorrect(input, ctx, store));
    assert.strictEqual(assertOk(runCorrect(input, ctx, store)).replayed, true);
  });

  test('không tìm thấy unit thì NOT_FOUND', function () {
    assertErr(runCorrect({
      unitId: _r.ids.deterministicId('unit', ['ghost']), correctRef: 'FIX4', unitCost: 10, reason: 'x', units: []
    }), 'NOT_FOUND');
  });

  test('thiếu correctRef thì từ chối — cần id xác định để chống sửa đúp', function () {
    var u = mkReceivedUnit(30, 1000, 'c5');
    assertErr(runCorrect({ unitId: u.unitId, unitCost: 10, reason: 'x', units: [u] }), 'VALIDATION');
  });

  test('unitCost âm thì từ chối', function () {
    var u = mkReceivedUnit(30, 1000, 'c6');
    assertErr(runCorrect({
      unitId: u.unitId, correctRef: 'FIX6', unitCost: -5, reason: 'x', units: [u]
    }), 'VALIDATION');
  });
});
