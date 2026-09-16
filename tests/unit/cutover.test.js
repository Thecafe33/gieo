/**
 * P12 shadow comparison + P13 cutover gate.
 * Contract: GIEO-SYSTEM-REBUILD-PLAN.md §16, §17.
 */
var _co = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    SH: GIEO.require('bootstrap/shadow-compare'),
    CUT: GIEO.require('bootstrap/cutover'),
    BOSS: ids.deterministicId('actor', ['boss'])
  };
})();

var MONEY = [
  { name: 'total', material: true },
  { name: 'cogs', material: true, tolerance: 1 },
  { name: 'note', material: false }
];

describe('P12 — shadow comparison', function () {
  function cmp(over) {
    return _co.SH.compare(Object.assign({
      domain: 'SALE', scenario: 'normal', fields: MONEY,
      oldResult: { total: 100000, cogs: 30000, note: 'a' },
      newResult: { total: 100000, cogs: 30000, note: 'a' },
      at: 1000
    }, over || {}));
  }

  test('khớp hết thì MATCH, không lệch', function () {
    var r = assertOk(cmp());
    assert.strictEqual(r.status, 'MATCH');
    assert.strictEqual(r.severity, 'NONE');
    assert.strictEqual(r.diffs.length, 0);
  });

  test('lệch tiền là MATERIAL và mặc định UNEXPLAINED', function () {
    var r = assertOk(cmp({ newResult: { total: 95000, cogs: 30000, note: 'a' } }));
    assert.strictEqual(r.severity, 'MATERIAL');
    assert.strictEqual(r.status, 'UNEXPLAINED');
    assert.strictEqual(r.diffs[0].delta, -5000);
  });

  test('lệch trong dung sai thì KHÔNG tính là lệch', function () {
    var r = assertOk(cmp({ newResult: { total: 100000, cogs: 30001, note: 'a' } }));
    assert.strictEqual(r.status, 'MATCH');
  });

  test('lệch ở trường mô tả là IMMATERIAL, vẫn ghi lại', function () {
    var r = assertOk(cmp({ newResult: { total: 100000, cogs: 30000, note: 'b' } }));
    assert.strictEqual(r.severity, 'IMMATERIAL');
    assert.strictEqual(r.diffs.length, 1);
  });

  test('cả hai bên đều thiếu trường là MATERIAL — không so được nghĩa là không biết', function () {
    var r = assertOk(cmp({
      oldResult: { cogs: 30000, note: 'a' },
      newResult: { cogs: 30000, note: 'a' }
    }));
    assert.strictEqual(r.diffs[0].kind, 'MISSING_BOTH');
    assert.strictEqual(r.severity, 'MATERIAL');
  });

  test('nhãn "đã giải thích" mà lý do rỗng vẫn là UNEXPLAINED', function () {
    var base = { newResult: { total: 95000, cogs: 30000, note: 'a' } };
    assert.strictEqual(assertOk(cmp(Object.assign({
      explanation: { cause: '   ', actorId: _co.BOSS }
    }, base))).status, 'UNEXPLAINED');
    assert.strictEqual(assertOk(cmp(Object.assign({
      explanation: { cause: 'legacy làm tròn khác' }
    }, base))).status, 'UNEXPLAINED', 'thiếu người đứng tên');
    assert.strictEqual(assertOk(cmp(Object.assign({
      explanation: { cause: 'legacy làm tròn khác', actorId: _co.BOSS }
    }, base))).status, 'EXPLAINED');
  });

  test('không khai trường được so thì TỪ CHỐI', function () {
    assertErr(_co.SH.compare({ domain: 'SALE', scenario: 'normal', oldResult: {}, newResult: {} }), 'VALIDATION');
  });

  test('domain/scenario ngoài ma trận §16 bị từ chối', function () {
    assertErr(cmp({ domain: 'LINH_TINH' }), 'VALIDATION');
    assertErr(cmp({ scenario: 'chay-thu' }), 'VALIDATION');
  });
});

