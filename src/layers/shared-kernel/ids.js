/**
 * Branded IDs — invariant #4 của GIEO-SYSTEM-REBUILD-PLAN.md §1.4 ("Identity phải tách biệt").
 *
 * Stack đã chốt là JS thuần nên không có type system để tách UnitId khỏi BillId
 * lúc biên dịch. Thay vào đó tách ở RUNTIME bằng tiền tố bắt buộc: mọi id mang
 * sẵn loại của nó, và assertId() từ chối id sai loại ngay tại chỗ dùng.
 *
 * Legacy không có ranh giới này — container.code vừa là identity nội bộ vừa là
 * nhãn người đọc, nên không thể phân biệt "id này là của cái gì" khi debug.
 */
GIEO.define('shared-kernel/ids', [], function () {
  'use strict';

  /* Mọi loại id trong hệ thống. Thêm loại mới = thêm vào đây, không tự chế
     tiền tố rời rạc ở nơi khác. */
  var KINDS = [
    'org', 'store', 'actor', 'employee', 'operation',
    'unit', 'item', 'receipt', 'supplier', 'ledger',
    'bill', 'billLine', 'prepBatch', 'prepItem',
    'recipe', 'recipeVersion', 'costBasis', 'version',
    'customer', 'shift', 'snapshot', 'alert', 'expense', 'liability', 'stockCount'
  ];

  var SEP = '_';
  var kindSet = Object.create(null);
  KINDS.forEach(function (k) { kindSet[k] = true; });

  function assertKind(kind) {
    if (!kindSet[kind]) throw new Error('[ids] loại id không hợp lệ: "' + kind + '"');
  }

  /** Bỏ ký tự có thể phá cấu trúc id hoặc path Firebase. */
  function sanitize(part) {
    return String(part).replace(/[^A-Za-z0-9.@+-]/g, '-');
  }

  var counter = 0;

  /**
   * Sinh id NGẪU NHIÊN. Chỉ dùng cho thực thể (Unit, Bill...).
   * TUYỆT ĐỐI không dùng cho operationId của mutation nghiệp vụ — xem
   * deterministicId(). Legacy dùng .add() random cho mutation là nguồn của
   * bug #13/#21/#22/#23/#24 (FIFO-CORE-ARCHITECTURE-V2.md §7).
   */
  function newId(kind) {
    assertKind(kind);
    counter = (counter + 1) % 1e6;
    var rand = Math.random().toString(36).slice(2, 10);
    return kind + SEP + Date.now().toString(36) + '-' + rand + '-' + counter.toString(36);
  }

  /**
   * Id XÁC ĐỊNH cho mutation — cùng input luôn ra cùng id, nên chạy lại là no-op.
   * Đây là bước 1 của IdempotencyGuard (FIFO-CORE-ARCHITECTURE-V2.md §7).
   */
  function deterministicId(kind, parts) {
    assertKind(kind);
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('[ids] deterministicId cần mảng parts không rỗng');
    }
    if (parts.some(function (p) { return p === null || p === undefined || p === ''; })) {
      throw new Error('[ids] deterministicId: parts không được có phần rỗng — ' + JSON.stringify(parts));
    }
    return kind + SEP + parts.map(sanitize).join('.');
  }

  function kindOf(id) {
    if (typeof id !== 'string') return null;
    var i = id.indexOf(SEP);
    if (i <= 0) return null;
    var k = id.slice(0, i);
    return kindSet[k] ? k : null;
  }

  function isId(id, kind) {
    assertKind(kind);
    return kindOf(id) === kind;
  }

  /** Dùng ở đầu mọi hàm nhận id — sai loại phải nổ ngay, không trôi xuống sâu. */
  function assertId(id, kind, where) {
    if (!isId(id, kind)) {
      throw new Error(
        '[ids] ' + (where || 'assertId') + ': cần ' + kind + 'Id, nhận được ' +
        (kindOf(id) ? kindOf(id) + 'Id' : JSON.stringify(id))
      );
    }
    return id;
  }

  return {
    KINDS: KINDS.slice(),
    newId: newId,
    deterministicId: deterministicId,
    kindOf: kindOf,
    isId: isId,
    assertId: assertId
  };
});
