# FEATURE TREE — V1 (Cây tính năng tổng thể)

> **Nguyên tắc bắt buộc đọc trước:** đây là bản thiết kế cho **HỆ THỐNG MỚI**, không phải danh sách vá lỗi cho `posgieo.html`/`quanlygieo.html`. 2 file HTML cũ chỉ được dùng để trả lời đúng 1 câu hỏi: **"vòng tính năng/chuỗi dữ liệu nào từng tồn tại trong nghiệp vụ thật của quán?"** — không phải "code cũ viết sao thì giữ vậy". Mọi mục dưới đây mô tả **đường đi dữ liệu ĐÚNG cho hệ thống mới lấy FIFO làm gốc**, được đúc kết từ việc khảo sát cơ sở dữ liệu/vòng đời dữ liệu cũ — không phải patch note.
>
> Đây là tài liệu tổng hợp cuối cùng, đứng trên tất cả các audit trước — bao gồm `LEGACY-FIFO-AUDIT.md`, `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md`, `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md`, 3 audit domain (loyalty/voucher/customer, menu/pricing/packaging/HR/payroll, finance/alerts/reports/config), và **4 chain-trace** (`FIFO-CHAIN-TRACE-BTP-V1.md`, `-RAW-MATERIAL-V1.md`, `-SALES-COGS-PL-V1.md`, `-STOCK-COUNT-V1.md`). Mục đích: **luồng dữ liệu đơn giản, không trung gian thừa, đích chính xác, không chồng chéo tính năng, và cây phải tự nó cho biết chuỗi tính năng nào cần xây, nối vào đâu** — không phải rải rác ở nhiều file phụ lục.
>
> §2 dưới đây **không còn là cây tĩnh liệt kê domain** — mỗi domain trung tâm ([2] FIFO/Inventory, [3] Sales/COGS) giờ có **nhánh chuỗi đầy đủ** (entry → correction → actual-vs-theoretical → variance → báo cáo → KPI), vì đây chính là "hướng đi của chuỗi tính năng cần làm" mà cây phải thể hiện được.

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
 │     Unit{costBasis}, FIFO Engine, currentStock (projection), Ledger
 │     │
 │     ├── [2a] CHUỖI NGUYÊN LIỆU THÔ (raw) — luồng chuẩn hệ thống mới, đúc kết từ
 │     │        khảo sát vòng đời dữ liệu cũ (`FIFO-CHAIN-TRACE-RAW-MATERIAL-V1.md`):
 │     │        ReceiveGoods → Unit{costBasis, sealed}
 │     │          → OpenContainer → Unit{open}
 │     │          → CONSUME (bán/BTP/waste) → BẮT BUỘC AllocateConsumption cho MỌI
 │     │            lý do tiêu hao (bán, đổ ly, hao hụt trực tiếp) — 1 code path DUY
 │     │            NHẤT, không tách "waste thường" khỏi "waste có allocate" như cũ
 │     │          → CountStock (actual, tuyệt đối) → ReconcileInventory
 │     │            (actual vs theoretical CHO SỐ LƯỢNG — 1 phép tính DUY NHẤT dùng
 │     │            chung bởi cả vận hành hằng ngày lẫn báo cáo đối chiếu định kỳ,
 │     │            không phải 2 đường tính riêng có thể lệch nhau âm thầm)
 │     │          → InventoryDailyReport (theo ngày: nhận/dùng/hao hụt/tồn cuối)
 │     │          → KPI (wasteTargetPct) trong packages/reporting
 │     │
 │     ├── [2b] CHUỖI BTP (prep) — CÙNG 1 FIFO Engine với [2a], không phải engine
 │     │        riêng (`FIFO-CHAIN-TRACE-BTP-V1.md`):
 │     │        StartPrepBatch (allocate raw) → RecordPrepYield (actual, bắt buộc)
 │     │          → so sánh actual vs theoretical NGAY khi nhập (không chỉ cảnh báo
 │     │            trung bình 8 mẻ sau đó — cả 2 lớp đều cần, tức thời + xu hướng)
 │     │          → CorrectBatchYield (nếu nhập sai — versioned, giữ effective date,
 │     │            KHÔNG làm trôi COGS lịch sử đã tính — xem [3c])
 │     │          → ReconcilePrep (actual vs theoretical CHO TỒN BTP — domain này
 │     │            PHẢI có, dùng chung engine với [2a], không phải xây riêng)
 │     │          → RecordWaste (BẮT BUỘC ingredientBreakdown cho MỌI trigger, không
 │     │            chỉ đường "huỷ giữa ca" như cũ)
 │     │          → BTPDailyReport → KPI (wasteTargetPct gộp raw+prep)
 │     │
 │     └── [2c] CHUỖI KIỂM KHO → DUYỆT (`FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md`):
 │              CountStock (actual tuyệt đối, unit-aware khi có tem)
 │                → ApproveStockCount / RejectStockCount (idempotent — duyệt đúp
 │                  không được cộng đúp, cùng pattern idempotency với mọi command)
 │                → AdjustInventory ĐI QUA FIFO Engine (allocate vào đúng Unit khi
 │                  xác định được, KHÔNG có code path "ghi thẳng currentStock" song
 │                  song tồn tại ngoài FIFO Engine)
 │                → ReportLostContainer → ApproveLostContainer/RejectLostContainer
 │                  (nhánh BẮT BUỘC PHẢI XÂY — không tồn tại ở hệ thống cũ, xác nhận
 │                  độc lập 3 lần từ 3 góc audit khác nhau, đây là 1 trong những
 │                  command ưu tiên cao nhất của Phase 8, không phải "để sau")
 │
 ├── [3] SALES (Bill/Checkout) ─────────────────────── packages/commands/sales
 │     Bill{channel}                                  ← field MỚI bắt buộc (dine-in/
 │     │                                                 to-go/app-{sàn}), để [9]
 │     │                                                 Reporting tách lãi/lỗ theo
 │     │                                                 kênh — đọc từ [1] Catalog
 │     Cart (snapshot Catalog tại thời điểm thêm món)
 │       → Payment (protected-adapters: bank/cash)
 │       → Consumption (đọc [1]+[2] TẠI THỜI ĐIỂM THANH TOÁN, không phải lúc thêm giỏ)
 │       → claim CheckoutSideEffects (1 cổng điều phối DUY NHẤT, không phải nhiều claim rời rạc)
 │            ├─▶ Print (protected-adapters)
 │            ├─▶ [4] Loyalty/Voucher/Promotion finalize
 │            └─▶ [7] Assist/AI (optional, không được chặn luồng)
 │       → AddonConsumption (thêm sau khi bill đã lưu) → BẮT BUỘC trigger lại [4]
 │            Loyalty cho đúng phần chênh lệch — không phải "add-only, quên loyalty"
 │       → Reversal                                   → dùng lại packages/fifo-core (không tự chế riêng)
 │       │
 │       └── [3c] CHUỖI COGS/P&L (`FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md`) — ĐÂY LÀ
 │              CHUỖI QUAN TRỌNG NHẤT PHÁT HIỆN QUA CHAIN-TRACE, PHẢI THIẾT KẾ ĐÚNG
 │              NGAY TỪ ĐẦU (không phải patch sau):
 │              getCOGS() PHẢI trả 2 con số tách biệt, không phải 1:
 │                cogsTheoretical = RecipeVersion(dateKey) × CostHistory(dateKey)
 │                cogsActual      = Σ costBasis THẬT của các Unit đã FIFO-allocate
 │                                  cho đúng bill đó (Unit mang costBasis — đây là lý
 │                                  do costBasis PHẢI ở trên Unit, không phải suy từ
 │                                  công thức — hệ thống cũ chưa từng có con số này)
 │                variance = cogsActual − cogsTheoretical → packages/reporting/
 │                  variance-report.ts hiển thị làm chỉ số CHÍNH, không phải phụ
 │              → P&L theo channel (đọc Bill.channel) → tách lãi/lỗ theo kênh
 │              → book_closing (snapshot tháng) → correction giữ v1, KHÔNG xoá khi
 │                mở lại (packages/compaction/correction-rebuild.ts)
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
 │       │
 │       └── [6a] CHUỖI PAYROLL — luồng chuẩn hệ thống mới, đúc kết từ khảo sát
 │              vòng đời dữ liệu cũ (`FIFO-CHAIN-TRACE-PAYROLL-V1.md`):
 │              CheckIn → PayTerms{rate,otRate,otThreshold} SNAPSHOT NGAY TRÊN
 │                shift đó (không phải trường trang trí — computeWage() PHẢI đọc
 │                từ snapshot này, KHÔNG được join bảng Employee hiện tại)
 │                → CheckOut (auto-close nếu treo qua ngày, 2 lớp dự phòng)
 │                → ReviseState (sửa giờ sai — BẮT BUỘC ghi operationId/audit,
 │                  và BẮT BUỘC phát domain event nếu ca đang sửa là ca "hôm nay
 │                  đang mở", để mọi actor-gate khác [checklist, ký tên kho/BTP]
 │                  refresh đồng bộ — không âm thầm khoá quyền không rõ nguyên nhân)
 │                → ComputePayroll(dateKey) → resolve PayTerms có hiệu lực đúng
 │                  employee+dateKey đó (cùng nguyên tắc versioned đã áp cho
 │                  Recipe/CostBasis/Packaging — đây là lần thứ 5 cùng 1 lớp lỗi
 │                  xuất hiện, xác nhận chắc chắn là nguyên tắc kiến trúc, không
 │                  phải case riêng)
 │                → PayrollClosing (snapshot THÁNG bất biến — CHƯA TỪNG TỒN TẠI ở
 │                  hệ thống cũ, phải xây mới hoàn toàn theo đúng pattern đã có ở
 │                  `packages/compaction` cho book_closing, correction giữ v1)
 │                → KPI (laborCupTarget/laborBillTarget, packages/reporting)
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

