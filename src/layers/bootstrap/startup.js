/**
 * Khối KHỞI ĐỘNG — nơi ba mảnh được cắm điện với nhau.
 *
 *   Firebase  →  runtime (quyền ghi do cutover quyết)
 *             →  tiếp nhận hệ cũ, ĐÚNG MỘT LẦN, tại mốc cutover
 *
 * Ba luật được cài ở đây, không nằm ở lời dặn:
 *
 *   1. Quyền ghi KHÔNG hardcode. Nó đến từ trạng thái cutover đọc trong kho.
 *      Trạng thái nằm trong bộ nhớ tab thì mọi bảo đảm của P13 chỉ sống tới
 *      lần F5 đầu tiên.
 *
 *   2. Tiếp nhận chạy đúng một lần. Kiểm bằng bản ghi operation đã tồn tại
 *      chưa, không bằng một cờ trong localStorage — đổi máy là quên.
 *
 *   3. Chưa tới mốc cutover thì KHÔNG tiếp nhận. Tiếp nhận sớm nghĩa là chụp
 *      tồn đầu sai, và sai từ con số gốc thì mọi thứ sau đó sai theo.
 */
GIEO.define('bootstrap/startup', [
  'shared-kernel/result',
  'bootstrap/firebase-app',
  'bootstrap/firebase-read-client',
  'bootstrap/pin-auth',
  'bootstrap/legacy-data-source',
  'bootstrap/canonical-data-source',
  'bootstrap/legacy-takeover',
  'bootstrap/cutover',
  'bootstrap/runtime',
  'legacy-firebase-adapter/read-port',
  'persistence-firebase/canonical-paths',
  'persistence-firebase/canonical-read-port',
  'persistence-firebase/firestore-runner',
  'persistence-firebase/atomic-commit'
], function (R, fbApp, readClientLib, pinAuth, legacyDataSourceLib, canonicalDataSourceLib, takeoverLib,
             cutoverLib, runtimeLib, readPortLib, paths, canonicalReadPortLib, runnerLib, commitLib) {
  'use strict';

  function docPath(name, ctx, args) {
    var p = paths.path(name, ctx, args);
    return R.isErr(p) ? null : p.value.path;
  }

  /**
   * Ghép 2 dataSource thành 1: cả `forQuery` lẫn `forCommand` đi qua canonical
   * TRƯỚC (cấp `deps.units`/`deps.versionRegistry` thật cho RecordSale, hoặc
   * `entries` ledger thật cho GetLedgerEntriesForReference — xem
   * `canonical-data-source.js`) RỒI mới qua legacy. An toàn vì cả hai hàm
   * canonical đều pass-through (R.ok(input) không đổi gì) với MỌI tên nó chưa
   * biết, nên chuỗi này không đổi hành vi của bất kỳ query/command nào khác —
   * chỉ cộng thêm đúng những chỗ nó cố ý chừa trống.
   *
   * Với forQuery, legacy KHÔNG còn là pass-through thuần (nó có NOT_WIRED và
   * các case dịch riêng) — nhưng từng case dịch riêng (GetRevenue/GetCOGS/
   * GetBillsForRange/GetLedgerEntriesForReference) đều tự kiểm tra
   * "đã có input canonical chưa" (`!input.bills`/`!input.entries`) trước khi
   * dịch, nên nếu canonical vừa cấp xong thì legacy thấy đã có sẵn và đi
   * thẳng — không dịch chồng, không ghi đè.
   */
  function composeDataSource(legacy, canonical) {
    function chain(canonicalFn, legacyFn) {
      return function (name, input) {
        return Promise.resolve(canonicalFn(name, input)).then(function (out) {
          if (R.isErr(out)) return out;
          return legacyFn(name, out.value);
        });
      };
    }
    return {
      forQuery: chain(canonical.forQuery, legacy.forQuery),
      forCommand: chain(canonical.forCommand, legacy.forCommand),
      watchQuery: legacy.watchQuery
    };
  }

  /** Đọc một document canonical bằng handle Firestore thô. */
  function readDoc(firestore, fullPath) {
    var parts = fullPath.split('/').filter(Boolean);
    if (parts.length % 2 !== 0) return Promise.resolve(null);
    var ref = firestore.collection(parts[0]).doc(parts[1]);
    for (var i = 2; i < parts.length; i += 2) ref = ref.collection(parts[i]).doc(parts[i + 1]);
    return Promise.resolve(ref.get())
      .then(function (snap) {
        if (!snap || snap.exists === false) return null;
        return typeof snap.data === 'function' ? snap.data() : null;
      })
      .catch(function () { return null; });
  }

  /**
   * @param spec.firebase    {config, account} từ shell
   * @param spec.context     StoreContext (hoặc hàm trả về)
   * @param spec.cutoverDate 'YYYY-MM-DD'
   * @param spec.today       'YYYY-MM-DD' — ngày vận hành hiện tại, TRUYỀN VÀO
   *                         chứ không đọc đồng hồ máy (xem `store-context`)
   * @param spec.sdk         tiêm để test không cần mạng
   */
  function start(spec) {
    spec = spec || {};
    var ctxOf = typeof spec.context === 'function' ? spec.context : function () { return spec.context; };

    return fbApp.init({ config: spec.firebase && spec.firebase.config,
                        account: spec.firebase && spec.firebase.account,
                        sdk: spec.sdk })
      .then(function (fb) {
        if (R.isErr(fb)) return fb;

        var handles = fb.value;
        var readClient = readClientLib.create({ rtdb: handles.rtdb, firestore: handles.firestore });
        var reader = readPortLib.createReader(readClient);
        var canonicalReader = canonicalReadPortLib.createReader(handles.firestore);
        var writeRunner = runnerLib.create({ firestore: handles.firestore, rtdb: handles.rtdb });
        var committer = commitLib.createCommitter({ transactionRunner: writeRunner.runner });

        var ctx = ctxOf();
        if (!ctx) return R.err('NOT_FOUND', 'chưa có StoreContext để khởi động');

        var cutover = cutoverLib.createCutover({ rollbackWindowMs: spec.rollbackWindowMs });
        var statePath = docPath('cutoverState', ctx, {});

        return readDoc(handles.firestore, statePath).then(function (saved) {
          var h = cutover.hydrate(saved);
          if (R.isErr(h)) return h;

          var runtime = runtimeLib.createRuntime({
            /* KHÔNG truyền mode: quyền ghi do cutover quyết, và runtime từ chối
               nhận cả hai. */
            cutover: cutover,
            context: ctxOf,
            dataSource: composeDataSource(
              legacyDataSourceLib.create(reader, { storeId: ctx.storeId }),
              canonicalDataSourceLib.create(canonicalReader, { organizationId: ctx.organizationId })
            ),
            commit: function (plan, commitCtx) { return committer.commit(plan, commitCtx); },
            device: spec.device
          });

          var result = {
            runtime: runtime,
            cutover: cutover,
            reader: reader,
            committer: committer,
            writeRunner: writeRunner,
            takeover: null
          };

          /* Chưa tới ngày cutover thì dừng ở đây — chạy READ_ONLY như thường. */
          if (!spec.cutoverDate || !spec.today || spec.today < spec.cutoverDate) {
            result.takeover = { ran: false, why: 'chưa tới mốc cutover' };
            return R.ok(result);
          }

          return maybeTakeover(spec, ctx, handles, reader, committer).then(function (t) {
            if (R.isErr(t)) return t;
            result.takeover = t.value;
            return R.ok(result);
          });
        });
      });
  }

  /**
   * Pha trước runtime: đăng nhập Firebase dùng chung, chỉ đọc employee/PIN rồi
   * dựng actor + context. Không cần biết URL bí mật hay tạo business day giả.
   */
  function prepareAuth(spec) {
    spec = spec || {};
    return fbApp.init({ config: spec.firebase && spec.firebase.config,
                        account: spec.firebase && spec.firebase.account,
                        sdk: spec.sdk })
      .then(function (fb) {
        if (R.isErr(fb)) return fb;
        var readClient = readClientLib.create({
          rtdb: fb.value.rtdb, firestore: fb.value.firestore
        });
        var reader = readPortLib.createReader(readClient);
        return reader.loadEmployees({ storeId: spec.storeId }).then(function (employees) {
          if (R.isErr(employees)) return employees;
          return R.ok({
            employees: employees.value,
            authenticate: function (pin) {
              return pinAuth.authenticate({
                pin: pin,
                employees: employees.value,
                organizationId: spec.organizationId,
                storeId: spec.storeId,
                source: spec.source,
                businessDay: spec.businessDay || null,
                clock: spec.clock,
                deviceId: spec.deviceId,
                appInstanceId: spec.appInstanceId
              });
            }
          });
        });
      });
  }

  /** Tiếp nhận nếu chưa từng chạy. Idempotent theo bản ghi operation trong kho. */
  function maybeTakeover(spec, ctx, handles, reader, committer) {
    var opId = takeoverLib.operationIdFor(spec.cutoverDate);
    var opPath = docPath('operation', ctx, { operationId: opId });

    return readDoc(handles.firestore, opPath).then(function (existing) {
      if (existing) {
        /* Đã tiếp nhận rồi. Chạy lại sẽ ghi đè tồn đầu bằng số của hệ cũ HÔM
           NAY, xoá sạch mọi giao dịch hệ mới đã ghi từ lúc cutover. */
        return R.ok({ ran: false, why: 'đã tiếp nhận trước đó', operationId: opId });
      }
      return takeoverLib.run({
        reader: reader,
        cutoverDate: spec.cutoverDate,
        storeId: ctx.storeId,
        actorId: spec.actorId || (ctx.actor && ctx.actor.actorId)
      }).then(function (built) {
        if (R.isErr(built)) return built;
        return committer.commit(built.value.plan, ctx).then(function (written) {
          if (R.isErr(written)) return written;
          return R.ok({
            ran: true, operationId: opId,
            summary: built.value.summary, skipped: built.value.skipped,
            writeCount: written.value.writeCount
          });
        });
      });
    });
  }

  return { prepareAuth: prepareAuth, start: start };
});
