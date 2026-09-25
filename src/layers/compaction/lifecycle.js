/** Trạng thái P6: LIVE → CLOSED → SNAPSHOT_READY → COMPACTED → ARCHIVED/PURGED_RAW. */
GIEO.define('compaction/lifecycle', ['shared-kernel/result'], function (R) {
  'use strict';
  var STATE = {
    LIVE: 'LIVE', CLOSED: 'CLOSED', SNAPSHOT_READY: 'SNAPSHOT_READY',
    COMPACTED: 'COMPACTED', ARCHIVED: 'ARCHIVED', PURGED_RAW: 'PURGED_RAW'
  };
  var NEXT = {
    LIVE: ['CLOSED'],
    CLOSED: ['SNAPSHOT_READY'],
    SNAPSHOT_READY: ['COMPACTED'],
    COMPACTED: ['ARCHIVED', 'PURGED_RAW'],
    ARCHIVED: ['PURGED_RAW'],
    PURGED_RAW: []
  };

  function start(scopeType, scopeId) {
    if (!scopeType || !scopeId) return R.err('VALIDATION', 'lifecycle cần scopeType/scopeId');
    return R.ok({ scopeType: scopeType, scopeId: scopeId, state: STATE.LIVE, history: [] });
  }
  function transition(record, to, spec) {
    spec = spec || {};
    if (!record || !NEXT[record.state] || NEXT[record.state].indexOf(to) === -1) {
      return R.err('PRECONDITION', 'không chuyển compaction từ ' + (record && record.state) + ' sang ' + to);
    }
    if (to === STATE.SNAPSHOT_READY && !spec.snapshotId) {
      return R.err('VALIDATION', 'SNAPSHOT_READY cần snapshotId');
    }
    if (to === STATE.COMPACTED && (!spec.snapshot || spec.snapshot.verified !== true)) {
      return R.err('PRECONDITION', 'chỉ snapshot verified PASS mới được COMPACTED');
    }
    if ((to === STATE.ARCHIVED || to === STATE.PURGED_RAW) && spec.systemControlled !== true) {
      return R.err('FORBIDDEN', to + ' chỉ do system-controlled process chạy');
    }
    return R.ok(Object.assign({}, record, {
      state: to,
      snapshotId: spec.snapshotId || (spec.snapshot && spec.snapshot.snapshotId) || record.snapshotId || null,
      history: record.history.concat([{
        from: record.state, to: to, at: spec.at || null,
        operationId: spec.operationId || null
      }])
    }));
  }

  return { STATE: STATE, start: start, transition: transition };
});
