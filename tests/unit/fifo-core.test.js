/**
 * [2] FIFO Core — xương sống.
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md §1-§10b. Gate: §12.
 */

var _f = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    U: GIEO.require('fifo-core/unit'),
    L: GIEO.require('fifo-core/ledger'),
    P: GIEO.require('fifo-core/projection'),
    A: GIEO.require('fifo-core/allocation'),
    RC: GIEO.require('fifo-core/reconciliation'),
    STORE: ids.deterministicId('store', ['main']),
    SUA: ids.deterministicId('item', ['sua']),
    CAFE: ids.deterministicId('item', ['cafe']),
    NV: ids.deterministicId('actor', ['nv01'])
  };
})();

function mkUnit(over) {
  var spec = Object.assign({
    itemId: _f.SUA, storeId: _f.STORE, itemKind: 'raw', initialQty: 1000,
    costBasis: { unitCost: 30, versionId: 'version_c1' },
    operationId: _f.ids.deterministicId('operation', ['recv', String(Math.random())])
  }, over || {});
  return assertOk(_f.U.createUnit(spec));
}

function opened(unit, at) {
  return assertOk(_f.U.open(unit, {
    at: at, actorId: _f.NV, operationId: _f.ids.deterministicId('operation', ['open', unit.unitId])
  }));
}

describe('fifo-core/unit', function () {
  var U = _f.U;

  test('Unit BẮT BUỘC có costBasis — thiếu thì cogsActual không thể tồn tại (§10b.1)', function () {
    assertErr(U.createUnit({
      itemId: _f.SUA, storeId: _f.STORE, itemKind: 'raw', initialQty: 1000,
      operationId: 'operation_x'
    }), 'VALIDATION');
  });

  test('Unit bắt buộc có operationId (invariant #7)', function () {
    assertErr(U.createUnit({
      itemId: _f.SUA, storeId: _f.STORE, itemKind: 'raw', initialQty: 1000,
      costBasis: { unitCost: 30 }
    }), 'VALIDATION');
  });

  test('initialQty tách khỏi remainingQty, khởi tạo bằng nhau', function () {
    var u = mkUnit();
    assert.strictEqual(u.initialQty, 1000);
    assert.strictEqual(u.remainingQty, 1000);
  });

  test('itemKind gộp raw và prep vào 1 model (legacy dùng 2 collection riêng)', function () {
    assert.strictEqual(mkUnit({ itemKind: 'prep' }).itemKind, 'prep');
    assertErr(U.createUnit({
      itemId: _f.SUA, storeId: _f.STORE, itemKind: 'khac', initialQty: 1,
      costBasis: { unitCost: 1 }, operationId: 'operation_x'
    }), 'VALIDATION');
  });

  describe('lifecycle', function () {
    test('SEALED -> OPEN -> CONSUMING -> PHYSICALLY_FINISHED', function () {
      var u = mkUnit();
      assert.strictEqual(u.status, 'SEALED');
      u = opened(u, 1000);
      assert.strictEqual(u.status, 'OPEN');
      u = assertOk(U.markConsuming(u));
      assert.strictEqual(u.status, 'CONSUMING');
      var f = assertOk(U.finish(u, { at: 2000, actorId: _f.NV, operationId: 'operation_f' }));
      assert.strictEqual(f.unit.status, 'PHYSICALLY_FINISHED');
    });

    test('không mở lại Unit đã báo hết', function () {
      var u = assertOk(U.finish(opened(mkUnit(), 1000), {
        at: 2000, actorId: _f.NV, operationId: 'operation_f'
      })).unit;
      assertErr(U.open(u, { at: 3000, actorId: _f.NV, operationId: 'operation_o2' }), 'PRECONDITION');
    });

    test('SYSTEM_EXHAUSTED chỉ ghi field, KHÔNG đổi status (§3.6)', function () {
      var u = opened(mkUnit(), 1000);
      u = Object.assign({}, u, { remainingQty: 0 });
      var next = assertOk(U.markSystemExhausted(u, 5000));
      assert.strictEqual(next.systemExhaustedAt, 5000);
      assert.strictEqual(next.status, 'OPEN', 'status bị đổi — sai nguyên tắc "suy diễn, không phải hành động"');
      assert.strictEqual(U.effectiveState(next), 'SYSTEM_EXHAUSTED');
    });

    test('systemExhaustedAt ghi 1 lần, không bị đè mỗi lần quét', function () {
      var u = Object.assign({}, opened(mkUnit(), 1000), { remainingQty: 0 });
      var a = assertOk(U.markSystemExhausted(u, 5000));
      var b = assertOk(U.markSystemExhausted(a, 9000));
      assert.strictEqual(b.systemExhaustedAt, 5000);
    });

    test('báo hết KHÔNG cần systemExhaustedAt — nhân viên báo lúc nào cũng được (§2)', function () {
      var u = opened(mkUnit(), 1000);
      assert.strictEqual(u.systemExhaustedAt, null);
      assertOk(U.finish(u, { at: 2000, actorId: _f.NV, operationId: 'operation_f' }));
    });
  });

  describe('finish — waste và nợ là 2 chuyện khác nhau', function () {
    test('còn dư thì thành waste', function () {
      var u = Object.assign({}, opened(mkUnit(), 1000), { remainingQty: 150 });
      var f = assertOk(U.finish(u, { at: 2000, actorId: _f.NV, operationId: 'operation_f' }));
      assert.strictEqual(f.wasteQty, 150);
      assert.strictEqual(f.debtQty, 0);
      assert.strictEqual(f.unit.remainingQty, 0);
    });

    test('số âm là NỢ, KHÔNG phải hao hụt — không tạo waste', function () {
      var u = Object.assign({}, opened(mkUnit(), 1000), { remainingQty: -80 });
      var f = assertOk(U.finish(u, { at: 2000, actorId: _f.NV, operationId: 'operation_f' }));
      assert.strictEqual(f.wasteQty, 0, 'nợ bị tính nhầm thành hao hụt');
      assert.strictEqual(f.debtQty, 80);
      assert.strictEqual(f.flaggedForReview, true);
    });

    test('FINISH_REVIEW: báo hết khi còn nhiều thì gắn cờ, ngưỡng do QUANLY cấu hình', function () {
      var u = Object.assign({}, opened(mkUnit(), 1000), { remainingQty: 300 });
      var f = assertOk(U.finish(u, {
        at: 2000, actorId: _f.NV, operationId: 'operation_f', finishReviewRatio: 0.25
      }));
      assert.strictEqual(f.flaggedForReview, true);
      assert.ok(f.unit.needsReviewReasons.indexOf('FINISHED_WITH_REMAINDER') !== -1);
    });

    test('dưới ngưỡng thì không gắn cờ', function () {
      var u = Object.assign({}, opened(mkUnit(), 1000), { remainingQty: 100 });
      var f = assertOk(U.finish(u, {
        at: 2000, actorId: _f.NV, operationId: 'operation_f', finishReviewRatio: 0.25
      }));
      assert.strictEqual(f.flaggedForReview, false);
    });

    test('không truyền ngưỡng thì KHÔNG tự bịa mặc định', function () {
      var u = Object.assign({}, opened(mkUnit(), 1000), { remainingQty: 900 });
      var f = assertOk(U.finish(u, { at: 2000, actorId: _f.NV, operationId: 'operation_f' }));
      assert.strictEqual(f.flaggedForReview, false, 'fifo-core tự quyết ngưỡng thay vì nhận từ config');
    });
  });

  describe('debt là field tường minh, không phải số âm ẩn (§4)', function () {
    test('tra được Unit nào đang nợ mà không cần kiểm tra dấu', function () {
      var u = assertOk(_f.U.recordDebt(opened(mkUnit(), 1000), {
        amount: 50, at: 2000, operationId: 'operation_d'
      }));
      assert.strictEqual(u.debt.amount, 50, 'nợ phải ghi bằng số dương');
      assert.strictEqual(_f.U.effectiveState(u), 'DEBT');
    });

    test('nợ ghi bằng số âm bị từ chối', function () {
      assertErr(_f.U.recordDebt(opened(mkUnit(), 1000), {
        amount: -50, at: 2000, operationId: 'operation_d'
      }), 'VALIDATION');
    });

    test('Unit còn nợ chưa hấp thụ thì KHÔNG được compact', function () {
      var u = assertOk(_f.U.recordDebt(opened(mkUnit(), 1000), {
        amount: 50, at: 2000, operationId: 'operation_d'
      }));
      var f = assertOk(U.finish(u, { at: 3000, actorId: _f.NV, operationId: 'operation_f' }));
      var blockers = U.compactBlockers(f.unit);
      assert.ok(blockers.some(function (b) { return /còn nợ/.test(b); }));
    });
  });

  describe('lost / found (§8)', function () {
    test('mất rồi tìm lại thì về đúng trạng thái trước khi mất', function () {
      var u = assertOk(U.markConsuming(opened(mkUnit(), 1000)));
      var lost = assertOk(U.markLost(u, { at: 2000, actorId: _f.NV, operationId: 'operation_l' }));
      assert.strictEqual(lost.status, 'LOST');
      var found = assertOk(U.restoreFound(lost, { at: 3000, actorId: _f.NV, operationId: 'operation_fd' }));
      assert.strictEqual(found.status, 'CONSUMING');
    });

    test('khôi phục xong gắn cờ cần rà — quãng biến mất là quãng không ai biết', function () {
      var lost = assertOk(U.markLost(opened(mkUnit(), 1000), {
        at: 2000, actorId: _f.NV, operationId: 'operation_l'
      }));
      var found = assertOk(U.restoreFound(lost, { at: 3000, actorId: _f.NV, operationId: 'operation_fd' }));
      assert.strictEqual(found.needsReview, true);
      assert.ok(found.needsReviewReasons.indexOf('RESTORED_FROM_LOST') !== -1);
    });

    test('Unit không mất thì không khôi phục được', function () {
      assertErr(U.restoreFound(opened(mkUnit(), 1000), {
        at: 3000, actorId: _f.NV, operationId: 'operation_fd'
      }), 'PRECONDITION');
    });
  });
});

