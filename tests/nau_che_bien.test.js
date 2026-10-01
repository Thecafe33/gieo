// Rà tab Nấu chế biến (01/10/2026): hai lỗi sửa ở POS. Engine thật + Firebase giả + hàm POS thật trích từ HTML.
//  1. Bấm Hoàn thành mà rớt mạng SAU bước giành lô → lô kẹt ở 'finishing' (số cân đã chốt trong _pendingFinish).
//     Trước đây POS chỉ nạp lô 'cooking'/'active' nên lô kẹt biến mất, không ai bấm làm tiếp. Nay hiện thẻ
//     "Tiếp tục lưu", làm tiếp ĐÚNG số đã chốt, không cộng tồn BTP hai lần.
//  2. Thẻ "Nên nấu" tính lượng mẻ đang nấu theo b.ratio (không tồn tại) thay vì batchRatio.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
const { extract } = require('./lib/extract');
const FILE = process.env.ENGINE || require('./lib/engine_file');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const PI = 'prep_items_gieogieo', PB = 'prep_batches_gieogieo', PT = 'prep_transactions_gieogieo';
const T = Date.parse('2026-10-01T08:30:00.000Z');
const quiet = { warn() {}, error() {}, info() {}, log() {} };
const initUE = fake => { fake.FS['duty_config_gieogieo/current'] = { fleetCompliant: true }; const UE = loadEngineModule(FILE);
  UE.init({ app: 'pos', fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-10-01', now: () => T, random: () => 0.5,
    hooks: { notify() {}, report() {}, fifoChanged: async () => {} }, appFns: { handoverIsOverThreshold: () => false } });
  return UE; };
// Cho lệnh doc(id).update của một collection lỗi khi cờ bật (mô phỏng rớt mạng đúng bước đó).
const failDocUpdate = (fake, coll, st) => { const orig = fake.fstore.collection.bind(fake.fstore);
  fake.fstore.collection = name => { const c = orig(name); if (name !== coll) return c;
    return { ...c, doc: id => { const d = c.doc(id); return { ...d, update: x => (st.on ? Promise.reject(new Error('mất mạng')) : d.update(x)) }; } }; }; };

// Hàm POS thật của màn Nấu chế biến.
const posFns = (fake, UE) => {
  const src = extract('posgieo.html', ['loadPrepBatchesPOS', 'prepFinishingCardHTML', 'resumePrepFinish', '_prepAfterFinishOK', 'fmtPrepQty', 'fmtDateTimeShort']);
  const calls = { toast: [], label: [], render: 0 };
  const stubs = { fstore: fake.fstore, UnitEngine: UE, toast: m => calls.toast.push(m), setBtnBusy: () => () => {},
    showPrepLabelCard: id => calls.label.push(id), refreshPrepYieldStatsPOS: async () => {}, prepSugRefresh: () => {},
    renderPrepBatchForm: () => { calls.render++; }, escHtmlPos: s => String(s == null ? '' : s), openPrepFinishForm: () => {}, console: quiet };
  const ks = Object.keys(stubs);
  const api = new Function(...ks, 'let PREP_BATCHES_CACHE_POS = []; let _prepBatchesLoadError = null; let _posSubmitBusy = false;\n' + src +
    '\nreturn { loadPrepBatchesPOS, prepFinishingCardHTML, resumePrepFinish, get cache() { return PREP_BATCHES_CACHE_POS; }, get busy() { return _posSubmitBusy; } };')(...ks.map(k => stubs[k]));
  return { api, calls };
};

