/**
 * Khởi động: Firebase -> runtime (quyền ghi do cutover quyết) -> tiếp nhận 1 lần.
 * Contract: SEED-CONTRACT-V1.md + GIEO-SYSTEM-REBUILD-PLAN.md §17.
 */
var _su = (function () {
  var ids = GIEO.require('shared-kernel/ids');
  return {
    ids: ids,
    R: GIEO.require('shared-kernel/result'),
    S: GIEO.require('bootstrap/startup'),
    PIN: GIEO.require('bootstrap/pin-auth'),
    RUNNER: GIEO.require('persistence-firebase/firestore-runner'),
    CUT: GIEO.require('bootstrap/cutover'),
    CDS: GIEO.require('bootstrap/canonical-data-source'),
    CRP: GIEO.require('persistence-firebase/canonical-read-port'),
    RT: GIEO.require('bootstrap/runtime'),
    ACCESS: GIEO.require('store-context/access'),
    CTXL: GIEO.require('store-context/context'),
    BD: GIEO.require('store-context/business-day'),
    CLK: GIEO.require('shared-kernel/clock'),
    STORE: ids.deterministicId('store', ['main']),
    ORG: ids.deterministicId('org', ['gieo']),
    BOSS: ids.deterministicId('actor', ['boss'])
  };
})();

describe('PIN pre-auth', function () {
  function employee(role, pin) {
    return {
      employeeId: _su.ids.deterministicId('employee', [role, pin]),
      actorId: _su.ids.deterministicId('actor', [role, pin]),
      storeId: _su.STORE,
      role: role,
      pin: pin,
      active: true
    };
  }

  test('PIN POS dựng actor/context nhưng chưa bịa business day', function () {
    var out = assertOk(_su.PIN.authenticate({
      pin: '1234', employees: [employee('POS_OPERATOR', '1234')],
      organizationId: _su.ORG, storeId: _su.STORE, source: 'POS'
    }));
    assert.strictEqual(out.actor.role, 'POS_OPERATOR');
    assert.strictEqual(out.context.businessDate, null);
    assertErr(out.context.assertOperable('RecordSale'), 'PRECONDITION');
  });

  test('PIN nhân viên thường không mở được QUANLY', function () {
    assertErr(_su.PIN.authenticate({
      pin: '1234', employees: [employee('POS_OPERATOR', '1234')],
      organizationId: _su.ORG, storeId: _su.STORE, source: 'QUANLY'
    }), 'FORBIDDEN');
  });

  test('PIN trùng fail-closed thay vì chọn đại một người', function () {
    assertErr(_su.PIN.authenticate({
      pin: '1234', employees: [employee('STORE_MANAGER', '1234'), employee('QUANLY_ADMIN', '1234')],
      organizationId: _su.ORG, storeId: _su.STORE, source: 'QUANLY'
    }), 'CONFLICT');
  });
});

