// Tách từ posgieo.html dòng 2998–3219, 3401–3411, 3472–3631, 5313–6007, 7006–7213 (tools/tach_posgieo/chuyen.js, 2026-10-25). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_printer.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).printer = 'dang';

class XprinterWNN58E {
  constructor() {
    this.port = null;
    this.writer = null;
    this.baudRate = 9600;
    this.connected = false;
    this.paperWidthPx = 384; // 58mm ~ 384 dot @203dpi (chuẩn phổ biến của dòng máy này)
  }

  static get COMMON_BAUD_RATES() { return [9600, 19200, 38400, 57600, 115200]; }

  // BẮT BUỘC gọi trong 1 sự kiện click thật của người dùng (giới hạn của Web Serial API)
  async connect(preferredBaud) {
    if (!('serial' in navigator)) {
      throw new Error('Trình duyệt không hỗ trợ Web Serial API — cần dùng Chrome/Edge trên máy tính');
    }
    this.port = await navigator.serial.requestPort();
    return this._openWithBaudSweep(preferredBaud);
  }

  // KHÔNG cần gesture — chỉ hoạt động nếu cổng đã từng được cấp quyền ở phiên trước
  async reconnectFromGrantedPorts() {
    if (!('serial' in navigator)) return false;
    const ports = await navigator.serial.getPorts();
    if (!ports.length) return false;
    this.port = ports[0];
    try { await this._openWithBaudSweep(); return true; }
    catch (e) { return false; }
  }

  async _openWithBaudSweep(preferredBaud) {
    const bauds = preferredBaud
      ? [preferredBaud, ...XprinterWNN58E.COMMON_BAUD_RATES.filter(b => b !== preferredBaud)]
      : XprinterWNN58E.COMMON_BAUD_RATES;
    let lastErr = null;
    for (const baud of bauds) {
      try {
        await this.port.open({ baudRate: baud });
        this.baudRate = baud;
        this.writer = this.port.writable.getWriter();
        this.connected = true;
        return { baudRate: baud };
      } catch (e) {
        lastErr = e;
        try { await this.port.close(); } catch (_) {}
      }
    }
    throw lastErr || new Error('Không mở được cổng ở bất kỳ baudrate nào');
  }

  async disconnect() {
    try {
      if (this.writer) { try { await this.writer.close(); } catch (_) {} this.writer.releaseLock && this.writer.releaseLock(); }
      if (this.port) await this.port.close();
    } catch (e) { console.warn('[XprinterWNN58E] lỗi khi ngắt kết nối', e); }
    this.writer = null; this.port = null; this.connected = false;
  }

  async _write(bytes) {
    if (!this.writer) throw new Error('Máy in chưa kết nối');
    await this.writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  }

  async initPrinter() { await this._write([0x1B, 0x40]); } // ESC @
  async feed(lines = 1) { for (let i = 0; i < lines; i++) await this._write([0x0A]); }

  // Mở két tiền — chuẩn ESC/POS: ESC p m t1 t2 (0x1B 0x70 0x00 0x19 0xFA).
  // m=0 chọn chân (pin 2) mà đa số két dùng dây RJ11/RJ12 nối qua máy in đều đấu
  // vào; t1/t2 là độ dài xung mở/đóng, để 25/250 (đơn vị 2ms) là mức phổ biến
  // nhất tương thích hầu hết két trên thị trường — không có cách "dò" universal
  // nào khác ngoài thử trên máy thật.
  async openDrawer() { await this._write([0x1B, 0x70, 0x00, 0x19, 0xFA]); }

  // In canvas dạng raster GS v 0 — chia theo dải ~200 dòng để tránh buffer quá lớn
  async printCanvasRaster(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    const bytesPerRow = Math.ceil(w / 8);
    const BAND = 200;

    for (let y0 = 0; y0 < h; y0 += BAND) {
      const bandH = Math.min(BAND, h - y0);
      const data = new Uint8Array(bytesPerRow * bandH);
      for (let y = 0; y < bandH; y++) {
        for (let x = 0; x < w; x++) {
          const idx = ((y0 + y) * w + x) * 4;
          const gray = img[idx] * 0.3 + img[idx + 1] * 0.59 + img[idx + 2] * 0.11;
          const isBlack = img[idx + 3] > 128 && gray < 160;
          if (isBlack) data[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
        }
      }
      const header = [0x1D, 0x76, 0x30, 0x00,
        bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
        bandH & 0xFF, (bandH >> 8) & 0xFF];
      await this._write(header);
      await this._write(data);
    }
  }

  async printTestPage() {
    const content = [
      { type: 'text', text: 'IN THỬ MÁY IN', size: 26, align: 'center', bold: true },
      { type: 'divider', style: 'dashed' },
      { type: 'text', text: `Xprinter WNN58E — ${this.baudRate} baud`, size: 15, align: 'center' },
      { type: 'text', text: vnDate().toLocaleString('vi-VN'), size: 13, align: 'center' },
      { type: 'divider', style: 'solid' },
      { type: 'text', text: 'Chào Gieo Gieo — tiếng Việt có dấu: ăâêôơưđ', size: 15, align: 'center' },
      ...buildFooterLines(this.layout),
    ];
    const canvas = renderReceiptCanvas(content, this.paperWidthPx);
    await this.initPrinter();
    await this.printCanvasRaster(canvas);
    await this.feed(4);
  }
}

// ============================================================
// Máy in Bill — kết nối Bluetooth trực tiếp qua app Android riêng (SDK Xprinter)
// ============================================================
// Dùng khi chạy TRONG app bọc riêng (window.AndroidPrinter tồn tại) — vì WebView KHÔNG hỗ trợ
// Web Serial API như Chrome máy tính/điện thoại thường. Máy in cần được ghép nối (pair) Bluetooth
// từ trước trong phần Cài đặt Bluetooth của tablet, app chỉ chọn trong danh sách đã ghép nối.
// Giữ nguyên cấu trúc "engine" (connect/disconnect/initPrinter/feed/printCanvasRaster) giống hệt
// XprinterWNN58E để cắm thẳng vào POSPrinter mà không phải sửa logic in hoá đơn.
class XprinterBillBridgeEngine {
  constructor() {
    this.paperWidthPx = 384;
    this.connected = false;
    this.baudRate = null; // không áp dụng cho đường Bluetooth qua app, giữ null để UI tự ẩn
  }

  async connect(mac) {
    if (!window.AndroidPrinter) throw new Error('Chức năng này chỉ hoạt động trong app Android');
    window.AndroidPrinter.connectBillPrinterBluetooth(mac);
    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        let ok = false;
        try { ok = window.AndroidPrinter.isBillPrinterAvailable(); } catch (e) {}
        if (ok || tries >= 10) {
          clearInterval(timer);
          this.connected = ok;
          if (ok) {
            POSPrinter.saveLayout({ billPrinterMac: mac });
            resolve({ baudRate: null });
          } else {
            reject(new Error('Không kết nối được — kiểm tra máy in đã bật & ghép nối Bluetooth chưa'));
          }
        }
      }, 500);
    });
  }

  async disconnect() {
    try { window.AndroidPrinter && window.AndroidPrinter.disconnectBillPrinter(); } catch (e) {}
    this.connected = false;
  }

  _sendRaw(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    window.AndroidPrinter.printBillRawBytes(btoa(binary));
  }

  async initPrinter() { this._sendRaw(new Uint8Array([0x1B, 0x40])); } // ESC @

  // Cùng chuẩn ESC/POS như engine Web Serial ở trên — xem chú thích ở đó.
  async openDrawer() { this._sendRaw(new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])); }

  async feed(lines = 1) {
    const arr = [];
    for (let i = 0; i < lines; i++) arr.push(0x0A);
    this._sendRaw(new Uint8Array(arr));
  }

  // Logic dựng raster giống hệt XprinterWNN58E.printCanvasRaster — chỉ khác đường gửi cuối cùng
  async printCanvasRaster(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    const bytesPerRow = Math.ceil(w / 8);
    const BAND = 200;

    for (let y0 = 0; y0 < h; y0 += BAND) {
      const bandH = Math.min(BAND, h - y0);
      const data = new Uint8Array(bytesPerRow * bandH);
      for (let y = 0; y < bandH; y++) {
        for (let x = 0; x < w; x++) {
          const idx = ((y0 + y) * w + x) * 4;
          const gray = img[idx] * 0.3 + img[idx + 1] * 0.59 + img[idx + 2] * 0.11;
          const isBlack = img[idx + 3] > 128 && gray < 160;
          if (isBlack) data[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
        }
      }
      const header = new Uint8Array([0x1D, 0x76, 0x30, 0x00,
        bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
        bandH & 0xFF, (bandH >> 8) & 0xFF]);
      this._sendRaw(header);
      this._sendRaw(data);
    }
  }

  async printTestPage() {
    const content = [
      { type: 'text', text: 'IN THỬ MÁY IN', size: 26, align: 'center', bold: true },
      { type: 'divider', style: 'dashed' },
      { type: 'text', text: 'Xprinter WNN58E — Bluetooth (app)', size: 15, align: 'center' },
      { type: 'text', text: vnDate().toLocaleString('vi-VN'), size: 13, align: 'center' },
      { type: 'divider', style: 'solid' },
      { type: 'text', text: 'Chào Gieo Gieo — tiếng Việt có dấu: ăâêôơưđ', size: 15, align: 'center' },
      ...buildFooterLines(POSPrinter.layout),
    ];
    const canvas = renderReceiptCanvas(content, this.paperWidthPx);
    await this.initPrinter();
    await this.printCanvasRaster(canvas);
    await this.feed(4);
  }
}

