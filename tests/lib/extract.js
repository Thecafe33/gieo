// Trích mã nguồn các hàm cấp cao từ file HTML (script inline) theo tên — dùng cho test Node.
// Bộ đếm ngoặc hiểu chuỗi '...', "...", `...` (kể cả ${...} lồng trong template) và chú thích.
const fs = require('fs');
const path = require('path');
// Mã của app = <script> trần inline + JS riêng nạp bằng <script src="js/…"> (theo thứ tự HTML) — bộ đọc nguồn chung
// tools/tach_posgieo/nguon.js (kế hoạch tách posgieo T6). Chỉ để TÌM hàm theo tên.
const { maNoi } = require('../../tools/tach_posgieo/nguon');
function scriptsOf(htmlPath) {
  return maNoi(path.relative(path.resolve(__dirname, '..', '..'), htmlPath));
}
function grab(src, name) {
  const re = new RegExp('(^|\\n)\\s*(async\\s+)?function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('Không tìm thấy hàm ' + name);
  const i = m.index + (m[1] ? 1 : 0);
  let k = src.indexOf('{', src.indexOf(')', i));
  const stack = []; let depth = 0;
  for (; k < src.length; k++) {
    const c = src[k], top = stack[stack.length - 1];
    if (top === "'" || top === '"') { if (c === '\\') { k++; continue; } if (c === top) stack.pop(); continue; }
    if (top === '`') { if (c === '\\') { k++; continue; } if (c === '`') { stack.pop(); continue; } if (c === '$' && src[k + 1] === '{') { stack.push('${'); k++; } continue; }
    if (c === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); continue; }
    if (c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { stack.push(c); continue; }
    if (c === '{') { if (top === '${' || top === '{') stack.push('{'); else depth++; continue; }
    if (c === '}') {
      if (top === '{' || top === '${') { stack.pop(); continue; }
      depth--; if (depth === 0) return src.slice(i, k + 1).trim();
    }
  }
  throw new Error('Không đóng được ngoặc cho ' + name);
}
// opts.vnDate === false: KHÔNG tự chèn vnDate thật — test tự truyền vnDate giả (vd ngày cố định) thì phải tắt,
// không thì khai báo function vnDate chèn vào sẽ che tham số giả (nguyên nhân manage_duyet_gieo hỏng theo ngày chạy).
function extract(htmlRel, names, opts) {
  const src = scriptsOf(path.resolve(__dirname, '..', '..', htmlRel));
  const out=names.map(n => grab(src, n)).join('\n');
  // Trích cả lịch VN khi hàm được kiểm dùng nó, như lúc chạy trong app thật.
  return !(opts && opts.vnDate === false) && !names.includes('vnDate') && /\bvnDate\s*\(/.test(out) ? grab(src,'vnDate')+'\n'+out : out;
}
function extractRaw(htmlRel,names){return names.map(n=>grab(scriptsOf(path.resolve(__dirname,'..','..',htmlRel)),n)).join('\n');}
// Như extract nhưng một tên; không có hàm đó thì trả null (có cache nguồn theo file).
const _cache = {};
function extractOne(htmlRel, name) {
  const f = path.resolve(__dirname, '..', '..', htmlRel);
  const src = _cache[f] || (_cache[f] = scriptsOf(f));
  try { const out=grab(src,name);return name!=='vnDate' && /\bvnDate\s*\(/.test(out)?grab(src,'vnDate')+'\n'+out:out; } catch (e) { if (/Không tìm thấy/.test(e.message)) return null; throw e; }
}
module.exports = { extract, extractOne, extractRaw };
