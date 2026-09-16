/**
 * [1] Catalog — Menu / Category / Promotion / Packaging.
 * Chuỗi thật: FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md.
 * Gap: FEATURE-TREE-V1.md §4.1-4.3, §4.8, §4.13, §4.14.
 */

var _c = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    M: GIEO.require('catalog/menu'),
    P: GIEO.require('catalog/promotion'),
    PK: GIEO.require('catalog/packaging'),
    VI: GIEO.require('compaction/versioned-input'),
    STORE: ids.deterministicId('store', ['main']),
    BOSS: ids.deterministicId('actor', ['boss'])
  };
})();

function mkItem(over) {
  return assertOk(_c.M.createMenuItem(Object.assign({
    name: 'Trà sữa', storeId: _c.STORE, prices: { M: 30000, L: 40000 }
  }, over || {})));
}

describe('catalog/menu', function () {
  var M = _c.M;

  test('món cần bảng giá theo size', function () {
    assertErr(M.createMenuItem({ name: 'x', storeId: _c.STORE, prices: {} }), 'VALIDATION');
    assertErr(M.createMenuItem({ name: 'x', storeId: _c.STORE, prices: { M: -1 } }), 'VALIDATION');
  });

  describe('recipeId là con trỏ tường minh (fix §9/§10 chain-trace)', function () {
    test('món mới chưa khai định mức thì recipeId = null, nói ra được', function () {
      assert.strictEqual(mkItem().recipeId, null);
    });

    test('trỏ món sang recipe khác là thao tác độc lập — legacy không có', function () {
      var rid = _c.ids.newId('recipe');
      var linked = assertOk(M.linkRecipe(mkItem(), rid));
      assert.strictEqual(linked.recipeId, rid);
      assert.strictEqual(assertOk(M.linkRecipe(linked, null)).recipeId, null);
    });

    test('linkRecipe từ chối id sai loại', function () {
      assertErr(M.linkRecipe(mkItem(), _c.ids.newId('item')), 'VALIDATION');
    });

    test('ĐỔI TÊN giữ nguyên id và recipeId — recipe KHÔNG mồ côi', function () {
      var rid = _c.ids.newId('recipe');
      var item = assertOk(M.linkRecipe(mkItem({ name: 'Trà sữa' }), rid));
      var renamed = assertOk(M.rename(item, 'Trà sữa trân châu'));
      assert.strictEqual(renamed.menuItemId, item.menuItemId, 'đổi tên sinh id mới — recipe sẽ mồ côi');
      assert.strictEqual(renamed.recipeId, rid);
      assert.strictEqual(renamed.name, 'Trà sữa trân châu');
    });
  });

  describe('soft-delete (fix xoá cứng không cascade)', function () {
    test('ngưng bán giữ nguyên bản ghi, tham chiếu vẫn resolve được', function () {
      var item = mkItem();
      var gone = assertOk(M.archive(item, 5000));
      assert.strictEqual(gone.archived, true);
      assert.strictEqual(gone.menuItemId, item.menuItemId);
      assert.strictEqual(gone.name, item.name);
    });

    test('ngưng bán 2 lần bị chặn; khôi phục được', function () {
      var gone = assertOk(M.archive(mkItem(), 5000));
      assertErr(M.archive(gone, 6000), 'PRECONDITION');
      assert.strictEqual(assertOk(M.restore(gone)).archived, false);
    });
  });

  describe('category là entity thật (fix §2 chain-trace)', function () {
    test('thứ tự hiển thị được LƯU, không suy ra lúc render', function () {
      assertErr(M.createCategory({ name: 'Trà', storeId: _c.STORE }), 'VALIDATION');
      assert.strictEqual(assertOk(M.createCategory({ name: 'Trà', storeId: _c.STORE, displayOrder: 2 })).displayOrder, 2);
    });

    test('thứ tự ổn định giữa các lần tải, không phụ thuộc thứ tự mảng', function () {
      var a = assertOk(M.createCategory({ name: 'Cà phê', storeId: _c.STORE, displayOrder: 1 }));
      var b = assertOk(M.createCategory({ name: 'Trà', storeId: _c.STORE, displayOrder: 0 }));
      assert.deepStrictEqual(M.sortCategories([a, b]).map(function (c) { return c.name; }), ['Trà', 'Cà phê']);
      assert.deepStrictEqual(M.sortCategories([b, a]).map(function (c) { return c.name; }), ['Trà', 'Cà phê']);
    });

    test('buildMenuView lọc món/nhóm đã ngưng bán', function () {
      var cat = assertOk(M.createCategory({ name: 'Trà', storeId: _c.STORE, displayOrder: 0 }));
      var live = mkItem({ name: 'A', categoryId: cat.categoryId });
      var dead = assertOk(M.archive(mkItem({ name: 'B', categoryId: cat.categoryId }), 1));
      var view = assertOk(M.buildMenuView({ categories: [cat], menuItems: [live, dead] }));
      assert.strictEqual(view[0].items.length, 1);
      assert.strictEqual(view[0].items[0].name, 'A');
    });
  });

  describe('giá snapshot vào giỏ — mẫu ĐÚNG của legacy cần giữ (§8)', function () {
    test('snapshot mang theo giá tại thời điểm thêm món', function () {
      var snap = assertOk(M.snapshotPrice(mkItem(), 'L'));
      assert.strictEqual(snap.price, 40000);
      assert.strictEqual(snap.size, 'L');
    });

    test('sửa giá menu sau đó KHÔNG làm trôi giá đã snapshot', function () {
      var item = mkItem();
      var snap = assertOk(M.snapshotPrice(item, 'M'));
      var raised = Object.assign({}, item, { prices: { M: 99000, L: 99000 } });
      assert.strictEqual(snap.price, 30000);
      assert.strictEqual(assertOk(M.snapshotPrice(raised, 'M')).price, 99000);
    });

    test('size không có giá thì báo lỗi, không trả 0', function () {
      assertErr(M.snapshotPrice(mkItem(), 'XL'), 'NOT_FOUND');
    });
  });

  describe('sold-out DẪN XUẤT từ FIFO (fix §3 — gap nặng nhất domain này)', function () {
    var SUA = _c.ids.deterministicId('item', ['sua']);
    var TRA = _c.ids.deterministicId('item', ['tra']);
    var recipeItem = function () { return assertOk(M.linkRecipe(mkItem(), _c.ids.newId('recipe'))); };
    var comps = [{ itemId: SUA, qty: 100 }, { itemId: TRA, qty: 50 }];

    test('đủ nguyên liệu thì còn bán', function () {
      var a = M.computeAvailability({
        menuItem: recipeItem(), recipeComponents: comps,
        stockByItemId: (function () { var o = {}; o[SUA] = 500; o[TRA] = 500; return o; })()
      });
      assert.strictEqual(a.available, true);
    });

    test('thiếu 1 nguyên liệu thì hết món, và nói rõ thiếu cái nào', function () {
      var a = M.computeAvailability({
        menuItem: recipeItem(), recipeComponents: comps,
        stockByItemId: (function () { var o = {}; o[SUA] = 20; o[TRA] = 500; return o; })()
      });
      assert.strictEqual(a.available, false);
      assert.strictEqual(a.reason, 'OUT_OF_STOCK');
      assert.strictEqual(a.blockingItems[0].itemId, SUA);
      assert.strictEqual(a.blockingItems[0].have, 20);
    });

    test('tồn = 0 thì KHÔNG bán được — legacy bán vô hạn, kho chỉ âm dần', function () {
      var a = M.computeAvailability({
        menuItem: recipeItem(), recipeComponents: comps,
        stockByItemId: (function () { var o = {}; o[SUA] = 0; o[TRA] = 0; return o; })()
      });
      assert.strictEqual(a.available, false);
    });

    test('chưa khai định mức thì KHÔNG mặc định là còn hàng', function () {
      var a = M.computeAvailability({ menuItem: mkItem(), recipeComponents: [], stockByItemId: {} });
      assert.strictEqual(a.available, false);
      assert.strictEqual(a.reason, 'NO_RECIPE');
      assert.strictEqual(a.unknown, true);
    });

    test('thiếu số liệu tồn thì nói KHÔNG BIẾT, không đoán là còn', function () {
      var a = M.computeAvailability({ menuItem: recipeItem(), recipeComponents: comps, stockByItemId: {} });
      assert.strictEqual(a.available, false);
      assert.strictEqual(a.reason, 'STOCK_UNKNOWN');
      assert.strictEqual(a.unknown, true);
    });

    test('món ngưng bán thì không khả dụng bất kể tồn kho', function () {
      var gone = assertOk(M.archive(recipeItem(), 1));
      var a = M.computeAvailability({
        menuItem: gone, recipeComponents: comps,
        stockByItemId: (function () { var o = {}; o[SUA] = 9999; o[TRA] = 9999; return o; })()
      });
      assert.strictEqual(a.reason, 'ARCHIVED');
    });

    test('không có cờ sold-out thủ công nào để quên bật/tắt', function () {
      assert.strictEqual(mkItem().isAvailable, undefined);
      assert.strictEqual(mkItem().soldOut, undefined);
    });
  });
});

