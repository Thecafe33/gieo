// ĐA CỬA HÀNG — Bước 2 (docs/KE_HOACH_DA_CUA_HANG.md): danh mục theo quán + đồng bộ + đăng nhập cửa hàng.
//  1. Đồng bộ danh mục tự động (catalogMirror — Quản lý): sửa / thêm / batch / xoá ở quán đang chạy → các quán khác
//     đã sẵn danh mục nhận ĐÚNG trường danh mục, KHÔNG BAO GIỜ nhận trường tồn; ghi chỉ trường tồn → không đồng bộ,
//     không tốn lượt đọc; xoá bị chặn khi quán khác còn tồn; lỗi đồng bộ được báo.
//  2. 24 kịch bản thật chạy ở gg01 có bật đồng bộ + có quán gg02 → engine / POS / Quản lý không ghi gì sang gg02
//     (mọi lượt ghi của engine lên danh mục chỉ là trường tồn).
//  3. Tạo quán mới (seedNewStore) + kiểm lệch (catalogDiff).
//  4. Máy chưa đăng nhập cửa hàng: chặn mọi dữ liệu riêng / danh mục, vẫn đọc được dùng chung.
//  5. Gắn máy (binding), tìm cửa hàng theo mã 6 ký tự, mã CK.
'use strict';
const fs = require('fs'), path = require('path');
const { makeFake } = require('./lib/fakefb');
const { runWrapped } = require('./lib/wrap_harness');
const { S } = require('./snapshot_wrap.test.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail = 1; };
const ROOT = path.join(__dirname, '..');
const nap = (win) => { const m = { exports: {} }; new Function('window', 'module', fs.readFileSync(path.join(ROOT, (require('fs').readdirSync(ROOT).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop())), 'utf8'))(win || {}, m); return m.exports.GieoData; };
const INV = 'inventory_items_gieogieo', PI = 'prep_items_gieogieo';

function quan(extraFs) {
  const fsSeed = Object.assign({
    ['stores_gieogieo/gg01']: { name: 'Gieo 1', code: 'ABC234', catalogReady: true, active: true },
    ['stores_gieogieo/gg02']: { name: 'Gieo 2', code: 'XYZ567', catalogReady: true, active: true },
    ['stores_gieogieo/gg03']: { name: 'Gieo 3 (đang tạo)', code: 'QWE345', catalogReady: false, active: true },
    ['stores_gieogieo/gg04']: { name: 'Gieo 4 (đóng)', code: 'RTY678', catalogReady: true, active: false },
    [INV + '/A']: { name: 'Sữa', unit: 'ml', costPerUnit: 30, currentStock: 500, lastCount: { qty: 1 } },
    [INV + '__gg02/A']: { name: 'Sữa', unit: 'ml', costPerUnit: 30, currentStock: 80 },
    [INV + '__gg03/A']: { name: 'Sữa', unit: 'ml', costPerUnit: 30, currentStock: 0 },
    [INV + '/B']: { name: 'Đường', unit: 'g', currentStock: 10 },
    [INV + '__gg02/B']: { name: 'Đường', unit: 'g', currentStock: 0 },
    [PI + '/P']: { name: 'Trân châu', batchYield: 1000, currentStock: 3 },
    [PI + '__gg02/P']: { name: 'Trân châu', batchYield: 1000, currentStock: 7 }
  }, extraFs || {});
  const f = makeFake({ fs: fsSeed, rt: {} });
  const G = nap();
  G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01', catalogMirror: true });
  return { f, G };
}
const lay = (f, k) => f.FS[k];

(async () => {
  // ── 1. Đồng bộ danh mục ──
  {
    const { f, G } = quan();
    const loiBao = []; G.onCatalogSyncError = e => loiBao.push(e);
    // sửa (update) — tên + giá + trường tồn trộn lẫn
    await f.fstore.collection(INV).doc('A').update({ name: 'Sữa tươi', costPerUnit: 32, currentStock: 999, 'lastCount.suspect': true, updatedAt: 'x' });
    const a2 = lay(f, INV + '__gg02/A');
    ok(a2.name === 'Sữa tươi' && a2.costPerUnit === 32 && a2.currentStock === 80 && !a2.lastCount && a2.updatedAt === undefined, 'sửa danh mục → gg02 nhận tên + giá, GIỮ tồn 80 của gg02, không nhận trường tồn');
    ok(lay(f, INV + '__gg03/A').name === 'Sữa' && !f.FS[INV + '__gg04/A'], 'quán chưa sẵn danh mục (gg03) / đã đóng (gg04) không nhận');
    ok(lay(f, INV + '/A').currentStock === 999 && lay(f, INV + '/A').name === 'Sữa tươi', 'quán đang chạy ghi đúng như cũ');
    // ghi CHỈ trường tồn → không đồng bộ, không đọc stores
    const n0 = f.log.length; const docsReadBefore = JSON.stringify(f.FS[INV + '__gg02/A']);
    await f.fstore.collection(INV).doc('A').update({ currentStock: 5, updatedAt: 'y', 'lastCount.suspect': false });
    await f.fstore.collection(INV).doc('A').set({ locationStock: { k: 1 } }, { merge: true });
    ok(f.log.slice(n0).every(e => !/__gg0/.test(e[1])) && JSON.stringify(f.FS[INV + '__gg02/A']) === docsReadBefore, 'ghi chỉ trường tồn (engine) → không ghi sang quán khác');
    await f.fstore.collection(PI).doc('P').update({ batchYield: 1200 });
    ok(lay(f, PI + '__gg02/P').batchYield === 1200 && lay(f, PI + '__gg02/P').currentStock === 7, 'BTP cũng đồng bộ — tồn gg02 giữ nguyên');
    // update dạng ('field', value)
    await f.fstore.collection(INV).doc('B').update('minStock', 4);
    ok(lay(f, INV + '__gg02/B').minStock === 4, "update('trường', giá trị) cũng đồng bộ");
    // thêm (add) → gg02 có món mới, tồn 0, không chép tồn đầu
    const r = await f.fstore.collection(INV).add({ name: 'Trà', unit: 'g', currentStock: 250, costPerUnit: 5 });
    const t2 = lay(f, INV + '__gg02/' + r.id);
    ok(t2 && t2.name === 'Trà' && t2.currentStock === 0 && lay(f, INV + '/' + r.id).currentStock === 250, 'thêm món → gg02 có cùng mã món, tồn khởi đầu 0 (không chép tồn đầu của quán đang chạy)');
    // batch
    const b = f.fstore.batch();
    b.update(f.fstore.collection(INV).doc('B'), { name: 'Đường cát', updatedAt: 'z' });
    b.set(f.fstore.collection('price_history_gieogieo').doc('h1'), { price: 1 });
    await b.commit();
    ok(lay(f, INV + '__gg02/B').name === 'Đường cát' && lay(f, INV + '/B').name === 'Đường cát', 'batch.update danh mục → đồng bộ sau khi commit');
    // set merge
    await f.fstore.collection(INV).doc('B').set({ staffCounts: false, currentStock: 77 }, { merge: true });
    ok(lay(f, INV + '__gg02/B').staffCounts === false && lay(f, INV + '__gg02/B').currentStock === 0, 'set merge → đồng bộ trường danh mục, bỏ trường tồn');
    // xoá — gg02 còn tồn A (80) → chặn, quán đang chạy KHÔNG bị xoá
    let loi = ''; try { await f.fstore.collection(INV).doc('A').delete(); } catch (e) { loi = e.message; }
    ok(/Gieo 2 còn tồn 80/.test(loi) && f.FS[INV + '/A'] && f.FS[INV + '__gg02/A'], 'xoá món khi quán khác còn tồn → chặn trước, không xoá ở đâu cả');
    let loiB = ''; try { const bb = f.fstore.batch(); bb.delete(f.fstore.collection(INV).doc('A')); await bb.commit(); } catch (e) { loiB = e.message; }
    ok(/còn tồn/.test(loiB) && f.FS[INV + '/A'], 'xoá trong batch cũng bị chặn trước khi commit');
    // xoá — gg02 hết tồn B → xoá cả hai
    await f.fstore.collection(INV).doc('B').delete();
    ok(!f.FS[INV + '/B'] && !f.FS[INV + '__gg02/B'], 'xoá món khi quán khác hết tồn → xoá ở mọi quán');
    // món thiếu ở gg02 → báo lỗi, không ném
    f.FS[INV + '/Z'] = { name: 'Lẻ', currentStock: 0 };
    let nem = false; try { await f.fstore.collection(INV).doc('Z').update({ name: 'Lẻ 2' }); } catch (e) { nem = true; }
    ok(!nem && loiBao.length === 1 && loiBao[0].loi[0].storeId === 'gg02' && /Đồng bộ danh mục/.test(loiBao[0].loi[0].error), 'món thiếu ở quán khác → không chặn quán đang chạy, báo lỗi kèm cách sửa');
    // collection khác danh mục — không đụng
    await f.fstore.collection('recipes_gieogieo').doc('R').set({ x: 1 });
    ok(!Object.keys(f.FS).some(k => k.startsWith('recipes_gieogieo__')), 'collection dùng chung không bị nhân bản');
  }
  // không bật catalogMirror (POS) → không đồng bộ
  {
    const f = makeFake({ fs: { 'stores_gieogieo/gg02': { catalogReady: true }, [INV + '/A']: { name: 'a' }, [INV + '__gg02/A']: { name: 'a' } }, rt: {} });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01' });
    await f.fstore.collection(INV).doc('A').update({ name: 'b' });
    ok(f.FS[INV + '__gg02/A'].name === 'a', 'POS (không bật catalogMirror) không đồng bộ danh mục');
  }

  // ── 2. 24 kịch bản thật ở gg01 + đồng bộ bật + có gg02 → không ghi gì sang gg02 ──
  {
    const lot = [], loiChay = [];
    for (const n of Object.keys(S)) {
      const spec = Object.assign({}, S[n], { seed: JSON.parse(JSON.stringify(S[n].seed)) });
      spec.seed.fs = Object.assign(spec.seed.fs || {}, { 'stores_gieogieo/gg02': { name: 'Gieo 2', code: 'XYZ567', catalogReady: true, active: true } });
      const g0 = await runWrapped('engine', S[n]);
      const r = await runWrapped('engine', spec, { quan: 'gg01', mirror: true });
      const ra = (r.fake ? r.fake.log : r.log).filter(e => /__gg02/.test(e[1]));
      if (ra.length) lot.push(n + ': ' + ra.slice(0, 2).map(e => e.join(' ')).join(' | '));
      if ((r.error || null) !== (g0.error || null)) loiChay.push(n + ': ' + r.error);
    }
    ok(!lot.length, 'gg01 + đồng bộ bật: ' + Object.keys(S).length + ' kịch bản (bán, kho, sơ chế, kiểm kê…) không ghi gì sang gg02' + (lot.length ? ' — ' + lot.join(' ; ') : ''));
    ok(!loiChay.length, 'gg01 + đồng bộ bật: kịch bản chạy như cũ' + (loiChay.length ? ' — ' + loiChay.join(' ; ') : ''));
  }

  // ── 3. Tạo quán mới + kiểm lệch ──
  {
    const { f, G } = quan({ ['refill_rules_gieogieo/r1']: { itemId: 'A', min: 2 }, ['storage_locations_gieogieo/l1']: { name: 'Kệ' } });
    const dem = await G.seedNewStore('gg05');
    const a5 = f.FS[INV + '__gg05/A'];
    ok(a5 && a5.name === 'Sữa' && a5.currentStock === 0 && !a5.lastCount && f.FS[PI + '__gg05/P'].batchYield === 1000 && f.FS[PI + '__gg05/P'].currentStock === 0, 'quán mới: chép danh mục NL + BTP (cùng mã món), tồn 0, không chép trường tồn');
    ok(f.FS['refill_rules_gieogieo__gg05/r1'] && f.FS['storage_locations_gieogieo__gg05/l1'] && dem[INV] === 2, 'quán mới: chép sẵn quy tắc refill + vị trí kho (sửa lại sau)');
    let loi = ''; try { await G.seedNewStore('gg01'); } catch (e) { loi = e.message; } ok(/không hợp lệ/.test(loi), 'không tạo đè lên quán đang chạy');
    // lệch: gg02 sai tên A, thiếu một món, thừa một món
    f.FS[INV + '__gg02/A'].name = 'SAI'; delete f.FS[INV + '__gg02/B']; f.FS[INV + '__gg02/Q'] = { name: 'thừa', currentStock: 1 };
    const d = await G.catalogDiff(false);
    const co = (k, id) => d.some(x => x.storeId === 'gg02' && x.kind === k && x.id === id);
    ok(co('lech', 'A') && co('thieu', 'B') && co('thua', 'Q') && !d.some(x => x.storeId === 'gg03'), 'kiểm lệch: thấy lệch / thiếu / thừa; bỏ qua quán chưa sẵn');
    ok(f.FS[INV + '__gg02/A'].name === 'SAI', 'kiểm lệch (không áp dụng) không ghi gì');
    await G.catalogDiff(true);
    ok(f.FS[INV + '__gg02/A'].name === 'Sữa' && f.FS[INV + '__gg02/A'].currentStock === 80 && f.FS[INV + '__gg02/B'].currentStock === 0 && f.FS[INV + '__gg02/Q'], 'sửa lệch: chép trường danh mục, giữ tồn, thêm món thiếu (tồn 0), KHÔNG xoá món thừa');
    ok(!(await G.catalogDiff(false)).filter(x => x.kind !== 'thua').length, 'sau khi sửa: hết lệch');
  }

  // ── 4. Chưa đăng nhập cửa hàng ──
  {
    const f = makeFake({ fs: { 'recipes_gieogieo/R': { a: 1 }, 'stores_gieogieo/gg01': { code: 'ABC234' } }, rt: { menu_gieogieo: { m: 1 } } });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: null });
    const chan = fn => { try { fn(); return ''; } catch (e) { return e.message; } };
    ok(/chưa đăng nhập/.test(chan(() => f.fstore.collection('stock_transactions_gieogieo'))) && /chưa đăng nhập/.test(chan(() => f.fstore.collection(INV)))
      && /chưa đăng nhập/.test(chan(() => f.db.ref('orders_gieogieo/x'))) && /chưa đăng nhập/.test(chan(() => f.db.ref())), 'chưa đăng nhập: chặn dữ liệu riêng, danh mục, đơn RT, gốc RT');
    ok(!chan(() => f.fstore.collection('recipes_gieogieo')) && !chan(() => f.db.ref('menu_gieogieo')) && !chan(() => f.fstore.collection('stores_gieogieo')), 'chưa đăng nhập: vẫn đọc được dữ liệu dùng chung (menu, công thức, danh sách cửa hàng)');
    ok(G.daDangNhap() === false && G.storeId() === null && G.ckCode() === '', 'chưa đăng nhập: trạng thái đúng');
  }

  // ── 5. Gắn máy + tìm theo mã + mã CK ──
  {
    const kho = {}; const win = { localStorage: { getItem: k => (k in kho ? kho[k] : null), setItem: (k, v) => { kho[k] = String(v); }, removeItem: k => { delete kho[k]; } } };
    const G = nap(win);
    ok(G.binding.read() === null, 'máy mới: chưa gắn cửa hàng');
    G.binding.save({ storeId: 'gg02', code: 'XYZ567', name: 'Gieo 2' });
    ok(G.binding.read().storeId === 'gg02', 'gắn máy: nhớ cửa hàng');
    kho.gieo_store_v1 = '{"storeId":"GG02","code":"x"}'; ok(G.binding.read() === null, 'dữ liệu gắn hỏng → coi như chưa gắn');
    kho.gieo_store_v1 = 'không phải json'; ok(G.binding.read() === null, 'dữ liệu gắn không đọc được → coi như chưa gắn');
    G.binding.clear(); ok(G.binding.read() === null && !('gieo_store_v1' in kho), 'đăng xuất cửa hàng: xoá gắn máy');
    const { f, G: G2 } = quan();
    ok((await G2.findStoreByCode('xyz567')).id === 'gg02', 'tìm theo mã: không phân biệt hoa thường');
    ok(await G2.findStoreByCode('RTY678') === null, 'mã của cửa hàng đã đóng → không vào được');
    ok(await G2.findStoreByCode('ZZZZZZ') === null && await G2.findStoreByCode('AB') === null, 'mã sai / sai độ dài → không vào được');
    f.FS['stores_gieogieo/gg09'] = { code: 'XYZ567', active: true };
    ok(await G2.findStoreByCode('XYZ567') === null, 'mã trùng hai cửa hàng → không vào (tránh vào nhầm)');
    ok(G2.ckCode('gg01') === '01' && G2.ckCode('gg12') === '12' && G2.ckCode('x') === '', 'mã CK theo quán: gg02 → 02');
  }

  // ── 6. Mọi trường engine / POS / Quản lý ghi lên doc danh mục NL / BTP phải được PHÂN LOẠI ──
  // (STATE_FIELDS = tồn riêng từng quán, không đồng bộ; CATALOG_FIELDS = danh mục, đồng bộ / kiểm lệch).
  // Trường mới chưa phân loại → đỏ: trường tồn mà lọt vào đồng bộ sẽ chép số của quán này sang quán khác.
  {
    const acorn = require('acorn'), walk = require('acorn-walk');
    const G = nap();
    const STATE = new Set(G.STATE_FIELDS), CAT = new Set([].concat(...Object.values(G.CATALOG_FIELDS)));
    const META = new Set(['createdAt', 'createdBy']);   // chỉ lúc tạo — không cần đồng bộ / kiểm lệch
    const srcs = { 'unit_engine.v18.js': fs.readFileSync(path.join(ROOT, 'unit_engine.v18.js'), 'utf8') };
    for (const f of ['posgieo.html', 'quanlygieo.html']) srcs[f] = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
    const la = [], tong = { n: 0 };
    for (const [ten, src] of Object.entries(srcs)) {
      const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
      const init = {};
      walk.full(ast, n => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) init[n.id.name] = (init[n.id.name] || '') + ' ' + src.slice(n.init.start, n.init.end); });
      const laDanhMuc = t => /inventory_items|prep_items|_btpOwnerColl|itemState/.test(t + (/^[A-Za-z_$][\w$]*$/.test(t) ? (init[t] || '') : ''));
      walk.full(ast, n => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || !['update', 'set', 'add'].includes(n.callee.property.name)) return;
        let target, obj;
        if (n.arguments.length >= 2 && n.arguments[1].type === 'ObjectExpression') { target = src.slice(n.arguments[0].start, n.arguments[0].end); obj = n.arguments[1]; }
        else if (n.arguments[0] && n.arguments[0].type === 'ObjectExpression') { target = src.slice(n.callee.object.start, n.callee.object.end); obj = n.arguments[0]; }
        else return;
        if (!laDanhMuc(target)) return;
        for (const p of obj.properties) {
          if (p.type !== 'Property' || p.computed && !(p.key.type === 'TemplateLiteral')) continue;   // ...spread: nguồn đã quét ở chỗ dựng object
          const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'TemplateLiteral' ? p.key.quasis[0].value.cooked : String(p.key.value);
          const top = key.split('.')[0]; tong.n++;
          if (!STATE.has(top) && !CAT.has(top) && !META.has(top)) la.push(ten + ':' + n.loc.start.line + ' ' + key);
        }
      });
    }
    ok(tong.n > 40 && !la.length, 'mọi trường ghi lên danh mục NL / BTP (' + tong.n + ' chỗ) đều đã phân loại tồn / danh mục' + (la.length ? ' — CHƯA phân loại: ' + la.join(', ') : ''));
  }

  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e); process.exitCode = 1; });
