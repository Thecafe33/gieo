// Công cụ chuyển khai báo tools/tach_posgieo/chuyen.js — chạy trên HTML FIXTURE (tmp) + chạy thử (không ghi) trên posgieo.html thật.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const acorn = require('acorn');
const ROOT = path.resolve(__dirname, '..');
const { chuyen } = require(path.join(ROOT, 'tools/tach_posgieo/chuyen.js'));
let ok = true;
const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chuyen-'));

const HEAD = '<html><body>\n<script>\nconst KEEP = 1;\n';
const TAIL = '\nfunction sau() { return KEEP; }\n</script>\n</body></html>\n';
const lineOf = (html, re) => html.split('\n').findIndex(l => re.test(l)) + 1;
const topNames = code => acorn.parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }).body.flatMap(st =>
  st.type === 'VariableDeclaration' ? st.declarations.map(d => d.id.name) : /Function|Class/.test(st.type) ? [st.id.name] : []).sort();
const scriptCua = html => /<script>([\s\S]*?)<\/script>/.exec(html)[1];
function dung(body) { return HEAD + body + TAIL; }
function chay(html, extra) {
  const tu = lineOf(html, /\/\/ BAT-DAU/), den = lineOf(html, /\/\/ KET-THUC/);
  return chuyen(Object.assign({ html: 'a.html', htmlText: html, tu, den, ra: 'js/posgieo/x.v1.js', dau: 'x', giu: [], root: tmp }, extra || {}));
}

const BODY1 = [
  '// BAT-DAU',
  '// chú thích hàm một',
  '// dòng hai của chú thích',
  'function ham1() { return 1; }',
  '',
  '// chú thích rời, cách dòng trống',
  '',
  'function ham2() { return KEEP + 2; }',
  'document.title = "tu chay 1";',
  '/* khối chú thích của hàm ba */',
  'function ham3() { return 3; }',
  'const HANG = 42;   // đuôi',
  'console.log("tu chay 2");',
  '// KET-THUC',
].join('\n');
const h1 = dung(BODY1);
const r1 = chay(h1);
chk(r1.loi.length === 0, '1: không lỗi ' + r1.loi.join(';'));
chk(JSON.stringify(r1.ten) === '["ham1","ham2","ham3","HANG"]', '1: 4 khai báo đúng thứ tự');
const f1 = r1.fileMoi;
chk(/^\/\/ Tách từ a\.html dòng \d+–\d+/.test(f1) && /KHÔNG sửa/.test(f1) && /x\.v2\.js/.test(f1), '1: dòng chú thích đầu file');
chk(f1.includes("(window.PosGieoMods = window.PosGieoMods || {}).x = 'dang';") && f1.trimEnd().endsWith('PosGieoMods.x = true;'), '1: hai dấu');
chk(f1.indexOf('function ham1') < f1.indexOf('function ham2') && f1.indexOf('function ham2') < f1.indexOf('function ham3') && f1.indexOf('function ham3') < f1.indexOf('const HANG'), '1: file ra giữ thứ tự');
chk(f1.includes('// chú thích hàm một\n// dòng hai của chú thích\nfunction ham1() { return 1; }') && f1.includes('/* khối chú thích của hàm ba */\nfunction ham3'), '1: chú thích liền trên đi theo hàm');
chk(!f1.includes('chú thích rời') && r1.htmlMoi.includes('// chú thích rời, cách dòng trống'), '1: chú thích cách dòng trống ở lại HTML');
chk(f1.includes('function ham2() { return KEEP + 2; }'), '1: văn bản nguyên văn');
const hm = r1.htmlMoi;
chk(hm.indexOf('tu chay 1') < hm.indexOf('tu chay 2') && hm.indexOf('tu chay 1') > 0, '1: lệnh tự chạy còn trong HTML đúng thứ tự');
chk(!/function ham\d|HANG = 42/.test(hm) && /→ js\/posgieo\/x\.v1\.js/.test(hm), '1: HTML hết khai báo, có dòng chú thích trỏ file');
chk(r1.giuLai.length === 2 && r1.giuLai.every(g => g.loai === 'ExpressionStatement'), '1: giữ lại 2 lệnh tự chạy');
chk(fs.existsSync(path.join(tmp, 'js/posgieo/x.v1.js')) === false, '1: không ghi file khi chỉ gọi hàm');

