# Thu hồi vốn — sửa lương ngày cũ, 18/10/2026

## Nguyên nhân

`computeActualLaborCostByDate` trước đây trả bản đồ thưa: không có ca/lương cứng thì có thể không có khoá ngày. `computeDayPL` hiểu khoá thiếu là chưa có số thực tế và dùng ngân sách lương tháng. Khi dữ liệu nhân viên thay đổi, một ngày cũ từng có lương 0 có thể bị tính lại thành lương dự toán. Bản tóm tắt mới ghi đè lịch sử, khiến luỹ kế giảm dù không có chi phí lương mới. Lỗi đọc chấm công cũng từng bị đổi thành `null`, dẫn đến cùng đường dự toán.

## Cách sửa

- Chỉ sau khi đọc thành công nhân viên và chấm công, khởi tạo 0 cho các ngày đã qua chưa có khoản lương. Tiếp tục cộng lương giờ/lương cứng theo cơ chế cũ. Hôm nay vẫn giữ dự toán khi chưa có số thật.
- Không nuốt lỗi đọc lương trong `computeDailyPLRange`: không tạo hoặc ghi đè bản tổng hợp khi nguồn này lỗi.
- `plNgayLuongCanTinhLai` chọn các ngày đã qua có `mucTinCay: dang-chay` chưa có dấu tính lương mới, hoặc số lương không khớp dấu đã kiểm. `plNgayTuSo` và manage `plNeedDays` gộp chúng với quy tắc thiếu/cũ/dirty hiện có. Tính theo đoạn liền nhau, trong khoảng đang đọc; manage giữ giới hạn 62 ngày. Không quét lại toàn bộ lịch sử mỗi lần mở app.
- `plTomTatNgay` ghi thêm `laborVersion`, `laborCheckedAmount`, `luongNguon`, `luongLaDuDoan`. Số tiền đã kiểm giúp phát hiện HTML cũ deep-merge lương sai lên bản đã sửa mà vẫn để lại phiên bản mới. Ngày đã sửa không tự tính lại lần nữa nếu không có thay đổi khác.
- manage nạp `lai_lo.v3.js`, sinh bằng `node tools/tao_lai_lo.js`. Giữ nguyên v1/v2 immutable; tool deploy giữ đủ các bản đã phát hành.

Không đổi `thvTienNgay`/`thvCompute`: thu hồi bằng lãi cộng khấu hao, cộng dồn cả khoản âm thực tế. Đây không phải cơ chế ép luỹ kế chỉ tăng. Không thêm lượt đọc RT cho mỗi bill; tính realtime tiếp tục dùng ngữ cảnh đã nạp.

## Kiểm tra và giao file

`tests/thu_hoi_von_luong.test.js` kiểm ngày không hoạt động, lỗi đọc, dự toán hôm nay, luỹ kế/lỗ thật, sửa đúng đoạn và không lặp. `tests/lai_lo.test.js` kiểm cả bộ sinh v3 và lỗi nguồn lương. Chạy thêm toàn bộ unit, E2E bill realtime/nhân sự, cú pháp, inventory, boundaries, paths và predeploy cho ba bộ.

Kết quả: 89 file unit đạt; Chromium bill realtime 207/207, nhân sự 76/76; cú pháp, inventory, boundaries, paths, bản sinh khớp và predeploy ba mùa đạt. Chưa deploy Hosting.

Gói cập nhật chỉ gồm `quanlygieo.html`, `quanlygieo_thu.html`, `manage.html`, `lai_lo.v3.js`, lấy từ `ban_deploy/giangsinh/`. Chủ dự án tự deploy rồi tải lại cả hai app để tránh HTML cũ tiếp tục dùng bộ tính trước. Lịch sử bị ảnh hưởng được app mới tính lại khi nạp thu hồi vốn; không sửa trực tiếp số tiền trên Firebase trong quá trình kiểm tra.
