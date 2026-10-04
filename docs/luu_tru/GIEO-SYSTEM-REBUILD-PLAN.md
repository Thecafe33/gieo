# GIEO SYSTEM REBUILD — MASTER BUILD PLAN V1

> **Document status:** PLAN COMPLETE / READY FOR EXECUTION
>
> **Scope:** Thiết kế và kế hoạch xây dựng hệ thống mới. **Không phải source code.**
>
> Đây là file điều phối duy nhất của quá trình rebuild. Sau mỗi Phase, file này phải được cập nhật ở phần `PHASE STATUS`, `DECISIONS`, `DELIVERABLES`, `TESTS`, `RISKS` và `NEXT GATE`.
>
> Các tài liệu chuyên sâu có thể tồn tại riêng, nhưng **Master Plan này luôn là bản đồ triển khai chính**.

---

# 0. MỤC TIÊU

Xây một hệ thống POS + QUANLY mới trên dữ liệu Firebase hiện có, trong khi hệ thống cũ vẫn chạy production.

Hệ thống mới:

- không copy kiến trúc cũ;
- không để UI sở hữu business state;
- không để POS và QUANLY có hai inventory/FIFO engine;
- không coi `currentStock` là physical truth;
- giữ traceability từ vật chất → nghiệp vụ → tiền;
- có historical snapshot/compaction;
- mọi read hoạt động giống nhau trước và sau compact;
- chạy READ / SIMULATE / COMPARE trước khi trở thành production writer.

## North Star

```text
RECEIVE
  ↓
UNIT / UNITBASE
  ↓
FIFO CORE
  ↓
CONSUMPTION
  ↓
BILL / BTP / WASTE / LOST / REVERSAL / ADJUSTMENT
  ↓
RECIPE + COST
  ↓
TRACEABILITY
  ↓
SNAPSHOT / COMPACTION
  ↓
UNIFIED READ
  ↓
COMMANDS
  ↓
POS / QUANLY / REPORTING
```

FIFO là **root / traceability backbone**, không phải một feature riêng của kho.

---

# 1. NGUYÊN TẮC KIẾN TRÚC BẮT BUỘC

## 1.1 FIFO là ROOT

```text
FIFO TRACEABILITY CORE
        ↓
POS / QUANLY / REPORTING
```

Mọi nghiệp vụ vật chất có liên quan phải có thể truy nguyên về FIFO.

---

## 1.2 Physical Truth / Ledger / Projection phải tách

### Physical / Recompute Truth

```text
Unit
UnitBase
Container
Batch
Physical state
```

### Ledger / Audit

```text
StockLedgerEntry
StockAdjustment
Consumption records
Operation records
Audit records
```

### Projection

```text
currentStock
report aggregates
dashboard values
```

`currentStock` không phải source of truth duy nhất.

---

## 1.3 Không mechanically thay currentStock bằng untrackedPendingDelta

`untrackedPendingDelta` chỉ đại diện cho lượng vật chất **thực sự chưa có Unit/physical representation tương ứng**.

Không dùng nó như một "currentStock thứ hai".

---

## 1.4 Identity phải tách biệt

```text
unitId
≠ code / label
≠ operationId
≠ stockTxId
≠ billId
≠ receiptId
```

Một physical label/code phải map rõ tới một Unit/UnitBase.

---

## 1.5 Mutation phải idempotent

Mọi mutation quan trọng:

```text
operationId
```

Operation lifecycle:

```text
PENDING
  ↓
RUNNING
  ↓
COMPLETED

hoặc

FAILED_RETRYABLE
FAILED_MANUAL_REVIEW
CANCELLED
```

Retry không được tạo mutation lần hai.

UI busy-lock không phải idempotency.

---

## 1.6 Actual ≠ Theoretical

```text
THEORETICAL
= RecipeVersion × Sales
```

```text
ACTUAL
= Physical Unit events
+ Waste
+ Count
+ Receiving
+ BTP yield
+ other actual observations
```

```text
VARIANCE
= ACTUAL vs THEORETICAL
```

FIFO phải giúp giải thích variance, không che variance bằng projection.

---

## 1.7 Historical recipe/cost phải immutable theo thời điểm

Bill lịch sử giữ:

```text
recipeVersionId
```

Consumption lịch sử giữ:

```text
CostBasis
```

