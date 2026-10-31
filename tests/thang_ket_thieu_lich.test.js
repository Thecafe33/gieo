'use strict';
// Tổng kết tháng (quanlygieo / quanlygieo2) — ca thiếu lịch KHÔNG được làm trắng màn («Không quét được: pay/schedule-missing»):
// đọc lương bằng lenient (ca đó chưa cộng giờ) + báo vào dataMissing (tháng không được coi là đã chốt); chốt sổ vẫn chặt.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) bad++; };
for (const f of ['quanlygieo.html', 'quanlygieo2.html']) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const i = s.indexOf('async function renderThangKet(force=false){'), j = s.indexOf('// Báo cáo điều hành', i);
  const body = s.slice(i, j);
  ok(/computeActualLaborCostByDate\(startKey, endKey, \{lenient:true\}\)/.test(body), f + ': Tổng kết tháng đọc lương theo cost-by-date lenient');
  ok(/computeActualLaborBreakdownByEmployee\(startKey, endKey, \{lenient:true\}\)/.test(body), f + ': bảng lương theo người lenient');
  ok(/payScheduleMissingList\(startKey, endKey\)[\s\S]{0,200}dataMissing\.push\('lịch làm việc: '/.test(body), f + ': ca thiếu lịch được báo vào dataMissing');
  const chot = s.slice(s.indexOf('async function chotSoThang('), s.indexOf('async function chotSoThang(') + 6000);
  ok(!/lenient/.test(chot), f + ': chốt sổ tháng vẫn không lenient');
}
console.log(bad ? 'SOME FAIL' : 'ALL PASS'); process.exit(bad ? 1 : 0);
