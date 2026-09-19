/**
 * Báo cáo Waste / Lost / Usage — P11 của GIEO-SYSTEM-REBUILD-PLAN.md §15.
 *
 * Ba báo cáo này là BA LÁT CẮT của cùng một cuốn sổ, nên ở đây là một module
 * đọc ledger một lần rồi tách ra, không phải ba module cộng ba lần. Legacy có
 * ba đường đếm hao hụt riêng và chúng không khớp nhau — chính là lớp lệch mà
 * quy tắc R3 ("một canonical query, một implementation") sinh ra để chặn.
 *
 * Nguồn DUY NHẤT là ledger. Không đọc `currentStock`, không đọc bất kỳ ô tổng
 * nào đã được cộng sẵn: ô tổng là projection, và projection sai thì báo cáo sai
 * theo mà không ai biết.
 */
GIEO.define('reporting/usage-report', [
  'shared-kernel/result'
], function (R) {
  'use strict';

  /* Ánh xạ loại bút toán → cột báo cáo. Loại nào chưa khai thì được đếm riêng
     chứ không im lặng bỏ qua — bỏ qua là cách một dòng hao hụt biến mất. */
  var BUCKET = {
    CONSUMPTION: 'consumed',
    WASTE: 'waste',
    LOST: 'lost',
    FOUND: 'found',
    ADJUSTMENT: 'adjustment',
    REVERSAL: 'reversal',
    RECEIVING: 'received',
    TRANSFER: 'transfer'
  };

  var COLUMNS = [
    'itemId', 'received', 'consumed', 'waste', 'lost', 'found',
    'adjustment', 'reversal', 'net', 'untrackedQty'
  ];

  function emptyRow(itemId) {
    return {
      itemId: itemId,
      received: 0, consumed: 0, waste: 0, lost: 0, found: 0,
      adjustment: 0, reversal: 0, transfer: 0,
      net: 0,
      /* Phần không gắn được Unit để RIÊNG. Gộp vào tổng là cách legacy làm cho
         "hao hụt" và "chưa ghi nhận được" trông giống hệt nhau. */
      untrackedQty: 0,
      unitIds: []
    };
  }

  /**
   * @param spec.entries     ledger entries trong kỳ (đã lọc theo store/kỳ ở tầng trên)
   * @param spec.itemNames   {itemId: tên} — chỉ để hiển thị, không ảnh hưởng số
   */
  function build(spec) {
    if (!spec || !Array.isArray(spec.entries)) {
      return R.err('VALIDATION', 'usage-report cần mảng entries');
    }
    var names = spec.itemNames || {};
    var byItem = Object.create(null);
    var unknownTypes = [];

    spec.entries.forEach(function (e) {
      var col = BUCKET[e.type];
      if (!col) {
        unknownTypes.push(e.type);
        return;
      }
      var row = byItem[e.itemId] || (byItem[e.itemId] = emptyRow(e.itemId));
      /* Cột báo cáo là ĐỘ LỚN (hao bao nhiêu), `net` giữ dấu để đối chiếu được
         với projection. Trộn hai thứ vào một cột là cách số liệu hết đọc được. */
      row[col] += Math.abs(e.qtyDelta);
      row.net += e.qtyDelta;
      if (!e.unitId) row.untrackedQty += Math.abs(e.qtyDelta);
      else if (row.unitIds.indexOf(e.unitId) === -1) row.unitIds.push(e.unitId);
    });

    var rows = Object.keys(byItem).sort().map(function (itemId) {
      return Object.assign({ itemName: names[itemId] || null }, byItem[itemId]);
    });

    function totalOf(col) {
      return rows.reduce(function (a, r) { return a + r[col]; }, 0);
    }

    return R.ok({
      rows: rows,
      totals: {
        received: totalOf('received'),
        consumed: totalOf('consumed'),
        waste: totalOf('waste'),
        lost: totalOf('lost'),
        found: totalOf('found'),
        adjustment: totalOf('adjustment'),
        reversal: totalOf('reversal'),
        net: totalOf('net'),
        untrackedQty: totalOf('untrackedQty')
      },
      entryCount: spec.entries.length,
      unknownTypes: unknownTypes.filter(function (v, i, a) { return a.indexOf(v) === i; })
    });
  }

  /** Lát cắt hao hụt: chỉ những mặt hàng thật sự có waste/lost trong kỳ. */
  function lossOnly(report) {
    return {
      rows: report.rows.filter(function (r) { return r.waste > 0 || r.lost > 0; }),
      totalWaste: report.totals.waste,
      totalLost: report.totals.lost,
      /* Tìm thấy lại được trừ ra khỏi mất — nhưng hiện cả hai số, vì "mất 10 tìm
         lại 10" khác hẳn "không mất gì". */
      netLost: report.totals.lost - report.totals.found,
      totalFound: report.totals.found
    };
  }

  var TOTAL_COLS = [
    'received', 'consumed', 'waste', 'lost', 'found',
    'adjustment', 'reversal', 'net', 'untrackedQty'
  ];

  /** Cột cho export CSV theo ngày — cùng hình dạng với `btp-report.js`. */
  var DAILY_COLUMNS = [
    { key: 'dateKey', label: 'Ngày' },
    { key: 'itemId', label: 'Nguyên liệu' },
    { key: 'received', label: 'Nhận' },
    { key: 'consumed', label: 'Dùng' },
    { key: 'waste', label: 'Hao hụt' },
    { key: 'lost', label: 'Mất' },
    { key: 'found', label: 'Tìm lại' },
    { key: 'adjustment', label: 'Điều chỉnh' },
    { key: 'net', label: 'Ròng' },
    { key: 'untrackedQty', label: 'Chưa gắn lô' }
  ];

  /**
   * RM7 — cùng nguồn/cùng luật với `build()`, chỉ thêm chiều `businessDate` mà
   * hệ cũ tính đúng (`thLichSuBTP` cho BTP) nhưng nguyên liệu thô chưa từng có.
   * `businessDate` là trường bắt buộc của mọi ledger entry (`fifo-core/ledger.js`
   * từ chối entry thiếu nó) nên không cần fallback gap-flag ở đây.
   *
   * @param spec.entries     ledger entries trong kỳ (đã lọc theo store/kỳ ở tầng trên)
   * @param spec.itemNames   {itemId: tên} — chỉ để hiển thị, không ảnh hưởng số
   */
  function buildDaily(spec) {
    if (!spec || !Array.isArray(spec.entries)) {
      return R.err('VALIDATION', 'usage-report cần mảng entries');
    }
    var names = spec.itemNames || {};
    var byDay = Object.create(null);
    var unknownTypes = [];

    spec.entries.forEach(function (e) {
      var col = BUCKET[e.type];
      if (!col) { unknownTypes.push(e.type); return; }
      var dateKey = e.businessDate;
      var day = byDay[dateKey] || (byDay[dateKey] = Object.create(null));
      var row = day[e.itemId] || (day[e.itemId] = Object.assign(emptyRow(e.itemId), { dateKey: dateKey }));
      row[col] += Math.abs(e.qtyDelta);
      row.net += e.qtyDelta;
      if (!e.unitId) row.untrackedQty += Math.abs(e.qtyDelta);
      else if (row.unitIds.indexOf(e.unitId) === -1) row.unitIds.push(e.unitId);
    });

    var dateKeys = Object.keys(byDay).sort();
    var rows = [];
    dateKeys.forEach(function (dateKey) {
      Object.keys(byDay[dateKey]).sort().forEach(function (itemId) {
        rows.push(Object.assign({ itemName: names[itemId] || null }, byDay[dateKey][itemId]));
      });
    });

    /* Tổng theo ngày, gộp mọi mặt hàng — con số đầu tiên chủ quán nhìn vào,
       chi tiết theo mặt hàng nằm ở `rows` khi cần đào sâu. */
    var days = dateKeys.map(function (dateKey) {
      var t = { dateKey: dateKey };
      TOTAL_COLS.forEach(function (c) { t[c] = 0; });
      Object.keys(byDay[dateKey]).forEach(function (itemId) {
        var r = byDay[dateKey][itemId];
        TOTAL_COLS.forEach(function (c) { t[c] += r[c]; });
      });
      return t;
    });

    return R.ok({
      rows: rows,
      days: days,
      entryCount: spec.entries.length,
      unknownTypes: unknownTypes.filter(function (v, i, a) { return a.indexOf(v) === i; })
    });
  }

  return {
    COLUMNS: COLUMNS, DAILY_COLUMNS: DAILY_COLUMNS, BUCKET: BUCKET,
    build: build, lossOnly: lossOnly, buildDaily: buildDaily
  };
});
