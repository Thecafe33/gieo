/**
 * Path CANONICAL mới — `orgs/{orgId}/stores/{storeId}/<domain>/{id}`.
 *
 * Contract: LEGACY-FIREBASE-PATH-MAP-V1.md §2.
 *
 * Hai quyết định đã chốt và giữ:
 *   - RTDB vẫn là "live/hot layer", KHÔNG chuyển hết sang Firestore. Phân tầng
 *     này ở legacy là ĐÚNG; rebuild chỉ đổi namespace + schema, không đổi động
 *     cơ lưu trữ.
 *   - `bank_confirmations` GIỮ NGUYÊN path cũ — webhook nằm ngoài phạm vi
 *     rebuild, đổi path là phá webhook đang chạy production.
 *
 * `storeId` có mặt trong MỌI path ngay từ đầu dù hệ thống hiện tại single-store
 * (đã chốt: chừa chỗ, không xây ALL_STORES). Thêm về sau nghĩa là phải sửa mọi
 * path và dữ liệu cũ thì không có gì để điền vào.
 */
GIEO.define('persistence-firebase/canonical-paths', [
  'shared-kernel/ids',
  'shared-kernel/result'
], function (ids, R) {
  'use strict';

  var RTDB = 'RTDB';
  var FIRESTORE = 'FIRESTORE';

  function base(ctx) {
    return 'orgs/' + ctx.organizationId + '/stores/' + ctx.storeId;
  }

  /**
   * Mọi builder nhận ctx có organizationId + storeId. Không có biến thể nào bỏ
   * qua storeId, nên không tồn tại đường ghi "quên" phạm vi cửa hàng.
   */
  function validateCtx(ctx) {
    if (!ctx || !ids.isId(ctx.organizationId, 'org')) {
      return R.err('VALIDATION', 'path canonical cần organizationId hợp lệ');
    }
    if (!ids.isId(ctx.storeId, 'store')) {
      return R.err('VALIDATION', 'path canonical cần storeId hợp lệ');
    }
    return R.ok(true);
  }

  var BUILDERS = {
    /* Live layer — RTDB, phản chiếu unit đang mở cho UI POS. */
    unitLive: { kind: RTDB, build: function (ctx, a) { return base(ctx) + '/units/live/' + a.itemId + '/' + a.unitId; } },
    /* Nguồn thật của Unit. */
    unit: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/units/' + a.unitId; } },
    prepUnit: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/prepUnits/' + a.unitId; } },
    /* Ledger GỘP raw + prep, phân biệt bằng field domain. */
    ledger: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/ledger/' + a.entryId; } },
    /* Operation record dùng chung MỌI domain — tổng quát hoá từ
       reversal_unit_claims_gieogieo vốn chỉ dùng cho reversal. */
    operation: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/operations/' + a.operationId; } },
    item: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/items/' + a.itemId; } },
    prepItem: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/prepItems/' + a.prepItemId; } },
    prepBatch: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/prepBatches/' + a.prepBatchId; } },
    stockCount: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/stockCounts/' + a.countId; } },
    lostReport: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/lostReports/' + a.reportId; } },
    purchaseOrder: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/purchaseOrders/' + a.id; } },
    receivingRecord: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/receivingRecords/' + a.id; } },
    /* Bản ghi hao hụt — key ghép wasteRef+itemId, đúng cặp làm nên
       operationId của RecordWaste (commands/inventory.js). */
    wasteRecord: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/wasteRecords/' + a.wasteRef + '.' + a.itemId; } },
    /* Bản ghi đối chiếu vật lý — key theo operationId, đã xác định sẵn từ
       AdjustInventory/ApproveStockCount, không cần key riêng. */
    reconciliationRecord: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/reconciliationRecords/' + a.operationId; } },
    /* Khoản trừ trách nhiệm nhân viên khi mất container (hr/liability.js). */
    liability: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/liabilities/' + a.liabilityId; } },
    /* Chốt lương tháng (hr/payroll.js closePayroll). */
    payrollClosing: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/payrollClosings/' + a.payrollClosingId; } },

    /* Recipe CÓ tầng version — legacy ghi đè trực tiếp, đây là chỗ sửa. */
    recipeVersion: {
      kind: FIRESTORE,
      build: function (ctx, a) { return base(ctx) + '/recipes/' + a.recipeId + '/versions/' + a.versionId; }
    },
    /* CostBasis append-only — giữ nguyên mô hình price_history, phần ĐÚNG duy
       nhất của legacy về versioning. */
    costBasis: {
      kind: FIRESTORE,
      build: function (ctx, a) { return base(ctx) + '/costBasis/' + a.itemId + '/history/' + a.entryId; }
    },
    versionedInput: {
      kind: FIRESTORE,
      build: function (ctx, a) { return base(ctx) + '/versions/' + a.kind + '/' + a.subjectId + '/' + a.versionId; }
    },
    packagingConfig: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/packagingConfig/' + a.id; } },
    /* CP11 — commands/catalog.js. */
    menuItem: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/menuItems/' + a.menuItemId; } },
    category: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/categories/' + a.categoryId; } },
    promotion: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/promotions/' + a.promotionId; } },
    manualCostOverride: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/manualCostOverrides/' + a.itemId; } },

    /* Bill — live ở RTDB, archive ở Firestore, giữ đúng phân tầng legacy. */
    billLive: { kind: RTDB, build: function (ctx, a) { return base(ctx) + '/bills/live/' + a.businessDate + '/' + a.billId; } },
    /* Con của billLive, KHÔNG phải node riêng — một lần đọc `bills/live/{date}/{billId}`
       trả về cả bill lẫn addons của nó, đúng tinh thần "đơn + bổ sung nằm cùng
       một bill" của legacy (o.addons). archive.js đọc nguyên subtree RTDB này khi
       chuyển sang billArchive, nên addons đi theo tự động, không cần khai riêng. */
    billAddon: { kind: RTDB, build: function (ctx, a) { return base(ctx) + '/bills/live/' + a.businessDate + '/' + a.billId + '/addons/' + a.addonSeq; } },
    billArchive: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/billArchives/' + a.archiveKey; } },
    archiveRegistry: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/archiveRegistry/' + a.businessDate; } },
    billCounter: { kind: RTDB, build: function (ctx, a) { return base(ctx) + '/counters/bill/' + a.businessDate; } },

    /* Cache TÍNH-LẠI-ĐƯỢC — không lên cấp thành snapshot bất biến. */
    dailySalesCache: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/dailySalesCache/' + a.dateKey; } },
    /* Sổ vận hành ca — event record, đọc thẳng. */
    shiftDay: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/shifts/' + a.businessDate; } },
    shiftSegment: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/shifts/' + a.businessDate + '/segments/' + a.seq; } },
    /* Trạng thái tiến trình cutover. Phải NẰM TRONG kho, không nằm trong bộ nhớ
       tab: tải lại trang mà quyền ghi trở về mặc định thì mọi bảo đảm của P13
       chỉ tồn tại tới lần F5 đầu tiên. */
    cutoverState: { kind: FIRESTORE, build: function (ctx) { return base(ctx) + '/system/cutover'; } },
    employee: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/employees/' + a.employeeId; } },
    employeeShift: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/employeeShifts/' + a.shiftId; } },
    /* Compaction thật. */
    /* Firestore đòi collection/document xen kẽ, nên path tới một document LUÔN
       có số đoạn CHẴN. Bốn path dưới đây từng có số đoạn lẻ — trỏ vào một
       collection chứ không phải một document — và chỉ lộ ra khi ghi thật.
       `base` đã là 4 đoạn, nên phần đuôi phải chẵn. */
    monthlySnapshot: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/monthlySnapshots/' + a.period + '.r' + a.revisionNo; } },
    monthlySnapshotHead: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/monthlySnapshots/' + a.period + '.head'; } },
    unitSnapshot: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/unitSnapshots/' + a.unitId + '.r' + a.revisionNo; } },
    unitSnapshotHead: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/unitSnapshots/' + a.unitId + '.head'; } },

    loyaltyLedger: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/loyaltyLedger/' + a.entryId; } },
    loyaltyEffects: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/loyaltyEffects/' + a.billId; } },
    customer: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/customers/' + a.customerId; } },
    alert: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/alerts/' + a.alertId; } },
    auditLog: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/auditLogs/' + a.id; } },
    traceDependency: { kind: FIRESTORE, build: function (ctx, a) { return base(ctx) + '/traceDependencies/' + a.id; } }
  };

  function path(name, ctx, args) {
    var b = BUILDERS[name];
    if (!b) return R.err('VALIDATION', 'không có path canonical tên "' + name + '"');
    var v = validateCtx(ctx);
    if (R.isErr(v)) return v;
    return R.ok({ kind: b.kind, path: b.build(ctx, args || {}) });
  }

  /**
   * Path COLLECTION chứa một builder document — bỏ đoạn cuối (id document) của
   * `path()`. Dùng cho đọc canonical trước ghi (vd. toàn bộ Unit của 1 itemId,
   * toàn bộ version của 1 subjectId) — nơi cần LIỆT KÊ, không phải trỏ 1 doc.
   * Sinh từ builder có sẵn thay vì tự khai lại `base()` ở module khác, nên
   * không có chỗ path collection lệch khỏi path document tương ứng.
   */
  function collectionPath(name, ctx, args) {
    var d = path(name, ctx, args);
    if (R.isErr(d)) return d;
    var parts = d.value.path.split('/');
    if (parts.length < 2) return R.err('VALIDATION', 'path "' + name + '" quá ngắn để bỏ đoạn document');
    parts.pop();
    return R.ok({ kind: d.value.kind, path: parts.join('/') });
  }

  /**
   * Path PROTECTED giữ nguyên tên cũ, KHÔNG nằm dưới namespace orgs/.
   * Tách riêng để không ai vô tình "chuẩn hoá" nó theo mẫu chung.
   */
  var PROTECTED = {
    bankConfirmation: { kind: RTDB, build: function (a) { return 'bank_confirmations/' + a.bankOrderId; } }
  };

  function protectedPath(name, args) {
    var p = PROTECTED[name];
    if (!p) return R.err('VALIDATION', 'không có protected path "' + name + '"');
    return R.ok({ kind: p.kind, path: p.build(args || {}), isProtected: true });
  }

  function listNames() { return Object.keys(BUILDERS).sort(); }

  return {
    RTDB: RTDB,
    FIRESTORE: FIRESTORE,
    path: path,
    collectionPath: collectionPath,
    protectedPath: protectedPath,
    listNames: listNames
  };
});
