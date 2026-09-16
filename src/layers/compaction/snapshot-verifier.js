/** RAW → rebuild → compare → PASS mới được compact (§4, invariant C5). */
GIEO.define('compaction/snapshot-verifier', [
  'shared-kernel/result',
  'fifo-core/ledger',
  'fifo-core/reconciliation',
  'fifo-core/projection',
  'compaction/unit-snapshot'
], function (R, ledgerLib, reconciliation, projection, unitSnapshot) {
  'use strict';

  function sorted(list) { return (list || []).slice().sort(); }
  function sameList(a, b) { return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b)); }
  function canonical(v) {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = canonical(v[k]); });
      return out;
    }
    return v;
  }
  function sameValue(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function sum(list, fn) {
    return (list || []).reduce(function (total, row) { return total + (fn(row) || 0); }, 0);
  }

  function verify(input) {
    input = input || {};
    var snapshot = input.snapshot;
    var unit = input.unit;
    if (!snapshot || !unit) return R.err('VALIDATION', 'verifier cần snapshot và raw unit');
    if (snapshot.unitId !== unit.unitId) return R.err('VALIDATION', 'snapshot và raw unit khác identity');
    if (!input.projectionInput || typeof input.observedCurrentStock !== 'number') {
      return R.err('VALIDATION', 'verifier cần projectionInput và observedCurrentStock');
    }

    var gate = unitSnapshot.assessCompactability(Object.assign({}, input.compactability || {}, { unit: unit }));
    if (R.isErr(gate)) return gate;
    if (!gate.value.compactable) {
      return R.err('PRECONDITION', 'Unit chưa đủ điều kiện verify/compact', gate.value);
    }

    var entries = input.entries || [];
    var allocations = input.allocations || [];
    var cogsLines = input.cogsLines || [];
    var failures = [];
    var missing = unitSnapshot.missingFields(snapshot);
    if (missing.length) failures.push({ check: 'REQUIRED_FIELDS', missing: missing });

    var ledgerAudit = ledgerLib.auditEntries(entries);
    if (R.isErr(ledgerAudit)) failures.push({ check: 'LEDGER_INVARIANTS', detail: ledgerAudit.error });

    var rebuilt = reconciliation.rebuildUnitState(unit, entries);
    if (R.isErr(rebuilt)) return rebuilt;
    if (!rebuilt.value.matches || rebuilt.value.rebuiltRemainingQty !== snapshot.finalRemainingQty) {
      failures.push({
        check: 'REMAINING_QTY',
        expected: snapshot.finalRemainingQty,
        actual: rebuilt.value.rebuiltRemainingQty
      });
    }

    var allocationQty = sum(allocations, function (a) { return a.qty; });
    var frozenAllocationQty = sum(snapshot.consumption, function (a) { return a.qty; });
    if (allocationQty !== frozenAllocationQty) {
      failures.push({ check: 'ALLOCATION_TOTAL', expected: frozenAllocationQty, actual: allocationQty });
    }

    function ledgerTotal(type) {
      return sum(entries.filter(function (e) { return e.type === type; }),
        function (e) { return Math.abs(e.qtyDelta); });
    }
    var waste = ledgerTotal(ledgerLib.TYPE.WASTE);
    if (waste !== snapshot.wasteQty) {
      failures.push({ check: 'WASTE_TOTAL', expected: snapshot.wasteQty, actual: waste });
    }

    var cogs = sum(cogsLines, function (line) { return line.amount; });
    var frozenCogs = sum(snapshot.cogsLines, function (line) { return line.amount; });
    if (cogs !== frozenCogs) failures.push({ check: 'COGS_TOTAL', expected: frozenCogs, actual: cogs });

    var rebuiltSnapshot = unitSnapshot.buildUnitSnapshot({
      unit: unit, entries: entries, allocations: allocations, cogsLines: cogsLines,
      variance: input.variance || null, revisionNo: snapshot.revisionNo,
      supersedesSnapshotId: snapshot.supersedesSnapshotId
    });
    if (R.isErr(rebuiltSnapshot)) return rebuiltSnapshot;
    if (!sameList(snapshot.billIds, rebuiltSnapshot.value.billIds)) failures.push({ check: 'BILL_REFERENCES' });
    if (!sameList(snapshot.prepBatchIds, rebuiltSnapshot.value.prepBatchIds)) failures.push({ check: 'BTP_REFERENCES' });
    if (!sameList(snapshot.recipeVersionIds, rebuiltSnapshot.value.recipeVersionIds)) {
      failures.push({ check: 'RECIPE_VERSION_REFERENCES' });
    }
    if (!sameList(snapshot.ledgerEntryIds, rebuiltSnapshot.value.ledgerEntryIds)) {
      failures.push({ check: 'LEDGER_REFERENCES' });
    }
    if (!sameValue(snapshot.canonical, rebuiltSnapshot.value.canonical)) {
      failures.push({ check: 'CANONICAL_TRACE' });
    }

    var projected = projection.computeCurrentStock(input.projectionInput);
    if (R.isErr(projected)) return projected;
    if (projected.value.currentStock !== input.observedCurrentStock) {
      failures.push({
        check: 'CURRENT_STOCK',
        expected: input.observedCurrentStock,
        actual: projected.value.currentStock
      });
    }

    var passed = failures.length === 0;
    return R.ok({
      passed: passed,
      snapshot: Object.freeze(Object.assign({}, snapshot, {
        verified: passed,
        verifiedAt: typeof input.verifiedAt === 'number' ? input.verifiedAt : null,
        verifiedBy: input.verifiedBy || null,
        verification: Object.freeze({ failures: failures.slice() })
      })),
      failures: failures,
      alert: passed ? null : {
        type: 'SNAPSHOT_VERIFY_FAILED',
        payload: { scope: snapshot.snapshotId, failures: failures }
      }
    });
  }

  return { verify: verify };
});
