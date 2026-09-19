/**
 * [9] Reporting.
 * Chuỗi thật: FIFO-CHAIN-TRACE-REPORTING-V1.md. Gap: GIEO-REBUILD-HANDOFF-V2.md §4.2.
 */

var _rp = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    IV: GIEO.require('reporting/inventory-valuation'),
    EX: GIEO.require('reporting/export-payload'),
    VR: GIEO.require('reporting/variance-report'),
    U: GIEO.require('fifo-core/unit'),
    AL: GIEO.require('alerts/alert'),
    STORE: ids.deterministicId('store', ['main']),
    NV: ids.deterministicId('actor', ['nv01']),
    SUA: ids.deterministicId('item', ['sua'])
  };
})();

function vUnit(unitCost, qty, status, tag) {
  var u = assertOk(_rp.U.createUnit({
    unitId: _rp.ids.deterministicId('unit', [tag || ('u' + unitCost)]),
    itemId: _rp.SUA, storeId: _rp.STORE, itemKind: 'raw', initialQty: qty,
    costBasis: { unitCost: unitCost, versionId: 'version_c' + unitCost },
    operationId: 'operation_r'
  }));
  if (status === 'SEALED') return u;
  u = assertOk(_rp.U.open(u, { at: 1000, actorId: _rp.NV, operationId: 'operation_o' }));
  return Object.assign({}, u, { remainingQty: qty });
}

describe('reporting/inventory-valuation — giá LÔ THẬT, không phải scalar gần nhất', function () {
  var IV = _rp.IV;

  test('nhiều lô giá khác nhau được cộng theo đúng giá từng lô', function () {
    var v = assertOk(IV.valuate({ units: [vUnit(30, 100, 'OPEN', 'a'), vUnit(50, 100, 'OPEN', 'b')] }));
    assert.strictEqual(v.tracked.value, 100 * 30 + 100 * 50);
    assert.strictEqual(v.tracked.basis, 'FIFO_ACTUAL');
  });

  test('KHÔNG quy hết về giá gần nhất — đúng lỗi legacy', function () {
    var v = assertOk(IV.valuate({ units: [vUnit(30, 100, 'OPEN', 'a'), vUnit(50, 100, 'OPEN', 'b')] }));
    assert.notStrictEqual(v.tracked.value, 200 * 50, 'tồn bị quy hết về giá lô mới nhất');
    assert.notStrictEqual(v.tracked.value, 200 * 30);
  });

  test('hũ chưa mở tính theo dung tích ban đầu, hũ đang dùng tính theo số còn lại', function () {
    var sealed = vUnit(30, 1000, 'SEALED', 's');
    var open = vUnit(30, 1000, 'OPEN', 'o');
    open = Object.assign({}, open, { remainingQty: 400 });
    var v = assertOk(IV.valuate({ units: [sealed, open] }));
    assert.strictEqual(v.tracked.qty, 1400);
  });

  test('hũ đã hết / đã mất không tính vào giá trị tồn', function () {
    var done = assertOk(_rp.U.finish(vUnit(30, 100, 'OPEN', 'd'), {
      at: 2000, actorId: _rp.NV, operationId: 'operation_f'
    })).unit;
    assert.strictEqual(assertOk(IV.valuate({ units: [done] })).tracked.qty, 0);
  });

  test('Unit không có costBasis thì từ chối định giá, không đoán', function () {
    var bad = Object.assign({}, vUnit(30, 100, 'OPEN', 'x'), { costBasis: null });
    assertErr(IV.valuate({ units: [bad] }), 'PRECONDITION');
  });

  describe('trộn 2 cơ sở giá phải NÓI RA (§4)', function () {
    test('phần tồn không gắn lô tách riêng, có nhãn cơ sở giá khác', function () {
      var v = assertOk(IV.valuate({
        units: [vUnit(30, 100, 'OPEN', 'a')], untrackedBase: 50, latestUnitCost: 40
      }));
      assert.strictEqual(v.untracked.basis, 'LATEST_COST');
      assert.strictEqual(v.untracked.value, 2000);
      assert.strictEqual(v.mixedBasis, true);
      assert.strictEqual(v.totalValue, 3000 + 2000);
    });

    test('không trộn thì mixedBasis = false', function () {
      assert.strictEqual(assertOk(IV.valuate({ units: [vUnit(30, 100, 'OPEN', 'a')] })).mixedBasis, false);
    });

    test('có tồn không gắn lô mà không biết giá gần nhất thì từ chối', function () {
      assertErr(IV.valuate({ units: [], untrackedBase: 50 }), 'NOT_FOUND');
    });

    test('nhãn cơ sở giá đọc được bằng tiếng người', function () {
      assert.ok(/từng lô/.test(IV.describeBasis('FIFO_ACTUAL')));
      assert.ok(/gần nhất/.test(IV.describeBasis('LATEST_COST')));
    });
  });
});

