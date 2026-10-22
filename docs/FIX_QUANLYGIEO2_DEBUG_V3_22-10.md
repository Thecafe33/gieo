# Vá 5 lỗi debug quanlygieo2 — v3, 22/10/2026

Đối chiếu [báo cáo trước sửa](QUANLYGIEO2_DEBUG_CHUYEN_SAU_22-10.md) của release 46c4a8f. Chưa deploy Hosting/Functions hoặc ghi Firebase production.

## Kết quả sửa

| Lỗi | Thay đổi |
|---|---|
| Caller cũ truyền mảng bị hiểu là Xem bản lưu | `renderAlertInbox` chỉ nhận lệnh bản lưu khi tham số đúng `true`; mảng cũ truyền xuống renderer gốc để tái sử dụng dữ liệu |
| Lượt hết lease ghi lỗi trở lại | Job và trạng thái lỗi được ghi trong cùng transaction, kiểm token trước mọi ghi thành công/lỗi; bỏ lượt ghi lỗi ngoài hàng rào trong trigger |
| Một job thành công che job khác lỗi | Mỗi nguồn/job có document lỗi riêng dưới `_automation/errors`; summary giữ `sourceErrorCount`, chỉ giảm khi nguồn đó phục hồi; đếm không tăng đúp khi retry |
| Cờ needsReview BTP không tạo sự kiện | Chính sách v3 theo dõi cờ ở cả chiều bật/tắt; thay qtyRemaining thông thường vẫn không tạo job |
| Popup tem không hoàn tất tác vụ được | Riêng quanlygieo2 bổ sung nút Xác nhận đã xem qua `UnitEngine.containers.annotate`, giữ tồn kho và nghiệp vụ hủy; khóa bấm lặp, hiển thị lỗi nếu chưa lưu được |

Giữ nguyên Engine v20, data_access v9, quanlygieo gốc và các bản automation v1/v2 immutable. `quanlygieo2.html` vẫn sinh từ trang gốc; điểm mở rộng ở tool UI, không nhân bản hệ thống. POS chỉ đổi module công việc sang v3 để kiểm bộ đếm cùng phiên bản, không đổi bán hàng.

## Lỗi nguồn, nâng dữ liệu và lượt đọc

- Lỗi enqueue nguồn và lỗi xử lý job đều theo cùng cơ chế đếm. Trigger job không tự ghi lỗi root ngoài transaction nữa. Đổi token thì kết quả cũ bị bỏ qua.
- Đọc error document của nguồn trong enqueue thêm một lượt đọc cho mỗi sự kiện **đã qua bộ lọc relevant**. Không thêm đọc vào mỗi bill/thêm món/thanh toán. Nhánh kết thúc job bình thường dùng một đọc error document thay lượt đọc root trước đây; chỉ khi đang phục hồi lỗi mới đọc thêm root và cập nhật bộ đếm.
- Tăng/giảm bộ đếm trong transaction dựa trên trạng thái active trước đó; không query toàn bộ lỗi mỗi lần mở hộp thư. Thông điệp tổng quát vẫn hiện khi nguồn lỗi cuối được hiển thị đã phục hồi nhưng các nguồn khác còn lỗi.
- Chỉ khi summary có lỗi, nhịp nền mới lấy tối đa 30 lỗi enqueue còn active để thử lại đúng nguồn. Việc này khôi phục cả trường hợp đã tắt rồi bật tự động hoặc chứng từ đã xóa, không cần đợi một sự kiện mới; lỗi xử lý job không bị đếm thêm thành lỗi enqueue. Bình thường không có truy vấn bổ sung này.
- Khi nâng worker, đọc các job legacy một lần theo ID, tối đa 100 job/nhịp, cursor bền. Chỉ nhập lỗi của job vẫn dirty và có lastError sau khi đọc lại trong transaction. Lỗi root cũ trỏ vào job đã hoàn tất được loại khỏi kết luận sau đối chiếu; lỗi enqueue cũ được thử lại đúng nguồn. Giữ một bản legacy khi lỗi mới đến trước lượt nâng.
- Summary chưa xác nhận theo v3 thì UI giữ cảnh báo gốc. Các error document lưu active=false sau phục hồi để bảo toàn lịch sử trạng thái; không nằm trong bộ đếm lỗi đang mở.
- Bootstrap nguồn một lần theo phiên bản vẫn dùng cơ chế có sẵn; không quét bill. Không thêm listener, không tự duyệt chi/trừ lương/ghi hao hụt.

## Kiểm chứng

```sh
node tools/automation/audit_faults_46c4a8f.js --verify-fix --json
node tests/gieo_automation_errors.test.js
node tests/gieo_automation_review.test.js
node tests/gieo_automation_queue.test.js
node tests/gieo_automation_bootstrap.test.js
node tools/automation/role_full_e2e.js
node tools/automation/review_e2e.js
node tools/automation/e2e.js
node tools/automation/e2e_shift_work.js
sh tools/sinh_lai_tat_ca.sh
```

Bằng chứng sau sửa: [QUANLYGIEO2_FAULT_FIX_V3.json](QUANLYGIEO2_FAULT_FIX_V3.json). Tám phép kiểm của bộ tái hiện đều phải PASS (hai phép là hai biểu hiện của cùng lỗi lease; hai phép đối chứng).

Node kiểm lỗi lặp, hai lỗi đồng thời, lượt lease cũ trả lỗi/thành công, lỗi enqueue, tách quán, nâng 230 job có cursor và không đọc lại, giữ lỗi nguồn legacy. Transaction giả chặn đọc-sau-ghi như Firestore thật. E2E chạy HTML thật và JS chung trên PC 1366/điện thoại 390, bấm xác nhận tem qua Engine rồi kiểm needsReview=false và unitBase không đổi; duyệt chi bằng luồng gốc. Không dùng Firebase production; số billing thật chưa đo.

## Cập nhật

Gói Hosting đúng mùa chỉ có bốn file thay đổi: `posgieo.html`, `quanlygieo2.html`, `gieo_automation.v3.js`, `gieo_automation_pos.v3.js`. Áp lên bản nền quanlygieo2/Engine v20 đã gửi trước; giữ các JS cũ.

Cập nhật cả `functions/automation` bằng gói chạy nền v3. Indexes không thêm loại truy vấn mới; tool đã trỏ chính sách v3. Sau triển khai bắt đầu/giữ chế độ Đối chiếu thử, đối chiếu nguồn thật trước khi bật xử lý thật. Không cần xóa snapshot, job, bộ đếm hoặc dữ liệu cũ bằng tay.
