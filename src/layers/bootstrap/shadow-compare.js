/**
 * P12 — SHADOW / OLD-NEW COMPARISON (GIEO-SYSTEM-REBUILD-PLAN.md §16).
 *
 * Trong suốt giai đoạn này:
 *
 *     HỆ CŨ = SOLE WRITER.   Hệ mới chỉ READ · SIMULATE · COMPARE.
 *
 * Module này KHÔNG có đường ghi nào, và nó từ chối chạy nếu runtime đang ở mode
 * WRITE — không phải vì lịch sự, mà vì "chạy shadow trên một runtime ghi thật"
 * chính là cách người ta vô tình ghi đúp trong lúc tưởng đang so sánh.
 *
 * Hai thứ dễ bị làm sai và được cài cứng ở đây:
 *
 *   1. Ô chưa chạy KHÔNG phải ô đạt. Cổng P12 mặc định ĐÓNG: thiếu một ô trong
 *      ma trận (domain × scenario) là FAIL, không phải "chắc là giống nhau".
 *   2. "Đã giải thích" phải có lý do được VIẾT RA và có người đứng tên. Lệch có
 *      nhãn `EXPLAINED` mà lý do rỗng vẫn tính là chưa giải thích — cùng nguyên
 *      tắc với invariant C4 của correction.
 */
