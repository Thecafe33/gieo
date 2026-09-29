// Rào ranh giới Unit Engine (E5 — mục 5.2 kế hoạch), dựa trên AST (không regex).
// Báo lỗi khi code NGOÀI unit_engine*.js:
//   1. ghi (set/update/delete/add, kể cả trong transaction/batch) vào collection dữ liệu engine (2.9);
//   2. ghi RT active_units_gieogieo/** ;
//   3. ghi trường trạng thái tồn (3.9) lên doc món inventory_items / prep_items;
//   4. gọi .add() trên sổ.
// Chạy: node tools/check_boundaries.js [posgieo.html quanlygieo.html]   — mã thoát 1 nếu có vi phạm.
// Ngoại lệ đã duyệt (nếu có) khai trong tools/boundary_allow.json: { "POS:tenHam": "lý do", ... }.
const fs = require('fs'); const path = require('path');
const acorn = require('acorn'); const walk = require('acorn-walk');
const ROOT = path.resolve(__dirname, '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['posgieo.html', 'quanlygieo.html'];
const ENGINE_COLLS = new Set(['stock_containers_gieogieo', 'prep_batches_gieogieo', 'stock_transactions_gieogieo', 'prep_transactions_gieogieo',
  'stock_anomalies_gieogieo', 'reversal_unit_claims_gieogieo', 'prep_ingredient_locks_gieogieo', 'order_stock_traces_gieogieo']);
const ITEM_COLLS = new Set(['inventory_items_gieogieo', 'prep_items_gieogieo']);
const STATE_FIELDS = new Set(['currentStock', 'locationStock', 'unrefilledConsumption', 'refillUncertain', 'pendingShortage', 'untrackedPendingDelta', '_ueLastRecomputeStart']);
const allowFile = path.join(__dirname, 'boundary_allow.json');
const ALLOW = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {};
const WRITE = new Set(['set', 'update', 'delete', 'add']);
const RT_WRITE = new Set(['set', 'update', 'remove', 'transaction', 'push', 'setWithPriority']);

function scripts(html) { const out = []; const re = /<script>([\s\S]*?)<\/script>/g; let m; while ((m = re.exec(html))) out.push([html.slice(0, m.index + 8).split('\n').length, m[1]]); return out; }
function fieldKey(prop) {
  if (!prop || prop.type !== 'Property') return null; const k = prop.key;
  if (!prop.computed) return k.type === 'Identifier' ? k.name : (k.type === 'Literal' ? String(k.value).split('.')[0] : null);
  if (k.type === 'TemplateLiteral') return (k.quasis[0].value.cooked || '').split('.')[0] || null;
  if (k.type === 'BinaryExpression' && k.left.type === 'Literal') return String(k.left.value).split('.')[0];
  return null;
}
let violations = [];
for (const file of files) {
  const tag = /quanly/.test(file) ? 'QL' : 'POS';
  const parsed = scripts(fs.readFileSync(path.join(ROOT, file), 'utf8')).map(([start, code]) => ({ start, ast: acorn.parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, locations: true }) }));
  const consts = {};
  for (const { ast } of parsed) for (const st of ast.body) if (st.type === 'VariableDeclaration') for (const d of st.declarations)
    if (d.id.type === 'Identifier' && d.init && d.init.type === 'Literal' && typeof d.init.value === 'string') consts[d.id.name] = d.init.value;
  const strOf = n => { if (!n) return null; if (n.type === 'Literal' && typeof n.value === 'string') return n.value; if (n.type === 'Identifier' && consts[n.name]) return consts[n.name];
    if (n.type === 'TemplateLiteral') return n.quasis[0].value.cooked + (n.expressions.length ? '${}' : ''); if (n.type === 'BinaryExpression' && n.operator === '+') { const l = strOf(n.left); return l != null ? l + '…' : null; }
    if (n.type === 'ConditionalExpression') { const a = strOf(n.consequent), b = strOf(n.alternate); return a && b ? a + '|' + b : (a || b); } return null; };
  for (const { start, ast } of parsed) {
    const L = n => n.loc.start.line + start - 1;
    for (const top of ast.body) {
      let fname = '(top-level)';
      if (top.type === 'FunctionDeclaration') fname = top.id.name;
      else if (top.type === 'VariableDeclaration' && top.declarations[0] && top.declarations[0].init && /Function/.test(top.declarations[0].init.type)) fname = top.declarations[0].id.name;
      const vars = {};
      const resolve = n => {
        if (!n) return null;
        if (n.type === 'AwaitExpression') return resolve(n.argument);
        if (n.type === 'ConditionalExpression') return resolve(n.consequent) || resolve(n.alternate);
        if (n.type === 'LogicalExpression') return resolve(n.left) || resolve(n.right);
        if (n.type === 'Identifier') return vars[n.name] || null;
        if (n.type === 'MemberExpression') { const o = resolve(n.object); if (o && !n.computed && n.property.name === 'ref' && (o.kind === 'fsdoc' || o.kind === 'snap')) return { kind: 'fs', target: o.target }; if (o && !n.computed && n.property.name === 'docs' && o.kind === 'snap') return o; return o && (o.kind === 'fs' || o.kind === 'rt') ? o : null; }
        if (n.type === 'CallExpression') {
          const c = n.callee;
          if (c.type === 'Identifier' && c.name === '_ueActiveUnitsRef') return { kind: 'rt', target: 'active_units_gieogieo' };
          if (c.type === 'MemberExpression' && !c.computed) {
            const m = c.property.name;
            if (m === 'collection') { const s = strOf(n.arguments[0]); return { kind: 'fs', target: s || '(động)' }; }
            if (m === 'ref' && c.object.type === 'Identifier' && c.object.name === 'db') { const s = strOf(n.arguments[0]) || '(động)'; return { kind: 'rt', target: s.split('/')[0] }; }
            if (m === 'ref' && c.object.type === 'MemberExpression' && c.object.property && c.object.property.name === 'units') return { kind: 'rt', target: 'active_units_gieogieo' }; // UnitEngine.units.ref
            const o = resolve(c.object); if (!o) return null;
            if (o.kind === 'fs' && m === 'get') return { kind: 'snap', target: o.target };
            if (['doc', 'where', 'orderBy', 'limit', 'startAfter', 'child', 'orderByChild', 'limitToLast', 'equalTo', 'parent'].includes(m)) return o;
          }
        }
        return null;
      };
      const flag = (n, what) => { const key = tag + ':' + fname; if (!ALLOW[key]) violations.push({ file, fn: fname, line: L(n), what }); };
      const isEngineTarget = t => t && (ENGINE_COLLS.has(t) || /^\(động\)$/.test(t));
      const checkFields = (target, arg, n) => {
        if (!ITEM_COLLS.has(target) || !arg || arg.type !== 'ObjectExpression') return;
        const bad = arg.properties.map(fieldKey).filter(f => f && STATE_FIELDS.has(f));
        if (bad.length) flag(n, target + ' ghi trường tồn ' + bad.join(','));
      };
      walk.ancestor(top, {
        VariableDeclarator(n) { if (n.id.type === 'Identifier' && n.init) { const r = resolve(n.init); if (r) vars[n.id.name] = r; } },
        AssignmentExpression(n) { if (n.left.type === 'Identifier') { const r = resolve(n.right); if (r) vars[n.left.name] = r; } },
        CallExpression(n) {
          const c = n.callee; if (c.type !== 'MemberExpression' || c.computed) return;
          const m = c.property.name;
          if (['forEach', 'map', 'filter', 'find', 'some'].includes(m)) { const o = resolve(c.object); const fn = n.arguments[0]; if (o && o.kind === 'snap' && fn && fn.params && fn.params[0] && fn.params[0].type === 'Identifier') vars[fn.params[0].name] = { kind: 'fsdoc', target: o.target }; }
          if (['set', 'update', 'delete'].includes(m) && n.arguments[0]) {       // t.set(ref, …) trong transaction / batch
            const r0 = resolve(n.arguments[0]);
            if (r0 && r0.kind === 'fs' && c.object.type === 'Identifier' && !vars[c.object.name]) {
              if (isEngineTarget(r0.target)) flag(n, 'tx.' + m + ' ' + r0.target);
              else checkFields(r0.target, n.arguments[1], n);
              return;
            }
          }
          const o = resolve(c.object); if (!o) return;
          if (o.kind === 'fs' && WRITE.has(m)) {
            if (m === 'add' && /transactions/.test(o.target || '')) flag(n, '.add() trên sổ ' + o.target);
            else if (isEngineTarget(o.target)) flag(n, m + ' ' + o.target);
            else checkFields(o.target, n.arguments[0], n);
          }
          if (o.kind === 'rt' && RT_WRITE.has(m) && /^active_units/.test(o.target || '')) flag(n, 'RT ' + m + ' active_units');
        }
      });
    }
  }
}
const byFn = {};
violations.forEach(v => { const k = (/quanly/.test(v.file) ? 'QL' : 'POS') + ':' + v.fn; (byFn[k] = byFn[k] || []).push(v.line + ' ' + v.what); });
if (process.argv.includes('--json')) { console.log(JSON.stringify(byFn, null, 1)); process.exit(0); }
for (const [k, list] of Object.entries(byFn)) console.log(k.padEnd(48), list.slice(0, 3).join(' | ') + (list.length > 3 ? ' …+' + (list.length - 3) : ''));
console.log(violations.length ? `=> ${Object.keys(byFn).length} hàm vi phạm ranh giới (${violations.length} lượt ghi)` : '=> RANH GIỚI SẠCH');
process.exit(violations.length ? 1 : 0);
