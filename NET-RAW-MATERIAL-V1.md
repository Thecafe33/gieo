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
| **Hệ mới** | **KHÔNG TỒN TẠI.** Không có `commands/receiving.js`, không có `ReceiveGoods` trong `src/layers/commands/`. `FEATURE-TREE-V1.md` mới chỉ PHÁC THẢO `ReceiveGoods → Unit{sealed}`, chưa phải code. |
| **Phân loại** | 🔴 **GAP TOÀN PHẦN** — không phải BỎ/GIỮ/THÊM, vì chưa có gì để phân loại. Đây là domain duy nhất trong toàn bộ NET-series thiếu cả command lẫn thiết kế chi tiết. |
| **Ghi chú** | Đã xác nhận LẶP LẠI 2 lần độc lập: lần đầu khi rà Reversal case #4 (`NET-REVERSAL-CORRECTION-V1.md`), lần này khi rà Raw Material. `unit.createUnit()` (được `SEED-CONTRACT-V1.md §3.1` nhắc tới) đòi `costBasis` bắt buộc — đúng là hàm mà `ReceiveGoods` tương lai sẽ gọi, nhưng bản thân command bọc nó (validate PO/nhà cung cấp, ghi ledger `RECEIVING`, cập nhật `suggestedCostPerUnit`) chưa viết. |

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
| **Hệ mới** | **CHƯA XÁC ĐỊNH ĐƯỢC** — phụ thuộc trực tiếp vào RM1 (chưa có `ReceiveGoods`). `AdjustInventory` với `unitId`+`actualQty` có thể sửa LƯỢNG (qua `physicalReconciliation`, atomic, đúng 1 bước — tự động đóng vấn đề "4 bước không atomic"), nhưng KHÔNG có trường nào để sửa `costBasis` của một Unit đã sealed — không phải vì bị chặn, mà vì chưa có command nào chạm tới `costBasis` sau khi Unit đã tạo. |
| **Phân loại** | ⚪ **CHƯA QUYẾT — treo theo RM1** |
| **Ghi chú** | Không tự ý phân loại BỎ/GIỮ/THÊM vì đích (RM1) chưa tồn tại để so sánh. Khi thiết kế `ReceiveGoods`, cần quyết định: sửa giá nhập sai có phải một nhánh riêng của `ReceiveGoods`-correction, hay một dạng `ReviseState` (`commands/reversal.js`) với `historicalPolicy`? Cả hai đều hợp lý về kiến trúc — để đó, quyết chung một lượt khi làm NET Receiving đầy đủ hoặc khi tổng hợp toàn bộ CHƯA QUYẾT. |

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
| **Phân loại** | ⚪ **CHƯA HOÀN THÀNH — vẫn là GAP cho riêng nguyên liệu thô** |
| **Ghi chú** | Đã đọc trọn `usage-report.js`: nguồn DUY NHẤT là ledger (đúng nguyên tắc — không đọc field tổng đã cache), gộp đúng 3 đường đếm hao hụt cũ (vốn không khớp nhau ở hệ cũ) thành MỘT lần đọc sổ, tách `waste`/`lost`/`found`/`untrackedQty` riêng biệt (không gộp "hao hụt" với "chưa ghi nhận được" làm một, đúng nguyên tắc SEED-CONTRACT). NHƯNG: `build()` nhận `spec.entries` đã lọc theo kỳ ở TẦNG TRÊN, và trả về **một dòng tổng theo itemId cho cả kỳ** — KHÔNG có chiều `businessDate`/`dateKey` trong output (đối chiếu `COLUMNS`: không có cột ngày). So sánh với `reporting/btp-report.js` — module đó CÓ cấu trúc `days[k] = {dateKey, nau, dung, huy, ...}` đầy đủ cho BTP, đã đăng ký thành query `GetBTPReport` (đọc trọn file khi làm `NET-BTP-V1.md`) → **ĐÍNH CHÍNH so với nhận định ban đầu ở đây**: comment đầu file `btp-report.js` ("chỉ dùng nội bộ... không bao giờ hiển thị") là TRÍCH LẠI mô tả GAP CỦA HỆ CŨ để giải thích lý do module tồn tại, KHÔNG PHẢI mô tả hành vi hiện tại — `GetBTPReport` đã đăng ký, đã đóng đúng gap đó cho BTP. Vậy tình trạng 2 domain KHÁC NHAU, không giống nhau như nhận định ban đầu: (1) nguyên liệu thô — chưa có cấu trúc ngày ở tầng core (`usage-report.js` không có `dateKey`), đây là việc thật sự còn thiếu; (2) BTP — ĐÃ có cấu trúc ngày + đã đăng ký query, chỉ còn thiếu UI gọi tới (tình trạng CHUNG của mọi query mới, không phải gap riêng). Việc phải làm chỉ còn ở (1). |

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
| **Reversal/Correction** | RM1 (Receiving thiếu) là cùng một gap đã nêu ở case #4 trong `NET-REVERSAL-CORRECTION-V1.md`; RM6 dùng đúng pattern `ReviseState`-adjacent nhưng thực ra là command riêng (`ApproveLostContainer`), không đi qua `reversal.js` |
| **Loyalty / Payroll** | RM6's `ContainerLostApproved`/`ContainerFound` event (phần KHÔNG PHẢI liability) — cùng chịu ảnh hưởng gap L9 (tầng điều phối sự kiện) đã nêu ở `NET-LOYALTY-V1.md`; xác nhận domain thứ 3 phụ thuộc gap này |
| **Payroll (liability)** | RM6 là ĐIỂM TẠO của khoản trừ trách nhiệm nhân viên (`hr/liability.js`, mới, quyết định chủ quán mục 4 ở `NET-PAYROLL-V1.md`): `ApproveLostContainer` tạo `PENDING`, `RestoreFoundContainer` có thể `REVERSED`. Payroll (`computePayroll`/`ClosePayroll`) là ĐIỂM TIÊU THỤ — trừ vào lương và chuyển `DEDUCTED`. Toàn bộ vòng đời chạy ĐỒNG BỘ trong `plan.domainRecords` của các command RM6, không qua event/L9 — xem RM6 và chi tiết đầy đủ ở `NET-PAYROLL-V1.md` mục Liên kết chéo domain. |
| **Reporting** | RM7 mở rộng thành vấn đề chung 2 domain (raw + BTP), không phải riêng raw material |

