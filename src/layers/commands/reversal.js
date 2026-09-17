/**
 * Reversal / Correction — ĐÚNG 2 PATTERN, thay cho 10 đường rời rạc của legacy.
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md.
 *
 * Legacy có 10 cơ chế hoàn/sửa khác nhau về chất lượng dù cùng ý định — chính
 * code legacy tự nhận trong comment rằng "lẽ ra nên dùng chung engine". Kết
 * luận thiết kế: chỉ cần 2 pattern + domain event cho side-effect.
 *
 *   ReverseTransaction — sự kiện ĐÃ TIÊU THỤ kho, giờ hoàn ngược.
 *                        (xoá bill, huỷ mẻ đang nấu, sửa add-on, sửa ledger sai)
 *   ReviseState        — sửa một con số trạng thái đã chốt sai, KHÔNG có ý
 *                        nghĩa tiêu thụ ngược. (yield BTP, giờ công, kiểm kê)
 *
 * SIDE-EFFECT NGOÀI KHO KHÔNG NẰM TRONG 2 PATTERN TRÊN.
 * Bằng chứng từ legacy: xoá bill CỐ Ý không hoàn loyalty (quyết định nghiệp vụ
 * hợp lệ, ghi rõ trong comment/toast), còn ở Found-after-Lost thì logic hoàn
 * deduction đã viết sẵn nhưng tầng tạo deduction chưa từng tồn tại. Hai tình
 * huống khác nhau, cùng một bài học: side-effect phải là handler đăng ký riêng
 * lắng nghe domain event, không phải nhánh if/else trong hàm hoàn chính.
 *
 * Lợi ích cụ thể: chủ quán đổi ý "có hoàn điểm khi huỷ bill không" thì thêm/bớt
 * một handler, không phải sửa lại luồng hoàn.
 */
