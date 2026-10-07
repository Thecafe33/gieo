// Lương theo MỐC thời gian (01/10/2026): đổi đơn giá/OT không được tính lại quá khứ. Hàm thật từ quanlygieo.html, fstore/loadEmployees giả.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const names = ['payTermsOfRecord', 'empPayTermsOn', 'computeWageForDayHours', 'isFixedPayType', 'empFixedPayHere', 'isShiftInProgress', 'shiftWorkedHours', 'computeActualLaborCostByDate', 'computeActualLaborBreakdownByEmployee', 'plPredictedLaborByDate'];
const src = extract('quanlygieo.html', names);
const build = (employees, shifts, quan) => {
  const dkey = d => d.toISOString().slice(0, 10);
  const stubs = { dkey, QL_VIEW: quan || 'gg01', GieoData: { storeId: () => (quan === 'all' ? null : quan || 'gg01') }, daysInMonth: d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), plScheduledHours: s => s.hours, loadEmployees: async () => employees,
    fstore: { collection: () => ({ where() { return this; }, get: async () => ({ docs: shifts.map(s => ({ data: () => s })) }) }) } };
  const ks = Object.keys(stubs);
  return new Function(...ks, src + '\nreturn {empPayTermsOn, computeActualLaborCostByDate, computeActualLaborBreakdownByEmployee, plPredictedLaborByDate};')(...ks.map(k => stubs[k]));
};
const sh = (emp, date, inH, outH, payTerms) => ({ employeeId: emp, businessDate: date, checkedInAt: date + 'T' + String(inH).padStart(2, '0') + ':00:00', checkedOutAt: date + 'T' + String(outH).padStart(2, '0') + ':00:00', ...(payTerms ? { payTerms } : {}) });
const P = (o) => ({ payType: 'hourly_full', hourlyRate: 20000, otEnabled: true, otThresholdHours: 8, otRate: 20000, fixedMonthlySalary: 0, ...o });
(async () => {
  // Thử việc 20K / OT 20K → từ 01/11 là 21K / OT 25K
  const emp = { id: 'e1', active: true, ...P({ hourlyRate: 21000, otRate: 25000 }), payHistory: [{ effectiveFrom: '0000-00-00', legacy: true, ...P({}) }, { effectiveFrom: '2026-11-01', ...P({ hourlyRate: 21000, otRate: 25000 }) }] };
  const shifts = [sh('e1', '2026-10-30', 6, 16), sh('e1', '2026-11-02', 6, 16)];       // mỗi ngày 10 giờ: 8 thường + 2 OT
  const F = build([emp], shifts);
  const byDate = await F.computeActualLaborCostByDate('2026-10-30', '2026-11-02');
  eq([byDate['2026-10-30'], byDate['2026-11-02']], [8 * 20000 + 2 * 20000, 8 * 21000 + 2 * 25000], 'ngày trước mốc tính 20K/OT 20K, ngày sau mốc 21K/OT 25K (quá khứ KHÔNG bị tính lại)');
  const bd = await F.computeActualLaborBreakdownByEmployee('2026-10-30', '2026-11-02');
  eq([bd.e1.amount, bd.e1.hours, bd.e1.otHours], [200000 + 218000, 20, 4], 'breakdown theo người cộng đúng theo mốc');
  eq([F.empPayTermsOn(emp, '2026-10-31').hourlyRate, F.empPayTermsOn(emp, '2026-11-01').hourlyRate, F.empPayTermsOn(emp, '2026-12-01').otRate], [20000, 21000, 25000], 'empPayTermsOn chọn mốc ≤ ngày (đúng ngày 01/11 đã là mức mới)');
  // Nhân viên cũ chưa có lịch sử: ca có ảnh chụp lúc check-in thắng hồ sơ hiện tại
  const old = { id: 'e2', active: true, ...P({ hourlyRate: 30000, otRate: 40000 }) };
  const F2 = build([old], [sh('e2', '2026-10-05', 8, 16, P({})), sh('e2', '2026-10-06', 8, 16)]);   // ca 1 có ảnh chụp 20K; ca 2 không → hồ sơ hiện tại 30K
  const b2 = await F2.computeActualLaborCostByDate('2026-10-05', '2026-10-06');
  eq([b2['2026-10-05'], b2['2026-10-06']], [8 * 20000, 8 * 30000], 'chưa có lịch sử: ca có ảnh chụp lương dùng ảnh chụp; không có thì hồ sơ hiện tại (như cũ)');
  // Mốc gốc legacy + ảnh chụp: ngày trước mốc đầu ưu tiên ảnh chụp
  const emp3 = { id: 'e3', active: true, ...P({ hourlyRate: 22000 }), payHistory: [{ effectiveFrom: '0000-00-00', legacy: true, ...P({ hourlyRate: 21000 }) }, { effectiveFrom: '2026-10-20', ...P({ hourlyRate: 22000 }) }] };
  const F3 = build([emp3], [sh('e3', '2026-10-05', 8, 16, P({ hourlyRate: 19000 })), sh('e3', '2026-10-06', 8, 16)]);
  const b3 = await F3.computeActualLaborCostByDate('2026-10-05', '2026-10-06');
  eq([b3['2026-10-05'], b3['2026-10-06']], [8 * 19000, 8 * 21000], 'mốc gốc legacy: có ảnh chụp thì dùng ảnh chụp, không thì mức gốc');
  // Lương cứng đổi theo mốc, mỗi ngày chia theo mức đúng ngày (tháng 10: 31 ngày)
  const fx = { id: 'e4', active: true, payType: 'fixed', fixedMonthlySalary: 6200000, payHistory: [{ effectiveFrom: '0000-00-00', legacy: true, payType: 'fixed', fixedMonthlySalary: 3100000 }, { effectiveFrom: '2026-10-16', payType: 'fixed', fixedMonthlySalary: 6200000 }] };
  const F4 = build([fx], []);
  const b4 = await F4.computeActualLaborCostByDate('2026-10-15', '2026-10-16');
  eq([b4['2026-10-15'], b4['2026-10-16']], [3100000 / 31, 6200000 / 31], 'lương cứng đổi từ 16/10: ngày 15 theo mức cũ, ngày 16 theo mức mới');
  // Đổi hình thức: từ lương giờ sang lương cứng
  const sw = { id: 'e5', active: true, payType: 'fixed', fixedMonthlySalary: 3100000, hourlyRate: 0, payHistory: [{ effectiveFrom: '0000-00-00', legacy: true, ...P({}) }, { effectiveFrom: '2026-10-10', payType: 'fixed', fixedMonthlySalary: 3100000 }] };
  const F5 = build([sw], [sh('e5', '2026-10-09', 8, 16), sh('e5', '2026-10-10', 8, 16)]);
  const b5 = await F5.computeActualLaborCostByDate('2026-10-09', '2026-10-10');
  eq([b5['2026-10-09'], b5['2026-10-10']], [8 * 20000 + 3100000 * 0, 3100000 / 31], 'đổi giờ → cứng: trước mốc tính giờ, từ mốc tính lương cứng (không tính hai lần)');
  // Dự đoán theo lịch cũng theo mốc
  const pr = F.plPredictedLaborByDate([emp], [{ employeeId: 'e1', date: '2026-10-30', hours: 10 }, { employeeId: 'e1', date: '2026-11-02', hours: 10 }], '2026-10-30', '2026-11-02');
  eq([pr['2026-10-30'], pr['2026-11-02']], [200000, 218000], 'dự đoán theo lịch cũng dùng mức đúng ngày');
  // Lịch còn sót của người đã nghỉ (màn Lịch không hiện để xoá) → không tính tiền.
  const vi = { id: 'vi', active: true, payType: 'hourly_part', hourlyRate: 15000 };
  const duy = { id: 'duy', active: true, payType: 'hourly_full', hourlyRate: 20000, otEnabled: true, otThresholdHours: 8, otRate: 25000 };
  const vy = { id: 'vy', active: false, payType: 'hourly_part', hourlyRate: 15000 };
  const nghi = F.plPredictedLaborByDate([vi, duy, vy], [{ employeeId: 'vi', date: '2026-10-04', hours: 10.5 }, { employeeId: 'duy', date: '2026-10-04', hours: 10.5 },
    { employeeId: 'vy', date: '2026-10-04', hours: 6 }], '2026-10-04', '2026-10-04');
  eq(nghi['2026-10-04'], 10.5 * 15000 + 8 * 20000 + 2.5 * 25000, 'lịch sót của nhân viên đã nghỉ không cộng vào lương dự đoán (380K, không phải 470K)');
  // Không lịch sử, không ảnh chụp = hành vi cũ
  const plain = { id: 'e6', active: true, ...P({}) };
  const b6 = await build([plain], [sh('e6', '2026-10-05', 8, 16)]).computeActualLaborCostByDate('2026-10-05', '2026-10-05');
  eq(b6['2026-10-05'], 8 * 20000, 'nhân viên chưa có lịch sử/ảnh chụp: như cũ');

  // ── Form sửa nhân viên: đổi lương → thêm mốc (kèm mốc gốc), không đổi lương → không đụng payHistory ──
  {
    const fsrc = extract('quanlygieo.html', ['submitEmployeeForm', 'payTermsOfRecord', 'empPayTermsOn']);
    const mkForm = (cur, vals) => {
      const saved = []; const els = { nvFullName: { value: 'Lan' }, nvPin: { value: '1234' }, nvPayType: { value: vals.payType || 'hourly_full' }, nvHourlyRate: { value: String(vals.rate) }, nvOtEnabled: { checked: true },
        nvOtThreshold: { value: '8' }, nvOtRate: { value: String(vals.ot) }, nvPayFrom: { value: vals.from } };
      const stubs = { document: { getElementById: id => els[id] || null }, NV_ROLES: [], nvEmployeesCache: [cur], nvEditingId: cur.id, nvFormDraft: {}, toast: m => saved.push('toast:' + m), logAudit() {}, renderEntryNv() {}, dkey: () => '2026-11-15',
        updateEmployee: async (id, n, pin, info) => { saved.push(info); }, addEmployee: async () => ({ id: 'x' }), PAY_FIELDS: ['payType', 'hourlyRate', 'otEnabled', 'otThresholdHours', 'otRate', 'fixedMonthlySalary'] };
      const ks = Object.keys(stubs);
      return { saved, run: () => new Function(...ks, 'let nvEditingId2;' + fsrc + '\nreturn submitEmployeeForm();')(...ks.map(k => stubs[k])) };
    };
    const cur = { id: 'e1', payType: 'hourly_full', hourlyRate: 20000, otEnabled: true, otThresholdHours: 8, otRate: 20000, fixedMonthlySalary: 0 };
    const a = mkForm(cur, { rate: 21000, ot: 25000, from: '2026-11-01' }); await a.run();
    const info = a.saved[0];
    eq([info.payHistory.map(h => h.effectiveFrom), info.payHistory[0].legacy, info.payHistory[0].hourlyRate, info.payHistory[1].hourlyRate, info.payHistory[1].otRate, info.hourlyRate, info.otRate], [['0000-00-00', '2026-11-01'], true, 20000, 21000, 25000, 21000, 25000], 'form: đổi 20K→21K từ 01/11 tạo mốc gốc (20K) + mốc mới (21K/OT 25K)');
    const b = mkForm(cur, { rate: 20000, ot: 20000, from: '2026-11-01' }); await b.run();
    eq(b.saved[0].payHistory, undefined, 'form: không đổi lương → không thêm mốc');
    const hist = [{ effectiveFrom: '0000-00-00', legacy: true, ...P({}) }, { effectiveFrom: '2026-11-01', ...P({ hourlyRate: 21000, otRate: 25000 }) }];
    const cur2 = { ...cur, hourlyRate: 21000, otRate: 25000, payHistory: hist };
    const c = mkForm(cur2, { rate: 22000, ot: 25000, from: '2027-01-01' }); await c.run();
    eq([c.saved[0].payHistory.map(h => h.effectiveFrom), c.saved[0].hourlyRate], [['0000-00-00', '2026-11-01', '2027-01-01'], 21000], 'form: mốc tương lai thêm vào lịch sử, mức hiện hành (cấp trên) giữ 21K tới ngày đó');
  }
  // ── Đa cửa hàng: lương cứng chỉ tính cho QUÁN CHÍNH (homeStore, thiếu = gg01); lương giờ theo ca của quán đang xem ──
  {
    const co = { id: 'c1', active: true, payType: 'fixed', fixedMonthlySalary: 3100000 };          // không khai → gg01
    const c2 = { id: 'c2', active: true, payType: 'fixed', fixedMonthlySalary: 6200000, homeStore: 'gg02' };
    const ngay = '2026-10-05';
    const g1 = await build([co, c2], [], 'gg01').computeActualLaborCostByDate(ngay, ngay);
    const g2 = await build([co, c2], [], 'gg02').computeActualLaborCostByDate(ngay, ngay);
    const al = await build([co, c2], [], 'all').computeActualLaborCostByDate(ngay, ngay);
    eq([g1[ngay], g2[ngay], al[ngay] || 0], [100000, 200000, 0], 'lương cứng: gg01 chỉ tính người quán chính gg01, gg02 chỉ người gg02; tổng 2 quán = đúng 1 lần');
    const bd2 = await build([co, c2], [], 'gg02').computeActualLaborBreakdownByEmployee(ngay, ngay);
    eq([bd2.c1 ? bd2.c1.amount : 0, bd2.c2.amount], [0, 200000], 'bảng lương gg02: không có lương cứng của người quán chính gg01');
    const pr2 = build([co, c2], [], 'gg02').plPredictedLaborByDate([co, c2], [], ngay, ngay);
    eq(pr2[ngay], 200000, 'lương dự đoán gg02: chỉ lương cứng người gg02');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
