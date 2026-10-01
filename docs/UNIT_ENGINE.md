# Unit Engine — tài liệu API (`unit_engine.v3.js`, bản 3.0.0; v1, v2 giữ để quay lui)

> Viết ở E5 (28/09/2026), cập nhật E6. Kế hoạch gốc: `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md`.
> Bảng ghi của E0 (trước khi tách): `docs/BANG_GHI_ENGINE.md`.

## 1. Engine là gì

Một file JS **dùng chung** cho `posgieo.html` và `quanlygieo.html`. Nó là **chỗ duy nhất được ghi** vào dữ liệu kho theo mã (tem, lô BTP, sổ kho, sổ lệch, RT `active_units_gieogieo`). Hai app chỉ gọi API. Nếu app ghi thẳng thì `tools/check_boundaries.js` báo lỗi và **không được deploy**.

Bất biến (chi tiết ở mục 2 kế hoạch):

| Mã | Bất biến |
|---|---|
| B1 | **Tem = sự thật.** Tồn NL = Σ `baseQty` tem sealed + Σ `unitBase` tem đang mở (RT). Khoản không gắn được vào mã thì ghi vào Sổ lệch. |
| B2 | RT `active_units_gieogieo/{itemId}/{id}` là nguồn thật của phần đang mở. |
| B3–B4 | FIFO theo `openedAt`. Nợ dồn vào tem mở gần nhất. |
| B5–B7 | Mở tem mới thì hấp thụ nợ. Báo hết: dương → WASTE, âm → `finishedDebt`. Hoàn trả về đúng tem. |
| B8 | Chống đúp: `txId` cố định, claim `reversal_unit_claims`, lỗi thì dừng (fail-closed). |
| B9 | Chống ghi đè tồn bằng mốc `_ueLastRecomputeStart`. Từ E6 mốc này dùng **giờ máy chủ**. |
| B10–B11 | Bù lệch RT–Firestore. BTP: tồn = phần dương, phần âm vào `pendingShortage`. |
| B12–B15 | Khoá NL khi cân mẻ. Ghi tuyệt đối có chống ghi đè. Mã 8 ký tự không trùng. Tem cái rời. |

## 2. Nạp và khởi tạo

```html
<script src="unit_engine.v3.js"></script>   <!-- trước script chính; đổi bản = đổi tên file -->
```

```js
UnitEngine.init({
  app: 'pos',                    // 'pos' | 'quanly' — tên app (chuỗi). Sai kiểu → ném lỗi.
  fstore, db,                    // Firestore + Realtime Database (compat)
  FieldValue: firebase.firestore.FieldValue,
  storeId: 'gg01',               // [E6] gắn vào mọi bản ghi Firestore MỚI do engine tạo
  serverClock: true,             // [E6] C1: now() = giờ máy chủ (.info/serverTimeOffset)
  businessDate: () => posDateKey(),
  getItems: () => KHO_ITEMS_CACHE, getPreps: () => PREP_ITEMS_CACHE_POS,
  getRefillRule: itemId => …, getBiggestPackagingUnit: item => …,
  ui: {…}, state: {…}, appFns: {…},   // xem 2.2
  hooks: { notify, report, fifoChanged, closeScanSheet, openUnitsChanged, stockChanged }
  // chỉ test: now, random, randomBytes (đồng hồ / nguồn ngẫu nhiên giả)
});
```

Nếu `unit_engine.v1.js` không tải được, app hiện banner đỏ và tự tải lại trang (mục 6.3 kế hoạch). Không có nhánh chặn bán nào khác.

### 2.1 Hook (engine gọi ra app)

| Hook | Khi nào |
|---|---|
| `notify(msg)` | Thông báo ngắn (toast) |
| `report(msg, title, meta)` | Lỗi cần báo Quản lý (toastAutoReport / showError) |
| `fifoChanged()` | Danh sách tem mở vừa đổi (Promise) |
| `closeScanSheet()`, `openUnitsChanged()` | POS: đóng tấm quét / vẽ lại danh sách tem đang dùng |
| `stockChanged(id, 'item'\|'prep')` | Tồn vừa suy lại. Quản lý dùng để xoá bộ nhớ đệm |

### 2.2 Bảng `ui` / `state` / `appFns`

