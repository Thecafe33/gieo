/**
 * Lệnh duyệt.
 *
 * Nguồn: FIFO-CORE-ARCHITECTURE-V2.md §8, §10b.3, §10b.4;
 *        FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md "FIX BẮT BUỘC".
 *
 * §10b.3 — IDEMPOTENCY ÁP CHO CẢ HÀNH ĐỘNG DUYỆT, không chỉ hành động tạo.
 * Legacy `ApproveStockCount` không kiểm tra status trước khi apply và không có
 * busy-guard, nên double-click hoặc 2 người duyệt cùng lúc cộng đúp variance.
 * Ở đây mọi duyệt đi qua pipeline chung nên có claim + id xác định.
 *
 * §10b.4 — `ApproveLostContainer` LÀ GAP CÓ BẰNG CHỨNG CHẮC CHẮN NHẤT TOÀN BỘ
 * AUDIT, xác nhận ĐỘC LẬP 3 LẦN từ 3 góc khác nhau:
 *   - FIFO audit: grep `approveLostReport` trong quanlygieo.html → 0 kết quả
 *   - Alerts audit: không có nút xử lý nào cho báo mất
 *   - Stock-count chain: route duyệt không tồn tại, khiến container "mất" lặp
 *     lại vô hạn mỗi kỳ kiểm kho
 * Hệ quả ở legacy: Unit KHÔNG BAO GIỜ đạt tới nhánh LOST, dù logic nhánh LOST
 * và logic khôi phục `submitFoundLostContainer` đều đã viết sẵn và đúng — chúng
 * chỉ không bao giờ chạy tới vì thiếu đúng mắt xích này.
 */
