/**
 * Snapshot Unit — §2 của FIFO-COMPACTION-CONTRACT-V1.md.
 * Tách cổng compactability khỏi bước dựng snapshot; tuổi không cấp quyền dọn.
 */
GIEO.define('compaction/unit-snapshot', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'fifo-core/unit',
  'fifo-core/ledger',
  'traceability/trace'
], function (ids, R, unitLib, ledgerLib, traceLib) {
  'use strict';

  var S = unitLib.STATUS;
  var TERMINAL = [S.PHYSICALLY_FINISHED, S.LOST, S.COMPACTABLE];

  function assessCompactability(input) {
    if (!input || !input.unit) return R.err('VALIDATION', 'assessCompactability cần unit');
    var u = input.unit;
    var blockers = [];

    if (!Array.isArray(input.pendingOperations) || !Array.isArray(input.approvals) ||
        !Array.isArray(input.activeDependencies)) {
      blockers.push({
        code: 'COMPACTABILITY_INPUT_INCOMPLETE',
        detail: 'phải nạp pendingOperations, approvals và activeDependencies kể cả khi rỗng'
      });
    }

    if (TERMINAL.indexOf(u.status) === -1) {
      blockers.push({ code: 'NOT_TERMINAL', detail: 'status=' + u.status });
    }
    if (u.status === S.LOST) {
      var approved = (input.approvals || []).some(function (a) {
        return a.unitId === u.unitId && a.type === 'ApproveLostContainer' && a.status === 'COMPLETED';
      });
      if (!approved) blockers.push({ code: 'LOST_NOT_APPROVED', detail: u.lostReportId || null });
    }

    var pending = (input.pendingOperations || []).filter(function (o) {
      return !o.unitIds || o.unitIds.indexOf(u.unitId) !== -1;
    });
    if (pending.length) {
      blockers.push({
        code: 'OPERATION_UNRESOLVED',
        detail: pending.map(function (o) { return o.operationId; })
      });
    }

    var unresolvedApprovals = (input.approvals || []).filter(function (a) {
      return a.unitId === u.unitId && a.status !== 'COMPLETED' && a.status !== 'REJECTED';
    });
    if (unresolvedApprovals.length) {
      blockers.push({
        code: 'APPROVAL_UNRESOLVED',
        detail: unresolvedApprovals.map(function (a) { return a.type; })
      });
    }

    var active = input.activeDependencies || [];
    if (active.length) blockers.push({ code: 'TRACE_DEPENDENCY_ACTIVE', detail: active.length });

    var debtQty = u.debt && (u.debt.amount || u.debt.qty) ? (u.debt.amount || u.debt.qty) : 0;
    var absorbed = input.debtAbsorbedBy || (u.debt && u.debt.absorbedByUnitId);
    if (debtQty > 0 && !absorbed) blockers.push({ code: 'DEBT_UNABSORBED', detail: debtQty });

    return R.ok({ unitId: u.unitId, compactable: blockers.length === 0, blockers: blockers });
  }

  function sumBy(list, fn) {
    return list.reduce(function (acc, x) { return acc + (fn(x) || 0); }, 0);
  }

  function uniq(list) {
    var seen = Object.create(null), out = [];
    list.forEach(function (x) {
      if (x === null || x === undefined || seen[x]) return;
      seen[x] = true;
      out.push(x);
    });
    return out;
  }

  function buildUnitSnapshot(input) {
    if (!input || !input.unit) return R.err('VALIDATION', 'buildUnitSnapshot cần unit');
    var u = input.unit;
    var entries = input.entries || [];
    var allocations = input.allocations || [];
    var cogsLines = input.cogsLines || [];

    var foreign = entries.filter(function (e) { return e.unitId !== u.unitId; });
    if (foreign.length) {
      return R.err('VALIDATION',
        'entries chứa ' + foreign.length + ' bút toán của unit khác — snapshot sẽ sai',
        { unitId: u.unitId });
    }

    var revisionNo = input.revisionNo || 1;
    if (revisionNo > 1 && !input.supersedesSnapshotId) {
      return R.err('VALIDATION', 'revision > 1 phải trỏ supersedesSnapshotId');
    }
    var snapshotId = ids.deterministicId('snapshot', ['unit', u.unitId, String(revisionNo)]);
    var billIds = uniq(allocations
      .filter(function (a) { return a.domain === 'sale' || a.targetType === 'bill'; })
      .map(function (a) { return a.targetRef; })
      .concat(cogsLines.map(function (c) { return c.billId; })));
    var prepBatchIds = uniq(allocations
      .filter(function (a) { return a.domain === 'prep' || a.targetType === 'prepBatch'; })
      .map(function (a) { return a.targetRef; }));
    var recipeVersionIds = uniq(cogsLines.map(function (c) { return c.recipeVersionId; }));
    var traceAllocations = allocations.map(function (a) {
      var recipeIds = a.recipeVersionIds || uniq(cogsLines.filter(function (c) {
        return c.billId && c.billId === (a.billId || (a.targetType === 'bill' ? a.targetRef : null));
      }).map(function (c) { return c.recipeVersionId; }));
      return Object.assign({}, a, {
        billId: a.billId || (a.targetType === 'bill' ? a.targetRef : null),
        prepBatchId: a.prepBatchId || (a.targetType === 'prepBatch' ? a.targetRef : null),
        recipeVersionIds: recipeIds
      });
    });
    var canonical = traceLib.buildUnitTrace({
      unit: u, ledgerEntries: entries, allocations: traceAllocations
    });
    if (R.isErr(canonical)) return canonical;

    function totalOf(type) {
      return sumBy(entries.filter(function (e) { return e.type === type; }),
        function (e) { return Math.abs(e.qtyDelta); });
    }

    return R.ok(Object.freeze({
      snapshotId: snapshotId,
      revisionNo: revisionNo,
      supersedesSnapshotId: input.supersedesSnapshotId || null,
      unitId: u.unitId, itemId: u.itemId, storeId: u.storeId, itemKind: u.itemKind,
      receiptId: u.receiptId, supplierId: u.supplierId,
      receivedAt: u.receivedAt, receivedBy: u.receivedBy,
      initialQty: u.initialQty, finalRemainingQty: u.remainingQty, costBasis: u.costBasis,
      openedAt: u.openedAt, openedBy: u.openedBy,
      consumption: allocations.map(function (a) {
        return {
          operationId: a.operationId, qty: a.qty, domain: a.domain,
          targetRef: a.targetRef, unitCost: typeof a.unitCost === 'number' ? a.unitCost : null,
          cost: typeof a.cost === 'number' ? a.cost : null
        };
      }),
      billIds: billIds,
      prepBatchIds: prepBatchIds,
      recipeVersionIds: recipeVersionIds,
      cogsLines: cogsLines.map(function (c) {
        return {
          amount: c.amount,
          costBasisVersionId: c.costBasisVersionId || null,
          recipeVersionId: c.recipeVersionId || null,
          billId: c.billId || null
        };
      }),
      wasteQty: totalOf(ledgerLib.TYPE.WASTE),
      lostQty: totalOf(ledgerLib.TYPE.LOST),
      adjustmentQty: sumBy(entries.filter(function (e) {
        return e.type === ledgerLib.TYPE.ADJUSTMENT;
      }), function (e) { return e.qtyDelta; }),
      reversalQty: totalOf(ledgerLib.TYPE.REVERSAL),
      systemExhaustedAt: u.systemExhaustedAt,
      finishedAt: u.finishedAt, finishedBy: u.finishedBy, finishReason: u.finishReason,
      needsReview: !!u.needsReview,
      needsReviewReasons: (u.needsReviewReasons || []).slice(),
      variance: input.variance || null,
      ledgerEntryIds: entries.map(function (e) { return e.entryId; }),
      canonical: canonical.value,
      builtAt: input.builtAt || null,
      builtBy: input.builtBy || null
    }));
  }

  var REQUIRED_FIELDS = [
    'unitId', 'itemId', 'storeId', 'itemKind',
    'receiptId', 'receivedAt', 'initialQty', 'costBasis',
    'openedAt', 'consumption', 'billIds', 'prepBatchIds',
    'recipeVersionIds', 'cogsLines', 'wasteQty', 'lostQty',
    'adjustmentQty', 'reversalQty', 'systemExhaustedAt',
    'finishedAt', 'needsReview', 'needsReviewReasons',
    'variance', 'revisionNo', 'canonical'
  ];

  function missingFields(snapshot) {
    if (!snapshot) return REQUIRED_FIELDS.slice();
    return REQUIRED_FIELDS.filter(function (f) {
      return !Object.prototype.hasOwnProperty.call(snapshot, f);
    });
  }

  return {
    TERMINAL_STATUSES: TERMINAL.slice(),
    REQUIRED_FIELDS: REQUIRED_FIELDS,
    assessCompactability: assessCompactability,
    buildUnitSnapshot: buildUnitSnapshot,
    missingFields: missingFields
  };
});