function loadPrinterLayout() {
  // Đọc cache local trước (để có ngay khi mở app, tránh giật/trắng khi chưa kịp tải Firebase)
  const def = { paperWidth: 58, showLogo: true, feedLinesAfter: 3, fontSizeTitle: 28, fontSizeBody: 16, copies: 1, footerText: '', footerBold: false,
    billPrinterMac: null,  // MAC máy in Bill (Bluetooth) — nhớ để mọi máy bán hàng tự kết nối lại, không cần ghép lại
    temPrinterMac: null,   // MAC máy in Tem (LAN) — dùng để nhận diện đúng máy in khi IP đổi do DHCP
    temInvert: true };      // Đảo màu tem — mặc định BẬT (đúng chiều với thực tế máy in đang dùng)
  try {
    const raw = localStorage.getItem('pos_printer_layout_cache');
    return raw ? Object.assign(def, JSON.parse(raw)) : def;
  } catch (e) { return def; }
}

const POSPrinter = {
  engine: null,
  connected: false,
  baudRate: null,
  autoPrintEnabled: localStorage.getItem('pos_auto_print') !== 'false',
  layout: loadPrinterLayout(),
  _queue: Promise.resolve(), // queue in tuần tự — tránh chồng lệnh giờ cao điểm (plan mục 5.2)

  async connect() {
    if (!this.engine) this.engine = new XprinterWNN58E();
    const { baudRate } = await this.engine.connect();
    this.connected = true; this.baudRate = baudRate;
    _updatePrinterStatusUI();
    return baudRate;
  },

  async tryReconnectSilently() {
    if (!this.engine) this.engine = new XprinterWNN58E();
    const ok = await this.engine.reconnectFromGrantedPorts().catch(() => false);
    this.connected = !!ok;
    if (ok) this.baudRate = this.engine.baudRate;
    _updatePrinterStatusUI();
    return this.connected;
  },

  // Kết nối máy in Bill qua Bluetooth trực tiếp bằng app Android riêng (dùng khi
  // window.AndroidPrinter tồn tại — thay thế Web Serial không hoạt động trong WebView)
  async connectBluetoothApp(mac) {
    this.engine = new XprinterBillBridgeEngine();
    const { baudRate } = await this.engine.connect(mac);
    this.connected = true; this.baudRate = baudRate;
    _updatePrinterStatusUI();
    return true;
  },

  // Tự thử kết nối lại bằng MAC đã lưu từ lần trước — gọi khi mở màn hình Máy in, không cần bấm
  async tryReconnectBluetoothAppSilently() {
    if (!window.AndroidPrinter) return false;
    const mac = this.layout.billPrinterMac;
    if (!mac) return false;
    try { await this.connectBluetoothApp(mac); return true; }
    catch (e) { return false; }
  },

  async disconnect() {
    if (this.engine) await this.engine.disconnect();
    this.connected = false;
    _updatePrinterStatusUI();
  },

  setAutoPrint(v) {
    this.autoPrintEnabled = !!v;
    localStorage.setItem('pos_auto_print', this.autoPrintEnabled ? 'true' : 'false');
  },

  saveLayout(partial) {
    this.layout = Object.assign({}, this.layout, partial);
    // ══════════════════════════════════════════════════════════════════════
    // [FIX-tem-wipe] ĐÂY LÀ NGUYÊN NHÂN GỐC của "bấm bill xong KHÔNG BAO GIỜ in tem".
    //
    // TRƯỚC ĐÂY dòng này là `.set(this.layout)` — set() GHI ĐÈ TOÀN BỘ node trên
    // Firebase: key nào không có trong object gửi lên là BỊ XOÁ khỏi cloud.
    //
    // Kịch bản xảy ra MỖI SÁNG mở app:
    //   1. App khởi động → `temAppDiscoverAndConnect(false)` chạy nền, ~2.2s sau
    //      quét thấy máy in tem → gọi `POSTemPrinter.setMac(mac)` → saveLayout().
    //   2. Nhưng lúc đó `syncPrinterLayoutFromCloud()` THƯỜNG CHƯA KỊP về (phải chờ
    //      đăng nhập Firebase + mạng), nên `this.layout` vẫn là bản cache cũ của
    //      RIÊNG máy tablet đó — bản cache này KHÔNG có key `temEnabled`.
    //   3. set() bắn nguyên bản cache thiếu key đó lên cloud → `temEnabled` BỊ XOÁ
    //      khỏi cloud, cho TOÀN BỘ máy trong quán.
    //   4. Mất `temEnabled` → getter rơi về localStorage → không có → coi như TẮT →
    //      `printOrderLabels()` return im lặng ở dòng `if (!this.enabled) return`.
    //
    // Đúng khớp triệu chứng: chỉ đường TỰ ĐỘNG lúc bấm bill đi qua cổng `enabled`,
    // còn in lại từ Lịch sử KHÔNG qua cổng này nên vẫn in được. Và nó tự lặp lại:
    // hôm nay bật tay, sáng mai tablet nào mở trước lại xoá đúng key đó lần nữa.
    //
    // update(partial) chỉ ghi ĐÚNG những key vừa đổi, không đụng tới key khác —
    // máy có cấu hình cũ không còn xoá được cấu hình của máy khác nữa.
    // ══════════════════════════════════════════════════════════════════════
    db.ref(PRINTER_LAYOUT_FB_PATH).update(partial).catch(err => {
      console.error('Lỗi lưu cấu hình in lên Firebase:', err);
      toast('⚠ Lưu online thất bại, đã lưu tạm trên máy này — kiểm tra mạng rồi lưu lại');
    });
    // Vẫn giữ cache local để mở app nhanh / phòng khi mất mạng
    try { localStorage.setItem('pos_printer_layout_cache', JSON.stringify(this.layout)); } catch (e) {}
  },

  getStatus() {
    return { connected: this.connected, baudRate: this.baudRate, autoPrintEnabled: this.autoPrintEnabled };
  },

  // [NEW-addon] In một nội dung tuỳ ý (phiếu bổ sung) — cùng hàng đợi với in bill để
  // không chen ngang giữa lúc máy in đang chạy một hoá đơn khác.
  printCustom(content) {
    this._queue = this._queue.then(() => this._doPrintCustom(content));
    return this._queue;
  },

  async _doPrintCustom(content) {
    if (!this.connected || !this.engine) throw new Error('Máy in chưa kết nối');
    const canvas = renderReceiptCanvas(content, this.engine.paperWidthPx);
    await this.engine.initPrinter();
    await this.engine.printCanvasRaster(canvas);
    await this.engine.feed(this.layout.feedLinesAfter != null ? this.layout.feedLinesAfter : 3);
  },

  // In 1 đơn — trả về Promise, dùng cho cả tự động lẫn "In lại" thủ công
  printOrder(order) {
    this._queue = this._queue.then(() => this._doPrint(order));
    return this._queue;
  },

  async _doPrint(order) {
    if (!this.connected || !this.engine) throw new Error('Máy in chưa kết nối');
    const content = buildReceiptContent(order, this.layout);
    const copies = Math.max(1, Math.min(5, this.layout.copies || 1));
    for (let i = 0; i < copies; i++) {
      const thisCopy = (copies > 1 && i > 0)
        ? [...content, { type: 'text', text: `(LIÊN ${i + 1})`, size: 12, align: 'center' }]
        : content;
      const canvas = renderReceiptCanvas(thisCopy, this.engine.paperWidthPx);
      await this.engine.initPrinter();
      await this.engine.printCanvasRaster(canvas);
      await this.engine.feed(this.layout.feedLinesAfter != null ? this.layout.feedLinesAfter : 3);
    }
  },

  // Gọi ngay sau khi lưu đơn thành công — KHÔNG bao giờ chặn/ảnh hưởng luồng bán hàng,
  // lỗi in chỉ toast cảnh báo nhẹ (xem plan mục 2)
  autoPrintIfEnabled(order) {
    if (!this.autoPrintEnabled || !this.connected) return;
    this.printOrder(order).catch(() => {
      toast('⚠ Không in được hoá đơn' + (order.billCode ? ' ' + order.billCode : '') + ' — máy in mất kết nối');
    });
  },

  // Mở két tiền — CHỈ gửi cho máy in Bill (két đấu dây qua cổng máy này), máy in
  // tem không liên quan nên không đụng tới, tránh chồng chéo 2 tính năng.
  // Tách RIÊNG khỏi autoPrintEnabled: "có in giấy hay không" và "có cần mở két
  // hay không" là hai nhu cầu độc lập — nhân viên tắt in giấy để đỡ tốn giấy vẫn
  // phải mở được két khi thu tiền mặt. Chỉ cần máy in đang kết nối là đủ, vì két
  // vật lý đấu dây xuyên qua máy in, không có đường nào khác để bắn lệnh tới nó.
  // Nơi gọi (autoPrintIfEnabled ở confirmPay) tự quyết định CÓ NÊN gọi hàm này
  // hay không dựa trên phương thức thanh toán — xem hasCashPortionPOS().
  openCashDrawerIfConnected() {
    if (!this.connected || !this.engine || typeof this.engine.openDrawer !== 'function') return;
    this.engine.openDrawer().catch(err => {
      console.warn('[Két tiền] Gửi lệnh mở két thất bại:', err);
      // Không toast — mở két là tiện ích phụ, báo lỗi giữa lúc đang thanh toán
      // chỉ gây hoang mang không cần thiết cho nhân viên.
    });
  },

  async printTestPage() {
    if (!this.connected || !this.engine) throw new Error('Máy in chưa kết nối');
    return this.engine.printTestPage();
  }
};

function canvasToMonoBitmap(canvas, invert) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h).data;
  const bytesPerRow = Math.ceil(w / 8);
  const bitmap = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const gray = img[idx] * 0.3 + img[idx + 1] * 0.59 + img[idx + 2] * 0.11;
      let isBlack = img[idx + 3] > 128 && gray < 160;
      if (invert) isBlack = !isBlack;
      if (isBlack) bitmap[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
    }
  }
  return { w, h, bytesPerRow, bitmap };
}

function _textToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
  return bytes;
}

function _concatBytes(arrays) {
  let total = 0;
  arrays.forEach(a => total += a.length);
  const out = new Uint8Array(total);
  let offset = 0;
  arrays.forEach(a => { out.set(a, offset); offset += a.length; });
  return out;
}

