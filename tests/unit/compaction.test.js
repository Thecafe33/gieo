/** P6 — Unit snapshot, book snapshot, verifier và purge safety gate. */
var _cp = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids, U: GIEO.require('fifo-core/unit'), L: GIEO.require('fifo-core/ledger'),
    T: GIEO.require('traceability/trace'), US: GIEO.require('compaction/unit-snapshot'),
    BS: GIEO.require('compaction/book-snapshot'), V: GIEO.require('compaction/snapshot-verifier'),
    P: GIEO.require('compaction/purge'), AR: GIEO.require('compaction/archive'),
    LC: GIEO.require('compaction/lifecycle'),
    CP: GIEO.require('persistence-firebase/canonical-paths'),
    AC: GIEO.require('persistence-firebase/atomic-commit'), R: GIEO.require('shared-kernel/result'),
    MC: GIEO.require('read-layer/merge-canonical'),
    STORE: ids.deterministicId('store', ['main']), ORG: ids.deterministicId('org', ['gieo']),
    ACTOR: ids.deterministicId('actor', ['ql']), ITEM: ids.deterministicId('item', ['sua'])
  };
})();

function cpFixture(tag) {
  var unit = assertOk(_cp.U.createUnit({
    unitId: _cp.ids.deterministicId('unit', [tag]), itemId: _cp.ITEM,
    storeId: _cp.STORE, itemKind: 'raw', initialQty: 100,
    costBasis: { unitCost: 30, versionId: 'version_cost_1' },
    receiptId: 'receipt_1', supplierId: 'supplier_1', receivedAt: 10,
    receivedBy: _cp.ACTOR, operationId: 'operation_receive'
  }));
  unit = assertOk(_cp.U.open(unit, { at: 20, actorId: _cp.ACTOR, operationId: 'operation_open' }));
  unit = assertOk(_cp.U.finish(Object.assign({}, unit, { remainingQty: 0 }), {
    at: 40, actorId: _cp.ACTOR, operationId: 'operation_finish'
  })).unit;
  var entry = assertOk(_cp.L.createEntry({
    operationId: 'operation_sale', domain: 'raw', type: 'CONSUMPTION',
    itemId: _cp.ITEM, storeId: _cp.STORE, unitId: unit.unitId,
    qtyDelta: -100, businessDate: '2026-03-10', actorId: _cp.ACTOR,
    referenceType: 'bill', referenceId: 'bill_1'
  }));
  var allocations = [{
    operationId: 'operation_sale', unitId: unit.unitId, itemId: _cp.ITEM,
    qty: 100, domain: 'sale', targetType: 'bill', targetRef: 'bill_1',
    billId: 'bill_1', recipeVersionIds: ['version_recipe_1'],
    unitBaseBefore: 100, unitBaseAfter: 0, unitCost: 30, cost: 3000
  }];
  var cogsLines = [{
    amount: 3000, costBasisVersionId: 'version_cost_1',
    recipeVersionId: 'version_recipe_1', billId: 'bill_1'
  }];
  var snapshot = assertOk(_cp.US.buildUnitSnapshot({
    unit: unit, entries: [entry], allocations: allocations, cogsLines: cogsLines,
    variance: { theoretical: 100, actual: 100, diff: 0 }, builtAt: 100, builtBy: _cp.ACTOR
  }));
  return {
    unit: unit, entries: [entry], allocations: allocations, cogsLines: cogsLines,
    snapshot: snapshot,
    projectionInput: { units: [unit], untrackedBase: 0, ledgerEntries: [entry] }
  };
}

function verifyFixture(f, over) {
  return _cp.V.verify(Object.assign({
    snapshot: f.snapshot, unit: f.unit, entries: f.entries,
    allocations: f.allocations, cogsLines: f.cogsLines,
    variance: { theoretical: 100, actual: 100, diff: 0 },
    compactability: { pendingOperations: [], approvals: [], activeDependencies: [] },
    projectionInput: f.projectionInput,
    observedCurrentStock: 0, verifiedAt: 200, verifiedBy: _cp.ACTOR
  }, over || {}));
}

