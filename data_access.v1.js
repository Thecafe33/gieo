/* Gieo Gieo — LỚP ĐƯỜNG DẪN ĐA CỬA HÀNG (data_access.v1.js) — Bước 1, docs/KE_HOACH_DA_CUA_HANG.md
 *
 * Một chỗ duy nhất quyết định dữ liệu của QUÁN NÀO nằm ở đâu. Cài một lần ngay sau khi tạo fstore / db
 * (GieoData.install), bọc ở gốc SDK — cùng cách chế độ thử (che_do_thu) — nên app và Unit Engine
 * KHÔNG phải sửa lời gọi nào:
 *   Firestore  collection('x') / doc('x/…')   Realtime DB  ref('x/…')
 *   · quán hiện tại 'gg01' (mã GG01)  → TÊN CŨ, y hệt hôm nay (không chuyển dữ liệu, không đổi gì);
 *   · quán khác, dữ liệu riêng từng quán (S) → tên + '__' + storeId   (vd stock_transactions_gieogieo__gg02,
 *     active_units_gieogieo__gg02/…) — collection / gốc RT RIÊNG, không lồng dưới gốc của quán hiện tại;
 *   · dữ liệu dùng chung (G) và dùng chung với XOFA / The Cafe 33 (X) → tên cũ cho mọi quán.
 * Bảng đăng ký REG phải đủ mọi tên app + engine dùng — tools/check_paths.js (chạy trong predeploy_check)
 * chặn tên mới chưa đăng ký. Lúc chạy: tên lạ ở quán hiện tại → đi tiếp như cũ + ghi cảnh báo;
 * tên lạ ở quán khác → BÁO LỖI (không bao giờ ghi nhầm vào chỗ của quán hiện tại).
 * Bước 1 chỉ cho chạy quán 'gg01' (quán khác cần Bước 2: tồn theo quán, đăng nhập cửa hàng).
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const LEGACY = 'gg01';
  const SUFFIX = '__';
  const S = 'S', G = 'G', X = 'X';
  // Tên Firestore — bỏ hậu tố _gieogieo cho gọn, thêm lại ở dưới.
  const FS_S = ['alerts', 'assets', 'assist_profile_effects', 'bill_deletions', 'book_closings', 'cashfund',
    'checklist_activity_logs', 'checkout_side_effects', 'cogs', 'daily_closings', 'daily_openings', 'daily_ops',
    'daily_sales_cache', 'dup_recovery', 'duty_cases', 'duty_digests', 'duty_tasks', 'duty_verify_undo',
    'employee_shifts', 'employee_stock_deductions', 'expenses', 'finance', 'handover_counts', 'handover_records',
    'label_reprints', 'ledger_day_summaries', 'order_cancel_marks', 'order_stock_traces', 'prep_batches',
    'prep_forecasts', 'prep_ingredient_locks', 'prep_shortage_recons', 'prep_transactions', 'purchase_orders',
    'receiving_records', 'refill_rules', 'reversal_unit_claims', 'sales_assist_logs', 'shift_inventory_counts',
    'shift_segments', 'shift_workflows', 'staff_notes', 'staff_target_config', 'staff_target_days',
    'stock_anomalies', 'stock_containers', 'stock_counts', 'stock_label_reports', 'stock_lost_reports',
    'stock_transactions', 'storage_locations', 'work_schedules', 'store_item_state'];
  const FS_G = ['audit_logs', 'config_history', 'duty_config', 'employees', 'expense_categories', 'hr_settings',
    'ingredient_original_packs', 'inventory_items', 'loyalty_bill_effects', 'loyalty_pending_retry', 'note_reasons',
    'packaging_bagging_rules', 'packaging_bagging_table', 'packaging_item_overrides', 'packaging_presets',
    'packaging_rules', 'packaging_rules_config', 'payment_methods', 'payroll_month_adjustments', 'prep_items',
    'prep_recipe_history', 'prep_vessels', 'price_history', 'recipe_history', 'recipe_suggestions', 'recipes',
    'shift_checklists', 'special_days', 'stamp_free_redemptions', 'stores', 'topping_recipes', 'waste_reasons'];
  const REG = { fs: {}, rt: {}, st: {} };
  FS_S.forEach(n => { REG.fs[n + '_gieogieo'] = S; });
  FS_G.forEach(n => { REG.fs[n + '_gieogieo'] = G; });
  REG.fs.orders_gieogieo_archive = S;
  REG.fs.customers = X;   // dùng chung với XOFA / The Cafe 33 — không đổi cấu trúc
  // Realtime DB — gốc (đoạn đầu của đường dẫn).
  ['active_units', 'orders', 'billCounters', 'rev_marks', 'duty_verify_fence', 'printer_layout', 'sales_assist_stats']
    .forEach(n => { REG.rt[n + '_gieogieo'] = S; });
  ['menu', 'menu_togo', 'food', 'food_menu', 'toppings', 'togoSettings', 'sales_assist_config', 'appFeeSettings']
    .forEach(n => { REG.rt[n + '_gieogieo'] = G; });
  REG.rt.bank_confirmations = X;   // webhook Cloud Run ghi chung cho 3 thương hiệu; mã CK quán mới có mã quán (Bước 2)
  REG.rt['.info'] = G;             // giờ máy chủ, trạng thái kết nối
  // Storage — không bọc (ảnh phiếu nhận đặt theo mã phiếu, mã phiếu không trùng giữa quán); chỉ để check_paths biết tên.
  REG.st.receiving_photos_gieogieo = G;

  const st = { storeId: LEGACY, installed: false, unknown: new Set() };
  const clean = p => String(p == null ? '' : p).replace(/^\/+|\/+$/g, '');
  const laQuanCu = id => id === LEGACY;
  function lamTen(kind, name, storeId) {
    const loai = REG[kind][name];
    if (!loai) {
      if (!st.unknown.has(kind + ':' + name)) { st.unknown.add(kind + ':' + name); try { console.warn('[GieoData] tên chưa đăng ký: ' + kind + ':' + name); } catch (e) {} }
      if (laQuanCu(storeId)) return name;
      throw new Error('[GieoData] tên chưa đăng ký "' + name + '" — không cho ghi/đọc ở cửa hàng ' + storeId);
    }
    return (loai === S && !laQuanCu(storeId)) ? name + SUFFIX + storeId : name;
  }
  // Đổi đoạn ĐẦU của đường dẫn 'goc/a/b' theo quán; phần sau giữ nguyên.
  function doiGoc(kind, p, storeId) {
    p = clean(p);
    const i = p.indexOf('/');
    const goc = i < 0 ? p : p.slice(0, i), con = i < 0 ? '' : p.slice(i);
    if (!goc) {
      if (laQuanCu(storeId)) return p;
      throw new Error('[GieoData] truy cập gốc cơ sở dữ liệu bị chặn ở cửa hàng ' + storeId);
    }
    return lamTen(kind, goc, storeId) + con;
  }
  const fsPath = (p, storeId) => doiGoc('fs', p, storeId == null ? st.storeId : storeId);
  const rtPath = (p, storeId) => doiGoc('rt', p, storeId == null ? st.storeId : storeId);

  function install(opts) {
    const fstore = opts && opts.fstore, db = opts && opts.db;
    if (!fstore || !db) throw new Error('GieoData.install: thiếu fstore / db');
    if (st.installed) throw new Error('GieoData.install: đã cài rồi');
    const storeId = String(opts.storeId || LEGACY);
    if (!/^gg\d{2}$/.test(storeId)) throw new Error('GieoData.install: mã cửa hàng không hợp lệ "' + storeId + '"');
    if (!laQuanCu(storeId) && !opts.allowMulti) throw new Error('GieoData.install: Bước 1 chỉ chạy cửa hàng ' + LEGACY);
    st.storeId = storeId;
    const O = { coll: fstore.collection.bind(fstore), doc: fstore.doc ? fstore.doc.bind(fstore) : null,
      group: fstore.collectionGroup ? fstore.collectionGroup.bind(fstore) : null,
      ref: db.ref.bind(db), fromUrl: db.refFromURL ? db.refFromURL.bind(db) : null };
    fstore.collection = function (p) { return O.coll(fsPath(p)); };
    if (O.doc) fstore.doc = function (p) { return O.doc(fsPath(p)); };
    if (O.group) fstore.collectionGroup = function (id) {
      if (laQuanCu(st.storeId)) return O.group(id);
      throw new Error('[GieoData] collectionGroup bị chặn ở cửa hàng ' + st.storeId);
    };
    db.ref = function (p) { return (p == null && laQuanCu(st.storeId)) ? O.ref() : O.ref(rtPath(p)); };
    if (O.fromUrl) db.refFromURL = function (u) {
      if (laQuanCu(st.storeId)) return O.fromUrl(u);
      throw new Error('[GieoData] refFromURL bị chặn ở cửa hàng ' + st.storeId);
    };
    st.installed = true;
    return api;
  }

  const api = {
    VERSION, LEGACY, REG,
    install,
    storeId: () => st.storeId,
    laQuanCu: () => laQuanCu(st.storeId),
    fsName: (name, storeId) => lamTen('fs', name, storeId == null ? st.storeId : storeId),
    fsPath, rtPath,
    unknown: () => Array.from(st.unknown)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports.GieoData = api;
  root.GieoData = api;
})(typeof window !== 'undefined' ? window : this);