Các nghiệp vụ E4 chuyển **nguyên văn** vào engine vẫn gọi đúng bước giao diện như trước, qua ba bảng do app truyền vào:
- `ui`: vẽ lại, mở popup. Thiếu hàm nào thì engine bỏ qua (Proxy an toàn).
- `state`: getter đọc trạng thái màn hình.
- `appFns`: hàm tính thuần của app. POS: `computeOpenExpiry`, `handoverIsOverThreshold`, `posMgrError`, `prepReconClassifyUsage`, `prepReconExtraNeedsReview`, `shiftWeighCaptureBaselinePOS`. QL: `dkey`, `fmtNum`, `loadPrepBatches`, `memoDropItems`.

Các bảng này do `sync_init` sinh vào khối `UnitEngine.init` của từng HTML (dòng `[E4] Bảng giao diện…`).

## 3. API theo nhóm

Tham số là tên biến trong mã. Cột "Ghi" nêu dữ liệu bị thay đổi.

### `consume` — trừ / hoàn khi bán
| Hàm | Việc | Ghi |
|---|---|---|
| `allocate(itemId, qtyUsed, coll, ref)` | Trừ FIFO vào tem/lô đang mở, trả `allocations` | RT |
| `reverse(itemId, allocations, coll)` | Hoàn đúng các tem đã trừ (B7) | RT |
| `reverseClaimed(claimId, itemId, allocations, coll)` | Như `reverse`, có claim chống đúp (B8) | RT, `reversal_unit_claims` |
| `prepSale(prepId, qty, note, referenceId, businessDate, txId, isBackfillAfterClose)` | Bán BTP | RT, `prep_items`, `prep_transactions` |
| `reverseOrder(orderId, opts)` | Quản lý xoá bill: hoàn toàn bộ | nhiều |
| `reverseSales(order, orderId)`, `voidBackfill(orderId)` | POS huỷ bill / huỷ bill bổ sung | nhiều |
| `reverseIngredient(itemId, qty, note, refId, locBack, fifoAllocations, atomicScanned, opKey)` | Hoàn 1 NL | RT, sổ |
| `reversePrep(prepId, qty, note, refId, unitAllocations, opKey)` | Hoàn 1 BTP | RT, sổ |
| `backfillNoStock(lines, orderId, ctx)` | Bill bổ sung không trừ kho (chỉ vết) | `order_stock_traces` |
| `writeTrace(orderId, data, opts)` | Ghi vết trừ kho của bill | `order_stock_traces` |

### `ledger` — sổ kho
| Hàm | Việc |
|---|---|
| `apply({itemId, type, qty, …, txId, deriveFromUnits})` | Ghi 1 dòng sổ + đổi tồn (POS). `txId` cố định thì gọi lại không ghi đúp |
| `applyManual({…})` | Bản Quản lý (nhập kho nhanh, chỉnh tồn tay, duyệt kiểm kho). Nhập hàng cộng vào kho nguồn theo quy tắc refill như POS (F6); `anomalyKind` chọn loại Sổ lệch, `null` = không ghi |
| `transfer({…})` | Chuyển kho giữa vị trí |
| `setLocationStock(itemId, locationId, qty, staffName)` | POS đặt tồn vị trí theo kiểm kê |
| `setLocationStockManual({itemId, locationId, locationName, qty, staff})` | Quản lý đặt tồn vị trí |
| `annotate(txId, fields, opts)` | Chỉ ghi **trường chú thích** (`ANNOTATABLE.ledger`) |
| `amend(txId, patch, meta)` / `amendInTx(t, ref, data, patch, meta)` | Sửa trường số lượng có vết: thêm `amendments[]` (chỉ thêm), bắt buộc `meta.reason`. Trường được sửa: `qty, type, resultingStock, reclassified*, amendNote, note` |

### `lifecycle` — vòng đời tem
| Hàm | Việc |
|---|---|
| `createFromReceipt({item, qtyBase, staff, staffEmployeeId, refId, idPrefix})` | Sinh tem khi nhận hàng |
| `openSealed(id, c, o)` / `open(containerId, c, coll)` | Mở tem (Firestore + RT, B5) |
| `finish(id, c, staffEmp, lyDo, daQuet, ref, prepBatchId, silent)` | Báo hết (B6) |
| `finishAtomic(ref, c, staffEmp, lyDo, daQuet)` / `reverseAtomicFinish(containerId, batchId, staffEmp, note)` | Tem cái rời (B15) |
| `restoreAtomic(containerId, c)` | Quản lý khôi phục tem cái rời về sealed |
| `requestDiscard(scanned, o)` | Báo huỷ tem (hai pha `discard_pending` → `finished`) |
| `markFound(id, staffEmp)` | Tìm lại tem báo mất |
| `approveLostReports(itemId, countId, codes)` | Quản lý duyệt báo mất |
| `fixReceipt(recId, o)` | Sửa phiếu nhận ghi sai (huỷ/sửa tem, `ledger.amend`, tồn) |

