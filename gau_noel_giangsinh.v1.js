/* gau_noel_giangsinh.v1.js — QUAY TRÚNG GẤU GIÁNG SINH 2026, dùng chung 3 quán + app khách:
 *   pos.html (The cafe 33) · PosX.html (XOFA) · posgieo.html (Gieo Gieo) — BỐC THĂM lúc thanh toán đơn có SĐT, Đổi quà,
 *     Mở lượt tại quầy, huỷ bill (PosX / Gieo). The cafe 33: popup QR sau thanh toán. Gieo: QR cuối bill in.
 *   kiosk.html (màn hình phụ XOFA) — data-quan="kiosk": QR + số lượt sau thanh toán, chiếu lại «Mở lượt tại quầy» (RT gau_noel_2026_kiosk).
 *   index_giangsinh.html (app khách) — data-quan="khach" (chèn bởi tools/tao_ban_giangsinh.js): popup «Bạn có N lượt quay» khi có lượt,
 *     quay = MỞ lượt đã bốc, thẻ «Gấu Noel của bạn» dưới thẻ thành viên (mã nhận, quán nhận, đã nhận).
 *   pos.html → Quản lý → «Gấu Noel»: CÔNG TẮC BẬT / TẮT chương trình (cả 3 quán chỉ chạy khi bật), ngày bắt đầu,
 *     nhập kho từng quán, thống kê, XOÁ HẾT dữ liệu khi hết đợt.
 * Kế hoạch: docs/KE_HOACH_GAU_NOEL_2026.md. Chủ dự án chốt 16/10/2026:
 *   - Mua 2 ly tính tiền = 1 lượt (4–5 ly = 2, từ 6 ly = 3 lượt, chắc ≥ 1 gấu). Không giới hạn lượt / SĐT / ngày.
 *   - Tỉ lệ 1 lượt = số ly × giá đơn × lịch sử SĐT × ngày/giờ × kho (trần 60%). Trượt đủ lượt VÀ đủ lãi tích luỹ → lượt sau chắc trúng.
 *     23–25/12: tỉ lệ ×3, chắc trúng sớm hơn. The cafe 33: bill bed trên 160K (không tính ăn vặt) = trúng chắc.
 *   - Mỗi loại lượt có KHO RIÊNG (số con cụ thể theo chặng) — hết kho thì loại lượt đó ngừng trúng. Không có mẫu gấu: khách chọn tại quầy.
 *   - Kết quả bốc ở POS (rules Firebase hiện "đã đăng nhập = toàn quyền" → không bốc trên máy khách); khách quay lúc nào cũng được
 *     tới hạn nhận = MỞ kết quả. Trúng ở quán nào nhận ở quán đó: nhân viên nhập SĐT → Đổi quà → mã hết hiệu lực.
 *   - Hạn nhận 31/12/2026; gấu chưa nhận quay về kho (dùng cho chương trình sau).
 *   - Chỉ chạy khi CÔNG TẮC BẬT (gau_noel_2026_kho/_cfg.bat — tab Quản lý pos) VÀ trong ngày của đợt (giờ máy chủ .info/serverTimeOffset).
 *     Tắt (mặc định) = không bốc, không hiện gì, không ghi gì; chỉ nghe 1 doc _cfg.
 *   - Dữ liệu riêng (không đụng customers): gau_noel_2026/{sđt}, gau_noel_2026_kho/{quán | _cfg}.
 *   - Gắn vào app bằng ĐÚNG 1 THẺ trước </body>: <script src="gau_noel_giangsinh.v1.js" data-quan="tc33|xofa|gieo"></script>
 *     Phần gắn chỉ BỌC hàm sẵn có của app từ bên ngoài (không sửa code bên trong app).
 * Sửa file này sau khi đã deploy = tạo gau_noel_giangsinh.v2.js (cùng quy tắc phiên bản như engine).
 *
 * ═══ GỠ CHƯƠNG TRÌNH SẠCH SẼ KHI HẾT GIÁNG SINH (sau 31/12/2026) ═══
 *   1. pos.html (The cafe 33) → Quản lý → tab «Gấu Noel»:
 *        a. Bấm TẮT chương trình (3 quán ngừng ngay, không cần deploy).
 *        b. (Tuỳ chọn) Tải thống kê, chụp màn hình để lưu số liệu đợt.
 *        c. Bấm «Xoá dữ liệu Gấu Noel…», nhập mã 2512 → xoá hết gau_noel_2026 (khách, lượt, mã) + gau_noel_2026_kho (kho, công tắc)
 *           + Realtime gau_noel_2026_kiosk (màn hình phụ).
 *           Không đụng customers, đơn hàng, điểm, tem. Báo lỗi giữa chừng → bấm lại, xoá tiếp phần còn lại.
 *   2. Deploy bộ ban_deploy/thuong/ (đã bỏ sẵn thẻ Gấu Noel — xem ban_deploy/README.md). Muốn bỏ hẳn khỏi file gốc trong repo:
 *      gỡ 1 thẻ <script src="gau_noel_giangsinh.v…js" …> trước </body> ở: pos.html, PosX.html, posgieo.html
 *      + kiosk.html (màn hình phụ XOFA)
 *      + index_giangsinh.html: đặt GAU_NOEL = '' trong tools/tao_ban_giangsinh.js rồi chạy lại node tools/tao_ban_giangsinh.js
 *        (hoặc deploy lại index.html bình thường nếu hết mùa Giáng sinh).
 *      Tìm nhanh: grep -n "gau_noel_giangsinh" *.html
 *   3. Chạy lại bản sinh tự động có chép từ các file trên: node tools/tao_ban_tet.js (pos_tet / PosX_tet), node tools/tao_ban_thu.js
 *      (posgieo_thu / quanlygieo_thu); chạy sh tests/run_all.sh — xoá luôn tests/gau_noel.test.js.
 *   4. Deploy (chủ dự án tự chạy). Sau đó xoá file gau_noel_giangsinh.v*.js khỏi thư mục deploy ở lần deploy KẾ TIẾP
 *      (để máy còn bản HTML cũ trong bộ nhớ đệm không lỗi khi xin file).
 *   5. data_access.v9.js giữ nguyên (2 tên gau_noel_2026* trong bảng đăng ký không ảnh hưởng gì) — không tạo bản mới chỉ để bỏ tên.
 *   6. Xoá docs/KE_HOACH_GAU_NOEL_2026.md hoặc chuyển vào docs/luu_tru/, bỏ dòng Gấu Noel trong CLAUDE.md.
 *   Bỏ qua bước 1c trước khi gỡ thẻ script = dữ liệu còn nằm trên Firebase (không hại gì, nhưng phải gắn lại file để xoá).
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
  function tenQuan(s) { return TEN_QUAN[s] || (/^gg\d+$/.test(s) ? 'Gieo Gieo ' + s.toUpperCase() : String(s || '')); }

  // ── công tắc (gau_noel_2026_kho/_cfg) — tắt = không chạy gì ─
  var BAT_DAU_GOC = CFG.batDau, BAT = false, CFG_DOC = null;
  function apCfg(d) {
    CFG_DOC = d || null;
    BAT = !!(d && d.bat === true);
    CFG.batDau = d && /^\d{4}-\d{2}-\d{2}$/.test(d.batDau || '') && d.batDau <= CFG.noel[0] ? d.batDau : BAT_DAU_GOC;
  }
  function dangBat() { return BAT; }

  // ── đồng hồ (giờ máy chủ) ─────────────────────────────────
  var offset = 0;
  function now() { return Date.now() + offset; }
  function vnDay(ms) { return new Date((ms == null ? now() : ms) + VN).toISOString().slice(0, 10); }
  function vnHour(ms) { return new Date((ms == null ? now() : ms) + VN).getUTCHours(); }
  function dayStart(key) { return Date.parse(key + 'T00:00:00+07:00'); }
  function cong(key, n) { return vnDay(dayStart(key) + n * DAY + 3600e3); }
  function soNgay(a, b) { return Math.round((dayStart(b) - dayStart(a)) / DAY); }
  function dangMua(ms) { var d = vnDay(ms); return BAT && d >= CFG.batDau && d <= CFG.noel[2]; }        // đơn được tính lượt
  function dangNhan(ms) { var d = vnDay(ms); return BAT && d >= CFG.batDau && d <= CFG.hanNhan; }       // mở lượt / đổi quà
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
      var k = null, muon = false;
      if (bed && l === 0) k = 'bed';
      else if (chacTrung(out.streak, out.acc, noel)) k = 'pity';
      else if (chacLy && l === L - 1 && wins === 0) k = 'big';
      if (k) { if (!trao(k)) k = null; }
      else {
        var ok = conKho(kho, ch, band), r = rand();
        if (ok && r < pTurn(L, tienLuot, out.streak, hsNg, heSoKho(kho, ch, band)) && trao(band)) {
          k = band;
          if (ok === 'carry') { kho.carry = (Number(kho.carry) || 0) + 1; muon = true; }
        }
      }
      if (k) { wins++; out.streak = 0; out.acc = 0; } else out.streak++;
      out.luot.push({ k: k, win: !!k, w: ch.w, noel: noel, carry: !!(k && muon) });
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
  var FS = null, FV = null, DB = null;
  var KIOSK_ROOT = 'gau_noel_2026_kiosk';   // RT: màn hình phụ XOFA (kiosk.html) — { xofa: { bat, ev } }
  function init(o) {
    o = o || {};
    FS = o.fstore || FS;
    DB = o.db || DB;
    FV = o.FieldValue || FV || (root.firebase && root.firebase.firestore && root.firebase.firestore.FieldValue) || null;
    if (o.db && o.db.ref) {
      try { o.db.ref('.info/serverTimeOffset').on('value', function (s) { offset = Number(s && s.val ? s.val() : 0) || 0; }); } catch (e) {}
    }
    if (typeof o.offset === 'number') offset = o.offset;
    return GauNoel;
  }
  function refCfg() { return FS.collection(CFG.khoColl).doc('_cfg'); }
  /** Nghe công tắc (1 doc). cb() mỗi lần đổi. Lỗi → coi như tắt. */
  function ngheCfg(cb) {
    if (!FS) return function () {};
    try { return refCfg().onSnapshot(function (s) { apCfg(s.exists ? s.data() : null); if (cb) cb(); },
      function (e) { console.warn('[gấu] không đọc được công tắc', e); apCfg(null); if (cb) cb(); }); }
    catch (e) { console.warn('[gấu] không nghe được công tắc', e); apCfg(null); return function () {}; }
  }
  function docCfg() { return refCfg().get().then(function (s) { apCfg(s.exists ? s.data() : null); return CFG_DOC; }); }
  /** Bật / tắt + ngày bắt đầu (tab Quản lý pos). */
  function datCfg(o) {
    var u = { at: new Date(now()).toISOString(), by: String((o && o.by) || '') };
    if (o && typeof o.bat === 'boolean') u.bat = o.bat;
    if (o && o.batDau !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.batDau) || o.batDau > CFG.noel[0]) return Promise.reject(new Error('ngay'));
      u.batDau = o.batDau;
    }
    return refCfg().set(u, { merge: true }).then(function () { apCfg(Object.assign({}, CFG_DOC || {}, u)); return CFG_DOC; });
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
        var r = bocThuan(d, kho, don, n, rand), at = new Date(n).toISOString(), luot = {}, qua = {}, list = [], ma = {};
        var daCo = (d.qua || {}), maKho = kho.ma || {};
        r.luot.forEach(function (x, i) {
          var id = don.store + '_' + bill + '_' + i, code = null;
          if (x.win) {
            var thu = 0;   // tối đa 60 lần (nguồn ngẫu nhiên hỏng / trùng liên tục) → đổi sang Math.random, rồi ghép thêm số thứ tự
            do { code = maNhan(thu < 30 ? rand : Math.random); thu++; } while ((daCo[code] || qua[code] || maKho[code]) && thu < 60);
            if (daCo[code] || qua[code] || maKho[code]) code = 'GAU' + ('00000' + (Object.keys(maKho).length + i + 1).toString(36).toUpperCase()).slice(-5);
            qua[code] = { store: don.store, bill: bill, luot: id, at: at, used: false }; }
          luot[id] = { store: don.store, bill: bill, at: at, ly: Number(don.ly) || 0, tienNuoc: Number(don.tienNuoc) || 0,
            k: x.k || '', w: x.w, win: x.win, code: code || '', opened: false };
          if (x.carry) luot[id].carry = true;
          if (code) ma[code] = { sdt: p, bill: bill, at: at, used: false };
          list.push(Object.assign({ id: id }, luot[id]));
        });
        tx.set(rk, { sdt: p, streak: r.streak, acc: r.acc, luot: luot, qua: qua, lastAt: at }, { merge: true });
        // sổ mã của quán (ma.{mã}) — Đổi quà đối chiếu cả 2 nơi: mã chỉ ghi vào hồ sơ khách (tự ghi được) thì không đổi được
        tx.set(rq, { dung: kho.dung, pre: kho.pre, phat: kho.phat || 0, carry: kho.carry || 0, ma: ma, lastAt: at }, { merge: true });
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

  /** Mở (quay) 1 lượt đã bốc — app khách hoặc nút "Mở lượt tại quầy". id: mã lượt, hoặc mảng ưu tiên
   *  (lượt đầu tiên trong mảng còn chưa mở); không có / hết → lượt chưa mở cũ nhất. */
  function mo(sdt, id) {
    var p = normPhone(sdt);
    if (!FS || p.length < 9) return Promise.reject(new Error('sdt'));
    if (!dangNhan()) return Promise.reject(new Error('het-dot'));
    var r = refKhach(p), kq = null, err = null;
    return FS.runTransaction(function (tx) {
      return tx.get(r).then(function (s) {
        var d = s.exists ? s.data() : {}, ds = luotCua(d).filter(function (x) { return !x.opened && !x.huy; });
        var x = null;
        if (Array.isArray(id)) { for (var i = 0; i < id.length && !x; i++) x = ds.filter(function (y) { return y.id === id[i]; })[0] || null; if (!x) x = ds[0]; }
        else x = id ? ds.filter(function (y) { return y.id === id; })[0] : ds[0];
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
    if (!/^GAU[A-Z0-9]{5}$/.test(String(code || ''))) return Promise.reject(new Error('khong-co'));
    return FS.runTransaction(function (tx) {
      return Promise.all([tx.get(r), tx.get(rq)]).then(function (ss) {
        var q = ((ss[0].exists ? ss[0].data() : {}).qua || {})[code];
        if (!q || q.huy) { err = 'khong-co'; return; }
        if (q.store !== store) { err = 'sai-quan'; return; }
        if (q.used) { err = 'da-doi'; return; }
        var m = ((ss[1].exists ? ss[1].data() : {}).ma || {})[code];
        if (!m || normPhone(m.sdt) !== p) { err = 'ma-la'; return; }   // không có trong sổ mã của quán → không đổi
        if (m.used) { err = 'da-doi'; return; }
        var u = {}, at = new Date(now()).toISOString();
        u['qua.' + code + '.used'] = true; u['qua.' + code + '.usedAt'] = at; u['qua.' + code + '.usedBy'] = String(nv || '');
        tx.update(r, u);
        var ma = {}; ma[code] = { used: true, usedAt: at };
        tx.set(rq, { doi: FV ? FV.increment(1) : 1, ma: ma }, { merge: true });
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
        var dung = kho.dung || {}, pre = kho.pre || {}, phat = Number(kho.phat) || 0, canh = Number(kho.canhBao) || 0, carry = Number(kho.carry) || 0;
        ds.forEach(function (x) {
          kq.bo++;
          var q = x.code ? (d.qua || {})[x.code] : null;
          if (q && q.used) { kq.daNhan++; canh++; u['luot.' + x.id + '.huy'] = true; u['qua.' + x.code + '.billHuy'] = true; return; }
          if (x.win && x.k && x.w) {
            var dw = dung[x.w] = dung[x.w] || {}; dw[x.k] = Math.max(0, (Number(dw[x.k]) || 0) - 1);
            if (x.w.charAt(0) === 'W') pre[x.k] = Math.max(0, (Number(pre[x.k]) || 0) - 1);
            phat = Math.max(0, phat - 1); kq.traKho++;
            if (x.carry) carry = Math.max(0, carry - 1);   // gấu 23–25/12 mượn phần trước 23 chưa phát → trả lại phần đó
          }
          u['luot.' + x.id] = FV.delete();
          if (x.code) { u['qua.' + x.code] = FV.delete(); ku['ma.' + x.code] = FV.delete(); }
        });
        tx.update(rk, u);
        if (ss[1].exists) {
          ku.dung = dung; ku.pre = pre; ku.phat = phat; ku.canhBao = canh; ku.carry = carry;
          tx.update(rq, ku);
        }
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
      var out = {}; snap.forEach(function (d) { if (d.id !== '_cfg') out[d.id] = d.data() || {}; }); return out;
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
  // ── Dashboard (tab Quản lý pos) ─────────────────────────
  // Ngưỡng nghi ngờ 1 SĐT (khoanh vùng — không tự chặn): nhận nhiều con cả đợt / nhiều con trong 1 ngày / trúng tỉ lệ quá cao.
  var NGHI = { nhan: 3, ngay: 2, tiLe: 0.6, tiLeLuot: 3 };
  function ngayCua(iso) { var t = Date.parse(iso || ''); return isNaN(t) ? '' : vnDay(t); }
  /** Tổng hợp thuần: ds = [{ id: sđt, data }], khos = { quán: doc kho }, hom = 'YYYY-MM-DD' (giờ VN). */
  function tongHop(ds, khos, hom) {
    var quan = {}, khach = [], Q = function (s) {
      return quan[s] = quan[s] || { trungHom: 0, nhanHom: 0, luotHom: 0, luot: 0, trung: 0, nhan: 0, cho: 0, tong: 0, phat: 0, con: 0, canhBao: 0, kho: null };
    };
    Object.keys(khos || {}).forEach(function (s) {
      var k = khos[s] || {}, q = Q(s);
      q.tong = Number(k.tong) || 0; q.phat = Number(k.phat) || 0; q.con = Math.max(0, q.tong - q.phat); q.canhBao = Number(k.canhBao) || 0; q.kho = k;
    });
    (ds || []).forEach(function (row) {
      var d = row.data || {}, kh = { sdt: row.id, luot: 0, trung: 0, nhan: 0, cho: 0, quan: {}, lanCuoi: '', theoNgay: {}, nghi: [] };
      luotCua(d).forEach(function (x) {
        if (x.huy) return;
        var q = Q(x.store); q.luot++; kh.luot++;
        if (ngayCua(x.at) === hom) q.luotHom++;
        if (x.win) { q.trung++; kh.trung++; if (ngayCua(x.at) === hom) q.trungHom++; }
      });
      quaCua(d).forEach(function (g) {
        if (g.huy) return;
        var q = Q(g.store);
        kh.quan[g.store] = (kh.quan[g.store] || 0) + 1;
        if (g.used) {
          q.nhan++; kh.nhan++;
          var nd = ngayCua(g.usedAt); if (nd === hom) q.nhanHom++;
          kh.theoNgay[nd] = (kh.theoNgay[nd] || 0) + 1;
          if (String(g.usedAt || '') > kh.lanCuoi) kh.lanCuoi = String(g.usedAt || '');
        } else { q.cho++; kh.cho++; }
      });
      if (!kh.luot && !kh.trung) return;
      if (kh.nhan >= NGHI.nhan) kh.nghi.push('nhận ' + kh.nhan + ' con');
      var maxNgay = 0; Object.keys(kh.theoNgay).forEach(function (n) { if (kh.theoNgay[n] > maxNgay) maxNgay = kh.theoNgay[n]; });
      if (maxNgay >= NGHI.ngay) kh.nghi.push(maxNgay + ' con trong 1 ngày');
      if (kh.luot >= NGHI.tiLeLuot && kh.trung / kh.luot >= NGHI.tiLe) kh.nghi.push('trúng ' + kh.trung + '/' + kh.luot + ' lượt');
      if ((Number(d.streak) || 0) > kh.luot + 2) kh.nghi.push('chuỗi trượt lạ (' + d.streak + ')');   // hồ sơ bị sửa tay
      delete kh.theoNgay;
      khach.push(kh);
    });
    khach.sort(function (a, b) { return (b.nghi.length - a.nghi.length) || (b.nhan - a.nhan) || (b.trung - a.trung) || (a.sdt < b.sdt ? -1 : 1); });
    var he = { trungHom: 0, nhanHom: 0, luotHom: 0, luot: 0, trung: 0, nhan: 0, cho: 0, tong: 0, phat: 0, con: 0, canhBao: 0 };
    Object.keys(quan).forEach(function (s) { Object.keys(he).forEach(function (f) { he[f] += quan[s][f] || 0; }); });
    return { hom: hom, quan: quan, he: he, khach: khach, nghi: khach.filter(function (k) { return k.nghi.length; }).length };
  }
  /** Kho từng kịch bản của 1 quán tại ngày hom: mỗi kho ngẫu nhiên → { chang: [đã, trần], truoc23: [đã, trần], noel: [[đã, trần] ×3] }; chắc trúng → đã phát. */
  function khoKichBan(kho, hom) {
    kho = kho || {}; var ch = chang(hom), out = { w: ch ? ch.w : '', type: ch ? ch.type : '', ngau: {}, chac: {} };
    KHO_NGAU.forEach(function (k) {
      var c = capOf(kho, k);
      out.ngau[k] = {
        chang: ch && ch.type !== 'noel' ? [dungW(kho, ch.w, k), trChang(kho, ch, k)] : null,
        truoc23: [Number((kho.pre || {})[k]) || 0, Number(c.pre) || 0],
        noel: [0, 1, 2].map(function (i) { return [dungW(kho, 'N' + i, k), Number((c.n || [])[i]) || 0]; })
      };
    });
    KHO_CHAC.forEach(function (k) { var s = 0; Object.keys(kho.dung || {}).forEach(function (w) { s += Number(kho.dung[w][k]) || 0; }); out.chac[k] = s; });
    out.carry = Number(kho.carry) || 0; out.conTruoc23 = conLaiTruoc23(kho);
    return out;
  }
  /** Đọc cả bảng khách + kho (chỉ khi mở tab / bấm Làm mới) → tongHop. */
  function dashboard() {
    return Promise.all([FS.collection(CFG.coll).get(), docKho()]).then(function (r) {
      var ds = []; r[0].forEach(function (doc) { ds.push({ id: doc.id, data: doc.data() || {} }); });
      return tongHop(ds, r[1], vnDay());
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
    return round(CFG.coll).then(function () { return round(CFG.khoColl); })
      .then(function () { return DB && DB.ref ? DB.ref(KIOSK_ROOT).remove() : null; })
      .then(function () { return done; });
  }

  var GauNoel = {
    CFG: CFG, KIOSK_ROOT: KIOSK_ROOT, BAT_DAU_GOC: BAT_DAU_GOC, tenQuan: tenQuan, apCfg: apCfg, dangBat: dangBat, ngheCfg: ngheCfg, docCfg: docCfg, datCfg: datCfg,
    KHO_NGAU: KHO_NGAU, KHO_CHAC: KHO_CHAC, TEN_KHO: TEN_KHO, TEN_QUAN: TEN_QUAN,
    now: now, vnDay: vnDay, vnHour: vnHour, dangMua: dangMua, dangNhan: dangNhan, hetDot: hetDot, chang: chang,
    soLuot: soLuot, bandOf: bandOf, pTurn: pTurn, nguongLai: nguongLai, chacTrung: chacTrung, laiDon: laiDon,
    conKho: conKho, heSoKho: heSoKho, heSoNgayGio: heSoNgayGio, bocThuan: bocThuan, maNhan: maNhan, normPhone: normPhone,
    stateOf: stateOf, init: init, boc: boc, load: load, mo: mo, quaTaiQuan: quaTaiQuan, doi: doi, huyBill: huyBill,
    docKhach: function (p) { return refKhach(p); },
    luuKho: luuKho, docKho: docKho, NGHI: NGHI, tongHop: tongHop, khoKichBan: khoKichBan, dashboard: dashboard, thongKe: thongKe, xoaHet: xoaHet,
    _setOffset: function (v) { offset = v; }
  };
  root.GauNoel = GauNoel;
  if (typeof module !== 'undefined' && module.exports) module.exports = GauNoel;
})(typeof window !== 'undefined' ? window : globalThis);

/* ═══ PHẦN GẮN VÀO APP ═══ (chỉ chạy trong trình duyệt, theo data-quan của thẻ script)
 * Chỉ BỌC hàm sẵn có của app — không sửa code bên trong app. App đổi tên hàm → phần gắn tự bỏ qua (cảnh báo console).
 *   tc33 (pos.html):    _pushPaidOrder + clearDebtAfterPayment (chỉ chạy khi đơn lưu thành công) → bốc → popup QR;
 *                       checkSdtLive / resetPhoneInput → khung Gấu Noel (Đổi quà, Mở lượt tại quầy); tab Quản lý «Gấu Noel».
 *   xofa (PosX.html):   _loyaltyAfterSave → bốc → hỏi «Quay tại quán / Quét mã» (màn hình phụ: vòng quay hoặc QR); renderCustomerInfo / clearCustomer → khung; delOrderConfirm → huỷ bill.
 *   gieo (posgieo.html): assistFinalizeOrder → bốc; POSPrinter.autoPrintIfEnabled → hỏi «Quay tại quán / Quét mã ở nhà» trước khi in;
 *                       buildReceiptContent / renderReceiptCanvas → QR cuối bill (bỏ khi quay tại quán);
 *                       renderCustomerInfo / clearCustomer → khung; delOrderConfirm → huỷ bill.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !window.GauNoel) return;
  var me = document.currentScript, APP = me && me.getAttribute('data-quan');
  if (!APP || ['tc33', 'xofa', 'gieo', 'kiosk', 'khach'].indexOf(APP) < 0) return;
  var G = window.GauNoel, URL_KHACH = 'https://the-cafe-33.web.app';
  // QR tĩnh dẫn tới URL_KHACH (29×29, mức M — dựng sẵn bằng qrcode-generator, không cần thư viện lúc chạy)
  var QR_N = 29, QR_PATH = 'M0 0h7v1h-7zM11 0h1v1h-1zM15 0h2v1h-2zM18 0h3v1h-3zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM9 1h1v1h-1zM11 1h2v1h-2zM17 1h2v1h-2zM20 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h5v1h-5zM14 2h1v1h-1zM16 2h1v1h-1zM18 2h1v1h-1zM20 2h1v1h-1zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h1v1h-1zM12 3h1v1h-1zM16 3h3v1h-3zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h2v1h-2zM11 4h5v1h-5zM17 4h4v1h-4zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h1v1h-1zM13 5h5v1h-5zM20 5h1v1h-1zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM8 7h1v1h-1zM10 7h1v1h-1zM13 7h1v1h-1zM15 7h1v1h-1zM18 7h3v1h-3zM0 8h1v1h-1zM2 8h5v1h-5zM11 8h1v1h-1zM14 8h2v1h-2zM17 8h1v1h-1zM20 8h1v1h-1zM22 8h5v1h-5zM0 9h1v1h-1zM2 9h1v1h-1zM4 9h2v1h-2zM8 9h2v1h-2zM15 9h2v1h-2zM18 9h7v1h-7zM28 9h1v1h-1zM1 10h2v1h-2zM4 10h1v1h-1zM6 10h1v1h-1zM8 10h1v1h-1zM10 10h1v1h-1zM12 10h1v1h-1zM18 10h1v1h-1zM21 10h1v1h-1zM23 10h2v1h-2zM1 11h3v1h-3zM12 11h1v1h-1zM14 11h1v1h-1zM16 11h1v1h-1zM19 11h2v1h-2zM22 11h2v1h-2zM25 11h1v1h-1zM27 11h1v1h-1zM2 12h1v1h-1zM6 12h2v1h-2zM9 12h1v1h-1zM12 12h1v1h-1zM16 12h2v1h-2zM19 12h1v1h-1zM25 12h2v1h-2zM1 13h2v1h-2zM4 13h1v1h-1zM8 13h1v1h-1zM10 13h1v1h-1zM13 13h3v1h-3zM19 13h1v1h-1zM21 13h2v1h-2zM24 13h1v1h-1zM28 13h1v1h-1zM0 14h2v1h-2zM3 14h6v1h-6zM10 14h2v1h-2zM13 14h4v1h-4zM18 14h1v1h-1zM20 14h2v1h-2zM23 14h4v1h-4zM1 15h1v1h-1zM3 15h1v1h-1zM9 15h5v1h-5zM15 15h1v1h-1zM18 15h2v1h-2zM23 15h2v1h-2zM27 15h1v1h-1zM0 16h2v1h-2zM5 16h3v1h-3zM10 16h3v1h-3zM14 16h2v1h-2zM17 16h1v1h-1zM20 16h1v1h-1zM25 16h2v1h-2zM0 17h5v1h-5zM7 17h1v1h-1zM9 17h1v1h-1zM12 17h1v1h-1zM15 17h2v1h-2zM19 17h1v1h-1zM21 17h4v1h-4zM26 17h1v1h-1zM28 17h1v1h-1zM0 18h1v1h-1zM3 18h1v1h-1zM5 18h4v1h-4zM11 18h1v1h-1zM18 18h1v1h-1zM20 18h1v1h-1zM24 18h1v1h-1zM26 18h1v1h-1zM0 19h1v1h-1zM2 19h2v1h-2zM8 19h2v1h-2zM14 19h1v1h-1zM16 19h1v1h-1zM18 19h2v1h-2zM21 19h2v1h-2zM27 19h1v1h-1zM0 20h1v1h-1zM2 20h3v1h-3zM6 20h1v1h-1zM10 20h1v1h-1zM16 20h1v1h-1zM18 20h1v1h-1zM20 20h5v1h-5zM26 20h3v1h-3zM8 21h2v1h-2zM13 21h3v1h-3zM17 21h4v1h-4zM24 21h5v1h-5zM0 22h7v1h-7zM9 22h1v1h-1zM12 22h6v1h-6zM19 22h2v1h-2zM22 22h1v1h-1zM24 22h3v1h-3zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h1v1h-1zM10 23h4v1h-4zM15 23h1v1h-1zM17 23h2v1h-2zM20 23h1v1h-1zM24 23h1v1h-1zM28 23h1v1h-1zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM8 24h2v1h-2zM11 24h1v1h-1zM14 24h2v1h-2zM20 24h5v1h-5zM26 24h3v1h-3zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h3v1h-3zM13 25h1v1h-1zM15 25h2v1h-2zM18 25h2v1h-2zM25 25h2v1h-2zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h2v1h-2zM11 26h1v1h-1zM13 26h2v1h-2zM18 26h10v1h-10zM0 27h1v1h-1zM6 27h1v1h-1zM9 27h2v1h-2zM14 27h1v1h-1zM16 27h1v1h-1zM20 27h1v1h-1zM24 27h2v1h-2zM27 27h1v1h-1zM0 28h7v1h-7zM8 28h2v1h-2zM13 28h2v1h-2zM16 28h1v1h-1zM18 28h1v1h-1zM23 28h4v1h-4z';
  function qrSvg(px) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ' + (QR_N + 4) + ' ' + (QR_N + 4) + '" width="' + px + '" height="' + px +
      '" shape-rendering="crispEdges" style="background:#fff;border-radius:10px;display:block"><path d="' + QR_PATH + '" fill="#000"/></svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  // ── VÒNG QUAY (dùng chung POS / màn hình phụ / app khách) ──
  // Kết quả đã bốc ở POS lúc thanh toán; vòng chỉ quay rồi DỪNG ĐÚNG Ô của kết quả đó. Chỉ animate transform.
  // 3 ô (chủ dự án 16/10): Gấu bông · Chúc bạn may mắn lần sau · Merry Christmas.
  // Không trúng → kim dừng SÁT MÉP ô Gấu bông (cách 2–6°) để tạo hồi hộp.
  var VONG = [
    { id: 'gau', nen: '#d62b3a', chu: '#ffffff', ic: '🧸', dong: ['GẤU BÔNG'] },
    { id: 'mm', nen: '#ffffff', chu: '#b3162a', ic: '🍀', dong: ['CHÚC BẠN', 'MAY MẮN', 'LẦN SAU'] },
    { id: 'xmas', nen: '#166534', chu: '#ffffff', ic: '🎄', dong: ['MERRY', 'CHRISTMAS'] }
  ], VONG_O = VONG.length, VONG_GOC = 360 / VONG_O;
  (function () {
    var c = document.createElement('style');
    c.textContent = '.gn-vong{position:relative;margin:12px auto 8px;max-width:100%}' +
      '.gn-vong svg{width:100%;height:100%;display:block;will-change:transform;transform:rotate(0deg)}' +
      '.gn-vong .gn-kim{position:absolute;left:50%;top:-8px;margin-left:-14px;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-top:26px solid #f3c64a;z-index:2;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}' +
      '@media(prefers-reduced-motion:reduce){.gn-vong svg{transition:none!important}}';
    document.head.appendChild(c);
  })();
  function vongSvg(px) {
    var R = 100, h = '', rad = function (d) { return (d - 90) * Math.PI / 180; }, f = function (n) { return n.toFixed(2); };
    VONG.forEach(function (o, i) {
      var a0 = rad(i * VONG_GOC - VONG_GOC / 2), a1 = rad(i * VONG_GOC + VONG_GOC / 2);
      h += '<path d="M0 0L' + f(R * Math.cos(a0)) + ' ' + f(R * Math.sin(a0)) + 'A' + R + ' ' + R + ' 0 0 1 ' + f(R * Math.cos(a1)) + ' ' + f(R * Math.sin(a1)) +
        'Z" fill="' + o.nen + '" stroke="#f3d27a" stroke-width="1.5"/><g transform="rotate(' + (i * VONG_GOC) + ')">' +
        '<text x="0" y="-70" text-anchor="middle" font-size="24">' + o.ic + '</text>' +
        o.dong.map(function (t, j) {
          return '<text x="0" y="' + (-50 + j * 13.5) + '" text-anchor="middle" font-size="10" font-weight="900" letter-spacing=".4" fill="' + o.chu + '" font-family="Inter,Arial,sans-serif">' + t + '</text>';
        }).join('') + '</g>';
    });
    for (var j = 0; j < 12; j++) { var b = rad(j * 30); h += '<circle cx="' + f(105 * Math.cos(b)) + '" cy="' + f(105 * Math.sin(b)) + '" r="2.6" fill="#fff7d6"/>'; }
    return '<div class="gn-vong" style="width:' + px + 'px;height:' + px + 'px"><div class="gn-kim"></div>' +
      '<svg viewBox="-112 -112 224 224"><circle r="110" fill="#e9b949"/><circle r="102" fill="#7a1027"/>' + h +
      '<circle r="17" fill="#fff7d6" stroke="#e9b949" stroke-width="4"/><text y="6" text-anchor="middle" font-size="16">⭐</text></svg></div>';
  }
  /** Góc (trên vòng, độ, 0 = giữa ô Gấu bông) sẽ nằm dưới kim. win → trong ô Gấu bông; trượt → sát mép ô Gấu bông, phía ô bên cạnh. */
  function gocDung(win, rnd) {
    var nua = VONG_GOC / 2;
    if (win) return (rnd() - 0.5) * 2 * (nua - 10);                 // trong ô gấu, cách mép ≥ 10°
    var sat = 2 + rnd() * 4;                                        // 2–6° ngoài mép
    return rnd() < 0.5 ? nua + sat : -(nua + sat);
  }
  /** Quay vòng tới đúng kết quả, xong gọi cb. Quay tiếp nối từ góc hiện tại (≥ 5 vòng). */
  function quayVong(vong, win, cb) {
    var svg = vong && vong.querySelector('svg'); if (!svg) { if (cb) cb(); return; }
    var cur = Number(vong.getAttribute('data-r')) || 0, theta = gocDung(!!win, Math.random);
    var dich = ((-theta) % 360 + 360) % 360, r = cur + 5 * 360 + ((dich - cur % 360) + 360) % 360;
    vong.setAttribute('data-r', String(r));
    var ms = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 5200;
    svg.style.transition = 'transform ' + ms + 'ms cubic-bezier(.1,.55,.08,1)';
    svg.style.transform = 'rotate(' + r + 'deg)';
    setTimeout(function () { if (cb) cb(); }, ms + 200);
  }
  G._vong = { svg: vongSvg, quay: quayVong, gocDung: gocDung, O: VONG_O };
  function boc(name, fn) {   // bọc hàm toàn cục của app
    var cu = window[name];
    if (typeof cu !== 'function') { console.warn('[gấu] app không có hàm ' + name + ' — bỏ qua phần gắn này'); return false; }
    window[name] = fn(cu); return true;
  }
  function an(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { console.warn('[gấu]', e); } }; }

  if (APP === 'kiosk') { ganKiosk(); return; }
  var fs0 = null, db0 = null;
  try { fs0 = fstore; db0 = db; } catch (e) { /* app không có fstore/db toàn cục */ }
  if (!fs0) { console.warn('[gấu] không thấy fstore'); return; }
  G.init({ fstore: fs0, db: db0, FieldValue: window.firebase && firebase.firestore && firebase.firestore.FieldValue });
  if (APP === 'khach') { ganKhach(fs0); return; }
  function store() {
    if (APP !== 'gieo') return APP;
    try { return window.GieoData && GieoData.storeId ? GieoData.storeId() : null; } catch (e) { return null; }
  }

  // ── giao diện chung ──
  var css = document.createElement('style');
  css.textContent =
    '#gn-panel{margin:10px 0 0;border-radius:16px;background:linear-gradient(135deg,#fff5f5,#f0fdf4);border:1.5px solid #fca5a5;padding:10px 12px;display:none;font-family:inherit}' +
    '.gn-khung .gn-h{display:flex;align-items:center;gap:8px;font-weight:900;font-size:13px;color:#991b1b}' +
    '.gn-khung .gn-tag{font-size:10px;font-weight:900;letter-spacing:.06em;padding:3px 8px;border-radius:99px;background:#166534;color:#fff}' +
    '.gn-khung .gn-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border-radius:12px;background:#fff;border:1px solid #fecaca}' +
    '.gn-khung .gn-t{flex:1;min-width:0}.gn-khung .gn-t b{display:block;font-size:13px;color:#111827}.gn-khung .gn-t small{display:block;font-size:11px;color:#6b7280}' +
    '#gn-sdb-btn{position:absolute;top:16px;left:16px;z-index:5;display:none;align-items:center;gap:6px;border:none;border-radius:12px;padding:8px 12px;font-weight:800;font-size:12px;cursor:pointer;background:#fde8e8;color:#991b1b;font-family:inherit}#gn-sdb-btn.on{display:flex}' +
    '#gn-ov .gn-khung{text-align:left;margin-top:12px;max-height:46vh;overflow:auto}#gn-ov .gn-in{display:flex;gap:8px;margin-top:10px}#gn-ov .gn-in input{flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:1.5px solid #e5e7eb;font-size:17px;font-weight:800;letter-spacing:.04em;font-family:inherit}' +
    '.gn-btn{border:none;border-radius:99px;padding:8px 14px;font-weight:900;font-size:12px;cursor:pointer;background:#b91c1c;color:#fff;font-family:inherit}' +
    '.gn-btn.gn-g{background:#166534}.gn-btn.gn-x{background:#f3f4f6;color:#374151}.gn-btn:disabled{opacity:.5}' +
    '#gn-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(17,24,39,.55);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit}' +
    '#gn-ov .gn-card{background:#fff;border-radius:28px;max-width:380px;width:100%;padding:24px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}' +
    '#gn-ov h3{margin:0 0 4px;font-size:20px;font-weight:900;color:#991b1b}#gn-ov p{margin:6px 0;font-size:14px;color:#374151;line-height:1.5}' +
    '#gn-ov .gn-qr{display:flex;justify-content:center;margin:14px 0}#gn-ov .gn-acts{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}' +
    '#gn-ov .gn-code{font-size:26px;font-weight:900;letter-spacing:.12em;color:#166534}' +
    '#gn-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483001;background:#111827;color:#fff;padding:12px 18px;border-radius:14px;font-size:14px;font-weight:700;max-width:90vw;box-shadow:0 8px 30px rgba(0,0,0,.3);font-family:inherit}';
  document.head.appendChild(css);
  var tTimer = null;
  function toast(msg) {
    var t = $('gn-toast'); if (!t) { t = document.createElement('div'); t.id = 'gn-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; clearTimeout(tTimer); tTimer = setTimeout(function () { t.style.display = 'none'; }, 3500);
  }
  function hoi(msg) {
    if (typeof window._posConfirm === 'function') return window._posConfirm(msg);
    return Promise.resolve(window.confirm(msg));
  }
  function ov(html) {
    var o = $('gn-ov'); if (!o) { o = document.createElement('div'); o.id = 'gn-ov'; document.body.appendChild(o); }
    o.innerHTML = '<div class="gn-card">' + html + '</div>'; o.style.display = 'flex'; return o;
  }
  function dongOv() { var o = $('gn-ov'); if (o) o.style.display = 'none'; }
  G.dongManHinh = dongOv;
  G.onManHinh = null;   // PosX: đồng bộ màn hình phụ (gắn sau khi có file màn hình phụ) — fn(loai, dữ liệu)
  function phat(loai, d) { try { if (typeof G.onManHinh === 'function') G.onManHinh(loai, d); } catch (e) { console.warn('[gấu] màn hình phụ', e); } }

  /** Popup QR sau thanh toán (The cafe 33) */
  function popupQR(sdt, n, ids) {
    phat('qr', { sdt: sdt, soLuot: n });
    var o = ov('<h3>🎄 Quay trúng gấu Noel</h3><p>Khách có <b>' + n + ' lượt quay</b></p>' +
      '<div class="gn-qr">' + qrSvg(220) + '</div><p style="font-size:12.5px;color:#6b7280">Quét mã → đăng nhập SĐT ' + esc(sdt.slice(0, 4)) + '… → bấm Quay</p>' +
      '<div class="gn-acts"><button class="gn-btn gn-g" data-a="mo">Mở lượt tại quầy</button><button class="gn-btn gn-x" data-a="x">Đóng</button></div>');
    o.querySelector('[data-a=x]').onclick = function () { dongOv(); phat('dong'); };
    o.querySelector('[data-a=mo]').onclick = function () { moTaiQuay(sdt, ids); };
  }

  /** Mở lượt tại quầy (khách không dùng app) — từng lượt một */
  /** uuTien: mảng mã lượt mở trước (lượt của đơn vừa thanh toán / của quán này) — tránh mở lượt cũ ở quán khác. */
  // [16/10 chủ dự án] Quay TẠI QUẦY mà trúng gấu của chính quán này → khách nhận ngay → mã tự chuyển «Đã nhận»
  // (không cần bấm Đổi quà). Trúng gấu của lượt mua ở quán KHÁC → vẫn chờ nhận ở quán đó. Lượt khách tự quay trên app → đổi ở quán như cũ.
  function moTaiQuay(sdt, uuTien, khiDong) {
    var o = ov('<h3>🎄 Vòng quay gấu Noel</h3>' + vongSvg(250) + '<p id="gn-mo-msg">Bấm Quay để quay lượt của khách</p>' +
      '<div class="gn-acts"><button class="gn-btn" data-a="quay">Quay</button><button class="gn-btn gn-x" data-a="x">Đóng</button></div>');
    var vong = o.querySelector('.gn-vong'), msg = o.querySelector('#gn-mo-msg'), bQuay = o.querySelector('[data-a=quay]'), bX = o.querySelector('[data-a=x]');
    bX.onclick = function () { dongOv(); phat('dong'); if (typeof khiDong === 'function') khiDong(); else quet(sdt, true); };
    phat('mo', { sdt: sdt });
    bQuay.onclick = function () {
      bQuay.disabled = true; bX.disabled = true; msg.textContent = 'Đang quay…';
      G.mo(sdt, uuTien && uuTien.length ? uuTien : undefined).then(function (kq) {
        var q = store(), taiDay = kq.win && kq.store === q;
        // trúng gấu của quán này → đổi luôn (song song lúc vòng đang quay)
        var nhan = taiDay ? G.doi(q, sdt, kq.code, 'quay tại quầy').then(function () { return true; }, function (e) { return e; }) : Promise.resolve(false);
        phat('quay', { sdt: sdt, win: kq.win, code: kq.code, store: kq.store, conLai: kq.conLai });
        quayVong(vong, kq.win, function () { nhan.then(function (daNhan) {
          bX.disabled = false;
          if (kq.win && daNhan === true) msg.innerHTML = '<b>🧸 Trúng 1 gấu bông!</b><br><b style="color:#166534">Đưa gấu ngay cho khách</b> (khách chọn)<br><small>Mã ' + esc(kq.code) + ' đã tự chuyển «Đã nhận»</small>';
          else if (kq.win && taiDay) msg.innerHTML = '<b>🧸 Trúng 1 gấu bông!</b> · mã ' + esc(kq.code) + '<br><b style="color:#b91c1c">⚠️ Chưa ghi được «Đã nhận» (' + esc(daNhan && daNhan.message || 'lỗi') + ')</b> — bấm Đổi quà trong khung Gấu Noel trước khi đưa gấu';
          else if (kq.win) msg.innerHTML = '<b>🧸 Trúng 1 gấu bông!</b><br>Lượt mua ở ' + esc(G.tenQuan(kq.store)) + ' → nhận tại ' + esc(G.tenQuan(kq.store)) + '<div class="gn-code">' + esc(kq.code) + '</div>';
          else msg.innerHTML = 'Chưa trúng lần này — chúc may mắn lần sau!';
          phat('ketqua', { sdt: sdt, win: kq.win, code: kq.code, store: kq.store, conLai: kq.conLai, daNhan: daNhan === true });
          if (kq.conLai > 0) { bQuay.disabled = false; bQuay.textContent = 'Quay tiếp (còn ' + kq.conLai + ')'; } else bQuay.style.display = 'none';
        }); });
      }).catch(function (e) {
        bX.disabled = false;
        msg.textContent = e.message === 'het-luot' ? 'Khách đã quay hết lượt.' : 'Lỗi: ' + e.message; bQuay.style.display = 'none';
      });
    };
  }

  /** «Khách quay ở đâu?» (Gieo trước khi in bill · XOFA trước khi hiện QR màn hình phụ). chon(taiQuan) gọi đúng 1 lần;
   *  Quay tại quán → giữ popup (chon mở vòng quay); 15 giây không chọn → quét mã. */
  function popupNoiQuay(L, moTaQuan, moTaNha, chon) {
    var con = 15, t = null, daChon = false;
    var o = ov('<h3>🎄 Khách có ' + L + ' lượt quay gấu</h3><p>Khách quay ở đâu?</p>' +
      '<div class="gn-acts" style="flex-direction:column;align-items:stretch">' +
      '<button class="gn-btn" data-a="quan" style="padding:16px;font-size:16px">🎡 Quay tại quán<br><small style="font-weight:600;opacity:.85">' + moTaQuan + '</small></button>' +
      '<button class="gn-btn gn-g" data-a="nha" style="padding:16px;font-size:16px">📱 Quét mã ở nhà<br><small style="font-weight:600;opacity:.85">' + moTaNha + ' · <span data-dem>15</span>s</small></button></div>');
    var lam = function (taiQuan) {
      if (daChon) return; daChon = true; clearInterval(t);
      if (taiQuan) { var p = o.querySelector('p'); if (p) p.textContent = 'Đang mở vòng quay…'; } else dongOv();
      chon(taiQuan);
    };
    o.querySelector('[data-a=quan]').onclick = function () { lam(true); };
    o.querySelector('[data-a=nha]').onclick = function () { lam(false); };
    t = setInterval(function () { con--; var d = o.querySelector('[data-dem]'); if (d) d.textContent = String(con); if (con <= 0) lam(false); }, 1000);
  }

  // ── khung Gấu Noel cạnh ô SĐT: quà chưa nhận + Đổi quà + lượt chưa quay ──
  var panel = document.createElement('div'); panel.id = 'gn-panel'; panel.className = 'gn-khung';
  var neo = APP === 'tc33' ? ($('gift-panel') || $('sdt-status')) : $('voucherList');
  if (neo && neo.parentNode) neo.parentNode.insertBefore(panel, neo.nextSibling);
  var dangQuet = '', quetLuc = 0, qTimer = null;
  function anPanel() { panel.style.display = 'none'; panel.innerHTML = ''; dangQuet = ''; }
  /** Vẽ khung gấu của 1 SĐT vào el (khung cạnh ô SĐT · popup Đổi gấu ở sidebar). lamMoi() = đọc lại + vẽ lại. Trả có nội dung không. */
  function veKhung(el, sdt, st, lamMoi) {
    var q = store(), cho = st.qua.filter(function (x) { return !x.used; });
    var tai = cho.filter(function (x) { return x.store === q; }), khac = cho.filter(function (x) { return x.store !== q; });
    if (!tai.length && !khac.length && !st.chuaMo.length) { el.innerHTML = ''; return false; }
    var h = '<div class="gn-h">🧸 Gấu Noel của khách <span class="gn-tag">GIÁNG SINH</span></div>';
    tai.forEach(function (x) {
      h += '<div class="gn-row"><div class="gn-t"><b>1 gấu bông · ' + esc(x.code) + '</b><small>Trúng ' + esc(String(x.at || '').slice(0, 10)) + ' · khách chọn gấu tại quầy</small></div>' +
        '<button class="gn-btn gn-g" data-doi="' + esc(x.code) + '">Đổi quà</button></div>';
    });
    khac.forEach(function (x) {
      h += '<div class="gn-row"><div class="gn-t"><b>' + esc(x.code) + '</b><small>Nhận tại ' + esc(G.tenQuan(x.store)) + ' (không đổi ở quán này)</small></div></div>';
    });
    if (st.chuaMo.length) h += '<div class="gn-row"><div class="gn-t"><b>Còn ' + st.chuaMo.length + ' lượt chưa quay</b><small>Khách không dùng app → quay tại quầy (trúng thì nhận ngay)</small></div>' +
      '<button class="gn-btn" data-mo="1">Mở lượt</button></div>';
    el.innerHTML = h;
    Array.prototype.forEach.call(el.querySelectorAll('[data-doi]'), function (b) {
      b.onclick = function () {
        var code = b.getAttribute('data-doi');
        hoi('Đổi quà mã ' + code + ': đưa 1 gấu bông cho khách (khách chọn)?\nMã sẽ hết hiệu lực.').then(function (ok) {
          if (!ok) return;
          b.disabled = true;
          G.doi(q, sdt, code, '').then(function () { toast('✅ Đã đổi ' + code + ' — đưa 1 gấu bông cho khách'); lamMoi(); })
            .catch(function (e) {
              b.disabled = false;
              toast({ 'da-doi': '⚠️ Mã ' + code + ' đã đổi rồi', 'sai-quan': '⚠️ Mã này nhận ở quán khác', 'khong-co': '⚠️ Không thấy mã', 'ma-la': '⛔ Mã không có trong sổ của quán — KHÔNG đưa gấu, báo quản lý', 'het-han': '⚠️ Đã hết hạn nhận gấu' }[e.message] || ('❌ Lỗi: ' + e.message));
              lamMoi();
            });
        });
      };
    });
    var uu = st.chuaMo.filter(function (x) { return x.store === q; }).map(function (x) { return x.id; });
    var bm = el.querySelector('[data-mo]'); if (bm) bm.onclick = function () { moTaiQuay(sdt, uu, lamMoi); };
    return true;
  }
  function quet(sdt, ep) {
    sdt = G.normPhone(sdt);
    if (sdt.length < 10 || !G.dangNhan() || !store()) { anPanel(); return; }
    if (!ep && sdt === dangQuet && Date.now() - quetLuc < 15000) return;   // cùng SĐT vừa đọc → không đọc lại
    dangQuet = sdt; quetLuc = Date.now();
    G.load(sdt).then(function (st) {
      if (dangQuet !== sdt) return;
      panel.style.display = veKhung(panel, sdt, st, function () { quet(sdt, true); }) ? 'block' : 'none';
    }).catch(function (e) { console.warn('[gấu] đọc khách', e); });
  }
  /** Popup «Đổi gấu Noel» (nút ở sidebar PosX / posgieo) — không cần có món trong giỏ. */
  function moDoiGau(sdtSan) {
    if (!G.dangNhan()) { toast('Chương trình Gấu Noel đang tắt'); return; }
    var o = ov('<h3>🧸 Đổi gấu Noel</h3><p>Nhập SĐT khách để xem gấu chưa nhận / lượt chưa quay</p>' +
      '<div class="gn-in"><input type="tel" inputmode="numeric" id="gn-dg-sdt" placeholder="SĐT khách" autocomplete="off"><button class="gn-btn gn-g" data-a="tim">Tìm</button></div>' +
      '<div class="gn-khung" id="gn-dg-kq"></div><div class="gn-acts"><button class="gn-btn gn-x" data-a="x">Đóng</button></div>');
    var inp = o.querySelector('#gn-dg-sdt'), kq = o.querySelector('#gn-dg-kq');
    var tim = function () {
      var sdt = G.normPhone(inp.value);
      if (sdt.length < 10) { kq.innerHTML = '<p style="color:#b91c1c">SĐT chưa đủ số</p>'; return; }
      kq.innerHTML = '<p>Đang tìm…</p>';
      G.load(sdt).then(function (st) {
        // Đổi quà → vẽ lại tại chỗ; Mở lượt → vòng quay dùng chung hộp → đóng vòng quay thì mở lại popup này với SĐT đó
        if (!veKhung(kq, sdt, st, function () { if (document.getElementById('gn-dg-kq') === kq) tim(); else moDoiGau(sdt); }))
          kq.innerHTML = '<p>Khách chưa có gấu chờ nhận / lượt chưa quay.</p>';
      }).catch(function (e) { kq.innerHTML = '<p style="color:#b91c1c">Lỗi: ' + esc(e.message) + '</p>'; });
    };
    o.querySelector('[data-a=tim]').onclick = tim;
    inp.onkeydown = function (e) { if (e.key === 'Enter') tim(); };
    o.querySelector('[data-a=x]').onclick = dongOv;
    if (sdtSan) { inp.value = sdtSan; tim(); } else setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }
  function quetSau(sdt) { clearTimeout(qTimer); qTimer = setTimeout(function () { quet(sdt); }, 600); }

  // ── bốc thăm sau thanh toán ──
  function sauBoc(sdt, kq) {
    if (!kq || !kq.soLuot) { if (kq && kq.loi === 'chua-co-kho') console.warn('[gấu] quán ' + store() + ' chưa nhập kho — tab Quản lý pos'); return; }
    var ids = (kq.luot || []).map(function (x) { return x.id; });
    if (APP === 'tc33') popupQR(sdt, kq.soLuot, ids);
    else if (APP === 'gieo') { /* Gieo: popup «Khách quay ở đâu?» trước khi in bill lo phần báo */ }
    else if (APP === 'xofa') {   // [16/10] hỏi nơi quay: tại quán → vòng quay POS + màn hình phụ; ở nhà → QR trên màn hình phụ
      popupNoiQuay(kq.soLuot, 'vòng quay trên POS + màn hình phụ', 'QR hiện trên màn hình phụ', function (taiQuan) {
        if (taiQuan) moTaiQuay(sdt, ids);
        else phat('qr', { sdt: sdt, soLuot: kq.soLuot });
      });
    }
    else { toast('🧸 Khách có ' + kq.soLuot + ' lượt quay gấu Noel — quét QR để quay'); phat('qr', { sdt: sdt, soLuot: kq.soLuot }); }
  }
  function chayBoc(don) {
    if (!G.dangMua() || !don.store) return;
    var sdt = G.normPhone(don.sdt);
    if (sdt.length < 10) return;
    if (G.soLuot(don.ly) === 0 && !don.bed160) return;
    return G.boc(don).then(function (kq) { sauBoc(sdt, kq); return kq; })
      .catch(function (e) { console.warn('[gấu] bốc thăm lỗi', e); toast('⚠️ Chưa bốc được lượt gấu Noel (' + e.message + ')'); return null; });
  }
  function demLy(items, laNuoc) {
    var ly = 0, tien = 0;
    (items || []).forEach(function (c) {
      if (!c || !laNuoc(c)) return;
      var q = Number(c.qty) || 0, p = Number(c.price) || 0;
      if (p <= 0 || q <= 0) return;
      ly += q; tien += p * q;
    });
    return { ly: ly, tien: tien };
  }

  // ── The cafe 33 ──
  if (APP === 'tc33') {
    var cho = null;
    function laAnVat(c) {
      var m = null; try { m = (menu || []).find(function (x) { return String(x.name || '').toLowerCase() === String(c.name || '').toLowerCase(); }); } catch (e) {}
      var t = m ? String(m.type || '').toLowerCase() : '';
      return t.indexOf('ăn vặt') >= 0 || t.indexOf('đồ ăn') >= 0 || t.indexOf('snack') >= 0;
    }
    function laKhac(c) {
      var m = null; try { m = (menu || []).find(function (x) { return String(x.name || '').toLowerCase() === String(c.name || '').toLowerCase(); }); } catch (e) {}
      var t = m ? String(m.type || '').toLowerCase() : '';
      return t.indexOf('khác') >= 0 || t === 'khac' || (typeof _isKhacLine === 'function' && _isKhacLine(c.name, c.size));
    }
    // [16/10 chủ dự án] «Bed trên 160K = trúng chắc» chỉ xét BILL LÚC VÀO ACTIVE BED (finalizeBedCheckIn → _pushPaidOrder có hàm done);
    // bill gọi thêm giữa giờ / bill trả bed → chỉ tính lượt theo số ly như đơn thường.
    G.donTc33 = function (orderData, finalSdt, booking, vaoBed) {   // tách riêng để test
      var items = (orderData && orderData.itemsArray) || [];
      var n = demLy(items, function (c) { return !laAnVat(c) && !laKhac(c); });
      var bedTien = 0; items.forEach(function (c) { if (c && !laAnVat(c)) bedTien += (Number(c.price) || 0) * (Number(c.qty) || 0); });
      return { store: 'tc33', sdt: finalSdt, bill: String(orderData && orderData.id || ''), ly: n.ly, tienNuoc: n.tien, bed160: !!(vaoBed && booking) && bedTien > G.CFG.bedToiThieu };
    };
    boc('_pushPaidOrder', function (cu) { return function (orderData, finalSdt, currentBooking, isCheckout, done) { cho = { o: orderData, s: finalSdt, b: currentBooking, vao: typeof done === 'function' && !isCheckout }; return cu.apply(this, arguments); }; });
    // clearDebtAfterPayment chỉ được gọi ở nhánh LƯU THÀNH CÔNG của _pushPaidOrder
    boc('clearDebtAfterPayment', function (cu) {
      return function () {
        var c = cho; cho = null;
        try { return cu.apply(this, arguments); }
        finally { if (c && c.o) an(function () { anPanel(); chayBoc(G.donTc33(c.o, c.s, c.b, c.vao)); })(); }
      };
    });
    boc('checkSdtLive', function (cu) { return function () { var r = cu.apply(this, arguments); an(function () { var el = $('kh-sdt'); quetSau(el ? el.value : ''); })(); return r; }; });
    boc('resetPhoneInput', function (cu) { return function () { anPanel(); return cu.apply(this, arguments); }; });
    ganTabQuanLy();
  }

  // ── XOFA ──
  if (APP === 'xofa') {
    // màn hình phụ (kiosk.html nghe gau_noel_2026_kiosk/xofa): chỉ ghi khi có sự kiện; SĐT chỉ gửi 3 số cuối
    var KREF = null; try { KREF = db0 && db0.ref(G.KIOSK_ROOT + '/xofa'); } catch (e) {}
    var batDaGhi = null;
    G.onManHinh = function (loai, d) {
      if (!KREF) return;
      d = d || {}; var p = G.normPhone(d.sdt);
      batDaGhi = G.dangBat();
      KREF.update({ bat: batDaGhi, ev: { loai: loai, sdt: p ? p.slice(-3) : '', soLuot: Number(d.soLuot) || 0, win: !!d.win, code: d.code || '',
        store: d.store || '', conLai: Number(d.conLai) || 0, daNhan: !!d.daNhan, at: Date.now() } }).catch(function (e) { console.warn('[gấu] màn hình phụ', e); });
    };
    G.ngheCfg(function () {
      var b = G.dangBat(); if (!KREF || b === batDaGhi) return;
      batDaGhi = b; KREF.child('bat').set(b).catch(function () { batDaGhi = null; });
    });
    boc('_loyaltyAfterSave', function (cu) {
      return function (items, total, orderId) {
        var sdt = ($('cuph') || {}).value || '', quaApp = false;
        try { quaApp = !!isAppSale; } catch (e) {}   // [16/10] bán qua app không tích điểm → không lượt gấu
        try { return cu.apply(this, arguments); }
        finally {   // đơn đã lưu trước khi hàm này chạy → bốc kể cả khi phần tích điểm lỗi
          if (!quaApp) an(function () {
            var n = demLy(items, function (c) { return typeof isPaidCupLine === 'function' ? isPaidCupLine(c) : (!c.isFood && !c.isFree && !c._discountId); });
            chayBoc({ store: 'xofa', sdt: sdt, bill: String(orderId || ''), ly: n.ly, tienNuoc: n.tien });
          })();
        }
      };
    });
  }

  // ── Gieo Gieo ──
  if (APP === 'gieo') {
    var laNuocGieo = function (c) { return !c.isFood && !c.isFree && !c._discountId && !c._vKey; };
    var bocCua = typeof WeakMap === 'function' ? new WeakMap() : null;   // đơn → lời hứa bốc thăm (popup «Quay tại quán» chờ kết quả)
    var noiQuay = typeof WeakMap === 'function' ? new WeakMap() : null;  // đơn → 'quan' | 'nha' (không ghi thêm trường vào đơn)
    boc('assistFinalizeOrder', function (cu) {
      return function (order, orderId) {
        try { return cu.apply(this, arguments); }
        finally {   // gọi ngay sau khi đơn đã lưu → bốc kể cả khi phần thống kê gợi ý lỗi
          if (!(order && order.isAppSale)) an(function () {   // [16/10] bán qua app không tích điểm → không lượt gấu
            var n = demLy(order && order.itemsArray, laNuocGieo);
            var pr = chayBoc({ store: store(), sdt: order && order.phone, bill: String(orderId || ''), ly: n.ly, tienNuoc: n.tien });
            if (pr && bocCua && order && typeof order === 'object') bocCua.set(order, pr);
          })();
        }
      };
    });
    // [16/10 chủ dự án] Thanh toán xong, đơn có lượt → hỏi «Khách quay ở đâu?» TRƯỚC khi in bill:
    //   Quay tại quán → bill KHÔNG in QR (tiết kiệm giấy), mở vòng quay ngay trên POS (giỏ trống thì không vào được ô SĐT nữa);
    //   Quét mã ở nhà → bill in QR như cũ. Không chọn trong 15 giây → coi như quét mã ở nhà (bill không bị treo).
    // Chờ bốc thăm xong (thường < 1 giây) rồi mới hỏi: không có lượt thật (quán chưa nhập kho, lỗi mạng…) → in bill KHÔNG QR, không hỏi.
    function hoiNoiQuay(order, xong) {
      var sdt = G.normPhone(order.phone), xongRoi = false;
      var inBill = function (cach) { if (xongRoi) return; xongRoi = true; if (noiQuay) noiQuay.set(order, cach); try { xong(); } catch (e) { console.warn('[gấu] in bill', e); } };
      var cho = setTimeout(function () { inBill('nha'); }, 8000);   // bốc thăm treo quá 8 giây → in bill như cũ (có QR)
      Promise.resolve(bocCua && bocCua.get(order)).then(function (kq) {
        clearTimeout(cho);
        if (xongRoi) return;
        if (!kq || !kq.soLuot) { inBill('khong'); if (kq && kq.loi === 'chua-co-kho') toast('⚠️ Quán chưa nhập kho gấu Noel — đơn này chưa có lượt quay'); return; }
        var ids = (kq.luot || []).map(function (x) { return x.id; });
        popupNoiQuay(kq.soLuot, 'vòng quay hiện trên POS · bill không in QR', 'bill in kèm mã QR', function (taiQuan) {
          inBill(taiQuan ? 'quan' : 'nha');
          if (taiQuan) moTaiQuay(sdt, ids);
        });
      });
    }
    var gauDuDieuKien = function (order) {
      try { return !!order && !order.isAppSale && G.dangMua() && G.normPhone(order.phone).length >= 10 && G.soLuot(demLy(order.itemsArray, laNuocGieo).ly) > 0; } catch (e) { return false; }
    };
    try {
      var PP = POSPrinter, inCu = PP && PP.autoPrintIfEnabled;
      if (typeof inCu === 'function') PP.autoPrintIfEnabled = function (order) {
        var self = this, args = arguments;
        if (!gauDuDieuKien(order) || !noiQuay || noiQuay.has(order)) return inCu.apply(self, args);
        noiQuay.set(order, 'cho');
        hoiNoiQuay(order, function () { inCu.apply(self, args); });
      };
      else console.warn('[gấu] posgieo không có POSPrinter.autoPrintIfEnabled — bỏ qua hỏi nơi quay');
    } catch (e) { console.warn('[gấu] không thấy POSPrinter', e); }
    // QR cuối bill in: dòng đánh dấu {type:'gauNoel'} → renderReceiptCanvas vẽ khối QR (renderer gốc không có loại 'qr')
    boc('buildReceiptContent', function (cu) {
      return function (order) {
        var r = cu.apply(this, arguments);
        try {
          var L = G.soLuot(demLy(order && order.itemsArray, laNuocGieo).ly);
          if (Array.isArray(r) && L > 0 && !order.isAppSale && !(noiQuay && (noiQuay.get(order) === 'quan' || noiQuay.get(order) === 'khong')) && G.dangMua() && G.normPhone(order.phone).length >= 10) r = r.concat([{ type: 'gauNoel', soLuot: L }]);
        } catch (e) { console.warn('[gấu] bill', e); }
        return r;
      };
    });
    boc('renderReceiptCanvas', function (cu) {
      return function (content, widthPx) {
        var g = null, rest = content;
        if (Array.isArray(content)) { rest = content.filter(function (c) { if (c && c.type === 'gauNoel') { g = c; return false; } return true; }); }
        var base = cu.apply(this, [rest].concat(Array.prototype.slice.call(arguments, 1)));
        if (!g) return base;
        try {
          var w = base.width, box = Math.min(200, Math.round(w * 0.5)), cell = Math.max(2, Math.floor(box / QR_N)), side = cell * QR_N;
          var c = document.createElement('canvas'); c.width = w; c.height = base.height + side + 110;
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(base, 0, 0);
          var y = base.height + 4; x.fillStyle = '#000';
          for (var i = 8; i < w - 8; i += 7) x.fillRect(i, y, 4, 2);
          x.textAlign = 'center'; x.font = "700 20px 'Google Sans', Arial, sans-serif"; x.fillText('QUAY TRÚNG GẤU NOEL', w / 2, y + 30);
          x.font = "400 16px 'Google Sans', Arial, sans-serif"; x.fillText('Bạn có ' + g.soLuot + ' lượt quay · quét mã bên dưới', w / 2, y + 54);
          var p = new Path2D(QR_PATH), ox = Math.round((w - side) / 2), oy = y + 66;
          x.save(); x.translate(ox, oy); x.scale(cell, cell); x.fill(p); x.restore();
          x.font = "400 13px 'Google Sans', Arial, sans-serif"; x.fillText('the-cafe-33.web.app', w / 2, oy + side + 20);
          return c;
        } catch (e) { console.warn('[gấu] vẽ QR bill', e); return base; }
      };
    });
  }

  // ── XOFA + Gieo: khung khách, huỷ bill ──
  if (APP === 'xofa' || APP === 'gieo') {
    boc('renderCustomerInfo', function (cu) { return function () { var r = cu.apply(this, arguments); an(function () { quet(($('cuph') || {}).value || ''); })(); return r; }; });
    boc('clearCustomer', function (cu) { return function () { anPanel(); return cu.apply(this, arguments); }; });
    boc('delOrderConfirm', function (cu) {
      return function () {
        var pin = (($('del-pin-input') || {}).value || '').trim(), id = null, o = null;
        try { id = curOid; o = (orders || []).find(function (x) { return x.id === id; }); } catch (e) {}
        var r = cu.apply(this, arguments);
        if (pin === '3367' && o && o.phone && (G.dangMua() || G.dangNhan())) {
          // chờ app xoá xong (đơn rời khỏi danh sách orders) rồi mới trả lượt / kho
          var lan = 0, q = store();
          var doi = function () {
            var con = true; try { con = (orders || []).some(function (x) { return x.id === id; }); } catch (e) {}
            if (!con) { G.huyBill(q, o.phone, id).then(function (h) { if (h.daNhan) toast('⚠️ Bill đã xoá có gấu Noel khách ĐÃ nhận — đã báo Quản lý'); }).catch(function (e) { console.warn('[gấu] huỷ bill', e); }); return; }
            if (++lan < 30) setTimeout(doi, 1000);
          };
          setTimeout(doi, 800);
        }
        return r;
      };
    });
  }

  // ── nút «🧸 Đổi gấu» góc trái trên sidebar (PosX / posgieo — giỏ trống vẫn đổi được, khách chỉ ghé nhận gấu) ──
  var nutSdb = null;
  if ((APP === 'xofa' || APP === 'gieo') && $('sdb')) {
    nutSdb = document.createElement('button'); nutSdb.id = 'gn-sdb-btn'; nutSdb.type = 'button';
    nutSdb.innerHTML = '🧸 Đổi gấu';
    nutSdb.onclick = function () { try { if (typeof closeSdb === 'function') closeSdb(); } catch (e) {} moDoiGau(); };
    $('sdb').appendChild(nutSdb);
  }
  G.moDoiGau = moDoiGau;

  // ── nghe công tắc: tắt → ẩn mọi thứ ──
  G.ngheCfg(function () { if (nutSdb) nutSdb.classList.toggle('on', G.dangNhan()); if (!G.dangNhan()) { anPanel(); dongOv(); } });

  // ── pos.html → Quản lý → «Gấu Noel» ──
  function ganTabQuanLy() {
    function mkBtn(src, id) {
      if (!src) return null;
      var b = src.cloneNode(false); b.id = id; b.removeAttribute('onclick'); b.onclick = function () { window.switchMgrTab('gaunoel'); };
      b.textContent = '🧸 Gấu Noel'; b.style.background = 'transparent'; b.style.color = '#6b7280'; b.style.boxShadow = 'none';
      src.parentNode.insertBefore(b, src.nextSibling); return b;
    }
    var tabBtn = mkBtn($('mgr-tab-label'), 'mgr-tab-gaunoel'), tabMob = mkBtn($('mgr-mob-tab-label'), 'mgr-mob-tab-gaunoel');
    var colC = $('mgr-col-c'); if (!colC) return;
    var pane = document.createElement('div'); pane.id = 'mgr-c-gaunoel';
    pane.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:auto;min-height:0;padding:20px;gap:14px;';
    colC.appendChild(pane);
    var CHANG = [['open', 'Mở màn'], ['week', 'Mỗi tuần'], ['p15', '15–22/12'], ['pre', 'Trước 23 (trần)'], ['n0', '23/12'], ['n1', '24/12'], ['n2', '25/12']];
    var inp = 'width:64px;padding:6px 8px;border-radius:10px;border:1.5px solid #e5e7eb;font-weight:700;text-align:right;';
    function veKho(id, k) {
      var cap = k.cap || {}, rows = G.KHO_NGAU.map(function (b) {
        var c = cap[b] || {};
        return '<tr><td style="padding:4px 8px;white-space:nowrap;">' + esc(G.TEN_KHO[b]) + '</td>' + CHANG.map(function (x) {
          var v = x[0].charAt(0) === 'n' && x[0].length === 2 ? (c.n || [])[+x[0].charAt(1)] : c[x[0]];
          return '<td style="padding:3px;"><input type="number" min="0" data-b="' + b + '" data-c="' + x[0] + '" value="' + (Number(v) || 0) + '" style="' + inp + '"></td>';
        }).join('') + '</tr>';
      }).join('');
      var phat = Number(k.phat) || 0, doi = Number(k.doi) || 0;
      return '<div data-quan="' + esc(id) + '" style="padding:14px;border-radius:16px;border:1.5px solid #e5e7eb;background:#fff;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><b style="font-size:15px;">' + esc(G.tenQuan(id)) + '</b>' +
        '<span style="font-size:12px;color:#6b7280;">đã trúng ' + phat + ' · đã nhận ' + doi + ' · chờ nhận ' + Math.max(0, phat - doi) + (k.canhBao ? ' · <b style="color:#b91c1c;">⚠️ ' + k.canhBao + ' bill đã xoá có gấu đã nhận</b>' : '') + '</span></div>' +
        '<div style="overflow-x:auto;margin-top:8px;"><table style="border-collapse:collapse;font-size:12.5px;"><tr style="color:#6b7280;"><th style="text-align:left;padding:4px 8px;">Kho ngẫu nhiên</th>' +
        CHANG.map(function (x) { return '<th style="padding:4px;font-weight:700;">' + x[1] + '</th>'; }).join('') + '</tr>' + rows + '</table></div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;font-size:13px;">Số gấu thật của quán (trần cứng, gồm cả lượt chắc trúng): ' +
        '<input type="number" min="0" data-tong="1" value="' + (Number(k.tong) || 0) + '" style="' + inp + 'width:80px;">' +
        '<button class="gn-btn gn-g" data-luu="1">Lưu kho</button><span data-msg="1" style="color:#6b7280;"></span></div></div>';
    }
    // ── DASHBOARD (phong cách thẻ điểm bán của manage) ──
    var dashCss = false, dashCache = null, dashLuc = 0, locSdt = '', xemHet = false;
    var MAU = { tc33: '#006241', xofa: '#e2541c', gg01: '#c2185b' }, CHU = { tc33: '33', xofa: 'X', gg01: 'G' };
    function mau(q) { return MAU[q] || (/^gg/.test(q) ? '#c2185b' : '#475569'); }
    function chuQ(q) { return CHU[q] || (/^gg/.test(q) ? 'G' : String(q).slice(0, 2).toUpperCase()); }
    function napCss() {
      if (dashCss) return; dashCss = true;
      var c = document.createElement('style');
      c.textContent =
        '#gn-dash{--panel:#fff;--ink:#14251f;--sub:#6b7280;display:flex;flex-direction:column;gap:14px;margin-top:4px}' +
        '#gn-dash .gd-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#gn-dash .gd-head b{font-size:17px;font-weight:900;color:#14251f}#gn-dash .gd-head small{font-size:12px;color:#6b7280}' +
        '#gn-dash .gd-hero{--c:#991b1b;border-radius:30px;padding:22px 24px;border:1px solid color-mix(in srgb,var(--c) 14%,#fff);background:radial-gradient(ellipse at 10% 0%,color-mix(in srgb,var(--c) 18%,#fff),transparent 80%),color-mix(in srgb,var(--c) 5%,#fff);display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:24px;align-items:center}' +
        '#gn-dash .gd-eb{font-size:14px;font-weight:800;color:#6b7280}#gn-dash .gd-big{font-size:54px;font-weight:850;letter-spacing:-2px;line-height:1.1;color:var(--c)}#gn-dash .gd-big span{font-size:18px;letter-spacing:0;margin-left:6px;font-weight:750}' +
        '#gn-dash .gd-sub{font-size:13px;color:#4b5563;margin-top:6px;line-height:1.6}#gn-dash .gd-sub b{color:#14251f}' +
        '#gn-dash .gd-row{display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:6px}#gn-dash .gd-row strong{font-size:22px;color:var(--c);font-weight:850}' +
        '#gn-dash .gd-track{height:9px;border-radius:99px;background:color-mix(in srgb,var(--c) 14%,#fff);overflow:hidden}#gn-dash .gd-track>i{display:block;height:100%;border-radius:99px;background:var(--c)}' +
        '#gn-dash .gd-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}#gn-dash .gd-mini span{display:block;font-size:11px;color:#6b7280}#gn-dash .gd-mini b{font-size:16px;font-weight:850;color:#14251f}' +
        '#gn-dash .gd-ws{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}' +
        '#gn-dash .gd-w{--c:#475569;container-type:inline-size;display:flex;flex-direction:column;padding:20px;border-radius:32px;border:1px solid color-mix(in srgb,var(--c) 14%,#fff);background:radial-gradient(ellipse at 12% 0%,color-mix(in srgb,var(--c) 24%,#fff),transparent 86%),color-mix(in srgb,var(--c) 8%,#fff);box-shadow:inset 0 1px 0 #ffffff80,0 5px 18px color-mix(in srgb,var(--c) 7%,transparent)}' +
        '#gn-dash .gd-wh{display:flex;gap:10px;align-items:center}#gn-dash .gd-mk{display:grid;place-items:center;width:40px;height:40px;border-radius:15px;background:var(--c);color:#fff;font-size:17px;font-weight:850}' +
        '#gn-dash .gd-wh h3{margin:0;font-size:16px;font-weight:800;color:#14251f}#gn-dash .gd-wh p{margin:2px 0 0;font-size:12px;color:#6b7280}' +
        '#gn-dash .gd-wm{margin:14px 0 10px}#gn-dash .gd-wm span{font-size:13px;font-weight:650;color:#6b7280}#gn-dash .gd-wm b{display:block;font-size:40px;font-weight:850;letter-spacing:-1.5px;line-height:1.15;color:var(--c)}#gn-dash .gd-wm b small{font-size:15px;letter-spacing:0;margin-left:4px}' +
        '#gn-dash .gd-met{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border-top:1px solid color-mix(in srgb,var(--c) 16%,transparent);padding-top:10px;margin-top:10px}#gn-dash .gd-met span{display:block;font-size:11px;color:#6b7280}#gn-dash .gd-met b{font-size:14px;font-weight:800;color:#14251f}' +
        '#gn-dash .gd-warn{margin-top:8px;font-size:11.5px;font-weight:800;color:#b91c1c}' +
        '#gn-dash .gd-card{border-radius:24px;border:1px solid #e5e7eb;background:#fff;padding:16px 18px}#gn-dash .gd-card h4{margin:0 0 10px;font-size:15px;font-weight:900;color:#14251f}' +
        '#gn-dash table{border-collapse:collapse;width:100%;font-size:12.5px}#gn-dash th{text-align:right;font-weight:700;color:#6b7280;padding:6px 8px;white-space:nowrap}#gn-dash th:first-child,#gn-dash td:first-child{text-align:left}' +
        '#gn-dash td{padding:7px 8px;border-top:1px solid #f1f5f9;text-align:right;white-space:nowrap}#gn-dash .gd-cell{display:inline-flex;align-items:center;gap:6px}' +
        '#gn-dash .gd-bar{display:inline-block;width:52px;height:6px;border-radius:99px;background:#eef2f7;overflow:hidden;vertical-align:middle}#gn-dash .gd-bar>i{display:block;height:100%;background:var(--c,#16a34a)}#gn-dash .gd-bar.het>i{background:#dc2626}' +
        '#gn-dash .gd-q{display:inline-block;padding:2px 7px;border-radius:99px;font-size:11px;font-weight:800;color:#fff;margin-left:3px}' +
        '#gn-dash tr.nghi td{background:#fef2f2}#gn-dash .gd-flag{display:inline-block;padding:2px 8px;border-radius:99px;background:#dc2626;color:#fff;font-size:10.5px;font-weight:800;margin-left:6px}' +
        '#gn-dash .gd-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}#gn-dash .gd-tools input{padding:7px 10px;border-radius:12px;border:1.5px solid #e5e7eb;font-weight:700;width:170px}' +
        '@media(max-width:760px){#gn-dash .gd-hero{grid-template-columns:1fr}#gn-dash .gd-big{font-size:44px}}';
      document.head.appendChild(c);
    }
    function o2(a) { var x = a[0], y = a[1], pc = y ? Math.min(100, Math.round(x * 100 / y)) : 0;
      return '<span class="gd-cell">' + x + '/' + y + '<span class="gd-bar' + (y && x >= y ? ' het' : '') + '"><i style="width:' + pc + '%"></i></span></span>'; }
    function veDash(box, ep) {
      if (!box) return; napCss();
      if (!ep && dashCache && Date.now() - dashLuc < 120000) { veDashData(box, dashCache); return; }
      box.innerHTML = '<div class="gd-head"><b>📊 Dashboard Gấu Noel</b><small>Đang tải…</small></div>';
      G.dashboard().then(function (D) { dashCache = D; dashLuc = Date.now(); veDashData(box, D); })
        .catch(function (e) { box.innerHTML = '<div class="gd-head"><b>📊 Dashboard Gấu Noel</b><small style="color:#b91c1c">Lỗi: ' + esc(e.message) + '</small></div>'; });
    }
    function veDashData(box, D) {
      var he = D.he, ids = ['tc33', 'xofa', 'gg01']; Object.keys(D.quan).forEach(function (q) { if (ids.indexOf(q) < 0) ids.push(q); });
      var pcPhat = he.tong ? Math.min(100, Math.round(he.phat * 100 / he.tong)) : 0;
      var h = '<div class="gd-head"><b>📊 Dashboard Gấu Noel</b><small>' + D.hom.split('-').reverse().join('/') + ' · cập nhật ' + new Date(dashLuc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
        '</small><button class="gn-btn gn-x" data-dash="lai">↻ Làm mới</button></div>';
      // hệ thống
      h += '<div class="gd-hero"><div><div class="gd-eb">🧸 Hôm nay đã tặng (trúng)</div><div class="gd-big">' + he.trungHom + '<span>gấu</span></div>' +
        '<div class="gd-sub">Đã nhận hôm nay <b>' + he.nhanHom + '</b> · lượt quay hôm nay <b>' + he.luotHom + '</b>' + (D.nghi ? ' · <b style="color:#b91c1c">' + D.nghi + ' SĐT cần xem lại</b>' : '') + '</div></div>' +
        '<div><div class="gd-row"><span>Cả đợt đã phát</span><strong>' + he.phat + ' / ' + he.tong + '</strong></div><div class="gd-track"><i style="width:' + pcPhat + '%"></i></div>' +
        '<div class="gd-mini"><div><span>Còn trong kho</span><b>' + he.con + '</b></div><div><span>Đã nhận</span><b>' + he.nhan + '</b></div><div><span>Chờ nhận</span><b>' + he.cho + '</b></div></div></div></div>';
      // từng quán
      h += '<div class="gd-ws">' + ids.map(function (q) {
        var x = D.quan[q] || { trungHom: 0, nhanHom: 0, trung: 0, nhan: 0, cho: 0, tong: 0, phat: 0, con: 0, canhBao: 0 }, pc = x.tong ? Math.min(100, Math.round(x.phat * 100 / x.tong)) : 0;
        return '<div class="gd-w" style="--c:' + mau(q) + '"><div class="gd-wh"><div class="gd-mk">' + esc(chuQ(q)) + '</div><div><h3>' + esc(G.tenQuan(q)) + '</h3><p>' + (x.tong ? 'Kho ' + x.tong + ' con' : 'Chưa nhập kho') + '</p></div></div>' +
          '<div class="gd-wm"><span>Hôm nay tặng</span><b>' + x.trungHom + '<small>gấu</small></b></div>' +
          '<div class="gd-row"><span>Đã phát cả đợt</span><strong style="font-size:15px">' + x.phat + ' / ' + x.tong + '</strong></div><div class="gd-track"><i style="width:' + pc + '%"></i></div>' +
          '<div class="gd-met"><div><span>Nhận hôm nay</span><b>' + x.nhanHom + '</b></div><div><span>Chờ nhận</span><b>' + x.cho + '</b></div><div><span>Còn kho</span><b>' + x.con + '</b></div></div>' +
          (x.canhBao ? '<div class="gd-warn">⚠️ ' + x.canhBao + ' bill đã xoá có gấu đã nhận</div>' : '') + '</div>';
      }).join('') + '</div>';
      // kho từng kịch bản
      h += '<div class="gd-card"><h4>Kho từng kịch bản (đã phát / trần)</h4><div style="overflow-x:auto">' + ids.filter(function (q) { return D.quan[q] && D.quan[q].kho; }).map(function (q) {
        var kb = G.khoKichBan(D.quan[q].kho, D.hom), tenCh = kb.type === 'open' ? 'Tuần mở màn' : kb.type === 'week' ? 'Tuần này (' + kb.w + ')' : kb.type === 'pre' ? '15–22/12' : kb.type === 'noel' ? '23–25/12' : 'Ngoài đợt';
        return '<div style="--c:' + mau(q) + ';margin-bottom:12px"><div style="font-weight:800;margin:4px 0 6px;color:' + mau(q) + '">' + esc(G.tenQuan(q)) + '</div>' +
          '<table><tr><th>Kịch bản</th><th>' + tenCh + '</th><th>Trước 23/12</th><th>23/12</th><th>24/12</th><th>25/12</th></tr>' +
          G.KHO_NGAU.map(function (k) { var r = kb.ngau[k]; return '<tr><td>' + esc(G.TEN_KHO[k]) + '</td><td>' + (r.chang ? o2(r.chang) : '–') + '</td><td>' + o2(r.truoc23) + '</td><td>' + o2(r.noel[0]) + '</td><td>' + o2(r.noel[1]) + '</td><td>' + o2(r.noel[2]) + '</td></tr>'; }).join('') +
          G.KHO_CHAC.filter(function (k) { return k !== 'bed' || q === 'tc33'; }).map(function (k) { return '<tr><td>' + esc(G.TEN_KHO[k]) + ' <small style="color:#6b7280">(chắc trúng)</small></td><td colspan="5" style="text-align:left">đã trao <b>' + kb.chac[k] + '</b> con</td></tr>'; }).join('') +
          '<tr><td>Phần trước 23/12 chưa phát</td><td colspan="5" style="text-align:left">còn <b>' + kb.conTruoc23 + '</b> con · đã dùng cho 23–25/12 <b>' + kb.carry + '</b></td></tr></table></div>';
      }).join('') + '</div></div>';
      // khách
      var loc = G.normPhone(locSdt), ds = D.khach.filter(function (k) { return !loc || k.sdt.indexOf(loc) >= 0; }), hien = xemHet ? ds : ds.slice(0, 30);
      h += '<div class="gd-card"><h4>Khách đã trúng / nhận gấu</h4><div class="gd-tools"><input id="gd-loc" placeholder="Tìm SĐT…" value="' + esc(locSdt) + '">' +
        '<small style="color:#6b7280">' + ds.length + ' SĐT · nghi ngờ khi: nhận từ ' + G.NGHI.nhan + ' con, ' + G.NGHI.ngay + ' con trong 1 ngày, hoặc trúng ≥ ' + Math.round(G.NGHI.tiLe * 100) + '% (từ ' + G.NGHI.tiLeLuot + ' lượt)</small></div>' +
        '<div style="overflow-x:auto"><table><tr><th>SĐT</th><th>Lượt</th><th>Trúng</th><th>Đã nhận</th><th>Chờ nhận</th><th style="text-align:left">Quán</th><th>Nhận gần nhất</th></tr>' +
        (hien.length ? hien.map(function (k) {
          return '<tr class="' + (k.nghi.length ? 'nghi' : '') + '"><td><b>' + esc(k.sdt) + '</b>' + (k.nghi.length ? '<span class="gd-flag" title="' + esc(k.nghi.join(' · ')) + '">Nghi ngờ</span><div style="font-size:11px;color:#b91c1c;margin-top:2px">' + esc(k.nghi.join(' · ')) + '</div>' : '') + '</td>' +
            '<td>' + k.luot + '</td><td>' + k.trung + '</td><td><b>' + k.nhan + '</b></td><td>' + k.cho + '</td><td style="text-align:left">' +
            Object.keys(k.quan).map(function (q) { return '<span class="gd-q" style="background:' + mau(q) + '">' + esc(chuQ(q)) + ' ×' + k.quan[q] + '</span>'; }).join('') + '</td>' +
            '<td>' + (k.lanCuoi ? esc(new Date(k.lanCuoi).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : '–') + '</td></tr>';
        }).join('') : '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:16px">Chưa có khách</td></tr>') + '</table></div>' +
        (!xemHet && ds.length > 30 ? '<button class="gn-btn gn-x" data-dash="het" style="margin-top:10px">Xem tất cả ' + ds.length + ' SĐT</button>' : '') + '</div>';
      box.innerHTML = h;
      var bl = box.querySelector('[data-dash=lai]'); if (bl) bl.onclick = function () { veDash(box, true); };
      var bh = box.querySelector('[data-dash=het]'); if (bh) bh.onclick = function () { xemHet = true; veDashData(box, D); };
      var il = box.querySelector('#gd-loc'); if (il) il.oninput = function () { locSdt = il.value; var pos = il.selectionStart; veDashData(box, D); var n = box.querySelector('#gd-loc'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } };
    }
    function ve(docMoi) {   // docMoi: vừa mở tab → đọc dashboard mới (không dùng bản đệm)
      var bat = G.dangBat(), C = G.CFG;
      pane.innerHTML = '<div style="font-size:20px;font-weight:900;color:#991b1b;">🧸 Quay trúng gấu Noel 2026</div>' +
        '<div style="padding:16px;border-radius:16px;background:' + (bat ? '#f0fdf4' : '#f9fafb') + ';border:1.5px solid ' + (bat ? '#86efac' : '#e5e7eb') + ';display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:220px;"><div style="font-weight:900;font-size:16px;color:' + (bat ? '#166534' : '#374151') + ';">Chương trình đang ' + (bat ? 'BẬT' : 'TẮT') + '</div>' +
        '<div style="font-size:12.5px;color:#6b7280;line-height:1.6;margin-top:4px;">Bật thì cả 3 quán (The cafe 33, XOFA, Gieo Gieo) bốc lượt cho đơn có SĐT từ ngày bắt đầu tới hết 25/12; mở lượt + đổi quà tới hết ' +
        C.hanNhan.split('-').reverse().slice(0, 2).join('/') + '. Tắt thì 3 quán ngừng ngay (không cần deploy).</div>' +
        '<div style="margin-top:8px;font-size:13px;">Ngày bắt đầu: <input type="date" id="gn-bd" value="' + esc(C.batDau) + '" max="' + C.noel[0] + '" style="padding:6px 8px;border-radius:10px;border:1.5px solid #e5e7eb;font-weight:700;"> ' +
        '<button class="gn-btn gn-x" id="gn-bd-luu">Lưu ngày</button></div></div>' +
        '<button class="gn-btn ' + (bat ? '' : 'gn-g') + '" id="gn-bat" style="padding:12px 22px;font-size:14px;">' + (bat ? 'TẮT chương trình' : 'BẬT chương trình') + '</button></div>' +
        '<div id="gn-dash"></div>' +
        '<div style="font-weight:900;font-size:15px;margin-top:10px;">Cấu hình kho gấu từng quán</div>' +
        '<div style="font-size:12.5px;color:#6b7280;line-height:1.6;">Số con tối đa mỗi loại lượt được trúng theo từng chặng (lấy từ trang mô phỏng). Hết kho chặng nào thì loại lượt đó ngừng trúng tới chặng sau. ' +
        'Lượt chắc trúng (chuỗi trượt đủ lãi, đơn nhiều ly, bed trên 160K) luôn trao tới khi hết «số gấu thật». Quán chưa lưu kho = không bốc.</div>' +
        '<div id="gn-kho" style="display:flex;flex-direction:column;gap:12px;">Đang tải…</div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:6px;"><button class="gn-btn gn-x" id="gn-tk-btn">Tải thống kê</button><span id="gn-tk" style="font-size:13px;color:#374151;"></span></div>' +
        '<div style="margin-top:10px;padding:16px;border-radius:16px;border:1.5px dashed #fca5a5;background:#fff5f5;">' +
        '<div style="font-weight:900;color:#b91c1c;">Xoá toàn bộ dữ liệu Gấu Noel (khi hết đợt)</div>' +
        '<div style="font-size:12.5px;color:#7f1d1d;margin:6px 0 12px;line-height:1.6;">Xoá hết lượt, mã nhận, kho và công tắc trên Firebase. Không đụng hồ sơ khách, đơn hàng, điểm, tem. Không hoàn tác được. ' +
        'Sau khi xoá: gỡ thẻ script gau_noel_giangsinh ở pos.html, PosX.html, posgieo.html (hướng dẫn đầu file gau_noel_giangsinh.v1.js).</div>' +
        '<button class="gn-btn" id="gn-xoa">Xoá dữ liệu Gấu Noel…</button><div id="gn-xoa-msg" style="font-size:12.5px;margin-top:10px;color:#7f1d1d;"></div></div>';
      pane.querySelector('#gn-bat').onclick = function () {
        var on = !G.dangBat();
        var conHan = !G.hetDot() && G.vnDay() >= G.CFG.batDau;
        hoi(on ? 'BẬT quay trúng gấu Noel cho cả 3 quán?' : 'TẮT quay trúng gấu Noel? Cả 3 quán ngừng bốc lượt, khách KHÔNG mở lượt / đổi quà được nữa.' +
          (conHan ? '\n\nLưu ý: sau 25/12 chương trình tự ngừng bốc lượt; khách vẫn cần quay + nhận gấu tới hết ' + G.CFG.hanNhan.split('-').reverse().slice(0, 2).join('/') + ' — chỉ TẮT khi muốn dừng hẳn.' : '')).then(function (ok) {
          if (!ok) return;
          G.datCfg({ bat: on, by: 'pos' }).then(function () { toast(on ? '✅ Đã BẬT chương trình' : '⏸ Đã TẮT chương trình'); ve(); })
            .catch(function (e) { toast('❌ Lỗi: ' + e.message); });
        });
      };
      pane.querySelector('#gn-bd-luu').onclick = function () {
        var v = pane.querySelector('#gn-bd').value;
        G.datCfg({ batDau: v, by: 'pos' }).then(function () { toast('✅ Ngày bắt đầu: ' + v.split('-').reverse().join('/')); ve(); })
          .catch(function () { toast('⚠️ Ngày không hợp lệ (phải trước 23/12)'); });
      };
      pane.querySelector('#gn-tk-btn').onclick = function () {
        var out = pane.querySelector('#gn-tk'); out.textContent = 'Đang tải…';
        G.thongKe().then(function (S) {
          out.innerHTML = '<b>' + S.khach + '</b> khách · <b>' + S.luot + '</b> lượt (đã quay ' + S.mo + ') · <b>' + S.trung + '</b> trúng · đã nhận <b>' + S.nhan + '</b> · chờ nhận ' + S.choNhan +
            Object.keys(S.theoQuan).map(function (q) { var t = S.theoQuan[q]; return '<br>' + esc(G.tenQuan(q)) + ': ' + t.luot + ' lượt · ' + t.trung + ' trúng · ' + t.nhan + ' đã nhận'; }).join('');
        }).catch(function (e) { out.textContent = 'Lỗi: ' + e.message; });
      };
      pane.querySelector('#gn-xoa').onclick = function () {
        var msg = pane.querySelector('#gn-xoa-msg');
        var warn = G.hetDot() ? '' : 'ĐỢT CHƯA KẾT THÚC (khách còn nhận gấu tới hết 31/12). ';
        var hoiMa = typeof window._posPrompt === 'function' ? window._posPrompt(warn + 'Nhập mã xác nhận để xoá toàn bộ dữ liệu Gấu Noel:', '') : Promise.resolve(window.prompt(warn + 'Nhập mã xác nhận:', ''));
        hoiMa.then(function (v) {
          if (v == null) return;
          msg.textContent = 'Đang xoá…';
          G.xoaHet(String(v).trim(), function (n) { msg.textContent = 'Đã xoá ' + n + ' bản ghi…'; })
            .then(function (n) { G.apCfg(null); msg.textContent = '✅ Đã xoá xong (' + n + ' bản ghi). Chương trình đã tắt. Giờ gỡ thẻ script gau_noel_giangsinh ở 3 POS rồi deploy.'; ve(); })
            .catch(function (e) { msg.textContent = e.message === 'sai-ma' ? 'Sai mã xác nhận — không xoá.' : '❌ Lỗi: ' + e.message + ' — bấm lại để xoá tiếp.'; });
        });
      };
      veDash(pane.querySelector('#gn-dash'), !!docMoi);
      G.docKho().then(function (all) {
        var ids = ['tc33', 'xofa', 'gg01']; Object.keys(all).forEach(function (k) { if (ids.indexOf(k) < 0) ids.push(k); });
        var box = pane.querySelector('#gn-kho'); box.innerHTML = ids.map(function (id) { return veKho(id, all[id] || {}); }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('[data-luu]'), function (b) {
          b.onclick = function () {
            var card = b.closest('[data-quan]'), id = card.getAttribute('data-quan'), cap = {};
            G.KHO_NGAU.forEach(function (k) { cap[k] = { open: 0, week: 0, p15: 0, pre: 0, n: [0, 0, 0] }; });
            Array.prototype.forEach.call(card.querySelectorAll('input[data-b]'), function (i) {
              var v = Math.max(0, Math.round(Number(i.value) || 0)), c = i.getAttribute('data-c'), k = cap[i.getAttribute('data-b')];
              if (c.charAt(0) === 'n' && c.length === 2) k.n[+c.charAt(1)] = v; else k[c] = v;
            });
            var m = card.querySelector('[data-msg]'), tong = Math.round(Number(card.querySelector('[data-tong]').value) || 0);
            var tongCap = 0; G.KHO_NGAU.forEach(function (k) { tongCap += cap[k].pre + cap[k].n[0] + cap[k].n[1] + cap[k].n[2]; });
            if (tong <= 0) { m.textContent = '⚠️ Nhập «Số gấu thật của quán» (> 0) — bằng 0 thì quán không trúng được con nào'; return; }
            if (tong < tongCap) m.textContent = '⚠️ Số gấu thật (' + tong + ') ít hơn tổng trần kho ngẫu nhiên (' + tongCap + ') — hết gấu thật thì ngừng trúng. Đang lưu…';
            else m.textContent = 'Đang lưu…';
            G.luuKho(id, cap, tong).then(function () { m.textContent = (/⚠️/.test(m.textContent) ? m.textContent.replace('Đang lưu…', '') + ' ' : '') + '✅ Đã lưu'; }).catch(function (e) { m.textContent = '❌ ' + e.message; });
          };
        });
      }).catch(function (e) { pane.querySelector('#gn-kho').textContent = 'Lỗi đọc kho: ' + e.message; });
    }
    boc('switchMgrTab', function (cu) {
      return function (tab) {
        var on = tab === 'gaunoel';
        [tabBtn, tabMob].forEach(function (b) { if (!b) return; b.style.background = on ? '#991b1b' : 'transparent'; b.style.color = on ? '#fff' : '#6b7280'; });
        if (on) {
          cu.call(this, '__gaunoel__');   // tắt hết tab cũ (không tab nào trùng tên)
          var bw = $('mgr-col-b-wrap'); if (bw) bw.style.display = 'none';
          pane.style.display = 'flex'; ve(true);
          return;
        }
        pane.style.display = 'none';
        return cu.apply(this, arguments);
      };
    });
  }

  // ── kiosk.html (màn hình phụ XOFA) — chỉ hiển thị, không Firestore. Nghe RT gau_noel_2026_kiosk/xofa ──
  function ganKiosk() {
    var dbk = null; try { dbk = db; } catch (e) {}
    if (!dbk || !dbk.ref) { console.warn('[gấu] kiosk không thấy db'); return; }
    var css = document.createElement('style');
    css.textContent =
      '#gn-k{display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px 12px;flex:1;background:linear-gradient(180deg,#fff5f5,#f0fdf4);overflow:hidden;text-align:center}' +
      '#gn-k.on{display:flex}#gn-k .k-t{font-size:15px;font-weight:700;color:#991b1b;line-height:1.3}#gn-k .k-s{font-size:12px;color:#374151;line-height:1.5}' +
      '#gn-k .k-n{font-size:30px;font-weight:700;color:#166534;line-height:1}' +
      '#gn-k .k-code{font-size:20px;font-weight:700;letter-spacing:2px;color:#166534;background:#fff;border-radius:10px;padding:6px 12px;border:2px dashed #86efac}' +
      '#gn-k .gn-vong{width:min(230px,90%)!important;height:auto!important;aspect-ratio:1}#gn-k .k-qr{width:100%;max-width:230px;aspect-ratio:1}#gn-k .k-qr svg{width:100%;height:100%}' +
      '#gn-kb{flex-shrink:0;margin:6px 12px;padding:6px 10px;border-radius:10px;background:linear-gradient(135deg,#fef2f2,#dcfce7);border:1px solid #fca5a5;display:none;align-items:center;gap:6px;font-size:8.5px;font-weight:700;color:#7f1d1d;line-height:1.3}#gn-kb.on{display:flex}';
    document.head.appendChild(css);
    var right = document.getElementById('panel-right'), bill = document.getElementById('bill-total-block');
    if (!right) return;
    var k = document.createElement('div'); k.id = 'gn-k';
    right.insertBefore(k, bill || null);
    var ban = document.createElement('div'); ban.id = 'gn-kb';
    ban.innerHTML = '<span style="font-size:12px">🧸</span><span>Giáng sinh: mua từ 2 ly + đọc SĐT tích điểm → quay trúng gấu bông!</span>';
    var neoBan = document.getElementById('bed-voucher-banner');
    if (neoBan && neoBan.parentNode) neoBan.parentNode.insertBefore(ban, neoBan.nextSibling); else right.insertBefore(ban, right.firstChild);
    var anTimer = null, lastAt = 0, bat = false;
    var CAC = ['orders-list', 'done-panel', 'qr-panel'];
    function hien(html, giay) {
      if (html != null) k.innerHTML = html;
      k.classList.add('on');
      CAC.forEach(function (id) { var e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; if (e && id === 'orders-list') e.style.display = 'none'; });
      clearTimeout(anTimer); if (giay) anTimer = setTimeout(an, giay * 1000);
    }
    function an() {
      clearTimeout(anTimer); k.classList.remove('on'); k.innerHTML = '';
      CAC.forEach(function (id) { var e = document.getElementById(id); if (e) e.style.visibility = ''; });
      var ol = document.getElementById('orders-list'), dp = document.getElementById('done-panel'), qp = document.getElementById('qr-panel');
      if (ol && !(dp && dp.classList.contains('visible')) && !(qp && qp.classList.contains('visible'))) ol.style.display = '';
    }
    // mở / quay / kết quả dùng chung 1 vòng (không dựng lại) để vòng dừng đúng chỗ rồi hiện kết quả bên dưới
    function khungVong(tieuDe, chu, giay) {
      if (!k.querySelector('.gn-vong')) hien('<div class="k-t"></div>' + vongSvg(230) + '<div class="k-s"></div>', giay);
      else hien(null, giay);
      k.querySelector('.k-t').innerHTML = tieuDe; k.querySelector('.k-s').innerHTML = chu;
      return k.querySelector('.gn-vong');
    }
    function ve(ev) {
      if (!ev || !bat || Date.now() - (Number(ev.at) || 0) > 10 * 60e3) { an(); return; }
      var sdt = ev.sdt ? 'SĐT …' + esc(ev.sdt) : '';
      if (ev.loai === 'qr') hien('<div class="k-t">🎄 Quay trúng gấu Noel</div><div class="k-n">' + (Number(ev.soLuot) || 0) + ' lượt</div>' +
        '<div class="k-qr">' + qrSvg(230) + '</div><div class="k-s">Quét mã → đăng nhập ' + (sdt || 'SĐT') + ' → bấm <b>Quay</b></div>', 90);
      else if (ev.loai === 'mo') { var v0 = khungVong('🎄 Vòng quay gấu Noel', sdt, 120); v0.removeAttribute('data-r'); v0.querySelector('svg').style.transition = 'none'; v0.querySelector('svg').style.transform = 'rotate(0deg)'; }
      else if (ev.loai === 'quay') quayVong(khungVong('Đang quay…', sdt, 60), !!ev.win);
      else if (ev.loai === 'ketqua') khungVong(ev.win ? 'Chúc mừng!' : 'Chưa trúng lần này', ev.win
        ? (ev.daNhan ? '<b>🧸 Trúng 1 gấu bông</b><br>Nhận gấu ngay tại quầy nhé!' : '<b>🧸 Trúng 1 gấu bông</b><br>Nhận tại ' + esc(G.tenQuan(ev.store)) + '<div class="k-code" style="margin-top:8px;display:inline-block">' + esc(ev.code) + '</div>') + (ev.conLai > 0 ? '<br>Còn ' + ev.conLai + ' lượt' : '')
        : 'Chúc bạn may mắn lần sau!' + (ev.conLai > 0 ? '<br>Còn ' + ev.conLai + ' lượt' : ''), 30);
      else an();
    }
    var ref = null, cb = null, cuoi = null, sref = null, scb = null;
    function gan() {
      if (ref && cb) ref.off('value', cb);
      if (sref && scb) sref.off('value', scb);
      // giỏ mới (session_display_xolifa.state khác 'done') → thu khung QR gấu lại; đang mở lượt tại quầy thì giữ
      sref = dbk.ref('session_display_xolifa/state');
      scb = sref.on('value', function (s) {
        var st = String(s.val() || '').toLowerCase();
        if (st && st !== 'done' && st !== 'idle' && k.classList.contains('on') && cuoi && cuoi.loai === 'qr') an();
      }, function () {});
      ref = dbk.ref(G.KIOSK_ROOT + '/xofa');
      cb = ref.on('value', function (snap) {
        var v = snap.val() || {};
        bat = v.bat === true; ban.classList.toggle('on', bat);
        var nb = document.getElementById('bed-voucher-banner'); if (nb) nb.style.display = bat ? 'none' : '';
        var ev = v.ev || null, at = ev ? Number(ev.at) || 0 : 0;
        if (at !== lastAt || !bat) { lastAt = at; ve(ev); }
        cuoi = ev;
      }, function (e) { console.warn('[gấu] kiosk', e); });
    }
    // kiosk đăng nhập rồi mới nghe (rules cần đăng nhập) — gắn lại mỗi khi trạng thái đăng nhập đổi
    try { firebase.auth().onAuthStateChanged(function () { gan(); }); } catch (e) { gan(); }
    G.kioskVe = ve;   // test
  }

  // ── index_giangsinh.html (app khách The cafe 33) — quay = MỞ lượt đã bốc ở POS; thẻ gấu dưới thẻ thành viên ──
  // Đọc: 1 doc công tắc + doc của chính khách (nghe khi đang bật, để vừa thanh toán xong quét QR là thấy lượt). Tắt = không đọc doc khách.
  function ganKhach(fsk) {
    var css = document.createElement('style');
    css.textContent =
      '#gn-the{margin:0 0 24px;border-radius:32px;overflow:hidden;position:relative;padding:18px 18px 16px;color:#f2f8ff;background:radial-gradient(circle at 90% -10%,#2b5e9e 0%,#14325a 50%,#0b1d38 100%);box-shadow:0 14px 34px rgba(11,29,56,.3)}' +
      '#gn-the:before{content:"";position:absolute;right:-40px;top:-40px;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(190,225,255,.28),transparent 70%)}' +
      '#gn-the .gt-h{display:flex;align-items:center;gap:10px;position:relative}#gn-the .gt-ic{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22)}' +
      '#gn-the .gt-tt{flex:1;min-width:0}#gn-the .gt-tt b{display:block;font-size:16px;font-weight:900;color:#fff}#gn-the .gt-tt small{display:block;font-size:11.5px;color:rgba(220,236,255,.75);margin-top:1px}' +
      '#gn-the .gt-tag{font-size:10px;font-weight:900;letter-spacing:.08em;padding:4px 9px;border-radius:99px;background:#d62b3a;color:#fff}' +
      '#gn-the .gt-luot{display:flex;align-items:center;gap:12px;margin-top:14px;position:relative;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18)}' +
      '#gn-the .gt-luot b{font-size:26px;font-weight:900;color:#fff;line-height:1}#gn-the .gt-luot span{display:block;font-size:12px;color:rgba(220,236,255,.8);margin-top:2px}' +
      '#gn-the .gt-btn,#gn-q .gq-btn{border:none;border-radius:99px;padding:12px 18px;font-weight:900;font-size:13px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#ef4655,#b3162a);box-shadow:0 6px 16px rgba(179,22,42,.35);-webkit-tap-highlight-color:transparent}' +
      '#gn-the .gt-qua{margin-top:12px;display:flex;flex-direction:column;gap:8px;position:relative}' +
      '#gn-the .gt-g{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:#fff;color:#0b1d38}#gn-the .gt-g .e{font-size:30px;line-height:1}' +
      '#gn-the .gt-g .t{flex:1;min-width:0}#gn-the .gt-g .t b{display:block;font-size:18px;font-weight:900;letter-spacing:.1em;color:#b3162a}#gn-the .gt-g .t small{display:block;font-size:11.5px;color:#4b5b73;margin-top:2px;line-height:1.4}' +
      '#gn-the .gt-g.used{background:rgba(255,255,255,.1);color:rgba(220,236,255,.7)}#gn-the .gt-g.used .t b{color:rgba(220,236,255,.6);text-decoration:line-through}#gn-the .gt-g.used .t small{color:rgba(220,236,255,.6)}' +
      '#gn-the .gt-foot{font-size:11px;color:rgba(220,236,255,.65);margin-top:12px;line-height:1.5;position:relative}' +
      '#gn-q{position:fixed;inset:0;z-index:190;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(3,9,20,.88)}#gn-q.on{display:flex}' +
      '#gn-q .gq-box{width:min(320px,88vw);text-align:center;color:#f2f8ff}#gn-q h3{margin:0;font-size:20px;font-weight:900;color:#fff}#gn-q .gq-sub{font-size:13px;color:rgba(220,236,255,.8);margin-top:4px}' +
      '#gn-q .gn-vong{width:min(280px,76vw)!important;height:auto!important;aspect-ratio:1;margin:18px auto 14px}' +
      '#gn-q .gq-say{font-size:14px;line-height:1.5;min-height:44px}#gn-q .gq-code{display:inline-block;margin-top:8px;padding:8px 14px;border-radius:12px;background:#fff;color:#b3162a;font:900 22px/1 monospace;letter-spacing:.12em}' +
      '#gn-q .gq-btns{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}#gn-q .gq-x{background:rgba(255,255,255,.14);box-shadow:none}' +
      '@media(prefers-reduced-motion:reduce){#gn-q *{animation:none!important}}';
    document.head.appendChild(css);
    var the = document.createElement('div'); the.id = 'gn-the'; the.style.display = 'none';
    var mc = document.querySelector('#tab-user .card-gradient');
    if (mc && mc.parentNode) mc.parentNode.insertBefore(the, mc.nextSibling);
    var q = document.createElement('div'); q.id = 'gn-q';
    q.innerHTML = '<div class="gq-box"><h3>🎄 Vòng quay gấu Noel</h3><div class="gq-sub"></div>' + vongSvg(280) + '<div class="gq-say"></div><div class="gq-btns"></div></div>';
    document.body.appendChild(q);
    var sub = q.querySelector('.gq-sub'), vong = q.querySelector('.gn-vong'), say = q.querySelector('.gq-say'), btns = q.querySelector('.gq-btns');
    var sdt = '', unDoc = null, st = null, daBao = -1, dangQuay = false, cfgNghe = false;
    function phone() { try { return G.normPhone(curPhone || ''); } catch (e) { return ''; } }
    function ngay(iso) { var d = String(iso || '').slice(0, 10).split('-'); return d.length === 3 ? d[2] + '/' + d[1] : ''; }
    var HAN = G.CFG.hanNhan.split('-').reverse().slice(0, 2).join('/');
    function veThe() {
      if (!st || !G.dangNhan()) { the.style.display = 'none'; the.innerHTML = ''; return; }
      // gấu của lượt CHƯA quay thì chưa hiện (giữ bất ngờ) — quay xong mới thấy mã
      var moRoi = {}; st.luot.forEach(function (l) { if (l.opened) moRoi[l.id] = 1; });
      var thay = st.qua.filter(function (x) { return x.used || !x.luot || moRoi[x.luot]; });
      var cho = thay.filter(function (x) { return !x.used; }), da = thay.filter(function (x) { return x.used; }), n = st.chuaMo.length;
      var h = '<div class="gt-h"><div class="gt-ic">🧸</div><div class="gt-tt"><b>Gấu Noel của bạn</b><small>Mua từ 2 ly, đọc SĐT khi order → nhận lượt quay</small></div><span class="gt-tag">NOEL</span></div>';
      if (n) h += '<div class="gt-luot"><div style="flex:1"><b>' + n + ' lượt</b><span>chưa quay</span></div><button class="gt-btn" data-q="1">Quay ngay</button></div>';
      if (cho.length || da.length) h += '<div class="gt-qua">' + cho.map(function (x) {
        return '<div class="gt-g"><div class="e">🧸</div><div class="t"><b>' + esc(x.code) + '</b><small>1 gấu bông · nhận tại <b style="display:inline;font-size:11.5px;letter-spacing:0;color:#0b1d38">' + esc(G.tenQuan(x.store)) + '</b><br>Đưa mã cho nhân viên · hạn ' + HAN + '</small></div></div>';
      }).join('') + da.map(function (x) {
        return '<div class="gt-g used"><div class="e">🧸</div><div class="t"><b>' + esc(x.code) + '</b><small>Đã nhận ' + ngay(x.usedAt) + ' tại ' + esc(G.tenQuan(x.store)) + '</small></div></div>';
      }).join('') + '</div>';
      if (!n && !cho.length && !da.length) h += '<div class="gt-foot" style="font-size:12.5px;color:rgba(235,244,255,.9)">Mua từ 2 ly ở The cafe 33, XOFA hoặc Gieo Gieo, đọc số điện thoại khi order — mỗi 2 ly là 1 lượt quay gấu bông. Đơn từ 6 ly chắc chắn có gấu!</div>';
      h += '<div class="gt-foot">Trúng ở quán nào nhận ở quán đó · khách chọn gấu tại quầy · nhận tới hết ' + HAN + '</div>';
      the.innerHTML = h; the.style.display = 'block';
      var b = the.querySelector('[data-q]'); if (b) b.onclick = function () { moPopup(); };
    }
    function moPopup() {
      if (!st || !st.chuaMo.length) return;
      dangQuay = false;
      sub.innerHTML = 'Bạn có <b>' + st.chuaMo.length + ' lượt quay</b>';
      say.textContent = 'Chạm Quay để quay vòng!';
      btns.innerHTML = '<button class="gq-btn" data-a="quay">Quay</button><button class="gq-btn gq-x" data-a="x">Để sau</button>';
      q.classList.add('on'); ganNut();
    }
    function ganNut() {
      var bq = btns.querySelector('[data-a=quay]'), bx = btns.querySelector('[data-a=x]');
      if (bx) bx.onclick = function () { if (!dangQuay) q.classList.remove('on'); };
      if (bq) bq.onclick = quay;
      vong.onclick = function () { if (!dangQuay && btns.querySelector('[data-a=quay]')) quay(); };
    }
    function quay() {
      if (dangQuay) return; dangQuay = true;
      say.textContent = 'Đang quay…'; btns.innerHTML = '';
      G.mo(sdt).then(function (kq) {
        quayVong(vong, kq.win, function () {
          dangQuay = false;
          if (kq.win) say.innerHTML = '<b>🧸 Chúc mừng! Bạn trúng 1 gấu bông</b><br>Nhận tại ' + esc(G.tenQuan(kq.store)) + ' · hạn ' + HAN + '<br><span class="gq-code">' + esc(kq.code) + '</span>';
          else say.innerHTML = 'Chưa trúng lần này<br>Chúc bạn may mắn lần sau!';
          sub.innerHTML = kq.conLai > 0 ? 'Còn <b>' + kq.conLai + ' lượt</b>' : 'Đã quay hết lượt';
          btns.innerHTML = (kq.conLai > 0 ? '<button class="gq-btn" data-a="quay">Quay tiếp</button>' : '') + '<button class="gq-btn gq-x" data-a="x">' + (kq.win ? 'Xem gấu của tôi' : 'Đóng') + '</button>';
          ganNut();
          var bx = btns.querySelector('[data-a=x]');
          if (kq.win && bx) bx.onclick = function () { q.classList.remove('on'); try { if (typeof showTab === 'function') showTab('user'); } catch (e) {} setTimeout(function () { the.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250); };
          baoNeuCo();
        });
      }).catch(function (e) {
        dangQuay = false;
        say.textContent = e.message === 'het-luot' ? 'Bạn đã quay hết lượt.' : e.message === 'het-dot' ? 'Chương trình đã kết thúc.' : 'Chưa quay được, thử lại sau nhé.';
        btns.innerHTML = '<button class="gq-btn gq-x" data-a="x">Đóng</button>'; ganNut();
      });
    }
    // popup tự hiện khi có lượt mới (lần đầu vào app hoặc vừa thanh toán xong) — chờ popup chào mừng đóng
    function baoNeuCo() {
      var n = st ? st.chuaMo.length : 0;
      if (!dangQuay && n > 0 && n > daBao && !q.classList.contains('on')) {
        var w = document.getElementById('welcome-popup'), cho = 0;
        (function doi() {
          var mo = w && !w.classList.contains('hidden') && w.style.display !== 'none';
          if (mo && ++cho < 120) { setTimeout(doi, 1000); return; }
          if (st && st.chuaMo.length && !q.classList.contains('on')) moPopup();
        })();
      }
      daBao = n;
    }
    function dung() { if (unDoc) { try { unDoc(); } catch (e) {} unDoc = null; } st = null; veThe(); }
    function bat() {
      var p = phone();
      if (p.length < 10 || !G.dangNhan()) { sdt = ''; dung(); return; }
      if (p === sdt && unDoc) return;
      dung(); sdt = p; daBao = -1;
      try {
        unDoc = G.docKhach(p).onSnapshot(function (s) {
          if (sdt !== p) return;
          st = G.stateOf(s.exists ? s.data() : null); veThe();
          baoNeuCo();
        }, function (e) { console.warn('[gấu] đọc lượt', e); });
      } catch (e) { console.warn('[gấu]', e); }
    }
    G.khachBat = bat;   // test
    var _sd = window.showDashboard;
    if (typeof _sd === 'function') window.showDashboard = function () {
      var r = _sd.apply(this, arguments);
      if (!cfgNghe) { cfgNghe = true; G.ngheCfg(function () { bat(); }); } else bat();
      return r;
    };
  }
})();
