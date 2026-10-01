// Nguyên liệu (v5): cân cuối ca theo mã → hồ sơ vụ lệch theo ca, chạy NỀN (không chặn cân/kết ca/bán hàng).
'use strict';
const { mkSW, line, U } = require('./lib/sw_env');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 600), '!=', JSON.stringify(b).slice(0, 600)); } else console.log('ok', m); };
const Z = s => Date.parse(s);
const staff = { fullName: 'Vỹ', id: 'V' };
const bill = (iso, qty, n) => { const ms = Z(iso); return ['stock_transactions_gieogieo/bill_' + ms + '_' + n + '_ing_X', { itemId: 'X', type: 'CONSUMPTION', qty: -qty, referenceId: 'bill_' + ms + '_' + n, businessDate: '2026-09-28', createdAt: iso }]; };
const extra = (opt = {}) => {
  const fs = {
    'inventory_items_gieogieo/X': { name: 'Sữa tươi', unit: 'ml', trackingMode: 'unit', currentStock: 500, costPerUnit: 2, ...(opt.noPrev ? {} : { lastCount: { at: '2026-09-27T14:00:00.000Z', qty: 800, byId: 'X', by: 'Xuân' } }) },
    'employee_shifts_gieogieo/s1': { businessDate: '2026-09-28', employeeId: 'A', employeeName: 'An', checkedInAt: '2026-09-28T01:00:00.000Z', checkedOutAt: '2026-09-28T06:00:00.000Z', roles: ['barista'] },
    'employee_shifts_gieogieo/s2': { businessDate: '2026-09-28', employeeId: 'B', employeeName: 'Bình', checkedInAt: '2026-09-28T06:00:00.000Z', checkedOutAt: null, roles: ['barista'] }
  };
  for (let i = 0; i < 10; i++) { const [k, v] = bill('2026-09-28T0' + (2 + (i % 4)) + ':' + (i < 5 ? '10' : '40') + ':00.000Z', 20, i); fs[k] = v; }
  for (let i = 0; i < 2; i++) { const [k, v] = bill('2026-09-28T0' + (8 + i) + ':00:00.000Z', 20, 'c' + i); fs[k] = v; }
  return fs;
};
const cases = E => Object.keys(E.FS).filter(k => k.startsWith('duty_cases_gieogieo/')).map(k => ({ id: k.split('/')[1], ...E.FS[k] }));
const run = async (E, seed, day) => {
  const l = line('X', [U('A', 'AAA', 1, 450, 500)]); E.state.lines = [l];
  const r = await E.F.shiftWeighApplyLinePOS(l, day || '2026-09-28', staff, seed);
  await E.UE.duty.flush();
  return r;
};
(async () => {
  // ── S1: cân thiếu 50 ml → chia theo ca (10 lượt : 2 lượt); sổ cũ vẫn ghi ──
  {
    const E = mkSW({ active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 500, openedAt: 1 } } } }, extra());
    E.fake.clock.set(Z('2026-09-28T14:30:00.000Z'));
    const r = await run(E, 's1');
    const c = cases(E)[0];
    eq([r.status, c.type, c.variance, c.status, c.verified], ['reconciled', 'nl', -50, 'auto', false], 'S1 NL cân thiếu 50 → hồ sơ vụ lệch loại NL');
    eq(c.allocations.map(a => [a.employeeId, a.qty]), [['A', -41.67], ['B', -8.33]], 'S1 chia theo bán: ca sáng 10 lượt : ca chiều 2 lượt');
    eq([c.value, c.shiftWeighOp.startsWith('sw_'), c.interval.from], [100, true, '2026-09-27T14:00:00.000Z'], 'S1 giá trị = 50 × 2đ; khoảng đo từ mốc cân trước');
    eq([E.FS['inventory_items_gieogieo/X'].lastCount.byId, E.FS['inventory_items_gieogieo/X'].lastCount.kind], ['V', 'shift_weigh'], 'S1 mốc cân mới ghi lại');
    eq(E.txRows().filter(t => t.wasteKind === 'shift_weigh').length, 1, 'S1 dòng sổ hao hụt cân cuối ca vẫn như cũ');
    // gọi lại (tự bù lượt dở dang) → không tạo thêm hồ sơ, không đổi mốc
    const lastAt = E.FS['inventory_items_gieogieo/X'].lastCount.at;
    await E.UE.duty.onNlWeigh({ itemId: 'X', itemName: 'Sữa tươi', unit: 'ml', opId: c.shiftWeighOp, day: '2026-09-28', staffName: 'Vỹ', staffId: 'V' }, { book: 500, counted: 450 });
    eq([cases(E).length, E.FS['inventory_items_gieogieo/X'].lastCount.at], [1, lastAt], 'S1 gọi lại cùng lượt → idempotent');
  }
  // ── S2: lần cân đầu (chưa có mốc trước) → chưa quy ──
  {
    const E = mkSW({ active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 500, openedAt: 1 } } } }, extra({ noPrev: true }));
    E.fake.clock.set(Z('2026-09-28T14:30:00.000Z')); await run(E, 's2');
    const c = cases(E)[0];
    eq([c.status, c.allocations.length, c.pool[0].reason], ['no_checkpoint', 0, 'khong_co_moc_dem_truoc'], 'S2 chưa có mốc cân trước → chưa quy');
  }
  // ── S3: lệch cực đoan (cân dư rất nhiều) chưa ai xác minh → chưa quy, báo chủ ──
  {
    const E = mkSW({ active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 500, openedAt: 1 } } } }, extra());
    E.fake.clock.set(Z('2026-09-28T14:30:00.000Z'));
    const l = line('X', [U('A', 'AAA', 1, 3500, 500)]); E.state.lines = [l]; l._devAck = true;
    await E.F.shiftWeighApplyLinePOS(l, '2026-09-28', staff, 's3'); await E.UE.duty.flush();
    const c = cases(E)[0];
    eq([c.variance, c.allocations.length, c.pool[0].kind, c.needsNotify, c.largeDeviation], [3000, 0, 'unverified', true, true], 'S3 +3000 so với dùng 240 → chưa quy (có thể cân sai), báo chủ');
    eq(Object.keys(E.FS).some(k => k.startsWith('alerts_gieogieo/duty_')), true, 'S3 có thông báo duty_case');
  }
  // ── S4: lỗi ghi hồ sơ KHÔNG làm hỏng/chặn lần cân (chạy nền) ──
  {
    const E = mkSW({ active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 500, openedAt: 1 } } } }, extra());
    E.fake.clock.set(Z('2026-09-28T14:30:00.000Z'));
    const orig = E.fake.fstore.collection.bind(E.fake.fstore);
    E.fake.fstore.collection = name => { if (name === 'duty_cases_gieogieo') throw new Error('mất mạng'); return orig(name); };
    const r = await run(E, 's4');
    eq([r.status, r.lossQty, E.txRows().filter(t => t.wasteKind === 'shift_weigh').length, cases(E).length], ['reconciled', 50, 1, 0], 'S4 hồ sơ lỗi → lần cân vẫn thành công, sổ vẫn ghi');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
