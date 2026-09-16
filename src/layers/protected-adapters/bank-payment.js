/**
 * BankPaymentAdapter — chuyển khoản VietQR.
 *
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md §4.
 *
 * Bắt tay MỘT LẦN: webhook (ngoài repo này) ghi vào `bank_confirmations/{orderId}`,
 * client lắng nghe node đó, có bản ghi thì coi là đã thanh toán rồi XOÁ node ngay.
 *
 * ────────────────────────────────────────────────────────────────────────
 * 🔴 RỦI RO ĐÃ BIẾT, GIỮ NGUYÊN CÓ CHỦ ĐÍCH (§4.2)
 *
 * Adapter này KHÔNG đối chiếu số tiền. Nó chỉ kiểm tra bản ghi TỒN TẠI; field
 * `amount` chỉ để hiển thị. Việc đối soát số tiền nằm hoàn toàn ở phía webhook
 * ghi vào `bank_confirmations` — thứ nằm NGOÀI hai file HTML đã audit nên
 * không kiểm chứng được từ đây.
 *
 * Contract quyết định: giữ đúng contract "tin tưởng sự tồn tại của bản ghi tại
 * path one-shot", NHƯNG phải cảnh báo rõ. Nên adapter này:
 *   - không tự thêm đối chiếu phía client (làm vậy là đổi semantics của một
 *     ranh giới protected),
 *   - TRẢ VỀ cờ `amountNotVerifiedClientSide` trên mọi lần xác nhận, để không
 *     ai đọc code này mà tưởng số tiền đã được kiểm.
 *
 * Ai viết lại webhook ở repo/service khác: ĐÂY là chỗ bắt buộc phải validate
 * `addInfo`/số tiền trước khi ghi. Hiện tại đó là một giả định ngầm.
 * ────────────────────────────────────────────────────────────────────────
 *
 * §4.5 — `bankOrderId ≠ operationId`. Mã này chỉ định danh giao dịch NGÂN HÀNG,
 * KHÔNG được dùng làm khoá idempotency cho command nội bộ.
 */
GIEO.define('protected-adapters/bank-payment', ['shared-kernel/result'], function (R) {
  'use strict';

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /**
   * Sinh mã giao dịch ngân hàng — giữ đúng định dạng legacy `'GG' + ddHHmmss`.
   * Định dạng này có ý nghĩa với người đối soát sao kê, nên không đổi.
   */
  function genBankOrderId(at) {
    var d = new Date(at);
    return 'GG' + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  function createBankPayment(opts) {
    opts = opts || {};
    var store = opts.confirmationStore;
    if (!store) throw new Error('[bank-payment] cần confirmationStore (RTDB bank_confirmations)');
    var clock = opts.clock;
    if (!clock) throw new Error('[bank-payment] cần clock');

    var active = Object.create(null);

    /** Dựng URL ảnh QR. Tài khoản cố định của quán, cấu hình ở ngoài. */
    function buildQrUrl(spec) {
      if (!opts.bankAccount) return R.err('PRECONDITION', 'chưa cấu hình tài khoản nhận tiền');
      if (typeof spec.amount !== 'number' || !(spec.amount > 0)) {
        return R.err('VALIDATION', 'số tiền phải dương');
      }
      return R.ok({
        bankOrderId: spec.bankOrderId,
        url: opts.qrBaseUrl + '?acc=' + encodeURIComponent(opts.bankAccount)
          + '&amount=' + spec.amount
          + '&addInfo=' + encodeURIComponent(spec.bankOrderId),
        amount: spec.amount
      });
    }

    /**
     * Mở một lượt chờ chuyển khoản.
     *
     * KHÔNG có timeout (§4.3). Legacy không có `setTimeout` nào tự đóng popup,
     * và đó là quyết định nghiệp vụ hợp lý — nhân viên toàn quyền quyết định
     * khi nào huỷ. Không tự ý thêm vào.
     */
    function open(spec) {
      var bankOrderId = spec.bankOrderId || genBankOrderId(clock.now());
      var qr = buildQrUrl({ bankOrderId: bankOrderId, amount: spec.amount });
      if (R.isErr(qr)) return qr;

      var session = {
        bankOrderId: bankOrderId,
        amount: spec.amount,
        qrUrl: qr.value.url,
        openedAt: clock.now(),
        status: 'WAITING',
        /* §4.5 — nói rõ ngay trong dữ liệu để không ai dùng nhầm. */
        notAnOperationId: true
      };
      active[bankOrderId] = session;

      /* Lắng nghe node one-shot. Cả hai đường (webhook và bấm tay) đều đi vào
         cùng một hàm settle. */
      var unsubscribe = store.listen(bankOrderId, function (snapshot) {
        if (!snapshot) return;
        settle(bankOrderId, 'WEBHOOK', snapshot);
      });
      session.unsubscribe = unsubscribe;

      return R.ok(session);
    }

    /**
     * Chốt một lượt. Dùng chung cho webhook lẫn bấm tay — §4.1 nói rõ đường
     * thủ công chạy ĐÚNG callback y hệt đường tự động, không có luồng riêng.
     */
    function settle(bankOrderId, source, snapshot) {
      var session = active[bankOrderId];
      if (!session) return R.err('NOT_FOUND', 'không có lượt chờ nào cho ' + bankOrderId);
      if (session.status !== 'WAITING') {
        /* One-shot: chốt lần hai là no-op có kiểm soát. */
        return R.ok(Object.assign({}, session, { replayed: true }));
      }

      session.status = 'CONFIRMED';
      session.confirmedAt = clock.now();
      session.source = source;
      if (session.unsubscribe) session.unsubscribe();

      /* Xoá node NGAY — bắt tay một lần. */
      store.remove(bankOrderId);
      delete active[bankOrderId];

      if (typeof opts.onConfirmed === 'function') opts.onConfirmed(session);

      return R.ok({
        bankOrderId: bankOrderId,
        source: source,
        amountShown: snapshot && typeof snapshot.amount === 'number' ? snapshot.amount : null,
        expectedAmount: session.amount,
        /* Cờ này luôn true. Đọc code ở đây mà tưởng số tiền đã được kiểm là
           hiểu sai một ranh giới protected — xem ghi chú đầu file. */
        amountNotVerifiedClientSide: true,
        confirmedAt: session.confirmedAt
      });
    }

    /** Nhân viên bấm "ĐÃ CHUYỂN KHOẢN XONG". */
    function confirmManually(bankOrderId) {
      return settle(bankOrderId, 'MANUAL', null);
    }

    /** Nhân viên tự đóng popup. */
    function cancel(bankOrderId) {
      var session = active[bankOrderId];
      if (!session) return R.err('NOT_FOUND', 'không có lượt chờ nào cho ' + bankOrderId);
      if (session.unsubscribe) session.unsubscribe();
      session.status = 'CANCELLED';
      delete active[bankOrderId];
      return R.ok(session);
    }

    function activeCount() { return Object.keys(active).length; }

    return {
      genBankOrderId: genBankOrderId,
      buildQrUrl: buildQrUrl,
      open: open,
      confirmManually: confirmManually,
      cancel: cancel,
      activeCount: activeCount
    };
  }

  return { genBankOrderId: genBankOrderId, createBankPayment: createBankPayment };
});
