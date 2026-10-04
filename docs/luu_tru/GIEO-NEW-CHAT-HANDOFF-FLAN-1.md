# GIEO SYSTEM REBUILD — NEW CHAT HANDOFF / MASTER BRIEF

## 0. Mục đích file này

Đây là brief để đưa vào một cuộc trò chuyện mới nhằm tiếp tục xây dựng hệ thống Gieo từ đầu mà không phải đọc lại toàn bộ cuộc trò chuyện cũ.

**Mục tiêu:** xây một hệ thống POS + QUANLY mới trên dữ liệu Firebase hiện có, trong khi hệ thống cũ vẫn chạy production bình thường. Hệ thống mới ban đầu chạy song song ở READ-ONLY / SHADOW / SIMULATE, chỉ cutover một lần sau khi hoàn thiện.

Không copy kiến trúc/logic cũ. Hệ thống cũ chỉ là:
- nguồn dữ liệu legacy cần bảo toàn,
- tài liệu tham chiếu nghiệp vụ,
- nguồn để audit hành vi hiện tại.

---

# 1. QUYẾT ĐỊNH KIẾN TRÚC CỐT LÕI

## 1.1 FIFO là ROOT / FOUNDATION

Đây là quyết định quan trọng nhất.

**FIFO không phải một feature của kho. FIFO là traceability backbone của toàn hệ thống.**

POS và QUANLY là các UI/domain clients sử dụng FIFO Core.

Mọi nghiệp vụ liên quan đến vật chất, tiền, recipe, COGS, waste, lost, BTP, inventory, reversal, adjustment... phải có thể truy nguyên về FIFO khi có liên quan.

Mental model:

```text
FIFO TRACEABILITY CORE
        ↓
POS / QUANLY / REPORTING
```

Một Unit phải có thể trả lời:
- nhận từ đâu,
- supplier/receipt nào,
- số lượng ban đầu,
- cost basis nào,
- mở lúc nào,
- ai mở,
- đã được FIFO phân bổ cho những gì,
- dùng cho bill nào,
- dùng cho BTP batch nào,
- recipe version nào,
- system nói hết lúc nào,
- nhân viên thực tế báo hết lúc nào,
- waste/lost/adjustment/reversal nào liên quan.

Ngược lại, từ Bill/COGS/Waste/Lost/BTP cũng phải drill xuống Unit khi dữ liệu còn ở dạng live hoặc qua historical compact khi đã compact.

---

# 2. FIFO KHÔNG CHỈ LÀ RAW DATA VĨNH VIỄN

Hệ thống sẽ có dữ liệu FIFO LIVE và dữ liệu FIFO đã COMPACT.

```text
                 FIFO CORE
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
       LIVE FIFO        COMPACTED HISTORY
          └─────────┬─────────┘
                    ↓
             UNIFIED READ
                    ↓
             POS / QUANLY
```

Lý do:
- nhiều cửa hàng,
- số lượng Unit rất lớn,
- mỗi Unit có rất nhiều event/allocation,
- nếu giữ toàn bộ raw detail và luôn truy ngược sẽ ngày càng nặng.

## 2.1 Compact là một phần của architecture

Không coi compact là optimization làm sau.

Ngay khi thiết kế FIFO phải biết:
- dữ liệu nào được compact,
- compact thành hồ sơ gì,
- điều kiện nào cho phép compact,
- dữ liệu nào được purge,
- dữ liệu nào bắt buộc giữ,
- correction sau compact xử lý thế nào,
- chức năng đọc sau compact đọc ở đâu.

## 2.2 Raw data không được xoá chỉ vì cũ

Unit/detail chỉ được purge khi hệ thống chứng minh:
- Unit đã kết thúc vòng đời,
- mọi consumption đã resolved,
- mọi reversal đã resolved,
- mọi adjustment/correction đã resolved,
- approvals liên quan đã completed,
- snapshot/compact đã tạo,
- compact đã verify,
- các reference cần thiết đã được chuyển,
- không còn active trace dependency.

