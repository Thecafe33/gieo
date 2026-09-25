/**
 * VersionedInput — CƠ CHẾ VERSIONING DÙNG CHUNG.
 *
 * Contract: FIFO-COMPACTION-CONTRACT-V1.md §1 (quy tắc V1-V6).
 *
 * Vì sao dùng chung chứ không mỗi domain một kiểu: cùng 1 lớp lỗi đã xuất hiện
 * ĐỘC LẬP ở 7 domain không liên quan nhau về nghiệp vụ (GIEO-REBUILD-HANDOFF-V2.md §3)
 *   1 Recipe    — đổi công thức, COGS lịch sử tính lại theo công thức mới
 *   2 Cost      — invalidateSalesCache() xoá sạch cache khi đổi giá
 *   3 Packaging — cùng cơ chế trên
 *   4 BTP yield — sửa yield mẻ cũ, prepCostOn resolve yieldActualAvg hiện tại
 *   5 PayTerms  — snapshot lúc check-in bị ghi nhưng KHÔNG BAO GIỜ đọc lại
 *   6 KPI target— resolve tại NGÀY CUỐI kỳ rồi áp cho toàn kỳ
 *   7 Báo cáo kỳ— cả 2 cột so sánh đều tính sống, không đóng băng
 *
 * 7 lần cùng 1 lỗi = lỗ hổng kiến trúc, không phải 7 case cần 7 lần sửa riêng.
 * Sửa riêng lẻ thì domain thứ 8 lại mắc lại.
 */
