# GIEO SYSTEM REBUILD — HANDOFF TỔNG HỢP V2

> **Trạng thái:** PLANNING/AUDIT HOÀN TẤT — CHƯA CÓ 1 DÒNG CODE NÀO ĐƯỢC VIẾT TỪ TRACK NÀY.
> Toàn bộ tài liệu trong track này (kể cả file này) là **kế hoạch + audit**, không phải source code.
> File này **thay thế `GIEO-NEW-CHAT-HANDOFF-FLAN-1.md`** làm điểm vào cho bất kỳ ai (người hoặc Claude session mới) cần hiểu toàn bộ công việc đã làm mà không phải đọc lại từ đầu. `GIEO-SYSTEM-REBUILD-PLAN.md` vẫn là **bản đồ Phase P0-P13 để thi công** — file này bổ sung/khớp nối vào đó, không thay thế.

---

# 0. MỆNH LỆNH GỐC — ĐỌC TRƯỚC KHI LÀM BẤT CỨ GÌ

**Đang xây HỆ THỐNG MỚI, không phải vá `posgieo.html`/`quanlygieo.html`.** 2 file HTML cũ (~50k dòng) chỉ được dùng để trả lời 1 câu hỏi: *"vòng tính năng/chuỗi dữ liệu nào từng tồn tại trong nghiệp vụ thật của quán?"* — không phải "code cũ viết sao thì giữ vậy". Mọi phát hiện trong track này phải được đọc theo khung: **"đây là luồng dữ liệu ĐÚNG cho hệ thống mới, đúc kết từ khảo sát vòng đời dữ liệu cũ"**, không phải "Bug #X chưa vá".

Nguyên tắc thiết kế bắt buộc (từ `GIEO-SYSTEM-REBUILD-PLAN.md` §1, tái xác nhận xuyên suốt mọi audit trong track này):
- FIFO là **root/traceability backbone**, không phải 1 feature của kho.
- `currentStock` luôn là **projection**, không bao giờ là physical truth — `Unit`/`UnitBase` mới là.
- Không để UI sở hữu business state; không để POS và QUANLY có 2 FIFO engine riêng.
- Mọi luồng dữ liệu đi 1 chiều, đơn giản, không trung gian thừa, đích chính xác, không chồng chéo tính năng.
- Cây tính năng phải tự nó cho biết cái gì bắt buộc code cùng nhau, cái gì chỉ cần chừa điểm nối.

---

# 1. BẢN ĐỒ TÀI LIỆU — ĐỌC THEO THỨ TỰ NÀY

