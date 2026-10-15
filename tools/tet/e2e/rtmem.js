// RT giả có cây dữ liệu thật: set / update / push / remove + callback, on('value') nghe đúng nhánh.
// Nạp SAU mockfb_pos.js — thay firebase.database.
(function () {
  var T = {}, L = [], seq = 0;
  var clone = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  var parts = function (p) { return String(p || '').split('/').filter(Boolean); };
  function get(p) { var o = T; var ks = parts(p); for (var i = 0; i < ks.length; i++) { if (o == null || typeof o !== 'object') return undefined; o = o[ks[i]]; } return o; }
  function put(p, v) {
    var ks = parts(p); if (!ks.length) { T = clone(v) || {}; return; }
    var o = T; ks.slice(0, -1).forEach(function (k) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    var last = ks[ks.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = clone(v);
  }
  function fire(p) {
    var a = parts(p).join('/');
    L.slice().forEach(function (l) { var b = parts(l.path).join('/');
      if (a === b || a.indexOf(b + '/') === 0 || b.indexOf(a + '/') === 0 || b === '') setTimeout(function () { l.cb(snap(l.path)); }, 0); });
  }
  function snap(p) {
    var v = get(p);
    return { key: parts(p).pop() || null, val: function () { return v === undefined ? null : clone(v); }, exists: function () { return v !== undefined && v !== null; },
      forEach: function (cb) { var o = (v && typeof v === 'object') ? v : {}; Object.keys(o).sort().some(function (k) { return cb(snap(p + '/' + k)) === true; }); },
      child: function (k) { return snap(p + '/' + k); }, numChildren: function () { return v && typeof v === 'object' ? Object.keys(v).length : 0; },
      hasChild: function (k) { return v && typeof v === 'object' && k in v; } };
  }
  function ref(p) {
    p = parts(p).join('/');
    var r = {
      key: parts(p).pop() || null, path: p,
      child: function (k) { return ref(p + '/' + k); },
      once: function (ev, cb) { var s = snap(p); if (typeof cb === 'function') setTimeout(function () { cb(s); }, 0); return Promise.resolve(s); },
      on: function (ev, cb) { if (ev !== 'value') return cb; var l = { path: p, cb: cb }; L.push(l); setTimeout(function () { cb(snap(p)); }, 0); return cb; },
      off: function (ev, cb) { for (var i = L.length - 1; i >= 0; i--) if (L[i].path === p && (!cb || L[i].cb === cb)) L.splice(i, 1); },
      set: function (v, cb) { put(p, v); window.__RTW.push(['set', p, clone(v)]); fire(p); if (cb) setTimeout(function () { cb(null); }, 0); return Promise.resolve(); },
      update: function (o, cb) { Object.keys(o).forEach(function (k) { put(p + '/' + k, o[k]); }); window.__RTW.push(['update', p, clone(o)]); fire(p); if (cb) setTimeout(function () { cb(null); }, 0); return Promise.resolve(); },
      remove: function (cb) { put(p, null); window.__RTW.push(['remove', p]); fire(p); if (cb) setTimeout(function () { cb(null); }, 0); return Promise.resolve(); },
      push: function (v, cb) {
        var k = '-K' + String(++seq).padStart(6, '0'), c = ref(p + '/' + k);
        if (v === undefined) return c;
        var pr = c.set(v, cb).then(function () { return ref(p + '/' + k); }); c.then = pr.then.bind(pr); c.catch = pr.catch.bind(pr); return c;
      },
      transaction: function (fn, cb) { var nv = fn(clone(get(p))); if (nv !== undefined) { put(p, nv); fire(p); } var res = { committed: nv !== undefined, snapshot: snap(p) }; if (cb) setTimeout(function () { cb(null, res.committed, res.snapshot); }, 0); return Promise.resolve(res); },
      toString: function () { return 'https://mock/' + p; }
    };
    ['limitToLast', 'limitToFirst', 'orderByChild', 'orderByKey', 'orderByValue', 'equalTo', 'startAt', 'endAt'].forEach(function (m) { r[m] = function () { return r; }; });
    return r;
  }
  window.__RTW = []; window.__RT2 = { get: get, put: put, fire: fire, tree: function () { return T; } };
  put('.info/connected', true); put('.info/serverTimeOffset', 0);
  var dbObj = { ref: ref, ServerValue: { TIMESTAMP: 0 } };
  var f = function () { return dbObj; }; f.ServerValue = { TIMESTAMP: 0 };
  firebase.database = f;
})();
