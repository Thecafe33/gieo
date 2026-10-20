# XOFA — Danh sách ly tặng chung (20/10/2026)

Phạm vi: PosX.html và các bản sinh theo mùa. Chưa deploy Hosting, không ghi Firebase thật trong quá trình sửa/test.

## Cách dùng

Vào Cài đặt To Go → Chương trình Tặng quà → Danh sách ly tặng chung. Tích từng món được phép tặng; lựa chọn tự lưu theo cơ chế cấu hình hiện có. Danh sách lấy từ menu To Go (nếu chưa có thì menu chính), chỉ món có Size M giá dương. Mua X tặng Y giữ quy tắc Size M hiện tại; đổi 6 tem dùng cùng danh sách Size M.

Cấu hình nằm trong `togo_config_xolifa/gift/itemIds`, dùng listener cấu hình sẵn có. Cấu hình cũ chưa có danh sách hoặc danh sách rỗng không cho tặng tự do; cần chủ quán chọn món sau cập nhật. Nhóm món cũ không tự chuyển thành danh sách cho phép. Công tắc Mua X tặng Y không tắt quyền đổi tem.

Khi bấm thanh toán, nếu khách đã được nhận diện có quyền đổi tem và chưa áp quà khác, mở popup chọn ly. Nút Đổi ngay cũng dùng popup này, không cần thêm món vào giỏ trước. Kiểm tra quyền đổi bằng một lượt đọc khách theo cơ chế cũ; không đọc theo mỗi lần chọn món. Chọn/bỏ quà chưa trừ tem. Tem được xử lý bởi luồng sau ghi bill hiện có.

Mua X tặng Y mở cùng popup khi đủ số ly. Trần giá (nếu bật) chỉ áp dụng cho quà mua X tặng Y. Từ chối đổi tem vẫn tiếp tục xét quà mua X tặng Y. Từ chối cả hai vẫn thanh toán bình thường.

Kiểm tra lại món, Size M, số lượng, quyền lợi và khách trước xác nhận quà / ghi bill. Quà mua X tự giảm/gỡ khi giảm ly mua. Cấu hình thay đổi khiến quà tem không còn hợp lệ thì yêu cầu gỡ/chọn lại trước ghi bill, không âm thầm ghi miễn phí món ngoài danh sách. Không thay cấu trúc khách dùng chung, không đổi luồng khuyến mãi mùa vụ.

## Kiểm tra

- `node tests/xofa_shared_gifts.test.js`: danh sách chung, cấu hình cũ/rỗng, trần giá, số lượng, thay đổi giỏ/config, kiểm tra trước ghi bill.
- `tools/xofa_gifts/e2e.js`: trình duyệt với Firebase bộ nhớ; popup, chọn món, đổi khách/config, giảm số lượng, từ chối quà, ghi bill tiền mặt/chuyển khoản, trừ 6 tem sau ghi bill; PC và mobile.
- `tools/tet/e2e/lx_posx_full.js`: 34 kiểm tra lì xì XOFA; không lỗi.
- `sh tools/sinh_lai_tat_ca.sh`: sinh đủ bản và bộ kiểm tra toàn dự án.

Chỉ cần thay PosX.html của mùa tương ứng. Ba ZIP trong tai_ve/xofa_ly_tang_{thuong,giangsinh,tet}_20-10.zip, mỗi ZIP đúng một file.
