// Firebase giả lập dùng chung cho test (E0 — mục 6 kế hoạch). Không cần mạng, không cần gói.
//  - RT: ref(path).child/once/on/off/set/update/remove/push/transaction — transaction gọi callback
//    lượt đầu với null (giống cache rỗng của SDK thật), sau đó với dữ liệu thật.
//  - Firestore: collection/doc/where/orderBy/limit/get/set(merge)/update(dot-path)/delete/add,
//    runTransaction, batch; FieldValue.delete/increment/arrayUnion/arrayRemove/serverTimestamp.
//  - Đồng hồ giả tăng đều + nguồn ngẫu nhiên cố định; `log` ghi thứ tự mọi lượt ghi.
'use strict';
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const SENT = Symbol('fv');
// [Kiểm luồng] Chế độ NGHIÊM (mặc định bật; FAKE_STRICT=0 để tắt): từ chối dữ liệu mà Firebase THẬT từ chối —
// RT: giá trị undefined / NaN / Infinity, khoá chứa . # $ [ ] / ; Firestore: giá trị undefined (app không bật ignoreUndefinedProperties).
const STRICT = process.env.FAKE_STRICT !== '0';
const strictFail = msg => { if (process.env.FAKE_STRICT_LOG) { try { require('fs').appendFileSync(process.env.FAKE_STRICT_LOG, msg + '  [' + (require('path').basename(process.argv[1] || '')) + ']\n' + new Error().stack.split('\n').slice(3, 9).join('\n') + '\n'); } catch (e) { /* bỏ qua */ } } throw new Error(msg); };
function strictRt(v, path) {
  if (!STRICT) return;
  if (v === undefined) strictFail('[RT thật từ chối] giá trị undefined tại ' + path);
  if (typeof v === 'number' && !Number.isFinite(v)) strictFail('[RT thật từ chối] số không hợp lệ (' + v + ') tại ' + path);
  if (v && typeof v === 'object') for (const k of Object.keys(v)) {
    if (!Array.isArray(v) && /[.#$\[\]\/]/.test(k)) strictFail('[RT thật từ chối] khoá không hợp lệ "' + k + '" tại ' + path);
    strictRt(v[k], path + '/' + k);
  }
}
function strictFs(v, path) {
  if (!STRICT) return;
  if (v === undefined) strictFail('[Firestore thật từ chối] giá trị undefined tại ' + path);
  if (v && typeof v === 'object' && !v[SENT]) for (const k of Object.keys(v)) strictFs(v[k], path + '.' + k);
}

const FieldValue = {
  delete: () => ({ [SENT]: 'delete' }),
  increment: n => ({ [SENT]: 'inc', n }),
  arrayUnion: (...a) => ({ [SENT]: 'union', a }),
  arrayRemove: (...a) => ({ [SENT]: 'remove', a }),
  serverTimestamp: () => ({ [SENT]: 'ts' })
};

function makeClock(start = Date.UTC(2026, 8, 28, 1, 0, 0), step = 1000) {
  let t = start;
  const now = () => (t += step);
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now()); }
    static now() { return now(); }
  }
  return { now, Date: FakeDate, peek: () => t, set: v => { t = v; } };
}
function makeRandom(seed = 12345) {
  let s = seed >>> 0;
  const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const M = Object.create(Math); M.random = random;
  return { random, Math: M };
}

