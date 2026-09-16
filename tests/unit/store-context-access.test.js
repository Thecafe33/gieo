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

describe('store-context/business-day', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var clockLib = GIEO.require('shared-kernel/clock');
  var BD = GIEO.require('store-context/business-day');

  var STORE = ids.deterministicId('store', ['main']);
  var QL = ids.deterministicId('actor', ['ql']);
  var clock = clockLib.createClock();
  var T = function (h) { return new Date(2026, 2, 10, h).getTime(); };

  function open(dateKey) {
    return assertOk(BD.openDay({ storeId: STORE, dateKey: dateKey || '2026-03-10', actorId: QL, at: T(7), clock: clock }));
  }

  test('mở ngày làm việc theo dateKey do người mở chỉ định', function () {
    var d = open();
    assert.strictEqual(d.status, 'OPEN');
    assert.strictEqual(d.dateKey, '2026-03-10');
    assert.strictEqual(d.openedBy, QL);
  });

  test('dateKey sai định dạng bị từ chối', function () {
    assertErr(BD.openDay({ storeId: STORE, dateKey: '10/03/2026', actorId: QL, at: T(7), clock: clock }), 'VALIDATION');
  });

  test('chốt ngày cần actor, operationId và thời điểm', function () {
    var d = open();
    assertErr(BD.closeDay(d, { actorId: QL, at: T(23) }), 'VALIDATION');
  });

  test('chốt ngày xong thì khoá — đây là gate chặn bán hàng', function () {
    var d = open();
    var closed = assertOk(BD.closeDay(d, { actorId: QL, operationId: ids.deterministicId('operation', ['close', '1']), at: T(23) }));
    assert.strictEqual(closed.status, 'CLOSED');
    assertErr(BD.assertOperable(closed, 'tạo bill'), 'PRECONDITION');
  });

  test('chốt 2 lần bị chặn', function () {
    var d = open();
    var op = { actorId: QL, operationId: ids.deterministicId('operation', ['close', '2']), at: T(23) };
    var closed = assertOk(BD.closeDay(d, op));
    assertErr(BD.closeDay(closed, op), 'PRECONDITION');
  });

  test('blockingClose: còn việc chưa xong thì không chốt được, và nêu rõ vì sao', function () {
    var d = open();
    var r = BD.closeDay(d, {
      actorId: QL, operationId: ids.deterministicId('operation', ['close', '3']), at: T(23),
      blockers: ['checklist refill chưa xong', 'ca của Linh chưa kết']
    });
    assertErr(r, 'PRECONDITION');
    assert.strictEqual(r.error.detail.blockers.length, 2);
  });

  test('không có tham số nào để bỏ qua blockers', function () {
    var d = open();
    var r = BD.closeDay(d, {
      actorId: QL, operationId: ids.deterministicId('operation', ['close', '4']), at: T(23),
      blockers: ['x'], force: true, ignoreBlockers: true
    });
    assertErr(r, 'PRECONDITION');
  });

  test('chưa mở ngày thì không thao tác được', function () {
    assertErr(BD.assertOperable(null, 'tạo bill'), 'PRECONDITION');
  });

  test('ngày đang mở: tìm được đúng 1', function () {
    var d = open();
    assert.strictEqual(assertOk(BD.findOpenDay([d], STORE)).dateKey, '2026-03-10');
  });

  test('2 ngày cùng mở là CONFLICT, không chọn bừa', function () {
    assertErr(BD.findOpenDay([open('2026-03-10'), open('2026-03-11')], STORE), 'CONFLICT');
  });

  test('không có ngày nào mở thì NOT_FOUND', function () {
    assertErr(BD.findOpenDay([], STORE), 'NOT_FOUND');
  });

  test('đơn bán lúc 0h30 vẫn thuộc ngày làm việc chưa chốt', function () {
    var d = open('2026-03-10');
    /* 0h30 hôm sau theo lịch, nhưng ngày làm việc chưa ai chốt. */
    assertOk(BD.assertOperable(d, 'tạo bill'));
    assert.strictEqual(d.dateKey, '2026-03-10',
      'ngày làm việc không được tự nhảy sang 2026-03-11 chỉ vì đồng hồ qua nửa đêm');
  });
});

