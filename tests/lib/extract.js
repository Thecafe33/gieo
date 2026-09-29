// Trích mã nguồn các hàm cấp cao từ file HTML (script inline) theo tên — dùng cho test Node.
// Bộ đếm ngoặc hiểu chuỗi '...', "...", `...` (kể cả ${...} lồng trong template) và chú thích.
const fs = require('fs');
const path = require('path');
function scriptsOf(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const out = []; const re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join('\n');
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
function extract(htmlRel, names) {
  const src = scriptsOf(path.resolve(__dirname, '..', '..', htmlRel));
  return names.map(n => grab(src, n)).join('\n');
}
// Như extract nhưng một tên; không có hàm đó thì trả null (có cache nguồn theo file).
const _cache = {};
function extractOne(htmlRel, name) {
  const f = path.resolve(__dirname, '..', '..', htmlRel);
  const src = _cache[f] || (_cache[f] = scriptsOf(f));
  try { return grab(src, name); } catch (e) { if (/Không tìm thấy/.test(e.message)) return null; throw e; }
}
module.exports = { extract, extractOne };
