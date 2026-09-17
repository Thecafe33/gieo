/**
 * Hydrate `deps.units`/`deps.versionRegistry` cho command TRƯỚC khi tới pipeline.
 *
 * Đây LÀ mảnh còn thiếu mà `bootstrap/legacy-data-source.js#forCommand` cố ý
 * không làm (đọc comment ở đó — pass-through vĩnh viễn, "command đã phải mang
 * canonical input từ controller/read-layer"). `commands/sales.js RecordSale`,
 * `commands/inventory.js RecordWaste/ReportLostContainer/RestoreFoundContainer`,
 * `commands/prep.js`, `commands/receiving.js` đều đợi `deps.units`/
 * `deps.versionRegistry` do CALLER mang tới — không có gì tự động cấp trước
 * module này. Phạm vi bản đầu: CHỈ `RecordSale` (quyết định chủ quán
 * 2026-09-17 — checkout là gap chặn bán, các command còn lại để đợt sau).
 *
 * Thuật toán 2 pha, vì registry cần biết Recipe/Packaging/Ice TRƯỚC mới suy ra
 * được itemId nguyên liệu cần giá (`recipe-cost-btp/cost.js` KINDS.cost) —
 * đúng đúng thứ tự `commands/sales.js#buildRequirements` đã làm với registry
 * cho sẵn, ở đây chỉ là tự đọc registry đó từ Firestore thay vì test tự dựng:
 *
 *   Pha 1 — đọc version recipe (mỗi dòng)/packaging (mỗi dòng + fallback
 *           '__default__')/iceCogs ('__default__' toàn quán), dựng registry
 *           TẠM, gọi `buildRequirements` THẬT (hàm thuần, không side-effect)
 *           để biết requirements (itemId nguyên liệu).
 *   Pha 2 — đọc version cost của đúng những itemId đó + đọc Unit đang có của
 *           đúng những itemId đó, nạp thêm vào CÙNG registry.
 *
 * `buildRequirements` được gọi ở đây CHỈ để suy itemId — `RecordSale.execute`
 * vẫn gọi lại nó (hàm thuần, gọi 2 lần cho kết quả giống hệt, không tốn gì
 * ngoài 1 lượt tính lại rẻ).
 *
 * Không có version/Unit nào cho một itemId thì mảng rỗng, KHÔNG lỗi — đúng
 * §2.3a: thiếu dữ liệu suy biến thành gap-flag qua đường đã có sẵn trong
 * `buildRequirements`/`computeCogs` (gapLines/NO_RECIPE, cogsActual=null),
 * không phải lý do chặn RecordSale ở đây.
 */
GIEO.define('bootstrap/canonical-data-source', [
  'shared-kernel/result',
  'commands/sales'
], function (R, salesLib) {
  'use strict';

  function uniq(list) {
    var seen = Object.create(null);
    return list.filter(function (x) {
      var k = JSON.stringify(x);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function create(reader, defaults) {
    defaults = defaults || {};
    if (!reader) throw new Error('[canonical-data-source] cần canonical reader');

    function loadVersionsFor(ctx, pairs) {
      return Promise.all(pairs.map(function (p) { return reader.loadVersions(ctx, p.kind, p.subjectId); }))
        .then(function (results) {
          var all = [];
          for (var i = 0; i < results.length; i++) {
            if (R.isErr(results[i])) return results[i];
            all = all.concat(results[i].value);
          }
          return R.ok(all);
        });
    }

    function loadUnitsFor(ctx, itemIds) {
      return Promise.all(itemIds.map(function (id) { return reader.loadUnitsForItem(ctx, id); }))
        .then(function (results) {
          var all = [];
          for (var i = 0; i < results.length; i++) {
            if (R.isErr(results[i])) return results[i];
            all = all.concat(results[i].value);
          }
          return R.ok(all);
        });
    }

    function hydrateForRecordSale(input) {
      var bill = input.bill;
      var ctx = { organizationId: defaults.organizationId, storeId: bill.storeId };

      var phase1Pairs = uniq([].concat(
        bill.lines.filter(function (l) { return !!l.recipeId; })
          .map(function (l) { return { kind: 'recipe', subjectId: l.recipeId }; }),
        bill.lines.map(function (l) { return { kind: 'packaging', subjectId: l.menuItemId }; }),
        [{ kind: 'packaging', subjectId: '__default__' }, { kind: 'iceCogs', subjectId: '__default__' }]
      ));

      var registry = salesLib.createVersionRegistry();

      return loadVersionsFor(ctx, phase1Pairs).then(function (v1) {
        if (R.isErr(v1)) return v1;
        var h1 = registry.hydrate(v1.value);
        if (R.isErr(h1)) return h1;

        var reqR = salesLib.buildRequirements(bill, { versionRegistry: registry });
        if (R.isErr(reqR)) return reqR;
        var itemIds = uniq(reqR.value.requirements.map(function (r) { return r.itemId; }));

        return Promise.all([
          loadVersionsFor(ctx, itemIds.map(function (id) { return { kind: 'cost', subjectId: id }; })),
          loadUnitsFor(ctx, itemIds)
        ]).then(function (rows) {
          if (R.isErr(rows[0])) return rows[0];
          if (R.isErr(rows[1])) return rows[1];
          var h2 = registry.hydrate(rows[0].value);
          if (R.isErr(h2)) return h2;

          var mergedDeps = Object.assign(
            { units: rows[1].value, versionRegistry: registry },
            input.deps || {}
          );
          return R.ok(Object.assign({}, input, { deps: mergedDeps }));
        });
      });
    }

    function forCommand(name, input) {
      input = input || {};
      /* Không phải RecordSale, hoặc bill chưa dựng (không phải việc của module
         này — `RecordSale.validate` sẽ báo lỗi đúng chỗ): đi thẳng, không thêm
         gì — cùng nguyên tắc pass-through của `legacy-data-source.js`. */
      if (name !== 'RecordSale' || !input.bill || !input.bill.lines) {
        return Promise.resolve(R.ok(input));
      }
      return hydrateForRecordSale(input);
    }

    return { forCommand: forCommand };
  }

  return { create: create };
});
