# Báo cáo bug — Luồng KHO & CÂN

Phạm vi rà soát: `posgieo.html`, `quanlygieo.html`
Ngày: 2026-09-15

Tất cả số dòng theo bản file gốc được rà soát. Trước khi sửa nên `grep` lại theo tên hàm
(số dòng sẽ trôi sau mỗi lần vá).

---

## Bảng tổng hợp

| # | Mức | Vấn đề | Vị trí |
|---|-----|--------|--------|
| 1 | 🔴 Nghiêm trọng | Điều chỉnh tồn bên Quản lý bị Unit Engine ghi đè xoá sạch | `quanlygieo.html:4636` |
| 2 | 🔴 Nghiêm trọng | `submitItemAdjust` tính delta từ cache — sai khi POS bán song song | `quanlygieo.html:15093` |
| 3 | 🔴 Nghiêm trọng | Bộ cân chia sai hệ số → sai 1000 lần khi `opts.unit` lệch đơn vị gốc | `posgieo.html:9815` |
| 4 | 🟠 Vừa | `wpDone` nuốt im lặng lần cân dở dang không hợp lệ | `posgieo.html:9971` |
| 5 | 🟠 Vừa | `_pwWeighings` / `_pwChoice` không được dọn → bảng kê cân "nói dối" | `posgieo.html:8901`, `11696` |
| 6 | 🟠 Vừa | Chống double-tap thủng ở `submitFifoNotEmpty` | `posgieo.html:4326` |
| 7 | 🟠 Vừa | `approveStockCount` đóng phiếu kể cả khi có dòng lỗi | `quanlygieo.html:4679` |
| 8 | 🟡 Nhẹ | Xoá dụng cụ đựng không dọn `vesselIds` phía nguyên liệu | `quanlygieo.html:16771` |
| 9 | 🟡 Nhẹ | `pwWeighMode` dai dẳng toàn cục qua các món | `posgieo.html:9270` |
| 10 | 🟡 Nhẹ | `_pwApplyWeigh` ghi bảng kê cả khi kết quả = 0 | `posgieo.html:9340` |

---

## 🔴 BUG 1 — Điều chỉnh tồn bên Quản lý bị Unit Engine xoá sạch

**Vị trí:** `quanlygieo.html:4636` `applyStockTransaction()`
Ảnh hưởng: `submitItemAdjust()` (15093) và `approveStockCount()` (4679).

### Hiện trạng

```js
// quanlygieo.html:4636
const next = current + Number(qty);
t.update(itemRef, { currentStock: next, updatedAt: ... });
```

Chỉ cộng/trừ `currentStock`. Không đụng `untrackedPendingDelta`, không đụng RT, không đụng tem/lô.

Nhưng bên POS, `_ueRecomputeCurrentStock()` (`posgieo.html:3748`) **ghi đè** `currentStock` theo:

```
currentStock = untrackedBase + untrackedPendingDelta + Σ sealed.baseQty + Σ RT.unitBase
```

Khoản chỉnh tay không nằm trong bất kỳ vế nào. Chỉ cần POS bán / mở tem / báo hết / huỷ lô
món đó **một lần** sau khi Quản lý chỉnh tồn, recompute chạy và con số chỉnh biến mất
vĩnh viễn — không có cảnh báo, không có vết.

Đây đúng lớp lỗi mà phía POS đã vá kỹ (xem khối comment `[BUG "untracked reversal/allocation
bị recompute xoá" — FIX]`), nhưng app Quản lý chưa được cập nhật theo.

### Cách tái hiện

1. Quản lý → Kho → Nguyên liệu → chỉnh tồn món X từ 100 → 150.
2. Kiểm tra Firestore: `currentStock = 150`. ✅
3. Sang POS, bán 1 ly có chứa X (hoặc quét mở/báo hết một tem của X).
4. Đọc lại Firestore: `currentStock` quay về ~100 trừ định mức. ❌ Khoản +50 bay mất.

### Debug

```js
// Dán vào console app Quản lý, chạy trước và sau bước 3
async function dbgStock(itemId){
  const d = (await fstore.collection('inventory_items_gieogieo').doc(itemId).get()).data();
  console.table({
    currentStock: d.currentStock,
    untrackedBase: d.untrackedBase || 0,
    untrackedPendingDelta: d.untrackedPendingDelta || 0,
    _ueLastRecomputeStart: d._ueLastRecomputeStart
  });
}
```

Nếu `_ueLastRecomputeStart` đổi giữa hai lần gọi mà `untrackedPendingDelta` đứng im
trong khi `currentStock` tụt → đúng bug này.

### Giải pháp

Trong `applyStockTransaction`, mọi giao dịch **không quy về unit/tem nào** phải cộng dồn
vào `untrackedPendingDelta` — đúng như POS đang làm ở `applyStockTransactionPOS`
(`posgieo.html` ~13310).

```js
async function applyStockTransaction({itemId, type, qty, note, staff, businessDate, source, referenceId, locationId}){
  memoDropItems();
  const itemRef = fstore.collection('inventory_items_gieogieo').doc(itemId);
  const txRef = fstore.collection('stock_transactions_gieogieo').doc();
  await fstore.runTransaction(async (t)=>{
    const itemDoc = await t.get(itemRef);
    if(!itemDoc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
    const current = Number(itemDoc.data().currentStock)||0;
    const next = current + Number(qty);

    const updates = { currentStock: next, updatedAt: new Date().toISOString() };

    // [FIX BUG 1] Giao dịch từ app Quản lý KHÔNG đi qua Unit Engine — không tem/lô nào
    // ghi nhận khoản này. Không cộng vào untrackedPendingDelta thì lần
    // _ueRecomputeCurrentStock() kế tiếp bên POS sẽ tính lại từ
    // untrackedBase + sealed + RT và xoá sạch khoản vừa chỉnh.
    // Cùng cơ chế applyStockTransactionPOS() đang dùng cho CONSUMPTION/WASTE
    // khi deriveFromUnits=false.
    updates.untrackedPendingDelta =
      firebase.firestore.FieldValue.increment(Number(qty));

    t.update(itemRef, updates);
    /* ...phần ghi txData giữ nguyên... */
  });
}
```

**Lưu ý mở rộng:** nếu về sau có luồng nào bên Quản lý *có* đụng tem/lô thật, thêm tham số
`deriveFromUnits` và bỏ qua `increment` khi bằng `true`, giống hệt chữ ký bên POS.

**Việc dọn dữ liệu cũ:** những lần chỉnh tồn đã bị xoá trước đây không tự khôi phục được.
Nên chạy một lần đối soát: quét `stock_transactions_gieogieo` type `ADJUSTMENT` với
`source: 'management'`, cộng tổng theo `itemId`, so với `untrackedPendingDelta` hiện tại.

---

## 🔴 BUG 2 — `submitItemAdjust` tính delta từ cache

**Vị trí:** `quanlygieo.html:15093`

### Hiện trạng

Giao diện ghi rõ ô nhập là **"Tồn ĐÚNG theo thực tế"** — tức số tuyệt đối. Nhưng:

```js
const oldQty = Number(it.currentStock)||0;   // it lấy từ INVENTORY_ITEMS nạp lúc mở màn
const diff = newQty - oldQty;
await applyStockTransaction({ itemId: it.id, type: 'ADJUSTMENT', qty: diff, ... });
```

`applyStockTransaction` lại cộng `diff` vào `currentStock` **đọc tươi trong transaction**.
Nếu POS bán 5 đơn vị giữa lúc mở màn và lúc bấm Lưu, kết quả là `newQty - 5`, không phải
`newQty`. Chủ quán vừa đếm thật xong, gõ số thật, mà tồn ra vẫn sai — và confirm dialog
còn khẳng định chắc nịch "từ 100 → 150".

Màn kiểm kê bên POS không dính lỗi này vì nó ghi tuyệt đối (`unitBase: qty`).

### Cách tái hiện

1. Mở màn chỉnh tồn món X (tồn 100), **chưa bấm lưu**.
2. Bên POS bán vài ly dùng X (tồn còn 95).
3. Quay lại Quản lý gõ 150 → Lưu.
4. Kết quả: 145, không phải 150.

### Giải pháp

Đẩy phép so sánh vào **trong** transaction. Thêm chế độ set-tuyệt-đối cho
`applyStockTransaction`, hoặc viết riêng — bản dưới dùng cách thứ nhất vì ít chỗ đụng nhất:

```js
// quanlygieo.html — thêm tham số expectedCurrent + absoluteTo
async function applyStockTransaction({itemId, type, qty, note, staff, businessDate,
                                      source, referenceId, locationId,
                                      absoluteTo, expectedCurrent}){
  memoDropItems();
  const itemRef = fstore.collection('inventory_items_gieogieo').doc(itemId);
  const txRef = fstore.collection('stock_transactions_gieogieo').doc();
  let realQty = Number(qty) || 0;

  await fstore.runTransaction(async (t)=>{
    const itemDoc = await t.get(itemRef);
    if(!itemDoc.exists) throw new Error('Nguyên liệu không tồn tại (có thể vừa bị xoá)');
    const current = Number(itemDoc.data().currentStock)||0;

    // [FIX BUG 2] absoluteTo = "đặt tồn về đúng số này" (kiểm kê/chỉnh tay).
    // Delta phải tính từ số ĐỌC TƯƠI trong transaction, không phải số cache lúc mở màn.
    if (typeof absoluteTo === 'number' && isFinite(absoluteTo)) {
      realQty = absoluteTo - current;
      // Số hệ thống đã đổi từ lúc chủ quán nhìn thấy nó → dừng lại và hỏi lại,
      // đừng âm thầm ghi một con số khác với confirm dialog vừa hứa.
      if (typeof expectedCurrent === 'number'
          && Math.abs(expectedCurrent - current) > 1e-9) {
        const e = new Error(
          `Tồn vừa thay đổi (${fmtNum(expectedCurrent,2)} → ${fmtNum(current,2)}) ` +
          `trong lúc bạn đang nhập. Mở lại và kiểm tra rồi chỉnh lần nữa.`);
        e.code = 'stale-stock';
        throw e;
      }
      if (Math.abs(realQty) < 1e-9) return;   // không còn gì để chỉnh
    }

    const next = current + realQty;
    const updates = {
      currentStock: next,
      updatedAt: new Date().toISOString(),
      untrackedPendingDelta: firebase.firestore.FieldValue.increment(realQty)  // BUG 1
    };
    t.update(itemRef, updates);
    t.set(txRef, {
      itemId, type, qty: realQty, resultingStock: next,
      note: note||'', staff: staff||'',
      createdAt: new Date().toISOString(),
      businessDate: businessDate || dkey(new Date()),
      status:'posted', source: source||'management',
      ...(referenceId ? {referenceId} : {}),
      ...(locationId  ? {locationId}  : {})
    });
  });
}
```