| # | File | Vai trò | Đọc khi nào |
|---|---|---|---|
| 1 | **File này** (`GIEO-REBUILD-HANDOFF-V2.md`) | Điểm vào, tổng hợp, danh sách gap hợp nhất | Đầu tiên, luôn luôn |
| 2 | `GIEO-SYSTEM-REBUILD-PLAN.md` | Master build plan, Phase P0-P13, North Star, invariant #1-#20 | Trước khi bắt đầu code bất kỳ Phase nào |
| 3 | `GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md` | Cây thư mục monorepo đầy đủ, quy tắc import direction | Trước khi tạo package đầu tiên |
| 4 | `FEATURE-TREE-V1.md` | **Cây tính năng tổng thể** — 10 domain, dependency BẮT BUỘC vs CHỪA ĐIỂM NỐI, 18 vi phạm đã xác nhận (§4) | Trước khi quyết định thứ tự build domain nào trước |
| 5 | `FIFO-CORE-ARCHITECTURE-V2.md` | Thiết kế chi tiết FIFO Engine — Unit model, lifecycle, 10 trách nhiệm engine, idempotency pattern | Khi code `packages/fifo-core` (Phase 3) |
| 6 | `POS-QUANLY-PERMISSION-CONTRACT-V1.md` | 3 tầng quyền EXECUTE/REVIEW-APPROVE-CORRECT/MASTER-CONFIGURE, ma trận quyền đầy đủ | Khi thiết kế `AccessContext`/permission check ở Command layer |
| 7 | `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md` | Bill/Label printer, Scanner, Bank payment — ranh giới KHÔNG được viết lại | Khi code `packages/protected-adapters` |
| 8 | `DEAD-FEATURE-PRUNING-V1.md` | Cái gì an toàn xoá hẳn, cái gì chỉ xoá UI-sửa giữ đường-đọc | Khi dọn scope trước khi migrate |
| 9 | `LEGACY-FIFO-AUDIT.md` | Audit sâu Unit Engine + bảng đối chiếu 24 bug legacy | Tra cứu khi nghi ngờ 1 hành vi cụ thể của legacy |
| 10 | `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` | 3 cơ chế snapshot (cache/closing/book_closing) + archive mechanism | Khi code `packages/compaction` |
| 11 | `LEGACY-FIREBASE-PATH-MAP-V1.md` | Map path Firebase cũ → canonical mới | Khi code `packages/legacy-firebase-adapter` |
| 12-21 | **10 file `FIFO-CHAIN-TRACE-*.md`** (BTP, Raw-material, Sales-COGS-PL, Stock-count, Payroll, Reversal-Correction, Loyalty, Alerts, Catalog-Promotion, Reporting) | Chuỗi dữ liệu đầy đủ đầu-cuối cho từng domain, đánh dấu ĐỨT CHUỖI/GAP/KHÔNG ĐỨT | Khi code command pipeline của đúng domain đó — đọc chain-trace tương ứng TRƯỚC khi viết command đầu tiên |

`GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` (bản brief cũ hơn) vẫn còn giá trị lịch sử về North Star gốc nhưng **không còn đầy đủ** so với file này — không dùng làm điểm vào nữa.

---

# 2. TÓM TẮT CÂY TÍNH NĂNG (chi tiết đầy đủ ở `FEATURE-TREE-V1.md`)

```text
[0] IDENTITY & ACCESS (packages/hr)         — gốc, cấp actorId cho mọi mutation
[1] CATALOG (packages/catalog)              — Menu/Category/Topping/Packaging/Recipe, sold-out dẫn xuất từ FIFO
[2] FIFO / INVENTORY CORE (packages/fifo-core) — xương sống, có 3 chuỗi con:
      [2a] Raw material  [2b] BTP (prep)  [2c] Stock-count → Approval
[3] SALES / Bill (packages/commands/sales)  — có chuỗi con [3c] COGS/P&L (quan trọng nhất)
[4] LOYALTY (packages/loyalty)              — Customer, LoyaltyLedger, Stamp-free, Auto-promotion
[5] SHIFT/CASH (packages/commands/shift)
[6] HR/PAYROLL (packages/hr mở rộng)        — có chuỗi con [6a] Payroll
[7] FINANCE/CONFIG (packages/finance)
[8] ALERTS (packages/alerts)                — sink 2 chiều, đọc từ mọi domain khác
[9] REPORTING (packages/reporting)          — chỉ đọc, xây sau cùng

CROSS-CUTTING (không phải domain):
  REVERSAL/CORRECTION (packages/commands/reversal) — ReverseTransaction + ReviseState + domain event
  PROTECTED INFRASTRUCTURE (packages/protected-adapters) — printer/scanner/bank, KHÔNG viết lại logic
```

**Build order rút ra từ bảng phụ thuộc (`FEATURE-TREE-V1.md` §3):**
`[0] → [1]+[2] (song song) → [3] → [4]+[5]+[6] (song song) → [7] (độc lập) → [8] → [9] cuối cùng`

---

# 3. NGUYÊN TẮC KIẾN TRÚC XUYÊN SUỐT QUAN TRỌNG NHẤT — ĐÃ XÁC NHẬN 7 LẦN ĐỘC LẬP

**"Mọi input ảnh hưởng số tiền/số liệu lịch sử phải được versioned + resolve theo point-in-time (hoặc theo TỪNG NGÀY trong 1 khoảng, không theo 1 mốc đại diện cho cả khoảng)."**

