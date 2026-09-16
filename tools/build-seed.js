#!/usr/bin/env node
/**
 * TIẾP NHẬN DỮ LIỆU CŨ — dựng seed canonical cho hệ mới.
 *
 *   node tools/build-seed.js <thư-mục-export> <ngày-cutover> [thư-mục-ra]
 *   vd: node tools/build-seed.js ../export 2026-09-20
 *
 * Quyết định đã chốt của chủ quán, và cả file này chỉ để thi hành đúng nó:
 *
 *   Lấy `unitBase` hiện tại làm tồn đầu. `costBasis` để TRỐNG. FIFO chạy đúng
 *   về LƯỢNG ngay từ ngày đầu; COGS thực tế có dần khi nhập lô mới.
 *
 *   Dữ liệu cũ được ĐÁNH DẤU. Từ mốc tiếp nhận trở đi hệ mới truy được mọi thứ
 *   nó đã nhận đi về đâu. Tuyệt đối KHÔNG truy ngược vào hệ cũ — đây là phần
 *   chấp nhận đánh mất, không phải lỗi cần vá.
 *
 * Vì vậy script này KHÔNG mang sang: bút toán kho cũ, allocation cũ, lịch sử
 * tiêu thụ cũ. Mang sang chúng chỉ tạo ra một nửa sự thật trông như sự thật.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const [dataDir, cutoverDate, outDirArg] = process.argv.slice(2);
if (!dataDir || !cutoverDate) {
  console.error('Dùng: node tools/build-seed.js <thư-mục-export> <ngày-cutover YYYY-MM-DD> [thư-mục-ra]');
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) {
  console.error('Ngày cutover phải dạng YYYY-MM-DD — đây là ranh giới truy vết, không đoán được.');
  process.exit(2);
}
const outDir = outDirArg || dataDir;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const GIEO = require(path.join(ROOT, 'src/runtime/registry.js'));
GIEO._setRules(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/layer-rules.json'), 'utf8')));
for (const f of walk(path.join(ROOT, 'src/layers'))) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });

const R = GIEO.require('shared-kernel/result');
const ids = GIEO.require('shared-kernel/ids');
const unitLib = GIEO.require('fifo-core/unit');

const STORE = ids.deterministicId('store', ['main']);
const ORG = ids.deterministicId('org', ['gieo']);
const fsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'fs-subset.json'), 'utf8'));
const rtData = JSON.parse(fs.readFileSync(path.join(dataDir, 'rtdb-subset.json'), 'utf8'));

const seed = {
  meta: {
    cutoverDate: cutoverDate,
    organizationId: ORG,
    storeId: STORE,
    builtAt: new Date().toISOString(),
    /* Dán ngay trên dữ liệu, không để ở tài liệu rời: ai mở file này ra cũng
       thấy ranh giới trước khi thấy số. */
    boundary: 'Mọi bản ghi trong file này được TIẾP NHẬN từ hệ cũ tại ' + cutoverDate +
      '. Hệ mới truy vết từ mốc này trở đi. Lịch sử trước đó thuộc hệ cũ và không truy xuất.'
  },
  items: [], units: [], recipes: [], employees: [], revenue: []
};
const skipped = { units: [], items: [], recipes: [], employees: [] };

/* ---------- 1. Mặt hàng ---------- */
const legacyItems = fsData.inventory_items_gieogieo || {};
Object.keys(legacyItems).forEach((id) => {
  const it = legacyItems[id];
  if (!it.name) { skipped.items.push({ id, why: 'không có tên' }); return; }
  seed.items.push({
    itemId: ids.deterministicId('item', ['legacy', id]),
    name: it.name,
    unit: it.unit || null,
    countUnitName: it.countUnitName || null,
    baseQtyPerCountUnit: it.packagingUnits ? it.packagingUnits.baseQty : null,
    minStock: typeof it.minStock === 'number' ? it.minStock : 0,
    trackingMode: it.trackingMode || null,
    stockManaged: it.stockManaged !== false,
    /* `costPerUnit` của hệ cũ KHÔNG được dùng làm giá vốn lô — dùng nó đúng là
       lỗi "quy hết về giá scalar gần nhất" mà audit đã chỉ ra. Giữ lại như GỢI Ý
       cho lần nhập hàng tới, và gọi đúng tên của nó. */
    suggestedCostPerUnit: typeof it.costPerUnit === 'number' ? it.costPerUnit : null,
    origin: 'LEGACY_SEED', legacyRef: id
  });
});

/* ---------- 2. Tồn đầu: mỗi lô còn hàng thành 1 Unit seed ---------- */
const containers = fsData.stock_containers_gieogieo || {};
const activeUnits = rtData.active_units_gieogieo || {};
const rtByCode = Object.create(null);
Object.keys(activeUnits).forEach((itemId) => {
  const byContainer = activeUnits[itemId] || {};
  Object.keys(byContainer).forEach((cid) => {
    const u = byContainer[cid];
    if (u && u.code) rtByCode[u.code] = u;
  });
});