Nơi gọi:

```js
// submitItemAdjust()
await applyStockTransaction({
  itemId: it.id, type: 'ADJUSTMENT',
  absoluteTo: newQty,          // ← thay cho qty: diff
  expectedCurrent: oldQty,     // ← số chủ quán đang nhìn thấy trên màn
  note: `Quản lý chỉnh tồn → ${fmtNum(newQty,2)} ${it.unit||''} · ${reason}`,
  staff: '', source: 'management'
});
```

Và bắt lỗi `stale-stock` ở `catch` để hiện đúng thông điệp thay vì "Chỉnh tồn thất bại".

**Cùng vấn đề ở duyệt kiểm kê:** `approveStockCount` gửi `varianceBase` — cũng là delta,
tính từ `expectedBase` chốt lúc nhân viên đếm (có thể vài giờ trước). Đó lại là **đúng ý đồ**
(variance là chênh lệch tại thời điểm đếm), nên giữ nguyên; chỉ cần thêm `untrackedPendingDelta`
của BUG 1.

---

## 🔴 BUG 3 — Bộ cân chia sai hệ số → sai 1000 lần

**Vị trí:** `posgieo.html:9815` trong `openWeighPad()`

### Hiện trạng

```js
const vessels = opts.itemId ? vesselsForItemPOS(opts.itemId) : vesselsForPrepPOS(opts.prepId);
...
const unit = opts.unit || goc.unit || 'g';
_wp = { ..., unit, factor: posVesselUnitFactor(unit) || 1, ... };
```

Hai nguồn đơn vị khác nhau:

- **Điều kiện cho phép cân** xét theo `it.unit` / `p.unit` (`_vesselsByIdsPOS(ids, unit)` —
  đơn vị hiện tại của danh mục).
- **Hệ số quy đổi** lấy theo `opts.unit` — vốn là **ảnh chụp cũ**:
  `c.unit` của tem (`fifoNotEmptyWeigh`), `b.unit` của lô (`openPrepFinishWeigh`),
  `l.unit` của dòng giao ca (`handoverCloseWeigh`, `handoverOpenWeigh`).

Và cái `|| 1` biến mọi đơn vị lạ thành "gam", đi thẳng ngược comment ngay phía trên
(`Đơn vị nào không quy đổi được từ gam thì KHÔNG cho cân`).

Kịch bản sai 1000 lần: Quản lý đổi đơn vị nguyên liệu `g` → `kg`. `vesselIds` được giữ
(kg hợp lệ, xem `quanlygieo.html:15770`), nhưng tem/lô cũ vẫn lưu `unit:'g'`.
→ Pad mở bình thường, chia cho **1** thay vì **1000**.
→ Cân 1430 g được ghi vào `unitBase` là **1430 kg**.

### Cách tái hiện

1. Nguyên liệu X đơn vị `g`, đã gắn dụng cụ, đã có tem đang mở.
2. Quản lý đổi đơn vị X sang `kg`, lưu.
3. POS → cảnh báo FIFO → "Chưa hết" → Cân trừ bì → gõ 1430.
4. Pad hiện `1430 g − 310 g bì = 1120 g`; `unitBase` ghi 1120 trong khi đơn vị món là kg.

### Debug

```js
// console POS, sau khi mở pad
console.log({ optsUnit: _wp.unit, factor: _wp.factor,
              itemUnit: (KHO_ITEMS_CACHE.find(x=>x.id===_wp.itemId)||{}).unit,
              prepUnit: (PREP_ITEMS_CACHE_POS.find(x=>x.id===_wp.prepId)||{}).unit });
```

`optsUnit !== itemUnit/prepUnit` → dính bug.

### Giải pháp

Đơn vị dùng để cân phải là **đơn vị hiện tại của danh mục**, không phải ảnh chụp; và bỏ
hẳn fallback `|| 1`:

```js
async function openWeighPad(opts) {
  await ensurePrepVesselsPOS();
  if (opts.itemId) await ensureKhoItemsPOS();
  const vessels = opts.itemId ? vesselsForItemPOS(opts.itemId) : vesselsForPrepPOS(opts.prepId);
  if (!vessels.length) {
    toast(opts.itemId ? '⚠️ Nguyên liệu này chưa gắn dụng cụ đựng nào'
                      : '⚠️ Bán thành phẩm này chưa gắn dụng cụ đựng nào');
    return;
  }
  const goc = (opts.itemId
    ? (KHO_ITEMS_CACHE || []).find(x => x.id === opts.itemId)
    : (PREP_ITEMS_CACHE_POS || []).find(x => x.id === opts.prepId)) || {};

  // [FIX BUG 3] Đơn vị để quy đổi phải là đơn vị HIỆN TẠI của danh mục — cùng nguồn với
  // điều kiện cho phép cân (_vesselsByIdsPOS dùng goc.unit). opts.unit là ảnh chụp cũ nằm
  // trên tem/lô/dòng giao ca; Quản lý đổi g→kg là hai bên lệch nhau, cân ra sai 1000 lần
  // mà không có gì báo.
  const unit = goc.unit || opts.unit || 'g';
  const factor = posVesselUnitFactor(unit);
  if (!factor) {
    // Không quy đổi được từ gam thì KHÔNG cân — thà mất nút cân còn hơn ra số sai ngầm.
    toast(`⚠️ Đơn vị "${unit}" không cân trừ bì được — nhập tay giúp mình`);
    if (opts.onManual) opts.onManual();
    return;
  }
  if (opts.unit && opts.unit !== unit) {
    console.warn('[Cân] đơn vị trên tem/lô lệch danh mục:', opts.unit, '→ dùng', unit);
  }

  _wp = {
    prepId: opts.prepId || null, itemId: opts.itemId || null, unit, factor,
    /* ...phần còn lại giữ nguyên... */
  };
  /* ... */
}
```

**Cần kiểm thêm:** mọi nơi *hiển thị* đơn vị sau khi cân (`weighSummaryHTML(lines, l.unit …)`,
`_pwApplyWeigh(..., p.unit, ...)`) vẫn đang truyền đơn vị ảnh chụp. Nên đổi sang đọc từ danh mục
cho nhất quán, kẻo pad ghi kg mà dòng tóm tắt bên dưới ghi g.

---

## 🟠 BUG 4 — `wpDone` nuốt im lặng lần cân dở dang không hợp lệ

**Vị trí:** `posgieo.html:9971`

### Hiện trạng

```js
function wpDone() {
  wpCommitCur(true);          // silent = true
  if (!_wp.lines.length) { toast('⚠️ Chưa cân lần nào'); return; }
  ...
}
```

Ý đồ đúng (đừng bắt bấm "Thêm lần cân" trước khi bấm "Xong"), nhưng `silent` che luôn cả
trường hợp **số không hợp lệ**: gõ nhầm 143 thay vì 1430 (nhẹ hơn bì 310), hoặc gõ thiếu số.
Đã có 2 khay chốt trước đó → `lines.length > 0` → pad đóng gọn ghẽ, trả về tổng **thiếu hẳn
một khay**, không một lời cảnh báo.

Đúng kiểu "mất số im lặng, không ai phát hiện" mà chính comment ngay trên đó nói là muốn tránh.

### Giải pháp

Chỉ im lặng khi ô **đang trống**. Có số mà số sai thì phải chặn:

```js
function wpDone() {
  // Gộp nốt lần cân đang gõ dở — nhân viên cân khay cuối rồi bấm thẳng "Xong" là phản xạ
  // tự nhiên.
  const raw = String(_wp.cur.grossG == null ? '' : _wp.cur.grossG).trim();
  if (raw !== '') {
    // [FIX BUG 4] Ô có số nghĩa là nhân viên ĐỊNH tính khay này. Sai số thì phải BÁO, không
    // được im lặng bỏ qua rồi trả về tổng thiếu một khay — chính là kiểu mất số im lặng.
    if (!wpCommitCur()) return;   // wpCommitCur() tự toast lý do cụ thể
  }
  if (!_wp.lines.length) { toast('⚠️ Chưa cân lần nào'); return; }
  const total = wpLinesTotal();
  if (!(total > 0)) { toast('⚠️ Tổng sau khi trừ bì bằng 0'); return; }
  /* ...phần còn lại giữ nguyên... */
}
```

Trường hợp còn lại (chưa chọn dụng cụ nhưng ô trống) vẫn đi thẳng qua như cũ.

---

## 🟠 BUG 5 — `_pwWeighings` / `_pwChoice` không được dọn

**Vị trí:** `posgieo.html:8901` (`wasteSetTarget`), `11696` (`weighMethod`), `_submitPrepWasteImpl`

### Hiện trạng

Hai biến toàn cục:

```js
let _pwWeighings = {};   // bảng kê cân, khoá theo batchId (hoặc 'plain')
let _pwChoice    = {};   // nút đang chọn
```

Chỉ được reset ở **duy nhất** `onchange` của `pwItem`:

```js
onchange="khoTxState.prepId=this.value; _pwWeighings={}; _pwChoice={}; renderKhoTxForm()"
```

Không reset ở:

- `wasteSetTarget()` — đổi tab "Đổ ly / Huỷ BTP / Hao hụt" rồi quay lại: DOM vẽ mới, ô số
  trống, nhưng `_pwWeighings['<batchId>']` vẫn còn nguyên.
- `_submitPrepWasteImpl()` sau khi lưu thành công.

