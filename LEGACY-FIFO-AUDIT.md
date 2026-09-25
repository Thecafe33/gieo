# LEGACY FIFO AUDIT — V1

> Nguồn: đọc trực tiếp `posgieo.html` (~26.6k dòng) và `quanlygieo.html` (~22.9k dòng) trên `main`, đối chiếu với `BUG-kho-can-updated.md` (24 bug). Mọi khẳng định dưới đây trỏ tới số dòng cụ thể đã đọc — không suy đoán. Mục nào không đủ bằng chứng được đánh dấu **AMBIGUOUS**.
>
> Đây là output bắt buộc của **Phase 0** (`GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` §22 bước A-C) và là căn cứ trực tiếp cho `FIFO-CORE-ARCHITECTURE-V2.md`.

---

# 1. HAI NGUỒN SỰ THẬT SONG SONG (RTDB + Firestore)

- **RTDB** `active_units_gieogieo/{itemId}/{containerId}` — nguồn thật cho unit **đang mở**. Field: `code, itemName, unit, unitBase, capacity, openedAt` (epoch ms). (`posgieo.html:3561-3566`)
- **Firestore** `stock_containers_gieogieo` — nguồn thật cho unit **chưa mở** (`sealed`) và **đã xong** (`finished`/`used_up`), đồng thời giữ **bản sao** `unitBase` của unit đang mở (không đồng bộ mỗi lượt bán, chỉ tại mốc chuyển trạng thái).
- BTP dùng collection song song `prep_batches_gieogieo`, cùng bộ hàm Unit Engine (tham số `coll`).

**Ý nghĩa cho thiết kế mới:** đây chính là nguyên mẫu của "LIVE (RT) + Firestore (gần với compact hơn)" — nhưng legacy KHÔNG có tầng hợp nhất (unified read), mỗi nơi tự quyết định đọc RT hay Firestore case-by-case (ví dụ "unit mồ côi RT" phải tự dò — xem mục 4).

---

# 2. CẤU TRÚC DỮ LIỆU 1 CONTAINER (đầy đủ field quan sát được)

Sinh tại `createContainersForReceipt` (`posgieo.html:5509-5533`):

```text
code, itemId, itemName, unit, trackingMode ('unit'|'batch'|'none'), countUnitName,
baseQty                     # dung tích khai báo lúc sealed
unitBase                    # số dư CÒN LẠI của chính tem — CÓ THỂ ÂM (debt)
status                      # 'sealed' | 'open' | 'finished' | 'used_up'(BTP) | 'lost' | 'voided'
labelPrinted, openShelfLifeHours
receivedAt, receivedBy, receivedByEmployeeId, receiveRefId, businessDate
openedAt, openedBy, openedByEmployeeId, expiresAt
finishedAt, finishedBy, finishedByEmployeeId, finishReason, finishScanned, wasteBase, wasteBasis
needsReview, needsReviewReasons
originalLabelId, labelStatus, labelEvents[]   # {type, timestamp, employeeId, oldLabelId, newLabelId, reason, referenceId}
notEmptyChecks[]             # {at, by, byId, oldUnitBase, newUnitBase, note, weighMethod, weighings}
openedWithOtherOpen, openOverrideReason
openLabelNeeded, openLabelPrinted, openLabelPrintedAt
lostFromStatus, lostAt, lostReportId, lostBy, lostByEmployeeId, foundAt, foundBy, foundByEmployeeId
revertedFinish {batchId, at, by, reason}
_ueRtStale                   # cờ: RT sai lệch (vd kiểm kê BTP ghi Firestore đúng nhưng RT chưa theo kịp)
```

**Quan trọng:** `openedAt` và `receivedAt` là 2 field tách biệt — FIFO order dùng `openedAt` (xem mục 3), không dùng `receivedAt`. Đây là quyết định nghiệp vụ cần XÁC NHẬN LẠI khi thiết kế mới, không mặc định đúng.

---

# 3. THUẬT TOÁN FIFO ALLOCATION — `_ueComputeAllocation` (`posgieo.html:3588-3615`)

