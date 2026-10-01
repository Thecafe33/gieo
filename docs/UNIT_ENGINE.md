# Unit Engine — tài liệu API (`unit_engine.v7.js`, bản 7.0.0; v1–v6 giữ để quay lui)

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

## Quy trách nhiệm lệch BTP theo ca — nhóm `duty` (v4)
Kế hoạch và quyết định của chủ: `docs/KE_HOACH_TRACH_NHIEM_CA.md`. Chạy thử luật trên file xuất: `node tools/chay_thu_trach_nhiem.js <file-xuat-day-du.json> [chi-tiet]`.

**Dữ liệu mới** (không phải dữ liệu kho; app cũng có thể đọc): `duty_cases_gieogieo` (hồ sơ vụ lệch), `duty_tasks_gieogieo` (việc cân lại `verify_{prepId}`), `duty_config_gieogieo/current`
(`baselineResetAt[prepId]`), `prep_items.lastCount` (mốc đếm: giờ, số, người, `suspect`), `employee_shifts.roles` (chức năng chụp lúc check-in), `employees.roles` (`barista` = pha chế, `order`).

**Hàm thuần** (`UnitEngine.duty.*`): `needsRecount` (≥50% lượng dùng và ≥150), `needsNotify` (>100% lượng dùng và ≥50), `sameWeigh`, `presence/onDuty` (người "pha chế" có mặt; không ai tích thì dự phòng cả ca),
`detectRecipeBias` (lệch nền do công thức: ≥5 khoảng đo, ≥80% cùng chiều, và MỌI người cùng lệch cùng mức — lệch dồn vào một người là thói quen cá nhân, không miễn), `attributeInterval`
(phân rã theo thứ tự: nhập sai đã xác minh → lệch nền công thức → người nấu mẻ ghi lệch ≥15% → lệch cực đoan CHƯA xác minh vào "chưa quy" → chia theo lượng bán theo sổ của người pha chế có mặt lúc bán;
thiếu cơ sở → `pool`, không đổ cho ai), `resolveVerification`.

**Luồng:**
1. `prep.countCommitLine` (đếm cuối ca) ghi `lastCount` và gọi `duty.onCount`: lập hồ sơ vụ lệch cho MỌI lệch ≥1 đơn vị (kể cả 1%). Chưa có mốc trước → "chưa quy". Lệch vượt 100% lượng dùng → thông báo
   `alerts_gieogieo` loại `duty_case`.
2. Cổng "cân lại một lần" ở POS (`duty.gateCheck`, KHÔNG hiện số): vẫn lệch lần hai → `l.suspect` → hồ sơ `pending_verify` + việc `verify_{prepId}` (hết hạn 48 giờ → `closed_pool`).
3. Người KHÁC cân lại (`duty.verifyCommit`), không khoá bán: mỗi lô chụp sổ lúc cân (`duty.lotBookNow`); RT ghi `số cân − phần bán sau lúc cân` trong transaction. Kết quả: `confirmed` (B ≈ A → lệch thật, chia theo ca),
   `entry_error` (B nhỏ hơn ngưỡng, HOẶC B khớp sổ gốc trước lần đếm của A → tự quy người đếm đầu, độ tin cậy Mạnh nếu khoảng giữa sạch), `dispute` (B không khớp cả A lẫn sổ gốc → chờ chủ chọn A/B/cả hai).
   Dòng sổ `ADJUSTMENT prep_verify_{task}` mang `responsibility` của người đếm sai.
4. Chủ: `duty.reassign` (chia lại %, hoặc đánh dấu `recipe`/`waived`, bắt lý do, lưu lịch sử), `duty.keep`, `duty.resetBaseline`. Nhân viên: `duty.contest`.
Giờ bán lấy từ id bill (`bill_<ms>_…`), không dùng giờ ghi sổ (bill bổ sung sau đóng ngày có giờ ghi muộn).
Chưa làm: nguyên liệu (NL) — đối chiếu NL khi nấu đã có `responsibility` riêng; đo hiệu quả sau 2 tuần (B6).