Hậu quả: bảng kê cân của lần trước bị đính vào một số **gõ tay** của lần sau —
`batches[].weigh` ghi "cân 3 khay, bì 310 g" cho một con số chưa từng lên cân.
Đó chính là "lưu kèm một bảng kê nói dối" mà comment ở `pwManualEdit` bảo phải tránh.

Thêm nữa `weighMethod` là cờ chung cho cả phiếu:

```js
weighMethod: Object.keys(_pwWeighings).length ? 'vessel' : 'manual',
```

Một lô cân, một lô gõ tay → cả phiếu ghi `'vessel'`.

### Cách tái hiện

1. Kho → Huỷ bán thành phẩm → chọn BTP có ≥1 lô → Cân trừ bì lô A → Xong.
2. Bấm tab "Hao hụt nguyên liệu", rồi bấm lại tab "Huỷ bán thành phẩm".
3. Ô số của lô A giờ trống. Gõ tay 2.5 → Xác nhận huỷ.
4. Đọc `prep_transactions_gieogieo` vừa ghi: `batches[0].weigh` chứa bảng kê của bước 1,
   `weighMethod: 'vessel'`.

### Giải pháp

**(a) Dọn tập trung, gọi ở mọi lối vào/ra:**

```js
// [FIX BUG 5] Một chỗ duy nhất để dọn trạng thái cân của form huỷ BTP.
function pwResetWeighState() {
  _pwWeighings = {};
  _pwChoice = {};
  khoTxState.pwWeighMode = 'discard';   // xem BUG 9
}

function wasteSetTarget(t) {
  // Đổi tab là vẽ lại DOM từ đầu (ô số về trống) — bảng kê cân cũ không còn khớp với
  // bất cứ ô nào nên phải vứt, kẻo nó bị đính vào một số gõ tay ở lần lưu sau.
  pwResetWeighState();
  khoTxState.target = t;
  renderKhoTxForm();
}
```

Gọi thêm `pwResetWeighState()`:
- trong `onchange` của `pwItem` (thay cho `_pwWeighings={}; _pwChoice={}`),
- ở cuối nhánh `try` thành công của `_submitPrepWasteImpl()`, ngay trước `showScreen('khoScreen')`.

**(b) `weighMethod` theo từng dòng lô, không theo cả phiếu:**

```js
batches: lines.map(l => ({
  batchId: l.batchId, batchCode: l.batchCode, qty: l.qty,
  caLo: l.qty >= l.con - 0.001,
  // [FIX BUG 5] Mỗi lô có cách nhập riêng — một lô cân, một lô gõ tay là chuyện bình thường.
  weighMethod: _pwWeighings[l.batchId] ? 'vessel' : 'manual',
  ...(_pwWeighings[l.batchId] ? { weigh: _pwWeighings[l.batchId] } : {})
})),
// Cờ mức phiếu chỉ còn ý nghĩa "có dùng cân hay không" — giữ cho báo cáo cũ không vỡ,
// nhưng tính theo đúng các lô ĐANG lưu chứ không theo toàn bộ _pwWeighings.
weighMethod: lines.some(l => _pwWeighings[l.batchId]) ? 'vessel' : 'manual',
```

**(c) Phòng thủ thêm** — chỉ đính `weigh` khi số sắp lưu còn khớp bảng kê:

```js
function pwWeighMatches(key, qty) {
  const w = _pwWeighings[key];
  if (!w) return false;
  const soCan = w.mode === 'remain'
    ? Math.round((w.systemQty - w.weighedTotal) * 100) / 100
    : w.weighedTotal;
  return Math.abs(soCan - qty) <= 0.005;
}
```

Dùng `pwWeighMatches(l.batchId, l.qty)` thay cho `_pwWeighings[l.batchId]` ở chỗ đính `weigh`.
Cách này bịt luôn mọi lối rò còn sót mà không cần đi tìm hết các đường reset.

---

## 🟠 BUG 6 — Chống double-tap thủng ở `submitFifoNotEmpty`

**Vị trí:** `posgieo.html:4326`

### Hiện trạng

```js
async function submitFifoNotEmpty(containerId) {
  if (_posSubmitBusy) { toast('⏳ ...'); return; }   // ← cửa kiểm tra
  const qty = ...; const note = ...;
  const weighLines = _fifoNotEmptyWeighLines.slice(0);
  const staffEmp = await resolveStaffPinAndCheckin('fifoNotEmptyStaff');  // ← AWAIT
  if (!staffEmp) return;
  _posSubmitBusy = true;                                                   // ← đặt cờ QUÁ MUỘN
  ...
}
```

Giữa cửa kiểm tra và lúc đặt cờ có một `await`. Hai lần chạm nhanh (tablet cảm ứng, mạng 4G
chậm) đều lọt qua cửa, cùng chạy `_applyFifoNotEmpty` → **hai** dòng `ADJUSTMENT` và **hai**
bản ghi trong mảng `notEmptyChecks` cho cùng một lần cân.

`unitBase` cuối cùng vẫn đúng (ghi tuyệt đối `qty`), và dòng ADJUSTMENT thứ hai có
`delta = 0` vì đọc lại doc đã cập nhật — nên đây là bug về **sổ sách/lịch sử**, không phải
sai tồn. Nhưng nó làm hỏng màn "Cần xem lại" bên Quản lý (`quanlygieo.html:4449` đọc
`notEmptyChecks` cuối) và làm nhiễu đối soát.

Mọi hàm submit khác trong file đều theo khuôn `guard → set cờ ngay → try/finally`
(31 chỗ, xem `_submitKhoTxImpl`, `submitPrepWaste`...). Chỗ này lệch khuôn.

### Giải pháp

Đưa về đúng khuôn chung:

```js
async function submitFifoNotEmpty(containerId) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  // [FIX BUG 6] Đặt cờ NGAY, trước await đầu tiên (PIN). Trước đây cờ đặt sau await nên
  // hai lần chạm nhanh đều lọt qua cửa kiểm tra → hai dòng ADJUSTMENT + hai bản ghi
  // notEmptyChecks cho cùng một lần cân.
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('fifoNotEmptyBtn', '⏳ Đang lưu...');
  try {
    await _submitFifoNotEmptyImpl(containerId);
  } finally {
    _posSubmitBusy = false;
    restoreBtn();
  }
}

async function _submitFifoNotEmptyImpl(containerId) {
  const qty = Number(document.getElementById('fifoNotEmptyQty')?.value);
  if (!(qty > 0)) { toast('⚠️ Nhập số thật cân/đong được, lớn hơn 0 — nếu đúng là đã hết thì dùng "Quét mã xác nhận" thay vì đây'); return; }
  const note = (document.getElementById('fifoNotEmptyNote')?.value || '').trim();
  if (!note) { toast('⚠️ Phải ghi rõ lý do/ghi chú'); return; }
  const weighLines = _fifoNotEmptyWeighLines.slice(0);
  const staffEmp = await resolveStaffPinAndCheckin('fifoNotEmptyStaff');
  if (!staffEmp) return;
  try {
    await _applyFifoNotEmpty(containerId, qty, note, staffEmp, weighLines);
    toast('✅ Đã sửa lại tồn kho — tem vẫn đang mở');
    closeStockScanSheet();
    refreshFifoAlert().catch(() => {});
  } catch (err) {
    console.error('submitFifoNotEmpty lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  }
}
```

**Kiểm tra cùng lớp lỗi:** rà toàn bộ 31 chỗ `_posSubmitBusy = true` xem còn chỗ nào
nằm sau `await` không:

```bash
grep -n -B12 "_posSubmitBusy = true" posgieo.html | grep -n "await" 
```

---

## 🟠 BUG 7 — `approveStockCount` đóng phiếu kể cả khi có dòng lỗi

**Vị trí:** `quanlygieo.html:4679`

### Hiện trạng

```js
const results = await Promise.allSettled(jobs);
const failed = results.filter(r=>r.status==='rejected');
await ref.update({status:'approved', reviewedAt:..., reviewNote: reviewerNote||''});
return {failedCount: failed.length};
```

`status: 'approved'` được ghi **vô điều kiện**. Phiếu kiểm kê rời khỏi hàng chờ
`pending_review`, những nguyên liệu chỉnh lỗi (mất mạng giữa chừng, doc vừa bị xoá)
không còn đường thử lại và không ai biết là chúng đã lỗi ngoài một con số
`failedCount` trả về cho nơi gọi.

### Giải pháp

```js
async function approveStockCount(countId, reviewerNote){
  const ref = fstore.collection('stock_counts_gieogieo').doc(countId);
  const doc = await ref.get();
  if(!doc.exists) throw new Error('Không tìm thấy lần kiểm kho này');
  const data = doc.data();
  const targets = (data.items||[]).filter(it => Number(it.varianceBase) !== 0);

  const results = await Promise.allSettled(targets.map(it => applyStockTransaction({
    itemId: it.itemId, type: 'ADJUSTMENT', qty: Number(it.varianceBase),
    note: `Điều chỉnh sau kiểm kho (đếm ${fmtNum(it.countedBase,2)} ${it.unit}, hệ thống ${fmtNum(it.expectedBase,2)} ${it.unit})`,
    staff: data.countedBy || '', source: 'management', referenceId: countId
  })));

  // [FIX BUG 7] Có dòng lỗi thì KHÔNG đóng phiếu thành 'approved'. Đóng phiếu là đẩy nó
  // ra khỏi hàng chờ duyệt — những nguyên liệu chỉnh lỗi mất luôn đường thử lại và không
  // ai biết chúng đã lỗi.
  const failedItems = results
    .map((r, i) => r.status === 'rejected'
      ? { itemId: targets[i].itemId, itemName: targets[i].itemName || '',
          varianceBase: Number(targets[i].varianceBase),
          error: String((r.reason && r.reason.message) || r.reason || '') }
      : null)
    .filter(Boolean);

  const okItemIds = results
    .map((r, i) => r.status === 'fulfilled' ? targets[i].itemId : null)
    .filter(Boolean);

  await ref.update({
    status: failedItems.length ? 'partially_applied' : 'approved',
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewerNote || '',
    appliedItemIds: firebase.firestore.FieldValue.arrayUnion(...okItemIds),
    failedItems                                   // để màn duyệt hiện ra và cho bấm thử lại
  });
  return { failedCount: failedItems.length, failedItems };
}
```

