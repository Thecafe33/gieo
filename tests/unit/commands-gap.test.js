/**
 * Các command đóng gap §4.1/§4.2 của GIEO-REBUILD-HANDOFF-V2.md:
 *   - ApproveLostContainer (gap xác nhận độc lập 3 lần)
 *   - ApproveStockCount idempotent + partially_applied
 *   - AdjustInventory thay applyStockTransaction
 *   - RecordWaste qua FIFO cho CẢ raw lẫn prep
 *   - ReverseTransaction / ReviseState / CorrectLedgerEntry
 */

var _g = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    PIPE: GIEO.require('commands/pipeline'),
    INV: GIEO.require('commands/inventory'),
    APR: GIEO.require('commands/approval'),
    REV: GIEO.require('commands/reversal'),
    PAY: GIEO.require('commands/payroll'),
    U: GIEO.require('fifo-core/unit'),
    L: GIEO.require('fifo-core/ledger'),
    LIAB: GIEO.require('hr/liability'),
    EMP: GIEO.require('hr/employee'),
    SHIFT: GIEO.require('hr/shift'),
    PAYROLL: GIEO.require('hr/payroll'),
    VI: GIEO.require('compaction/versioned-input'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    NV: ids.deterministicId('actor', ['nv01']),
    QL: ids.deterministicId('actor', ['ql']),
    SUA: ids.deterministicId('item', ['sua'])
  };
})();

function gCtx(role, source, actorId) {
  var day = assertOk(_g.BD.openDay({
    storeId: _g.STORE, dateKey: '2026-03-10', actorId: _g.QL,
    at: new Date(2026, 2, 10, 7).getTime(), clock: _g.CLK.createClock()
  }));
  var actor = assertOk(_g.ACCESS.createActor({
    actorId: actorId || _g.NV, role: role || 'POS_OPERATOR',
    source: source || 'POS', stores: [_g.STORE]
  }));
  return assertOk(_g.CTXL.createContext({
    organizationId: _g.ORG, storeId: _g.STORE, actor: actor, source: source || 'POS', businessDay: day
  }));
}

function gUnit(qty, tag, openIt) {
  var u = assertOk(_g.U.createUnit({
    unitId: _g.ids.deterministicId('unit', [tag || 'u1']),
    itemId: _g.SUA, storeId: _g.STORE, itemKind: 'raw', initialQty: qty,
    costBasis: { unitCost: 30, versionId: 'version_c1' }, operationId: 'operation_r'
  }));
  if (openIt === false) return u;
  u = assertOk(_g.U.open(u, { at: 1000, actorId: _g.NV, operationId: 'operation_o' }));
  return Object.assign({}, u, { remainingQty: qty });
}

function run(cmd, input, ctx, store) {
  return _g.PIPE.run(cmd, input, ctx || gCtx(), {
    operationStore: store || _g.PIPE.createInMemoryOperationStore()
  });
}

