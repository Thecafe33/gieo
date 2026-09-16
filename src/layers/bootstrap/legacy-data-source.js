/** Dịch query UI thành dữ liệu canonical từ legacy read port, chỉ đọc. */
GIEO.define('bootstrap/legacy-data-source', [
  'shared-kernel/result'
], function (R) {
  'use strict';

  /**
   * Query chưa có đường đọc từ schema cũ, kèm lý do. Danh sách này TỒN TẠI để
   * "chưa nối" là một lỗi hiện ra, không phải một ô trống trông như dữ liệu.
   */
  var NOT_WIRED = {
    GetAlerts: 'alerts là bảng của hệ thống mới, legacy không có nguồn tương đương',
    GetShiftStatus: 'ngày làm việc/ca ở legacy nằm rải nhiều path, chưa map canonical',
    GetPendingApprovals: 'legacy không có hàng đợi duyệt — đây chính là gap Bug #12/#16',
    /* Ledger cũ chỉ tra được theo containerCode, KHÔNG theo khoảng ngày, nên
       báo cáo kỳ chưa đọc được từ nguồn cũ. Nói ra, chứ không dựng báo cáo
       rỗng trông như "kỳ này không hao hụt gì". */
    GetUsageReport: 'ledger legacy chỉ tra theo containerCode, chưa tra được theo kỳ',
    GetLossReport: 'ledger legacy chỉ tra theo containerCode, chưa tra được theo kỳ',
    GetInventoryValuation: 'cần danh sách Unit đang mở toàn kho, legacy chưa có đường đọc theo lô',
    GetBTPReport: 'mẻ BTP legacy chưa map canonical theo kỳ'
  };

  /* Caller tự mang dữ liệu canonical thì không cần nguồn legacy nữa. */
  var CANONICAL_KEYS = {
    GetAlerts: 'alerts',
    GetShiftStatus: 'businessDay',
    GetPendingApprovals: 'pending',
    GetUsageReport: 'entries',
    GetLossReport: 'entries',
    GetInventoryValuation: 'units',
    GetBTPReport: 'batches'
  };

  function hasCanonicalInput(name, input) {
    var key = CANONICAL_KEYS[name];
    return !!(key && input[key] !== undefined);
  }

  function create(reader, defaults) {
    defaults = defaults || {};
    if (!reader) throw new Error('[legacy-data-source] cần legacy reader');

    function forQuery(name, input) {
      input = Object.assign({}, defaults, input || {});
      if (name === 'GetUnitTrace' && input.containerCode) {
        return reader.loadUnitTrace(input).then(function (out) {
          if (R.isErr(out)) return out;
          return R.ok({
            storeId: input.storeId,
            unitId: out.value.unit.unitId,
            unit: out.value.unit,
            ledgerEntries: out.value.ledgerEntries,
            allocations: out.value.allocations,
            legacyTrace: function () {
              return R.ok({ ambiguous: out.value.ambiguous, sourceDrift: out.value.sourceDrift });
            }
          });
        });
      }
      if (name === 'GetMenu' && !input.menuItems) {
        return reader.loadMenu(input).then(function (out) {
          if (R.isErr(out)) return out;
          return R.ok({
            storeId: input.storeId,
            categories: out.value.categories,
            menuItems: out.value.menuItems,
            legacyMeta: { ambiguous: out.value.ambiguous }
          });
        });
      }
      if ((name === 'GetRevenue' || name === 'GetCOGS') && input.businessDate && !input.bills) {
        return reader.loadBills(input).then(function (out) {
          if (R.isErr(out)) return out;
          return R.ok({
            storeId: input.storeId,
            bills: out.value.bills,
            legacyMeta: { source: out.value.source, ambiguous: out.value.ambiguous }
          });
        });
      }
      if (NOT_WIRED[name] && !hasCanonicalInput(name, input)) {
        /* Chưa có nguồn legacy cho query này. Trả LỖI, không trả rỗng.
           Rỗng và "chưa đọc được" trông giống nhau trên màn hình nhưng nghĩa
           ngược nhau: một bên là "không có cảnh báo nào", một bên là "không
           biết có cảnh báo hay không". Legacy sai đúng chỗ này. */
        return Promise.resolve(R.err('NOT_FOUND',
          'chưa nối nguồn dữ liệu legacy cho ' + name + ' — ' + NOT_WIRED[name]));
      }
      /* Query đã mang canonical input thì đi thẳng. Không tự suy đoán query lạ. */
      return Promise.resolve(R.ok(input));
    }

    function forCommand() {
      return Promise.resolve(R.err('FORBIDDEN',
        'legacy-data-source chỉ đọc — command không được hydrate từ đường này'));
    }

    function watchQuery(name, input, listener) {
      input = Object.assign({}, defaults, input || {});
      if (name !== 'GetMenu' || typeof reader.watchMenu !== 'function') return null;
      return reader.watchMenu(input, function (out) {
        if (R.isErr(out)) return listener(out);
        listener(R.ok({
          storeId: input.storeId,
          categories: out.value.categories,
          menuItems: out.value.menuItems,
          legacyMeta: { ambiguous: out.value.ambiguous }
        }));
      });
    }

    return { forQuery: forQuery, forCommand: forCommand, watchQuery: watchQuery };
  }

  return { create: create };
});