## NL theo ca + tóm tắt ngày (v5)
- **NL cân cuối ca → hồ sơ vụ lệch theo ca.** `shiftWeighFinishPOS` (sau khi sổ đã ghi) gọi `duty.onNlWeigh` **chạy nền** (`duty.bg`) — không chờ, không khoá, lỗi không làm hỏng lần cân/kết ca/bán hàng.
  Khoảng đo = từ mốc cân trước (`inventory_items.lastCount`, ghi mỗi lần cân) đến lần cân này; lượng bán theo giờ bill từ `stock_transactions` (CONSUMPTION, id `bill_<ms>_…`), cùng luật chia theo người "pha chế" có mặt như BTP.
  Hồ sơ `duty_cases` có `type:'nl'`, `shiftWeighOp`. Lần cân đầu chưa có mốc → "chưa quy". Lệch cực đoan (vượt ngưỡng cân lại) mà chưa ai xác minh → "chưa quy" + thông báo. NL **chưa có** vòng "người khác cân lại" như BTP.
  `duty.flush()` chờ các việc nền xong. Báo cáo tháng bỏ dòng sổ cân cuối ca đã có hồ sơ (không tính lại cho người đứng cân).
- **Tóm tắt ngày:** `duty.digest(day)` đọc sổ NL/BTP, hồ sơ vụ lệch, Sổ lệch của ngày → từng NL/BTP: đi đâu (nhập, bán theo bill đã trừ hoàn, nấu mẻ, nấu ra, hao hụt khai, lệch cân/đếm, điều chỉnh, Sổ lệch), lệch bao nhiêu, ai chịu, phần không tính vào ai,
  trạng thái (`ok/da_quy/chua_quy/cho_quyet/cho_xac_minh`) và vài câu tóm tắt. `duty.writeDigest(day)` (POS gọi NỀN khi đóng ngày) chờ `flush()` rồi lưu `duty_digests_gieogieo/{ngày}` + thông báo `duty_digest`.
  Quản lý ▸ "Tóm tắt ngày & vụ lệch" hiện bản tóm tắt tính trực tiếp theo ngày chọn.

## Sửa theo bản rà bug (v6, 01/10/2026) — test `tests/phan_bien_v6.test.js` (`ENGINE=unit_engine.v5.js` để xem lỗi cũ)
- **Xác minh cân lại (`duty.verifyCommit`)**: giành việc bằng transaction (`status:'processing'` + `processingById/At`; người khác chỉ giành lại sau 2 phút), từ chối khi BTP đang cân không khớp `task.prepId`; RT của lô mang dấu `dutyVerifyOp` → làm lại sau lỗi giữa chừng KHÔNG trừ thêm phần "đã bán" giả;
  Firestore của lô đồng bộ theo RT hiện hành (đọc lại, tối đa 3 vòng) nên bán xen không bị ghi đè; chỉ gỡ node RT khi về 0 (lô âm giữ nợ); dòng sổ `prep_verify_{task}_{firstAt}` không còn trùng id giữa hai việc của cùng BTP. `listOpenTasks/expireTasks` gồm cả `processing`.
- **Hoàn kho khi NL đang khoá cân** (có từ trước, tái hiện ở v5): lỗi mang `code:'PREP_LOCKED'`, `_ueClaimedReverseAllocations` nhả claim, `_reverseIngredientConsumptionPOS` không nuốt → `reverseOrder` trả `ok:false` (bill được giữ, hoàn lại sau khi chốt mẻ). Trước đây ghi dòng hoàn "untracked" + Sổ lệch mà tem không được cộng.
- **Bán BTP thiếu lô** (có từ trước): `applyPrepConsumptionPOS` suy tồn ngay khi bán vượt tồn (lô đi âm / không đủ lô / không có lô) để tồn không âm và `pendingShortage` hiện ngay; bán đủ lô không thêm lượt đọc.

