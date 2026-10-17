# Bill và tổng hợp realtime — 17/10/2026

Nhánh `Phan-tach-unit-engine`. Phạm vi yêu cầu: manage Bill chung, tooltip doanh thu giờ, cập nhật chỉ số khi RT có bill trong hai app.

## Giao diện

- manage: Xem thêm cạnh Trực tiếp ở đầu widget; mở popup cùng widget (tối đa 80 bill gần nhất đang giữ), không kéo dài dashboard. Header widget nằm cố định khi cuộn popup.
- Chi tiết từng bill mở ngay trong hàng, ở cả dashboard lẫn popup. Trạng thái mở giữ khi bill mới về; xoá bill thì bỏ trạng thái.
- Tooltip doanh thu theo giờ: từng điểm bán, kể cả nhiều điểm Gieo, và tổng các chuỗi đang bật. Biểu đồ vẫn gộp Gieo thành một màu/chuỗi khi cần để tránh cột quá nhỏ.
- Quanlygieo giữ giao diện và thao tác bill hiện có.

## Sửa giao diện theo ảnh phản hồi 17/10

Popup PC/tablet giảm từ `min(1100px,96vw)` còn `min(880px,76.8vw)` (20%); điện thoại giữ chiều ngang dễ đọc. Tiêu đề kế thừa nền gradient của widget, chỉ danh sách bên dưới cuộn nên tiêu đề vẫn cố định. Đầu bill và phần chi tiết dùng chung một thẻ/nền/viền bo tròn, có mũi tên đóng/mở; chi tiết bỏ CSS hộp thoại, dùng dòng món và thông tin phụ gọn như quanlygieo. Giữ vị trí cuộn khi RT vẽ lại. Phạm vi file app sửa ở lượt này chỉ `manage.html`.

## Bố cục bill và nhãn Togo — phản hồi tiếp 17/10

- Chữ tên món/giá trong chi tiết 15px, mã bill/mã CK 14px đậm, màu chữ chính tương phản cao; size món dùng chữ phụ 13px.
- Bỏ dòng Tổng bill/Thanh toán/Bed/kênh lặp với đầu bill. Không có thông tin phụ thì không tạo vùng trống. Giữ chi tiết giảm giá, khách, khuyến mãi và khách đưa/thối nếu có.
- Topping có dòng riêng kèm số tiền, mã bill và mã CK (`bankOrderId`) đặt sát dưới nhóm món như quanlygieo; giữ nguyên cách tính dòng món.
- Thêm số món cạnh giờ. Điện thoại gom tóm tắt món và nhãn thanh toán trên một hàng dùng chung chiều ngang, giữ Togo không bị cắt.
- XOFA chỉ hiện nhãn **Togo** khi bill có `isToGo === true`, đúng trường POS ghi. Bill tại quán hoặc thiếu cờ không bị gán nhãn. Cả dashboard và popup dùng cùng hàm render, không đọc Firebase thêm.

## Bo góc biểu đồ cột — 17/10

Mỗi cột dùng một đường bao chỉ bo hai góc trên, đáy phẳng. Các phần màu bên trong là hình chữ nhật nối sát, không bo góc riêng và không trừ chiều cao tạo khe giữa các phần. Áp dụng cả cột chồng theo giờ và cột theo ngày/tháng; giữ dữ liệu, tooltip, màu và thao tác bật/tắt điểm bán. Mã clip duy nhất qua các lượt vẽ để nhiều biểu đồ không dùng nhầm đường bao.

## Popup dùng chính widget — 17/10

Bill chung mở trực tiếp widget xanh trong dialog nền trong suốt: bỏ khung trắng, padding và tiêu đề/phụ đề bên ngoài. Chỉ còn một tiêu đề Bill chung, nhãn Trực tiếp và nút X trong đầu widget. Giữ chiều ngang đã chốt, danh sách cuộn riêng, X/Esc/bấm ngoài đóng được; sau khi RT vẽ lại, đóng popup trả focus về nút Xem thêm hiện hành. Chế độ widget riêng không đổi khung/tiêu đề của các dialog khác.

## Nguồn dữ liệu và lượt đọc

`bill_live.v1.js` giữ một Map theo `storeId|YYYY-MM-DD`, bên trong là bill theo mã RT. Tổng hợp hôm nay và bảng bill dùng chung nguồn này. Một listener trên **node của đúng một ngày/điểm**, cùng `once(value)` để biết baseline đã đầy đủ (SDK dùng dữ liệu của listener). Không có một truy vấn tail riêng ngoài lượt tổng hợp ngày. Sau baseline chỉ nhận child_added/changed/removed; không gọi đọc toàn ngày theo từng bill.

Khác listener limitToLast cũ: child_removed trên cửa sổ giới hạn có thể chỉ là bill trượt khỏi cửa sổ, không phải xoá thật. Dùng cùng dữ liệu ngày đã cần để tính doanh thu giúp xử lý xoá thật (kể cả bill đầu ngày) chính xác và bỏ lượt tải trùng giữa feed/tổng hợp. UI vẫn giới hạn số bill hiển thị; dữ liệu ngày cũ đi qua archive/cache như trước. QL không đọc thử archive cho hôm nay vì POS chỉ archive ngày cũ.