// Chuẩn ESC/POS raster (ESC @ khởi tạo + GS v 0) — dùng cho máy in tem loại ESC/POS thuần,
// KHÔNG tự canh gap giữa các tem (máy nào có mắt đọc gap thật sự thì gần như chắc chắn cần
// dùng TSPL bên dưới thay vì cái này).
function canvasToEscPosBytes(canvas, copies) {
  const { bytesPerRow, h, bitmap } = canvasToMonoBitmap(canvas, POSTemPrinter.getInvert());
  const header = [0x1B, 0x40, // ESC @ — khởi tạo máy in
    0x1D, 0x76, 0x30, 0x00,   // GS v 0 — in raster bitmap, m=0 (bình thường)
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
    h & 0xFF, (h >> 8) & 0xFF];
  const one = _concatBytes([new Uint8Array(header), bitmap, new Uint8Array([0x0A, 0x0A])]);
  const n = Math.max(1, copies || 1);
  const parts = []; for (let i = 0; i < n; i++) parts.push(one);
  return _concatBytes(parts);
}

// Chuẩn TSPL (TSC Printer Language) — chuẩn của ĐA SỐ máy in tem/decal có mắt đọc gap.
// SIZE khai báo đúng khổ tem 40x30mm, GAP khai báo khoảng trắng thật giữa 2 tem (đo bằng
// thước, đơn vị mm — lưu trong ô "Khoảng gap" ở màn cấu hình) để máy tự canh đúng từng tem,
// không in đè lên tem kế tiếp.
//
// [FIX-tem-tear] Nguyên nhân thật của "lề trên quá to / tem dài bị đè sang tem kế tiếp":
// khoảng cách vật lý CỐ ĐỊNH giữa đầu in và dao xé răng cưa (thiết kế phần cứng, không đổi).
// Sau khi xé tem, đầu giấy đang nằm ở vị trí dao xé — nếu máy KHÔNG tự lùi giấy lại đúng
// khoảng đó trước khi in tiếp, phần khoảng cách này sẽ luôn bị bỏ trắng ở đầu mỗi tem, đẩy
// nội dung xuống và làm tem dài tràn sang tem kế. `SET TEAR ON` báo cho máy tự canh + lùi
// giấy đúng khoảng cách đầu in↔dao xé trước mỗi lần in — đây là lệnh TSPL chuẩn dành riêng
// cho máy in xé tay (tear-bar), không phải máy có dao cắt/tự bóc tem.
function canvasToTsplBytes(canvas, copies) {
  const { bytesPerRow, h, bitmap } = canvasToMonoBitmap(canvas, POSTemPrinter.getInvert());
  // [FIX-tem-settings-cloud] Đọc qua getter (cloud → localStorage → mặc định) thay vì đọc
  // thẳng localStorage, để gap/offset dùng khi sinh lệnh TSPL luôn khớp màn cấu hình.
  const gap = POSTemPrinter.getGapMm();       // mặc định 2mm — chỉnh trong màn cấu hình cho khớp tem thật
  // Mặc định 1.5mm — giá trị đã test thật trên máy (khoảng đầu in↔dao xé), chỉnh trong màn
  // cấu hình ("Offset dọc") nếu máy khác cần số khác.
  const offset = POSTemPrinter.getOffsetMm();
  const n = Math.max(1, copies || 1);
  const header = _textToBytes(
    `SIZE ${TEM_LABEL_WIDTH_MM} mm,${TEM_LABEL_HEIGHT_MM} mm\r\n` +
    `GAP ${gap} mm,0 mm\r\n` +
    `SET TEAR ON\r\n` +
    `OFFSET ${offset} mm\r\n` +
    `DIRECTION 0\r\n` +
    `REFERENCE 0,0\r\n` +
    `CLS\r\n` +
    `BITMAP 0,0,${bytesPerRow},${h},0,`
  );
  const footer = _textToBytes(`\r\nPRINT 1,${n}\r\n`);
  return _concatBytes([header, bitmap, footer]);
}

// Gửi mảng byte thô sang app Android riêng (wrapper) qua cầu nối window.AndroidPrinter —
// app bọc có tích hợp sẵn SDK Xprinter, in thẳng qua LAN. Đây là ĐƯỜNG IN TEM DUY NHẤT.
// [FIX-bridge-v2] Trả về KẾT QUẢ thật thay vì nuốt im lặng.
// Cầu nối v2 (APK 2.0+) trả boolean: false = chắc chắn không gửi được (chưa kết nối).
// Cầu nối v1 (APK cũ) trả undefined — coi như đã gửi, giữ nguyên hành vi cũ để không vỡ.
// [FIX-cold-socket] Mốc lần cuối CÓ GỬI được byte xuống cầu nối. Dùng để biết
// socket đã nhàn rỗi bao lâu — thứ duy nhất đáng tin, vì isAvailable() chỉ đọc một
// biến trong app chứ không hề thăm dò socket thật.
let _temLastSendAt = 0;

function sendBytesToXprinterApp(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  const r = window.AndroidPrinter.printRawBytes(b64);
  const ok = r === undefined ? true : !!r;
  if (ok) _temLastSendAt = Date.now();
  return ok;
}

// [REMOVE-rawbt] Có cầu nối in tem hay không — dữ kiện NHỊ PHÂN, chắc chắn, không liên quan
// tới trạng thái mạng hay socket. Khác hẳn isAvailable() (đoán xem socket còn sống không, hay
// nói dối). Chỉ dùng cái này để chặn; tuyệt đối không dùng isAvailable() để chặn.
function _temBridgeReady() {
  return !!(window.AndroidPrinter && typeof window.AndroidPrinter.printRawBytes === 'function');
}

// ══════════════════════════════════════════════════════════════════════════
// [FIX-bridge-v2] NÓI CHUYỆN VỚI CẦU NỐI ANDROID THEO PHIÊN BẢN
//
// Trong lúc triển khai, tablet sẽ có máy đã cài APK mới máy chưa. Trang web tự nhận ra
// mình đang chạy trên bản nào rồi chọn đường phù hợp — KHÔNG được vỡ trên APK cũ.
//
//   v1 (APK 1.0): connectPrinter() là thao tác PHÁ HOẠI — mỗi lần gọi tạo một kết nối mới
//        đè lên cái cũ mà không đóng, làm rò rỉ socket và chiếm mất phiên TCP duy nhất của
//        máy in. Trên bản này phải gọi càng ít càng tốt: KHÔNG watchdog nền, chỉ nối lại
//        đúng lúc sắp in.
//   v2 (APK 2.0+): connectPrinter() đóng cái cũ trước, chống gọi chồng, và không làm gì cả
//        nếu đã nối đúng IP đó. Ngoài ra có báo lỗi thật (getTemStatus) và keepalive native.
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// [FIX-bridge-detect] DÒ THEO NĂNG LỰC, KHÔNG DÒ THEO SỐ PHIÊN BẢN
//
// TRIỆU CHỨNG THẬT (quán báo): tablet đang chạy APK MỚI NHẤT nhưng tab Máy in tem
// vẫn ghi "✅ Đã kết nối · app CŨ (v1 — cần cài lại APK)", và tem không tự in sau
// khi thanh toán — nhân viên phải vào Lịch sử đơn in lại từng tem.
//
// NGUYÊN NHÂN: cả hệ thống đặt cược vào ĐÚNG MỘT phép thử —
//     typeof window.AndroidPrinter.getBridgeVersion === 'function'
// Chỉ cần app đặt tên khác (getVersion), phơi ra dạng thuộc tính thay vì hàm, hay
// trả về chuỗi kiểu "2.0"/"v2" (Number("v2") = NaN → `|| 1`) là cả trang web kết
// luận nhầm "app v1". Và kết luận nhầm đó KHÔNG chỉ sai một dòng chữ, nó tắt hàng
// loạt thứ đang giữ cho việc in chạy được:
//     · _temSyncKeepAlive()          → không gửi gói giữ socket
//     · startTemConnectionWatchdog() → không có ai nối lại nền
//     · _temStatus()                 → không đọc được lỗi thật từ app
//
// Hệ quả nối tiếp, đúng khớp triệu chứng: máy in tem LAN tự đóng socket sau 30–90
// giây nhàn rỗi. Không keepalive, không watchdog → giữa hai bill là socket chết.
// Lúc bấm thanh toán, isAvailable() vẫn báo "còn sống" (nó chỉ phản ánh một biến
// trong app, không hề thăm dò socket), nên không ai nối lại; printRawBytes() ghi
// byte vào socket chết và trả về undefined — mã cũ coi undefined là THÀNH CÔNG.
// Kết quả: không tem nào ra, không một dòng cảnh báo. Còn khi nhân viên mở tab
// Máy in / Lịch sử thì các màn đó tự gọi nối lại, nên in tay lại được — che mất
// nguyên nhân thật.
//
// CÁCH CHỮA: hỏi app "anh LÀM ĐƯỢC GÌ", đừng hỏi "anh phiên bản mấy". Từng năng
// lực được dò riêng, thiếu cái nào chỉ tắt đúng cái đó. Số phiên bản chỉ còn để
// hiển thị cho người đọc, không điều khiển gì nữa.
// ══════════════════════════════════════════════════════════════════════════
function _temFn(name) {
  try { return !!(window.AndroidPrinter && typeof window.AndroidPrinter[name] === 'function'); }
  catch (e) { return false; }
}

// Ba năng lực chỉ có từ APK 2.0. Có đủ = chạy được mọi thứ; có một phần = dùng
// đúng phần đó; không có cái nào = thật sự là cầu nối cũ.
const TEM_V2_FNS = ['getTemStatus', 'setTemKeepAlive', 'resetTemCounters'];

function _temV2FnCount() { return TEM_V2_FNS.filter(_temFn).length; }

