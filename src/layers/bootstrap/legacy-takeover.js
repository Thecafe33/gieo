/**
 * Nối read port hệ cũ vào lệnh tiếp nhận — phần WIRING, không có luật nghiệp vụ.
 *
 * Luật tiếp nhận nằm ở `commands/takeover` và không biết dữ liệu đến từ đâu.
 * Ở đây chỉ làm đúng hai việc: đọc đủ nguồn, rồi đưa sang. Nhờ tách vậy, luật
 * tiếp nhận kiểm được mà không cần Firebase, còn chỗ này kiểm được bằng một
 * reader giả.
 *
 * Hệ mới bật lên ngày cutover là tự chạy đường này. Không có bước export tay,
 * không có file trung gian, không cần ai chuẩn bị dữ liệu sẵn.
 */
GIEO.define('bootstrap/legacy-takeover', [
  'shared-kernel/result',
  'commands/takeover'
], function (R, takeover) {
  'use strict';

  /**
   * @param spec.reader       legacy read port (CHỈ ĐỌC)
   * @param spec.cutoverDate  'YYYY-MM-DD'
   * @param spec.storeId, spec.actorId
   */
  function run(spec) {
    spec = spec || {};
    if (!spec.reader || typeof spec.reader.loadAll !== 'function') {
      return Promise.resolve(R.err('VALIDATION', 'tiếp nhận cần legacy read port có loadAll'));
    }

    var names = takeover.SOURCES;
    return Promise.all(names.map(function (n) { return spec.reader.loadAll(n); }))
      .then(function (outs) {
        var failed = [];
        var legacy = {};
        outs.forEach(function (o, i) {
          if (R.isErr(o)) failed.push(names[i] + ': ' + o.error.message);
          else legacy[names[i]] = o.value;
        });
        if (failed.length) {
          /* Đọc hụt một nguồn thì dừng ở đây, KHÔNG đưa dữ liệu khuyết sang
             lệnh tiếp nhận. Tiếp nhận thiếu công thức còn tệ hơn chưa tiếp nhận. */
          return R.err('RETRYABLE',
            'không đọc đủ nguồn hệ cũ, KHÔNG tiếp nhận một phần: ' + failed.join('; '),
            { failed: failed });
        }
        return takeover.buildPlan({
          legacy: legacy,
          cutoverDate: spec.cutoverDate,
          storeId: spec.storeId,
          actorId: spec.actorId
        });
      });
  }

  return {
    run: run,
    /* Khối khởi động cần id này để hỏi "đã tiếp nhận chưa" trước khi chạy. */
    operationIdFor: takeover.takeoverOperationId
  };
});