/* Firestore/RTDB giả — đủ để chạy batch và ref, không cần mạng. */
function fakeFirebase(seedDocs) {
  var docs = Object.assign(Object.create(null), seedDocs || {});
  var rtdbStore = Object.create(null);
  var batches = 0;
  var rtdbFailPaths = {};

  function pathOf(parts) { return parts.join('/'); }
  function makeDoc(parts) {
    return {
      get: function () {
        var p = pathOf(parts);
        return Promise.resolve(docs[p] === undefined
          ? { exists: false }
          : { exists: true, data: function () { return docs[p]; } });
      },
      collection: function (c) { return makeCol(parts.concat([c])); },
      __path: pathOf(parts)
    };
  }
  /* wheres tích luỹ qua các lần .where() chained — CHỈ hỗ trợ '==' (đủ cho mọi
     nơi gọi thật hiện tại, xem canonical-read-port.js#getAll). Trước bản này
     where() là no-op passthrough (không filter gì) — không test nào ở file
     này từng dựa vào việc đó, nên nâng lên filter thật không đổi hành vi cũ. */
  function makeCol(parts, wheres) {
    wheres = wheres || [];
    return {
      doc: function (d) { return makeDoc(parts.concat([d])); },
      where: function (field, op, value) {
        return makeCol(parts, wheres.concat([{ field: field, op: op, value: value }]));
      },
      orderBy: function () { return this; },
      limit: function () { return this; },
      /* Trả về đúng các document nằm trực tiếp dưới collection này (đã lọc theo
         wheres), để read port thật chạy được mà không cần mạng. */
      get: function () {
        var prefix = pathOf(parts) + '/';
        var rows = Object.keys(docs)
          .filter(function (k) { return k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') === -1; })
          .map(function (k) {
            return { id: k.slice(prefix.length), data: function () { return docs[k]; } };
          })
          .filter(function (row) {
            var d = row.data();
            return wheres.every(function (w) { return d[w.field] === w.value; });
          });
        return Promise.resolve({ forEach: function (fn) { rows.forEach(fn); } });
      }
    };
  }

  var firestore = {
    collection: function (c) { return makeCol([c]); },
    batch: function () {
      var ops = [];
      return {
        set: function (ref, data) { ops.push({ op: 'set', path: ref.__path, data: data }); },
        delete: function (ref) { ops.push({ op: 'remove', path: ref.__path }); },
        commit: function () {
          batches += 1;
          ops.forEach(function (o) {
            if (o.op === 'remove') delete docs[o.path]; else docs[o.path] = o.data;
          });
          return Promise.resolve();
        }
      };
    }
  };
  var rtdb = {
    ref: function (p) {
      return {
        once: function () {
          return Promise.resolve({ val: function () { return rtdbStore[p] === undefined ? null : rtdbStore[p]; } });
        },
        set: function (v) {
          if (rtdbFailPaths[p]) return Promise.reject(new Error('rtdb hỏng'));
          rtdbStore[p] = v; return Promise.resolve();
        },
        remove: function () {
          if (rtdbFailPaths[p]) return Promise.reject(new Error('rtdb hỏng'));
          delete rtdbStore[p]; return Promise.resolve();
        }
      };
    }
  };

  return {
    sdk: {
      apps: [],
      initializeApp: function () { this.apps = [{}]; },
      database: function () { return rtdb; },
      firestore: function () { return firestore; },
      auth: function () {
        return { signInWithEmailAndPassword: function () { return Promise.resolve({}); } };
      }
    },
    docs: docs,
    rtdbStore: rtdbStore,
    batchCount: function () { return batches; },
    putRtdb: function (p, v) { rtdbStore[p] = v; },
    failRtdb: function (p) { rtdbFailPaths[p] = true; }
  };
}

function ctx() {
  var day = assertOk(_su.BD.openDay({
    storeId: _su.STORE, dateKey: '2026-09-20', actorId: _su.BOSS,
    at: new Date(2026, 8, 20, 7).getTime(), clock: _su.CLK.createClock()
  }));
  var actor = assertOk(_su.ACCESS.createActor({
    actorId: _su.BOSS, role: 'SYSTEM_ADMIN', source: 'QUANLY', stores: [_su.STORE]
  }));
  return assertOk(_su.CTXL.createContext({
    organizationId: _su.ORG, storeId: _su.STORE, actor: actor, source: 'QUANLY', businessDay: day
  }));
}

var FB_CFG = {
  config: { apiKey: 'k', authDomain: 'a', databaseURL: 'd', projectId: 'the-cafe-33' },
  account: { email: 'x@y.z', password: 'p' }
};

/* Dữ liệu hệ cũ đặt đúng path legacy, để read port THẬT đọc được. */
function withLegacyData() {
  var docs = {};
  docs['inventory_items_gieogieo/item_a'] = { name: 'Đường cát trắng', unit: 'g', costPerUnit: 90 };
  docs['stock_containers_gieogieo/OPEN01'] =
    { itemId: 'item_a', status: 'open', baseQty: 380, unitBase: 140, openedAt: 900 };
  docs['stock_containers_gieogieo/SEALED01'] =
    { itemId: 'item_a', status: 'sealed', baseQty: 500, unitBase: 500 };
  docs['recipes_gieogieo/r1'] = { sizes: { M: { qty: 1 } } };
  docs['employees_gieogieo/e1'] = { fullName: 'Nguyễn Hữu Nhân', hourlyRate: 20000, pin: '3326' };
  docs['book_closings_gieogieo/2026-08'] = { doanhThu: 4918000, giaVon: 1473930 };
  var fb = fakeFirebase(docs);
  fb.putRtdb('active_units_gieogieo', { item_a: { c1: { code: 'OPEN01', unitBase: 125.5, openedAt: 900 } } });
  return fb;
}

describe('firestore-runner — ranh giới nguyên tử thật', function () {
  test('Firestore đi trong MỘT batch, RTDB chiếu lại sau', function () {
    var fb = fakeFirebase();
    var run = _su.RUNNER.create({ firestore: fb.sdk.firestore(), rtdb: fb.sdk.database() });
    return run.runner([
      { kind: 'FIRESTORE', op: 'set', path: 'orgs/o/stores/s/units/u1', data: { a: 1 } },
      { kind: 'RTDB', op: 'set', path: 'orgs/o/stores/s/units/live/i/u1', data: { b: 2 } }
    ]).then(function (out) {
      assert.strictEqual(fb.batchCount(), 1);
      assert.deepStrictEqual(fb.docs['orgs/o/stores/s/units/u1'], { a: 1 });
      assert.deepStrictEqual(fb.rtdbStore['orgs/o/stores/s/units/live/i/u1'], { b: 2 });
      assert.deepStrictEqual(out.projectionFailures, []);
    });
  });

  test('RTDB hỏng KHÔNG làm hỏng canonical, nhưng cũng KHÔNG bị nuốt', function () {
    var fb = fakeFirebase();
    fb.failRtdb('orgs/o/stores/s/units/live/i/u1');
    var run = _su.RUNNER.create({ firestore: fb.sdk.firestore(), rtdb: fb.sdk.database() });
    return run.runner([
      { kind: 'FIRESTORE', op: 'set', path: 'orgs/o/stores/s/units/u1', data: { a: 1 } },
      { kind: 'RTDB', op: 'set', path: 'orgs/o/stores/s/units/live/i/u1', data: { b: 2 } }
    ]).then(function (out) {
      assert.deepStrictEqual(fb.docs['orgs/o/stores/s/units/u1'], { a: 1 }, 'nguồn thật vẫn đúng');
      assert.strictEqual(out.projectionFailures.length, 1);
      assert.strictEqual(run.projectionFailures()[0].path, 'orgs/o/stores/s/units/live/i/u1');
    });
  });

  test('vượt trần batch thì TỪ CHỐI, không cắt nhỏ rồi mất tính nguyên tử', function () {
    var fb = fakeFirebase();
    var run = _su.RUNNER.create({ firestore: fb.sdk.firestore(), rtdb: fb.sdk.database() });
    var many = [];
    for (var i = 0; i <= _su.RUNNER.BATCH_LIMIT; i++) {
      many.push({ kind: 'FIRESTORE', op: 'set', path: 'orgs/o/stores/s/units/u' + i, data: {} });
    }
    assert.throws(function () { run.runner(many); }, /TỪ CHỐI thay vì cắt nhỏ/);
    assert.strictEqual(fb.batchCount(), 0);
  });

  test('path trỏ vào collection chứ không phải document thì từ chối', function () {
    var fb = fakeFirebase();
    var run = _su.RUNNER.create({ firestore: fb.sdk.firestore(), rtdb: fb.sdk.database() });
    assert.throws(function () {
      run.runner([{ kind: 'FIRESTORE', op: 'set', path: 'orgs/o/stores', data: {} }]);
    }, /không trỏ tới document/);
  });
});

describe('startup — ba mảnh đã cắm điện', function () {
  function boot(fb, over) {
    var spec = Object.assign({
      firebase: FB_CFG, sdk: fb.sdk, context: ctx(),
      cutoverDate: '2026-09-20', today: '2026-09-20', actorId: _su.BOSS
    }, over || {});
    /* Thay read port bằng reader giả qua chính SDK giả là quá vòng; ở đây ta
       kiểm đường đi, nên tiêm reader trực tiếp bằng cách bọc startup. */
    return _su.S.start(spec);
  }

  test('quyền ghi KHÔNG hardcode — trước cutover runtime vẫn READ_ONLY', function () {
    var fb = fakeFirebase();
    return boot(fb, { today: '2026-09-19' }).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.runtime.mode, 'READ_ONLY');
      assert.strictEqual(out.value.takeover.ran, false);
      assert.strictEqual(out.value.takeover.why, 'chưa tới mốc cutover');
    });
  });

  test('trạng thái cutover đọc TỪ KHO, không phải từ bộ nhớ tab', function () {
    var statePath = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/system/cutover';
    var saved = {};
    saved[statePath] = {
      step: 'NEW_SOLE_WRITER', cutoverAt: 1000, attempted: true,
      phases: _su.CUT.REQUIRED_PHASES.map(function (p) {
        return { phase: p, evidence: 'x', actorId: _su.BOSS, at: 1 };
      })
    };
    var fb = fakeFirebase(saved);
    return boot(fb, { today: '2026-09-19' }).then(function (out) {
      assertOk(out);
      /* Đã cutover từ trước thì tải lại trang KHÔNG được quay về READ_ONLY. */
      assert.strictEqual(out.value.cutover.state().step, 'NEW_SOLE_WRITER');
      assert.strictEqual(out.value.runtime.mode, 'WRITE');
    });
  });

  test('đã tiếp nhận trước đó thì KHÔNG chạy lại', function () {
    var opId = GIEO.require('commands/takeover').takeoverOperationId('2026-09-20');
    var opPath = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/operations/' + opId;
    var saved = {};
    saved[opPath] = { operationId: opId, status: 'COMPLETED' };
    var fb = fakeFirebase(saved);
    return boot(fb).then(function (out) {
      assertOk(out);
      assert.strictEqual(out.value.takeover.ran, false);
      assert.strictEqual(out.value.takeover.why, 'đã tiếp nhận trước đó');
      assert.strictEqual(fb.batchCount(), 0, 'không được ghi đè tồn đầu lần thứ hai');
    });
  });

  test('đăng nhập hỏng thì KHÔNG dựng runtime', function () {
    var fb = fakeFirebase();
    fb.sdk.auth = function () {
      return { signInWithEmailAndPassword: function () { return Promise.reject(new Error('sai mật khẩu')); } };
    };
    return boot(fb).then(function (out) {
      assertErr(out, 'RETRYABLE');
    });
  });
});

