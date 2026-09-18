/**
 * Kho — danh mục cấu hình đơn giản (`commands/kho-config.js`), 2026-09-18.
 * Chỉ đạo chủ quán (xem header kho-config.js): "chỉ cần có chỗ lưu và app
 * pos đọc là được, không phải core" — nên các command này CHỈ cần kiểm:
 * quyền MASTER_CONFIGURE, idempotency (editRef), và domainRecord đúng loại/
 * đúng field. Không cần test FIFO/COGS vì các command này không chạm tới.
 */

var _kc = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    PIPE: GIEO.require('commands/pipeline'),
    KC: GIEO.require('commands/kho-config'),
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

function kcCtx(role, source, actorId) {
  var day = assertOk(_kc.BD.openDay({
    storeId: _kc.STORE, dateKey: '2026-03-10', actorId: _kc.BOSS,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _kc.CLK.createClock()
  }));
  var actor = assertOk(_kc.ACCESS.createActor({
    actorId: actorId || _kc.BOSS, role: role || 'QUANLY_ADMIN',
    source: source || 'QUANLY', stores: [_kc.STORE]
  }));
  return assertOk(_kc.CTXL.createContext({
    organizationId: _kc.ORG, storeId: _kc.STORE, actor: actor, source: source || 'QUANLY', businessDay: day
  }));
}

function kcRun(cmd, input, ctx, store) {
  return _kc.PIPE.run(cmd, input, ctx || kcCtx(), {
    operationStore: store || _kc.PIPE.createInMemoryOperationStore()
  });
}

describe('Save* — danh mục cấu hình Kho (vị trí/lý do hao hụt/dụng cụ/refill/checklist/topping)', function () {
  test('SaveStorageLocation — tạo mới, domainRecord đúng loại, active mặc định true', function () {
    var id = _kc.ids.newId('item');
    var out = assertOk(kcRun(_kc.KC.SaveStorageLocation, {
      id: id, editRef: 'create', name: 'Kho lạnh', type: 'kho lạnh'
    }));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.type, 'storageLocation');
    assert.strictEqual(rec.record.id, id);
    assert.strictEqual(rec.record.name, 'Kho lạnh');
    assert.strictEqual(rec.record.active, true);
  });

  test('thiếu id hợp lệ hoặc editRef thì VALIDATION — chống lưu đúp không tên', function () {
    assertErr(kcRun(_kc.KC.SaveStorageLocation, { editRef: 'create', name: 'X' }), 'VALIDATION');
    assertErr(kcRun(_kc.KC.SaveStorageLocation, { id: _kc.ids.newId('item'), name: 'X' }), 'VALIDATION');
  });

  test('thiếu field bắt buộc riêng của từng loại thì VALIDATION (SaveWasteReason cần label)', function () {
    assertErr(kcRun(_kc.KC.SaveWasteReason, {
      id: _kc.ids.newId('item'), editRef: 'create'
    }), 'VALIDATION');
  });

  test('sửa lại (active:false) = xoá mềm — §2.3a không âm thầm mất dữ liệu, vẫn còn record để bật lại', function () {
    var id = _kc.ids.newId('item');
    assertOk(kcRun(_kc.KC.SaveWasteReason, { id: id, editRef: 'create', label: 'Đổ bỏ' }));
    var archived = assertOk(kcRun(_kc.KC.SaveWasteReason, {
      id: id, editRef: 'archive1', label: 'Đổ bỏ', active: false
    }));
    assert.strictEqual(archived.plan.domainRecords[0].record.active, false);
    var restored = assertOk(kcRun(_kc.KC.SaveWasteReason, {
      id: id, editRef: 'restore1', label: 'Đổ bỏ', active: true
    }));
    assert.strictEqual(restored.plan.domainRecords[0].record.active, true);
  });

  test('lưu lặp lại cùng editRef là no-op idempotent (chạm hai lần không ra hai bản ghi)', function () {
    var store = _kc.PIPE.createInMemoryOperationStore();
    var ctx = kcCtx();
    var id = _kc.ids.newId('item');
    var input = { id: id, editRef: 'e1', name: 'Kho khô' };
    assertOk(kcRun(_kc.KC.SaveStorageLocation, input, ctx, store));
    var replay = assertOk(kcRun(_kc.KC.SaveStorageLocation, input, ctx, store));
    assert.strictEqual(replay.replayed, true);
  });

  test('SaveRefillRule cần itemId hợp lệ (branded id), không nhận chuỗi bất kỳ', function () {
    assertErr(kcRun(_kc.KC.SaveRefillRule, {
      id: _kc.ids.newId('item'), editRef: 'create', itemId: 'khong-phai-id'
    }), 'VALIDATION');
    var itemId = _kc.ids.newId('item');
    var out = assertOk(kcRun(_kc.KC.SaveRefillRule, {
      id: _kc.ids.newId('item'), editRef: 'create', itemId: itemId, targetBase: 5000
    }));
    assert.strictEqual(out.plan.domainRecords[0].record.itemId, itemId);
  });

  test('SaveChecklistItem cần phase là open hoặc close', function () {
    assertErr(kcRun(_kc.KC.SaveChecklistItem, {
      id: _kc.ids.newId('item'), editRef: 'create', label: 'Lau quầy', phase: 'giua-ca'
    }), 'VALIDATION');
    var out = assertOk(kcRun(_kc.KC.SaveChecklistItem, {
      id: _kc.ids.newId('item'), editRef: 'create', label: 'Lau quầy', phase: 'open', blocking: true
    }));
    assert.strictEqual(out.plan.domainRecords[0].record.phase, 'open');
    assert.strictEqual(out.plan.domainRecords[0].record.blocking, true);
  });

  test('POS_OPERATOR không sửa được danh mục Kho — quyền MASTER_CONFIGURE, cùng mức catalog', function () {
    var ctx = kcCtx('POS_OPERATOR', 'POS', _kc.NV);
    assertErr(kcRun(_kc.KC.SaveVessel, {
      id: _kc.ids.newId('item'), editRef: 'create', name: 'Ly nhựa'
    }, ctx), 'FORBIDDEN');
  });

  test('STORE_MANAGER (REVIEW_APPROVE_CORRECT) cũng không đủ quyền — cấu hình gốc chỉ chủ quán mới sửa', function () {
    var ctx = kcCtx('STORE_MANAGER', 'POS', _kc.NV);
    assertErr(kcRun(_kc.KC.SaveToppingRecipe, {
      id: _kc.ids.newId('item'), editRef: 'create', toppingName: 'Trân châu'
    }, ctx), 'FORBIDDEN');
  });
});

