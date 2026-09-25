/**
 * Hàng đợi in TỰ PHỤC HỒI — đây là BUG THẬT phải sửa, không phải giữ nguyên.
 *
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md §1.2, §6.1.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Legacy `POSPrinter._queue = Promise.resolve()`, mọi lệnh in chain kiểu
 *     this._queue = this._queue.then(() => this._doPrint(order));
 * KHÔNG có `.catch()` phục hồi. Một lần in lỗi (mất kết nối, hết giấy) làm
 * `_queue` thành Promise rejected VĨNH VIỄN → mọi lệnh in bill sau đó, kể cả
 * reprint, im lặng không chạy nữa cho tới khi reload app.
 *
 * Pattern ĐÚNG đã có sẵn ngay trong chính codebase legacy, ở máy in tem:
 *     var next = _queue.then(fn, fn);   // lỗi lượt trước không chặn lượt sau
 *     _queue = next.catch(function(){});// luôn giữ queue ở trạng thái chạy được
 *
 * Contract §6 nói rõ: đây là lỗi kỹ thuật thuần tuý, không phải quyết định
 * nghiệp vụ, nên KHÔNG được "giữ nguyên để tương thích".
 * ────────────────────────────────────────────────────────────────────────
 *
 * Gate §8 đòi bill printer và label printer có queue ĐỘC LẬP — máy in tem kẹt
 * giấy không được làm nghẽn in bill. Nên đây là factory, mỗi adapter tự tạo
 * một instance riêng.
 */
GIEO.define('protected-adapters/print-queue', ['shared-kernel/result'], function (R) {
  'use strict';

  /**
   * @param opts.name     tên để báo lỗi cho người đọc
   * @param opts.onError  gọi khi một lượt in hỏng (toast/alert) — KHÔNG chặn lượt sau
   */
  function createPrintQueue(opts) {
    opts = opts || {};
    var name = opts.name || 'printer';
    var chain = Promise.resolve();
    var stats = { queued: 0, done: 0, failed: 0 };

    /**
     * Xếp một lượt in. LUÔN trả Promise<Result> đã resolve — lỗi in là giá trị
     * trả về, không phải exception, vì in hỏng không được làm sập luồng bán hàng.
     */
    function enqueue(job, label) {
      stats.queued += 1;

      var result = chain.then(runJob, runJob);

      /* Mấu chốt: chain kế tiếp LUÔN là một promise đã được nuốt lỗi, nên một
         lượt hỏng không bao giờ đầu độc những lượt sau. */
      chain = result.catch(function () {});
      return result;

      function runJob() {
        return Promise.resolve()
          .then(job)
          .then(function (value) {
            stats.done += 1;
            return R.ok(value === undefined ? true : value);
          })
          .catch(function (e) {
            stats.failed += 1;
            var err = R.err('RETRYABLE',
              '[' + name + '] in hỏng' + (label ? ' (' + label + ')' : '') + ': ' + (e && e.message ? e.message : e));
            if (typeof opts.onError === 'function') {
              /* Handler người dùng hỏng cũng không được làm nghẽn hàng đợi. */
              try { opts.onError(err, label); } catch (ignored) { /* noop */ }
            }
            return err;
          });
      }
    }

    /** Chờ hàng đợi rỗng — dùng cho test và cho lúc tắt app. */
    function drain() {
      return chain.then(function () { return R.ok(Object.assign({}, stats)); });
    }

    function snapshot() { return Object.assign({}, stats); }

    /**
     * Hàng đợi có còn chạy được không. Ở legacy câu này luôn là "không" sau
     * lần lỗi đầu tiên; ở đây nó luôn là "có" theo thiết kế, và test chứng minh.
     */
    function isHealthy() {
      return chain instanceof Promise;
    }

    return {
      name: name,
      enqueue: enqueue,
      drain: drain,
      snapshot: snapshot,
      isHealthy: isHealthy
    };
  }

  return { createPrintQueue: createPrintQueue };
});
