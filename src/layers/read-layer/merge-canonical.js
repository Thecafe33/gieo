/**
 * merge-canonical — NƠI DUY NHẤT biết cả LIVE lẫn COMPACT.
 *
 * Contract: UNIFIED-READ-LAYER-CONTRACT-V1.md §4, invariant R1/R2.
 *
 * Gate của Phase 7: không còn UI nào tự branch `if (còn raw) ... else đọc
 * archive/compact`. Cách duy nhất bảo đảm điều đó là chỉ có đúng một nơi trong
 * toàn hệ thống được phép biết có hai nguồn.
 *
 * Thứ tự resolve (§4.1):
 *   1. SNAPSHOT (đã chốt/compacted)  → đọc thẳng, KHÔNG tính lại
 *   2. CACHE (tính lại được)          → nếu còn hợp lệ
 *   3. LIVE RAW                        → tính từ ledger/unit/bill
 *   4. LEGACY                          → qua adapter, CHỈ ĐỌC
 */
GIEO.define('read-layer/merge-canonical', ['shared-kernel/result'], function (R) {
  'use strict';

  var SOURCE = { SNAPSHOT: 'SNAPSHOT', CACHE: 'CACHE', LIVE: 'LIVE', LEGACY: 'LEGACY' };

  /**
   * Bọc kết quả kèm metadata nguồn.
   *
   * `meta` để CHẨN ĐOÁN và hiển thị cờ — KHÔNG phải để UI branch logic theo
   * nguồn (R1). UI đọc `data`, và `data` giống nhau bất kể đến từ đâu.
   */
  function wrap(data, meta) {
    return R.ok({
      data: data,
      meta: {
        sources: (meta && meta.sources) || [],
        frozen: !!(meta && meta.frozen),
        versionIds: (meta && meta.versionIds) || {},
        ambiguous: (meta && meta.ambiguous) || [],
        computedAt: (meta && meta.computedAt) || null
      }
    });
  }

  /**
   * Chọn nguồn theo đúng thứ tự ưu tiên.
   *
   * @param spec.snapshot  kết quả đã đóng băng (nếu có)
   * @param spec.cache     kết quả cache còn hợp lệ (nếu có)
   * @param spec.computeLive  () => Result  — chỉ gọi khi cần
   * @param spec.legacy    () => Result     — chỉ gọi khi live không có gì
   */
  function resolve(spec) {
    if (spec.snapshot) {
      /* Đã chốt thì ĐỌC THẲNG. "Con số chủ quán đã đọc và đã dùng để ra quyết
         định thì không được đổi sau lưng." */
      var snapshotData = spec.snapshot.canonical || spec.snapshot.values || spec.snapshot;
      return wrap(snapshotData, {
        sources: [SOURCE.SNAPSHOT], frozen: true,
        versionIds: spec.snapshot.versionIds || snapshotData.versionIds || {}, computedAt: spec.computedAt
      });
    }
    if (spec.cache) {
      return wrap(spec.cache, {
        sources: [SOURCE.CACHE], frozen: false, computedAt: spec.computedAt
      });
    }

    if (typeof spec.computeLive === 'function') {
      var live = spec.computeLive();
      if (R.isErr(live)) return live;
      if (live.value !== null && live.value !== undefined) {
        var sources = [SOURCE.LIVE];
        var ambiguous = [];

        /* Dữ liệu cũ không đủ nghĩa: đánh dấu AMBIGUOUS, KHÔNG suy đoán
           (invariant #12). UI/report hiện "cần rà thủ công" thay vì im lặng
           dựng số. */
        if (typeof spec.legacy === 'function') {
          var lg = spec.legacy();
          if (R.isOk(lg) && lg.value) {
            sources.push(SOURCE.LEGACY);
            if (lg.value.ambiguous) ambiguous = ambiguous.concat(lg.value.ambiguous);
          }
        }
        return wrap(live.value, {
          sources: sources, frozen: false, ambiguous: ambiguous, computedAt: spec.computedAt
        });
      }
    }

    if (typeof spec.legacy === 'function') {
      var only = spec.legacy();
      if (R.isErr(only)) return only;
      if (only.value) {
        return wrap(only.value, {
          sources: [SOURCE.LEGACY], frozen: false,
          ambiguous: only.value.ambiguous || [], computedAt: spec.computedAt
        });
      }
    }

    return R.err('NOT_FOUND', 'không có nguồn nào trả được dữ liệu cho truy vấn này');
  }

  /**
   * Cache invalidate THEO PHẠM VI, không xoá sạch (quy tắc K3).
   *
   * Legacy `clearSalesCache()`/`invalidateSalesCache()` xoá TOÀN BỘ cache mọi
   * ngày mỗi khi đổi cấu hình ảnh hưởng giá vốn, rồi tính lại bằng version
   * HIỆN TẠI — chính là instance #2/#3 của lớp lỗi versioning.
   *
   * Ở đây chỉ những ngày bị ảnh hưởng mới bị bỏ, và khi tính lại thì dùng
   * version lịch sử của từng ngày nên kết quả GIỐNG HỆT kết quả cũ.
   */
  function invalidateScope(cacheKeys, spec) {
    var from = spec.fromDateKey;
    var to = spec.toDateKey;
    if (!from || !to) return R.err('VALIDATION', 'invalidate cần phạm vi ngày — cấm xoá sạch cache');

    var kept = [];
    var dropped = [];
    cacheKeys.forEach(function (k) {
      var d = k.dateKey;
      if (d >= from && d <= to && (!spec.storeId || k.storeId === spec.storeId)) dropped.push(k);
      else kept.push(k);
    });
    return R.ok({ kept: kept, dropped: dropped });
  }

  return {
    SOURCE: SOURCE,
    wrap: wrap,
    resolve: resolve,
    invalidateScope: invalidateScope
  };
});
