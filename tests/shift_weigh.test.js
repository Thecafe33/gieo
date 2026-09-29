// Cân NL cuối ca theo mã (E4.5 — chạy trên unit_engine.v1.js + Firebase giả, sổ kho thật).
const { mkSW, line, U } = require('./lib/sw_env');
const staff = { fullName: 'NV', id: 'e1' };
(async () => {
  let ok = true; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
  // S1: nợ đã báo hết + bán xen giữa lúc cân và lúc chốt
  let E = mkSW({ active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: -100, finishedDebt: true, openedAt: 1 }, C: { code: 'CCC', unitBase: 580, openedAt: 5 } } } });
  let l = line('X', [U('C', 'CCC', 5, 450, 600)]); E.state.lines = [l];
  let r = await E.F.shiftWeighApplyLinePOS(l, '2026-09-27', staff, 's1');
  eq(E.rtGet('active_units_gieogieo/X/C/unitBase'), 430, 'S1 C after keeps sale');
  eq(E.rtGet('active_units_gieogieo/X/A'), undefined, 'S1 debt node removed');
  eq(E.txRows().map(t => [t.type, t.qty, t.id.endsWith('_C'), t.measured, t.wasteKind]), [['WASTE', -50, true, true, 'shift_weigh']], 'S1 ledger');
  eq([r.book, r.counted, r.lossQty], [500, 450, 50], 'S1 totals');
  eq(E.FS['stock_containers_gieogieo/A'].unitBase, 0, 'S1 debt copy closed');
  // S2: gọi lại phiên mới cùng opId (mất l._rtDone) — không ghi đôi
  let l2 = line('X', [U('C', 'CCC', 5, 450, 600)]); E.state.lines = [l2];
  r = await E.F.shiftWeighApplyLinePOS(l2, '2026-09-27', staff, 's1');
  eq(E.rtGet('active_units_gieogieo/X/C/unitBase'), 430, 'S2 no double write');
  eq(E.txRows().length, 1, 'S2 ledger idempotent');
  eq(r.lossQty, 50, 'S2 reconstructed loss incl debt');
  // S3: hai mã mở + nợ → nợ gắn vào mã mới nhất
  E = mkSW({ active_units_gieogieo: { Y: { A: { code: 'A1', unitBase: 200, openedAt: 1 }, B: { code: 'B1', unitBase: 600, openedAt: 9 }, D: { code: 'D1', unitBase: -30, finishedDebt: true, openedAt: 0 } } } });
  l = line('Y', [U('A', 'A1', 1, 150, 200), U('B', 'B1', 9, 620, 600)]); E.state.lines = [l];
  r = await E.F.shiftWeighApplyLinePOS(l, 'd', staff, 's3');
  eq(E.txRows().map(t => [t.type, t.qty]), [['WASTE', -50], ['ADJUSTMENT', 50]], 'S3 per-code + debt on newest');
  eq([E.rtGet('active_units_gieogieo/Y/A/unitBase'), E.rtGet('active_units_gieogieo/Y/B/unitBase'), E.rtGet('active_units_gieogieo/Y/D')], [150, 620, undefined], 'S3 RT');
  eq(r.lossQty, 0, 'S3 net loss 0');
  // S4: có mã mới mở sau lúc lập danh sách → bắt tải lại
  E = mkSW({ active_units_gieogieo: { Z: { A: { code: 'A', unitBase: 100, openedAt: 1 }, N: { code: 'N', unitBase: 500, openedAt: 3 } } } });
  l = line('Z', [U('A', 'A', 1, 90, 100)]); E.state.lines = [l];
  try { await E.F.shiftWeighApplyLinePOS(l, 'd', staff, 's4'); eq('no throw', 'throw', 'S4'); } catch (e) { eq(e.code, 'SW_RELOAD', 'S4 reload'); }
  eq(E.rtGet('active_units_gieogieo/Z/A/unitBase'), 100, 'S4 untouched');
  // S5: có mã "không có trên tay" → không ghi gì, chỉ cảnh báo
  E = mkSW({ active_units_gieogieo: { W: { A: { code: 'A', unitBase: 100, openedAt: 1 }, B: { code: 'B', unitBase: 50, openedAt: 2 } } } });
  l = line('W', [U('A', 'A', 1, 90, 100), U('B', 'B', 2, null, null, 'missing')]); E.state.lines = [l];
  r = await E.F.shiftWeighApplyLinePOS(l, 'd', staff, 's5');
  eq([r.status, E.alerts().length, E.rtGet('active_units_gieogieo/W/A/unitBase'), E.txRows().length], ['unconfirmed', 1, 100, 0], 'S5 unconfirmed no writes');
  // (shiftWeighSavedLinePOS vẫn ở POS — xem tests trong shift_weigh_heal / màn kết ca)
  // S6: NL đang khoá cân mẻ → dừng, không ghi
  E = mkSW({ active_units_gieogieo: { V: { __prepLock: { batchId: 'b' }, A: { code: 'A', unitBase: 100, openedAt: 1 } } } });
  l = line('V', [U('A', 'A', 1, 90, 100)]); E.state.lines = [l];
  try { await E.F.shiftWeighApplyLinePOS(l, 'd', staff, 's6'); eq(1, 0, 'S6'); } catch (e) { eq([/chờ cân/.test(e.message), E.rtGet('active_units_gieogieo/V/A/unitBase'), E.txRows().length], [true, 100, 0], 'S6 prep lock'); }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
