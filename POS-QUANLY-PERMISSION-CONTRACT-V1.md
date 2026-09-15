# GIEO SYSTEM — POS ↔ QUANLY PERMISSION CONTRACT V1

## 1. Mục đích

Chốt ranh giới quyền hạn giữa POS và QUANLY trong hệ thống mới.

**POS và QUANLY là hai giao diện trên cùng Shared Domain Core.** Không được có hai bộ logic FIFO, inventory, COGS, BTP hoặc mutation riêng.

```text
POS / QUANLY
      ↓
Authorization
      ↓
Command
      ↓
Shared Domain Core
      ↓
FIFO / Inventory / BTP / Sales / ...
```

UI permission chỉ là UX. Quyền phải được kiểm tra lại ở Command/Domain layer.

---

# 2. Mental Model

```text
ORGANIZATION
    ↓
STORE
    ↓
┌───────────────┬────────────────┐
│      POS      │    QUANLY      │
│ Operational   │ Management     │
│ execution     │ control/review │
└───────┬───────┴───────┬────────┘
        └───────┬───────┘
                ↓
       SHARED DOMAIN CORE
                ↓
      FIFO / INVENTORY / BTP
      SALES / RECIPE / COST
      SNAPSHOT / COMPACTION
```

POS không đơn giản là "ít quyền hơn" QUANLY. Hai bên có **authority khác nhau theo nghiệp vụ**.

---

# 3. Ba lớp quyền

## EXECUTE

Quyền thực hiện nghiệp vụ vận hành tại cửa hàng:
- bán hàng,
- nhận hàng,
- mở Unit,
- báo hết,
- cân/đếm,
- waste,
- BTP,
- ca làm việc.

Chủ yếu là POS.

## REVIEW / APPROVE / CORRECT

Quyền kiểm soát:
- duyệt stock count,
- duyệt lost,
- sửa receiving,
- adjustment inventory,
- correction batch yield,
- management reversal,
- reconciliation.

Chủ yếu là QUANLY.

## MASTER / CONFIGURE

Quyền thay đổi nền:
- Product,
- Recipe/Recipe Version,
- Price,
- Employee,
- Store assignment,
- Promotion,
- Finance/stock policies.

Management/Admin.

---

# 4. POS — QUYỀN CHÍNH

POS là **operational writer tại store**.

POS được phép tạo các sự kiện vận hành hàng ngày.

## SALES

POS:
- StartCheckout
- ApplyPromotion
- CapturePayment
- SplitPayment
- FinalizeOrder
- ReverseOrder nếu policy cho phép

Flow:

```text
POS
 ↓
Checkout
 ↓
Payment
 ↓
FinalizeOrder
 ↓
Recipe Version
 ↓
FIFO Consumption
 ↓
UnitBase
 ↓
COGS / Ledger / Projection
```

POS không được tự:
- sửa currentStock,
- phân bổ FIFO,
- sửa historical COGS,
- sửa recipe lịch sử,
- xoá bill.

---

# 5. POS — INVENTORY / FIFO

POS được thực hiện:

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

Nhưng POS **không sở hữu FIFO Engine**.

```text
POS
 ↓
Command
 ↓
FIFO Core
 ↓
Unit state
```

Không được:

```text
POS → update currentStock trực tiếp
POS → tự sửa unitBase trực tiếp
```

---

# 6. POS — UNIT / LABEL

POS được:
- attach/scan label khi receiving,
- ghi nhận Unit qua receiving command,
- scan mở Unit,
- sử dụng thông qua FIFO,
- báo hết vật lý,
- ghi actual observation,
- ghi waste theo policy.

POS không được:
- đổi Unit identity,
- đổi receipt history,
- đổi historical cost,
- xoá Unit,
- sửa allocation history,
- xoá FIFO event.

Correction phải qua command có authority phù hợp.

---

# 7. POS — WEIGHING / PHYSICAL COUNT

POS được ghi nhận:

