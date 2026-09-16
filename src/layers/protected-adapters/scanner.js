/**
 * ScannerAdapter — máy quét mã, qua UI native.
 *
 * Contract: PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md §3.
 *
 * WebView không tự cấp quyền camera cho app quán (thiếu `onPermissionRequest`),
 * nên việc quét giao hẳn cho UI native. Kết quả về qua global callback +
 * pending-map, KHÔNG phải Promise trực tiếp từ native.
 *
 * CONTRACT CỐT LÕI: `scan()` LUÔN RESOLVE, KHÔNG BAO GIỜ REJECT.
 * Caller luôn nhận `{ok, code, format, error}` và tự xử lý `ok:false` — không
 * dùng try/catch cho luồng lỗi bình thường. Quét không ra mã là chuyện thường
 * ngày ở quầy, không phải ngoại lệ chương trình.
 *
 * MỘT THỨ BỔ SUNG SO VỚI LEGACY (§3.3, §6.2): fallback NHẬP MÃ BẰNG TAY.
 * Audit không tìm thấy ô nhập tay nào khi máy quét timeout/lỗi, và khi hoàn
 * toàn không có scanner cũng không thấy input thay thế. Contract kết luận đây
 * nhiều khả năng là gap thật và yêu cầu bổ sung tường minh.
 *
 * Đối chiếu mã trùng (`chanMaTrung`) KHÔNG nằm ở đây — adapter chỉ trả mã thô;
 * validate thuộc Unit Identity ở `packages/commands` (ranh giới §5).
 */
GIEO.define('protected-adapters/scanner', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 90000;

  var FAIL = {
    NO_SCANNER: 'NO_SCANNER',
    TIMEOUT: 'TIMEOUT',
    BRIDGE_ERROR: 'BRIDGE_ERROR',
    CANCELLED: 'CANCELLED'
  };

  function createScanner(opts) {
    opts = opts || {};
    var bridge = opts.bridge;
    if (!bridge) throw new Error('[scanner] cần bridge');

    var timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    var setTimer = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimeout || function (t) { return clearTimeout(t); };

    /* pending-map: native gọi ngược đúng một lần, đối chiếu theo id. */
    var pending = Object.create(null);
    var seq = 0;

    function available() { return bridge.hasScanner(); }

    /**
     * Quét một mã. LUÔN resolve.
     * Kết quả: `{ok:true, code, format, source}` hoặc `{ok:false, reason, message}`.
     */
    function scan(label) {
      seq += 1;
      var scanId = ids.deterministicId('operation', ['scan', String(Date.now()), String(seq)]);

      if (!available()) {
        /* Không có máy quét KHÔNG phải lỗi chương trình — caller chuyển sang
           nhập tay. */
        return Promise.resolve({
          ok: false, reason: FAIL.NO_SCANNER,
          message: 'máy này không có máy quét — nhập mã bằng tay',
          canFallbackToManual: true
        });
      }

      return new Promise(function (resolve) {
        var done = false;
        function finish(result) {
          if (done) return;
          done = true;
          clearTimer(timer);
          delete pending[scanId];
          resolve(result);
        }

        /* Timeout đề phòng app native treo — không có nó thì Promise treo mãi. */
        var timer = setTimer(function () {
          finish({
            ok: false, reason: FAIL.TIMEOUT,
            message: 'máy quét không phản hồi sau ' + Math.round(timeoutMs / 1000) + 's',
            canFallbackToManual: true
          });
        }, timeoutMs);

        pending[scanId] = finish;

        var started = bridge.startScan(scanId);
        if (R.isErr(started)) {
          finish({
            ok: false, reason: FAIL.BRIDGE_ERROR,
            message: started.error.message,
            canFallbackToManual: true
          });
        }
      });
    }

    /**
     * Native gọi ngược. Gắn hàm này vào `window.__androidScanResult`.
     * Kết quả lạ (id không còn chờ, gọi hai lần) bị bỏ qua có kiểm soát.
     */
    function handleNativeResult(res) {
      if (!res || !res.id) return R.err('VALIDATION', 'kết quả quét thiếu id');
      var finish = pending[res.id];
      if (!finish) {
        /* Đến muộn sau timeout, hoặc gọi lần hai. Không nổ, nhưng cũng không
           im lặng hoàn toàn — trả về để nơi gọi ghi log nếu muốn. */
        return R.err('NOT_FOUND', 'không có lượt quét nào đang chờ id ' + res.id);
      }
      if (res.cancelled) {
        finish({ ok: false, reason: FAIL.CANCELLED, message: 'người dùng huỷ quét', canFallbackToManual: true });
        return R.ok(true);
      }
      if (!res.code) {
        finish({ ok: false, reason: FAIL.BRIDGE_ERROR, message: res.error || 'không đọc được mã', canFallbackToManual: true });
        return R.ok(true);
      }
      finish({ ok: true, code: String(res.code), format: res.format || null, source: 'SCANNER' });
      return R.ok(true);
    }

    /**
     * FALLBACK NHẬP TAY — bổ sung so với legacy (§6.2).
     * Trả về CÙNG hình dạng với `scan()` để nơi gọi không phải rẽ nhánh theo
     * nguồn; `source` phân biệt để tầng nghiệp vụ ghi audit nếu cần.
     */
    function manualEntry(code) {
      var trimmed = typeof code === 'string' ? code.trim() : '';
      if (!trimmed) {
        return { ok: false, reason: FAIL.BRIDGE_ERROR, message: 'mã nhập tay rỗng', canFallbackToManual: true };
      }
      return { ok: true, code: trimmed, format: null, source: 'MANUAL' };
    }

    /** Huỷ mọi lượt đang chờ — dùng khi đóng màn hình. */
    function cancelAll() {
      Object.keys(pending).forEach(function (id) {
        pending[id]({ ok: false, reason: FAIL.CANCELLED, message: 'đóng màn hình', canFallbackToManual: true });
      });
      return R.ok(true);
    }

    function pendingCount() { return Object.keys(pending).length; }

    return {
      FAIL: FAIL,
      available: available,
      scan: scan,
      handleNativeResult: handleNativeResult,
      manualEntry: manualEntry,
      cancelAll: cancelAll,
      pendingCount: pendingCount
    };
  }

  return { DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS, createScanner: createScanner };
});
