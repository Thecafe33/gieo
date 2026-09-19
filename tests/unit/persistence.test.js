/**
 * legacy-firebase-adapter (CHỈ ĐỌC) + persistence-firebase (ghi canonical).
 * Contract: LEGACY-FIREBASE-PATH-MAP-V1.md.
 */

var _pf = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    LP: GIEO.require('legacy-firebase-adapter/legacy-paths'),
    MAP: GIEO.require('legacy-firebase-adapter/mappers'),
    CP: GIEO.require('persistence-firebase/canonical-paths'),
    AC: GIEO.require('persistence-firebase/atomic-commit'),
    L: GIEO.require('fifo-core/ledger'),
    R: GIEO.require('shared-kernel/result'),
    CLK: GIEO.require('shared-kernel/clock'),
    ORG: ids.deterministicId('org', ['gieo']),
    STORE: ids.deterministicId('store', ['main'])
  };
})();

/** Context đầy đủ cho test chạm tới pipeline. */
function smokeCtx() {
  var ACCESS = GIEO.require('store-context/access');
  var CTXL = GIEO.require('store-context/context');
  var BD = GIEO.require('store-context/business-day');
  var day = assertOk(BD.openDay({
    storeId: _pf.STORE, dateKey: '2026-03-10',
    actorId: _pf.ids.deterministicId('actor', ['ql']), at: 1000, clock: _pf.CLK.createClock()
  }));
  var actor = assertOk(ACCESS.createActor({
    actorId: _pf.ids.deterministicId('actor', ['nv01']),
    role: 'POS_OPERATOR', source: 'POS', stores: [_pf.STORE]
  }));
  return assertOk(CTXL.createContext({
    organizationId: _pf.ORG, storeId: _pf.STORE, actor: actor, source: 'POS', businessDay: day
  }));
}

var PCTX = {
  organizationId: _pf.ORG,
  storeId: _pf.STORE,
  businessDate: '2026-03-10',
  clock: _pf.CLK.createClock({ now: function () { return 1700000000000; } })
};

describe('legacy-paths — tập trung 1 chỗ, CHỈ ĐỌC', function () {
  var LP = _pf.LP;

  test('mọi path legacy khai ở một nơi, không format chuỗi rải rác', function () {
    assert.strictEqual(LP.get('stockContainers').path, 'stock_containers_gieogieo');
    assert.strictEqual(LP.get('activeUnits').kind, 'RTDB');
    assert.strictEqual(LP.get('stockTransactions').kind, 'FIRESTORE');
  });

  test('path lạ thì nổ ngay, không trả undefined trôi xuống sâu', function () {
    assert.throws(function () { LP.get('khong_ton_tai'); }, /không có path tên/);
  });

  test('bank_confirmations GIỮ NGUYÊN path và được đánh dấu protected', function () {
    assert.strictEqual(LP.get('bankConfirmations').path, 'bank_confirmations');
    assert.strictEqual(LP.isProtected('bankConfirmations'), true);
  });

  test('mọi thao tác ghi bị TỪ CHỐI — hệ thống cũ vẫn chạy production', function () {
    var r = LP.assertReadOnly('set', 'stock_containers_gieogieo');
    assertErr(r, 'FORBIDDEN');
    assert.ok(/CHỈ ĐỌC/.test(r.error.message));
  });

  test('adapter KHÔNG phơi ra hàm ghi nào', function () {
    ['set', 'update', 'write', 'remove', 'push'].forEach(function (m) {
      assert.strictEqual(LP[m], undefined, 'legacy adapter phơi ra hàm ghi: ' + m);
    });
  });

  test('path cố ý không migrate được liệt kê rõ — phân biệt "đã cân nhắc" với "quên"', function () {
    assert.ok(LP.NOT_MIGRATED.indexOf('customers') !== -1);
    assert.ok(LP.NOT_MIGRATED.indexOf('menu_gieogieo') !== -1);
  });
});

