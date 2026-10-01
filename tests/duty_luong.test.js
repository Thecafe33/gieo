// Nhóm duty (engine v4) — luồng đầy đủ trên Firebase giả: đếm cuối ca → hồ sơ vụ lệch; nghi lệch → việc xác minh;
// người khác cân lại lúc đang bán (không khoá) → tự quy A / lệch thật / tranh chấp; hết hạn; chủ chia lại; nhân viên phản đối.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 700), '!=', JSON.stringify(b).slice(0, 700)); } else console.log('ok', m); };
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo', SH = 'employee_shifts_gieogieo', CASES = 'duty_cases_gieogieo', TASKS = 'duty_tasks_gieogieo', AL = 'alerts_gieogieo';
const Z = s => Date.parse(s);
const bill = (iso, qty, n) => { const ms = Z(iso); return ['bill_' + ms + '_' + n + '_prep_P', { prepId: 'P', type: 'CONSUMPTION', qty: -qty, referenceId: 'bill_' + ms + '_' + n, businessDate: '2026-09-22', createdAt: iso, unit: 'g' }]; };
const world = (opt = {}) => {
  const fs = {
    [PI + '/P']: { name: 'Cốt trà lài', unit: 'g', currentStock: opt.cur != null ? opt.cur : 864.2, costPerUnit: 1, batchYield: 733, lastCount: opt.noPrev ? undefined : { at: '2026-09-21T14:00:00.000Z', qty: 621, byId: 'X', by: 'Xuân', suspect: false } },
    [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: opt.cur != null ? opt.cur : 864.2, unitBase: opt.cur != null ? opt.cur : 864.2, batchCode: 'L1', qtyInitial: 733, businessDate: '2026-09-22' },
    [SH + '/s1']: { businessDate: '2026-09-22', employeeId: 'A', employeeName: 'An', checkedInAt: '2026-09-22T01:00:00.000Z', checkedOutAt: '2026-09-22T06:00:00.000Z', roles: ['barista'] },
    [SH + '/s2']: { businessDate: '2026-09-22', employeeId: 'B', employeeName: 'Bình', checkedInAt: '2026-09-22T06:00:00.000Z', checkedOutAt: null, roles: ['barista'] },
    [SH + '/s3']: { businessDate: '2026-09-23', employeeId: 'C', employeeName: 'Chi', checkedInAt: '2026-09-23T01:00:00.000Z', checkedOutAt: null, roles: ['barista'] }
  };
  // 10 lượt bán 30 g ca sáng (An), 2 lượt ca chiều (Bình)
  for (let i = 0; i < 10; i++) { const [k, v] = bill('2026-09-22T0' + (2 + (i % 4)) + ':' + (i < 5 ? '10' : '40') + ':00.000Z', 30, i); fs[PT + '/' + k] = v; }
  for (let i = 0; i < 2; i++) { const [k, v] = bill('2026-09-22T0' + (8 + i) + ':00:00.000Z', 30, 'c' + i); fs[PT + '/' + k] = v; }
  return { rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: opt.cur != null ? opt.cur : 864.2, capacity: 733, openedAt: 1 } } } }, fs };
};
let T = Z('2026-09-22T14:30:00.000Z');
const mk = opt => {
  const fake = makeFake(world(opt)); const UE = loadEngineModule();
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-22', now: () => T, random: () => 0.5, hooks: { notify() {}, report() {} }, appFns: { handoverIsOverThreshold: () => false } });
  return { fake, UE };
};
const line = (counted, sys, extra) => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', sysQty: sys, counted, activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: sys, qtyInitial: 733 }],
  discardAll: false, perBatch: false, batchQty: {}, batchWeighings: {}, weighings: [], ...(extra || {}) });
const count = async (UE, l, staff) => { const r = UE.prep.countCommitLine(l, { now: new Date(T).toISOString(), staff, businessDate: '2026-09-22' }); await Promise.all(r.jobs.map(j => j.promise)); return r; };
const fsOf = f => f.fake.FS;
const docs = (f, coll) => Object.keys(fsOf(f)).filter(k => k.startsWith(coll + '/')).map(k => ({ id: k.slice(coll.length + 1), ...fsOf(f)[k] }));
const A = { id: 'B', fullName: 'Bình' };   // người đếm cuối ca

