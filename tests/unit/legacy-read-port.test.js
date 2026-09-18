/** Legacy Firebase read port: fallback live→archive và canonical mapping. */
var _lr = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    PORT: GIEO.require('legacy-firebase-adapter/read-port'),
    DS: GIEO.require('bootstrap/legacy-data-source'),
    FB: GIEO.require('bootstrap/firebase-read-client'),
    STORE: ids.deterministicId('store', ['main'])
  };
})();

function legacyClient(seed) {
  seed = seed || {};
  var calls = [];
  return {
    calls: calls,
    rtdbGet: function (path) {
      calls.push({ method: 'rtdbGet', path: path });
      return seed.rtdb && Object.prototype.hasOwnProperty.call(seed.rtdb, path) ? seed.rtdb[path] : null;
    },
    rtdbSubscribe: function (path, listener) {
      calls.push({ method: 'rtdbSubscribe', path: path });
      (seed.subscriptions && seed.subscriptions[path] || []).forEach(listener);
      return function () { calls.push({ method: 'unsubscribe', path: path }); };
    },
    firestoreGet: function (collection, id) {
      calls.push({ method: 'firestoreGet', collection: collection, id: id });
      return seed.docs && seed.docs[collection + '/' + id] || null;
    },
    firestoreQuery: function (collection, query) {
      calls.push({ method: 'firestoreQuery', collection: collection, query: query });
      return seed.queries && seed.queries[collection] || {};
    }
  };
}

