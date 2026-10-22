# Rà soát quanlygieo2 theo vai trò — 22/10/2026

Đối chiếu bản 215509e, chạy với dữ liệu giả. Không deploy hoặc ghi Firebase production. Mục tiêu: quản lý thấy đúng việc cần quyết; nhân viên biết việc cần làm và không ảnh hưởng bán hàng.

## Lỗi đã tái hiện và sửa

| Trải nghiệm | Lỗi trước sửa | Kết quả sau sửa |
|---|---|---|
| Quản lý duyệt chi | Thẻ chi không hiện số tiền | Số tiền hiện rõ ngay trên thẻ và trong chi tiết; thiếu tiền không biến thành 0 |
| Mở vụ lệch cũ | Mở màn digest hoặc danh sách mặc định 14 ngày, không thấy vụ đã bấm | Chuyển thẳng tab vụ lệch, chọn Tất cả và đúng ngày |
| Mở tem/lô | Chỉ mở danh sách chung | Mở đúng document tem/lô qua chức năng chi tiết hiện có; phiếu kiểm kê/PO chọn đúng tab |
| Đối chiếu thử / worker quá cũ | Hộp thư mới có thể thay cảnh báo gốc dù chưa đủ tin cậy | Giữ cảnh báo gốc, chỉ xem đề xuất/bản lưu khi chủ bấm; ghi rõ đây là bản lưu |
| Trạng thái worker | Heartbeat không hợp lệ có thể được coi là hoạt động | Kiểm ngày hợp lệ, tuổi tối đa 60 phút và giới hạn lệch tương lai; áp dụng cả POS |
| Chuyển nhóm/hồ sơ nhanh | Kết quả hoặc lỗi cũ ghi đè màn mới | Chặn kết quả cũ theo thế hệ yêu cầu, điểm bán và node hộp thoại |
| Tải lại / ghi chi phí | Đệm tổng hợp vẫn giữ sau thao tác | Tải lại bỏ đệm ngay; ghi chi phí làm vô hiệu đệm đúng quán, không thêm listener |
| Tắt sau nhiều tuần | Ngày khởi tạo quá 31 ngày chặn cả tắt tự động | Tắt độc lập với mốc ngày, giữ cấu hình và lịch sử |
| Lưu không thay đổi | Vẫn ghi và bắt khởi tạo lại nhiều dữ liệu | Không ghi Firebase, không khởi tạo lại |
| Tem báo hết cần kiểm tra | status finished làm hồ sơ chuyển xong dù needsReview còn bật | Giữ việc ở Đang xử lý đến khi cờ kiểm tra đã được xử lý; tem hủy không bị hồi sinh |
| Badge và danh sách | Hồ sơ đã ẩn vẫn có thể tăng số Đã xong | Chỉ đếm hồ sơ hiện; đối chiếu lại số cũ một lần, có kiểm revision để không mất sự kiện đồng thời |
| Nâng chính sách | Hồ sơ cũ không tự đổi kết luận chỉ vì thay file JS | Đọc lại nguồn theo bootstrap có cursor một lần mỗi phiên bản; chưa hoàn tất thì giữ cảnh báo gốc, rồi xác nhận lại bộ đếm |
| Tổng hợp chưa có dữ liệu | Vẫn hiện các tổng tiền 0 ở đầu | Báo chưa đủ dữ liệu, không đưa 0 thành kết quả thực tế |
| Nhân viên mở checklist | Widget có thể chen vào bước cân/đếm do hàm cha chuyển màn trước | Chỉ gắn vào checklist đầu/cuối ca thực sự, không gắn vào màn cân đang dở |
| Nhân viên bấm nhanh | Có thể tải công việc trùng | Gộp yêu cầu đang chạy trên cùng widget |
| Mở việc cân lại cũ | taskId theo BTP có thể đã thuộc vụ mới | Đọc đúng việc khi bấm và kiểm caseId, trạng thái, hạn trước khi mở |

