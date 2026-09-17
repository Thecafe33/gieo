# Kế hoạch migrate UI/UX legacy sang core mới — V4

Trạng thái: Pha A (blocker interface) đã xong. QUANLY đang port, thiên về
đọc/báo cáo. POS mới scaffold. **Chiến lược UI vừa được SỬA LẠI CHO ĐÚNG kế
hoạch gốc** (xem §1a) — bản port `src/apps/quanly`, `src/apps/pos` đã đi lệch
hướng §4 Pha B/C của bản kế hoạch này ngay từ đầu.

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

## 1a. Chiến lược UI — SỬA FILE CŨ TẠI CHỖ, không dựng shell mới

Quyết định của chủ quán (2026-09-17): ẩn dụ đúng là **`posgieo.html` /
`quanlygieo.html` = cái công ty (nhà cửa, DOM/CSS/layout); các hàm JS nghiệp vụ
cũ = nhân viên cũ**. Migrate nghĩa là **giữ nguyên cái công ty, sa thải toàn bộ
nhân viên cũ, tuyển nhân viên mới vào làm việc trong đúng cái nhà đó** — không
phải xây một trụ sở mới.

Cụ thể:

- **Sửa trực tiếp `posgieo.html` và `quanlygieo.html`** — không dựng
  `dist/*_new.html` từ một shell HTML mới tự build. `tools/build-html.js` theo
  hướng "dựng shell riêng" hiện tại bị **dừng làm deliverable cuối**; nó chỉ còn
  giá trị tham khảo cho phần đã port (nếu có) trong lúc chuyển tiếp.
- **Xoá sạch toàn bộ hàm nghiệp vụ cũ** ("nhân viên cũ") khỏi hai file: mọi
  logic tính tồn, FIFO, COGS, ghi Firebase trực tiếp, v.v. Không giữ lại bất
  kỳ hàm nào trong số này dù chỉ để "phòng khi cần" — không có compatibility
  shim, không có nhân viên cũ nào được giữ lại bán thời gian.
- **Giữ nguyên DOM/CSS/layout/modal/navigation** ("cái công ty") — đây là lý do
  duy nhất hai file legacy còn giá trị tham khảo.
- **"Nhân viên mới"** = lớp `controller.js` hiện có (`src/apps/quanly/controller.js`,
  `src/apps/pos/controller.js`) gọi `bootstrap/runtime` — lớp này ĐÚNG kiến
  trúc và được giữ lại. Việc cần sửa là **thay event binding trong chính
  `posgieo.html`/`quanlygieo.html`** để gọi các hàm controller này, thay vì
  gọi hàm nghiệp vụ cũ.
- `src/apps/quanly/main.js` và `src/apps/pos/main.js` (dựng UI hoàn toàn mới,
  không dùng DOM cũ) **bị coi là đi sai hướng** kể từ quyết định này. Không
  phát triển thêm theo hướng đó; phần đã port ở đây (nếu chuẩn xác về mặt
  controller/API call) có thể dùng làm tài liệu tham khảo khi sửa file cũ,
  nhưng không phải là con đường release.

Quy trình sửa một file cũ, từng lát dọc:
1. Xác định một cụm hàm nghiệp vụ cũ (vd: `applyStockTransaction`,
   `submitItemAdjust`) và event handler gọi nó.
2. Viết lại thân hàm đó để gọi `runtime.command(...)`/`runtime.query(...)` qua
   đúng controller, xử lý loading/error/success ngay trong cùng handler.
3. Xoá code nghiệp vụ cũ trong thân hàm (không comment lại, không giữ dead
   code) — chỉ giữ phần build DOM/render nếu vẫn đúng dữ liệu mới trả về.
4. Nếu core chưa có interface tương ứng: đánh dấu `GAP`, disable nút/form đó
   rõ ràng, KHÔNG giữ hàm cũ chạy tạm.

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

## 2a. Ranh giới truy xuất nguồn gốc tại cutover (quyết định 2026-09-17)

Hệ mới **không có nghĩa vụ truy vết được lịch sử trước cutover**. Cutover là
mốc đánh dấu rõ: dữ liệu cũ → số dư mở đầu (opening balance) của hệ mới; từ
mốc đó trở đi, mọi Unit/giao dịch phải truy vết đầy đủ theo đúng chuẩn FIFO
core. Trước mốc đó, hệ cũ là gì thì chấp nhận nguyên trạng, không đòi giải
trình từng bước ledger cũ.

Áp dụng cụ thể cho gap "COGS actual chưa từng tồn tại" (`NO_COST_BASIS`,
xem `SHADOW-FINDINGS-V1.md` §2.1): legacy có lưu giá vốn, chỉ là ở
`price_history_gieogieo` (item-level, append-only theo thời gian) chứ không
gắn trực tiếp trên `stock_containers_gieogieo`. `mapUnit`
(`src/layers/legacy-firebase-adapter/mappers.js:52-74`) hiện chỉ đọc
`c.unitCost` trên container — field này không tồn tại — nên luôn rơi vào
nhánh `NO_COST_BASIS`, mà KHÔNG join sang `price_history_gieogieo`. Cần sửa:
với mỗi Unit còn tồn tại ĐÚNG TẠI mốc cutover, lấy giá hiệu lực gần nhất
(≤ cutoverDate) từ `price_history_gieogieo` của item đó làm `costBasis`,
gắn `source: 'LEGACY_PRICE_HISTORY'` để phân biệt với giá nhận hàng thật
(`source: 'RECEIVING'`) của các lô nhập sau cutover. Không cần join theo
đúng lô/đúng ngày nhận của từng container lịch sử — chỉ cần đúng giá tại
thời điểm mở sổ.

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
| mở ngày | Bắt đầu business day | `OpenBusinessDay` (đã đăng ký) | Chỉ dùng như command quản trị/khôi phục — luồng bình thường là `CheckIn` đầu tiên tự mở ngày, không cần màn cấu hình lịch. |
| chốt ngày | Kết thúc business day | `CloseBusinessDay` (đã đăng ký) | Cần thêm read model canonical cho blockers (day/segment/shift/checklist) trước khi sửa event binding trong `quanlygieo.html` — UI không tự dựng mảng blockers. |
| mở két/cash segment | Mở lượt két | `OpenCashSegment` (đã đăng ký) | Map form mở ca sang command hiện có. |
| đóng két | Chốt lượt két | `CloseCashSegment` (đã đăng ký) | Map form đếm tiền sang command hiện có. |
| check-in/check-out | Chấm công | `CheckIn`, `CheckOut` (đã đăng ký) | `CheckIn` đầu tiên trong ngày tự mở business day (atomic). Map form chấm công sang command hiện có. |

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

