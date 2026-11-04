'use strict';
// Chốt sổ tháng gặp pay/schedule-missing → phải liệt kê ĐÚNG ca cần bổ sung (người · ngày), bấm nhảy thẳng tới Lịch; vẫn không lenient ở chốt sổ.
const vm = require('vm'), fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) bad++; };
const code = extract('quanlygieo.html', ['chotSoCaThieuLichHtml', 'chotSoMoLich', 'chotSoKiemTraLai', 'monthLabelVN']);
const calls = [];
const ctx = { VN_MONTHS: ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'],
  escapeHtmlAttr: v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  closeEditSheet: v => calls.push(['close', v]), goEntry: t => calls.push(['go', t]), chotSoThang: m => calls.push(['chot', m]),
  lichViewDate: '', bulkLichDraft: {} };
vm.createContext(ctx); vm.runInContext(code + '\nthis.html = chotSoCaThieuLichHtml; this.mo = chotSoMoLich; this.lai = chotSoKiemTraLai;', ctx);
const list = [
  { employeeId: 'e2', name: 'Bình', date: '2026-10-09' }, { employeeId: 'e1', name: 'An', date: '2026-10-03' }, { employeeId: 'e1', name: 'An', date: '2026-10-01' },
  { employeeId: 'e3', name: '<img src=x onerror=alert(1)>', date: '2026-10-05' }, { employeeId: "e4');x('", name: 'Xấu', date: '2026-10-06' }, { employeeId: 'e5', name: 'Lạ', date: "2026-10-07');y('" }];
const h = ctx.html(list, '2026-10');
ok(/Tháng 10\/2026/.test(h) && /6 ca/.test(h), 'nêu tháng và tổng số ca');
ok(/<b>An<\/b> · 2 ca/.test(h) && /<b>Bình<\/b> · 1 ca/.test(h), 'gom theo người, đếm ca');
ok(h.indexOf('01/10') < h.indexOf('03/10'), 'ngày của một người xếp tăng dần');
ok(/chotSoMoLich\('e1','2026-10-01'\)/.test(h) && /chotSoMoLich\('e2','2026-10-09'\)/.test(h), 'mỗi ngày có nút nhảy tới Lịch đúng người + ngày');
ok(!/<img/.test(h) && /&lt;img/.test(h), 'tên người được escape');
ok(!/chotSoMoLich\('e4/.test(h) && !/y\('/.test(h.replace(/chotSoMoLich/g, '')), 'id/ngày bất thường không chèn vào onclick');
ok(/chotSoKiemTraLai\('2026-10'\)/.test(h), 'có nút kiểm tra lại & chốt');
ctx.mo('e1', '2026-10-03');
ok(ctx.lichViewDate === '2026-10-03' && ctx.bulkLichDraft.employeeId === 'e1' && ctx.bulkLichDraft.startDate === '2026-10-03' && ctx.bulkLichDraft.endDate === '2026-10-03'
  && calls.some(c => c[0] === 'go' && c[1] === 'lich') && calls[0][0] === 'close', 'bấm ngày → mở Lịch đúng ngày, điền sẵn người/khoảng ngày, đóng sheet');
ctx.lai('2026-10'); ok(calls.some(c => c[0] === 'chot' && c[1] === '2026-10'), 'kiểm tra lại gọi chốt sổ lần nữa');
// nối vào chotSoThang; chốt sổ vẫn chặt
for (const f of ['quanlygieo.html', 'quanlygieo2.html']) {
  const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const i = s.indexOf('async function chotSoThang('), body = s.slice(i, s.indexOf('async function moLaiThang', i));
  ok(/err\.code==='pay\/schedule-missing'[\s\S]{0,300}chotSoHienCaThieuLich\(monthKey\)/.test(body) && !/lenient/.test(body), f + ': chotSoThang bắt pay/schedule-missing → liệt kê; bản thân chốt sổ không lenient');
  const k = s.indexOf('async function chotSoHienCaThieuLich');
  ok(/computeActualLaborCostByDate\(a, b, \{lenient:true\}\)[\s\S]{0,200}payScheduleMissingList\(a, b\)/.test(s.slice(k, k + 1500)), f + ': quét lại cả tháng bằng lenient để lấy ĐỦ danh sách');
}
console.log(bad ? 'SOME FAIL' : 'ALL PASS'); process.exit(bad ? 1 : 0);
