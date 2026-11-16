/* in_tem_niimbot.v1.js — In tem ly qua máy Niimbot B1 (Web Bluetooth) cho POS XOFA (PosX.html).
 *
 * - Cần nạp niimbluelib.v1.js trước (thư viện giao thức máy in, MIT).
 * - Giấy 40 × 30 mm, 203 dpi. Bố cục tem giống trang in độc lập niim.html:
 *   [tên quán ............ #số đơn] → tên món (to nhất) → size → mỗi topping một dòng (như tem posgieo)
 *   → «• Mang đi» nếu đơn To Go → nét đứt → giờ · ly thứ x/y · giá (đã cộng topping).
 * - Mỗi LY một tem (món số lượng 3 → 3 tem), đánh số x/y trên cả đơn.
 * - In KHÔNG chặn luồng bán: PosX gọi NiimTem.inDon(order) sau khi đơn đã lưu, không await.
 * - Mọi chữ lấy từ đơn hàng chỉ đi vào canvas / textContent, không chèn innerHTML.
 *
 * API: NiimTem.init({ quan, toast, cham })   NiimTem.mo()   NiimTem.inDon(order, { soDon })
 */
(function () {
'use strict';

var DPMM = 8;                       // 203 dpi
var KHOA = 'niimtem_xofa_v1';
var PHONG = '"Be Vietnam Pro", "Google Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// Mặc định đã canh trên máy B1 thật (giấy 40×30 không chip, firmware 6.19 vá): máy bắt đầu in thấp hơn
// mép trên nhãn ~4,5 mm và lệch trái ~2 mm.
var S = { tuIn: true, rong: 40, cao: 30, lechY: 4.5, lechX: 2, doDam: 5, loaiGiay: 1, daDung: false };
try {
  var luu = JSON.parse(localStorage.getItem(KHOA) || 'null');
  if (luu && typeof luu === 'object') Object.keys(S).forEach(function (k) { if (typeof luu[k] === typeof S[k]) S[k] = luu[k]; });
} catch (e) {}
function luuLai() { try { localStorage.setItem(KHOA, JSON.stringify(S)); } catch (e) {} }

var CH = { quan: 'XOFA', toast: null, cham: null };
function bao(msg) { try { if (CH.toast) CH.toast(msg); else console.log('[tem]', msg); } catch (e) {} }
function kep(v, a, b) { return Math.min(b, Math.max(a, v)); }
function soMm(v, md) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : md; }

// ════════ Phông chữ tem (giống niim.html) ════════
var phongSan = null;
function napPhong() {
  if (phongSan) return phongSan;
  try {
    if (!document.getElementById('niimtem-phong')) {
      var l = document.createElement('link'); l.id = 'niimtem-phong'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600;700;800&display=swap';
      document.head.appendChild(l);
    }
  } catch (e) {}
  var tai = (document.fonts && document.fonts.load)
    ? Promise.all(['600', '700', '800'].map(function (w) { return document.fonts.load(w + ' 24px "Be Vietnam Pro"', 'Cà phê sữa đá'); }))
    : Promise.resolve();
  // Không có mạng thì in bằng phông máy — không để việc tải phông chặn việc in.
  phongSan = Promise.race([tai, new Promise(function (r) { setTimeout(r, 2500); })]).catch(function () {});
  return phongSan;
}

// ════════ Vẽ chữ ════════
function phong(ctx, dam, co) { ctx.font = dam + ' ' + Math.round(co) + 'px ' + PHONG; }
function nganDong(ctx, chu, rong) {
  var dong = [];
  String(chu).split('\n').forEach(function (doan) {
    var tu = doan.split(/\s+/).filter(Boolean), hien = '';
    if (!tu.length) { dong.push(''); return; }
    tu.forEach(function (t) {
      while (ctx.measureText(t).width > rong && t.length > 1) {
        var n = t.length - 1;
        while (n > 1 && ctx.measureText(t.slice(0, n)).width > rong) n--;
        if (hien) { dong.push(hien); hien = ''; }
        dong.push(t.slice(0, n)); t = t.slice(n);
      }
      var thu = hien ? hien + ' ' + t : t;
      if (ctx.measureText(thu).width <= rong) hien = thu; else { if (hien) dong.push(hien); hien = t; }
    });
    if (hien) dong.push(hien);
  });
  return dong;
}
function chuMotDong(ctx, chu, rong) {
  chu = String(chu);
  if (ctx.measureText(chu).width <= rong) return chu;
  while (chu.length > 1 && ctx.measureText(chu + '…').width > rong) chu = chu.slice(0, -1);
  return chu + '…';
}
function catDong(ctx, dong, toiDa, rong) {
  if (dong.length <= toiDa) return dong;
  dong = dong.slice(0, toiDa);
  var cuoi = dong[toiDa - 1];
  while (cuoi.length > 1 && ctx.measureText(cuoi + '…').width > rong) cuoi = cuoi.slice(0, -1);
  dong[toiDa - 1] = cuoi + '…';
  return dong;
}
function vuaKhung(ctx, chu, dam, rong, cao, coMax, coMin, soDong) {
  for (var co = coMax; co >= coMin; co -= 1) {
    phong(ctx, dam, co);
    var d = nganDong(ctx, chu, rong);
    if (d.length <= soDong && d.length * co * 1.14 <= cao) return { co: co, dong: d };
  }
  phong(ctx, dam, coMin);
  return { co: coMin, dong: catDong(ctx, nganDong(ctx, chu, rong), Math.max(1, Math.min(soDong, Math.floor(cao / (coMin * 1.14)))), rong) };
}

// ════════ Mẫu tem ly ════════
// d = { quan, don, mon, size, toppings:[chữ], ghi, gia, thu, gio }   M = lề từng cạnh (điểm)
function veTemLy(ctx, w, h, M, d) {
  var s = Math.min(w / (296 + M.l + M.r), h / (190 + M.t + M.b)), xT = M.l, xP = w - M.r;
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.textBaseline = 'middle';

  // Hàng đầu: tên quán + số đơn (ô đen chữ trắng)
  var caoDau = Math.round(34 * s), yDau = M.t + caoDau / 2, rongDon = 0;
  if (d.don) {
    phong(ctx, 800, 22 * s);
    var chuDon = chuMotDong(ctx, d.don, w * 0.45);
    rongDon = Math.ceil(ctx.measureText(chuDon).width + 20 * s);
    ctx.beginPath(); ctx.roundRect(xP - rongDon, M.t, rongDon, caoDau, 9 * s); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(chuDon, xP - rongDon / 2, yDau + 1 * s);
    ctx.fillStyle = '#000';
  }
  if (d.quan) {
    phong(ctx, 800, 23 * s); ctx.textAlign = 'left';
    ctx.fillText(chuMotDong(ctx, d.quan, xP - xT - rongDon - 8 * s), xT, yDau + 1 * s);
  }

  // Hàng cuối: giờ · ly thứ · giá
  var caoCuoi = Math.round(30 * s), yCuoi = h - M.b - caoCuoi / 2, coCuoi = d.gia || d.thu || d.gio;
  var tren = M.t + caoDau + Math.round(8 * s), duoi = coCuoi ? h - M.b - caoCuoi - Math.round(8 * s) : h - M.b;
  if (coCuoi) {
    ctx.lineWidth = Math.max(2, Math.round(2 * s)); ctx.setLineDash([6 * s, 5 * s]);
    ctx.beginPath(); ctx.moveTo(xT, duoi + 2 * s); ctx.lineTo(xP, duoi + 2 * s); ctx.stroke(); ctx.setLineDash([]);
    var xPhai = xP;
    if (d.gia) {
      phong(ctx, 800, 26 * s); ctx.textAlign = 'right';
      var g = chuMotDong(ctx, d.gia, w * 0.4); ctx.fillText(g, xPhai, yCuoi + 2 * s); xPhai -= ctx.measureText(g).width + 10 * s;
    }
    var xTrai = xT;
    if (d.gio) {
      phong(ctx, 600, 17 * s); ctx.textAlign = 'left';
      ctx.fillText(d.gio, xTrai, yCuoi + 2 * s); xTrai += ctx.measureText(d.gio).width + 10 * s;
    }
    if (d.thu && xPhai - xTrai > 40 * s) {
      phong(ctx, 700, 17 * s);
      var th = chuMotDong(ctx, d.thu, xPhai - xTrai - 18 * s), rt = ctx.measureText(th).width + 18 * s, ct = 26 * s;
      var xt = d.gio ? xTrai : xT;
      ctx.lineWidth = Math.max(2, Math.round(2 * s));
      ctx.beginPath(); ctx.roundRect(xt + 1, yCuoi - ct / 2 + 1 * s, rt, ct, ct / 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(th, xt + 1 + rt / 2, yCuoi + 2 * s);
    }
  }

  // Phần giữa: tên món (to nhất) → size → topping → ghi chú.
  // Nhiều topping: thử mỗi topping một dòng (như tem posgieo), không vừa thì thu chữ, vẫn không vừa thì
  // gộp topping thành một đoạn «+ A, B, C» — thà chữ nhỏ hơn còn hơn mất nội dung.
  var rong = xP - xT, cao = duoi - tren, tp = (d.toppings || []).filter(Boolean);
  function xep(k, gop) {
    var coPhu = Math.max(11, 18 * s * k), buoc = coPhu * 1.17, dong = [];
    phong(ctx, 600, coPhu);
    if (d.size) dong.push({ t: chuMotDong(ctx, d.size, rong), dam: 600, co: coPhu });
    if (tp.length) {
      if (gop) catDong(ctx, nganDong(ctx, '+ ' + tp.join(', '), rong), 3, rong).forEach(function (t) { dong.push({ t: t, dam: 600, co: coPhu }); });
      else tp.forEach(function (t) { dong.push({ t: chuMotDong(ctx, '+ ' + t, rong), dam: 600, co: coPhu }); });
    }
    if (d.ghi) { phong(ctx, 700, coPhu * 0.95); dong.push({ t: chuMotDong(ctx, '• ' + d.ghi, rong), dam: 700, co: coPhu * 0.95 }); }
    var caoPhu = dong.length * buoc + (dong.length ? 4 * s : 0);
    var mon = d.mon ? vuaKhung(ctx, d.mon, 800, rong, Math.max(20 * s, cao - caoPhu), Math.round(40 * s), Math.round(17 * s), 2) : null;
    var caoMon = mon ? mon.dong.length * mon.co * 1.14 : 0;
    return { mon: mon, dong: dong, buoc: buoc, caoMon: caoMon, tong: caoMon + caoPhu };
  }
  // Lượt 1: chỉ nhận cách xếp còn giữ được tên món đủ to (≥ 25 điểm ≈ 3 mm); lượt 2: miễn là vừa khung.
  var bo = null, thu = [[1, false], [0.9, false], [0.8, false], [0.9, true], [0.8, true], [0.7, true], [0.6, true]], xong = false;
  for (var luot = 0; luot < 2 && !xong; luot++) {
    for (var i = 0; i < thu.length && !xong; i++) {
      bo = xep(thu[i][0], thu[i][1]);
      xong = bo.tong <= cao && (luot === 1 || !bo.mon || bo.mon.dong.length > 1 || bo.mon.co >= 25 * s);
    }
  }
  var y = tren + Math.max(0, (cao - bo.tong) / 2);
  ctx.textAlign = 'left';
  if (bo.mon) {
    phong(ctx, 800, bo.mon.co);
    bo.mon.dong.forEach(function (dg) { ctx.fillText(dg, xT, y + bo.mon.co * 0.57); y += bo.mon.co * 1.14; });
    y += 4 * s;
  }
  bo.dong.forEach(function (dg) {
    if (y + bo.buoc > duoi + 1) return;            // chốt an toàn: không vẽ đè lên hàng cuối
    phong(ctx, dg.dam, dg.co); ctx.fillText(dg.t, xT, y + bo.buoc / 2); y += bo.buoc;
  });
}

// Đưa mọi điểm về đúng đen / trắng (thư viện coi mọi điểm khác trắng là đen).
function denTrang(ctx, w, h) {
  var im = ctx.getImageData(0, 0, w, h), p = im.data;
  for (var i = 0; i < p.length; i += 4) {
    var a = p[i + 3] / 255, x = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) * a + 255 * (1 - a);
    p[i] = p[i + 1] = p[i + 2] = x < 150 ? 0 : 255; p[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}

// Vùng máy in với tới trên nhãn; dưới chừa trắng bằng đoạn đầu nhãn máy bỏ qua để tem cân đối.
function khung() {
  var W = Math.round(S.rong * DPMM), H = Math.round(S.cao * DPMM);
  var oy = kep(Math.round(S.lechY * DPMM), 0, Math.floor((H - 80) / 2)), ox = kep(Math.round(S.lechX * DPMM), -(W - 80), W - 80);
  return { W: W, H: H, ox: ox, oy: oy, dw: W - Math.abs(ox), dh: H - 2 * oy };
}
// Canvas gửi máy in: dòng 0 rơi vào vị trí lechY trên nhãn, cột c rơi vào vị trí c − lechX.
function veTem(d) {
  var k = khung(), w = k.dw, h = k.dh;
  var tam = document.createElement('canvas'); tam.width = w; tam.height = h;
  var c = tam.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
  var le = Math.round(12 * Math.min(w / 320, h / 240));
  var M = { t: Math.max(2, le - k.oy), r: Math.max(2, le - Math.max(0, k.ox)), b: Math.max(2, le - k.oy), l: Math.max(2, le - Math.max(0, -k.ox)) };
  veTemLy(c, w, h, M, d);
  denTrang(c, w, h);
  var dich = document.createElement('canvas'); dich.width = k.W; dich.height = k.dh;
  var o = dich.getContext('2d'); o.imageSmoothingEnabled = false;
  o.fillStyle = '#fff'; o.fillRect(0, 0, k.W, k.dh); o.drawImage(tam, Math.max(0, k.ox), 0);
  return dich;
}
// Cả tờ nhãn (để xem trước): hình nằm đúng chỗ sẽ in ra.
function veCaNhan(d, dich) {
  var k = khung(), gui = veTem(d);
  dich = dich || document.createElement('canvas'); dich.width = k.W; dich.height = k.H;
  var o = dich.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, k.W, k.H); o.drawImage(gui, -k.ox, k.oy);
  return dich;
}

// ════════ Từ đơn hàng PosX → nội dung từng tem ════════
function tienK(n) {
  n = Math.round(Number(n) || 0);
  if (n % 1000 === 0) return (n / 1000) + 'K';
  return (Math.round(n / 100) / 10).toString().replace('.', ',') + 'K';
}
function gioDon(order) {
  var ng = String(order.date || '').split('/'), g = String(order.time || '');
  return (ng.length >= 2 ? ng[0] + '/' + ng[1] + ' ' : '') + g;
}
// Món cần tem: đồ uống. Bỏ dòng giảm giá (giá âm / _discountId) và món Food (không có ly).
function monCanTem(c) { return c && c.name && !c.isFood && !c._discountId && !(Number(c.price) < 0); }
function temCuaDon(order, tuy) {
  tuy = tuy || {};
  var ds = (order.itemsArray || []).filter(monCanTem), tong = 0, ra = [], thu = 0;
  ds.forEach(function (c) { tong += Math.max(1, Math.round(Number(c.qty) || 1)); });
  ds.forEach(function (c) {
    var sl = Math.max(1, Math.round(Number(c.qty) || 1)), tps = (c.toppings || []).filter(Boolean);
    var tienTp = tps.reduce(function (a, t) { return a + (Number(t.price) || 0); }, 0);
    var gia = (Number(c.price) || 0) + tienTp;
    for (var i = 0; i < sl; i++) {
      thu++;
      ra.push({
        quan: CH.quan, don: tuy.soDon || '',
        mon: String(c.name),
        size: (c.size && c.size !== '-') ? 'Size ' + c.size : '',
        toppings: tps.map(function (t) { return String(t.name || '') + (Number(t.price) > 0 ? ' (+' + tienK(t.price) + ')' : ''); }),
        ghi: order.isToGo ? 'Mang đi' : '',
        gia: (c.isFree || gia <= 0) ? 'Tặng' : tienK(gia),
        thu: tong > 1 ? thu + '/' + tong : '',
        gio: gioDon(order)
      });
    }
  });
  return ra;
}
function temMau() {
  var n = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  return { quan: CH.quan, don: '#012', mon: 'Cà phê sữa đá', size: 'Size L', toppings: ['Trân châu (+5K)'], ghi: 'Mang đi', gia: '40K', thu: '1/2',
    gio: p(n.getDate()) + '/' + p(n.getMonth() + 1) + ' ' + p(n.getHours()) + ':' + p(n.getMinutes()) };
}

// ════════ Máy in ════════
var client = null, thietBi = null, tenMay = '', pin = null, coChip = null, dangNoi = false, daNhac = false;
function L() { return window.niimbluelib; }
function daKetNoi() { return !!(client && client.isConnected()); }
function trangThai() { return dangNoi ? 'wait' : daKetNoi() ? 'on' : 'off'; }

function taoClient() {
  var c = new (L().NiimbotBluetoothClient)();
  c.on('disconnect', function () { if (client === c) { capNhatUi(); } });
  c.on('heartbeat', function (e) {
    var h = e.data || {};
    if (h.batteryPercents !== undefined) pin = h.batteryPercents;
    if (h.paperRfidSuccess !== undefined) coChip = !!h.paperRfidSuccess;
    capNhatUi();
  });
  return c;
}
// coChon = true: mở bảng chọn thiết bị của trình duyệt (cần người bấm). false: chỉ nối lại máy đã chọn trong phiên.
async function ketNoi(coChon) {
  if (daKetNoi()) return true;
  if (dangNoi) return false;
  if (!L()) { if (coChon) bao('⚠ Chưa tải được bộ in tem — kiểm tra mạng rồi tải lại trang'); return false; }
  if (!navigator.bluetooth) { if (coChon) bao('⚠ Trình duyệt này không có Bluetooth — mở POS bằng Chrome'); return false; }
  if (!thietBi && !coChon) return false;
  dangNoi = true; capNhatUi();
  try {
    if (coChon) {
      var cfg = L().BleDefaultConfiguration;
      thietBi = cfg
        ? await navigator.bluetooth.requestDevice({ filters: cfg.NAME_FILTERS.concat([{ services: cfg.SERVICES }]) })
        : null;
    }
    var c = taoClient(); client = c;
    var kq = await Promise.race([
      thietBi ? c.connect({ authorizedDevice: thietBi }) : c.connect(),
      new Promise(function (_, tc) { setTimeout(function () { tc(new Error('Quá 20 giây không nối được')); }, 20000); })
    ]);
    tenMay = (kq && kq.deviceName) || (thietBi && thietBi.name) || 'Niimbot';
    var i = c.getPrinterInfo() || {};
    if (i.batteryPercents !== undefined) pin = i.batteryPercents;
    if (!S.daDung) { S.daDung = true; luuLai(); }
    try { c.fetchHeartbeatData(); } catch (e) {}
    if (coChon) bao('🖨 Đã kết nối máy in ' + tenMay);
    return true;
  } catch (e) {
    try { if (client) await client.disconnect(); } catch (e2) {}
    client = null;
    var huy = e && (e.name === 'NotFoundError' || /cancel/i.test(e.message || ''));
    if (coChon && !huy) bao('⚠ Không kết nối được máy in: ' + (e && e.message || e));
    return false;
  } finally { dangNoi = false; capNhatUi(); }
}
async function ngat() { try { if (client) await client.disconnect(); } catch (e) {} thietBi = null; client = null; capNhatUi(); }

var LOI_IN = {
  1: 'Nắp máy đang mở', 2: 'Hết giấy', 3: 'Pin yếu', 4: 'Pin lỗi', 6: 'Lỗi dữ liệu in', 7: 'Đầu in quá nóng', 8: 'Giấy ra bất thường',
  9: 'Máy đang in', 10: 'Không thấy đầu in', 11: 'Nhiệt độ quá thấp', 12: 'Đầu in chưa khoá', 20: 'Máy từ chối giấy không có chip'
};
function chuLoi(e) { var id = e && e.reasonId; return (id !== undefined && LOI_IN[id]) ? LOI_IN[id] : ((e && e.message) || String(e)); }

// In một lượt nhiều tem (mỗi tem một trang). Trả về số tem đã in.
async function inCacTem(dsTem) {
  await napPhong();
  var c = client, lib = L(), n = dsTem.length, task = null, hen = null;
  var anh = dsTem.map(function (d) { return lib.ImageEncoder.encodeCanvas(veTem(d), lib.PageColorType.SingleColor, 'top'); });
  task = c.protocol.newPrintTask(c.getPrintTaskType() || 'B1', {
    totalPages: n, density: S.doDam, labelType: S.loaiGiay, statusPollIntervalMs: 200, statusTimeoutMs: 10000, pageTimeoutMs: 15000
  });
  try {
    c.stopHeartbeat();
    var quaHan = new Promise(function (_, tc) { hen = setTimeout(function () { tc(new Error('Máy in không báo xong')); }, (30 + n * 15) * 1000); });
    await Promise.race([(async function () {
      await task.printInit();
      for (var i = 0; i < n; i++) { await task.printPage(anh[i], 1); await task.waitForPageFinished(); }
      await task.waitForFinished();
    })(), quaHan]);
    return n;
  } finally {
    clearTimeout(hen);
    try { if (c.isConnected()) await task.printEnd(); } catch (e) {}
    try { if (c.isConnected()) c.startHeartbeat(); } catch (e) {}
  }
}

// Hàng đợi: các đơn in lần lượt, đơn sau chờ đơn trước xong.
var hang = Promise.resolve();
function xepHang(viec) { var p = hang.then(viec, viec); hang = p.catch(function () {}); return p; }

// Gọi từ PosX sau khi đơn đã lưu. KHÔNG ném lỗi, KHÔNG chặn — luồng bán không phụ thuộc máy in.
function inDon(order, tuy) {
  try {
    if (!S.tuIn || !order) return Promise.resolve(0);
    var ds = temCuaDon(order, tuy);
    if (!ds.length) return Promise.resolve(0);
    return xepHang(async function () {
      if (!daKetNoi() && !(await ketNoi(false))) {
        // Máy này từng dùng máy in tem mà giờ chưa nối → nhắc một lần mỗi phiên; máy chưa từng dùng thì im lặng.
        if (S.daDung && !daNhac) { daNhac = true; bao('🖨 Máy in tem chưa kết nối — mở ☰ ▸ Máy in để kết nối'); }
        return 0;
      }
      try { return await inCacTem(ds); }
      catch (e) { bao('⚠ In tem lỗi: ' + chuLoi(e)); console.warn('[tem] in đơn lỗi', e); return 0; }
    }).catch(function () { return 0; });
  } catch (e) { console.warn('[tem]', e); return Promise.resolve(0); }
}
function inThu() {
  return xepHang(async function () {
    if (!daKetNoi() && !(await ketNoi(true))) return 0;
    try { var n = await inCacTem([temMau()]); bao('✅ Đã in tem thử'); return n; }
    catch (e) { bao('⚠ In thử lỗi: ' + chuLoi(e)); return 0; }
  });
}

// ════════ Giao diện: bảng «Máy in tem» ════════
var CSS = '' +
'.nbt-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:none;align-items:flex-end;justify-content:center;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}' +
'.nbt-ov.show{display:flex}' +
'.nbt-box{background:#fff;border-radius:28px 28px 0 0;padding:22px 20px 28px;width:100%;max-width:430px;max-height:88vh;overflow-y:auto;font-family:"Google Sans",system-ui,sans-serif;color:#111}' +
'@media(min-width:600px){.nbt-ov{align-items:center;padding:24px}.nbt-box{border-radius:28px}}' +
'.nbt-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}' +
'.nbt-h b{font-size:19px;font-weight:700}' +
'.nbt-x{width:36px;height:36px;border-radius:50%;border:none;background:#eee;color:#666;font-size:18px;cursor:pointer}' +
'.nbt-st{display:flex;align-items:center;gap:12px;background:#f5f5f5;border-radius:18px;padding:12px 12px 12px 16px}' +
'.nbt-dot{width:11px;height:11px;border-radius:50%;background:#c4c4c4;flex:none}' +
'.nbt-dot.on{background:#1e9e5a}.nbt-dot.wait{background:#f59e0b}' +
'.nbt-st div{flex:1;min-width:0}' +
'.nbt-st b{display:block;font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.nbt-st small{display:block;font-size:12px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.nbt-btn{border:none;border-radius:14px;padding:11px 16px;font:700 14px "Google Sans",system-ui,sans-serif;cursor:pointer;background:#1a4a2e;color:#fff;white-space:nowrap}' +
'.nbt-btn.nhat{background:#e8f5ee;color:#1a4a2e}.nbt-btn:disabled{opacity:.5}' +
'.nbt-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 4px;border-bottom:1px solid #f0f0f0;font-size:14.5px;font-weight:600}' +
'.nbt-row small{display:block;font-size:12px;color:#888;font-weight:500;margin-top:2px}' +
'.nbt-sw{width:46px;height:26px;border-radius:13px;background:#ccc;position:relative;border:none;cursor:pointer;flex:none;transition:background .2s}' +
'.nbt-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.25)}' +
'.nbt-sw.on{background:#1e6b3c}.nbt-sw.on::after{left:23px}' +
'.nbt-pv{display:flex;align-items:center;gap:14px;padding:16px 4px 6px}' +
'.nbt-pv canvas{width:168px;height:auto;border-radius:8px;box-shadow:0 6px 18px -6px rgba(0,0,0,.35);background:#fff;flex:none}' +
'.nbt-pv div{flex:1;font-size:12.5px;color:#777;line-height:1.5}' +
'.nbt-pv .nbt-btn{margin-top:8px}' +
'.nbt-box details{margin-top:8px}' +
'.nbt-box summary{cursor:pointer;font-size:13.5px;font-weight:700;color:#1a4a2e;padding:10px 4px;list-style:none}' +
'.nbt-box summary::-webkit-details-marker{display:none}' +
'.nbt-step{display:flex;align-items:center;gap:10px;font-weight:700}' +
'.nbt-step button{width:32px;height:32px;border-radius:50%;border:none;background:#e8f5ee;color:#1a4a2e;font-size:19px;font-weight:700;cursor:pointer;line-height:1}' +
'.nbt-in{width:64px;border:1.5px solid #e2e2e2;border-radius:12px;padding:8px;text-align:center;font:700 14px "Google Sans",system-ui,sans-serif;outline:none}' +
'.nbt-in:focus{border-color:#1e6b3c}';
var HTML = '' +
'<div class="nbt-box" role="dialog" aria-label="Máy in tem">' +
  '<div class="nbt-h"><b>Máy in tem</b><button class="nbt-x" data-v="dong" aria-label="Đóng">✕</button></div>' +
  '<div class="nbt-st"><i class="nbt-dot" data-o="dot"></i><div><b data-o="st1"></b><small data-o="st2"></small></div><button class="nbt-btn" data-v="noi"></button></div>' +
  '<div class="nbt-row"><span>Tự in tem khi thanh toán<small>Mỗi ly một tem, đơn To Go ghi «Mang đi»</small></span><button class="nbt-sw" data-v="tuin" aria-label="Tự in tem"></button></div>' +
  '<div class="nbt-pv"><canvas data-o="cv" width="320" height="240"></canvas><div>Giấy 40 × 30 mm<br>Độ đậm <span data-o="dam2"></span>/5<br><button class="nbt-btn nhat" data-v="thu">In thử</button></div></div>' +
  '<details><summary>Chỉnh thêm ▾</summary>' +
    '<div class="nbt-row"><span>Độ đậm<small>1 nhạt · 5 đậm nhất</small></span><span class="nbt-step"><button data-v="dam-">−</button><span data-o="dam"></span><button data-v="dam+">+</button></span></div>' +
    '<div class="nbt-row"><span>Lề trên (mm)<small>Hình in thấp quá → tăng</small></span><input class="nbt-in" data-o="ly" inputmode="decimal"></div>' +
    '<div class="nbt-row"><span>Đẩy ngang (mm)<small>Lệch trái → tăng, lệch phải → số âm</small></span><input class="nbt-in" data-o="lx" inputmode="text"></div>' +
    '<div class="nbt-row" style="border:none"><span>Về mặc định<small>40 × 30 mm · đậm 5 · lề 4,5 / 2</small></span><button class="nbt-btn nhat" data-v="macdinh">Đặt lại</button></div>' +
  '</details>' +
'</div>';

var ov = null, O = {};
function dung() {
  if (ov) return;
  var st = document.createElement('style'); st.id = 'niimtem-css'; st.textContent = CSS; document.head.appendChild(st);
  ov = document.createElement('div'); ov.className = 'nbt-ov'; ov.innerHTML = HTML;   // HTML tĩnh, không chứa dữ liệu ngoài
  document.body.appendChild(ov);
  [].forEach.call(ov.querySelectorAll('[data-o]'), function (el) { O[el.getAttribute('data-o')] = el; });
  ov.addEventListener('click', function (e) {
    if (e.target === ov) { dong(); return; }
    var b = e.target.closest('[data-v]'); if (!b) return;
    var v = b.getAttribute('data-v');
    if (v === 'dong') dong();
    else if (v === 'noi') { if (daKetNoi()) ngat(); else ketNoi(true); }
    else if (v === 'tuin') { S.tuIn = !S.tuIn; luuLai(); capNhatUi(); }
    else if (v === 'thu') inThu();
    else if (v === 'dam-' || v === 'dam+') { S.doDam = kep(S.doDam + (v === 'dam+' ? 1 : -1), 1, 5); luuLai(); capNhatUi(); }
    else if (v === 'macdinh') { S.lechY = 4.5; S.lechX = 2; S.doDam = 5; S.rong = 40; S.cao = 30; S.loaiGiay = 1; luuLai(); capNhatUi(true); }
  });
  function doiLe() {
    S.lechY = kep(Math.round(soMm(O.ly.value, 4.5) * 10) / 10, 0, 12);
    S.lechX = kep(Math.round(soMm(O.lx.value, 2) * 10) / 10, -10, 10);
    luuLai(); capNhatUi(true);
  }
  O.ly.addEventListener('change', doiLe); O.lx.addEventListener('change', doiLe);
}
function capNhatUi(ghiO) {
  var tt = trangThai();
  try { var ch = CH.cham && document.getElementById(CH.cham); if (ch) ch.style.background = tt === 'on' ? '#1e9e5a' : tt === 'wait' ? '#f59e0b' : '#c4c4c4'; } catch (e) {}
  if (!ov) return;
  O.dot.className = 'nbt-dot' + (tt === 'off' ? '' : ' ' + tt);
  var khongBt = !navigator.bluetooth;
  O.st1.textContent = tt === 'on' ? 'Đã kết nối ' + tenMay : tt === 'wait' ? 'Đang kết nối…' : 'Chưa kết nối';
  O.st2.textContent = tt === 'on'
    ? [pin !== null ? 'Pin ' + pin + '%' : '', coChip === false ? 'Giấy không chip (~5 giây/tem)' : coChip ? 'Giấy có chip' : ''].filter(Boolean).join(' · ') || 'Sẵn sàng in'
    : khongBt ? 'Trình duyệt không có Bluetooth — dùng Chrome' : 'Bật máy in B1 rồi bấm Kết nối';
  var bn = ov.querySelector('[data-v="noi"]');
  bn.textContent = tt === 'on' ? 'Ngắt' : 'Kết nối'; bn.disabled = tt === 'wait' || (khongBt && tt !== 'on');
  bn.className = 'nbt-btn' + (tt === 'on' ? ' nhat' : '');
  ov.querySelector('[data-v="tuin"]').className = 'nbt-sw' + (S.tuIn ? ' on' : '');
  O.dam.textContent = S.doDam; O.dam2.textContent = S.doDam;
  if (ghiO || document.activeElement !== O.ly) O.ly.value = S.lechY;
  if (ghiO || document.activeElement !== O.lx) O.lx.value = S.lechX;
  veCaNhan(temMau(), O.cv);
}
function mo() { dung(); capNhatUi(true); ov.classList.add('show'); napPhong().then(function () { if (ov) capNhatUi(); }); }
function dong() { if (ov) ov.classList.remove('show'); }

window.NiimTem = {
  init: function (ch) { ch = ch || {}; if (ch.quan) CH.quan = ch.quan; if (ch.toast) CH.toast = ch.toast; if (ch.cham) CH.cham = ch.cham; capNhatUi(); },
  mo: mo, dong: dong, inDon: inDon, inThu: inThu,
  daKetNoi: daKetNoi,
  // Cho kiểm thử: dựng nội dung / hình tem mà không cần máy in.
  _temCuaDon: temCuaDon, _veTem: veTem, _veCaNhan: veCaNhan, _caiDat: S
};
})();
