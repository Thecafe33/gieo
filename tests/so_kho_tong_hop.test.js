// T2 tối ưu đọc (docs/KE_HOACH_TOI_UU_DOC.md): sổ kho theo khoảng ngày — ngày đã chốt đọc bản tổng hợp met_{ngày}.
// Chứng minh: computeLedgerRealMetrics + computeThangKetKhoExtra cho CÙNG con số khi đọc qua bản tổng hợp và khi
// đọc sổ gốc (đường cũ), kể cả ngày bị ghi thêm sau khi tổng hợp; và lượt đọc giảm.
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail = 1; };

const html = fs.readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8');
const i0 = html.indexOf('// [GIẢM-ĐỌC] T2 — SỔ KHO THEO KHOẢNG NGÀY'), i1 = html.indexOf('// Lượng TIÊU HAO của một dòng sổ', i0);
if (i0 < 0 || i1 < 0) throw new Error('Không thấy khối T2 trong quanlygieo.html');
const khoiT2 = html.slice(i0, i1);
const fns = extract('quanlygieo.html', ['pad', 'dkey', 'txConsumedQty', '_dayShift', 'computeLedgerRealMetrics', 'computeThangKetKhoExtra', 'thangKetTrachNhiemNL']);

// ── Firestore giả: where ==, >=, <=, > ; documentId ; limit ; set — ĐẾM lượt đọc như Firestore thật ──
const DOCID = { __docid: true };
function taoFs() {
  const db = {}; let reads = 0;
  const all = c => Object.entries(db[c] || {}).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  function q(c, f = [], lim = null) {
    return {
      where: (k, op, v) => q(c, f.concat([[k, op, v]]), lim), limit: n => q(c, f, n),
      get: async () => {
        let rows = all(c).filter(([id, d]) => f.every(([k, op, v]) => { const x = k === DOCID ? id : d[k];
          return op === '==' ? x === v : op === '>=' ? x >= v : op === '<=' ? x <= v : op === '>' ? x > v : false; }));
        rows.sort((a, b) => { for (const [k] of f) { if (k === DOCID) continue; const x = a[1][k], y = b[1][k]; if (x < y) return -1; if (x > y) return 1; } return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
        if (lim != null) rows = rows.slice(0, lim);
        reads += Math.max(1, rows.length);
        const docs = rows.map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) }));
        return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
      },
      doc: id => ({ set: async d => { (db[c] = db[c] || {})[id] = JSON.parse(JSON.stringify(d)); } })
    };
  }
  return { fstore: { collection: c => q(c) }, db, reads: () => reads, them: (c, id, d) => { (db[c] = db[c] || {})[id] = d; } };
}

// ── Dữ liệu ngẫu nhiên cố định: 45 ngày sổ NL + BTP đủ loại dòng ──
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const pad2 = n => String(n).padStart(2, '0');
const dk = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const homNay = dk(new Date());
const ngay = n => { const d = new Date(homNay + 'T00:00:00'); d.setDate(d.getDate() - n); return dk(d); };
const ITEMS = ['nl1', 'nl2', 'nl3', 'nl4', 'nl5', 'nl6'];
function sinh(F) {
  let id = 0;
  for (let n = 45; n >= 0; n--) {
    const d = ngay(n);
    const t0 = d + 'T08:00:00.000Z';
    const at = k => d + 'T' + pad2(8 + Math.floor(k / 60) % 14) + ':' + pad2(k % 60) + ':00.000Z';
    const so = 30 + Math.floor(rnd() * 40);
    for (let k = 0; k < so; k++) {   // bán hàng thường (đa số), có hoàn bill
      F.them('stock_transactions_gieogieo', 's' + (++id), { itemId: pick(ITEMS), type: 'CONSUMPTION', qty: -(1 + Math.floor(rnd() * 50)) / 4, businessDate: d, createdAt: at(k), referenceId: 'bill_' + k, ...(rnd() < 0.05 ? { reversal: true, qty: 3 } : {}) });
    }
    const khac = [
      { type: 'WASTE', qty: -2.5, wasteKind: 'drink', wasteEventId: 'ev' + n, drinkQty: 2, staff: 'An' },
      { type: 'WASTE', qty: -1, wasteKind: 'shift_weigh', shiftWeighOp: 'op' + n, responsibility: { employeeId: 'e1', employeeName: 'Bình' } },
      { type: 'ADJUSTMENT', qty: 0.75, wasteKind: 'shift_weigh' },
      { type: 'ADJUSTMENT', qty: -4, prepReconStage: 'x', staff: 'Cúc' },
      { type: 'ADJUSTMENT', qty: 2, reversal: true },
      { type: 'ADJUSTMENT', qty: -1.5 },
      { type: 'RECEIVING', qty: 10 },
      { type: 'TRANSFER', qty: 3 },
      { type: 'CONSUMPTION', qty: -6, prepRecon: true, varianceKind: pick(['extra_usage', 'under_usage', 'lot_shift']), expectedQty: 5 },
      { type: 'CONSUMPTION', qty: -1, wasteKind: 'drink', wasteEventId: 'ev' + n, drinkQty: 2 }
    ];
    khac.forEach((x, j) => { if (rnd() < 0.8) F.them('stock_transactions_gieogieo', 's' + (++id), { itemId: pick(ITEMS), businessDate: d, createdAt: at(200 + j), ...x }); });
    if (n % 9 === 0) F.them('stock_transactions_gieogieo', 's' + (++id), { type: 'CONSUMPTION', qty: -1, businessDate: d, createdAt: at(300) });   // dòng thiếu itemId
    const p = [
      { type: 'WASTE', qty: -2, totalCost: 18000, wasteKind: 'drink', wasteEventId: 'ev' + n, drinkQty: 2 },
      { type: 'WASTE', qty: -1, totalCost: 0 },
      { type: 'ADJUSTMENT', qty: -3, totalCost: 9000, substitutionQty: 1, costPerUnit: 1500, fromPrepCount: true },
      { type: 'ADJUSTMENT', qty: 2, totalCost: 4000, fromPrepCount: true },
      { type: 'ADJUSTMENT', qty: 1, totalCost: 2000, reversal: true },
      { type: 'CONSUMPTION', qty: -5, totalCost: 7000 },
      { type: 'PRODUCTION', qty: 20, totalCost: 50000 }
    ];
    p.forEach((x, j) => F.them('prep_transactions_gieogieo', 'p' + (++id), { prepId: 'b' + (j % 3), prepName: 'BTP', businessDate: d, createdAt: at(400 + j), ...x }));
  }
}

