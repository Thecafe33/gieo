/* lixi.v1.js — LÌ XÌ TẾT 2027 (Đinh Mùi) dùng chung cho 3 app:
 *   index_tet.html (app khách The cafe 33) — NHẬN: mở bao lì xì, xem mã.
 *   pos_tet.html  (The cafe 33)  — DÙNG mã tc33 + cộng lượt mở khi có đơn kèm SĐT + tab Quản lý "Lì xì 2027".
 *   PosX_tet.html (XOFA)          — DÙNG mã xofa + cộng lượt mở khi có đơn kèm SĐT.
 * Chủ dự án chốt 16/10/2026:
 *   - Phát 27 Tết → mùng 5 (3/2 → 10/2/2027). Mỗi ngày 1 bao miễn phí; mỗi đơn có SĐT ở XOFA / The cafe 33 = +1 lượt (không giới hạn).
 *   - Tỉ lệ trúng: có mua trong 24h (customers.lastVisit, cả 3 quán) 90%; không mua: 10%, riêng 29 Tết + mùng 1–3: 80%.
 *     (Tháng Chạp 2027 chỉ 29 ngày — không có 30 Tết.)
 *   - Loại: upsize XOFA 25% · upsize TC33 25% · giảm 5K XOFA 25% · giảm 10K lịch bed 15% · +1h bed 10%.
 *   - Dùng mùng 3 → mùng 10 (8/2 → 15/2/2027); từ mùng 11 hết hạn. 1 bill 1 mã, 1 mã 1 lần; nhân viên bấm chọn mã.
 *   - Ngày giờ theo GIỜ MÁY CHỦ Firebase (.info/serverTimeOffset), không theo đồng hồ máy.
 *   - Dữ liệu: Firestore `lixi_tet_2027/{sđt}` (riêng, không đụng `customers`). Ngoài 2 giai đoạn trên: không đọc / ghi gì.
 *   - Xoá hết dữ liệu: tab Quản lý pos (mã 3367) → LiXi.deleteAll().
 * Sửa file này sau khi đã deploy = tạo lixi.v2.js (cùng quy tắc phiên bản như engine).
 */
