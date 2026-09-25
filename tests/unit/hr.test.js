/**
 * [0] Identity — Employee + Shift.
 * Chuỗi thật: FIFO-CHAIN-TRACE-PAYROLL-V1.md. Gap: FEATURE-TREE-V1.md §4.6.
 */

describe('hr/employee', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var VI = GIEO.require('compaction/versioned-input');
  var E = GIEO.require('hr/employee');

  var STORE = ids.deterministicId('store', ['main']);
  var BOSS = ids.deterministicId('actor', ['boss']);
  var D = function (y, m, d, h) { return new Date(y, m - 1, d, h || 0).getTime(); };

  test('tạo nhân viên là cấp luôn actorId — không có đường tạo mà thiếu danh tính', function () {
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    assert.ok(ids.isId(e.employeeId, 'employee'));
    assert.ok(ids.isId(e.actorId, 'actor'));
    assert.notStrictEqual(e.employeeId, e.actorId);
  });

  test('role có mặt ngay từ đầu dù legacy chưa có phân quyền thật', function () {
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    assert.strictEqual(typeof e.role, 'string');
  });

  test('nghỉ việc là đóng hồ sơ, không xoá — lịch sử thao tác vẫn trỏ về được', function () {
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    var gone = assertOk(E.terminate(e, D(2026, 6, 1)));
    assert.strictEqual(gone.active, false);
    assert.strictEqual(gone.actorId, e.actorId, 'actorId phải giữ nguyên sau khi nghỉ việc');
  });

  test('isEmployedAt tôn trọng mốc vào/ra', function () {
    var e = assertOk(E.createEmployee({
      name: 'Linh', storeId: STORE, hiredAt: D(2026, 1, 1), terminatedAt: D(2026, 6, 1)
    }));
    assert.strictEqual(E.isEmployedAt(e, D(2025, 12, 31)), false);
    assert.strictEqual(E.isEmployedAt(e, D(2026, 3, 1)), true);
    assert.strictEqual(E.isEmployedAt(e, D(2026, 6, 1)), false);
  });

  test('PayTerms đi qua cơ chế versioning dùng chung, không phải cơ chế riêng', function () {
    var reg = VI.createRegistry();
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    var v = assertOk(E.publishPayTerms(reg, {
      employeeId: e.employeeId, storeId: STORE, effectiveFrom: D(2026, 1, 1),
      terms: { rate: 30000 }, publishedBy: BOSS
    }));
    assert.strictEqual(v.kind, 'payTerms');
    assert.strictEqual(v.payload.otRate, 30000, 'otRate mặc định bằng rate');
    assert.strictEqual(v.payload.otThreshold, 8);
  });

  test('rate âm bị từ chối', function () {
    var reg = VI.createRegistry();
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    assertErr(E.publishPayTerms(reg, {
      employeeId: e.employeeId, storeId: STORE, effectiveFrom: D(2026, 1, 1),
      terms: { rate: -1 }, publishedBy: BOSS
    }), 'VALIDATION');
  });
});

