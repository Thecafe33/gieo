/**
 * Config — cấu hình vận hành, đi qua cơ chế versioning DÙNG CHUNG.
 *
 * FEATURE-TREE-V1.md §2 mục [7]: domain này optional với phần còn lại của hệ
 * thống, mọi thứ CÓ DEFAULT — nên không domain nào phải chờ nó mới chạy được.
 * Nhưng khi giá trị được đặt thì nó phải versioned, vì có những cấu hình ảnh
 * hưởng thẳng vào số liệu lịch sử (KPI target là instance #6 của lớp lỗi đã
 * xác nhận 7 lần: `computeKPIs()` resolve target tại NGÀY CUỐI của cả khoảng
 * báo cáo rồi áp cho toàn khoảng).
 *
 * `FINISH_REVIEW_RATIO` nằm ở đây theo đúng xác nhận của chủ quán: cấu hình ở
 * QUANLY, không hard-code. fifo-core nhận nó qua tham số nên vẫn là domain
 * thuần — nó không tự đọc config.
 */
GIEO.define('finance/config', [
  'shared-kernel/result',
  'compaction/versioned-input'
], function (R, VI) {
  'use strict';

  /**
   * Khoá cấu hình và giá trị mặc định.
   *
   * Mặc định có mặt để hệ thống chạy được ngay khi chưa ai cấu hình gì — đúng
   * nguyên tắc "domain này optional với phần còn lại".
   */
  var KEYS = {
    /* Báo hết hũ khi còn > tỉ lệ này thì gắn needsReview (chủ quán chốt: cấu
       hình ở QUANLY). 0.25 là con số legacy từng định dùng nhưng chưa bao giờ
       nối vào code. */
    finishReviewRatio: { default: 0.25, min: 0, max: 1 },
    /* Ngưỡng cảnh báo giá vốn / hao hụt — nền của alert chủ động. */
    cogsPctTarget: { default: null, min: 0, max: 100 },
    wastePctTarget: { default: null, min: 0, max: 100 },
    /* Ngưỡng dung sai khi đối chiếu tồn kho. */
    stockVarianceTolerance: { default: 0, min: 0, max: null },
    /* Số lần đếm tiền tối đa trước khi chốt đoạn ca. */
    maxCashCounts: { default: 3, min: 1, max: 20 }
  };

  function isKey(k) { return Object.prototype.hasOwnProperty.call(KEYS, k); }

  function publishConfig(registry, spec) {
    if (!spec || !isKey(spec.key)) {
      return R.err('VALIDATION', 'khoá cấu hình không hợp lệ: ' + (spec && spec.key));
    }
    var def = KEYS[spec.key];
    if (typeof spec.value !== 'number') {
      return R.err('VALIDATION', 'giá trị cấu hình "' + spec.key + '" phải là số');
    }
    if (def.min !== null && spec.value < def.min) {
      return R.err('VALIDATION', spec.key + ' phải >= ' + def.min);
    }
    if (def.max !== null && spec.value > def.max) {
      return R.err('VALIDATION', spec.key + ' phải <= ' + def.max);
    }

    return registry.publish({
      kind: VI.KINDS.config,
      subjectId: spec.key,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: { key: spec.key, value: spec.value }
    });
  }

  /**
   * Giá trị có hiệu lực TẠI THỜI ĐIỂM SỰ KIỆN, rơi về mặc định nếu chưa ai đặt.
   * Trả kèm `versionId` (null khi dùng mặc định) để nơi ghi kết quả lưu lại được.
   */
  function resolveConfigAt(registry, spec) {
    if (!isKey(spec.key)) return R.err('VALIDATION', 'khoá cấu hình không hợp lệ: ' + spec.key);
    var r = registry.resolveAt(VI.KINDS.config, spec.key, spec.storeId, spec.at);
    if (R.isOk(r)) {
      return R.ok({ key: spec.key, value: r.value.payload.value, versionId: r.value.versionId, isDefault: false });
    }
    return R.ok({ key: spec.key, value: KEYS[spec.key].default, versionId: null, isDefault: true });
  }

  /**
   * KPI target theo TỪNG NGÀY — đóng instance #6.
   *
   * Legacy resolve target tại ngày cuối của cả khoảng báo cáo rồi áp cho toàn
   * khoảng, nên mọi ngày còn lại đều bị so với target sai. Có hàm này thì
   * không còn lý do làm vậy.
   */
  function resolveConfigDaily(registry, spec) {
    if (!isKey(spec.key)) return R.err('VALIDATION', 'khoá cấu hình không hợp lệ: ' + spec.key);
    var r = registry.resolveDaily(VI.KINDS.config, spec.key, spec.storeId, spec.fromTs, spec.toTs);
    if (R.isOk(r)) return r;
    /* Chưa ai đặt giá trị nào trong kỳ: dùng mặc định cho mọi ngày, và NÓI RÕ
       là mặc định thay vì giả vờ có cấu hình. */
    var out = {};
    var clock = spec.clock;
    clock.eachDay(spec.fromTs, spec.toTs).forEach(function (dateKey) {
      out[dateKey] = {
        dateKey: dateKey,
        version: null,
        value: KEYS[spec.key].default,
        isDefault: true,
        multipleVersionsInDay: false
      };
    });
    return R.ok(out);
  }

  return {
    KEYS: KEYS,
    isKey: isKey,
    publishConfig: publishConfig,
    resolveConfigAt: resolveConfigAt,
    resolveConfigDaily: resolveConfigDaily
  };
});
