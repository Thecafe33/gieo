// ĐA CỬA HÀNG — Bước 3 (docs/KE_HOACH_DA_CUA_HANG.md): Quản lý xem từng quán / xem tất cả cửa hàng.
//  1. withStore chỉ chạy ở chế độ "Xem tất cả" (storeId null) — ở chế độ một quán bị từ chối (đổi quán giữa chừng
//     sẽ làm lệnh ghi đang chạy rơi sang quán khác).
//  2. Trong withStore: đọc / ghi đúng quán được chọn; ra khỏi withStore: mọi dữ liệu riêng lại bị chặn.
//  3. Hai withStore gọi cùng lúc chạy TUẦN TỰ (không xen nhau) — kể cả khi hàm trước lỗi.
//  4. check_paths: hai app phải nạp bản data_access MỚI NHẤT.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { makeFake } = require('./lib/fakefb');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail = 1; };
const ROOT = path.join(__dirname, '..');
const BAN = fs.readdirSync(ROOT).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();
const nap = () => { const m = { exports: {} }; new Function('window', 'module', fs.readFileSync(path.join(ROOT, BAN), 'utf8'))({}, m); return m.exports.GieoData; };
const TX = 'stock_transactions_gieogieo';

(async () => {
  ok(BAN !== 'data_access.v1.js', 'Bước 3 dùng bản data_access mới (' + BAN + ') — v1 đã deploy giữ nguyên để quay lui');
  // ── 1. Chế độ một quán: withStore bị từ chối ──
  {
    const f = makeFake({ fs: {}, rt: {} }); const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01' });
    let loi = ''; try { await G.withStore('gg02', async () => 1); } catch (e) { loi = e.message; }
    ok(/chỉ dùng ở chế độ xem tất cả/.test(loi) && G.xemTatCa() === false, 'chế độ một quán: withStore bị từ chối');
  }
  // ── 2 + 3. Chế độ xem tất cả ──
  {
    const f = makeFake({ fs: { [TX + '/a']: { q: 1 }, [TX + '__gg02/b']: { q: 2 }, 'inventory_items_gieogieo__gg02/X': { currentStock: 5 } }, rt: {} });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: null, catalogMirror: true });
    ok(G.xemTatCa() === true && G.storeId() === null, 'xem tất cả: cài với storeId null');
    const chan = () => { try { f.fstore.collection(TX); return false; } catch (e) { return /chưa đăng nhập/.test(e.message); } };
    ok(chan(), 'xem tất cả: ngoài withStore, dữ liệu riêng bị chặn');
    const d1 = await G.withStore('gg01', async () => (await f.fstore.collection(TX).get()).docs.map(d => d.id));
    const d2 = await G.withStore('gg02', async () => (await f.fstore.collection(TX).get()).docs.map(d => d.id));
    ok(JSON.stringify(d1) === '["a"]' && JSON.stringify(d2) === '["b"]', 'withStore đọc đúng sổ của từng quán (gg01 tên cũ, gg02 hậu tố)');
    ok(chan() && G.storeId() === null, 'ra khỏi withStore: trở lại chặn');
    let loi = ''; try { await G.withStore('GG02', async () => 1); } catch (e) { loi = e.message; }
    ok(/không hợp lệ/.test(loi), 'mã quán sai dạng bị từ chối');
    // tuần tự + hàm lỗi vẫn trả lại trạng thái
    const vet = [];
    const cham = ms => new Promise(r => setTimeout(r, ms));
    const p1 = G.withStore('gg01', async () => { vet.push('vao1:' + G.storeId()); await cham(20); vet.push('ra1:' + G.storeId()); throw new Error('lỗi thử'); }).catch(e => e.message);
    const p2 = G.withStore('gg02', async () => { vet.push('vao2:' + G.storeId()); await cham(5); vet.push('ra2:' + G.storeId()); return 'xong'; });
    const [r1, r2] = await Promise.all([p1, p2]);
    ok(vet.join(',') === 'vao1:gg01,ra1:gg01,vao2:gg02,ra2:gg02' && r1 === 'lỗi thử' && r2 === 'xong', 'hai withStore cùng lúc chạy tuần tự, không xen quán; hàm lỗi không kẹt khoá — ' + vet.join(','));
    ok(G.storeId() === null && chan(), 'sau lỗi: trạng thái trả về null');
    // Danh mục (C) đọc được trong withStore, đồng bộ không chạy ở chế độ chỉ xem (không ghi gì)
    const x = await G.withStore('gg02', async () => (await f.fstore.collection('inventory_items_gieogieo').doc('X').get()).data());
    ok(x && x.currentStock === 5, 'withStore đọc danh mục + tồn của quán đó');
  }
  // ── 4. check_paths: app phải nạp bản mới nhất ──
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-'));
    for (const f of fs.readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    const p = path.join(tmp, 'posgieo.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<script src="' + BAN + '"></script>', '<script src="data_access.v1.js"></script>'));
    let out = '', code = 0;
    try { out = cp.execFileSync('node', [path.join(ROOT, 'tools', 'check_paths.js')], { env: Object.assign({}, process.env, { CHECK_PATHS_ROOT: tmp }), encoding: 'utf8' }); }
    catch (e) { code = e.status; out = String(e.stdout); }
    ok(code === 1 && /bản data_access mới nhất/.test(out), 'check_paths: bắt app còn nạp data_access cũ');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // ── 5. Công cụ index cho quán mới: đủ 6 composite index quán hiện tại đang có (KE_HOACH_TOI_UU_DOC mục 3) ──
  {
    const { quet } = require('../tools/index_quan_moi.js');
    const ds = quet().map(x => x.coll + '|' + x.truong.map(t => t.join(':')).join(','));
    const can = ['stock_transactions_gieogieo|businessDate:ASC,createdAt:ASC', 'prep_transactions_gieogieo|businessDate:ASC,createdAt:ASC',
      'stock_transactions_gieogieo|type:ASC,businessDate:ASC', 'prep_transactions_gieogieo|type:ASC,businessDate:ASC',
      'stock_transactions_gieogieo|itemId:ASC,createdAt:DESC', 'prep_transactions_gieogieo|prepId:ASC,createdAt:DESC'];
    const thieu = can.filter(x => !ds.includes(x));
    ok(!thieu.length, 'tools/index_quan_moi.js: đủ 6 index của quán hiện tại (' + ds.length + ' index)' + (thieu.length ? ' — thiếu ' + thieu.join(', ') : ''));
    let out = ''; try { out = cp.execFileSync('node', [path.join(ROOT, 'tools', 'index_quan_moi.js'), 'gg02', '--json'], { encoding: 'utf8' }); } catch (e) { out = ''; }
    let j = null; try { j = JSON.parse(out); } catch (e) {}
    ok(j && j.indexes.length === ds.length && j.indexes.every(x => /__gg02$/.test(x.collectionGroup)), 'tools/index_quan_moi.js gg02 --json: firestore.indexes.json đúng tên collection của quán mới');
  }
  // ── 6. Nhật ký mở két tay (POS) — dữ liệu riêng từng quán ──
  {
    const G = nap();
    ok(G.REG.fs.cash_drawer_logs_gieogieo === 'S' && G.fsPath('cash_drawer_logs_gieogieo', 'gg02') === 'cash_drawer_logs_gieogieo__gg02', 'cash_drawer_logs_gieogieo: riêng từng quán (gg02 → __gg02)');
  }
  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e); process.exitCode = 1; });