describe('hr/shift', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var VI = GIEO.require('compaction/versioned-input');
  var E = GIEO.require('hr/employee');
  var S = GIEO.require('hr/shift');

  var STORE = ids.deterministicId('store', ['main']);
  var BOSS = ids.deterministicId('actor', ['boss']);
  var D = function (y, m, d, h, mi) { return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };

  function setup(rate) {
    var reg = VI.createRegistry();
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    assertOk(E.publishPayTerms(reg, {
      employeeId: e.employeeId, storeId: STORE, effectiveFrom: D(2026, 1, 1),
      terms: { rate: rate === undefined ? 30000 : rate, otRate: 45000, otThreshold: 8 },
      publishedBy: BOSS
    }));
    return { reg: reg, employee: e };
  }

  function doCheckIn(ctx, at, date) {
    return assertOk(S.checkIn({
      employee: ctx.employee, versionRegistry: ctx.reg,
      at: at, businessDate: date || '2026-03-10'
    }));
  }

  test('check-in snapshot payTerms có hiệu lực tại lúc đó', function () {
    var ctx = setup();
    var sh = doCheckIn(ctx, D(2026, 3, 10, 8));
    assert.ok(sh.payTermsRef, 'thiếu payTermsRef');
    assert.strictEqual(sh.payTermsRef.payload.rate, 30000);
    assert.ok(sh.payTermsRef.versionId);
  });

  test('PR1/§2.3a — chưa công bố PayTerms KHÔNG chặn check-in, chỉ gắn cờ gap', function () {
    var reg = VI.createRegistry();
    var e = assertOk(E.createEmployee({ name: 'Linh', storeId: STORE }));
    var sh = assertOk(S.checkIn({
      employee: e, versionRegistry: reg, at: D(2026, 3, 10, 8), businessDate: '2026-03-10'
    }));
    assert.strictEqual(sh.status, 'OPEN', 'nhân viên phải vào ca được ngay dù thiếu PayTerms');
    assert.strictEqual(sh.payTermsRef, null);
    assert.strictEqual(sh.needsReview, true);
    assert.ok(sh.needsReviewReasons.indexOf('MISSING_PAY_TERMS') !== -1);
  });

  test('shiftId xác định — check-in 2 lần cùng ngày không tạo 2 ca', function () {
    var ctx = setup();
    var a = doCheckIn(ctx, D(2026, 3, 10, 8));
    var b = doCheckIn(ctx, D(2026, 3, 10, 9));
    assert.strictEqual(a.shiftId, b.shiftId);
  });

  test('nhân viên đã nghỉ việc không check-in được', function () {
    var ctx = setup();
    var gone = assertOk(E.terminate(ctx.employee, D(2026, 2, 1)));
    assertErr(S.checkIn({
      employee: gone, versionRegistry: ctx.reg, at: D(2026, 3, 10, 8), businessDate: '2026-03-10'
    }), 'PRECONDITION');
  });

  /* Đây là bug quan trọng nhất của domain này. */
  describe('computeWage KHÔNG bao giờ dùng PayTerms hiện tại (fix §4.6)', function () {
    test('đổi lương giữa tháng không làm trôi lương ca đã chấm', function () {
      var ctx = setup(30000);
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8));
      sh = assertOk(S.checkOut(sh, D(2026, 3, 10, 16)));

      /* Chủ quán tăng lương SAU khi ca đã diễn ra. */
      assertOk(E.publishPayTerms(ctx.reg, {
        employeeId: ctx.employee.employeeId, storeId: STORE, effectiveFrom: D(2026, 3, 20),
        terms: { rate: 99000, otRate: 99000, otThreshold: 8 }, publishedBy: BOSS
      }));

      var w = assertOk(S.computeWage(sh));
      assert.strictEqual(w.amount, 8 * 30000, 'lương ca cũ đã trôi theo giá mới');
    });

    test('kết quả mang theo payTermsVersionId để đọc lại (V4)', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 16)));
      var w = assertOk(S.computeWage(sh));
      assert.strictEqual(w.payTermsVersionId, sh.payTermsRef.versionId);
      assertOk(ctx.reg.getByVersionId(w.payTermsVersionId));
    });

    test('ca thiếu payTermsRef bị từ chối, không lặng lẽ lấy lương hiện tại', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 16)));
      delete sh.payTermsRef;
      assertErr(S.computeWage(sh), 'PRECONDITION');
    });

    test('tính OT theo đúng ngưỡng đã snapshot', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 18)));
      var w = assertOk(S.computeWage(sh));
      assert.strictEqual(w.hours, 10);
      assert.strictEqual(w.normalHours, 8);
      assert.strictEqual(w.otHours, 2);
      assert.strictEqual(w.amount, 8 * 30000 + 2 * 45000);
    });

    test('ca chưa check-out thì không đoán giờ công', function () {
      var ctx = setup();
      assertErr(S.computeWage(doCheckIn(ctx, D(2026, 3, 10, 8))), 'PRECONDITION');
    });
  });

  describe('ca treo qua ngày', function () {
    test('quá ngưỡng thì tự đóng VÀ gắn cờ cần rà — giờ tự đóng là suy đoán', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8));
      var closed = assertOk(S.autoCloseIfStale(sh, D(2026, 3, 11, 9)));
      assert.strictEqual(closed.status, 'CLOSED');
      assert.strictEqual(closed.autoClosed, true);
      assert.strictEqual(closed.needsReview, true);
      assert.ok(closed.needsReviewReasons.indexOf('AUTO_CLOSED') !== -1);
    });

    test('chưa quá ngưỡng thì để nguyên', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8));
      assert.strictEqual(assertOk(S.autoCloseIfStale(sh, D(2026, 3, 10, 15))).status, 'OPEN');
    });

    test('cờ needsReview chảy vào kết quả tính lương, không bị rơi', function () {
      var ctx = setup();
      var closed = assertOk(S.autoCloseIfStale(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 11, 9)));
      assert.strictEqual(assertOk(S.computeWage(closed)).needsReview, true);
    });
  });

  describe('sửa chấm công', function () {
    var REV = {
      actorId: ids.deterministicId('actor', ['ql']),
      operationId: ids.deterministicId('operation', ['revise', 'sh1']),
      reason: 'nhân viên quên bấm ra'
    };

    test('thiếu actor / operationId / lý do đều bị từ chối (legacy thiếu audit ở đúng đây)', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8));
      assertErr(S.reviseShift(sh, { checkedOutAt: D(2026, 3, 10, 17) }, {}), 'VALIDATION');
      assertErr(S.reviseShift(sh, { checkedOutAt: D(2026, 3, 10, 17) },
        { actorId: REV.actorId, operationId: REV.operationId }), 'VALIDATION');
    });

    test('giữ giá trị trước khi sửa — trả lời được "số nào từng đúng"', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 16)));
      var out = assertOk(S.reviseShift(sh, { checkedOutAt: D(2026, 3, 10, 18) }, REV));
      assert.strictEqual(out.shift.revisions.length, 1);
      assert.strictEqual(out.shift.revisions[0].before.checkedOutAt, D(2026, 3, 10, 16));
      assert.strictEqual(out.shift.revisions[0].reason, REV.reason);
    });

    test('sửa ca ĐANG MỞ hôm nay thành đóng thì PHÁT EVENT — không khoá âm thầm 23 actor-gate', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8));
      var out = assertOk(S.reviseShift(
        sh, { checkedOutAt: D(2026, 3, 10, 12) },
        Object.assign({}, REV, { isCurrentBusinessDate: true })
      ));
      assert.strictEqual(out.events.length, 1);
      assert.strictEqual(out.events[0].type, 'EmployeeCheckedInStateChanged');
      assert.strictEqual(out.events[0].checkedIn, false);
      assert.strictEqual(out.events[0].causedByOperationId, REV.operationId);
    });

    test('sửa ca ngày cũ không phát event (không actor-gate nào đang phụ thuộc)', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 16)));
      var out = assertOk(S.reviseShift(sh, { checkedOutAt: D(2026, 3, 10, 17) }, REV));
      assert.strictEqual(out.events.length, 0);
    });

    test('sửa thành giờ ra sớm hơn giờ vào bị chặn', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 16)));
      assertErr(S.reviseShift(sh, { checkedOutAt: D(2026, 3, 10, 6) }, REV), 'VALIDATION');
    });

    test('sửa xong vẫn dùng payTerms đã snapshot, không resolve lại', function () {
      var ctx = setup(30000);
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8)), D(2026, 3, 10, 16)));
      assertOk(E.publishPayTerms(ctx.reg, {
        employeeId: ctx.employee.employeeId, storeId: STORE, effectiveFrom: D(2026, 3, 20),
        terms: { rate: 99000 }, publishedBy: BOSS
      }));
      var out = assertOk(S.reviseShift(sh, { checkedOutAt: D(2026, 3, 10, 17) }, REV));
      assert.strictEqual(assertOk(S.computeWage(out.shift)).amount, 8 * 30000 + 1 * 45000);
    });
  });

  describe('actor-gate isCheckedIn', function () {
    test('ca mở hôm nay = đã check-in', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8), '2026-03-10');
      assert.strictEqual(S.isCheckedIn([sh], ctx.employee.employeeId, '2026-03-10'), true);
    });

    test('ca đã đóng thì không còn tính là đang check-in', function () {
      var ctx = setup();
      var sh = assertOk(S.checkOut(doCheckIn(ctx, D(2026, 3, 10, 8), '2026-03-10'), D(2026, 3, 10, 16)));
      assert.strictEqual(S.isCheckedIn([sh], ctx.employee.employeeId, '2026-03-10'), false);
    });

    test('ca của ngày khác không tính', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8), '2026-03-10');
      assert.strictEqual(S.isCheckedIn([sh], ctx.employee.employeeId, '2026-03-11'), false);
    });

    test('ca của người khác không tính', function () {
      var ctx = setup();
      var sh = doCheckIn(ctx, D(2026, 3, 10, 8), '2026-03-10');
      assert.strictEqual(S.isCheckedIn([sh], ids.newId('employee'), '2026-03-10'), false);
    });
  });
});
