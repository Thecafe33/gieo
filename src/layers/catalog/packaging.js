/**
 * Packaging — bao bì nhiều tầng, ẢNH HƯỞNG COGS nên BẮT BUỘC versioned.
 *
 * Gap: FEATURE-TREE-V1.md §4.8 — `invalidateSalesCache()` xoá sạch cache mỗi
 * khi sửa packaging preset/override/rules/bagging, rồi tính lại COGS LỊCH SỬ
 * bằng cấu hình HIỆN TẠI. Đây là instance #3 của lớp lỗi đã xác nhận 7 lần
 * (GIEO-REBUILD-HANDOFF-V2.md §3): mọi input ảnh hưởng số tiền lịch sử phải
 * versioned + resolve point-in-time.
 *
 * Nên packaging KHÔNG có cơ chế lưu riêng — nó đi qua đúng `VersionedInput`
 * dùng chung với Recipe/Cost/PayTerms/BTP-yield/KPI-target/Config. Sửa riêng lẻ
 * từng domain là cách domain thứ 8 lại mắc lại đúng lỗi này.
 *
 * Bốn tầng giữ nguyên khái niệm của legacy (preset → override → rules →
 * bagging): cấu trúc đó phản ánh nghiệp vụ thật của quán, chỉ cách lưu là sai.
 */
GIEO.define('catalog/packaging', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input'
], function (ids, R, VI) {
  'use strict';

  function validateSpec(p) {
    if (!p || typeof p !== 'object') return 'packaging payload phải là object';
    if (!Array.isArray(p.items)) return 'packaging cần mảng items';
    for (var i = 0; i < p.items.length; i++) {
      var it = p.items[i];
      if (!ids.isId(it.itemId, 'item')) return 'packaging item[' + i + '] thiếu itemId hợp lệ';
      if (typeof it.qty !== 'number' || it.qty < 0) return 'packaging item[' + i + '] qty không hợp lệ';
    }
    return null;
  }

  /**
   * Công bố cấu hình bao bì cho 1 món (hoặc mặc định toàn cửa hàng).
   * `subjectId` = menuItemId, hoặc '__default__' cho preset chung.
   */
  function publishPackaging(registry, spec) {
    if (!spec) return R.err('VALIDATION', 'publishPackaging cần spec');
    var subjectId = spec.menuItemId || '__default__';

    var bad = validateSpec(spec.packaging);
    if (bad) return R.err('VALIDATION', bad);

    return registry.publish({
      kind: VI.KINDS.packaging,
      subjectId: subjectId,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: {
        /* preset = bộ mặc định; override = đè cho món cụ thể;
           rules = điều kiện áp (vd chỉ mang đi); bagging = túi đựng theo số ly. */
        tier: spec.tier || 'preset',
        items: spec.packaging.items.map(function (it) {
          return { itemId: it.itemId, qty: it.qty, note: it.note || null };
        }),
        rules: spec.packaging.rules || null,
        bagging: spec.packaging.bagging || null
      }
    });
  }

  /**
   * Bao bì có hiệu lực TẠI THỜI ĐIỂM BÁN — không phải cấu hình hiện tại.
   * Món không có override riêng thì rơi về preset chung.
   */
  function resolvePackagingAt(registry, spec) {
    var own = registry.resolveAt(VI.KINDS.packaging, spec.menuItemId, spec.storeId, spec.at);
    if (R.isOk(own)) return own;
    var fallback = registry.resolveAt(VI.KINDS.packaging, '__default__', spec.storeId, spec.at);
    if (R.isOk(fallback)) return fallback;
    return R.err('NOT_FOUND',
      'không có cấu hình bao bì hiệu lực cho món "' + spec.menuItemId + '" tại thời điểm đó ' +
      '(cũng không có preset chung)');
  }

  /**
   * Nhu cầu bao bì thành yêu cầu vật chất để FIFO cấp phát.
   * Trả kèm `versionId` đã dùng (V4) — kết quả ghi vào bill phải mang nó, để
   * đọc lại lịch sử không phải resolve lại.
   */
  function toRequirements(packagingVersion, qty) {
    if (typeof qty !== 'number' || qty <= 0) return R.err('VALIDATION', 'qty phải dương');
    var p = packagingVersion.payload;
    return R.ok({
      packagingVersionId: packagingVersion.versionId,
      requirements: p.items.map(function (it) {
        return { itemId: it.itemId, qty: it.qty * qty, source: 'packaging' };
      })
    });
  }

  /** Túi đựng theo số ly — tách riêng vì nó tính theo ĐƠN, không theo từng món. */
  function baggingRequirements(packagingVersion, cupCount) {
    var b = packagingVersion.payload.bagging;
    if (!b || !b.itemId) return R.ok({ packagingVersionId: packagingVersion.versionId, requirements: [] });
    var per = b.cupsPerBag || 1;
    var bags = Math.ceil(cupCount / per);
    return R.ok({
      packagingVersionId: packagingVersion.versionId,
      requirements: bags > 0 ? [{ itemId: b.itemId, qty: bags, source: 'bagging' }] : []
    });
  }

  return {
    publishPackaging: publishPackaging,
    resolvePackagingAt: resolvePackagingAt,
    toRequirements: toRequirements,
    baggingRequirements: baggingRequirements
  };
});
