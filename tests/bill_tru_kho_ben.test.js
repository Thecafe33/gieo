'use strict';
// [F4 12/11/2026 — docs/KE_HOACH_FIX_TRU_KHO_HAO_HUT_12-11.md] Việc trừ kho BỀN của bill chính (consumeJobs.main): bill mới ghi kèm việc
// «pending» cùng lần ghi bill (pos_thanh_toan.v2), trừ kho xong → «done», app tắt giữa chừng → mở app / kết ca chạy nốt.
// Hàm POS THẬT (posgieo.html) + UnitEngine v22 thật trên Firebase giả (tests/lib/wrap_harness — như tools/ra_soat/tru_kho_luc_ban.js).
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const { runWrapped } = require('./lib/wrap_harness');
const MONTH_KEYS = ['thang01','thang02','thang03','thang04','thang05','thang06','thang07','thang08','thang09','thang10','thang11','thang12'];
const ORDER = { billCode: 'B001', date: '28/09/2026', total: 30000, itemsArray: [{ name: 'Trà sữa', size: 'M', qty: 1, price: 30000, toppings: [] }], items: 'x', addons: [], isToGo: true, createdAt: '2026-09-28T03:00:00.000Z' };
const job = (status, extra) => ({ consumeJobs: { main: Object.assign({ status, at: 1 }, extra || {}) } });
function seed(bills) {
  return {
    rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 200, capacity: 1000, openedAt: 1 } } },
      orders_gieogieo: { thang09: { 28: Object.fromEntries(Object.entries(bills).map(([id, extra]) => [id, { ...JSON.parse(JSON.stringify(ORDER)), billCode: id.toUpperCase(), ...extra }])) } } },
    fs: { 'inventory_items_gieogieo/X': { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 200, costPerUnit: 10, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] },
      'stock_containers_gieogieo/A': { itemId: 'X', itemName: 'Sữa', code: 'AAA', status: 'open', unitBase: 200, baseQty: 1000, unit: 'ml' } }
  };
}
const EXPORTS = ['resumeMainConsumeJobsPOS', '_resumeMainConsumeJobsImplPOS', '_mainConsumeJobMarkPOS', '_mainJobPathPOS', '_mainJobDuePOS', 'applySalesConsumptionPOS', '_applySalesConsumptionCorePOS'];
const spec = (bills, flow) => ({ app: 'pos', target: 'resumeMainConsumeJobsPOS', exports: EXPORTS, helpers: ['_ueWarnGogsConsumptionFailed'], seed: seed(bills),
  scope: (fake, rec) => {
    const orders = Object.entries(bills).map(([id, extra]) => ({ id, ...JSON.parse(JSON.stringify(ORDER)), billCode: id.toUpperCase(), ...JSON.parse(JSON.stringify(extra)), items: ORDER.itemsArray }));
    return { MONTH_KEYS, orders, shiftState: { businessDate: '2026-09-28' }, _mainJobResumeBusyPOS: null, _deletingOrderIds: new Set(), _consumptionInflightPOS: new Map(), _salesConsumeChains: new Map(),
      toast: rec('toast'), toastAutoReport: rec('toastAutoReport'), refreshFifoAlert: async () => {}, trackConsumptionPOS: (id, p) => p,
      ensureRecipesLoadedPOS: async () => ({}), ensureToppingRecipesLoadedPOS: async () => ({}), ensurePackagingPresetsLoadedPOS: async () => ({}), ensurePackagingItemOverridesLoadedPOS: async () => ({}),
      ensurePackagingBaggingRulesLoadedPOS: async () => ({}), ensurePackagingRulesLoadedPOS: async () => ({ rules: [], config: {} }), ensurePackagingBaggingTableLoadedPOS: async () => ({}),
      computeConsumptionForOrder: () => ({ agg: { X: 50 }, prepAgg: {}, skipped: [] }), reportMissingRecipePOS: () => {}, prepSugOnUsage: () => {}, posDateKey: () => '2026-09-28',
      vnDate: d => new (fake.clock.Date)(d === undefined ? fake.clock.now() : d), STOCK_CONTAINERS_COLL: 'stock_containers_gieogieo' };
  }, call: flow });
const st = r => ({ tem: r.rt.active_units_gieogieo.X.A.unitBase,
  so: Object.entries(r.fs).filter(([p, d]) => p.startsWith('stock_transactions_gieogieo/') && d.type === 'CONSUMPTION').map(([p, d]) => p.split('/')[1] + ':' + d.qty).sort(),
  job: id => ((r.rt.orders_gieogieo.thang09[28][id] || {}).consumeJobs || {}).main || null });

