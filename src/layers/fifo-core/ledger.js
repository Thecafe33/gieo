/**
 * StockLedgerEntry — MỘT đường ghi sổ kho duy nhất.
 *
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md §3.10, §5, §6.
 *
 * Thay thế CẢ `stock_transactions_gieogieo` (POS) LẪN `applyStockTransaction`
 * (QUANLY). Legacy có 2 app ghi thẳng cùng dữ liệu kho bằng 2 công thức độc lập
 * (LEGACY-FIFO-AUDIT.md §16.3) — đây là đường ghi duy nhất thay cho cả hai.
 *
 * ────────────────────────────────────────────────────────────────────────
 * `untrackedPendingDelta` — root cause lớn nhất toàn bộ audit
 * (gốc của bug #1/#11/#14/#17/#18, LEGACY-FIFO-AUDIT.md §16.1)
 *
 * Legacy: mỗi hàm TỰ QUYẾT ĐỊNH có cộng field này hay không, theo một danh sách
 * type cứng (`posgieo.html:13313-13315` chỉ match CONSUMPTION/WASTE khi
 * !deriveFromUnits). RECEIVING không nằm trong danh sách → Bug #11.
 *
 * Ở đây nó KHÔNG phải tham số. Truyền vào là bị TỪ CHỐI. Nó được TÍNH bởi
 * chính hàm này theo đúng một quy tắc, không có danh sách type nào:
 *
 *     có unitId cụ thể  → untrackedPendingDelta = 0        (đã có Unit đại diện)
 *     không có unitId   → untrackedPendingDelta = qtyDelta (LUÔN LUÔN, mọi type)
 *
 * Vì không còn ngoại lệ theo type, một `type` mới thêm vào tương lai KHÔNG THỂ
 * quên cộng field này. Bug #11 và #14 biến mất vì chúng chỉ còn là trường hợp
 * riêng của quy tắc chung, không phải nhánh cần vá riêng.
 * ────────────────────────────────────────────────────────────────────────
 */
