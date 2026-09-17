/**
 * RP3 (NET-REPORTING-V1.md) — invalidateScope() nối vào OrderVoided.
 *
 * `commands` không được import `read-layer` (src/layer-rules.json), nên
 * `read-layer/merge-canonical.invalidateScope()` không thể gọi thẳng từ
 * `commands/reversal.js`. Nối qua `bootstrap`: `domain-events.js` dịch event
 * → scope thuần, `bootstrap/runtime.js#dispatchDomainEvents` gọi thật.
 */

var _rc = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    DE: GIEO.require('bootstrap/domain-events'),
    BOOT: GIEO.require('bootstrap/runtime'),
    REV: GIEO.require('commands/reversal'),
    U: GIEO.require('fifo-core/unit'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    QL: ids.deterministicId('actor', ['ql']),
    SUA: ids.deterministicId('item', ['sua'])
  };
})();

function rcCtx() {
  var day = assertOk(_rc.BD.openDay({
    storeId: _rc.STORE, dateKey: '2026-03-10', actorId: _rc.QL,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _rc.CLK.createClock()
  }));
  var actor = assertOk(_rc.ACCESS.createActor({
    actorId: _rc.QL, role: 'QUANLY_ADMIN', source: 'QUANLY', stores: [_rc.STORE]
  }));
  return assertOk(_rc.CTXL.createContext({
    organizationId: _rc.ORG, storeId: _rc.STORE, actor: actor, source: 'QUANLY', businessDay: day
  }));
}

function rcUnit() {
  var u = assertOk(_rc.U.createUnit({
    unitId: _rc.ids.deterministicId('unit', ['u_rc']),
    itemId: _rc.SUA, storeId: _rc.STORE, itemKind: 'raw', initialQty: 1000,
    costBasis: { unitCost: 30, versionId: 'version_c1' }, operationId: 'operation_r'
  }));
  u = assertOk(_rc.U.open(u, { at: 1000, actorId: _rc.QL, operationId: 'operation_o' }));
  return Object.assign({}, u, { remainingQty: 800 });
}

describe('bootstrap/domain-events — scopesToInvalidate (RP3)', function () {
  var DE = _rc.DE;

  test('OrderVoided đủ storeId+businessDate → 1 scope đúng 1 ngày', function () {
    var scopes = DE.scopesToInvalidate([{
      type: 'OrderVoided', referenceId: 'bill_1', storeId: _rc.STORE, businessDate: '2026-03-10'
    }]);
    assert.strictEqual(scopes.length, 1);
    assert.deepStrictEqual(scopes[0], { storeId: _rc.STORE, fromDateKey: '2026-03-10', toDateKey: '2026-03-10' });
  });

  test('OrderVoided thiếu businessDate → bỏ qua, không đoán phạm vi', function () {
    var scopes = DE.scopesToInvalidate([{ type: 'OrderVoided', referenceId: 'bill_1', storeId: _rc.STORE }]);
    assert.strictEqual(scopes.length, 0);
  });

  test('sự kiện khác OrderVoided (StateRevised, ContainerFound) không kích hoạt — tránh xoá cache không liên quan', function () {
    var scopes = DE.scopesToInvalidate([
      { type: 'StateRevised', entityType: 'prepYield', storeId: _rc.STORE, businessDate: '2026-03-10' },
      { type: 'ContainerFound', referenceId: 'unit_1', storeId: _rc.STORE, businessDate: '2026-03-10' }
    ]);
    assert.strictEqual(scopes.length, 0);
  });

  test('nhiều OrderVoided → nhiều scope độc lập', function () {
    var scopes = DE.scopesToInvalidate([
      { type: 'OrderVoided', storeId: _rc.STORE, businessDate: '2026-03-10' },
      { type: 'OrderVoided', storeId: _rc.STORE, businessDate: '2026-03-11' }
    ]);
    assert.strictEqual(scopes.length, 2);
    assert.strictEqual(scopes[1].fromDateKey, '2026-03-11');
  });

  test('mảng rỗng/undefined → mảng rỗng', function () {
    assert.deepStrictEqual(DE.scopesToInvalidate([]), []);
    assert.deepStrictEqual(DE.scopesToInvalidate(undefined), []);
  });
});

describe('bootstrap/runtime — dispatchDomainEvents gọi thật invalidateScope() khi OrderVoided (RP3)', function () {
  var BOOT = _rc.BOOT;
  var REV = _rc.REV;

  function shadowRuntime(extraSpec) {
    var c = rcCtx();
    return BOOT.createRuntime(Object.assign({
      mode: BOOT.MODE.SHADOW, context: function () { return c; }
    }, extraSpec || {}));
  }

  function voidBillInput() {
    var u = rcUnit();
    return {
      referenceId: 'bill_rc1', domain: 'raw', itemId: _rc.SUA, reason: 'xoá bill', units: [u],
      originalAllocations: [{ unitId: u.unitId, itemId: _rc.SUA, qty: 200, unitCost: 30, operationId: 'op1' }],
      eventType: 'OrderVoided'
    };
  }

  test('ReverseTransaction OrderVoided → reportCacheInvalidations có đúng 1 scope, mặc định 0 key (chưa có cache adapter thật)', function () {
    var runtime = shadowRuntime();
    return runtime.command('ReverseTransaction', voidBillInput()).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.reportCacheInvalidations.length, 1);
      var inv = out.value.reportCacheInvalidations[0];
      assert.deepStrictEqual(inv.scope, { storeId: _rc.STORE, fromDateKey: '2026-03-10', toDateKey: '2026-03-10' });
      assert.deepStrictEqual(inv.kept, []);
      assert.deepStrictEqual(inv.dropped, []);
    });
  });

  test('spec.reportCacheKeys cấp key thật → invalidateScope() lọc đúng theo phạm vi ngày (K3: không xoá sạch)', function () {
    var runtime = shadowRuntime({
      reportCacheKeys: function () {
        return [
          { dateKey: '2026-03-09', storeId: _rc.STORE },
          { dateKey: '2026-03-10', storeId: _rc.STORE },
          { dateKey: '2026-03-11', storeId: _rc.STORE }
        ];
      }
    });
    return runtime.command('ReverseTransaction', voidBillInput()).then(function (out) {
      assertOk(out);
      var inv = out.value.reportCacheInvalidations[0];
      assert.strictEqual(inv.dropped.length, 1);
      assert.strictEqual(inv.dropped[0].dateKey, '2026-03-10');
      assert.strictEqual(inv.kept.length, 2);
    });
  });

  test('ReverseTransaction domain khác (không phải xoá bill, eventType khác OrderVoided) → không có reportCacheInvalidations', function () {
    var runtime = shadowRuntime();
    var u = rcUnit();
    return runtime.command('ReverseTransaction', {
      referenceId: 'unit_lost_1', domain: 'raw', itemId: _rc.SUA, reason: 'tìm lại hũ mất', units: [u],
      originalAllocations: [{ unitId: u.unitId, itemId: _rc.SUA, qty: 200, unitCost: 30, operationId: 'op2' }],
      eventType: 'ContainerFound'
    }).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.reportCacheInvalidations, undefined);
    });
  });
});
