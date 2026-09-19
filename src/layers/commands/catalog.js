/**
 * Lệnh ghi Catalog (Menu/Category/Promotion) — CP11.
 *
 * Chuỗi thật: `NET-CATALOG-PROMOTION-V1.md` CP11 (⚪ CHƯA THỂ XÁC NHẬN — tầng
 * command chưa tồn tại). Header của `catalog/menu.js` đã ghi rõ Ý ĐỊNH:
 * "QUANLY là nơi DUY NHẤT sửa menu (POS chỉ đọc)... Enforce ở tầng command
 * qua sources:['QUANLY'], không phải ở đây" — nhưng chưa có command nào wrap
 * `catalog/menu.js`/`catalog/promotion.js` để enforce ý định đó. Domain logic
 * (createMenuItem/rename/archive/linkRecipe/createCategory/createPromotion)
 * đã đúng và có test riêng (`tests/unit/catalog.test.js`); module này chỉ
 * đóng phần THIẾU — cùng hình dạng gap như RM1 (Receiving) trước khi có
 * `commands/receiving.js`.
 *
 * `catalog/packaging.js` (publishPackaging) CỐ Ý không nằm trong module này:
 * nó ghi qua `compaction/versioned-input` registry, một cơ chế ghi khác hẳn
 * (append-only version theo effectiveFrom, không phải sửa 1 bản ghi tại chỗ)
 * mà CHƯA có domain nào trong `commands/` từng wrap thành pipeline command —
 * đây là gap RIÊNG cắt ngang cả 7 loại VersionedInput (recipe/cost/packaging/
 * prepYield/payTerms/kpiTarget/config), không phải chuyện chỉ của catalog.
 * Gộp vào đây sẽ lẫn 2 quyết định kiến trúc khác nhau vào 1 PR.
 *
 * Quyền: `MASTER_CONFIGURE` — sửa menu/khuyến mãi là cấu hình dữ liệu gốc,
 * không phải duyệt/sửa một giao dịch đã phát sinh (khác `REVIEW_APPROVE_CORRECT`
 * mà RM3/SC3 dùng). Chỉ `QUANLY_ADMIN`/`SYSTEM_ADMIN` có quyền này
 * (`store-context/access.js` ROLES).
 *
 * Idempotency: `menuItemId`/`categoryId`/`promotionId` do CALLER cấp trước
 * (UI sinh 1 lần lúc mở form, không phải command tự sinh ngẫu nhiên) nên
 * double-tap submit cùng id là no-op — cùng nguyên tắc `receiptRef`/`countRef`
 * đã dùng ở RM1/SC2, áp dụng cho việc TẠO entity thay vì một giao dịch có ref
 * nghiệp vụ sẵn. Lệnh SỬA (rename/linkRecipe/archive/restore) cần thêm
 * `editRef` tường minh — không thể suy idempotency chỉ từ menuItemId vì 2 lần
 * sửa THẬT khác nhau trên cùng 1 món phải là 2 operationId khác nhau, không
 * phải "cùng input nên coi là 1 request được gửi lại" như CorrectReceivingCost.
 */