### `prep` — bán thành phẩm
`createBatch`, `finishBatch(b, d)`, `claimCancel(batchId, o)`, `recordCancelResult(batchId, r)`, `editYield(batchId, newQty, reason, opts)`, `discardByLots(p, d)`, `wasteQty(prepId, qty, note, staffEmp, meta, txId)`, `adjustStock(p, o)` (QL chỉnh tồn), `setBatchQty`, `restoreBatch` (F1: giữ `openedAt` gốc), `countCommitLine(l, ctx)` (kiểm kê BTP cuối ca, 1 dòng), `shortageClearAll(shortage)`.
Đối chiếu NL khi nấu (B12): `reconAcquire`, `reconRelease`, `reconAssertFree`, `reconSetUnit`, `reconRecoverOrphan`, `reconReadUnits`, `reconIsLow`, `reconCheckpointAtStart`, `reconAttachOpenUnit`, `reconAddUnit`, `reconMarkExhausted`, `reconRebase`, `reconMarkProcessing`, `reconCommit`.

### `shift` — cân cuối ca
`applyLine(l, day, staffEmp, seed)`, `finish(m, res)`, `healPending(day, pending)`, `reclassToConsumption(o)`, `resetUnit(u)`, `resFromRt(src, unitIds, opId)`, `absSig(node)`.

### `units`, `stock`, `codes`, `classify`
| Hàm | Việc |
|---|---|
| `units.ref(itemId)` | Ref RT `active_units_gieogieo/{itemId}` (**chỉ đọc** từ app) |
| `units.listOpen()` | Nạp danh sách tem đang mở |
| `units.computeAllocation(openUnits, qty)`, `units.missingWarning(unitBase, capacity)`, `units.fifoPendingFromRt(rtRoot, nlIds)` | Hàm thuần |
| `units.fifoNotEmpty(containerId, qty, note, staffEmp, weighLines, opId)` | Ghi "chưa hết" cho tem FIFO |
| `stock.recompute(itemId, coll)` | Suy tồn theo mã (B1, B9–B11). Trả tồn vừa tính. Nếu bị bỏ qua vì đã có lượt mới hơn: `null`, hoặc tồn mới hơn đó khi `serverClock` bật |
| `codes.find(code)`, `codes.generate(coll, truong)`, `codes.containerCode(…)`, `codes.batchCode(…)`, `codes.reprint(containerId, o)` | Mã tem (B14), cấp lại tem |
| `classify.isTemTracked(it)`, `classify.isAtomic(it)` | Phân loại món |

### Chú thích (`annotate`) và Sổ lệch
- `containers.annotate(id, fields)`, `batches.annotate(id, fields)`, `ledger.annotate(…)`, `anomaly.resolve(id, fields)` chỉ nhận các trường trong `UnitEngine.ANNOTATABLE`. Trường khác → lỗi `FIELD_NOT_ANNOTATABLE`.
- `containers.adjust(c, qty, expected, opId, note)` là thao tác Quản lý cân lại một mã (B13).
- `anomaly.log(docId, a)` ghi Sổ lệch.

### Tiện ích
- `util.retry(fn, tries)`, `util.round2(n)`, `util.fmtQty(n)`
- `clock.now()`, `clock.offset()`, `clock.isServer()` — đồng hồ engine (E6)
- `P` — khối đường dẫn dữ liệu: `P.units(itemId)`, `P.containers()`, `P.stockTx()`, …, `P.storeId()`. M2 sẽ đổi đường dẫn theo cửa hàng **tại đây**.
- `consts` — tên collection dùng chung
- `VERSION`, `isReady()`

## 4. Lỗi

`UnitEngine.Error(code, message, meta)` tạo `Error` có `name='UnitEngineError'` và `code`. Các mã hiện có:

