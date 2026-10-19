# Giữ đơn vị thực nhập và đơn vị kiểm kê — 19/10/2026

## Bằng chứng và giới hạn

Chủ quán xác nhận: đã chọn nhận tự do **6 Bịch trân châu trắng** nhưng nhận cuối sinh **36 mã Bịch**. Ảnh phiếu ngày 19/10 cho thấy đã ghi 72.000g, chủ quán đã sửa xuống 12.000g và huỷ 30 mã, còn 6 mã sống. Không sửa dữ liệu thật trong phiên này.

Cấu hình trong bản xuất trước đó: Bịch = 2.000g, Thùng = 12.000g, đơn vị kiểm kê/dán mã là Bịch. Khi lượng đưa vào engine là 72.000g, engine chia 2.000 và sinh đúng 36 mã; lỗi phải tìm trước bước này. Không có bằng chứng engine nhân thêm hệ số 6.

Tái hiện trên mã trước bản vá (`4cf474a`): chọn Bịch, nhập 6, mở chọn nguyên liệu và chọn lại chính trân châu trắng -> `poReceiveLineChangeItem` giữ số 6 nhưng tự reset `unitFactor` về bao bì lớn nhất (12.000) -> nhận 72.000g, sinh 36 mã. Đây là nhánh thực thi gây đúng kết quả được báo; chưa có nhật ký thao tác của máy quầy để xác nhận nhân viên đã đi qua nhánh đó.

Bản vá đầu `dbf44cd` đã đi sai trọng tâm khi đổi mặc định sang đơn vị đếm. Bản tiếp theo trả mặc định lúc thêm mới về như cũ, tập trung giữ lựa chọn đã nhập, không ép mọi nguyên liệu về Bịch.

## Nhận hàng POS

- Chọn lại CÙNG nguyên liệu giữ nguyên đơn vị, số lượng và ghi chú. Đổi sang nguyên liệu khác xoá số cũ, tránh mang số của món trước sang món sau.
- Chụp dòng hàng và quy cách trước bước `await` đầu tiên. Khoá thao tác sửa form khi đang nhận; mở lại cả khi PIN/ca không hợp lệ hoặc lỗi. Dùng cùng snapshot nguyên liệu cho kiểm số mã và tạo mã, không đọc lại quy cách từ cache giữa chừng.
- Nhãn số nhập ghi đúng đơn vị đang chọn; xem trước lượng nền và số mã NL. Đổi đơn vị có chủ ý phải nhập lại số. Giữ quy cách đơn đặt và cảnh báo nhận vượt đơn.
- Phiếu mới lưu `receiveUnitName`, `receiveUnitFactor`, `qtyGoodReceived`, `qtyDamagedReceived` bên cạnh lượng nền. Lượng này là số gốc nhân viên nhập, không suy ngược từ danh mục.
- Không đổi engine v18, ID chống retry hoặc cấu trúc bảng. Không thêm truy vấn Firebase.

## Sửa phiếu nhận — quy tắc chủ quán chốt

1. **Có QR theo từng đơn vị:** số chính và ô nhập dùng đơn vị kiểm kê trên chính mã/tem của lần nhận. Ví dụ 6 Bịch; 3 Chai 340ml thì nhập số chai, tự quy đổi, không chia tay. Giữ quy cách tem cũ nếu danh mục đổi; QR đơn vị nhập số mã nguyên.
2. **Không QR theo từng đơn vị:** dùng đúng đơn vị người nhận đã chọn trên phiếu. Cùng nguyên liệu, phiếu nhập Chai hiện Chai, phiếu nhập Thùng hiện Thùng, không lấy `countUnitName` hay bao bì lớn/nhỏ nhất làm mặc định thay thế. Tem cả lô không đồng nghĩa mỗi tem là một Chai/Hộp.
3. Phiếu cũ không lưu đơn vị nhập không đủ bằng chứng để khôi phục: hiện thiếu đơn vị và yêu cầu chọn rõ trước khi sửa. Không tự đoán. g/ml giữ làm số đối chiếu phụ; sổ kho/engine vẫn lưu lượng nền.

Danh sách chọn dòng, bước nhập, xem trước, xác nhận và lịch sử sửa đều thể hiện đơn vị này. Không sửa công thức COGS hoặc lãi/lỗ.

## Kiểm chứng

- `tests/nhan_hang_don_vi.test.js`: hàm POS và engine thật trên Firebase giả nghiêm. Kiểm chọn Bịch/Chai/Lon rồi chọn lại cùng món, nhận đúng số mã; snapshot trước await; khoá/mở form; không QR lưu đúng đơn vị Chai dù cấu hình kiểm kê Thùng; hỏng, giao dư, retry không cộng đúp.
- `tests/sua_phieu_don_vi.test.js`: QR dùng đơn vị mã, không QR dùng phiếu; 340ml/Chai; danh mục đổi; hệ số 1 và dưới 1; phiếu cũ thiếu metadata không tự đoán; lịch sử 36 -> 6 Bịch. Kiểm dữ liệu gửi engine vẫn là lượng nền.
- Browser fixture dùng CSS/hàm thật, chặn toàn bộ mạng; không kiểm trên APK thật hoặc máy đã gặp sự cố.
- Bắt buộc sinh `_thu`/ba bộ deploy, chạy bộ test đầy đủ và kiểm ranh giới/đường dẫn. Chủ quán tự deploy Hosting.

Kết quả 19/10: bộ test đầy đủ `TẤT CẢ ĐẠT`; Chromium đạt 80 kiểm tra ở PC/tablet/mobile, gồm chọn lại cùng nguyên liệu và ba bước sửa phiếu QR/không QR; ranh giới engine/đường dẫn sạch.
