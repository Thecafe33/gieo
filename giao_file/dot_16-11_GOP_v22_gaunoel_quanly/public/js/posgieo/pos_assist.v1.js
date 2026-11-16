// Tách từ posgieo.html dòng 28050–29298 (tools/tach_posgieo/chuyen.js, 2026-10-25). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_assist.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).assist = 'dang';

const ASSIST_CFG_FB_PATH   = 'sales_assist_config_gieogieo';

const ASSIST_STATS_FB_PATH = 'sales_assist_stats_gieogieo';

const ASSIST_LOG_COLL      = 'sales_assist_logs_gieogieo';

const ASSIST_CFG_LS_KEY    = 'salesAssistConfig_gieogieo';

const ASSIST_STATS_LS_KEY  = 'salesAssistStats_gieogieo';

// Trần cứng số gợi ý hiển thị cùng lúc. Cấu hình có thể đặt 1 hoặc 2, nhưng
// KHÔNG BAO GIỜ vượt được số này — xem nguyên tắc 1 ở đầu khối.
const ASSIST_MAX_HARD = 3;

// Cấu hình mặc định — dùng khi Firebase chưa có gì (quán mới cài, hoặc mất
// mạng lần đầu). Mọi khoá ở đây đều có màn cấu hình tương ứng bên app Quản lý.
const ASSIST_DEFAULT_CONFIG = {
  enabled: true,
  maxSuggestions: 3,
  logEnabled: true,

  // Thứ tự ưu tiên khi nhiều loại gợi ý cùng xuất hiện (rank nhỏ = quan trọng
  // hơn = được hiện trước). Đúng thứ tự đã chốt trong yêu cầu:
  //   1 xác nhận thông tin khách → 2 khuyến mãi gần đạt → 3 tem sắp đủ
  //   → 4 upsale AOV cao → 5 topping hợp món → 6 còn lại
  kinds: {
    customer_check: { enabled: true, rank: 1 },
    promo_near:     { enabled: true, rank: 2 },
    loyalty:        { enabled: true, rank: 3 },
    upsell:         { enabled: true, rank: 4 },
    topping:        { enabled: true, rank: 5 },
    other:          { enabled: true, rank: 6 }
  },

  topping: {
    maxCards: 2,          // tối đa mấy DÒNG món được gợi ý topping cùng lúc
    maxPerCard: 3,        // tối đa mấy topping trong một gợi ý (yêu cầu: ≤3)
    minRate: 0.12,        // tỉ lệ khách chọn topping này với món này tối thiểu
    minSample: 5,         // số ly đã bán tối thiểu mới đủ tin để gợi ý theo số liệu
    pushToppingIds: [],   // topping đang cần đẩy bán — quán tự chọn
    pushBoost: 30,
    customerBoost: 45,    // topping chính khách này hay dùng → đẩy lên đầu
    excludeToppingIds: [],
    pairs: {}             // { itemId: [toppingId,...] } — cặp món/topping quán tự khai, luôn thắng số liệu
  },

  upsell: {
    autoUpsize: { enabled: true, minGapPrice: 0 }, // gợi ý nâng size khi món còn size lớn hơn
    rules: []             // luật tự khai — xem assistProviderUpsell()
  },

  campaigns: [],          // chiến dịch KM cấu hình được — xem assistProviderCampaigns()

  loyalty: {
    enabled: true,
    stampTarget: 6,       // đủ bao nhiêu tem thì tặng 1 ly
    dailyCap: 2,          // trần tem/ngày/khách — phải khớp loyaltyAddStamps()
    nearGap: 2            // còn thiếu ≤ ngần này tem thì mới gợi ý mời mua thêm
  },

  customerCheck: {
    ice: true, topping: true, size: true, favItem: false,
    minOrders: 2,         // khách phải mua ít nhất ngần này đơn mới đủ để nói "thường"
    minRatio: 0.6         // và thói quen phải chiếm ít nhất ngần này tỉ lệ
  }
};

let assistConfig = JSON.parse(JSON.stringify(ASSIST_DEFAULT_CONFIG));

let assistStats  = { items: {}, toppings: {}, updatedAt: null, days: 0 };

// Trạng thái phiên bán hàng hiện tại. Reset mỗi khi chốt đơn / xoá giỏ.
//   shown     — gợi ý đã HIỆN RA (key → bản ghi log). Hiện lại không ghi đè.
//   dismissed — nhân viên bấm "Bỏ qua": không hiện lại cho tới hết đơn này.
let _assistShown = {};

let _assistDismissed = new Set();

let _assistMainExpanded = false;

let _assistLocalStatsCache = null;

let _assistLocalStatsAt = 0;

// ────────────────────────────────────────────────────────────────────────────
// NẠP CẤU HÌNH & SỐ LIỆU
// ────────────────────────────────────────────────────────────────────────────
// Trộn nông theo từng nhóm (giống loadTogoSettings) — cloud thiếu khoá nào thì
// giữ mặc định khoá đó, thêm khoá mới ở bản sau không làm vỡ máy chưa cập nhật.
function _assistMergeConfig(raw) {
  const d = ASSIST_DEFAULT_CONFIG;
  const c = raw || {};
  return {
    enabled:        c.enabled !== false,
    maxSuggestions: Math.max(1, Math.min(ASSIST_MAX_HARD, Number(c.maxSuggestions) || d.maxSuggestions)),
    logEnabled:     c.logEnabled !== false,
    kinds:          (() => {
                      // Trộn SÂU từng loại: cloud gửi {topping:{enabled:false}} thì
                      // rank mặc định của loại đó vẫn phải còn, nếu không mọi gợi ý
                      // rơi về rank 9 và thứ tự ưu tiên mất sạch.
                      const k = {};
                      Object.keys(d.kinds).forEach(n => { k[n] = Object.assign({}, d.kinds[n], (c.kinds || {})[n] || {}); });
                      Object.keys(c.kinds || {}).forEach(n => { if (!k[n]) k[n] = Object.assign({ enabled: true, rank: 6 }, c.kinds[n]); });
                      return k;
                    })(),
    topping:        Object.assign({}, d.topping, c.topping || {}),
    upsell:         Object.assign({}, d.upsell, c.upsell || {}),
    campaigns:      Array.isArray(c.campaigns) ? c.campaigns : [],
    loyalty:        Object.assign({}, d.loyalty, c.loyalty || {}),
    customerCheck:  Object.assign({}, d.customerCheck, c.customerCheck || {})
  };
}

function assistLoadLocalCache() {
  try {
    const rawCfg = localStorage.getItem(ASSIST_CFG_LS_KEY);
    if (rawCfg) assistConfig = _assistMergeConfig(JSON.parse(rawCfg));
  } catch (e) {}
  try {
    const rawSt = localStorage.getItem(ASSIST_STATS_LS_KEY);
    if (rawSt) assistStats = JSON.parse(rawSt) || assistStats;
  } catch (e) {}
}

// Gắn listener SAU khi auth xong (cùng lý do đã ghi ở syncTgSettingsFromCloud:
// gắn trước lúc đăng nhập thì rule Firebase từ chối và listener chết hẳn).
function assistInit() {
  db.ref(ASSIST_CFG_FB_PATH).on('value', snap => {
    const cloud = snap.val();
    if (!cloud) return;            // chưa ai cấu hình — giữ mặc định/cache
    assistConfig = _assistMergeConfig(cloud);
    try { localStorage.setItem(ASSIST_CFG_LS_KEY, JSON.stringify(assistConfig)); } catch (e) {}
    assistRefresh();
  }, err => console.warn('[assist] Lỗi đọc cấu hình gợi ý:', err));

  db.ref(ASSIST_STATS_FB_PATH).on('value', snap => {
    const cloud = snap.val();
    if (!cloud) return;
    assistStats = { items: cloud.items || {}, toppings: cloud.toppings || {}, updatedAt: cloud.updatedAt || null, days: cloud.days || 0 };
    try { localStorage.setItem(ASSIST_STATS_LS_KEY, JSON.stringify(assistStats)); } catch (e) {}
    assistRefresh();
  }, err => console.warn('[assist] Lỗi đọc số liệu gợi ý:', err));
}