```text
actualQty
```

Flow bắt buộc:

```text
POS
 ↓
Read fresh Unit state
 ↓
Calculate delta
 ↓
PHYSICAL_RECONCILIATION
 ↓
FIFO / Unit Engine
```

Nếu discrepancy cần management review, POS tạo record/request; không tự approve management adjustment.

---

# 8. POS — BTP / SHIFT

POS được vận hành:

```text
StartPrepBatch
RecordPrepMeasurement
RecordPrepYield
ConsumePrep
RecordPrepWaste

CheckIn
CheckOut
OpenDay
RecordHandover
CloseDay
```

POS không tự sửa historical batch/yield/locked shift nếu correction cần management authority.

---

# 9. POS — PAYMENT / HARDWARE

POS được khởi tạo payment theo policy.

Bank integration là protected adapter:

```text
BankPaymentAdapter
```

Không thay đổi:
- bankOrderId semantics,
- VietQR,
- Cloud Run/webhook,
- RTDB confirmation path,
- listener/manual fallback.

```text
bankOrderId ≠ operationId
```

POS được gọi:

```text
ScannerAdapter
PrinterAdapter
NativeBridgeAdapter
```

Print retry không được tạo lại order/payment/stock.

---

# 10. QUANLY — QUYỀN CHÍNH

QUANLY là **management / review / control / correction layer**.

QUANLY có quyền đọc rộng hơn POS:

- inventory,
- FIFO trace,
- Units,
- consumption,
- receiving,
- stock count,
- waste,
- lost,
- BTP,
- bills,
- revenue,
- COGS,
- recipe versions,
- cost,
- audit,
- reconciliation,
- snapshots,
- compact history.

Có thể chọn:

```text
Store A
Store B
ALL STORES
```

`ALL STORES` mặc định là aggregation/read scope, không phải quyền mutate tất cả store.

---

# 11. QUANLY — APPROVAL

```text
ApproveStockCount
RejectStockCount

ApproveLostContainer
RejectLostContainer

ApproveExpense
RejectExpense

ReviewReceivingCorrection
```

Approval phải fail-closed.

Nếu required mutation/line còn lỗi:

```text
DO NOT APPROVE
```

---

# 12. QUANLY — INVENTORY CORRECTION

QUANLY được:

```text
AdjustInventory
AdjustPrepStock
CorrectReceiving
CorrectLocationStock
CorrectBatchYield
```

Nhưng vẫn phải qua Shared Domain Core:

```text
QUANLY
 ↓
Correction Command
 ↓
Authorization
 ↓
Fresh canonical state
 ↓
Calculate
 ↓
MutationPlan
 ↓
FIFO-aware mutation
 ↓
Ledger
 ↓
Projection
 ↓
Audit
```

Không:

```text
QUANLY → update currentStock trực tiếp
QUANLY → update unitBase trực tiếp
```

---

# 13. QUANLY — FIFO CORRECTION

QUANLY có authority correction nhưng **không sở hữu FIFO semantics**.

Ví dụ chỉnh actual Unit:

```text
PHYSICAL_RECONCILIATION
```

không phải:

```text
UPDATE unitBase = ...
```

Mọi correction phải ghi:

```text
operationId
actorId
reason
before
calculation
after
audit
```

---

# 14. QUANLY — BILL / REVERSAL

QUANLY có management reversal/correction theo policy:

```text
ReverseOrder
```

Reversal phải giữ lineage:

```text
Bill
 ↓
Recipe Version
 ↓
Consumption
 ↓
Unit Allocation
```

Không xoá bill để sửa sai.

Reversal phải idempotent và FIFO-aware.

---

# 15. QUANLY — PRODUCT / RECIPE / COST

QUANLY/management sở hữu:

```text
CreateProduct
UpdateProduct
PublishProductVersion

CreateRecipe
PublishRecipeVersion
```

POS chỉ đọc effective RecipeVersion.

Recipe lịch sử không được overwrite.

