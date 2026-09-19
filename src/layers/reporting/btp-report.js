/**
 * Báo cáo BTP theo ngày — {nấu, dùng, huỷ}.
 *
 * Đứt chuỗi #3 của FIFO-CHAIN-TRACE-BTP-V1.md [B5]: `thLichSuBTP` của legacy
 * TÍNH ĐÚNG {nau, dung, huy} theo ngày, nhưng chỉ dùng nội bộ cho dự báo và
 * export AI — KHÔNG BAO GIỜ lên màn hình báo cáo cho chủ quán xem.
 *
 * Cùng dạng lỗi "tính nhưng không bao giờ hiển thị" đã thấy ở `stockoutTargetPct`.
 * Chain-trace nói rõ: dữ liệu đã đúng logic, chỉ cần đưa ra, không cần thuật
 * toán mới.
 */
GIEO.define('reporting/btp-report', ['shared-kernel/result'], function (R) {
  'use strict';

  /**
   * @param spec.batches      mẻ đã nấu trong kỳ
   * @param spec.consumption  ledger CONSUMPTION của mặt hàng BTP
   * @param spec.waste        ledger WASTE của mặt hàng BTP
   */
  function buildDaily(spec) {
    var days = Object.create(null);

    function day(k) {
      if (!days[k]) {
        days[k] = { dateKey: k, nau: 0, nauCost: 0, batchCount: 0, dung: 0, huy: 0, huyCost: 0 };
      }
      return days[k];
    }

    (spec.batches || []).forEach(function (b) {
      if (b.status !== 'PRODUCED') return;
      var d = day(b.businessDate);
      d.nau += b.actualYield;
      d.nauCost += b.rawCost;
      d.batchCount += 1;
    });

    (spec.consumption || []).forEach(function (e) {
      day(e.businessDate).dung += Math.abs(e.qtyDelta);
    });

    (spec.waste || []).forEach(function (e) {
      var d = day(e.businessDate);
      d.huy += Math.abs(e.qtyDelta);
      d.huyCost += Math.abs(e.qtyDelta) * (e.unitCost || 0);
    });

    var rows = Object.keys(days).sort().map(function (k) {
      var d = days[k];
      /* Tỉ lệ huỷ trên lượng nấu — con số chủ quán thật sự cần nhìn. */
      d.huyPct = d.nau > 0 ? (d.huy / d.nau) * 100 : null;
      return d;
    });

    return R.ok({
      rows: rows,
      total: rows.reduce(function (s, d) {
        return {
          nau: s.nau + d.nau, dung: s.dung + d.dung, huy: s.huy + d.huy,
          nauCost: s.nauCost + d.nauCost, huyCost: s.huyCost + d.huyCost,
          batchCount: s.batchCount + d.batchCount
        };
      }, { nau: 0, dung: 0, huy: 0, nauCost: 0, huyCost: 0, batchCount: 0 }),
      computedAt: spec.computedAt || null
    });
  }

  /** Cột cho export CSV — thứ tự ổn định giữa các lần xuất. */
  var COLUMNS = [
    { key: 'dateKey', label: 'Ngày' },
    { key: 'batchCount', label: 'Số mẻ' },
    { key: 'nau', label: 'Nấu' },
    { key: 'dung', label: 'Dùng' },
    { key: 'huy', label: 'Huỷ' },
    { key: 'huyPct', label: 'Tỉ lệ huỷ (%)' },
    { key: 'huyCost', label: 'Giá trị huỷ' }
  ];

  return { buildDaily: buildDaily, COLUMNS: COLUMNS };
});