describe('mappers — KHÔNG đoán, nói rõ cái gì không biết', function () {
  var MAP = _pf.MAP;

  function container(over) {
    return Object.assign({
      code: 'C-001', itemId: 'sua', status: 'open', baseQty: 1000, unitBase: 400,
      createdAt: 1000, openedAt: 2000, openedBy: 'nv01', receiveRefId: 'R1', supplierId: 'S1'
    }, over || {});
  }

  describe('mapUnit — merge CẢ HAI nguồn như _ueRecomputeCurrentStock', function () {
    test('unit đang mở lấy số dư từ RTDB (live layer)', function () {
      var r = assertOk(MAP.mapUnit({
        container: container(), rtUnit: { unitBase: 350 }, storeId: _pf.STORE
      }));
      assert.strictEqual(r.unit.remainingQty, 350);
    });

    test('2 nguồn LỆCH nhau thì ghi nhận, KHÔNG im lặng chọn một bên', function () {
      var r = assertOk(MAP.mapUnit({
        container: container(), rtUnit: { unitBase: 350 }, storeId: _pf.STORE
      }));
      assert.deepStrictEqual(r.sourceDrift, { firestore: 400, rtdb: 350, difference: -50 });
    });

    test('không lệch thì không báo drift giả', function () {
      var r = assertOk(MAP.mapUnit({
        container: container(), rtUnit: { unitBase: 400 }, storeId: _pf.STORE
      }));
      assert.strictEqual(r.sourceDrift, null);
    });

    test('hũ đã đóng lấy số từ Firestore, không đụng RTDB', function () {
      var r = assertOk(MAP.mapUnit({
        container: container({ status: 'finished', unitBase: 0 }),
        rtUnit: { unitBase: 999 }, storeId: _pf.STORE
      }));
      assert.strictEqual(r.unit.remainingQty, 0);
    });

    test('legacy KHÔNG lưu giá vốn trên container → đánh dấu, KHÔNG bịa số', function () {
      var r = assertOk(MAP.mapUnit({ container: container(), storeId: _pf.STORE }));
      assert.strictEqual(r.unit.costBasis, null, 'mapper bịa ra giá vốn không có thật');
      assert.ok(r.ambiguous.some(function (a) { return a.code === 'NO_COST_BASIS'; }));
      assert.strictEqual(r.unit.needsReview, true);
    });

    test('nợ (unitBase âm) thành field tường minh và gắn cờ rà', function () {
      var r = assertOk(MAP.mapUnit({
        container: container({ unitBase: -80 }), storeId: _pf.STORE
      }));
      assert.strictEqual(r.unit.debt.amount, 80);
      assert.ok(r.ambiguous.some(function (a) { return a.code === 'NEGATIVE_UNIT_BASE'; }));
    });

    test('status legacy lạ thì TỪ CHỐI map, không đoán (invariant #12)', function () {
      assertErr(MAP.mapUnit({
        container: container({ status: 'trang_thai_la' }), storeId: _pf.STORE
      }), 'AMBIGUOUS_LEGACY');
    });

    test('map đủ 6 status legacy sang lifecycle canonical', function () {
      assert.strictEqual(MAP.STATUS_MAP.sealed, 'SEALED');
      assert.strictEqual(MAP.STATUS_MAP.used_up, 'PHYSICALLY_FINISHED');
      assert.strictEqual(MAP.STATUS_MAP.lost, 'LOST');
    });

    test('systemExhaustedAt là null — legacy chỉ suy diễn tạm, không lưu', function () {
      var r = assertOk(MAP.mapUnit({ container: container(), storeId: _pf.STORE }));
      assert.strictEqual(r.unit.systemExhaustedAt, null);
    });

    test('notEmptyChecks map sang physicalReconciliations', function () {
      var r = assertOk(MAP.mapUnit({
        container: container({ notEmptyChecks: [{ at: 5000, by: 'nv01', qty: 350 }] }),
        storeId: _pf.STORE
      }));
      assert.strictEqual(r.unit.physicalReconciliations.length, 1);
      assert.strictEqual(r.unit.physicalReconciliations[0].actual, 350);
    });
  });

  describe('mapLedgerEntry', function () {
    test('quy tắc §5 áp NGAY lúc map — dữ liệu migrate không có ngoại lệ', function () {
      var withUnit = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't1', type: 'consumption', itemId: 'sua', qtyDelta: -100, containerCode: 'C-001' },
        storeId: _pf.STORE, domain: 'raw'
      }));
      assert.strictEqual(withUnit.entry.untrackedPendingDelta, 0);

      var noUnit = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't2', type: 'receiving', itemId: 'sua', qtyDelta: 500 },
        storeId: _pf.STORE, domain: 'raw'
      }));
      assert.strictEqual(noUnit.entry.untrackedPendingDelta, 500);
    });

    test('entry map ra vượt được audit quy tắc §5', function () {
      var e = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't3', type: 'waste', itemId: 'sua', qtyDelta: -50 },
        storeId: _pf.STORE, domain: 'prep'
      }));
      assertOk(_pf.L.auditEntries([e.entry]));
    });

    test('giao dịch không có người thao tác thì đánh dấu', function () {
      var e = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't4', type: 'waste', itemId: 'sua', qtyDelta: -50 },
        storeId: _pf.STORE, domain: 'raw'
      }));
      assert.ok(e.ambiguous.some(function (a) { return a.code === 'NO_ACTOR'; }));
    });

    test('prep và raw gộp chung ledger, phân biệt bằng domain', function () {
      var p = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't5', type: 'waste', itemId: 'tc', qtyDelta: -5 },
        storeId: _pf.STORE, domain: 'prep'
      }));
      assert.strictEqual(p.entry.domain, 'prep');
    });

    test('referenceId suy từ t.referenceId — field thật applyStockTransactionPOS ghi, không phải t.refId', function () {
      var e = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't6', type: 'consumption', itemId: 'sua', qtyDelta: -100, referenceId: 'order-abc' },
        storeId: _pf.STORE, domain: 'raw'
      }));
      assert.strictEqual(e.entry.referenceId, 'order-abc',
        'legacy ghi field referenceId thật — không được suy nhầm ra null');

      var e2 = assertOk(MAP.mapLedgerEntry({
        tx: { id: 't7', type: 'consumption', itemId: 'sua', qtyDelta: -100, refId: 'order-abc' },
        storeId: _pf.STORE, domain: 'raw'
      }));
      assert.strictEqual(e2.entry.referenceId, null,
        'tx legacy không có field referenceId thật — không được suy nhầm từ refId (field không tồn tại trên schema thật)');
    });
  });

  describe('mapRecipe — version giả, đánh dấu rõ là suy ra', function () {
    test('sinh versionId từ updatedAt và đánh dấu legacy-inferred', function () {
      var r = assertOk(MAP.mapRecipe({
        menuRefKey: 'togo:tra-sua',
        recipe: { updatedAt: 1700000000000, M: { sua: 100, tra: 50 } }
      }));
      assert.strictEqual(r.versionSource, 'legacy-inferred');
      assert.strictEqual(r.components.M.length, 2);
    });

    test('NÓI RÕ version này không chứng minh được công thức của bill cũ', function () {
      var r = assertOk(MAP.mapRecipe({
        menuRefKey: 'togo:x', recipe: { updatedAt: 1, M: { sua: 1 } }
      }));
      assert.ok(r.ambiguous.some(function (a) { return a.code === 'NO_RECIPE_VERSION'; }));
      assert.ok(/ảnh chụp lúc migrate/.test(r.ambiguous[0].detail));
    });
  });

  describe('mapBill', function () {
    function order(over) {
      return Object.assign({
        createdAt: 1000, total: 100000, subtotal: 100000,
        itemsArray: [{ id: 'm1', name: 'Trà sữa', size: 'M', qty: 2, price: 50000 }]
      }, over || {});
    }

    test('bill legacy không lưu người bán → đánh dấu (§4.7)', function () {
      var r = assertOk(MAP.mapBill({ order: order(), billId: 'B1', storeId: _pf.STORE }));
      assert.strictEqual(r.bill.soldByActorId, null);
      assert.ok(r.ambiguous.some(function (a) { return a.code === 'NO_ACTOR'; }));
    });

    test('giá đã snapshot trong bill được giữ nguyên — phần legacy làm ĐÚNG', function () {
      var r = assertOk(MAP.mapBill({ order: order(), billId: 'B1', storeId: _pf.STORE }));
      assert.strictEqual(r.bill.lines[0].price, 50000);
    });

    test('appFeePct của legacy được map sang — đường ống P&L theo kênh dùng được ngay', function () {
      var r = assertOk(MAP.mapBill({
        order: order({ isAppSale: true, appName: 'ShopeeFood', appFeePct: 25 }),
        billId: 'B2', storeId: _pf.STORE
      }));
      assert.strictEqual(r.bill.channel.type, 'APP');
      assert.strictEqual(r.bill.channel.feePct, 25);
    });

    test('bán tại quán thì phí kênh = 0', function () {
      var r = assertOk(MAP.mapBill({ order: order(), billId: 'B3', storeId: _pf.STORE }));
      assert.strictEqual(r.bill.channel.type, 'DINE_IN');
      assert.strictEqual(r.bill.channel.feePct, 0);
    });

    test('mang đi nhận diện đúng', function () {
      var r = assertOk(MAP.mapBill({
        order: order({ isToGo: true }), billId: 'B4', storeId: _pf.STORE
      }));
      assert.strictEqual(r.bill.channel.type, 'TO_GO');
    });

    test('customerId suy từ o.phone — field thật trên order legacy, không phải o.customerPhone', function () {
      var r = assertOk(MAP.mapBill({
        order: order({ phone: '0900000000' }), billId: 'B5', storeId: _pf.STORE
      }));
      assert.ok(r.bill.customerId, 'có phone thì phải suy ra được customerId');
      var r2 = assertOk(MAP.mapBill({
        order: order({ customerPhone: '0900000000' }), billId: 'B6', storeId: _pf.STORE
      }));
      assert.strictEqual(r2.bill.customerId, null,
        'order legacy không có field customerPhone thật — không được suy nhầm ra customerId');
    });

    test('legacySource mang đủ dữ liệu chỉ-legacy cho màn LỊCH SỬ BILL (bill/addon/split/thanh toán)', function () {
      var r = assertOk(MAP.mapBill({
        order: order({
          billCode: 'BILL-001', customerName: 'Chị Lan', phone: '0900000000',
          method: 'TIỀN MẶT', cashGiven: 100000, cashChange: 0,
          bankOrderId: null, voucherUsed: 'TEM10', isShip: true,
          splitGroups: [{ method: 'TIỀN MẶT', total: 50000 }],
          addons: [{ seq: 1, itemName: 'Trân châu', at: 2000 }],
          time: '14:32', date: '17/09/2026'
        }), billId: 'B7', storeId: _pf.STORE
      }));
      var ls = r.bill.legacySource;
      assert.strictEqual(ls.billId, 'B7');
      assert.strictEqual(ls.billCode, 'BILL-001');
      assert.strictEqual(ls.customerName, 'Chị Lan');
      assert.strictEqual(ls.phone, '0900000000');
      assert.strictEqual(ls.method, 'TIỀN MẶT');
      assert.strictEqual(ls.cashGiven, 100000);
      assert.strictEqual(ls.cashChange, 0);
      assert.strictEqual(ls.voucherUsed, 'TEM10');
      assert.strictEqual(ls.isShip, true);
      assert.strictEqual(ls.splitGroups.length, 1);
      assert.strictEqual(ls.addons.length, 1);
      assert.strictEqual(ls.time, '14:32');
      assert.strictEqual(ls.date, '17/09/2026');
    });

    test('legacySource: thiếu hết field phụ thì trả null, không throw', function () {
      var r = assertOk(MAP.mapBill({ order: order(), billId: 'B8', storeId: _pf.STORE }));
      var ls = r.bill.legacySource;
      assert.strictEqual(ls.billCode, null);
      assert.strictEqual(ls.splitGroups, null);
      assert.strictEqual(ls.addons, null);
      assert.strictEqual(ls.isShip, false);
    });
  });
});

