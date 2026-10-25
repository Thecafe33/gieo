// CÔNG CỤ CHUYỂN NGUYÊN VĂN khai báo cấp cao từ <script> TRẦN chính của một HTML sang file JS mới (kế hoạch tách posgieo).
//   node tools/tach_posgieo/chuyen.js --html posgieo.html --tu <dòng> --den <dòng> --ra js/posgieo/<ten>.v1.js --dau <khoá> [--giu 12,34] [--ghi]
// Chuyển: câu lệnh cấp cao nằm TRỌN trong dải dòng [tu, den] và là khai báo (function / class / let-const-var).
// Ở lại HTML: lệnh tự chạy (đúng chỗ, đúng thứ tự), khai báo ở --giu (theo dòng bắt đầu), chú thích không liền khai báo.
// An toàn (lỗi → mã thoát 1, không ghi gì): (a) giá trị đầu let/const/var không tham chiếu tên cấp cao còn ở HTML
// (hay khai báo muộn hơn trong file ra); (b) không trùng tên với JS riêng khác; (c) không ghi đè file ra;
// (d) parse lại được cả hai và tập tên cấp cao trước = sau. Không --ghi = chạy thử.
'use strict';
const fs = require('fs'), path = require('path'), acorn = require('acorn');
const { freeRefs, patNames } = require('./scope');
const { laJsRieng, ROOT } = require('./nguon');

const PARSE = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, locations: true };
const laKhaiBao = st => st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' || st.type === 'VariableDeclaration';
const tenCua = st => st.type === 'VariableDeclaration' ? st.declarations.flatMap(d => patNames(d.id, [])) : [st.id.name];
const vnYmd = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

// quét thẻ <script> (bỏ qua <!-- --> ngoài script, như nguon.js)
function cacThe(html) {
  const out = []; let i = 0;
  for (;;) {
    const c = html.indexOf('<!--', i), s = html.indexOf('<script', i);
    if (s < 0) break;
    if (c >= 0 && c < s) { const e = html.indexOf('-->', c + 4); if (e < 0) break; i = e + 3; continue; }
    const gt = html.indexOf('>', s), end = html.indexOf('</script>', gt);
    if (gt < 0 || end < 0) break;
    out.push({ attrs: html.slice(s + 7, gt), codeStart: gt + 1, code: html.slice(gt + 1, end) });
    i = end + 9;
  }
  return out;
}
const dongCua = (html, pos) => html.slice(0, pos).split('\n').length;
const tenGon = ten => ten.length <= 6 ? ten.join(', ') : ten.slice(0, 3).join(', ') + ', … ' + ten.slice(-2).join(', ') + ' (' + ten.length + ' tên)';

