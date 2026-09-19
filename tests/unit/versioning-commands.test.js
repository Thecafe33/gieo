/**
 * CP-VersionedInput — `commands/versioning.js`, tầng ghi cho 7 domain đã có
 * sẵn `publish*(registry, spec)` (recipe/cost/packaging/prepYield/payTerms/
 * config/iceCogs) nhưng trước đây không đi qua pipeline (auth/idempotency/
 * audit/atomic-commit) mà bị gọi thẳng registry. Domain logic thuần đã có
 * test riêng ở `tests/unit/versioned-input.test.js` và các file domain — file
 * này chỉ kiểm tầng command: quyền MASTER_CONFIGURE/QUANLY-only, idempotency
 * theo (kind, subjectId, storeId, effectiveFrom), và domainRecord đúng type
 * 'versionedInput' để atomic-commit.js ghi đúng path.
 */

var _vc = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    PIPE: GIEO.require('commands/pipeline'),
    V: GIEO.require('commands/versioning'),
    VI: GIEO.require('compaction/versioned-input'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    BOSS: ids.deterministicId('actor', ['boss']),
    NV: ids.deterministicId('actor', ['nv01'])
  };
})();

function vcCtx(role, source, actorId) {
  var day = assertOk(_vc.BD.openDay({
    storeId: _vc.STORE, dateKey: '2026-03-10', actorId: _vc.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _vc.CLK.createClock()
  }));
  var actor = assertOk(_vc.ACCESS.createActor({
    actorId: actorId || _vc.BOSS, role: role || 'QUANLY_ADMIN',
    source: source || 'QUANLY', stores: [_vc.STORE]
  }));
  return assertOk(_vc.CTXL.createContext({
    organizationId: _vc.ORG, storeId: _vc.STORE, actor: actor, source: source || 'QUANLY', businessDay: day
  }));
}

function vcRegistry() { return _vc.VI.createRegistry(); }

function run(cmd, input, ctx, store) {
  return _vc.PIPE.run(cmd, input, ctx || vcCtx(), {
    operationStore: store || _vc.PIPE.createInMemoryOperationStore()
  });
}