function moi(F) {
  const ctx = {
    fstore: F.fstore, firebase: { firestore: { FieldPath: { documentId: () => DOCID } } },
    LEDGER_SUM_COLL: 'ledger_day_summaries_gieogieo', CACHE_BUFFER_DAYS: 3,
    ensurePriceHistory: async () => {}, loadInventoryItems: async () => ITEMS.map(i => ({ id: i })),
    itemCostOn: (i, d) => (i ? 1000 + i.charCodeAt(2) * 37 + Number(String(d).slice(8, 10)) * 11 : 0),   // giá đổi theo ngày
    _histIsMissingIndex: () => false, _histIndexUrl: () => '',
    _ledgerWasteRows: async () => [], itemStockManaged: () => true, UnitEngine: { duty: { listCases: async () => [] } },
    console: { warn() {}, log() {} }
  };
  return new Function('ctx', 'with (ctx) {\n' + fns + '\n' + khoiT2 + '\n return { computeLedgerRealMetrics, computeThangKetKhoExtra, tat: () => { _metSumOff = true; }, bo: () => _ledgerRangeInflight.clear() }; }')(ctx);
}
const items = ITEMS.map((i, k) => ({ id: i, name: 'NL ' + k, unit: 'g', currentStock: k === 5 ? 0 : 10 }));
function bang(a, b, ten) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return ok(false, ten + ': khác tập khoá');
  const sai = ka.filter(k => { const x = a[k], y = b[k];
    if (typeof x === 'number') return Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x));
    return JSON.stringify(x) !== JSON.stringify(y); });
  ok(!sai.length, ten + (sai.length ? ' — lệch: ' + sai.map(k => k + '=' + a[k] + '/' + b[k]).join(', ') : ''));
}
const goc = async (F, a, b) => { const M = moi(F); M.tat(); return M.computeLedgerRealMetrics(new Date(a + 'T12:00:00'), new Date(b + 'T12:00:00')); };
const khoGoc = async (F, a, b) => { const M = moi(F); M.tat(); return M.computeThangKetKhoExtra(a, b, items); };

