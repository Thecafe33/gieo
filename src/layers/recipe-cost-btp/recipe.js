/**
 * Recipe — định mức, VERSIONED theo thời điểm.
 *
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md §10. Đây là vi phạm versioning RÕ NHẤT
 * của toàn bộ audit (instance #1 trong 7 instance của HANDOFF-V2 §3):
 * legacy `saveRecipe()` dùng `.set()` GHI ĐÈ, nên đổi công thức hôm nay làm
 * COGS của mọi bill trong quá khứ được tính lại theo công thức mới.
 *
 * Ở đây không có hàm nào ghi đè. Sửa công thức = publish version mới qua đúng
 * cơ chế `VersionedInput` dùng chung, đóng `effectiveTo` của bản cũ.
 *
 * Hệ quả quan trọng: cache doanh thu vẫn được phép xoá khi có version mới, NHƯNG
 * khi tính lại nó phải dùng RecipeVersion lịch sử của TỪNG NGÀY — nên kết quả
 * tính lại GIỐNG HỆT kết quả cũ. Khác hẳn legacy, nơi tính lại cho ra số khác.
 */
GIEO.define('recipe-cost-btp/recipe', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input'
], function (ids, R, VI) {
  'use strict';

  /* Thành phần định mức có thể trỏ tới nguyên liệu thô, bán thành phẩm, hoặc
     topping — giữ nguyên cấu trúc 3 loại của legacy. */
  var REF_TYPE = { item: 'item', prep: 'prep', topping: 'topping' };

  function validateComponents(rows) {
    if (!Array.isArray(rows)) return 'components phải là mảng';
    if (rows.length === 0) return 'định mức phải có ít nhất 1 thành phần';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!REF_TYPE[r.refType]) return 'component[' + i + '] refType không hợp lệ: ' + r.refType;
      if (!r.refId) return 'component[' + i + '] thiếu refId';
      if (typeof r.qty !== 'number' || !(r.qty > 0)) return 'component[' + i + '] qty phải dương';
    }
    return null;
  }

  /**
   * Công bố định mức mới. `components` khai theo size vì cùng 1 món size M và L
   * dùng lượng khác nhau — giữ đúng cấu trúc nghiệp vụ của legacy.
   */
  function publishRecipeVersion(registry, spec) {
    if (!spec) return R.err('VALIDATION', 'publishRecipeVersion cần spec');
    if (!ids.isId(spec.recipeId, 'recipe')) return R.err('VALIDATION', 'cần recipeId hợp lệ');
    if (!spec.components || typeof spec.components !== 'object') {
      return R.err('VALIDATION', 'cần components khai theo size');
    }
    var sizes = Object.keys(spec.components);
    if (sizes.length === 0) return R.err('VALIDATION', 'định mức cần ít nhất 1 size');
    for (var i = 0; i < sizes.length; i++) {
      var bad = validateComponents(spec.components[sizes[i]]);
      if (bad) return R.err('VALIDATION', 'size ' + sizes[i] + ': ' + bad);
    }

    var payload = { components: {} };
    sizes.forEach(function (sz) {
      payload.components[sz] = spec.components[sz].map(function (r) {
        return { refType: r.refType, refId: r.refId, qty: r.qty };
      });
    });

    return registry.publish({
      kind: VI.KINDS.recipe,
      subjectId: spec.recipeId,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: payload
    });
  }

  /**
   * Định mức có hiệu lực TẠI THỜI ĐIỂM BÁN.
   * CẤM lấy bản mới nhất để tính lại bill cũ (invariant #13).
   */
  function resolveRecipeAt(registry, spec) {
    return registry.resolveAt(VI.KINDS.recipe, spec.recipeId, spec.storeId, spec.at);
  }

  /**
   * Định mức → yêu cầu vật chất để FIFO cấp phát.
   * Kết quả mang `recipeVersionId` (V4) để bill ghi lại được version đã dùng.
   */
  function toRequirements(recipeVersion, spec) {
    var size = spec.size;
    var qty = spec.qty;
    if (typeof qty !== 'number' || !(qty > 0)) return R.err('VALIDATION', 'qty phải dương');

    var rows = recipeVersion.payload.components[size];
    if (!rows) {
      return R.err('NOT_FOUND',
        'định mức version này không khai size ' + size + ' — không được suy ra từ size khác');
    }

    return R.ok({
      recipeVersionId: recipeVersion.versionId,
      size: size,
      requirements: rows.map(function (r) {
        return { refType: r.refType, itemId: r.refId, qty: r.qty * qty, source: 'recipe' };
      })
    });
  }

  /** Món chưa khai định mức là trạng thái NÓI RA ĐƯỢC, không phải im lặng trả 0. */
  function requireRecipe(menuItem) {
    if (!menuItem.recipeId) {
      return R.err('PRECONDITION',
        'món "' + menuItem.name + '" chưa khai định mức — không tính được giá vốn, ' +
        'và không được im lặng coi giá vốn bằng 0');
    }
    return R.ok(menuItem.recipeId);
  }

  return {
    REF_TYPE: REF_TYPE,
    publishRecipeVersion: publishRecipeVersion,
    resolveRecipeAt: resolveRecipeAt,
    toRequirements: toRequirements,
    requireRecipe: requireRecipe
  };
});
