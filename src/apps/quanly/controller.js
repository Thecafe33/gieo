/** QUANLY controller: drill qua read-layer, sửa/duyệt qua command pipeline. */
GIEO.define('app-quanly/controller', [
  'shared-kernel/result',
  'bootstrap/runtime'
], function (R, bootstrap) {
  'use strict';

  function createController(runtime) {
    runtime = runtime || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var state = { mode: runtime.mode, screen: 'OVERVIEW', lastResult: null, lastError: null };
    function snapshot() { return Object.assign({}, state); }
    function navigate(screen) {
      if (['OVERVIEW', 'TRACE', 'APPROVALS', 'REPORTS'].indexOf(screen) === -1) {
        return R.err('VALIDATION', 'màn QUANLY không hợp lệ: ' + screen);
      }
      state.screen = screen;
      return R.ok(snapshot());
    }
    function read(name, input) {
      return Promise.resolve(runtime.query(name, input || {})).then(function (out) {
        if (R.isErr(out)) state.lastError = out.error;
        else state.lastResult = out.value;
        return out;
      });
    }
    function run(name, input) {
      return runtime.command(name, input || {}).then(function (out) {
        if (R.isErr(out)) state.lastError = out.error;
        else state.lastResult = out.value;
        return out;
      });
    }

    return {
      state: snapshot,
      navigate: navigate,
      getUnitTrace: function (input) { return read('GetUnitTrace', input); },
      getRevenue: function (input) { return read('GetRevenue', input); },
      getCOGS: function (input) { return read('GetCOGS', input); },
      getPnL: function (input) { return read('GetPnL', input); },
      approveStockCount: function (input) { return run('ApproveStockCount', input); },
      approveLost: function (input) { return run('ApproveLostContainer', input); },
      approveExpense: function (input) { return run('ApproveExpense', input); },
      adjustInventory: function (input) { return run('AdjustInventory', input); },
      reverseOrder: function (input) { return run('ReverseTransaction', input); }
    };
  }

  return { createController: createController };
});