## Sửa theo bản rà bug lần 2 (v7, 01/10/2026) — test `tests/phan_bien_v7.test.js` (`ENGINE=unit_engine.v6.js` để xem lỗi cũ)
- **`applyPrepConsumptionPOS`**: hai lượt CÙNG `txId` chạy chồng nhau chỉ trừ một lần — tuần tự hoá theo `prepId|txId` trong cùng máy; transaction ghi sổ đọc lại `txRef`, nếu lượt khác đã ghi thì HOÀN đúng phần RT vừa phân bổ và trả `{unitAllocations:[], duplicate:true}`. (Đường trừ NL `applyStockTransactionPOS` chưa đổi.)
- **`duty.verifyCommit`** viết lại phần giành việc / ghi:
  · giành bằng transaction kèm **token**; việc trên server phải đúng thế hệ với màn đang cầm (`firstAt` + `caseId`), người cân đầu kiểm tra trên dữ liệu vừa đọc;
  · việc `processing` còn mới (≤ `DUTY.PROCESSING_STALE_MS` = 60 giây) thì kể cả cùng một nhân viên trên máy khác cũng bị từ chối; lượt lỗi tự **nhả việc về `open`** (`partialRt` nhớ RT đã ghi dở) nên làm lại ngay được; token được kiểm tra trước các ghi cuối và khi đóng việc;
  · gỡ node RT về 0 bằng **transaction** (chỉ gỡ khi giá trị lúc gỡ vẫn ≈0, bán xen làm âm thì giữ nợ);
  · ghi lô Firestore lỗi (sau thử lại) thì **báo lỗi, không đóng việc**; lô đồng bộ theo RT hiện hành;
  · **dòng điều chỉnh = Σ số cân − Σ sổ lúc cân của các lô đã cân** (độc lập với bán xen / lô mới), tồn tổng là bước riêng (`_ueRecomputeCurrentStock`), không gán `currentStock = số cân`.

## Sửa theo bản rà bug lần 3 (v8, 01/10/2026) — test `tests/phan_bien_v8.test.js` (`ENGINE=unit_engine.v7.js` để xem lỗi cũ)
- **`consume.compensateDuplicate(kind,id,allocations,txId)`**: lượt trừ bị phát hiện trùng (`txRef` đã có) hoàn đúng phần đã trừ; ghi việc phục hồi bền `dup_recovery_gieogieo/{opId}` TRƯỚC khi hoàn. Hoàn đủ → `done`; hoàn dở/lỗi → `pending` (tối đa 5 lượt rồi `needs_manual`) + cảnh báo `duplicate_deduction_unreversed`. `applyPrepConsumptionPOS` trả `compensated` thật (không còn mặc định true). `consume.recoverDuplicates()` thử lại các việc `pending` (POS gọi ở khối check-in).
- **NL (POS)**: `applySalesConsumptionPOS` tuần tự hoá theo orderId trong máy; khác máy: `ledger.apply` trả `alreadyApplied` thì POS gọi `compensateDuplicate` để hoàn phần tem vừa trừ.
- **`duty.verifyCommit`**: số liệu lượt đầu (`attempt`: số cân, sổ lúc cân, từng lô) lưu vào việc khi giành; mở lại sau lỗi dùng lại đúng `attempt` (không dùng số mới của màn). Token kiểm tra trước MỖI ghi RT/lô và trong transaction sổ + đóng việc. RT lô ghi `counted − sold` **không kẹp 0** (nợ âm được giữ).
- **`duty.lotBookAt(prepId,batchId,atMs)`**: sổ lô tại mốc cân = sổ RT hiện tại + Σ `usageEvents` có `at > atMs`. POS lấy `atMs` TRƯỚC khi đọc sổ rồi gọi hàm này (best-effort theo `usageEvents`).
- `tests/lib/fakefb.js`: transaction có kiểm tra xung đột theo phiên bản doc + thử lại (giống Firestore), cần để tái hiện lỗi hai máy.