| Mã | Ý nghĩa |
|---|---|
| `FIELD_NOT_ANNOTATABLE` | Ghi trường không phải chú thích qua `annotate` |
| `INVALID_QTY` | Tham số số lượng / lý do không hợp lệ |
| `LEDGER_UNKNOWN` | Không tìm thấy dòng sổ cần sửa |

Các nghiệp vụ chép nguyên văn giữ nguyên thông điệp lỗi cũ, ví dụ `PREP_RECON_STALE`, `prepFlowError(kind)`.

## 5. `storeId` và giờ máy chủ (E6)

- Mọi bản ghi Firestore **mới** do engine tạo (`set`, `add`, `t.set`) đều mang `storeId` (hiện là `'gg01'`). Doc có sẵn chỉ `update` thì không bị gắn. Chỉ thêm trường, tương thích ngược. Đường dẫn và khoá **chưa đổi** (việc của M2).
- `serverClock: true` đặt `now() = Date.now() + .info/serverTimeOffset`. Offset mặc định 0, không chờ.
- Mốc B9 lớn hơn `now() + 60 giây` bị bỏ qua và ghi đè (mốc "tương lai" do máy chạy giờ nhanh để lại, mục 6.5). Chỉ áp dụng khi `serverClock` bật.
- `serverClock` bật mà chưa nhận được `.info/serverTimeOffset` (RTDB chỉ báo sau khi bắt tay máy chủ): suy tồn chờ tối đa 3 giây; vẫn chưa có thì ghi tồn KHÔNG đóng mốc và KHÔNG so mốc.
- Xoá bill (`consume.reverseOrder` / `reverseSales`): gặp claim hoàn tem đang được lượt khác giữ (< 2 phút) → dừng, trả `{ok:false, busy}` — không ghi dòng hoàn, bill giữ để xoá lại. Món đã hoàn kiểu cũ (ADJUSTMENT + `reversal:true`) được bỏ qua. Tồn quầy trả về đúng `locDeductedAt` của từng dòng. Trace chỉ đánh dấu `reversed` khi hoàn xong.
- **R3 bật cho Quản lý**: suy tồn ở Quản lý giờ cũng dùng mốc B9 như POS.

## 6. Ranh giới và kiểm tra

- `node tools/check_boundaries.js` (AST) báo lỗi khi code ngoài engine:
  - ghi vào collection của engine hoặc RT `active_units_gieogieo`,
  - ghi trường tồn (`currentStock`, `locationStock`, …) lên doc món,
  - gọi `.add()` trên sổ.

  Ngoại lệ đã duyệt khai trong `tools/boundary_allow.json`. Hiện có 4: hai hàm tạo **danh mục** món (tồn khởi tạo), và hai chỗ checker báo nhầm vì tên collection được tính lúc chạy.
- `sh tools/predeploy_check.sh <thư mục deploy>` (chạy từ thư mục làm việc) chạy trước **mỗi** lần deploy (Termux, mục 6.7). Nó kiểm:
  - file engine mà HTML trỏ tới có tồn tại,
  - hai HTML dùng cùng bản engine,
  - còn giữ bản engine cũ trong 7 ngày (`tools/engine_releases.txt`),
  - `headers` trong `firebase.json` (mẫu ở `tools/firebase_headers_gieogieo.json`),
  - ranh giới,
  - test,
  - file của thương hiệu khác (`tools/site_files.txt`).
- `UnitEngine.fn` là bảng tên cũ, chỉ dùng nội bộ và cho test. **App không gọi** (E5 đã bỏ lớp shim tên cũ).

## 7. Đổi phiên bản engine

1. Sao chép thành `unit_engine.v{N+1}.js` và sửa. **Không sửa file bản cũ** vì nó được cache `immutable` 1 năm.
2. Sửa **cả hai** HTML trỏ tới bản mới. Ghi `v{N+1} YYYY-MM-DD` vào `tools/engine_releases.txt`.
3. Giữ `unit_engine.v{N}.js` ít nhất 7 ngày để quay lui bằng cách sửa tiến (6.6).
4. Thử bằng bản thử trước (`docs/CHE_DO_THU.md`), rồi chạy `sh tools/predeploy_check.sh <thư mục deploy>`. Đạt thì mới `firebase deploy --only hosting`.

## 8. Test (`sh tests/run_all.sh`, chỉ cần node)

