// data_access.v8 (16/10) — DẤU "NGÀY LÃI/LỖ BỊ ĐỔI" + quy tắc chọn ngày tính lại (quanlygieo + manage dùng chung).
//   · Ghi vào ngày ĐÃ QUA (chi phí, tài sản, ca, hao hụt, giá, cấu hình, lương, sửa / xoá bill cũ) → dấu ở pl_dirty_gieogieo/{quán | _all}.
//   · Ghi của HÔM NAY không có dấu (POS bán hàng không ghi thêm).
//   · Quản lý (plDirtyLookup) sửa / xoá bản ghi không kèm ngày → đọc trước để biết ngày; POS thì không đọc thêm.
//   · plNgayCanTinh: thiếu / ghi lúc ngày chưa hết / có dấu sau lúc ghi / hôm nay quá 10 phút.
'use strict';
const fs = require('fs'), path = require('path');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const ROOT = path.join(__dirname, '..');
const BAN = fs.readdirSync(ROOT).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();
const nap = () => { const m = { exports: {} }; new Function('window', 'module', fs.readFileSync(path.join(ROOT, BAN), 'utf8'))({}, m); return m.exports.GieoData; };

function fake() {
  const FS = {}, RT = {}, reads = { n: 0 };
  const docRef = (c, id) => ({ id,
    get: async () => { reads.n++; const d = (FS[c] || {})[id]; return { exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)) }; },
    set: async (d, o) => { const cur = (FS[c] || {})[id]; (FS[c] = FS[c] || {})[id] = o && o.merge && cur ? deep(cur, d) : JSON.parse(JSON.stringify(d)); },
    update: async (d) => { if (!(FS[c] || {})[id]) throw new Error('No document to update'); Object.assign(FS[c][id], d); },
    delete: async () => { delete (FS[c] || {})[id]; } });
  const deep = (a, b) => { Object.keys(b).forEach(k => { a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? deep(a[k], b[k]) : b[k]; }); return a; };
  let n = 0;
  const coll = c => ({ doc: id => docRef(c, id || 'auto' + (++n)), add: async d => { const id = 'auto' + (++n); (FS[c] = FS[c] || {})[id] = d; return { id }; }, where() { return this; }, get: async () => ({ docs: [] }) });
  const fstore = { collection: c => coll(c), doc: p => { const [c, id] = p.split('/'); return docRef(c, id); },
    batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, d) => ops.push(() => r.update(d)), delete: r => ops.push(() => r.delete()), commit: async () => { for (const f of ops) await f(); } }; } };
  const db = { ref: p => ({ path: p, set: async v => { RT[p] = v; }, update: async v => { RT[p] = Object.assign(RT[p] || {}, v); }, remove: async () => { delete RT[p]; }, transaction: async f => { RT[p] = f(RT[p]); return { committed: true }; } }) };
  return { FS, RT, reads, fstore, db };
}
const NOW = Date.parse('2026-10-16T05:00:00Z');   // 12h trưa 16/10 giờ VN
const tick = () => new Promise(r => setTimeout(r, 5));
const dau = F => Object.assign({}, ((F.FS.pl_dirty_gieogieo || {}).gg02 || {}).m || {});
const dauChung = F => Object.assign({}, ((F.FS.pl_dirty_gieogieo || {})._all || {}).m || {});

