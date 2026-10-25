// In ra các định danh "tự do" (biến toàn cục) mà một nhóm hàm cấp cao dùng tới.
// Dùng khi tách hàm ra engine / ra file riêng: biết hàm phụ thuộc vào gì của app.
// node tools/free_idents.js posgieo.html tenHam1 tenHam2 ...
// Mã của app = <script> trần + JS riêng js/… (tools/tach_posgieo/nguon.js); phạm vi biến phân giải đúng
// (tools/tach_posgieo/scope.js — bản cũ bỏ sót tên khi phạm vi con khai báo trùng tên; kế hoạch tách posgieo T7).
const path = require('path'); const acorn = require('acorn');
const { nguonCua } = require('./tach_posgieo/nguon');
const { freeRefs } = require('./tach_posgieo/scope');
const [file, ...names] = process.argv.slice(2);
const tops = {};
for (const x of nguonCua(path.relative(path.resolve(__dirname, '..'), path.resolve(file)))) {
  const ast = acorn.parse(x.code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration') tops[st.id.name] = st;
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier') tops[d.id.name] = d.init || d;
  }
}
const BUILTIN = new Set(Object.getOwnPropertyNames(globalThis).concat(['window','document','console','firebase','navigator','location','localStorage','sessionStorage','setTimeout','clearTimeout','setInterval','clearInterval','alert','confirm','prompt','requestAnimationFrame','fetch','undefined','arguments','Promise','Date','Math','JSON','Object','Array','Number','String','Boolean','Set','Map','Error','RegExp','Symbol','isNaN','parseInt','parseFloat','encodeURIComponent','decodeURIComponent','Intl','crypto','performance','structuredClone','queueMicrotask','URL','Blob','FileReader','Image','HTMLElement','Event','CustomEvent','AbortController','TextEncoder','TextDecoder','atob','btoa']));
const out = {};
for (const name of names) {
  const node = tops[name]; if (!node) { console.error('không thấy', name); continue; }
  out[name] = [...freeRefs(node)].filter(n => n !== name && !BUILTIN.has(n)).sort();
}
const all = {}; for (const [f, us] of Object.entries(out)) us.forEach(u => (all[u] = all[u] || []).push(f));
const internal = new Set(names);
console.log(JSON.stringify(Object.fromEntries(Object.entries(all).filter(([k]) => !internal.has(k)).map(([k, v]) => [k, v.length])), null, 0));
