# FIFO COMPACTION CONTRACT — V1

> **Vai trò:** contract bắt buộc cho `packages/compaction`. Hiện thực hóa Phase 6 của `GIEO-SYSTEM-REBUILD-PLAN.md` §10, dựa trên bằng chứng audit thật ở `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` (đặc biệt §2 và §6) và data model ở `FIFO-CORE-ARCHITECTURE-V2.md` §1/§3.9/§3.10.
>
> **Lý do file này phải tồn tại TRƯỚC khi viết Ledger/Unit persistence:** `StockLedgerEntry` và `Unit` được thiết kế sẵn để nối vào compaction (`COMPACTABLE` là state cuối của lifecycle Unit; `RebuildUnitState` là nền của snapshot verifier). Viết persistence trước khi chốt contract này là rủi ro phải viết lại thật, không phải rủi ro lý thuyết.
>
> **Trạng thái:** CONTRACT — chốt để code. Mọi thay đổi phải cập nhật cả `UNIFIED-READ-LAYER-CONTRACT-V1.md` (2 file là 1 cặp).

---

# 0. NGUYÊN TẮC GỐC — 3 KHÁI NIỆM TÁCH BIỆT, CẤM GỘP

Phát hiện quan trọng nhất của `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §2: legacy có **3 cơ chế snapshot phục vụ 3 mục đích khác nhau**, và đã tách rất có chủ đích vì lý do nghiệp vụ thật. Thiết kế mới giữ nguyên sự tách biệt đó.

| # | Khái niệm | Bản chất | Được phép xoá/tính lại tự do? | Là nguồn sự thật? | Mẫu legacy |
|---|---|---|---|---|---|
| 1 | **CACHE** | Kết quả tính lại được từ raw, chỉ để tăng tốc | ✅ Có — invalidate bất kỳ lúc nào | ❌ Không bao giờ | `daily_sales_cache_gieogieo` |
| 2 | **OPERATIONAL RECORD** | Sự kiện vận hành đã xảy ra (đối soát tiền mặt, giao ca) | ❌ Không — nó LÀ event record | ✅ Có, cho đúng phạm vi của nó | `daily_closings_gieogieo`, `shift_segments_gieogieo` |
| 3 | **SNAPSHOT (compaction thật)** | Đóng băng số liệu lịch sử có chủ đích, có audit | ❌ Không — chỉ qua correction có revision | ✅ Có, thay thế raw sau khi verified | `book_closings_gieogieo` |

**Chỉ #3 được gọi là "compaction"** theo đúng nghĩa Master Plan. `packages/compaction` sở hữu #3 và cơ chế versioning ở §1; #1 thuộc `packages/read-layer` (§4 file kia); #2 thuộc domain command tương ứng (`commands/shift`), KHÔNG thuộc compaction.

**Invariant C0:** không package nào được tạo khái niệm snapshot thứ 4. Muốn đóng băng dữ liệu → dùng §1 hoặc §3 ở đây.

---

# 1. CƠ CHẾ VERSIONING DÙNG CHUNG — `VersionedInput`

> Đây là hệ quả thiết kế bắt buộc của `GIEO-REBUILD-HANDOFF-V2.md` §3 ("đã xác nhận 7 lần độc lập"). **Một cơ chế duy nhất** cho Recipe / Cost / Packaging / BTP-yield / PayTerms / KPI-target / Config. Không domain nào được tự làm riêng.

## 1.1 Vấn đề đang giải

Cùng 1 lớp lỗi xuất hiện độc lập ở 7 domain: **input ảnh hưởng số tiền/số liệu lịch sử bị resolve theo giá trị HIỆN TẠI thay vì giá trị TẠI THỜI ĐIỂM sự kiện xảy ra.** Hệ quả: sửa công thức/giá/yield/lương hôm nay → số liệu lịch sử tự đổi sau lưng người đã đọc nó.

Biến thể thứ 2, tinh vi hơn (instance #6 KPI Target, #7 báo cáo kỳ): resolve theo **1 mốc đại diện cho cả khoảng** (ngày cuối kỳ) rồi áp cho toàn khoảng — sai với mọi ngày còn lại trong kỳ.

## 1.2 Contract

```text
interface VersionedInput<T> {
  kind         // 'recipe' | 'cost' | 'packaging' | 'prepYield' | 'payTerms' | 'kpiTarget' | 'config'
  subjectId    // itemId / menuItemId / employeeId / configKey...
  storeId
  versionId    // BẤT BIẾN sau khi publish
  effectiveFrom  // Timestamp — bắt buộc
  effectiveTo    // Timestamp | null (null = còn hiệu lực)
  payload: T     // nội dung thật (components, unitCost, terms...)
  publishedAt, publishedBy, supersedesVersionId?
}
```

**Quy tắc bắt buộc:**

| # | Quy tắc |
|---|---|
| V1 | **Append-only.** Publish bản mới = tạo version mới + set `effectiveTo` bản cũ. CẤM UPDATE `payload` của version đã publish. Mẫu đúng đã có ở legacy: `price_history_gieogieo`. |
| V2 | **Resolve theo point-in-time, không theo "hiện tại".** Chữ ký duy nhất được phép: `resolve(kind, subjectId, storeId, at) -> VersionedInput` với `at` = thời điểm sự kiện nghiệp vụ (`occurredAt`/`businessDate` của bill/mẻ/ca), KHÔNG phải `Date.now()`. |
| V3 | **Khoảng thời gian phải resolve TỪNG NGÀY.** Với mọi tính toán trên 1 khoảng `[from,to]`, bắt buộc dùng `resolveDaily(kind, subjectId, storeId, from, to) -> Map<dateKey, VersionedInput>` rồi áp đúng version cho từng ngày. CẤM resolve 1 lần tại `to` (hoặc `from`) rồi áp cho cả khoảng — đây chính xác là bug instance #6/#7. |
| V4 | **Kết quả đã ghi phải giữ `versionId` đã dùng.** Mọi record kết quả (COGS line, PrepBatch, payroll line, bill line) lưu `versionId` của input đã dùng. Đọc lại lịch sử = đọc `versionId` đã lưu, KHÔNG resolve lại. Resolve chỉ xảy ra 1 lần, lúc ghi. |
| V5 | **Snapshot lúc ghi không được là write-only.** Nếu đã snapshot (`payTerms` lúc check-in) thì đường đọc BẮT BUỘC đọc lại snapshot đó. Đây là fix trực tiếp instance #5 (`payTerms` legacy ghi nhưng không bao giờ đọc lại). CI phải có test chứng minh đường đọc chạm tới field đã snapshot. |
| V6 | **Cache không được vượt mặt version.** Invalidate cache khi publish version mới là ĐÚNG; nhưng cache chỉ được chứa kết quả đã resolve theo V2/V3. Cấm lặp lại `invalidateSalesCache()` kiểu legacy — xoá sạch cache rồi tính lại bằng version HIỆN TẠI (instance #2/#3). |

## 1.3 Ngoại lệ ĐÚNG — học theo, không sửa

`GIEO-REBUILD-HANDOFF-V2.md` §3 xác định 2 mẫu legacy làm đúng, dùng làm tham chiếu:

- **(a) Giá món snapshot vào Cart/Bill lúc thêm món**, không join động (`FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md` §8). Đây là V4 áp dụng đúng.
- **(b) P&L tháng qua `book_closings_gieogieo`** — nơi DUY NHẤT làm đúng "đóng băng + cảnh báo nếu số sống trôi khỏi số đã chốt". Đây là §3 dưới đây.

---

# 2. UNIT COMPACTION — LIFECYCLE VÀ BOUNDARY

## 2.1 Lifecycle dữ liệu

```text
LIVE → CLOSED → SNAPSHOT_READY → COMPACTED → ARCHIVED / PURGED RAW
```

Nối vào lifecycle Unit (`FIFO-CORE-ARCHITECTURE-V2.md` §2): `COMPACTABLE` là state Unit đạt được khi thỏa §2.2. `COMPACTABLE` là điều kiện CẦN, không phải lệnh compact — compact là hành động riêng theo policy §5.

## 2.2 Compact boundary — điều kiện CỨNG

Unit chỉ được compact khi **tất cả** đúng:

```text
status = PHYSICALLY_FINISHED (hoặc nhánh kết thúc: LOST đã approve, ADJUSTED đã chốt)
AND mọi consumption đã resolved
AND mọi reversal đã resolved
AND mọi correction đã resolved
AND mọi approval liên quan đã completed   ← gồm ApproveLostContainer (gap Bug #12)
AND mọi dependency đã được đại diện trong snapshot
AND không còn active trace dependency (registry TRACE_DEPENDENCY)
AND debt = 0 hoặc đã được hấp thụ tường minh bởi unit kế tiếp
```

Còn bất kỳ mục nào chưa thỏa:

```text
DO NOT COMPACT. DO NOT PURGE.
```

**Invariant C1:** compact/purge KHÔNG BAO GIỜ được kích hoạt bởi tiêu chí tuổi đơn thuần. Tuổi chỉ là điều kiện lọc ứng viên, không phải điều kiện cho phép. (Fix `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §3.2 — `ddDeleteBankOld()` xoá chỉ theo tuổi, không kiểm dependency.)