Kèm theo, chỗ nạp hàng chờ phải lấy cả trạng thái dở dang:

```js
async function loadStockCountsForReview(){
  // 'partially_applied' vẫn phải nằm trong hàng chờ — còn dòng chưa áp dụng được.
  const snap = await fstore.collection('stock_counts_gieogieo')
    .where('status','in',['pending_review','partially_applied']).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}))
    .sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
}
```

Và khi duyệt lại một phiếu `partially_applied`, lọc bỏ những `itemId` đã nằm trong
`appliedItemIds` để không cộng đôi.

---

## 🟡 BUG 8 — Xoá dụng cụ đựng không dọn `vesselIds` phía nguyên liệu

**Vị trí:** `quanlygieo.html:16771` (`vesselUsedByPreps`), `doDeleteVessel`

### Hiện trạng

```js
function vesselUsedByPreps(vesselId){
  return (PREP_ITEMS||[]).filter(p=>(p.vesselIds||[]).includes(vesselId));
}
```

Chỉ quét bán thành phẩm. Nhưng tính năng "nguyên liệu dùng ngay cũng cân được" đã thêm
`vesselIds` lên `inventory_items_gieogieo` (xem `quanlygieo.html:15770`, và
`vesselsForItemPOS` bên POS). Hậu quả:

- Danh sách dụng cụ (16897) hiện **"Chưa gắn vào bán thành phẩm nào"** dù đang gắn cho
  3 nguyên liệu → chủ quán xoá mà tưởng vô hại.
- `doDeleteVessel` chỉ gỡ id khỏi `prep_items_gieogieo`, để lại **id chết** trong
  `inventory_items_gieogieo.vesselIds`.
- POS lọc id chết (`_vesselsByIdsPOS`) nên không vỡ giao diện — nhưng nguyên liệu đó
  **mất nút cân trong im lặng**, nhân viên quay về gõ tay. Đúng chỗ "gõ tay chính là chỗ
  sai vào thẳng tồn kho" mà comment ở `vesselsForItemPOS` đã nêu.
- Nếu là nguyên liệu cuối cùng dùng dụng cụ đó, `vesselIds` rỗng → cả `prepWeighHintHTML`
  cũng không hiện được lý do đúng.

### Giải pháp

```js
// [FIX BUG 8] Dụng cụ đựng dùng chung cho CẢ bán thành phẩm và nguyên liệu dùng ngay
// (inventory_items_gieogieo.vesselIds). Chỉ quét PREP_ITEMS là báo thiếu — chủ quán xoá
// mà tưởng vô hại, còn nguyên liệu thì mất nút cân trong im lặng.
function vesselUsedBy(vesselId){
  return {
    preps: (PREP_ITEMS||[]).filter(p => (p.vesselIds||[]).includes(vesselId)),
    items: (INVENTORY_ITEMS||[]).filter(i => (i.vesselIds||[]).includes(vesselId))
  };
}
// Giữ tên cũ cho các chỗ đang gọi, nhưng trả về gộp.
function vesselUsedByPreps(vesselId){
  const u = vesselUsedBy(vesselId);
  return [...u.preps, ...u.items];
}

async function doDeleteVessel(id){
  const v = VESSELS.find(x=>x.id===id); if(!v) return;
  const { preps, items } = vesselUsedBy(id);
  const phan = [];
  if(preps.length) phan.push(`${preps.length} bán thành phẩm: ${preps.map(p=>p.name).join(', ')}`);
  if(items.length) phan.push(`${items.length} nguyên liệu: ${items.map(i=>i.name).join(', ')}`);
  const canhBao = phan.length
    ? `\n\n⚠️ Đang được dùng bởi ${phan.join('; ')}.\nCác món đó sẽ mất lựa chọn cân bằng dụng cụ này và phải gõ tay.`
    : '';
  if(!confirm(`Xoá dụng cụ "${v.name}"?${canhBao}\n\nẢnh của nó cũng bị xoá hẳn khỏi Firebase.`)) return;
  try{
    await fstore.collection(VESSEL_COLL).doc(id).delete();
    vesselPurgePaths([v.imagePath, ...(v.variants||[]).map(x=>x.imagePath)]);
    await Promise.allSettled([
      ...preps.map(p => fstore.collection('prep_items_gieogieo').doc(p.id)
        .update({ vesselIds: (p.vesselIds||[]).filter(x=>x!==id), updatedAt: new Date().toISOString() })),
      // [FIX BUG 8] Gỡ luôn phía nguyên liệu — trước đây bỏ sót, để lại id chết.
      ...items.map(i => fstore.collection('inventory_items_gieogieo').doc(i.id)
        .update({ vesselIds: (i.vesselIds||[]).filter(x=>x!==id), updatedAt: new Date().toISOString() }))
    ]);
    logAudit('delete','prep_vessel',id,{ name:v.name, preps:preps.length, items:items.length });
    toast('🗑 Đã xoá');
    INVENTORY_ITEMS = await loadInventoryItems();
    renderKhoVessels();
  }catch(err){ /* ... */ }
}
```

Và sửa dòng hiển thị ở danh sách (16897) cho nói đúng cả hai loại:

```js
const u = vesselUsedBy(v.id);
const dungTxt = (u.preps.length || u.items.length)
  ? 'Đang dùng cho ' +
    [u.preps.length ? u.preps.length + ' bán thành phẩm' : '',
     u.items.length ? u.items.length + ' nguyên liệu' : ''].filter(Boolean).join(' · ')
  : 'Chưa gắn vào món nào';
```

### Dọn dữ liệu cũ

```js
// Chạy 1 lần trong console Quản lý: tìm id chết còn sót
(async () => {
  const ids = new Set((await fstore.collection('prep_vessels_gieogieo').get()).docs.map(d=>d.id));
  for (const coll of ['prep_items_gieogieo','inventory_items_gieogieo']) {
    const snap = await fstore.collection(coll).get();
    snap.docs.forEach(d => {
      const cur = d.data().vesselIds || [];
      const sach = cur.filter(x => ids.has(x));
      if (sach.length !== cur.length)
        console.log(coll, d.id, d.data().name, cur, '→', sach);
    });
  }
})();
```

---

## 🟡 BUG 9 — `pwWeighMode` dai dẳng toàn cục

**Vị trí:** `posgieo.html:9270` (`pwMode`), `9322` (`pwSetWeighMode`)

```js
function pwMode() { return khoTxState.pwWeighMode || 'discard'; }
function pwSetWeighMode(mode) { khoTxState.pwWeighMode = mode; }
```

Chọn "Cân phần còn dùng được" cho một lô rồi, **mọi** lần mở pad sau đó — kể cả sang một
bán thành phẩm hoàn toàn khác, kể cả sang ca sau — vẫn mặc định `remain` và lấy hiệu với
tồn hệ thống. Pad có hiện nút đang chọn nên không mù hoàn toàn, nhưng nhân viên đang vội
rất dễ cân phần sắp đổ mà máy lại hiểu là phần còn giữ, ra một số huỷ ngược hoàn toàn.

**Giải pháp:** reset về `'discard'` mỗi khi đổi món hoặc đóng form — đã gộp vào
`pwResetWeighState()` ở BUG 5. Cân nhắc thêm: reset ngay trong `pwWeighBatch`/`pwWeighPlain`
trước khi gọi `openWeighPad`, để mỗi lần cân là một quyết định mới.

---

## 🟡 BUG 10 — `_pwApplyWeigh` ghi bảng kê cả khi kết quả = 0

**Vị trí:** `posgieo.html:9340`

```js
if (qty < 0) {
  toast(`⚠️ Cân được ... không có phần nào bị đổ. Kiểm tra lại tồn.`);
  qty = 0;
}
_pwWeighings[key] = { mode: ..., weighedTotal: total, systemQty: con, lines };
_pwChoice[key] = 'weigh';
```

Đã cảnh báo đúng rồi, nhưng vẫn ghi `_pwWeighings[key]` và bật `_pwChoice='weigh'` cho một
kết quả rỗng. Bản thân nó vô hại (submit lọc `q > 0`), nhưng cộng với BUG 5 thì bảng kê rác
này sống sót và có thể bị đính vào lần lưu sau.

**Giải pháp:**

```js
if (remain) {
  qty = Math.round((con - total) * 100) / 100;
  if (qty < 0) {
    toast(`⚠️ Cân được ${fmtPrepQty(total)} ${unit} mà hệ thống chỉ ghi còn ${fmtPrepQty(con)} — không có phần nào bị đổ. Kiểm tra lại tồn.`);
    // [FIX BUG 10] Không lưu bảng kê cho một kết quả rỗng — nó chỉ nằm chờ để bị đính
    // nhầm vào một số gõ tay ở lần lưu sau.
    delete _pwWeighings[key];
    _pwChoice[key] = null;
    pwPaintChoice(key);
    const el0 = document.getElementById(inputId); if (el0) el0.value = '';
    const row0 = document.getElementById('pwRow_' + key); if (row0) row0.style.display = 'none';
    const info0 = document.getElementById('pwW_' + key); if (info0) info0.innerHTML = '';
    prepWasteUpdatePreview();
    return;
  }
}
```

---

## Thứ tự triển khai đề xuất

1. **BUG 3** — sai 1000 lần, sửa 10 dòng, không ảnh hưởng luồng nào khác. Làm trước.
2. **BUG 1 + BUG 2** — cùng file, cùng hàm, phải đi chung (BUG 2 vá đè lên BUG 1).
   Sau khi vá, chạy script đối soát `untrackedPendingDelta` ở phần BUG 1.
3. **BUG 4 + BUG 5 + BUG 10** — cùng cụm bộ cân/huỷ BTP, test một lượt.
4. **BUG 6 + BUG 7** — độc lập, làm lúc nào cũng được.
5. **BUG 8 + BUG 9** — dọn dẹp, kèm script dọn id chết.

## Bộ test tay tối thiểu sau khi vá