## Sửa theo bản rà bug lần 4 (v9, 01/10/2026) — test `tests/phan_bien_v9.test.js` (`ENGINE=unit_engine.v8.js` để xem lỗi cũ)
- **Nhật ký thay đổi có dấu trong node RT lô BTP** (`chg: [{t, d}]`, tối đa 30 dòng, cắt thì `chgTrim`): ghi CÙNG transaction đổi `unitBase` ở bán (`allocate`), hoàn (`reverse`) và xác minh. `duty.lotBookAt(prepId,batchId,atMs)` = `unitBase − Σ d(t>atMs)` — một lần đọc nên số dư và nhật ký cùng thời điểm; bán rồi xoá bill vẫn đúng. Node cũ / không có `chg` / bị cắt quá mốc → rơi về cách cũ (RT + `usageEvents` bán sau mốc, best-effort, không có lượt hoàn).
- **`verifyCommit`**: remain = số cân + (sổ hiện tại − sổ lúc cân) — CÓ DẤU, hoàn sau mốc cân được giữ. Thế hệ `dutyVerifyGen` (= `firstAt` của việc) kiểm NGAY TRONG transaction RT: lượt cũ chậm không ghi đè kết quả việc mới hơn. Tiến độ từng lô (`rtDone`) lưu bền trong `task.attempt`: thử lại không đoán "node không còn = đã xử lý" (lô chưa từng có node RT vẫn được dựng từ Firestore).
- **Bù trùng**: `unitEngineReverseAllocations(..., idemKey)` đánh dấu từng khoản hoàn `idemKey#i` trên node nhận (`revOps`) — lượt hoàn thứ hai cùng khoá coi như đã hoàn. Việc phục hồi có "thuê" 60 giây (`leaseAt`); ghi việc lên Firestore lỗi thì giữ hàng đợi cục bộ (bộ nhớ + localStorage `ue_dup_recovery_gieogieo`) và `recoverDuplicates()` ghi lại/chạy tiếp. Hoàn một phần cũng được làm lại an toàn (tối đa 5 lượt rồi `needs_manual`).
- **POS**: mở việc cân lại có `attempt` mà không còn lô → màn "Ghi nốt số cân lại" (chỉ PIN), không bắt cân lại.
- Snapshot `core`/`e4`/`ql` được cập nhật: chỉ thêm trường `chg` trên node RT lô BTP (và đánh số lại nhãn thời gian trong `ql`).

## Sửa theo bản rà bug lần 5 (v10, 01/10/2026) — test `tests/phan_bien_v10.test.js` (`ENGINE=unit_engine.v9.js` để xem lỗi cũ)
- **Bộ bọc RT `_ueActiveUnitsRef`**: mọi transaction trên `active_units_gieogieo` giữ metadata khi node bị dựng lại (`chg`, `chgTrim`, `revOps`, `dutyVerifyOp/Gen`) và, với lô BTP, tự ghi dòng `chg` delta cùng transaction nếu nơi gọi chưa ghi — nên `setBatchQty`, `discardByLots`, đếm, xác minh… đều giữ nhật ký sổ lô.
- **Hoàn bill hai máy**: cờ `iAmClaimer/existingData/tookOver` đặt lại ở đầu MỖI lần callback transaction claim chạy; đường hoàn bill (NL và BTP) cũng mang dấu chống ghi lặp tại RT (`revOps`).
- **`revOps` = {khoá: ms}** (khoá RT hợp lệ: ký tự lạ → `_`). Không loại theo số lượng, không xoá khi thao tác "xong" (lượt chậm vẫn có thể đến sau); chỉ hết hạn theo tuổi 3 ngày.
- **Hàng rào thế hệ bền** `duty_verify_fence_gieogieo/{prepId}` = {gen}: lượt xác minh giành rào trước khi ghi RT, đọc lại sau mỗi lô; thấy thế hệ mới hơn thì hoàn tác phần mình ghi (trừ đúng phần chênh, giữ bán xen) và dừng. Không mất khi lô đóng.
- **`duty.lotBookAtExact(prepId,batchId,atMs)` → {book, exact, reason}**: exact:false khi nhật ký bị cắt quá mốc / node không nhật ký mà có bán sau mốc / mất node. `verifyCommit` từ chối (`code:'BOOK_INEXACT'`, cân lại lô đó) thay vì điều chỉnh kho theo số không chắc. POS ghi `snaps[batchId].exact`. `duty.lotBookAt` vẫn trả số (best-effort).
- **Hàng đợi bù trùng cục bộ**: mỗi việc một khoá localStorage `ue_dup_recovery_gieogieo__{opId}`; chỉ xoá khoá đã lên Firestore thành công.
- Snapshot `core`/`e4`/`ql`/`wrap`/`prepcount`: chỉ thêm `chg`/`revOps` trên node RT (đã đối chiếu tự động).