GIEO.define('fifo-core/ledger', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  var TYPE = {
    RECEIVING: 'RECEIVING',
    CONSUMPTION: 'CONSUMPTION',
    WASTE: 'WASTE',
    ADJUSTMENT: 'ADJUSTMENT',
    TRANSFER: 'TRANSFER',
    REVERSAL: 'REVERSAL',
    LOST: 'LOST',
    FOUND: 'FOUND'
  };

  var DOMAIN = { raw: 'raw', prep: 'prep' };

  function isType(t) { return Object.prototype.hasOwnProperty.call(TYPE, t); }

  /**
   * Quy tắc §5, tách riêng thành 1 hàm để chỉ có ĐÚNG MỘT nơi trả lời câu hỏi
   * này trong toàn hệ thống.
   */
  function computeUntrackedPendingDelta(unitId, qtyDelta) {
    return unitId ? 0 : qtyDelta;
  }

  /**
   * @param spec.operationId  bắt buộc (invariant #7)
   * @param spec.domain       'raw' | 'prep'
   * @param spec.type         TYPE.*
   * @param spec.itemId, spec.storeId
   * @param spec.unitId       null khi không đủ Unit đại diện — xem quy tắc §5
   * @param spec.qtyDelta     dương = vào kho, âm = ra kho
   * @param spec.businessDate ngày làm việc (trạng thái vận hành, không phải lịch)
   * @param spec.actorId
   */
  function createEntry(spec) {
    if (!spec) return R.err('VALIDATION', 'createEntry cần spec');

    /* Chặn ở đây, không phải bằng quy ước: nếu để lọt tham số này thì ta đã tái
       lập đúng cơ chế đã sinh ra 5 bug của legacy. */
    if (Object.prototype.hasOwnProperty.call(spec, 'untrackedPendingDelta')) {
      return R.err('VALIDATION',
        'untrackedPendingDelta KHÔNG phải tham số — nó được tính bắt buộc theo §5. ' +
        'Truyền tay chính là cơ chế đã gây bug #1/#11/#14/#17/#18.');
    }

    if (!spec.operationId) return R.err('VALIDATION', 'ledger entry cần operationId');
    if (!DOMAIN[spec.domain]) return R.err('VALIDATION', "domain phải là 'raw' hoặc 'prep'");
    if (!isType(spec.type)) return R.err('VALIDATION', 'type không hợp lệ: ' + spec.type);
    if (!ids.isId(spec.itemId, 'item')) return R.err('VALIDATION', 'ledger entry cần itemId hợp lệ');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'ledger entry cần storeId hợp lệ');
    if (typeof spec.qtyDelta !== 'number' || !isFinite(spec.qtyDelta)) {
      return R.err('VALIDATION', 'qtyDelta phải là số hữu hạn');
    }
    if (!spec.businessDate) return R.err('VALIDATION', 'ledger entry cần businessDate');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'ledger entry cần actorId');
    if (spec.unitId !== undefined && spec.unitId !== null && !ids.isId(spec.unitId, 'unit')) {
      return R.err('VALIDATION', 'unitId không hợp lệ');
    }

    var unitId = spec.unitId || null;

    return R.ok({
      entryId: spec.entryId || ids.deterministicId('ledger', [
        spec.operationId, spec.type, spec.itemId, unitId || 'no-unit'
      ]),
      operationId: spec.operationId,
      domain: spec.domain,
      type: spec.type,
      itemId: spec.itemId,
      storeId: spec.storeId,
      unitId: unitId,
      qtyDelta: spec.qtyDelta,
      /* Tính, không nhận. */
      untrackedPendingDelta: computeUntrackedPendingDelta(unitId, spec.qtyDelta),
      costBasisVersionId: spec.costBasisVersionId || null,
      unitCost: typeof spec.unitCost === 'number' ? spec.unitCost : null,
      businessDate: spec.businessDate,
      actorId: spec.actorId,
      occurredAt: typeof spec.occurredAt === 'number' ? spec.occurredAt : null,
      referenceType: spec.referenceType || null,
      referenceId: spec.referenceId || null,
      reason: spec.reason || null
    });
  }

  /**
   * §6 — RECEIVING giữ 2 vế như legacy: RECEIVING(+good+damaged) rồi WASTE(-damaged).
   *
   * Legacy có contract kế toán này đúng nhưng bất đối xứng ở chỗ RECEIVING không
   * cộng untrackedPendingDelta còn WASTE thì có (Bug #11). Ở đây cả 2 vế đi qua
   * cùng `createEntry` nên tự đối xứng — không cần luật riêng cho receiving.
   *
   * Phần hàng không sinh đủ Unit đại diện (vượt trần, số dư lẻ do làm tròn, lỗi
   * giữa chừng — Bug #14) chảy qua đúng cơ chế untrackedPendingDelta thay vì
   * "biến mất", vì entry đó đơn giản là không có unitId.
   */
  function createReceivingEntries(spec) {
    var good = spec.goodQty || 0;
    var damaged = spec.damagedQty || 0;
    if (good < 0 || damaged < 0) return R.err('VALIDATION', 'goodQty/damagedQty không được âm');
    if (good + damaged <= 0) return R.err('VALIDATION', 'nhận hàng phải có số lượng > 0');

    var base = {
      operationId: spec.operationId, domain: spec.domain, itemId: spec.itemId,
      storeId: spec.storeId, businessDate: spec.businessDate, actorId: spec.actorId,
      occurredAt: spec.occurredAt, referenceType: 'receipt', referenceId: spec.receiptId,
      costBasisVersionId: spec.costBasisVersionId, unitCost: spec.unitCost
    };

    var entries = [];
    var r = createEntry(Object.assign({}, base, {
      type: TYPE.RECEIVING,
      qtyDelta: good + damaged,
      unitId: spec.receivingUnitId || null
    }));
    if (R.isErr(r)) return r;
    entries.push(r.value);

    if (damaged > 0) {
      var w = createEntry(Object.assign({}, base, {
        type: TYPE.WASTE,
        qtyDelta: -damaged,
        unitId: spec.damagedUnitId || null,
        reason: spec.damagedReason || 'hàng hỏng khi nhận'
      }));
      if (R.isErr(w)) return w;
      entries.push(w.value);
    }
    return R.ok(entries);
  }

  /** Tổng untrackedPendingDelta của một tập entry — đầu vào của projection. */
  function sumUntrackedPendingDelta(entries) {
    return entries.reduce(function (sum, e) { return sum + e.untrackedPendingDelta; }, 0);
  }

  /**
   * Kiểm tra bất biến của một tập entry. Dùng trong test và trong snapshot
   * verifier — nếu có entry nào lệch quy tắc §5 thì dữ liệu đã hỏng ở đâu đó.
   */
  function auditEntries(entries) {
    var bad = [];
    entries.forEach(function (e) {
      var expected = computeUntrackedPendingDelta(e.unitId, e.qtyDelta);
      if (e.untrackedPendingDelta !== expected) {
        bad.push({
          entryId: e.entryId,
          expected: expected,
          actual: e.untrackedPendingDelta,
          reason: e.unitId ? 'có unitId thì phải là 0' : 'không có unitId thì phải bằng qtyDelta'
        });
      }
    });
    return bad.length ? R.err('VALIDATION', bad.length + ' entry vi phạm quy tắc §5', { bad: bad }) : R.ok(entries.length);
  }

  return {
    TYPE: TYPE,
    DOMAIN: DOMAIN,
    isType: isType,
    computeUntrackedPendingDelta: computeUntrackedPendingDelta,
    createEntry: createEntry,
    createReceivingEntries: createReceivingEntries,
    sumUntrackedPendingDelta: sumUntrackedPendingDelta,
    auditEntries: auditEntries
  };
});
