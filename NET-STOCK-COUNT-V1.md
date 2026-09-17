# NET — KIỂM KHO → DUYỆT → ĐIỀU CHỈNH → ĐỐI CHIẾU — V1

> Nguồn: `FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md` đối chiếu với `src/layers/commands/approval.js`,
> `src/layers/fifo-core/reconciliation.js`, `src/layers/commands/inventory.js`
> (RestoreFoundContainer/ReportLostContainer, dùng chung với Raw Material).
>
> Áp dụng §2.3a. Domain này CHIA SẺ RẤT NHIỀU với `NET-RAW-MATERIAL-V1.md`:
> phần duyệt kiểm kê (RM4) và phần báo/duyệt mất hũ (RM6) đã xác nhận đóng
> gap ở đó — NET này KHÔNG lặp lại toàn bộ, chỉ trace lại theo đúng thứ tự
> nghiệp vụ gốc của chain-trace và bổ sung phát hiện MỚI chưa có ở RM4/RM6.

## Sơ đồ luồng (SC1 → SC6, theo đúng thứ tự chain-trace gốc)

```
SC1 POS đếm (countMode 'unit'/'qty') ──► phiếu kiểm kê nháp
        │
SC1b Mismatch lúc đếm → "Không tìm thấy" ──► báo mất (= RM6, ApproveLostContainer)
        │
SC2 Submit phiếu kiểm kê
        │
SC3 Duyệt phiếu (= RM4, ApproveStockCount)
        │
SC4 Áp dụng điều chỉnh vào tồn kho thật (= physicalReconciliation, dùng chung RM2/RM4)
        │
SC5 Đối chiếu kỳ sau (countedBase vs currentStock — 2 nguồn có đồng bộ không)
        │
SC6 Tần suất kiểm kho tiếp theo
```

---

## SC1 — POS đếm

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:11787-11996` — `countMode:'unit'` bắt buộc quét mã (chỉ tính chai nguyên, "đếm mù" không hiện `expectedBase` — thiết kế đúng); `countMode:'qty'` nhập tay số TUYỆT ĐỐI. **AMBIGUOUS**: nguyên liệu có tem thật nhưng `unit≠'cái'` + không khớp `packagingUnits` → rơi nhầm xuống nhánh `'qty'`, MẤT yêu cầu quét bắt buộc cho món đáng lẽ phải quét. |
| **Hệ mới** | `commands/stock-count.js` → `classifyCountMode(item)` |
| **Phân loại** | 🟢 **THÊM MỚI** |
| **Ghi chú** | Đóng bằng cách TÁI SỬ DỤNG đúng fix đã áp dụng cho gap gốc-giống-hệt ở RM1 (Receiving): `classifyCountMode(item) = classifyTrackingMode(item)==='unit' ? 'unit' : 'qty'`, gọi thẳng `commands/receiving.js#classifyTrackingMode()` (import cùng tầng `commands/`, tiền lệ đã có ở `business-day.js`→`shift.js`) thay vì viết lại một hàm suy luận thứ hai cho cùng một câu hỏi. Quyết định dựa trên field `trackingMode` TƯỜNG MINH trên item, không suy từ `unit`/`packagingUnits` khớp hay không như legacy — đóng đúng AMBIGUOUS đã nêu: mặt hàng `trackingMode:'unit'` LUÔN bắt buộc quét mã, không còn khả năng rơi nhầm xuống `'qty'` vì thiếu cấu hình đóng gói. |