| Kịch bản | Kỳ vọng |
|---|---|
| Chỉnh tồn Quản lý → POS bán 1 ly món đó → đọc lại `currentStock` | Khoản chỉnh còn nguyên |
| Mở màn chỉnh tồn → POS bán → bấm Lưu | Báo "tồn vừa thay đổi", không ghi bừa |
| Đổi đơn vị nguyên liệu g→kg → cân tem cũ | Chia đúng 1000, hoặc từ chối cân có báo |
| Cân 2 khay xong, khay 3 gõ nhầm 143 (bì 310) → bấm Xong | Chặn lại, báo lỗi, không đóng pad |
| Cân lô A → đổi tab → quay lại → gõ tay → Lưu | Bản ghi KHÔNG có `weigh`, `weighMethod: 'manual'` |
| Huỷ lô A có cân → lưu → huỷ lại lô A gõ tay | Lần 2 không dính bảng kê lần 1 |
| Chạm 2 lần nhanh nút "Xác nhận vẫn còn hàng" | Đúng 1 dòng ADJUSTMENT, 1 `notEmptyChecks` |
| Duyệt kiểm kê với 1 itemId đã bị xoá | `status: 'partially_applied'`, phiếu còn trong hàng chờ |
| Xoá dụng cụ đang gắn cho nguyên liệu | Confirm liệt kê đủ, `vesselIds` bên item được gỡ |

---
---

# VÒNG 2 — Rà soát tiếp: nhận hàng, Unit Engine, báo mất hàng

Đợt này soi các luồng chưa động tới ở vòng 1: nhận hàng (`submitPoReceive` →
`createContainersForReceipt`), hấp thụ nợ FIFO (`unitEngineOnOpen`), và luồng báo mất hàng
nối giữa hai app.

## Bảng tổng hợp vòng 2

| # | Mức | Vấn đề | Vị trí |
|---|-----|--------|--------|
| 11 | 🔴 Nghiêm trọng | Hàng hư khi nhận bị trừ **hai lần** sau recompute | `posgieo.html:13191` + `18958` |
| 12 | 🔴 Nghiêm trọng | Luồng duyệt "Báo mất hàng" **không tồn tại** bên Quản lý — hàng mất không bao giờ bị trừ | `posgieo.html:12145` ↔ `quanlygieo.html` |
| 13 | 🔴 Nghiêm trọng | Kiểm kê gửi được **2 phiếu** cho 1 lần đếm → duyệt là chỉnh tồn hai lượt | `posgieo.html:12180` |
| 14 | 🟠 Vừa | Số nhận hàng không sinh đủ tem bị recompute xoá | `posgieo.html:5483` |
| 15 | 🟠 Vừa | Hấp thụ nợ FIFO nuốt lỗi → nợ bị trừ hai lần | `posgieo.html:4038` |
| 16 | 🟡 Nhẹ | Màn "Quét mã hàng tìm lại được" là code chết | `posgieo.html:12196` |

---

## 🔴 BUG 11 — Hàng hư khi nhận bị trừ hai lần sau recompute

**Vị trí:** `posgieo.html:13191` (`applyStockTransactionPOS`) + `18958` (`_submitPoReceiveImpl`)

### Hiện trạng

Luồng nhận hàng cố ý ghi hai vế (đã có comment giải thích ở `_submitPoReceiveImpl`):

```js
// vế 1 — nhận HẾT, gồm cả hàng vỡ
applyStockTransactionPOS({ type:'RECEIVING', qty: goodBase + damagedBase, ... });
// vế 2 — trừ lại phần hỏng
applyStockTransactionPOS({ type:'WASTE', qty: -damagedBase, locationId:'__SOURCE__', ... });
```

Tồn ròng `+goodBase`. Đúng.

Nhưng trong `applyStockTransactionPOS`:

```js
if (!deriveFromUnits && (type === 'CONSUMPTION' || type === 'WASTE')) {
  updates.untrackedPendingDelta = firebase.firestore.FieldValue.increment(Number(qty));
}
```

**Bất đối xứng:** vế WASTE cộng `−damagedBase` vào `untrackedPendingDelta`; vế RECEIVING
**không cộng gì cả** (điều kiện chỉ nhận CONSUMPTION/WASTE). Trong khi đó phần `+goodBase`
được đại diện bằng các tem `sealed`, còn phần `+damagedBase` thì không có tem nào đại diện.

Lần `_ueRecomputeCurrentStock()` kế tiếp của món đó (bất kỳ lượt bán / quét mở / báo hết nào):

```
currentStock = untrackedBase + (−damagedBase) + Σ sealed(≈ goodBase) + Σ RT
            = đúng − damagedBase
```

→ **Hàng vỡ bị trừ lần thứ hai, vĩnh viễn.** Đây đúng là lỗi mà comment ở
`_submitPoReceiveImpl` nói là đã vá ("LỖI TRỪ KHO 2 LẦN"), nhưng nó quay lại qua đường
Unit Engine — vế WASTE thì được ghi nhận, vế RECEIVING đối ứng thì không.

Chỉ ảnh hưởng nguyên liệu `trackingMode: 'unit' | 'batch'` (món `'none'` không bao giờ bị
recompute). Đúng nhóm hay vỡ nhất khi giao hàng: chai, hũ, hộp.

### Cách tái hiện

1. Nguyên liệu X `trackingMode:'unit'`, quy cách 1 Chai = 1000 ml, tồn 0.
2. Nhận hàng: 10 chai lành, 2 chai vỡ.
3. Sau khi ghi: `currentStock = 10000`. ✅ 10 tem `sealed` được sinh.
4. Quét mở 1 tem, bán 1 ly (kích hoạt recompute).
5. Đọc lại: `currentStock` hụt thêm **2000 ml** so với kỳ vọng.

### Debug

```js
// console POS — theo dõi bất đối xứng
async function dbgRecv(itemId){
  const d = (await fstore.collection('inventory_items_gieogieo').doc(itemId).get()).data();
  const sealed = await fstore.collection('stock_containers_gieogieo')   // đổi đúng STOCK_CONTAINERS_COLL
    .where('itemId','==',itemId).where('status','==','sealed').get();
  let s = 0; sealed.forEach(x => s += Number(x.data().baseQty)||0);
  const rt = (await _ueActiveUnitsRef(itemId).once('value')).val() || {};
  let o = 0; Object.keys(rt).forEach(k => o += Number(rt[k].unitBase)||0);
  console.table({
    currentStock: d.currentStock,
    untrackedBase: d.untrackedBase||0,
    untrackedPendingDelta: d.untrackedPendingDelta||0,
    sealedTotal: s, openTotal: o,
    congThuc: (d.untrackedBase||0)+(d.untrackedPendingDelta||0)+s+o
  });
}
```

Nếu `untrackedPendingDelta` âm đúng bằng tổng hàng vỡ đã nhận → dính bug này.

### Giải pháp

Hai cách, nên làm **cả hai**.

**(a) Đối xứng hoá `untrackedPendingDelta` — sửa gốc.** Mọi giao dịch không quy về unit đều
phải ghi nhận, kể cả cộng vào:

```js
// posgieo.html — applyStockTransactionPOS
// [FIX BUG 11] TRƯỚC ĐÂY chỉ CONSUMPTION/WASTE mới ghi vào untrackedPendingDelta, còn
// RECEIVING thì không — bất đối xứng. Với nguyên liệu có tem, phần nhận về được đại diện
// bằng tem 'sealed' nên không cần ghi; NHƯNG phần nhận về mà KHÔNG sinh được tem (hàng vỡ
// lúc nhận, số dư lẻ, tem sinh lỗi — xem BUG 13) thì không nằm trong vế nào của công thức
// recompute, trong khi vế WASTE đối ứng lại có ghi → hàng vỡ bị trừ hai lần.
// Quy tắc thống nhất: khoản nào KHÔNG có unit đại diện thì PHẢI vào untrackedPendingDelta,
// bất kể dấu.
const untrackedQty = Number(untrackedDelta);   // ← tham số MỚI, nơi gọi tự tính
if (!deriveFromUnits && (type === 'CONSUMPTION' || type === 'WASTE')) {
  updates.untrackedPendingDelta = firebase.firestore.FieldValue.increment(Number(qty));
} else if (isFinite(untrackedQty) && untrackedQty !== 0) {
  updates.untrackedPendingDelta = firebase.firestore.FieldValue.increment(untrackedQty);
}
```

Chữ ký hàm thêm `untrackedDelta` vào phần destructuring đầu hàm.

**(b) Nơi gọi khai đúng phần không có tem.** Trong `_submitPoReceiveImpl`, tính trước phần
sẽ **không** được tem nào đại diện, rồi khai vào vế RECEIVING:

```js
// [FIX BUG 11] Phần nhận về sẽ KHÔNG có tem đại diện = hàng vỡ (không bao giờ dán tem,
// xem khối sinh tem bên dưới) + số dư lẻ không đủ một đơn vị đếm (xem BUG 13).
// Món không theo dõi tem thì toàn bộ đều không có tem — nhưng recompute cũng không bao giờ
// chạy cho món đó nên khai 0 để giữ nguyên hành vi cũ.
function _recvUntrackedPart(it, goodBase, damagedBase) {
  const mode = (it && it.trackingMode) || 'none';
  if (mode === 'none') return 0;
  if (mode === 'batch') return damagedBase;      // batch: 1 tem ôm trọn goodBase
  const isDiscreteUnit = String(it.unit||'').trim().toLowerCase() === 'cái';
  const pk = (it.packagingUnits||[]).find(p => p.name === it.countUnitName);
  if (!pk && !isDiscreteUnit) return goodBase + damagedBase;   // không sinh tem nào cả
  const baseQty = pk && Number(pk.baseQty) > 0 ? Number(pk.baseQty) : 1;
  const soDonVi = Math.floor(goodBase / baseQty);
  const coTem = (soDonVi > 60 ? 0 : soDonVi) * baseQty;        // trần 60 → không sinh tem nào
  return round2(goodBase - coTem + damagedBase);
}
```

Và ở vế RECEIVING:

```js
const it = KHO_ITEMS_CACHE.find(x => x.id === l.itemId);
await applyStockTransactionPOS({
  itemId: l.itemId, type: 'RECEIVING', qty: receiveBase,
  untrackedDelta: _recvUntrackedPart(it, l.goodBase, l.damagedBase),   // ← MỚI
  note: ..., staff, staffEmployeeId: staffEmp.id,
  referenceId: recordRef.id, txId: `${idemKey}_${l.itemId}_RECEIVING`
});
```