REVERSAL/CORRECTION (cross-cutting PATTERN, không phải 1 domain — mọi nhánh [2][2a]
[2b][2c][3][3c][6a] đều gọi vào đây thay vì tự chế cơ chế hoàn/sửa riêng) ──
packages/commands/reversal — luồng chuẩn đúc kết từ khảo sát TOÀN BỘ cách hệ thống
cũ từng hoàn/sửa dữ liệu (`FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md`). Hệ thống cũ
có 3 cơ chế khác nhau do viết ở nhiều thời điểm (không phải do nghiệp vụ đòi hỏi
khác nhau — 1 trong 3 cơ chế tự nhận trong comment là "lẽ ra nên dùng chung engine
kia"). Hệ thống mới chỉ cần ĐÚNG 2 pattern, dùng xuyên suốt mọi domain:
  ├── ReverseTransaction(referenceId, scope) — cho "sự kiện X đã tiêu thụ/tạo ra Y
  │     đơn vị kho, giờ hoàn ngược": huỷ bill, huỷ mẻ đang nấu, sửa add-on, sửa 1
  │     dòng ledger sai (ghi dòng ĐẢO + dòng ĐÚNG, referenceId trỏ về dòng gốc —
  │     ledger append-only thật, KHÔNG update trực tiếp dòng cũ). LUÔN unit/FIFO-
  │     aware, LUÔN qua claim theo doc ID xác định trước (idempotent tự nhiên) —
  │     đây là pattern DUY NHẤT, không còn "đường POS" và "đường QUANLY" tách biệt
  │     như cũ (2 đường cũ khác nhau về CHẤT LƯỢNG THỰC THI chứ không phải Ý ĐỊNH)
  ├── ReviseState(entityId, field, newValue, reason) — cho "sửa lại 1 con số trạng
  │     thái đã chốt sai" khi KHÔNG có ý nghĩa tiêu thụ ngược: yield mẻ BTP, giờ
  │     công payroll, kiểm kê tồn. LUÔN kèm audit-array giữ lịch sử, và BẮT BUỘC
  │     trả lời rõ "báo cáo lịch sử đóng băng theo giá trị tại thời điểm phát sinh
  │     hay tính lại theo giá trị mới" — đây là gap lớn nhất xuất hiện ở CẢ Recipe,
  │     Packaging, BTP yield, Payroll (5 lần độc lập) khi hệ thống cũ không trả
  │     lời câu hỏi này nhất quán
  └── Side-effect ngoài kho (loyalty/voucher/lương) KHÔNG nằm trong 2 pattern trên
        — là domain event riêng (`OrderVoided`, `ContainerFound`...) mà
        ReverseTransaction/ReviseState chỉ là MỘT trong các handler đăng ký lắng
        nghe, cùng LoyaltyReversalHandler/VoucherReversalHandler/
        PayrollDeductionReversalHandler — tránh lặp lại tình trạng "biết cần hoàn
        nhưng quên/không làm" đã thấy ở hệ thống cũ (loyalty/voucher khi huỷ bill
        CỐ Ý không tự hoàn — quyết định nghiệp vụ hợp lệ, nhưng nếu chủ quán muốn
        đổi quyết định đó ở hệ thống mới, chỉ cần thêm 1 handler, không phải sửa
        lại luồng ReverseTransaction chính)

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
