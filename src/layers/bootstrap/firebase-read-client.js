/** Firebase compat/modular bridge chỉ đọc. Nhận handle đã khởi tạo, không chứa config/credential. */
GIEO.define('bootstrap/firebase-read-client', ['shared-kernel/result'], function (R) {
  'use strict';

  function create(spec) {
    spec = spec || {};
    var rtdb = spec.rtdb;
    var firestore = spec.firestore;

    function rtdbGet(path) {
      if (!rtdb || typeof rtdb.ref !== 'function') {
        return Promise.reject(new Error('chưa cấp Firebase RTDB handle'));
      }
      return Promise.resolve(rtdb.ref(path).once('value')).then(function (snap) {
        return snap && typeof snap.val === 'function' ? snap.val() : null;
      });
    }
    function rtdbSubscribe(path, onValue, onError) {
      if (!rtdb || typeof rtdb.ref !== 'function') {
        throw new Error('chưa cấp Firebase RTDB handle');
      }
      var ref = rtdb.ref(path);
      if (!ref || typeof ref.on !== 'function' || typeof ref.off !== 'function') {
        throw new Error('Firebase RTDB handle không hỗ trợ subscription');
      }
      function handle(snapshot) {
        onValue(snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null);
      }
      ref.on('value', handle, onError);
      return function unsubscribe() { ref.off('value', handle); };
    }
    function collection(name) {
      if (!firestore || typeof firestore.collection !== 'function') {
        throw new Error('chưa cấp Firestore handle');
      }
      return firestore.collection(name);
    }
    function firestoreGet(name, id) {
      return Promise.resolve().then(function () { return collection(name).doc(id).get(); })
        .then(function (snap) {
          if (!snap || snap.exists === false) return null;
          return typeof snap.data === 'function' ? snap.data() : null;
        });
    }
    function firestoreQuery(name, query) {
      return Promise.resolve().then(function () {
        var ref = collection(name);
        (query.where || []).forEach(function (w) { ref = ref.where(w.field, w.op, w.value); });
        if (query.orderBy) ref = ref.orderBy(query.orderBy.field, query.orderBy.direction || 'asc');
        if (query.limit) ref = ref.limit(query.limit);
        return ref.get();
      }).then(function (snap) {
        var out = Object.create(null);
        if (snap && typeof snap.forEach === 'function') {
          snap.forEach(function (doc) { out[doc.id] = doc.data(); });
        }
        return out;
      });
    }

    return {
      rtdbGet: rtdbGet,
      rtdbSubscribe: rtdbSubscribe,
      firestoreGet: firestoreGet,
      firestoreQuery: firestoreQuery,
      assertReadOnly: function () { return R.ok(true); }
    };
  }

  return { create: create };
});
