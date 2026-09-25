/**
 * Adapter GHI THẬT — `transactionRunner` cho `atomic-commit`.
 *
 * Một điều phải nói thẳng vì nó quyết định cả thiết kế: **Firestore và RTDB
 * không nằm chung được một transaction.** Không có API nào làm việc đó. Vờ như
 * có sẽ tạo ra một lời hứa nguyên tử mà hệ thống không giữ nổi.
 *
 * Nên ranh giới nguyên tử ở đây là:
 *
 *     Firestore (CANONICAL)  — một WriteBatch, vào trọn hoặc không vào gì.
 *     RTDB (LIVE/HOT LAYER)  — chiếu lại SAU khi batch thành công.
 *
 * Điều này KHÔNG làm yếu bảo đảm dữ liệu, vì RTDB vốn là projection: nó suy ra
 * được từ Firestore. Nếu bước chiếu hỏng, nguồn thật vẫn đúng và
 * `fifo-core/reconciliation.detectDrift` phát hiện được lệch. Ngược lại — ghi
 * RTDB trước rồi Firestore hỏng — mới là thứ không sửa được, nên thứ tự này là
 * bắt buộc, không phải tuỳ chọn.
 *
 * Lỗi ở bước chiếu KHÔNG bị nuốt: nó được trả về trong kết quả để tầng trên
 * cảnh báo. Đây đúng là chỗ legacy `.catch(console.warn)` và sinh ra bug #15.
 */
GIEO.define('persistence-firebase/firestore-runner', [
  'shared-kernel/result',
  'persistence-firebase/canonical-paths'
], function (R, paths) {
  'use strict';

  /* Trần của một WriteBatch Firestore. Vượt trần thì batch không còn nguyên tử,
     nên TỪ CHỐI thay vì tự cắt nhỏ — cắt nhỏ là im lặng đánh mất bảo đảm mà
     tầng trên đang tin là có. */
  var BATCH_LIMIT = 500;

  function splitPath(full) {
    /* Firestore cần cặp collection/doc xen kẽ. Path canonical luôn có số đoạn
       CHẴN; số lẻ nghĩa là trỏ vào một collection, không phải một document. */
    var parts = full.split('/').filter(Boolean);
    if (parts.length % 2 !== 0) return null;
    return parts;
  }

  /**
   * @param spec.firestore  handle Firestore đã khởi tạo
   * @param spec.rtdb       handle RTDB đã khởi tạo
   */
  function create(spec) {
    spec = spec || {};
    var firestore = spec.firestore;
    var rtdb = spec.rtdb;
    if (!firestore || typeof firestore.batch !== 'function') {
      throw new Error('[firestore-runner] cần handle Firestore có batch()');
    }
    if (!rtdb || typeof rtdb.ref !== 'function') {
      throw new Error('[firestore-runner] cần handle RTDB có ref()');
    }

    /* Lỗi chiếu RTDB được giữ lại ở đây để tầng trên đọc — không nuốt, không
       chỉ log ra console rồi thôi. */
    var projectionFailures = [];

    function docRef(path) {
      var parts = splitPath(path);
      if (!parts) return null;
      var ref = firestore.collection(parts[0]).doc(parts[1]);
      for (var i = 2; i < parts.length; i += 2) {
        ref = ref.collection(parts[i]).doc(parts[i + 1]);
      }
      return ref;
    }

    function runner(writes) {
      var fsWrites = writes.filter(function (w) { return w.kind === paths.FIRESTORE; });
      var rtWrites = writes.filter(function (w) { return w.kind === paths.RTDB; });

      if (fsWrites.length > BATCH_LIMIT) {
        var tooBig = new Error(
          'plan có ' + fsWrites.length + ' thao tác Firestore, vượt trần ' + BATCH_LIMIT +
          ' của một batch nguyên tử — TỪ CHỐI thay vì cắt nhỏ và mất tính nguyên tử');
        tooBig.retryable = false;
        throw tooBig;
      }

      var batch = firestore.batch();
      for (var i = 0; i < fsWrites.length; i++) {
        var w = fsWrites[i];
        var ref = docRef(w.path);
        if (!ref) {
          var bad = new Error('path canonical không trỏ tới document: ' + w.path);
          bad.retryable = false;
          throw bad;
        }
        if (w.op === 'remove') batch.delete(ref);
        else batch.set(ref, w.data);
      }

      return Promise.resolve()
        .then(function () { return fsWrites.length ? batch.commit() : null; })
        .then(function () {
          /* Tới đây CANONICAL đã an toàn. Bước dưới chỉ chiếu lại tầng nóng. */
          return Promise.all(rtWrites.map(function (rw) {
            return Promise.resolve()
              .then(function () {
                var ref = rtdb.ref(rw.path);
                return rw.op === 'remove' ? ref.remove() : ref.set(rw.data);
              })
              .catch(function (e) {
                /* Không ném lên: ném sẽ làm tầng trên tưởng cả transaction hỏng
                   và thử lại, trong khi Firestore đã ghi xong. */
                projectionFailures.push({
                  path: rw.path, message: e && e.message ? e.message : String(e)
                });
              });
          }));
        })
        .then(function () {
          return {
            firestoreWrites: fsWrites.length,
            rtdbWrites: rtWrites.length,
            projectionFailures: projectionFailures.slice()
          };
        });
    }

    return {
      runner: runner,
      /** Lệch tầng nóng chưa chiếu được — tầng trên đọc để cảnh báo. */
      projectionFailures: function () { return projectionFailures.slice(); },
      clearProjectionFailures: function () { projectionFailures = []; }
    };
  }

  return { BATCH_LIMIT: BATCH_LIMIT, create: create };
});