---

## TỔNG KẾT PHÂN LOẠI

- 🔴 GAP TOÀN PHẦN (không phân loại được vì chưa có đích): **RM1** (Receiving)
- ⚪ CHƯA QUYẾT / CHƯA XÁC ĐỊNH (treo, quyết sau khi đủ NET): **RM3** (treo theo RM1), **RM7** (báo cáo ngày cho nguyên liệu thô — BTP đã đóng, xem đính chính trong ghi chú RM7 và `NET-BTP-V1.md` B5)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **RM2, RM4, RM5, RM6** — xác nhận cả 4 đã sửa đúng gap chain-trace nêu, đọc trọn thân hàm, không suy đoán
- ✅ ĐÃ TỰ ĐỘNG GIẢI QUYẾT: **RM8** (field chết không được mang sang)

## VIỆC PHẢI LÀM (tích lũy, không chặn — quyết chung đợt sau)

1. Thiết kế + viết `commands/receiving.js` (`ReceiveGoods`) — domain duy nhất còn thiếu cả command lẫn thiết kế. Ưu tiên cao vì RM3 và case #4 (Reversal) đều treo chờ nó.
2. Khi có RM1, quyết luôn RM3: sửa giá/lượng nhập sai là nhánh của `ReceiveGoods`-correction hay của `ReviseState`.
3. RM7: quyết có cần thêm chiều `dateKey` vào `usage-report.js` (theo đúng mẫu `btp-report.js` đã có) để có báo cáo ngày thật cho nguyên liệu thô, hay chỉ cần một UI gọi `GetUsageReport` theo từng ngày.
4. ~~(ĐÃ ĐÍNH CHÍNH — xem `NET-BTP-V1.md` B5)~~ `btp-report.js` không phải gap riêng, đã đóng đúng ĐỨT CHUỖI #3 ở tầng core. Việc còn lại của RM7 chỉ là thêm `dateKey` cho `usage-report.js` (nguyên liệu thô).
5. Việc chung đã ghi nhận từ trước, RM6 xác nhận thêm: build tầng điều phối sự kiện (`plan.events` consumer) — ưu tiên cao nhất xuyên toàn bộ NET-series, giờ đã xác nhận cần cho ít nhất 3 domain (Loyalty, Reversal, Raw Material). **Cập nhật**: khoản trừ trách nhiệm nhân viên (RM6 → Payroll) KHÔNG còn nằm trong danh sách chờ L9 nữa — đã tách ra chạy đồng bộ trong `hr/liability.js` (xem Liên kết chéo domain). Phần còn lại của `ContainerLostApproved`/`ContainerFound` (không phải liability) vẫn chờ L9 như cũ.
