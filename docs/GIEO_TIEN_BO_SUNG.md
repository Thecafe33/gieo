# Một lần xác nhận tổng thực nhận — 21/10/2026

Nguồn lỗi: POS ghi `daily_closings_gieogieo[__ggNN]/{date}.postCloseBills`, quanlygieo có form riêng ghi `postCloseReceipt`, nhưng form thực nhận chung / manage đọc `ownerReceipt`. Hai phiếu độc lập gây hỏi xác nhận hai lần và manage không nhận được lần xác nhận bổ sung.

## Sau sửa

- quanlygieo giữ danh sách / phân loại bill bổ sung, bỏ form `pcReceivedInput`. Chỉ còn ô Quản lý thực nhận của ngày.
- Manage dùng cùng tổng: tiền bàn giao + tiền mặt `after_close`. Tiền `in_close_count` đã nằm trong két nên không cộng lại; chuyển khoản không biến thành tiền mặt.
- Nhập **tổng thực nhận**, không chỉ số tiền vừa nhận thêm. Ví dụ bàn giao 300.000đ + bổ sung 50.000đ → tổng 350.000đ. Nếu đã nhập 300.000đ trước đó, sửa tổng thành 350.000đ; không cộng thêm lần nữa vào con số nhập.
- Xác nhận ở app nào cũng ghi `ownerReceipt`, ảnh đối chiếu tương thích `postCloseReceipt` (nếu có tiền bổ sung / phiếu cũ), và xoá cờ `postCloseCashPending` trong **một transaction** trên đúng quán/ngày. App còn lại đọc cùng phiếu khi mở / tải lại màn Tiền mặt.
- Phải nhận đổi trong lúc bấm xác nhận → transaction kiểm lại và yêu cầu tải lại, không xác nhận nhầm tổng cũ. Nguyên trạng tiền đếm/kết ca/bàn giao không bị sửa.
- Thực nhận thiếu hoặc thừa vẫn được ghi và hiện đúng chênh lệch; không gọi là Khớp. Số thực nhận 0 là dữ liệu thật. Bill tiền mặt chưa phân loại phải phân loại ở quanlygieo trước xác nhận.

## Phiếu cũ và lần bổ sung tiếp

`gieoReceiptState` giống nhau trong cả hai HTML (test khoá cùng nội dung): chọn phiếu có thời gian mới hơn giữa ownerReceipt/postCloseReceipt, chuẩn hoá số nhận, kiểm tổng / tiền bổ sung. Phiếu bổ sung cũ hợp lệ tự được đọc như một lần nhận chung, **không ghi migrate** khi xem.

Ngày chỉ có ownerReceipt cũ không lưu `expected` và không có bổ sung/cờ chờ vẫn giữ được số nhận. Có tiền bổ sung nhưng không đủ mốc tổng thì giữ số cũ và yêu cầu xác nhận lại, không tự giả định đã nhận khoản mới. Khi có bill mới, chênh tổng khiến phiếu cũ thành “cần xác nhận lại”; không tự tăng số thực nhận. Bill chỉ chuyển khoản không làm đổi phải nhận tiền mặt.

Quanlygieo cũng lọc cảnh báo có cờ cũ nhưng phiếu đã xác nhận hợp lệ; không tiếp tục nhắc cùng khoản đã nhận từ manage.

## Lượt đọc

- Không thêm RT listener / timer / quét tự động.
- Giữ khoảng đọc tiền mặt hiện có, v3 độc lập đệm cũ. Khi mở Tiền mặt và chỉ tải khoảng gần đây, thêm **một query `postCloseCashPending == true` / quán Gieo** để phát hiện bổ sung ở ngày cũ đã đệm. Lần đầu tải cả khoảng không cần query trùng này.
- Nếu một phiếu cũ từng chờ nay biến mất khỏi query cờ (app khác vừa xác nhận), tải đúng doc đang chờ đó để cập nhật. Không kéo lại toàn bộ lịch sử và không đọc bill/kho để xác định tiền bổ sung.
- Phân loại hoặc xác nhận dùng chính doc kết ca trong transaction. Số phụ doanh thu / CK vẫn theo cơ chế tải sau hiện có. Chỉ đọc chi tiết ca khi bấm.

## Kiểm tra / phát hành

- `tests/gieo_tien_bo_sung.test.js`: phiếu cũ/mới, một form, không cộng trùng, thiếu/0/chưa phân loại, transaction hai app, đúng điểm bán, bill ghi đồng thời, query cờ ngày cũ và cập nhật phiếu khi app khác nhận.
- `tools/manage_cash/e2e_supplement.js`: backend/UI manage + hàm UI quanlygieo thực, cùng Firebase giả; PC/mobile; manage nhận → quanlygieo hết hỏi; bill mới → QL nhận → manage cùng số; phiếu cũ đọc không ghi.
- Kiểm lại lịch sử tiền mặt / bộ đệm, đối soát và browser history trước phát hành; sinh đủ ba bộ deploy.

Không sửa POS/engine, không ghi Firebase thật, không deploy Hosting trong lượt làm. Các bộ deploy chứa manage.html/quanlygieo.html cùng bản tương ứng; `_thu` của quanlygieo sinh lại qua tool như quy trình.
