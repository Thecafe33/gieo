// Quy tắc nguồn khi tách posgieo (kế hoạch 5.1, 5.3, Q2, T6) — chạy trên repo THẬT:
//   - mỗi tên cấp cao chỉ khai báo MỘT lần trên toàn bộ mã của app (inline + js/…): chuyển ra file thì xoá khỏi inline;
//   - file js/posgieo/… tên viết thường dạng ten.vN.js; câu lệnh ĐẦU đặt dấu PosGieoMods.<tên>='dang', câu CUỐI = true
//     (mẫu nạp lại chỉ nạp khi dấu undefined — 5.3);
//   - file js/posgieo/… chỉ có khai báo + hai dấu (bước R: không lệnh tự chạy — 5.1).
const fs = require('fs'), path = require('path'), acorn = require('acorn');
const { nguonCua } = require('../tools/tach_posgieo/nguon');
const ROOT = path.resolve(__dirname, '..');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
for (const app of ['posgieo.html', 'quanlygieo.html']) {
  const dem = {}, noi = {};
  for (const x of nguonCua(app)) for (const st of acorn.parse(x.code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }).body) {
    const ten = st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name) : [];
    ten.forEach(n => { dem[n] = (dem[n] || 0) + 1; (noi[n] = noi[n] || []).push(x.file); });
  }
  const trung = Object.keys(dem).filter(n => dem[n] > 1);
  chk(!trung.length, app + ': mỗi tên cấp cao khai báo một lần (inline + js/…)' + (trung.length ? ' — trùng: ' + trung.map(n => n + ' @' + noi[n].join('+')).join(', ') : ''));
}
const dir = path.join(ROOT, 'js', 'posgieo');
const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
for (const f of files) {
  chk(/^[a-z0-9_]+\.v\d+\.js$/.test(f), 'js/posgieo/' + f + ': tên viết thường dạng ten.vN.js');
  const body = acorn.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { ecmaVersion: 'latest' }).body;
  const dau = (st, gt) => st && st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' && st.expression.right.type === 'Literal' && st.expression.right.value === gt && /PosGieoMods/.test(JSON.stringify(st.expression.left));
  chk(dau(body[0], 'dang') && dau(body[body.length - 1], true), 'js/posgieo/' + f + ': câu đầu PosGieoMods.x=\'dang\', câu cuối PosGieoMods.x=true');
  const tuChay = body.slice(1, -1).filter(st => !/^(FunctionDeclaration|ClassDeclaration|VariableDeclaration)$/.test(st.type));
  chk(!tuChay.length, 'js/posgieo/' + f + ': chỉ có khai báo (không lệnh tự chạy)');
}
chk(true, 'js/posgieo hiện có ' + files.length + ' file');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