describe('RecordWaste — qua FIFO cho CẢ raw lẫn prep (fix §10b.2)', function () {
  var INV = _g.INV;

  test('nguyên liệu thô ĐƯỢC allocate — legacy ghi thẳng sổ không allocate', function () {
    var out = assertOk(run(INV.RecordWaste, {
      itemId: _g.SUA, qty: 200, domain: 'raw', wasteRef: 'w1', reason: 'đổ hỏng',
      units: [gUnit(1000, 'a')]
    }));
    var e = out.plan.ledgerEntries[0];
    assert.strictEqual(e.type, 'WASTE');
    assert.ok(e.unitId, 'waste nguyên liệu thô không gắn lô — đúng lỗi legacy');
    assert.strictEqual(e.qtyDelta, -200);
  });

  test('prep đi CÙNG một đường, không có nhánh code riêng', function () {
    var out = assertOk(run(INV.RecordWaste, {
      itemId: _g.SUA, qty: 100, domain: 'prep', wasteRef: 'w2', reason: 'quá hạn',
      units: [gUnit(1000, 'b')]
    }));
    assert.ok(out.plan.ledgerEntries[0].unitId);
  });

  test('luôn có ingredientBreakdown — legacy chỉ 1/3 đường có', function () {
    var out = assertOk(run(INV.RecordWaste, {
      itemId: _g.SUA, qty: 200, domain: 'raw', wasteRef: 'w3', reason: 'x',
      units: [gUnit(1000, 'c')]
    }));
    var rec = out.plan.domainRecords[0].record;
    assert.strictEqual(rec.ingredientBreakdown.length, 1);
    assert.strictEqual(rec.wasteCost, 200 * 30);
  });

  test('không đủ lô thì CHẶN, không ghi thẳng sổ', function () {
    var r = run(INV.RecordWaste, {
      itemId: _g.SUA, qty: 500, domain: 'raw', wasteRef: 'w4', reason: 'x',
      units: [gUnit(100, 'd')]
    });
    assertErr(r, 'PRECONDITION');
    assert.ok(/ghi thẳng sổ mà không allocate/.test(r.error.message));
  });

  test('cho phép phần không truy được lô thì nó vẫn VÀO SỔ qua untrackedPendingDelta', function () {
    var out = assertOk(run(INV.RecordWaste, {
      itemId: _g.SUA, qty: 500, domain: 'raw', wasteRef: 'w5', reason: 'x',
      allowUntracked: true, units: [gUnit(100, 'e')]
    }));
    var untracked = out.plan.ledgerEntries.filter(function (e) { return !e.unitId; });
    assert.strictEqual(untracked.length, 1);
    assert.strictEqual(untracked[0].qtyDelta, -400, 'phần thiếu biến mất khỏi sổ');
  });

  test('thiếu wasteRef thì từ chối — đó chính là bug #21', function () {
    assertErr(run(INV.RecordWaste, {
      itemId: _g.SUA, qty: 10, domain: 'raw', reason: 'x', units: [gUnit(100, 'f')]
    }), 'VALIDATION');
  });

  test('waste lặp là no-op', function () {
    var store = _g.PIPE.createInMemoryOperationStore();
    var ctx = gCtx();
    var input = { itemId: _g.SUA, qty: 100, domain: 'raw', wasteRef: 'w6', reason: 'x', units: [gUnit(1000, 'g')] };
    assertOk(run(INV.RecordWaste, input, ctx, store));
    assert.strictEqual(assertOk(run(INV.RecordWaste, input, ctx, store)).replayed, true);
  });
});

describe('AdjustInventory — thay applyStockTransaction (fix §9)', function () {
  var INV = _g.INV;
  var qlCtx = function () { return gCtx('QUANLY_ADMIN', 'QUANLY', _g.QL); };

  test('điều chỉnh trên 1 lô đi qua Unit Engine, GHI ĐÈ tuyệt đối', function () {
    var u = gUnit(1000, 'h');
    var out = assertOk(run(INV.AdjustInventory, {
      itemId: _g.SUA, unitId: u.unitId, actualQty: 850, adjustRef: 'adj1',
      reason: 'kiểm kê', units: [u]
    }, qlCtx()));
    assert.strictEqual(out.plan.unitChanges[0].remainingQty, 850);
    assert.strictEqual(out.plan.ledgerEntries[0].qtyDelta, -150);
  });

  test('điều chỉnh phần không gắn lô sinh entry không unitId (tự cộng pending delta)', function () {
    var out = assertOk(run(INV.AdjustInventory, {
      itemId: _g.SUA, qtyDelta: -50, adjustRef: 'adj2', reason: 'hụt không rõ nguyên nhân'
    }, qlCtx()));
    var e = assertOk(_g.L.createEntry(Object.assign({ operationId: 'operation_x' }, out.plan.ledgerEntries[0])));
    assert.strictEqual(e.unitId, null);
    assert.strictEqual(e.untrackedPendingDelta, -50);
  });

  test('POS KHÔNG điều chỉnh kho được — quyền enforce ở Command', function () {
    assertErr(run(INV.AdjustInventory, {
      itemId: _g.SUA, qtyDelta: -50, adjustRef: 'adj3', reason: 'x'
    }, gCtx('POS_OPERATOR', 'POS')), 'FORBIDDEN');
  });

  test('điều chỉnh phải có lý do', function () {
    assertErr(run(INV.AdjustInventory, {
      itemId: _g.SUA, qtyDelta: -50, adjustRef: 'adj4'
    }, qlCtx()), 'VALIDATION');
  });

  test('điều chỉnh lặp là no-op — không cộng đúp', function () {
    var store = _g.PIPE.createInMemoryOperationStore();
    var c = qlCtx();
    var input = { itemId: _g.SUA, qtyDelta: -50, adjustRef: 'adj5', reason: 'x' };
    assertOk(run(INV.AdjustInventory, input, c, store));
    assert.strictEqual(assertOk(run(INV.AdjustInventory, input, c, store)).replayed, true);
  });
});

