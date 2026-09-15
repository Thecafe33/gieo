# FEATURE TREE — V1 (Cây tính năng tổng thể)

> Đây là tài liệu tổng hợp cuối cùng, đứng trên tất cả các audit trước (`LEGACY-FIFO-AUDIT.md`, `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md`, `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md`, và 3 audit mới: loyalty/voucher/customer, menu/pricing/packaging/HR/payroll, finance/alerts/reports/config). Mục đích: trả lời đúng yêu cầu — **luồng dữ liệu đơn giản, không trung gian thừa, đích chính xác, không chồng chéo tính năng, và bản đồ phụ thuộc rõ ràng để biết code cái gì bắt buộc kéo theo cái gì, hoặc chỉ cần chừa điểm nối.**
>
> Không lặp lại chi tiết đã có ở 4 file trên — chỉ dẫn chiếu. Trọng tâm file này là các domain **chưa từng có tài liệu**: Catalog (Menu/Packaging), Loyalty/Voucher/Promotion, HR/Payroll, Finance/Config, Alerts, Reporting — và cách TẤT CẢ domain khớp vào nhau thành 1 cây duy nhất.

---

# 1. NGUYÊN TẮC VẼ CÂY (bắt buộc tuân thủ khi code)

1. **Mỗi tính năng có đúng 1 nguồn ghi (single writer)** — không domain nào được ghi vào dữ liệu của domain khác. Vi phạm điển hình đã tìm thấy ở legacy (liệt kê đủ ở §4) chính là hậu quả của việc phá nguyên tắc này.
2. **Luồng dữ liệu đi 1 chiều, không vòng lại trừ khi qua Read Layer** — vd Bill KHÔNG được đọc ngược từ Report; Report chỉ đọc, không ghi vào domain nó đọc.
3. **Cart/Bill "chốt" (snapshot) dữ liệu Catalog tại thời điểm tạo** — không link động. Đây là điểm ĐÚNG duy nhất legacy đã làm (giá trong bill không đổi dù Menu đổi giá sau đó) — giữ nguyên nguyên tắc này cho MỌI domain tương tự (Recipe, Packaging đã audit trước đều VI PHẠM nguyên tắc này — xem §4).
4. **Domain nào có thể hoạt động thiếu domain khác thì phải làm rõ tường minh (optional), không ngầm định** — legacy có nhiều chỗ "âm thầm tính = 0" khi thiếu cấu hình (Packaging, Mix report) — thiết kế mới phải cảnh báo rõ thay vì im lặng sai số.
5. **Actor (ai làm) phải đi kèm MỌI mutation, không có ngoại lệ** — legacy có đúng 1 ngoại lệ nghiêm trọng (Bill không ghi actor — xem §4.7), phải sửa khi rebuild.

---

# 2. CÂY TÍNH NĂNG TỔNG THỂ

