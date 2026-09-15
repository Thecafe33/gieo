#!/usr/bin/env node
/**
 * Test runner tối thiểu — thay Vitest cho stack HTML thuần (không cài gì).
 *
 * Nạp registry + toàn bộ layer y như trình duyệt làm, rồi chạy các file
 * tests/**\/*.test.js. Cùng 1 đường nạp với build, nên test chạy đúng thứ code
 * sẽ chạy thật, không phải một bản dựng riêng cho test.
 *
 * Chạy:  node tools/run-tests.js [lọc-theo-tên]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const filter = process.argv[2] || '';

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

/* Nạp registry và bơm bộ luật — giống hệt những gì build-html.js chèn vào HTML. */
const GIEO = require(path.join(ROOT, 'src/runtime/registry.js'));
GIEO._setRules(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/layer-rules.json'), 'utf8')));

for (const f of [...walk(path.join(ROOT, 'src/layers'), '.js'), ...walk(path.join(ROOT, 'src/apps'), '.js')]) {
  try {
    vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
  } catch (e) {
    console.error(`Lỗi nạp ${path.relative(ROOT, f)}: ${e.message}`);
    process.exit(1);
  }
}

const results = [];
let current = null;

globalThis.describe = function (name, fn) {
  const prev = current;
  current = prev ? prev + ' › ' + name : name;
  fn();
  current = prev;
};

globalThis.test = function (name, fn) {
  const full = current ? current + ' › ' + name : name;
  if (filter && !full.toLowerCase().includes(filter.toLowerCase())) return;
  try {
    fn();
    results.push({ full, ok: true });
  } catch (e) {
    results.push({ full, ok: false, err: e });
  }
};

globalThis.assert = assert;
globalThis.GIEO = GIEO;

/** Khẳng định 1 Result là lỗi đúng loại — dùng rất nhiều nên gom lại. */
globalThis.assertErr = function (r, kind, msg) {
  assert.strictEqual(r.ok, false, msg || 'mong đợi lỗi, nhận được ok');
  if (kind) assert.strictEqual(r.error.kind, kind, `${msg || ''} mong đợi ${kind}, nhận ${r.error.kind}`);
};
globalThis.assertOk = function (r, msg) {
  if (r.ok !== true) throw new Error(`${msg || 'mong đợi ok'} — nhận lỗi: ${r.error && r.error.kind}: ${r.error && r.error.message}`);
  return r.value;
};

const testFiles = walk(path.join(ROOT, 'tests'), '.test.js');
for (const f of testFiles) {
  try {
    vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
  } catch (e) {
    results.push({ full: path.relative(ROOT, f) + ' (nạp file)', ok: false, err: e });
  }
}

const failed = results.filter((r) => !r.ok);
for (const r of failed) {
  console.error(`\n  ✗ ${r.full}\n    ${r.err.message.split('\n')[0]}`);
  if (r.err.stack) {
    const at = r.err.stack.split('\n').find((l) => l.includes('/tests/'));
    if (at) console.error(`    ${at.trim()}`);
  }
}

console.log(
  `\n${results.length - failed.length}/${results.length} test pass` +
  ` (${testFiles.length} file, ${GIEO.inventory().length} module)`
);
process.exit(failed.length ? 1 : 0);
