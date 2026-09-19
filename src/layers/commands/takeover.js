/**
 * TIẾP NHẬN HỆ CŨ — hệ mới tự làm, một lần, lúc cutover.
 *
 * Quyết định đã chốt (SEED-CONTRACT-V1.md): lấy `unitBase` hiện tại làm tồn đầu,
 * `costBasis` để trống. FIFO đúng về LƯỢNG ngay; COGS thực tế có dần khi nhập lô
 * mới. Dữ liệu cũ được ĐÁNH DẤU và không truy ngược.
 *
 * Đây là tầng NGHIỆP VỤ của việc tiếp nhận: nhận dữ liệu thô của hệ cũ và dựng
 * ra MỘT `MutationPlan`. Nó KHÔNG biết dữ liệu đó đến từ đâu — `bootstrap` nối
 * read port vào. Nhờ vậy luật tiếp nhận kiểm được mà không cần Firebase.
 *
 * Ghi vẫn đi qua đúng `persistence-firebase/atomic-commit` như mọi mutation
 * khác — tiếp nhận không có đường ghi riêng.
 *
 * Cả plan vào trọn hoặc không vào gì. Nạp nửa chừng là thứ tệ nhất ở đây: tồn
 * đầu có mà công thức chưa có thì FIFO sẽ trừ sai ngay ca đầu tiên.
 */