```text
STORE
 │
 ├── [0] IDENTITY & ACCESS ─────────────────────────── packages/hr
 │     Employee, PIN, Check-in/Check-out
 │     → cấp "actorId" cho MỌI mutation ở mọi nhánh bên dưới
 │     (không có role/permission thật ở legacy — chỉ có 1 cấp PIN)
 │
 ├── [1] CATALOG (cấu hình, QUANLY sở hữu, POS chỉ đọc) ── packages/catalog
 │     ├── Menu (món, size, giá)
 │     ├── Topping + Topping Recipe
 │     ├── Packaging (preset/override/rules/bagging — 2 cặp cũ/mới song song)
 │     └── Recipe                                    → đã có ở packages/recipe-cost-btp
 │
 ├── [2] FIFO / INVENTORY CORE ─────────────────────── packages/fifo-core (đã thiết kế xong)
 │     Unit, FIFO Engine, currentStock, Ledger
 │
 ├── [3] SALES (Bill/Checkout) ─────────────────────── packages/commands/sales
 │     Cart (snapshot Catalog tại thời điểm thêm món)
 │       → Payment (protected-adapters: bank/cash)
 │       → Consumption (đọc [1]+[2] TẠI THỜI ĐIỂM THANH TOÁN, không phải lúc thêm giỏ)
 │       → claim CheckoutSideEffects (1 cổng điều phối DUY NHẤT, không phải nhiều claim rời rạc)
 │            ├─▶ Print (protected-adapters)
 │            ├─▶ [4] Loyalty/Voucher/Promotion finalize
 │            └─▶ [7] Assist/AI (optional, không được chặn luồng)
 │       → Reversal                                   → dùng lại packages/fifo-core (không tự chế riêng)
 │
 ├── [4] CUSTOMER / LOYALTY / VOUCHER / PROMOTION ──── packages/loyalty
 │     Customer (gốc nhánh — tra cứu theo SĐT, PHẢI đăng ký tay, không tự tạo)
 │       ├── Loyalty points/stamps      (hard dep: Customer + Bill đã ghi)
 │       ├── Stamp-free redemption       (hard dep: Loyalty stamps đủ + Catalog.giftMenu)
 │       ├── ~~Voucher cá nhân (myGifts) / Discount code (rewards)~~ — CẮT BỎ, xem §4.5
 │       └── Auto-promotion (mua-N-tặng-1/giảm-theo-SL/tặng-topping) (đọc Cart + Catalog, KHÔNG cần Customer trừ freeTopping)
 │
 ├── [5] SHIFT / CASH OPERATIONS ────────────────────── packages/commands/shift
 │     Day open/close (gate tạo Bill — status='closed' thì khoá bán)
 │       ├── Cash reconciliation segments (đổi ca giữ két)
 │       ├── Refill rules + checklist (có thể CHẶN đóng ngày — blockingClose)
 │       └── Handover counts (nguyên liệu + BTP)
 │     hard dep: [0] Identity (mọi bước ký đều cần actorId + đã check-in)
 │
 ├── [6] HR / PAYROLL ────────────────────────────────── packages/hr (mở rộng [0])
 │     Employee (đã ở [0]) → Work schedule (optional, chỉ QUANLY dùng so sánh trễ)
 │       → Employee shift (chấm công thật, TÁCH BIỆT khỏi [5] Cash segments)
 │       → Payroll (đọc Employee rate — cần snapshot tại thời điểm, xem §4.6)
 │
 ├── [7] FINANCE / CONFIG ──────────────────────────── packages/finance
 │     Expense (categories/payment methods — hard dep để POS ghi chi phí)
 │       Finance settings (ngưỡng, thu hồi vốn — optional, có default)
 │       Config versions (targets/labor — optional, có default, CHỈ 2 field versioned)
 │       Book closing (snapshot P&L tháng — đã có ở compaction doc)
 │
 ├── [8] ALERTS (sink 2 chiều — mọi domain [1]-[7] có thể ghi vào đây) ── packages/alerts
 │     16 loại cảnh báo tự động, KHÔNG ai chủ động tạo tay
 │     → chỉ 1 nơi đọc: Management inbox
 │
 └── [9] REPORTING (chỉ đọc — không domain nào phụ thuộc ngược vào Reporting) ── packages/reporting
       Revenue/COGS/P&L, Customer (RFM), Mix, Prep forecast (advisory, KHÔNG nối vào [2])
       → Export/AI payload (đọc TẤT CẢ [0]-[8], xây SAU CÙNG)

PROTECTED INFRASTRUCTURE (cross-cutting, không thuộc cây nghiệp vụ) ── packages/protected-adapters
  Bill/Label printer · Scanner · Bank payment      (đã có contract riêng)
```

---

# 3. BẢNG PHỤ THUỘC — BẮT BUỘC (hard) vs CHỪA ĐIỂM NỐI (optional/hook)

