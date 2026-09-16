# FIFO CHAIN TRACE — KIỂM KHO → DUYỆT → ĐIỀU CHỈNH → ĐỐI CHIẾU — V1

> Cùng chuẩn với `FIFO-CHAIN-TRACE-BTP-V1.md`. Đây là chuỗi phát hiện **nhiều đứt chuỗi nhất trong 4 chuỗi đã trace** — bao gồm 1 route hoàn toàn không tồn tại (duyệt báo mất) và 1 lỗi làm điều chỉnh kiểm kho "biến mất câm lặng".

---

# SƠ ĐỒ CHUỖI THẬT

```text
[1] POS đếm (posgieo.html:11787-11996)
      countMode 'unit': BẮT BUỘC quét mã → countedSealed (chỉ tính CHAI NGUYÊN)
      countMode 'qty' : nhập tay số TUYỆT ĐỐI (không phải delta)
      → KHÔNG ĐỨT: thiết kế đúng, "đếm mù" (không hiện expectedBase)
      → AMBIGUOUS: nguyên liệu có tem thật nhưng unit≠"cái" + không khớp
        packagingUnits → rơi nhầm xuống nhánh 'qty', mất yêu cầu quét bắt buộc

[1b] Kiểm tra lại mismatch (chỉ countMode:'unit', posgieo.html:12095-12178)
      mọi mã sealed/open chưa quét → BẮT BUỘC quét lại hoặc "Không tìm thấy"
      "Không tìm thấy" → ghi stock_lost_reports_gieogieo (status:pending_review)
      🔴 ĐỨT CHUỖI: 0 kết quả grep cho hàm duyệt collection này trong quanlygieo.html
      (approveLostReport được COMMENT nhắc tới nhưng KHÔNG TỒN TẠI) → container "mất"
      không bao giờ đổi status → LẶP LẠI VÔ HẠN mỗi kỳ kiểm kho tiếp theo (xác nhận
      độc lập lần thứ 3 cho đúng gap của Bug #12, giờ từ góc kiểm kho)

[2] Submit phiếu (posgieo.html:12802-12878, `.add()` random id — Bug #13 double-tap)
      ghi stock_counts_gieogieo{items[], status:'pending_review'}

[3] Duyệt (quanlygieo.html:4679-4696)
      🔴 ĐỨT CHUỖI (Bug #7 đào sâu): Promise.allSettled → status luôn 'approved' dù
      có job fail. Nguyên nhân fail cụ thể: item bị xoá giữa lúc gửi/duyệt, hoặc
      transaction contention với _ueRecomputeCurrentStock của CHÍNH item đó đang
      chạy song song (khách mua đúng lúc Quản lý duyệt). KHÔNG lưu lại itemId nào
      fail — chỉ 1 con số failedCount trong audit log.
      🔴 GAP MỚI: approveStockCount KHÔNG idempotent — không check status trước khi
      build jobs, nút Duyệt không có busy-guard → double-click/2 người duyệt cùng
      lúc = cộng/trừ varianceBase 2 LẦN cho cùng 1 lần lệch thật.

[4] applyStockTransaction (quanlygieo.html:4636-4655)
      ghi THẲNG inventory_items.currentStock — KHÔNG qua untrackedPendingDelta,
      KHÔNG đụng stock_containers_gieogieo, KHÔNG đụng active_units_gieogieo RTDB.
      quanlygieo.html HOÀN TOÀN không biết tới khái niệm Unit Engine (0 kết quả
      grep _ueRecomputeCurrentStock/active_units_gieogieo/untrackedPendingDelta).
      🔴 ĐỨT CHUỖI NGHIÊM TRỌNG: với item trackingMode:'unit'/'batch', lần
      _ueRecomputeCurrentStock KẾ TIẾP (kích hoạt bởi BẤT KỲ bán/mở tem/báo hết nào
      sau đó của CÙNG item) ghi đè currentStock bằng công thức
      untrackedBase+untrackedPendingDelta+sealed+open, XOÁ CÂM LẶNG khoản điều
      chỉnh kiểm kho vừa duyệt. Cùng họ lỗi "unit-aware vs untracked" đã biết ở
      reversal (Bug #17), giờ xuất hiện lại ở phía Quản lý cho kiểm kho.

[5] Đối chiếu kỳ sau — thPhieuCuaItem/thTinhMotKy/thDoiChieu (quanlygieo.html:7296-7415)
      → KHÔNG ĐỨT: lọc ĐÚNG chỉ status==='approved', dùng THẲNG countedBase lưu
      trong doc — KHÔNG đi qua currentStock/stock_transactions để suy ra 2 mốc.
      → Hệ quả: báo cáo đối chiếu ĐỊNH KỲ này "miễn nhiễm" với lỗi ở bước [3]/[4],
      NHƯNG chính vì vậy currentStock (vận hành hàng ngày) và countedBase (báo cáo
      đối chiếu) ÂM THẦM LỆCH NHAU — 2 nguồn sự thật không đồng bộ, không ai cảnh
      báo khi chúng khác nhau.

[6] Tần suất kiểm kho tiếp theo — GAP
      không có cấu hình lịch bắt buộc theo item; checklist "đã kiểm kho hôm nay"
      (nếu Quản lý tự tạo) chỉ cần 1 PHIẾU/NGÀY, dù CHỈ ĐẾM 1 DÒNG, dù CHƯA DUYỆT
      (hasStockCountTodayPOS không lọc status) — không chặn bán hàng (blocking mặc
      định false). Không cảnh báo per-item "lâu chưa kiểm kê".
```

