// Firebase giả của các bài so sánh tách posgieo (tools/tach_posgieo/fb_gia.js) — các khả năng mà e2e_kho / e2e_ban dựa vào.
'use strict';
const vm = require('vm');
const { FB_STUB } = require('../tools/tach_posgieo/fb_gia');
let ok = true; const eq = (a, b, m) => { const s = JSON.stringify(a) === JSON.stringify(b); console.log((s ? 'ok ' : 'FAIL ') + m + (s ? '' : ' ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); if (!s) ok = false; };
(async () => {
  const w = { setTimeout }; w.window = w; vm.createContext(w); vm.runInContext(FB_STUB, w);
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
  // F10-1 (kiểm lượt 10): bốn sai lệch so với Firebase thật — nay phải đúng
  w.__SEED = Object.assign({}, w.__SEED, { 'f/a': { n: 1, obj: { v: 1, w: [1, 2] } }, 'f/b': { n: 2, obj: { v: 2 } }, 'f/missing': {}, 'f/nul': { n: null }, 'rp/k': { u1: { st: 'x' }, u2: { st: 'y' }, u3: 5 } });
  eq(await ids(fs.collection('f').where('n', '!=', 1)), ['b'], "!= loại doc THIẾU trường (lỗi cũ: trả cả 'missing') và trường null (máy chủ — kiểm lại 10)");
  eq(await ids(fs.collection('f').where('n', 'not-in', [1])), ['b'], 'not-in loại doc thiếu trường và trường null');
  eq(await ids(fs.collection('f').where('n', 'not-in', [1, null])), [], 'not-in có null trong mảng → rỗng (F10-1 kiểm lại; NotInFilter SDK 10.13.2)');
  eq(await ids(fs.collection('f').where('n', '==', null)), ['nul'], '== null khớp trường null, không khớp thiếu trường');
  eq(await ids(fs.collection('f').where('obj', '==', { w: [1, 2], v: 1 })), ['a'], '== so map theo giá trị, không theo thứ tự khoá (lỗi cũ: rỗng)');
  eq(await ids(fs.collection('f').where('obj', 'in', [{ v: 2 }])), ['b'], 'in so map theo giá trị');
  eq(Object.keys((await db.ref('rp/k').orderByChild('st').equalTo('y').get()).val()), ['u2'], 'RT orderByChild+equalTo khi mồi là NODE CHA (lỗi cũ: u1,u2)');
  eq((await db.ref('rp/k').get()).val(), { u1: { st: 'x' }, u2: { st: 'y' }, u3: 5 }, 'RT node cha không lọc → đủ con');
  eq(await ids(fs.collection('f').where('n', '>', 1)), ['b'], '> bỏ null / thiếu trường');
  // F10-2 (kiểm lại 10): RT không có dữ liệu → val() null, exists() false (không phải {} / true)
  const ba = sn => [sn.val(), sn.exists(), sn.hasChildren()];
  eq(ba(await db.ref('rp/k').orderByChild('st').equalTo('absent').get()), [null, false, false], 'RT truy vấn không khớp con nào → rỗng thật (lỗi cũ: {}, true)');
  w.__SEED_GHI = true; w.__SEED['re/k'] = { u1: { st: 'x' }, u2: { st: 'y' } };
  await db.ref('re/k/u1').remove(); await db.ref('re/k/u2').remove();
  eq([ba(await db.ref('re/k').get()), 're/k' in w.__SEED], [[null, false, false], false], 'RT xoá mã cuối → node cha rỗng bị dọn, đọc lại rỗng thật');
  w.__SEED_GHI = false;
  const loiCua = async f => { try { await f(); return null; } catch (e) { return /fb_gia/.test(e.message); } };
  eq(await loiCua(() => fs.collection('f').where('obj', '<', { v: 3 }).get()), true, '< với map → LỖI rõ (không lặng lẽ trả sai)');
  eq(await loiCua(() => fs.collection('f').where('n', 'lạ', 1).get()), true, 'toán tử lạ → LỖI (lỗi cũ: coi như khớp)');
  eq(await loiCua(() => db.ref('rp/k').equalTo('y')), true, 'equalTo không orderByChild → LỖI (lỗi cũ: bỏ lọc)');
  const snapIds = () => new Promise(r => { const un = fs.collection('c').where('s', '==', 'open').onSnapshot(sn => { un(); r([sn.metadata.fromCache, sn.docs.map(d => d.id)]); }); setTimeout(() => r('im lặng'), 100); });
  eq(await snapIds(), 'im lặng', 'onSnapshot mặc định im lặng (các bài cũ không đổi)');
  w.__SNAP = true; eq(await snapIds(), [false, ['a', 'c']], '__SNAP: onSnapshot gửi một ảnh đầu từ mồi, đã lọc, fromCache false'); w.__SNAP = false;
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
  // RT là cây (kiểm lượt 10 — đổ ly): transaction / đọc thấy mồi ở node con; ghi con gom vào node cha; set cha bỏ mồi con cũ
  w.__SEED['u/milk/c1'] = { unitBase: 800 };
  let thay = null; await db.ref('u/milk').transaction(cur => { thay = cur; return Object.assign({}, cur, { c1: { unitBase: 750 } }); });
  eq([thay, w.__SEED['u/milk'], 'u/milk/c1' in w.__SEED], [{ c1: { unitBase: 800 } }, { c1: { unitBase: 750 } }, false], 'RT transaction nhận mồi node con; ghi xong một nguồn ở node cha');
  await db.ref('u/milk/c2').set({ unitBase: 5 }); await db.ref('u/milk/c1').update({ unitBase: 700 });
  eq((await db.ref('u/milk').get()).val(), { c1: { unitBase: 700 }, c2: { unitBase: 5 } }, 'RT ghi node con khi đã có node cha → gộp vào cha');
  await db.ref('u/milk/c2').remove();
  eq([(await db.ref('u/milk/c2').get()).exists(), Object.keys((await db.ref('u/milk').get()).val())], [false, ['c1']], 'RT xoá node con nằm trong node cha');
  // arrayUnion / arrayRemove (kiểm lượt 10+11: «mock arrayUnion chưa thực thi») — ghi nhớ giá trị + gộp theo giá trị khi ghi-cập-nhật-mồi
  const FV = w.firebase.firestore.FieldValue;
  await fs.collection('c').doc('u').set({ ds: FV.arrayUnion({ id: 1 }) }, { merge: true });
  await fs.collection('c').doc('u').set({ ds: FV.arrayUnion({ id: 1 }, { id: 2 }) }, { merge: true });
  await fs.collection('c').doc('u').update({ ds: FV.arrayRemove({ id: 1 }) });
  eq([w.__SEED['c/u'].ds, w.__ghi.filter(g => g.p === 'c/u')[0].d.ds], [[{ id: 2 }], { __fv: 'arrayUnion', v: [{ id: 1 }] }], 'arrayUnion gộp không trùng / arrayRemove bỏ theo giá trị; lượt ghi giữ giá trị (lỗi cũ: undefined)');
  // F12-1 (kiểm lượt 12): so map theo giá trị (không theo thứ tự khoá) + set không merge giữ nền mảng cho trường biến đổi
  w.__SEED['c/m'] = { ds: [{ id: 1, staff: 'a' }], khac: 1 };
  await fs.collection('c').doc('m').set({ ds: FV.arrayUnion({ staff: 'a', id: 1 }) }, { merge: true });
  eq(w.__SEED['c/m'].ds, [{ id: 1, staff: 'a' }], 'arrayUnion map cùng giá trị khác thứ tự khoá → không thêm (lỗi cũ: 2 phần tử)');
  await fs.collection('c').doc('m').update({ ds: FV.arrayRemove({ staff: 'a', id: 1 }) });
  eq(w.__SEED['c/m'].ds, [], 'arrayRemove map khác thứ tự khoá → bỏ được (lỗi cũ: vẫn còn)');
  w.__SEED['c/s'] = { arr: [1], khac: 1 };
  await fs.collection('c').doc('s').set({ arr: FV.arrayUnion(2) });
  eq(w.__SEED['c/s'], { arr: [1, 2] }, 'set KHÔNG merge: arrayUnion lấy nền mảng cũ, trường khác bị thay (lỗi cũ: arr=[2])');
  // kiểm lượt 14: add() cài lỗi được (__HONG op 'add') — lỗi một lần, không ghi gì; lần sau ghi bình thường
  w.__HONG = [{ op: 'add', re: '^nk$' }];
  let loiAdd = null; try { await fs.collection('nk').add({ v: 1 }); } catch (e) { loiAdd = e; }
  const sauLoi = Object.keys(w.__SEED).filter(k => /^nk\//.test(k)).length;
  await fs.collection('nk').add({ v: 2 });
  eq([!!loiAdd, sauLoi, Object.keys(w.__SEED).filter(k => /^nk\//.test(k)).length, w.__ghi.some(g => g.op === 'add!hong' && g.p === 'nk')], [true, 0, 1, true], 'add() cài lỗi một lần → reject, không ghi; lần sau ghi được (lỗi cũ: add bỏ qua __HONG)');
  // F19-1 (kiểm lượt 18–19): RTDB Reference.key = đoạn cuối đường dẫn, gốc = null; Firestore ref không có key (dùng id)
  { const r = db.ref('orders_gieogieo/oct/26').child('bill_probe');
    eq([r.key, db.ref('orders_gieogieo/oct/26').key, db.ref('').key, db.ref().key], ['bill_probe', '26', null, null], 'F19-1 RT ref.key = đoạn cuối, gốc null (lỗi cũ: undefined → claim/marker hậu thanh toán sai ID)');
    eq([fs.collection('c').doc('a').key, fs.collection('c').doc('a').id], [undefined, 'a'], 'F19-1 Firestore ref: id, không có key'); }
  // F15-1 (kiểm lượt 15): log lỗi mang đúng loại nguồn — RTDB rt:true, Firestore rt:false (bộ kiểm phạm vi phân loại theo cờ này)
  w.__HONG = [{ op: 'set', re: '^menu_probe/push$' }, { op: 'set', re: '^fsprobe/x$' }];
  await db.ref('menu_probe/push').set({ name: 'p' }).catch(() => {});
  await fs.collection('fsprobe').doc('x').set({ n: 1 }).catch(() => {});
  const lg = op => (w.__ghi || []).filter(g => g.op === 'set!hong' && g.p === op).map(g => g.rt);
  eq([lg('menu_probe/push'), lg('fsprobe/x')], [[true], [false]], 'F15-1 log lỗi RTDB rt:true, Firestore rt:false (lỗi cũ: cả hai false)');
  // F16-1 (kiểm lượt 16): transaction RTDB callback trả undefined = HUỶ — committed:false, snapshot giữ dữ liệu đầu vào, seed không đổi, không có lượt ghi (SDK 10.13.2 Repo.ts)
  w.__SEED['tx/a'] = { v: 1 }; w.__ghi = [];
  const ab = await db.ref('tx/a').transaction(() => undefined);
  eq([ab.committed, ab.snapshot.val(), w.__SEED['tx/a'], (w.__ghi || []).filter(g => g.op === 'transaction').length], [false, { v: 1 }, { v: 1 }, 0], 'F16-1 transaction huỷ: committed false, snapshot = dữ liệu hiện tại, seed giữ nguyên, không ghi (lỗi cũ: committed true, snapshot undefined)');
  const cm = await db.ref('tx/a').transaction(c => Object.assign({}, c, { v: 2 }));
  eq([cm.committed, cm.snapshot.val(), w.__SEED['tx/a']], [true, { v: 2 }, { v: 2 }], 'F16-1 transaction commit giá trị mới: committed true, seed cập nhật');
  const xo = await db.ref('tx/a').transaction(() => null);
  eq([xo.committed, xo.snapshot.exists(), 'tx/a' in w.__SEED], [true, false, false], 'F16-1 transaction commit null: xoá node');
  const put = await w.firebase.storage().ref('p/x.jpg').put({ name: 'x.jpg', size: 3 });
  eq([await put.ref.getDownloadURL(), w.__ghi.some(g => g.op === 'storage.put' && g.p === 'p/x.jpg')], ['https://gia.storage/p/x.jpg', true], 'storage.put ghi nhận + URL');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