describe('startup.prepareAuth — đọc PIN trước runtime', function () {
  test('đọc employee read-only rồi dựng context QUANLY', function () {
    var fb = fakeFirebase({
      'employees_gieogieo/owner': {
        fullName: 'Chủ quán', pin: '9876', active: true, role: 'QUANLY_ADMIN'
      }
    });
    return _su.S.prepareAuth({
      firebase: FB_CFG,
      sdk: fb.sdk,
      organizationId: _su.ORG,
      storeId: _su.STORE,
      source: 'QUANLY'
    }).then(function (prepared) {
      var auth = assertOk(prepared);
      assert.strictEqual(auth.employees.length, 1);
      var loggedIn = assertOk(auth.authenticate('9876'));
      assert.strictEqual(loggedIn.actor.role, 'QUANLY_ADMIN');
      assert.strictEqual(loggedIn.context.businessDate, null);
    });
  });
});

describe('startup — tiếp nhận CHẠY THẬT tại mốc cutover', function () {
  function boot(fb, over) {
    return _su.S.start(Object.assign({
      firebase: FB_CFG, sdk: fb.sdk, context: ctx(),
      cutoverDate: '2026-09-20', today: '2026-09-20', actorId: _su.BOSS
    }, over || {}));
  }

  test('bật app ngày cutover thì TỰ đọc hệ cũ, tự đánh dấu, tự ghi', function () {
    var fb = withLegacyData();
    return boot(fb).then(function (out) {
      assertOk(out);
      var t = out.value.takeover;
      assert.strictEqual(t.ran, true, t.why || '');
      assert.strictEqual(t.summary.units, 2);
      assert.strictEqual(t.summary.unitsOpen, 1);
      assert.strictEqual(t.summary.items, 1);
      assert.strictEqual(fb.batchCount(), 1, 'cả tiếp nhận phải vào trong MỘT batch');

      var base = 'orgs/' + _su.ORG + '/stores/' + _su.STORE;
      var unit = fb.docs[base + '/units/unit_seed.OPEN01'];
      assert.ok(unit, 'lô tiếp nhận phải nằm trong kho Unit chung');
      assert.strictEqual(unit.origin, 'LEGACY_SEED');
      assert.strictEqual(unit.costBasis, null);
      assert.strictEqual(unit.initialQty, 125.5, 'phải lấy số của tầng nóng RTDB');
      assert.strictEqual(unit.status, 'OPEN');
      assert.strictEqual(unit.seededAt, '2026-09-20');

      /* PIN hệ cũ mang sang nguyên vẹn — nhân viên đăng nhập như cũ. */
      var emp = fb.docs[base + '/employees/' + _su.ids.deterministicId('employee', ['legacy', 'e1'])];
      assert.ok(emp);
      assert.strictEqual(emp.pin, '3326');

      /* Bản ghi operation phải nằm trong cùng lần ghi — nếu không, lần bật app
         sau sẽ tiếp nhận lại và ghi đè tồn đầu. */
      assert.ok(fb.docs[base + '/operations/' + t.operationId]);
    });
  });

  test('bật app lần thứ hai KHÔNG tiếp nhận lại', function () {
    var fb = withLegacyData();
    return boot(fb).then(function (first) {
      assertOk(first);
      assert.strictEqual(first.value.takeover.ran, true);
      return boot(fb);
    }).then(function (second) {
      assertOk(second);
      assert.strictEqual(second.value.takeover.ran, false);
      assert.strictEqual(second.value.takeover.why, 'đã tiếp nhận trước đó');
      assert.strictEqual(fb.batchCount(), 1, 'vẫn đúng MỘT lần ghi sau hai lần bật app');
    });
  });

  test('hệ cũ rỗng thì DỪNG, không tiếp nhận rỗng rồi coi như xong', function () {
    var fb = fakeFirebase();
    return boot(fb).then(function (out) {
      assertErr(out, 'PRECONDITION');
      assert.strictEqual(fb.batchCount(), 0);
    });
  });
});

