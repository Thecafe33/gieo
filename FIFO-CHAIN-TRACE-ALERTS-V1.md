# FIFO CHAIN TRACE — ALERTS / NOTIFICATIONS — V1

> Khác các chain-trace domain, đây là trace **1 collection trung tâm** (`alerts_gieogieo`) + nhiều cơ chế "chủ động báo" nằm rải rác quanh `computeStoreHealth()`. Mục tiêu: xác định cơ chế nào thật sự PUSH (không cần mở đúng màn hình vẫn thấy) và cơ chế nào chỉ PULL (giả vờ chủ động nhưng thật ra bị động).

---

# SƠ ĐỒ CHUỖI THẬT (khảo sát legacy)

```text
[1] Alert được tạo (posgieo.html — nhiều điểm ghi vào alerts_gieogieo)
      handover_variance, handover_cash_variance, prep_count_variance,
      prep_yield_mismatch, missing_recipe, untracked_unit_consumption,
      allocate_rtdb_error, label_reconcile_anomaly, stampfree_failed_*...
      → KHÔNG ĐỨT: nguồn ghi phong phú, mỗi loại có ngữ cảnh cụ thể.

[2] Phân loại mức độ khẩn (quanlygieo.html:9401-9534 computeStoreHealth)
      🔴 ĐỨT CHUỖI TẠI ĐÂY: alert ghi severity:'danger' lúc tạo
      (allocate_rtdb_error, label_reconcile_anomaly, stampfree_failed_*)
      nhưng computeStoreHealth CHỈ switch theo a.type (dòng 9431-9455),
      KHÔNG đọc severity — loại nào không nằm trong 6 type được đặt tên
      cứng thì rơi hết vào 1 bucket vàng chung "Cảnh báo khác chưa xem",
      kể cả loại đã tự gắn nhãn "danger" lúc ghi. Trường dữ liệu tồn tại
      nhưng bị bỏ qua ở bước quan trọng nhất (xếp hạng ưu tiên).

[3] Đẩy lên UI mặc định (push thật)
      StoreHealth + sidebar dot: renderToday() tự gọi khi mở app
      (quanlygieo.html init) → PUSH đúng nghĩa trong app.
      FIFO bell (posgieo.html:4166-4444): badge luôn hiện trên màn
      order mặc định của POS, poll 2 phút + trigger theo sự kiện →
      PUSH mạnh nhất toàn hệ thống, và là cơ chế DUY NHẤT tự xoá khi
      điều kiện THẬT SỰ được giải quyết (không phải người dùng bấm ẩn).
      → KHÔNG ĐỨT cho 2 cơ chế này.

[4] Các cảnh báo còn lại — chỉ PULL dù đáng lẽ nên PUSH
      🔴 ĐỨT CHUỖI TẠI ĐÂY (nhiều điểm):
      - Stale/ngày-chưa-đóng-sổ ở POS (posgieo.html:14076-14126): chỉ
        hiện khi nhân viên tự mở màn "Ca làm việc" — nhưng comment ở
        bản QUANLY lại ngộ nhận "nhân viên đang thấy cảnh báo trên POS"
        như thể đó là push.
      - Hạn dùng lô BTP (quanlygieo.html:11041-11104): tính đúng, chôn
        trong màn Tài chính → "Vốn nằm trong kho", KHÔNG lọt vào
        computeStoreHealth. Trong khi hạn dùng CHAI/HŨ đã mở lại ĐƯỢC
        push (RED, dòng 9473-9477). Cùng là "hàng đã mở, sắp/đã hết
        hạn", 1 loại được báo chủ động, 1 loại phải tự tìm mới thấy.
      - Bất thường định lượng nguyên liệu (soBatThuong,
        quanlygieo.html:7710-7717): chỉ hiện trong màn đối chiếu riêng.
      - Tồn thấp (low-stock): CHỈ xuất hiện ở QUANLY (nudge banner +
        storeHealth), 0 kết quả grep "lowstock/minStock" cảnh báo nào
        ở posgieo.html — nhân viên bán hàng trực tiếp KHÔNG được báo
        sắp hết nguyên liệu, chỉ chủ quán biết khi mở app quản lý.

[5] Cấu hình Target/KPI (quanlygieo.html:20586-20679, 2900-2950)
      Bản thân việc VERSION target theo effectiveFrom làm ĐÚNG
      (config_history_gieogieo, configForDate()) — không lặp lại bug
      unversioned-input như Recipe/Payroll.
      🔴 ĐỨT CHUỖI TẠI ĐÂY — nhưng ở chỗ khác: computeKPIs()
      (quanlygieo.html:5669-5761) chọn version target theo NGÀY CUỐI
      của cả khoảng báo cáo (dòng 5750: configForDate(ngày cuối)) rồi
      áp DUY NHẤT version đó cho TOÀN BỘ khoảng (vd cả tuần/tháng).
      Nếu target đổi giữa kỳ, các ngày đầu kỳ bị đánh giá lại theo
      target MỚI thay vì target đang hiệu lực lúc đó xảy ra — cùng lớp
      lỗi "input không version hoá làm trôi số liệu lịch sử", đây là
      LẦN THỨ 6 phát hiện độc lập (sau Recipe, Packaging, BTP yield,
      Payroll, COGS chung), chỉ khác: lần này bug nằm ở cách ÁP DỤNG
      version cho 1 khoảng ngày, không phải thiếu version.

[6] Xác nhận/tắt cảnh báo (quanlygieo.html:9631-9637)
      status: new → seen → resolved, cả "Đã xem" lẫn "Đã xử lý" đều
      làm alert biến mất khỏi danh sách push (query where status==new).
      🔴 ĐỨT CHUỖI TẠI ĐÂY (mô hình lỏng): bấm "Đã xem" tắt cảnh báo y
      hệt "Đã xử lý" — hệ thống KHÔNG xác minh vấn đề gốc đã thật sự
      được sửa trước khi ngừng nhắc. Đối lập hẳn với FIFO bell (mục 3)
      — nơi duy nhất tự xoá đúng khi điều kiện thật sự hết.

[7] Kênh gửi ra ngoài app
      GAP — chưa tồn tại: không có push notification hệ điều hành,
      SMS, Zalo/Telegram webhook tự động nào. Toàn bộ cảnh báo chỉ
      tồn tại khi có người thật sự mở 1 trong 2 app.

[8] Mã dead: stockoutTargetPct (quanlygieo.html:2905, 3180-3201)
      Có field mặc định, được lưu lại mỗi lần save config, có 1 điểm
      cộng dồn `stockout` trong sumDailyOps() — nhưng KHÔNG có input UI
      để sửa, KHÔNG có nơi nào ở POS để ghi nhận 1 sự kiện hết hàng,
      KHÔNG có nơi nào đọc lại để so sánh/hiển thị. Toàn bộ đường đi
      chết từ đầu đến cuối — cùng dạng lỗi "tính nhưng không bao giờ
      hiển thị" đã thấy ở báo cáo BTP hằng ngày.
```

