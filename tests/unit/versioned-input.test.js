/**
 * VersionedInput — cơ chế chặn lớp lỗi đã xuất hiện độc lập 7 lần.
 * Contract: FIFO-COMPACTION-CONTRACT-V1.md §1 (V1-V6).
 */

describe('compaction/versioned-input', function () {
  var ids = GIEO.require('shared-kernel/ids');
  var VI = GIEO.require('compaction/versioned-input');

  var STORE = ids.deterministicId('store', ['main']);
  var BOSS = ids.deterministicId('actor', ['boss']);
  var D = function (y, m, d, h) { return new Date(y, m - 1, d, h || 0).getTime(); };

  function reg() { return VI.createRegistry(); }

  function publishCost(r, at, price) {
    return assertOk(r.publish({
      kind: 'cost', subjectId: 'sua-tuoi', storeId: STORE,
      effectiveFrom: at, payload: { unitCost: price }, publishedBy: BOSS
    }));
  }

  describe('V1 — append-only', function () {
    test('publish bản mới đóng effectiveTo bản cũ, không sửa payload bản cũ', function () {
      var r = reg();
      var v1 = publishCost(r, D(2026, 1, 1), 30000);
      var v2 = publishCost(r, D(2026, 2, 1), 35000);
      assert.strictEqual(v1.effectiveTo, D(2026, 2, 1));
      assert.strictEqual(v1.payload.unitCost, 30000, 'payload bản cũ bị đổi');
      assert.strictEqual(v2.supersedesVersionId, v1.versionId);
    });

    test('payload đã publish bị đóng băng — sửa lén không ăn', function () {
      var r = reg();
      var v1 = publishCost(r, D(2026, 1, 1), 30000);
      assert.throws(function () { 'use strict'; v1.payload.unitCost = 99; });
      assert.strictEqual(v1.payload.unitCost, 30000);
    });

    test('không chèn được version có hiệu lực trước bản mới nhất', function () {
      var r = reg();
      publishCost(r, D(2026, 3, 1), 30000);
      var bad = r.publish({
        kind: 'cost', subjectId: 'sua-tuoi', storeId: STORE,
        effectiveFrom: D(2026, 2, 1), payload: { unitCost: 1 }, publishedBy: BOSS
      });
      assertErr(bad, 'PRECONDITION');
    });

    test('publish phải có người chịu trách nhiệm', function () {
      var r = reg();
      assertErr(r.publish({
        kind: 'cost', subjectId: 'x', storeId: STORE,
        effectiveFrom: D(2026, 1, 1), payload: { unitCost: 1 }
      }), 'VALIDATION');
    });

    test('kind bịa ra bị từ chối — cấm tự chế cơ chế riêng', function () {
      var r = reg();
      assertErr(r.publish({
        kind: 'luong_rieng', subjectId: 'x', storeId: STORE,
        effectiveFrom: D(2026, 1, 1), payload: {}, publishedBy: BOSS
      }), 'VALIDATION');
    });
  });

  describe('V2 — resolve theo point-in-time', function () {
    test('bill cũ giữ giá cũ dù hôm nay đã đổi giá (instance #1/#2/#3)', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      publishCost(r, D(2026, 2, 1), 35000);
      var atOldBill = assertOk(r.resolveAt('cost', 'sua-tuoi', STORE, D(2026, 1, 15)));
      assert.strictEqual(atOldBill.payload.unitCost, 30000);
    });

    test('biên effectiveFrom tính là ĐÃ có hiệu lực', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      publishCost(r, D(2026, 2, 1), 35000);
      assert.strictEqual(assertOk(r.resolveAt('cost', 'sua-tuoi', STORE, D(2026, 2, 1))).payload.unitCost, 35000);
    });

    test('trước mọi version thì báo NOT_FOUND, không lấy bừa bản đầu', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      assertErr(r.resolveAt('cost', 'sua-tuoi', STORE, D(2025, 12, 31)), 'NOT_FOUND');
    });

    test('bỏ trống "at" bị từ chối — chặn thói quen resolve theo now()', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      assertErr(r.resolveAt('cost', 'sua-tuoi', STORE, undefined), 'VALIDATION');
    });
  });

  describe('V3 — resolve TỪNG NGÀY (chặn instance #6/#7)', function () {
    test('mỗi ngày trong kỳ nhận đúng version của ngày đó', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      publishCost(r, D(2026, 1, 4), 50000);
      var daily = assertOk(r.resolveDaily('cost', 'sua-tuoi', STORE, D(2026, 1, 1, 8), D(2026, 1, 5, 8)));

      assert.strictEqual(daily['2026-01-01'].version.payload.unitCost, 30000);
      assert.strictEqual(daily['2026-01-03'].version.payload.unitCost, 30000);
      assert.strictEqual(daily['2026-01-04'].version.payload.unitCost, 50000);
      assert.strictEqual(daily['2026-01-05'].version.payload.unitCost, 50000);
    });

    test('KHÔNG áp version của ngày cuối kỳ cho cả kỳ — đây chính là bug KPI target', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      publishCost(r, D(2026, 1, 4), 50000);
      var daily = assertOk(r.resolveDaily('cost', 'sua-tuoi', STORE, D(2026, 1, 1, 8), D(2026, 1, 5, 8)));
      var keys = Object.keys(daily);
      var distinct = {};
      keys.forEach(function (k) { distinct[daily[k].version.payload.unitCost] = 1; });
      assert.strictEqual(Object.keys(distinct).length, 2, 'cả kỳ chỉ ra 1 giá = đã áp 1 mốc cho cả khoảng');
    });

    test('nhiều version trong cùng 1 ngày được gắn cờ, không chọn bừa im lặng', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1, 0), 30000);
      publishCost(r, D(2026, 1, 1, 14), 40000);
      var daily = assertOk(r.resolveDaily('cost', 'sua-tuoi', STORE, D(2026, 1, 1, 0), D(2026, 1, 1, 23)));
      assert.strictEqual(daily['2026-01-01'].multipleVersionsInDay, true);
    });

    test('ngày thiếu version thì báo lỗi, không điền bừa', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 10), 30000);
      assertErr(r.resolveDaily('cost', 'sua-tuoi', STORE, D(2026, 1, 8), D(2026, 1, 12)), 'NOT_FOUND');
    });
  });

  describe('V4/V5 — đọc lại bằng versionId đã lưu', function () {
    test('getByVersionId trả đúng bản đã dùng, kể cả sau khi có bản mới hơn', function () {
      var r = reg();
      var v1 = publishCost(r, D(2026, 1, 1), 30000);
      publishCost(r, D(2026, 2, 1), 35000);
      var again = assertOk(r.getByVersionId(v1.versionId));
      assert.strictEqual(again.payload.unitCost, 30000);
    });

    test('snapshotRef mang đủ để đọc lại — chặn bug payTerms write-only (instance #5)', function () {
      var r = reg();
      var v = assertOk(r.publish({
        kind: 'payTerms', subjectId: 'nv01', storeId: STORE,
        effectiveFrom: D(2026, 1, 1), payload: { rate: 30000, otRate: 45000, otThreshold: 8 },
        publishedBy: BOSS
      }));
      var ref = r.snapshotRef(v);
      assert.strictEqual(ref.versionId, v.versionId);
      assert.strictEqual(ref.payload.rate, 30000);
      /* Có versionId thì luôn tìm lại được bản gốc — điều kiện để đường đọc
         không phải join bảng nhân viên hiện tại. */
      assert.strictEqual(assertOk(r.getByVersionId(ref.versionId)).payload.otRate, 45000);
    });

    test('versionId không tồn tại báo NOT_FOUND', function () {
      assertErr(reg().getByVersionId('version_khong-co'), 'NOT_FOUND');
    });
  });

  describe('tách biệt theo subject và store', function () {
    test('subject khác nhau không đụng nhau', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      assertOk(r.publish({
        kind: 'cost', subjectId: 'ca-phe', storeId: STORE,
        effectiveFrom: D(2026, 1, 1), payload: { unitCost: 90000 }, publishedBy: BOSS
      }));
      assert.strictEqual(assertOk(r.resolveAt('cost', 'sua-tuoi', STORE, D(2026, 1, 5))).payload.unitCost, 30000);
      assert.strictEqual(assertOk(r.resolveAt('cost', 'ca-phe', STORE, D(2026, 1, 5))).payload.unitCost, 90000);
    });

    test('store khác nhau không đụng nhau', function () {
      var r = reg();
      var STORE_B = ids.deterministicId('store', ['b']);
      publishCost(r, D(2026, 1, 1), 30000);
      assertErr(r.resolveAt('cost', 'sua-tuoi', STORE_B, D(2026, 1, 5)), 'NOT_FOUND');
    });

    test('kind khác nhau không đụng nhau dù trùng subjectId', function () {
      var r = reg();
      publishCost(r, D(2026, 1, 1), 30000);
      assertErr(r.resolveAt('recipe', 'sua-tuoi', STORE, D(2026, 1, 5)), 'NOT_FOUND');
    });
  });
});