Lưu ý: `txId` idempotent nên `increment` cũng chỉ chạy đúng một lần khi bấm lại — nhánh
`alreadyApplied` return sớm trước `t.update`.

**Dọn dữ liệu cũ:** cộng tổng `damagedBase` của mọi phiếu nhận trong
`receiving_records_gieogieo` theo `itemId`, đối chiếu với `untrackedPendingDelta` hiện tại,
bù lại phần đã bị trừ oan bằng một `ADJUSTMENT` có ghi rõ lý do.

---

## 🔴 BUG 12 — Luồng duyệt "Báo mất hàng" không tồn tại bên Quản lý

**Vị trí:** `posgieo.html:12145` (`stockCountReportLost`) ↔ `quanlygieo.html` (không có gì)

### Hiện trạng

POS xây đủ vế của mình:

- `stockCountReportLost()` tạo phiếu `stock_lost_reports_gieogieo` với `status: 'pending_review'`
  và một alert `type: 'lost_item_report'`.
- `_doSubmitStockCount()` **cố ý hạ `expectedBase` xuống** cho những mã đã báo mất:

  ```js
  const expectedSealedAdj = Math.max(0, l.expectedSealedUnits - lostSealed);
  ...
  varianceBase: l.countedBase - expectedBaseAdj,
  ```

  Comment ghi rõ lý do: *"sẽ được Quản lý trừ tồn kho RIÊNG khi duyệt phiếu báo mất
  (approveLostReport bên quanlygieo.html) — không được để lệch kiểm kê tính luôn phần đó vào
  varianceBase, nếu không cùng một đơn vị mất sẽ bị trừ HAI LẦN."*

Nhưng bên `quanlygieo.html`:

```bash
$ grep -c "stock_lost_reports_gieogieo" quanlygieo.html   # → 0
$ grep -c "employee_stock_deductions_gieogieo" quanlygieo.html  # → 0
$ grep -ci "lost" quanlygieo.html                          # → 0
```

**Không có `approveLostReport`, không có `reportLostContainerManual`, không có
`maybeChargeEmployeeForLostReport`, không có màn duyệt nào.** Phiếu báo mất rơi vào một
collection không ai đọc.

Hậu quả dây chuyền — hàng mất **thoát khỏi cả hai đường**:

1. Kiểm kê cố ý bỏ qua phần đã báo mất → `varianceBase` không phản ánh nó.
2. Luồng báo mất không có ai duyệt → không có `ADJUSTMENT` nào được ghi.
3. Container vẫn ở `status: 'sealed'` → `_ueRecomputeCurrentStock` vẫn cộng nó vào
   `sealedTotal` mãi mãi.

→ Tồn kho **thừa vĩnh viễn** đúng bằng số hàng đã mất, và càng đếm càng "khớp" vì kiểm kê
đã tự loại phần đó ra khỏi phép so.

Alert `lost_item_report` có xuất hiện trong hộp thư chung (`quanlygieo.html:9628`), nhưng ở
đó chỉ bấm được "đã xử lý" — thao tác đó **không** đụng tới tồn kho hay container.

### Cách tái hiện

1. POS → Kiểm kê → quét thiếu 1 mã → bấm "Không tìm thấy" → xác nhận.
2. Gửi phiếu kiểm kê. Quản lý duyệt.
3. Kiểm tra `currentStock` của món đó: **không giảm**.
4. Kiểm tra container: vẫn `status: 'sealed'`, vẫn được recompute tính vào tồn.
5. Mở `quanlygieo.html`, tìm mọi tab: không có chỗ nào hiện phiếu báo mất.

### Giải pháp

Đây là **thiếu tính năng**, không phải sửa vài dòng. Cần dựng vế Quản lý. Bản tối thiểu:

```js
// quanlygieo.html — thêm mới
const STOCK_LOST_REPORTS_COLL = 'stock_lost_reports_gieogieo';

async function loadLostReportsForReview(){
  const snap = await fstore.collection(STOCK_LOST_REPORTS_COLL)
    .where('status','==','pending_review').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}))
    .sort((a,b)=>(a.reportedAt||'').localeCompare(b.reportedAt||''));
}

// Duyệt = (1) chuyển container sang 'lost' và gỡ khỏi RT nếu đang mở,
//         (2) trừ tồn kho đúng baseQty, (3) đóng phiếu.
// Thứ tự này quan trọng: gỡ RT TRƯỚC khi trừ tồn, để recompute (nếu chạy xen giữa)
// không đọc trúng một tem đã coi như mất mà vẫn còn trong RT.
async function approveLostReport(reportId, reviewerNote){
  const repRef = fstore.collection(STOCK_LOST_REPORTS_COLL).doc(reportId);
  const rep = await repRef.get();
  if(!rep.exists) throw new Error('Không tìm thấy phiếu báo mất');
  const r = rep.data();
  if(r.status !== 'pending_review') throw new Error('Phiếu này đã được xử lý rồi');

  const cRef = fstore.collection('stock_containers_gieogieo').doc(r.containerId);
  const cDoc = await cRef.get();
  if(!cDoc.exists) throw new Error('Không tìm thấy tem của phiếu này (có thể vừa bị xoá)');
  const c = cDoc.data();
  if(c.status === 'lost') throw new Error('Tem này đã ở trạng thái báo mất');

  // (1) Gỡ khỏi RT nếu đang mở — POS đã tính trước tình huống này, xem
  //     submitFoundLostContainer(): lúc tìm lại nó ĐĂNG KÝ LẠI vào RT bằng baseQty.
  const nowISO = new Date().toISOString();
  if(c.status === 'open'){
    await db.ref('active_units_gieogieo/' + r.itemId + '/' + r.containerId).remove();
  }

  // (2) Lưu lại status gốc để nút "Tìm lại được" bên POS phục hồi đúng chỗ.
  await cRef.update({
    status: 'lost', lostFromStatus: c.status,
    lostAt: nowISO, lostReportId: reportId,
    lostBy: r.reportedBy || '', lostByEmployeeId: r.reportedByEmployeeId || null
  });

  // (3) Trừ tồn. Tem đã rời khỏi cả 'sealed' lẫn RT nên phần này KHÔNG còn unit nào đại
  //     diện — phải đi qua untrackedPendingDelta (xem BUG 1 + BUG 11), nếu không lần
  //     recompute kế tiếp sẽ "hồi sinh" đúng số vừa trừ.
  const qty = -(Number(r.baseQty) || 0);
  await applyStockTransaction({
    itemId: r.itemId, type: 'WASTE', qty,
    note: `Duyệt báo mất — tem ${r.code || ''} (${r.reportedBy || ''})` +
          (reviewerNote ? ` · ${reviewerNote}` : ''),
    staff: '', source: 'management', referenceId: reportId
  });

  await repRef.update({
    status: 'approved', reviewedAt: nowISO, reviewNote: reviewerNote || ''
  });
  logAudit('approve','stock_lost_report',reportId,{ itemId:r.itemId, qty });
}

async function rejectLostReport(reportId, reviewerNote){
  // Từ chối = hàng vẫn còn, chỉ là nhân viên không tìm thấy lúc đếm. Không đụng tồn kho,
  // không đụng container — nhưng PHẢI đóng phiếu, kẻo nó nằm mãi trong hàng chờ.
  await fstore.collection(STOCK_LOST_REPORTS_COLL).doc(reportId).update({
    status:'rejected', reviewedAt:new Date().toISOString(), reviewNote: reviewerNote||''
  });
}
```

Kèm theo:

- Thêm mục `{key:'kho:lost', label:'Báo mất hàng', go:"goKho('lost')"}` vào danh sách tab kho
  (`quanlygieo.html:8531`) và một `renderKhoLostReports()` liệt kê phiếu chờ + hai nút.
- Trong hộp thư alert, alert `type === 'lost_item_report'` có `lostReportId` — gắn nút
  Duyệt/Từ chối gọi thẳng hai hàm trên, đúng như comment bên POS đã hình dung.

### Chốt chặn tạm thời (nếu chưa kịp dựng màn Quản lý)

Trong khi chờ, **không nên** để `_doSubmitStockCount` tiếp tục loại phần báo mất ra khỏi
`varianceBase` — làm vậy là bảo đảm hàng mất không bao giờ được trừ. Đổi tạm thành: vẫn tính
vào variance như bình thường, và không tạo phiếu báo mất:

```js
// [TẠM] Bật lại việc tính hàng không tìm thấy vào lệch kiểm kê cho tới khi màn duyệt
// báo mất bên Quản lý có thật. Trừ một lần qua kiểm kê vẫn tốt hơn không trừ lần nào.
const expectedSealedAdj = l.expectedSealedUnits;
const expectedOpenAdj   = l.expectedOpenUnits;
```

**Đừng bật cả hai** — bật màn duyệt mà quên gỡ chốt tạm này là trừ đúng hai lần, đúng thứ
comment gốc cảnh báo.

### Dọn dữ liệu cũ

```js
// console Quản lý — liệt kê phiếu báo mất đang treo, chưa ai xử lý
(async () => {
  const snap = await fstore.collection('stock_lost_reports_gieogieo').get();
  console.table(snap.docs.map(d => ({ id:d.id, ...d.data() })));
})();
```

---

## 🔴 BUG 13 — Kiểm kê gửi được 2 phiếu cho 1 lần đếm

**Vị trí:** `posgieo.html:12180` (`stockCountReviewAndSubmit`)

### Hiện trạng

Cùng lớp lỗi với BUG 6 nhưng hậu quả nặng hơn nhiều:

```js
async function stockCountReviewAndSubmit() {
  if (_posSubmitBusy) { toast('⏳ ...'); return; }        // ← cửa kiểm tra
  const staffEmp = await resolveStaffPinAndCheckin('scStaff');  // ← AWAIT
  if (!staffEmp) return;
  ...
  if (!mismatches.length) {
    _posSubmitBusy = true;                                 // ← đặt cờ QUÁ MUỘN
    try { await _doSubmitStockCount(staffEmp); } finally { _posSubmitBusy = false; }
    return;
  }
  ...
}
```

