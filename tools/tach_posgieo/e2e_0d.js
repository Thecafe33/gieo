// e2e bước 0D/0E kế hoạch tách posgieo: posgieo.html THẬT nạp js/posgieo/pos_ui.v1.js trong Chromium.
//   node tools/tach_posgieo/e2e_0d.js
// Firebase / CDN thay bằng bản giả tối thiểu (không mạng ngoài). Máy CHƯA gắn quán → app dừng ở màn nhập mã (chốt dừng).
// Kiểm: (1) HTTP bình thường; (2) lần tải đầu 404 → nạp lại ?r=1; (3) lần đầu máy chủ trả HTML thay JS → nạp lại;
// (4) file ném lỗi giữa chừng (dấu 'dang') → KHÔNG nạp lại; (5) mở bằng file://; (6) bản thử posgieo_thu.html (?b=).
// 0E: (7) nạp lại cũng hỏng → màn đỏ, không chạy tiếp (không màn nhập mã); (4b) chạy dở → màn đỏ;
// (8) H1: hai tab cùng máy, tab kia đổi cửa hàng → tab này phủ màn «đã đổi cửa hàng»; đổi khoá khác → không phủ.
'use strict';
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromiumPath, serveFile } = require(path.join(ROOT, 'tests/lib/e2e'));
const FB_STUB = `(function(){
  var mk=function(){var o={};['collection','doc','where','orderBy','limit','ref','child','orderByChild','equalTo','limitToLast','startAt','endAt'].forEach(function(k){o[k]=function(){return o};});
    o.get=function(){return Promise.resolve({docs:[],empty:true,exists:false,forEach:function(){},val:function(){return null},data:function(){return {}}})};
    o.once=o.get;o.on=function(){};o.off=function(){};o.onSnapshot=function(){return function(){}};o.set=o.update=o.delete=o.remove=o.push=function(){return Promise.resolve()};
    o.batch=function(){return {set:function(){},update:function(){},delete:function(){},commit:function(){return Promise.resolve()}}};
    o.runTransaction=function(f){return Promise.resolve()};o.enablePersistence=function(){return Promise.resolve()};o.settings=function(){};return o;};
  var fs_=mk(),db_=mk();
  window.firebase={apps:[],initializeApp:function(){this.apps.push({})},database:function(){return db_},firestore:function(){return fs_},
    auth:function(){return {onAuthStateChanged:function(){},signInWithEmailAndPassword:function(){return new Promise(function(){})},currentUser:null}},storage:function(){return {ref:function(){return {}}}}};
  window.firebase.firestore.FieldValue={serverTimestamp:function(){return 0},increment:function(n){return n},arrayUnion:function(){},arrayRemove:function(){},delete:function(){}};
  window.firebase.firestore.FieldPath={documentId:function(){return '__name__'}};
  window.firebase.database.ServerValue={TIMESTAMP:0,increment:function(n){return n}};
})();`;
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