- Bill gửi lại cùng mã/nội dung không phát sự kiện tính lại. Sửa/xoá tái tổng hợp từ snapshot, không cộng delta mù. Bill sai năm trên node không có năm bị loại.
- manage chỉ tái tổng hợp ngày/quán phát sự kiện, cập nhật widget đó và các tổng chung/biểu đồ. Widget quán khác giữ DOM; tỷ trọng được đổi theo mẫu số tổng mới. Không tải lại doanh thu, lương hay chi phí của quán khác.
- Quanlygieo giữ đầu vào chi phí, tài sản, lịch/nhân viên, hao hụt của lượt tải Hôm nay. Bill mới tính lại doanh thu/bill/AOV/IPT/ly/giờ, mục tiêu, hoà vốn và lãi/lỗ bằng hàm hiện có. Không nạp lại kho/chi phí/lương hay cửa sổ 30 ngày theo mỗi bill. Tồn kho tiếp tục theo tem/sổ, không suy diễn tồn từ bill.
- Đợt sự kiện dồn trong 100ms được gom; dữ liệu đang tải hoặc lãi/lỗ đang tính sẽ cập nhật tiếp sau khi xong. Kiểm tra phiên/ngày/quán để kết quả cũ không đè màn mới. QL gỡ nguồn khi rời Hôm nay; manage giữ listener khi đổi tab, gỡ khi chuyển ngày.

## Bộ tính dùng chung

`lai_lo.v2.js` sinh bằng `node tools/tao_lai_lo.js`, chép hàm từ quanlygieo như v1; không thêm công thức lãi/lỗ riêng cho manage. API `tinh` nạp ngữ cảnh; `realtime` dùng snapshot bill và ngữ cảnh đúng quán/ngày để tính mà không đọc mạng. Chênh giá vốn BTP thay thế được giữ và chỉ cộng một lần. Chưa có ngữ cảnh thì nạp đúng quán/ngày một lần. manage ghi pl_days + pl_book cùng batch khi tóm tắt đổi; kiểm tra revision trước khi ghi.

Không sửa `lai_lo.v1.js`, `data_access.v9.js` hoặc engine đã phát hành. Tool bộ deploy giữ cả lai_lo.v1 để HTML cũ trong cache vẫn tải được.

## Đệm thu hồi vốn quanlygieo — 17/10

- Đệm giữ cả kết quả từng ngày, khoá theo quán/ngày và thế hệ nạp. Khi bill RT thêm/sửa/xoá, thay đúng P&L hôm nay rồi gọi lại `thvCompute` có sẵn: luỹ kế, còn thiếu, tốc độ 30 ngày, thời gian dự kiến và tổng tháng cùng cập nhật. Không cộng delta chồng, không truy vấn Firebase thêm.
- Bill tới trong lúc lịch sử đang nạp: sau khi nạp xong ghép P&L mới nhất của context còn hoạt động. Kết quả từ lượt nạp trước khi đổi quán/tải lại không được ghi đè đệm mới.
- `reloadCurrent` xoá đệm; thay tài sản/mốc bắt đầu cũng bỏ đệm và vô hiệu lượt nạp cũ. Các màn khác đọc cùng tổng đã cập nhật.
- Giữ công thức và cách ghi mốc 100%; cờ đang ghi trên cache ngăn nhiều bill ghi mốc trùng. Không sửa JS dùng chung hoặc dữ liệu lịch sử để đối chiếu chênh lệch thu hồi vốn trong quá khứ (chủ dự án tạm dừng phần đó).
- `tests/thu_hoi_von_cache.test.js` kiểm các nhánh thay/sửa/xoá, không đọc thêm, tốc độ/cửa sổ 30 ngày, đổi quán/ngày, reset giữa lúc đang nạp và mốc 100%. E2E kiểm số hiện trên màn hình và nút tải lại với Firebase giả.

## Kiểm tra và giao file

Kết quả lượt này: 86 file test đạt; Chromium PC/tablet/điện thoại 147/147 mục; kiểm tra khung QL 56/56 và nhân sự 76/76; cú pháp, inventory, ranh giới, đường dẫn và predeploy đạt. Chưa deploy Hosting.

- `node tests/bill_live.test.js`: baseline dùng chung, sự kiện trong lúc tải, bill lặp/sửa/xoá, năm, cách ly quán, lỗi/gỡ nguồn.
- `node tests/lai_lo.test.js`: bản sinh khớp, cùng công thức QL, realtime không đọc Firebase thêm, không mượn ngữ cảnh quán khác.
- `node tools/ql_giao_dien/e2e_bill_realtime.js`: Chromium PC/điện thoại, Firebase giả và chặn mạng ngoài; UI, tooltip, số liệu/lãi lỗ, add/change/remove và lượt đọc.
- Chạy toàn bộ tests, cú pháp, inventory, boundaries, paths; `sh tools/sinh_lai_tat_ca.sh`; predeploy trên các bản sao.

📤 Upload đúng bộ `ban_deploy/{thuong,giangsinh,tet}/`, gồm manage.html, quanlygieo.html, quanlygieo_thu.html, bill_live.v1.js và lai_lo.v2.js cùng các phụ thuộc trong DANH_SACH.txt. Giữ JS cũ trong thư mục deploy. Chủ dự án tự deploy.

💾 Chỉ lưu: docs, tests, tools; không đưa thư mục phát triển lên hosting.