GIEO.define('commands/approval', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'fifo-core/unit',
  'fifo-core/reconciliation',
  'hr/liability'
], function (ids, R, pipeline, unitLib, reconciliation, liabilityLib) {
  'use strict';

  var COUNT_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    /* Legacy chỉ có `approved` và một con số `failedCount`. Chain-trace yêu cầu
       state này để biết phiếu chưa áp hết và dòng nào còn lại. */
    PARTIALLY_APPLIED: 'PARTIALLY_APPLIED',
    REJECTED: 'REJECTED'
  };

  /**
   * ApproveLostContainer — MẮT XÍCH LEGACY CHƯA TỪNG CÓ.
   *
   * ReportLostContainer (POS) → lostReport PENDING_REVIEW
   *                           → ApproveLostContainer (QUANLY, ở đây)
   *                           → Unit vào nhánh LOST
   *                           → RestoreFoundContainer chạy được khi tìm lại
   */
  var ApproveLostContainer = pipeline.defineCommand({
    name: 'ApproveLostContainer',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['approvelost', input.lostReportId]);
    },

    validate: function (input) {
      if (!input || !input.lostReportId) return R.err('VALIDATION', 'cần lostReportId');
      if (!input.decision || (input.decision !== 'APPROVE' && input.decision !== 'REJECT')) {
        return R.err('VALIDATION', "decision phải là 'APPROVE' hoặc 'REJECT'");
      }
      if (!input.reason) {
        return R.err('VALIDATION', 'duyệt/từ chối báo mất phải có lý do (§25 — approval bắt buộc có reason)');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var report = input.lostReport;
      if (!report) return R.err('NOT_FOUND', 'không tìm thấy phiếu báo mất');
      if (report.status !== 'PENDING_REVIEW') {
        /* Fail-closed: duyệt lại phiếu đã xử lý là no-op có kiểm soát, không
           phải áp lần hai (§27 invariant 8). */
        return R.err('PRECONDITION', 'phiếu báo mất đã được xử lý (' + report.status + ')');
      }

      var opId = ids.deterministicId('operation', ['approvelost', input.lostReportId]);
      var plan = pipeline.emptyPlan();

      if (input.decision === 'REJECT') {
        plan.domainRecords.push({
          type: 'lostReport',
          record: Object.assign({}, report, {
            status: 'REJECTED', reviewedBy: ctx.actor.actorId,
            reviewedAt: ctx.clock.now(), reviewReason: input.reason
          })
        });
        return R.ok(plan);
      }

      var unit = (input.units || []).filter(function (u) { return u.unitId === report.unitId; })[0];
      if (!unit) return R.err('NOT_FOUND', 'không tìm thấy lô ' + report.unitId);

      var lost = unitLib.markLost(unit, {
        at: ctx.clock.now(), actorId: ctx.actor.actorId,
        operationId: opId, lostReportId: input.lostReportId
      });
      if (R.isErr(lost)) return lost;

      plan.unitChanges.push(lost.value);
      plan.domainRecords.push({
        type: 'lostReport',
        record: Object.assign({}, report, {
          status: 'APPROVED', reviewedBy: ctx.actor.actorId,
          reviewedAt: ctx.clock.now(), reviewReason: input.reason
        })
      });
      plan.ledgerEntries.push({
        domain: 'raw', type: 'LOST', itemId: unit.itemId, storeId: ctx.storeId,
        unitId: unit.unitId, qtyDelta: -unit.remainingQty,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: ctx.clock.now(),
        referenceType: 'lostReport', referenceId: input.lostReportId, reason: input.reason
      });

      /* Quy trách nhiệm nhân viên (quyết định chủ quán) — tạo NGAY trong plan
         này, không đi qua event: L9 chưa tồn tại và đây không phải side-effect
         tuỳ chọn. `input.employees` là input denormalized giống `input.units`;
         khớp qua actorId người báo mất (report.reportedBy). Không khớp được
         thì vẫn duyệt mất container — khoản trừ chỉ gắn cờ gap (§2.3a),
         không chặn. */
      var employee = (input.employees || []).filter(function (e) {
        return e.actorId === report.reportedBy;
      })[0];
      var liabilityR = liabilityLib.createLiability({
        employeeId: employee ? employee.employeeId : null,
        storeId: ctx.storeId,
        actorId: ctx.actor.actorId,
        operationId: opId,
        lostReportId: input.lostReportId,
        unit: unit,
        reason: input.reason,
        at: ctx.clock.now()
      });
      if (R.isErr(liabilityR)) return liabilityR;
      plan.domainRecords.push({ type: 'liability', record: liabilityR.value });

      /* Đổi tên khỏi 'ContainerFound' (bug: trùng type với sự kiện "tìm lại
         được" ngược chiều ở commands/inventory.js RestoreFoundContainer —
         một consumer L9 tương lai sẽ không phân biệt được 2 hướng nếu dùng
         chung type). Đây chỉ còn là thông báo phụ; bản ghi thật đã ở trên. */
      plan.events.push({
        type: 'ContainerLostApproved',
        unitId: unit.unitId, storeId: ctx.storeId, businessDate: ctx.businessDate,
        lostReportId: input.lostReportId, liabilityId: liabilityR.value.liabilityId
      });
      plan.projectionRecomputes.push({ itemId: unit.itemId, storeId: ctx.storeId });
      return R.ok(plan);
    }
  });

  /**
   * ApproveStockCount — duyệt phiếu kiểm kê.
   *
   * Bốn yêu cầu của chain-trace:
   *  1. đi qua ĐÚNG đường điều chỉnh của FIFO Engine, không có code path ghi
   *     thẳng currentStock song song như `applyStockTransaction`
   *  2. idempotent (§10b.3)
   *  3. dòng lỗi lưu CHÍNH XÁC dòng nào, không chỉ một con số failedCount
   *  4. có state PARTIALLY_APPLIED thay vì luôn APPROVED
   */
  var ApproveStockCount = pipeline.defineCommand({
    name: 'ApproveStockCount',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['approvecount', input.stockCountId]);
    },

    validate: function (input) {
      if (!input || !input.stockCountId) return R.err('VALIDATION', 'cần stockCountId');
      if (!input.reason) return R.err('VALIDATION', 'duyệt kiểm kê phải có lý do');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var count = input.stockCount;
      if (!count) return R.err('NOT_FOUND', 'không tìm thấy phiếu kiểm kê');
      if (count.status !== COUNT_STATUS.PENDING && count.status !== COUNT_STATUS.PARTIALLY_APPLIED) {
        return R.err('PRECONDITION', 'phiếu kiểm kê đã duyệt (' + count.status + ')');
      }

      var opId = ids.deterministicId('operation', ['approvecount', input.stockCountId]);
      var plan = pipeline.emptyPlan();
      var applied = [];
      var failed = [];

      var unitsById = Object.create(null);
      (input.units || []).forEach(function (u) { unitsById[u.unitId] = u; });

      (count.lines || []).forEach(function (line) {
        /* Dòng đã áp ở lần duyệt trước thì bỏ qua — đây là phần làm cho việc
           duyệt lại phiếu PARTIALLY_APPLIED không cộng đúp. */
        if (line.applied) { applied.push(line.itemId); return; }

        if (line.unitId) {
          var unit = unitsById[line.unitId];
          if (!unit) {
            failed.push({ itemId: line.itemId, unitId: line.unitId, reason: 'không tìm thấy lô' });
            return;
          }
          var rc = reconciliation.physicalReconciliation(unit, {
            actualQty: line.countedQty, at: ctx.clock.now(),
            actorId: ctx.actor.actorId,
            operationId: ids.deterministicId('operation', ['approvecount', input.stockCountId, line.itemId]),
            method: 'stock_count', reason: input.reason
          });
          if (R.isErr(rc)) {
            /* Lưu CHÍNH XÁC dòng nào hỏng và vì sao — legacy chỉ có failedCount. */
            failed.push({ itemId: line.itemId, unitId: line.unitId, reason: rc.error.message });
            return;
          }
          plan.unitChanges.push(rc.value.unit);
          plan.ledgerEntries.push({
            domain: 'raw', type: 'ADJUSTMENT', itemId: line.itemId, storeId: ctx.storeId,
            unitId: line.unitId, qtyDelta: rc.value.delta,
            businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
            occurredAt: ctx.clock.now(),
            referenceType: 'stockCount', referenceId: input.stockCountId, reason: input.reason
          });
        } else {
          plan.ledgerEntries.push({
            domain: 'raw', type: 'ADJUSTMENT', itemId: line.itemId, storeId: ctx.storeId,
            unitId: null, qtyDelta: line.delta,
            businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
            occurredAt: ctx.clock.now(),
            referenceType: 'stockCount', referenceId: input.stockCountId, reason: input.reason
          });
        }
        applied.push(line.itemId);
        plan.projectionRecomputes.push({ itemId: line.itemId, storeId: ctx.storeId });
      });

      plan.domainRecords.push({
        type: 'stockCount',
        record: Object.assign({}, count, {
          /* Còn dòng lỗi thì KHÔNG phải APPROVED — nói đúng trạng thái thật. */
          status: failed.length ? COUNT_STATUS.PARTIALLY_APPLIED : COUNT_STATUS.APPROVED,
          approvedBy: ctx.actor.actorId,
          approvedAt: ctx.clock.now(),
          approveOperationId: opId,
          appliedItemIds: applied,
          failedLines: failed,
          lines: (count.lines || []).map(function (l) {
            return Object.assign({}, l, {
              applied: l.applied || applied.indexOf(l.itemId) !== -1
            });
          })
        })
      });

      if (failed.length) {
        plan.events.push({
          type: 'StockCountPartiallyApplied',
          stockCountId: input.stockCountId, storeId: ctx.storeId,
          businessDate: ctx.businessDate, failedLines: failed
        });
      }

      return R.ok(plan);
    }
  });

  var ApproveExpense = pipeline.defineCommand({
    name: 'ApproveExpense',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],
    operationId: function (input) {
      return ids.deterministicId('operation', ['approveexp', input.expenseId]);
    },
    validate: function (input) {
      if (!input || !ids.isId(input.expenseId, 'expense')) return R.err('VALIDATION', 'cần expenseId hợp lệ');
      if (!input.reason) return R.err('VALIDATION', 'duyệt chi phí phải có lý do');
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var e = input.expense;
      if (!e) return R.err('NOT_FOUND', 'không tìm thấy khoản chi');
      if (e.status !== 'PENDING_APPROVAL') {
        return R.err('PRECONDITION', 'khoản chi không ở trạng thái chờ duyệt (' + e.status + ')');
      }
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({
        type: 'expense',
        record: Object.assign({}, e, {
          status: input.decision === 'REJECT' ? 'REJECTED' : 'ACTUAL',
          approvedBy: ctx.actor.actorId, approvedAt: ctx.clock.now(), approveReason: input.reason
        })
      });
      return R.ok(plan);
    }
  });

  return {
    COUNT_STATUS: COUNT_STATUS,
    ApproveLostContainer: ApproveLostContainer,
    ApproveStockCount: ApproveStockCount,
    ApproveExpense: ApproveExpense
  };
});
