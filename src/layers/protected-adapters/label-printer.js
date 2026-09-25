/**
 * LabelPrinterAdapter — máy in tem, LAN/TCP qua APK.
 *
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md §2.
 *
 * Phức tạp hơn máy in bill nhiều, và ĐỘ PHỨC TẠP ĐÓ LÀ CẦN THIẾT — máy in tem
 * tự đóng socket sau 30-90s nhàn rỗi và chỉ nhận MỘT phiên TCP tại một thời
 * điểm. Ba lớp chống rớt dưới đây mỗi lớp giải quyết một race condition thật
 * đã được vá qua nhiều đợt, không phải dư thừa (§2.5):
 *
 *   1. Nhớ IP cuối (cấp MÁY, không lưu cloud vì IP đổi theo DHCP) → nối lại
 *      ngay trước khi in.
 *   2. Watchdog nền định kỳ — chỉ chạy nếu APK hỗ trợ, phải FEATURE-DETECT.
 *   3. Khoá single-flight chống gọi connect chồng lấp — bắt buộc vì máy chỉ
 *      nhận một phiên.
 *
 * Hai điều KHÔNG được làm:
 *   - KHÔNG thêm đường gửi fallback thứ hai (§2.4). Legacy từng có fallback qua
 *     app trung gian và đã CỐ Ý xoá vì gây văng WebView khi máy in mất kết nối.
 *   - KHÔNG auto-detect giao thức theo model máy (§2.3) — nhân viên chọn tay,
 *     mặc định TSPL.
 */