describe('canonical-read-port — loadEntriesForReference (nguồn originalAllocations cho ReverseTransaction)', function () {
  var cctx = { organizationId: _su.ORG, storeId: _su.STORE };
  var ledgerBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/ledger/';

  test('đọc đúng entries khớp CẢ referenceId lẫn domain, bỏ qua bill khác/domain khác', function () {
    var fb = fakeFirebase();
    fb.docs[ledgerBase + 'e1'] = { entryId: 'e1', referenceId: 'bill1', domain: 'raw', unitId: 'u1', qtyDelta: -5 };
    fb.docs[ledgerBase + 'e2'] = { entryId: 'e2', referenceId: 'bill1', domain: 'prep', qtyDelta: -1 };
    fb.docs[ledgerBase + 'e3'] = { entryId: 'e3', referenceId: 'bill-khac', domain: 'raw', qtyDelta: -9 };
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return reader.loadEntriesForReference(cctx, 'bill1', 'raw').then(function (out) {
      var entries = assertOk(out);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].entryId, 'e1');
    });
  });

  test('không có entry nào khớp thì trả mảng rỗng, không phải lỗi', function () {
    var fb = fakeFirebase();
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return reader.loadEntriesForReference(cctx, 'bill-khong-ton-tai', 'raw').then(function (out) {
      assert.deepStrictEqual(assertOk(out), []);
    });
  });
});

describe('canonical-read-port — loadLoyaltyEntriesForReference (nguồn eventData.loyaltyEntries cho ReverseTransaction, NET-LOYALTY-V1.md #4)', function () {
  var cctx = { organizationId: _su.ORG, storeId: _su.STORE };
  var loyaltyBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/loyaltyLedger/';

  test('đọc đúng entries khớp billId, bỏ qua bill khác', function () {
    var fb = fakeFirebase();
    fb.docs[loyaltyBase + 'l1'] = { entryId: 'l1', referenceId: 'bill1', customerId: 'c1', delta: 10 };
    fb.docs[loyaltyBase + 'l2'] = { entryId: 'l2', referenceId: 'bill-khac', customerId: 'c1', delta: 5 };
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return reader.loadLoyaltyEntriesForReference(cctx, 'bill1').then(function (out) {
      var entries = assertOk(out);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].entryId, 'l1');
    });
  });

  test('không có entry nào thì trả mảng rỗng, không phải lỗi', function () {
    var fb = fakeFirebase();
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return reader.loadLoyaltyEntriesForReference(cctx, 'bill-khong-ton-tai').then(function (out) {
      assert.deepStrictEqual(assertOk(out), []);
    });
  });
});

