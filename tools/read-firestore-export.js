#!/usr/bin/env node
/**
 * Đọc bản export gốc của Firestore (định dạng riêng của Google, KHÔNG phải JSON).
 *
 *   node tools/read-firestore-export.js <thư-mục-all_kinds>
 *   node tools/read-firestore-export.js <thư-mục> <collection> [--json]
 *
 * Vì sao file này tồn tại: bản export của Firestore là EntityProto (Datastore v3)
 * đóng trong khung LevelDB log. Không có công cụ sẵn nào đọc được ngoài chính
 * Firestore import. Khi cần nhìn dữ liệu production để đối chiếu mà không đụng
 * vào hệ đang chạy, đây là đường duy nhất.
 *
 * CHỈ ĐỌC, và chỉ đọc từ file: không kết nối mạng, không biết Firebase là gì.
 *
 * CẢNH BÁO: thứ nó đọc ra là dữ liệu production thật. KHÔNG commit kết quả vào
 * repo — .gitignore đã chặn sẵn *-subset.json và *export*.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- Khung LevelDB log -> protobuf generic ---------- */

/** Gỡ khung LevelDB log: block 32KB, mỗi record có header 7 byte (crc4+len2+type1). */
function readLogRecords(buf) {
  const BLOCK = 32768;
  const out = [];
  let pending = null;
  for (let base = 0; base < buf.length; base += BLOCK) {
    let off = base;
    const end = Math.min(base + BLOCK, buf.length);
    while (off + 7 <= end) {
      const len = buf.readUInt16LE(off + 4);
      const type = buf[off + 6];
      if (type === 0 && len === 0) break; /* padding cuối block */
      const data = buf.subarray(off + 7, off + 7 + len);
      if (off + 7 + len > end) break;
      if (type === 1) out.push(Buffer.from(data));
      else if (type === 2) pending = [Buffer.from(data)];
      else if (type === 3 && pending) pending.push(Buffer.from(data));
      else if (type === 4 && pending) { pending.push(Buffer.from(data)); out.push(Buffer.concat(pending)); pending = null; }
      off += 7 + len;
    }
  }
  return out;
}

