// Sinh BẢN ĐO lượt đọc (T1 — docs/KE_HOACH_TOI_UU_DOC.md) từ code trong thư mục này, ghi vào THƯ MỤC DEPLOY:
//   posgieo_dem.html, quanlygieo_dem.html  (+ dem_luot_doc.v1.js chép từ tools/dem_luot_doc.js)
// = app THẬT, chạy DỮ LIỆU THẬT (không phải vùng thử), chỉ thêm bộ đếm lượt đọc + nút 📊 góc dưới trái.
// posgieo.html / quanlygieo.html KHÔNG bị đụng — máy bán hàng (APK) vẫn chạy bản thật.
// Dùng cho máy không mở được Console (máy tính bảng): mở /posgieo_dem.html hoặc /quanlygieo_dem.html bằng Chrome.
// Đo xong: xoá 3 file này khỏi thư mục deploy rồi deploy lại.
//
//   node tools/tao_ban_dem.js <thư mục deploy>
//
// Chèn <script src="dem_luot_doc.v1.js?b=…"> NGAY SAU thẻ firebase-firestore-compat.js — trước mọi code của app,
// để đếm được cả lượt đọc lúc khởi động. Tiêu đề thêm "[ĐO] ".
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const outArg = process.argv[2];
if (!outArg) { console.log('Cách dùng: node tools/tao_ban_dem.js <thư mục deploy>'); process.exit(1); }
const OUT = path.resolve(outArg);
if (!fs.existsSync(OUT)) { console.log('❌ Không thấy thư mục ' + OUT); process.exit(1); }
const DEM_SRC = path.join(ROOT, 'tools', 'dem_luot_doc.js');
const DEM_FILE = 'dem_luot_doc.v1.js';
const dem = fs.readFileSync(DEM_SRC);
const hash = require('crypto').createHash('sha1').update(dem).digest('hex').slice(0, 10);

function tao(src, dst) {
  let h = fs.readFileSync(path.join(ROOT, src), 'utf8');
  const re = /<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore-compat\.js"><\/script>/g;
  const n = (h.match(re) || []).length;
  if (n !== 1) throw new Error(src + ': cần đúng 1 thẻ firebase-firestore-compat.js, thấy ' + n);
  if (/che_do_thu\.|GieoThu\.install|dem_luot_doc\./.test(h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '').replace(/GieoThu && GieoThu/g, '')))
    throw new Error(src + ': file nguồn đã có chế độ thử / bộ đếm — phải sinh từ bản THẬT');
  h = h.replace(re, m => m + '\n<script src="' + DEM_FILE + '?b=' + hash + '" charset="utf-8"></script>   <!-- [BẢN ĐO] bộ đếm lượt đọc — chỉ có ở *_dem.html -->');
  h = h.replace(/<title>/, '<title>[ĐO] ');
  const iDem = h.indexOf('<script src="' + DEM_FILE), iInit = h.search(/firebase\.initializeApp\(/);
  if (iDem < 0 || iInit < 0 || iDem > iInit) throw new Error(dst + ': bộ đếm phải nạp trước initializeApp');
  fs.writeFileSync(path.join(OUT, dst), h);
  console.log('✅ ' + dst);
}
try {
  tao('posgieo.html', 'posgieo_dem.html');
  tao('quanlygieo.html', 'quanlygieo_dem.html');
} catch (e) { console.log('❌ ' + e.message); process.exit(1); }
fs.writeFileSync(path.join(OUT, DEM_FILE), dem); console.log('✅ ' + DEM_FILE);
if (OUT !== ROOT) for (const f of fs.readdirSync(ROOT).filter(f => /^unit_engine\.v\d+\.js$/.test(f))) {
  if (!fs.existsSync(path.join(OUT, f))) { fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)); console.log('✅ ' + f); }
}
console.log('Xong. Deploy rồi mở /posgieo_dem.html, /quanlygieo_dem.html bằng Chrome — DỮ LIỆU THẬT. App thật không đổi.');
