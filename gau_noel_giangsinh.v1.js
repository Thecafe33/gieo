/* gau_noel_giangsinh.v1.js — QUAY TRÚNG GẤU GIÁNG SINH 2026, dùng chung 3 quán + app khách:
 *   pos.html (The cafe 33) · PosX.html (XOFA) · posgieo.html (Gieo Gieo) — BỐC THĂM lúc thanh toán đơn có SĐT, Đổi quà, huỷ bill.
 *   index_giangsinh.html (app khách) — MỞ lượt đã bốc (quay), thẻ gấu dưới thẻ thành viên.
 *   pos.html → Quản lý → «Gấu Noel»: nhập kho từng quán, thống kê, XOÁ HẾT dữ liệu khi hết đợt.
 * Kế hoạch: docs/KE_HOACH_GAU_NOEL_2026.md. Chủ dự án chốt 16/10/2026:
 *   - Mua 2 ly tính tiền = 1 lượt (4–5 ly = 2, từ 6 ly = 3 lượt, chắc ≥ 1 gấu). Không giới hạn lượt / SĐT / ngày.
 *   - Tỉ lệ 1 lượt = số ly × giá đơn × lịch sử SĐT × ngày/giờ × kho (trần 60%). Trượt đủ lượt VÀ đủ lãi tích luỹ → lượt sau chắc trúng.
 *     23–25/12: tỉ lệ ×3, chắc trúng sớm hơn. The cafe 33: bill bed trên 160K (không tính ăn vặt) = trúng chắc.
 *   - Mỗi loại lượt có KHO RIÊNG (số con cụ thể theo chặng) — hết kho thì loại lượt đó ngừng trúng. Không có mẫu gấu: khách chọn tại quầy.
 *   - Kết quả bốc ở POS (rules Firebase hiện "đã đăng nhập = toàn quyền" → không bốc trên máy khách); khách quay lúc nào cũng được
 *     tới hạn nhận = MỞ kết quả. Trúng ở quán nào nhận ở quán đó: nhân viên nhập SĐT → Đổi quà → mã hết hiệu lực.
 *   - Hạn nhận 31/12/2026; gấu chưa nhận quay về kho (dùng cho chương trình sau).
 *   - Ngày giờ theo GIỜ MÁY CHỦ (.info/serverTimeOffset). Ngoài đợt: không đọc / ghi gì.
 *   - Dữ liệu riêng (không đụng customers): gau_noel_2026/{sđt}, gau_noel_2026_kho/{quán}. Hết đợt: Quản lý pos → xoá hết → gỡ thẻ script.
 * Sửa file này sau khi đã deploy = tạo gau_noel_giangsinh.v2.js (cùng quy tắc phiên bản như engine).
 */