describe('CreatePurchaseOrder / CancelPurchaseOrder (kho:po — legacy renderKhoPO)', function () {
  test('tạo đơn — status pending, giữ nguyên lines do caller cấp', function () {
    var poId = _kc.ids.newId('item');
    var out = assertOk(kcRun(_kc.KC.CreatePurchaseOrder, {
      purchaseOrderId: poId, supplier: 'Vựa trái cây A', lines: [{ label: 'Đường 10kg' }]
    }));
    var rec = out.plan.domainRecords[0];
    assert.strictEqual(rec.type, 'purchaseOrder');
    assert.strictEqual(rec.record.status, 'pending');
    assert.strictEqual(rec.record.supplier, 'Vựa trái cây A');
    assert.strictEqual(rec.record.lines.length, 1);
  });

  test('thiếu supplier hoặc purchaseOrderId thì VALIDATION', function () {
    assertErr(kcRun(_kc.KC.CreatePurchaseOrder, { purchaseOrderId: _kc.ids.newId('item') }), 'VALIDATION');
    assertErr(kcRun(_kc.KC.CreatePurchaseOrder, { supplier: 'A' }), 'VALIDATION');
  });

  test('huỷ đơn — cần input.purchaseOrder denormalized (không tự tra kho), status thành cancelled', function () {
    var poId = _kc.ids.newId('item');
    var created = assertOk(kcRun(_kc.KC.CreatePurchaseOrder, {
      purchaseOrderId: poId, supplier: 'Vựa trái cây A'
    })).plan.domainRecords[0].record;
    var cancelled = assertOk(kcRun(_kc.KC.CancelPurchaseOrder, {
      purchaseOrderId: poId, purchaseOrder: created
    }));
    assert.strictEqual(cancelled.plan.domainRecords[0].record.status, 'cancelled');
    assert.strictEqual(cancelled.plan.domainRecords[0].record.supplier, 'Vựa trái cây A');
  });

  test('huỷ đơn mà thiếu input.purchaseOrder thì VALIDATION — không tự đoán record cũ', function () {
    assertErr(kcRun(_kc.KC.CancelPurchaseOrder, { purchaseOrderId: _kc.ids.newId('item') }), 'VALIDATION');
  });

  test('POS_OPERATOR không tạo/huỷ được đơn đặt hàng', function () {
    var ctx = kcCtx('POS_OPERATOR', 'POS', _kc.NV);
    assertErr(kcRun(_kc.KC.CreatePurchaseOrder, {
      purchaseOrderId: _kc.ids.newId('item'), supplier: 'A'
    }, ctx), 'FORBIDDEN');
  });
});