// Trả về 0 khi KHÔNG BIẾT — khác hẳn "chắc chắn là v1". Chấp nhận cả hàm lẫn
// thuộc tính, cả tên phụ, và bóc số ra khỏi chuỗi kiểu "v2.0".
function _temBridgeVersion() {
  try {
    const ap = window.AndroidPrinter;
    if (!ap) return 0;
    let raw = null;
    if (typeof ap.getBridgeVersion === 'function') raw = ap.getBridgeVersion();
    else if (ap.getBridgeVersion != null) raw = ap.getBridgeVersion;
    else if (typeof ap.getVersion === 'function') raw = ap.getVersion();
    else if (ap.bridgeVersion != null) raw = ap.bridgeVersion;
    const n = parseFloat(String(raw == null ? '' : raw).replace(/[^0-9.]/g, ''));
    if (isFinite(n) && n > 0) return n;
  } catch (e) {}
  return 0;
}

// "Có dùng được đường v2 không" — CĂN CỨ VÀO HÀM CÓ THẬT trước, số phiên bản sau.
// App mới mà quên khai getBridgeVersion vẫn được đối xử đúng như app mới.
function _temHasV2() {
  if (!_temBridgeReady()) return false;
  if (_temV2FnCount() > 0) return true;
  return _temBridgeVersion() >= 2;
}

// Trạng thái thật của máy in tem từ phía app. null = app không cung cấp.
// Dò THẲNG hàm cần dùng thay vì đi qua _temHasV2(): app có thể có getTemStatus mà
// thiếu keepalive (hoặc ngược lại), gộp chung lại là tự bỏ mất năng lực đang có.
function _temStatus() {
  if (!_temFn('getTemStatus')) return null;
  try { return JSON.parse(window.AndroidPrinter.getTemStatus() || 'null'); }
  catch (e) { return null; }
}

// Chờ app gửi hết những gì đang xếp hàng. Đây là CHỐNG TRÀN BUFFER thật sự: nhịp in tự
// giãn theo tốc độ máy in nuốt dữ liệu, thay vì cứ 500ms bắn một tem bất kể máy in có kịp
// hay không (đơn 6 ly trước đây nạp ~58KB vào một buffer chỉ vài chục KB — module LAN đầy
// buffer là đóng thẳng socket, đó là lúc "mất kết nối khi vừa bấm bill").
async function _temWaitDrain(maxMs) {
  const st0 = _temStatus();
  if (!st0) return;                       // v1: không biết được, phía gọi tự nghỉ cố định
  const t0 = Date.now();
  for (;;) {
    const st = _temStatus();
    if (!st || (st.pending || 0) <= 0) return;
    if (Date.now() - t0 > (maxMs || 8000)) return;
    await new Promise(r => setTimeout(r, 120));
  }
}

// ── Keepalive: giữ socket sống để KHÔNG BAO GIỜ phải nối lại ────────────────
// Máy in tem tự đóng socket sau 30–90 giây nhàn rỗi. Mỗi lần đóng là một lần phải nối lại,
// mà nối lại là thao tác rủi ro nhất trong cả hệ thống này. Rẻ hơn nhiều: cứ 20 giây gửi
// một gói vô hại cho socket khỏi rơi vào trạng thái nhàn rỗi.
//
// Bộ đếm giờ đặt ở NATIVE chứ không phải setInterval() ở đây, vì timer JavaScript trong
// WebView bị hệ điều hành bóp lại khi app chạy nền — đúng lúc cần giữ kết nối nhất.
//
// Nội dung gói phải do phía web quyết định vì chỉ ở đây mới biết đang chạy TSPL hay ESC/POS:
// với TSPL thì "\r\n" là dòng rỗng vô hại, còn với ESC/POS thì đúng ký tự đó là lệnh xuống
// dòng — bật lên sẽ nhả giấy mỗi 20 giây.
let _temKeepAliveSig = null;

function _temSyncKeepAlive() {
  if (!_temBridgeReady() || !_temFn('setTemKeepAlive')) return;
  const sig = POSTemPrinter.getEngine() === 'escpos' ? 'off' : 'tspl';
  if (sig === _temKeepAliveSig) return;   // không đổi thì khỏi gọi lại
  try {
    if (sig === 'off') window.AndroidPrinter.setTemKeepAlive('', 0);
    else window.AndroidPrinter.setTemKeepAlive(btoa('\r\n'), 20000);
    _temKeepAliveSig = sig;
  } catch (e) { console.warn('[tem] không đặt được keepalive', e); }
}

