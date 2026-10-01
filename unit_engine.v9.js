/*
 * unit_engine.v9.js — Unit Engine Gieo Gieo (tem nguyên liệu + lô BTP, FIFO, nợ FIFO, suy tồn,
 * sổ kho, sinh mã, Sổ lệch). POS và Quản lý cùng nạp bằng <script src> TRƯỚC script chính.
 *
 * Nguồn gốc: các hàm lõi của posgieo.html, chép NGUYÊN VĂN (kể cả chú thích) — thay đổi duy nhất:
 *   · Date.now() / new Date() / Math.random() / crypto → C.now() / C.random() / C.randomBytes()
 *   · biến toàn cục của app (fstore, db, KHO_ITEMS_CACHE, toast, …) → cấu hình C / hook C.hooks
 * Kế hoạch: docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md (mục 3, E1–E2). API: docs/UNIT_ENGINE.md.
 *
 * Bất biến B1–B15 (mục 2.1) giữ nguyên. Không có "ready" chặn: init() đồng bộ, dùng được ngay (D17).
 * Tên file mang phiên bản — đổi hành vi = file mới (unit_engine.v9.js), HTML trỏ cố định tên file.
 * v8 (01/10/2026): sửa theo bản rà bug lần 3 — hoàn phần trừ trùng (cùng txId) kiểm tra đủ + việc phục hồi bền (consume.compensateDuplicate/recoverDuplicates),
 *   xác minh cân lại lưu dữ liệu lượt đang làm (làm lại dùng đúng số đó) + kiểm token trong từng transaction ghi + giữ nợ âm, sổ lô tại mốc cân (duty.lotBookAt). v1–v7 giữ để quay lui.
 * v7 (01/10/2026): sửa theo bản rà bug lần 2 — xác minh cân lại có token + nhả việc khi lỗi + điều chỉnh sổ chỉ tính phần cân lệch thật + gỡ node RT bằng transaction
 *   + không đóng việc khi ghi lô lỗi; trừ BTP cùng txId chạy chồng chỉ trừ một lần. v1–v6 giữ để quay lui.
 * v6 (01/10/2026): sửa theo bản rà bug — xác minh cân lại ghi lặp được (khoá việc + RT có dấu thao tác + đồng bộ lô từ RT), hoàn kho khi NL đang khoá
 *   báo lỗi thật (nhả claim) thay vì ghi dòng hoàn ngoài tem, bán BTP thiếu lô suy tồn ngay. v1–v5 giữ để quay lui.
 * v5 (01/10/2026): quy trách nhiệm theo ca cho NGUYÊN LIỆU (cân cuối ca → hồ sơ vụ lệch theo ca, chạy nền, không chặn bán) +
 *   tóm tắt ngày (duty.digest / writeDigest). v4: nhóm `duty` cho BTP. v1–v4 giữ để quay lui.
 * v4 (01/10/2026): nhóm `duty` — tự quy trách nhiệm lệch/hao hụt theo ca (hồ sơ vụ lệch, cân lại một lần, xác minh khi
 *   người khác check-in, cân lúc đang bán không khoá). Kế hoạch: docs/KE_HOACH_TRACH_NHIEM_CA.md. v1–v3 giữ để quay lui.
 * v3 (01/10/2026): cân đối chiếu ra NHIỀU HƠN sổ (sổ mẻ trước nhập thiếu) chốt được — ghi điều chỉnh tăng, mẻ dùng theo định
 *   mức, truy ra người cân mốc trước (đánh dấu nhập sai + báo Quản lý). v2: bán trong lúc NL khoá cân. v1/v2 giữ để quay lui.
 * v2 (30/09/2026): bán hàng trong lúc NL khoá cân cho mẻ chế biến vẫn trừ tem + được ghi nhận (saleHeld, prepWindowBatchId),
 *   chốt đối chiếu tách phần bán khỏi lượng mẻ dùng; khoá mở mã / báo hết ở tab Kho. Bản v1 giữ nguyên để quay lui.
 */
(function (root) {
  const VERSION = '9.0.0';
  let C = null;   // cấu hình từ init()
  // [E3] Dòng sổ / Sổ lệch ghi từ Quản lý mang source 'management' như bản chép cũ bên Quản lý.
  const _src = () => (C.app === 'quanly' ? 'management' : 'pos');

  // ── Lớp truy cập dữ liệu (giữ hậu tố _gieogieo — D16). Hằng số dùng trong lõi. ──
  const STOCK_CONTAINERS_COLL = 'stock_containers_gieogieo';
  const STOCK_ANOMALY_COLL = 'stock_anomalies_gieogieo';
  const PREP_RECON_LOCK_COLL = 'prep_ingredient_locks_gieogieo';
  // [E6] Mọi bản ghi Firestore MỚI do engine tạo mang storeId (hiện cố định 'gg01' — D4 hướng B).
  // Chỉ THÊM trường (tương thích ngược); không đổi đường dẫn — M2 mới đổi khoá/đường dẫn theo cửa hàng.
  const _st = d => (d && typeof d === 'object' && !Array.isArray(d) && !('storeId' in d)) ? Object.assign({}, d, { storeId: C.storeId }) : d;
  const P = {
    storeId: () => (C ? C.storeId : 'gg01'),
    units: itemId => 'active_units_gieogieo/' + itemId,
    unit: (itemId, id) => 'active_units_gieogieo/' + itemId + '/' + id,
    containers: () => STOCK_CONTAINERS_COLL,
    batches: () => 'prep_batches_gieogieo',
    stockTx: () => 'stock_transactions_gieogieo',
    prepTx: () => 'prep_transactions_gieogieo',
    anomalies: () => STOCK_ANOMALY_COLL,
    claims: () => 'reversal_unit_claims_gieogieo',
    locks: () => PREP_RECON_LOCK_COLL,
    traces: () => 'order_stock_traces_gieogieo',
    itemState: (itemId, kind) => (kind === 'prep' ? ['prep_items_gieogieo', itemId] : ['inventory_items_gieogieo', itemId]),
    key: (...p) => p.join('_').replace(/[^\w\-]/g, '_').slice(0, 180)
  };
  let STOCK_OPEN_LIST = [];   // danh sách tem mở lần nạp gần nhất (loadOpenContainers)

  // ════════════════════════ LÕI (chép từ posgieo.html) ════════════════════════
  async function loadOpenContainers() {
    try {
      const snap = await C.fstore.collection(STOCK_CONTAINERS_COLL).where('status', '==', 'open').get();
      STOCK_OPEN_LIST = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));
    } catch (err) {
      console.warn('loadOpenContainers lỗi', err);
      STOCK_OPEN_LIST = [];
    }
    return STOCK_OPEN_LIST;
  }

  async function findContainerByCode(code) {
    const ma = String(code || '').trim().toUpperCase();
    if (!ma) return null;
    try {
      const snap = await C.fstore.collection(STOCK_CONTAINERS_COLL).where('code', '==', ma).get();
      const tatCa = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!tatCa.length) return null;
      // TRƯỚC ĐÂY lấy thẳng docs[0]. Với mã trùng thì đó là chọn BỪA một chai trong nhóm — quét
      // chai Trà đen có thể trừ chai Trà lài, và sổ kho sai mà không ai biết. Thà từ chối.
      // Chai đã dùng hết không còn trên kệ nên không tính vào việc phân định trùng; giữ lại để
      // nơi gọi vẫn báo được "đã báo hết trước đó" thay vì "không có mã này".
      // 'voided' = tem sinh nhầm đã bị Quản lý huỷ khi sửa phiếu nhận ghi thừa. Nó không
      // còn đại diện cho hàng nào, nên KHÔNG được tính vào việc phân định trùng mã (không thì
      // một con tem đã huỷ làm kẹt luôn con tem thật cùng mã), và cũng không được mở.
      const song = tatCa.filter(c => c.status !== 'finished' && c.status !== 'voided');
      if (song.length > 1) return { _trungMa: true, code: ma, soChai: song.length };
      return song[0] || tatCa[0];
    } catch (err) { console.warn('findContainerByCode lỗi', err); return null; }
  }

  function _ueActiveUnitsRef(itemId) { return C.db.ref('active_units_gieogieo/' + itemId); }

  // Thử lại tối đa `tries` lần, cách nhau 400ms — dùng riêng cho việc GHI ĐĂNG KÝ một unit mới
  // vào RT (unitEngineOnOpen): nếu bước này thất bại hẳn, Firestore đã ghi 'open'/'active'
  // nhưng RT (nguồn thật của phần đang mở) lại KHÔNG biết tới unit đó — lượt bán kế tiếp sẽ im
  // lặng KHÔNG trừ được unit này (coi như "chưa có tem nào đang mở"). Các lỗi khác trong hệ
  // thống được phép "best-effort, không chặn" vì hậu quả chỉ là một số tham khảo sai; lỗi CHỖ
  // NÀY nghiêm trọng hơn hẳn (mù hoàn toàn với một unit còn hàng thật) nên đáng thử lại.
  async function _ueRetryAsync(fn, tries) {
    tries = tries || 3;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try { return await fn(); } catch (err) {
        lastErr = err;
        if (i < tries - 1) await new Promise(r => setTimeout(r, 400));
      }
    }
    throw lastErr;
  }

  // Thuật toán thuần giống hệt allocateConsumption() trong unitEngine.js (đã kiểm chứng bằng
  // Node) — nhân bản tại đây vì posgieo.html là 1 file HTML độc lập, không import module được.
  function _ueComputeAllocation(openUnits, qtyNeeded) {
    const EPS = 1e-9;
    const units = [...openUnits].sort((a, b) => (a.openedAt || 0) - (b.openedAt || 0));
    const allocations = [];
    const updates = {};
    if (!units.length || !(qtyNeeded > 0)) return { allocations, updates };
    let left = qtyNeeded;
    for (const u of units) {
      if (left <= EPS) break;
      const avail = (updates[u.id] ?? u.unitBase);
      if (avail <= EPS) continue;
      const take = Math.min(avail, left);
      updates[u.id] = avail - take;
      allocations.push({ unitId: u.id, qty: take });
      left -= take;
    }
    if (left > EPS) {
      // Mọi tem đang mở đều đã cạn (unitBase<=0) mà vẫn còn cần lấy — dồn phần thiếu thành NỢ
      // FIFO lên tem mở GẦN NHẤT (cuối hàng FIFO). Quy ước mở rộng cho ca nhiều tem mở song
      // song cùng cạn một lúc (spec gốc chỉ mô tả 1 chuỗi đơn tuyến).
      const last = units[units.length - 1];
      const cur = (updates[last.id] ?? last.unitBase);
      updates[last.id] = cur - left;
      const existing = allocations.find(a => a.unitId === last.id);
      if (existing) existing.qty += left; else allocations.push({ unitId: last.id, qty: left });
    }
    return { allocations, updates };
  }

  /** Cảnh báo vượt capacity (spec mục 7): |unitBase| > capacity nghĩa là còn ít nhất 1 tem chưa được quét mở. */
  function missingUnitsWarning(unitBase, capacity) {
    if (!(capacity > 0)) return 0;
    if (Math.abs(unitBase) <= capacity) return 0;
    return Math.ceil(Math.abs(unitBase) / capacity);
  }

  // [v9] Nhật ký thay đổi sổ NGAY TRONG node RT của lô BTP ({t: ms, d: thay đổi unitBase}, tối đa CHG_MAX dòng) — ghi cùng transaction đổi unitBase
  // nên số dư và nhật ký luôn cùng một thời điểm. Dùng cho duty.lotBookAt (sổ lô TẠI mốc cân): bán VÀ hoàn đều có dấu. Cắt bớt thì ghi `chgTrim`.
  const CHG_MAX = 30;
  function _ueChgPush(node, atMs, d) {
    if (!node || !d) return;
    const arr = Array.isArray(node.chg) ? node.chg.slice() : [];
    arr.push({ t: atMs, d: round2(d) });
    if (arr.length > CHG_MAX) { const cut = arr.splice(0, arr.length - CHG_MAX); node.chgTrim = Math.max(Number(node.chgTrim) || 0, cut[cut.length - 1].t); }
    node.chg = arr;
  }
  // Thay cho fifoAllocateConsumption — trả về ĐÚNG shape cũ ({containerId, code, itemName,
  // unit, qty}) để mọi chỗ gọi/lưu meta.fifoAllocations không phải đổi gì thêm.
  // `coll` = collection Firestore để đồng bộ bản sao unitBase — STOCK_CONTAINERS_COLL cho
  // nguyên liệu (mặc định), 'prep_batches_gieogieo' cho BTP (itemId truyền vào lúc đó là prepId).
  // `ref` (tuỳ chọn) = {type, id, note} — nơi gọi truyền vào để ghi một dòng sự kiện NGAY TRÊN
  // chính document tem/lô bị trừ (mảng `usageEvents`), phục vụ màn "Chi tiết tem" xem timeline
  // sau này mà không phải dò ngược qua nhiều dòng ledger theo referenceId. Không truyền thì vẫn
  // hoạt động y hệt trước giờ (event chỉ thiếu `ref`, không mất tính năng gì).
  async function unitEngineAllocateConsumption(itemId, qtyUsed, coll, ref) {
    coll = coll || STOCK_CONTAINERS_COLL;
    const used = Math.abs(Number(qtyUsed) || 0);
    if (!itemId || !used) return [];
    // [NL-RECON] Không để bill/mẻ khác đổi số của NL đang được cân cho một mẻ.
    // Đặt ngoài catch RTDB phía dưới: khóa là lỗi nghiệp vụ, không được nuốt như lỗi mạng.
    // [Bán trong lúc NL khoá cân] Lượt BÁN (ref.duringPrepLock) được đi qua khoá của mẻ chế biến: vẫn trừ tem
    // đúng FIFO như bình thường và cộng dồn `saleHeld` trên tem — để lúc cân sau hệ thống biết bao nhiêu đã
    // bán đi trong khoảng đó (không tính vào lượng mẻ đã dùng). Mọi thao tác khác vẫn bị chặn như cũ.
    const duringLock = !!(ref && ref.duringPrepLock);
    if (coll === STOCK_CONTAINERS_COLL && !duringLock) await prepReconAssertFree(itemId, ref && ref.id);
    let finalAllocations = [];
    let finalUpdates = {}; // unitId -> unitBase MỚI (giá trị RT vừa chốt trong transaction — dùng để
                            // đồng bộ qtyRemaining KHÔNG cần đọc lại Firestore, tránh race — xem BUG#4).
    let meta = {};
    let prepLocked = false;
    try {
      await _ueActiveUnitsRef(itemId).transaction(current => {
        finalAllocations = [];
        finalUpdates = {};
        prepLocked = false;
        if (!current) return current; // không có tem nào đang mở — xử lý cảnh báo riêng bên dưới
        // Khóa cùng node RT với lượng tồn: lượt bán không thể lọt giữa kiểm tra
        // khóa và trừ FIFO, kể cả khi Firestore/RT chạy ở hai hệ thống khác nhau.
        const lockedByOther = coll===STOCK_CONTAINERS_COLL && current.__prepLock
            && current.__prepLock.batchId!==(ref&&ref.id);
        if(lockedByOther && !duringLock){prepLocked=true;return;}
        // Tem đang báo hủy giữ một mốc RT tạm để retry an toàn. Nó không còn được
        // bán tiếp hoặc nhận nợ FIFO trong lúc giao dịch WASTE hoàn tất.
        const units = Object.keys(current).filter(id=>id!=='__prepLock' && !current[id]?.discardPending)
          .map(id => ({ id, ...current[id] }));
        meta = {};
        units.forEach(u => { meta[u.id] = { code: u.code || '', itemName: u.itemName || '', unit: u.unit || '' }; });
        const { allocations, updates } = _ueComputeAllocation(units, used);
        finalAllocations = allocations;
        finalUpdates = updates;
        const atChg = C.now();
        Object.keys(updates).forEach(id => { if (current[id]) { const before = Number(current[id].unitBase) || 0; current[id].unitBase = updates[id]; if (coll === 'prep_batches_gieogieo') _ueChgPush(current[id], atChg, updates[id] - before); } });
        // Bán trong lúc khoá: ghi số đã bán vào chính tem (cùng transaction với việc trừ) — bộ đếm này là
        // căn cứ để bước cân đối chiếu tách phần bán ra khỏi phần mẻ dùng.
        if(lockedByOther) allocations.forEach(a => {
          const u = current[a.containerId || a.unitId];
          if (u) u.saleHeld = round2((Number(u.saleHeld) || 0) + (Number(a.qty) || 0));
        });
        return current;
      });
    } catch (err) {
      if(prepLocked)throw new Error('NL đang chờ cân ở mẻ khác');
      // [BUG "allocator nuốt lỗi RTDB" — FIX] Trước đây lỗi hạ tầng (mất mạng/timeout RTDB) và
      // "item này thật sự không có tem nào đang mở" đều rơi vào CÙNG MỘT return [] — nơi gọi
      // không phân biệt được, và cảnh báo untracked_unit_consumption bên dưới sẽ hiện sai lý do
      // ("chưa dán tem") khiến Quản lý đi tìm tem không tồn tại thay vì biết đây là lỗi kết
      // nối. Vẫn KHÔNG chặn bán hàng (đúng nguyên tắc xuyên suốt hệ thống — lỗi hạ tầng nhất
      // thời không được làm nghẽn quầy), nhưng cảnh báo phải nói ĐÚNG nguyên nhân.
      console.warn('[UnitEngine] allocateConsumption lỗi RTDB', itemId, err);
      _ueWarnAllocateRtdbError(itemId, used, coll, err).catch(() => {});
      return [];
    }
    if(prepLocked)throw new Error('NL đang chờ cân ở mẻ khác');
    if (!finalAllocations.length) {
      // [BUG#2] Không tem/lô nào đang mở để trừ — currentStock vẫn bị trừ bình thường ở nơi gọi
      // (không chặn bán hàng), nhưng nếu nguyên liệu/BTP này ĐÁNG LẼ phải có tem/lô thì đây là
      // một khoảng hở dữ liệu thật cần Quản lý biết, không phải im lặng bỏ qua như trước.
      _ueMaybeWarnUntrackedConsumption(itemId, used, coll).catch(() => {});
    }
    // Đồng bộ bản sao Firestore (không chặn/await luồng bán hàng vì lỗi ở đây — RT mới là
    // nguồn thật của phần đang mở, Firestore chỉ là bản sao để màn báo cáo tĩnh đọc nhanh).
    const nowISO = new Date(C.now()).toISOString();
    finalAllocations.forEach(a => {
      // [MỚI] usageEvents — nhật ký NGẮN ngay trên tem/lô, ghi mỗi lần bị trừ (bill nào/mẻ nào,
      // trừ bao nhiêu, lúc nào). Chỉ cần THÊM (arrayUnion), không đọc lại doc trước — không tăng
      // round-trip, best-effort giống hệt cách cập nhật unitBase ngay dưới đây. Mảng có thể dài
      // dần theo thời gian sống của tem — chấp nhận được vì tem/lô có vòng đời hữu hạn (mở tới
      // hết), không phải mãi mãi như 1 nguyên liệu.
      const event = { type: 'consumed', qty: a.qty, at: nowISO };
      if (ref && ref.type) event.refType = ref.type;
      if (ref && ref.id) event.refId = ref.id;
      if (ref && ref.note) event.note = ref.note;
      // [FIX — "bổ sung bill thiếu sau đóng ngày gán sai lô"] businessDate của chính bill (không
      // phải `at`, luôn là giờ THẬT của lượt bổ sung) — để nơi tra cứu sau này (vd Chi tiết lô bên
      // Quản lý) mở lại ĐÚNG bill theo ngày phát sinh, không lệch ngày khi bill được bổ sung muộn.
      if (ref && ref.businessDate) event.businessDate = ref.businessDate;
      // Bill bổ sung SAU KHI đã đóng ngày ("có trừ tồn kho hiện tại") buộc phải trừ vào lô ĐANG MỞ
      // LÚC BỔ SUNG — không có cách nào biết lô nào thật sự đang mở vào đúng ngày bán gốc (RT chỉ
      // giữ trạng thái HIỆN TẠI, không phải ảnh chụp lịch sử). Đánh dấu rõ để mọi nơi hiển thị
      // usageEvents này KHÔNG được trình bày như một dấu vết FIFO đáng tin cho đúng ngày bán gốc.
      if (ref && ref.backfillAfterClose) event.backfillAfterClose = true;
      C.fstore.collection(coll).doc(a.unitId)
        .update({
          unitBase: C.FieldValue.increment(-a.qty),
          usageEvents: C.FieldValue.arrayUnion(event)
        })
        .catch(err => console.warn('[UnitEngine] đồng bộ unitBase Firestore lỗi (không ảnh hưởng RT)', a.unitId, err));
      if (coll === 'prep_batches_gieogieo') _ueSyncQtyRemainingClamped(a.unitId, finalUpdates[a.unitId]);
    });
    return finalAllocations.map(a => ({
      containerId: a.unitId,
      code: (meta[a.unitId] || {}).code || '',
      itemName: (meta[a.unitId] || {}).itemName || '',
      unit: (meta[a.unitId] || {}).unit || '',
      qty: a.qty
    }));
  }

  // [BUG#2] Cảnh báo "bán ra nhưng không có tem/lô nào đang mở" — CHỈ báo khi nguyên liệu/BTP
  // này thật sự được khai là có theo dõi tem/lô (trackingMode 'unit'/'batch', hoặc là BTP —
  // BTP luôn bắt buộc qua prep_batches). Nguyên liệu trackingMode 'none' (cố ý không dán tem)
  // thì đây KHÔNG phải lỗi — bỏ qua, không tạo nhiễu. Dùng chung collection alerts_gieogieo +
  // idempotency key theo ngày (giống reportMissingRecipePOS) để 1 ngày chỉ có 1 dòng/1 món dù
  // bán lặp lại nhiều lượt, đếm dồn qua hitCount cho Quản lý biết mức độ.
  async function _ueMaybeWarnUntrackedConsumption(itemId, qty, coll) {
    let mode = 'none', name = '';
    if (coll === 'prep_batches_gieogieo') {
      const p = (C.getPreps() || []).find(x => x.id === itemId);
      mode = 'batch'; // BTP luôn cần qua lô — không có lô nào đang mở tức là hở dữ liệu thật
      name = p ? p.name : '';
    } else {
      const it = (C.getItems() || []).find(x => x.id === itemId);
      mode = (it && it.trackingMode) || 'none';
      name = it ? it.name : '';
    }
    if (mode !== 'unit' && mode !== 'batch') return;
    try {
      const day = C.businessDate();
      const docId = ('untracked_unit_consumption_' + day + '_' + itemId).replace(/[^\w\-]/g, '_').slice(0, 180);
      await C.fstore.collection('alerts_gieogieo').doc(docId).set(_st({
        type: 'untracked_unit_consumption', severity: 'warning', status: 'new',
        businessDate: day, createdAt: new Date(C.now()).toISOString(),
        title: `"${name || itemId}" bán ra nhưng KHÔNG có tem/lô nào đang mở để trừ`,
        itemId, itemName: name, trackingMode: mode,
        note: coll === 'prep_batches_gieogieo' ? 'Không lô nào đang mở để trừ — khoản bán vào "âm chờ đối chiếu", đối chiếu ở cân BTP cuối ca' : 'Tồn theo mã KHÔNG bị trừ (khoản này ghi vào Sổ lệch tem) — kiểm tra có tem cần quét mở/quét dùng không',
        hitCount: C.FieldValue.increment(1)
      }), { merge: true });
    } catch (err) { console.warn('[UnitEngine] ghi cảnh báo untracked_unit_consumption lỗi', itemId, err); }
  }

  // [BUG "allocator nuốt lỗi RTDB" — FIX] Cảnh báo RIÊNG cho trường hợp bán được nhưng KHÔNG
  // phân bổ được vào tem/lô vì lỗi hạ tầng (mất mạng/timeout RTDB) — khác hẳn "chưa dán tem"
  // (_ueMaybeWarnUntrackedConsumption): ở đây tem/lô CÓ tồn tại, chỉ là hệ thống không đọc/ghi
  // RT được lúc đó. Báo đúng nguyên nhân để Quản lý biết cần đối soát lại bằng kiểm kê, không
  // đi tìm tem để dán.
  async function _ueWarnAllocateRtdbError(itemId, qty, coll, err) {
    const isPrep = coll === 'prep_batches_gieogieo';
    const name = isPrep
      ? ((C.getPreps() || []).find(x => x.id === itemId) || {}).name
      : ((C.getItems() || []).find(x => x.id === itemId) || {}).name;
    try {
      const day = C.businessDate();
      const docId = ('allocate_rtdb_error_' + day + '_' + itemId).replace(/[^\w\-]/g, '_').slice(0, 180);
      await C.fstore.collection('alerts_gieogieo').doc(docId).set(_st({
        type: 'allocate_rtdb_error', severity: 'danger', status: 'new',
        businessDate: day, createdAt: new Date(C.now()).toISOString(),
        title: `"${name || itemId}" bán ra nhưng LỖI ĐỒNG BỘ realtime — KHÔNG phải chưa dán tem`,
        itemId, itemName: name || '', errorMessage: String((err && err.message) || err || ''),
        note: 'currentStock đã bị trừ nhưng tem/lô không được cập nhật do lỗi kết nối lúc bán — không phải thiếu tem, cần đối soát lại số bằng kiểm kê',
        hitCount: C.FieldValue.increment(1)
      }), { merge: true });
    } catch (e) { console.warn('[UnitEngine] ghi cảnh báo allocate_rtdb_error lỗi', itemId, e); }
  }

  // [BUG#3 FIX] currentStock của 1 item = SUY RA từ tổng unit thật, không phải một số cộng/trừ
  // độc lập nữa (đó chính là "2 sổ không atomic" — gốc rễ đã audit). Công thức: tổng dung tích
  // các unit CÒN NGUYÊN SEAL (Firestore là nguồn thật cho phần này) + tổng unitBase các unit
  // ĐANG MỞ (RT là nguồn thật cho phần này, có thể âm). BTP không có trạng thái "sealed" (mẻ
  // nấu xong là mở luôn) nên bỏ qua phần sealed, chỉ tính RT.
  // CHỈ gọi hàm này ở những nơi ĐÃ CHẮC CHẮN vừa có một unit thật bị đụng vào (allocations
  // không rỗng, hoặc onOpen/finish vừa chạy xong) — gọi bừa cho item không có unit nào sẽ SUY
  // RA 0 và ghi đè sai currentStock của chính item đó.
  async function _ueRecomputeCurrentStock(itemId, coll) {
    coll = coll || STOCK_CONTAINERS_COLL;
    const isPrep = coll === 'prep_batches_gieogieo';
    const itemColl = isPrep ? 'prep_items_gieogieo' : 'inventory_items_gieogieo';
    // [RACE FIX] Đọc RT và ghi currentStock là 2 hệ thống khác nhau (RTDB/Firestore), không thể
    // gộp thành 1 transaction thật sự — 2 lượt recompute chạy gần nhau có thể ghi ngược thứ tự
    // (lượt ĐỌC RT trước nhưng GHI Firestore sau lại đè số MỚI của lượt đọc sau nó). Mốc
    // `myStartedAt` = lúc BẮT ĐẦU đọc RT của chính lượt gọi này — ghi kèm lên chính doc, lượt
    // nào bắt đầu SAU (đọc RT mới hơn) luôn được ưu tiên; lượt bắt đầu trước mà chạy chậm hơn tự
    // biết mình đã lỗi thời (so trong transaction Firestore) và bỏ qua, không ghi đè.
    // [Sửa lỗi đồng hồ] Có giờ máy chủ mà chưa nhận được lệch giờ → chờ tối đa 3 giây; vẫn chưa có thì
    // lượt này ghi tồn KHÔNG đóng mốc và KHÔNG so mốc (giờ máy chưa tin được).
    const clockOk = await _ueClockReady();
    const myStartedAt = C.now();
    let sealedTotal = 0;
    // [RACE FIX #2] 3 lượt đọc (sealed Firestore → RT → open Firestore) không cùng snapshot.
    // Một container chuyển sealed→open ĐÚNG giữa lượt (1) và (2) bị đếm 2 lần: lượt (1) đã cộng
    // baseQty của nó vào sealedTotal lúc còn 'sealed', rồi lượt (2) đọc RT lại thấy nó đã 'open'
    // (mới ghi xong) nên cộng thêm unitBase vào openTotal — cùng một hàng hoá vật lý bị tính 2
    // lần, currentStock ghi dư đúng bằng dung tích container đó (lộ ra ở kỳ kiểm kê kế tiếp
    // thành "hao hụt" ma). Nhớ lại id+baseQty đã đếm ở (1); nếu id đó XUẤT HIỆN LẠI trong RT ở
    // (2) — tức đã kịp mở giữa 2 lượt đọc — trừ ngược phần đã cộng nhầm ở sealedTotal, giữ đúng
    // 1 lần theo số RT mới nhất (unitBase, có thể đã bị bán trừ ngay sau khi mở).
    const sealedById = {};
    let computed = null;   // [E3] trả về tồn vừa tính (Quản lý dùng — soLechCutover); POS không đọc
    try {
      if (!isPrep) {
        const sealedSnap = await C.fstore.collection(coll).where('itemId', '==', itemId).where('status', '==', 'sealed').get();
        sealedSnap.forEach(d => {
          const bq = Number(d.data().baseQty) || 0;
          sealedById[d.id] = bq;
          sealedTotal += bq;
        });
      }
      const rtSnap = await _ueActiveUnitsRef(itemId).once('value');
      const rt = rtSnap.val() || {};
      let openTotal = 0;
      const ubById = {}; // unitBase cuối cùng của từng lô/tem đang mở — BTP cần tách dương/âm
      Object.keys(rt).filter(k=>k!=='__prepLock').forEach(k => {
        if (sealedById[k] !== undefined) sealedTotal -= sealedById[k];
        if (!rt[k]?.discardPending) { ubById[k] = Number(rt[k].unitBase) || 0; openTotal += ubById[k]; }
      });
      // [BUG "Firestore open nhưng RT fail → mất Unit khi recompute" — FIX] unitEngineOnOpen() có
      // thể fail SAU KHI Firestore đã chuyển status sealed→open (hoặc BTP đã 'active') — hàng vật
      // lý CÓ THẬT, Firestore biết, nhưng RT (nguồn thật cho phần "đang mở") lại không có node
      // cho unit đó. Trước đây recompute chỉ cộng sealed(Firestore) + open(RT) — unit này rơi
      // vào khoảng trống giữa 2 vế, biến mất khỏi currentStock dù đang tồn tại thật. Giờ quét
      // thêm các unit "đang mở" trên Firestore mà KHÔNG có mặt trong RT snapshot, cộng bù bằng
      // unitBase cuối cùng Firestore biết (bản sao, không tệ hơn hiện trạng trước khi có RT).
      const openStatus = isPrep ? 'active' : 'open';
      let orphanOpenTotal = 0;
      // [BUG "kiểm kê RT lỗi vẫn bị recompute sau ghi đè lại số cũ" — FIX] Trường hợp KHÁC với
      // "orphan" ở trên: unit VẪN CÓ mặt trong RT (không missing), nhưng chính RT đó đã được biết
      // là SAI (vd kiểm kê cuối ngày ghi Firestore đúng số đếm thật rồi, còn bước ghi RT lại lỗi
      // dù đã thử lại nhiều lần — xem _submitPrepCountImpl). Nếu không xử lý, `openTotal` ở trên đã
      // lỡ cộng nhầm số RT CŨ của đúng unit này, và KHÔNG có nhánh nào phát hiện ra để sửa — bất kỳ
      // recompute nào sau đó (kể cả do một nghiệp vụ hoàn toàn khác của cùng món) sẽ ghi đè
      // currentStock lùi về số sai. Firestore tự đánh dấu `_ueRtStale:true` lên đúng unit đó khi
      // biết RT đã lỗi; ở đây bù lại phần chênh lệch để dùng số Firestore (mới, đúng) thay cho số
      // RT (cũ, sai) đã cộng nhầm.
      try {
        const openSnap = await C.fstore.collection(coll).where(isPrep ? 'prepId' : 'itemId', '==', itemId).where('status', '==', openStatus).get();
        openSnap.forEach(d => {
          const data = d.data();
          if (!rt[d.id]) { orphanOpenTotal += Number(data.unitBase) || 0; ubById[d.id] = Number(data.unitBase) || 0; return; } // đã có trong RT — openTotal đã tính rồi, không cộng đôi
          if (data._ueRtStale) {
            orphanOpenTotal += (Number(data.unitBase) || 0) - (Number(rt[d.id].unitBase) || 0);
            ubById[d.id] = Number(data.unitBase) || 0;
          }
        });
      } catch (err) { console.warn('[UnitEngine] quét unit mở lệch RT lỗi (bỏ qua bù, dùng số RT thuần)', itemId, err); }
      openTotal += orphanOpenTotal;
      const itemRef = C.fstore.collection(itemColl).doc(itemId);
      await C.fstore.runTransaction(async t => {
        const doc = await t.get(itemRef);
        let lastStart = (doc.exists && Number(doc.data()._ueLastRecomputeStart)) || 0;
        // [E6 — C1, mục 6.5] Có giờ máy chủ: mốc lớn hơn now()+10 phút là mốc "tương lai" do máy chạy
        // giờ nhanh để lại trước E6 → bỏ qua và ghi đè bằng mốc mới. Chưa có giờ máy chủ thì KHÔNG bỏ
        // qua (giờ các máy chưa thống nhất — bỏ qua sẽ phá chống ghi đè R3).
        if (C.serverClock && clockOk && lastStart > C.now() + FUTURE_STAMP_MS) lastStart = 0;
        // [E3 — R3] Quản lý: chỉ dùng mốc B9 khi có giờ máy chủ (E6). Chưa có thì như bản chép
        // recomputeTemStock cũ: luôn ghi, KHÔNG đụng mốc (máy lệch giờ sẽ so sai).
        const noStamp = (C.app === 'quanly' && !C.serverClock) || (C.serverClock && !clockOk);
        if (noStamp && !doc.exists) return;
        if (!noStamp && myStartedAt < lastStart) {
          // đã có lượt đọc RT MỚI HƠN ghi rồi — bỏ qua, không đè. [E6] Có giờ máy chủ: trả tồn MỚI
          // HƠN đó cho nơi gọi cần số (Quản lý) thay vì null (null = "không tính được" → báo lỗi oan).
          if (C.serverClock && doc.exists) computed = Number(doc.data().currentStock) || 0;
          return;
        }
        const stamp = noStamp ? {} : { _ueLastRecomputeStart: myStartedAt };
        // [TEM = SỰ THẬT] Nguyên liệu: tồn = CHỈ tổng các mã (sealed + đang mở). Khoản nào
        // không gắn được vào mã thì nằm ở Sổ lệch (STOCK_ANOMALY_COLL), không vào tồn.
        if (!isPrep) {
          computed = sealedTotal + openTotal;
          t.update(itemRef, { currentStock: sealedTotal + openTotal, updatedAt: new Date(C.now()).toISOString(), ...stamp });
          return;
        }
        // [BTP — ÂM CHỜ ĐỐI CHIẾU] Tồn BTP = tổng phần DƯƠNG của các lô (hàng thật đang có).
        // Phần âm (bán vượt lô) + untrackedPendingDelta (bán/đổ khi chưa có lô nào) KHÔNG trừ
        // vào tồn mà gom thành pendingShortage — "đã bán nhưng chưa rõ lấy từ đâu", đối chiếu
        // ở cuối ca (prepShortageCollect → prepShortageAskIfNeeded).
        const vals = Object.values(ubById);
        const posTotal = vals.reduce((a, v) => a + Math.max(0, v), 0);
        const negTotal = vals.reduce((a, v) => a + Math.min(0, v), 0);
        // Chỉ lấy phần ÂM của delta: delta dương chỉ sinh ra khi hoàn một khoản bán không có lô
        // SAU khi cân cuối ca đã đóng khoản âm đó — không được dùng nó che khoản âm của ngày sau.
        const delta = Math.min(0, Number((doc.exists && doc.data().untrackedPendingDelta)) || 0);
        const pendingShortage = round2(Math.max(0, -(negTotal + delta)));
        t.update(itemRef, { currentStock: round2(posTotal), pendingShortage, updatedAt: new Date(C.now()).toISOString(), ...stamp });
        computed = round2(posTotal);
      });
    } catch (err) { console.warn('[UnitEngine] suy currentStock từ tổng unit lỗi', itemId, err); }
    if (computed !== null) C.hooks.stockChanged(itemId, isPrep ? 'prep' : 'item');
    return computed;
  }

  // prep_batches_gieogieo vẫn giữ `qtyRemaining` song song để báo cáo/chi phí theo lô cũ
  // (đọc field này) không bị vỡ trong giai đoạn chuyển tiếp — luôn kẹp về >=0 (khác unitBase
  // có thể âm). `knownUnitBase` = giá trị RT vừa chốt trong CÙNG transaction gọi hàm này —
  // [BUG#4 FIX] dùng thẳng số đó thay vì đọc lại Firestore, vì bản ghi Firestore có thể chưa
  // kịp áp dụng increment() (không await) lúc hàm này chạy, gây đọc trúng số cũ (race). Không
  // truyền knownUnitBase (vd gọi từ chỗ khác) thì mới rơi về đọc lại Firestore như trước.
  async function _ueSyncQtyRemainingClamped(batchId, knownUnitBase) {
    try {
      let unitBase;
      if (typeof knownUnitBase === 'number' && isFinite(knownUnitBase)) {
        unitBase = knownUnitBase;
      } else {
        const doc = await C.fstore.collection('prep_batches_gieogieo').doc(batchId).get();
        if (!doc.exists) return;
        unitBase = Number(doc.data().unitBase) || 0;
      }
      await C.fstore.collection('prep_batches_gieogieo').doc(batchId).update({ qtyRemaining: Math.max(0, unitBase) });
    } catch (err) { console.warn('[UnitEngine] đồng bộ qtyRemaining BTP lỗi', batchId, err); }
  }

  // Thay cho fifoReverseAllocations — nhận thêm itemId (đã sẵn có ở mọi call site hiện tại)
  // vì RT lưu theo path riêng từng item, không suy ra được itemId chỉ từ containerId như bên
  // Firestore trước đây. `coll` = collection Firestore để đồng bộ (STOCK_CONTAINERS_COLL mặc
  // định, 'prep_batches_gieogieo' cho BTP).
  // [BUG "reverse nuốt lỗi" — FIX] Trước đây hàm này LUÔN return bình thường (không throw) kể
  // cả khi transaction RTDB lỗi, hoặc khi một allocation "không còn tem nào để hoàn vào" bị bỏ
  // qua — caller (vd _reverseIngredientConsumptionPOS) thấy await không throw thì coi
  // unitsTouched=true, sau đó suy currentStock từ tổng unit; nhưng phần bị bỏ qua đó KHÔNG nằm
  // trong bất kỳ unit nào, nên suy từ unit sẽ làm nó biến mất vĩnh viễn (recompute THAY THẾ
  // toàn bộ, không cộng dồn). Giờ trả về { appliedQty, totalQty } để caller biết CHÍNH XÁC đã
  // áp dụng được bao nhiêu — chỉ tin tưởng suy từ unit khi appliedQty === totalQty (100%).
  // NL đang khoá cân cho mẻ chế biến → KHÔNG hoàn kho được (bill phải được giữ, làm lại sau khi chốt mẻ). Mã riêng để các tầng trên không nuốt.
  function _uePrepLocked() {
    const e = new Error('NL đang chờ cân — chưa thể hoàn kho');
    e.code = 'PREP_LOCKED';
    return e;
  }
  async function unitEngineReverseAllocations(itemId, allocations, coll, idemKey) {
    coll = coll || STOCK_CONTAINERS_COLL;
    const totalQty = (allocations || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
    if (!itemId || !allocations || !allocations.length) return { appliedQty: 0, totalQty: 0 };
    const netByUnit = {};   // để đồng bộ Firestore đúng 1 lần/unit sau khi transaction RT xong
    const finalByUnit = {}; // [BUG#4] unitBase MỚI của từng unit sau transaction — dùng thẳng
                             // cho _ueSyncQtyRemainingClamped, không đọc lại Firestore (tránh race).
    let appliedQty = 0;
    let prepLocked = false;
    try {
      await _ueActiveUnitsRef(itemId).transaction(current => {
        const map = current || {};
        prepLocked = !!(coll===STOCK_CONTAINERS_COLL && map.__prepLock);
        if(prepLocked)return;
        Object.keys(netByUnit).forEach(k => delete netByUnit[k]); // reset mỗi lượt retry
        Object.keys(finalByUnit).forEach(k => delete finalByUnit[k]);
        appliedQty = 0;
        const atChg = C.now();
        let ai = -1;
        // [v9] idemKey: mỗi khoản hoàn mang dấu `idemKey#i` ghi NGAY trên node nhận (cùng transaction) — lượt hoàn thứ hai cùng khoá (lượt chậm / giành lại claim /
        // lượt phục hồi) thấy dấu thì coi là đã hoàn, KHÔNG cộng lại.
        const markOf = i => idemKey ? idemKey + '#' + i : null;
        const applyTo = (node, qty, key) => {
          node.unitBase = (Number(node.unitBase) || 0) + qty;
          if (coll === 'prep_batches_gieogieo') _ueChgPush(node, atChg, qty);
          if (key) { const ro = Array.isArray(node.revOps) ? node.revOps.slice(-19) : []; ro.push(key); node.revOps = ro; }
        };
        for (const a of allocations) {
          ai++;
          const uid = a.containerId || a.unitId;
          const qty = Number(a.qty) || 0;
          if (!qty) continue;
          const key = markOf(ai);
          if (key && Object.keys(map).some(k => k !== '__prepLock' && map[k] && Array.isArray(map[k].revOps) && map[k].revOps.indexOf(key) >= 0)) { appliedQty += qty; continue; }
          if (map[uid] && !map[uid].discardPending) {
            applyTo(map[uid], qty, key);
            netByUnit[uid] = (netByUnit[uid] || 0) + qty;
            finalByUnit[uid] = map[uid].unitBase;
            appliedQty += qty;
            continue;
          }
          // Tem gốc không còn trong RT (đã báo hết/đóng) — hoàn vào tem đang mở CŨ NHẤT hiện
          // tại theo đúng thứ tự FIFO, không FIFO lại từ đầu, không suy luận lại (quyết định
          // của chủ quán khi bàn thiết kế).
          const stillOpen = Object.keys(map).filter(id=>id!=='__prepLock' && !map[id]?.discardPending)
            .sort((x, y) => (map[x].openedAt || 0) - (map[y].openedAt || 0));
          if (!stillOpen.length) {
            // KHÔNG cộng vào appliedQty — phần này không nằm trong unit nào cả, caller phải tự
            // cộng thẳng vào currentStock (xem ghi chú đầu hàm).
            console.warn('[UnitEngine] hoàn kho: item', itemId, 'không còn tem nào đang mở để hoàn vào, bỏ qua', a);
            continue;
          }
          const target = stillOpen[0];
          applyTo(map[target], qty, key);
          netByUnit[target] = (netByUnit[target] || 0) + qty;
          finalByUnit[target] = map[target].unitBase;
          appliedQty += qty;
        }
        return Object.keys(map).length ? map : null;
      });
    } catch (err) {
      if(prepLocked)throw _uePrepLocked();
      console.warn('[UnitEngine] reverseAllocations lỗi RTDB', itemId, err);
      return { appliedQty: 0, totalQty }; // lỗi hẳn transaction — coi như KHÔNG có gì được áp dụng
    }
    if(prepLocked)throw _uePrepLocked();
    Object.keys(netByUnit).forEach(uid => {
      C.fstore.collection(coll).doc(uid)
        .update({ unitBase: C.FieldValue.increment(netByUnit[uid]) })
        .catch(err => console.warn('[UnitEngine] đồng bộ unitBase Firestore (hoàn kho) lỗi', uid, err));
      if (coll === 'prep_batches_gieogieo') _ueSyncQtyRemainingClamped(uid, finalByUnit[uid]);
    });
    return { appliedQty, totalQty };
  }

  // [BUG "hoàn Unit trước, ghi ledger sau → retry hoàn đôi" — FIX] unitEngineReverseAllocations()
  // cộng thẳng vào RT NGAY khi gọi, không chờ bước ghi ledger reversal mà CALLER tự làm ngay sau
  // đó. Nếu bước ghi ledger đó thất bại THẬT SỰ (không phải mất ACK — Firestore chưa hề commit),
  // một lượt retry gọi lại từ đầu (vd claim 'failed' của bill_deletion_claims cho phép thử lại) sẽ
  // gọi unitEngineReverseAllocations() THÊM MỘT LẦN NỮA cho ĐÚNG allocations đó — RT được cộng 2
  // lần trong khi ledger reversal (lần này mới thành công) chỉ ghi đúng 1 dòng. Unit "hồi sinh"
  // nhiều hơn số thực đã bán ra, sai không có cách nào tự phát hiện.
  //
  // Giữ 1 bản ghi "claim" CỐ ĐỊNH theo (nguồn gốc nghiệp vụ + item) — vd orderId+itemId khi xoá
  // bill — để RT chỉ được cộng ĐÚNG MỘT LẦN cho mỗi claimId, bất kể phần ghi ledger phía sau có bị
  // gọi lại bao nhiêu lần. claimId PHẢI ổn định qua các lần retry (do caller tự ghép, thường là
  // referenceId + loại item + itemId/prepId).
  //
  // [BUG "claim get-rồi-set không atomic — vẫn race" — FIX] TRƯỚC ĐÂY: đọc claim bằng .get() rời,
  // rồi mới .set() SAU KHI đã credit RT — 2 lượt gọi gần nhau (double-tap, hoặc duyệt + retry chạy
  // gần như đồng thời) đều có thể đọc thấy "chưa có claim" TRƯỚC KHI lượt nào kịp .set(), nên cả 2
  // đều tự cho phép mình credit — RT bị cộng 2 lần dù claim cuối cùng chỉ lưu 1 bản ghi. Giờ bước
  // "giành quyền" (chuyển claim từ không-tồn-tại sang 'claiming') chạy trong 1 Firestore
  // transaction — 2 transaction cùng đọc "chưa tồn tại" thì Firestore CHỈ cho ĐÚNG MỘT cái commit,
  // cái còn lại tự động retry và lần này đọc trúng bản đã 'claiming'/'done' của đối thủ, không tự
  // cho mình credit nữa (đúng cơ chế compare-and-swap, không phải suy đoán).
  // [FIX #2] Ngưỡng takeover claim hoàn kho — claim 'claiming' quá cũ (app crash/bị OS kill
  // đúng giữa lúc giành claim và lúc ghi 'done') coi như của một lượt đã chết, cho lượt sau
  // giành lại thay vì kẹt vĩnh viễn ở ambiguous:true (xem 2 nhánh comment ngay dưới giải thích
  // vì sao trước đây cố ý KHÔNG takeover — hệ quả là mất hẳn, không có đường tự phục hồi).
  // Rộng rãi (2 phút) so với một lượt claim khoẻ mạnh (RTDB transaction + tối đa 3 lần retry
  // trong unitEngineReverseAllocations/_ueRetryAsync, tổng cộng dưới ~2 giây) — cửa sổ vẫn có
  // rủi ro double-credit nếu app A chỉ CHẬM bất thường (>2 phút) chứ chưa chết hẳn, nhưng đó là
  // tình huống cực hiếm hơn hẳn "kẹt vĩnh viễn, mất luôn" mà bản cũ chấp nhận.
  const REVERSAL_CLAIM_STALE_MS = 2 * 60 * 1000;

  // [Sửa lỗi 1] Lỗi "đang có lượt hoàn khác giữ tem" — nơi gọi giữ bill / báo đợi rồi làm lại.
  function _ueReversalBusy() {
    const e = new Error('đang có lượt hoàn kho khác cho bill này — đợi 2 phút rồi xoá lại');
    e.code = 'REVERSAL_BUSY';
    return e;
  }

  async function _ueClaimedReverseAllocations(claimId, itemId, allocations, coll, idemKey) {
    const totalQty = (allocations || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
    if (!allocations || !allocations.length) return { appliedQty: 0, totalQty: 0 };
    const claimRef = C.fstore.collection('reversal_unit_claims_gieogieo').doc(claimId);
    let iAmClaimer = false, existingData = null, tookOver = false;
    try {
      await C.fstore.runTransaction(async t => {
        const doc = await t.get(claimRef);
        if (doc.exists) {
          const data = doc.data();
          existingData = data;
          // Claim 'claiming' còn tươi → tôn trọng, không giành. [Sửa lỗi 1] Tuổi claim lấy từ
          // claimedAt (số), không có thì từ `at` (ISO); không rõ tuổi thì coi là quá hạn — nay lượt xoá
          // bill DỪNG khi gặp claim đang giữ (xem _ueReversalBusy), không giành thì kẹt bill vĩnh viễn.
          const age = typeof data.claimedAt === 'number' ? C.now() - data.claimedAt
            : (Number.isFinite(Date.parse(data.at)) ? C.now() - Date.parse(data.at) : Infinity);
          if (data.status === 'claiming' && age < REVERSAL_CLAIM_STALE_MS) return;
          // Còn lại: status !=='claiming' lạ (không phải 'done') hoặc 'claiming' đã quá cũ —
          // coi là của một lượt đã chết, giành lại.
          if (data.status === 'done') return; // đã xong hẳn — không có gì để giành
          tookOver = true;
        }
        iAmClaimer = true;
        t.set(claimRef, _st({ status: 'claiming', itemId, claimedAt: C.now(), at: new Date(C.now()).toISOString() }), { merge: true });
      });
    } catch (err) {
      // [BUG "acquisition-transaction lỗi vẫn fallback như 'chưa hoàn'" — FIX] TRƯỚC ĐÂY trả thẳng
      // {appliedQty:0} khi bản thân bước giành claim lỗi (mất mạng giữa chừng) — coi như "chắc chắn
      // chưa hoàn" y hệt lỗi đã vá ở nhánh 'claiming' bên dưới: người khác có thể ĐÃ giành xong và
      // ĐÃ hoàn RT thật, chỉ là lượt đọc/giao dịch này của mình lỗi trước khi biết kết quả. Trả
      // ambiguous:true để caller KHÔNG cộng thêm untrackedPendingDelta (tránh hoàn đúp), chỉ recompute.
      console.warn('[UnitEngine] giành claim hoàn Unit lỗi — KHÔNG hoàn để tránh hoàn đúp', claimId, err);
      return { appliedQty: 0, totalQty, ambiguous: true };
    }
    if (!iAmClaimer) {
      // Lượt khác đã/đang xử lý claimId này. Đã xong (status:'done', có appliedQty) thì dùng đúng
      // kết quả đó.
      if (existingData && existingData.status === 'done') {
        // 'done' thiếu appliedQty (dữ liệu cũ): lượt kia đã xong → coi như hoàn đủ, không coi là "chưa rõ".
        if (typeof existingData.appliedQty !== 'number') return { appliedQty: totalQty, totalQty };
        return { appliedQty: Number(existingData.appliedQty) || 0, totalQty: Number(existingData.totalQty) || totalQty };
      }
      // [BUG "fallback claiming biến 1 lần credit thành 2 lần tồn" — FIX] status vẫn 'claiming'
      // (chưa có 'done') — KHÔNG THỂ biết chắc RT đã được hoàn hay chưa: người thắng claim có thể
      // đã hoàn RT xong nhưng chết đúng lúc ghi 'done', hoặc chưa kịp hoàn gì cả. TRƯỚC ĐÂY trả
      // thẳng {appliedQty:0} khiến caller coi là "chắc chắn chưa hoàn" rồi cộng thêm vào
      // untrackedPendingDelta — nếu RT THẬT SỰ đã được hoàn ở lượt kia thì thành hoàn đúp (RT +
      // untrackedPendingDelta cùng cộng 1 khoản). Giờ trả `ambiguous:true` để caller KHÔNG cộng gì
      // thêm (an toàn hơn: lỡ mất đúng lượng hoàn đó còn dễ phát hiện/sửa qua kiểm kê hơn là cộng
      // đúp âm thầm), chỉ trigger recompute để tự phản ánh đúng RT hiện có.
      return { appliedQty: 0, totalQty, ambiguous: true };
    }
    // [FIX #2] Ghi cảnh báo durable khi TAKEOVER một claim cũ — đây là dấu hiệu có lượt trước
    // đã chết giữa chừng (crash/mất mạng/OS kill app). Không chặn luồng hoàn kho, chỉ để Quản lý
    // biết mà đối soát nếu ngờ có double-credit (rủi ro rất nhỏ, xem chú thích REVERSAL_CLAIM_STALE_MS).
    if (tookOver) {
      C.fstore.collection('alerts_gieogieo').add(_st({
        type: 'reversal_claim_takeover', severity: 'warning', status: 'new',
        claimId, itemId, businessDate: C.businessDate(), createdAt: new Date(C.now()).toISOString(),
        title: `Claim hoàn kho "${claimId}" kẹt quá ${Math.round(REVERSAL_CLAIM_STALE_MS / 60000)} phút — đã giành lại để hoàn tiếp`,
        previousClaimedAt: (existingData && existingData.claimedAt) || null,
        note: 'Lượt trước có thể đã crash/mất mạng giữa lúc hoàn kho. Lượt này đã giành lại claim và tiếp tục hoàn — nếu nghi ngờ RT bị cộng đúp (rất hiếm), đối soát bằng kiểm kê.'
      })).catch(() => {});
    }
    let r;
    try { r = await unitEngineReverseAllocations(itemId, allocations, coll, idemKey); }
    catch (err) {
      // NL đang khoá cân: chưa hoàn gì cả → NHẢ claim để lần xoá bill sau (khi hết khoá) hoàn được ngay, không chờ claim quá hạn.
      if (err && err.code === 'PREP_LOCKED') await claimRef.delete().catch(e2 => console.warn('[UnitEngine] không nhả được claim hoàn kho', claimId, e2));
      throw err;
    }
    // [BUG cùng trên — FIX] Thử lại vài lần trước khi chấp nhận ghi 'done' lỗi — thu hẹp tối đa cửa
    // sổ "RT đã hoàn thật nhưng claim vẫn kẹt ở claiming" (không thể triệt tiêu hoàn toàn vì RTDB
    // và Firestore không thể chung 1 transaction, nhưng retry giảm mạnh khả năng gặp phải).
    await _ueRetryAsync(() => claimRef.set(_st({ status: 'done', appliedQty: r.appliedQty, totalQty: r.totalQty, itemId, at: new Date(C.now()).toISOString() }), { merge: true }))
      .catch(err => console.warn('[UnitEngine] ghi claim hoàn Unit lỗi (không ảnh hưởng RT đã hoàn)', claimId, err));
    return r;
  }

  // Gọi SAU KHI submitOpenContainer đã ghi Firestore status:'open' thành công (hoặc SAU KHI
  // một mẻ BTP vừa hoàn thành — coi như "mở" luôn). Hấp thụ toàn bộ nợ (unitBase<0) của các
  // unit ĐANG MỞ KHÁC của cùng item trong RT, đóng (finish) chúng lại bên Firestore, unit mới
  // gánh phần nợ còn dư (có thể vẫn âm nếu nợ > dung tích unit mới) — đúng ví dụ mục 8 spec,
  // mở rộng cho trường hợp có nhiều unit cùng gánh nợ song song. `coll` = collection Firestore
  // (STOCK_CONTAINERS_COLL mặc định cho nguyên liệu, 'prep_batches_gieogieo' cho BTP).
  async function unitEngineOnOpen(containerId, c, coll) {
    coll = coll || STOCK_CONTAINERS_COLL;
    const itemId = c.itemId;
    const capacity = Number(c.baseQty) || 0;
    let absorbedIds = [];
    let absorbedAlreadyFinished = {}; // [BUG#1 FIX] id -> đã được "báo hết" thủ công từ trước chưa
    let newUnitBase = capacity;
    let alreadyOpen = false; // [RACE FIX] xem chú thích trong transaction
    try {
      await _ueRetryAsync(() => _ueActiveUnitsRef(itemId).transaction(current => {
        const map = current || {};
        // [RACE FIX — idempotent] containerId ĐÃ có sẵn trong RT nghĩa là unit này đã được mở
        // (bởi chính lượt gọi này retry lại, hoặc — nghiêm trọng hơn — một máy khác đã thắng
        // race mở cùng mã này trước). TUYỆT ĐỐI không ghi đè unitBase về lại capacity ở đây:
        // số hiện có có thể đã bị trừ bởi các lượt bán xen giữa, ghi đè sẽ "hồi sinh" hàng đã
        // bán mất. Coi như no-op, giữ nguyên state, không hấp thụ nợ lần 2.
        if (map[containerId]) {
          alreadyOpen = true;
          newUnitBase = Number(map[containerId].unitBase) || 0;
          absorbedIds = [];
          absorbedAlreadyFinished = {};
          return current;
        }
        // [BTP — ÂM CHỜ ĐỐI CHIẾU] Lô BTP mới = đúng số cân sau khi nấu (số thật lúc đó), KHÔNG
        // gánh khoản âm của lô cũ. Khoản âm để nguyên trên lô cũ, đối chiếu ở bước cân BTP cuối
        // ca (xem prepShortageAskIfNeeded). Nguyên liệu có tem vẫn hấp thụ nợ FIFO như cũ.
        const debtIds = coll === 'prep_batches_gieogieo' ? []
          : Object.keys(map).filter(k => k !== '__prepLock' && Number(map[k].unitBase) < 0);
        const totalDebt = debtIds.reduce((s, k) => s + Math.abs(Number(map[k].unitBase) || 0), 0);
        absorbedIds = debtIds;
        absorbedAlreadyFinished = {};
        debtIds.forEach(k => {
          absorbedAlreadyFinished[k] = !!map[k].finishedDebt;
          delete map[k]; // nợ đã được gánh hết, gỡ khỏi RT — Firestore đóng nốt bên dưới
        });
        newUnitBase = capacity - totalDebt;
        map[containerId] = {
          code: c.code || '', itemName: c.itemName || '', unit: c.unit || '',
          unitBase: newUnitBase, capacity, openedAt: C.now()
        };
        return map;
      }));
    } catch (err) {
      // Thử lại 3 lần vẫn lỗi — Firestore đã 'open'/'active' nhưng RT không biết unit này, hệ
      // thống sẽ "mù" với nó ở lượt trừ kho kế tiếp. Báo NGAY cho nhân viên biết để xử lý tay
      // (báo Quản lý ghi nhận thủ công), không để lỗi trôi âm thầm trong console.
      console.error('[UnitEngine] onOpen lỗi RTDB sau 3 lần thử', itemId, err);
      C.hooks.report('⚠️ Mở ' + (c.code || 'tem này') + ' xong nhưng lỗi đồng bộ — hàng vẫn dùng được', 'Mở mã: lỗi đồng bộ tồn', { ref: c.code || '', itemName: c.itemName || '' });
      return;
    }
    if (absorbedIds.length) {
      const nowISO = new Date(C.now()).toISOString();
      await Promise.all(absorbedIds.map(oldId => {
        // [BUG#1 FIX] Unit này đã được nhân viên "báo hết" thủ công từ trước (Firestore đã là
        // 'finished' với đúng finishedBy/finishedAt/finishReason gốc, RT chỉ CÒN GIỮ LẠI để chờ
        // hấp thụ nợ — xem unitEngineFinishOpenUnit) — giờ nợ đã được unit mới gánh xong, chỉ cần
        // xoá số nợ, TUYỆT ĐỐI không ghi đè finishedBy/finishedAt/finishReason đã có (mất dấu vết
        // ai/khi nào thật sự báo hết). Ngược lại (chưa từng qua 'báo hết', Firestore vẫn 'open',
        // nợ tự phát sinh do bán vượt) thì mới cần TỰ đóng unit đó — như logic cũ.
        const closeFields = absorbedAlreadyFinished[oldId]
          ? { unitBase: 0 }
          : (coll === 'prep_batches_gieogieo'
              ? { status: 'used_up', unitBase: 0, qtyRemaining: 0 } // trạng thái BTP dùng 'used_up', không phải 'finished'
              : { status: 'finished', finishedAt: nowISO, finishedBy: 'unit_engine_carry_forward', finishReason: 'fifo_debt_absorbed', wasteBase: 0, wasteBasis: 'unit_engine_carried', needsReview: false });
        return C.fstore.collection(coll).doc(oldId).update(closeFields)
          .catch(err => console.warn('[UnitEngine] không đóng được unit nợ cũ', oldId, err));
      }));
    }
    const newFields = coll === 'prep_batches_gieogieo' ? { unitBase: newUnitBase, qtyRemaining: Math.max(0, newUnitBase) } : { unitBase: newUnitBase };
    await C.fstore.collection(coll).doc(containerId)
      .update(newFields).catch(err => console.warn('[UnitEngine] đồng bộ unitBase unit mới lỗi', containerId, err));
  }

  // Gọi TRƯỚC KHI submitFinishContainer ghi Firestore status:'finished'. Gỡ tem khỏi RT (đọc
  // lại số dư mới nhất ngay lúc gỡ — tránh lệch nếu vừa có lượt bán khác ghi thêm giữa lúc mở
  // form và lúc bấm xác nhận), rồi tự tính waste trực tiếp từ unitBase — không cần tái dựng
  // qua tồn sổ/tồn lịch sử/chai nguyên như bản cũ (đó là cơ chế bù cho việc "2 sổ không đồng
  // bộ", Unit Engine không còn 2 sổ nữa nên không cần bù).
  async function unitEngineFinishOpenUnit(id, c, staffEmp, lyDo, daQuet, ref, prepBatchId, silent) {
    const nowISO = new Date(C.now()).toISOString();
    const itemId = c.itemId;
    let finalUnitBase = Number(c.unitBase);
    if (!isFinite(finalUnitBase)) finalUnitBase = Number(c.baseQty) || 0; // tem chưa từng qua v2 (chưa có unitBase) — coi như còn nguyên
    // [RACE FIX] Trước đây đọc RT bằng once('value') RỒI MỚI update()/remove() — 2 bước RIÊNG,
    // không atomic: giữa lúc đọc và lúc ghi, một lượt bán khác (unitEngineAllocateConsumption)
    // có thể đã trừ thêm vào unitBase, nhưng finalUnitBase ở đây vẫn dùng số ĐỌC TRƯỚC đó, ghi
    // hao hụt sai (thừa số đã bán mất giữa chừng). Gộp đọc + quyết định (giữ lại nếu nợ / xoá
    // nếu không) + ghi vào MỘT lần .transaction() — callback có thể chạy lại nhiều lần nếu có
    // tranh chấp, finalUnitBase luôn được cập nhật lại theo đúng lần chạy CUỐI (thắng cuộc).
    try {
      await _ueActiveUnitsRef(itemId).child(id).transaction(current => {
        if (current && typeof current.unitBase === 'number') finalUnitBase = current.unitBase;
        // [BUG#1 FIX cũ] Tem đang NỢ (unitBase<0) thì GIỮ LẠI node RT (đánh dấu finishedDebt để
        // unitEngineOnOpen() biết đây là unit đã 'finished' đúng cách, không cần đóng lại/không
        // được đè finishedBy) — nợ đó cần chờ tem mới hấp thụ, xoá khỏi RT sẽ mất carry-forward.
        // Không nợ thì xoá hẳn (return null).
        if (finalUnitBase < 0) {
          return {
            code: (current && current.code) || c.code || '', itemName: (current && current.itemName) || c.itemName || '',
            unit: (current && current.unit) || c.unit || '', capacity: (current && current.capacity) || Number(c.baseQty) || 0,
            openedAt: (current && current.openedAt) || C.now(), unitBase: finalUnitBase, finishedDebt: true
          };
        }
        return null;
      });
    } catch (err) {
      // [BUG "Finish fallback dùng số cache cũ" — FIX] Trước đây lỗi ở bước này chỉ console.warn
      // rồi VẪN tiếp tục dùng finalUnitBase (số Firestore CŨ, có thể lệch xa số RT thật — ví dụ
      // đã bán bớt giữa lúc mở form và lúc bấm xác nhận) để chốt 'finished' + ghi WASTE. Số hao
      // hụt sai này sẽ được ghi vào sổ như thật, không cách nào phát hiện lại sau đó. Giờ lỗi ở
      // bước RT (nguồn thật) thì KHÔNG được đoán — dừng hẳn, để nhân viên bấm lại (RTDB
      // transaction tự retry sẵn cho tranh chấp thông thường, lỗi lọt tới đây là lỗi kết nối
      // thật sự, thử lại tay là đúng cách xử lý).
      console.error('[UnitEngine] không đọc/gỡ được RT lúc báo hết — DỪNG, không đoán số', err);
      throw new Error('Lỗi kết nối khi báo hết — CHƯA ghi nhận gì, thử lại');
    }

    const waste = Math.max(0, finalUnitBase);
    const isDebt = finalUnitBase < 0;

    // [BUG "RT commit xong nhưng Firestore commit fail" — FIX] RT ở trên ĐÃ đổi xong (gỡ hẳn
    // hoặc chuyển finishedDebt) — nếu bước ghi Firestore này fail mà bỏ mặc, Firestore sẽ mãi
    // kẹt ở 'open' với unitBase cũ trong khi RT đã coi như xong, tạo "unit ma": không còn trong
    // RT (recompute không đếm), nhưng Firestore vẫn nói đang mở (các màn đọc thẳng Firestore, vd
    // lock "1 bao mở", vẫn thấy nó). Thử lại vài lần (mạng chập chờn thường qua khỏi); còn lỗi
    // thật thì throw để nhân viên bấm lại — hàm này đã tự idempotent với RT (chạy lại không hỏng
    // gì thêm: waste>=0 thì remove() lần 2 vô hại, nợ thì đọc lại đúng node finishedDebt đã có).
    try {
      await _ueRetryAsync(() => ref.update({
        status: 'finished', finishedAt: nowISO, finishedBy: staffEmp.fullName,
        finishedByEmployeeId: staffEmp.id,
        finishReason: lyDo, finishScanned: !!daQuet,
        unitBase: finalUnitBase, // giữ lại số cuối cùng (có thể âm) để soi lại lịch sử nếu cần
        // Đang nấu: số trên sổ chưa trừ mẻ. Chưa thể gọi phần dương này là hao hụt;
        // giữ dấu vết để đối chiếu mã cũ và mã mới ở chính mẻ đang giữ khóa.
        wasteBase: prepBatchId ? 0 : waste,
        wasteBasis: prepBatchId ? 'prep_reconcile_pending' : (isDebt ? 'unit_engine_debt' : 'unit_engine'),
        ...(prepBatchId ? {prepReconPendingBatchId:prepBatchId,prepReconFinishBookBase:finalUnitBase} : {}),
        needsReview: false, needsReviewReasons: []
      }));
    } catch (err) {
      console.error('[UnitEngine] báo hết: RT đã xong nhưng ghi Firestore lỗi sau 3 lần thử', id, err);
      throw new Error('RT đã ghi nhận nhưng lưu Firestore lỗi — bấm lại (an toàn, không ghi đôi)');
    }

    if(prepBatchId){
      if(!silent)C.hooks.notify('✅ Đã báo hết '+(c.code||'')+' — mã này sẽ được đối chiếu trong mẻ đang nấu');
    } else if (waste > 0) {
      try {
        await applyStockTransactionPOS({
          itemId, type: 'WASTE', qty: -waste,
          note: `Báo hết ${c.code || ''} — còn thừa ${fmtPrepQty(waste)} ${c.unit || ''}`
                + (daQuet ? ' (đã quét mã)' : ' (chọn tay)'),
          staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, referenceId: id,
          // RT/Firestore của CHÍNH tem này đã được cập nhật xong ở trên (xoá khỏi RT/đóng
          // 'finished') TRƯỚC lệnh này — suy lại currentStock từ tổng unit ngay là an toàn.
          deriveFromUnits: true
        });
      } catch (err) {
        console.error('[UnitEngine] báo hết: ghi hao hụt lỗi', err);
        C.hooks.report('⚠️ Đã chốt ' + (c.code || '') + ' nhưng ghi hao hụt lỗi', 'Báo hết: ghi hao hụt lỗi', { ref: c.code || '', itemName: c.itemName || '' });
      }
    } else if (isDebt) {
      // Nợ FIFO = tem này đã cạn TỪ TRƯỚC khi được quét báo hết (dùng vượt dung tích khai báo
      // vì chưa kịp mở tem mới) — KHÔNG phải hao hụt. Nếu chưa có tem mới nào hấp thụ nợ này
      // (unitEngineOnOpen), báo cho nhân viên biết còn tem chưa được quét mở.
      const missing = missingUnitsWarning(finalUnitBase, Number(c.baseQty) || 0);
      C.hooks.notify('⚠️ ' + (c.code || '') + ' đã hết trước khi báo — có thể còn '
            + (missing || 1) + ' chai/gói khác chưa được quét mở');
    } else {
      C.hooks.notify('✅ Đã chốt ' + (c.code || ''));
    }
    // Chỉ nhánh ghi WASTE thành công mới tự tính lại tồn (deriveFromUnits). Các nhánh còn lại
    // (không thừa, nợ, đang nấu, ghi hao hụt lỗi) vẫn vừa đổi RT/trạng thái tem — chốt lại
    // theo tổng mã ngay, không để tồn cũ nằm chờ tới lượt bán sau.
    await _ueRecomputeCurrentStock(itemId, STOCK_CONTAINERS_COLL).catch(() => {});
    C.hooks.fifoChanged().catch(() => {});
    if(!silent){C.hooks.closeScanSheet();C.hooks.openUnitsChanged();}
  }

  // Bảng 32 ký tự, đã bỏ I, L, O, U — bốn ký tự hay bị đọc nhầm thành 1, 1, 0, V khi nhìn tem in
  // nhiệt hoặc khi đọc cho nhau qua điện thoại.
  const MA_BANG_CHU = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // 8 ký tự = 32^8 ≈ 1,1 nghìn tỷ khả năng.
  // - Đoán: với khoảng 2.000 mã đang sống, xác suất bịa trúng một mã thật là 1 phần 550 triệu.
  // - Gõ sai: sai 1 ký tự sinh ra 248 chuỗi lân cận, xác suất một trong số đó là mã thật khoảng
  //   1 phần 2 triệu — nên gõ sai gần như luôn ra "không tìm thấy" chứ không ra NHẦM CHAI KHÁC.
  //   Vì vậy không cần thêm ký tự kiểm tra, chỉ tổ làm tem dài thêm.
  // getRandomValues cho byte 0–255, & 31 lấy 5 bit thấp: mỗi ký tự trúng đúng 8 giá trị byte nên
  // phân bố đều tuyệt đối (dùng % 32 trên số thập phân thì lệch).
  function sinhMaNgauNhien() {
    const a = new Uint8Array(8);
    C.randomBytes(a);
    let s = '';
    for (let i = 0; i < 8; i++) s += MA_BANG_CHU[a[i] & 31];
    return s;
  }

  // Ngẫu nhiên đã đủ để không trùng, nhưng vẫn đọc lại một lượt cho chắc: rẻ (1 lượt đọc, nhập
  // hàng thì thưa) và biến "gần như chắc chắn không trùng" thành "đã kiểm tra là không trùng".
  // KHÔNG dùng transaction/sổ đăng ký riêng: hai máy cùng lúc sẽ bốc hai chuỗi ngẫu nhiên khác
  // nhau, tranh chấp chỉ xảy ra ở xác suất 1 phần nghìn tỷ — thêm collection mới chỉ tạo thêm
  // một chỗ để hỏng (quyền Firestore, mạng) chứ không mua được gì.
  async function capMaKhoDuyNhat(coll, truong) {
    let code = sinhMaNgauNhien();
    for (let i = 0; i < 5; i++) {
      try {
        const snap = await C.fstore.collection(coll).where(truong, '==', code).limit(1).get();
        if (snap.empty) return code;
        console.warn('[mã] bốc trúng mã đã có, bốc lại:', code);
      } catch (err) {
        // Không kiểm tra được thì vẫn trả mã ngẫu nhiên — an toàn hơn mã cũ hàng tỷ lần, và
        // không được để việc kiểm tra hỏng làm kẹt cả lượt nhập hàng.
        console.warn('[mã] không kiểm tra được trùng, dùng thẳng mã ngẫu nhiên:', err);
        return code;
      }
      code = sinhMaNgauNhien();
    }
    return code;
  }

  // Giữ nguyên chữ ký hàm (itemId, itemName, businessDate) để không phải sửa nơi gọi; ba tham số
  // này nay không còn tham gia vào chuỗi mã nữa — đó chính là chỗ sửa lỗi.
  async function genStockContainerCode(itemId, itemName, businessDate) {
    return capMaKhoDuyNhat(STOCK_CONTAINERS_COLL, 'code');
  }

  function isTemTrackedNL(it) {
    return !!it && it.stockManaged !== false && (it.trackingMode === 'unit' || it.trackingMode === 'batch');
  }

  // kind: 'atomic_unscanned' | 'no_open_tem' | 'waste_no_tem' | 'reversal_outside_tem'
  async function logStockAnomalyPOS(docId, a) {
    try {
      const ref = docId ? C.fstore.collection(STOCK_ANOMALY_COLL).doc(docId) : C.fstore.collection(STOCK_ANOMALY_COLL).doc();
      await ref.set(_st({
        itemId: a.itemId, itemName: a.itemName || '', unit: a.unit || '',
        qty: Number(a.qty) || 0, kind: a.kind, txType: a.txType || '',
        note: a.note || '', referenceId: a.referenceId || '', staff: a.staff || '',
        businessDate: a.businessDate || C.businessDate(), createdAt: new Date(C.now()).toISOString(),
        source: _src(), status: 'open'
      }), { merge: true });
    } catch (err) { console.warn('[Sổ lệch] ghi lỗi', a && a.itemId, err); }
  }

  function isAtomicUnitItem(it) {
    if (!it || it.stockManaged === false || it.trackingMode !== 'unit') return false;
    if (String(it.unit || '').trim().toLowerCase() !== 'cái') return false;
    const pk = (it.packagingUnits || []).find(p => p.name === it.countUnitName);
    const baseQty = pk && Number(pk.baseQty) > 0 ? Number(pk.baseQty) : 1;
    return !(baseQty > 1);
  }

  /**
   * Sinh bản ghi container cho một dòng hàng vừa nhận.
   *
   * qtyBase = số lượng nhận, tính theo ĐƠN VỊ PHA CHẾ (ml/g/cái) — cùng đơn vị mà kho đang lưu.
   * Trả về mảng bản ghi đã ghi vào Firestore (kèm id), để nơi gọi in tem ngay.
   *
   * KHÔNG ném lỗi ra ngoài: nhập hàng đã ghi vào sổ kho rồi, không được để việc sinh tem hỏng
   * kéo theo cả phiếu nhập. Sinh trượt thì báo và để lại cho màn "Tem chờ dán" xử lý sau.
   */
  async function createContainersForReceipt({ item, qtyBase, staff, staffEmployeeId, refId, idPrefix }) {
    const mode = (item && item.trackingMode) || 'none';
    if (mode !== 'unit' && mode !== 'batch') return [];
    if (!(Number(qtyBase) > 0)) return [];

    // Đơn vị đếm do Quản lý chọn (Chai/Khay/...). Chưa chọn thì rơi về đơn vị pha chế — lúc đó
    // "một đơn vị" là 1ml, sinh tem cho từng ml là vô nghĩa, nên chặn ở mức 'unit'.
    //
    // [FIX] Ngoại lệ: đơn vị pha chế đã là "cái" (nguyên liệu đếm rời từng gói/hộp, không
    // phải đo bằng ml/g) thì bản thân 1 cái ĐÃ LÀ một đối tượng dán tem được — không cần
    // khai quy cách đóng gói nào cả. Trước đây điều kiện chặn dùng `baseQty <= 1`, nên dù
    // Quản lý CÓ chọn đúng quy cách (vd "1 gói = 1 cái") thì tỷ lệ quy đổi 1:1 vẫn bị hiểu
    // nhầm là "chưa chọn gì" và chặn luôn — im lặng không sinh tem, không báo lỗi cho ai
    // thấy. Giờ chỉ chặn khi THẬT SỰ chưa chọn quy cách nào (không tìm thấy `pk`) và đơn vị
    // pha chế không phải "cái".
    const isDiscreteUnit = String(item.unit || '').trim().toLowerCase() === 'cái';
    const pk = (item.packagingUnits || []).find(p => p.name === item.countUnitName);
    // Phần nhận về mà không có mã nào đỡ: tồn (= tổng mã) sẽ không có nó. Ghi Sổ lệch để còn
    // thấy — trước đây chỉ console.warn / toast rồi mất hẳn. Nhận hàng POS đã chặn trước các
    // trường hợp này (xem _submitPoReceiveImpl); đây là lưới cho đường gọi khác.
    const logNoTem = (qty, why) => logStockAnomalyPOS(idPrefix ? ('recv_notem_' + idPrefix).slice(0, 180) : null, {
      itemId: item.id, itemName: item.name, unit: item.unit, qty, kind: 'receive_no_tem', txType: 'RECEIVING',
      note: why, referenceId: refId || '', staff: staff || ''
    });
    if (mode === 'unit' && !pk && !isDiscreteUnit) {
      console.warn('[tem kho] bỏ qua: chưa chọn đơn vị đếm cho', item.name);
      await logNoTem(Number(qtyBase), 'Chưa khai đơn vị đếm (quy cách) — không sinh được tem nào');
      return [];
    }
    const baseQty = pk && Number(pk.baseQty) > 0 ? Number(pk.baseQty) : 1;

    const soDonVi = mode === 'batch' ? 1 : Math.floor(Number(qtyBase) / baseQty + 1e-9);
    const phanLe = mode === 'batch' ? 0 : Math.round((Number(qtyBase) - soDonVi * baseQty) * 100) / 100;
    if (soDonVi < 1) { await logNoTem(Number(qtyBase), 'Lượng nhận nhỏ hơn một đơn vị đếm — không sinh tem'); return []; }
    // Chặn trần cho khỏi lỡ tay sinh hàng nghìn bản ghi vì khai nhầm đơn vị (nhập "12000" trong
    // khi định nhập "12"). 60 tem đã là một lần giao hàng rất lớn với quán cà phê.
    if (soDonVi > 60) {
      C.hooks.notify(`⚠️ ${item.name}: ${soDonVi} tem là bất thường — kiểm tra lại đơn vị nhập, chưa sinh tem`);
      await logNoTem(Number(qtyBase), soDonVi + ' tem vượt trần 60 — chưa sinh tem nào');
      return [];
    }
    if (phanLe > 0.005) await logNoTem(phanLe, 'Phần lẻ không đủ một đơn vị đếm (' + baseQty + ') — không có mã đại diện');

    const businessDate = C.businessDate();
    const nowISO = new Date(C.now()).toISOString();
    const out = [];
    for (let i = 0; i < soDonVi; i++) {
      try {
        // [BUG "nhận hàng cộng kho 2 lần khi retry" — FIX] idPrefix cố định (truyền từ nơi biết
        // đây là ĐÚNG một lần nghiệp vụ, vd 1 phiếu nhận hàng) → id tem cũng CỐ ĐỊNH theo thứ tự,
        // bấm lại sau khi tưởng lỗi (server đã tạo tem thật) sẽ ĐỌC TRÚNG tem cũ thay vì sinh thêm
        // tem thứ 2 cho cùng một món hàng vật lý.
        const ref = idPrefix
          ? C.fstore.collection(STOCK_CONTAINERS_COLL).doc(`${idPrefix}_${i}`)
          : C.fstore.collection(STOCK_CONTAINERS_COLL).doc();
        if (idPrefix) {
          const existing = await ref.get();
          if (existing.exists) { out.push({ id: ref.id, ...existing.data() }); continue; }
        }
        const code = await genStockContainerCode(item.id, item.name, businessDate);
        const rec = {
          code,
          itemId: item.id, itemName: item.name || '',
          unit: item.unit || '',
          trackingMode: mode,
          countUnitName: mode === 'batch' ? (item.countUnitName || item.unit || '') : (item.countUnitName || ''),
          // 'unit'  → 1 đơn vị đếm; 'batch' → cả lô, giữ nguyên số lượng đã nhận
          baseQty: mode === 'batch' ? Number(qtyBase) : baseQty,
          // [UNIT ENGINE v2] unitBase = số dư CÒN LẠI của chính tem này, khởi tạo bằng dung
          // tích khai báo (baseQty) lúc còn sealed — không đổi cho tới khi mở (xem
          // unitEngineOnOpen).
          unitBase: mode === 'batch' ? Number(qtyBase) : baseQty,
          status: 'sealed',
          labelPrinted: false,
          openShelfLifeHours: Number(item.openShelfLifeHours) || 0,
          receivedAt: nowISO, receivedBy: staff || '', receivedByEmployeeId: staffEmployeeId || '',
          receiveRefId: refId || '', businessDate,
          openedAt: null, openedBy: null, expiresAt: null,
          finishedAt: null, finishedBy: null, finishReason: '', wasteBase: 0,
          // [MỚI] originalLabelId/labelStatus/labelEvents — theo dõi vòng đời TEM riêng biệt
          // với vòng đời TỒN KHO (status ở trên). originalLabelId KHÔNG BAO GIỜ đổi kể cả
          // sau nhiều lần cấp lại tem (xem missingLabelDoReprint() — "BÁO MẤT TEM").
          originalLabelId: code, labelStatus: 'active',
          labelEvents: [{ type: 'CREATED', timestamp: nowISO, employeeId: staffEmployeeId || '', oldLabelId: null, newLabelId: code, reason: '', referenceId: refId || '' }]
        };
        await ref.set(_st(rec));
        out.push({ id: ref.id, ...rec });
      } catch (err) {
        console.error('createContainersForReceipt: ghi bản ghi lỗi', err);
        C.hooks.notify(`⚠️ ${item.name}: sinh tem thứ ${i + 1} lỗi — vào "Tem chờ dán" sinh lại`);
        break;   // hỏng một cái thì dừng, đừng đẻ tiếp một loạt bản ghi mồ côi
      }
    }
    return out;
  }

  // Số lô — 8 ký tự ngẫu nhiên, cùng bảng chữ và cùng lý do với mã tem kho (xem
  // sinhMaNgauNhien). Dạng cũ `${prepItem.code}-${ddMM}-${seq}` mắc đúng bệnh của mã kho, mà
  // còn nặng hơn ở một chỗ: BTP nào quản lý chưa đặt `code` thì rơi hết về 'CB', tức MỌI lô của
  // MỌI thành phẩm chưa có mã, làm cùng ngày, đều mang chung một số lô.
  // Ngắn hơn dạng cũ (8 ký tự so với 12) nên chép tay lên tem vẫn nhanh như trước.
  async function genPrepBatchCode(prepItem, businessDate) {
    return capMaKhoDuyNhat('prep_batches_gieogieo', 'batchCode');
  }

  // Làm tròn 2 chữ số chỉ để HIỂN THỊ tỷ lệ/sản lượng cho gọn. Định lượng NGUYÊN
  // LIỆU thì KHÔNG làm tròn (xem renderPrepBatchForm) — quán cân bằng cân tiểu ly.
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  // Hiển thị định lượng: giữ số lẻ, chỉ bỏ đuôi .00 cho gọn mắt.
  function fmtPrepQty(n) {
    const v = Number(n) || 0;
    const r2 = Math.round(v * 100) / 100;
    return Number.isInteger(r2) ? r2.toLocaleString('vi-VN') : r2.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  // Lỗi ở luồng đối chiếu NL chia 2 loại để nhân viên KHÔNG phải tự xử lý:
  //   'reload' : mẻ vừa đổi ở máy khác/mất mạng → hệ thống TỰ tải lại màn hình.
  //   'manager': tình huống nhân viên không tự sửa được (tránh trừ hai lần...) → hệ
  //              thống TỰ gửi cảnh báo cho Quản lý (alerts_gieogieo), nhân viên chỉ
  //              cần biết là đã báo. Không đụng luồng bán hàng.
  function prepFlowError(msg, kind) { const e = new Error(msg); e.kind = kind; return e; }

  // [NL-RECON] Thu hồi khóa không còn chủ: mẻ đã xong/huỷ hoặc NL đã chốt cân thì thu
  // hồi ngay; mẻ chưa hề được ghi (bắt đầu dở, đứt mạng) thì chỉ thu hồi khi khóa >=10 phút.
  async function prepReconRecoverOrphan(itemId) {
    const lockRef=C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId);
    const [fsLock,rtLock]=await Promise.all([lockRef.get(),_ueActiveUnitsRef(itemId).child('__prepLock').once('value')]);
    const owners=[fsLock.exists?fsLock.data():null,rtLock.val()].filter(Boolean);
    for(const owner of owners) {
      if(!owner.batchId)continue;
      const batch=await C.fstore.collection('prep_batches_gieogieo').doc(owner.batchId).get();
      const old=C.now()-new Date(owner.at||0).getTime()>=600000;
      // Mẻ chưa ghi xong (đang bắt đầu dở trên máy khác): chờ đủ 10 phút mới thu hồi.
      if(!batch.exists){ if(old)await prepReconRelease(owner.batchId,[itemId]); continue; }
      // Mẻ đã hoàn thành/huỷ, hoặc NL này của mẻ đã chốt cân xong: khóa không còn giữ
      // gì nữa, thu hồi ngay chứ không bắt đợi.
      const b=batch.data(),row=(b.reconcileInputs||{})[itemId];
      if(b.status!=='cooking' || !row || row.status==='done')
        await prepReconRelease(owner.batchId,[itemId]);
    }
  }

  async function prepReconAcquire(batchId, rows) {
    if(!rows.length)return;
    const ids=[...new Set(rows.map(r=>r.itemId))].sort();
    const refs=ids.map(id=>C.fstore.collection(PREP_RECON_LOCK_COLL).doc(id));
    const claimed=[];
    try{
      for(const id of ids)await prepReconRecoverOrphan(id);
      // RT trước: allocator FIFO nhìn thấy khóa TRONG CÙNG transaction với trừ mã.
      for(const id of ids){
        let conflict=false;
        const result=await _ueActiveUnitsRef(id).transaction(cur=>{
          const map=cur||{};
          if(map.__prepLock && map.__prepLock.batchId!==batchId){conflict=true;return;}
          map.__prepLock={batchId,at:new Date(C.now()).toISOString()};return map;
        });
        if(!result.committed||conflict)throw new Error('NL '+(rows.find(r=>r.itemId===id).item.name)+' đang chờ cân ở mẻ khác');
        claimed.push(id);
      }
      await C.fstore.runTransaction(async t=>{
        const docs=await Promise.all(refs.map(ref=>t.get(ref)));
        docs.forEach((d,i)=>{if(d.exists && d.data().batchId!==batchId)
          throw new Error('NL '+(rows.find(r=>r.itemId===ids[i]).item.name)+' đang chờ cân ở mẻ khác.');});
        refs.forEach(ref=>t.set(ref,_st({batchId,at:new Date(C.now()).toISOString(),status:'pending'})));
      });
    }catch(err){await prepReconRelease(batchId,claimed).catch(()=>{});throw err;}
  }

  async function prepReconRelease(batchId, itemIds) {
    for(const id of itemIds){
      const ref=C.fstore.collection(PREP_RECON_LOCK_COLL).doc(id);
      await C.fstore.runTransaction(async t=>{const d=await t.get(ref);if(d.exists&&d.data().batchId===batchId)t.delete(ref);});
      // [FIX "NL đã cân xong vẫn báo đang chờ cân ở mẻ khác"] RTDB gọi hàm transaction
      // lần đầu với dữ liệu trong cache máy, thường là null khi node chưa được nghe. Trước
      // đây gặp null là `return` (undefined) → Firebase HUỶ transaction, không bao giờ hỏi
      // server → __prepLock nằm lại vĩnh viễn dù khóa Firestore đã xóa, và lần giành khóa
      // sau của NL đó luôn báo "đang chờ cân ở mẻ khác". Trả null để Firebase so với server
      // rồi gọi lại với dữ liệu thật; chỉ bỏ qua khi đã thấy dữ liệu thật mà khóa không phải của mẻ này.
      await _ueActiveUnitsRef(id).transaction(cur=>{
        if(!cur)return null;
        if(!cur.__prepLock||cur.__prepLock.batchId!==batchId)return;
        delete cur.__prepLock;
        // Hết khoá: bộ đếm "đã bán trong lúc khoá" của các mã không còn ý nghĩa — dọn để mẻ sau đếm từ 0.
        Object.keys(cur).forEach(k=>{ if(cur[k]&&typeof cur[k]==='object'&&cur[k].saleHeld!==undefined)delete cur[k].saleHeld; });
        return Object.keys(cur).length?cur:null;
      });
      try{ // NL không tem: dọn bộ đếm bán-trong-lúc-khoá trên chính NL (chỉ ghi khi thật sự có)
        const itemRef=C.fstore.collection('inventory_items_gieogieo').doc(id),itemDoc=await itemRef.get();
        if(itemDoc.exists&&itemDoc.data().prepSaleHeld!==undefined)await itemRef.update({prepSaleHeld:C.FieldValue.delete()});
      }catch(err){console.warn('[NL-RECON] chưa dọn được prepSaleHeld',id,err);}
    }
  }

  async function prepReconAssertFree(itemId, batchId) {
    const live=await _ueActiveUnitsRef(itemId).child('__prepLock').once('value');
    if(live.val() && live.val().batchId!==batchId)throw new Error('NL đang chờ cân của mẻ khác.');
    const d=await C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId).get();
    if(d.exists && d.data().batchId!==batchId)throw new Error('NL đang chờ cân của mẻ khác. Hoàn tất cân trước khi lấy tiếp.');
  }

  // heldAt (tuỳ chọn) = bộ đếm `saleHeld` của mã LÚC CÂN. Có heldAt thì phần đã BÁN sau lúc cân
  // (saleHeld hiện tại − heldAt) là chênh lệch hợp lệ: tồn RT hiện = mốc − phần đã bán; số ghi vào RT = số cân
  // − phần đã bán (hàng bán đi sau lúc cân vẫn phải bị trừ). Trả before = mốc lúc cân (không lẫn phần bán).
  async function prepReconSetUnit(itemId, unitId, qty, opId, expected, checkpoint, heldAt) {
    const parent=_ueActiveUnitsRef(itemId);
    const driftOf=u=>heldAt==null?0:Math.max(0,round2((Number(u&&u.saleHeld)||0)-Number(heldAt)));
    let writeQty=qty;
    const syncCopy=cp=>C.fstore.collection(STOCK_CONTAINERS_COLL).doc(unitId).update({unitBase:writeQty,
      ...(cp?{lastPrepCheckpoint:cp}:{})});
    // Đọc node CHA trước giao dịch. Transaction trực tiếp trên child có thể thấy
    // null từ cache dù child vẫn là 1.000 g trên máy chủ, rồi báo nhầm "tồn đã đổi".
    for(let i=0;i<4;i++){
      const snap=await parent.once('value'),map=snap.val()||{},live=map[unitId];
      if(!live){
        const err=new Error(`Mã ${unitId} không còn đang mở. Kiểm tra tem trước khi đối chiếu.`);
        err.code='PREP_RECON_STALE';throw err;
      }
      const amount=Number(live.unitBase)||0;
      const drift=driftOf(live);
      writeQty=round2(qty-drift);
      const lockBatch=map.__prepLock?.batchId;
      if(!lockBatch){
        const err=new Error('Khóa mẻ đã mất trước khi ghi mã '+(live.code||unitId)+'. Mở lại mẻ để kiểm tra, chưa ghi đè tồn.');
        err.code='PREP_RECON_STALE';throw err;
      }
      if(checkpoint?.batchId&&checkpoint.batchId!==lockBatch){
        const err=new Error('Mã '+(live.code||unitId)+' đang khóa cho mẻ khác. Chưa ghi tồn.');
        err.code='PREP_RECON_STALE';throw err;
      }
      const fsLock=await C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId).get();
      if(!fsLock.exists||fsLock.data().batchId!==lockBatch){
        const err=new Error('Khóa mẻ trong sổ không khớp khóa tồn của mã '+(live.code||unitId)+'. Chưa ghi tồn.');
        err.code='PREP_RECON_STALE';throw err;
      }
      if(live.lastPrepReconOp===opId){
        // Lượt này đã ghi rồi: tồn hiện phải = số vừa cân − phần đã bán sau lúc cân (nếu có).
        if(Math.abs(amount-(qty-drift))>0.015){
          throw prepFlowError(`Mã ${live.code||unitId} đã ghi lượt chốt này với ${fmtPrepQty(amount)}, khác số vừa cân`,'manager');
        }
        writeQty=amount;
        await syncCopy(live.lastPrepCheckpoint||checkpoint);
        return {before:Number(live.lastPrepReconBefore)||0,already:true};
      }
      if(Math.abs(amount-(expected-drift))>0.015){
        const err=new Error(`Mã ${live.code||unitId}: mốc trước ${fmtPrepQty(expected)}, tồn hiện ${fmtPrepQty(amount)}. Nạp mốc mới và cân lại.`);
        err.code='PREP_RECON_STALE';throw err;
      }
      let before=null,abortReason='';
      const result=await parent.transaction(cur=>{
        before=null;abortReason='';
        // Firebase có thể gọi callback lần đầu với null dù parent.once() vừa đọc
        // thấy mã trên server. Trả về đề xuất từ snapshot vừa đọc để server phát
        // hiện xung đột và gọi lại callback với trạng thái thật; return undefined
        // tại đây sẽ HỦY ngay giao dịch và để mẻ kẹt ở status processing.
        const source=cur==null?map:cur;
        if(!source.__prepLock||source.__prepLock.batchId!==lockBatch){abortReason='lock';return;}
        const unit=source[unitId];
        if(!unit){abortReason='missing';return;}
        if(unit.lastPrepReconOp===opId){
          if(Math.abs((Number(unit.unitBase)||0)-(qty-driftOf(unit)))>0.015){abortReason='op_conflict';return;}
          before=Number(unit.lastPrepReconBefore)||0;
          return source; // lượt trước đã ghi: tiếp tục đồng bộ/ghi sổ, không trừ hai lần
        }
        const dr=driftOf(unit);
        if(Math.abs((Number(unit.unitBase)||0)-(expected-dr))>0.015){abortReason='amount';return;}
        before=heldAt==null?(Number(unit.unitBase)||0):expected;
        writeQty=round2(qty-dr);
        return {...source,[unitId]:{...unit,unitBase:writeQty,lastPrepReconOp:opId,lastPrepReconBefore:before,
          ...(checkpoint?{lastPrepCheckpoint:checkpoint}:{})}};
      });
      if(result.committed){
        const committed=result.snapshot?.val()||(await parent.once('value')).val()||{};
        const saved=committed[unitId];
        if(!saved||saved.lastPrepReconOp!==opId||Math.abs((Number(saved.unitBase)||0)-writeQty)>0.015){
          const err=new Error('Giao dịch mã '+(live.code||unitId)+' không xác nhận được số đã lưu; chưa ghi sổ. Mở lại mẻ để kiểm tra.');
          err.code='PREP_RECON_STALE';throw err;
        }
        await syncCopy(saved.lastPrepCheckpoint||checkpoint);
        return {before,already:false};
      }
      if(abortReason==='lock'||abortReason==='op_conflict'){
        const err=new Error('Khóa hoặc lượt chốt mã '+(live.code||unitId)+' đã đổi trên máy khác; tải lại mẻ trước khi lưu.');
        err.code='PREP_RECON_STALE';throw err;
      }
      // Transaction bị hủy không đồng nghĩa tồn đã đổi. Đọc lại node cha và
      // thử tiếp; nếu thực sự đổi, lượt kế sẽ báo đúng số đang có.
      if(i<3)await new Promise(resolve=>setTimeout(resolve,120*(i+1)));
    }
    const err=new Error(`Chưa chốt được mã ${unitId} sau khi kiểm tra mốc. Số cân đã được giữ trong mẻ; bấm thử lưu lại.`);
    err.code='PREP_RECON_RETRY';throw err;
  }

  async function applyStockTransactionPOS({ itemId, type, qty, note, staff, staffEmployeeId, locationId, referenceId, meta, deriveFromUnits, txId, businessDate, measured, duringPrepLock }) {
    // [NL-RECON] Bao cả đường trừ không có tem; chỉ chặn khi một mẻ khác đang cân
    // NL này. Bước chốt của chính mẻ giữ khóa được phép ghi sổ.
    // [Bán trong lúc NL khoá cân] duringPrepLock chỉ hợp lệ cho dòng BÁN (CONSUMPTION): dòng sổ vẫn ghi, gắn
    // prepWindowBatchId của mẻ đang giữ khoá; NL không tem thì cộng bộ đếm prepSaleHeld trên chính NL.
    const soldInWindow = !!duringPrepLock && type === 'CONSUMPTION';
    if (!soldInWindow) await prepReconAssertFree(itemId, referenceId);
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(itemId);
    // [BUG "nhận hàng cộng kho 2 lần khi retry" — FIX] Mặc định vẫn tự sinh id ngẫu nhiên (mọi nơi
    // gọi hàm này từ trước không đổi hành vi). Nơi gọi nào TỰ có khái niệm "đây là đúng một lần
    // nghiệp vụ, bấm lại vẫn phải là NÓ" (vd nhận hàng — xem submitPoReceive) truyền sẵn `txId` cố
    // định; transaction dưới đây sẽ đọc lại đúng doc đó trước, thấy đã ghi rồi thì KHÔNG cộng/trừ
    // currentStock lần 2 — bấm lại sau khi mất gói ACK (server đã commit thật) trở thành no-op an
    // toàn thay vì cộng đúp.
    const txRef = txId ? C.fstore.collection('stock_transactions_gieogieo').doc(txId) : C.fstore.collection('stock_transactions_gieogieo').doc();
    // rule/packUnit tra TRƯỚC transaction (chỉ đọc cache trong bộ nhớ, không tốn round-trip Firestore
    // — Firestore transaction chỉ nên chứa các lệnh đọc/ghi thật sự cần thiết).
    // [FIX] atSource=true → giao dịch xảy ra ở KHO TỔNG, không phải ở quầy pha.
    // Dùng cho hao hụt lúc NHẬN HÀNG (hàng vỡ/hỏng khi giao tới): hàng đó chưa từng
    // được refill ra quầy, nên không được trừ tồn quầy và cũng không được đụng vào
    // cơ chế đếm refill (unrefilledConsumption / refillUncertain) của quầy — nếu
    // đụng sẽ bắt quầy vào "chế độ nghi ngờ" một cách vô cớ, làm nhiễu cảnh báo refill.
    const atSource = locationId === '__SOURCE__';
    // [CÂN CUỐI CA] measured=true: số lệch ĐO BẰNG CÂN tại quầy (hao hụt/dư cân cuối ca). Khác
    // WASTE ước lượng ("khoảng 1/2 hộp") vốn làm unrefilledConsumption mất căn cứ nên phải bật
    // refillUncertain — số đo được thì cộng thẳng vào unrefilledConsumption (hụt) hoặc trừ ra (dư),
    // không bắt quầy vào chế độ nghi ngờ.
    const isMeasured = !!measured && !atSource && (type === 'WASTE' || type === 'ADJUSTMENT');
    const rule = (!atSource && (type === 'CONSUMPTION' || type === 'WASTE' || isMeasured)) ? C.getRefillRule(itemId) : null;
    // [FIX BUG A] Tra rule cho CẢ 3 loại để biết vị trí cần cập nhật locationStock:
    //  · CONSUMPTION/WASTE → trừ ở rule.destLocationId (QUẦY PHA — nơi nhân viên thực
    //    tế lấy hàng ra dùng, đúng với việc mỗi ngày refill từ kho tổng sang quầy).
    //  · RECEIVING        → cộng vào rule.sourceLocationId (KHO TỔNG — hàng nhập về
    //    luôn vào kho tổng trước, sau đó mới refill dần ra quầy).
    // Nguyên liệu KHÔNG có Refill Rule thì không xác định được vị trí → chỉ cập nhật
    // currentStock như cũ, không đụng locationStock (tránh đoán bừa làm sai thêm).
    const locRule = C.getRefillRule(itemId);
    const result = await C.fstore.runTransaction(async (t) => {
      // [NL-RECON] Đọc khóa trong cùng transaction để không lọt giao dịch vừa
      // kiểm tra xong nhưng mẻ khác giành khóa ngay trước lúc ghi sổ.
      const activeLock=await t.get(C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId));
      let windowBatch = null;
      if(activeLock.exists && activeLock.data().batchId!==referenceId){
        if(!soldInWindow) throw new Error('NL đang chờ cân của mẻ khác — chốt mẻ đó trước khi đổi tồn');
        windowBatch = activeLock.data().batchId;
      }
      const itemDoc = await t.get(itemRef);
      if (!itemDoc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
      // [BUG "nhận hàng cộng kho 2 lần khi retry" — FIX] txId cố định + đã tồn tại nghĩa là ĐÚNG
      // giao dịch này đã ghi thành công ở một lượt gọi trước (kể cả khi promise của lượt đó reject
      // vì mất ACK) — không đụng gì tới currentStock/locationStock nữa, tránh cộng/trừ đúp.
      if (txId) {
        const txDoc = await t.get(txRef);
        if (txDoc.exists) return { alreadyApplied: true, refillAlert: null, uncertainAlert: null };
      }
      const itemData = itemDoc.data();
      // [NL-RECON] Nước máy lọc/đá tự làm không quản kho: công thức/giá vốn
      // vẫn đọc được, nhưng mọi CONSUMPTION/WASTE đều không tạo tồn âm ảo.
      if(itemData.stockManaged===false && (type==='CONSUMPTION'||type==='WASTE'))
        return {alreadyApplied:true,unmanaged:true,refillAlert:null,uncertainAlert:null};
      const current = Number(itemData.currentStock) || 0;
      // [TEM = SỰ THẬT] Món có tem mà khoản trừ này KHÔNG gắn được vào mã nào (không có tem
      // đang mở, món "cả cái" bị trừ ngoài cổng quét...) → KHÔNG trừ vào tồn (tồn = tổng mã),
      // ghi Sổ lệch sau transaction. Trừ tồn quầy/locationStock vẫn chạy như cũ.
      const temNL = isTemTrackedNL(itemData);
      // ADJUSTMENT không gắn mã cũng tính là ngoài tem: trước đây nó đổi currentStock rồi bị
      // recompute xoá mất ngay — âm thầm, không vết. Nơi nào thay đổi đã nằm trong tem (mở,
      // báo hết, cân lại mã, tìm lại mã...) phải truyền deriveFromUnits:true.
      const outsideTem = temNL && !deriveFromUnits && type !== 'RECEIVING';
      const next = outsideTem ? current : current + Number(qty);
      const updates = { currentStock: next, updatedAt: new Date(C.now()).toISOString() };
      let refillAlert = null;
      let uncertainAlert = null;
      let locDeducted = 0;      // số thực trừ được ở quầy (xem ghi chú ở nhánh CONSUMPTION/WASTE)
      let locDeductedAt = null; // trừ tại vị trí nào

      // [FIX BUG A] Cập nhật tồn theo VỊ TRÍ. Trước đây locationStock CHỈ được đụng
      // tới bởi TRANSFER (refill) → tồn ở quầy chỉ tăng mãi không bao giờ giảm khi
      // bán, tồn kho tổng chỉ giảm mãi không bao giờ tăng khi nhập. Hệ quả: màn
      // Refill hiện "tồn tại quầy" cao hơn thực tế rất nhiều → số gợi ý chuyển
      // (Target − tồn) tính ra 0 → nhân viên KHÔNG được gợi ý refill gì cả, và
      // checklist đóng ngày báo "0 nguyên liệu dưới mức tối thiểu" một cách giả tạo.
      if (locRule) {
        const locStock = itemData.locationStock || {};
        if (atSource) {
          // Hao hụt ngay tại kho tổng (vd vỡ khi nhận hàng) → trừ đúng kho tổng.
          const prevLoc = Number(locStock[locRule.sourceLocationId]) || 0;
          updates[`locationStock.${locRule.sourceLocationId}`] = Math.max(0, prevLoc + Number(qty));
        } else if (type === 'CONSUMPTION' || type === 'WASTE') {
          // qty của 2 loại này luôn ÂM → cộng thẳng là ra số đã trừ.
          // Chặn sàn 0: tồn theo vị trí âm là số liệu vô nghĩa với nhân viên, và
          // dữ liệu cũ vốn đã lệch sẵn nên rất dễ chạm âm ngay sau khi cập nhật.
          const prevLoc = Number(locStock[locRule.destLocationId]) || 0;
          const nextLoc = Math.max(0, prevLoc + Number(qty));
          updates[`locationStock.${locRule.destLocationId}`] = nextLoc;
          // [FIX] Ghi lại số THỰC SỰ trừ được ở quầy. Do có chặn sàn 0 ở trên, số
          // này có thể ÍT HƠN số theo định mức: quầy còn 50ml mà công thức cần
          // 100ml thì chỉ trừ được 50. Nếu không ghi lại, lúc xoá đơn sẽ hoàn đủ
          // 100ml và quầy tự sinh thêm 50ml từ không khí — đúng kiểu sai lệch âm
          // thầm mà cơ chế hoàn kho vốn sinh ra để tránh.
          locDeducted = prevLoc - nextLoc;
          locDeductedAt = locRule.destLocationId;
        } else if (type === 'RECEIVING') {
          const prevLoc = Number(locStock[locRule.sourceLocationId]) || 0;
          updates[`locationStock.${locRule.sourceLocationId}`] = Math.max(0, prevLoc + Number(qty));
        } else if (isMeasured && type === 'ADJUSTMENT') {
          // Dư đo được tại quầy (cân cuối ca) — quầy thật có nhiều hơn sổ.
          const prevLoc = Number(locStock[locRule.destLocationId]) || 0;
          updates[`locationStock.${locRule.destLocationId}`] = Math.max(0, prevLoc + Number(qty));
        }
      }
      if (rule) {
        const packUnit = C.getBiggestPackagingUnit(itemData);
        if (packUnit) {
          if (isMeasured) {
            // qty âm (hụt) → quầy đã vơi thêm đúng lượng đó; qty dương (dư) → vơi ít hơn công thức.
            const prevUnrefilled = Number((itemData.unrefilledConsumption || {})[rule.destLocationId]) || 0;
            const nextUnrefilled = Math.max(0, prevUnrefilled - Number(qty));
            updates[`unrefilledConsumption.${rule.destLocationId}`] = nextUnrefilled;
            const alreadyUncertain = !!(itemData.refillUncertain || {})[rule.destLocationId];
            if (!alreadyUncertain && Math.floor(nextUnrefilled / packUnit.baseQty) > Math.floor(prevUnrefilled / packUnit.baseQty)) {
              refillAlert = { itemName: itemData.name, packLabel: packUnit.label, destLocationName: rule.destLocationName };
            }
          } else if (type === 'CONSUMPTION') {
            // CỘNG DỒN unrefilledConsumption — số liệu LÝ THUYẾT theo công thức, chỉ đáng tin
            // khi KHÔNG có hao hụt xen giữa (xem nhánh WASTE bên dưới để hiểu lý do).
            const prevUnrefilled = Number((itemData.unrefilledConsumption || {})[rule.destLocationId]) || 0;
            const addQty = Math.abs(Number(qty)); // qty của CONSUMPTION luôn âm, cộng dồn theo trị tuyệt đối
            const nextUnrefilled = prevUnrefilled + addQty;
            updates[`unrefilledConsumption.${rule.destLocationId}`] = nextUnrefilled;
            // "Vừa vượt thêm 1 ngưỡng" = số lần đóng gói tính được TĂNG so với trước đó —
            // tránh báo lặp lại liên tục mỗi lần bán thêm 1 ly sau khi đã vượt ngưỡng lần đầu.
            // CHỈ báo theo kiểu "khẳng định" (🚚) khi KHÔNG đang ở chế độ nghi ngờ — nếu đang
            // nghi ngờ thì để nguyên, chờ nhân viên tự kiểm tra thay vì tin số liệu nữa.
            const alreadyUncertain = !!(itemData.refillUncertain || {})[rule.destLocationId];
            if (!alreadyUncertain) {
              const crossedBefore = Math.floor(prevUnrefilled / packUnit.baseQty);
              const crossedAfter = Math.floor(nextUnrefilled / packUnit.baseQty);
              if (crossedAfter > crossedBefore) {
                refillAlert = { itemName: itemData.name, packLabel: packUnit.label, destLocationName: rule.destLocationName };
              }
            }
          } else if (type === 'WASTE') {
            // [NEW — theo phản hồi người dùng] HAO HỤT làm số liệu `unrefilledConsumption`
            // MẤT CĂN CỨ: nhân viên chỉ ƯỚC LƯỢNG được đã đổ bao nhiêu (VD đổ thật 360ml
            // nhưng nhập "khoảng 1/2 hộp" = 500ml) — nếu CỘNG số ước lượng đó vào phép toán
            // để "sửa" lại thì chỉ thay 1 sai số bằng 1 sai số khác, KHÔNG làm số liệu đúng
            // hơn. Quyết định đúng hơn: KHÔNG cố sửa số bằng ước lượng — thay vào đó đánh
            // dấu "nghi ngờ" (`refillUncertain`), chuyển từ "tin công thức" sang "bắt buộc
            // nhân viên tự kiểm tra thực tế", duy trì cho tới khi có 1 lần Refill THẬT (mốc
            // chuẩn mới, biết chắc vừa thêm bao nhiêu) — xem applyStockTransferPOS bên dưới.
            const wasAlreadyUncertain = !!(itemData.refillUncertain || {})[rule.destLocationId];
            if (!wasAlreadyUncertain) {
              updates[`refillUncertain.${rule.destLocationId}`] = true;
              uncertainAlert = { itemName: itemData.name, destLocationName: rule.destLocationName };
            }
          }
        }
      }
      if (windowBatch && !temNL) updates.prepSaleHeld = round2((Number(itemData.prepSaleHeld) || 0) + Math.abs(Number(qty) || 0));
      t.update(itemRef, updates);
      const txData = {
        itemId, type, qty: Number(qty), resultingStock: next, note: note || '', staff: staff || '',
        // [MỚI] Bổ sung bill thiếu sau kết ca — businessDate CÓ THỂ được truyền lùi về đúng ngày
        // phát sinh (khác createdAt luôn là thời điểm ghi THẬT) để báo cáo doanh thu/giá vốn theo
        // ngày không lệch — xem startBackfillBill()/_backfillMode.
        createdAt: new Date(C.now()).toISOString(), businessDate: businessDate || C.businessDate(), status: 'posted', source: _src()
      };
      // staffEmployeeId — field MỚI song song `staff` (mục 2.1 "Migration"), để
      // sau này liên kết chính xác về employees_gieogieo/{id} (vd khi nhân viên
      // đổi tên) — chỉ set khi có (bản ghi qua luồng PIN mới), không migrate ngược
      // dữ liệu cũ trước khi có hệ thống PIN.
      if (staffEmployeeId) txData.staffEmployeeId = staffEmployeeId;
      if (locationId && !atSource) txData.locationId = locationId;
      if (atSource) txData.atSourceLocation = true; // đánh dấu hao hụt xảy ra ở kho tổng
      // referenceId — Giai đoạn 4: gắn về orderId (billCode) khi tx là CONSUMPTION tự sinh theo GOGS,
      // đúng field tuỳ chọn đã có sẵn trong schema mục 20 (Management dùng cùng field này).
      if (referenceId) txData.referenceId = referenceId;
      // Lưu kèm để lúc hoàn kho (xoá đơn) biết chính xác phải trả lại bao nhiêu
      // vào quầy, thay vì tính lại từ định mức rồi trả dư.
      if (locDeductedAt) { txData.locDeducted = locDeducted; txData.locDeductedAt = locDeductedAt; }
      // meta — các field mô tả SỰ KIỆN sinh ra giao dịch này (vd đổ ly thành phẩm:
      // món gì, size nào, mấy ly, lý do). Trước đây chỉ nhét vào chuỗi `note`, nên
      // app Quản lý muốn đếm "hôm nay đổ mấy ly" phải bóc tách chuỗi tiếng Việt —
      // vừa mong manh vừa không gom được nhiều dòng của cùng một lần đổ.
      if (meta) Object.assign(txData, meta);
      if (windowBatch) txData.prepWindowBatchId = windowBatch;   // bán trong lúc NL khoá cân cho mẻ này
      if (outsideTem) txData.outsideTem = true; // không trừ vào tồn — xem Sổ lệch
      if (isMeasured) txData.measured = true;
      t.set(txRef, _st(txData));
      return { refillAlert, uncertainAlert, temNL, outsideTem, txDocId: txRef.id,
        itemName: itemData.name || '', unit: itemData.unit || '', atomic: isAtomicUnitItem(itemData) };
    });
    if (result && result.outsideTem && !result.alreadyApplied && !atSource) {
      await logStockAnomalyPOS('tx_' + result.txDocId, {
        itemId, itemName: result.itemName, unit: result.unit, qty: Number(qty), txType: type,
        kind: type === 'ADJUSTMENT' ? 'manual_adjust'
          : result.atomic ? 'atomic_unscanned' : (type === 'WASTE' ? 'waste_no_tem' : 'no_open_tem'),
        note, referenceId, staff, businessDate
      });
    }
    // [BUG#3 FIX] `next` ở trên chỉ là số cộng/trừ TẠM (giữ để không có khoảng trống nếu recompute
    // lỗi) — khi nơi gọi đã CHẮC CHẮN vừa đụng vào đúng unit thật (deriveFromUnits=true, vd sau
    // unitEngineAllocateConsumption/unitEngineFinishOpenUnit), suy lại currentStock từ tổng unit
    // ngay để chốt số ĐÚNG, không dựa cộng dồn lý thuyết nữa. Không truyền (RECEIVING, hoặc
    // CONSUMPTION không có unit nào để phân bổ) thì giữ nguyên số vừa cộng/trừ ở trên.
    // [TEM = SỰ THẬT] Món có tem: mọi giao dịch (trừ RECEIVING — tem được sinh SAU bước này)
    // đều chốt lại tồn theo tổng mã, không để số cộng/trừ tay tồn tại lơ lửng.
    if (!result.alreadyApplied && (deriveFromUnits || (result.temNL && type !== 'RECEIVING'))) {
      await _ueRecomputeCurrentStock(itemId, STOCK_CONTAINERS_COLL).catch(() => {});
    }
    return result; // { refillAlert, uncertainAlert, alreadyApplied? } — dùng cho cảnh báo sớm lúc bán hàng / lúc ghi hao hụt
  }

  // ============================================================
  // [MỚI] ĐỒNG BỘ locationStock TỪ SỐ ĐẾM GIAO CA THẬT (handover_counts_gieogieo)
  //
  // GỐC RỄ ĐÃ VÁ: locationStock (tồn theo vị trí) chỉ được cộng/trừ qua TRANSFER/
  // CONSUMPTION/WASTE — KHÔNG có đường nào đưa nó về đúng số THẬT dù nhân viên đã
  // đếm mù đầu ca/cuối ca (mustCount) rất cẩn thận. Số đếm thật chỉ nằm trong
  // handover_counts_gieogieo, không hề chảy ngược lại locationStock. Hậu quả: một khi
  // locationStock đã trôi lệch (dù đã đếm bù bằng tay ở màn giao ca), MỌI phép tự kiểm
  // dựa trên nó — checklist "refill_below_min" (đầu ca lẫn cuối ca) và chặn đóng ca
  // thiếu refill (computeBlockingRefillItemsPOS) — vẫn đọc trúng con số cũ đã lệch,
  // im lặng báo "đủ hàng" dù có đếm thật hay không. Đây đúng là lý do "trước có báo,
  // giờ không thấy báo gì nữa" dù không ai đổi gì trong quy trình.
  //
  // CÁCH VÁ: ngay sau khi lưu xong đếm giao ca (mở ca ở _finalizeHandoverOpen, đóng ca
  // ở _submitHandoverCloseImpl), ghi THẲNG số đếm được vào locationStock tại đúng vị
  // trí — best-effort, không chặn luồng chính nếu lỗi (đếm giao ca đã lưu thành công
  // là việc quan trọng nhất, đồng bộ lại là bước dọn dẹp theo sau).
  // ============================================================
  async function setLocationStockFromCountPOS(itemId, locationId, qty, staffName) {
    if (!itemId || !locationId || !Number.isFinite(Number(qty))) return;
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(itemId);
    const txRef = C.fstore.collection('stock_transactions_gieogieo').doc();
    await C.fstore.runTransaction(async (t) => {
      // [NL-RECON] Không đặt lại số quầy của NL đang chờ cân mẻ.
      const lock=await t.get(C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId));
      if(lock.exists)throw new Error('NL đang chờ đối chiếu mẻ, chưa đặt lại tồn quầy');
      const doc = await t.get(itemRef);
      if (!doc.exists) return;
      const data = doc.data();
      const prev = Number((data.locationStock || {})[locationId]) || 0;
      t.update(itemRef, { [`locationStock.${locationId}`]: Number(qty), updatedAt: new Date(C.now()).toISOString() });
      t.set(txRef, _st({
        itemId, type: 'LOC_SET', qty: Number(qty) - prev,
        prevLocStock: prev, resultingLocStock: Number(qty),
        resultingStock: Number(data.currentStock) || 0,
        locationId, note: 'Tự động đặt lại theo số đếm giao ca',
        staff: staffName || '', createdAt: new Date(C.now()).toISOString(),
        businessDate: C.businessDate(), status: 'posted', source: _src()
      }));
    });
  }

  // ============================================================
  // [NEW] GIAI ĐOẠN 7 — Refill Engine (Transfer giữa các vị trí kho)
  // (POS_Management_Integration_Workflow.md, mục 2.5 + "Giai đoạn 7")
  //
  // QUYẾT ĐỊNH KIẾN TRÚC (xem chú thích đầy đủ ở applyStockTransfer() bên Management):
  // TRANSFER KHÔNG được đụng vào `currentStock` (tổng tồn kho toàn cửa hàng không đổi khi
  // chuyển nội bộ Kho tổng → Kệ) — chỉ cập nhật field mới `locationStock` (map trên chính
  // doc nguyên liệu) qua cùng cơ chế runTransaction. Vì vậy đây là hàm RIÊNG, không dùng
  // chung applyStockTransactionPOS() ở trên (hàm đó luôn cộng/trừ currentStock).
  // ============================================================
  async function applyStockTransferPOS({ itemId, fromLocationId, toLocationId, qty, note, staff, staffEmployeeId, referenceId, txId }) {
    if (fromLocationId === toLocationId) throw new Error('Vị trí nguồn và đích phải khác nhau');
    await prepReconAssertFree(itemId,referenceId);
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(itemId);
    // [BUG "refill retry double-transfer" — FIX] Mặc định vẫn tự sinh id ngẫu nhiên. Nơi gọi nào
    // tự biết "đây là ĐÚNG một lượt chuyển, bấm lại vẫn phải là NÓ" (xem _submitRefillLineImpl)
    // truyền sẵn `txId` cố định — bấm lại sau khi mất ACK (server đã commit thật) sẽ đọc trúng
    // dòng đã ghi và KHÔNG trừ/cộng locationStock lần 2.
    const txRef = txId ? C.fstore.collection('stock_transactions_gieogieo').doc(txId) : C.fstore.collection('stock_transactions_gieogieo').doc();
    await C.fstore.runTransaction(async (t) => {
      const lock=await t.get(C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId));
      if(lock.exists && lock.data().batchId!==referenceId)
        throw new Error('NL đang chờ cân của mẻ khác — chốt mẻ trước khi Refill');
      const itemDoc = await t.get(itemRef);
      if (!itemDoc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
      if (txId) {
        const txDoc = await t.get(txRef);
        if (txDoc.exists) return; // đã chuyển ở lượt trước rồi (bấm lại) — không cộng/trừ đúp
      }
      const itemData = itemDoc.data();
      const locStock = itemData.locationStock || {};
      const fromNext = (Number(locStock[fromLocationId]) || 0) - Number(qty);
      const toNext = (Number(locStock[toLocationId]) || 0) + Number(qty);
      const updates = {
        [`locationStock.${fromLocationId}`]: fromNext,
        [`locationStock.${toLocationId}`]: toNext,
        updatedAt: new Date(C.now()).toISOString()
      };
      // [NEW] Refill THẬT SỰ xảy ra → trừ bớt "khoản nợ" unrefilledConsumption tại đúng vị trí
      // đích, floor về 0 (không cho âm — refill nhiều hơn mức đã tiêu thụ ghi nhận thì chỉ về 0,
      // không "để dành" âm cho lần tiêu thụ sau, tránh số liệu khó hiểu).
      const prevUnrefilled = Number((itemData.unrefilledConsumption || {})[toLocationId]) || 0;
      updates[`unrefilledConsumption.${toLocationId}`] = Math.max(0, prevUnrefilled - Number(qty));
      // [NEW — theo phản hồi người dùng] Refill THẬT là MỐC CHUẨN MỚI (biết chắc vừa thêm bao
      // nhiêu, không còn là số ước lượng) → XOÁ cờ "nghi ngờ" đã bật bởi lần hao hụt trước đó
      // (nếu có). Từ đây hệ thống tin lại vào công thức cho tới khi có hao hụt mới.
      updates[`refillUncertain.${toLocationId}`] = false;
      t.update(itemRef, updates);
      const txData = {
        itemId, type: 'TRANSFER', qty: Number(qty), fromLocationId, toLocationId,
        resultingFromStock: fromNext, resultingToStock: toNext,
        note: note || '', staff: staff || '',
        createdAt: new Date(C.now()).toISOString(), businessDate: C.businessDate(), status: 'posted', source: _src()
      };
      if (staffEmployeeId) txData.staffEmployeeId = staffEmployeeId;
      if (referenceId) txData.referenceId = referenceId;
      // Chuyển nhiều hơn số hệ thống ghi ở nguồn. Không chặn (nhân viên đã được hỏi
      // lại ở màn Refill), nhưng để lại vết — đây đúng là cách tồn một vị trí tụt
      // xuống âm mà sau đó không ai lần ra nguyên nhân.
      if (fromNext < 0) txData.sourceWentNegative = true;
      t.set(txRef, _st(txData));
    });
    return txRef.id; // 🆕 GĐ4 kế hoạch V3: cho phép nơi gọi ghi resolvedRef trỏ đúng phiếu refill
  }

  // Trừ tồn bán thành phẩm + ghi ledger riêng (xem ghi chú ở phần "Nấu chế biến"
  // về lý do tách collection). Cho phép tồn âm — giống nguyên liệu thô: chặn ở đây
  // sẽ chặn cả việc thanh toán, mà bán hàng không bao giờ được chặn vì lý do kho.
  // [v7] Hai lượt CÙNG txId chạy chồng nhau (bấm đúp / bill gửi lại sau timeout) từng cùng vượt bước kiểm tra sổ rồi cùng trừ RT.
  // Nay: (1) tuần tự hoá theo txId trong cùng máy; (2) transaction ghi sổ đọc lại txRef — nếu máy khác đã ghi thì HOÀN đúng phần vừa phân bổ.
  // [v8] Hoàn phần RT vừa trừ THÊM do lượt trùng txId (máy khác đã ghi sổ trước). Kiểm tra hoàn ĐỦ; chưa đủ → việc phục hồi BỀN
  // (dup_recovery_gieogieo) + cảnh báo, làm lại bằng consume.recoverDuplicates(). kind: 'item' (NL, tem) | 'prep' (BTP, lô).
  const DUP_RECOVERY = 'dup_recovery_gieogieo';
  // [v9] Việc phục hồi: (1) khoản hoàn mang khoá idempotent theo opId NGAY TRÊN node RT (hai lượt chạy chồng / claim bị giành lại không thể cộng đôi);
  // (2) lượt phục hồi giành "thuê" 60 giây trên việc nên lượt khác không chạy chồng; (3) ghi việc lỗi (Firestore) thì giữ hàng đợi cục bộ
  // (bộ nhớ + localStorage) để consume.recoverDuplicates() ghi lại / chạy tiếp — không để mất dấu.
  const DUP_LEASE_MS = 60 * 1000, DUP_LOCAL_KEY = 'ue_dup_recovery_gieogieo';
  const _dupMem = new Map();
  function _dupLocalRead() {
    try { if (typeof localStorage !== 'undefined') { const a = JSON.parse(localStorage.getItem(DUP_LOCAL_KEY) || '[]'); if (Array.isArray(a)) a.forEach(r => { if (r && r.id && !_dupMem.has(r.id)) _dupMem.set(r.id, r); }); } } catch (e) { /* không có localStorage */ }
  }
  function _dupLocalSave() {
    try { if (typeof localStorage !== 'undefined') { if (_dupMem.size) localStorage.setItem(DUP_LOCAL_KEY, JSON.stringify(Array.from(_dupMem.values()))); else localStorage.removeItem(DUP_LOCAL_KEY); } } catch (e) { /* bỏ qua */ }
  }
  // Ghi việc lên Firestore (có thử lại); lỗi → giữ cục bộ. Trả true nếu đã lên Firestore.
  async function _dupWrite(rec) {
    try { await _ueRetryAsync(() => C.fstore.collection(DUP_RECOVERY).doc(rec.id).set(_st(rec), { merge: true })); _dupMem.delete(rec.id); _dupLocalSave(); return true; }
    catch (e) { _dupMem.set(rec.id, rec); _dupLocalSave(); console.warn('[UnitEngine] không ghi được việc phục hồi trừ trùng — giữ hàng đợi cục bộ', rec.id, e); return false; }
  }
  async function consumeCompensateDuplicate(kind, id, allocations, txId) {
    if (!allocations || !allocations.length) return { ok: true, appliedQty: 0 };
    const opId = P.key('dup', txId, C.now(), Math.floor(C.random() * 1e9));
    const nowISO = new Date(C.now()).toISOString();
    const rec = { id: opId, kind, itemId: id, txId, allocations, status: 'pending', attempts: 0, createdAt: nowISO, leaseAt: nowISO };
    await _dupWrite(rec);
    return _dupRun(rec);
  }
  async function _dupRun(rec) {
    const coll = rec.kind === 'prep' ? 'prep_batches_gieogieo' : STOCK_CONTAINERS_COLL;
    const attempt = Number(rec.attempts) || 0;
    let rv = null, err = null;
    // claim theo lượt (CAS chống chạy chồng), khoá idempotent theo THAO TÁC (opId) — chạy lại / claim bị giành lại cũng không cộng đôi.
    try { rv = await _ueClaimedReverseAllocations('dupfix_' + rec.id + '_' + attempt, rec.itemId, rec.allocations, coll, 'dupfix_' + rec.id); } catch (e) { err = e; }
    const full = rv && !rv.ambiguous && rv.appliedQty >= rv.totalQty - 1e-6;
    const now = new Date(C.now()).toISOString();
    if (full) {
      await _ueRecomputeCurrentStock(rec.itemId, coll).catch(() => {});
      Object.assign(rec, { status: 'done', doneAt: now, attempts: attempt + 1, appliedQty: rv.appliedQty }); await _dupWrite(rec);
      return { ok: true, appliedQty: rv.appliedQty };
    }
    // Hoàn được MỘT PHẦN (tem/lô không còn đủ chỗ nhận) hoặc chưa rõ/lỗi: làm lại an toàn (khoá idempotent), tối đa 5 lượt rồi chờ người xử lý.
    const status = attempt + 1 >= 5 ? 'needs_manual' : 'pending';
    Object.assign(rec, { status, attempts: attempt + 1, lastTryAt: now, leaseAt: '', lastError: err ? String(err.message || err) : (rv && rv.ambiguous ? 'claim chưa rõ' : ''), appliedQty: rv ? rv.appliedQty : 0 });
    await _dupWrite(rec);
    await _ueRetryAsync(() => C.fstore.collection('alerts_gieogieo').doc(P.key('dupfix', rec.id)).set(_st({ type: 'duplicate_deduction_unreversed', severity: 'danger', status: 'new', businessDate: C.businessDate(), createdAt: now,
      title: 'Trừ kho trùng chưa hoàn được — ' + (rec.kind === 'prep' ? 'BTP' : 'NL') + ' ' + rec.itemId, itemId: rec.itemId, kind: rec.kind, allocations: rec.allocations, opStatus: status,
      note: 'Cùng một giao dịch bị trừ hai lần; phần trừ thừa chưa hoàn được vào tem/lô. Hệ thống sẽ thử lại (consume.recoverDuplicates); nếu vẫn lỗi, chỉnh tồn tay.' }), { merge: true })).catch(() => {});
    return { ok: false, appliedQty: rv ? rv.appliedQty : 0 };
  }
  async function consumeRecoverDuplicates() {
    _dupLocalRead();
    const recs = new Map();
    try { (await C.fstore.collection(DUP_RECOVERY).where('status', '==', 'pending').get()).docs.forEach(d => recs.set(d.id, Object.assign({ id: d.id }, d.data()))); } catch (e) { console.warn('[UnitEngine] không đọc được việc phục hồi trừ trùng', e); }
    _dupMem.forEach((r, id) => { if (r.status === 'pending' && !recs.has(id)) recs.set(id, r); });
    let done = 0;
    for (const rec of recs.values()) {
      const lease = rec.leaseAt ? C.now() - (_dMs(rec.leaseAt) || 0) : Infinity;
      if (lease < DUP_LEASE_MS) continue;                                // đang có lượt khác xử lý — không chạy chồng
      rec.leaseAt = new Date(C.now()).toISOString();
      if (!(await _dupWrite(rec)) && !_dupMem.has(rec.id)) continue;
      const r = await _dupRun(rec);
      if (r.ok) done++;
    }
    return done;
  }
  const _prepTxChains = new Map();
  async function applyPrepConsumptionPOS(prepId, qty, note, referenceId, businessDate, txId, isBackfillAfterClose) {
    if (!txId) return _applyPrepConsumptionCore(prepId, qty, note, referenceId, businessDate, txId, isBackfillAfterClose);
    const key = prepId + '|' + txId;
    const prev = _prepTxChains.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(() => _applyPrepConsumptionCore(prepId, qty, note, referenceId, businessDate, txId, isBackfillAfterClose));
    _prepTxChains.set(key, run);
    try { return await run; } finally { if (_prepTxChains.get(key) === run) _prepTxChains.delete(key); }
  }
  async function _applyPrepConsumptionCore(prepId, qty, note, referenceId, businessDate, txId, isBackfillAfterClose) {
    const prepRef = C.fstore.collection('prep_items_gieogieo').doc(prepId);
    // [BUG "duplicate bill sau timeout có thể trừ kho BTP đúp" — FIX] txId cố định (khi caller
    // truyền, vd orderId+prepId từ applySalesConsumptionPOS) khiến việc gọi lại hàm này cho ĐÚNG
    // orderId đó (bill trùng key sau khi mất ACK — xem confirmPay()/finalizeSplitPay()) tự nhận ra
    // đã ghi rồi, không trừ đúp.
    const txRef = txId ? C.fstore.collection('prep_transactions_gieogieo').doc(txId) : C.fstore.collection('prep_transactions_gieogieo').doc();
    // [BUG "duplicate bill sau timeout vẫn trừ RT đúp" — FIX] Phải kiểm tra ledger đã ghi CHƯA
    // TRƯỚC KHI phân bổ FIFO — nếu allocate() chạy trước rồi mới để bước ghi sổ bên dưới tự nhận
    // ra "đã ghi rồi" và no-op, RT vẫn bị trừ THÊM một lần nữa ở bước allocate dù ledger không hề
    // bị ghi đúp (xem lỗi tương tự vừa vá ở applySalesConsumptionPOS).
    if (txId) {
      // [BUG "pre-check ledger fail-open" — FIX] TRƯỚC ĐÂY: đọc ledger lỗi (mất mạng/timeout, KHÁC
      // hẳn "đọc được và thấy chưa tồn tại") vẫn cho `alreadyDone=false` rồi CHẠY TIẾP FIFO — trong
      // khi "không đọc được" không hề đồng nghĩa "chắc chắn chưa ghi" (ledger có thể ĐÃ commit ở
      // lượt trước, chỉ là lần đọc lại này bị lỗi mạng). Nếu ledger thật ra đã tồn tại mà vẫn chạy
      // FIFO lần nữa, RT bị trừ đúp trong khi bước ghi sổ bên dưới tự nhận ra đã có rồi và no-op —
      // đúng lỗ hổng "lớp txId không tự cứu được" vì txId chỉ bảo vệ được BƯỚC GHI, không bảo vệ
      // được bước ALLOCATE chạy trước nó. Giờ FAIL-CLOSED: không xác minh được thì THÀ DỪNG HẲN
      // (ném lỗi, không trừ gì) còn hơn liều trừ tiếp.
      let txDoc;
      try { txDoc = await txRef.get(); }
      catch (checkErr) { throw new Error('Không xác định được trạng thái ledger BTP — không chạy FIFO: ' + (checkErr.message || checkErr)); }
      if (txDoc.exists) return;
    }
    // [UNIT ENGINE v2] Phân bổ vào đúng lô (RTDB) TRƯỚC khi ghi sổ, để đính kèm breakdown vào
    // transaction (unitAllocations) — cùng cơ chế với nguyên liệu thô, cho phép hoàn NGƯỢC
    // đúng lô lúc xoá đơn (bản cũ chỉ hoàn currentStock aggregate, không hoàn đúng lô — xem
    // _reversePrepConsumptionPOS).
    const unitAllocations = await unitEngineAllocateConsumption(prepId, Math.abs(qty), 'prep_batches_gieogieo', referenceId ? { type: 'order', id: referenceId, note, businessDate, backfillAfterClose: isBackfillAfterClose } : undefined)
      .catch(err => { console.warn('[UnitEngine] phân bổ lô BTP lỗi', prepId, err); return []; });
    let nextAfter = 0;   // tồn sau lượt bán theo số cộng/trừ tạm — âm = bán nhiều hơn tồn các lô
    let dupInTx = false;
    try {
      await C.fstore.runTransaction(async (t) => {
        const doc = await t.get(prepRef);
        if (!doc.exists) throw new Error('Bán thành phẩm không tồn tại');
        dupInTx = false;
        if (txId) { const ex = await t.get(txRef); if (ex.exists) { dupInTx = true; return; } }   // máy/lượt khác đã ghi giữa chừng
        const d = doc.data();
        // Có lô thì số tạm này bị recompute bên dưới chốt lại theo tổng lô. KHÔNG có lô nào
        // (bán trước khi nấu lô đầu tiên) → tồn không đổi, khoản bán vào "âm chờ đối chiếu"
        // (untrackedPendingDelta → pendingShortage), đối chiếu ở bước cân BTP cuối ca.
        const next = unitAllocations.length ? (Number(d.currentStock) || 0) - Math.abs(qty) : (Number(d.currentStock) || 0);
        nextAfter = next;
        const updates = { currentStock: next, updatedAt: new Date(C.now()).toISOString() };
        if (!unitAllocations.length) updates.untrackedPendingDelta = C.FieldValue.increment(-Math.abs(qty));
        t.update(prepRef, updates);
        t.set(txRef, _st({
          prepId, prepCode: d.code || '', prepName: d.name || '', unit: d.unit || '',
          type: 'CONSUMPTION', qty: -Math.abs(qty), resultingStock: next,
          note: note || '', referenceId: referenceId || null,
          createdAt: new Date(C.now()).toISOString(), businessDate: businessDate || C.businessDate(), source: _src(),
          ...(unitAllocations.length ? { unitAllocations } : {}),
          ...(isBackfillAfterClose ? { backfillAfterClose: true } : {})
        }));
      });
      if (dupInTx) {
        // Giao dịch này đã được ghi bởi lượt khác: hoàn đúng phần RT vừa trừ thêm (không trừ đôi), không ghi sổ lần nữa.
        let compensated = true;
        if (unitAllocations.length) {
          try { compensated = (await consumeCompensateDuplicate('prep', prepId, unitAllocations, txId)).ok; }
          catch (revErr) { compensated = false; console.error('[UnitEngine] hoàn phần trừ trùng (cùng txId) lỗi', prepId, revErr); }
        }
        return { unitAllocations: [], duplicate: true, compensated };
      }
      // [MỚI] Trả allocations ra ngoài — applySalesConsumptionPOS() dùng để ghép stockTrace
      // (đường truy xuất bill → tem/lô), không đổi hành vi cũ (trước đây không ai đọc giá trị
      // trả về của hàm này).
      // [v6] Bán nhiều hơn lô đang có (lô đi âm / không đủ lô / không có lô) → PHẢI suy tồn ngay để tồn không âm và khoản thiếu hiện vào
      // "âm chờ đối chiếu" — trước đây `return` đặt trước bước suy tồn phía dưới nên nhánh thành công không bao giờ chạy tới.
      // Bán đủ lô thì giữ nguyên (không thêm lượt đọc nào trên đường bán).
      const allocatedQty = unitAllocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
      if (!unitAllocations.length || allocatedQty + 1e-6 < Math.abs(qty) || nextAfter < -1e-6) await _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo').catch(() => {});
      return { unitAllocations };
    } catch (err) {
      // [BUG "RT trừ nhưng ledger fail — mất tồn" — FIX] Trước đây transaction ghi sổ này không
      // có try/catch: lỗi thì lô đã bị unitEngineAllocateConsumption() trừ ở RT rồi mà không ai
      // hoàn lại — mất tồn thật, không chỉ là log lỗi. Hoàn thẳng allocations đã phân bổ (đang
      // có sẵn trong tay, không cần dò ledger) rồi mới throw lại để caller biết dòng này lỗi.
      // Trước khi hoàn: đọc lại CHÍNH txRef đã tạo id sẵn ở trên — promise có thể reject vì mất
      // gói ack dù Firestore đã commit thật; nếu doc đó THẬT SỰ tồn tại thì transaction đã thành
      // công, tuyệt đối không được hoàn allocations (sẽ hoàn nhầm một giao dịch đã ghi sổ đúng).
      if (unitAllocations.length) {
        let actuallyCommitted = false;
        try { actuallyCommitted = (await txRef.get()).exists; }
        catch (checkErr) { console.warn('[UnitEngine] không kiểm tra lại được ledger BTP, KHÔNG hoàn để tránh hoàn nhầm', prepId, checkErr); actuallyCommitted = true; }
        if (!actuallyCommitted) {
          try {
            const rv = await unitEngineReverseAllocations(prepId, unitAllocations, 'prep_batches_gieogieo');
            if (rv.appliedQty >= rv.totalQty - 1e-6) await _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo').catch(() => {});
          } catch (revErr) { console.error('[UnitEngine] hoàn allocations sau khi ghi sổ BTP lỗi cũng lỗi luôn', prepId, revErr); }
        }
      }
      throw err;
    }
    // Luôn chốt lại tồn + pendingShortage theo tổng lô (kể cả khi không có lô nào — để khoản
    // âm chờ đối chiếu hiện ra ngay).
    await _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo').catch(() => {});
  }

  // ════════════════════════ E3 — HOÀN KHO KHI XOÁ BILL (chép từ posgieo.html) ════════════════════════
  // POS và Quản lý cùng gọi (consume.reverseOrder) — một cơ chế claim, một id dòng sổ hoàn.
  // ============================================================
  // [FIX] HOÀN KHO KHI XOÁ ĐƠN
  //
  // Lỗi cũ: delOrderConfirm() chỉ xoá bill khỏi RTDB. Nguyên liệu đã bị
  // applySalesConsumptionPOS() trừ vẫn mất vĩnh viễn → xoá vài đơn mỗi tháng là số
  // liệu kho lệch dần mà không tìm ra nguyên nhân.
  //
  // Vì sao viết hàm RIÊNG thay vì gọi applyStockTransactionPOS với qty dương:
  // hàm đó khi gặp type 'CONSUMPTION' luôn CỘNG DỒN `unrefilledConsumption` theo
  // TRỊ TUYỆT ĐỐI của qty — nên nếu hoàn kho bằng qty dương, bộ đếm "đã bán bao
  // nhiêu chưa refill" sẽ TĂNG thay vì giảm, làm cảnh báo refill sai hoàn toàn.
  // Ở đây phải TRỪ ngược bộ đếm đó (chặn sàn 0).
  //
  // Ledger: vẫn ghi type 'CONSUMPTION' nhưng qty DƯƠNG (tiêu hao âm = hoàn lại) để
  // tổng cộng dồn ledger tự ra đúng tồn kho, và giao dịch vẫn nằm đúng nhóm nghiệp
  // vụ nó sinh ra — không tạo type mới mà Management App chưa biết đọc.
  //
  // GIỚI HẠN CÓ CHỦ ĐÍCH: chỉ hoàn KHO. KHÔNG hoàn stamp/điểm đã tích và KHÔNG trả
  // lại voucher đã đánh dấu dùng — vì stamp có thể đã quy đổi thành ly miễn phí và
  // khách có thể đã dùng, đảo ngược tự động sẽ tạo sai lệch khó lần hơn. Hai việc
  // đó cần Quản lý xử lý tay trên Management App.
  // ============================================================
  // [BUG "xoá bill không await reverse" — FIX] Trả về { ok, failedCount } thay vì chỉ tự toast —
  // caller (delOrderConfirm) giờ AWAIT hàm này trước khi xoá bill khỏi RTDB, nên cần biết kết
  // quả thật để quyết định thông báo gì, không còn tự ý toast từ bên trong (tránh chồng toast).
  // Lượng + tem/lô CÒN PHẢI HOÀN của từng món khi xoá cả đơn = đã trừ − đã hoàn một phần trước đó.
  // Tem/lô: trừ theo reversedAllocations của các lượt hoàn trước; dòng hoàn cũ không lưu tem thì
  // co tỷ lệ allocations về đúng lượng ròng để không cộng vào tem nhiều hơn lượng cần hoàn.
  function prepareOrderReversalNetPOS(orderId, docs, idField, allocField, sep) {
    const gross = {}, back = {}, allocs = {}, backAlloc = {}, daHoanCu = new Set();
    docs.forEach(d => {
      const t = d.data(), k = t[idField];
      // [Sửa lỗi 2] Món đã được hoàn theo cách CŨ (Quản lý trước đây ghi ADJUSTMENT + reversal:true, id
      // ngẫu nhiên) → bỏ qua đúng món đó, không hoàn lần hai (như daHoanCu của bản Quản lý cũ).
      if (k && t.reversal === true && t.type === 'ADJUSTMENT' && !t.voided) { daHoanCu.add(k); return; }
      if (!k || t.type !== 'CONSUMPTION' || t.backfillNoStockEffect || t.voided) return;
      if (t.reversal === true) {
        if (d.id === 'reversal_' + orderId + sep + k) return;       // chính lượt xoá cả đơn
        // NL có tem mà lượt hoàn trước chỉ vào tem được một phần (outsideTem): phần chưa vào tem
        // chỉ là dòng Sổ lệch, tồn (= tổng mã) chưa hề nhận lại → lượt này vẫn phải hoàn phần đó.
        const daVao = t.outsideTem ? (Number(t.appliedToUnitsQty) || 0) : Math.abs(Number(t.qty) || 0);
        back[k] = (back[k] || 0) + daVao;
        (t.reversedAllocations || []).forEach(a => { const c = a.containerId || a.unitId; backAlloc[k + '|' + c] = (backAlloc[k + '|' + c] || 0) + (Number(a.qty) || 0); });
        return;
      }
      if (!(Number(t.qty) < 0)) return;
      gross[k] = (gross[k] || 0) + Math.abs(Number(t.qty) || 0);
      if (Array.isArray(t[allocField])) allocs[k] = (allocs[k] || []).concat(t[allocField]);
    });
    const qty = {};
    Object.keys(gross).forEach(k => {
      const n = round2(gross[k] - (back[k] || 0));
      if (n > 0.005) qty[k] = n;
      const list = [];
      const byC = {};
      (allocs[k] || []).forEach(a => { const c = a.containerId || a.unitId; byC[c] = (byC[c] || 0) + (Number(a.qty) || 0); });
      Object.keys(byC).forEach(c => { const q = byC[c] - (backAlloc[k + '|' + c] || 0); if (q > 0.005) list.push({ containerId: c, qty: q }); });
      const tong = list.reduce((a, x) => a + x.qty, 0);
      const f = tong > (qty[k] || 0) && tong > 0 ? (qty[k] || 0) / tong : 1;
      allocs[k] = qty[k] ? list.map(x => ({ containerId: x.containerId, qty: round2(x.qty * f) })).filter(x => x.qty > 0) : [];
    });
    daHoanCu.forEach(k => { delete qty[k]; });
    Object.keys(allocs).forEach(k => { if (!qty[k]) delete allocs[k]; });
    return { qty, allocs, gross, daHoanCu: [...daHoanCu] };
  }

  async function reverseSalesConsumptionPOS(order, orderId) {
    try {
      // [FIX #C — "hoàn đơn tính lại công thức thay vì đọc ledger gốc"] TRƯỚC ĐÂY hàm này gọi
      // computeConsumptionForOrder() để TÍNH LẠI tiêu hao theo công thức HIỆN TẠI rồi hoàn theo
      // số đó — sai ở 3 tình huống có thật, đúng loại bug mà _reversePrepBatchInputsPOS() (hoàn
      // mẻ BTP) đã tự vá từ trước bằng cách đọc ledger gốc thay vì tính lại (xem chú thích của
      // hàm đó): (1) Quản lý sửa định mức món GIỮA lúc bán và lúc xoá đơn — hoàn theo số MỚI
      // trong khi ledger ghi số CŨ, kho dư/hụt đúng phần chênh; (2) lúc bán bị chặn sàn 0 ở
      // locationStock (quầy pha) nên số trừ THẬT ít hơn định mức — hoàn theo định mức tự sinh
      // thêm hàng từ không khí; (3) một nguyên liệu bị XOÁ KHỎI công thức sau khi bán — tính lại
      // sẽ không còn thấy id đó để hoàn, mất dấu vĩnh viễn dù ledger vẫn còn dòng CONSUMPTION.
      // Giờ đọc thẳng đúng những dòng CONSUMPTION (chưa reversal) mà chính đơn này đã ghi lúc
      // bán — không cần biết công thức hiện tại là gì nữa.
      const [stockSnap, prepSnap] = await Promise.all([
        C.fstore.collection('stock_transactions_gieogieo').where('referenceId', '==', orderId).get(),
        C.fstore.collection('prep_transactions_gieogieo').where('referenceId', '==', orderId).get()
      ]);
      // Tính RÒNG: tổng đã trừ của đơn (bán + thêm topping) TRỪ ĐI những gì đã hoàn một phần trước
      // đó (bớt topping khi sửa đơn). Trước đây lấy tổng gộp → hoàn thừa; hoặc lượt bớt topping
      // dùng chung id nên lượt này bỏ qua cả món → hoàn thiếu. Dòng hoàn của CHÍNH lượt xoá cả
      // đơn (id reversal_{đơn}_...) không trừ — nó đã có thì hàm hoàn tự bỏ qua (idempotent).
      const net = prepareOrderReversalNetPOS(orderId, stockSnap.docs, 'itemId', 'fifoAllocations', '_ing_');
      const agg = net.qty, fifoMap = net.allocs, locBackMap = {};
      // [Sửa lỗi 3] Trả tồn QUẦY về ĐÚNG vị trí đã trừ lúc bán (locDeductedAt trên từng dòng), không theo
      // quy tắc châm hiện tại (có thể đã đổi, hoặc chưa nạp). Dòng cũ không có locDeductedAt → khoá ''
      // = vị trí theo quy tắc hiện tại (như trước).
      stockSnap.forEach(d => {
        const t = d.data();
        if (t.reversal === true || t.type !== 'CONSUMPTION' || !(Number(t.qty) < 0) || t.backfillNoStockEffect || t.voided) return;
        if (typeof t.locDeducted !== 'number') return;
        const m = locBackMap[t.itemId] || (locBackMap[t.itemId] = {});
        const loc = t.locDeductedAt || '';
        m[loc] = (m[loc] || 0) + t.locDeducted;
      });
      Object.keys(locBackMap).forEach(k => {
        const f = net.gross[k] > 0 ? (agg[k] || 0) / net.gross[k] : 0;
        Object.keys(locBackMap[k]).forEach(loc => { locBackMap[k][loc] = round2(locBackMap[k][loc] * f); });
      });
      const pnet = prepareOrderReversalNetPOS(orderId, prepSnap.docs, 'prepId', 'unitAllocations', '_prep_');
      const prepAgg = pnet.qty, prepUnitAllocMap = pnet.allocs;
      const note = 'Hoàn kho do ' + (C.app === 'quanly' ? 'Quản lý ' : '') + 'XOÁ ĐƠN' + (order && order.billCode ? ' — ' + order.billCode : '');
      const ingredientIds = Object.keys(agg);
      const prepIds = Object.keys(prepAgg);
      if (!ingredientIds.length && !prepIds.length) return { ok: true, failedCount: 0, ingredients: 0, preps: 0 };
      const results = await Promise.allSettled([
        ...ingredientIds.map(ingId => _reverseIngredientConsumptionPOS(ingId, agg[ingId], note, orderId, locBackMap[ingId], fifoMap[ingId])),
        ...prepIds.map(pid => _reversePrepConsumptionPOS(pid, prepAgg[pid], note, orderId, prepUnitAllocMap[pid]))
      ]);
      const failed = results.filter(r => r.status === 'rejected');
      const busy = failed.filter(f => f.reason && f.reason.code === 'REVERSAL_BUSY').length;
      if (failed.length) {
        console.warn('[Hoàn kho] Một số nguyên liệu hoàn thất bại:', failed.map(f => f.reason));
        // Cảnh báo BỀN vào Hộp thư (khác toast thoáng qua) — Quản lý chắc chắn thấy lại được dù
        // không kịp đọc toast, orderId vẫn tra được từ ledger dù bill đã bị xoá khỏi RTDB.
        // [Sửa lỗi 1] Chỉ "đang có lượt khác giữ tem" thì không phải lỗi — bill giữ nguyên, xoá lại sau.
        if (failed.length > busy) _ueWarnReverseFailed(orderId, order && order.billCode, failed.length - busy).catch(() => {});
      }
      C.hooks.fifoChanged().catch(() => {}); // xoá đơn có thể vừa "mở lại" phần tem chưa thật sự cạn
      const message = busy ? _ueReversalBusy().message : (failed.length ? String((failed[0].reason && failed[0].reason.message) || failed[0].reason) : '');
      // [Sửa lỗi B] Chỉ đánh dấu trace đã hoàn khi hoàn XONG hết — lỗi thì bill được giữ để xoá lại.
      if (failed.length) return { ok: false, failedCount: failed.length, busy, message, ingredients: ingredientIds.length, preps: prepIds.length };
      // [MỚI — Tuần 4 truy xuất] order_stock_traces_gieogieo (xem applySalesConsumptionPOS) đóng
      // băng allocations tại THỜI ĐIỂM BÁN — hoàn kho ở trên không hề sửa lại field đó, nên nếu
      // không đánh dấu, Bill ↔ Tem sẽ mãi mãi nói "bill này lấy từ tem X" dù đã hoàn/xoá thật.
      // Không xoá doc (vẫn còn giá trị lịch sử — "lúc bán từng lấy từ tem nào"), chỉ gắn cờ để
      // màn tra cứu biết KHÔNG còn hiệu lực với tồn kho hiện tại.
      await _ueMarkTraceReversed(orderId, { reversePartialFailure: false });
      return { ok: true, failedCount: 0, ingredients: ingredientIds.length, preps: prepIds.length };
    } catch (err) {
      console.warn('[Hoàn kho] reverseSalesConsumptionPOS lỗi:', err);
      _ueWarnReverseFailed(orderId, order && order.billCode, null).catch(() => {});
      return { ok: false, failedCount: null, message: String((err && err.message) || err) };
    }
  }

  // [BUG FIX — "xoá bill bổ sung trước kết ca lại CỘNG ẢO tồn kho"] applyBackfillConsumptionNoStock
  // Effect() (xem hàm đó) CỐ Ý không đụng currentStock/RT — bill dạng này chưa từng lấy hàng thật
  // ra khỏi kho theo Unit Engine, ledger chỉ ghi để đúng doanh thu/giá vốn NGÀY đó. Trước đây
  // delOrderConfirm() xoá MỌI bill đều gọi thẳng reverseSalesConsumptionPOS() — hàm đó tính lại
  // tiêu hao theo công thức rồi CỘNG THẲNG vào currentStock/RT, coi như "hoàn" một lượng hàng
  // CHƯA TỪNG bị trừ. Mỗi lần xoá một bill bổ sung kiểu này, kho ảo tăng lên đúng bằng công thức
  // của bill đó — sai theo chiều ngược hẳn với lỗi gốc mà tính năng backfill sinh ra để sửa.
  // Sửa: chỉ đánh dấu 'voided' lên đúng những dòng ledger backfillNoStockEffect của bill này
  // (không tạo giao dịch hoàn nào, vì có gì đâu mà hoàn) và gắn cờ reversed lên order_stock_traces.
  function _ueMarkTraceReversed(orderId, extra) {
    return C.fstore.collection('order_stock_traces_gieogieo').doc(orderId).set(_st({
      reversed: true, reversedAt: new Date(C.now()).toISOString(), ...(extra || {})
    }), { merge: true }).catch(err => console.warn('[stockTrace] đánh dấu reversed lỗi', orderId, err));
  }

  // opts.markTrace === false: KHÔNG đánh dấu trace (reverseOrder tự đánh dấu sau khi hoàn kho xong).
  async function _voidBackfillConsumptionPOS(orderId, opts) {
    try {
      const [stockSnap, prepSnap] = await Promise.all([
        C.fstore.collection('stock_transactions_gieogieo').where('referenceId', '==', orderId).get(),
        C.fstore.collection('prep_transactions_gieogieo').where('referenceId', '==', orderId).get()
      ]);
      const nowISO = new Date(C.now()).toISOString();
      const jobs = [];
      stockSnap.forEach(d => { if (d.data().backfillNoStockEffect) jobs.push(d.ref.update({ voided: true, voidedAt: nowISO, voidedReason: 'Bill bị xoá' })); });
      prepSnap.forEach(d => { if (d.data().backfillNoStockEffect) jobs.push(d.ref.update({ voided: true, voidedAt: nowISO, voidedReason: 'Bill bị xoá' })); });
      const results = await Promise.allSettled(jobs);
      const failedCount = results.filter(r => r.status === 'rejected').length;
      // [Sửa lỗi B] Trace chỉ đánh dấu sau khi huỷ dòng sổ xong hết.
      if (!failedCount && !(opts && opts.markTrace === false)) await _ueMarkTraceReversed(orderId);
      return { ok: failedCount === 0, failedCount };
    } catch (err) {
      // KHÔNG đụng currentStock/RT dù lỗi ở đây — bill xoá vẫn an toàn, chỉ là dòng ledger có thể
      // còn hiện trong báo cáo giá vốn ngày đó dù bill đã mất, đối soát tay nếu cần.
      console.warn('[Hoàn kho] _voidBackfillConsumptionPOS lỗi (không ảnh hưởng tồn kho):', err);
      return { ok: false, failedCount: null };
    }
  }

  // [BUG "xoá bill không await reverse" — FIX một phần] Cảnh báo BỀN (khác toast thoáng qua) khi
  // hoàn kho do xoá đơn thất bại một phần/toàn phần — orderId vẫn tra được từ
  // stock_transactions_gieogieo/prep_transactions_gieogieo (referenceId) dù bill đã bị xoá khỏi
  // RTDB, nên Quản lý vẫn đối soát lại được dù không kịp thấy toast.
  async function _ueWarnReverseFailed(orderId, billCode, failedCount) {
    try {
      await C.fstore.collection('alerts_gieogieo').add(_st({
        type: 'bill_delete_reverse_failed', severity: 'danger', status: 'new',
        businessDate: C.businessDate(), createdAt: new Date(C.now()).toISOString(),
        title: 'Xoá bill ' + (billCode || orderId) + ' nhưng hoàn kho ' + (failedCount ? 'lỗi ' + failedCount + ' dòng' : 'lỗi hoàn toàn'),
        orderId, billCode: billCode || '',
        note: 'Bill đã bị xoá khỏi hệ thống nhưng kho có thể chưa được hoàn đúng — đối soát bằng kiểm kê hoặc tra sổ theo referenceId=' + orderId
      }));
    } catch (err) { console.warn('[UnitEngine] ghi cảnh báo bill_delete_reverse_failed lỗi', orderId, err); }
  }

  // opKey (tuỳ chọn): khoá của RIÊNG lượt hoàn này, dùng cho id dòng sổ + claim. Mặc định =
  // referenceId (xoá cả đơn / huỷ mẻ). Hoàn MỘT PHẦN (bớt topping khi sửa đơn) phải truyền khoá
  // riêng — dùng chung id với lượt xoá cả đơn thì lượt xoá sau thấy "đã hoàn" và bỏ qua cả món.
  // [Sửa lỗi 3] Kế hoạch trả tồn QUẦY khi hoàn: { vị trí: { add: cộng lại locationStock, unref: trừ bộ đếm chờ refill } }.
  // locBack: {vị trí: lượng} (đúng nơi đã trừ — khoá '' = dòng cũ không ghi vị trí → theo quy tắc hiện tại),
  // hoặc số (bản cũ: số đã trừ ở vị trí theo quy tắc hiện tại), hoặc không có (trả đủ `back` theo quy tắc).
  function _ueLocBackPlan(locBack, back, rule) {
    const dest = rule && rule.destLocationId;
    const src = {};
    if (locBack && typeof locBack === 'object') {
      Object.keys(locBack).forEach(k => {
        const loc = k || dest; if (!loc) return;   // dòng cũ + không còn quy tắc: như trước, bỏ qua quầy
        src[loc] = (src[loc] || 0) + Math.max(0, Number(locBack[k]) || 0);
      });
    } else if (dest) src[dest] = typeof locBack === 'number' ? Math.max(0, locBack) : back;
    const locs = Object.keys(src), tong = locs.reduce((a, l) => a + src[l], 0);
    const plan = {};
    // Bộ đếm chờ refill: trừ đủ `back`, chia theo tỷ lệ lượng đã trừ ở từng vị trí (thường chỉ 1 vị trí).
    locs.forEach(l => { plan[l] = { add: src[l], unref: tong > 0 ? back * src[l] / tong : back / locs.length }; });
    return plan;
  }

  async function _reverseIngredientConsumptionPOS(itemId, consumedQty, note, referenceId, locBack, fifoAllocations, atomicScanned, opKey) {
    const revKey = opKey || referenceId || 'norefid';
    const back = Math.abs(Number(consumedQty) || 0);
    if (!back) return;
    // [BUG#3 FIX] Hoàn NGƯỢC đúng phần đã phân bổ FIFO cho (các) tem lúc trừ — đọc thẳng từ
    // breakdown đã lưu trên giao dịch gốc, không tính lại nên chính xác dù đã có xen lẫn
    // giao dịch khác giữa chừng. Trước đây KHÔNG await bước này (coi currentStock cộng/trừ
    // độc lập bên dưới mới là số quyết định) — giờ currentStock phải SUY RA từ tổng unit nên
    // phải await xong bước hoàn vào tem TRƯỚC mới biết tổng mới; lỗi ở bước này thì rơi về
    // cộng/trừ currentStock trực tiếp như cũ (transaction bên dưới), không chặn hoàn kho.
    let unitsTouched = false, claim = null;
    let appliedQty = 0; // phần đã hoàn được vào tem — phần còn lại mới là "hoàn ngoài tem"
    if (fifoAllocations && fifoAllocations.length) {
      try {
        // [BUG "hoàn Unit trước, ghi ledger sau → retry hoàn đôi" — FIX] claimId cố định theo
        // (referenceId + itemId) — bấm lại xoá đơn/huỷ mẻ sau khi bước ghi ledger reversal bên
        // dưới lỗi thật sẽ KHÔNG cộng RT lần 2, chỉ ghi nốt phần ledger còn thiếu.
        claim = await _ueClaimedReverseAllocations(revKey + '_ing_' + itemId, itemId, fifoAllocations);
        // Chỉ tin suy từ unit khi ÁP DỤNG ĐỦ 100% — thiếu 1 phần (transaction lỗi, hoặc không
        // còn tem nào để hoàn vào) mà vẫn suy từ unit sẽ làm đúng phần thiếu đó biến mất (xem
        // chú thích unitEngineReverseAllocations).
        unitsTouched = claim.appliedQty >= claim.totalQty - 1e-6;
        appliedQty = Number(claim.appliedQty) || 0;
      } catch (err) {
        // NL đang khoá cân: dừng hẳn (không ghi dòng "hoàn ngoài tem") để bill được giữ và hoàn lại sau.
        if (err && err.code === 'PREP_LOCKED') throw err;
        console.warn('[FIFO] hoàn phân bổ lỗi:', err);
      }
    }
    // [Sửa lỗi 1] ambiguous (lượt khác đang giữ claim / giành claim lỗi mạng): KHÔNG biết tem đã được
    // hoàn chưa → dừng, không ghi dòng hoàn. Trước đây coi như đã hoàn rồi ghi dòng hoàn → bill bị xoá
    // mà tem có thể chưa được cộng lại. Bill giữ nguyên; xoá lại sau 2 phút (claim quá hạn thì giành lại).
    if (claim && claim.ambiguous) throw _ueReversalBusy();
    // [FIX cùng đợt "KIT bột sữa/Sữa gạo âm ảo"] atomicScanned=true → khoản trừ gốc KHÔNG hề đi
    // qua RTDB (fifoAllocations rỗng là bình thường, không phải "không có tem nào"). Tem thật SẼ
    // được _reverseAtomicContainerFinish() trả về 'sealed' + tự recompute riêng — nhưng bước đó
    // (BƯỚC 3.5) chạy SAU hàm này (BƯỚC 3), nên KHÔNG dùng unitsTouched=true ở đây (sẽ recompute
    // sớm, lúc tem vẫn còn 'finished', hụt mất đúng phần chưa kịp trả). Chỉ cần coi khoản này
    // đã có tem lo (không ghi Sổ lệch "hoàn ngoài tem").
    const coveredByTem = unitsTouched || atomicScanned;
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(itemId);
    // [BUG "xoá đơn bấm lại sau khi xoá RTDB lỗi → hoàn đúp" — FIX] TRƯỚC ĐÂY id tự sinh ngẫu
    // nhiên: delOrderConfirm() cố ý cho bấm lại khi bước xoá bill khỏi RTDB lỗi (hoàn kho lúc đó
    // ĐÃ chạy xong rồi) — comment cũ ở delOrderConfirm tưởng _loadLocDeductedForOrderPOS() lọc bỏ
    // dòng reversal là đủ để không cộng dồn, nhưng đó chỉ là lọc dữ liệu ĐẦU VÀO (không tính lại số
    // cần hoàn 2 lần), KHÔNG chặn được bước ghi bên dưới tự chạy lại — currentStock/ledger vẫn bị
    // cộng thêm `back` một lần nữa. Giờ id CỐ ĐỊNH theo (referenceId + itemId): bấm lại đọc trúng
    // đúng dòng đã ghi, tự bỏ qua, không cộng đúp.
    const txRef = C.fstore.collection('stock_transactions_gieogieo').doc('reversal_' + revKey + '_ing_' + itemId);
    const locPlan = _ueLocBackPlan(locBack, back, C.getRefillRule(itemId));
    let revOutside = null; // [TEM = SỰ THẬT] hoàn ngoài tem → ghi Sổ lệch sau transaction
    let revTemNL = false;
    await C.fstore.runTransaction(async (t) => {
      revOutside = null;
      const itemDoc = await t.get(itemRef);
      if (!itemDoc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
      const existingTx = await t.get(txRef);
      if (existingTx.exists) return; // đã hoàn ở lượt trước rồi (bấm lại) — không cộng đúp
      const itemData = itemDoc.data();
      // [TEM = SỰ THẬT] Món có tem: tồn chỉ đổi qua tem. Không hoàn được vào tem nào thì KHÔNG
      // cộng thẳng tồn (khoản trừ gốc ngoài tem cũng đã không trừ vào tồn) — ghi Sổ lệch.
      const temNL = isTemTrackedNL(itemData);
      revTemNL = temNL;
      if (temNL && !coveredByTem) revOutside = { itemName: itemData.name || '', unit: itemData.unit || '' };
      const next = temNL ? (Number(itemData.currentStock) || 0) : (Number(itemData.currentStock) || 0) + back;
      const updates = { currentStock: next, updatedAt: new Date(C.now()).toISOString() };
      Object.keys(locPlan).forEach(loc => {
        // TRỪ ngược bộ đếm "đã tiêu hao chưa refill", chặn sàn 0 để không âm khi đơn
        // bị xoá sau một lần Refill đã reset bộ đếm.
        const prev = Number((itemData.unrefilledConsumption || {})[loc]) || 0;
        updates[`unrefilledConsumption.${loc}`] = Math.max(0, round2(prev - locPlan[loc].unref));
        // [FIX BUG A] Hoàn luôn tồn tại QUẦY — phải đối xứng với việc bán hàng đã trừ locationStock.
        const prevLoc = Number((itemData.locationStock || {})[loc]) || 0;
        updates[`locationStock.${loc}`] = round2(prevLoc + locPlan[loc].add);
      });
      t.update(itemRef, updates);
      t.set(txRef, _st({
        itemId, type: 'CONSUMPTION', qty: back, resultingStock: next,
        note: note || '', staff: C.app === 'quanly' ? 'Quản lý' : '', reversal: true, reversedOrderId: referenceId || null,
        createdAt: new Date(C.now()).toISOString(), businessDate: C.businessDate(), status: 'posted', source: _src(),
        // [Chốt semantics] Đánh dấu rõ hoàn này có thật sự vào đúng tem/lô hay chỉ cộng thẳng
        // currentStock (không có tem nào nhận) — 'full' vs 'untracked', không để trông giống
        // một lượt hoàn bình thường đã xong xuôi hoàn toàn khi thực ra là ngoại lệ. atomicScanned
        // xem như 'full' (tem thật sẽ được BƯỚC 3.5 hoàn riêng), dù chưa recompute ngay tại đây.
        reversalCoverage: coveredByTem ? 'full' : 'untracked',
        ...(revOutside ? { outsideTem: true } : {}),
        // Tem ĐÃ hoàn thật trong lượt này — lượt xoá cả đơn sau đó trừ ra, không hoàn trùng vào tem.
        // Chỉ lưu khi hoàn ĐỦ (hoàn thiếu thì không biết tem nào đã nhận); appliedToUnitsQty = lượng
        // thật sự vào tem — phần còn lại chưa vào tem nào nên lượt xoá cả đơn vẫn phải hoàn nó.
        ...(coveredByTem && fifoAllocations && fifoAllocations.length ? { reversedAllocations: fifoAllocations } : {}),
        ...(revTemNL ? { appliedToUnitsQty: coveredByTem ? back : round2(appliedQty) } : {}),
        ...(referenceId ? { referenceId } : {})
      }));
    });
    if (revOutside) {
      await logStockAnomalyPOS('rev_' + txRef.id, {
        itemId, itemName: revOutside.itemName, unit: revOutside.unit, qty: round2(Math.max(0, back - appliedQty)),
        kind: 'reversal_outside_tem', txType: 'CONSUMPTION', note, referenceId
      });
    }
    // Món có tem: tồn luôn chốt lại theo tổng mã (kể cả khi hoàn vào tem chỉ được một phần).
    // atomicScanned thì để BƯỚC 3.5 (_reverseAtomicContainerFinish) tự chốt sau khi trả tem.
    if (unitsTouched || (revTemNL && !atomicScanned)) {
      await _ueRecomputeCurrentStock(itemId, STOCK_CONTAINERS_COLL).catch(() => {});
    }
  }

  async function _reversePrepConsumptionPOS(prepId, consumedQty, note, referenceId, unitAllocations, opKey) {
    const revKey = opKey || referenceId || 'norefid';   // xem _reverseIngredientConsumptionPOS
    const back = Math.abs(Number(consumedQty) || 0);
    if (!back) return;
    // [BUG#3 FIX] Hoàn NGƯỢC đúng lô đã trừ lúc tiêu thụ — bản cũ chỉ hoàn currentStock
    // aggregate, không hoàn đúng qtyRemaining của lô đã bị trừ. Trước đây KHÔNG await bước
    // này — giờ currentStock phải SUY RA từ tổng lô nên phải await xong mới biết tổng mới;
    // lỗi thì rơi về cộng/trừ trực tiếp như cũ (transaction bên dưới).
    let unitsTouched = false, claim = null;
    let appliedQty = 0;
    if (unitAllocations && unitAllocations.length) {
      try {
        // [BUG "hoàn Unit trước, ghi ledger sau → retry hoàn đôi" — FIX] claimId cố định theo
        // (referenceId + prepId), cùng cơ chế với hoàn nguyên liệu ở trên.
        claim = await _ueClaimedReverseAllocations(revKey + '_prep_' + prepId, prepId, unitAllocations, 'prep_batches_gieogieo');
        unitsTouched = claim.appliedQty >= claim.totalQty - 1e-6;
        appliedQty = Number(claim.appliedQty) || 0;
      } catch (err) { console.warn('[UnitEngine] hoàn lô BTP lỗi:', err); }
    }
    if (claim && claim.ambiguous) throw _ueReversalBusy();   // [Sửa lỗi 1] xem _reverseIngredientConsumptionPOS
    const prepRef = C.fstore.collection('prep_items_gieogieo').doc(prepId);
    // [BUG "xoá đơn bấm lại sau khi xoá RTDB lỗi → hoàn đúp" — FIX] id CỐ ĐỊNH theo
    // (referenceId + prepId) — cùng lý do với _reverseIngredientConsumptionPOS ở trên.
    const txRef = C.fstore.collection('prep_transactions_gieogieo').doc('reversal_' + revKey + '_prep_' + prepId);
    await C.fstore.runTransaction(async (t) => {
      const doc = await t.get(prepRef);
      if (!doc.exists) throw new Error('Bán thành phẩm không tồn tại');
      const existingTx = await t.get(txRef);
      if (existingTx.exists) return; // đã hoàn ở lượt trước rồi (bấm lại) — không cộng đúp
      const d = doc.data();
      // Không hoàn được vào lô nào → giảm "âm chờ đối chiếu" (untrackedPendingDelta), tồn
      // không đổi; recompute bên dưới chốt lại cả hai.
      const next = unitsTouched ? (Number(d.currentStock) || 0) + back : (Number(d.currentStock) || 0);
      const updates = { currentStock: next, updatedAt: new Date(C.now()).toISOString() };
      // Chỉ phần CHƯA hoàn được vào lô (hoàn một phần thì phần đã vào lô không tính lại).
      if (!unitsTouched) updates.untrackedPendingDelta = C.FieldValue.increment(round2(Math.max(0, back - appliedQty)));
      t.update(prepRef, updates);
      t.set(txRef, _st({
        prepId, prepCode: d.code || '', prepName: d.name || '', unit: d.unit || '',
        type: 'CONSUMPTION', qty: back, resultingStock: next,
        note: note || '', referenceId: referenceId || null, reversal: true,
        reversalCoverage: unitsTouched ? 'full' : 'untracked',
        // Chỉ lưu khi hoàn ĐỦ vào lô (phần không vào lô đã giảm "âm chờ đối chiếu" — xem trên).
        ...(unitsTouched && unitAllocations && unitAllocations.length ? { reversedAllocations: unitAllocations } : {}),
        createdAt: new Date(C.now()).toISOString(), businessDate: C.businessDate(), source: _src()
      }));
    });
    await _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo').catch(() => {});
  }

  // [E3] Sổ kho THỦ CÔNG của Quản lý (nhập kho tay, duyệt kiểm kê, trả tem cái rời…) — chép từ
  // applyStockTransaction của quanlygieo.html. Khác bản POS (applyStockTransactionPOS):
  //   · [F6 — chủ dự án duyệt 28/09/2026] RECEIVING món không tem: cộng vào kho NGUỒN theo quy tắc
  //     refill như POS. Loại khác không đụng tồn vị trí / bộ đếm refill (Quản lý không ghi bán/hao hụt
  //     qua đây; POS cũng không đổi vị trí khi điều chỉnh không cân đo);
  //   · món có tem: MỌI loại đều không đổi tồn — ghi sổ + Sổ lệch (anomalyKind). RECEIVING món có tem
  //     không tới được đây (form Nhập kho nhanh chặn, hướng sang POS sinh tem);
  //   · anomalyKind === null → không ghi Sổ lệch (trả tem cái rời về seal).
  async function applyStockTransactionManual({ itemId, type, qty, note, staff, businessDate, source, referenceId, locationId, txId, anomalyKind }) {
    // [NL-RECON] Các thao tác Kho trong Quản lý cũng không được chen vào số cân
    // dở của một mẻ POS. Từ chối rõ ràng để người vận hành chốt mẻ trước.
    const rtLock = await _ueActiveUnitsRef(itemId).child('__prepLock').once('value');
    if (rtLock.val() && rtLock.val().batchId !== referenceId)
      throw new Error('Nguyên liệu đang chờ cân của mẻ chế biến khác.');
    const reconLock = await C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId).get();
    if (reconLock.exists && reconLock.data().batchId !== referenceId)
      throw new Error('Nguyên liệu đang chờ cân ở mẻ chế biến khác — chốt số cân trước khi sửa tồn.');
    C.hooks.stockChanged(itemId, 'item');   // tồn kho vừa đổi — số trong bộ đệm không còn đúng
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(itemId);
    const txRef = txId ? C.fstore.collection('stock_transactions_gieogieo').doc(txId)
      : C.fstore.collection('stock_transactions_gieogieo').doc();
    let temTracked = false, temMeta = null, txDocId = null;
    // [F6] Nhập hàng (RECEIVING) cộng vào kho NGUỒN theo quy tắc refill — giống applyStockTransactionPOS.
    // Chỉ RECEIVING: điều chỉnh tay / duyệt kiểm kho vẫn không đụng tồn vị trí (POS cũng vậy khi không cân đo).
    const recvRule = type === 'RECEIVING' ? C.getRefillRule(itemId) : null;
    await C.fstore.runTransaction(async (t) => {
      temTracked = false; temMeta = null; txDocId = null;
      const activeLock = await t.get(C.fstore.collection(PREP_RECON_LOCK_COLL).doc(itemId));
      if (activeLock.exists && activeLock.data().batchId !== referenceId)
        throw new Error('Nguyên liệu đang chờ cân ở mẻ chế biến — chốt số cân trước khi sửa tồn.');
      if (txId) { const done = await t.get(txRef); if (done.exists) return; }
      const itemDoc = await t.get(itemRef);
      if (!itemDoc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
      const itemData = itemDoc.data();
      const current = Number(itemData.currentStock) || 0;
      const next = current + Number(qty);
      const updates = { currentStock: next, updatedAt: new Date(C.now()).toISOString() };
      // [TEM = SỰ THẬT] Món có tem: tồn CHỈ là tổng các mã. Khoản thay đổi qua hàm này không gắn
      // vào mã nào nên KHÔNG đổi tồn — chỉ ghi sổ + Sổ lệch (anomalyKind), rồi chốt lại tồn theo mã.
      temTracked = isTemTrackedNL(itemData);
      if (temTracked) {
        updates.currentStock = current;
        temMeta = { itemName: itemData.name || '', unit: itemData.unit || '' };
      } else if (recvRule && recvRule.sourceLocationId) {
        const prevLoc = Number((itemData.locationStock || {})[recvRule.sourceLocationId]) || 0;
        updates['locationStock.' + recvRule.sourceLocationId] = Math.max(0, prevLoc + Number(qty));
      }
      t.update(itemRef, updates);
      const txData = {
        itemId, type, qty: Number(qty), resultingStock: next, note: note || '', staff: staff || '',
        createdAt: new Date(C.now()).toISOString(),
        businessDate: businessDate || C.businessDate(),
        status: 'posted', source: source || 'management'
      };
      if (referenceId) txData.referenceId = referenceId;
      if (locationId) txData.locationId = locationId;
      if (temTracked) { txData.outsideTem = true; txData.resultingStock = current; }
      t.set(txRef, _st(txData));
      txDocId = txRef.id;
    });
    if (temTracked && txDocId) {
      if (anomalyKind !== null) await logStockAnomalyPOS('tx_' + txDocId, {
        itemId, itemName: temMeta.itemName, unit: temMeta.unit, qty: Number(qty),
        kind: anomalyKind || 'manual_adjust', txType: type, note, referenceId, staff, businessDate
      });
      await _ueRecomputeCurrentStock(itemId, STOCK_CONTAINERS_COLL);
    }
  }
  // [E3] Xoá bill từ bất kỳ app nào: huỷ dòng sổ bill bổ sung (nếu có) + hoàn kho theo sổ.
  // Cả hai idempotent (id dòng sổ hoàn + claim cố định theo bill + món).
  async function reverseOrder(orderId, opts) {
    // [Sửa lỗi B] Huỷ dòng bill bổ sung KHÔNG đánh dấu trace; chỉ đánh dấu khi cả hai bước xong
    // (reverseSales tự đánh dấu khi có hoàn; ở đây đánh dấu lại cho chắc — idempotent).
    const v = await _voidBackfillConsumptionPOS(orderId, { markTrace: false });
    const r = await reverseSalesConsumptionPOS({ billCode: (opts && opts.billCode) || '' }, orderId);
    const ok = !!(v.ok && r.ok);
    if (ok) await _ueMarkTraceReversed(orderId);
    return { ok, failedCount: (r.failedCount == null || v.failedCount == null) ? null : r.failedCount + v.failedCount,
      voidOk: v.ok, reverseOk: r.ok, busy: r.busy || 0, message: r.message || (v.ok ? '' : 'huỷ dòng sổ bill bổ sung lỗi'),
      ingredients: r.ingredients || 0, preps: r.preps || 0 };
  }

  // ════════════════════════ E4 — GOM ĐƯỜNG GHI THẲNG ════════════════════════
  // [E4.0 — F3] Ghi MỘT dòng sổ với id cố định, chỉ tạo khi chưa có — thay mọi .add() (id ngẫu
  // nhiên) trên sổ: gọi lại / bấm lại sau khi mất phản hồi không ghi đôi. Trả true nếu vừa tạo.
  async function _ledgerCreateOnce(coll, txId, data) {
    const ref = C.fstore.collection(coll).doc(txId);
    return C.fstore.runTransaction(async t => { const d = await t.get(ref); if (d.exists) return false; t.set(ref, _st(data)); return true; });
  }

  // [E4.2] Xác nhận "chưa hết" ở chấm FIFO — ghi thẳng số cân vào tem (chép từ posgieo.html).
  // Áp dụng thật sự — đọc TƯƠI Firestore ngay trước khi ghi (tem có thể đã bị báo hết/huỷ ở
  // máy khác từ lúc mở popup tới lúc bấm Lưu), ghi THẲNG unitBase đo được vào RT (nguồn thật)
  // rồi Firestore, suy lại currentStock từ RT, và ghi một dòng ADJUSTMENT vào sổ.
  async function _applyFifoNotEmpty(containerId, qty, note, staffEmp, weighLines, opId) {
    const ref = C.fstore.collection(STOCK_CONTAINERS_COLL).doc(containerId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Không tìm thấy mã này (có thể vừa bị xoá)');
    const c = doc.data();
    if (c.status !== 'open') {
      throw new Error(c.status === 'finished'
        ? 'Tem này đã được báo hết ở máy khác rồi — không sửa lại được nữa'
        : `Tem không còn ở trạng thái đang mở (hiện là "${c.status || '?'}") — thoát ra và thử lại`);
    }
    const oldUnitBase = Number(c.unitBase);
    const nowISO = new Date(C.now()).toISOString();

    // 1) RT trước — nguồn thật. Ghi THẲNG số vừa cân/đong (không cộng/trừ delta): số đo được
    // TẠI THỜI ĐIỂM NÀY là sự thật, không phải suy diễn tiếp từ lịch sử — đúng tinh thần kiểm
    // kê mà _submitPrepCountImpl() đã dùng cho BTP.
    await _ueRetryAsync(() => _ueActiveUnitsRef(c.itemId).child(containerId).transaction(cur => ({
      code: (cur && cur.code) || c.code || '', itemName: (cur && cur.itemName) || c.itemName || '',
      unit: (cur && cur.unit) || c.unit || '', capacity: (cur && cur.capacity) || Number(c.baseQty) || qty,
      openedAt: (cur && cur.openedAt) || C.now(), unitBase: qty
    })));

    // 2) Firestore của chính tem — giữ lại TOÀN BỘ lần "báo chưa hết" trước đó nếu có, không
    // ghi đè mất lịch sử. needsReview:true để việc này TỰ hiện lên màn "Chai & tem kho ▸ Cần
    // xem lại" bên quanlygieo.html — infra đó vốn có sẵn cho "báo hết khi còn nhiều", giờ dùng
    // chung cho cả "chưa hết": hệ thống tính sai (dù theo chiều nào) đều đáng để chủ quán nhìn
    // lại, không chỉ nằm im trong sổ giao dịch chờ ai đó chủ động lật ra đọc.
    await ref.update({
      unitBase: qty,
      needsReview: true, reviewedAt: null, reviewedBy: '',
      notEmptyChecks: C.FieldValue.arrayUnion({
        at: nowISO, by: staffEmp.fullName, byId: staffEmp.id,
        oldUnitBase: isFinite(oldUnitBase) ? oldUnitBase : null, newUnitBase: qty, note,
        // Cân bằng dụng cụ hay gõ tay, và cân những gì — cùng cách _submitPrepFinishImpl ghi
        // weighMethod/weighings, để soi lại được "cân mấy khay, khay nào" chứ không chỉ một số.
        weighMethod: (weighLines && weighLines.length) ? 'vessel' : 'manual',
        weighings: weighLines || []
      })
    });

    // 3) Suy lại currentStock từ RT (đã đúng) thay vì cộng/trừ tay delta — an toàn hơn trước
    // mọi lượt Unit Engine chạy song song khác (đúng cơ chế xuyên suốt file này).
    await _ueRecomputeCurrentStock(c.itemId, STOCK_CONTAINERS_COLL).catch(() => {});

    // 4) Vết ADJUSTMENT vào sổ để báo cáo/COGS thấy được LÝ DO tồn kho vừa nhảy lên, không chỉ
    // thấy con số đổi mà không hiểu vì sao. Ghi TRỰC TIẾP (không qua applyStockTransactionPOS)
    // vì hàm đó tự cộng/trừ currentStock theo qty — làm thêm lần nữa SAU KHI bước 3 đã suy đúng
    // số từ RT sẽ tạo 2 nguồn cộng dồn chồng nhau, đúng thứ Unit Engine cố tránh xuyên suốt file
    // này. Đọc lại currentStock MỚI (đã suy đúng ở bước 3) để ghi resultingStock cho khớp.
    let resultingStock = null;
    try {
      const itemDoc = await C.fstore.collection('inventory_items_gieogieo').doc(c.itemId).get();
      resultingStock = itemDoc.exists ? (Number(itemDoc.data().currentStock) || 0) : null;
    } catch (err) { console.warn('[FIFO chưa hết] đọc lại currentStock để ghi sổ lỗi', err); }
    const delta = round2(qty - (isFinite(oldUnitBase) ? oldUnitBase : 0));
    try {
      // [E4.0 — F3] id cố định theo lượt sửa (opId do màn hình tạo một lần khi mở popup) thay .add():
      // bấm Lưu lại sau khi mất phản hồi KHÔNG ghi thêm dòng. Nơi gọi cũ không truyền opId → id theo tem + giờ.
      await _ledgerCreateOnce('stock_transactions_gieogieo', P.key('fifo_not_empty', opId || (containerId + '_' + C.now())), {
        itemId: c.itemId, type: 'ADJUSTMENT', qty: delta, resultingStock,
        note: `Báo "chưa hết" tem ${c.code || ''} — cân/đong lại còn ${fmtPrepQty(qty)} ${c.unit || ''} (hệ thống trước đó tính đã hết) — ${note}`,
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, referenceId: containerId,
        createdAt: nowISO, businessDate: C.businessDate(), source: _src(), status: 'posted'
      });
    } catch (err) { console.warn('[FIFO chưa hết] ghi sổ ADJUSTMENT lỗi (số liệu chính đã lưu đúng, chỉ thiếu dòng sổ)', err); }
  }

  // [E4.6] Sửa định lượng thu được của lô BTP (chép bước 1–4 của _applyPrepYieldEdit trong posgieo.html).
  // opts.opId: id lượt sửa (F3); opts.batchInputCost(p, ratio): app tính giá vốn đầu vào cho lô cũ
  // chưa lưu inputCost (công thức nằm ở app). Trả về số mới để app cập nhật bộ đệm màn hình.
  async function prepEditYield(batchId, newQty, reason, opts) {

    // Đọc TƯƠI Firestore ngay trước khi ghi — không tin cache cục bộ cho phần quyết định
    // đúng/sai này, vì đây là hành động sửa số liệu đã chốt, sai một lần là rất khó dò lại.
    const batchRef = C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    const freshDoc = await batchRef.get();
    if (!freshDoc.exists) throw new Error('Lô không còn tồn tại (có thể vừa bị xoá)');
    const fresh = freshDoc.data();
    if (fresh.status !== 'active') {
      throw new Error(fresh.status === 'used_up'
        ? 'Lô này đã bán/dùng hết từ lúc mở form tới giờ — thoát ra xem lại, không sửa tiếp được nữa'
        : `Lô không còn ở trạng thái "đang còn" (hiện là "${fresh.status || '?'}", có thể vừa bị huỷ/kiểm kê ở máy khác) — thoát ra và thử lại`);
    }
    const oldQtyInitial = Number(fresh.qtyInitial) || 0;
    const qtyRemainingFallback = Number(fresh.qtyRemaining) || 0; // chỉ dùng khi RT thiếu hẳn node

    const p = (C.getPreps() || []).find(x => x.id === fresh.prepId) || {};
    // Lô cũ (nấu trước khi có field inputCost) — tính bù theo công thức hiện tại, cùng
    // cách refreshPrepYieldStatsPOS() đang làm cho các lô thiếu field này.
    const batchInputCost = Number(fresh.inputCost) || ((opts && opts.batchInputCost) ? opts.batchInputCost(p, Number(fresh.batchRatio) || 1) : 0);
    const newActualCostPerUnit = newQty > 0 ? batchInputCost / newQty : 0;

    // 1) RT trước — nguồn thật. Tính "đã dùng mất bao nhiêu" NGAY TRONG callback (xem lý
    // do (1) ở trên) — finalRemaining giữ lại số của LẦN CHẠY CUỐI, chính là số thật sự
    // được RTDB chấp nhận ghi.
    let finalRemaining = null;
    await _ueRetryAsync(() => _ueActiveUnitsRef(fresh.prepId).child(batchId).transaction(cur => {
      const curBase = (cur && typeof cur.unitBase === 'number') ? cur.unitBase : qtyRemainingFallback;
      const daDung = Math.max(0, oldQtyInitial - curBase); // đã bán/dùng mất từ lúc hoàn thành
      finalRemaining = round2(Math.max(0, newQty - daDung));
      return {
        code: (cur && cur.code) || fresh.batchCode || '', itemName: (cur && cur.itemName) || fresh.prepName || '',
        unit: (cur && cur.unit) || fresh.unit || '', capacity: newQty,
        openedAt: (cur && cur.openedAt) || C.now(), unitBase: finalRemaining
      };
    }));
    if (finalRemaining === null) throw new Error('Không tính được số dư mới sau khi đồng bộ RT — thử lại');

    // 2) Firestore của chính lô — kèm dấu vết sửa (arrayUnion giữ lại TOÀN BỘ lần sửa
    // trước nếu có, không ghi đè mất lịch sử). Đồng bộ status CẢ HAI CHIỀU theo số dư mới
    // (xem lý do (3) ở trên), không chỉ chiều "về 0".
    const nowISO = new Date(C.now()).toISOString();
    try {
      await batchRef.update({
        qtyInitial: newQty, qtyRemaining: finalRemaining, unitBase: finalRemaining,
        actualCostPerUnit: newActualCostPerUnit,
        status: finalRemaining <= 0 ? 'used_up' : 'active',
        usedUpAt: finalRemaining <= 0 ? nowISO : C.FieldValue.delete(),
        ...(fresh.declaredYieldTotal > 0
          ? { yieldVariancePct: Math.round((newQty - fresh.declaredYieldTotal) / fresh.declaredYieldTotal * 1000) / 10 }
          : {}),
        yieldEdits: C.FieldValue.arrayUnion({
          at: nowISO, oldQty: oldQtyInitial, newQty, reason, byManagerCode: true
        })
      });
    } catch (err) {
      // [BUG "RT đã ghi nhưng Firestore lỗi" — cùng lớp lỗi mà mọi flow Unit Engine khác
      // trong file này đều phải phòng] RT ở bước 1 đã đổi xong — không được để lỗi ở đây
      // trôi thành thông báo lỗi chung chung "không lưu được", nhân viên sẽ bấm Lưu lại và
      // tưởng chưa có gì xảy ra trong khi RT đã đổi. Bấm lại vẫn AN TOÀN (transaction ở
      // bước 1 tự tính lại đúng từ trạng thái RT hiện tại), chỉ cần nói rõ để họ bấm lại
      // thay vì hoang mang.
      console.error('[Sửa định lượng] RT đã ghi xong nhưng Firestore lỗi', batchId, err);
      throw new Error('Đã đồng bộ RT nhưng lưu Firestore lỗi — bấm "Lưu định lượng đã sửa" lại (an toàn, không ghi đôi)');
    }

    // 3) Suy lại currentStock từ RT (đã đúng) thay vì cộng/trừ tay delta — an toàn hơn
    // trước mọi lượt Unit Engine chạy song song khác.
    await _ueRecomputeCurrentStock(fresh.prepId, 'prep_batches_gieogieo').catch(() => {});

    // 4) Vết ADJUSTMENT vào ledger để báo cáo/COGS thấy được lý do thay đổi, không chỉ
    // thấy con số nhảy mà không hiểu vì sao. Lỗi ở bước này KHÔNG throw — số liệu chính
    // (RT + batch doc) đã lưu đúng rồi, thiếu 1 dòng ledger không đáng để báo "lưu lỗi".
    const delta = round2(newQty - oldQtyInitial);
    if (delta !== 0) {
      const gia = Number(p.costPerUnit) || 0;
      // [E4.0 — F3] id cố định theo lượt sửa (opId) thay .add() — bấm Lưu lại không ghi đôi.
      await _ledgerCreateOnce('prep_transactions_gieogieo', P.key('prep_yield_edit', (opts && opts.opId) || (batchId + '_' + C.now())), {
        prepId: fresh.prepId, prepCode: fresh.prepCode || '', prepName: fresh.prepName || '', unit: fresh.unit || '',
        type: 'ADJUSTMENT', qty: delta, totalCost: round2(Math.abs(delta) * gia), costPerUnit: gia,
        batchId, batchCode: fresh.batchCode || '',
        note: `Sửa định lượng thu được lô ${fresh.batchCode || ''} (mã quản lý) — ${reason}`,
        reason, source: _src(), createdAt: nowISO, businessDate: C.businessDate()
      }).catch(err => console.warn('[Sửa định lượng] ghi ADJUSTMENT ledger lỗi (số liệu chính đã lưu đúng, chỉ thiếu dòng sổ)', err));
    }

    return { prepId: fresh.prepId, finalRemaining, newActualCostPerUnit, status: finalRemaining <= 0 ? 'used_up' : 'active' };
  }

  // [E4.8] Bill bổ sung TRƯỚC kết ca: ghi sổ tiêu hao theo công thức nhưng KHÔNG đụng tồn/RT (chép phần
  // ghi của applyBackfillConsumptionNoStockEffect — posgieo.html). lines = { agg, prepAgg } do app quy
  // công thức ra. Dòng sổ id cố định backfill_{bill}_ing|prep_{món} (F3). Trả { failed }.
  async function consumeBackfillNoStock(lines, orderId, ctx) {
    const agg = (lines && lines.agg) || {}, prepAgg = (lines && lines.prepAgg) || {};
    const businessDate = ctx && ctx.businessDate, billCode = (ctx && ctx.billCode) || '';
    const note = 'Bổ sung bill thiếu (TRƯỚC kết ca — không đụng tồn kho, kiểm kê hôm đó coi như đã bắt đúng)' + (billCode ? ' — ' + billCode : '');
    const nowISO = new Date(C.now()).toISOString();
    const jobs = [];
    Object.keys(agg).forEach(itemId => {
      const qty = Math.abs(agg[itemId]);
      if (!(qty > 0)) return;
      jobs.push(_ledgerCreateOnce('stock_transactions_gieogieo', P.key('backfill', orderId, 'ing', itemId), {
        itemId, type: 'CONSUMPTION', qty: -qty, resultingStock: null,
        note, staff: '', referenceId: orderId,
        createdAt: nowISO, businessDate, status: 'posted', source: _src(),
        // Đánh dấu rõ để không ai nhầm đây là một lượt trừ kho thật — chỉ để đúng số doanh
        // thu/giá vốn theo ngày, currentStock KHÔNG đổi vì dòng này.
        backfillNoStockEffect: true
      }));
    });
    Object.keys(prepAgg).forEach(prepId => {
      const qty = Math.abs(prepAgg[prepId]);
      if (!(qty > 0)) return;
      const p = (C.getPreps() || []).find(x => x.id === prepId) || {};
      jobs.push(_ledgerCreateOnce('prep_transactions_gieogieo', P.key('backfill', orderId, 'prep', prepId), {
        prepId, prepCode: p.code || '', prepName: p.name || '', unit: p.unit || '',
        type: 'CONSUMPTION', qty: -qty, resultingStock: null,
        note, referenceId: orderId,
        createdAt: nowISO, businessDate, source: _src(),
        backfillNoStockEffect: true
      }));
    });
    let loi = 0;
    if (jobs.length) {
      const rs = await Promise.allSettled(jobs);
      loi = rs.filter(r => r.status === 'rejected').length;
    }
    // [MỚI — Tuần 4 truy xuất] Đường này CỐ Ý không phân bổ FIFO (xem chú thích đầu hàm) nên
    // tra Bill ↔ Tem sẽ không thấy gì nếu không ghi rõ — dễ hiểu lầm thành "bill lỗi, không trừ
    // được kho" giống món chưa khai định mức. Ghi tường minh untrackedReason để phân biệt: đây
    // là MỘT QUYẾT ĐỊNH NGHIỆP VỤ có chủ đích (đã kiểm kê bắt đúng), không phải một khoảng hở.
    C.fstore.collection('order_stock_traces_gieogieo').doc(orderId).set(_st({
      orderId, billCode: billCode, businessDate: businessDate || C.businessDate(),
      createdAt: nowISO, backfillNoStockEffect: true,
      ingredients: Object.fromEntries(Object.keys(agg).filter(id => Math.abs(agg[id]) > 0)
        .map(id => [id, { qty: Math.abs(agg[id]), allocations: [], untracked: true, untrackedReason: 'backfill_before_close' }])),
      preps: Object.fromEntries(Object.keys(prepAgg).filter(id => Math.abs(prepAgg[id]) > 0)
        .map(id => [id, { qty: Math.abs(prepAgg[id]), allocations: [], untracked: true, untrackedReason: 'backfill_before_close' }]))
    }), { merge: true }).catch(err => console.warn('[stockTrace] ghi tổng hợp bill→tem (backfill) lỗi', orderId, err));
    return { failed: loi };
  }

  // [E4.3/E4.6/E4.7] chép nguyên văn từ posgieo.html: writeAtomicContainerFinish, _reverseAtomicContainerFinish, _wastePrepQtyPOS, prepShortageClearAll
  // [MỚI] Ghi nhận MỘT container "đơn vị nguyên" (cái rời) đã dùng hết — tách
  // riêng khỏi submitFinishContainer() để dùng chung được cho cả sheet xác nhận
  // thường (đọc PIN từ #finishCtStaff ngay lúc bấm) lẫn bước "quét mã trước khi
  // nấu" mới (xem prepStartGateScan) — bước đó xác thực PIN MỘT LẦN ở đầu, rồi
  // quét nhiều mã liên tiếp, không hỏi lại PIN mỗi lần quét.
  async function writeAtomicContainerFinish(ref, c, staffEmp, lyDo, daQuet) {
    const nowISO = new Date(C.now()).toISOString();
    // [FIX #B — "atomic finish không dọn RT, gây tồn ảo tích luỹ"] Container "cái rời" có thể
    // đã đi qua bước 'mở' bình thường trước đó (unitEngineOnOpen() đăng ký node RT cho MỌI
    // container, không phân biệt atomic hay không — xem submitFinishContainer: nhánh atomic
    // vẫn chạy khi c.status==='open'). unitEngineFinishOpenUnit() (container đo dung tích)
    // luôn dọn RT khi chốt, nhưng hàm này trước đây chỉ update() Firestore, không đụng RT —
    // node cũ (unitBase=baseQty, vì "cái rời" không bao giờ bị trừ dần) nằm lại vĩnh viễn.
    // Lượt _ueRecomputeCurrentStock() kế tiếp cộng thêm đúng unitBase đó vào openTotal dù
    // Firestore đã 'finished' — currentStock dư 1 đơn vị mỗi lần chốt qua đường này. Atomic
    // container không có khái niệm nợ FIFO (baseQty luôn =1, không bị trừ dần như chai đo
    // dung tích) nên luôn remove() thẳng, không cần nhánh finishedDebt như bên kia.
    //
    // [SỔ LỆCH] Gỡ bằng transaction để biết ĐÚNG số dư node lúc bị gỡ. Tem cái rời mở từ trước khi
    // có cổng chặn (dữ liệu cũ) vẫn có thể đã bị bán trừ xuống âm — khoản vượt đó không còn mã nào
    // đỡ sau khi gỡ, nên ghi Sổ lệch thay vì để mất im lặng. (Callback lần đầu có thể nhận null từ
    // cache: trả null để máy chủ gọi lại với số thật — cùng cách các transaction khác trong file.)
    let dangGo = null;
    const goRt = () => _ueActiveUnitsRef(c.itemId).child(ref.id).transaction(cur => { dangGo = cur; return null; });
    let daGo = false;
    try {
      await goRt(); daGo = true;
    } catch (err) {
      console.warn('[UnitEngine] atomic finish: gỡ RT lỗi, thử lại', ref.id, err);
      try { await goRt(); daGo = true; }
      catch (err2) { console.error('[UnitEngine] atomic finish: KHÔNG gỡ được RT node — currentStock có thể dư 1 đơn vị, cần kiểm kê', ref.id, err2); }
    }
    const soDuLucGo = dangGo && typeof dangGo === 'object' ? (Number(dangGo.unitBase) || 0) : null;
    if (daGo && soDuLucGo !== null && soDuLucGo < -0.005) {
      await logStockAnomalyPOS(('atomic_debt_' + ref.id).slice(0, 180), {
        itemId: c.itemId, itemName: c.itemName || '', unit: c.unit || '',
        qty: Math.round(soDuLucGo * 100) / 100, kind: 'atomic_debt_dropped', txType: '',
        note: `Tem cái rời ${c.code || ref.id} đang âm ${Math.round(soDuLucGo * 100) / 100} lúc báo hết — phần bán vượt tem không còn mã nào đỡ`,
        referenceId: ref.id, staff: (staffEmp && staffEmp.fullName) || ''
      });
    }
    await ref.update({
      status: 'finished',
      finishedFromStatus: c.status === 'open' ? 'open' : 'sealed',   // hoàn (Huỷ mẻ) trả về đúng trạng thái này
      // Đi thẳng từ sealed (chưa từng quét "mở") thì điền luôn mốc mở = mốc báo
      // hết, cùng người — để lịch sử vẫn có đủ openedAt/openedBy như container
      // thường, không bỏ trống gây khó hiểu khi xem lại sau này.
      openedAt: c.openedAt || nowISO, openedBy: c.openedBy || staffEmp.fullName,
      openedByEmployeeId: c.openedByEmployeeId || staffEmp.id,
      finishedAt: nowISO, finishedBy: staffEmp.fullName,
      finishedByEmployeeId: staffEmp.id,
      finishReason: lyDo, finishScanned: !!daQuet,
      wasteBase: 0, wasteBasis: 'don_vi_nguyen',
      needsReview: false
    });
    // [FIX #B] Suy lại currentStock từ tổng unit (RT đã gỡ node) — nếu container này TỪNG ở
    // 'open' (có mặt trong RT), currentStock đang dư đúng 1 đơn vị cho tới khi recompute chạy;
    // gọi ngay ở đây thay vì chờ recompute tiếp theo do một nghiệp vụ khác kích hoạt.
    await _ueRecomputeCurrentStock(c.itemId, STOCK_CONTAINERS_COLL).catch(() => {});
  }

  // [MỚI] Hoàn lại MỘT container "cái" đã bị writeAtomicContainerFinish() chốt 'finished'
  // — dùng khi "Huỷ mẻ" một lô Chế biến đã đi qua cổng quét bắt buộc lúc bắt đầu (xem
  // startPrepBatchGate/prepStartGateScan): nếu không hoàn, tem đó kẹt vĩnh viễn ở
  // 'finished' (coi như đã dùng hết) dù mẻ chưa từng thực sự được nấu — số LƯỢNG thì
  // _reverseIngredientConsumptionPOS() đã cộng lại currentStock đúng rồi, nhưng tem/mã
  // vật lý cụ thể đã quét vẫn không có đường quay lại 'sealed' nếu thiếu hàm này.
  //
  // CHỈ hoàn nếu tem vẫn đang đúng ở 'finished' — nếu từ lúc quét tới giờ nó đã bị đổi
  // trạng thái bởi một thao tác khác (Quản lý báo mất, hoặc trớ trêu hơn là đã bị dùng
  // cho một mẻ MỚI khác) thì ĐỪNG đụng vào, tránh ghi đè lịch sử thật của thao tác sau.
  // Giữ lại finishedAt/finishedBy cũ (không xoá) — chỉ thêm revertedFinish để biết vì
  // sao một tem 'sealed' lại có vết đã từng 'finished' nếu sau này cần soi lại.
  async function _reverseAtomicContainerFinish(containerId, batchId, staffEmp, note) {
    const ref = C.fstore.collection(STOCK_CONTAINERS_COLL).doc(containerId);
    try {
      const doc = await ref.get();
      if (!doc.exists) return false;
      const c = doc.data();
      if (c.status !== 'finished') return false;
      const backTo = c.finishedFromStatus === 'open' ? 'open' : 'sealed';
      if (backTo === 'open') {
        // Đang mở trước khi chốt → đăng ký lại vào RT (nguồn thật của phần đang mở), không thì tồn thiếu.
        await _ueRetryAsync(() => _ueActiveUnitsRef(c.itemId).child(containerId).set({
          code: c.code || '', itemName: c.itemName || '', unit: c.unit || '',
          unitBase: Number(c.baseQty) || 1, capacity: Number(c.baseQty) || 1,
          openedAt: c.openedAt ? new Date(c.openedAt).getTime() : C.now()
        }));
      }
      await ref.update({
        status: backTo,
        revertedFinish: {
          batchId: batchId || '', at: new Date(C.now()).toISOString(),
          by: (staffEmp && staffEmp.fullName) || '', reason: note || ''
        }
      });
      // [FIX cùng đợt "KIT bột sữa/Sữa gạo âm ảo"] Đối xứng với writeAtomicContainerFinish() ở
      // chiều thuận — tem vừa quay lại 'sealed' phải suy lại currentStock NGAY, không chờ một
      // nghiệp vụ khác của item này kích hoạt recompute (_reverseIngredientConsumptionPOS gọi
      // TRƯỚC hàm này trong luồng Huỷ mẻ nên không tự làm thay được — xem chú thích ở đó).
      await _ueRecomputeCurrentStock(c.itemId, STOCK_CONTAINERS_COLL).catch(() => {});
      return true;
    } catch (err) {
      console.warn('[Huỷ mẻ] hoàn tem đã quét lỗi', containerId, err);
      return false;
    }
  }

  // Trừ bán thành phẩm với type WASTE (dùng cho ly bị đổ có chứa CB, VD trân châu).
  // Viết riêng thay vì dùng applyPrepConsumptionPOS vì hàm đó ghi cứng type
  // 'CONSUMPTION' — cần phân biệt bán ra và đổ bỏ trong báo cáo.
  // [BUG BTP "Đổ ly" bypass Unit Engine — FIX] Trước đây chỉ trừ thẳng prep_items.currentStock,
  // không đụng RT/unitBase của lô nào cả — lô vẫn hiện còn nguyên trong khi thực tế đã mất một
  // phần vào ly bị đổ, lần bán kế tiếp Unit Engine tưởng lô còn nhiều hơn thực tế. Giờ phân bổ
  // FIFO vào đúng lô đang mở TRƯỚC (như applyPrepConsumptionPOS), cùng cơ chế, chỉ khác type.
  async function _wastePrepQtyPOS(prepId, qty, note, staffEmp, meta, txId) {
    const back = Math.abs(Number(qty) || 0);
    if (!back) return;
    // txId cố định (đổ ly) → đã ghi ở lượt trước thì bỏ qua, không trừ lô lần 2.
    if (txId && (await C.fstore.collection('prep_transactions_gieogieo').doc(txId).get()).exists) return;
    const unitAllocations = await unitEngineAllocateConsumption(prepId, back, 'prep_batches_gieogieo')
      .catch(err => { console.warn('[UnitEngine] phân bổ lô BTP (đổ ly) lỗi', prepId, err); return []; });
    const prepRef = C.fstore.collection('prep_items_gieogieo').doc(prepId);
    const txRef = txId ? C.fstore.collection('prep_transactions_gieogieo').doc(txId) : C.fstore.collection('prep_transactions_gieogieo').doc();
    try {
    await C.fstore.runTransaction(async (t) => {
      const doc = await t.get(prepRef);
      if (!doc.exists) throw new Error('Bán thành phẩm không tồn tại');
      const d = doc.data();
      // Không có lô nào để trừ → vào "âm chờ đối chiếu" như bán (xem applyPrepConsumptionPOS).
      // Trước đây trừ thẳng currentStock và bị recompute kế tiếp xoá mất.
      const next = unitAllocations.length ? (Number(d.currentStock) || 0) - back : (Number(d.currentStock) || 0);
      const gia = Number(d.costPerUnit) || 0;
      t.update(prepRef, { currentStock: next, updatedAt: new Date(C.now()).toISOString(),
        ...(unitAllocations.length ? {} : { untrackedPendingDelta: C.FieldValue.increment(-back) }) });
      t.set(txRef, _st({
        prepId, prepCode: d.code || '', prepName: d.name || '', unit: d.unit || '',
        type: 'WASTE', qty: -back, resultingStock: next, note: note || '',
        // [FIX] Thiếu totalCost thì app Quản lý cộng ra 0đ — ly đổ có trân châu
        // bên trong sẽ không bao giờ hiện lên trong waste, dù đã ghi nhận đầy đủ.
        totalCost: round2(back * gia), costPerUnit: gia,
        reason: (meta && meta.reason) || note || 'Ly bị đổ',
        staff: staffEmp ? staffEmp.fullName : '', staffEmployeeId: staffEmp ? staffEmp.id : null,
        createdAt: new Date(C.now()).toISOString(), businessDate: C.businessDate(), source: _src(),
        ...(unitAllocations.length ? { unitAllocations } : {}),
        ...(meta || {})
      }));
    });
    } catch (err) {
      // Lô đã bị trừ ở RT mà sổ chưa ghi → hoàn lô (cùng lý do nhánh nguyên liệu ở đổ ly).
      if (unitAllocations.length) {
        let daGhi = true;
        try { daGhi = (await txRef.get()).exists; } catch (e) {}
        if (!daGhi) await _ueClaimedReverseAllocations('dwfail_' + txRef.id + '_' + C.now(), prepId, unitAllocations, 'prep_batches_gieogieo')
          .then(() => _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo')).catch(e => console.warn('[Đổ ly] hoàn lô sau lỗi ghi sổ lỗi', prepId, e));
      }
      throw err;
    }
    await _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo').catch(() => {});
  }

  // Đóng khoản âm đã chụp sau khi cân: về 0 untrackedPendingDelta (kể cả BTP không có lô nào để
  // cân — bán trước khi nấu, cả ngày không nấu) và gỡ mọi node RT còn âm (lô cân rồi đã được ghi
  // đè bằng số cân ≥ 0; node âm còn sót là lô không còn 'active' nên màn cân không thấy).
  async function prepShortageClearAll(shortage) {
    const now = new Date(C.now()).toISOString();
    await Promise.allSettled(Object.keys(shortage || {}).map(async id => {
      await C.fstore.collection('prep_items_gieogieo').doc(id).update({ untrackedPendingDelta: 0, updatedAt: now });
      const rt = (await _ueActiveUnitsRef(id).once('value')).val() || {};
      await Promise.all(Object.keys(rt).filter(k => k !== '__prepLock' && Number(rt[k] && rt[k].unitBase) < 0)
        .map(k => _ueActiveUnitsRef(id).child(k).remove()));
      await _ueRecomputeCurrentStock(id, 'prep_batches_gieogieo');
    }));
  }

  // [E4.5] chép nguyên văn từ posgieo.html: shiftWeighErr, shiftWeighAbsSig, shiftWeighResetUnitPOS, shiftWeighResFromRtPOS, shiftWeighFinishPOS, shiftWeighHealPendingPOS, shiftWeighReclassToConsumptionPOS, shiftWeighApplyLinePOS
  const SHIFT_WEIGH_DEVIATION_PCT = 25;
  function shiftWeighErr(msg,code){ const e=new Error(msg); e.code=code||''; return e; }

  function shiftWeighAbsSig(node){
    if(!node) return '';
    return [(node.shiftWeigh&&node.shiftWeigh.op)||'', node.lastPrepReconOp||'', node.lastMgrAdjustOp||''].join('|');
  }

  function shiftWeighResetUnitPOS(u){
    u.weighed=null; u.baseline=null; u.weighings=[]; u.countedAt=null; u.seq++;
    if(u._t){ clearTimeout(u._t); u._t=null; }
    u._p=null;
  }

  // Dựng lại kết quả lượt cân từ chính các node RT (trường shiftWeigh ghi cùng transaction).
  function shiftWeighResFromRtPOS(src, unitIds, opId){
    if(!src || !unitIds.length || !unitIds.every(id=>src[id] && src[id].shiftWeigh && src[id].shiftWeigh.op===opId)) return null;
    const per=unitIds.map(id=>{ const n=src[id], sw=n.shiftWeigh;
      return {id, code:n.code||'', openedAt:Number(n.openedAt)||0, before:Number(sw.before)||0,
        after:Number(sw.after)||0, baseline:Number(sw.baseline)||0, weighed:Number(sw.weighed)||0, newest:!!sw.newest, debt:sw.debt||[]}; });
    const nw=per.find(p=>p.newest)||per[per.length-1];
    return {per:per.map(({newest,debt,...p})=>p), debt:Array.isArray(nw.debt)?nw.debt:Object.values(nw.debt||{}), newestId:nw.id};
  }

  // Phần sau RT: bản sao Firestore + dòng sổ + suy tồn. Idempotent hoàn toàn (txId cố định,
  // bản sao ghi số tuyệt đối) — gọi lại bao nhiêu lần cũng ra cùng kết quả.
  async function shiftWeighFinishPOS(m, res){
    const nowISO=new Date(C.now()).toISOString();
    await Promise.all([
      ...res.per.map(p=>_ueRetryAsync(()=>C.fstore.collection(STOCK_CONTAINERS_COLL).doc(p.id).update({
        unitBase:p.after, lastShiftWeigh:{op:m.opId, at:nowISO, book:p.baseline, weighed:p.weighed, by:m.staffName}
      })).catch(err=>console.warn('[Cân cuối ca] đồng bộ bản sao mã lỗi', p.id, err))),
      ...res.debt.map(d=>_ueRetryAsync(()=>C.fstore.collection(STOCK_CONTAINERS_COLL).doc(d.id).update({
        unitBase:0, debtClosedAt:nowISO, debtClosedBy:'shift_weigh', debtClosedOp:m.opId, debtClosedAmount:d.amount
      })).catch(err=>console.warn('[Cân cuối ca] đóng nợ bản sao mã lỗi', d.id, err)))
    ]);
    const debtSum=round2(res.debt.reduce((s,d)=>s+(Number(d.amount)||0),0));
    const newestCode=(res.per.find(p=>p.id===res.newestId)||{}).code||'';
    let wrote=false;
    for(const p of res.per){
      let amt=round2(p.baseline-p.weighed);            // >0 = hụt, <0 = dư
      const isNewest=p.id===res.newestId;
      if(isNewest) amt=round2(amt+debtSum);
      if(Math.abs(amt)<=0.005) continue;
      const debtNote=(isNewest && res.debt.length)
        ? ' · chốt nợ FIFO '+res.debt.map(d=>(d.code||'')+' '+fmtPrepQty(d.amount)).join(', ') : '';
      await applyStockTransactionPOS({
        itemId:m.itemId, type:amt>0?'WASTE':'ADJUSTMENT', qty:-amt,
        note:`Hao hụt cân cuối ca · mã ${p.code}: sổ ${fmtPrepQty(p.baseline)} → cân ${fmtPrepQty(p.weighed)} ${m.unit||''}`+debtNote,
        staff:m.staffName, staffEmployeeId:m.staffId, referenceId:m.opId,
        deriveFromUnits:true, txId:m.opId+'_'+p.id, businessDate:m.day, measured:true,
        meta:{ wasteKind:'shift_weigh', shiftWeighOp:m.opId, containerId:p.id, containerCode:p.code,
          bookQty:p.baseline, weighedQty:p.weighed,
          ...((m.largeDevIds||[]).includes(p.id) ? { largeDeviation:true } : {}),
          ...(isNewest && res.debt.length ? { debtAbsorbed:res.debt } : {}) }
      });
      wrote=true;
    }
    if(!wrote) await _ueRecomputeCurrentStock(m.itemId, STOCK_CONTAINERS_COLL).catch(()=>{});
    if(res.debt.length) C.hooks.fifoChanged().catch(()=>{});
    const book=round2(res.per.reduce((s,p)=>s+p.baseline,0)+debtSum);
    const counted=round2(res.per.reduce((s,p)=>s+p.weighed,0));
    const out={book, counted, lossQty:round2(book-counted), debtAbsorbed:res.debt, newestCode};
    // [v5 duty] Hồ sơ vụ lệch theo ca cho NL — chạy NỀN, không chặn luồng cân/kết ca/bán hàng.
    dutyBg(dutyOnNlWeigh(m, out), 'nl_' + m.itemId);
    return out;
  }

  // Tự bù lượt cân dở dang (RT đã ghi, sổ chưa ghi xong) của đúng ngày đang kết ca.
  //   · 'rt_done' có kết quả → ghi nốt sổ theo kết quả đó.
  //   · 'planned' → đọc RT: mọi mã đã mang dấu lượt này → dựng lại kết quả và ghi nốt; không mã
  //     nào mang dấu → RT chưa từng bị đổi, bỏ lượt; dở dang/không dựng lại được → báo Quản lý.
  async function shiftWeighHealPendingPOS(day, pending){
    const closeRef=C.fstore.collection('daily_closings_gieogieo').doc(day);
    const drop=opId=>closeRef.update({ ['shiftWeighPending.'+opId]: C.FieldValue.delete() }).catch(()=>{});
    for(const opId of Object.keys(pending||{})){
     try{
      const p=pending[opId]||{};
      if(!p.itemId) { await drop(opId); continue; }
      const m={itemId:p.itemId, itemName:p.itemName||'', unit:p.unit||'', opId, day:p.day||day,
        staffName:p.staffName||'', staffId:p.staffId||''};
      let res=(p.stage==='rt_done' && p.result && Array.isArray(p.result.per)) ? p.result : null;
      if(!res){
        const src=(await _ueActiveUnitsRef(p.itemId).once('value')).val()||{};
        const ids=Array.isArray(p.unitIds)?p.unitIds:[];
        const marked=ids.filter(id=>src[id] && src[id].shiftWeigh && src[id].shiftWeigh.op===opId);
        if(!marked.length && ids.every(id=>src[id])){ await drop(opId); continue; }
        res=shiftWeighResFromRtPOS(src, ids, opId);
        if(!res){
          await C.fstore.collection('alerts_gieogieo').doc(('shift_weigh_heal_failed_'+opId).slice(0,180)).set(_st({
            type:'shift_weigh_heal_failed', severity:'danger', status:'new', businessDate:day, createdAt:new Date(C.now()).toISOString(),
            itemId:p.itemId, itemName:p.itemName||'', opId,
            title:`"${p.itemName||p.itemId}": lượt cân cuối ca bị ngắt giữa chừng, không tự hoàn tất được`,
            note:'Tồn theo mã có thể đã đổi mà chưa có dòng sổ hao hụt. Đối chiếu tem của món này và ghi bù tay nếu cần.'
          }),{merge:true}).catch(()=>{});
          await drop(opId); continue;
        }
      }
      res={...res, debt:Array.isArray(res.debt)?res.debt:Object.values(res.debt||{})};
      await shiftWeighFinishPOS(m, res);
      await drop(opId);
     }catch(err){ console.warn('[Cân cuối ca] tự bù lượt', opId, 'lỗi — thử lại lần sau', err); }
    }
  }

  // Chuyển một phần "hao hụt cân cuối ca" của NL sang dùng bù BTP: giảm qty trên đúng các dòng
  // WASTE của lượt cân + ghi 1 dòng CONSUMPTION, trong CÙNG một transaction. Không đổi tồn/quầy:
  // lượng này đã rời tem và quầy từ lúc ghi hao hụt. txId của dòng CONSUMPTION cố định → chạy
  // lại không chuyển hai lần. Không ghi WASTE dương vì các báo cáo bên Quản lý cộng trị tuyệt đối.
  async function shiftWeighReclassToConsumptionPOS(o){
    const coll=C.fstore.collection('stock_transactions_gieogieo');
    const txRef=coll.doc(o.txId);
    const rows=(await coll.where('shiftWeighOp','==',o.opId).get()).docs
      .filter(d=>d.data().type==='WASTE' && d.data().itemId===o.itemId)
      .sort((a,b)=>a.id.localeCompare(b.id));
    const nowISO=new Date(C.now()).toISOString();
    await C.fstore.runTransaction(async t=>{
      const done=await t.get(txRef);
      if(done.exists) return;
      const snaps=await Promise.all(rows.map(d=>t.get(d.ref)));
      let left=round2(o.qty);
      const touched=[];
      snaps.forEach(sn=>{
        if(!(left>0.005) || !sn.exists) return;
        const x=sn.data(), avail=round2(-(Number(x.qty)||0));
        if(!(avail>0.005)) return;
        const take=round2(Math.min(avail,left));
        left=round2(left-take);
        touched.push({ref:sn.ref, x, take});
      });
      if(left>0.005) throw new Error('Lượng dùng bù lớn hơn hao hụt cân cuối ca đã ghi — cần Quản lý kiểm tra');
      touched.forEach(({ref,x,take})=>t.update(ref,{
        qty:round2((Number(x.qty)||0)+take),
        qtyBeforeReclass: x.qtyBeforeReclass!=null ? x.qtyBeforeReclass : (Number(x.qty)||0),
        reclassifiedToConsumptionQty: round2((Number(x.reclassifiedToConsumptionQty)||0)+take),
        reclassifiedAt: nowISO,
        note: `[Chuyển ${fmtPrepQty(take)} ${o.unit||''} sang dùng bù ${o.prepName||''}] ` + (x.note||'')
      }));
      t.set(txRef,_st({
        itemId:o.itemId, type:'CONSUMPTION', qty:-round2(o.qty), resultingStock:null,
        note:'Dùng bù cho '+(o.prepName||'')+' (nhân viên xác nhận cuối ca — chuyển từ hao hụt cân cuối ca)',
        staff:o.staffEmp.fullName||'', staffEmployeeId:o.staffEmp.id||'', referenceId:o.reconId,
        createdAt:nowISO, businessDate:o.day, status:'posted', source:'pos',
        substitutionFor:o.prepId, substitutionReconId:o.reconId,
        reclassFromShiftWeigh:o.opId, reclassFromTxIds:touched.map(x=>x.ref.id)
      }));
    });
  }

  // Chốt một món có tem. Trả về kết quả và gắn vào l._applied (bấm xác nhận lại không làm lại).
  //   · Có mã "không có trên tay" → không ghi gì vào mã nào, chỉ báo Quản lý.
  //   · Đủ mã → MỘT transaction RT trên node của NL: đặt unitBase từng mã = số cân (giữ lượt bán
  //     xen giữa), gỡ các node nợ đã báo hết (finishedDebt) vì lượng đó đã nằm trong số cân.
  //     Hao hụt = sổ (Σ mốc + Σ nợ) − Σ số cân; phần nợ gắn vào mã mở MỚI NHẤT — cùng quy ước
  //     dồn nợ của _ueComputeAllocation/unitEngineOnOpen.
  //   · Sổ: mỗi mã có lệch → 1 dòng WASTE (hụt) hoặc ADJUSTMENT (dư), txId cố định theo lượt.
  async function shiftWeighApplyLinePOS(l, day, staffEmp, seed){
    if(l._applied) return l._applied;
    const nowISO=new Date(C.now()).toISOString();
    const opId=('sw_'+day+'_'+l.itemId+'_'+seed).replace(/[^\w\-]/g,'_').slice(0,150);
    if(!l.units.length) return (l._applied={status:'skipped',opId});
    const missing=l.units.filter(u=>u.state==='missing');
    if(missing.length){
      await C.fstore.collection('alerts_gieogieo').doc(('shift_weigh_unconfirmed_'+day+'_'+l.itemId).replace(/[^\w\-]/g,'_').slice(0,180)).set(_st({
        type:'shift_weigh_unconfirmed', severity:'warning', status:'new', businessDate:day, createdAt:nowISO,
        itemId:l.itemId, itemName:l.itemName,
        title:`"${l.itemName}" cân cuối ca: ${missing.length} mã đang mở không có trên tay`,
        codes:missing.map(u=>u.code||''), opId,
        note:'Chưa chỉnh số của mã nào và chưa chốt nợ của món này. Kiểm tra mã đó đã dùng hết (vứt vỏ) hay thất lạc, rồi báo hết / báo mất đúng luồng.',
        staff:staffEmp.fullName, staffEmployeeId:staffEmp.id
      }),{merge:true});
      return (l._applied={status:'unconfirmed',opId});
    }
    // Mốc còn đang chờ (vừa gõ xong) → lấy nốt; mốc không đọc được thì lấy lại ngay bây giờ.
    for(let j=0;j<l.units.length;j++){
      const u=l.units[j];
      const i=C.state._shiftInventoryCountStatePOS().lines.indexOf(l);
      if(u._t){ clearTimeout(u._t); u._t=null; u._p=C.af.shiftWeighCaptureBaselinePOS(i,j); }
      if(u._p) await u._p;
      if(u.baseline===null && !u.gone) await C.af.shiftWeighCaptureBaselinePOS(i,j);
      if(u.gone || u.baseline===null) throw shiftWeighErr(l.itemName+': mã '+u.code+' không còn đang mở hoặc chưa đọc được sổ — tải lại mã của món này','SW_RELOAD');
    }
    // Lệch > 25% dung tích (hoặc của số sổ nếu mã không có dung tích) gần như luôn là cân sai
    // (quên bì, chọn nhầm dụng cụ, nhầm đơn vị) chứ không phải hao hụt thật. Hỏi lại một lần.
    const devs=l.units.filter(u=>{
      const base=u.capacity>0?u.capacity:Math.max(Math.abs(u.baseline),1);
      return Math.abs(u.baseline-u.weighed)>base*SHIFT_WEIGH_DEVIATION_PCT/100;
    });
    if(devs.length && !l._devAck && !l._rtDone){
      throw shiftWeighErr(l.itemName+': số cân của mã '+devs.map(u=>u.code).join(', ')+' lệch nhiều so với sổ. Kiểm tra lại bì, dụng cụ đựng và đơn vị rồi cân lại.','SW_DEVIATION');
    }
    const meta={itemId:l.itemId, itemName:l.itemName, unit:l.unit, opId, day,
      staffName:staffEmp.fullName||'', staffId:staffEmp.id||'', largeDevIds:devs.map(u=>u.id)};
    const closeRef=C.fstore.collection('daily_closings_gieogieo').doc(day);
    let res=l._rtDone||null;
    if(!res){
      await prepReconAssertFree(l.itemId, null);
      // [BỀN VỮNG] Ghi lượt dở dang TRƯỚC khi đổi RT. App tắt / mất mạng đúng lúc RT đã ghi mà sổ
      // chưa ghi → lần vào bước kiểm kê cuối ca kế tiếp tự hoàn tất nốt (shiftWeighHealPendingPOS),
      // không để tồn đổi mà thiếu dòng sổ. Ghi lỗi thì DỪNG — RT chưa bị đụng tới.
      await closeRef.set(_st({ shiftWeighPending: { [opId]: { ...meta, stage:'planned', at:nowISO,
        unitIds:l.units.map(u=>u.id) } } }), { merge:true });
      const parent=_ueActiveUnitsRef(l.itemId);
      const known=new Set(l.units.map(u=>u.id));
      for(let attempt=0; attempt<4 && !res; attempt++){
        const map=(await parent.once('value')).val()||{};
        let out=null, abort='', overwritten=[];
        const r=await parent.transaction(cur=>{
          out=null; abort=''; overwritten=[];
          // Callback lần đầu có thể nhận null từ cache dù máy chủ có dữ liệu — dùng snapshot vừa
          // đọc để máy chủ tự phát hiện xung đột và gọi lại (cùng cách prepReconSetUnit).
          const src=cur==null?map:cur;
          if(!src || !Object.keys(src).length){ abort='empty'; return; }
          if(src.__prepLock){ abort='prep_lock'; return; }
          const applied=l.units.filter(u=>src[u.id] && src[u.id].shiftWeigh && src[u.id].shiftWeigh.op===opId);
          if(applied.length===l.units.length){ out={already:true,src}; return; }
          if(applied.length){ abort='partial'; return; }
          overwritten=l.units.filter(u=>src[u.id] && shiftWeighAbsSig(src[u.id])!==(u.baselineSig||''));
          if(overwritten.length){ abort='concurrent'; return; }
          const ids=Object.keys(src).filter(k=>k!=='__prepLock' && src[k] && typeof src[k]==='object');
          if(ids.some(k=>!src[k].finishedDebt && !src[k].discardPending && !known.has(k))){ abort='new_unit'; return; }
          if(l.units.some(u=>!src[u.id] || src[u.id].finishedDebt || src[u.id].discardPending)){ abort='unit_gone'; return; }
          const per=l.units.map(u=>{
            const node=src[u.id], before=round2(Number(node.unitBase)||0);
            return {id:u.id, code:node.code||u.code||'', openedAt:Number(node.openedAt)||0,
              before, after:round2(u.weighed+(before-u.baseline)), baseline:u.baseline, weighed:u.weighed};
          });
          const debt=ids.filter(k=>src[k].finishedDebt && !src[k].discardPending)
            .map(k=>({id:k, code:src[k].code||k, amount:round2(Number(src[k].unitBase)||0)}));
          const newest=per.reduce((a,b)=>(b.openedAt>=a.openedAt?b:a), per[0]);
          const next={...src};
          per.forEach(p=>{
            next[p.id]={...src[p.id], unitBase:p.after, shiftWeigh:{op:opId, before:p.before, after:p.after,
              baseline:p.baseline, weighed:p.weighed, newest:p.id===newest.id, ...(p.id===newest.id && debt.length?{debt}:{})}};
          });
          debt.forEach(d=>{ delete next[d.id]; });
          out={already:false, per, debt, newestId:newest.id};
          return next;
        });
        if(out && out.already){ res=shiftWeighResFromRtPOS(out.src, l.units.map(u=>u.id), opId); break; }
        if(r.committed && out){
          const saved=(r.snapshot && r.snapshot.val()) || {};
          if(!l.units.every(u=>saved[u.id] && saved[u.id].shiftWeigh && saved[u.id].shiftWeigh.op===opId))
            throw shiftWeighErr(l.itemName+': không xác nhận được số vừa ghi — bấm xác nhận lại (an toàn, không ghi đôi)');
          res={per:out.per, debt:out.debt, newestId:out.newestId}; break;
        }
        if(abort==='prep_lock'||abort==='partial'||abort==='new_unit'||abort==='unit_gone'||abort==='empty'||abort==='concurrent'){
          // RT chưa bị đổi — bỏ lượt dở dang đã ghi ở trên để bước tự bù không phải đoán.
          await closeRef.update({ ['shiftWeighPending.'+opId]: C.FieldValue.delete() }).catch(()=>{});
        }
        if(abort==='concurrent'){
          // Số cân của các mã này không còn áp được — buộc cân lại (vẫn giữ xác nhận đang cầm mã).
          overwritten.forEach(u=>shiftWeighResetUnitPOS(u));
          throw shiftWeighErr(l.itemName+': mã '+overwritten.map(u=>u.code).join(', ')+' vừa được chỉnh số ở nơi khác sau lúc cân — cân lại mã đó','SW_RELOAD');
        }
        if(abort==='prep_lock') throw shiftWeighErr(l.itemName+' đang chờ cân của mẻ chế biến — chốt mẻ trước rồi xác nhận lại');
        if(abort==='partial') throw shiftWeighErr(l.itemName+': lượt cân này đã ghi dở trên một phần mã — báo Quản lý kiểm tra, không tự ghi lại');
        if(abort==='new_unit'||abort==='unit_gone'||abort==='empty')
          throw shiftWeighErr(l.itemName+': danh sách mã đang mở vừa đổi (có mã mới mở hoặc vừa báo hết) — tải lại mã của món này rồi cân lại','SW_RELOAD');
        await new Promise(rs=>setTimeout(rs,120*(attempt+1)));
      }
      if(!res) throw shiftWeighErr('Chưa ghi được số cân của '+l.itemName+' — bấm xác nhận lại (an toàn, không ghi đôi)');
      l._rtDone=res;
      // Kết quả RT vào lượt dở dang — tự bù sau này không phụ thuộc node RT còn sống hay không.
      await closeRef.set(_st({ shiftWeighPending: { [opId]: { stage:'rt_done', result:res } } }), { merge:true })
        .catch(err=>console.warn('[Cân cuối ca] ghi kết quả RT vào lượt dở dang lỗi (vẫn tự bù được từ RT)', err));
    }
    const sum=await shiftWeighFinishPOS(meta, res);
    if(devs.length){
      await C.fstore.collection('alerts_gieogieo').doc(('shift_weigh_large_dev_'+opId).slice(0,180)).set(_st({
        type:'shift_weigh_large_deviation', severity:'warning', status:'new', businessDate:day, createdAt:nowISO,
        itemId:l.itemId, itemName:l.itemName, opId, codes:devs.map(u=>u.code||''),
        title:`"${l.itemName}" cân cuối ca: mã ${devs.map(u=>u.code).join(', ')} lệch nhiều so với sổ — nhân viên đã xác nhận vẫn ghi`,
        note:'Hao hụt/dư của lượt này đã ghi theo số cân. Nếu là cân sai, chỉnh lại mã ở Kho ▸ Cân lại mã.',
        staff:staffEmp.fullName, staffEmployeeId:staffEmp.id
      }),{merge:true}).catch(()=>{});
    }
    await closeRef.update({ ['shiftWeighPending.'+opId]: C.FieldValue.delete() })
      .catch(err=>console.warn('[Cân cuối ca] dọn lượt dở dang lỗi (lần tự bù sau chạy lại vô hại)', err));
    return (l._applied={status:'reconciled', opId, ...sum});
  }

  // [E4.2] Cấp lại mã cho MỘT tem — chép khối ghi dùng chung của missingLabelDoReprint /
  // bulkReprintByDateConfirm (posgieo.html). Đọc lại ngay trước khi ghi; chỉ tem sealed/open.
  // Trả { containerId, oldCode, newCode, itemName } hoặc null (bỏ qua).
  async function codesReprint(containerId, o) {
    const staffId = (o && o.staffId) || '', reason = (o && o.reason) || '';
    const nowISO = (o && o.nowISO) || new Date(C.now()).toISOString();
    const ref = C.fstore.collection(STOCK_CONTAINERS_COLL).doc(containerId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const c = doc.data();
    // Đọc lại NGAY TRƯỚC KHI GHI — nếu ai đó vừa tìm thấy tem này và quét mở/báo hết
    // trong lúc đang xử lý ở đây thì bỏ qua, đừng cấp tem mới đè lên một container đã
    // đổi trạng thái từ lúc đối chiếu xong tới giờ.
    if (c.status !== 'sealed' && c.status !== 'open') return null;
    const oldCode = c.code || '';
    const newCode = await genStockContainerCode(c.itemId, c.itemName, c.businessDate);
    const events = Array.isArray(c.labelEvents) ? c.labelEvents.slice() : [];
    events.push({ type: 'REPORTED_MISSING', timestamp: nowISO, employeeId: staffId, oldLabelId: oldCode, newLabelId: null, reason, referenceId: null });
    events.push({ type: 'REPRINTED', timestamp: nowISO, employeeId: staffId, oldLabelId: oldCode, newLabelId: newCode, reason, referenceId: null });
    await ref.update({
      code: newCode,
      // originalLabelId giữ nguyên từ lần cấp tem ĐẦU TIÊN — không ghi đè qua nhiều
      // lần reprint, để luôn truy ngược được về tem gốc.
      originalLabelId: c.originalLabelId || oldCode,
      labelStatus: 'active',
      labelEvents: events,
      // Tem MỚI chưa in — phải rơi vào đúng hàng đợi "Tem chưa dán" có sẵn để nhân
      // viên in & dán lên, không tự bịa luồng in riêng.
      labelPrinted: false, labelPrintedAt: null
    });
    // [UNIT ENGINE v2] Tem đang 'open' có 1 bản sao `code` sống trong RT (dùng để hiện
    // trong toast/log lúc trừ kho) — containerId (khoá RT) không đổi khi cấp lại tem, chỉ
    // riêng `code` đổi, nên phải đồng bộ theo, không thì log sau này hiện mã CŨ trong khi
    // tem thật đã dán mã MỚI.
    if (c.status === 'open') {
      _ueActiveUnitsRef(c.itemId).child(containerId).update({ code: newCode })
        .catch(err => console.warn('[UnitEngine] đồng bộ code mới vào RT lỗi (không chặn cấp lại tem)', err));
    }
    return { containerId, oldCode, newCode, itemName: c.itemName || '' };
  }

  // [E4.2] Tìm lại tem đã báo mất — chép khối ghi của submitFoundLostContainer (posgieo.html):
  // đăng ký lại RT nếu tem đang mở lúc mất, trả trạng thái, ghi ADJUSTMENT +dung tích (tồn chốt theo tem).
  // Trả { status: 'ok'|'not_found'|'not_lost', c, nowISO }.
  async function lifecycleMarkFound(id, staffEmp) {
    const ref = C.fstore.collection(STOCK_CONTAINERS_COLL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return { status: 'not_found' };
    const c = doc.data();
    if (c.status !== 'lost') return { status: 'not_lost', c };
    const restoreStatus = c.lostFromStatus || 'sealed';
    const nowISO = new Date(C.now()).toISOString();
    // [BUG "Tìm lại hàng báo mất" — FIX] Nếu tem này ĐANG MỞ lúc bị báo mất, nó đã bị gỡ khỏi
    // RT khi chuyển sang 'lost' (xem approveLostReport/reportLostContainerManual bên
    // quanlygieo.html) — phục hồi status Firestore về 'open' thôi thì RT vẫn KHÔNG biết tem
    // này tồn tại, lần _ueRecomputeCurrentStock kế tiếp (bất kỳ lượt bán nào khác của CÙNG
    // nguyên liệu) sẽ suy currentStock thiếu mất đúng phần unitBase của tem này — coi như
    // tem tìm lại được vẫn bị "biến mất" khỏi kho sau vài lượt bán. Phải đăng ký lại vào RT
    // TRƯỚC khi đổi status — dùng baseQty (dung tích đầy) chứ không phải unitBase còn dở lúc
    // mất, để KHỚP với đúng số đang được cộng vào tồn kho ngay dưới đây (applyStockTransactionPOS
    // qty:+baseQty — quy ước sẵn có: tìm lại tính như tem mới nguyên, không suy luận lại phần
    // đã dùng trước khi mất).
    if (restoreStatus === 'open') {
      try {
        await _ueRetryAsync(() => _ueActiveUnitsRef(c.itemId).child(id).set({
          code: c.code || '', itemName: c.itemName || '', unit: c.unit || '',
          unitBase: Number(c.baseQty) || 0,
          capacity: Number(c.baseQty) || 0, openedAt: c.openedAt ? new Date(c.openedAt).getTime() : C.now()
        }));
      } catch (err) {
        console.error('[UnitEngine] đăng ký lại RT cho tem tìm lại lỗi sau 3 lần thử', id, err);
        C.hooks.report('⚠️ Tìm lại được ' + (c.code || '') + ' nhưng lỗi đồng bộ realtime', 'Tìm lại tem: lỗi đồng bộ', { ref: c.code || '' });
      }
  }
  await ref.update({
    status: restoreStatus,
    foundAt: nowISO, foundBy: staffEmp.fullName, foundByEmployeeId: staffEmp.id
  });
  await applyStockTransactionPOS({
    itemId: c.itemId, type: 'ADJUSTMENT', qty: Number(c.baseQty) || 0,
    note: 'Tìm lại hàng báo mất — mã ' + (c.code || ''), staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
    referenceId: id,
    // Mã đã về sealed/open (và RT nếu đang mở) ở trên — tồn chốt lại theo tem.
    deriveFromUnits: true,
    // reason: phân loại nhỏ hơn type — báo cáo cuối kỳ bên Quản lý tách riêng "Tìm lại
    // được" khỏi Điều chỉnh chung (xem computeLedgerRealMetrics bên quanlygieo.html).
    meta: { reason: 'lost_item_found' }
  });
    return { status: 'ok', c, nowISO };
  }

  // [E4.8] Vết bill → tem/lô (order_stock_traces) — dữ liệu engine; app quy công thức, engine ghi.
  function consumeWriteTrace(orderId, data, opts) { return C.fstore.collection('order_stock_traces_gieogieo').doc(orderId).set(_st(data), opts || { merge: true }); }

  // [E4 — Quản lý] Tên Quản lý vẫn dùng trong các nghiệp vụ chép nguyên văn từ quanlygieo.html.
  const CTN_COLL = STOCK_CONTAINERS_COLL;
  // [F1] Mốc mở (ms) của một lô BTP theo dữ liệu Firestore: lô "mở" lúc nấu xong.
  function _batchOpenedAtMs(b) {
    const v = b && (b.openedAt || b.finishedAt || b.completedAt);
    if (typeof v === 'number') return v;
    const t = Date.parse(v || '');
    return isFinite(t) ? t : 0;
  }
  // Suy tồn NL — bản Quản lý: không tính được thì BÁO LỖI (nơi gọi tự bắt), trả về tồn vừa tính.
  async function recomputeTemStock(itemId) {
    const v = await _ueRecomputeCurrentStock(itemId, STOCK_CONTAINERS_COLL);
    if (v === null || v === undefined) throw new Error('Không tính lại được tồn theo mã của ' + itemId);
    return v;
  }
  async function recomputePrepStock(prepId) { await _ueRecomputeCurrentStock(prepId, 'prep_batches_gieogieo'); }
  function logStockAnomaly(docId, a) { return logStockAnomalyPOS(docId, a); }

  // [E4.4/E4.9 — Quản lý] chép nguyên văn từ quanlygieo.html: setLocationStock, prepBatchSetQtyCore, prepBatchRestoreCore, approvePendingLostReportsForItem, ctnAdjustCore
  // Ghi 1 dòng ledger cho mỗi lần đặt số — không có vết thì lần sau nhìn con số lạ
  // sẽ không ai biết là do đếm lại hay do lỗi.
  async function setLocationStock({itemId, locationId, locationName, qty, staff}){
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(itemId);
    const txRef = C.fstore.collection('stock_transactions_gieogieo').doc();
    await C.fstore.runTransaction(async (t)=>{
      const lock=await t.get(C.fstore.collection('prep_ingredient_locks_gieogieo').doc(itemId));
      if(lock.exists)throw new Error('NL đang chờ cân của mẻ — chốt mẻ trước khi đặt lại tồn quầy');
      const doc = await t.get(itemRef);
      if(!doc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
      const data = doc.data();
      const prev = Number((data.locationStock||{})[locationId])||0;
      t.update(itemRef, { [`locationStock.${locationId}`]: Number(qty), updatedAt:new Date(C.now()).toISOString() });
      t.set(txRef, _st({
        itemId, type:'LOC_SET', qty: Number(qty)-prev,
        prevLocStock: prev, resultingLocStock: Number(qty),
        resultingStock: Number(data.currentStock)||0,   // tổng KHÔNG đổi, ghi lại cho màn lịch sử đọc được
        locationId, locationName: locationName||'',
        note: `Đếm và đặt lại tồn tại ${locationName||locationId}`,
        staff: staff||'', createdAt:new Date(C.now()).toISOString(),
        businessDate: C.af.dkey(new Date(C.now())), status:'posted', source:'management'
      }));
    });
  }

  // [MỚI] Sửa TRỰC TIẾP số lượng còn lại của một lô ĐANG 'active'/'cooking' (chưa từng
  // bị đóng) — dùng cho chiều "dư" của cảnh báo lệch đếm BTP: nhân viên đếm cuối ca gõ
  // nhầm số CAO hơn hệ thống, hệ thống ghi đè thẳng qtyRemaining của lô mà không qua bước
  // duyệt nào (xem _submitPrepCountImpl bên posgieo.html). Khác hẳn prepBatchRestoreCore()
  // bên dưới (dành cho lô ĐÃ bị đánh dấu 'hết' rồi mở lại): lô active vẫn đang đóng góp
  // đúng qtyRemaining HIỆN TẠI vào currentStock rồi, nên chỉ được cộng/trừ đúng PHẦN
  // CHÊNH LỆCH (delta) — cộng nguyên qty như bên kia sẽ ra tồn kho tăng gấp đôi.
  async function prepBatchSetQtyCore(batchId, qty){
    const batchRef = C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    const batchDoc = await batchRef.get();
    if(!batchDoc.exists) throw new Error('Lô không còn tồn tại');
    const b = batchDoc.data();
    const before = Number(b.qtyRemaining) || 0;
    const delta = Math.round((qty - before)*100)/100;
    const nowISO = new Date(C.now()).toISOString();
    await batchRef.update({
      qtyRemaining: qty, unitBase: qty,
      correctedAt: nowISO, correctedBy: 'management', correctedFromQty: before,
      correctedNote: 'Điều chỉnh — nhân viên đếm cuối ca ghi nhầm số, sửa lại theo số Quản lý nhập'
    });
    // Đồng bộ RTDB (Unit Engine) — GHI ĐÈ thẳng unitBase mới, cùng cách _submitPrepCountImpl()
    // bên POS đã ghi lúc đếm cuối ca (không phải cộng/trừ delta ở đây, RT lưu số tuyệt đối).
    let rtOk = false;
    try{
      await _ueActiveUnitsRef(b.prepId).child(batchId).transaction(cur => ({
        code: (cur && cur.code) || b.batchCode || '', itemName: (cur && cur.itemName) || b.prepName || '',
        unit: (cur && cur.unit) || b.unit || '', capacity: (cur && cur.capacity) || Number(b.qtyInitial) || qty,
        openedAt: (cur && cur.openedAt) || C.now(), unitBase: qty
      }));
      rtOk = true;
    }catch(rtErr){
      console.warn('[Điều chỉnh] ghi RTDB lỗi — Firestore đã đúng số, đánh dấu _ueRtStale để không bị ăn nhầm:', rtErr);
    }
    await batchRef.update({ _ueRtStale: !rtOk });

    // RT đã đúng số → chốt tồn theo tổng lô; RT lỗi thì cộng tay (lô đã đánh dấu _ueRtStale).
    if(rtOk) await recomputePrepStock(b.prepId);
    else{
      const prepRef = C.fstore.collection('prep_items_gieogieo').doc(b.prepId);
      await C.fstore.runTransaction(async t=>{
        const doc = await t.get(prepRef);
        if(!doc.exists) return;
        const cur = Number(doc.data().currentStock)||0;
        t.update(prepRef, { currentStock: Math.round((cur+delta)*100)/100, updatedAt: nowISO });
      });
    }

    return { b, qty, delta, rtOk };
  }

  // [SỬA] Lõi khôi phục lô — tách ra dùng chung cho CẢ HAI lối vào:
  //   1. Từ cảnh báo "Lệch đếm bán thành phẩm" (submitPrepVarianceAdjust)
  //   2. Từ ngay dòng "Bán hết"/"Hết hạn/bỏ" trong popup "Hoạt động BTP" ở màn
  //      Hôm nay (submitBatchAdjustDirect) — thêm theo yêu cầu: cảnh báo vừa mới
  //      có mã lô gần đây, còn lô cũ hơn (hoặc đang xem trực tiếp trong feed)
  //      vẫn cần sửa được mà không phải đoán qua cảnh báo nào.
  // Cả hai lối vào đều chỉ cần TRUYỀN ĐÚNG batchId — không còn phải đoán "lô nào
  // bị hết cùng lúc" từ bên ngoài: hàm này tự tra bằng CHÍNH mốc usedUpAt/expiredAt
  // của lô đang sửa (đọc TRƯỚC khi xoá 2 trường đó), nên đúng bằng cách cảnh báo
  // vẫn dùng, chỉ khác nguồn gốc mốc thời gian.
  // CHỈ dùng cho lô ĐÃ bị đóng (used_up/expired) — lô còn 'active' dùng
  // prepBatchSetQtyCore() ở trên, KHÔNG dùng hàm này (sẽ cộng đúp tồn kho).
  async function prepBatchRestoreCore(batchId, qty){
    const batchRef = C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    const batchDoc = await batchRef.get();
    if(!batchDoc.exists) throw new Error('Lô không còn tồn tại');
    const b = batchDoc.data();
    const markedAt = b.usedUpAt || b.expiredAt || null;

    // Có lô nào KHÁC của cùng nguyên liệu cũng bị đánh dấu hết đúng cùng khoảnh khắc
    // này không — quyết định có đảo được dòng hao hụt hay không (đọc TRƯỚC khi sửa,
    // vì sau khi sửa chính lô này sẽ không còn usedUpAt/expiredAt để tự khớp mình nữa).
    let siblingCount = 0;
    if(markedAt){
      const [usedUpSnap, expiredSnap] = await Promise.all([
        C.fstore.collection('prep_batches_gieogieo').where('prepId','==',b.prepId).where('usedUpAt','==',markedAt).get(),
        C.fstore.collection('prep_batches_gieogieo').where('prepId','==',b.prepId).where('expiredAt','==',markedAt).get()
      ]);
      const ids = new Set();
      usedUpSnap.forEach(d=>{ if(d.id!==batchId) ids.add(d.id); });
      expiredSnap.forEach(d=>{ if(d.id!==batchId) ids.add(d.id); });
      siblingCount = ids.size;
    }

    const nowISO = new Date(C.now()).toISOString();
    await batchRef.update({
      qtyRemaining: qty, unitBase: qty, status: 'active',
      usedUpAt: null, expiredAt: null, expiredReason: null,
      correctedAt: nowISO, correctedBy: 'management', correctedFromStatus: b.status,
      correctedNote: 'Điều chỉnh — nhân viên báo hết nhầm, khôi phục theo số Quản lý nhập'
    });

    // [MỚI] Ghi lại đúng node RTDB của lô này — đây mới là nguồn THẬT mà Unit Engine
    // bên POS dùng để biết "bán/nấu tiếp thì lấy từ lô nào" theo thời gian thực. Node
    // này đã bị XOÁ lúc lô báo hết (xem posgieo.html: nhánh discard của
    // _submitPrepCountImpl gọi `.remove()`) — không ghi lại thì lô tuy đúng số ở
    // Firestore nhưng "vô hình" với FIFO cho tới tận lần kiểm kê cuối ngày kế tiếp mới
    // tự đồng bộ lại. Dùng ĐÚNG path + schema với _ueActiveUnitsRef() bên POS.
    let rtOk = false;
    try{
      await _ueActiveUnitsRef(b.prepId).child(batchId).set({
        code: b.batchCode || '', itemName: b.prepName || '', unit: b.unit || '',
        // [F1 — chủ dự án duyệt] Giữ mốc mở GỐC của lô (lô BTP "mở" lúc nấu xong — finishedAt) để lô
        // khôi phục đứng đúng chỗ trong hàng FIFO (B3). Trước đây openedAt = giờ khôi phục → lô cũ
        // nhảy xuống cuối hàng, bán/nấu tiếp lấy lô mới trước dù lô cũ gần hết hạn hơn.
        capacity: Number(b.qtyInitial) || qty, openedAt: _batchOpenedAtMs(b) || C.now(), unitBase: qty
      });
      rtOk = true;
    }catch(rtErr){
      console.warn('[Điều chỉnh] ghi RTDB lỗi — Firestore đã đúng số, đánh dấu _ueRtStale để không bị ăn nhầm:', rtErr);
    }
    // RT ghi được thì tin RT (mới, khớp Firestore) — RT lỗi thì đánh dấu stale để lần suy
    // tồn tiếp theo bên POS biết bỏ qua RT (thiếu node) và tin số Firestore vừa sửa.
    await batchRef.update({ _ueRtStale: !rtOk });

    // Lô này vừa đóng góp lại đúng bằng ấy vào currentStock (trước đó đang đóng góp 0 vì bị
    // đánh dấu hết) — cộng thẳng vào Firestore, KHÔNG suy lại toàn bộ từ RTDB (app này
    // không chạy engine recompute đầy đủ như POS, chỉ ghi đúng 1 node vừa sửa ở trên).
    if(rtOk) await recomputePrepStock(b.prepId);
    else{
      const prepRef = C.fstore.collection('prep_items_gieogieo').doc(b.prepId);
      await C.fstore.runTransaction(async t=>{
        const doc = await t.get(prepRef);
        if(!doc.exists) return;
        const cur = Number(doc.data().currentStock)||0;
        t.update(prepRef, { currentStock: Math.round((cur+qty)*100)/100, updatedAt: nowISO });
      });
    }

    // Chỉ đảo lại đúng dòng hao hụt của lượt đếm gốc khi ĐÂY LÀ LÔ DUY NHẤT bị đánh dấu hết
    // đúng khoảnh khắc đó — có từ 2 lô trở lên thì không tách được phần nào của dòng waste
    // (ghi gộp theo nguyên liệu) thuộc đúng lô đang sửa, nên bỏ qua thay vì đoán.
    let daoHaoHut = 0;
    if(markedAt && siblingCount===0){
      const businessDate = C.af.dkey(new Date(markedAt));
      const txSnap = await C.fstore.collection('prep_transactions_gieogieo')
        .where('prepId','==',b.prepId).where('businessDate','==',businessDate).where('type','==','WASTE').get();
      const dong = txSnap.docs.filter(d => d.data().createdAt===markedAt && d.data().fromPrepCount && !d.data().reclassifiedFrom);
      if(dong.length){
        const wbatch = C.fstore.batch();
        dong.forEach(d => { daoHaoHut += Math.abs(Number(d.data().qty)||0); wbatch.update(d.ref, {
          type: 'ADJUSTMENT',
          reclassifiedFrom: 'WASTE', reclassifiedAt: nowISO, reclassifiedBy: 'management',
          reclassifyReason: 'Báo hết nhầm — lô thực tế vẫn còn, đã điều chỉnh lại đúng tồn',
          note: 'ĐIỀU CHỈNH (đảo từ hao hụt ghi nhầm do báo hết sai) · ' + (d.data().note||'')
        }); });
        await wbatch.commit();
      }
    }

    return { b, qty, rtOk, daoHaoHut };
  }

  // Duyệt các phiếu báo mất đang chờ của MỘT nguyên liệu (nhân viên bấm "Không tìm thấy" ở
  // màn Kiểm tra lại của kiểm kê POS). Mã → 'lost' (giữ lostFromStatus để POS "Tìm lại hàng
  // báo mất" phục hồi đúng), gỡ khỏi RT nếu đang mở, ghi Sổ lệch 'lost', rồi tính lại tồn.
  async function approvePendingLostReportsForItem(itemId, countId, codes){
    const snap = await C.fstore.collection('stock_lost_reports_gieogieo')
      .where('itemId','==',itemId).where('status','==','pending_review').get();
    const nowISO = new Date(C.now()).toISOString();
    // Phiếu kiểm kê mới ghi đúng danh sách mã báo mất của lượt đó; phiếu cũ (chưa có danh sách)
    // thì duyệt mọi phiếu báo mất đang chờ của món như trước.
    const docs = Array.isArray(codes) ? snap.docs.filter(d=>codes.includes(d.data().code)) : snap.docs;
    let loi = 0;
    for(const rep of docs){
      const r = rep.data();
      const cRef = C.fstore.collection(CTN_COLL).doc(r.containerId);
      let lostQty = 0, meta = null;
      // Tem ĐANG MỞ: gỡ khỏi RT (nguồn thật của phần đang mở) TRƯỚC khi đổi trạng thái. Gỡ lỗi thì
      // để phiếu nguyên 'pending_review' — duyệt lại sẽ thử tiếp. Làm ngược lại (duyệt trước, gỡ
      // sau) thì gỡ lỗi là tem đã 'lost' nhưng vẫn nằm trong RT, tồn tính lại vẫn cộng nó.
      let liveUB = null;
      const pre = await cRef.get();
      if(pre.exists && pre.data().status === 'open'){
        try{
          const live = (await _ueActiveUnitsRef(itemId).child(r.containerId).once('value')).val();
          if(live) liveUB = Number(live.unitBase)||0;
          let ok = false;
          for(let i=0;i<3 && !ok;i++){
            try{ await _ueActiveUnitsRef(itemId).child(r.containerId).remove(); ok = true; }
            catch(e){ if(i<2) await new Promise(res=>setTimeout(res,400)); else throw e; }
          }
        }catch(err){ console.warn('[báo mất] gỡ RT lỗi — để phiếu chờ, duyệt lại sau', r.containerId, err); loi++; continue; }
      }
      await C.fstore.runTransaction(async t=>{
        lostQty = 0; meta = null;
        const cDoc = await t.get(cRef);
        const repDoc = await t.get(rep.ref);
        if(!repDoc.exists || repDoc.data().status !== 'pending_review') return;
        if(!cDoc.exists || !['sealed','open'].includes(cDoc.data().status)){
          t.update(rep.ref, {status:'rejected', reviewedAt:nowISO, reviewNote:'Mã không còn ở trạng thái chưa mở/đang mở'});
          return;
        }
        const c = cDoc.data();
        meta = { status: c.status, code: c.code||'', itemName: c.itemName||'', unit: c.unit||'' };
        lostQty = c.status === 'sealed' ? (Number(c.baseQty)||0) : (Number(c.unitBase)||0);
        t.update(cRef, {status:'lost', lostFromStatus:c.status, lostAt:nowISO, lostBy:'management',
          lostReportId: rep.id, lostCountId: countId||''});
        t.update(rep.ref, {status:'approved', reviewedAt:nowISO, approvedVia:'stock_count', countId: countId||''});
      });
      if(!meta) continue;
      if(meta.status === 'open' && liveUB !== null) lostQty = liveUB;
      await C.fstore.collection('stock_transactions_gieogieo').doc('lost_'+rep.id).set(_st({
        itemId, type:'WASTE', qty:-lostQty, reason:'lost_item', containerId:r.containerId,
        note:`Mất mã ${meta.code} (không tìm thấy khi kiểm kê)`, staff: r.reportedBy||'',
        referenceId: rep.id, createdAt: nowISO, businessDate: C.af.dkey(new Date(C.now())), status:'posted', source:'management'
      })).catch(err=>console.warn('[báo mất] ghi sổ lỗi', err));
      await logStockAnomaly('lost_'+rep.id, {itemId, itemName: meta.itemName, unit: meta.unit, qty: -lostQty,
        kind:'lost', txType:'WASTE', note:`Mất mã ${meta.code} — không tìm thấy khi kiểm kê`, referenceId: rep.id, staff: r.reportedBy||''});
    }
    await recomputeTemStock(itemId);
    if(loi) throw new Error(loi + ' mã đang mở chưa gỡ được khỏi realtime — duyệt lại để thử tiếp');
  }

  async function ctnAdjustCore(c, qty, expected, opId, note){
    const parent = _ueActiveUnitsRef(c.itemId);
    // Đọc node cha từ máy chủ trước: transaction RTDB có thể được gọi lần đầu với cache rỗng.
    const map = (await parent.once('value')).val() || {};
    let before = null, abort = '';
    const res = await parent.transaction(cur => {
      before = null; abort = '';
      const src = cur == null ? map : cur;
      if(src.__prepLock){ abort = 'lock'; return; }
      const u = src[c.id];
      if(!u){ abort = 'missing'; return; }
      if(u.lastMgrAdjustOp === opId){ before = Number(u.lastMgrAdjustBefore) || 0; return src; }  // lượt trước đã ghi RTDB
      if(Math.abs((Number(u.unitBase) || 0) - expected) > 0.015){ abort = 'amount'; return; }
      before = Number(u.unitBase) || 0;
      return { ...src, [c.id]: { ...u, unitBase: qty, lastMgrAdjustOp: opId, lastMgrAdjustBefore: before } };
    });
    if(!res.committed){
      if(abort === 'lock') throw new Error('Nguyên liệu vừa bị khóa cho một mẻ chế biến. Chốt số cân bên POS rồi sửa lại.');
      if(abort === 'missing') throw new Error('Mã này vừa được báo hết hoặc không còn mở. Chưa sửa gì.');
      if(abort === 'amount') throw new Error('Tồn của mã vừa đổi (có bill mới trừ kho). Chưa sửa gì. Bấm Quay lại rồi mở Sửa tồn lại để xem số mới.');
      throw new Error('Chưa ghi được tồn mới. Bấm Lưu lại.');
    }
    const delta = Math.round((qty - before)*100)/100;
    const nowISO = new Date(C.now()).toISOString();
    C.af.memoDropItems();
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(c.itemId);
    const txRef = C.fstore.collection('stock_transactions_gieogieo').doc(opId);
    const ctnRef = C.fstore.collection(CTN_COLL).doc(c.id);
    try{
      await C.fstore.runTransaction(async t => {
        const done = await t.get(txRef);
        if(done.exists) return;
        const it = await t.get(itemRef);
        if(!it.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
        const next = Math.round(((Number(it.data().currentStock) || 0) + delta)*100)/100;
        t.update(itemRef, { currentStock: next, updatedAt: nowISO });
        t.set(txRef, _st({
          itemId: c.itemId, type: 'ADJUSTMENT', qty: delta, resultingStock: next,
          note: `Sửa tồn mã ${c.code||''}: ${C.af.fmtNum(before,2)} → ${C.af.fmtNum(qty,2)} ${c.unit||''}` + (note ? ' · ' + note : ''),
          staff: 'Quản lý', createdAt: nowISO, businessDate: C.af.dkey(new Date(C.now())),
          status: 'posted', source: 'management', referenceId: c.id
        }));
        t.update(ctnRef, { unitBase: qty,
          managerAdjusts: C.FieldValue.arrayUnion({ at: nowISO, before, after: qty, note: note || '', op: opId }) });
      });
    }catch(err){
      // RTDB đã giữ số mới; lượt Lưu lại dùng cùng opId nên không trừ hai lần.
      throw new Error('Đã ghi tồn mới cho mã nhưng chưa ghi được sổ kho: ' + (err.message || err) + '. Bấm Lưu lại để hoàn tất.');
    }
    await recomputeTemStock(c.itemId).catch(err => console.warn('[Tem] chốt tồn theo mã lỗi', err));
    return { before, delta };
  }

  // [E4.3] Báo huỷ MỘT tem — chép khối ghi của _submitKhoTxImpl (posgieo.html). Claim trạng thái
  // discard_pending (transaction; retry giữ nguyên lý do/người/vị trí của lần đầu), chốt số dư
  // (tem đang mở: mốc RT discardBase), ghi WASTE txId cố định, đóng tem, gỡ mốc RT, chốt tồn.
  // o = { reason, note, atSource, staffEmp }. Trả { c, qty }.
  async function lifecycleRequestDiscard(scanned, o) {
    const reason = o.reason, staffEmp = o.staffEmp;
    const ref=C.fstore.collection(STOCK_CONTAINERS_COLL).doc(scanned.id);
    await prepReconAssertFree(scanned.itemId);
    // Claim trạng thái nguyên tử. Retry giữ nguyên lý do, người và vị trí của lần đầu.
    const c=await C.fstore.runTransaction(async t=>{
      const snap=await t.get(ref);
      if(!snap.exists||snap.data().code!==scanned.code)throw new Error('Mã tem đã đổi — quét lại');
      const old=snap.data();
      if(old.status==='finished')throw new Error(old.finishReason==='discarded'?'Mã đã báo hủy, không tính hai lần':'Mã đã báo hết');
      if(old.status==='discard_pending'){
        if(!old.discardPending?.reason)throw C.af.posMgrError('Báo hủy đang dở thiếu dữ liệu');
        return old;
      }
      if(old.status!=='sealed'&&old.status!=='open')throw new Error('Mã đã đổi trạng thái — quét lại');
      const item=await t.get(C.fstore.collection('inventory_items_gieogieo').doc(old.itemId));
      if(!item.exists||item.data().stockManaged===false)throw new Error('Nguyên liệu này không quản lý tồn bằng mã');
      const pending={originalStatus:old.status,at:new Date(C.now()).toISOString(),
        businessDate:C.businessDate(),reason,
        note:o.note||'',
        staff:staffEmp.fullName,staffEmployeeId:staffEmp.id,
        atSource:!!o.atSource};
      t.update(ref,{status:'discard_pending',discardPending:pending});
      return {...old,status:'discard_pending',discardPending:pending};
    });
    const pending=c.discardPending;
    let qty;
    if(pending.originalStatus==='open'){
      // Mốc RT ghi discardBase để mất ACK rồi quét lại vẫn dùng đúng lượng cũ.
      // Allocator bỏ qua mốc này nên không bán tiếp hoặc dồn nợ vào tem đã hủy.
      const rtRef=_ueActiveUnitsRef(c.itemId).child(scanned.id);
      const result=await _ueRetryAsync(()=>rtRef.transaction(cur=>{
        if(!cur)return;
        if(cur.discardPending)return cur;
        const live=Number(cur.unitBase);
        if(!Number.isFinite(live)||live<=0)return;
        return {...cur,unitBase:0,discardPending:true,discardBase:live};
      }));
      const live=result.snapshot?.val();
      if(!result.committed||!live?.discardPending||!(Number(live.discardBase)>0))
        throw C.af.posMgrError('Mã đang mở không còn số dương trong RT — chưa ghi hao hụt');
      qty=Number(live.discardBase);
    }else if(pending.originalStatus==='sealed')qty=Number(c.baseQty);
    else throw new Error('Trạng thái mã trước khi hủy không hợp lệ');
    if(!(qty>0))throw new Error('Mã không có lượng còn lại để hủy');
    await ref.update({'discardPending.wasteBase':qty});
    const note=`Hủy ${c.code||''} — ${fmtPrepQty(qty)} ${c.unit||''} · Lý do: ${pending.reason}`+
      (pending.note?' · '+pending.note:'');
    await applyStockTransactionPOS({
      itemId:c.itemId,type:'WASTE',qty:-qty,note,
      staff:pending.staff,staffEmployeeId:pending.staffEmployeeId,
      locationId:pending.atSource?'__SOURCE__':undefined,
      referenceId:scanned.id,deriveFromUnits:true,txId:'waste_unit_'+scanned.id,
      businessDate:pending.businessDate,
      meta:{wasteKind:'ingredient_unit',containerId:scanned.id,containerCode:c.code,
        discardReason:pending.reason,discardNote:pending.note||''}
    });
    await C.fstore.runTransaction(async t=>{
      const snap=await t.get(ref);
      if(!snap.exists||snap.data().status!=='discard_pending')
        throw C.af.posMgrError('Trạng thái mã đã đổi khi chốt hủy');
      t.update(ref,{status:'finished',finishedAt:pending.at,finishedBy:pending.staff,
        finishedByEmployeeId:pending.staffEmployeeId,finishReason:'discarded',
        finishScanned:true,discardReason:pending.reason,discardNote:pending.note||'',
        unitBase:qty,wasteBase:qty,wasteBasis:'scanned_discard',
        needsReview:false,needsReviewReasons:[],
        discardPending:C.FieldValue.delete()});
    });
    if(pending.originalStatus==='open')
      await _ueActiveUnitsRef(c.itemId).child(scanned.id).remove()
        .catch(err=>console.warn('Đã chốt hủy, dọn mốc RT lỗi (mốc không cộng tồn)',err));
    await _ueRecomputeCurrentStock(c.itemId,STOCK_CONTAINERS_COLL)
      .catch(err=>console.warn('Đã chốt hủy, đồng bộ tồn lỗi',err));
    return { c, qty };
  }

  // [E4.2 — lifecycle.open] Mở một tem còn seal — chép khối ghi của submitOpenContainer (posgieo.html).
  // [RACE FIX] Gộp đọc+kiểm tra+ghi vào 1 transaction Firestore: chỉ đúng 1 máy "thắng" claim
  // sealed→open; máy còn lại thấy status không còn 'sealed' và dừng sạch. Sau đó đăng ký RT +
  // hấp thụ nợ FIFO (unitEngineOnOpen) và chốt tồn theo mã.
  // o = { nowISO, staffEmp, isOverride, overrideReason, canPrintOpenLabel }. Trả 'ok' | 'not_found' | 'taken'.
  async function lifecycleOpenSealed(id, c, o) {
    const ref = C.fstore.collection(STOCK_CONTAINERS_COLL).doc(id);
    const nowISO = o.nowISO || new Date(C.now()).toISOString(), staffEmp = o.staffEmp;
    let claimed = true;
    try {
      await C.fstore.runTransaction(async t => {
        const freshDoc = await t.get(ref);
        if (!freshDoc.exists) throw new Error('NOT_FOUND');
        if (freshDoc.data().status !== 'sealed') { claimed = false; return; }
        t.update(ref, {
          status: 'open', openedAt: nowISO, openedBy: staffEmp.fullName,
          openedByEmployeeId: staffEmp.id,
          expiresAt: C.af.computeOpenExpiry(freshDoc.data().openShelfLifeHours, nowISO),
          // [MỚI] Vết audit khi mở bao thứ 2 bất chấp cảnh báo — để Quản lý xem lại biết đích
          // xác vì sao, không phải suy đoán.
          ...(o.isOverride ? { openedWithOtherOpen: true, openOverrideReason: o.overrideReason } : {}),
          ...(o.canPrintOpenLabel ? { openLabelNeeded: true, openLabelPrinted: false } : {})
        });
      });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return 'not_found';
      throw err;
    }
    if (!claimed) return 'taken';
    await unitEngineOnOpen(id, c).catch(err => console.warn('[UnitEngine] onOpen lỗi (không chặn mở tem)', err));
    // [TEM = SỰ THẬT] Chốt tồn theo mã ngay khi mở (hấp thụ nợ FIFO cũng đổi số ở đây).
    await _ueRecomputeCurrentStock(c.itemId, STOCK_CONTAINERS_COLL).catch(() => {});
    return 'ok';
  }

  // ── [E4.6] Đối chiếu NL khi nấu mẻ — các khối ghi chép từ posgieo.html (prepReconRegisterNew,
  //    prepReconOpenNext, prepReconRefreshStale, prepReconPostSave). Giao diện ở lại app.
  // Thêm một mã (vừa ghi mốc) vào NL đang đối chiếu của mẻ.
  async function prepReconAddUnit(batchId, itemId, unit) {
    const ref=C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    await C.fstore.runTransaction(async t=>{
      const d=await t.get(ref),r=d.data().reconcileInputs[itemId];
      if(r.status!=='pending')throw new Error('NL đã được chốt trên máy khác');
      if(r.units.some(x=>x.id===unit.id))return;
      t.update(ref,{['reconcileInputs.'+itemId+'.units']:[...r.units,unit]});
    });
  }
  // Ghi mốc "mã cũ đã hết (còn 0)" khi chuyển sang mã tiếp theo trong mẻ.
  async function prepReconMarkExhausted(batchId, itemId, unitId, entry) {
    const batchRef=C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    await C.fstore.runTransaction(async t=>{
      const fresh=await t.get(batchRef),r=fresh.data()&&fresh.data().reconcileInputs&&fresh.data().reconcileInputs[itemId];
      if(!r||r.status!=='pending'||!r.units.some(u=>u.id===unitId))
        throw prepFlowError('Mẻ đã đổi trạng thái — tải lại trước khi mở mã','reload');
      t.update(batchRef,{['reconcileInputs.'+itemId+'.transitionCounts']:{...(r.transitionCounts||{}),
        [unitId]:entry}});
    });
  }
  // Nạp lại mốc tồn / huỷ lượt chốt dở chưa ghi tồn. Trả true nếu đã nạp lại (rebased).
  async function prepReconRebase(batchId, itemId) {
    let rebased=false;
    const live=await prepReconReadUnits(itemId);
    const byId=new Map(live.map(u=>[u.id,u]));
    const ref=C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    const varianceRef=C.fstore.collection('stock_transactions_gieogieo').doc('prep_variance_'+batchId+'_'+itemId);
    const usageRef=C.fstore.collection('stock_transactions_gieogieo').doc('prep_after_'+batchId+'_'+itemId);
    await C.fstore.runTransaction(async t=>{
      rebased=false;
      const [d,varianceDoc,usageDoc]=await Promise.all([t.get(ref),t.get(varianceRef),t.get(usageRef)]);
      const b=d.data(),r=b&&b.reconcileInputs&&b.reconcileInputs[itemId];
      if(!r||b.status!=='cooking'||!['pending','processing'].includes(r.status))
        throw prepFlowError('Mẻ đã đổi trạng thái — tải lại mẻ đang nấu','reload');
      const finished=new Set();
      for(const u of r.units.filter(x=>x.id!=='__aggregate'&&!byId.has(x.id))){
        const old=await t.get(C.fstore.collection(STOCK_CONTAINERS_COLL).doc(u.id));
        if(old.exists&&old.data().status==='finished'&&old.data().prepReconPendingBatchId===batchId)
          finished.add(u.id);
      }
      if(varianceDoc.exists||usageDoc.exists)
        throw prepFlowError('Một phần đối chiếu đã ghi sổ. Không nạp mốc tự động để tránh trừ hai lần; báo Quản lý kiểm tra mẻ này.','manager');
      if(live.some(u=>!r.units.some(x=>x.id===u.id)))
        throw new Error('Có mã mới đang mở — ghi mốc trước của mã mới rồi mới cân lại');
      if(r.units.some(u=>!byId.has(u.id)&&!finished.has(u.id)))
        throw prepFlowError('Có mã cũ không còn mở — kiểm tra tem và báo Quản lý trước khi sửa mốc','manager');
      if(r.units.some(u=>byId.has(u.id)&&byId.get(u.id).lastPrepReconOp==='prep_after_'+batchId+'_'+itemId+'_'+u.id))
        throw prepFlowError('Một mã đã được chốt trên RT. Không nạp mốc tự động để tránh trừ hai lần; báo Quản lý kiểm tra.','manager');
      if(r.status==='processing' && (r.submitted||[]).some(u=>u.id!=='__aggregate'&&byId.has(u.id)
          && Math.abs(byId.get(u.id).unitBase-u.after)<=0.015
          && Math.abs(u.baseline-u.after)>0.015))
        throw prepFlowError('Tồn hiện trùng số đã cân của lượt chốt dở. Có thể RT đã lưu trước khi lỗi; báo Quản lý kiểm tra, không cân lại để tránh trừ hai lần.','manager');
      const changes=r.units.filter(u=>byId.has(u.id)&&Math.abs(byId.get(u.id).unitBase-(u.bookBaseline??u.baseline))>0.015)
        .map(u=>({id:u.id,code:u.code,before:u.baseline,now:byId.get(u.id).unitBase}));
      if(!changes.length&&r.status!=='processing')return;
      const next={...r,status:'pending',rebaseHistory:[...(r.rebaseHistory||[]),{
        at:new Date(C.now()).toISOString(),reason:changes.length?'Tồn mã đổi trong lúc cân':'Hủy lượt chốt dở chưa ghi tồn',
        changes,discardedSubmitted:(r.submitted||[]).map(u=>({id:u.id,code:u.code,baseline:u.baseline,after:u.after}))
      }],units:r.units.map(u=>{
        const current=byId.get(u.id);if(!current)return u;
        const changed=Math.abs(current.unitBase-(u.bookBaseline??u.baseline))>0.015;
        return {...u,baseline:current.unitBase,bookBaseline:current.unitBase,heldAtBook:current.held||0,
          startCheckpoint:current.lastPrepCheckpoint||u.startCheckpoint||null,
          preVerified:changed?false:!!u.preVerified};
      })};
      delete next.submitted;delete next.weighedBy;delete next.weighedById;
      t.update(ref,{['reconcileInputs.'+itemId]:next});
      rebased=true;
    });
    return rebased;
  }
  // Đánh dấu NL của mẻ "đang chốt" + lưu số đã cân (một transaction; máy khác đã chốt → dừng).
  async function prepReconMarkProcessing(batchId, itemId, f) {
    const ref=C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    await C.fstore.runTransaction(async t=>{
      const d=await t.get(ref),r=d.data().reconcileInputs[itemId];
      if(r.status!=='pending')throw prepFlowError('NL đã bắt đầu chốt trên máy khác — mở lại mẻ để tiếp tục','reload');
      t.update(ref,{['reconcileInputs.'+itemId+'.status']:'processing',
        ['reconcileInputs.'+itemId+'.submitted']:f.submitted,
        ['reconcileInputs.'+itemId+'.note']:f.note,
        ['reconcileInputs.'+itemId+'.varianceKind']:f.varianceKind,
        ['reconcileInputs.'+itemId+'.weighedBy']:f.weighedBy,
        ['reconcileInputs.'+itemId+'.weighedById']:f.weighedById});
    });
  }
  // Chốt đối chiếu một NL của mẻ: ghi số từng mã (opId cố định — đứt mạng sau RT, mở lại chốt tiếp
  // không trừ lần hai), sổ hao hụt/tiêu hao (txId cố định), vết mẻ, đóng tem đã báo hết, nhả khoá.
  // s = { b, row, submitted } (đã đọc lại sau khi đánh dấu processing). Trả { actual }.
  async function prepReconCommit(batchId, itemId, s) {
    const {b,row,submitted}=s;
    const ref=C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    // Mỗi mã có opId cố định. Đứt mạng sau RT, mở lại chốt tiếp không trừ lần hai.
    for(const u of submitted) if(u.id!=='__aggregate'&&!u.finished)
      await prepReconSetUnit(itemId,u.id,u.after,'prep_after_'+batchId+'_'+itemId+'_'+u.id,u.bookBaseline??u.baseline,u.toCheckpoint,u.heldAtMeasure);
    const {observed,variance,actual,allocations,varianceAllocations,lotBreakdown,shortfall,surplusLots}=
      C.af.prepReconClassifyUsage(submitted,row.expected,row.varianceKind);
    const responsibility={employeeId:row.weighedById||b.staffEmployeeId||'',
      employeeName:row.weighedBy||b.staff||'',role:'người cân chốt và giải trình',
      batchOperatorId:b.staffEmployeeId||'',batchOperatorName:b.staff||'',
      reason:row.note||'',classification:row.varianceKind||'',status:'assigned'};
    const codeIntervals=lotBreakdown.map(u=>({...u,
      toCheckpoint:submitted.find(x=>x.id===u.containerId)?.toCheckpoint||null,
      responsibility}));
    if(variance>0.005) await applyStockTransactionPOS({itemId,
      type:row.varianceKind==='waste'?'WASTE':'ADJUSTMENT',qty:-variance,
      note:(row.varianceKind==='waste'?'Hao hụt lúc nấu ':row.varianceKind==='prior_variance'?'Lệch tồn từ mốc trước ':'Chênh lệch cần giải trình ')+(b.prepName||'')+' · '+(row.note||''),
      staff:row.weighedBy||b.staff,staffEmployeeId:row.weighedById||b.staffEmployeeId,referenceId:batchId,
      txId:'prep_variance_'+batchId+'_'+itemId,deriveFromUnits:submitted[0].id!=='__aggregate',
      meta:{prepReconVariance:true,needsReview:row.varianceKind==='uncertain'||row.varianceKind==='prior_variance',
        observedDecrease:observed,expectedQty:row.expected,
        varianceKind:row.varianceKind||'uncertain',varianceAllocations,codeIntervals,responsibility}});
    // [Cân ra NHIỀU HƠN sổ] Sổ của lần cân trước nhập thiếu (VD lần trước cân sai, trừ oan 165 g): tồn thật = số cân;
    // mẻ dùng tính theo định mức; phần dư ghi điều chỉnh TĂNG "sổ ghi thiếu" — gắn người cân mốc trước (đã ghi chi phí
    // dùng-thêm/hao hụt ở lượt đó, VẪN chịu trách nhiệm), đánh dấu lượt trước là nhập sai và báo Quản lý.
    let bookUnderstated=null;
    if(surplusLots&&surplusLots.length){
      const sumBase=submitted.reduce((n,u)=>n+(Number(u.baseline)||0),0),sumAfter=submitted.reduce((n,u)=>n+(Number(u.after)||0),0);
      const gap=round2(sumAfter-(sumBase-actual));
      const prev=surplusLots.map(l=>{const u=submitted.find(x=>x.id===l.containerId)||{},cp=u.startCheckpoint||{};
        return {unitId:l.containerId,code:l.code,qty:l.qty,stage:cp.stage||'',employeeId:cp.employeeId||'',employeeName:cp.employeeName||'',
          batchId:cp.batchId||'',at:cp.at||''};});
      bookUnderstated={qty:gap,surplusLots,previousWeighers:prev};
      if(gap>0.005) await applyStockTransactionPOS({itemId,type:'ADJUSTMENT',qty:gap,
        note:'Sổ ghi thấp hơn thực tế khi cân mẻ '+(b.prepName||'')+' · '+(row.note||''),
        staff:row.weighedBy||b.staff,staffEmployeeId:row.weighedById||b.staffEmployeeId,referenceId:batchId,
        txId:'prep_surplus_'+batchId+'_'+itemId,deriveFromUnits:submitted[0].id!=='__aggregate',
        meta:{prepReconSurplus:true,needsReview:true,varianceKind:'book_understated',expectedQty:row.expected,
          surplusLots,previousWeighers:prev,responsibility}});
      // Lượt cân trước (cùng mã) = bản ghi dùng-thêm của người đó: đánh dấu "đã xác minh nhập sai".
      for(const p of prev.filter(x=>x.stage==='after'&&x.batchId&&x.batchId!==batchId))
        await ledgerAnnotate('prep_after_'+p.batchId+'_'+itemId,{entryErrorConfirmed:true,entryErrorQty:p.qty,
          entryErrorFoundInBatch:batchId,entryErrorCorrectedBy:responsibility.employeeName||'',
          entryErrorCorrectedById:responsibility.employeeId||'',entryErrorAt:new Date(C.now()).toISOString()})
          .catch(err=>console.warn('[NL-RECON] chưa đánh dấu nhập sai ở lượt trước',p.batchId,err));
      await C.fstore.collection('alerts_gieogieo').doc('prep_entry_error_'+batchId+'_'+itemId).set(_st({
        type:'prep_entry_error',severity:'danger',status:'new',businessDate:C.businessDate(),createdAt:new Date(C.now()).toISOString(),
        title:'Sổ '+(((C.getItems()||[]).find(x=>x.id===itemId)||{}).name||itemId)+' ghi thấp hơn thực tế '+fmtPrepQty(gap)+' — lần cân trước nhập sai',
        itemId,batchId,gap,previousWeighers:prev,correctedBy:responsibility.employeeName||'',
        note:'Mẻ '+(b.prepName||'')+': '+(responsibility.employeeName||'')+' cân ra nhiều hơn sổ. Người cân mốc trước: '+
          (prev.map(x=>x.employeeName||'chưa rõ').join(', '))+' — phần chênh vẫn tính trách nhiệm người nhập sai; đã ghi điều chỉnh tăng và đánh dấu lượt trước.'
      })).catch(err=>console.warn('[NL-RECON] chưa ghi cảnh báo nhập sai',err));
    }
    if(actual>0.005) await applyStockTransactionPOS({itemId,type:'CONSUMPTION',qty:-actual,
      note:'Nấu '+(b.prepName||'')+' · lượng cân thực tế'+(row.note?' · '+row.note:''),
      staff:row.weighedBy||b.staff,staffEmployeeId:row.weighedById||b.staffEmployeeId,referenceId:batchId,
      txId:'prep_after_'+batchId+'_'+itemId,deriveFromUnits:submitted[0].id!=='__aggregate',
      meta:{prepRecon:true,weighings:submitted,fifoAllocations:allocations,expectedQty:row.expected,
        uncertainVariance:variance,varianceKind:row.varianceKind||'',
        needsReview:row.varianceKind==='uncertain'||C.af.prepReconExtraNeedsReview(row.varianceKind,observed,row.expected),
        codeIntervals,shortfall,responsibility}});
    // Các bill đã BÁN trong lúc NL này khoá cho mẻ — đã được tách khỏi lượng mẻ dùng (mốc lấy lúc cân); ghi lại
    // để truy xuất và đánh dấu đã tất toán.
    const windowSales=await prepReconWindowSales(batchId,itemId).catch(()=>[]);
    const trace={itemName:((C.getItems()||[]).find(x=>x.id===itemId)||{}).name||'',qty:actual,
      ...(bookUnderstated?{bookUnderstated}:{}),
      windowSales:windowSales.map(x=>({orderId:x.orderId,qty:x.qty,at:x.at})),
      windowSoldQty:round2(windowSales.reduce((n,x)=>n+x.qty,0)),
      allocations,untracked:!allocations.length,reconciled:true,expectedQty:row.expected,
      uncertainVariance:variance,varianceAllocations,varianceKind:row.varianceKind||'',
      codeIntervals,shortfall,responsibility};
    await ref.update({['reconcileInputs.'+itemId+'.status']:'done',
      ['reconcileInputs.'+itemId+'.actualQty']:actual,
      ['reconcileInputs.'+itemId+'.uncertainVariance']:variance,
      ['reconcileInputs.'+itemId+'.codeIntervals']:codeIntervals,
      ['reconcileInputs.'+itemId+'.responsibility']:responsibility,
      ['reconcileInputs.'+itemId+'.finishedAt']:new Date(C.now()).toISOString(),
      ['inputTrace.'+itemId]:trace});
    for(const u of submitted.filter(x=>x.finished))
      await C.fstore.collection(STOCK_CONTAINERS_COLL).doc(u.id)
        .update({unitBase:0,wasteBase:0,wasteBasis:'prep_reconciled',lastPrepCheckpoint:u.toCheckpoint,
          prepReconReconciledBatchId:batchId,prepReconReconciledAt:new Date(C.now()).toISOString()})
        .catch(err=>console.warn('[NL-RECON] chưa đồng bộ được tem đã báo hết',u.id,err));
    for(const x of windowSales.filter(y=>!y.settled))
      await C.fstore.collection('stock_transactions_gieogieo').doc(x.txId)
        .update({prepWindowSettled:true,prepWindowSettledAt:new Date(C.now()).toISOString()})
        .catch(err=>console.warn('[NL-RECON] chưa đánh dấu tất toán dòng bán',x.txId,err));
    await prepReconRelease(batchId,[itemId]);
    return { actual };
  }

  // Các dòng BÁN đã ghi trong lúc NL khoá cho mẻ (sổ gắn prepWindowBatchId). Bill xoá (dòng hoàn) không tính.
  async function prepReconWindowSales(batchId, itemId) {
    const snap=await C.fstore.collection('stock_transactions_gieogieo')
      .where('prepWindowBatchId','==',batchId).where('itemId','==',itemId).get();
    return snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.type==='CONSUMPTION'&&!r.reversal&&Number(r.qty)<0)
      .map(r=>({txId:r.id,orderId:r.referenceId||'',qty:Math.abs(Number(r.qty)||0),at:r.createdAt||'',settled:!!r.prepWindowSettled}))
      .sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  }
  // Mốc sổ + bộ đếm "đã bán trong lúc khoá" của một mã NGAY LÚC này — chụp lúc cân/đếm xong để chốt theo mốc đó.
  // NL không tem (__aggregate): tồn chung + prepSaleHeld trên chính NL.
  async function prepReconBookOf(itemId, unitId) {
    if(unitId==='__aggregate'){
      const d=await C.fstore.collection('inventory_items_gieogieo').doc(itemId).get();
      if(!d.exists)return null;
      return {book:Number(d.data().currentStock)||0,held:Number(d.data().prepSaleHeld)||0};
    }
    const u=(await prepReconReadUnits(itemId)).find(x=>x.id===unitId);
    return u?{book:u.unitBase,held:u.held||0}:null;
  }

  // ── [E4.6] Vòng đời mẻ BTP — các khối ghi chép từ posgieo.html (_startPrepBatchImpl, _submitPrepCancelImpl).
  // Tạo lô 'cooking' (id do app cấp trước để trừ NL theo referenceId = id lô).
  async function prepCreateBatch(batchId, data) { await C.fstore.collection('prep_batches_gieogieo').doc(batchId).set(_st(data)); }
  // GIÀNH lô bằng transaction trước khi hoàn. Hai tablet cùng bấm huỷ một lô thì chỉ một bên qua
  // được cửa này; nếu hoàn trước rồi mới đổi trạng thái thì cả hai cùng hoàn và kho dư gấp đôi.
  // [Huỷ mẻ — NL đã cân đối chiếu] NL lấy qua cân đối chiếu không tự hoàn khi huỷ mẻ (có thể đã đổ vào nồi).
  // Chủ dự án chốt (28/09/2026): hỏi RIÊNG từng NL — "Đã hoàn trả" (bắt cân lại từng mã, hoàn đúng phần
  // cân lại tăng thêm) hoặc "Không thể hoàn trả" (→ HAO HỤT). Mẻ đã huỷ không "dùng" NL nào: sau khi huỷ,
  // lượng đã lấy = phần trả lại (về mã) + phần mất (HAO HỤT).
  // Sổ: KHÔNG thêm dòng mới — sửa CÓ VẾT (ledger.amend) 2 dòng của bước đối chiếu:
  //   prep_after_{mẻ}_{NL}    (CONSUMPTION −actual)  → qty −(actual − R_c); còn > 0 thì type WASTE (reclassifiedFrom)
  //   prep_variance_{mẻ}_{NL} (−variance)            → qty −(variance − R_v) nếu phần trả vượt actual
  // với R = tổng trả lại, R_c = min(R, actual), R_v = R − R_c. Tổng sổ = −(lượng lấy − R) = đúng hàng mất.
  // o = { answer: 'da_tra'|'khong_tra', returns: [{unitId, code, returned}], staffEmp, batchName, reason }
  // Idempotent: RT theo op trên node; sổ theo opId trong lý do amend. Trả { returned, waste, lost }.
  async function prepCancelSettleRecon(batchId, itemId, o) {
    const opId = 'prep_cancel_' + batchId + '_' + itemId;
    const st = o.staffEmp || {};
    const returns = (o.answer === 'da_tra' ? (o.returns || []) : []).filter(x => round2(x.returned) > 0);
    // 1) Trả vào đúng mã (RT) — cộng phần cân lại tăng thêm
    let R = 0;
    for (const x of returns) {
      const add = round2(x.returned), op = opId + '_' + x.unitId;
      const ref = _ueActiveUnitsRef(itemId).child(x.unitId);
      const live = (await ref.once('value')).val();
      let abortReason = '';
      const res = await ref.transaction(cur => {
        abortReason = '';
        const src = cur == null ? live : cur;   // như prepReconSetUnit: lần gọi đầu có thể là null từ cache
        if (!src) { abortReason = 'missing'; return; }
        if (src.lastCancelReturnOp === op) return src;   // lượt trước đã cộng — không cộng lần hai
        if (src.discardPending || src.finishedDebt) { abortReason = 'state'; return; }
        return { ...src, unitBase: round2((Number(src.unitBase) || 0) + add), lastCancelReturnOp: op, lastCancelReturnBefore: Number(src.unitBase) || 0 };
      });
      if (!res.committed) throw new Error('Mã ' + (x.code || x.unitId) + (abortReason === 'missing' ? ' không còn đang mở' : ' đang báo huỷ / báo hết') + ' — không hoàn được, báo Quản lý cân lại mã');
      const node = (res.snapshot && res.snapshot.val()) || {};
      await C.fstore.collection(STOCK_CONTAINERS_COLL).doc(x.unitId).update({ unitBase: Number(node.unitBase) || 0 })
        .catch(err => console.warn('[Huỷ mẻ] đồng bộ unitBase bản sao lỗi', x.unitId, err));
      R = round2(R + add);
    }
    // 2) Sửa có vết 2 dòng sổ của bước đối chiếu
    const usageRef = C.fstore.collection('stock_transactions_gieogieo').doc('prep_after_' + batchId + '_' + itemId);
    const varRef = C.fstore.collection('stock_transactions_gieogieo').doc('prep_variance_' + batchId + '_' + itemId);
    const tag = '[' + opId + ']';
    const out = await C.fstore.runTransaction(async t => {
      const u = await t.get(usageRef), v = await t.get(varRef);
      const ud = u.exists ? u.data() : null, vd = v.exists ? v.data() : null;
      const done = d => !!(d && (d.amendments || []).some(a => String(a.reason || '').includes(tag)));
      const actual = ud && Number(ud.qty) < 0 ? -Number(ud.qty) : 0;
      const variance = vd && Number(vd.qty) < 0 ? -Number(vd.qty) : 0;
      if (done(ud) || done(vd)) return { returned: R, waste: 0, lost: 0, already: true };
      const Rc = round2(Math.min(R, actual)), Rv = round2(Math.min(R - Rc, variance));
      const conLai = round2(actual - Rc);
      const lyDo = 'Huỷ mẻ ' + (o.batchName || '') + ' — ' + (o.answer === 'da_tra' ? 'NL đã hoàn trả (cân lại)' : 'NL không thể hoàn trả') + (o.reason ? ' · ' + o.reason : '') + ' ' + tag;
      if (ud && actual > 0) {
        const patch = { qty: -conLai, amendNote: lyDo };
        if (conLai > 0.005) Object.assign(patch, { type: 'WASTE', reclassifiedFrom: ud.type || 'CONSUMPTION', reclassifiedAt: new Date(C.now()).toISOString(), reclassifiedBy: st.fullName || '',
          note: (o.answer === 'da_tra' ? 'Hao hụt — phần NL không trả lại được khi huỷ mẻ ' : 'Hao hụt — NL không thể hoàn trả khi huỷ mẻ ') + (o.batchName || '') + (o.reason ? ' · ' + o.reason : '') });
        else patch.note = 'Hoàn toàn bộ NL do huỷ mẻ ' + (o.batchName || '') + ' (cân lại)';
        ledgerAmendInTx(t, usageRef, ud, patch, { reason: lyDo, by: st.fullName || '' });
      }
      if (vd && Rv > 0.005) ledgerAmendInTx(t, varRef, vd, { qty: -round2(variance - Rv), amendNote: lyDo }, { reason: lyDo, by: st.fullName || '' });
      return { returned: R, waste: conLai, lost: round2(actual + variance - R) };
    });
    // 3) Suy tồn theo mã
    if (R > 0) await _ueRecomputeCurrentStock(itemId, STOCK_CONTAINERS_COLL).catch(() => {});
    return out;
  }
  async function prepClaimCancel(batchId, o) {
    const batchRef = C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    await C.fstore.runTransaction(async (t) => {
      const doc = await t.get(batchRef);
      if (!doc.exists) throw new Error('Lô không tồn tại (có thể vừa bị xoá)');
      const st = doc.data().status;
      if (st !== 'cooking') throw new Error(st === 'cancelled' ? 'Lô này đã được huỷ rồi' : 'Lô đã nấu xong, không huỷ được nữa');
      if(Object.values(doc.data().reconcileInputs||{}).some(r=>r.status!=='done'))
        throw new Error('NL của mẻ vẫn chờ cân — không thể hủy');
      t.update(batchRef, {
        status: 'cancelled', cancelledAt: o.cancelledAt, cancelReason: o.reason,
        cancelledBy: o.staffEmp.fullName, cancelledByEmployeeId: o.staffEmp.id
      });
    });
  }
  // Ghi lại kết quả hoàn lên chính lô — để Quản lý rà được lô nào hoàn hụt (chỉ các trường đếm).
  async function prepRecordCancelResult(batchId, r) {
    await C.fstore.collection('prep_batches_gieogieo').doc(batchId).update({
      cancelReversedCount: r.cancelReversedCount, cancelReverseFailedCount: r.cancelReverseFailedCount,
      cancelAtomicRevertedCount: r.cancelAtomicRevertedCount, cancelAtomicRevertFailedCount: r.cancelAtomicRevertFailedCount,
      // [Huỷ mẻ — NL đã cân đối chiếu] câu trả lời + kết quả cân lại (chỉ có khi mẻ có NL đối chiếu)
      ...(r.cancelReconAnswer != null ? { cancelReconAnswer: r.cancelReconAnswer, cancelReconReturnedCount: r.cancelReconReturnedCount,
        cancelReconReturnFailedCount: r.cancelReconReturnFailedCount, cancelReconWeighed: r.cancelReconWeighed || [] } : {})
    });
  }

  // [E4.6 — prep.finishBatch] Hoàn thành mẻ — chép khối ghi của _submitPrepFinishImpl (posgieo.html).
  // [RACE FIX] GIÀNH lô bằng transaction TRƯỚC khi đụng vào bất cứ thứ gì khác — 2 máy cùng bấm
  // "Hoàn thành" một lô 'cooking' thì chỉ máy THẮNG mới đi tiếp; máy thua dừng sạch. Số liệu của lượt
  // hoàn thành chốt BẤT BIẾN ở lần claim đầu (_pendingFinish); resume dùng đúng bản đã chốt.
  // d = { qty, batchCode, expiresAt, inputCost, weighLines, staffEmp, sug, lechPct, finishedAt }.
  // Trả { status: 'ok'|'not_found'|'taken'|'no_finish', finish }.
  async function prepFinishBatch(b, d) {
    const { qty, batchCode, expiresAt, inputCost, finishedAt, sug, lechPct, staffEmp } = d;
    const _weighLines = d.weighLines || [];
    const batchRef = C.fstore.collection('prep_batches_gieogieo').doc(b.id);
    let claimed = true;
    // [BUG "resume finishing dùng qty mới → lệch sản lượng" — FIX] Trước đây resume (status đã
    // là 'finishing') vẫn chạy tiếp với qty/batchCode/expiresAt/inputCost/weighLines lấy từ INPUT
    // MỚI của lượt bấm hiện tại — nếu PRODUCTION đã ghi +1000 ở lượt 1 (doc ledger cố định nên
    // resume không cộng currentStock lần 2), rồi lượt 2 nhân viên lỡ gõ lại 800, batch vẫn bị
    // ghi đè qtyInitial/qtyRemaining/unitBase=800 trong khi currentStock đã chốt +1000 — 2 con số
    // lệch nhau vĩnh viễn, không có cơ chế nào tự phát hiện hay sửa lại. Giờ chốt BẤT BIẾN toàn
    // bộ số liệu của lượt hoàn thành ngay khi claim LẦN ĐẦU (status vẫn 'cooking'), lưu thẳng vào
    // batch doc (`_pendingFinish`); nếu đang resume thì đọc lại ĐÚNG bản đã chốt đó, không cho
    // input mới của lượt resume ghi đè bất cứ số nào.
    let finish = null;
    try {
      await C.fstore.runTransaction(async t => {
        const bd = await t.get(batchRef);
        if (!bd.exists) throw new Error('NOT_FOUND');
        const data = bd.data();
        // [BUG "kẹt ở finishing" — FIX] Trước đây CHỈ nhận 'cooking' — nếu bước nào sau claim
        // (ghi PRODUCTION/update batch/onOpen) lỡ đứt mạng giữa chừng, batch nằm mãi ở
        // 'finishing' và KHÔNG BAO GIỜ claim lại được nữa (nút Hoàn thành chỉ tác động lên
        // batch 'cooking'), phải can thiệp dữ liệu tay. Giờ NHẬN LUÔN 'finishing' để cho phép
        // resume — an toàn vì bước ghi PRODUCTION bên dưới đã có doc ID cố định + guard
        // "đã ghi rồi thì không cộng currentStock lần 2".
        if (data.status !== 'cooking' && data.status !== 'finishing') { claimed = false; return; }
        if (data.status === 'finishing' && data._pendingFinish) {
          finish = data._pendingFinish; // resume — dùng ĐÚNG số đã chốt, không nhận số mới
          return;
        }
        finish = {
          qty, batchCode, expiresAt, inputCost,
          weighLines: _weighLines, weighMethod: _weighLines.length ? 'vessel' : 'manual',
          staffFullName: staffEmp.fullName, staffEmployeeId: staffEmp.id,
          declaredYieldTotal: sug, yieldVariancePct: Math.round(lechPct * 10) / 10,
          finishedAt
        };
        t.update(batchRef, { status: 'finishing', _pendingFinish: finish });
      });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return { status: 'not_found' };
      throw err;
    }
    if (!claimed) return { status: 'taken' };
    if (!finish) return { status: 'no_finish' };

    // Cộng tồn tổng (currentStock) + ghi ledger — giữ nguyên cơ chế cũ để mọi
    // báo cáo/COGS hiện có không phải sửa gì.
    // [BUG "kẹt ở finishing" — FIX] Doc ID CỐ ĐỊNH theo batchId (thay vì .doc() tự sinh ngẫu
    // nhiên) — resume sau khi kẹt sẽ đọc TRÚNG đúng bản ghi cũ nếu bước này đã từng chạy
    // thành công, nhờ đó biết mà KHÔNG cộng currentStock lần 2.
    const prepRef = C.fstore.collection('prep_items_gieogieo').doc(b.prepId);
    const txRef = C.fstore.collection('prep_transactions_gieogieo').doc('production_batch_' + b.id);
    await C.fstore.runTransaction(async (t) => {
      const doc = await t.get(prepRef);
      if (!doc.exists) throw new Error('Thành phẩm không tồn tại (có thể vừa bị xoá)');
      const existingTx = await t.get(txRef);
      if (existingTx.exists) return; // đã ghi PRODUCTION + cộng currentStock ở lượt trước rồi — resume, không cộng lại
      const next = (Number(doc.data().currentStock) || 0) + finish.qty;
      t.update(prepRef, { currentStock: next, updatedAt: finish.finishedAt });
      t.set(txRef, _st({
        prepId: b.prepId, prepCode: b.prepCode || '', prepName: b.prepName || '', unit: b.unit || '',
        type: 'PRODUCTION', batches: Number(b.batchRatio) || 1,
        qty: finish.qty, resultingStock: next, batchId: b.id, batchCode: finish.batchCode,
        // [MỚI] Cân bằng dụng cụ hay gõ tay, và cân những gì. Ghi ở cả ledger lẫn
        // lô: ledger là thứ báo cáo đọc, lô là thứ màn Chế biến đọc.
        weighMethod: finish.weighMethod,
        weighings: finish.weighLines,
        staff: finish.staffFullName, staffEmployeeId: finish.staffEmployeeId,
        createdAt: finish.finishedAt, businessDate: C.businessDate(), source: _src()
      }));
    });

    await C.fstore.collection('prep_batches_gieogieo').doc(b.id).update({
      batchCode: finish.batchCode, qtyInitial: finish.qty, qtyRemaining: finish.qty,
      // [UNIT ENGINE v2] unitBase = số dư còn lại của CHÍNH lô này, dùng chung công thức
      // với tem nguyên liệu (itemKind:'prep', item = prepId thay vì itemId). Khởi tạo = số
      // cân thật vừa nhập, y hệt qtyRemaining — giữ cả 2 field trong giai đoạn chuyển tiếp
      // để báo cáo cũ đọc qtyRemaining không bị vỡ.
      unitBase: finish.qty,
      finishedAt: finish.finishedAt, expiresAt: finish.expiresAt, status: 'active',
      weighMethod: finish.weighMethod,
      weighings: finish.weighLines,
      finishedBy: finish.staffFullName, finishedByEmployeeId: finish.staffEmployeeId,
      // Giá vốn THẬT của chính lô này: tiền nguyên liệu đã bỏ ra ÷ số cân được.
      inputCost: finish.inputCost, actualCostPerUnit: finish.qty > 0 ? finish.inputCost / finish.qty : 0,
      declaredYieldTotal: finish.declaredYieldTotal, yieldVariancePct: finish.yieldVariancePct,
      // Trùng khít số công thức đến từng số lẻ = nhiều khả năng không cân thật.
      // Nhưng nếu số đến từ bộ cân thì KHÔNG cần đoán nữa — có bảng kê từng khay,
      // trùng số công thức chỉ là trùng hợp.
      weighedSuspect: !finish.weighLines.length && finish.declaredYieldTotal > 0 && Math.abs(finish.qty - finish.declaredYieldTotal) < 0.005,
      _pendingFinish: C.FieldValue.delete()
    });

    // BTP không có trạng thái 'sealed' riêng — hoàn thành mẻ là coi như mở luôn (dùng được
    // ngay), nên cũng chạy qua carry-forward hấp thụ nợ của các lô cùng prepId đang âm.
    // [RACE/CONSISTENCY FIX] Trước đây .catch() nuốt lỗi rồi vẫn chạy recompute ngay dưới —
    // nếu onOpen thất bại (RT không có node cho lô mới), recompute sẽ suy currentStock THIẾU
    // đúng phần `qty` vừa nấu (vì RT không thấy lô này) và ghi ĐÈ lên số ĐÚNG vừa cộng ở
    // transaction phía trên. Giờ chỉ recompute khi onOpen THẬT SỰ thành công; lỗi thì giữ
    // nguyên currentStock đã cộng đúng ở bước trước (onOpen tự toast báo Quản lý rồi).
    let onOpenOk = true;
    await unitEngineOnOpen(b.id, { itemId: b.prepId, code: finish.batchCode, itemName: b.prepName || '', unit: b.unit || '', baseQty: finish.qty }, 'prep_batches_gieogieo')
      .catch(err => { onOpenOk = false; console.warn('[UnitEngine] onOpen BTP lỗi (không chặn hoàn thành mẻ)', err); });
    if (onOpenOk) {
      await _ueRecomputeCurrentStock(b.prepId, 'prep_batches_gieogieo').catch(() => {});
    }
    return { status: 'ok', finish };
  }

  // [E4.6 — prep.discardByLots] Huỷ BTP theo lô nhân viên chọn — chép khối ghi của _submitPrepWasteImpl
  // (posgieo.html): một transaction trừ tồn + trừ đúng từng lô (đọc lại trong transaction) + dòng
  // sổ WASTE; rồi đồng bộ RT theo đúng lô đã chọn (không qua FIFO) và chốt tồn khi RT khớp 100%.
  // d = { qty, lines, reason, totalCost, ingredientBreakdown, weighings, staffEmp }.
  async function prepDiscardByLots(p, d) {
    const { qty, lines, reason, totalCost, ingredientBreakdown, staffEmp } = d;
    const _pwWeighings = d.weighings || {};
    const prepRef = C.fstore.collection('prep_items_gieogieo').doc(p.id);
    const txRef = C.fstore.collection('prep_transactions_gieogieo').doc();
    const now = new Date(C.now()).toISOString();
    await C.fstore.runTransaction(async (t) => {
      // Firestore bắt ĐỌC HẾT rồi mới được ghi, nên gom toàn bộ get() lên đầu.
      const doc = await t.get(prepRef);
      if (!doc.exists) throw new Error('Bán thành phẩm không tồn tại (có thể vừa bị xoá)');
      const loDocs = [];
      for (const l of lines) {
        const ref = C.fstore.collection('prep_batches_gieogieo').doc(l.batchId);
        loDocs.push({ l, ref, snap: await t.get(ref) });
      }

      const next = (Number(doc.data().currentStock) || 0) - qty;
      t.update(prepRef, { currentStock: next, updatedAt: now });

      // Trừ đúng từng lô. Đọc lại trong transaction chứ không tin số trong cache: giữa lúc
      // mở form và lúc bấm gửi, máy khác có thể đã bán bớt lô đó.
      for (const d of loDocs) {
        if (!d.snap.exists) throw new Error(`Lô ${d.l.batchCode} không còn tồn tại`);
        const conThat = Number(d.snap.data().qtyRemaining) || 0;
        if (d.l.qty > conThat + 0.001) throw new Error(`Lô ${d.l.batchCode} chỉ còn ${fmtPrepQty(conThat)} ${p.unit || ''} (máy khác vừa dùng bớt) — kiểm tra lại`);
        const left = Math.max(0, conThat - d.l.qty);
        // [BUG BTP hủy lô — FIX] Trước đây chỉ ghi qtyRemaining, KHÔNG đụng unitBase — bản
        // sao Firestore của unitBase (dùng làm nguồn cho các màn đọc trực tiếp Firestore,
        // vd chi tiết lô bên Quản lý) bị lệch, giữ nguyên số CŨ cao hơn thực tế sau khi huỷ.
        // unitBase có thể khác qtyRemaining nếu lô đang trong trạng thái nợ FIFO
        // (qtyRemaining luôn kẹp >=0, unitBase thì không) — trừ trên CHÍNH unitBase hiện tại,
        // không suy từ qtyRemaining.
        const unitBaseThat = isFinite(Number(d.snap.data().unitBase)) ? Number(d.snap.data().unitBase) : conThat;
        t.update(d.ref, {
          qtyRemaining: left,
          unitBase: unitBaseThat - d.l.qty,
          // Huỷ sạch lô → 'discarded', khác 'used_up' (bán hết) và 'expired' (dọn cuối ngày),
          // để báo cáo phân biệt được hàng BÁN hết với hàng ĐỔ đi.
          ...(left <= 0 ? { status: 'discarded', discardedAt: now, discardReason: reason } : {})
        });
      }

      t.set(txRef, _st({
        prepId: p.id, prepCode: p.code || '', prepName: p.name || '', unit: p.unit || '',
        type: 'WASTE', qty: -Math.abs(qty), resultingStock: next,
        reason, totalCost, ingredientBreakdown,
        // Huỷ lô nào, mỗi lô bao nhiêu — đây là thứ trước đây không ghi lại được.
        batches: lines.map(l => ({
          batchId: l.batchId, batchCode: l.batchCode, qty: l.qty, caLo: l.qty >= l.con - 0.001,
          // [MỚI] Cân bằng dụng cụ thì kèm luôn bảng kê: cân cái gì, mấy khay, bì
          // bao nhiêu. Với kiểu "cân phần còn lại" thì số huỷ là HIỆU, không phải
          // số trên cân — không ghi rõ ra thì người đọc sau chắc chắn hiểu ngược.
          ...(_pwWeighings[l.batchId] ? { weigh: _pwWeighings[l.batchId] } : {})
        })),
        weighMethod: Object.keys(_pwWeighings).length ? 'vessel' : 'manual',
        ...(_pwWeighings.plain ? { weigh: _pwWeighings.plain } : {}),
        // Một lô thì điền luôn vào batchCode cho khớp với giao dịch PRODUCTION.
        batchCode: lines.length === 1 ? lines[0].batchCode : '',
        // Cờ này để người đọc dữ liệu sau không nhầm: bảng quy đổi ở trên KHÔNG
        // tương ứng với giao dịch trừ kho nguyên liệu nào cả.
        breakdownIsReportOnly: true,
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
        createdAt: now, businessDate: C.businessDate(), source: _src()
      }));
    });
    if (lines.length) {
      // [UNIT ENGINE v2] Huỷ theo lô là staff TỰ CHỌN lô (không qua FIFO tự động), nên đồng
      // bộ thẳng RTDB theo đúng batchId đã chọn thay vì gọi unitEngineAllocateConsumption
      // (hàm đó luôn ưu tiên lô cũ nhất, không đúng ý "huỷ đúng lô này").
      // [BUG#5 FIX] Trước đây mỗi lô .catch(console.warn) riêng lẻ → Promise.all không bao giờ
      // reject, nên dù RT đồng bộ lỗi vẫn cứ toast "✅ Đã ghi huỷ" như thành công hoàn toàn —
      // trong khi Firestore (qtyRemaining/currentStock) đã trừ xong nhưng RT giữ nguyên số cũ,
      // lệch mà không ai biết. Giờ gom lỗi lại và báo thẳng cho nhân viên như các luồng khác.
      const rtResults = await Promise.allSettled(lines.map(l =>
        _ueActiveUnitsRef(p.id).child(l.batchId).transaction(cur => {
          if (!cur) return cur;
          cur.unitBase = (Number(cur.unitBase) || 0) - l.qty;
          return cur;
        }).then(() => {
          // Lô đã huỷ sạch (discarded) thì gỡ luôn khỏi RT — không còn "đang mở" nữa.
          const isDiscarded = lines.find(x => x.batchId === l.batchId) && (l.qty >= l.con - 0.001);
          if (isDiscarded) return _ueActiveUnitsRef(p.id).child(l.batchId).remove();
        })
      ));
      const rtFailed = rtResults.filter(r => r.status === 'rejected');
      if (rtFailed.length) {
        console.warn('[UnitEngine] đồng bộ RT lúc huỷ lô BTP lỗi', rtFailed.map(r => r.reason));
        C.hooks.report('⚠️ Đã ghi huỷ nhưng đồng bộ realtime lỗi (' + rtFailed.length + ' lô)', 'Huỷ lô BTP: lỗi đồng bộ realtime', { ref: String(Date.now()) });
      } else {
        // [BUG "Firestore/RT commit tách rời" — FIX] Trước đây recompute chạy VÔ ĐIỀU KIỆN dù
        // RT vừa lỗi — đọc RT lúc đó vẫn là số CŨ (chưa trừ), ghi đè currentStock về số cũ,
        // xoá sạch dấu vết vừa huỷ dù Firestore (qtyRemaining/unitBase) đã trừ đúng. Giờ chỉ
        // suy lại currentStock từ tổng lô khi RT đồng bộ đủ 100% (biết chắc RT đã khớp
        // Firestore) — RT lỗi thì giữ nguyên currentStock đã trừ đúng ở transaction phía trên.
        await _ueRecomputeCurrentStock(p.id, 'prep_batches_gieogieo').catch(() => {});
      }
    }
  }

  // [E4.6] chép nguyên văn từ posgieo.html: prepReconIsLow, prepReconReadUnits, prepReconCheckpointAtStart, prepReconAttachOpenUnit
  function prepReconIsLow(u) {
    const cap=Number(u&&u.capacity)||0,base=Number(u&&(u.unitBase??u.baseline))||0;
    return cap>0&&base<=cap*0.1;
  }

  async function prepReconReadUnits(itemId) {
    const snap = await _ueActiveUnitsRef(itemId).once('value');
    return Object.entries(snap.val() || {}).filter(([id,v]) => id!=='__prepLock' && !v.finishedDebt && !v.discardPending)
      .map(([id,v]) => ({ id, code:v.code||id, unitBase:Number(v.unitBase)||0,
        capacity:Number(v.capacity)||0, openedAt:Number(v.openedAt)||0, held:Number(v.saleHeld)||0,
        lastPrepReconOp:v.lastPrepReconOp||'',lastPrepCheckpoint:v.lastPrepCheckpoint||null }))
      .sort((a,b) => (prepReconIsLow(b)?1:0)-(prepReconIsLow(a)?1:0) || a.openedAt-b.openedAt);
  }

  async function prepReconCheckpointAtStart(u) {
    if(u.lastPrepCheckpoint)return u.lastPrepCheckpoint;
    const d=await C.fstore.collection(STOCK_CONTAINERS_COLL).doc(u.id).get();
    const c=d.data()||{};
    return {stage:'open',at:c.openedAt||new Date(u.openedAt||C.now()).toISOString(),
      employeeId:c.openedByEmployeeId||'',employeeName:c.openedBy||''};
  }

  // Mã quét mở từ tab Kho khi mẻ đang nấu vẫn thuộc cùng lượt đối chiếu. Mốc RT
  // được chụp lúc mở; lúc về màn cân có thể gắn lại nếu mất mạng sau khi mở tem.
  async function prepReconAttachOpenUnit(batchId,itemId,unitId) {
    const live=(await prepReconReadUnits(itemId)).find(u=>u.id===unitId);
    if(!live)throw new Error('Mã mới chưa đồng bộ tồn; thử lại khi có mạng');
    const startCheckpoint=await prepReconCheckpointAtStart(live);
    const ref=C.fstore.collection('prep_batches_gieogieo').doc(batchId);
    await C.fstore.runTransaction(async t=>{
      const doc=await t.get(ref),batch=doc.data(),row=batch?.reconcileInputs?.[itemId];
      if(!doc.exists||batch.status!=='cooking'||!row||row.status!=='pending')
        throw new Error('Mẻ đã chốt hoặc đổi trạng thái');
      if(row.units.some(u=>u.id===unitId))return;
      t.update(ref,{['reconcileInputs.'+itemId+'.units']:[...row.units,{
        id:unitId,code:live.code,baseline:live.unitBase,bookBaseline:live.unitBase,heldAtBook:live.held||0,
        capacity:live.capacity,preVerified:false,openedDuringBatch:true,openedAt:live.openedAt,
        startCheckpoint
      }]});
    });
  }

  // [E4.3 — lifecycle.restoreAtomic] Quản lý khôi phục tem "cái rời" bị chốt oan về 'sealed' — chép
  // khối ghi của ctnRestoreAtomicSealed (quanlygieo.html). Nguyên liệu cái rời không đi qua RTDB nên
  // chỉ đổi status; sổ thủ công (anomalyKind:null) ghi dòng + tính lại tồn theo mã.
  async function lifecycleRestoreAtomic(containerId, c) {
    await C.fstore.collection(STOCK_CONTAINERS_COLL).doc(containerId).update({
      status: 'sealed',
      revertedFinish: { at: new Date(C.now()).toISOString(), by: 'management', reason: 'Bắt đầu chế biến lỗi, không tạo được lô nấu — quét ở cổng bị kẹt oan' }
    });
    await applyStockTransactionManual({
      itemId: c.itemId, type: 'ADJUSTMENT', qty: Number(c.baseQty) || 0,
      note: `Khôi phục tem ${c.code||''} bị chốt "cái rời" oan (lô chế biến không tạo được) — quản lý xác nhận gói chưa mở`,
      staff: '', source: 'management', referenceId: containerId,
      anomalyKind: null   // tem đã về 'sealed' → tồn tự đúng theo mã, không phải khoản lệch
    });
  }

  // [E4.7 — prep.adjustStock] Quản lý chỉnh tồn BTP — chép khối ghi của submitPrepAdjust (quanlygieo.html).
  // Bước 1: tồn tổng + nhật ký ADJUSTMENT (transaction). Bước 2: áp PHẦN CHÊNH vào lô (FIFO theo
  // openedAt — R2), ghi RT đúng số mới (lô về 0 thì gỡ khỏi RT), chốt tồn theo lô. Lỗi bước 2 không
  // làm hỏng bước 1. o = { newQty, oldQty, diff, reason, now }. Trả { remain, lotError }.
  async function prepAdjustStock(p, o) {
    const { newQty, oldQty, diff, reason, now } = o;
      // 1. Tồn tổng + nhật ký (transaction để không đè lẫn thao tác khác)
      C.hooks.stockChanged(p.id, 'prep');
      const prepRef = C.fstore.collection('prep_items_gieogieo').doc(p.id);
      const txRef = C.fstore.collection('prep_transactions_gieogieo').doc();
      await C.fstore.runTransaction(async t=>{
        const doc = await t.get(prepRef);
        if(!doc.exists) throw new Error('Bán thành phẩm không tồn tại (có thể vừa bị xoá)');
        t.update(prepRef, { currentStock: newQty, updatedAt: now });
        t.set(txRef, _st({
          prepId: p.id, prepCode: p.code||'', prepName: p.name||'', unit: p.unit||'',
          type: 'ADJUSTMENT', qty: diff, resultingStock: newQty,
          previousStock: oldQty, reason,
          note: 'Quản lý chỉnh tay tồn bán thành phẩm',
          createdAt: now, businessDate: C.businessDate(), source: 'management'
        }));
      });

      // 2. [FIX] Áp phần CHÊNH LỆCH (diff) vào lô, không rót lại TOÀN BỘ newQty theo
      // kiểu "cap-fill" như trước. Cách cũ luôn cố nhồi đầy lô CŨ nhất tới cap trước
      // rồi mới xét lô mới — bất kể lô cũ đó thực tế đã dùng bao nhiêu — nên hễ có
      // chênh lệch là lô cũ tự nhiên "đầy trở lại" còn lô mới bị đẩy về 0/'used_up'
      // dù chưa hề đụng tới. Đây chính là lỗi khiến lô nấu SAU lại bị báo dùng hết
      // TRƯỚC lô nấu trước đó khi Quản lý chỉnh tồn.
      // GIỜ: chỉ ĐỘNG vào đúng số lô cần để giải thích hết phần diff, các lô còn lại
      // giữ nguyên số đang có (không bị viết đè oan).
      //   - diff < 0 (giảm tồn / ghi hao hụt): trừ vào lô CŨ NHẤT trước — đúng
      //     nguyên tắc lô cũ dùng/hỏng trước.
      //   - diff > 0 (tăng tồn / khôi phục do lỡ trừ nhầm): cộng bù vào lô CŨ NHẤT
      //     trước, chỉ tràn sang lô mới hơn khi lô cũ đã về đúng sản lượng gốc
      //     (qtyInitial) — vì tình huống cần khôi phục thường là lô cũ bị ép nhầm.
      // Lỗi ở bước này KHÔNG được làm hỏng bước 1 đã xong — chỉ cảnh báo.
    let remain = 0;
    try{
        // Lấy CẢ lô 'used_up': khi nhân viên đếm nhầm số bé, POS tự đặt các lô về
        // qtyRemaining=0 + status='used_up'. Nếu chỉ lọc 'active' thì đúng những lô
        // cần khôi phục lại bị bỏ sót → chỉnh xong tổng vẫn không khớp các lô.
        // KHÔNG lấy 'expired': đó là lô đã bị bỏ có chủ đích (hết hạn / bấm "Bỏ hết"
        // kèm lý do), khôi phục lại là làm sống lại hàng đã đổ đi.
        // [E3 — R2] FIFO theo openedAt (RT — nguồn thật của lô đang mở, B3) như POS; lô không còn
        // trên RT thì lấy openedAt/finishedAt đã lưu trên lô.
        const rtLo = (await _ueActiveUnitsRef(p.id).once('value')).val() || {};
        const moc = b => (rtLo[b.id] && Number(rtLo[b.id].openedAt)) || Date.parse(b.openedAt || b.finishedAt || '') || 0;
        const batches = (await C.af.loadPrepBatches(500))
          .filter(b=>b.prepId===p.id && (b.status==='active' || b.status==='used_up'))
          .sort((a,b)=>moc(a)-moc(b));

        const jobs = [];
        const touched = [];   // lô vừa đổi số — phải ghi cả RT (nguồn thật của lô đang mở)
        remain = Math.abs(diff);

        if(diff < 0){
          // Giảm tồn: trừ dần vào lô CŨ NHẤT trước, chỉ tới khi giải thích đủ phần
          // giảm — không đụng các lô chưa cần tới.
          for(const b of batches){
            if(remain <= 0.0001) break;
            const cur = Number(b.qtyRemaining)||0;
            if(cur <= 0) continue;
            const take = Math.min(cur, remain);
            const left = Math.round((cur - take)*100)/100;
            remain -= take;
            jobs.push(C.fstore.collection('prep_batches_gieogieo').doc(b.id).update({
              qtyRemaining: left, unitBase: left,
              ...(left<=0 ? {status:'used_up', usedUpAt:now} : {status:'active'})
            }));
            touched.push({ b, qty: left });
          }
        } else {
          // Tăng tồn: cộng bù vào lô CŨ NHẤT trước, giới hạn ở sản lượng gốc
          // (qtyInitial) của từng lô — không cho vượt quá lượng đã thực nấu ra.
          for(const b of batches){
            if(remain <= 0.0001) break;
            const cur = Number(b.qtyRemaining)||0;
            const cap = Number(b.qtyInitial) || cur;
            const room = Math.max(0, cap - cur);
            if(room <= 0) continue;
            const add = Math.min(room, remain);
            const next = Math.round((cur + add)*100)/100;
            remain -= add;
            jobs.push(C.fstore.collection('prep_batches_gieogieo').doc(b.id).update({
              qtyRemaining: next, unitBase: next, status: 'active'
            }));
            touched.push({ b, qty: next });
          }
        }

        await Promise.all(jobs);
        // [UNIT ENGINE] Trước đây chỉ sửa qtyRemaining — RT giữ số cũ, lượt tính lại kế tiếp bên
        // POS ghi đè tồn về số cũ. Ghi RT đúng số mới (lô về 0 thì gỡ khỏi RT) rồi chốt theo lô.
        await Promise.all(touched.map(({b, qty}) => qty > 0
          ? _ueActiveUnitsRef(p.id).child(b.id).transaction(cur => ({
              code: (cur && cur.code) || b.batchCode || '', itemName: (cur && cur.itemName) || b.prepName || '',
              unit: (cur && cur.unit) || b.unit || '', capacity: (cur && cur.capacity) || Number(b.qtyInitial) || qty,
              openedAt: (cur && cur.openedAt) || C.now(), unitBase: qty }))
          : _ueActiveUnitsRef(p.id).child(b.id).remove()));
        await recomputePrepStock(p.id);
    }catch(err){
      console.warn('Phân bổ lại lô thất bại (tồn tổng ĐÃ chỉnh xong):', err);
      return { remain: 0, lotError: true };
    }
    return { remain, lotError: false };
  }

  // [E4.9 — lifecycle.fixReceipt] Sửa phiếu nhận ghi thừa/thiếu — chép khối ghi của fixRecWizApply
  // (quanlygieo.html). Sửa tem (huỷ tem thừa / sửa dung tích lô), dòng sổ RECEIVING (sửa qty TẠI CHỖ —
  // 2.5 — kèm vết amendments[]) và tồn trong CÙNG một transaction; lô đang mở thì trừ phần thừa trong RT;
  // chốt tồn theo mã. o = { l, huy, theoLo, tem, thua, baseDung, daGhi, soDung, donVi, lyDoNguoiDung }.
  // Trả { nowISO, lyDo, ledgerIds }.
  // [E4] Kiểm kê BTP cuối ca — ghi cho MỘT dòng BTP: lô (Firestore), RT, sổ prep_transactions,
  // cảnh báo lệch/đồng bộ RT, rồi suy tồn. Chép NGUYÊN VĂN từ vòng lặp của _submitPrepCountImpl (POS).
  // ctx: { now (ISO), staff:{fullName,id}, businessDate }. Trả { line, jobs:[{prepId, promise}] } —
  // prepId null = job phụ (cảnh báo). Hàm đồng bộ để thứ tự khởi chạy các lượt ghi y như bản cũ.
  function prepCountCommitLine(l, ctx) {
    const now = ctx.now, staffEmp = ctx.staff;
    const shiftState = { businessDate: ctx.businessDate };
    const lines = [], jobs = [];
    const pushJob = (prepId, p) => { jobs.push({ prepId, promise: p }); };
    const counted = Number(l.counted) || 0;
    const variance = counted - l.sysQty;   // âm = hụt so với hệ thống
    // Đóng/điều chỉnh từng lô. Lô 'cooking' KHÔNG đụng tới — nó chưa thành hàng,
    // để nguyên cho nhân viên hoàn thành, tránh mất dấu mẻ đang nấu dở.
    //
    // [FIX] TRƯỚC ĐÂY: rót số "counted" (tổng) vào lô CŨ nhất trước, giới hạn ở
    // qtyRemaining hiện có của mỗi lô → nếu lô cũ lỡ chưa được trừ đúng trong ngày
    // (vd deductPrepBatchesFIFO lỗi âm thầm), thuật toán này vẫn "giữ" lô cũ ở mức
    // cao, đẩy hết phần hụt sang lô MỚI — biến lô mới nấu, chưa hề dùng, thành
    // "đã dùng hết" trên hệ thống. Đây chính là lỗi khiến lô nấu sau lại báo hết
    // trước lô nấu trước.
    // GIỜ: dùng ĐÚNG số nhân viên đã xác nhận cho TỪNG LÔ (l.batchQty, nhập theo
    // tem thật hoặc bấm "Hết / không thấy tem") — không suy luận/phân bổ lại gì
    // nữa. Với dòng chỉ có 1 lô, số đó chính là l.counted.
    // [FIX ĐỔ BỎ = 0đ] Gom lại ĐÚNG số đã đổ đi thật, lấy từ qtyRemaining của
    // các lô bị huỷ — KHÔNG lấy từ chênh lệch currentStock (xem lý do ở khối
    // ghi ledger bên dưới).
    let discardedQty = 0;
    let discardReason = '';
    let conLaiThucTe = 0;   // tổng qtyRemaining của các lô SAU thao tác này
    // [MỚI] Đúng những lô BỊ ĐÁNH DẤU HẾT trong lượt này (used_up/expired) — gắn vào cảnh
    // báo lệch đếm bên dưới, để Quản lý biết ĐÍCH DANH lô nào chứ không phải chỉ tên
    // nguyên liệu. Trước đây alert không lưu batchId nào — muốn điều chỉnh lại phải đoán
    // qua mốc thời gian trùng khớp (usedUpAt/expiredAt == alert.createdAt), dễ sai nếu
    // trùng giây với một lượt khác. Giờ ghi thẳng, khỏi phải đoán.
    const affectedBatches = [];
    const activeBatches = l.activeBatches;
    // [BUG "Kiểm kê BTP cuối ca bypass unitBase/RT" — FIX] Trước đây chỉ ghi qtyRemaining/status
    // trên Firestore, không đụng unitBase (bản sao) lẫn RT (nguồn thật phần đang mở) — kiểm kê
    // là kiểm THẬT, phải ghi thẳng vào Unit Engine như mọi biến động khác, không đứng ngoài.
    // Gom job RT riêng theo từng prep item để biết CHẮC đã đồng bộ xong mới cho phép suy
    // currentStock từ tổng unit; đồng bộ lỗi thì rơi về tin thẳng tonSauDem như trước giờ.
    const rtJobsOfItem = [];
    for (const b of activeBatches) {
      const isExpired = b.shelfLifeType === 'endOfDay' || (b.expiresAt && new Date(b.expiresAt) <= new Date(C.now()));
      if (l.discardAll || isExpired) {
        discardedQty += Math.max(0, Number(b.qtyRemaining) || 0);
        if (!discardReason) discardReason = l.discardAll ? 'Nhân viên bỏ hết cuối ngày' : 'Quá hạn sử dụng';
        pushJob(l.prepId, C.fstore.collection('prep_batches_gieogieo').doc(b.id).update({
          qtyRemaining: 0, unitBase: 0, status: 'expired', expiredAt: now,
          expiredReason: l.discardAll ? 'Nhân viên bỏ hết cuối ngày' : 'Quá hạn sử dụng'
        }));
        affectedBatches.push({
          id: b.id, code: b.batchCode || '',
          qtyBefore: round2(Math.max(0, Number(b.qtyRemaining) || 0)),
          qtyAfter: 0, closed: true, statusAfter: 'expired',
          closeReason: l.discardAll ? 'discard_all' : 'expired'
        });
        // [BUG "kiểm kê BTP: RT lỗi vẫn để Firestore đi trước" — FIX] Thử lại vài lần (mạng
        // chập chờn qua khỏi) trước khi chấp nhận là lỗi thật — RT sai sau kiểm kê là một quả
        // bom hẹn giờ: BẤT KỲ recompute nào sau đó (kể cả từ một nghiệp vụ hoàn toàn khác của
        // CÙNG món) sẽ đọc trúng số RT cũ và ghi đè currentStock quay lại số trước kiểm kê,
        // xoá sạch kết quả đếm thật vừa xác nhận.
        rtJobsOfItem.push({ batchId: b.id, stillActive: false, promise: _ueRetryAsync(() => _ueActiveUnitsRef(l.prepId).child(b.id).remove()) });
        continue;
      }
      // perBatch: lấy đúng số nhân viên nhập cho lô này. Dòng 1-lô: dùng thẳng
      // "counted" (đã bằng số nhập ở ô duy nhất của dòng đó).
      const take = round2(Math.max(0, l.perBatch ? (Number(l.batchQty[b.id]) || 0) : counted));
      conLaiThucTe += take;
      // [MỚI] Bảng kê cân của ĐÚNG lô này: dòng 1 lô dùng l.weighings (số cân đó
      // chính là số của lô duy nhất), dòng nhiều lô dùng bảng kê riêng từng lô.
      const wLo = l.perBatch ? (l.batchWeighings[b.id] || []) : (l.weighings || []);
      pushJob(l.prepId, C.fstore.collection('prep_batches_gieogieo').doc(b.id).update({
        qtyRemaining: take, unitBase: take,
        ...(wLo.length ? { countWeighMethod: 'vessel', countWeighings: wLo, countWeighedAt: now } : {}),
        ...(take <= 0 ? { status: 'used_up', usedUpAt: now } : {})
      }));
      // [MỚI] Luôn ghi lại lô này vào affectedBatches — kể cả khi KHÔNG bị đóng (take>0).
      // Trước đây chỉ ghi khi take<=0 (lô bị đóng hẳn), vì lúc đó Quản lý chỉ cần biết để
      // RESTORE. Giờ cảnh báo lệch đếm cần điều chỉnh được CẢ CHIỀU DƯ (nhân viên đếm
      // nhiều hơn hệ thống, gõ nhầm số — lô vẫn 'active', KHÔNG bị đóng) nên phải biết
      // đích danh lô nào vừa bị sửa qtyRemaining, sửa thành bao nhiêu — không có field
      // này thì Quản lý không có cách nào tự động điều chỉnh lại, phải tự mò vào Kho sửa tay.
      affectedBatches.push({
        id: b.id, code: b.batchCode || '',
        qtyBefore: round2(Math.max(0, Number(b.qtyRemaining) || 0)),
        qtyAfter: take, closed: take <= 0,
        statusAfter: take <= 0 ? 'used_up' : 'active'
      });
      // Đếm cuối ca là số THẬT vừa xác nhận — ghi ĐÈ thẳng vào RT (không phải cộng/trừ delta),
      // tạo node nếu vì lý do gì đó chưa từng có (vd onOpen lúc nấu mẻ từng lỗi). Thử lại vài
      // lần trước khi chấp nhận lỗi — cùng lý do ở trên.
      rtJobsOfItem.push({
        batchId: b.id, stillActive: take > 0,
        promise: _ueRetryAsync(() => _ueActiveUnitsRef(l.prepId).child(b.id).transaction(cur => ({
          code: (cur && cur.code) || b.batchCode || '', itemName: (cur && cur.itemName) || l.prepName || '',
          unit: (cur && cur.unit) || l.unit || '', capacity: (cur && cur.capacity) || Number(b.qtyInitial) || take,
          openedAt: (cur && cur.openedAt) || C.now(), unitBase: take
        })))
      });
    }
    discardedQty = round2(discardedQty);
    conLaiThucTe = round2(conLaiThucTe);
    // [FIX tồn ma] currentStock phải LUÔN bằng tổng qtyRemaining của các lô — đó
    // là bất biến mà toàn bộ cơ chế trừ FIFO dựa vào. Bản cũ gán thẳng
    // currentStock = counted kể cả khi vừa huỷ sạch mọi lô: nhân viên gõ "còn
    // 300" cho một loại hạn-cuối-ngày thì 300g đó ở lại sổ mà KHÔNG có lô nào
    // đỡ, sáng hôm sau hệ thống tưởng còn hàng và tính sai lượng cần nấu.
    const tonSauDem = conLaiThucTe;
    const lechVoiSoDem = round2(counted - tonSauDem);

    // [NEW] Gửi CẢNH BÁO cho Quản lý khi lệch vượt ngưỡng.
    //
    // Trước đây chênh lệch chỉ được ghi âm thầm vào ledger (type WASTE) và trường
    // varianceQty — không có cảnh báo nào nổi lên, nên Quản lý KHÔNG BAO GIỜ biết
    // nhân viên vừa ghi đè tồn kho bằng một con số sai. Đây là lỗ hổng nghiêm trọng
    // vì màn này ghi đè THẲNG currentStock, khác kiểm kê thường (có luồng duyệt).
    // Bỏ qua khi "Bỏ hết" — đó là hành động CÓ CHỦ ĐÍCH đã ghi rõ lý do, không phải
    // nghi vấn đếm sai; và bỏ qua khi hệ thống vốn đã 0 (không có gì để so).
    // [SỬA] Chuyển xuống đây (sau vòng lặp lô) để đính kèm được affectedBatches —
    // trước đây tạo TRƯỚC vòng lặp nên alert không biết lô nào vừa bị đánh dấu hết.
    if (!l.discardAll && l.sysQty > 0 && C.af.handoverIsOverThreshold(variance, l.sysQty)) {
      const variancePct = Math.round((variance / l.sysQty) * 1000) / 10;
      pushJob(null, C.fstore.collection('alerts_gieogieo').add(_st({
        type: 'prep_count_variance',
        // Hụt (âm) nguy hiểm hơn dư: có thể là thất thoát thật hoặc gõ nhầm làm mất
        // hàng khỏi sổ sách. Dư thì thường chỉ là đếm/nhập sai.
        severity: variance < 0 ? 'danger' : 'warning',
        businessDate: shiftState.businessDate, createdAt: now,
        title: `Lệch đếm bán thành phẩm — ${l.prepName || ''}`,
        prepId: l.prepId, itemName: l.prepName || '', unit: l.unit || '',
        systemQty: l.sysQty, countedQty: counted, varianceQty: variance, variancePct,
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
        // Gồm cả lô khớp, lô thiếu/dư và lô về 0 để Quản lý đối chiếu từng mã.
        affectedBatches,
        status: 'new'
      })));
    }

    lines.push({
      prepId: l.prepId, prepName: l.prepName, unit: l.unit,
      countedQty: counted, systemQty: l.sysQty, varianceQty: variance, countedAt: now,
      discardAll: !!l.discardAll, discardedQty, closingQty: tonSauDem,
      // [MỚI] Đếm bằng cân trừ bì hay gõ tay. Quản lý nhìn dòng lệch là biết ngay
      // nên nghi số đếm hay nghi hao hụt thật.
      weighMethod: (l.perBatch
        ? l.activeBatches.some(b => (l.batchWeighings[b.id] || []).length)
        : (l.weighings || []).length) ? 'vessel' : 'manual',
      // Nhân viên gõ "còn X" nhưng lô đó bị huỷ hết (hạn cuối ngày) → X không
      // được giữ lại. Ghi ra để Quản lý thấy, thay vì âm thầm bỏ đi.
      ...(lechVoiSoDem ? { countedIgnoredQty: lechVoiSoDem } : {})
    });


    // Đồng bộ currentStock về ĐÚNG số đếm thật + ghi vết vào ledger.
    //
    // [FIX — vì sao "bỏ hết" mà app Quản lý báo waste 0đ]
    // Bản cũ ghi ĐÚNG MỘT dòng, type WASTE, qty = counted − currentStock, và
    // KHÔNG có field totalCost. Hai lỗi cộng lại thành waste = 0:
    //
    //   1) THIẾU totalCost. computeLedgerRealMetrics() bên Quản lý cộng waste
    //      bán thành phẩm bằng Σ|totalCost| (cố ý dùng giá tại thời điểm huỷ chứ
    //      không nhân lại theo giá hiện tại). Không có field đó thì mỗi dòng
    //      đóng góp 0đ — đổ bao nhiêu cũng ra 0.
    //   2) LẤY SAI SỐ LƯỢNG. currentStock là bộ đếm chạy song song, hay lệch so
    //      với tổng qtyRemaining của các lô (FIFO trừ hụt, sửa tay, lỗi mạng...).
    //      Nếu nó đã về 0 từ trước thì diff = 0 → KHÔNG ghi dòng nào, đổ cả nồi
    //      trân châu vẫn không để lại vết gì.
    //
    // GIỜ tách bạch 2 việc vốn khác hẳn nhau, mỗi việc một dòng ledger:
    //   · WASTE      = hàng ĐỔ ĐI THẬT (bỏ hết / hết hạn), số lượng lấy từ
    //                  qtyRemaining của chính các lô vừa huỷ. Đây là tiền mất thật.
    //   · ADJUSTMENT = phần sổ sách lệch còn lại KHÔNG giải thích được bằng việc
    //                  đổ bỏ (đếm sai, FIFO trừ hụt...). Là sai số ghi chép, không
    //                  phải hao hụt — gộp chung vào waste sẽ thổi phồng con số và
    //                  làm mất ý nghĩa của chỉ tiêu waste.
    // Cộng lại 2 dòng vẫn đưa currentStock về đúng `counted`, không lệch sổ.
    pushJob(l.prepId, (async () => {
      // Chờ RT của TẤT CẢ lô thuộc item này xong TRƯỚC khi quyết định có suy currentStock từ
      // tổng unit hay không — thiếu bước chờ này thì recompute có thể chạy trước khi RT kịp
      // cập nhật, đọc trúng số cũ.
      const rtResults = await Promise.allSettled(rtJobsOfItem.map(j => j.promise));
      const rtAllOk = rtResults.every(r => r.status === 'fulfilled');
      // [BUG "kiểm kê RT lỗi vẫn bị recompute sau ghi đè lại số cũ" — FIX] Trước đây chỉ CẢNH
      // BÁO khi RT lỗi rồi thôi — không có gì thật sự chặn được lượt Unit Engine TIẾP THEO (của
      // CHÍNH món này, có thể do một nghiệp vụ hoàn toàn khác kích hoạt) đọc trúng RT cũ và ghi
      // đè currentStock lùi lại. Giờ đánh dấu ĐÚNG từng lô có RT lỗi bằng `_ueRtStale:true` trên
      // Firestore — _ueRecomputeCurrentStock() sẽ tự biết bỏ qua số RT (cũ) của riêng lô đó, dùng
      // số Firestore (mới, đúng) thay thế, ở BẤT KỲ lượt suy tồn nào sau này chứ không riêng gì
      // lượt kiểm kê này. Lô nào RT ghi đúng thì gỡ cờ (phòng khi bị đánh dấu từ một lượt trước).
      await Promise.allSettled(rtJobsOfItem.map((j, i) => {
        if (!j.stillActive) return Promise.resolve(); // đã 'expired'/'used_up' — không nằm trong query recompute nữa, cờ vô nghĩa
        const ok = rtResults[i].status === 'fulfilled';
        return C.fstore.collection('prep_batches_gieogieo').doc(j.batchId).update({ _ueRtStale: !ok }).catch(() => {});
      }));
      if (!rtAllOk) {
        console.warn('[UnitEngine] đồng bộ RT lúc kiểm kê BTP cuối ca lỗi', l.prepId, rtResults.filter(r => r.status === 'rejected').map(r => r.reason));
        // Cảnh báo BỀN (không chỉ console.warn) — cho Quản lý biết cần theo dõi/đồng bộ lại thủ
        // công; bản thân số liệu đã được bảo vệ khỏi bị ghi đè nhờ `_ueRtStale` ở trên.
        C.fstore.collection('alerts_gieogieo').add(_st({
          type: 'stock_count_rt_sync_failed', severity: 'danger', status: 'new',
          businessDate: shiftState.businessDate, createdAt: new Date(C.now()).toISOString(),
          title: `Kiểm kê "${l.prepName || ''}" đã ghi Firestore nhưng đồng bộ RT lỗi`,
          prepId: l.prepId, itemName: l.prepName || '',
          note: 'currentStock đã ghi đúng số kiểm kê; lô lỗi đã được đánh dấu _ueRtStale để các lượt suy tồn sau không đọc nhầm số RT cũ. Vẫn nên kiểm tra lại lô này thủ công khi rảnh.'
        })).catch(err => console.warn('[UnitEngine] ghi cảnh báo stock_count_rt_sync_failed lỗi', l.prepId, err));
      }
      const prepRef = C.fstore.collection('prep_items_gieogieo').doc(l.prepId);
      const wasteRef = C.fstore.collection('prep_transactions_gieogieo').doc();
      const adjRef = C.fstore.collection('prep_transactions_gieogieo').doc();
      // [v4 duty] mốc đếm trước + số liệu cho hồ sơ vụ lệch (gán lại mỗi lần giao dịch chạy).
      let dutyPrev = null, dutyMeta = null, dutyAdjust = 0, dutyBook = 0;
      await C.fstore.runTransaction(async (t) => {
        const doc = await t.get(prepRef);
        if (!doc.exists) return;
        const d = doc.data();
        const cur = Number(d.currentStock) || 0;
        const gia = Number(d.costPerUnit) || 0;
        dutyPrev = d.lastCount || null; dutyMeta = { id: l.prepId, name: l.prepName || d.name || '', unit: l.unit || d.unit || '', costPerUnit: gia, batchYield: Number(d.batchYield) || 0 };
        const diff = tonSauDem - cur;
        // Phần lệch KHÔNG do đổ bỏ. VD sổ đã về 0 từ trước, đếm 0, đổ 100:
        // diff = 0 nhưng thực tế đổ 100 → adjust = +100 (sổ vốn thiếu 100 so
        // với hàng thật đang nằm trong lô), waste = −100. Tổng vẫn = 0.
        const adjust = round2(diff + discardedQty);
        const chung = {
          prepId: l.prepId, prepCode: d.code || '', prepName: l.prepName || '', unit: l.unit || '',
          staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
          createdAt: now, businessDate: shiftState.businessDate, source: 'pos'
        };
        // Cân cuối ca là số THẬT: khoản "âm chờ đối chiếu" (untrackedPendingDelta + lô âm) đã
        // được chụp ở prepShortageCollect (đối chiếu sau kiểm kê NL cuối ca) — đóng lại tại đây,
        // không dồn sang ngày sau.
        dutyAdjust = adjust; dutyBook = round2(cur - discardedQty);
        t.update(prepRef, { currentStock: tonSauDem, untrackedPendingDelta: 0, pendingShortage: 0, updatedAt: now,
          lastCount: { at: now, qty: tonSauDem, byId: staffEmp.id || '', by: staffEmp.fullName || '', businessDate: shiftState.businessDate, suspect: !!l.suspect, kind: 'close_count' } });
        if (discardedQty > 0) {
          t.set(wasteRef, _st({
            ...chung,
            type: 'WASTE', qty: -discardedQty, resultingStock: tonSauDem,
            // totalCost — field mà app Quản lý thực sự cộng. Không có nó thì
            // dòng waste này vô hình về mặt tiền.
            totalCost: round2(discardedQty * gia), costPerUnit: gia,
            reason: discardReason || 'Đổ bỏ cuối ngày',
            note: l.discardAll ? 'Bỏ hết cuối ngày (hết hạn/không dùng được)' : 'Lô quá hạn — huỷ khi đếm cuối ngày',
            fromPrepCount: true
          }));
        }
        if (adjust !== 0) {
          t.set(adjRef, _st({
            ...chung,
            type: 'ADJUSTMENT', qty: adjust, resultingStock: tonSauDem,
            totalCost: round2(Math.abs(adjust) * gia), costPerUnit: gia,
            note: 'Chênh lệch kiểm đếm cuối ngày (sổ sách vs đếm thật)',
            fromPrepCount: true
          }));
        }
      });
      // [v4 duty] Hồ sơ vụ lệch (và việc xác minh nếu số này nghi lệch). Lỗi ở đây KHÔNG làm hỏng lần đếm.
      if (dutyMeta) {
        try { await dutyOnCount({ prep: dutyMeta, prev: dutyPrev, now, by: { id: staffEmp.id, name: staffEmp.fullName }, count: tonSauDem, book: dutyBook, variance: dutyAdjust, businessDate: shiftState.businessDate, suspect: !!l.suspect, attempt1: l.attempt1 != null ? l.attempt1 : null }); }
        catch (err) { console.warn('[duty] ghi hồ sơ vụ lệch lỗi', l.prepId, err); }
      }
      // RT của mọi lô đã đúng số đếm — suy lại currentStock từ đó thay vì tin tonSauDem cộng
      // tay (2 số phải khớp nhau nếu RT đồng bộ đủ, nhưng suy từ unit mới là nguồn không thể
      // lệch tiếp ở lần Unit Engine chạy kế tiếp). RT lỗi thì giữ nguyên tonSauDem vừa ghi.
      if (rtAllOk) await _ueRecomputeCurrentStock(l.prepId, 'prep_batches_gieogieo').catch(() => {});
    })());
    return { line: lines[0], jobs };
  }

  async function lifecycleFixReceipt(recId, o) {
    const { l, huy, theoLo, tem, thua, baseDung, lyDoNguoiDung } = o;
    // [NL-RECON] Sửa phiếu nhận có thể đổi tem trước khi sửa currentStock.
    // Dừng ngay từ đầu nếu mã này đang được đối chiếu trong mẻ chế biến.
    const prepLock=await C.fstore.collection('prep_ingredient_locks_gieogieo').doc(l.itemId).get();
    const prepRt=await _ueActiveUnitsRef(l.itemId).child('__prepLock').once('value');
    if(prepLock.exists||prepRt.val())throw new Error('NL đang chờ cân của mẻ — chốt mẻ trước khi sửa phiếu nhận');
    const nowISO = new Date(C.now()).toISOString();
    const lyDo = `Sửa phiếu nhận ghi ${thua>0?'thừa':'thiếu'}: ${C.af.fmtNum(o.daGhi,2)} → ${C.af.fmtNum(o.soDung,2)} ${o.donVi} · ${lyDoNguoiDung}`;

    // 1) Sửa tem, dòng ledger RECEIVING và tồn kho trong CÙNG một transaction, để không bao giờ
    //    tồn tại trạng thái "đã trừ tồn nhưng sổ vẫn ghi 30" hay ngược lại.
    let dongLedger = [];
    try{
      dongLedger = (await C.fstore.collection('stock_transactions_gieogieo').where('referenceId','==',recId).get())
        .docs.filter(d=>{ const t=d.data(); return t.type==='RECEIVING' && t.itemId===l.itemId && !t.correctedAt; });
    }catch(err){ console.warn('[sửa phiếu nhận] không đọc được dòng ledger', err); }
    C.af.memoDropItems();
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(l.itemId);
    await C.fstore.runTransaction(async t=>{
      const lock=await t.get(C.fstore.collection('prep_ingredient_locks_gieogieo').doc(l.itemId));
      if(lock.exists)throw new Error('NL đang chờ cân của mẻ — chốt mẻ trước khi sửa phiếu nhận');
      const doc = await t.get(itemRef);
      if(!doc.exists) throw new Error('Nguyên liệu không tồn tại');
      const cur = Number(doc.data().currentStock)||0;
      if(huy.length)huy.forEach(x=>t.update(C.fstore.collection(CTN_COLL).doc(x.id), {
        status:'voided',voidedAt:nowISO,voidedBy:'management',voidReason:lyDo,needsReview:false
      }));
      else if(theoLo&&tem.length)t.update(C.fstore.collection(CTN_COLL).doc(tem[0].id),{
        baseQtyOriginal:Number(tem[0].baseQty)||0,baseQty:baseDung,
        correctedAt:nowISO,correctedBy:'management',correctReason:lyDo
      });
      t.update(itemRef, {currentStock: cur - thua, updatedAt: nowISO});
      dongLedger.forEach(d=>{
        const cu = d.data();
        t.update(d.ref, {
          qty: baseDung,
          correctedFromQty: Number(cu.qty)||0,
          correctedAt: nowISO, correctedBy:'management', correctReason: lyDo,
          // Số "còn lại sau giao dịch" chụp lúc đó nay không còn đúng nữa. Để null thay vì
          // một con số sai — màn lịch sử kho tự bỏ dòng "còn lại" khi gặp null.
          resultingStock: null,
          note: `[ĐÃ SỬA] ${lyDo} · ` + (cu.note||''),
          // [E4.9 — ledger.amend] vết sửa số lượng tại chỗ: trước/sau, lý do, ai, lúc (chỉ thêm).
          amendments: C.FieldValue.arrayUnion({ at: nowISO, by: 'management', reason: lyDo,
            before: { qty: Number(cu.qty)||0, resultingStock: cu.resultingStock ?? null }, after: { qty: baseDung, resultingStock: null } })
        });
      });
    });

    // Hàng theo LÔ mà lô đó đang MỞ: RT (nguồn thật của phần đang mở) vẫn giữ số cũ — trừ
    // đúng phần ghi thừa vào lô trong RT, không thì tồn tính lại theo tem không giảm gì.
    if(theoLo && tem.length && tem[0].status==='open' && thua){
      try{
        await _ueActiveUnitsRef(l.itemId).child(tem[0].id).transaction(cur=>{
          if(cur===null) return null;
          cur.unitBase = Math.round(((Number(cur.unitBase)||0) - thua)*100)/100;
          cur.capacity = baseDung;
          return cur;
        });
        await C.fstore.collection(CTN_COLL).doc(tem[0].id).update({ unitBase: C.FieldValue.increment(-thua) });
      }catch(err){ console.warn('[sửa phiếu nhận] trừ lô đang mở trong RT lỗi', err); }
    }
    // [TEM = SỰ THẬT] Tem vừa huỷ/sửa dung tích → chốt tồn theo tổng mã.
    const itFix = (C.getItems()||[]).find(x=>x.id===l.itemId);
    if(isTemTrackedNL(itFix)) await recomputeTemStock(l.itemId).catch(err=>console.warn('[Tem] chốt tồn theo mã lỗi', err));
    return { nowISO, lyDo, ledgerIds: dongLedger.map(d => d.id) };
  }

  // ════════════════════════ E2 — CHÚ THÍCH / SỬA SỔ / FIFO (API mới) ════════════════════════
  // Lỗi có mã (3.5). Nơi gọi đọc err.code; message tiếng Việt để hiện thẳng cho người dùng.
  function UnitEngineError(code, message, meta) {
    const e = new Error(message || code); e.name = 'UnitEngineError'; e.code = code; if (meta) e.meta = meta; return e;
  }
  // Danh sách trường CHÚ THÍCH được phép ghi từ ngoài engine (3.9) — chốt từ code ở E0:
  //  tem   : markStockLabelsPrinted, markOpenLabelStuck, confirmOpenLabelStuck (POS), ctnMarkReviewed (QL)
  //  lô    : prepBatchExtendExpiryCore (QL)
  //  sổ    : wasteAssignSave, thangKetDuyetSuKien (QL), _voidBackfillConsumptionPOS (POS)
  // Trường số lượng/trạng thái (unitBase, qty, type, status…) KHÔNG nằm đây → FIELD_NOT_ANNOTATABLE.
  const ANNOTATABLE = {
    containers: ['labelPrinted', 'labelPrintedAt', 'openLabelPrinted', 'openLabelPrintedAt', 'needsReview', 'reviewedAt', 'reviewedBy', 'note'],
    batches: ['expiresAt', 'needsReview', 'reviewedAt', 'reviewedBy', 'note'],
    ledger: ['responsibility', 'responsibilityOriginal', 'responsibilityHistory', 'needsReview', 'reviewedAt', 'reviewedBy', 'voided', 'voidedAt', 'voidedReason', 'note',
      'substitutionQty', 'substitutionReconId', 'substitutionFor',
      'entryErrorConfirmed', 'entryErrorQty', 'entryErrorFoundInBatch', 'entryErrorCorrectedBy', 'entryErrorCorrectedById', 'entryErrorAt'],
    anomalies: ['status', 'reconId', 'resolvedAt', 'resolvedBy', 'resolution', 'resolutionNote', 'note']
  };
  function _checkAnnotate(kind, fields) {
    const ok = ANNOTATABLE[kind];
    for (const k of Object.keys(fields || {})) {
      if (!ok.includes(String(k).split('.')[0])) throw UnitEngineError('FIELD_NOT_ANNOTATABLE', 'Trường "' + k + '" không được sửa qua chú thích (' + kind + ')', { field: k });
    }
  }
  function _ledgerColl(kind) { return kind === 'prep' ? 'prep_transactions_gieogieo' : 'stock_transactions_gieogieo'; }
  async function containersAnnotate(id, fields) { _checkAnnotate('containers', fields); await C.fstore.collection(STOCK_CONTAINERS_COLL).doc(id).update(fields); }
  async function batchesAnnotate(id, fields) { _checkAnnotate('batches', fields); await C.fstore.collection('prep_batches_gieogieo').doc(id).update(fields); }
  // opts.kind: 'stock' (mặc định) | 'prep' — hoặc opts.coll truyền thẳng tên collection sổ.
  async function ledgerAnnotate(txId, fields, opts) {
    _checkAnnotate('ledger', fields);
    const coll = (opts && opts.coll) || _ledgerColl(opts && opts.kind);
    if (coll !== 'stock_transactions_gieogieo' && coll !== 'prep_transactions_gieogieo') throw UnitEngineError('INVALID_QTY', 'Không phải collection sổ: ' + coll);
    await C.fstore.collection(coll).doc(txId).update(fields);
  }
  async function anomalyResolve(id, fields) { _checkAnnotate('anomalies', fields); await C.fstore.collection(STOCK_ANOMALY_COLL).doc(id).update(fields); }
  // Sửa SỐ LƯỢNG / LOẠI của một dòng sổ đã có (2.5) — luôn lưu vết amendments[] {at, by, reason,
  // before, after}; trường cũ giữ nguyên nghĩa (6.6). Dùng trong transaction của nghiệp vụ gọi:
  //   ledgerAmendInTx(t, ref, dataĐãĐọc, patch, {reason, by})  — không tự đọc, không tự commit.
  const AMENDABLE = ['qty', 'type', 'resultingStock', 'reclassifiedFrom', 'reclassifiedToConsumptionQty', 'reclassifiedAt', 'reclassifiedBy', 'amendNote', 'note'];
  function ledgerAmendInTx(t, ref, data, patch, meta) {
    if (!meta || !meta.reason) throw UnitEngineError('INVALID_QTY', 'ledger.amend cần lý do');
    const before = {}, after = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!AMENDABLE.includes(k)) throw UnitEngineError('FIELD_NOT_ANNOTATABLE', 'ledger.amend không sửa trường "' + k + '"', { field: k });
      before[k] = data && data[k] !== undefined ? data[k] : null; after[k] = v;
    }
    const entry = { at: new Date(C.now()).toISOString(), by: meta.by || '', reason: meta.reason, before, after };
    t.update(ref, Object.assign({}, patch, { amendments: C.FieldValue.arrayUnion(entry) }));
    return entry;
  }
  async function ledgerAmend(txId, patch, meta) {
    const ref = C.fstore.collection((meta && meta.coll) || _ledgerColl(meta && meta.kind)).doc(txId);
    return C.fstore.runTransaction(async t => {
      const d = await t.get(ref);
      if (!d.exists) throw UnitEngineError('LEDGER_UNKNOWN', 'Không có dòng sổ ' + txId);
      return ledgerAmendInTx(t, ref, d.data(), patch, meta);
    });
  }
  // FIFO — "tem cần xác nhận đã hết": tem NGUYÊN LIỆU đang mở mà unitBase ≤ 0 (bỏ qua nợ đã báo
  // hết và tem đang báo huỷ). Tính thuần từ ảnh chụp RT active_units_gieogieo (phần dữ liệu của
  // refreshFifoAlert — POS giữ listener + vẽ).
  function fifoPendingFromRt(rtRoot, nlIds) {
    const nl = nlIds instanceof Set ? nlIds : new Set(nlIds || []);
    const list = [];
    Object.entries(rtRoot || {}).forEach(([itemId, node]) => {
      if (!nl.has(itemId) || !node || typeof node !== 'object') return;
      Object.entries(node).forEach(([id, u]) => {
        if (id === '__prepLock' || !u || typeof u !== 'object' || u.finishedDebt || u.discardPending) return;
        if (!(Number(u.unitBase) <= 0)) return;
        list.push({ id, itemId, code: u.code || '', itemName: u.itemName || '', unit: u.unit || '',
          unitBase: Number(u.unitBase) || 0, status: 'open',
          openedAt: u.openedAt ? new Date(Number(u.openedAt)).toISOString() : '' });
      });
    });
    list.sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));
    return list;
  }

  // ════════════════════════ KHỞI TẠO & API ════════════════════════
  const noop = () => {};
  // Bảng hàm giao diện: gọi tên chưa khai → no-op (không làm hỏng nghiệp vụ kho vì thiếu một lần vẽ lại).
  function _safeTable(t) { return new Proxy(t || {}, { get: (o, k) => (typeof o[k] === 'function' ? o[k] : noop) }); }
  // [Sửa lỗi đồng hồ] Mốc B9 lớn hơn now()+60 giây coi là mốc "tương lai" (máy chạy giờ nhanh để lại).
  const FUTURE_STAMP_MS = 60 * 1000;
  // Chờ tối đa bấy nhiêu cho .info/serverTimeOffset lần đầu (RTDB chỉ báo sau khi bắt tay máy chủ).
  const CLOCK_WAIT_MS = 3000;
  // serverClock mà chưa nhận được lệch giờ từ máy chủ → chờ tối đa CLOCK_WAIT_MS. Trả true nếu đã có.
  function _ueClockReady(ms) {
    if (!C.serverClock || C.clockReady) return Promise.resolve(true);
    return new Promise(res => {
      const t = setTimeout(() => { C.clockWaiters = C.clockWaiters.filter(f => f !== done); res(false); }, ms == null ? CLOCK_WAIT_MS : ms);
      const done = () => { clearTimeout(t); res(true); };
      C.clockWaiters.push(done);
    });
  }
  function init(cfg) {
    if (!cfg || !cfg.fstore || !cfg.db) throw new Error('UnitEngine.init: thiếu fstore/db');
    if (cfg.app != null && typeof cfg.app !== 'string') throw new Error("UnitEngine.init: 'app' là tên app ('pos' | 'quanly'); bảng hàm app truyền qua 'appFns'");
    const hooks = Object.assign({ notify: noop, report: noop, fifoChanged: () => Promise.resolve(), closeScanSheet: noop, openUnitsChanged: noop, stockChanged: noop }, cfg.hooks || {});
    const fifo = hooks.fifoChanged; hooks.fifoChanged = (...a) => Promise.resolve(fifo(...a));
    C = {
      app: cfg.app || 'pos', storeId: cfg.storeId || 'gg01',
      fstore: cfg.fstore, db: cfg.db,
      FieldValue: cfg.FieldValue || (root.firebase && root.firebase.firestore && root.firebase.firestore.FieldValue),
      businessDate: cfg.businessDate || (() => { const d = new Date(C.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }),
      // [E6 — C1] serverClock:true → now() = giờ máy chủ (Date.now() + .info/serverTimeOffset; lệch mặc
      // định 0, không chờ). Test truyền `now` riêng thì dùng `now` đó (vẫn bật logic giờ máy chủ).
      serverClock: !!cfg.serverClock, clockOffset: 0, clockReady: !!cfg.now, clockWaiters: [],
      now: cfg.now || (() => Date.now() + (C ? C.clockOffset : 0)),
      random: cfg.random || (() => Math.random()),
      randomBytes: cfg.randomBytes || (a => (root.crypto || root.msCrypto).getRandomValues(a)),
      getItems: cfg.getItems || (() => []), getPreps: cfg.getPreps || (() => []),
      getRefillRule: cfg.getRefillRule || (() => null), getBiggestPackagingUnit: cfg.getBiggestPackagingUnit || (() => null),
      hooks,
      // [E4] Nghiệp vụ chuyển nguyên văn vào engine vẫn gọi đúng các bước giao diện / đọc đúng trạng
      // thái màn hình như trước — qua 3 bảng do app truyền vào (thiếu hàm nào thì bỏ qua, không ném lỗi):
      //   ui    — vẽ lại / mở popup (app);  state — đọc trạng thái màn hình (chỉ đọc);
      //   appFns (C.af) — hàm tính toán thuần của app (công thức, giá vốn…) mà engine không sở hữu.
      ui: _safeTable(cfg.ui), state: cfg.state || {}, af: cfg.appFns || {}
    };
    if (C.serverClock && !cfg.now) {
      try {
        // RTDB chỉ báo giá trị này SAU khi bắt tay máy chủ — trước đó lệch = 0 là CHƯA BIẾT, không phải
        // "đúng giờ" (máy chạy nhanh 8 phút sẽ ghi mốc tương lai). clockReady chỉ bật khi có số thật.
        C.db.ref('.info/serverTimeOffset').on('value', snap => {
          const raw = snap && snap.val(); const v = Number(raw);
          if (raw == null || !Number.isFinite(v)) return;
          C.clockOffset = v;
          if (!C.clockReady) { C.clockReady = true; const w = C.clockWaiters; C.clockWaiters = []; w.forEach(f => f()); }
        });
      } catch (err) { console.warn('[UnitEngine] không đọc được .info/serverTimeOffset — dùng giờ máy', err); }
    }
    return api;
  }
  // ════════════════════════ [v4] DUTY — quy trách nhiệm lệch/hao hụt theo ca ════════════════════════
  // Hàm THUẦN (không đọc/ghi dữ liệu) — kế hoạch docs/KE_HOACH_TRACH_NHIEM_CA.md mục 2–3. Quy ước dấu:
  //   variance < 0 = THIẾU (thực tế ít hơn sổ), > 0 = DƯ. Mọi phần quy trách nhiệm mang cùng dấu với variance.
  // Nguyên tắc: phần nào quy cho một người phải có cơ sở (nhập sai đã xác minh, người nấu mẻ, có mặt lúc bán);
  // không đủ cơ sở → vào `pool` ("chưa quy"), không đổ đại.
  const DUTY = {
    RECOUNT_PCT: 0.5, RECOUNT_MIN: 150,     // bắt cân lại: ≥50% lượng dùng VÀ ≥150
    NOTIFY_PCT: 1.0, NOTIFY_MIN: 50,        // báo chủ: >100% lượng dùng VÀ ≥50
    RESOLUTION: 1,                          // dưới 1 đơn vị đo nhỏ nhất = làm tròn, không phải lệch
    VERIFY_TTL_MS: 48 * 3600 * 1000,        // việc xác minh tự đóng sau 48 giờ
    BIAS_MIN_N: 5, BIAS_SAME_SIGN: 0.8, BIAS_MIN_EXPOSURE: 0.2,
    PROD_DEV_PCT: 0.15,                     // mẻ nấu lệch ≥15% so với định lượng mới gán người nấu
    OPEN_SHIFT_CAP_MS: 14 * 3600 * 1000,
    PROCESSING_STALE_MS: 60 * 1000,         // việc xác minh đang xử lý quá 60 giây mà chưa xong → người khác giành lại được
    COVER_MIN: 0.5                          // dưới mức này (số bán xác định được ca) → cả khoản vào "chưa quy"
  };
  const _dAbs = Math.abs;
  const _dSign = x => (x < 0 ? -1 : 1);
  const _dMs = iso => { const t = typeof iso === 'number' ? iso : Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
  // Nền để so phần trăm: lượng dùng theo sổ trong khoảng đo; không có thì lấy số sổ.
  function dutyBase(usage, book) { const u = Number(usage) || 0; if (u > 0) return u; const b = Number(book) || 0; return b > 0 ? b : 1; }
  function dutyNeedsRecount(o) {
    const v = _dAbs(Number(o && o.variance) || 0), base = dutyBase(o && o.usage, o && o.book);
    return v >= base * DUTY.RECOUNT_PCT && v >= DUTY.RECOUNT_MIN;
  }
  function dutyNeedsNotify(o) {
    const v = _dAbs(Number(o && o.variance) || 0), base = dutyBase(o && o.usage, o && o.book);
    return v > base * DUTY.NOTIFY_PCT && v >= DUTY.NOTIFY_MIN;
  }
  // Hai lần cân "như nhau" (vẫn nhập như vậy): sai khác trong sai số cân.
  function dutySameWeigh(a, b) { a = Number(a) || 0; b = Number(b) || 0; return _dAbs(a - b) <= Math.max(10, 0.03 * Math.max(_dAbs(a), _dAbs(b))); }

  // Ca → khoảng có mặt. Ca chưa check-out: cắt theo giờ đóng ngày (closeAt) hoặc tối đa 14 giờ.
  function dutyPresence(shifts, closeAt) {
    const closeMs = _dMs(closeAt);
    return (shifts || []).map(s => {
      const from = _dMs(s.checkedInAt); if (from == null) return null;
      let to = _dMs(s.checkedOutAt);
      if (to == null) to = closeMs != null && closeMs > from ? closeMs : from + DUTY.OPEN_SHIFT_CAP_MS;
      return { id: s.employeeId || '', name: s.employeeName || '', roles: Array.isArray(s.roles) ? s.roles : null, from, to };
    }).filter(Boolean);
  }
  // Ai chịu trách nhiệm định lượng tại thời điểm t: người "pha chế" có mặt; không ai khai chức năng thì dự phòng tất cả.
  function dutyOnDuty(presence, t) {
    const here = presence.filter(p => p.from <= t && t <= p.to);
    const bar = here.filter(p => p.roles && p.roles.indexOf('barista') >= 0);
    if (bar.length) return { people: bar, fallback: false };
    return { people: here, fallback: here.length > 0 };
  }
  // Lệch nền do công thức: so các khoảng đo gần đây. history: [{variance, usage, weights:{employeeId: tỉ trọng}}].
  // Lệch do công thức thì MỌI người đều lệch cùng chiều/cùng mức; lệch do thói quen một người thì chỉ người đó lệch.
  function dutyDetectRecipeBias(history) {
    const h = (history || []).filter(x => x && Number(x.usage) > 0 && x.variance != null);
    if (h.length < DUTY.BIAS_MIN_N) return { recipe: false, reason: 'it_mau', n: h.length };
    const ratios = h.map(x => x.variance / x.usage).sort((a, b) => a - b);
    const med = ratios.length % 2 ? ratios[ratios.length >> 1] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2;
    if (!med) return { recipe: false, reason: 'khong_lech', n: h.length };
    const same = ratios.filter(r => _dSign(r) === _dSign(med)).length / ratios.length;
    if (same < DUTY.BIAS_SAME_SIGN) return { recipe: false, reason: 'khong_cung_chieu', n: h.length };
    // Lệch bình quân theo từng người, trọng số = phần tiếp xúc của người đó.
    const per = {};
    let totalU = 0;
    h.forEach(x => {
      totalU += x.usage;
      Object.keys(x.weights || {}).forEach(id => {
        const w = Number(x.weights[id]) || 0; if (w <= 0) return;
        const o = per[id] || (per[id] = { v: 0, u: 0 }); o.v += w * x.variance; o.u += w * x.usage;
      });
    });
    const people = Object.keys(per).filter(id => per[id].u >= totalU * DUTY.BIAS_MIN_EXPOSURE);
    if (people.length < 2) return { recipe: false, reason: 'khong_phan_biet_duoc_voi_nguoi', n: h.length };
    const rp = people.map(id => per[id].v / per[id].u);
    const allSame = rp.every(r => _dSign(r) === _dSign(med));
    const ratio = Math.min.apply(null, rp.map(_dAbs)) / Math.max.apply(null, rp.map(_dAbs));
    if (!allSame || ratio < 0.5) {
      const byPerson = {}; people.forEach((id, i) => { byPerson[id] = round2(rp[i]); });
      return { recipe: false, reason: 'lech_theo_nguoi', n: h.length, byPerson };
    }
    return { recipe: true, ratio: round2(med * 1000) / 1000, n: h.length, same: round2(same) };
  }

  // Phân rã một vụ lệch. input:
  //   variance, costPerUnit, usage:[{at, qty, refId, timeUnknown}], shifts:[...], closeAt,
  //   entryError:{qty, byId, byName, clean} | null, baseline:{ratio} | null, verified (đã xác minh là lệch thật), book,
  //   production:[{staffId, staffName, recorded, expected, at}]
  function dutyAttributeInterval(inp) {
    const cost = Number(inp.costPerUnit) || 0;
    const v = round2(inp.variance);
    const out = { variance: v, value: round2(_dAbs(v) * cost), parts: [], allocations: [], pool: [], notes: [], confidence: 'weak', kind: 'none' };
    if (_dAbs(v) < DUTY.RESOLUTION) return out;
    let rem = v;
    const addAlloc = (part, id, name, qty, basis, conf) => {
      qty = round2(qty); if (!qty) return;
      part.allocations.push({ employeeId: id || '', employeeName: name || '', qty, value: round2(_dAbs(qty) * cost), basis, confidence: conf });
    };
    // 1. Lỗi nhập số đã xác minh → người nhập.
    const ee = inp.entryError;
    if (ee && Number(ee.qty)) {
      const q = _dAbs(ee.qty) > _dAbs(rem) && _dSign(ee.qty) === _dSign(rem) ? rem : Number(ee.qty);
      const part = { kind: 'entry_error', qty: round2(q), allocations: [] };
      addAlloc(part, ee.byId, ee.byName, q, 'nhap_sai_da_xac_minh', ee.clean === false ? 'medium' : 'strong');
      if (ee.clean === false) out.notes.push('khoang_khong_sach');
      out.parts.push(part); rem = round2(rem - q);
    }
    // 2. Lệch nền do công thức → không ai chịu.
    const usageTotal = (inp.usage || []).reduce((s, e) => s + (Number(e.qty) || 0), 0);
    if (inp.baseline && Number(inp.baseline.ratio) && usageTotal > 0 && _dAbs(rem) >= DUTY.RESOLUTION) {
      const rq = inp.baseline.ratio * usageTotal;
      if (_dSign(rq) === _dSign(rem)) {
        const take = _dSign(rem) * Math.min(_dAbs(rq), _dAbs(rem));
        out.parts.push({ kind: 'recipe', qty: round2(take), allocations: [] });
        out.pool.push({ kind: 'recipe', qty: round2(take), value: round2(_dAbs(take) * cost), reason: 'dinh_muc_lech_nen' });
        rem = round2(rem - take);
      }
    }
    // 3. Mẻ nấu có sản lượng ghi lệch lớn so với định lượng → người nấu (chỉ phần cùng chiều với lệch còn lại).
    (inp.production || []).forEach(p => {
      if (_dAbs(rem) < DUTY.RESOLUTION) return;
      const exp = Number(p.expected) || 0, rec = Number(p.recorded) || 0;
      if (!(exp > 0)) return;
      const dev = rec - exp;                    // ghi nhiều hơn thực → sổ phồng → sau này THIẾU
      if (_dAbs(dev) / exp < DUTY.PROD_DEV_PCT || _dSign(-dev) !== _dSign(rem)) return;
      const q = _dSign(rem) * Math.min(_dAbs(dev), _dAbs(rem));
      const part = { kind: 'production', qty: round2(q), allocations: [] };
      addAlloc(part, p.staffId, p.staffName, q, 'nguoi_nau_me', 'medium');
      out.parts.push(part); rem = round2(rem - q);
    });
    // 3b. Lệch cực đoan CHƯA được cân lại/xác minh (đáng lẽ phải bị bắt cân lại): có thể là nhập sai số, không đủ
    //     cơ sở chia theo ca → "chưa quy" cho tới khi có người xác minh (inp.verified = true khi đã xác minh là lệch thật).
    if (_dAbs(rem) >= DUTY.RESOLUTION && !inp.verified && dutyNeedsRecount({ variance: rem, usage: usageTotal, book: inp.book })) {
      out.pool.push({ kind: 'unverified', qty: rem, value: round2(_dAbs(rem) * cost), reason: 'lech_cuc_doan_chua_xac_minh' });
      out.parts.push({ kind: 'unverified', qty: rem, allocations: [] });
      out.notes.push('chua_xac_minh'); rem = 0;
    }
    // 4. Phần còn lại chia theo tiếp xúc: số bán theo sổ của từng người pha chế có mặt lúc đó.
    if (_dAbs(rem) >= DUTY.RESOLUTION) {
      const presence = dutyPresence(inp.shifts, inp.closeAt);
      const weights = {}, names = {}, ids = {};
      let covered = 0, total = 0, fb = 0;
      (inp.usage || []).forEach(e => {
        const q = Number(e.qty) || 0; if (q <= 0) return;
        total += q;
        const t = e.timeUnknown ? null : _dMs(e.at);
        if (t == null) return;
        const d = dutyOnDuty(presence, t);
        if (!d.people.length) return;
        covered += q; if (d.fallback) fb += q;
        d.people.forEach(p => { const k = p.id || p.name; weights[k] = (weights[k] || 0) + q / d.people.length; names[k] = p.name; ids[k] = p.id; });
      });
      const part = { kind: 'exposure', qty: rem, allocations: [] };
      const cover = total > 0 ? covered / total : 0;
      if (total <= 0) { out.pool.push({ kind: 'unknown', qty: rem, value: round2(_dAbs(rem) * cost), reason: 'khong_co_luot_ban_trong_khoang' }); part.qty = 0; }
      else if (cover < DUTY.COVER_MIN) { out.pool.push({ kind: 'unknown', qty: rem, value: round2(_dAbs(rem) * cost), reason: 'khong_xac_dinh_duoc_ca_cua_so_ban' }); part.qty = 0; out.notes.push('phu_ban_' + Math.round(cover * 100) + '%'); }
      else {
        const share = rem * cover, sumW = Object.keys(weights).reduce((s, k) => s + weights[k], 0);
        Object.keys(weights).forEach(k => addAlloc(part, ids[k], names[k], share * weights[k] / sumW, 'chia_theo_so_ban', 'medium'));
        const left = round2(rem - share);
        if (_dAbs(left) >= DUTY.RESOLUTION) out.pool.push({ kind: 'unknown', qty: left, value: round2(_dAbs(left) * cost), reason: 'ban_khong_ro_gio_hoac_ca' });
        part.qty = round2(share);
        if (fb > 0) out.notes.push('du_phong_khong_ai_khai_pha_che');
        if (cover < 0.9) out.notes.push('phu_ban_' + Math.round(cover * 100) + '%');
      }
      out.parts.push(part);
    }
    // Gộp theo người.
    const by = {};
    out.parts.forEach(p => p.allocations.forEach(a => {
      const k = a.employeeId || a.employeeName; const o = by[k] || (by[k] = { employeeId: a.employeeId, employeeName: a.employeeName, qty: 0, value: 0, confidence: a.confidence, basis: [] });
      o.qty = round2(o.qty + a.qty); o.value = round2(o.value + a.value);
      if (o.basis.indexOf(a.basis) < 0) o.basis.push(a.basis);
      if (a.confidence === 'strong') o.confidence = 'strong';
    }));
    out.allocations = Object.keys(by).map(k => Object.assign(by[k], { share: round2(by[k].qty / v * 1000) / 1000 })).sort((a, b) => _dAbs(b.qty) - _dAbs(a.qty));
    const personQty = out.allocations.reduce((s, a) => s + _dAbs(a.qty), 0);
    const strongQty = out.allocations.filter(a => a.confidence === 'strong').reduce((s, a) => s + _dAbs(a.qty), 0);
    out.confidence = strongQty >= _dAbs(v) * 0.5 ? 'strong' : (personQty >= _dAbs(v) * 0.5 ? 'medium' : 'weak');
    out.kind = out.parts.some(p => p.kind === 'entry_error') ? 'entry_error' : (out.allocations.length ? 'exposure' : (out.pool.length ? 'pool' : 'none'));
    return out;
  }

  // Người B cân lại (xác minh) so với số A đã chốt.
  //   a: {count, book, byId, byName}  — số A cân và sổ lúc A cân
  //   b: {count, book, byId, byName}  — số B cân và sổ TẠI GIỜ B cân (đã trừ các lần bán từ lúc A chốt)
  //   base: nền so phần trăm (lượng dùng), clean: khoảng giữa chỉ có bán đã ghi
  // Trả {outcome:'confirmed'|'entry_error'|'dispute', trueVariance, entryErrorQty, dB}. Tranh chấp chỉ khi B lệch nhiều so với A
  // VÀ cũng không khớp sổ gốc.
  function dutyResolveVerification(o) {
    const vA = round2((Number(o.a.count) || 0) - (Number(o.a.book) || 0));
    const dB = round2((Number(o.b.count) || 0) - (Number(o.b.book) || 0));
    if (_dAbs(dB) < DUTY.RESOLUTION || dutySameWeigh(o.b.count, o.b.book)) return { outcome: 'confirmed', vA, dB, trueVariance: vA, entryErrorQty: 0 };   // B cân như số A (trong sai số cân)
    const big = dutyNeedsRecount({ variance: dB, usage: o.base, book: o.a.book });
    // Số B cân khớp với SỔ GỐC trước lần đếm của A (đã trừ các lần bán từ đó) = hai nguồn độc lập (sổ + B) cùng chống lại số của A
    // → A nhập sai, dù hai lần cân lệch nhau nhiều. B không khớp cả A lẫn sổ gốc → không ai chắc đúng → chủ quyết.
    const bookAgree = dutySameWeigh(o.b.count, (Number(o.b.book) || 0) - vA);
    if (big && !bookAgree) return { outcome: 'dispute', vA, dB, trueVariance: null, entryErrorQty: null };
    // A đếm sai e = −dB; vA = vTrue + e.
    return { outcome: 'entry_error', vA, dB, trueVariance: round2(vA + dB), entryErrorQty: round2(-dB), clean: o.clean !== false, bookAgree };
  }


  // ════════════════════════ [v4] DUTY — đọc dữ liệu, ghi hồ sơ vụ lệch, việc xác minh ════════════════════════
  const DUTY_CASES = 'duty_cases_gieogieo', DUTY_TASKS = 'duty_tasks_gieogieo', DUTY_CFG = 'duty_config_gieogieo';
  const _dayKey = ms => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);       // ngày theo giờ Việt Nam
  const _dutyDays = (fromMs, toMs) => { const out = []; for (let t = fromMs - 86400000; t <= toMs + 86400000; t += 86400000) { const k = _dayKey(t); if (out.indexOf(k) < 0) out.push(k); } return out; };
  const _dutyNowMs = () => C.now();
  // Giờ của dòng bán: id bill mang giờ tạo (bill_<ms>_…) — đúng cả với bill bổ sung sau đóng ngày (createdAt khi đó là giờ bổ sung).
  function dutyTxTime(t) {
    const m = /^bill_(\d{12,14})_/.exec(String(t.referenceId || t.id || ''));
    if (m) return Number(m[1]);
    if (t.backfillAfterClose) return null;
    return _dMs(t.createdAt);
  }
  async function dutyLoadPrepTx(prepId, fromMs, toMs) {
    const rows = [], seen = {};
    const snaps = await Promise.all(_dutyDays(fromMs, toMs).map(day => C.fstore.collection(P.prepTx()).where('prepId', '==', prepId).where('businessDate', '==', day).get()));
    snaps.forEach(snap => snap.docs.forEach(d => { if (!seen[d.id]) { seen[d.id] = 1; rows.push(Object.assign({ id: d.id }, d.data())); } }));
    return rows;
  }
  // NL: sổ kho theo ngày của MỘT nguyên liệu (bán theo bill, nấu mẻ, hao hụt, nhập…).
  async function dutyLoadStockTx(itemId, fromMs, toMs) {
    const rows = [], seen = {};
    const snaps = await Promise.all(_dutyDays(fromMs, toMs).map(day => C.fstore.collection(P.stockTx()).where('itemId', '==', itemId).where('businessDate', '==', day).get()));
    snaps.forEach(snap => snap.docs.forEach(d => { if (!seen[d.id]) { seen[d.id] = 1; rows.push(Object.assign({ id: d.id }, d.data())); } }));
    return rows;
  }
  // Lượng dùng theo sổ trong (fromMs, toMs] — gộp theo bill, trừ phần đã hoàn khi xoá bill.
  function dutyUsageFromTx(rows, fromMs, toMs) {
    const by = {};
    (rows || []).forEach(t => {
      const ty = String(t.type || '').toUpperCase(), q = Number(t.qty) || 0;
      const isCons = ty === 'CONSUMPTION', isRev = ty === 'ADJUSTMENT' && t.reversal === true;
      if (!isCons && !isRev) return;
      const key = t.referenceId || t.id;
      const o = by[key] || (by[key] = { refId: key, qty: 0, at: null, ms: null, timeUnknown: false, createdMs: null });
      o.qty += -q;
      if (isCons) { const tm = dutyTxTime(t); if (tm == null) o.timeUnknown = true; else { o.ms = tm; o.at = new Date(tm).toISOString(); } o.createdMs = _dMs(t.createdAt); }
    });
    return Object.keys(by).map(k => by[k]).filter(e => e.qty > 0.0001).filter(e => { const ms = e.timeUnknown ? e.createdMs : e.ms; return ms != null && ms > fromMs && ms <= toMs; });
  }
  // Khoảng "sạch" = chỉ có bán đã ghi (không nấu, đổ, điều chỉnh khác) trong (fromMs, toMs].
  function dutyIsClean(rows, fromMs, toMs) {
    return !(rows || []).some(t => {
      const ty = String(t.type || '').toUpperCase(); if (ty === 'CONSUMPTION' || (ty === 'ADJUSTMENT' && t.reversal === true)) return false;
      const ms = _dMs(t.createdAt); return ms != null && ms > fromMs && ms <= toMs;
    });
  }
  // Ca làm việc: nhiều BTP cùng đếm một lúc dùng chung một lượt đọc (nhớ ngắn hạn).
  const _dutyShiftMemo = {};
  async function dutyLoadShifts(fromMs, toMs) {
    const key = _dutyDays(fromMs, toMs).join(',');
    const memo = _dutyShiftMemo[key];
    if (memo && C.now() - memo.at < 60000) return memo.promise.then(list => list.filter(s => { const a = _dMs(s.checkedInAt), b = _dMs(s.checkedOutAt); return a != null && a <= toMs && (b == null || b >= fromMs); }));
    const promise = (async () => {
      const out = [], seen = {};
      const snaps = await Promise.all(_dutyDays(fromMs, toMs).map(day => C.fstore.collection('employee_shifts_gieogieo').where('businessDate', '==', day).get()));
      snaps.forEach(snap => snap.docs.forEach(d => { if (seen[d.id]) return; seen[d.id] = 1; out.push(Object.assign({ id: d.id }, d.data())); }));
      return out;
    })();
    _dutyShiftMemo[key] = { at: C.now(), promise };
    promise.catch(() => { delete _dutyShiftMemo[key]; });
    return promise.then(out => out.filter(s => { const a = _dMs(s.checkedInAt), b = _dMs(s.checkedOutAt); return a != null && a <= toMs && (b == null || b >= fromMs); }));
  }
  async function dutyLoadProduction(prep, fromMs, toMs) {
    const out = [], seen = {};
    const snaps = await Promise.all(_dutyDays(fromMs, toMs).map(day => C.fstore.collection(P.batches()).where('prepId', '==', prep.id).where('businessDate', '==', day).get()));
    for (const snap of snaps) {
      snap.docs.forEach(d => {
        if (seen[d.id]) return; seen[d.id] = 1; const b = d.data();
        const f = _dMs(b.finishedAt); if (b.status === 'cancelled' || f == null || f <= fromMs || f > toMs || !(Number(b.qtyInitial) > 0)) return;
        out.push({ batchId: d.id, staffId: b.staffEmployeeId || '', staffName: b.staff || '', recorded: Number(b.qtyInitial) || 0, expected: (Number(b.batchRatio) || 1) * (Number(prep.batchYield) || 0), at: b.finishedAt });
      });
    }
    return out;
  }
  async function dutyConfig() {
    try { const d = await C.fstore.collection(DUTY_CFG).doc('current').get(); return d.exists ? d.data() : {}; } catch (e) { return {}; }
  }
  async function dutyLoadHistory(prepId, sinceMs) {
    const snap = await C.fstore.collection(DUTY_CASES).where('prepId', '==', prepId).get();
    return snap.docs.map(d => d.data()).filter(c => c.bias && c.interval && (_dMs(c.interval.to) || 0) > (sinceMs || 0))
      .sort((a, b) => (_dMs(a.interval.to) || 0) - (_dMs(b.interval.to) || 0)).slice(-10).map(c => c.bias);
  }
  // Tính phân rã cho một khoảng đo (đọc dữ liệu rồi gọi hàm thuần). o: {prep, fromMs, toMs, variance, book, entryError, verified}
  async function dutyCompute(o) {
    const { prep, fromMs, toMs } = o;
    const rows = o.nl ? await dutyLoadStockTx(prep.id, fromMs, toMs) : await dutyLoadPrepTx(prep.id, fromMs, toMs);
    const usage = dutyUsageFromTx(rows, fromMs, toMs);
    const shifts = await dutyLoadShifts(fromMs, toMs);
    const production = o.nl ? [] : await dutyLoadProduction(prep, fromMs, toMs);
    const cfg = await dutyConfig();
    const resetMs = _dMs((cfg.baselineResetAt || {})[prep.id]) || 0;
    const base = dutyDetectRecipeBias(await dutyLoadHistory(prep.id, resetMs));
    const usageTotal = round2(usage.reduce((s, e) => s + e.qty, 0));
    const result = dutyAttributeInterval({ variance: o.variance, costPerUnit: prep.costPerUnit, usage: usage.map(e => ({ at: e.at, qty: e.qty, refId: e.refId, timeUnknown: e.timeUnknown })),
      shifts, closeAt: new Date(toMs).toISOString(), entryError: o.entryError || null, baseline: base.recipe ? { ratio: base.ratio } : null,
      production, verified: !!o.verified, book: o.book });
    // Hồ sơ cho phát hiện lệch nền sau này: chỉ khoảng đã đủ tin cậy (không phải lệch cực đoan chưa xác minh / tranh chấp).
    let bias = null;
    if (result.notes.indexOf('chua_xac_minh') < 0) {
      const vTrue = round2(o.variance - ((o.entryError && Number(o.entryError.qty)) || 0));
      const w = {}, ex = result.parts.find(p => p.kind === 'exposure'), exSum = ex ? ex.allocations.reduce((s, a) => s + _dAbs(a.qty), 0) : 0;
      if (ex && exSum > 0) ex.allocations.forEach(a => { w[a.employeeId || a.employeeName] = round2(_dAbs(a.qty) / exSum * 1000) / 1000; });
      if (usageTotal > 0) bias = { variance: vTrue, usage: usageTotal, weights: w };
    }
    return { result, usageTotal, usageEvents: usage.length, usageRefs: usage.slice(0, 40).map(e => e.refId), clean: dutyIsClean(rows, fromMs, toMs), rows, bias, baseline: base };
  }
  const _dutyCaseId = (prepId, ms) => P.key('prep', prepId, ms);
  async function dutyAlert(c, kind, title, severity) {
    await C.fstore.collection('alerts_gieogieo').doc(P.key('duty', c.id, kind)).set(_st({
      type: 'duty_case', severity: severity || 'warning', status: 'new', businessDate: c.businessDate, createdAt: new Date(C.now()).toISOString(),
      title, caseId: c.id, prepId: c.prepId, itemName: c.prepName, unit: c.unit, variance: c.variance, value: c.value,
      allocations: (c.allocations || []).map(a => ({ employeeId: a.employeeId, employeeName: a.employeeName, qty: a.qty, share: a.share })),
      confidence: c.confidence, caseStatus: c.status, kindOfAlert: kind }));
  }
  // Ghi hồ sơ vụ lệch sau một lần ĐẾM CUỐI CA. o: {prep, prev:{at,qty,byId,by}|null, now (ISO), by:{id,name}, count, book, variance, businessDate, suspect}
  async function dutyOnCount(o) {
    const v = round2(o.variance), toMs = _dMs(o.now);
    if (_dAbs(v) < DUTY.RESOLUTION) return null;
    const fromMs = o.prev && _dMs(o.prev.at);
    const id = _dutyCaseId(o.prep.id, toMs);
    const doc = { id, type: 'prep', prepId: o.prep.id, prepName: o.prep.name || '', unit: o.prep.unit || '', costPerUnit: Number(o.prep.costPerUnit) || 0,
      businessDate: o.businessDate, createdAt: o.now, interval: { from: o.prev ? o.prev.at : null, to: o.now }, countedBy: { id: o.by.id || '', name: o.by.name || '' },
      count: round2(o.count), book: round2(o.book), variance: v, recount: o.attempt1 != null ? { first: round2(o.attempt1) } : null, value: round2(_dAbs(v) * (Number(o.prep.costPerUnit) || 0)), verified: false, history: [] };
    let status = 'auto';
    if (fromMs == null || fromMs >= toMs) {
      Object.assign(doc, { status: 'no_checkpoint', allocations: [], parts: [], pool: [{ kind: 'unknown', qty: v, value: doc.value, reason: 'khong_co_moc_dem_truoc' }], confidence: 'weak', notes: ['khong_co_moc_dem_truoc'], usageTotal: 0, usageEvents: 0, bias: null });
    } else {
      const c = await dutyCompute({ prep: o.prep, fromMs, toMs, variance: v, book: o.book, verified: false });
      status = o.suspect ? 'pending_verify' : 'auto';
      Object.assign(doc, { status, allocations: c.result.allocations, parts: c.result.parts, pool: c.result.pool, confidence: c.result.confidence, notes: c.result.notes, kind: c.result.kind,
        usageTotal: c.usageTotal, usageEvents: c.usageEvents, usageRefs: c.usageRefs, bias: c.bias });
    }
    doc.needsNotify = dutyNeedsNotify({ variance: v, usage: doc.usageTotal, book: o.book });
    await C.fstore.collection(DUTY_CASES).doc(id).set(_st(doc));
    if (o.suspect) {
      const old = await C.fstore.collection(DUTY_TASKS).doc('verify_' + o.prep.id).get();
      if (old.exists && old.data().status === 'open') {
        await C.fstore.collection(DUTY_TASKS).doc('verify_' + o.prep.id).update({ status: 'superseded', supersededAt: o.now });
        if (old.data().caseId) await C.fstore.collection(DUTY_CASES).doc(old.data().caseId).update({ status: 'closed_pool', closedReason: 'bi_dem_lai_truoc_khi_xac_minh', closedAt: o.now }).catch(() => {});
      }
      await C.fstore.collection(DUTY_TASKS).doc('verify_' + o.prep.id).set(_st({ id: 'verify_' + o.prep.id, type: 'verify_count', status: 'open', prepId: o.prep.id, prepName: o.prep.name || '', unit: o.prep.unit || '',
        caseId: id, firstById: o.by.id || '', firstBy: o.by.name || '', firstAt: o.now, countedQty: round2(o.count), bookBeforeCount: round2(o.book), usageBase: doc.usageTotal,
        createdAt: o.now, expireAt: new Date(toMs + DUTY.VERIFY_TTL_MS).toISOString(), businessDate: o.businessDate }));
    }
    if (doc.needsNotify)
      await dutyAlert(doc, 'big', 'Lệch lớn — ' + (o.prep.name || '') + (o.suspect ? ' (chờ người khác cân lại)' : ''), o.suspect ? 'warning' : 'danger').catch(() => {});
    return doc;
  }
  // Sổ của lô TẠI thời điểm atMs (lúc đọc số cân). [v9] Dựng từ nhật ký thay đổi CÓ DẤU ngay trong node RT của lô (`chg`: bán trừ, hoàn cộng, ghi cùng transaction
  // với unitBase) — MỘT lần đọc nên số dư và nhật ký cùng một thời điểm: book(atMs) = unitBase − Σ d(t > atMs). Không có nhật ký / đã bị cắt quá mốc (node cũ,
  // máy chạy bản engine cũ) thì rơi về cách cũ: sổ hiện tại + lượt bán trong usageEvents sau mốc (best-effort, không có lượt hoàn).
  async function dutyLotBookAt(prepId, batchId, atMs) {
    try {
      const v = (await _ueActiveUnitsRef(prepId).child(batchId).once('value')).val();
      if (v && Number.isFinite(Number(v.unitBase)) && Array.isArray(v.chg) && !(Number(v.chgTrim) > atMs))
        return round2(Number(v.unitBase) - v.chg.reduce((sum, e) => sum + ((Number(e && e.t) || 0) > atMs ? Number(e.d) || 0 : 0), 0));
    } catch (e) { /* rơi về cách cũ */ }
    const nowBook = await dutyLotBookNow(prepId, batchId);
    let add = 0;
    try {
      const d = await C.fstore.collection(P.batches()).doc(batchId).get();
      if (d.exists) (d.data().usageEvents || []).forEach(e => { if (e && e.type === 'consumed' && (_dMs(e.at) || 0) > atMs) add += Number(e.qty) || 0; });
    } catch (err) { console.warn('[duty] không đọc được lượt bán của lô — dùng sổ hiện tại', batchId, err); }
    return round2(nowBook + add);
  }
  // Việc duty chạy NỀN (không chặn bán, không chặn luồng kết ca); flush() chờ xong khi cần (VD trước khi lập tóm tắt ngày).
  const _dutyPending = new Set();
  function dutyBg(promise, label) {
    const p = Promise.resolve(promise).catch(err => console.warn('[duty] việc nền lỗi', label || '', err));
    _dutyPending.add(p); p.then(() => _dutyPending.delete(p), () => _dutyPending.delete(p));
    return p;
  }
  async function dutyFlush() { while (_dutyPending.size) await Promise.allSettled(Array.from(_dutyPending)); }
  // NL: sau một lượt cân cuối ca của một nguyên liệu. m: {itemId, itemName, unit, opId, day, staffName, staffId, largeDevIds}, sum: {book, counted, lossQty}.
  // Cùng khung với dutyOnCount: khoảng đo = từ mốc cân trước (inventory_items.lastCount) đến lần cân này; bán theo giờ bill; chia theo người pha chế có mặt.
  async function dutyOnNlWeigh(m, sum) {
    const id = P.key('nl', m.itemId, m.opId);
    const caseRef = C.fstore.collection(DUTY_CASES).doc(id);
    if ((await caseRef.get()).exists) return null;                    // chạy lại (tự bù lượt dở dang) — đã có hồ sơ, không đổi mốc lần nữa
    const itemRef = C.fstore.collection('inventory_items_gieogieo').doc(m.itemId);
    const it = await itemRef.get(); if (!it.exists) return null;
    const d = it.data(), prev = d.lastCount || null, now = new Date(C.now()).toISOString(), toMs = _dMs(now);
    await itemRef.update({ lastCount: { at: now, qty: round2(sum.counted), byId: m.staffId || '', by: m.staffName || '', businessDate: m.day, kind: 'shift_weigh', op: m.opId } });
    const v = round2((Number(sum.counted) || 0) - (Number(sum.book) || 0));       // âm = thiếu (cân ít hơn sổ)
    if (_dAbs(v) < DUTY.RESOLUTION) return null;
    const prep = { id: m.itemId, name: m.itemName || d.name || '', unit: m.unit || d.unit || '', costPerUnit: Number(d.costPerUnit) || 0 };
    const fromMs = prev && _dMs(prev.at);
    const doc = { id, type: 'nl', prepId: m.itemId, prepName: prep.name, unit: prep.unit, costPerUnit: prep.costPerUnit, shiftWeighOp: m.opId, businessDate: m.day, createdAt: now,
      interval: { from: prev ? prev.at : null, to: now }, countedBy: { id: m.staffId || '', name: m.staffName || '' }, count: round2(sum.counted), book: round2(sum.book), variance: v,
      value: round2(_dAbs(v) * prep.costPerUnit), verified: false, history: [], largeDeviation: (m.largeDevIds || []).length > 0 };
    if (fromMs == null || fromMs >= toMs) {
      Object.assign(doc, { status: 'no_checkpoint', allocations: [], parts: [], pool: [{ kind: 'unknown', qty: v, value: doc.value, reason: 'khong_co_moc_dem_truoc' }], confidence: 'weak', notes: ['khong_co_moc_dem_truoc'], usageTotal: 0, usageEvents: 0, bias: null });
    } else {
      const c = await dutyCompute({ prep, fromMs, toMs, variance: v, book: sum.book, verified: false, nl: true });
      Object.assign(doc, { status: 'auto', allocations: c.result.allocations, parts: c.result.parts, pool: c.result.pool, confidence: c.result.confidence, notes: c.result.notes, kind: c.result.kind,
        usageTotal: c.usageTotal, usageEvents: c.usageEvents, usageRefs: c.usageRefs, bias: c.bias });
    }
    doc.needsNotify = dutyNeedsNotify({ variance: v, usage: doc.usageTotal, book: sum.book });
    await caseRef.set(_st(doc));
    if (doc.needsNotify) await dutyAlert(doc, 'big', 'Lệch lớn khi cân cuối ca — ' + prep.name, 'danger').catch(() => {});
    return doc;
  }
  // Cân lúc đang bán: sổ hiện tại của MỘT lô (RT là nguồn thật phần đang mở, thiếu thì Firestore).
  async function dutyLotBookNow(prepId, batchId) {
    try { const v = (await _ueActiveUnitsRef(prepId).child(batchId).once('value')).val(); if (v && Number.isFinite(Number(v.unitBase))) return round2(Number(v.unitBase)); } catch (e) { /* rơi về Firestore */ }
    const d = await C.fstore.collection(P.batches()).doc(batchId).get();
    return d.exists ? round2(Number(d.data().qtyRemaining) || 0) : 0;
  }
  // Cổng "cân lại một lần": trả {needs, variance, usage, book}. KHÔNG đưa số này ra màn hình (cân mù).
  async function dutyGateCheck(l) {
    const now = C.now(), batches = l.activeBatches || [];
    const expired = b => b.shelfLifeType === 'endOfDay' || (b.expiresAt && new Date(b.expiresAt) <= new Date(now));
    const declared = batches.reduce((s, b) => s + ((l.discardAll || expired(b)) ? Math.max(0, Number(b.qtyRemaining) || 0) : 0), 0);
    const book = round2((Number(l.sysQty) || 0) - declared);
    const variance = round2((Number(l.counted) || 0) - book);
    let usage = 0;
    try {
      const pd = await C.fstore.collection('prep_items_gieogieo').doc(l.prepId).get();
      const last = pd.exists ? pd.data().lastCount : null, fromMs = last && _dMs(last.at);
      if (fromMs != null) usage = dutyUsageFromTx(await dutyLoadPrepTx(l.prepId, fromMs, now), fromMs, now).reduce((s, e) => s + e.qty, 0);
    } catch (e) { console.warn('[duty] gateCheck không đọc được lượng dùng — so với số sổ', e); }
    return { needs: !l.discardAll && dutyNeedsRecount({ variance, usage, book }), variance, usage: round2(usage), book };
  }
  // Việc xác minh đang mở; hết hạn thì đóng (chuyển "chưa quy").
  async function dutyExpireTasks() {
    const now = new Date(C.now()).toISOString(); let n = 0;
    const snaps = await Promise.all([C.fstore.collection(DUTY_TASKS).where('status', '==', 'open').get(), C.fstore.collection(DUTY_TASKS).where('status', '==', 'processing').get()]);
    for (const d of [].concat(...snaps.map(sn => sn.docs))) {
      const t = d.data(); if (!(_dMs(t.expireAt) <= C.now())) continue;
      await d.ref.update({ status: 'expired', expiredAt: now });
      if (t.caseId) await C.fstore.collection(DUTY_CASES).doc(t.caseId).update({ status: 'closed_pool', closedReason: 'khong_xac_minh_duoc_48h', closedAt: now }).catch(() => {});
      await C.fstore.collection('prep_items_gieogieo').doc(t.prepId).update({ 'lastCount.suspect': false }).catch(() => {});
      n++;
    }
    return n;
  }
  async function dutyListOpenTasks() {
    // 'processing' = lượt xác minh đang làm hoặc bị đứt giữa chừng — vẫn hiện để làm lại (engine tự chặn nếu người khác đang xử lý).
    const snaps = await Promise.all([C.fstore.collection(DUTY_TASKS).where('status', '==', 'open').get(), C.fstore.collection(DUTY_TASKS).where('status', '==', 'processing').get()]);
    return [].concat(...snaps.map(sn => sn.docs)).map(d => Object.assign({ id: d.id }, d.data())).filter(t => !(_dMs(t.expireAt) <= C.now()))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  // Người KHÁC cân lại lúc đang bán (không khoá): mỗi lô chốt theo mốc sổ chụp lúc cân — số còn lại = số cân − phần đã bán
  // từ lúc cân. Sau đó giải vụ: lệch thật / A nhập sai (tự quy A) / tranh chấp (chủ quyết).
  // l: {prepId, prepName, unit, activeBatches, batchQty, batchWeighings, snaps:{batchId:{book,at}}}; task: dòng duty_tasks;
  // ctx: {now (ISO), staff:{id, fullName}, businessDate}.
  async function dutyVerifyCommit(l, task, ctx) {
    const now = ctx.now, st = ctx.staff, nowMs = _dMs(now);
    if (!st || !st.id) throw new Error('Thiếu người cân lại');
    if (st.id === task.firstById) throw new Error('Người cân lại phải khác người cân lần trước');
    if (l.prepId !== task.prepId) throw new Error('Bán thành phẩm đang cân không khớp với việc xác minh');
    const tRef = C.fstore.collection(DUTY_TASKS).doc(task.id);
    // GIÀNH việc bằng transaction, kèm TOKEN của lượt này:
    //  · việc trên server phải đúng THẾ HỆ với màn đang cầm (firstAt + caseId) — màn cũ không xử lý được việc mới;
    //  · người cân đầu kiểm tra trên dữ liệu VỪA ĐỌC (không tin task từ màn hình);
    //  · việc đang 'processing' còn mới (≤60 giây) thì KỂ CẢ cùng một nhân viên trên máy khác cũng bị từ chối;
    //  · lượt lỗi tự nhả việc về 'open' (xem release) nên làm lại ngay được; lượt chết hẳn thì sau 60 giây giành lại được.
    const token = P.key('tok', st.id, C.now(), Math.floor(C.random() * 1e9));
    let retry = false, rtStarted = false;
    // Dữ liệu lượt này (số cân, sổ lúc cân, bảng cân của từng lô) chốt TRƯỚC khi giành việc và LƯU BỀN trên việc: lượt lỗi giữa chừng được làm
    // tiếp bằng đúng dữ liệu này (không lấy số cân/sổ mới của màn mở lại), kể cả khi người khác giành lại sau 60 giây.
    const fromScreen = { at: now, lots: [] };
    for (const b of (l.activeBatches || [])) {
      const counted = Number((l.batchQty || {})[b.id]);
      if (!Number.isFinite(counted)) throw new Error('Chưa cân lô ' + (b.batchCode || ''));
      const sn = l.snaps && l.snaps[b.id];
      const snapBook = sn && Number.isFinite(Number(sn.book)) ? Number(sn.book) : await dutyLotBookNow(l.prepId, b.id);
      fromScreen.lots.push({ id: b.id, batchCode: b.batchCode || '', qtyInitial: Number(b.qtyInitial) || 0, counted, snapBook, weighings: (l.batchWeighings || {})[b.id] || [] });
    }
    let attempt = fromScreen;
    const x = await C.fstore.runTransaction(async t => {
      const d = await t.get(tRef);
      if (!d.exists) throw new Error('Việc xác minh này đã được xử lý');
      const v = d.data();
      if ((v.firstAt || '') !== (task.firstAt || '') || (v.caseId || '') !== (task.caseId || '')) throw new Error('Việc xác minh đã thay đổi — tải lại màn cân lại');
      if (v.firstById === st.id) throw new Error('Người cân lại phải khác người cân lần trước');
      const age = v.processingAt ? C.now() - (_dMs(v.processingAt) || 0) : Infinity;
      if (v.status === 'open' || (v.status === 'processing' && age > DUTY.PROCESSING_STALE_MS)) {
        const reuse = !!(v.attempt && Array.isArray(v.attempt.lots) && (v.partialRt === true || v.status === 'processing'));
        retry = v.status === 'processing' || v.partialRt === true;
        attempt = reuse ? v.attempt : fromScreen;
        t.update(tRef, { status: 'processing', processingById: st.id, processingToken: token, processingAt: new Date(C.now()).toISOString(), attempt });
        return v;
      }
      if (v.status === 'processing') throw new Error('Việc xác minh đang xử lý ở máy khác — thử lại sau ít phút');
      throw new Error('Việc xác minh này đã được xử lý');
    });
    task = Object.assign({}, task, x, { id: task.id });
    const opId = 'verify_' + task.id + '_' + (_dMs(task.firstAt) || 0);
    const assertToken = async () => {
      const d = await tRef.get();
      if (!d.exists || d.data().processingToken !== token) throw new Error('Việc xác minh đã bị lượt khác giành — không ghi tiếp');
    };
    const release = async () => {
      try {
        await C.fstore.runTransaction(async t => {
          const d = await t.get(tRef); if (!d.exists) return;
          const v = d.data();
          if (v.status === 'processing' && v.processingToken === token) t.update(tRef, { status: 'open', processingToken: C.FieldValue.delete(), partialRt: rtStarted || v.partialRt === true });
        });
      } catch (e2) { console.warn('[duty] không nhả được việc xác minh (tự giành lại được sau 60 giây)', e2); }
    };
    try {
    const lots = []; let Bcount = 0, Bbook = 0;
    const gen = _dMs(task.firstAt) || 0;
    // Tiến độ TỪNG LÔ lưu bền trong attempt (rtDone) — thử lại không phải đoán "node không còn = đã xử lý" (lô chưa từng có node RT vẫn được dựng từ số Firestore).
    const markRtDone = async id => {
      await C.fstore.runTransaction(async t => {
        const d = await t.get(tRef);
        if (!d.exists || d.data().processingToken !== token) throw new Error('Việc xác minh đã bị lượt khác giành — không ghi tiếp');
        const at = d.data().attempt || attempt;
        t.update(tRef, { attempt: Object.assign({}, at, { lots: (at.lots || []).map(x => x.id === id ? Object.assign({}, x, { rtDone: true }) : x) }) });
      });
      attempt.lots.forEach(x => { if (x.id === id) x.rtDone = true; });
    };
    for (const a of attempt.lots) {
      const b = { id: a.id, batchCode: a.batchCode, qtyInitial: a.qtyInitial };
      const counted = Number(a.counted), snapBook = Number(a.snapBook);
      const curNow = await dutyLotBookNow(l.prepId, b.id);
      // Ghi RT bằng transaction: remain = số cân + (sổ hiện tại − sổ lúc cân) = số cân − bán + HOÀN sau mốc cân (có dấu, không kẹp). Nợ lô âm được giữ.
      // Dấu thao tác (dutyVerifyOp) trên chính node: lượt trước đã ghi thì lượt làm lại GIỮ NGUYÊN. Thế hệ (dutyVerifyGen = firstAt của việc) kiểm NGAY TRONG transaction RT:
      // lượt cũ chậm không ghi đè kết quả của việc mới hơn đã xác minh. Lô đã ghi (rtDone) mà node không còn thì không dựng lại.
      await assertToken();
      rtStarted = true;
      const res = await _ueRetryAsync(() => _ueActiveUnitsRef(l.prepId).child(b.id).transaction(cur => {
        if (cur && cur.dutyVerifyOp === opId) return cur;
        if (cur && Number(cur.dutyVerifyGen) > gen) return cur;
        if (!cur && a.rtDone) return;
        const base = cur && Number.isFinite(Number(cur.unitBase)) ? Number(cur.unitBase) : curNow;
        const next = round2(counted + (base - snapBook));
        const node = { code: (cur && cur.code) || b.batchCode || '', itemName: (cur && cur.itemName) || l.prepName || '', unit: (cur && cur.unit) || l.unit || '',
          capacity: (cur && cur.capacity) || Number(b.qtyInitial) || counted, openedAt: (cur && cur.openedAt) || C.now(), unitBase: next, dutyVerifyOp: opId, dutyVerifyGen: gen };
        if (cur && Array.isArray(cur.chg)) { node.chg = cur.chg; if (cur.chgTrim) node.chgTrim = cur.chgTrim; }
        _ueChgPush(node, C.now(), next - base);
        return node;
      }));
      const node = (res && res.snapshot && res.snapshot.val()) || (a.rtDone ? { unitBase: 0 } : { unitBase: round2(counted + (curNow - snapBook)) });
      await markRtDone(b.id);
      lots.push({ b, counted, snapBook, weighings: a.weighings || [], remain: round2(Number(node.unitBase) || 0) });
      Bcount += counted; Bbook += snapBook;
    }
    Bcount = round2(Bcount); Bbook = round2(Bbook);
    // Giải vụ
    const cRef = C.fstore.collection(DUTY_CASES).doc(task.caseId);
    const cs = (await cRef.get()).data() || {};
    const fromMs = _dMs(task.firstAt);
    const rows = await dutyLoadPrepTx(l.prepId, fromMs, nowMs);
    const clean = dutyIsClean(rows, fromMs, nowMs);
    const res2 = dutyResolveVerification({ a: { count: task.countedQty, book: task.bookBeforeCount }, b: { count: Bcount, book: Bbook }, base: task.usageBase, clean });
    const prep = { id: l.prepId, name: l.prepName, unit: l.unit, costPerUnit: Number(cs.costPerUnit) || 0, batchYield: 0 };
    try { const pd = await C.fstore.collection('prep_items_gieogieo').doc(l.prepId).get(); if (pd.exists) { prep.costPerUnit = Number(pd.data().costPerUnit) || prep.costPerUnit; prep.batchYield = Number(pd.data().batchYield) || 0; } } catch (e) { /* giữ số cũ */ }
    const cFrom = cs.interval && _dMs(cs.interval.from), cTo = cs.interval && _dMs(cs.interval.to);
    const patch = { verification: { outcome: res2.outcome, byId: st.id, by: st.fullName || '', at: now, bCount: Bcount, bBook: Bbook, dB: res2.dB, clean }, history: C.FieldValue.arrayUnion({ at: now, type: 'verify', outcome: res2.outcome, by: st.fullName || '', dB: res2.dB }) };
    const responsibility = res2.outcome === 'entry_error'
      ? { employeeId: task.firstById, employeeName: task.firstBy, role: 'người cân sai (đã xác minh)', status: 'assigned', reason: 'Cân lại lệch so với số đã ghi' }
      : res2.outcome === 'dispute' ? { employeeId: '', employeeName: '', role: 'tranh chấp — chờ quản lý quyết', status: 'pending' } : null;
    if (res2.outcome === 'dispute') {
      Object.assign(patch, { status: 'dispute', allocations: [], parts: [], pool: [{ kind: 'dispute', qty: cs.variance, value: cs.value, reason: 'hai_lan_can_lech_nhau_nhieu' }], confidence: 'weak', verified: false, needsNotify: true });
    } else if (cFrom != null && cTo != null) {
      const ee = res2.outcome === 'entry_error' ? { qty: res2.entryErrorQty, byId: task.firstById, byName: task.firstBy, clean: res2.clean !== false } : null;
      const c = await dutyCompute({ prep, fromMs: cFrom, toMs: cTo, variance: cs.variance, book: cs.book, entryError: ee, verified: true });
      Object.assign(patch, { status: 'auto', verified: true, allocations: c.result.allocations, parts: c.result.parts, pool: c.result.pool, confidence: c.result.confidence, notes: c.result.notes, kind: c.result.kind,
        usageTotal: c.usageTotal, usageEvents: c.usageEvents, usageRefs: c.usageRefs, bias: c.bias, entryErrorConfirmed: !!ee, entryErrorQty: ee ? ee.qty : 0 });
    } else {
      Object.assign(patch, { status: 'closed_pool', verified: true });
    }
    await assertToken();
    // Lô: chốt trạng thái RT trong CÙNG một transaction quyết định có gỡ node hay không (về 0 mới gỡ; vừa có bán xen làm âm thì giữ nợ),
    // rồi đồng bộ bản Firestore theo RT hiện hành, đọc lại tối đa 3 vòng. Ghi lô lỗi (sau thử lại) thì BÁO LỖI — không đóng việc.
    for (const x of lots) {
      await assertToken();
      const ref = _ueActiveUnitsRef(l.prepId).child(x.b.id);
      const wLo = x.weighings || [];
      const v0 = (await ref.once('value')).val();
      const rr = await _ueRetryAsync(() => ref.transaction(cur => {
        const src = cur == null ? v0 : cur;
        if (!src) return;
        return Math.abs(Number(src.unitBase) || 0) <= 0.005 ? null : src;
      }));
      const after = rr && rr.snapshot ? rr.snapshot.val() : null;
      const closed = !after;
      let live = after && Number.isFinite(Number(after.unitBase)) ? round2(Number(after.unitBase)) : 0;
      const lotRef = C.fstore.collection(P.batches()).doc(x.b.id);
      await _ueRetryAsync(() => lotRef.update({ qtyRemaining: Math.max(0, live), unitBase: closed ? 0 : live,
        ...(wLo.length ? { countWeighMethod: 'vessel', countWeighings: wLo, countWeighedAt: now } : {}), ...(closed ? { status: 'used_up', usedUpAt: now } : {}) }));
      if (!closed) for (let pass = 0; pass < 3; pass++) {
        const v = (await ref.once('value')).val();
        const again = v && Number.isFinite(Number(v.unitBase)) ? round2(Number(v.unitBase)) : null;
        if (again == null || Math.abs(again - live) <= 0.005) break;
        live = again;
        await _ueRetryAsync(() => lotRef.update({ qtyRemaining: Math.max(0, live), unitBase: live }));
      }
      x.remain = live;
    }
    // Tồn tổng: bước RIÊNG, suy từ các lô (không gán số riêng của lần cân này).
    await _ueRecomputeCurrentStock(l.prepId, 'prep_batches_gieogieo').catch(() => {});
    // Sổ: điều chỉnh = ĐÚNG phần B cân khác sổ lúc cân (Σ số cân − Σ sổ lúc cân của các lô đã cân) — không lẫn với bán xen hay lô mới.
    const adjust = round2(Bcount - Bbook);
    const prepRef = C.fstore.collection('prep_items_gieogieo').doc(l.prepId);
    await C.fstore.runTransaction(async t => {
      const td = await t.get(tRef);                                  // quyền ghi kiểm NGAY trong giao dịch: lượt đã hết quyền không ghi đè sổ/mốc đếm
      if (!td.exists || td.data().processingToken !== token) throw new Error('Việc xác minh đã bị lượt khác giành — không ghi sổ');
      const doc = await t.get(prepRef); if (!doc.exists) return;
      const d = doc.data(), cur = Number(d.currentStock) || 0, gia = Number(d.costPerUnit) || 0;
      t.update(prepRef, { updatedAt: now, lastCount: { at: now, qty: round2(cur), byId: st.id, by: st.fullName || '', businessDate: ctx.businessDate, suspect: false, kind: 'verify', taskId: task.id } });
      if (adjust !== 0) t.set(C.fstore.collection(P.prepTx()).doc('prep_' + opId), _st({
        prepId: l.prepId, prepCode: d.code || '', prepName: l.prepName || '', unit: l.unit || '', type: 'ADJUSTMENT', qty: adjust, resultingStock: round2(cur),
        totalCost: round2(Math.abs(adjust) * gia), costPerUnit: gia, note: 'Cân lại xác minh số đếm của ' + (task.firstBy || '') + ' (' + res2.outcome + ')',
        staff: st.fullName || '', staffEmployeeId: st.id, referenceId: task.caseId, createdAt: now, businessDate: ctx.businessDate, source: _src(), fromPrepVerify: true, dutyCaseId: task.caseId,
        ...(responsibility ? { responsibility } : {}) }));
    });
    await C.fstore.runTransaction(async t => {
      const d = await t.get(tRef);
      if (!d.exists || d.data().processingToken !== token) throw new Error('Việc xác minh đã bị lượt khác giành — không ghi hồ sơ / đóng việc');
      t.update(cRef, patch);                                         // hồ sơ vụ lệch + đóng việc cùng một giao dịch, cùng kiểm quyền
      t.update(tRef, { status: 'done', outcome: res2.outcome, verifiedById: st.id, verifiedBy: st.fullName || '', verifiedAt: now, dB: res2.dB, bCount: Bcount, bBook: Bbook });
    });
    const merged = Object.assign({}, cs, patch, { id: task.caseId });
    if (res2.outcome === 'entry_error')
      await dutyAlert(merged, 'entry_error', task.firstBy + ' nhập sai số ' + (l.prepName || '') + ' (' + fmtPrepQty(res2.entryErrorQty) + ' ' + (l.unit || '') + ') — ' + (st.fullName || '') + ' cân lại', 'warning').catch(() => {});
    if (res2.outcome === 'dispute')
      await dutyAlert(merged, 'dispute', 'Hai lần cân lệch nhau nhiều — cần quy trách nhiệm: ' + (l.prepName || ''), 'danger').catch(() => {});
    return { outcome: res2.outcome, dB: res2.dB, caseId: task.caseId, adjust };
    } catch (err) {
      await release();
      throw err;
    }
  }

  // ── Quản lý / nhân viên tác động lên vụ lệch ──
  async function _dutyCase(caseId) {
    const ref = C.fstore.collection(DUTY_CASES).doc(caseId), s = await ref.get();
    if (!s.exists) throw new Error('Không thấy vụ lệch ' + caseId);
    return { ref, c: s.data() };
  }
  async function _dutyAlertDone(caseId, by) {
    const snap = await C.fstore.collection('alerts_gieogieo').where('caseId', '==', caseId).get().catch(() => null);
    if (snap) await Promise.all(snap.docs.map(d => d.ref.update({ status: 'resolved', resolvedAt: new Date(C.now()).toISOString(), resolvedBy: by || '' }).catch(() => {})));
  }
  // Chủ chia lại: o = {kind:'manual'|'entry_error'|'recipe'|'waived', shares:[{employeeId, employeeName, share 0..1}], reason, by:{id,name}}
  async function dutyReassign(caseId, o) {
    const { ref, c } = await _dutyCase(caseId);
    if (!o || !String(o.reason || '').trim()) throw new Error('Cần nhập lý do');
    const v = Number(c.variance) || 0, cost = Number(c.costPerUnit) || 0, kind = o.kind || 'manual';
    let allocations = [], pool = [];
    if (kind === 'recipe') pool = [{ kind: 'recipe', qty: v, value: round2(_dAbs(v) * cost), reason: 'chu_xac_nhan_dinh_muc' }];
    else if (kind === 'waived') pool = [{ kind: 'waived', qty: v, value: round2(_dAbs(v) * cost), reason: 'chu_mien' }];
    else {
      const sh = (o.shares || []).filter(x => Number(x.share) > 0); const sum = sh.reduce((s, x) => s + Number(x.share), 0);
      if (!sh.length || sum > 1.0001) throw new Error('Tỉ lệ chia không hợp lệ');
      allocations = sh.map(x => { const q = round2(v * Number(x.share)); return { employeeId: x.employeeId || '', employeeName: x.employeeName || '', qty: q, value: round2(_dAbs(q) * cost), share: round2(Number(x.share) * 1000) / 1000, basis: ['chu_quyet_dinh'], confidence: 'strong' }; });
      const left = round2(v - allocations.reduce((s, a) => s + a.qty, 0));
      if (_dAbs(left) >= DUTY.RESOLUTION) pool = [{ kind: 'unknown', qty: left, value: round2(_dAbs(left) * cost), reason: 'chu_chua_quy_het' }];
    }
    const now = new Date(C.now()).toISOString();
    await ref.update(_st({ status: 'manual', manualKind: kind, allocations, pool, parts: [{ kind: 'manual', qty: v, allocations }], confidence: 'strong', verified: true, needsNotify: false,
      manual: { by: (o.by && o.by.name) || '', byId: (o.by && o.by.id) || '', at: now, reason: o.reason },
      history: C.FieldValue.arrayUnion({ at: now, type: 'reassign', kind, by: (o.by && o.by.name) || '', reason: o.reason, before: { allocations: c.allocations || [], pool: c.pool || [], status: c.status } }) }));
    await _dutyAlertDone(caseId, o.by && o.by.name);
    return { allocations, pool };
  }
  // Nhân viên phản đối phần của mình.
  async function dutyContest(caseId, o) {
    const { ref, c } = await _dutyCase(caseId);
    if (!o || !o.byId || !String(o.reason || '').trim()) throw new Error('Cần PIN và lý do');
    const mine = (c.allocations || []).some(a => a.employeeId === o.byId) || (c.countedBy && c.countedBy.id === o.byId);
    if (!mine) throw new Error('Vụ này không có phần của bạn');
    const now = new Date(C.now()).toISOString();
    await ref.update({ status: 'contested', contest: { byId: o.byId, by: o.byName || '', reason: o.reason, at: now, previousStatus: c.status },
      history: C.FieldValue.arrayUnion({ at: now, type: 'contest', by: o.byName || '', reason: o.reason }) });
    await dutyAlert(Object.assign({}, c, { status: 'contested', id: caseId }), 'contest', (o.byName || '') + ' phản đối phần trách nhiệm — ' + (c.prepName || ''), 'warning').catch(() => {});
  }
  // Chủ giữ nguyên phân bổ sau khi xem phản đối.
  async function dutyKeep(caseId, o) {
    const { ref, c } = await _dutyCase(caseId);
    if (c.status !== 'contested') throw new Error('Vụ này không có phản đối');
    const now = new Date(C.now()).toISOString();
    await ref.update({ status: (c.contest && c.contest.previousStatus) || 'auto', history: C.FieldValue.arrayUnion({ at: now, type: 'keep', by: (o.by && o.by.name) || '', reason: o.reason || '' }) });
    await _dutyAlertDone(caseId, o.by && o.by.name);
  }
  async function dutyResetBaseline(prepId, by) {
    const now = new Date(C.now()).toISOString();
    await C.fstore.collection(DUTY_CFG).doc('current').set(_st({ baselineResetAt: { [prepId]: now }, updatedAt: now, updatedBy: by || '' }), { merge: true });
    return now;
  }
  async function dutyListCases(fromDate, toDate) {
    const snap = await C.fstore.collection(DUTY_CASES).where('businessDate', '>=', fromDate).where('businessDate', '<=', toDate).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }


  // ════════════════════════ [v5] TÓM TẮT NGÀY — NL/BTP đi đâu, lệch ở đâu, ai chịu ════════════════════════
  // Hàm THUẦN dựng bảng từ dữ liệu của MỘT ngày kinh doanh. inp: {day, stockTx[], prepTx[], cases[], anomalies[], items:{id:{name,unit,costPerUnit}}, preps:{id:{...}}}
  function dutyBuildDigest(inp) {
    const rowsOf = {};
    const get = (kind, id) => { const k = kind + ':' + id; return rowsOf[k] || (rowsOf[k] = { kind, id, name: '', unit: '', costPerUnit: 0, flows: { sales: 0, cooking: 0, produced: 0, wasteDeclared: 0, received: 0, countVariance: 0, otherAdjust: 0 }, anomalies: 0, anomalyQty: 0, cases: [] }); };
    const meta = (r, src) => { const m = (src && src[r.id]) || {}; r.name = m.name || r.name || r.id; r.unit = m.unit || r.unit || ''; r.costPerUnit = Number(m.costPerUnit) || r.costPerUnit || 0; };
    const isBill = t => /^bill_/.test(String(t.referenceId || t.id || ''));
    (inp.stockTx || []).forEach(t => {
      if (!t.itemId) return;
      const r = get('nl', t.itemId), q = Number(t.qty) || 0, ty = String(t.type || '').toUpperCase();
      if (ty === 'CONSUMPTION') { if (isBill(t)) r.flows.sales += -q; else r.flows.cooking += -q; }
      else if (ty === 'WASTE' && t.wasteKind !== 'shift_weigh') r.flows.wasteDeclared += _dAbs(q);
      else if (ty === 'RECEIVING') r.flows.received += q;
      else if (t.wasteKind === 'shift_weigh') r.flows.countVariance += q;
      else if (ty === 'ADJUSTMENT') { if (t.reversal === true) r.flows.sales += -q; else r.flows.otherAdjust += q; }
    });
    (inp.prepTx || []).forEach(t => {
      if (!t.prepId) return;
      const r = get('prep', t.prepId), q = Number(t.qty) || 0, ty = String(t.type || '').toUpperCase();
      if (ty === 'CONSUMPTION') r.flows.sales += -q;
      else if (ty === 'PRODUCTION') r.flows.produced += q;
      else if (ty === 'WASTE') r.flows.wasteDeclared += _dAbs(q);
      else if (ty === 'ADJUSTMENT') { if (t.reversal === true) r.flows.sales += -q; else if (t.fromPrepCount || t.fromPrepVerify) r.flows.countVariance += q; else r.flows.otherAdjust += q; }
    });
    (inp.anomalies || []).forEach(a => { if (!a.itemId) return; const r = get('nl', a.itemId); r.anomalies++; r.anomalyQty += Number(a.qty) || 0; });
    (inp.cases || []).forEach(c => { if (!c.prepId) return; get(c.type === 'nl' ? 'nl' : 'prep', c.prepId).cases.push(c); });
    const totals = { person: 0, recipe: 0, unknown: 0, dispute: 0, waived: 0, varianceValue: 0 };
    const items = Object.keys(rowsOf).map(k => rowsOf[k]).map(r => {
      meta(r, r.kind === 'nl' ? inp.items : inp.preps);
      const cs = r.cases;
      const variance = round2(cs.reduce((s, c) => s + (Number(c.variance) || 0), 0));
      const value = round2(cs.reduce((s, c) => s + (Number(c.value) || 0), 0));
      const byEmp = {};
      cs.forEach(c => (c.allocations || []).forEach(a => { const key = a.employeeId || a.employeeName; const o = byEmp[key] || (byEmp[key] = { employeeId: a.employeeId, employeeName: a.employeeName, qty: 0, value: 0, confidence: a.confidence }); o.qty = round2(o.qty + a.qty); o.value = round2(o.value + a.value); if (a.confidence === 'strong') o.confidence = 'strong'; }));
      const pool = { recipe: 0, unknown: 0, dispute: 0, waived: 0 };
      cs.forEach(c => (c.pool || []).forEach(p => { const v = _dAbs(Number(p.value) || 0); if (p.kind === 'recipe') pool.recipe += v; else if (p.kind === 'dispute') pool.dispute += v; else if (p.kind === 'waived') pool.waived += v; else pool.unknown += v; }));
      const person = Object.keys(byEmp).reduce((s, k) => s + _dAbs(byEmp[k].value), 0);
      totals.person += person; totals.recipe += pool.recipe; totals.unknown += pool.unknown; totals.dispute += pool.dispute; totals.waived += pool.waived; totals.varianceValue += value;
      const open = cs.filter(c => c.status === 'dispute' || c.status === 'contested' || c.status === 'pending_verify');
      const status = !cs.length ? 'ok' : (cs.some(c => c.status === 'dispute' || c.status === 'contested') ? 'cho_quyet' : (cs.some(c => c.status === 'pending_verify') ? 'cho_xac_minh' : (pool.unknown > 0 && person === 0 ? 'chua_quy' : 'da_quy')));
      Object.keys(r.flows).forEach(f => { r.flows[f] = round2(r.flows[f]); });
      return Object.assign(r, { variance, value, allocations: Object.keys(byEmp).map(k => byEmp[k]).sort((a, b) => _dAbs(b.value) - _dAbs(a.value)), pool, status, openCaseIds: open.map(c => c.id), caseIds: cs.map(c => c.id) });
    });
    Object.keys(totals).forEach(k => { totals[k] = round2(totals[k]); });
    items.sort((a, b) => (b.value - a.value) || (_dAbs(b.flows.sales + b.flows.cooking) - _dAbs(a.flows.sales + a.flows.cooking)));
    const lech = items.filter(i => i.cases.length);
    const needs = items.filter(i => i.status === 'cho_quyet' || i.status === 'cho_xac_minh');
    const fmtN = n => (Math.round(n * 10) / 10).toLocaleString('vi-VN');
    const money = n => Math.round(n).toLocaleString('vi-VN') + 'đ';
    const lines = [];
    lines.push(lech.length ? lech.length + ' NL/BTP có lệch, tổng ' + money(totals.varianceValue) + ': đã quy cho người ' + money(totals.person) + ', lỗi định mức ' + money(totals.recipe) + ', chưa quy ' + money(totals.unknown) + (totals.dispute ? ', chờ bạn quyết ' + money(totals.dispute) : '') + '.' : 'Không có NL/BTP nào lệch.');
    lech.slice(0, 5).forEach(i => lines.push((i.kind === 'nl' ? 'NL ' : 'BTP ') + i.name + ' lệch ' + (i.variance > 0 ? '+' : '−') + fmtN(_dAbs(i.variance)) + ' ' + i.unit + ' (' + money(i.value) + ')' +
      (i.allocations.length ? ': ' + i.allocations.slice(0, 3).map(a => (a.employeeName || '?') + ' ' + money(a.value)).join(', ') : ': chưa quy được') + (i.status === 'cho_quyet' ? ' — CHỜ BẠN QUYẾT' : i.status === 'cho_xac_minh' ? ' — chờ người khác cân lại' : '')));
    if (needs.length) lines.push(needs.length + ' vụ cần bạn hoặc người khác xử lý.');
    return { day: inp.day, items, totals, lines, needsAttention: needs.map(i => i.id), itemCount: items.length, lechCount: lech.length };
  }
  async function dutyDigest(day) {
    const q = (coll) => C.fstore.collection(coll).where('businessDate', '==', day).get().then(s => s.docs.map(d => Object.assign({ id: d.id }, d.data())));
    const [stockTx, prepTx, cases, anomalies, itemsSnap, prepsSnap] = await Promise.all([q(P.stockTx()), q(P.prepTx()), q(DUTY_CASES), q(STOCK_ANOMALY_COLL),
      C.fstore.collection('inventory_items_gieogieo').get(), C.fstore.collection('prep_items_gieogieo').get()]);
    const items = {}, preps = {};
    itemsSnap.docs.forEach(d => { const x = d.data(); items[d.id] = { name: x.name, unit: x.unit, costPerUnit: x.costPerUnit }; });
    prepsSnap.docs.forEach(d => { const x = d.data(); preps[d.id] = { name: x.name, unit: x.unit, costPerUnit: x.costPerUnit }; });
    return dutyBuildDigest({ day, stockTx, prepTx, cases, anomalies, items, preps });
  }
  // Lập và LƯU tóm tắt ngày + thông báo cho chủ (gọi khi đóng ngày). Chờ các việc duty chạy nền xong trước.
  async function dutyWriteDigest(day) {
    await dutyFlush();
    const dg = await dutyDigest(day), now = new Date(C.now()).toISOString();
    const top = dg.items.filter(i => i.cases.length).slice(0, 12).map(i => ({ kind: i.kind, id: i.id, name: i.name, unit: i.unit, variance: i.variance, value: i.value, status: i.status,
      allocations: i.allocations.slice(0, 4).map(a => ({ employeeId: a.employeeId, employeeName: a.employeeName, value: a.value })), pool: i.pool }));
    await C.fstore.collection('duty_digests_gieogieo').doc(day).set(_st({ day, generatedAt: now, totals: dg.totals, lines: dg.lines, top, itemCount: dg.itemCount, lechCount: dg.lechCount, needsAttention: dg.needsAttention }));
    await C.fstore.collection('alerts_gieogieo').doc('duty_digest_' + day).set(_st({ type: 'duty_digest', severity: dg.needsAttention.length ? 'warning' : 'info', status: 'new', businessDate: day, createdAt: now,
      title: 'Tóm tắt ngày ' + day + ' — ' + (dg.lechCount ? dg.lechCount + ' NL/BTP lệch' : 'không có lệch'), lines: dg.lines, totals: dg.totals, needsAttention: dg.needsAttention.length }), { merge: true });
    return dg;
  }

  const fn = { _ueActiveUnitsRef, _ueRetryAsync, _ueComputeAllocation, missingUnitsWarning, unitEngineAllocateConsumption, _ueMaybeWarnUntrackedConsumption, _ueWarnAllocateRtdbError, _ueRecomputeCurrentStock, _ueSyncQtyRemainingClamped, unitEngineReverseAllocations, _ueClaimedReverseAllocations, unitEngineOnOpen, unitEngineFinishOpenUnit, isTemTrackedNL, isAtomicUnitItem, prepReconRecoverOrphan, prepReconAcquire, prepReconRelease, prepReconAssertFree, prepReconSetUnit, applyPrepConsumptionPOS, applyStockTransactionPOS, applyStockTransferPOS, setLocationStockFromCountPOS, logStockAnomalyPOS, createContainersForReceipt, findContainerByCode, loadOpenContainers, sinhMaNgauNhien, capMaKhoDuyNhat, genStockContainerCode, genPrepBatchCode, prepareOrderReversalNetPOS, reverseSalesConsumptionPOS, _voidBackfillConsumptionPOS, _ueWarnReverseFailed, _reverseIngredientConsumptionPOS, _reversePrepConsumptionPOS, _applyFifoNotEmpty, writeAtomicContainerFinish, _reverseAtomicContainerFinish, _wastePrepQtyPOS, prepShortageClearAll, shiftWeighErr, shiftWeighAbsSig, shiftWeighResetUnitPOS, shiftWeighResFromRtPOS, shiftWeighFinishPOS, shiftWeighHealPendingPOS, shiftWeighReclassToConsumptionPOS, shiftWeighApplyLinePOS, setLocationStock, prepBatchSetQtyCore, prepBatchRestoreCore, approvePendingLostReportsForItem, ctnAdjustCore, prepReconIsLow, prepReconReadUnits, prepReconCheckpointAtStart, prepReconAttachOpenUnit };
  const api = {
    VERSION, init, P, fn,
    isReady: () => !!C,
    consts: { STOCK_CONTAINERS_COLL, STOCK_ANOMALY_COLL, PREP_RECON_LOCK_COLL, REVERSAL_CLAIM_STALE_MS },
    consume: { compensateDuplicate: consumeCompensateDuplicate, recoverDuplicates: consumeRecoverDuplicates, reverseIngredient: _reverseIngredientConsumptionPOS, reversePrep: _reversePrepConsumptionPOS, allocate: unitEngineAllocateConsumption, reverse: unitEngineReverseAllocations, reverseClaimed: _ueClaimedReverseAllocations, prepSale: applyPrepConsumptionPOS,
      reverseOrder, reverseSales: reverseSalesConsumptionPOS, voidBackfill: _voidBackfillConsumptionPOS, backfillNoStock: consumeBackfillNoStock, writeTrace: consumeWriteTrace },
    lifecycle: { finishAtomic: writeAtomicContainerFinish, reverseAtomicFinish: _reverseAtomicContainerFinish, approveLostReports: approvePendingLostReportsForItem, fixReceipt: lifecycleFixReceipt, restoreAtomic: lifecycleRestoreAtomic, openSealed: lifecycleOpenSealed, requestDiscard: lifecycleRequestDiscard, markFound: lifecycleMarkFound, open: unitEngineOnOpen, finish: unitEngineFinishOpenUnit, createFromReceipt: createContainersForReceipt },
    stock: { recompute: _ueRecomputeCurrentStock },
    units: { fifoNotEmpty: _applyFifoNotEmpty, ref: _ueActiveUnitsRef, listOpen: loadOpenContainers, computeAllocation: _ueComputeAllocation, missingWarning: missingUnitsWarning, fifoPendingFromRt },
    codes: { reprint: codesReprint, find: findContainerByCode, generate: capMaKhoDuyNhat, containerCode: genStockContainerCode, batchCode: genPrepBatchCode },
    classify: { isTemTracked: isTemTrackedNL, isAtomic: isAtomicUnitItem },
    ledger: { setLocationStockManual: setLocationStock, apply: applyStockTransactionPOS, applyManual: applyStockTransactionManual, transfer: applyStockTransferPOS, setLocationStock: setLocationStockFromCountPOS, annotate: ledgerAnnotate, amend: ledgerAmend, amendInTx: ledgerAmendInTx },
    containers: { adjust: ctnAdjustCore, annotate: containersAnnotate },
    batches: { annotate: batchesAnnotate },
    anomaly: { log: logStockAnomalyPOS, resolve: anomalyResolve },
    Error: UnitEngineError, ANNOTATABLE,
    prep: { cancelSettleRecon: prepCancelSettleRecon, reconReadUnits: prepReconReadUnits, reconIsLow: prepReconIsLow, reconCheckpointAtStart: prepReconCheckpointAtStart, reconAttachOpenUnit: prepReconAttachOpenUnit, shortageClearAll: prepShortageClearAll, wasteQty: _wastePrepQtyPOS, setBatchQty: prepBatchSetQtyCore, restoreBatch: prepBatchRestoreCore, adjustStock: prepAdjustStock, countCommitLine: prepCountCommitLine, finishBatch: prepFinishBatch, discardByLots: prepDiscardByLots, createBatch: prepCreateBatch, claimCancel: prepClaimCancel, recordCancelResult: prepRecordCancelResult,
      editYield: prepEditYield, reconAddUnit: prepReconAddUnit, reconMarkExhausted: prepReconMarkExhausted, reconRebase: prepReconRebase,
      reconMarkProcessing: prepReconMarkProcessing, reconWindowSales: prepReconWindowSales, reconBookOf: prepReconBookOf, reconCommit: prepReconCommit, reconAcquire: prepReconAcquire, reconRelease: prepReconRelease, reconAssertFree: prepReconAssertFree, reconSetUnit: prepReconSetUnit, reconRecoverOrphan: prepReconRecoverOrphan },
    shift: { resetUnit: shiftWeighResetUnitPOS, healPending: shiftWeighHealPendingPOS, applyLine: shiftWeighApplyLinePOS, reclassToConsumption: shiftWeighReclassToConsumptionPOS, absSig: shiftWeighAbsSig, finish: shiftWeighFinishPOS, resFromRt: shiftWeighResFromRtPOS },
    util: { retry: _ueRetryAsync, round2, fmtQty: fmtPrepQty },
    duty: { CFG: DUTY, base: dutyBase, needsRecount: dutyNeedsRecount, needsNotify: dutyNeedsNotify, sameWeigh: dutySameWeigh, presence: dutyPresence, onDuty: dutyOnDuty,
      detectRecipeBias: dutyDetectRecipeBias, attributeInterval: dutyAttributeInterval, resolveVerification: dutyResolveVerification,
      lotBookAt: dutyLotBookAt, onNlWeigh: dutyOnNlWeigh, flush: dutyFlush, bg: dutyBg, buildDigest: dutyBuildDigest, digest: dutyDigest, writeDigest: dutyWriteDigest, gateCheck: dutyGateCheck, lotBookNow: dutyLotBookNow, onCount: dutyOnCount, verifyCommit: dutyVerifyCommit, expireTasks: dutyExpireTasks, listOpenTasks: dutyListOpenTasks,
      reassign: dutyReassign, contest: dutyContest, keep: dutyKeep, resetBaseline: dutyResetBaseline, listCases: dutyListCases, usageSince: async (prepId, fromMs, toMs) => dutyUsageFromTx(await dutyLoadPrepTx(prepId, fromMs, toMs), fromMs, toMs), txTime: dutyTxTime },
    // [E6] Đồng hồ engine: now() (giờ máy chủ khi serverClock), offset (ms) đang dùng.
    clock: { now: () => C.now(), offset: () => C.clockOffset, isServer: () => !!C.serverClock }
  };
  root.UnitEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