Nếu còn bất kỳ truy vết nào cần raw detail:

```text
DO NOT DELETE
```

## 2.3 Purge raw ≠ destroy history

Historical compact phải giữ đủ ý nghĩa lịch sử.

Ví dụ Unit compact phải biết:
- identity,
- receipt/supplier,
- initial qty,
- cost basis,
- open,
- consumption summary,
- bill/BTP references,
- recipe versions,
- COGS,
- waste,
- lost,
- adjustment,
- reversal,
- system exhaustion,
- physical finish,
- variance,
- audit/revision metadata.

Không được biến lịch sử thành một con số kiểu:
`waste = 120g`
mà mất căn cứ 120g đến từ đâu.

---

# 3. HỆ THỐNG CŨ ĐÃ CÓ SNAPSHOT

Không giả định rằng hệ thống mới phải phát minh snapshot bill/doanh thu từ đầu.

Hệ thống cũ dường như đã có cơ chế snapshot cho bill/doanh thu/số liệu. Việc cần làm là:

1. Audit chính xác cơ chế hiện tại.
2. Giữ lại những gì có giá trị.
3. Đặt snapshot đúng vị trí trong kiến trúc mới.
4. Làm cho FIFO trở thành nguồn gốc của trace.
5. Đảm bảo các snapshot/historical records tương thích với FIFO.
6. Đảm bảo mọi chức năng liên quan đọc được dữ liệu compact.

**Không được phá snapshot legacy chỉ vì xây FIFO mới.**

---

# 4. UNIFIED READ LAYER — BẮT BUỘC

Đây là thành phần kiến trúc quan trọng.

Sau compact, QUANLY/POS/report không được tự query raw Firebase và giả định dữ liệu còn ở đó.

Mọi read nghiệp vụ nên đi qua shared read layer:

```text
getUnitTrace()
getConsumption()
getWaste()
getLost()
getCOGS()
getRevenue()
getInventoryHistory()
getBTPHistory()
...
```

Read layer tự quyết định:

```text
LIVE
+
COMPACT
↓
CANONICAL READ MODEL
```

UI không cần biết record nằm ở live hay compact.

### Invariant

> Every Read Must Be Compaction-Aware.

Nếu một chức năng hoạt động khi dữ liệu còn LIVE nhưng hỏng khi dữ liệu đã COMPACT thì đó là architecture bug.

---

# 5. STORE LÀ FIRST-CLASS BOUNDARY

Hệ thống phải sẵn sàng cho nhiều cửa hàng.

```text
ORGANIZATION / BUSINESS
        ↓
      STORE
        ↓
 POS + QUANLY
        ↓
 SHARED DOMAIN CORE
        ↓
       DATA
```

Mỗi store có:
- POS instance,
- QUANLY instance,
- store context.

QUANLY cấp tổng có thể xem:
- Store A,
- Store B,
- ALL STORES.

`ALL STORES` mặc định là aggregation/read scope, không phải physical shared state.

Canonical operational context:

```text
organizationId
storeId
appInstanceId
deviceId
businessDate
actor
permissions
featureFlags
```

Không nhầm:
- storeId,
- appInstanceId,
- deviceId.

Legacy store mapping chưa được coi là chắc chắn; không đoán.

---

# 6. CANONICAL DATA PRINCIPLES

Legacy Firebase:

```text
Legacy Firebase Schema
        ↓
Legacy Firebase Adapter
        ↓
Canonical Domain Model
        ↓
Domain Engine
```

Không để schema legacy quyết định kiến trúc mới.

### Inventory

Phân biệt rõ:

1. Physical/recompute state:
   - Unit
   - Container
   - Batch
   - UnitBase

2. Ledger/audit:
   - StockLedgerEntry
   - StockAdjustment
   - operation records

