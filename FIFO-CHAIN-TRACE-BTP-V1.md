# FIFO CHAIN TRACE — BTP (Bán Thành Phẩm) — V1

> Đây KHÔNG phải audit "tính năng có tồn tại không" — đây là trace **trọn 1 chuỗi dữ liệu từ đầu tới cuối**: nấu mẻ → nhập yield → sửa sai → đối chiếu lý thuyết/thực tế → waste → báo cáo kết ca → KPI QUANLY. Yêu cầu gốc: mỗi mắt xích phải chỉ rõ ghi field gì, mắt xích sau có đọc lại field đó không — nếu không, đó là **đứt chuỗi**, không phải chi tiết vụn vặt.
>
> Đây là mẫu chuẩn cho việc audit các chuỗi khác trong hệ thống (xem `FEATURE-TREE-V1.md` — mỗi domain cần trace kiểu này, không phải chỉ liệt Firebase path).

---

# SƠ ĐỒ CHUỖI THẬT

```text
[B1] Nấu xong → _submitPrepFinishImpl (posgieo.html:11129-11292)
      ghi prep_batches{qtyInitial,qtyRemaining,actualCostPerUnit,yieldVariancePct}
      + prep_transactions{type:PRODUCTION} + prep_items.currentStock
      → nền: refreshPrepYieldStatsPOS (10816) ghi prep_items{yieldActualAvg,costPerUnit}
        → lệch >10% & ≥3 mẫu: alerts_gieogieo{type:prep_yield_mismatch}
              ↓
[B2] Sửa yield sai → _applyPrepYieldEdit (11409-11505)
      SỬA prep_batches.qtyInitial/qtyRemaining/actualCostPerUnit (netting đúng phần đã bán)
      + prep_transactions{type:ADJUSTMENT} (audit) + batch.yieldEdits[] (audit trail đầy đủ)
      → gọi lại refreshPrepYieldStatsPOS → prep_items.yieldActualAvg ĐỔI (giá trị "hiện tại")
              ↓
      🔴 ĐỨT CHUỖI #1: quanlygieo.html:prepCostOn (2645) đọc yieldActualAvg HIỆN TẠI
      cho MỌI dateKey quá khứ → COGS/P&L các ngày cũ trôi theo mỗi lần sửa yield.
      Tự thú nhận trong comment code (quanlygieo.html:2631), không có cảnh báo UI.

[B3] KHÔNG CÓ mắt xích nào đọc yieldActualAvg để tính "BTP lẽ ra còn bao nhiêu".
      🔴 GAP (không phải đứt 1 mắt xích có sẵn — mắt xích này CHƯA TỪNG TỒN TẠI):
      thDoiChieu/thTinhMotKy (quanlygieo.html:7314-7370) — cơ chế actual-vs-theoretical
      DUY NHẤT trong hệ thống — chỉ đọc inventory_items/stock_transactions/stock_counts.
      0 tham chiếu prep_items/prep_transactions.

[B4] Kiểm đếm cuối ca → _submitPrepCountImpl (16276-16525)
      đọc prep_batches.qtyRemaining (SUM, KHÔNG đọc yield lý thuyết)
      variance = counted − sysQty (số dư SỔ SÁCH, không phải "theoretical remaining")
      → prep_transactions{type:WASTE, KHÔNG có ingredientBreakdown} (hết hạn/bỏ hết)
      → prep_transactions{type:ADJUSTMENT} (lệch chưa giải thích, CỐ Ý không tính waste)
      → alerts_gieogieo{type:prep_count_variance}
      Song song: submitPrepWaste (11601, huỷ giữa ca) — CÓ ingredientBreakdown (11638)
              ↓
      🔴 ĐỨT CHUỖI #2: 2 đường cùng ghi type WASTE vào cùng collection nhưng KHÔNG đồng
      nhất field — đường phổ biến nhất (hết hạn cuối ca) thiếu ingredientBreakdown, nên
      phần LỚN waste thực tế không quy đổi ngược ra nguyên liệu thô được.

[B5] Kết ca → _continueAfterPrepCount (16539) → renderShiftHandoverForm (16565)
      → computeHandoverCloseLinesPOS (15359) đọc refill_rules — CHỈ itemId∈INVENTORY_ITEMS
              ↓
      🔴 ĐỨT CHUỖI #3: BTP không nằm trong refill_rules → không có màn kết ca hợp nhất
      2 loại đếm. thLichSuBTP (quanlygieo.html:7945) TÍNH ĐÚNG {nau,dung,huy} theo ngày
      nhưng chỉ dùng nội bộ cho dự báo (dbChay) + export AI — KHÔNG BAO GIỜ lên màn hình
      báo cáo cho chủ quán xem trực tiếp.

[B6] QUANLY đọc — computeLedgerRealMetrics (10835-10920) GOM cả 2 nguồn WASTE (raw+prep)
      → wasteValue → computeKPIs → so target thật (wasteTargetPct) — CHUỖI NÀY KHÔNG ĐỨT.
      → computeDayPL (6108) cộng haoHut (gồm BTP) RIÊNG vào tongChiPhi, không lẫn COGS.
      prepAdjValue (chênh lệch đếm BTP) chỉ hiện thông tin, KHÔNG có target riêng.
```