Đây không phải suy đoán — là kết luận rút ra sau khi cùng 1 lớp lỗi xuất hiện độc lập ở **7 domain khác nhau**, không liên quan nhau về nghiệp vụ:

| # | Domain | Biểu hiện cụ thể | Nguồn |
|---|---|---|---|
| 1 | Recipe | Đổi công thức → COGS lịch sử bị tính lại theo công thức mới | `LEGACY-FIFO-AUDIT.md` §13 |
| 2 | Cost (giá nguyên liệu) | `invalidateSalesCache()` xoá sạch cache khi đổi giá | `FIFO-CORE-ARCHITECTURE-V2.md` §10 |
| 3 | Packaging | Cùng cơ chế `invalidateSalesCache()` | `FEATURE-TREE-V1.md` §4.8 |
| 4 | BTP yield | Sửa yield mẻ cũ → `prepCostOn` luôn resolve `yieldActualAvg` hiện tại cho mọi `dateKey` | `FIFO-CHAIN-TRACE-BTP-V1.md` |
| 5 | Payroll | `payTerms` snapshot lúc check-in bị ghi nhưng KHÔNG BAO GIỜ được đọc lại — tính lương luôn join bảng nhân viên hiện tại | `FIFO-CHAIN-TRACE-PAYROLL-V1.md` |
| 6 | KPI Target | `computeKPIs()` resolve version target tại NGÀY CUỐI của cả khoảng báo cáo rồi áp cho toàn khoảng | `FIFO-CHAIN-TRACE-ALERTS-V1.md` §5 |
| 7 | So sánh báo cáo theo kỳ | "Báo cáo kỳ" (tuần này/tuần trước) không hề đóng băng, cả 2 cột luôn tính sống | `FIFO-CHAIN-TRACE-REPORTING-V1.md` §4-5 |

**Ngoại lệ ĐÚNG cần học theo, không phải sửa:** (a) giá món snapshot vào Cart/Bill lúc thêm món — không join động (`FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md` §8); (b) P&L tháng qua `book_closings_gieogieo` — nơi DUY NHẤT làm đúng "đóng băng + cảnh báo nếu số sống trôi khỏi số đã chốt" (`FIFO-CHAIN-TRACE-REPORTING-V1.md` §5). Đây là 2 mẫu tham chiếu khi thiết kế cơ chế versioning chung.

**Hệ quả thiết kế bắt buộc:** `RecipeVersion`/`CostBasis`/`PayTerms`/`ConfigVersion`/report-freeze phải dùng chung 1 cơ chế versioning trong `packages/compaction`, không xử lý riêng lẻ từng domain.

---

# 4. DANH SÁCH HỢP NHẤT TOÀN BỘ GAP/VI PHẠM ĐÃ XÁC NHẬN

> Đây là checklist DUY NHẤT cần dùng khi lập Regression Suite (`GIEO-SYSTEM-REBUILD-PLAN.md` §18). Mỗi dòng có nguồn gốc để tra chi tiết, không lặp lại toàn bộ nội dung ở đây.

## 4.1 Ưu tiên CAO NHẤT — kiến trúc lõi, ảnh hưởng nhiều domain