describe('P12 — cổng, mặc định đóng', function () {
  function fullRun(over) {
    var run = _co.SH.createRun({ runtimeMode: 'SHADOW' });
    _co.SH.DOMAINS.forEach(function (d) {
      _co.SH.SCENARIOS.forEach(function (s) {
        run.record(Object.assign({
          domain: d, scenario: s, fields: MONEY,
          oldResult: { total: 1, cogs: 1, note: 'x' },
          newResult: { total: 1, cogs: 1, note: 'x' },
          at: 1000
        }, over || {}));
      });
    });
    return run;
  }

  test('KHÔNG chạy được shadow trên runtime WRITE', function () {
    assert.throws(function () { _co.SH.createRun({ runtimeMode: 'WRITE' }); },
      /sole writer/);
  });

  test('sổ trắng KHÔNG phải là đạt — thiếu ô là FAIL', function () {
    var run = _co.SH.createRun({ runtimeMode: 'SHADOW' });
    var g = run.gate();
    assertErr(g, 'PRECONDITION');
    assert.strictEqual(g.error.detail.blockers[0].code, 'MATRIX_INCOMPLETE');
    assert.strictEqual(run.coverage().run, 0);
  });

  test('chạy đủ ma trận và khớp hết thì PASS', function () {
    var run = fullRun();
    var g = assertOk(run.gate());
    assert.strictEqual(g.cellsRun, _co.SH.DOMAINS.length * _co.SH.SCENARIOS.length);
    assert.strictEqual(run.coverage().missing, 0);
  });

  test('còn một ô lệch vật chất chưa giải thích thì CHẶN', function () {
    var run = fullRun();
    run.record({
      domain: 'FIFO', scenario: 'concurrent', fields: MONEY,
      oldResult: { total: 100, cogs: 1, note: 'x' },
      newResult: { total: 90, cogs: 1, note: 'x' }, at: 2000
    });
    var g = run.gate();
    assertErr(g, 'PRECONDITION');
    assert.strictEqual(g.error.detail.blockers[0].code, 'UNEXPLAINED_MATERIAL_DIFF');
  });

  test('chạy lại tới khi may mắn khớp KHÔNG xoá được kết quả xấu', function () {
    var run = fullRun();
    run.record({
      domain: 'FIFO', scenario: 'retry', fields: MONEY,
      oldResult: { total: 100, cogs: 1, note: 'x' },
      newResult: { total: 90, cogs: 1, note: 'x' }, at: 2000
    });
    /* Lần sau khớp — nhưng ô vẫn giữ kết quả xấu nhất. */
    run.record({
      domain: 'FIFO', scenario: 'retry', fields: MONEY,
      oldResult: { total: 100, cogs: 1, note: 'x' },
      newResult: { total: 100, cogs: 1, note: 'x' }, at: 3000
    });
    assert.strictEqual(run.cell('FIFO', 'retry').status, 'UNEXPLAINED');
    assertErr(run.gate(), 'PRECONDITION');
  });

  test('lệch đã giải thích đủ lý do + người thì không chặn cổng', function () {
    var run = fullRun();
    run.record({
      domain: 'COGS', scenario: 'historical-read', fields: MONEY,
      oldResult: { total: 100, cogs: 50, note: 'x' },
      newResult: { total: 100, cogs: 44, note: 'x' }, at: 2000,
      explanation: { cause: 'legacy chưa từng có COGS thực tế', actorId: _co.BOSS }
    });
    var g = assertOk(run.gate());
    assert.ok(g.explained >= 1);
  });
});

