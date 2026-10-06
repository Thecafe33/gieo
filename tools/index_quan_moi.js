// Danh sách COMPOSITE INDEX Firestore cần tạo cho MỘT CỬA HÀNG MỚI (đa cửa hàng — docs/KE_HOACH_DA_CUA_HANG.md Bước 4).
//
// Vì sao: index Firestore gắn với TÊN collection. Quán mới dùng collection riêng (`stock_transactions_gieogieo__gg02`…),
// nên mọi composite index quán hiện tại đang có phải tạo lại cho tên mới — thiếu thì truy vấn lọc + sắp xếp của quán
// mới LỖI, hoặc các cơ chế giảm lượt đọc lui về đọc sổ gốc (tốn gấp nhiều lần).
//
// Cách làm: quét AST posgieo.html, quanlygieo.html, engine mới nhất — mọi chuỗi collection('x').where(…).orderBy(…)
// trên dữ liệu RIÊNG TỪNG QUÁN (S) và DANH MỤC THEO QUÁN (C) trong GieoData.REG — suy ra truy vấn nào cần composite
// index (bằng nhau + khoảng / sắp xếp trên trường khác, hoặc sắp xếp nhiều trường). Truy vấn dựng qua biến
// (q = q.where…) không bắt được — bổ sung tay ở THEM bên dưới khi gặp.
//
//   node tools/index_quan_moi.js gg02            → bảng để tạo tay ở Firebase Console
//   node tools/index_quan_moi.js gg02 --json     → firestore.indexes.json (chỉ phần index của quán mới)
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), walk = require('acorn-walk');
const ROOT = path.resolve(__dirname, '..');
const storeId = process.argv[2];
const JSON_OUT = process.argv.includes('--json');
const moiNhat = re => fs.readdirSync(ROOT).filter(f => re.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();

function napGieoData() {
  const m = { exports: {} };
  new Function('window', 'module', fs.readFileSync(path.join(ROOT, moiNhat(/^data_access\.v\d+\.js$/)), 'utf8'))({}, m);
  return m.exports.GieoData;
}
// Truy vấn dựng qua biến mà quét AST không thấy — thêm tay: [collection, [[field, 'ASC'|'DESC'|'CONTAINS'], …], nơi dùng]
const THEM = [
  // _ledgerWasteRows (quanlygieo.html): fstore.collection(coll).where('type','==',type).where('businessDate','>=',…)
  ['stock_transactions_gieogieo', [['type', 'ASC'], ['businessDate', 'ASC']], 'quanlygieo.html _ledgerWasteRows'],
  ['prep_transactions_gieogieo', [['type', 'ASC'], ['businessDate', 'ASC']], 'quanlygieo.html _ledgerWasteRows'],
  // _histLoad (quanlygieo.html): fstore.collection(coll).where(field,'==',id).orderBy('createdAt','desc')
  ['stock_transactions_gieogieo', [['itemId', 'ASC'], ['createdAt', 'DESC']], 'quanlygieo.html _histLoad'],
  ['prep_transactions_gieogieo', [['prepId', 'ASC'], ['createdAt', 'DESC']], 'quanlygieo.html _histLoad']
];
// Đã rà tay 06/10 (IDX_DEBUG=1): mọi truy vấn khác dựng qua biến chỉ lọc "bằng" nhiều trường, lọc khoảng trên MỘT trường
// hoặc theo mã tài liệu (documentId) → Firestore tự phục vụ, không cần composite index.

const OP_BANG = new Set(['==', 'in', 'array-contains', 'array-contains-any']);
const OP_KHOANG = new Set(['<', '<=', '>', '>=', '!=', 'not-in']);

function quet() {
  const GD = napGieoData();
  const nguon = { 'posgieo.html': null, 'quanlygieo.html': null };
  for (const f of Object.keys(nguon)) nguon[f] = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  const eng = moiNhat(/^unit_engine\.v\d+\.js$/);
  nguon[eng] = fs.readFileSync(path.join(ROOT, eng), 'utf8');
  const out = new Map();
  for (const [ten, src] of Object.entries(nguon)) {
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
    const hang = {};   // const X = 'tên_gieogieo'
    walk.full(ast, n => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'Literal' && typeof n.init.value === 'string') hang[n.id.name] = n.init.value; });
    const giaTri = a => a && (a.type === 'Literal' ? a.value : a.type === 'Identifier' ? hang[a.name] : a.type === 'TemplateLiteral' && !a.expressions.length ? a.quasis[0].value.cooked : undefined);
    walk.ancestor(ast, {
      CallExpression(n, anc) {
        const m = n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name;
        if (m !== 'where' && m !== 'orderBy') return;
        // chỉ xử lý mắt xích NGOÀI CÙNG của chuỗi where / orderBy
        const cha = anc[anc.length - 2], ong = anc[anc.length - 3];
        if (cha && cha.type === 'MemberExpression' && cha.object === n && ong && ong.type === 'CallExpression' && ['where', 'orderBy'].includes(cha.property.name)) return;
        const menh = []; let cur = n, coll;
        while (cur && cur.type === 'CallExpression' && cur.callee.type === 'MemberExpression') {
          const p = cur.callee.property.name;
          if (p === 'where' || p === 'orderBy') menh.unshift({ p, a: cur.arguments });
          else if (p === 'collection') { coll = giaTri(cur.arguments[0]); break; }
          else if (p !== 'limit' && p !== 'startAfter' && p !== 'endBefore' && p !== 'limitToLast') break;
          cur = cur.callee.object;
        }
        const bang = [], khoang = [], sx = [];
        if (!coll) { if (process.env.IDX_DEBUG && menh.length >= 2) console.error('? ' + ten + ':' + n.loc.start.line + ' ' + src.slice(n.start, Math.min(n.end, n.start + 160)).replace(/\s+/g, ' ')); return; }
        const loai = GD.REG.fs[coll];
        if (loai !== 'S' && loai !== 'C') return;
        for (const c of menh) {
          const f = giaTri(c.a[0]); if (typeof f !== 'string') { if (process.env.IDX_DEBUG && menh.length >= 2) console.error('? ' + ten + ':' + n.loc.start.line + ' (trường động) ' + coll); return; }   // trường động — bỏ qua
          if (c.p === 'where') { const op = giaTri(c.a[1]); if (OP_BANG.has(op)) bang.push([f, op.startsWith('array-contains') ? 'CONTAINS' : 'ASC']); else if (OP_KHOANG.has(op)) khoang.push(f); }
          else sx.push([f, String(giaTri(c.a[1]) || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC']);
        }
        const coTruong = new Set([...bang.map(x => x[0]), ...khoang, ...sx.map(x => x[0])]);
        const can = (bang.length && (khoang.length || sx.length)) || sx.length >= 2 || (khoang.length && sx.length && sx[0][0] !== khoang[0]) || new Set(khoang).size >= 2;
        if (!can || coTruong.size < 2) return;
        const truong = [...bang.filter(([f]) => !khoang.includes(f) && !sx.some(s => s[0] === f))];
        if (khoang.length && !sx.some(s => s[0] === khoang[0])) truong.push([khoang[0], 'ASC']);
        sx.forEach(s => { if (!truong.some(t => t[0] === s[0])) truong.push(s); });
        const key = coll + '|' + truong.map(t => t.join(':')).join(',');
        if (!out.has(key)) out.set(key, { coll, truong, noi: new Set() });
        out.get(key).noi.add(ten + ':' + n.loc.start.line);
      }
    });
  }
  THEM.forEach(([coll, truong, noi]) => { const key = coll + '|' + truong.map(t => t.join(':')).join(','); if (!out.has(key)) out.set(key, { coll, truong, noi: new Set([noi]) }); });
  return [...out.values()].sort((a, b) => (a.coll + a.truong.join()).localeCompare(b.coll + b.truong.join()));
}

if (require.main === module) {
  if (!storeId || !/^gg\d{2}$/.test(storeId) || storeId === 'gg01') { console.log('Cách dùng: node tools/index_quan_moi.js gg02 [--json]   (mã quán mới, khác gg01)'); process.exit(1); }
  const ds = quet();
  if (JSON_OUT) {
    console.log(JSON.stringify({ indexes: ds.map(x => ({ collectionGroup: x.coll + '__' + storeId, queryScope: 'COLLECTION',
      fields: x.truong.map(([f, d]) => d === 'CONTAINS' ? { fieldPath: f, arrayConfig: 'CONTAINS' } : { fieldPath: f, order: d === 'DESC' ? 'DESCENDING' : 'ASCENDING' }) })), fieldOverrides: [] }, null, 2));
  } else {
    console.log('Composite index cần tạo cho cửa hàng ' + storeId.toUpperCase() + ' (' + ds.length + ' index) — Firebase Console ▸ Firestore ▸ Indexes ▸ Composite ▸ Create index');
    console.log('Phạm vi (Query scope): Collection. Trường theo ĐÚNG thứ tự dưới đây. Tạo xong chờ trạng thái Enabled.\n');
    ds.forEach((x, i) => console.log(String(i + 1).padStart(2) + '. ' + x.coll + '__' + storeId + '\n      ' + x.truong.map(([f, d]) => f + ' ' + (d === 'DESC' ? '↓ Descending' : d === 'CONTAINS' ? '(Array contains)' : '↑ Ascending')).join('  ·  ') + '\n      (dùng ở ' + [...x.noi].slice(0, 3).join(', ') + ')'));
  }
}
module.exports = { quet };
