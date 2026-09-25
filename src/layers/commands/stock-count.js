/**
 * Lệnh kiểm kho — tạo phiếu (đầu vào của chuỗi SC1 → SC6).
 *
 * Chuỗi thật: `NET-STOCK-COUNT-V1.md` SC1 (phân loại `countMode`, 🔴 GAP TOÀN
 * PHẦN) + SC2 (`SubmitStockCount`, 🔴 GAP TOÀN PHẦN). Phần DUYỆT (SC3) đã có
 * sẵn ở `commands/approval.js#ApproveStockCount` — module này chỉ đóng phần
 * TẠO PHIẾU còn thiếu ở đầu chuỗi, cùng hình dạng gap với RM1 (Receiving).
 *
 * SC1's AMBIGUOUS đã ghi nhận: legacy quyết định `countMode:'unit'` (bắt
 * buộc quét mã) hay `'qty'` (nhập tay số tuyệt đối) bằng cách suy luận ngầm
 * từ việc `packagingUnits` có khớp được hay không — cùng lỗi gốc với RM1's
 * `createContainersForReceipt`. Fix giống hệt RM1: TÁI SỬ DỤNG
 * `commands/receiving.js#classifyTrackingMode()` — `trackingMode === 'unit'`
 * (tường minh trên item, không suy từ field khác) thì bắt buộc quét mã theo
 * từng Unit; mọi trường hợp khác ('batch'/'none') là đếm tổng bằng tay. Một
 * khái niệm, một hàm phân loại — không có 2 cách suy luận lệch nhau cho cùng
 * một câu hỏi như legacy.
 *
 * `stockCountId` xác định theo `countRef` caller cung cấp (mẫu
 * wasteRef/adjustRef/correctRef đã dùng xuyên suốt `commands/inventory.js`,
 * `commands/receiving.js`) — đóng đúng Bug #13 (double-tap sinh 2 phiếu vì
 * legacy dùng `.add()` id ngẫu nhiên).
 *
 * Chỉ TẠO phiếu PENDING — hoàn toàn không mutate Unit/ledger. Việc đó
 * (physicalReconciliation) là của `ApproveStockCount`, đã đóng đúng 4/5 mục
 * "FIX BẮT BUỘC" của chain-trace (xem SC3).
 */
GIEO.define('commands/stock-count', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'commands/receiving'
], function (ids, R, pipeline, receiving) {
  'use strict';

  var COUNT_STATUS = { PENDING: 'PENDING' };

  /**
   * SC1 — countMode tường minh, tái dùng đúng phân loại của RM1.
   * `trackingMode:'unit'` → bắt buộc quét mã từng Unit; ngược lại → đếm tổng.
   */
  function classifyCountMode(item) {
    return receiving.classifyTrackingMode(item) === 'unit' ? 'unit' : 'qty';
  }

  /**
   * SubmitStockCount — SC2, tạo phiếu kiểm kê ở trạng thái PENDING.
   *
   * Input đi theo mẫu "denormalized": `input.lines[].item` là bản ghi mặt
   * hàng đã tra sẵn (dùng để phân loại countMode, không tự tra catalog).
   *
   *   - countMode 'unit': dòng phải có `unitId` (đã quét) + `countedQty`
   *     (số đếm được TRÊN CHÍNH lô đó — absolute, giống `physicalReconciliation`).
   *   - countMode 'qty': dòng KHÔNG được gắn unitId (đếm tổng, không truy lô
   *     cụ thể) + `countedQty`/`expectedQty` để tính `delta` — đúng shape mà
   *     `ApproveStockCount` cần cho nhánh không có `unitId`.
   */
  var SubmitStockCount = pipeline.defineCommand({
    name: 'SubmitStockCount',
    authority: ['EXECUTE', 'REVIEW_APPROVE_CORRECT'],
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['submitcount', input.countRef]);
    },

    validate: function (input) {
      if (!input || !input.countRef) {
        return R.err('VALIDATION', 'SubmitStockCount cần countRef để id xác định — thiếu nó là tái lập ' +
          'đúng Bug #13 (double-tap gửi 2 lần tạo 2 phiếu)');
      }
      if (!Array.isArray(input.lines) || input.lines.length === 0) {
        return R.err('VALIDATION', 'SubmitStockCount cần ít nhất 1 dòng đếm');
      }
      for (var i = 0; i < input.lines.length; i++) {
        var line = input.lines[i];
        if (!line || !ids.isId(line.itemId, 'item')) {
          return R.err('VALIDATION', 'dòng ' + i + ' cần itemId hợp lệ');
        }
        if (!line.item) {
          return R.err('VALIDATION', 'dòng ' + i + ' thiếu input.lines[].item (denormalized, không tự tra catalog)');
        }
        var mode = classifyCountMode(line.item);
        if (mode === 'unit') {
          if (!ids.isId(line.unitId, 'unit')) {
            return R.err('VALIDATION',
              'dòng ' + i + ' (countMode unit) cần unitId hợp lệ — mặt hàng này bắt buộc quét mã, ' +
              'không được nhập tay tổng số (đóng đúng AMBIGUOUS đã nêu ở SC1)');
          }
          if (typeof line.countedQty !== 'number' || line.countedQty < 0) {
            return R.err('VALIDATION', 'dòng ' + i + ' cần countedQty là số không âm');
          }
        } else {
          if (line.unitId) {
            return R.err('VALIDATION',
              'dòng ' + i + ' (countMode qty) không được gắn unitId — mặt hàng này đếm tổng, không quét từng lô');
          }
          if (typeof line.countedQty !== 'number' || typeof line.expectedQty !== 'number') {
            return R.err('VALIDATION', 'dòng ' + i + ' (countMode qty) cần countedQty và expectedQty để tính delta');
          }
        }
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var stockCountId = ids.deterministicId('stockCount', ['submit', input.countRef]);
      var at = input.at || ctx.clock.now();

      var lines = input.lines.map(function (line) {
        var mode = classifyCountMode(line.item);
        if (mode === 'unit') {
          return {
            itemId: line.itemId, unitId: line.unitId, countMode: 'unit',
            countedQty: line.countedQty, applied: false
          };
        }
        return {
          itemId: line.itemId, unitId: null, countMode: 'qty',
          countedQty: line.countedQty, expectedQty: line.expectedQty,
          /* Delta tính SẴN ở đây — ApproveStockCount chỉ đọc thẳng field này
             cho nhánh không unitId, không tự trừ lại. */
          delta: line.countedQty - line.expectedQty,
          applied: false
        };
      });

      plan.domainRecords.push({
        type: 'stockCount',
        record: {
          stockCountId: stockCountId,
          countRef: input.countRef,
          status: COUNT_STATUS.PENDING,
          lines: lines,
          appliedItemIds: [],
          failedLines: [],
          submittedBy: ctx.actor.actorId,
          submittedAt: at,
          businessDate: ctx.businessDate,
          storeId: ctx.storeId,
          approvedBy: null,
          approvedAt: null,
          approveOperationId: null
        }
      });

      return R.ok(plan);
    }
  });

  return {
    COUNT_STATUS: COUNT_STATUS,
    classifyCountMode: classifyCountMode,
    SubmitStockCount: SubmitStockCount
  };
});
