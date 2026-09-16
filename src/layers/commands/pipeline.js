/**
 * Command pipeline — đường ghi DUY NHẤT của cả POS lẫn QUANLY.
 *
 * Contract: GIEO-SYSTEM-REBUILD-PLAN.md §2/§12, FIFO-CORE-ARCHITECTURE-V2.md §7.
 *
 *   VALIDATE → AUTHORIZE → READ CANONICAL → CALCULATE → MUTATION PLAN
 *            → IDEMPOTENCY → ENGINE → LEDGER → PROJECTION → AUDIT → VERIFY
 *
 * ────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCY — legacy có 3 lớp bảo vệ ở đường bán hàng chính
 * (`applySalesConsumptionPOS`) nhưng 6 đường khác thiếu ít nhất 1 lớp:
 *   #6  not-empty        — busy-lock đặt SAU await
 *   #13 stock count      — dùng .add() sinh id ngẫu nhiên
 *   #21 BTP waste        — không catch/rollback sau khi đã allocate
 *   #22 start prep batch — thiếu txId cố định
 *   #23 add-on tăng      — thiếu txId cố định
 *   #24 found-lost       — bước ADJUSTMENT không có txId
 *
 * Nguyên nhân gốc: mỗi hàm TỰ CHẾ lớp chống-đúp riêng. Ở đây chỉ có MỘT chỗ
 * implement, và command không có cách nào tự chế lớp khác — nó chỉ mô tả việc
 * cần làm, pipeline lo phần còn lại.
 *
 * §10b.3 bổ sung tường minh: idempotency áp cho MỌI command, kể cả Approval
 * (ApproveStockCount, ApproveLostContainer, ApproveExpense) — legacy để approval
 * không kiểm tra status trước khi apply, nên 2 người duyệt cùng lúc cộng đúp.
 * ────────────────────────────────────────────────────────────────────────
 */