// Cầu nối in tem — song song, độc lập với POSPrinter (in bill). Bật/tắt riêng, cấu hình riêng
// (ngôn ngữ lệnh, DPI, gap), không phụ thuộc trạng thái/cấu hình của máy in bill.
// ══════════════════════════════════════════════════════════════════════════
// [FIX-tem-settings-cloud] NGUYÊN NHÂN "in tem không còn tự động sau khi deploy HTML mới":
//
// Công tắc "Tự động in tem" TRƯỚC ĐÂY chỉ nằm trong localStorage riêng của từng máy
// (`pos_tem_print_enabled`) và MẶC ĐỊNH TẮT — trong khi mọi cấu hình tem khác (MAC máy in,
// đảo màu) lại lưu trên cloud `printer_layout_gieogieo` dùng chung. localStorage gắn theo
// ORIGIN (tên miền) của trang: đổi domain Firebase Hosting, đổi đường dẫn, hay WebView bị
// xoá dữ liệu lúc cài lại APK — là toàn bộ nhóm localStorage này về mặc định, tức công tắc
// in tem TỰ TẮT. Còn MAC/đảo màu vẫn lấy lại được từ cloud nên máy in vẫn kết nối ngon lành,
// che mất nguyên nhân thật.
//
// Hệ quả khớp CHÍNH XÁC triệu chứng: printOrderLabels() là đường DUY NHẤT bị chặn bởi công
// tắc này (`if (!this.enabled) return;`) nên in tem tự động lúc bấm bill chết lặng, không
// báo gì; còn in lại tem từ tab Lịch sử (temReprintAll/temReprintOneItem) và tem lô chế biến
// đều KHÔNG qua công tắc nên vẫn in bình thường.
//
// Cách chữa: đưa nốt công tắc + 4 thông số phần cứng (ngôn ngữ lệnh, DPI, gap, offset) lên
// cloud giống các cấu hình tem khác, để không bao giờ tự về mặc định nữa. Vẫn ĐỌC DỰ PHÒNG
// từ localStorage khi cloud chưa có giá trị — nhờ vậy máy nào đang có thông số đã canh chỉnh
// thật thì giữ nguyên, không bị bản vá này ghi đè.
// ══════════════════════════════════════════════════════════════════════════
function _temLocal(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

function _temLocalSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

// [FIX-tem-default-0] BẪY CŨ: localStorage.getItem() trả về `null` khi CHƯA từng lưu, mà
// Number(null) === 0 — nên đoạn `const g = Number(localStorage.getItem('pos_tem_gap_mm'));
// return isFinite(g) && g >= 0 ? g : 2;` KHÔNG BAO GIỜ chạm tới mặc định 2mm: máy chưa cấu
// hình luôn nhận gap = 0mm (và offset = 0mm thay vì 1.5mm). Đây chính là loại sai số gây tem
// in đè/lệch lề trên máy mới hoặc máy vừa bị mất localStorage. Hàm này coi null/rỗng là CHƯA
// ĐẶT (trả NaN) để giá trị mặc định thật sự có tác dụng.
function _temNum(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  return Number(raw);
}

const POSTemPrinter = {
  // Cloud là nguồn chính; localStorage chỉ là dự phòng khi cloud chưa từng lưu.
  // [FIX-tem-wipe] Mặc định giờ là BẬT (trước đây là TẮT). Lý do: quán này LUÔN cần
  // tem cho mọi ly — trạng thái "chưa cấu hình" đúng ra phải là in, không phải im lặng.
  // Mặc định TẮT biến mọi sự cố mất cấu hình (xoá dữ liệu app, cài lại APK, đổi domain,
  // hay lỗi ghi đè cloud ở trên) thành "máy in hỏng" mà không có dấu hiệu gì. Muốn tắt
  // thật thì vào Máy in ▸ tab Máy in Tem gạt công tắc — lúc đó mới ghi false lên cloud.
  // ══════════════════════════════════════════════════════════════════════
  // [FIX-tem-enabled-pin] TRƯỚC ĐÂY đọc `POSPrinter.layout.temEnabled`, mà `layout` là bản
  // TRỘN giữa cache localStorage và cloud:
  //     POSPrinter.layout = Object.assign({}, POSPrinter.layout, cloud)
  // Object.assign chỉ ghi đè key nào CÓ trong cloud. Bản cũ dùng .set() từng xoá hẳn key
  // `temEnabled` khỏi cloud, nhưng cache trên từng tablet vẫn còn `temEnabled:false`. Cloud
  // không còn key đó nên không bao giờ ghi đè lại được → getter thấy boolean false → trả
  // false VĨNH VIỄN. Bản vá "mặc định BẬT" vì thế không bao giờ chạm tới được đúng những
  // máy đã dính lỗi, và in tem tự động chết lặng.
  //
  // Giờ chỉ tin CLOUD (nguồn dùng chung, ghi rõ ràng qua setEnabled), rồi mới tới cờ local
  // riêng của công tắc. Tuyệt đối không đọc từ `layout` đã bị trộn nữa.
  // ══════════════════════════════════════════════════════════════════════
  get enabled() {
    if (typeof _temCloudEnabled === 'boolean') return _temCloudEnabled;
    return _temLocal('pos_tem_print_enabled') !== 'false';
  },

  setEnabled(v) {
    const on = !!v;
    _temCloudEnabled = on;                                        // [FIX-tem-enabled-pin] có hiệu lực ngay
    _temLocalSet('pos_tem_print_enabled', on ? 'true' : 'false'); // cache local để mở app có ngay
    POSPrinter.saveLayout({ temEnabled: on });                    // nguồn chính: cloud, dùng chung mọi máy
  },

  getEngine() { return POSPrinter.layout.temEngine || _temLocal('pos_tem_engine') || 'tspl'; }, // mặc định TSPL — hợp với đa số máy in tem có gap
  setEngine(v) { _temLocalSet('pos_tem_engine', v); POSPrinter.saveLayout({ temEngine: v }); },

  getDpi() { return _temNum(POSPrinter.layout.temDpi) || _temNum(_temLocal('pos_tem_dpi')) || 203; },
  setDpi(v) { _temLocalSet('pos_tem_dpi', String(v)); POSPrinter.saveLayout({ temDpi: Number(v) || 203 }); },

  getGapMm() {
    const c = _temNum(POSPrinter.layout.temGapMm);
    if (isFinite(c) && c >= 0) return c;
    const g = _temNum(_temLocal('pos_tem_gap_mm'));
    return isFinite(g) && g >= 0 ? g : 2;
  },
  setGapMm(v) {
    const g = Math.max(0, Number(v) || 0);
    _temLocalSet('pos_tem_gap_mm', String(g)); POSPrinter.saveLayout({ temGapMm: g });
  },

  getOffsetMm() {
    const c = _temNum(POSPrinter.layout.temOffsetMm);
    if (isFinite(c)) return c;
    const o = _temNum(_temLocal('pos_tem_offset_mm'));
    return isFinite(o) ? o : 1.5;
  },
  setOffsetMm(v) {
    const o = Number(v) || 0;
    _temLocalSet('pos_tem_offset_mm', String(o)); POSPrinter.saveLayout({ temOffsetMm: o });
  },

  // Đảo màu bitmap — bật khi tem in ra bị NGƯỢC (nền đen, chữ trắng) do máy in hiểu ngược quy ước bit.
  // Lưu chung trên cloud (cùng chỗ với cấu hình in bill) — đồng bộ mọi máy bán hàng, mặc định BẬT.
  getInvert() { return POSPrinter.layout.temInvert !== false; },
  setInvert(v) { POSPrinter.saveLayout({ temInvert: !!v }); },

  // MAC máy in tem (LAN) đã ghép nối lần gần nhất — lưu cloud để mọi máy bán hàng tự nhận ra
  // đúng máy in khi quét mạng, không phải setup thủ công từng tablet.
  getMac() { return POSPrinter.layout.temPrinterMac || null; },
  setMac(mac) { POSPrinter.saveLayout({ temPrinterMac: mac }); },

  getStatus() { return { enabled: this.enabled, engine: this.getEngine(), dpi: this.getDpi(), gapMm: this.getGapMm(), offsetMm: this.getOffsetMm(), invert: this.getInvert() }; },

  // In 1 tem từ danh sách dòng chữ đã build sẵn — dùng chung cho in thử & in thật.
  // [REMOVE-rawbt] Chỉ còn MỘT đường in: cầu nối AndroidPrinter của app bọc.
  //
  // Lưu ý về việc CỐ Ý KHÔNG kiểm tra isAvailable() ở đây nữa. Trước đây dòng
  // `useApp = isAvailable()` vừa chọn đường truyền vừa đóng vai người gác cổng, mà
  // isAvailable() là tín hiệu không đáng tin cả hai chiều: nó báo "còn sống" khi socket
  // đã chết, và cũng có lúc báo "chết" khi thật ra vẫn gửi được. Dùng nó để TỪ CHỐI in
  // là tự tay vứt đi những lượt in lẽ ra thành công. Gửi byte vào một socket hỏng thì
  // không hại gì cả — cùng lắm là mất công. Nên nguyên tắc ở đây: CÓ CẦU NỐI THÌ CỨ GỬI.
  //
  // Chỉ ném lỗi khi KHÔNG CÓ cầu nối — đây là dữ kiện nhị phân chắc chắn (đang chạy ngoài
  // app bọc), không phải phỏng đoán về mạng, nên chặn ở đây là chặn đúng.
  printLabel(lines, copies) {
    if (!_temBridgeReady()) {
      throw new Error('Không có cầu nối máy in tem — chức năng in tem chỉ chạy trong app Android của quán');
    }
    const canvas = renderTemCanvas(lines);
    const bytes = this.getEngine() === 'escpos'
      ? canvasToEscPosBytes(canvas, copies)
      : canvasToTsplBytes(canvas, copies);
    // [FIX-bridge-v2] Trả về false khi app báo chắc chắn không gửi được, để nơi gọi đếm
    // đúng số tem hỏng thay vì báo "đã gửi" cho một socket đã chết.
    return sendBytesToXprinterApp(bytes);
  },

  // Nội dung 1 tem — layout: [thương hiệu ...................... mã bill · X/Y] → tên món + size
  // (TO NHẤT) → mỗi topping 1 dòng riêng → đường kẻ đứt → giá (đậm, căn phải) → giờ đặt → ghi chú
  // tích điểm. seq/total = số thứ tự ly này / tổng số ly trong CẢ đơn (không phải số dòng món),
  // để nhân viên dễ đối chiếu đã đủ tem cho cả đơn chưa (vd đơn 6 ly hiện "3/6").
  buildItemLabelLines(order, item, seq, total) {
    const nameLine = `${item.name}${item.size && item.size !== '-' ? ' (' + item.size + ')' : ''}`;
    const toppings = item.toppings || [];
    // [FIX-tem-price] TRƯỚC ĐÂY tem chỉ in item.price (giá ly gốc) — nếu ly có topping trả phí
    // thì giá in trên tem THẤP HƠN số tiền khách thực trả (VD ảnh chụp: ly Phù Nam 25.000đ +3
    // topping nhưng tem in ra vẫn ghi 25.000đ, đúng ra phải là 37.000đ). Giờ cộng thêm tổng giá
    // topping (bỏ qua topping được tặng miễn phí, giá = 0) để giá trên tem luôn khớp với giá
    // ly đó trên hoá đơn.
    const toppingsTotal = tpSum(toppings);
    const priceStr = (item.price != null) ? fmt((item.price || 0) + toppingsTotal) : '';
    const seqStr = (total && total > 1 && seq) ? `  ${seq}/${total}` : '';
    // [NEW-ICE] chỉ in nhãn đá khi KHÁC mặc định (đá chung) — tem đá chung không cần ghi gì thêm
    const iceModeLbl = (!item.isFood && item.ice && item.ice !== 'chung') ? item.ice : null;
    return [
      { type: 'row',
        left:  { text: 'Sữa gạo Gieo gieo', size: 12, bold: true },
        right: { text: `${order.billCode || ''}${seqStr}`, size: 12, bold: true } },
      { text: nameLine, size: 24, align: 'left', bold: true, noWrap: true },
      iceModeLbl ? { text: (iceModeLbl === 'khong' ? '🚫 KHÔNG ĐÁ' : '🧊 ĐÁ RIÊNG'), size: 16, align: 'left', bold: true } : null,
      ...toppings.map(t => ({ text: '+ ' + tpLabel(t) + (t.price ? ` (+${fmt((Number(t.price)||0) * tpQty(t))})` : ''), size: 14, align: 'left' })),
      { type: 'divider' },
      priceStr ? { text: priceStr, size: 22, align: 'right', bold: true } : null,
      { text: `${order.date || ''} ${order.time || ''}`, size: 10, align: 'left' },
      { text: 'Tích 6 điểm nhận 1 ly miễn phí', size: 10, align: 'left' },
    ].filter(Boolean);
  },

  // In tem cho 1 danh sách món bất kỳ — mỗi LY là 1 tem riêng (không gộp qty vào lệnh "copies"
  // nữa) vì mỗi tem giờ có số thứ tự "X/Y" khác nhau, không thể dùng chung 1 bitmap cho nhiều
  // bản sao như trước. Gửi TUẦN TỰ, nghỉ 500ms giữa các tem để máy in kịp xử lý lệnh trước.
  // totalOverride/startSeq cho phép in lại đúng số thứ tự gốc khi chỉ in lại 1 món (xem
  // temReprintOneItem trong phần Chi tiết đơn).
  // [FIX-tem-interleave] Hàng đợi in tem. Hai bill thanh toán cách nhau vài giây thì TRƯỚC ĐÂY
  // hai lượt in chạy song song và chèn xen kẽ nhau tại các mốc nghỉ 500ms → tem ra khỏi máy
  // theo kiểu K01, K02, K01, K02, nhân viên phải ngồi phân loại lại từng tem. Mọi LƯỢT in
  // (tem đơn, in lại, tem lô) đều xếp hàng qua đây: lượt sau chờ lượt trước xong hẳn.
  _queue: Promise.resolve(),

  _enqueue(fn) {
    const next = POSTemPrinter._queue.then(fn, fn); // lỗi lượt trước KHÔNG được chặn lượt sau
    POSTemPrinter._queue = next.catch(() => {});    // giữ hàng đợi luôn ở trạng thái chạy được
    return next;
  },

  async printLabelsForItems(order, items, totalOverride, startSeq) {
    return POSTemPrinter._enqueue(() => this._printBatch(order, items, totalOverride, startSeq));
  },

  async _printBatch(order, items, totalOverride, startSeq) {
    // [REMOVE-rawbt] Không có cầu nối thì báo MỘT lần rồi thôi — không chạy vòng lặp để
    // mỗi ly ném một lỗi giống hệt nhau. Đây là chặn dựa trên dữ kiện chắc chắn (đang chạy
    // ngoài app bọc), khác hoàn toàn với việc chặn dựa trên phỏng đoán trạng thái mạng.
    if (!_temBridgeReady()) {
      toast('⚠ In tem chỉ chạy trong app Android của quán — mở app để in tem');
      return { sentOk: 0, failed: 0 };
    }
    // [FIX-tem-keepalive] Chốt chặn cuối: socket LAN tới máy in tem có thể vừa bị máy in tự
    // đóng do nhàn rỗi. Nối lại trước khi in (đường IP đã nhớ chỉ tốn ~1s) để không bao giờ
    // gửi lệnh vào một kết nối đã chết — trường hợp app báo "đã gửi" mà máy in im lặng.
    // [FIX-bridge-v2] Ghi chú cũ ở đây kết luận "isAvailable() không đáng tin cả HAI CHIỀU".
    // Đọc mã native mới thấy nguyên nhân thật: isAvailable() chỉ phản ánh trạng thái của
    // biến temConnection, mà chính trang web này đã ghi đè biến đó bằng những kết nối hỏng
    // do gọi connectPrinter() chồng nhau. Tức là web tự làm hỏng tín hiệu, rồi xây thêm cả
    // một tầng logic để đối phó với tín hiệu hỏng do chính nó gây ra.
    // Đã có khoá chống gọi chồng (temEnsureConnected) nên tín hiệu này giờ đáng tin. Vẫn
    // giữ nguyên tắc CỨ THỬ GỬI: chỉ cảnh báo, không tự ý từ chối in — nhưng giờ nếu gửi
    // trượt thật thì cuối lượt sẽ báo đúng số tem hỏng thay vì im lặng.
    // [FIX-cold-socket] Chốt chặn cho trường hợp KHÔNG có keepalive (app cũ, hoặc
    // app mới nhưng thiếu setTemKeepAlive). Máy in tem LAN tự đóng socket sau 30–90
    // giây nhàn rỗi. Không có keepalive thì giữa hai bill socket gần như chắc chắn
    // đã chết — nhưng isAvailable() vẫn báo "còn sống" nên temEnsureConnected() trả
    // về true ngay và KHÔNG nối lại. Bytes đi vào socket chết, printRawBytes() trả
    // undefined (mã cũ coi là thành công), không tem nào ra và không một cảnh báo.
    // Đây chính là "bấm thanh toán không tự in tem, vào Lịch sử in tay thì được".
    //
    // Chỉ ép nối lại khi ĐỦ CẢ HAI: không có keepalive, VÀ đã nguội quá ngưỡng.
    // Có keepalive thì tuyệt đối không đụng vào (xem [REVERT-stale]: gọi
    // connectPrinter lúc socket còn sống làm máy in single-session từ chối thẳng).
    // Cầu nối CÓ keepalive: tin native giữ socket, KHÔNG ép nối theo thời gian (gói
    // keepalive không đi qua sendBytesToXprinterApp nên _temLastSendAt vẫn cứ già đi
    // dù socket hoàn toàn khoẻ — lấy nó làm mốc sẽ đá văng những kết nối đang tốt).
    // Chỉ ép khi chính app báo có lỗi ở lượt trước — đó là bằng chứng, không phải suy đoán.
    const _coNguoi = !_temFn('setTemKeepAlive');
    const _stTruoc = _temStatus();
    const _canEp = _coNguoi
      ? (Date.now() - _temLastSendAt) > TEM_COLD_SOCKET_MS
      : !!(_stTruoc && _stTruoc.lastError);
    if (_canEp) {
      try { await _temForceReconnect(); } catch (e) { console.warn('[tem] ép nối lại lỗi', e); }
    }
    let _conn = true;
    try { _conn = await temEnsureConnected(); } catch (e) { console.warn('[tem] nối lại lỗi', e); }
    if (!_conn) toast('⚠ Máy in tem báo mất kết nối — vẫn đang thử gửi, để ý xem tem có ra không');
    // [FIX-bridge-v2] Đặt lại bộ đếm của app để cuối lượt đọc được ĐÚNG số tem của lượt này.
    if (_temHasV2() && typeof window.AndroidPrinter.resetTemCounters === 'function') {
      try { window.AndroidPrinter.resetTemCounters(); } catch (e) {}
    }
    const list = items || [];
    const total = totalOverride || list.reduce((s, it) => s + Math.max(1, (it && it.qty) || 1), 0);
    let seq = startSeq || 1;
    let failed = 0, sentOk = 0, _attempted = 0;
    for (const item of list) {
      const qty = Math.max(1, (item && item.qty) || 1);
      for (let i = 0; i < qty; i++) {
        _attempted++;
        // [FIX-tem-partial-loss] Mỗi tem lỗi riêng lẻ chỉ đếm vào `failed` rồi ĐI TIẾP —
        // một tem hỏng không được làm mất sạch tem còn lại của đơn.
        try {
          // [FIX-bridge-v2] printLabel() giờ trả false khi app báo chắc chắn không gửi được.
          if (this.printLabel(this.buildItemLabelLines(order, item, seq, total), 1) === false) failed++;
          else sentOk++;
        } catch (e) {
          failed++;
          console.warn('[tem] lỗi in tem ' + seq + '/' + total, e);
        }
        seq++;
        // [FIX-tem-flowcontrol] TRƯỚC ĐÂY nghỉ đúng 500ms cố định, không cần biết máy in
        // đã in xong tem trước chưa. Nhưng một tem TSPL có `SET TEAR ON` mất ~1–1,5 giây
        // (lùi giấy về rồi đẩy ra dao xé), tức app nạp nhanh gấp 2–3 lần tốc độ máy in rút
        // ra. Đơn 6 ly dồn ~58KB vào buffer chỉ vài chục KB của module LAN — đầy buffer là
        // nó đóng thẳng socket. Đó chính là "mất kết nối khi vừa bấm bill".
        // Giờ chờ app gửi hết hàng đợi rồi mới cộng thêm một nhịp cố định cho phần cơ khí.
        await _temWaitDrain(8000);
        await new Promise(r => setTimeout(r, 700));
      }
    }
    // [FIX-bridge-v2] Số liệu từ app là nguồn sự thật — nó biết byte có thật sự ra socket
    // hay không, còn phía web chỉ biết mình đã đưa lệnh đi.
    await _temWaitDrain(10000);
    const _st = _temStatus();
    if (_st) {
      // Lấy con số XẤU HƠN trong hai nguồn, vì không nguồn nào bao trọn nguồn kia: phía web
      // biết những tem vỡ ngay lúc dựng ảnh (app không thấy), còn app biết những tem gửi
      // trượt trên socket (web không thấy). Dùng max để không bỏ sót, và cũng không đếm đôi
      // trường hợp cả hai cùng ghi nhận.
      failed = Math.max(failed, _st.failed || 0);
      sentOk = Math.max(0, _attempted - failed);
    }
    if (failed) {
      const _why = (_st && _st.lastError) ? ' (' + _st.lastError + ')' : '';
      toast('⚠ ' + failed + '/' + (failed + sentOk) + ' tem chưa in được' + _why + ' — vào Lịch sử đơn để in lại');
    }
    return { sentOk, failed };
  },

  // Nội dung 1 tem BÁN THÀNH PHẨM (lô chế biến).
  // Tem chỉ 40×30mm (~320×240px ở 203dpi) nên chữ là tài nguyên khan hiếm nhất:
  // càng nhiều DÒNG thì hệ số co giãn càng nhỏ, chữ càng bé, dán lên hũ trong bếp
  // thiếu sáng là không đọc nổi. Nên gói vào 4 dòng, tận dụng hàng TRÁI–PHẢI để
  // nhét 2 thông tin trên cùng một dòng thay vì mỗi thứ một dòng.
  // Viết tắt CB (chế biến) và HSD (hạn sử dụng) — đây là hai từ nhân viên bếp đọc
  // hàng chục lần mỗi ngày, rút gọn để dành chỗ cho SỐ, thứ thật sự cần đọc nhanh.
  // Tên món và HSD là hai thứ to nhất: nhìn tem là biết ngay "cái gì" và "còn dùng
  // được không".
  // [NEW] Nội dung tem KHO — dán lên chai/hộp nguyên liệu ngay khi nhận hàng.
  //
  // Bố cục theo thứ tự người dùng cần nhìn: QR để quét (việc thường xuyên nhất) → tên
  // nguyên liệu (to nhất, để nhặt đúng chai giữa kệ) → mã chữ + dung tích → ngày nhập +
  // người nhận. Mã in CẢ dạng QR lẫn dạng chữ, và là CÙNG MỘT chuỗi — không tạo hai định
  // danh khác nhau, nếu không sẽ có ngày "quét ra A, mắt đọc B".
  //
  // Hạn sau khi mở KHÔNG in ở đây: lúc nhập chưa mở nên chưa biết ngày hết hạn. Số giờ đã
  // lưu trong bản ghi; tem in lại lúc mở nắp mới có dòng HSD thật.
  buildStockLabelLines(c) {
    const p2 = n => String(n).padStart(2, '0');
    const d = c.receivedAt ? vnDate(c.receivedAt) : vnDate();
    const ngay = isNaN(d) ? '' : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
    const nvNgan = (c.receivedBy || '').trim().split(/\s+/).slice(-2).join(' ');
    const dungTich = c.trackingMode === 'batch'
      ? `Lô ${fmtPrepQty(c.baseQty)} ${c.unit || ''}`.trim()
      : `${fmtPrepQty(c.baseQty)} ${c.unit || ''}`.trim();
    return [
      { type: 'qr', text: c.code || '', size: 92, align: 'center' },
      { text: c.itemName || '', size: 22, align: 'center', bold: true, noWrap: true },
      { type: 'row',
        left:  { text: c.code || '', size: 15, bold: true },
        right: { text: dungTich, size: 15, bold: true } },
      { type: 'row',
        left:  { text: `Nhập ${ngay}`, size: 12 },
        right: { text: nvNgan, size: 12 } },
    ].filter(Boolean);
  },

  async printStockLabel(c, copies) {
    return this.printLabel(this.buildStockLabelLines(c), Math.max(1, Number(copies) || 1));
  },

  // [TEM MỞ] Tem in lại lúc MỞ cho nguyên liệu dùng thẳng (topping đóng gói sẵn...) — bao bì
  // gốc mang mã c.code bị vứt ngay khi mở, nên tem này GIỮ NGUYÊN mã cũ (không sinh mã mới),
  // chỉ thêm mốc giờ mở, để dán sang dụng cụ đựng. Xem submitOpenContainer()/openOpenLabelPrintSheet.
  buildOpenLabelLines(c) {
    const p2 = n => String(n).padStart(2, '0');
    const d = c.openedAt ? vnDate(c.openedAt) : vnDate();
    const ngayGio = isNaN(d) ? '' : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    const nvNgan = (c.openedBy || '').trim().split(/\s+/).slice(-2).join(' ');
    return [
      { type: 'qr', text: c.code || '', size: 92, align: 'center' },
      { text: c.itemName || '', size: 22, align: 'center', bold: true, noWrap: true },
      { type: 'row',
        left:  { text: 'TEM MỞ', size: 15, bold: true },
        right: { text: c.code || '', size: 15, bold: true } },
      { type: 'row',
        left:  { text: `Mở ${ngayGio}`, size: 12 },
        right: { text: nvNgan, size: 12 } },
      // [HẠN DÙNG 23/10] Tem gia hạn (chỉ khi đã gia hạn): lần gia hạn + người xác nhận + hạn mới.
      ...((c.expiryExtensions || []).length ? [{ type: 'divider' },
        { text: `GIA HẠN lần ${c.expiryExtensions.length} · ${String((c.expiryExtensions.at(-1) || {}).by || '').trim().split(/\s+/).slice(-2).join(' ')}`, size: 14, align: 'left', bold: true, noWrap: true },
        { text: `HSD: ${fmtPrepTime(c.expiresAt)}`, size: 20, align: 'left', bold: true, noWrap: true }] : []),
    ].filter(Boolean);
  },

  async printOpenLabel(c, copies) {
    return this.printLabel(this.buildOpenLabelLines(c), Math.max(1, Number(copies) || 1));
  },

  buildPrepBatchLabelLines(b) {
    const dt = (iso) => {
      if (!iso) return null;
      const d = vnDate(iso);
      if (isNaN(d)) return null;
      const p = (n) => String(n).padStart(2, '0');
      return { ngay: `${p(d.getDate())}/${p(d.getMonth() + 1)}`,
               nam:  d.getFullYear(),
               gio:  `${p(d.getHours())}:${p(d.getMinutes())}` };
    };
    const lam = dt(b.finishedAt);
    const het = dt(b.expiresAt);
    // HSD — dòng quan trọng nhất trên tem, luôn đứng riêng và to nhất.
    let hsd;
    if (b.shelfLifeType === 'endOfDay') hsd = `HSD: Hết ca ${lam ? lam.ngay : ''}`;
    else if (b.shelfLifeType === 'none' || !het) hsd = 'HSD: Không đặt hạn';
    else hsd = `HSD: ${het.ngay} ${het.gio}`;
    // Tên nhân viên rút còn 2 từ cuối ("Nguyễn Thị Thanh Hương" → "Thanh Hương").
    // Tên đầy đủ chiếm nửa tem và bị co xuống ~2mm, nhỏ hơn cả dòng phụ. Quán chỉ
    // vài nhân viên nên 2 từ cuối là đủ nhận ra; cần truy đúng người thì tra số lô,
    // bản ghi lô có lưu cả họ tên đầy đủ lẫn mã nhân viên.
    const nvNgan = (b.finishedBy || '').trim().split(/\s+/).slice(-2).join(' ');
    const sl = (b.qtyInitial != null) ? `${fmtPrepQty(b.qtyInitial)} ${b.unit || ''}`.trim() : '';
    return [
      // Số lô + khối lượng — thông tin tra cứu, để nhỏ nhất
      { type: 'row',
        left:  { text: `Lô ${b.batchCode || ''}`, size: 12, bold: true },
        right: { text: sl, size: 12, bold: true } },
      // Tên món — to nhất, tự co nếu tên dài
      { text: b.prepName || '', size: 26, align: 'left', bold: true, noWrap: true },
      // Ngày + giờ chế biến gộp một ô, nhân viên chế biến ô còn lại
      { type: 'row',
        left:  { text: `CB ${lam ? lam.ngay + ' ' + lam.gio : ''}`, size: 15 },
        right: { text: nvNgan, size: 15 } },
      { type: 'divider' },
      // [BTP ÂM 23/10] Tem gia hạn: ghi rõ lần gia hạn + người xác nhận (HSD bên dưới đã là hạn mới).
      (b.expiryExtensions || []).length ? { text: `GIA HẠN lần ${b.expiryExtensions.length} · ${String((b.expiryExtensions.at(-1) || {}).by || '').trim().split(/\s+/).slice(-2).join(' ')}`, size: 15, align: 'left', bold: true, noWrap: true } : null,
      { text: hsd, size: 22, align: 'left', bold: true, noWrap: true },
    ].filter(Boolean);
  },

  // In tem cho 1 lô bán thành phẩm. KHÔNG phụ thuộc công tắc in tem tự động
  // (this.enabled) — đó là công tắc cho tem ly bán hàng; ở đây nhân viên bấm tay
  // thì tức là đang chủ động muốn in.
  async printPrepBatchLabel(b, copies) {
    return this.printLabel(this.buildPrepBatchLabelLines(b), Math.max(1, Number(copies) || 1));
  },

  // In tem TỰ ĐỘNG cho toàn bộ món trong đơn lúc thanh toán — chỉ chạy khi tính năng in tem
  // đang BẬT (this.enabled). In lại thủ công sau này KHÔNG qua hàm này (không bị chặn bởi
  // công tắc tự động), xem temReprintAll()/temReprintOneItem() ở phần Chi tiết đơn.
  async printOrderLabels(order) {
    if (!this.enabled) {
      // [FIX-tem-settings-cloud] TRƯỚC ĐÂY chỗ này `return` CHẾT LẶNG: công tắc in tem tắt là
      // bấm bill xong không có tem mà không một dòng thông báo nào, nhân viên tưởng máy in hỏng
      // và phải mò vào tab Lịch sử in lại từng đơn. Giờ nhắc đúng 1 lần mỗi phiên mở app —
      // đủ để biết ngay nguyên nhân, không phiền vì lặp lại ở từng bill.
      if (!POSTemPrinter._warnedDisabled) {
        POSTemPrinter._warnedDisabled = true;
        toast('🔕 In tem đang TẮT — vào Máy in ▸ tab Máy in Tem để bật "Tự động in tem"');
      }
      return;
    }
    // [FIX-tem-partial-loss] Lúc thanh toán hàm này được gọi KHÔNG await (cố ý, để không chặn
    // luồng bán hàng) — nên nếu nó reject thì thành unhandled rejection, không ai bắt được.
    // Nuốt lỗi tại đây; từng tem lỗi đã được _printBatch báo cho nhân viên rồi.
    try {
      await this.printLabelsForItems(order, order.itemsArray || []);
    } catch (e) {
      console.warn('[tem] in tem đơn ' + (order && order.billCode || '') + ' lỗi', e);
    }
  },

  _warnedDisabled: false,

  printTestLabel() {
    // In thử dùng đúng buildItemLabelLines() thật (không phải nội dung viết tay riêng) để
    // tem in thử LUÔN khớp 100% với tem in thật lúc bán hàng — kể cả cách cộng giá topping
    // và cách co giãn cỡ chữ theo nội dung.
    const fakeOrder = { billCode: 'K01', date: vnDate().toLocaleDateString('vi-VN'), time: vnDate().toLocaleTimeString('vi-VN') };
    const fakeItem = {
      name: 'Lục trà Macchiato', size: 'M',
      price: 28000,
      toppings: [ { name: 'Thạch dừa', price: 5000 }, { name: 'Trân châu', price: 5000 } ]
    };
    return this.printLabel(this.buildItemLabelLines(fakeOrder, fakeItem, 2, 6));
  }
};

function _temPrinterReady() {
  // [REMOVE-rawbt] TRƯỚC ĐÂY trả về true khi không có cầu nối, vì đường RawBT vẫn in được
  // mà không có cách kiểm tra trước. Đường đó đã bị xoá — ngoài app bọc giờ là KHÔNG in được,
  // nên phải trả về false cho trung thực, để chấm trạng thái và các cảnh báo nói đúng sự thật.
  if (!_temBridgeReady()) return false;
  try { return window.AndroidPrinter.isAvailable(); } catch (e) { return false; }
}

function _temSavedIp() { try { return localStorage.getItem('pos_tem_last_ip') || null; } catch (e) { return null; } }

function _temSaveIp(ip) { try { if (ip) localStorage.setItem('pos_tem_last_ip', ip); } catch (e) {} }

// Nối lại nhanh bằng IP đã nhớ, KHÔNG quét LAN. Đa số trường hợp IP không đổi nên
// đường này ăn ngay ~1s — đủ nhanh để chèn vào trước mỗi lượt in mà không ai thấy chậm.
// Socket coi như đã nguội sau ngần này — thấp hơn mốc 30s mà đa số firmware máy in
// tem dùng để tự đóng, nên gần như không bao giờ in vào socket chết.
const TEM_COLD_SOCKET_MS = 25000;

// Ép nối lại BẤT KỂ isAvailable() nói gì. Chỉ dùng ở đúng một chỗ: ngay trước lượt
// in khi cầu nối không có keepalive và socket đã nguội quá lâu — lúc đó khả năng
// socket còn sống là rất thấp, còn cái giá của việc in vào socket chết là mất trắng
// cả đơn tem mà không ai biết.
async function _temForceReconnect() {
  if (!_temBridgeReady()) return false;
  const ip = _temSavedIp();
  if (ip && typeof window.AndroidPrinter.connectPrinter === 'function') {
    try { window.AndroidPrinter.connectPrinter(ip); } catch (e) { return false; }
    const ok = await _waitForTemReady(6, 200);
    if (ok) { _temLastSendAt = Date.now(); _updatePrinterQuickStatusUI(); return true; }
  }
  return false;
}

async function _temTryConnectSavedIp() {
  const ip = _temSavedIp();
  if (!ip || !window.AndroidPrinter || typeof window.AndroidPrinter.connectPrinter !== 'function') return false;
  try { window.AndroidPrinter.connectPrinter(ip); } catch (e) { return false; }
  return await _waitForTemReady(6, 200); // đợi tối đa ~1.2s
}

// Bảo đảm máy in tem đang kết nối. Thử theo thứ tự RẺ → ĐẮT để không làm chậm lúc bán hàng:
//   đang kết nối sẵn (0s) → nối lại bằng IP đã nhớ (~1s) → quét lại toàn mạng LAN (~4s).
// ══════════════════════════════════════════════════════════════════════════
// [FIX-tem-singleflight] KHOÁ CHỐNG GỌI CHỒNG — bản vá quan trọng nhất phía web.
//
// Có SÁU nơi gọi kết nối lại, hoàn toàn độc lập nhau: trước mỗi lượt in tem, watchdog nền,
// quay lại app (visibilitychange), nút trạng thái cạnh logo, mở tab Máy in, và in tem lô.
// Trước đây không cái nào biết cái nào đang chạy, nên lúc bấm bill — thời điểm duy nhất cả
// sáu nguồn có thể dồn vào cùng một khoảnh khắc — chúng bắn nhiều lệnh connectPrinter()
// chồng lên nhau. Máy in tem LAN chỉ nhận MỘT phiên TCP, phiên thứ hai bị từ chối, và trên
// APK cũ thì kết nối bị từ chối đó lại ghi đè mất kết nối đang tốt.
//
// Giờ mọi nẻo đường đều đi qua một cửa: đang có lượt nối chạy dở thì người tới sau CHỜ
// đúng lượt đó, không mở thêm lượt mới.
// ══════════════════════════════════════════════════════════════════════════
let _temConnectInFlight = null;

function _temTrackInFlight(p) {
  _temConnectInFlight = p;
  const clear = () => { if (_temConnectInFlight === p) _temConnectInFlight = null; };
  p.then(clear, clear);
  return p;
}

function temEnsureConnected() {
  if (!_temBridgeReady()) return Promise.resolve(false);
  if (_temPrinterReady()) { _temSyncKeepAlive(); return Promise.resolve(true); }
  if (_temConnectInFlight) return _temConnectInFlight;   // gộp vào lượt đang chạy
  return _temTrackInFlight(
    _temDoEnsureConnected()
      .catch(e => { console.warn('[tem] nối lại lỗi', e); return false; })
      .then(ok => { if (ok) _temSyncKeepAlive(); return ok; })
  );
}

// Nối lại ÂM THẦM cho watchdog nền: chỉ thử IP đã nhớ (rẻ, không phát broadcast), và chỉ
// quét LAN nhiều nhất 3 phút một lần. Dùng CHUNG khoá với lượt in ở trên.
function _temQuietReconnect() {
  if (!_temBridgeReady()) return Promise.resolve(false);
  if (_temPrinterReady()) return Promise.resolve(true);
  if (_temConnectInFlight) return _temConnectInFlight;
  return _temTrackInFlight((async () => {
    if (await _temTryConnectSavedIp()) return true;
    const now = Date.now();
    if (now - _temLastDiscoveryAt < TEM_DISCOVERY_MIN_GAP_MS) return false;
    _temLastDiscoveryAt = now;
    try { temAppDiscoverAndConnect(false); } catch (e) { return false; }
    return await _waitForTemReady(10, 400);
  })().catch(e => { console.warn('[tem] watchdog nối lỗi', e); return false; })
      .then(ok => { if (ok) _temSyncKeepAlive(); return ok; }));
}

async function _temDoEnsureConnected() {
  // [REMOVE-rawbt] Ngoài app bọc thì không có gì để kết nối và cũng không in được nữa —
  // trả false. Nơi gọi (_printBatch) đã chặn sớm và báo rõ trước khi tới đây.
  if (!_temBridgeReady()) return false;
  // ══════════════════════════════════════════════════════════════════════════
  // [REVERT-stale] ĐÃ GỠ BỎ đoạn "socket nguội quá 20s thì ép connectPrinter() lại".
  //
  // Vì sao nó phá: gần như MỌI máy in tem LAN chỉ nhận ĐÚNG MỘT phiên TCP tại một thời
  // điểm (cổng 9100 là single-session). Gọi connectPrinter() trong khi socket cũ VẪN CÒN
  // MỞ nghĩa là mở phiên thứ hai — máy in từ chối thẳng. Nếu app native lại coi lần từ
  // chối đó là "mất kết nối" thì kết cục là: đang kết nối tốt → bị chính bản vá này đá
  // văng ra. Cứ mỗi lần in cách nhau hơn 20 giây (tức gần như mọi lần) lại đá một phát.
  //
  // Đó là lý do sau bản vá trước máy "khó kết nối và giữ kết nối hơn hẳn". Quay lại
  // nguyên tắc cũ, đúng đắn: ĐANG KẾT NỐI THÌ ĐỂ YÊN, chỉ nối lại khi thật sự đã rớt.
  // ══════════════════════════════════════════════════════════════════════════
  if (_temPrinterReady()) return true;
  if (await _temTryConnectSavedIp()) { _updatePrinterQuickStatusUI(); return true; }
  try { temAppDiscoverAndConnect(false); } catch (e) { return false; }
  const ok = await _waitForTemReady(10, 400); // ~4s: gồm 2.2s chờ quét + thời gian nối
  _updatePrinterQuickStatusUI();
  return ok;
}

// Watchdog nền — trái tim của bản vá này: phát hiện rớt là tự nối lại NGAY, âm thầm,
// nhân viên không phải bấm gì cả. Chỉ chạy khi đang bật in tem và đang ở trong app riêng.
let _temWatchdogTimer = null;

let _temWatchdogBusy = false;

// [FIX-watchdog-backoff] Mốc lần quét LAN gần nhất + khoảng cách tối thiểu giữa 2 lần quét.
// Quét UDP là thao tác ĐẮT (broadcast toàn mạng, 2.2s chờ phản hồi) — chỉ dùng khi thật cần.
let _temLastDiscoveryAt = 0;

const TEM_DISCOVERY_MIN_GAP_MS = 180000;

function startTemConnectionWatchdog() {
  if (_temWatchdogTimer || !window.AndroidPrinter) return;
  // [FIX-bridge-v2] Trên APK CŨ (v1) connectPrinter() là thao tác phá hoại — mỗi lần gọi rò
  // rỉ một socket và chiếm mất phiên TCP duy nhất của máy in. Watchdog nền gọi nó đều đặn
  // cả ca chính là thứ biến một sự cố nhỏ thành hỏng hẳn. Trên bản đó KHÔNG chạy watchdog:
  // chỉ nối lại đúng lúc sắp in, là đủ và an toàn hơn nhiều.
  // [FIX-bridge-detect] Trước đây chặn theo _temHasV2() suy từ getBridgeVersion.
  // Dò nhầm là watchdog không bao giờ chạy — không ai nối lại giữa hai bill, và
  // đó chính là đường dẫn tới "bấm thanh toán mà không có tem nào ra".
  // Điều kiện thật sự cần: app có keepalive HOẶC báo được trạng thái. Có ít nhất
  // một trong hai nghĩa là cầu nối đã đủ mới để connectPrinter() không phá hoại.
  if (!_temFn('setTemKeepAlive') && !_temFn('getTemStatus')) {
    console.warn('[tem] cầu nối cũ (không có keepalive/status) — tắt watchdog nền, chỉ nối lại khi sắp in');
    return;
  }
  _temWatchdogTimer = setInterval(() => {
    if (_temWatchdogBusy) return;                    // lượt nối lại trước chưa xong
    if (!POSTemPrinter.enabled) return;              // đang tắt in tem — khỏi làm phiền máy in
    if (document.hidden) return;                     // app đang ẩn — đỡ tốn pin, mở lại sẽ nối
    if (_temPrinterReady()) return;                  // vẫn đang kết nối — KHÔNG đụng gì tới máy in
    // [FIX-watchdog-backoff] TRƯỚC ĐÂY watchdog gọi thẳng temEnsureConnected(), mà hàm đó
    // khi nối bằng IP thất bại sẽ QUÉT UDP TOÀN MẠNG LAN (startLanDiscovery + chờ 2.2s +
    // chờ nối 4s). Tức là khi máy in tắt/rớt mạng, cứ 10 giây app lại phát một đợt quét
    // broadcast ra toàn bộ WiFi của quán, liên tục không nghỉ. Vừa làm nghẽn mạng vừa khiến
    // chính việc kết nối lại khó khăn hơn — quét đợt sau đè lên đợt trước, chưa kịp xong.
    //
    // Trước đây lỗi này không lộ ra vì công tắc in tem đang bị TẮT nên watchdog ngủ đông.
    // Nay công tắc mặc định BẬT, watchdog chạy thật, nên phải có phanh:
    //   · Mỗi nhịp 10s: CHỈ thử IP đã nhớ (~1.2s, không phát broadcast, rất rẻ).
    //   · Quét LAN toàn mạng: nhiều nhất 3 PHÚT một lần, chỉ khi IP đã nhớ không ăn.
    _temWatchdogBusy = true;
    // [FIX-tem-singleflight] Đi qua khoá chung thay vì gọi thẳng _temTryConnectSavedIp() —
    // trước đây watchdog có thể bắn connectPrinter() ngay giữa lúc thu ngân đang in.
    _temQuietReconnect()
      .then(() => _updatePrinterQuickStatusUI())
      .catch(e => console.warn('[temWatchdog] nối lại lỗi', e))
      .finally(() => { _temWatchdogBusy = false; });
  }, 30000); // [FIX-tem-singleflight] 30s thay vì 10s. Với keepalive giữ socket sống, socket
             // gần như không còn rơi nữa, nên watchdog chỉ còn là lưới an toàn — chạy dày
             // chỉ tổ tăng số lần đụng vào máy in mà không được gì.

  // Nối lại ngay khi quay lại app (trường hợp hay gặp nhất: tablet ngủ dậy, socket đã chết)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && POSTemPrinter.enabled) {
      temEnsureConnected().catch(() => {});
    }
  });
}

PosGieoMods.printer = true;
