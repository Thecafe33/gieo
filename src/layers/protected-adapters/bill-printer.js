/**
 * BillPrinterAdapter — máy in bill, Bluetooth qua APK.
 *
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md §1.
 *
 * Ba điều đã chốt, giữ nguyên:
 *   - CHỈ một đường Bluetooth qua `AndroidPrinter.printBillRawBytes`.
 *     KHÔNG mang `XprinterWNN58E`/Web Serial sang (DEAD-FEATURE-PRUNING §4) —
 *     hệ thống mới chỉ chạy trong APK nên không cần nhánh dự phòng cho trình
 *     duyệt thường như legacy.
 *   - In bill KHÔNG BAO GIỜ chặn hay rollback việc trừ kho/ghi bill. Order và
 *     ledger đã chốt TRƯỚC khi in được gọi; in hỏng chỉ báo, không tạo lại đơn,
 *     không hoàn kho (§1.1).
 *   - Máy phải ghép nối Bluetooth trước trong Cài đặt Android; app không tự
 *     pair, chỉ nhớ MAC và tự nối lại lúc khởi động.
 *
 * Một điều PHẢI SỬA: hàng đợi tự phục hồi — xem `protected-adapters/print-queue`.
 *
 * Cửa sổ thời gian cho phép in lại, log chống gian lận, giới hạn hiển thị lịch
 * sử bill KHÔNG nằm ở đây — chúng là business rule, thuộc `packages/commands`
 * (ranh giới §5).
 */
GIEO.define('protected-adapters/bill-printer', [
  'shared-kernel/result',
  'protected-adapters/print-queue'
], function (R, queueLib) {
  'use strict';

  /**
   * @param opts.bridge      native-bridge
   * @param opts.encodeBill  (content) => bytes — rasterize canvas thành byte
   * @param opts.onError
   */
  function createBillPrinter(opts) {
    opts = opts || {};
    var bridge = opts.bridge;
    if (!bridge) throw new Error('[bill-printer] cần bridge');

    /* Queue RIÊNG của máy in bill — tem kẹt giấy không được làm nghẽn in bill. */
    var queue = queueLib.createPrintQueue({ name: 'bill-printer', onError: opts.onError });

    var state = { enabled: true, mac: null, connected: false };

    function setEnabled(v) { state.enabled = !!v; }
    function isEnabled() { return state.enabled; }

    /** Nhớ MAC. Legacy lưu ở `printer_layout_gieogieo.billPrinterMac` (dùng
        chung mọi máy POS trong quán) — adapter chỉ giữ giá trị, nơi lưu là
        việc của tầng persistence. */
    function rememberMac(mac) {
      state.mac = mac || null;
      return R.ok(state.mac);
    }

    function connect(mac) {
      var target = mac || state.mac;
      if (!target) {
        return Promise.resolve(R.err('PRECONDITION',
          'chưa có địa chỉ máy in bill — phải ghép nối Bluetooth trong Cài đặt Android trước'));
      }
      return bridge.connectBluetooth(target).then(function (r) {
        state.connected = R.isOk(r);
        if (R.isOk(r)) state.mac = target;
        return r;
      });
    }

    /** Tự nối lại lúc khởi động bằng MAC đã nhớ. */
    function reconnectOnBoot() {
      if (!state.mac) return Promise.resolve(R.ok({ skipped: 'NO_REMEMBERED_MAC' }));
      return connect(state.mac);
    }

    /**
     * In một bill.
     *
     * LUÔN trả Promise đã resolve — lỗi in là giá trị trả về. Caller (luồng
     * thanh toán) gọi fire-and-forget và KHÔNG được để kết quả ở đây ảnh hưởng
     * tới việc bill đã ghi và kho đã trừ.
     */
    function print(content, label) {
      if (!state.enabled) {
        return Promise.resolve(R.ok({ skipped: 'PRINTER_DISABLED' }));
      }
      return queue.enqueue(function () {
        var bytes = opts.encodeBill ? opts.encodeBill(content) : content;
        return bridge.printBillRawBytes(bytes).then(function (r) {
          if (R.isErr(r)) throw new Error(r.error.message);
          return true;
        });
      }, label || 'bill');
    }

    /**
     * In lại. Về mặt kỹ thuật giống hệt in lần đầu — "in thuần tuý", không có
     * side-effect nào khác (§1.4). Việc có được in lại hay không, và ghi log
     * chống gian lận, là quyết định của tầng command.
     */
    function reprint(content, label) {
      return print(content, label || 'reprint-bill');
    }

    function openCashDrawer() { return bridge.openCashDrawer(); }

    return {
      setEnabled: setEnabled,
      isEnabled: isEnabled,
      rememberMac: rememberMac,
      connect: connect,
      reconnectOnBoot: reconnectOnBoot,
      print: print,
      reprint: reprint,
      openCashDrawer: openCashDrawer,
      drain: queue.drain,
      queueStats: queue.snapshot,
      queueHealthy: queue.isHealthy,
      state: function () { return Object.assign({}, state); }
    };
  }

  return { createBillPrinter: createBillPrinter };
});
