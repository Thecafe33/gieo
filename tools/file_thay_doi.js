// DANH SÁCH FILE THAY ĐỔI để giao chủ dự án (không ZIP — kế hoạch tách posgieo mục 1.4, T8).
//   node tools/file_thay_doi.js <commit mốc lần giao trước> [thuong|giangsinh|tet] [--ghi]
// So ban_deploy/<mùa>/ hiện tại (cây làm việc) với commit mốc → in từng file kèm ĐƯỜNG ĐÍCH trên máy chủ dự án:
//   ban_deploy/giangsinh/js/posgieo/pos_ui.v1.js  →  public/js/posgieo/pos_ui.v1.js
// File trong thư mục con giữ nguyên đường (không chép phẳng ra public/). File bị bỏ khỏi bộ: KHÔNG xoá trên máy.
// --ghi: ghi các file js/posgieo/… trong danh sách vào sổ đã phát hành tools/js_da_phat_hanh.json (T9) — dùng đúng
// lúc giao file.
'use strict';
const { execFileSync } = require('child_process'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const [moc, mua = 'giangsinh'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!moc || !['thuong', 'giangsinh', 'tet'].includes(mua)) { console.log('Cách dùng: node tools/file_thay_doi.js <commit mốc> [thuong|giangsinh|tet] [--ghi]'); process.exit(1); }
const goc = 'ban_deploy/' + mua + '/';
function danhSach() {
  const git = a => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const ds = new Map();
  for (const dong of git(['diff', '--name-status', '--no-renames', moc, '--', goc]).split('\n').filter(Boolean)) {
    const [tt, f] = dong.split('\t'); ds.set(f, tt[0]);
  }
  for (const f of git(['ls-files', '--others', '--exclude-standard', '--', goc]).split('\n').filter(Boolean)) ds.set(f, 'A');
  return [...ds].sort(([a], [b]) => a.localeCompare(b)).map(([f, tt]) => ({ f, tt, rel: f.slice(goc.length) }));
}
const ds = danhSach();
if (!ds.length) { console.log('Không có file nào khác so với ' + moc + ' trong ' + goc); process.exit(0); }
const NHAN = { A: 'MỚI ', M: 'SỬA ', D: 'BỎ  ' };
console.log('File cần chép (' + goc + ' so với ' + moc + '):');
for (const x of ds) console.log('  ' + (NHAN[x.tt] || x.tt + '   ') + ' ' + x.f + (x.tt === 'D' ? '   (đã bỏ khỏi bộ — KHÔNG xoá trên máy)' : '  →  public/' + x.rel));
if (process.argv.includes('--ghi')) {
  const moi = require('./tach_posgieo/phat_hanh').ghi(ds.filter(x => x.tt !== 'D').map(x => x.rel));
  console.log(moi.length ? 'Đã ghi sổ phát hành: ' + moi.join(', ') : 'Sổ phát hành: không có file js/posgieo mới.');
}