| # | Domain | Phụ thuộc BẮT BUỘC (phải code cùng/trước) | Chỉ cần CHỪA ĐIỂM NỐI (optional, code sau vẫn được) |
|---|---|---|---|
| 0 | Identity/HR (actor) | — (gốc) | Role/permission thật (legacy chưa có, nên thiết kế field `role` ngay từ đầu dù chưa dùng) |
| 1 | Catalog (Menu/Packaging) | — (gốc, chỉ cần Recipe song song) | — |
| 2 | FIFO Core | Catalog (đọc `itemId` tại thời điểm allocate) | — |
| 3 | Sales/Bill | [0] actor, [1] Catalog (snapshot), [2] FIFO (consumption) | [4] Loyalty (nếu Customer trống, bỏ qua im lặng — nhưng phải là **quyết định tường minh**, không phải return 0 ngầm như legacy) |
| 4 | Loyalty/Voucher | [3] Bill đã ghi (billId làm khoá idempotent), Customer | Stamp-free retry queue (legacy thiếu — PHẢI thêm khi rebuild, xem §4.4); nguồn tạo Voucher/Discount (hiện ngoại lai — phải xây UI tạo trong Phase Catalog/Loyalty, không được để mãi là "external") |
| 5 | Shift/Cash | [0] actor + check-in | Refill blockingClose (optional per rule, không phải toàn hệ thống) |
| 6 | HR/Payroll | [0] Employee, [5]-tương-đương Employee shift (giờ công) | Work schedule (chỉ ảnh hưởng báo cáo trễ, không chặn gì) |
| 7 | Finance/Config | — (có default toàn bộ) | Mọi thứ trong domain này optional với phần còn lại của hệ thống |
| 8 | Alerts | ĐỌC (không ghi) từ mọi domain [1]-[7] | Domain nào cũng có thể hoãn tích hợp alert tới sau — không domain nào phụ thuộc NGƯỢC vào Alerts để hoạt động |
| 9 | Reporting | ĐỌC (không ghi) mọi domain | Luôn optional — không domain vận hành nào được phép chờ Reporting mới chạy được |

**Quy tắc build order rút ra:** [0] → [1]+[2] (song song) → [3] → [4]+[5]+[6] (song song, đều chỉ phụ thuộc [0][3]) → [7] (độc lập, làm bất kỳ lúc nào) → [8] → [9] cuối cùng. Đây LÀ build order thực dụng cho các domain MỚI này, khớp và bổ sung cho roadmap P0-P13 của `GIEO-SYSTEM-REBUILD-PLAN.md` (P0-P13 tập trung riêng cho xương sống [2] FIFO Core).

---

# 4. VI PHẠM / LỖ HỔNG PHÁT HIỆN — TỔNG HỢP TOÀN BỘ (bắt buộc sửa khi rebuild, không copy nguyên)

### 4.1 Menu — CẢ 2 APP CÙNG GHI TRỰC TIẾP VÀO RTDB (vi phạm nguyên tắc §1.1)
`quanlygieo.html` tự ghi chú "chỉ đọc RTDB" nhưng code thật (`saveMenuItem`, `saveFoodItem`, `saveTopping`) ghi thẳng — race condition khi 2 máy sửa đồng thời, không lock/version. **Fix:** Catalog domain chỉ có 1 command path (`packages/commands/master/UpdateProduct`), không cho bất kỳ app nào ghi trực tiếp Firebase.

### 4.2 Bug path mismatch: `food_gieogieo` vs `food_menu_gieogieo`
Ghi vào path A, một số hàm đọc lại từ path B (sai tên) → dữ liệu luôn rỗng ở những nơi đọc sai. **Fix:** 1 hằng số path duy nhất per domain (đã là nguyên tắc ở `packages/legacy-firebase-adapter/paths/`).

### 4.3 Giá menu KHÔNG real-time tới POS
POS cache 1 lần lúc boot (`.once('value')`, dù comment ghi nhầm là realtime), không tự refresh. Đổi giá giữa phiên bán không tới ngay POS. **Quyết định cho hệ thống mới:** Catalog phải qua Unified Read Layer với cơ chế invalidate rõ ràng (không phải "cache vĩnh viễn tới khi F5" như legacy).

### 4.4 Bất đối xứng retry: Loyalty có hàng đợi tự chạy lại, Stamp-free thì KHÔNG
Cùng là side-effect sau thanh toán, cùng claim chung 1 cổng, nhưng khi lỗi mạng: Loyalty tự phục hồi (hàng đợi localStorage + chạy lại mỗi 3 phút), Stamp-free chỉ báo alert rồi bỏ đó. **Fix:** cả 2 phải dùng chung 1 pattern retry (đúng nguyên tắc idempotency thống nhất đã định ở `FIFO-CORE-ARCHITECTURE-V2.md` §7 — mở rộng pattern đó sang toàn bộ checkout side-effects, không chỉ FIFO).