describe('fifo-core/ledger — untrackedPendingDelta (§5, root cause #1/#11/#14/#17/#18)', function () {
  var L = _f.L;

  function entry(over) {
    return L.createEntry(Object.assign({
      operationId: 'operation_x', domain: 'raw', type: 'CONSUMPTION',
      itemId: _f.SUA, storeId: _f.STORE, qtyDelta: -100,
      businessDate: '2026-03-10', actorId: _f.NV
    }, over || {}));
  }

  test('truyền tay untrackedPendingDelta bị TỪ CHỐI — nó không phải tham số', function () {
    var r = entry({ untrackedPendingDelta: 0 });
    assertErr(r, 'VALIDATION');
    assert.ok(/KHÔNG phải tham số/.test(r.error.message));
  });

  test('có unitId thì untrackedPendingDelta = 0', function () {
    var e = assertOk(entry({ unitId: _f.ids.deterministicId('unit', ['u1']) }));
    assert.strictEqual(e.untrackedPendingDelta, 0);
  });

  test('không có unitId thì = qtyDelta', function () {
    assert.strictEqual(assertOk(entry()).untrackedPendingDelta, -100);
  });

  test('RECEIVING cũng theo đúng quy tắc — đây CHÍNH LÀ bug #11', function () {
    var e = assertOk(entry({ type: 'RECEIVING', qtyDelta: 500 }));
    assert.strictEqual(e.untrackedPendingDelta, 500,
      'RECEIVING bị loại trừ khỏi quy tắc — đúng lỗi legacy đang phải sửa');
  });

  test('ADJUSTMENT cũng vậy — không có danh sách type ngoại lệ nào', function () {
    assert.strictEqual(assertOk(entry({ type: 'ADJUSTMENT', qtyDelta: -7 })).untrackedPendingDelta, -7);
  });

  test('MỌI type đều theo cùng 1 quy tắc — type mới trong tương lai không thể quên', function () {
    Object.keys(L.TYPE).forEach(function (t) {
      var e = assertOk(entry({ type: t, qtyDelta: 42 }));
      assert.strictEqual(e.untrackedPendingDelta, 42, 'type ' + t + ' lệch quy tắc');
      var withUnit = assertOk(entry({ type: t, qtyDelta: 42, unitId: _f.ids.deterministicId('unit', ['u1']) }));
      assert.strictEqual(withUnit.untrackedPendingDelta, 0, 'type ' + t + ' lệch quy tắc khi có unitId');
    });
  });

  test('entryId xác định — ghi lại cùng operation không tạo entry trùng', function () {
    var a = assertOk(entry());
    var b = assertOk(entry());
    assert.strictEqual(a.entryId, b.entryId);
  });

  test('ledger entry bắt buộc có operationId, actorId, businessDate', function () {
    assertErr(entry({ operationId: undefined }), 'VALIDATION');
    assertErr(entry({ actorId: undefined }), 'VALIDATION');
    assertErr(entry({ businessDate: undefined }), 'VALIDATION');
  });

  describe('receiving giữ 2 vế, tự đối xứng (§6)', function () {
    test('có hàng hỏng thì sinh RECEIVING(+tất cả) và WASTE(-hỏng)', function () {
      var es = assertOk(L.createReceivingEntries({
        operationId: 'operation_r', domain: 'raw', itemId: _f.SUA, storeId: _f.STORE,
        businessDate: '2026-03-10', actorId: _f.NV, goodQty: 90, damagedQty: 10,
        receiptId: 'receipt_1'
      }));
      assert.strictEqual(es.length, 2);
      assert.strictEqual(es[0].qtyDelta, 100);
      assert.strictEqual(es[1].qtyDelta, -10);
    });

    test('2 vế đối xứng về untrackedPendingDelta — bug #11 biến mất', function () {
      var es = assertOk(L.createReceivingEntries({
        operationId: 'operation_r', domain: 'raw', itemId: _f.SUA, storeId: _f.STORE,
        businessDate: '2026-03-10', actorId: _f.NV, goodQty: 90, damagedQty: 10,
        receiptId: 'receipt_1'
      }));
      assert.strictEqual(L.sumUntrackedPendingDelta(es), 90,
        'tổng phải bằng lượng thực nhận; lệch nghĩa là 1 vế bị bỏ qua quy tắc');
    });

    test('không có hàng hỏng thì chỉ 1 vế', function () {
      var es = assertOk(L.createReceivingEntries({
        operationId: 'operation_r', domain: 'raw', itemId: _f.SUA, storeId: _f.STORE,
        businessDate: '2026-03-10', actorId: _f.NV, goodQty: 100, damagedQty: 0,
        receiptId: 'receipt_1'
      }));
      assert.strictEqual(es.length, 1);
    });
  });

  test('auditEntries bắt được entry lệch quy tắc §5', function () {
    var good = assertOk(entry());
    var tampered = Object.assign({}, good, { untrackedPendingDelta: 0 });
    assertErr(_f.L.auditEntries([tampered]), 'VALIDATION');
    assertOk(_f.L.auditEntries([good]));
  });
});