GIEO.define('bootstrap/shadow-compare', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  /* Ma trận so sánh — đúng danh sách §16. */
  var DOMAINS = [
    'SALE', 'FIFO', 'STOCK', 'COGS', 'WASTE', 'BTP',
    'RECEIVING', 'STOCK_COUNT', 'REVERSAL', 'SNAPSHOT', 'REPORT'
  ];

  /* Lớp kịch bản bắt buộc — §16. Đây là nơi lớp bug của legacy sống: gần như
     mọi bug đã audit đều rơi vào concurrent / retry / double-submit / lost ACK
     / partial failure, chứ không phải đường chạy thuận. */
  var SCENARIOS = [
    'normal', 'concurrent', 'retry', 'double-submit', 'lost-ack',
    'partial-failure', 'reversal', 'correction', 'recompute',
    'compact', 'historical-read'
  ];

  var SEVERITY = { NONE: 'NONE', IMMATERIAL: 'IMMATERIAL', MATERIAL: 'MATERIAL' };
  var STATUS = { MATCH: 'MATCH', EXPLAINED: 'EXPLAINED', UNEXPLAINED: 'UNEXPLAINED' };

  function isDomain(d) { return DOMAINS.indexOf(d) !== -1; }
  function isScenario(s) { return SCENARIOS.indexOf(s) !== -1; }
  function cellKey(domain, scenario) { return domain + '|' + scenario; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /**
   * So từng trường một, trả về danh sách lệch. Cố ý KHÔNG so sâu cả object:
   * so sâu sẽ báo lệch ở những trường mà hệ mới có thêm (versionId, operationId,
   * actorId...) — những trường đó tồn tại chính vì legacy thiếu chúng.
   *
   * @param spec.fields  [{name, tolerance}] — trường nào được so và sai số cho phép
   */
  function diffFields(oldResult, newResult, fields) {
    var diffs = [];
    fields.forEach(function (f) {
      var o = oldResult ? oldResult[f.name] : undefined;
      var n = newResult ? newResult[f.name] : undefined;

      if (o === undefined && n === undefined) {
        /* Cả hai đều không có trường này = không so được, KHÔNG phải khớp. */
        diffs.push({ field: f.name, old: null, new: null, delta: null, kind: 'MISSING_BOTH' });
        return;
      }
      if (isNum(o) && isNum(n)) {
        var delta = n - o;
        var tol = isNum(f.tolerance) ? f.tolerance : 0;
        if (Math.abs(delta) > tol) {
          diffs.push({ field: f.name, old: o, new: n, delta: delta, kind: 'NUMERIC' });
        }
        return;
      }
      if (o !== n) {
        diffs.push({ field: f.name, old: o === undefined ? null : o, new: n === undefined ? null : n, delta: null, kind: 'VALUE' });
      }
    });
    return diffs;
  }

  /**
   * Mức nặng. Trường được khai `material: true` (tiền, số lượng, tồn) lệch quá
   * dung sai thì là MATERIAL — thứ chặn cổng P12. Lệch ở trường mô tả thì
   * IMMATERIAL: vẫn ghi lại, nhưng không chặn.
   */
  function severityOf(diffs, fields) {
    if (!diffs.length) return SEVERITY.NONE;
    var materialNames = Object.create(null);
    fields.forEach(function (f) { if (f.material) materialNames[f.name] = true; });
    var hasMaterial = diffs.some(function (d) {
      /* Thiếu trường ở cả hai bên luôn là MATERIAL: không so được nghĩa là
         không biết, và "không biết" không được đi qua cổng. */
      return d.kind === 'MISSING_BOTH' || materialNames[d.field];
    });
    return hasMaterial ? SEVERITY.MATERIAL : SEVERITY.IMMATERIAL;
  }

  /**
   * @param spec.domain, spec.scenario
   * @param spec.oldResult  kết quả đọc từ hệ cũ
   * @param spec.newResult  kết quả SIMULATE của hệ mới (pipeline.run, không commit)
   * @param spec.fields     [{name, material, tolerance}]
   * @param spec.explanation {cause, actorId} — chỉ dùng khi đã điều tra xong
   */
  function compare(spec) {
    if (!spec || !isDomain(spec.domain)) {
      return R.err('VALIDATION', 'domain không nằm trong ma trận §16: ' + (spec && spec.domain));
    }
    if (!isScenario(spec.scenario)) {
      return R.err('VALIDATION', 'lớp kịch bản không hợp lệ: ' + spec.scenario);
    }
    if (!Array.isArray(spec.fields) || !spec.fields.length) {
      return R.err('VALIDATION',
        'compare phải khai rõ trường nào được so — so mặc định "cả object" sẽ báo lệch ở ' +
        'chính những trường hệ mới thêm vào vì legacy thiếu');
    }

    var diffs = diffFields(spec.oldResult, spec.newResult, spec.fields);
    var severity = severityOf(diffs, spec.fields);

    var status;
    if (!diffs.length) status = STATUS.MATCH;
    else {
      var ex = spec.explanation;
      var explained = !!(ex && typeof ex.cause === 'string' && ex.cause.trim() && ex.actorId);
      /* Nhãn "đã giải thích" không tự có giá trị — phải có lý do viết ra và
         người đứng tên, đúng nguyên tắc C4. */
      status = explained ? STATUS.EXPLAINED : STATUS.UNEXPLAINED;
    }

    return R.ok({
      cell: cellKey(spec.domain, spec.scenario),
      domain: spec.domain,
      scenario: spec.scenario,
      diffs: diffs,
      severity: severity,
      status: status,
      cause: status === STATUS.EXPLAINED ? spec.explanation.cause : null,
      explainedBy: status === STATUS.EXPLAINED ? spec.explanation.actorId : null,
      comparedAt: spec.at || null
    });
  }

  /**
   * Sổ ghi kết quả shadow + cổng P12.
   *
   * @param spec.runtimeMode  mode của runtime đang chạy shadow
   */
  function createRun(spec) {
    spec = spec || {};
    if (spec.runtimeMode === 'WRITE') {
      /* Chặn ngay lúc dựng, không phải lúc chạy: một run shadow trỏ vào runtime
         ghi thật là cách ghi đúp trong khi tưởng đang so sánh. */
      throw new Error('[shadow-compare] KHÔNG chạy shadow trên runtime WRITE — ' +
        'P12 quy định hệ cũ là sole writer');
    }

    var results = [];
    var byCell = Object.create(null);

    function record(spec2) {
      var out = compare(spec2);
      if (R.isErr(out)) return out;
      results.push(out.value);
      /* Một ô chạy nhiều lần thì giữ kết quả XẤU NHẤT, không phải lần cuối:
         chạy lại tới khi may mắn khớp là cách lỗi lọt qua cổng. */
      var prev = byCell[out.value.cell];
      if (!prev || rankOf(out.value) > rankOf(prev)) byCell[out.value.cell] = out.value;
      return out;
    }

    function rankOf(r) {
      if (r.status === STATUS.UNEXPLAINED) return r.severity === SEVERITY.MATERIAL ? 4 : 3;
      if (r.status === STATUS.EXPLAINED) return r.severity === SEVERITY.MATERIAL ? 2 : 1;
      return 0;
    }

    /** Ô nào trong ma trận chưa từng chạy. */
    function missingCells() {
      var missing = [];
      DOMAINS.forEach(function (d) {
        SCENARIOS.forEach(function (s) {
          if (!byCell[cellKey(d, s)]) missing.push({ domain: d, scenario: s });
        });
      });
      return missing;
    }

    function unexplainedMaterial() {
      return Object.keys(byCell).map(function (k) { return byCell[k]; })
        .filter(function (r) {
          return r.status === STATUS.UNEXPLAINED && r.severity === SEVERITY.MATERIAL;
        });
    }

    /**
     * Cổng P12. MẶC ĐỊNH ĐÓNG.
     *
     * "Không còn unexplained material difference" chỉ có nghĩa khi ma trận đã
     * được chạy đủ — nếu không, câu đó đúng một cách rỗng tuếch với một sổ trắng.
     */
    function gate() {
      var missing = missingCells();
      var bad = unexplainedMaterial();
      var blockers = [];
      if (missing.length) {
        blockers.push({
          code: 'MATRIX_INCOMPLETE',
          detail: missing.length + '/' + (DOMAINS.length * SCENARIOS.length) + ' ô chưa chạy',
          cells: missing
        });
      }
      if (bad.length) {
        blockers.push({
          code: 'UNEXPLAINED_MATERIAL_DIFF',
          detail: bad.length + ' ô còn lệch vật chất chưa giải thích',
          cells: bad.map(function (r) { return r.cell; })
        });
      }
      return blockers.length
        ? R.err('PRECONDITION', 'P12 CHƯA ĐẠT', { blockers: blockers })
        : R.ok({
            passed: true,
            cellsRun: Object.keys(byCell).length,
            comparisons: results.length,
            explained: Object.keys(byCell).filter(function (k) {
              return byCell[k].status === STATUS.EXPLAINED;
            }).length
          });
    }

    function coverage() {
      var total = DOMAINS.length * SCENARIOS.length;
      var run = Object.keys(byCell).length;
      return {
        total: total, run: run, missing: total - run,
        pct: total === 0 ? 0 : (run / total) * 100,
        byDomain: DOMAINS.reduce(function (acc, d) {
          acc[d] = SCENARIOS.filter(function (s) { return !!byCell[cellKey(d, s)]; }).length;
          return acc;
        }, {})
      };
    }

    return {
      record: record,
      results: function () { return results.slice(); },
      cell: function (d, s) { return byCell[cellKey(d, s)] || null; },
      missingCells: missingCells,
      unexplainedMaterial: unexplainedMaterial,
      coverage: coverage,
      gate: gate
    };
  }

  return {
    DOMAINS: DOMAINS,
    SCENARIOS: SCENARIOS,
    SEVERITY: SEVERITY,
    STATUS: STATUS,
    compare: compare,
    createRun: createRun
  };
});