describe('canonical-data-source — forQuery GetLoyaltyLedgerForReference (NET-LOYALTY-V1.md #4)', function () {
  var loyaltyBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/loyaltyLedger/';

  function ds(fb) {
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return _su.CDS.create(reader, { organizationId: _su.ORG });
  }

  test('có entry loyalty canonical thì cấp entries, giữ nguyên field khác của input', function () {
    var fb = fakeFirebase();
    fb.docs[loyaltyBase + 'l1'] = { entryId: 'l1', referenceId: 'bill1', customerId: 'c1', delta: 10 };
    return ds(fb).forQuery('GetLoyaltyLedgerForReference', {
      billId: 'bill1', storeId: _su.STORE, foo: 'giữ nguyên'
    }).then(function (out) {
      var v = assertOk(out);
      assert.strictEqual(v.entries.length, 1);
      assert.strictEqual(v.foo, 'giữ nguyên');
    });
  });

  test('không có entry nào (bill legacy, hoặc chưa từng tích điểm) thì đi qua NGUYÊN VẸN', function () {
    var fb = fakeFirebase();
    return ds(fb).forQuery('GetLoyaltyLedgerForReference', {
      billId: 'bill-legacy-xxx', storeId: _su.STORE
    }).then(function (out) {
      assert.strictEqual(assertOk(out).entries, undefined);
    });
  });

  test('input đã có entries sẵn (gọi lại) thì KHÔNG ghi đè', function () {
    var fb = fakeFirebase();
    fb.docs[loyaltyBase + 'l1'] = { entryId: 'l1', referenceId: 'bill1', customerId: 'c1', delta: 10 };
    return ds(fb).forQuery('GetLoyaltyLedgerForReference', {
      billId: 'bill1', storeId: _su.STORE, entries: ['đã-có']
    }).then(function (out) {
      assert.deepStrictEqual(assertOk(out).entries, ['đã-có']);
    });
  });

  test('tên query khác, hoặc thiếu billId, thì pass-through nguyên input', function () {
    var fb = fakeFirebase();
    return ds(fb).forQuery('GetBillsForRange', { from: 'x' }).then(function (out) {
      assert.deepStrictEqual(assertOk(out), { from: 'x' });
    });
  });
});

describe('canonical-data-source — forQuery GetLedgerEntriesForReference (LỊCH SỬ BILL, xoá bill)', function () {
  var ledgerBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/ledger/';

  function ds(fb) {
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return _su.CDS.create(reader, { organizationId: _su.ORG });
  }

  test('có entry canonical thì cấp entries + entriesSource, giữ nguyên field khác của input', function () {
    var fb = fakeFirebase();
    fb.docs[ledgerBase + 'e1'] = { entryId: 'e1', referenceId: 'bill1', domain: 'raw', unitId: 'u1', qtyDelta: -5 };
    return ds(fb).forQuery('GetLedgerEntriesForReference', {
      referenceId: 'bill1', domain: 'raw', storeId: _su.STORE, foo: 'giữ nguyên'
    }).then(function (out) {
      var v = assertOk(out);
      assert.strictEqual(v.entries.length, 1);
      assert.strictEqual(v.entriesSource, 'CANONICAL');
      assert.strictEqual(v.foo, 'giữ nguyên');
    });
  });

  test('không có entry nào (bill legacy) thì đi qua NGUYÊN VẸN — không set entries, để tầng sau tự biết untracked', function () {
    var fb = fakeFirebase();
    return ds(fb).forQuery('GetLedgerEntriesForReference', {
      referenceId: 'bill-legacy-xxx', domain: 'raw', storeId: _su.STORE
    }).then(function (out) {
      var v = assertOk(out);
      assert.strictEqual(v.entries, undefined);
    });
  });

  test('input đã có entries sẵn (gọi lại) thì KHÔNG ghi đè', function () {
    var fb = fakeFirebase();
    fb.docs[ledgerBase + 'e1'] = { entryId: 'e1', referenceId: 'bill1', domain: 'raw', qtyDelta: -5 };
    return ds(fb).forQuery('GetLedgerEntriesForReference', {
      referenceId: 'bill1', domain: 'raw', storeId: _su.STORE, entries: ['đã-có']
    }).then(function (out) {
      var v = assertOk(out);
      assert.deepStrictEqual(v.entries, ['đã-có']);
    });
  });

  test('tên query khác, hoặc thiếu referenceId/domain, thì pass-through nguyên input', function () {
    var fb = fakeFirebase();
    return ds(fb).forQuery('GetBillsForRange', { from: 'x' }).then(function (out) {
      assert.deepStrictEqual(assertOk(out), { from: 'x' });
    });
  });
});