describe('fifo-core/projection — currentStock là projection, không phải sự thật', function () {
  var P = _f.P;

  test('công thức đủ 4 thành phần', function () {
    var sealed = mkUnit({ initialQty: 500 });
    var open1 = Object.assign({}, opened(mkUnit({ initialQty: 1000 }), 100), { remainingQty: 400 });
    var r = assertOk(P.computeCurrentStock({
      units: [sealed, open1], untrackedBase: 50, untrackedPendingDelta: -20
    }));
    assert.strictEqual(r.currentStock, 50 - 20 + 500 + 400);
    assert.strictEqual(r.breakdown.sealedQty, 500);
    assert.strictEqual(r.breakdown.openQty, 400);
  });

  test('Unit đã báo hết không tính vào tồn', function () {
    var f = assertOk(_f.U.finish(opened(mkUnit(), 100), {
      at: 200, actorId: _f.NV, operationId: 'operation_f'
    })).unit;
    assert.strictEqual(assertOk(P.computeCurrentStock({ units: [f] })).currentStock, 0);
  });

  test('Unit mất không tính vào tồn', function () {
    var lost = assertOk(_f.U.markLost(opened(mkUnit(), 100), {
      at: 200, actorId: _f.NV, operationId: 'operation_l'
    }));
    assert.strictEqual(assertOk(P.computeCurrentStock({ units: [lost] })).currentStock, 0);
  });

  test('pending delta lấy từ ledger thật', function () {
    var e = assertOk(_f.L.createEntry({
      operationId: 'operation_x', domain: 'raw', type: 'ADJUSTMENT', itemId: _f.SUA,
      storeId: _f.STORE, qtyDelta: -33, businessDate: '2026-03-10', actorId: _f.NV
    }));
    var r = assertOk(P.computeCurrentStock({ units: [], untrackedBase: 100, ledgerEntries: [e] }));
    assert.strictEqual(r.currentStock, 67);
  });

  test('so sánh được số vận hành với số đối chiếu — phép so sánh legacy không có (§10b.5)', function () {
    var c = assertOk(P.compareWithObserved(1000, 940, 10));
    assert.strictEqual(c.difference, -60);
    assert.strictEqual(c.needsInvestigation, true);
    assert.strictEqual(assertOk(P.compareWithObserved(1000, 995, 10)).needsInvestigation, false);
  });
});

