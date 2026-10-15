// Sinh BẢN TẾT 2027 (Đinh Mùi) — lì xì Bé Gạo:
//   index.html → index_tet.html   (app khách: giao diện Tết đỏ đô + vàng, Bé Gạo dê, mở bao lì xì)
//   pos.html   → pos_tet.html     (The cafe 33: dùng mã lì xì, cộng lượt mở, tab Quản lý "Lì xì 2027")
//   PosX.html  → PosX_tet.html    (XOFA: dùng mã lì xì, cộng lượt mở)
// Cả 3 nạp lixi.v1.js (lõi dùng chung). Bản bình thường KHÔNG có code lì xì.
//
//   node tools/tao_ban_tet.js              → ghi 3 file cạnh bản gốc
//   node tools/tao_ban_tet.js <thư mục>    → ghi vào thư mục đó (+ chép lixi.v1.js)
//
// Tới Tết: deploy 3 file _tet làm index.html / pos.html / PosX.html (+ lixi.v1.js). Hết đợt: tab "Lì xì 2027" (pos) xoá dữ liệu
// (mã 3367) rồi deploy lại 3 bản bình thường. Sửa bản gốc → chạy lại lệnh này (tests/tet.test.js báo nếu quên).
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LIXI = 'lixi.v1.js';
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function thayDung1(h, tim, moi, ten, nguon) {
  const n = h.split(tim).length - 1;
  if (n !== 1) throw new Error(nguon + ': cần đúng 1 chỗ "' + ten + '", thấy ' + n + ' — bản gốc đã đổi, sửa lại tools/tao_ban_tet.js');
  return h.replace(tim, () => moi);
}
function ganLixi(h, glueFile, nguon) {
  if (/lixi\.v\d+\.js/.test(h)) throw new Error(nguon + ': đã có lì xì — phải sinh từ bản BÌNH THƯỜNG');
  const glue = fs.readFileSync(path.join(__dirname, 'tet', glueFile), 'utf8');
  h = thayDung1(h, '</body>', '<!-- [LÌ XÌ TẾT 2027] lõi dùng chung + phần gắn riêng app này (tools/tet/' + glueFile + ') -->\n' +
    '<script src="' + LIXI + '"></script>\n<script>\n' + glue + '\n</script>\n</body>', '</body>', nguon);
  return thayDung1(h, '<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- BẢN TẾT 2027 — sinh tự động từ ' + nguon + ' bằng tools/tao_ban_tet.js. KHÔNG sửa tay: sửa ' + nguon + ' rồi chạy lại. -->', 'DOCTYPE', nguon);
}

function taoPosTet(src) {
  let h = ganLixi(src, 'pos_lixi.js', 'pos.html');
  // đơn lưu thành công (cả luồng bed finalizeBedCheckIn) → đánh dấu mã đã dùng + cộng lượt mở
  const neo = "const normalizedSdt = (typeof normalizePhone === 'function') ? normalizePhone(finalSdt) : finalSdt;";
  h = thayDung1(h, neo, neo + "\n            if (window.lixiAfterPaid) { try { window.lixiAfterPaid(normalizedSdt, finalSdt, orderData); } catch (e) { console.warn('[lì xì]', e); } }",
    '_pushPaidOrder: normalizedSdt', 'pos.html');
  return h;
}
function taoPosXTet(src) { return ganLixi(src, 'posx_lixi.js', 'PosX.html'); }

let taoIndexTet = null;
try { taoIndexTet = require('./tet/index_tet.js').taoIndexTet; } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

const BAN = [
  ['pos.html', 'pos_tet.html', taoPosTet],
  ['PosX.html', 'PosX_tet.html', taoPosXTet],
].concat(taoIndexTet ? [['index.html', 'index_tet.html', h => taoIndexTet(h, ROOT)]] : []);

if (require.main === module) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  if (!fs.existsSync(out)) { console.log('❌ Không thấy thư mục ' + out); process.exit(1); }
  for (const [nguon, dich, fn] of BAN) {
    fs.writeFileSync(path.join(out, dich), fn(rd(nguon)));
    console.log('✅ ' + dich);
  }
  if (out !== ROOT) { fs.copyFileSync(path.join(ROOT, LIXI), path.join(out, LIXI)); console.log('✅ ' + LIXI); }
}
module.exports = { taoPosTet, taoPosXTet, BAN, rd };