describe('startup — composeDataSource nối canonical forQuery vào GetLedgerEntriesForReference đầu-cuối', function () {
  test('bill ghi qua canonical → coverage traceable; bill legacy (trống) → untracked, không lỗi', function () {
    var ledgerBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/ledger/';
    var fb = fakeFirebase();
    fb.docs[ledgerBase + 'e1'] = {
      entryId: 'e1', referenceId: 'bill-moi', domain: 'raw', itemId: 'i1', unitId: 'u1',
      qtyDelta: -5, unitCost: 100
    };
    return _su.S.start({
      firebase: FB_CFG, sdk: fb.sdk, context: ctx(),
      cutoverDate: '2026-09-20', today: '2026-09-19', actorId: _su.BOSS
    }).then(function (out) {
      var runtime = assertOk(out).runtime;
      return Promise.all([
        runtime.query('GetLedgerEntriesForReference', { referenceId: 'bill-moi', domain: 'raw', storeId: _su.STORE }),
        runtime.query('GetLedgerEntriesForReference', { referenceId: 'bill-cu-truoc-cutover', domain: 'raw', storeId: _su.STORE })
      ]);
    }).then(function (results) {
      var traced = assertOk(results[0]);
      assert.strictEqual(traced.coverage, 'traceable');
      assert.strictEqual(traced.entries.length, 1);

      var untracked = assertOk(results[1]);
      assert.strictEqual(untracked.coverage, 'untracked');
      assert.deepStrictEqual(untracked.entries, []);
    });
  });
});

describe('canonical-data-source — forCommand ReverseTransaction nạp input.units (LỊCH SỬ BILL, xoá bill)', function () {
  var unitBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/units/';

  function ds(fb) {
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return _su.CDS.create(reader, { organizationId: _su.ORG });
  }

  test('originalAllocations rỗng (bill legacy, coverage untracked) thì KHÔNG đọc Unit nào, đi thẳng', function () {
    var fb = fakeFirebase();
    return ds(fb).forCommand('ReverseTransaction', {
      referenceId: 'order-cu', domain: 'raw', storeId: _su.STORE, reason: 'xoá bill', originalAllocations: []
    }).then(function (out) {
      var v = assertOk(out);
      assert.strictEqual(v.units, undefined);
    });
  });

  test('originalAllocations có itemId thì nạp đúng Unit hiện có của các itemId đó vào input.units', function () {
    var fb = fakeFirebase();
    fb.docs[unitBase + 'u1'] = { unitId: 'u1', itemId: 'sua', remainingQty: 3, status: 'OPEN' };
    fb.docs[unitBase + 'u2'] = { unitId: 'u2', itemId: 'duong', remainingQty: 0, status: 'COMPACTABLE' };
    fb.docs[unitBase + 'u3'] = { unitId: 'u3', itemId: 'khac-khong-lien-quan', remainingQty: 9, status: 'OPEN' };
    return ds(fb).forCommand('ReverseTransaction', {
      referenceId: 'bill-moi', domain: 'raw', storeId: _su.STORE, reason: 'xoá bill',
      originalAllocations: [{ unitId: 'u1', itemId: 'sua', qty: 5 }, { unitId: 'u2', itemId: 'duong', qty: 1 }]
    }).then(function (out) {
      var v = assertOk(out);
      var ids = v.units.map(function (u) { return u.unitId; }).sort();
      assert.deepStrictEqual(ids, ['u1', 'u2']);
    });
  });

  test('input.units đã có sẵn (gọi lại) thì KHÔNG ghi đè, đi thẳng', function () {
    var fb = fakeFirebase();
    return ds(fb).forCommand('ReverseTransaction', {
      referenceId: 'bill-moi', domain: 'raw', storeId: _su.STORE, reason: 'xoá bill',
      originalAllocations: [{ unitId: 'u1', itemId: 'sua', qty: 5 }], units: ['đã-có']
    }).then(function (out) {
      assert.deepStrictEqual(assertOk(out).units, ['đã-có']);
    });
  });

  test('command khác không bị đụng vào', function () {
    var fb = fakeFirebase();
    return ds(fb).forCommand('AdjustInventory', { itemId: 'sua' }).then(function (out) {
      assert.deepStrictEqual(assertOk(out), { itemId: 'sua' });
    });
  });
});

describe('canonical-data-source — forQuery GetPackagingConfig (kho:packaging)', function () {
  var pkgBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/versions/packaging/__default__/';

  function ds(fb) {
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return _su.CDS.create(reader, { organizationId: _su.ORG });
  }

  test('có version packaging __default__ thì cấp versions, giữ nguyên field khác của input', function () {
    var fb = fakeFirebase();
    fb.docs[pkgBase + 'v1'] = {
      kind: 'packaging', subjectId: '__default__', storeId: _su.STORE, versionId: 'v1',
      effectiveFrom: 1000, effectiveTo: null, payload: { tier: 'preset', items: [] }
    };
    return ds(fb).forQuery('GetPackagingConfig', { storeId: _su.STORE, foo: 'giữ nguyên' }).then(function (out) {
      var v = assertOk(out);
      assert.strictEqual(v.versions.length, 1);
      assert.strictEqual(v.foo, 'giữ nguyên');
    });
  });

  test('chưa từng publish thì đi qua NGUYÊN VẸN — không set versions', function () {
    var fb = fakeFirebase();
    return ds(fb).forQuery('GetPackagingConfig', { storeId: _su.STORE }).then(function (out) {
      assert.strictEqual(assertOk(out).versions, undefined);
    });
  });

  test('input đã có versions sẵn (gọi lại) thì KHÔNG ghi đè', function () {
    var fb = fakeFirebase();
    fb.docs[pkgBase + 'v1'] = { versionId: 'v1', effectiveFrom: 1000, payload: {} };
    return ds(fb).forQuery('GetPackagingConfig', { storeId: _su.STORE, versions: ['đã-có'] }).then(function (out) {
      assert.deepStrictEqual(assertOk(out).versions, ['đã-có']);
    });
  });

  test('tên query khác thì pass-through nguyên input', function () {
    var fb = fakeFirebase();
    return ds(fb).forQuery('GetBillsForRange', { from: 'x' }).then(function (out) {
      assert.deepStrictEqual(assertOk(out), { from: 'x' });
    });
  });
});