function readVarint(buf, i) {
  let result = 0n, shift = 0n;
  while (i < buf.length) {
    const b = buf[i++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
  }
  return [result, i];
}

/** Protobuf generic -> {fieldNumber: [values]} */
function decode(buf) {
  const fields = {};
  let i = 0;
  while (i < buf.length) {
    let key;
    [key, i] = readVarint(buf, i);
    const field = Number(key >> 3n), wire = Number(key & 7n);
    let value;
    if (wire === 0) { [value, i] = readVarint(buf, i); }  /* giữ BigInt: int64 âm cần bù hai */
    else if (wire === 1) { value = buf.readDoubleLE(i); i += 8; }
    else if (wire === 2) {
      let len; [len, i] = readVarint(buf, i);
      value = buf.subarray(i, i + Number(len)); i += Number(len);
    } else if (wire === 5) { value = buf.readFloatLE(i); i += 4; }
    else break;
    (fields[field] = fields[field] || []).push(value);
  }
  return fields;
}


/* ---------- EntityProto -> {collection, docId, data} ---------- */

/* Property.value: đọc theo kiểu, KHÔNG đoán. Kiểu lạ trả về marker để thấy ngay. */
/* int64 trong export là varint BÙ HAI, không phải zigzag: số âm hiện thành
   2^64 - n. Đọc thẳng ra Number sẽ biến -20 thành 1.8e19 — và một cái qty như
   thế đi vào phép dựng lại tồn kho thì kết quả vô nghĩa mà vẫn trông như số. */
function int64(v) {
  const b = typeof v === 'bigint' ? v : BigInt(v);
  const signed = b >= (1n << 63n) ? b - (1n << 64n) : b;
  return Number(signed);
}

function readValue(buf, meaning) {
  const v = decode(buf);
  if (Number(meaning) === 19 && v[3]) return readMap(v[3][0]);          /* map lồng */
  if (v[3] !== undefined) return v[3][0].toString('utf8');       /* string */
  if (v[1] !== undefined) return int64(v[1][0]);                 /* int64 */
  if (v[2] !== undefined) return !!Number(v[2][0]);              /* bool */
  if (v[4] !== undefined) return v[4][0];                        /* double */
  if (Object.keys(v).length === 0) return null;
  return { __unknownValue: Object.keys(v) };
}

/* Map lồng dùng lại đúng khuôn property: repeated #15 {#3 name, #5 value}. */
function readMap(buf) {
  const m = decode(buf);
  const out = {};
  (m[15] || []).forEach(p => {
    const f = decode(p);
    if (!f[3]) return;
    out[f[3][0].toString('utf8')] = f[5] ? readValue(f[5][0], f[1] ? f[1][0] : 0) : null;
  });
  /* Mảng ở export này là repeated #13/#14 — giữ nguyên nếu có, không bịa. */
  if (m[13] || m[14]) {
    const items = [].concat(m[13] || [], m[14] || [])
      .map(b => (b.length ? readMap(b) : null))
      .filter(x => x && Object.keys(x).length);
    if (items.length) out.__items = items;
  }
  return out;
}

/* Path cũ: \v \x12 <len> collection " <len> docId \f */
function parsePath(buf) {
  const s = buf.toString('binary');
  const m = /\x12(.)([\s\S]*?)\x22(.)([\s\S]*)/.exec(s);
  if (!m) return null;
  const clen = m[1].charCodeAt(0), dlen = m[3].charCodeAt(0);
  const collection = Buffer.from(m[2].slice(0, clen), 'binary').toString('utf8');
  const docId = Buffer.from(m[4].slice(0, dlen), 'binary').toString('utf8');
  return { collection, docId };
}

function parseEntity(rec) {
  const e = decode(rec);
  if (!e[13] || !e[15]) return null;
  const key = decode(e[13][0]);
  if (!key[14]) return null;
  const p = parsePath(key[14][0]);
  if (!p) return null;
  /* Tên property lặp lại = mảng. Ghi đè như map sẽ NUỐT MẤT các phần tử —
     và notEmptyChecks[] chính là thứ cần để truy lệch tồn. */
  const data = {};
  const seen = Object.create(null);
  e[15].forEach(b => {
    const f = decode(b);
    if (!f[3]) return;
    const name = f[3][0].toString('utf8');
    const val = f[5] ? readValue(f[5][0], f[1] ? f[1][0] : 0) : null;
    if (seen[name]) {
      if (!Array.isArray(data[name])) data[name] = [data[name]];
      data[name].push(val);
    } else { data[name] = val; seen[name] = true; }
  });
  return { collection: p.collection, docId: p.docId, data };
}

function* allEntities(dir) {
  for (const file of fs.readdirSync(dir).filter(f => /^output-/.test(f)).sort()) {
    for (const rec of readLogRecords(fs.readFileSync(path.join(dir, file)))) {
      try { const e = parseEntity(rec); if (e) yield e; } catch (_) { /* record hỏng: bỏ, đếm ở dưới */ }
    }
  }
}


/* ---------- CLI ---------- */
if (require.main === module) {
  const dir = process.argv[2];
  const want = process.argv[3] && process.argv[3].indexOf('--') !== 0 ? process.argv[3] : null;
  if (!dir) {
    console.error('Dùng: node tools/read-firestore-export.js <thư-mục-all_kinds> [collection] [--json]');
    process.exit(2);
  }
  if (!want) {
    const counts = {};
    let total = 0;
    for (const e of allEntities(dir)) { counts[e.collection] = (counts[e.collection] || 0) + 1; total++; }
    console.log('tổng entity:', total);
    Object.keys(counts).sort().forEach((k) => console.log(String(counts[k]).padStart(7), k));
    process.exit(0);
  }
  const out = {};
  let n = 0;
  for (const e of allEntities(dir)) { if (e.collection === want) { out[e.docId] = e.data; n++; } }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  console.log(want + ':', n, 'document');
  const first = Object.keys(out)[0];
  if (first) console.log('mẫu', first + ':', JSON.stringify(out[first]).slice(0, 400));
}
