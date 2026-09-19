/**
 * CP11 — `commands/catalog.js`, tầng ghi cho Menu/Category/Promotion.
 * Chuỗi thật: `NET-CATALOG-PROMOTION-V1.md` CP11. Domain logic thuần
 * (`catalog/menu.js`/`catalog/promotion.js`) đã có test riêng ở
 * `tests/unit/catalog.test.js` — file này chỉ kiểm tầng command mới: quyền
 * QUANLY-only, idempotency, và việc gọi đúng hàm domain bên dưới.
 */

var _cc = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    PIPE: GIEO.require('commands/pipeline'),
    CAT: GIEO.require('commands/catalog'),
    M: GIEO.require('catalog/menu'),
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

function ccCtx(role, source, actorId) {
  var day = assertOk(_cc.BD.openDay({
    storeId: _cc.STORE, dateKey: '2026-03-10', actorId: _cc.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _cc.CLK.createClock()
  }));
  var actor = assertOk(_cc.ACCESS.createActor({
    actorId: actorId || _cc.BOSS, role: role || 'QUANLY_ADMIN',
    source: source || 'QUANLY', stores: [_cc.STORE]
  }));
  return assertOk(_cc.CTXL.createContext({
    organizationId: _cc.ORG, storeId: _cc.STORE, actor: actor, source: source || 'QUANLY', businessDay: day
  }));
}

function run(cmd, input, ctx, store) {
  return _cc.PIPE.run(cmd, input, ctx || ccCtx(), {
    operationStore: store || _cc.PIPE.createInMemoryOperationStore()
  });
}

describe('CreateMenuItem / CreateCategory / CreatePromotion — QUANLY-only, idempotent', function () {
  test('QUANLY_ADMIN tạo món mới — đúng field domain trả về, đúng domainRecord', function () {
    var menuItemId = _cc.ids.newId('item');
    var out = assertOk(run(_cc.CAT.CreateMenuItem, {
      menuItemId: menuItemId, name: 'Trà sữa', prices: { M: 30000, L: 40000 }
    }));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.type, 'menuItem');
    assert.strictEqual(rec.record.menuItemId, menuItemId);
    assert.strictEqual(rec.record.name, 'Trà sữa');
    assert.strictEqual(rec.record.recipeId, null);
  });

  test('tạo lặp lại cùng menuItemId (double-tap) là no-op', function () {
    var store = _cc.PIPE.createInMemoryOperationStore();
    var ctx = ccCtx();
    var input = { menuItemId: _cc.ids.newId('item'), name: 'Cà phê', prices: { M: 25000 } };
    assertOk(run(_cc.CAT.CreateMenuItem, input, ctx, store));
    assert.strictEqual(assertOk(run(_cc.CAT.CreateMenuItem, input, ctx, store)).replayed, true);
  });

  test('thiếu menuItemId (chưa cấp trước) thì từ chối — không tự sinh id ngẫu nhiên trong command', function () {
    assertErr(run(_cc.CAT.CreateMenuItem, { name: 'x', prices: { M: 1 } }), 'VALIDATION');
  });

  test('POS gọi CreateMenuItem bị chặn — enforce đúng ý định "QUANLY only" của header catalog/menu.js', function () {
    var ctx = ccCtx('POS_OPERATOR', 'POS', _cc.NV);
    assertErr(run(_cc.CAT.CreateMenuItem, {
      menuItemId: _cc.ids.newId('item'), name: 'x', prices: { M: 1 }
    }, ctx), 'FORBIDDEN');
  });

  test('QUANLY_OPERATOR (chỉ có REVIEW_APPROVE_CORRECT) cũng bị chặn — cần MASTER_CONFIGURE', function () {
    var ctx = ccCtx('QUANLY_OPERATOR', 'QUANLY', _cc.NV);
    assertErr(run(_cc.CAT.CreateMenuItem, {
      menuItemId: _cc.ids.newId('item'), name: 'x', prices: { M: 1 }
    }, ctx), 'FORBIDDEN');
  });

  test('tạo category — displayOrder bắt buộc do domain function, command không nới lỏng', function () {
    assertErr(run(_cc.CAT.CreateCategory, { categoryId: _cc.ids.newId('item'), name: 'Trà' }), 'VALIDATION');
    var out = assertOk(run(_cc.CAT.CreateCategory, {
      categoryId: _cc.ids.newId('item'), name: 'Trà', displayOrder: 2
    }));
    assert.strictEqual(out.plan.domainRecords[0].type, 'category');
    assert.strictEqual(out.plan.domainRecords[0].record.displayOrder, 2);
  });

  test('tạo promotion — tier bắt buộc do domain function', function () {
    var r = run(_cc.CAT.CreatePromotion, {
      promotionId: _cc.ids.newId('item'), name: 'KM', priority: 1, effect: { type: 'PERCENT_OFF', pct: 10 }
    });
    assertErr(r, 'VALIDATION');
    var out = assertOk(run(_cc.CAT.CreatePromotion, {
      promotionId: _cc.ids.newId('item'), name: 'KM', tier: 'AUTO_EXECUTE', priority: 1,
      effect: { type: 'PERCENT_OFF', pct: 10 }
    }));
    assert.strictEqual(out.plan.domainRecords[0].type, 'promotion');
    assert.strictEqual(out.plan.domainRecords[0].record.tier, 'AUTO_EXECUTE');
  });
});

