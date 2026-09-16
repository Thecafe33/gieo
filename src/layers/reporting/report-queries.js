/**
 * Các báo cáo P11 dưới dạng QUERY đăng ký — §15 GIEO-SYSTEM-REBUILD-PLAN.md.
 *
 * Vì sao module này tồn tại: tầng `reporting` đã có sẵn định giá tồn, variance,
 * BTP và export, nhưng không app nào với tới được vì chúng chưa bao giờ được
 * đăng ký thành query. Một báo cáo không đăng ký thì hoặc là không dùng được,
 * hoặc sẽ được dùng bằng cách đọc thẳng nguồn thô — và đọc thẳng nguồn thô đúng
 * là thứ `LIVE + COMPACT → UNIFIED READ → REPORT` sinh ra để cấm.
 *
 * Mọi query ở đây đi qua ĐÚNG cổng quyền của read-layer (`guardRead`), không
 * có sổ quyền thứ hai.
 */
GIEO.define('reporting/report-queries', [
  'shared-kernel/result',
  'read-layer/gateway',
  'reporting/usage-report',
  'reporting/inventory-valuation',
  'reporting/variance-report',
  'reporting/btp-report',
  'reporting/export-payload'
], function (R, gateway, usage, valuation, variance, btp, exportLib) {
  'use strict';

  /* Báo cáo quản trị: mặc định KHÔNG thuộc tầng EXECUTE. Người đứng bán không
     cần đọc giá trị tồn kho hay tỉ lệ giá vốn để làm việc của mình. */
  var Q = {
    GetUsageReport: gateway.registerQuery('GetUsageReport', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetLossReport: gateway.registerQuery('GetLossReport', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetInventoryValuation: gateway.registerQuery('GetInventoryValuation', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetVarianceReport: gateway.registerQuery('GetVarianceReport', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetBTPReport: gateway.registerQuery('GetBTPReport', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* Xuất file mang số ra ngoài hệ thống — để ở tầng cao nhất. */
    ExportReport: gateway.registerQuery('ExportReport', { authority: 'MASTER_CONFIGURE' })
  };

  function wrap(data, ctx) {
    return R.ok({
      data: data,
      meta: { sources: ['LIVE'], frozen: false, ambiguous: [], computedAt: ctx.clock.now() }
    });
  }

  function getUsageReport(ctx, spec) {
    var g = gateway.guardRead(Q.GetUsageReport, ctx, spec);
    if (R.isErr(g)) return g;
    var r = usage.build({ entries: spec.entries || [], itemNames: spec.itemNames });
    return R.isErr(r) ? r : wrap(r.value, ctx);
  }

  function getLossReport(ctx, spec) {
    var g = gateway.guardRead(Q.GetLossReport, ctx, spec);
    if (R.isErr(g)) return g;
    /* Cùng một lần đọc sổ với usage — không có đường đếm hao hụt thứ hai. */
    var r = usage.build({ entries: spec.entries || [], itemNames: spec.itemNames });
    if (R.isErr(r)) return r;
    return wrap(usage.lossOnly(r.value), ctx);
  }

  function getInventoryValuation(ctx, spec) {
    var g = gateway.guardRead(Q.GetInventoryValuation, ctx, spec);
    if (R.isErr(g)) return g;
    var r = valuation.valuate({
      units: spec.units || [],
      untrackedBase: spec.untrackedBase || 0,
      latestCost: spec.latestCost
    });
    return R.isErr(r) ? r : wrap(r.value, ctx);
  }

  function getVarianceReport(ctx, spec) {
    var g = gateway.guardRead(Q.GetVarianceReport, ctx, spec);
    if (R.isErr(g)) return g;
    var r = variance.build({
      cogs: spec.cogs, revenue: spec.revenue,
      targetPct: spec.targetPct, tolerancePct: spec.tolerancePct
    });
    return R.isErr(r) ? r : wrap(r.value, ctx);
  }

  function getBTPReport(ctx, spec) {
    var g = gateway.guardRead(Q.GetBTPReport, ctx, spec);
    if (R.isErr(g)) return g;
    var r = btp.buildDaily({
      batches: spec.batches || [],
      consumption: spec.consumption || [],
      waste: spec.waste || [],
      dateKey: spec.dateKey
    });
    return R.isErr(r) ? r : wrap(r.value, ctx);
  }

  /**
   * Xuất file. `meta` của báo cáo gốc đi kèm nguyên vẹn, nên file nói được số
   * đến từ đâu và đã chốt hay chưa — không có file nào rời khỏi hệ thống mà
   * không mang theo xuất xứ.
   */
  function exportReport(ctx, spec) {
    var g = gateway.guardRead(Q.ExportReport, ctx, spec);
    if (R.isErr(g)) return g;
    if (!spec.meta) {
      return R.err('VALIDATION',
        'xuất báo cáo phải kèm meta của truy vấn gốc — file không mang xuất xứ là file không kiểm chứng được');
    }
    var r = exportLib.buildExport({
      title: spec.title, period: spec.period, storeId: spec.storeId || ctx.storeId,
      columns: spec.columns, rows: spec.rows, meta: spec.meta,
      valuationBasis: spec.valuationBasis, computedAt: ctx.clock.now()
    });
    return R.isErr(r) ? r : R.ok({ data: r.value, meta: spec.meta });
  }

  return {
    QUERIES: Q,
    getUsageReport: getUsageReport,
    getLossReport: getLossReport,
    getInventoryValuation: getInventoryValuation,
    getVarianceReport: getVarianceReport,
    getBTPReport: getBTPReport,
    exportReport: exportReport
  };
});
