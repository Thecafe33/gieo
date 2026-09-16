/**
 * Read gateway — CỔNG ĐỌC DUY NHẤT.
 *
 * Contract: UNIFIED-READ-LAYER-CONTRACT-V1.md.
 *
 * Ba invariant nặng nhất được cài vào chính cấu trúc, không phải bằng lời nhắc:
 *
 * R3 — MỘT canonical query, MỘT implementation. Legacy có 2 pipeline doanh thu
 *      độc lập (POS tự tính, QUANLY tự tính) không đảm bảo khớp nhau. Ở đây cả
 *      hai app gọi cùng một hàm, nên không tồn tại khả năng lệch.
 *
 * R5/§5 — PHÂN QUYỀN ĐỌC. Gap đã xác nhận: Reporting legacy có 0% phân quyền —
 *      QUANLY dùng một tài khoản Firebase dùng chung nên mọi người thấy toàn bộ
 *      P&L/COGS/khách hàng. Ở đây mọi API đăng ký quyền, và MẶC ĐỊNH ĐÓNG:
 *      query chưa khai quyền thì bị từ chối.
 *
 * R8/§3 — COGS luôn 2 vế. Cấm tồn tại field tên `cogsActual` chứa theoretical.
 */
GIEO.define('read-layer/gateway', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'store-context/access',
  'read-layer/merge-canonical',
  'fifo-core/projection',
  'traceability/trace',
  'catalog/menu',
  'alerts/alert'
], function (ids, R, access, merge, projection, traceLib, menuLib, alertLib) {
  'use strict';

  /**
   * Đăng ký query đọc. Đi qua CÙNG sổ quyền với command ghi — quyền đọc không
   * phải hạng hai.
   */
  function registerQuery(name, spec) {
    access.registerCommand(name, {
      authority: spec.authority,
      mutates: false,
      sources: spec.sources,
      crossStore: spec.crossStore
    });
    return name;
  }

  var Q = {
    GetUnitTrace: registerQuery('GetUnitTrace', { authority: 'EXECUTE' }),
    GetMenu: registerQuery('GetMenu', { authority: 'EXECUTE' }),
    GetInventoryLevel: registerQuery('GetInventoryLevel', { authority: 'EXECUTE' }),
    GetConsumption: registerQuery('GetConsumption', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* Dữ liệu nhạy cảm mặc định KHÔNG thuộc tầng EXECUTE (quy tắc P3). */
    GetRevenue: registerQuery('GetRevenue', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetCOGS: registerQuery('GetCOGS', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetPnL: registerQuery('GetPnL', { authority: 'MASTER_CONFIGURE' }),
    GetCustomerReport: registerQuery('GetCustomerReport', { authority: 'MASTER_CONFIGURE' }),
    /* Ba query dưới đây sinh ra để P9/P10 không còn màn nào tự đọc nguồn thô.
       Trước đó màn Ca/Tổng quan/Duyệt chỉ có chỗ trống hard-code, và chỗ trống
       hard-code chính là nơi người ta sẽ nối thẳng Firebase vào UI. */
    /* Any-of, đúng kiểu các dòng §21 cho phép nhiều tầng quyền cùng chạy một
       lệnh: người bán cần thấy ca và cảnh báo để làm việc, quản lý cần thấy
       chính hai thứ đó trên màn Tổng quan. Khai riêng EXECUTE sẽ khoá quản lý
       ra khỏi màn của họ. Lọc theo `audience` mới là chỗ quyết ai thấy gì. */
    GetShiftStatus: registerQuery('GetShiftStatus', {
      authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT']
    }),
    GetAlerts: registerQuery('GetAlerts', {
      authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT']
    }),
    GetPendingApprovals: registerQuery('GetPendingApprovals', { authority: 'REVIEW_APPROVE_CORRECT' })
  };

  /**
   * Cổng chung: quyền + storeId bắt buộc, trước khi chạm dữ liệu.
   * Được export ra dưới tên `guardRead` để tầng reporting dùng CHUNG đúng một
   * cổng này — viết cổng thứ hai là cách phân quyền đọc trôi khỏi một chỗ.
   */
  function guard(queryName, ctx, spec) {
    if (!ctx || !ctx.actor) return R.err('FORBIDDEN', 'không có context — mọi read phải biết ai đọc');
    var storeId = (spec && spec.storeId) || ctx.storeId;
    if (!ids.isId(storeId, 'store')) {
      return R.err('VALIDATION', 'mọi query phải nêu rõ storeId (quy tắc P5)');
    }
    var auth = access.authorize(ctx.actor, queryName, storeId);
    if (R.isErr(auth)) return auth;
    return R.ok(storeId);
  }

  /** Vòng đời đầy đủ 1 Unit. */
  function getUnitTrace(ctx, spec) {
    var g = guard(Q.GetUnitTrace, ctx, spec);
    if (R.isErr(g)) return g;
    if (!ids.isId(spec.unitId, 'unit')) return R.err('VALIDATION', 'getUnitTrace cần unitId hợp lệ');

    return merge.resolve({
      snapshot: spec.snapshot,
      computeLive: function () {
        if (!spec.unit) return R.ok(null);
        return traceLib.buildUnitTrace({
          unit: spec.unit,
          ledgerEntries: spec.ledgerEntries || [],
          allocations: spec.allocations || []
        });
      },
      legacy: spec.legacyTrace,
      computedAt: ctx.clock.now()
    });
  }

  /** Tồn kho hiện tại — công thức DUY NHẤT của fifo-core/projection. */
  function getInventoryLevel(ctx, spec) {
    var g = guard(Q.GetInventoryLevel, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      computeLive: function () {
        var r = projection.computeCurrentStock({
          units: spec.units || [],
          untrackedBase: spec.untrackedBase || 0,
          ledgerEntries: spec.ledgerEntries || []
        });
        return R.isErr(r) ? r : R.ok(r.value);
      },
      computedAt: ctx.clock.now()
    });
  }

  /** Catalog canonical; POS chỉ đọc, không bao giờ ghi menu. */
  function getMenu(ctx, spec) {
    var g = guard(Q.GetMenu, ctx, spec);
    if (R.isErr(g)) return g;
    return merge.resolve({
      cache: spec.cache,
      computeLive: function () {
        return menuLib.buildMenuView({
          categories: spec.categories || [], menuItems: spec.menuItems || []
        });
      },
      legacy: spec.legacyMeta ? function () { return R.ok(spec.legacyMeta); } : null,
      computedAt: ctx.clock.now()
    });
  }

  /**
   * Doanh thu — MỘT implementation cho cả POS lẫn QUANLY (R3).
   * Trừ phí sàn để ra doanh thu thuần: đường ống legacy chưa từng nối.
   */
  function getRevenue(ctx, spec) {
    var g = guard(Q.GetRevenue, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      snapshot: spec.snapshot,
      cache: spec.cache,
      computeLive: function () {
        var bills = spec.bills || [];
        var byChannel = {};
        var gross = 0, fees = 0, net = 0, discounts = 0;

        bills.forEach(function (b) {
          gross += b.total;
          fees += b.channelFee || 0;
          net += b.netRevenue;
          discounts += b.discountTotal || 0;
          var k = b.channel ? b.channel.type : 'UNKNOWN';
          if (!byChannel[k]) byChannel[k] = { gross: 0, fees: 0, net: 0, billCount: 0 };
          byChannel[k].gross += b.total;
          byChannel[k].fees += b.channelFee || 0;
          byChannel[k].net += b.netRevenue;
          byChannel[k].billCount += 1;
        });

        return R.ok({
          billCount: bills.length,
          grossRevenue: gross,
          discountTotal: discounts,
          channelFees: fees,
          netRevenue: net,
          /* Tách theo kênh — dữ liệu legacy đã có nhưng P&L chỉ 1 số tổng. */
          byChannel: byChannel
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  /**
   * COGS — BẮT BUỘC 2 vế (§3, invariant R8).
   *
   * Cộng từ `bill.cogs` đã ghi lúc bán (V4: đọc versionId đã lưu, KHÔNG resolve
   * lại). Bill nào thiếu vế actual thì tổng actual là null — không bù bằng
   * theoretical để tổng trông đẹp.
   */
  function getCOGS(ctx, spec) {
    var g = guard(Q.GetCOGS, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      snapshot: spec.snapshot,
      cache: spec.cache,
      computeLive: function () {
        var bills = spec.bills || [];
        var theoretical = 0;
        var actual = 0;
        var missingActual = [];
        var versionIds = [];

        bills.forEach(function (b) {
          var c = b.cogs;
          if (!c) { missingActual.push({ billId: b.billId, reason: 'NO_COGS' }); return; }
          theoretical += c.cogsTheoretical;
          if (c.cogsActual === null) {
            missingActual.push({ billId: b.billId, reason: c.cogsActualReason || 'UNKNOWN' });
          } else {
            actual += c.cogsActual;
          }
          if (c.basis && c.basis.costBasisVersionIds) {
            versionIds = versionIds.concat(c.basis.costBasisVersionIds);
          }
        });

        var actualComplete = missingActual.length === 0 && bills.length > 0;
        var cogsActual = actualComplete ? actual : null;

        return R.ok({
          cogsTheoretical: theoretical,
          cogsActual: cogsActual,
          cogsActualPartial: actualComplete ? null : actual,
          variance: cogsActual === null ? null : cogsActual - theoretical,
          variancePct: (cogsActual === null || theoretical === 0)
            ? null : ((cogsActual - theoretical) / theoretical) * 100,
          missingActual: missingActual,
          basis: {
            costBasisVersionIds: versionIds.filter(function (v, i, a) { return v && a.indexOf(v) === i; })
          }
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  /**
   * P&L. Kỳ đã chốt → đọc thẳng snapshot, không tính lại (§3.1 compaction).
   * `frozen` trong meta cho UI biết cột nào là số đóng băng (quy tắc T3).
   */
  function getPnL(ctx, spec) {
    var g = guard(Q.GetPnL, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      snapshot: spec.closing,
      computeLive: function () {
        var rev = spec.revenue;
        var cogs = spec.cogs;
        var exp = spec.expenses;
        if (!rev || !cogs) return R.ok(null);

        var grossProfit = rev.netRevenue - (cogs.cogsActual !== null ? cogs.cogsActual : cogs.cogsTheoretical);
        return R.ok({
          netRevenue: rev.netRevenue,
          cogsTheoretical: cogs.cogsTheoretical,
          cogsActual: cogs.cogsActual,
          /* Nói rõ lãi đang tính theo vế nào — legacy chỉ có 1 số nên không cần
             nói, và cũng vì thế không ai biết nó là số gì. */
          cogsBasisUsed: cogs.cogsActual !== null ? 'ACTUAL' : 'THEORETICAL',
          grossProfit: grossProfit,
          expenses: exp ? exp.total : 0,
          fixedExpenses: exp ? exp.fixed : 0,
          variableExpenses: exp ? exp.variable : 0,
          netProfit: grossProfit - (exp ? exp.total : 0),
          /* Còn khoản ước tính thì lãi này chưa phải số cuối. */
          hasEstimatedExpenses: !!(exp && exp.estimated > 0)
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  /**
   * So sánh 2 kỳ — mỗi cột mang cờ `frozen` riêng (quy tắc T3).
   * Legacy để cả 2 cột tính sống nên so sánh trôi theo thời gian.
   */
  function comparePeriods(ctx, spec) {
    var g = guard(Q.GetPnL, ctx, spec);
    if (R.isErr(g)) return g;
    if (!spec.current || !spec.previous) {
      return R.err('VALIDATION', 'so sánh kỳ cần cả 2 kỳ');
    }
    return R.ok({
      current: { data: spec.current.data, frozen: spec.current.meta.frozen },
      previous: { data: spec.previous.data, frozen: spec.previous.meta.frozen },
      /* Cả 2 cột đều sống thì so sánh này sẽ đổi theo thời gian — nói ra. */
      bothLive: !spec.current.meta.frozen && !spec.previous.meta.frozen
    });
  }

  /**
   * Trạng thái ca + két — nguồn cho màn Ca ở POS và ô "hôm nay" ở QUANLY.
   *
   * businessDate là TRẠNG THÁI VẬN HÀNH (mở/chốt ở QUANLY), không phải phép tính
   * từ đồng hồ. Query này vì thế đọc bản ghi ngày làm việc, tuyệt đối không tự
   * suy ra ngày từ `clock` — suy ra ở UI là cách hai máy hiển thị hai ngày khác
   * nhau lúc nửa đêm.
   */
  function getShiftStatus(ctx, spec) {
    var g = guard(Q.GetShiftStatus, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      computeLive: function () {
        var day = spec.businessDay || null;
        var segments = spec.segments || [];
        var employeeShifts = spec.employeeShifts || [];

        var openSegment = null;
        for (var i = 0; i < segments.length; i++) {
          if (segments[i].status === 'OPEN') { openSegment = segments[i]; break; }
        }
        var onShift = employeeShifts.filter(function (s) { return s.status === 'OPEN'; });

        return R.ok({
          businessDate: day ? day.businessDate : null,
          dayStatus: day ? day.status : null,
          /* Không có ngày mở = không được bán. Nói thẳng ra, đừng để UI tự đoán. */
          operable: !!(day && day.status === 'OPEN'),
          openSegment: openSegment ? {
            seq: openSegment.seq, openedAt: openSegment.openedAt, openedBy: openSegment.openedBy
          } : null,
          closedSegmentCount: segments.filter(function (s) { return s.status === 'CLOSED'; }).length,
          employeesOnShift: onShift.map(function (s) {
            return { shiftId: s.shiftId, employeeId: s.employeeId, checkedInAt: s.checkedInAt };
          })
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  /**
   * Cảnh báo theo đối tượng xem. Dùng `alertLib.bucketize` chứ không tự sắp lại
   * thứ tự ưu tiên: hai bản xếp hạng khác nhau giữa POS và QUANLY chính là kiểu
   * lệch mà R3 cấm.
   *
   * `audience` bắt buộc — không có mặc định "xem hết", vì mặc định xem hết chính
   * là cách reporting legacy đi tới 0% phân quyền.
   */
  function getAlerts(ctx, spec) {
    var g = guard(Q.GetAlerts, ctx, spec);
    if (R.isErr(g)) return g;
    var audience = spec.audience;
    if (audience !== alertLib.AUDIENCE.POS && audience !== alertLib.AUDIENCE.QUANLY) {
      return R.err('VALIDATION', "getAlerts cần audience 'POS' hoặc 'QUANLY'");
    }

    return merge.resolve({
      computeLive: function () {
        var visible = (spec.alerts || []).filter(function (a) {
          if (a.status === alertLib.STATUS.RESOLVED) return false;
          return a.audience === audience || a.audience === alertLib.AUDIENCE.BOTH;
        });
        var buckets = alertLib.bucketize(visible, { at: ctx.clock.now() });
        return R.ok({
          audience: audience,
          buckets: buckets,
          /* Đếm theo mức nặng, KHÔNG gộp thành một số tổng: một DANGER không
             được lẫn vào đám INFO rồi biến mất trong con số "12 cảnh báo". */
          counts: {
            DANGER: buckets.DANGER.length,
            WARNING: buckets.WARNING.length,
            INFO: buckets.INFO.length
          },
          total: visible.length
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  var APPROVAL_KINDS = {
    lostReport: { command: 'ApproveLostContainer', label: 'Báo mất hũ' },
    stockCount: { command: 'ApproveStockCount', label: 'Kiểm kê' },
    expense: { command: 'ApproveExpense', label: 'Chi phí' }
  };

  /**
   * Việc chờ duyệt, gom từ 3 nguồn về một danh sách có sẵn tên command để chạy.
   *
   * Vì sao gắn sẵn `command`: legacy để mỗi màn tự biết "duyệt cái này thì gọi
   * gì", nên có chỗ duyệt xong mà không chạy hệ quả (gap Bug #12/#16). Ở đây
   * danh sách và command đi kèm nhau, không có chỗ để nối sai.
   */
  function getPendingApprovals(ctx, spec) {
    var g = guard(Q.GetPendingApprovals, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      computeLive: function () {
        var items = [];
        var unknown = [];
        (spec.pending || []).forEach(function (p) {
          var kind = APPROVAL_KINDS[p.type];
          if (!kind) {
            /* Loại chưa khai = KHÔNG dựng nút duyệt. Dựng bừa một nút gọi command
               đoán được mới là thứ nguy hiểm. */
            unknown.push(p.type);
            return;
          }
          items.push({
            type: p.type,
            label: kind.label,
            command: kind.command,
            referenceId: p.referenceId,
            requestedBy: p.requestedBy || null,
            requestedAt: p.requestedAt || null,
            summary: p.summary || null
          });
        });
        return R.ok({
          items: items,
          byType: Object.keys(APPROVAL_KINDS).reduce(function (acc, k) {
            acc[k] = items.filter(function (i) { return i.type === k; }).length;
            return acc;
          }, {}),
          unknownTypes: unknown.filter(function (v, i, a) { return a.indexOf(v) === i; })
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  return {
    QUERIES: Q,
    registerQuery: registerQuery,
    guardRead: guard,
    getUnitTrace: getUnitTrace,
    getMenu: getMenu,
    getInventoryLevel: getInventoryLevel,
    getRevenue: getRevenue,
    getCOGS: getCOGS,
    getPnL: getPnL,
    comparePeriods: comparePeriods,
    getShiftStatus: getShiftStatus,
    getAlerts: getAlerts,
    getPendingApprovals: getPendingApprovals
  };
});
