# Nhận hàng Bịch/Thùng — 19/10/2026

## Lỗi tái hiện được

Chủ quán báo nhận 6 bịch trân châu nhưng kho/mã ghi thành lượng tương đương 6 thùng. Cấu hình trong bản xuất đã cung cấp: Trân châu trắng có đơn vị nền g, Bịch = 2.000g, Thùng = 12.000g, đơn vị đếm/dán mã là Bịch. Không đưa bản xuất hay thông tin riêng vào repo.

`poReceiveAddFreeLine` và `poReceiveLineChangeItem` trước đây chọn bao bì lớn nhất. Với cấu hình trên, mặc định Thùng; nhập 6 -> 72.000g -> 36 mã Bịch. UI chỉ ghi “Số lượng tốt”, đơn vị chọn không nằm cạnh số nhập. Đổi đơn vị vẫn giữ số cũ, có thể biến 6 Bịch thành 6 Thùng. Đây là lỗi đã tái hiện theo mã/config; chưa có chính phiếu sự cố để xác nhận nhân viên đi qua nhận tự do hay theo đơn và đơn vị lúc bấm.

Không thấy engine nhân hệ số lần hai: `_submitPoReceiveImpl` nhân số nhập với quy cách một lần, rồi `UnitEngine.lifecycle.createFromReceipt` chia lượng nền cho quy cách đơn vị đếm. Nếu chọn đúng Bịch, 6 × 2.000 = 12.000g -> 6 mã. Không sửa `unit_engine.v18.js` hoặc quy tắc tồn theo mã.

## Bản sửa

- Nhận tự do chọn đơn vị đếm trong danh mục; nếu không có chọn bao bì nhỏ nhất hợp lệ; chỉ trở về g/ml/cái khi không có bao bì. Giữ lon/chai thành lượng nền đúng, không quay về lỗi “1 lon = 1g”. Không đổi mặc định kiểm kê/refill.
- Nhận theo đơn tiếp tục dùng quy cách lúc đặt; giữ lựa chọn đó cả khi bao bì trong danh mục đổi. Đổi đơn vị hoặc đổi nguyên liệu xoá lượng tốt/hỏng cũ, nhân viên nhập lại theo nhãn mới. Dòng đã vào kho không đổi đơn vị khi thử lại.
- Ô số lượng ghi rõ Bịch/Thùng, chọn quy cách hiện đơn vị nền, xem trước số tốt/hỏng và số mã NL. Quy cách dài xuống dòng trên màn hẹp. Không đọc thêm Firebase để xem trước.
- Kiểm số hữu hạn, không âm, quy cách hợp lệ; giữ kiểm số nguyên đơn vị dán mã và trần 60 mã trước khi ghi. Nhận tốt vượt phần đơn còn thiếu cần xác nhận số và đơn vị trước mọi lượt ghi; bấm Sửa số lượng chưa thay kho.
- Phiếu mới lưu thêm `receiveUnitName`, `receiveUnitFactor`, `qtyGoodReceived`, `qtyDamagedReceived` ngay trên từng dòng, bên cạnh lượng nền cũ. Dữ liệu cũ vẫn đọc như trước. Mã nghiệp vụ/ledger/PO/chống retry không đổi, không thêm bảng hoặc truy vấn.

## Phiếu đã nhận sai

Bản vá chỉ ngăn nhận mới sai; không tự giảm tồn hay huỷ tem đang có. Dùng **quanlygieo → Kho → Đặt & nhận hàng → Sửa phiếu nhận**, chọn đúng phiếu và dòng, kiểm tra số mã đã mở/đã dùng, nhập số đúng theo đơn vị màn sửa hiển thị và ghi lý do. Công cụ hiện có phối hợp sửa phiếu/đơn/ledger/tem qua engine, huỷ tem sealed chưa dùng trước; nếu đã dùng nhiều hơn lượng đúng thì phải đối soát, không tự xoá mã đã dùng.

Không nhận thêm một phiếu “6 bịch” để bù, vì sẽ cộng tồn lần nữa. Chưa có phiếu sự cố cụ thể và không thực hiện bất kỳ thao tác sửa dữ liệu thật nào.

## Kiểm chứng

`node tests/nhan_hang_don_vi.test.js`: chạy hàm POS thật và engine v18 trên Firebase giả nghiêm. Kiểm 6 Bịch/1 Thùng/đơn đặt Bịch/đặt Thùng nhận Bịch, cảnh báo giao dư và huỷ trước ghi, nhận hỏng, PO lỗi mạng rồi retry, không đổi đơn vị dòng đã ghi, lượng/quy cách sai, lon/cái rời. Đối chiếu tồn thật của fake, phiếu, trạng thái PO và số/dung lượng mã, không chỉ kiểm giao diện.

Sinh lại `_thu` và ba bộ deploy bằng `sh tools/sinh_lai_tat_ca.sh`. Chủ quán tự deploy Hosting.

Kết quả kiểm 19/10: bộ test đầy đủ `TẤT CẢ ĐẠT`; ranh giới engine và đường dẫn sạch; ba fixture deploy hợp lệ. `tools/nhan_hang/e2e_don_vi.js` đạt 36 kiểm tra Chromium ở 1366×768, 768×1024, 390×844 và 320×640: nhập/đổi đơn vị, nhãn/preview, giữ focus và không tràn ngang. Browser chỉ chạy màn/hàm/CSS thật với fixture tại máy; chưa kiểm trên APK hoặc dữ liệu của phiếu sự cố.