describe('canonical-paths', function () {
  var CP = _pf.CP;

  test('mọi path mang storeId — không có biến thể bỏ qua phạm vi cửa hàng', function () {
    CP.listNames().forEach(function (name) {
      var r = CP.path(name, PCTX, {
        unitId: 'u1', itemId: 'i1', entryId: 'e1', operationId: 'op1', prepItemId: 'p1',
        prepBatchId: 'pb1', countId: 'c1', reportId: 'r1', id: 'x', recipeId: 'rc1',
        versionId: 'v1', kind: 'cost', subjectId: 's1', businessDate: '2026-03-10',
        billId: 'b1', dateKey: '2026-03-10', seq: '1', period: '2026-03', shiftId: 'sh1',
        customerId: 'cu1', alertId: 'a1', addonSeq: '1'
      });
      assert.strictEqual(_pf.R.isOk(r), true, name + ' không dựng được');
      assert.ok(r.value.path.indexOf(_pf.STORE) !== -1, name + ' thiếu storeId');
    });
  });

  test('thiếu org/store thì TỪ CHỐI dựng path', function () {
    assertErr(CP.path('unit', { storeId: _pf.STORE }, { unitId: 'u1' }), 'VALIDATION');
    assertErr(CP.path('unit', { organizationId: _pf.ORG }, { unitId: 'u1' }), 'VALIDATION');
  });

  test('RTDB vẫn là live layer — không chuyển hết sang Firestore', function () {
    assert.strictEqual(assertOk(CP.path('unitLive', PCTX, { itemId: 'i1', unitId: 'u1' })).kind, 'RTDB');
    assert.strictEqual(assertOk(CP.path('billLive', PCTX, { businessDate: '2026-03-10', billId: 'b1' })).kind, 'RTDB');
    assert.strictEqual(assertOk(CP.path('unit', PCTX, { unitId: 'u1' })).kind, 'FIRESTORE');
  });

  test('recipe CÓ tầng version — chỗ sửa vi phạm rõ nhất của legacy', function () {
    var p = assertOk(CP.path('recipeVersion', PCTX, { recipeId: 'rc1', versionId: 'v1' }));
    assert.ok(/\/recipes\/rc1\/versions\/v1$/.test(p.path));
  });

  test('costBasis giữ mô hình append-only', function () {
    var p = assertOk(CP.path('costBasis', PCTX, { itemId: 'i1', entryId: 'e1' }));
    assert.ok(/\/costBasis\/i1\/history\/e1$/.test(p.path));
  });

  test('bank_confirmations tách riêng, KHÔNG nằm dưới namespace orgs/', function () {
    var p = assertOk(CP.protectedPath('bankConfirmation', { bankOrderId: 'GG10140530' }));
    assert.strictEqual(p.path, 'bank_confirmations/GG10140530');
    assert.strictEqual(p.isProtected, true);
    assert.strictEqual(p.path.indexOf('orgs/'), -1, 'path protected bị "chuẩn hoá" theo mẫu chung');
  });
});

