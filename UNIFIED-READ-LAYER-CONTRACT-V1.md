# UNIFIED READ LAYER CONTRACT — V1

> **Vai trò:** contract bắt buộc cho `packages/read-layer`. Hiện thực hóa Phase 7 của `GIEO-SYSTEM-REBUILD-PLAN.md` §11. Là **cặp đôi bắt buộc** của `FIFO-COMPACTION-CONTRACT-V1.md` — compaction quyết định dữ liệu nằm ở đâu, file này quyết định ai đọc nó ra sao. Sửa 1 file phải xem lại file kia.
>
> **Lý do file này phải tồn tại TRƯỚC khi viết Ledger/Unit persistence:** `StockLedgerEntry` và `Unit` là nguồn của mọi read model dưới đây. Nếu chốt shape persistence trước khi biết read layer cần trả lời gì, sẽ phải sửa schema sau — rủi ro viết lại thật.
>
> **Trạng thái:** CONTRACT — chốt để code.

---

# 0. NGUYÊN TẮC GỐC

**`packages/read-layer` là CỔNG ĐỌC DUY NHẤT.** Không app, không package nào khác được tự quyết định đọc từ đâu.

```text
READ REQUEST
     ↓
READ SERVICE  (read-layer)
     ↓
LIVE SOURCE  +  COMPACT SOURCE  +  LEGACY SOURCE
     ↓
CANONICAL READ MODEL
     ↓
UI / REPORTING
```

**UI không bao giờ biết dữ liệu đến từ nguồn nào.**

---

# 1. INVARIANT CỨNG

| # | Invariant |
|---|---|
| R1 | **Không UI/package nào được tự branch nguồn.** Cấm tuyệt đối mọi dạng `if (raw tồn tại) ... else đọc archive/compact`. `packages/read-layer/internal/merge-canonical` là nơi DUY NHẤT biết cả LIVE lẫn COMPACT. |
| R2 | **`LIVE RESULT == COMPACT RESULT`** với cùng 1 canonical query. Compact không được làm đổi kết quả đọc. Đây vừa là gate P6 vừa là gate P7. |
| R3 | **Một canonical query = một implementation.** Cấm 2 pipeline tính cùng 1 chỉ số. Fix trực tiếp gap legacy "2 pipeline doanh thu độc lập (POS tự tính, QUANLY tự tính) không đảm bảo khớp nhau". |
| R4 | **Read-layer chỉ đọc.** Ngoại lệ DUY NHẤT: ghi cache (§4), và cache không bao giờ là nguồn sự thật. |
| R5 | **Phân quyền đọc enforce tại đây**, không phải ở UI visibility. Xem §5. |
| R6 | **Không resolve lại version khi đọc lịch sử.** Đọc `versionId` đã lưu trên record (`FIFO-COMPACTION-CONTRACT-V1.md` §1 quy tắc V4). Read-layer CẤM gọi `resolve(..., now)`. |
| R7 | **Không nuốt lỗi.** Nguồn lỗi/thiếu → trả `Result` lỗi tường minh, không trả 0/rỗng giả vờ thành công. Fix mẫu xấu legacy "return 0 ngầm". |

---

# 2. API BỀ MẶT

Chữ ký chung — mọi API nhận `ReadContext` và trả `Result`:

```text
ReadContext {
  storeId        // luôn có mặt, kể cả khi single-store
  actor          // actorId + role/permissions → §5
  at?            // point-in-time cho truy vấn lịch sử
  range?         // {from, to} + granularity ('day' mặc định)
}
```

## 2.1 Trace

| API | Trả lời |
|---|---|
| `getUnitTrace(unitId)` | Toàn bộ vòng đời 1 Unit: nhận từ đâu → mở lúc nào, ai mở → mọi allocation → bill/BTP/waste/lost/reversal → system exhaustion → physical finish. Đủ bộ câu hỏi `GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` §1.1. |
| `getConsumption(filter)` | Mọi consumption theo item/unit/bill/batch/khoảng ngày. |
| `getWaste(filter)` / `getLost(filter)` | Hao hụt / thất thoát, kèm `ingredientBreakdown`. |
| `getInventoryHistory(itemId, range)` | Chuỗi ledger + trạng thái tồn theo thời gian. |
| `getBTPHistory(prepItemId, range)` | Mẻ BTP, yield, tiêu thụ. |

## 2.2 Tiền / kết quả

| API | Trả lời |
|---|---|
| `getRevenue(range)` | Doanh thu — **1 implementation duy nhất** (R3). |
| `getCOGS(range)` | Giá vốn — bắt buộc trả **CẢ HAI** vế, xem §3. |
| `getPnL(period)` | Lãi lỗ; kỳ đã chốt → đọc thẳng snapshot (`FIFO-COMPACTION-CONTRACT-V1.md` §3.1). |
| `getVariance(range)` | actual vs theoretical. |

