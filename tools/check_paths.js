// Chốt chặn đa cửa hàng (Bước 1 — docs/KE_HOACH_DA_CUA_HANG.md): mọi tên collection Firestore / gốc Realtime DB /
// đường dẫn Storage mà posgieo.html, quanlygieo.html và Unit Engine dùng PHẢI có trong bảng đăng ký của
// data_access.v1.js — để lớp đường dẫn biết dữ liệu nào riêng từng quán (S), dùng chung (G), dùng chung với
// XOFA / The Cafe 33 (X). Tên mới chưa đăng ký → báo lỗi (predeploy_check chặn deploy).
//
//   node tools/check_paths.js            (in "ĐƯỜNG DẪN SẠCH" nếu đạt)
//   node tools/check_paths.js --list     (in mọi tên tìm thấy + nơi dùng)
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), walk = require('acorn-walk');
const ROOT = process.env.CHECK_PATHS_ROOT ? path.resolve(process.env.CHECK_PATHS_ROOT) : path.resolve(__dirname, '..');
const LIST = process.argv.includes('--list');

function scripts(file) {
  const t = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.js')) return [[1, t]];
  const o = [], re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(t))) o.push([t.slice(0, m.index + 8).split('\n').length, m[1]]);
  return o;
}
const engineFile = (() => {
  const m = /<script src="(unit_engine\.v\d+\.js)/.exec(fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8'));
  return m ? m[1] : null;
})();
const FILES = ['posgieo.html', 'quanlygieo.html'].concat(engineFile ? [engineFile] : []);

