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
  function makeCol(parts) {
    return {
      doc: function (d) { return makeDoc(parts.concat([d])); },
      where: function () { return this; }, orderBy: function () { return this; },
      limit: function () { return this; },
      /* Trả về đúng các document nằm trực tiếp dưới collection này, để read port
         thật chạy được mà không cần mạng. */
      get: function () {
        var prefix = pathOf(parts) + '/';
        var rows = Object.keys(docs)
          .filter(function (k) { return k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') === -1; })
          .map(function (k) {
            return { id: k.slice(prefix.length), data: function () { return docs[k]; } };
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
