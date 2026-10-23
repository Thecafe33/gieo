'use strict';
// Nhóm dễ nhầm (chủ quán 23/10, docs/KE_HOACH_PHA_NHAM_NHOM.md P1): cấu hình ở quanlygieo trên danh mục BTP + NL
// (trường nhomDeNham), gộp nhóm không phân biệt hoa thường / khoảng trắng, bỏ món ngừng dùng, tên nhóm được escape.
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const { extract } = require('./lib/extract');
const src = extract('quanlygieo.html', ['nhomDeNhamNorm', 'nhomDeNhamGroups', 'nhomDeNhamFieldHTML', 'nhomDeNhamPanelHTML']);
const make = (prep, inv) => new Function('PREP_ITEMS', 'INVENTORY_ITEMS', 'escapeHtmlAttr', 'wdgHeadHTML',
  src + '\nreturn {nhomDeNhamNorm,nhomDeNhamGroups,nhomDeNhamFieldHTML,nhomDeNhamPanelHTML};')(prep, inv,
  s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), (i, t) => t);

const F = make(
  [{ id: 'p1', name: 'Cốt trà sữa', nhomDeNham: 'Cốt sữa' }, { id: 'p2', name: 'Cốt sữa gạo', nhomDeNham: '  cốt   SỮA ' },
   { id: 'p3', name: 'Thạch trà', nhomDeNham: 'Topping' }, { id: 'p4', name: 'Cốt cũ', nhomDeNham: 'Cốt sữa', active: false },
   { id: 'p5', name: 'Sương sáo' }],
  [{ id: 'i1', name: 'Trân châu trắng', nhomDeNham: 'Topping' }, { id: 'i2', name: 'Sữa tươi', nhomDeNham: '' }]);
assert.equal(F.nhomDeNhamNorm('  a   b '), 'a b');
const g = F.nhomDeNhamGroups();
assert.deepEqual(g.map(x => [x.ten, x.mon.map(m => m.ten + ':' + m.loai)]),
  [['Cốt sữa', ['Cốt trà sữa:BTP', 'Cốt sữa gạo:BTP']], ['Topping', ['Thạch trà:BTP', 'Trân châu trắng:NL']]],
  'gộp không phân biệt hoa thường / khoảng trắng; BTP + NL chung nhóm; bỏ món ngừng dùng và món không nhóm');
console.log('ok Gộp nhóm từ danh mục BTP + nguyên liệu');

const X = make([{ id: 'p', name: '<b>x</b>', nhomDeNham: '<img onerror=1>' }, { id: 'q', name: 'y', nhomDeNham: '<img onerror=1>' }], []);
assert(!/<img|<b>x/.test(X.nhomDeNhamPanelHTML()) && !/<img/.test(X.nhomDeNhamFieldHTML('f', '<img onerror=1>')), 'tên nhóm / món được escape');
assert.match(F.nhomDeNhamFieldHTML('f', 'Cốt sữa'), /list="f_ds"[\s\S]*<option value="Cốt sữa">[\s\S]*<option value="Topping">/, 'gợi ý nhóm sẵn có');
console.log('ok Escape tên nhóm; ô nhập gợi ý nhóm sẵn có');

// Lưu: cả form BTP (submitPrepItem) và form nguyên liệu (thêm + sửa) ghi trường nhomDeNham đã chuẩn hoá.
const html = fs.readFileSync(path.join(__dirname, '../quanlygieo.html'), 'utf8');
assert.match(html, /nhomDeNham: nhomDeNhamNorm\(prepDraft\.nhomDeNham\) \}/);
assert.equal((html.match(/isPackagingMaterial, nhomDeNham,/g) || []).length, 2, 'nguyên liệu: lưu khi sửa và khi thêm mới');
console.log('ok Form BTP và nguyên liệu đều lưu nhomDeNham');
console.log('ALL PASS');