GIEO.define('commands/catalog', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'catalog/menu',
  'catalog/promotion'
], function (ids, R, pipeline, menu, promotion) {
  'use strict';

  function pushMenuItem(plan, item) {
    plan.domainRecords.push({ type: 'menuItem', record: item });
  }

  var CreateCategory = pipeline.defineCommand({
    name: 'CreateCategory',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['createcategory', input.categoryId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.categoryId, 'item')) {
        return R.err('VALIDATION', 'CreateCategory cần categoryId hợp lệ do caller cấp trước — ' +
          'id ngẫu nhiên trong command làm sập idempotency (giống bug #13)');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var made = menu.createCategory({
        categoryId: input.categoryId, storeId: ctx.storeId,
        name: input.name, displayOrder: input.displayOrder
      });
      if (R.isErr(made)) return made;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'category', record: made.value });
      return R.ok(plan);
    }
  });

  var CreateMenuItem = pipeline.defineCommand({
    name: 'CreateMenuItem',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['createmenuitem', input.menuItemId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.menuItemId, 'item')) {
        return R.err('VALIDATION', 'CreateMenuItem cần menuItemId hợp lệ do caller cấp trước');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var made = menu.createMenuItem({
        menuItemId: input.menuItemId, storeId: ctx.storeId, name: input.name,
        prices: input.prices, categoryId: input.categoryId, recipeId: input.recipeId,
        toppingIds: input.toppingIds, displayOrder: input.displayOrder, color: input.color
      });
      if (R.isErr(made)) return made;

      var plan = pipeline.emptyPlan();
      pushMenuItem(plan, made.value);
      return R.ok(plan);
    }
  });

  var RenameMenuItem = pipeline.defineCommand({
    name: 'RenameMenuItem',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['renamemenuitem', input.menuItemId, input.editRef]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.menuItemId, 'item')) return R.err('VALIDATION', 'cần menuItemId hợp lệ');
      if (!input.editRef) return R.err('VALIDATION', 'RenameMenuItem cần editRef để chống sửa đúp');
      if (!input.menuItem) return R.err('VALIDATION', 'thiếu input.menuItem (denormalized, không tự tra catalog)');
      return R.ok(true);
    },

    execute: function (input) {
      var renamed = menu.rename(input.menuItem, input.newName);
      if (R.isErr(renamed)) return renamed;

      var plan = pipeline.emptyPlan();
      pushMenuItem(plan, renamed.value);
      return R.ok(plan);
    }
  });

  var LinkRecipeToMenuItem = pipeline.defineCommand({
    name: 'LinkRecipeToMenuItem',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['linkrecipe', input.menuItemId, input.editRef]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.menuItemId, 'item')) return R.err('VALIDATION', 'cần menuItemId hợp lệ');
      if (!input.editRef) return R.err('VALIDATION', 'LinkRecipeToMenuItem cần editRef để chống sửa đúp');
      if (!input.menuItem) return R.err('VALIDATION', 'thiếu input.menuItem (denormalized, không tự tra catalog)');
      return R.ok(true);
    },

    execute: function (input) {
      var linked = menu.linkRecipe(input.menuItem, input.recipeId === undefined ? null : input.recipeId);
      if (R.isErr(linked)) return linked;

      var plan = pipeline.emptyPlan();
      pushMenuItem(plan, linked.value);
      return R.ok(plan);
    }
  });

  var ArchiveMenuItem = pipeline.defineCommand({
    name: 'ArchiveMenuItem',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['archivemenuitem', input.menuItemId, input.editRef]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.menuItemId, 'item')) return R.err('VALIDATION', 'cần menuItemId hợp lệ');
      if (!input.editRef) return R.err('VALIDATION', 'ArchiveMenuItem cần editRef để chống ngưng-bán đúp');
      if (!input.menuItem) return R.err('VALIDATION', 'thiếu input.menuItem (denormalized, không tự tra catalog)');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var archived = menu.archive(input.menuItem, input.at || ctx.clock.now());
      if (R.isErr(archived)) return archived;

      var plan = pipeline.emptyPlan();
      pushMenuItem(plan, archived.value);
      return R.ok(plan);
    }
  });

  var RestoreMenuItem = pipeline.defineCommand({
    name: 'RestoreMenuItem',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['restoremenuitem', input.menuItemId, input.editRef]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.menuItemId, 'item')) return R.err('VALIDATION', 'cần menuItemId hợp lệ');
      if (!input.editRef) return R.err('VALIDATION', 'RestoreMenuItem cần editRef để chống khôi phục đúp');
      if (!input.menuItem) return R.err('VALIDATION', 'thiếu input.menuItem (denormalized, không tự tra catalog)');
      return R.ok(true);
    },

    execute: function (input) {
      var restored = menu.restore(input.menuItem);
      if (R.isErr(restored)) return restored;

      var plan = pipeline.emptyPlan();
      pushMenuItem(plan, restored.value);
      return R.ok(plan);
    }
  });

  var CreatePromotion = pipeline.defineCommand({
    name: 'CreatePromotion',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input) {
      return ids.deterministicId('operation', ['createpromotion', input.promotionId]);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.promotionId, 'item')) {
        return R.err('VALIDATION', 'CreatePromotion cần promotionId hợp lệ do caller cấp trước');
      }
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var made = promotion.createPromotion({
        promotionId: input.promotionId, storeId: ctx.storeId, name: input.name,
        tier: input.tier, priority: input.priority, exclusivityGroup: input.exclusivityGroup,
        conditions: input.conditions, effect: input.effect, active: input.active
      });
      if (R.isErr(made)) return made;

      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({ type: 'promotion', record: made.value });
      return R.ok(plan);
    }
  });

  return {
    CreateCategory: CreateCategory,
    CreateMenuItem: CreateMenuItem,
    RenameMenuItem: RenameMenuItem,
    LinkRecipeToMenuItem: LinkRecipeToMenuItem,
    ArchiveMenuItem: ArchiveMenuItem,
    RestoreMenuItem: RestoreMenuItem,
    CreatePromotion: CreatePromotion
  };
});