---

# ĐIỀU CHỈNH KHO CÓ TEM: TRẢ LỜI CÂU HỎI "TRỪ VÀO TEM NÀO?"

Với ví dụ cụ thể "trà sữa thiếu 500g, có 3 tem đang mở, trừ vào tem nào" — trả lời thẳng: **hệ thống không trừ vào tem nào cả, và 3 lớp riêng biệt đều có vấn đề:**

1. **Hàng trong tem đang mở**: theo thiết kế, bị loại khỏi phép so sánh ngay từ lúc gửi phiếu (chỉ tính chai nguyên) — đây là quyết định nghiệp vụ CÓ LÝ DO rõ ràng (không ai đo chính xác được phần dở dang), không phải bug. Hệ quả chấp nhận được: kiểm kho không phát hiện lệch bên trong tem đang mở.
2. **Chai nguyên bị mất, phát hiện qua bắt buộc quét**: CÓ cơ chế unit-aware đúng nghĩa (report đúng `containerId`) — nhưng route duyệt phía Quản lý không tồn tại (xem [1b] ở trên).
3. **ADJUSTMENT cho lệch số lượng hợp lệ khác**: ghi thẳng `currentStock`, bị Unit Engine xoá ở lần recompute kế tiếp (xem [4] ở trên).

---

# FIX BẮT BUỘC TRONG THIẾT KẾ MỚI

1. **`ApproveStockCount` phải qua đúng `AdjustInventory` command** (đã thiết kế trong `packages/commands/approval`) — command này BẮT BUỘC dùng `untrackedPendingDelta`/allocate qua FIFO Engine, không có code path "ghi thẳng currentStock" nào tồn tại song song như `applyStockTransaction` legacy.
2. **`ApproveStockCount` phải idempotent** — dùng đúng pattern claim+txId đã thiết kế (`FIFO-CORE-ARCHITECTURE-V2.md` §7), áp dụng luôn cho hành động DUYỆT chứ không chỉ hành động TẠO.
3. **`ApproveLostContainer` bắt buộc phải tồn tại** (đã xác nhận gap Bug #12 lần thứ 3, độc lập từ 3 góc audit khác nhau — FIFO audit, Alerts audit, Stock-count audit) — đây là ưu tiên cao nhất trong danh sách "feature gap thật" cần xây, không phải "có thể để sau".
4. **Khi `approveStockCount` có dòng lỗi, PHẢI lưu lại chính xác dòng nào** (`itemId`/`operationId`) để retry/khắc phục — không chỉ 1 con số `failedCount` như legacy. Status phiếu nên có state `partially_applied` (đã đề xuất trong bug report gốc) thay vì luôn `approved`.
5. **1 nguồn sự thật duy nhất cho `currentStock`** — sau khi command `AdjustInventory` chạy qua FIFO Core, không còn khái niệm "báo cáo đối chiếu dùng số khác với vận hành hàng ngày dùng số khác" — cả `thDoiChieu`-tương-đương lẫn `currentStock` projection đều phải đọc từ cùng 1 Unified Read Layer.