| Gap | Domain | Nguồn |
|---|---|---|
| `untrackedPendingDelta` là convention rải rác, dễ bỏ qua — gốc của 5 bug legacy (#1/#11/#14/#17/#18) | FIFO Core | `LEGACY-FIFO-AUDIT.md` §16.1 |
| Idempotency không đồng nhất — đường bán hàng chính đủ, 6 đường phụ thiếu (#6/#13/#21/#22/#23/#24) | FIFO Core | `LEGACY-FIFO-AUDIT.md` §16.2 |
| 2 app (POS/QUANLY) ghi trực tiếp cùng dữ liệu kho bằng 2 công thức độc lập | FIFO Core | `LEGACY-FIFO-AUDIT.md` §16.3 |
| Recipe/Cost không versioned — vi phạm rõ nhất toàn audit | FIFO Core / Sales | `LEGACY-FIFO-AUDIT.md` §16.4 |
| **`ApproveLostContainer` không tồn tại** — xác nhận ĐỘC LẬP 3 lần (FIFO audit Bug #12, Alerts audit, Stock-count chain) | FIFO/Stock-count | `FEATURE-TREE-V1.md` §4.10, `[2c]` |
| **"COGS actual" (cost-basis FIFO thật trên Unit) chưa từng tồn tại** — `cogsActual` trong legacy thực chất là theoretical bị đặt tên sai | Sales/COGS | `FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md`, `FIFO-CORE-ARCHITECTURE-V2.md` §10b.1 |
| Nguyên tắc versioning lịch sử — xem §3 ở trên (7 instance) | Recipe/Cost/Packaging/BTP/Payroll/KPI/Reporting | nhiều file |
| Bill KHÔNG lưu actor (`soldByActorId`) — ngoại lệ duy nhất trong toàn hệ thống | Sales | `FEATURE-TREE-V1.md` §4.7 |
| **Reporting: 0% phân quyền đọc** — QUANLY dùng 1 tài khoản Firebase dùng chung, mọi người thấy toàn bộ P&L/COGS/khách hàng | Reporting | `FEATURE-TREE-V1.md` §4.18, `FIFO-CHAIN-TRACE-REPORTING-V1.md` §8 |
| **Loyalty: số dư chỉ là field cộng dồn, không có ledger** — nặng hơn cả gap `untrackedPendingDelta`, không có cách phục hồi nếu trôi | Loyalty | `FEATURE-TREE-V1.md` §4.15, `FIFO-CHAIN-TRACE-LOYALTY-V1.md` §8/§10 |

## 4.2 Ưu tiên cao — theo domain

**FIFO/Inventory:** bảng đầy đủ 24 bug (đối chiếu code thật, 100% "CHƯA vá" tại thời điểm audit) — `LEGACY-FIFO-AUDIT.md` §15. Trong đó nổi bật: weighing (#3/#4/#5/#9/#10), reversal không unit-aware ở QUANLY (#17), stock-count approval không idempotent (không có trong bảng 24 bug gốc nhưng xác nhận riêng ở `FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md`), `applyStockTransaction` ghi thẳng `currentStock` bỏ qua Unit Engine làm điều chỉnh kiểm kê bị xoá âm thầm bởi lần tính lại kế tiếp.

**Sales/COGS/P&L:** addon không re-trigger loyalty (§4.16), `plChannelFeeForDay()` hard-code trả về 0 dù đã có UI slot chờ sẵn, `moLaiThang()` (mở lại sổ tháng) xoá snapshot cũ với audit log RỖNG, `cogsPct` KPI chỉ passive không active alert.

**BTP:** không có actual-vs-theoretical cho tồn BTP, chỉ 1/3 đường ghi waste có `ingredientBreakdown` dù kỹ thuật đã có sẵn trong cùng hàm (`_submitDrinkWasteImpl`), báo cáo BTP ngày tính đúng nhưng KHÔNG BAO GIỜ render ra UI.

**Payroll:** `payTerms` write chết (đã liệt kê ở §3), KHÔNG có `PayrollClosing`/snapshot tháng nào (khác hẳn `book_closings` đã có cho P&L), sửa ca "hôm nay đang mở" qua QUANLY có thể âm thầm khoá 23 điểm `requireCheckedIn()` ở POS.

**Reversal/Correction:** 10 cơ chế hoàn/sửa khác nhau về chất lượng dù cùng ý định (bill-delete POS vs QUANLY tự nhận trong comment "lẽ ra nên dùng chung engine") — kết luận thiết kế: chỉ cần 2 pattern (`ReverseTransaction`/`ReviseState`) + domain event cho side-effect, không phải 10.

**Loyalty:** addon/reversal không kéo theo loyalty (§4.16), không có tier (chưa cần xây, chỉ cần chừa điểm nối), redemption đi đúng qua FIFO/COGS (mẫu ĐÚNG cần giữ).

**Alerts:** severity ghi nhưng không dùng để route (§4.17), PUSH không nhất quán theo mức nghiêm trọng thật (hạn dùng BTP bị chôn trong khi hạn dùng container được push), tồn thấp chỉ hiện ở QUANLY không hiện ở POS, `stockoutTargetPct` là đường dead-code hoàn chỉnh từ đầu tới cuối.

**Catalog:** không có sold-out/86'd (§4.13), Recipe link là khớp key ngầm gây mồ côi dữ liệu khi đổi tên món, campaign builder linh hoạt nhưng chỉ advisory không tự thực thi (§4.14).

**Reporting:** 2 pipeline doanh thu độc lập (POS tự tính, QUANLY tự tính) không đảm bảo khớp nhau, cache không invalidate khi xoá/sửa bill cũ, định giá tồn kho dùng giá scalar gần nhất (không phải FIFO cost thật), không có export báo cáo đã định dạng (chỉ có dump JSON thô).

**Protected Infrastructure:** `POSPrinter._queue` bị "đầu độc" vĩnh viễn sau 1 lần in lỗi (thiếu `.catch()` phục hồi, khác `POSTemPrinter._queue` tự hồi phục đúng) — **đây là bug thật cần SỬA khi viết `BillPrinterAdapter`, không phải giữ nguyên**; container/Unit không rollback nếu in tem lỗi; bank payment không đối chiếu số tiền phía client (rủi ro cần lưu ý cho webhook tương lai) — chi tiết đầy đủ `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md` §6.

## 4.3 Cấu trúc/tổ chức code (không phải bug nghiệp vụ, nhưng bắt buộc sửa khi rebuild)

- Menu — cả 2 app cùng ghi trực tiếp RTDB, race condition không lock/version (`FEATURE-TREE-V1.md` §4.1)
- Path mismatch `food_gieogieo` vs `food_menu_gieogieo` (§4.2)
- Giá menu không thật sự real-time tới POS dù comment ghi nhầm (§4.3)
- Bất đối xứng retry: Loyalty tự phục hồi, Stamp-free chỉ alert rồi bỏ đó (§4.4)
- Alerts: 12/16 loại alert rơi vào khuôn UI chung, mất nội dung chẩn đoán (§4.9)
- `prep_forecasts_gieogieo` tách rời hoàn toàn khỏi luồng nấu thật, chỉ để đọc (§4.11)
- `storage_locations`/`locationStock` chỉ phủ 1 phần nghiệp vụ (Transfer/Refill), các luồng khác vẫn ghi thẳng `currentStock` gộp (§4.12)

---

# 5. QUYẾT ĐỊNH ĐÃ CHỐT — KHÔNG CẦN HỎI LẠI

| Quyết định | Lý do | Nguồn |
|---|---|---|
| **Cắt hẳn Voucher/Rewards cá nhân (`myGifts`, `rewards`)** | Tàn dư hệ thống 1.0, không có UI tạo trong cả 2 app, dữ liệu tới từ nguồn ngoài phạm vi rebuild | Chỉ đạo trực tiếp của chủ hệ thống + `FEATURE-TREE-V1.md` §4.5 |
| **Xoá hẳn** Ví (Wallet), Đồng giá (DG), Quỹ tiền mặt (Cash Fund), `FINISH_REVIEW_RATIO` | Đã bị xoá hoàn toàn ở legacy, không còn gì để migrate | `DEAD-FEATURE-PRUNING-V1.md` §3 |
| **Cắt hẳn Web Serial (`XprinterWNN58E`) fallback** | Xác nhận: "Không cần in qua web, hiện tại đã thông qua apk" — chỉ giữ 1 đường Bluetooth cho Bill printer | Chỉ đạo trực tiếp + `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md` |
| **UI sửa Menu/Khuyến mãi chỉ tồn tại ở QUANLY** — POS chỉ đọc (auto-promotion `togoSettings` tại quầy vẫn sống, không được xoá) | Khớp đúng 3 tầng quyền EXECUTE (POS) / MASTER-CONFIGURE (QUANLY) | `POS-QUANLY-PERMISSION-CONTRACT-V1.md`, `DEAD-FEATURE-PRUNING-V1.md` §2.1 |
| **Đa cửa hàng (`ALL_STORES`) chỉ là khái niệm quyền hạn cho tương lai** — legacy 100% single-store, không có dòng code aggregation nào | Xác nhận qua grep — không có gì để migrate, chỉ cần chừa `storeId` trong mọi query | `FIFO-CHAIN-TRACE-REPORTING-V1.md` §7 |
| **Discount-code (5 kiểu) giữ nguyên thiết kế, không bắt buộc bật lại ngay** | Code còn sống đầy đủ, chỉ UI bị ẩn — quyết định bật/tắt là vận hành, không phải kiến trúc | `FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md` §6 |

---

# 6. RANH GIỚI BẢO VỆ — KHÔNG ĐƯỢC VIẾT LẠI LOGIC, CHỈ BỌC ADAPTER

- **Bill printer** (Bluetooth, `window.AndroidPrinter`) và **Label printer** (LAN/TCP, 3-lớp chống rớt) là 2 engine hoàn toàn tách biệt — không gộp.
- **Scanner** dùng pattern global-callback + pending-map, luôn resolve `{ok,...}`, không bao giờ reject.
- **Bank payment (VietQR)** là handshake 1 lần, KHÔNG có đối chiếu số tiền phía client — giữ nguyên hành vi, chỉ gắn cờ rủi ro cho bất kỳ ai viết webhook sau này.
- Chi tiết đầy đủ + 1 bug thật cần sửa (poisoned print queue) ở `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md`.
- **Phân quyền** phải enforce ở tầng Command/Domain, KHÔNG BAO GIỜ chỉ ở UI visibility — đây là invariant #1 của `POS-QUANLY-PERMISSION-CONTRACT-V1.md`, và là gap nghiêm trọng nhất vừa xác nhận ở domain Reporting (§4.1 trên).

---

# 7. TRACK CODE SONG SONG — `GIEO-MASTER-IMPLEMENTATION-VERIFICATION-V1.md`

Có 1 track KHÁC (session Claude Code riêng) đã viết code TypeScript thật (V1-V22, `tsc -b` pass, shadow simulation, Firebase persistence foundation) cho lõi FIFO/Commands, kiến trúc tương thích với track planning này (`StockUnit`, `ReverseOperation` = compensation không re-allocate, khớp đúng kết luận `ReverseTransaction` ở đây). **Chưa xác nhận track code đó đã đọc/tích hợp** các phát hiện cụ thể của track này: dual `cogsTheoretical`/`cogsActual`, `untrackedPendingDelta` enforcement, waste-traceability asymmetry, `ApproveLostContainer`, `payTerms` versioning, ma trận quyền `POS-QUANLY-PERMISSION-CONTRACT-V1.md`, và toàn bộ 4 domain mới (Loyalty/Alerts/Catalog/Reporting) audit ở phiên này.

**Việc cần làm trước khi track code tiếp tục các domain còn lại:** đối chiếu code thật với file này (§4) + 10 chain-trace, để không lặp lại các gap kiến trúc của legacy dưới cú pháp mới.

---

# 8. GATE — TÀI LIỆU NÀY COI LÀ ĐỦ KHI

- [x] Toàn bộ 10 domain trong cây tính năng đều có chain-trace đầy đủ (đã xong — 10/10).
- [x] Mọi phát hiện được viết theo khung "luồng đúng cho hệ thống mới", không phải "bug cần vá" (đã sửa lại toàn bộ theo yêu cầu).
- [x] Không còn phát hiện nào nằm rải rác ở file phụ lục — toàn bộ đã nối vào `FEATURE-TREE-V1.md` §2/§4.
- [ ] Track code song song đã đọc và đối chiếu với danh sách gap ở §4 file này.
- [ ] Bắt đầu Phase 0 của `GIEO-SYSTEM-REBUILD-PLAN.md` — **CHƯA BẮT ĐẦU, đây là bước tiếp theo khi có lệnh code.**
