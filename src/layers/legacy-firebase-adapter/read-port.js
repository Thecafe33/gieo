/** Read port schema cũ. Firebase client được inject; module không có bất kỳ API ghi nào. */
GIEO.define('legacy-firebase-adapter/read-port', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'legacy-firebase-adapter/legacy-paths',
  'legacy-firebase-adapter/mappers'
], function (ids, R, paths, mappers) {
  'use strict';

  function createReader(client) {
    client = client || {};

    function call(name, args) {
      if (typeof client[name] !== 'function') {
        return Promise.resolve(R.err('NOT_FOUND', 'legacy read client thiếu ' + name));
      }
      return Promise.resolve().then(function () { return client[name].apply(null, args); })
        .then(function (value) { return value && typeof value.ok === 'boolean' ? value : R.ok(value); })
        .catch(function (e) {
          return R.err('RETRYABLE', 'đọc legacy thất bại: ' + (e && e.message ? e.message : e));
        });
    }
    function join(base, suffix) { return suffix ? base + '/' + String(suffix).replace(/^\/+/, '') : base; }
    function rtdb(name, suffix) {
      var p = paths.get(name);
      if (p.kind !== paths.RTDB) return Promise.resolve(R.err('VALIDATION', name + ' không phải RTDB'));
      return call('rtdbGet', [join(p.path, suffix)]);
    }
    function firestoreDoc(name, docId) {
      var p = paths.get(name);
      if (p.kind !== paths.FIRESTORE) return Promise.resolve(R.err('VALIDATION', name + ' không phải Firestore'));
      return call('firestoreGet', [p.path, docId]);
    }
    function firestoreQuery(name, query) {
      var p = paths.get(name);
      if (p.kind !== paths.FIRESTORE) return Promise.resolve(R.err('VALIDATION', name + ' không phải Firestore'));
      return call('firestoreQuery', [p.path, query || {}]);
    }

    /**
     * Đọc TRỌN một collection/nhánh legacy. Dùng cho lần TIẾP NHẬN duy nhất lúc
     * cutover — hệ mới tự đọc hệ cũ, không cần ai export tay.
     *
     * Vẫn chỉ đọc: `firestoreQuery`/`rtdbGet` là hai hàm duy nhất đi ra ngoài,
     * và client được inject không phơi bất kỳ API ghi nào.
     */
    function loadAll(name) {
      var p = paths.get(name);
      return (p.kind === paths.RTDB ? rtdb(name) : firestoreQuery(name, {}))
        .then(function (out) {
          if (R.isErr(out)) return out;
          return R.ok(out.value || {});
        });
    }

    function loadUnit(spec) {
      spec = spec || {};
      if (!spec.containerCode) {
        return Promise.resolve(R.err('VALIDATION', 'loadUnit cần containerCode legacy'));
      }
      return firestoreDoc('stockContainers', spec.containerCode).then(function (container) {
        if (R.isErr(container)) return container;
        if (!container.value) return R.err('NOT_FOUND', 'không tìm thấy container ' + spec.containerCode);
        var raw = Object.assign({ code: spec.containerCode }, container.value);
        var itemId = spec.itemId || raw.itemId;
        if (!itemId) return R.err('AMBIGUOUS_LEGACY', 'container không có itemId để tìm active unit');
        return rtdb('activeUnits', itemId + '/' + (spec.activeUnitId || spec.containerCode)).then(function (active) {
          var rt = R.isOk(active) ? active.value : null;
          return mappers.mapUnit({
            container: raw, rtUnit: rt, storeId: spec.storeId, itemKind: spec.itemKind || 'raw'
          });
        });
      });
    }

    function loadLedger(spec) {
      spec = spec || {};
      return firestoreQuery(spec.domain === 'prep' ? 'prepTransactions' : 'stockTransactions', {
        where: [{ field: 'containerCode', op: '==', value: spec.containerCode }]
      }).then(function (rows) {
        if (R.isErr(rows)) return rows;
        var mapped = [];
        var ambiguous = [];
        Object.keys(rows.value || {}).forEach(function (id) {
          var out = mappers.mapLedgerEntry({
            tx: Object.assign({ id: id }, rows.value[id]), storeId: spec.storeId,
            domain: spec.domain || 'raw'
          });
          if (R.isOk(out)) {
            mapped.push(out.value.entry);
            ambiguous = ambiguous.concat(out.value.ambiguous || []);
          }
        });
        return R.ok({ entries: mapped, ambiguous: ambiguous });
      });
    }

    function loadUnitTrace(spec) {
      return Promise.all([loadUnit(spec), loadLedger(spec)]).then(function (rows) {
        if (R.isErr(rows[0])) return rows[0];
        if (R.isErr(rows[1])) return rows[1];
        return R.ok({
          unit: rows[0].value.unit,
          ledgerEntries: rows[1].value.entries,
          allocations: [],
          ambiguous: (rows[0].value.ambiguous || []).concat(rows[1].value.ambiguous || []),
          sourceDrift: rows[0].value.sourceDrift
        });
      });
    }

    /* [FIX] Key tháng trên RTDB/Firestore archive KHÔNG phải số — legacy dùng
       tên viết tắt tiếng Anh (quanlygieo.html: const MONTH_KEYS = ['jan',...,
       'dec']; qlLoadBillsOfDate: `orders_gieogieo/${MONTH_KEYS[d.getMonth()]}/
       ${pad(d.getDate())}`, archive doc id `${month}_${day}_${year}` cùng key
       đó). Trước bản sửa này loadBills() dùng số tháng/ngày thuần (`9/18`) nên
       luôn trúng node rỗng — không đọc được bill thật nào, không liên quan gì
       tới FIFO/giá vốn, chỉ là sai định dạng path khi đọc ngược schema cũ. */
    var MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    function loadBills(spec) {
      spec = spec || {};
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spec.businessDate || '');
      if (!m) return Promise.resolve(R.err('VALIDATION', 'loadBills cần businessDate YYYY-MM-DD'));
      var monthKey = MONTH_KEYS[Number(m[2]) - 1];
      var dayKey = m[3];
      var archiveKey = monthKey + '_' + dayKey + '_' + m[1];
      return rtdb('orders', monthKey + '/' + dayKey).then(function (live) {
        if (R.isOk(live) && live.value && Object.keys(live.value).length) {
          return R.ok({ source: 'LEGACY_LIVE', orders: live.value });
        }
        return firestoreDoc('ordersArchive', archiveKey).then(function (archived) {
          if (R.isErr(archived)) return archived;
          return R.ok({ source: 'LEGACY_ARCHIVE', orders: (archived.value && archived.value.orders) || {} });
        });
      }).then(function (rows) {
        if (R.isErr(rows)) return rows;
        var bills = [], ambiguous = [];
        Object.keys(rows.value.orders).forEach(function (id) {
          var mapped = mappers.mapBill({
            order: rows.value.orders[id], billId: id,
            storeId: spec.storeId, businessDate: spec.businessDate
          });
          if (R.isOk(mapped)) {
            bills.push(mapped.value.bill);
            ambiguous = ambiguous.concat(mapped.value.ambiguous || []);
          }
        });
        return R.ok({ bills: bills, ambiguous: ambiguous, source: rows.value.source });
      });
    }

    /* Trần độ dài kỳ — giữ đúng mức legacy (quanlygieo.html#QL_BILL_MAX_DAYS) để
       không đổi hành vi người dùng đã quen: một khoảng quá dài đọc N ngày song
       song, tốn quota, không phải giới hạn kỹ thuật cứng. */
    var BILLS_RANGE_MAX_DAYS = 62;

    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    function billsRangeDays(fromKey, toKey) {
      var from = new Date(String(fromKey || '') + 'T00:00:00');
      var to = new Date(String(toKey || '') + 'T00:00:00');
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return R.err('VALIDATION', 'loadBillsForRange: khoảng ngày không hợp lệ');
      }
      var soNgay = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
      if (soNgay < 1) return R.err('VALIDATION', 'loadBillsForRange: ngày kết thúc phải sau ngày bắt đầu');
      if (soNgay > BILLS_RANGE_MAX_DAYS) {
        return R.err('VALIDATION',
          'loadBillsForRange: kỳ dài ' + soNgay + ' ngày — vượt mức ' + BILLS_RANGE_MAX_DAYS + ' ngày');
      }
      var days = [];
      for (var i = 0; i < soNgay; i++) {
        var d = new Date(from.getTime());
        d.setDate(d.getDate() + i);
        days.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()));
      }
      return R.ok(days);
    }

    /**
     * Bill trên KHOẢNG ngày — dùng cho LỊCH SỬ BILL (clone qlLoadBills). Đọc song
     * song từng ngày qua loadBills() ở trên; một ngày lỗi (RETRYABLE) KHÔNG được
     * làm hỏng cả khoảng — legacy (qlLoadBillsOfDate) cũng chỉ console.warn rồi bỏ
     * qua ngày đó. Khác legacy ở chỗ: lỗi ở đây không bị nuốt câm lặng (invariant #11)
     * mà nổi lên thành một mục `ambiguous` NGÀY nào đọc hỏng, để tầng trên tự quyết
     * định có cảnh báo người dùng hay không (§2.3a — không chặn, nhưng không giấu).
     */
    function loadBillsForRange(spec) {
      spec = spec || {};
      var days = billsRangeDays(spec.from, spec.to);
      if (R.isErr(days)) return Promise.resolve(days);
      return Promise.all(days.value.map(function (businessDate) {
        return loadBills({ storeId: spec.storeId, businessDate: businessDate }).then(function (out) {
          if (R.isOk(out)) return out.value;
          return {
            bills: [], source: 'READ_FAILED',
            ambiguous: [{
              code: 'RANGE_DAY_READ_FAILED',
              detail: businessDate + ': ' + out.error.kind + ' — ' + out.error.message
            }]
          };
        });
      })).then(function (rows) {
        var bills = [], ambiguous = [];
        rows.forEach(function (row) {
          bills = bills.concat(row.bills);
          ambiguous = ambiguous.concat(row.ambiguous || []);
        });
        /* Mới nhất trước — cùng thứ tự hiển thị legacy (qlLoadBills: sort theo
           createdAt desc). occurredAt = o.createdAt, giữ nguyên kiểu dữ liệu gốc. */
        bills.sort(function (a, b) {
          var at = String(a.occurredAt || ''), bt = String(b.occurredAt || '');
          if (at !== bt) return at < bt ? 1 : -1;
          return String(b.billId).localeCompare(String(a.billId));
        });
        return R.ok({ bills: bills, ambiguous: ambiguous, days: days.value.length });
      });
    }

    function loadMenu(spec) {
      spec = spec || {};
      var source = spec.legacyMenuSource === 'menu' ? 'menu' : 'menuTogo';
      return rtdb(source, null).then(function (rows) {
        if (R.isErr(rows)) return rows;
        return mappers.mapMenu({
          items: rows.value || {}, storeId: spec.storeId,
          channel: source === 'menuTogo' ? 'TO_GO' : 'DINE_IN',
          recipePrefix: source === 'menuTogo' ? 'togo:' : 'dinein:'
        });
      });
    }

    /** Danh sách tối thiểu cho pre-auth PIN; tuyệt đối không ghi ngược legacy. */
    function loadEmployees(spec) {
      spec = spec || {};
      if (!ids.isId(spec.storeId, 'store')) {
        return Promise.resolve(R.err('VALIDATION', 'loadEmployees cần storeId hợp lệ'));
      }
      return firestoreQuery('employees', {}).then(function (rows) {
        if (R.isErr(rows)) return rows;
        var employees = Object.keys(rows.value || {}).map(function (legacyId) {
          var raw = rows.value[legacyId] || {};
          return {
            employeeId: ids.deterministicId('employee', ['legacy', legacyId]),
            actorId: ids.deterministicId('actor', ['legacy', legacyId]),
            storeId: spec.storeId,
            fullName: raw.fullName || raw.name || legacyId,
            pin: raw.pin || null,
            active: raw.active !== false,
            role: raw.role || 'POS_OPERATOR',
            allStoresRead: !!raw.allStoresRead,
            legacyRef: legacyId
          };
        });
        return R.ok(employees);
      });
    }

    function watchMenu(spec, listener) {
      spec = spec || {};
      if (typeof listener !== 'function') throw new Error('watchMenu cần listener');
      if (typeof client.rtdbSubscribe !== 'function') {
        listener(R.err('NOT_FOUND', 'legacy read client thiếu rtdbSubscribe'));
        return function () {};
      }
      var source = spec.legacyMenuSource === 'menu' ? 'menu' : 'menuTogo';
      var path = paths.get(source).path;
      try {
        return client.rtdbSubscribe(path, function (items) {
          listener(mappers.mapMenu({
            items: items || {}, storeId: spec.storeId,
            channel: source === 'menuTogo' ? 'TO_GO' : 'DINE_IN',
            recipePrefix: source === 'menuTogo' ? 'togo:' : 'dinein:'
          }));
        }, function (error) {
          listener(R.err('RETRYABLE', 'theo dõi menu legacy thất bại: ' +
            (error && error.message ? error.message : error)));
        });
      } catch (error) {
        listener(R.err('RETRYABLE', 'khởi tạo theo dõi menu thất bại: ' + error.message));
        return function () {};
      }
    }

    return {
      loadAll: loadAll,
      loadUnit: loadUnit,
      loadLedger: loadLedger,
      loadUnitTrace: loadUnitTrace,
      loadBills: loadBills,
      loadBillsForRange: loadBillsForRange,
      loadMenu: loadMenu,
      loadEmployees: loadEmployees,
      watchMenu: watchMenu
    };
  }

  return { createReader: createReader };
});