describe('ApproveLostContainer — MẮT XÍCH legacy CHƯA TỪNG CÓ (gap xác nhận 3 lần)', function () {
  var INV = _g.INV;
  var APR = _g.APR;
  var qlCtx = function () { return gCtx('QUANLY_ADMIN', 'QUANLY', _g.QL); };

  function report(unitId) {
    var out = assertOk(run(INV.ReportLostContainer, {
      unitId: unitId, reason: 'không tìm thấy hũ trên kệ'
    }));
    return out.plan.domainRecords[0].record;
  }

  test('POS báo mất chỉ tạo phiếu CHỜ DUYỆT — Unit chưa vào nhánh LOST', function () {
    var rep = report(gUnit(1000, 'i').unitId);
    assert.strictEqual(rep.status, 'PENDING_REVIEW');
  });

  test('QUANLY duyệt thì Unit MỚI vào nhánh LOST', function () {
    var u = gUnit(1000, 'j');
    var rep = report(u.unitId);
    var out = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u]
    }, qlCtx()));
    assert.strictEqual(out.plan.unitChanges[0].status, 'LOST');
    assert.strictEqual(out.plan.domainRecords[0].record.status, 'APPROVED');
  });

  test('sau khi duyệt, RestoreFoundContainer chạy được — logic legacy đã có nhưng không bao giờ tới', function () {
    var u = gUnit(1000, 'k');
    var rep = report(u.unitId);
    var lost = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u]
    }, qlCtx())).plan.unitChanges[0];

    var found = assertOk(run(INV.RestoreFoundContainer, {
      unitId: u.unitId, units: [lost]
    }, qlCtx()));
    /* Hũ được mở nhưng chưa tiêu thụ nên trạng thái trước khi mất là OPEN;
       khôi phục phải trả về ĐÚNG trạng thái đó, không phải một trạng thái đoán. */
    assert.strictEqual(found.plan.unitChanges[0].status, 'OPEN');
    assert.strictEqual(found.plan.unitChanges[0].needsReview, true);
  });

  test('duyệt mất container tạo khoản trừ trách nhiệm nhân viên, khớp qua actorId báo mất', function () {
    var emp = assertOk(_g.EMP.createEmployee({ name: 'Linh', storeId: _g.STORE, actorId: _g.NV }));
    var u = gUnit(1000, 'liab1');
    var rep = report(u.unitId);
    var out = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u], employees: [emp]
    }, qlCtx()));
    var liab = out.plan.domainRecords[1].record;
    assert.strictEqual(out.plan.domainRecords.length, 2, 'lostReport + liability, cả hai NGAY trong plan này');
    assert.strictEqual(liab.employeeId, emp.employeeId);
    assert.strictEqual(liab.amount, 1000 * 30, 'đúng costBasis.unitCost thật của gUnit');
    assert.strictEqual(liab.gap, false);
    assert.strictEqual(liab.status, _g.LIAB.STATUS.PENDING);
  });

  test('không khớp được nhân viên vẫn duyệt được — §2.3a: khoản trừ chỉ gắn cờ gap, không chặn', function () {
    var u = gUnit(1000, 'liab2');
    var rep = report(u.unitId);
    var out = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u]
      /* Không truyền employees — mô phỏng chưa xác định được ai báo mất. */
    }, qlCtx()));
    var liab = out.plan.domainRecords[1].record;
    assert.strictEqual(liab.employeeId, null);
    assert.strictEqual(liab.gap, true);
    assert.ok(liab.gapReasons.indexOf('NO_EMPLOYEE_MATCH') !== -1);
  });

  test('event đổi tên thành ContainerLostApproved — không còn trùng type với sự kiện "tìm lại được"', function () {
    var u = gUnit(1000, 'liab3');
    var rep = report(u.unitId);
    var out = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u]
    }, qlCtx()));
    assert.strictEqual(out.plan.events[0].type, 'ContainerLostApproved');
  });

  test('RestoreFoundContainer hoàn khoản trừ (REVERSED) khi có input.liability khớp', function () {
    var emp = assertOk(_g.EMP.createEmployee({ name: 'Linh', storeId: _g.STORE, actorId: _g.NV }));
    var u = gUnit(1000, 'liab4');
    var rep = report(u.unitId);
    var approved = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u], employees: [emp]
    }, qlCtx()));
    var lostUnit = approved.plan.unitChanges[0];
    var liab = approved.plan.domainRecords[1].record;

    var found = assertOk(run(INV.RestoreFoundContainer, {
      unitId: u.unitId, units: [lostUnit], liability: liab
    }, qlCtx()));
    var reversedLiab = found.plan.domainRecords.filter(function (d) { return d.type === 'liability'; })[0].record;
    assert.strictEqual(reversedLiab.status, _g.LIAB.STATUS.REVERSED);
  });

  test('RestoreFoundContainer không có input.liability vẫn chạy bình thường, không lỗi', function () {
    var u = gUnit(1000, 'liab5');
    var rep = report(u.unitId);
    var approved = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u]
    }, qlCtx()));
    var lostUnit = approved.plan.unitChanges[0];

    var found = assertOk(run(INV.RestoreFoundContainer, {
      unitId: u.unitId, units: [lostUnit]
    }, qlCtx()));
    assert.strictEqual(found.plan.domainRecords.filter(function (d) { return d.type === 'liability'; }).length, 0);
  });

  test('từ chối duyệt thì Unit KHÔNG bị đánh dấu mất', function () {
    var u = gUnit(1000, 'l');
    var rep = report(u.unitId);
    var out = assertOk(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'REJECT',
      reason: 'tìm thấy rồi', units: [u]
    }, qlCtx()));
    assert.strictEqual(out.plan.unitChanges.length, 0);
    assert.strictEqual(out.plan.domainRecords[0].record.status, 'REJECTED');
  });

  test('duyệt phải có lý do (§25 approval bắt buộc có reason)', function () {
    var u = gUnit(1000, 'm');
    var rep = report(u.unitId);
    assertErr(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE', units: [u]
    }, qlCtx()), 'VALIDATION');
  });

  test('phiếu đã xử lý thì không duyệt lại — fail-closed', function () {
    var u = gUnit(1000, 'n');
    var rep = Object.assign({}, report(u.unitId), { status: 'APPROVED' });
    assertErr(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'x', units: [u]
    }, qlCtx()), 'PRECONDITION');
  });

  test('POS KHÔNG duyệt được báo mất', function () {
    var u = gUnit(1000, 'o');
    var rep = report(u.unitId);
    assertErr(run(APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'x', units: [u]
    }, gCtx('POS_OPERATOR', 'POS')), 'FORBIDDEN');
  });
});