describe('canonical-data-source — forCommand PublishPackaging hydrate versionRegistry (kho:packaging)', function () {
  var pkgBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/versions/packaging/__default__/';

  function ds(fb) {
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    return _su.CDS.create(reader, { organizationId: _su.ORG });
  }

  test('hydrate registry với lịch sử packaging __default__ đã có, publish version mới thành công', function () {
    var fb = fakeFirebase();
    fb.docs[pkgBase + 'v1'] = {
      kind: 'packaging', subjectId: '__default__', storeId: _su.STORE, versionId: 'v1',
      effectiveFrom: 1000, effectiveTo: null, payload: { tier: 'preset', items: [] },
      publishedAt: 1000, publishedBy: _su.BOSS
    };
    return ds(fb).forCommand('PublishPackaging', {
      storeId: _su.STORE, effectiveFrom: 5000
    }).then(function (out) {
      var v = assertOk(out);
      assert.ok(v.deps && v.deps.versionRegistry, 'phải có versionRegistry');
      var listed = v.deps.versionRegistry.listVersions('packaging', '__default__', _su.STORE);
      assert.strictEqual(listed.length, 1);
      assert.strictEqual(listed[0].versionId, 'v1');
    });
  });

  test('chưa từng publish thì registry hydrate rỗng, không lỗi', function () {
    var fb = fakeFirebase();
    return ds(fb).forCommand('PublishPackaging', { storeId: _su.STORE, effectiveFrom: 5000 }).then(function (out) {
      var v = assertOk(out);
      assert.deepStrictEqual(v.deps.versionRegistry.listVersions('packaging', '__default__', _su.STORE), []);
    });
  });

  test('có menuItemId (override theo món) thì TỪ CHỐI — chưa hỗ trợ ở màn Kho đợt này', function () {
    var fb = fakeFirebase();
    return ds(fb).forCommand('PublishPackaging', {
      storeId: _su.STORE, effectiveFrom: 5000, menuItemId: 'item_x'
    }).then(function (out) {
      assertErr(out, 'VALIDATION');
    });
  });

  test('input.deps.versionRegistry đã có sẵn (gọi lại) thì KHÔNG hydrate lại', function () {
    var fb = fakeFirebase();
    var marker = { alreadyHydrated: true };
    return ds(fb).forCommand('PublishPackaging', {
      storeId: _su.STORE, effectiveFrom: 5000, deps: { versionRegistry: marker }
    }).then(function (out) {
      assert.strictEqual(assertOk(out).deps.versionRegistry, marker);
    });
  });

  test('command khác không bị đụng vào', function () {
    var fb = fakeFirebase();
    return ds(fb).forCommand('AdjustInventory', { itemId: 'sua' }).then(function (out) {
      assert.deepStrictEqual(assertOk(out), { itemId: 'sua' });
    });
  });
});

