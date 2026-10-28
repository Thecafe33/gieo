// JS riêng đặt ở GỐC thoát kiểm (Q1/Q6): mọi src JS cục bộ không nằm trong js/ mà posgieo.html / posgieo_thu.html /
// quanlygieo.html nạp phải thuộc DANH SÁCH thư viện gốc đã biết (theo mẫu tên). File JS gốc mới không thuộc danh sách → FAIL.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { jsCucBoCua, laJsRieng } = require(path.join(ROOT, 'tools/tach_posgieo/nguon.js'));
let ok = true;
const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

// thư viện dùng chung ở gốc (đối chiếu thực tế các HTML bên dưới)
const GOC = [
  /^data_access\.v\d+\.js$/, /^unit_engine\.v\d+\.js$/, /^che_do_thu\.v\d+\.js$/, /^gau_noel_giangsinh\.v\d+\.js$/,
  /^gieo_automation(_pos)?\.v\d+\.js$/, /^unit_engine2(_store|_staffing|_learn|_obs|_params|_export|_audit)?_v\d+\.js$/,
  /^gieo_engine2_pos_v\d+\.js$/, /^lai_lo\.v\d+\.js$/, /^cham_cong\.v\d+\.js$/, /^lixi\.v\d+\.js$/,
  /^bill_live\.v\d+\.js$/,   // quanlygieo.html nạp (thực tế)
];
const LOI = 'JS riêng của app phải ở js/posgieo/ (Q1/Q6) — hoặc thêm vào danh sách thư viện gốc nếu dùng chung';
const laGoc = f => GOC.some(re => re.test(f));

// bản thân danh sách: mẫu khớp/không khớp đúng
chk(laGoc('data_access.v9.js') && laGoc('unit_engine2_store_v1.js') && laGoc('gieo_engine2_pos_v1.js') && laGoc('gieo_automation_pos.v3.js'), 'mẫu tên: thư viện gốc đã biết khớp');
chk(!laGoc('pos_moi.v1.js') && !laGoc('posgieo_helper.js') && !laGoc('data_access.js') && !laGoc('unit_engine.v1.js.bak'), 'mẫu tên: JS riêng đặt ở gốc không khớp');

for (const h of ['posgieo.html', 'posgieo_thu.html', 'quanlygieo.html']) {
  const html = fs.readFileSync(path.join(ROOT, h), 'utf8');
  const gocLa = jsCucBoCua(html).filter(f => !laJsRieng(f) && !f.startsWith('js/'));
  const sai = gocLa.filter(f => !laGoc(f));
  chk(sai.length === 0, h + ': ' + gocLa.length + ' JS gốc đều thuộc danh sách thư viện' + (sai.length ? ' — KHÔNG thuộc: ' + sai.join(', ') + ' → ' + LOI : ''));
}
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
