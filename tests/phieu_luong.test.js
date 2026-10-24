// Phiếu lương quanlygieo: hao hụt trừ lương (3 loại, đã duyệt, trừ khi «khấu hao vào quán»), nghỉ / đi trễ, lương đề xuất.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'quanlygieo.html'), 'utf8');
const a = src.indexOf('const TK_HAOHUT_TRU'), b = src.indexOf('async function thangKetSaveAdjust');
const d0 = src.indexOf('function thangKetDeXuat');
if (a < 0 || b < 0 || d0 < 0 || d0 > a || !src.slice(d0, a).includes('tongHaoHut')) { console.log('FAIL không tìm thấy khối phiếu lương'); process.exit(1); }
const mk = (id, cat, val, extra) => Object.assign({ id, category: cat, value: val, qty: 10, unit: 'g', itemId: 'X', date: '2026-10-10', at: '2026-10-10T03:00:00Z', needsReview: false }, extra || {});
const api = new Function('fmt', 'fmtNum', 'escapeHtmlAttr', 'vnDate', 'dkey', '_ccHHMM', 'HR_SETTINGS', 'QL_VIEW', 'PREP_ITEMS', 'toast', 'thangKetRedraw', `
let thangKetAdjust = { e1: { thuong: [{ amount: 100000, reason: 't' }], phat: [{ amount: 20000, reason: 'p' }], quanChiu: ['k'], finalPay: null } };
let thangKetData = { y: 2026, m: 10, startKey: '2026-10-01', endKey: '2026-10-31', emps: [{ id: 'e1', fullName: 'A' }],
  empBreakdown: { e1: { amount: 1000000, dayDetails: [] } },
  khoExtra: { responsibility: { byEmployee: { e1: { events: [
    ${JSON.stringify(mk('a', 'prepWaste', 10000))}, ${JSON.stringify(mk('b', 'reportedWaste', 5000))}, ${JSON.stringify(mk('c', 'shortage', 3000))},
    ${JSON.stringify(mk('k', 'reportedWaste', 7000))},                        // khấu hao vào quán
    ${JSON.stringify(mk('d', 'shortage', 9000, { needsReview: true }))},      // chờ duyệt
    ${JSON.stringify(mk('e', 'extraUse', 4000))}, ${JSON.stringify(mk('f', 'dutyShort', 4000))}, ${JSON.stringify(mk('g', 'prepCountShort', 4000))} // loại không trừ
  ] } } } },
  scheds: [ { employeeId: 'e1', date: '2026-10-02', isOff: true }, { employeeId: 'e1', date: '2026-10-03', startTime: '08:00' },
            { employeeId: 'e1', date: '2026-10-05', startTime: '08:00' }, { employeeId: 'e1', date: '2026-10-06', startTime: '08:00' },
            { employeeId: 'e2', date: '2026-10-07', isOff: true } ],
  attendance: { e1: { '2026-10-05': '2026-10-05T01:12:00Z', '2026-10-06': '2026-10-06T01:05:00Z' } } };
${src.slice(d0, b)}
return { thangKetHaoHut, thangKetDeXuat, thangKetNghiTre, thangKetQuanChiu, set(k, v) { thangKetAdjust = v; } };`)(
  n => n, n => n, s => s, x => x ? new Date(x) : new Date('2026-10-24T00:00:00Z'), d => d.toISOString().slice(0, 10),
  iso => iso.slice(11, 16), { lateGraceMinutes: 10 }, 'gg01', [], () => {}, () => {});
let ok = true;
const eq = (x, y, m) => { if (JSON.stringify(x) !== JSON.stringify(y)) { ok = false; console.log('FAIL', m, JSON.stringify(x), '!=', JSON.stringify(y)); } else console.log('ok', m); };
const h = api.thangKetHaoHut('e1');
eq(h.tongTru, 18000, 'chỉ 3 loại đã duyệt, trừ khoản khấu hao vào quán: 10k+5k+3k');
eq(h.tongQuan, 7000, 'khoản khấu hao vào quán tách riêng');
eq([h.cho.length, h.tongCho], [1, 9000], 'khoản chưa duyệt chỉ liệt kê, không tính tiền');
eq(api.thangKetDeXuat('e1').deXuat, 1000000 + 100000 - 20000 - 18000, 'lương đề xuất = chấm công + thưởng − trừ nhập tay − hao hụt');
api.thangKetQuanChiu('e1', encodeURIComponent('a'), true);
eq(api.thangKetHaoHut('e1').tongTru, 8000, 'bấm khấu hao vào quán → không còn trừ khoản đó');
api.thangKetQuanChiu('e1', encodeURIComponent('a'), false);
eq(api.thangKetHaoHut('e1').tongTru, 18000, 'trừ lại vào lương');
const nt = api.thangKetNghiTre('e1');
eq(nt.nghi.map(x => x.date + ':' + x.kind), ['2026-10-02:Nghỉ theo lịch', '2026-10-03:Vắng · không chấm công'], 'nghỉ theo lịch + vắng (có lịch, ngày đã qua, không chấm công); người khác không lẫn vào');
eq(nt.tre.map(x => x.date + ':' + x.min), ['2026-10-05:12'], 'trễ 12 phút được liệt kê; trễ 5 phút (trong ân hạn 10) thì không');
process.exit(ok ? 0 : 1);