## SC1b — Mismatch lúc đếm ("Không tìm thấy" → báo mất)

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:12095-12178` — mọi mã sealed/open chưa quét lại → bắt buộc quét lại hoặc "Không tìm thấy" → ghi `stock_lost_reports_gieogieo{status:pending_review}`. 🔴 ĐỨT CHUỖI: 0 hàm duyệt collection này tồn tại → container "mất" không bao giờ đổi status → lặp lại vô hạn mỗi kỳ kiểm kho (xác nhận độc lập lần 3 của Bug #12, từ góc kiểm kho). |
| **Hệ mới** | `commands/inventory.js` → `ReportLostContainer` + `commands/approval.js` → `ApproveLostContainer` + `RestoreFoundContainer` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — **ĐÃ XÁC NHẬN ĐÓNG ở `NET-RAW-MATERIAL-V1.md` RM6** |
| **Ghi chú** | Không lặp lại phân tích — RM6 đã đọc trọn cả 3 hàm, xác nhận route duyệt (Bug #12) đã tồn tại qua 3-way confirmation. Ghi lại ở đây chỉ để giữ đúng thứ tự chuỗi kiểm kho gốc. Điểm mới bổ sung từ góc chain-trace này: đây là lần xác nhận Bug #12 đóng **từ góc thứ 3 độc lập** (sau FIFO audit, Alerts audit) — càng củng cố đây là gap ưu tiên cao nhất đã được xây đúng, không phải trùng hợp. |

## SC2 — Submit phiếu kiểm kê

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:12802-12878` — `.add()` sinh id ngẫu nhiên (Bug #13 double-tap: gửi 2 lần tạo 2 phiếu) — ghi `stock_counts_gieogieo{items[], status:'pending_review'}` |
| **Hệ mới** | `commands/stock-count.js` → `SubmitStockCount` |
| **Phân loại** | 🟢 **THÊM MỚI** |
| **Ghi chú** | `stockCountId = ids.deterministicId('stockCount', ['submit', input.countRef])` — `countRef` do caller cung cấp (mẫu `wasteRef`/`adjustRef`/`correctRef`/`receiptRef` đã dùng xuyên suốt `commands/inventory.js`/`commands/receiving.js`), đóng đúng Bug #13 (double-tap gửi 2 lần → retry no-op, đã có test xác nhận `replayed:true`). Output `stockCount.lines[]` dựng ĐÚNG hình dạng mà `ApproveStockCount` (SC3) cần: dòng `countMode:'unit'` mang `{itemId, unitId, countedQty, applied}`, dòng `countMode:'qty'` mang `{itemId, unitId:null, countedQty, expectedQty, delta, applied}` với `delta` TÍNH SẴN ở SubmitStockCount (không để ApproveStockCount tự trừ) — đã có test tích hợp nối trực tiếp output của `SubmitStockCount` vào `ApproveStockCount` không cần dịch lại shape. Chỉ TẠO phiếu `PENDING`, hoàn toàn không mutate Unit/ledger — việc đó là của SC3/SC4 (đã đóng từ trước). |

## SC3 — Duyệt phiếu

| | |
|---|---|
| **Hệ cũ** | `quanlygieo.html:4679-4696` — 🔴 `Promise.allSettled` → status LUÔN `'approved'` dù có job fail, không lưu itemId nào fail (chỉ 1 số `failedCount`); 🔴 KHÔNG idempotent — không check status trước khi build jobs, không busy-guard → double-click/2 người duyệt = cộng/trừ 2 lần cho cùng 1 lệch thật. |
| **Hệ mới** | `commands/approval.js` → `ApproveStockCount` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — **ĐÃ XÁC NHẬN ĐÓNG ở `NET-RAW-MATERIAL-V1.md` RM4, đọc lại trọn thân hàm trong lượt này để xác nhận đúng 4/5 mục "FIX BẮT BUỘC" của chain-trace gốc** |
| **Ghi chú** | Đọc lại trọn (137-239): (1) **Đi qua đúng `physicalReconciliation`/`allocateMany` qua FIFO Engine** — không có nhánh ghi thẳng nào (đóng mục FIX #1). (2) **Idempotent** — mỗi dòng có `line.applied`, dòng đã áp thì bỏ qua (`if (line.applied) { applied.push(...); return; }`) — duyệt lại phiếu `PARTIALLY_APPLIED` không cộng đúp; phiếu đã `APPROVED` bị chặn duyệt lại (PRECONDITION) — đóng mục FIX #2 (đóng bằng skip-per-line + guard trạng thái, không phải busy-guard kiểu khoá tiến trình, nhưng đạt cùng mục tiêu: kết quả cuối không đổi dù gọi nhiều lần). (3) **Lưu CHÍNH XÁC dòng lỗi** — `failed.push({itemId, unitId, reason})` cho từng dòng, không chỉ 1 con số (đóng mục FIX #4). (4) **Status trung thực**: còn `failed.length` thì `PARTIALLY_APPLIED`, không bao giờ ép về `APPROVED` giả (đóng mục FIX #4, đúng `COUNT_STATUS` đã có `PARTIALLY_APPLIED` — xác nhận RM4). (5) Phát `StockCountPartiallyApplied` event khi có dòng lỗi — **ĐÃ ĐÓNG**: `bootstrap/domain-events.js` nay có route `StockCountPartiallyApplied` → `RaiseAlert` (loại mới `STOCK_COUNT_LINE_FAILED`, một alert riêng cho MỖI dòng `failed` qua cơ chế fan-out mảng của `routeEvents()` — không gộp nhiều dòng lỗi mất `reason` từng dòng). Xem `NET-ALERTS-V1.md`. |

## SC4 — Áp dụng điều chỉnh vào tồn kho thật

| | |
|---|---|
| **Hệ cũ** | `applyStockTransaction` (`quanlygieo.html:4636-4655`) — ghi THẲNG `inventory_items.currentStock`, KHÔNG qua `untrackedPendingDelta`, KHÔNG đụng `stock_containers`/`active_units` RTDB. 🔴 ĐỨT CHUỖI NGHIÊM TRỌNG: lần `_ueRecomputeCurrentStock` KẾ TIẾP (kích hoạt bởi BẤT KỲ bán/mở tem/báo hết nào sau đó) ghi đè `currentStock` bằng công thức của riêng nó, XOÁ CÂM LẶNG khoản điều chỉnh kiểm kho vừa duyệt. Cùng họ lỗi "unit-aware vs untracked" đã biết ở reversal (Bug #17). |
| **Hệ mới** | `fifo-core/reconciliation.js` → `physicalReconciliation()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã đọc trọn. Giữ ĐÚNG nguyên tắc `_applyFifoNotEmpty` mà legacy đã làm đúng (comment code trích thẳng): đọc fresh state → `delta = actualQty - remainingQty` → **GHI ĐÈ TUYỆT ĐỐI** `remainingQty = actualQty`, không cộng delta vào số cache — đây chính là điểm mấu chốt tránh cộng đúp khi có 2 lần đọc xen kẽ. Vì đây là MỘT ĐƯỜNG DUY NHẤT đi qua `Unit` (không có `applyStockTransaction` song song ghi thẳng `currentStock`), lần recompute kế tiếp của BẤT KỲ giao dịch nào khác sẽ CỘNG TỪ đúng `remainingQty` đã ghi đè, không xoá mất khoản điều chỉnh — đóng đúng ĐỨT CHUỖI NGHIÊM TRỌNG này bằng kiến trúc (không còn 2 code path để lệch), không phải bằng thêm điều kiện chắp vá. |

## SC5 — Đối chiếu kỳ sau (countedBase vs currentStock)

| | |
|---|---|
| **Hệ cũ** | `thPhieuCuaItem`/`thTinhMotKy`/`thDoiChieu` (`quanlygieo.html:7296-7415`) — KHÔNG ĐỨT về logic: lọc đúng `status==='approved'`, dùng THẲNG `countedBase` lưu trong doc, không suy từ `currentStock`/`stock_transactions`. Hệ quả: báo cáo này "miễn nhiễm" với lỗi ở SC3/SC4, NHƯNG chính vì vậy `currentStock` (vận hành hàng ngày) và `countedBase` (báo cáo đối chiếu) có thể ÂM THẦM LỆCH NHAU — 2 nguồn sự thật không đồng bộ, không ai cảnh báo khi khác nhau. |
| **Hệ mới** | `fifo-core/reconciliation.js` → `rebuildUnitState()` + `detectDrift()` (§3.9) |
| **Phân loại** | 🟢 **THÊM MỚI** — cơ chế phát hiện lệch, legacy hoàn toàn không có |
| **Ghi chú** | Vì SC4 giờ chỉ có MỘT nguồn sự thật (`Unit.remainingQty` qua `physicalReconciliation`), nguy cơ "2 nguồn lệch nhau" ở tầng LƯU TRỮ đã giảm hẳn so với legacy (không còn `currentStock` field cache riêng bị recompute đè). Nhưng chain-trace đúng khi đòi một cơ chế XÁC MINH chủ động thay vì chỉ tin kiến trúc — và `rebuildUnitState()`/`detectDrift()` chính là cơ chế đó: dựng lại `remainingQty` từ TOÀN BỘ ledger entries (bỏ qua `RECEIVING` vì đã nằm trong `initialQty`, tránh tính đúp) rồi so với số đã lưu, trả `drifted[]` cho từng Unit lệch. Đây là cơ chế MỚI dùng chung cho 3 việc (correction sau compaction, khôi phục khi RT lệch Firestore, xác thực snapshot verifier) — không phải xây riêng cho kiểm kho, nhưng đóng đúng tinh thần chain-trace đòi hỏi ở bước này. **Chưa xác nhận có route/lịch chạy `detectDrift()` định kỳ hay chỉ gọi thủ công** — để ngỏ, không phải gap của domain logic mà là câu hỏi vận hành (chạy khi nào). |

## SC6 — Tần suất kiểm kho tiếp theo

| | |
|---|---|
| **Hệ cũ** | GAP — không có cấu hình lịch bắt buộc theo item; checklist "đã kiểm kho hôm nay" (nếu Quản lý tự tạo) chỉ cần 1 PHIẾU/NGÀY dù chỉ đếm 1 dòng, dù CHƯA DUYỆT (`hasStockCountTodayPOS` không lọc status) — không chặn bán hàng (blocking mặc định false). Không cảnh báo per-item "lâu chưa kiểm kê". |
| **Hệ mới** | **KHÔNG TÌM THẤY** |
| **Phân loại** | 🔴 **GAP — chưa đóng, đúng như legacy** |
| **Ghi chú** | Đã đọc trọn `alerts/alert.js TYPES` (15 loại cảnh báo đã đăng ký: `FIFO_UNIT_EXHAUSTED`, `CONTAINER_EXPIRING`, `PREP_BATCH_EXPIRING`, `LOW_STOCK`, `STOCKOUT`, `UNIT_NEEDS_REVIEW`, `CASH_VARIANCE`, `STOCK_VARIANCE`, `COGS_OVER_TARGET`, `MISSING_RECIPE`, `UNTRACKED_CONSUMPTION`, `LOYALTY_DRIFT`, `DRIFT_AFTER_CLOSING`, `SNAPSHOT_VERIFY_FAILED`, `LOST_CONTAINER_PENDING`, `DAY_NOT_CLOSED`) — KHÔNG có loại nào cho "lâu chưa kiểm kê per-item". Đây là gap CHÍNH ĐÁNG kế thừa nguyên trạng từ legacy (không phải regressions), có thể để lại cho vòng sau vì bản thân legacy cũng chưa coi đây là block vận hành (không chặn bán hàng) — không vi phạm §2.3a vì không có hard-block nào để so sánh, chỉ là một loại cảnh báo còn thiếu. |

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Raw Material** | SC1b = RM6 (route duyệt mất hũ), SC3 = RM4 (duyệt kiểm kê) — đã đóng ở đó, NET này chỉ trace lại đúng thứ tự và xác nhận thêm chi tiết SC3 |
| **BTP** | SC3/SC4 dùng CHUNG cơ chế `physicalReconciliation`/`ApproveStockCount` với kiểm đếm BTP (`NET-BTP-V1.md` B3) — Unit `itemKind:'prep'` đi qua đúng route này, không cần command riêng |
| **Alerts (L9)** | `StockCountPartiallyApplied` event (SC3) — **ĐÃ ĐÓNG**: `bootstrap/domain-events.js` route → `RaiseAlert` (loại `STOCK_COUNT_LINE_FAILED`, fan-out một alert/dòng lỗi). Xem `NET-ALERTS-V1.md`. |
| **Reporting** | SC5's `rebuildUnitState()`/`detectDrift()` là cơ chế nền cho phần "phát hiện RT lệch Firestore" mà `NET-REPORTING-V1.md` cũng cần — xem liên kết ở đó |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **SC1** (`classifyCountMode` — tái dùng fix của RM1 cho cùng gốc AMBIGUOUS), **SC2** (`SubmitStockCount`), **SC5** (`detectDrift()` — cơ chế phát hiện lệch chủ động, legacy không có)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **SC1b, SC3, SC4** — 3/5 "FIX BẮT BUỘC" của chain-trace đã xác nhận đóng qua đọc trọn code (route duyệt mất hũ, idempotency + per-line-failure + status trung thực khi duyệt, một nguồn sự thật duy nhất cho `currentStock`)
- 🔴 GAP kế thừa nguyên trạng từ legacy (không phải regression, không vi phạm §2.3a): **SC6** (không có cấu hình lịch/cảnh báo tần suất kiểm kho)

**So sánh với các domain trước**: đây là domain có nhiều "FIX BẮT BUỘC" của chain-trace được đóng NHẤT (4/5 mục, đọc trọn xác nhận) — phần DUYỆT/ÁP DỤNG đã đúng đắn, kỹ lưỡng từ trước; phần TẠO PHIẾU ở đầu chuỗi (SC1/SC2) nay đã đóng bằng `commands/stock-count.js`, tái dùng trực tiếp `classifyTrackingMode()` của RM1 (Receiving) cho SC1 thay vì viết lại một hàm phân loại thứ hai — cùng một câu hỏi ("mặt hàng này có bắt buộc quét mã không") chỉ có một cách trả lời trong toàn hệ thống.

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. ~~Xây domain con "kiểm kho — tạo phiếu": `SubmitStockCount` (đóng Bug #13 double-tap bằng deterministic id) + logic phân loại `countMode` tường minh dựa trên field item (`trackingMode`/`packagingUnits`), đóng đúng AMBIGUOUS đã nêu ở SC1.~~ **ĐÃ XONG** — `commands/stock-count.js` (`classifyCountMode` + `SubmitStockCount`), đăng ký ở `bootstrap/runtime.js`, 12 test (`tests/unit/stock-count.test.js`) gồm cả 2 test tích hợp nối thẳng vào `ApproveStockCount`.
2. Xác nhận lịch/route chạy `detectDrift()` định kỳ (không phải chỉ gọi thủ công) — câu hỏi vận hành, không phải thiếu logic.
3. ~~(Không mới, nhắc lại) Tầng điều phối sự kiện — SC3's `StockCountPartiallyApplied` là domain thứ 7 phụ thuộc gap L9.~~ **ĐÃ XONG** — `bootstrap/domain-events.js` route `StockCountPartiallyApplied` → `RaiseAlert` (loại `STOCK_COUNT_LINE_FAILED`, fan-out mảng, một alert/dòng lỗi giữ nguyên `reason`). Xem `NET-ALERTS-V1.md`.
4. SC6 để lại cho vòng sau — không chặn, không vi phạm §2.3a, kế thừa đúng mức độ ưu tiên thấp của legacy.
