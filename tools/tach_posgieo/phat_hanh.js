// SỔ JS ĐÃ PHÁT HÀNH (kế hoạch tách posgieo T9): mỗi file js/posgieo/… khi được giao cho chủ dự án lần đầu được ghi
// { đường: sha256 } vào tools/js_da_phat_hanh.json. Hosting cache file này 1 năm (immutable) → KHÔNG BAO GIỜ đổi nội dung
// dưới cùng tên; sửa = ten.v{N+1}.js. tests/js_bat_bien.test.js đọc sổ và báo nếu nội dung đổi hoặc file mất.
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const SO = 'tools/js_da_phat_hanh.json';
const sha = (root, f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
const docSo = root => { const p = path.join(root, SO); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; };
/** Lỗi bất biến: [{ file, ly }] — file đã phát hành bị đổi nội dung / bị xoá khỏi repo. */
function kiem(root = ROOT) {
  const so = docSo(root), loi = [];
  for (const [f, h] of Object.entries(so)) {
    if (f.startsWith('_')) continue;
    if (!fs.existsSync(path.join(root, f))) loi.push({ file: f, ly: 'đã phát hành nhưng không còn trong repo (máy còn HTML cũ vẫn xin file này)' });
    else if (sha(root, f) !== h) loi.push({ file: f, ly: 'nội dung ĐÃ ĐỔI dưới cùng tên — Hosting cache 1 năm: tạo bản ten.v{N+1}.js, trả file này về nội dung cũ' });
  }
  return loi;
}
/** Ghi các file js/posgieo/… vào sổ (file đã có trong sổ mà khác nội dung → lỗi, không ghi đè). Trả danh sách mới ghi. */
function ghi(files, root = ROOT) {
  const so = docSo(root), moi = [];
  for (const f of files) {
    if (!/^js\/posgieo\/.+\.js$/.test(f)) continue;
    const h = sha(root, f);
    if (so[f] && so[f] !== h) throw new Error(f + ' đã phát hành với nội dung khác — không ghi đè sổ');
    if (!so[f]) { so[f] = h; moi.push(f); }
  }
  if (moi.length) {
    const out = { _ghi_chu: 'SINH bằng tools/file_thay_doi.js --ghi lúc giao file. Không sửa tay. File trong sổ = đã phát hành, không đổi nội dung.' };
    for (const k of Object.keys(so).filter(k => !k.startsWith('_')).sort()) out[k] = so[k];
    fs.writeFileSync(path.join(root, SO), JSON.stringify(out, null, 1) + '\n');
  }
  return moi;
}
module.exports = { kiem, ghi, SO };