describe('runtime — xoá bill đầu-cuối qua GetLedgerEntriesForReference + ReverseTransaction (§3.8)', function () {
  /* SHADOW (không cần commit adapter) đủ để chạy pipeline thật — chỉ dùng
     canonical-data-source làm dataSource vì cả hai query/command này không có
     nhánh riêng ở legacy-data-source.js (xem comment ở canonical-data-source.js). */
  function shadowRuntime(fb) {
    var reader = _su.CRP.createReader(fb.sdk.firestore());
    var c = ctx();
    return _su.RT.createRuntime({
      mode: _su.RT.MODE.SHADOW,
      context: function () { return c; },
      dataSource: _su.CDS.create(reader, { organizationId: _su.ORG })
    });
  }

  test('bill ghi qua canonical: đọc ledger, nạp Unit, hoàn tác thật — cộng lại đúng remainingQty', function () {
    var ledgerBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/ledger/';
    var unitBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/units/';
    var fb = fakeFirebase();
    fb.docs[ledgerBase + 'e1'] = {
      entryId: 'e1', referenceId: 'bill-moi', domain: 'raw', itemId: 'sua', unitId: 'u1',
      qtyDelta: -5, unitCost: 100
    };
    fb.docs[unitBase + 'u1'] = { unitId: 'u1', itemId: 'sua', remainingQty: 10, status: 'OPEN' };
    var runtime = shadowRuntime(fb);
    return runtime.query('GetLedgerEntriesForReference', {
      referenceId: 'bill-moi', domain: 'raw', storeId: _su.STORE
    }).then(function (entriesOut) {
      var entries = assertOk(entriesOut).entries;
      var allocations = entries.map(function (e) {
        return { unitId: e.unitId, itemId: e.itemId, qty: Math.abs(e.qtyDelta), unitCost: e.unitCost };
      });
      return runtime.command('ReverseTransaction', {
        referenceId: 'bill-moi', domain: 'raw', storeId: _su.STORE,
        reason: 'xoá bill test', originalAllocations: allocations
      });
    }).then(function (commandOut) {
      var v = assertOk(commandOut);
      assert.strictEqual(v.plan.unitChanges.length, 1);
      assert.strictEqual(v.plan.unitChanges[0].remainingQty, 15);
      assert.strictEqual((v.plan.domainRecords || []).some(function (r) { return r.type === 'manualReviewTask'; }), false);
    });
  });

  test('NET-LOYALTY-V1.md #4: xoá bill canonical kèm eventType OrderVoided → L5 hoàn điểm thật qua domain-events sideEffects', function () {
    var billId = _su.ids.deterministicId('bill', ['t1']);
    var customerId = _su.ids.deterministicId('customer', ['0900000000']);
    var ledgerBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/ledger/';
    var unitBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/units/';
    var loyaltyBase = 'orgs/' + _su.ORG + '/stores/' + _su.STORE + '/loyaltyLedger/';
    var fb = fakeFirebase();
    fb.docs[ledgerBase + 'e1'] = {
      entryId: 'e1', referenceId: billId, domain: 'raw', itemId: 'sua', unitId: 'u1',
      qtyDelta: -5, unitCost: 100
    };
    fb.docs[unitBase + 'u1'] = { unitId: 'u1', itemId: 'sua', remainingQty: 10, status: 'OPEN' };
    fb.docs[loyaltyBase + 'l1'] = {
      entryId: 'l1', customerId: customerId, storeId: _su.STORE, currency: 'POINTS', delta: 10,
      reason: 'EARN_SALE', referenceType: 'bill', referenceId: billId, operationId: 'op-earn-1',
      businessDate: '2026-09-20', occurredAt: 1, actorId: null, note: null
    };
    var runtime = shadowRuntime(fb);
    return Promise.all([
      runtime.query('GetLedgerEntriesForReference', { referenceId: billId, domain: 'raw', storeId: _su.STORE }),
      runtime.query('GetLoyaltyLedgerForReference', { billId: billId, storeId: _su.STORE })
    ]).then(function (results) {
      var stockEntries = assertOk(results[0]).entries;
      var loyaltyEntries = assertOk(results[1]).entries;
      var allocations = stockEntries.map(function (e) {
        return { unitId: e.unitId, itemId: e.itemId, qty: Math.abs(e.qtyDelta), unitCost: e.unitCost };
      });
      return runtime.command('ReverseTransaction', {
        referenceId: billId, domain: 'raw', storeId: _su.STORE,
        reason: 'xoá bill test', originalAllocations: allocations,
        eventType: 'OrderVoided', eventData: { loyaltyEntries: loyaltyEntries }
      });
    }).then(function (commandOut) {
      var v = assertOk(commandOut);
      assert.strictEqual(v.plan.unitChanges[0].remainingQty, 15);
      var loyaltySideEffect = (v.sideEffects || []).filter(function (se) {
        return se.command === 'ReverseLoyaltyForVoidedBill';
      })[0];
      assert.ok(loyaltySideEffect, 'phải có sideEffect ReverseLoyaltyForVoidedBill');
      var loyaltyResult = assertOk(loyaltySideEffect.result);
      var loyaltyRecords = loyaltyResult.plan.domainRecords.filter(function (r) {
        return r.type === 'loyaltyLedgerEntry';
      });
      assert.strictEqual(loyaltyRecords.length, 1);
      assert.strictEqual(loyaltyRecords[0].record.delta, -10);
      assert.strictEqual(loyaltyRecords[0].record.customerId, customerId);
    });
  });

  test('bill legacy (không có ledger canonical): coverage untracked → ReverseTransaction không lỗi, đẩy manualReviewTask', function () {
    var fb = fakeFirebase();
    var runtime = shadowRuntime(fb);
    return runtime.query('GetLedgerEntriesForReference', {
      referenceId: 'order-legacy-abc', domain: 'raw', storeId: _su.STORE
    }).then(function (entriesOut) {
      var entries = assertOk(entriesOut).entries;
      assert.deepStrictEqual(entries, []);
      return runtime.command('ReverseTransaction', {
        referenceId: 'order-legacy-abc', domain: 'raw', storeId: _su.STORE,
        reason: 'xoá bill test', originalAllocations: entries
      });
    }).then(function (commandOut) {
      var v = assertOk(commandOut);
      assert.strictEqual(v.plan.unitChanges.length, 0);
      var review = (v.plan.domainRecords || []).filter(function (r) { return r.type === 'manualReviewTask'; });
      assert.strictEqual(review.length, 1);
      assert.strictEqual(review[0].record.reason, 'AMBIGUOUS_LEGACY');
    });
  });
});