describe('PublishRecipeVersion', function () {
  var ids = _vc.ids;

  function validInput(registry, over) {
    return Object.assign({
      recipeId: ids.newId('recipe'),
      effectiveFrom: 1000,
      deps: { versionRegistry: registry || vcRegistry() },
      components: { M: [{ refType: 'item', refId: ids.newId('item'), qty: 1 }] }
    }, over || {});
  }

  test('QUANLY_ADMIN publish — domainRecord type versionedInput, kind recipe, publishedBy = actor đang thao tác', function () {
    var ctx = vcCtx();
    var out = assertOk(run(_vc.V.PublishRecipeVersion, validInput(), ctx));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.type, 'versionedInput');
    assert.strictEqual(rec.record.kind, _vc.VI.KINDS.recipe);
    assert.strictEqual(rec.record.publishedBy, ctx.actor.actorId);
    assert.strictEqual(rec.record.storeId, ctx.storeId);
  });

  test('thiếu effectiveFrom bị từ chối — không có mặc định để rơi vào', function () {
    var input = validInput();
    delete input.effectiveFrom;
    assertErr(run(_vc.V.PublishRecipeVersion, input), 'VALIDATION');
  });

  test('thiếu deps.versionRegistry bị từ chối', function () {
    var input = validInput();
    delete input.deps;
    assertErr(run(_vc.V.PublishRecipeVersion, input), 'VALIDATION');
  });

  test('recipeId sai loại id bị từ chối', function () {
    var input = validInput(null, { recipeId: ids.newId('item') });
    assertErr(run(_vc.V.PublishRecipeVersion, input), 'VALIDATION');
  });

  test('POS bị chặn — cần MASTER_CONFIGURE', function () {
    var ctx = vcCtx('POS_OPERATOR', 'POS', _vc.NV);
    assertErr(run(_vc.V.PublishRecipeVersion, validInput(), ctx), 'FORBIDDEN');
  });

  test('double-tap cùng (recipeId, storeId, effectiveFrom) là no-op idempotent', function () {
    var store = _vc.PIPE.createInMemoryOperationStore();
    var ctx = vcCtx();
    var input = validInput();
    assertOk(run(_vc.V.PublishRecipeVersion, input, ctx, store));
    assert.strictEqual(assertOk(run(_vc.V.PublishRecipeVersion, input, ctx, store)).replayed, true);
  });

  test('2 publish khác effectiveFrom trên cùng recipeId — cả 2 đều chạy thật (không bị coi là trùng)', function () {
    var store = _vc.PIPE.createInMemoryOperationStore();
    var ctx = vcCtx();
    var registry = vcRegistry();
    var recipeId = ids.newId('recipe');
    var first = assertOk(run(_vc.V.PublishRecipeVersion, validInput(registry, { recipeId: recipeId, effectiveFrom: 1000 }), ctx, store));
    var second = assertOk(run(_vc.V.PublishRecipeVersion, validInput(registry, { recipeId: recipeId, effectiveFrom: 2000 }), ctx, store));
    assert.notStrictEqual(first.replayed, true);
    assert.notStrictEqual(second.replayed, true);
    assert.notStrictEqual(first.plan.domainRecords[0].record.versionId, second.plan.domainRecords[0].record.versionId);
  });

  test('registry publish lỗi (effectiveFrom không tăng) được trả nguyên qua command, không nuốt lỗi', function () {
    var registry = vcRegistry();
    var recipeId = ids.newId('recipe');
    assertOk(run(_vc.V.PublishRecipeVersion, validInput(registry, { recipeId: recipeId, effectiveFrom: 2000 })));
    assertErr(run(_vc.V.PublishRecipeVersion, validInput(registry, { recipeId: recipeId, effectiveFrom: 1000 })), 'PRECONDITION');
  });
});

describe('PublishCostBasis', function () {
  var ids = _vc.ids;

  function validInput(over) {
    return Object.assign({
      itemId: ids.newId('item'), effectiveFrom: 1000, unitCost: 5000,
      deps: { versionRegistry: vcRegistry() }
    }, over || {});
  }

  test('publish giá vốn — kind cost, payload unitCost đúng', function () {
    var out = assertOk(run(_vc.V.PublishCostBasis, validInput()));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.record.kind, _vc.VI.KINDS.cost);
    assert.strictEqual(rec.record.payload.unitCost, 5000);
  });

  test('unitCost âm bị domain function từ chối, command không nới lỏng', function () {
    assertErr(run(_vc.V.PublishCostBasis, validInput({ unitCost: -1 })), 'VALIDATION');
  });
});

describe('PublishPackaging', function () {
  var ids = _vc.ids;

  function validInput(over) {
    return Object.assign({
      effectiveFrom: 1000,
      packaging: { items: [{ itemId: ids.newId('item'), qty: 1 }] },
      deps: { versionRegistry: vcRegistry() }
    }, over || {});
  }

  test('không truyền menuItemId → subjectId mặc định __default__ (preset chung)', function () {
    var out = assertOk(run(_vc.V.PublishPackaging, validInput()));
    assert.strictEqual(out.plan.domainRecords[0].record.subjectId, '__default__');
  });

  test('truyền menuItemId → subjectId là chính món đó', function () {
    var menuItemId = ids.newId('item');
    var out = assertOk(run(_vc.V.PublishPackaging, validInput({ menuItemId: menuItemId })));
    assert.strictEqual(out.plan.domainRecords[0].record.subjectId, menuItemId);
  });
});