3. Projection:
   - currentStock
   - report aggregates

`currentStock` không phải sole source of truth.

### Golden invariant

Không mechanically thay:
`currentStock mutation`
bằng:
`untrackedPendingDelta`.

Mọi mutation phải được biểu diễn đúng ở physical/recompute layer và projection/ledger layer.

---

# 7. UNIT IDENTITY

Canonical Unit cần phân biệt:

```text
unitId
code / label
itemId
storeId
receiptId
operationId
stockTxId
billId
```

Không đồng nhất chúng.

Một physical label/code phải map rõ tới một Unit/UnitBase.

Unit lifecycle dự kiến:

```text
RECEIVED
 ↓
SEALED
 ↓
OPEN
 ↓
CONSUMING
 ↓
SYSTEM_EXHAUSTED
 ↓
PHYSICALLY_FINISHED
 ↓
COMPACTABLE
```

Có thể có nhánh:
- LOST
- FOUND
- WASTE
- REVERSED
- ADJUSTED

### System exhaustion vs physical finish

Phải phân biệt:

```text
systemExhaustedAt
```

= hệ thống tính UnitBase đã về 0.

với:

```text
finishedAt
finishedBy
```

= nhân viên thực tế scan/báo hết.

Hai thời điểm có thể khác nhau.

---

# 8. FIFO ALLOCATION

FIFO Engine là owner.

POS và QUANLY không được tự viết FIFO logic riêng.

Mọi consumption nên có lineage:

```text
Bill
 → Bill Line
 → Recipe Version
 → Recipe Component
 → Requirement
 → Unit Allocation
 → UnitBase before
 → UnitBase after
```

BTP cũng nằm trong cùng graph:

```text
Raw Units
 → FIFO consumption
 → Prep Batch
 → Yield
 → Prep Unit
```

FIFO debt/carry semantics của hệ thống cũ phải được audit và canonicalize, không copy mù.

---

# 9. RECIPE + COST LÀ MỘT PHẦN CỦA FIFO TRACE

Recipe thay đổi theo thời gian.

Canonical:

```text
Recipe Master
 ↓
Recipe Version
 ↓
Effective From / To
 ↓
Store applicability
 ↓
Sales consumption
```

Bill lịch sử phải giữ RecipeVersion đã dùng.

Không được lấy recipe hiện tại để tính lại bill lịch sử.

Cost cũng phải historical:

```text
CostBasis at time of consumption
```

Không được dùng current cost để tái tính lịch sử.

---

# 10. ACTUAL VS THEORETICAL

Phải tách:

```text
THEORETICAL
= RecipeVersion × Sales
```

với:

```text
ACTUAL
= Physical Unit events
+ Waste
+ Count
+ Receiving
+ BTP yield
+ other actual observations
```

Sau đó:

```text
VARIANCE
= ACTUAL vs THEORETICAL
```

Mục tiêu của FIFO là giải thích variance, không che variance bằng projection.

---

# 11. PHYSICAL RECONCILIATION

Khi nhân viên cân/đếm thực tế:

`actualQty` là absolute observation.

Không lấy cache để tính delta.

Phải:

```text
READ FRESH UNIT STATE
        ↓
CALCULATE
delta = actualQty - currentUnitBase
        ↓
PHYSICAL_RECONCILIATION
        ↓
unitBase = actualQty
```

Weighing phải là shared domain behavior, không phải logic riêng của UI.

---

# 12. DATA FLOW STANDARD

Mọi domain command:

```text
INPUT
 ↓
VALIDATE
 ↓
READ CANONICAL STATE
 ↓
CALCULATE
 ↓
BUILD MUTATION PLAN
 ↓
CHECK IDEMPOTENCY
 ↓
MUTATE
 ↓
RECORD LEDGER
 ↓
PROJECT
 ↓
AUDIT
 ↓
VERIFY
```

Complex mutation tạo:

```text
MutationPlan
├── operationId
├── organizationId
├── storeId
├── actorId
├── source
├── domain
├── command
├── input
├── validation
├── before
├── calculation
├── physicalChanges[]
├── ledgerChanges[]
├── projectionChanges[]
├── sideEffects[]
├── dependencies[]
├── warnings[]
└── recoveryPlan
```

---

# 13. OPERATION / IDEMPOTENCY

Mọi mutation quan trọng phải có stable `operationId`.

Operation states:

```text
PENDING
RUNNING
COMPLETED
FAILED_RETRYABLE
FAILED_MANUAL_REVIEW
CANCELLED
```

Retry phải idempotent.

Không dùng UI busy lock như data idempotency.

Multi-step workflow dùng state machine.

---

# 14. PROTECTED INFRASTRUCTURE — KHÔNG REWRITE

## Bank payment

Legacy hiện có:
- `genBankOrderId()`
- format có `GG` + DD + MM + HH + mm + ss
- VietQR
- Realtime Database `bank_confirmations/{orderId}`
- Cloud Run/webhook
- listener + manual fallback.

Không đổi semantics.

New system chỉ wrap bằng:

```text
BankPaymentAdapter
```

Quan trọng:

```text
bankOrderId ≠ operationId
```

## APK

POS HTML được wrapper bằng APK.

APK đang xử lý:
- bill printer,
- label printer,
- barcode scanner.

Không thay scanner bằng web camera.
Không rewrite printer connectivity.

Dùng adapters:

```text
PrinterAdapter
ScannerAdapter
NativeBridgeAdapter
```

Print retry không được tạo lại order/payment/stock.

---

# 15. SNAPSHOT / COMPACTION KIẾN TRÚC

Đây là phần cần xây mới nhưng phải audit snapshot legacy trước.

## Lifecycle dữ liệu

Khái niệm:

```text
LIVE
 ↓
CLOSED
 ↓
SNAPSHOT_READY
 ↓
COMPACTED
 ↓
ARCHIVED / PURGED RAW
```

Compact interval có thể configurable:
- daily,
- weekly,
- monthly,
- yearly.

Nhưng interval không tự quyết định quyền xoá.

## Trace dependency

Nên có registry/logic tương đương:

```text
TRACE_DEPENDENCY
sourceType
sourceId
referencedBy[]
status
```

Ví dụ:

```text
UNIT U001
 ├─ Bill Consumption
 ├─ BTP Consumption
 ├─ Waste
 ├─ Reversal
 └─ Adjustment
```

Chỉ khi tất cả dependency đã resolved/represented thì Unit mới `COMPACTABLE`.

## Correction sau compact

Không sửa lịch sử bằng UPDATE mù.

Ví dụ:

```text
Snapshot v1
 ↓
historical correction
 ↓
rebuild affected scope
 ↓
Snapshot v2
```

Giữ revision/audit đủ để biết v1 đã tồn tại và vì sao v2 thay thế.

---

# 16. QUANLY SAU COMPACT

QUANLY phải đọc Unified Read Layer.

Ví dụ:

```text
COGS Report
 ├─ Live FIFO COGS
 └─ Compact FIFO COGS
        ↓
     unified result
```

Waste:

```text
Waste Report
 ├─ live events
 └─ compact history
```

Revenue:

```text
Revenue
 ├─ current bills
 └─ existing/historical snapshot
```

Unit trace:

```text
UnitTrace
 ├─ live Unit + events
 └─ historical Unit snapshot
```

Người dùng phải thấy cùng một lịch sử dù dữ liệu đang live hay compact.

---

# 17. DOMAIN COMMAND CATALOG

## POS

