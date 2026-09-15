/**
 * Clock — nguồn thời gian DUY NHẤT, tiêm được để test.
 *
 * Invariant T4 (UNIFIED-READ-LAYER-CONTRACT-V1.md §7): cấm `new Date()` rải rác.
 * Lý do thực tế: point-in-time resolve (FIFO-COMPACTION-CONTRACT-V1.md §1 V2/V3)
 * chỉ đúng khi mọi nơi đồng ý "bây giờ là lúc nào" và "hôm nay là ngày nào".
 * Legacy tính businessDate ở nhiều chỗ theo nhiều cách, không test được.
 */
GIEO.define('shared-kernel/clock', [], function () {
  'use strict';

  /**
   * Ranh giới ngày làm việc.
   *
   * [CẦN XÁC NHẬN] Mặc định 0h. Chưa có bằng chứng trong tài liệu audit về việc
   * quán chốt ngày ở giờ khác (ví dụ bán qua nửa đêm thì doanh thu 1h sáng tính
   * cho ngày hôm trước). Theo invariant #12 "không đoán legacy semantics khi
   * ambiguous" — để thành tham số cấu hình thay vì hard-code, và phải hỏi chủ
   * quán trước khi chạy thật. Đổi giá trị này làm đổi mọi báo cáo theo ngày.
   */
  var DEFAULT_DAY_START_HOUR = 0;

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function createClock(opts) {
    opts = opts || {};
    var dayStartHour = opts.dayStartHour === undefined ? DEFAULT_DAY_START_HOUR : opts.dayStartHour;
    if (typeof dayStartHour !== 'number' || dayStartHour < 0 || dayStartHour > 23) {
      throw new Error('[clock] dayStartHour phải trong 0..23, nhận: ' + dayStartHour);
    }
    /* now() tiêm được: test truyền hàm cố định, production dùng Date.now. */
    var nowFn = opts.now || function () { return Date.now(); };

    function now() { return nowFn(); }

    /** businessDate dạng 'YYYY-MM-DD' theo giờ địa phương, đã trừ ranh giới ngày. */
    function businessDate(ts) {
      var d = new Date(ts === undefined ? now() : ts);
      if (dayStartHour > 0 && d.getHours() < dayStartHour) {
        d = new Date(d.getTime() - 24 * 3600 * 1000);
      }
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /** monthKey dạng 'YYYY-MM' — khoá chốt sổ tháng. */
    function monthKey(ts) {
      return businessDate(ts).slice(0, 7);
    }

    /**
     * Liệt kê từng ngày trong khoảng — nền của quy tắc V3
     * ("resolve TỪNG NGÀY, cấm 1 mốc đại diện cả khoảng").
     * Có hàm này thì không còn lý do để ai đó resolve 1 lần tại ngày cuối kỳ.
     */
    function eachDay(fromTs, toTs) {
      if (toTs < fromTs) throw new Error('[clock] eachDay: to < from');
      var out = [];
      var cur = new Date(fromTs);
      var last = businessDate(toTs);
      for (var guard = 0; guard < 4000; guard++) {
        var key = businessDate(cur.getTime());
        out.push(key);
        if (key >= last) return out;
        cur = new Date(cur.getTime() + 24 * 3600 * 1000);
      }
      throw new Error('[clock] eachDay: khoảng quá dài (>4000 ngày)');
    }

    return {
      now: now,
      businessDate: businessDate,
      monthKey: monthKey,
      eachDay: eachDay,
      dayStartHour: dayStartHour
    };
  }

  return {
    createClock: createClock,
    DEFAULT_DAY_START_HOUR: DEFAULT_DAY_START_HOUR
  };
});