describe('P13 — cutover', function () {
  function ready(opts) {
    var c = _co.CUT.createCutover(opts || {});
    _co.CUT.REQUIRED_PHASES.forEach(function (p) {
      c.recordPhase({ phase: p, evidence: 'suite-' + p, actorId: _co.BOSS, at: 100 });
    });
    return c;
  }
  var act = { actorId: _co.BOSS, at: 1000 };
  var goodReport = { report: { unresolved: [] }, actorId: _co.BOSS, at: 1100 };

  test('đánh dấu phase PASS mà không có bằng chứng thì bị từ chối', function () {
    var c = _co.CUT.createCutover();
    assertErr(c.recordPhase({ phase: 'P3', actorId: _co.BOSS, at: 1 }), 'VALIDATION');
    assertErr(c.recordPhase({ phase: 'P3', evidence: '  ', actorId: _co.BOSS, at: 1 }), 'VALIDATION');
  });

  test('thiếu bất kỳ phase nào thì KHÔNG dừng được hệ cũ', function () {
    var c = _co.CUT.createCutover();
    c.recordPhase({ phase: 'P0', evidence: 'x', actorId: _co.BOSS, at: 1 });
    var out = c.stopOldWriter(act);
    assertErr(out, 'PRECONDITION');
    assert.strictEqual(out.error.detail.missing.length, 12);
  });

  test('không có bước nào cho phép cả hai cùng ghi', function () {
    Object.keys(_co.CUT.WRITER_AT).forEach(function (step) {
      var w = _co.CUT.WRITER_AT[step];
      assert.ok(['OLD', 'NONE', 'NEW'].indexOf(w) !== -1, step + ' có writer lạ: ' + w);
    });
    /* Không tồn tại giá trị nào nghĩa là "cả hai". */
    assert.deepStrictEqual(Object.keys(_co.CUT.WRITER).sort(), ['NEW', 'NONE', 'OLD']);
  });

  test('trình tự đúng: dừng cũ → đối chiếu → hệ mới sole writer', function () {
    var c = ready();
    assert.strictEqual(c.state().writer, 'OLD');
    assert.strictEqual(c.runtimeMode(), 'READ_ONLY');

    assertOk(c.stopOldWriter(act));
    assert.strictEqual(c.state().writer, 'NONE', 'giữa 2 bước KHÔNG ai được ghi');

    assertOk(c.finalReconciliation(goodReport));
    /* Vẫn chưa ai ghi cho tới khi chuyển thật. */
    assert.strictEqual(c.state().writer, 'NONE');
    assert.strictEqual(c.runtimeMode(), 'READ_ONLY');

    var out = assertOk(c.newSoleWriter({ actorId: _co.BOSS, at: 1200 }));
    assert.strictEqual(out.writer, 'NEW');
    assert.strictEqual(out.oldSystemRetained, true);
    assert.strictEqual(c.runtimeMode(), 'WRITE');
  });

  test('không nhảy cóc bước', function () {
    var c = ready();
    assertErr(c.finalReconciliation(goodReport), 'PRECONDITION');
    assertErr(c.newSoleWriter(act), 'PRECONDITION');
  });

  test('còn chênh lệch chưa giải quyết thì KHÔNG cutover', function () {
    var c = ready();
    assertOk(c.stopOldWriter(act));
    var out = c.finalReconciliation({
      report: { unresolved: [{ cell: 'FIFO|concurrent' }] }, actorId: _co.BOSS, at: 1100
    });
    assertErr(out, 'PRECONDITION');
    assert.strictEqual(c.state().step, 'OLD_WRITER_STOPPED');
  });

  test('cutover chỉ chạy MỘT lần', function () {
    var c = ready();
    assertOk(c.stopOldWriter(act));
    assertOk(c.finalReconciliation(goodReport));
    assertOk(c.newSoleWriter({ actorId: _co.BOSS, at: 1200 }));
    assertErr(c.newSoleWriter({ actorId: _co.BOSS, at: 1300 }), 'CONFLICT');
  });

  test('rollback trong cửa sổ được, quá hạn thì không', function () {
    var c = ready({ rollbackWindowMs: 1000 });
    assertOk(c.stopOldWriter(act));
    assertOk(c.finalReconciliation(goodReport));
    assertOk(c.newSoleWriter({ actorId: _co.BOSS, at: 2000 }));

    assertErr(c.rollback({ actorId: _co.BOSS, at: 2500 }), 'VALIDATION');

    var late = _co.CUT.createCutover({ rollbackWindowMs: 1000 });
    _co.CUT.REQUIRED_PHASES.forEach(function (p) {
      late.recordPhase({ phase: p, evidence: 'x', actorId: _co.BOSS, at: 1 });
    });
    late.stopOldWriter(act);
    late.finalReconciliation(goodReport);
    late.newSoleWriter({ actorId: _co.BOSS, at: 2000 });
    assertErr(late.rollback({ actorId: _co.BOSS, at: 9999, reason: 'muộn' }), 'PRECONDITION');

    var out = assertOk(c.rollback({ actorId: _co.BOSS, at: 2500, reason: 'lệch tồn sau 30 phút' }));
    assert.strictEqual(out.writer, 'OLD');
    assert.strictEqual(c.runtimeMode(), 'READ_ONLY', 'quay lui rồi thì hệ mới KHÔNG được ghi nữa');
  });

  test('sau rollback KHÔNG tiếp tục cutover dở', function () {
    var c = ready({ rollbackWindowMs: 5000 });
    assertOk(c.stopOldWriter(act));
    assertOk(c.finalReconciliation(goodReport));
    assertOk(c.newSoleWriter({ actorId: _co.BOSS, at: 2000 }));
    assertOk(c.rollback({ actorId: _co.BOSS, at: 2500, reason: 'lệch tồn' }));
    assertErr(c.newSoleWriter({ actorId: _co.BOSS, at: 2600 }), 'CONFLICT');
  });

  test('mọi bước đều được ghi lại ai làm và lúc nào', function () {
    var c = ready();
    c.stopOldWriter(act);
    c.finalReconciliation(goodReport);
    c.newSoleWriter({ actorId: _co.BOSS, at: 1200 });
    var log = c.state().log;
    assert.deepStrictEqual(log.map(function (l) { return l.action; }),
      ['STOP_OLD_WRITER', 'FINAL_RECONCILIATION', 'NEW_SOLE_WRITER']);
    assert.ok(log.every(function (l) { return l.actorId && typeof l.at === 'number'; }));
  });
});