describe('catalog/promotion', function () {
  var P = _c.P;
  var CTX = { channel: 'TOGO', dayOfWeek: 3, dateKey: '2026-03-10' };

  function promo(over) {
    return assertOk(P.createPromotion(Object.assign({
      name: 'KM', storeId: _c.STORE, tier: 'AUTO_EXECUTE', priority: 10,
      conditions: [], effect: { type: 'PERCENT_OFF', pct: 10 }
    }, over || {})));
  }

  function cart(n, price) {
    var lines = [];
    for (var i = 0; i < n; i++) {
      lines.push({ menuItemId: _c.ids.deterministicId('item', ['m' + i]), size: 'M', qty: 1, price: price || 30000 });
    }
    return { lines: lines };
  }

  describe('2 tầng phải khai rõ (fix §5 — mơ hồ advisory vs auto)', function () {
    test('thiếu tier thì TỪ CHỐI, không mặc định', function () {
      var r = P.createPromotion({
        name: 'KM', storeId: _c.STORE, priority: 1, effect: { type: 'PERCENT_OFF', pct: 10 }
      });
      assertErr(r, 'VALIDATION');
      assert.ok(/AUTO_EXECUTE.*ADVISORY/.test(r.error.message));
    });

    test('ADVISORY chỉ gợi ý, KHÔNG trừ tiền', function () {
      var r = assertOk(P.evaluate({
        promotions: [promo({ tier: 'ADVISORY', effect: { type: 'PERCENT_OFF', pct: 50 } })],
        cart: cart(3), context: CTX
      }));
      assert.strictEqual(r.applied.length, 0);
      assert.strictEqual(r.advisory.length, 1);
      assert.strictEqual(r.totalDiscount, 0, 'khuyến mãi chỉ-gợi-ý lại trừ tiền thật');
    });

    test('AUTO_EXECUTE mới trừ tiền', function () {
      var r = assertOk(P.evaluate({ promotions: [promo()], cart: cart(3), context: CTX }));
      assert.strictEqual(r.applied.length, 1);
      assert.strictEqual(r.totalDiscount, 3 * 30000 * 0.1);
    });
  });

  describe('điều kiện là dữ liệu, không hard-code (fix §4)', function () {
    test('QTY_TOTAL', function () {
      var p = promo({ conditions: [{ type: 'QTY_TOTAL', minQty: 5 }] });
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(4), context: CTX })).applied.length, 0);
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(5), context: CTX })).applied.length, 1);
    });

    test('AMOUNT', function () {
      var p = promo({ conditions: [{ type: 'AMOUNT', minAmount: 100000 }] });
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(3), context: CTX })).applied.length, 0);
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(4), context: CTX })).applied.length, 1);
    });

    test('CHANNEL — mang đi vs tại quán', function () {
      var p = promo({ conditions: [{ type: 'CHANNEL', channel: 'TOGO' }] });
      assert.strictEqual(assertOk(P.evaluate({
        promotions: [p], cart: cart(3), context: { channel: 'DINE_IN', dayOfWeek: 3, dateKey: '2026-03-10' }
      })).applied.length, 0);
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(3), context: CTX })).applied.length, 1);
    });

    test('DAY_OF_WEEK và DATE_RANGE', function () {
      var dow = promo({ conditions: [{ type: 'DAY_OF_WEEK', days: [0, 6] }] });
      assert.strictEqual(assertOk(P.evaluate({ promotions: [dow], cart: cart(3), context: CTX })).applied.length, 0);
      var range = promo({ conditions: [{ type: 'DATE_RANGE', from: '2026-03-01', to: '2026-03-05' }] });
      assert.strictEqual(assertOk(P.evaluate({ promotions: [range], cart: cart(3), context: CTX })).applied.length, 0);
    });

    test('nhiều điều kiện phải thoả HẾT', function () {
      var p = promo({ conditions: [{ type: 'QTY_TOTAL', minQty: 2 }, { type: 'CHANNEL', channel: 'DINE_IN' }] });
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(3), context: CTX })).applied.length, 0);
    });

    test('điều kiện lạ thì fail-closed, không âm thầm cho qua', function () {
      var p = promo();
      p.conditions = [{ type: 'DIEU_KIEN_LA' }];
      assert.strictEqual(assertOk(P.evaluate({ promotions: [p], cart: cart(9), context: CTX })).applied.length, 0);
    });

    test('tạo được dạng khuyến mãi thứ 3 mà legacy không làm được', function () {
      /* "Mua từ 3 ly size L của nhóm Trà, mang đi, thứ 4 → giảm 20%, tối đa 15k" */
      var CAT = _c.ids.deterministicId('item', ['tra-cat']);
      var p = promo({
        conditions: [
          { type: 'QTY_SIZE', size: 'L', minQty: 3 },
          { type: 'QTY_CATEGORY', categoryId: CAT, minQty: 3 },
          { type: 'CHANNEL', channel: 'TOGO' },
          { type: 'DAY_OF_WEEK', days: [3] }
        ],
        effect: { type: 'PERCENT_OFF', pct: 20, maxAmount: 15000 }
      });
      var c = { lines: [{ menuItemId: _c.ids.deterministicId('item', ['x']), categoryId: CAT, size: 'L', qty: 3, price: 40000 }] };
      var r = assertOk(P.evaluate({ promotions: [p], cart: c, context: CTX }));
      assert.strictEqual(r.applied.length, 1);
      assert.strictEqual(r.totalDiscount, 15000, 'maxAmount không được tôn trọng');
    });
  });

  describe('loại trừ TƯỜNG MINH, một bộ kiểm tra duy nhất (fix §7)', function () {
    test('cùng nhóm loại trừ: ưu tiên cao thắng, cái kia bị chặn và nói rõ lý do', function () {
      var hi = promo({ name: 'Cao', priority: 100, exclusivityGroup: 'ORDER_LEVEL', effect: { type: 'PERCENT_OFF', pct: 10 } });
      var lo = promo({ name: 'Thấp', priority: 1, exclusivityGroup: 'ORDER_LEVEL', effect: { type: 'PERCENT_OFF', pct: 50 } });
      var r = assertOk(P.evaluate({ promotions: [lo, hi], cart: cart(3), context: CTX }));
      assert.strictEqual(r.applied.length, 1);
      assert.strictEqual(r.applied[0].name, 'Cao');
      assert.strictEqual(r.suppressed.length, 1);
      assert.ok(/loại trừ bởi "Cao"/.test(r.suppressed[0].reason));
    });

    test('kết quả không phụ thuộc thứ tự mảng đầu vào (legacy phụ thuộc thứ tự CODE)', function () {
      var hi = promo({ name: 'Cao', priority: 100, exclusivityGroup: 'G' });
      var lo = promo({ name: 'Thấp', priority: 1, exclusivityGroup: 'G' });
      var a = assertOk(P.evaluate({ promotions: [hi, lo], cart: cart(3), context: CTX }));
      var b = assertOk(P.evaluate({ promotions: [lo, hi], cart: cart(3), context: CTX }));
      assert.strictEqual(a.applied[0].name, b.applied[0].name);
    });

    test('khác nhóm thì chồng được', function () {
      var r = assertOk(P.evaluate({
        promotions: [
          promo({ name: 'A', priority: 10, exclusivityGroup: 'ORDER' }),
          promo({ name: 'B', priority: 5, exclusivityGroup: 'TOPPING', effect: { type: 'FREE_TOPPING', toppingId: 'x' } })
        ],
        cart: cart(3), context: CTX
      }));
      assert.strictEqual(r.applied.length, 2);
    });

    test('mã giảm giá của khách chịu CHUNG luật loại trừ với khuyến mãi tự động', function () {
      /* Đây là lỗ hổng thật của legacy: 2 biến độc lập, không đối chiếu nhau. */
      var auto = promo({ name: 'Auto togo', priority: 50, exclusivityGroup: 'ORDER_LEVEL' });
      var code = promo({ name: 'Mã KH', priority: 10, exclusivityGroup: 'ORDER_LEVEL', effect: { type: 'ORDER_DISCOUNT', pct: 30 } });
      var r = assertOk(P.evaluate({
        promotions: [auto], extraPromotions: [code], cart: cart(3), context: CTX
      }));
      assert.strictEqual(r.applied.length, 1, 'mã giảm giá chồng lên khuyến mãi tự động');
      assert.strictEqual(r.suppressed.length, 1);
    });

    test('ADVISORY vẫn chiếm chỗ loại trừ (không để 2 cái cùng nhóm cùng hiện)', function () {
      var adv = promo({ name: 'Gợi ý', tier: 'ADVISORY', priority: 100, exclusivityGroup: 'G' });
      var auto = promo({ name: 'Tự động', priority: 1, exclusivityGroup: 'G' });
      var r = assertOk(P.evaluate({ promotions: [adv, auto], cart: cart(3), context: CTX }));
      assert.strictEqual(r.advisory.length, 1);
      assert.strictEqual(r.applied.length, 0);
      assert.strictEqual(r.suppressed.length, 1);
    });
  });

  test('BUY_X_GET_Y theo bội số (dạng 1 của legacy)', function () {
    var p = promo({ effect: { type: 'BUY_X_GET_Y', buyQty: 3, freeQty: 1 } });
    var r = assertOk(P.evaluate({ promotions: [p], cart: cart(7), context: CTX }));
    assert.strictEqual(r.applied[0].effect.freeQty, 2);
  });

  test('khuyến mãi tắt thì không áp', function () {
    var r = assertOk(P.evaluate({ promotions: [promo({ active: false })], cart: cart(3), context: CTX }));
    assert.strictEqual(r.applied.length, 0);
  });

  test('priority bắt buộc khai', function () {
    assertErr(P.createPromotion({
      name: 'x', storeId: _c.STORE, tier: 'AUTO_EXECUTE', effect: { type: 'PERCENT_OFF', pct: 5 }
    }), 'VALIDATION');
  });
});