Và `_doSubmitStockCount` ghi phiếu bằng `.add()` — **không có idempotency key nào**:

```js
const scRef = await fstore.collection('stock_counts_gieogieo').add({
  items, countedBy: staff, status: 'pending_review', ...
});
```

Hai lần chạm nhanh → **hai phiếu kiểm kê `pending_review` giống hệt nhau**. Quản lý mở hàng
chờ thấy hai phiếu trùng, duyệt cả hai (rất dễ — chúng trông y hệt, cùng ngày, cùng người
đếm) → `applyStockTransaction` chạy hai lượt với cùng `varianceBase` → **tồn kho bị chỉnh
đúng hai lần**.

Đây là con đường sai tồn kho nghiêm trọng nhất trong nhóm này, vì variance kiểm kê thường
là số lớn.

### Cách tái hiện

1. POS → Kiểm kê → đếm xong, không có mã lệch.
2. Chạm hai lần liên tiếp vào nút gửi (hoặc chạm khi mạng chậm, chưa thấy phản hồi).
3. Firestore `stock_counts_gieogieo`: hai doc `pending_review` cùng nội dung.
4. Quản lý duyệt cả hai → tồn kho lệch đúng gấp đôi variance.

### Giải pháp

**(a) Đưa cờ về đúng khuôn** (giống BUG 6):

```js
async function stockCountReviewAndSubmit() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  // [FIX BUG 13] Đặt cờ NGAY, trước await PIN. Trước đây cờ chỉ được đặt sau khi
  // resolveStaffPinAndCheckin() trả về, nên hai lần chạm nhanh đều lọt qua cửa và gửi
  // được HAI phiếu kiểm kê giống hệt nhau — Quản lý duyệt cả hai là tồn bị chỉnh hai lần.
  _posSubmitBusy = true;
  try {
    const staffEmp = await resolveStaffPinAndCheckin('scStaff');
    if (!staffEmp) return;
    stockCountState.staffEmp = staffEmp;
    const mismatches = stockCountBuildMismatches();
    if (!mismatches.length) { await _doSubmitStockCount(staffEmp); return; }
    stockCountState.mismatches = mismatches;
    stockCountState.inMismatchReview = true;
    renderStockCountMismatchScreen();
  } finally { _posSubmitBusy = false; }
}
```

**(b) Thêm idempotency key** — phòng cả trường hợp mất ACK rồi bấm lại, mà cờ không cứu được.
Dùng đúng khuôn `idemKey` mà `_submitPoReceiveImpl` đã có:

```js
// _doSubmitStockCount()
// [FIX BUG 13] Một lượt ĐẾM = ĐÚNG một phiếu, bất kể bấm gửi bao nhiêu lần. Key sinh MỘT
// LẦN lúc mở màn kiểm kê và chỉ mất khi phiếu đã gửi xong hẳn — cùng cơ chế idemKey của
// luồng nhận hàng.
if (!stockCountState.idemKey) {
  stockCountState.idemKey = 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
}
const scRef = fstore.collection('stock_counts_gieogieo').doc(stockCountState.idemKey);
await scRef.set({ items, countedBy: staff, status: 'pending_review',
                  createdAt: new Date().toISOString(), businessDate: posDateKey(),
                  source: 'pos', scannedCodes });
```

Xoá `stockCountState.idemKey` ở chỗ khởi tạo màn kiểm kê (`openStockCountScreen`), **không**
xoá sau khi gửi thành công — để lần bấm lại vẫn ghi đè đúng doc cũ thay vì đẻ doc mới.

**(c) Chốt chặn phía Quản lý** — dù POS đã vá, màn duyệt vẫn nên cảnh báo khi thấy hai phiếu
cùng `businessDate` + `countedBy` chờ duyệt:

```js
// renderKhoStockCountReview() — trước khi vẽ danh sách
const nhom = {};
list.forEach(p => { const k = (p.businessDate||'')+'|'+(p.countedBy||''); (nhom[k]=nhom[k]||[]).push(p); });
const trung = Object.values(nhom).filter(g => g.length > 1);
// hiện banner: "N phiếu trùng ngày+người đếm — nhiều khả năng là gửi đôi, chỉ duyệt MỘT."
```

### Rà cùng lớp lỗi

```bash
# Mọi chỗ đặt cờ sau một await
grep -n -B10 "_posSubmitBusy = true" posgieo.html | grep "await"
```

Vòng 1 đã bắt `submitFifoNotEmpty`; vòng này bắt thêm `stockCountReviewAndSubmit`. Nên chạy
lệnh trên và soi hết một lượt thay vì vá lẻ.

---

## 🟠 BUG 14 — Số nhận hàng không sinh đủ tem bị recompute xoá

**Vị trí:** `posgieo.html:5483` (`createContainersForReceipt`)

### Hiện trạng

```js
const soDonVi = mode === 'batch' ? 1 : Math.floor(Number(qtyBase) / baseQty);
if (soDonVi < 1) return [];
if (soDonVi > 60) {
  toast(`⚠️ ${item.name}: ${soDonVi} tem là bất thường — kiểm tra lại đơn vị nhập, chưa sinh tem`);
  return [];
}
```

Có **bốn** đường khiến tem sinh ra ít hơn số đã cộng vào kho:

| Đường | Phần không có tem |
|---|---|
| `Math.floor` — nhận 2500 ml, 1 chai = 1000 ml | 500 ml dư |
| `soDonVi > 60` — nhận nhầm đơn vị | **toàn bộ** |
| `!pk && !isDiscreteUnit` — chưa khai quy cách | **toàn bộ** |
| `break` khi ghi tem thứ i lỗi | phần từ tem i trở đi |

Trong cả bốn, `applyStockTransactionPOS({type:'RECEIVING'})` đã cộng **đủ** vào
`currentStock`. Phần chênh không nằm trong `sealed`, không nằm trong RT, không nằm trong
`untrackedPendingDelta` → **lần recompute kế tiếp xoá sạch**.

Trường hợp `soDonVi > 60` đặc biệt khó chịu: toast nói "chưa sinh tem" (nghe như chỉ mất tem),
nhưng thật ra cả lô hàng sẽ bốc hơi khỏi tồn sau lượt bán đầu tiên.

### Cách tái hiện

1. Nguyên liệu `trackingMode:'unit'`, 1 Chai = 1000 ml, tồn 0.
2. Nhận 2500 ml. `currentStock = 2500`, sinh 2 tem.
3. Mở 1 tem, bán 1 ly → recompute.
4. `currentStock` mất đúng 500 ml.

### Giải pháp

Dùng chung `_recvUntrackedPart()` đã viết ở BUG 11 — nó tính đúng cả bốn đường. Ngoài ra:

**(a) Cho `createContainersForReceipt` báo về phần bỏ sót** thay vì im lặng trả `[]`:

```js
// [FIX BUG 14] Trả thêm `untrackedBase` = phần đã vào kho nhưng KHÔNG có tem nào đại diện.
// Nơi gọi phải khai phần này vào untrackedPendingDelta, kẻo recompute xoá mất.
async function createContainersForReceipt({ item, qtyBase, ... }) {
  const bo = (lyDo, phan) => { /* log + trả về */ return { containers: [], untrackedBase: phan, skipReason: lyDo }; };
  ...
  if (mode === 'unit' && !pk && !isDiscreteUnit) return bo('chua_khai_quy_cach', Number(qtyBase));
  ...
  if (soDonVi > 60) {
    toast(`⚠️ ${item.name}: ${soDonVi} tem là bất thường — kiểm tra lại đơn vị nhập, CHƯA SINH TEM. `
        + `Số hàng vẫn đã vào kho, nhớ vào "Tem chờ dán" sinh lại.`);
    return bo('vuot_tran_60', Number(qtyBase));
  }
  ...
  // cuối hàm
  const daCoTem = out.length * (mode === 'batch' ? Number(qtyBase) : baseQty);
  return { containers: out, untrackedBase: round2(Number(qtyBase) - daCoTem), skipReason: '' };
}
```

Đổi nơi gọi (`_submitPoReceiveImpl`, và mọi chỗ khác gọi hàm này) theo shape mới:
`const { containers: made, untrackedBase } = await createContainersForReceipt(...)`.

**(b) Cảnh báo bền cho phần bỏ sót đáng kể** — chỉ toast là mất ngay khi đổi màn:

```js
if (untrackedBase > 0) {
  fstore.collection('alerts_gieogieo').doc('recv_untracked_' + idemKey + '_' + l.itemId).set({
    type: 'receive_untracked_qty', severity: 'warning', status: 'new',
    title: `"${l.name}" nhận ${untrackedBase} ${l.unit||''} không có tem đại diện`,
    note: 'Số này đã vào tồn kho nhưng không tem nào đại diện — kiểm tra quy cách đóng gói '
        + 'hoặc sinh tem bù ở "Tem chờ dán", nếu không kiểm kê sẽ luôn thấy lệch.',
    itemId: l.itemId, itemName: l.name, qty: untrackedBase, recordId: idemKey,
    at: new Date().toISOString()
  }, { merge: true }).catch(() => {});
}
```

**(c) Trần 60 nên chặn TRƯỚC khi ghi kho, không phải sau.** Kiểm tra ở lúc nhân viên gõ số
trong `renderPoReceiveForm` (`soDonVi` tính được ngay từ `goodQty × unitFactor`), hiện cảnh
báo đỏ tại dòng đó và không cho bấm "Ghi nhận" — đúng chỗ để sửa lỗi gõ nhầm đơn vị, thay vì
để hàng vào kho rồi mới báo.

---

## 🟠 BUG 15 — Hấp thụ nợ FIFO nuốt lỗi → nợ bị trừ hai lần

**Vị trí:** `posgieo.html:4038` (`unitEngineOnOpen`)

### Hiện trạng

Khi mở tem mới, RT transaction gánh nợ của các tem cũ (`unitBase < 0`), xoá chúng khỏi RT và
đặt tem mới `unitBase = capacity − totalDebt`. Xong xuôi mới đóng các tem nợ cũ bên Firestore:

```js
return fstore.collection(coll).doc(oldId).update(closeFields)
  .catch(err => console.warn('[UnitEngine] không đóng được unit nợ cũ', oldId, err));
```