Không dùng recipe/current cost hiện tại để tính lại lịch sử.

---

## 1.8 Mọi read phải Compaction-aware

```text
LIVE
 +
COMPACT
 ↓
CANONICAL READ MODEL
```

UI không được tự quyết định record nằm ở LIVE hay COMPACT.

Invariant:

> **Every Read Must Be Compaction-Aware.**

---

## 1.9 Compact không được làm mất traceability

Compact là:

```text
FIFO DATA AGING
```

không phải:

```text
DELETE HISTORY
```

Snapshot phải giữ đủ lineage để trả lời "từ đâu đến đâu".

---

## 1.10 Store là first-class boundary

```text
ORGANIZATION
    ↓
STORE
    ↓
RUNTIME INSTANCE
    ↓
STORE CONTEXT
    ↓
DOMAIN CORE
```

`ALL STORES` là aggregation/read scope, không phải physical shared state.

---

# 2. DATA FLOW CHUẨN

Mọi domain mutation đi theo:

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

## MutationPlan

Mọi mutation phức tạp cần có concept tương đương:

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

# 3. KIẾN TRÚC TỔNG THỂ

```text
                         ┌──────────────┐
                         │     POS      │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │   COMMANDS   │
                         └──────┬───────┘
                                │
┌──────────────┐         ┌──────▼───────┐         ┌──────────────┐
│   QUANLY     │────────►│ DOMAIN CORE  │◄────────│  REPORTING   │
└──────────────┘         └──────┬───────┘         └──────────────┘
                                │
                         ┌──────▼───────┐
                         │  FIFO CORE   │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    ↓                       ↓
               LIVE FIFO               TRACE DATA
                    │                       │
                    └───────────┬───────────┘
                                ↓
                         COMPACTION ENGINE
                                ↓
                       HISTORICAL SNAPSHOT
                                ↓
                         UNIFIED READ
```

Protected infrastructure nằm ngoài domain core:

```text
BankPaymentAdapter
PrinterAdapter
ScannerAdapter
NativeBridgeAdapter
```

---

# 4. PHASE 0 — ARCHITECTURE & LEGACY AUDIT

## Mục tiêu

**Không code.**

Xác định chính xác hệ thống cũ đang làm gì để:

- tận dụng dữ liệu;
- hiểu nghiệp vụ;
- hiểu behavior;
- nhận diện legacy constraints;
- không copy legacy architecture.

## 0.1 Data audit

Audit:

```text
inventory
containers / units
stock transactions
orders / bills
recipes
BTP
receiving
stock count
waste / lost
snapshots
reports
```

## 0.2 Snapshot / archive / compaction audit

Phải tìm:

- bill snapshot;
- revenue snapshot;
- daily snapshot;
- weekly/monthly snapshot;
- archive mechanism;
- compact mechanism;
- record nào bị xóa;
- record nào được giữ;
- read path của snapshot;
- read path còn truy raw.

## 0.3 FIFO audit

Phải xác định:

```text
Unit
UnitBase
baseQty
Open
Consumption
FIFO allocation
Debt
Finish
Waste
Lost
Reversal
Rebuild
Recompute
```

## 0.4 Dependency audit

Các chain bắt buộc:

```text
SALE
 → recipe
 → FIFO
 → ledger
 → recompute
 → reporting
```

```text
RECEIVING
 → Unit / untracked
 → ledger
 → projection
 → recompute
```

```text
STOCK COUNT
 → observation
 → approval
 → physical reconciliation
 → projection
```

```text
BTP
 → raw FIFO
 → prep batch
 → yield
 → prep Unit
 → sale
```

```text
REVERSAL
 → original lineage
 → reverse allocation
 → untracked fallback nếu cần
 → projection
```

## 0.5 Bug report mapping

Bug report là:

```text
REGRESSION CONSTRAINT
+
ARCHITECTURAL WARNING
+
LEGACY BEHAVIOR EVIDENCE
```

Không patch theo symptom.

Protocol:

```text
BUG
 ↓
TRACE DATA
 ↓
TRACE DEPENDENCY
 ↓
IDENTIFY OWNER
 ↓
DESIGN CONTRACT
 ↓
IMPLEMENT LATER
 ↓
TEST
 ↓
REGRESSION
```

## Deliverables

```text
LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md
LEGACY-FIFO-AUDIT.md
```

