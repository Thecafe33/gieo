// Tên file Unit Engine mà APP ĐANG TRỎ TỚI (thẻ <script src="unit_engine.vN.js"> trong posgieo.html) — không lấy số
// lớn nhất trên đĩa (kế hoạch tách posgieo T6: test chạy đúng tài nguyên phát hành). Không đọc được thẻ → bản lớn nhất.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const m = /<script src="(unit_engine\.v\d+\.js)"/.exec(fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8'));
const list = fs.readdirSync(ROOT).map(f => /^unit_engine\.v(\d+)\.js$/.exec(f)).filter(Boolean).sort((a, b) => Number(a[1]) - Number(b[1]));
module.exports = m ? m[1] : (list.length ? list[list.length - 1][0] : 'unit_engine.v1.js');
