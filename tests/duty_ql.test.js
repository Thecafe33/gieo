// Quản lý — màn "Vụ lệch & trách nhiệm": thẻ vụ hiển thị đủ (người, %, cơ sở, độ tin cậy, phản đối) và các nút của chủ kiểm tra đầu vào.
'use strict';
const fs = require('fs'), path = require('path');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const src = fs.readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8');
const code = src.slice(src.indexOf('// ════════ [TRÁCH NHIỆM THEO CA] Màn'), src.indexOf('async function renderKhoBtpAm'));
const toasts = [], calls = [];
const dom = {};
const env = {
  escapeHtmlAttr: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmt: n => Math.round(n || 0).toLocaleString('vi-VN') + 'đ', fmtNum: (n, d = 1) => (n || 0).toLocaleString('vi-VN', { maximumFractionDigits: d }), qlFmtDT: iso => String(iso).slice(0, 16),
  nvRolesLabel: () => 'Pha chế', toast: m => toasts.push(m), logAudit: () => {}, closeEditSheet: () => {}, openEditSheet: (t, h) => { dom.sheet = { t, h }; }, renderKhoDuty: () => {}, confirm: () => true,
  document: { getElementById: id => dom[id] || null },
  UnitEngine: { duty: { reassign: async (...a) => { calls.push(['reassign', ...a]); }, keep: async (...a) => { calls.push(['keep', ...a]); }, resetBaseline: async (...a) => { calls.push(['reset', ...a]); } } }
};
const names = Object.keys(env);
const f = new Function(...names, code + '\nreturn {dutyCardHTML, dutyOpenReassign, dutyReassignSubmit, dutyMark, dutyMarkSubmit, dutyKeepCase, dutyResetBaseline, setList: (l, e) => { dutyList = l; dutyEmployees = e; }};');
const F = f(...names.map(n => env[n]));
const c = { id: 'c1', prepId: 'p1', prepName: 'Cốt trà <lài>', unit: 'g', variance: -120, value: 240, status: 'contested', confidence: 'medium', createdAt: '2026-09-22T14:30:00Z',
  interval: { from: '2026-09-21T14:00:00Z', to: '2026-09-22T14:30:00Z' }, usageEvents: 12, usageTotal: 360, countedBy: { name: 'Bình' }, recount: { first: 7463 },
  allocations: [{ employeeId: 'A', employeeName: 'An', qty: -100, share: 0.83, value: 200, basis: ['chia_theo_so_ban'], confidence: 'medium' }],
  pool: [{ kind: 'recipe', qty: -20, value: 40, reason: 'dinh_muc_lech_nen' }], notes: ['du_phong_khong_ai_khai_pha_che'], contest: { by: 'An', reason: 'Tôi nghỉ ca đó' },
  verification: { by: 'Chi', bCount: 800, bBook: 810, clean: false }, history: [{ type: 'contest', at: '2026-09-23T01:00:00Z', by: 'An', reason: 'x' }] };
const html = F.dutyCardHTML(c);
eq([html.includes('Cốt trà &lt;lài&gt;'), html.includes('An'), html.includes('83%'), html.includes('có mặt lúc bán'), html.includes('Lỗi định mức/công thức'), html.includes('Bị phản đối'), html.includes('Tôi nghỉ ca đó'), html.includes('Giữ nguyên'), html.includes('khoảng giữa không sạch'), html.includes('12 lượt bán')],
  [true, true, true, true, true, true, true, true, true, true], 'thẻ vụ: người, %, cơ sở, định mức, phản đối, bằng chứng; tên được lọc HTML');
eq(F.dutyCardHTML({ ...c, status: 'auto', contest: null }).includes('Giữ nguyên'), false, 'vụ không bị phản đối thì không có nút "Giữ nguyên"');
eq(F.dutyCardHTML({ id: 'c2', prepId: 'p', prepName: 'X', unit: 'g', variance: 5, value: 5, status: 'no_checkpoint', allocations: [], pool: [{ kind: 'unknown', qty: 5, value: 5, reason: 'khong_co_moc_dem_truoc' }], interval: { from: null, to: 'z' } }).includes('chưa có mốc đếm trước'), true, 'vụ chưa có mốc: nêu rõ lý do chưa quy');
// nút chủ
(async () => {
  F.setList([c], [{ id: 'A', fullName: 'An' }, { id: 'B', fullName: 'Bình' }]);
  F.dutyOpenReassign('c1');
  eq(dom.sheet.h.includes('dutyShare_A') && dom.sheet.h.includes('value="83"'), true, 'form chia lại liệt kê MỌI nhân viên, điền sẵn tỉ lệ hiện tại');
  dom.dutyShare_A = { value: '60' }; dom.dutyShare_B = { value: '50' }; dom.dutyReason = { value: 'x' };
  await F.dutyReassignSubmit('c1');
  eq([calls.length, /vượt 100%/.test(toasts[toasts.length - 1])], [0, true], 'tổng tỉ lệ >100% bị chặn');
  dom.dutyShare_B = { value: '40' }; dom.dutyReason = { value: '  ' };
  await F.dutyReassignSubmit('c1');
  eq([calls.length, /lý do/.test(toasts[toasts.length - 1])], [0, true], 'thiếu lý do bị chặn');
  dom.dutyReason = { value: 'cùng thao tác' };
  await F.dutyReassignSubmit('c1');
  eq([calls[0][0], calls[0][1], calls[0][2].kind, calls[0][2].shares.map(x => [x.employeeId, x.share]), calls[0][2].reason], ['reassign', 'c1', 'manual', [['A', 0.6], ['B', 0.4]], 'cùng thao tác'], '60/40 + lý do → gọi engine');
  dom.dutyReason = { value: 'định mức sai' }; await F.dutyMarkSubmit('c1', 'recipe');
  eq([calls[1][2].kind, calls[1][2].reason], ['recipe', 'định mức sai'], '"Là lỗi định mức" → gọi engine kind recipe');
  await F.dutyKeepCase('c1'); await F.dutyResetBaseline('p1');
  eq([calls[2][0], calls[3][0], calls[3][1]], ['keep', 'reset', 'p1'], 'giữ nguyên / đặt lại nền gọi engine');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
