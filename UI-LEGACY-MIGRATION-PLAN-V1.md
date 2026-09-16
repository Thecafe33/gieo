# Kế hoạch migrate UI/UX legacy sang core mới — V3

Trạng thái: **mapping trước khi sửa code; chưa migrate UI**

Nhánh: `claude/confident-wozniak-i81oc8`

Thứ tự: hoàn tất `quanlygieo.html` trước vì đây là app quyền cao, mở/chốt ngày
và phê duyệt; chỉ sau khi QUANLY qua gate mới làm `posgieo.html`.

## 1. Mục tiêu và kiến trúc bắt buộc

Hai file legacy chỉ là nguồn tham khảo cho presentation:

- layout, CSS, component structure;
- modal, navigation, bảng và form;
- interaction/presentation và cách hiển thị dữ liệu.

Markup/CSS có thể được tái sử dụng để giữ UX quen thuộc, nhưng API, tên hàm và
luồng JavaScript legacy **không phải contract phải bảo tồn**. UI được sửa để gọi
controller/API mới thực sự tồn tại.

```text
UI đã migrate
    ↓
Controller/API mới
    ↓
Core mới (source of truth duy nhất)
    ↓
Canonical data/state
```

Không dùng compatibility bridge làm kiến trúc chính. Chỉ cân nhắc một adapter
tạm thời cho một component đặc biệt phức tạp sau khi chứng minh migrate trực tiếp
không hợp lý. Adapter đó chỉ đổi shape input/output; không chứa business logic,
không tính tồn/FIFO, không sửa `unitBase`, không tạo transaction và phải có kế
hoạch xóa.

## 2. Các điều cấm

- Không copy business logic, FIFO, cách tính tồn hoặc transaction từ legacy.
- Không tạo inventory engine, state nghiệp vụ hoặc write path thứ hai trong UI.
- Không đổi contract/logic core để chiều theo shape dữ liệu cũ.
- Không gọi trực tiếp persistence/Firebase từ UI.
- Không tự viết lại nghiệp vụ khi core chưa có interface tương ứng.
- Không map một handler cũ sang command “gần giống” chỉ để màn chạy được.
- Không sử dụng `AdjustInventory` thay cho nhập kho, chuyển kho, mở/đóng Unit hay
  consumption nếu semantics không đúng.

Khi thiếu interface, đánh dấu `GAP`, mô tả contract cần bổ sung và dừng flow đó.
Core/interface được bổ sung ở commit riêng, có test riêng, trước khi nối UI.

## 3. Bảng mapping trước khi sửa code

### 3.1 POS — bán hàng, ca và thiết bị

| Function/event UI cũ | Chức năng UI | API/controller/core mới | Cách migrate |
|---|---|---|---|
| chọn món, topping, tăng/giảm số lượng | Quản lý lựa chọn chưa thanh toán | state thuần UI trong `app-pos/controller`; `GetMenu` | Giữ component/menu/cart; bỏ mọi tính giá cuối trong UI. |
| `confirmCashPay`, xác nhận bank/split | Thanh toán | `RecordSale` qua controller | Form cũ tạo command input; total, promotion, FIFO allocation và COGS lấy từ kết quả core. Chống double submit. |
| thêm món vào bill đã ghi | Add-on | `RecordAddon` | Map bill reference + lines; không sửa trực tiếp bill/stock. |
| retry in bill | In lại | `runtime.device.printBill` | Chỉ in payload đã ghi; tuyệt đối không gọi lại `RecordSale`. |
| scan tem/QR | Nhận mã từ thiết bị | `runtime.device.scan` rồi controller/query/command phù hợp | Scanner chỉ trả mã, không quyết định nghiệp vụ. |
| xem menu/cảnh báo/ca | Các màn đọc | `GetMenu`, `GetAlerts`, `GetShiftStatus` | Render loading/error/empty/ready từ query/watch. |
| mở ngày | Bắt đầu business day | **GAP: `OpenBusinessDay` chưa đăng ký** | Cần command bọc `business-day.openDay`. Không viết logic trong UI. |
| chốt ngày | Kết thúc business day | **GAP: `CloseBusinessDay` chưa đăng ký** | Cần command gọi `closeDayBlockers` rồi `business-day.closeDay`. |
| mở két/cash segment | Mở lượt két | **GAP: `OpenCashSegment` chưa đăng ký** | Bổ sung command quanh `shift.openSegment`. |
| đóng két | Chốt lượt két | `CloseCashSegment` | Map form đếm tiền sang command hiện có. |
| check-in/check-out | Chấm công | **GAP: `CheckIn`, `CheckOut` chưa đăng ký** | Bổ sung command quanh `hr/shift.checkIn/checkOut`. |

### 3.2 POS — inventory/FIFO/BTP