GIEO.define('protected-adapters/label-printer', [
  'shared-kernel/result',
  'protected-adapters/print-queue'
], function (R, queueLib) {
  'use strict';

  /* TSPL có lệnh SIZE/GAP/OFFSET để máy tự canh tem → khuyến nghị mặc định.
     ESC/POS không có khái niệm khổ tem nên dễ in đè. */
  var ENGINE = { TSPL: 'TSPL', ESCPOS: 'ESCPOS' };

  function createLabelPrinter(opts) {
    opts = opts || {};
    var bridge = opts.bridge;
    if (!bridge) throw new Error('[label-printer] cần bridge');

    /* Queue RIÊNG — độc lập với máy in bill (gate §8). */
    var queue = queueLib.createPrintQueue({ name: 'label-printer', onError: opts.onError });

    var state = {
      enabled: true,
      engine: opts.engine || ENGINE.TSPL,
      ip: null,
      port: opts.port || 9100,
      connected: false,
      keepAliveOn: false
    };

    /* Lớp 3 — single-flight. Nhiều lời gọi cùng lúc dùng CHUNG một promise
       kết nối, vì máy chỉ nhận một phiên TCP. */
    var connecting = null;

    function setEngine(engine) {
      if (!ENGINE[engine]) return R.err('VALIDATION', 'giao thức không hợp lệ: ' + engine);
      /* Chọn tay, không auto-detect theo model (§2.3). */
      state.engine = engine;
      return R.ok(state.engine);
    }

    function setEnabled(v) { state.enabled = !!v; }
    function isEnabled() { return state.enabled; }

    /** Lớp 1 — nhớ IP cấp MÁY. Không lưu cloud: IP đổi theo DHCP. */
    function rememberIp(ip, port) {
      state.ip = ip || null;
      if (port) state.port = port;
      state.connected = false;
      return R.ok({ ip: state.ip, port: state.port });
    }

    /**
     * Lớp 3 — bảo đảm đã kết nối, chống gọi chồng lấp.
     * Nhiều lượt in song song cùng chờ một lời gọi connect duy nhất.
     */
    function ensureConnected() {
      if (state.connected) return Promise.resolve(R.ok({ reused: true }));
      if (connecting) return connecting;
      if (!state.ip) {
        return Promise.resolve(R.err('PRECONDITION', 'chưa biết IP máy in tem'));
      }

      connecting = bridge.connectLan(state.ip, state.port).then(function (r) {
        state.connected = R.isOk(r);
        connecting = null;
        return r;
      }, function (e) {
        connecting = null;
        state.connected = false;
        return R.err('RETRYABLE', 'kết nối máy in tem lỗi: ' + (e && e.message ? e.message : e));
      });
      return connecting;
    }

    /**
     * Lớp 2 — watchdog nền. FEATURE-DETECT vì chỉ APK bản mới có.
     * Open Question §7.1 chưa được trả lời nên KHÔNG giả định luôn sẵn có.
     */
    function startKeepAlive() {
      if (!bridge.supportsKeepAlive()) {
        return Promise.resolve(R.ok({
          skipped: 'APK_KHONG_HO_TRO',
          note: 'APK này thiếu setTemKeepAlive/getTemStatus — dựa vào lớp 1 và 3'
        }));
      }
      return bridge.setKeepAlive(true).then(function (r) {
        state.keepAliveOn = R.isOk(r);
        return r;
      });
    }

    /** Dựng byte theo giao thức đang chọn. Khác nhau ở header/footer lệnh. */
    function encode(bitmap, spec) {
      if (state.engine === ENGINE.TSPL) {
        return {
          engine: ENGINE.TSPL,
          /* SIZE/GAP/OFFSET để máy tự canh tem. */
          header: { size: spec.size, gap: spec.gap, offset: spec.offset || 0 },
          bitmap: bitmap
        };
      }
      return { engine: ENGINE.ESCPOS, header: null, bitmap: bitmap };
    }

    /**
     * In tem. Nối lại ngay trước khi in (lớp 1), qua queue tự phục hồi.
     * Đường gửi DUY NHẤT là `printRawBytes` — không fallback.
     */
    function print(bitmap, spec, label) {
      if (!state.enabled) return Promise.resolve(R.ok({ skipped: 'PRINTER_DISABLED' }));

      return queue.enqueue(function () {
        return ensureConnected().then(function (c) {
          if (R.isErr(c)) throw new Error(c.error.message);
          var payload = encode(bitmap, spec || {});
          var bytes = opts.encodeLabel ? opts.encodeLabel(payload) : payload;
          return bridge.printRawBytes(bytes).then(function (r) {
            if (R.isErr(r)) {
              /* Mất kết nối giữa chừng: đánh dấu để lượt sau nối lại,
                 KHÔNG thử đường gửi khác. */
              state.connected = false;
              throw new Error(r.error.message);
            }
            return true;
          });
        });
      }, label || 'tem');
    }

    /**
     * In nhiều tem. Vẫn tuần tự qua queue vì máy chỉ nhận một phiên — song
     * song hoá ở đây là cách làm rớt kết nối.
     */
    function printBatch(items, spec) {
      var results = [];
      var chain = Promise.resolve();
      items.forEach(function (it, i) {
        chain = chain.then(function () {
          return print(it, spec, 'tem-' + (i + 1)).then(function (r) { results.push(r); });
        });
      });
      return chain.then(function () {
        return R.ok({
          total: results.length,
          ok: results.filter(function (r) { return R.isOk(r); }).length,
          failed: results.filter(function (r) { return R.isErr(r); }).length,
          results: results
        });
      });
    }

    return {
      ENGINE: ENGINE,
      setEngine: setEngine,
      setEnabled: setEnabled,
      isEnabled: isEnabled,
      rememberIp: rememberIp,
      ensureConnected: ensureConnected,
      startKeepAlive: startKeepAlive,
      encode: encode,
      print: print,
      printBatch: printBatch,
      drain: queue.drain,
      queueStats: queue.snapshot,
      queueHealthy: queue.isHealthy,
      state: function () { return Object.assign({}, state); }
    };
  }

  return { ENGINE: ENGINE, createLabelPrinter: createLabelPrinter };
});
