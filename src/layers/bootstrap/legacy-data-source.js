/** Dịch query UI thành dữ liệu canonical từ legacy read port, chỉ đọc. */
GIEO.define('bootstrap/legacy-data-source', [
  'shared-kernel/result'
], function (R) {
  'use strict';

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