```text
new change → new RecipeVersion
```

Historical COGS phải dùng:

```text
actual FIFO consumption
+
historical RecipeVersion
+
historical CostBasis
```

Không dùng current recipe/current cost để tái tính lịch sử.

---

# 16. QUANLY — BTP / RECEIVING / STOCK COUNT

QUANLY được:
- review BTP,
- reconcile BTP,
- correct batch yield,
- adjust prep stock theo authority,
- review receiving,
- correct receiving,
- review discrepancy,
- approve/reject stock count.

BTP vẫn dùng chung FIFO semantics:

```text
Raw FIFO Units
 ↓
BTP
 ↓
Prep Unit
 ↓
FIFO
 ↓
Sale
```

---

# 17. QUANLY — LOST / FOUND

POS:

```text
ReportLostContainer
RestoreFoundContainer
```

QUANLY:

```text
ApproveLostContainer
RejectLostContainer
```

Lost approval phải đồng bộ:

```text
Lost Report
 ↓
Container State
 ↓
Inventory State
 ↓
FIFO / Unit State
 ↓
Audit
```

---

# 18. QUANLY — REPORTING

QUANLY được xem:

```text
Revenue
COGS
Gross Margin
Waste
Lost
Inventory
Consumption
BTP
Variance
Store Performance
Cross-store Performance
```

Không tự xây FIFO calculation riêng.

Tất cả đọc qua:

```text
Unified Read Layer
```

và phải hỗ trợ:

```text
LIVE + COMPACT
```

---

# 19. QUANLY — COMPACTION / HISTORY

QUANLY được:
- xem compact history,
- xem historical Unit,
- xem snapshot,
- xem compact status,
- xem correction/reconciliation history.

QUANLY thông thường **không được purge raw FIFO**.

Compaction/purge là system-controlled process.

---

# 20. QUANLY KHÔNG ĐỒNG NGHĨA MỌI QUANLY USER CÓ MỌI QUYỀN

Tối thiểu cần phân biệt:

```text
POS OPERATOR
STORE MANAGER
QUANLY OPERATOR
QUANLY ADMIN
SYSTEM ADMIN
```

Quyền cuối cùng dựa trên:

```text
Actor
+
Store Scope
+
Command
+
Authority
```

---

# 21. MA TRẬN QUYỀN

| Domain / Action | POS | QUANLY | Ghi chú |
|---|---|---|---|
| Bán hàng | EXECUTE | REVIEW/CORRECT theo authority | |
| Payment | EXECUTE | REVIEW/CORRECT | Bank protected |
| FinalizeOrder | YES | YES theo authority | Shared command |
| ReverseOrder | policy | YES | FIFO-aware |
| OpenUnit | YES | YES theo authority | Shared FIFO command |
| FIFO Allocation | INDIRECT | INDIRECT | FIFO Core owner |
| ReceiveGoods | YES | REVIEW/CORRECT | |
| Physical Count | YES | REVIEW/APPROVE | |
| Waste | YES | REVIEW/CORRECT | |
| Report Lost | YES | APPROVE/REJECT | |
| Found | YES | REVIEW/CORRECT | |
| Inventory Adjustment | limited/request | YES | FIFO-aware |
| BTP operation | YES | REVIEW/CORRECT | |
| Batch Yield Correction | NO/limited | YES | |
| Create/Edit Recipe | NO | YES | |
| Publish RecipeVersion | NO | YES | |
| Historical Recipe Edit | NO | NO direct overwrite | New version/correction |
| Cost Master | NO | YES | |
| Historical COGS Correction | NO | YES by correction flow | |
| Product Master | NO | YES | |
| Promotion Config | limited/use | YES | |
| Stock Count Approval | NO | YES | |
| Lost Approval | NO | YES | |
| Receiving Correction | NO | YES | |
| Location Stock Correction | NO | YES | |
| Reports | operational | YES | |
| Cross-store Reports | NO/limited | YES | |
| Snapshot Read | limited | YES | |
| Compact Read | via read layer | YES | |
| Raw Purge | NO | NO | System process |
| Permission Config | NO | Admin only | |
| Bank Config | NO | Protected/Admin | |
| APK Config | NO business mutation | Protected/Admin | |