function chuyen(o) {
  const loi = [], canhBao = [];
  const fail = () => ({ htmlMoi: null, fileMoi: null, ten: [], giuLai: [], canhBao, loi });
  const root = o.root || ROOT, htmlRel = o.html || 'posgieo.html';
  const tu = +o.tu, den = +o.den, giu = new Set((o.giu || []).map(Number));
  let html = o.htmlText;
  if (html == null) html = fs.readFileSync(path.resolve(root, htmlRel), 'utf8');
  if (!(tu > 0 && den >= tu)) loi.push('dải dòng không hợp lệ (--tu/--den)');
  if (!/^[a-z][A-Za-z0-9_]*$/.test(o.dau || '')) loi.push('--dau phải là tên định danh JS (vd ui, assist)');
  if (!o.ra || !laJsRieng(o.ra)) loi.push('--ra phải là đường tương đối dạng js/…/ten.vN.js');
  if (loi.length) return fail();
  const raAbs = path.resolve(root, o.ra);
  if (fs.existsSync(raAbs)) { loi.push('(c) file ra đã tồn tại, không ghi đè: ' + o.ra); return fail(); }

  const the = cacThe(html);
  const baseDir = path.dirname(path.resolve(root, htmlRel));
  const tran = the.filter(t => t.attrs.trim() === '');
  const main = tran.find(t => { const a = dongCua(html, t.codeStart), b = a + t.code.split('\n').length - 1; return tu >= a && den <= b; });
  if (!main) { loi.push('không có <script> trần nào chứa trọn dải dòng ' + tu + '–' + den); return fail(); }
  const dong0 = dongCua(html, main.codeStart) - 1;       // dòng HTML = dong0 + loc.line
  const code = main.code;
  const comments = [];
  let ast;
  try { ast = acorn.parse(code, Object.assign({ onComment: comments }, PARSE)); } catch (e) { loi.push('không parse được script chính: ' + e.message); return fail(); }
  const body = ast.body;
  const L = n => dong0 + n.loc.start.line, E = n => dong0 + n.loc.end.line;

  // phân loại
  const chuyenIdx = [], giuLai = [];
  body.forEach((st, i) => {
    if (!(L(st) >= tu && E(st) <= den)) return;
    if (laKhaiBao(st) && !giu.has(L(st))) chuyenIdx.push(i);
    else giuLai.push({ line: L(st), loai: st.type, mo_ta: code.slice(st.start, Math.min(st.end, st.start + 80)).split('\n')[0] });
  });
  for (const g of giu) if (!body.some(st => L(st) === g && laKhaiBao(st))) loi.push('--giu ' + g + ': không có khai báo cấp cao bắt đầu ở dòng này');
  if (!chuyenIdx.length) loi.push('không có khai báo nào để chuyển trong dải ' + tu + '–' + den);
  if (loi.length) return fail();

  // đơn vị = chú thích liền trên (không cách dòng trống, sau câu lệnh trước, trong dải) + khai báo
  const moved = new Set(chuyenIdx);
  const units = chuyenIdx.map(i => {
    const st = body[i], prevEnd = i > 0 ? body[i - 1].end : 0, prevEndLine = i > 0 ? body[i - 1].loc.end.line : 0;
    let start = st.start, needLine = st.loc.start.line;
    for (;;) {
      const c = comments.find(k => k.loc.end.line === needLine - 1 && k.end <= start && k.start >= prevEnd && k.loc.start.line > prevEndLine && dong0 + k.loc.start.line >= tu
        && /^\s*$/.test(code.slice(k.end, start)) && code.slice(k.end, start).split('\n').length <= 2);
      if (!c) break;
      // // liên tiếp nhiều dòng: mỗi lần lùi một chú thích
      start = c.start; needLine = c.loc.start.line;
    }
    return { i, st, start, end: st.end, text: code.slice(start, st.end), ten: tenCua(st) };
  });
  const ten = units.flatMap(u => u.ten);

  // (b) trùng tên với JS riêng khác
  const trongKhac = {};
  for (const t of the) {
    if (t.attrs.trim() === '') continue;
    const s = /\bsrc\s*=\s*"([^"?#]+)(?:[?#][^"\\]*)?"/.exec(t.attrs);
    if (!s || !laJsRieng(s[1])) continue;
    const abs = path.resolve(baseDir, s[1]);
    if (!fs.existsSync(abs)) { loi.push('HTML nạp ' + s[1] + ' nhưng không có file này'); continue; }
    try { acorn.parse(fs.readFileSync(abs, 'utf8'), PARSE).body.filter(laKhaiBao).forEach(st => tenCua(st).forEach(n => { (trongKhac[n] = trongKhac[n] || []).push(s[1]); })); }
    catch (e) { loi.push('không parse được ' + s[1] + ': ' + e.message); }
  }
  ten.forEach(n => { if (trongKhac[n]) loi.push('(b) tên "' + n + '" đã khai báo trong ' + trongKhac[n].join(', ')); });

  // (a) giá trị đầu của biến chuyển đi
  const conLai = new Set(); body.forEach((st, i) => { if (!moved.has(i) && laKhaiBao(st)) tenCua(st).forEach(n => conLai.add(n)); });
  const viTri = {}; units.forEach((u, k) => u.ten.forEach(n => { viTri[n] = [k, u.st]; }));
  units.forEach((u, k) => {
    if (u.st.type !== 'VariableDeclaration') return;
    u.st.declarations.forEach(d => {
      const refs = new Set(d.init ? freeRefs(d.init) : []);
      if (d.id.type !== 'Identifier') freeRefs(u.st).forEach(x => refs.add(x));   // mặc định / khoá tính toán trong mẫu
      const ten1 = patNames(d.id, []).join(',');
      refs.forEach(r => {
        if (conLai.has(r)) loi.push('(a) ' + u.st.kind + ' ' + ten1 + ' (dòng ' + L(u.st) + '): giá trị đầu tham chiếu "' + r + '" còn ở HTML — file nạp trước script chính nên chưa có/TDZ');
        else if (viTri[r] && viTri[r][0] > k && viTri[r][1].type !== 'FunctionDeclaration') loi.push('(a) ' + u.st.kind + ' ' + ten1 + ' (dòng ' + L(u.st) + '): giá trị đầu tham chiếu "' + r + '" khai báo SAU nó (TDZ)');
      });
      if (d.init) {
        let goi = false; acornWalk(d.init, n => { if (n.type === 'CallExpression' || n.type === 'NewExpression') goi = true; });
        if (goi) canhBao.push(u.st.kind + ' ' + ten1 + ' (dòng ' + L(u.st) + '): giá trị đầu có lời gọi hàm/new — chạy lúc nạp file, hãy xem đã an toàn chưa');
      }
    });
  });
  if (loi.length) return fail();

  // dựng HTML mới: nhóm đơn vị liền nhau (chỉ cách nhau khoảng trắng) thành một dòng chú thích
  const runs = [];
  units.forEach(u => {
    const r = runs[runs.length - 1];
    if (r && /^\s*$/.test(code.slice(r.end, u.start))) { r.end = u.end; r.ten.push(...u.ten); } else runs.push({ start: u.start, end: u.end, ten: [...u.ten] });
  });
  let moi = '', pos = 0;
  runs.forEach(r => { moi += code.slice(pos, r.start) + '// ' + tenGon(r.ten) + ' → ' + o.ra; pos = r.end; });
  moi += code.slice(pos);
  const htmlMoi = html.slice(0, main.codeStart) + moi + html.slice(main.codeStart + code.length);
  const dauHdr = '// Tách từ ' + htmlRel + ' dòng ' + tu + '–' + den + ' (tools/tach_posgieo/chuyen.js, ' + vnYmd() + '). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —\n'
    + '// tạo ' + path.basename(o.ra).replace(/\.v(\d+)\.js$/, (m, n) => '.v' + (+n + 1) + '.js') + ' và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.\n';
  const fileMoi = dauHdr + '(window.PosGieoMods = window.PosGieoMods || {}).' + o.dau + " = 'dang';\n\n"
    + units.map(u => u.text).join('\n\n') + '\n\nPosGieoMods.' + o.dau + ' = true;\n';

  // (d) parse lại + tập tên
  const tenTruoc = body.filter(laKhaiBao).flatMap(tenCua).sort();
  try {
    const t2 = cacThe(htmlMoi).find(t => t.attrs.trim() === '' && t.codeStart === main.codeStart);
    const b2 = acorn.parse(t2.code, PARSE).body, f2 = acorn.parse(fileMoi, PARSE).body;
    const sau = [...b2.filter(laKhaiBao).flatMap(tenCua), ...f2.filter(laKhaiBao).flatMap(tenCua)].sort();
    if (JSON.stringify(sau) !== JSON.stringify(tenTruoc)) loi.push('(d) tập tên cấp cao trước/sau khác nhau (' + tenTruoc.length + ' → ' + sau.length + ')');
    const tuChay1 = body.length - chuyenIdx.length;
    if (b2.length !== tuChay1) loi.push('(d) số câu lệnh còn lại ở HTML sai: ' + b2.length + ' ≠ ' + tuChay1);
  } catch (e) { loi.push('(d) parse lại sau biến đổi lỗi: ' + e.message); }
  if (loi.length) return fail();
  return { htmlMoi, fileMoi, ten, giuLai, canhBao, loi };
}
function acornWalk(node, f) {
  (function v(n) { if (!n || typeof n.type !== 'string') return; f(n); for (const k of Object.keys(n)) { if (k === 'loc') continue; const x = n[k]; if (Array.isArray(x)) x.forEach(v); else if (x && typeof x.type === 'string') v(x); } })(node);
}

