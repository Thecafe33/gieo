/**
 * TẤT CẢ path Firebase CŨ tập trung ở MỘT file.
 *
 * Contract: LEGACY-FIREBASE-PATH-MAP-V1.md §4.
 *
 * Legacy format chuỗi path rải rác trong nhiều chục chỗ, nên đổi một path là
 * phải đi tìm khắp 50k dòng. Ở đây một hằng số / một path.
 *
 * ADAPTER NÀY CHỈ ĐỌC. Không hàm nào ở đây ghi, và `assertReadOnly()` tồn tại
 * để nếu ai đó thêm đường ghi thì nó hỏng ồn ào chứ không âm thầm ghi vào dữ
 * liệu production đang chạy.
 */
GIEO.define('legacy-firebase-adapter/legacy-paths', ['shared-kernel/result'], function (R) {
  'use strict';

  var RTDB = 'RTDB';
  var FIRESTORE = 'FIRESTORE';

  /** kind: RTDB (dữ liệu nóng) vs FIRESTORE — giữ nguyên phân tầng của legacy. */
  var PATHS = {
    /* ── Unit / FIFO ────────────────────────────────────────────────── */
    activeUnits: { kind: RTDB, path: 'active_units_gieogieo', keyed: 'itemId/containerId' },
    stockContainers: { kind: FIRESTORE, path: 'stock_containers_gieogieo' },
    prepBatches: { kind: FIRESTORE, path: 'prep_batches_gieogieo' },
    stockTransactions: { kind: FIRESTORE, path: 'stock_transactions_gieogieo' },
    prepTransactions: { kind: FIRESTORE, path: 'prep_transactions_gieogieo' },
    inventoryItems: { kind: FIRESTORE, path: 'inventory_items_gieogieo' },
    prepItems: { kind: FIRESTORE, path: 'prep_items_gieogieo' },
    reversalUnitClaims: { kind: FIRESTORE, path: 'reversal_unit_claims_gieogieo' },
    stockCounts: { kind: FIRESTORE, path: 'stock_counts_gieogieo' },
    stockLostReports: { kind: FIRESTORE, path: 'stock_lost_reports_gieogieo' },
    employeeStockDeductions: { kind: FIRESTORE, path: 'employee_stock_deductions_gieogieo' },
    refillRules: { kind: FIRESTORE, path: 'refill_rules_gieogieo' },
    storageLocations: { kind: FIRESTORE, path: 'storage_locations_gieogieo' },
    purchaseOrders: { kind: FIRESTORE, path: 'purchase_orders_gieogieo' },
    receivingRecords: { kind: FIRESTORE, path: 'receiving_records_gieogieo' },

    /* ── Recipe / Cost / BTP ────────────────────────────────────────── */
    recipes: { kind: FIRESTORE, path: 'recipes_gieogieo' },
    toppingRecipes: { kind: FIRESTORE, path: 'topping_recipes_gieogieo' },
    priceHistory: { kind: FIRESTORE, path: 'price_history_gieogieo' },
    cogsTogo: { kind: FIRESTORE, path: 'cogs_gieogieo/togo' },
    prepForecasts: { kind: FIRESTORE, path: 'prep_forecasts_gieogieo' },
    packagingPresets: { kind: FIRESTORE, path: 'packaging_presets_gieogieo' },

    /* ── Bill / Order ───────────────────────────────────────────────── */
    orders: { kind: RTDB, path: 'orders_gieogieo', keyed: 'month/day/billId' },
    ordersArchive: { kind: FIRESTORE, path: 'orders_gieogieo_archive', keyed: 'month_day_year' },
    billCounters: { kind: RTDB, path: 'billCounters_gieogieo' },
    billDeletions: { kind: FIRESTORE, path: 'bill_deletions_gieogieo' },
    sessionDisplay: { kind: RTDB, path: 'session_display_gieogieo' },

    /* ── Snapshot / chốt sổ ─────────────────────────────────────────── */
    dailySalesCache: { kind: FIRESTORE, path: 'daily_sales_cache_gieogieo' },
    dailyClosings: { kind: FIRESTORE, path: 'daily_closings_gieogieo' },
    dailyOpenings: { kind: FIRESTORE, path: 'daily_openings_gieogieo' },
    handoverRecords: { kind: FIRESTORE, path: 'handover_records_gieogieo' },
    shiftSegments: { kind: FIRESTORE, path: 'shift_segments_gieogieo' },
    bookClosings: { kind: FIRESTORE, path: 'book_closings_gieogieo' },
    employeeShifts: { kind: FIRESTORE, path: 'employee_shifts_gieogieo' },

    /* ── Loyalty ────────────────────────────────────────────────────── */
    customers: { kind: FIRESTORE, path: 'customers' },
    loyaltyBillEffects: { kind: FIRESTORE, path: 'loyalty_bill_effects_gieogieo' },
    loyaltyPendingRetry: { kind: FIRESTORE, path: 'loyalty_pending_retry_gieogieo' },
    stampFreeRedemptions: { kind: FIRESTORE, path: 'stamp_free_redemptions_gieogieo' },

    /* ── Khác ───────────────────────────────────────────────────────── */
    employees: { kind: FIRESTORE, path: 'employees_gieogieo' },
    workSchedules: { kind: FIRESTORE, path: 'work_schedules_gieogieo' },
    expenses: { kind: FIRESTORE, path: 'expenses_gieogieo' },
    alerts: { kind: FIRESTORE, path: 'alerts_gieogieo' },
    auditLogs: { kind: FIRESTORE, path: 'audit_logs_gieogieo' },
    configHistory: { kind: FIRESTORE, path: 'config_history_gieogieo' },
    menu: { kind: RTDB, path: 'menu_gieogieo' },
    menuTogo: { kind: RTDB, path: 'menu_togo_gieogieo' },
    toppings: { kind: RTDB, path: 'toppings_gieogieo' },

    /**
     * PROTECTED — GIỮ NGUYÊN PATH, KHÔNG ĐỔI.
     * Webhook ngân hàng nằm ngoài phạm vi rebuild; đổi path là phá webhook đang
     * chạy production (LEGACY-FIREBASE-PATH-MAP-V1.md §2.5).
     */
    bankConfirmations: { kind: RTDB, path: 'bank_confirmations', protected: true }
  };

  /* Path legacy CỐ Ý không migrate — ngoài phạm vi FIFO Core (§3). Liệt kê ra
     để phân biệt "đã cân nhắc rồi bỏ" với "quên mất". */
  var NOT_MIGRATED = [
    'employees_gieogieo', 'work_schedules_gieogieo', 'hr_settings_gieogieo',
    'expenses_gieogieo', 'expense_categories_gieogieo', 'payment_methods_gieogieo',
    'customers', 'rewards', 'alerts_gieogieo',
    'menu_gieogieo', 'menu_togo_gieogieo', 'toppings_gieogieo', 'food_gieogieo',
    'config_history_gieogieo', 'audit_logs_gieogieo', 'finance_gieogieo/current',
    'daily_ops_gieogieo'
  ];

  function get(name) {
    var p = PATHS[name];
    if (!p) throw new Error('[legacy-paths] không có path tên "' + name + '"');
    return p;
  }

  /**
   * Chốt chặn read-only. Gọi ở mọi chỗ định ghi — không có chỗ nào gọi là đúng.
   * Ngoại lệ duy nhất là script migration/cutover trong tools/, chạy ngoài
   * adapter này.
   */
  function assertReadOnly(operation, pathName) {
    return R.err('FORBIDDEN',
      'legacy-firebase-adapter CHỈ ĐỌC — từ chối "' + operation + '" lên "' + pathName + '". ' +
      'Hệ thống cũ vẫn đang chạy production; ghi canonical đi qua persistence-firebase, ' +
      'migration đi qua script riêng ở tools/.');
  }

  function isProtected(name) {
    return !!(PATHS[name] && PATHS[name].protected);
  }

  return {
    RTDB: RTDB,
    FIRESTORE: FIRESTORE,
    PATHS: PATHS,
    NOT_MIGRATED: NOT_MIGRATED,
    get: get,
    assertReadOnly: assertReadOnly,
    isProtected: isProtected
  };
});
