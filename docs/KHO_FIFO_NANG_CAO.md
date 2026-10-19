# Rà kho và FIFO nâng cao — 19/10/2026

## Phạm vi và cách kiểm

Chủ quán yêu cầu chạy các quy trình kho/FIFO nâng cao của POS Gieo, tìm lỗi và sửa. Chạy engine thật và hàm POS trên Firebase giả nghiêm; tiêm lỗi cả trước và **sau khi commit** để phân biệt lỗi thật với mất ACK. Không đọc/ghi dữ liệu Firebase thật, không deploy Hosting. Bộ test cũ đạt trước khi sửa.

`tests/kho_fifo_nang_cao.test.js` hỗ trợ `ENGINE=unit_engine.v18.js` để tái hiện bản cũ và mặc định chạy bản mới nhất. Mô hình 200 bước kiểm độc lập tổng lượng sau từng thao tác, không lấy con số mong đợi từ comment hay từ hàm suy tồn đang được kiểm.

## Các lỗi đã xác minh

1. **Mở mã mới, chuyển nợ rồi mất ACK:** RT đã xoá mã nợ A=-200 và mở B=800 từ chai 1.000ml. Retry thấy B đã tồn tại, xoá danh sách nguồn cần đóng trong RAM. A trên Firestore vẫn open=-200; recompute cộng A lần nữa theo nhánh mồ côi, tồn thành **600 thay vì 800ml**. Lỗi tương tự khi phần đóng nguồn trên Firestore thất bại; chuyển nợ nhiều mã liên tiếp làm mất dấu nguồn cũ.
2. **Báo hết rồi retry dùng số form cũ:** RT đang 100ml, form/Firestore cũ 500ml. Lượt đầu gỡ RT nhưng lưu mã lỗi; lần sau không còn RT nên dùng lại 500ml. Sổ hao hụt và wasteBase thành **500 thay vì 100ml**. Có thể xảy ra khi mất ACK sau RT commit.
3. **Gọi lại báo hết ghi WASTE trùng:** WASTE cũ dùng ID ngẫu nhiên và không kiểm mã đã chốt. Gọi lại cùng nghiệp vụ có thể ghi thêm hao hụt, kể cả từ dữ liệu form cũ. Tồn theo mã có thể vẫn 0, nhưng chi phí/hao hụt bị cộng nhiều lần.

Đây là ba nhóm lỗi tái hiện trên dữ liệu giả, không phải kết luận rằng mọi phiếu sai thực tế đều phát sinh từ chúng.

## Bản sửa — `unit_engine.v19.js`

- Giữ nguyên v18 và các bản trước. POS/Quản lý cùng trỏ v19; API công khai không đổi.
- Mở gánh nợ lưu `_fifoCarry` trong chính transaction RT cùng lượng mới. Dấu chứa nguồn nợ và danh tính thao tác, được mang tiếp khi mã mới lại âm. Đóng nguồn trong transaction Firestore, giữ người/ngày/lý do báo hết đã có; chỉ xoá dấu sau khi chốt nguồn xong. Recompute không cộng lần nữa nguồn đã chuyển đang chờ đồng bộ.
- Báo hết lưu `_finishPending` trong RT với lượng thật, người/lý do và ngày nghiệp vụ ban đầu; retry qua ngày không chuyển hao hụt sang ngày mới. Chặn phân bổ tiếp vào phần dương đang báo hết qua cờ `discardPending` có sẵn. Nợ âm tiếp tục được giữ và hấp thụ.
- WASTE mang `finish_{containerId}_WASTE`, giữ một lần ghi kể cả mất ACK hoặc hai máy cùng thao tác. Chỉ đóng mã sau khi sổ WASTE đã ghi; lỗi giữ dấu để bấm lại, kể cả sau tải lại app. Không đổi số theo form mới khi retry. Mã đã finished không sinh WASTE mới, gồm mã từ v18.
- Khi mã còn open nhưng RT đã mất và không có dấu đủ chứng minh, dừng để đối soát thay vì đoán lượng cũ. Không tự phục hồi con số đã bị mất bởi lỗi v18.
- Không thêm collection, listener, vòng quét định kỳ hoặc truy vấn trên luồng bán bình thường. Báo hết thêm đọc đúng doc mã; mở gánh nợ đọc đúng các doc nguồn cần chốt. Các lần ghi RT bổ sung chỉ phục vụ xác nhận hoàn tất thao tác.
- Bộ deploy giữ engine liền trước cho HTML còn cache và quay lui. Không sửa snapshots gốc: `core.v19.json` là phần chênh riêng của đúng 5 kịch bản mở/báo hết; các kịch bản khác vẫn so ảnh cũ.

## Kịch bản nâng cao

Kiểm FIFO nhiều mã; gánh nợ 200ml và nợ lớn hơn ba chai; mất ACK mở mã; Firestore lỗi rồi tiếp tục chuyển nợ qua mã sau; báo hết với form cũ; mất ACK RT/WASTE; WASTE chưa commit; retry sang ngày mới giữ ngày gốc; retry sau tải lại app; hàm submit của POS tiếp tục khi mã đã finished nhưng dọn RT còn lỗi; suy tồn cùng món dọn tiếp dấu đã chốt; hai máy cùng báo hết; nợ đang báo hết được mã mới hấp thụ nhưng vẫn giữ người/lý do; mã RT mất không được đoán số; BTP mới không gánh nợ cũ; hoàn sau khi mã gốc đã chuyển nợ, hoàn lặp; giữ lịch sử người báo; mở trùng sau bán không hồi sinh hàng; mô hình 200 bước bán/hoàn/mở/báo hết.

Kiểm hồi quy dùng toàn bộ `tests/run_all.sh`, gồm nấu/cân BTP, khoá đối chiếu, bán trong lúc cân, tem nguyên gói, bù nợ, huỷ bill và hoàn tiếp, tồn quầy/refill, đa cửa hàng, nhận hàng/đơn vị nhập và các test lãi/lỗ. Không thay luật tài chính, giá vốn, đơn vị nhập hay công thức nấu.

## Giới hạn và đưa vào sử dụng

Chưa kiểm trên APK/máy in/mạng quầy thật; không xác nhận hoặc sửa phiếu đã sai trên dữ liệu thật. Giả lập sau commit không thay thế kiểm tra độ trễ và tranh chấp trên Firebase Emulator/mạng quầy.

Chủ quán deploy **cả hai HTML và engine v19**, giữ v18 cùng các JS cũ. Sau deploy cần nạp lại POS/Quản lý để tránh phiên v18 còn chạy khi đã có thao tác v19 đang chờ hoàn tất. Muốn quay lui khi còn `_finishPending`/`_fifoCarry` phải hoàn tất/đối soát các thao tác đó trước; không xoá dấu thủ công.

Kiểm lượt đọc: cùng kịch bản suy tồn/bán thường trên v18 và v19 có cùng số lời gọi đọc Firestore/RT và transaction RT trong fake (không khẳng định đây là số reads tính tiền trên Firebase thật). Không tăng đọc ở đường bình thường; đọc thêm chỉ khi thao tác cần xác nhận hoặc còn dấu xử lý lỗi.

Kết quả phát hành 19/10: 21 kịch bản nâng cao đạt, mô phỏng 200 bước đạt, toàn bộ suite đạt `TẤT CẢ ĐẠT`; Chromium 28 kiểm tra nút Báo hết thật trên PC/điện thoại đạt. Kiểm ranh giới/đường dẫn sạch, ba fixture deploy hợp lệ, ZIP đối chiếu từng byte với bộ theo mùa. v18 và toàn bộ snapshot gốc không đổi.
