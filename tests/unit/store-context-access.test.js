/**
 * Authorization — lõi bảo mật, test kỹ hơn phần còn lại.
 * Contract: POS-QUANLY-PERMISSION-CONTRACT-V1.md §3/§20/§23/§24/§27.
 */

describe('store-context/access', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var access = GIEO.require('store-context/access');
  var R = GIEO.require('shared-kernel/result');

  var STORE_A = ids.deterministicId('store', ['a']);
  var STORE_B = ids.deterministicId('store', ['b']);

  /* Đăng ký command mẫu 1 lần cho cả file — registry là global theo tiến trình. */
  access.registerCommand('T_RecordSale', { authority: 'EXECUTE', mutates: true, sources: ['POS'] });
  access.registerCommand('T_ApproveLostContainer', { authority: 'REVIEW_APPROVE_CORRECT', mutates: true, sources: ['QUANLY'] });
  access.registerCommand('T_PublishRecipeVersion', { authority: 'MASTER_CONFIGURE', mutates: true, sources: ['QUANLY'] });
  access.registerCommand('T_GetPnL', { authority: 'REVIEW_APPROVE_CORRECT', mutates: false });
  access.registerCommand('T_ReconcileAllStores', { authority: 'MASTER_CONFIGURE', mutates: true, crossStore: true });

  function actor(role, source, stores, allRead) {
    return assertOk(access.createActor({
      actorId: ids.deterministicId('actor', [role, source]),
      role: role,
      source: source,
      stores: stores || [STORE_A],
      allStoresRead: !!allRead
    }));
  }

  test('POS operator bán hàng được tại store của mình', function () {
    assertOk(access.authorize(actor('POS_OPERATOR', 'POS'), 'T_RecordSale', STORE_A));
  });

  test('POS operator KHÔNG duyệt được lost (thiếu REVIEW/APPROVE)', function () {
    assertErr(access.authorize(actor('POS_OPERATOR', 'POS'), 'T_ApproveLostContainer', STORE_A), 'FORBIDDEN');
  });

  test('QUANLY operator KHÔNG publish được RecipeVersion (thiếu MASTER)', function () {
    assertErr(access.authorize(actor('QUANLY_OPERATOR', 'QUANLY'), 'T_PublishRecipeVersion', STORE_A), 'FORBIDDEN');
  });

  test('QUANLY admin publish được RecipeVersion', function () {
    assertOk(access.authorize(actor('QUANLY_ADMIN', 'QUANLY'), 'T_PublishRecipeVersion', STORE_A));
  });

  test('QUANLY admin KHÔNG bán hàng được — vai trò không phân cấp tuyến tính', function () {
    assertErr(access.authorize(actor('QUANLY_ADMIN', 'QUANLY'), 'T_RecordSale', STORE_A), 'FORBIDDEN');
  });

  test('STORE_MANAGER giữ cả EXECUTE lẫn REVIEW', function () {
    var m = actor('STORE_MANAGER', 'POS');
    assertOk(access.authorize(m, 'T_RecordSale', STORE_A));
    assert.strictEqual(access.hasAuthority(m, 'REVIEW_APPROVE_CORRECT'), true);
  });

  test('command giới hạn source — QUANLY không gọi được command chỉ dành cho POS', function () {
    var m = actor('STORE_MANAGER', 'QUANLY');
    assertErr(access.authorize(m, 'T_RecordSale', STORE_A), 'FORBIDDEN');
  });

  /* §23 — điểm dễ sai nhất. */
  test('ALL_STORES cho ĐỌC ở store khác', function () {
    var a = actor('QUANLY_ADMIN', 'QUANLY', [STORE_A], true);
    assertOk(access.authorize(a, 'T_GetPnL', STORE_B));
  });

  test('ALL_STORES KHÔNG tự động cho GHI ở store khác (§27 invariant 14)', function () {
    var a = actor('QUANLY_ADMIN', 'QUANLY', [STORE_A], true);
    var r = access.authorize(a, 'T_PublishRecipeVersion', STORE_B);
    assertErr(r, 'FORBIDDEN');
    assert.ok(/ALL_STORES chỉ là phạm vi ĐỌC/.test(r.error.message));
  });

  test('không có ALL_STORES thì đọc store khác cũng bị chặn', function () {
    var a = actor('QUANLY_ADMIN', 'QUANLY', [STORE_A], false);
    assertErr(access.authorize(a, 'T_GetPnL', STORE_B), 'FORBIDDEN');
  });

  /* Fail-closed — §27 invariant 8. */
  test('command chưa đăng ký quyền bị từ chối, không phải được mở', function () {
    var r = access.authorize(actor('SYSTEM_ADMIN', 'SYSTEM'), 'T_KhongTonTai', STORE_A);
    assertErr(r, 'FORBIDDEN');
    assert.ok(/chưa đăng ký quyền/.test(r.error.message));
  });

  test('không có actor thì từ chối', function () {
    assertErr(access.authorize(null, 'T_RecordSale', STORE_A), 'FORBIDDEN');
  });

  test('thiếu storeId thì từ chối — mọi thao tác phải nêu rõ store', function () {
    assertErr(access.authorize(actor('POS_OPERATOR', 'POS'), 'T_RecordSale', null), 'VALIDATION');
  });

  test('truyền nhầm actorId vào chỗ storeId bị bắt', function () {
    var a = actor('POS_OPERATOR', 'POS');
    assertErr(access.authorize(a, 'T_RecordSale', a.actorId), 'VALIDATION');
  });

  test('command phải khai báo rõ mutates', function () {
    assert.throws(function () {
      access.registerCommand('T_ThieuMutates', { authority: 'EXECUTE' });
    }, /phải khai báo rõ mutates/);
  });

  test('đăng ký trùng tên command bị chặn', function () {
    assert.throws(function () {
      access.registerCommand('T_RecordSale', { authority: 'EXECUTE', mutates: true });
    }, /đăng ký trùng/);
  });

  test('vai trò bịa ra bị từ chối', function () {
    assertErr(access.createActor({
      actorId: ids.newId('actor'), role: 'SIEU_NHAN', source: 'POS', stores: [STORE_A]
    }), 'VALIDATION');
  });

  test('actor.stores phải toàn storeId thật', function () {
    assertErr(access.createActor({
      actorId: ids.newId('actor'), role: 'POS_OPERATOR', source: 'POS', stores: ['store-a']
    }), 'VALIDATION');
  });

  describe('authorizeMany (§23 multi-store)', function () {
    test('command không khai crossStore thì không chạm 2 store cùng lúc', function () {
      var a = actor('QUANLY_ADMIN', 'QUANLY', [STORE_A, STORE_B]);
      assertErr(access.authorizeMany(a, 'T_PublishRecipeVersion', [STORE_A, STORE_B]), 'FORBIDDEN');
    });

    test('crossStore vẫn phải validate TỪNG store', function () {
      var a = actor('QUANLY_ADMIN', 'QUANLY', [STORE_A], true);
      assertErr(access.authorizeMany(a, 'T_ReconcileAllStores', [STORE_A, STORE_B]), 'FORBIDDEN');
    });

    test('crossStore qua khi actor ghi được mọi store đích', function () {
      var a = actor('QUANLY_ADMIN', 'QUANLY', [STORE_A, STORE_B]);
      var out = assertOk(access.authorizeMany(a, 'T_ReconcileAllStores', [STORE_A, STORE_B]));
      assert.strictEqual(out.length, 2);
    });
  });

  test('describeForUi chỉ để hiện/ẩn nút, kết quả khớp authorize', function () {
    var p = actor('POS_OPERATOR', 'POS');
    assert.strictEqual(access.describeForUi(p, 'T_ApproveLostContainer', STORE_A), false);
    assert.strictEqual(R.isOk(access.authorize(p, 'T_ApproveLostContainer', STORE_A)), false);
  });
});

