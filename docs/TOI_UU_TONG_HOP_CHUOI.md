# Tối ưu tổng hợp Gieo đa cửa hàng — 18/10/2026

## Phạm vi chủ dự án đã chốt

Ưu tiên logic tính toán và giao diện tổng hợp trong `quanlygieo`, đơn giản hoá đường truy vấn. Truy vết hộp nguyên liệu → bill/mẻ BTP dành cho sự việc cụ thể tại điểm bán, không nạp thường xuyên trên màn tổng chuỗi. Không rà lại toàn bộ luồng POS trong đợt này. Giữ quy tắc tài chính, lương, Menu/Khuyến mãi và các JS immutable hiện hành.

Đợt đầu: **Xem tất cả → Tổng kết tháng**. Hôm nay toàn chuỗi và Báo cáo kỳ chưa chuyển đường lấy số trong đợt này. Không gọi đây là hoàn tất tối ưu toàn hệ thống.

## Đường lấy số

1. Trong `withStore` tuần tự, đọc sổ `pl_book/days`, dấu riêng + chung (`pl_dirty`), sổ chốt tháng, tài sản và cấu hình vốn của đúng cửa hàng.
2. Chỉ xét hai khoảng cần hiển thị: kỳ đang xem và kỳ so sánh. Tháng đang chạy so cùng số ngày đầu tháng trước; phần cuối tháng trước ngoài so sánh không tính ké. Nếu book thiếu ngày, chỉ bù đúng khoảng thiếu từ `pl_days` hiện có.
3. Quy tắc chọn ngày vẫn là `GieoData.plNgayCanTinh` + sửa snapshot lương/đá cũ đang dùng chung với manage. Thêm kiểm đầu vào bản tổng hợp đủ trường hữu hạn, ngày khớp, trạng thái hợp lệ và cộng/trừ chi phí khớp. Snapshot thiếu nguồn hao hụt không được coi hợp lệ.
4. Khi không có ngày cần sửa: không tải danh mục NL/BTP, định mức, bill, công/lịch hoặc sổ kho để tính lại. Khi cần sửa: mới nạp cấu hình/công thức chung (một lượt tổng hợp), danh mục/COGS đúng quán, dùng nguyên `computeDayPL`; chỉ gom ngày thực sự liền nhau. Không tạo công thức P&L khác.
5. Ngày tính mới đủ nguồn được ghi vào **hai sổ hiện có** `pl_days` và `pl_book` trong cùng batch, chờ xong trước khi trả scope. Không thêm collection/cache trung gian. Không sửa `book_closings`, số quỹ hoặc mốc hoàn vốn. Ghi lỗi có thông báo thiếu trong dữ liệu báo cáo; số vừa tính vẫn có thể xem.
Nhánh tính lại đọc bill archive/RT nghiêm ngặt cho đúng ngày cần sửa; không lấy COGS đã tính sẵn trong `daily_sales_cache` sau khi có dấu đổi giá/định mức. Gộp bill theo khoá (RT thắng), dùng lại `aggregateOrders`, `rawMixFromOrders` và phần bù BTP đã xác nhận. Lỗi một nguồn bill hoặc bù giá vốn thì không ghi snapshot ngày đó; không sửa hàm đọc bill chung của POS/manage hay bộ tính v4.

6. `updatedAt` dùng mốc trước khi bắt đầu đọc nguồn, kể cả tài sản: sửa đổi xảy ra giữa lúc đọc và ghi vẫn mới hơn mốc này, được dấu thay đổi bắt ở lần sau. Không xoá dấu. Có thay đổi sau ngày chốt thì báo cần đối chiếu, không tự gọi đã khớp chốt.

Tải lại/quét tháng buộc làm mới hôm nay; ngày cũ còn hợp lệ vẫn dùng sổ. Đệm báo cáo 10 phút trong phiên còn giữ, nhưng khớp cả tháng và ngày cuối kỳ để không dùng báo cáo hôm qua qua nửa đêm. Đây là giảm đọc nguồn, **không phải mở báo cáo không đọc Firebase**: vẫn phải đọc sổ/dấu/tài sản/vốn/chốt của từng unit để xác định đúng trạng thái.

