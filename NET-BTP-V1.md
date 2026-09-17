# NET — BTP (BÁN THÀNH PHẨM) — V1

> Nguồn: `FIFO-CHAIN-TRACE-BTP-V1.md` đối chiếu với `src/layers/commands/prep.js`,
> `src/layers/recipe-cost-btp/btp.js`, `src/layers/reporting/btp-report.js`,
> `src/layers/commands/inventory.js` (RecordWaste, dùng chung với Raw Material).
>
> File chain-trace này có văn phong khác các file khác (không liệt "GIỮ/BỎ/THÊM"
> theo case mà mô tả CHUỖI ĐỨT ở đâu) — NET này dịch sang đúng khung phân loại
> chuẩn để nhất quán với các NET khác.
>
> Áp dụng §2.3a. Domain này chia sẻ cơ chế kiểm kê/điều chỉnh với Raw Material
> (`NET-RAW-MATERIAL-V1.md` RM2/RM4) — `Unit` BTP là `itemKind:'prep'`, đi qua
> ĐÚNG MỘT engine FIFO với nguyên liệu thô, nên không cần command riêng cho
> phần đó.

## Sơ đồ luồng (B1 → B6, theo đúng thứ tự chain-trace gốc)

```
B1 Nấu xong ──► Unit(itemKind:'prep') + prepBatch{actualYield,costPerUnit}
        │
B2 Sửa yield sai (batch đã nấu)
        │
B3 Actual-vs-Theoretical cho BTP (mắt xích CHƯA TỪNG TỒN TẠI ở hệ cũ)
        │
B4 Waste BTP (huỷ giữa ca / hết hạn cuối ca) ──► RecordWaste dùng chung raw+prep
        │
B5 Kết ca / báo cáo ngày {nấu, dùng, huỷ}
        │
B6 QUANLY đọc — KPI, P&L (không đứt ở hệ cũ, giữ nguyên tắc)
```

---

## B1 — Nấu mẻ xong

| | |
|---|---|
| **Hệ cũ** | `_submitPrepFinishImpl` (`posgieo.html:11129-11292`) ghi `prep_batches{qtyInitial,qtyRemaining,actualCostPerUnit,yieldVariancePct}` + `prep_transactions{type:PRODUCTION}` + `prep_items.currentStock`; nền `refreshPrepYieldStatsPOS` (10816) ghi `prep_items.yieldActualAvg` (giá trị "hiện tại", không versioned) |
| **Hệ mới** | `commands/prep.js` → `RecordPrepProduction` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã đọc trọn thân hàm. Khác biệt cốt lõi: mẻ BTP giờ tạo ra một `Unit` FIFO thật (`itemKind:'prep'`) qua `unitLib.createUnit()` — không còn kho BTP song song với kho nguyên liệu. Trừ nguyên liệu thô qua `allocation.allocateMany()` — **cùng engine với bán hàng và RecordWaste**, nên có giá vốn thật (`alloc.totalCost`) thay vì định mức. `costBasis.unitCost = batch.costPerUnit` (giá vốn CỦA CHÍNH MẺ NÀY, không phải trung bình động). Yield kỳ vọng lấy qua `btpLib.resolveYieldAt(reg, {at})` — version có hiệu lực TẠI THỜI ĐIỂM NẤU, không phải bản mới nhất (chuẩn bị sẵn cho B2). Vẫn giữ đúng alert lệch yield >10% (`PrepYieldMismatch` event — cũng phụ thuộc gap L9). **Có PRECONDITION `shortfalls.length` chặn nấu khi thiếu nguyên liệu, và KHÁC sales.js/inventory.js ở chỗ KHÔNG CÓ cờ thoát nào (không có `allowShortfall`/`allowUntracked`) — chặt hơn cả 2 case đã treo ở `NET-SALES-V1.md` "Ca liên quan đã rà". Cùng loại ⚪ CHƯA QUYẾT, nhưng mức độ chặn cao hơn — gộp vào cùng một quyết định chủ quán, không tách riêng.** |

## B2 — Sửa yield mẻ đã nấu (COGS/P&L lịch sử bị trôi)

