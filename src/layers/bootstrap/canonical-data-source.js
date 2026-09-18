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

    /**
     * `commands/reversal.js#ReverseTransaction` đọc thẳng `input.units` (không
     * qua `deps` như RecordSale) để dựng workingSet rồi cộng ngược đúng những
     * Unit mà `originalAllocations` trỏ tới. Không nạp trước thì mọi lần xoá
     * bill — kể cả bill traceable thật sự — đều NOT_FOUND vì workingSet rỗng.
     * `originalAllocations` rỗng (bill legacy, coverage 'untracked') thì không
     * có itemId nào để tra — bỏ qua, để `reconciliation.reverseAllocations`
     * tự đi đúng nhánh rỗng của nó.
     */
    function hydrateForReverseTransaction(input) {
      var origs = input.originalAllocations || [];
      var itemIds = uniq(origs.map(function (a) { return a.itemId; }).filter(Boolean));
      if (!itemIds.length) return Promise.resolve(R.ok(input));
      var ctx = { organizationId: defaults.organizationId, storeId: input.storeId };
      return loadUnitsFor(ctx, itemIds).then(function (out) {
        if (R.isErr(out)) return out;
        return R.ok(Object.assign({}, input, { units: (input.units || []).concat(out.value) }));
      });
    }

    function forCommand(name, input) {
      input = input || {};
      if (name === 'ReverseTransaction' && !input.units) return hydrateForReverseTransaction(input);
      /* Không phải RecordSale, hoặc bill chưa dựng (không phải việc của module
         này — `RecordSale.validate` sẽ báo lỗi đúng chỗ): đi thẳng, không thêm
         gì — cùng nguyên tắc pass-through của `legacy-data-source.js`. */
      if (name !== 'RecordSale' || !input.bill || !input.bill.lines) {
        return Promise.resolve(R.ok(input));
      }
      return hydrateForRecordSale(input);
    }

    /**
     * Đọc canonical TRƯỚC khi rơi xuống legacy (đối xứng với forCommand ở
     * trên). Bốn query: GetLedgerEntriesForReference (nguồn
     * `originalAllocations` cho ReverseTransaction khi xoá bill, §3.8),
     * GetLoyaltyLedgerForReference (nguồn `eventData.loyaltyEntries` cho
     * CÙNG lệnh đó, NET-LOYALTY-V1.md #4), và GetKhoConfigList/GetKhoHistory
     * (danh mục/sổ Kho, commands/kho-config.js, 2026-09-18 — collection MỚI,
     * không có gì ở legacy để rơi xuống, nên legacy-data-source.js không cần
     * biết 2 tên này). Bill sinh SAU cutover có dữ liệu canonical thật ở đây;
     * bill legacy không có gì (mảng rỗng), nên KHÔNG set `input.entries` — để
     * nguyên input đi tiếp.
     *
     * `bootstrap/legacy-data-source.js` KHÔNG có nhánh dịch riêng cho query
     * này (đã kiểm tra: không nằm trong NOT_WIRED, không có branch riêng —
     * cố ý, không phải thiếu sót). Lý do: `mapLedgerEntry`/`mapUnit`
     * (legacy-firebase-adapter/mappers.js) suy `unitId` cho giao dịch legacy
     * qua namespace `'legacy'`, còn `commands/takeover.js#buildUnits` seed
     * Unit THẬT vào workingSet qua namespace `'seed'` — hai id KHÔNG BAO GIỜ
     * trùng nhau. Có đọc được `stock_transactions_gieogieo`/
     * `prep_transactions_gieogieo` (referenceId=orderId) thì cũng không suy
     * ra được Unit thật nào để hoàn tác chính xác — `takeover` chỉ chụp snapshot
     * tổng tại mốc cutover, không mang theo lịch sử per-unit trước cutover.
     * Mảng rỗng ở đây là đường ĐÚNG cho bill legacy: rơi thẳng xuống nhánh
     * `originalAllocations.length === 0` có sẵn của
     * `fifo-core/reconciliation.js#reverseAllocations` (coverage 'untracked',
     * cờ needsManualReview, không đụng workingSet) — không phải gap cần vá.
     *
     * Lỗi đọc (RETRYABLE) cũng xử lý NHƯ rỗng — không chặn cả câu hỏi vì một
     * lần đọc canonical trục trặc: coi như 'untracked', vẫn cho người dùng rà
     * tay qua manualReviewTask, còn hơn màn xoá bill không dùng được khi
     * Firestore canonical chập chờn. Đây là "để trống cho tầng sau", không
     * phải "coi lỗi là rỗng hợp lệ" — không có field nào bị GHI ĐÈ thành
     * 0/rỗng trông như dữ liệu thật.
     */
    function forQuery(name, input) {
      input = input || {};
      if (name === 'GetLedgerEntriesForReference' && input.referenceId && input.domain && !input.entries) {
        var ctx = { organizationId: defaults.organizationId, storeId: input.storeId };
        return reader.loadEntriesForReference(ctx, input.referenceId, input.domain).then(function (out) {
          if (R.isErr(out) || out.value.length === 0) return R.ok(input);
          return R.ok(Object.assign({}, input, { entries: out.value, entriesSource: 'CANONICAL' }));
        });
      }
      /* NET-LOYALTY-V1.md #4 — nguồn eventData.loyaltyEntries cho
         ReverseTransaction lúc xoá bill; bill legacy trả rỗng (đúng, vì
         AccrueLoyaltyForSale chưa từng chạy cho bill đó). */
      if (name === 'GetLoyaltyLedgerForReference' && input.billId && !input.entries) {
        var ctx2 = { organizationId: defaults.organizationId, storeId: input.storeId };
        return reader.loadLoyaltyEntriesForReference(ctx2, input.billId).then(function (out) {
          if (R.isErr(out) || out.value.length === 0) return R.ok(input);
          return R.ok(Object.assign({}, input, { entries: out.value }));
        });
      }
      /* Kho — danh mục cấu hình đơn giản (commands/kho-config.js, 2026-09-18):
         liệt kê nguyên collection của input.kind. */
      if (name === 'GetKhoConfigList' && input.kind && !input.entries) {
        var ctx3 = { organizationId: defaults.organizationId, storeId: input.storeId };
        return reader.listKhoConfig(ctx3, input.kind).then(function (out) {
          if (R.isErr(out) || out.value.length === 0) return R.ok(input);
          return R.ok(Object.assign({}, input, { entries: out.value }));
        });
      }
      /* Kho — lịch sử kho (kho:history): sổ ledger raw+prep gần đây. */
      if (name === 'GetKhoHistory' && !input.entries) {
        var ctx4 = { organizationId: defaults.organizationId, storeId: input.storeId };
        return reader.loadRecentLedgerEntries(ctx4, input.domain || null).then(function (out) {
          if (R.isErr(out) || out.value.length === 0) return R.ok(input);
          return R.ok(Object.assign({}, input, { entries: out.value }));
        });
      }
      /* Kho — hàng đang mở & tem (kho:containers, 2026-09-18): toàn bộ Unit
         SEALED/OPEN/CONSUMING/LOST của cả kho, không lọc itemId. */
      if (name === 'GetOpenUnits' && !input.units) {
        var ctx5 = { organizationId: defaults.organizationId, storeId: input.storeId };
        return reader.loadOpenUnits(ctx5).then(function (out) {
          if (R.isErr(out) || out.value.length === 0) return R.ok(input);
          return R.ok(Object.assign({}, input, { units: out.value }));
        });
      }
      return Promise.resolve(R.ok(input));
    }

    return { forCommand: forCommand, forQuery: forQuery };
  }

  return { create: create };
});