// 2
const r2 = chay(dung('// BAT-DAU\nconst A = KEEP + 1;\nfunction f() {}\n// KET-THUC'));
chk(r2.loi.some(l => /^\(a\)/.test(l) && /KEEP/.test(l)) && r2.htmlMoi === null && r2.fileMoi === null, '2: const tham chiếu tên của HTML → lỗi (a), không có kết quả ghi');
const r2b = chay(dung('// BAT-DAU\nconst A = B + 1;\nconst B = 2;\n// KET-THUC'));
chk(r2b.loi.some(l => /SAU nó/.test(l)), '2b: const tham chiếu const khai báo sau (TDZ) → lỗi');
const r2c = chay(dung('// BAT-DAU\nconst B = 2;\nconst A = B + 1;\nconst C = Math.max(B, 1);\n// KET-THUC'));
chk(r2c.loi.length === 0 && r2c.canhBao.length === 1 && /C/.test(r2c.canhBao[0]), '2c: tham chiếu const đã chuyển trước đó OK; const có lời gọi → cảnh báo');

// 3
const r3 = chay(dung('// BAT-DAU\nfunction f() { return KEEP + g(); }\nfunction g() { return sau(); }\n// KET-THUC'));
chk(r3.loi.length === 0 && r3.ten.length === 2, '3: hàm tham chiếu tên ngoài dải vẫn chuyển được');

// 4
const r4 = chay(dung('// BAT-DAU\nfunction a() {}\nfunction b() {}\nfunction c() {}\n// KET-THUC'), { giu: [lineOf(dung('// BAT-DAU\nfunction a() {}\nfunction b() {}\nfunction c() {}\n// KET-THUC'), /function b/)] });
chk(r4.loi.length === 0 && JSON.stringify(r4.ten) === '["a","c"]' && /function b\(\)/.test(r4.htmlMoi) && !/function b/.test(r4.fileMoi), '4: --giu giữ lại khai báo b');
chk(/function b\(\)[\s\S]*→/.test(r4.htmlMoi) === false || r4.htmlMoi.split('→').length === 3, '4: a và c thành hai dòng chú thích riêng (b chen giữa)');
const r4b = chay(dung('// BAT-DAU\nfunction a() {}\n// KET-THUC'), { giu: [9999] });
chk(r4b.loi.some(l => /--giu/.test(l)), '4: --giu sai dòng → lỗi');

// 5
fs.mkdirSync(path.join(tmp, 'js/posgieo'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'js/posgieo/co.v1.js'), '// da co\n');
const r5 = chay(dung('// BAT-DAU\nfunction a() {}\n// KET-THUC'), { ra: 'js/posgieo/co.v1.js' });
chk(r5.loi.some(l => /^\(c\)/.test(l)) && !r5.htmlMoi, '5: file ra đã tồn tại → lỗi (c)');
fs.writeFileSync(path.join(tmp, 'khac.js'), 'function ham1() {}\n');
const r5b = chay(dung('// BAT-DAU\nfunction ham1() {}\n// KET-THUC').replace('<script>', '<script src="js/khac.js"></script>\n<script>'), {});
fs.mkdirSync(path.join(tmp, 'js'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'js/khac.js'), 'function ham1() {}\n');
const r5c = chay(dung('// BAT-DAU\nfunction ham1() {}\n// KET-THUC').replace('<script>', '<script src="js/khac.js"></script>\n<script>'), {});
chk(r5b.loi.length > 0 && r5c.loi.some(l => /^\(b\)/.test(l)), '5: trùng tên với JS riêng khác → lỗi (b); thiếu file → lỗi');

// 6
const tenTruoc = topNames(scriptCua(h1));
const tenSau = [...topNames(scriptCua(r1.htmlMoi)), ...topNames(r1.fileMoi)].sort();
chk(JSON.stringify(tenTruoc) === JSON.stringify(tenSau), '6: tập tên cấp cao trước = sau (' + tenTruoc.length + ' tên)');
let parseOk = true; try { acorn.parse(scriptCua(r1.htmlMoi), { ecmaVersion: 'latest' }); acorn.parse(r1.fileMoi, { ecmaVersion: 'latest' }); } catch (e) { parseOk = false; }
chk(parseOk, '6: HTML mới và file ra parse được');

// 7
function quyTac(code) {
  const body = acorn.parse(code, { ecmaVersion: 'latest' }).body;
  const dau = (st, gt) => st && st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' && st.expression.right.type === 'Literal' && st.expression.right.value === gt && /PosGieoMods/.test(JSON.stringify(st.expression.left));
  return dau(body[0], 'dang') && dau(body[body.length - 1], true) && body.slice(1, -1).every(st => /^(FunctionDeclaration|ClassDeclaration|VariableDeclaration)$/.test(st.type));
}
chk(quyTac(r1.fileMoi), '7: file ra thoả quy tắc tach_posgieo_nguon (dấu đầu/cuối, giữa chỉ khai báo)');

