/**
 * Đọc CANONICAL mới — port cho cái mà `bootstrap/legacy-data-source.js` cố ý
 * KHÔNG làm: cấp `deps.units`/`deps.versionRegistry` cho command trước khi ghi.
 *
 * `legacy-data-source.js#forCommand` là pass-through VĨNH VIỄN theo thiết kế
 * (đọc comment ở đó) — command đã phải mang canonical input từ controller/
 * read-layer khi tới đó. Port này là nguồn đọc đứng SAU controller, TRƯỚC
 * pipeline, cho đúng đoạn "read-layer" của câu đó: query path canonical mới
 * (`orgs/{org}/stores/{store}/...`), CHỈ ĐỌC, không quyết định nghiệp vụ.
 *
 * Vì sao không dùng lại `bootstrap/firebase-read-client.js`: client đó
 * `firestore.collection(name)` coi `name` là collection TOP-LEVEL — đúng cho
 * schema legacy (`legacy-firebase-adapter/legacy-paths.js`), sai cho path
 * canonical lồng 4+ đoạn dưới `orgs/{org}/stores/{store}`. Cần một client biết
 * đi qua alternating collection/doc như `docRef()` của `firestore-runner.js`,
 * chỉ khác là dừng ở COLLECTION cuối để `.get()` nhiều document, không phải 1.
 */
GIEO.define('persistence-firebase/canonical-read-port', [
  'shared-kernel/result',
  'persistence-firebase/canonical-paths'
], function (R, paths) {
  'use strict';

  function createReader(firestore) {
    if (!firestore || typeof firestore.collection !== 'function') {
      throw new Error('[canonical-read-port] cần Firestore handle');
    }

    function collectionRef(fullPath) {
      var parts = fullPath.split('/').filter(Boolean);
      if (parts.length % 2 !== 1) return null;
      var ref = firestore.collection(parts[0]);
      for (var i = 1; i < parts.length; i += 2) {
        ref = ref.doc(parts[i]).collection(parts[i + 1]);
      }
      return ref;
    }

    function getAll(collPath, whereClauses) {
      var ref = collectionRef(collPath);
      if (!ref) {
        return Promise.resolve(R.err('VALIDATION', 'path collection canonical không hợp lệ: ' + collPath));
      }
      (whereClauses || []).forEach(function (w) { ref = ref.where(w.field, w.op, w.value); });
      return Promise.resolve()
        .then(function () { return ref.get(); })
        .then(function (snap) {
          var out = [];
          if (snap && typeof snap.forEach === 'function') {
            snap.forEach(function (doc) { out.push(doc.data()); });
          }
          return R.ok(out);
        })
        .catch(function (e) {
          return R.err('RETRYABLE', 'đọc canonical thất bại: ' + (e && e.message ? e.message : e));
        });
    }

    /** Toàn bộ Unit hiện có của một itemId — nguồn cho `fifo-core/allocation`. */
    function loadUnitsForItem(ctx, itemId) {
      var collP = paths.collectionPath('unit', ctx, { unitId: '_' });
      if (R.isErr(collP)) return Promise.resolve(collP);
      return getAll(collP.value.path, [{ field: 'itemId', op: '==', value: itemId }]);
    }

    /**
     * Mọi version đã publish của một (kind, subjectId) — nạp thẳng vào
     * `compaction/versioned-input#createRegistry().hydrate()`.
     *
     * `recipe` đọc từ path RIÊNG `recipeVersion` (`recipes/{id}/versions`) vì
     * đó là path DUY NHẤT `persistence-firebase/atomic-commit.js` đã khai cho
     * domainRecord loại `recipeVersion` — path `versionedInput` chung chưa có
     * writer nào dùng cho recipe. Các kind khác (packaging/iceCogs/cost) chưa
     * có domainRecord type nào khai ở atomic-commit.js — đọc từ `versionedInput`
     * chung vì đó là path DUY NHẤT đã định nghĩa cho chúng, dù hiện chưa ai ghi
     * vào (mảng rỗng trả về đúng là "chưa có version nào", không phải lỗi —
     * `buildRequirements`/`computeCogs` đã có sẵn đường degrade gap/null cho
     * trường hợp này, xem `commands/sales.js`).
     */
    function loadVersions(ctx, kind, subjectId) {
      if (kind === 'recipe') {
        var rp = paths.collectionPath('recipeVersion', ctx, { recipeId: subjectId, versionId: '_' });
        if (R.isErr(rp)) return Promise.resolve(rp);
        return getAll(rp.value.path);
      }
      var vp = paths.collectionPath('versionedInput', ctx, { kind: kind, subjectId: subjectId, versionId: '_' });
      if (R.isErr(vp)) return Promise.resolve(vp);
      return getAll(vp.value.path);
    }

    return { loadUnitsForItem: loadUnitsForItem, loadVersions: loadVersions };
  }

  return { createReader: createReader };
});
