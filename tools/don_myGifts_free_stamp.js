// Dọn rác `myGifts.__free_stamp__<ts>` mà POS Gieo Gieo (trước F4) lỡ ghi vào `customers`
// (collection dùng chung với The Cafe 33) mỗi lần khách đổi ly miễn phí theo tem.
//
// CÁCH CHẠY: mở posgieo.html đã đăng nhập → DevTools Console → dán toàn bộ file này → Enter.
//   - Mặc định CHẠY THỬ (DRY_RUN = true): chỉ đếm và in ra, KHÔNG ghi gì.
//   - Xem kết quả xong, đổi DRY_RUN = false rồi dán lại để xoá thật.
// CHỈ xoá khoá trong `myGifts` có tên bắt đầu bằng `__free_stamp__` (dạng khoá chỉ POS Gieo Gieo
// tạo ra). Không đụng quà thật, điểm, tem, hay bất kỳ trường nào khác của khách.
// Tốn lượt đọc = số khách trong `customers` (đọc 1 lần).
(async () => {
  const DRY_RUN = true;
  const PREFIX = '__free_stamp__';
  const snap = await fstore.collection('customers').get();
  const targets = [];
  snap.forEach(doc => {
    const g = (doc.data() || {}).myGifts;
    if (!g || typeof g !== 'object') return;
    const keys = Object.keys(g).filter(k => k.startsWith(PREFIX));
    if (keys.length) targets.push({ ref: doc.ref, id: doc.id, keys });
  });
  const total = targets.reduce((s, t) => s + t.keys.length, 0);
  console.table(targets.map(t => ({ khach: t.id, soKhoaRac: t.keys.length })));
  console.log(`[don_myGifts] ${targets.length} khách, ${total} khoá rác (quét ${snap.size} khách).`);
  if (DRY_RUN) { console.log('[don_myGifts] CHẠY THỬ — chưa xoá gì. Đổi DRY_RUN = false để xoá thật.'); return; }
  const del = firebase.firestore.FieldValue.delete();
  let batch = fstore.batch(), n = 0, done = 0;
  for (const t of targets) {
    // Dùng FieldPath (update(fieldPath, value, ...)) để khoá có ký tự lạ vẫn trỏ đúng trường.
    const args = [];
    t.keys.forEach(k => { args.push(new firebase.firestore.FieldPath('myGifts', k), del); });
    batch.update(t.ref, ...args);
    if (++n === 400) { await batch.commit(); done += n; batch = fstore.batch(); n = 0; }
  }
  if (n) { await batch.commit(); done += n; }
  console.log(`[don_myGifts] ĐÃ XOÁ ${total} khoá rác ở ${done} khách.`);
})().catch(e => console.error('[don_myGifts] lỗi:', e));
