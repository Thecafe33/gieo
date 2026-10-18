# Dòng tiền và báo cáo điều hành Gieo — 18/10/2026

## Quyết định đã chốt với chủ dự án

- Nhập nguyên liệu đang qua Phiếu đặt hàng/nhận hàng trong Kho. Bộ tính P&L không đọc tổng PO/phiếu nhận thành chi phí ngày nhập.
- Hôm nay tiếp tục hiển thị lãi/lỗ **tạm tính sau COGS, lương, chi phí phân bổ**, kèm dòng tiền riêng. Không chuyển toàn bộ mua hàng thành chi phí cuối tháng: nguyên liệu chưa dùng là tồn kho, không phải tài sản cố định khấu hao; nếu đã ghi COGS lúc bán thì không trừ lại tiền mua cuối tháng.
- Tổng kết tháng cần là báo cáo cho chủ quán: kết quả, tiền thu/chi, rủi ro/việc cần quyết định; phần Kế toán, Nhân sự, Kho/Vận hành giải thích nguyên nhân. Chi tiết nhiều số chỉ mở khi cần.
- Cập nhật trong ngày 18/10: báo cáo quản trị chia theo hai giai đoạn **từng cửa hàng**. Trước hoàn vốn, chỉ số chính là **Góp thu hồi vốn**; sau hoàn vốn là **Thặng dư vận hành**. Chủ dự án đã chọn dùng số **trước khấu hao ở cả hai giai đoạn**. Lãi/lỗ sau khấu hao giữ ở chi tiết kế toán, không xoá khấu hao hoặc thay công thức/sổ đã chốt.

## Dữ liệu và cách tính

`recordedCashFlow` chỉ dùng doanh thu bill và các khoản trả có ngày thanh toán. Chi phí theo kỳ vẫn phân bổ vào P&L theo ngày dùng; trả vào tháng khác thì dòng tiền ở tháng trả. POS đã chi nhưng còn chờ duyệt vẫn vào dòng tiền như đối soát két hiện có; dự đoán/từ chối/chưa trả không được giả thành tiền đã chi. Bản cũ không rõ ngày trả được nêu riêng. Đây là **thu−chi đã ghi nhận**, không phải lợi nhuận, toàn bộ tiền mặt trong két hay số dư tài khoản ngân hàng.

Kho có nút **Ghi tiền trả NCC** trên từng PO. Mỗi lần thực trả ghi số tiền, ngày trả và tiền mặt từ két/tài khoản quán; không tự lấy giá trị đơn. Khoản ở `expenses_gieogieo` có `accountingTreatment: inventory_purchase`, `purchaseOrderId`, `paidDate`, `baseType`, nguồn `po_payment`; không sửa PO, nhận hàng hay tồn. Dùng một ID khoản chi cho lần mở form để retry/bấm lặp không tạo thêm khoản. Có chặn sai cửa hàng/ngày/tiền. Không ghi chuyển đổi tự động PO cũ thành đã thanh toán.

`expenseCoveredByCogs` nhận cả khoản thanh toán nguyên liệu được đánh dấu trên và danh mục mua đá cũ; tách khỏi opex/P&L/KPI, giữ nguyên COGS. Theo dõi `chiMuaHang`/`chiMuaDa` riêng trong tóm tắt. Chi mua không phải toàn bộ COGS đã bán; widget dùng nhãn Tiền mua hàng/nguyên liệu. Cơ chế sửa snapshot và bộ sinh v4 ở `docs/MUA_DA_COGS.md`.

Ví dụ kiểm tra: thu bán 1 triệu, COGS hàng bán 300 nghìn, lương 222,5 nghìn, trả tiền nguyên liệu 5 triệu → P&L trước chi phí khác = +477,5 nghìn; dòng tiền đã ghi = −4 triệu. Không cộng lại 5 triệu vào chi phí tháng.

## Tổng kết tháng

Mặt đầu: giai đoạn/tiến độ vốn; ba chỉ số doanh thu, giá vốn + chi phí vận hành, kết quả quản trị trước khấu hao. Bảng ngay dưới giải thích từng khoản trừ tới số chính. **Thu vào và Chi ra đã ghi nhận** là hai ô riêng trong widget dòng tiền; chênh lệch thu trừ chi chỉ nằm trong chi tiết mở rộng. Không dùng chênh lệch này làm lãi hoặc số dư tiền. Số tiền giữ liền một dòng, đơn vị nhỏ riêng, đổi lưới theo chiều ngang để không rơi chữ số.

`monthRecoveryStage` dùng đúng `thvTienNgay`/`thvCompute`, lọc lịch sử tới cuối kỳ đang xem, thay snapshot đúng ngày bằng P&L mới vừa nạp. Mốc hoàn vốn tháng sau không áp ngược tháng trước. Tháng chuyển giai đoạn tách đóng góp thu hồi và thặng dư sau mốc; ngày đạt mốc thuộc giai đoạn 1, ngày kế tiếp thuộc giai đoạn 2 vì sổ theo ngày. Giữ mốc đã ghi khi vốn hiện tại tăng hoặc sau đó có lỗ. Không gộp nhiều điểm bán thành một giai đoạn; thiếu vốn/mốc/lịch sử hoặc lịch sử bị cắt thì không tự kết luận đã hoàn vốn. Vốn mẫu số vẫn theo tổng tài sản đang theo dõi của cơ chế Thu hồi vốn hiện có; đây không phải lịch sử các lần góp vốn/chuyển vốn thực tế.

