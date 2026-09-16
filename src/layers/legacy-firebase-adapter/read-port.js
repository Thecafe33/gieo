/** Read port schema cũ. Firebase client được inject; module không có bất kỳ API ghi nào. */
GIEO.define('legacy-firebase-adapter/read-port', [
  'shared-kernel/result',
  'legacy-firebase-adapter/legacy-paths',
  'legacy-firebase-adapter/mappers'
], function (R, paths, mappers) {
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

    function loadBills(spec) {
      spec = spec || {};
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spec.businessDate || '');
      if (!m) return Promise.resolve(R.err('VALIDATION', 'loadBills cần businessDate YYYY-MM-DD'));
      var archiveKey = m[2] + '_' + m[3] + '_' + m[1];
      return rtdb('orders', Number(m[2]) + '/' + Number(m[3])).then(function (live) {
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
      loadUnit: loadUnit,
      loadLedger: loadLedger,
      loadUnitTrace: loadUnitTrace,
      loadBills: loadBills,
      loadMenu: loadMenu,
      watchMenu: watchMenu
    };
  }

  return { createReader: createReader };
});