let seededQty = 0;
Object.keys(containers).forEach((id) => {
  const c = containers[id];
  if (c.status === 'finished') { skipped.units.push({ code: c.code, why: 'đã dùng hết ở hệ cũ' }); return; }

  /* RTDB là tầng nóng và thắng cho lô đang mở — giữ đúng phân tầng của hệ cũ.
     Lô niêm phong chưa mở thì lấy baseQty, vì unitBase chưa có nghĩa. */
  const rt = rtByCode[c.code];
  const qty = c.status === 'sealed'
    ? c.baseQty
    : (rt && typeof rt.unitBase === 'number' ? rt.unitBase : c.unitBase);

  const out = unitLib.seedUnitFromLegacy({
    unitId: ids.deterministicId('unit', ['seed', c.code]),
    itemId: ids.deterministicId('item', ['legacy', c.itemId || 'unknown']),
    storeId: STORE,
    itemKind: 'raw',
    initialQty: qty,
    status: 'SEALED',
    operationId: ids.deterministicId('operation', ['seed', cutoverDate, c.code]),
    seededAt: cutoverDate,
    legacyRef: c.code
  });
  if (R.isErr(out)) {
    skipped.units.push({ code: c.code, qty: qty, why: out.error.message.split(' — ')[0] });
    return;
  }
  seededQty += qty;
  seed.units.push(out.value);
});

/* ---------- 3. Công thức / định lượng ---------- */
const recipes = fsData.recipes_gieogieo || {};
Object.keys(recipes).forEach((id) => {
  const r = recipes[id];
  if (!r.sizes) { skipped.recipes.push({ id, why: 'không có định lượng theo size' }); return; }
  seed.recipes.push({
    recipeId: ids.deterministicId('recipe', ['legacy', id]),
    /* Version đầu tiên có hiệu lực TỪ mốc cutover. Không giả vờ công thức này
       đã có hiệu lực từ quá khứ — COGS lịch sử của hệ cũ không thuộc về hệ mới. */
    effectiveFrom: cutoverDate,
    versionSource: 'LEGACY_SEED',
    sizes: r.sizes,
    origin: 'LEGACY_SEED', legacyRef: id
  });
});

/* ---------- 4. Nhân viên ---------- */
const employees = fsData.employees_gieogieo || {};
Object.keys(employees).forEach((id) => {
  const e = employees[id];
  if (!e.fullName) { skipped.employees.push({ id, why: 'không có tên' }); return; }
  seed.employees.push({
    employeeId: ids.deterministicId('employee', ['legacy', id]),
    fullName: e.fullName,
    active: e.active !== false,
    /* Điều khoản lương vào VersionedInput, hiệu lực từ mốc cutover — sửa lương
       về sau KHÔNG được làm trôi lương các ca đã chấm (gap payTerms write chết). */
    payTerms: {
      effectiveFrom: cutoverDate,
      payType: e.payType || null,
      hourlyRate: typeof e.hourlyRate === 'number' ? e.hourlyRate : null,
      fixedMonthlySalary: typeof e.fixedMonthlySalary === 'number' ? e.fixedMonthlySalary : null,
      otEnabled: !!e.otEnabled,
      otRate: typeof e.otRate === 'number' ? e.otRate : null,
      otThresholdHours: typeof e.otThresholdHours === 'number' ? e.otThresholdHours : null
    },
    /* PIN KHÔNG mang sang — hệ mới tự cấp, không kế thừa mã đăng nhập cũ. */
    origin: 'LEGACY_SEED', legacyRef: id
  });
});

/* ---------- 5. Doanh thu đã chốt ---------- */
const closings = fsData.book_closings_gieogieo || {};
Object.keys(closings).forEach((period) => {
  const b = closings[period];
  seed.revenue.push({
    period: period,
    /* Số ĐÃ CHỐT của hệ cũ, đóng băng nguyên trạng. Hệ mới KHÔNG tính lại —
       tính lại một kỳ đã chốt là đổi con số chủ quán đã dùng để ra quyết định. */
    frozen: true,
    revenue: b.doanhThu ?? null,
    cogs: b.giaVon ?? null,
    expenses: b.tongChiPhi ?? null,
    payroll: b.luong ?? null,
    profit: b.lai ?? null,
    closedBy: b.closedBy || null,
    closedAt: b.closedAt || null,
    origin: 'LEGACY_SEED', legacyRef: period
  });
});

/* ---------- Ghi ra + báo cáo ---------- */
const outFile = path.join(outDir, 'seed-' + cutoverDate + '.json');
fs.writeFileSync(outFile, JSON.stringify(seed, null, 1));

console.log('\n=== TIẾP NHẬN DỮ LIỆU CŨ — mốc ' + cutoverDate + ' ===\n');
console.log('Mặt hàng   :', seed.items.length);
console.log('Lô tồn đầu :', seed.units.length, '— tổng lượng', seededQty.toLocaleString('vi-VN'));
console.log('Công thức  :', seed.recipes.length);
console.log('Nhân viên  :', seed.employees.length);
console.log('Kỳ doanh thu đã chốt:', seed.revenue.length);

console.log('\nKHÔNG tiếp nhận:');
Object.keys(skipped).forEach((k) => {
  if (!skipped[k].length) return;
  const byWhy = {};
  skipped[k].forEach((x) => { byWhy[x.why] = (byWhy[x.why] || 0) + 1; });
  Object.keys(byWhy).forEach((w) => console.log('  ', String(byWhy[w]).padStart(4), k, '—', w));
});

console.log('\nRanh giới đã dán vào dữ liệu:');
console.log('   Mọi Unit mang origin=LEGACY_SEED, costBasis=null, needsReview=SEEDED_WITHOUT_COST.');
console.log('   FIFO đúng về LƯỢNG ngay. COGS thực tế có dần khi nhập lô mới.');
console.log('   Bút toán/allocation/lịch sử tiêu thụ cũ KHÔNG mang sang.');
console.log('\nĐã ghi:', outFile, '\n');