## Sửa theo bản rà bug lần 6 (v11, 01/10/2026) — test `tests/phan_bien_v11.test.js` (`ENGINE=unit_engine.v10.js` để xem lỗi cũ)
- **Hoàn tác xác minh**: phần cộng thêm của lượt = `next − prev.unitBase`, hoặc cả `next` khi node chưa tồn tại (bán xen thành nợ âm đúng thực tế). Việc hoàn tác được ghi BỀN (`duty_verify_undo_gieogieo`, lỗi thì khoá localStorage `ue_verify_undo_gieogieo__{id}`) NGAY SAU khi ghi node và TRƯỚC khi đọc rào; đọc rào lỗi = chưa xác nhận (giữ việc, báo lỗi). `duty.recoverVerifyUndo()` (POS gọi lúc check-in): rào đã thuộc thế hệ mới hơn → hoàn tác, không → xác nhận hợp lệ.
- **Snapshot sổ lô**: engine chỉ nhận snapshot có `exact === true` (thiếu = từ chối `BOOK_INEXACT`). POS: đọc sổ lỗi → xoá snapshot cũ của lô và KHÔNG nhận số cân mới.
- **`lotBookAtExact`** chứng minh "không có biến động" bằng bất biến `unitBase == chgBase + Σ chg.d` (`chgBase` cuốn theo khi cắt nhật ký), không dùng `usageEvents`. Đọc ≤ `DUTY.BOOK_FRESH_MS` (10 s) sau lúc cân mà bất biến vỡ/chưa theo dõi/bị cắt → đóng dấu lại (chgBase = số hiện tại) và coi là chính xác (số hiện tại chính là số tại mốc) — tự chữa vòng "cân lại mãi". Lô không có node RT → exact:true (không thể bị bán trừ; chỉnh tay đều dựng node). Lỗi đọc thì ném lỗi.
- **Dấu hoàn bền** `rev_marks_gieogieo/{itemId}/{khoá}` (giữ 90 ngày, ngoài vòng đời tem/lô) bổ sung cho `revOps` trong node: node bị gỡ/đóng không làm mất dấu. `recoverDuplicates` chuyển việc chờ quá 60 ngày sang `needs_manual` + cảnh báo thay vì tự hoàn.
- Snapshot `core`/`wrap`: thêm dòng log transaction `rev_marks_gieogieo` và các trường metadata.

## Sửa theo bản rà bug lần 7 (v12, 01/10/2026) — test `tests/phan_bien_v12.test.js` (`ENGINE=unit_engine.v11.js` để xem lỗi cũ)
- **Đóng dấu lại (`lotBookAtExact`)** kiểm tra lại NGAY TRONG transaction: nếu máy khác vừa ghi nhật ký hợp lệ thì không xoá, dùng lịch sử đó.
- **`duty.fleetCompliant()/setFleetCompliant(flag, by)`** (`duty_config_gieogieo/current.fleetCompliant`, Quản lý có nút ở màn Vụ lệch): bất biến tổng không chứng minh được lịch sử khi còn máy cũ (hai thay đổi không ghi nhật ký triệt tiêu nhau). Chưa xác nhận → `exact:false` (`chua_xac_nhan_moi_may_da_cap_nhat`) → "Cân lại" bị từ chối cho tới khi chủ xác nhận mọi máy đã cập nhật.
- **Hoàn tác xác minh**: worker không hoàn tác lượt đã chốt — hồ sơ vụ lệch mang `verification.op = opId` (ghi cùng transaction đóng việc); rào mới hơn chưa đủ. Sau hoàn tác đồng bộ bản sao Firestore của lô, tồn tổng và thiếu chờ đối chiếu từ RT; lỗi đồng bộ → việc còn pending.
- **Dấu hoàn bền**: không đọc được `rev_marks_gieogieo` → `ambiguous` (không hoàn; claim được nhả; việc phục hồi còn pending).
- **POS xoá bill**: đặt cờ `deletionPending` trên node bill (RT) TRƯỚC khi hoàn kho; `orderAddonInfo` từ chối bổ sung bill đang xoá dở (claim/dòng hoàn cố định theo bill nên phần tiêu thụ thêm sẽ bị bỏ qua).

