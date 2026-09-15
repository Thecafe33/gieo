/**
 * Result + error taxonomy — invariant #11 ("không swallow errors").
 *
 * Legacy nuốt lỗi ở nhiều chỗ: `.catch(console.warn)` khi đóng unit nợ (Bug #15),
 * loyalty trả 0 ngầm khi thiếu Customer, `plChannelFeeForDay()` hard-code trả 0.
 * Hệ quả chung: lỗi biến thành số 0 hợp lệ trông như dữ liệu thật.
 *
 * Ở đây thất bại là GIÁ TRỊ TRẢ VỀ có hình dạng riêng, không thể nhầm với số 0,
 * và không thể đọc .value mà không xử lý lỗi trước.
 */
GIEO.define('shared-kernel/result', [], function () {
  'use strict';

  /* Phân loại lỗi. Quyết định "thử lại hay không" phải đọc được từ loại lỗi,
     không phải đoán từ message như legacy. */
  var ERROR_KINDS = {
    VALIDATION: 'VALIDATION',                 // input sai — thử lại vô nghĩa
    FORBIDDEN: 'FORBIDDEN',                   // thiếu quyền — read-layer §5
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',                     // claim đã bị người khác giữ
    PRECONDITION: 'PRECONDITION',             // trạng thái không cho phép
    AMBIGUOUS_LEGACY: 'AMBIGUOUS_LEGACY',     // invariant #12 — cấm suy đoán, phải rà tay
    RETRYABLE: 'RETRYABLE',                   // lỗi hạ tầng tạm thời
    MANUAL_REVIEW: 'MANUAL_REVIEW'            // hỏng giữa chừng, cần người xử lý
  };

  var RETRYABLE_KINDS = { RETRYABLE: true };

  function ok(value) {
    return { ok: true, value: value === undefined ? null : value };
  }

  function err(kind, message, detail) {
    if (!ERROR_KINDS[kind]) throw new Error('[result] loại lỗi không hợp lệ: "' + kind + '"');
    return {
      ok: false,
      error: {
        kind: kind,
        message: String(message || kind),
        detail: detail === undefined ? null : detail
      }
    };
  }

  function isOk(r) { return !!(r && r.ok === true); }
  function isErr(r) { return !!(r && r.ok === false); }

  function isRetryable(r) {
    return isErr(r) && !!RETRYABLE_KINDS[r.error.kind];
  }

  /**
   * Lấy giá trị, nổ nếu là lỗi. Chỉ dùng khi caller ĐÃ kiểm tra isOk(),
   * hoặc ở ranh giới mà lỗi thật sự là bug lập trình.
   */
  function unwrap(r, where) {
    if (isOk(r)) return r.value;
    if (isErr(r)) {
      throw new Error('[result] ' + (where || 'unwrap') + ': ' + r.error.kind + ' — ' + r.error.message);
    }
    throw new Error('[result] ' + (where || 'unwrap') + ': không phải Result — ' + JSON.stringify(r));
  }

  /** Biến đổi giá trị, giữ nguyên lỗi. */
  function map(r, fn) {
    return isOk(r) ? ok(fn(r.value)) : r;
  }

  /** Nối chuỗi bước có thể hỏng; dừng ở lỗi đầu tiên. */
  function chain(r, fn) {
    return isOk(r) ? fn(r.value) : r;
  }

  /** Gom nhiều Result; lỗi đầu tiên thắng. Dùng cho validate nhiều trường. */
  function all(results) {
    var out = [];
    for (var i = 0; i < results.length; i++) {
      if (isErr(results[i])) return results[i];
      out.push(results[i].value);
    }
    return ok(out);
  }

  return {
    ERROR_KINDS: ERROR_KINDS,
    ok: ok,
    err: err,
    isOk: isOk,
    isErr: isErr,
    isRetryable: isRetryable,
    unwrap: unwrap,
    map: map,
    chain: chain,
    all: all
  };
});
