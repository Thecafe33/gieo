// Bản rà bug 01/10/2026 — các lỗi tái hiện được ở engine v5, sửa ở v6 (ENGINE=unit_engine.v5.js để xem lỗi cũ).
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const FILE = process.env.ENGINE || require('./lib/engine_file');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.round(a * 100) / 100, b, m);
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', TASKS = 'duty_tasks_gieogieo', CASES = 'duty_cases_gieogieo';
let T = Date.parse('2026-09-23T08:30:00.000Z');
const mk = (fs, rt) => {
  const fake = makeFake({ rt: rt || {}, fs: fs || {} }); const UE = loadEngineModule(FILE);
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-23', now: () => T, random: () => 0.5, hooks: { notify() {}, report() {} }, appFns: { handoverIsOverThreshold: () => false } });
  return { fake, UE };
};
const prepWorld = (cur = 100) => ({
  rt: { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: cur, capacity: 733, openedAt: 1 } } } },
  fs: { [PI + '/P']: { name: 'Cốt trà lài', unit: 'g', currentStock: cur, costPerUnit: 1, batchYield: 733 },
    [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: cur, unitBase: cur, batchCode: 'L1', qtyInitial: 733 },
    [TASKS + '/verify_P']: { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c1', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, expireAt: '2026-09-24T14:30:00.000Z' },
    [CASES + '/c1']: { id: 'c1', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-21T14:00:00.000Z', to: '2026-09-22T14:30:00.000Z' }, history: [] } }
});
const line = (counted, snap) => ({ prepId: 'P', prepName: 'Cốt trà lài', unit: 'g', activeBatches: [{ id: 'b1', batchCode: 'L1', qtyRemaining: 100, qtyInitial: 733 }], batchQty: { b1: counted }, batchWeighings: { b1: [{ w: counted }] }, snaps: { b1: { book: snap } } });
const C_ = { now: new Date(T + 60000).toISOString(), staff: { id: 'C', fullName: 'Chi' }, businessDate: '2026-09-23' };
const task = () => ({ id: 'verify_P', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-22T14:30:00.000Z', countedQty: 100, bookBeforeCount: 100, usageBase: 50, caseId: 'c1', prepId: 'P' });

(async () => {
  // ── Lỗi 3: xác minh lỗi giữa chừng rồi bấm lại không được trừ thêm ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const orig = f.fake.fstore.collection.bind(f.fake.fstore); let failed = 0;
    f.fake.fstore.collection = name => { const c = orig(name); if (name !== CASES) return c; return { ...c, doc: id => { const d = c.doc(id); return { ...d, get: async () => { if (!failed++) throw new Error('mất mạng'); return d.get(); } }; } }; };
    let e1 = ''; try { await f.UE.duty.verifyCommit(line(80, 100), task(), C_); } catch (e) { e1 = e.message; }
    eq(/mất mạng/.test(e1), true, 'L3 lượt đầu lỗi giữa chừng (sau khi RT đã ghi)');
    await f.UE.duty.verifyCommit(line(80, 100), task(), C_);
    near(f.fake.rtGet('active_units_gieogieo/P/b1/unitBase'), 80, 'L3 bấm lại: tồn lô vẫn 80 (không bị coi 20 g là "đã bán" rồi trừ thêm)');
    eq(f.fake.FS[TASKS + '/verify_P'].status, 'done', 'L3 bấm lại xong việc');
  }
  // ── Lỗi 3b: việc đang được người khác xử lý / đã xong → không cho ghi lần nữa (giành việc bằng transaction) ──
  {
    const fs = prepWorld().fs; fs[TASKS + '/verify_P'] = { ...fs[TASKS + '/verify_P'], status: 'processing', processingById: 'D', processingAt: new Date(T).toISOString() };
    const f = mk(fs, prepWorld().rt); let err = '';
    try { await f.UE.duty.verifyCommit(line(80, 100), task(), C_); } catch (e) { err = e.message; }
    eq([/đang xử lý/.test(err), f.fake.rtGet('active_units_gieogieo/P/b1/unitBase')], [true, 100], 'L3b việc đang do người khác xử lý (còn mới) → từ chối, không ghi gì');
    f.fake.FS[TASKS + '/verify_P'].processingAt = new Date(T - 3 * 60000).toISOString();
    await f.UE.duty.verifyCommit(line(80, 100), task(), C_);
    near(f.fake.rtGet('active_units_gieogieo/P/b1/unitBase'), 80, 'L3b người kia bỏ dở quá 2 phút → giành lại làm được');
    let err2 = ''; try { await f.UE.duty.verifyCommit(line(70, 80), task(), { ...C_, staff: { id: 'E', fullName: 'E' } }); } catch (e) { err2 = e.message; }
    eq([/đã được xử lý/.test(err2), f.fake.rtGet('active_units_gieogieo/P/b1/unitBase')], [true, 80], 'L3b việc đã xong → không ghi lần nữa');
  }
  // ── Lỗi 3c: hai việc xác minh liên tiếp của cùng BTP không ghi đè dòng sổ của nhau ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    await f.UE.duty.verifyCommit(line(80, 100), task(), C_);
    f.fake.FS[TASKS + '/verify_P'] = { id: 'verify_P', status: 'open', prepId: 'P', caseId: 'c2', firstById: 'B', firstBy: 'Bình', firstAt: '2026-09-24T14:30:00.000Z', countedQty: 80, bookBeforeCount: 80, usageBase: 50, expireAt: '2026-09-26T14:30:00.000Z' };
    f.fake.FS[CASES + '/c2'] = { id: 'c2', prepId: 'P', variance: 0, value: 0, status: 'pending_verify', interval: { from: '2026-09-22T14:30:00.000Z', to: '2026-09-24T14:30:00.000Z' }, history: [] };
    T += 86400000;
    await f.UE.duty.verifyCommit(line(60, 80), { ...task(), firstAt: '2026-09-24T14:30:00.000Z', countedQty: 80, bookBeforeCount: 80, caseId: 'c2' }, { ...C_, now: new Date(T).toISOString() });
    eq(Object.keys(f.fake.FS).filter(k => k.startsWith('prep_transactions_gieogieo/prep_verify_')).length, 2, 'L3c hai lượt xác minh → hai dòng sổ riêng (id không trùng)');
  }
  // ── Lỗi 2b: BTP đang cân phải khớp BTP của việc xác minh ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt); let err = '';
    try { await f.UE.duty.verifyCommit({ ...line(80, 100), prepId: 'Q' }, task(), C_); } catch (e) { err = e.message; }
    eq([/không khớp/.test(err), f.fake.rtGet('active_units_gieogieo/P/b1/unitBase')], [true, 100], 'L2b cân BTP khác với việc xác minh → từ chối, không ghi gì');
  }
  // ── Lỗi 5: bán xen giữa bước ghi RT và ghi lô → số trên lô phải theo RT ──
  {
    const f = mk(prepWorld().fs, prepWorld().rt);
    const orig = f.fake.fstore.collection.bind(f.fake.fstore); let sold = false;
    f.fake.fstore.collection = name => { const c = orig(name); if (name !== PB) return c; return { ...c, doc: id => { const d = c.doc(id); return { ...d, update: async patch => {
      if (!sold && patch && patch.qtyRemaining != null) { sold = true; await f.UE.consume.prepSale('P', 10, 'bán xen', 'bill_9_x', '2026-09-23', 'bill_9_x_prep_P'); }
      return d.update(patch); } }; } }; };
    await f.UE.duty.verifyCommit(line(80, 100), task(), C_);
    const rt = f.fake.rtGet('active_units_gieogieo/P/b1/unitBase'), fsq = f.fake.FS[PB + '/b1'];
    eq([rt, fsq.qtyRemaining, fsq.unitBase], [70, 70, 70], 'L5 bán 10 g xen vào → RT, qtyRemaining và unitBase của lô cùng 70');
  }
  // ── Lỗi 6: bán BTP nhiều hơn lô đang có → tồn không âm, khoản thiếu vào "âm chờ đối chiếu" ──
  {
    const f = mk({ [PI + '/P']: { name: 'Cốt', unit: 'g', currentStock: 50, costPerUnit: 1 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 50, unitBase: 50, batchCode: 'L1' } },
      { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 50, capacity: 100, openedAt: 1 } } } });
    await f.UE.consume.prepSale('P', 100, 'bán', 'bill_1_x', '2026-09-23', 'bill_1_x_prep_P');
    const p = f.fake.FS[PI + '/P'];
    eq([p.currentStock, p.pendingShortage || 0], [0, 50], 'L6 lô còn 50 bán 100 → tồn 0, thiếu chờ đối chiếu 50 (không âm −50)');
    // bán đủ lô → không tốn thêm lượt suy tồn
    const g = mk({ [PI + '/P']: { name: 'Cốt', unit: 'g', currentStock: 300, costPerUnit: 1 }, [PB + '/b1']: { prepId: 'P', status: 'active', qtyRemaining: 300, unitBase: 300, batchCode: 'L1' } },
      { active_units_gieogieo: { P: { b1: { code: 'L1', unitBase: 300, capacity: 300, openedAt: 1 } } } });
    await g.UE.consume.prepSale('P', 100, 'bán', 'bill_2_x', '2026-09-23', 'bill_2_x_prep_P');
    eq(g.fake.FS[PI + '/P'].currentStock, 200, 'L6 bán đủ lô: tồn 300 → 200');
  }
  // ── Lỗi 4: hoàn kho khi NL đang khoá cân → báo lỗi thật, không ghi dòng hoàn ngoài tem; nhả khoá rồi hoàn lại được ──
  {
    const f = mk({ 'inventory_items_gieogieo/X': { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 900, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] },
      'stock_containers_gieogieo/A': { itemId: 'X', code: 'AAA', status: 'open', unitBase: 900, baseQty: 1000 }, 'prep_ingredient_locks_gieogieo/X': { batchId: 'b' } },
      { active_units_gieogieo: { X: { __prepLock: { batchId: 'b' }, A: { code: 'AAA', unitBase: 900, capacity: 1000, openedAt: 1 } } } });
    const rev = () => f.UE.consume.reverseIngredient('X', 100, 'note', 'o1', null, [{ containerId: 'A', qty: 100 }], false).then(() => null, e => e);
    const e1 = await rev();
    eq([!!e1, e1 && e1.code, /chờ cân/.test((e1 && e1.message) || '')], [true, 'PREP_LOCKED', true], 'L4 NL đang khoá → hoàn kho báo lỗi thật (bill phải được giữ)');
    eq([f.fake.rtGet('active_units_gieogieo/X/A/unitBase'), Object.keys(f.fake.FS).filter(k => k.startsWith('stock_transactions')).length, Object.keys(f.fake.FS).filter(k => k.startsWith('stock_anomalies')).length], [900, 0, 0], 'L4 không ghi dòng hoàn ngoài tem, không có Sổ lệch');
    const claim = f.fake.FS['reversal_unit_claims_gieogieo/o1_ing_X'];
    eq(!claim || claim.status !== 'claiming', true, 'L4 claim không bị kẹt "claiming" (làm lại ngay được, không chờ 2 phút)');
    // nhả khoá → làm lại → hoàn đúng vào tem
    await f.fake.db.ref('active_units_gieogieo/X/__prepLock').remove(); delete f.fake.FS['prep_ingredient_locks_gieogieo/X'];
    const e2 = await rev();
    eq([e2, f.fake.rtGet('active_units_gieogieo/X/A/unitBase'), (Object.values(f.fake.FS).find(v => v && v.reversal) || {}).reversalCoverage], [null, 1000, 'full'], 'L4 hết khoá → hoàn lại đúng vào tem (900 → 1000), dòng hoàn "full"');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