## Sửa theo bản rà bug lần 8 (v13, 01/10/2026) — test `tests/phan_bien_v13.test.js` (`ENGINE=unit_engine.v12.js` để xem lỗi engine cũ; L49/L50 kiểm POS nên chạy trên HTML hiện hành)
- **Hoàn tác xác minh**: bước đồng bộ lô/tồn/thiếu chờ đối chiếu từ RT LUÔN chạy khi xử lý việc (tách khỏi "đã hoàn tác RT"), idempotent; việc chỉ đóng khi đồng bộ xong.
- **Cổng phiên bản** (`duty.fleetCompliant`) áp dụng cho MỌI nhánh của `lotBookAtExact` (kể cả lô thiếu node RT) và kiểm lại khi `verifyCommit` nhận lượt chốt (`code:'FLEET_UNCONFIRMED'`), kể cả lượt dùng dữ liệu đã lưu — chủ bỏ xác nhận thì dừng, lượt dở được làm tiếp khi xác nhận lại. Mặc định CHƯA xác nhận.
- **Đóng dấu** chỉ cho node CHƯA từng theo dõi (không `chgBase`, không `chg`), kiểm lại trong transaction. Nhật ký bị cắt quá mốc hoặc bất biến vỡ → `exact:false`, không công nhận lại mốc cũ. Chữa: Quản lý "Điều chỉnh số lô" (`prep.setBatchQty`) giữ nhật ký, thêm dòng delta và tính lại `chgBase`.
- **Lô thiếu node RT**: đọc RT lại SAU khi đọc Firestore; node xuất hiện giữa chừng thì dùng lịch sử của nó (tối đa 3 vòng).
- **POS**: ghi cờ `deletionPending` bằng transaction, lỗi → dừng trước khi hoàn kho và nhả khoá; transaction ghi topping kiểm `cur.deletionPending` trên dữ liệu máy chủ.

## Sửa theo bản rà bug lần 9 (v14, 01/10/2026) — test `tests/phan_bien_v14.test.js` (engine) + `tests/chuoi_bill.test.js` (chuỗi bill, hàm thật của POS)
Ba cơ chế chung:
1. **Điều phối kho theo bill** (POS): lần bổ sung ghi `consumeJobs/{addonId}` = pending CÙNG transaction nhận topping. Việc trừ kho phải giành "thuê" (`running`) bằng transaction trên node bill — bị từ chối nếu bill có `deletionPending` hoặc việc đã `cancelled` (bill đã xoá → bỏ qua). Xoá bill: transaction đặt cờ kiểm job — có job `running` còn mới (<120 s) thì CHƯA xoá (báo đợi); job `pending/running` quá hạn bị `cancelled`. Xong việc → `done`.
2. **Đồng bộ lô BTP theo phiên bản RT**: node lô có `rev` (tăng mỗi lần đổi tồn, khởi từ giờ×1000). `_ueSyncPrepLot(prepId, lotId, node, extra)` là hàm chung duy nhất ghi bản sao lô từ RT (allocate, reverse, hoàn tác xác minh, đóng lô khi xác minh): Firestore chỉ nhận số khi `rev` ≥ `rtRev` đang giữ; lượt đồng bộ chậm mang số cũ bị bỏ qua. Node chưa có rev → ghi không điều kiện, đặt lại `rtRev`. Bỏ increment lẫn số tuyệt đối trên lô BTP.
3. **Mốc lịch sử có giới hạn tin cậy**: chữa nhật ký (`prep.setBatchQty`) khi bất biến đã vỡ tạo MỐC MỚI (`chgBase` = số mới, `chg` xoá, `chgTrim` = bây giờ) kể cả khi số nhập bằng số RT hiện tại — mốc cân trước lần chữa vẫn `exact:false`. Nhật ký còn nguyên thì giữ lịch sử và thêm dòng delta. Chỉnh số lô bị CHẶN khi có lượt cân lại dở (`processing` hoặc `partialRt`).
Chưa thống nhất (còn đường ghi tuyệt đối riêng, không mang `rev`): đếm cuối ca, `discardByLots`, tạo/khôi phục/hết hạn lô — các đường này ghi Firestore bằng số tuyệt đối riêng; chỉ các đường trên dùng hàm chung.