describe('P13 — runtime lấy quyền ghi TỪ cutover, không đặt bằng tay', function () {
  var BOOT = GIEO.require('bootstrap/runtime');

  function ready(opts) {
    var c = _co.CUT.createCutover(opts || {});
    _co.CUT.REQUIRED_PHASES.forEach(function (p) {
      c.recordPhase({ phase: p, evidence: 'suite-' + p, actorId: _co.BOSS, at: 1 });
    });
    return c;
  }

  test('không được vừa đưa cutover vừa tự đặt mode', function () {
    assert.throws(function () {
      BOOT.createRuntime({ cutover: ready(), mode: BOOT.MODE.WRITE });
    }, /không do lời gọi/);
  });

  test('trước cutover, runtime vẫn chặn mọi mutation', function () {
    var runtime = BOOT.createRuntime({ cutover: ready() });
    assert.strictEqual(runtime.mode, 'READ_ONLY');
    return runtime.command('RecordSale', {}).then(function (out) {
      assertErr(out, 'FORBIDDEN');
    });
  });

  test('mode đổi NGAY khi cutover chuyển bước, không cần dựng lại runtime', function () {
    var c = ready({ rollbackWindowMs: 5000 });
    var runtime = BOOT.createRuntime({ cutover: c });
    assert.strictEqual(runtime.mode, 'READ_ONLY');

    assertOk(c.stopOldWriter({ actorId: _co.BOSS, at: 1000 }));
    assertOk(c.finalReconciliation({ report: { unresolved: [] }, actorId: _co.BOSS, at: 1100 }));
    assert.strictEqual(runtime.mode, 'READ_ONLY', 'chưa chuyển thì vẫn chưa được ghi');

    assertOk(c.newSoleWriter({ actorId: _co.BOSS, at: 1200 }));
    assert.strictEqual(runtime.mode, 'WRITE');

    assertOk(c.rollback({ actorId: _co.BOSS, at: 1300, reason: 'lệch tồn' }));
    assert.strictEqual(runtime.mode, 'READ_ONLY', 'rollback phải có hiệu lực ngay');
  });

  test('rollback rồi thì command bị chặn lại, không cần khởi động lại app', function () {
    var c = ready({ rollbackWindowMs: 5000 });
    var runtime = BOOT.createRuntime({ cutover: c });
    c.stopOldWriter({ actorId: _co.BOSS, at: 1000 });
    c.finalReconciliation({ report: { unresolved: [] }, actorId: _co.BOSS, at: 1100 });
    c.newSoleWriter({ actorId: _co.BOSS, at: 1200 });
    c.rollback({ actorId: _co.BOSS, at: 1300, reason: 'lệch tồn' });
    return runtime.command('RecordSale', {}).then(function (out) {
      assertErr(out, 'FORBIDDEN');
    });
  });
});