describe('RenameMenuItem / LinkRecipeToMenuItem / ArchiveMenuItem / RestoreMenuItem', function () {
  function mkItem() {
    return assertOk(_cc.M.createMenuItem({
      menuItemId: _cc.ids.newId('item'), storeId: _cc.STORE, name: 'Trà sữa', prices: { M: 30000 }
    }));
  }

  test('đổi tên — id và recipeId giữ nguyên (không mồ côi), editRef chống sửa đúp', function () {
    var item = mkItem();
    var out = assertOk(run(_cc.CAT.RenameMenuItem, {
      menuItemId: item.menuItemId, editRef: 'edit1', newName: 'Trà sữa trân châu', menuItem: item
    }));
    var renamed = out.plan.domainRecords[0].record;
    assert.strictEqual(renamed.menuItemId, item.menuItemId);
    assert.strictEqual(renamed.name, 'Trà sữa trân châu');
  });

  test('sửa lặp lại cùng editRef là no-op; editRef khác là 1 lần sửa MỚI, không bị coi là trùng', function () {
    var store = _cc.PIPE.createInMemoryOperationStore();
    var ctx = ccCtx();
    var item = mkItem();
    var input1 = { menuItemId: item.menuItemId, editRef: 'e1', newName: 'A', menuItem: item };
    var first = assertOk(run(_cc.CAT.RenameMenuItem, input1, ctx, store));
    assert.strictEqual(assertOk(run(_cc.CAT.RenameMenuItem, input1, ctx, store)).replayed, true);

    var renamedOnce = first.plan.domainRecords[0].record;
    var input2 = { menuItemId: item.menuItemId, editRef: 'e2', newName: 'B', menuItem: renamedOnce };
    var second = assertOk(run(_cc.CAT.RenameMenuItem, input2, ctx, store));
    assert.strictEqual(second.replayed, false);
    assert.strictEqual(second.plan.domainRecords[0].record.name, 'B');
  });

  test('thiếu editRef thì từ chối', function () {
    var item = mkItem();
    assertErr(run(_cc.CAT.RenameMenuItem, { menuItemId: item.menuItemId, newName: 'x', menuItem: item }), 'VALIDATION');
  });

  test('gắn recipe — thao tác độc lập', function () {
    var item = mkItem();
    var recipeId = _cc.ids.newId('recipe');
    var out = assertOk(run(_cc.CAT.LinkRecipeToMenuItem, {
      menuItemId: item.menuItemId, editRef: 'e1', recipeId: recipeId, menuItem: item
    }));
    assert.strictEqual(out.plan.domainRecords[0].record.recipeId, recipeId);
  });

  test('ngưng bán rồi khôi phục — soft-delete qua đúng đường command', function () {
    var item = mkItem();
    var archived = assertOk(run(_cc.CAT.ArchiveMenuItem, {
      menuItemId: item.menuItemId, editRef: 'e1', menuItem: item
    }));
    var archivedItem = archived.plan.domainRecords[0].record;
    assert.strictEqual(archivedItem.archived, true);

    var restored = assertOk(run(_cc.CAT.RestoreMenuItem, {
      menuItemId: item.menuItemId, editRef: 'e2', menuItem: archivedItem
    }));
    assert.strictEqual(restored.plan.domainRecords[0].record.archived, false);
  });

  test('ngưng bán món đã ngưng bán — PRECONDITION xuyên từ domain function, không bị command nuốt lỗi', function () {
    var item = mkItem();
    var archived = assertOk(run(_cc.CAT.ArchiveMenuItem, {
      menuItemId: item.menuItemId, editRef: 'e1', menuItem: item
    })).plan.domainRecords[0].record;
    assertErr(run(_cc.CAT.ArchiveMenuItem, {
      menuItemId: item.menuItemId, editRef: 'e2', menuItem: archived
    }), 'PRECONDITION');
  });

  test('POS không sửa được menu (enforce đúng CP11)', function () {
    var item = mkItem();
    var ctx = ccCtx('POS_OPERATOR', 'POS', _cc.NV);
    assertErr(run(_cc.CAT.RenameMenuItem, {
      menuItemId: item.menuItemId, editRef: 'e1', newName: 'x', menuItem: item
    }, ctx), 'FORBIDDEN');
  });
});
