/**
 * Clock — nguồn thời gian DUY NHẤT, tiêm được để test.
 *
 * Invariant T4 (UNIFIED-READ-LAYER-CONTRACT-V1.md §7): cấm `new Date()` rải rác.
 *
 * QUAN TRỌNG — clock KHÔNG quyết định `businessDate`.
 * Đã xác nhận với chủ quán: ngày làm việc đóng lại bằng thao tác "chốt ngày"
 * ở QUANLY sau khi kết ca, không phải bằng một mốc giờ cố định. Nên businessDate
 * là TRẠNG THÁI VẬN HÀNH (xem store-context/business-day), không phải phép tính
 * từ timestamp. Ở đây chỉ có lịch thuần: hôm nay là ngày mấy trên tờ lịch.
 *
 * Trộn 2 khái niệm này là cách sinh ra loại bug "doanh thu nhảy sang ngày khác
 * lúc 0h dù ca chưa kết" — nên chúng được tách bằng tên gọi, không bằng ghi chú.
 */
GIEO.define('shared-kernel/clock', [], function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function createClock(opts) {
    opts = opts || {};
    /* now() tiêm được: test truyền hàm cố định, production dùng Date.now. */
    var nowFn = opts.now || function () { return Date.now(); };

    function now() { return nowFn(); }

    /** Ngày trên tờ lịch, 'YYYY-MM-DD'. KHÔNG phải businessDate. */
    function calendarDate(ts) {
      var d = new Date(ts === undefined ? now() : ts);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /** 'YYYY-MM' — khoá chốt sổ tháng. */
    function monthKey(dateKeyOrTs) {
      if (typeof dateKeyOrTs === 'string') return dateKeyOrTs.slice(0, 7);
      return calendarDate(dateKeyOrTs).slice(0, 7);
    }

    /**
     * Liệt kê từng ngày lịch trong khoảng — nền của quy tắc V3
     * ("resolve TỪNG NGÀY, cấm 1 mốc đại diện cả khoảng").
     * Có sẵn hàm này thì không còn lý do để ai đó resolve 1 lần tại ngày cuối kỳ.
     */
    function eachDay(fromTs, toTs) {
      if (toTs < fromTs) throw new Error('[clock] eachDay: to < from');
      var out = [];
      var cur = fromTs;
      var last = calendarDate(toTs);
      for (var guard = 0; guard < 4000; guard++) {
        var key = calendarDate(cur);
        out.push(key);
        if (key >= last) return out;
        cur += 24 * 3600 * 1000;
      }
      throw new Error('[clock] eachDay: khoảng quá dài (>4000 ngày)');
    }

    /** Cộng/trừ ngày trên chuỗi 'YYYY-MM-DD' mà không đụng timestamp. */
    function addDays(dateKey, n) {
      var p = dateKey.split('-');
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function isDateKey(s) {
      return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    }

    return {
      now: now,
      calendarDate: calendarDate,
      monthKey: monthKey,
      eachDay: eachDay,
      addDays: addDays,
      isDateKey: isDateKey
    };
  }

  return { createClock: createClock };
});
