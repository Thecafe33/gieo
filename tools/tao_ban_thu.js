// Sinh BẢN THỬ (khoá cứng CHẾ ĐỘ THỬ) từ code trong thư mục này, ghi vào THƯ MỤC DEPLOY:
//   posgieo_thu.html, quanlygieo_thu.html  (+ chép unit_engine.v*.js, che_do_thu.v*.js)
// posgieo.html / quanlygieo.html trong thư mục deploy KHÔNG bị đụng — máy thật vẫn chạy bản đang chạy.
//
//   node tools/tao_ban_thu.js <thư mục deploy>
//
// Mỗi bản thử được chèn:
//   1. <script src="che_do_thu.v1.js"> ngay trước <script src="unit_engine…">;
//   2. chốt ở ĐẦU khối script chính: thiếu che_do_thu.v1.js → dừng TRƯỚC khi khởi tạo Firebase
//      (db / fstore chưa tồn tại → không lệnh ghi nào chạy được, kể cả từ nút onclick);
//   3. GieoThu.install(...) ngay sau `const fstore = firebase.firestore();` — chuyển mọi đọc/ghi vào vùng thử;
//   4. tiêu đề "[THỬ] ".
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const outArg = process.argv[2];
if (!outArg) { console.log('Cách dùng: node tools/tao_ban_thu.js <thư mục deploy>'); process.exit(1); }
const OUT = path.resolve(outArg);
if (!fs.existsSync(OUT)) { console.log('❌ Không thấy thư mục ' + OUT); process.exit(1); }
const THU = fs.readdirSync(ROOT).filter(f => /^che_do_thu\.v\d+\.js$/.test(f)).sort();
if (!THU.length) { console.log('❌ Thiếu che_do_thu.v*.js trong ' + ROOT); process.exit(1); }
const THU_FILE = THU[THU.length - 1];
// Mã nội dung (?b=…) gắn vào đường dẫn engine / che_do_thu của BẢN THỬ: sửa engine trong lúc thử thì máy
// thử luôn tải bản mới (không bị cache cũ giữ lại), dù file giữ nguyên tên.
const hashOf = f => require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 10);

const GUARD = "// [BẢN THỬ] Thiếu che_do_thu → DỪNG trước khi khởi tạo Firebase (không đọc/ghi được gì).\n" +
  "if (!window.GieoThu) { document.body.insertAdjacentHTML('afterbegin', '<div style=\"position:fixed;inset:0;z-index:2147483647;background:#b91c1c;color:#fff;font:700 18px/1.5 sans-serif;padding:30px\">⛔ BẢN THỬ không tải được ' + " + JSON.stringify(THU_FILE) + " + ' — đã dừng, không ghi gì. Tải lại trang.</div>'); throw new Error('Bản thử: thiếu che_do_thu'); }\n";
function tao(src, dst, app) {
  let h = fs.readFileSync(path.join(ROOT, src), 'utf8');
  const one = (re, what) => { const n = (h.match(re) || []).length; if (n !== 1) throw new Error(src + ': cần đúng 1 ' + what + ', thấy ' + n); };
  one(/<script src="unit_engine\.v\d+\.js"><\/script>/g, 'thẻ script engine');
  one(/const fstore\s*=\s*firebase\.firestore\(\);/g, 'dòng tạo fstore');
  if (/GieoThu\.install/.test(h) || /che_do_thu\./.test(h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '').replace(/GieoThu && GieoThu/g, '')))
    throw new Error(src + ': file nguồn đã có chế độ thử — phải sinh từ bản THẬT');
  h = h.replace(/<script src="(unit_engine\.v\d+\.js)"><\/script>/, (m, f) =>
    '<script src="' + THU_FILE + '?b=' + hashOf(THU_FILE) + '"></script>\n<script src="' + f + '?b=' + hashOf(f) + '"></script>');
  // khối script chính = khối inline chứa dòng tạo fstore
  const iF = h.search(/const fstore\s*=\s*firebase\.firestore\(\);/);
  const iS = h.lastIndexOf('<script>', iF);
  if (iS < 0) throw new Error(src + ': không thấy <script> chứa dòng tạo fstore');
  h = h.slice(0, iS + 8) + '\n' + GUARD + h.slice(iS + 8);
  h = h.replace(/(const fstore\s*=\s*firebase\.firestore\(\);)/, "$1\nGieoThu.install({ app: '" + app + "', firebase, db, fstore });   // [BẢN THỬ] mọi đọc/ghi → vùng thử");
  h = h.replace(/<title>/, '<title>[THỬ] ');
  // kiểm lại
  if ((h.match(/GieoThu\.install\(/g) || []).length !== 1) throw new Error(dst + ': chèn install lỗi');
  if (h.indexOf('GieoThu.install(') < h.indexOf("if (!window.GieoThu)")) throw new Error(dst + ': thứ tự chốt/install sai');
  if (h.indexOf("if (!window.GieoThu)") > h.search(/firebase\.initializeApp\(/)) throw new Error(dst + ': chốt phải nằm trước initializeApp');
  fs.writeFileSync(path.join(OUT, dst), h);
  console.log('✅ ' + dst);
}
try {
  tao('posgieo.html', 'posgieo_thu.html', 'pos');
  tao('quanlygieo.html', 'quanlygieo_thu.html', 'quanly');
} catch (e) { console.log('❌ ' + e.message); process.exit(1); }
if (OUT !== ROOT) for (const f of fs.readdirSync(ROOT).filter(f => /^(unit_engine|che_do_thu)\.v\d+\.js$/.test(f))) {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)); console.log('✅ ' + f);
}
console.log('Xong. Mở /posgieo_thu.html và /quanlygieo_thu.html sau khi deploy. App thật không đổi.');
