/**
 * Variance report — actual vs theoretical là CHỈ SỐ CHÍNH.
 *
 * FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md: "packages/reporting/variance-report
 * phải hiển thị variance giữa 2 con số này làm chỉ số chính".
 *
 * Nguyên lý "Actual ≠ Theoretical" là nguyên lý trung tâm của Master Plan §10
 * nhưng CHƯA TỪNG được lấp cho domain COGS — nguyên liệu thô có đối chiếu
 * SỐ LƯỢNG (`thDoiChieu`), còn TIỀN thì không có gì để đối chiếu, vì chưa từng
 * có vế actual. Báo cáo này là chỗ vế đó cuối cùng được dùng.
 */
GIEO.define('reporting/variance-report', ['shared-kernel/result'], function (R) {
  'use strict';

  var STATUS = { OK: 'OK', OVER: 'OVER', UNDER: 'UNDER', UNKNOWN: 'UNKNOWN' };

  /**
   * @param spec.cogs       kết quả read-layer.getCOGS (đã có 2 vế)
   * @param spec.revenue    để tính tỉ lệ giá vốn
   * @param spec.targetPct  ngưỡng cogsPct của kỳ (resolve theo NGÀY ở tầng trên)
   * @param spec.tolerancePct
   */
  function build(spec) {
    var c = spec.cogs;
    if (!c) return R.err('VALIDATION', 'variance-report cần kết quả COGS');
    var tol = typeof spec.tolerancePct === 'number' ? spec.tolerancePct : 5;

    var status;
    var message;
    if (c.cogsActual === null) {
      /* Không có vế actual thì KHÔNG có variance — nói thẳng, không lấy
         theoretical so với chính nó rồi báo "khớp". */
      status = STATUS.UNKNOWN;
      message = 'chưa đủ dữ liệu lô để tính giá vốn thật' +
        (c.missingActual && c.missingActual.length ? ' (' + c.missingActual.length + ' bill thiếu)' : '');
    } else if (Math.abs(c.variancePct) <= tol) {
      status = STATUS.OK;
      message = 'giá vốn thật khớp định mức trong ngưỡng ' + tol + '%';
    } else {
      status = c.variance > 0 ? STATUS.OVER : STATUS.UNDER;
      message = (c.variance > 0 ? 'tốn hơn' : 'ít hơn') + ' định mức ' +
        Math.abs(c.variancePct).toFixed(1) + '%';
    }

    var netRevenue = spec.revenue ? spec.revenue.netRevenue : null;
    function pct(v) {
      return (v === null || !netRevenue) ? null : (v / netRevenue) * 100;
    }

    var actualPct = pct(c.cogsActual);
    var overTarget = (typeof spec.targetPct === 'number' && actualPct !== null)
      ? actualPct > spec.targetPct
      : null;

    return R.ok({
      cogsTheoretical: c.cogsTheoretical,
      cogsActual: c.cogsActual,
      variance: c.variance,
      variancePct: c.variancePct,
      status: status,
      message: message,
      /* Hai nguyên nhân gốc mà legacy không phân biệt được vì chỉ có 1 số. */
      possibleCauses: status === STATUS.OVER || status === STATUS.UNDER
        ? ['định mức khai sai (dùng nhiều/ít hơn công thức)', 'giá lô nhập lệch giá đang khai']
        : [],
      cogsPctTheoretical: pct(c.cogsTheoretical),
      cogsPctActual: actualPct,
      targetPct: typeof spec.targetPct === 'number' ? spec.targetPct : null,
      overTarget: overTarget,
      missingActual: c.missingActual || []
    });
  }

  /**
   * Vượt ngưỡng thì sinh cảnh báo CHỦ ĐỘNG.
   *
   * Gap §6 chain-trace Sales: `cogsPct` legacy có so sánh thật nhưng chỉ hiện
   * khi người TỰ mở tab Sức khoẻ — không ghi vào alerts, không chặn gì. Ở đây
   * nó phát ra để alerts domain nhận.
   */
  function toAlerts(report, spec) {
    if (!report.overTarget) return [];
    return [{
      type: 'COGS_OVER_TARGET',
      storeId: spec.storeId,
      businessDate: spec.businessDate,
      subjectKey: 'cogs.' + spec.businessDate,
      data: {
        cogsPct: report.cogsPctActual,
        target: report.targetPct,
        dateKey: spec.businessDate
      }
    }];
  }

  return { STATUS: STATUS, build: build, toAlerts: toAlerts };
});
