/**
 * Menu + Category — domain [1] CATALOG.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md.
 * Gap: FEATURE-TREE-V1.md §4.1-4.3, §4.13, §4.14.
 *
 * Bốn điểm khác legacy:
 *
 * 1. `recipeId` là CON TRỎ TƯỜNG MINH trên MenuItem.
 *    Legacy khớp key ngầm `'togo:' + menuItemId`, không có con trỏ nào để đổi.
 *    Hệ quả: xoá-rồi-tạo-lại món (cách duy nhất để đổi tên) sinh key Firebase
 *    MỚI → recipe cũ mồ côi vĩnh viễn, món mới báo "chưa có định mức" cho tới
 *    khi có người phát hiện. Có con trỏ thật thì đổi tên chỉ là sửa field
 *    `name`, và vấn đề mồ côi biến mất từ gốc thiết kế — không cần cơ chế dọn
 *    dẹp bù đắp.
 *
 * 2. Xoá là SOFT-DELETE. Legacy `.remove()` cứng, không cascade, nên tham chiếu
 *    itemId trong khuyến mãi/quà tặng trỏ vào hư không.
 *
 * 3. Category là ENTITY THẬT có thứ tự hiển thị lưu trữ. Legacy tính lại bằng
 *    `[...new Set(menu.map(m=>m.type))]` mỗi lần render nên thứ tự đổi giữa các
 *    lần tải.
 *
 * 4. Sold-out DẪN XUẤT từ FIFO, không phải cờ tay. Xem computeAvailability().
 *
 * Giữ nguyên 1 mẫu ĐÚNG của legacy: giá được snapshot vào giỏ ngay lúc thêm
 * món (§8 chain-trace) — mẫu đúng hiếm hoi của toàn bộ audit về "không join
 * sống vào dữ liệu hiện tại cho lịch sử". Xem snapshotPrice().
 *
 * QUANLY là nơi DUY NHẤT sửa menu (POS chỉ đọc) — đóng gap §4.1 "2 app cùng
 * ghi thẳng RTDB, race condition không lock/version". Enforce ở tầng command
 * qua sources:['QUANLY'], không phải ở đây.
 */
