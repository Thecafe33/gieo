# LEGACY → CANONICAL FIREBASE PATH MAP — V1

> Thay thế bảng nháp ở `GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md` §7 (đánh dấu `[GIẢ ĐỊNH]`) bằng dữ liệu đã audit thật từ `posgieo.html`/`quanlygieo.html`. Nguồn đầy đủ: `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §1, `LEGACY-FIFO-AUDIT.md` §1-2.
>
> Quy ước path canonical: `orgs/{organizationId}/stores/{storeId}/<domain>/{id}`. `organizationId`/`storeId` là **suy đoán cấu trúc**, không phải giá trị thật — hệ thống cũ là **single-store** (không tìm thấy `storeId`/`branch` nào trong code, xem `LEGACY-FIFO-AUDIT.md` mục recipe). Store context thật (§5 `GIEO-SYSTEM-REBUILD-PLAN.md`) sẽ cần 1 giá trị `storeId` mặc định duy nhất khi migrate, không có ambiguity về việc tách nhiều cửa hàng từ dữ liệu cũ.

---

# 1. NGUYÊN TẮC MAP

- Mỗi path legacy → đúng 1 domain package trong `packages/legacy-firebase-adapter/src/mappers/`.
- Path canonical KHÔNG copy tên field cũ 1:1 — domain core quyết định field (xem `FIFO-CORE-ARCHITECTURE-V2.md`), adapter chỉ map.
- RTDB legacy → **giữ nguyên vai trò "live/hot layer"** ở canonical (không phải chuyển hết sang Firestore) — đây là kiến trúc đã đúng ở legacy, không cần đổi động cơ lưu trữ, chỉ đổi namespace + schema.

---

# 2. BẢNG MAP CHI TIẾT

## 2.1 Unit / FIFO (lõi)

| Legacy | Loại | → Canonical (mới) | Ghi chú |
|---|---|---|---|
| `active_units_gieogieo/{itemId}/{containerId}` | RTDB | `orgs/{orgId}/stores/{storeId}/units/live/{itemId}/{unitId}` | Live layer — vẫn RTDB, chỉ đổi namespace |
| `stock_containers_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/units/{unitId}` | Nguồn thật cho `sealed`/`finished`; trở thành **Unit** canonical (packages/fifo-core) |
| `prep_batches_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/prepUnits/{unitId}` | Cùng mô hình Unit, `itemType='prep'` |
| `stock_transactions_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/ledger/{entryId}` | → `StockLedgerEntry` |
| `prep_transactions_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/ledger/{entryId}` | Gộp chung ledger với stock (cùng domain "consumption"), phân biệt bằng field `domain:'prep'` |
| `inventory_items_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/items/{itemId}` | `currentStock` → **projection**, không phải nguồn thật |
| `prep_items_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/prepItems/{prepId}` | |
| `reversal_unit_claims_gieogieo/{claimId}` | Firestore | `orgs/{orgId}/stores/{storeId}/operations/{operationId}` | Tổng quát hóa thành `Operation` idempotency record dùng chung mọi domain (không chỉ reversal) |
| `stock_counts_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/stockCounts/{countId}` | |
| `stock_lost_reports_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/lostReports/{reportId}` | **Cần thêm field/luồng approve còn thiếu ở legacy** (Bug #12) |
| `employee_stock_deductions_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/employeeDeductions/{id}` | |
| `refill_rules_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/config/refillRules/{id}` | |
| `storage_locations_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/locations/{locationId}` | |
| `purchase_orders_gieogieo/{id}`, `receiving_records_gieogieo/{id}` | Firestore | `orgs/{orgId}/stores/{storeId}/purchaseOrders/{id}`, `.../receivingRecords/{id}` | Nguồn sinh Unit mới |

## 2.2 Recipe / Cost / BTP

| Legacy | Loại | → Canonical (mới) | Ghi chú |
|---|---|---|---|
| `recipes_gieogieo/{menuRefKey}` | Firestore | `orgs/{orgId}/stores/{storeId}/recipes/{recipeId}/versions/{versionId}` | **BẮT BUỘC thêm tầng version** — legacy overwrite trực tiếp (vi phạm invariant #13, xem `LEGACY-FIFO-AUDIT.md` §13) |
| `topping_recipes_gieogieo/{id}` | Firestore | cùng dạng `recipes/{id}/versions/{v}` với `kind:'topping'` | |
| `price_history_gieogieo` | Firestore | `orgs/{orgId}/stores/{storeId}/costBasis/{itemId}/history/{entryId}` | **Giữ nguyên mô hình append-only** — đây là điểm ĐÚNG duy nhất của legacy, nhân rộng sang recipe |
| `cogs_gieogieo/togo` | Firestore | `orgs/{orgId}/stores/{storeId}/manualCostOverrides/{itemId}` | Fallback khi recipe chưa khai — giữ nguyên vai trò |
| `prep_forecasts_gieogieo` | Firestore | `orgs/{orgId}/stores/{storeId}/forecasts/{id}` | Ngoài phạm vi FIFO core, giữ nguyên |
| `packaging_*_gieogieo` (6 collection) | Firestore | `orgs/{orgId}/stores/{storeId}/packagingConfig/{id}` | Gộp namespace, giữ nguyên logic tính COGS bao bì |

## 2.3 Bill / Order

| Legacy | Loại | → Canonical (mới) | Ghi chú |
|---|---|---|---|
| `orders_gieogieo/{month}/{day}/{billId}` | RTDB | `orgs/{orgId}/stores/{storeId}/bills/live/{businessDate}/{billId}` | Live layer giữ RTDB |
| `orders_gieogieo_archive/{month}_{day}_{year}` | Firestore | `orgs/{orgId}/stores/{storeId}/bills/archive/{businessDate}` | **Giữ nguyên contract**: field `orders` chứa nguyên bill, không aggregate — đây là compaction-nhẹ đã đúng ở legacy |
| `billCounters_gieogieo` | RTDB | `orgs/{orgId}/stores/{storeId}/counters/bill/{businessDate}` | |
| `bill_deletions_gieogieo` | Firestore | `orgs/{orgId}/stores/{storeId}/auditLogs/{id}` (type=`bill_deletion`) | Gộp vào audit log chung |

## 2.4 Snapshot / Chốt sổ

| Legacy | Loại | → Canonical (mới) | Ghi chú |
|---|---|---|---|
| `daily_sales_cache_gieogieo/{date}` | Firestore | `orgs/{orgId}/stores/{storeId}/cache/dailySales/{date}` | **Vẫn là cache tính-lại-được**, KHÔNG lên cấp thành snapshot bất biến — giữ đúng phân tầng đã audit ở `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` §2.1 |
| `daily_closings_gieogieo`, `daily_openings_gieogieo`, `handover_records_gieogieo`, `shift_segments_gieogieo` | Firestore | `orgs/{orgId}/stores/{storeId}/shifts/{businessDate}(/segments/{seq})` | Sổ vận hành ca — giữ nguyên vai trò, không phải FIFO snapshot |
| `book_closings_gieogieo/{YYYY-MM}` | Firestore | `orgs/{orgId}/stores/{storeId}/snapshots/monthly/{period}` | **Đây là compaction thật** — chuẩn hóa theo `packages/compaction`, sửa cơ chế "mở lại" để KHÔNG xoá v1 (xem khuyến nghị §6 file snapshot audit) |

## 2.5 Bank payment / Protected infra (KHÔNG đổi semantics)

| Legacy | Loại | → Canonical | Ghi chú |
|---|---|---|---|
| `bank_confirmations/{orderId}` | RTDB | **GIỮ NGUYÊN path, không đổi** | Protected infra — webhook ngoài phạm vi rebuild, đổi path sẽ phá webhook đang chạy |
| `*_effects_gieogieo` (loyalty/voucher idempotency) | Firestore | `orgs/{orgId}/stores/{storeId}/loyaltyEffects/{billId}` | Giữ nguyên pattern idempotency-by-billId, tổng quát hóa cho FIFO Core |

---

# 3. PATH KHÔNG MIGRATE (ngoài phạm vi FIFO Core, giữ nguyên hoặc xử lý riêng ở Phase sau)

`employees_gieogieo`, `work_schedules_gieogieo`, `hr_settings_gieogieo`, `expenses_gieogieo`, `expense_categories_gieogieo`, `payment_methods_gieogieo`, `customers`, `rewards`, `alerts_gieogieo`, `menu_gieogieo`/`menu_togo_gieogieo`/`toppings_gieogieo`/`food_gieogieo` (menu hiển thị — không phải business data FIFO), `config_history_gieogieo`, `audit_logs_gieogieo`, `finance_gieogieo/current`, `daily_ops_gieogieo`.

---

# 4. GHI CHÚ CHO `packages/legacy-firebase-adapter`

- `paths/legacy-paths.ts` copy nguyên bảng cột "Legacy" ở trên — 1 hằng số / 1 path, không format chuỗi rải rác trong nhiều file (khác legacy).
- `mappers/map-unit.ts` phải xử lý CẢ 2 nguồn (`stock_containers_gieogieo` + `active_units_gieogieo`) và merge đúng như `_ueRecomputeCurrentStock` đã làm — đây là logic nghiệp vụ thật cần giữ, không phải chi tiết kỹ thuật bỏ qua được.
- `mappers/map-recipe.ts` phải tự tạo `versionId` giả (vd. `updatedAt` timestamp) cho dữ liệu recipe cũ vì legacy không có versioning — đánh dấu rõ các bản ghi migrate là `versionSource: 'legacy-inferred'` để phân biệt với version thật tạo sau cutover.
- Adapter **read-only**, không path nào trong bảng trên được adapter ghi ngược — ghi canonical chỉ qua `packages/persistence-firebase`.
