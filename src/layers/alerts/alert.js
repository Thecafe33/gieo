/**
 * AlertEngine — MỘT bộ máy cảnh báo, route theo (type, severity).
 *
 * Chuỗi thật: FIFO-CHAIN-TRACE-ALERTS-V1.md. Gap: FEATURE-TREE-V1.md §4.9, §4.17.
 *
 * Bốn vấn đề của legacy, đóng cả bốn:
 *
 * 1. SEVERITY GHI RỒI KHÔNG DÙNG (§2). Alert tự gắn `severity:'danger'` lúc tạo,
 *    nhưng `computeStoreHealth()` chỉ switch theo `a.type`. Loại nào không nằm
 *    trong 6 type đặt tên cứng thì rơi hết vào một bucket vàng chung "Cảnh báo
 *    khác chưa xem" — kể cả loại đã tự gắn nhãn danger. Trường dữ liệu tồn tại
 *    nhưng bị bỏ qua ở đúng bước quan trọng nhất là xếp hạng ưu tiên.
 *
 * 2. PUSH KHÔNG NHẤT QUÁN (§4). Hạn dùng chai/hũ đã mở được push đỏ; hạn dùng
 *    lô BTP tính đúng nhưng bị chôn trong màn Tài chính. Cùng là "hàng đã mở
 *    sắp hết hạn", một loại được báo chủ động, một loại phải tự tìm mới thấy.
 *    Tồn thấp chỉ hiện ở QUANLY — nhân viên đứng bán KHÔNG được báo sắp hết
 *    nguyên liệu. Ở đây `audience` là thuộc tính của LOẠI cảnh báo, quyết định
 *    theo mức nghiêm trọng thật, không theo việc ai code trước.
 *
 * 3. "ĐÃ XEM" TẮT CẢNH BÁO Y HỆT "ĐÃ XỬ LÝ" (§6). Hệ thống không xác minh vấn
 *    đề gốc đã được sửa trước khi ngừng nhắc. Ngoại lệ đúng duy nhất là FIFO
 *    bell — cơ chế duy nhất tự xoá khi điều kiện THẬT SỰ hết. Ở đây pattern đó
 *    thành mặc định cho mọi loại kiểm chứng được bằng dữ liệu.
 *
 * 4. 12/16 LOẠI RƠI VÀO KHUÔN UI CHUNG, mất nội dung chẩn đoán (§4.9). Ở đây
 *    mỗi loại tự khai trường bắt buộc của nó.
 */