### 4.5 Voucher/Discount (`rewards`, `customers.myGifts`) — QUYẾT ĐỊNH: LOẠI BỎ, không mang sang hệ thống mới
Dữ liệu tới từ nguồn ngoài phạm vi rebuild (Firebase Console tay hoặc tool thứ 3 chưa biết), không có UI tạo trong cả 2 app — xác nhận là tàn dư hệ thống 1.0, không phải feature đang dùng thật. **Quyết định của chủ hệ thống (không phải suy đoán):** KHÔNG đưa `rewards`/`myGifts`/mã giảm giá nhập tay vào hệ thống mới. `packages/loyalty` chỉ còn Customer + Loyalty points/stamps + Stamp-free + Auto-promotion (`togoSettings`) — không có package/command nào cho Voucher/Discount code. Nếu sau này cần lại, đó là feature MỚI thiết kế từ đầu, không phải migrate dữ liệu `rewards` cũ.

### 4.6 Payroll — snapshot lương tại thời điểm chấm công bị ghi NHƯNG KHÔNG BAO GIỜ ĐƯỢC ĐỌC LẠI
Legacy đã cố fix đúng vấn đề "đổi lương giữa tháng làm sai lịch sử" bằng cách snapshot `payTerms` vào `employee_shifts` lúc check-in — nhưng code tính lương thật (`computeActualLaborCostByDate`) vẫn join với bảng nhân viên HIỆN TẠI, bỏ qua snapshot đã ghi. Bug tưởng đã sửa nhưng thực ra chưa. **Đây CHÍNH XÁC là vi phạm invariant #14 (CostBasis lịch sử) đã tìm thấy ở Recipe/Cost — lần thứ 3 phát hiện cùng 1 lớp lỗi (Recipe, Packaging, giờ là Lương) → xác nhận đây là lỗ hổng KIẾN TRÚC hệ thống, không phải lỗi cục bộ.** Fix bắt buộc trong `packages/hr`: mọi tính lương lịch sử phải đọc `payTerms` đã snapshot, không join nhân viên hiện tại.

### 4.7 Bill KHÔNG lưu actor — ngoại lệ duy nhất trong toàn hệ thống
Mọi domain khác (stock transaction, prep batch, container, expense, cash count, checklist) đều ghi `staffEmployeeId`. Riêng object `order`/Bill thì KHÔNG — chỉ có gate "có ai đó đang check-in" chứ không biết CHÍNH XÁC ai bán. **Fix bắt buộc:** `Bill` canonical model phải có `soldByActorId` bắt buộc — đây là field còn thiếu quan trọng nhất trong toàn bộ audit tính năng.

### 4.8 Packaging config đổi → COGS lịch sử bị tính lại (cùng lớp lỗi §4.6, đã biết từ `FIFO-CORE-ARCHITECTURE-V2.md` §13 với Recipe)
`invalidateSalesCache()` xoá cache mỗi khi sửa packaging preset/override/rules/bagging — xác nhận đây là lỗi mang tính HỆ THỐNG (mọi input vào công thức COGS đều thiếu bất biến lịch sử: Recipe, Cost, Packaging, Payroll — 4/4). **Kết luận kiến trúc:** `RecipeVersion`/`CostBasis` (đã thiết kế) phải mở rộng thành nguyên tắc chung "**mọi input ảnh hưởng số tiền lịch sử đều phải versioned + point-in-time resolve**", áp dụng đồng loạt cho Recipe, Packaging, Cost, Payroll — không xử lý riêng lẻ từng cái.

### 4.9 Alerts — 12/16 loại rơi vào khuôn chung, mất nội dung chẩn đoán
Chỉ 4/16 loại alert có màn xử lý thật với nút hành động trỏ đúng nơi. 12 loại còn lại hiện khuôn chung vốn thiết kế cho 1 loại khác — field `note` (nội dung chẩn đoán chi tiết) **không hiển thị**. **Fix:** `packages/alerts` phải có 1 renderer chung dựa trên schema từng `type`, không phải hard-code từng khuôn UI như legacy.

