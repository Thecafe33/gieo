# Dòng tiền và báo cáo điều hành Gieo — 18/10/2026

## Quyết định đã chốt với chủ dự án

- Nhập nguyên liệu đang qua Phiếu đặt hàng/nhận hàng trong Kho. Bộ tính P&L không đọc tổng PO/phiếu nhận thành chi phí ngày nhập.
- Hôm nay tiếp tục hiển thị lãi/lỗ **tạm tính sau COGS, lương, chi phí phân bổ**, kèm dòng tiền riêng. Không chuyển toàn bộ mua hàng thành chi phí cuối tháng: nguyên liệu chưa dùng là tồn kho, không phải tài sản cố định khấu hao; nếu đã ghi COGS lúc bán thì không trừ lại tiền mua cuối tháng.
- Tổng kết tháng cần là báo cáo cho chủ quán: kết quả, tiền thu/chi, rủi ro/việc cần quyết định; phần Kế toán, Nhân sự, Kho/Vận hành giải thích nguyên nhân. Chi tiết nhiều số chỉ mở khi cần.

## Dữ liệu và cách tính

`recordedCashFlow` chỉ dùng doanh thu bill và các khoản trả có ngày thanh toán. Chi phí theo kỳ vẫn phân bổ vào P&L theo ngày dùng; trả vào tháng khác thì dòng tiền ở tháng trả. POS đã chi nhưng còn chờ duyệt vẫn vào dòng tiền như đối soát két hiện có; dự đoán/từ chối/chưa trả không được giả thành tiền đã chi. Bản cũ không rõ ngày trả được nêu riêng. Đây là **thu−chi đã ghi nhận**, không phải lợi nhuận, toàn bộ tiền mặt trong két hay số dư tài khoản ngân hàng.

Kho có nút **Ghi tiền trả NCC** trên từng PO. Mỗi lần thực trả ghi số tiền, ngày trả và tiền mặt từ két/tài khoản quán; không tự lấy giá trị đơn. Khoản ở `expenses_gieogieo` có `accountingTreatment: inventory_purchase`, `purchaseOrderId`, `paidDate`, `baseType`, nguồn `po_payment`; không sửa PO, nhận hàng hay tồn. Dùng một ID khoản chi cho lần mở form để retry/bấm lặp không tạo thêm khoản. Có chặn sai cửa hàng/ngày/tiền. Không ghi chuyển đổi tự động PO cũ thành đã thanh toán.

`expenseCoveredByCogs` nhận cả khoản thanh toán nguyên liệu được đánh dấu trên và danh mục mua đá cũ; tách khỏi opex/P&L/KPI, giữ nguyên COGS. Theo dõi `chiMuaHang`/`chiMuaDa` riêng trong tóm tắt. Chi mua không phải toàn bộ COGS đã bán; widget dùng nhãn Tiền mua hàng/nguyên liệu. Cơ chế sửa snapshot và bộ sinh v4 ở `docs/MUA_DA_COGS.md`.

Ví dụ kiểm tra: thu bán 1 triệu, COGS hàng bán 300 nghìn, lương 222,5 nghìn, trả tiền nguyên liệu 5 triệu → P&L trước chi phí khác = +477,5 nghìn; dòng tiền đã ghi = −4 triệu. Không cộng lại 5 triệu vào chi phí tháng.

## Tổng kết tháng

Mặt đầu: doanh thu, lãi/lỗ, biên lãi, thu−chi đã ghi; trạng thái tạm tính/khớp chốt/cần đối chiếu. Việc cần quyết định chỉ lấy từ dữ liệu đang có: thiếu nguồn, chi chờ duyệt, hoá đơn ước tính, lương chưa chốt số, lệch tiền cần đối soát. Không tự đề xuất phạt từ chênh kho chưa xác minh.

Ba tổng quan: Kế toán (COGS, lương, vận hành, hao hụt, khấu hao); HR (người có công/lương, giờ, OT, đề xuất phải trả, số hồ sơ đã chốt); Kho/Vận hành (giá trị nhận hàng, hao hụt, ba món chạy). Giữ người nghỉ có công/lương/điều chỉnh trong tháng. Bảng lương đề xuất theo công khác dự toán P&L và không phải xác nhận trả tiền. Điều chỉnh lương đọc một truy vấn đúng tháng, gồm hồ sơ cũ; lỗi đọc không biến thành 0/đã đủ số.

Chi tiết Kế toán, HR, Kho, Bán hàng dùng `details`, mặc định đóng, giữ trạng thái khi vẽ lại; các nút sửa/chốt/lương cũ vẫn dùng cơ chế cũ. Hàng ít động dựa vào tồn hiện tại, không gọi đó là tồn cuối tháng quá khứ. Không dựng công thức COGS cuối tháng giả khi chưa có kiểm kê cuối kỳ.

Tải báo cáo là HTML độc lập gồm số tổng hợp/phạm vi/quán/trạng thái/việc cần quyết định, mở để In/Lưu PDF; không mang mã app/Firebase. Sao chép tóm tắt dùng clipboard trên máy người dùng; không gửi tới ai. Cả hai dùng dữ liệu đã nạp. Chặn xuất khi tháng/quán chưa khớp, chặn lượt nạp tháng trước ghi đè tháng mới. Sổ tháng đã chốt không tự ghi đè; lệch với số mới thì báo cần đối chiếu.

## Giới hạn và kiểm tra

Tiền trả PO cũ chưa được ghi vẫn là thiếu thông tin thanh toán, không tự coi đã trả hoặc chưa phát sinh. Công nợ NCC/hoàn tiền NCC đầy đủ chưa nằm trong lượt này. Không thêm thuế, tiền trả lương, số dư ngân hàng hoặc tồn cuối tháng nếu dữ liệu chưa được ghi.

Kiểm `tests/bao_cao_dieu_hanh.test.js`, `tests/mua_da_cogs.test.js`, bộ sinh `tests/lai_lo.test.js`; Chromium `tools/ql_giao_dien/e2e_bao_cao.js` kiểm trả NCC, bấm lặp, dòng tiền khác lợi nhuận, cựu nhân viên, chi tiết gập, xuất file không đọc thêm và đổi tháng khi đang tải; dùng Firebase giả, chặn mạng ngoài. Giữ các bài bill realtime/nhân sự/toàn app và kiểm cú pháp/inventory/ranh giới/đường dẫn/predeploy.

Kết quả kiểm tra: bộ sinh và 91 file unit test đạt; Chromium báo cáo điều hành 50 mục, bill/realtime 225 mục, nhân sự 76 mục, toàn app 540 mục đạt trên PC/tablet/điện thoại. Cú pháp 16 script/file JS, inventory, ranh giới, đường dẫn và kiểm khớp bộ sinh v4 đạt. Ba bộ deploy thường/Giáng sinh/Tết qua kiểm predeploy; không gọi Firebase thật trong các kiểm tra này.

Gói bàn giao chỉ `quanlygieo.html`, `quanlygieo_thu.html`, `manage.html`, `lai_lo.v4.js` từ bộ deploy đã sinh. Không sửa engine/lớp đường dẫn/các JS immutable cũ. Chủ dự án tự deploy, tải lại hai app; không có Hosting deploy hoặc sửa dữ liệu thật trong lượt triển khai.
