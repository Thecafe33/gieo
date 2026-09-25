/**
 * Định giá tồn kho — dùng `Unit.costBasis` THẬT, không phải giá scalar gần nhất.
 *
 * Gap (GIEO-REBUILD-HANDOFF-V2.md §4.2, FIFO-CHAIN-TRACE-REPORTING-V1.md §4):
 * legacy định giá tồn kho bằng giá gần nhất của mặt hàng, nên tồn gồm nhiều lô
 * giá khác nhau vẫn bị quy về một giá — sai lệch càng lớn khi giá nhập biến động.
 *
 * Điểm thứ hai của §4 cũng quan trọng không kém: khi hiển thị cùng lúc 2 chỉ số
 * dùng 2 CƠ SỞ GIÁ khác nhau (tồn kho hiện tại vs tiêu hao lịch sử), mỗi số
 * phải mang nhãn cơ sở giá của chính nó. Legacy chỉ có chú thích nhỏ, nên người
 * đọc dễ so hai số không cùng gốc. Ở đây `basis` là field của kết quả.
 */
GIEO.define('reporting/inventory-valuation', [
  'shared-kernel/result'
], function (R) {
  'use strict';

  var BASIS = {
    /* Cộng theo giá vốn thật của từng lô còn tồn. */
    FIFO_ACTUAL: 'FIFO_ACTUAL',
    /* Chỉ dùng cho phần tồn KHÔNG có Unit đại diện, vì không có lô để hỏi giá. */
    LATEST_COST: 'LATEST_COST'
  };

  /**
   * Giá trị tồn kho theo từng lô.
   *
   * Phần `untracked` (tồn không có Unit) được tách riêng và ghi rõ nó dùng cơ
   * sở giá khác — gộp vào tổng mà không nói là làm người đọc tưởng cả tổng đều
   * là giá lô thật.
   */
  function valuate(spec) {
    var units = spec.units || [];
    var trackedValue = 0;
    var trackedQty = 0;
    var lines = [];

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.status !== 'SEALED' && u.status !== 'OPEN' && u.status !== 'CONSUMING') continue;
      var qty = u.status === 'SEALED' ? u.initialQty : u.remainingQty;
      if (qty <= 0) continue;
      if (!u.costBasis || typeof u.costBasis.unitCost !== 'number') {
        return R.err('PRECONDITION',
          'Unit ' + u.unitId + ' không có costBasis — không định giá được bằng giá lô thật',
          { unitId: u.unitId });
      }
      var value = qty * u.costBasis.unitCost;
      trackedValue += value;
      trackedQty += qty;
      lines.push({
        unitId: u.unitId, itemId: u.itemId, qty: qty,
        unitCost: u.costBasis.unitCost, value: value,
        costBasisVersionId: u.costBasis.versionId
      });
    }

    var untrackedQty = spec.untrackedBase || 0;
    var untrackedValue = null;
    if (untrackedQty > 0) {
      if (typeof spec.latestUnitCost !== 'number') {
        return R.err('NOT_FOUND',
          'có ' + untrackedQty + ' tồn không gắn lô nhưng không biết giá gần nhất để định giá phần đó');
      }
      untrackedValue = untrackedQty * spec.latestUnitCost;
    }

    return R.ok({
      tracked: { qty: trackedQty, value: trackedValue, basis: BASIS.FIFO_ACTUAL, lines: lines },
      untracked: untrackedQty > 0
        ? { qty: untrackedQty, value: untrackedValue, basis: BASIS.LATEST_COST, unitCost: spec.latestUnitCost }
        : null,
      totalQty: trackedQty + untrackedQty,
      totalValue: trackedValue + (untrackedValue || 0),
      /* Tổng trộn 2 cơ sở giá thì phải NÓI RA. */
      mixedBasis: untrackedQty > 0,
      computedAt: spec.computedAt || null
    });
  }

  /**
   * Nhãn cơ sở giá cho UI. §4 yêu cầu nhãn đi kèm từng số, không phải chú
   * thích nhỏ ở cuối màn.
   */
  function describeBasis(basis) {
    return basis === BASIS.FIFO_ACTUAL
      ? 'giá vốn thật của từng lô còn tồn'
      : 'giá nhập gần nhất (phần tồn không gắn lô)';
  }

  return { BASIS: BASIS, valuate: valuate, describeBasis: describeBasis };
});
