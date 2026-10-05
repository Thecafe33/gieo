// ĐA CỬA HÀNG — Bước 1 (docs/KE_HOACH_DA_CUA_HANG.md): lớp đường dẫn data_access.v1.js.
//  1. Quy tắc tên: quán hiện tại gg01 → tên cũ y hệt; quán khác → dữ liệu riêng (S) thêm '__{storeId}', dùng chung giữ tên.
//  2. ĐỒNG NHẤT gg01: 24 kịch bản giao diện thật (POS + Quản lý + engine) cho kết quả GIỐNG TỪNG BYTE khi có / không có lớp.
//  3. CÁCH LY gg02: cùng 24 kịch bản chạy ở quán gg02 — dữ liệu riêng của quán hiện tại (mồi) không đổi, không lượt ghi
//     nào vào collection / gốc RT riêng mà thiếu hậu tố; không ghi dữ liệu dùng chung (danh mục theo quán — Bước 2).
//  4. Chế độ thử + gg02: mọi lượt ghi vẫn trong vùng thử.
//  5. Chốt chặn tools/check_paths.js: đạt trên code hiện tại; bắt được tên chưa đăng ký.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { runWrapped } = require('./lib/wrap_harness');
const { S } = require('./snapshot_wrap.test.js');
const { makeFake } = require('./lib/fakefb');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail = 1; };
const ROOT = path.join(__dirname, '..');
const nap = () => { const m = { exports: {} }; new Function('window', 'module', fs.readFileSync(path.join(ROOT, 'data_access.v1.js'), 'utf8'))({}, m); return m.exports.GieoData; };