GIEO.define('alerts/alert', ['shared-kernel/ids', 'shared-kernel/result'], function (ids, R) {
  'use strict';

  var SEVERITY = { INFO: 'INFO', WARNING: 'WARNING', DANGER: 'DANGER' };
  var SEVERITY_RANK = { INFO: 1, WARNING: 2, DANGER: 3 };

  /* Ai cần thấy. Quyết định theo mức nghiêm trọng thật của vấn đề. */
  var AUDIENCE = { POS: 'POS', QUANLY: 'QUANLY', BOTH: 'BOTH' };

  var RESOLUTION = {
    /* Tự xoá khi điều kiện hết — pattern của FIFO bell, giờ là mặc định. */
    AUTO_VERIFIABLE: 'AUTO_VERIFIABLE',
    /* Không kiểm chứng được bằng dữ liệu → phải link tới hành động đã sửa. */
    MANUAL_WITH_REFERENCE: 'MANUAL_WITH_REFERENCE'
  };

  var STATUS = { NEW: 'NEW', SEEN: 'SEEN', RESOLVED: 'RESOLVED', AUTO_CLEARED: 'AUTO_CLEARED' };

  /**
   * Sổ đăng ký loại cảnh báo. Mỗi loại tự khai severity / audience / cách đóng
   * / trường bắt buộc — không có khuôn chung nuốt mất nội dung chẩn đoán.
   */
  var TYPES = {
    FIFO_UNIT_EXHAUSTED: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.POS,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['unitId', 'itemId']
    },
    CONTAINER_EXPIRING: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.BOTH,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['unitId', 'itemId', 'expiresAt']
    },
    /* Cùng mức với CONTAINER_EXPIRING — cùng là rủi ro an toàn thực phẩm và
       vốn đọng. Legacy để loại này chôn trong màn Tài chính (§4). */
    PREP_BATCH_EXPIRING: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.BOTH,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['prepBatchId', 'itemId', 'expiresAt']
    },
    /* BOTH, không phải chỉ QUANLY — nhân viên đứng bán cần biết để báo khách. */
    LOW_STOCK: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.BOTH,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['itemId', 'currentStock', 'threshold']
    },
    STOCKOUT: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.BOTH,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['itemId', 'menuItemIds']
    },
    UNIT_NEEDS_REVIEW: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['unitId', 'reasons']
    },
    CASH_VARIANCE: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['segmentId', 'variance']
    },
    STOCK_VARIANCE: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['itemId', 'projected', 'observed']
    },
    COGS_OVER_TARGET: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['cogsPct', 'target', 'dateKey']
    },
    MISSING_RECIPE: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.BOTH,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['menuItemId']
    },
    UNTRACKED_CONSUMPTION: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['itemId', 'qty']
    },
    LOYALTY_DRIFT: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['customerId', 'drift']
    },
    DRIFT_AFTER_CLOSING: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['period', 'frozen', 'live']
    },
    SNAPSHOT_VERIFY_FAILED: {
      severity: SEVERITY.DANGER, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.MANUAL_WITH_REFERENCE, required: ['scope']
    },
    LOST_CONTAINER_PENDING: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.QUANLY,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['unitId', 'lostReportId']
    },
    DAY_NOT_CLOSED: {
      severity: SEVERITY.WARNING, audience: AUDIENCE.BOTH,
      resolution: RESOLUTION.AUTO_VERIFIABLE, required: ['dateKey']
    }
  };

  function isType(t) { return Object.prototype.hasOwnProperty.call(TYPES, t); }

  function raise(spec) {
    if (!spec || !isType(spec.type)) {
      return R.err('VALIDATION', 'loại cảnh báo chưa đăng ký: ' + (spec && spec.type) +
        ' — mọi loại phải khai severity/audience/cách đóng, không có khuôn chung');
    }
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'cảnh báo cần storeId hợp lệ');
    if (!spec.businessDate) return R.err('VALIDATION', 'cảnh báo cần businessDate');

    var def = TYPES[spec.type];
    var data = spec.data || {};
    for (var i = 0; i < def.required.length; i++) {
      if (data[def.required[i]] === undefined || data[def.required[i]] === null) {
        return R.err('VALIDATION',
          'cảnh báo ' + spec.type + ' thiếu trường chẩn đoán bắt buộc "' + def.required[i] + '"');
      }
    }

    return R.ok({
      /* Id xác định theo (type, subject): cùng một vấn đề không sinh 20 cảnh báo. */
      alertId: ids.deterministicId('alert', [spec.type, spec.storeId, spec.subjectKey || 'store']),
      type: spec.type,
      storeId: spec.storeId,
      severity: def.severity,
      audience: def.audience,
      resolution: def.resolution,
      status: STATUS.NEW,
      subjectKey: spec.subjectKey || null,
      data: data,
      businessDate: spec.businessDate,
      raisedAt: spec.at || null,
      raisedByOperationId: spec.operationId || null,
      seenAt: null, seenBy: null,
      resolvedAt: null, resolvedBy: null, resolvedReferenceId: null,
      autoClearedAt: null
    });
  }

  /**
   * Xếp hạng — đọc CẢ severity lẫn type.
   *
   * Đây là chỗ legacy sai: chỉ switch theo type nên alert `danger` không nằm
   * trong danh sách cứng bị nuốt vào bucket vàng chung.
   */
  function rank(alerts, spec) {
    spec = spec || {};
    var audience = spec.audience;
    return alerts
      .filter(function (a) {
        if (a.status === STATUS.RESOLVED || a.status === STATUS.AUTO_CLEARED) return false;
        if (!audience) return true;
        return a.audience === audience || a.audience === AUDIENCE.BOTH;
      })
      .slice()
      .sort(function (a, b) {
        var d = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (d !== 0) return d;
        /* Cùng mức thì cũ trước — việc tồn lâu không được lùi xuống cuối. */
        if (a.raisedAt !== b.raisedAt) return (a.raisedAt || 0) - (b.raisedAt || 0);
        return a.alertId < b.alertId ? -1 : 1;
      });
  }

  /** Không có loại nào rơi vào bucket "khác" — mọi loại đều có nhà. */
  function bucketize(alerts, spec) {
    var ranked = rank(alerts, spec);
    var out = { DANGER: [], WARNING: [], INFO: [] };
    ranked.forEach(function (a) { out[a.severity].push(a); });
    return out;
  }

  /**
   * "Đã xem" — KHÔNG tắt push.
   * Legacy để "Đã xem" tắt cảnh báo y hệt "Đã xử lý"; ở đây nó chỉ ghi nhận
   * người đã nhìn thấy, vấn đề gốc vẫn còn nên vẫn còn hiện.
   */
  function markSeen(alert, spec) {
    if (alert.status !== STATUS.NEW) return R.ok(alert);
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'markSeen cần actorId');
    return R.ok(Object.assign({}, alert, {
      status: STATUS.SEEN, seenAt: spec.at || null, seenBy: spec.actorId
    }));
  }

  /**
   * "Đã xử lý" — với loại không tự kiểm chứng được thì BẮT BUỘC link tới hành
   * động đã sửa (ReviseState / ReverseTransaction / approval...). Không có link
   * thì đó chỉ là bấm cho khuất mắt.
   */
  function resolve(alert, spec) {
    if (alert.status === STATUS.RESOLVED || alert.status === STATUS.AUTO_CLEARED) {
      return R.err('PRECONDITION', 'cảnh báo đã đóng');
    }
    if (!ids.isId(spec.actorId, 'actor')) return R.err('VALIDATION', 'resolve cần actorId');

    if (alert.resolution === RESOLUTION.AUTO_VERIFIABLE) {
      return R.err('PRECONDITION',
        'loại "' + alert.type + '" tự đóng khi điều kiện thật sự hết — không đóng tay được. ' +
        'Bấm tắt bằng tay là cách bỏ qua vấn đề gốc.');
    }
    if (!spec.referenceId) {
      return R.err('VALIDATION',
        'đóng cảnh báo "' + alert.type + '" phải kèm referenceId trỏ tới hành động đã sửa — ' +
        'không có tham chiếu thì không chứng minh được vấn đề đã được xử lý');
    }

    return R.ok(Object.assign({}, alert, {
      status: STATUS.RESOLVED,
      resolvedAt: spec.at || null,
      resolvedBy: spec.actorId,
      resolvedReferenceId: spec.referenceId
    }));
  }

  /**
   * Quét lại: loại AUTO_VERIFIABLE nào không còn điều kiện thì tự đóng.
   *
   * Đây là pattern của FIFO bell — cơ chế DUY NHẤT của legacy tự xoá đúng khi
   * điều kiện thật sự hết, thay vì chờ người bấm ẩn. Giờ là mặc định.
   *
   * @param spec.stillActiveKeys  danh sách subjectKey còn đang có vấn đề
   */
  function reconcile(alerts, spec) {
    var active = Object.create(null);
    (spec.stillActiveKeys || []).forEach(function (k) { active[k] = true; });

    var cleared = [];
    var next = alerts.map(function (a) {
      if (a.resolution !== RESOLUTION.AUTO_VERIFIABLE) return a;
      if (a.status === STATUS.RESOLVED || a.status === STATUS.AUTO_CLEARED) return a;
      if (active[a.subjectKey]) return a;
      var done = Object.assign({}, a, { status: STATUS.AUTO_CLEARED, autoClearedAt: spec.at || null });
      cleared.push(done);
      return done;
    });

    return R.ok({ alerts: next, cleared: cleared });
  }

  /**
   * Kênh ngoài app (push OS / SMS / Zalo) là CHỖ NỐI SẴN (§6 luồng chuẩn).
   * AlertEngine chỉ phát event; handler bên ngoài đăng ký sau, không phải sửa
   * lại engine.
   */
  function toEvents(alerts) {
    return alerts.map(function (a) {
      return {
        type: 'AlertRaised',
        alertId: a.alertId,
        alertType: a.type,
        severity: a.severity,
        audience: a.audience,
        storeId: a.storeId,
        businessDate: a.businessDate,
        data: a.data
      };
    });
  }

  return {
    SEVERITY: SEVERITY,
    AUDIENCE: AUDIENCE,
    RESOLUTION: RESOLUTION,
    STATUS: STATUS,
    TYPES: TYPES,
    isType: isType,
    raise: raise,
    rank: rank,
    bucketize: bucketize,
    markSeen: markSeen,
    resolve: resolve,
    reconcile: reconcile,
    toEvents: toEvents
  };
});
