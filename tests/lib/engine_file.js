// Tên file Unit Engine BẢN MỚI NHẤT trong thư mục gốc (unit_engine.v{N}.js, N lớn nhất) — test luôn chạy trên bản app đang trỏ tới.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const list = fs.readdirSync(ROOT).map(f => /^unit_engine\.v(\d+)\.js$/.exec(f)).filter(Boolean).sort((a, b) => Number(a[1]) - Number(b[1]));
module.exports = list.length ? list[list.length - 1][0] : 'unit_engine.v1.js';