## 2.3 Snapshot minimum — trường bắt buộc

Snapshot Unit phải trả lời được đủ bộ câu hỏi truy vết ở `GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` §1.1:

```text
identity (unitId, itemId, storeId, itemKind)
receipt (receiptId, supplierId, receivedAt, receivedBy)
initialQty
costBasis (+ versionId theo §1)
open (openedAt, openedBy)
consumption summary  — TỪNG allocation: {operationId, qty, domain, targetRef}
bill references      — billId[] (không gộp thành số đếm)
BTP references       — prepBatchId[]
recipe versions      — versionId[] đã dùng
COGS lines           — {amount, costBasisVersionId, recipeVersionId}
waste, lost, adjustment, reversal
systemExhaustedAt, finishedAt/finishedBy/finishReason
needsReview + needsReviewReasons
variance (actual vs theoretical)
audit / revision (revisionNo, supersedesSnapshotId?)
```

**Invariant C2:** snapshot KHÔNG được biến thành aggregate không truy nguyên. Nếu 1 Unit từng cấp phát cho 40 bill, snapshot giữ đủ 40 `billId` — không được rút gọn thành `billCount: 40`. Mẫu đúng có sẵn ở legacy: `orders_gieogieo_archive` giữ nguyên object bill, không aggregate (`LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §5).

---

# 3. SNAPSHOT SỔ SÁCH (P&L / kỳ báo cáo) — ĐÓNG BĂNG CÓ CHỦ ĐÍCH

Tổng quát hóa `book_closings_gieogieo` — mẫu duy nhất legacy làm đúng.

## 3.1 Contract đọc

```text
nếu kỳ đã chốt  → ĐỌC THẲNG số đã đóng băng, KHÔNG tính lại
nếu chưa chốt   → tính từ raw/cache
```

Nguyên văn chủ đích cần giữ (comment legacy): *"con số chủ quán đã đọc và đã dùng để ra quyết định thì không được đổi sau lưng."*

## 3.2 Drift detection — BẮT BUỘC

Sau khi chốt, nếu raw bên dưới thay đổi (bill cũ bị sửa/xoá), hệ thống phải **phát hiện và cảnh báo**, không im lặng:

```text
frozen = snapshot.values
live   = recompute(raw)
nếu live ≠ frozen → sinh alert DRIFT_AFTER_CLOSING (không tự sửa snapshot)
```

Người có quyền quyết định: chấp nhận drift (ghi lý do) hoặc chạy correction §3.3.

## 3.3 Correction sau khi chốt — GIỮ v1, TẠO v2

```text
Snapshot v1
   ↓ Correction (có lý do, có actor)
Rebuild affected scope
   ↓
Snapshot v2  (supersedesSnapshotId = v1, revisionNo = 2)
```

**Invariant C3:** CẤM `.delete()` snapshot cũ rồi tạo lại từ đầu. Đây là điểm legacy làm SAI rõ ràng (`moLaiThang()` xoá thẳng v1, audit log RỖNG) và là cải tiến bắt buộc theo Master Plan §15.4. v1 phải đọc lại được vĩnh viễn để trả lời "số nào đã từng được chốt, ai đổi, vì sao".

**Invariant C4:** mọi correction ghi audit đầy đủ `{actorId, at, reason, scopeAffected, beforeVersionId, afterVersionId}`. Audit log rỗng = correction bị từ chối.

---

# 4. VERIFICATION — CỔNG BẮT BUỘC TRƯỚC KHI COMPACT

```text
RAW
 ↓ BUILD SNAPSHOT
 ↓ RECALCULATE  (replay ledger qua RebuildUnitState — FIFO-CORE §3.9)
 ↓ COMPARE
 ↓ PASS?
   ├─ PASS → COMPACT
   └─ FAIL → KHÔNG compact, sinh alert SNAPSHOT_VERIFY_FAILED, giữ nguyên raw
```

**Invariant C5:** chỉ PASS mới được compact. FAIL không bao giờ được "compact rồi sửa sau".

So sánh phải phủ tối thiểu: `remainingQty` cuối, tổng allocation, tổng waste, tổng COGS, số lượng bill/batch reference, và `currentStock` projection theo công thức `FIFO-CORE-ARCHITECTURE-V2.md` §3.10.

`RebuildUnitState` là nguồn xác thực chung cho cả verifier này lẫn phát hiện lệch RT/Firestore — 1 hàm, 2 chỗ dùng, không viết 2 bản.

---

# 5. PURGE VÀ SCHEDULING

## 5.1 Điều kiện purge raw

```text
snapshot verified (§4 PASS)
+ trace dependency safe
+ no unresolved correction
+ no unresolved reference
```

Thiếu 1 điều kiện → giữ raw. **Purge raw ≠ destroy history**: snapshot phải giữ đủ ý nghĩa lịch sử theo §2.3 trước khi raw được đụng tới.

## 5.2 Scheduling policy

`daily / weekly / monthly / yearly` **chỉ là lịch chạy**, không tự tạo quyền purge. Scheduler chỉ chọn ứng viên rồi chạy §2.2 → §4 → §5.1; mọi cổng vẫn phải PASS.

## 5.3 Archive — giữ contract legacy

Archive (đổi kho lưu trữ, KHÔNG mất chi tiết) tách khỏi compact (đóng băng + cho phép purge raw).

- Giữ format `orders_gieogieo_archive/{month}_{day}_{year}`, field `orders` = nguyên object bill. **Nhiều màn QUANLY phụ thuộc trực tiếp format này** — đổi format = breaking change.
- Giữ thứ tự an toàn: **ghi đích thành công RỒI mới xoá nguồn**. Không bao giờ xoá trước.
- **Fix bắt buộc:** theo dõi lỗi archive chuyển từ `localStorage` cấp máy sang registry tập trung theo ngày. Legacy tự thừa nhận hạn chế "đổi máy/xoá cache là quên ngày lỗi" — không mang sang.
- **Fix bắt buộc:** trần quét 60 ngày của bản POS không phải invariant, chỉ là giới hạn triển khai; registry tập trung phải cho biết ngày nào chưa archive bất kể bao lâu.

## 5.4 Dependency check trước khi xoá dữ liệu bắt tay

`bank_confirmations` chỉ được xoá khi **đã có bill tương ứng** HOẶC quá hạn dài VÀ không còn tham chiếu nào. Không xoá thuần theo tuổi (fix `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §3.2).

