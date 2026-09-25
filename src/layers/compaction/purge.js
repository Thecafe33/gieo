/** Safety gate cho purge. Tuổi chỉ chọn ứng viên, không cấp quyền xoá. */
GIEO.define('compaction/purge', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  function operationIdFor(sourceType, sourceId, snapshotId) {
    return ids.deterministicId('operation', ['purge', sourceType, sourceId, snapshotId]);
  }

  function check(spec) {
    spec = spec || {};
    var blockers = [];
    if (spec.systemControlled !== true) blockers.push('purge chỉ được chạy bởi system-controlled process');
    if (!spec.snapshot || spec.snapshot.verified !== true) blockers.push('snapshot chưa verified PASS');
    if ((spec.unresolvedCorrections || []).length) blockers.push('còn correction chưa resolved');
    if ((spec.unresolvedReferences || []).length) blockers.push('còn reference chưa resolved');
    if (spec.dependencyRegistry && spec.sourceType && spec.sourceId) {
      var dep = spec.dependencyRegistry.canPurge(spec.sourceType, spec.sourceId);
      if (R.isErr(dep)) blockers.push(dep.error.message);
    } else {
      blockers.push('thiếu TRACE_DEPENDENCY registry để chứng minh an toàn');
    }

    return R.ok({ allowed: blockers.length === 0, blockers: blockers });
  }

  function buildPlan(spec) {
    var c = check(spec);
    if (R.isErr(c)) return c;
    if (!c.value.allowed) return R.err('PRECONDITION', 'không được purge: ' + c.value.blockers.join('; '), c.value);
    if (!spec.sourceType || !spec.sourceId) return R.err('VALIDATION', 'purge cần sourceType/sourceId');
    if (!(spec.rawRecords || []).length) return R.err('VALIDATION', 'purge cần rawRecords cụ thể');
    var operationId = operationIdFor(spec.sourceType, spec.sourceId, spec.snapshot.snapshotId);
    if (spec.operationId && spec.operationId !== operationId) {
      return R.err('VALIDATION', 'operationId purge không đúng id xác định');
    }
    if ((spec.rawRecords || []).some(function (r) { return /(^|\/)snapshots\//.test(r.path || ''); })) {
      return R.err('FORBIDDEN', 'purge raw không bao giờ được xoá snapshot/revision (invariant C3)');
    }
    return R.ok({
      operationId: operationId,
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      snapshotId: spec.snapshot.snapshotId,
      rawRemovals: (spec.rawRecords || []).map(function (r) { return { kind: r.kind, path: r.path }; }),
      audit: { command: 'PurgeRaw', reason: spec.reason || 'verified_compaction', actorId: spec.actorId || null }
    });
  }

  /** §5.4: cleanup handshake ngân hàng không bao giờ chỉ dựa vào tuổi. */
  function canDeleteBankConfirmation(spec) {
    spec = spec || {};
    if (spec.systemControlled !== true) {
      return R.err('FORBIDDEN', 'cleanup bank confirmation chỉ do system-controlled process chạy');
    }
    if (!spec.bankOrderId) return R.err('VALIDATION', 'cần bankOrderId');
    if (spec.billExists === true) return R.ok({ allowed: true, reason: 'BILL_EXISTS' });
    if (spec.longExpired !== true) {
      return R.ok({ allowed: false, reason: 'NO_BILL_AND_NOT_LONG_EXPIRED' });
    }
    if (!spec.dependencyRegistry) {
      return R.err('PRECONDITION', 'thiếu dependency registry — tuổi không đủ để xoá');
    }
    var safe = spec.dependencyRegistry.canPurge('bankConfirmation', spec.bankOrderId);
    return R.isErr(safe)
      ? R.ok({ allowed: false, reason: 'ACTIVE_DEPENDENCY', detail: safe.error })
      : R.ok({ allowed: true, reason: 'LONG_EXPIRED_AND_NO_REFERENCE' });
  }

  return {
    operationIdFor: operationIdFor,
    check: check,
    buildPlan: buildPlan,
    canDeleteBankConfirmation: canDeleteBankConfirmation
  };
});