`.catch(console.warn)` — nuốt lỗi. Nếu update này thất bại, tem nợ cũ **kẹt ở `status:'open'`**
với `unitBase` âm trên Firestore, đồng thời **đã bị xoá khỏi RT**.

Nhánh "orphan" của `_ueRecomputeCurrentStock` (`posgieo.html:3781`) được viết đúng cho một
tình huống khác, nhưng ở đây phản tác dụng:

```js
if (!rt[d.id]) { orphanOpenTotal += Number(data.unitBase) || 0; return; }
```

Tem nợ cũ vắng mặt trong RT → nhánh này cộng bù `unitBase` **âm** của nó. Nhưng khoản nợ đó
**đã được trừ rồi** trong `capacity − totalDebt` của tem mới.

→ **Nợ bị trừ hai lần**, và nó ở lại vĩnh viễn vì tem cũ mãi mãi `open`.

Tần suất không cao (cần đúng lúc mạng lỗi giữa hai bước), nhưng khi xảy ra thì không tự
phục hồi và không có cảnh báo nào — chỉ còn một dòng `console.warn` đã trôi mất.

### Cách tái hiện

Chặn mạng Firestore ngay sau khi RT transaction commit (DevTools → Network → offline trong
đúng cửa sổ đó), rồi mở một tem mới cho món đang có nợ FIFO. Hoặc mô phỏng bằng cách sửa tạm
Firestore: đặt một container `status:'open'`, `unitBase: -500`, và xoá node RT tương ứng, rồi
gọi `_ueRecomputeCurrentStock(itemId)`.

### Giải pháp

**(a) Đừng nuốt lỗi — thử lại rồi cảnh báo bền:**

```js
if (absorbedIds.length) {
  const nowISO = new Date().toISOString();
  const ketQua = await Promise.allSettled(absorbedIds.map(oldId => {
    const closeFields = absorbedAlreadyFinished[oldId]
      ? { unitBase: 0, _ueDebtAbsorbed: true }
      : (coll === 'prep_batches_gieogieo'
          ? { status: 'used_up', unitBase: 0, qtyRemaining: 0, _ueDebtAbsorbed: true }
          : { status: 'finished', finishedAt: nowISO, finishedBy: 'unit_engine_carry_forward',
              finishReason: 'fifo_debt_absorbed', unitBase: 0,   // ← [FIX] trước đây bỏ sót,
              // để lại unitBase âm trên Firestore dù nợ đã được tem mới gánh
              wasteBase: 0, wasteBasis: 'unit_engine_carried', needsReview: false,
              _ueDebtAbsorbed: true });
    // [FIX BUG 15] Thử lại trước khi chấp nhận lỗi — RT đã gỡ tem nợ này, nếu Firestore
    // vẫn nói 'open' thì nhánh orphan của recompute sẽ cộng bù unitBase ÂM của nó, trong
    // khi khoản nợ đó đã nằm trong capacity−totalDebt của tem mới. Nợ bị trừ hai lần.
    return _ueRetryAsync(() => fstore.collection(coll).doc(oldId).update(closeFields));
  }));
  const hong = absorbedIds.filter((_, i) => ketQua[i].status === 'rejected');
  if (hong.length) {
    console.error('[UnitEngine] không đóng được tem nợ cũ sau khi RT đã gánh', hong);
    toast('⚠️ Mở tem xong nhưng chưa đóng được ' + hong.length + ' tem nợ cũ — báo Quản lý');
    fstore.collection('alerts_gieogieo').doc('debt_absorb_close_failed_' + itemId + '_' + Date.now()).set({
      type: 'debt_absorb_close_failed', severity: 'danger', status: 'new',
      title: `Nợ FIFO đã được gánh nhưng chưa đóng được tem cũ — ${c.itemName || itemId}`,
      itemId, containerIds: hong, newContainerId: containerId,
      note: 'RT đã gỡ các tem nợ này và tem mới đã gánh nợ, nhưng Firestore vẫn để chúng ở '
          + 'trạng thái "đang mở" với unitBase âm — recompute sẽ trừ khoản nợ đó LẦN THỨ HAI. '
          + 'Cần đóng thủ công các tem này (status: finished, unitBase: 0).',
      at: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  }
}
```

**(b) Phòng thủ ở nhánh orphan** — đừng cộng bù cho tem đã được đánh dấu hấp thụ nợ:

```js
// _ueRecomputeCurrentStock()
openSnap.forEach(d => {
  const data = d.data();
  // [FIX BUG 15] Tem đã được tem mới gánh nợ hộ (_ueDebtAbsorbed) thì khoản nợ của nó ĐÃ
  // nằm trong unitBase của tem mới — cộng bù ở đây là trừ nợ lần thứ hai.
  if (data._ueDebtAbsorbed) return;
  if (!rt[d.id]) { orphanOpenTotal += Number(data.unitBase) || 0; return; }
  if (data._ueRtStale) {
    orphanOpenTotal += (Number(data.unitBase) || 0) - (Number(rt[d.id].unitBase) || 0);
  }
});
```

Cờ `_ueDebtAbsorbed` được đặt trong cùng lệnh `update` ở (a). Nếu lệnh đó lỗi hẳn thì cờ cũng
không có — nhưng lúc đó đã có alert `debt_absorb_close_failed` để người thật vào xử lý, đúng
hơn là để hệ thống tự đoán.

**(c) Dọn:** thêm một phép quét định kỳ tìm tem `status:'open'` có `unitBase < 0` mà không có
node RT tương ứng — đó chính là các tem kẹt:

```js
(async () => {
  const snap = await fstore.collection('stock_containers_gieogieo')
    .where('status','==','open').get();
  for (const d of snap.docs) {
    const c = d.data();
    if (!(Number(c.unitBase) < 0)) continue;
    const rt = (await db.ref('active_units_gieogieo/'+c.itemId+'/'+d.id).once('value')).val();
    if (!rt) console.warn('TEM NỢ KẸT:', d.id, c.code, c.itemName, c.unitBase);
  }
})();
```

---

## 🟡 BUG 16 — Màn "Quét mã hàng tìm lại được" là code chết

**Vị trí:** `posgieo.html:12196` (`stockCountScanFound`), `12228` (`submitFoundLostContainer`)

Hệ quả trực tiếp của BUG 12. Cả hai hàm chỉ chạy khi container có `status === 'lost'`:

```js
if (c.status !== 'lost') { toast('ℹ️ ' + ma + ' hiện không ở trạng thái "báo mất" — dùng nút "Quét mã" thường'); return; }
```

Nhưng **không có chỗ nào trong cả hai file đặt `status = 'lost'`** — việc đó lẽ ra thuộc
`approveLostReport` / `reportLostContainerManual` bên Quản lý, vốn không tồn tại. Nên nút này
luôn báo "hiện không ở trạng thái báo mất", với mọi mã, mãi mãi.

Kèm theo, 6 chỗ khác trong POS (`4218`, `4551`, `4835`, `4866`, `10532`, `11926`) đều có nhánh
`if (c.status === 'lost')` chỉ đường tới nút này — cũng là nhánh không bao giờ chạy.

**Giải pháp:** không sửa gì ở đây — dựng vế Quản lý ở BUG 12 là toàn bộ khối này sống lại
đúng như thiết kế. Chỉ cần **kiểm thử lại đường tìm-lại-được** sau khi có `approveLostReport`,
vì nó chưa từng chạy thật lần nào:

| Bước | Kỳ vọng |
|---|---|
| Duyệt báo mất một tem `sealed` | `status:'lost'`, `lostFromStatus:'sealed'`, tồn giảm `baseQty` |
| Quét "tìm lại được" tem đó | `status` về `'sealed'`, tồn cộng lại `baseQty`, phiếu → `found_again` |
| Duyệt báo mất một tem `open` | RT bị gỡ node, tồn giảm `baseQty` |
| Quét "tìm lại được" tem `open` | RT được đăng ký lại với `unitBase = baseQty` (xem comment ở `12250`) |
| Recompute sau mỗi bước trên | `currentStock` không nhảy thêm lần nào nữa |

---

## Thứ tự triển khai — cập nhật cho cả 16 bug

1. **BUG 3** — sai 1000 lần, sửa nhanh, độc lập.
2. **BUG 13** — tồn bị chỉnh hai lần, sửa 10 dòng, độc lập. Làm sớm.
3. **BUG 1 → BUG 11 → BUG 14** — cùng một cơ chế (`untrackedPendingDelta`), phải làm theo
   đúng thứ tự này vì BUG 11 mở rộng chữ ký hàm mà BUG 14 dùng lại.
4. **BUG 2** — vá đè lên BUG 1, làm ngay sau.
5. **BUG 12** — dựng tính năng, tốn nhiều thời gian nhất. Trong lúc chờ, đặt chốt chặn tạm
   đã mô tả. **Nhớ gỡ chốt tạm khi bật màn duyệt.**
6. **BUG 4, 5, 10** — cụm bộ cân, test một lượt.
7. **BUG 15** — Unit Engine, cần dựng được ca lỗi mạng để test.
8. **BUG 6, 7, 8, 9, 16** — dọn dẹp.

## Bổ sung bộ test tay

| Kịch bản | Kỳ vọng |
|---|---|
| Nhận 10 chai lành + 2 chai vỡ → bán 1 ly | Tồn = 10 chai, không hụt thêm 2 |
| Nhận 2500 ml với quy cách 1000 ml → bán 1 ly | Tồn giữ đủ 2500 (trừ phần bán) |
| Nhận số làm ra >60 tem | Chặn ngay ở form, chưa ghi kho |
| Chạm 2 lần nút gửi kiểm kê | Đúng 1 phiếu `pending_review` |
| Báo mất 1 tem → duyệt bên Quản lý | Tồn giảm đúng `baseQty`, tem `status:'lost'` |
| Quét lại tem vừa báo mất | Tồn cộng lại đúng, RT có node nếu tem đang mở |
| Recompute sau mỗi bước báo mất/tìm lại | Số không nhảy thêm lần nào |
| Tem nợ FIFO + chặn mạng lúc đóng tem cũ | Có alert `debt_absorb_close_failed`, nợ không trừ đôi |