## Gate

Phase 0 PASS khi:

- legacy data map đủ;
- snapshot/archive behavior hiểu đủ;
- FIFO behavior hiểu đủ;
- critical dependencies map đủ;
- bug constraints map đủ;
- các điểm ambiguity được đánh dấu, không đoán.

## Status

```text
CURRENT
```

---

# 5. PHASE 1 — CANONICAL FOUNDATION + STORE CONTEXT

## Mục tiêu

Đặt canonical foundation trước domain implementation.

## Canonical hierarchy

```text
ORGANIZATION
 ↓
STORE
 ↓
RUNTIME INSTANCE
 ↓
STORE CONTEXT
 ↓
DOMAIN CORE
```

## Context

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

Operational mutation tối thiểu phải có:

```text
organizationId
storeId
actorId
operationId
businessDate
```

## Legacy Adapter

```text
Legacy Firebase
      ↓
Legacy Adapter
      ↓
Canonical Domain Model
      ↓
Domain Engine
```

Schema legacy không được quyết định architecture mới.

## Access

Chốt:

- store scope;
- organization scope;
- ALL STORES;
- permissions;
- role;
- device;
- app instance.

## Protected infrastructure

Chỉ wrap:

```text
BankPaymentAdapter
PrinterAdapter
ScannerAdapter
NativeBridgeAdapter
```

Không rewrite semantics.

## Deliverables

```text
CANONICAL-DOMAIN-MODEL-V1.md
STORE-CONTEXT-CONTRACT-V1.md
OPERATION-IDEMPOTENCY-CONTRACT-V1.md
```

## Gate

Canonical identity + store context + operation semantics được lock.

---

# 6. PHASE 2 — FIFO IDENTITY & PHYSICAL STATE

## Mục tiêu

Định nghĩa physical truth.

## Unit

Canonical Unit:

```text
unitId
code / label
itemId
storeId
receiptId
supplier
baseQty
unitBase
costBasis
status
openedAt
openedBy
systemExhaustedAt
finishedAt
finishedBy
lifecycle
```

## Lifecycle

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

Branch:

```text
LOST
FOUND
WASTE
REVERSED
ADJUSTED
```

## System exhaustion vs physical finish

```text
systemExhaustedAt
```

= hệ thống tính `unitBase = 0`.

```text
finishedAt
finishedBy
```

= nhân viên xác nhận physical finish.

Hai thời điểm có thể khác nhau.

## Physical reconciliation

Khi cân/đếm:

```text
READ FRESH STATE
 ↓
actualQty
 ↓
delta = actualQty - currentUnitBase
 ↓
PHYSICAL_RECONCILIATION
 ↓
unitBase = actualQty
```

Không lấy cache cũ làm physical truth.

## Gate

Có thể xác định chính xác physical quantity và identity của nó.

---

# 7. PHASE 3 — FIFO ENGINE

## Mục tiêu

FIFO Engine trở thành owner duy nhất của FIFO semantics.

## Responsibilities

```text
SelectEligibleUnit
AllocateConsumption
UpdateUnitBase
HandleDebt
OpenUnit
FinishUnit
SystemExhaustion
PhysicalReconciliation
ReverseAllocation
RebuildUnitState
```

## Ownership

```text
FIFO Engine = OWNER
POS          = CALLER
QUANLY       = CALLER / REVIEWER
```

Không:

```text
POS → currentStock
QUANLY → currentStock
```

Mà:

```text
CLIENT
 ↓
COMMAND
 ↓
FIFO ENGINE
 ↓
UNIT STATE
 ↓
LEDGER
 ↓
PROJECTION
```

## FIFO allocation contract

```text
Bill
 → Bill Line
 → Recipe Version
 → Component
 → Requirement
 → Unit Allocation
 → UnitBase before
 → UnitBase after
```

## Debt

Legacy debt/carry semantics phải audit và canonicalize trước khi lock.

## Rebuild

Engine phải có khả năng rebuild Unit state từ authoritative physical/event data.

## Gate

Pass:

- partial consumption;
- multi-unit consumption;
- exhaustion;
- debt;
- opening;
- finishing;
- waste;
- lost/found;
- reversal;
- reconciliation;
- retry;
- rebuild;
- ambiguous network outcome.

---

# 8. PHASE 4 — TRACEABILITY GRAPH

