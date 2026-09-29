// In ra các định danh "tự do" (biến toàn cục) mà một nhóm hàm cấp cao dùng tới.
// Dùng khi tách hàm ra engine: biết hàm phụ thuộc vào gì của app.
// node tools/free_idents.js posgieo.html tenHam1 tenHam2 ...
const fs = require('fs'); const acorn = require('acorn'); const walk = require('acorn-walk');
const [file, ...names] = process.argv.slice(2);
const html = fs.readFileSync(file, 'utf8');
const re = /<script>([\s\S]*?)<\/script>/g; let m; const tops = {};
while ((m = re.exec(html))) {
  const ast = acorn.parse(m[1], { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration') tops[st.id.name] = st;
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier') tops[d.id.name] = d;
  }
}
const BUILTIN = new Set(Object.getOwnPropertyNames(globalThis).concat(['window','document','console','firebase','navigator','location','localStorage','sessionStorage','setTimeout','clearTimeout','setInterval','clearInterval','alert','confirm','prompt','requestAnimationFrame','fetch','undefined','arguments','Promise','Date','Math','JSON','Object','Array','Number','String','Boolean','Set','Map','Error','RegExp','Symbol','isNaN','parseInt','parseFloat','encodeURIComponent','decodeURIComponent','Intl','crypto','performance','structuredClone','queueMicrotask','URL','Blob','FileReader','Image','HTMLElement','Event','CustomEvent','AbortController','TextEncoder','TextDecoder','atob','btoa']));
function declared(node) {                      // tập tên khai báo bên trong node (hàm, biến, tham số, catch)
  const s = new Set();
  const addPat = p => { if (!p) return; if (p.type === 'Identifier') s.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => addPat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(addPat); else if (p.type === 'RestElement') addPat(p.argument); else if (p.type === 'AssignmentPattern') addPat(p.left); };
  walk.full(node, n => {
    if (n.type === 'VariableDeclarator') addPat(n.id);
    if (/Function/.test(n.type)) { if (n.id) s.add(n.id.name); n.params.forEach(addPat); }
    if (n.type === 'CatchClause') addPat(n.param);
    if (n.type === 'ClassDeclaration' && n.id) s.add(n.id.name);
  });
  return s;
}
const out = {};
for (const name of names) {
  const node = tops[name]; if (!node) { console.error('không thấy', name); continue; }
  const dec = declared(node); const used = new Set();
  walk.ancestor(node, { Identifier(n, anc) {
    const p = anc[anc.length - 2];
    if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;
    if (p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand) return;
    if (p && (p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement')) return;
    if (p && p.type === 'MethodDefinition' && p.key === n) return;
    if (!dec.has(n.name) && !BUILTIN.has(n.name)) used.add(n.name);
  } });
  out[name] = [...used].sort();
}
const all = {}; for (const [f, us] of Object.entries(out)) us.forEach(u => (all[u] = all[u] || []).push(f));
const internal = new Set(names);
console.log(JSON.stringify(Object.fromEntries(Object.entries(all).filter(([k]) => !internal.has(k)).map(([k, v]) => [k, v.length])), null, 0));
