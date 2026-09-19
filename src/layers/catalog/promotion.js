/**
 * Khuyến mãi — 2 TẦNG TƯỜNG MINH + 1 bộ kiểm tra loại trừ DUY NHẤT.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md §4/§5/§6/§7.
 *
 * Ba vấn đề của legacy đang đóng:
 *
 * 1. HAI TẦNG BỊ LẪN LỘN. Legacy có `togoSettings` TỰ CHẠY (trừ tiền thật) và
 *    `assistConfig.campaigns` CHỈ GỢI Ý (không bao giờ tự trừ tiền/thêm quà).
 *    Chủ quán cấu hình một "chiến dịch" tưởng nó tự chạy như 2 chương trình
 *    hằng ngày, thực ra chỉ là gợi ý cho nhân viên tự áp tay. Ở đây `tier` là
 *    field BẮT BUỘC, không có mặc định — người tạo phải nói rõ nó thuộc tầng
 *    nào.
 *
 * 2. ĐIỀU KIỆN BỊ HARD-CODE. Legacy `checkTogoBeforeCheckout()` chỉ biết đúng
 *    2 dạng (mua X tặng Y theo bội số; đạt ngưỡng số ly → giảm %); tham số cấu
 *    hình được nhưng LOGIC thì không, nên không tạo được dạng thứ 3. Ở đây
 *    điều kiện là dữ liệu, đánh giá bằng 1 rule engine tổng quát.
 *
 * 3. CHỒNG KHUYẾN MÃI NGẦM ĐỊNH. Legacy loại trừ nhau theo THỨ TỰ CODE (quà
 *    tặng luôn được check trước), và discount-code KHÔNG hề đối chiếu với
 *    togoSettings auto-discount — 2 biến độc lập. Hiện vô hại vì discount-code
 *    đang ẩn UI, nhưng là lỗ hổng thật nếu bật lại. Ở đây `priority` và
 *    `exclusivityGroup` là field tường minh, và MỌI loại khuyến mãi đi qua
 *    cùng một bộ kiểm tra.
 */