describe('fifo-core/allocation — engine DUY NHẤT', function () {
  var A = _f.A;
  var OP = 'operation_sale1';

  function ws(units) { return A.createWorkingSet(units); }

  test('cấp phát theo openedAt tăng dần (đã chốt: openedAt, không phải receivedAt)', function () {
    var older = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['b']) }), 100), { remainingQty: 300 });
    var newer = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['a']) }), 900), { remainingQty: 300 });
    var r = assertOk(A.allocateConsumption(ws([newer, older]), { itemId: _f.SUA, qty: 100, operationId: OP }));
    assert.strictEqual(r.allocations[0].unitId, older.unitId, 'không lấy hũ mở trước nhất');
  });

  test('cùng openedAt thì thứ tự tất định theo unitId', function () {
    var u1 = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['zz']) }), 100), { remainingQty: 300 });
    var u2 = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['aa']) }), 100), { remainingQty: 300 });
    var first = A.selectEligibleUnits([u1, u2], _f.SUA)[0].unitId;
    var again = A.selectEligibleUnits([u2, u1], _f.SUA)[0].unitId;
    assert.strictEqual(first, again);
  });

  test('tràn qua nhiều Unit theo min(avail, left)', function () {
    var a = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['a']) }), 100), { remainingQty: 80 });
    var b = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['b']) }), 200), { remainingQty: 500 });
    var r = assertOk(A.allocateConsumption(ws([a, b]), { itemId: _f.SUA, qty: 200, operationId: OP }));
    assert.strictEqual(r.allocations.length, 2);
    assert.strictEqual(r.allocations[0].qty, 80);
    assert.strictEqual(r.allocations[1].qty, 120);
    assert.strictEqual(r.shortfallQty, 0);
  });

  test('mỗi allocation mang giá vốn THẬT của Unit — đây là thứ làm cogsActual tồn tại', function () {
    var re = Object.assign({}, opened(mkUnit({
      unitId: _f.ids.deterministicId('unit', ['a']), costBasis: { unitCost: 30, versionId: 'version_c1' }
    }), 100), { remainingQty: 100 });
    var dat = Object.assign({}, opened(mkUnit({
      unitId: _f.ids.deterministicId('unit', ['b']), costBasis: { unitCost: 50, versionId: 'version_c2' }
    }), 200), { remainingQty: 100 });

    var r = assertOk(A.allocateConsumption(ws([re, dat]), { itemId: _f.SUA, qty: 150, operationId: OP }));
    assert.strictEqual(r.totalCost, 100 * 30 + 50 * 50, 'giá vốn thật phải trộn theo từng hũ');
    assert.strictEqual(r.allocations[0].costBasisVersionId, 'version_c1');
    assert.strictEqual(r.allocations[1].costBasisVersionId, 'version_c2');
    assert.strictEqual(r.costComplete, true);
  });

  test('thiếu hàng thì costComplete=false — không để tầng trên tưởng đã đủ', function () {
    var a = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 50 });
    var r = assertOk(A.allocateConsumption(ws([a]), { itemId: _f.SUA, qty: 200, operationId: OP }));
    assert.strictEqual(r.shortfallQty, 150);
    assert.strictEqual(r.costComplete, false);
  });

  test('Unit của item khác không bị đụng tới', function () {
    var sua = Object.assign({}, opened(mkUnit({ itemId: _f.SUA }), 100), { remainingQty: 500 });
    var cafe = Object.assign({}, opened(mkUnit({ itemId: _f.CAFE }), 50), { remainingQty: 500 });
    var r = assertOk(A.allocateConsumption(ws([cafe, sua]), { itemId: _f.SUA, qty: 100, operationId: OP }));
    assert.strictEqual(r.allocations.length, 1);
    assert.strictEqual(r.allocations[0].unitId, sua.unitId);
  });

  test('Unit SEALED chưa mở thì không được cấp phát', function () {
    var r = assertOk(A.allocateConsumption(ws([mkUnit()]), { itemId: _f.SUA, qty: 10, operationId: OP }));
    assert.strictEqual(r.allocatedQty, 0);
    assert.strictEqual(r.shortfallQty, 10);
  });

  test('OPEN chuyển sang CONSUMING khi có allocation đầu tiên', function () {
    var u = opened(mkUnit(), 100);
    var set = ws([u]);
    assertOk(A.allocateConsumption(set, { itemId: _f.SUA, qty: 10, operationId: OP }));
    assert.strictEqual(set.get(u.unitId).status, 'CONSUMING');
  });

  describe('WorkingSet giữ trạng thái trong suốt 1 operation', function () {
    test('requirement thứ 2 thấy số dư đã bị requirement thứ 1 trừ', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 100 });
      var set = ws([u]);
      var r1 = assertOk(A.allocateConsumption(set, { itemId: _f.SUA, qty: 60, operationId: OP }));
      var r2 = assertOk(A.allocateConsumption(set, { itemId: _f.SUA, qty: 60, operationId: OP }));
      assert.strictEqual(r1.shortfallQty, 0);
      assert.strictEqual(r2.allocatedQty, 40, 'requirement 2 đọc số cũ');
      assert.strictEqual(r2.shortfallQty, 20);
    });

    test('allocateMany: 1 bill nhiều món cùng nguyên liệu', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 100 });
      var r = assertOk(A.allocateMany(ws([u]), [
        { itemId: _f.SUA, qty: 30, ref: 'line1' },
        { itemId: _f.SUA, qty: 30, ref: 'line2' },
        { itemId: _f.SUA, qty: 30, ref: 'line3' }
      ], { operationId: OP }));
      assert.strictEqual(r.shortfalls.length, 0);
      assert.strictEqual(r.totalCost, 90 * 30);
    });

    test('allocateMany báo đúng requirement nào thiếu', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 50 });
      var r = assertOk(A.allocateMany(ws([u]), [
        { itemId: _f.SUA, qty: 30, ref: 'line1' },
        { itemId: _f.SUA, qty: 30, ref: 'line2' }
      ], { operationId: OP }));
      assert.strictEqual(r.shortfalls.length, 1);
      assert.strictEqual(r.shortfalls[0].requirementRef, 'line2');
      assert.strictEqual(r.costComplete, false);
    });

    test('WorkingSet không sửa Unit gốc', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 100 });
      var set = ws([u]);
      assertOk(A.allocateConsumption(set, { itemId: _f.SUA, qty: 60, operationId: OP }));
      assert.strictEqual(u.remainingQty, 100, 'Unit gốc bị sửa tại chỗ');
    });
  });

  describe('nợ và hấp thụ nợ (§3.4)', function () {
    test('thiếu hàng thì ghi nợ tường minh trên Unit cuối', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 50 });
      var set = ws([u]);
      var plan = assertOk(A.allocateConsumption(set, { itemId: _f.SUA, qty: 130, operationId: OP }));
      var out = assertOk(A.handleShortfall(set, plan, { at: 5000, operationId: OP }));
      assert.strictEqual(out.debtUnit.debt.amount, 80);
      assert.strictEqual(out.debtUnit.remainingQty, -80, 'giữ số âm cho tương thích công thức');
    });

    test('không có Unit nào mở để gánh nợ thì báo lỗi, không ghi nợ vào hư không', function () {
      var set = ws([]);
      var plan = assertOk(A.allocateConsumption(set, { itemId: _f.SUA, qty: 100, operationId: OP }));
      assertErr(A.handleShortfall(set, plan, { at: 5000, operationId: OP }), 'PRECONDITION');
    });

    test('mở hũ mới hấp thụ nợ: newRemaining = capacity - totalDebt', function () {
      var debtor = assertOk(_f.U.recordDebt(
        Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['old']) }), 100), { remainingQty: -80 }),
        { amount: 80, at: 4000, operationId: OP }
      ));
      var fresh = mkUnit({ unitId: _f.ids.deterministicId('unit', ['new']), initialQty: 1000 });
      var set = ws([debtor, fresh]);

      var out = assertOk(A.openUnitAbsorbingDebt(set, {
        unit: fresh, at: 5000, actorId: _f.NV, operationId: 'operation_open_new'
      }));
      assert.strictEqual(out.absorbedDebtTotal, 80);
      assert.strictEqual(out.unit.remainingQty, 920);
      assert.strictEqual(out.stillInDebt, false);
      assert.strictEqual(set.get(debtor.unitId).remainingQty, 0, 'hũ cũ phải về 0 sau khi chuyển nợ');
      assert.ok(set.get(debtor.unitId).debt.absorbedByUnitId);
    });

    test('nợ lớn hơn cả hũ mới thì nói ra, không im lặng', function () {
      var debtor = assertOk(_f.U.recordDebt(
        Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['old']) }), 100), { remainingQty: -1500 }),
        { amount: 1500, at: 4000, operationId: OP }
      ));
      var fresh = mkUnit({ unitId: _f.ids.deterministicId('unit', ['new']), initialQty: 1000 });
      var out = assertOk(A.openUnitAbsorbingDebt(ws([debtor, fresh]), {
        unit: fresh, at: 5000, actorId: _f.NV, operationId: 'operation_open_new'
      }));
      assert.strictEqual(out.stillInDebt, true);
      assert.strictEqual(out.unit.remainingQty, -500);
    });

    test('nợ đã hấp thụ không bị hấp thụ lần 2', function () {
      var debtor = assertOk(_f.U.recordDebt(opened(mkUnit(), 100), { amount: 80, at: 4000, operationId: OP }));
      var absorbed = assertOk(_f.U.absorbDebt(debtor, { byUnitId: _f.ids.deterministicId('unit', ['x']), at: 5000 }));
      assertErr(_f.U.absorbDebt(absorbed, { byUnitId: _f.ids.deterministicId('unit', ['y']), at: 6000 }), 'PRECONDITION');
    });
  });
});

