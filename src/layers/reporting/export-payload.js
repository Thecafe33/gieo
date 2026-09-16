/**
 * Export báo cáo ĐÃ ĐỊNH DẠNG.
 *
 * Gap (GIEO-REBUILD-HANDOFF-V2.md §4.2, FIFO-CHAIN-TRACE-REPORTING-V1.md §6):
 * legacy không có export báo cáo nào, chỉ có dump JSON thô. Chain-trace nói rõ
 * đây là 2 việc KHÁC NHAU và không thay thế nhau được:
 *   - export báo cáo (CSV tối thiểu) — cho người đọc, cho kế toán
 *   - trích xuất dữ liệu thô — cho phân tích, vẫn giữ riêng
 *
 * Mọi payload mang `computedAt` (§8) để UI luôn hiển thị được độ mới, và mang
 * nhãn cơ sở giá / cờ đóng băng để người đọc biết con số này là gì.
 */
GIEO.define('reporting/export-payload', ['shared-kernel/result'], function (R) {
  'use strict';

  function esc(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /**
   * CSV từ danh sách bản ghi + cột khai tường minh.
   * Khai cột thay vì suy từ khoá object: thứ tự cột phải ổn định giữa các lần
   * export, nếu không file tháng này và tháng sau không xếp cạnh nhau được.
   */
  function toCsv(spec) {
    var columns = spec.columns;
    if (!Array.isArray(columns) || columns.length === 0) {
      return R.err('VALIDATION', 'export CSV phải khai cột — thứ tự cột suy từ object sẽ đổi giữa các lần');
    }
    var rows = spec.rows || [];
    var out = [columns.map(function (c) { return esc(c.label); }).join(',')];

    rows.forEach(function (r) {
      out.push(columns.map(function (c) {
        var v = typeof c.value === 'function' ? c.value(r) : r[c.key];
        return esc(v);
      }).join(','));
    });

    return R.ok(out.join('\n'));
  }

  /**
   * Bọc 1 báo cáo để xuất ra.
   * `meta` của read-layer được mang theo nguyên vẹn, nên file xuất ra nói được
   * số này đến từ đâu và đã đóng băng chưa.
   */
  function buildExport(spec) {
    if (!spec.title) return R.err('VALIDATION', 'export cần tiêu đề');
    if (!spec.period) return R.err('VALIDATION', 'export cần kỳ báo cáo');

    var meta = spec.meta || {};
    var csv = toCsv({ columns: spec.columns, rows: spec.rows });
    if (R.isErr(csv)) return csv;

    return R.ok({
      title: spec.title,
      period: spec.period,
      storeId: spec.storeId,
      /* §8 — mọi payload mang computedAt, không tuỳ màn hình có hay không. */
      computedAt: meta.computedAt || spec.computedAt || null,
      frozen: !!meta.frozen,
      sources: meta.sources || [],
      /* Cơ sở giá đi kèm số, không nằm ở chú thích cuối trang. */
      valuationBasis: spec.valuationBasis || null,
      ambiguous: meta.ambiguous || [],
      csv: csv.value,
      rowCount: (spec.rows || []).length,
      /* Cảnh báo dán ngay trên file, để người cầm file biết nó chưa chốt. */
      notices: buildNotices(meta, spec)
    });
  }

  function buildNotices(meta, spec) {
    var n = [];
    if (!meta.frozen) n.push('Số liệu chưa đóng băng — có thể đổi nếu dữ liệu gốc thay đổi.');
    if (meta.ambiguous && meta.ambiguous.length) {
      n.push(meta.ambiguous.length + ' mục dữ liệu cũ không đủ nghĩa, cần rà thủ công.');
    }
    if (spec.mixedBasis) n.push('Tổng trộn 2 cơ sở giá — xem nhãn từng dòng.');
    if (spec.hasEstimatedExpenses) n.push('Còn chi phí ước tính chờ hoá đơn thật — lãi chưa phải số cuối.');
    return n;
  }

  /**
   * Trích xuất thô — GIỮ RIÊNG, không phải thay thế cho export báo cáo.
   * Chain-trace §6 nói rõ 2 việc này tách biệt.
   */
  function rawExtract(spec) {
    return R.ok({
      kind: 'RAW_EXTRACT',
      purpose: 'phân tích/AI — KHÔNG phải báo cáo cho người đọc',
      storeId: spec.storeId,
      period: spec.period,
      computedAt: spec.computedAt || null,
      data: spec.data || {}
    });
  }

  return { toCsv: toCsv, buildExport: buildExport, rawExtract: rawExtract };
});
