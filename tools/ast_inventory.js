// Kiểm kê truy cập Firestore / RTDB theo cú pháp (AST) cho posgieo + quanlygieo.
// Xuất inv_ast.json: mỗi hàm ngoài cùng → các lượt đọc/ghi theo collection / đường dẫn RT + trường ghi.
// Chạy:  npm i acorn acorn-walk  &&  node ast_inventory.js posgieo.html quanlygieo.html
const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');

const [posPath = 'posgieo.html', qlPath = 'quanlygieo.html'] = process.argv.slice(2);
const FILES = { POS: posPath, QL: qlPath };
function extractScripts(html) {           // [[dòng bắt đầu, mã], …] của mọi <script> inline
  const out = []; const re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) out.push([html.slice(0, m.index + 8).split('\n').length, m[1]]);
  return out;
}
const FS_WRITE = new Set(['set', 'update', 'delete', 'add']);
const RT_WRITE = new Set(['set', 'update', 'remove', 'transaction', 'push', 'setWithPriority']);
const RT_READ = new Set(['once', 'on', 'get']);
const TRACK_FIELDS = new Set(['currentStock', 'locationStock', 'unrefilledConsumption', 'refillUncertain', 'pendingShortage',
  'untrackedPendingDelta', '_ueLastRecomputeStart', 'unitBase', 'qtyRemaining', 'status', 'openedAt', 'finishedAt',
  '_ueRtStale', 'qty', 'type', 'itemId', 'allocations', 'fifoAllocations', 'unitAllocations', 'voided', 'responsibility',
  'needsReview', 'substitutionQty', 'reclassifiedFrom', 'reclassifiedToConsumptionQty', 'code', 'storeId']);

function fieldName(prop) {
  if (!prop || prop.type !== 'Property') return null;
  const k = prop.key;
  if (!prop.computed) return k.type === 'Identifier' ? k.name : (k.type === 'Literal' ? String(k.value) : null);
  // computed: 'locationStock.' + x  |  `locationStock.${x}`
  if (k.type === 'BinaryExpression' && k.left.type === 'Literal') return String(k.left.value).split('.')[0];
  if (k.type === 'TemplateLiteral') return (k.quasis[0].value.cooked || '').split('.')[0] || null;
  if (k.type === 'Literal') return String(k.value).split('.')[0];
  return null;
}

