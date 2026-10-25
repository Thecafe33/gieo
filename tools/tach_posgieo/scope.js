// Bộ phân giải PHẠM VI BIẾN cho công cụ bản đồ tách posgieo (tools/tach_posgieo/ban_do.js). CHỈ ĐỌC.
// freeRefs(node) → Set tên được THAM CHIẾU trong node mà không phân giải được về khai báo nào bên trong node
// (tức là tên toàn cục / cấp cao). Theo đúng phạm vi JS:
//   - var + function trong thân hàm → phạm vi hàm (hoisting);
//   - let / const / class / function trong khối → phạm vi khối (gần đúng chế độ strict cho function trong khối:
//     tham chiếu ngoài khối bị tính là tự do → có thể DƯ, không THIẾU);
//   - tham số, tên biểu thức hàm, tên class biểu thức, biến catch, let/const của for / for-in / for-of, switch.
// Tên khai báo ở phạm vi con KHÔNG che tham chiếu ở phạm vi ngoài (lỗi của bản đầu — kiểm tra độc lập lượt 01 mục 2).
'use strict';
const walk = require('acorn-walk');

function patNames(p, out) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': p.properties.forEach(q => patNames(q.type === 'RestElement' ? q.argument : q.value, out)); break;
    case 'ArrayPattern': p.elements.forEach(e => patNames(e, out)); break;
    case 'RestElement': patNames(p.argument, out); break;
    case 'AssignmentPattern': patNames(p.left, out); break;
  }
  return out;
}
// biểu thức nằm TRONG mẫu khai báo (giá trị mặc định, khoá tính toán) — là tham chiếu
function patExprs(p, st, c) {
  if (!p) return;
  switch (p.type) {
    case 'ObjectPattern': p.properties.forEach(q => { if (q.type === 'RestElement') patExprs(q.argument, st, c); else { if (q.computed) c(q.key, st); patExprs(q.value, st, c); } }); break;
    case 'ArrayPattern': p.elements.forEach(e => patExprs(e, st, c)); break;
    case 'RestElement': patExprs(p.argument, st, c); break;
    case 'AssignmentPattern': patExprs(p.left, st, c); c(p.right, st); break;
  }
}
// var + function khai báo trong thân hàm (không vào hàm con)
function hoistVars(body, set) {
  const visit = n => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach(d => patNames(d.id, []).forEach(x => set.add(x)));
    if (/Function/.test(n.type) || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') return;
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'range') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && visit(x));
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(body);
}
function lexical(stmts, set) {
  for (const s of stmts) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') s.declarations.forEach(d => patNames(d.id, []).forEach(x => set.add(x)));
    else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) set.add(s.id.name);
  }
}
const mk = (parent, names) => ({ parent, names: names || new Set() });
const has = (sc, n) => { for (let s = sc; s; s = s.parent) if (s.names.has(n)) return true; return false; };

function freeRefs(root) {
  const free = new Set();
  const fn = (node, sc, c) => {
    const s = mk(sc);
    if (node.type === 'FunctionExpression' && node.id) s.names.add(node.id.name);
    node.params.forEach(p => patNames(p, []).forEach(x => s.names.add(x)));
    if (node.body.type === 'BlockStatement') { hoistVars(node.body, s.names); lexical(node.body.body, s.names); }
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') s.names.add('arguments');
    node.params.forEach(p => patExprs(p, s, c));
    if (node.body.type === 'BlockStatement') node.body.body.forEach(x => c(x, s)); else c(node.body, s);
  };
  const V = {
    Program(node, sc, c) { const s = mk(sc); hoistVars(node, s.names); lexical(node.body, s.names); node.body.forEach(x => c(x, s)); },
    FunctionDeclaration: fn, FunctionExpression: fn, ArrowFunctionExpression: fn,
    BlockStatement(node, sc, c) { const s = mk(sc); lexical(node.body, s.names); node.body.forEach(x => c(x, s)); },
    StaticBlock(node, sc, c) { const s = mk(sc); lexical(node.body, s.names); node.body.forEach(x => c(x, s)); },
    SwitchStatement(node, sc, c) { c(node.discriminant, sc); const s = mk(sc); node.cases.forEach(k => lexical(k.consequent, s.names)); node.cases.forEach(k => { if (k.test) c(k.test, s); k.consequent.forEach(x => c(x, s)); }); },
    ForStatement(node, sc, c) { const s = mk(sc); if (node.init && node.init.type === 'VariableDeclaration' && node.init.kind !== 'var') lexical([node.init], s.names); if (node.init) c(node.init, s); if (node.test) c(node.test, s); if (node.update) c(node.update, s); c(node.body, s); },
    ForInStatement(node, sc, c) { const s = mk(sc); if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') lexical([node.left], s.names); c(node.left, s); c(node.right, s); c(node.body, s); },
    ForOfStatement(node, sc, c) { V.ForInStatement(node, sc, c); },
    CatchClause(node, sc, c) { const s = mk(sc); patNames(node.param, []).forEach(x => s.names.add(x)); patExprs(node.param, s, c); c(node.body, s); },
    ClassDeclaration(node, sc, c) { V.Class(node, sc, c); }, ClassExpression(node, sc, c) { V.Class(node, sc, c); },
    Class(node, sc, c) { const s = mk(sc); if (node.id) s.names.add(node.id.name); if (node.superClass) c(node.superClass, s); node.body.body.forEach(m => { if (m.computed) c(m.key, s); if (m.value) c(m.value, s); if (m.type === 'StaticBlock') c(m, s); }); },
    VariableDeclaration(node, sc, c) { node.declarations.forEach(d => { patExprs(d.id, sc, c); if (d.init) c(d.init, sc); }); },
    MemberExpression(node, sc, c) { c(node.object, sc); if (node.computed) c(node.property, sc); },
    Property(node, sc, c) { if (node.computed) c(node.key, sc); c(node.value, sc); },
    MethodDefinition(node, sc, c) { if (node.computed) c(node.key, sc); c(node.value, sc); },
    PropertyDefinition(node, sc, c) { if (node.computed) c(node.key, sc); if (node.value) c(node.value, sc); },
    LabeledStatement(node, sc, c) { c(node.body, sc); }, BreakStatement() {}, ContinueStatement() {},
    MetaProperty() {},
    Identifier(node, sc) { if (!has(sc, node.name)) free.add(node.name); },
    // acorn-walk gọi 'VariablePattern' cho tên ở VẾ TRÁI phép gán (x = …, for (x in …)) — là tham chiếu.
    // (Tên trong khai báo không tới đây: khai báo, tham số, catch, class đều xử lý riêng ở trên.)
    VariablePattern(node, sc) { if (!has(sc, node.name)) free.add(node.name); },
    // phép gán vào mẫu ({a} = x) — các tên trong mẫu là THAM CHIẾU (ghi vào biến ngoài)
    AssignmentPattern(node, sc, c) { c(node.left, sc); c(node.right, sc); },
    ObjectPattern(node, sc, c) { node.properties.forEach(q => { if (q.type === 'RestElement') c(q.argument, sc); else { if (q.computed) c(q.key, sc); c(q.value, sc); } }); },
    ArrayPattern(node, sc, c) { node.elements.forEach(e => e && c(e, sc)); },
    RestElement(node, sc, c) { c(node.argument, sc); }
  };
  walk.recursive(root, null, V, walk.base);
  return free;
}
module.exports = { freeRefs, patNames };
