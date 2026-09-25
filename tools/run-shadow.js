#!/usr/bin/env node
/**
 * P12 — chạy shadow comparison trên dữ liệu production đã export.
 *
 *   node tools/run-shadow.js <thư-mục-chứa-fs-subset.json-và-rtdb-subset.json>
 *
 * Script này CHỈ ĐỌC và chỉ đọc từ file nằm NGOÀI repo. Dữ liệu production
 * không bao giờ được commit — đường dẫn phải truyền vào, không có mặc định trỏ
 * vào cây nguồn.
 *
 * Nó không tự kết luận "đạt": nó nạp kết quả vào `bootstrap/shadow-compare` rồi
 * hỏi cổng, và cổng mặc định ĐÓNG. Ô nào chưa chạy vẫn hiện ra là chưa chạy.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const dataDir = process.argv[2];
if (!dataDir) {
  console.error('Cần đường dẫn tới thư mục dữ liệu export (ngoài repo).');
  process.exit(2);
}

/* Nạp hệ thống y như trình duyệt và test runner làm — cùng một đường nạp, nên
   shadow chạy đúng thứ code sẽ chạy thật. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const GIEO = require(path.join(ROOT, 'src/runtime/registry.js'));
GIEO._setRules(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/layer-rules.json'), 'utf8')));
for (const f of walk(path.join(ROOT, 'src/layers'))) {
  vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
}

const R = GIEO.require('shared-kernel/result');
const ids = GIEO.require('shared-kernel/ids');
const mappers = GIEO.require('legacy-firebase-adapter/mappers');
const recon = GIEO.require('fifo-core/reconciliation');
const projection = GIEO.require('fifo-core/projection');
const ledgerLib = GIEO.require('fifo-core/ledger');
const SH = GIEO.require('bootstrap/shadow-compare');

const STORE = ids.deterministicId('store', ['main']);
const UNKNOWN_ACTOR = ids.deterministicId('actor', ['legacy', 'KHONG-CO-NGUOI-THUC-HIEN']);
const fsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'fs-subset.json'), 'utf8'));
const rtData = JSON.parse(fs.readFileSync(path.join(dataDir, 'rtdb-subset.json'), 'utf8'));

const containers = fsData.stock_containers_gieogieo || {};
const txs = fsData.stock_transactions_gieogieo || {};
const activeUnits = rtData.active_units_gieogieo || {};

/* RTDB keyed theo itemId/containerId — dựng chỉ mục theo code để merge được. */
const rtByCode = Object.create(null);
Object.keys(activeUnits).forEach((itemId) => {
  const byContainer = activeUnits[itemId] || {};
  Object.keys(byContainer).forEach((cid) => {
    const u = byContainer[cid];
    if (u && u.code) rtByCode[u.code] = u;
  });
});

const run = SH.createRun({ runtimeMode: 'SHADOW' });
const report = { mapped: 0, refused: [], ambiguous: {}, drift: [], untracked: {}, noActor: {} };

/* ---------- 1. Map Unit, ghi nhận thứ legacy không trả lời được ---------- */
const units = [];
Object.keys(containers).forEach((id) => {
  const c = Object.assign({ id }, containers[id]);
  const out = mappers.mapUnit({ container: c, rtUnit: rtByCode[c.code], storeId: STORE });
  if (R.isErr(out)) {
    report.refused.push({ code: c.code, kind: out.error.kind, message: out.error.message });
    return;
  }
  report.mapped += 1;
  units.push(out.value.unit);
  (out.value.ambiguous || []).forEach((a) => {
    report.ambiguous[a.code] = (report.ambiguous[a.code] || 0) + 1;
  });
  if (out.value.sourceDrift) {
    report.drift.push(Object.assign({ code: c.code }, out.value.sourceDrift));
  }
});

/* ---------- 2. Ledger: bao nhiêu phần tiêu thụ gắn được vào lô ---------- */
const entries = [];
const entryRefused = [];

/* Đi qua ĐÚNG factory của ledger, không tự dựng object: factory là nơi
   `untrackedPendingDelta` được tính, và nó cũng từ chối những bút toán mà hệ
   mới coi là không hợp lệ — biết legacy có bao nhiêu bút toán như vậy chính là
   một phần kết quả shadow. */
function addEntry(spec) {
  const out = ledgerLib.createEntry(spec);
  if (R.isErr(out)) { entryRefused.push({ kind: out.error.kind, message: out.error.message }); return; }
  entries.push(out.value);
}

Object.keys(txs).forEach((id) => {
  const t = txs[id];
  const allocs = t.fifoAllocations
    ? (Array.isArray(t.fifoAllocations) ? t.fifoAllocations : [t.fifoAllocations])
    : [];
  const bucket = report.untracked[t.type] || (report.untracked[t.type] = { withUnit: 0, withoutUnit: 0 });
  const common = {
    operationId: 'legacy_' + id,
    domain: 'raw',
    type: t.type,
    itemId: ids.deterministicId('item', ['legacy', t.itemId || 'unknown']),
    storeId: STORE,
    businessDate: t.businessDate || null,
    /* 89.7% bút toán kho legacy KHÔNG có actor nào — không id, không cả tên.
       Hệ mới bắt buộc actorId, nên migrate nguyên trạng là bất khả. Dùng một
       actor GIẢ ĐỊNH có tên tự tố cáo để phép dựng lại vẫn phủ hết sổ, và đếm
       riêng ra ở phần kết quả. Đây là dấu hiệu cần quyết định migration, KHÔNG
       phải thứ được lặng lẽ điền vào lúc chuyển thật. */
    actorId: t.staffEmployeeId
      ? ids.deterministicId('actor', ['legacy', t.staffEmployeeId])
      : UNKNOWN_ACTOR,
    occurredAt: Date.parse(t.createdAt) || null,
    referenceId: t.referenceId || null
  };

  if (!t.staffEmployeeId) report.noActor[t.type] = (report.noActor[t.type] || 0) + 1;

  if (!allocs.length) {
    bucket.withoutUnit += 1;
    addEntry(Object.assign({}, common, { unitId: null, qtyDelta: t.qty }));
    return;
  }
  bucket.withUnit += 1;
  allocs.forEach((a, i) => {
    addEntry(Object.assign({}, common, {
      entryId: 'ledger_legacy.' + id + '.' + i,
      unitId: ids.deterministicId('unit', ['legacy', a.code]),
      /* Allocation legacy ghi qty DƯƠNG cho phần bị trừ — đổi dấu để cùng quy
         ước với ledger mới (âm = ra kho). */
      qtyDelta: -Math.abs(a.qty)
    }));
  });
});