const result = {};
for (const [tag, file] of Object.entries(FILES)) {
  const scripts = extractScripts(fs.readFileSync(file, 'utf8'));
  const funcs = {};            // outerName -> record
  const consts = {};           // top-level const NAME = 'string'
  const parsed = scripts.map(([start, code]) => ({ start, ast: acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }) }));

  for (const { ast } of parsed) for (const st of ast.body) {
    if (st.type === 'VariableDeclaration') for (const d of st.declarations)
      if (d.id.type === 'Identifier' && d.init && d.init.type === 'Literal' && typeof d.init.value === 'string') consts[d.id.name] = d.init.value;
  }
  const strOf = n => {
    if (!n) return null;
    if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
    if (n.type === 'Identifier' && consts[n.name]) return consts[n.name];
    if (n.type === 'TemplateLiteral') return n.quasis[0].value.cooked + (n.expressions.length ? '${…}' : '');
    if (n.type === 'BinaryExpression' && n.operator === '+') { const l = strOf(n.left); return l != null ? l + '…' : null; }
    if (n.type === 'ConditionalExpression') { const a = strOf(n.consequent), b = strOf(n.alternate); return a && b ? a + '|' + b : (a || b); }
    return null;
  };

  for (const { start, ast } of parsed) {
    const L = n => n.loc.start.line + start - 1;
    // Mỗi câu lệnh cấp cao nhất = một "hàm ngoài cùng" (hoặc (top-level))
    for (const top of ast.body) {
      let name = '(top-level)';
      if (top.type === 'FunctionDeclaration') name = top.id.name;
      else if (top.type === 'VariableDeclaration' && top.declarations[0] && top.declarations[0].init &&
        /Function|Arrow/.test(top.declarations[0].init.type)) name = top.declarations[0].id.name;
      const rec = funcs[name] = funcs[name] || { line: L(top), fsR: {}, fsW: {}, rtR: {}, rtW: {}, adds: [], fields: {} };
      const vars = {};   // tên biến -> {kind:'fs'|'rt'|'snap', target}
      const resolve = n => {             // biểu thức -> {kind, target}
        if (!n) return null;
        if (n.type === 'AwaitExpression') return resolve(n.argument);
        if (n.type === 'ConditionalExpression') return resolve(n.consequent) || resolve(n.alternate);
        if (n.type === 'LogicalExpression') return resolve(n.left) || resolve(n.right);
        if (n.type === 'Identifier') return vars[n.name] || null;
        if (n.type === 'MemberExpression') {
          const o = resolve(n.object);
          if (o && !n.computed && n.property.name === 'ref' && (o.kind === 'fsdoc' || o.kind === 'snap')) return { kind: 'fs', target: o.target };
          if (o && !n.computed && n.property.name === 'docs' && o.kind === 'snap') return { kind: 'snap', target: o.target };
          if (o && o.kind === 'snaparr') return { kind: 'fsdoc', target: o.target };
          return o && (o.kind === 'fs' || o.kind === 'rt') ? o : null;
        }
        if (n.type === 'CallExpression') {
          const c = n.callee;
          if (c.type === 'Identifier' && c.name === '_ueActiveUnitsRef') return { kind: 'rt', target: 'active_units_gieogieo' };
          if (c.type === 'MemberExpression' && !c.computed) {
            const m = c.property.name;
            if (m === 'collection') { const s = strOf(n.arguments[0]); return s ? { kind: 'fs', target: s } : { kind: 'fs', target: '(động)' }; }
            if (m === 'ref' && c.object.type === 'Identifier' && c.object.name === 'db') { const s = strOf(n.arguments[0]); return { kind: 'rt', target: (s || '(động)').split('/')[0].replace(/\$\{…\}.*/, '') || '(động)' }; }
            const o = resolve(c.object);
            if (!o) return null;
            if (o.kind === 'fs' && m === 'get') return { kind: 'snap', target: o.target };
            if (o.kind === 'rt' && m === 'once') return { kind: 'rtsnap', target: o.target };
            if (['doc', 'where', 'orderBy', 'limit', 'startAfter', 'child', 'orderByChild', 'limitToLast', 'equalTo', 'parent'].includes(m)) return o;
            return null;
          }
        }
        return null;
      };
      const bump = (map, key, op, line) => { map[key] = map[key] || {}; map[key][op] = map[key][op] || []; if (map[key][op].length < 6) map[key][op].push(line); };
      const noteFields = (coll, arg) => {
        if (!arg || arg.type !== 'ObjectExpression') return;
        for (const p of arg.properties) { const f = fieldName(p); if (f && TRACK_FIELDS.has(f)) { rec.fields[coll] = rec.fields[coll] || new Set(); rec.fields[coll].add(f); } }
      };
      walk.ancestor(top, {
        VariableDeclarator(n) { if (n.id.type === 'Identifier' && n.init) { const r = resolve(n.init); if (r) vars[n.id.name] = r; } },
        AssignmentExpression(n) { if (n.left.type === 'Identifier') { const r = resolve(n.right); if (r) vars[n.left.name] = r; } },
        CallExpression(n) {
          const c = n.callee;
          if (c.type !== 'MemberExpression' || c.computed) return;
          const m = c.property.name;
          // snapshot iteration: snap.forEach(d=>…) / snap.docs.map(d=>…)
          if (['forEach', 'map', 'filter', 'find', 'some'].includes(m)) {
            const o = resolve(c.object);
            const fn = n.arguments[0];
            if (o && o.kind === 'snap' && fn && fn.params && fn.params[0] && fn.params[0].type === 'Identifier') vars[fn.params[0].name] = { kind: 'fsdoc', target: o.target };
          }
          // transaction/batch: t.set(ref, data) / t.update(ref, data) / t.delete(ref) / t.get(ref)
          if (['set', 'update', 'delete', 'get'].includes(m) && n.arguments[0]) {
            const r0 = resolve(n.arguments[0]);
            if (r0 && r0.kind === 'fs' && c.object.type === 'Identifier' && !vars[c.object.name]) {
              if (m === 'get') bump(rec.fsR, r0.target, 'tx.get', L(n));
              else { bump(rec.fsW, r0.target, 'tx.' + m, L(n)); noteFields(r0.target, n.arguments[1]); }
              return;
            }
          }
          const o = resolve(c.object);
          if (!o) return;
          if (o.kind === 'fs') {
            if (FS_WRITE.has(m)) { bump(rec.fsW, o.target, m, L(n)); noteFields(o.target, n.arguments[0]); if (m === 'add') rec.adds.push([o.target, L(n)]); }
            else if (m === 'get' || m === 'onSnapshot') bump(rec.fsR, o.target, m, L(n));
          } else if (o.kind === 'rt') {
            if (RT_WRITE.has(m)) bump(rec.rtW, o.target, m, L(n));
            else if (RT_READ.has(m)) bump(rec.rtR, o.target, m, L(n));
          }
        }
      });
    }
  }
  for (const r of Object.values(funcs)) for (const k in r.fields) r.fields[k] = [...r.fields[k]].sort();
  result[tag] = funcs;
}
fs.writeFileSync('inv_ast.json', JSON.stringify(result, null, 1));
for (const tag in result) {
  const f = result[tag]; let w = 0, rw = 0;
  for (const r of Object.values(f)) { if (Object.keys(r.fsW).length) w++; if (Object.keys(r.rtW).length) rw++; }
  console.log(tag, 'functions', Object.keys(f).length, 'with FS writes', w, 'with RT writes', rw);
}