### 4.10 `lost_item_report` — KHÔNG có màn duyệt (xác nhận độc lập lần 2, khớp Bug #12 đã biết)
Cả từ phía FIFO audit (Bug #12, grep 0 kết quả) lẫn từ phía Alerts audit (không có nút Duyệt/Từ chối cho type này) đều xác nhận cùng 1 gap — càng chắc chắn đây là feature gap thật, ưu tiên cao khi rebuild (đã có trong `FIFO-CORE-ARCHITECTURE-V2.md` §8).

### 4.11 `prep_forecasts_gieogieo` — hoàn toàn tách rời khỏi luồng nấu thật
Dự báo chỉ để người đọc rồi tự tay đi bắt đầu mẻ (`_startPrepBatchImpl`) — không có liên kết code. **Quyết định cho hệ thống mới:** giữ nguyên là "advisory/optional" (đúng bản chất một dự báo không nên tự động trigger hành động vật lý), nhưng nên chừa điểm nối rõ ràng (nút "Bắt đầu mẻ theo đề xuất" điền sẵn số liệu) thay vì 2 màn hoàn toàn độc lập như legacy.

### 4.12 `storage_locations`/`locationStock` — multi-location CHỈ PHỦ 1 PHẦN nghiệp vụ
Chỉ luồng Transfer/Refill dùng `locationStock`; RECEIVING/CONSUMPTION/WASTE/ADJUSTMENT vẫn ghi thẳng `currentStock` gộp, không gắn location. **Quyết định:** nếu Phase sau cần multi-location thật, phải mở rộng TẤT CẢ command ghi kho để mang `locationId`, không chỉ 2 luồng đang có — nếu không cần multi-location thật (theo Open Question đã nêu ở `FIFO-CORE-ARCHITECTURE-V2.md` §11.5, hệ thống hiện tại 100% single-store), có thể hạ độ ưu tiên domain này.

---

# 5. CẬP NHẬT PACKAGES/ CẦN BỔ SUNG VÀO `GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md`

Các domain audit lần này cần package riêng, theo đúng nguyên tắc layering đã định (không domain nào tự ý ghi Firebase ngoài qua `packages/commands`):

```text
packages/
├── catalog/              # MỚI — Menu, Topping, Packaging (preset/override/rules/bagging). QUANLY sở hữu, POS chỉ đọc qua read-layer.
├── loyalty/               # MỚI — Customer, Loyalty points/stamps, Voucher, Discount, Auto-promotion (togoSettings)
├── hr/                    # MỚI — Employee, Work schedule, Shift check-in/out, Payroll (đọc payTerms SNAPSHOT, không join hiện tại — fix §4.6)
├── finance/               # MỚI — Expense, Payment methods, Finance settings, Config versions
├── alerts/                # MỚI — 16 alert type, renderer theo schema, không hard-code khuôn UI
└── reporting/              # ĐÃ CÓ trong blueprint — mở rộng thêm: customer-report.ts, mix-report.ts, prep-forecast.ts, export-payload.ts (xây SAU CÙNG, đọc mọi domain khác)
```

Quy tắc import bổ sung (nối vào §2 của blueprint): `catalog`, `loyalty`, `hr`, `finance` đều chỉ được `packages/commands` và `packages/read-layer` import — không package nghiệp vụ nào (`fifo-core`, `recipe-cost-btp`, `compaction`) được phép import ngược các package mới này, tránh lặp lại kiểu phụ thuộc chéo đã gây rối ở legacy (Menu/Packaging lẫn vào Recipe/Cost qua `invalidateSalesCache`).

---

# 6. GATE — CÂY TÍNH NĂNG COI LÀ ĐỦ KHI

- [ ] Mỗi domain trong cây có đúng 1 package sở hữu, không domain nào ghi chéo vào domain khác (chặn đứng §4.1).
- [ ] Bảng §3 được dùng làm căn cứ lập lịch code — domain nào build trước domain nào đã rõ ràng, không phải đoán khi bắt tay code.
- [ ] Cả 12 lỗ hổng ở §4 đều có dòng trong Regression Suite tương ứng (nối vào `GIEO-SYSTEM-REBUILD-PLAN.md` §18) trước khi coi 1 domain là hoàn thành.
- [ ] `Bill` model có `soldByActorId` bắt buộc ngay từ Phase thiết kế đầu tiên (§4.7) — không thêm sau.
- [ ] Nguyên tắc "mọi input ảnh hưởng số tiền lịch sử phải versioned" (§4.8) áp dụng đồng loạt cho Recipe + Packaging + Cost + Payroll, không xử lý riêng lẻ.