describe('reporting/variance-report — actual vs theoretical là chỉ số CHÍNH', function () {
  var VR = _rp.VR;

  function cogs(theo, act) {
    return {
      cogsTheoretical: theo, cogsActual: act,
      variance: act === null ? null : act - theo,
      variancePct: act === null ? null : ((act - theo) / theo) * 100,
      missingActual: act === null ? [{ billId: 'bill_x', reason: 'SHORTFALL' }] : []
    };
  }

  test('khớp trong ngưỡng thì OK', function () {
    assert.strictEqual(assertOk(VR.build({ cogs: cogs(100000, 102000) })).status, 'OK');
  });

  test('vượt ngưỡng thì OVER, và NÊU 2 nguyên nhân gốc legacy không phân biệt được', function () {
    var r = assertOk(VR.build({ cogs: cogs(100000, 140000) }));
    assert.strictEqual(r.status, 'OVER');
    assert.strictEqual(r.possibleCauses.length, 2);
    assert.ok(/định mức khai sai/.test(r.possibleCauses[0]));
  });

  test('thấp hơn định mức cũng là bất thường, không phải tin vui im lặng', function () {
    assert.strictEqual(assertOk(VR.build({ cogs: cogs(100000, 60000) })).status, 'UNDER');
  });

  test('thiếu vế actual → UNKNOWN, KHÔNG lấy theoretical so với chính nó rồi báo khớp', function () {
    var r = assertOk(VR.build({ cogs: cogs(100000, null) }));
    assert.strictEqual(r.status, 'UNKNOWN');
    assert.strictEqual(r.variance, null);
    assert.ok(/chưa đủ dữ liệu lô/.test(r.message));
    assert.strictEqual(r.missingActual.length, 1);
  });

  test('tỉ lệ giá vốn tính trên doanh thu thuần', function () {
    var r = assertOk(VR.build({ cogs: cogs(300000, 310000), revenue: { netRevenue: 1000000 } }));
    assert.strictEqual(r.cogsPctActual, 31);
    assert.strictEqual(r.cogsPctTheoretical, 30);
  });

  test('vượt target thì PHÁT cảnh báo chủ động (fix §6 — legacy chỉ hiện thụ động)', function () {
    var r = assertOk(VR.build({
      cogs: cogs(300000, 400000), revenue: { netRevenue: 1000000 }, targetPct: 35
    }));
    assert.strictEqual(r.overTarget, true);
    var alerts = VR.toAlerts(r, { storeId: _rp.STORE, businessDate: '2026-03-10' });
    assert.strictEqual(alerts.length, 1);
    /* Cảnh báo phải hợp lệ với alerts domain, không phải object tự chế. */
    var built = assertOk(_rp.AL.raise(Object.assign({ businessDate: '2026-03-10' }, alerts[0])));
    assert.strictEqual(built.type, 'COGS_OVER_TARGET');
    assert.strictEqual(built.severity, 'WARNING');
  });

  test('dưới target thì không phát cảnh báo thừa', function () {
    var r = assertOk(VR.build({
      cogs: cogs(300000, 300000), revenue: { netRevenue: 1000000 }, targetPct: 35
    }));
    assert.strictEqual(VR.toAlerts(r, { storeId: _rp.STORE, businessDate: '2026-03-10' }).length, 0);
  });

  test('không có target thì overTarget = null, không đoán là đạt', function () {
    var r = assertOk(VR.build({ cogs: cogs(300000, 310000), revenue: { netRevenue: 1000000 } }));
    assert.strictEqual(r.overTarget, null);
  });
});