describe('ApproveStockCount — idempotent + PARTIALLY_APPLIED (fix §10b.3)', function () {
  var APR = _g.APR;
  var qlCtx = function () { return gCtx('QUANLY_ADMIN', 'QUANLY', _g.QL); };

  function count(lines) {
    return { stockCountId: 'count_1', status: 'PENDING', lines: lines };
  }

  test('duyệt áp điều chỉnh qua Unit Engine', function () {
    var u = gUnit(1000, 'p');
    var out = assertOk(run(APR.ApproveStockCount, {
      stockCountId: 'count_1', reason: 'kiểm kê tháng', units: [u],
      stockCount: count([{ itemId: _g.SUA, unitId: u.unitId, countedQty: 900 }])
    }, qlCtx()));
    assert.strictEqual(out.plan.unitChanges[0].remainingQty, 900);
    assert.strictEqual(out.plan.domainRecords[0].record.status, 'APPROVED');
  });

  test('2 người duyệt cùng lúc KHÔNG cộng đúp variance', function () {
    var store = _g.PIPE.createInMemoryOperationStore();
    var c = qlCtx();
    var u = gUnit(1000, 'q');
    var input = {
      stockCountId: 'count_2', reason: 'x', units: [u],
      stockCount: { stockCountId: 'count_2', status: 'PENDING', lines: [{ itemId: _g.SUA, unitId: u.unitId, countedQty: 900 }] }
    };
    assertOk(run(APR.ApproveStockCount, input, c, store));
    assert.strictEqual(assertOk(run(APR.ApproveStockCount, input, c, store)).replayed, true);
  });

  test('dòng lỗi lưu CHÍNH XÁC dòng nào và vì sao — legacy chỉ có failedCount', function () {
    var u = gUnit(1000, 'r');
    var out = assertOk(run(APR.ApproveStockCount, {
      stockCountId: 'count_3', reason: 'x', units: [u],
      stockCount: count([
        { itemId: _g.SUA, unitId: u.unitId, countedQty: 900 },
        { itemId: _g.SUA, unitId: _g.ids.deterministicId('unit', ['bien-mat']), countedQty: 500 }
      ])
    }, qlCtx()));
    var rec = out.plan.domainRecords[0].record;
    assert.strictEqual(rec.failedLines.length, 1);
    assert.strictEqual(rec.failedLines[0].unitId, _g.ids.deterministicId('unit', ['bien-mat']));
    assert.ok(rec.failedLines[0].reason);
  });

  test('còn dòng lỗi thì status là PARTIALLY_APPLIED, KHÔNG phải APPROVED', function () {
    var u = gUnit(1000, 's');
    var out = assertOk(run(APR.ApproveStockCount, {
      stockCountId: 'count_4', reason: 'x', units: [u],
      stockCount: count([
        { itemId: _g.SUA, unitId: u.unitId, countedQty: 900 },
        { itemId: _g.SUA, unitId: _g.ids.deterministicId('unit', ['bien-mat']), countedQty: 500 }
      ])
    }, qlCtx()));
    assert.strictEqual(out.plan.domainRecords[0].record.status, 'PARTIALLY_APPLIED');
    assert.strictEqual(out.plan.events[0].type, 'StockCountPartiallyApplied');
  });

  test('duyệt lại phiếu PARTIALLY_APPLIED không áp lại dòng đã xong', function () {
    var u = gUnit(1000, 't');
    var out = assertOk(run(APR.ApproveStockCount, {
      stockCountId: 'count_5', reason: 'x', units: [u],
      stockCount: {
        stockCountId: 'count_5', status: 'PARTIALLY_APPLIED',
        lines: [
          { itemId: _g.SUA, unitId: u.unitId, countedQty: 900, applied: true },
          { itemId: _g.SUA, qtyDelta: -10, delta: -10 }
        ]
      }
    }, qlCtx()));
    assert.strictEqual(out.plan.unitChanges.length, 0, 'dòng đã áp bị áp lại — cộng đúp');
  });
});

