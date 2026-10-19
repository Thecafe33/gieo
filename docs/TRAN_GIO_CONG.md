# Trần giờ trả lương — 19/10/2026

Chủ dự án chốt áp dụng từ 01/10/2026, cho manage và quanlygieo.

- Giữ nguyên giờ check-in/out thực tế. Giờ trả lương = phần giao giữa ca thực tế và lịch được xếp của đúng nhân viên, ngày, điểm bán.
- Ví dụ lịch 09:30–20:00, thực tế 09:20–20:15: trả 10,5 giờ; 8 giờ × 20.000 + 2,5 giờ OT × 25.000 = 222.500đ.
- Đến trễ/về sớm chỉ tính phần thực làm trong lịch. Ngày xếp nghỉ trả 0 giờ. Ca qua đêm được hỗ trợ. Ca treo ngày cũ vẫn phải bổ sung giờ ra như trước.
- Có chấm công mà thiếu lịch hoặc lịch thiếu giờ: báo cần bổ sung, không lấy giờ thực tế thay thế, không chốt lương bằng 0. Lương cứng giữ quy tắc hiện có; đây là giới hạn giờ cho lương theo giờ.
- Trước 01/10 giữ công thức cũ. Lương OT dựa trên giờ trả lương sau giới hạn.

## Tích hợp và lượt đọc

Bảng chấm công hiện cả giờ thực tế và giờ trả lương. Bộ tính lương, tổng kết tháng, lãi/lỗ và thu hồi vốn Gieo dùng cùng phép tính. manage nạp lai_lo.v5.js sinh từ quanlygieo; v4 giữ nguyên cho bản cũ.

Chỉ đọc lịch trong khoảng ngày/tháng đang tính, không đọc từng nhân viên/ngày. quanlygieo gộp các truy vấn lịch cùng quán/cùng khoảng đang chạy. Màn chấm công dùng lịch đã đọc sẵn. Sửa lịch Gieo ghi dấu ngày cần tính lại cùng batch, không cần đọc thêm để tìm ngày. manage bỏ đệm lương/xem tạm tính khi sửa lịch.

Snapshot lương có laborVersion=2. Ngày từ 01/10 thuộc kỳ yêu cầu dùng snapshot cũ được chọn tính lại theo giới hạn khoảng hiện hành; snapshot đã sửa dùng lại. Thiếu lịch không ghi số 0 đè sổ cũ; manage ẩn kết quả tài chính chưa hợp lệ và nêu lý do. Không tự sửa sổ tháng đã chốt; muốn thay phải mở lại/chốt lại theo quy trình hiện có.

Chưa ghi dữ liệu Firebase thật hoặc deploy Hosting. Sau khi cập nhật app, cần bổ sung lịch còn thiếu trong tháng 10 để báo cáo tính được đầy đủ.

## Kiểm tra

`tests/tran_gio_cong.test.js`: biên giờ, OT, ngày hiệu lực, nghỉ, thiếu lịch, ca qua đêm, ca đang chạy, snapshot cũ.
`tools/ql_giao_dien/e2e_tran_gio_cong.js`: loader thật trong Chromium với Firebase giả, cả hai app trả 222.500đ và chặn khi xoá lịch; giữ giờ thực tế.