(async () => {
  // ── 1. Quy tắc tên ──
  {
    const G = nap();
    const ten = Object.keys(G.REG.fs), goc = Object.keys(G.REG.rt);
    ok(ten.every(n => G.fsPath(n, 'gg01') === n) && goc.every(n => G.rtPath(n + '/a/b', 'gg01') === n + '/a/b'), 'gg01: ' + ten.length + ' collection + ' + goc.length + ' gốc RT giữ nguyên tên');
    ok(G.fsPath('stock_transactions_gieogieo', 'gg02') === 'stock_transactions_gieogieo__gg02' && G.fsPath('daily_closings_gieogieo/2026-10-05', 'gg02') === 'daily_closings_gieogieo__gg02/2026-10-05', 'gg02: dữ liệu riêng thêm hậu tố, giữ phần sau đường dẫn');
    ok(G.rtPath('active_units_gieogieo/X/A', 'gg02') === 'active_units_gieogieo__gg02/X/A' && G.rtPath('/orders_gieogieo/thang10', 'gg03') === 'orders_gieogieo__gg03/thang10', 'gg02/gg03: gốc RT riêng (không lồng dưới gốc quán hiện tại)');
    ok(['recipes_gieogieo', 'employees_gieogieo', 'customers'].every(n => G.fsPath(n, 'gg02') === n)
      && ['menu_gieogieo', 'bank_confirmations', '.info'].every(n => G.rtPath(n, 'gg02') === n), 'gg02: công thức, nhân viên, khách, menu, CK, .info dùng chung');
    ok(G.fsPath('inventory_items_gieogieo/X', 'gg02') === 'inventory_items_gieogieo__gg02/X' && G.fsPath('prep_items_gieogieo', 'gg02') === 'prep_items_gieogieo__gg02'
      && G.fsPath('inventory_items_gieogieo', 'gg01') === 'inventory_items_gieogieo', 'Bước 2: danh mục NL / BTP theo quán (C) — gg01 tên cũ, gg02 bản riêng');
    let loi = ''; try { G.fsPath('ten_la_gieogieo', 'gg02'); } catch (e) { loi = e.message; }
    ok(/chưa đăng ký/.test(loi) && G.fsPath('ten_la_gieogieo', 'gg01') === 'ten_la_gieogieo', 'tên lạ: gg02 báo lỗi; gg01 đi tiếp như cũ');
    ok(['customers', 'bank_confirmations'].every(n => (G.REG.fs[n] || G.REG.rt[n]) === 'X'), 'customers, bank_confirmations: loại X (dùng chung XOFA / The Cafe 33)');
  }
  // install: chặn cấu hình sai
  {
    const thu = (o) => { const G = nap(); const f = makeFake({}); try { G.install(Object.assign({ fstore: f.fstore, db: f.db }, o)); return 'OK'; } catch (e) { return e.message; } };
    ok(thu({ storeId: 'gg01' }) === 'OK', 'install gg01');
    ok(thu({ storeId: 'gg02' }) === 'OK' && thu({ storeId: null }) === 'OK', 'install gg02 / chưa đăng nhập (null)');
    ok(/không hợp lệ/.test(thu({ storeId: 'GG02' })) && /không hợp lệ/.test(thu({ storeId: 'x' })), 'mã cửa hàng sai dạng bị chặn');
    const G = nap(); const f = makeFake({}); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg02' });
    let a = '', b = ''; try { f.db.ref(); } catch (e) { a = e.message; } try { f.db.ref(''); } catch (e) { b = e.message; }
    ok(/gốc/.test(a) && /gốc/.test(b), 'gg02: truy cập gốc Realtime DB bị chặn');
    let c = ''; try { G.install({ fstore: f.fstore, db: f.db, storeId: 'gg02' }); } catch (e) { c = e.message; }
    ok(/đã cài/.test(c), 'không cài hai lần');
  }

  // ── 2. Đồng nhất gg01 trên mọi kịch bản giao diện ──
  {
    const lech = [];
    for (const n of Object.keys(S)) {
      const a = await runWrapped('engine', S[n]), b = await runWrapped('engine', S[n], { quan: 'gg01' });
      if (JSON.stringify(a) !== JSON.stringify(b)) lech.push(n);
    }
    ok(!lech.length, 'gg01: ' + Object.keys(S).length + ' kịch bản POS + Quản lý giống từng byte khi có lớp đường dẫn' + (lech.length ? ' — lệch: ' + lech.join(', ') : ''));
  }

  // ── 3. Cách ly gg02 ──
  {
    const loiLot = [], doiGoc = [], loiChay = [], chung = new Set();
    let soGhi = 0;
    for (const n of Object.keys(S)) {
      const g1 = await runWrapped('engine', S[n]);
      const r = await runWrapped('engine', S[n], { quan: 'gg02' });
      if (r.quan.ghiLot.length) loiLot.push(n + ': ' + r.quan.ghiLot.slice(0, 2).join(' | '));
      if (r.quan.gocDoi) doiGoc.push(n);
      if ((r.error || null) !== (g1.error || null)) loiChay.push(n + ': ' + r.error);
      r.quan.ghiChung.forEach(x => chung.add(x));
      soGhi += r.quan.soGhi;
    }
    ok(soGhi > 50, 'gg02: các kịch bản có ghi dữ liệu thật sự (' + soGhi + ' lượt ghi)');
    ok(!loiLot.length, 'gg02: không lượt ghi nào vào chỗ riêng của quán hiện tại' + (loiLot.length ? ' — ' + loiLot.join(' ; ') : ''));
    ok(!doiGoc.length, 'gg02: dữ liệu riêng của quán hiện tại không đổi một byte' + (doiGoc.length ? ' — ' + doiGoc.join(', ') : ''));
    ok(!loiChay.length, 'gg02: kịch bản chạy như ở gg01 (không lỗi mới)' + (loiChay.length ? ' — ' + loiChay.join(' ; ') : ''));
    console.log('     dữ liệu dùng chung được ghi khi chạy gg02: ' + ([...chung].join(', ') || '(không)'));
    ok(!chung.size, 'gg02 (Bước 2): bán / kho / sơ chế ở quán khác KHÔNG ghi gì vào dữ liệu dùng chung (tồn nằm trong danh mục của quán)');
  }

  // ── 4. Chế độ thử + gg02 (bản _thu sau Bước 2) ──
  {
    const loi = [];
    for (const n of Object.keys(S)) {
      const r = await runWrapped('engine', S[n], { thu: true, quan: 'gg02' });
      if (r.thu.escaped.length || r.quan.ghiLot.length) loi.push(n + ': ' + r.thu.escaped.concat(r.quan.ghiLot).slice(0, 2).join(' | '));
    }
    ok(!loi.length, 'chế độ thử + gg02: mọi lượt ghi trong vùng thử, đúng hậu tố quán' + (loi.length ? ' — ' + loi.join(' ; ') : ''));
  }

  // ── 5. Chốt chặn check_paths ──
  {
    const chay = env => { try { return { code: 0, out: cp.execFileSync('node', [path.join(ROOT, 'tools', 'check_paths.js')], { env: Object.assign({}, process.env, env), encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };
    const r0 = chay({});
    ok(r0.code === 0 && /ĐƯỜNG DẪN SẠCH/.test(r0.out), 'check_paths: code hiện tại sạch');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paths-'));
    for (const f of fs.readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    const p = path.join(tmp, 'posgieo.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace("const CAKE_ACCOUNT_NO", "const __thuTen = () => fstore.collection('kho_moi_gieogieo');\nconst CAKE_ACCOUNT_NO"));
    const r1 = chay({ CHECK_PATHS_ROOT: tmp });
    ok(r1.code === 1 && /kho_moi_gieogieo/.test(r1.out), 'check_paths: bắt collection mới chưa đăng ký');
    fs.writeFileSync(p, fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8').replace(/if \(window\.GieoData\) GieoData\.install\(/, 'if (window.GieoData) GieoData.khongCai('));
    const r2 = chay({ CHECK_PATHS_ROOT: tmp });
    ok(r2.code === 1 && /GieoData\.install/.test(r2.out), 'check_paths: bắt app thiếu GieoData.install');
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e); process.exitCode = 1; });