function makeFake(opts = {}) {
  const clock = opts.clock || makeClock();
  const rnd = opts.rnd || makeRandom();
  const log = [];
  let idSeq = 0;
  const newId = () => 'ID' + String(++idSeq).padStart(4, '0');

  // ───────────── RT ─────────────
  const RT = { root: clone(opts.rt || {}) || {} };
  const parts = p => String(p || '').split('/').filter(Boolean);
  const rtGet = p => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), RT.root);
  const prune = o => { if (o && typeof o === 'object') { for (const k of Object.keys(o)) { prune(o[k]); if (o[k] === null || (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length)) delete o[k]; } } return o; };
  const rtSet = (p, v) => {
    if (v !== null) strictRt(v, p || '/');
    const ks = parts(p);
    if (!ks.length) { RT.root = v == null ? {} : clone(v); return; }
    let o = RT.root; for (const k of ks.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clone(v);
    prune(RT.root);
  };
  const listeners = [];
  const fire = () => listeners.forEach(l => { const v = rtGet(l.path); l.cb({ val: () => (v === undefined ? null : clone(v)), exists: () => v !== undefined, key: parts(l.path).pop() }); });
  const snap = (p) => { const v = rtGet(p); return { val: () => (v === undefined ? null : clone(v)), exists: () => v !== undefined, key: parts(p).pop() || null }; };
  const ref = (p = '') => {
    const r = {
      key: parts(p).pop() || null, _path: parts(p).join('/'),
      toString: () => 'https://fake-rtdb/' + parts(p).join('/'),
      child: c => ref(parts(p).concat(parts(c)).join('/')),
      get parent() { return ref(parts(p).slice(0, -1).join('/')); },
      once: async () => { if (RT.failNext) { const e = RT.failNext; RT.failNext = null; throw e; } return snap(p); },
      get: async () => snap(p),
      on: (ev, cb) => { listeners.push({ path: p, cb }); cb(snap(p)); return cb; },
      off: () => {},
      set: async v => { log.push(['rt.set', r._path]); rtSet(p, v); fire(); },
      update: async v => { log.push(['rt.update', r._path]); for (const [k, val] of Object.entries(v)) rtSet(parts(p).concat(parts(k)).join('/'), val); fire(); },
      remove: async () => { log.push(['rt.remove', r._path]); rtSet(p, null); fire(); },
      push: v => { const k = newId(); const c = ref(parts(p).concat([k]).join('/')); if (v !== undefined) c.set(v); return c; },
      transaction: async fn => {
        if (RT.failNext) { const e = RT.failNext; RT.failNext = null; throw e; }
        if (RT.failTxNext) { const e = RT.failTxNext; RT.failTxNext = null; throw e; }
        fn(null);                                        // lượt cache rỗng như SDK thật
        const cur = rtGet(p); const res = fn(cur === undefined ? null : clone(cur));
        if (res === undefined) return { committed: false, snapshot: snap(p) };
        log.push(['rt.tx', r._path]); rtSet(p, res); fire();
        return { committed: true, snapshot: snap(p) };
      },
      orderByChild: () => r, equalTo: () => r, limitToLast: () => r, limitToFirst: () => r
    };
    return r;
  };
  const db = { ref, _rt: RT };

  // ───────────── Firestore ─────────────
  const FS = {}; // 'coll/id' -> data
  for (const [k, v] of Object.entries(opts.fs || {})) FS[k] = clone(v);
  const applyFV = (target, key, v) => {
    if (v && v[SENT]) {
      const t = v[SENT];
      if (t === 'delete') { delete target[key]; return; }
      if (t === 'inc') { target[key] = (Number(target[key]) || 0) + v.n; return; }
      if (t === 'union') { const arr = Array.isArray(target[key]) ? target[key] : []; v.a.forEach(x => { if (!arr.some(y => JSON.stringify(y) === JSON.stringify(x))) arr.push(clone(x)); }); target[key] = arr; return; }
      if (t === 'remove') { const arr = Array.isArray(target[key]) ? target[key] : []; target[key] = arr.filter(y => !v.a.some(x => JSON.stringify(x) === JSON.stringify(y))); return; }
      if (t === 'ts') { target[key] = new clock.Date().toISOString(); return; }
    }
    target[key] = deepVal(v);
  };
  const deepVal = v => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !v[SENT]) { const o = {}; for (const [k, x] of Object.entries(v)) { if (x && x[SENT] === 'delete') continue; applyFV(o, k, x); } return o; }
    if (Array.isArray(v)) return clone(v);
    return v;
  };
  const mergeInto = (dst, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !v[SENT] && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) mergeInto(dst[k], v);
      else applyFV(dst, k, v);
    }
    return dst;
  };
  const docSnap = (c, id) => { const d = FS[c + '/' + id]; return { id, exists: d !== undefined, data: () => clone(d), get: f => (d ? clone(d[f]) : undefined), ref: docRef(c, id) }; };
  const fsFail = () => { if (FS_CTL.failNext) { const e = FS_CTL.failNext; FS_CTL.failNext = null; throw e; } };
  const FS_CTL = { failNext: null };
  // Phiên bản từng doc — để runTransaction phát hiện xung đột như Firestore thật (đọc xong mà doc đã bị ghi → chạy lại).
  const VER = {};
  const bump = k => { VER[k] = (VER[k] || 0) + 1; };
  const w = {
    set: (c, id, x, o) => { strictFs(x, c + '/' + id); const k = c + '/' + id; bump(k); FS[k] = (o && o.merge && FS[k]) ? mergeInto(FS[k], x) : deepVal(x); },
    update: (c, id, x) => {
      const k = c + '/' + id; if (FS[k] === undefined) { const e = new Error('No document to update: ' + k); e.code = 'not-found'; throw e; }
      strictFs(x, k);
      bump(k);
      for (const [path, v] of Object.entries(x)) { const ks = path.split('.'); let o = FS[k]; for (const kk of ks.slice(0, -1)) { if (!o[kk] || typeof o[kk] !== 'object') o[kk] = {}; o = o[kk]; } applyFV(o, ks[ks.length - 1], v); }
    },
    delete: (c, id) => { bump(c + '/' + id); delete FS[c + '/' + id]; }
  };
  function docRef(c, id) {
    return {
      id, path: c + '/' + id, _c: c,
      get: async () => { fsFail(); return docSnap(c, id); },
      set: async (x, o) => { fsFail(); log.push(['fs.set', c + '/' + id]); w.set(c, id, x, o); },
      update: async x => { fsFail(); log.push(['fs.update', c + '/' + id]); w.update(c, id, x); },
      delete: async () => { fsFail(); log.push(['fs.delete', c + '/' + id]); w.delete(c, id); },
      collection: sub => coll(c + '/' + id + '/' + sub),
      onSnapshot: (next) => { next(docSnap(c, id)); return () => {}; }
    };
  }
  const OPS = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b,
    in: (a, b) => b.includes(a), 'not-in': (a, b) => !b.includes(a), 'array-contains': (a, b) => Array.isArray(a) && a.includes(b), 'array-contains-any': (a, b) => Array.isArray(a) && a.some(x => b.includes(x)) };
  const getField = (d, f) => String(f).split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
  function query(c, filters = [], order = [], lim = null) {
    const q = {
      where: (f, op, v) => query(c, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(c, filters, order.concat([[f, dir]]), lim),
      limit: n => query(c, filters, order, n), limitToLast: n => query(c, filters, order, n),
      startAfter: () => q,
      get: async () => {
        fsFail();
        let ids = Object.keys(FS).filter(k => k.startsWith(c + '/') && !k.slice(c.length + 1).includes('/')).map(k => k.slice(c.length + 1)).sort();
        ids = ids.filter(id => filters.every(([f, op, v]) => OPS[op](getField(FS[c + '/' + id], f), v)));
        for (const [f, dir] of order.slice().reverse()) ids.sort((a, b) => { const x = getField(FS[c + '/' + a], f), y = getField(FS[c + '/' + b], f); const r = x < y ? -1 : x > y ? 1 : 0; return dir === 'desc' ? -r : r; });
        if (lim != null) ids = ids.slice(0, lim);
        const docs = ids.map(id => docSnap(c, id));
        return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
      },
      onSnapshot: (next) => { q.get().then(s => next({ ...s, metadata: { fromCache: false }, docChanges: () => [] })); return () => {}; }
    };
    return q;
  }
  function coll(c) {
    return Object.assign(query(c), {
      id: c.split('/').pop(), path: c,
      doc: id => docRef(c, id == null ? newId() : String(id)),
      add: async x => { fsFail(); const id = newId(); log.push(['fs.add', c + '/' + id]); w.set(c, id, x); return docRef(c, id); }
    });
  }
  const fstore = {
    collection: coll,
    runTransaction: async fn => {
      fsFail();
      for (let attempt = 0; attempt < 6; attempt++) {
      const ops = [], reads = {};
      const t = {
        get: async r => { if (r._c) reads[r._c + '/' + r.id] = VER[r._c + '/' + r.id] || 0; return r._c ? docSnap(r._c, r.id) : r.get(); },
        set: (r, x, o) => { strictFs(x, r.path); ops.push(() => { log.push(['fs.tx.set', r.path]); w.set(r._c, r.id, x, o); }); return t; },
        update: (r, x) => { strictFs(x, r.path); ops.push(() => { log.push(['fs.tx.update', r.path]); w.update(r._c, r.id, x); }); return t; },
        delete: r => { ops.push(() => { log.push(['fs.tx.delete', r.path]); w.delete(r._c, r.id); }); return t; }
      };
      const res = await fn(t);
      if (Object.keys(reads).some(k => (VER[k] || 0) !== reads[k])) continue;   // xung đột: có ai ghi doc đã đọc → chạy lại callback
      ops.forEach(o => o());
      return res;
      }
      throw new Error('transaction: quá nhiều xung đột');
    },
    batch: () => {
      const ops = [];
      const b = {
        set: (r, x, o) => { ops.push(() => { log.push(['fs.batch.set', r.path]); w.set(r._c, r.id, x, o); }); return b; },
        update: (r, x) => { ops.push(() => { log.push(['fs.batch.update', r.path]); w.update(r._c, r.id, x); }); return b; },
        delete: r => { ops.push(() => { log.push(['fs.batch.delete', r.path]); w.delete(r._c, r.id); }); return b; },
        commit: async () => { fsFail(); ops.forEach(o => o()); }
      };
      return b;
    },
    _FS: FS, _ctl: FS_CTL
  };
  const firebase = { firestore: Object.assign(() => fstore, { FieldValue }), database: () => db };
  return { db, fstore, firebase, FieldValue, clock, rnd, log, RT, FS, rtGet };
}