1. Sort các unit đang mở theo `openedAt` tăng dần (cũ nhất trước) — **FIFO theo thời điểm MỞ, không phải thời điểm nhận hàng**.
2. Duyệt tuần tự, lấy `min(avail, left)` từ mỗi unit tới khi đủ `qtyNeeded`.
3. **Cơ chế nợ (debt):** nếu duyệt hết mà vẫn thiếu (`left > EPS`), dồn toàn bộ phần thiếu thành **số âm** lên unit mở **gần nhất** (cuối mảng sort). Đây là mở rộng nghiệp vụ ngoài spec gốc — comment code tự thừa nhận.
4. **Hấp thụ nợ khi mở unit mới** — `unitEngineOnOpen` (`posgieo.html:3992-4059`): gom mọi unit `unitBase<0` hiện có trong RT, `totalDebt=Σ|unitBase|`, unit mới `newUnitBase = capacity - totalDebt`, xoá unit nợ cũ khỏi RT, đóng chúng ở Firestore (`finishReason:'fifo_debt_absorbed'`).
5. **Idempotent theo containerId**: nếu containerId đã có trong RT (retry/race 2 máy) → no-op, không ghi đè `unitBase` (dòng 4008-4014).

**Bug #15 (chưa vá):** bước đóng Firestore cho unit nợ cũ (`posgieo.html:4038-4054`) dùng `.catch(console.warn)` — nuốt lỗi, không retry/alert.

**Khuyến nghị kiến trúc mới:** debt hiện là `unitBase` âm ẩn trên chính field số lượng — không phải trạng thái lifecycle tường minh. Thiết kế mới nên có nhánh lifecycle `DEBT`/`ADJUSTED` tường minh (đã có trong `GIEO-SYSTEM-REBUILD-PLAN.md` §6 Unit lifecycle) thay vì suy luận từ dấu âm.

---

# 4. CÔNG THỨC `currentStock` — `_ueRecomputeCurrentStock` (`posgieo.html:3748-3830`)

```text
currentStock = untrackedBase
             + untrackedPendingDelta
             + Σ sealed.baseQty
             + Σ open.unitBase        (RT, hoặc bản sao Firestore nếu unit "mồ côi" RT)
```