```text
SALES
├── StartCheckout
├── ApplyPromotion
├── CapturePayment
├── SplitPayment
├── FinalizeOrder
└── ReverseOrder

INVENTORY
├── OpenContainer
├── MarkOutOfStock
├── ReceiveGoods
├── CountStock
├── RecordWaste
├── TransferStock
├── ReportLostContainer
└── RestoreFoundContainer

PREP
├── StartPrepBatch
├── RecordPrepMeasurement
├── RecordPrepYield
├── ConsumePrep
└── RecordPrepWaste

SHIFT
├── CheckIn
├── CheckOut
├── OpenDay
├── RecordHandover
└── CloseDay

INFRASTRUCTURE
├── PrintJob
├── ScanInput
└── CustomerDisplayProjection
```

## QUANLY

```text
MASTER
├── CreateProduct
├── UpdateProduct
├── PublishProductVersion
├── CreateRecipe
├── PublishRecipeVersion
├── CreateEmployee
├── AssignEmployeeToStore
├── CreateLocation
├── CreateVessel
└── ConfigurePromotion

APPROVAL
├── ApproveStockCount
├── RejectStockCount
├── ApproveLostContainer
├── RejectLostContainer
├── ApproveExpense
├── RejectExpense
└── ReviewReceivingCorrection

CORRECTION
├── AdjustInventory
├── AdjustPrepStock
├── CorrectReceiving
├── ReverseOrder
├── CorrectLocationStock
└── CorrectBatchYield

CONFIGURATION
├── UpdateFinancePolicy
├── UpdateRefillPolicy
├── UpdateStockCountThreshold
└── UpdateSchedulePolicy

REPORTING
├── BuildStoreReport
├── BuildCrossStoreReport
├── ReconcileInventory
└── ReconcilePrep
```

---

# 18. BUGS LEGACY ĐÃ BIẾT

Có 24 bug trong `BUG-kho-can-updated.md`.

Các nhóm quan trọng:
1. Management stock adjustment bị Unit Engine overwrite.
2. Stock adjustment dùng cache → race.
3. Weighing unit/factor sai.
4. `wpDone()` commit weighing invalid.
5. stale `_pwWeighings` / `_pwChoice`.
6. FIFO not-empty double tap race.
7. Stock count approval dù có line fail.
8. Vessel deletion cleanup/retry.
9. `pwWeighMode` global persistence.
10. `_pwApplyWeigh` zero record.
11. Damaged receiving double subtract.
12. Lost-item approval flow.
13. Stock count duplicate docs.
14. Receiving quantity biến mất sau recompute.
15. FIFO debt absorption / close error.
16. Found-lost dead path.
17. Bill reversal không unit/untracked aware.
18. BTP adjustment bị overwrite.
19. Prep yield edit double submit.
20. Receiving correction không atomic.
21. BTP waste allocation thiếu idempotency/rollback.
22. Start prep batch lost-ACK/retry.
23. Add-on consumption increase thiếu stable txId.
24. Found-lost thiếu end-to-end idempotency.

Không patch từng bug kiểu symptom fix.
Dùng protocol:

```text
BUG/REQUIREMENT
 → TRACE DATA
 → TRACE TREE
 → IDENTIFY OWNER
 → CALCULATE IMPACT
 → DESIGN FIX
 → UPDATE TREE
 → UPDATE CONTRACT
 → IMPLEMENT
 → TEST
 → REGRESSION
 → COMPLETE
```

---

# 19. LEGACY SOURCE FINDINGS QUAN TRỌNG

Exact source audit đã xác nhận:

POS có logic rất sâu về:
- Unit Engine,
- FIFO,
- opening/finishing units,
- weighing,
- stock transactions,
- recipe consumption,
- reversal.

QL có rất nhiều:
- recipe,
- COGS,
- costPerUnit,
- waste,
- reporting,
- weighing,
nhưng legacy QL không trực tiếp sở hữu Unit Engine theo cùng cách POS.

Điều này củng cố quyết định:

> New QUANLY không được xây FIFO logic riêng. Nó phải đọc shared FIFO/read model.

Legacy QL recipe hiện chưa có immutable effective-period version đầy đủ; new architecture phải sửa điều này.

