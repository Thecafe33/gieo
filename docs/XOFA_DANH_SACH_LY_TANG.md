# XOFA — Danh sách ly tặng chung (20/10/2026)

Phạm vi: PosX.html, kiosk.html và các bản sinh theo mùa. Chưa deploy Hosting, không ghi Firebase thật trong quá trình sửa/test.

## Cách dùng

Vào Cài đặt To Go → Chương trình Tặng quà → Danh sách ly tặng chung. Tích từng món được phép tặng; lựa chọn tự lưu theo cơ chế cấu hình hiện có. Danh sách lấy từ menu To Go (nếu chưa có thì menu chính), chỉ món có Size M giá dương. Mua X tặng Y giữ quy tắc Size M hiện tại; đổi 6 tem dùng cùng danh sách Size M.

Cấu hình nằm trong `togo_config_xolifa/gift/itemIds`, dùng listener cấu hình sẵn có. Cấu hình cũ chưa có danh sách hoặc danh sách rỗng không cho tặng tự do; cần chủ quán chọn món sau cập nhật. Nhóm món cũ không tự chuyển thành danh sách cho phép. Công tắc Mua X tặng Y không tắt quyền đổi tem.

Luồng 6 tem: order → vào màn thanh toán / nhập SĐT → thẻ khách hiện quyền nhận quà → nhân viên bấm **Đổi ly** → popup chọn món từ danh sách chung → xác nhận thêm một ly giá 0. Không tự mở popup tem khi bấm thanh toán. Kiểm tra quyền bằng một lượt đọc khách khi bấm Đổi ly; không đọc theo mỗi lần chọn món. Chọn/bỏ quà chưa trừ tem. Tem được xử lý bởi luồng sau ghi bill hiện có.

Luồng Mua X tặng Y: order đủ số ly đúng điều kiện → bấm Thanh toán → mở popup chọn đủ Y ly theo số bộ → xác nhận thêm quà rồi tiếp tục thanh toán. Không cần SĐT để xét chương trình này. Trần giá (nếu bật) chỉ áp dụng cho quà mua X tặng Y. Bỏ qua quà vẫn thanh toán bình thường. Đây là các điểm mở popup đã đối chiếu từ posgieo; giữ quy tắc số lượng / bỏ qua quà hiện có của XOFA.

Kiosk: dùng `session_display_xolifa` hiện có, không listener hoặc truy vấn mới. Khi popup mở, POS gửi state `gift_selection` cùng tên món/size/số lượng đã chọn; kiosk chỉ hiển thị, nhân viên chọn trên POS. Chọn / bớt quà được gộp theo bộ đệm ghi 120ms đang dùng. Xác nhận / bỏ qua trở về giỏ; QR / hoàn thành / idle / session null đóng popup. Danh sách dài tự chuyển từng trang 6 món tại kiosk, không đọc Firebase; ly vừa chọn được đưa vào trang đang xem. Ly đổi tem sau xác nhận xuất hiện trong giỏ kiosk với nhãn rõ. Không gửi SĐT hay dữ liệu khách trong payload popup.

Kiểm tra lại món, Size M, số lượng, quyền lợi và khách trước xác nhận quà / ghi bill. Quà mua X tự giảm/gỡ khi giảm ly mua. Cấu hình thay đổi khiến quà tem không còn hợp lệ thì yêu cầu gỡ/chọn lại trước ghi bill, không âm thầm ghi miễn phí món ngoài danh sách. Không thay cấu trúc khách dùng chung, không đổi luồng khuyến mãi mùa vụ.

## Kiểm tra

- `node tests/xofa_shared_gifts.test.js`: danh sách chung, cấu hình cũ/rỗng, trần giá, số lượng, thay đổi giỏ/config, kiểm tra trước ghi bill.
- `tools/xofa_gifts/e2e.js`: trình duyệt với Firebase bộ nhớ; popup, chọn món, đổi khách/config, giảm số lượng, từ chối quà, ghi bill tiền mặt/chuyển khoản, trừ 6 tem sau ghi bill; PC và mobile.
- `tools/xofa_gifts/kiosk_e2e.js`: hai màn POS/kiosk, payload thực từ POS tới listener kiosk giả, lựa chọn/đóng popup, quà hiện trong giỏ và phân trang.
- `tools/tet/e2e/lx_posx_full.js`: 34 kiểm tra lì xì XOFA; không lỗi.
- `sh tools/sinh_lai_tat_ca.sh`: sinh đủ bản và bộ kiểm tra toàn dự án.

Bản mới nhất: thay **cả PosX.html và kiosk.html** của mùa tương ứng; tải lại cả màn POS và kiosk. Ba ZIP `tai_ve/xofa_kiosk_ly_tang_{thuong,giangsinh,tet}_20-10.zip`, mỗi ZIP đúng hai file. Bộ `xofa_ly_tang_*` trước đó chỉ có POS, đã được thay thế bởi bộ này.
