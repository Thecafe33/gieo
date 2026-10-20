# Tổng quan manage: trạng thái đóng quán Gieo — 20/10/2026

Khi kỳ Tổng quan có hôm nay, mỗi điểm Gieo đang hiển thị nghe đúng doc `daily_closings_gieogieo[__storeId]/{hôm nay}`. Chỉ status `closed` hiện nhãn **Đã đóng quán** và làm dịu màu widget. Tooltip ghi rõ hôm nay để phân biệt với doanh thu tuần/tháng. Trạng thái giao tiền/giao ca chưa coi là đóng quán. Mở lại tự bỏ nhãn và phục hồi màu.

Tách biệt với lịch nghỉ `offDays`, không sửa mục tiêu/doanh thu/thu chi. Không làm mờ toàn bộ chữ hay vô hiệu hóa nút chi tiết. TC33/XOFA giữ nguyên.

Tối ưu: chỉ một listener mỗi điểm Gieo đang xem; render lại không đọc lại. Đổi scope, rời Tổng quan, kỳ không có hôm nay thì unsubscribe. Qua ngày chuyển đúng doc mới; timer không thực hiện get/poll dữ liệu. Callback cũ sau đổi scope không được cập nhật UI. Lỗi đọc không suy đoán đã đóng.

Kiểm tra: `tests/manage_day_closed.test.js` (status, scope/ngày, callback, số listener); `tools/ql_giao_dien/e2e_manage_closed.js` (Chromium 1366px/390px với Firebase giả: đóng/mở lại đúng điểm, giữ nguyên số liệu, render lại, gỡ listener). Bộ sinh và test toàn dự án đạt. Chưa deploy Hosting, không ghi Firebase thật.

Tải `tai_ve/manage_dong_quan_20-10.zip`: chỉ manage.html, dùng chung ba mùa.

## Sửa lỗi mất trạng thái sau cập nhật widget (bản v2)

Bản đầu chỉ gắn nhãn/class vào DOM sau khi listener đóng ngày trả về. `bfStatsPaint` dựng lại widget từ `dashboard` để cập nhật doanh thu và thay DOM, nhưng `storeCard` chưa đưa trạng thái đóng ngày vào HTML. Vì vậy quán đã đóng có thể mất nhãn/màu ngay sau tải/cập nhật số liệu; bộ nhớ vẫn có `closed: true`. Đã tái hiện bằng test trước sửa.

Bản v2 dùng trạng thái RAM ngay trong `storeCard`, nên cả dựng trang và cập nhật riêng điểm bán đều giữ nhãn/màu. Không thêm listener, truy vấn hoặc timer. Test trình duyệt bổ sung: quán đóng sẵn khi mở trang, `bfStatsPaint(gg01)` sau đóng, giữ số lượt đọc/subscription, mở lại. Đạt ở 1366px và 390px.

ZIP thay thế: `tai_ve/manage_dong_ca_v2_20-10.zip` chỉ manage.html, dùng chung ba mùa. Chưa deploy Hosting.