describe('legacy read port — CHỈ ĐỌC', function () {
  test('không phơi API ghi', function () {
    var reader = _lr.PORT.createReader(legacyClient());
    ['set', 'update', 'remove', 'push', 'write'].forEach(function (name) {
      assert.strictEqual(reader[name], undefined);
    });
  });

  test('Unit merge Firestore container + RTDB active rồi map canonical', function () {
    var client = legacyClient({
      docs: {
        'stock_containers_gieogieo/C-1': {
          code: 'C-1', itemId: 'sua', status: 'open', baseQty: 1000, unitBase: 400,
          openedAt: 20, openedBy: 'actor_nv'
        }
      },
      rtdb: { 'active_units_gieogieo/sua/C-1': { unitBase: 350 } },
      queries: { stock_transactions_gieogieo: {} }
    });
    return _lr.PORT.createReader(client).loadUnitTrace({
      containerCode: 'C-1', itemId: 'sua', storeId: _lr.STORE
    }).then(function (out) {
      var trace = assertOk(out);
      assert.strictEqual(trace.unit.remainingQty, 350);
      assert.deepStrictEqual(trace.sourceDrift, { firestore: 400, rtdb: 350, difference: -50 });
    });
  });

  test('đọc employee cho PIN bằng port read-only và cấp id xác định', function () {
    var reader = _lr.PORT.createReader(legacyClient({
      queries: { employees_gieogieo: {
        nv1: { fullName: 'Linh', pin: '1234', active: true },
        ql1: { fullName: 'Chủ quán', pin: '9876', active: true, role: 'QUANLY_ADMIN' }
      } }
    }));
    return reader.loadEmployees({ storeId: _lr.STORE }).then(function (out) {
      var rows = assertOk(out);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].role, 'POS_OPERATOR');
      assert.strictEqual(rows[1].role, 'QUANLY_ADMIN');
      assert.ok(_lr.ids.isId(rows[0].employeeId, 'employee'));
      assert.ok(_lr.ids.isId(rows[0].actorId, 'actor'));
      assert.strictEqual(reader.update, undefined, 'read port không được mọc API ghi');
    });
  });

  test('đơn live rỗng thì fallback archive đúng key month_day_year', function () {
    var client = legacyClient({
      rtdb: { 'orders_gieogieo/3/10': null },
      docs: {
        'orders_gieogieo_archive/03_10_2026': {
          orders: { b1: { total: 100000, appFeePct: 20, isAppSale: true, itemsArray: [] } }
        }
      }
    });
    return _lr.PORT.createReader(client).loadBills({
      businessDate: '2026-03-10', storeId: _lr.STORE
    }).then(function (out) {
      var value = assertOk(out);
      assert.strictEqual(value.source, 'LEGACY_ARCHIVE');
      assert.strictEqual(value.bills[0].channelFee, 20000);
      assert.strictEqual(value.bills[0].netRevenue, 80000);
    });
  });

  test('loadBillsForRange đọc nhiều ngày song song, sắp mới nhất trước', function () {
    var client = legacyClient({
      rtdb: {
        'orders_gieogieo/3/10': { b1: { total: 10000, createdAt: 1, itemsArray: [] } },
        'orders_gieogieo/3/11': { b2: { total: 20000, createdAt: 2, itemsArray: [] } }
      }
    });
    return _lr.PORT.createReader(client).loadBillsForRange({
      from: '2026-03-10', to: '2026-03-11', storeId: _lr.STORE
    }).then(function (out) {
      var value = assertOk(out);
      assert.strictEqual(value.days, 2);
      assert.strictEqual(value.bills.length, 2);
      assert.strictEqual(value.bills[0].total, 20000, 'createdAt mới hơn phải đứng trước');
      assert.strictEqual(value.bills[1].total, 10000);
    });
  });

  test('loadBillsForRange: ngày kết thúc trước ngày bắt đầu → VALIDATION, không âm thầm trả rỗng', function () {
    return _lr.PORT.createReader(legacyClient({})).loadBillsForRange({
      from: '2026-03-11', to: '2026-03-10', storeId: _lr.STORE
    }).then(function (out) { assertErr(out, 'VALIDATION'); });
  });

  test('loadBillsForRange: kỳ quá 62 ngày → VALIDATION (giữ trần như legacy QL_BILL_MAX_DAYS)', function () {
    return _lr.PORT.createReader(legacyClient({})).loadBillsForRange({
      from: '2026-01-01', to: '2026-12-31', storeId: _lr.STORE
    }).then(function (out) { assertErr(out, 'VALIDATION'); });
  });

  test('loadBillsForRange: một ngày đọc lỗi không làm hỏng cả khoảng, nổi lên thành ambiguous (invariant #11)', function () {
    var client = legacyClient({
      rtdb: { 'orders_gieogieo/3/10': { b1: { total: 10000, createdAt: 1, itemsArray: [] } } }
    });
    var realRtdbGet = client.rtdbGet;
    var realFirestoreGet = client.firestoreGet;
    /* Ngày 11 hỏng CẢ HAI nguồn (RTDB lẫn Firestore archive) — mô phỏng lỗi hạ
       tầng thật, khác với "không seed gì" (vốn hợp lệ trả mảng rỗng). */
    client.rtdbGet = function (path) {
      if (path === 'orders_gieogieo/3/11') throw new Error('RTDB sập');
      return realRtdbGet(path);
    };
    client.firestoreGet = function (collection, id) {
      if (collection === 'orders_gieogieo_archive' && id === '03_11_2026') throw new Error('Firestore sập');
      return realFirestoreGet(collection, id);
    };
    return _lr.PORT.createReader(client).loadBillsForRange({
      from: '2026-03-10', to: '2026-03-11', storeId: _lr.STORE
    }).then(function (out) {
      var value = assertOk(out);
      assert.strictEqual(value.bills.length, 1, 'ngày 10 vẫn đọc được bình thường');
      assert.strictEqual(value.bills[0].total, 10000);
      assert.ok(value.ambiguous.some(function (a) { return a.code === 'RANGE_DAY_READ_FAILED'; }),
        'ngày 11 lỗi phải nổi lên thành ambiguous, không bị nuốt câm lặng');
    });
  });

  test('data source hydrate GetBillsForRange theo khoảng ngày', function () {
    var client = legacyClient({
      rtdb: { 'orders_gieogieo/3/10': { b1: { total: 10000, createdAt: 1, itemsArray: [] } } }
    });
    var ds = _lr.DS.create(_lr.PORT.createReader(client), { storeId: _lr.STORE });
    return ds.forQuery('GetBillsForRange', { from: '2026-03-10', to: '2026-03-10' }).then(function (out) {
      var value = assertOk(out);
      assert.strictEqual(value.bills.length, 1);
      assert.strictEqual(value.from, '2026-03-10');
    });
  });

  test('data source hydrate GetRevenue; command canonical đi thẳng không chạm legacy', function () {
    var client = legacyClient({ rtdb: { 'orders_gieogieo/3/10': {} }, docs: {
      'orders_gieogieo_archive/03_10_2026': { orders: {} }
    } });
    var ds = _lr.DS.create(_lr.PORT.createReader(client), { storeId: _lr.STORE });
    return Promise.all([
      ds.forQuery('GetRevenue', { businessDate: '2026-03-10' }),
      ds.forCommand('RecordSale', { checkoutId: 'c1' })
    ]).then(function (out) {
      assert.strictEqual(assertOk(out[0]).bills.length, 0);
      assert.deepStrictEqual(assertOk(out[1]), { storeId: _lr.STORE, checkoutId: 'c1' });
    });
  });

  test('menu legacy map thành Category/MenuItem canonical, giữ giá theo size', function () {
    var client = legacyClient({ rtdb: {
      menu_togo_gieogieo: {
        sua_gao: { name: 'Sữa Gạo', type: 'Sữa gạo', priceM: 25000, priceL: 30000, color: '#fff' }
      }
    } });
    return _lr.PORT.createReader(client).loadMenu({ storeId: _lr.STORE }).then(function (out) {
      var menu = assertOk(out);
      assert.strictEqual(menu.categories[0].name, 'Sữa gạo');
      assert.deepStrictEqual(menu.menuItems[0].prices, { M: 25000, L: 30000 });
      assert.ok(menu.menuItems[0].recipeId);
    });
  });

  test('menu realtime được map lại ở mỗi Firebase event và có unsubscribe', function () {
    var client = legacyClient({ subscriptions: { menu_togo_gieogieo: [
      { a: { name: 'A', type: 'Nhóm', priceM: 10000 } },
      { a: { name: 'A mới', type: 'Nhóm', priceM: 12000 } }
    ] } });
    var seen = [];
    var unsubscribe = _lr.PORT.createReader(client).watchMenu({ storeId: _lr.STORE }, function (out) {
      seen.push(assertOk(out).menuItems[0].name);
    });
    assert.deepStrictEqual(seen, ['A', 'A mới']);
    unsubscribe();
    assert.strictEqual(client.calls[client.calls.length - 1].method, 'unsubscribe');
  });
});

