/**
 * Ranh giới ghi NGUYÊN TỬ cho MutationPlan.
 *
 * Contract: GIEO-SYSTEM-REBUILD-PLAN.md §2 (data flow chuẩn),
 * FIFO-CORE-ARCHITECTURE-V2.md §7 (idempotency).
 *
 * Một `MutationPlan` mang TẤT CẢ thay đổi của một operation: vật chất (Unit) +
 * ledger + projection + trace + domain record. Ghi hết hoặc không ghi gì.
 *
 * Vì sao điều này quan trọng hơn vẻ ngoài: legacy có những chỗ allocate xong
 * rồi ghi sổ hỏng mà không rollback (bug #21), và những chỗ ghi `currentStock`
 * tách rời khỏi ledger nên hai bên lệch nhau âm thầm. Cả hai biến mất nếu
 * không tồn tại đường ghi từng phần.
 *
 * Module này KHÔNG import Firebase SDK. Nó nhận một `transactionRunner` được
 * tiêm vào — adapter thật cho nó một transaction Firestore, test cho nó bản
 * in-memory. Nhờ vậy domain core không bao giờ chạm SDK (blueprint §2 quy tắc 2).
 */
GIEO.define('persistence-firebase/atomic-commit', [
  'shared-kernel/result',
  'shared-kernel/operation-state',
  'persistence-firebase/canonical-paths'
], function (R, opState, paths) {
  'use strict';

  /**
   * Dịch MutationPlan thành danh sách thao tác ghi có path cụ thể.
   * Tách riêng để kiểm được plan sinh ra đúng những path nào mà không cần ghi thật.
   */
  function planToWrites(plan, ctx) {
    var writes = [];
    var errors = [];

    function add(name, args, data, op) {
      var p = paths.path(name, ctx, args);
      if (R.isErr(p)) { errors.push(p.error.message); return; }
      writes.push({ kind: p.value.kind, path: p.value.path, op: op || 'set', data: data });
    }

    (plan.unitChanges || []).forEach(function (u) {
      add('unit', { unitId: u.unitId }, u);
      /* Live layer chỉ phản chiếu unit đang mở — hũ đã hết thì gỡ khỏi RTDB,
         đúng vai trò "hot layer" của legacy. */
      if (u.status === 'OPEN' || u.status === 'CONSUMING') {
        add('unitLive', { itemId: u.itemId, unitId: u.unitId }, {
          unitBase: u.remainingQty, status: u.status, openedAt: u.openedAt
        });
      } else {
        add('unitLive', { itemId: u.itemId, unitId: u.unitId }, null, 'remove');
      }
    });

    (plan.ledgerEntries || []).forEach(function (e) {
      add('ledger', { entryId: e.entryId || null }, e);
    });

    (plan.domainRecords || []).forEach(function (r) {
      var map = {
        bill: ['billLive', function (x) { return { businessDate: x.businessDate, billId: x.billId }; }],
        billArchive: ['billArchive', function (x) { return { archiveKey: x.archiveKey }; }],
        archiveRegistry: ['archiveRegistry', function (x) { return { businessDate: x.businessDate }; }],
        prepBatch: ['prepBatch', function (x) { return { prepBatchId: x.prepBatchId }; }],
        lostReport: ['lostReport', function (x) { return { reportId: x.lostReportId }; }],
        stockCount: ['stockCount', function (x) { return { countId: x.stockCountId }; }],
        cashSegment: ['shiftSegment', function (x) { return { businessDate: x.businessDate, seq: x.seq }; }],
        expense: ['auditLog', function (x) { return { id: x.expenseId }; }],
        unitSnapshot: ['unitSnapshot', function (x) { return { unitId: x.unitId, revisionNo: x.revisionNo }; }],
        unitSnapshotHead: ['unitSnapshotHead', function (x) { return { unitId: x.unitId }; }],
        monthlySnapshot: ['monthlySnapshot', function (x) { return { period: x.period, revisionNo: x.revisionNo }; }],
        monthlySnapshotHead: ['monthlySnapshotHead', function (x) { return { period: x.period }; }],
        /* Loại bản ghi của đường TIẾP NHẬN dữ liệu cũ. Khai ở đây vì nếu không
           khai thì `planToWrites` từ chối — và từ chối đúng là hành vi mong muốn
           cho loại chưa khai, nên cách mở là khai ra, không phải nới luật. */
        item: ['item', function (x) { return { itemId: x.itemId }; }],
        recipeVersion: ['recipeVersion', function (x) {
          return { recipeId: x.recipeId, versionId: x.versionId };
        }],
        employee: ['employee', function (x) { return { employeeId: x.employeeId }; }],
        /* Bổ sung — 7 loại này được commands/* đẩy vào plan.domainRecords từ
           trước nhưng thiếu khai path, nên commit() thật sẽ TỪ CHỐI ngay ở
           đây dù execute() vẫn trả plan hợp lệ (chỉ lộ ra khi ghi thật, không
           lộ ở test gọi execute() trực tiếp). Khai đủ để đường ghi thật không
           đứt ở persistence boundary. */
        employeeShift: ['employeeShift', function (x) { return { shiftId: x.shiftId }; }],
        receivingRecord: ['receivingRecord', function (x) { return { id: x.receivingRecordId }; }],
        purchaseOrder: ['purchaseOrder', function (x) { return { id: x.purchaseOrderId }; }],
        wasteRecord: ['wasteRecord', function (x) { return { wasteRef: x.wasteRef, itemId: x.itemId }; }],
        reconciliationRecord: ['reconciliationRecord', function (x) { return { operationId: x.operationId }; }],
        liability: ['liability', function (x) { return { liabilityId: x.liabilityId }; }],
        payrollClosing: ['payrollClosing', function (x) { return { payrollClosingId: x.payrollClosingId }; }],
        /* CP11 — commands/catalog.js. */
        menuItem: ['menuItem', function (x) { return { menuItemId: x.menuItemId }; }],
        category: ['category', function (x) { return { categoryId: x.categoryId }; }],
        promotion: ['promotion', function (x) { return { promotionId: x.promotionId }; }],
        /* CP-VersionedInput — commands/versioning.js (Publish* cho recipe/cost/
           packaging/prepYield/payTerms/config/iceCogs). MỘT map chung cho CẢ 7
           domain: `compaction/versioned-input.js#publish()` đã trả về đúng
           {kind, subjectId, versionId} mà path `versionedInput` cần (khai sẵn
           ở `canonical-paths.js`, trước đây không producer nào dùng tới) —
           không cần 7 entry riêng theo từng kind. */
        versionedInput: ['versionedInput', function (x) {
          return { kind: x.kind, subjectId: x.subjectId, versionId: x.versionId };
        }],
        /* L9 — commands/loyalty.js (tích/hoàn điểm gọi qua domain-events dispatch). */
        loyaltyLedgerEntry: ['loyaltyLedger', function (x) { return { entryId: x.entryId }; }],
        /* L9 — commands/alerts.js (RaiseAlert gọi qua domain-events dispatch). */
        alert: ['alert', function (x) { return { alertId: x.alertId }; }]
      };
      var m = map[r.type];
      if (!m) {
        /* Loại bản ghi chưa khai path là lỗi cấu hình, không phải chuyện bỏ qua
           được — ghi vào hư không là cách dữ liệu biến mất im lặng. */
        errors.push('domainRecord loại "' + r.type + '" chưa khai path canonical');
        return;
      }
      add(m[0], m[1](r.record), r.record);
    });

    (plan.traceChanges || []).forEach(function (t, i) {
      add('traceDependency', { id: (plan.operationId || 'op') + '.' + i }, t);
    });

    /* Purge chỉ nhận path canonical CỤ THỂ từ compaction safety gate. Chặn
       snapshot ở cả domain lẫn adapter để invariant C3 không phụ thuộc một lớp. */
    (plan.rawRemovals || []).forEach(function (r) {
      var prefix = 'orgs/' + ctx.organizationId + '/stores/' + ctx.storeId + '/';
      if (!r || (r.kind !== paths.RTDB && r.kind !== paths.FIRESTORE) ||
          typeof r.path !== 'string' || r.path.indexOf(prefix) !== 0 ||
          /(^|\/)snapshots\//.test(r.path)) {
        errors.push('rawRemoval không phải path canonical an toàn');
        return;
      }
      writes.push({ kind: r.kind, path: r.path, op: 'remove', data: null });
    });

    if (plan.audit) {
      add('auditLog', { id: plan.operationId }, plan.audit);
    }

    if (errors.length) {
      return R.err('VALIDATION', 'không dịch được plan thành path: ' + errors.join('; '), { errors: errors });
    }
    return R.ok(writes);
  }

  /**
   * @param deps.transactionRunner  (fn) => Promise — chạy fn trong 1 transaction
   * @param deps.operationStore     kho operation để claim/hoàn tất
   */
  function createCommitter(deps) {
    deps = deps || {};
    var runner = deps.transactionRunner;
    if (typeof runner !== 'function') {
      throw new Error('[atomic-commit] cần transactionRunner — module này không tự import Firebase SDK');
    }

    /**
     * Ghi cả plan trong một transaction.
     *
     * Bản ghi `operations/{operationId}` được ghi TRONG CÙNG transaction với dữ
     * liệu — nếu tách ra, sẽ có cửa sổ mà dữ liệu đã ghi nhưng operation chưa
     * đánh dấu hoàn tất, và lần chạy lại sẽ ghi đúp.
     */
    function commit(plan, ctx) {
      if (!plan || !plan.operationId) {
        return Promise.resolve(R.err('VALIDATION', 'plan thiếu operationId'));
      }
      var w = planToWrites(plan, ctx);
      if (R.isErr(w)) return Promise.resolve(w);
      var writes = w.value;

      var opPath = paths.path('operation', ctx, { operationId: plan.operationId });
      if (R.isErr(opPath)) return Promise.resolve(opPath);

      writes.push({
        kind: opPath.value.kind,
        path: opPath.value.path,
        op: 'set',
        data: {
          operationId: plan.operationId,
          status: opState.STATES.COMPLETED,
          command: plan.audit ? plan.audit.command : null,
          actorId: plan.audit ? plan.audit.actorId : null,
          storeId: ctx.storeId,
          businessDate: ctx.businessDate,
          completedAt: ctx.clock.now(),
          writeCount: writes.length
        }
      });

      return Promise.resolve()
        .then(function () { return runner(writes); })
        .then(function () {
          return R.ok({
            operationId: plan.operationId,
            writeCount: writes.length,
            paths: writes.map(function (x) { return x.path; })
          });
        })
        .catch(function (e) {
          /* Transaction hỏng = KHÔNG có gì được ghi. Không cần rollback thủ
             công, nhưng phải nói rõ là thử lại được hay cần người xử lý. */
          var retryable = !!(e && e.retryable);
          return R.err(retryable ? 'RETRYABLE' : 'MANUAL_REVIEW',
            'ghi nguyên tử thất bại, KHÔNG có thay đổi nào được ghi: ' +
            (e && e.message ? e.message : e));
        });
    }

    return { commit: commit, planToWrites: planToWrites };
  }

  /**
   * Transaction runner in-memory — cho test và cho chế độ shadow/simulate,
   * đúng giai đoạn READ-ONLY hiện tại (hệ thống cũ vẫn chạy production).
   */
  function createInMemoryRunner(opts) {
    opts = opts || {};
    var store = Object.create(null);
    var committed = [];
    var failNext = 0;

    function runner(writes) {
      if (failNext > 0) {
        failNext -= 1;
        var e = new Error(opts.failMessage || 'transaction hỏng');
        e.retryable = !!opts.failRetryable;
        throw e;
      }
      /* Áp tất cả hoặc không áp gì — dựng bản nháp rồi mới gán. */
      var draft = Object.assign(Object.create(null), store);
      writes.forEach(function (w) {
        if (w.op === 'remove') delete draft[w.path];
        else draft[w.path] = w.data;
      });
      store = draft;
      committed.push(writes);
      return true;
    }

    return {
      runner: runner,
      failOnce: function () { failNext += 1; },
      read: function (path) { return store[path]; },
      keys: function () { return Object.keys(store).sort(); },
      commitCount: function () { return committed.length; }
    };
  }

  return {
    planToWrites: planToWrites,
    createCommitter: createCommitter,
    createInMemoryRunner: createInMemoryRunner
  };
});