(async () => {
  const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!serveFile(ROOT, u.pathname, res)) { res.statusCode = 404; res.end('404'); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
  async function mo(url, ghiDe, ctx) {   // ghiDe: [{lan, status, body}] — thay phản hồi pos_ui theo lượt
    const page = await (ctx || b).newPage(); const loi = []; const xin = [];
    page.on('pageerror', e => loi.push(e.message));
    await page.route('**/*', async r => {
      const u = r.request().url();
      if (/gstatic\.com\/firebasejs\/[\d.]+\/firebase-app-compat\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: FB_STUB });
      if (/^https?:\/\/(www\.gstatic\.com|cdn\.jsdelivr\.net)/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '' });
      if (/js\/posgieo\/pos_ui\.v1\.js/.test(u)) {
        xin.push(u); const g = ghiDe && ghiDe[xin.length - 1];
        if (g) return r.fulfill({ status: g.status || 200, contentType: g.type || 'text/javascript', body: g.body });
      }
      if (u.startsWith(base) || u.startsWith('file:')) return r.continue();
      return r.abort();
    });
    await page.goto(url, { waitUntil: 'load' }).catch(e => loi.push('goto: ' + e.message));
    await page.waitForTimeout(400);
    const tt = await page.evaluate(() => ({ ui: window.PosGieoMods && window.PosGieoMods.ui, esc: typeof escHtmlPos === 'function' ? escHtmlPos('<b>&') : null, login: !!document.getElementById('posStoreLogin'), modThieu: !!document.getElementById('posModThieu'), thu: !!(window.GieoThu && GieoThu.active) }));
    if (!ctx) await page.close();
    return Object.assign(tt, { loi, xin, page });
  }
  const chuanLoi = l => l.filter(m => !/chưa đăng nhập cửa hàng|app dừng/.test(m));   // throw có chủ đích ở chốt dừng

  let t = await mo(base + '/posgieo.html');
  chk(t.ui === true && t.esc === '&lt;b&gt;&amp;' && t.xin.length === 1, '(1) HTTP: pos_ui.v1.js nạp 1 lần, PosGieoMods.ui = true, escHtmlPos chạy đúng');
  chk(t.login, '(1) máy chưa gắn quán → màn nhập mã quán hiện (chốt dừng giữ nguyên)');
  chk(!chuanLoi(t.loi).length, '(1) không lỗi JS ngoài throw có chủ đích ở chốt dừng' + (chuanLoi(t.loi).length ? ': ' + chuanLoi(t.loi).join(' | ') : ''));

  t = await mo(base + '/posgieo.html', [{ status: 404, type: 'text/html', body: 'Not Found' }]);
  chk(t.ui === true && t.esc && t.xin.length === 2 && /\?r=1$/.test(t.xin[1]), '(2) lần đầu 404 → nạp lại đúng một lần (?r=1) → chạy được');

  t = await mo(base + '/posgieo.html', [{ status: 200, type: 'text/html', body: '<!doctype html><html><body>trang lỗi</body></html>' }]);
  chk(t.ui === true && t.esc && t.xin.length === 2, '(3) lần đầu máy chủ trả HTML thay JS (lỗi cú pháp, chưa khai báo gì) → nạp lại → chạy được');

  const DO = "(window.PosGieoMods = window.PosGieoMods || {}).ui = 'dang';\nconst X_DO = 1;\nthrow new Error('lỗi giữa chừng');\nPosGieoMods.ui = true;";
  t = await mo(base + '/posgieo.html', [{ body: DO }, { body: DO }]);
  chk(t.ui === 'dang' && t.xin.length === 1, "(4) file chạy dở (dấu 'dang') → KHÔNG nạp lại (tránh khai báo let/const lần hai)");
  chk(!t.loi.some(m => /already been declared/.test(m)), '(4) không có lỗi "Identifier has already been declared"');
  chk(t.modThieu && !t.login, '(4b) 0E: module chạy dở → màn đỏ «Chưa tải được», KHÔNG vào màn nhập mã / nghiệp vụ');

  t = await mo(base + '/posgieo.html', [{ status: 404, type: 'text/html', body: 'x' }, { status: 404, type: 'text/html', body: 'x' }]);
  chk(t.ui === undefined && t.modThieu && !t.login && t.xin.length === 2, '(7) 0E: nạp lại cũng hỏng → màn đỏ + Tải lại, dừng app (không chạy nghiệp vụ nửa chừng)');

  {   // (8) H1 — hai tab cùng máy (chung localStorage)
    const ctx = await b.newContext();
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('gieo_store_v1')) localStorage.setItem('gieo_store_v1', JSON.stringify({ storeId: 'gg01', name: 'Gieo 1' })); } catch (e) {} });
    const a = await mo(base + '/posgieo.html', null, ctx);
    chk(!a.login && !a.modThieu, '(8) tab A đã gắn gg01 → qua chốt dừng (không màn nhập mã)');
    const pb = await ctx.newPage(); await pb.goto(base + '/js/posgieo/pos_ui.v1.js');
    await pb.evaluate(() => localStorage.setItem('khoa_khac', '1')); await a.page.waitForTimeout(300);
    chk(!(await a.page.evaluate(() => !!document.getElementById('posStoreDoi'))), '(8) tab kia đổi khoá khác → tab A không bị phủ');
    await pb.evaluate(() => localStorage.setItem('gieo_store_v1', JSON.stringify({ storeId: 'gg02', name: 'Gieo 2' }))); await a.page.waitForTimeout(300);
    chk(await a.page.evaluate(() => !!document.getElementById('posStoreDoi')), '(8) H1: tab kia đổi cửa hàng gg01 → gg02 → tab A phủ màn «Máy đã đổi cửa hàng ở cửa sổ khác»');
    await ctx.close();
  }

  t = await mo('file://' + path.join(ROOT, 'posgieo.html'));
  chk(t.ui === true && t.esc === '&lt;b&gt;&amp;', '(5) mở bằng file:// → đường tương đối js/posgieo/… tải được');

  if (fs.existsSync(path.join(ROOT, 'posgieo_thu.html'))) {
    t = await mo(base + '/posgieo_thu.html');
    chk(t.ui === true && t.esc && t.xin.length === 1 && /\?b=[0-9a-f]{10}$/.test(t.xin[0]), '(6) bản thử: pos_ui.v1.js nạp kèm ?b=<mã nội dung>, chạy được');
    chk(t.thu, '(6) bản thử bật chế độ thử (GieoThu.active)');
  }
  await b.close(); server.close();
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
