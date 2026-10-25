// Công cụ bản đồ tách posgieo (tools/tach_posgieo/ban_do.js + scope.js) — các ca kiểm tra độc lập lượt 01 phát hiện:
//   (2) tên khai báo ở phạm vi con không được che tham chiếu ở phạm vi ngoài;
//   (3) handler dựng gián tiếp trong template (setBatchUnitIce / setBatchItemIce) phải được thấy;
//   JS ngoài tham chiếu biến/hàm của app theo tên thường (curOid, POSPrinter…) phải được thấy.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const acorn = require('acorn');
const ROOT = path.resolve(__dirname, '..');
const { freeRefs } = require(path.join(ROOT, 'tools/tach_posgieo/scope.js'));
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const fr = code => [...freeRefs(acorn.parse(code, { ecmaVersion: 'latest' }).body[0])].sort();

eq(fr('function f(){ if(a){ let cart=1; } return cart.length; }'), ['a', 'cart'], 'let trong khối con không che tham chiếu ngoài khối');
eq(fr('function f(){ { const helper=1; } return helper(); }'), ['helper'], 'const trong khối con không che lời gọi ngoài');
eq(fr('function f(x=y){ var q; try{}catch(e){e;z} for(const k of K){k} g=1; ({h}=o); return function n(){n;arguments} }'), ['K', 'g', 'h', 'o', 'y', 'z'], 'tham số, var, catch, for-of, gán (kể cả gán mẫu), biểu thức hàm có tên');
eq(fr('function f(){ class C extends B { m(){ return C } } const {a=d,[e]:b}=w; l: for(;;){break l} return obj.p + obj[key] + ({k:v,[kk]:vv}).k }'), ['B', 'd', 'e', 'key', 'kk', 'obj', 'v', 'vv', 'w'], 'class, mặc định/khoá tính toán trong mẫu, nhãn, thuộc tính');
eq(fr('function f(){ g(); function g(){} var v = 1; return v; }'), [], 'function/var trong thân hàm được hoisting');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bando-'));
fs.writeFileSync(path.join(dir, 'a.html'), `<html><body><button onclick="dung()">x</button>
<script>
let cart = [];
let curOid = null;
function helper(){ return 1; }
function f(){ if (true) { let cart = 2; const helper = 3; } return cart.length + helper(); }
function dung(){ return optsHtml(m => \`setIce('\${m}')\`); }
function setIce(m){}
function khongGoi(){}
function optsHtml(fn){ return '<i onclick="' + fn(1) + '">'; }
</script></body></html>`);
fs.writeFileSync(path.join(dir, 'ngoai.js'), "(function(){ var curOid2 = 1; window.x = curOid; boc('dung'); function helper(){} })();");
const out = JSON.parse(execFileSync('node', [path.join(ROOT, 'tools/tach_posgieo/ban_do.js'), '--html', path.join(dir, 'a.html'), '--ext', path.join(dir, 'ngoai.js'), '--ten', 'f,setIce,dung,khongGoi,curOid,helper'], { encoding: 'utf8' }));
const by = Object.fromEntries(out.map(t => [t.name, t]));
eq(by.f.deps, ['cart', 'helper'], 'bản đồ: f phụ thuộc cart + helper dù khối con khai báo trùng tên');
eq(by.setIce.handlers, ['js-chuỗi-gọi'], 'bản đồ: handler dựng trong template được thấy');
eq(by.dung.handlers, ['html'], 'bản đồ: handler HTML tĩnh');
eq(by.khongGoi.handlers, [], 'bản đồ: hàm không ai gọi từ chuỗi → không có handler');
eq(by.curOid.ext.length, 1, 'bản đồ: JS ngoài đọc biến thường (curOid) được thấy');
eq(by.dung.ext.map(x => /\(chuỗi\)$/.test(x)), [true], 'bản đồ: tên trong chuỗi (boc(\'dung\')) đánh dấu riêng');
eq(by.helper.ext, [], 'bản đồ: JS ngoài tự khai báo trùng tên → không tính');
fs.rmSync(dir, { recursive: true, force: true });
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