GIEO.define('commands/reversal', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'fifo-core/allocation',
  'fifo-core/reconciliation'
], function (ids, R, pipeline, allocation, reconciliation) {
  'use strict';

  /**
   * Câu hỏi mà legacy để ngỏ ở MỌI trường hợp đã audit: báo cáo lịch sử đóng
   * băng theo giá trị tại thời điểm phát sinh, hay tính lại theo giá trị mới?
   * Ở đây nó là field BẮT BUỘC — không có mặc định để rơi vào.
   */
  var HISTORICAL_POLICY = {
    /* Số đã công bố giữ nguyên; sửa chỉ ảnh hưởng từ nay về sau. */
    FREEZE: 'FREEZE',
    /* Tính lại lịch sử theo giá trị mới — phải có lý do rõ. */
    RECOMPUTE: 'RECOMPUTE'
  };

  /* Sự kiện domain. Handler đăng ký riêng, không sửa file này khi thêm/bớt. */
  var EVENTS = {
    OrderVoided: 'OrderVoided',
    ContainerFound: 'ContainerFound',
    BatchCancelled: 'BatchCancelled',
    StateRevised: 'StateRevised'
  };

  function createEventBus() {
    var handlers = Object.create(null);
    return {
      on: function (eventType, name, fn) {
        if (!EVENTS[eventType]) throw new Error('[reversal] sự kiện chưa khai: ' + eventType);
        (handlers[eventType] || (handlers[eventType] = [])).push({ name: name, fn: fn });
      },
      /** Trả kết quả TỪNG handler — một handler hỏng không được nuốt im lặng. */
      emit: function (event) {
        var list = handlers[event.type] || [];
        return list.map(function (h) {
          try {
            return { handler: h.name, result: h.fn(event) };
          } catch (e) {
            return { handler: h.name, result: R.err('MANUAL_REVIEW', h.name + ' ném lỗi: ' + e.message) };
          }
        });
      },
      handlersFor: function (eventType) {
        return (handlers[eventType] || []).map(function (h) { return h.name; });
      }
    };
  }

  /**
   * ReverseTransaction — MỘT API cho mọi trường hợp hoàn kho.
   *
   * Hoàn theo phân bổ GỐC, không chạy lại FIFO (fifo-core/reconciliation §3.8).
   * Claim theo doc id xác định nên idempotent tự nhiên, không phải check-then-act.
   */
  var ReverseTransaction = pipeline.defineCommand({
    name: 'ReverseTransaction',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['POS', 'QUANLY'],

    operationId: function (input) {
      return reconciliation.reversalOperationId(input.referenceId, input.domain, input.itemId || 'all');
    },

    validate: function (input) {
      if (!input || !input.referenceId) return R.err('VALIDATION', 'ReverseTransaction cần referenceId');
      if (!input.domain) return R.err('VALIDATION', 'ReverseTransaction cần domain');
      if (!input.reason) {
        return R.err('VALIDATION', 'hoàn giao dịch phải có lý do — hoàn không lý do là hoàn không kiểm chứng được');
      }
      if (!Array.isArray(input.originalAllocations)) {
        return R.err('VALIDATION',
          'ReverseTransaction cần originalAllocations — hoàn là BÙ TRỪ theo phân bổ gốc, ' +
          'không phải chạy lại FIFO để đoán hồi đó đã trừ ở đâu');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = reconciliation.reversalOperationId(input.referenceId, input.domain, input.itemId || 'all');
      var ws = allocation.createWorkingSet(input.units || []);

      var r = reconciliation.reverseAllocations(ws, {
        referenceId: input.referenceId,
        domain: input.domain,
        operationId: opId,
        originalAllocations: input.originalAllocations,
        fallbackQty: input.fallbackQty
      });
      if (R.isErr(r)) return r;
      var rev = r.value;

      plan.unitChanges = rev.touchedUnits;
      rev.reversals.forEach(function (x) {
        plan.ledgerEntries.push({
          domain: input.domain,
          type: 'REVERSAL',
          itemId: x.itemId,
          storeId: ctx.storeId,
          unitId: x.unitId,
          /* Trả lại bằng delta DƯƠNG — giữ nguyên mọi thao tác xảy ra sau đó. */
          qtyDelta: x.qty,
          unitCost: x.unitCost,
          costBasisVersionId: x.costBasisVersionId,
          businessDate: ctx.businessDate,
          actorId: ctx.actor.actorId,
          occurredAt: ctx.clock.now(),
          referenceType: input.referenceType || 'reversal',
          referenceId: input.referenceId,
          reason: input.reason
        });
      });

      if (rev.coverage === 'untracked') {
        /* Dữ liệu legacy không truy được phân bổ gốc. Đánh dấu để rà tay —
           KHÔNG đoán bừa (invariant #12). */
        plan.domainRecords.push({
          type: 'manualReviewTask',
          record: {
            reason: 'AMBIGUOUS_LEGACY',
            referenceId: input.referenceId,
            qty: rev.untrackedQty,
            note: 'không truy được phân bổ gốc — cần rà thủ công trước khi coi là đã hoàn'
          }
        });
      }

      /* Side-effect ĐI QUA EVENT, không phải if/else ở đây. */
      if (input.eventType) {
        if (!EVENTS[input.eventType]) {
          return R.err('VALIDATION', 'sự kiện chưa khai: ' + input.eventType);
        }
        plan.events.push(Object.assign({
          type: input.eventType,
          referenceId: input.referenceId,
          storeId: ctx.storeId,
          businessDate: ctx.businessDate,
          occurredAt: ctx.clock.now(),
          reversedBy: ctx.actor.actorId,
          reason: input.reason
        }, input.eventData || {}));
      }

      plan.projectionRecomputes = rev.reversals.map(function (x) {
        return { itemId: x.itemId, storeId: ctx.storeId };
      });

      return R.ok(plan);
    }
  });

  /**
   * ReviseState — sửa con số đã chốt sai, KHÔNG có ý nghĩa tiêu thụ ngược.
   *
   * Hai thứ bắt buộc mà legacy thiếu ở mọi trường hợp đã audit:
   *   - audit-array giữ giá trị trước (append-only, không ghi đè)
   *   - `historicalPolicy` trả lời rõ đóng băng hay tính lại lịch sử
   */
  var ReviseState = pipeline.defineCommand({
    name: 'ReviseState',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['revise', input.entityType, input.entityId, input.field]);
    },

    validate: function (input) {
      if (!input || !input.entityId) return R.err('VALIDATION', 'ReviseState cần entityId');
      if (!input.entityType) return R.err('VALIDATION', 'ReviseState cần entityType');
      if (!input.field) return R.err('VALIDATION', 'ReviseState cần field');
      if (input.newValue === undefined) return R.err('VALIDATION', 'ReviseState cần newValue');
      if (!input.reason) return R.err('VALIDATION', 'sửa trạng thái phải có lý do');
      if (!HISTORICAL_POLICY[input.historicalPolicy]) {
        return R.err('VALIDATION',
          'ReviseState phải khai historicalPolicy: FREEZE (số đã công bố giữ nguyên) ' +
          'hay RECOMPUTE (tính lại lịch sử). Legacy để ngỏ câu này ở mọi trường hợp, ' +
          'nên không ai biết báo cáo cũ có đổi hay không.');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var opId = ids.deterministicId('operation', ['revise', input.entityType, input.entityId, input.field]);

      plan.domainRecords.push({
        type: 'stateRevision',
        record: {
          entityType: input.entityType,
          entityId: input.entityId,
          field: input.field,
          /* Append-only: giá trị cũ giữ lại để trả lời "số nào từng đúng". */
          before: input.currentValue === undefined ? null : input.currentValue,
          after: input.newValue,
          historicalPolicy: input.historicalPolicy,
          reason: input.reason,
          actorId: ctx.actor.actorId,
          at: ctx.clock.now(),
          operationId: opId
        }
      });

      /* RECOMPUTE mới đụng tới báo cáo cũ; FREEZE thì không. Quyết định này
         hiện ra trong plan, không nằm ngầm trong đầu người bấm nút. */
      if (input.historicalPolicy === HISTORICAL_POLICY.RECOMPUTE && input.affectedScope) {
        plan.projectionRecomputes.push(input.affectedScope);
      }

      plan.events.push({
        type: EVENTS.StateRevised,
        entityType: input.entityType,
        entityId: input.entityId,
        field: input.field,
        historicalPolicy: input.historicalPolicy,
        storeId: ctx.storeId,
        businessDate: ctx.businessDate
      });

      return R.ok(plan);
    }
  });

  /**
   * LedgerCorrection — đóng gap "sửa 1 dòng ledger sai".
   *
   * Ghi dòng ĐẢO + dòng ĐÚNG, `referenceId` trỏ về dòng gốc. KHÔNG update dòng
   * cũ — ledger append-only THẬT, không lặp lại pattern mutate-tại-chỗ của
   * `ctnDaoHaoHutMa` legacy.
   */
  var CorrectLedgerEntry = pipeline.defineCommand({
    name: 'CorrectLedgerEntry',
    authority: 'REVIEW_APPROVE_CORRECT',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['ledgerfix', input.originalEntry.entryId]);
    },

    validate: function (input) {
      if (!input || !input.originalEntry) return R.err('VALIDATION', 'cần dòng ledger gốc');
      if (!input.corrected) return R.err('VALIDATION', 'cần nội dung đúng');
      if (!input.reason) return R.err('VALIDATION', 'sửa ledger phải có lý do');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      var o = input.originalEntry;

      /* Dòng ĐẢO. */
      plan.ledgerEntries.push({
        domain: o.domain, type: o.type, itemId: o.itemId, storeId: o.storeId,
        unitId: o.unitId, qtyDelta: -o.qtyDelta,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: ctx.clock.now(),
        referenceType: 'ledgerCorrection', referenceId: o.entryId,
        reason: 'đảo dòng sai: ' + input.reason
      });

      /* Dòng ĐÚNG. */
      plan.ledgerEntries.push({
        domain: o.domain,
        type: input.corrected.type || o.type,
        itemId: input.corrected.itemId || o.itemId,
        storeId: o.storeId,
        unitId: input.corrected.unitId !== undefined ? input.corrected.unitId : o.unitId,
        qtyDelta: input.corrected.qtyDelta,
        businessDate: ctx.businessDate, actorId: ctx.actor.actorId,
        occurredAt: ctx.clock.now(),
        referenceType: 'ledgerCorrection', referenceId: o.entryId,
        reason: 'thay cho dòng sai: ' + input.reason
      });

      plan.projectionRecomputes.push({ itemId: o.itemId, storeId: o.storeId });
      return R.ok(plan);
    }
  });

  return {
    HISTORICAL_POLICY: HISTORICAL_POLICY,
    EVENTS: EVENTS,
    createEventBus: createEventBus,
    ReverseTransaction: ReverseTransaction,
    ReviseState: ReviseState,
    CorrectLedgerEntry: CorrectLedgerEntry
  };
});
