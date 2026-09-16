/** Snapshot sổ sách — §3: đóng băng, drift và correction append-only. */
GIEO.define('compaction/book-snapshot', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var STATUS = { OPEN: 'OPEN', CLOSED: 'CLOSED', SUPERSEDED: 'SUPERSEDED' };

  function snapshotIdFor(period, revisionNo) {
    return ids.deterministicId('snapshot', ['book', period, String(revisionNo)]);
  }
  function closeOperationId(period, revisionNo) {
    return ids.deterministicId('operation', ['compact', 'book', period, String(revisionNo)]);
  }
  function isPeriod(p) { return typeof p === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(p); }

  function normalizeValues(values) {
    var out = Object.create(null);
    var invalid = [];
    Object.keys(values).sort().forEach(function (k) {
      if (typeof values[k] !== 'number' || !isFinite(values[k])) invalid.push(k);
      else out[k] = values[k];
    });
    return invalid.length
      ? R.err('VALIDATION', 'values chứa chỉ số không hữu hạn: ' + invalid.join(', '))
      : R.ok(out);
  }

  function createBook() {
    var byPeriod = Object.create(null);
    function revisionsOf(period) { return byPeriod[period] || []; }
    function currentOf(period) {
      var list = revisionsOf(period);
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].status === STATUS.CLOSED) return list[i];
      }
      return null;
    }

    function close(spec) {
      if (!spec || !isPeriod(spec.period)) {
        return R.err('VALIDATION', 'close cần period dạng YYYY-MM hoặc YYYY-MM-DD');
      }
      if (!spec.values || typeof spec.values !== 'object') return R.err('VALIDATION', 'close cần values');
      if (!ids.isId(spec.closedBy, 'actor')) {
        return R.err('VALIDATION', 'close cần closedBy hợp lệ — không có ai chốt thì không phải chốt sổ');
      }
      if (typeof spec.closedAt !== 'number') return R.err('VALIDATION', 'close cần closedAt');
      var existing = currentOf(spec.period);
      if (existing) {
        return R.err('CONFLICT',
          'kỳ ' + spec.period + ' đã chốt ở revision ' + existing.revisionNo +
          ' — muốn đổi số phải dùng correct() (§3.3), không chốt đè',
          { snapshotId: existing.snapshotId });
      }
      var normalized = normalizeValues(spec.values);
      if (R.isErr(normalized)) return normalized;
      var snap = Object.freeze({
        snapshotId: snapshotIdFor(spec.period, 1),
        operationId: closeOperationId(spec.period, 1),
        period: spec.period, revisionNo: 1, supersedesSnapshotId: null,
        status: STATUS.CLOSED,
        values: Object.freeze(normalized.value),
        sourceRefs: Object.freeze((spec.sourceRefs || []).slice()),
        closedBy: spec.closedBy, closedAt: spec.closedAt, correction: null
      });
      byPeriod[spec.period] = revisionsOf(spec.period).concat([snap]);
      return R.ok(snap);
    }

    function read(period, recompute) {
      var snap = currentOf(period);
      if (snap) {
        return R.ok({
          source: 'FROZEN', period: period, values: snap.values,
          snapshotId: snap.snapshotId, revisionNo: snap.revisionNo
        });
      }
      if (typeof recompute !== 'function') {
        return R.err('NOT_FOUND', 'kỳ ' + period + ' chưa chốt và không có hàm tính lại');
      }
      var live = recompute(period);
      if (R.isErr(live)) return live;
      return R.ok({ source: 'LIVE', period: period, values: live.value, snapshotId: null, revisionNo: null });
    }

    function detectDrift(period, recompute) {
      var snap = currentOf(period);
      if (!snap) return R.err('NOT_FOUND', 'kỳ ' + period + ' chưa chốt, không có gì để trôi');
      if (typeof recompute !== 'function') return R.err('VALIDATION', 'detectDrift cần hàm tính lại');
      var live = recompute(period);
      if (R.isErr(live)) return live;
      var normalized = normalizeValues(live.value);
      if (R.isErr(normalized)) return normalized;
      var liveValues = normalized.value;
      var diffs = [];
      var keys = Object.keys(snap.values).concat(Object.keys(liveValues));
      var seen = Object.create(null);
      keys.forEach(function (k) {
        if (seen[k]) return;
        seen[k] = true;
        var frozen = snap.values[k], current = liveValues[k];
        if (frozen !== current) {
          diffs.push({
            key: k,
            frozen: typeof frozen === 'number' ? frozen : null,
            live: typeof current === 'number' ? current : null
          });
        }
      });
      return R.ok({
        period: period, snapshotId: snap.snapshotId,
        drifted: diffs.length > 0, diffs: diffs,
        alert: diffs.length ? {
          type: 'DRIFT_AFTER_CLOSING',
          payload: { period: period, frozen: snap.values, live: liveValues, diffs: diffs }
        } : null
      });
    }

    function correct(spec) {
      if (!spec || !isPeriod(spec.period)) return R.err('VALIDATION', 'correct cần period hợp lệ');
      var prev = currentOf(spec.period);
      if (!prev) return R.err('NOT_FOUND', 'kỳ ' + spec.period + ' chưa chốt — không có gì để sửa');
      var missing = ['reason', 'actorId', 'scopeAffected'].filter(function (f) {
        var v = spec[f];
        if (Array.isArray(v)) return v.length === 0;
        return !v || (typeof v === 'string' && !v.trim());
      });
      if (typeof spec.at !== 'number') missing.push('at');
      if (spec.actorId && !ids.isId(spec.actorId, 'actor')) missing.push('actorId hợp lệ');
      if (missing.length) {
        return R.err('VALIDATION',
          'correction bị từ chối — audit thiếu: ' + missing.join(', ') + ' (invariant C4)');
      }
      if (!spec.values || typeof spec.values !== 'object') return R.err('VALIDATION', 'correct cần values mới');
      var normalized = normalizeValues(spec.values);
      if (R.isErr(normalized)) return normalized;
      var revisionNo = prev.revisionNo + 1;
      var nextId = snapshotIdFor(spec.period, revisionNo);
      var next = Object.freeze({
        snapshotId: nextId,
        operationId: closeOperationId(spec.period, revisionNo),
        period: spec.period, revisionNo: revisionNo,
        supersedesSnapshotId: prev.snapshotId, status: STATUS.CLOSED,
        values: Object.freeze(normalized.value),
        sourceRefs: Object.freeze((spec.sourceRefs || prev.sourceRefs).slice()),
        closedBy: spec.actorId, closedAt: spec.at,
        correction: Object.freeze({
          actorId: spec.actorId, at: spec.at, reason: spec.reason,
          scopeAffected: Object.freeze([].concat(spec.scopeAffected)),
          beforeVersionId: prev.snapshotId, afterVersionId: nextId
        })
      });
      var list = revisionsOf(spec.period).map(function (s) {
        return s.snapshotId === prev.snapshotId
          ? Object.freeze(Object.assign({}, s, { status: STATUS.SUPERSEDED }))
          : s;
      });
      byPeriod[spec.period] = list.concat([next]);
      return R.ok({
        current: next,
        superseded: byPeriod[spec.period].filter(function (s) { return s.snapshotId === prev.snapshotId; })[0]
      });
    }

    function getRevision(period, revisionNo) {
      var found = revisionsOf(period).filter(function (s) { return s.revisionNo === revisionNo; })[0];
      return found ? R.ok(found) : R.err('NOT_FOUND', 'không có revision ' + revisionNo + ' của kỳ ' + period);
    }
    function history(period) { return revisionsOf(period).slice(); }
    function hydrate(snapshots) {
      (snapshots || []).forEach(function (s) {
        byPeriod[s.period] = revisionsOf(s.period).concat([Object.freeze(s)]);
      });
      Object.keys(byPeriod).forEach(function (p) {
        byPeriod[p] = byPeriod[p].slice().sort(function (a, b) { return a.revisionNo - b.revisionNo; });
      });
      return R.ok(true);
    }

    return {
      close: close, read: read, detectDrift: detectDrift, correct: correct,
      getRevision: getRevision, history: history,
      current: function (period) { return currentOf(period); }, hydrate: hydrate
    };
  }

  return {
    STATUS: STATUS,
    snapshotIdFor: snapshotIdFor,
    closeOperationId: closeOperationId,
    createBook: createBook
  };
});