GIEO.define('commands/takeover', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'fifo-core/unit'
], function (ids, R, unitLib) {
  'use strict';

  var ORIGIN = 'LEGACY_SEED';

  function takeoverOperationId(cutoverDate) {
    /* Xác định theo mốc cutover: chạy lại lần hai ghi vào đúng các path cũ,
       KHÔNG nhân đôi tồn đầu. Id ngẫu nhiên ở đây nghĩa là bật app hai lần thì
       có hai bộ tồn đầu. */
    return ids.deterministicId('operation', ['takeover', cutoverDate]);
  }

  function itemIdOf(legacyId) { return ids.deterministicId('item', ['legacy', legacyId || 'unknown']); }

  /* ---------- Từng phần, tách nhỏ để kiểm được riêng ---------- */

  function buildItems(legacyItems, skipped) {
    return Object.keys(legacyItems || {}).map(function (id) {
      var it = legacyItems[id];
      if (!it || !it.name) { skipped.push({ kind: 'item', ref: id, why: 'không có tên' }); return null; }
      return {
        itemId: itemIdOf(id),
        name: it.name,
        unit: it.unit || null,
        countUnitName: it.countUnitName || null,
        baseQtyPerCountUnit: it.packagingUnits ? it.packagingUnits.baseQty : null,
        minStock: typeof it.minStock === 'number' ? it.minStock : 0,
        trackingMode: it.trackingMode || null,
        stockManaged: it.stockManaged !== false,
        /* `costPerUnit` của hệ cũ KHÔNG thành giá vốn lô — dùng nó như vậy đúng
           là lỗi "quy hết về giá scalar gần nhất" mà audit đã chỉ ra. Giữ làm
           GỢI Ý cho lần nhập tới, và gọi đúng tên của nó. */
        suggestedCostPerUnit: typeof it.costPerUnit === 'number' ? it.costPerUnit : null,
        origin: ORIGIN, legacyRef: id
      };
    }).filter(Boolean);
  }

  /**
   * Tồn đầu. Mỗi lô còn hàng thành một Unit.
   *
   * @param activeUnits nhánh RTDB `active_units` — tầng nóng, thắng cho lô đang mở
   */
  function buildUnits(containers, activeUnits, spec, skipped) {
    var rtByCode = Object.create(null);
    Object.keys(activeUnits || {}).forEach(function (itemId) {
      var byContainer = activeUnits[itemId] || {};
      Object.keys(byContainer).forEach(function (cid) {
        var u = byContainer[cid];
        if (u && u.code) rtByCode[u.code] = u;
      });
    });

    var units = [];
    Object.keys(containers || {}).forEach(function (id) {
      var c = Object.assign({ code: id }, containers[id]);
      if (c.status === 'finished') {
        skipped.push({ kind: 'unit', ref: c.code, why: 'đã dùng hết ở hệ cũ' });
        return;
      }
      var rt = rtByCode[c.code];
      /* Lô niêm phong lấy `baseQty` (chưa mở thì `unitBase` chưa có nghĩa);
         lô đang mở lấy số của RTDB, đúng phân tầng nóng/nguội của hệ cũ. */
      var qty = c.status === 'sealed'
        ? c.baseQty
        : (rt && typeof rt.unitBase === 'number' ? rt.unitBase : c.unitBase);

      /* Hũ đang mở dở giữ nguyên `openedAt` cũ để thứ tự FIFO khớp kệ thật.
         Hũ niêm phong không có mốc mở, và không được bịa ra một mốc. */
      var openedAt = c.status === 'sealed' ? null : ((rt && rt.openedAt) || c.openedAt || null);

      var out = unitLib.seedUnitFromLegacy({
        unitId: ids.deterministicId('unit', ['seed', c.code]),
        itemId: itemIdOf(c.itemId),
        storeId: spec.storeId,
        itemKind: 'raw',
        initialQty: qty,
        openedAt: openedAt,
        operationId: ids.deterministicId('operation', ['takeover', spec.cutoverDate, c.code]),
        seededAt: spec.cutoverDate,
        legacyRef: c.code
      });
      if (R.isErr(out)) {
        skipped.push({ kind: 'unit', ref: c.code, qty: qty, why: out.error.message.split(' — ')[0] });
        return;
      }
      units.push(out.value);
    });
    return units;
  }

  function buildRecipes(legacyRecipes, cutoverDate, skipped) {
    return Object.keys(legacyRecipes || {}).map(function (id) {
      var r = legacyRecipes[id];
      if (!r || !r.sizes) { skipped.push({ kind: 'recipe', ref: id, why: 'không có định lượng theo size' }); return null; }
      var recipeId = ids.deterministicId('recipe', ['legacy', id]);
      return {
        recipeId: recipeId,
        versionId: ids.deterministicId('version', ['takeover', recipeId]),
        /* Version đầu có hiệu lực TỪ mốc cutover. Không giả vờ công thức này đã
           có hiệu lực từ quá khứ — COGS lịch sử của hệ cũ không thuộc hệ mới. */
        effectiveFrom: cutoverDate,
        versionSource: ORIGIN,
        sizes: r.sizes,
        origin: ORIGIN, legacyRef: id
      };
    }).filter(Boolean);
  }

  function buildEmployees(legacyEmployees, cutoverDate, storeId, skipped) {
    return Object.keys(legacyEmployees || {}).map(function (id) {
      var e = legacyEmployees[id];
      if (!e || !e.fullName) { skipped.push({ kind: 'employee', ref: id, why: 'không có tên' }); return null; }
      return {
        employeeId: ids.deterministicId('employee', ['legacy', id]),
        actorId: ids.deterministicId('actor', ['legacy', id]),
        storeId: storeId,
        fullName: e.fullName,
        active: e.active !== false,
        /* Legacy có thể chưa có role. POS_OPERATOR là quyền tối thiểu; quyền
           QUANLY phải được gán tường minh, không suy từ tên/PIN. */
        role: e.role || 'POS_OPERATOR',
        /* Điều khoản lương hiệu lực TỪ mốc cutover, đi qua cơ chế versioning —
           sửa lương về sau không được làm trôi lương các ca đã chấm. */
        payTerms: {
          effectiveFrom: cutoverDate,
          payType: e.payType || null,
          hourlyRate: typeof e.hourlyRate === 'number' ? e.hourlyRate : null,
          fixedMonthlySalary: typeof e.fixedMonthlySalary === 'number' ? e.fixedMonthlySalary : null,
          otEnabled: !!e.otEnabled,
          otRate: typeof e.otRate === 'number' ? e.otRate : null,
          otThresholdHours: typeof e.otThresholdHours === 'number' ? e.otThresholdHours : null
        },
        /* PIN mang sang NGUYÊN VẸN. Tiếp nhận nghĩa là nhân viên đăng nhập bằng
           đúng mã họ vẫn dùng — bắt cả quán học lại PIN mới trong ngày cutover
           là tự tạo ra một sự cố không liên quan gì tới FIFO. */
        pin: e.pin || null,
        origin: ORIGIN, legacyRef: id
      };
    }).filter(Boolean);
  }

  function buildRevenue(closings) {
    return Object.keys(closings || {}).map(function (period) {
      var b = closings[period] || {};
      return {
        period: period,
        revisionNo: 1,
        /* Số ĐÃ CHỐT của hệ cũ, đóng băng nguyên trạng. Hệ mới không tính lại —
           tính lại một kỳ đã chốt là đổi con số chủ quán đã dùng để ra quyết định. */
        frozen: true,
        values: {
          revenue: typeof b.doanhThu === 'number' ? b.doanhThu : null,
          cogs: typeof b.giaVon === 'number' ? b.giaVon : null,
          expenses: typeof b.tongChiPhi === 'number' ? b.tongChiPhi : null,
          payroll: typeof b.luong === 'number' ? b.luong : null,
          profit: typeof b.lai === 'number' ? b.lai : null
        },
        closedBy: b.closedBy || null,
        closedAt: b.closedAt || null,
        origin: ORIGIN, legacyRef: period
      };
    });
  }

  /* ---------- Ghép thành một plan ---------- */

  /** Tên các nguồn hệ cũ cần đọc. Bootstrap đọc đúng danh sách này. */
  var SOURCES = ['inventoryItems', 'stockContainers', 'activeUnits', 'recipes', 'employees', 'bookClosings'];

  /**
   * @param spec.legacy        dữ liệu THÔ của hệ cũ, keyed theo SOURCES
   * @param spec.cutoverDate   'YYYY-MM-DD' — ranh giới truy vết
   * @param spec.storeId, spec.actorId
   */
  function buildPlan(spec) {
    if (!spec || !spec.legacy) {
      return R.err('VALIDATION', 'tiếp nhận cần dữ liệu thô của hệ cũ');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.cutoverDate || '')) {
      return R.err('VALIDATION',
        'tiếp nhận cần cutoverDate YYYY-MM-DD — đây là ranh giới truy vết, không đoán được');
    }
    if (!ids.isId(spec.storeId, 'store')) {
      return R.err('VALIDATION', 'tiếp nhận cần storeId hợp lệ');
    }
    if (!ids.isId(spec.actorId, 'actor')) {
      return R.err('VALIDATION', 'tiếp nhận cần actorId — ai bấm nút chuyển giao');
    }

    var L = spec.legacy;
    var missing = SOURCES.filter(function (n) { return L[n] === undefined || L[n] === null; });
    if (missing.length) {
      /* Thiếu một nguồn thì KHÔNG dựng plan một phần. Tiếp nhận thiếu công thức
         hay thiếu mặt hàng còn tệ hơn là chưa tiếp nhận. */
      return R.err('PRECONDITION',
        'thiếu nguồn hệ cũ, KHÔNG tiếp nhận một phần: ' + missing.join(', '), { missing: missing });
    }

    var skipped = [];
    var items = buildItems(L.inventoryItems, skipped);
    var units = buildUnits(L.stockContainers, L.activeUnits, spec, skipped);
    var recipes = buildRecipes(L.recipes, spec.cutoverDate, skipped);
    var employees = buildEmployees(L.employees, spec.cutoverDate, spec.storeId, skipped);
    var revenue = buildRevenue(L.bookClosings);

    if (!units.length && !items.length) {
      return R.err('PRECONDITION',
        'hệ cũ không trả về mặt hàng hay lô nào — dừng, vì tiếp nhận rỗng trông y hệt tiếp nhận thành công');
    }

    var operationId = takeoverOperationId(spec.cutoverDate);
    var plan = {
      operationId: operationId,
      /* Unit tiếp nhận đi qua ĐÚNG đường unitChanges như mọi Unit khác —
         không có kho riêng cho hàng cũ. Chúng khác ở `origin`, không khác
         ở chỗ lưu. */
      unitChanges: units,
      /* KHÔNG có ledgerEntries: tồn đầu không phải một lần nhập hàng. Sinh
         bút toán RECEIVING giả sẽ làm báo cáo "nhập trong kỳ" của ngày
         cutover vọt lên một con số chưa từng có ai nhập. */
      ledgerEntries: [],
      domainRecords: []
        .concat(items.map(function (x) { return { type: 'item', record: x }; }))
        .concat(recipes.map(function (x) { return { type: 'recipeVersion', record: x }; }))
        .concat(employees.map(function (x) { return { type: 'employee', record: x }; }))
        .concat(revenue.map(function (x) { return { type: 'monthlySnapshot', record: x }; })),
      audit: {
        command: 'TakeoverFromLegacy',
        actorId: spec.actorId,
        cutoverDate: spec.cutoverDate,
        /* Dán ranh giới ngay vào audit, không để ở tài liệu rời. */
        boundary: 'Dữ liệu tiếp nhận từ hệ cũ tại ' + spec.cutoverDate +
          '. Hệ mới truy vết từ mốc này trở đi; lịch sử trước đó thuộc hệ cũ và không truy xuất.',
        counts: {
          units: units.length, items: items.length, recipes: recipes.length,
          employees: employees.length, revenuePeriods: revenue.length,
          skipped: skipped.length
        }
      }
    };

    return R.ok({
      plan: plan,
      summary: {
        operationId: operationId,
        units: units.length,
        unitsOpen: units.filter(function (u) { return u.status === 'OPEN'; }).length,
        totalQty: units.reduce(function (s, u) { return s + u.initialQty; }, 0),
        items: items.length, recipes: recipes.length,
        employees: employees.length, revenuePeriods: revenue.length
      },
      skipped: skipped
    });
  }

  return {
    ORIGIN: ORIGIN,
    SOURCES: SOURCES,
    takeoverOperationId: takeoverOperationId,
    buildItems: buildItems,
    buildUnits: buildUnits,
    buildRecipes: buildRecipes,
    buildEmployees: buildEmployees,
    buildRevenue: buildRevenue,
    buildPlan: buildPlan
  };
});
