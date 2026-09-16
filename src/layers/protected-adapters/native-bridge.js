/**
 * Cầu nối APK — bọc `window.AndroidPrinter` / `window.AndroidScanner`.
 *
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md §1.3, §2.4, §3.1.
 *
 * Hai điều đã đính chính qua audit và phải giữ đúng:
 *   - KHÔNG có `window.Android` trần — chỉ có `AndroidPrinter` và `AndroidScanner`.
 *   - `printBillRawBytes` (bill) và `printRawBytes` (tem) là HAI hàm bridge
 *     RIÊNG trên cùng `AndroidPrinter`, không dùng lẫn.
 *
 * Bridge được TIÊM VÀO chứ không đọc thẳng `window`, để test chạy được không
 * cần APK và để không có code nào lén gọi `window.AndroidPrinter` ở nơi khác.
 */
GIEO.define('protected-adapters/native-bridge', ['shared-kernel/result'], function (R) {
  'use strict';

  /**
   * @param opts.printer  đối tượng giống window.AndroidPrinter
   * @param opts.scanner  đối tượng giống window.AndroidScanner
   */
  function createNativeBridge(opts) {
    opts = opts || {};
    var printer = opts.printer || null;
    var scanner = opts.scanner || null;

    /**
     * Cầu nối hứa trả Promise<Result> — nên nó KHÔNG ĐƯỢC reject.
     * Cầu nối native reject là chuyện thường (mất kết nối, hết giấy); để
     * rejection lọt ra ngoài thì nơi gọi mất cơ hội xử lý, ví dụ máy in tem
     * không kịp đánh dấu là đã rớt kết nối và lượt sau dùng lại phiên đã chết.
     */
    function settle(promise, what) {
      return Promise.resolve(promise).then(
        function (v) { return R.ok(v === undefined ? true : v); },
        function (e) {
          return R.err('RETRYABLE', what + ' lỗi: ' + (e && e.message ? e.message : e));
        }
      );
    }

    function requirePrinter(method) {
      if (!printer || typeof printer[method] !== 'function') {
        /* §2.4: bridge không sẵn sàng thì BÁO LỖI RÕ RÀNG, tuyệt đối không thử
           đường khác. Legacy từng có fallback qua app trung gian và đã cố ý xoá
           vì gây văng WebView khi máy in mất kết nối. */
        return R.err('PRECONDITION',
          'cầu nối APK thiếu "' + method + '" — báo lỗi thay vì thử đường gửi khác ' +
          '(bài học từ chính lịch sử sửa lỗi của hệ thống cũ)');
      }
      return R.ok(printer);
    }

    return {
      hasPrinter: function () { return !!printer; },
      hasScanner: function () { return !!scanner; },

      /** Đường gửi cho máy in BILL (Bluetooth). */
      printBillRawBytes: function (bytes) {
        var g = requirePrinter('printBillRawBytes');
        if (R.isErr(g)) return Promise.resolve(g);
        return settle(printer.printBillRawBytes(bytes), 'in bill');
      },

      /** Đường gửi cho máy in TEM (LAN/TCP) — đường DUY NHẤT, không fallback. */
      printRawBytes: function (bytes) {
        var g = requirePrinter('printRawBytes');
        if (R.isErr(g)) return Promise.resolve(g);
        return settle(printer.printRawBytes(bytes), 'in tem');
      },

      connectBluetooth: function (mac) {
        var g = requirePrinter('connectBluetoothApp');
        if (R.isErr(g)) return Promise.resolve(g);
        return settle(printer.connectBluetoothApp(mac), 'kết nối Bluetooth');
      },

      connectLan: function (ip, port) {
        var g = requirePrinter('connectPrinter');
        if (R.isErr(g)) return Promise.resolve(g);
        return settle(printer.connectPrinter(ip, port), 'kết nối LAN');
      },

      /**
       * Watchdog LAN chỉ có ở APK bản mới → FEATURE-DETECT như legacy.
       * Open Question §7.1 chưa được trả lời (không rõ mọi máy production đã
       * lên bản mới chưa), nên KHÔNG giả định là luôn có.
       */
      supportsKeepAlive: function () {
        return !!(printer && typeof printer.setTemKeepAlive === 'function'
          && typeof printer.getTemStatus === 'function');
      },
      setKeepAlive: function (enabled) {
        if (!printer || typeof printer.setTemKeepAlive !== 'function') {
          return Promise.resolve(R.err('PRECONDITION', 'APK này không hỗ trợ watchdog LAN'));
        }
        return settle(printer.setTemKeepAlive(enabled), 'bật watchdog');
      },
      getTemStatus: function () {
        if (!printer || typeof printer.getTemStatus !== 'function') {
          return Promise.resolve(R.err('PRECONDITION', 'APK này không hỗ trợ getTemStatus'));
        }
        return settle(printer.getTemStatus(), 'đọc trạng thái máy in tem');
      },

      openCashDrawer: function () {
        if (!printer || typeof printer.openCashDrawer !== 'function') {
          return Promise.resolve(R.err('PRECONDITION', 'APK này không hỗ trợ mở ngăn kéo'));
        }
        return settle(printer.openCashDrawer(), 'mở ngăn kéo');
      },

      /** Máy quét — chỉ khởi động, kết quả về qua callback toàn cục (§3.1). */
      startScan: function (scanId) {
        if (!scanner || typeof scanner.scan !== 'function') {
          return R.err('PRECONDITION', 'APK này không có máy quét');
        }
        try {
          scanner.scan(scanId);
          return R.ok(true);
        } catch (e) {
          return R.err('RETRYABLE', 'gọi máy quét lỗi: ' + e.message);
        }
      }
    };
  }

  return { createNativeBridge: createNativeBridge };
});