describe('store-context/context', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var access = GIEO.require('store-context/access');
  var ctxLib = GIEO.require('store-context/context');
  var clockLib = GIEO.require('shared-kernel/clock');
  var BD = GIEO.require('store-context/business-day');

  var ORG = ids.deterministicId('org', ['gieo']);
  var STORE = ids.deterministicId('store', ['main']);
  var clock = clockLib.createClock();

  function day(storeId) {
    return assertOk(BD.openDay({
      storeId: storeId || STORE, dateKey: '2026-04-07',
      actorId: ids.deterministicId('actor', ['ql']), at: new Date(2026, 3, 7, 7).getTime(), clock: clock
    }));
  }

  function posActor() {
    return assertOk(access.createActor({
      actorId: ids.deterministicId('actor', ['nv01']),
      role: 'POS_OPERATOR', source: 'POS', stores: [STORE]
    }));
  }

  function ctx(extra) {
    return ctxLib.createContext(Object.assign({
      organizationId: ORG, storeId: STORE, actor: posActor(), source: 'POS', businessDay: day()
    }, extra || {}));
  }

  test('context bắt buộc có actor — chặn gốc gap "Bill không lưu actor"', function () {
    assertErr(ctxLib.createContext({
      organizationId: ORG, storeId: STORE, source: 'POS', businessDay: day()
    }), 'VALIDATION');
  });

  test('context bắt buộc có businessDay — không suy ra ngày từ đồng hồ', function () {
    assertErr(ctxLib.createContext({
      organizationId: ORG, storeId: STORE, actor: posActor(), source: 'POS'
    }), 'VALIDATION');
  });

  test('businessDay của store khác bị từ chối', function () {
    assertErr(ctx({ businessDay: day(ids.deterministicId('store', ['khac'])) }), 'VALIDATION');
  });

  test('businessDate lấy từ ngày đang mở, không phải từ clock', function () {
    var c = assertOk(ctx({
      clock: clockLib.createClock({ now: function () { return new Date(2030, 0, 1).getTime(); } })
    }));
    assert.strictEqual(c.businessDate, '2026-04-07', 'businessDate bị đồng hồ lôi đi');
  });

  test('actor.source phải khớp context.source', function () {
    assertErr(ctx({ source: 'QUANLY' }), 'VALIDATION');
  });

  test('auditBase mang đủ trường truy vết (§25)', function () {
    var c = assertOk(ctx({ deviceId: 'may-quay-1' }));
    var a = c.auditBase(ids.deterministicId('operation', ['x']));
    ['operationId', 'actorId', 'source', 'organizationId', 'storeId', 'timestamp', 'businessDate'].forEach(function (k) {
      assert.ok(a[k] !== undefined && a[k] !== null, 'thiếu trường audit: ' + k);
    });
    assert.strictEqual(a.deviceId, 'may-quay-1');
    assert.strictEqual(a.businessDate, '2026-04-07');
  });

  test('ctx.authorize mặc định dùng store của context', function () {
    access.registerCommand('T_CtxSale', { authority: 'EXECUTE', mutates: true, sources: ['POS'] });
    assertOk(assertOk(ctx()).authorize('T_CtxSale'));
  });

  test('ctx.assertOperable chặn khi ngày đã chốt', function () {
    var closed = assertOk(BD.closeDay(day(), {
      actorId: ids.deterministicId('actor', ['ql']),
      operationId: ids.deterministicId('operation', ['close', 'ctx']),
      at: new Date(2026, 3, 7, 23).getTime()
    }));
    var c = assertOk(ctx({ businessDay: closed }));
    assertErr(c.assertOperable('tạo bill'), 'PRECONDITION');
  });

  test('system context dùng cho tiến trình nền (§26)', function () {
    var c = assertOk(ctxLib.createSystemContext({ organizationId: ORG, storeId: STORE, businessDay: day() }));
    assert.strictEqual(c.source, 'SYSTEM');
    assert.strictEqual(c.actor.role, 'SYSTEM_ADMIN');
  });
});
