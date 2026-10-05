// Sinh BẢN ĐO lượt đọc (T1 — docs/KE_HOACH_TOI_UU_DOC.md) từ code trong thư mục này, ghi vào THƯ MỤC DEPLOY:
//   posgieo_dem.html, quanlygieo_dem.html
// = app THẬT, chạy DỮ LIỆU THẬT (không phải vùng thử), chỉ thêm bộ đếm lượt đọc + nút 📊 góc dưới trái.
// posgieo.html / quanlygieo.html KHÔNG bị đụng — máy bán hàng (APK) vẫn chạy bản thật.
// Dùng cho máy không mở được Console (máy tính bảng): mở /posgieo_dem.html hoặc /quanlygieo_dem.html bằng Chrome.
// Đo xong: xoá 2 file này khỏi thư mục deploy rồi deploy lại.
//
//   node tools/tao_ban_dem.js <thư mục deploy>
//
// Bộ đếm (tools/dem_luot_doc.js) được NHÚNG THẲNG vào HTML, ngay sau thẻ firebase-firestore-compat.js — trước mọi
// code của app (đếm được cả lượt đọc lúc khởi động), không cần file .js riêng trên hosting.
// Bộ đếm không cài được → dòng báo đỏ đầu trang ghi LÝ DO; app vẫn chạy bình thường. Tiêu đề thêm "[ĐO] ".
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const outArg = process.argv[2];
if (!outArg) { console.log('Cách dùng: node tools/tao_ban_dem.js <thư mục deploy>'); process.exit(1); }
const OUT = path.resolve(outArg);
if (!fs.existsSync(OUT)) { console.log('❌ Không thấy thư mục ' + OUT); process.exit(1); }
const dem = fs.readFileSync(path.join(ROOT, 'tools', 'dem_luot_doc.js'), 'utf8');
if (/<\/script|<!--/i.test(dem)) { console.log('❌ tools/dem_luot_doc.js chứa </script hoặc <!-- — không nhúng vào HTML được'); process.exit(1); }

const MO = '<script>/* [BẢN ĐO] bộ đếm lượt đọc (tools/dem_luot_doc.js) — chỉ có ở *_dem.html */';
const DONG = '</script><!-- [BẢN ĐO] hết bộ đếm -->';
const KHOI = MO + '\ntry {\n' + dem + '\n} catch (e) { window.__dldLoi = String((e && (e.stack || e.message)) || e); }\n' + DONG;
// Báo đỏ đầu trang kèm lý do khi bộ đếm không cài được.
const BAO_LOI = "<script>if (!window.demLuotDoc) document.addEventListener('DOMContentLoaded', function () { var d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b91c1c;color:#fff;font:700 14px/1.4 sans-serif;padding:10px 14px;white-space:pre-wrap;max-height:40vh;overflow:auto'; d.textContent = '⚠️ BẢN ĐO: bộ đếm KHÔNG chạy — chụp màn hình này gửi Claude.\\nLý do: ' + (window.__dldLoi || (window.firebase && window.firebase.firestore ? 'không rõ' : 'chưa có firebase.firestore')); document.body.appendChild(d); });</script><!-- [BẢN ĐO] báo lỗi -->";

function tao(src, dst) {
  let h = fs.readFileSync(path.join(ROOT, src), 'utf8');
  const re = /<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore-compat\.js"><\/script>/g;
  const n = (h.match(re) || []).length;
  if (n !== 1) throw new Error(src + ': cần đúng 1 thẻ firebase-firestore-compat.js, thấy ' + n);
  if (/che_do_thu\.|GieoThu\.install|dem_luot_doc|demLuotDoc/.test(h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '').replace(/GieoThu && GieoThu/g, '')))
    throw new Error(src + ': file nguồn đã có chế độ thử / bộ đếm — phải sinh từ bản THẬT');
  h = h.replace(re, m => m + '\n' + KHOI + '\n' + BAO_LOI);
  h = h.replace(/<title>/, '<title>[ĐO] ');
  const iDem = h.indexOf(MO), iInit = h.search(/firebase\.initializeApp\(/);
  if (iDem < 0 || iInit < 0 || iDem > iInit) throw new Error(dst + ': bộ đếm phải nạp trước initializeApp');
  fs.writeFileSync(path.join(OUT, dst), h);
  console.log('✅ ' + dst);
}
try {
  tao('posgieo.html', 'posgieo_dem.html');
  tao('quanlygieo.html', 'quanlygieo_dem.html');
} catch (e) { console.log('❌ ' + e.message); process.exit(1); }
if (OUT !== ROOT) for (const f of fs.readdirSync(ROOT).filter(f => /^(unit_engine|data_access)\.v\d+\.js$/.test(f))) {
  if (!fs.existsSync(path.join(OUT, f))) { fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)); console.log('✅ ' + f); }
}
console.log('Xong. Deploy rồi mở /posgieo_dem.html, /quanlygieo_dem.html bằng Chrome — DỮ LIỆU THẬT. App thật không đổi.');
