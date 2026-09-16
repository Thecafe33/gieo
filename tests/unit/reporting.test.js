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