describe('Firebase SDK read client — không có API ghi', function () {
  test('đọc RTDB và Firestore compat handle được inject', function () {
    var rtdb = {
      ref: function (path) {
        return { once: function () { return Promise.resolve({ val: function () { return { path: path }; } }); } };
      }
    };
    var firestore = {
      collection: function (name) {
        return {
          doc: function (id) {
            return { get: function () { return Promise.resolve({ exists: true, data: function () { return { name: name, id: id }; } }); } };
          }
        };
      }
    };
    var client = _lr.FB.create({ rtdb: rtdb, firestore: firestore });
    assert.strictEqual(client.set, undefined);
    assert.strictEqual(client.remove, undefined);
    return Promise.all([
      client.rtdbGet('menu_gieogieo'),
      client.firestoreGet('stock_containers_gieogieo', 'C-1')
    ]).then(function (rows) {
      assert.deepStrictEqual(rows[0], { path: 'menu_gieogieo' });
      assert.deepStrictEqual(rows[1], { name: 'stock_containers_gieogieo', id: 'C-1' });
    });
  });

  test('subscription RTDB trả hàm off đúng listener', function () {
    var registered, removed;
    var ref = {
      on: function (event, listener) {
        registered = { event: event, listener: listener };
        listener({ val: function () { return { version: 2 }; } });
      },
      off: function (event, listener) { removed = { event: event, listener: listener }; }
    };
    var client = _lr.FB.create({ rtdb: { ref: function () { return ref; } } });
    var value;
    var unsubscribe = client.rtdbSubscribe('menu_togo_gieogieo', function (next) { value = next; });
    assert.deepStrictEqual(value, { version: 2 });
    unsubscribe();
    assert.strictEqual(removed.event, 'value');
    assert.strictEqual(removed.listener, registered.listener);
  });
});