(async () => {
  // ── Quản lý quán gg02 (đọc trước khi sửa) ──
  const F = fake(), G = nap();
  G.install({ fstore: F.fstore, db: F.db, storeId: 'gg02', plDirtyLookup: true, now: () => NOW });
  await F.fstore.collection('expenses_gieogieo').add({ date: '2026-10-10', amount: 50000 }); await tick();
  eq(Object.keys(dau(F)), ['2026-10-10_2026-10-10'], 'Chi phí ngày cũ → dấu ngày 10/10 ở quán gg02 (bảng riêng của quán: expenses_gieogieo__gg02)');
  eq(!!(F.FS['expenses_gieogieo__gg02']), true, 'Lượt ghi vẫn vào đúng bảng của quán');
  await F.fstore.collection('expenses_gieogieo').add({ date: '2026-10-16', amount: 1 }); await tick();
  eq(Object.keys(dau(F)).length, 1, 'Chi phí HÔM NAY → không dấu');
  await F.fstore.collection('expenses_gieogieo').doc('thue').set({ periodType: 'period', startDate: '2026-10-01', endDate: '2026-10-31', amount: 3100000 }); await tick();
  eq(Object.keys(dau(F)).includes('2026-10-01_2026-10-31'), true, 'Chi phí theo kỳ → dấu cả kỳ');
  F.FS['expenses_gieogieo__gg02'].cu = { date: '2026-09-20', amount: 1, status: 'pending_review' };
  const r0 = F.reads.n;
  await F.fstore.collection('expenses_gieogieo').doc('cu').update({ status: 'approved' }); await tick();
  eq([Object.keys(dau(F)).includes('2026-09-20_2026-09-20'), F.reads.n - r0], [true, 1], 'Duyệt chi phí (không kèm ngày) → đọc 1 lần để biết ngày 20/9 → dấu');
  await F.fstore.collection('expenses_gieogieo').doc('cu').delete(); await tick();
  eq(F.FS['expenses_gieogieo__gg02'].cu, undefined, 'Xoá vẫn chạy bình thường');
  await F.fstore.collection('price_history_gieogieo').add({ itemId: 'sua', effectiveFrom: '2026-10-05', price: 1 }); await tick();
  eq(Object.keys(dauChung(F)), ['2026-10-05_'], 'Mốc giá áp từ ngày cũ → dấu CHUNG mọi quán, từ 5/10 tới nay');
  await F.fstore.collection('employees_gieogieo').doc('e1').set({ fullName: 'A', payHistory: [{ effectiveFrom: '2025-01-01' }, { effectiveFrom: '2026-10-12' }] }); await tick();
  eq(Object.keys(dauChung(F)).includes('2026-10-12_'), true, 'Lịch sử lương: dấu từ mốc MỚI NHẤT (12/10), không từ ngày vào làm');
  const b = F.fstore.batch(); b.set(F.fstore.collection('stock_transactions_gieogieo').doc('w1'), { type: 'WASTE', businessDate: '2026-10-14' }); await b.commit(); await tick();
  eq(Object.keys(dau(F)).includes('2026-10-14_2026-10-14'), true, 'Ghi gộp (batch) hao hụt ngày cũ → dấu');
  await F.db.ref('orders_gieogieo/oct/15/abc').remove(); await tick();
  eq(Object.keys(dau(F)).includes('2026-10-15_2026-10-15'), true, 'Xoá bill ngày 15/10 (Realtime DB) → dấu');
  const truoc = JSON.stringify(dau(F));
  await F.db.ref('orders_gieogieo/oct/16/x').set({ total: 1 }); await F.fstore.collection('inventory_items_gieogieo').doc('i').set({ currentStock: 1 }); await tick();
  eq(JSON.stringify(dau(F)), truoc, 'Bán hàng hôm nay / ghi kho → không dấu');
  const x = F.FS.pl_dirty_gieogieo.gg02; eq(typeof x.at === 'string' && Object.values(x.m).every(v => typeof v === 'string'), true, 'Dấu = { từ_đến: lúc } + at');

  // ── POS (không đọc thêm) ──
  const P = fake(), H = nap();
  H.install({ fstore: P.fstore, db: P.db, storeId: 'gg01', now: () => NOW });
  P.FS.employee_shifts_gieogieo = { s1: { businessDate: '2026-10-16', checkedInAt: 'x' } };
  const p0 = P.reads.n;
  await P.fstore.collection('employee_shifts_gieogieo').doc('s1').update({ checkedOutAt: 'y' }); await tick();
  eq([P.reads.n - p0, P.FS.pl_dirty_gieogieo], [0, undefined], 'POS chấm công ra: không đọc thêm, không dấu');

  // ── Quy tắc chọn ngày tính lại ──
  const by = {
    '2026-10-12': { updatedAt: '2026-10-13T02:00:00Z' },      // ghi sau khi ngày 12 hết, không dấu → đủ
    '2026-10-13': { updatedAt: '2026-10-14T02:00:00Z' },      // ghi sau ngày 13 nhưng có dấu 13/10 lúc 15/10 → tính lại
    '2026-10-14': { updatedAt: '2026-10-14T09:00:00Z' },      // ghi lúc ngày 14 chưa hết → tính lại
    '2026-10-16': { updatedAt: '2026-10-16T04:55:00Z' }       // hôm nay, 5 phút trước → còn mới
  };
  const marks = { '2026-10-13_2026-10-13': '2026-10-15T01:00:00Z', '2026-10-01_': '2026-10-01T00:00:00Z' };
  eq(G.plNgayCanTinh(by, '2026-10-12', '2026-10-16', { marks, now: NOW }), ['2026-10-13', '2026-10-14', '2026-10-15'], 'Tính lại: ngày có dấu mới (13), ghi giữa chừng (14), thiếu (15); dấu cũ hơn bản ghi (1/10→) không tính');
  eq(G.plNgayCanTinh(by, '2026-10-16', '2026-10-16', { now: NOW + 6 * 60000 }), ['2026-10-16'], 'Hôm nay quá 10 phút → tính lại');
  eq(G.plNgayCanTinh({}, '2026-01-01', '2026-10-16', { now: NOW, back: 62 }).length, 63, 'back: chỉ 62 ngày gần nhất + hôm nay');
  eq(G.plNgayCanTinh({}, '2026-10-16', '2026-10-31', { now: NOW }), ['2026-10-16'], 'Không tính ngày tương lai');
  eq([G.plCoDau({ '2026-10-05_': '2026-10-16T00:00:00Z' }, '2026-10-20', '2026-10-15T00:00:00Z'), G.plCoDau({ '2026-10-05_2026-10-06': '2026-10-16T00:00:00Z' }, '2026-10-20', '2026-10-15T00:00:00Z')],
    [true, false], 'Dấu mở (tới nay) phủ mọi ngày sau; dấu có hạn chỉ phủ trong khoảng');
  const md = await G.plDocDau(F.fstore, 'gg02');
  eq(Object.keys(md).includes('2026-10-05_') && Object.keys(md).includes('2026-10-10_2026-10-10'), true, 'plDocDau gộp dấu riêng của quán + dấu chung');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL lỗi chạy', e && e.stack); process.exit(1); });