## 2.3 Quy tắc mở rộng

Thêm 1 chỉ số mới = thêm 1 API ở đây + 1 file trong `packages/reporting`. **Không được** thêm bằng cách cho UI tự query nguồn.

---

# 3. COGS — BẮT BUỘC 2 VẾ, KHÔNG ĐƯỢC ĐẶT TÊN NHẬP NHẰNG

Gap nghiêm trọng nhất đã xác nhận (`GIEO-REBUILD-HANDOFF-V2.md` §4.1, `FIFO-CORE-ARCHITECTURE-V2.md` §10b.1): **"COGS actual" chưa từng tồn tại trong lịch sử hệ thống** — `cogsActual` của legacy thực chất là theoretical bị đặt tên sai.

`getCOGS()` bắt buộc trả:

```text
{
  cogsTheoretical   // RecipeVersion × Sales, resolve theo point-in-time
  cogsActual        // cost basis FIFO THẬT trên các Unit đã thực sự bị allocate
  variance          // actual - theoretical
  basis: { recipeVersionIds[], costBasisVersionIds[] }
}
```

**Invariant R8:** cấm tồn tại field tên `cogsActual` mà nội dung là theoretical. Nếu chưa đủ dữ liệu Unit để tính actual → trả `cogsActual: null` + lý do, KHÔNG fallback sang theoretical rồi gọi nó là actual (R7).

---

# 4. TẦNG NGUỒN VÀ CACHE

## 4.1 Thứ tự resolve

```text
1. SNAPSHOT (đã chốt/compacted)  → đọc thẳng, không tính lại
2. CACHE (tính lại được)          → đọc nếu còn hợp lệ
3. LIVE RAW                       → tính từ ledger/unit/bill
4. LEGACY SOURCE                  → qua legacy-firebase-adapter, CHỈ ĐỌC
```

`merge-canonical` chịu trách nhiệm ghép và trả 1 read model thống nhất. Gọi tầng nào là chi tiết nội bộ — caller không thấy.

## 4.2 Cache — quy tắc

| # | Quy tắc |
|---|---|
| K1 | Cache **không bao giờ** là nguồn sự thật. Mất sạch cache = chậm, không sai. |
| K2 | Cache chỉ chứa kết quả đã resolve đúng point-in-time (`FIFO-COMPACTION-CONTRACT-V1.md` §1 V2/V3). |
| K3 | **Invalidate theo phạm vi bị ảnh hưởng**, không xoá sạch toàn bộ. Fix `clearSalesCache()`/`invalidateSalesCache()` legacy — xoá mọi ngày rồi tính lại bằng version hiện tại, chính là instance #2/#3 của lớp lỗi versioning. |
| K4 | **Sửa/xoá bill cũ BẮT BUỘC invalidate ngày tương ứng.** Gap legacy đã xác nhận: cache không invalidate khi xoá/sửa bill cũ → báo cáo hiển thị số cũ vô thời hạn. |
| K5 | Cache không được che drift: nếu kỳ đã chốt, §3.2 file compaction vẫn phải so được số sống với số đóng băng. |

## 4.3 Legacy source

Chỉ đọc. `packages/legacy-firebase-adapter` không bao giờ ghi vào path cũ (ngoại lệ duy nhất: script migration/cutover trong `tools/`). Trong giai đoạn READ-ONLY/SHADOW, đây là nguồn chính — hệ thống cũ vẫn chạy production.

