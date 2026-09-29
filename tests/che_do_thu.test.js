// CHẾ ĐỘ THỬ (che_do_thu.v1.js): chạy lại toàn bộ kịch bản giao diện của snapshot_wrap trong chế độ thử
// và kiểm CÁCH LY — dữ liệu thật (Firestore + RT) không đổi một byte, không lượt ghi nào ra ngoài vùng thử.
// Kèm: chép từ thật, xoá vùng thử, tự kiểm fail-closed, localStorage tách riêng.
'use strict';
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { makeFake } = require('./lib/fakefb');
const { runWrapped } = require('./lib/wrap_harness');
const { S } = require('./snapshot_wrap.test.js');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 400), '!=', JSON.stringify(b).slice(0, 400)); } else console.log('ok', m); };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'che_do_thu.v1.js'), 'utf8');
function load(extra) {
  const sb = Object.assign({ console: { log() {}, warn() {}, error() {}, info() {} }, setTimeout, Promise }, extra || {});
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb); vm.runInContext(SRC, sb); return sb;
}
const T = '__test_gieogieo/data/';
(async () => {
  // 1) Cách ly: mọi kịch bản giao diện (POS + Quản lý) chạy trong chế độ thử
  for (const n of Object.keys(S)) {
    const r = await runWrapped('engine', S[n], { thu: true });
    eq({ fs: r.thu.realFsChanged, rt: r.thu.realRtChanged, lot: r.thu.escaped, coGhi: r.thu.testWrites > 0 },
      { fs: false, rt: false, lot: [], coGhi: true }, 'cách ly: ' + n);
  }

  // 2) Chép từ thật → vùng thử; xoá vùng thử
  {
    const fake = makeFake({
      rt: { menu_gieogieo: { m1: { name: 'Trà' } }, active_units_gieogieo: { X: { A: { unitBase: 5 } } }, orders_gieogieo: { '09': { o1: { total: 1 } } }, bank_confirmations: { GG1: { amount: 1 } } },
      fs: {
        'inventory_items_gieogieo/X': { name: 'Sữa', currentStock: 5 },
        'employees_gieogieo/e1': { fullName: 'NV A' },
        'stock_containers_gieogieo/A': { status: 'open' }, 'stock_containers_gieogieo/F': { status: 'finished' },
        'prep_batches_gieogieo/b1': { status: 'active' }, 'prep_batches_gieogieo/b0': { status: 'used_up' },
        'stock_transactions_gieogieo/t1': { qty: -1 }, 'customers/0900': { stamps: 3 }
      }
    });
    const sb = load({ firebase: fake.firebase }); const GT = sb.GieoThu;
    GT.install({ app: 'pos', firebase: fake.firebase, db: fake.db, fstore: fake.fstore });
    const realBefore = JSON.stringify(Object.entries(fake.FS).sort());
    const rtBefore = JSON.stringify(fake.RT.root);
    await GT._seed();
    const testKeys = Object.keys(fake.FS).filter(k => k.startsWith(T)).map(k => k.slice(T.length)).sort();
    eq(testKeys, ['employees_gieogieo/e1', 'inventory_items_gieogieo/X', 'prep_batches_gieogieo/b1', 'stock_containers_gieogieo/A'],
      'chép: danh mục + tem/lô còn hiệu lực; KHÔNG chép sổ, khách hàng, tem đã hết, lô đã dùng hết');
    eq([fake.RT.root.__test_gieogieo.menu_gieogieo, fake.RT.root.__test_gieogieo.active_units_gieogieo, fake.RT.root.__test_gieogieo.orders_gieogieo, fake.RT.root.__test_gieogieo.bank_confirmations],
      [{ m1: { name: 'Trà' } }, { X: { A: { unitBase: 5 } } }, undefined, undefined], 'chép RT: menu + tem mở; KHÔNG chép bill / CK');
    // app ghi trong chế độ thử
    await fake.fstore.collection('stock_transactions_gieogieo').doc('t9').set({ qty: 2 });
    await fake.fstore.collection('customers').doc('0911').set({ stamps: 1 });
    await fake.db.ref('orders_gieogieo/09/o2').set({ total: 2 });
    eq([fake.FS[T + 'customers/0911'], fake.FS['customers/0911'], fake.RT.root.orders_gieogieo['09'].o2, fake.RT.root.__test_gieogieo.orders_gieogieo['09'].o2],
      [{ stamps: 1 }, undefined, undefined, { total: 2 }], 'ghi khách / bill ở chế độ thử → chỉ vào vùng thử');
    const realNow = JSON.stringify(Object.entries(fake.FS).filter(([k]) => !k.startsWith('__test_gieogieo/')).sort());
    eq(realNow, realBefore, 'dữ liệu thật Firestore không đổi sau chép + ghi thử');
    await GT._wipe(() => {});
    eq(Object.keys(fake.FS).filter(k => k.startsWith('__test_gieogieo')), [], 'kết thúc thử: xoá sạch Firestore vùng thử (kể cả collection chỉ ghi, không chép)');
    eq([fake.RT.root.__test_gieogieo, JSON.stringify(Object.entries(fake.FS).sort()), JSON.stringify(fake.RT.root)], [undefined, realBefore, rtBefore], 'kết thúc thử: xoá RT vùng thử, dữ liệu thật nguyên vẹn');
  }

  // 3) Đường đặc biệt + fail-closed
  {
    const fake = makeFake({ rt: {}, fs: {} });
    const sb = load({ firebase: fake.firebase }); const GT = sb.GieoThu;
    GT.install({ app: 'quanly', firebase: fake.firebase, db: fake.db, fstore: fake.fstore });
    eq([fake.db.ref('.info/serverTimeOffset').toString(), fake.db.ref('/menu_gieogieo/').toString(), fake.db.ref('').toString(), fake.fstore.collection('a/b/c').path],
      ['https://fake-rtdb/.info/serverTimeOffset', 'https://fake-rtdb/__test_gieogieo/menu_gieogieo', 'https://fake-rtdb/__test_gieogieo', T + 'a/b/c'], '.info giữ nguyên; gốc RT / đường có "/" / collection lồng → vùng thử');
    let e1 = ''; try { fake.fstore.collectionGroup('x'); } catch (e) { e1 = e.message; }
    eq(/bị chặn/.test(e1), true, 'collectionGroup bị chặn');
    eq([GT.active, GT.storagePath('vessels/a.jpg'), GT.storagePath('__test_gieogieo/vessels/a.jpg')], [true, '__test_gieogieo/vessels/a.jpg', '__test_gieogieo/vessels/a.jpg'], 'đường Storage có tiền tố, không cộng đôi');
  }
  {
    const fake = makeFake({ rt: {}, fs: {} });
    const badFirebase = { firestore: Object.assign(() => ({}), { FieldValue: fake.FieldValue }), database: () => fake.db };  // firestore() trả đối tượng KHÁC
    const sb = load({ firebase: badFirebase }); const GT = sb.GieoThu;
    let thrown = ''; try { GT.install({ app: 'pos', firebase: badFirebase, db: fake.db, fstore: fake.fstore }); } catch (e) { thrown = e.message; }
    let w1 = '', w2 = ''; try { fake.fstore.collection('x'); } catch (e) { w1 = e.message; } try { fake.db.ref('x'); } catch (e) { w2 = e.message; }
    eq([/GieoThu/.test(thrown), /khoá/.test(w1), /khoá/.test(w2)], [true, true, true], 'tự kiểm sai → dừng + khoá mọi lệnh đọc/ghi (fail-closed)');
  }
  // 4) localStorage tách riêng
  {
    class Storage { constructor() { this._m = {}; } getItem(k) { return k in this._m ? this._m[k] : null; } setItem(k, v) { this._m[k] = String(v); } removeItem(k) { delete this._m[k]; } get length() { return Object.keys(this._m).length; } key(i) { return Object.keys(this._m)[i]; } }
    const ls = new Storage(); ls._m.dwPending_pos = 'THAT';
    const fake = makeFake({ rt: {}, fs: {} });
    const sb = load({ firebase: fake.firebase, Storage, localStorage: ls }); const GT = sb.GieoThu;
    GT.install({ app: 'pos', firebase: fake.firebase, db: fake.db, fstore: fake.fstore });
    eq(ls.getItem('dwPending_pos'), null, 'localStorage: chế độ thử không thấy hàng đợi thật');
    ls.setItem('dwPending_pos', 'THU');
    eq([ls._m.dwPending_pos, ls._m.__thu__dwPending_pos], ['THAT', 'THU'], 'localStorage: ghi thử vào khoá riêng, khoá thật nguyên');
    await GT._wipe(() => {});
    eq(Object.keys(ls._m), ['dwPending_pos'], 'kết thúc thử: xoá localStorage thử, giữ khoá thật');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
