/**
 * Lệnh kho — waste / nhận hàng / kiểm kê / mất-tìm-thấy.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-RAW-MATERIAL-V1.md, FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md.
 * Gap: FIFO-CORE-ARCHITECTURE-V2.md §10b.2, §8, §9.
 *
 * Thay thế `applyStockTransaction` của QUANLY — §9 yêu cầu KHÔNG giữ bất kỳ hàm
 * nào ghi thẳng Firestore từ phía QUANLY. Ở đây không tồn tại code path nào ghi
 * thẳng `currentStock`: mọi thay đổi vật chất đi qua FIFO Engine, nên điều chỉnh
 * kiểm kê không còn bị lần recompute kế tiếp xoá âm thầm như legacy.
 */
GIEO.define('commands/inventory', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'fifo-core/unit',
  'fifo-core/allocation',
  'fifo-core/reconciliation'
], function (ids, R, pipeline, unitLib, allocation, reconciliation) {
  'use strict';

  /**
   * RecordWaste — hao hụt.
   *
   * §10b.2: legacy `_submitDrinkWasteImpl` xử lý cả prep lẫn nguyên liệu thô
   * trong CÙNG một hàm, nhưng nhánh prep gọi allocate qua FIFO (đúng) còn nhánh
   * nguyên liệu thô ghi thẳng sổ (sai, không allocate). Đây là bằng chứng kỹ
   * thuật đúng ĐÃ tồn tại sẵn, chỉ chưa áp dụng đồng nhất.
   *
   * Invariant ở đây: BẮT BUỘC allocate qua FIFO cho MỌI itemKind — không có
   * nhánh code riêng bỏ qua allocation theo domain.
   */
  var RecordWaste = pipeline.defineCommand({
    name: 'RecordWaste',
    /* §21: "Waste | YES | REVIEW/CORRECT". */
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['waste', input.wasteRef, input.itemId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.itemId, 'item')) return R.err('VALIDATION', 'RecordWaste cần itemId hợp lệ');
      if (typeof input.qty !== 'number' || !(input.qty > 0)) return R.err('VALIDATION', 'qty phải dương');
      if (!input.wasteRef) return R.err('VALIDATION', 'RecordWaste cần wasteRef để id xác định (bug #21)');
      if (!input.reason) return R.err('VALIDATION', 'hao hụt phải có lý do');
      if (input.domain !== 'raw' && input.domain !== 'prep') {
        return R.err('VALIDATION', "domain phải là 'raw' hoặc 'prep' — cả hai đi CÙNG một đường");
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['waste', input.wasteRef, input.itemId]);
      var ws = allocation.createWorkingSet(input.units || []);

      /* Cùng một lời gọi cho raw lẫn prep. Không có nhánh rẽ theo domain. */
      var r = allocation.allocateConsumption(ws, {
        itemId: input.itemId, qty: input.qty, operationId: opId
      });
      if (R.isErr(r)) return r;
      var alloc = r.value;

      if (alloc.shortfallQty > 0 && !input.allowUntracked) {
        return R.err('PRECONDITION',
          'không đủ lô để gánh ' + input.qty + ' hao hụt (thiếu ' + alloc.shortfallQty + ') — ' +
          'ghi thẳng sổ mà không allocate chính là lỗi nhánh nguyên liệu thô của legacy',
          { shortfallQty: alloc.shortfallQty });
      }

      plan.unitChanges = alloc.touchedUnits;
      alloc.allocations.forEach(function (a) {
        plan.ledgerEntries.push({
          domain: input.domain, type: 'WASTE', itemId: a.itemId, storeId: ctx.storeId,
          unitId: a.unitId, qtyDelta: -a.qty, unitCost: a.unitCost,
          costBasisVersionId: a.costBasisVersionId,
          businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now(),
          referenceType: 'waste', referenceId: input.wasteRef, reason: input.reason
        });
      });

      /* Phần không có lô gánh vẫn phải vào sổ, qua đúng cơ chế
         untrackedPendingDelta (entry không có unitId) — không "biến mất". */
      if (alloc.shortfallQty > 0) {
        plan.ledgerEntries.push({
          domain: input.domain, type: 'WASTE', itemId: input.itemId, storeId: ctx.storeId,
          unitId: null, qtyDelta: -alloc.shortfallQty,
          businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now(),
          referenceType: 'waste', referenceId: input.wasteRef,
          reason: input.reason + ' (phần không truy được lô)'
        });
      }

      /* §10b.2 cũng nói: chỉ 1/3 đường ghi waste của legacy có ingredientBreakdown
         dù kỹ thuật đã có sẵn. Ở đây nó luôn có, vì allocation vốn đã trả ra. */
      plan.domainRecords.push({
        type: 'wasteRecord',
        record: {
          wasteRef: input.wasteRef, itemId: input.itemId, qty: input.qty,
          domain: input.domain, reason: input.reason,
          actorId: ctx.actor.actorId, businessDate: ctx.businessDate,
          ingredientBreakdown: alloc.allocations.map(function (a) {
            return { unitId: a.unitId, qty: a.qty, cost: a.cost };
          }),
          wasteCost: alloc.totalCost,
          costComplete: alloc.costComplete
        }
      });

      plan.projectionRecomputes.push({ itemId: input.itemId, storeId: ctx.storeId });
      return R.ok(plan);
    }
  });

  /**
   * AdjustInventory — điều chỉnh tồn, thay `applyStockTransaction` của QUANLY.
   *
   * Legacy ghi thẳng `currentStock` bỏ qua Unit Engine, nên điều chỉnh kiểm kê
   * bị lần tính lại kế tiếp xoá âm thầm. Ở đây điều chỉnh đi qua Unit: hoặc là
   * đối chiếu vật lý trên một Unit cụ thể, hoặc là ledger entry không có unitId
   * (tự cộng `untrackedPendingDelta` theo quy tắc §5).
   */
  var AdjustInventory = pipeline.defineCommand({
    name: 'AdjustInventory',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['adjust', input.adjustRef, input.itemId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.itemId, 'item')) return R.err('VALIDATION', 'cần itemId hợp lệ');
      if (!input.adjustRef) return R.err('VALIDATION', 'cần adjustRef để id xác định');
      if (!input.reason) return R.err('VALIDATION', 'điều chỉnh kho phải có lý do');
      var hasUnit = !!input.unitId;
      if (hasUnit && typeof input.actualQty !== 'number') {
        return R.err('VALIDATION', 'điều chỉnh trên 1 lô cụ thể cần actualQty (số cân được)');
      }
      if (!hasUnit && typeof input.qtyDelta !== 'number') {
        return R.err('VALIDATION', 'điều chỉnh phần không gắn lô cần qtyDelta');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['adjust', input.adjustRef, input.itemId]);

      if (input.unitId) {
        var unit = (input.units || []).filter(function (u) { return u.unitId === input.unitId; })[0];
        if (!unit) return R.err('NOT_FOUND', 'không tìm thấy lô ' + input.unitId);

        /* GHI ĐÈ TUYỆT ĐỐI qua Unit Engine — không cộng delta vào số cache. */
        var rc = reconciliation.physicalReconciliation(unit, {
          actualQty: input.actualQty, at: ctx.clock.now(),
          actorId: ctx.actor.actorId, operationId: opId,
          method: input.method || 'stock_count', reason: input.reason
        });
        if (R.isErr(rc)) return rc;

        plan.unitChanges.push(rc.value.unit);
        plan.ledgerEntries.push({
          domain: input.domain || 'raw', type: 'ADJUSTMENT', itemId: input.itemId,
          storeId: ctx.storeId, unitId: input.unitId,
          qtyDelta: rc.value.delta,
          businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now(),
          referenceType: 'adjustment', referenceId: input.adjustRef, reason: input.reason
        });
        plan.domainRecords.push({ type: 'reconciliationRecord', record: rc.value.record });
      } else {
        plan.ledgerEntries.push({
          domain: input.domain || 'raw', type: 'ADJUSTMENT', itemId: input.itemId,
          storeId: ctx.storeId, unitId: null, qtyDelta: input.qtyDelta,
          businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now(),
          referenceType: 'adjustment', referenceId: input.adjustRef, reason: input.reason
        });
      }

      plan.projectionRecomputes.push({ itemId: input.itemId, storeId: ctx.storeId });
      return R.ok(plan);
    }
  });

  /** ReportLostContainer — POS báo mất. Chỉ tạo phiếu CHỜ DUYỆT. */
  var ReportLostContainer = pipeline.defineCommand({
    name: 'ReportLostContainer',
    authority: 'EXECUTE',
    mutates: true,
    sources: ['POS'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['lostreport', input.unitId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.unitId, 'unit')) return R.err('VALIDATION', 'cần unitId hợp lệ');
      if (!input.reason) return R.err('VALIDATION', 'báo mất phải có lý do');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({
        type: 'lostReport',
        record: {
          lostReportId: ids.deterministicId('operation', ['lostreport', input.unitId]),
          unitId: input.unitId,
          /* CHỜ DUYỆT — Unit chưa vào nhánh LOST cho tới khi QUANLY duyệt.
             Đây chính là mắt xích legacy thiếu (Bug #12). */
          status: 'PENDING_REVIEW',
          reportedBy: ctx.actor.actorId,
          reportedAt: ctx.clock.now(),
          businessDate: ctx.businessDate,
          reason: input.reason
        }
      });
      plan.events.push({
        type: 'LostContainerReported',
        unitId: input.unitId, storeId: ctx.storeId, businessDate: ctx.businessDate
      });
      return R.ok(plan);
    }
  });

  /**
   * RestoreFoundContainer — tìm lại được.
   *
   * §8: giữ nguyên toàn bộ quyết định nghiệp vụ của legacy
   * (`submitFoundLostContainer`) — Unit "mới nguyên", KHÔNG suy luận lại phần
   * đã dùng trước khi mất. Chỉ thêm `operationId` xuyên suốt (fix Bug #24, nơi
   * bước ADJUSTMENT không có txId).
   */
  var RestoreFoundContainer = pipeline.defineCommand({
    name: 'RestoreFoundContainer',
    /* Ma trận §21: "Found | YES | REVIEW/CORRECT" — POS làm bằng EXECUTE,
       QUANLY làm bằng REVIEW/CORRECT. Cùng một command, hai lối vào hợp lệ. */
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['found', input.unitId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.unitId, 'unit')) return R.err('VALIDATION', 'cần unitId hợp lệ');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var unit = (input.units || []).filter(function (u) { return u.unitId === input.unitId; })[0];
      if (!unit) return R.err('NOT_FOUND', 'không tìm thấy lô ' + input.unitId);

      var opId = ids.deterministicId('operation', ['found', input.unitId]);
      var r = unitLib.restoreFound(unit, {
        at: ctx.clock.now(), actorId: ctx.actor.actorId, operationId: opId
      });
      if (R.isErr(r)) return r;

      var plan = pipeline.emptyPlan();
      plan.unitChanges.push(r.value);
      plan.ledgerEntries.push({
        domain: 'raw', type: 'FOUND', itemId: unit.itemId, storeId: ctx.storeId,
        unitId: unit.unitId, qtyDelta: r.value.remainingQty,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: ctx.clock.now(),
        referenceType: 'found', referenceId: input.unitId,
        reason: 'tìm lại được container đã báo mất'
      });
      /* Hoàn khoản trừ trách nhiệm nhân viên là SIDE-EFFECT, đi qua event. */
      plan.events.push({
        type: 'ContainerFound',
        unitId: unit.unitId, storeId: ctx.storeId, businessDate: ctx.businessDate,
        lostReportId: unit.lostReportId
      });
      plan.projectionRecomputes.push({ itemId: unit.itemId, storeId: ctx.storeId });
      return R.ok(plan);
    }
  });

  return {
    RecordWaste: RecordWaste,
    AdjustInventory: AdjustInventory,
    ReportLostContainer: ReportLostContainer,
    RestoreFoundContainer: RestoreFoundContainer
  };
});
