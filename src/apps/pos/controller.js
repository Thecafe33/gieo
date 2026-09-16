/** POS controller: chỉ điều phối UI → runtime, không tính kho/giá/COGS. */
GIEO.define('app-pos/controller', [
  'shared-kernel/result',
  'bootstrap/runtime'
], function (R, bootstrap) {
  'use strict';

  function createController(runtime) {
    runtime = runtime || bootstrap.createRuntime({ mode: bootstrap.MODE.READ_ONLY });
    var state = {
      mode: runtime.mode,
      screen: 'SALE',
      busy: false,
      lastResult: null,
      lastError: null
    };

    function snapshot() { return Object.assign({}, state); }
    function navigate(screen) {
      if (['SALE', 'INVENTORY', 'SHIFT'].indexOf(screen) === -1) {
        return R.err('VALIDATION', 'màn POS không hợp lệ: ' + screen);
      }
      state.screen = screen;
      return R.ok(snapshot());
    }
    function run(commandName, input) {
      state.busy = true;
      state.lastError = null;
      return runtime.command(commandName, input || {}).then(function (result) {
        state.busy = false;
        if (R.isErr(result)) state.lastError = result.error;
        else state.lastResult = result.value;
        return result;
      });
    }
    function read(queryName, input) {
      state.busy = true;
      return Promise.resolve(runtime.query(queryName, input || {})).then(function (result) {
        state.busy = false;
        if (R.isErr(result)) state.lastError = result.error;
        else state.lastResult = result.value;
        return result;
      });
    }
    function retryPrint(payload) {
      if (!runtime.device || typeof runtime.device.printBill !== 'function') {
        return Promise.resolve(R.err('NOT_FOUND', 'chưa kết nối máy in bill'));
      }
      /* Retry chỉ gọi adapter thiết bị, tuyệt đối không chạy lại RecordSale. */
      return Promise.resolve(runtime.device.printBill(payload));
    }
    function watchMenu(input, listener) {
      if (typeof runtime.watch === 'function') return runtime.watch('GetMenu', input || {}, listener);
      read('GetMenu', input || {}).then(listener);
      return function () {};
    }

    return {
      state: snapshot,
      navigate: navigate,
      readMenu: function (input) { return read('GetMenu', input); },
      watchMenu: watchMenu,
      readInventory: function (input) { return read('GetInventoryLevel', input); },
      readUnitTrace: function (input) { return read('GetUnitTrace', input); },
      recordSale: function (input) { return run('RecordSale', input); },
      recordWaste: function (input) { return run('RecordWaste', input); },
      reportLost: function (input) { return run('ReportLostContainer', input); },
      closeCashSegment: function (input) { return run('CloseCashSegment', input); },
      retryPrint: retryPrint
    };
  }

  return { createController: createController };
});
