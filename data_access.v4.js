/* Gieo Gieo — LỚP ĐƯỜNG DẪN ĐA CỬA HÀNG (data_access.v4.js) — docs/KE_HOACH_DA_CUA_HANG.md (Bước 1 + 2 + 3)
 *
 * v3 (06/10): đăng ký cash_drawer_logs_gieogieo (nhật ký mở két tay ở POS — riêng từng quán).
 * v4 (07/10): payroll_month_adjustments_gieogieo (thưởng / phạt / lương thực nhận theo tháng) G → S: riêng từng quán.
 *     GG01 giữ nguyên tên (dữ liệu cũ không đổi); quán khác → __{storeId}.
 * v2 (06/10, Bước 3): thêm withStore() cho chế độ Quản lý "Xem tất cả cửa hàng". v1, v2 giữ để quay lui (cache lâu).
 *
 * Một chỗ duy nhất quyết định dữ liệu của QUÁN NÀO nằm ở đâu. Cài một lần ngay sau khi tạo fstore / db
 * (GieoData.install), bọc ở gốc SDK — cùng cách chế độ thử (che_do_thu) — nên app và Unit Engine
 * KHÔNG phải sửa lời gọi nào:
 *   Firestore  collection('x') / doc('x/…')   Realtime DB  ref('x/…')
 *   · quán hiện tại 'gg01' (mã GG01)  → TÊN CŨ, y hệt hôm nay (không chuyển dữ liệu, không đổi gì);
 *   · quán khác: dữ liệu riêng từng quán (S) và danh mục theo quán (C) → tên + '__' + storeId
 *     (vd stock_transactions_gieogieo__gg02, active_units_gieogieo__gg02/…) — collection / gốc RT RIÊNG;
 *   · dữ liệu dùng chung (G) và dùng chung với XOFA / The Cafe 33 (X) → tên cũ cho mọi quán.
 *   · CHƯA ĐĂNG NHẬP cửa hàng (storeId null — POS chưa nhập mã): mọi S / C bị CHẶN (báo lỗi), chỉ đọc được G / X
 *     → máy chưa đăng nhập không bao giờ ghi nhầm vào chỗ của quán nào.
 *
 * Danh mục NL / BTP (C — chủ dự án chốt 05/10): mỗi quán có BẢN DANH MỤC RIÊNG, tồn nằm trong bản của quán
 * (y như quán hiện tại → engine không đổi). Quản lý cài với catalogMirror: true → MỌI lượt ghi danh mục đi qua
 * doc(...).set/update/delete, collection(...).add, batch() TỰ ĐỘNG ghi cùng các trường đó sang mọi quán khác đã sẵn
 * danh mục (KHÔNG BAO GIỜ chép trường tồn — STATE_FIELDS; lượt ghi chỉ có trường tồn → không đồng bộ, không tốn
 * lượt đọc). Không phải sửa từng hàm của Quản lý, chỗ ghi danh mục viết sau này cũng tự đồng bộ.
 * Xoá món chỉ khi các quán khác hết tồn món đó (chặn trước khi xoá). POS không bật (không sửa danh mục).
 *
 * Bảng đăng ký REG phải đủ mọi tên app + engine dùng — tools/check_paths.js (predeploy_check) chặn tên mới
 * chưa đăng ký. Lúc chạy: tên lạ ở quán hiện tại → đi tiếp như cũ + cảnh báo; ở quán khác / chưa đăng nhập → lỗi.
 */
