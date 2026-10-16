/* Gieo Gieo — CHẾ ĐỘ THỬ (che_do_thu.v1.js)
 * Chỉ bản thử posgieo_thu.html / quanlygieo_thu.html nạp file này (sinh bằng tools/tao_ban_thu.js).
 * App thật KHÔNG nạp → không bị ảnh hưởng gì.
 *
 * Khi bật, MỌI lượt đọc/ghi của app + Unit Engine được chuyển vào vùng thử, ngay ở gốc SDK:
 *   Firestore  collection('x') / doc('x/y')  → __test_gieogieo/data/x …   (chỉ mục Firestore vẫn dùng được
 *                                                                            vì tên collection giữ nguyên)
 *   Realtime DB ref('x')                      → __test_gieogieo/x          (.info/* giữ nguyên — giờ máy chủ)
 *   Storage    ref('x')                       → __test_gieogieo/x
 *   localStorage 'k'                           → '__thu__k'
 * Kể cả customers / bank_confirmations → vùng thử (không đụng khách thật, không đụng XOFA / The Cafe 33).
 * App thật không bao giờ đọc vùng thử (đường dẫn khác hẳn).
 *
 * An toàn (fail-closed): chuyển hướng TRƯỚC, tự kiểm SAU; kiểm sai → khoá mọi lệnh đọc/ghi + màn đỏ.
 * Vào lần đầu: chép danh mục + cấu hình + tồn hiện tại từ dữ liệu thật (CHỈ ĐỌC dữ liệu thật).
 * Kết thúc thử: xoá toàn bộ vùng thử (Firestore + RT + Storage + localStorage thử).
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const FS_ROOT_COLL = '__test_gieogieo', FS_ROOT_DOC = 'data';
  const FS_PFX = FS_ROOT_COLL + '/' + FS_ROOT_DOC + '/';
  const RT_PFX = '__test_gieogieo';
  const ST_PFX = '__test_gieogieo/';
  const LS_PFX = '__thu__';

  // ── Dữ liệu chép từ thật khi vào thử (chỉ đọc bên thật) ──
  // Danh mục / cấu hình: chép nguyên collection.
  const FS_COPY_ALL = ['employees', 'expense_categories', 'hr_settings', 'ingredient_original_packs', 'note_reasons',
    'waste_reasons', 'payment_methods', 'packaging_bagging_rules', 'packaging_bagging_table', 'packaging_item_overrides',
    'packaging_presets', 'packaging_rules_config', 'packaging_rules', 'recipes', 'topping_recipes', 'prep_vessels',
    'inventory_items', 'prep_items', 'shift_checklists', 'shift_workflows', 'special_days', 'refill_rules',
    'storage_locations', 'work_schedules', 'prep_ingredient_locks'].map(n => n + '_gieogieo');
  // Tồn hiện tại: chỉ tem / lô còn hiệu lực (không chép lịch sử).
  const FS_COPY_FILTER = [
    ['stock_containers_gieogieo', 'status', ['sealed', 'open', 'lost', 'discard_pending']],
    ['prep_batches_gieogieo', 'status', ['cooking', 'finishing', 'active']]
  ];
  // Realtime DB: menu, topping, khuyến mãi, cấu hình, tem đang mở. KHÔNG chép bill, bộ đếm bill, CK.
  const RT_COPY = ['menu_gieogieo', 'menu_togo_gieogieo', 'food_gieogieo', 'food_menu_gieogieo', 'toppings_gieogieo',
    'togoSettings_gieogieo', 'sales_assist_config_gieogieo', 'sales_assist_stats_gieogieo', 'appFeeSettings_gieogieo',
    'printer_layout_gieogieo', 'active_units_gieogieo'];

  const S = { active: false, app: '', orig: null, touched: new Set(), registryReady: false };
  const clean = p => String(p == null ? '' : p).replace(/^\/+|\/+$/g, '');
  const stPath = p => { p = clean(p); return p.startsWith(ST_PFX) || p === clean(ST_PFX) ? p : ST_PFX + p; };

  // ════════════════════════ GIAO DIỆN ════════════════════════
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function whenBody(fn) { if (typeof document === 'undefined') return; if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function overlay(html, color) {
    whenBody(() => {
      let o = document.getElementById('__thuOverlay');
      if (!o) { o = document.createElement('div'); o.id = '__thuOverlay'; document.body.appendChild(o); }
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;font:15px/1.5 sans-serif';
      o.innerHTML = '<div style="background:#fff;max-width:520px;width:100%;border-radius:16px;padding:22px;border-top:8px solid ' + (color || '#f59e0b') + '">' + html + '</div>';
    });
  }
  function closeOverlay() { if (typeof document === 'undefined') return; const o = document.getElementById('__thuOverlay'); if (o) o.remove(); }
  const btn = (id, text, bg) => '<button id="' + id + '" style="display:block;width:100%;margin-top:10px;padding:13px;border:0;border-radius:12px;font-weight:700;font-size:15px;background:' + (bg || '#f59e0b') + ';color:' + (bg ? '#fff' : '#111') + '">' + text + '</button>';
  function on(id, fn) { if (typeof document === 'undefined') return; const b = document.getElementById(id); if (b) b.onclick = fn; }
  function fatal(msg) {
    overlay('<div style="font-weight:800;font-size:18px;color:#b91c1c">⛔ Chế độ thử KHÔNG an toàn — đã khoá</div><p>' + esc(msg) + '</p><p>Không đọc/ghi được gì. Báo lại cho người phụ trách kỹ thuật.</p>', '#b91c1c');
  }
  function pill(meta) {
    whenBody(() => {
      let p = document.getElementById('__thuPill');
      if (!p) { p = document.createElement('div'); p.id = '__thuPill'; document.body.appendChild(p); }
      p.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:2147483646;background:#f59e0b;color:#111;font:800 12px/1.2 sans-serif;padding:8px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.3);cursor:pointer';
      const t = meta && meta.seededAt ? new Date(meta.seededAt).toLocaleString('vi-VN') : '';
      p.textContent = '🧪 CHẾ ĐỘ THỬ' + (t ? ' · dữ liệu chép ' + t : '');
      p.onclick = menu;
    });
  }
  function menu() {
    overlay('<div style="font-weight:800;font-size:18px">🧪 Chế độ thử</div>' +
      '<p>Mọi thao tác ở đây ghi vào <b>vùng thử</b> — app thật không thấy. Thanh toán chuyển khoản: <b>bấm xác nhận tay</b>, đừng chuyển tiền thật (QR vẫn là tài khoản thật).</p>' +
      btn('__thuReseed', '🔄 Xoá dữ liệu thử & chép lại từ thật') +
      btn('__thuEnd', '🗑 Kết thúc thử — xoá toàn bộ dữ liệu thử', '#b91c1c') +
      btn('__thuClose', 'Đóng', '#6b7280'));
    on('__thuClose', closeOverlay);
    on('__thuReseed', () => { if (confirm('Xoá toàn bộ dữ liệu thử rồi chép lại từ dữ liệu thật?')) wipe().then(seedFlow).catch(showErr); });
    on('__thuEnd', () => { if (confirm('Xoá TOÀN BỘ dữ liệu thử? (các máy khác đang thử cũng mất dữ liệu thử)')) wipe().then(ended).catch(showErr); });
  }
  function showErr(e) { if (typeof console !== 'undefined') console.error('[Chế độ thử]', e);
    overlay('<div style="font-weight:800;color:#b91c1c">Lỗi</div><p>' + esc(e && e.message || e) + '</p>' + btn('__thuClose', 'Đóng', '#6b7280')); on('__thuClose', closeOverlay); }
  function offline(e) {
    if (typeof console !== 'undefined') console.warn('[Chế độ thử] chưa đọc được vùng thử', e);
    overlay('<div style="font-weight:800;font-size:18px">🧪 Chế độ thử — chưa kết nối được</div><p>Không đọc được vùng thử (' + esc(e && e.message || e) + '). Kiểm tra mạng rồi bấm thử lại.</p>' + btn('__thuRetry', 'Thử lại'));
    on('__thuRetry', () => { progress('Đang kiểm tra…'); checkSeed().then(closeIfSeeded).catch(offline); });
  }
  function closeIfSeeded() { if (S.registryReady) closeOverlay(); }
  function progress(t) { overlay('<div style="font-weight:800;font-size:18px">🧪 Chế độ thử</div><p>' + esc(t) + '</p>'); }
  function ended() {
    overlay('<div style="font-weight:800;font-size:18px">✅ Đã xoá toàn bộ dữ liệu thử</div><p>Muốn thử tiếp: bấm bên dưới (sẽ chép lại dữ liệu mới từ thật).</p>' + btn('__thuReload', 'Thử lại từ đầu'));
    on('__thuReload', () => location.reload());
  }

  // ════════════════════════ CÀI ĐẶT ════════════════════════
  function install(opts) {
    const firebase = opts.firebase || root.firebase, db = opts.db, fstore = opts.fstore;
    if (!db || !fstore) throw new Error('GieoThu.install: thiếu db / fstore');
    S.app = opts.app || '';
    const O = S.orig = {
      coll: fstore.collection.bind(fstore), doc: fstore.doc ? fstore.doc.bind(fstore) : null, batch: fstore.batch.bind(fstore),
      ref: db.ref.bind(db), storage: null, stRef: null,
      lsGet: root.Storage && root.Storage.prototype.getItem, lsSet: root.Storage && root.Storage.prototype.setItem,
      lsRemove: root.Storage && root.Storage.prototype.removeItem
    };
    // 1) CHUYỂN HƯỚNG (làm trước mọi thứ)
    fstore.collection = p => { p = clean(p); if (!p.startsWith(FS_PFX)) touch(p); return O.coll(p.startsWith(FS_PFX) ? p : FS_PFX + p); };
    if (O.doc) fstore.doc = p => { p = clean(p); return O.doc(p.startsWith(FS_PFX) ? p : FS_PFX + p); };
    fstore.collectionGroup = () => { throw new Error('collectionGroup bị chặn ở chế độ thử'); };
    db.ref = p => {
      p = clean(p);
      if (p === '.info' || p.startsWith('.info/')) return O.ref(p);
      if (p === RT_PFX || p.startsWith(RT_PFX + '/')) return O.ref(p);
      return O.ref(p ? RT_PFX + '/' + p : RT_PFX);
    };
    db.refFromURL = () => { throw new Error('refFromURL bị chặn ở chế độ thử'); };
    try {
      if (firebase && typeof firebase.storage === 'function') {
        const st = firebase.storage(); O.storage = st; O.stRef = st.ref.bind(st);
        st.ref = p => O.stRef(p == null || p === '' ? clean(ST_PFX) : stPath(p));
        st.refFromURL = () => { throw new Error('refFromURL bị chặn ở chế độ thử'); };
      }
    } catch (e) { /* app không dùng Storage */ }
    if (O.lsGet) {
      const isLS = s => { try { return s === root.localStorage; } catch (e) { return false; } };
      const k = (s, key) => (isLS(s) && !String(key).startsWith(LS_PFX) ? LS_PFX + key : key);
      root.Storage.prototype.getItem = function (key) { return O.lsGet.call(this, k(this, key)); };
      root.Storage.prototype.setItem = function (key, v) { return O.lsSet.call(this, k(this, key), v); };
      root.Storage.prototype.removeItem = function (key) { return O.lsRemove.call(this, k(this, key)); };
    }
    S.active = true;
    // 2) TỰ KIỂM (sai → khoá hết)
    const loi = selfCheck(firebase, db, fstore);
    if (loi) {
      const chan = () => { throw new Error('Chế độ thử đã khoá: ' + loi); };
      fstore.collection = chan; if (O.doc) fstore.doc = chan; db.ref = chan;
      fstore.runTransaction = chan; fstore.batch = chan;
      if (O.storage) O.storage.ref = chan;
      fatal(loi);
      throw new Error('GieoThu: ' + loi);
    }
    pill(null);
    checkSeed().catch(offline);
    return api;
  }
  function selfCheck(firebase, db, fstore) {
    try {
      if (firebase && firebase.firestore && firebase.firestore() !== fstore) return 'firebase.firestore() trả về đối tượng khác';
      if (firebase && firebase.database && firebase.database() !== db) return 'firebase.database() trả về đối tượng khác';
      const c = fstore.collection('inventory_items_gieogieo');
      if (!String(c.path).startsWith(FS_PFX)) return 'Firestore chưa chuyển hướng (' + c.path + ')';
      const r = String(db.ref('orders_gieogieo').toString());
      if (r.indexOf('/' + RT_PFX + '/orders_gieogieo') < 0) return 'Realtime DB chưa chuyển hướng (' + r + ')';
      const i = String(db.ref('.info/serverTimeOffset').toString());
      if (i.indexOf(RT_PFX) >= 0) return '.info bị chuyển hướng nhầm';
      if (S.orig.storage && firebase.storage() !== S.orig.storage) return 'firebase.storage() trả về đối tượng khác';
      if (S.orig.storage && !String(S.orig.storage.ref('x').fullPath).startsWith(ST_PFX)) return 'Storage chưa chuyển hướng';
      S.touched.delete('inventory_items_gieogieo');
    } catch (e) { return 'Tự kiểm lỗi: ' + (e && e.message || e); }
    return '';
  }

  // ════════════════════════ SỔ ĐĂNG KÝ (để xoá sạch) ════════════════════════
  function regRef() { return S.orig.coll(FS_ROOT_COLL).doc(FS_ROOT_DOC); }
  function touch(p) {
    if (S.touched.has(p)) return; S.touched.add(p);
    if (!S.registryReady) return;
    const FV = root.firebase && root.firebase.firestore && root.firebase.firestore.FieldValue;
    if (FV) regRef().set({ colls: FV.arrayUnion(p) }, { merge: true }).catch(() => {});
  }
  async function checkSeed() {
    const d = await regRef().get();
    const meta = d.exists ? d.data() : null;
    if (meta && meta.seededAt) {
      S.registryReady = true;
      const FV = root.firebase.firestore.FieldValue;
      if (S.touched.size) regRef().set({ colls: FV.arrayUnion(...S.touched) }, { merge: true }).catch(() => {});
      pill(meta); return;
    }
    seedPrompt();
  }
  function seedPrompt() {
    overlay('<div style="font-weight:800;font-size:18px">🧪 Chế độ thử — chưa có dữ liệu thử</div>' +
      '<p>Chép <b>danh mục, cấu hình, menu, nhân viên và tồn hiện tại</b> (tem còn seal / đang mở, lô BTP đang có) từ dữ liệu thật vào vùng thử. ' +
      'Dữ liệu thật chỉ được <b>đọc</b>. Không chép bill cũ, không chép khách hàng (thử tích tem bằng SĐT giả).</p>' +
      btn('__thuSeed', 'Chép dữ liệu thật vào vùng thử'));
    on('__thuSeed', seedFlow);
  }

  // ════════════════════════ CHÉP TỪ THẬT (CHỈ ĐỌC BÊN THẬT) ════════════════════════
  async function copyDocs(docs, dest, log) {
    let batch = S.orig.batch(), n = 0, total = 0;
    for (const d of docs) {
      batch.set(S.orig.coll(FS_PFX + dest).doc(d.id), d.data()); n++; total++;
      if (n >= 400) { await batch.commit(); batch = S.orig.batch(); n = 0; log(); }
    }
    if (n) await batch.commit();
    return total;
  }
  async function seed(onStep) {
    const O = S.orig, step = onStep || (() => {}), counts = {};
    for (const c of FS_COPY_ALL) {
      step('Đang chép ' + c + '…');
      const snap = await O.coll(c).get();                                   // ĐỌC thật
      counts[c] = await copyDocs(snap.docs, c, () => step('Đang chép ' + c + '…'));
    }
    for (const [c, field, vals] of FS_COPY_FILTER) {
      step('Đang chép ' + c + ' (còn hiệu lực)…');
      const snap = await O.coll(c).where(field, 'in', vals).get();          // ĐỌC thật
      counts[c] = await copyDocs(snap.docs, c, () => {});
    }
    for (const p of RT_COPY) {
      step('Đang chép ' + p + '…');
      const v = (await O.ref(p).once('value')).val();                         // ĐỌC thật
      if (v != null) await O.ref(RT_PFX + '/' + p).set(v);
      counts['rt:' + p] = v == null ? 0 : 1;
    }
    const FV = root.firebase.firestore.FieldValue;
    const colls = FS_COPY_ALL.concat(FS_COPY_FILTER.map(x => x[0]), [...S.touched]);
    await regRef().set({ seededAt: Date.now(), seededBy: S.app, version: VERSION, counts, colls: FV.arrayUnion(...colls) }, { merge: true });
    S.registryReady = true;
    return counts;
  }
  async function seedFlow() {
    try {
      progress('Đang chép dữ liệu…');
      const counts = await seed(progress);
      const tong = Object.entries(counts).filter(([k]) => !k.startsWith('rt:')).reduce((a, [, v]) => a + v, 0);
      overlay('<div style="font-weight:800;font-size:18px">✅ Đã chép ' + tong + ' bản ghi vào vùng thử</div><p>Tải lại để bắt đầu thử.</p>' + btn('__thuReload', 'Bắt đầu thử'));
      on('__thuReload', () => location.reload());
    } catch (e) { showErr(e); }
  }

  // ════════════════════════ XOÁ VÙNG THỬ ════════════════════════
  async function wipe(onStep) {
    const O = S.orig, step = onStep || progress;
    const d = await regRef().get();
    const colls = new Set([...(d.exists && d.data().colls || []), ...FS_COPY_ALL, ...FS_COPY_FILTER.map(x => x[0]), ...S.touched]);
    for (const c of colls) {
      step('Đang xoá ' + c + '…');
      for (;;) {
        const snap = await O.coll(FS_PFX + c).limit(400).get();
        if (snap.empty) break;
        const b = O.batch();
        snap.docs.forEach(x => b.delete(x.ref));
        await b.commit();
      }
    }
    step('Đang xoá Realtime DB thử…');
    await O.ref(RT_PFX).remove();
    if (O.storage) {
      step('Đang xoá ảnh thử…');
      const delAll = async r => { const l = await r.listAll(); await Promise.all(l.items.map(i => i.delete().catch(() => {}))); for (const p of l.prefixes) await delAll(p); };
      try { await delAll(O.stRef(clean(ST_PFX))); } catch (e) { /* không có ảnh thử */ }
    }
    try {
      const keys = []; for (let i = 0; i < root.localStorage.length; i++) { const k = root.localStorage.key(i); if (k && k.startsWith(LS_PFX)) keys.push(k); }
      keys.forEach(k => O.lsRemove.call(root.localStorage, k));
    } catch (e) { /* localStorage bị chặn */ }
    await regRef().delete();
    S.registryReady = false; S.touched.clear();
  }

  const api = {
    VERSION, install, get active() { return S.active; },
    storagePath: p => (S.active ? stPath(p) : p),
    // cho test / công cụ
    _consts: { FS_PFX, RT_PFX, ST_PFX, LS_PFX, FS_COPY_ALL, FS_COPY_FILTER, RT_COPY },
    _seed: seed, _wipe: wipe
  };
  root.GieoThu = api;
})(typeof window !== 'undefined' ? window : globalThis);