describe('query chưa nối nguồn legacy phải BÁO LỖI, không trả rỗng', function () {
  function ds() { return _lr.DS.create({ loadUnitTrace: function () {}, loadMenu: function () {}, loadBills: function () {} }); }

  ['GetAlerts', 'GetShiftStatus', 'GetPendingApprovals', 'GetInventoryLevel'].forEach(function (name) {
    test(name + ' không có nguồn cũ → NOT_FOUND kèm lý do', function () {
      return ds().forQuery(name, {}).then(function (out) {
        assertErr(out, 'NOT_FOUND');
        assert.ok(/chưa nối nguồn/.test(out.error.message), out.error.message);
      });
    });
  });

  test('caller tự mang dữ liệu canonical thì đi thẳng, không bị chặn', function () {
    return ds().forQuery('GetAlerts', { alerts: [] }).then(function (out) {
      assertOk(out);
      assert.deepStrictEqual(out.value.alerts, []);
    });
  });

  test('command canonical pass-through nhưng read port vẫn không có API ghi', function () {
    var source = ds();
    return source.forCommand('RecordSale', { checkoutId: 'c1' }).then(function (out) {
      assert.strictEqual(assertOk(out).checkoutId, 'c1');
      assert.strictEqual(source.write, undefined);
    });
  });
});

describe('bootstrap/firebase-app — composition root không giữ bí mật nào', function () {
  var FB = GIEO.require('bootstrap/firebase-app');
  var CFG = { apiKey: 'k', authDomain: 'a', databaseURL: 'd', projectId: 'the-cafe-33' };
  var ACC = { email: 'x@y.z', password: 'p' };

  function fakeSdk(over) {
    return Object.assign({
      apps: [],
      initializeApp: function () { this.apps = [{}]; },
      database: function () { return { ref: function () {} }; },
      firestore: function () { return { collection: function () {} }; },
      auth: function () {
        return { signInWithEmailAndPassword: function () { return Promise.resolve({ user: {} }); } };
      }
    }, over || {});
  }

  test('không có config thì từ chối — không có giá trị mặc định nào trong src/', function () {
    return FB.init({ account: ACC, sdk: fakeSdk() }).then(function (out) {
      assertErr(out, 'VALIDATION');
      assert.ok(/không có giá trị mặc định/.test(out.error.message));
    });
  });

  test('không có tài khoản thì từ chối', function () {
    return FB.init({ config: CFG, sdk: fakeSdk() }).then(function (out) {
      assertErr(out, 'VALIDATION');
    });
  });

  test('SDK chưa nạp thì nói rõ, không ném lỗi trần', function () {
    return FB.init({ config: CFG, account: ACC, sdk: null }).then(function (out) {
      assertErr(out, 'NOT_FOUND');
    });
  });

  test('đăng nhập xong mới trao handle', function () {
    return FB.init({ config: CFG, account: ACC, sdk: fakeSdk() }).then(function (out) {
      assertOk(out);
      assert.ok(out.value.rtdb && out.value.firestore);
      assert.strictEqual(out.value.projectId, 'the-cafe-33');
    });
  });

  test('đăng nhập HỎNG thì KHÔNG trao handle quyền rỗng', function () {
    var sdk = fakeSdk({
      auth: function () {
        return {
          signInWithEmailAndPassword: function () {
            return Promise.reject(new Error('sai mật khẩu'));
          }
        };
      }
    });
    return FB.init({ config: CFG, account: ACC, sdk: sdk }).then(function (out) {
      assertErr(out, 'RETRYABLE');
      /* Quyền rỗng làm mọi truy vấn trả rỗng, và rỗng trông y hệt "không có
         dữ liệu" — đúng kiểu hỏng im lặng cả hệ này dựng ra để chặn. */
      assert.ok(/KHÔNG chạy với quyền rỗng/.test(out.error.message));
    });
  });
});