(async () => {
  // ── 1. Lô kẹt ở 'finishing' → POS hiện và làm tiếp đúng số đã chốt ──
  {
    const fake = makeFake({ rt: {}, fs: {
      [PI + '/P']: { name: 'Cốt trà', code: 'CT', unit: 'g', currentStock: 0, batchYield: 1000, costPerUnit: 1, active: true },
      [PB + '/m1']: { prepId: 'P', prepCode: 'CT', prepName: 'Cốt trà', unit: 'g', status: 'cooking', batchRatio: 2, qtyInitial: 0, qtyRemaining: 0,
        startedAt: '2026-10-01T07:30:00.000Z', reconcileInputs: {}, businessDate: '2026-10-01', shelfLifeType: 'endOfDay', shelfLifeHours: 0 } } });
    const UE = initUE(fake);
    const st = { on: true };
    failDocUpdate(fake, PB, st);
    const b0 = { id: 'm1', ...fake.FS[PB + '/m1'] };
    let threw = false;
    try {
      await UE.prep.finishBatch(b0, { qty: 1990, batchCode: 'CT-0110-01', expiresAt: null, inputCost: 200, weighLines: [{ net: 1990 }],
        staffEmp: { id: 'A', fullName: 'An' }, sug: 2000, lechPct: -0.5, finishedAt: '2026-10-01T08:20:00.000Z' });
    } catch (e) { threw = true; }
    eq([threw, fake.FS[PB + '/m1'].status, fake.FS[PB + '/m1']._pendingFinish && fake.FS[PB + '/m1']._pendingFinish.qty, fake.FS[PI + '/P'].currentStock],
      [true, 'finishing', 1990, 1990], 'dựng lại lỗi: rớt mạng sau khi giành lô → lô kẹt ở finishing, tồn BTP đã cộng 1990, lô chưa lên RT');
    st.on = false;

    const { api, calls } = posFns(fake, UE);
    await api.loadPrepBatchesPOS();
    const kep = api.cache.find(b => b.id === 'm1');
    eq(kep && kep.status, 'finishing', 'màn Nấu chế biến nạp cả lô kẹt ở finishing (trước đây biến mất)');
    const card = api.prepFinishingCardHTML(kep);
    eq([card.includes("resumePrepFinish('m1')"), card.includes('Tiếp tục lưu'), card.includes('1.990')], [true, true, true], 'thẻ lô kẹt có nút "Tiếp tục lưu" và hiện đúng số đã cân');

    await api.resumePrepFinish('m1');
    const lo = fake.FS[PB + '/m1'];
    eq([lo.status, lo.qtyInitial, lo.qtyRemaining, lo.batchCode, '_pendingFinish' in lo, lo.finishedBy],
      ['active', 1990, 1990, 'CT-0110-01', false, 'An'], 'Tiếp tục lưu: lô active đúng số ĐÃ CHỐT (1990), đúng mã lô, đúng người hoàn thành');
    eq([fake.rtGet('active_units_gieogieo/P/m1') && fake.rtGet('active_units_gieogieo/P/m1').unitBase, fake.FS[PI + '/P'].currentStock],
      [1990, 1990], 'lô lên RT (tem = sự thật) và tồn BTP KHÔNG bị cộng lần hai');
    eq(Object.keys(fake.FS).filter(k => k.startsWith(PT + '/')).length, 1, 'chỉ một dòng PRODUCTION');
    eq([calls.label, (calls.toast[0] || '').includes('CT-0110-01'), api.cache.find(b => b.id === 'm1').status, api.busy],
      [['m1'], true, 'active', false], 'màn hình: hiện thẻ tem lô, báo đã lưu, bộ nhớ cập nhật, nhả khoá thao tác');

    // Bấm lại (máy khác đã làm xong / bấm đúp) → không ghi gì thêm.
    const before = JSON.stringify([fake.FS[PB + '/m1'], fake.FS[PI + '/P']]);
    await api.resumePrepFinish('m1');
    eq([JSON.stringify([fake.FS[PB + '/m1'], fake.FS[PI + '/P']]) === before, calls.label.length, calls.render >= 1],
      [true, 1, true], 'bấm lại khi lô đã xong: không ghi gì, chỉ tải lại màn');
  }
  {
    // Tiếp tục lưu cũng rớt mạng → báo bấm lại, giữ lô ở finishing, nhả khoá thao tác.
    const fake = makeFake({ rt: {}, fs: {
      [PI + '/P']: { name: 'Cốt trà', unit: 'g', currentStock: 0, batchYield: 1000, active: true },
      [PB + '/m2']: { prepId: 'P', prepName: 'Cốt trà', unit: 'g', status: 'finishing', batchRatio: 1, startedAt: '2026-10-01T07:30:00.000Z',
        _pendingFinish: { qty: 980, batchCode: 'CT-0110-02', expiresAt: null, inputCost: 100, weighLines: [], weighMethod: 'manual',
          staffFullName: 'Bình', staffEmployeeId: 'B', declaredYieldTotal: 1000, yieldVariancePct: -2, finishedAt: '2026-10-01T08:10:00.000Z' } } } });
    const UE = initUE(fake);
    const st = { on: true };
    failDocUpdate(fake, PB, st);
    const { api, calls } = posFns(fake, UE);
    await api.resumePrepFinish('m2');
    eq([fake.FS[PB + '/m2'].status, /Chưa lưu được/.test(calls.toast.join(' ')), api.busy], ['finishing', true, false], 'lượt làm tiếp lỗi: lô vẫn chờ, báo bấm lại, không kẹt khoá');
    st.on = false;
    await api.resumePrepFinish('m2');
    eq([fake.FS[PB + '/m2'].status, fake.FS[PB + '/m2'].qtyInitial, fake.FS[PI + '/P'].currentStock, fake.FS[PB + '/m2'].finishedBy], ['active', 980, 980, 'Bình'],
      'bấm lại sau khi có mạng: xong đúng số đã chốt, tồn cộng đúng một lần');
  }

  // ── 2. Gợi ý "Nên nấu": lượng mẻ đang nấu theo batchRatio ──
  {
    const fake = makeFake({ rt: {}, fs: { [PB + '/c1']: { prepId: 'P', status: 'cooking', batchRatio: 2, qtyInitial: 0 } } });
    const UE = initUE(fake);
    const src = extract('posgieo.html', ['_prepSugRefreshImpl']);
    const seen = [];
    const stubs = { fstore: fake.fstore, db: fake.db, UnitEngine: UE, posDateKey: () => '2026-10-01',
      prepSugLoadHistory: async () => {}, _prepSugInitUsed: async () => {}, ensureKhoItemsPOS: async () => {},
      prepSugDemand: () => ({ n: 10, d: 1000 }), _prepSugLead: () => 30, renderFifoAlertBar: () => {}, prepSugCardHTML: () => '',
      document: { getElementById: () => null }, PREP_SUG: { minDays: 7 }, KHO_ITEMS_CACHE: [],
      prepSugEvaluate: o => { seen.push(o.pending); return { ratio: 1, qty: 1000, kind: 'topup', runoutMin: 600 }; }, console: quiet };
    const ks = Object.keys(stubs);
    const run = new Function(...ks, 'let _prepSug = { hist: { rem: [] }, usedReady: true, usedDay: "2026-10-01", used: {}, rt: {}, touched: new Set(), full: true, rtAt: 0, sums: [] };\n'
      + 'let PREP_ITEMS_CACHE_POS = [{ id: "P", name: "Cốt trà", unit: "g", batchYield: 1000 }];\n' + src + '\nreturn _prepSugRefreshImpl;')(...ks.map(k => stubs[k]));
    await run();
    eq(seen[seen.length - 1], 2000, 'đang nấu 2 mẻ (mẻ 1000 g) → gợi ý tính đang chờ 2000 g (trước đây tính 1000 g)');
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.stack || e); process.exit(1); });