describe('Reversal — 2 pattern thay 10 đường của legacy', function () {
  var REV = _g.REV;
  var qlCtx = function () { return gCtx('QUANLY_ADMIN', 'QUANLY', _g.QL); };

  test('ReverseTransaction hoàn theo phân bổ GỐC, không chạy lại FIFO', function () {
    var u = Object.assign({}, gUnit(1000, 'v'), { remainingQty: 800 });
    var out = assertOk(run(REV.ReverseTransaction, {
      referenceId: 'bill_9', domain: 'raw', itemId: _g.SUA, reason: 'xoá bill',
      units: [u],
      originalAllocations: [{
        unitId: u.unitId, itemId: _g.SUA, qty: 200, unitCost: 30, operationId: 'operation_sale1'
      }]
    }, qlCtx()));
    assert.strictEqual(out.plan.unitChanges[0].remainingQty, 1000);
    assert.strictEqual(out.plan.ledgerEntries[0].qtyDelta, 200);
    assert.strictEqual(out.plan.ledgerEntries[0].type, 'REVERSAL');
  });

  test('thiếu originalAllocations thì TỪ CHỐI — cấm đoán', function () {
    var r = run(REV.ReverseTransaction, {
      referenceId: 'bill_9', domain: 'raw', reason: 'xoá bill', units: []
    }, qlCtx());
    assertErr(r, 'VALIDATION');
    assert.ok(/không phải chạy lại FIFO/.test(r.error.message));
  });

  test('hoàn 2 lần là no-op — id xác định theo (ref, domain, item)', function () {
    var store = _g.PIPE.createInMemoryOperationStore();
    var c = qlCtx();
    var u = Object.assign({}, gUnit(1000, 'w'), { remainingQty: 800 });
    var input = {
      referenceId: 'bill_10', domain: 'raw', itemId: _g.SUA, reason: 'xoá bill', units: [u],
      originalAllocations: [{ unitId: u.unitId, itemId: _g.SUA, qty: 200, unitCost: 30, operationId: 'op1' }]
    };
    assertOk(run(REV.ReverseTransaction, input, c, store));
    assert.strictEqual(assertOk(run(REV.ReverseTransaction, input, c, store)).replayed, true);
  });

  test('RELEASE GATE: 2 QUANLY hoàn đồng thời chỉ một claim/commit thắng', function () {
    var store = _g.PIPE.createInMemoryOperationStore();
    var c = qlCtx();
    var u = Object.assign({}, gUnit(1000, 'race'), { remainingQty: 800 });
    var input = {
      referenceId: 'bill_race', domain: 'raw', itemId: _g.SUA, reason: 'xoá bill', units: [u],
      originalAllocations: [{ unitId: u.unitId, itemId: _g.SUA, qty: 200, unitCost: 30, operationId: 'op1' }]
    };
    var commits = 0;
    function delayedCommit() {
      commits += 1;
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(GIEO.require('shared-kernel/result').ok({ committed: true })); }, 5);
      });
    }
    return Promise.all([
      _g.PIPE.runAndCommit(REV.ReverseTransaction, input, c, { operationStore: store, commit: delayedCommit }),
      _g.PIPE.runAndCommit(REV.ReverseTransaction, input, c, { operationStore: store, commit: delayedCommit })
    ]).then(function (results) {
      assert.strictEqual(commits, 1, 'race đã chạy commit hơn một lần');
      assert.strictEqual(results.filter(function (x) { return x.ok; }).length, 1);
      assert.strictEqual(results.filter(function (x) { return !x.ok && x.error.kind === 'CONFLICT'; }).length, 1);
    });
  });

  test('không truy được phân bổ gốc → tạo việc RÀ TAY, không im lặng coi là xong', function () {
    var out = assertOk(run(REV.ReverseTransaction, {
      referenceId: 'bill_cu', domain: 'raw', itemId: _g.SUA, reason: 'xoá bill cũ',
      units: [], originalAllocations: [], fallbackQty: 150
    }, qlCtx()));
    var task = out.plan.domainRecords[0].record;
    assert.strictEqual(task.reason, 'AMBIGUOUS_LEGACY');
    assert.strictEqual(task.qty, 150);
  });

  test('side-effect đi qua EVENT, không phải if/else trong hàm hoàn', function () {
    var u = Object.assign({}, gUnit(1000, 'x'), { remainingQty: 800 });
    var out = assertOk(run(REV.ReverseTransaction, {
      referenceId: 'bill_11', domain: 'raw', itemId: _g.SUA, reason: 'xoá bill', units: [u],
      originalAllocations: [{ unitId: u.unitId, itemId: _g.SUA, qty: 200, unitCost: 30, operationId: 'op1' }],
      eventType: 'OrderVoided', eventData: { customerId: 'customer_1' }
    }, qlCtx()));
    assert.strictEqual(out.plan.events[0].type, 'OrderVoided');
    assert.strictEqual(out.plan.events[0].customerId, 'customer_1');
  });

  test('event bus: đổi quyết định hoàn điểm = thêm/bớt 1 handler', function () {
    var bus = REV.createEventBus();
    var called = [];
    bus.on('OrderVoided', 'LoyaltyReversalHandler', function (e) {
      called.push(e.referenceId);
      return GIEO.require('shared-kernel/result').ok(true);
    });
    bus.emit({ type: 'OrderVoided', referenceId: 'bill_11' });
    assert.deepStrictEqual(called, ['bill_11']);
    assert.deepStrictEqual(bus.handlersFor('OrderVoided'), ['LoyaltyReversalHandler']);
  });

  test('handler hỏng KHÔNG bị nuốt im lặng', function () {
    var bus = REV.createEventBus();
    bus.on('OrderVoided', 'HandlerHong', function () { throw new Error('mạng lỗi'); });
    var out = bus.emit({ type: 'OrderVoided', referenceId: 'b' });
    assert.strictEqual(out[0].result.ok, false);
    assert.strictEqual(out[0].result.error.kind, 'MANUAL_REVIEW');
  });

  describe('ReviseState', function () {
    test('BẮT BUỘC trả lời đóng băng hay tính lại lịch sử — legacy để ngỏ', function () {
      var r = run(REV.ReviseState, {
        entityType: 'prepBatch', entityId: 'prepBatch_1', field: 'yieldActual',
        newValue: 9.5, reason: 'cân lại'
      }, qlCtx());
      assertErr(r, 'VALIDATION');
      assert.ok(/historicalPolicy/.test(r.error.message));
    });

    test('FREEZE không đụng tới báo cáo cũ', function () {
      var out = assertOk(run(REV.ReviseState, {
        entityType: 'prepBatch', entityId: 'prepBatch_1', field: 'yieldActual',
        currentValue: 10, newValue: 9.5, reason: 'cân lại', historicalPolicy: 'FREEZE'
      }, qlCtx()));
      assert.strictEqual(out.plan.projectionRecomputes.length, 0);
      assert.strictEqual(out.plan.domainRecords[0].record.before, 10);
    });

    test('RECOMPUTE mới tính lại phạm vi bị ảnh hưởng', function () {
      var out = assertOk(run(REV.ReviseState, {
        entityType: 'prepBatch', entityId: 'prepBatch_2', field: 'yieldActual',
        currentValue: 10, newValue: 9.5, reason: 'cân lại', historicalPolicy: 'RECOMPUTE',
        affectedScope: { itemId: _g.SUA, storeId: _g.STORE }
      }, qlCtx()));
      assert.strictEqual(out.plan.projectionRecomputes.length, 1);
    });

    test('giữ giá trị trước — append-only, không ghi đè', function () {
      var out = assertOk(run(REV.ReviseState, {
        entityType: 'shift', entityId: 'shift_1', field: 'checkedOutAt',
        currentValue: 1000, newValue: 2000, reason: 'quên bấm', historicalPolicy: 'FREEZE'
      }, qlCtx()));
      var rec = out.plan.domainRecords[0].record;
      assert.strictEqual(rec.before, 1000);
      assert.strictEqual(rec.after, 2000);
      assert.ok(rec.actorId);
    });
  });

  describe('CorrectLedgerEntry — đóng gap "sửa 1 dòng ledger sai"', function () {
    var original = {
      entryId: 'ledger_sai', domain: 'raw', type: 'WASTE',
      itemId: _g.SUA, storeId: _g.STORE, unitId: null, qtyDelta: -500
    };

    test('ghi dòng ĐẢO + dòng ĐÚNG, KHÔNG update dòng cũ', function () {
      var out = assertOk(run(REV.CorrectLedgerEntry, {
        originalEntry: original, corrected: { qtyDelta: -50 }, reason: 'nhập nhầm 500 thay vì 50'
      }, qlCtx()));
      assert.strictEqual(out.plan.ledgerEntries.length, 2);
      assert.strictEqual(out.plan.ledgerEntries[0].qtyDelta, 500);
      assert.strictEqual(out.plan.ledgerEntries[1].qtyDelta, -50);
    });

    test('cả 2 dòng trỏ về dòng gốc', function () {
      var out = assertOk(run(REV.CorrectLedgerEntry, {
        originalEntry: original, corrected: { qtyDelta: -50 }, reason: 'x'
      }, qlCtx()));
      out.plan.ledgerEntries.forEach(function (e) {
        assert.strictEqual(e.referenceId, 'ledger_sai');
      });
    });

    test('tổng 2 dòng ra đúng chênh lệch cần sửa', function () {
      var out = assertOk(run(REV.CorrectLedgerEntry, {
        originalEntry: original, corrected: { qtyDelta: -50 }, reason: 'x'
      }, qlCtx()));
      var net = out.plan.ledgerEntries.reduce(function (s, e) { return s + e.qtyDelta; }, 0);
      assert.strictEqual(net, 450);
    });
  });
});