describe('fifo-core/reconciliation', function () {
  var RC = _f.RC;
  var A = _f.A;

  describe('§3.7 đối chiếu vật lý — GHI ĐÈ TUYỆT ĐỐI, không cộng delta', function () {
    test('remainingQty thành đúng số cân được', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 400 });
      var r = assertOk(RC.physicalReconciliation(u, {
        actualQty: 350, at: 5000, actorId: _f.NV, operationId: 'operation_pr'
      }));
      assert.strictEqual(r.unit.remainingQty, 350);
      assert.strictEqual(r.delta, -50);
      assert.strictEqual(r.resultingStock, 350);
    });

    test('cân 2 lần liên tiếp KHÔNG cộng dồn — đây là điểm dễ sai nhất', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 400 });
      var once = assertOk(RC.physicalReconciliation(u, {
        actualQty: 350, at: 5000, actorId: _f.NV, operationId: 'operation_pr1'
      })).unit;
      var twice = assertOk(RC.physicalReconciliation(once, {
        actualQty: 350, at: 6000, actorId: _f.NV, operationId: 'operation_pr2'
      })).unit;
      assert.strictEqual(twice.remainingQty, 350, 'delta bị cộng dồn thay vì ghi đè');
    });

    test('mỗi lần cân được ghi vào lịch sử (legacy: notEmptyChecks[])', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 400 });
      var a = assertOk(RC.physicalReconciliation(u, {
        actualQty: 350, at: 5000, actorId: _f.NV, operationId: 'operation_pr1'
      })).unit;
      var b = assertOk(RC.physicalReconciliation(a, {
        actualQty: 300, at: 6000, actorId: _f.NV, operationId: 'operation_pr2'
      })).unit;
      assert.strictEqual(b.physicalReconciliations.length, 2);
      assert.strictEqual(b.physicalReconciliations[0].before, 400);
      assert.strictEqual(b.physicalReconciliations[1].before, 350);
    });

    test('lệch thì gắn cờ cần rà', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 400 });
      var r = assertOk(RC.physicalReconciliation(u, {
        actualQty: 350, at: 5000, actorId: _f.NV, operationId: 'operation_pr'
      }));
      assert.strictEqual(r.unit.needsReview, true);
    });

    test('không lệch thì không gắn cờ', function () {
      var u = Object.assign({}, opened(mkUnit(), 100), { remainingQty: 400 });
      var r = assertOk(RC.physicalReconciliation(u, {
        actualQty: 400, at: 5000, actorId: _f.NV, operationId: 'operation_pr'
      }));
      assert.strictEqual(r.unit.needsReview, false);
    });

    test('cân ra nhiều hơn dung tích ban đầu bị chặn', function () {
      var u = Object.assign({}, opened(mkUnit({ initialQty: 1000 }), 100), { remainingQty: 400 });
      assertErr(RC.physicalReconciliation(u, {
        actualQty: 1500, at: 5000, actorId: _f.NV, operationId: 'operation_pr'
      }), 'VALIDATION');
    });

    test('Unit chưa mở thì không cân được', function () {
      assertErr(RC.physicalReconciliation(mkUnit(), {
        actualQty: 100, at: 5000, actorId: _f.NV, operationId: 'operation_pr'
      }), 'PRECONDITION');
    });
  });

  describe('§3.8 hoàn tác — BÙ TRỪ, không chạy lại FIFO', function () {
    test('hoàn đúng về Unit gốc, kể cả khi FIFO hiện tại đã khác', function () {
      var u1 = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['u1']) }), 100), { remainingQty: 20 });
      var u2 = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['u2']) }), 200), { remainingQty: 900 });
      var set = A.createWorkingSet([u1, u2]);

      /* Bill gốc đã trừ 80 ở u1. Giờ FIFO hiện tại sẽ chọn u1 (mở trước) nhưng
         u1 chỉ còn 20 — chạy lại FIFO sẽ trả sai chỗ. */
      var r = assertOk(RC.reverseAllocations(set, {
        referenceId: 'bill_9', domain: 'raw', operationId: 'operation_rev',
        originalAllocations: [{
          unitId: u1.unitId, itemId: _f.SUA, qty: 80, unitCost: 30,
          costBasisVersionId: 'version_c1', operationId: 'operation_sale1'
        }]
      }));
      assert.strictEqual(r.coverage, 'full');
      assert.strictEqual(set.get(u1.unitId).remainingQty, 100);
      assert.strictEqual(set.get(u2.unitId).remainingQty, 900, 'hoàn nhầm sang Unit khác');
    });

    test('hoàn tác trả lại cả chi phí đã ghi', function () {
      var u1 = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['u1']) }), 100), { remainingQty: 20 });
      var r = assertOk(RC.reverseAllocations(A.createWorkingSet([u1]), {
        referenceId: 'bill_9', domain: 'raw', operationId: 'operation_rev',
        originalAllocations: [{
          unitId: u1.unitId, itemId: _f.SUA, qty: 80, unitCost: 30, operationId: 'operation_sale1'
        }]
      }));
      assert.strictEqual(r.totalCostReversed, -2400);
    });

    test('không có allocation gốc thì đánh dấu untracked, KHÔNG đoán bừa', function () {
      var r = assertOk(RC.reverseAllocations(A.createWorkingSet([]), {
        referenceId: 'bill_cu', domain: 'raw', operationId: 'operation_rev',
        originalAllocations: [], fallbackQty: 50
      }));
      assert.strictEqual(r.coverage, 'untracked');
      assert.strictEqual(r.needsManualReview, true);
    });

    test('thiếu originalAllocations hoàn toàn thì từ chối — cấm chạy lại FIFO để đoán', function () {
      var r = RC.reverseAllocations(A.createWorkingSet([]), {
        referenceId: 'bill_9', domain: 'raw', operationId: 'operation_rev'
      });
      assertErr(r, 'VALIDATION');
      assert.ok(/không phải chạy lại FIFO/.test(r.error.message));
    });

    test('Unit đã compact thì fail-closed', function () {
      var u = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['u1']) }), 100), {
        status: 'COMPACTABLE', remainingQty: 0
      });
      assertErr(RC.reverseAllocations(A.createWorkingSet([u]), {
        referenceId: 'bill_9', domain: 'raw', operationId: 'operation_rev',
        originalAllocations: [{ unitId: u.unitId, itemId: _f.SUA, qty: 80, unitCost: 30, operationId: 'op1' }]
      }), 'PRECONDITION');
    });

    test('Unit gốc không còn thì báo lỗi, không hoàn sang Unit khác', function () {
      assertErr(RC.reverseAllocations(A.createWorkingSet([]), {
        referenceId: 'bill_9', domain: 'raw', operationId: 'operation_rev',
        originalAllocations: [{
          unitId: _f.ids.deterministicId('unit', ['bien-mat']), itemId: _f.SUA,
          qty: 80, unitCost: 30, operationId: 'op1'
        }]
      }), 'NOT_FOUND');
    });

    test('operationId hoàn tác cố định — hoàn 2 lần là no-op, không cộng đúp', function () {
      var a = RC.reversalOperationId('bill_9', 'raw', _f.SUA);
      var b = RC.reversalOperationId('bill_9', 'raw', _f.SUA);
      assert.strictEqual(a, b);
      assert.notStrictEqual(a, RC.reversalOperationId('bill_9', 'prep', _f.SUA));
    });
  });

  describe('§3.9 dựng lại trạng thái từ ledger', function () {
    function entry(unitId, type, qty, op) {
      return assertOk(_f.L.createEntry({
        operationId: op, domain: 'raw', type: type, itemId: _f.SUA, storeId: _f.STORE,
        unitId: unitId, qtyDelta: qty, businessDate: '2026-03-10', actorId: _f.NV, occurredAt: op.length
      }));
    }

    test('replay ledger ra đúng số dư đang lưu', function () {
      var u = Object.assign({}, opened(mkUnit({ initialQty: 1000 }), 100), { remainingQty: 700 });
      var r = assertOk(RC.rebuildUnitState(u, [
        entry(u.unitId, 'CONSUMPTION', -200, 'operation_a'),
        entry(u.unitId, 'CONSUMPTION', -100, 'operation_bb')
      ]));
      assert.strictEqual(r.rebuiltRemainingQty, 700);
      assert.strictEqual(r.matches, true);
    });

    test('phát hiện lệch giữa số đã lưu và ledger', function () {
      var u = Object.assign({}, opened(mkUnit({ initialQty: 1000 }), 100), { remainingQty: 650 });
      var r = assertOk(RC.rebuildUnitState(u, [entry(u.unitId, 'CONSUMPTION', -200, 'operation_a')]));
      assert.strictEqual(r.matches, false);
      assert.strictEqual(r.drift, -150);
    });

    test('RECEIVING không bị cộng đúp (đã nằm trong initialQty)', function () {
      var u = Object.assign({}, mkUnit({ initialQty: 1000 }), { remainingQty: 1000 });
      var r = assertOk(RC.rebuildUnitState(u, [entry(u.unitId, 'RECEIVING', 1000, 'operation_r')]));
      assert.strictEqual(r.rebuiltRemainingQty, 1000);
    });

    test('ledger của Unit khác không ảnh hưởng', function () {
      var u = Object.assign({}, opened(mkUnit({ initialQty: 1000 }), 100), { remainingQty: 1000 });
      var other = _f.ids.deterministicId('unit', ['khac']);
      var r = assertOk(RC.rebuildUnitState(u, [entry(other, 'CONSUMPTION', -500, 'operation_a')]));
      assert.strictEqual(r.rebuiltRemainingQty, 1000);
    });

    test('detectDrift quét nhiều Unit cùng lúc', function () {
      var ok = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['ok']), initialQty: 100 }), 100), { remainingQty: 90 });
      var bad = Object.assign({}, opened(mkUnit({ unitId: _f.ids.deterministicId('unit', ['bad']), initialQty: 100 }), 100), { remainingQty: 50 });
      var entries = [entry(ok.unitId, 'CONSUMPTION', -10, 'operation_a'), entry(bad.unitId, 'CONSUMPTION', -10, 'operation_b')];
      var r = assertOk(RC.detectDrift([ok, bad], entries));
      assert.strictEqual(r.clean, false);
      assert.strictEqual(r.drifted.length, 1);
      assert.strictEqual(r.drifted[0].unitId, bad.unitId);
    });
  });
});

