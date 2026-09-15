/**
 * Authorization — lõi bảo mật.
 *
 * Contract: POS-QUANLY-PERMISSION-CONTRACT-V1.md
 *   §3  ba lớp quyền EXECUTE / REVIEW-APPROVE-CORRECT / MASTER-CONFIGURE
 *   §20 5 vai trò, quyết định = Actor + Store Scope + Command + Authority
 *   §23 ALL_STORES KHÔNG tự động có mutation authority
 *   §24 permission check phải ở Command/Domain — bypass UI vẫn phải DENY
 *   §27 invariant 8 (approval fail-closed), 17 (enforce ở Command/Domain)
 *
 * Gap đang đóng: legacy Reporting có 0% phân quyền đọc — QUANLY dùng 1 tài khoản
 * Firebase dùng chung nên mọi người thấy toàn bộ P&L/COGS/khách hàng
 * (GIEO-REBUILD-HANDOFF-V2.md §4.1). Ở đây quyền đọc bị kiểm tra y như quyền ghi.
 */
GIEO.define('store-context/access', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  /* §3 — ba lớp quyền. POS không phải "ít quyền hơn" QUANLY; hai bên có
     authority khác nhau theo nghiệp vụ (§2). */
  var AUTHORITY = {
    EXECUTE: 'EXECUTE',
    REVIEW_APPROVE_CORRECT: 'REVIEW_APPROVE_CORRECT',
    MASTER_CONFIGURE: 'MASTER_CONFIGURE'
  };

  var SOURCE = { POS: 'POS', QUANLY: 'QUANLY', SYSTEM: 'SYSTEM' };

  /* §20 — 5 vai trò tối thiểu. Vai trò KHÔNG phân cấp tuyến tính: STORE_MANAGER
     giữ EXECUTE mà QUANLY_ADMIN không có, vì admin không đứng quầy bán hàng. */
  var ROLES = {
    POS_OPERATOR: [AUTHORITY.EXECUTE],
    STORE_MANAGER: [AUTHORITY.EXECUTE, AUTHORITY.REVIEW_APPROVE_CORRECT],
    QUANLY_OPERATOR: [AUTHORITY.REVIEW_APPROVE_CORRECT],
    QUANLY_ADMIN: [AUTHORITY.REVIEW_APPROVE_CORRECT, AUTHORITY.MASTER_CONFIGURE],
    SYSTEM_ADMIN: [AUTHORITY.EXECUTE, AUTHORITY.REVIEW_APPROVE_CORRECT, AUTHORITY.MASTER_CONFIGURE]
  };

  /**
   * Sổ đăng ký command. MẶC ĐỊNH ĐÓNG: command chưa đăng ký thì bị từ chối
   * (§27 invariant 8 fail-closed, và quy tắc P4 của read-layer contract).
   * Quên đăng ký là hỏng ồn ào lúc chạy test, không phải lỗ hổng im lặng.
   */
  var registry = Object.create(null);

  /**
   * @param {string} name        tên command, vd 'ApproveLostContainer'
   * @param {object} spec
   *   authority   {string}   lớp quyền tối thiểu cần có
   *   mutates     {boolean}  có đổi business state không (ảnh hưởng luật §23)
   *   sources     {string[]} app nào được gọi; bỏ trống = mọi app
   *   crossStore  {boolean}  có được thao tác nhiều store cùng lúc không (§23)
   */
  function registerCommand(name, spec) {
    if (!name || typeof name !== 'string') throw new Error('[access] registerCommand cần tên');
    if (registry[name]) throw new Error('[access] command đăng ký trùng: "' + name + '"');
    if (!AUTHORITY[spec && spec.authority]) {
      throw new Error('[access] command "' + name + '" cần authority hợp lệ');
    }
    if (typeof spec.mutates !== 'boolean') {
      throw new Error('[access] command "' + name + '" phải khai báo rõ mutates true/false');
    }
    registry[name] = {
      name: name,
      authority: spec.authority,
      mutates: spec.mutates,
      sources: spec.sources ? spec.sources.slice() : null,
      crossStore: !!spec.crossStore
    };
    return registry[name];
  }

  function getCommand(name) { return registry[name] || null; }
  function listCommands() { return Object.keys(registry).sort(); }

  /**
   * Actor.
   * `stores`   — danh sách store được phép GHI. §23: chỉ store trong đây mới mutate được.
   * `allStoresRead` — ALL_STORES theo đúng nghĩa §27 invariant 14: aggregation/READ,
   *                   KHÔNG kéo theo quyền ghi ở store ngoài `stores`.
   */
  function createActor(spec) {
    if (!spec) return R.err('VALIDATION', 'actor cần spec');
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'actor cần actorId hợp lệ');
    if (!ROLES[spec.role]) return R.err('VALIDATION', 'vai trò không hợp lệ: ' + spec.role);
    if (!SOURCE[spec.source]) return R.err('VALIDATION', 'source không hợp lệ: ' + spec.source);
    var stores = spec.stores || [];
    if (!Array.isArray(stores)) return R.err('VALIDATION', 'actor.stores phải là mảng');
    for (var i = 0; i < stores.length; i++) {
      if (!ids.isId(stores[i], 'store')) return R.err('VALIDATION', 'actor.stores có phần tử không phải storeId');
    }
    return R.ok({
      actorId: spec.actorId,
      role: spec.role,
      source: spec.source,
      stores: stores.slice(),
      allStoresRead: !!spec.allStoresRead,
      authorities: ROLES[spec.role].slice()
    });
  }

  function hasAuthority(actor, authority) {
    return !!actor && actor.authorities.indexOf(authority) !== -1;
  }

  function canWriteStore(actor, storeId) {
    return !!actor && actor.stores.indexOf(storeId) !== -1;
  }

  function canReadStore(actor, storeId) {
    return !!actor && (actor.allStoresRead || canWriteStore(actor, storeId));
  }

  /**
   * Quyết định cuối cùng. Gọi từ Command layer, KHÔNG phải từ UI (§24).
   * Trả Result — FORBIDDEN là tình huống nghiệp vụ, không phải exception.
   */
  function authorize(actor, commandName, targetStoreId) {
    if (!actor || !actor.actorId) {
      return R.err('FORBIDDEN', 'không có actor — mọi mutation phải có actorId (invariant #7)');
    }
    var cmd = getCommand(commandName);
    if (!cmd) {
      /* Mặc định đóng. Command mới chưa khai quyền thì chặn, không mở. */
      return R.err('FORBIDDEN', 'command "' + commandName + '" chưa đăng ký quyền — mặc định từ chối', {
        hint: 'gọi access.registerCommand() ở layer commands khi khai báo command'
      });
    }
    if (cmd.sources && cmd.sources.indexOf(actor.source) === -1) {
      return R.err('FORBIDDEN', 'command "' + commandName + '" không gọi được từ ' + actor.source +
        ' (chỉ: ' + cmd.sources.join(', ') + ')');
    }
    if (!hasAuthority(actor, cmd.authority)) {
      return R.err('FORBIDDEN', 'vai trò ' + actor.role + ' thiếu quyền ' + cmd.authority +
        ' cho command "' + commandName + '"');
    }
    if (!ids.isId(targetStoreId, 'store')) {
      return R.err('VALIDATION', 'authorize cần targetStoreId hợp lệ — mọi thao tác phải nêu rõ store');
    }

    if (cmd.mutates) {
      /* §23: ALL_STORES không tự động có mutation authority. Đọc được khắp nơi
         không có nghĩa ghi được khắp nơi. */
      if (!canWriteStore(actor, targetStoreId)) {
        return R.err('FORBIDDEN', 'actor không có quyền ghi tại store ' + targetStoreId +
          (actor.allStoresRead ? ' (ALL_STORES chỉ là phạm vi ĐỌC, không kéo theo quyền ghi)' : ''));
      }
    } else if (!canReadStore(actor, targetStoreId)) {
      return R.err('FORBIDDEN', 'actor không có quyền đọc tại store ' + targetStoreId);
    }

    return R.ok({
      actorId: actor.actorId,
      command: commandName,
      storeId: targetStoreId,
      authority: cmd.authority,
      mutates: cmd.mutates
    });
  }

  /**
   * Mutation nhiều store — §23 đòi targetStoreIds[] + explicit authority +
   * per-store validation. Không có đường tắt "có ALL_STORES nên làm hết".
   */
  function authorizeMany(actor, commandName, targetStoreIds) {
    var cmd = getCommand(commandName);
    if (!cmd) return R.err('FORBIDDEN', 'command "' + commandName + '" chưa đăng ký quyền');
    if (!Array.isArray(targetStoreIds) || targetStoreIds.length === 0) {
      return R.err('VALIDATION', 'authorizeMany cần mảng targetStoreIds không rỗng');
    }
    if (cmd.mutates && !cmd.crossStore && targetStoreIds.length > 1) {
      return R.err('FORBIDDEN', 'command "' + commandName + '" không được khai crossStore');
    }
    var out = [];
    for (var i = 0; i < targetStoreIds.length; i++) {
      var r = authorize(actor, commandName, targetStoreIds[i]);
      if (R.isErr(r)) return r;
      out.push(r.value);
    }
    return R.ok(out);
  }

  /** Chỉ để render UI. KHÔNG BAO GIỜ được dùng thay cho authorize() (§24). */
  function describeForUi(actor, commandName, targetStoreId) {
    return R.isOk(authorize(actor, commandName, targetStoreId));
  }

  return {
    AUTHORITY: AUTHORITY,
    SOURCE: SOURCE,
    ROLES: ROLES,
    registerCommand: registerCommand,
    getCommand: getCommand,
    listCommands: listCommands,
    createActor: createActor,
    hasAuthority: hasAuthority,
    canReadStore: canReadStore,
    canWriteStore: canWriteStore,
    authorize: authorize,
    authorizeMany: authorizeMany,
    describeForUi: describeForUi
  };
});
