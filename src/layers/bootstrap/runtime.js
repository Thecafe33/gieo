/** Composition root duy nhất cho apps: query qua read-layer, mutation qua commands. */
GIEO.define('bootstrap/runtime', [
  'shared-kernel/result',
  'commands/pipeline',
  'commands/sales',
  'commands/inventory',
  'commands/prep',
  'commands/reversal',
  'commands/approval',
  'commands/shift',
  'read-layer/gateway'
], function (R, pipeline, sales, inventory, prep, reversal, approval, shift, reads) {
  'use strict';

  var MODE = { READ_ONLY: 'READ_ONLY', SHADOW: 'SHADOW', WRITE: 'WRITE' };
  var COMMANDS = {
    RecordSale: sales.RecordSale,
    RecordAddon: sales.RecordAddon,
    RecordWaste: inventory.RecordWaste,
    AdjustInventory: inventory.AdjustInventory,
    ReportLostContainer: inventory.ReportLostContainer,
    RestoreFoundContainer: inventory.RestoreFoundContainer,
    RecordPrepProduction: prep.RecordPrepProduction,
    EditPrepYield: prep.EditPrepYield,
    ReverseTransaction: reversal.ReverseTransaction,
    ReviseState: reversal.ReviseState,
    CorrectLedgerEntry: reversal.CorrectLedgerEntry,
    ApproveLostContainer: approval.ApproveLostContainer,
    ApproveStockCount: approval.ApproveStockCount,
    ApproveExpense: approval.ApproveExpense,
    CloseCashSegment: shift.CloseCashSegment
  };
  var QUERIES = {
    GetMenu: reads.getMenu,
    GetUnitTrace: reads.getUnitTrace,
    GetInventoryLevel: reads.getInventoryLevel,
    GetRevenue: reads.getRevenue,
    GetCOGS: reads.getCOGS,
    GetPnL: reads.getPnL,
    ComparePeriods: reads.comparePeriods,
    GetShiftStatus: reads.getShiftStatus,
    GetAlerts: reads.getAlerts,
    GetPendingApprovals: reads.getPendingApprovals
  };

  function createRuntime(spec) {
    spec = spec || {};
    var mode = spec.mode || MODE.READ_ONLY;
    if (!MODE[mode]) throw new Error('[bootstrap/runtime] mode không hợp lệ: ' + mode);
    var operationStore = spec.operationStore || pipeline.createInMemoryOperationStore();

    function context() {
      return typeof spec.context === 'function' ? spec.context() : spec.context;
    }
    function query(name, input) {
      var fn = QUERIES[name];
      if (!fn) return Promise.resolve(R.err('NOT_FOUND', 'query chưa đăng ký: ' + name));
      var ctx = context();
      if (!ctx) return Promise.resolve(R.err('NOT_FOUND', 'chưa có StoreContext để đọc dữ liệu'));
      var hydrated = spec.dataSource && typeof spec.dataSource.forQuery === 'function'
        ? spec.dataSource.forQuery(name, input || {})
        : R.ok(input || {});
      return Promise.resolve(hydrated).then(function (resolved) {
        if (R.isErr(resolved)) return resolved;
        return fn(ctx, resolved.value);
      });
    }
    function command(name, input) {
      var cmd = COMMANDS[name];
      if (!cmd) return Promise.resolve(R.err('NOT_FOUND', 'command chưa đăng ký: ' + name));
      if (mode === MODE.READ_ONLY) {
        return Promise.resolve(R.err('FORBIDDEN',
          'Hệ thống mới đang READ_ONLY — production cũ vẫn là sole writer'));
      }
      var ctx = context();
      if (!ctx) return Promise.resolve(R.err('NOT_FOUND', 'chưa có StoreContext để chạy command'));
      var hydrated = spec.dataSource && typeof spec.dataSource.forCommand === 'function'
        ? spec.dataSource.forCommand(name, input || {})
        : R.ok(input || {});
      return Promise.resolve(hydrated).then(function (resolved) {
        if (R.isErr(resolved)) return resolved;
        if (mode === MODE.SHADOW) {
          return pipeline.run(cmd, resolved.value, ctx, { operationStore: operationStore });
        }
        if (typeof spec.commit !== 'function') {
          return R.err('VALIDATION', 'WRITE mode cần atomic commit adapter');
        }
        return pipeline.runAndCommit(cmd, resolved.value, ctx, {
          operationStore: operationStore,
          commit: spec.commit,
          rollback: spec.rollback
        });
      });
    }
    function watch(name, input, listener) {
      if (typeof listener !== 'function') throw new Error('[bootstrap/runtime] watch cần listener');
      var fn = QUERIES[name];
      if (!fn) {
        listener(R.err('NOT_FOUND', 'query chưa đăng ký: ' + name));
        return function () {};
      }
      function resolve(hydrated) {
        if (R.isErr(hydrated)) return listener(hydrated);
        var ctx = context();
        if (!ctx) return listener(R.err('NOT_FOUND', 'chưa có StoreContext để đọc dữ liệu'));
        listener(fn(ctx, hydrated.value));
      }
      if (spec.dataSource && typeof spec.dataSource.watchQuery === 'function') {
        var unsubscribe = spec.dataSource.watchQuery(name, input || {}, resolve);
        if (typeof unsubscribe === 'function') return unsubscribe;
      }
      query(name, input).then(listener);
      return function () {};
    }

    return {
      mode: mode,
      query: query,
      watch: watch,
      command: command,
      device: spec.device || {},
      registeredCommands: function () { return Object.keys(COMMANDS).sort(); },
      registeredQueries: function () { return Object.keys(QUERIES).sort(); }
    };
  }

  return { MODE: MODE, COMMANDS: COMMANDS, QUERIES: QUERIES, createRuntime: createRuntime };
});