(function (root) {
  'use strict';
  var VN = 7 * 3600e3, DAY = 864e5;

  var CFG = {
    coll: 'gau_noel_2026', khoColl: 'gau_noel_2026_kho',
    batDau: '2026-11-15',            // ngày bắt đầu nhận lượt (chủ dự án: 10 hoặc 15/11 — đổi ở đây hoặc _cfg)
    moManNgay: 7,                    // tuần mở màn
    ngay15: '2026-12-15',            // chặng 15–22/12
    noel: ['2026-12-23', '2026-12-24', '2026-12-25'],
    hanNhan: '2026-12-31',           // mở lượt + đổi quà tới hết ngày này
    giaGau: 17000, chiPhiLy: 8900,   // lãi tích luỹ = tiền nước − số ly × chi phí 1 ly
    phanLai: 0.15, phanLaiNoel: 0.20,// chắc trúng khi lãi tích luỹ ≥ giá gấu ÷ phần lãi (113K · 23–25/12: 85K)
    goc: [0, 0.10, 0.12, 0.15],      // tỉ lệ gốc theo số lượt của đơn (1 lượt = 2–3 ly, 2 = 4–5 ly, 3 = từ 6 ly)
    heSoGia: { low: 0.15, v45: 1, v60: 1.25, v80: 1.5 },
    heSoTruot3: 1.3, heSoTruot4: 1.6,
    truotChac: 5, truotChacNoel: 3, // trượt N lượt + đủ lãi → lượt sau chắc trúng
    lyChac: 6, lyChacNoel: 4,        // đơn từ N ly → chắc ≥ 1 gấu
    heSoNgay: { open: 1.5, week: 1, pre: 1.2, noel: 3 },
    gioVang: [[14, 16]], heSoGioVang: 1.5,   // giờ vắng: [từ giờ, tới giờ) giờ VN
    heSoKhoNhanh: 0.7, heSoKhoCham: 1.25,
    tran: 0.6,
    bedToiThieu: 160000,
    xoaMa: '2512'
  };
  var KHO_NGAU = ['low', 'v45', 'v60', 'v80'];          // kho ngẫu nhiên theo giá mỗi lượt
  var KHO_CHAC = ['pity', 'big', 'bed'];                // kho chắc trúng (luôn trao, lấy dự phòng nếu vượt)
  var TEN_KHO = { low: 'Lượt dưới 45K', v45: 'Lượt 45–59K', v60: 'Lượt 60–79K', v80: 'Lượt từ 80K',
    pity: 'Chuỗi trượt đủ lãi', big: 'Đơn nhiều ly', bed: 'Bed trên 160K' };
  var TEN_QUAN = { tc33: 'The cafe 33', xofa: 'XOFA', gg01: 'Gieo Gieo' };

  // ── đồng hồ (giờ máy chủ) ─────────────────────────────────
  var offset = 0;
  function now() { return Date.now() + offset; }
  function vnDay(ms) { return new Date((ms == null ? now() : ms) + VN).toISOString().slice(0, 10); }
  function vnHour(ms) { return new Date((ms == null ? now() : ms) + VN).getUTCHours(); }
  function dayStart(key) { return Date.parse(key + 'T00:00:00+07:00'); }
  function cong(key, n) { return vnDay(dayStart(key) + n * DAY + 3600e3); }
  function soNgay(a, b) { return Math.round((dayStart(b) - dayStart(a)) / DAY); }
  function dangMua(ms) { var d = vnDay(ms); return d >= CFG.batDau && d <= CFG.noel[2]; }        // đơn được tính lượt
  function dangNhan(ms) { var d = vnDay(ms); return d >= CFG.batDau && d <= CFG.hanNhan; }       // mở lượt / đổi quà
  function hetDot(ms) { return vnDay(ms) > CFG.hanNhan; }

  // ── chặng (cửa sổ kho) ────────────────────────────────────
  // W0 = tuần mở màn · W1..Wn = các tuần chạy đều (tuần cuối gộp phần lẻ) · W15 = 15–22/12 · N0..N2 = 23, 24, 25/12
  function chang(key) {
    if (key < CFG.batDau || key > CFG.noel[2]) return null;
    var ni = CFG.noel.indexOf(key);
    if (ni >= 0) return { w: 'N' + ni, type: 'noel', nd: ni, idx: 0, len: 1 };
    if (key >= CFG.ngay15) return { w: 'W15', type: 'pre', idx: soNgay(CFG.ngay15, key), len: soNgay(CFG.ngay15, CFG.noel[0]) };
    var i = soNgay(CFG.batDau, key);
    if (i < CFG.moManNgay) return { w: 'W0', type: 'open', idx: i, len: CFG.moManNgay };
    var chay = soNgay(cong(CFG.batDau, CFG.moManNgay), CFG.ngay15), tuan = Math.max(1, Math.floor(chay / 7));
    var j = i - CFG.moManNgay, wk = Math.min(tuan - 1, Math.floor(j / 7));
    return { w: 'W' + (wk + 1), type: 'week', idx: j - 7 * wk, len: wk === tuan - 1 ? chay - 7 * (tuan - 1) : 7 };
  }

  // ── hàm thuần (test được, không Firebase) ─────────────────
  function soLuot(ly) { ly = Number(ly) || 0; return ly >= 6 ? 3 : ly >= 4 ? 2 : ly >= 2 ? 1 : 0; }
  function bandOf(tienLuot) { var k = (Number(tienLuot) || 0) / 1000; return k < 45 ? 'low' : k < 60 ? 'v45' : k < 80 ? 'v60' : 'v80'; }
  function heSoTruot(streak) { return streak >= 4 ? CFG.heSoTruot4 : streak >= 3 ? CFG.heSoTruot3 : 1; }
  function laGioVang(h) { return CFG.gioVang.some(function (g) { return h >= g[0] && h < g[1]; }); }
  function heSoNgayGio(ch, h) { return (CFG.heSoNgay[ch.type] || 1) * (laGioVang(h) ? CFG.heSoGioVang : 1); }
  /** Tỉ lệ 1 lượt (không tính luật chắc trúng). L = số lượt của đơn. */
  function pTurn(L, tienLuot, streak, heSoNgay, heSoKho) {
    return Math.min(CFG.tran, (CFG.goc[L] || 0) * CFG.heSoGia[bandOf(tienLuot)] * heSoTruot(streak) * heSoNgay * heSoKho);
  }
  function nguongLai(noel) { return CFG.giaGau / (noel ? CFG.phanLaiNoel : CFG.phanLai); }
  /** Luật niềm tin: đủ lượt trượt VÀ đủ lãi tích luỹ (nhỏ hơn thì vẫn quay ngẫu nhiên). */
  function chacTrung(streak, acc, noel) { return streak >= (noel ? CFG.truotChacNoel : CFG.truotChac) && acc >= nguongLai(noel); }
  function laiDon(tienNuoc, ly) { return Math.max(0, (Number(tienNuoc) || 0) - (Number(ly) || 0) * CFG.chiPhiLy); }

  // Kho 1 quán (doc gau_noel_2026_kho/{quán}):
  //   cap[k] (k ∈ KHO_NGAU) = { open, week, p15, pre, n: [23, 24, 25] } — trần mở màn / mỗi tuần / 15–22 / cả chặng trước 23 / từng ngày Noel
  //   tong = số gấu thật của quán cho đợt (trần cứng của MỌI loại, kể cả chắc trúng) · dung[w][k] = đã phát theo chặng
  //   pre[k] = đã phát trước 23/12 · carry = số đã lấy từ phần ngẫu nhiên trước 23 chưa phát hết · phat = tổng đã phát · doi = đã nhận
  function dungW(kho, w, k) { return Number(((kho.dung || {})[w] || {})[k]) || 0; }
  function capOf(kho, k) { return (kho.cap || {})[k] || {}; }
  function trChang(kho, ch, k) {
    var c = capOf(kho, k);
    return ch.type === 'week' ? Number(c.week) || 0 : ch.type === 'open' ? Number(c.open) || 0 : ch.type === 'pre' ? Number(c.p15) || 0 : Number((c.n || [])[ch.nd]) || 0;
  }
  function conLaiTruoc23(kho) {
    var s = 0; KHO_NGAU.forEach(function (k) { s += Math.max(0, (Number(capOf(kho, k).pre) || 0) - (Number((kho.pre || {})[k]) || 0)); });
    return Math.max(0, s - (Number(kho.carry) || 0));
  }
  function conTong(kho) { return Math.max(0, (Number(kho.tong) || 0) - (Number(kho.phat) || 0)); }
  /** Kho ngẫu nhiên loại k còn chỗ ở chặng này? → true · 'carry' (Noel: lấy phần trước 23 chưa phát) · false */
  function conKho(kho, ch, k) {
    if (conTong(kho) <= 0) return false;
    if (ch.type === 'noel') {
      if (dungW(kho, ch.w, k) < trChang(kho, ch, k)) return true;
      return conLaiTruoc23(kho) > 0 ? 'carry' : false;
    }
    return (Number((kho.pre || {})[k]) || 0) < (Number(capOf(kho, k).pre) || 0) && dungW(kho, ch.w, k) < trChang(kho, ch, k);
  }
  /** Hệ số kho: chặng đang phát nhanh hơn kế hoạch → hạ, chậm hơn → nâng (Noel: ×1). */
  function heSoKho(kho, ch, k) {
    if (ch.type === 'noel') return 1;
    var cap = trChang(kho, ch, k), ke = cap * (ch.idx + 1) / ch.len, da = dungW(kho, ch.w, k);
    return da > ke ? CFG.heSoKhoNhanh : da < ke - 1 ? CFG.heSoKhoCham : 1;
  }

  /**
   * Bốc thăm 1 bill (thuần): khach = { streak, acc }, kho = doc kho (bị sửa tại chỗ), don = { ly, tienNuoc, bed160 }, ms, rand.
   * Trả { luot: [{ k, win }], streak, acc } — k = kho trao (null nếu trượt). Không có lượt → luot rỗng.
   */
  function bocThuan(khach, kho, don, ms, rand) {
    var key = vnDay(ms), ch = chang(key), out = { luot: [], streak: Number(khach.streak) || 0, acc: Number(khach.acc) || 0 };
    if (!ch) return out;
    var ly = Number(don.ly) || 0, L = soLuot(ly), bed = !!don.bed160;
    if (bed && L === 0) L = 1;
    if (!L) return out;
    var noel = ch.type === 'noel', tienLuot = (Number(don.tienNuoc) || 0) / L, band = bandOf(tienLuot);
    var hsNg = heSoNgayGio(ch, vnHour(ms)), chacLy = ly >= (noel ? CFG.lyChacNoel : CFG.lyChac), wins = 0;
    out.acc += laiDon(don.tienNuoc, ly);
    kho.dung = kho.dung || {}; kho.pre = kho.pre || {};
    var trao = function (k) {
      if (conTong(kho) <= 0) return false;
      var d = kho.dung[ch.w] = kho.dung[ch.w] || {};
      d[k] = (Number(d[k]) || 0) + 1;
      if (!noel) kho.pre[k] = (Number(kho.pre[k]) || 0) + 1;
      kho.phat = (Number(kho.phat) || 0) + 1;
      return true;
    };
    for (var l = 0; l < L; l++) {
      var k = null;
      if (bed && l === 0) k = 'bed';
      else if (chacTrung(out.streak, out.acc, noel)) k = 'pity';
      else if (chacLy && l === L - 1 && wins === 0) k = 'big';
      if (k) { if (!trao(k)) k = null; }
      else {
        var ok = conKho(kho, ch, band), r = rand();
        if (ok && r < pTurn(L, tienLuot, out.streak, hsNg, heSoKho(kho, ch, band)) && trao(band)) {
          k = band;
          if (ok === 'carry') kho.carry = (Number(kho.carry) || 0) + 1;
        }
      }
      if (k) { wins++; out.streak = 0; out.acc = 0; } else out.streak++;
      out.luot.push({ k: k, win: !!k, w: ch.w, noel: noel });
    }
    return out;
  }

  var MA_CHU = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bỏ 0/O, 1/I
  function maNhan(rand) { var s = 'GAU'; for (var i = 0; i < 5; i++) s += MA_CHU[Math.floor(rand() * MA_CHU.length) % MA_CHU.length]; return s; }
  function normPhone(p) {
    var s = String(p || '').replace(/\D/g, '');
    if (s.indexOf('84') === 0 && s.length >= 11) s = '0' + s.slice(2);
    return s;
  }
  function luotCua(d) {
    var l = (d && d.luot) || {}, out = [];
    Object.keys(l).forEach(function (id) { var v = l[id]; if (v && typeof v === 'object') out.push(Object.assign({ id: id }, v)); });
    out.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1; });
    return out;
  }
  function quaCua(d) {
    var q = (d && d.qua) || {}, out = [];
    Object.keys(q).forEach(function (c) { var v = q[c]; if (v && /^GAU[A-Z0-9]{5}$/.test(c)) out.push(Object.assign({ code: c }, v)); });
    out.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    return out;
  }
  /** Trạng thái hiển thị từ doc khách (không đọc thêm). */
  function stateOf(d, ms) {
    var n = ms == null ? now() : ms, l = luotCua(d);
    return {
      dangMua: dangMua(n), dangNhan: dangNhan(n), het: hetDot(n),
      chuaMo: dangNhan(n) ? l.filter(function (x) { return !x.opened && !x.huy; }) : [],
      luot: l, qua: quaCua(d).filter(function (q) { return !q.huy; })
    };
  }

  // ── Firebase ──────────────────────────────────────────────
  var FS = null, FV = null;
  function init(o) {
    o = o || {};
    FS = o.fstore || FS;
    FV = o.FieldValue || FV || (root.firebase && root.firebase.firestore && root.firebase.firestore.FieldValue) || null;
    if (o.db && o.db.ref) {
      try { o.db.ref('.info/serverTimeOffset').on('value', function (s) { offset = Number(s && s.val ? s.val() : 0) || 0; }); } catch (e) {}
    }
    if (typeof o.offset === 'number') offset = o.offset;
    return GauNoel;
  }
  function refKhach(p) { return FS.collection(CFG.coll).doc(normPhone(p)); }
  function refKho(store) { return FS.collection(CFG.khoColl).doc(String(store)); }
  var hopLeQuan = function (s) { return typeof s === 'string' && /^[a-z0-9]{2,12}$/.test(s); };
  var hopLeBill = function (b) { return typeof b === 'string' && b.length > 0 && b.length <= 80 && !/[.\/#$\[\]~*]/.test(b); };

  /**
   * POS gọi SAU KHI đơn có SĐT đã lưu. don = { store, sdt, bill, ly (ly nước tính tiền, không Food / ly 0đ), tienNuoc, bed160 }.
   * 1 giao dịch: đọc khách + kho → bốc → ghi khách + kho. Gọi lại cùng bill = không bốc lại (trả kết quả cũ).
   * Trả { soLuot, trung, luot } · ngoài đợt / thiếu SĐT / dưới 2 ly → { soLuot: 0 } không ghi gì.
   */
  function boc(don, rand) {
    rand = rand || Math.random;
    var p = normPhone(don && don.sdt);
    if (!FS || !don || p.length < 9 || !dangMua() || !hopLeQuan(don.store) || !hopLeBill(String(don.bill || ''))) return Promise.resolve({ soLuot: 0 });
    if (!soLuot(don.ly) && !don.bed160) return Promise.resolve({ soLuot: 0 });
    var bill = String(don.bill), rk = refKhach(p), rq = refKho(don.store), kq = null;
    return FS.runTransaction(function (tx) {
      return Promise.all([tx.get(rk), tx.get(rq)]).then(function (ss) {
        var d = ss[0].exists ? ss[0].data() : {}, kho = ss[1].exists ? ss[1].data() : null, n = now();
        var cu = luotCua(d).filter(function (x) { return x.store === don.store && x.bill === bill; });
        if (cu.length) { kq = { soLuot: cu.length, trung: cu.filter(function (x) { return x.win; }).length, luot: cu, cu: true }; return; }
        if (!kho) { kq = { soLuot: 0, loi: 'chua-co-kho' }; return; }
        var r = bocThuan(d, kho, don, n, rand), at = new Date(n).toISOString(), luot = {}, qua = {}, list = [];
        var daCo = (d.qua || {});
        r.luot.forEach(function (x, i) {
          var id = don.store + '_' + bill + '_' + i, code = null;
          if (x.win) { do { code = maNhan(rand); } while (daCo[code] || qua[code]); qua[code] = { store: don.store, bill: bill, luot: id, at: at, used: false }; }
          luot[id] = { store: don.store, bill: bill, at: at, ly: Number(don.ly) || 0, tienNuoc: Number(don.tienNuoc) || 0,
            k: x.k || '', w: x.w, win: x.win, code: code || '', opened: false };
          list.push(Object.assign({ id: id }, luot[id]));
        });
        tx.set(rk, { sdt: p, streak: r.streak, acc: r.acc, luot: luot, qua: qua, lastAt: at }, { merge: true });
        tx.set(rq, { dung: kho.dung, pre: kho.pre, phat: kho.phat || 0, carry: kho.carry || 0, lastAt: at }, { merge: true });
        kq = { soLuot: list.length, trung: list.filter(function (x) { return x.win; }).length, luot: list };
      });
    }).then(function () { return kq; });
  }

  /** Đọc 1 lần (chỉ trong đợt nhận). */
  function load(sdt) {
    var p = normPhone(sdt);
    if (!FS || p.length < 9 || !dangNhan()) return Promise.resolve(stateOf(null));
    return refKhach(p).get().then(function (s) { return stateOf(s.exists ? s.data() : null); });
  }

  /** Mở (quay) 1 lượt đã bốc — app khách hoặc nút "Mở lượt tại quầy". id bỏ trống = lượt chưa mở cũ nhất. */
  function mo(sdt, id) {
    var p = normPhone(sdt);
    if (!FS || p.length < 9) return Promise.reject(new Error('sdt'));
    if (!dangNhan()) return Promise.reject(new Error('het-dot'));
    var r = refKhach(p), kq = null, err = null;
    return FS.runTransaction(function (tx) {
      return tx.get(r).then(function (s) {
        var d = s.exists ? s.data() : {}, ds = luotCua(d).filter(function (x) { return !x.opened && !x.huy; });
        var x = id ? ds.filter(function (y) { return y.id === id; })[0] : ds[0];
        if (!x) { err = 'het-luot'; return; }
        var u = {}; u['luot.' + x.id + '.opened'] = true; u['luot.' + x.id + '.openedAt'] = new Date(now()).toISOString();
        tx.update(r, u);
        kq = { id: x.id, win: !!x.win, code: x.code || '', store: x.store, conLai: ds.length - 1 };
      });
    }).then(function () { if (err) throw new Error(err); return kq; });
  }

  /** Quà chưa nhận của khách TẠI quán này (POS — khung Đổi quà). */
  function quaTaiQuan(sdt, store) {
    var p = normPhone(sdt);
    if (!FS || p.length < 9 || !dangNhan()) return Promise.resolve([]);
    return refKhach(p).get().then(function (s) {
      return quaCua(s.exists ? s.data() : null).filter(function (q) { return q.store === store && !q.used && !q.huy; });
    });
  }

  /** Đổi quà: mã của đúng quán, chưa dùng, còn hạn → dùng (mã hết hiệu lực). 2 máy cùng đổi → máy sau 'da-doi'. */
  function doi(store, sdt, code, nv) {
    var p = normPhone(sdt);
    if (!FS || p.length < 9) return Promise.reject(new Error('sdt'));
    if (!dangNhan()) return Promise.reject(new Error('het-han'));
    var r = refKhach(p), rq = refKho(store), err = null;
    return FS.runTransaction(function (tx) {
      return tx.get(r).then(function (s) {
        var q = ((s.exists ? s.data() : {}).qua || {})[code];
        if (!q || q.huy) { err = 'khong-co'; return; }
        if (q.store !== store) { err = 'sai-quan'; return; }
        if (q.used) { err = 'da-doi'; return; }
        var u = {}, at = new Date(now()).toISOString();
        u['qua.' + code + '.used'] = true; u['qua.' + code + '.usedAt'] = at; u['qua.' + code + '.usedBy'] = String(nv || '');
        tx.update(r, u);
        tx.set(rq, { doi: FV ? FV.increment(1) : 1 }, { merge: true });
      });
    }).then(function () { if (err) throw new Error(err); return true; });
  }

  /** Huỷ / xoá bill: bỏ lượt của bill; gấu chưa nhận trả về kho; gấu ĐÃ nhận → giữ, gắn cờ canhBao cho Quản lý. */
  function huyBill(store, sdt, bill) {
    var p = normPhone(sdt);
    bill = String(bill || '');
    if (!FS || p.length < 9 || !hopLeBill(bill) || !(dangNhan() || dangMua())) return Promise.resolve({ bo: 0 });
    var rk = refKhach(p), rq = refKho(store), kq = { bo: 0, traKho: 0, daNhan: 0 };
    return FS.runTransaction(function (tx) {
      return Promise.all([tx.get(rk), tx.get(rq)]).then(function (ss) {
        if (!ss[0].exists) return;
        var d = ss[0].data(), kho = ss[1].exists ? ss[1].data() : {}, u = {}, ku = {}, ds = luotCua(d).filter(function (x) { return x.store === store && x.bill === bill && !x.huy; });
        if (!ds.length) return;
        var dung = kho.dung || {}, pre = kho.pre || {}, phat = Number(kho.phat) || 0, canh = Number(kho.canhBao) || 0;
        ds.forEach(function (x) {
          kq.bo++;
          var q = x.code ? (d.qua || {})[x.code] : null;
          if (q && q.used) { kq.daNhan++; canh++; u['luot.' + x.id + '.huy'] = true; u['qua.' + x.code + '.billHuy'] = true; return; }
          if (x.win && x.k && x.w) {
            var dw = dung[x.w] = dung[x.w] || {}; dw[x.k] = Math.max(0, (Number(dw[x.k]) || 0) - 1);
            if (x.w.charAt(0) === 'W') pre[x.k] = Math.max(0, (Number(pre[x.k]) || 0) - 1);
            phat = Math.max(0, phat - 1); kq.traKho++;
          }
          u['luot.' + x.id] = FV.delete();
          if (x.code) u['qua.' + x.code] = FV.delete();
        });
        tx.update(rk, u);
        if (ss[1].exists) tx.set(rq, { dung: dung, pre: pre, phat: phat, canhBao: canh }, { merge: true });
      });
    }).then(function () { return kq; });
  }

  // ── Quản lý (pos.html) ────────────────────────────────────
  /** Ghi cấu hình kho 1 quán: cap (trần từng kho ngẫu nhiên) + tong (số gấu thật). Không đụng số đã phát. */
  function luuKho(store, cap, tong) {
    if (!hopLeQuan(store)) return Promise.reject(new Error('quan'));
    return refKho(store).set({ cap: cap, tong: Math.max(0, Math.round(Number(tong) || 0)) }, { merge: true });
  }
  function docKho() {
    return FS.collection(CFG.khoColl).get().then(function (snap) {
      var out = {}; snap.forEach(function (d) { out[d.id] = d.data() || {}; }); return out;
    });
  }
  /** Thống kê cả bảng khách (chỉ khi chủ quán bấm). */
  function thongKe() {
    var o = { khach: 0, luot: 0, mo: 0, trung: 0, nhan: 0, choNhan: 0, theoQuan: {} };
    return FS.collection(CFG.coll).get().then(function (snap) {
      snap.forEach(function (doc) {
        var d = doc.data() || {}; o.khach++;
        luotCua(d).forEach(function (x) {
          if (x.huy) return;
          var t = o.theoQuan[x.store] = o.theoQuan[x.store] || { luot: 0, trung: 0, nhan: 0 };
          o.luot++; t.luot++; if (x.opened) o.mo++; if (x.win) { o.trung++; t.trung++; }
        });
        quaCua(d).forEach(function (q) {
          if (q.huy) return;
          var t = o.theoQuan[q.store] = o.theoQuan[q.store] || { luot: 0, trung: 0, nhan: 0 };
          if (q.used) { o.nhan++; t.nhan++; } else o.choNhan++;
        });
      });
      return o;
    });
  }
  /** Xoá toàn bộ dữ liệu chương trình (khách + kho), từng lô 400 doc. ma = mã xác nhận. */
  function xoaHet(ma, onProgress) {
    if (String(ma) !== CFG.xoaMa) return Promise.reject(new Error('sai-ma'));
    var done = 0;
    function round(coll) {
      return FS.collection(coll).limit(400).get().then(function (snap) {
        if (snap.empty || !snap.docs || !snap.docs.length) return;
        var b = FS.batch();
        snap.docs.forEach(function (d) { b.delete(d.ref); });
        return b.commit().then(function () { done += snap.docs.length; if (onProgress) onProgress(done); return round(coll); });
      });
    }
    return round(CFG.coll).then(function () { return round(CFG.khoColl); }).then(function () { return done; });
  }

  var GauNoel = {
    CFG: CFG, KHO_NGAU: KHO_NGAU, KHO_CHAC: KHO_CHAC, TEN_KHO: TEN_KHO, TEN_QUAN: TEN_QUAN,
    now: now, vnDay: vnDay, vnHour: vnHour, dangMua: dangMua, dangNhan: dangNhan, hetDot: hetDot, chang: chang,
    soLuot: soLuot, bandOf: bandOf, pTurn: pTurn, nguongLai: nguongLai, chacTrung: chacTrung, laiDon: laiDon,
    conKho: conKho, heSoKho: heSoKho, heSoNgayGio: heSoNgayGio, bocThuan: bocThuan, maNhan: maNhan, normPhone: normPhone,
    stateOf: stateOf, init: init, boc: boc, load: load, mo: mo, quaTaiQuan: quaTaiQuan, doi: doi, huyBill: huyBill,
    luuKho: luuKho, docKho: docKho, thongKe: thongKe, xoaHet: xoaHet,
    _setOffset: function (v) { offset = v; }
  };
  root.GauNoel = GauNoel;
  if (typeof module !== 'undefined' && module.exports) module.exports = GauNoel;
})(typeof window !== 'undefined' ? window : globalThis);