describe('P6 Unit snapshot — compactability tách khỏi builder', function () {
  test('active dependency và pending operation trả blocker cụ thể', function () {
    var f = cpFixture('blocked');
    var out = assertOk(_cp.US.assessCompactability({
      unit: f.unit,
      pendingOperations: [{ operationId: 'operation_pending', unitIds: [f.unit.unitId] }],
      approvals: [],
      activeDependencies: [{ sourceId: f.unit.unitId }]
    }));
    assert.strictEqual(out.compactable, false);
    assert.deepStrictEqual(out.blockers.map(function (b) { return b.code; }), [
      'OPERATION_UNRESOLVED', 'TRACE_DEPENDENCY_ACTIVE'
    ]);
  });

  test('snapshot giữ từng bill, allocation, COGS line và revision', function () {
    var s = cpFixture('detail').snapshot;
    assert.deepStrictEqual(s.billIds, ['bill_1']);
    assert.strictEqual(s.consumption.length, 1);
    assert.strictEqual(s.cogsLines[0].costBasisVersionId, 'version_cost_1');
    assert.deepStrictEqual(s.recipeVersionIds, ['version_recipe_1']);
    assert.deepStrictEqual(_cp.US.missingFields(s), []);
  });

  test('Unified Read trả cùng canonical shape giữa LIVE và COMPACT', function () {
    var f = cpFixture('read');
    var live = assertOk(_cp.T.buildUnitTrace({
      unit: f.unit, ledgerEntries: f.entries, allocations: f.allocations
    }));
    var compact = assertOk(_cp.MC.resolve({ snapshot: f.snapshot }));
    assert.deepStrictEqual(compact.data, live);
    assert.strictEqual(compact.meta.frozen, true);
  });

  test('revision > 1 bắt buộc trỏ snapshot trước', function () {
    var f = cpFixture('revision');
    assertErr(_cp.US.buildUnitSnapshot({ unit: f.unit, revisionNo: 2 }), 'VALIDATION');
  });
});

describe('P6 lifecycle — không nhảy cóc verification', function () {
  test('SNAPSHOT_READY không thể sang COMPACTED nếu chưa verified PASS', function () {
    var f = cpFixture('lifecycle');
    var row = assertOk(_cp.LC.start('unit', f.unit.unitId));
    row = assertOk(_cp.LC.transition(row, _cp.LC.STATE.CLOSED));
    row = assertOk(_cp.LC.transition(row, _cp.LC.STATE.SNAPSHOT_READY, { snapshotId: f.snapshot.snapshotId }));
    assertErr(_cp.LC.transition(row, _cp.LC.STATE.COMPACTED, { snapshot: f.snapshot }), 'PRECONDITION');
    var verified = assertOk(verifyFixture(f)).snapshot;
    assert.strictEqual(assertOk(_cp.LC.transition(row, _cp.LC.STATE.COMPACTED, {
      snapshot: verified
    })).state, 'COMPACTED');
  });
});

describe('P6 snapshot verifier — RAW → rebuild → compare', function () {
  test('PASS mới trả snapshot verified', function () {
    var f = cpFixture('verify');
    var out = assertOk(verifyFixture(f));
    assert.strictEqual(out.passed, true);
    assert.strictEqual(out.snapshot.verified, true);
    assert.strictEqual(out.alert, null);
  });

  test('ledger sai hoặc currentStock lệch đều FAIL và sinh alert chuẩn', function () {
    var f = cpFixture('bad');
    var badEntry = Object.assign({}, f.entries[0], { untrackedPendingDelta: -100 });
    var out = assertOk(verifyFixture(f, { entries: [badEntry], observedCurrentStock: 10 }));
    assert.strictEqual(out.passed, false);
    assert.ok(out.failures.some(function (x) { return x.check === 'LEDGER_INVARIANTS'; }));
    assert.ok(out.failures.some(function (x) { return x.check === 'CURRENT_STOCK'; }));
    assert.strictEqual(out.alert.type, 'SNAPSHOT_VERIFY_FAILED');
  });

  test('Unit chưa compactable bị chặn trước verifier', function () {
    var f = cpFixture('gate');
    assertErr(verifyFixture(f, {
      compactability: {
        pendingOperations: [], approvals: [],
        activeDependencies: [{ sourceId: f.unit.unitId }]
      }
    }), 'PRECONDITION');
  });
});

