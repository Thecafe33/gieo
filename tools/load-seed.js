#!/usr/bin/env node
/**
 * NẠP SEED VÀO HỆ MỚI — bước ghi duy nhất của quá trình tiếp nhận.
 *
 *   node tools/load-seed.js <file-seed.json>              # chạy khô (mặc định)
 *   node tools/load-seed.js <file-seed.json> --commit     # ghi thật
 *
 * MẶC ĐỊNH LÀ CHẠY KHÔ. Phải gõ `--commit` mới ghi. Một script migration mà
 * mặc định ghi là một script chỉ cần gõ nhầm một lần.
 *
 * Kể cả khi ghi thật, nó vẫn KHÔNG chạm hệ cũ: mọi path đều là canonical mới
 * (`orgs/{org}/stores/{store}/...`). Hệ cũ chỉ được đọc, và ở bước này thậm chí
 * không đọc — nó đã được đọc xong lúc dựng seed.
 *
 * Toàn bộ seed đi trong MỘT MutationPlan, nên nó vào trọn hoặc không vào gì.
 * Nạp nửa chừng là thứ tệ nhất có thể xảy ra ở đây: tồn đầu có mà công thức
 * chưa có thì FIFO sẽ trừ sai ngay ca đầu tiên.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const seedFile = process.argv[2];
const doCommit = process.argv.includes('--commit');
if (!seedFile) {
  console.error('Dùng: node tools/load-seed.js <file-seed.json> [--commit]');
  process.exit(2);
}

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
const clockLib = GIEO.require('shared-kernel/clock');
const commit = GIEO.require('persistence-firebase/atomic-commit');

const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
if (!seed.meta || !seed.meta.cutoverDate) {
  console.error('File seed không có meta.cutoverDate — từ chối nạp dữ liệu không rõ mốc.');
  process.exit(2);
}

const ctx = {
  organizationId: seed.meta.organizationId,
  storeId: seed.meta.storeId,
  businessDate: seed.meta.cutoverDate,
  clock: clockLib.createClock()
};

/* operationId XÁC ĐỊNH theo mốc cutover: chạy lại script cùng file seed sẽ ghi
   vào đúng các path cũ, không nhân bản. Id ngẫu nhiên ở đây nghĩa là chạy hai
   lần thì có hai bộ tồn đầu. */
const operationId = ids.deterministicId('operation', ['seed', seed.meta.cutoverDate]);
const SEED_ACTOR = ids.deterministicId('actor', ['system', 'seed']);

const domainRecords = []
  .concat(seed.items.map((x) => ({ type: 'item', record: x })))
  .concat(seed.recipes.map((x) => ({
    type: 'recipeVersion',
    record: Object.assign({ versionId: ids.deterministicId('version', ['seed', x.recipeId]) }, x)
  })))
  .concat(seed.employees.map((x) => ({ type: 'employee', record: x })))
  .concat(seed.revenue.map((x) => ({
    type: 'monthlySnapshot',
    record: Object.assign({ revisionNo: 1 }, x)
  })));

const plan = {
  operationId: operationId,
  /* Unit seed đi qua ĐÚNG đường unitChanges như mọi Unit khác — không có kho
     riêng cho hàng tiếp nhận. Chúng khác ở `origin`, không khác ở chỗ lưu. */
  unitChanges: seed.units,
  /* KHÔNG có ledgerEntries: tồn đầu không phải một lần nhập hàng. Sinh bút toán
     RECEIVING giả cho nó sẽ làm báo cáo "nhập trong kỳ" của ngày cutover vọt lên
     một con số chưa từng có ai nhập. */
  ledgerEntries: [],
  domainRecords: domainRecords,
  audit: {
    command: 'SeedFromLegacy',
    actorId: SEED_ACTOR,
    at: Date.now(),
    cutoverDate: seed.meta.cutoverDate,
    boundary: seed.meta.boundary,
    counts: {
      units: seed.units.length, items: seed.items.length,
      recipes: seed.recipes.length, employees: seed.employees.length,
      revenuePeriods: seed.revenue.length
    }
  }
};

const planned = commit.planToWrites(plan, ctx);
if (R.isErr(planned)) {
  console.error('\nKHÔNG dịch được seed thành path canonical:');
  (planned.error.detail.errors || [planned.error.message]).forEach((e) => console.error('  -', e));
  process.exit(1);
}
const writes = planned.value;

const byKind = {};
writes.forEach((w) => { byKind[w.kind] = (byKind[w.kind] || 0) + 1; });
const legacyTouch = writes.filter((w) => !/^orgs\//.test(w.path));

console.log('\n=== NẠP SEED — mốc ' + seed.meta.cutoverDate + ' ===\n');
console.log('operationId:', operationId);
console.log('Số thao tác ghi:', writes.length, JSON.stringify(byKind));
console.log('\nMẫu path:');
writes.slice(0, 4).forEach((w) => console.log('  ', w.kind, w.path));
console.log('   … còn', Math.max(0, writes.length - 4), 'path nữa');

if (legacyTouch.length) {
  /* Chặn cứng: seed KHÔNG được chạm bất cứ path nào ngoài namespace mới. */
  console.error('\nDỪNG —', legacyTouch.length, 'path nằm NGOÀI namespace orgs/. Seed không được chạm hệ cũ.');
  legacyTouch.slice(0, 5).forEach((w) => console.error('  ', w.path));
  process.exit(1);
}

if (!doCommit) {
  console.log('\nCHẠY KHÔ — chưa ghi gì. Thêm --commit để ghi thật.\n');
  process.exit(0);
}

const runner = commit.createInMemoryRunner();
const committer = commit.createCommitter({ transactionRunner: runner.runner });
committer.commit(plan, ctx).then((out) => {
  if (R.isErr(out)) {
    console.error('\nGHI THẤT BẠI —', out.error.message, '\n');
    process.exit(1);
  }
  console.log('\nĐã ghi', out.value.writeCount, 'bản ghi trong MỘT transaction.');
  console.log('   Kho đích hiện tại: in-memory runner.');
  console.log('   Chưa nối Firebase handle thật — xem README, cần config từ chủ quán.\n');
});
