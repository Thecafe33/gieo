// BẢN ĐỒ PHỤ THUỘC posgieo.html — bước 0B kế hoạch docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md. CHỈ ĐỌC, không sửa file nào.
//   node tools/tach_posgieo/ban_do.js [--html posgieo.html] [--json out.json] [--cum ten:dongDau-dongCuoi ...] [--ten a,b,c] [--ext a.js,b.js]
// Phạm vi biến phân giải bằng tools/tach_posgieo/scope.js; test: tests/tach_posgieo_ban_do.test.js.
// In ra (và ghi JSON nếu có --json):
//   - khai báo cấp cao của các <script> TRẦN (tên, loại, dòng HTML, byte);
//   - câu lệnh cấp cao KHÔNG phải khai báo thuần (lệnh tự chạy lúc nạp) + khai báo có lời gọi trong giá trị đầu;
//   - đồ thị tham chiếu giữa các tên cấp cao (phụ thuộc / bị gọi bởi);
//   - tên được gọi từ handler HTML (on…="" trong HTML tĩnh và trong chuỗi/template của JS);
//   - tên các bridge/JS ngoài dùng tới (gieo_automation_pos, gieo_engine2_pos, gau_noel, unit_engine2_store);
//   - khoá localStorage/sessionStorage.
// --cum: phân tích một cụm (theo dải dòng HTML) → phụ thuộc ra ngoài cụm, bên ngoài gọi vào cụm, lệnh tự chạy trong cụm.
'use strict';
const fs = require('fs'); const path = require('path');
const acorn = require('acorn'); const walk = require('acorn-walk');
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argsAll = k => process.argv.reduce((a, x, i, v) => (x === k && v[i + 1] ? a.concat(v[i + 1]) : a), []);
const HTML = arg('--html', 'posgieo.html');
const html = fs.readFileSync(path.resolve(ROOT, HTML), 'utf8');
// 1. mã của app = <script> trần + JS riêng js/… (bộ đọc nguồn chung tools/tach_posgieo/nguon.js — giống extract / check_*)
const { nguonCua } = require('./nguon');
const blocks = nguonCua(path.relative(ROOT, path.resolve(ROOT, HTML)).split(path.sep).join('/'), { root: ROOT });
const lineOf = (b, n) => b.startLine + n.loc.start.line - 1, endOf = (b, n) => b.startLine + n.loc.end.line - 1;
const BUILTIN = new Set(Object.getOwnPropertyNames(globalThis).concat(['window', 'document', 'console', 'firebase', 'navigator', 'location', 'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'undefined', 'arguments', 'Image', 'HTMLElement', 'Event', 'CustomEvent', 'AbortController', 'atob', 'btoa', 'getComputedStyle', 'matchMedia', 'history', 'screen', 'Notification', 'Audio', 'AudioContext', 'FormData', 'XMLHttpRequest', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'Node', 'NodeFilter', 'DOMParser', 'Option', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'scrollTo', 'open', 'print', 'self', 'top', 'parent', 'frames', 'name', 'status', 'event', 'File', 'Blob', 'FileReader', 'URL', 'URLSearchParams', 'Intl', 'crypto', 'performance', 'structuredClone', 'queueMicrotask', 'TextEncoder', 'TextDecoder', 'qrcode', 'dcodeIO', 'bcrypt']));

const tops = new Map();        // tên → {kind, start, end, bytes, node, block}
const effects = [];            // lệnh tự chạy cấp cao
const asts = [];
blocks.forEach((b, bi) => {
  const ast = acorn.parse(b.code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, locations: true, ranges: true });
  asts.push({ ast, b });
  const L = n => lineOf(b, n), E = n => endOf(b, n);
  for (const st of ast.body) {
    const add = (name, kind, node) => { if (tops.has(name)) tops.get(name).dup = (tops.get(name).dup || 0) + 1; else tops.set(name, { kind, file: b.file, start: L(st), end: E(st), bytes: st.end - st.start, node, block: bi }); };
    if (st.type === 'FunctionDeclaration') add(st.id.name, st.async ? 'async function' : 'function', st);
    else if (st.type === 'ClassDeclaration') add(st.id.name, 'class', st);
    else if (st.type === 'VariableDeclaration') {
      for (const d of st.declarations) {
        const names = []; const pat = p => { if (!p) return; if (p.type === 'Identifier') names.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => pat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(pat); else if (p.type === 'AssignmentPattern') pat(p.left); else if (p.type === 'RestElement') pat(p.argument); };
        pat(d.id); names.forEach(n => add(n, st.kind, d));
        if (d.init && !/Function/.test(d.init.type)) {
          let call = false; walk.simple(d.init, { CallExpression() { call = true; }, NewExpression() { call = true; } }, { ...walk.base, FunctionExpression() {}, ArrowFunctionExpression() {} });
          if (call) effects.push({ file: b.file, line: L(st), kind: 'init-có-lời-gọi', names, code: b.code.slice(d.start, Math.min(d.end, d.start + 120)).replace(/\s+/g, ' ') });
        }
      }
    } else effects.push({ file: b.file, line: L(st), endLine: E(st), kind: st.type, code: b.code.slice(st.start, Math.min(st.end, st.start + 140)).replace(/\s+/g, ' ') });
  }
});

// 2. tham chiếu tự do của từng tên cấp cao → đồ thị (phân giải phạm vi đúng — tools/tach_posgieo/scope.js)
const { freeRefs } = require('./scope.js');
function freeIds(node, self) {
  const target = node.type === 'VariableDeclarator' ? node.init : node;
  const used = new Set(); if (!target) return used;
  for (const n of freeRefs(target)) if (n !== self && tops.has(n)) used.add(n);
  return used;
}
const deps = new Map(), callers = new Map();
for (const [name, t] of tops) { const u = freeIds(t.node, name); deps.set(name, u); for (const x of u) { if (!callers.has(x)) callers.set(x, new Set()); callers.get(x).add(name); } }
// lệnh tự chạy cấp cao cũng dùng tên → ghi người gọi '<top-level@dòng>'
for (const { ast, b } of asts) for (const st of ast.body) {
  if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' || st.type === 'VariableDeclaration') continue;
  const u = freeIds(st, null); const who = '<lệnh tự chạy@' + (b.kind === 'src' ? b.file + ':' : '') + lineOf(b, st) + '>';
  for (const x of u) { if (!callers.has(x)) callers.set(x, new Set()); callers.get(x).add(who); }
}

// 3. handler HTML: on…="…" trong HTML ngoài script + trong chuỗi/template của JS
const handlerRefs = new Map();
const scanHandlers = (text, where) => {
  const re = /\bon[a-z]+\s*=\s*\\?["']([^"'\\]*)/g; let m;
  while ((m = re.exec(text))) { const idre = /([A-Za-z_$][\w$]*)\s*\(/g; let k; while ((k = idre.exec(m[1]))) if (tops.has(k[1])) { if (!handlerRefs.has(k[1])) handlerRefs.set(k[1], new Set()); handlerRefs.get(k[1]).add(where); } }
};
scanHandlers(html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/g, '$1$2'), 'html');
blocks.forEach(b => scanHandlers(b.code, 'js-chuỗi'));
// Handler dựng gián tiếp: tên hàm nằm trong chuỗi/template rồi mới được ghép vào on…="" ở chỗ khác
// (vd optsHtml(…, m => `setBatchUnitIce('${k}',${i},'${m}')`) — kiểm tra độc lập lượt 01 mục 3).
// Mọi `tenHam(` nằm trong literal chuỗi/template của JS → 'js-chuỗi-gọi' (có thể dư, không thiếu).
for (const { ast } of asts) walk.simple(ast, {
  Literal(n) { if (typeof n.value === 'string') scanCalls(n.value); },
  TemplateElement(n) { scanCalls(n.value.cooked || ''); }
});
function scanCalls(text) {
  const idre = /([A-Za-z_$][\w$]*)\s*\(/g; let k;
  while ((k = idre.exec(text))) if (tops.has(k[1]) && /function/.test(tops.get(k[1]).kind)) { if (!handlerRefs.has(k[1])) handlerRefs.set(k[1], new Set()); handlerRefs.get(k[1]).add('js-chuỗi-gọi'); }
}

// 4. JS ngoài dùng tên của app
const EXT = arg('--ext') ? arg('--ext').split(',') : ['gieo_automation_pos.v3.js', 'gieo_engine2_pos_v1.js', 'gau_noel_giangsinh.v2.js', 'unit_engine2_store_v1.js', 'unit_engine2_v1.js', 'unit_engine.v21.js', 'data_access.v9.js'];
const extRefs = new Map();
for (const f of EXT) {
  if (!fs.existsSync(path.resolve(ROOT, f))) continue;
  const src = fs.readFileSync(path.resolve(ROOT, f), 'utf8');
  const seen = new Map();   // tên → 'tham-chiếu' | 'chuỗi'
  try { for (const n of freeRefs(acorn.parse(src, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }))) if (tops.has(n)) seen.set(n, 'tham-chiếu'); }
  catch (e) { console.error('Không phân tích được ' + f + ': ' + e.message); }
  const reStr = /window\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\])/g; let m;
  while ((m = reStr.exec(src))) { const n = m[1] || m[2]; if (tops.has(n)) seen.set(n, 'tham-chiếu'); }
  const reQ = /['"]([A-Za-z_$][\w$]{3,})['"]/g; while ((m = reQ.exec(src))) if (tops.has(m[1]) && !seen.has(m[1])) seen.set(m[1], 'chuỗi');
  for (const [n, how] of seen) { if (!extRefs.has(n)) extRefs.set(n, new Set()); extRefs.get(n).add(f + (how === 'chuỗi' ? ' (chuỗi)' : '')); }
}

// 5. khoá storage
const storage = [];
for (const { ast, b } of asts) walk.ancestor(ast, { CallExpression(n, anc) {
  const c = n.callee; if (c.type !== 'MemberExpression' || c.computed) return;
  const obj = c.object.type === 'Identifier' ? c.object.name : (c.object.type === 'MemberExpression' && !c.object.computed ? c.object.property.name : '');
  if (!/^(localStorage|sessionStorage)$/.test(obj) || !/^(getItem|setItem|removeItem)$/.test(c.property.name)) return;
  const a0 = n.arguments[0]; let key = '?';
  if (a0) key = a0.type === 'Literal' ? String(a0.value) : a0.type === 'TemplateLiteral' ? a0.quasis.map(q => q.value.cooked).join('${…}') : a0.type === 'Identifier' ? '<' + a0.name + '>' : b.code.slice(a0.start, Math.min(a0.end, a0.start + 60));
  const owner = [...anc].reverse().find(x => x.type === 'FunctionDeclaration'); const top = ast.body.find(s => s.start <= n.start && s.end >= n.end);
  let ownerName = owner && owner.id ? owner.id.name : null;
  if (top && top.type === 'VariableDeclaration') ownerName = ownerName || top.declarations.map(d => d.id.name).join(',');
  storage.push({ store: obj, op: c.property.name, key, file: b.file, line: lineOf(b, n), owner: ownerName || '<cấp cao>' });
} });

const result = {
  html: HTML, blocks: blocks.map(b => ({ file: b.file, startLine: b.startLine, lines: b.code.split('\n').length })),
  tops: [...tops].map(([n, t]) => ({ name: n, kind: t.kind, file: t.file, start: t.start, end: t.end, bytes: t.bytes, dup: t.dup || 0, deps: [...deps.get(n)].sort(), callers: [...(callers.get(n) || [])].sort(), handlers: [...(handlerRefs.get(n) || [])], ext: [...(extRefs.get(n) || [])] })),
  effects, storage
};
const jsonOut = arg('--json'); if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(result, null, 1));

// --cum ten:a-b → báo cáo cụm
const byName = new Map(result.tops.map(t => [t.name, t]));
function cum(spec) {
  const [ten, r] = spec.split(':'); const [a, z] = r.split('-').map(Number);
  const inside = result.tops.filter(t => t.file === result.blocks[0].file && t.start >= a && t.end <= z);   // dải dòng của file HTML const set = new Set(inside.map(t => t.name));
  const out = new Map(), inn = new Map();
  for (const t of inside) { for (const d of t.deps) if (!set.has(d)) { if (!out.has(d)) out.set(d, new Set()); out.get(d).add(t.name); } for (const c of t.callers) if (!set.has(c)) { if (!inn.has(t.name)) inn.set(t.name, new Set()); inn.get(t.name).add(c); } }
  const eff = result.effects.filter(e => e.file === result.blocks[0].file && e.line >= a && e.line <= z);
  const lex = inside.filter(t => /^(let|const|class)$/.test(t.kind)).map(t => t.name);
  return { ten, dong: [a, z], soTen: inside.length, byte: inside.reduce((s, t) => s + t.bytes, 0), ten_trong_cum: inside.map(t => t.name),
    phuThuocRaNgoai: [...out].map(([k, v]) => ({ ten: k, loai: (byName.get(k) || {}).kind, dong: (byName.get(k) || {}).start, dungBoi: [...v] })).sort((x, y) => x.dong - y.dong),
    benNgoaiGoiVao: [...inn].map(([k, v]) => ({ ten: k, goiBoi: [...v] })),
    handlerHTML: inside.filter(t => t.handlers.length).map(t => t.name + ' (' + t.handlers.join('+') + ')'),
    jsNgoaiDung: inside.filter(t => t.ext.length).map(t => t.name + ' ← ' + t.ext.join(', ')),
    lenhTuChay: eff, letConstClass: lex,
    storage: result.storage.filter(s => s.file === result.blocks[0].file && s.line >= a && s.line <= z) };
}
const cums = argsAll('--cum').map(cum);
if (cums.length) console.log(JSON.stringify(cums, null, 1));
const tenList = arg('--ten'); if (tenList) console.log(JSON.stringify(tenList.split(',').map(n => byName.get(n) || { name: n, khong_thay: true }), null, 1));
if (!cums.length && !tenList) console.log('Đoạn nguồn: ' + result.blocks.map(b => b.file + (b.file === HTML ? ' dòng ' + b.startLine : '') + ' (' + b.lines + ' dòng)').join(', ') + '\nTên cấp cao: ' + result.tops.length + ' · trùng tên: ' + result.tops.filter(t => t.dup).length + ' · lệnh tự chạy: ' + result.effects.length + ' · lời gọi storage: ' + result.storage.length);
