// tools/dem_luot_doc.js — bộ đếm lượt đọc dán vào Console (T1 kế hoạch tối ưu đọc). Firestore giả tối thiểu.
const { cai } = require('../tools/dem_luot_doc.js');
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok ' : 'FAIL ') + msg); if (!cond) fail = 1; };

// Lớp giả có cùng hình dạng compat: CollectionReference kế thừa Query.
const meta = (fromCache, pending) => ({ fromCache: !!fromCache, hasPendingWrites: !!pending });
let nghe = [];
class Query {
  constructor(path, docs) { this._path = path; this._docs = docs || []; this._delegate = { _query: { path: { canonicalString: () => path } } }; }
  get(opts) { const fc = opts && opts.source === 'cache'; return Promise.resolve({ size: this._docs.length, metadata: meta(fc) }); }
  onSnapshot(...args) { const cb = typeof args[0] === 'function' ? args[0] : (typeof args[1] === 'function' ? args[1] : (args[0].next ? args[0].next.bind(args[0]) : args[1].next.bind(args[1]))); nghe.push(cb); return () => {}; }
}
class CollectionReference extends Query {}
class DocumentReference {
  constructor(path) { this.path = path; this.parent = { path: path.split('/').slice(0, -1).join('/') }; }
  get(opts) { return Promise.resolve({ exists: true, metadata: meta(opts && opts.source === 'cache') }); }
  onSnapshot(cb) { nghe.push(cb); return () => {}; }
}
class Transaction { get(ref) { return Promise.resolve({ exists: true, metadata: meta(false) }); } }
const ns = { Query, CollectionReference, DocumentReference, Transaction };
const goc = { qGet: Query.prototype.get, dGet: DocumentReference.prototype.get, tGet: Transaction.prototype.get, qSnap: Query.prototype.onSnapshot, dSnap: DocumentReference.prototype.onSnapshot };

let stackGia = '';
let daLuu = null;
let clock = 1000;
const env = { now: () => clock, ngay: () => '2026-10-05', stack: () => stackGia, man: () => 'QL:today', luu: s => { daLuu = s ? JSON.parse(JSON.stringify(s)) : null; }, docLuu: () => daLuu };
const st = (n) => 'Error\n' + n;
const log = console.log, table = console.table; console.table = () => {};