---

# 22. READ VS WRITE OWNERSHIP

Có quyền đọc không đồng nghĩa có quyền ghi.

Ví dụ:

```text
QUANLY đọc FIFO = YES
QUANLY tự sửa FIFO UnitBase = NO

POS đọc inventory = YES
POS tự sửa currentStock = NO
```

---

# 23. STORE SCOPE

Một actor có thể có:

```text
STORE_A
STORE_B
ALL_STORES
```

Mutation phải kiểm tra target store.

Ví dụ actor chỉ có A:

```text
AdjustInventory(targetStore=B)
→ DENY
```

`ALL_STORES` không tự động có mutation authority.

Multi-store mutation chỉ được phép nếu command/policy cho phép:

```text
targetStoreIds[]
+
explicit authority
+
per-store validation
```

---

# 24. PERMISSION CHECK PHẢI Ở DOMAIN/COMMAND

Không đủ:

```text
if (isManager) show button
```

Phải:

```text
Command
 ↓
Authorization
 ↓
Actor
Store Scope
Command
Authority
 ↓
ALLOW / DENY
```

Bypass UI vẫn phải bị DENY.

---

# 25. AUDIT

Mọi business mutation phải ghi:

```text
operationId
actorId
source
organizationId
storeId
command
reason
before
calculation
mutation
after
timestamp
status
```

Approval/correction đặc biệt phải có reason.

---

# 26. COMPACTION PERMISSION

Compaction là system process:

```text
FIFO Core
 ↓
Compaction Engine
 ↓
Eligibility
 ↓
Snapshot
 ↓
Verification
 ↓
Purge
```

POS/QUANLY chỉ:
- đọc status,
- xem historical compact,
- tạo correction request nếu có authority.

Không tự xoá raw FIFO.

---

# 27. HARD INVARIANTS

1. POS không trực tiếp mutate business-state Firebase.
2. QUANLY không trực tiếp mutate business-state Firebase.
3. POS không có FIFO engine riêng.
4. QUANLY không có FIFO engine riêng.
5. FIFO Core sở hữu FIFO physical semantics.
6. POS là operational writer tại store.
7. QUANLY là management/review/correction/master layer theo authority.
8. Approval fail-closed.
9. Correction có operationId.
10. Retry idempotent.
11. Không delete transaction history để sửa sai.
12. Recipe history immutable/versioned.
13. Cost history historical.
14. ALL STORES mặc định aggregation/read.
15. Compaction/purge system-controlled.
16. Mọi historical read phải đọc LIVE + COMPACT.
17. Permission enforce ở Command/Domain layer.
18. QUANLY authority không thay đổi ownership của FIFO Core.
19. POS operational authority không cho phép sửa historical truth.
20. Mọi cross-domain mutation phải audit được.

---

# 28. FINAL MODEL

```text
                    ORGANIZATION
                         │
                    STORE CONTEXT
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
             POS                 QUANLY
        Operational           Management
              │                     │
              └──────────┬──────────┘
                         ↓
                AUTHORIZATION LAYER
                         ↓
                  COMMAND LAYER
                         ↓
                 SHARED DOMAIN CORE
                         ↓
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
        FIFO          INVENTORY        BTP
          ↓              ↓              ↓
       TRACEABILITY / RECIPE / COST
                         ↓
              SNAPSHOT / COMPACTION
                         ↓
                 UNIFIED READ
                         ↓
              POS / QUANLY / REPORT
```

## Core principle

> **POS vận hành. QUANLY quản lý/kiểm soát. FIFO sở hữu traceability vật chất. Shared Domain Core sở hữu mutation semantics. Không UI nào được sở hữu business truth riêng.**