## Mục tiêu

Xây trace hai chiều.

## Forward

```text
SUPPLIER
 ↓
PURCHASE
 ↓
RECEIPT
 ↓
UNIT
 ↓
OPEN
 ↓
FIFO ALLOCATION
 ↓
BILL / BTP / WASTE / LOST / REVERSAL / ADJUSTMENT
```

## Reverse

```text
UNIT
 ↓
ALL ALLOCATIONS
 ↓
BILL / BTP / WASTE / LOST / REVERSAL / ADJUSTMENT
```

## Required questions

Hệ thống phải trả lời:

> Unit này nhận từ đâu?

> Unit này đã dùng cho đâu?

> Bill này lấy nguyên liệu từ Unit nào?

> 1.2kg thiếu của item này đi đâu?

> Khoản waste này xuất phát từ Unit nào?

> Reversal này đảo allocation nào?

## Dependency registry

Concept:

```text
TRACE_DEPENDENCY
sourceType
sourceId
referencedBy[]
status
```

## Gate

Forward + reverse trace hoàn chỉnh cho các domain đã xây.

---

# 9. PHASE 5 — RECIPE / COST / BTP

## Recipe

```text
Recipe Master
 ↓
Recipe Version
 ↓
Effective From / To
 ↓
Store applicability
 ↓
Consumption
```

Historical bill giữ:

```text
recipeVersionId
```

## Cost

Consumption giữ:

```text
CostBasis
```

Không historical recalc bằng current cost.

## BTP

```text
RAW FIFO UNIT
 ↓
FIFO CONSUMPTION
 ↓
PREP BATCH
 ↓
YIELD
 ↓
PREP UNIT
 ↓
FIFO
 ↓
SALE
```

## Actual vs theoretical

Recipe tạo theoretical requirement.

FIFO + physical events tạo actual.

Variance được tính giữa hai lớp.

## Gate

- historical recipe immutable;
- historical cost deterministic;
- BTP trace xuống raw FIFO;
- actual/theoretical tách biệt.

---

# 10. PHASE 6 — HISTORICAL SNAPSHOT + COMPACTION

## Mục tiêu

Đưa FIFO data vào lifecycle thứ hai.

## Lifecycle

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

## Compact boundary

Unit chỉ được compact khi:

```text
finished
AND all consumption resolved
AND all reversal resolved
AND all correction resolved
AND all approval resolved
AND all dependencies represented
```

## Snapshot minimum

```text
identity
receipt
supplier
initial qty
cost basis
open
consumption
bill references
BTP references
recipe versions
COGS
waste
lost
adjustment
reversal
system exhaustion
physical finish
variance
audit / revision
```

Không được biến thành aggregate không truy nguyên.

## Verification

```text
RAW
 ↓
BUILD SNAPSHOT
 ↓
RECALCULATE
 ↓
COMPARE
 ↓
PASS
 ↓
COMPACT
```

Chỉ PASS mới được compact.

## Purge

Purge chỉ khi:

```text
snapshot verified
+
trace dependency safe
+
no unresolved correction
+
no unresolved reference
```

Interval:

```text
daily / weekly / monthly / yearly
```

chỉ là scheduling policy, không tự tạo quyền purge.

## Historical correction

```text
Snapshot v1
 ↓
Correction
 ↓
Rebuild affected scope
 ↓
Snapshot v2
```

Không UPDATE mù.

## Gate

Compact không làm thay đổi canonical read result.

---

# 11. PHASE 7 — UNIFIED READ LAYER

## Mục tiêu

Tạo một read gateway duy nhất.

## APIs

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

## Internal resolution

```text
READ REQUEST
 ↓
READ SERVICE
 ↓
LIVE SOURCE
+
COMPACT SOURCE
 ↓
CANONICAL READ MODEL
```

UI không biết source.

## Required guarantee

```text
LIVE RESULT
==
COMPACT RESULT
```

với cùng canonical query.

## Gate

Không còn UI nào tự branch:

```text
if old data
if archive
if compact
if raw exists
```

---

# 12. PHASE 8 — DOMAIN COMMANDS

## Mục tiêu

Tất cả business mutation đi qua command pipeline.

## Command pipeline