describe('reporting/export-payload — export ĐÃ ĐỊNH DẠNG (fix §6, legacy chỉ dump JSON thô)', function () {
  var EX = _rp.EX;

  var cols = [
    { key: 'itemId', label: 'Nguyên liệu' },
    { key: 'qty', label: 'Số lượng' },
    { key: 'value', label: 'Giá trị' }
  ];
  var rows = [{ itemId: 'item_sua', qty: 100, value: 3000 }];

  test('CSV có header và dòng dữ liệu', function () {
    var csv = assertOk(EX.toCsv({ columns: cols, rows: rows }));
    assert.strictEqual(csv.split('\n')[0], 'Nguyên liệu,Số lượng,Giá trị');
    assert.strictEqual(csv.split('\n')[1], 'item_sua,100,3000');
  });

  test('escape dấu phẩy và dấu nháy', function () {
    var csv = assertOk(EX.toCsv({
      columns: [{ key: 'name', label: 'Tên' }],
      rows: [{ name: 'Trà sữa, size L' }, { name: 'Ly 16"' }]
    }));
    assert.ok(csv.indexOf('"Trà sữa, size L"') !== -1);
    /* Dấu nháy trong dữ liệu phải được nhân đôi theo chuẩn CSV: Ly 16" → "Ly 16""" */
    assert.ok(csv.indexOf('"Ly 16"""') !== -1);
  });

  test('phải khai cột — thứ tự suy từ object sẽ đổi giữa các lần export', function () {
    assertErr(EX.toCsv({ rows: rows }), 'VALIDATION');
  });

  test('cột tính được qua hàm', function () {
    var csv = assertOk(EX.toCsv({
      columns: [{ label: 'Đơn giá', value: function (r) { return r.value / r.qty; } }], rows: rows
    }));
    assert.strictEqual(csv.split('\n')[1], '30');
  });

  describe('payload mang đủ ngữ cảnh (§8)', function () {
    function build(over) {
      return EX.buildExport(Object.assign({
        title: 'Tồn kho', period: '2026-03', storeId: _rp.STORE,
        columns: cols, rows: rows,
        meta: { computedAt: 1700000000000, frozen: false, sources: ['LIVE'], ambiguous: [] }
      }, over || {}));
    }

    test('luôn có computedAt — không tuỳ màn hình có hay không', function () {
      assert.strictEqual(assertOk(build()).computedAt, 1700000000000);
    });

    test('chưa đóng băng thì DÁN CẢNH BÁO ngay trên file', function () {
      var n = assertOk(build()).notices;
      assert.ok(n.some(function (x) { return /chưa đóng băng/.test(x); }));
    });

    test('đã đóng băng thì không dán cảnh báo đó', function () {
      var n = assertOk(build({ meta: { frozen: true, sources: ['SNAPSHOT'], computedAt: 1 } })).notices;
      assert.ok(!n.some(function (x) { return /chưa đóng băng/.test(x); }));
    });

    test('dữ liệu cũ mập mờ được cảnh báo, không im lặng xuất ra', function () {
      var n = assertOk(build({
        meta: { frozen: true, computedAt: 1, ambiguous: [{ ref: 'x' }, { ref: 'y' }] }
      })).notices;
      assert.ok(n.some(function (x) { return /2 mục dữ liệu cũ/.test(x); }));
    });

    test('trộn cơ sở giá và còn chi phí ước tính đều được dán rõ', function () {
      var n = assertOk(build({ mixedBasis: true, hasEstimatedExpenses: true })).notices;
      assert.ok(n.some(function (x) { return /2 cơ sở giá/.test(x); }));
      assert.ok(n.some(function (x) { return /chưa phải số cuối/.test(x); }));
    });

    test('thiếu tiêu đề hoặc kỳ thì từ chối', function () {
      assertErr(build({ title: null }), 'VALIDATION');
      assertErr(build({ period: null }), 'VALIDATION');
    });
  });

  test('trích xuất thô GIỮ RIÊNG, không thay thế export báo cáo', function () {
    var raw = assertOk(EX.rawExtract({ storeId: _rp.STORE, period: '2026-03', data: { x: 1 } }));
    assert.strictEqual(raw.kind, 'RAW_EXTRACT');
    assert.ok(/KHÔNG phải báo cáo/.test(raw.purpose));
  });
});

