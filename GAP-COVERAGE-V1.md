# ĐỐI CHIẾU GAP → CODE → TEST

> Quy tắc 2 của phiên code: **toàn bộ danh sách gap ở `GIEO-REBUILD-HANDOFF-V2.md` §4 là YÊU CẦU phải giải quyết, không phải ghi chú tham khảo.** File này là bảng đối chiếu để kiểm được điều đó, thay vì tin là đã làm.
>
> Cột "Test" là tên `describe`/`test` chạy được: `node tools/run-tests.js "<chuỗi>"`.

---

# §4.1 — Ưu tiên cao nhất (kiến trúc lõi)

| # | Gap | Đã giải quyết ở | Test chứng minh |
|---|---|---|---|
| 1 | `untrackedPendingDelta` là convention rải rác — gốc của bug #1/#11/#14/#17/#18 | `fifo-core/ledger` — **không phải tham số**, truyền vào là bị từ chối; tính bởi đúng 1 quy tắc, không có danh sách type ngoại lệ | `MỌI type đều theo cùng 1 quy tắc`, `RECEIVING cũng theo đúng quy tắc — đây CHÍNH LÀ bug #11` |
| 2 | Idempotency không đồng nhất — 6 đường phụ thiếu (#6/#13/#21/#22/#23/#24) | `commands/pipeline` — 1 guard duy nhất; `defineCommand()` ném lỗi nếu command không khai hàm `operationId` | `IDEMPOTENCY: bấm thanh toán 2 lần KHÔNG trừ kho 2 lần`, `command không khai operationId thì KHÔNG định nghĩa được` |
| 3 | 2 app ghi trực tiếp cùng dữ liệu kho bằng 2 công thức độc lập | `fifo-core/allocation` (1 engine), `fifo-core/projection` (1 công thức), `commands/inventory.AdjustInventory` thay `applyStockTransaction` | `POS và QUANLY gọi CÙNG một hàm nên không thể lệch`, `AdjustInventory — thay applyStockTransaction` |
| 4 | Recipe/Cost không versioned — vi phạm rõ nhất toàn audit | `compaction/versioned-input` + `recipe-cost-btp/recipe` + `recipe-cost-btp/cost` | `đổi công thức KHÔNG làm trôi COGS của bill cũ`, `bill cũ giữ giá cũ dù hôm nay đã đổi giá` |
| 5 | **`ApproveLostContainer` không tồn tại** (xác nhận độc lập 3 lần) | `commands/approval.ApproveLostContainer` | `sau khi duyệt, RestoreFoundContainer chạy được — logic legacy đã có nhưng không bao giờ tới` |
| 6 | **"COGS actual" chưa từng tồn tại** | `Unit.costBasis` + `recipe-cost-btp/cogs` (2 vế + variance) | `NCC tăng giá đột xuất → phát hiện được, thứ legacy KHÔNG thể` |
| 7 | Nguyên tắc versioning lịch sử (7 instance độc lập) | `compaction/versioned-input` — **một** cơ chế cho cả 7 domain | `V3 — resolve TỪNG NGÀY (chặn instance #6/#7)` |
| 8 | Bill KHÔNG lưu actor (`soldByActorId`) | `commands/sales.buildBill` — bắt buộc, từ chối nếu thiếu | `soldByActorId BẮT BUỘC — ngoại lệ duy nhất của hệ thống cũ (§4.7)` |
| 9 | **Reporting: 0% phân quyền đọc** | `read-layer/gateway` — mọi query đăng ký quyền qua cùng sổ với command ghi, mặc định đóng | `read-layer — phân quyền đọc (đóng gap 0% của Reporting)` |
| 10 | **Loyalty: số dư chỉ là field cộng dồn, không có ledger** | `loyalty/ledger` — không tồn tại hàm set số dư; số dư = tổng sổ | `KHÔNG tồn tại hàm set số dư`, `phát hiện số dư trôi — phép đối chiếu legacy KHÔNG làm được` |

---

# §4.2 — Ưu tiên cao, theo domain

## FIFO / Inventory

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| Stock-count approval không idempotent | `commands/approval.ApproveStockCount` | `2 người duyệt cùng lúc KHÔNG cộng đúp variance` |
| `applyStockTransaction` ghi thẳng `currentStock`, bị recompute kế tiếp xoá | `commands/inventory.AdjustInventory` đi qua Unit Engine | `điều chỉnh trên 1 lô đi qua Unit Engine, GHI ĐÈ tuyệt đối` |
| Reversal không unit-aware ở QUANLY (#17) | `fifo-core/reconciliation.reverseAllocations` — điểm gọi DUY NHẤT | `hoàn đúng về Unit gốc, kể cả khi FIFO hiện tại đã khác` |
| Debt là số âm ẩn | `fifo-core/unit.debt` — field tường minh | `tra được Unit nào đang nợ mà không cần kiểm tra dấu` |

## Sales / COGS / P&L

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| Addon không re-trigger loyalty | `commands/sales.RecordAddon` phát event + `loyalty/accrual.accrueForAddon` | `addon cộng điểm cho ĐÚNG phần chênh lệch` |
| `plChannelFeeForDay()` hard-code trả 0 | `commands/sales` — `channel` first-class, phí trừ thật vào `netRevenue` | `bán qua sàn TRỪ phí thật khỏi doanh thu thuần` |
| `moLaiThang()` xoá snapshot với audit log RỖNG | `FIFO-COMPACTION-CONTRACT-V1.md` §3.3 + `hr/payroll.closePayroll` giữ v1 tạo v2 | `correction giữ v1: v2 trỏ về v1, không xoá` |
| `cogsPct` chỉ passive, không active alert | `reporting/variance-report.toAlerts` | `vượt target thì PHÁT cảnh báo chủ động` |

## BTP

| Gap | Trạng thái |
|---|---|
| Không có actual-vs-theoretical cho tồn BTP | ⬜ **CHƯA LÀM** — `recipe-cost-btp/btp` chưa xây |
| Chỉ 1/3 đường ghi waste có `ingredientBreakdown` | ✅ `commands/inventory.RecordWaste` luôn có — `luôn có ingredientBreakdown` |
| Báo cáo BTP ngày tính đúng nhưng không render | ⬜ **CHƯA LÀM** — thuộc UI (P9/P10) |

## Payroll

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| `payTerms` write chết | `hr/shift.computeWage` chỉ nhận shift, không có tham số cho Employee hiện tại | `đổi lương cuối tháng KHÔNG làm trôi lương các ca đã chấm` |
| Không có `PayrollClosing` | `hr/payroll.closePayroll` | `PayrollClosing — snapshot tháng, CHƯA TỪNG TỒN TẠI ở legacy` |
| Sửa ca hôm nay âm thầm khoá 23 điểm `requireCheckedIn()` | `hr/shift.reviseShift` phát `EmployeeCheckedInStateChanged` | `sửa ca ĐANG MỞ hôm nay thành đóng thì PHÁT EVENT` |

## Reversal / Correction

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| 10 cơ chế hoàn/sửa khác nhau | `commands/reversal` — đúng 2 pattern + event | `Reversal — 2 pattern thay 10 đường của legacy` |
| Sửa 1 dòng ledger sai (gap) | `commands/reversal.CorrectLedgerEntry` | `ghi dòng ĐẢO + dòng ĐÚNG, KHÔNG update dòng cũ` |

## Loyalty

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| Addon/reversal không kéo theo loyalty | `loyalty/accrual.accrueForAddon` / `.reverseForVoidedBill` | `mặc định HOÀN điểm khi huỷ bill — legacy không hoàn gì cả` |
| Không có tier | Chỗ nối sẵn: `accrualMultiplier` mặc định 1 | `tier là chỗ nối sẵn, mặc định hệ số 1` |

## Alerts

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| Severity ghi nhưng không dùng để route | `alerts/alert.rank` đọc cả severity | `alert danger không bị nuốt vào bucket chung` |
| PUSH không nhất quán (BTP vs container) | `alerts/alert.TYPES` — severity/audience theo mức nghiêm trọng thật | `hạn dùng BTP push ngang hạn dùng chai/hũ` |
| Tồn thấp chỉ ở QUANLY | `LOW_STOCK.audience = BOTH` | `tồn thấp hiện ở CẢ POS lẫn QUANLY` |
| `stockoutTargetPct` dead-code | `STOCKOUT` xây đủ 3 chân | `STOCKOUT có đủ 3 chân` |

## Catalog

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| Không có sold-out/86'd | `catalog/menu.computeAvailability` dẫn xuất từ FIFO | `tồn = 0 thì KHÔNG bán được — legacy bán vô hạn` |
| Recipe link là khớp key ngầm → mồ côi khi đổi tên | `catalog/menu.recipeId` con trỏ tường minh | `ĐỔI TÊN giữ nguyên id và recipeId — recipe KHÔNG mồ côi` |
| Campaign linh hoạt nhưng chỉ advisory | `catalog/promotion` — `tier` bắt buộc khai, rule engine tổng quát | `tạo được dạng khuyến mãi thứ 3 mà legacy không làm được` |

## Reporting

| Gap | Đã giải quyết ở | Test |
|---|---|---|
| 2 pipeline doanh thu độc lập | `read-layer/gateway.getRevenue` — 1 implementation | `POS và QUANLY gọi CÙNG một hàm nên không thể lệch` |
| Cache không invalidate khi xoá/sửa bill cũ | `read-layer/merge-canonical.invalidateScope` | `sửa/xoá bill cũ làm mất cache ĐÚNG ngày đó (K4)` |
| Định giá tồn dùng giá scalar gần nhất | `reporting/inventory-valuation` dùng `Unit.costBasis` | `KHÔNG quy hết về giá gần nhất — đúng lỗi legacy` |
| Không có export đã định dạng | `reporting/export-payload` | `reporting/export-payload — export ĐÃ ĐỊNH DẠNG` |

## Protected Infrastructure

| Gap | Trạng thái |
|---|---|
| `POSPrinter._queue` bị đầu độc vĩnh viễn sau 1 lần in lỗi | ⬜ **CHƯA LÀM** — `protected-adapters` chưa xây |
| Container/Unit không rollback nếu in tem lỗi | ⬜ **CHƯA LÀM** |
| Bank payment không đối chiếu số tiền phía client | ⬜ **CHƯA LÀM** — giữ nguyên hành vi, chỉ gắn cờ rủi ro |

---

# §4.3 — Cấu trúc / tổ chức code

| Gap | Trạng thái |
|---|---|
| Menu: 2 app cùng ghi RTDB, race condition | ✅ `catalog/menu` + `sources:['QUANLY']` ở tầng command |
| Path mismatch `food_gieogieo` vs `food_menu_gieogieo` | ⬜ thuộc `legacy-firebase-adapter` — chưa xây |
| Giá menu không real-time tới POS | ⬜ thuộc UI/persistence — chưa xây |
| Bất đối xứng retry Loyalty vs Stamp-free | ✅ `loyalty/ledger` — cùng một đường ghi cho mọi loại |
| 12/16 alert rơi vào khuôn UI chung | ✅ `alerts/alert.TYPES` — mỗi loại khai trường bắt buộc riêng |
| `prep_forecasts` tách rời luồng nấu thật | ⬜ chưa xây (advisory only, đúng thiết kế) |
| `storage_locations` chỉ phủ 1 phần nghiệp vụ | ⬜ chưa xây — đã hạ ưu tiên theo `FEATURE-TREE-V1.md` §4.12 (single-store) |

---

# CÒN LẠI — chưa làm, theo đúng thứ tự phase

| Phase | Nội dung |
|---|---|
| P5 (phần BTP) | `recipe-cost-btp/btp` — PrepBatch, yield, actual-vs-theoretical cho tồn BTP |
| P6 | `compaction` — snapshot builder / verifier / purge (đã có `VersionedInput`) |
| P1 (adapter) | `protected-adapters` — bill printer (kèm **fix** poisoned queue), label printer, scanner, bank |
| P1 (adapter) | `legacy-firebase-adapter` + `persistence-firebase` |
| P9 / P10 | UI POS + QUANLY |
| P12 / P13 | Shadow comparison + cutover |

**Ba thứ đầu là điều kiện để chạy được với dữ liệu thật.** Hiện tại toàn bộ domain là hàm thuần, chạy và kiểm được bằng test nhưng chưa nối vào Firebase — đúng trạng thái READ-ONLY mà chủ hệ thống yêu cầu.
