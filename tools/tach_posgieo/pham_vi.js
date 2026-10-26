// KIỂM PHẠM VI QUÁN của lượt ghi (độc lập với trang đang kiểm — kiểm toán lượt 08 F08-1): đọc bảng đăng ký REG của
// data_access (bản trong bộ deploy đang kiểm) bằng Node, phân loại TỪNG lượt ghi theo tên bảng gốc + hậu tố:
//   S / C (riêng từng quán): gg01 → đúng tên gốc, không hậu tố; ggNN khác → đúng hậu tố `__ggNN` của QUÁN ĐANG CHẠY;
//   G / X (dùng chung): không hậu tố; tên chưa đăng ký → vi phạm.
// Không chấp nhận hậu tố bất kỳ. Dùng bởi e2e_kho.js; test `tests/tach_posgieo_pham_vi.test.js` (ca cài lỗi).
'use strict';
const fs = require('fs'); const path = require('path');

function napREG(dir) {
  const f = fs.readdirSync(dir).filter(x => /^data_access\.v\d+\.js$/.test(x)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();
  if (!f) throw new Error('pham_vi: không thấy data_access.v*.js trong ' + dir);
  const m = { exports: {} };
  new Function('window', 'module', fs.readFileSync(path.join(dir, f), 'utf8'))({}, m);
  return m.exports.GieoData.REG;
}
// Một lượt ghi {op, p, rt} → { loai: 'fs'|'rt'|'st', duong }
function dichCua(g) {
  const op = String(g.op || ''), at = op.indexOf('@');
  if (at >= 0) return { loai: 'fs', duong: op.slice(at + 1) };      // tx.* / batch.* — Firestore
  if (/^storage\./.test(op)) return { loai: 'st', duong: g.p };
  return { loai: g.rt ? 'rt' : 'fs', duong: g.p };
}
function kiemPhamVi(ghi, store, REG) {
  const vi = [];
  for (const g of ghi || []) {
    const { loai, duong } = dichCua(g); const T = String(duong || '').split('/')[0];
    if (!T) continue;
    const m = /^(.*?)(?:__(gg\d\d))?$/.exec(T); const goc = m[1], hauTo = m[2] || null;
    const k = (REG[loai] || {})[goc];
    let loi = null;
    if (!k) loi = 'bảng chưa đăng ký ' + loai + ':' + goc;
    else if (k === 'S' || k === 'C') { const can = store === 'gg01' ? null : store; if (hauTo !== can) loi = `${k} ${goc} ở quán ${store} phải là ${can ? goc + '__' + can : goc}`; }
    else if (hauTo) loi = `${k} (dùng chung) ${goc} không được mang hậu tố __${hauTo}`;
    if (loi) vi.push(`${g.op} ${T}: ${loi}`);
  }
  return vi;
}
// Tập bảng (tên gốc) theo loại ghi tới — để ghim tập bảng mong đợi của kịch bản
function bangGoc(ghi) { return [...new Set((ghi || []).map(g => String(dichCua(g).duong || '').split('/')[0].replace(/__gg\d\d$/, '')).filter(Boolean))].sort(); }
module.exports = { napREG, kiemPhamVi, bangGoc, dichCua };