describe('Tiếp nhận dữ liệu cũ — ranh giới truy vết', function () {
  var U = GIEO.require('fifo-core/unit');
  var T = GIEO.require('traceability/trace');
  var idsL = GIEO.require('shared-kernel/ids');
  var ST = idsL.deterministicId('store', ['main']);
  var IT = idsL.deterministicId('item', ['sua']);

  function seed(over) {
    return U.seedUnitFromLegacy(Object.assign({
      itemId: IT, storeId: ST, itemKind: 'raw', initialQty: 140,
      operationId: 'operation_seed_1', seededAt: '2026-09-20', legacyRef: 'K362R02H'
    }, over || {}));
  }

  test('lô tiếp nhận có LƯỢNG nhưng KHÔNG có giá vốn, và tự khai điều đó', function () {
    var u = assertOk(seed());
    assert.strictEqual(u.initialQty, 140);
    assert.strictEqual(u.remainingQty, 140);
    assert.strictEqual(u.costBasis, null);
    assert.strictEqual(u.origin, U.ORIGIN.LEGACY_SEED);
    assert.strictEqual(u.seededAt, '2026-09-20');
    assert.strictEqual(u.legacyRef, 'K362R02H');
    assert.ok(u.needsReviewReasons.indexOf('SEEDED_WITHOUT_COST') !== -1);
  });

  test('cửa nhận hàng bình thường VẪN bắt buộc giá vốn — seed không nới nó ra', function () {
    var out = U.createUnit({
      itemId: IT, storeId: ST, itemKind: 'raw', initialQty: 100, operationId: 'operation_x'
    });
    assertErr(out, 'VALIDATION');
    assert.ok(/costBasis/.test(out.error.message));
  });

  test('Unit sinh trong hệ mới mang origin NATIVE', function () {
    var u = assertOk(U.createUnit({
      itemId: IT, storeId: ST, itemKind: 'raw', initialQty: 100,
      costBasis: { unitCost: 30 }, operationId: 'operation_y'
    }));
    assert.strictEqual(u.origin, U.ORIGIN.NATIVE);
    assert.strictEqual(u.seededAt, null);
  });

  test('lô đã hết hoặc đang âm ở hệ cũ thì KHÔNG mang sang', function () {
    assertErr(seed({ initialQty: 0 }), 'PRECONDITION');
    var neg = seed({ initialQty: -1826 });
    assertErr(neg, 'PRECONDITION');
    assert.strictEqual(neg.error.detail.legacyRef, 'K362R02H');
  });

  test('thiếu mốc tiếp nhận thì từ chối — không có mốc thì không có ranh giới', function () {
    assertErr(seed({ seededAt: null }), 'VALIDATION');
  });

  test('trace NÓI RA ranh giới thay vì hiện lịch sử cụt như thể đầy đủ', function () {
    var u = assertOk(seed());
    var tr = assertOk(T.buildUnitTrace({ unit: u, ledgerEntries: [], allocations: [] }));
    assert.strictEqual(tr.traceability.complete, false);
    assert.strictEqual(tr.traceability.completeFrom, '2026-09-20');
    assert.strictEqual(tr.traceability.legacyRef, 'K362R02H');
    assert.ok(/không được truy xuất/.test(tr.traceability.note));
  });

  test('trace của Unit hệ mới khai là ĐẦY ĐỦ', function () {
    var u = assertOk(U.createUnit({
      itemId: IT, storeId: ST, itemKind: 'raw', initialQty: 100,
      costBasis: { unitCost: 30 }, receivedAt: 500, operationId: 'operation_z'
    }));
    var tr = assertOk(T.buildUnitTrace({ unit: u, ledgerEntries: [], allocations: [] }));
    assert.strictEqual(tr.traceability.complete, true);
    assert.strictEqual(tr.traceability.origin, 'NATIVE');
  });

  test('câu hỏi về quá khứ KHÔNG bị tính là "chưa trả lời" với lô tiếp nhận', function () {
    var u = assertOk(seed());
    var tr = assertOk(T.buildUnitTrace({ unit: u, ledgerEntries: [], allocations: [] }));
    var missing = T.unanswered(tr);
    assert.strictEqual(missing.indexOf('cost basis nào'), -1, 'giá vốn nằm ngoài ranh giới');
    assert.strictEqual(missing.indexOf('nhận từ đâu'), -1);
    assert.strictEqual(missing.indexOf('ai mở'), -1);
  });

  test('nhưng quãng đời SAU mốc tiếp nhận thì vẫn phải trả lời được', function () {
    var u = assertOk(seed());
    var tr = assertOk(T.buildUnitTrace({ unit: u, ledgerEntries: [], allocations: [] }));
    assert.strictEqual(T.unanswered(tr).length, 0, 'lô seed mới nhận thì chưa thiếu gì cả');

    /* Bỏ mất allocations = mất phần hệ mới chịu trách nhiệm → phải báo thiếu. */
    var broken = Object.assign({}, tr, { allocations: null });
    assert.ok(T.unanswered(broken).indexOf('đã phân bổ cho những gì') !== -1);
  });

  test('lô tiếp nhận vẫn chạy FIFO bình thường về LƯỢNG', function () {
    var u = assertOk(seed());
    var opened = assertOk(U.open(u, { at: 1000, actorId: idsL.deterministicId('actor', ['nv']), operationId: 'operation_open_seed' }));
    assert.strictEqual(opened.remainingQty, 140);
    assert.strictEqual(opened.status, 'OPEN');
  });
});