---

# LUỒNG CHUẨN CHO HỆ THỐNG MỚI (không phải fix, mà thiết kế lại đúng ngay từ đầu)

1. **1 `AlertEngine` duy nhất, route theo (type, severity), không phải chỉ theo type.** Mọi alert khi tạo ra phải tự mang đủ thông tin để route đúng độ ưu tiên — không có bucket "khác" chung chung nuốt luôn cả alert `danger`. Đây là gap ưu tiên cao vì ảnh hưởng trực tiếp thứ tự chủ quán xử lý sự cố.
2. **PUSH phải nhất quán theo mức độ nghiêm trọng của vấn đề, không theo việc ai code trước.** Hạn dùng BTP phải push giống hạn dùng chai/hũ đã mở (cùng là rủi ro an toàn thực phẩm + tiền vốn "đọng"); tồn thấp phải push được ở CẢ POS lẫn QUANLY (nhân viên bán hàng cần biết sắp hết để báo khách/chủ, không chỉ chủ quán mới thấy).
3. **Mô hình xác nhận cảnh báo mặc định nên theo pattern FIFO bell (tự xoá khi điều kiện thật sự hết)** cho mọi loại có thể kiểm chứng được bằng dữ liệu (vd sai lệch đã được duyệt điều chỉnh, container đã xử lý). Với loại không thể tự kiểm chứng (vd "đã trao đổi với khách"), giữ 2 trạng thái tách biệt rõ: "đã xem" (không tắt push) và "đã xử lý, xác nhận có tham chiếu" (yêu cầu link tới hành động sửa — vd `referenceId` trỏ về `ReviseState`/`ReverseTransaction` đã thực hiện).
4. **KPI/Target evaluation phải resolve version theo TỪNG NGÀY trong khoảng, không theo ngày cuối kỳ áp cho cả khoảng** — `ComputeKPIs(dateRange)` phải gọi `configForDate(day)` cho mỗi `day` riêng lẻ rồi mới tổng hợp, đúng nguyên tắc versioning đã khẳng định 5 lần trước, giờ là bằng chứng thứ 6 cho cùng 1 nguyên tắc kiến trúc (không phải 6 bug rời rạc).
5. **Không xây field/khái niệm nào không có cả đường ghi lẫn đường đọc.** `stockoutTargetPct` là ví dụ rõ nhất: nếu tính năng "báo hết hàng" cần tồn tại, cắt bỏ config chết này và thiết kế lại đủ 3 chân (ghi sự kiện ở POS → lưu → hiển thị so target) hoặc bỏ hẳn khỏi hệ thống mới, không giữ nửa vời.
6. **Kênh gửi ngoài app là chỗ nối sẵn, không bắt buộc dựng ngay** — `AlertEngine` nên phát domain event (`AlertRaised`) mà 1 handler ngoài (push/SMS/Zalo) có thể đăng ký sau, đúng nguyên tắc side-effect tách biệt đã áp dụng cho Reversal/Correction.