(async () => {
  {
    // a. App tắt TRƯỚC khi kịp trừ (bill đã lưu, việc pending, chưa tem chưa sổ) → mở app chạy nốt: đúng một lần
    let ran;
    const r = await runWrapped('engine', spec({ bill_o1: job('pending') }, async F => { ran = await F.resumeMainConsumeJobsPOS('mo_app'); await F.resumeMainConsumeJobsPOS('mo_app'); }));
    const s = st(r);
    assert.equal(ran, 1); assert.equal(s.tem, 150); assert.deepEqual(s.so, ['bill_o1_ing_X:-50']); assert.equal(s.job('bill_o1').status, 'done');
    console.log('ok a. Tắt trước khi trừ → mở app chạy nốt: tem 200→150, một dòng sổ, việc «done»; chạy lần hai không làm gì');
  }
  {
    // b. Tắt GIỮA trừ tem và ghi sổ (tools/ra_soat tình huống 5) → chạy nốt KHÔNG trừ tem lần hai (dấu chống lặp kho v22 F3)
    const r = await runWrapped('engine', spec({ bill_o1: job('pending'), bill_o2: job('done') }, async (F, fake, base) => {
      const rt = fake.fstore.runTransaction.bind(fake.fstore); let killed = false;
      fake.fstore.runTransaction = fn => { if (!killed) { killed = true; return new Promise(() => {}); } return rt(fn); };
      F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28'); await new Promise(x => setTimeout(x, 300)); fake.fstore.runTransaction = rt;
      // mở lại app: bộ nhớ mới, đơn tải lại từ RT
      base._salesConsumeChains = new Map(); base._consumptionInflightPOS = new Map();
      await F.resumeMainConsumeJobsPOS('mo_app');
      await F.applySalesConsumptionPOS(base.orders[1], 'bill_o2', '2026-09-28');   // bill 2 bán bình thường
    }));
    const s = st(r);
    assert.equal(s.tem, 100, 'hàng thật ra 100 → tem 100 (không trừ đôi bill 1)'); assert.deepEqual(s.so, ['bill_o1_ing_X:-50', 'bill_o2_ing_X:-50']);
    assert.equal(s.job('bill_o1').status, 'done');
    console.log('ok b. Tắt giữa tem và sổ → chạy nốt: sổ đủ 2 dòng, tem 100 (không trừ lần hai)');
  }
  {
    // c. Không chạy: việc done / huỷ / bill đang xoá dở / bill bổ sung / việc mới (< 2 phút, máy khác có thể đang chạy) / ngày khác / bill cũ không có việc
    let ran;
    const r = await runWrapped('engine', spec({ bill_d: job('done'), bill_c: job('cancelled'), bill_x: { ...job('pending'), deletionPending: true }, bill_b: { ...job('pending'), backfilled: true },
      bill_n: job('pending', { at: 9e15 }), bill_y: { ...job('pending'), date: '27/09/2026' }, bill_old: {}, bill_f: job('failed', { tries: 3 }) },
      async F => { ran = await F.resumeMainConsumeJobsPOS('ket_ca'); }));
    assert.equal(ran, 0); assert.equal(st(r).tem, 200); assert.deepEqual(st(r).so, []);
    console.log('ok c. Không chạy lại: done / cancelled / xoá dở / bổ sung / việc mới < 2 phút / ngày khác / bill cũ không việc / lỗi đủ 3 lần');
  }
  {
    // d. Bộ nhớ máy còn «pending» nhưng RT đã «done» (máy khác làm xong) → đọc RT nhỏ của việc, không chạy
    let ran;
    const sp = spec({ bill_o1: job('done') }, async (F, fake, base) => { base.orders[0].consumeJobs.main.status = 'pending'; ran = await F.resumeMainConsumeJobsPOS('ket_ca'); });
    const r = await runWrapped('engine', sp);
    assert.equal(ran, 0); assert.equal(st(r).tem, 200);
    console.log('ok d. Bộ nhớ cũ «pending» nhưng RT «done» → không chạy (đọc trạng thái mới nhất của việc)');
  }
  {
    // e. Trừ kho có dòng lỗi → «failed» (tries), lần sau chạy lại; bill không có việc (bill cũ / bổ sung) → không ghi gì thêm
    const r = await runWrapped('engine', spec({ bill_o1: job('pending'), bill_old: {} }, async (F, fake, base) => {
      fake.FS['inventory_items_gieogieo/X'] = undefined; delete fake.FS['inventory_items_gieogieo/X'];
      await F.applySalesConsumptionPOS(base.orders[0], 'bill_o1', '2026-09-28');
      await F.applySalesConsumptionPOS(base.orders[1], 'bill_old', '2026-09-28');
    }));
    const j = st(r).job('bill_o1'); assert.equal(j.status, 'failed'); assert.equal(j.tries, 1);
    assert.equal(st(r).job('bill_old'), null, 'bill không có việc → không ghi trạng thái');
    console.log('ok e. Có dòng lỗi → việc «failed» (tries 1, sẽ chạy lại ≤ 3 lần); bill không có việc → không ghi thêm');
  }
  {
    // f. Thanh toán KHÔNG thêm vòng mạng: pos_thanh_toan.v2 = v1 + đúng hai trường consumeJobs nằm trong object bill (cùng lần billRef.set)
    const R = path.join(__dirname, '..'), v1 = fs.readFileSync(path.join(R, 'js/posgieo/pos_thanh_toan.v1.js'), 'utf8').split('\n'), v2 = fs.readFileSync(path.join(R, 'js/posgieo/pos_thanh_toan.v2.js'), 'utf8').split('\n');
    const added = v2.filter(l => !v1.includes(l));
    assert.equal(added.filter(l => /consumeJobs: \{ main: \{ status: 'pending'/.test(l)).length, 2);
    assert(added.every(l => /^\/\/|consumeJobs/.test(l.trim()) || /^\/\//.test(l)), 'chỉ thêm chú thích + trường consumeJobs:\n' + added.join('\n'));
    assert.equal(v1.filter(l => !v2.includes(l)).length, 0, 'không bỏ dòng nào của v1');
    const html = fs.readFileSync(path.join(R, 'posgieo.html'), 'utf8');
    assert(/src="js\/posgieo\/pos_thanh_toan\.v2\.js"/.test(html) && !/pos_thanh_toan\.v1\.js/.test(html), 'posgieo nạp v2');
    console.log('ok f. Thanh toán không thêm vòng mạng: v2 = v1 + trường consumeJobs trong object bill (ghi cùng billRef.set)');
  }
  console.log('ALL PASS');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
