// Công cụ đã sửa cho thư mục js/posgieo/ (kế hoạch tách posgieo bước 0C, T1–T13) — mỗi ca CÀI LỖI vào fixture
// để chứng minh công cụ bắt được (không chỉ kiểm "chạy được"). Chưa có file js/posgieo thật nào trong repo.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let ok = true;
const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tachpg-'));
const w = (root, f, c) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), c); };
const run = (args, env) => spawnSync('node', args, { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
const RETRY = `<script id="pgUiRetry">if(!window.PosGieoMods||PosGieoMods.ui===undefined){document.write('<scr'+'ipt src="js/posgieo/pos_ui.v1.js?r=1"><\\/scr'+'ipt>');}</script>`;
const APP = (extra, body) => `<!doctype html><html><head><title>App</title></head><body>
<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js"></script>
<script src="data_access.v9.js"></script>
<script src="unit_engine.v21.js"></script>
${extra || ''}
<script>
if (!firebase.apps.length) firebase.initializeApp({});
const db = firebase.database();
const fstore = firebase.firestore();
${body || 'function chinh(){ return escHtmlPos("<b>"); }'}
</script>
</body></html>`;

// ── bộ đọc nguồn (T6/T7) ──
{
  const { nguonCua, maNoi } = require(path.join(ROOT, 'tools/tach_posgieo/nguon.js'));
  const r = tmp();
  w(r, 'a.html', APP('<script src="js/posgieo/pos_ui.v1.js"></script>\n' + RETRY + '\n<!-- <script>khongTinh()</script> -->'));
  w(r, 'js/posgieo/pos_ui.v1.js', "(window.PosGieoMods=window.PosGieoMods||{}).ui='dang';\nfunction escHtmlPos(s){return s}\nPosGieoMods.ui=true;\n");
  const ds = nguonCua('a.html', { root: r });
  chk(JSON.stringify(ds.map(x => x.file + ':' + x.kind)) === JSON.stringify(['js/posgieo/pos_ui.v1.js:src', 'a.html:inline']), 'nguồn: đúng thứ tự HTML; js/… là mã app; data_access/engine gốc KHÔNG tính; chú thích HTML bỏ qua');
  chk(/function escHtmlPos/.test(maNoi('a.html', { root: r })), 'nguồn: hàm ở js/posgieo tìm được theo tên');
  fs.rmSync(path.join(r, 'js/posgieo/pos_ui.v1.js'));
  let loi = ''; try { nguonCua('a.html', { root: r }); } catch (e) { loi = e.message; }
  chk(/không có file này/.test(loi), 'nguồn: HTML nạp js/… không tồn tại → báo lỗi (không bỏ qua)');
}

// ── T1–T3 tao_bo_deploy ──
{
  const t = require(path.join(ROOT, 'tools/tao_bo_deploy.js'));
  const js = t.jsCuaApp(APP('<script src="js/posgieo/pos_ui.v1.js?b=1"></script>\n' + RETRY));
  chk(js.includes('js/posgieo/pos_ui.v1.js') && js.includes('data_access.v9.js') && !js.some(f => /^https?:/.test(f)), 'T1: gom js/posgieo/… theo đường đầy đủ (cả chuỗi nạp lại), bỏ CDN');
  let l1 = '', l2 = ''; try { t.jsCuaApp('<script src="../ngoai.js"></script>'); } catch (e) { l1 = e.message; } try { t.jsCuaApp('<script src="/goc.js"></script>'); } catch (e) { l2 = e.message; }
  chk(/không hợp lệ/.test(l1) && /không hợp lệ/.test(l2), 'T1: đường có ".." hoặc bắt đầu bằng "/" → báo lỗi');
  const r = tmp();
  ['pos_ui.v1.js', 'pos_ui.v2.js', 'pos_uix.v1.js', 'khac.v1.js'].forEach(f => w(r, 'js/posgieo/' + f, '//'));
  chk(JSON.stringify(t.banCuCungHo(r, 'js/posgieo/pos_ui.v2.js').sort()) === JSON.stringify(['js/posgieo/pos_ui.v1.js', 'js/posgieo/pos_ui.v2.js']), 'T3: giữ mọi bản cùng họ (pos_ui.v1 + v2), không lẫn họ khác (pos_uix)');
  t.ghiBo(path.join(r, 'out'), { 'a.html': 'x', 'js/posgieo/b.v1.js': 'y' });
  chk(fs.readFileSync(path.join(r, 'out/js/posgieo/b.v1.js'), 'utf8') === 'y', 'T2: ghi bộ tạo thư mục con');
}

// ── T4 tao_ban_thu (chạy bản chép của tool trên fixture gốc riêng) ──
{
  const r = tmp();
  w(r, 'tools/tao_ban_thu.js', fs.readFileSync(path.join(ROOT, 'tools/tao_ban_thu.js')));
  for (const f of ['che_do_thu.v1.js', 'unit_engine.v21.js', 'data_access.v9.js']) w(r, f, fs.readFileSync(path.join(ROOT, f)));
  const extra = '<script src="js/posgieo/pos_ui.v1.js"></script>\n' + RETRY;
  w(r, 'posgieo.html', APP(extra)); w(r, 'quanlygieo.html', APP(''));
  w(r, 'js/posgieo/pos_ui.v1.js', 'function escHtmlPos(s){return s}');
  const out = path.join(r, 'out'); fs.mkdirSync(out);
  const kq = run([path.join(r, 'tools/tao_ban_thu.js'), out]);
  const h = fs.existsSync(path.join(out, 'posgieo_thu.html')) ? fs.readFileSync(path.join(out, 'posgieo_thu.html'), 'utf8') : '';
  chk(kq.status === 0 && /src="js\/posgieo\/pos_ui\.v1\.js\?b=[0-9a-f]{10}"/.test(h) && /js\/posgieo\/pos_ui\.v1\.js\?b=[0-9a-f]{10}&r=1/.test(h), 'T4: bản thử gắn ?b= cho js/posgieo (thẻ thường + chuỗi nạp lại ?b=…&r=1)');
  chk(fs.existsSync(path.join(out, 'js/posgieo/pos_ui.v1.js')), 'T4: xuất ra thư mục khác chép cả cây js/posgieo/');
  fs.rmSync(path.join(r, 'js/posgieo/pos_ui.v1.js'));
  const kq2 = run([path.join(r, 'tools/tao_ban_thu.js'), out]);
  chk(kq2.status !== 0 && /không có file này/.test(kq2.stdout), 'T4: HTML nạp js/posgieo không tồn tại → dừng, báo lỗi');
}

// ── T7 rào ranh giới / đường dẫn bắt lỗi nằm trong js/posgieo ──
{
  const r = tmp();
  for (const f of ['data_access.v9.js', 'unit_engine.v21.js']) w(r, f, fs.readFileSync(path.join(ROOT, f)));
  w(r, 'posgieo.html', APP('<script src="js/posgieo/xau.v1.js"></script>'));
  w(r, 'quanlygieo.html', APP(''));
  w(r, 'js/posgieo/xau.v1.js', "function ghiKhoXau(){ return fstore.collection('stock_transactions_gieogieo').add({ qty: 1 }); }\nfunction bangLa(){ return fstore.collection('bang_chua_dang_ky_gieogieo').get(); }\n");
  const b = run([path.join(ROOT, 'tools/check_boundaries.js')], { CHECK_BOUNDARIES_ROOT: r });
  chk(b.status !== 0 && /POS:ghiKhoXau/.test(b.stdout) && /js\/posgieo\/xau\.v1\.js:1/.test(b.stdout), 'T7: check_boundaries bắt lệnh ghi kho trong js/posgieo, báo đúng file:dòng');
  const p = run([path.join(ROOT, 'tools/check_paths.js')], { CHECK_PATHS_ROOT: r });
  chk(p.status !== 0 && /bang_chua_dang_ky_gieogieo/.test(p.stdout), 'T7: check_paths bắt tên bảng chưa đăng ký trong js/posgieo');
  w(r, 'js/posgieo/xau.v1.js', 'function sach(){ return 1; }\n');
  chk(run([path.join(ROOT, 'tools/check_boundaries.js')], { CHECK_BOUNDARIES_ROOT: r }).status === 0, 'T7: gỡ lỗi cài → check_boundaries sạch');
}

// ── T9 sổ JS đã phát hành ──
{
  const ph = require(path.join(ROOT, 'tools/tach_posgieo/phat_hanh.js'));
  const r = tmp(); w(r, 'js/posgieo/a.v1.js', 'A'); w(r, 'tools/js_da_phat_hanh.json', '{}');
  chk(JSON.stringify(ph.ghi(['js/posgieo/a.v1.js', 'posgieo.html'], r)) === JSON.stringify(['js/posgieo/a.v1.js']), 'T9: ghi sổ chỉ file js/posgieo');
  chk(ph.kiem(r).length === 0, 'T9: nội dung như lúc phát hành → sạch');
  w(r, 'js/posgieo/a.v1.js', 'A2');
  chk(ph.kiem(r).length === 1 && /ĐÃ ĐỔI/.test(ph.kiem(r)[0].ly), 'T9: sửa file đã phát hành → báo lỗi');
  let l = ''; try { ph.ghi(['js/posgieo/a.v1.js'], r); } catch (e) { l = e.message; }
  chk(/không ghi đè/.test(l), 'T9: không cho ghi đè sổ bằng nội dung mới');
  fs.rmSync(path.join(r, 'js/posgieo/a.v1.js'));
  chk(ph.kiem(r).length === 1 && /không còn/.test(ph.kiem(r)[0].ly), 'T9: xoá file đã phát hành → báo lỗi');
}

// ── T10 predeploy_check: cấu trúc Hosting thật (firebase.json ở thư mục cha, deploy = public/) ──
{
  const r = tmp(), pub = path.join(r, 'public');
  fs.cpSync(path.join(ROOT, 'ban_deploy/giangsinh'), pub, { recursive: true });
  const fj = h => w(r, 'firebase.json', JSON.stringify({ hosting: { public: 'public', headers: [
    { source: '/unit_engine.v*.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/@(posgieo|quanlygieo).html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }].concat(h || []) } }));
  const pc = () => run([path.join(ROOT, 'tools/predeploy_check.js'), pub]);
  fj();
  chk(pc().status === 0, 'T10: firebase.json ở thư mục cha + public/ = bộ Giáng sinh hiện tại → đạt');
  const goc = fs.readFileSync(path.join(pub, 'posgieo.html'), 'utf8');
  fs.writeFileSync(path.join(pub, 'posgieo.html'), goc.replace('<script src="unit_engine.v21.js"></script>', '<script src="unit_engine.v21.js"></script>\n<script src="js/posgieo/pos_ui.v1.js"></script>'));
  let k = pc(); chk(k.status !== 0 && /js\/posgieo\/pos_ui\.v1\.js nhưng file này KHÔNG có/.test(k.stdout), 'T10: HTML nạp js/posgieo mà thiếu file (chép phẳng / quên thư mục) → không được deploy');
  w(pub, 'js/posgieo/pos_ui.v1.js', '//');
  k = pc(); chk(k.status !== 0 && /headers cho \/js\/posgieo/.test(k.stdout), 'T10: có js/posgieo mà firebase.json thiếu header immutable → không được deploy');
  fj([{ source: '/js/posgieo/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]);
  chk(pc().status === 0, 'T10: thêm header /js/posgieo/** → đạt');
  w(pub, 'js/posgieo/Pos_Ui.v2.js', '//');
  k = pc(); chk(k.status !== 0 && /viết thường/.test(k.stdout), 'T10: tên có chữ hoa trong js/posgieo → không được deploy');
  fs.rmSync(path.join(pub, 'js/posgieo/Pos_Ui.v2.js'));
  w(r, 'firebase.json', JSON.stringify({ hosting: { public: 'khac' } }));
  k = pc(); chk(k.status !== 0 && /không trỏ tới thư mục đang kiểm/.test(k.stdout), 'T10: firebase.json cha trỏ "public" chỗ khác → báo kiểm nhầm thư mục');
}

// ── T12 tiện ích e2e ──
{
  const { serveFile, chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e.js'));
  const r = tmp(); w(r, 'js/posgieo/a.v1.js', 'A'); w(r, 'a.v1.js', 'GOC');
  const res = () => ({ h: {}, b: null, setHeader(k, v) { this.h[k] = v; }, end(b) { this.b = String(b); } });
  const x = res(); serveFile(r, '/js/posgieo/a.v1.js', x);
  chk(x.b === 'A' && /javascript/.test(x.h['Content-Type']), 'T12: phục vụ đúng đường đầy đủ (không gộp về tên gốc), MIME JS');
  chk(serveFile(r, '/../' + path.basename(r) + '/../etc/passwd', res()) === false, 'T12: chặn thoát thư mục');
  chk(typeof chromiumPath() === 'string' || chromiumPath() === undefined, 'T12: chọn Chromium không ghi cứng');
}
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