| Function/event UI cũ | Chức năng UI | API/controller/core mới | Cách migrate |
|---|---|---|---|
| `findContainerByCode`, màn tra tem | Tra Unit/lịch sử | `GetUnitTrace` | Map mã UI sang `unitId`/query contract; render trace trả về. |
| `loadKhoScreen`, xem tồn | Xem tồn theo item/location | `GetInventoryLevel` | Render projection core; không chạy `_ueRecomputeCurrentStock`. |
| `unitEngineAllocateConsumption`, `_ueComputeAllocation` | FIFO consumption | `RecordSale` hoặc `RecordPrepProduction` | **Xóa logic UI**; command core tự allocation. Không expose allocator cho UI. |
| `_ueRecomputeCurrentStock`, `missingUnitsWarning` | Tính tồn/unit chưa gắn | `GetInventoryLevel` | **Xóa phép tính UI**; hiển thị breakdown core. |
| `applyBackfillConsumptionNoStockEffect` | Backfill consumption | Không có use case UI mới hợp lệ | Không migrate. Nếu cần correction lịch sử, dùng contract correction sau review. |
| `openWasteScreen`, `submitDrinkWaste`, `submitPrepWaste` | Waste/hao hụt | `RecordWaste` | Chuẩn hóa form theo command input; quantity conversion phải do core/interface xác nhận. |
| `submitKhoTx` | Xuất/điều chỉnh kho | `AdjustInventory` chỉ cho correction đúng semantics | Tách intent. Correction → `AdjustInventory`; xuất tiêu thụ thông thường phải đi qua command nghiệp vụ. Intent khác đánh dấu GAP. |
| `applyStockTransferPOS` | Chuyển kho/location | **GAP: chưa có command transfer đăng ký** | Cần interface `TransferInventory` hoặc quyết định domain; không mô phỏng bằng hai adjustment. |
| `createContainersForReceipt`, màn nhận hàng | Nhập kho, tạo Unit/cost basis | **GAP: chưa có command nhận hàng runtime** | Cần `ReceiveInventory` với atomic Unit + ledger mutation; không tạo Unit trong UI. |
| `submitOpenContainer`, `submitFinishContainer` | Mở/đóng Unit | **GAP: chưa có command lifecycle runtime** | Cần interface core cho transition tương ứng; UI chỉ gửi unitId, quantity/reason/scan evidence. |
| `submitRefillLine` | Châm/chuyển lượng giữa vật chứa | **GAP: chưa có command phù hợp** | Xác định semantics domain trước; không sửa `unitBase` trực tiếp. |
| `stockCountReviewAndSubmit`, `submitStockCount` | Gửi kiểm kho | **GAP: mới có `ApproveStockCount`, chưa có submit command** | Cần command tạo đề nghị kiểm kho; QUANLY duyệt bằng command hiện có. |
| `stockCountReportLost` | Báo mất Unit | `ReportLostContainer` | Map scan + reason; không tự trừ tồn. |
| `submitFoundLostContainer` | Tìm lại Unit | `RestoreFoundContainer` | Map evidence; core quyết định state/ledger. |
| `startPrepBatch`, `submitPrepFinish` | Sản xuất BTP | `RecordPrepProduction` | Form UI thu input; input allocation, output Unit/yield do core. Xác nhận contract có hỗ trợ start/finish hai bước; nếu không, đánh dấu GAP thay vì giả lập. |
| `submitPrepYieldEdit` | Sửa yield | `EditPrepYield` | Gọi command với reference/reason; không sửa batch trực tiếp. |
| `loadPrepBatchesPOS`, yield stats | Xem BTP | `GetBTPReport` hiện là report | **GAP nếu cần danh sách batch vận hành**: bổ sung query chuyên dụng, không đọc Firebase từ UI. |
| các hàm `posVesselUnitFactor`, quy đổi unit | Quy đổi đơn vị nhập form | **Chưa có UI-facing conversion contract được đăng ký** | Giữ formatting đơn vị thuần UI; mọi conversion ảnh hưởng quantity phải qua interface core mới, không copy bảng hệ số cũ. |
| màn transaction/history | Lịch sử kho/ledger | `GetUnitTrace` chỉ phủ theo Unit | **GAP: cần `GetInventoryTransactions`/ledger history query** cho danh sách/filter/export. |

### 3.3 QUANLY