(function (root) {
  'use strict';
  const VERSION = '4.0.0';
  const LEGACY = 'gg01';
  const SUFFIX = '__';
  const S = 'S', C = 'C', G = 'G', X = 'X';
  const STORES_COLL = 'stores_gieogieo';
  const BIND_KEY = 'gieo_store_v1';
  // Tên Firestore — bỏ hậu tố _gieogieo cho gọn, thêm lại ở dưới.
  const FS_S = ['alerts', 'assets', 'assist_profile_effects', 'bill_deletions', 'book_closings', 'cash_drawer_logs', 'cashfund',
    'checklist_activity_logs', 'checkout_side_effects', 'cogs', 'daily_closings', 'daily_openings', 'daily_ops',
    'daily_sales_cache', 'dup_recovery', 'duty_cases', 'duty_digests', 'duty_tasks', 'duty_verify_undo',
    'employee_shifts', 'employee_stock_deductions', 'expenses', 'finance', 'handover_counts', 'handover_records',
    'label_reprints', 'ledger_day_summaries', 'order_cancel_marks', 'order_stock_traces', 'payroll_month_adjustments', 'prep_batches',
    'prep_forecasts', 'prep_ingredient_locks', 'prep_shortage_recons', 'prep_transactions', 'purchase_orders',
    'receiving_records', 'refill_rules', 'reversal_unit_claims', 'sales_assist_logs', 'shift_inventory_counts',
    'shift_segments', 'shift_workflows', 'staff_notes', 'staff_target_config', 'staff_target_days',
    'stock_anomalies', 'stock_containers', 'stock_counts', 'stock_label_reports', 'stock_lost_reports',
    'stock_transactions', 'storage_locations', 'work_schedules'];
  const FS_C = ['inventory_items', 'prep_items'];
  const FS_G = ['audit_logs', 'config_history', 'duty_config', 'employees', 'expense_categories', 'hr_settings',
    'ingredient_original_packs', 'loyalty_bill_effects', 'loyalty_pending_retry', 'note_reasons',
    'packaging_bagging_rules', 'packaging_bagging_table', 'packaging_item_overrides', 'packaging_presets',
    'packaging_rules', 'packaging_rules_config', 'payment_methods',
    'prep_recipe_history', 'prep_vessels', 'price_history', 'recipe_history', 'recipe_suggestions', 'recipes',
    'shift_checklists', 'special_days', 'stamp_free_redemptions', 'stores', 'topping_recipes', 'waste_reasons'];
  const REG = { fs: {}, rt: {}, st: {} };
  FS_S.forEach(n => { REG.fs[n + '_gieogieo'] = S; });
  FS_C.forEach(n => { REG.fs[n + '_gieogieo'] = C; });
  FS_G.forEach(n => { REG.fs[n + '_gieogieo'] = G; });
  REG.fs.orders_gieogieo_archive = S;
  REG.fs.customers = X;   // dùng chung với XOFA / The Cafe 33 — không đổi cấu trúc
  // Realtime DB — gốc (đoạn đầu của đường dẫn).
  ['active_units', 'orders', 'billCounters', 'rev_marks', 'duty_verify_fence', 'printer_layout', 'sales_assist_stats']
    .forEach(n => { REG.rt[n + '_gieogieo'] = S; });
  ['menu', 'menu_togo', 'food', 'food_menu', 'toppings', 'togoSettings', 'sales_assist_config', 'appFeeSettings']
    .forEach(n => { REG.rt[n + '_gieogieo'] = G; });
  REG.rt.bank_confirmations = X;   // webhook Cloud Run ghi chung 3 thương hiệu; mã CK quán mới có mã quán
  REG.rt['.info'] = G;             // giờ máy chủ, trạng thái kết nối
  // Storage — không bọc (ảnh phiếu nhận đặt theo mã phiếu, mã phiếu không trùng giữa quán); chỉ để check_paths biết tên.
  REG.st.receiving_photos_gieogieo = G;

  // Trường TỒN / trạng thái riêng từng quán trên doc danh mục — KHÔNG BAO GIỜ đồng bộ sang quán khác.
  const STATE_FIELDS = ['currentStock', 'locationStock', 'unrefilledConsumption', 'refillUncertain', 'pendingShortage',
    'untrackedPendingDelta', 'untrackedBase', '_ueLastRecomputeStart', '_ueRtStale', 'lastCount', 'temCutoverAt',
    'temCutoverSnapshot', 'yieldActualAvg', 'yieldSampleCount', 'yieldVariancePct', 'yieldStatsAt', 'shiftWeighPending',
    'prepSaleHeld', 'updatedAt'];
  const STATE = new Set(STATE_FIELDS);
  // Trường DANH MỤC (Quản lý khai) — công cụ "Đồng bộ danh mục" chỉ chép đúng các trường này.
  const CATALOG_FIELDS = {
    inventory_items_gieogieo: ['name', 'unit', 'minStock', 'costPerUnit', 'packagingUnits', 'staffCounts', 'isPackagingMaterial',
      'trackingMode', 'countUnitName', 'stockManaged', 'openShelfLifeHours', 'printOpenLabel', 'prepWholePack', 'vesselIds',
      'originalPackId', 'densityGPerMl', 'shiftCountTiming', 'substitutes', 'active'],
    prep_items_gieogieo: ['code', 'name', 'unit', 'wastePct', 'batchYield', 'batchInputs', 'costPerUnit', 'totalInputCost',
      'shelfLifeType', 'shelfLifeHours', 'prepTimeMinutes', 'dailyTarget', 'vesselIds', 'instructions', 'substitutes', 'active']
  };
  // Tồn khởi đầu của bản danh mục mới ở quán khác.
  const STATE_DEFAULT = { currentStock: 0 };
  // Cấu hình theo quán chép sẵn từ quán hiện tại khi tạo quán mới (sửa lại sau ở Quản lý của quán đó).
  const COPY_ON_CREATE = ['refill_rules_gieogieo', 'storage_locations_gieogieo'];

  const st = { storeId: LEGACY, installed: false, mirror: false, xemTatCa: false, khoa: Promise.resolve(), unknown: new Set(), O: null, storesCache: null, storesAt: 0 };
  const clean = p => String(p == null ? '' : p).replace(/^\/+|\/+$/g, '');
  const laQuanCu = id => id === LEGACY;
  const hopLe = id => typeof id === 'string' && /^gg\d{2}$/.test(id);
  function lamTen(kind, name, storeId) {
    const loai = REG[kind][name];
    if (!loai) {
      if (!st.unknown.has(kind + ':' + name)) { st.unknown.add(kind + ':' + name); try { console.warn('[GieoData] tên chưa đăng ký: ' + kind + ':' + name); } catch (e) {} }
      if (laQuanCu(storeId)) return name;
      throw new Error('[GieoData] tên chưa đăng ký "' + name + '" — không cho ghi/đọc ở cửa hàng ' + (storeId || '(chưa đăng nhập)'));
    }
    if (loai === S || loai === C) {
      if (!storeId) throw new Error('[GieoData] máy chưa đăng nhập cửa hàng — chặn "' + name + '"');
      return laQuanCu(storeId) ? name : name + SUFFIX + storeId;
    }
    return name;
  }
  // Đổi đoạn ĐẦU của đường dẫn 'goc/a/b' theo quán; phần sau giữ nguyên.
  function doiGoc(kind, p, storeId) {
    p = clean(p);
    const i = p.indexOf('/');
    const goc = i < 0 ? p : p.slice(0, i), con = i < 0 ? '' : p.slice(i);
    if (!goc) {
      if (laQuanCu(storeId)) return p;
      throw new Error('[GieoData] truy cập gốc cơ sở dữ liệu bị chặn ở cửa hàng ' + (storeId || '(chưa đăng nhập)'));
    }
    return lamTen(kind, goc, storeId) + con;
  }
  const fsPath = (p, storeId) => doiGoc('fs', p, storeId === undefined ? st.storeId : storeId);
  const rtPath = (p, storeId) => doiGoc('rt', p, storeId === undefined ? st.storeId : storeId);

  function install(opts) {
    const fstore = opts && opts.fstore, db = opts && opts.db;
    if (!fstore || !db) throw new Error('GieoData.install: thiếu fstore / db');
    if (st.installed) throw new Error('GieoData.install: đã cài rồi');
    const storeId = opts.storeId == null || opts.storeId === '' ? null : String(opts.storeId);
    if (storeId !== null && !hopLe(storeId)) throw new Error('GieoData.install: mã cửa hàng không hợp lệ "' + storeId + '"');
    st.storeId = storeId;
    st.xemTatCa = storeId === null;
    st.mirror = !!opts.catalogMirror;
    const O = st.O = { coll: fstore.collection.bind(fstore), doc: fstore.doc ? fstore.doc.bind(fstore) : null,
      group: fstore.collectionGroup ? fstore.collectionGroup.bind(fstore) : null, batch: fstore.batch.bind(fstore),
      ref: db.ref.bind(db), fromUrl: db.refFromURL ? db.refFromURL.bind(db) : null };
    fstore.collection = function (p) { const c = O.coll(fsPath(p)); return st.mirror ? ganColl(c, clean(p)) : c; };
    if (O.doc) fstore.doc = function (p) {
      const d = O.doc(fsPath(p)), q = clean(p).split('/');
      return st.mirror && q.length === 2 ? ganDoc(d, q[0]) : d;
    };
    if (st.mirror) fstore.batch = function () { return ganBatch(O.batch()); };
    if (O.group) fstore.collectionGroup = function (id) {
      if (laQuanCu(st.storeId)) return O.group(id);
      throw new Error('[GieoData] collectionGroup bị chặn ở cửa hàng ' + (st.storeId || '(chưa đăng nhập)'));
    };
    db.ref = function (p) { return (p == null && laQuanCu(st.storeId)) ? O.ref() : O.ref(rtPath(p)); };
    if (O.fromUrl) db.refFromURL = function (u) {
      if (laQuanCu(st.storeId)) return O.fromUrl(u);
      throw new Error('[GieoData] refFromURL bị chặn ở cửa hàng ' + (st.storeId || '(chưa đăng nhập)'));
    };
    st.installed = true;
    return api;
  }

  // ── Gắn máy POS với cửa hàng (localStorage; chế độ thử có khoá riêng nhờ che_do_thu) ──
  const binding = {
    read() {
      try {
        const v = JSON.parse(root.localStorage.getItem(BIND_KEY) || 'null');
        return v && hopLe(v.storeId) && typeof v.code === 'string' ? v : null;
      } catch (e) { return null; }
    },
    save(v) { root.localStorage.setItem(BIND_KEY, JSON.stringify(v)); },
    clear() { try { root.localStorage.removeItem(BIND_KEY); } catch (e) {} }
  };

  // ── Danh sách cửa hàng (stores_gieogieo — dùng chung) ──
  const can = () => { if (!st.O) throw new Error('GieoData: chưa install'); return st.O; };
  async function stores(force) {
    if (!force && st.storesCache && Date.now() - st.storesAt < 30000) return st.storesCache;
    const snap = await can().coll(STORES_COLL).get();
    st.storesCache = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    st.storesAt = Date.now();
    return st.storesCache;
  }
  async function findStoreByCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    const snap = await can().coll(STORES_COLL).where('code', '==', code).limit(2).get();
    const ds = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(s => hopLe(s.id) && s.active !== false);
    return ds.length === 1 ? ds[0] : null;
  }
  // collection của MỘT quán bất kỳ (đi qua lớp dưới — chế độ thử vẫn áp dụng).
  const collFor = (name, storeId) => can().coll(lamTen('fs', name, storeId));
  const khac = async () => (await stores()).filter(s => s.id !== st.storeId && hopLe(s.id) && s.active !== false && s.catalogReady);
  // Bỏ trường tồn / trạng thái (kể cả dạng 'lastCount.suspect' — xét đoạn đầu).
  const boState = obj => { const o = {}; Object.keys(obj || {}).forEach(k => { if (!STATE.has(k.split('.')[0])) o[k] = obj[k]; }); return o; };
  const phaiDanhMuc = name => { if (REG.fs[name] !== C) throw new Error('GieoData: ' + name + ' không phải danh mục theo quán'); };

  // Sau khi ghi danh mục ở quán đang chạy: ghi CÙNG các trường đó sang mọi quán khác đã sẵn danh mục.
  // op: 'update' | 'merge' (set merge / set đè — quán khác chỉ merge, không xoá tồn của họ) | 'create' (kèm tồn 0) | 'delete'.
  // Không bao giờ chép trường tồn. Lỗi KHÔNG ném ra (quán đang chạy đã ghi xong) — báo qua onCatalogSyncError.
  async function catalogSync(name, id, patch, op) {
    phaiDanhMuc(name);
    op = op || 'merge';
    const kq = { ok: [], loi: [] };
    const p = boState(patch);
    if ((op === 'update' || op === 'merge') && !Object.keys(p).length) return kq;   // chỉ trường tồn → không đồng bộ
    let others;
    try { others = await khac(); } catch (e) { kq.loi.push({ storeId: '*', error: 'không đọc được danh sách cửa hàng: ' + String(e && e.message || e) }); baoLoi(name, id, kq); return kq; }
    for (const s of others) {
      try {
        const ref = collFor(name, s.id).doc(String(id));
        if (op === 'delete') await ref.delete();
        else if (op === 'create') await ref.set(Object.assign(p, STATE_DEFAULT));
        else if (op === 'update') await ref.update(p);
        else await ref.set(p, { merge: true });
        kq.ok.push(s.id);
      } catch (e) {
        const thieu = e && (e.code === 'not-found' || /No document to update/i.test(String(e.message)));
        kq.loi.push({ storeId: s.id, error: thieu ? 'quán này chưa có món — bấm "Đồng bộ danh mục" ở Cấu hình ▸ Cửa hàng' : String(e && e.message || e) });
      }
    }
    if (kq.loi.length) baoLoi(name, id, kq);
    return kq;
  }
  function baoLoi(name, id, kq) {
    try { console.error('[GieoData] đồng bộ danh mục lỗi', name, id, kq.loi); } catch (e) {}
    if (typeof api.onCatalogSyncError === 'function') { try { api.onCatalogSyncError({ name, id, loi: kq.loi }); } catch (e) {} }
  }
  // Xoá món ở quán đang chạy: chặn TRƯỚC nếu quán khác còn tồn (xoá theo sẽ làm mồ côi tồn / tem của họ).
  async function chanXoa(name, id) {
    const con = await catalogStockElsewhere(name, id);
    if (con.length) throw new Error('Không xoá được: ' + con.map(c => c.name + ' còn tồn ' + c.currentStock).join(', ') + ' — xử lý tồn ở quán đó trước');
  }
  // ── Gắn đồng bộ vào ref của app (chỉ khi catalogMirror) — giữ nguyên đối tượng SDK (batch / transaction nhận được) ──
  const laDanhMuc = name => REG.fs[name] === C;
  function ganDoc(d, name) {
    if (!laDanhMuc(name) || !d || d.__gdDanhMuc) return d;
    const id = d.id, oSet = d.set, oUpd = d.update, oDel = d.delete;
    d.__gdDanhMuc = name;
    d.set = async function (data, o) { const r = await oSet.apply(this, arguments); await catalogSync(name, id, data, 'merge'); return r; };
    d.update = async function (a) {
      const r = await oUpd.apply(this, arguments);
      let patch = a;
      if (typeof a === 'string') { patch = {}; for (let i = 0; i + 1 < arguments.length; i += 2) patch[arguments[i]] = arguments[i + 1]; }
      await catalogSync(name, id, patch, 'update'); return r;
    };
    d.delete = async function () { await chanXoa(name, id); const r = await oDel.apply(this, arguments); await catalogSync(name, id, null, 'delete'); return r; };
    return d;
  }
  function ganColl(c, p) {
    if (!laDanhMuc(p) || !c || c.__gdDanhMuc) return c;
    const oDoc = c.doc, oAdd = c.add;
    c.__gdDanhMuc = p;
    c.doc = function () { return ganDoc(oDoc.apply(this, arguments), p); };
    if (oAdd) c.add = async function (data) { const r = await oAdd.apply(this, arguments); await catalogSync(p, r.id, data, 'create'); return r; };
    return c;
  }
  function ganBatch(b) {
    const ops = [], oSet = b.set, oUpd = b.update, oDel = b.delete, oCommit = b.commit;
    b.set = function (ref, data, o) { if (ref && ref.__gdDanhMuc) ops.push([ref.__gdDanhMuc, ref.id, data, 'merge']); oSet.apply(this, arguments); return b; };
    b.update = function (ref, a) {
      if (ref && ref.__gdDanhMuc) {
        let patch = a;
        if (typeof a === 'string') { patch = {}; for (let i = 1; i + 1 < arguments.length; i += 2) patch[arguments[i]] = arguments[i + 1]; }
        ops.push([ref.__gdDanhMuc, ref.id, patch, 'update']);
      }
      oUpd.apply(this, arguments); return b;
    };
    b.delete = function (ref) { if (ref && ref.__gdDanhMuc) ops.push([ref.__gdDanhMuc, ref.id, null, 'delete']); oDel.apply(this, arguments); return b; };
    b.commit = async function () {
      for (const [n, id, , op] of ops) if (op === 'delete') await chanXoa(n, id);
      const r = await oCommit.apply(this, arguments);
      for (const [n, id, data, op] of ops) await catalogSync(n, id, data, op);
      return r;
    };
    return b;
  }
  // Quán khác còn tồn món này? (chặn xoá danh mục làm mồ côi tồn / tem của quán khác)
  async function catalogStockElsewhere(name, id) {
    phaiDanhMuc(name);
    const out = [];
    for (const s of await khac()) {
      const d = await collFor(name, s.id).doc(String(id)).get();
      if (d.exists && (Number(d.data().currentStock) || 0) !== 0) out.push({ storeId: s.id, name: s.name || s.id, currentStock: Number(d.data().currentStock) || 0 });
    }
    return out;
  }
  const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
  async function ghiLo(ops) {   // ops: [[ref, data, opts]] — batch ≤ 400
    for (const part of chunks(ops, 400)) {
      const b = can().batch();
      part.forEach(([ref, data, o]) => (o ? b.set(ref, data, o) : b.set(ref, data)));
      await b.commit();
    }
  }
  // Tạo quán mới: chép danh mục (chỉ trường danh mục, tồn = 0) + cấu hình COPY_ON_CREATE từ quán đang chạy.
  async function seedNewStore(newId) {
    if (!hopLe(newId) || newId === st.storeId) throw new Error('GieoData.seedNewStore: mã quán không hợp lệ');
    const dem = {};
    for (const name of Object.keys(CATALOG_FIELDS)) {
      const snap = await collFor(name, st.storeId).get();
      const ops = snap.docs.map(d => { const src = d.data(), o = {};
        CATALOG_FIELDS[name].forEach(k => { if (src[k] !== undefined) o[k] = src[k]; });
        return [collFor(name, newId).doc(d.id), Object.assign(o, STATE_DEFAULT, { createdAt: new Date().toISOString() })]; });
      await ghiLo(ops); dem[name] = ops.length;
    }
    for (const name of COPY_ON_CREATE) {
      const snap = await collFor(name, st.storeId).get();
      const ops = snap.docs.map(d => [collFor(name, newId).doc(d.id), d.data()]);
      await ghiLo(ops); dem[name] = ops.length;
    }
    return dem;
  }
  // Kiểm / sửa LỆCH danh mục giữa quán đang chạy và các quán khác (chỉ trường CATALOG_FIELDS).
  async function catalogDiff(apply) {
    const res = [];
    const others = await khac();
    for (const name of Object.keys(CATALOG_FIELDS)) {
      const master = {}; (await collFor(name, st.storeId).get()).docs.forEach(d => { master[d.id] = d.data(); });
      for (const s of others) {
        const there = {}; (await collFor(name, s.id).get()).docs.forEach(d => { there[d.id] = d.data(); });
        const ops = [];
        for (const [id, m] of Object.entries(master)) {
          const o = {}; CATALOG_FIELDS[name].forEach(k => { if (m[k] !== undefined && JSON.stringify(m[k]) !== JSON.stringify((there[id] || {})[k])) o[k] = m[k]; });
          if (!there[id]) { res.push({ storeId: s.id, name, id, kind: 'thieu' }); ops.push([collFor(name, s.id).doc(id), Object.assign(o, STATE_DEFAULT)]); }
          else if (Object.keys(o).length) { res.push({ storeId: s.id, name, id, kind: 'lech', fields: Object.keys(o) }); ops.push([collFor(name, s.id).doc(id), o, { merge: true }]); }
        }
        Object.keys(there).forEach(id => { if (!master[id]) res.push({ storeId: s.id, name, id, kind: 'thua' }); });
        if (apply && ops.length) await ghiLo(ops);
      }
    }
    return res;
  }

  // ── [Bước 3] Quản lý "Xem tất cả cửa hàng": app cài với storeId null (mọi dữ liệu riêng bị chặn) và chỉ đọc
  // từng quán qua withStore — đổi tạm quán đang chạy cho đúng một hàm, TUẦN TỰ (khoá), xong trả về null.
  // Chỉ dùng được ở chế độ đó: ở chế độ một quán, đổi quán giữa chừng sẽ làm lệnh ghi đang chạy rơi sang quán khác.
  // fn phải await hết mọi lời gọi Firestore / RT của nó (đường dẫn quyết định lúc gọi collection() / ref()).
  function withStore(id, fn) {
    if (!st.installed || !st.xemTatCa) return Promise.reject(new Error('GieoData.withStore chỉ dùng ở chế độ xem tất cả cửa hàng'));
    if (!hopLe(id)) return Promise.reject(new Error('GieoData.withStore: mã cửa hàng không hợp lệ "' + id + '"'));
    const run = st.khoa.then(async () => {
      st.storeId = id;
      try { return await fn(id); } finally { st.storeId = null; }
    });
    st.khoa = run.catch(() => {});
    return run;
  }

  const api = {
    VERSION, LEGACY, REG, STATE_FIELDS, CATALOG_FIELDS, STORES_COLL,
    install,
    storeId: () => st.storeId,
    laQuanCu: () => laQuanCu(st.storeId),
    daDangNhap: () => !!st.storeId,
    hopLe,
    ckCode: id => { id = id === undefined ? st.storeId : id; return hopLe(id) ? id.slice(2) : ''; },
    fsName: (name, storeId) => lamTen('fs', name, storeId === undefined ? st.storeId : storeId),
    fsPath, rtPath,
    binding, stores, findStoreByCode, collFor,
    catalogSync, catalogStockElsewhere, seedNewStore, catalogDiff,
    withStore, xemTatCa: () => st.xemTatCa,
    onCatalogSyncError: null,   // Quản lý gán hàm báo (toast) — lỗi đồng bộ danh mục sang quán khác
    unknown: () => Array.from(st.unknown)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports.GieoData = api;
  root.GieoData = api;
})(typeof window !== 'undefined' ? window : this);