GIEO.define('compaction/versioned-input', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'shared-kernel/clock'
], function (ids, R, clockLib) {
  'use strict';

  /* 7 loại gốc ở §1, cộng thêm về sau vẫn đi qua CƠ CHẾ NÀY — thêm loại mới =
     thêm vào đây, không tự chế cơ chế riêng.
     `iceCogs` (N2, NET-SALES-V1.md, chốt chủ quán 2026-09-17): lượng đá trừ
     kho mỗi ly. Ảnh hưởng COGS lịch sử y hệt Recipe/Packaging (đổi lượng đá
     hôm nay không được làm trôi COGS bill cũ) nên phải versioned, không phải
     1 số cấu hình đọc sống — xem `catalog/ice.js`. */
  var KINDS = {
    recipe: 'recipe',
    cost: 'cost',
    packaging: 'packaging',
    prepYield: 'prepYield',
    payTerms: 'payTerms',
    kpiTarget: 'kpiTarget',
    config: 'config',
    iceCogs: 'iceCogs'
  };

  function isKind(k) { return Object.prototype.hasOwnProperty.call(KINDS, k); }

  /**
   * V1 — append-only. Version đã publish thì payload BẤT BIẾN.
   * Đóng băng bằng Object.freeze để lỗi "sửa version cũ" nổ ngay ở strict mode,
   * thay vì âm thầm làm trôi mọi số liệu lịch sử đã dùng version đó.
   */
  function freezeDeep(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { freezeDeep(o[k]); });
    }
    return o;
  }

  function createRegistry(opts) {
    opts = (opts || {});
    var clock = opts.clock || clockLib.createClock();
    /* key = kind|subjectId|storeId  →  mảng version sắp theo effectiveFrom tăng dần */
    var byKey = Object.create(null);

    function keyOf(kind, subjectId, storeId) {
      return kind + '|' + subjectId + '|' + storeId;
    }

    function listVersions(kind, subjectId, storeId) {
      return (byKey[keyOf(kind, subjectId, storeId)] || []).slice();
    }

    /**
     * Publish 1 version mới. KHÔNG sửa version cũ — chỉ đóng `effectiveTo` của
     * bản đang mở tại thời điểm đó (V1).
     */
    function publish(spec) {
      if (!spec) return R.err('VALIDATION', 'publish cần spec');
      if (!isKind(spec.kind)) return R.err('VALIDATION', 'kind không hợp lệ: ' + spec.kind);
      if (!spec.subjectId) return R.err('VALIDATION', 'publish cần subjectId');
      if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'publish cần storeId hợp lệ');
      if (typeof spec.effectiveFrom !== 'number') {
        return R.err('VALIDATION', 'publish cần effectiveFrom (timestamp)');
      }
      if (spec.payload === undefined || spec.payload === null) {
        return R.err('VALIDATION', 'publish cần payload');
      }
      if (!ids.isId(spec.publishedBy, 'actor')) {
        return R.err('VALIDATION', 'publish cần publishedBy — mọi thay đổi số liệu phải có người chịu trách nhiệm');
      }

      var key = keyOf(spec.kind, spec.subjectId, spec.storeId);
      var list = byKey[key] || (byKey[key] = []);

      /* Không cho chèn version có hiệu lực TRƯỚC bản mới nhất: lịch sử phải
         tiến về phía trước. Muốn sửa quá khứ thì đi đường correction (§3),
         không phải nhét lén 1 version vào giữa. */
      var last = list[list.length - 1];
      if (last && spec.effectiveFrom <= last.effectiveFrom) {
        return R.err('PRECONDITION',
          'effectiveFrom (' + spec.effectiveFrom + ') phải sau version mới nhất (' + last.effectiveFrom + '). ' +
          'Sửa hiệu lực trong quá khứ phải đi qua correction, không phải publish.');
      }

      var version = {
        kind: spec.kind,
        subjectId: String(spec.subjectId),
        storeId: spec.storeId,
        versionId: spec.versionId || ids.newId('version'),
        effectiveFrom: spec.effectiveFrom,
        effectiveTo: null,
        payload: spec.payload,
        publishedAt: spec.publishedAt || clock.now(),
        publishedBy: spec.publishedBy,
        supersedesVersionId: last ? last.versionId : null
      };

      if (last) {
        /* effectiveTo của bản cũ được đặt LÚC NÀY, không phải sửa payload.
           Đây là ranh giới hiệu lực, không phải nội dung. */
        last.effectiveTo = spec.effectiveFrom;
      }
      freezeDeep(version.payload);
      list.push(version);
      return R.ok(version);
    }

    /**
     * V2 — resolve theo point-in-time. `at` là thời điểm SỰ KIỆN nghiệp vụ
     * (occurredAt của bill/mẻ/ca), KHÔNG phải Date.now().
     */
    function resolveAt(kind, subjectId, storeId, at) {
      if (typeof at !== 'number') {
        return R.err('VALIDATION', 'resolveAt cần "at" là timestamp của sự kiện, không được bỏ trống');
      }
      var list = byKey[keyOf(kind, subjectId, storeId)] || [];
      for (var i = list.length - 1; i >= 0; i--) {
        var v = list[i];
        if (v.effectiveFrom <= at && (v.effectiveTo === null || at < v.effectiveTo)) return R.ok(v);
      }
      return R.err('NOT_FOUND',
        'không có version ' + kind + ' nào có hiệu lực cho "' + subjectId + '" tại ' + new Date(at).toISOString());
    }

    /**
     * V3 — resolve TỪNG NGÀY trong khoảng.
     *
     * Đây là hàm chặn bug instance #6/#7: có sẵn đường đúng thì không còn lý do
     * để ai đó resolve 1 lần tại ngày cuối kỳ rồi áp cho cả kỳ.
     *
     * Nếu trong 1 ngày có nhiều hơn 1 version thì KHÔNG im lặng chọn bừa —
     * đánh dấu `multipleVersionsInDay` để caller biết độ phân giải ngày không
     * đủ diễn tả thay đổi đó.
     */
    function resolveDaily(kind, subjectId, storeId, fromTs, toTs) {
      if (typeof fromTs !== 'number' || typeof toTs !== 'number') {
        return R.err('VALIDATION', 'resolveDaily cần fromTs và toTs là timestamp');
      }
      if (toTs < fromTs) return R.err('VALIDATION', 'resolveDaily: toTs < fromTs');

      var list = byKey[keyOf(kind, subjectId, storeId)] || [];
      var out = {};
      var cur = fromTs;
      var lastKey = clock.calendarDate(toTs);

      for (var guard = 0; guard < 4000; guard++) {
        var dateKey = clock.calendarDate(cur);
        var r = resolveAt(kind, subjectId, storeId, cur);
        if (R.isErr(r)) return r;

        var dayEnd = cur + 24 * 3600 * 1000;
        var overlaps = list.filter(function (v) {
          return v.effectiveFrom < dayEnd && (v.effectiveTo === null || v.effectiveTo > cur);
        }).length;

        out[dateKey] = {
          dateKey: dateKey,
          version: r.value,
          multipleVersionsInDay: overlaps > 1
        };
        if (dateKey >= lastKey) return R.ok(out);
        cur = dayEnd;
      }
      return R.err('VALIDATION', 'resolveDaily: khoảng quá dài (>4000 ngày)');
    }

    /**
     * V4 — đọc lại lịch sử bằng versionId ĐÃ LƯU trên record, không resolve lại.
     * Mọi đường đọc số liệu lịch sử phải đi qua đây, không qua resolveAt.
     */
    function getByVersionId(versionId) {
      var keys = Object.keys(byKey);
      for (var i = 0; i < keys.length; i++) {
        var list = byKey[keys[i]];
        for (var j = 0; j < list.length; j++) {
          if (list[j].versionId === versionId) return R.ok(list[j]);
        }
      }
      return R.err('NOT_FOUND', 'không có version "' + versionId + '"');
    }

    /**
     * V5 — snapshot lúc ghi KHÔNG được là write-only.
     * Trả về phần đính kèm bắt buộc cho mọi record kết quả. Record nào thiếu
     * `versionId` là record không đọc lại được — chính là bug payTerms của legacy.
     */
    function snapshotRef(version) {
      return {
        versionId: version.versionId,
        kind: version.kind,
        subjectId: version.subjectId,
        effectiveFrom: version.effectiveFrom,
        payload: version.payload
      };
    }

    /** Nạp version đã có sẵn từ kho (khi khôi phục state), bỏ qua luật thứ tự publish. */
    function hydrate(versions) {
      for (var i = 0; i < versions.length; i++) {
        var v = versions[i];
        if (!isKind(v.kind)) return R.err('VALIDATION', 'hydrate: kind không hợp lệ ' + v.kind);
        var key = keyOf(v.kind, v.subjectId, v.storeId);
        (byKey[key] || (byKey[key] = [])).push(freezeDeep(v));
      }
      Object.keys(byKey).forEach(function (k) {
        byKey[k].sort(function (a, b) { return a.effectiveFrom - b.effectiveFrom; });
      });
      return R.ok(versions.length);
    }

    return {
      publish: publish,
      resolveAt: resolveAt,
      resolveDaily: resolveDaily,
      getByVersionId: getByVersionId,
      snapshotRef: snapshotRef,
      listVersions: listVersions,
      hydrate: hydrate
    };
  }

  return {
    KINDS: KINDS,
    isKind: isKind,
    createRegistry: createRegistry
  };
});
