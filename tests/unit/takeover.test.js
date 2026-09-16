/**
 * Tiếp nhận hệ cũ — hệ mới tự đọc, tự đánh dấu, tự chuyển giao.
 * Contract: SEED-CONTRACT-V1.md.
 */
var _tk = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    CMD: GIEO.require('commands/takeover'),
    BOOT: GIEO.require('bootstrap/legacy-takeover'),
    COMMIT: GIEO.require('persistence-firebase/atomic-commit'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    BOSS: ids.deterministicId('actor', ['boss'])
  };
})();

/* Hình dạng lấy đúng từ export thật của quán. */
function legacyFixture(over) {
  return Object.assign({
    inventoryItems: {
      item_a: { name: 'Đường cát trắng', unit: 'g', countUnitName: 'Gói', costPerUnit: 90,
        packagingUnits: { name: 'Gói', baseQty: 500 }, minStock: 0, trackingMode: 'unit', stockManaged: true }
    },
    stockContainers: {
      SEALED01: { code: 'SEALED01', itemId: 'item_a', status: 'sealed', baseQty: 500, unitBase: 500 },
      OPEN01: { code: 'OPEN01', itemId: 'item_a', status: 'open', baseQty: 380, unitBase: 140, openedAt: 1000 },
      DONE01: { code: 'DONE01', itemId: 'item_a', status: 'finished', baseQty: 500, unitBase: 0 },
      NEG01: { code: 'NEG01', itemId: 'item_a', status: 'open', baseQty: 500, unitBase: -1826 }
    },
    activeUnits: {
      item_a: { c1: { code: 'OPEN01', unitBase: 125.5, openedAt: 900 } }
    },
    recipes: { recipe_a: { sizes: { M: { qty: 0.5 } } }, recipe_bad: {} },
    employees: {
      emp_a: { fullName: 'Nguyễn Hữu Nhân', pin: '3326', payType: 'hourly_full', hourlyRate: 20000, active: false }
    },
    bookClosings: { '2026-08': { doanhThu: 4918000, giaVon: 1473930, lai: -5771853, closedBy: 'management' } }
  }, over || {});
}

function buildOk(over, specOver) {
  return assertOk(_tk.CMD.buildPlan(Object.assign({
    legacy: legacyFixture(over), cutoverDate: '2026-09-20',
    storeId: _tk.STORE, actorId: _tk.BOSS
  }, specOver || {})));
}

