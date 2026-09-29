// Lập bảng "hàm ghi vào dữ liệu thuộc engine" (mục 2.4 kế hoạch) từ inv_ast.json.
// Chạy: npm run inventory && node tools/bang_ghi_engine.js > docs/BANG_GHI_ENGINE.md
const inv = require('../inv_ast.json');
const ENGINE = /^(stock_containers|prep_batches|stock_transactions|prep_transactions|stock_anomalies|reversal_unit_claims|prep_ingredient_locks|order_stock_traces|inventory_items|prep_items)_gieogieo$|^\(động\)$|STOCK_CONTAINERS_COLL|STOCK_ANOMALY_COLL|PREP_RECON_LOCK_COLL/;
const STATE = new Set(['currentStock', 'locationStock', 'unrefilledConsumption', 'refillUncertain', 'pendingShortage', 'untrackedPendingDelta', '_ueLastRecomputeStart', 'unitBase', 'qtyRemaining', 'status', 'openedAt', 'finishedAt', '_ueRtStale', 'qty', 'type']);
const out = ['# Hàm ghi vào dữ liệu thuộc engine (tự sinh từ AST)', '', 'Sinh bởi `tools/bang_ghi_engine.js` từ `inv_ast.json`. `inventory_items` / `prep_items` chỉ tính khi có ghi trường trạng thái tồn (2.9).', ''];
for (const app of ['POS', 'QL']) {
  const rows = [];
  for (const [fn, r] of Object.entries(inv[app])) {
    const parts = [];
    for (const [coll, ops] of Object.entries(r.fsW)) {
      if (!ENGINE.test(coll)) continue;
      const f = (r.fields[coll] || []);
      if (/^(inventory_items|prep_items)_gieogieo$/.test(coll) && !f.some(x => STATE.has(x))) continue;
      parts.push('`' + coll.replace('_gieogieo', '') + '` ' + Object.keys(ops).join('/') + (f.length ? ' (' + f.join(', ') + ')' : ''));
    }
    for (const [p, ops] of Object.entries(r.rtW)) if (/active_units/.test(p)) parts.push('RT ' + Object.keys(ops).join('/'));
    if (parts.length) rows.push([fn, r.line, parts.join('; ')]);
  }
  rows.sort((a, b) => a[1] - b[1]);
  out.push('## ' + (app === 'POS' ? 'POS' : 'Quản lý') + ' — ' + rows.length + ' hàm', '', '| Hàm | Dòng | Ghi gì |', '|---|---|---|');
  rows.forEach(r => out.push('| `' + r[0] + '` | ' + r[1] + ' | ' + r[2] + ' |'));
  out.push('');
}
console.log(out.join('\n'));
