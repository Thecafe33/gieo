// Tiện ích chung cho e2e trình duyệt (kế hoạch tách posgieo T12):
//   chromiumPath() — CHROMIUM_PATH → /usr/bin/chromium → /opt/pw-browsers/chromium (trước đây vài e2e ghi cứng
//                    /usr/bin/chromium nên không chạy được ở máy chỉ có Playwright).
//   serveFile(root, pathname, res) — phục vụ file tĩnh theo ĐƯỜNG TƯƠNG ĐỐI đầy đủ (js/posgieo/… không bị gộp về tên
//                    gốc như path.basename), chặn thoát thư mục, MIME đúng. Trả false nếu không có file.
'use strict';
const fs = require('fs'); const path = require('path');
const MIME = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function chromiumPath() {
  return [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/opt/pw-browsers/chromium'].find(p => p && fs.existsSync(p));
}
function serveFile(root, pathname, res) {
  let rel; try { rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch (e) { return false; }
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return false;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  res.setHeader('Content-Type', MIME[path.extname(abs)] || 'application/octet-stream');
  res.end(fs.readFileSync(abs));
  return true;
}
module.exports = { chromiumPath, serveFile };
