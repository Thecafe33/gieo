// Gỡ thẻ Gấu Noel 2026 khỏi 1 file HTML (bản thường / bản Tết không chạy chương trình Giáng sinh).
// Thẻ gắn trong app luôn có dạng: <!-- [GẤU NOEL 2026] … -->\n<script src="gau_noel_giangsinh.vN.js" data-quan="…"></script>\n
'use strict';
const RE = /<!-- \[(?:GẤU NOEL 2026|GIÁNG SINH\] quay trúng gấu Noel 2026)[^\n]*-->\n<script src="gau_noel_giangsinh\.v\d+\.js" data-quan="[a-z0-9]+"><\/script>\n/g;
function boGauNoel(h) {
  const out = h.replace(RE, '');
  if (/gau_noel_giangsinh\.v\d+\.js/.test(out.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('còn thẻ gau_noel_giangsinh không đúng dạng — sửa tools/gau_noel/bo_gau.js');
  return out;
}
module.exports = { boGauNoel, RE };
