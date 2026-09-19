/** Archive bill: copy đủ chi tiết trước, xác nhận đích, rồi mới cho xoá nguồn. */
GIEO.define('compaction/archive', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var STATUS = {
    PENDING: 'PENDING',
    FAILED: 'FAILED',
    DESTINATION_WRITTEN: 'DESTINATION_WRITTEN',
    COMPLETED: 'COMPLETED'
  };

  function parts(dateKey) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
    return m ? { year: m[1], month: m[2], day: m[3] } : null;
  }
  function archiveKey(dateKey) {
    var p = parts(dateKey);
    return p ? p.month + '_' + p.day + '_' + p.year : null;
  }
  function operationIdFor(dateKey, stage) {
    return ids.deterministicId('operation', ['archive-bills', dateKey, stage]);
  }

  function createRegistry(seed) {
    var rows = Object.create(null);
    (seed || []).forEach(function (r) { rows[r.businessDate] = Object.freeze(Object.assign({}, r)); });

    function put(record) {
      rows[record.businessDate] = Object.freeze(Object.assign({}, record));
      return R.ok(rows[record.businessDate]);
    }
    return {
      register: function (businessDate, at) {
        if (!parts(businessDate)) return R.err('VALIDATION', 'businessDate phải dạng YYYY-MM-DD');
        if (rows[businessDate]) return R.ok(rows[businessDate]);
        return put({
          businessDate: businessDate, archiveKey: archiveKey(businessDate),
          status: STATUS.PENDING, attempts: 0, lastError: null,
          destinationRef: null, updatedAt: at || null
        });
      },
      markFailed: function (businessDate, error, at) {
        var current = rows[businessDate];
        if (!current) return R.err('NOT_FOUND', 'ngày chưa đăng ký archive');
        return put(Object.assign({}, current, {
          status: STATUS.FAILED, attempts: current.attempts + 1,
          lastError: String(error || 'unknown'), updatedAt: at || null
        }));
      },
      markDestinationWritten: function (businessDate, destinationRef, at) {
        var current = rows[businessDate];
        if (!current) return R.err('NOT_FOUND', 'ngày chưa đăng ký archive');
        if (!destinationRef) return R.err('VALIDATION', 'cần destinationRef chứng minh đã ghi đích');
        return put(Object.assign({}, current, {
          status: STATUS.DESTINATION_WRITTEN, attempts: current.attempts + 1,
          lastError: null, destinationRef: destinationRef, updatedAt: at || null
        }));
      },
      markCompleted: function (businessDate, at) {
        var current = rows[businessDate];
        if (!current || current.status !== STATUS.DESTINATION_WRITTEN) {
          return R.err('PRECONDITION', 'chưa có bằng chứng ghi archive đích');
        }
        return put(Object.assign({}, current, { status: STATUS.COMPLETED, updatedAt: at || null }));
      },
      get: function (businessDate) { return rows[businessDate] || null; },
      pending: function () {
        return Object.keys(rows).map(function (k) { return rows[k]; })
          .filter(function (r) { return r.status !== STATUS.COMPLETED; })
          .sort(function (a, b) { return a.businessDate < b.businessDate ? -1 : 1; });
      },
      all: function () { return Object.keys(rows).map(function (k) { return rows[k]; }); }
    };
  }

  function buildWritePlan(spec) {
    spec = spec || {};
    var p = parts(spec.businessDate);
    if (!p) return R.err('VALIDATION', 'archive cần businessDate dạng YYYY-MM-DD');
    if (!spec.orders || typeof spec.orders !== 'object' || Array.isArray(spec.orders)) {
      return R.err('VALIDATION', 'archive cần object orders nguyên bản');
    }
    var key = archiveKey(spec.businessDate);
    return R.ok({
      operationId: operationIdFor(spec.businessDate, 'write'),
      domainRecords: [{
        type: 'billArchive',
        record: {
          archiveKey: key, businessDate: spec.businessDate,
          month: p.month, day: p.day, year: p.year,
          orders: spec.orders, archivedAt: spec.at || null
        }
      }],
      audit: { command: 'ArchiveBillsWrite', actorId: spec.actorId || null, reason: 'archive_before_delete' }
    });
  }

  function buildRemovalPlan(spec) {
    spec = spec || {};
    var record = spec.registry && spec.registry.get(spec.businessDate);
    if (!record || record.status !== STATUS.DESTINATION_WRITTEN || !record.destinationRef) {
      return R.err('PRECONDITION', 'chưa xác nhận ghi archive đích — cấm xoá nguồn');
    }
    if (!(spec.sourceRecords || []).length) return R.err('VALIDATION', 'cần sourceRecords cụ thể');
    return R.ok({
      operationId: operationIdFor(spec.businessDate, 'remove-source'),
      rawRemovals: spec.sourceRecords.map(function (r) { return { kind: r.kind, path: r.path }; }),
      audit: { command: 'ArchiveBillsRemoveSource', actorId: spec.actorId || null, reason: record.destinationRef }
    });
  }

  return {
    STATUS: STATUS,
    archiveKey: archiveKey,
    operationIdFor: operationIdFor,
    createRegistry: createRegistry,
    buildWritePlan: buildWritePlan,
    buildRemovalPlan: buildRemovalPlan
  };
});