GIEO.define('commands/pipeline', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'shared-kernel/operation-state',
  'store-context/access'
], function (ids, R, opState, access) {
  'use strict';

  var STATES = opState.STATES;

  /**
   * Kho operation. Đây là port — bản in-memory dùng cho test và shadow;
   * persistence-firebase implement bản thật với compare-and-swap.
   */
  function createInMemoryOperationStore() {
    var ops = Object.create(null);
    return {
      get: function (operationId) {
        return R.ok(ops[operationId] || null);
      },
      /** Giành quyền chạy. Trả CONFLICT nếu đã có người giữ. */
      claim: function (record) {
        var existing = ops[record.operationId];
        if (existing) {
          if (existing.status === STATES.COMPLETED) {
            return R.err('CONFLICT', 'operation đã hoàn tất', { existing: existing });
          }
          if (existing.status === STATES.RUNNING) {
            return R.err('CONFLICT', 'operation đang chạy ở nơi khác', { existing: existing });
          }
        }
        ops[record.operationId] = record;
        return R.ok(record);
      },
      update: function (operationId, patch) {
        if (!ops[operationId]) return R.err('NOT_FOUND', 'không có operation ' + operationId);
        ops[operationId] = Object.assign({}, ops[operationId], patch);
        return R.ok(ops[operationId]);
      },
      all: function () { return Object.keys(ops).map(function (k) { return ops[k]; }); }
    };
  }

  /**
   * Khai báo 1 command. Đăng ký quyền LUÔN tại đây, nên không thể có command
   * chạy được mà quên khai quyền (mặc định đóng — access.authorize từ chối
   * command lạ).
   *
   * @param spec.name
   * @param spec.authority, spec.mutates, spec.sources, spec.crossStore  → access
   * @param spec.operationId  (input, ctx) => string  — BẮT BUỘC xác định
   * @param spec.requiresOpenDay  mặc định = mutates
   * @param spec.validate     (input, ctx) => Result
   * @param spec.execute      (input, ctx) => Result<MutationPlan>
   */
  function defineCommand(spec) {
    if (!spec || !spec.name) throw new Error('[pipeline] command cần name');
    if (typeof spec.operationId !== 'function') {
      throw new Error('[pipeline] command "' + spec.name + '" phải khai hàm operationId — ' +
        'id ngẫu nhiên làm sập idempotency (bug #13/#21/#22/#23/#24)');
    }
    if (typeof spec.execute !== 'function') {
      throw new Error('[pipeline] command "' + spec.name + '" cần execute');
    }

    access.registerCommand(spec.name, {
      authority: spec.authority,
      mutates: spec.mutates,
      sources: spec.sources,
      crossStore: spec.crossStore
    });

    return {
      name: spec.name,
      mutates: spec.mutates,
      requiresOpenDay: spec.requiresOpenDay === undefined ? spec.mutates : spec.requiresOpenDay,
      operationId: spec.operationId,
      validate: spec.validate || function () { return R.ok(true); },
      execute: spec.execute
    };
  }

  /**
   * Chạy 1 command qua đủ pipeline.
   *
   * `deps.operationStore` bắt buộc. `deps.commit` là ranh giới ghi nguyên tử —
   * nhận MutationPlan, ghi tất cả hoặc không ghi gì. Không có commit thì chạy ở
   * chế độ DRY-RUN (dùng cho shadow/simulate, đúng giai đoạn READ-ONLY hiện tại).
   */
  function run(command, input, ctx, deps) {
    deps = deps || {};
    var store = deps.operationStore;
    if (!store) return R.err('VALIDATION', 'pipeline cần operationStore');

    /* 1. VALIDATE */
    var v = command.validate(input, ctx);
    if (R.isErr(v)) return v;

    /* 2. AUTHORIZE — ở tầng Command/Domain, không phải UI (invariant #17) */
    var auth = ctx.authorize(command.name, input.storeId || ctx.storeId);
    if (R.isErr(auth)) return auth;

    /* 3. GATE ngày làm việc — ngày đã chốt thì khoá thao tác vận hành */
    if (command.requiresOpenDay) {
      var day = ctx.assertOperable(command.name);
      if (R.isErr(day)) return day;
    }

    /* 4. IDEMPOTENCY — id xác định, không bao giờ ngẫu nhiên */
    var operationId;
    try {
      operationId = command.operationId(input, ctx);
    } catch (e) {
      return R.err('VALIDATION', 'không dựng được operationId: ' + e.message);
    }
    if (!ids.isId(operationId, 'operation')) {
      return R.err('VALIDATION', 'operationId phải là id loại operation, nhận: ' + operationId);
    }

    var prior = store.get(operationId);
    if (R.isErr(prior)) return prior;
    if (prior.value && prior.value.status === STATES.COMPLETED) {
      /* Chạy lại là NO-OP trả kết quả cũ — không phải làm lại. */
      return R.ok({
        operationId: operationId,
        status: STATES.COMPLETED,
        replayed: true,
        result: prior.value.result
      });
    }

    var claim = store.claim({
      operationId: operationId,
      command: command.name,
      status: STATES.RUNNING,
      actorId: ctx.actor.actorId,
      storeId: ctx.storeId,
      businessDate: ctx.businessDate,
      startedAt: ctx.clock.now(),
      result: null
    });
    if (R.isErr(claim)) return claim;

    /* 5. CALCULATE + MUTATION PLAN */
    var planR;
    try {
      planR = command.execute(input, ctx);
    } catch (e) {
      store.update(operationId, { status: STATES.FAILED_MANUAL_REVIEW, error: e.message });
      return R.err('MANUAL_REVIEW', 'command "' + command.name + '" ném lỗi: ' + e.message);
    }
    if (R.isErr(planR)) {
      /* Chưa chạm vào state vật lý nên thất bại ở đây là thử lại được. */
      store.update(operationId, {
        status: R.isRetryable(planR) ? STATES.FAILED_RETRYABLE : STATES.FAILED_MANUAL_REVIEW,
        error: planR.error.message
      });
      return planR;
    }

    var plan = planR.value;
    plan.operationId = operationId;
    /* 6. AUDIT — gắn sẵn, không để command tự nhớ (§25) */
    plan.audit = Object.assign(ctx.auditBase(operationId), {
      command: command.name,
      reason: input.reason || null
    }, plan.audit || {});

    /* 7. COMMIT — ranh giới nguyên tử */
    if (!deps.commit) {
      store.update(operationId, { status: STATES.COMPLETED, result: plan, dryRun: true });
      return R.ok({
        operationId: operationId,
        status: STATES.COMPLETED,
        /* Giữ cùng hình dạng với đường commit thật — caller không phải phân biệt
           dry-run hay không để biết đây có phải lần chạy đầu. */
        replayed: false,
        dryRun: true,
        plan: plan
      });
    }

    var committed = deps.commit(plan, ctx);
    if (R.isErr(committed)) {
      /* Ghi hỏng sau khi đã tính toán: KHÔNG nuốt lỗi (invariant #11).
         Rollback nằm TRONG cùng command, không phải bước riêng dễ quên. */
      var rolledBack = null;
      if (deps.rollback) rolledBack = deps.rollback(plan, ctx);
      store.update(operationId, {
        status: R.isRetryable(committed) ? STATES.FAILED_RETRYABLE : STATES.FAILED_MANUAL_REVIEW,
        error: committed.error.message,
        rolledBack: rolledBack ? R.isOk(rolledBack) : false
      });
      return committed;
    }

    store.update(operationId, { status: STATES.COMPLETED, result: committed.value });
    return R.ok({
      operationId: operationId,
      status: STATES.COMPLETED,
      replayed: false,
      plan: plan,
      result: committed.value
    });
  }

  /**
   * Chạy command RỒI GHI THẬT.
   *
   * `run()` ở trên cố ý đồng bộ: nó dựng MutationPlan, và dựng plan là việc
   * thuần tính toán. Nhưng ghi Firebase thì bất đồng bộ. Trộn hai thứ vào một
   * hàm lúc trả Promise lúc trả giá trị là API dễ dùng sai, nên tách hẳn:
   *
   *   run()           → dry-run, đồng bộ, dùng cho shadow/simulate và test
   *   runAndCommit()  → Promise, dùng khi đã có adapter ghi thật
   *
   * Giai đoạn hiện tại hệ thống chạy READ-ONLY nên đường dùng chủ yếu vẫn là
   * run(); runAndCommit() có sẵn để cutover không phải sửa lại pipeline.
   */
  function runAndCommit(command, input, ctx, deps) {
    deps = deps || {};
    if (typeof deps.commit !== 'function') {
      return Promise.resolve(R.err('VALIDATION', 'runAndCommit cần deps.commit'));
    }

    /* Chạy pha dựng plan ở chế độ dry-run để tái dùng nguyên vẹn mọi chốt chặn
       (validate → authorize → gate ngày → idempotency) mà không nhân bản logic. */
    var planned = run(command, input, ctx, { operationStore: deps.operationStore });
    if (R.isErr(planned)) return Promise.resolve(planned);
    if (planned.value.replayed) return Promise.resolve(planned.value);

    var plan = planned.value.plan;
    return Promise.resolve()
      .then(function () { return deps.commit(plan, ctx); })
      .then(function (committed) {
        if (R.isErr(committed)) {
          var rolledBack = null;
          if (deps.rollback) rolledBack = deps.rollback(plan, ctx);
          deps.operationStore.update(plan.operationId, {
            status: R.isRetryable(committed) ? STATES.FAILED_RETRYABLE : STATES.FAILED_MANUAL_REVIEW,
            error: committed.error.message,
            rolledBack: rolledBack ? R.isOk(rolledBack) : false
          });
          return committed;
        }
        deps.operationStore.update(plan.operationId, {
          status: STATES.COMPLETED, result: committed.value, dryRun: false
        });
        return R.ok({
          operationId: plan.operationId,
          status: STATES.COMPLETED,
          replayed: false,
          plan: plan,
          result: committed.value
        });
      });
  }

  /**
   * MutationPlan rỗng — command bồi vào. Một plan mang TẤT CẢ thay đổi của một
   * operation (vật chất + ledger + projection + trace), để commit được nguyên tử.
   */
  function emptyPlan() {
    return {
      operationId: null,
      unitChanges: [],
      ledgerEntries: [],
      projectionRecomputes: [],
      traceChanges: [],
      domainRecords: [],
      events: [],
      audit: null
    };
  }

  return {
    createInMemoryOperationStore: createInMemoryOperationStore,
    defineCommand: defineCommand,
    run: run,
    runAndCommit: runAndCommit,
    emptyPlan: emptyPlan
  };
});
