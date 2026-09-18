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
  'recipe-cost-btp/recipe',
  'alerts/alert'
], function (ids, R, access, merge, projection, traceLib, menuLib, recipeLib, alertLib) {
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
    /* CP1 (NET-CATALOG-PROMOTION-V1.md) — cùng authority với GetMenu: POS
       cần đọc khả dụng để làm mờ nút, không phải quyền riêng. */
    GetMenuAvailability: registerQuery('GetMenuAvailability', { authority: 'EXECUTE' }),
    /* NET-SALES-V1.md VIỆC PHẢI LÀM #3 — POS cần đọc khuyến mãi ĐANG BẬT
       trước khi checkout để nối vào catalog/promotion.js, thay 2 nhánh if
       hard-code (onCheckoutClick/checkFreeToppingMemberPromo/
       checkTogoBeforeCheckout của legacy). Cùng authority với GetMenu — đọc
       khuyến mãi để tính giỏ không phải quyền riêng. */
    GetActivePromotions: registerQuery('GetActivePromotions', { authority: 'EXECUTE' }),
    GetInventoryLevel: registerQuery('GetInventoryLevel', { authority: 'EXECUTE' }),
    GetConsumption: registerQuery('GetConsumption', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* Dữ liệu nhạy cảm mặc định KHÔNG thuộc tầng EXECUTE (quy tắc P3). */
    GetRevenue: registerQuery('GetRevenue', { authority: 'REVIEW_APPROVE_CORRECT' }),
    GetCOGS: registerQuery('GetCOGS', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* LỊCH SỬ BILL (port từ quanlygieo.html#qlLoadBills) — cùng authority với
       GetRevenue/GetCOGS: liệt kê bill tức là thấy doanh thu + SĐT khách từng
       đơn, nhạy cảm hơn GetMenu/GetShiftStatus. */
    GetBillsForRange: registerQuery('GetBillsForRange', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* Nguồn originalAllocations cho ReverseTransaction khi xoá bill — cùng
       authority với GetBillsForRange (xem hàm bên dưới). */
    GetLedgerEntriesForReference: registerQuery('GetLedgerEntriesForReference', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* NET-LOYALTY-V1.md VIỆC PHẢI LÀM #4 — nguồn eventData.loyaltyEntries cho
       ReverseTransaction khi xoá bill (để L5 chạy thật qua sự kiện OrderVoided).
       Cùng authority với GetBillsForRange/GetLedgerEntriesForReference — cùng
       màn hình, cùng mức nhạy cảm (doanh thu + khách hàng). */
    GetLoyaltyLedgerForReference: registerQuery('GetLoyaltyLedgerForReference', { authority: 'REVIEW_APPROVE_CORRECT' }),
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
    GetPendingApprovals: registerQuery('GetPendingApprovals', { authority: 'REVIEW_APPROVE_CORRECT' }),
    /* PR2b (NET-PAYROLL-V1.md) — đường ĐỌC lương tháng qua đúng cổng đọc,
       cùng authority với ClosePayroll. read-layer KHÔNG được import hr
       (src/layer-rules.json) nên tính trực tiếp trên spec denormalized,
       giống getShiftStatus bên dưới — không gọi lại hr/payroll.js. */
    GetPayrollForMonth: registerQuery('GetPayrollForMonth', { authority: 'REVIEW_APPROVE_CORRECT' })
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
   * CP1 — Sold-out DẪN XUẤT TỪ FIFO (`catalog/menu.js#computeAvailability`),
   * chưa có nơi gọi nào trước đây (NET-CATALOG-PROMOTION-V1.md VIỆC PHẢI LÀM
   * #1) — cùng dạng gap "logic đúng, chưa nối" như CP7/promotion.evaluate().
   *
   * CHỈ QUERY ĐỌC, không chặn RecordSale (§2.3a): kết quả dùng để LÀM MỜ nút
   * ở POS, không phải PRECONDITION mới trên đường bán — legacy vốn không
   * chặn gì cả (kho âm mà không ai biết), nên "biết trước sẽ âm" đã là một
   * bước tiến, không phải một chặn mới.
   *
   * `size` bắt buộc vì định mức khai riêng theo size (M/L) — khả dụng của
   * size L có thể khác size M dù cùng 1 món. `versionRegistry` optional:
   * thiếu thì `recipeComponents` về null, `computeAvailability` tự trả
   * NO_RECIPE/unknown — đúng nguyên tắc "thiếu metadata thì nói ra được",
   * không suy đoán bừa.
   */
  function getMenuAvailability(ctx, spec) {
    var g = guard(Q.GetMenuAvailability, ctx, spec);
    if (R.isErr(g)) return g;
    if (!spec.menuItem) return R.err('VALIDATION', 'getMenuAvailability cần menuItem');
    if (!spec.size) return R.err('VALIDATION', 'getMenuAvailability cần size — khả dụng khác nhau theo size');

    return merge.resolve({
      computeLive: function () {
        var components = null;
        if (spec.menuItem.recipeId && spec.versionRegistry) {
          var rv = recipeLib.resolveRecipeAt(spec.versionRegistry, {
            recipeId: spec.menuItem.recipeId, storeId: ctx.storeId, at: spec.at || ctx.clock.now()
          });
          if (R.isOk(rv)) {
            /* toRequirements() chuẩn hoá refId → itemId (đúng khuôn mà
               computeAvailability đòi) — components thô của RecipeVersion
               mang refId, không phải itemId. */
            var req = recipeLib.toRequirements(rv.value, { size: spec.size, qty: 1 });
            if (R.isOk(req)) components = req.value.requirements;
          }
        }
        return R.ok(menuLib.computeAvailability({
          menuItem: spec.menuItem,
          recipeComponents: components,
          stockByItemId: spec.stockByItemId || {}
        }));
      },
      computedAt: ctx.clock.now()
    });
  }

  /**
   * NET-SALES-V1.md VIỆC PHẢI LÀM #3 — khuyến mãi ĐANG BẬT cho POS đọc
   * TRƯỚC checkout, để `catalog/promotion.js#evaluate()` (đã nối vào
   * `commands/sales.js#buildBill`, CP7) có `promotions` thật thay vì mảng
   * rỗng. Không có bản dịch từ legacy (`togoSettings`/`assistConfig.
   * campaigns` không có `tier`/`priority`/`exclusivityGroup` tường minh —
   * xem đầu `catalog/promotion.js`), nên khuyến mãi CHỈ tồn tại qua
   * `CreatePromotion` — caller mang canonical `spec.promotions` đã đọc từ
   * store, đúng khuôn `getMenuAvailability` ở trên.
   */
  function getActivePromotions(ctx, spec) {
    var g = guard(Q.GetActivePromotions, ctx, spec);
    if (R.isErr(g)) return g;
    var storeId = g.value;

    return merge.resolve({
      computeLive: function () {
        var list = (spec.promotions || []).filter(function (p) {
          return p.storeId === storeId && p.active !== false;
        });
        return R.ok({ promotions: list });
      },
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
   * PR2b — đọc lương tháng. `spec.closing` (nếu có) là snapshot PayrollClosing
   * ĐÃ CHỐT (hr/payroll.js#closePayroll) — đóng vai trò SNAPSHOT của
   * merge.resolve, đọc thẳng không tính lại. Không có thì đọc LIVE từ
   * `spec.liveResults` (caller tự tính bằng hr/payroll.js#computePayroll cho
   * từng nhân viên — "denormalized input" giống ClosePayroll, ở đây không
   * loop qua toàn bộ nhân viên).
   *
   * Có cả hai thì kèm luôn `drift` — số sống đã trôi khỏi số đã chốt hay
   * chưa (tương đương hr/payroll.js#detectPayrollDrift, tính lại tại chỗ vì
   * read-layer không được import hr — xem lý do ở Q.GetPayrollForMonth).
   */
  function getPayrollForMonth(ctx, spec) {
    var g = guard(Q.GetPayrollForMonth, ctx, spec);
    if (R.isErr(g)) return g;

    var result = merge.resolve({
      snapshot: spec.closing || null,
      computeLive: function () { return R.ok(spec.liveResults || []); },
      computedAt: ctx.clock.now()
    });
    if (R.isErr(result)) return result;

    if (spec.closing && spec.liveResults) {
      var byId = Object.create(null);
      spec.liveResults.forEach(function (r) { byId[r.employeeId] = r; });
      var drift = [];
      (spec.closing.lines || []).forEach(function (l) {
        var live = byId[l.employeeId];
        if (!live) {
          drift.push({ employeeId: l.employeeId, reason: 'KHÔNG CÒN DỮ LIỆU SỐNG', frozen: l.total, live: null });
          return;
        }
        if (live.total !== l.total) {
          drift.push({
            employeeId: l.employeeId, reason: 'SỐ SỐNG KHÁC SỐ ĐÃ CHỐT',
            frozen: l.total, live: live.total, difference: live.total - l.total
          });
        }
      });
      result.value.data = Object.assign({}, result.value.data, {
        drift: { monthKey: spec.closing.monthKey, clean: drift.length === 0, drift: drift }
      });
    }

    return result;
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

  /**
   * LỊCH SỬ BILL — MỘT implementation nhóm-theo-ngày cho danh sách bill trong
   * khoảng [from, to] (R3: POS lẫn QUANLY gọi chung, không tự dựng lại).
   *
   * Không tự lọc theo chuỗi tìm kiếm (số điện thoại/mã bill/mã CK — xem
   * qlRenderBillList) ở đây: đó là thao tác hiển thị thuần trên dữ liệu ĐÃ
   * được cấp quyền đọc, không phải một truy vấn cần xin quyền lại mỗi phím
   * gõ. Tầng UI (main.js) tự lọc trên mảng `bills` trả về.
   */
  function getBillsForRange(ctx, spec) {
    var g = guard(Q.GetBillsForRange, ctx, spec);
    if (R.isErr(g)) return g;

    return merge.resolve({
      snapshot: spec.snapshot,
      cache: spec.cache,
      computeLive: function () {
        var bills = (spec.bills || []).slice().sort(function (a, b) {
          var at = String(a.occurredAt || ''), bt = String(b.occurredAt || '');
          if (at !== bt) return at < bt ? 1 : -1;
          return String(b.billId).localeCompare(String(a.billId));
        });
        var byDate = {};
        var totalRevenue = 0;
        bills.forEach(function (b) {
          var k = b.businessDate || 'UNKNOWN';
          if (!byDate[k]) byDate[k] = { businessDate: k, billCount: 0, total: 0 };
          byDate[k].billCount += 1;
          byDate[k].total += b.total || 0;
          totalRevenue += b.total || 0;
        });
        return R.ok({
          bills: bills,
          billCount: bills.length,
          totalRevenue: totalRevenue,
          byDate: byDate
        });
      },
      computedAt: ctx.clock.now()
    });
  }

  /**
   * Ledger entries của một referenceId (billId) — nguồn `originalAllocations`
   * cho ReverseTransaction lúc xoá bill (LỊCH SỬ BILL §3.8). `spec.entries` do
   * `bootstrap/canonical-data-source.js#forQuery` cấp SẴN trước khi tới đây —
   * chỉ bill ghi qua canonical (RecordSale trở đi) mới có; bill nguồn legacy
   * KHÔNG có gì (mảng rỗng). Đây KHÔNG phải giới hạn tạm — `mapUnit`/
   * `mapLedgerEntry` (legacy-firebase-adapter/mappers.js) dùng namespace
   * `'legacy'` cho unitId, còn `commands/takeover.js` seed Unit thật vào
   * workingSet bằng namespace `'seed'` — hai id KHÔNG BAO GIỜ trùng nhau, nên
   * dù có đọc được giao dịch tiêu hao gốc của bill legacy cũng không suy ra
   * được unit THẬT nào trong workingSet hiện tại để hoàn ngược chính xác.
   * `coverage:'untracked'` ở đây là tín hiệu trung thực cho UI — không phải
   * lỗi — khớp đúng đường `originalAllocations` rỗng mà
   * `fifo-core/reconciliation.js#reverseAllocations` đã có sẵn (coverage
   * 'untracked' → cờ needsManualReview, không đụng vào tồn kho).
   */
  function getLedgerEntriesForReference(ctx, spec) {
    var g = guard(Q.GetLedgerEntriesForReference, ctx, spec);
    if (R.isErr(g)) return g;
    if (!spec.referenceId) return R.err('VALIDATION', 'getLedgerEntriesForReference cần referenceId');
    if (!spec.domain) return R.err('VALIDATION', 'getLedgerEntriesForReference cần domain (raw|prep)');
    var entries = spec.entries || [];
    return R.ok({
      referenceId: spec.referenceId,
      domain: spec.domain,
      entries: entries,
      coverage: entries.length ? 'traceable' : 'untracked'
    });
  }

  /**
   * Dòng sổ loyalty (`loyalty/ledger.js`) của một billId — nguồn
   * `eventData.loyaltyEntries` cho ReverseTransaction khi xoá bill
   * (NET-LOYALTY-V1.md VIỆC PHẢI LÀM #4). `spec.entries` do
   * `bootstrap/canonical-data-source.js#forQuery` cấp sẵn, cùng cơ chế với
   * `getLedgerEntriesForReference` ở trên — bill legacy không có gì (mảng
   * rỗng, KHÔNG phải lỗi: AccrueLoyaltyForSale chưa từng chạy cho bill đó).
   */
  function getLoyaltyLedgerForReference(ctx, spec) {
    var g = guard(Q.GetLoyaltyLedgerForReference, ctx, spec);
    if (R.isErr(g)) return g;
    if (!spec.billId) return R.err('VALIDATION', 'getLoyaltyLedgerForReference cần billId');
    return R.ok({ billId: spec.billId, entries: spec.entries || [] });
  }

  return {
    QUERIES: Q,
    registerQuery: registerQuery,
    guardRead: guard,
    getUnitTrace: getUnitTrace,
    getMenu: getMenu,
    getMenuAvailability: getMenuAvailability,
    getActivePromotions: getActivePromotions,
    getInventoryLevel: getInventoryLevel,
    getRevenue: getRevenue,
    getCOGS: getCOGS,
    getBillsForRange: getBillsForRange,
    getLedgerEntriesForReference: getLedgerEntriesForReference,
    getLoyaltyLedgerForReference: getLoyaltyLedgerForReference,
    getPnL: getPnL,
    comparePeriods: comparePeriods,
    getShiftStatus: getShiftStatus,
    getAlerts: getAlerts,
    getPendingApprovals: getPendingApprovals,
    getPayrollForMonth: getPayrollForMonth
  };
});