describe('catalog/packaging — versioned (fix §4.8, instance #3)', function () {
  var PK = _c.PK;
  var TUI = _c.ids.deterministicId('item', ['tui']);
  var LY = _c.ids.deterministicId('item', ['ly-nhua']);
  var MON = _c.ids.deterministicId('item', ['mon']);
  var D = function (y, m, d) { return new Date(y, m - 1, d).getTime(); };

  function reg() { return _c.VI.createRegistry(); }

  function pub(r, at, qty, itemId) {
    return assertOk(PK.publishPackaging(r, {
      menuItemId: MON, storeId: _c.STORE, effectiveFrom: at, publishedBy: _c.BOSS,
      packaging: { items: [{ itemId: itemId || LY, qty: qty }] }
    }));
  }

  test('đổi cấu hình bao bì KHÔNG làm trôi COGS lịch sử', function () {
    var r = reg();
    pub(r, D(2026, 1, 1), 1);
    pub(r, D(2026, 3, 1), 3);
    var atOldBill = assertOk(PK.resolvePackagingAt(r, {
      menuItemId: MON, storeId: _c.STORE, at: D(2026, 2, 1)
    }));
    assert.strictEqual(atOldBill.payload.items[0].qty, 1, 'bill cũ bị tính theo bao bì mới');
  });

  test('rơi về preset chung khi món không có cấu hình riêng', function () {
    var r = reg();
    assertOk(PK.publishPackaging(r, {
      storeId: _c.STORE, effectiveFrom: D(2026, 1, 1), publishedBy: _c.BOSS,
      packaging: { items: [{ itemId: LY, qty: 1 }] }
    }));
    var got = assertOk(PK.resolvePackagingAt(r, {
      menuItemId: MON, storeId: _c.STORE, at: D(2026, 2, 1)
    }));
    assert.strictEqual(got.subjectId, '__default__');
  });

  test('không có cấu hình nào thì báo lỗi, không im lặng bỏ qua bao bì', function () {
    assertErr(PK.resolvePackagingAt(reg(), {
      menuItemId: MON, storeId: _c.STORE, at: D(2026, 2, 1)
    }), 'NOT_FOUND');
  });

  test('bao bì thành yêu cầu vật chất, mang theo versionId đã dùng (V4)', function () {
    var r = reg();
    var v = pub(r, D(2026, 1, 1), 2);
    var out = assertOk(PK.toRequirements(v, 5));
    assert.strictEqual(out.requirements[0].qty, 10);
    assert.strictEqual(out.packagingVersionId, v.versionId);
    assertOk(r.getByVersionId(out.packagingVersionId));
  });

  test('túi tính theo ĐƠN, làm tròn lên', function () {
    var r = reg();
    var v = assertOk(PK.publishPackaging(r, {
      menuItemId: MON, storeId: _c.STORE, effectiveFrom: D(2026, 1, 1), publishedBy: _c.BOSS,
      packaging: { items: [], bagging: { itemId: TUI, cupsPerBag: 4 } }
    }));
    assert.strictEqual(assertOk(PK.baggingRequirements(v, 5)).requirements[0].qty, 2);
    assert.strictEqual(assertOk(PK.baggingRequirements(v, 4)).requirements[0].qty, 1);
    assert.strictEqual(assertOk(PK.baggingRequirements(v, 0)).requirements.length, 0);
  });

  test('itemId bao bì sai loại bị chặn', function () {
    assertErr(PK.publishPackaging(reg(), {
      menuItemId: MON, storeId: _c.STORE, effectiveFrom: D(2026, 1, 1), publishedBy: _c.BOSS,
      packaging: { items: [{ itemId: 'ly-nhua', qty: 1 }] }
    }), 'VALIDATION');
  });

  test('packaging dùng chung VersionedInput, không có kho riêng', function () {
    var r = reg();
    var v = pub(r, D(2026, 1, 1), 1);
    assert.strictEqual(v.kind, 'packaging');
    assert.strictEqual(r.listVersions('packaging', MON, _c.STORE).length, 1);
  });
});