describe('store-context/context', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var access = GIEO.require('store-context/access');
  var ctxLib = GIEO.require('store-context/context');

  var ORG = ids.deterministicId('org', ['gieo']);
  var STORE = ids.deterministicId('store', ['main']);

  function posActor() {
    return assertOk(access.createActor({
      actorId: ids.deterministicId('actor', ['nv01']),
      role: 'POS_OPERATOR', source: 'POS', stores: [STORE]
    }));
  }

  test('context bắt buộc có actor — chặn gốc gap "Bill không lưu actor"', function () {
    assertErr(ctxLib.createContext({ organizationId: ORG, storeId: STORE, source: 'POS' }), 'VALIDATION');
  });

  test('actor.source phải khớp context.source', function () {
    assertErr(ctxLib.createContext({
      organizationId: ORG, storeId: STORE, actor: posActor(), source: 'QUANLY'
    }), 'VALIDATION');
  });

  test('auditBase mang đủ trường truy vết (§25)', function () {
    var ctx = assertOk(ctxLib.createContext({
      organizationId: ORG, storeId: STORE, actor: posActor(), source: 'POS', deviceId: 'may-quay-1'
    }));
    var a = ctx.auditBase(ids.deterministicId('operation', ['x']));
    ['operationId', 'actorId', 'source', 'organizationId', 'storeId', 'timestamp', 'businessDate'].forEach(function (k) {
      assert.ok(a[k] !== undefined && a[k] !== null, 'thiếu trường audit: ' + k);
    });
    assert.strictEqual(a.deviceId, 'may-quay-1');
  });

  test('ctx.authorize mặc định dùng store của context', function () {
    var ctx = assertOk(ctxLib.createContext({
      organizationId: ORG, storeId: STORE, actor: posActor(), source: 'POS'
    }));
    access.registerCommand('T_CtxSale', { authority: 'EXECUTE', mutates: true, sources: ['POS'] });
    assertOk(ctx.authorize('T_CtxSale'));
  });

  test('system context dùng cho tiến trình nền (§26)', function () {
    var ctx = assertOk(ctxLib.createSystemContext({ organizationId: ORG, storeId: STORE }));
    assert.strictEqual(ctx.source, 'SYSTEM');
    assert.strictEqual(ctx.actor.role, 'SYSTEM_ADMIN');
  });

  test('clock tiêm được nên businessDate của context xác định', function () {
    var clockLib = GIEO.require('shared-kernel/clock');
    var fixed = new Date(2026, 3, 7, 10).getTime();
    var ctx = assertOk(ctxLib.createContext({
      organizationId: ORG, storeId: STORE, actor: posActor(), source: 'POS',
      clock: clockLib.createClock({ now: function () { return fixed; } })
    }));
    assert.strictEqual(ctx.businessDate, '2026-04-07');
  });
});
