/**
 * Lệnh ghi danh mục CẤU HÌNH Kho — 2026-09-18.
 *
 * Quyết định chủ quán (nguyên văn, giữ lại vì đây là lý do module này khác
 * hẳn commands/receiving.js hay commands/stock-count.js): "mấy cái đó là
 * tính năng đơn giản, chỉ cần có chỗ lưu và app pos đọc là được, không phải
 * core đừng bắt có backend quá phiền phức... coi lại hệ thống cũ và thực
 * hiện". Các màn Kho ở đây (vị trí kho, lý do hao hụt, dụng cụ đựng, refill,
 * checklist ca, công thức topping, đặt hàng) ở legacy chỉ là
 * `db.collection(x).doc(y).set(...)` — không FIFO, không COGS, không state
 * machine. Việc DUY NHẤT module này thêm so với legacy là đi qua đúng MỘT
 * đường ghi (`commands/pipeline.js`) như mọi command khác — không có đường
 * ghi tắt riêng cho "cấu hình", đúng nguyên tắc "đường ghi DUY NHẤT của cả
 * POS lẫn QUANLY" mà pipeline.js đã ghi ở đầu file.
 *
 * `defineConfigUpsert` cùng hình dạng CreateCategory (commands/catalog.js):
 * validate id do caller cấp trước (idempotency), execute chỉ gói input
 * thành 1 domainRecord. Sửa/xoá dùng LẠI đúng command này — "xoá" là gọi lại
 * với `active:false` (archive), không xoá cứng: giữ đúng §2.3a (không âm
 * thầm làm mất dữ liệu) và cùng mẫu ArchiveMenuItem đã có.
 *
 * Quyền MASTER_CONFIGURE — cùng mức với catalog (menu/category/promotion):
 * đây là cấu hình dữ liệu gốc của quán, không phải duyệt một giao dịch đã
 * phát sinh.
 */