Báo cáo dùng chung đệm/lượt nạp đang chạy của Thu hồi vốn với Hôm nay; tái dùng tài sản đã nạp, không đọc lại khi chỉ mở chi tiết hoặc tải báo cáo. Dữ liệu kỳ vừa tính được ghép vào đệm đúng ngày, không cộng chồng. Giữ chốt phạm vi quán/phiên/tháng qua các bước chờ.

Trạng thái tạm tính/khớp chốt/cần đối chiếu và phần còn ước tính nằm gần số chính. Kiểm cộng các khoản chi phí khớp kết quả; nếu lệch thì báo cần đối chiếu, không báo khớp chốt. Việc cần quyết định chỉ lấy từ dữ liệu đang có: thiếu nguồn, chi chờ duyệt, hoá đơn ước tính, lương chưa chốt số, lệch tiền cần đối soát. Không tự đề xuất phạt từ chênh kho chưa xác minh.

Ba tổng quan: Kế toán (COGS, lương, vận hành, hao hụt, khấu hao); HR (người có công/lương, giờ, OT, đề xuất phải trả, số hồ sơ đã chốt); Kho/Vận hành (giá trị nhận hàng, hao hụt, ba món chạy). Giữ người nghỉ có công/lương/điều chỉnh trong tháng. Bảng lương đề xuất theo công khác dự toán P&L và không phải xác nhận trả tiền. Điều chỉnh lương đọc một truy vấn đúng tháng, gồm hồ sơ cũ; lỗi đọc không biến thành 0/đã đủ số.

Chi tiết Kế toán, HR, Kho, Bán hàng dùng `details`, mặc định đóng, giữ trạng thái khi vẽ lại; các nút sửa/chốt/lương cũ vẫn dùng cơ chế cũ. Hàng ít động dựa vào tồn hiện tại, không gọi đó là tồn cuối tháng quá khứ. Không dựng công thức COGS cuối tháng giả khi chưa có kiểm kê cuối kỳ.

Tải báo cáo là HTML độc lập gồm số tổng hợp/phạm vi/quán/trạng thái/việc cần quyết định, mở để In/Lưu PDF; không mang mã app/Firebase. Sao chép tóm tắt dùng clipboard trên máy người dùng; không gửi tới ai. Cả hai dùng dữ liệu đã nạp. Chặn xuất khi tháng/quán chưa khớp, chặn lượt nạp tháng trước ghi đè tháng mới. Sổ tháng đã chốt không tự ghi đè; lệch với số mới thì báo cần đối chiếu.

## Giới hạn và kiểm tra

Tiền trả PO cũ chưa được ghi vẫn là thiếu thông tin thanh toán, không tự coi đã trả hoặc chưa phát sinh. Công nợ NCC/hoàn tiền NCC đầy đủ chưa nằm trong lượt này. Không thêm thuế, tiền trả lương, số dư ngân hàng hoặc tồn cuối tháng nếu dữ liệu chưa được ghi.

Kiểm `tests/bao_cao_dieu_hanh.test.js`, `tests/mua_da_cogs.test.js`, bộ sinh `tests/lai_lo.test.js`; Chromium `tools/ql_giao_dien/e2e_bao_cao.js` kiểm trả NCC, bấm lặp, dòng tiền khác lợi nhuận, cựu nhân viên, chi tiết gập, xuất file không đọc thêm và đổi tháng khi đang tải; dùng Firebase giả, chặn mạng ngoài. Giữ các bài bill realtime/nhân sự/toàn app và kiểm cú pháp/inventory/ranh giới/đường dẫn/predeploy.

Kết quả kiểm tra: bộ sinh và 91 file unit test đạt; Chromium báo cáo điều hành 50 mục, bill/realtime 225 mục, nhân sự 76 mục, toàn app 540 mục đạt trên PC/tablet/điện thoại. Cú pháp 16 script/file JS, inventory, ranh giới, đường dẫn và kiểm khớp bộ sinh v4 đạt. Ba bộ deploy thường/Giáng sinh/Tết qua kiểm predeploy; không gọi Firebase thật trong các kiểm tra này.

Lượt chia giai đoạn: 28 mục kiểm báo cáo, 22 mục kiểm đệm thu hồi vốn; Chromium báo cáo 94 mục trên bốn chiều ngang 1366/1024/853/390, bill/realtime 225 mục, toàn app 540 mục đạt. Kiểm thêm mất giai đoạn khi thiếu vốn/lịch sử, mốc tương lai không áp tháng cũ, ngày lỗ sau hoàn vốn, tháng chuyển giai đoạn, tiền dài không rơi chữ số, tải báo cáo và thao tác không đọc thêm Firebase. Dòng giải thích trong thẻ Thu hồi vốn hiện có cũng dùng tên thặng dư trước khấu hao và không gọi đó là tiền đã có trong két.

Gói đầu bổ sung dòng tiền/PO gồm `quanlygieo.html`, `quanlygieo_thu.html`, `manage.html`, `lai_lo.v4.js`. Lượt tiếp theo chia giai đoạn báo cáo chỉ sửa hai HTML quanlygieo, không đổi bộ tính v4 hoặc manage; gói tải lần này chỉ hai HTML từ bộ deploy đã sinh, dùng cùng manage/v4 đã bàn giao. Không sửa engine/lớp đường dẫn/các JS immutable cũ. Chủ dự án tự deploy; không có Hosting deploy hoặc sửa dữ liệu thật trong lượt triển khai.
