# Quản lý POS The Cafe 33 trên PC — 19/10/2026

Phạm vi chủ dự án xác nhận: toàn bộ nhóm quản lý thường xuyên trong `pos.html`, không chỉ form Menu. Giữ Gấu Noel và Lì xì Tết theo mùa.

## Bố cục theo từng công việc

| Nhóm | Danh sách | Nội dung chỉnh sửa |
|---|---|---|
| Menu | Thẻ riêng có tên đầy đủ, nhóm, giá M/L, dấu chọn; tìm không dấu và lọc nhóm | Hai cột tên/nhóm, giá M/L, hàng màu, nút lưu hiện trên PC; thứ tự Tab tự nhiên |
| Quà tặng | Tìm tên/mã, thẻ trạng thái/quyền lợi/phạm vi, dấu chọn | Hai widget thông tin và quyền lợi; ảnh/mô tả và giới hạn có thể mở khi cần, giữ đủ giá trị và điều kiện |
| Màn hình phụ | Slide có số thứ tự, thời lượng, URL, dấu chọn và nhãn nút lên/xoá | URL và thời lượng cạnh nhau, xem trước ngay dưới, hành động cập nhật/lưu sẵn có |
| Tem in | Dùng trọn vùng làm việc | Xem trước bên trái, logo/footer/cỡ chữ bên phải, lưu và in thử dễ thấy |
| Máy in | Kết nối/trạng thái/log riêng | Ảnh và bản xem trước cạnh nhau; các thông số căn in thành lưới, nút in tách khỏi vùng cuộn |

CSS mới chỉ áp qua `mgr-standard-panel` và các lớp con của đúng năm nhóm. Không thay các pane mùa, không đổi tệp JS của Gấu Noel/Lì xì.

## Dữ liệu và tương tác

- Menu vẫn đọc cùng nguồn/lượt `menu`, dùng nguyên khoá gốc (kể cả khoá mảng `idx_*`). Sắp thứ tự hiển thị không đổi khoá lưu.
- Tìm/lọc Menu và Quà chạy trên DOM đã tải, không đọc Firebase. Nạp lại danh sách giữ tiêu chí tìm/lọc còn hợp lệ.
- Chọn thẻ bằng chuột, Enter hoặc Space; `aria-pressed` đồng bộ với món/quà/slide đang sửa. Tên và URL được chèn bằng text tại các renderer vừa sửa.
- 11 hàm lưu/xoá/in của món/quà/slide/tem/máy in được đối chiếu giữ nguyên mã. Các ID và callback của trường điều kiện quà giữ nguyên.
- Bấm Thêm slide đặt lại trạng thái sửa, URL và thời lượng mặc định để nhập slide mới; chưa lưu Firebase cho đến hành động lưu hiện có.
- Nút in vẫn khoá trước khi đủ điều kiện. Không kết nối máy in hoặc ghi dữ liệu vận hành thật trong lượt này.

## Kiểm tra và phân phối

Chromium với Firebase giả: danh sách 34 món, tìm/lọc kết hợp, chọn đúng bản ghi, giá M/L, lưu đúng khoá gốc; quà theo loại/điều kiện; chọn slide; điều khiển nằm cạnh preview; không lỗi JS. Độ rộng 1024/1366/1920 và kiểm tra cơ bản điện thoại 390.

So sánh kích thước, vị trí và style của Gấu Noel + Lì xì với HTML trước thay đổi trên 1280×720: giống nhau. Chạy lại test nhập món trên màn PC thấp và kiểm tra hồi quy toàn bộ; sinh bộ deploy thường/Tết/Giáng sinh. Chưa deploy Hosting.