describe('P6 book snapshot — giữ v1, correction tạo v2', function () {
  test('đóng kỳ đọc frozen; drift không tự sửa snapshot', function () {
    var book = _cp.BS.createBook();
    var v1 = assertOk(book.close({
      period: '2026-03', values: { revenue: 100, cogs: 40 },
      closedBy: _cp.ACTOR, closedAt: 100
    }));
    var read = assertOk(book.read('2026-03', function () { throw new Error('không được recompute'); }));
    assert.strictEqual(read.source, 'FROZEN');
    var drift = assertOk(book.detectDrift('2026-03', function () {
      return _cp.R.ok({ revenue: 101, cogs: 40 });
    }));
    assert.strictEqual(drift.drifted, true);
    assert.strictEqual(drift.alert.type, 'DRIFT_AFTER_CLOSING');
    assert.strictEqual(v1.values.revenue, 100);
  });

  test('correction thiếu audit bị từ chối', function () {
    var book = _cp.BS.createBook();
    assertOk(book.close({ period: '2026-03', values: { revenue: 100 }, closedBy: _cp.ACTOR, closedAt: 100 }));
    assertErr(book.correct({ period: '2026-03', values: { revenue: 120 } }), 'VALIDATION');
  });

  test('correction giữ v1 đọc lại được và v2 supersede v1', function () {
    var book = _cp.BS.createBook();
    var v1 = assertOk(book.close({
      period: '2026-03', values: { revenue: 100 }, closedBy: _cp.ACTOR, closedAt: 100
    }));
    var changed = assertOk(book.correct({
      period: '2026-03', values: { revenue: 120 }, actorId: _cp.ACTOR,
      at: 200, reason: 'bổ sung bill thiếu', scopeAffected: ['2026-03-10']
    }));
    assert.strictEqual(changed.current.supersedesSnapshotId, v1.snapshotId);
    assert.strictEqual(assertOk(book.getRevision('2026-03', 1)).values.revenue, 100);
    assert.strictEqual(book.history('2026-03').length, 2);
  });
});