Lịch sử vốn vẫn dùng book có đủ mốc và kiểm dấu/phiên bản. Chưa đủ lịch sử thì ghi chưa xác định giai đoạn, không quét ngược hàng năm từ màn tổng hợp. Mở unit để đối chiếu/bổ sung khi cần.

## Thu/chi theo yêu cầu

Phần **Thu và chi đã ghi** mặc định đóng, chưa tải chi tiết và không hiển thị 0 giả. Mở xem mới đọc danh sách khoản chi cho từng unit có số, kết hợp doanh thu đã có trong sổ ngày. Đóng/mở lại, lọc/sắp và xuất không đọc lặp. Lỗi một quán ghi rõ tổng còn thiếu; Thử lại chỉ đọc quán lỗi, giữ quán đã đọc. Không tải truy vết bill–tem–BTP ở đây. Bản tải/sao chép chỉ xuất thu/chi nếu đã đủ dữ liệu, nếu chưa thì ghi chưa tải/còn thiếu, không kích hoạt truy vấn ngầm.

## Giao diện

- Ba ô đầu: doanh thu, góp thu hồi vốn, thặng dư sau hoàn vốn.
- Tiến độ chốt và số quán cần rà ở một dòng gọn; vẫn bấm giải thích được.
- Chỉ hiện khối điểm cần chú ý khi có dữ liệu cần chú ý.
- Bảng từng unit/giai đoạn/doanh thu/kết quả/chênh kỳ trước/trạng thái là phần chính.
- Thu/chi và phạm vi/nguồn số gập mặc định. Nguồn vốn mở rộng chưa đủ dữ liệu được nêu trong giải thích, không chiếm một ô số chính.
- Bấm số dùng thành phần ngày/quán đã nạp. Chứng từ và truy vết chỉ mở thêm ở đúng unit khi có nhu cầu.

## Kiểm chứng

`tests/toi_uu_bao_cao_chuoi.test.js`: 24 mục, gồm dùng sổ, đúng khoảng, một ngày thiếu/đổi, không ghi khi nguồn/phép tính lỗi, bù legacy có giới hạn, phiên bản lương, mốc trước nguồn, lỗi ghi và ghi đúng quán; gộp bill archive/RT, bù BTP và lỗi nguồn bill không ghi doanh thu 0. `tests/bao_cao_chuoi.test.js` 24 mục vẫn giữ; báo cáo unit 28 mục, đệm vốn 22 mục.

Chromium `e2e_bao_cao_chuoi.js`: 74 mục trên 1366/853/390. Với ba unit đọc được và 108 ngày tổng hợp còn hợp lệ: **0 gọi tính lại, 0 lượt đọc nguồn tính toán bổ sung, không tăng đọc RT, 0 ghi lại** khi bỏ đệm màn rồi nạp lại từ sổ. Dấu sửa một ngày GG02 chỉ gọi tính đúng ngày đó của GG02; tổng chuỗi không đổi khi dữ liệu nguồn không đổi. Thu/chi chỉ đọc khi mở, một lượt/quán; retry chỉ đọc quán lỗi. Kiểm thiếu nguồn, popup, xuất, đổi tháng giữa lúc tải, scope và không sửa chốt/mốc vốn. Tất cả dữ liệu giả, mạng ngoài bị chặn; không phải số đo chi phí Firebase thật.

Báo cáo unit Chromium 106 mục; bộ sinh v4 phải khớp, không sửa `manage.html` hay `lai_lo.v4.js`. Sinh bản thử + ba bộ mùa; kiểm predeploy trước bàn giao. Gói `tai_ve/toi_uu_bao_cao_chuoi_18-10.zip` chỉ `quanlygieo.html` + `quanlygieo_thu.html` từ bộ deploy đã sinh. Chủ dự án tự deploy Hosting.
