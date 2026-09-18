/** Composition root duy nhất cho apps: query qua read-layer, mutation qua commands. */
GIEO.define('bootstrap/runtime', [
  'shared-kernel/result',
  'commands/pipeline',
  'commands/sales',
  'commands/inventory',
  'commands/receiving',
  'commands/stock-count',
  'commands/catalog',
  'commands/prep',
  'commands/reversal',
  'commands/approval',
  'commands/business-day',
  'commands/shift',
  'commands/payroll',
  'commands/loyalty',
  'commands/alerts',
  'commands/versioning',
  'commands/kho-config',
  'read-layer/gateway',
  'read-layer/merge-canonical',
  'reporting/report-queries',
  'bootstrap/domain-events'
], function (
  R, pipeline, sales, inventory, receiving, stockCount, catalog, prep, reversal, approval,
  businessDay, shift, payroll, loyalty, alerts, versioning, khoConfig, reads, merge, reports, domainEvents
) {
  'use strict';

  var MODE = { READ_ONLY: 'READ_ONLY', SHADOW: 'SHADOW', WRITE: 'WRITE' };
  var COMMANDS = {
    RecordSale: sales.RecordSale,
    RecordAddon: sales.RecordAddon,
    RecordWaste: inventory.RecordWaste,
    AdjustInventory: inventory.AdjustInventory,
    ReportLostContainer: inventory.ReportLostContainer,
    RestoreFoundContainer: inventory.RestoreFoundContainer,
    ReceiveGoods: receiving.ReceiveGoods,
    CorrectReceivingCost: receiving.CorrectReceivingCost,
    SubmitStockCount: stockCount.SubmitStockCount,
    CreateCategory: catalog.CreateCategory,
    CreateMenuItem: catalog.CreateMenuItem,
    RenameMenuItem: catalog.RenameMenuItem,
    LinkRecipeToMenuItem: catalog.LinkRecipeToMenuItem,
    ArchiveMenuItem: catalog.ArchiveMenuItem,
    RestoreMenuItem: catalog.RestoreMenuItem,
    CreatePromotion: catalog.CreatePromotion,
    RecordPrepProduction: prep.RecordPrepProduction,
    EditPrepYield: prep.EditPrepYield,
    ReverseTransaction: reversal.ReverseTransaction,
    ReviseState: reversal.ReviseState,
    CorrectLedgerEntry: reversal.CorrectLedgerEntry,
    ApproveLostContainer: approval.ApproveLostContainer,
    ApproveStockCount: approval.ApproveStockCount,
    ApproveExpense: approval.ApproveExpense,
    OpenBusinessDay: businessDay.OpenBusinessDay,
    CloseBusinessDay: businessDay.CloseBusinessDay,
    OpenCashSegment: shift.OpenCashSegment,
    CheckIn: shift.CheckIn,
    CheckOut: shift.CheckOut,
    CloseCashSegment: shift.CloseCashSegment,
    ReviseAttendance: payroll.ReviseAttendance,
    ClosePayroll: payroll.ClosePayroll,
    /* L9 — chỉ được RUNTIME gọi tiếp qua domain-events dispatch, nhưng vẫn
       đăng ký công khai: idempotency/quyền/audit phải đi qua đúng 1 cổng,
       không có đường tắt riêng cho command "nội bộ". */
    AccrueLoyaltyForSale: loyalty.AccrueLoyaltyForSale,
    AccrueLoyaltyForAddon: loyalty.AccrueLoyaltyForAddon,
    ReverseLoyaltyForVoidedBill: loyalty.ReverseLoyaltyForVoidedBill,
    RaiseAlert: alerts.RaiseAlert,
    /* AL6 — markSeen/resolve gọi được từ UI, không còn phải đọc/ghi trực
       tiếp qua alerts/alert.js. */
    MarkAlertSeen: alerts.MarkAlertSeen,
    ResolveAlert: alerts.ResolveAlert,
    /* CP-VersionedInput — publish qua đúng 1 cổng pipeline (auth/idempotency/
       audit/atomic-commit), thay vì gọi thẳng registry.publish() từ UI. */
    PublishRecipeVersion: versioning.PublishRecipeVersion,
    PublishCostBasis: versioning.PublishCostBasis,
    PublishPackaging: versioning.PublishPackaging,
    PublishYield: versioning.PublishYield,
    PublishPayTerms: versioning.PublishPayTerms,
    PublishConfig: versioning.PublishConfig,
    PublishIceCogs: versioning.PublishIceCogs,
    /* Kho — danh mục cấu hình đơn giản (commands/kho-config.js), 2026-09-18. */
    SaveStorageLocation: khoConfig.SaveStorageLocation,
    SaveWasteReason: khoConfig.SaveWasteReason,
    SaveVessel: khoConfig.SaveVessel,
    SaveRefillRule: khoConfig.SaveRefillRule,
    SaveChecklistItem: khoConfig.SaveChecklistItem,
    SaveToppingRecipe: khoConfig.SaveToppingRecipe,
    CreatePurchaseOrder: khoConfig.CreatePurchaseOrder,
    CancelPurchaseOrder: khoConfig.CancelPurchaseOrder
  };
  var QUERIES = {
    GetMenu: reads.getMenu,
    GetMenuAvailability: reads.getMenuAvailability,
    GetActivePromotions: reads.getActivePromotions,
    GetUnitTrace: reads.getUnitTrace,
    GetInventoryLevel: reads.getInventoryLevel,
    GetRevenue: reads.getRevenue,
    GetCOGS: reads.getCOGS,
    GetBillsForRange: reads.getBillsForRange,
    GetLedgerEntriesForReference: reads.getLedgerEntriesForReference,
    GetLoyaltyLedgerForReference: reads.getLoyaltyLedgerForReference,
    GetPnL: reads.getPnL,
    GetMix: reads.getMix,
    GetCustomerReport: reads.getCustomerReport,
    GetKhoConfigList: reads.getKhoConfigList,
    GetKhoHistory: reads.getKhoHistory,
    GetOpenUnits: reads.getOpenUnits,
    ComparePeriods: reads.comparePeriods,
    GetShiftStatus: reads.getShiftStatus,
    GetAlerts: reads.getAlerts,
    GetPendingApprovals: reads.getPendingApprovals,
    /* P11 — báo cáo đi qua cùng cổng đọc, không có đường tắt về nguồn thô. */
    GetUsageReport: reports.getUsageReport,
    /* RM7 — cùng dữ liệu GetUsageReport, gộp theo ngày thay vì cả kỳ. */
    GetUsageReportDaily: reports.getUsageReportDaily,
    GetLossReport: reports.getLossReport,
    GetInventoryValuation: reports.getInventoryValuation,
    GetVarianceReport: reports.getVarianceReport,
    GetBTPReport: reports.getBTPReport,
    /* PR2b (NET-PAYROLL-V1.md) — đường ĐỌC lương tháng, sống ở read-layer
       (reads), không phải reporting — xem lý do ở read-layer/gateway.js. */
    GetPayrollForMonth: reads.getPayrollForMonth,
    ExportReport: reports.exportReport
  };

  function createRuntime(spec) {
    spec = spec || {};
    var declaredMode = spec.mode || MODE.READ_ONLY;
    if (!MODE[declaredMode]) throw new Error('[bootstrap/runtime] mode không hợp lệ: ' + declaredMode);
    if (spec.cutover && spec.mode) {
      /* Hai nguồn sự thật cho "được ghi chưa" là đúng một nguồn quá nhiều. */
      throw new Error('[bootstrap/runtime] có cutover thì KHÔNG đặt mode bằng tay — ' +
        'quyền ghi do tiến trình cutover (P13) quyết, không do lời gọi');
    }
    var operationStore = spec.operationStore || pipeline.createInMemoryOperationStore();

    /**
     * Mode HIỆN TẠI, hỏi lại mỗi lần chứ không chụp một lần lúc dựng: rollback
     * ở P13 phải có hiệu lực ngay, không đợi khởi động lại app.
     */
    function currentMode() {
      return spec.cutover ? spec.cutover.runtimeMode() : declaredMode;
    }

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
    /**
     * L9 — sau khi command mutate xong, dịch `plan.events` thành các command
     * tiếp theo (đăng nhập ở `bootstrap/domain-events.js`) và CHẠY THẬT qua
     * lại đúng `command()` này — không có đường ghi tắt riêng cho side-effect.
     * Một handler hỏng không được nuốt im lặng (cùng nguyên tắc với
     * `reversal.js#createEventBus`): kết quả từng side-effect gắn vào
     * `result.value.sideEffects` để caller/log thấy, nhưng KHÔNG lật ngược
     * kết quả OK của command gốc — bán hàng/hoàn kho đã xong thật rồi,
     * loyalty lỗi là việc cần rà tay, không phải lý do rollback giao dịch
     * chính (đúng tinh thần decoupled retry mà legacy vốn đã làm, chỉ tự chế
     * kém hơn).
     */
    /**
     * RP3 (NET-REPORTING-V1.md) — sau routes/command side-effect (L9), dịch
     * tiếp `plan.events` sang scope cache cần bỏ và GỌI THẲNG
     * `read-layer/merge-canonical.invalidateScope()`. Đây KHÔNG đi qua
     * `command()`/`COMMANDS`: invalidate cache không phải mutate qua pipeline
     * (không auth/idempotency riêng — nó là hệ quả đọc lại của mutation đã
     * chạy xong), và bản thân `invalidateScope()` là hàm thuần bên
     * `read-layer`, tầng mà `commands` không được import — chỉ `bootstrap`
     * mới thấy được cả hai để nối chỗ này (xem comment ở
     * `domainEvents.scopesToInvalidate`).
     *
     * `spec.reportCacheKeys(scope)` là điểm nối CHO ADAPTER thật cung cấp
     * danh sách key đang cache — hiện KHÔNG adapter nào implement (chưa có
     * nơi nào ghi `dailySalesCache`, xác nhận qua grep toàn bộ src/layers),
     * nên mặc định `[]`: `invalidateScope([], scope)` trả `{kept: [], dropped:
     * []}` — ĐÚNG với thực tế hệ thống hiện tại (chưa có gì để xoá), không
     * phải giả lập thành công. Khi cache thật được xây, chỉ cần cấp
     * `reportCacheKeys` — dây nối này không cần sửa lại.
     */
    function dispatchCacheInvalidations(result) {
      var plan = result.value.plan;
      var scopes = domainEvents.scopesToInvalidate(plan.events);
      if (!scopes.length) return result;
      result.value.reportCacheInvalidations = scopes.map(function (scope) {
        var keys = typeof spec.reportCacheKeys === 'function' ? (spec.reportCacheKeys(scope) || []) : [];
        var inv = merge.invalidateScope(keys, scope);
        return { scope: scope, kept: R.isOk(inv) ? inv.value.kept : keys, dropped: R.isOk(inv) ? inv.value.dropped : [] };
      });
      return result;
    }
    function dispatchDomainEvents(result) {
      if (R.isErr(result)) return Promise.resolve(result);
      var plan = result.value && result.value.plan;
      if (!plan || !plan.events || !plan.events.length) return Promise.resolve(result);
      var routes = domainEvents.routeEvents(plan.events);
      var afterCommands = routes.length
        ? Promise.all(routes.map(function (route) {
          return command(route.command, route.input).then(function (out) {
            return { command: route.command, sourceEvent: route.sourceEvent, result: out };
          });
        })).then(function (sideEffects) {
          result.value.sideEffects = sideEffects;
          return result;
        })
        : Promise.resolve(result);
      return afterCommands.then(dispatchCacheInvalidations);
    }
    function command(name, input) {
      var cmd = COMMANDS[name];
      if (!cmd) return Promise.resolve(R.err('NOT_FOUND', 'command chưa đăng ký: ' + name));
      var mode = currentMode();
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
        var ran;
        if (mode === MODE.SHADOW) {
          ran = Promise.resolve(pipeline.run(cmd, resolved.value, ctx, { operationStore: operationStore }));
        } else {
          if (typeof spec.commit !== 'function') {
            return R.err('VALIDATION', 'WRITE mode cần atomic commit adapter');
          }
          ran = pipeline.runAndCommit(cmd, resolved.value, ctx, {
            operationStore: operationStore,
            commit: spec.commit,
            rollback: spec.rollback
          });
        }
        return ran.then(dispatchDomainEvents);
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

    var api = {
      query: query,
      watch: watch,
      command: command,
      /* StoreContext hiện tại — app cần đọc actorId/storeId/businessDate/clock
         để tự dựng input thuần (vd. `commands/sales.js#buildBill`) TRƯỚC khi
         gọi command(), không phải tự đoán hay chép lại logic tạo context. */
      context: context,
      device: spec.device || {},
      currentMode: currentMode,
      registeredCommands: function () { return Object.keys(COMMANDS).sort(); },
      registeredQueries: function () { return Object.keys(QUERIES).sort(); }
    };

    /* `mode` đọc như một trường thường để UI không phải biết có cutover hay
       không, nhưng nó luôn trả giá trị hiện tại. */
    Object.defineProperty(api, 'mode', { enumerable: true, get: currentMode });
    return api;
  }

  return { MODE: MODE, COMMANDS: COMMANDS, QUERIES: QUERIES, createRuntime: createRuntime };
});
