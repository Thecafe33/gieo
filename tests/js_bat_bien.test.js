// JS đã phát hành (js/posgieo/…, sổ tools/js_da_phat_hanh.json) KHÔNG đổi nội dung dưới cùng tên, không bị xoá —
// Hosting cache 1 năm (immutable). Sửa = tạo ten.v{N+1}.js (kế hoạch tách posgieo T9; ghi sổ: tools/file_thay_doi.js --ghi).
const { kiem } = require('../tools/tach_posgieo/phat_hanh');
const loi = kiem();
for (const x of loi) console.log('FAIL', x.file + ': ' + x.ly);
console.log(loi.length ? 'SOME FAIL' : 'ok sổ JS đã phát hành khớp nội dung\nALL PASS'); process.exit(loi.length ? 1 : 0);
