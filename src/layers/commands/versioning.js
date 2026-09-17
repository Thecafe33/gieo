/**
 * Lệnh ghi cho VersionedInput — CP-VersionedInput (NET-CATALOG-PROMOTION-V1.md
 * VIỆC PHẢI LÀM #3, header cũ của `commands/catalog.js` gọi đích danh gap này:
 * "gap RIÊNG cắt ngang cả 7 loại VersionedInput... đây là gap RIÊNG, không
 * phải chuyện chỉ của catalog").
 *
 * `compaction/versioned-input.js#createRegistry().publish()` đã tồn tại và
 * đúng cho CẢ 7 kind (`recipe`/`cost`/`packaging`/`prepYield`/`payTerms`/
 * `kpiTarget`/`config`, cộng `iceCogs` thêm sau) — và 6 domain module
 * (recipe-cost-btp/recipe.js, recipe-cost-btp/cost.js, catalog/packaging.js,
 * recipe-cost-btp/btp.js, hr/employee.js, finance/config.js) cộng
 * catalog/ice.js đã có sẵn hàm `publish*(registry, spec)` bọc đúng lời gọi
 * `registry.publish()` — nhưng KHÔNG command nào từng gọi tới các hàm này qua
 * pipeline (auth/idempotency/audit/atomic-commit), giống hình dạng gap RM1
 * trước khi có `commands/receiving.js`. Module này đóng đúng phần thiếu đó,
 * KHÔNG đổi domain logic.
 *
 * `kpiTarget` CỐ Ý không có Publish* ở đây: grep toàn bộ `src/layers` xác
 * nhận không domain module nào implement `publishKpiTarget()`/reader cho
 * kpiTarget — nó chỉ tồn tại như một entry chưa dùng trong
 * `compaction/versioned-input.js KINDS`. Đây là gap SÂU HƠN "thiếu command
 * wrapper" (domain KPI-target chưa từng được xây) — ngoài phạm vi PR này,
 * cần một lượt riêng nếu chủ quán xác nhận cần theo dõi KPI target thật.
 *
 * Idempotency: dùng `(kind, subjectId, storeId, effectiveFrom)` làm khoá thay
 * vì đòi thêm 1 field `editRef` như CP11 (Rename/Archive/...). Lý do: bản
 * thân `registry.publish()` đã BẮT BUỘC 2 lần publish THẬT khác nhau lên
 * cùng 1 subject phải có `effectiveFrom` khác nhau (registry từ chối
 * PRECONDITION nếu `effectiveFrom` không tăng nghiêm ngặt so với version mới
 * nhất) — nên `effectiveFrom` đã tự nhiên đóng đúng vai trò "cái gì làm 2 lần
 * publish khác nhau thành 2 operationId khác nhau", không cần bịa thêm field.
 * Double-tap submit CÙNG một effectiveFrom (cùng 1 request gửi lại) vẫn là
 * no-op qua IDEMPOTENCY stage như mọi command khác.
 *
 * `publishedBy` lấy từ `ctx.actor.actorId` (không phải input caller) — cùng
 * nguyên tắc `actorId`/`closedBy`/`openedBy` ở mọi command khác: người ký là
 * người đang thao tác qua context, không phải trường tự khai trong input.
 *
 * `input.deps.versionRegistry` — cùng pattern `commands/sales.js`/
 * `commands/receiving.js`: registry là dependency do caller/composition root
 * tiêm vào, không phải command tự dựng.
 */