describe('commands/payroll — điểm nối còn thiếu (quyết định chủ quán: "tìm chỗ nối vào hợp lý")', function () {
  var PAY = _g.PAY;
  var qlCtx = function () { return gCtx('QUANLY_ADMIN', 'QUANLY', _g.QL); };
  var D = function (d, h) { return new Date(2026, 2, d, h || 0).getTime(); };

  function payrollSetup() {
    var reg = _g.VI.createRegistry();
    var emp = assertOk(_g.EMP.createEmployee({ name: 'Linh', storeId: _g.STORE, actorId: _g.NV }));
    assertOk(_g.EMP.publishPayTerms(reg, {
      employeeId: emp.employeeId, storeId: _g.STORE, effectiveFrom: D(1, 0),
      publishedBy: _g.QL, terms: { rate: 30000, otRate: 45000, otThreshold: 8 }
    }));
    return { reg: reg, emp: emp };
  }

  function closedShift(ctx, day, hours) {
    var sh = assertOk(_g.SHIFT.checkIn({
      employee: ctx.emp, versionRegistry: ctx.reg, at: D(day, 8),
      businessDate: '2026-03-' + (day < 10 ? '0' + day : day)
    }));
    return assertOk(_g.SHIFT.checkOut(sh, D(day, 8 + hours)));
  }

  test('ReviseAttendance nối hr/shift.reviseShift() — 0 importer trước đây, giờ chạy được qua command', function () {
    var ctx = payrollSetup();
    var sh = closedShift(ctx, 10, 8);
    var out = assertOk(run(PAY.ReviseAttendance, {
      shift: sh, revisionRef: 'fix1', reason: 'quên bấm giờ ra',
      changes: { checkedOutAt: D(10, 17) }
    }, qlCtx()));
    var revised = out.plan.domainRecords[0].record;
    assert.strictEqual(revised.checkedOutAt, D(10, 17));
    assert.strictEqual(revised.needsReview, true);
    assert.strictEqual(revised.revisions.length, 1);
  });

  test('ReviseAttendance thiếu revisionRef thì từ chối — cần id xác định như wasteRef/adjustRef', function () {
    var ctx = payrollSetup();
    var sh = closedShift(ctx, 11, 8);
    assertErr(run(PAY.ReviseAttendance, {
      shift: sh, reason: 'x', changes: { checkedOutAt: D(11, 17) }
    }, qlCtx()), 'VALIDATION');
  });

  test('sửa lại đúng request là no-op — idempotent qua revisionRef', function () {
    var store = _g.PIPE.createInMemoryOperationStore();
    var c = qlCtx();
    var ctx = payrollSetup();
    var sh = closedShift(ctx, 12, 8);
    var input = { shift: sh, revisionRef: 'fix2', reason: 'x', changes: { checkedOutAt: D(12, 17) } };
    assertOk(run(PAY.ReviseAttendance, input, c, store));
    assert.strictEqual(assertOk(run(PAY.ReviseAttendance, input, c, store)).replayed, true);
  });

  test('ClosePayroll nối hr/payroll.closePayroll() — 0 importer trước đây, giờ chạy được qua command', function () {
    var ctx = payrollSetup();
    var r = assertOk(_g.PAYROLL.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [closedShift(ctx, 13, 8)],
      fromTs: D(1, 0), toTs: D(31, 23)
    }));
    var out = assertOk(run(PAY.ClosePayroll, {
      storeId: _g.STORE, monthKey: '2026-03', results: [r]
    }, qlCtx()));
    var closing = out.plan.domainRecords[0].record;
    assert.strictEqual(closing.monthKey, '2026-03');
    assert.strictEqual(closing.total, r.total);
  });

  test('ClosePayroll chuyển khoản trừ trách nhiệm đã áp sang DEDUCTED, ngay trong cùng mutation', function () {
    var ctx = payrollSetup();
    var u = gUnit(1000, 'closepay1');
    var reportOut = assertOk(run(_g.INV.ReportLostContainer, {
      unitId: u.unitId, reason: 'không thấy hũ'
    }));
    var rep = reportOut.plan.domainRecords[0].record;
    var approved = assertOk(run(_g.APR.ApproveLostContainer, {
      lostReportId: rep.lostReportId, lostReport: rep, decision: 'APPROVE',
      reason: 'xác nhận mất', units: [u], employees: [ctx.emp]
    }, qlCtx()));
    var liab = approved.plan.domainRecords[1].record;

    var r = assertOk(_g.PAYROLL.computePayroll({
      registry: ctx.reg, employee: ctx.emp, shifts: [closedShift(ctx, 14, 8)],
      liabilities: [liab], fromTs: D(1, 0), toTs: D(31, 23)
    }));
    var out = assertOk(run(PAY.ClosePayroll, {
      storeId: _g.STORE, monthKey: '2026-03', results: [r], liabilities: [liab]
    }, qlCtx()));

    var liabRecord = out.plan.domainRecords.filter(function (d) { return d.type === 'liability'; })[0].record;
    assert.strictEqual(liabRecord.status, _g.LIAB.STATUS.DEDUCTED);
    assert.strictEqual(liabRecord.payrollClosingId, out.plan.domainRecords[0].record.payrollClosingId);
    assert.strictEqual(out.plan.domainRecords[0].record.total, r.total, 'total đã trừ khoản trách nhiệm');
  });
});