## Sửa theo bản rà bug lần 10 (v15, 01/10/2026) — `tests/phan_bien_v15.test.js` (engine) + `tests/chuoi_bill.test.js` ca 59–61 (hàm POS thật)
Hai hợp đồng:
1. **Một việc kho chỉ có một hiệu ứng.** Việc trừ kho bổ sung (`consumeJobs/{addonId}` trên node bill, RT): `pending → running(owner, startedAt) → done | failed(failedLines) | cancelled`. `done`/`cancelled` không chạy lại; `running` còn hạn (<120 s) của owner khác bị từ chối; quá hạn thì máy khác tiếp quản (owner mới; chỉ owner hiện tại ghi được trạng thái). Kế hoạch trừ (`plan`: dIng/dPrep) lưu bền trên việc — chạy lại dùng đúng plan đã lưu. Lỗi → `failed` kèm dòng lỗi, KHÔNG `done`. Mỗi khoản có `txId` cố định; `_addonConsumeIngredientPOS` kiểm sổ TRƯỚC khi phân bổ tem và hoàn phần tem thừa khi ledger báo `alreadyApplied`. **Dấu huỷ bill** `order_cancel_marks_gieogieo/{orderId}` (`consume.markOrderCancelled`, ghi TRƯỚC khi hoàn kho): `ledger.apply` (NL) và `prepSale` (BTP) kiểm dấu TRONG transaction ghi sổ cho referenceId `bill_…` — khoản đến muộn thấy dấu thì không ghi sổ và hoàn phần đã phân bổ (đường bù trùng bền). Hoàn kho đọc sổ SAU khi ghi dấu nên thấy mọi khoản đã commit trước dấu.
2. **Một bản sao lô chỉ tiến về phía trước.** `_ueSyncPrepLot(prepId, lotId, node, extra, always)`: số liệu VÀ trạng thái (`extra`: used_up…) chỉ áp dụng khi `rev` ≥ `rtRev`; `always` (usageEvents, số liệu cân) luôn áp dụng. Đóng lô khi xác minh mang `rev` = rev của node vừa gỡ + 1 (bền trên Firestore) nên lượt đóng chậm không đè lô dựng lại.
Giới hạn còn lại: `rev` khởi tạo từ giờ×1000 (chưa là bộ đếm bền tuyệt đối — lệch đồng hồ lớn giữa máy tạo node có thể làm đồng bộ bị bỏ qua; app dùng giờ máy chủ E6); chưa có worker tự chạy lại việc `failed`; luồng bán thường chưa dùng việc/thuê (nhưng được dấu huỷ bill bảo vệ).

## Sửa theo bản rà bug lần 11 (v16, 01/10/2026) — `tests/phan_bien_v16.test.js` + `tests/chuoi_bill.test.js` ca 63–64
Không thêm trạng thái/cơ chế mới — chỉ đặt cơ chế sẵn có vào ĐÚNG chỗ dùng chung:
- **Dấu huỷ bill do engine ghi** trong `reverseSalesConsumptionPOS` (POS `delOrderConfirm` và Quản lý `reverseOrder` đều đi qua) — không còn phụ thuộc app gọi.
- **Hoàn do sửa topping** (`reverseIngredient/reversePrep` có `opKey`) của bill đã huỷ thì bỏ qua (hoàn để xoá bill gọi không `opKey` nên không bị chặn). Đọc dấu lỗi → ném.
- **`rev` cấp ngay lúc dựng node lô BTP**: bộ bọc RT gán rev cho node mới (transaction và `set` qua engine). `_ueSyncPrepLot` chỉ ghi số THIẾU rev khi bản sao lô chưa từng có rtRev.
Giới hạn còn lại: kiểm dấu huỷ cho hoàn do sửa topping nằm ngay trước bước hoàn (khe vài ms nếu dấu ghi đúng giữa hai bước); chưa có worker tự chạy lại việc `failed`; `rev` khởi từ giờ×1000.

## Kiểm luồng (v17, 01/10/2026)
- Firebase giả (`tests/lib/fakefb.js`) mặc định chạy **chế độ NGHIÊM**: từ chối như Firebase thật — RT: `undefined`/NaN/Infinity, khoá chứa `. # $ [ ] /`; Firestore: `undefined`. `FAKE_STRICT=0` để tắt; `FAKE_STRICT_LOG=<file>` ghi cả vi phạm bị nuốt trong `catch`.
- Phát hiện khi chạy toàn bộ test ở chế độ nghiêm: thông báo vụ lệch (`dutyAlert`) ghi `businessDate: undefined` → Firestore thật từ chối, cảnh báo mất im lặng. v17: `_st` bỏ khoá undefined (đệ quy object thường; phần tử mảng undefined → null; FieldValue giữ nguyên) + `dutyAlert` lấy ngày kinh doanh hiện tại khi vụ thiếu ngày.
- `tests/chuoi_bill.test.js` có kịch bản **NGÀY BÌNH THƯỜNG** (bán → thêm topping → bán bill 2 → POS xoá bill 1 → Quản lý xoá bill 2 → đổ bỏ BTP → Quản lý chỉnh lô → cân lại xác minh) kiểm sau MỖI bước: tồn NL = Σ tem RT, tồn BTP = Σ lô dương, bản sao lô Firestore = RT.
