/**
 * FIFO allocation engine — §3.1 SelectEligibleUnit, §3.2 AllocateConsumption,
 * §3.3 HandleDebt, §3.4 OpenUnit.
 *
 * Contract: FIFO-CORE-ARCHITECTURE-V2.md.
 *
 * Đây là NƠI DUY NHẤT trong hệ thống phân bổ tiêu thụ cho Unit. Legacy có 2
 * engine song song (POS và QUANLY mỗi bên một bản, QUANLY còn tự cài lại thuật
 * toán "lô cũ nhất trước" trong submitPrepAdjust) — §9 yêu cầu loại bỏ hoàn toàn.
 *
 * Hai điểm đáng chú ý:
 *
 * 1. Mỗi allocation MANG THEO giá vốn thật của Unit bị trừ. Đây là thứ làm cho
 *    "COGS actual" tồn tại được — legacy chưa từng có (§10b.1), vì allocation
 *    của nó không trả về cost.
 *
 * 2. `WorkingSet` giữ trạng thái Unit trong SUỐT một operation. Một bill có 3
 *    món cùng dùng sữa thì requirement thứ 2 và 3 phải thấy số dư đã bị
 *    requirement thứ 1 trừ — đọc lại từ kho giữa chừng là đọc số cũ.
 */
GIEO.define('fifo-core/allocation', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'fifo-core/unit'
], function (ids, R, unitLib) {
  'use strict';

  var S = unitLib.STATUS;

  /**
   * §3.1 — Unit đủ điều kiện cấp phát, sắp theo `openedAt` TĂNG DẦN.
   *
   * Đã chốt với chủ quán: giữ `openedAt`, không đổi sang `receivedAt`. Đó là
   * hành vi production đã chạy nhiều năm; đổi sẽ làm lệch kết quả FIFO trên
   * dữ liệu đang tồn và làm shadow-compare ở P12 báo divergence hàng loạt.
   */
  function selectEligibleUnits(units, itemId) {
    return units
      .filter(function (u) {
        return u.itemId === itemId &&
          (u.status === S.OPEN || u.status === S.CONSUMING) &&
          u.remainingQty > 0;
      })
      .sort(function (a, b) {
        if (a.openedAt !== b.openedAt) return a.openedAt - b.openedAt;
        /* Cùng thời điểm mở thì sắp theo unitId để kết quả TẤT ĐỊNH — nếu không,
           thứ tự phụ thuộc thứ tự trả về của kho và test sẽ chập chờn. */
        return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
      });
  }

  /**
   * Trạng thái Unit trong suốt 1 operation. Mọi requirement của cùng operation
   * dùng chung 1 WorkingSet.
   */
  function createWorkingSet(units) {
    var byId = Object.create(null);
    var order = [];
    units.forEach(function (u) {
      byId[u.unitId] = Object.assign({}, u);
      order.push(u.unitId);
    });

    return {
      all: function () { return order.map(function (id) { return byId[id]; }); },
      get: function (unitId) { return byId[unitId] || null; },
      put: function (u) {
        if (!byId[u.unitId]) order.push(u.unitId);
        byId[u.unitId] = u;
      }
    };
  }

  /**
   * §3.2 — phân bổ tuần tự `min(avail, left)` qua các Unit theo thứ tự FIFO.
   *
   * KHÔNG tự ghi gì. Trả về kế hoạch: allocations + trạng thái Unit mới +
   * phần thiếu. Tầng command quyết định biến nó thành mutation hay không.
   */
  function allocateConsumption(workingSet, spec) {
    if (!spec) return R.err('VALIDATION', 'allocateConsumption cần spec');
    if (!ids.isId(spec.itemId, 'item')) return R.err('VALIDATION', 'cần itemId hợp lệ');
    if (typeof spec.qty !== 'number' || !(spec.qty > 0)) {
      return R.err('VALIDATION', 'qty phải là số dương');
    }
    if (!spec.operationId) return R.err('VALIDATION', 'allocateConsumption cần operationId');

    var eligible = selectEligibleUnits(workingSet.all(), spec.itemId);
    var left = spec.qty;
    var allocations = [];
    var touched = [];
    var unitsWithoutCost = [];

    for (var i = 0; i < eligible.length && left > 0; i++) {
      var u = eligible[i];
      var take = Math.min(u.remainingQty, left);
      if (take <= 0) continue;

      var next = Object.assign({}, u, { remainingQty: u.remainingQty - take });
      if (next.status === S.OPEN) next.status = S.CONSUMING;

      /* Lô TIẾP NHẬN từ hệ cũ không có giá vốn (xem SEED-CONTRACT-V1.md). Lượng
         vẫn trừ đúng — đó là điều kiện đã chốt — nhưng giá thì để null và báo ra,
         tuyệt đối không suy ra một con số. Đọc thẳng `u.costBasis.unitCost` ở
         đây sẽ ném lỗi ngay ca bán đầu tiên sau cutover. */
      var hasCost = !!(u.costBasis && typeof u.costBasis.unitCost === 'number');
      if (!hasCost) unitsWithoutCost.push(u.unitId);

      allocations.push({
        unitId: u.unitId,
        itemId: u.itemId,
        qty: take,
        /* Giá vốn THẬT của chính Unit này — nền của cogsActual (§10b.1). */
        unitCost: hasCost ? u.costBasis.unitCost : null,
        cost: hasCost ? take * u.costBasis.unitCost : null,
        costBasisVersionId: hasCost ? u.costBasis.versionId : null,
        unitBaseBefore: u.remainingQty,
        unitBaseAfter: next.remainingQty,
        operationId: spec.operationId
      });

      workingSet.put(next);
      touched.push(next);
      left -= take;
    }

    return R.ok({
      itemId: spec.itemId,
      requestedQty: spec.qty,
      allocatedQty: spec.qty - left,
      /* Phần không có Unit nào gánh được. Tầng trên quyết định ghi nợ hay từ chối. */
      shortfallQty: left,
      allocations: allocations,
      /* Chỉ cộng phần CÓ giá. Cộng null vào đây sẽ ra NaN và NaN đi tiếp vào
         báo cáo thì hỏng im lặng; để 0 thì tổng trông như đã đủ. */
      totalCost: allocations.reduce(function (s, a) {
        return s + (typeof a.cost === 'number' ? a.cost : 0);
      }, 0),
      /* Thiếu hàng, HOẶC có lô không giá vốn, thì `totalCost` chưa phải giá vốn
         thật. Nói rõ thay vì để tầng trên tưởng đã đủ. */
      costComplete: left === 0 && unitsWithoutCost.length === 0,
      unitsWithoutCost: unitsWithoutCost,
      touchedUnits: touched
    });
  }

  /**
   * §3.3 — phần thiếu thành NỢ tường minh trên Unit cuối cùng đã dùng.
   *
   * Legacy để remainingQty tụt xuống âm. Ở đây số âm vẫn được giữ (tương thích
   * công thức toán của `_ueComputeAllocation`) NHƯNG kèm field `debt` để tra
   * được trực tiếp, phục vụ cả FIFO alert lẫn điều kiện compact.
   */
  function handleShortfall(workingSet, plan, spec) {
    if (plan.shortfallQty <= 0) return R.ok({ plan: plan, debtUnit: null });

    var eligible = workingSet.all().filter(function (u) {
      return u.itemId === plan.itemId && (u.status === S.OPEN || u.status === S.CONSUMING);
    }).sort(function (a, b) { return a.openedAt - b.openedAt; });

    var target = eligible[eligible.length - 1];
    if (!target) {
      return R.err('PRECONDITION',
        'không có Unit nào đang mở cho item này để gánh nợ ' + plan.shortfallQty +
        ' — phải mở Unit mới trước khi tiêu thụ');
    }

    var withNegative = Object.assign({}, target, {
      remainingQty: target.remainingQty - plan.shortfallQty
    });
    var debtR = unitLib.recordDebt(withNegative, {
      amount: plan.shortfallQty,
      at: spec.at,
      operationId: plan.allocations.length ? plan.allocations[0].operationId : spec.operationId
    });
    if (R.isErr(debtR)) return debtR;

    workingSet.put(debtR.value);
    return R.ok({ plan: plan, debtUnit: debtR.value });
  }

  /**
   * §3.4 — mở Unit mới, hấp thụ nợ của mọi Unit đang nợ cùng item.
   * Giữ nguyên `unitEngineOnOpen` của legacy: newRemainingQty = capacity - totalDebt.
   *
   * Fix bắt buộc (Bug #15): bước đóng Unit nợ cũ KHÔNG được `.catch(console.warn)`
   * nuốt lỗi. Ở đây hàm là thuần nên không có chỗ nuốt — nó trả về danh sách
   * Unit phải cập nhật, và tầng command có nghĩa vụ ghi HẾT hoặc fail cả cụm.
   */
  function openUnitAbsorbingDebt(workingSet, spec) {
    var unit = spec.unit;
    if (!unit) return R.err('VALIDATION', 'openUnitAbsorbingDebt cần unit');

    var openR = unitLib.open(unit, spec);
    if (R.isErr(openR)) return openR;
    var opened = openR.value;

    var debtors = workingSet.all().filter(function (u) {
      return u.itemId === opened.itemId && u.debt && !u.debt.absorbedByUnitId;
    });

    var totalDebt = debtors.reduce(function (s, u) { return s + u.debt.amount; }, 0);
    var absorbed = [];

    for (var i = 0; i < debtors.length; i++) {
      var a = unitLib.absorbDebt(debtors[i], { byUnitId: opened.unitId, at: spec.at });
      if (R.isErr(a)) return a;
      /* Nợ đã chuyển sang Unit mới thì Unit cũ về 0, không giữ số âm nữa. */
      var settled = Object.assign({}, a.value, { remainingQty: 0 });
      workingSet.put(settled);
      absorbed.push(settled);
    }

    opened = Object.assign({}, opened, { remainingQty: opened.initialQty - totalDebt });
    workingSet.put(opened);

    return R.ok({
      unit: opened,
      absorbedDebtTotal: totalDebt,
      absorbedUnits: absorbed,
      /* Nợ lớn hơn cả hũ mới: mở xong vẫn âm. Phải nói ra, không im lặng. */
      stillInDebt: opened.remainingQty < 0
    });
  }

  /**
   * Phân bổ nhiều requirement trong CÙNG 1 operation (1 bill nhiều món, 1 mẻ
   * BTP nhiều nguyên liệu). Dùng chung WorkingSet nên requirement sau luôn thấy
   * số dư đã bị requirement trước trừ.
   */
  function allocateMany(workingSet, requirements, spec) {
    var plans = [];
    for (var i = 0; i < requirements.length; i++) {
      var req = requirements[i];
      var r = allocateConsumption(workingSet, {
        itemId: req.itemId,
        qty: req.qty,
        operationId: spec.operationId
      });
      if (R.isErr(r)) return r;
      plans.push(Object.assign({}, r.value, { requirementRef: req.ref || null }));
    }
    return R.ok({
      plans: plans,
      totalCost: plans.reduce(function (s, p) { return s + p.totalCost; }, 0),
      costComplete: plans.every(function (p) { return p.costComplete; }),
      shortfalls: plans.filter(function (p) { return p.shortfallQty > 0; })
    });
  }

  return {
    selectEligibleUnits: selectEligibleUnits,
    createWorkingSet: createWorkingSet,
    allocateConsumption: allocateConsumption,
    allocateMany: allocateMany,
    handleShortfall: handleShortfall,
    openUnitAbsorbingDebt: openUnitAbsorbingDebt
  };
});
