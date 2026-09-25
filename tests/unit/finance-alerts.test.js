/**
 * [7] Finance/Config + [8] Alerts.
 * Chuỗi thật: FIFO-CHAIN-TRACE-ALERTS-V1.md. Gap: FEATURE-TREE-V1.md §4.9, §4.17.
 */

var _fa = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    CFG: GIEO.require('finance/config'),
    EXP: GIEO.require('finance/expense'),
    AL: GIEO.require('alerts/alert'),
    VI: GIEO.require('compaction/versioned-input'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    BOSS: ids.deterministicId('actor', ['boss']),
    NV: ids.deterministicId('actor', ['nv01'])
  };
})();

var FD = function (d) { return new Date(2026, 2, d).getTime(); };

describe('finance/config — versioned, có default', function () {
  var CFG = _fa.CFG;

  test('chưa cấu hình thì dùng mặc định và NÓI RÕ là mặc định', function () {
    var r = assertOk(CFG.resolveConfigAt(_fa.VI.createRegistry(), {
      key: 'finishReviewRatio', storeId: _fa.STORE, at: FD(10)
    }));
    assert.strictEqual(r.value, 0.25);
    assert.strictEqual(r.isDefault, true);
    assert.strictEqual(r.versionId, null);
  });

  test('FINISH_REVIEW_RATIO cấu hình ở QUANLY, không hard-code (chủ quán đã chốt)', function () {
    var reg = _fa.VI.createRegistry();
    assertOk(CFG.publishConfig(reg, {
      key: 'finishReviewRatio', storeId: _fa.STORE, effectiveFrom: FD(5),
      value: 0.4, publishedBy: _fa.BOSS
    }));
    var r = assertOk(CFG.resolveConfigAt(reg, { key: 'finishReviewRatio', storeId: _fa.STORE, at: FD(10) }));
    assert.strictEqual(r.value, 0.4);
    assert.strictEqual(r.isDefault, false);
  });

  test('giá trị ngoài khoảng hợp lệ bị từ chối', function () {
    var reg = _fa.VI.createRegistry();
    assertErr(CFG.publishConfig(reg, {
      key: 'finishReviewRatio', storeId: _fa.STORE, effectiveFrom: FD(5), value: 1.5, publishedBy: _fa.BOSS
    }), 'VALIDATION');
  });

  test('khoá lạ bị từ chối — không tạo config không có đường đọc', function () {
    assertErr(CFG.publishConfig(_fa.VI.createRegistry(), {
      key: 'khoaLa', storeId: _fa.STORE, effectiveFrom: FD(5), value: 1, publishedBy: _fa.BOSS
    }), 'VALIDATION');
  });

  test('cấu hình cũ không trôi theo giá trị mới', function () {
    var reg = _fa.VI.createRegistry();
    assertOk(CFG.publishConfig(reg, {
      key: 'cogsPctTarget', storeId: _fa.STORE, effectiveFrom: FD(1), value: 30, publishedBy: _fa.BOSS
    }));
    assertOk(CFG.publishConfig(reg, {
      key: 'cogsPctTarget', storeId: _fa.STORE, effectiveFrom: FD(20), value: 25, publishedBy: _fa.BOSS
    }));
    assert.strictEqual(assertOk(CFG.resolveConfigAt(reg, {
      key: 'cogsPctTarget', storeId: _fa.STORE, at: FD(10)
    })).value, 30);
  });

  describe('KPI target theo TỪNG NGÀY — đóng instance #6', function () {
    test('đổi target giữa kỳ: mỗi ngày dùng target của ĐÚNG ngày đó', function () {
      var reg = _fa.VI.createRegistry();
      assertOk(CFG.publishConfig(reg, {
        key: 'cogsPctTarget', storeId: _fa.STORE, effectiveFrom: FD(1), value: 30, publishedBy: _fa.BOSS
      }));
      assertOk(CFG.publishConfig(reg, {
        key: 'cogsPctTarget', storeId: _fa.STORE, effectiveFrom: FD(4), value: 25, publishedBy: _fa.BOSS
      }));
      var daily = assertOk(CFG.resolveConfigDaily(reg, {
        key: 'cogsPctTarget', storeId: _fa.STORE, fromTs: FD(1), toTs: FD(5), clock: _fa.CLK.createClock()
      }));
      assert.strictEqual(daily['2026-03-02'].version.payload.value, 30);
      assert.strictEqual(daily['2026-03-05'].version.payload.value, 25,
        'target của ngày cuối bị áp cho cả kỳ — đúng bug legacy');
    });

    test('chưa đặt target nào thì mọi ngày dùng mặc định và đánh dấu isDefault', function () {
      var daily = assertOk(CFG.resolveConfigDaily(_fa.VI.createRegistry(), {
        key: 'maxCashCounts', storeId: _fa.STORE, fromTs: FD(1), toTs: FD(3), clock: _fa.CLK.createClock()
      }));
      assert.strictEqual(daily['2026-03-02'].isDefault, true);
      assert.strictEqual(daily['2026-03-02'].value, 3);
    });
  });
});