// 7b: CLI --ghi trên fixture trong tmp — chạy thật thì ghi đúng, chạy lại thì dừng vì file đã tồn tại
const rootCli = path.join(tmp, 'cli'); fs.mkdirSync(rootCli);
fs.writeFileSync(path.join(rootCli, 'a.html'), h1);
const gt = lineOf(h1, /\/\/ BAT-DAU/), kt = lineOf(h1, /\/\/ KET-THUC/);
const res = chuyen({ html: 'a.html', htmlText: h1, tu: gt, den: kt, ra: 'js/posgieo/y.v1.js', dau: 'y', root: rootCli });
chk(res.loi.length === 0, '7b: hàm thuần với root khác chạy được');

// 8: posgieo.html thật TRƯỚC Đợt 1A (commit bbe5a97 — trợ lý còn inline; nay đã ở js/posgieo/pos_assist.v1.js), KHÔNG ghi
const real = spawnSync('git', ['show', 'bbe5a97:posgieo.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;
// CLI chạy trên bản chép của HTML đó trong thư mục tạm (cùng js/posgieo/pos_ui.v1.js nó nạp) — không đụng repo
const t8 = fs.mkdtempSync(path.join(os.tmpdir(), 'chuyen8-'));
fs.writeFileSync(path.join(t8, 'posgieo.html'), real);
fs.mkdirSync(path.join(t8, 'js/posgieo'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'js/posgieo/pos_ui.v1.js'), path.join(t8, 'js/posgieo/pos_ui.v1.js'));
const dong = real.split('\n');
const tuR = dong.findIndex(l => /^const ASSIST_CFG_FB_PATH/.test(l)) + 1;
const denR = dong.findIndex(l => /^assistLoadLocalCache\(\);/.test(l)) + 1;
chk(tuR > 0 && denR > tuR, '8: tìm thấy dải trợ lý ' + tuR + '–' + denR);
const r8 = chuyen({ html: 'posgieo.html', htmlText: real, tu: tuR, den: denR, ra: 'js/posgieo/_thu_assist.v1.js', dau: 'assist', root: ROOT });
chk(r8.loi.length === 0, '8: không lỗi' + (r8.loi.length ? ' — ' + r8.loi.join(' | ') : ''));
chk(r8.ten.length >= 50 && r8.ten.length <= 70, '8: số tên chuyển ≈ 59: ' + r8.ten.length);
const giuTxt = r8.giuLai.map(g => g.mo_ta).join('\n');
chk(/window\.addEventListener\('scroll'/.test(giuTxt) && /assistHookIntoPOS/.test(giuTxt) && /assistLoadLocalCache\(\);/.test(giuTxt), '8: lệnh tự chạy giữ lại gồm scroll, assistHookIntoPOS, assistLoadLocalCache();');
chk(r8.fileMoi && quyTac(r8.fileMoi) && !fs.existsSync(path.join(ROOT, 'js/posgieo/_thu_assist.v1.js')), '8: file ra hợp quy tắc, không ghi gì vào repo');
console.log('--- ca 8: tên (' + r8.ten.length + '): ' + r8.ten.join(', '));
console.log('--- ca 8: lệnh tự chạy giữ lại (' + r8.giuLai.length + '):'); r8.giuLai.forEach(g => console.log('    dòng ' + g.line + ' [' + g.loai + '] ' + g.mo_ta));
console.log('--- ca 8: cảnh báo (' + r8.canhBao.length + '):'); r8.canhBao.forEach(w => console.log('    ' + w));

// CLI: chạy thử trên posgieo.html thật không ghi
const cli = spawnSync('node', [path.join(ROOT, 'tools/tach_posgieo/chuyen.js'), '--root', t8, '--html', 'posgieo.html', '--tu', String(tuR), '--den', String(denR), '--ra', 'js/posgieo/_thu_assist.v1.js', '--dau', 'assist'], { cwd: ROOT, encoding: 'utf8' });
chk(cli.status === 0 && /chạy thử/.test(cli.stdout) && !fs.existsSync(path.join(t8, 'js/posgieo/_thu_assist.v1.js')), '8: CLI chạy thử mã thoát 0, không ghi');
const cli2 = spawnSync('node', [path.join(ROOT, 'tools/tach_posgieo/chuyen.js'), '--root', t8, '--html', 'posgieo.html', '--tu', String(tuR), '--den', String(denR), '--ra', 'js/posgieo/pos_ui.v1.js', '--dau', 'ui'], { cwd: ROOT, encoding: 'utf8' });
chk(cli2.status === 1 && /\(c\)/.test(cli2.stderr), '8: CLI file ra đã tồn tại → mã thoát 1');

console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