/* ---------- 3. So sánh: dựng lại từ sổ vs số legacy đang lưu ---------- */
const FIELDS = [{ name: 'remainingQty', material: true }];
let compared = 0, mismatch = 0, noLedger = 0;

units.forEach((u) => {
  const mine = entries.filter((e) => e.unitId === u.unitId);
  if (!mine.length) { noLedger += 1; return; }
  const rebuilt = recon.rebuildUnitState(u, mine);
  if (R.isErr(rebuilt)) return;
  compared += 1;
  const res = run.record({
    domain: 'FIFO', scenario: 'normal', fields: FIELDS,
    oldResult: { remainingQty: rebuilt.value.storedRemainingQty },
    newResult: { remainingQty: rebuilt.value.rebuiltRemainingQty },
    at: Date.now()
  });
  if (R.isOk(res) && res.value.status !== 'MATCH') mismatch += 1;
});

/* ---------- 4. Tồn kho tổng: projection vs resultingStock cuối của legacy ---------- */
const stockOut = projection.computeCurrentStock({ units: units, ledgerEntries: entries, untrackedBase: 0 });
const pendingUntracked = ledgerLib.sumUntrackedPendingDelta(entries);

/* ---------- In kết quả ---------- */
function pct(a, b) { return b === 0 ? '0.0' : ((a / b) * 100).toFixed(1); }

console.log('\n=== P12 SHADOW — dữ liệu production đã export (CHỈ ĐỌC) ===\n');
console.log('Unit legacy đọc được :', report.mapped, '/', Object.keys(containers).length);
if (report.refused.length) {
  console.log('Unit BỊ TỪ CHỐI      :', report.refused.length, '(không đoán, cần rà tay)');
  report.refused.slice(0, 5).forEach((r) => console.log('   -', r.code, r.kind, r.message.slice(0, 80)));
}
console.log('\nLegacy KHÔNG trả lời được (đếm theo Unit):');
Object.keys(report.ambiguous).sort().forEach((k) => {
  console.log('  ', String(report.ambiguous[k]).padStart(4), k);
});

console.log('\nLệch Firestore vs RTDB:', report.drift.length, 'unit');
report.drift.slice(0, 5).forEach((d) => {
  console.log('   -', d.code, 'firestore=' + d.firestore, 'rtdb=' + d.rtdb, 'lệch=' + d.difference);
});

const noActorTotal = Object.keys(report.noActor).reduce((a, k) => a + report.noActor[k], 0);
if (noActorTotal) {
  console.log('\nBút toán kho KHÔNG có người thực hiện:', noActorTotal, '/', Object.keys(txs).length,
    '(' + pct(noActorTotal, Object.keys(txs).length) + '%)');
  Object.keys(report.noActor).sort().forEach((t) => {
    console.log('   ', String(report.noActor[t]).padStart(4), t);
  });
  console.log('    -> hệ mới bắt buộc actorId; migrate nguyên trạng là bất khả, cần quyết định.');
}

if (entryRefused.length) {
  console.log('\nBút toán legacy bị hệ mới TỪ CHỐI:', entryRefused.length);
  const byMsg = {};
  entryRefused.forEach((r) => { byMsg[r.message.slice(0, 70)] = (byMsg[r.message.slice(0, 70)] || 0) + 1; });
  Object.keys(byMsg).forEach((m) => console.log('   ', String(byMsg[m]).padStart(4), m));
}

console.log('\nTiêu thụ gắn được vào lô nào:');
Object.keys(report.untracked).sort().forEach((t) => {
  const b = report.untracked[t];
  const total = b.withUnit + b.withoutUnit;
  console.log('  ', t.padEnd(12), 'có lô', String(b.withUnit).padStart(5),
    '| KHÔNG có lô', String(b.withoutUnit).padStart(5), '(' + pct(b.withoutUnit, total) + '%)');
});

console.log('\nDựng lại tồn từ sổ:');
console.log('   Unit đối chiếu được :', compared);
console.log('   Unit không có bút toán gắn lô nào:', noLedger);
console.log('   Lệch so với số đang lưu:', mismatch);

if (R.isOk(stockOut)) {
  console.log('\nProjection tồn kho (công thức §3.10):');
  console.log('  ', JSON.stringify(stockOut.value.breakdown));
  console.log('   untrackedPendingDelta =', pendingUntracked,
    '(phần tiêu thụ không quy được về lô nào)');
}

const gate = run.gate();
console.log('\n--- CỔNG P12 ---');
if (R.isErr(gate)) {
  console.log('CHƯA ĐẠT —', gate.error.message);
  (gate.error.detail.blockers || []).forEach((b) => console.log('  *', b.code + ':', b.detail));
} else {
  console.log('ĐẠT:', JSON.stringify(gate.value));
}
console.log('\nĐộ phủ ma trận:', JSON.stringify(run.coverage().run) + '/' + run.coverage().total, 'ô\n');
