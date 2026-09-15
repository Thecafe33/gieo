/* shared-kernel — nền tảng, sai ở đây thì mọi layer trên đều sai. */

describe('shared-kernel/ids', function () {
  var ids = GIEO.require('shared-kernel/ids');

  test('id mang sẵn loại, không nhầm lẫn được (invariant #4)', function () {
    var u = ids.newId('unit');
    var b = ids.newId('bill');
    assert.strictEqual(ids.kindOf(u), 'unit');
    assert.strictEqual(ids.isId(u, 'bill'), false);
    assert.strictEqual(ids.isId(b, 'unit'), false);
  });

  test('assertId nổ ngay khi truyền sai loại, không để trôi xuống sâu', function () {
    var billId = ids.newId('bill');
    assert.throws(function () { ids.assertId(billId, 'unit', 'allocate'); }, /cần unitId, nhận được billId/);
  });

  test('deterministicId: cùng input luôn ra cùng id', function () {
    var a = ids.deterministicId('operation', ['sale', 'bill-9', 'item-3']);
    var b = ids.deterministicId('operation', ['sale', 'bill-9', 'item-3']);
    assert.strictEqual(a, b);
  });

  test('deterministicId: input khác thì id khác', function () {
    var a = ids.deterministicId('operation', ['sale', 'bill-9', 'item-3']);
    var b = ids.deterministicId('operation', ['sale', 'bill-9', 'item-4']);
    assert.notStrictEqual(a, b);
  });

  test('deterministicId từ chối part rỗng — id rỗng làm sập idempotency', function () {
    assert.throws(function () { ids.deterministicId('operation', ['sale', '', 'item-3']); }, /không được có phần rỗng/);
    assert.throws(function () { ids.deterministicId('operation', ['sale', null]); }, /không được có phần rỗng/);
  });

  test('newId luôn khác nhau (không dùng cho mutation, nhưng phải duy nhất)', function () {
    var seen = {};
    for (var i = 0; i < 500; i++) {
      var id = ids.newId('unit');
      assert.strictEqual(seen[id], undefined, 'id trùng: ' + id);
      seen[id] = 1;
    }
  });
});

describe('shared-kernel/result', function () {
  var R = GIEO.require('shared-kernel/result');

  test('lỗi không thể nhầm với giá trị 0 (invariant #11)', function () {
    var e = R.err('NOT_FOUND', 'trống');
    assert.strictEqual(R.isOk(e), false);
    assert.strictEqual(e.value, undefined);
    var zero = R.ok(0);
    assert.strictEqual(R.isOk(zero), true);
    assert.strictEqual(zero.value, 0);
  });

  test('chỉ RETRYABLE mới được tự thử lại', function () {
    assert.strictEqual(R.isRetryable(R.err('RETRYABLE', 'mạng')), true);
    assert.strictEqual(R.isRetryable(R.err('MANUAL_REVIEW', 'hỏng giữa chừng')), false);
    assert.strictEqual(R.isRetryable(R.err('VALIDATION', 'sai')), false);
  });

  test('loại lỗi bịa ra bị từ chối', function () {
    assert.throws(function () { R.err('OOPS', 'x'); }, /loại lỗi không hợp lệ/);
  });

  test('chain dừng ở lỗi đầu tiên', function () {
    var calls = 0;
    var r = R.chain(R.err('VALIDATION', 'sai'), function () { calls++; return R.ok(1); });
    assert.strictEqual(calls, 0);
    assert.strictEqual(r.ok, false);
  });

  test('all trả lỗi đầu tiên', function () {
    var r = R.all([R.ok(1), R.err('CONFLICT', 'đụng'), R.err('NOT_FOUND', 'x')]);
    assertErr(r, 'CONFLICT');
  });

  test('unwrap ném lỗi thay vì trả undefined im lặng', function () {
    assert.throws(function () { R.unwrap(R.err('NOT_FOUND', 'trống'), 'test'); }, /NOT_FOUND/);
  });
});

describe('shared-kernel/operation-state', function () {
  var S = GIEO.require('shared-kernel/operation-state');

  test('COMPLETED là trạng thái cuối — chạy lại phải là no-op, không phải làm lại', function () {
    assertErr(S.transition('COMPLETED', 'RUNNING'), 'PRECONDITION');
    assertErr(S.transition('CANCELLED', 'RUNNING'), 'PRECONDITION');
  });

  test('FAILED_RETRYABLE được chạy lại', function () {
    assertOk(S.transition('FAILED_RETRYABLE', 'RUNNING'));
  });

  test('FAILED_MANUAL_REVIEW không tự nhảy về RUNNING bằng đường tự động', function () {
    /* Vẫn cho phép chuyển, nhưng phải là hành động có chủ đích của người dùng;
       phân biệt với RETRYABLE là để máy biết cái nào được tự thử lại. */
    assertOk(S.transition('FAILED_MANUAL_REVIEW', 'RUNNING'));
    assert.strictEqual(S.isTerminal('FAILED_MANUAL_REVIEW'), false);
    assert.strictEqual(S.isTerminal('COMPLETED'), true);
  });

  test('không nhảy thẳng PENDING -> COMPLETED (bỏ qua RUNNING)', function () {
    assertErr(S.transition('PENDING', 'COMPLETED'), 'PRECONDITION');
  });
});

describe('shared-kernel/clock', function () {
  var clockLib = GIEO.require('shared-kernel/clock');

  test('now() tiêm được — test không phụ thuộc giờ thật', function () {
    var c = clockLib.createClock({ now: function () { return Date.UTC(2026, 0, 15, 5, 0, 0); } });
    assert.strictEqual(typeof c.now(), 'number');
    assert.strictEqual(c.businessDate().length, 10);
  });

  test('eachDay liệt kê từng ngày — nền của quy tắc V3', function () {
    var c = clockLib.createClock();
    var from = new Date(2026, 0, 1, 12).getTime();
    var to = new Date(2026, 0, 5, 12).getTime();
    var days = c.eachDay(from, to);
    assert.deepStrictEqual(days, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
  });

  test('eachDay khoảng 1 ngày trả đúng 1 phần tử', function () {
    var c = clockLib.createClock();
    var t = new Date(2026, 5, 9, 8).getTime();
    assert.deepStrictEqual(c.eachDay(t, t), ['2026-06-09']);
  });

  test('eachDay từ chối khoảng ngược', function () {
    var c = clockLib.createClock();
    assert.throws(function () { c.eachDay(2000, 1000); }, /to < from/);
  });

  test('dayStartHour đẩy giờ sớm về ngày hôm trước', function () {
    var c = clockLib.createClock({ dayStartHour: 4 });
    var earlyMorning = new Date(2026, 2, 10, 2, 30).getTime();
    assert.strictEqual(c.businessDate(earlyMorning), '2026-03-09');
    var afternoon = new Date(2026, 2, 10, 14, 0).getTime();
    assert.strictEqual(c.businessDate(afternoon), '2026-03-10');
  });

  test('dayStartHour ngoài 0..23 bị từ chối', function () {
    assert.throws(function () { clockLib.createClock({ dayStartHour: 24 }); }, /0\.\.23/);
  });

  test('monthKey là khoá chốt sổ tháng', function () {
    var c = clockLib.createClock();
    assert.strictEqual(c.monthKey(new Date(2026, 10, 20, 9).getTime()), '2026-11');
  });
});
