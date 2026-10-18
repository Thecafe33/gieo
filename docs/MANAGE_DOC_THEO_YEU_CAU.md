# Manage — đọc phần bổ sung theo yêu cầu (18/10/2026)

## Đã rà và thay đổi

1. **So sánh hôm trước ở Tổng quan**: chủ dự án chốt khôi phục cách cũ vì nút tải riêng rườm rà. Kỳ Hôm nay/Hôm qua tự đọc thêm ngày trước và hiển thị so sánh như trước; không còn nút tải riêng. Bộ đệm doanh thu hiện có vẫn được dùng. Các tối ưu tạm tính tháng dưới đây giữ nguyên.
2. **Tổng kết tháng**: trước đây `readMonthClose` nghe sổ đã chốt rồi tự chạy `readMonthTcx` của cả TC33 lẫn XOFA chưa chốt. Nay chỉ nghe sổ đã chốt làm số chính. Mỗi quán chưa chốt có nút **Xem tạm tính** riêng; bấm TC33 không đọc chi phí/chấm công/bill của XOFA. Chưa tải được ghi rõ **Chưa tải tạm tính**, không coi là lỗi hoặc số 0. Gieo tiếp tục chỉ dùng sổ đã chốt ở quanlygieo, không tự tính tháng ở manage.
3. **Dùng lại và thử lại**: tạm tính giữ trong bộ nhớ phiên theo tháng + quán. Vẽ lại/quay lại không tính lại. Có nút **Tính lại quán này**; lỗi chỉ thử lại quán đó. Bấm lặp trong lúc chờ gộp vào lượt đang chạy. Tải lại tháng trên header bỏ đệm tạm tính và trở về sổ chính; không tự mở các bản tạm tính chưa yêu cầu.
4. **Sau khi sửa số liệu**: thay đổi chi phí/tài sản/chấm công/lương qua các luồng ghi hiện có sẽ bỏ đệm tạm tính tháng. Lưu lương tháng/Mở lại chỉ cập nhật bản tạm tính của quán vừa thao tác; chốt tháng vẫn tính mới trước khi đóng băng theo cơ chế cũ. Lượt cũ không hồi sinh đệm đã xoá, thao tác tháng cũ không mở bản tạm tính tháng mới.

## Giữ nguyên

- Doanh thu kỳ hiện tại, mục tiêu, hoà vốn và P&L đang hiện ở Tổng quan vẫn cần nguồn đầy đủ. Không bỏ chi phí hoặc hiểu phần chưa tải là 0 để giảm lượt đọc.
- Bill chung tiếp tục nghe các sự kiện RT có giới hạn và cập nhật đúng widget quán đó cùng tổng. Không thêm listener hoặc bộ hẹn giờ đọc dữ liệu mới.
- Không thay công thức, trường chốt sổ, cơ chế thu hồi vốn, bộ `lai_lo.v4.js`, engine hoặc đường dẫn dữ liệu.
- Sổ tháng đã chốt vẫn được nghe khi đang mở tab, gỡ khi rời tab như trước. Bản tạm tính là số đã tải; dữ liệu được sửa từ máy khác thì bấm Tính lại quán này để lấy mới.

## Kiểm chứng

- `tests/manage_doc_theo_bam.test.js`: đếm lời gọi, chỉ đúng quán, bộ đệm, gộp yêu cầu, lỗi, invalidation và kết quả trả chậm.
- `tools/ql_giao_dien/e2e_manage_doc.js`: Chromium PC/tablet/mobile, nút bấm thật, đếm đọc Firebase giả, kiểm TC33 không đọc chi phí XOFA và không tràn ngang.
- `tools/ql_giao_dien/e2e_bill_realtime.js`: hồi quy cập nhật bill/chỉ số, giữ widget quán khác và không phát sinh đọc khi bill về.

Sinh lại mọi bộ mùa bằng `tools/sinh_lai_tat_ca.sh`. Gói tải đợt này chỉ có `manage.html` từ bộ deploy Giáng sinh; không có thay đổi mới ở quanlygieo. Không deploy Hosting hay ghi dữ liệu quán thật trong quá trình kiểm thử.
