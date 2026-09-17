/**
 * Bán hàng — Bill model + RecordSale.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md.
 * Gap: FEATURE-TREE-V1.md §4.7, §4.16; FIFO-CORE-ARCHITECTURE-V2.md §10b.1/§10b.7.
 *
 * Ba field/hành vi mà legacy thiếu, bổ sung ngay từ thiết kế (không thêm sau):
 *
 * 1. `soldByActorId` — NGOẠI LỆ DUY NHẤT của toàn hệ thống cũ. Mọi domain khác
 *    (stock transaction, prep batch, container, expense, cash count, checklist)
 *    đều ghi staffEmployeeId; riêng Bill thì không — chỉ có gate "có ai đó đang
 *    check-in", không biết CHÍNH XÁC ai bán. FEATURE-TREE §4.7 gọi đây là field
 *    còn thiếu quan trọng nhất trong toàn bộ audit tính năng.
 *
 * 2. `channel` (tại quán / mang đi / sàn) là first-class. Legacy ĐÃ ghi
 *    isToGo/isShip/isAppSale/appFeePct trên mỗi bill, nhưng `appFeePct` chỉ
 *    được GHI, KHÔNG BAO GIỜ ĐƯỢC ĐỌC (grep toàn bộ 2 file: đúng 1 kết quả —
 *    chính dòng ghi), và `plChannelFeeForDay()` hard-code return 0. Dữ liệu đã
 *    sẵn sàng, chỉ chưa nối đường ống. Ở đây phí sàn được TRỪ THẬT vào doanh
 *    thu thuần.
 *
 * 3. Addon phải kích hoạt lại Loyalty. Legacy `submitAddon` không gọi
 *    `loyaltyProcessAfterPay()`, nên khách trả thêm tiền mà không được cộng
 *    thêm điểm. Ở đây addon phát event để handler loyalty xử lý — side-effect
 *    là handler đăng ký riêng, không nhét vào lệnh bán.
 *
 * 4. Thiếu định mức KHÔNG chặn bán (N10, `NET-SALES-V1.md`, quyết định chủ
 *    quán 2026-09-17, §2.3a): legacy chỉ soft-warn qua Hộp thư, không chặn —
 *    bản đầu của core này từng trả `PRECONDITION` khi thiếu recipeId, một
 *    điểm chặn MỚI so với hệ cũ. Đã sửa: `buildRequirements` ghi nhận
 *    `gapLines` thay vì lỗi, `cogsTheoretical`/`cogsActual` của bill về
 *    `null` kèm `reason: 'NO_RECIPE'` (không âm thầm tính thiếu — xem
 *    `recipe-cost-btp/cogs.js`), và phát `MissingRecipeDetected` cho mỗi món
 *    thiếu để `bootstrap/domain-events.js` (L9) tạo alert `MISSING_RECIPE`
 *    (đã đăng ký sẵn trong `alerts/alert.js`, tự hết khi khai định mức xong).
 *
 * 5. Hết nguyên liệu thật KHÔNG chặn bán (quyết định chủ quán 2026-09: SOP cho
 *    phép thay thế nguyên liệu khi hết). Trước đây trả `PRECONDITION` khi
 *    `alloc.shortfalls.length` — bản đầu cố ý chặn CHẶT HƠN legacy (legacy để
 *    kho âm mà không ai biết). Đã sửa: mỗi shortfall đi qua
 *    `allocation.handleShortfall` (§3.3, cơ chế NỢ tường minh trên Unit đã có
 *    sẵn ở fifo-core, chỉ chưa được gọi), Unit gánh nợ được gắn `needsReview`,
 *    và phát `IngredientShortfallRecorded` để L9 tạo alert `UNIT_NEEDS_REVIEW`
 *    cho QUANLY — không âm thầm, không chặn nhân viên tại quầy.
 */