| File | Nội dung |
|---|---|
| `snapshot_core` | 56 kịch bản lõi, so với ảnh chụp lập từ POS gốc (trước E1) |
| `snapshot_e4`, `snapshot_ql`, `snapshot_prepcount` | Nghiệp vụ E4 chuyển nguyên văn (POS / Quản lý / kiểm kê BTP) |
| `snapshot_wrap` | 24 kịch bản chạy **nguyên hàm giao diện** (bản mới + engine so với bản gốc) cho các nghiệp vụ E4 tách tay |
| `clock_e6` | `storeId`, giờ máy chủ, mốc tương lai, R3 Quản lý |
| `engine_api`, `ledger_once`, `ql_engine`, `atomic_finish`, `shift_weigh*`, `live_cache`, `stamp_free` | API, chống đúp, cân cuối ca, ly tem |

Lập lại ảnh chụp từ bản gốc (khi cần):
```sh
CORE=html CORE_HTML=<POS gốc> UPDATE=1 node tests/snapshot_core.test.js
```
Tương tự cho `e4`, `prepcount`, và `wrap` (thêm `CORE_HTML_QL=<QL gốc>`).

## Bán hàng trong lúc NL khoá cân cho mẻ chế biến

NL của mẻ (`prep_ingredient_locks_gieogieo` + `__prepLock` trên RT) khoá từ lúc bắt đầu mẻ tới khi từng NL cân xong.
- **Bán vẫn chạy** (POS truyền `duringPrepLock:true` ở `consume.allocate` và `ledger.apply`): trừ tem đúng FIFO như thường, cộng dồn
  `saleHeld` trên tem (RT) — NL không tem thì `prepSaleHeld` trên NL. Dòng sổ bán gắn `prepWindowBatchId` = mẻ đang giữ khoá.
  Mọi thao tác khác (đổ hao, điều chỉnh, kiểm kê, hoàn kho, báo hết, mở mã ở tab Kho…) vẫn bị chặn.
- **Chụp mốc lúc cân:** khi cân/đếm xong một mã, POS gọi `prep.reconBookOf` lấy `{book, held}` (tồn RT + `saleHeld` lúc đó).
  Chốt đối chiếu dùng `book` làm mốc: lượng mẻ dùng = `book − số cân` (phần bán TRƯỚC lúc cân nằm sẵn trong `book`).
  `prepReconSetUnit(..., heldAt)` cho phép tồn RT lệch đúng phần bán SAU lúc cân và ghi vào RT `số cân − phần bán sau` (hàng bán sau
  lúc cân vẫn bị trừ). Mã báo hết trong lúc khoá dùng `prepReconFinishBookBase`.
- **Ghi nhận:** `prep.reconWindowSales(batch, NL)` liệt kê bill đã bán; chốt xong ghi `inputTrace.<NL>.windowSales/windowSoldQty` và đánh dấu
  dòng bán `prepWindowSettled`. Màn Đối chiếu NL hiện "Trong lúc chờ đã bán …" (bill · món · lượng).
- Hết khoá (`prepReconRelease`) dọn `saleHeld` / `prepSaleHeld`.
- **Tab Kho:** NL đang chờ cân cho mẻ thì KHÔNG mở mã / báo hết ở tab Kho — làm ở màn Đối chiếu NL của mẻ.
- Còn chặn: xoá bill (hoàn kho) của bill bán trong lúc khoá — làm lại sau khi NL cân xong.

## Cân đối chiếu ra NHIỀU HƠN sổ (v3)
Mã có số cân > mốc sổ = sổ lần cân trước ghi thiếu (VD lần trước cân sai, trừ oan 165 g). Không còn chặn:
- Tem đặt theo số cân thật; mẻ dùng ghi theo định mức; phần dư = `Σcân − (Σmốc − định mức)` ghi **ADJUSTMENT tăng** `prep_surplus_{mẻ}_{NL}` (`prepReconSurplus`, `needsReview`).
- Người cân mốc trước lấy từ `startCheckpoint` của mã: dòng `prep_after_{mẻ trước}_{NL}` được đánh dấu `entryErrorConfirmed` (người cân lượt đó **vẫn chịu trách nhiệm** phần dùng-thêm đã ghi); cảnh báo `alerts_gieogieo/prep_entry_error_*` cho Quản lý; vết mẻ `inputTrace.<NL>.bookUnderstated`.
- Báo cáo tháng (Quản lý ▸ Đối chiếu NL theo nhân viên) hiện "Đã xác minh nhập sai số liệu" và người cân mốc trước.
