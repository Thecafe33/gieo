/**
 * Ice COGS — lượng đá trừ kho mỗi ly.
 *
 * Quyết định chủ quán 2026-09-17 (N2, NET-SALES-V1.md): "cửa hàng chỉ có đá
 * chung / đá riêng / không đá, không có ít/nhiều gì cả, nên cứ mặc định cái
 * nào cũng trừ 1 lượng đá theo cài đặt là được, nhưng cũng nên có chỗ bật tắt
 * theo lượng đá cogs nếu cần thiết." Nghĩa là:
 *
 *   1. KHÔNG phân biệt đá chung/đá riêng/không đá khi trừ kho — cả 3 lựa
 *      chọn trừ ĐÚNG CÙNG 1 lượng cấu hình. Lựa chọn đá vẫn được ghi trên
 *      từng dòng bill (xem `commands/sales.js buildBill`) để in tem/nhãn như
 *      legacy, nhưng đó là dữ liệu hiển thị — không rẽ nhánh COGS.
 *   2. Có "chỗ bật tắt": `enabled` nằm NGAY TRONG payload đã versioned, nên
 *      bật/tắt cũng đi qua đúng cơ chế publish — tắt hôm nay không làm trôi
 *      COGS của bill cũ (giữ đúng bất biến §10 mà Recipe/Packaging đã có).
 *
 * Versioned qua VersionedInput dùng chung (không tự chế cơ chế riêng — xem
 * `compaction/versioned-input.js`), vì đổi lượng đá/nguyên liệu đá ảnh hưởng
 * COGS lịch sử y hệt đổi công thức: instance #1/#3 của lớp lỗi đã xác nhận 7
 * lần (GIEO-REBUILD-HANDOFF-V2.md §3) nếu lỡ đọc "cấu hình hiện tại" thay vì
 * resolve tại thời điểm bán.
 *
 * `subjectId` cố định '__default__': đây là cấu hình TOÀN CỬA HÀNG, không
 * theo từng món — đúng như chủ quán mô tả (không có biến thể theo món/size).
 */
GIEO.define('catalog/ice', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input'
], function (ids, R, VI) {
  'use strict';

  var SUBJECT = '__default__';

  function publishIceCogs(registry, spec) {
    if (!spec) return R.err('VALIDATION', 'publishIceCogs cần spec');
    var enabled = !!spec.enabled;
    if (enabled) {
      if (!ids.isId(spec.itemId, 'item')) {
        return R.err('VALIDATION', 'bật trừ đá COGS thì cần itemId nguyên liệu đá hợp lệ');
      }
      if (typeof spec.qtyPerCup !== 'number' || !(spec.qtyPerCup > 0)) {
        return R.err('VALIDATION', 'bật trừ đá COGS thì cần qtyPerCup dương');
      }
    }

    return registry.publish({
      kind: VI.KINDS.iceCogs,
      subjectId: SUBJECT,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: {
        enabled: enabled,
        itemId: enabled ? spec.itemId : null,
        qtyPerCup: enabled ? spec.qtyPerCup : 0
      }
    });
  }

  /**
   * Chưa ai cấu hình thì mặc định TẮT (`isDefault: true`) — không đoán mò
   * nguyên liệu đá hay lượng đá của quán, đúng nguyên tắc "mọi thứ CÓ DEFAULT
   * nhưng không tự bịa dữ liệu nghiệp vụ" của `finance/config.js`.
   */
  function resolveIceCogsAt(registry, spec) {
    var r = registry.resolveAt(VI.KINDS.iceCogs, SUBJECT, spec.storeId, spec.at);
    if (R.isOk(r)) {
      return R.ok({
        enabled: r.value.payload.enabled,
        itemId: r.value.payload.itemId,
        qtyPerCup: r.value.payload.qtyPerCup,
        versionId: r.value.versionId,
        isDefault: false
      });
    }
    return R.ok({ enabled: false, itemId: null, qtyPerCup: 0, versionId: null, isDefault: true });
  }

  /**
   * Yêu cầu vật chất cho `cupQty` ly — ÁP DỤNG ĐỒNG NHẤT bất kể khách chọn đá
   * chung/đá riêng/không đá (chốt N2 ở trên). Trả `null` khi tắt hoặc
   * cupQty không dương, để caller biết KHÔNG có gì cần cộng vào requirements
   * thay vì phải tự suy diễn từ 1 object rỗng.
   */
  function toRequirement(resolved, cupQty) {
    if (!resolved || !resolved.enabled) return null;
    if (typeof cupQty !== 'number' || cupQty <= 0) return null;
    return { itemId: resolved.itemId, qty: resolved.qtyPerCup * cupQty, source: 'ice' };
  }

  return {
    publishIceCogs: publishIceCogs,
    resolveIceCogsAt: resolveIceCogsAt,
    toRequirement: toRequirement
  };
});