(async () => {
  const F = taoFs(); sinh(F);
  const tu = ngay(40), den = ngay(10);           // "tháng cũ" — mọi ngày đã chốt
  const ref = await goc(F, tu, den);
  ok(ref.consumptionCount > 1000 && ref.wasteCount > 0 && ref.drinkWasteEvents > 0 && ref.prepAdjCount > 0, 'dữ liệu thử đủ loại dòng (' + ref.consumptionCount + ' dòng tiêu hao)');

  // Lần 1: chưa có tổng hợp → đọc gốc + lưu tổng hợp; số y như đường cũ.
  let r0 = F.reads(); const M1 = moi(F);
  const lan1 = await M1.computeLedgerRealMetrics(new Date(tu + 'T12:00:00'), new Date(den + 'T12:00:00'));
  const docLan1 = F.reads() - r0;
  bang(lan1, ref, 'lần 1 (dựng tổng hợp) = đọc sổ gốc');
  await new Promise(r => setTimeout(r, 0));
  ok(Object.keys(F.db.ledger_day_summaries_gieogieo || {}).filter(k => k.startsWith('met_')).length === 31, 'lưu 31 bản tổng hợp met_{ngày}');

  // Lần 2: đọc tổng hợp — cùng số, ít lượt đọc.
  r0 = F.reads(); const M2 = moi(F);
  const lan2 = await M2.computeLedgerRealMetrics(new Date(tu + 'T12:00:00'), new Date(den + 'T12:00:00'));
  const docLan2 = F.reads() - r0;
  bang(lan2, ref, 'lần 2 (đọc tổng hợp) = đọc sổ gốc');
  ok(docLan2 <= 31 * 3 + 2 && docLan2 * 10 < docLan1, 'lượt đọc lần 2: ' + docLan2 + ' (lần 1 / sổ gốc: ' + docLan1 + ')');

  // Ngày cũ bị ghi thêm SAU khi tổng hợp (bổ sung bill, chữa sổ…) → ngày đó tự đọc lại sổ gốc.
  const dThem = ngay(25);
  F.them('stock_transactions_gieogieo', 'late1', { itemId: 'nl2', type: 'WASTE', qty: -7, businessDate: dThem, createdAt: dThem + 'T23:59:59.000Z' });
  F.them('prep_transactions_gieogieo', 'late2', { prepId: 'b1', type: 'WASTE', qty: -1, totalCost: 12345, businessDate: ngay(26), createdAt: ngay(26) + 'T23:59:59.000Z' });
  F.them('stock_transactions_gieogieo', 'late3', { itemId: 'nl4', type: 'CONSUMPTION', qty: -9, businessDate: ngay(27), createdAt: ngay(27) + 'T23:59:59.000Z' });
  const ref2 = await goc(F, tu, den);
  const lan3 = await moi(F).computeLedgerRealMetrics(new Date(tu + 'T12:00:00'), new Date(den + 'T12:00:00'));
  bang(lan3, ref2, 'ngày cũ bị ghi thêm (NL hao hụt, BTP hao hụt, bán thêm) → vẫn = sổ gốc');
  ok(ref2.wasteValue !== ref.wasteValue, 'dòng ghi thêm có làm đổi số (test có nghĩa)');

  // Khoảng chạm vài ngày gần nhất + hôm nay (đọc gốc phần đó) — Theo kỳ / Hôm nay / tháng này.
  for (const [a, b, ten] of [[ngay(6), homNay, 'tuần này (có 3 ngày gần nhất + hôm nay)'], [homNay, homNay, 'hôm nay'], [ngay(13), ngay(7), 'tuần trước'], [ngay(45), homNay, 'cả 46 ngày']]) {
    bang(await moi(F).computeLedgerRealMetrics(new Date(a + 'T12:00:00'), new Date(b + 'T12:00:00')), await goc(F, a, b), ten + ' = sổ gốc');
  }

  // Tổng kết tháng: phần kho (nhập hàng, hàng không động, trách nhiệm theo người) cùng số với đường cũ.
  const kGoc = await khoGoc(F, tu, den);
  const M3 = moi(F); r0 = F.reads();
  const [, kMoi] = await Promise.all([M3.computeLedgerRealMetrics(new Date(tu + 'T12:00:00'), new Date(den + 'T12:00:00')), M3.computeThangKetKhoExtra(tu, den, items)]);
  const docTK = F.reads() - r0;
  ok(JSON.stringify(kMoi.nhapList) === JSON.stringify(kGoc.nhapList) && Math.abs(kMoi.tongNhap - kGoc.tongNhap) < 1e-6, 'Tổng kết tháng: nhập hàng = đường cũ');
  ok(JSON.stringify(kMoi.tonLau) === JSON.stringify(kGoc.tonLau), 'Tổng kết tháng: hàng không động = đường cũ');
  ok(JSON.stringify(kMoi.responsibility) === JSON.stringify(kGoc.responsibility) && kGoc.responsibility.events.length > 20, 'Tổng kết tháng: trách nhiệm theo người = đường cũ (' + kGoc.responsibility.events.length + ' sự kiện)');
  ok(docTK <= 31 * 3 + 2, 'Tổng kết tháng gọi 2 hàm cùng lúc → dùng chung 1 lượt nạp (' + docTK + ' lượt đọc)');

  // Dòng businessDate sai dạng lọt vào khoảng → không lưu tổng hợp đoạn đó, số vẫn đúng.
  const G = taoFs(); sinh(G);
  G.them('stock_transactions_gieogieo', 'xau', { itemId: 'nl1', type: 'WASTE', qty: -1, businessDate: ngay(30).slice(0, 8) + '1', createdAt: '2020' });   // vd 'YYYY-MM-1'
  const gm = await moi(G).computeLedgerRealMetrics(new Date(ngay(40) + 'T12:00:00'), new Date(ngay(10) + 'T12:00:00'));
  bang(gm, await goc(G, ngay(40), ngay(10)), 'có dòng businessDate sai dạng → vẫn = sổ gốc');

  // Bấm "Tải lại" ở Quản lý (memoDropAll) phải xoá luôn lượt nạp dùng chung.
  ok(/function memoDropAll\(\)[\s\S]{0,200}_ledgerRangeInflight\.clear\(\)/.test(html), 'Tải lại (memoDropAll) xoá lượt nạp dùng chung');

  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e); process.exitCode = 1; });