// Bảng tần suất DỰ PHÒNG tính ngay tại POS từ mảng orders[] đang có sẵn trong
// bộ nhớ (loadRecentOrders đã nạp vài ngày gần nhất). Nhờ nó, quán vừa bật tính
// năng đã có gợi ý topping hợp lý ngay, không phải chờ app Quản lý dựng bảng.
// Bảng chính thức (assistStats từ cloud) luôn được ưu tiên vì quét được nhiều
// ngày hơn; hàm này chỉ lấp chỗ trống.
function assistLocalStats() {
  const now = Date.now();
  if (_assistLocalStatsCache && now - _assistLocalStatsAt < 120000) return _assistLocalStatsCache;
  const items = {};
  (orders || []).forEach(o => {
    (o.itemsArray || []).forEach(c => {
      if (!c || !c.itemId || c.isFood) return;
      const q = Number(c.qty) || 1;
      const rec = items[c.itemId] || (items[c.itemId] = { cups: 0, toppings: {} });
      rec.cups += q;
      (c.toppings || []).forEach(t => {
        if (!t) return;
        const tid = t.id || ('name:' + (t.name || ''));
        const tr = rec.toppings[tid] || (rec.toppings[tid] = { name: t.name || '', cups: 0 });
        tr.cups += q;
      });
    });
  });
  _assistLocalStatsCache = { items };
  _assistLocalStatsAt = now;
  return _assistLocalStatsCache;
}

// Số liệu của một món: ưu tiên bảng cloud, thiếu thì lấy bảng tính tại chỗ.
function assistItemStats(itemId) {
  const cloud = (assistStats.items || {})[itemId];
  if (cloud && Number(cloud.cups) > 0) return cloud;
  return (assistLocalStats().items || {})[itemId] || null;
}

// ────────────────────────────────────────────────────────────────────────────
// TIỆN ÍCH ĐỌC GIỎ HÀNG
// ────────────────────────────────────────────────────────────────────────────
// Các dòng "món thật" — bỏ dòng mã giảm giá / voucher toàn đơn (chúng nằm chung
// trong cart nhưng không có itemId, xem renderCartDrawer).
function assistCartLines() {
  return Object.entries(cart)
    .filter(([, c]) => c && c.itemId && !c._discountId && !c._vKey)
    .map(([key, c]) => ({ key, c }));
}

// Dòng khách TRẢ TIỀN (bỏ ly tặng) — mọi phép đếm điều kiện khuyến mãi đều
// phải dùng cái này, nếu không ly tặng tự đẻ ra lượt tặng tiếp theo.
function assistPaidLines() {
  return assistCartLines().filter(x => !x.c.isFree && Number(x.c.price) > 0);
}

function assistDrinkLines() {
  return assistCartLines().filter(x => !x.c.isFood);
}

function assistPaidDrinkQty() {
  return assistPaidLines().filter(x => !x.c.isFood).reduce((s, x) => s + (Number(x.c.qty) || 0), 0);
}

function assistCartQty() { return getCartTotalQty(); }

function assistCartHasFreeCup() { return Object.values(cart).some(c => c && c.isFree === true); }

function assistMenuItem(itemId) { return getActiveMenu().find(m => m.id === itemId) || null; }

// Chữ ký giỏ hàng tại một thời điểm — dùng để biết SAU khi gợi ý hiện ra thì
// giỏ có thay đổi đúng hướng gợi ý hay không (mục 12: khách có đồng ý không).
function assistCartSignature() {
  const tp = {};
  assistCartLines().forEach(x => (x.c.toppings || []).forEach(t => {
    const id = t.id || ('name:' + (t.name || ''));
    tp[id] = (tp[id] || 0) + tpQty(t);
  }));
  const sizes = {};
  assistCartLines().forEach(x => { if (x.c.size) sizes[x.c.size] = (sizes[x.c.size] || 0) + (Number(x.c.qty) || 0); });
  return {
    qty: assistCartQty(),
    total: getCartTotal(),
    toppings: tp,
    sizes,
    ice: assistDrinkLines().map(x => iceMode(x.c)).join(',')
  };
}

function assistEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER 1 — XÁC NHẬN THÔNG TIN KHÁCH (ưu tiên cao nhất)
// ────────────────────────────────────────────────────────────────────────────
// So thói quen đã ghi nhận của khách (assist_profile trên doc customers) với
// những gì nhân viên đang chọn. Lệch → nhắc HỎI LẠI, không tự sửa.
// Đây là loại gợi ý duy nhất mang tính "phòng sai sót" nên đứng trên cả khuyến
// mãi: chọn nhầm đá chung cho khách quen uống đá riêng là hỏng cả trải nghiệm,
// còn quên mời thêm 1 ly thì chỉ mất một cơ hội.
function assistProviderCustomerCheck(out) {
  const cfg = assistConfig.customerCheck || {};
  if (!curCustomer || !loyaltyCustomer) return;
  const p = loyaltyCustomer.assist_profile;
  if (!p || (Number(p.orders) || 0) < (Number(cfg.minOrders) || 2)) return;
  const totalOrders = Number(p.orders) || 0;
  const minRatio = Number(cfg.minRatio) || 0.6;
  // [Bảo mật] tên khách do bên ngoài nhập (bảng customers dùng chung XOFA / The Cafe 33) và câu gợi ý vẽ bằng innerHTML
  // (_assistCardHTML) → BẮT BUỘC escape, như tên món / topping / size ở các câu dưới.
  const tenKhach = assistEsc(curCustomer.name || 'Khách');

  // ── Thói quen về ĐÁ ──
  if (cfg.ice !== false && p.ice) {
    const entries = Object.entries(p.ice).filter(([, n]) => Number(n) > 0);
    const tong = entries.reduce((s, [, n]) => s + Number(n), 0);
    if (tong > 0) {
      const [mode, cnt] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
      const ratio = Number(cnt) / tong;
      const dangChon = assistDrinkLines().map(x => iceMode(x.c));
      const khac = dangChon.length && dangChon.some(m => m !== mode);
      if (ratio >= minRatio && khac) {
        out.push({
          key: 'cust_ice_' + mode,
          kind: 'customer_check',
          icon: '⚠️',
          tone: 'warn',
          score: 100 + Math.round(ratio * 100),
          text: `Hỏi lại khách về đá — ${tenKhach} thường chọn <b>${assistEsc(ICE_LABELS[mode] || mode)}</b>, đơn này đang để khác.`,
          actLabel: 'Chỉnh đá',
          act: { type: 'ice' },
          meta: { field: 'ice', preferred: mode, ratio: Math.round(ratio * 100) }
        });
      }
    }
  }

  // ── Thói quen về TOPPING ──
  if (cfg.topping !== false && p.toppings) {
    const dangCo = new Set();
    assistCartLines().forEach(x => (x.c.toppings || []).forEach(t => dangCo.add(t.id || ('name:' + (t.name || '')))));
    const ungVienTp = Object.entries(p.toppings)
      .map(([tid, n]) => ({ tid, n: Number(n) || 0 }))
      .filter(t => t.n / totalOrders >= minRatio && !dangCo.has(t.tid))
      .sort((a, b) => b.n - a.n)[0];
    if (ungVienTp) {
      const tp = TOPPINGS.find(t => t.id === ungVienTp.tid);
      const line = assistPaidLines().filter(x => !x.c.isFood)[0];
      if (tp && line) {
        out.push({
          key: 'cust_tp_' + ungVienTp.tid,
          kind: 'customer_check',
          icon: '⚠️',
          tone: 'warn',
          score: 90 + Math.round((ungVienTp.n / totalOrders) * 100),
          text: `Hỏi lại khách có thêm <b>${assistEsc(tp.name)}</b> không — ${tenKhach} hay dùng topping này.`,
          actLabel: 'Thêm ' + tp.name,
          act: { type: 'topping', cartKey: line.key, toppingId: tp.id },
          meta: { field: 'topping', toppingId: tp.id, toppingName: tp.name }
        });
      }
    }
  }

  // ── Thói quen về SIZE ──
  if (cfg.size !== false && p.sizes) {
    const entries = Object.entries(p.sizes).filter(([, n]) => Number(n) > 0);
    const tong = entries.reduce((s, [, n]) => s + Number(n), 0);
    if (tong > 0) {
      const [size, cnt] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
      const ratio = Number(cnt) / tong;
      const dangCo = assistDrinkLines().some(x => x.c.size === size);
      if (ratio >= minRatio && assistDrinkLines().length && !dangCo) {
        out.push({
          key: 'cust_size_' + size,
          kind: 'customer_check',
          icon: '⚠️',
          tone: 'warn',
          score: 80 + Math.round(ratio * 100),
          text: `Xác nhận lại size với khách — ${tenKhach} thường mua <b>size ${assistEsc(size)}</b>.`,
          actLabel: 'Đã hỏi khách',
          act: { type: 'none' },
          meta: { field: 'size', preferred: size }
        });
      }
    }
  }

  // ── Món ruột (mặc định TẮT: dễ thành mời mọc, bật khi quán muốn) ──
  if (cfg.favItem === true && p.items) {
    const dangCo = new Set(assistCartLines().map(x => x.c.itemId));
    const best = Object.entries(p.items).map(([id, n]) => ({ id, n: Number(n) || 0 }))
      .filter(x => x.n / totalOrders >= minRatio && !dangCo.has(x.id))
      .sort((a, b) => b.n - a.n)[0];
    const m = best && assistMenuItem(best.id);
    if (m) {
      out.push({
        key: 'cust_item_' + best.id,
        kind: 'other',
        icon: '💡',
        tone: 'info',
        score: 50,
        text: `${tenKhach} hay mua <b>${assistEsc(m.name)}</b> — hỏi khách hôm nay có lấy không.`,
        actLabel: 'Đã hỏi khách',
        act: { type: 'none' },
        meta: { field: 'favItem', itemId: best.id }
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER 2 — KHUYẾN MÃI GẦN ĐẠT ĐIỀU KIỆN
// ────────────────────────────────────────────────────────────────────────────
// (a) Hai chương trình có sẵn trong màn Khuyến mãi: mua X tặng Y, giảm giá theo
//     số ly. Đọc thẳng togoSettings để không phải khai lại lần hai — sửa bên
//     màn Khuyến mãi là gợi ý đổi theo ngay.
function assistProviderTogoPromo(out) {
  const g = togoSettings.gift || {};
  const d = togoSettings.discount || {};
  const totalQty = assistCartQty();

  const giftQty = giftEligibleQtyPOS(), sz = giftSizeNotePOS();   // điều kiện size (nếu có khai)
  if (g.enabled && Number(g.buyQty) > 0 && giftQty > 0 && !assistCartHasFreeCup()) {
    const buyQty = Number(g.buyQty), freeQty = Number(g.freeQty) || 1;
    if (giftQty >= buyQty) {
      const soLuot = Math.floor(giftQty / buyQty);
      out.push({
        key: 'promo_gift_met',
        kind: 'promo_near',
        icon: '🎁',
        tone: 'gift',
        score: 200,
        text: `Đơn đã đủ ${buyQty} ly${sz} — báo khách được tặng <b>${soLuot * freeQty} ly</b>, mời khách chọn món tặng.`,
        short: `Đủ ${buyQty} ly${sz} — khách được tặng <b>${soLuot * freeQty} ly</b>.`,
        actLabel: 'Đã báo khách',
        act: { type: 'none' },
        meta: { promo: 'togo_gift', state: 'met', buyQty, freeQty, have: giftQty }
      });
    } else {
      const thieu = buyQty - giftQty;
      // Chỉ gợi ý khi còn thiếu không quá 1/3 chặng — thiếu 4/5 ly mà mời thêm
      // là ép mua, khách khó chịu.
      if (thieu > 0 && thieu <= Math.max(1, Math.ceil(buyQty / 3))) {
        out.push({
          key: 'promo_gift_near',
          kind: 'promo_near',
          icon: '💡',
          tone: 'gift',
          score: 190 - thieu,
          text: `Đơn hiện có ${giftQty} ly${sz} — mời khách mua thêm <b>${thieu} ly${sz}</b> để được tặng ${freeQty} ly.`,
          short: `Thêm <b>${thieu} ly${sz}</b> nữa → khách được tặng ${freeQty} ly.`,
          actLabel: 'Thêm món',
          act: { type: 'menu' },
          meta: { promo: 'togo_gift', state: 'near', gap: thieu, buyQty, freeQty, have: giftQty }
        });
      }
    }
  }

  if (d.enabled && Number(d.minQty) > 0 && Number(d.pct) > 0 && totalQty > 0 && totalQty < Number(d.minQty)) {
    const thieu = Number(d.minQty) - totalQty;
    if (thieu <= Math.max(1, Math.ceil(Number(d.minQty) / 3))) {
      out.push({
        key: 'promo_disc_near',
        kind: 'promo_near',
        icon: '💡',
        tone: 'gift',
        score: 170 - thieu,
        text: `Mời khách mua thêm <b>${thieu} ly</b> để được giảm ${d.pct}% cả đơn.`,
        short: `Thêm <b>${thieu} ly</b> nữa → giảm ${d.pct}% cả đơn.`,
        actLabel: 'Thêm món',
        act: { type: 'menu' },
        meta: { promo: 'togo_discount', state: 'near', gap: thieu, pct: d.pct }
      });
    }
  }
}

// (b) CHIẾN DỊCH CẤU HÌNH ĐƯỢC — chỗ để làm 8.8 / 9.9 / sinh nhật quán mà
//     KHÔNG đụng vào code. Một chiến dịch gồm:
//       { id, name, enabled, from, to, weekdays[], scope, conditions[],
//         nearGap, swapFromSize, sayNear, sayMet, saySwap }
//     conditions[] là AND của các điều kiện đếm được trên giỏ:
//       {type:'qty_total', min}          — tổng số ly
//       {type:'qty_size',  size, min}    — số ly theo size
//       {type:'qty_item',  itemId, min}  — số ly một món cụ thể
//       {type:'qty_type',  menuType,min} — số ly theo nhóm menu (TRÀ, CÀ PHÊ...)
//       {type:'amount',    min}          — tổng tiền
//     Đủ hết → sayMet. Thiếu ĐÚNG MỘT điều kiện và khoảng thiếu ≤ nearGap →
//     sayNear. Riêng điều kiện theo size, nếu giỏ đang có đủ số ly ở size khác
//     (swapFromSize) thì gợi ý ĐỔI SIZE thay vì mua thêm — đúng ví dụ 9.9
//     "khách đang có 2 ly M, đổi sang L thì được tặng 1 ly M".
function _assistCampaignActive(cp) {
  if (!cp || cp.enabled === false) return false;
  const now = vnDate();
  const p = n => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  if (cp.from && today < cp.from) return false;
  if (cp.to && today > cp.to) return false;
  if (Array.isArray(cp.weekdays) && cp.weekdays.length && !cp.weekdays.map(Number).includes(now.getDay())) return false;
  if (cp.scope === 'dinein') return false;   // [F5] chiến dịch chỉ-Tại-quán không bao giờ áp (chỉ bán To Go)
  return true;
}

function _assistEvalCondition(cond) {
  const lines = assistPaidLines();
  const soLy = arr => arr.reduce((s, x) => s + (Number(x.c.qty) || 0), 0);
  const need = Number(cond.min) || 0;
  let have = 0;
  switch (cond.type) {
    case 'qty_total': have = soLy(lines); break;
    case 'qty_size':  have = soLy(lines.filter(x => String(x.c.size || '').toUpperCase() === String(cond.size || '').toUpperCase())); break;
    case 'qty_item':  have = soLy(lines.filter(x => x.c.itemId === cond.itemId)); break;
    case 'qty_type':  have = soLy(lines.filter(x => { const m = assistMenuItem(x.c.itemId); return m && m.type === cond.menuType; })); break;
    case 'amount':    have = getCartTotal(); break;
    default:          return null;
  }
  return { have, need, gap: Math.max(0, need - have), ok: have >= need };
}

function _assistFillText(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

function assistProviderCampaigns(out) {
  (assistConfig.campaigns || []).forEach(cp => {
    if (!_assistCampaignActive(cp)) return;
    const conds = Array.isArray(cp.conditions) ? cp.conditions : [];
    if (!conds.length) return;
    const results = conds.map(c => ({ cond: c, r: _assistEvalCondition(c) })).filter(x => x.r);
    if (!results.length) return;
    const thieu = results.filter(x => !x.r.ok);
    const tenCT = cp.name || 'Ưu đãi hôm nay';

    if (!thieu.length) {
      if (!cp.sayMet) return;
      out.push({
        key: 'camp_met_' + (cp.id || tenCT),
        kind: 'promo_near',
        icon: '🎁',
        tone: 'gift',
        score: 210 + (Number(cp.priorityBoost) || 0),
        text: assistEsc(_assistFillText(cp.sayMet, { ten: tenCT })),
        actLabel: 'Đã báo khách',
        act: { type: 'none' },
        meta: { campaignId: cp.id || null, campaignName: tenCT, state: 'met' }
      });
      return;
    }
    if (thieu.length > 1) return;   // thiếu từ 2 điều kiện trở lên thì còn xa quá, không mời

    const t = thieu[0];
    const gapMax = Number(t.cond.nearGap != null ? t.cond.nearGap : (cp.nearGap != null ? cp.nearGap : 1));
    const vars = { ten: tenCT, thieu: t.r.gap, can: t.r.need, co: t.r.have, size: t.cond.size || '' };

    // Ưu tiên gợi ý ĐỔI SIZE nếu giỏ đã có sẵn đủ ly ở size khác.
    if (t.cond.type === 'qty_size' && cp.swapFromSize && cp.saySwap) {
      const daCo = assistPaidLines()
        .filter(x => String(x.c.size || '').toUpperCase() === String(cp.swapFromSize).toUpperCase())
        .reduce((s, x) => s + (Number(x.c.qty) || 0), 0);
      if (daCo >= t.r.gap) {
        out.push({
          key: 'camp_swap_' + (cp.id || tenCT),
          kind: 'promo_near',
          icon: '🎁',
          tone: 'gift',
          score: 205 + (Number(cp.priorityBoost) || 0),
          text: assistEsc(_assistFillText(cp.saySwap, Object.assign({ doi: Math.min(daCo, t.r.gap), tuSize: cp.swapFromSize }, vars))),
          actLabel: 'Đã hỏi khách',
          act: { type: 'none' },
          meta: { campaignId: cp.id || null, campaignName: tenCT, state: 'swap', gap: t.r.gap }
        });
        return;
      }
    }

    if (t.r.gap > gapMax || !cp.sayNear) return;
    out.push({
      key: 'camp_near_' + (cp.id || tenCT),
      kind: 'promo_near',
      icon: '💡',
      tone: 'gift',
      score: 195 + (Number(cp.priorityBoost) || 0) - t.r.gap,
      text: assistEsc(_assistFillText(cp.sayNear, vars)),
      actLabel: 'Thêm món',
      act: { type: 'menu' },
      meta: { campaignId: cp.id || null, campaignName: tenCT, state: 'near', gap: t.r.gap }
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER 3 — QUYỀN LỢI TÍCH TEM
// ────────────────────────────────────────────────────────────────────────────
// Bám sát ĐÚNG luật đang chạy trong loyaltyAddStamps() — nếu không sẽ hứa sai:
//   · trần dailyCap tem/ngày/khách (mặc định 2)
//   · bill có ly tặng "mua X tặng Y" thì KHÔNG tích tem (xem confirmPay)
function assistProviderLoyalty(out) {
  const cfg = assistConfig.loyalty || {};
  if (cfg.enabled === false) return;
  if (!curCustomer || !loyaltyCustomer) return;

  const target = Number(cfg.stampTarget) || 6;
  const freeDrink = Number(loyaltyCustomer.free_drink_available) || 0;
  const stamps = Number(loyaltyCustomer.stamp_count) || 0;

  // Khách đã có ly miễn phí trong tay — quyền lợi ĐANG CÓ, phải nói ngay.
  if (freeDrink > 0) {
    out.push({
      key: 'loy_have_free',
      kind: 'loyalty',
      icon: '🎁',
      tone: 'gift',
      score: 160 + freeDrink,
      text: `Khách đã đủ ${target} tem — báo khách được nhận <b>${freeDrink} ly miễn phí</b>, bấm "Đổi ngay" ở thẻ khách hàng.`,
      short: `Khách có <b>${freeDrink} ly miễn phí</b> — báo khách đổi.`,
      actLabel: 'Đã báo khách',
      act: { type: 'none' },
      meta: { loyalty: 'free_available', freeDrink }
    });
  }

  // Bill có ly tặng thì không tích tem — im lặng, đừng hứa nhầm.
  if (assistCartHasFreeCup()) return;
  if (stamps >= target) return;         // đã tính ở nhánh freeDrink

  const daCoHomNay = (loyaltyCustomer.last_stamp_date === loyaltyTodayStr())
    ? (Number(loyaltyCustomer.stamps_today) || 0) : 0;
  const conNhanDuoc = Math.max(0, (Number(cfg.dailyCap) || 2) - daCoHomNay);
  if (conNhanDuoc <= 0) return;         // hôm nay hết trần tem, mời thêm cũng không có tem

  const soLy = assistPaidDrinkQty();
  const seThem = Math.min(soLy, conNhanDuoc);
  const sauDon = stamps + seThem;

  if (sauDon >= target) {
    out.push({
      key: 'loy_will_reach',
      kind: 'loyalty',
      icon: '🎁',
      tone: 'gift',
      score: 155,
      text: `Sau đơn này khách đủ <b>${target} tem</b> — báo khách lần tới được 1 ly miễn phí.`,
      short: `Sau đơn này khách đủ <b>${target} tem</b>.`,
      actLabel: 'Đã báo khách',
      act: { type: 'none' },
      meta: { loyalty: 'will_reach', stamps, add: seThem, target }
    });
    return;
  }

  const thieu = target - sauDon;
  const nearGap = Number(cfg.nearGap != null ? cfg.nearGap : 2);
  // Chỉ mời thêm khi số ly cần thêm THỰC SỰ còn tích được tem hôm nay, nếu
  // không thì mời khách mua thêm cũng chẳng đủ tem — nói ra là sai.
  const coTheThem = Math.min(thieu, conNhanDuoc - seThem);
  if (thieu > 0 && thieu <= nearGap && coTheThem > 0) {
    out.push({
      key: 'loy_near',
      kind: 'loyalty',
      icon: '💡',
      tone: 'gift',
      score: 150 - thieu,
      text: `Khách sắp đủ ${target} tem — mời khách mua thêm <b>${coTheThem} ly</b> để nhận 1 ly miễn phí.`,
      short: `Thêm <b>${coTheThem} ly</b> là khách đủ ${target} tem.`,
      actLabel: 'Thêm món',
      act: { type: 'menu' },
      meta: { loyalty: 'near', stamps, gap: thieu, target }
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER 4 — UPSALE TĂNG AOV
// ────────────────────────────────────────────────────────────────────────────
// (a) Nâng size: món đang bán size nhỏ mà còn size lớn hơn → gợi ý kèm chênh
//     lệch tiền để nhân viên nói được ngay "thêm 6.000đ lên size L".
// (b) Luật tự khai trong app Quản lý:
//       { id, name, enabled, kind:'attach'|'custom', when:{itemIds[], minQty,
//         requireNoFood}, suggestItemIds[], say }
function assistProviderUpsell(out) {
  const cfg = assistConfig.upsell || {};

  const au = cfg.autoUpsize || {};
  if (au.enabled !== false) {
    let best = null;
    assistPaidLines().filter(x => !x.c.isFood).forEach(x => {
      const m = assistMenuItem(x.c.itemId);
      if (!m || !Array.isArray(m.sizes) || m.sizes.length < 2) return;
      const cur = m.sizes.find(s => s.label === x.c.size);
      if (!cur) return;
      const bigger = m.sizes.filter(s => (Number(s.price) || 0) > (Number(cur.price) || 0))
        .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))[0];
      if (!bigger) return;
      const chenh = (Number(bigger.price) || 0) - (Number(cur.price) || 0);
      if (chenh <= (Number(au.minGapPrice) || 0)) return;
      // Chọn ly có chênh lệch RẺ NHẤT — dễ gật đầu nhất, không phải ly đắt nhất.
      if (!best || chenh < best.chenh) best = { x, m, bigger, chenh };
    });
    if (best) {
      out.push({
        key: 'ups_size_' + best.x.key + '_' + best.bigger.label,
        kind: 'upsell',
        icon: '💡',
        tone: 'info',
        score: 120 - Math.min(60, Math.round(best.chenh / 1000)),
        text: `Mời khách nâng <b>${assistEsc(best.m.name)}</b> lên size ${assistEsc(best.bigger.label)} — chỉ thêm ${fmt(best.chenh)}.`,
        short: `Nâng <b>${assistEsc(best.m.name)}</b> lên size ${assistEsc(best.bigger.label)}: +${fmt(best.chenh)}.`,
        actLabel: 'Đổi size ' + best.bigger.label,
        act: { type: 'upsize', cartKey: best.x.key, size: best.bigger.label },
        meta: { upsell: 'upsize', itemId: best.m.id, fromSize: best.x.c.size, toSize: best.bigger.label, delta: best.chenh }
      });
    }
  }

  (cfg.rules || []).forEach(rule => {
    if (!rule || rule.enabled === false || !rule.say) return;
    const w = rule.when || {};
    const lines = assistPaidLines();
    if (!lines.length) return;
    if (Array.isArray(w.itemIds) && w.itemIds.length && !lines.some(x => w.itemIds.includes(x.c.itemId))) return;
    if (Number(w.minQty) > 0 && assistCartQty() < Number(w.minQty)) return;
    if (w.requireNoFood && lines.some(x => x.c.isFood)) return;
    if (Number(w.minAmount) > 0 && getCartTotal() < Number(w.minAmount)) return;
    out.push({
      key: 'ups_rule_' + (rule.id || rule.name || Math.random().toString(36).slice(2)),
      kind: 'upsell',
      icon: '💡',
      tone: 'info',
      score: 110 + (Number(rule.priorityBoost) || 0),
      text: assistEsc(_assistFillText(rule.say, { qty: assistCartQty(), tong: fmt(getCartTotal()) })),
      actLabel: rule.kind === 'attach' ? 'Thêm món' : 'Đã hỏi khách',
      act: rule.kind === 'attach' ? { type: 'menu' } : { type: 'none' },
      meta: { upsell: 'rule', ruleId: rule.id || null, ruleName: rule.name || '' }
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER 5 — TOPPING HỢP MÓN
// ────────────────────────────────────────────────────────────────────────────
// KHÔNG gợi ý ngẫu nhiên. Điểm của một topping với một món cộng từ bốn nguồn,
// nguồn nào cũng có thể tắt/chỉnh trong app Quản lý:
//   · cặp món–topping quán tự khai (pairs)      → +60, luôn thắng số liệu
//   · topping đang cần đẩy bán (pushToppingIds) → +pushBoost
//   · chính khách này hay dùng (assist_profile) → +customerBoost
//   · tỉ lệ khách chọn topping đó VỚI MÓN ĐÓ    → +0..100 theo tỉ lệ thật
// Topping chỉ lọt vào danh sách khi: được khai cặp, đang đẩy bán, khách quen
// dùng, HOẶC đủ mẫu (minSample ly) và đạt tỉ lệ tối thiểu (minRate).
function assistProviderTopping(out) {
  const cfg = assistConfig.topping || {};
  if (!TOPPINGS.length) return;
  const loai = new Set(cfg.excludeToppingIds || []);
  const push = new Set(cfg.pushToppingIds || []);
  const pairs = cfg.pairs || {};
  const profTp = (curCustomer && loyaltyCustomer && loyaltyCustomer.assist_profile && loyaltyCustomer.assist_profile.toppings) || {};
  const profOrders = (curCustomer && loyaltyCustomer && loyaltyCustomer.assist_profile && Number(loyaltyCustomer.assist_profile.orders)) || 0;

  const maxCards = Math.max(1, Number(cfg.maxCards) || 2);
  const maxPer = Math.max(1, Math.min(3, Number(cfg.maxPerCard) || 3));
  const minRate = Number(cfg.minRate) || 0;
  const minSample = Number(cfg.minSample) || 0;

  // [QUAN TRỌNG] Bỏ qua ly thuộc chương trình TẶNG topping cho thành viên đang
  // chạy. Mời khách MUA đúng cái mà quán đang sẵn sàng TẶNG là tự bắn vào chân:
  // hoặc khách mua rồi phát hiện ra đáng lẽ được tặng, hoặc nhân viên phải rút
  // lại lời mời. Luồng tặng topping đã có sẵn (renderFreeTpReminder nhắc xin SĐT,
  // checkFreeToppingMemberPromo mở popup chọn ở màn thanh toán) — để nó lo.
  const freeTpOn = !!(togoSettings.freeTopping && togoSettings.freeTopping.enabled);

  // Ưu tiên ly CHƯA có topping (cơ hội upsale rõ nhất), rồi tới ly đắt tiền hơn.
  const ungVien = assistPaidLines()
    .filter(x => !x.c.isFood && !x.c.freeTpApplied)
    .filter(x => !(freeTpOn && isFreeTpEligibleItem(x.c.itemId)))
    .sort((a, b) => {
      const aTrong = (a.c.toppings || []).length === 0 ? 0 : 1;
      const bTrong = (b.c.toppings || []).length === 0 ? 0 : 1;
      if (aTrong !== bTrong) return aTrong - bTrong;
      return (Number(b.c.price) || 0) - (Number(a.c.price) || 0);
    });

  let soThe = 0;
  for (const x of ungVien) {
    if (soThe >= maxCards) break;
    const st = assistItemStats(x.c.itemId);
    const cups = st ? (Number(st.cups) || 0) : 0;
    const daCo = new Set((x.c.toppings || []).map(t => t.id || ('name:' + (t.name || ''))));
    const khaiCap = new Set(pairs[x.c.itemId] || []);

    const diem = TOPPINGS.filter(t => !loai.has(t.id) && !daCo.has(t.id)).map(t => {
      const rec = st && st.toppings ? st.toppings[t.id] : null;
      const cnt = rec ? (Number(rec.cups) || 0) : 0;
      const rate = cups > 0 ? cnt / cups : 0;
      let s = Math.round(rate * 100);
      let ly = [];
      if (khaiCap.has(t.id)) { s += 60; ly.push('cặp khai sẵn'); }
      if (push.has(t.id))    { s += Number(cfg.pushBoost) || 0; ly.push('đang đẩy bán'); }
      if (profOrders > 0 && Number(profTp[t.id]) > 0) {
        s += Math.round((Number(cfg.customerBoost) || 0) * Math.min(1, Number(profTp[t.id]) / profOrders));
        ly.push('khách hay dùng');
      }
      const duSoLieu = cups >= minSample && rate >= minRate && cnt > 0;
      if (duSoLieu) ly.push(Math.round(rate * 100) + '% khách chọn');
      const nhan = khaiCap.has(t.id) || push.has(t.id) || (profOrders > 0 && Number(profTp[t.id]) > 0) || duSoLieu;
      return { t, s, nhan, rate, cnt, ly };
    }).filter(d => d.nhan).sort((a, b) => b.s - a.s).slice(0, maxPer);

    if (!diem.length) continue;
    soThe++;
    const tenMon = x.c.name + (x.c.size ? ' ' + x.c.size : '');
    out.push({
      key: 'tp_' + x.key,
      kind: 'topping',
      icon: '💡',
      tone: 'info',
      score: 60 + diem[0].s,
      text: `Gợi ý thêm topping cho <b>${assistEsc(tenMon)}</b> — chạm vào topping khi khách đồng ý:`,
      short: `Thêm topping cho <b>${assistEsc(tenMon)}</b>?`,
      chips: diem.map(d => ({
        label: d.t.name,
        sub: d.ly[0] || '',
        act: { type: 'topping', cartKey: x.key, toppingId: d.t.id }
      })),
      actLabel: null,
      act: { type: 'none' },
      meta: {
        cartKey: x.key, itemId: x.c.itemId, itemName: x.c.name,
        toppingIds: diem.map(d => d.t.id),
        toppingNames: diem.map(d => d.t.name),
        rates: diem.map(d => Math.round(d.rate * 100))
      }
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// XẾP HẠNG & CẮT NGỌN
// ────────────────────────────────────────────────────────────────────────────
function assistBuild() {
  if (!assistConfig.enabled) return [];
  if (!assistCartLines().length) return [];
  const out = [];
  const chay = (fn, ten) => { try { fn(out); } catch (err) { console.warn('[assist] provider ' + ten + ' lỗi:', err); } };
  chay(assistProviderCustomerCheck, 'customer_check');
  chay(assistProviderTogoPromo,     'togo_promo');
  chay(assistProviderCampaigns,     'campaigns');
  chay(assistProviderLoyalty,       'loyalty');
  chay(assistProviderUpsell,        'upsell');
  chay(assistProviderTopping,       'topping');

  const K = assistConfig.kinds || {};
  const gioiHan = Math.max(1, Math.min(ASSIST_MAX_HARD, Number(assistConfig.maxSuggestions) || ASSIST_MAX_HARD));
  const thay = new Set();
  return out
    .filter(s => s && s.key && !_assistDismissed.has(s.key))
    .filter(s => (K[s.kind] || {}).enabled !== false)
    .filter(s => { if (thay.has(s.key)) return false; thay.add(s.key); return true; })
    .sort((a, b) => {
      const ra = Number((K[a.kind] || {}).rank) || 9;
      const rb = Number((K[b.kind] || {}).rank) || 9;
      if (ra !== rb) return ra - rb;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    })
    .slice(0, gioiHan);
}

// ────────────────────────────────────────────────────────────────────────────
// GIAO DIỆN
// ────────────────────────────────────────────────────────────────────────────
const ASSIST_TONE = {
  warn: { bg: '#fff7e6', bd: '#fbbf24', fg: '#92400e' },
  gift: { bg: '#ecfdf5', bd: '#34d399', fg: '#065f46' },
  info: { bg: '#eff6ff', bd: '#93c5fd', fg: '#1e40af' }
};

// Loại gợi ý KHÔNG được lên pill nổi ở màn order.
// SĐT chỉ nhập được ở màn thanh toán, nên mọi gợi ý dựa trên hồ sơ khách bản
// chất là việc "kiểm tra lại trước khi chốt" — đúng chỗ của nó là giỏ hàng và
// màn thanh toán. Đẩy lên màn order thì hoặc chưa có dữ liệu để nói, hoặc nói
// đúng lúc nhân viên đang bấm món và không ai đọc. (Gợi ý tem thì vẫn để lại:
// "mời khách mua thêm 1 ly cho đủ tem" là việc phải làm NGAY lúc đang order,
// không phải lúc đã chốt xong đơn.)
const ASSIST_MAIN_HIDE = ['customer_check'];

let _assistCurrent = [];

function _assistChipHTML(c, idx, ci, tone, showSub) {
  return `<button class="as-chip" style="border-color:${tone.bd};color:${tone.fg};" onclick="assistChip(${idx},${ci})">
    + ${assistEsc(c.label)}${(showSub && c.sub) ? `<small>${assistEsc(c.sub)}</small>` : ''}</button>`;
}

// Một thẻ = một dòng: icon · chữ · nút. `compact` (dùng cho pill nổi ở màn
// order) chỉ hiện MỘT hành động — lựa chọn tốt nhất — để dòng không bị vỡ;
// mở rộng ra mới thấy đủ các lựa chọn còn lại.
function _assistCardHTML(s, idx, compact, moreCount) {
  const t = ASSIST_TONE[s.tone] || ASSIST_TONE.info;
  const chips = s.chips || [];
  let act = '';
  if (chips.length) {
    act = (compact ? chips.slice(0, 1) : chips).map((c, ci) => _assistChipHTML(c, idx, ci, t, !compact)).join('');
  } else if (s.actLabel) {
    act = `<button class="as-btn" style="background:${t.fg};" onclick="assistAccept(${idx})">${assistEsc(s.actLabel)}</button>`;
  }
  // Còn gợi ý khác → nút đếm để mở rộng, thay cho nút bỏ qua (bỏ qua vẫn có
  // đủ ở trạng thái mở rộng). Chỉ một gợi ý → cho bỏ qua ngay tại chỗ.
  const duoi = (compact && moreCount > 0)
    ? `<button class="as-more" style="border-color:${t.bd};color:${t.fg};" onclick="assistToggleMain()" title="Xem các gợi ý còn lại">+${moreCount} ⌄</button>`
    : `<button class="as-x" style="color:${t.fg};" onclick="assistSkip(${idx})" title="Bỏ qua gợi ý này">✕</button>`;
  return `<div class="as-card${compact ? ' compact' : ''}" style="background:${t.bg};border-color:${t.bd};">
    <span class="as-ic">${s.icon || '💡'}</span>
    <div class="as-tx" style="color:${t.fg};">${compact ? (s.short || s.text) : s.text}</div>
    <div class="as-act">${act}</div>
    ${duoi}
  </div>`;
}

// Vẽ ra cả ba chỗ:
//   main — pill nổi ở màn order. Thu gọn còn ĐÚNG MỘT thẻ; lưới menu tự co lại
//          đúng bằng chiều cao pill (xem CSS body.assist-main-on #sm) nên pill
//          không bao giờ đè lên món hay nút bấm.
//   cart / sc — thanh đầy đủ (tối đa 3), lúc này nhân viên đang rà lại đơn.
function assistRender() {
  const all = _assistCurrent.map((s, i) => ({ s, i }));
  const wrap = h => h ? `<div class="as-wrap">${h}</div>` : '';
  const full = wrap(all.map(x => _assistCardHTML(x.s, x.i, false)).join(''));

  const nodeCart = document.getElementById('assistBarCart');
  const nodeSc   = document.getElementById('assistBarSc');
  const nodeMain = document.getElementById('assistBarMain');
  if (nodeCart) { nodeCart.innerHTML = full; nodeCart.style.display = full ? 'block' : 'none'; }
  if (nodeSc)   { nodeSc.innerHTML   = full; nodeSc.style.display   = full ? 'block' : 'none'; }
  if (!nodeMain) return;

  const mainList = all.filter(x => ASSIST_MAIN_HIDE.indexOf(x.s.kind) < 0);
  if (!mainList.length) {
    nodeMain.innerHTML = '';
    nodeMain.style.display = 'none';
  } else if (_assistMainExpanded) {
    const t = ASSIST_TONE[mainList[0].s.tone] || ASSIST_TONE.info;
    nodeMain.innerHTML = wrap(mainList.map(x => _assistCardHTML(x.s, x.i, false)).join(''))
      + `<button class="as-more" style="width:100%;margin-top:8px;border-color:${t.bd};color:${t.fg};padding:9px;" onclick="assistToggleMain()">Thu gọn ⌃</button>`;
    nodeMain.style.display = 'block';
  } else {
    nodeMain.innerHTML = wrap(_assistCardHTML(mainList[0].s, mainList[0].i, true, mainList.length - 1));
    nodeMain.style.display = 'block';
  }
  // Báo chiều cao thật của pill cho CSS: lưới menu co lại đúng ngần này, và
  // toast nhảy lên trên pill thay vì đè lên nó.
  const co = nodeMain.style.display === 'block';
  document.body.classList.toggle('assist-main-on', co);
  document.body.style.setProperty('--assist-h', co ? nodeMain.offsetHeight + 'px' : '0px');
}

// Tính lại + ghi nhận lượt hiển thị + vẽ. Gọi sau MỌI thay đổi giỏ hàng/khách.
function assistRefresh() {
  try {
    _assistCurrent = assistBuild();
    const sig = assistCartSignature();
    _assistCurrent.forEach(s => {
      if (_assistShown[s.key]) return;   // đã hiện rồi thì giữ mốc "lúc hiện" đầu tiên
      _assistShown[s.key] = {
        key: s.key, kind: s.kind,
        text: String(s.text || '').replace(/<[^>]+>/g, ''),
        meta: s.meta || {},
        shownAt: vnDate().toISOString(),
        cartAtShow: { qty: sig.qty, total: sig.total, toppings: sig.toppings, sizes: sig.sizes, ice: sig.ice },
        action: null, actedAt: null
      };
    });
    assistRender();
  } catch (err) {
    console.warn('[assist] refresh lỗi:', err);
  }
}

function assistToggleMain() { _assistMainExpanded = !_assistMainExpanded; assistRender(); }

// Trượt pill đi trong lúc cuộn (xem ghi chú ở CSS #assistBarMain.as-away).
let _assistScrollTimer = null;

// Nút bấm truyền CHỈ SỐ trong _assistCurrent (xem ghi chú ở _assistCardHTML).
function _assistAt(idx) { return _assistCurrent[Number(idx)] || null; }

function _assistMark(key, action) {
  const rec = _assistShown[key];
  if (!rec) return;
  rec.action = action;
  rec.actedAt = vnDate().toISOString();
}

// Nhân viên bấm ✕ — không hiện lại gợi ý này cho tới hết đơn. Ghi nhận là
// "skipped" để sau này biết gợi ý nào nhân viên hay bỏ qua (mục 12).
function assistSkip(idx) {
  const s = _assistAt(idx);
  if (!s) return;
  _assistMark(s.key, 'skipped');
  _assistDismissed.add(s.key);
  assistRefresh();
}

// Nút hành động chính. MỌI nhánh ở đây đều bắt đầu từ một cú chạm của nhân
// viên — tức là đã hỏi và khách đã đồng ý (nguyên tắc 2).
function assistAccept(idx) {
  const s = _assistAt(idx);
  if (!s) return;
  _assistMark(s.key, 'accepted');
  const act = s.act || { type: 'none' };
  switch (act.type) {
    case 'topping':
      assistApplyTopping(act.cartKey, act.toppingId);
      break;
    case 'upsize':
      assistApplyUpsize(act.cartKey, act.size);
      break;
    case 'ice':
      closeCartDrawer();
      openIceBatchPicker();
      break;
    case 'menu':
      closeCartDrawer();
      showScreen('sm');
      toast('Mời khách chọn thêm món');
      break;
    default:
      toast('✅ Đã ghi nhận');
  }
  _assistDismissed.add(s.key);
  assistRefresh();
}

function assistChip(idx, chipIdx) {
  const s = _assistAt(idx);
  if (!s || !s.chips || !s.chips[chipIdx]) return;
  const c = s.chips[chipIdx];
  _assistMark(s.key, 'accepted');
  const rec = _assistShown[s.key];
  if (rec) rec.chosen = c.label;
  if (c.act && c.act.type === 'topping') assistApplyTopping(c.act.cartKey, c.act.toppingId);
  _assistDismissed.add(s.key);
  assistRefresh();
}

// Thêm topping cho một ly SAU KHI nhân viên đã hỏi khách.
// Dòng có qty > 1 thì KHÔNG tự thêm cho cả dòng (topping áp cho cả dòng, ly
// không gọi topping sẽ bị tính oan) — đẩy sang đúng luồng hỏi "thêm cho mấy
// ly?" đã có sẵn (openToppingPickerSplit).
function assistApplyTopping(cartKey, toppingId) {
  const line = cart[cartKey];
  if (!line) { toast('Món đã thay đổi — mở giỏ hàng chọn lại'); return; }
  const t = TOPPINGS.find(x => x.id === toppingId);
  if (!t) { toast('Topping không còn trong menu'); return; }
  if ((Number(line.qty) || 1) > 1) {
    openCartDrawer();
    openToppingPickerSplit(cartKey);
    toast('Chọn số ly cần thêm ' + t.name);
    return;
  }
  const price = t.priceTogo;   // [F5] luôn To Go
  if (!line.toppings) line.toppings = [];
  const idx = line.toppings.findIndex(x => x.name === t.name);
  if (idx >= 0) line.toppings[idx].qty = tpQty(line.toppings[idx]) + 1;
  else line.toppings.push({ id: t.id, name: t.name, price, qty: 1 });
  renderMenu();
  renderCartDrawer();
  updFooter();
  toast('✅ Đã thêm ' + t.name);
}

// Đổi size MỘT ly sau khi khách đồng ý. Ly không có topping và qty = 1 thì sửa
// tại chỗ; còn lại thì tách ra 1 ly riêng để không đụng vào các ly khác cùng
// dòng (và giữ nguyên topping/đá của ly đó).
function assistApplyUpsize(cartKey, sizeLabel) {
  const line = cart[cartKey];
  if (!line) { toast('Món đã thay đổi — mở giỏ hàng chọn lại'); return; }
  const m = assistMenuItem(line.itemId);
  const s = m && (m.sizes || []).find(x => x.label === sizeLabel);
  if (!s) { toast('Size này không còn trong menu'); return; }
  if ((Number(line.qty) || 1) === 1) {
    line.size = s.label;
    line.price = Number(s.price) || 0;
  } else {
    line.qty -= 1;
    const nk = line.itemId + '_' + s.label + '_up' + Date.now().toString(36);
    cart[nk] = {
      itemId: line.itemId, name: line.name, size: s.label, price: Number(s.price) || 0,
      qty: 1, ice: line.ice || cartIceDefault,
      toppings: (line.toppings || []).map(t => Object.assign({}, t))
    };
  }
  renderMenu();
  renderCartDrawer();
  updFooter();
  toast('✅ Đã đổi sang size ' + s.label);
}

// ────────────────────────────────────────────────────────────────────────────
// GHI NHẬN HIỆU QUẢ (mục 12)
// ────────────────────────────────────────────────────────────────────────────
// Một bản ghi / một đơn, gồm mọi gợi ý ĐÃ HIỆN trong đơn đó — kể cả gợi ý nhân
// viên bỏ qua hoặc lờ đi, vì "gợi ý nào khách thường từ chối" cũng là câu hỏi
// cần trả lời. `applied` được suy ra bằng cách so giỏ hàng lúc gợi ý hiện ra
// với giỏ hàng lúc chốt, không tin vào cú bấm nút (nhân viên có thể bấm "đã
// hỏi khách" rồi khách vẫn từ chối).
function _assistWasApplied(rec, sigCuoi) {
  const truoc = rec.cartAtShow || {};
  const meta = rec.meta || {};
  if (rec.kind === 'topping' || meta.field === 'topping') {
    const ids = meta.toppingIds || (meta.toppingId ? [meta.toppingId] : []);
    return ids.some(id => (sigCuoi.toppings[id] || 0) > ((truoc.toppings || {})[id] || 0));
  }
  if (meta.upsell === 'upsize') {
    return (sigCuoi.sizes[meta.toSize] || 0) > ((truoc.sizes || {})[meta.toSize] || 0);
  }
  if (meta.field === 'ice') {
    return sigCuoi.ice !== truoc.ice;
  }
  if (meta.field === 'size') {
    return (sigCuoi.sizes[meta.preferred] || 0) > ((truoc.sizes || {})[meta.preferred] || 0);
  }
  // Còn lại (khuyến mãi/tem/upsale khác): coi là có tác dụng khi đơn to lên
  // sau lúc gợi ý hiện ra.
  return sigCuoi.qty > (Number(truoc.qty) || 0) || sigCuoi.total > (Number(truoc.total) || 0);
}

function _assistStaffOnShift() {
  try {
    return (_employeeShiftsTodayCache || [])
      .filter(s => !s.checkedOutAt)
      .map(s => ({ id: s.employeeId || null, name: s.employeeName || s.fullName || '' }));
  } catch (e) { return []; }
}

// Gọi NGAY SAU khi đơn ghi thành công (confirmPay / finalizeSplitPay). Không
// chặn luồng thanh toán: mọi lỗi chỉ console.warn.
function assistFinalizeOrder(order, orderId) {
  let ghi = null;
  try {
    const keys = Object.keys(_assistShown);
    if (assistConfig.logEnabled !== false && keys.length) {
      const sigCuoi = {
        qty: (order.itemsArray || []).reduce((s, c) => s + (Number(c.qty) || 0), 0),
        total: Number(order.total) || 0,
        toppings: {},
        sizes: {},
        ice: (order.itemsArray || []).filter(c => !c.isFood).map(c => (c && c.ice) || 'chung').join(',')
      };
      (order.itemsArray || []).forEach(c => {
        if (c && c.size) sigCuoi.sizes[c.size] = (sigCuoi.sizes[c.size] || 0) + (Number(c.qty) || 0);
        (c.toppings || []).forEach(t => {
          const id = t.id || ('name:' + (t.name || ''));
          sigCuoi.toppings[id] = (sigCuoi.toppings[id] || 0) + tpQty(t);
        });
      });

      const items = keys.map(k => {
        const rec = _assistShown[k];
        const applied = _assistWasApplied(rec, sigCuoi);
        return {
          key: rec.key, kind: rec.kind, text: rec.text, meta: rec.meta || {},
          shownAt: rec.shownAt, action: rec.action || 'ignored', actedAt: rec.actedAt || null,
          chosen: rec.chosen || null,
          totalAtShow: Number(rec.cartAtShow.total) || 0,
          qtyAtShow: Number(rec.cartAtShow.qty) || 0,
          applied
        };
      });
      const dauTien = items.reduce((a, b) => (a && a.shownAt <= b.shownAt ? a : b), items[0]);
      ghi = {
        orderId: orderId || null,
        billCode: order.billCode || null,
        createdAt: order.createdAt || vnDate().toISOString(),
        businessDate: posDateKey(),
        phone: order.phone || '',
        isToGo: !!order.isToGo,
        staffOnShift: _assistStaffOnShift(),
        totalBefore: dauTien ? dauTien.totalAtShow : Number(order.total) || 0,
        qtyBefore: dauTien ? dauTien.qtyAtShow : sigCuoi.qty,
        totalFinal: Number(order.total) || 0,
        qtyFinal: sigCuoi.qty,
        toppingCount: Object.values(sigCuoi.toppings).reduce((a, b) => a + b, 0),
        shown: items.length,
        accepted: items.filter(i => i.action === 'accepted').length,
        appliedCount: items.filter(i => i.applied).length,
        voucherUsed: order.voucherUsed || null,
        hasFreeCup: (order.itemsArray || []).some(c => c && c.isFree === true),
        suggestions: items
      };
      // [BUG#21 nhóm — FIX] TRƯỚC ĐÂY .add() sinh ID ngẫu nhiên mỗi lần gọi — gọi lại hàm này cho
      // ĐÚNG 1 bill (claim side-effect #20 giành lại sau "hết hạn", hoặc gọi lại vì lý do khác) sẽ
      // tạo 2 dòng nhật ký cho cùng 1 đơn. Dùng đúng orderId làm doc id (khi có) — .set() gọi lại
      // chỉ overwrite bằng đúng nội dung cũ, không nhân đôi dòng.
      (orderId ? fstore.collection(ASSIST_LOG_COLL).doc(orderId).set(ghi) : fstore.collection(ASSIST_LOG_COLL).add(ghi))
        .catch(err => console.warn('[assist] ghi nhật ký gợi ý thất bại (không ảnh hưởng đơn):', err));
    }
  } catch (err) {
    console.warn('[assist] dựng nhật ký gợi ý lỗi:', err);
  }
  try { assistUpdateCustomerProfile(order, orderId); } catch (err) { console.warn('[assist] cập nhật hồ sơ khách lỗi:', err); }
  assistResetSession();
  return ghi;
}

function assistResetSession() {
  _assistShown = {};
  _assistDismissed = new Set();
  _assistMainExpanded = false;
  _assistCurrent = [];
  assistRender();
}

// Hồ sơ thói quen của khách — nguồn dữ liệu cho Provider 1 và cho phần cộng
// điểm "khách hay dùng" ở Provider 5. Cộng dồn sau mỗi đơn, đọc lại lúc tra SĐT.
// Dùng transaction vì hai máy POS có thể chốt đơn của cùng một khách gần như
// cùng lúc; ID món/topping là push-key của RTDB nên KHÔNG dùng field path có
// dấu chấm (dễ vỡ), đọc-ghi cả cụm cho chắc.
async function assistUpdateCustomerProfile(order, orderId) {
  const phone = String(order.phone || '').trim();
  if (!phone) return;
  const lines = (order.itemsArray || []).filter(c => c && c.itemId && !c._discountId && !c._vKey && !c.isFree);
  if (!lines.length) return;
  const ref = fstore.collection('customers').doc(phone);
  // [BUG#30 FIX] Marker RIÊNG cho từng bill, không bao giờ bị cắt bớt.
  // TRƯỚC ĐÂY idempotency dựa vào mảng `assist_profile.appliedOrderIds` nhưng mảng đó bị cắt còn
  // 50 phần tử gần nhất (`appliedIds.slice(-49)`): sau ~50 bill của cùng một khách, orderId của
  // bill cũ RƠI KHỎI danh sách, nên nếu bill cũ đó được chạy lại (claim side-effect #20 hết hạn
  // sau 45 giây rồi bị giành lại, hoặc nhân viên bấm lại trên máy khác) thì hồ sơ thói quen bị
  // cộng ĐÚP: orders +1, món/size/topping/đá cộng thêm một lượt. Hồ sơ này là đầu vào của gợi ý
  // bán hàng, cộng đúp là gợi ý sai lệch dần mà không có cách nào phát hiện.
  // Giờ marker là DOC RIÊNG `assist_profile_effects_gieogieo/{orderId}`, đọc trong CÙNG transaction
  // với việc cộng hồ sơ — sống vĩnh viễn, không phụ thuộc độ dài mảng.
  const markerRef = orderId ? fstore.collection('assist_profile_effects_gieogieo').doc(orderId) : null;
  try {
    await fstore.runTransaction(async tx => {
      if (markerRef) {
        const mdoc = await tx.get(markerRef);
        if (mdoc.exists) return; // đã cộng cho đúng bill này rồi — no-op
      }
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const cur = (snap.data() || {}).assist_profile || {};
      // Mảng appliedOrderIds vẫn giữ (50 id gần nhất) nhưng CHỈ để soi/gỡ lỗi trên màn khách —
      // không còn là lớp chống cộng đúp.
      const appliedIds = Array.isArray(cur.appliedOrderIds) ? cur.appliedOrderIds : [];
      if (orderId && appliedIds.includes(orderId)) return; // rẻ hơn, vẫn đúng cho bill mới đây
      const p = {
        orders: (Number(cur.orders) || 0) + 1,
        ice: Object.assign({}, cur.ice || {}),
        toppings: Object.assign({}, cur.toppings || {}),
        items: Object.assign({}, cur.items || {}),
        sizes: Object.assign({}, cur.sizes || {}),
        appliedOrderIds: orderId ? [...appliedIds.slice(-49), orderId] : appliedIds,
        lastAt: vnDate().toISOString()
      };
      lines.forEach(c => {
        const q = Number(c.qty) || 1;
        if (!c.isFood) {
          const im = (c.ice || 'chung');
          p.ice[im] = (Number(p.ice[im]) || 0) + q;
          if (c.size) p.sizes[c.size] = (Number(p.sizes[c.size]) || 0) + q;
        }
        p.items[c.itemId] = (Number(p.items[c.itemId]) || 0) + q;
        (c.toppings || []).forEach(t => {
          const id = t.id || ('name:' + (t.name || ''));
          p.toppings[id] = (Number(p.toppings[id]) || 0) + q;
        });
      });
      tx.update(ref, { assist_profile: p });
      if (markerRef) tx.set(markerRef, { phone, orderId, at: vnDate().toISOString() });
      if (loyaltyCustomer && loyaltyCustomer.id === phone) loyaltyCustomer.assist_profile = p;
    });
  } catch (err) {
    console.warn('[assist] không ghi được hồ sơ thói quen khách:', err.code || err.message || err);
  }
}

PosGieoMods.assist = true;