describe('commands/takeover — luật tiếp nhận', function () {
  test('lô còn hàng được tiếp nhận, lô đã hết và lô âm thì KHÔNG', function () {
    var out = buildOk();
    var codes = out.plan.unitChanges.map(function (u) { return u.legacyRef; }).sort();
    assert.deepStrictEqual(codes, ['OPEN01', 'SEALED01']);
    var why = out.skipped.filter(function (s) { return s.kind === 'unit'; })
      .map(function (s) { return s.ref; }).sort();
    assert.deepStrictEqual(why, ['DONE01', 'NEG01']);
  });

  test('RTDB thắng cho lô đang mở, và giữ nguyên openedAt của RTDB', function () {
    var u = buildOk().plan.unitChanges.filter(function (x) { return x.legacyRef === 'OPEN01'; })[0];
    assert.strictEqual(u.initialQty, 125.5, 'phải lấy số của tầng nóng, không lấy Firestore');
    assert.strictEqual(u.status, 'OPEN');
    assert.strictEqual(u.openedAt, 900);
  });

  test('lô niêm phong lấy baseQty và KHÔNG bịa mốc mở', function () {
    var u = buildOk().plan.unitChanges.filter(function (x) { return x.legacyRef === 'SEALED01'; })[0];
    assert.strictEqual(u.initialQty, 500);
    assert.strictEqual(u.status, 'SEALED');
    assert.strictEqual(u.openedAt, null);
  });

  test('mọi lô tiếp nhận đều bị ĐÁNH DẤU và không có giá vốn', function () {
    buildOk().plan.unitChanges.forEach(function (u) {
      assert.strictEqual(u.origin, 'LEGACY_SEED');
      assert.strictEqual(u.costBasis, null);
      assert.strictEqual(u.seededAt, '2026-09-20');
      assert.ok(u.needsReviewReasons.indexOf('SEEDED_WITHOUT_COST') !== -1);
    });
  });

  test('giá của hệ cũ KHÔNG thành giá vốn lô, chỉ là gợi ý cho lần nhập tới', function () {
    var item = buildOk().plan.domainRecords
      .filter(function (r) { return r.type === 'item'; })[0].record;
    assert.strictEqual(item.suggestedCostPerUnit, 90);
    assert.strictEqual(item.costPerUnit, undefined, 'không được mang sang dưới tên giá vốn');
  });

  test('KHÔNG sinh bút toán nhập giả cho tồn đầu', function () {
    assert.deepStrictEqual(buildOk().plan.ledgerEntries, []);
  });

  test('công thức và điều khoản lương hiệu lực TỪ mốc cutover, không từ quá khứ', function () {
    var out = buildOk();
    var recipe = out.plan.domainRecords.filter(function (r) { return r.type === 'recipeVersion'; })[0].record;
    assert.strictEqual(recipe.effectiveFrom, '2026-09-20');
    var emp = out.plan.domainRecords.filter(function (r) { return r.type === 'employee'; })[0].record;
    assert.strictEqual(emp.payTerms.effectiveFrom, '2026-09-20');
    assert.strictEqual(emp.payTerms.hourlyRate, 20000);
  });

  test('PIN của hệ cũ KHÔNG mang sang', function () {
    var emp = buildOk().plan.domainRecords
      .filter(function (r) { return r.type === 'employee'; })[0].record;
    assert.strictEqual(emp.pin, undefined);
  });

  test('doanh thu đã chốt đóng băng nguyên trạng, hệ mới không tính lại', function () {
    var rev = buildOk().plan.domainRecords
      .filter(function (r) { return r.type === 'monthlySnapshot'; })[0].record;
    assert.strictEqual(rev.frozen, true);
    assert.strictEqual(rev.values.revenue, 4918000);
    assert.strictEqual(rev.period, '2026-08');
  });

  test('bản ghi hỏng bị bỏ và BÁO RA, không âm thầm biến mất', function () {
    var skipped = buildOk().skipped.filter(function (s) { return s.kind === 'recipe'; });
    assert.strictEqual(skipped.length, 1);
    assert.strictEqual(skipped[0].ref, 'recipe_bad');
  });

  test('chạy lại cùng mốc cutover cho ĐÚNG operationId — không nhân đôi tồn đầu', function () {
    assert.strictEqual(buildOk().plan.operationId, buildOk().plan.operationId);
    assert.strictEqual(buildOk().plan.operationId, _tk.CMD.takeoverOperationId('2026-09-20'));
  });

  test('thiếu một nguồn thì KHÔNG tiếp nhận một phần', function () {
    var legacy = legacyFixture();
    delete legacy.recipes;
    var out = _tk.CMD.buildPlan({
      legacy: legacy, cutoverDate: '2026-09-20', storeId: _tk.STORE, actorId: _tk.BOSS
    });
    assertErr(out, 'PRECONDITION');
    assert.deepStrictEqual(out.error.detail.missing, ['recipes']);
  });

  test('hệ cũ rỗng thì DỪNG — tiếp nhận rỗng trông y hệt tiếp nhận thành công', function () {
    assertErr(_tk.CMD.buildPlan({
      legacy: { inventoryItems: {}, stockContainers: {}, activeUnits: {}, recipes: {}, employees: {}, bookClosings: {} },
      cutoverDate: '2026-09-20', storeId: _tk.STORE, actorId: _tk.BOSS
    }), 'PRECONDITION');
  });

  test('thiếu mốc cutover hoặc thiếu người bấm nút thì từ chối', function () {
    assertErr(_tk.CMD.buildPlan({ legacy: legacyFixture(), storeId: _tk.STORE, actorId: _tk.BOSS }), 'VALIDATION');
    assertErr(_tk.CMD.buildPlan({
      legacy: legacyFixture(), cutoverDate: '2026-09-20', storeId: _tk.STORE
    }), 'VALIDATION');
  });

  test('audit mang theo ranh giới, dán vào dữ liệu chứ không để ở tài liệu rời', function () {
    var audit = buildOk().plan.audit;
    assert.strictEqual(audit.command, 'TakeoverFromLegacy');
    assert.strictEqual(audit.actorId, _tk.BOSS);
    assert.ok(/không truy xuất/.test(audit.boundary));
  });
});