### Pha A — đóng GAP interface tối thiểu — ĐÃ XONG

Ưu tiên blockers của `BAN-GIAO-V1.md` §2.1, đều đã đăng ký trong
`bootstrap/runtime.js`:

1. ~~`commands/business-day.js`: vòng đời ngày~~ — xong: `OpenBusinessDay`,
   `CloseBusinessDay`.
2. ~~`commands/shift.js`: `OpenCashSegment`, `CheckIn`, `CheckOut`~~ — xong,
   cùng `CloseCashSegment`.
3. ~~`bootstrap/runtime.js`: đăng ký command và authority~~ — xong, 20 command
   + 16 query đã đăng ký.
4. Các inventory interface CÒN THIẾU (chưa chốt contract): receive, Unit
   lifecycle, transfer, stock-count submit, unit conversion, transaction
   history (`GetInventoryTransactions`), catalog/recipe/promotion/HR/payroll
   CRUD. Vẫn phải chốt contract + test **trước** khi sửa event binding cho
   màn tương ứng trong file cũ.

Không thay core algorithm; chỉ expose use case đúng qua command/query pipeline.

### Pha B — sửa `quanlygieo.html` tại chỗ (xem §1a)

1. Chụp baseline screenshot và layout/component/modal/navigation/form quản lý
   của **chính `quanlygieo.html`** (không phải shell mới).
2. Với từng cụm hàm nghiệp vụ cũ trong `quanlygieo.html`: viết lại thân hàm để
   gọi `bootstrap/runtime` (qua cùng logic đã có ở `app-quanly/controller.js`,
   inline hoặc import), xoá sạch logic nghiệp vụ cũ trong thân hàm đó.
3. Sửa event binding tại chỗ trỏ vào hàm đã viết lại; DOM/CSS giữ nguyên.
4. Ưu tiên PIN/role, mở-chốt ngày, inbox/phê duyệt và các flow quyền cao trước;
   flow có `GAP` phải disabled rõ ràng đến khi interface được bổ sung.
5. Sau mỗi lát dọc, xoá hẳn hàm nghiệp vụ legacy tương ứng khỏi file — không
   để fallback ghi legacy, không giữ dead code, không dual writer.
6. QUANLY qua toàn bộ gate §5 rồi mới mở file POS.

`src/apps/quanly/main.js` (shell UI dựng riêng) không phát triển tiếp; phần
UI đã port ở đó dùng để đối chiếu logic khi viết lại hàm trong
`quanlygieo.html`, không tự nó là deliverable.

### Pha C — sửa `posgieo.html` tại chỗ

Lặp cùng phương pháp Pha B trên chính `posgieo.html`: viết lại từng hàm
nghiệp vụ cũ để gọi runtime, xoá hàm cũ, giữ nguyên DOM/CSS. Không giữ global
function legacy chỉ để tương thích nếu event có thể bind thẳng vào logic mới.

**Deliverable cuối cùng chính là `posgieo.html` và `quanlygieo.html`** sau khi
đã thay hết "nhân viên". `tools/build-html.js` và `dist/*_new.html` (dựng
shell riêng, không sửa file cũ) bị dừng làm đường release — giữ lại tối đa như
tài liệu tham khảo cho tới khi Pha B/C hoàn tất, sau đó có thể xoá.

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
git diff --check
```

`node tools/build-html.js` không còn là bước release (xem §1a, §4 Pha C) —
chạy nó vẫn giúp kiểm import-direction/test trong lúc chuyển tiếp, nhưng
`dist/*_new.html` không phải deliverable cần kiểm hay ship.

Ngoài ra phải kiểm screenshot ở viewport WebView/mobile, console errors,
double-click/idempotency và tìm mọi write datastore còn sót trong UI.

## 6. Bước tiếp theo

1. Sửa `mapUnit` (`legacy-firebase-adapter/mappers.js`) join sang
   `price_history_gieogieo` cho `costBasis` theo §2a — có test riêng trước.
2. Thiết kế lại gate P12 shadow-compare (xem `BAN-GIAO-V1.md` §1.7 đã cập
   nhật) theo scope mới: chỉ đối chiếu số dư mở đầu tại mốc cutover.
3. Bắt đầu Pha B trên chính `quanlygieo.html`: chọn MỘT cụm hàm nghiệp vụ cũ
   quyền cao nhất (PIN/role hoặc mở-chốt ngày), viết lại gọi runtime, xoá hàm
   cũ, có test/kiểm chứng trước khi sang cụm tiếp theo. Không tạo compatibility
   bridge, không tiếp tục dựng `src/apps/*/main.js`.