Legacy COGS từng có logic dùng recipe/current cost động; new architecture phải historical-snapshot recipe + cost basis.

---

# 20. ROADMAP MỚI

## PHASE 0 — Architecture & Legacy Audit

Audit:
- legacy Firebase schema,
- FIFO,
- snapshot,
- compact,
- bill/revenue snapshot,
- existing reports,
- dependencies.

Outputs:
- `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md`
- update dependency tree.

---

## PHASE 1 — Canonical Foundation + Store

Chốt:
- Organization,
- Store,
- StoreContext,
- Access,
- Legacy Adapter,
- Operation Registry,
- protected infrastructure.

---

## PHASE 2 — FIFO Identity & Physical State

Chốt:
- Unit identity,
- UnitBase,
- labels/codes,
- receipt relation,
- lifecycle,
- system exhaustion,
- physical finish.

---

## PHASE 3 — FIFO Engine

Implement/design:
- eligibility,
- FIFO allocation,
- UnitBase mutation,
- debt,
- opening,
- finish,
- physical reconciliation,
- reversal,
- rebuild.

---

## PHASE 4 — Traceability Graph

Chốt two-way trace:

```text
Bill → Recipe → Consumption → Unit
Unit → Consumption → Bill/BTP/Waste/etc.
```

---

## PHASE 5 — Recipe / Cost / BTP

Chốt:
- RecipeVersion,
- effective dates,
- CostBasis,
- BTP trace,
- historical calculation.

---

## PHASE 6 — Historical Snapshot / Compaction

Chốt:
- compact eligibility,
- snapshot schema,
- dependency checks,
- verification,
- purge,
- correction/rebuild,
- retention policy.

---

## PHASE 7 — Unified Read Layer

Mọi read nghiệp vụ:
- LIVE aware,
- COMPACT aware,
- same canonical output.

Đây là gateway bắt buộc cho POS/QUANLY/report.

---

## PHASE 8 — Domain Commands

Build shared mutation/command engine:
- validation,
- calculation,
- MutationPlan,
- idempotency,
- audit,
- recovery.

---

## PHASE 9 — POS

Thin client:
```text
POS UI
 → Commands
 → Core
 → Unified Read
```

Không direct business-state Firebase mutation.

---

## PHASE 10 — QUANLY

Thin management UI:
```text
QUANLY UI
 → Commands / Read Layer
 → Core
```

Không có stock/FIFO engine riêng.

---

## PHASE 11 — Reporting / Reconciliation

Build:
- revenue,
- COGS,
- waste,
- lost,
- inventory,
- BTP,
- variance,
- store analytics,
- all-store analytics.

Tất cả phải đọc được LIVE + COMPACT.

---

## PHASE 12 — Shadow

New system:
- READ,
- SIMULATE,
- COMPARE.

Old system:
- production writer.

Compare:
- sales,
- FIFO,
- stock,
- COGS,
- waste,
- BTP,
- receiving,
- stock count,
- reversal,
- snapshots,
- reports.

---

## PHASE 13 — Final Cutover

```text
OLD WRITER STOP
 ↓
FINAL RECONCILIATION
 ↓
NEW SYSTEM SOLE WRITER
 ↓
OLD SYSTEM RETAINED TEMPORARILY FOR ROLLBACK
```

Không partial production migration.

---

# 21. CÁC FILE NÊN GỬI KÈM CHAT MỚI

Ưu tiên gửi:

### Kiến trúc
1. `SYSTEM-DEPENDENCY-TREE.md`
2. `CANONICAL-DATA-MODEL-V1.md`
3. `PHASE-E-STORE-ACCESS-INFRASTRUCTURE-CONTRACT-V1.md`

### Audit
4. `DATA-FOUNDATION-AUDIT-V1.md`
5. `01-DATA-FOUNDATION-POS-AUDIT-V1.md`
6. `POS-ACTION-DATA-AUDIT-V2.md`
7. `QUANLY-ACTION-DATA-AUDIT-V1.md`
8. `SHARED-DOMAIN-CONTRACT-AUDIT-V1.md`