describe('bootstrap/legacy-takeover — hệ mới TỰ đọc hệ cũ', function () {
  function fakeReader(data, failOn) {
    return {
      loadAll: function (name) {
        if (failOn === name) return Promise.resolve(_tk.R.err('RETRYABLE', 'mạng lỗi'));
        return Promise.resolve(_tk.R.ok(data[name]));
      }
    };
  }

  test('đọc đủ nguồn rồi dựng plan, không cần ai chuẩn bị dữ liệu sẵn', function () {
    return _tk.BOOT.run({
      reader: fakeReader(legacyFixture()), cutoverDate: '2026-09-20',
      storeId: _tk.STORE, actorId: _tk.BOSS
    }).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.summary.units, 2);
      assert.strictEqual(out.value.summary.unitsOpen, 1);
      assert.strictEqual(out.value.summary.totalQty, 625.5);
    });
  });

  test('đọc hụt một nguồn thì DỪNG, không đưa dữ liệu khuyết sang lệnh tiếp nhận', function () {
    return _tk.BOOT.run({
      reader: fakeReader(legacyFixture(), 'recipes'), cutoverDate: '2026-09-20',
      storeId: _tk.STORE, actorId: _tk.BOSS
    }).then(function (out) {
      assertErr(out, 'RETRYABLE');
      assert.ok(/KHÔNG tiếp nhận một phần/.test(out.error.message));
    });
  });

  test('reader không phải read port thì từ chối', function () {
    return _tk.BOOT.run({ cutoverDate: '2026-09-20', storeId: _tk.STORE, actorId: _tk.BOSS })
      .then(function (out) { assertErr(out, 'VALIDATION'); });
  });
});

describe('Tiếp nhận ghi qua ĐÚNG đường ghi nguyên tử, không có cửa riêng', function () {
  test('cả plan vào trọn trong một transaction, path đều nằm dưới orgs/', function () {
    var out = buildOk();
    var runner = _tk.COMMIT.createInMemoryRunner();
    var committer = _tk.COMMIT.createCommitter({ transactionRunner: runner.runner });
    var ctx = {
      organizationId: _tk.ORG, storeId: _tk.STORE,
      businessDate: '2026-09-20', clock: _tk.CLK.createClock()
    };
    return committer.commit(out.plan, ctx).then(function (res) {
      assertOk(res);
      assert.strictEqual(runner.commitCount(), 1, 'phải đúng MỘT transaction');
      var outside = res.value.paths.filter(function (p) { return p.indexOf('orgs/') !== 0; });
      assert.deepStrictEqual(outside, [], 'tiếp nhận không được chạm path ngoài namespace mới');
      assert.ok(runner.read('orgs/' + _tk.ORG + '/stores/' + _tk.STORE +
        '/units/unit_seed.SEALED01'), 'lô tiếp nhận phải nằm đúng kho Unit chung');
    });
  });

  test('transaction hỏng thì KHÔNG có tồn đầu nào được ghi', function () {
    var out = buildOk();
    var runner = _tk.COMMIT.createInMemoryRunner();
    runner.failOnce();
    var committer = _tk.COMMIT.createCommitter({ transactionRunner: runner.runner });
    return committer.commit(out.plan, {
      organizationId: _tk.ORG, storeId: _tk.STORE,
      businessDate: '2026-09-20', clock: _tk.CLK.createClock()
    }).then(function (res) {
      assert.strictEqual(_tk.R.isErr(res), true);
      assert.strictEqual(runner.keys().length, 0, 'hỏng giữa chừng không được để lại tồn đầu nửa vời');
    });
  });
});
