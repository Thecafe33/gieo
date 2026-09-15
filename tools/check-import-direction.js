#!/usr/bin/env node
/**
 * Thay thế `dependency-cruiser` cho stack HTML thuần (không build step).
 *
 * Blueprint §2 quy tắc 5: vi phạm import-direction = FAIL, không phải "review sau".
 * Chạy: node tools/check-import-direction.js   → exit 1 nếu có vi phạm.
 *
 * Dùng CHUNG src/layer-rules.json với runtime registry — CI và trình duyệt
 * không bao giờ được hiểu luật khác nhau.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/layer-rules.json'), 'utf8'));
const GIEO = require(path.join(ROOT, 'src/runtime/registry.js'));
GIEO._setRules(RULES);

/** Thư mục src/apps/<x> ánh xạ sang tên layer app-<x>. */
function layerOfFile(file) {
  const rel = path.relative(ROOT, file).split(path.sep);
  if (rel[0] === 'src' && rel[1] === 'layers') return rel[2];
  if (rel[0] === 'src' && rel[1] === 'apps') return 'app-' + rel[2];
  return null;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Trích mọi lời gọi GIEO.define('id', [deps]) trong 1 file.
 * Cố ý dùng regex thay vì parser: nguồn là code mình viết theo đúng 1 khuôn,
 * không phải input tuỳ ý — đổi lại không kéo thêm dependency nào vào repo.
 */
function extractDefines(src) {
  const out = [];
  const re = /GIEO\.define\(\s*(['"])([^'"]+)\1\s*,\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const deps = m[3].match(/(['"])([^'"]+)\1/g) || [];
    out.push({ id: m[2], deps: deps.map((d) => d.slice(1, -1)) });
  }
  return out;
}

const files = [...walk(path.join(ROOT, 'src/layers')), ...walk(path.join(ROOT, 'src/apps'))];
const violations = [];
const seen = new Map();
let moduleCount = 0;

for (const file of files) {
  const fileLayer = layerOfFile(file);
  if (!fileLayer) continue;
  const rel = path.relative(ROOT, file);
  for (const def of extractDefines(fs.readFileSync(file, 'utf8'))) {
    moduleCount++;
    if (seen.has(def.id)) {
      violations.push(`${rel}: module trùng id "${def.id}" (đã khai ở ${seen.get(def.id)})`);
      continue;
    }
    seen.set(def.id, rel);

    let idLayer;
    try {
      idLayer = GIEO.layerOf(def.id);
    } catch (e) {
      violations.push(`${rel}: ${e.message}`);
      continue;
    }
    if (idLayer !== fileLayer) {
      violations.push(
        `${rel}: file nằm ở layer "${fileLayer}" nhưng khai báo module "${def.id}" thuộc layer "${idLayer}"`
      );
      continue;
    }
    for (const dep of def.deps) {
      let err;
      try {
        err = GIEO.checkEdge(def.id, dep);
      } catch (e) {
        err = e.message;
      }
      if (err) violations.push(`${rel}: ${err}`);
    }
  }
}

/* Dep trỏ tới module không tồn tại cũng là lỗi cấu trúc, bắt luôn ở đây
   thay vì để trang trắng lúc chạy. */
for (const [id, rel] of seen) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const def of extractDefines(src)) {
    if (def.id !== id) continue;
    for (const dep of def.deps) {
      if (!seen.has(dep)) violations.push(`${rel}: "${id}" phụ thuộc module không tồn tại "${dep}"`);
    }
  }
}

if (violations.length) {
  console.error('\nFAIL — vi phạm import-direction:\n');
  for (const v of violations) console.error('  ✗ ' + v);
  console.error(`\n${violations.length} vi phạm. Xem GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md §2.\n`);
  process.exit(1);
}

console.log(`OK — ${moduleCount} module, ${files.length} file, 0 vi phạm import-direction.`);