// Đọc bảng đăng ký từ data_access.v1.js (không chạy trình duyệt — chỉ lấy GieoData.REG).
function loadRegistry() {
  const src = fs.readFileSync(path.join(ROOT, 'data_access.v1.js'), 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  new Function('window', 'module', src)(sandbox.window, sandbox.module);
  const G = sandbox.module.exports.GieoData || sandbox.window.GieoData;
  return G;
}

const found = [];   // {kind:'fs'|'rt'|'st', name, file, line, how}
const chuoi = {};   // mọi chuỗi dạng …_gieogieo trong code → nơi xuất hiện (bắt cả tên truyền qua biến / tham số)
const dynamic = []; // lời gọi không xác định được tên
for (const file of FILES) {
  for (const [start, code] of scripts(path.join(ROOT, file))) {
    let ast;
    try { ast = acorn.parse(code, { ecmaVersion: 'latest', locations: true, allowReturnOutsideFunction: true }); }
    catch (e) { console.log('❌ Không đọc được ' + file + ': ' + e.message); process.exit(1); }
    // hằng chuỗi cấp cao nhất + hằng trong IIFE (engine) — tên hằng → giá trị
    const consts = {};
    walk.simple(ast, { VariableDeclarator(d) {
      if (d.id.type === 'Identifier' && d.init && d.init.type === 'Literal' && typeof d.init.value === 'string') consts[d.id.name] = d.init.value;
    } });
    // khối P của engine: P.ten = () => 'chuỗi' | (x) => 'chuỗi/' + x
    const pFns = {};
    walk.simple(ast, { VariableDeclarator(d) {
      if (d.id.type === 'Identifier' && d.id.name === 'P' && d.init && d.init.type === 'ObjectExpression')
        d.init.properties.forEach(pr => { if (pr.key && pr.value && /Function/.test(pr.value.type)) pFns[pr.key.name] = pr.value.body; });
    } });
    const strOf = n => {
      if (!n) return null;
      if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
      if (n.type === 'Identifier' && consts[n.name] != null) return consts[n.name];
      if (n.type === 'TemplateLiteral') return n.quasis[0].value.cooked + (n.expressions.length ? '${…}' : '');
      if (n.type === 'BinaryExpression' && n.operator === '+') { const l = strOf(n.left); return l != null ? l + '${…}' : null; }
      if (n.type === 'ConditionalExpression') { const a = strOf(n.consequent), b = strOf(n.alternate); return a != null && b != null ? a + '|' + b : null; }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'P') {
        const body = pFns[n.callee.property.name];
        if (body && body.type !== 'BlockStatement') return strOf(body);
        if (body && body.type === 'BlockStatement') return null;
      }
      return null;
    };
    const ghiChuoi = (v, n) => { const h = String(v || '').replace(/^\/+/, '').split('/')[0]; if (/^[A-Za-z_]+_gieogieo(_archive)?$/.test(h)) (chuoi[h] = chuoi[h] || []).push(file + ':' + (n.loc.start.line + start - 1)); };
    walk.simple(ast, { Literal(n) { if (typeof n.value === 'string') ghiChuoi(n.value, n); }, TemplateElement(n) { ghiChuoi(n.value.cooked, n); } });
    walk.ancestor(ast, { CallExpression(n, anc) {
      if (n.callee.type !== 'MemberExpression' || n.callee.computed) return;
      const p = n.callee.property.name;
      if (!['collection', 'ref', 'doc', 'collectionGroup', 'refFromURL', 'child'].includes(p)) return;
      const line = n.loc.start.line + start - 1;
      const objSrc = code.slice(n.callee.object.start, n.callee.object.end);
      if (p === 'collectionGroup' || p === 'refFromURL') { dynamic.push({ file, line, how: p + ' (bị chặn ở lớp đường dẫn)', src: code.slice(n.start, Math.min(n.end, n.start + 90)) }); return; }
      if (p === 'child') return;   // con của một ref đã được ánh xạ ở gốc
      if (p === 'ref' && /(^|\.)units$/.test(objSrc)) return;   // UnitEngine.units.ref(itemId) — API engine, bên trong gọi db.ref đã bọc
      // collection gọi trên DocumentReference (…doc(x).collection('sub')) = collection con → nằm dưới gốc đã ánh xạ
      if (p === 'collection' && /\.doc\(|\.ref$|\bref\b|Ref$/.test(objSrc) && !/^(fstore|C\.fstore|this\.fstore|fs|db)$/.test(objSrc)) return;
      if (p === 'doc' && !/^(fstore|C\.fstore)$/.test(objSrc)) return;   // .doc() của collection — không phải fstore.doc(path)
      if (p === 'ref' && !n.arguments.length) { dynamic.push({ file, line, how: 'ref() không đối số (gốc)', src: code.slice(n.start, Math.min(n.end, n.start + 90)) }); return; }
      const kind = p === 'ref' ? (/storage|\bst\b|stor/i.test(objSrc) ? 'st' : 'rt') : 'fs';
      const s = strOf(n.arguments[0]);
      if (s == null) { dynamic.push({ file, line, how: kind + ' — tên không xác định', src: code.slice(n.start, Math.min(n.end, n.start + 90)) }); return; }
      for (const one of s.split('|')) {
        const name = one.replace(/^\/+/, '').split('/')[0].split('${…}')[0];
        if (!name) { dynamic.push({ file, line, how: kind + ' — tên bắt đầu bằng biến', src: code.slice(n.start, Math.min(n.end, n.start + 90)) }); continue; }
        found.push({ kind, name, file, line });
      }
    } });
  }
}

const G = loadRegistry();
const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'paths_allow.json'), 'utf8'));
const loi = [];
const byName = {};
for (const f of found) (byName[f.kind + ':' + f.name] = byName[f.kind + ':' + f.name] || []).push(f.file + ':' + f.line);
for (const key of Object.keys(byName).sort()) {
  const [kind, name] = [key.slice(0, 2), key.slice(3)];
  const reg = kind === 'fs' ? G.REG.fs[name] : kind === 'rt' ? G.REG.rt[name] : G.REG.st[name];
  if (LIST) console.log((reg || '??').padEnd(3), key.padEnd(48), byName[key].slice(0, 3).join(', ') + (byName[key].length > 3 ? ' …(' + byName[key].length + ')' : ''));
  if (!reg) loi.push('Chưa đăng ký ' + key + ' (dùng ở ' + byName[key].slice(0, 3).join(', ') + ') — thêm vào GieoData.REG trong data_access.v1.js (S / G / X)');
}
// Lời gọi dùng tên trong biến: tên thật luôn xuất hiện dưới dạng chuỗi ở đâu đó → mọi chuỗi dạng …_gieogieo phải đã đăng ký
// (hoặc được khai là KHÔNG phải đường dẫn trong tools/paths_allow.json). Lúc chạy, lớp bọc còn kiểm lần nữa.
for (const h of Object.keys(chuoi).sort()) {
  if (G.REG.fs[h] || G.REG.rt[h] || G.REG.st[h] || ALLOW.khong_phai_duong_dan[h]) continue;
  loi.push('Chuỗi "' + h + '" giống tên dữ liệu nhưng chưa đăng ký (ở ' + chuoi[h].slice(0, 3).join(', ') + ') — đăng ký trong data_access.v1.js, hoặc khai trong tools/paths_allow.json nếu không phải đường dẫn');
}
for (const d of dynamic) {
  if (/collectionGroup|refFromURL|ref\(\) không đối số/.test(d.how)) loi.push('Lời gọi bị cấm ở lớp đường dẫn: ' + d.file + ':' + d.line + ' ' + d.src.replace(/\s+/g, ' '));
  else if (LIST) console.log('…   (tên trong biến) ' + d.file + ':' + d.line + ' ' + d.src.replace(/\s+/g, ' ').slice(0, 70));
}
// Hai app thật phải nạp data_access đúng 1 lần, trước engine, và gọi install đúng 1 lần ngay sau khi tạo fstore.
for (const h of ['posgieo.html', 'quanlygieo.html']) {
  const t = fs.readFileSync(path.join(ROOT, h), 'utf8');
  const tags = t.match(/<script src="data_access\.v\d+\.js[^"]*"><\/script>/g) || [];
  if (tags.length !== 1) loi.push(h + ': phải nạp đúng 1 data_access.v*.js (thấy ' + tags.length + ')');
  const iDa = t.indexOf('<script src="data_access'), iEng = t.indexOf('<script src="unit_engine');
  if (iDa < 0 || iEng < 0 || iDa > iEng) loi.push(h + ': data_access phải nạp TRƯỚC unit_engine');
  const inst = (t.match(/GieoData\.install\(/g) || []).length;
  if (inst !== 1) loi.push(h + ': phải gọi GieoData.install đúng 1 lần (thấy ' + inst + ')');
  const iF = t.search(/const fstore\s*=\s*firebase\.firestore\(\);/), iI = t.indexOf('GieoData.install(');
  if (iF < 0 || iI < iF) loi.push(h + ': GieoData.install phải nằm SAU dòng tạo fstore');
  // không được có lời gọi Firebase nào giữa dòng tạo fstore và install (ngoài GieoThu.install của bản thử)
  const giua = t.slice(iF, iI).replace(/const fstore\s*=\s*firebase\.firestore\(\);/, '').replace(/GieoThu\.install\([^)]*\);[^\n]*/, '');
  if (/\.(collection|ref|doc)\(/.test(giua)) loi.push(h + ': có lời gọi collection/ref/doc trước GieoData.install');
}
// REST thẳng vào Realtime DB (không qua SDK) phải tự đổi đường dẫn qua GieoData.rtPath.
for (const h of ['posgieo.html', 'quanlygieo.html']) {
  const t = fs.readFileSync(path.join(ROOT, h), 'utf8');
  const re = /fetch\(`\$\{RTDB_URL\}/g; let m;
  while ((m = re.exec(t))) {
    const truoc = t.slice(Math.max(0, m.index - 600), m.index);
    if (!/GieoData\.rtPath\(/.test(truoc)) loi.push(h + ':' + t.slice(0, m.index).split('\n').length + ': fetch REST tới Realtime DB không qua GieoData.rtPath');
  }
}
if (loi.length) { loi.forEach(x => console.log('❌ ' + x)); console.log('=> ĐƯỜNG DẪN CHƯA SẠCH (' + loi.length + ' lỗi)'); process.exit(1); }
console.log('=> ĐƯỜNG DẪN SẠCH (' + Object.keys(byName).length + ' tên, ' + found.length + ' lời gọi; ' + dynamic.length + ' lời gọi động đã duyệt)');