---

# 4 VẤN ĐỀ CẦN THIẾT KẾ MỚI GIẢI QUYẾT (không phải patch riêng lẻ)

## 1. [GAP – Bước 3] Không có Actual vs Theoretical cho BTP
Nguyên liệu thô có (`thDoiChieu`), BTP thì không — trong khi Master Plan (`GIEO-SYSTEM-REBUILD-PLAN.md` §1.6, `FIFO-CORE-ARCHITECTURE-V2.md` §0 nguyên tắc kế thừa) coi actual-vs-theoretical là **nguyên tắc trung tâm của FIFO**, không phải tính năng phụ. Việc thiếu hẳn 1 domain (BTP) trong cơ chế này là vi phạm trực tiếp North Star đã đề ra.

**Fix bắt buộc trong hệ thống mới:** `packages/fifo-core` áp dụng CÙNG 1 cơ chế `variance = actual − theoretical` cho MỌI itemKind (`raw` lẫn `prep`), không tách 2 đường code như legacy. Theoretical cho BTP = `Σ(mẻ đã nấu theo yield hiệu lực) − Σ(đã bán theo recipe) − Σ(waste đã ghi)`.

## 2. [ĐỨT CHUỖI – Bước 2→6] Sửa yield làm trôi COGS/P&L lịch sử
Đây **cùng 1 lớp lỗi** đã phát hiện độc lập 3 lần trước đó ở Recipe, Packaging, Payroll (`FEATURE-TREE-V1.md` §4.8) — giờ xác nhận lần thứ 4 ở BTP yield. **Không còn nghi ngờ gì: đây là lỗ hổng kiến trúc hệ thống, phải giải quyết 1 lần bằng nguyên tắc chung**, không phải 4 lần vá riêng lẻ.

**Fix:** `prep_items.yieldActualAvg`/`costPerUnit` phải trở thành **versioned theo thời gian** giống `CostBasis` đã thiết kế cho Recipe (`FIFO-CORE-ARCHITECTURE-V2.md` §10) — `prepCostOn(prepId, dateKey)` phải resolve đúng version yield có hiệu lực tại `dateKey`, không phải bản mới nhất.

## 3. [ĐỨT CHUỖI – Bước 4] Waste không nhất quán field giữa 2 đường ghi
**Fix:** `RecordPrepWaste` (command duy nhất, `packages/commands/prep`) luôn bắt buộc tính `ingredientBreakdown` bất kể trigger từ đâu (huỷ giữa ca hay kiểm đếm cuối ca) — không còn 2 code path độc lập ghi cùng 1 `type:WASTE` với field khác nhau.

## 4. [ĐỨT CHUỖI – Bước 5] Không có báo cáo ngày cho BTP dù dữ liệu đã tính sẵn
**Fix:** `packages/reporting` phải có `btp-report.ts` (đã thêm vào blueprint) render đúng `{nau, dung, huy}` theo ngày — dữ liệu này ĐÃ tồn tại đúng logic (`thLichSuBTP`), chỉ cần đưa ra UI, không cần thiết kế thuật toán mới.

---

# ĐIỂM KHÔNG ĐỨT — GHI NHẬN RÕ (tránh audit lệch bi quan)
Chuỗi waste-target (Bước 6) hoạt động đúng, gồm cả BTP — từng có bug (BTP waste bị bỏ sót khỏi `wasteValue`) nhưng ĐÃ được vá (tự ghi trong comment code). `haoHut` BTP vào đúng field P&L riêng, không lẫn COGS. Giữ nguyên nguyên tắc này khi rebuild.

---

# QUY TRÌNH NÀY LÀ MẪU CHUẨN — ÁP DỤNG CHO CÁC CHUỖI KHÁC

Đang audit tiếp theo chuẩn này cho: (1) chuỗi nguyên liệu thô (receive→open→consume→count→reconcile — đã có `thDoiChieu`, cần xác nhận không còn đứt ở mắt xích khác), (2) chuỗi Bán hàng→COGS→P&L, (3) chuỗi Kiểm kho→Duyệt→Điều chỉnh. Kết quả sẽ nối thêm vào đây hoặc file riêng cùng chuẩn.