GIEO.define('catalog/menu', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  var SIZES = { M: 'M', L: 'L' };

  function createCategory(spec) {
    if (!spec || !spec.name) return R.err('VALIDATION', 'category cần name');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'category cần storeId hợp lệ');
    if (typeof spec.displayOrder !== 'number') {
      return R.err('VALIDATION', 'category cần displayOrder — thứ tự phải được LƯU, không suy ra lúc render');
    }
    return R.ok({
      categoryId: spec.categoryId || ids.newId('item'),
      storeId: spec.storeId,
      name: String(spec.name),
      displayOrder: spec.displayOrder,
      archived: false
    });
  }

  function sortCategories(categories) {
    return categories.slice().sort(function (a, b) {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  function createMenuItem(spec) {
    if (!spec || !spec.name) return R.err('VALIDATION', 'món cần name');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'món cần storeId hợp lệ');
    if (!spec.prices || typeof spec.prices !== 'object') {
      return R.err('VALIDATION', 'món cần bảng giá theo size');
    }
    var sizes = Object.keys(spec.prices);
    if (sizes.length === 0) return R.err('VALIDATION', 'món cần ít nhất 1 size có giá');
    for (var i = 0; i < sizes.length; i++) {
      var p = spec.prices[sizes[i]];
      if (typeof p !== 'number' || p < 0) return R.err('VALIDATION', 'giá size ' + sizes[i] + ' không hợp lệ');
    }

    return R.ok({
      menuItemId: spec.menuItemId || ids.newId('item'),
      storeId: spec.storeId,
      name: String(spec.name),
      categoryId: spec.categoryId || null,
      prices: Object.assign({}, spec.prices),
      /* Con trỏ tường minh. null = chưa khai định mức, và đó là trạng thái
         NÓI RA ĐƯỢC, khác hẳn legacy chỉ im lặng không tìm thấy key. */
      recipeId: spec.recipeId || null,
      toppingIds: (spec.toppingIds || []).slice(),
      displayOrder: typeof spec.displayOrder === 'number' ? spec.displayOrder : 0,
      color: spec.color || null,
      archived: false,
      archivedAt: null
    });
  }

  /** Đổi tên chỉ là sửa field — KHÔNG xoá rồi tạo lại, nên recipe không mồ côi. */
  function rename(menuItem, newName) {
    if (!newName) return R.err('VALIDATION', 'tên mới không được rỗng');
    return R.ok(Object.assign({}, menuItem, { name: String(newName) }));
  }

  /** Trỏ món sang recipe khác — thao tác độc lập mà legacy không có. */
  function linkRecipe(menuItem, recipeId) {
    if (recipeId !== null && !ids.isId(recipeId, 'recipe')) {
      return R.err('VALIDATION', 'recipeId không hợp lệ');
    }
    return R.ok(Object.assign({}, menuItem, { recipeId: recipeId }));
  }

  /**
   * Ngưng bán. KHÔNG xoá cứng: mọi tham chiếu tới món (khuyến mãi, quà tặng,
   * điều kiện chiến dịch) vẫn resolve được thay vì trỏ vào hư không.
   */
  function archive(menuItem, at) {
    if (menuItem.archived) return R.err('PRECONDITION', 'món đã ngưng bán');
    return R.ok(Object.assign({}, menuItem, { archived: true, archivedAt: at || null }));
  }

  function restore(menuItem) {
    if (!menuItem.archived) return R.err('PRECONDITION', 'món đang bán');
    return R.ok(Object.assign({}, menuItem, { archived: false, archivedAt: null }));
  }

  /**
   * Giá đưa vào giỏ — SNAPSHOT, không phải tham chiếu sống.
   *
   * Đây là mẫu ĐÚNG của legacy cần giữ nguyên (§8 chain-trace): giá được sao
   * vào cart ngay lúc thêm món, rồi sao y vào bill. Báo cáo đọc thẳng giá đã
   * lưu, không join lại menu hiện tại — nên sửa giá menu không làm trôi số
   * liệu bill/báo cáo lịch sử.
   */
  function snapshotPrice(menuItem, size) {
    var price = menuItem.prices[size];
    if (typeof price !== 'number') {
      return R.err('NOT_FOUND', 'món "' + menuItem.name + '" không có giá cho size ' + size);
    }
    return R.ok({
      menuItemId: menuItem.menuItemId,
      name: menuItem.name,
      size: size,
      price: price,
      recipeId: menuItem.recipeId
    });
  }

  /**
   * SOLD-OUT DẪN XUẤT TỪ FIFO — đóng gap nghiêm trọng nhất của domain này.
   *
   * Legacy: KHÔNG có field/flag hết hàng nào. renderMenu() render MỌI món luôn
   * bấm được. Kho và Catalog hoàn toàn tách rời TRƯỚC khi bán — trừ kho chỉ
   * chạy SAU khi xác nhận bán, không có bước kiểm tra tồn trước. Nhân viên bán
   * được vô hạn 1 món dù nguyên liệu = 0; kho chỉ âm dần, không ai chặn.
   *
   * Ở đây khả dụng được TÍNH từ tồn kho thật, nên không có "cờ hết hàng" nào
   * để quên bật/tắt. Hàm thuần: catalog không được import fifo-core hay
   * read-layer, nên tồn kho được TRUYỀN VÀO; tầng command/read-layer lấy số.
   *
   * Món chưa khai định mức thì KHÔNG tự coi là còn hàng — trả `unknown` để UI
   * nói thật "chưa biết", thay vì đoán rồi bán âm kho.
   */
  function computeAvailability(spec) {
    var menuItem = spec.menuItem;
    if (menuItem.archived) {
      return { available: false, reason: 'ARCHIVED', blockingItems: [] };
    }
    if (!menuItem.recipeId) {
      return { available: false, reason: 'NO_RECIPE', unknown: true, blockingItems: [] };
    }

    var components = spec.recipeComponents;
    if (!Array.isArray(components) || components.length === 0) {
      return { available: false, reason: 'NO_RECIPE', unknown: true, blockingItems: [] };
    }

    var stock = spec.stockByItemId || {};
    var blocking = [];
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      var have = stock[c.itemId];
      if (have === undefined) {
        /* Thiếu số liệu tồn thì nói không biết, không mặc định là còn. */
        return { available: false, reason: 'STOCK_UNKNOWN', unknown: true, blockingItems: [c.itemId] };
      }
      if (have < c.qty) blocking.push({ itemId: c.itemId, need: c.qty, have: have });
    }

    return blocking.length
      ? { available: false, reason: 'OUT_OF_STOCK', blockingItems: blocking }
      : { available: true, reason: null, blockingItems: [] };
  }

  /** Menu để render: đã lọc ngưng bán, đã sắp thứ tự ổn định. */
  function buildMenuView(spec) {
    var cats = sortCategories((spec.categories || []).filter(function (c) { return !c.archived; }));
    var items = (spec.menuItems || []).filter(function (m) { return !m.archived; });

    return R.ok(cats.map(function (c) {
      return {
        category: c,
        items: items
          .filter(function (m) { return m.categoryId === c.categoryId; })
          .sort(function (a, b) {
            if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
          })
      };
    }));
  }

  return {
    SIZES: SIZES,
    createCategory: createCategory,
    sortCategories: sortCategories,
    createMenuItem: createMenuItem,
    rename: rename,
    linkRecipe: linkRecipe,
    archive: archive,
    restore: restore,
    snapshotPrice: snapshotPrice,
    computeAvailability: computeAvailability,
    buildMenuView: buildMenuView
  };
});
