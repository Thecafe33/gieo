# NET — NGUYÊN LIỆU THÔ (RAW MATERIAL) — V1

> Nguồn: `FIFO-CHAIN-TRACE-RAW-MATERIAL-V1.md` đối chiếu với `src/layers/commands/inventory.js`,
> `src/layers/commands/approval.js`, `src/layers/reporting/usage-report.js`,
> `src/layers/reporting/report-queries.js`, `src/layers/reporting/btp-report.js`.
>
> Gộp thêm domain **Receiving/Nhập hàng** vào NET này theo đề xuất ở
> `NET-REVERSAL-CORRECTION-V1.md` (VIỆC PHẢI LÀM #2) — Receiving là cửa vào của
> đúng vòng đời Unit mà Raw Material mô tả phần sau, tách riêng sẽ trùng lặp.
>
> Áp dụng §2.3a (`BAN-GIAO-V1.md`) cho mọi PRECONDITION mới của core.
> Tiếp nối phát hiện L9 (tầng điều phối sự kiện chưa có consumer) từ
> `NET-LOYALTY-V1.md` / `NET-REVERSAL-CORRECTION-V1.md` — domain này cũng phát
> `ContainerFound` qua `plan.events`, cùng chịu ảnh hưởng của gap đó.
>
> **CẬP NHẬT (quyết định chủ quán, sau `NET-PAYROLL-V1.md`)**: câu hỏi "khoản
> trừ trách nhiệm nhân viên khi mất container" — treo từ
> `NET-REVERSAL-CORRECTION-V1.md`, đi qua domain này (RM6) rồi mới tới Payroll
> — đã được xác nhận có thật và thi công thành `hr/liability.js`. Việc tạo/hoàn
> khoản trừ được gắn TRỰC TIẾP vào `ApproveLostContainer`/`RestoreFoundContainer`
> (chính 2 command của RM6) chứ KHÔNG đi qua L9 — xem RM6 bên dưới.

## Sơ đồ luồng (RM1 → RM8)

```
RM1 Nhận hàng ──────────────► (Unit sealed, costBasis thật)
        │
        ├─ RM2 Nhập kho nhanh / điều chỉnh ngoài luồng chính
        │
RM3 Sửa lô nhập sai (giá / lượng) ── phụ thuộc RM1
        │
RM4 Kiểm kê định kỳ (đếm → duyệt) ──► RM2-style ADJUSTMENT
        │
RM5 Hao hụt (3 nhánh: hết tem / đổ ly BTP / hao hụt trực tiếp)
        │
RM6 Container mất → duyệt → LOST ──► tìm lại → FOUND (event ContainerFound)
        │
RM7 Báo cáo hao hụt / tồn kho theo NGÀY
        │
RM8 Cấu hình KPI (wasteTargetPct / cogsPct / stockoutTargetPct)
```

---

## RM1 — Nhận hàng (Receiving)

| | |
|---|---|
| **Hệ cũ** | `createContainersForReceipt` (`posgieo.html:5460-5543`) — giá lấy đúng theo `itemCostOn(id, date)` đọc `price_history_gieogieo`, không sai |
| **Hệ mới** | `commands/receiving.js` → `ReceiveGoods` (mới viết, quyết định chủ quán mục 2: "thiếu thì thêm vào, hoàn thiện hệ thống hơn") |
| **Phân loại** | 🟢 **THÊM MỚI** — domain trước đây thiếu cả command lẫn thiết kế, nay đã có |
| **Ghi chú** | Đối chiếu trọn thân `createContainersForReceipt`, giữ đúng cơ chế cốt lõi (idPrefix xác định → id tem/Unit xác định, chống bug "nhận hàng cộng kho 2 lần khi retry") nhưng sửa 3 điểm mất dữ liệu âm thầm của legacy, cả 3 theo §2.3a: (1) `trackingMode:'none'` — legacy trả `[]` (0 container, không truy vết lô); hệ mới LUÔN tạo 1 Unit cho cả dòng nhận, cải thiện thật chứ không phải parity; (2) `trackingMode:'unit'` thiếu quy cách đóng gói (`packagingUnits`/`countUnitName` không khớp) — legacy log cảnh báo rồi bỏ CẢ DÒNG NHẬP; hệ mới gộp thành 1 Unit + `gap:true` trên `receivingRecord`, hàng vẫn vào kho; (3) phần dư khi `qtyBase` không chia hết quy cách (`Math.floor` không xử lý dư) — legacy làm mất phần dư hoàn toàn; hệ mới tách thành 1 Unit riêng, đánh dấu gap. KHÔNG mang theo trần "60 container" của legacy (chặn tay bảo vệ UI, không phải bất biến nghiệp vụ). Giá vốn gắn lên Unit qua đúng `recipe-cost-btp/cost.js#costBasisForNewUnit()` — ưu tiên giá thực trả trên phiếu (`paidUnitCost`), rơi về CostBasis theo thời điểm nếu phiếu không ghi giá, từ chối (PRECONDITION) nếu không có giá nào cả — không bịa. Có 14 test (`tests/unit/receiving.test.js`), đăng ký trong `bootstrap/runtime.js`. Phạm vi CHƯA làm: validate PO/nhà cung cấp thật (mới nhận `supplierId`/`purchaseOrderRef` như tham chiếu thô, không xác thực tồn tại), cập nhật `suggestedCostPerUnit` — để đó, không phải blocker cho §2.3a. |

## RM2 — Nhập kho nhanh / điều chỉnh ngoài luồng nhận hàng chính

| | |
|---|---|
| **Hệ cũ** | `applyStockTransaction` (`quanlygieo.html:4636-4656`) — ghi thẳng `currentStock`, KHÔNG ghi `untrackedPendingDelta`; helper `_ueBumpUntrackedPendingDelta` được COMMENT nhắc tới (`posgieo.html:3820`) nhưng không tồn tại trong code |
| **Hệ mới** | `commands/inventory.js` → `AdjustInventory` (dòng 128-191) |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã đọc trọn thân hàm, xác nhận đúng thiết kế: có `unitId` → `reconciliation.physicalReconciliation()` GHI ĐÈ TUYỆT ĐỐI qua Unit Engine (không cộng delta vào cache); không có `unitId` → ghi thẳng một `ledgerEntries` dòng `ADJUSTMENT, unitId: null, qtyDelta` — đây CHÍNH LÀ cơ chế `untrackedPendingDelta` mà legacy thiếu. Không còn nhánh nào ghi trực tiếp một field tồn kho phẳng. Đóng đúng gap [1b] của chain-trace. |

## RM3 — Sửa lô nhập sai (giá hoặc lượng đã nhập nhầm)

| | |
|---|---|
| **Hệ cũ** | `fixRecWizApply` (`quanlygieo.html:4119-4218`, Bug #20) — 4 bước ghi KHÔNG ATOMIC; có audit trail đầy đủ; GAP: chỉ sửa được LƯỢNG, không có nhánh sửa GIÁ nhập sai |
| **Hệ mới** | LƯỢNG: `commands/inventory.js` → `AdjustInventory` (đã có, xem RM2). GIÁ: `fifo-core/unit.js` → `reviseCostBasis()` + `commands/receiving.js` → `CorrectReceivingCost` (mới viết) |
| **Phân loại** | 🟢 **THÊM MỚI** (nhánh sửa GIÁ) + 🟡 **GIỮ, ĐỔI CÁCH LÀM** (nhánh sửa LƯỢNG, đã đóng ở RM2) |
| **Ghi chú** | Quyết định kiến trúc đã chốt: KHÔNG dùng `ReviseState` (`commands/reversal.js`) cho việc này dù nó là mẫu "sửa 1 con số đã chốt sai" tổng quát sẵn có — vì `ReviseState` bắt buộc chọn `historicalPolicy: FREEZE\|RECOMPUTE`, mà `costBasis` của Unit chỉ có ĐÚNG MỘT chính sách hợp lệ theo invariant #14 đã áp dụng khắp `recipe-cost-btp/cost.js` ("CẤM dùng giá hiện tại để tính lại lịch sử"): ĐÓNG BĂNG — ledger đã ghi bằng giá cũ giữ nguyên, sửa chỉ ảnh hưởng phần tiêu thụ từ nay về sau. Cho `ReviseState` chọn RECOMPUTE ở trường này sẽ mở lại đúng gap đã đóng ở nơi khác, nên tách thành command riêng có audit append-only (`unit.costBasisRevisions`, giữ `{before, after, reason, actorId, operationId}` từng lần sửa) thay vì domainRecord rời như `ReviseState`. `CorrectReceivingCost` cần `unitId` + `correctRef` (chống sửa đúp, cùng mẫu `wasteRef`/`adjustRef`), chỉ đổi `costBasis`, không đụng `remainingQty`/`initialQty`. 5 test mới trong `tests/unit/receiving.test.js`, đăng ký trong `bootstrap/runtime.js`. |

## RM4 — Kiểm kê định kỳ (đếm tồn → duyệt)

| | |
|---|---|
| **Hệ cũ** | `thTinhMotKy` / `thDoiChieu` (`quanlygieo.html:7314-7415`) — không bịa khi thiếu dữ liệu (đòi ≥2 phiếu, báo lỗi rõ ràng nếu thiếu — không phải bug); GAP: không ép tần suất đếm theo mặt hàng; đường duyệt đi qua CÙNG bug `applyStockTransaction(ADJUSTMENT)` như RM2 |
| **Hệ mới** | `commands/approval.js` → `ApproveStockCount` (dòng 137-239) |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đọc trọn thân hàm — xác nhận đúng 4 yêu cầu "FIX BẮT BUỘC" của chain-trace đều đã làm: (1) mỗi dòng đi qua `physicalReconciliation` — không còn đường ghi `currentStock` song song; (2) idempotent — `operationId` xác định theo `stockCountId`+`itemId`, cộng với guard `status !== PENDING && status !== PARTIALLY_APPLIED` chặn duyệt lại (đóng đúng bug "double-click / 2 người duyệt cùng lúc cộng đúp variance" nêu ở đầu file `approval.js`); (3) lỗi lưu CHÍNH XÁC dòng nào hỏng + lý do (`failedLines: [{itemId, unitId, reason}]`), không chỉ một con số `failedCount`; (4) có state `PARTIALLY_APPLIED` — nói đúng "phiếu chưa áp hết", không ép về `APPROVED` giả. Không thấy command "tạo phiếu kiểm kê" (draft) trong `commands/` — hợp lý, vì bước TẠO phiếu chỉ là ghi nhận số đếm thô, chưa mutate FIFO, nên không cần qua command pipeline; chỉ bước ÁP DỤNG (mutate Unit) mới cần. |

## RM5 — Hao hụt (waste): 3 nhánh

| | |
|---|---|
| **Hệ cũ** | `_submitDrinkWasteImpl` (`posgieo.html:9003-9063`) gộp cả prep VÀ nguyên liệu thô vào MỘT hàm — nhánh prep gọi đúng `unitEngineAllocateConsumption` (FIFO, truy vết Unit); nhánh nguyên liệu thô gọi thẳng `applyStockTransactionPOS`, KHÔNG phân bổ Unit. 3 đường hao hụt cụ thể: (a) "báo hết tem" — có containerId, truy vết đúng; (b) 🔴 "đổ ly thành phẩm" — chỉ biết itemId, không phân bổ Unit; (c) 🔴 "hao hụt trực tiếp" — không có UI chọn tem cụ thể |
| **Hệ mới** | `commands/inventory.js` → `RecordWaste` (dòng 33-118) |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã xác nhận: `RecordWaste` gọi `allocation.allocateConsumption(ws, {itemId, qty, operationId})` KHÔNG ĐIỀU KIỆN cho cả `domain === 'raw'` lẫn `domain === 'prep'` — "cùng một lời gọi cho raw lẫn prep, không có nhánh rẽ theo domain" (chú thích gốc trong code). Đóng đúng bất đối xứng chain-trace đã chỉ ra: kỹ thuật đúng (FIFO-allocate) vốn đã có sẵn trong hệ cũ (nhánh prep), chỉ chưa áp dụng đều — hệ mới áp dụng đều cho cả hai. Phần không phân bổ hết được (`alloc.shortfallQty`) ghi đúng một dòng `untrackedPendingDelta`-style (`unitId: null, qtyDelta: -shortfall`) — tiền vẫn đúng dù mất truy vết Unit. Có PRECONDITION chặn khi `shortfallQty > 0 && !input.allowUntracked` — ĐÃ được `NET-SALES-V1.md` ghi nhận là ⚪ loại RIÊNG với N10, không tự động áp dụng §2.3a (xem phần "Ca liên quan đã rà" ở đó) vì hệ cũ tự gọi đây là "lỗi" trong comment — treo chung, không lặp lại ở đây. |

## RM6 — Container mất / tìm lại (Lost / Found)

| | |
|---|---|
| **Hệ cũ** | `submitFoundLostContainer` (báo mất) có logic nhánh LOST viết sẵn, nhưng KHÔNG BAO GIỜ chạy tới — 3 nguồn audit độc lập xác nhận: grep `approveLostReport` trong `quanlygieo.html` → 0 kết quả; audit Alerts không thấy nút xử lý báo mất; chain kiểm kê cho thấy route duyệt không tồn tại, khiến container "mất" lặp lại vô hạn mỗi kỳ |
| **Hệ mới** | `commands/inventory.js` → `ReportLostContainer` (194-232) + `RestoreFoundContainer` (242-288); **`commands/approval.js` → `ApproveLostContainer` (48-125) — mắt xích legacy CHƯA TỪNG CÓ** |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — đóng gap có bằng chứng chắc chắn nhất toàn audit (§10b.4) |
| **Ghi chú** | Luồng đủ 3 bước: POS báo mất (`ReportLostContainer`, `EXECUTE`) → tạo `lostReport` trạng thái `PENDING_REVIEW` (Unit CHƯA vào nhánh LOST) → QUANLY duyệt (`ApproveLostContainer`, `REVIEW_APPROVE_CORRECT`, bắt buộc `reason`, fail-closed nếu phiếu không còn `PENDING_REVIEW`) → Unit thật sự vào `markLost()`, ghi ledger `LOST`. Sự kiện `direction: 'LOST_APPROVED'` trước đây dùng chung `type: 'ContainerFound'` với hướng tìm lại — **đã sửa: đổi tên thành `ContainerLostApproved`** để không trùng `type` với event "tìm lại được" thật (2 tình huống đối lập không nên cùng tên). `RestoreFoundContainer` giữ đúng quyết định nghiệp vụ cũ (§8: Unit "mới nguyên", không suy luận lại phần đã dùng trước khi mất) — không đổi hành vi, chỉ thêm `operationId` xuyên suốt. **CẬP NHẬT (quyết định chủ quán, mục 4 ở `NET-PAYROLL-V1.md`): khoản trừ trách nhiệm nhân viên KHÔNG còn đi qua event/L9 nữa** — trước đây `ApproveLostContainer`/`RestoreFoundContainer` phát event để "trừ/hoàn lương" nhưng không có consumer nào chạy (đúng như cảnh báo L9 dưới đây). Đã sửa tận gốc: `ApproveLostContainer` nay resolve `employee` từ `input.employees` (theo `actorId === report.reportedBy`, pattern denormalized-input) và gọi thẳng `hr/liability.createLiability()` NGAY TRONG PLAN của chính nó (dùng `Unit.costBasis.unitCost` thật; nếu unit legacy-seeded thiếu `costBasis` hoặc không khớp được nhân viên thì `gap: true`, không chặn duyệt — đúng §2.3a). `RestoreFoundContainer` tương tự gọi `hr/liability.reverseLiability()` trực tiếp nếu `input.liability` còn `PENDING`/`WAIVED`. Cả hai đều đẩy `{type:'liability', record}` vào `plan.domainRecords` — đồng bộ, không phụ thuộc L9. **Cảnh báo phụ thuộc L9 (VẪN CÒN, nhưng KHÔNG còn cho liability)**: `ContainerLostApproved`/`ContainerFound` vẫn được phát qua `plan.events` cho các mục đích khác (ví dụ thông báo/alert) và vẫn KHÔNG có consumer — domain thứ 3 xác nhận phụ thuộc gap L9 này, sau Loyalty và Reversal, nhưng phạm vi hẹp hơn trước vì nhánh liability đã tách ra khỏi event, chạy đồng bộ. |

## RM7 — Báo cáo hao hụt / tồn kho theo NGÀY

| | |
|---|---|
| **Hệ cũ** | `renderKhoHistItems` — luồng phẳng, KHÔNG LỌC, giới hạn 50 giao dịch gần nhất; không có báo cáo theo ngày cho nguyên liệu thô |
| **Hệ mới** | `reporting/usage-report.js` (`build()`, `lossOnly()`) đăng ký qua `reporting/report-queries.js` thành `GetUsageReport` / `GetLossReport` (authority `REVIEW_APPROVE_CORRECT`) |
| **Phân loại** | 🟢 **THÊM MỚI — `usage-report.js#buildDaily` + `GetUsageReportDaily`** |
| **Ghi chú** | Đã đọc trọn `usage-report.js`: nguồn DUY NHẤT là ledger (đúng nguyên tắc — không đọc field tổng đã cache), gộp đúng 3 đường đếm hao hụt cũ (vốn không khớp nhau ở hệ cũ) thành MỘT lần đọc sổ, tách `waste`/`lost`/`found`/`untrackedQty` riêng biệt (không gộp "hao hụt" với "chưa ghi nhận được" làm một, đúng nguyên tắc SEED-CONTRACT). Ban đầu: `build()` nhận `spec.entries` đã lọc theo kỳ ở TẦNG TRÊN, và trả về **một dòng tổng theo itemId cho cả kỳ** — KHÔNG có chiều `businessDate`/`dateKey` trong output. So sánh với `reporting/btp-report.js` — module đó CÓ cấu trúc `days[k] = {dateKey, nau, dung, huy, ...}` đầy đủ cho BTP, đã đăng ký thành query `GetBTPReport` → **ĐÍNH CHÍNH so với nhận định ban đầu**: comment đầu file `btp-report.js` ("chỉ dùng nội bộ... không bao giờ hiển thị") là TRÍCH LẠI mô tả GAP CỦA HỆ CŨ để giải thích lý do module tồn tại, KHÔNG PHẢI mô tả hành vi hiện tại — `GetBTPReport` đã đóng đúng gap đó cho BTP từ trước. **ĐÃ ĐÓNG**: thêm `usage-report.js#buildDaily(spec)` — cùng một lần đọc sổ, cùng luật cộng cột với `build()` (không phải đường đếm thứ hai), chỉ thêm chiều `businessDate` khi gộp: nhóm theo `(dateKey, itemId)` cho `rows` (chi tiết từng mặt hàng từng ngày) và gộp thêm `days` (tổng mọi mặt hàng theo từng ngày — con số đầu chủ quán nhìn vào). Không cần fallback gap-flag cho `businessDate` thiếu vì `fifo-core/ledger.js#createEntry` đã từ chối mọi entry thiếu trường này ngay từ gốc — không tồn tại entry hợp lệ nào không có ngày. Đăng ký thành query `GetUsageReportDaily` (`authority: REVIEW_APPROVE_CORRECT`, cùng cổng quyền `GetUsageReport`) ở `reporting/report-queries.js`, nối vào `bootstrap/runtime.js`. Không đổi `build()`/`GetUsageReport` hiện có — hai query song song, khác chiều gộp, cùng nguồn. |

## RM8 — Cấu hình KPI (wasteTargetPct / cogsPct / stockoutTargetPct)

| | |
|---|---|
| **Hệ cũ** | `wasteTargetPct`, `cogsPct` — tính đúng, dùng đúng. `stockoutTargetPct` — GAP CÓ CHỦ ĐÍCH: tính năng bị cắt thật (nhân viên báo hết hàng qua group chat thay vì hệ thống), nhưng field cấu hình chết vẫn còn trong schema, gây rối |
| **Hệ mới** | Grep toàn bộ `src/layers/` cho `stockoutTargetPct` → CHỈ 1 kết quả, và đó là một CÂU COMMENT trong `btp-report.js` (dòng 8) so sánh mẫu lỗi, KHÔNG PHẢI một field thật đang được đọc/ghi ở đâu cả |
| **Phân loại** | ✅ **ĐÃ TỰ ĐỘNG GIẢI QUYẾT (BỎ đúng cách)** |
| **Ghi chú** | Không cần một "fix" riêng — field chết đơn giản là KHÔNG được mang sang khi viết lại core, nên không tồn tại để phải dọn. `wasteTargetPct`/`cogsPct` không xuất hiện tách biệt trong phần đã đọc của domain này; giả định tiếp tục đúng như chain-trace ghi nhận (không phải trọng tâm của NET này — nếu cần xác minh lại, việc đó thuộc `reporting/variance-report.js`, đã đăng ký `GetVarianceReport`). |

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Sales/POS** | RM5 (waste) qua `_submitDrinkWasteImpl` từng dùng chung UI với waste-BTP; N-liên quan trong `NET-SALES-V1.md` "Ca liên quan đã rà" (shortfall PRECONDITION cùng dạng ở `sales.js`, `inventory.js`, `prep.js`) |
| **BTP** | RM5 nhánh (b) "đổ ly thành phẩm" là hao hụt BTP, không phải raw — chung hàm `_submitDrinkWasteImpl` ở hệ cũ, tách domain rõ ở hệ mới (`domain: 'prep'` vs `'raw'`); RM7 nêu vấn đề chung `btp-report.js` |
| **Reversal/Correction** | RM1 (Receiving) trước đây là cùng một gap đã nêu ở case #4 trong `NET-REVERSAL-CORRECTION-V1.md` — nay đã đóng (`ReceiveGoods`), case #4 mở khoá; RM6 dùng đúng pattern `ReviseState`-adjacent nhưng thực ra là command riêng (`ApproveLostContainer`), không đi qua `reversal.js` |
| **Loyalty / Payroll** | RM6's `ContainerLostApproved`/`ContainerFound` event (phần KHÔNG PHẢI liability) — cùng chịu ảnh hưởng gap L9 (tầng điều phối sự kiện) đã nêu ở `NET-LOYALTY-V1.md`; xác nhận domain thứ 3 phụ thuộc gap này |
| **Payroll (liability)** | RM6 là ĐIỂM TẠO của khoản trừ trách nhiệm nhân viên (`hr/liability.js`, mới, quyết định chủ quán mục 4 ở `NET-PAYROLL-V1.md`): `ApproveLostContainer` tạo `PENDING`, `RestoreFoundContainer` có thể `REVERSED`. Payroll (`computePayroll`/`ClosePayroll`) là ĐIỂM TIÊU THỤ — trừ vào lương và chuyển `DEDUCTED`. Toàn bộ vòng đời chạy ĐỒNG BỘ trong `plan.domainRecords` của các command RM6, không qua event/L9 — xem RM6 và chi tiết đầy đủ ở `NET-PAYROLL-V1.md` mục Liên kết chéo domain. |
| **Reporting** | RM7 mở rộng thành vấn đề chung 2 domain (raw + BTP), không phải riêng raw material |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **RM1** (Receiving — `commands/receiving.js`/`ReceiveGoods`), **RM3 nhánh GIÁ** (`unit.reviseCostBasis()` + `CorrectReceivingCost`), **RM7** (`usage-report.js#buildDaily` + `GetUsageReportDaily` — BTP đã đóng trước, xem đính chính trong ghi chú RM7 và `NET-BTP-V1.md` B5)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **RM2, RM3 nhánh LƯỢNG, RM4, RM5, RM6** — xác nhận đã sửa đúng gap chain-trace nêu, đọc trọn thân hàm, không suy đoán
- ✅ ĐÃ TỰ ĐỘNG GIẢI QUYẾT: **RM8** (field chết không được mang sang)

## VIỆC PHẢI LÀM (tích lũy, không chặn — quyết chung đợt sau)

1. ~~Thiết kế + viết `commands/receiving.js` (`ReceiveGoods`)~~ — **XONG**, xem RM1.
2. ~~Quyết RM3: sửa giá/lượng nhập sai~~ — **XONG**: LƯỢNG dùng `AdjustInventory` (đã có từ RM2); GIÁ là command riêng `CorrectReceivingCost` chứ không phải nhánh của `ReviseState` — lý do đầy đủ ở RM3.
3. ~~RM7: quyết có cần thêm chiều `dateKey` vào `usage-report.js`~~ — **XONG**: thêm `buildDaily()` (theo đúng mẫu `btp-report.js`) + query `GetUsageReportDaily`, 6 test mới (`reporting.test.js`, `read-layer.test.js`).
4. ~~(ĐÃ ĐÍNH CHÍNH — xem `NET-BTP-V1.md` B5)~~ `btp-report.js` không phải gap riêng, đã đóng đúng ĐỨT CHUỖI #3 ở tầng core từ trước.
5. Việc chung đã ghi nhận từ trước, RM6 xác nhận thêm: build tầng điều phối sự kiện (`plan.events` consumer) — ưu tiên cao nhất xuyên toàn bộ NET-series, giờ đã xác nhận cần cho ít nhất 3 domain (Loyalty, Reversal, Raw Material). **Cập nhật**: khoản trừ trách nhiệm nhân viên (RM6 → Payroll) KHÔNG còn nằm trong danh sách chờ L9 nữa — đã tách ra chạy đồng bộ trong `hr/liability.js` (xem Liên kết chéo domain). Phần còn lại của `ContainerLostApproved`/`ContainerFound` (không phải liability) vẫn chờ L9 như cũ.