```text
COMMAND
 ↓
VALIDATE
 ↓
READ CANONICAL STATE
 ↓
CALCULATE
 ↓
MUTATION PLAN
 ↓
IDEMPOTENCY
 ↓
DOMAIN / FIFO ENGINE
 ↓
LEDGER
 ↓
PROJECTION
 ↓
AUDIT
 ↓
VERIFY
```

## POS command groups

### Sales

```text
StartCheckout
ApplyPromotion
CapturePayment
SplitPayment
FinalizeOrder
ReverseOrder
```

### Inventory

```text
OpenContainer
MarkOutOfStock
ReceiveGoods
CountStock
RecordWaste
TransferStock
ReportLostContainer
RestoreFoundContainer
```

### Prep

```text
StartPrepBatch
RecordPrepMeasurement
RecordPrepYield
ConsumePrep
RecordPrepWaste
```

### Shift

```text
CheckIn
CheckOut
OpenDay
RecordHandover
CloseDay
```

## QUANLY command groups

### Master

```text
CreateProduct
UpdateProduct
PublishProductVersion
CreateRecipe
PublishRecipeVersion
CreateEmployee
AssignEmployeeToStore
CreateLocation
CreateVessel
ConfigurePromotion
```

### Approval

```text
ApproveStockCount
RejectStockCount
ApproveLostContainer
RejectLostContainer
ApproveExpense
RejectExpense
ReviewReceivingCorrection
```

### Correction

```text
AdjustInventory
AdjustPrepStock
CorrectReceiving
ReverseOrder
CorrectLocationStock
CorrectBatchYield
```

### Reporting

```text
BuildStoreReport
BuildCrossStoreReport
ReconcileInventory
ReconcilePrep
```

## Gate

Business mutation không bypass command/core.

---

# 13. PHASE 9 — POS

## Rule

POS là thin client.

```text
POS UI
 ↓
COMMAND
 ↓
CORE
 ↓
READ MODEL
```

## Sale

```text
Checkout
 ↓
Payment
 ↓
Recipe Version
 ↓
FIFO allocation
 ↓
UnitBase
 ↓
Consumption lineage
 ↓
COGS
 ↓
Bill
```

## Payment

Giữ:

```text
BankPaymentAdapter
```

Không đồng nhất:

```text
bankOrderId
≠ operationId
```

## APK

Giữ:

```text
PrinterAdapter
ScannerAdapter
NativeBridgeAdapter
```

Print retry không được tạo order/payment/stock lần hai.

## Gate

POS không còn business inventory logic độc lập.

---

# 14. PHASE 10 — QUANLY

## Rule

QUANLY không xây inventory system thứ hai.

```text
QUANLY UI
 ↓
READ LAYER
+
COMMANDS
 ↓
SHARED CORE
```

## Drill example

```text
Store
 ↓
Item
 ↓
Unit
 ↓
Bill / BTP / Waste / Lost
 ↓
Recipe
 ↓
Actor
 ↓
Timeline
```

Nếu live:

```text
→ LIVE FIFO
```

Nếu compact:

```text
→ HISTORICAL SNAPSHOT
```

Read Layer tự quyết định.

## Gate

QUANLY có thể điều tra physical discrepancy mà không đọc trực tiếp raw storage để tự suy luận.

---

# 15. PHASE 11 — REPORTING / RECONCILIATION

## Reports

```text
Revenue
COGS
Gross Margin
Waste
Lost
Inventory
Usage
BTP
Variance
Store comparison
ALL STORES
```

## Report architecture

```text
LIVE
+
COMPACT
 ↓
UNIFIED READ
 ↓
REPORT
```

Không:

```text
REPORT
 ↓
raw Firebase
 ↓
tự tính lại business truth
```

## Reconciliation layers

```text
Physical
 ↕
Ledger
 ↕
Projection
 ↕
Report
```

Discrepancy phải drill về source.

## Gate

Một business fact có một canonical semantic.

---

# 16. PHASE 12 — SHADOW / OLD-NEW COMPARISON

## Production

```text
OLD SYSTEM = SOLE WRITER
```

## New system

```text
READ
SIMULATE
COMPARE
```

Không production write.

## Compare matrix

```text
SALE
FIFO
STOCK
COGS
WASTE
BTP
RECEIVING
STOCK COUNT
REVERSAL
SNAPSHOT
REPORT
```

## Comparison result

