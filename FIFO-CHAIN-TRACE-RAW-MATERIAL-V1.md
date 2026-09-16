# FIFO CHAIN TRACE — NGUYÊN LIỆU THÔ — V1

> Cùng chuẩn với `FIFO-CHAIN-TRACE-BTP-V1.md`. Giả định ban đầu "nguyên liệu thô làm tốt hơn BTP" chỉ **đúng một phần** — giá theo lịch sử (`itemCostOn`) và actual-vs-theoretical (`thDoiChieu`) đúng, nhưng **waste traceability đứt nghiêm trọng hơn BTP**.

---

# SƠ ĐỒ CHUỖI THẬT

```text
[1] Nhận hàng → createContainersForReceipt (posgieo.html:5460-5543)
      ghi stock_containers_gieogieo{status:sealed,...} — KHÔNG có field giá
      → KHÔNG ĐỨT: giá tra runtime qua itemCostOn(id,date) ← price_history_gieogieo
        (versioned đúng theo effectiveFrom, ghi bởi submitPurchaseOrder/sửa tay item)
      → GAP nhỏ: thDoiChieu.giaVon dùng giá HIỆN TẠI thay vì itemCostOn khi sort độ ưu
        tiên hiển thị — không ảnh hưởng số actual/theoretical chính

[1b] Nhập kho nhanh / ADJUSTMENT (không qua createContainersForReceipt)
      → applyStockTransaction() quanlygieo.html:4636-4656 — chỉ cộng currentStock thẳng
      🔴 ĐỨT CHUỖI: KHÔNG ghi untrackedPendingDelta. Helper _ueBumpUntrackedPendingDelta
      được NHẮC trong comment (posgieo.html:3820) nhưng KHÔNG TỒN TẠI trong code — xác
      nhận độc lập Bug #1 vẫn sống trong code hiện tại.
      → recompute kế tiếp (_ueRecomputeCurrentStock) XOÁ SẠCH khoản này

[2] Sửa phiếu nhận sai → fixRecWizApply (quanlygieo.html:4119-4218), 4 bước ghi RỜI RẠC
      🔴 ĐỨT CHUỖI: không atomic giữa 4 bước (Bug #20 xác nhận dòng cụ thể)
      🔴 GAP: không có nhánh sửa GIÁ nhận nhầm trong wizard này — chỉ sửa số lượng thừa
      → KHÔNG ĐỨT: có audit trail đầy đủ, không đụng tem đã mở/đã bán

[3] Kiểm kho định kỳ → thTinhMotKy/thDoiChieu (quanlygieo.html:7314-7415)
      → KHÔNG ĐỨT: <2 phiếu → báo "thiếu dữ liệu" tường minh, không tính bừa
      → AMBIGUOUS: không có cơ chế nhắc/enforce tần suất kiểm kho theo item
      → Approve → applyStockTransaction(ADJUSTMENT) — CÙNG lỗi 1b (xem
        FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md để biết chi tiết đầy đủ)

[4] Waste nguyên liệu — 3 đường, CHỈ 1/3 unit-traceable
      (a) Báo hết tem       → referenceId=containerId → KHÔNG ĐỨT, trace đúng Unit
      (b) Đổ ly thành phẩm  → 🔴 ĐỨT: chỉ trace itemId, KHÔNG allocate unit
      (c) Hao hụt trực tiếp → 🔴 ĐỨT: không có UI chọn tem, không allocate unit
      → cả 3 vẫn cộng ĐÚNG untrackedPendingDelta (tổng tiền đúng) — chỉ mất khả năng
        trace NGƯỢC về Unit cụ thể cho (b)/(c)

[5] Báo cáo ngày cho nguyên liệu
      🔴 GAP: không tồn tại — chỉ có feed 50 giao dịch gần nhất KHÔNG lọc/nhóm theo
      ngày (renderKhoHistItems) — GIỐNG HỆT gap đã tìm ở BTP (đây là gap hệ thống,
      không phải riêng 1 domain)

[6] KPI — wasteTargetPct/cogsPct: KHÔNG ĐỨT, so sánh thật, định giá đúng theo ngày
      stockoutTargetPct: GAP có chủ đích — tính năng đã bị bỏ theo quyết định sản
      phẩm (nhân viên báo group chat thay vì bấm ở POS), field config vẫn còn tồn
      tại gây hiểu nhầm đang được dùng — nên dọn khi rebuild
```

---

# PHÁT HIỆN QUAN TRỌNG NHẤT: BẤT ĐỐI XỨNG TRACEABILITY GIỮA BTP VÀ NGUYÊN LIỆU THÔ TRONG CÙNG 1 HÀM

`_submitDrinkWasteImpl` (posgieo.html:9003-9063) xử lý CẢ prep lẫn nguyên liệu trong CÙNG 1 hàm:
- Nhánh **prep**: gọi `unitEngineAllocateConsumption(prepId, back, 'prep_batches_gieogieo')` — phân bổ FIFO vào đúng lô trước khi ghi sổ.
- Nhánh **nguyên liệu thô**: gọi thẳng `applyStockTransactionPOS({itemId, type:'WASTE', ...})` — KHÔNG `deriveFromUnits`, KHÔNG allocate.

Đây là bằng chứng rõ nhất: **kỹ thuật để làm đúng đã tồn tại sẵn trong chính codebase (dùng cho BTP), chỉ đơn giản chưa được áp cho nguyên liệu thô ở 2 màn hình (đổ ly, hao hụt trực tiếp)**. Khi rebuild, đây không phải thiết kế mới — chỉ cần áp dụng lại đúng pattern đã có.

---

# FIX BẮT BUỘC TRONG THIẾT KẾ MỚI

1. **`RecordWaste` (mọi itemKind) PHẢI qua `AllocateConsumption` trước khi ghi ledger** — không còn nhánh riêng "nguyên liệu thô waste không allocate". Đây là fix cho §4(b)/(c) — dùng đúng code path đã có cho prep, không viết logic mới.
2. **`untrackedPendingDelta` là helper bắt buộc** (đã thiết kế ở `FIFO-CORE-ARCHITECTURE-V2.md` §5) — giờ có bằng chứng thứ 2 độc lập (Nhập kho nhanh + kiểm kê ADJUSTMENT đều bỏ sót) khẳng định đây đúng là root cause cần chặn ở tầng kiến trúc, không phải convention.
3. **`packages/reporting/inventory-report.ts` cần báo cáo NGÀY cho nguyên liệu thô** (nhận/dùng/hao hụt/tồn cuối) — cùng gap với BTP, cùng fix (đã có trong blueprint `inventory-report.ts`, cần đảm bảo có view theo ngày, không chỉ feed gần nhất).
4. **Dọn `stockoutTargetPct` khỏi schema** — tính năng đã bỏ, đừng mang field chết sang.
