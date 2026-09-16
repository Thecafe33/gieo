# FIFO CHAIN TRACE — REPORTING / DASHBOARD — V1

> Khác các chain-trace theo 1 nghiệp vụ, đây là trace **đường đi dữ liệu từ giao dịch gốc tới con số hiển thị trên màn hình báo cáo** — vì đã xác nhận nhiều lần (Sales/COGS, Payroll, Alerts) rằng "tính đúng nhưng hiển thị sai/không hiển thị" là 1 lớp lỗi lặp lại, domain Reporting là nơi mọi lớp lỗi đó hội tụ lại thành số cuối cùng chủ quán nhìn thấy.

---

# SƠ ĐỒ CHUỖI THẬT (khảo sát legacy)

```text
[1] Nguồn dữ liệu cho từng màn báo cáo (quanlygieo.html)
      Health/Report/Mix dùng chung fetchSalesRange() (2845-2897): ngày
      cũ hơn CACHE_BUFFER_DAYS đọc daily_sales_cache_gieogieo, ngày gần
      tính live rồi ghi ngược vào cache (lazy cache, không theo lịch).
      Mix/Customer CỐ Ý bỏ qua cache, luôn đọc live từng bill (comment
      giải thích: cache không giữ chi tiết topping/size).
      → KHÔNG ĐỨT về mặt tính đúng — mỗi màn chọn nguồn phù hợp mục
      đích của nó, có lý do rõ ràng, không phải tuỳ tiện.

[2] Bộ máy doanh thu ở POS — HOÀN TOÀN TÁCH BIỆT
      posgieo.html có màn "DOANH THU" riêng (dòng 1127+), tự đọc mảng
      orders in-memory + archive, KHÔNG hề biết đến
      daily_sales_cache_gieogieo (0 kết quả grep trong posgieo.html).
      🔴 ĐỨT CHUỖI TẠI ĐÂY: 2 pipeline tính doanh thu độc lập cho CÙNG
      1 tập giao dịch gốc — không có gì đảm bảo chúng luôn cho cùng 1
      số nếu 1 bên có logic khác biệt (vd 1 bên tính channel fee, 1 bên
      không) — nguy cơ chênh lệch âm thầm giữa số POS tự hiển thị và
      số QUANLY báo cáo.

[3] Cache invalidation khi cấu hình giá đổi
      invalidateSalesCache() được nối đúng vào MỌI điểm sửa
      COGS/recipe/packaging/giá (10 điểm gọi, quanlygieo.html) → 
      KHÔNG ĐỨT cho nhánh này.
      🔴 ĐỨT CHUỖI TẠI ĐÂY (nhánh khác): khi 1 bill CŨ (đã nằm trong
      cache) bị xoá/sửa qua QUANLY (`qlDoDeleteBill`), KHÔNG có lời gọi
      invalidateSalesCache() nào ở luồng xoá bill — và phía POS (nơi
      cũng có thể xoá bill qua delOrderConfirm) hoàn toàn không biết
      collection cache này tồn tại. Kết quả: xoá/sửa 1 đơn cũ có thể để
      lại số liệu SAI trong cache vô thời hạn cho tới khi ai đó bấm
      "Xoá cache" thủ công.

[4] So sánh kỳ trước/kỳ này ("Báo cáo kỳ", quanlygieo.html:11335-11419)
      Cả 2 cột "tuần này"/"tuần trước" đều gọi fetchSalesRange() SỐNG
      (không đóng băng) — nếu 1 ngày trong "tuần trước" bị sửa sau khi
      đã xem báo cáo lần đầu, lần xem sau sẽ ra số khác mà không có
      cảnh báo gì (màn này còn thiếu cả chỉ báo "N ngày lấy từ cache"
      mà màn Health liền kề LẠI CÓ — 2 màn dùng chung 1 nguồn dữ liệu
      nhưng hiển thị độ tin cậy khác nhau).
      🔴 ĐỨT CHUỖI TẠI ĐÂY: không có "đóng băng" cho so sánh kỳ, khác
      hẳn P&L tháng (mục 5).

[5] P&L tháng — nơi DUY NHẤT làm đúng "đóng băng lịch sử"
      plHealthHTML (quanlygieo.html:6406-6511): nếu kỳ xem trùng đúng 1
      tháng đã có book_closings_gieogieo, dùng số ĐÃ CHỐT (book.chot),
      không dùng số sống — còn chủ động cảnh báo nếu số sống đã trôi
      khỏi số đã chốt (lechSauChot).
      → KHÔNG ĐỨT — đây là mẫu "freeze vs recalculate" cần nhân rộng,
      không phải giữ làm ngoại lệ riêng của P&L tháng.

[6] Báo cáo giá trị tồn kho ("Vốn nằm trong kho", quanlygieo.html:10988-
    11113)
      Công thức: currentStock × costPerUnit hiện tại (1 field scalar
      "giá gần nhất", không phải tổng theo lớp FIFO thật).
      🔴 ĐỨT CHUỖI TẠI ĐÂY — xác nhận LẦN NỮA (đã biết từ Sales/COGS
      chain) rằng legacy chưa từng có cost-basis FIFO thật trên Unit;
      báo cáo định giá tồn kho kế thừa đúng lỗ hổng đó.
      Thêm phát hiện mới: TRONG CÙNG 1 thẻ báo cáo, tồn kho định giá
      theo giá HIỆN TẠI còn phần tiêu hao (vòng quay kho) lại định giá
      theo giá LỊCH SỬ (itemCostOn) — code tự biết và ghi chú, nhưng 2
      con số cạnh nhau trên cùng UI dùng 2 cơ sở giá khác nhau, dễ bị
      đọc nhầm là so sánh được trực tiếp.

[7] Export/In báo cáo
      GAP — chưa tồn tại: không có xuất CSV/Excel/PDF cho bất kỳ báo
      cáo nào. "Trích xuất dữ liệu" chỉ là dump JSON thô toàn bộ
      collection (để đưa cho AI ngoài phân tích), KHÔNG phải xuất báo
      cáo đã định dạng. In chỉ là tác dụng phụ của CSS @media print
      chung, không có nút "In" nào được thiết kế riêng.

[8] Đa cửa hàng / ALL_STORES
      GAP — chưa tồn tại 100%, xác nhận qua code: STORE_ID là hằng số
      đơn, tự comment "không còn dùng làm tiền tố path" — 0 kết quả
      "ALL_STORES" trong code thật (chỉ có trong tài liệu hợp đồng
      phân quyền). Khớp hoàn toàn với phát hiện trước: đây là khái
      niệm quyền hạn cho TƯƠNG LAI, không phải tính năng dở dang.

[9] Phân quyền xem báo cáo
      🔴 ĐỨT CHUỖI TẠI ĐÂY — nghiêm trọng nhất domain này: QUANLY đăng
      nhập Firebase bằng 1 TÀI KHOẢN DÙNG CHUNG duy nhất
      (`cafe33@xolifa.com`, hardcode), KHÔNG có màn đăng nhập theo
      từng người, KHÔNG có bất kỳ check role/permission nào trong code
      trước khi render bất kỳ báo cáo tài chính nào (switchScreen()
      không kiểm tra quyền). Bất kỳ ai mở được app đều thấy toàn bộ
      P&L/COGS/waste/định giá tồn kho/dữ liệu khách hàng — mâu thuẫn
      trực tiếp với `POS-QUANLY-PERMISSION-CONTRACT-V1.md` (3 tầng
      EXECUTE/REVIEW-APPROVE-CORRECT/MASTER-CONFIGURE) — legacy KHÔNG
      hề có tầng nào trong 3 tầng đó ở mức code, chỉ có "ai có link/máy
      thì vào được".

[10] Chỉ báo dữ liệu sống hay cache
      Chỉ Health có "(N ngày, M ngày lấy từ cache)" — không có
      timestamp tính lúc nào (daily_sales_cache_gieogieo không lưu
      computedAt). Report kỳ (mục 4) không có chỉ báo này dù cùng
      nguồn. GAP nhất quán, không phải thiếu hẳn.
```

