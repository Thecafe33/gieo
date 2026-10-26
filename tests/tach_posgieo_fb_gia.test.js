// Firebase giả của các bài so sánh tách posgieo (tools/tach_posgieo/fb_gia.js) — các khả năng mà e2e_kho / e2e_ban dựa vào.
'use strict';
const vm = require('vm');
const { FB_STUB } = require('../tools/tach_posgieo/fb_gia');
let ok = true; const eq = (a, b, m) => { const s = JSON.stringify(a) === JSON.stringify(b); console.log((s ? 'ok ' : 'FAIL ') + m + (s ? '' : ' ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); if (!s) ok = false; };
(async () => {
  const w = {}; w.window = w; vm.createContext(w); vm.runInContext(FB_STUB, w);
  const fs = w.firebase.firestore(), db = w.firebase.database();
  w.__SEED = { 'c/a': { s: 'open', n: 1, t: ['x'] }, 'c/b': { s: 'sealed', n: 5 }, 'c/c': { s: 'open', n: 9 }, 'r/k/u1': { st: 'x' }, 'r/k/u2': { st: 'y' } };
  const ids = q => q.get().then(s => s.docs.map(d => d.id));
  eq(await ids(fs.collection('c')), ['a', 'b', 'c'], 'collection: mọi doc con');
  eq(await ids(fs.collection('c').where('s', '==', 'open')), ['a', 'c'], "where == (lỗi cũ: bỏ qua bộ lọc → trả cả mã sealed)");
  eq(await ids(fs.collection('c').where('s', '==', 'open').where('n', '>', 3)), ['c'], 'nhiều where + >');
  eq(await ids(fs.collection('c').where('s', 'in', ['sealed'])), ['b'], 'in');
  eq(await ids(fs.collection('c').where('t', 'array-contains', 'x')), ['a'], 'array-contains');
  eq(await ids(fs.collection('c').where(w.firebase.firestore.FieldPath.documentId(), '>=', 'b')), ['b', 'c'], 'FieldPath.documentId()');
  eq(Object.keys((await db.ref('r/k').orderByChild('st').equalTo('y').get()).val()), ['u2'], 'RT orderByChild + equalTo');
  const a1 = fs.collection('c').doc().path, a2 = fs.collection('c').doc().path;
  eq(a1 !== a2, true, 'doc() không mã → mã riêng mỗi lần (lỗi cũ: luôn "auto")');
  w.__SEED_GHI = true; w.__ghi = [];
  await fs.collection('c').doc('a').update({ n: 2, 'm.k': 1 });
  eq((await fs.collection('c').doc('a').get()).data(), { s: 'open', n: 2, t: ['x'], m: { k: 1 } }, 'ghi cập nhật mồi (update gộp, khoá lồng)');
  w.__HONG = [{ op: 'tx.set', re: '^c/z$' }];
  let loi = null;
  try { await fs.runTransaction(async tx => { tx.update(fs.collection('c').doc('b'), { n: 7 }); tx.set(fs.collection('c').doc('z'), { v: 1 }); }); } catch (e) { loi = e.message; }
  eq([!!loi, w.__SEED['c/b'].n, 'c/z' in w.__SEED], [true, 5, false], 'giao dịch lỗi một lượt → KHÔNG ghi gì (cả lượt hợp lệ trong cùng giao dịch)');
  await fs.runTransaction(async tx => { tx.set(fs.collection('c').doc('z'), { v: 1 }); });
  eq(w.__SEED['c/z'], { v: 1 }, 'lỗi chỉ một lần → thử lại ghi được');
  const put = await w.firebase.storage().ref('p/x.jpg').put({ name: 'x.jpg', size: 3 });
  eq([await put.ref.getDownloadURL(), w.__ghi.some(g => g.op === 'storage.put' && g.p === 'p/x.jpg')], ['https://gia.storage/p/x.jpg', true], 'storage.put ghi nhận + URL');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