describe('finance/expense', function () {
  var E = _fa.EXP;

  function exp(over) {
    return E.createExpense(Object.assign({
      storeId: _fa.STORE, actorId: _fa.NV, categoryId: 'dien-nuoc', amount: 500000,
      nature: 'FIXED', status: 'ACTUAL', businessDate: '2026-03-10', operationId: 'operation_e1'
    }, over || {}));
  }

  test('phải khai rõ ước tính hay số thật — điều kiện chốt sổ phụ thuộc nó', function () {
    var r = E.createExpense({
      storeId: _fa.STORE, actorId: _fa.NV, categoryId: 'x', amount: 1,
      nature: 'FIXED', businessDate: '2026-03-10', operationId: 'op'
    });
    assertErr(r, 'VALIDATION');
    assert.ok(/chốt sổ/.test(r.error.message));
  });

  test('phải có actor — ai ghi khoản này', function () {
    assertErr(exp({ actorId: null }), 'VALIDATION');
  });

  test('chốt số thật giữ lại số ước cũ', function () {
    var e = assertOk(exp({ status: 'ESTIMATED', amount: 500000 }));
    var settled = assertOk(E.settleEstimate(e, {
      actualAmount: 620000, actorId: _fa.BOSS, operationId: 'operation_s', at: 1000
    }));
    assert.strictEqual(settled.amount, 620000);
    assert.strictEqual(settled.status, 'ACTUAL');
    assert.strictEqual(settled.revisions[0].from.amount, 500000);
  });

  test('khoản đã là số thật thì không chốt lại', function () {
    assertErr(E.settleEstimate(assertOk(exp()), {
      actualAmount: 1, actorId: _fa.BOSS, operationId: 'op'
    }), 'PRECONDITION');
  });

  test('còn khoản ước tính thì CHẶN chốt sổ, nêu rõ khoản nào', function () {
    var b = E.closeBookBlockers([assertOk(exp({ status: 'ESTIMATED' })), assertOk(exp())]);
    assert.strictEqual(b.length, 1);
    assert.ok(/còn là số ước tính/.test(b[0]));
  });

  test('khoản chưa duyệt cũng chặn', function () {
    assert.strictEqual(E.closeBookBlockers([assertOk(exp({ status: 'PENDING_APPROVAL' }))]).length, 1);
  });

  test('tổng tách cố định / biến phí và ước tính / thật', function () {
    var s = E.summarize([
      assertOk(exp({ nature: 'FIXED', amount: 1000 })),
      assertOk(exp({ nature: 'VARIABLE', amount: 500, status: 'ESTIMATED' })),
      assertOk(exp({ nature: 'VARIABLE', amount: 300, status: 'REJECTED' }))
    ]);
    assert.strictEqual(s.fixed, 1000);
    assert.strictEqual(s.variable, 500);
    assert.strictEqual(s.estimated, 500);
    assert.strictEqual(s.total, 1500, 'khoản bị từ chối vẫn bị cộng vào tổng');
  });
});