(async () => {
  // ── S1: lệch vừa, không nghi → hồ sơ tự quy theo ca; mốc đếm ghi lại ──
  {
    const f = mk(); await count(f.UE, line(764.2, 864.2), A);
    const c = docs(f, CASES)[0];
    eq([c.status, c.variance, c.verified, c.needsNotify], ['auto', -100, false, false], 'S1 vụ lệch −100 tự quy, không báo chủ');
    eq(c.allocations.map(a => [a.employeeId, a.qty]), [['A', -83.33], ['B', -16.67]], 'S1 chia theo bán: ca sáng 10 lượt : ca chiều 2 lượt');
    eq([docs(f, TASKS).length, fsOf(f)[PI + '/P'].lastCount.suspect, fsOf(f)[PI + '/P'].lastCount.qty], [0, false, 764.2], 'S1 không có việc xác minh; mốc đếm = số vừa đếm');
    eq(docs(f, PT).filter(x => x.fromPrepCount).map(x => x.qty), [-100], 'S1 sổ vẫn ghi ADJUSTMENT như cũ');
  }
  // ── S2: lệch 1% vẫn ghi và quy ──
  {
    const f = mk({ cur: 1000 }); await count(f.UE, line(990, 1000), A);
    const c = docs(f, CASES)[0];
    eq([c.variance, c.allocations.reduce((s, a) => s + a.qty, 0)], [-10, -10], 'S2 lệch 1% vẫn được ghi và quy hết');
  }
  // ── S3: chưa có mốc đếm trước → chưa quy ──
  {
    const f = mk({ noPrev: true }); await count(f.UE, line(764.2, 864.2), A);
    const c = docs(f, CASES)[0];
    eq([c.status, c.allocations.length, c.pool[0].reason], ['no_checkpoint', 0, 'khong_co_moc_dem_truoc'], 'S3 lần đếm đầu (chưa có mốc trước) → chưa quy');
  }
  // ── S4: nghi lệch (đếm 7463.6, như ca Cốt trà lài 22/9) → việc xác minh, chưa quy ai ──
  const suspect = async () => {
    const f = mk({ cur: 864.2 }); await count(f.UE, line(7463.6, 864.2, { suspect: true }), A);
    return f;
  };
  {
    const f = await suspect();
    const c = docs(f, CASES)[0], t = docs(f, TASKS)[0];
    eq([c.status, c.allocations.length, c.pool.map(p => p.kind), c.needsNotify], ['pending_verify', 0, ['unverified'], true], 'S4 nghi lệch → chờ xác minh, chưa quy ai, báo chủ (lệch >100%)');
    eq([t.status, t.firstById, t.countedQty, t.bookBeforeCount, t.id], ['open', 'B', 7463.6, 864.2, 'verify_P'], 'S4 việc xác minh mở cho người khác');
    eq(docs(f, AL).map(a => a.type), ['duty_case'], 'S4 có thông báo cho chủ');
  }
  // ── S5: người khác (Chi) cân lại, khớp sổ gốc, có bán xen giữa lúc cân → A nhập sai, quy A; tồn đúng thực tế ──
  {
    const f = await suspect(); const task = docs(f, TASKS)[0];
    T += 3600e3 * 18;     // sáng hôm sau 08:30Z
    // lô đang có 7463.6 (A ghi); đã bán 30 g trước khi Chi chụp mốc
    await f.UE.consume.prepSale('P', 30, 'bán', 'bill_' + T + '_s1', '2026-09-23', 'bill_' + T + '_s1_prep_P').catch(() => {});
    const unitBase = () => f.fake.rtGet('active_units_gieogieo/P/b1/unitBase');
    const snapBook = await f.UE.duty.lotBookNow('P', 'b1');
    // Chi cân thực tế (đúng sổ gốc 864.2 trừ lượt bán 30 g) rồi MỘT lượt bán nữa 20 g xen vào trước khi ghi
    const physical = 864.2 - 30;
    await f.UE.consume.prepSale('P', 20, 'bán', 'bill_' + (T + 1) + '_s2', '2026-09-23', 'bill_' + (T + 1) + '_s2_prep_P').catch(() => {});
    const l = line(null, 864.2, { batchQty: { b1: physical }, batchWeighings: { b1: [{ w: physical }] }, snaps: { b1: { book: snapBook, exact: true, at: new Date(T).toISOString() } } });
    const r = await f.UE.duty.verifyCommit(l, task, { now: new Date(T + 60000).toISOString(), staff: { id: 'C', fullName: 'Chi' }, businessDate: '2026-09-23' });
    eq(r.outcome, 'entry_error', 'S5 Chi cân khớp sổ gốc → A nhập sai');
    const c = docs(f, CASES)[0], t = docs(f, TASKS)[0];
    eq([c.status, c.verified, c.entryErrorConfirmed, c.confidence], ['auto', true, true, 'strong'], 'S5 vụ chốt tự động, độ tin cậy Mạnh');
    const b = c.allocations.find(a => a.employeeId === 'B');
    eq([b && b.qty > 6500, b && b.confidence, b && b.basis.includes('nhap_sai_da_xac_minh')], [true, 'strong', true], 'S5 người đếm sai (Bình) chịu phần nhập sai');
    eq(t.status + ':' + t.outcome, 'done:entry_error', 'S5 việc xác minh đã xong');
    eq(Math.round(unitBase() * 10) / 10, 814.2, 'S5 tồn lô = số cân − phần bán xen (864.2 − 30 − 20), không khoá bán');
    eq(fsOf(f)[PI + '/P'].lastCount.byId + ':' + fsOf(f)[PI + '/P'].lastCount.suspect, 'C:false', 'S5 mốc đếm mới là của Chi');
    const adj = docs(f, PT).find(x => x.fromPrepVerify);
    eq([adj && adj.responsibility.employeeId, adj && adj.responsibility.status], ['B', 'assigned'], 'S5 dòng sổ điều chỉnh ghi trách nhiệm cho người đếm sai');
    eq(docs(f, AL).map(a => a.kindOfAlert).sort(), ['big', 'entry_error'], 'S5 chủ nhận thông báo "nhập sai"');
  }
  // ── S6: người cân lại trùng người cân đầu → bị từ chối ──
  {
    const f = await suspect(); const task = docs(f, TASKS)[0]; let err = '';
    try { await f.UE.duty.verifyCommit(line(null, 864.2, { batchQty: { b1: 800 } }), task, { now: new Date(T).toISOString(), staff: { id: 'B', fullName: 'Bình' }, businessDate: '2026-09-22' }); } catch (e) { err = e.message; }
    eq(/khác người/.test(err), true, 'S6 người cân đầu không tự xác minh cho mình');
  }
  // ── S7: Chi cân lại ≈ số A (A đúng) → lệch thật, chia theo ca ──
  {
    const f = await suspect(); const task = docs(f, TASKS)[0];
    const snapBook = await f.UE.duty.lotBookNow('P', 'b1');
    const r = await f.UE.duty.verifyCommit(line(null, 864.2, { batchQty: { b1: 7460 }, snaps: { b1: { book: snapBook, exact: true } } }), task, { now: new Date(T + 1000).toISOString(), staff: { id: 'C', fullName: 'Chi' }, businessDate: '2026-09-22' });
    const c = docs(f, CASES)[0];
    eq([r.outcome, c.status, c.verified, c.allocations.map(a => a.employeeId).sort()], ['confirmed', 'auto', true, ['A', 'B']], 'S7 hai lần cân như nhau → lệch thật, chia theo ca');
  }
  // ── S8: Chi cân ra số khác hẳn cả A lẫn sổ gốc → tranh chấp, chưa quy ai, báo chủ ──
  let disputed;
  {
    const f = await suspect(); const task = docs(f, TASKS)[0];
    const snapBook = await f.UE.duty.lotBookNow('P', 'b1');
    const r = await f.UE.duty.verifyCommit(line(null, 864.2, { batchQty: { b1: 2500 }, snaps: { b1: { book: snapBook, exact: true } } }), task, { now: new Date(T + 1000).toISOString(), staff: { id: 'C', fullName: 'Chi' }, businessDate: '2026-09-22' });
    const c = docs(f, CASES)[0];
    eq([r.outcome, c.status, c.allocations.length, c.pool[0].kind], ['dispute', 'dispute', 0, 'dispute'], 'S8 B không khớp A lẫn sổ gốc → tranh chấp');
    eq(docs(f, AL).some(a => a.kindOfAlert === 'dispute'), true, 'S8 báo chủ cần quy trách nhiệm');
    disputed = f;
  }
  // ── S9: chủ chia lại cho cả hai (60/40), bắt buộc lý do ──
  {
    const f = disputed; const c0 = docs(f, CASES)[0]; let err = '';
    try { await f.UE.duty.reassign(c0.id, { kind: 'manual', shares: [{ employeeId: 'B', employeeName: 'Bình', share: 0.6 }] }); } catch (e) { err = e.message; }
    eq(/lý do/.test(err), true, 'S9 chia lại phải có lý do');
    await f.UE.duty.reassign(c0.id, { kind: 'manual', shares: [{ employeeId: 'B', employeeName: 'Bình', share: 0.6 }, { employeeId: 'C', employeeName: 'Chi', share: 0.4 }], reason: 'Hai người cùng thao tác', by: { id: 'M', name: 'Chủ' } });
    const c = docs(f, CASES)[0];
    eq([c.status, c.allocations.map(a => [a.employeeId, a.share]), c.history.length >= 2], ['manual', [['B', 0.6], ['C', 0.4]], true], 'S9 chia 60/40 cho cả hai, có lịch sử');
    eq(docs(f, AL).every(a => a.status === 'resolved'), true, 'S9 thông báo được đóng');
    // nhân viên không có phần thì không phản đối được; có phần thì phản đối → chờ chủ
    let e2 = ''; try { await f.UE.duty.contest(c.id, { byId: 'A', byName: 'An', reason: 'x' }); } catch (e) { e2 = e.message; }
    eq(/không có phần/.test(e2), true, 'S9 người không có phần không phản đối được');
    await f.UE.duty.contest(c.id, { byId: 'C', byName: 'Chi', reason: 'Tôi chỉ cân lại' });
    eq(docs(f, CASES)[0].status, 'contested', 'S9 phản đối → chờ chủ xem');
    await f.UE.duty.keep(c.id, { by: { name: 'Chủ' }, reason: 'giữ nguyên' });
    eq(docs(f, CASES)[0].status, 'manual', 'S9 chủ giữ nguyên → về trạng thái trước');
    const old = docs(f, CASES)[0]; await f.UE.duty.reassign(old.id, { kind: 'recipe', reason: 'định mức sai', by: { name: 'Chủ' } });
    eq([docs(f, CASES)[0].allocations.length, docs(f, CASES)[0].pool[0].kind], [0, 'recipe'], 'S9 chủ đánh dấu "định mức" → không ai chịu');
  }
  // ── S10: hết hạn 48 giờ → đóng, chuyển chưa quy ──
  {
    const f = await suspect();
    eq((await f.UE.duty.listOpenTasks()).length, 1, 'S10 việc đang mở');
    T += 49 * 3600e3;
    eq([(await f.UE.duty.listOpenTasks()).length, await f.UE.duty.expireTasks()], [0, 1], 'S10 quá 48 giờ không còn hiện, được đóng');
    eq([docs(f, TASKS)[0].status, docs(f, CASES)[0].status, fsOf(f)[PI + '/P'].lastCount.suspect], ['expired', 'closed_pool', false], 'S10 vụ chuyển "chưa quy", bỏ cờ nghi lệch');
    T = Z('2026-09-22T14:30:00.000Z');
  }
  // ── S11: cổng "cân lại một lần" ──
  {
    const f = mk();
    const g1 = await f.UE.duty.gateCheck(line(7463.6, 864.2));
    const g2 = await f.UE.duty.gateCheck(line(764.2, 864.2));
    const g3 = await f.UE.duty.gateCheck(line(0, 864.2, { discardAll: true }));
    eq([g1.needs, g2.needs, g3.needs], [true, false, false], 'S11 lệch cực đoan → bắt cân lại; lệch vừa → không; bỏ hết có chủ đích → không');
  }
  // ── S12: lệch nền công thức: 6 khoảng liên tiếp cùng chiều ở cả hai người → phần nền không ai chịu ──
  {
    const f = mk();
    const hist = [['2026-09-10T10:00:00Z', -40, 'A'], ['2026-09-11T10:00:00Z', -45, 'B'], ['2026-09-12T10:00:00Z', -38, 'A'], ['2026-09-13T10:00:00Z', -42, 'B'], ['2026-09-14T10:00:00Z', -44, 'A'], ['2026-09-15T10:00:00Z', -41, 'B']];
    hist.forEach(([to, v, who], i) => { fsOf(f)[CASES + '/h' + i] = { prepId: 'P', interval: { from: to, to }, bias: { variance: v, usage: 100, weights: { [who]: 1 } } }; });
    fsOf(f)[CASES + '/h6'] = { prepId: 'P', interval: { to: '2026-09-16T10:00:00Z' }, bias: { variance: -43, usage: 100, weights: { A: 0.5, B: 0.5 } } };
    await count(f.UE, line(764.2, 864.2), A);
    const c = docs(f, CASES).find(x => x.businessDate === '2026-09-22');
    eq([c.pool.some(p => p.kind === 'recipe'), c.parts.some(p => p.kind === 'recipe')], [true, true], 'S12 lệch nền ~−42% ở cả hai người → phần nền thuộc công thức');
    await f.UE.duty.resetBaseline('P', 'Chủ');
    const f2cfg = fsOf(f)['duty_config_gieogieo/current'];
    eq(Object.keys(f2cfg.baselineResetAt), ['P'], 'S12 chủ đặt lại nền sau khi chỉnh công thức');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