```text
OLD RESULT
NEW RESULT
DIFF
CAUSE
SEVERITY
STATUS
```

## Required scenario classes

```text
normal
concurrent
retry
double-submit
lost ACK
partial failure
reversal
correction
recompute
compact
historical read
```

## Gate

Không còn unexplained material difference.

---

# 17. PHASE 13 — PRODUCTION CUTOVER

## Sequence

```text
OLD WRITER STOP
      ↓
FINAL RECONCILIATION
      ↓
NEW SYSTEM SOLE WRITER
      ↓
OLD SYSTEM RETAINED
      ↓
ROLLBACK WINDOW
```

## Preconditions

```text
Phase 0 PASS
Phase 1 PASS
Phase 2 PASS
Phase 3 PASS
Phase 4 PASS
Phase 5 PASS
Phase 6 PASS
Phase 7 PASS
Phase 8 PASS
Phase 9 PASS
Phase 10 PASS
Phase 11 PASS
Phase 12 PASS
```

## Cutover rule

Không partial migration.

Không dual writer production.

Cutover chỉ một lần.

---

# 18. REGRESSION MASTER SUITE

Bug legacy trở thành regression constraint xuyên suốt.

## Inventory / projection

```text
management adjustment
recompute overwrite
untracked vs Unit representation
absolute count
variance delta
```

## Unit / FIFO

```text
open
consume
partial consume
multi-unit
system exhausted
physical finish
debt
rebuild
recompute
```

## Weighing

```text
unit conversion
stale unit snapshot
invalid input
unfinished weighing
state reset
mixed manual / vessel weighing
```

## Receiving

```text
good + damaged
tagged + untracked
retry
partial failure
correction
```

## Stock count

```text
duplicate submit
approval with failed line
absolute observation
variance delta
retry
partial application
```

## BTP

```text
start batch
consumption
yield
yield correction
waste
retry
lost ACK
```

## Reversal

```text
allocated reversal
untracked reversal
repeated reversal
ambiguous outcome
```

## Lost / Found

```text
lost
approval
found
restore
retry
repeat restore
```

## Add-on

```text
multiple additions
stable tx identity
retry
```

## Compaction

```text
snapshot
verification
compact
purge eligibility
historical read
correction after compact
snapshot v2
```

---

# 19. PHASE DEPENDENCY / NO-SKIP MATRIX

```text
P0  Legacy Audit
 ↓
P1  Canonical Foundation
 ↓
P2  Unit / Physical State
 ↓
P3  FIFO Engine
 ↓
P4  Traceability
 ↓
P5  Recipe / Cost / BTP
 ↓
P6  Snapshot / Compact
 ↓
P7  Unified Read
 ↓
P8  Commands
 ↓
P9  POS
 ↓
P10 QUANLY
 ↓
P11 Reporting
 ↓
P12 Shadow
 ↓
P13 Cutover
```

### Không được:

```text
P3 → P9
```

bỏ qua trace/compact/read/commands.

### Không được:

```text
P6 → UI tự đọc raw
```

### Không được:

```text
POS FIFO logic
+
QUANLY FIFO logic
```

### Không được:

```text
Old system writer
+
New system writer
```

trong production.

---

# 20. DOCUMENT OUTPUT MAP

## Master

```text
GIEO-SYSTEM-REBUILD-PLAN.md
```

## Phase 0

```text
LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md
LEGACY-FIFO-AUDIT.md
```

## Foundation

```text
CANONICAL-DOMAIN-MODEL-V1.md
STORE-CONTEXT-CONTRACT-V1.md
OPERATION-IDEMPOTENCY-CONTRACT-V1.md
```

## FIFO

```text
FIFO-CORE-ARCHITECTURE-V2.md
```

## Compaction

```text
FIFO-COMPACTION-CONTRACT-V1.md
```

## Read

```text
UNIFIED-READ-LAYER-CONTRACT-V1.md
```

## Sau này nếu cần

```text
DOMAIN-COMMAND-CATALOG-V1.md
TRACEABILITY-CONTRACT-V1.md
SHADOW-COMPARISON-MATRIX-V1.md
CUTOVER-RUNBOOK-V1.md
```

Các tài liệu chuyên sâu không thay thế Master Plan.

---

# 21. DEFINITION OF DONE — TOÀN HỆ THỐNG

Hệ thống chỉ được coi là hoàn thành khi:

```text
[ ] FIFO là root physical/traceability core
[ ] Unit/UnitBase identity được lock
[ ] Unit lifecycle được lock
[ ] FIFO Engine là owner duy nhất
[ ] Physical / Ledger / Projection tách biệt
[ ] Mutation có stable operationId
[ ] Retry idempotent
[ ] Multi-step workflow có recovery/state
[ ] Reversal giữ lineage
[ ] Recipe lịch sử immutable/versioned
[ ] Cost lịch sử có CostBasis
[ ] Actual vs theoretical tách biệt
[ ] BTP trace xuống raw FIFO
[ ] Traceability hai chiều
[ ] Compact có dependency check
[ ] Snapshot được verify trước compact
[ ] Raw purge có safety gate
[ ] Historical correction có revision/rebuild
[ ] Unified Read đọc LIVE + COMPACT
[ ] POS không có FIFO engine riêng
[ ] QUANLY không có inventory engine riêng
[ ] Reporting không có calculation engine riêng
[ ] Bank/APK protected boundary không bị phá
[ ] Regression suite pass
[ ] Shadow comparison pass
[ ] Final reconciliation pass
[ ] Cutover readiness pass
```

---

# 22. QUY TẮC UPDATE MASTER PLAN

Sau mỗi Phase, cập nhật đúng cấu trúc:

```text
PHASE STATUS
↓
FINDINGS
↓
DECISIONS
↓
LOCKED CONTRACTS
↓
DELIVERABLES
↓
TESTS
↓
RISKS
↓
NEXT GATE
```

Không xóa lịch sử quyết định.

Nếu architecture thay đổi:

```text
WHY
WHAT CHANGED
AFFECTED PHASES
AFFECTED CONTRACTS
MIGRATION / COMPATIBILITY IMPACT
```

phải được ghi lại.

---

# 23. QUY TẮC KHI BẮT ĐẦU MỖI MODULE

Trước khi xây bất kỳ module nào, phải trả lời:

```text
1. Physical truth nằm ở đâu?
2. Owner của mutation là ai?
3. Unit / UnitBase thay đổi thế nào?
4. Ledger gì được ghi?
5. Projection nào thay đổi?
6. operationId là gì?
7. Retry thế nào?
8. Reversal thế nào?
9. Forward trace thế nào?
10. Reverse trace thế nào?
11. Sau compact đọc lại thế nào?
12. Regression case nào bảo vệ nó?
```

Nếu chưa trả lời được → **chưa được implementation**.

---

# 24. TRẠNG THÁI KẾ HOẠCH HIỆN TẠI

## Planning status

```text
PLAN COMPLETE
READY FOR EXECUTION
```

## Execution status

```text
PHASE 0 — NEXT
```

## Immediate execution order

```text
1. LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md
2. LEGACY-FIFO-AUDIT.md
3. Update findings into this Master Plan
4. FIFO-CORE-ARCHITECTURE-V2.md
5. FIFO-COMPACTION-CONTRACT-V1.md
6. UNIFIED-READ-LAYER-CONTRACT-V1.md
7. Lock Unit Identity / Lifecycle / FIFO Engine
8. Begin implementation only after contracts are locked
```

---

# 25. FINAL ARCHITECTURAL STATEMENT

> **Không xây một POS rồi gắn kho vào sau.**
>
> **Xây một Physical + FIFO + Traceability Core trước; sau đó cho Recipe, Cost, BTP, History, Read, Commands, POS, QUANLY và Reporting sử dụng cùng một nền.**

Vòng đời dữ liệu:

```text
PHYSICAL TRUTH
      ↓
FIFO
      ↓
TRACEABILITY
      ↓
HISTORICAL SNAPSHOT
      ↓
COMPACTION
      ↓
UNIFIED READ
```

Vòng đời ứng dụng:

```text
CORE
 ↓
COMMANDS
 ↓
POS / QUANLY / REPORTING
```

Và production lifecycle:

```text
LEGACY WRITER
      ↓
SHADOW
      ↓
COMPARE
      ↓
RECONCILE
      ↓
NEW SOLE WRITER
```

**Đây là kế hoạch xây dựng hoàn chỉnh. Từ đây nhiệm vụ là thực thi từng Phase và cập nhật file này, không quay lại thiết kế một roadmap khác.**