describe('alerts/alert', function () {
  var A = _fa.AL;

  function raise(type, over) {
    return A.raise(Object.assign({
      type: type, storeId: _fa.STORE, businessDate: '2026-03-10', at: 1000,
      subjectKey: 'subj-' + type
    }, over || {}));
  }

  describe('severity ĐƯỢC DÙNG để xếp hạng (fix §2)', function () {
    test('alert danger không bị nuốt vào bucket chung', function () {
      var danger = assertOk(raise('UNTRACKED_CONSUMPTION', { data: { itemId: 'item_x', qty: 5 } }));
      var warn = assertOk(raise('LOW_STOCK', { data: { itemId: 'item_y', currentStock: 2, threshold: 10 } }));
      var b = A.bucketize([warn, danger]);
      assert.strictEqual(b.DANGER.length, 1);
      assert.strictEqual(b.DANGER[0].type, 'UNTRACKED_CONSUMPTION');
    });

    test('KHÔNG có bucket "khác" — mọi loại đều có nhà', function () {
      var all = Object.keys(A.TYPES).map(function (t) {
        var data = {};
        A.TYPES[t].required.forEach(function (k) { data[k] = 'x'; });
        return assertOk(raise(t, { data: data, subjectKey: t }));
      });
      var b = A.bucketize(all);
      assert.strictEqual(b.DANGER.length + b.WARNING.length + b.INFO.length, all.length);
      assert.strictEqual(b.OTHER, undefined);
    });

    test('danger luôn đứng trước warning', function () {
      var danger = assertOk(raise('CASH_VARIANCE', { at: 9000, data: { segmentId: 's1', variance: -50000 } }));
      var warn = assertOk(raise('LOW_STOCK', { at: 1000, data: { itemId: 'i', currentStock: 1, threshold: 5 } }));
      assert.strictEqual(A.rank([warn, danger])[0].severity, 'DANGER');
    });

    test('cùng mức thì cũ đứng trước — việc tồn lâu không bị lùi xuống cuối', function () {
      var old = assertOk(raise('LOW_STOCK', { at: 1000, subjectKey: 'a', data: { itemId: 'a', currentStock: 1, threshold: 5 } }));
      var recent = assertOk(raise('LOW_STOCK', { at: 9000, subjectKey: 'b', data: { itemId: 'b', currentStock: 1, threshold: 5 } }));
      assert.strictEqual(A.rank([recent, old])[0].subjectKey, 'a');
    });
  });

  describe('PUSH nhất quán theo mức nghiêm trọng (fix §4)', function () {
    test('hạn dùng BTP push ngang hạn dùng chai/hũ — legacy chôn BTP trong màn Tài chính', function () {
      assert.strictEqual(A.TYPES.PREP_BATCH_EXPIRING.severity, A.TYPES.CONTAINER_EXPIRING.severity);
      assert.strictEqual(A.TYPES.PREP_BATCH_EXPIRING.audience, A.TYPES.CONTAINER_EXPIRING.audience);
    });

    test('tồn thấp hiện ở CẢ POS lẫn QUANLY — legacy chỉ QUANLY', function () {
      assert.strictEqual(A.TYPES.LOW_STOCK.audience, 'BOTH');
      var low = assertOk(raise('LOW_STOCK', { data: { itemId: 'i', currentStock: 1, threshold: 5 } }));
      assert.strictEqual(A.rank([low], { audience: 'POS' }).length, 1);
      assert.strictEqual(A.rank([low], { audience: 'QUANLY' }).length, 1);
    });

    test('lọc theo người xem: cảnh báo chỉ dành QUANLY không lọt sang POS', function () {
      var ql = assertOk(raise('CASH_VARIANCE', { data: { segmentId: 's', variance: -1 } }));
      assert.strictEqual(A.rank([ql], { audience: 'POS' }).length, 0);
      assert.strictEqual(A.rank([ql], { audience: 'QUANLY' }).length, 1);
    });

    test('STOCKOUT có đủ 3 chân: sinh từ FIFO, lưu, so target (fix dead-code §8)', function () {
      var so = assertOk(raise('STOCKOUT', { data: { itemId: 'item_sua', menuItemIds: ['item_m1'] } }));
      assert.strictEqual(so.severity, 'DANGER');
      assert.strictEqual(so.data.menuItemIds.length, 1);
    });
  });

  describe('mỗi loại giữ nội dung chẩn đoán riêng (fix §4.9)', function () {
    test('thiếu trường bắt buộc thì TỪ CHỐI tạo cảnh báo', function () {
      var r = raise('CASH_VARIANCE', { data: { segmentId: 's1' } });
      assertErr(r, 'VALIDATION');
      assert.ok(/thiếu trường chẩn đoán bắt buộc "variance"/.test(r.error.message));
    });

    test('loại chưa đăng ký bị từ chối', function () {
      assertErr(raise('CANH_BAO_LA', { data: {} }), 'VALIDATION');
    });

    test('alertId xác định — cùng vấn đề không sinh 20 cảnh báo', function () {
      var d = { itemId: 'i', currentStock: 1, threshold: 5 };
      assert.strictEqual(
        assertOk(raise('LOW_STOCK', { data: d })).alertId,
        assertOk(raise('LOW_STOCK', { data: d })).alertId
      );
    });
  });

  describe('đóng cảnh báo (fix §6 — "đã xem" tắt y hệt "đã xử lý")', function () {
    function cashVar() {
      return assertOk(raise('CASH_VARIANCE', { data: { segmentId: 's1', variance: -50000 } }));
    }

    test('"đã xem" KHÔNG tắt push — vấn đề gốc vẫn còn', function () {
      var seen = assertOk(A.markSeen(cashVar(), { actorId: _fa.BOSS, at: 2000 }));
      assert.strictEqual(seen.status, 'SEEN');
      assert.strictEqual(A.rank([seen]).length, 1, 'bấm "đã xem" làm cảnh báo biến mất');
    });

    test('đóng loại không tự kiểm chứng BẮT BUỘC có referenceId trỏ hành động đã sửa', function () {
      var r = A.resolve(cashVar(), { actorId: _fa.BOSS, at: 3000 });
      assertErr(r, 'VALIDATION');
      assert.ok(/referenceId/.test(r.error.message));
    });

    test('có referenceId thì đóng được và lưu lại tham chiếu', function () {
      var done = assertOk(A.resolve(cashVar(), {
        actorId: _fa.BOSS, at: 3000, referenceId: 'operation_revise_1'
      }));
      assert.strictEqual(done.status, 'RESOLVED');
      assert.strictEqual(done.resolvedReferenceId, 'operation_revise_1');
      assert.strictEqual(A.rank([done]).length, 0);
    });

    test('loại tự kiểm chứng KHÔNG cho tắt tay — bấm tắt là bỏ qua vấn đề gốc', function () {
      var low = assertOk(raise('LOW_STOCK', { data: { itemId: 'i', currentStock: 1, threshold: 5 } }));
      var r = A.resolve(low, { actorId: _fa.BOSS, referenceId: 'x' });
      assertErr(r, 'PRECONDITION');
      assert.ok(/tự đóng khi điều kiện thật sự hết/.test(r.error.message));
    });
  });

  describe('tự đóng khi điều kiện hết — pattern FIFO bell thành mặc định (§3)', function () {
    test('hết tồn thấp thì cảnh báo tự biến mất', function () {
      var low = assertOk(raise('LOW_STOCK', {
        subjectKey: 'item_sua', data: { itemId: 'item_sua', currentStock: 1, threshold: 5 }
      }));
      var out = assertOk(A.reconcile([low], { stillActiveKeys: [], at: 5000 }));
      assert.strictEqual(out.cleared.length, 1);
      assert.strictEqual(out.alerts[0].status, 'AUTO_CLEARED');
      assert.strictEqual(A.rank(out.alerts).length, 0);
    });

    test('vấn đề còn thì cảnh báo còn', function () {
      var low = assertOk(raise('LOW_STOCK', {
        subjectKey: 'item_sua', data: { itemId: 'item_sua', currentStock: 1, threshold: 5 }
      }));
      var out = assertOk(A.reconcile([low], { stillActiveKeys: ['item_sua'], at: 5000 }));
      assert.strictEqual(out.cleared.length, 0);
      assert.strictEqual(out.alerts[0].status, 'NEW');
    });

    test('loại cần người xử lý KHÔNG bị tự đóng', function () {
      var cv = assertOk(raise('CASH_VARIANCE', { subjectKey: 's1', data: { segmentId: 's1', variance: -1 } }));
      var out = assertOk(A.reconcile([cv], { stillActiveKeys: [], at: 5000 }));
      assert.strictEqual(out.cleared.length, 0);
      assert.strictEqual(out.alerts[0].status, 'NEW');
    });
  });

  test('kênh ngoài app là chỗ nối sẵn — engine chỉ phát event (§6 luồng chuẩn)', function () {
    var low = assertOk(raise('LOW_STOCK', { data: { itemId: 'i', currentStock: 1, threshold: 5 } }));
    var ev = A.toEvents([low])[0];
    assert.strictEqual(ev.type, 'AlertRaised');
    assert.strictEqual(ev.severity, 'WARNING');
    assert.strictEqual(ev.audience, 'BOTH');
  });
});