function cli(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k === '--ghi') a.ghi = true; else if (k.startsWith('--')) a[k.slice(2)] = argv[++i]; }
  const o = { html: a.html, tu: a.tu, den: a.den, ra: a.ra, dau: a.dau, giu: a.giu ? a.giu.split(',').filter(Boolean) : [], root: a.root ? path.resolve(a.root) : ROOT };   // --root: thư mục gốc khác (test)
  if (!o.html) { console.error('thiếu --html'); return 1; }
  let r; try { r = chuyen(o); } catch (e) { console.error('LỖI: ' + e.message); return 1; }
  if (r.loi.length) { console.error('DỪNG — không ghi gì:\n - ' + r.loi.join('\n - ')); return 1; }
  console.log('Chuyển ' + r.ten.length + ' tên: ' + r.ten.join(', '));
  console.log('Lệnh tự chạy / khai báo giữ lại (' + r.giuLai.length + '):'); r.giuLai.forEach(g => console.log('  dòng ' + g.line + ' [' + g.loai + '] ' + g.mo_ta));
  r.canhBao.forEach(w => console.log('CẢNH BÁO: ' + w));
  console.log('File ra ' + Buffer.byteLength(r.fileMoi) + ' byte; HTML ' + Buffer.byteLength(fs.readFileSync(path.resolve(o.root, o.html))) + ' → ' + Buffer.byteLength(r.htmlMoi) + ' byte');
  if (!a.ghi) { console.log('(chạy thử — thêm --ghi để ghi)'); return 0; }
  const ra = path.resolve(o.root, o.ra); fs.mkdirSync(path.dirname(ra), { recursive: true });
  fs.writeFileSync(ra, r.fileMoi); fs.writeFileSync(path.resolve(o.root, o.html), r.htmlMoi);
  console.log('Đã ghi ' + o.ra + ' và ' + o.html); return 0;
}
if (require.main === module) process.exit(cli(process.argv.slice(2)));
module.exports = { chuyen };