describe('Tiếp nhận — hũ đang mở dở phải giữ đúng chỗ trong hàng đợi FIFO', function () {
  var U = GIEO.require('fifo-core/unit');
  var A = GIEO.require('fifo-core/allocation');
  var idsS = GIEO.require('shared-kernel/ids');
  var ST = idsS.deterministicId('store', ['main']);
  var IT = idsS.deterministicId('item', ['sua']);

  function seedUnit(ref, qty, openedAt) {
    return assertOk(U.seedUnitFromLegacy({
      unitId: idsS.deterministicId('unit', ['seed', ref]),
      itemId: IT, storeId: ST, itemKind: 'raw', initialQty: qty,
      openedAt: openedAt || null,
      operationId: 'operation_seed_' + ref, seededAt: '2026-09-20', legacyRef: ref
    }));
  }

  test('lô mở dở được tiếp nhận ở trạng thái ĐANG MỞ, giữ nguyên openedAt', function () {
    var u = seedUnit('A', 140, 1789363395601);
    assert.strictEqual(u.status, 'OPEN');
    assert.strictEqual(u.openedAt, 1789363395601);
    /* Người mở thuộc hệ cũ — không mang sang, và không bịa. */
    assert.strictEqual(u.openedBy, null);
  });

  test('lô niêm phong tiếp nhận vẫn là SEALED, không bịa mốc mở', function () {
    var u = seedUnit('B', 500, null);
    assert.strictEqual(u.status, 'SEALED');
    assert.strictEqual(u.openedAt, null);
  });

  test('FIFO dùng hũ mở dở TRƯỚC, không đẩy nó xuống cuối hàng', function () {
    var cu = seedUnit('CU', 100, 1000);      /* mở từ lâu, còn 100 */
    var moi = seedUnit('MOI', 200, 5000);    /* mở sau, còn 200 */
    var ws = A.createWorkingSet([moi, cu]);  /* cố ý đưa vào sai thứ tự */

    var out = assertOk(A.allocateConsumption(ws, {
      itemId: IT, qty: 150, operationId: 'operation_ban_1'
    }));
    assert.strictEqual(out.allocations.length, 2);
    assert.strictEqual(out.allocations[0].unitId, cu.unitId, 'phải trừ hũ mở trước tiên');
    assert.strictEqual(out.allocations[0].qty, 100);
    assert.strictEqual(out.allocations[1].unitId, moi.unitId);
    assert.strictEqual(out.allocations[1].qty, 50);
  });

  test('lô tiếp nhận không có giá vốn thì allocation NÓI RA là chưa đủ giá', function () {
    var u = seedUnit('C', 100, 1000);
    var ws = A.createWorkingSet([u]);
    var out = assertOk(A.allocateConsumption(ws, {
      itemId: IT, qty: 50, operationId: 'operation_ban_2'
    }));
    /* Lượng vẫn trừ đúng — đó là điều kiện đã chốt. Nhưng giá thì không bịa. */
    assert.strictEqual(out.allocations[0].qty, 50);
    assert.strictEqual(out.allocations[0].unitCost, null);
    assert.strictEqual(out.allocations[0].cost, null);
    assert.strictEqual(out.costComplete, false, 'có lô không giá vốn thì totalCost chưa phải giá vốn thật');
    assert.deepStrictEqual(out.unitsWithoutCost, [u.unitId]);
    assert.strictEqual(out.totalCost, 0, 'không cộng null thành NaN');
  });
});