---

# LUỒNG CHUẨN CHO HỆ THỐNG MỚI (không phải fix, mà thiết kế lại đúng ngay từ đầu)

1. **1 `packages/read-layer` DUY NHẤT phục vụ cả POS lẫn QUANLY cho mọi con số doanh thu/báo cáo** — xoá bỏ hẳn kiểu 2 pipeline độc lập của legacy (mục 2). POS không tự tính lại doanh thu bằng logic riêng; cả 2 app gọi chung 1 read-model.
2. **`ReverseTransaction`/`ReviseState` khi tác động tới 1 giao dịch đã nằm trong kỳ báo cáo PHẢI tự phát tín hiệu invalidate cache/projection liên quan** — đúng nguyên tắc domain-event side-effect đã thiết kế ở Reversal/Correction, khắc phục đúng gốc gap mục 3 (không phải chỉ nối thêm 1 lời gọi `invalidateSalesCache` thủ công ở từng nơi xoá bill như legacy đang thiếu).
3. **Freeze-vs-recalculate phải là quyết định TƯỜNG MINH cho MỌI báo cáo theo kỳ, không riêng P&L tháng** — nhân rộng đúng pattern `book_closings_gieogieo`/`lechSauChot` đã làm đúng (mục 5) sang so sánh tuần-trước/tuần-này, KPI theo kỳ, và bất kỳ báo cáo period-over-period nào khác. Đây là lần thứ 7 cùng nguyên tắc "input/state không version hoá làm trôi số liệu lịch sử" xuất hiện (Recipe, Packaging, BTP yield, Payroll, COGS chung, Alerts/KPI-target theo ngày, nay là báo cáo theo kỳ) — xác nhận chắc chắn đây PHẢI là 1 cơ chế lõi dùng chung (`packages/compaction`), không phải xử lý riêng lẻ từng màn.
4. **Định giá tồn kho dùng `Unit.costBasis` thật (đã thiết kế ở FIFO Core) thay vì scalar giá gần nhất** — và khi hiển thị cùng lúc 2 chỉ số dùng 2 cơ sở giá khác nhau (tồn kho hiện tại vs tiêu hao lịch sử), UI phải ghi rõ nhãn cơ sở giá cho từng số, không chỉ dựa vào chú thích nhỏ như legacy.
5. **Phân quyền báo cáo enforce ở tầng đọc (read-layer/Command), đúng như `POS-QUANLY-PERMISSION-CONTRACT-V1.md` đã định** — mỗi truy vấn báo cáo phải đi kèm `AccessContext`/role, không phải chỉ ẩn UI. Đây là gap nghiêm trọng nhất tìm thấy trong domain Reporting, cần ưu tiên cao khi dựng `packages/reporting`.
6. **Export báo cáo đã định dạng (CSV tối thiểu) là tính năng thật cần xây**, tách biệt khỏi cơ chế "trích xuất dữ liệu thô cho AI phân tích" (giữ lại riêng, vẫn hữu ích, không phải thay thế cho export báo cáo).
7. **Đa cửa hàng: chỉ cần chừa vị trí nối (`storeId` trong mọi query, `ALL_STORES` là scope đọc/tổng hợp)**, không cần dựng UI multi-store ngay — đúng nguyên tắc "cây tính năng: phần nào chưa cần thì chừa chỗ nối, không xây trước".
8. **Mọi cache/projection báo cáo phải mang `computedAt`** để UI luôn có thể hiển thị độ mới nhất quán, không phải tuỳ màn hình có hay không như legacy.