### FIFO / bug
9. `FIFO-TRACEABILITY-CORE-REQUIREMENTS-V1.md`
10. `BUG-kho-can-updated.md`

### Legacy source
11. `posgieo(5).html`
12. `quanlygieo (3).html`

Nếu có các bản mới hơn đã được xác nhận là production/reference thì gửi bản đó thay cho bản cũ, nhưng không gửi lẫn nhiều bản không rõ status để tránh nhiễu.

---

# 22. NHIỆM VỤ ĐẦU TIÊN CHO CHAT MỚI

**Không code ngay.**

Chat mới phải bắt đầu bằng:

### Bước A
Đọc các file được gửi kèm.

### Bước B
Xác nhận kiến trúc hiện tại bằng evidence từ files.

### Bước C
Audit chính xác snapshot/compaction của hệ thống cũ.

### Bước D
Tạo:

```text
LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md
```

### Bước E
Từ kết quả audit, tạo:

```text
FIFO-CORE-ARCHITECTURE-V2.md
```

### Bước F
Sau đó mới tạo:

```text
FIFO-COMPACTION-CONTRACT-V1.md
UNIFIED-READ-LAYER-CONTRACT-V1.md
```

**Không được nhảy thẳng vào code FIFO/POS/QUANLY trước khi 4 tài liệu trên được chốt.**

---

# 23. HARD INVARIANTS

Không được vi phạm:

1. FIFO là root traceability core.
2. POS và QUANLY không sở hữu FIFO logic riêng.
3. currentStock không phải sole source of truth.
4. Unit/UnitBase là physical/recompute truth.
5. Ledger là audit/report representation.
6. Projection không được coi là physical truth.
7. Mọi mutation quan trọng có operationId.
8. Retry phải idempotent.
9. Không direct UI mutation business state.
10. Không blind retry.
11. Không swallow errors.
12. Không đoán legacy semantics khi dữ liệu ambiguous.
13. Recipe lịch sử phải immutable/versioned.
14. Cost lịch sử phải có CostBasis.
15. Actual và theoretical phải tách.
16. Bill delete không được phá lineage.
17. Reversal không được phá lineage.
18. Compact không được làm mất traceability.
19. Raw chỉ purge khi không còn dependency cần nó.
20. Mọi read lịch sử phải đọc được LIVE và COMPACT.
21. ALL STORES mặc định là aggregation/read scope.
22. Bank/APK infrastructure là protected boundary.
23. Old system vẫn production writer trong shadow phase.
24. Production cutover chỉ xảy ra một lần sau khi shadow/regression đạt yêu cầu.

---

# 24. NORTH STAR

Hệ thống mới **không phải chỉ là một POS tốt hơn**.

Nó là:

> **Một hệ thống quản lý vật chất + tiền + recipe + cost + traceability, trong đó FIFO là nền tảng và lịch sử có khả năng tự compact để hệ thống có thể scale nhiều cửa hàng mà vẫn truy vết được.**

Mục tiêu cuối cùng:

```text
RECEIVE
 ↓
UNIT
 ↓
FIFO
 ↓
CONSUMPTION
 ↓
BILL / BTP / WASTE / LOSS
 ↓
RECIPE + COST
 ↓
TRACEABILITY
 ↓
SNAPSHOT / COMPACT
 ↓
UNIFIED READ
 ↓
REPORT
```

Và khi dữ liệu đã compact:

```text
CHỨC NĂNG CŨ
      ↓
KHÔNG ĐƯỢC HỎNG
      ↓
ĐỌC COMPACT
      ↓
TRẢ VỀ CÙNG CANONICAL RESULT
```

Đó là nguyên tắc nền tảng để tiếp tục xây hệ thống.