(function (root) {
  'use strict';
  var VN = 7 * 3600e3, DAY = 864e5;

  var CFG = {
    collection: 'lixi_tet_2027',
    giveFrom: '2027-02-03', giveTo: '2027-02-10',          // 27 Tết → mùng 5 (gồm 2 đầu)
    useFrom:  '2027-02-08', useTo:  '2027-02-15',          // mùng 3 → mùng 10 (gồm 2 đầu)
    tet:      '2027-02-06',                                // mùng 1
    hotDays:  ['2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08'],   // 29 Tết, mùng 1, 2, 3
    pBought: 0.9, pHot: 0.8, pCold: 0.1, boughtWithinMs: DAY,
    prizes: [
      { type: 'upsize_xofa', w: 25 }, { type: 'upsize_tc33', w: 25 }, { type: 'giam5k_xofa', w: 25 },
      { type: 'giam10k_bed', w: 15 }, { type: 'bed1h', w: 10 }
    ],
    deleteCode: '3367'
  };
  var TYPES = {
    upsize_xofa: { store: 'xofa', label: 'Upsize miễn phí tại XOFA',        short: 'Upsize XOFA', note: 'Miễn phần chênh M→L cho 1 ly size L' },
    upsize_tc33: { store: 'tc33', label: 'Upsize miễn phí tại The cafe 33', short: 'Upsize 33',   note: 'Miễn phần chênh M→L cho 1 ly size L' },
    giam5k_xofa: { store: 'xofa', label: 'Giảm 5K đơn XOFA',               short: '-5K XOFA',    note: 'Đơn từ 30.000đ', value: 5000, minOrder: 30000 },
    giam10k_bed: { store: 'tc33', label: 'Giảm 10K lịch bed',              short: '-10K bed',    note: 'Trừ 10.000đ trên bill có giờ bed', value: 10000 },
    bed1h:       { store: 'tc33', label: '+1h bed miễn phí',               short: '+1h bed',     note: 'Trừ 1 giờ bed — lịch từ 2 giờ', minBedHours: 2 }
  };
  var STORE_NAME = { xofa: 'XOFA', tc33: 'The cafe 33' };

  // ── đồng hồ (giờ máy chủ) ─────────────────────────────────
  var offset = 0;
  function now() { return Date.now() + offset; }
  function vnDay(ms) { return new Date((ms == null ? now() : ms) + VN).toISOString().slice(0, 10); }
  function dayStart(key) { return Date.parse(key + 'T00:00:00+07:00'); }
  function inGive(ms) { var d = vnDay(ms); return d >= CFG.giveFrom && d <= CFG.giveTo; }
  function inUse(ms)  { var d = vnDay(ms); return d >= CFG.useFrom && d <= CFG.useTo; }
  function isOver(ms) { return vnDay(ms) > CFG.useTo; }
  function isHot(key) { return CFG.hotDays.indexOf(key) >= 0; }
  function daysToTet(ms) { return Math.round((dayStart(CFG.tet) - dayStart(vnDay(ms))) / DAY); }

  // ── bốc thăm (hàm thuần — test được) ──────────────────────
  function boughtRecently(lastVisit, ms) {
    if (!lastVisit) return false;
    var t = (typeof lastVisit === 'number') ? lastVisit : Date.parse(lastVisit);
    if (isNaN(t)) return false;
    var n = (ms == null ? now() : ms);
    return n - t >= 0 && n - t <= CFG.boughtWithinMs;
  }
  function chance(dayKey, bought) { return bought ? CFG.pBought : (isHot(dayKey) ? CFG.pHot : CFG.pCold); }
  function pickPrize(r) {
    var total = 0, i;
    for (i = 0; i < CFG.prizes.length; i++) total += CFG.prizes[i].w;
    var x = r * total;
    for (i = 0; i < CFG.prizes.length; i++) { x -= CFG.prizes[i].w; if (x < 0) return CFG.prizes[i].type; }
    return CFG.prizes[CFG.prizes.length - 1].type;
  }
  function draw(dayKey, bought, r1, r2) { return r1 < chance(dayKey, bought) ? pickPrize(r2) : null; }

  function normPhone(p) {
    var s = String(p == null ? '' : p).replace(/[^0-9]/g, '');
    if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
    return s;
  }
  function newCodeId(rand) {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'TET';
    for (var i = 0; i < 5; i++) s += A[Math.floor((rand || Math.random)() * A.length)];
    return s;
  }

  // ── Firebase ──────────────────────────────────────────────
  var FS = null, FV = null;
  function init(o) {
    o = o || {};
    FS = o.fstore || FS;
    FV = o.FieldValue || FV || (root.firebase && root.firebase.firestore && root.firebase.firestore.FieldValue) || null;
    if (o.db && o.db.ref) {        // giờ máy chủ: .info không tính lượt đọc
      try { o.db.ref('.info/serverTimeOffset').on('value', function (s) { var v = s && s.val ? s.val() : 0; offset = Number(v) || 0; }); } catch (e) {}
    }
    if (typeof o.offset === 'number') offset = o.offset;
    return LiXi;
  }
  function ref(phone) { return FS.collection(CFG.collection).doc(normPhone(phone)); }
  function codesOf(data) {
    var c = (data && data.codes) || {}, out = [];
    Object.keys(c).forEach(function (id) {
      var v = c[id]; if (!v || !TYPES[v.type] || !/^TET[A-Z0-9]{5}$/.test(id)) return;   // mã lạ (ghi tay sai dạng) → bỏ qua; mã được chèn vào giao diện POS
      out.push({ id: id, type: v.type, at: v.at || '', used: !!v.used, usedAt: v.usedAt || null, usedStore: v.usedStore || null });
    });
    out.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    return out;
  }
  /** Trạng thái từ dữ liệu doc (không đọc gì thêm) */
  function stateOf(data, ms) {
    var n = (ms == null ? now() : ms), today = vnDay(n), give = inGive(n);
    data = data || {};
    return {
      give: give, use: inUse(n), over: isOver(n), today: today,
      free: give && data.freeDay !== today ? 1 : 0,
      extra: give ? Math.max(0, Number(data.extra) || 0) : 0,
      codes: codesOf(data)
    };
  }
  /** Đọc 1 lần (chỉ khi đang phát hoặc đang dùng) */
  function load(phone) {
    var p = normPhone(phone);
    if (!FS || p.length < 9 || !(inGive() || inUse())) return Promise.resolve(stateOf(null));
    return ref(p).get().then(function (s) { return stateOf(s.exists ? s.data() : null); });
  }
  /** Mở 1 bao: dùng bao miễn phí hôm nay trước, hết thì trừ 1 lượt thêm. Transaction — không mở 2 lần được. */
  function open(phone, lastVisit, rand) {
    var p = normPhone(phone);
    rand = rand || Math.random;
    if (!FS || p.length < 9) return Promise.reject(new Error('sdt'));
    if (!inGive()) return Promise.reject(new Error('het-dot'));
    var r = ref(p), result = null;
    return FS.runTransaction(function (tx) {
      return tx.get(r).then(function (s) {
        var d = s.exists ? s.data() : {}, n = now(), today = vnDay(n);
        var useFree = d.freeDay !== today, extra = Math.max(0, Number(d.extra) || 0);
        if (!useFree && extra <= 0) { result = { error: 'het-luot' }; return; }
        var type = draw(today, boughtRecently(lastVisit, n), rand(), rand());
        var upd = { phone: p, opened: (Number(d.opened) || 0) + 1, lastOpenAt: new Date(n).toISOString() };
        if (useFree) upd.freeDay = today; else upd.extra = extra - 1;
        var code = null;
        if (type) {
          var id = newCodeId(rand), codes = d.codes || {};
          while (codes[id]) id = newCodeId(rand);
          code = { id: id, type: type, at: new Date(n).toISOString(), used: false };
          upd.codes = {}; upd.codes[id] = { type: type, at: code.at, day: today, used: false };
          upd.wins = (Number(d.wins) || 0) + 1;
        }
        tx.set(r, upd, { merge: true });
        var after = {}; Object.keys(d).forEach(function (k) { after[k] = d[k]; });
        Object.keys(upd).forEach(function (k) { if (k !== 'codes') after[k] = upd[k]; });
        after.codes = {}; Object.keys(d.codes || {}).forEach(function (k) { after.codes[k] = d.codes[k]; });
        if (code) after.codes[code.id] = upd.codes[code.id];
        result = { win: !!code, code: code, usedFree: useFree, state: stateOf(after, n) };
      });
    }).then(function () {
      if (result && result.error) throw new Error(result.error);
      return result;
    });
  }
  /** POS gọi sau khi đơn có SĐT lưu thành công — +1 lượt mở (chỉ trong giai đoạn phát; ngoài giai đoạn: không ghi) */
  function grantOpen(phone, store, orderId) {
    var p = normPhone(phone);
    if (!FS || !FV || p.length < 9 || !inGive()) return Promise.resolve(false);
    return ref(p).set({ phone: p, extra: FV.increment(1), earned: FV.increment(1), lastEarnAt: new Date(now()).toISOString(),
      lastEarnStore: store || '', lastEarnOrder: orderId || '' }, { merge: true }).then(function () { return true; });
  }
  /** Mã còn dùng được ở quán `store` ('xofa' | 'tc33') — trả [] ngoài giai đoạn dùng (không đọc gì) */
  function usableCodes(phone, store) {
    var p = normPhone(phone);
    if (!FS || p.length < 9 || !inUse()) return Promise.resolve([]);
    return ref(p).get().then(function (s) {
      return codesOf(s.exists ? s.data() : null).filter(function (c) { return !c.used && TYPES[c.type].store === store; });
    });
  }
  /** Đánh dấu đã dùng (sau khi thanh toán thành công). Transaction: mã đã dùng ở máy khác → báo lỗi 'da-dung'. */
  function markUsed(phone, id, info) {
    var p = normPhone(phone), r = ref(p), err = null;
    info = info || {};
    if (!FS || !id) return Promise.reject(new Error('thieu'));
    return FS.runTransaction(function (tx) {
      return tx.get(r).then(function (s) {
        var c = s.exists && s.data().codes && s.data().codes[id];
        if (!c) { err = 'khong-co'; return; }
        if (c.used) { err = 'da-dung'; return; }
        var u = {};
        u['codes.' + id + '.used'] = true;
        u['codes.' + id + '.usedAt'] = new Date(now()).toISOString();
        u['codes.' + id + '.usedStore'] = info.store || '';
        u['codes.' + id + '.usedBill'] = info.bill || '';
        u['codes.' + id + '.usedAmount'] = Number(info.amount) || 0;
        tx.update(r, u);
      });
    }).then(function () { if (err) throw new Error(err); return true; });
  }
  /** Thống kê (đọc cả bảng — chỉ khi chủ quán bấm) */
  function stats() {
    var out = { customers: 0, opened: 0, wins: 0, earned: 0, byType: {} };
    Object.keys(TYPES).forEach(function (t) { out.byType[t] = { issued: 0, used: 0, amount: 0 }; });
    return FS.collection(CFG.collection).get().then(function (snap) {
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        out.customers++; out.opened += Number(d.opened) || 0; out.wins += Number(d.wins) || 0; out.earned += Number(d.earned) || 0;
        var c = d.codes || {};
        Object.keys(c).forEach(function (id) {
          var v = c[id], b = v && out.byType[v.type]; if (!b) return;
          b.issued++; if (v.used) { b.used++; b.amount += Number(v.usedAmount) || 0; }
        });
      });
      return out;
    });
  }
  /** Xoá toàn bộ bảng lì xì, từng lô 400 doc. onProgress(sốĐãXoá) */
  function deleteAll(onProgress) {
    var done = 0;
    function round() {
      return FS.collection(CFG.collection).limit(400).get().then(function (snap) {
        if (snap.empty || !snap.docs || !snap.docs.length) return done;
        var b = FS.batch();
        snap.docs.forEach(function (d) { b.delete(d.ref); });
        return b.commit().then(function () { done += snap.docs.length; if (onProgress) onProgress(done); return round(); });
      });
    }
    return round();
  }

  // ── chữ hiển thị ───────────────────────────────────────────
  function fmtVnd(n) { return (Math.round(n) || 0).toLocaleString('vi-VN') + 'đ'; }
  var useRange = 'mùng 3 → mùng 10 Tết (8/2 → 15/2/2027)';

  var LiXi = {
    CFG: CFG, TYPES: TYPES, STORE_NAME: STORE_NAME, useRange: useRange,
    now: now, vnDay: vnDay, inGive: inGive, inUse: inUse, isOver: isOver, isHot: isHot, daysToTet: daysToTet,
    boughtRecently: boughtRecently, chance: chance, pickPrize: pickPrize, draw: draw, normPhone: normPhone, newCodeId: newCodeId,
    init: init, stateOf: stateOf, load: load, open: open, grantOpen: grantOpen, usableCodes: usableCodes, markUsed: markUsed,
    stats: stats, deleteAll: deleteAll, fmtVnd: fmtVnd,
    _setOffset: function (v) { offset = v; }
  };
  root.LiXi = LiXi;
  if (typeof module !== 'undefined' && module.exports) module.exports = LiXi;
})(typeof window !== 'undefined' ? window : globalThis);