Header và bộ lọc hộp thư được gọn lại: một hàng trạng thái, ba ô chỉ số đồng thời là bộ lọc; không lặp thêm một hàng nút cùng chức năng. Tiền và trạng thái xử lý là thông tin chính. Giữ màu hồng, gradient và góc bo hiện có.

## Kiểm chứng

- `node tools/automation/review_e2e.js`: 13 tình huống quản lý, gồm dữ liệu cũ, đổi nhóm nhanh, kết quả/lỗi về muộn, tắt sau nhiều tuần, lưu không đổi, thiếu báo cáo, bộ đếm chưa xác nhận và thiếu file chính sách. Bảy tình huống đầu được tái hiện thất bại trước sửa; chạy lại đạt sau sửa.
- `node tools/automation/e2e_shift_work.js`: PC 1366 và điện thoại 390; không đọc khi chỉ mở checklist; gộp bấm nhanh; worker cũ không báo hết việc; không chen vào cân; không mở nhầm thế hệ cân lại.
- `node tools/automation/role_full_e2e.js`: HTML thật + JS chung, PC/điện thoại; thấy tiền, mở đúng tem, duyệt đúng khoản chi bằng hàm nghiệp vụ gốc, không lỗi JavaScript.
- `node tests/gieo_automation_review.test.js`: tem finished còn needsReview, thiếu cờ in trên dữ liệu cũ, tiền null, counter hồ sơ ẩn, sửa badge cũ và cạnh tranh lúc tổng hợp.
- `node tests/gieo_automation_bootstrap.test.js`: phân trang 205 hồ sơ; nâng v1 lên v2 sửa kết luận hồ sơ cũ; nhịp sau không chạy lại bootstrap nguồn.
- Bộ hồi quy đầy đủ, ranh giới Engine và kiểm đường dẫn đều phải đạt trước gửi bản.

## Giới hạn vận hành còn cần hiểu đúng

- Giao việc không thay cho hành động thực tế. Hủy hàng, xác minh số đếm hoặc bổ sung chứng từ vẫn cần người phụ trách thực hiện; không ghi Xong giả.
- Tem đã báo hết mà còn needsReview không được báo hết lại tại POS. Người phụ trách dùng màn chi tiết tem trên quanlygieo2 để kiểm tra. POS hiện hướng dẫn rõ thay vì đưa vào danh sách hàng đang mở vốn không còn tem đó.
- Tranh chấp và các việc cần giao diện quản lý vẫn sử dụng quy trình hiện có. Nhân viên tại quầy không tự có thêm quyền nghiệp vụ chỉ vì thấy công việc.
- Chưa tự phân bổ trách nhiệm mới cho WASTE khai báo; vẫn cần luồng khai nhận/xác minh chuyên biệt như đã nêu trong kế hoạch.
- Chưa xác nhận số billing đọc thật hoặc hoạt động của Functions trên Firebase production. Sau triển khai vẫn bắt đầu bằng Đối chiếu thử.

## Phiên bản và lượt đọc

Chính sách `gieo_automation.v2.js`, module POS `gieo_automation_pos.v2.js`. Bản v1 và Engine v20 được giữ nguyên. Worker và quanlygieo2 cùng dùng chính sách v2; cần cập nhật cả Hosting và worker. Khi chưa có đối chiếu bộ đếm v2, giao diện giữ cảnh báo nguồn.

Khi nâng phiên bản, bootstrap đọc lại nguồn đang chờ và sổ hao hụt trong khoảng đã cấu hình, theo cursor và tối đa 8 trang mỗi nhịp; không đọc bill. Việc này có thêm lượt đọc một lần để sửa kết luận cũ, không lặp ở mỗi nhịp. Sau đó đối chiếu bộ đếm bằng aggregate count theo bốn nhóm; chỉ ghi kết quả nếu countsRevision chưa thay đổi. Không thêm listener hay truy vấn vào thao tác thêm món/thanh toán. Các truy vấn chi tiết/kiểm task chỉ phát sinh khi bấm. Nền lỗi thì quay về truy vấn cảnh báo gốc, có thể tốn lượt đọc như giao diện cũ để tránh báo ổn giả.