GIEO.define('commands/sales', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'catalog/menu',
  'catalog/packaging',
  'recipe-cost-btp/recipe',
  'recipe-cost-btp/cogs',
  'fifo-core/allocation'
], function (ids, R, pipeline, menuLib, packagingLib, recipeLib, cogsLib, allocation) {
  'use strict';

  var CHANNEL = {
    DINE_IN: 'DINE_IN',
    TO_GO: 'TO_GO',
    /* Sàn giao đồ ăn — có phí phần trăm, và phí đó PHẢI được đọc. */
    APP: 'APP'
  };

  function validateChannel(ch) {
    if (!ch || !CHANNEL[ch.type]) return "channel.type phải là DINE_IN | TO_GO | APP";
    if (ch.type === CHANNEL.APP) {
      if (!ch.appName) return 'bán qua sàn phải ghi rõ tên sàn';
      if (typeof ch.feePct !== 'number' || ch.feePct < 0 || ch.feePct > 100) {
        return 'bán qua sàn phải ghi feePct hợp lệ — legacy ghi rồi không bao giờ đọc, ' +
          'nên P&L theo kênh không bao giờ đúng';
      }
    }
    return null;
  }

  /**
   * Dựng Bill từ giỏ hàng.
   *
   * Mỗi dòng mang GIÁ ĐÃ SNAPSHOT (catalog/menu.snapshotPrice) — mẫu ĐÚNG của
   * legacy cần giữ: sửa giá menu sau này không làm trôi số liệu bill lịch sử.
   */
  function buildBill(spec) {
    if (!spec) return R.err('VALIDATION', 'buildBill cần spec');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'bill cần storeId hợp lệ');
    if (!ids.isId(spec.soldByActorId, 'actor')) {
      return R.err('VALIDATION',
        'bill BẮT BUỘC có soldByActorId — không biết ai bán là ngoại lệ duy nhất của hệ thống cũ (§4.7)');
    }
    if (!spec.businessDate) return R.err('VALIDATION', 'bill cần businessDate');
    if (typeof spec.occurredAt !== 'number') return R.err('VALIDATION', 'bill cần occurredAt');

    var chBad = validateChannel(spec.channel);
    if (chBad) return R.err('VALIDATION', chBad);

    var lines = spec.lines || [];
    if (lines.length === 0) return R.err('VALIDATION', 'bill phải có ít nhất 1 dòng');

    var normalized = [];
    var subtotal = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!ids.isId(l.menuItemId, 'item')) return R.err('VALIDATION', 'dòng ' + i + ' thiếu menuItemId hợp lệ');
      if (typeof l.price !== 'number') return R.err('VALIDATION', 'dòng ' + i + ' thiếu giá đã snapshot');
      if (typeof l.qty !== 'number' || !(l.qty > 0)) return R.err('VALIDATION', 'dòng ' + i + ' qty phải dương');

      var amount = l.price * l.qty;
      subtotal += amount;
      normalized.push({
        billLineId: ids.deterministicId('billLine', [spec.billId || 'draft', String(i)]),
        menuItemId: l.menuItemId,
        name: l.name || null,
        size: l.size,
        qty: l.qty,
        /* Snapshot, không phải tham chiếu sống. */
        price: l.price,
        amount: amount,
        recipeId: l.recipeId || null,
        toppings: (l.toppings || []).slice()
      });
    }

    var discountTotal = spec.discountTotal || 0;
    var total = Math.max(0, subtotal - discountTotal);

    /* Phí sàn được TRỪ THẬT — đây là đường ống legacy chưa từng nối. */
    var channelFee = spec.channel.type === CHANNEL.APP
      ? total * (spec.channel.feePct / 100)
      : 0;

    return R.ok({
      billId: spec.billId || ids.newId('bill'),
      storeId: spec.storeId,
      businessDate: spec.businessDate,
      occurredAt: spec.occurredAt,
      soldByActorId: spec.soldByActorId,
      customerId: spec.customerId || null,
      channel: {
        type: spec.channel.type,
        appName: spec.channel.appName || null,
        feePct: spec.channel.type === CHANNEL.APP ? spec.channel.feePct : 0
      },
      lines: normalized,
      subtotal: subtotal,
      discountTotal: discountTotal,
      promotionsApplied: (spec.promotionsApplied || []).slice(),
      total: total,
      channelFee: channelFee,
      /* Doanh thu thuần sau phí sàn — con số P&L thật sự cần. */
      netRevenue: total - channelFee,
      payments: (spec.payments || []).slice(),
      status: 'DRAFT'
    });
  }

  /**
   * Yêu cầu vật chất của cả bill: định mức + bao bì + túi.
   *
   * Mọi version dùng ở đây được GHI LẠI trên bill (V4), nên đọc lại lịch sử
   * không phải resolve lại — và không thể trôi theo cấu hình hiện tại.
   */
  function buildRequirements(bill, deps) {
    var registry = deps.versionRegistry;
    var reqs = [];
    var recipeVersionIds = [];
    var packagingVersionIds = [];
    var gapLines = [];

    for (var i = 0; i < bill.lines.length; i++) {
      var line = bill.lines[i];
      if (!line.recipeId) {
        /*
         * §2.3a (quyết định chủ quán 2026-09-17, NET-SALES-V1.md N10): thiếu
         * định mức KHÔNG được chặn bán — legacy chỉ soft-warn qua Hộp thư,
         * core không được chặt hơn hệ cũ. Ghi nhận gap, KHÔNG suy đoán
         * requirements cho món này (không có công thức thì không biết trừ
         * nguyên liệu gì) — cogsTheoretical/cogsActual của cả bill sẽ về
         * null kèm reason NO_RECIPE (xem `commands/sales.js RecordSale` +
         * `recipe-cost-btp/cogs.js`), KHÔNG âm thầm tính thiếu rồi báo như
         * đã đủ. Bao bì (dưới) vẫn tính bình thường — không phụ thuộc recipe.
         */
        gapLines.push({ menuItemId: line.menuItemId, name: line.name || null, billLineId: line.billLineId });
      } else {
        var rv = recipeLib.resolveRecipeAt(registry, {
          recipeId: line.recipeId, storeId: bill.storeId, at: bill.occurredAt
        });
        if (R.isErr(rv)) return rv;

        var rr = recipeLib.toRequirements(rv.value, { size: line.size, qty: line.qty });
        if (R.isErr(rr)) return rr;
        recipeVersionIds.push(rr.value.recipeVersionId);
        reqs = reqs.concat(rr.value.requirements);
      }

      var pv = packagingLib.resolvePackagingAt(registry, {
        menuItemId: line.menuItemId, storeId: bill.storeId, at: bill.occurredAt
      });
      if (R.isOk(pv)) {
        var pr = packagingLib.toRequirements(pv.value, line.qty);
        if (R.isErr(pr)) return pr;
        packagingVersionIds.push(pr.value.packagingVersionId);
        reqs = reqs.concat(pr.value.requirements);

        var cups = bill.lines.reduce(function (s, l) { return s + l.qty; }, 0);
        if (i === 0) {
          var bag = packagingLib.baggingRequirements(pv.value, cups);
          if (R.isOk(bag)) reqs = reqs.concat(bag.value.requirements);
        }
      }
    }

    /* Gộp cùng itemId để FIFO cấp phát 1 lần cho mỗi nguyên liệu. */
    var merged = Object.create(null);
    reqs.forEach(function (r) {
      merged[r.itemId] = (merged[r.itemId] || 0) + r.qty;
    });

    return R.ok({
      requirements: Object.keys(merged).map(function (itemId) {
        return { itemId: itemId, qty: merged[itemId] };
      }),
      detailedRequirements: reqs,
      recipeVersionIds: recipeVersionIds.filter(function (v, i, a) { return a.indexOf(v) === i; }),
      packagingVersionIds: packagingVersionIds.filter(function (v, i, a) { return a.indexOf(v) === i; }),
      gapLines: gapLines
    });
  }

  /** RecordSale — ghi bán hàng, trừ kho qua FIFO, tính CẢ HAI vế COGS. */
  var RecordSale = pipeline.defineCommand({
    name: 'RecordSale',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS'],

    /* Id xác định theo billId: bấm thanh toán 2 lần không trừ kho 2 lần. */
    operationId: function (input) {
      return ids.deterministicId('operation', ['sale', input.bill.billId]);
    },

    validate: function (input) {
      if (!input || !input.bill) return R.err('VALIDATION', 'RecordSale cần bill');
      if (!ids.isId(input.bill.soldByActorId, 'actor')) {
        return R.err('VALIDATION', 'bill thiếu soldByActorId');
      }
      if (!input.deps || !input.deps.versionRegistry) {
        return R.err('VALIDATION', 'RecordSale cần versionRegistry');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var bill = input.bill;
      var deps = input.deps;
      var plan = pipeline.emptyPlan();

      /* Actor trên bill phải là người đang thao tác — không nhận hộ người khác. */
      if (bill.soldByActorId !== ctx.actor.actorId) {
        return R.err('FORBIDDEN', 'soldByActorId khác actor đang thao tác');
      }

      var reqR = buildRequirements(bill, deps);
      if (R.isErr(reqR)) return reqR;
      var req = reqR.value;

      /* FIFO cấp phát — 1 WorkingSet cho cả bill, nên các món dùng chung
         nguyên liệu không đọc số dư cũ của nhau. */
      var ws = allocation.createWorkingSet(deps.units || []);
      var allocR = allocation.allocateMany(ws, req.requirements, {
        operationId: ids.deterministicId('operation', ['sale', bill.billId])
      });
      if (R.isErr(allocR)) return allocR;
      var alloc = allocR.value;

      /*
       * Hết nguyên liệu thật: KHÔNG chặn bán (chốt chủ quán 2026-09) — SOP cho
       * phép thay thế một số nguyên liệu khi nguyên liệu kia hết, nên vẫn phải
       * bán tiếp được. Phần thiếu thành NỢ tường minh trên Unit (§3.3
       * `allocation.handleShortfall`), gắn `needsReview`, KHÔNG âm thầm — khác
       * legacy để kho tụt âm mà không ai biết.
       */
      var shortfallEvents = [];
      for (var sfi = 0; sfi < alloc.shortfalls.length; sfi++) {
        var shortfall = alloc.shortfalls[sfi];
        var sfR = allocation.handleShortfall(ws, shortfall, {
          at: bill.occurredAt,
          operationId: ids.deterministicId('operation', ['sale', bill.billId])
        });
        if (R.isErr(sfR)) return sfR;
        if (sfR.value.debtUnit) {
          shortfallEvents.push({
            type: 'IngredientShortfallRecorded',
            unitId: sfR.value.debtUnit.unitId,
            itemId: shortfall.itemId,
            shortfallQty: shortfall.shortfallQty,
            billId: bill.billId,
            storeId: bill.storeId,
            businessDate: bill.businessDate
          });
        }
      }

      /* HAI vế COGS — thứ legacy chưa từng có. */
      var cogsR = cogsLib.computeCogs({
        registry: deps.versionRegistry,
        storeId: bill.storeId,
        at: bill.occurredAt,
        requirements: req.requirements,
        allocationPlans: alloc.plans,
        gapLineCount: req.gapLines.length
      });
      if (R.isErr(cogsR)) return cogsR;

      var finalized = Object.assign({}, bill, {
        status: 'COMPLETED',
        recipeVersionIds: req.recipeVersionIds,
        packagingVersionIds: req.packagingVersionIds,
        cogs: cogsR.value
      });

      plan.domainRecords.push({ type: 'bill', record: finalized });
      plan.unitChanges = ws.all().filter(function (u) {
        var before = (deps.units || []).filter(function (o) { return o.unitId === u.unitId; })[0];
        return before && before.remainingQty !== u.remainingQty;
      });

      alloc.plans.forEach(function (p) {
        p.allocations.forEach(function (a) {
          plan.ledgerEntries.push({
            domain: 'raw',
            type: 'CONSUMPTION',
            itemId: a.itemId,
            storeId: bill.storeId,
            unitId: a.unitId,
            qtyDelta: -a.qty,
            unitCost: a.unitCost,
            costBasisVersionId: a.costBasisVersionId,
            businessDate: bill.businessDate,
            actorId: bill.soldByActorId,
            occurredAt: bill.occurredAt,
            referenceType: 'bill',
            referenceId: bill.billId
          });
          /* Lineage đầy đủ: Bill → BillLine → RecipeVersion → Requirement →
             UnitAllocation → UnitBase trước/sau. */
          plan.traceChanges.push({
            billId: bill.billId,
            unitId: a.unitId,
            itemId: a.itemId,
            qty: a.qty,
            unitBaseBefore: a.unitBaseBefore,
            unitBaseAfter: a.unitBaseAfter,
            recipeVersionIds: req.recipeVersionIds,
            costBasisVersionId: a.costBasisVersionId
          });
        });
      });

      plan.projectionRecomputes = req.requirements.map(function (r) {
        return { itemId: r.itemId, storeId: bill.storeId };
      });

      /*
       * Loyalty là handler đăng ký riêng, không nhét vào lệnh bán — nhưng
       * event vẫn mang sẵn `bill`/`customer` denormalized để
       * `bootstrap/domain-events.js` (L9) gọi tiếp AccrueLoyaltyForSale mà
       * không phải tự tra dữ liệu (đúng nguyên tắc "denormalized command
       * input"). `deps.loyaltyCustomer` là optional: caller đã tra khách ở
       * bước L1 thì mang theo, không có thì loyalty/accrual.js tự skip
       * tường minh (customer null), không đoán.
       */
      if (bill.customerId) {
        plan.events.push({
          type: 'SaleCompleted',
          billId: bill.billId,
          customerId: bill.customerId,
          bill: finalized,
          customer: deps.loyaltyCustomer || null,
          stampsEarnedToday: deps.loyaltyStampsEarnedToday || 0,
          netRevenue: finalized.netRevenue,
          storeId: bill.storeId,
          businessDate: bill.businessDate
        });
      }

      /*
       * Alert (L9) cho từng món thiếu định mức — AUTO_VERIFIABLE
       * (`alerts/alert.js TYPES.MISSING_RECIPE`), tự hết khi khai định mức
       * xong, không cần ai đóng tay. Gộp theo menuItemId: 1 bill có thể có
       * 2 dòng cùng món thiếu định mức, chỉ cần 1 alert cho món đó.
       */
      var seenGapItems = Object.create(null);
      req.gapLines.forEach(function (g) {
        if (seenGapItems[g.menuItemId]) return;
        seenGapItems[g.menuItemId] = true;
        plan.events.push({
          type: 'MissingRecipeDetected',
          menuItemId: g.menuItemId,
          name: g.name,
          billId: bill.billId,
          storeId: bill.storeId,
          businessDate: bill.businessDate
        });
      });

      shortfallEvents.forEach(function (evt) { plan.events.push(evt); });

      return R.ok(plan);
    }
  });

  /**
   * RecordAddon — thêm món/topping sau khi bill đã lưu.
   *
   * Legacy cho thêm trong 10 phút (add-only, không sửa/xoá) và trừ kho theo
   * diff đúng — nhưng KHÔNG gọi loyalty, nên khách trả thêm tiền mà không được
   * cộng thêm điểm (§1 chain-trace, §4.16). Ở đây event được phát cho ĐÚNG
   * phần chênh lệch.
   */
  var RecordAddon = pipeline.defineCommand({
    name: 'RecordAddon',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['addon', input.billId, input.addonSeq]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.billId, 'bill')) return R.err('VALIDATION', 'RecordAddon cần billId');
      if (input.addonSeq === undefined || input.addonSeq === null) {
        return R.err('VALIDATION', 'RecordAddon cần addonSeq để id xác định — thiếu nó là bug #23');
      }
      if (typeof input.addedAmount !== 'number' || input.addedAmount <= 0) {
        return R.err('VALIDATION', 'addon phải có số tiền tăng thêm dương');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({
        type: 'billAddon',
        record: {
          billId: input.billId,
          addonSeq: input.addonSeq,
          addedAmount: input.addedAmount,
          addedByActorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now()
        }
      });

      if (input.customerId) {
        /*
         * Đúng phần CHÊNH LỆCH, không phải tổng bill. `customer` denormalized
         * theo cùng lý do với RecordSale — xem ghi chú ở đó (L9).
         */
        plan.events.push({
          type: 'SaleAmountIncreased',
          billId: input.billId,
          addonSeq: input.addonSeq,
          customerId: input.customerId,
          addedAmount: input.addedAmount,
          customer: input.loyaltyCustomer || null,
          storeId: ctx.storeId,
          businessDate: ctx.businessDate,
          occurredAt: ctx.clock.now(),
          actorId: ctx.actor.actorId
        });
      }

      return R.ok(plan);
    }
  });

  return {
    CHANNEL: CHANNEL,
    buildBill: buildBill,
    buildRequirements: buildRequirements,
    RecordSale: RecordSale,
    RecordAddon: RecordAddon
  };
});