// Chuẩn hoá trạng thái để so ảnh chụp: mốc thời gian (ISO / epoch ms) → <T#> theo thứ tự xuất
// hiện; sắp xếp khoá object. Giá trị số khác và thứ tự thao tác ghi giữ nguyên.
function normalize(state) {
  const seen = new Map();
  const tag = v => { if (!seen.has(v)) seen.set(v, '<T' + seen.size + '>'); return seen.get(v); };
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const walk = v => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = walk(v[k]); return o; }
    if (typeof v === 'string' && iso.test(v)) return tag(v);
    if (typeof v === 'number' && v > 1e12 && v < 1e14 && Number.isInteger(v)) return tag(new Date(v).toISOString());
    return v;
  };
  return walk(state);
}

// [E6] Bản ghi mới do engine tạo mang storeId 'gg01' — ảnh chụp gốc (trước E6) không có trường này.
// dropStore bỏ storeId:'gg01' ở mọi cấp để so với ảnh chụp cũ; nếu truyền `gaps` (các doc engine
// tạo mới mà THIẾU storeId) thì gắn vào kết quả → lệch ảnh chụp → test báo lỗi.
function dropStore(state, gaps) {
  const walk = v => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (!(k === 'storeId' && v[k] === 'gg01')) o[k] = walk(v[k]); return o; }
    return v;
  };
  const out = walk(state);
  if (gaps && gaps.length) out.storeGaps = gaps;
  return out;
}
// Doc Firestore do ENGINE tạo (lượt ghi đầu tiên vào doc đó xảy ra từ lúc engine được gọi lần đầu,
// tức sau phần chuẩn bị dữ liệu của kịch bản) mà thiếu storeId.
function storeGaps(FS, seedFs, log, mark) {
  const first = {};
  (log || []).forEach((e, i) => { if (/^fs\./.test(e[0]) && !(e[1] in first)) first[e[1]] = i; });
  return Object.keys(FS).filter(k => !(k in (seedFs || {})) && mark != null && first[k] >= mark && FS[k] && FS[k].storeId !== 'gg01').sort();
}
// Bọc bảng hàm: ghi lại vị trí log tại lần gọi engine ĐẦU TIÊN.
function markFirstCall(F, fake, mark) {
  const out = {};
  for (const k of Object.keys(F)) out[k] = typeof F[k] === 'function' ? (...a) => { if (mark.i == null) mark.i = fake.log.length; return F[k](...a); } : F[k];
  return out;
}
module.exports = { makeFake, makeClock, makeRandom, FieldValue, normalize, clone, dropStore, storeGaps, markFirstCall };