**Legacy ambiguity KHÔNG được suy đoán bừa** (invariant #12 Master Plan): dữ liệu cũ không đủ nghĩa → đánh dấu `AMBIGUOUS` và trả kèm cờ, để UI/report hiển thị "cần rà thủ công", không im lặng dựng số.

---

# 5. PHÂN QUYỀN ĐỌC — GAP NGHIÊM TRỌNG PHẢI ĐÓNG

Đã xác nhận (`GIEO-REBUILD-HANDOFF-V2.md` §4.1, `FIFO-CHAIN-TRACE-REPORTING-V1.md` §8): **Reporting legacy có 0% phân quyền đọc** — QUANLY dùng 1 tài khoản Firebase dùng chung, mọi người thấy toàn bộ P&L/COGS/khách hàng.

| # | Quy tắc |
|---|---|
| P1 | Mọi API §2 nhận `actor` và **enforce quyền tại read-layer**, không phải ở UI visibility. Đây là invariant #1 của `POS-QUANLY-PERMISSION-CONTRACT-V1.md` áp cho đường đọc. |
| P2 | Từ chối phải tường minh: trả `Result` lỗi `FORBIDDEN`, KHÔNG trả rỗng/0 (R7). |
| P3 | Phân tầng theo đúng 3 tầng quyền EXECUTE / REVIEW-APPROVE-CORRECT / MASTER-CONFIGURE. Dữ liệu nhạy cảm (P&L, COGS, thông tin khách hàng, lương) mặc định KHÔNG thuộc tầng EXECUTE. |
| P4 | Mặc định **đóng**: API mới không khai báo quyền → bị từ chối, không phải mở. |
| P5 | `storeId` luôn là bộ lọc bắt buộc trong mọi query, kể cả khi hệ thống đang single-store. |

---

# 6. MULTI-STORE

Đã chốt (`GIEO-REBUILD-HANDOFF-V2.md` §5 + xác nhận trực tiếp): legacy 100% single-store, **chỉ chừa chỗ, chưa làm thật**.

- `storeId` có mặt trong `ReadContext` và mọi query ngay từ đầu (P5).
- Chỉ 1 giá trị `storeId` thật trong giai đoạn này.
- **KHÔNG xây aggregation `ALL_STORES`** ở V1 — `ALL_STORES` là khái niệm phạm vi quyền cho tương lai, không phải state vật lý dùng chung.
- Thiết kế API không được giả định "chỉ có 1 store" theo cách chặn mở rộng sau (ví dụ: cấm hard-code bỏ qua `storeId` trong `merge-canonical`).

---

# 7. POINT-IN-TIME VÀ KHOẢNG NGÀY

| # | Quy tắc |
|---|---|
| T1 | Truy vấn lịch sử dùng `versionId` đã lưu (R6), không resolve lại. |
| T2 | Truy vấn theo khoảng phải tôn trọng `resolveDaily` — **từng ngày một version**, cấm áp 1 version cho cả kỳ. Fix instance #6 (KPI target resolve tại ngày cuối kỳ) và #7 (so sánh kỳ không đóng băng). |
| T3 | **So sánh kỳ ("tuần này vs tuần trước") phải nêu rõ cột nào đóng băng, cột nào tính sống.** Legacy để cả 2 cột tính sống → so sánh trôi theo thời gian. Read model bắt buộc mang cờ `frozen: boolean` cho từng cột. |
| T4 | `businessDate` lấy từ `clock` helper dùng chung, cấm `new Date()` rải rác. |

---

# 8. HÌNH DẠNG KẾT QUẢ

Mọi read model bắt buộc mang metadata nguồn — để debug và để thỏa R2:

```text
{
  data: <canonical read model>,
  meta: {
    sources: ('SNAPSHOT'|'CACHE'|'LIVE'|'LEGACY')[],
    frozen: boolean,           // T3
    versionIds: {...},         // R6 — version nào đã dùng
    ambiguous?: AmbiguityFlag[], // §4.3
    computedAt
  }
}
```

`meta` là để chẩn đoán và hiển thị cờ, **không phải để UI branch logic theo nguồn** (R1).

---

# 9. QUAN HỆ VỚI REPORTING

`packages/reporting` **chỉ được** đọc qua `packages/read-layer`, không đọc thẳng nguồn nào.

- Reporting là nơi định dạng/tổng hợp cho người đọc; read-layer là nơi lấy số.
- Gap legacy "không có export báo cáo đã định dạng (chỉ dump JSON thô)" được đóng ở `packages/reporting/export-payload`, KHÔNG phải ở đây.
- Reporting xây **sau cùng** (domain [9]) — không domain vận hành nào được chờ Reporting mới chạy được.

---

# 10. RANH GIỚI PACKAGE

| Được import read-layer | Read-layer được import |
|---|---|
| `apps/pos`, `apps/quanly`, `packages/reporting`, `tools/shadow-compare` | `packages/fifo-core`, `packages/traceability`, `packages/recipe-cost-btp`, `packages/compaction`, `packages/store-context`, `packages/shared-kernel` |

Read-layer **KHÔNG** import `packages/commands` (đọc không gọi ghi) và **KHÔNG** import Firebase SDK trực tiếp — chỉ qua port do adapter implement.

---

# 11. GATE — PHASE 7 PASS KHI

- [ ] Không còn UI nào tự branch `if old data / if archive / if compact / if raw exists` (grep sạch).
- [ ] `LIVE RESULT == COMPACT RESULT` với cùng canonical query (test trước/sau compact).
- [ ] Chỉ tồn tại 1 implementation cho doanh thu và 1 cho COGS (R3) — test chứng minh POS và QUANLY ra cùng số.
- [ ] `getCOGS()` trả đủ `cogsTheoretical` + `cogsActual` phân biệt rõ (§3), có case `cogsActual: null` hợp lệ.
- [ ] Mọi API enforce quyền, có test case `FORBIDDEN` (§5).
- [ ] Sửa/xoá bill cũ làm invalidate đúng phạm vi cache, không xoá sạch (K3/K4).
- [ ] So sánh kỳ mang cờ `frozen` đúng (T3).
