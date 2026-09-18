/**
 * commands/finance — RecordExpense: POS ghi tại quầy, QUANLY duyệt.
 * Nguồn: `finance/expense.js` (domain thuần có sẵn) + `posgieo.html` cũ
 * (`expenses_gieogieo`, status:'pending_review', baseType:'cash' trừ quỹ).
 */

var _fc = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    FIN: GIEO.require('commands/finance'),
    SHIFT: GIEO.require('commands/shift'),
    PIPE: GIEO.require('commands/pipeline'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    BOOT: GIEO.require('bootstrap/runtime'),
    ORG: ids.deterministicId('org', ['gieo-fin']),
    STORE: ids.deterministicId('store', ['main']),
    NV: ids.deterministicId('actor', ['nv01']),
    QL: ids.deterministicId('actor', ['ql01'])
  };
})();

var NOW = new Date(2026, 2, 10, 9).getTime();

function ctxFor(source, actorId) {
  var clock = _fc.CLK.createClock({ now: function () { return NOW; } });
  var day = assertOk(_fc.BD.openDay({
    storeId: _fc.STORE, dateKey: '2026-03-10', actorId: _fc.QL, at: NOW - 1000, clock: clock
  }));
  var actor = assertOk(_fc.ACCESS.createActor({
    actorId: actorId, role: source === 'QUANLY' ? 'QUANLY_ADMIN' : 'POS_OPERATOR',
    source: source, stores: [_fc.STORE]
  }));
  return assertOk(_fc.CTXL.createContext({
    organizationId: _fc.ORG, storeId: _fc.STORE, actor: actor, source: source,
    businessDay: day, clock: clock
  }));
}

function openedSegment() {
  return assertOk(_fc.SHIFT.openSegment({
    storeId: _fc.STORE, businessDate: '2026-03-10', seq: 1,
    startCash: 500000, actorId: _fc.NV, at: NOW - 5000
  }));
}

function run(command, input, ctx, store) {
  return _fc.PIPE.run(command, input, ctx, {
    operationStore: store || _fc.PIPE.createInMemoryOperationStore()
  });
}

describe('commands/finance — RecordExpense', function () {
  var FIN = _fc.FIN;

  test('runtime đăng ký RecordExpense', function () {
    var names = _fc.BOOT.createRuntime({ mode: _fc.BOOT.MODE.READ_ONLY }).registeredCommands();
    assert.ok(names.indexOf('RecordExpense') !== -1);
  });

  test('POS ghi chi phí tiền mặt: CHỜ DUYỆT + trừ đúng quỹ đang mở', function () {
    var seg = openedSegment();
    var out = assertOk(run(FIN.RecordExpense, {
      expenseRef: 'exp-1', categoryId: 'Mua đá', amount: 40000,
      paymentMethod: 'CASH', note: 'Mua 2 cây đá', cashSegment: seg
    }, ctxFor('POS', _fc.NV)));

    var expense = out.plan.domainRecords.filter(function (r) { return r.type === 'expense'; })[0].record;
    assert.strictEqual(expense.status, 'PENDING_APPROVAL', 'POS ghi không được tự thành số thật — đúng hành vi legacy pending_review');
    assert.strictEqual(expense.amount, 40000);
    assert.strictEqual(expense.categoryId, 'Mua đá');

    var segAfter = out.plan.domainRecords.filter(function (r) { return r.type === 'cashSegment'; })[0].record;
    assert.strictEqual(segAfter.cashOut, 40000, 'chi tiền mặt phải trừ quỹ NGAY, không đợi duyệt — tiền đã rời tủ là sự thật vật lý');
  });

  test('QUANLY tự ghi thì vào thẳng ACTUAL — không cần tự duyệt cho mình', function () {
    var out = assertOk(run(FIN.RecordExpense, {
      expenseRef: 'exp-2', categoryId: 'Vật tư văn phòng', amount: 200000, paymentMethod: 'BANK'
    }, ctxFor('QUANLY', _fc.QL)));
    var expense = out.plan.domainRecords[0].record;
    assert.strictEqual(expense.status, 'ACTUAL');
  });

  test('chi bằng chuyển khoản KHÔNG đụng vào quỹ tiền mặt', function () {
    var out = assertOk(run(FIN.RecordExpense, {
      expenseRef: 'exp-3', categoryId: 'Ship hàng', amount: 60000, paymentMethod: 'BANK'
    }, ctxFor('POS', _fc.NV)));
    assert.strictEqual(out.plan.domainRecords.filter(function (r) { return r.type === 'cashSegment'; }).length, 0);
  });

  test('chi tiền mặt mà chưa mở ca thì TỪ CHỐI — không có quỹ nào để trừ', function () {
    var r = run(FIN.RecordExpense, {
      expenseRef: 'exp-4', categoryId: 'Phát sinh', amount: 10000, paymentMethod: 'CASH'
    }, ctxFor('POS', _fc.NV));
    assertErr(r, 'PRECONDITION');
  });

  test('thiếu expenseRef thì từ chối — chống ghi đúp khi mất mạng giữa chừng', function () {
    var r = run(FIN.RecordExpense, {
      categoryId: 'Phát sinh', amount: 10000, paymentMethod: 'BANK'
    }, ctxFor('POS', _fc.NV));
    assertErr(r, 'VALIDATION');
  });

  test('paymentMethod phải là CASH hoặc BANK, không được suy đoán', function () {
    var r = run(FIN.RecordExpense, {
      expenseRef: 'exp-5', categoryId: 'Phát sinh', amount: 10000, paymentMethod: 'MOMO'
    }, ctxFor('POS', _fc.NV));
    assertErr(r, 'VALIDATION');
  });

  test('ghi lặp cùng expenseRef là no-op — không cộng đúp cả sổ chi phí lẫn quỹ', function () {
    var store = _fc.PIPE.createInMemoryOperationStore();
    var ctx = ctxFor('POS', _fc.NV);
    var seg = openedSegment();
    var input = {
      expenseRef: 'exp-6', categoryId: 'Mua đá', amount: 25000, paymentMethod: 'CASH', cashSegment: seg
    };
    assertOk(run(FIN.RecordExpense, input, ctx, store));
    var again = assertOk(run(FIN.RecordExpense, input, ctx, store));
    assert.strictEqual(again.replayed, true);
  });

  test('nature mặc định VARIABLE — chi phát sinh tại quầy không phải chi phí cố định', function () {
    var out = assertOk(run(FIN.RecordExpense, {
      expenseRef: 'exp-7', categoryId: 'Phát sinh', amount: 15000, paymentMethod: 'BANK'
    }, ctxFor('POS', _fc.NV)));
    assert.strictEqual(out.plan.domainRecords[0].record.nature, 'VARIABLE');
  });
});