---

# 6. TRACE DEPENDENCY REGISTRY

```text
TRACE_DEPENDENCY {
  sourceType, sourceId,       // 'unit' / 'bill' / 'prepBatch' / 'snapshot'
  referencedBy: Ref[],
  status: 'ACTIVE' | 'RESOLVED'
}
```

Compact/purge đọc registry này để trả lời "còn ai cần raw không". Registry cũng là nơi ghi trạng thái archive theo ngày (§5.3).

**Invariant C6:** không có entry ACTIVE nào trỏ tới `sourceId` thì mới được purge. Không suy đoán, không "chắc là hết".

---

# 7. IDEMPOTENCY

Compact/purge/correction là mutation → bắt buộc đi qua `IdempotencyGuard` chung (`FIFO-CORE-ARCHITECTURE-V2.md` §7), dùng `operationId` xác định:

```text
operationId = deterministicId('compact', scopeKey, revisionNo)
```

CẤM `.add()`/random id. Chạy lại compact cùng scope = no-op trả kết quả cũ, không tạo snapshot trùng.

---

# 8. RANH GIỚI PACKAGE

| Được phép | Không được phép |
|---|---|
| `packages/compaction` sở hữu `VersionedInput` (§1), snapshot Unit (§2), snapshot sổ sách (§3), verifier (§4), purge (§5), registry (§6) | KHÔNG import Firebase SDK trực tiếp — chỉ định nghĩa port, adapter implement |
| `packages/read-layer` đọc snapshot qua port | KHÔNG package nào khác được tự quyết "đọc raw hay đọc snapshot" — đó là độc quyền của read-layer |
| `functions/`, `tools/` gọi compaction theo policy | Scheduler KHÔNG được bỏ qua cổng §2.2/§4/§5.1 |

---

# 9. GATE — PHASE 6 PASS KHI

- [ ] `VersionedInput` §1 dùng chung cho đủ 7 domain, có test chứng minh V3 (resolve từng ngày) và V5 (snapshot được đọc lại).
- [ ] Compact KHÔNG làm thay đổi canonical read result — test: cùng 1 query trước và sau compact cho kết quả giống hệt (khớp gate §11 `UNIFIED-READ-LAYER-CONTRACT-V1.md`).
- [ ] Verifier §4 chặn được snapshot sai (test có case FAIL).
- [ ] Correction sinh v2 giữ v1, audit đầy đủ (test chứng minh v1 vẫn đọc được).
- [ ] Drift detection §3.2 sinh alert khi raw trôi khỏi số đã chốt.
- [ ] Không còn đường xoá dữ liệu nào chỉ dựa trên tuổi.