(async () => {
  const D = cai(ns, env);

  stackGia = st('    at __dldQueryGet (https://the-cafe-33.firebaseapp.com/tools/x.js:1:1)\n    at computeLedgerRealMetrics (https://the-cafe-33.firebaseapp.com/quanlygieo.html:14720:5)\n    at renderToday (https://the-cafe-33.firebaseapp.com/quanlygieo.html:13240:3)');
  await new CollectionReference('stock_transactions_gieogieo', new Array(500).fill(0)).get();
  stackGia = st('    at https://the-cafe-33.web.app/unit_engine.v18.js:5146:120\n    at Array.map (<anonymous>)\n    at dutyLoadStockTx (https://the-cafe-33.web.app/unit_engine.v18.js:5146:80)');
  await new Query('stock_transactions_gieogieo', []).get();            // rỗng vẫn 1 lượt
  await new Query('stock_transactions_gieogieo', [1, 2, 3]).get({ source: 'cache' });   // cache: 0
  stackGia = st('    at lookupCustomer (https://the-cafe-33.web.app/posgieo.html:23062:3)');
  await new DocumentReference('customers/0901234567').get();
  stackGia = st('    at loyaltyAddStamps (https://the-cafe-33.web.app/posgieo.html:23600:9)');
  await new Transaction().get(new DocumentReference('customers/0901234567'));

  const s = D._st();
  ok(s.tong === 503, 'tổng = 500 + 1 (rỗng) + 0 (cache) + 1 (doc) + 1 (tx) → ' + s.tong);
  const rows = Object.values(s.dong);
  const r1 = rows.find(r => r.ham === 'computeLedgerRealMetrics');
  ok(r1 && r1.luot === 500 && r1.coll === 'stock_transactions_gieogieo' && r1.noi === 'quanlygieo.html:14720', 'gắn đúng hàm + nơi gọi dù tên miền có chữ firebase');
  const r2 = rows.find(r => r.ham === 'dutyLoadStockTx');
  ok(r2 && r2.luot === 1 && r2.noi === 'unit_engine.v18.js:5146', 'hàm ẩn danh trong map → lấy tên hàm bao ngoài, nơi gọi = dòng ẩn danh');
  ok(rows.some(r => r.kieu === 'tx.get' && r.coll === 'customers' && r.ham === 'loyaltyAddStamps'), 'transaction.get đếm theo collection của tài liệu');
  ok(s.man['QL:today'] === 503, 'cộng theo màn');

  // Listener truy vấn: lần đầu từ cache 0, lần đầu từ máy chủ = size, sau đó = số thêm/sửa; bản chờ ghi 0.
  stackGia = st('    at _posLiveSubscribe (https://x/posgieo.html:20075:7)');
  nghe = [];
  new Query('recipes_gieogieo').onSnapshot({ next: () => {} });
  const cbQ = nghe[0];
  const snapQ = (size, fc, pending, changes) => ({ size, metadata: meta(fc, pending), docChanges: () => changes || [] });
  cbQ(snapQ(40, true));
  cbQ(snapQ(40, false));
  cbQ(snapQ(40, false, false, [{ type: 'modified' }, { type: 'removed' }]));
  cbQ(snapQ(40, false, true, [{ type: 'modified' }]));
  const rq = Object.values(D._st().dong).find(r => r.kieu === 'nghe.query');
  ok(rq && rq.luot === 41 && rq.lan === 2, 'listener truy vấn: 40 lần đầu + 1 sửa; bỏ bản cache, bản chờ ghi, dòng xoá → ' + (rq && rq.luot));

  // Listener tài liệu, dạng (next, err)
  stackGia = st('    at _watchDayClosedStatus (https://x/posgieo.html:7229:5)');
  nghe = [];
  new DocumentReference('daily_closings_gieogieo/2026-10-05').onSnapshot(() => {}, () => {});
  nghe[0]({ metadata: meta(false) }); nghe[0]({ metadata: meta(true) }); nghe[0]({ metadata: meta(false) });
  const rd = Object.values(D._st().dong).find(r => r.kieu === 'nghe.doc');
  ok(rd && rd.luot === 2, 'listener tài liệu: 2 bản từ máy chủ, bỏ bản cache');

  // Mốc: chỉ tính phần phát sinh sau mốc trước
  log.call(console, '--- (in của moc bên dưới là bình thường)');
  const m0 = D.moc('bắt đầu');
  stackGia = st('    at renderThangKet (https://x/quanlygieo.html:18487:3)');
  await new Query('stock_transactions_gieogieo', new Array(7).fill(0)).get();
  clock += 30000;
  const m1 = D.moc('mở Tháng kết');
  ok(m0.luot === 546 && m1.luot === 7 && m1.giay === 30 && m1.top[0].ham === 'renderThangKet', 'moc: 7 lượt trong 30 giây, đúng hàm');

  // Lưu trong máy → cài lại (app tải lại) đếm tiếp; khác ngày thì bắt đầu lại
  D.tat();
  ok(Query.prototype.get === goc.qGet && DocumentReference.prototype.get === goc.dGet && Transaction.prototype.get === goc.tGet
    && Query.prototype.onSnapshot === goc.qSnap && DocumentReference.prototype.onSnapshot === goc.dSnap, 'tat() trả lại nguyên hàm gốc');
  ok(CollectionReference.prototype.get === goc.qGet, 'CollectionReference dùng lại Query.get gốc');
  const D2 = cai(ns, env);
  ok(D2._st().tong === 553, 'cài lại cùng ngày: đếm tiếp từ số đã lưu');
  D2.tat();
  const D3 = cai(ns, { ...env, ngay: () => '2026-10-06' });
  ok(D3._st().tong === 0, 'sang ngày mới: bắt đầu từ 0');
  D3.datLai(); ok(daLuu === null, 'datLai xoá bản lưu');
  D3.tat();

  // Lỗi đọc: không đếm, lỗi vẫn ném ra cho app như cũ
  // Lời gọi gốc bị từ chối (vd thiếu quyền) → bọc không đếm, lỗi vẫn tới app.
  const goiGoc = goc.qGet;
  Query.prototype.get = function () { return Promise.reject(new Error('permission-denied')); };
  const truoc = env.docLuu() ? env.docLuu().tong : 0;
  const D5 = cai(ns, env);
  let loi = null;
  try { await new Query('stock_transactions_gieogieo', [1]).get(); } catch (e) { loi = e; }
  ok(loi && loi.message === 'permission-denied' && D5._st().tong === truoc, 'lỗi đọc: không đếm, lỗi vẫn trả về app');
  D5.tat();
  Query.prototype.get = goiGoc;

  // Bộ đếm tự gặp lỗi (đọc stack / màn / lưu máy đều ném lỗi) → app vẫn đọc bình thường, nhận đúng snapshot.
  const hong = () => { throw new Error('hỏng'); };
  const D6 = cai(ns, { now: () => clock, ngay: () => 'x', stack: hong, man: hong, luu: hong, docLuu: hong });
  const snapQ1 = await new Query('a', [1, 2]).get();
  const snapD1 = await new DocumentReference('b/c').get();
  let nhanNghe = 0; nghe = [];
  new Query('a').onSnapshot(s => { nhanNghe++; });
  nghe[0]({ size: 1, metadata: meta(false) });
  ok(snapQ1.size === 2 && snapD1.exists === true && nhanNghe === 1, 'bộ đếm lỗi nội bộ: app vẫn nhận đúng kết quả đọc + listener');
  D6.tat();

  // Bản đo sinh từ bản thật: chỉ thêm đúng 1 dòng nạp bộ đếm (trước initializeApp) + tiêu đề [ĐO].
  const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dem-'));
  cp.execFileSync('node', [path.join(__dirname, '..', 'tools', 'tao_ban_dem.js'), tmp]);
  for (const [that, doLuong] of [['posgieo.html', 'posgieo_dem.html'], ['quanlygieo.html', 'quanlygieo_dem.html']]) {
    const a = fs.readFileSync(path.join(__dirname, '..', that), 'utf8').split('\n');
    const b = fs.readFileSync(path.join(tmp, doLuong), 'utf8').split('\n');
    const them = b.filter(l => /<!-- \[BẢN ĐO\]/.test(l));
    const conLai = b.filter(l => !/<!-- \[BẢN ĐO\]/.test(l)).map(l => l.replace('<title>[ĐO] ', '<title>'));
    const iDem = b.findIndex(l => /<script src="dem_luot_doc\.v1\.js/.test(l)), iInit = b.findIndex(l => /firebase\.initializeApp\(/.test(l));
    ok(them.length === 2 && conLai.join('\n') === a.join('\n') && iDem >= 0 && iDem < iInit && /if \(!window\.demLuotDoc\)/.test(b[iDem + 1]),
      doLuong + ' = ' + that + ' + dòng nạp bộ đếm (trước initializeApp) + dòng báo đỏ khi bộ đếm không chạy + tiêu đề');
  }
  ok(fs.existsSync(path.join(tmp, 'dem_luot_doc.v1.js')) && fs.readFileSync(path.join(tmp, 'dem_luot_doc.v1.js'), 'utf8') === fs.readFileSync(path.join(__dirname, '..', 'tools', 'dem_luot_doc.js'), 'utf8'), 'dem_luot_doc.v1.js = tools/dem_luot_doc.js');
  fs.rmSync(tmp, { recursive: true, force: true });

  console.table = table;
  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e); process.exitCode = 1; });