GIEO.define('catalog/promotion', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  /* Tầng — bắt buộc khai, không mặc định. */
  var TIER = {
    /* Tự trừ tiền/thêm quà vào giỏ. */
    AUTO_EXECUTE: 'AUTO_EXECUTE',
    /* Chỉ gợi ý cho nhân viên, KHÔNG đụng vào giỏ. */
    ADVISORY: 'ADVISORY'
  };

  var CHANNEL = { TOGO: 'TOGO', DINE_IN: 'DINE_IN' };

  /* Điều kiện là DỮ LIỆU, không phải nhánh if trong code. */
  var CONDITION = {
    QTY_TOTAL: 'QTY_TOTAL',
    QTY_SIZE: 'QTY_SIZE',
    QTY_ITEM: 'QTY_ITEM',
    QTY_CATEGORY: 'QTY_CATEGORY',
    AMOUNT: 'AMOUNT',
    CHANNEL: 'CHANNEL',
    DAY_OF_WEEK: 'DAY_OF_WEEK',
    DATE_RANGE: 'DATE_RANGE'
  };

  /* 5 kiểu giảm giá của legacy được giữ nguyên thiết kế nghiệp vụ (§6/§7 —
     code còn sống đầy đủ, chỉ ô nhập bị ẩn). Bật/tắt là quyết định vận hành,
     không phải quyết định kiến trúc. */
  var EFFECT = {
    BUY_X_GET_Y: 'BUY_X_GET_Y',
    PERCENT_OFF: 'PERCENT_OFF',
    FREE_TOPPING: 'FREE_TOPPING',
    ITEM_FREE: 'ITEM_FREE',
    ITEM_UPSIZE: 'ITEM_UPSIZE',
    ITEM_DISCOUNT: 'ITEM_DISCOUNT',
    ORDER_DISCOUNT: 'ORDER_DISCOUNT'
  };

  function createPromotion(spec) {
    if (!spec || !spec.name) return R.err('VALIDATION', 'khuyến mãi cần name');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'khuyến mãi cần storeId hợp lệ');
    if (!TIER[spec.tier]) {
      return R.err('VALIDATION',
        'khuyến mãi phải khai rõ tier: AUTO_EXECUTE (tự trừ tiền) hay ADVISORY (chỉ gợi ý). ' +
        'Không có mặc định — lẫn 2 tầng này chính là điểm mơ hồ của hệ thống cũ.');
    }
    if (typeof spec.priority !== 'number') {
      return R.err('VALIDATION', 'khuyến mãi cần priority — thứ tự ưu tiên phải tường minh, không theo thứ tự code');
    }
    if (!spec.effect || !EFFECT[spec.effect.type]) {
      return R.err('VALIDATION', 'khuyến mãi cần effect.type hợp lệ');
    }
    var conditions = spec.conditions || [];
    for (var i = 0; i < conditions.length; i++) {
      if (!CONDITION[conditions[i].type]) {
        return R.err('VALIDATION', 'điều kiện không hợp lệ: ' + conditions[i].type);
      }
    }

    return R.ok({
      promotionId: spec.promotionId || ids.newId('item'),
      storeId: spec.storeId,
      name: String(spec.name),
      tier: spec.tier,
      priority: spec.priority,
      /* Cùng nhóm = loại trừ nhau. null = không loại trừ ai. */
      exclusivityGroup: spec.exclusivityGroup || null,
      conditions: conditions.slice(),
      effect: Object.assign({}, spec.effect),
      active: spec.active === undefined ? true : !!spec.active
    });
  }

  /** Tổng hợp giỏ hàng — tính 1 lần rồi dùng lại cho mọi điều kiện. */
  function summarize(cart) {
    var lines = cart.lines || [];
    var s = { totalQty: 0, subtotal: 0, bySize: {}, byItem: {}, byCategory: {} };
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var q = l.qty || 0;
      s.totalQty += q;
      s.subtotal += q * (l.price || 0);
      s.bySize[l.size] = (s.bySize[l.size] || 0) + q;
      s.byItem[l.menuItemId] = (s.byItem[l.menuItemId] || 0) + q;
      if (l.categoryId) s.byCategory[l.categoryId] = (s.byCategory[l.categoryId] || 0) + q;
    }
    return s;
  }

  function evalCondition(cond, sum, ctx) {
    switch (cond.type) {
      case CONDITION.QTY_TOTAL: return sum.totalQty >= cond.minQty;
      case CONDITION.QTY_SIZE: return (sum.bySize[cond.size] || 0) >= cond.minQty;
      case CONDITION.QTY_ITEM: return (sum.byItem[cond.menuItemId] || 0) >= cond.minQty;
      case CONDITION.QTY_CATEGORY: return (sum.byCategory[cond.categoryId] || 0) >= cond.minQty;
      case CONDITION.AMOUNT: return sum.subtotal >= cond.minAmount;
      case CONDITION.CHANNEL: return ctx.channel === cond.channel;
      case CONDITION.DAY_OF_WEEK:
        return Array.isArray(cond.days) && cond.days.indexOf(ctx.dayOfWeek) !== -1;
      case CONDITION.DATE_RANGE:
        if (cond.from && ctx.dateKey < cond.from) return false;
        if (cond.to && ctx.dateKey > cond.to) return false;
        return true;
      default:
        /* Điều kiện lạ thì KHÔNG cho qua — fail-closed, không âm thầm bỏ qua. */
        return false;
    }
  }

  function matches(promotion, sum, ctx) {
    if (!promotion.active) return false;
    for (var i = 0; i < promotion.conditions.length; i++) {
      if (!evalCondition(promotion.conditions[i], sum, ctx)) return false;
    }
    return true;
  }

  /** Tính giá trị giảm của 1 effect. Trả cả phần mô tả để hiện cho nhân viên. */
  function computeEffect(promotion, sum, cart) {
    var e = promotion.effect;
    switch (e.type) {
      case EFFECT.BUY_X_GET_Y: {
        var sets = e.buyQty > 0 ? Math.floor(sum.totalQty / e.buyQty) : 0;
        var freeQty = sets * (e.freeQty || 1);
        return { discountAmount: 0, freeQty: freeQty, giftMenuItemId: e.giftMenuItemId || null };
      }
      case EFFECT.PERCENT_OFF:
      case EFFECT.ORDER_DISCOUNT: {
        var amt = sum.subtotal * ((e.pct || 0) / 100);
        if (typeof e.maxAmount === 'number') amt = Math.min(amt, e.maxAmount);
        return { discountAmount: amt, freeQty: 0 };
      }
      case EFFECT.ITEM_DISCOUNT: {
        var lines = (cart.lines || []).filter(function (l) { return l.menuItemId === e.menuItemId; });
        var base = lines.reduce(function (s, l) { return s + l.qty * l.price; }, 0);
        return { discountAmount: base * ((e.pct || 0) / 100), freeQty: 0 };
      }
      case EFFECT.ITEM_FREE: {
        var fl = (cart.lines || []).filter(function (l) { return l.menuItemId === e.menuItemId; });
        return { discountAmount: fl.length ? fl[0].price : 0, freeQty: 1 };
      }
      case EFFECT.ITEM_UPSIZE:
        return { discountAmount: e.upsizeValue || 0, freeQty: 0, upsize: true };
      case EFFECT.FREE_TOPPING:
        return { discountAmount: 0, freeQty: 0, freeToppingId: e.toppingId, freeToppingQty: e.qty || 1 };
      default:
        return { discountAmount: 0, freeQty: 0 };
    }
  }

  /**
   * BỘ KIỂM TRA LOẠI TRỪ DUY NHẤT — mọi loại khuyến mãi đi qua đây.
   *
   * Legacy để mỗi loại tự kiểm tra rời rạc: discount-code chặn chồng với chính
   * nó và với voucher khách hàng, nhưng KHÔNG đối chiếu với togoSettings
   * auto-discount. Ở đây chỉ có một chỗ quyết định, nên không thể có cặp nào
   * "quên đối chiếu nhau".
   *
   * `voucher`/`discountCode` của khách cũng phải truyền vào `extraPromotions`
   * dưới cùng hình dạng Promotion để chịu chung luật.
   */
  function evaluate(spec) {
    var cart = spec.cart || { lines: [] };
    var ctx = spec.context || {};
    var all = (spec.promotions || []).concat(spec.extraPromotions || []);
    var sum = summarize(cart);

    var eligible = all.filter(function (p) { return matches(p, sum, ctx); });

    /* Ưu tiên cao thắng. Bằng nhau thì theo promotionId để kết quả tất định —
       không phụ thuộc thứ tự mảng đầu vào như legacy phụ thuộc thứ tự code. */
    eligible.sort(function (a, b) {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.promotionId < b.promotionId ? -1 : a.promotionId > b.promotionId ? 1 : 0;
    });

    var takenGroups = Object.create(null);
    var applied = [];
    var advisory = [];
    var suppressed = [];

    for (var i = 0; i < eligible.length; i++) {
      var p = eligible[i];
      var g = p.exclusivityGroup;

      if (g && takenGroups[g]) {
        suppressed.push({
          promotionId: p.promotionId,
          name: p.name,
          reason: 'loại trừ bởi "' + takenGroups[g].name + '" (cùng nhóm ' + g + ', ưu tiên cao hơn)'
        });
        continue;
      }

      var outcome = {
        promotionId: p.promotionId,
        name: p.name,
        tier: p.tier,
        priority: p.priority,
        exclusivityGroup: g,
        effect: computeEffect(p, sum, cart)
      };

      /* Tầng ADVISORY chiếm chỗ loại trừ nhưng KHÔNG đụng vào giỏ. */
      if (g) takenGroups[g] = p;
      if (p.tier === TIER.AUTO_EXECUTE) applied.push(outcome);
      else advisory.push(outcome);
    }

    return R.ok({
      /* Tự áp vào giỏ. */
      applied: applied,
      /* Chỉ hiện cho nhân viên tự quyết — KHÔNG trừ tiền. */
      advisory: advisory,
      /* Nói rõ cái nào bị loại và vì sao, thay vì im lặng bỏ qua. */
      suppressed: suppressed,
      totalDiscount: applied.reduce(function (s, a) { return s + (a.effect.discountAmount || 0); }, 0),
      summary: sum
    });
  }

  return {
    TIER: TIER,
    CHANNEL: CHANNEL,
    CONDITION: CONDITION,
    EFFECT: EFFECT,
    createPromotion: createPromotion,
    summarize: summarize,
    matches: matches,
    computeEffect: computeEffect,
    evaluate: evaluate
  };
});