describe('PublishYield', function () {
  var ids = _vc.ids;

  function validInput(over) {
    return Object.assign({
      prepItemId: ids.newId('prepItem'), effectiveFrom: 1000, yieldPerBatch: 20,
      deps: { versionRegistry: vcRegistry() }
    }, over || {});
  }

  test('publish yield — kind prepYield đúng', function () {
    var out = assertOk(run(_vc.V.PublishYield, validInput()));
    assert.strictEqual(out.plan.domainRecords[0].record.kind, _vc.VI.KINDS.prepYield);
  });

  test('yieldPerBatch không dương bị từ chối', function () {
    assertErr(run(_vc.V.PublishYield, validInput({ yieldPerBatch: 0 })), 'VALIDATION');
  });
});

describe('PublishPayTerms', function () {
  var ids = _vc.ids;

  function validInput(over) {
    return Object.assign({
      employeeId: ids.newId('employee'), effectiveFrom: 1000, terms: { rate: 25000 },
      deps: { versionRegistry: vcRegistry() }
    }, over || {});
  }

  test('publish pay terms — kind payTerms, otRate mặc định = rate khi không khai', function () {
    var out = assertOk(run(_vc.V.PublishPayTerms, validInput()));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.record.kind, _vc.VI.KINDS.payTerms);
    assert.strictEqual(rec.record.payload.otRate, 25000);
  });

  test('thiếu terms bị từ chối', function () {
    var input = validInput();
    delete input.terms;
    assertErr(run(_vc.V.PublishPayTerms, input), 'VALIDATION');
  });
});

describe('PublishConfig', function () {
  function validInput(over) {
    return Object.assign({
      key: 'finishReviewRatio', effectiveFrom: 1000, value: 0.3,
      deps: { versionRegistry: vcRegistry() }
    }, over || {});
  }

  test('publish config — subjectId là chính key', function () {
    var out = assertOk(run(_vc.V.PublishConfig, validInput()));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.record.kind, _vc.VI.KINDS.config);
    assert.strictEqual(rec.record.subjectId, 'finishReviewRatio');
  });

  test('key sai/không tồn tại trong KEYS bị từ chối', function () {
    assertErr(run(_vc.V.PublishConfig, validInput({ key: 'khongTonTai' })), 'VALIDATION');
  });

  test('value ngoài [min,max] bị domain function từ chối', function () {
    assertErr(run(_vc.V.PublishConfig, validInput({ value: 1.5 })), 'VALIDATION');
  });
});

describe('PublishIceCogs', function () {
  var ids = _vc.ids;

  function validInput(over) {
    return Object.assign({
      effectiveFrom: 1000, enabled: true, itemId: ids.newId('item'), qtyPerCup: 0.1,
      deps: { versionRegistry: vcRegistry() }
    }, over || {});
  }

  test('bật trừ đá COGS — subjectId luôn __default__ (1 cấu hình toàn cửa hàng)', function () {
    var out = assertOk(run(_vc.V.PublishIceCogs, validInput()));
    assert.strictEqual(out.plan.domainRecords[0].record.subjectId, '__default__');
  });

  test('tắt trừ đá COGS — không cần itemId/qtyPerCup', function () {
    var out = assertOk(run(_vc.V.PublishIceCogs, { effectiveFrom: 1000, enabled: false, deps: { versionRegistry: vcRegistry() } }));
    assert.strictEqual(out.plan.domainRecords[0].record.payload.enabled, false);
  });

  test('bật mà thiếu qtyPerCup bị domain function từ chối', function () {
    var input = validInput();
    delete input.qtyPerCup;
    assertErr(run(_vc.V.PublishIceCogs, input), 'VALIDATION');
  });
});

describe('bootstrap/runtime — 7 Publish* đăng ký đủ trong COMMANDS', function () {
  test('registeredCommands() liệt kê đủ 7 lệnh CP-VersionedInput', function () {
    var BOOT = GIEO.require('bootstrap/runtime');
    var names = Object.keys(BOOT.COMMANDS);
    ['PublishRecipeVersion', 'PublishCostBasis', 'PublishPackaging', 'PublishYield',
      'PublishPayTerms', 'PublishConfig', 'PublishIceCogs'].forEach(function (n) {
      assert.ok(names.indexOf(n) !== -1, 'thiếu đăng ký: ' + n);
    });
  });
});