GIEO.define('commands/kho-config', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'commands/pipeline'
], function (ids, R, pipeline) {
  'use strict';

  function defineConfigUpsert(spec) {
    return pipeline.defineCommand({
      name: spec.name,
      authority: 'MASTER_CONFIGURE',
      mutates: true,
      sources: ['QUANLY'],

      /* editRef bắt buộc — 2 lần lưu THẬT khác nhau (sửa lần 1 rồi sửa lần 2)
         phải ra 2 operationId khác nhau, không coi lần sửa sau là gửi lại
         lần trước (cùng lý do RenameMenuItem cần editRef). */
      operationId: function (input) {
        return ids.deterministicId('operation',
          [spec.opPrefix, input.id, input.editRef || 'create']);
      },

      validate: function (input) {
        if (!input || !ids.isId(input.id, 'item')) {
          return R.err('VALIDATION', spec.name + ' cần id hợp lệ do caller cấp trước');
        }
        if (!input.editRef) {
          return R.err('VALIDATION', spec.name + ' cần editRef để chống lưu đúp');
        }
        return spec.validate ? spec.validate(input) : R.ok(true);
      },

      execute: function (input, ctx) {
        var record = Object.assign({}, spec.pick(input), {
          id: input.id,
          storeId: ctx.storeId,
          active: input.active !== false,
          updatedAt: ctx.clock.now()
        });
        var plan = pipeline.emptyPlan();
        plan.domainRecords.push({ type: spec.recordType, record: record });
        return R.ok(plan);
      }
    });
  }

  var SaveStorageLocation = defineConfigUpsert({
    name: 'SaveStorageLocation', opPrefix: 'kholoc', recordType: 'storageLocation',
    validate: function (input) {
      if (!input.name) return R.err('VALIDATION', 'SaveStorageLocation cần name');
      return R.ok(true);
    },
    pick: function (input) { return { name: input.name, type: input.type || null, note: input.note || null }; }
  });

  var SaveWasteReason = defineConfigUpsert({
    name: 'SaveWasteReason', opPrefix: 'khowaste', recordType: 'wasteReason',
    validate: function (input) {
      if (!input.label) return R.err('VALIDATION', 'SaveWasteReason cần label');
      return R.ok(true);
    },
    pick: function (input) { return { label: input.label }; }
  });

  var SaveVessel = defineConfigUpsert({
    name: 'SaveVessel', opPrefix: 'khovessel', recordType: 'vessel',
    validate: function (input) {
      if (!input.name) return R.err('VALIDATION', 'SaveVessel cần name');
      return R.ok(true);
    },
    pick: function (input) {
      return { code: input.code || null, name: input.name, note: input.note || null, variants: input.variants || [] };
    }
  });

  var SaveRefillRule = defineConfigUpsert({
    name: 'SaveRefillRule', opPrefix: 'khorefill', recordType: 'refillRule',
    validate: function (input) {
      if (!ids.isId(input.itemId, 'item')) return R.err('VALIDATION', 'SaveRefillRule cần itemId hợp lệ');
      return R.ok(true);
    },
    pick: function (input) {
      return {
        itemId: input.itemId, itemName: input.itemName || null,
        sourceLocationId: input.sourceLocationId || null, destLocationId: input.destLocationId || null,
        targetBase: input.targetBase || 0, minBase: input.minBase || 0, maxBase: input.maxBase || 0
      };
    }
  });

  var SaveChecklistItem = defineConfigUpsert({
    name: 'SaveChecklistItem', opPrefix: 'khochecklist', recordType: 'checklistItem',
    validate: function (input) {
      if (!input.label) return R.err('VALIDATION', 'SaveChecklistItem cần label');
      if (input.phase !== 'open' && input.phase !== 'close') {
        return R.err('VALIDATION', 'SaveChecklistItem cần phase là open hoặc close');
      }
      return R.ok(true);
    },
    pick: function (input) {
      return {
        phase: input.phase, label: input.label, blocking: !!input.blocking,
        order: typeof input.order === 'number' ? input.order : 0
      };
    }
  });

  var SaveToppingRecipe = defineConfigUpsert({
    name: 'SaveToppingRecipe', opPrefix: 'khotopping', recordType: 'toppingRecipe',
    validate: function (input) {
      if (!input.toppingName) return R.err('VALIDATION', 'SaveToppingRecipe cần toppingName');
      return R.ok(true);
    },
    pick: function (input) {
      return {
        toppingName: input.toppingName, batchInputs: input.batchInputs || [],
        batchYield: input.batchYield || 0, qtyPerServing: input.qtyPerServing || 0,
        costPerServing: input.costPerServing || null, note: input.note || null
      };
    }
  });

  /**
   * Đặt hàng (kho:po) — legacy `renderKhoPO`. Chỉ tạo/huỷ; "nhận hàng" (điều
   * chỉnh giá vốn/kho thật) đã có đường riêng qua commands/receiving.js
   * (ReceiveGoods), không lặp lại ở đây.
   */
  var CreatePurchaseOrder = pipeline.defineCommand({
    name: 'CreatePurchaseOrder',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],
    operationId: function (input) {
      return ids.deterministicId('operation', ['createpo', input.purchaseOrderId]);
    },
    validate: function (input) {
      if (!input || !ids.isId(input.purchaseOrderId, 'item')) {
        return R.err('VALIDATION', 'CreatePurchaseOrder cần purchaseOrderId hợp lệ do caller cấp trước');
      }
      if (!input.supplier) return R.err('VALIDATION', 'CreatePurchaseOrder cần supplier');
      return R.ok(true);
    },
    execute: function (input, ctx) {
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({
        type: 'purchaseOrder',
        record: {
          purchaseOrderId: input.purchaseOrderId, storeId: ctx.storeId,
          supplier: input.supplier, note: input.note || null,
          status: 'pending', lines: input.lines || [],
          createdAt: ctx.clock.now(), createdBy: ctx.actor.actorId
        }
      });
      return R.ok(plan);
    }
  });

  var CancelPurchaseOrder = pipeline.defineCommand({
    name: 'CancelPurchaseOrder',
    authority: 'MASTER_CONFIGURE',
    mutates: true,
    sources: ['QUANLY'],
    operationId: function (input) {
      return ids.deterministicId('operation', ['cancelpo', input.purchaseOrderId]);
    },
    validate: function (input) {
      if (!input || !ids.isId(input.purchaseOrderId, 'item')) {
        return R.err('VALIDATION', 'CancelPurchaseOrder cần purchaseOrderId hợp lệ');
      }
      if (!input.purchaseOrder) return R.err('VALIDATION', 'thiếu input.purchaseOrder (denormalized, không tự tra kho)');
      return R.ok(true);
    },
    execute: function (input) {
      var plan = pipeline.emptyPlan();
      plan.domainRecords.push({
        type: 'purchaseOrder',
        record: Object.assign({}, input.purchaseOrder, { status: 'cancelled' })
      });
      return R.ok(plan);
    }
  });

  return {
    SaveStorageLocation: SaveStorageLocation,
    SaveWasteReason: SaveWasteReason,
    SaveVessel: SaveVessel,
    SaveRefillRule: SaveRefillRule,
    SaveChecklistItem: SaveChecklistItem,
    SaveToppingRecipe: SaveToppingRecipe,
    CreatePurchaseOrder: CreatePurchaseOrder,
    CancelPurchaseOrder: CancelPurchaseOrder
  };
});