| Function/event UI cũ | Chức năng UI | API/controller/core mới | Cách migrate |
|---|---|---|---|
| dashboard/revenue/COGS/P&L | Báo cáo | `GetRevenue`, `GetCOGS`, `GetPnL`, `ComparePeriods` | Render dữ liệu + meta; thiếu actual phải hiện “chưa đủ”. |
| kho/trace/valuation/variance | Điều tra kho | `GetInventoryLevel`, `GetUnitTrace`, `GetInventoryValuation`, `GetVarianceReport` | Không recompute từ raw legacy. |
| inbox/phê duyệt | Duyệt mất hũ, kiểm kho, chi phí | `GetPendingApprovals`, item-provided command, các `Approve*` | UI không tự đoán command từ loại item. |
| điều chỉnh/chữa sai | Correction | `AdjustInventory`, `ReviseState`, `CorrectLedgerEntry` | Chọn command theo intent contract; luôn có reference/actor/reason. |
| hoàn/hủy giao dịch | Reversal | `ReverseTransaction` | Không xóa/sửa transaction cũ. |
| báo cáo BTP | Xem BTP | `GetBTPReport` | Chỉ đọc projection/report. |
| export | Xuất dữ liệu | `ExportReport` | Truyền lại meta/provenance query nguồn. |
| catalog/recipe/promotion/HR/payroll/config CRUD | Form quản trị | **GAP: runtime hiện chưa đăng ký đầy đủ command/query CRUD** | Lập contract theo từng màn; không dùng write Firebase legacy. |

## 4. Trình tự triển khai từng file

### Pha A — đóng GAP interface tối thiểu

Mỗi bước một file/commit có test. Ưu tiên blockers của `BAN-GIAO-V1.md` §2.1:

1. `commands/business-day.js`: vòng đời ngày; ngày không được mở bằng cấu hình
   lịch. `CheckIn` đầu tiên tạo business day trong cùng atomic MutationPlan.
2. `commands/shift.js`: `OpenCashSegment`, `CheckIn`, `CheckOut`.
3. `bootstrap/runtime.js`: đăng ký command và authority.
4. Các inventory interface thiếu được chốt contract **trước** khi làm màn tương
   ứng: receive, Unit lifecycle, transfer, stock-count submit, unit conversion,
   transaction history.

Không thay core algorithm; chỉ expose use case đúng qua command/query pipeline.

### Pha B — migrate `quanlygieo.html`

1. Chụp baseline screenshot và layout/component/modal/navigation/form quản lý.
2. Giữ/reuse presentation; tách bỏ script nghiệp vụ legacy.
3. Sửa event binding để gọi trực tiếp `app-quanly/controller` bằng action mới.
4. Ưu tiên PIN/role, mở-chốt ngày, inbox/phê duyệt và các flow quyền cao trước;
   flow có `GAP` phải disabled rõ ràng đến khi interface được bổ sung.
5. Sau mỗi lát dọc, xóa business function legacy tương ứng; không để fallback
   ghi legacy hay dual writer.
6. QUANLY qua toàn bộ gate §5 rồi mới mở file POS.

### Pha C — migrate `posgieo.html`

Lặp cùng phương pháp: reuse presentation, map event trực tiếp sang controller/API
mới, xóa logic/read-write legacy theo từng lát dọc đã có test. Không giữ global
function legacy chỉ để tương thích nếu event có thể bind thẳng vào controller.

Build cuối cùng phải sinh đúng hai file tự chứa `quanlygieo_new.html` và
`posgieo_new.html`; hai file `*-new.html` dùng dấu gạch ngang hiện tại chỉ là
artifact tạm của shell tự dựng và không phải deliverable cuối.

## 5. Gate bắt buộc

### Kiến trúc

- UI chỉ import/call controller/API mới.
- Controller chỉ gọi `runtime.query/watch/command/device`.
- Không business calculation hoặc Firebase write trong UI/controller.
- Không tồn tại inventory/FIFO implementation thứ hai.
- Mỗi `GAP` hoặc đã có interface + test, hoặc flow vẫn disabled minh bạch.

### Flow inventory phải kiểm

1. **Nhập kho:** một atomic operation tạo đúng Unit/ledger và cost basis.
2. **Xuất kho:** đúng command nghiệp vụ, không adjustment giả.
3. **FIFO:** allocation do core, UI không chọn/sắp Unit.
4. **`unitBase`:** chỉ core mutation hợp lệ được tạo/sửa.
5. **Chuyển đổi unit:** cùng contract core, không bảng hệ số copy trong UI.
6. **Waste/hao hụt:** `RecordWaste`, có actor/reason/reference và ledger effect.
7. **Chỉnh tồn:** approval/correction đúng quyền, không overwrite lịch sử.
8. **Transaction/history:** đọc từ canonical ledger/query, trace được về Unit và
   operation; reversal tạo bút toán bù thay vì xóa.

### Lệnh kiểm tra sau từng bước

```bash
node tools/check-import-direction.js
node tools/run-tests.js
node tools/build-html.js
git diff --check
```

Ngoài ra phải kiểm screenshot ở viewport WebView/mobile, console errors,
double-click/idempotency và tìm mọi write datastore còn sót trong UI.

## 6. Bước tiếp theo

Trước khi sửa UI, review/chốt bảng mapping §3, đặc biệt các `GAP` inventory. Sau
đó thực hiện đúng một file đầu tiên: command business-day cùng test của nó. Không
tạo compatibility bridge, shell UI mới hoặc sửa `posgieo.html` trong bước này.
