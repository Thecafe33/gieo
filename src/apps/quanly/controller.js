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
      if (['OVERVIEW', 'ALERTS', 'TRACE', 'INVENTORY', 'APPROVALS', 'REPORTS', 'BTP', 'BILLS'].indexOf(screen) === -1) {
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
      getInventoryLevel: function (input) { return read('GetInventoryLevel', input); },
      getRevenue: function (input) { return read('GetRevenue', input); },
      getCOGS: function (input) { return read('GetCOGS', input); },
      getBillsForRange: function (input) { return read('GetBillsForRange', input); },
      getLedgerEntriesForReference: function (input) { return read('GetLedgerEntriesForReference', input); },
      getLoyaltyLedgerForReference: function (input) { return read('GetLoyaltyLedgerForReference', input); },
      getPnL: function (input) { return read('GetPnL', input); },
      comparePeriods: function (input) { return read('ComparePeriods', input); },
      getAlerts: function (input) { return read('GetAlerts', Object.assign({ audience: 'QUANLY' }, input || {})); },
      getShiftStatus: function (input) { return read('GetShiftStatus', input); },
      getPendingApprovals: function (input) { return read('GetPendingApprovals', input); },
      getUsageReport: function (input) { return read('GetUsageReport', input); },
      getLossReport: function (input) { return read('GetLossReport', input); },
      getInventoryValuation: function (input) { return read('GetInventoryValuation', input); },
      getVarianceReport: function (input) { return read('GetVarianceReport', input); },
      getBTPReport: function (input) { return read('GetBTPReport', input); },
      openBusinessDay: function (input) { return run('OpenBusinessDay', input); },
      closeBusinessDay: function (input) { return run('CloseBusinessDay', input); },
      /**
       * Xuất file. BẮT BUỘC truyền lại `meta` của truy vấn gốc — file rời khỏi
       * hệ thống mà không mang xuất xứ thì không ai kiểm chứng lại được.
       */
      exportReport: function (input) { return read('ExportReport', input); },
      /**
       * Duyệt theo đúng command mà GetPendingApprovals đã gắn sẵn vào từng việc.
       * Màn hình KHÔNG tự tra bảng "loại này thì gọi gì" — tra bảng ở UI chính là
       * chỗ legacy nối thiếu hệ quả sau khi duyệt (Bug #12/#16).
       */
      approvePending: function (item, input) {
        if (!item || !item.command) {
          return Promise.resolve(R.err('VALIDATION',
            'việc chờ duyệt không mang sẵn command — từ chối đoán'));
        }
        return run(item.command, Object.assign({ referenceId: item.referenceId }, input || {}));
      },
      approveStockCount: function (input) { return run('ApproveStockCount', input); },
      approveLost: function (input) { return run('ApproveLostContainer', input); },
      approveExpense: function (input) { return run('ApproveExpense', input); },
      adjustInventory: function (input) { return run('AdjustInventory', input); },
      restoreFoundContainer: function (input) { return run('RestoreFoundContainer', input); },
      reverseOrder: function (input) { return run('ReverseTransaction', input); },
      reviseState: function (input) { return run('ReviseState', input); },
      correctLedgerEntry: function (input) { return run('CorrectLedgerEntry', input); }
    };
  }

  return { createController: createController };
});