| | |
|---|---|
| **Hệ cũ** | `_applyPrepYieldEdit` (`quanlygieo.html:11409-11505`) — sửa đúng `prep_batches` của MẺ ĐÓ (netting đúng phần đã bán) + audit trail đầy đủ (`batch.yieldEdits[]`), NHƯNG gọi lại `refreshPrepYieldStatsPOS` khiến `prep_items.yieldActualAvg` đổi thành giá trị "hiện tại" mới — 🔴 ĐỨT CHUỖI #1: `prepCostOn` (`quanlygieo.html:2645`) đọc `yieldActualAvg` HIỆN TẠI cho MỌI `dateKey` quá khứ → COGS/P&L các ngày cũ trôi theo mỗi lần sửa yield sau này. Hệ cũ tự thú nhận trong comment code, không cảnh báo UI. |
| **Hệ mới** | `commands/prep.js` → `EditPrepYield`, dựa trên `recipe-cost-btp/btp.js` → `editYield()` + `prepCostAt()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã đọc trọn — xác nhận đóng đúng ĐỨT CHUỖI #1, được header file `btp.js` gọi đích danh là "instance #4 của lớp lỗi đã xác nhận 7 lần" (cùng họ lỗi với Recipe/Packaging/Payroll versioning đã ghi nhận trước đó ở `FEATURE-TREE-V1.md §4.8`). Cách sửa: `editYield()` tính lại `costPerUnit` cho ĐÚNG MẺ đó (`batch.rawCost / newYield`), KHÔNG đẩy sang trung bình động toàn cục — nên COGS ngày cũ không trôi. `prepCostAt()` là điểm thay thế trực tiếp `prepCostOn`: ưu tiên giá của chính mẻ đã trừ (`source: 'BATCH'`), nếu không có mẻ cụ thể thì lấy yield version có hiệu lực TẠI thời điểm sự kiện (`source: 'YIELD_VERSION'`) — không bao giờ rơi về "yield hiện tại" cho một ngày quá khứ; code có validate rõ: thiếu yield version hợp lệ tại thời điểm đó thì trả lỗi thay vì âm thầm dùng bản mới nhất. Giữ nguyên phần legacy làm ĐÚNG: netting phần đã bán (validate `newYield < consumed` → chặn, "tồn âm không nguyên nhân vật lý") và audit trail đầy đủ. |

## B3 — Actual vs Theoretical cho BTP

| | |
|---|---|
| **Hệ cũ** | **KHÔNG TỒN TẠI.** `thDoiChieu`/`thTinhMotKy` (`quanlygieo.html:7314-7370`) là cơ chế actual-vs-theoretical DUY NHẤT trong hệ thống — 0 tham chiếu tới `prep_items`/`prep_transactions`. Vi phạm trực tiếp nguyên tắc trung tâm của FIFO (Master Plan §1.6) do thiếu hẳn một domain. |
| **Hệ mới** | `recipe-cost-btp/btp.js` → `computeTheoretical()` + `computeVariance()` |
| **Phân loại** | 🟢 **THÊM MỚI** — legacy chưa từng có yêu cầu này cho BTP |
| **Ghi chú** | Đã đọc trọn — công thức ĐÚNG NHƯ chain-trace yêu cầu: `theoretical = Σ(mẻ đã nấu theo yield hiệu lực) − Σ(đã bán) − Σ(waste đã ghi)`, `variance = actual (đếm được) − theoretical`. CÙNG MỘT công thức với nguyên liệu thô — không tách 2 đường code như legacy đã làm. Có xử lý rõ ràng trường hợp CHƯA ĐẾM: trả `status: 'NOT_COUNTED'` thay vì coi lệch bằng 0 (không bịa số khi thiếu dữ liệu — đúng tinh thần `SEED-CONTRACT-V1.md`). Kiểm đếm thực tế (`countedQty`) tự nó đi qua ĐÚNG cơ chế `ApproveStockCount`/`physicalReconciliation` đã xác nhận ở `NET-RAW-MATERIAL-V1.md` RM4 — không cần command riêng cho BTP vì Unit BTP là Unit FIFO như mọi Unit khác. |

## B4 — Waste BTP (huỷ giữa ca / hết hạn cuối ca)

| | |
|---|---|
| **Hệ cũ** | 2 đường ghi CÙNG `type:WASTE` nhưng KHÔNG đồng nhất field: `_submitPrepCountImpl` (`quanlygieo.html:16276-16525`, hết hạn cuối ca — đường PHỔ BIẾN NHẤT) KHÔNG có `ingredientBreakdown`; `submitPrepWaste` (11601, huỷ giữa ca) CÓ `ingredientBreakdown` (11638). 🔴 ĐỨT CHUỖI #2: phần lớn waste thực tế không quy đổi ngược ra nguyên liệu thô được vì đi qua đường thiếu breakdown. |
| **Hệ mới** | `commands/inventory.js` → `RecordWaste` (domain `'prep'`) — MỘT command duy nhất cho cả 2 trigger |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã xác nhận ở `NET-RAW-MATERIAL-V1.md` RM5: `RecordWaste` gọi `allocation.allocateConsumption()` KHÔNG ĐIỀU KIỆN cho cả `raw` lẫn `prep`, không có nhánh rẽ theo domain hay theo trigger (huỷ giữa ca vs hết hạn cuối ca đều đi qua CÙNG một lời gọi). `commands/prep.js`'s header comment xác nhận trực tiếp: "Waste BTP dùng chung `commands/inventory.RecordWaste`... nên `ingredientBreakdown` luôn có bất kể trigger từ đâu — đóng đứt chuỗi #2". Không có 2 code path nữa. |

## B5 — Kết ca / báo cáo ngày {nấu, dùng, huỷ}

| | |
|---|---|
| **Hệ cũ** | `computeHandoverCloseLinesPOS` (`posgieo.html:15359`) đọc `refill_rules` — CHỈ `itemId ∈ INVENTORY_ITEMS`, BTP không nằm trong đó → 🔴 ĐỨT CHUỖI #3: không có màn kết ca hợp nhất 2 loại đếm. `thLichSuBTP` (`quanlygieo.html:7945`) TÍNH ĐÚNG `{nau,dung,huy}` theo ngày nhưng chỉ dùng nội bộ cho dự báo (`dbChay`) + export AI — KHÔNG BAO GIỜ lên màn hình báo cáo cho chủ quán xem trực tiếp. |
| **Hệ mới** | `reporting/btp-report.js` → `buildDaily()`, đăng ký qua `reporting/report-queries.js` thành `GetBTPReport` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | **ĐÍNH CHÍNH so với ghi chú tạm thời ở `NET-RAW-MATERIAL-V1.md` RM7** (khi chưa đọc file này): đã đọc trọn `btp-report.js` — phần đầu comment ("chỉ dùng nội bộ... không bao giờ hiển thị") là TRÍCH LẠI nguyên văn mô tả GAP CỦA HỆ CŨ để giải thích LÝ DO module này tồn tại, KHÔNG PHẢI mô tả hành vi hiện tại của hệ mới. `buildDaily()` tính đúng `{dateKey, nau, nauCost, batchCount, dung, huy, huyCost, huyPct}` theo ngày — cấu trúc `days[k]` y hệt yêu cầu chain-trace fix #4 ("dữ liệu đã đúng logic, chỉ cần đưa ra, không cần thuật toán mới"). Và đã được đăng ký thành `GetBTPReport` trong `report-queries.js`, tức là ĐÃ CÓ ĐƯỜNG TRUY CẬP — khác hẳn `thLichSuBTP` ở hệ cũ vốn 0 nơi gọi tới từ UI báo cáo. Phần còn thiếu (chưa có màn hình `quanlygieo.html` nào GỌI `GetBTPReport`) là tình trạng CHUNG của TOÀN BỘ các query mới đăng ký — chưa tới lượt nối UI, không phải một gap riêng của BTP. **Cần sửa lại RM7 trong NET-RAW-MATERIAL-V1.md cho khớp phát hiện này** (xem VIỆC PHẢI LÀM bên dưới). |

## B6 — QUANLY đọc: KPI / P&L

| | |
|---|---|
| **Hệ cũ** | `computeLedgerRealMetrics` (`quanlygieo.html:10835-10920`) gom ĐÚNG cả 2 nguồn WASTE (raw+prep) → `wasteValue` → `computeKPIs` so target thật (`wasteTargetPct`) — KHÔNG ĐỨT. `computeDayPL` (6108) cộng `haoHut` (gồm BTP) RIÊNG vào `tongChiPhi`, không lẫn COGS — ĐÚNG. `prepAdjValue` (chênh lệch đếm BTP) chỉ hiện thông tin, không có target riêng — không phải bug, chỉ là chưa có KPI riêng. |
| **Hệ mới** | `reporting/variance-report.js` (`GetVarianceReport`) + `recipe-cost-btp/cogs.js` (`cogsTheoretical`/`cogsActual`) |
| **Phân loại** | 🟡 **GIỮ** (không đổi bản chất nghiệp vụ, chỉ chuyển nguồn đọc sang ledger thay vì field tổng cache — cùng nguyên tắc đã áp dụng xuyên toàn bộ hệ mới) |
| **Ghi chú** | Chain-trace tự ghi rõ "ĐIỂM KHÔNG ĐỨT — tránh audit lệch bi quan": waste-target hoạt động đúng kể cả BTP, từng có bug (BTP waste bị bỏ sót khỏi `wasteValue`) nhưng đã vá ở hệ cũ. Giữ nguyên nguyên tắc khi rebuild — không cần thiết kế lại, chỉ đảm bảo nguồn đọc là ledger (đã xác nhận qua `usage-report.js`/`variance-report.js` chung nguyên tắc "một nguồn đọc duy nhất"). `prepAdjValue` không có target riêng — để nguyên, không phải việc phải làm. |

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Raw Material** | B1/B3/B4 dùng CHUNG engine FIFO + `RecordWaste` với raw material (`NET-RAW-MATERIAL-V1.md` RM5); B3's kiểm đếm dùng chung `ApproveStockCount`/`physicalReconciliation` (RM4); B5 cùng loại gap "tính đúng nhưng chưa nối UI" như RM7 phần raw — nhưng KHÁC Ở CHỖ BTP đã đăng ký query, raw thì chưa có cấu trúc ngày để đăng ký |
| **Sales/POS** | B1's PRECONDITION shortfall-không-cờ-thoát là bản CHẶT HƠN của case đã treo ở `NET-SALES-V1.md` "Ca liên quan đã rà" — gộp chung một quyết định chủ quán |
| **Reporting** | B5/B6 nối với nguyên tắc "một canonical query, một implementation" (R3) đã thấy xuyên suốt `report-queries.js` |
| **Loyalty/Reversal/Raw Material (L9)** | B1's `PrepYieldMismatch` event là phát hiện phụ thuộc gap L9 thứ 4 (sau Loyalty, Reversal, Raw Material RM6) — event có logic đúng nhưng không consumer nào chạy nó |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **B3** (actual-vs-theoretical cho BTP — domain hoàn toàn mới, đóng đúng North Star)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **B1, B2, B4, B5, B6** — cả 4 vấn đề "cần thiết kế mới" mà chain-trace nêu (B2 ĐỨT CHUỖI #1, B4 ĐỨT CHUỖI #2, B5 ĐỨT CHUỖI #3, B3 GAP actual-vs-theoretical) đều đã xác nhận ĐÓNG qua đọc trọn code — `recipe-cost-btp/btp.js`'s header tự tổng kết đúng "Bốn vấn đề, đóng cả bốn"
- ⚪ CHƯA QUYẾT (gộp vào quyết định chung với Sales/Raw Material): B1's PRECONDITION shortfall không có cờ thoát — CHẶT HƠN 2 case tương tự đã treo

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. **Sửa lại RM7 trong `NET-RAW-MATERIAL-V1.md`** — phần kết luận về BTP ("lặp lại có chủ đích mẫu lỗi stockoutTargetPct") là ĐỌC SAI comment của `btp-report.js` khi chưa đọc trọn file đó. Cần đính chính: comment đó trích lại mô tả GAP CỦA HỆ CŨ để giải thích lý do tồn tại module, không phải hành vi hiện tại — `GetBTPReport` ĐÃ đăng ký, đóng đúng ĐỨT CHUỖI #3. Việc còn lại (chưa có UI gọi) là tình trạng chung mọi query mới, không phải gap riêng BTP.
2. Khi tổng hợp quyết định chủ quán về PRECONDITION shortfall (đã treo ở Sales + Raw Material), tính thêm B1 (BTP nấu mẻ) — vì đây là bản CHẶT NHẤT trong 3 case (không có cờ thoát nào).
3. (Không mới, nhắc lại) Tầng điều phối sự kiện — B1's `PrepYieldMismatch` là domain thứ 4 phụ thuộc gap L9.