- `untrackedBase` — hằng số lịch sử một lần (tồn trước khi bật dán tem), chỉ nguyên liệu, Quản lý chốt tay, **không bao giờ tự trừ**.
- `untrackedPendingDelta` — cộng dồn liên tục (`FieldValue.increment`) cho giao dịch KHÔNG quy về unit nào. **Đây là biến trung tâm gây ra phần lớn bug (#1/#2/#11/#14/#17/#18)** vì việc "khi nào cộng field này" là convention rải rác theo từng hàm, không có helper bắt buộc.
- Có race-fix bằng mốc thời gian bắt đầu đọc RT (`_ueLastRecomputeStart`) và cờ `_ueRtStale` bù cho trường hợp Firestore đã đổi nhưng RT chưa kịp.
- **Chỉ được gọi khi chắc chắn có 1 unit thật vừa bị đụng** — gọi bừa cho item không có unit nào sẽ suy ra 0 và xoá currentStock của item đó (cảnh báo ngay trong comment).

**Phát hiện cấu trúc quan trọng nhất của toàn bộ audit:** `currentStock` là **write path phân tán** — 2 công thức độc lập:
- POS: `applyStockTransactionPOS` (`posgieo.html:13191-13330`) — có `untrackedPendingDelta`, có idempotency qua `txId`.
- QUANLY: `applyStockTransaction` (`quanlygieo.html:4636-4656`) — **KHÔNG có `untrackedPendingDelta`**, không có `txId`, chỉ `current + qty` đọc tươi trong transaction.

Không có Cloud Function hay single writer nào enforce invariant `currentStock = untrackedBase + untrackedPendingDelta + sealed + RT` — đây là root cause cấu trúc của nhóm bug #1/#2/#7/#17/#18.

---

# 5. "HỆ THỐNG TÍNH HẾT" vs "NHÂN VIÊN BÁO HẾT" — XÁC NHẬN: 2 KHÁI NIỆM TÁCH BIỆT

Đây là câu hỏi cốt lõi của `GIEO-SYSTEM-REBUILD-PLAN.md` §6 (System exhaustion vs physical finish). **Xác nhận: code cũ đã tách biệt đúng, bằng 2 luồng dữ liệu và 2 bộ hàm độc lập.**

## 5a. System exhausted — suy diễn thuần túy từ công thức
`refreshFifoAlert()` (`posgieo.html:4166-4181`): quét `stock_containers_gieogieo` status=`open`, lọc `unitBase<=0` → nạp `FIFO_PENDING_CONFIRM`, render cảnh báo. **Không đổi `status`**, tem vẫn `open`.

Xử lý bởi nhân viên qua 2 nhánh:
- `fifoAlertScanNow()` → xác nhận đúng là hết → chuyển sang finish thật (mục 5b).
- `fifoNotEmptyPrompt()/_applyFifoNotEmpty()` (`posgieo.html:4245-4405`) → phản bác "chưa hết", cân lại, **ghi đè tuyệt đối `unitBase`** = số đo được (không phải cộng/trừ delta), đặt `needsReview:true`, đẩy `notEmptyChecks[]`, ghi 1 dòng `ADJUSTMENT` audit. Tem vẫn `open`.

## 5b. Physical finish — hành động chủ động, độc lập với công thức
`submitFinishContainer()` (`posgieo.html:5007-5050`) → `unitEngineFinishOpenUnit()` (`posgieo.html:4066-4157`): **KHÔNG đọc `unitBase<=0`/`FIFO_PENDING_CONFIRM`** để quyết định cho phép — cho phép báo hết BẤT KỲ lúc nào miễn `status==='open'`. Đọc `unitBase` thật từ RT trong 1 transaction, `waste=max(0,finalUnitBase)`, ghi `status:'finished'`, ghi dòng `WASTE` nếu `waste>0`.

**Phát hiện mới (ngoài 24 bug đã biết):** hằng số `FINISH_REVIEW_RATIO=0.25` (dòng 4921, "báo hết khi còn >25% dung tích thì cần Quản lý xem lại") được khai báo nhưng **KHÔNG bao giờ được dùng** — `unitEngineFinishOpenUnit` luôn ghi cứng `needsReview:false` (dòng 4122). Đây là dead code / tính năng đã rơi rụng, cần hỏi lại chủ quán có muốn khôi phục không khi thiết kế mới.

**Kết luận:** giữ nguyên tắc tách biệt 2 khái niệm này khi thiết kế `FIFO-CORE-ARCHITECTURE-V2.md` — đây là điểm đúng hiếm hoi của legacy, không cần sửa nguyên lý, chỉ cần chính thức hóa thành 2 field rõ ràng (`systemExhaustedAt` vs `finishedAt/finishedBy`) đúng như Master Plan đã định.

---

# 6. WEIGHING (CÂN)

- `_wp` state dùng chung cho mọi loại cân (`openWeighPad`, `posgieo.html:9802-9846`).
- **Bug #3 (chưa vá, xác nhận dòng 9813-9815):** `opts.unit` là ảnh chụp đơn vị CŨ lưu trên tem/lô, trong khi điều kiện cho phép cân dùng đơn vị HIỆN TẠI của danh mục → đổi đơn vị g→kg ở Quản lý mà tem cũ còn `unit:'g'` sẽ sai hệ số 1000 lần. `posVesselUnitFactor(unit)||1` — đơn vị lạ âm thầm coi là gam.
- **Bug #4 (chưa vá, dòng 9967-9981):** `wpDone()` gọi `wpCommitCur(true)` (silent) trước khi kiểm tra số dòng — giá trị nhập sai (nhẹ hơn bì) bị nuốt câm lặng, tổng thiếu 1 khay mà không ai biết.
- **Bug #9 (chưa vá, dòng 9270/9322):** `pwWeighMode` lưu ở `khoTxState.pwWeighMode` — biến toàn cục dai dẳng, không gắn theo batch/item.
- **Bug #10 (chưa vá, dòng 9340-9365):** `_pwApplyWeigh` khi kết quả âm vẫn ghi `qty=0` thay vì huỷ bản ghi.
- **Bug #5 (chưa vá, dòng 8901/9234/9265/9273):** `_pwWeighings`/`_pwChoice` chỉ reset khi đổi `#pwItem`, KHÔNG reset khi `wasteSetTarget()` đổi tab (Đổ ly/Huỷ BTP/Hao hụt) — dữ liệu cân cũ dính sang phiếu mới nếu trùng `batchId`.

Tất cả 5 bug cân (#3/#4/#5/#9/#10) **còn nguyên trạng 100%** tại thời điểm audit — không có bug nào đã được vá.

---

# 7. STOCK TRANSACTION / STOCK COUNT / ADJUSTMENT

- **POS** `applyStockTransactionPOS` (`posgieo.html:13191-13330`): đọc tươi trong transaction, có `txId` idempotency (`stock_transactions_gieogieo/{txId}` tồn tại → no-op), `locationStock` theo refill rule. `untrackedPendingDelta` **chỉ** cộng cho `CONSUMPTION`/`WASTE` khi `!deriveFromUnits` (dòng 13313-13315) — bất đối xứng có chủ đích nhưng gây hại (xem mục 10).
- **QUANLY** `applyStockTransaction` (`quanlygieo.html:4636-4656`): **Bug #1 xác nhận** — không có `untrackedPendingDelta`, không có `txId`. Mỗi lần POS recompute sau đó sẽ xoá sạch khoản Quản lý vừa chỉnh.
- **Bug #2 xác nhận** (`submitItemAdjust`, `quanlygieo.html:15093-15119`): `diff = newQty - oldQty` với `oldQty` lấy từ **cache** nạp lúc mở màn, không đọc tươi — POS bán xen giữa lúc đó sẽ làm kết quả sai.
- **Bug #7 xác nhận** (`approveStockCount`, `quanlygieo.html:4679-4696`): `Promise.allSettled(jobs)` rồi ghi `status:'approved'` **vô điều kiện**, kể cả khi có job fail.
- **Bug #13 xác nhận** (`_doSubmitStockCount`, `posgieo.html:12802-12878`): `.add()` sinh id ngẫu nhiên, không idempotency; `_posSubmitBusy=true` đặt **sau** `await` PIN → double-tap vẫn lọt.
- Field `stock_counts_gieogieo.items[i].expectedBase` snapshot tại lúc mở màn kiểm kê (quyết định nghiệp vụ hợp lý, giữ khi rebuild) — không phải bug.

---

# 8. RECEIVING (NHẬP HÀNG)

Luồng cố ý 2 vế (`posgieo.html:19035-19062`): `receiveBase = goodBase + damagedBase` → ghi `RECEIVING(+receiveBase)` rồi `WASTE(-damagedBase)`.

**Bug #11 xác nhận chính xác 100% (root cause đã trace hết):** vế `WASTE` có cộng `untrackedPendingDelta` (âm); vế `RECEIVING` **không match** điều kiện cộng `untrackedPendingDelta` (chỉ áp dụng cho CONSUMPTION/WASTE). Tem chỉ sinh cho `goodBase`. → `damagedBase` không nằm trong sealed/RT, và vế RECEIVING không bù dương → currentStock bị trừ đúp đúng bằng `damagedBase` sau recompute.

**Bug #14 xác nhận** (`createContainersForReceipt`, `posgieo.html:5460-5543`): 3 đường trả `[]` mà không hoàn nguyên currentStock đã cộng — chưa khai quy cách, vượt trần 60 đơn vị, số dư lẻ khi `Math.floor(qtyBase/baseQty)`, hoặc lỗi giữa chừng khi ghi tem thứ i (`break`).

---

# 9. REVERSAL (HỦY/HOÀN ĐƠN)

**POS có semantics rõ ràng: field `reversalCoverage: 'full'|'untracked'`** (`_reverseIngredientConsumptionPOS`, `posgieo.html:18394-18467`):
- Đọc `fifoAllocations` đã lưu trên giao dịch gốc (không tính lại).
- Claim cố định qua `reversal_unit_claims_gieogieo` (compare-and-swap, chống hoàn đúp).
- `unitsTouched = ambiguous || appliedQty>=totalQty-1e-6` → `'full'`, ngược lại phần dư cộng vào `untrackedPendingDelta`, coverage=`'untracked'`.
- `txId` cố định `'reversal_'+referenceId+'_ing_'+itemId` — xoá đơn 2 lần chỉ đọc trúng doc cũ, tự bỏ qua.

**QUANLY — Bug #17 xác nhận, KHÔNG unit-aware** (`qlReverseStockForOrder`, `quanlygieo.html:10633-10670`): chỉ gom `Σ|qty|` từ `stock_transactions_gieogieo` theo `referenceId` rồi cộng thẳng vào `currentStock`, không đụng RT/container/`untrackedPendingDelta`. **Phát hiện bổ sung (ngoài 24 bug):** guard chống hoàn đúp là read-then-write (`txs.some(t=>t.reversal===true)`, dòng 10643-10646) — **không atomic**, khác cơ chế doc-ID cố định trong transaction bên POS. Rủi ro race nếu xoá gần như đồng thời.

---

# 10. LOST / FOUND CONTAINER

- **Báo mất** (`stockCountReportLost`, `posgieo.html:12145-12178`): ghi `stock_lost_reports_gieogieo` (`.add()`, không idempotency), **không tự trừ tồn kho ngay**, container không đổi status.
- **Bug #12 xác nhận bằng grep trực tiếp — CHƯA XÂY, không phải bug logic mà là feature gap thật:** `grep -c "stock_lost_reports_gieogieo" quanlygieo.html` = 0, `grep -c "approveLostReport" quanlygieo.html` = 0. Không có luồng duyệt báo mất bên Quản lý.
- **Bug #16 (hệ quả trực tiếp của #12, xác nhận đúng):** vì container không bao giờ chuyển `status:'lost'` (không ai duyệt), nút "Quét mã tìm lại được" (`stockCountScanFound`, check `status!=='lost'`) không bao giờ chạy được — code chết.
- **Bug #24 xác nhận** (`submitFoundLostContainer`, `posgieo.html:12226-12300`): chuỗi 5 bước (RT restore → container status → ADJUSTMENT → lost report update → employee deduction reversal) không có `foundEventId` xuyên suốt; bước `ADJUSTMENT(+baseQty)` không truyền `txId` → mất ACK có thể cộng đúp.

---

# 11. RECIPE CONSUMPTION KHI BÁN HÀNG — DÙNG UNIT ENGINE NHẤT QUÁN

`applySalesConsumptionPOS()` (`posgieo.html:18085-18200`) là điểm vào duy nhất khi thanh toán: `computeConsumptionForOrder()` tính theo công thức → `unitEngineAllocateConsumption()` (FIFO thật) TRƯỚC khi ghi sổ, rollback qua `_ueClaimedReverseAllocations` nếu ghi sổ lỗi. Áp dụng đồng nhất cho nguyên liệu thô lẫn BTP. **Không có đường tắt nào bỏ qua Unit Engine cho đường bán hàng chính.**

3 đường phụ thiếu lớp bảo vệ so với đường chính:
- **Bug #21** (`_wastePrepQtyPOS`, `posgieo.html:9072-9102`): không có catch/rollback nếu ghi sổ thất bại sau khi đã allocate.
- **Bug #22** (`_startPrepBatchImpl`, `posgieo.html:10605-10649`): `batchRef.id` ngẫu nhiên mỗi lần gọi → retry toàn bộ có thể trừ nguyên liệu lần 2.
- **Bug #23** (`applyAddonConsumptionPOS`, `posgieo.html:22920-22982`): nhánh tăng add-on không truyền `txId`.

---

# 12. QUANLY VI PHẠM NGUYÊN TẮC "KHÔNG SỞ HỮU FIFO/INVENTORY ENGINE RIÊNG"

Xác nhận **CÓ vi phạm rõ ràng** (đối chiếu `GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` §19 — nhận định trong handoff là đúng nhưng còn nhẹ hơn thực tế). Danh sách cụ thể cần loại bỏ/chuyển thành command khi rebuild:

| Hàm | Dòng | Vi phạm |
|---|---|---|
| `applyStockTransaction` | `quanlygieo.html:4636-4656` | Ghi trực tiếp `currentStock` bằng transaction riêng, thiếu `untrackedPendingDelta` + `txId` (Bug #1) |
| `applyStockTransfer` | `quanlygieo.html:4802-4834` | Tự ghi `locationStock`, độc lập với `currentStock` tổng |
| `submitPrepAdjust` | `quanlygieo.html:18108-18218` | **Tự cài 1 thuật toán FIFO cho BTP** (phân bổ diff vào lô cũ nhất trước) — trùng lặp hoàn toàn trách nhiệm FIFO Engine |
| `recalcPrepCostsUsingItem` | `quanlygieo.html:15713-15732` | Tự ghi `costPerUnit` lên `prep_items_gieogieo` — field mà POS cũng đọc, QUANLY là "owner" ngoài ý muốn |
| `ctnDaoHaoHutMa` | `quanlygieo.html:4320-4364` | Ghi trực tiếp đổi `type` giao dịch trên `stock_transactions_gieogieo` |
| `xoaTonLichSu` | `quanlygieo.html:~4290-4306` | Gọi thẳng `applyStockTransaction({type:'ADJUSTMENT'})` |

Phần ĐÚNG nguyên tắc, giữ lại được: đọc đơn hàng/menu (chỉ đọc RTDB), lịch sử giá nguyên liệu (`PRICE_HISTORY`, append-only), workflow duyệt kiểm kho/chi phí (rõ ràng, có audit trail), các hàm đối chiếu/báo cáo thuần (`thDoiChieu`, `computeInventoryHealth`) — chỉ đọc ledger có sẵn.

---

# 13. RECIPE / COST — KHÔNG CÓ VERSIONING, VI PHẠM INVARIANT #13/#14

- `saveRecipe()` (`quanlygieo.html:4903`) dùng `.set()` **ghi đè toàn bộ doc**, không `effectiveFrom`, không tạo bản ghi mới.
- Giá nguyên liệu (`itemCostOn`) CÓ lịch sử thật (`PRICE_HISTORY`, append-only, `recordItemPriceChange` dòng 2601-2621) — đây là mô hình đúng, nên nhân rộng.
- Nhưng `prepCostOn`/`computeUnitCogsFromRecipe` luôn đọc **công thức/yield HIỆN TẠI**, chỉ giá nguyên liệu theo đúng `dateKey`.
- **Bằng chứng dứt khoát của vi phạm:** `invalidateSalesCache()`/`clearSalesCache()` (`quanlygieo.html:2175-2207`) **xoá toàn bộ** `daily_sales_cache_gieogieo` (mọi ngày, kể cả đã chốt sổ) mỗi khi đổi recipe/giá/bao bì — buộc COGS của MỌI ngày trong quá khứ tính lại bằng công thức mới ở lần load kế tiếp. Comment tự thừa nhận điều này (dòng 2190-2193).

**Đây là điểm vi phạm nghiêm trọng nhất đối với invariant #13 ("Recipe lịch sử phải immutable/versioned") và #14 ("Cost lịch sử phải có CostBasis") — phải sửa tận gốc trong `FIFO-CORE-ARCHITECTURE-V2.md`, không thể giữ nguyên hành vi này.**

---

# 14. PROTECTED INFRASTRUCTURE — XÁC NHẬN CHÍNH XÁC (đính chính so với brief gốc)

- Bridge thật là **`window.AndroidPrinter`** và **`window.AndroidScanner`** — grep toàn file **không tìm thấy** `window.Android` trần như brief gốc nhắc tới. Cần cập nhật lại tên trong `protected-adapters/native-bridge-adapter.ts`.
  - `AndroidPrinter`: `connectBillPrinterBluetooth`, `isBillPrinterAvailable`, `printBillRawBytes`, `printRawBytes`, `connectPrinter`, `startLanDiscovery`, `setTemKeepAlive`, `getTemStatus`, `listBluetoothPrinters`...
  - `AndroidScanner`: `scan(id)`, `getScannerVersion()`.
- Bank payment: `genBankOrderId()` (`posgieo.html:20304-20311`, format `'GG'+DD+MM+HH+mm+ss`), VietQR qua `img.vietqr.io` (account cố định Cake), xác nhận qua RTDB `bank_confirmations/{orderId}` — POS chỉ **đọc rồi remove()**, KHÔNG ghi vào path này. **AMBIGUOUS:** không tìm thấy nơi ghi `bank_confirmations` trong 2 file — xác nhận đây là webhook/Cloud Function bên ngoài phạm vi audit, đúng như handoff đã giả định.

---

# 15. BẢNG ĐỐI CHIẾU 24 BUG ↔ CODE THẬT (xác nhận trạng thái vá tại thời điểm audit)

| Bug | Dòng xác nhận | Trạng thái |
|---|---|---|
| #1 Management adjustment bị Unit Engine overwrite | `quanlygieo.html:4636-4656` | CHƯA vá |
| #2 Stock adjustment dùng cache → race | `quanlygieo.html:15093-15119` | CHƯA vá |
| #3 Weighing unit/factor sai | `posgieo.html:9813-9815` | CHƯA vá |
| #4 `wpDone()` commit weighing invalid | `posgieo.html:9967-9981` | CHƯA vá |
| #5 Stale `_pwWeighings`/`_pwChoice` | `posgieo.html:8901,9234,9265,9273` | CHƯA vá |
| #6 FIFO not-empty double tap race | `posgieo.html:4313-4337` | CHƯA vá |
| #7 Stock count approval dù có line fail | `quanlygieo.html:4679-4696` | CHƯA vá |
| #9 `pwWeighMode` global persistence | `posgieo.html:9270,9322` | CHƯA vá |
| #10 `_pwApplyWeigh` zero record | `posgieo.html:9340-9365` | CHƯA vá |
| #11 Damaged receiving double subtract | `posgieo.html:13191-13315,19035-19144` | CHƯA vá |
| #12 Lost-item approval flow | grep = 0 kết quả trong quanlygieo.html | **CHƯA XÂY (feature gap thật, không phải bug)** |
| #13 Stock count duplicate docs | `posgieo.html:12180-12194,12864` | CHƯA vá |
| #14 Receiving quantity biến mất sau recompute | `posgieo.html:5460-5543` | CHƯA vá |
| #15 FIFO debt absorption / close error | `posgieo.html:3992-4059` | CHƯA vá |
| #16 Found-lost dead path | hệ quả trực tiếp của #12 | Chờ #12 |
| #17 Bill reversal không unit/untracked aware | `quanlygieo.html:10633-10670` | CHƯA vá + phát hiện thêm: guard chống-đúp không atomic |
| #18 BTP adjustment bị overwrite | `quanlygieo.html:18108-18189` | CHƯA vá |
| #21 BTP waste allocation thiếu idempotency/rollback | `posgieo.html:9072-9102` | CHƯA vá |
| #22 Start prep batch lost-ACK/retry | `posgieo.html:10605-10649` | CHƯA vá |
| #23 Add-on consumption tăng thiếu stable txId | `posgieo.html:22958-22967` | CHƯA vá |
| #24 Found-lost thiếu end-to-end idempotency | `posgieo.html:12226-12300` | CHƯA vá |

**Không có bug nào trong danh sách đã được vá tại thời điểm audit (2026-09-15).**

---

# 16. KẾT LUẬN — 4 LỖ HỔNG HỆ THỐNG CẦN FIFO CORE MỚI GIẢI QUYẾT TẬN GỐC

Không patch từng bug. `FIFO-CORE-ARCHITECTURE-V2.md` phải thiết kế để 4 nhóm này **không thể tái diễn theo cấu trúc**, không phải được vá từng điểm:

1. **`untrackedPendingDelta` là convention rải rác, dễ quên** → nguồn của bug #1/#11/#14/#17/#18. Phải trở thành 1 helper bắt buộc, không thể bỏ qua.
2. **Idempotency không đồng nhất** — đường bán hàng chính có đủ (txId + pre-check + rollback), 6 đường phụ thiếu 1+ lớp (#6/#13/#21/#22/#23/#24). Phải chuẩn hóa 1 pattern claim+txId dùng cho MỌI mutation FIFO, không để từng hàm tự làm.
3. **2 app ghi trực tiếp vào cùng dữ liệu kho bằng 2 công thức độc lập** (POS vs QUANLY) — root cause cấu trúc của #1/#2/#7/#17/#18. Phải có 1 write-path/FIFO Engine duy nhất; QUANLY chỉ gọi command.
4. **Recipe/cost không versioned, bị tính lại theo hiện tại** — vi phạm invariant #13/#14 rõ ràng nhất tìm được trong toàn bộ audit (`invalidateSalesCache` xoá sạch lịch sử COGS khi đổi công thức). Phải có RecipeVersion + CostBasis bất biến ngay từ Phase 5.

Các điểm ĐÚNG cần giữ nguyên khi rebuild (không phải viết lại từ đầu, chỉ chính thức hóa): mô hình 2-tier container, FIFO theo `openedAt`, pattern "allocate trước - ghi sổ sau - rollback nếu lỗi" của đường bán hàng chính, `reversalCoverage: full|untracked`, receiving good+damaged 2 vế, `notEmptyChecks[]` audit trail, tách biệt system-exhausted/physical-finish.
