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
  'bootstrap/legacy-data-source',
  'bootstrap/legacy-takeover',
  'bootstrap/cutover',
  'bootstrap/runtime',
  'legacy-firebase-adapter/read-port',
  'persistence-firebase/canonical-paths',
  'persistence-firebase/firestore-runner',
  'persistence-firebase/atomic-commit'
], function (R, fbApp, readClientLib, dataSourceLib, takeoverLib, cutoverLib,
             runtimeLib, readPortLib, paths, runnerLib, commitLib) {
  'use strict';

  function docPath(name, ctx, args) {
    var p = paths.path(name, ctx, args);
    return R.isErr(p) ? null : p.value.path;
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
            dataSource: dataSourceLib.create(reader, { storeId: ctx.storeId }),
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

  return { start: start };
});
