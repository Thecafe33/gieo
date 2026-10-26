// BỘ ĐỌC NGUỒN chung (kế hoạch tách posgieo, T6/T7): mã JS "của app" = các <script> TRẦN inline trong HTML
// + các file JS RIÊNG của app nạp bằng <script src="js/…">, theo ĐÚNG thứ tự trong HTML, giữ xuất xứ (file, dòng).
// Thư viện dùng chung ở gốc (unit_engine.v*.js, data_access.v*.js, bridge, gau_noel…) KHÔNG tính là mã của app —
// chúng có test/rào riêng (check_boundaries coi engine là bên ghi kho hợp lệ).
// CHỈ ĐỌC. Dùng bởi tests/lib/extract.js, tools/check_boundaries.js, tools/check_paths.js, tools/ast_inventory.js,
// tools/free_idents.js, tools/tach_posgieo/ban_do.js.
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

// đường JS cục bộ trong thuộc tính src: tương đối, không '..', không tuyệt đối, không giao thức
const laJsCucBo = p => /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js$/.test(p) && !p.split('/').includes('..');
// JS riêng của app (được coi là một phần mã nguồn của app)
const laJsRieng = p => laJsCucBo(p) && p.startsWith('js/');

// Duyệt HTML: bỏ qua chú thích <!-- … --> NẰM NGOÀI script (không đụng nội dung script — trong JS có thể có chuỗi '<!--').
function cacThe(html) {
  const out = []; let i = 0;
  for (;;) {
    const c = html.indexOf('<!--', i), s = html.indexOf('<script', i);
    if (s < 0) break;
    if (c >= 0 && c < s) { const e = html.indexOf('-->', c + 4); if (e < 0) break; i = e + 3; continue; }
    const gt = html.indexOf('>', s); const end = html.indexOf('</script>', gt);
    if (gt < 0 || end < 0) break;
    out.push({ attrs: html.slice(s + 7, gt), codeStart: gt + 1, code: html.slice(gt + 1, end) });
    i = end + 9;
  }
  return out;
}

/** Danh sách đoạn nguồn của một HTML: [{ file, startLine, code, kind: 'inline'|'src' }] theo thứ tự tài liệu. */
function nguonCua(htmlRel, opts) {
  const root = (opts && opts.root) || ROOT;
  const htmlPath = path.resolve(root, htmlRel);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);
  const out = [];
  for (const t of cacThe(html)) {
    if (t.attrs.trim() === '') { out.push({ file: htmlRel, startLine: html.slice(0, t.codeStart).split('\n').length, code: t.code, kind: 'inline' }); continue; }
    const s = /\bsrc\s*=\s*"([^"?#]+)(?:[?#][^"]*)?"/.exec(t.attrs);
    // cú pháp chưa hỗ trợ có thể làm BỎ SÓT mã của app → báo lỗi rõ ràng (không bỏ qua im lặng)
    const khac = /(?<![\w-])src\s*=\s*(?:'([^']*)'|([^\s"'>]+))/.exec(t.attrs);
    if (!s && khac) { const v = (khac[1] != null ? khac[1] : khac[2]).replace(/[?#].*$/, ''); if (laJsRieng(v)) throw new Error(htmlRel + ': <script src=' + (khac[1] != null ? "'" : '') + v + '…> chưa hỗ trợ — dùng src nháy kép (src="' + v + '")'); }
    if (!s && !khac && t.code.trim() !== '' && !/(?<![\w-])id\s*=/.test(t.attrs)) throw new Error(htmlRel + ': <script' + t.attrs + '> inline có thuộc tính nhưng không có id — chưa hỗ trợ (bộ đọc nguồn chỉ đọc <script> trần + <script id=…> nạp lại); mã trong đó sẽ bị bỏ sót');
    if (!s || !laJsRieng(s[1])) continue;
    const abs = path.resolve(dir, s[1]);
    if (!fs.existsSync(abs)) throw new Error(htmlRel + ' nạp ' + s[1] + ' nhưng không có file này');
    out.push({ file: path.relative(root, abs).split(path.sep).join('/'), startLine: 1, code: fs.readFileSync(abs, 'utf8'), kind: 'src' });
  }
  return out;
}
/** Mã nối của mọi đoạn (chỉ để TÌM theo tên — chạy thật phải nạp từng đoạn riêng). */
function maNoi(htmlRel, opts) { return nguonCua(htmlRel, opts).map(x => x.code).join('\n'); }
/** Các file JS cục bộ (mọi src tương đối, kể cả thư viện gốc) HTML nạp, gồm cả trong document.write('<scr'+'ipt src=…>'). */
function jsCucBoCua(html) {
  const out = new Set(); const h = html.replace(/<!--[\s\S]*?-->/g, '');
  const re = /src=\\?"([^"\\?#]+)(?:[?#][^"\\]*)?\\?"/g; let m;
  while ((m = re.exec(h))) if (/\.js$/.test(m[1]) && !/^[a-z]+:|^\/\//i.test(m[1])) out.add(m[1]);
  return [...out];
}
module.exports = { nguonCua, maNoi, jsCucBoCua, laJsCucBo, laJsRieng, ROOT };
