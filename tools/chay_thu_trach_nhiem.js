// Chạy thử luật quy trách nhiệm (UnitEngine.duty) trên file xuất đầy đủ: node tools/chay_thu_trach_nhiem.js <file-xuat.json> [chi-tiet]
// Không ghi gì. Dùng để so kết quả với phán đoán của chủ trước khi nối vào app.
'use strict';
const fs = require('fs'); const path = require('path');
const { loadEngineModule } = require(path.join(__dirname, '..', 'tests', 'lib', 'engine'));
const D = loadEngineModule().duty;
const file = process.argv[2]; const verbose = process.argv[3] === 'chi-tiet';
if (!file) { console.log('Dùng: node tools/chay_thu_trach_nhiem.js <file-xuat-day-du.json> [chi-tiet]'); process.exit(1); }
const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = ex.duLieuTheoNgay || {};
const need = ['prep_transactions_gieogieo', 'employee_shifts_gieogieo', 'daily_closings_gieogieo'];
for (const k of need) if (!Array.isArray(data[k])) { console.log('Thiếu', k, '— cần file xuất ĐẦY ĐỦ (không phải bản gọn).'); process.exit(1); }
// Giờ bán: id bill mang giờ tạo (bill_<ms>_…); dòng bán bổ sung sau đóng ngày có createdAt = giờ bổ sung nên ưu tiên giờ trong id.
const timeOfTx = t => {
  const m = /^bill_(\d{12,14})_/.exec(String(t.referenceId || t.id || ''));
  if (m) return new Date(Number(m[1])).toISOString();
  return t.backfillAfterClose ? null : (t.createdAt || null);
};
const closings = data.daily_closings_gieogieo.slice().sort((a, b) => String(a.businessDate).localeCompare(String(b.businessDate)));
const txs = data.prep_transactions_gieogieo;
const shifts = data.employee_shifts_gieogieo;
const names = {}; (ex.cauHinh && ex.cauHinh['prep_items_gieogieo'] || []).forEach(p => { names[p.id] = p.name; });
const prepIds = new Set(); closings.forEach(c => (c.prepCountLines || []).forEach(l => prepIds.add(l.prepId)));
const sumBy = {}, poolBy = {}, rows = [];
for (const pid of prepIds) {
  let prev = null; const hist = [];
  for (const c of closings) {
    const l = (c.prepCountLines || []).find(x => x.prepId === pid); if (!l) continue;
    const to = c.prepCountAt || c.closedAt; const variance = Number(l.varianceQty) || 0;
    if (prev) {
      const usage = txs.filter(t => t.prepId === pid && t.type === 'CONSUMPTION' && !t.reversal).map(t => ({ at: timeOfTx(t), qty: Math.abs(Number(t.qty) || 0), refId: t.referenceId, timeUnknown: !timeOfTx(t) }))
        .filter(e => e.timeUnknown || (e.at > prev.at && e.at <= to));
      const sh = shifts.filter(s => s.checkedInAt <= to && (!s.checkedOutAt || s.checkedOutAt >= prev.at));
      const base = D.detectRecipeBias(hist.slice(-10));
      const r = D.attributeInterval({ variance, costPerUnit: 1, usage, shifts: sh, closeAt: to, book: Number(l.systemQty) || 0, baseline: base.recipe ? { ratio: base.ratio } : null });
      const u = usage.reduce((s, e) => s + e.qty, 0), w = {};
      D.attributeInterval({ variance, costPerUnit: 1, usage, shifts: sh, closeAt: to, book: Number(l.systemQty) || 0 }).allocations.forEach(a => { w[a.employeeId || a.employeeName] = Math.abs(a.qty) / Math.max(1, Math.abs(variance)); });
      hist.push({ variance, usage: u, weights: w });
      rows.push({ ngay: c.businessDate, btp: names[pid] || l.prepName || pid, variance, usage: u, kind: r.kind, conf: r.confidence, notes: r.notes, base: base.recipe ? base.ratio : base.reason, alloc: r.allocations.map(a => a.employeeName + ' ' + a.qty), pool: r.pool.map(p => p.kind + ' ' + p.qty) });
      r.allocations.forEach(a => { const k = a.employeeName || a.employeeId; sumBy[k] = (sumBy[k] || 0) + Math.abs(a.qty); });
      r.pool.forEach(p => { poolBy[p.kind] = (poolBy[p.kind] || 0) + Math.abs(p.qty); });
    }
    prev = { at: to };
  }
}
console.log('Số khoảng đo:', rows.length);
console.log('Tổng |lệch| quy cho từng người (g/ml, chưa nhân giá):', sumBy);
console.log('Phần không ai chịu:', poolBy);
const conf = {}; rows.forEach(r => { conf[r.conf] = (conf[r.conf] || 0) + 1; }); console.log('Độ tin cậy:', conf);
if (verbose) rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 25).forEach(r => console.log(JSON.stringify(r)));
