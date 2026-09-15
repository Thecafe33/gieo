# FIFO CORE ARCHITECTURE — V2

> Căn cứ: `LEGACY-FIFO-AUDIT.md` (đọc trực tiếp `posgieo.html`/`quanlygieo.html`, đối chiếu 24 bug), `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md`, `LEGACY-FIREBASE-PATH-MAP-V1.md`. Đây là output bắt buộc **Phase 0 bước E** (`GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` §22) và là bản thiết kế chi tiết nhất cho `packages/fifo-core` (`GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md`).
>
> Không copy kiến trúc cũ. Mọi quyết định dưới đây trả lời: **(a) legacy làm gì, (b) đúng hay sai, (c) thiết kế mới xử lý thế nào, (d) map vào bug nào.**

---

# 0. NGUYÊN TẮC KẾ THỪA — GIỮ NGUYÊN VÌ ĐÃ ĐÚNG

Audit xác nhận 6 quyết định nghiệp vụ của legacy là ĐÚNG, không phải "nợ kỹ thuật cần dọn" — giữ nguyên nguyên lý, chỉ chính thức hóa thành contract tường minh:

1. **Mô hình 2-tier**: unit `sealed` (chưa mở, không cần FIFO) vs `open` (đang tiêu thụ, cần FIFO). Container là đơn vị tối thiểu của Unit.
2. **FIFO theo `openedAt`**, không phải `receivedAt` — unit mở trước dùng trước, bất kể nhận hàng lúc nào.
3. **Pattern "allocate trước — ghi sổ sau — rollback nếu lỗi"** của đường bán hàng chính (`applySalesConsumptionPOS`) — đây là pattern ĐÚNG, cần tổng quát hóa cho MỌI đường tiêu thụ (hiện chỉ đường chính có đủ, 3 đường phụ thiếu — xem §7).
4. **`reversalCoverage: 'full' | 'untracked'`** — phân loại hoàn trả unit-aware vs untracked là đúng semantics, giữ nguyên làm field chính thức.
5. **Receiving good+damaged 2 vế** (`RECEIVING(+total)` rồi `WASTE(-damaged)`) — đúng về mặt kế toán (giữ 2 vết đối chiếu NCC), chỉ sai ở việc bù trừ `untrackedPendingDelta` không đối xứng (Bug #11) — xem §5.
6. **Tách biệt system-exhausted (suy diễn) vs physical-finish (xác nhận chủ động)** — đây là điểm thiết kế tinh tế nhất của legacy, giữ nguyên 100%, chỉ chính thức hóa thành 2 field độc lập.

---

# 1. UNIT — DATA MODEL CANONICAL

Map từ field legacy (`LEGACY-FIFO-AUDIT.md` §2) sang field canonical:

```ts
interface Unit {
  unitId: UnitId;                 // = legacy container.code, nhưng tách khỏi identity nội bộ (invariant #4)
  itemId: ItemId;
  storeId: StoreId;
  itemKind: 'raw' | 'prep';        // legacy: 2 collection riêng (stock_containers vs prep_batches) → hợp nhất 1 model

  // Nguồn gốc
  receiptId?: ReceiptId;           // legacy: receiveRefId
  supplierId?: SupplierId;
  receivedAt?: Timestamp;
  receivedBy?: ActorId;

  // Số lượng — TÁCH RÕ initial vs remaining (legacy gộp lẫn baseQty/unitBase)
  initialQty: number;              // legacy: baseQty (dung tích khai báo lúc sealed) — BẤT BIẾN sau khi set
  remainingQty: number;            // legacy: unitBase — CÓ THỂ ÂM khi debt (xem §4)
  costBasis: CostBasis;            // legacy: KHÔNG có trên container — phải bổ sung (đọc PRICE_HISTORY tại receivedAt)

  // Lifecycle — xem §2
  status: UnitLifecycleStatus;
  openedAt?: Timestamp;
  openedBy?: ActorId;
  systemExhaustedAt?: Timestamp;   // MỚI — legacy chỉ có biến tạm FIFO_PENDING_CONFIRM, không lưu trên Unit
  finishedAt?: Timestamp;          // legacy: finishedAt/finishedBy — giữ nguyên khái niệm
  finishedBy?: ActorId;
  finishReason?: string;

  // Nhánh trạng thái
  debt?: DebtInfo;                 // MỚI, thay cho remainingQty âm ẩn — xem §4
  lostAt?: Timestamp; lostBy?: ActorId; lostReportId?: string;
  foundAt?: Timestamp; foundBy?: ActorId;

  // Audit / review — giữ nguyên khái niệm legacy
  needsReview: boolean;
  needsReviewReasons?: string[];
  physicalReconciliations: PhysicalReconciliationRecord[]; // legacy: notEmptyChecks[]

  operationId: OperationId;        // MỚI — mọi thay đổi Unit phải trace về operationId gây ra nó (invariant #7)
}
```

**Quyết định thiết kế mới (không có ở legacy, bắt buộc bổ sung):**
- `costBasis` gắn trực tiếp trên Unit tại thời điểm nhận hàng — legacy KHÔNG lưu giá trên container, phải tính lại qua `PRICE_HISTORY` mỗi lần cần (nguồn gốc vi phạm invariant #14 lan sang cả BTP/recipe, xem `LEGACY-FIFO-AUDIT.md` §13). Việc gắn `costBasis` ngay lúc tạo Unit chặn đứng lớp vi phạm này tận gốc.
- `initialQty` bất biến, tách khỏi `remainingQty` — legacy dùng `baseQty`/`unitBase` nhưng không có ràng buộc rõ "initial không bao giờ đổi", dẫn tới việc `_applyFifoNotEmpty` ghi đè trực tiếp mà không có invariant nào chặn ghi nhầm vào `baseQty`.

---

# 2. UNIT LIFECYCLE — STATE MACHINE

Map trực tiếp từ `status` legacy (`sealed|open|finished|used_up|lost|voided`) sang lifecycle đầy đủ của `GIEO-SYSTEM-REBUILD-PLAN.md` §6:

```text
RECEIVED → SEALED → OPEN → CONSUMING → SYSTEM_EXHAUSTED → PHYSICALLY_FINISHED → COMPACTABLE
                                              │
                                    (nhánh, không phải state kế tiếp bắt buộc)
                        ┌──────────┬──────────┼──────────┬──────────┐
                        ↓          ↓          ↓          ↓          ↓
                      DEBT     LOST→FOUND   WASTE    REVERSED   ADJUSTED
```

| Legacy status | Canonical state | Ghi chú |
|---|---|---|
| (chưa nhận hàng) | `RECEIVED` | Mới — legacy tạo container thẳng ở `sealed`, không có state trung gian ghi nhận PO chưa thành tem |
| `sealed` | `SEALED` | Giữ nguyên |
| `open` | `OPEN` → `CONSUMING` | Legacy gộp 2 state này làm 1; tách ra để phân biệt "vừa mở, chưa tiêu thụ" vs "đang có allocation" — hỗ trợ debug tốt hơn, không đổi hành vi nghiệp vụ |
| (suy diễn, không lưu trạng thái) | `SYSTEM_EXHAUSTED` | **MỚI — điểm cải tiến quan trọng nhất.** Legacy chỉ suy diễn tạm thời qua `refreshFifoAlert()` mỗi lần load, không ghi `systemExhaustedAt` vào Unit → không thể trace "hệ thống phát hiện hết lúc nào" trong lịch sử. Ghi lại field này (không đổi `status`) để giữ đúng nguyên tắc "suy diễn, không phải hành động" nhưng vẫn có audit trail. |
| `finished`/`used_up` | `PHYSICALLY_FINISHED` | Giữ nguyên khái niệm `finishedAt/finishedBy` |
| (không có — chỉ xoá khỏi RT) | `COMPACTABLE` | Mới, xem `FIFO-COMPACTION-CONTRACT-V1.md` (sẽ viết riêng) |
| `lost` | nhánh `LOST` | Giữ, nhưng bổ sung luồng approve còn thiếu (Bug #12, xem §8) |
| (không tường minh — `remainingQty<0`) | nhánh `DEBT` | **MỚI**, xem §4 |
| — | nhánh `WASTE` | Không phải state riêng ở legacy — chính thức hóa thành sự kiện gắn `wasteQty`/`wasteBasis` khi finish, giữ đúng công thức `waste=max(0,finalRemainingQty)` |
| `voided` | nhánh `ADJUSTED`/hủy | |

**Quyết định giữ nguyên 100% từ legacy (§0.6):** `systemExhaustedAt` và `finishedAt/finishedBy` là 2 field độc lập, không suy ra nhau. `FinishUnit` (đúng như `unitEngineFinishOpenUnit` legacy) **không đọc** `systemExhaustedAt` để quyết định cho phép — nhân viên có thể báo hết bất kỳ lúc nào miễn `status` hợp lệ.

**Tính năng cần quyết định lại (dead code ở legacy — `LEGACY-FIFO-AUDIT.md` §5b):** `FINISH_REVIEW_RATIO=0.25` từng dự định gắn `needsReview` khi báo hết lúc còn >25% dung tích, nhưng chưa bao giờ được nối vào code. Đưa vào **Open Question** ở §11 — không tự ý khôi phục, cần chủ quán xác nhận có còn cần không.

---

# 3. FIFO ENGINE — 10 RESPONSIBILITY (map trực tiếp `_ueComputeAllocation`/`unitEngine*`)

## 3.1 `SelectEligibleUnit`
Giữ nguyên thuật toán `_ueComputeAllocation`: sort unit `OPEN`/`CONSUMING` theo `openedAt` tăng dần. **Open question:** giữ `openedAt` hay đổi sang `receivedAt`? → giữ nguyên `openedAt`, vì đó là hành vi production đã chạy nhiều năm, đổi sẽ thay đổi kết quả FIFO cho dữ liệu đang tồn — chỉ đổi nếu chủ quán xác nhận muốn khác.

## 3.2 `AllocateConsumption`
Giữ pattern `min(avail, left)` tuần tự qua các unit. **Thay đổi bắt buộc so với legacy:** MỌI lời gọi phải đi qua 1 `IdempotencyGuard` dùng chung (xem §7) — không còn cảnh 3/6 đường tiêu thụ thiếu txId như legacy.

## 3.3 `HandleDebt`
Xem §4 — chính thức hóa debt thành nhánh lifecycle thay vì số âm ẩn.

## 3.4 `OpenUnit`
Giữ `unitEngineOnOpen`: hấp thụ debt từ mọi unit `DEBT` hiện có vào unit mới (`newRemainingQty = capacity - totalDebt`). **Fix bắt buộc (Bug #15):** bước đóng unit nợ cũ không được `.catch(console.warn)` nuốt lỗi — phải retry có giới hạn rồi chuyển `FAILED_MANUAL_REVIEW` + ghi `alerts` nếu vẫn lỗi, đúng invariant #11 ("không swallow errors").

## 3.5 `FinishUnit`
Giữ `waste = max(0, finalRemainingQty)`, ghi `WASTE` ledger nếu >0, toast cảnh báo debt nếu <0 (không tạo WASTE — nợ không phải hao hụt, đúng như legacy). Đọc `remainingQty` TƯƠI trong transaction ngay tại thời điểm finish (đúng race-fix legacy đã có).

## 3.6 `SystemExhaustion`
Giữ nguyên: suy diễn `remainingQty<=0` trên unit `OPEN`, **chỉ ghi `systemExhaustedAt`**, không đổi `status`. Chạy như 1 projection/query định kỳ hoặc on-write trigger, không phải mutation command.

## 3.7 `PhysicalReconciliation`
Giữ nguyên tuyệt đối nguyên tắc `_applyFifoNotEmpty`: đọc fresh state → `delta = actualQty - remainingQty` → ghi `remainingQty = actualQty` (absolute overwrite, KHÔNG cộng/trừ delta cache) → append vào `physicalReconciliations[]` (= legacy `notEmptyChecks[]`) → ghi ledger `ADJUSTMENT` riêng để audit. Đúng thứ tự legacy đã làm (RT trước, Firestore giữ lịch sử, recompute projection, rồi mới ghi ledger — dùng `resultingStock` MỚI để tránh cộng đúp).

## 3.8 `ReverseAllocation`
Giữ `reversalCoverage: 'full'|'untracked'` + claim compare-and-swap + `txId` cố định `'reversal_'+referenceId+'_'+domain+'_'+itemId`. **Fix bắt buộc (Bug #17):** đây PHẢI là điểm gọi DUY NHẤT cho reversal — QUANLY không còn hàm `qlReverseStockForOrder` riêng cộng thẳng `currentStock`, mà gọi `ReverseOrder` command (packages/commands/sales) trỏ vào chính engine này. Loại bỏ hoàn toàn đường tắt "cộng bừa vào tổng".

## 3.9 `RebuildUnitState`
**Mới hoàn toàn — không có ở legacy.** Cần cho:
- Correction sau compaction (Master Plan §15.4: snapshot v1 → correction → rebuild → v2).
- Khôi phục khi `_ueRtStale` (RT sai lệch so với Firestore) — legacy chỉ dò/vá từng chỗ, engine mới cần 1 hàm rebuild tường minh: đọc toàn bộ ledger của 1 Unit, replay theo thứ tự operationId, tái tạo `remainingQty` — dùng làm nguồn xác thực khi phát hiện lệch, và làm cơ sở cho snapshot verifier (`packages/compaction/snapshot-verifier.ts`).

## 3.10 Ledger & Projection
- `StockLedgerEntry` thay thế cả `stock_transactions_gieogieo` (POS) lẫn `applyStockTransaction` (QUANLY) — **1 write path duy nhất**. Field bắt buộc: `operationId, domain('raw'|'prep'), type, itemId, unitId?, qtyDelta, untrackedPendingDelta, businessDate, actorId`.
- `currentStock` (projection) = `untrackedBase + untrackedPendingDelta + Σsealed.initialQty + Σopen.remainingQty` — **chính thức hóa thành 1 hàm thuần duy nhất** trong `packages/fifo-core/src/projection/current-stock-projection.ts`, không cho phép bất kỳ package nào tính lại công thức này theo cách riêng (đây là fix trực tiếp cho lỗ hổng cấu trúc #3 ở §7 dưới).

---

# 4. DEBT — FIRST-CLASS, KHÔNG PHẢI SỐ ÂM ẨN

Legacy biểu diễn nợ FIFO bằng `unitBase` âm trên chính field số lượng — hoạt động đúng nhưng **không tường minh** (không tra được "unit này đang nợ" mà không kiểm tra dấu). Thiết kế mới:

```ts
interface DebtInfo {
  amount: number;               // luôn dương — số lượng đang nợ
  incurredAt: Timestamp;
  incurredByOperationId: OperationId;
  absorbedByUnitId?: UnitId;    // set khi 1 unit mới hấp thụ nợ này (unitEngineOnOpen)
  absorbedAt?: Timestamp;
}
```

`remainingQty` vẫn có thể numeric âm (giữ tương thích công thức toán học `_ueComputeAllocation`), nhưng `debt` field cho phép query trực tiếp "unit nào đang nợ" mà không cần suy diễn từ dấu — phục vụ cả FIFO Alert UI lẫn compaction eligibility check (Unit có `debt.absorbedByUnitId == null` thì KHÔNG được coi COMPACTABLE).

---

# 5. `untrackedPendingDelta` — TỪ CONVENTION RẢI RÁC SANG HELPER BẮT BUỘC

Đây là root cause lớn nhất trong toàn bộ audit (bug #1/#11/#14/#17/#18 — xem `LEGACY-FIFO-AUDIT.md` §16 mục 1). Legacy: mỗi hàm tự quyết định "có cộng `untrackedPendingDelta` hay không" (`posgieo.html:13313-13315` chỉ match `CONSUMPTION`/`WASTE` khi `!deriveFromUnits` — RECEIVING không match, gây Bug #11).

**Thiết kế mới:** `StockLedgerEntry` không nhận `untrackedPendingDelta` như 1 tham số optional — nó được **tính bắt buộc** bởi chính pipeline ghi ledger:

```text
ghi ledger entry
  → nếu entry có unitId cụ thể (deriveFromUnits) → untrackedPendingDelta = 0 (tường minh)
  → nếu entry KHÔNG có unitId (không đủ Unit đại diện) → untrackedPendingDelta = qtyDelta (LUÔN LUÔN, mọi type)
```

Không còn danh sách "chỉ CONSUMPTION/WASTE mới cộng" — mọi `type` (kể cả RECEIVING, ADJUSTMENT) đều qua đúng 1 quy tắc, chặn đứng khả năng 1 type mới trong tương lai quên cộng field này.

---

# 6. RECEIVING — GIỮ 2 VẾ, SỬA BẤT ĐỐI XỨNG

Giữ nguyên contract kế toán tốt của legacy (`RECEIVING(+goodBase+damagedBase)` rồi `WASTE(-damagedBase)`) nhưng áp dụng đúng quy tắc §5: nếu `damagedBase` không sinh đủ Unit đại diện, vế RECEIVING cũng phải cộng `untrackedPendingDelta` tương ứng để 2 vế đối xứng — Bug #11 tự động biến mất vì không còn ngoại lệ theo `type`.

Với `createContainersForReceipt` không sinh đủ tem (Bug #14 — vượt trần, số dư lẻ do `Math.floor`, lỗi giữa chừng): mọi phần dư không sinh được Unit phải chảy qua đúng cơ chế `untrackedPendingDelta` ở trên thay vì "biến mất" — không cần patch riêng từng nhánh lỗi như legacy, vì đây chỉ còn là 1 trường hợp của quy tắc chung §5.

---

# 7. IDEMPOTENCY — CHUẨN HÓA 1 PATTERN CHO MỌI MUTATION

Audit cho thấy đường bán hàng chính (`applySalesConsumptionPOS`) có đủ 3 lớp bảo vệ, nhưng 6 đường khác thiếu 1+ lớp:

| Lớp bảo vệ | Có ở đường chính | Thiếu ở |
|---|---|---|
| `txId` cố định theo (referenceId+domain+itemId) | ✅ | #6 not-empty (busy-lock đặt sau await), #13 stock count (`.add()` random id), #21 BTP waste, #22 start prep batch, #23 add-on tăng, #24 found-lost |
| Rollback nếu ghi sổ thất bại sau khi allocate | ✅ (`_ueClaimedReverseAllocations`) | #21 (không catch/rollback) |
| Claim compare-and-swap chống double-apply | ✅ (`reversal_unit_claims_gieogieo`) | mọi command khác không dùng claim collection tương tự |

**Thiết kế mới:** `packages/commands/src/pipeline.ts` bắt buộc mọi command đi qua đúng 1 `IdempotencyGuard`:

```text
1. txId = deterministicId(domain, referenceId, itemId)   // KHÔNG BAO GIỜ .add()/random cho mutation nghiệp vụ
2. đọc operations/{txId} — nếu status=COMPLETED → return cached result (no-op)
3. ghi operations/{txId} status=PENDING (claim)
4. thực thi mutation (FIFO Engine)
5a. thành công → ghi ledger, operations/{txId} status=COMPLETED
5b. thất bại → nếu đã allocate ở bước 4, gọi ReverseAllocation ngay trong cùng command (không để rollback là bước riêng dễ quên) → operations/{txId} status=FAILED_RETRYABLE
```

Không còn package/command nào được tự chế lớp idempotency riêng như legacy (mỗi hàm 1 kiểu) — `commands/pipeline.ts` là nơi DUY NHẤT implement bước 1-5.

---

# 8. LOST/FOUND — BỔ SUNG PHẦN CHƯA XÂY (Bug #12/#16)

Bug #12 xác nhận bằng grep trực tiếp là **feature gap thật** (0 kết quả `approveLostReport` trong `quanlygieo.html`), không phải lỗi logic. Thiết kế mới bắt buộc có:

```text
ReportLostContainer (POS)  →  lostReports/{id} status=PENDING_REVIEW
                                        ↓
ApproveLostContainer (QUANLY, command mới, packages/commands/approval)
                                        ↓
                         Unit.status → nhánh LOST (đã có ở legacy nhưng
                         không bao giờ đạt tới vì thiếu bước duyệt này)
                                        ↓
                    RestoreFoundContainer (đã có logic đúng ở legacy —
                    submitFoundLostContainer — chỉ cần Unit thật sự vào
                    được state LOST thì logic restore sẽ tự chạy đúng)
```

Với `RestoreFoundContainer`, giữ nguyên toàn bộ logic 5 bước của `submitFoundLostContainer` (unit "mới nguyên" không suy luận lại phần đã dùng trước khi mất — quyết định nghiệp vụ hợp lý), chỉ thêm `operationId` xuyên suốt 5 bước (fix Bug #24) thay vì để bước ADJUSTMENT không có `txId`.

---

# 9. QUANLY — LOẠI BỎ FIFO ENGINE SONG SONG

Đối chiếu `LEGACY-FIFO-AUDIT.md` §12, map 1-1 hàm cũ → command mới, KHÔNG giữ bất kỳ hàm nào ghi trực tiếp Firestore từ phía QUANLY:

| Hàm legacy (QUANLY) | Command mới (packages/commands) | Ghi chú |
|---|---|---|
| `applyStockTransaction` | `commands/correction/AdjustInventory` | Đi qua FIFO Engine, có `untrackedPendingDelta` đúng quy tắc §5 |
| `applyStockTransfer` | `commands/inventory/TransferStock` | |
| `submitPrepAdjust` | `commands/correction/AdjustPrepStock` | **Loại bỏ hoàn toàn** thuật toán FIFO tự cài (phân bổ lô cũ nhất trước) — logic này chuyển vào `packages/fifo-core/engine/*`, dùng lại nguyên `SelectEligibleUnit`/`AllocateConsumption` đã có, không viết lại lần 2 |
| `recalcPrepCostsUsingItem` | Không còn cần thiết dưới dạng ghi field | `costPerUnit` trở thành **derived/projection** đọc qua `read-layer`, không ai "ghi đè" nó nữa (đúng nguyên tắc projection không phải physical truth) |
| `ctnDaoHaoHutMa` | `commands/correction/ReclassifyLedgerEntry` (mới, tường minh hóa) | Giữ đúng audit trail `reclassifiedFrom/At/By/Reason` đã có ở legacy |
| `xoaTonLichSu` | `commands/correction/AdjustInventory` (cùng command trên, `reason:'historical_correction'`) | |
| `qlReverseStockForOrder` | `commands/sales/ReverseOrder` (dùng chung với POS) | **Không còn 2 implementation reversal khác nhau** — xem §3.8 |

---

# 10. RECIPE/COST VERSIONING — SỬA VI PHẠM NGHIÊM TRỌNG NHẤT (§13 audit)

```ts
interface RecipeVersion {
  recipeId: RecipeId;
  versionId: string;
  effectiveFrom: Timestamp;
  effectiveTo?: Timestamp;       // null = đang hiệu lực
  storeApplicability: StoreId[] | 'ALL';
  rows: RecipeRow[];             // {refType:'item'|'prep'|'topping', refId, qty} — giữ nguyên cấu trúc legacy
  createdBy: ActorId;
}
```

- `saveRecipe()` KHÔNG còn `.set()` ghi đè — mọi lần sửa tạo `RecipeVersion` mới với `effectiveFrom = now`, đóng `effectiveTo` của version trước.
- `computeUnitCogsFromRecipe(itemId, size, dateKey)` PHẢI resolve `RecipeVersion` có hiệu lực tại `dateKey`, không phải bản mới nhất — đây là điểm sửa trực tiếp hành vi `invalidateSalesCache()` đã audit (xoá sạch COGS lịch sử khi đổi recipe).
- `daily_sales_cache_gieogieo` (cache tính-lại-được, giữ nguyên vai trò theo `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §2.1) vẫn được invalidate khi có version mới, nhưng khi tính lại, nó PHẢI dùng đúng `RecipeVersion` lịch sử của từng ngày — không phải version hiện tại như legacy. Kết quả tính lại do đó **giống hệt** kết quả cũ (vì recipe lịch sử bất biến), khác hẳn hành vi legacy (kết quả đổi theo recipe mới).
- Giữ nguyên mô hình `price_history_gieogieo` (append-only) làm `CostBasis` — đây là phần ĐÚNG duy nhất, chỉ mở rộng sang recipe.

---

# 11. OPEN QUESTIONS — CẦN CHỦ QUÁN/NGƯỜI DÙNG XÁC NHẬN TRƯỚC KHI IMPLEMENT

1. **FIFO order theo `openedAt` hay `receivedAt`?** → Đề xuất giữ `openedAt` (hành vi production đã chạy), nhưng cần xác nhận không có kỳ vọng nghiệp vụ nào khác.
2. **`FINISH_REVIEW_RATIO=0.25` (báo hết khi còn nhiều)** — dead code ở legacy, không rõ có còn nhu cầu. Không tự ý khôi phục.
3. **QUANLY reversal race (guard chống-đúp không atomic, `LEGACY-FIFO-AUDIT.md` §9)** — mức độ ưu tiên sửa, vì tần suất xảy ra thấp nhưng lỗ hổng có thật.
4. **`book_closings_gieogieo` "mở lại sổ" xoá thẳng v1** — xác nhận có cần giữ khả năng xem lại v1 đã từng tồn tại hay không (ảnh hưởng thiết kế compaction correction ở Phase 6).
5. **Store context**: hệ thống cũ 100% single-store (không tìm thấy `storeId`/branch nào) — xác nhận có kế hoạch multi-store thật sự trong tương lai gần, hay chỉ cần chừa chỗ (ảnh hưởng độ ưu tiên Phase 1).

---

# 12. GATE — PHASE 3 (FIFO ENGINE) COI LÀ PASS KHI

Theo đúng `GIEO-SYSTEM-REBUILD-PLAN.md` §7, bổ sung tiêu chí cụ thể rút ra từ audit:

- [ ] Partial/multi-unit consumption cho kết quả giống hệt `_ueComputeAllocation` legacy trên cùng input (regression test đối chiếu).
- [ ] Debt là field tường minh (`DebtInfo`), không phải số âm ẩn — query được "unit nào đang nợ" trực tiếp.
- [ ] `untrackedPendingDelta` được tính bởi 1 hàm duy nhất, không có ngoại lệ theo `type` giao dịch (chặn đứng lớp bug #1/#11/#14/#17/#18).
- [ ] Idempotency (txId cố định + claim) áp dụng đồng nhất cho cả 9 responsibility, không còn đường phụ nào thiếu (chặn đứng #6/#13/#21/#22/#23/#24).
- [ ] Reversal chỉ có 1 implementation, POS và QUANLY gọi chung — không còn `qlReverseStockForOrder` cộng bừa (chặn đứng #17).
- [ ] QUANLY không còn hàm nào ghi trực tiếp Firestore ngoài qua `packages/commands` (chặn đứng #1/#2/#18 tận gốc).
- [ ] RecipeVersion có effective date, COGS lịch sử resolve đúng version tại thời điểm bán — invalidate cache không đổi kết quả lịch sử (chặn đứng vi phạm §13 audit).
- [ ] `systemExhaustedAt`/`finishedAt` là 2 field độc lập trên Unit, có audit trail đầy đủ (giữ nguyên điểm đúng của legacy).
- [ ] Lost/Found có đủ luồng ApproveLostContainer (đóng gap #12/#16).
- [ ] `RebuildUnitState` chạy được từ ledger thuần túy, cho kết quả khớp `remainingQty` hiện tại trên mọi Unit test (điều kiện tiên quyết cho compaction Phase 6).