describe('P6 purge — system controlled + verified + dependency safe', function () {
  test('tuổi không bypass được verification hoặc dependency registry', function () {
    var f = cpFixture('purge-blocked');
    assertErr(_cp.P.buildPlan({
      snapshot: f.snapshot, ageDays: 9999, systemControlled: true,
      sourceType: 'unit', sourceId: f.unit.unitId,
      rawRecords: [{ kind: 'FIRESTORE', path: 'x' }]
    }), 'PRECONDITION');
  });

  test('snapshot path bị cấm tuyệt đối', function () {
    var f = cpFixture('purge-snapshot');
    var verified = assertOk(verifyFixture(f)).snapshot;
    assertErr(_cp.P.buildPlan({
      snapshot: verified, systemControlled: true,
      dependencyRegistry: _cp.T.createDependencyRegistry(),
      sourceType: 'unit', sourceId: f.unit.unitId,
      rawRecords: [{ kind: 'FIRESTORE', path: 'orgs/o/stores/s/snapshots/units/u/revisions/1' }]
    }), 'FORBIDDEN');
  });

  test('plan purge dùng operationId xác định và adapter ghi remove nguyên tử', function () {
    var f = cpFixture('purge-pass');
    var verified = assertOk(verifyFixture(f)).snapshot;
    var ctx = { organizationId: _cp.ORG, storeId: _cp.STORE };
    var rawPath = assertOk(_cp.CP.path('unit', ctx, { unitId: f.unit.unitId })).path;
    var plan = assertOk(_cp.P.buildPlan({
      snapshot: verified, systemControlled: true,
      dependencyRegistry: _cp.T.createDependencyRegistry(),
      sourceType: 'unit', sourceId: f.unit.unitId,
      rawRecords: [{ kind: 'FIRESTORE', path: rawPath }]
    }));
    assert.strictEqual(plan.operationId,
      _cp.P.operationIdFor('unit', f.unit.unitId, verified.snapshotId));
    var writes = assertOk(_cp.AC.planToWrites(plan, ctx));
    assert.ok(writes.some(function (w) { return w.path === rawPath && w.op === 'remove'; }));
  });

  test('bank confirmation cũ vẫn không được xoá nếu còn dependency', function () {
    var registry = _cp.T.createDependencyRegistry();
    assertOk(registry.register({
      sourceType: 'bankConfirmation', sourceId: 'bank_1', referencedBy: [{ type: 'payment', id: 'p1' }]
    }));
    var decision = assertOk(_cp.P.canDeleteBankConfirmation({
      systemControlled: true, bankOrderId: 'bank_1', billExists: false,
      longExpired: true, dependencyRegistry: registry
    }));
    assert.strictEqual(decision.allowed, false);
  });
});

describe('P6 archive — ghi đích thành công rồi mới xoá nguồn', function () {
  test('giữ key month_day_year và nguyên object bill', function () {
    var orders = { bill_1: { billId: 'bill_1', lines: [{ name: 'Sữa gạo', qty: 1 }] } };
    var plan = assertOk(_cp.AR.buildWritePlan({ businessDate: '2026-03-10', orders: orders, at: 100 }));
    assert.strictEqual(plan.domainRecords[0].record.archiveKey, '03_10_2026');
    assert.deepStrictEqual(plan.domainRecords[0].record.orders, orders);
  });

  test('chưa có receipt ghi đích thì tuyệt đối không sinh removal', function () {
    var registry = _cp.AR.createRegistry();
    assertOk(registry.register('2026-03-10', 100));
    assertErr(_cp.AR.buildRemovalPlan({
      businessDate: '2026-03-10', registry: registry,
      sourceRecords: [{ kind: 'RTDB', path: 'x' }]
    }), 'PRECONDITION');
  });

  test('registry tập trung nhớ ngày lỗi cũ, không có trần 60 ngày', function () {
    var registry = _cp.AR.createRegistry();
    assertOk(registry.register('2020-01-01', 1));
    assertOk(registry.markFailed('2020-01-01', 'network', 2));
    assert.strictEqual(registry.pending()[0].businessDate, '2020-01-01');
    assert.strictEqual(registry.pending()[0].lastError, 'network');
  });

  test('có receipt đích mới cho remove và adapter giữ đúng thứ tự hai stage', function () {
    var registry = _cp.AR.createRegistry();
    assertOk(registry.register('2026-03-10', 100));
    assertOk(registry.markDestinationWritten('2026-03-10', '03_10_2026', 110));
    var ctx = { organizationId: _cp.ORG, storeId: _cp.STORE };
    var source = assertOk(_cp.CP.path('billLive', ctx, {
      businessDate: '2026-03-10', billId: 'bill_1'
    })).path;
    var remove = assertOk(_cp.AR.buildRemovalPlan({
      businessDate: '2026-03-10', registry: registry,
      sourceRecords: [{ kind: 'RTDB', path: source }]
    }));
    var writes = assertOk(_cp.AC.planToWrites(remove, ctx));
    assert.ok(writes.some(function (w) { return w.path === source && w.op === 'remove'; }));
  });
});