GIEO.define('commands/versioning', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline',
  'recipe-cost-btp/recipe',
  'recipe-cost-btp/cost',
  'catalog/packaging',
  'recipe-cost-btp/btp',
  'hr/employee',
  'finance/config',
  'catalog/ice'
], function (ids, R, pipeline, recipeLib, costLib, packagingLib, btpLib, employeeLib, configLib, iceLib) {
  'use strict';

  function pushVersion(plan, version) {
    plan.domainRecords.push({ type: 'versionedInput', record: version });
    return plan;
  }

  function opId(kindTag, subjectId, storeId, effectiveFrom) {
    return ids.deterministicId('operation', ['publish' + kindTag, subjectId, storeId, String(effectiveFrom)]);
  }

  function requireRegistry(input) {
    return input && input.deps && input.deps.versionRegistry;
  }

  function requireEffectiveFrom(input) {
    if (typeof input.effectiveFrom !== 'number') {
      return R.err('VALIDATION', 'cần effectiveFrom (timestamp) — thời điểm hiệu lực là quyết định nghiệp vụ, không có mặc định để rơi vào');
    }
    return R.ok(true);
  }

  var PublishRecipeVersion = pipeline.defineCommand({
    name: 'PublishRecipeVersion',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('recipe', input.recipeId, ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.recipeId, 'recipe')) return R.err('VALIDATION', 'cần recipeId hợp lệ');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = recipeLib.publishRecipeVersion(input.deps.versionRegistry, {
        recipeId: input.recipeId, storeId: ctx.storeId,
        effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        components: input.components
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  var PublishCostBasis = pipeline.defineCommand({
    name: 'PublishCostBasis',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('cost', input.itemId, ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.itemId, 'item')) return R.err('VALIDATION', 'cần itemId hợp lệ');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = costLib.publishCostBasis(input.deps.versionRegistry, {
        itemId: input.itemId, storeId: ctx.storeId,
        effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        unitCost: input.unitCost, currency: input.currency, source: input.source
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  var PublishPackaging = pipeline.defineCommand({
    name: 'PublishPackaging',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('packaging', input.menuItemId || '__default__', ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input) return R.err('VALIDATION', 'PublishPackaging cần input');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = packagingLib.publishPackaging(input.deps.versionRegistry, {
        menuItemId: input.menuItemId || null, storeId: ctx.storeId,
        effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        tier: input.tier, packaging: input.packaging
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  var PublishYield = pipeline.defineCommand({
    name: 'PublishYield',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('yield', input.prepItemId, ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.prepItemId, 'prepItem')) return R.err('VALIDATION', 'cần prepItemId hợp lệ');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = btpLib.publishYield(input.deps.versionRegistry, {
        prepItemId: input.prepItemId, storeId: ctx.storeId,
        effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        yieldPerBatch: input.yieldPerBatch, sampleCount: input.sampleCount, source: input.source
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  var PublishPayTerms = pipeline.defineCommand({
    name: 'PublishPayTerms',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('payterms', input.employeeId, ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input || !ids.isId(input.employeeId, 'employee')) return R.err('VALIDATION', 'cần employeeId hợp lệ');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = employeeLib.publishPayTerms(input.deps.versionRegistry, {
        employeeId: input.employeeId, storeId: ctx.storeId,
        effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        terms: input.terms
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  var PublishConfig = pipeline.defineCommand({
    name: 'PublishConfig',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('config', input.key, ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input || !input.key) return R.err('VALIDATION', 'cần key cấu hình');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = configLib.publishConfig(input.deps.versionRegistry, {
        key: input.key, storeId: ctx.storeId,
        effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        value: input.value
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  var PublishIceCogs = pipeline.defineCommand({
    name: 'PublishIceCogs',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],

    operationId: function (input, ctx) {
      return opId('icecogs', '__default__', ctx.storeId, input.effectiveFrom);
    },

    validate: function (input) {
      if (!input) return R.err('VALIDATION', 'PublishIceCogs cần input');
      var ef = requireEffectiveFrom(input);
      if (R.isErr(ef)) return ef;
      if (!requireRegistry(input)) return R.err('VALIDATION', 'thiếu input.deps.versionRegistry');
      return R.ok(true);
    },

    execute: function (input, ctx) {
      var published = iceLib.publishIceCogs(input.deps.versionRegistry, {
        storeId: ctx.storeId, effectiveFrom: input.effectiveFrom, publishedBy: ctx.actor.actorId,
        enabled: input.enabled, itemId: input.itemId, qtyPerCup: input.qtyPerCup
      });
      if (R.isErr(published)) return published;
      return R.ok(pushVersion(pipeline.emptyPlan(), published.value));
    }
  });

  return {
    PublishRecipeVersion: PublishRecipeVersion,
    PublishCostBasis: PublishCostBasis,
    PublishPackaging: PublishPackaging,
    PublishYield: PublishYield,
    PublishPayTerms: PublishPayTerms,
    PublishConfig: PublishConfig,
    PublishIceCogs: PublishIceCogs
  };
});
