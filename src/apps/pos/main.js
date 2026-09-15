/**
 * POS entry — THIN CLIENT.
 *
 * Giai đoạn hiện tại: SCAFFOLD, READ-ONLY. Hệ thống cũ vẫn chạy production.
 * Màn này chưa nối Firebase, chưa có nghiệp vụ nào — nó chỉ chứng minh khung
 * layer + luật import-direction chạy thật, không phải thư mục rỗng.
 */
GIEO.define('app-pos/main', [
  'shared-kernel/ids',
  'shared-kernel/clock',
  'shared-kernel/result',
  'shared-kernel/operation-state'
], function (ids, clock, R, opState) {
  'use strict';

  function start() {
    var c = clock.createClock();
    var el = document.getElementById('app');

    /* Tự kiểm tra: nếu bất kỳ nền tảng nào sai thì hiện ra ngay, không im lặng. */
    var checks = [];
    function check(name, fn) {
      try {
        var detail = fn();
        checks.push({ name: name, ok: true, detail: detail });
      } catch (e) {
        checks.push({ name: name, ok: false, detail: e.message });
      }
    }

    check('Branded id tách loại', function () {
      var u = ids.newId('unit');
      if (ids.isId(u, 'bill')) throw new Error('unitId bị nhận nhầm là billId');
      return u;
    });
    check('operationId xác định (idempotency)', function () {
      var a = ids.deterministicId('operation', ['sale', 'bill-9', 'item-3']);
      var b = ids.deterministicId('operation', ['sale', 'bill-9', 'item-3']);
      if (a !== b) throw new Error('cùng input ra 2 id khác nhau');
      return a;
    });
    check('Lỗi không biến thành số 0', function () {
      var r = R.err('NOT_FOUND', 'chưa có dữ liệu');
      if (R.isOk(r) || r.value === 0) throw new Error('lỗi bị nuốt');
      return r.error.kind;
    });
    check('Operation COMPLETED là trạng thái cuối', function () {
      var r = opState.transition('COMPLETED', 'RUNNING');
      if (R.isOk(r)) throw new Error('cho phép chạy lại operation đã hoàn tất');
      return r.error.kind;
    });
    check('businessDate', function () { return c.calendarDate(); });

    var failed = checks.filter(function (x) { return !x.ok; });
    var mods = GIEO.inventory();

    el.innerHTML =
      '<h1 style="font-size:18px;margin:0 0 4px">GIEO POS</h1>' +
      '<p style="margin:0 0 16px;color:#666">Scaffold — READ-ONLY. Hệ thống cũ vẫn chạy production.</p>' +
      '<p style="padding:8px 12px;border-radius:6px;background:' +
        (failed.length ? '#fdecea' : '#e8f5e9') + '">' +
        (failed.length ? failed.length + ' kiểm tra nền tảng THẤT BẠI' : 'Nền tảng OK — ' + checks.length + '/' + checks.length) +
      '</p>' +
      '<ul style="padding-left:18px">' +
        checks.map(function (x) {
          return '<li>' + (x.ok ? '✓' : '✗') + ' ' + x.name +
            ' <code style="color:#666">' + String(x.detail) + '</code></li>';
        }).join('') +
      '</ul>' +
      '<h2 style="font-size:14px;margin-top:20px">Module đã nạp (' + mods.length + ')</h2>' +
      '<ul style="padding-left:18px;color:#555">' +
        mods.map(function (m) { return '<li><code>' + m.id + '</code></li>'; }).join('') +
      '</ul>';
  }

  return { start: start };
});