describe('atomic-commit — ghi hết hoặc không ghi gì', function () {
  var AC = _pf.AC;

  function plan(over) {
    return Object.assign({
      operationId: _pf.ids.deterministicId('operation', ['sale', 'b1']),
      unitChanges: [{
        unitId: 'unit_u1', itemId: 'item_i1', status: 'CONSUMING',
        remainingQty: 800, openedAt: 1000
      }],
      ledgerEntries: [{ entryId: 'ledger_e1', type: 'CONSUMPTION', qtyDelta: -200 }],
      domainRecords: [{ type: 'bill', record: { billId: 'bill_b1', businessDate: '2026-03-10' } }],
      traceChanges: [{ billId: 'bill_b1', unitId: 'unit_u1' }],
      audit: { command: 'RecordSale', actorId: 'actor_nv01' }
    }, over || {});
  }

  test('plan sinh ra đúng các path canonical', function () {
    var w = assertOk(AC.planToWrites(plan(), PCTX));
    var ps = w.map(function (x) { return x.path; });
    assert.ok(ps.some(function (p) { return /\/units\/unit_u1$/.test(p); }));
    assert.ok(ps.some(function (p) { return /\/ledger\/ledger_e1$/.test(p); }));
    assert.ok(ps.some(function (p) { return /\/bills\/live\/2026-03-10\/bill_b1$/.test(p); }));
  });

  test('hũ đang mở được đẩy lên live layer; hũ đã hết thì GỠ khỏi RTDB', function () {
    var open = assertOk(AC.planToWrites(plan(), PCTX));
    assert.ok(open.some(function (x) { return x.kind === 'RTDB' && x.op === 'set' && /units\/live/.test(x.path); }));

    var done = assertOk(AC.planToWrites(plan({
      unitChanges: [{ unitId: 'unit_u1', itemId: 'item_i1', status: 'PHYSICALLY_FINISHED', remainingQty: 0 }]
    }), PCTX));
    assert.ok(done.some(function (x) { return /units\/live/.test(x.path) && x.op === 'remove'; }));
  });

  test('loại domainRecord chưa khai path thì TỪ CHỐI — không ghi vào hư không', function () {
    var r = AC.planToWrites(plan({
      domainRecords: [{ type: 'loai_la', record: {} }]
    }), PCTX);
    assertErr(r, 'VALIDATION');
    assert.ok(/chưa khai path canonical/.test(r.error.message));
  });

  test('7 loại domainRecord của commands/* (waste/reconcile/liability/payroll/shift/receiving/PO) đều có path canonical', function () {
    var cases = [
      { type: 'wasteRecord', record: { wasteRef: 'wr1', itemId: 'item_i1' }, match: /\/wasteRecords\/wr1\.item_i1$/ },
      { type: 'reconciliationRecord', record: { operationId: 'operation_adjust.ref1.item_i1' }, match: /\/reconciliationRecords\/operation_adjust\.ref1\.item_i1$/ },
      { type: 'liability', record: { liabilityId: 'liability_lost.lostreport1' }, match: /\/liabilities\/liability_lost\.lostreport1$/ },
      { type: 'payrollClosing', record: { payrollClosingId: 'snapshot_payroll.store_s1.2026-03' }, match: /\/payrollClosings\/snapshot_payroll\.store_s1\.2026-03$/ },
      { type: 'employeeShift', record: { shiftId: 'shift_e1.2026-03-10' }, match: /\/employeeShifts\/shift_e1\.2026-03-10$/ },
      { type: 'receivingRecord', record: { receivingRecordId: 'receipt_r1' }, match: /\/receivingRecords\/receipt_r1$/ },
      { type: 'purchaseOrder', record: { purchaseOrderId: 'po1' }, match: /\/purchaseOrders\/po1$/ }
    ];
    cases.forEach(function (c) {
      var w = assertOk(AC.planToWrites(plan({ domainRecords: [{ type: c.type, record: c.record }] }), PCTX));
      assert.ok(w.some(function (x) { return c.match.test(x.path); }),
        'loại "' + c.type + '" không sinh đúng path canonical — kiểm tra lại mapping trong atomic-commit.js');
    });
  });

  test('billAddon (RecordAddon) có path canonical, nằm ĐÚNG dưới node billLive của chính bill đó', function () {
    var w = assertOk(AC.planToWrites(plan({
      domainRecords: [{
        type: 'billAddon',
        record: { billId: 'bill_b1', businessDate: '2026-03-10', addonSeq: '2', addedAmount: 25000 }
      }]
    }), PCTX));
    assert.ok(w.some(function (x) {
      return x.kind === 'RTDB' && /\/bills\/live\/2026-03-10\/bill_b1\/addons\/2$/.test(x.path);
    }), 'billAddon phải ghi vào con của bills/live/{date}/{billId} — một lần đọc bill lấy được cả addons, ' +
      'giữ đúng tinh thần o.addons của legacy');
  });

  test('ghi thành công thì operation record nằm TRONG cùng transaction', function () {
    var mem = AC.createInMemoryRunner();
    var c = AC.createCommitter({ transactionRunner: mem.runner });
    return c.commit(plan(), PCTX).then(function (r) {
      assert.strictEqual(_pf.R.isOk(r), true);
      assert.ok(mem.keys().some(function (k) { return /\/operations\//.test(k); }),
        'operation ghi tách rời — có cửa sổ ghi đúp khi chạy lại');
      assert.strictEqual(mem.commitCount(), 1);
    });
  });

  test('transaction hỏng → KHÔNG có gì được ghi', function () {
    var mem = AC.createInMemoryRunner();
    var c = AC.createCommitter({ transactionRunner: mem.runner });
    mem.failOnce();
    return c.commit(plan(), PCTX).then(function (r) {
      assert.strictEqual(_pf.R.isErr(r), true);
      assert.deepStrictEqual(mem.keys(), [], 'ghi từng phần — đúng lỗi legacy allocate xong sổ hỏng');
      assert.strictEqual(mem.commitCount(), 0);
    });
  });

  test('lỗi hạ tầng tạm thời thì báo RETRYABLE, lỗi khác thì cần người xử lý', function () {
    var retry = AC.createInMemoryRunner({ failRetryable: true });
    var cr = AC.createCommitter({ transactionRunner: retry.runner });
    retry.failOnce();

    var hard = AC.createInMemoryRunner({ failRetryable: false });
    var ch = AC.createCommitter({ transactionRunner: hard.runner });
    hard.failOnce();

    return Promise.all([cr.commit(plan(), PCTX), ch.commit(plan(), PCTX)]).then(function (rs) {
      assert.strictEqual(rs[0].error.kind, 'RETRYABLE');
      assert.strictEqual(rs[1].error.kind, 'MANUAL_REVIEW');
    });
  });

  test('plan thiếu operationId bị từ chối', function () {
    var c = AC.createCommitter({ transactionRunner: AC.createInMemoryRunner().runner });
    return c.commit(plan({ operationId: null }), PCTX).then(function (r) {
      assertErr(r, 'VALIDATION');
    });
  });

  test('module KHÔNG tự import Firebase SDK — runner phải tiêm vào', function () {
    assert.throws(function () { AC.createCommitter({}); }, /không tự import Firebase SDK/);
  });

  test('runAndCommit ghi THẬT và chờ được — pipeline.run cố ý vẫn đồng bộ', function () {
    var PIPE = GIEO.require('commands/pipeline');
    var mem = AC.createInMemoryRunner();
    var committer = AC.createCommitter({ transactionRunner: mem.runner });
    var R = _pf.R;

    var cmd = PIPE.defineCommand({
      name: 'T_PersistSmoke',
      authority: 'EXECUTE', mutates: true, sources: ['POS'],
      operationId: function (i) { return _pf.ids.deterministicId('operation', ['smoke', i.ref]); },
      execute: function () {
        var p = PIPE.emptyPlan();
        p.ledgerEntries.push({ entryId: 'ledger_smoke', type: 'ADJUSTMENT', qtyDelta: 1 });
        return R.ok(p);
      }
    });

    var store = PIPE.createInMemoryOperationStore();
    var ctx = smokeCtx();

    return PIPE.runAndCommit(cmd, { ref: 's1' }, ctx, {
      operationStore: store,
      commit: function (p, c) { return committer.commit(p, c); }
    }).then(function (out) {
      assert.strictEqual(R.isOk(out), true);
      assert.ok(mem.keys().some(function (k) { return /\/ledger\/ledger_smoke$/.test(k); }),
        'dữ liệu chưa thật sự được ghi');
      assert.ok(mem.keys().some(function (k) { return /\/operations\//.test(k); }));
    });
  });

  test('runAndCommit: transaction hỏng thì KHÔNG đánh dấu operation hoàn tất', function () {
    var PIPE = GIEO.require('commands/pipeline');
    var mem = AC.createInMemoryRunner();
    var committer = AC.createCommitter({ transactionRunner: mem.runner });
    var R = _pf.R;

    var cmd = PIPE.defineCommand({
      name: 'T_PersistFail',
      authority: 'EXECUTE', mutates: true, sources: ['POS'],
      operationId: function (i) { return _pf.ids.deterministicId('operation', ['fail', i.ref]); },
      execute: function () {
        var p = PIPE.emptyPlan();
        p.ledgerEntries.push({ entryId: 'ledger_fail', type: 'ADJUSTMENT', qtyDelta: 1 });
        return R.ok(p);
      }
    });

    var store = PIPE.createInMemoryOperationStore();
    mem.failOnce();

    return PIPE.runAndCommit(cmd, { ref: 'f1' }, smokeCtx(), {
      operationStore: store,
      commit: function (p, c) { return committer.commit(p, c); }
    }).then(function (out) {
      assert.strictEqual(R.isErr(out), true);
      assert.deepStrictEqual(mem.keys(), []);
      var op = store.all()[0];
      assert.notStrictEqual(op.status, 'COMPLETED',
        'operation bị đánh dấu hoàn tất dù không ghi được gì — chạy lại sẽ bị coi là no-op');
    });
  });

  test('runAndCommit thiếu commit thì từ chối, không lặng lẽ thành dry-run', function () {
    var PIPE = GIEO.require('commands/pipeline');
    return PIPE.runAndCommit({}, {}, smokeCtx(), {
      operationStore: PIPE.createInMemoryOperationStore()
    }).then(function (r) { assertErr(r, 'VALIDATION'); });
  });
});

describe('Mọi path Firestore phải trỏ tới DOCUMENT, không phải collection', function () {
  var P = GIEO.require('persistence-firebase/canonical-paths');
  var idsP = GIEO.require('shared-kernel/ids');
  var ctxP = {
    organizationId: idsP.deterministicId('org', ['gieo']),
    storeId: idsP.deterministicId('store', ['main'])
  };
  /* Đủ tham số cho mọi builder — mục đích là kiểm HÌNH DẠNG path, không phải giá trị. */
  var ARGS = {
    unitId: 'unit_1', itemId: 'item_1', entryId: 'ledger_1', operationId: 'operation_1',
    prepItemId: 'prepItem_1', prepBatchId: 'prepBatch_1', countId: 'count_1',
    reportId: 'report_1', id: 'id_1', recipeId: 'recipe_1', versionId: 'version_1',
    kind: 'cost', subjectId: 'subject_1', businessDate: '2026-09-20', billId: 'bill_1',
    dateKey: '2026-09-20', seq: 1, shiftId: 'shift_1', period: '2026-08', revisionNo: 1,
    customerId: 'customer_1', alertId: 'alert_1', employeeId: 'employee_1', archiveKey: 'sep_20_2026'
  };

  /* Firestore đòi collection/document xen kẽ. Path lẻ đoạn trỏ vào collection,
     và lỗi đó chỉ lộ ra lúc GHI THẬT — tức là đúng lúc không được phép hỏng. */
  test('không path nào có số đoạn lẻ', function () {
    var bad = [];
    P.listNames().forEach(function (name) {
      var out = P.path(name, ctxP, ARGS);
      if (!out.ok) return;
      if (out.value.kind !== P.FIRESTORE) return;
      var segs = out.value.path.split('/').filter(Boolean).length;
      if (segs % 2 !== 0) bad.push(name + ' -> ' + out.value.path);
    });
    assert.deepStrictEqual(bad, [], 'path trỏ vào collection chứ không phải document');
  });

  test('mọi path đều nằm dưới orgs/{org}/stores/{store}, trừ path protected', function () {
    var outside = [];
    P.listNames().forEach(function (name) {
      var out = P.path(name, ctxP, ARGS);
      if (out.ok && out.value.path.indexOf('orgs/' + ctxP.organizationId + '/stores/' + ctxP.storeId + '/') !== 0) {
        outside.push(name);
      }
    });
    assert.deepStrictEqual(outside, []);
  });
});
