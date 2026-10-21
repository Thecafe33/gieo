# XOFA — khôi phục mở Ca làm việc (21/10/2026)

Chủ quán báo không mở được Ca làm việc sau cập nhật PosX. Khi đủ file, bản gốc mở bình thường ở PC và mobile. Gói cập nhật XOFA trước đó chỉ gồm HTML (hoặc HTML và kiosk), trong khi PosX nạp module riêng `cham_cong.v4.js`. Thiếu/lỗi tải module tạo `ReferenceError: ChamCong is not defined` ở khởi tạo và khi bấm nút. Đã tái hiện bằng Chromium với phản hồi 404 cho module; chưa xác minh file trên Hosting thật do môi trường chặn kết nối tới domain Hosting.

## Sửa

- Khởi tạo ChamCong chỉ sau khi module đã tải, không để lỗi module làm phát sinh ReferenceError ngay khi mở POS.
- Nút sidebar gọi `openXofaShift`: có module thì mở ngay; module chưa tải thì chỉ tải lại khi bấm. Dùng URL có tham số chống cache 404, gộp các lần bấm đang chờ; panel đã mở thì không mở/đăng ký lại.
- Lỗi tải kéo dài/hết thời gian chờ: báo rõ và cho bấm thử lại, không để nút im lặng hoặc khoá bán hàng.
- Không sửa module immutable v4, không đổi cách chấm công/lương/chi phí hoặc người dùng. Không thêm listener Firestore; mở tab vẫn dùng cơ chế cũ, tải lại JavaScript chỉ theo thao tác bấm khi file thiếu/lỗi tải.
- Bộ bàn giao bắt buộc gồm **PosX.html + cham_cong.v4.js**, để cùng thư mục Hosting. Dù module không thay đổi, gửi kèm để gói có đủ phần phụ thuộc.

## Kiểm tra

`tools/xofa_shift/e2e.js` dùng Firebase bộ nhớ, chạy 1366px/390px với ba tình huống: đầy đủ module; module lỗi ban đầu rồi hồi phục; tiếp tục lỗi khi bấm (hiện thông báo) rồi hồi phục ở lần bấm sau. Kiểm panel, PIN, Chi phí, đóng/mở lại, không tải module trùng và không lỗi JavaScript. Bộ thử trước sửa lưu bằng chứng ReferenceError.

`tools/xofa_gifts/e2e.js` giữ luồng chọn quà, ghi bill và trừ tem đúng sau ghi bill. Sinh lại đầy đủ bản thường/Giáng sinh/Tết bằng `sh tools/sinh_lai_tat_ca.sh` và bộ test toàn dự án.

Chưa deploy Hosting; không ghi Firebase thật. ZIP chỉ hai file cho từng mùa: `tai_ve/xofa_ca_lam_viec_{thuong,giangsinh,tet}_21-10.zip`.