describe('P11 — usage / waste / lost từ MỘT lần đọc sổ', function () {
  var U = GIEO.require('reporting/usage-report');
  var ids = GIEO.require('shared-kernel/ids');
  var SUA = ids.deterministicId('item', ['sua']);
  var DUONG = ids.deterministicId('item', ['duong']);
  var U1 = ids.deterministicId('unit', ['u1']);

  function e(type, itemId, qtyDelta, unitId) {
    return { entryId: type + itemId + qtyDelta, type: type, itemId: itemId, qtyDelta: qtyDelta, unitId: unitId || null };
  }

  function ed(type, itemId, qtyDelta, businessDate, unitId) {
    return Object.assign(e(type, itemId, qtyDelta, unitId), { businessDate: businessDate });
  }

  test('tách đúng cột, net giữ dấu còn cột hao là độ lớn', function () {
    var r = assertOk(U.build({ entries: [
      e('RECEIVING', SUA, 1000, U1),
      e('CONSUMPTION', SUA, -300, U1),
      e('WASTE', SUA, -50, U1)
    ] }));
    var row = r.rows[0];
    assert.strictEqual(row.received, 1000);
    assert.strictEqual(row.consumed, 300);
    assert.strictEqual(row.waste, 50);
    assert.strictEqual(row.net, 650);
  });

  test('phần không gắn được Unit để RIÊNG, không lẫn vào hao hụt', function () {
    var r = assertOk(U.build({ entries: [
      e('CONSUMPTION', SUA, -100, U1),
      e('CONSUMPTION', SUA, -40, null)
    ] }));
    assert.strictEqual(r.rows[0].consumed, 140);
    assert.strictEqual(r.rows[0].untrackedQty, 40);
    assert.strictEqual(r.rows[0].waste, 0);
  });

  test('loại bút toán chưa khai được BÁO RA, không im lặng bỏ qua', function () {
    var r = assertOk(U.build({ entries: [e('MOT_LOAI_LA', SUA, -10, U1)] }));
    assert.deepStrictEqual(r.unknownTypes, ['MOT_LOAI_LA']);
    assert.strictEqual(r.rows.length, 0);
  });

  test('mất và tìm lại hiện cùng nhau, không triệt tiêu thành 0', function () {
    var r = assertOk(U.build({ entries: [
      e('LOST', SUA, -200, U1),
      e('FOUND', SUA, 200, U1)
    ] }));
    var loss = U.lossOnly(r);
    assert.strictEqual(loss.totalLost, 200);
    assert.strictEqual(loss.totalFound, 200);
    assert.strictEqual(loss.netLost, 0);
    assert.strictEqual(loss.rows.length, 1, 'mặt hàng từng mất phải còn trong danh sách');
  });

  test('nhiều mặt hàng tách dòng, tổng cộng đúng', function () {
    var r = assertOk(U.build({ entries: [
      e('WASTE', SUA, -50, U1),
      e('WASTE', DUONG, -20, U1)
    ] }));
    assert.strictEqual(r.rows.length, 2);
    assert.strictEqual(r.totals.waste, 70);
  });

  describe('RM7 — buildDaily, cùng luật build() nhưng thêm chiều businessDate', function () {
    test('mỗi ngày một dòng theo mặt hàng, sắp theo ngày rồi theo itemId', function () {
      var r = assertOk(U.buildDaily({ entries: [
        ed('WASTE', SUA, -50, '2026-03-10', U1),
        ed('WASTE', SUA, -20, '2026-03-11', U1),
        ed('CONSUMPTION', DUONG, -30, '2026-03-10', U1)
      ] }));
      assert.strictEqual(r.rows.length, 3);
      assert.strictEqual(r.rows[0].dateKey, '2026-03-10');
      assert.strictEqual(r.rows[0].itemId, DUONG);
      assert.strictEqual(r.rows[1].dateKey, '2026-03-10');
      assert.strictEqual(r.rows[1].itemId, SUA);
      assert.strictEqual(r.rows[1].waste, 50);
      assert.strictEqual(r.rows[2].dateKey, '2026-03-11');
      assert.strictEqual(r.rows[2].waste, 20);
    });

    test('có tổng theo ngày gộp mọi mặt hàng — con số đầu chủ quán nhìn vào', function () {
      var r = assertOk(U.buildDaily({ entries: [
        ed('WASTE', SUA, -50, '2026-03-10', U1),
        ed('WASTE', DUONG, -20, '2026-03-10', U1),
        ed('WASTE', SUA, -5, '2026-03-11', U1)
      ] }));
      assert.strictEqual(r.days.length, 2);
      assert.strictEqual(r.days[0].dateKey, '2026-03-10');
      assert.strictEqual(r.days[0].waste, 70);
      assert.strictEqual(r.days[1].dateKey, '2026-03-11');
      assert.strictEqual(r.days[1].waste, 5);
    });

    test('cùng ledger đọc bằng build() (cả kỳ) và buildDaily() (theo ngày) phải khớp tổng', function () {
      var entries = [
        ed('RECEIVING', SUA, 1000, '2026-03-10', U1),
        ed('CONSUMPTION', SUA, -300, '2026-03-10', U1),
        ed('CONSUMPTION', SUA, -150, '2026-03-11', U1),
        ed('WASTE', SUA, -20, '2026-03-11', U1)
      ];
      var whole = assertOk(U.build({ entries: entries }));
      var daily = assertOk(U.buildDaily({ entries: entries }));
      var sumByCol = function (col) {
        return daily.days.reduce(function (s, d) { return s + d[col]; }, 0);
      };
      assert.strictEqual(sumByCol('received'), whole.totals.received);
      assert.strictEqual(sumByCol('consumed'), whole.totals.consumed);
      assert.strictEqual(sumByCol('waste'), whole.totals.waste);
    });

    test('phần chưa gắn lô vẫn tách riêng theo từng ngày, không gộp lẫn hao hụt', function () {
      var r = assertOk(U.buildDaily({ entries: [
        ed('CONSUMPTION', SUA, -40, '2026-03-10', null)
      ] }));
      assert.strictEqual(r.rows[0].untrackedQty, 40);
      assert.strictEqual(r.rows[0].waste, 0);
    });

    test('loại bút toán chưa khai vẫn được báo ra như build()', function () {
      var r = assertOk(U.buildDaily({ entries: [ed('MOT_LOAI_LA', SUA, -10, '2026-03-10', U1)] }));
      assert.deepStrictEqual(r.unknownTypes, ['MOT_LOAI_LA']);
      assert.strictEqual(r.rows.length, 0);
      assert.strictEqual(r.days.length, 0);
    });
  });
});
